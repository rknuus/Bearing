package access

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"sync"

	"github.com/rkn/bearing/internal/utilities"
)

// IThemeAccess defines the interface for theme data access operations.
// All write operations use git versioning through transactions.
type IThemeAccess interface {
	GetThemes() ([]LifeTheme, error)
	SaveTheme(theme LifeTheme) error
	DeleteTheme(id string) error
}

// ThemeAccess implements IThemeAccess with file-based storage and git versioning.
//
// Concurrency: mu serialises the full read-modify-write cycle on themes.json
// (GetThemes -> mutate -> writeJSON -> commitFiles). Without it, two goroutines
// could each read the same baseline, mutate independent copies, and have one
// SaveTheme/DeleteTheme overwrite the other's changes.
//
// Lock ordering invariant: ThemeAccess.mu is always acquired BEFORE any
// Repository lock taken inside commitFiles. No code path acquires the repo
// lock and then ThemeAccess.mu, which would invert this ordering and risk a
// deadlock with another path holding mu while waiting on the repo lock.
type ThemeAccess struct {
	dataPath string
	repo     utilities.IRepository
	mu       sync.Mutex
}

// NewThemeAccess creates a new ThemeAccess instance.
func NewThemeAccess(dataPath string, repo utilities.IRepository) (*ThemeAccess, error) {
	if dataPath == "" {
		return nil, fmt.Errorf("ThemeAccess.New: dataPath cannot be empty")
	}
	if repo == nil {
		return nil, fmt.Errorf("ThemeAccess.New: repo cannot be nil")
	}

	ta := &ThemeAccess{
		dataPath: dataPath,
		repo:     repo,
	}

	// Ensure themes directory exists
	if err := ensureDir(filepath.Join(dataPath, "themes")); err != nil {
		return nil, fmt.Errorf("ThemeAccess.New: %w", err)
	}

	return ta, nil
}

// themesFilePath returns the path to the themes.json file.
func (ta *ThemeAccess) themesFilePath() string {
	return filepath.Join(ta.dataPath, "themes", "themes.json")
}

// GetThemes returns all life themes.
func (ta *ThemeAccess) GetThemes() ([]LifeTheme, error) {
	ta.mu.Lock()
	defer ta.mu.Unlock()
	return ta.getThemesLocked()
}

// getThemesLocked reads themes.json and returns its contents. Callers must
// already hold ta.mu. This exists so RMW methods (SaveTheme, DeleteTheme) can
// reuse the read step without re-entering ta.mu (sync.Mutex is not reentrant).
func (ta *ThemeAccess) getThemesLocked() ([]LifeTheme, error) {
	filePath := ta.themesFilePath()

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []LifeTheme{}, nil
		}
		return nil, fmt.Errorf("ThemeAccess.GetThemes: failed to read themes file: %w", err)
	}

	var themesFile ThemesFile
	if err := json.Unmarshal(data, &themesFile); err != nil {
		return nil, fmt.Errorf("ThemeAccess.GetThemes: failed to parse themes file: %w", err)
	}

	return themesFile.Themes, nil
}

// SaveTheme saves or updates a life theme.
// The theme ID must be set by the caller.
//
// Holds ta.mu for the full read-modify-write cycle so concurrent SaveTheme /
// DeleteTheme calls cannot lose each other's edits. See the lock-ordering
// note on ThemeAccess: mu is acquired BEFORE the repo lock used by
// commitFiles.
func (ta *ThemeAccess) SaveTheme(theme LifeTheme) error {
	if theme.ID == "" {
		return fmt.Errorf("ThemeAccess.SaveTheme: theme ID cannot be empty")
	}

	ta.mu.Lock()
	defer ta.mu.Unlock()

	themes, err := ta.getThemesLocked()
	if err != nil {
		return fmt.Errorf("ThemeAccess.SaveTheme: failed to get existing themes: %w", err)
	}

	// Ensure objective and key result IDs are generated
	theme = ta.ensureThemeIDs(theme, themes)

	// Find and update existing theme, or add new one
	found := false
	for i, t := range themes {
		if t.ID == theme.ID {
			themes[i] = theme
			found = true
			break
		}
	}
	if !found {
		themes = append(themes, theme)
	}

	// Save to file with versioning
	filePath := ta.themesFilePath()
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return fmt.Errorf("ThemeAccess.SaveTheme: failed to create themes directory: %w", err)
	}

	if err := writeJSON(filePath, ThemesFile{Themes: themes}); err != nil {
		return fmt.Errorf("ThemeAccess.SaveTheme: %w", err)
	}

	// Commit with git
	action := "Update"
	if !found {
		action = "Add"
	}
	if err := commitFiles(ta.repo, []string{filePath}, fmt.Sprintf("%s theme: %s", action, theme.Name)); err != nil {
		return fmt.Errorf("ThemeAccess.SaveTheme: %w", err)
	}

	return nil
}

// DeleteTheme deletes a life theme by ID.
//
// Holds ta.mu for the full read-modify-write cycle so a concurrent SaveTheme
// cannot resurrect a deleted theme (or vice versa).
func (ta *ThemeAccess) DeleteTheme(id string) error {
	ta.mu.Lock()
	defer ta.mu.Unlock()

	themes, err := ta.getThemesLocked()
	if err != nil {
		return fmt.Errorf("ThemeAccess.DeleteTheme: failed to get existing themes: %w", err)
	}

	// Find and remove the theme
	found := false
	var deletedTheme LifeTheme
	newThemes := make([]LifeTheme, 0, len(themes))
	for _, t := range themes {
		if t.ID == id {
			found = true
			deletedTheme = t
		} else {
			newThemes = append(newThemes, t)
		}
	}

	if !found {
		return fmt.Errorf("ThemeAccess.DeleteTheme: theme with ID %s not found", id)
	}

	// Save updated themes
	filePath := ta.themesFilePath()
	if err := writeJSON(filePath, ThemesFile{Themes: newThemes}); err != nil {
		return fmt.Errorf("ThemeAccess.DeleteTheme: %w", err)
	}

	// Commit with git
	if err := commitFiles(ta.repo, []string{filePath}, fmt.Sprintf("Delete theme: %s", deletedTheme.Name)); err != nil {
		return fmt.Errorf("ThemeAccess.DeleteTheme: %w", err)
	}

	return nil
}

// ensureThemeIDs ensures all objectives and key results within a theme have proper IDs.
// Counters are per-theme scoped — only this theme's entities are scanned.
func (ta *ThemeAccess) ensureThemeIDs(theme LifeTheme, allThemes []LifeTheme) LifeTheme {
	abbr := theme.ID

	// Collect max counters scoped to this theme only
	maxOBJ := collectMaxObjNum(abbr, theme)
	maxKR := collectMaxKRNum(abbr, theme)

	theme.Objectives, _, _ = ta.ensureObjectiveIDs(abbr, theme.ID, theme.Objectives, maxOBJ, maxKR)
	return theme
}

// ensureObjectiveIDs recursively assigns theme-scoped IDs to objectives and their key results.
// abbr is the theme abbreviation used as prefix. parentID is the ID of the parent entity.
// maxOBJ and maxKR are the current per-theme counters, returned updated after assignment.
func (ta *ThemeAccess) ensureObjectiveIDs(abbr, parentID string, objectives []Objective, maxOBJ, maxKR int) ([]Objective, int, int) {
	for i := range objectives {
		obj := &objectives[i]

		// Set ParentID to the parent's ID
		obj.ParentID = parentID

		// Assign a new theme-scoped ID if missing
		if obj.ID == "" {
			maxOBJ++
			obj.ID = fmt.Sprintf("%s-O%d", abbr, maxOBJ)
		}

		// Assign key result IDs
		for j := range obj.KeyResults {
			kr := &obj.KeyResults[j]
			kr.ParentID = obj.ID
			if kr.ID == "" {
				maxKR++
				kr.ID = fmt.Sprintf("%s-KR%d", abbr, maxKR)
			}
		}

		// Recurse into child objectives
		obj.Objectives, maxOBJ, maxKR = ta.ensureObjectiveIDs(abbr, obj.ID, obj.Objectives, maxOBJ, maxKR)
	}

	return objectives, maxOBJ, maxKR
}

// collectMaxObjNum scans objectives within a single theme to find the highest O number.
func collectMaxObjNum(abbr string, theme LifeTheme) int {
	re := regexp.MustCompile(`^` + regexp.QuoteMeta(abbr) + `-O(\d+)$`)
	return collectMaxObjNumFromObjectives(theme.Objectives, re, 0)
}

// collectMaxObjNumFromObjectives recursively scans objectives to find the highest O number.
func collectMaxObjNumFromObjectives(objectives []Objective, re *regexp.Regexp, maxNum int) int {
	for _, obj := range objectives {
		if obj.ID != "" {
			matches := re.FindStringSubmatch(obj.ID)
			if len(matches) == 2 {
				num, err := strconv.Atoi(matches[1])
				if err == nil && num > maxNum {
					maxNum = num
				}
			}
		}
		maxNum = collectMaxObjNumFromObjectives(obj.Objectives, re, maxNum)
	}
	return maxNum
}

// collectMaxKRNum scans key results within a single theme to find the highest KR number.
func collectMaxKRNum(abbr string, theme LifeTheme) int {
	re := regexp.MustCompile(`^` + regexp.QuoteMeta(abbr) + `-KR(\d+)$`)
	return collectMaxKRNumFromObjectives(theme.Objectives, re, 0)
}

// collectMaxKRNumFromObjectives recursively scans objectives and their key results
// to find the highest KR number.
func collectMaxKRNumFromObjectives(objectives []Objective, re *regexp.Regexp, maxNum int) int {
	for _, obj := range objectives {
		for _, kr := range obj.KeyResults {
			if kr.ID != "" {
				matches := re.FindStringSubmatch(kr.ID)
				if len(matches) == 2 {
					num, err := strconv.Atoi(matches[1])
					if err == nil && num > maxNum {
						maxNum = num
					}
				}
			}
		}
		maxNum = collectMaxKRNumFromObjectives(obj.Objectives, re, maxNum)
	}
	return maxNum
}
