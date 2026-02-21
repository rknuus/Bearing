package access

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/rkn/bearing/internal/utilities"
)

// IPlanAccess defines the interface for plan data access operations.
// All write operations use git versioning through transactions.
type IPlanAccess interface {
	// Themes
	GetThemes() ([]LifeTheme, error)
	SaveTheme(theme LifeTheme) error
	DeleteTheme(id string) error

	// Calendar
	GetDayFocus(date string) (*DayFocus, error)
	SaveDayFocus(day DayFocus) error
	GetYearFocus(year int) ([]DayFocus, error)

	// Tasks
	GetTasksByTheme(themeID string) ([]Task, error)
	GetTasksByStatus(themeID, status string) ([]Task, error)
	SaveTask(task Task) error
	SaveTaskWithOrder(task Task, dropZone string) (*Task, error)
	MoveTask(taskID, newStatus string) error
	DeleteTask(taskID string) error
	DeleteTaskWithOrder(taskID string) error

	// Task Order
	LoadTaskOrder() (map[string][]string, error)
	SaveTaskOrder(order map[string][]string) error

	// Board Configuration
	GetBoardConfiguration() (*BoardConfiguration, error)

	// Navigation
	LoadNavigationContext() (*NavigationContext, error)
	SaveNavigationContext(ctx NavigationContext) error
}

// PlanAccess implements IPlanAccess with file-based storage and git versioning.
type PlanAccess struct {
	dataPath string
	repo     utilities.IRepository
}

// NewPlanAccess creates a new PlanAccess instance.
// dataPath is the root directory for data storage.
// repo is the versioning repository for git operations.
func NewPlanAccess(dataPath string, repo utilities.IRepository) (*PlanAccess, error) {
	if dataPath == "" {
		return nil, fmt.Errorf("PlanAccess.New: dataPath cannot be empty")
	}
	if repo == nil {
		return nil, fmt.Errorf("PlanAccess.New: repo cannot be nil")
	}

	pa := &PlanAccess{
		dataPath: dataPath,
		repo:     repo,
	}

	// Ensure directory structure exists
	if err := pa.ensureDirectoryStructure(); err != nil {
		return nil, fmt.Errorf("PlanAccess.New: failed to create directory structure: %w", err)
	}

	return pa, nil
}

// ensureDirectoryStructure creates the required directory structure if it doesn't exist.
func (pa *PlanAccess) ensureDirectoryStructure() error {
	dirs := []string{
		filepath.Join(pa.dataPath, "themes"),
		filepath.Join(pa.dataPath, "calendar"),
		filepath.Join(pa.dataPath, "tasks"),
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}

	// Create .gitignore if it doesn't exist (excludes non-versioned files)
	gitignorePath := filepath.Join(pa.dataPath, ".gitignore")
	if _, err := os.Stat(gitignorePath); os.IsNotExist(err) {
		if err := os.WriteFile(gitignorePath, []byte("navigation_context.json\n"), 0644); err != nil {
			return fmt.Errorf("failed to create .gitignore: %w", err)
		}
	}

	return nil
}

// themesFilePath returns the path to the themes.json file.
func (pa *PlanAccess) themesFilePath() string {
	return filepath.Join(pa.dataPath, "themes", "themes.json")
}

// yearFocusFilePath returns the path to a year's calendar file.
func (pa *PlanAccess) yearFocusFilePath(year int) string {
	return filepath.Join(pa.dataPath, "calendar", fmt.Sprintf("%d.json", year))
}

// taskFilePath returns the path to a task file based on theme and status.
func (pa *PlanAccess) taskFilePath(themeID, status, taskID string) string {
	return filepath.Join(pa.dataPath, "tasks", themeID, status, taskID+".json")
}

// taskDirPath returns the path to a task status directory for a theme.
func (pa *PlanAccess) taskDirPath(themeID, status string) string {
	return filepath.Join(pa.dataPath, "tasks", themeID, status)
}

// relativePathFromData returns the path relative to the repository root for git operations.
func (pa *PlanAccess) relativePathFromRepo(absPath string) (string, error) {
	repoPath := pa.repo.Path()
	relPath, err := filepath.Rel(repoPath, absPath)
	if err != nil {
		return "", fmt.Errorf("failed to get relative path: %w", err)
	}
	return relPath, nil
}

// writeJSON marshals v as indented JSON and writes it to filePath.
func writeJSON(filePath string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal JSON: %w", err)
	}
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}
	return nil
}

// commitFiles resolves paths relative to the repository, begins a transaction,
// stages the given absolute file paths, and commits with the provided message.
func (pa *PlanAccess) commitFiles(paths []string, message string) error {
	relPaths := make([]string, 0, len(paths))
	for _, p := range paths {
		rel, err := pa.relativePathFromRepo(p)
		if err != nil {
			return fmt.Errorf("failed to get relative path: %w", err)
		}
		relPaths = append(relPaths, rel)
	}

	tx, err := pa.repo.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	if err := tx.Stage(relPaths); err != nil {
		_ = tx.Cancel()
		return fmt.Errorf("failed to stage files: %w", err)
	}

	if _, err := tx.Commit(message); err != nil {
		return fmt.Errorf("failed to commit: %w", err)
	}

	return nil
}

// findTaskInPlan searches all themes and statuses for a task by ID.
// Returns the task, theme ID, status name, and task index within the status list.
func (pa *PlanAccess) findTaskInPlan(taskID string) (*Task, string, string, int, error) {
	themes, err := pa.GetThemes()
	if err != nil {
		return nil, "", "", -1, fmt.Errorf("failed to get themes: %w", err)
	}

	for _, theme := range themes {
		for _, status := range ValidTaskStatuses() {
			tasks, err := pa.GetTasksByStatus(theme.ID, string(status))
			if err != nil {
				continue
			}
			for i, task := range tasks {
				if task.ID == taskID {
					return &task, theme.ID, string(status), i, nil
				}
			}
		}
	}

	return nil, "", "", -1, nil
}

// GetThemes returns all life themes.
func (pa *PlanAccess) GetThemes() ([]LifeTheme, error) {
	filePath := pa.themesFilePath()

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []LifeTheme{}, nil
		}
		return nil, fmt.Errorf("PlanAccess.GetThemes: failed to read themes file: %w", err)
	}

	var themesFile ThemesFile
	if err := json.Unmarshal(data, &themesFile); err != nil {
		return nil, fmt.Errorf("PlanAccess.GetThemes: failed to parse themes file: %w", err)
	}

	return themesFile.Themes, nil
}

// SaveTheme saves or updates a life theme.
// If the theme ID is empty, a new ID will be generated.
func (pa *PlanAccess) SaveTheme(theme LifeTheme) error {
	themes, err := pa.GetThemes()
	if err != nil {
		return fmt.Errorf("PlanAccess.SaveTheme: failed to get existing themes: %w", err)
	}

	// Generate ID if not provided
	if theme.ID == "" {
		theme.ID = SuggestAbbreviation(theme.Name, themes)
	}

	// Ensure objective and key result IDs are generated
	theme = pa.ensureThemeIDs(theme, themes)

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
	filePath := pa.themesFilePath()
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return fmt.Errorf("PlanAccess.SaveTheme: failed to create themes directory: %w", err)
	}

	if err := writeJSON(filePath, ThemesFile{Themes: themes}); err != nil {
		return fmt.Errorf("PlanAccess.SaveTheme: %w", err)
	}

	// Commit with git
	action := "Update"
	if !found {
		action = "Add"
	}
	if err := pa.commitFiles([]string{filePath}, fmt.Sprintf("%s theme: %s", action, theme.Name)); err != nil {
		return fmt.Errorf("PlanAccess.SaveTheme: %w", err)
	}

	return nil
}

// DeleteTheme deletes a life theme by ID.
func (pa *PlanAccess) DeleteTheme(id string) error {
	themes, err := pa.GetThemes()
	if err != nil {
		return fmt.Errorf("PlanAccess.DeleteTheme: failed to get existing themes: %w", err)
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
		return fmt.Errorf("PlanAccess.DeleteTheme: theme with ID %s not found", id)
	}

	// Save updated themes
	filePath := pa.themesFilePath()
	if err := writeJSON(filePath, ThemesFile{Themes: newThemes}); err != nil {
		return fmt.Errorf("PlanAccess.DeleteTheme: %w", err)
	}

	// Commit with git
	if err := pa.commitFiles([]string{filePath}, fmt.Sprintf("Delete theme: %s", deletedTheme.Name)); err != nil {
		return fmt.Errorf("PlanAccess.DeleteTheme: %w", err)
	}

	return nil
}

// GetDayFocus returns the day focus for a specific date.
func (pa *PlanAccess) GetDayFocus(date string) (*DayFocus, error) {
	year, err := pa.extractYearFromDate(date)
	if err != nil {
		return nil, fmt.Errorf("PlanAccess.GetDayFocus: invalid date format: %w", err)
	}

	entries, err := pa.GetYearFocus(year)
	if err != nil {
		return nil, fmt.Errorf("PlanAccess.GetDayFocus: failed to get year focus: %w", err)
	}

	for _, entry := range entries {
		if entry.Date == date {
			return &entry, nil
		}
	}

	return nil, nil
}

// SaveDayFocus saves or updates a day focus entry.
func (pa *PlanAccess) SaveDayFocus(day DayFocus) error {
	year, err := pa.extractYearFromDate(day.Date)
	if err != nil {
		return fmt.Errorf("PlanAccess.SaveDayFocus: invalid date format: %w", err)
	}

	entries, err := pa.GetYearFocus(year)
	if err != nil {
		return fmt.Errorf("PlanAccess.SaveDayFocus: failed to get year focus: %w", err)
	}

	// Find and update existing entry, or add new one
	found := false
	for i, e := range entries {
		if e.Date == day.Date {
			entries[i] = day
			found = true
			break
		}
	}
	if !found {
		entries = append(entries, day)
	}

	// Sort entries by date
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Date < entries[j].Date
	})

	// Save to file
	filePath := pa.yearFocusFilePath(year)
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return fmt.Errorf("PlanAccess.SaveDayFocus: failed to create calendar directory: %w", err)
	}

	if err := writeJSON(filePath, YearFocusFile{Year: year, Entries: entries}); err != nil {
		return fmt.Errorf("PlanAccess.SaveDayFocus: %w", err)
	}

	// Commit with git
	action := "Update"
	if !found {
		action = "Add"
	}
	if err := pa.commitFiles([]string{filePath}, fmt.Sprintf("%s day focus: %s", action, day.Date)); err != nil {
		return fmt.Errorf("PlanAccess.SaveDayFocus: %w", err)
	}

	return nil
}

// GetYearFocus returns all day focus entries for a specific year.
func (pa *PlanAccess) GetYearFocus(year int) ([]DayFocus, error) {
	filePath := pa.yearFocusFilePath(year)

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []DayFocus{}, nil
		}
		return nil, fmt.Errorf("PlanAccess.GetYearFocus: failed to read year focus file: %w", err)
	}

	var yearFile YearFocusFile
	if err := json.Unmarshal(data, &yearFile); err != nil {
		return nil, fmt.Errorf("PlanAccess.GetYearFocus: failed to parse year focus file: %w", err)
	}

	return yearFile.Entries, nil
}

// GetTasksByTheme returns all tasks for a specific theme.
func (pa *PlanAccess) GetTasksByTheme(themeID string) ([]Task, error) {
	var allTasks []Task

	for _, status := range ValidTaskStatuses() {
		tasks, err := pa.GetTasksByStatus(themeID, string(status))
		if err != nil {
			return nil, fmt.Errorf("PlanAccess.GetTasksByTheme: failed to get tasks with status %s: %w", status, err)
		}
		allTasks = append(allTasks, tasks...)
	}

	return allTasks, nil
}

// GetTasksByStatus returns all tasks for a specific theme and status.
func (pa *PlanAccess) GetTasksByStatus(themeID, status string) ([]Task, error) {
	if !IsValidTaskStatus(status) {
		return nil, fmt.Errorf("PlanAccess.GetTasksByStatus: invalid status %s", status)
	}

	dirPath := pa.taskDirPath(themeID, status)

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []Task{}, nil
		}
		return nil, fmt.Errorf("PlanAccess.GetTasksByStatus: failed to read task directory: %w", err)
	}

	var tasks []Task
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		filePath := filepath.Join(dirPath, entry.Name())
		data, err := os.ReadFile(filePath)
		if err != nil {
			return nil, fmt.Errorf("PlanAccess.GetTasksByStatus: failed to read task file %s: %w", filePath, err)
		}

		var task Task
		if err := json.Unmarshal(data, &task); err != nil {
			return nil, fmt.Errorf("PlanAccess.GetTasksByStatus: failed to parse task file %s: %w", filePath, err)
		}

		tasks = append(tasks, task)
	}

	return tasks, nil
}

// saveTaskFile writes a task to disk without committing.
// Returns the file path and whether the task is new.
func (pa *PlanAccess) saveTaskFile(task *Task) (string, bool, error) {
	if task.ThemeID == "" {
		return "", false, fmt.Errorf("PlanAccess.saveTaskFile: themeID cannot be empty")
	}

	now := time.Now().UTC().Format(time.RFC3339)
	isNew := task.ID == ""

	// Generate ID if not provided
	if isNew {
		existingTasks, err := pa.GetTasksByTheme(task.ThemeID)
		if err != nil {
			return "", false, fmt.Errorf("PlanAccess.saveTaskFile: failed to get existing tasks: %w", err)
		}
		task.ID = pa.generateTaskID(task.ThemeID, existingTasks)
	}

	// Set timestamps
	if task.CreatedAt == "" {
		task.CreatedAt = now
	}
	task.UpdatedAt = now

	// Determine status - find existing task or default to todo
	status := string(TaskStatusTodo)
	existingStatus, err := pa.findTaskStatus(task.ID, task.ThemeID)
	if err != nil {
		return "", false, fmt.Errorf("PlanAccess.saveTaskFile: failed to find existing task status: %w", err)
	}
	if existingStatus != "" {
		status = existingStatus
	}

	// Ensure task directory exists
	dirPath := pa.taskDirPath(task.ThemeID, status)
	if err := os.MkdirAll(dirPath, 0755); err != nil {
		return "", false, fmt.Errorf("PlanAccess.saveTaskFile: failed to create task directory: %w", err)
	}

	// Save task to file
	filePath := pa.taskFilePath(task.ThemeID, status, task.ID)
	if err := writeJSON(filePath, *task); err != nil {
		return "", false, fmt.Errorf("PlanAccess.saveTaskFile: %w", err)
	}

	return filePath, isNew, nil
}

// SaveTask saves or updates a task.
// If the task ID is empty, a new ID will be generated and CreatedAt is set.
// UpdatedAt is always set to the current time on every save.
func (pa *PlanAccess) SaveTask(task Task) error {
	filePath, isNew, err := pa.saveTaskFile(&task)
	if err != nil {
		return fmt.Errorf("PlanAccess.SaveTask: %w", err)
	}

	// Commit with git
	action := "Update"
	if isNew {
		action = "Add"
	}
	if err := pa.commitFiles([]string{filePath}, fmt.Sprintf("%s task: %s", action, task.Title)); err != nil {
		return fmt.Errorf("PlanAccess.SaveTask: %w", err)
	}

	return nil
}

// SaveTaskWithOrder atomically saves a task and appends it to the task order
// in a single git commit. This prevents race conditions when creating multiple
// tasks concurrently.
func (pa *PlanAccess) SaveTaskWithOrder(task Task, dropZone string) (*Task, error) {
	taskFilePath, isNew, err := pa.saveTaskFile(&task)
	if err != nil {
		return nil, fmt.Errorf("PlanAccess.SaveTaskWithOrder: %w", err)
	}

	// Load current order, append task ID, and write order file
	orderMap, err := pa.LoadTaskOrder()
	if err != nil {
		return nil, fmt.Errorf("PlanAccess.SaveTaskWithOrder: failed to load task order: %w", err)
	}
	orderMap[dropZone] = append(orderMap[dropZone], task.ID)

	orderFilePath := pa.taskOrderFilePath()
	if err := writeJSON(orderFilePath, orderMap); err != nil {
		return nil, fmt.Errorf("PlanAccess.SaveTaskWithOrder: failed to write task order: %w", err)
	}

	// Commit both files in a single transaction
	action := "Update"
	if isNew {
		action = "Add"
	}
	if err := pa.commitFiles([]string{taskFilePath, orderFilePath}, fmt.Sprintf("%s task: %s", action, task.Title)); err != nil {
		return nil, fmt.Errorf("PlanAccess.SaveTaskWithOrder: %w", err)
	}

	return &task, nil
}

// DeleteTaskWithOrder atomically deletes a task file and removes it from the
// task order in a single git commit.
func (pa *PlanAccess) DeleteTaskWithOrder(taskID string) error {
	// Find the task
	foundTask, themeID, currentStatus, _, err := pa.findTaskInPlan(taskID)
	if err != nil {
		return fmt.Errorf("PlanAccess.DeleteTaskWithOrder: %w", err)
	}
	if foundTask == nil {
		return fmt.Errorf("PlanAccess.DeleteTaskWithOrder: task with ID %s not found", taskID)
	}

	filePath := pa.taskFilePath(themeID, currentStatus, taskID)

	// Delete the file
	if err := os.Remove(filePath); err != nil {
		return fmt.Errorf("PlanAccess.DeleteTaskWithOrder: failed to delete task file: %w", err)
	}

	// Remove from task order
	commitPaths := []string{filePath}
	orderMap, loadErr := pa.LoadTaskOrder()
	if loadErr == nil {
		changed := false
		for zone, ids := range orderMap {
			filtered := make([]string, 0, len(ids))
			for _, id := range ids {
				if id != taskID {
					filtered = append(filtered, id)
				}
			}
			if len(filtered) != len(ids) {
				orderMap[zone] = filtered
				changed = true
			}
		}
		if changed {
			orderFilePath := pa.taskOrderFilePath()
			if err := writeJSON(orderFilePath, orderMap); err != nil {
				return fmt.Errorf("PlanAccess.DeleteTaskWithOrder: failed to write task order: %w", err)
			}
			commitPaths = append(commitPaths, orderFilePath)
		}
	}

	// Commit with git
	if err := pa.commitFiles(commitPaths, fmt.Sprintf("Delete task: %s", foundTask.Title)); err != nil {
		return fmt.Errorf("PlanAccess.DeleteTaskWithOrder: %w", err)
	}

	return nil
}

// MoveTask moves a task to a new status using git mv.
func (pa *PlanAccess) MoveTask(taskID, newStatus string) error {
	if !IsValidTaskStatus(newStatus) {
		return fmt.Errorf("PlanAccess.MoveTask: invalid status %s", newStatus)
	}

	// Find the task and its current status
	foundTask, themeID, currentStatus, _, err := pa.findTaskInPlan(taskID)
	if err != nil {
		return fmt.Errorf("PlanAccess.MoveTask: %w", err)
	}
	if foundTask == nil {
		return fmt.Errorf("PlanAccess.MoveTask: task with ID %s not found", taskID)
	}

	if currentStatus == newStatus {
		return nil // Already in the desired status
	}

	// Ensure destination directory exists
	destDir := pa.taskDirPath(themeID, newStatus)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return fmt.Errorf("PlanAccess.MoveTask: failed to create destination directory: %w", err)
	}

	// Calculate paths
	oldPath := pa.taskFilePath(themeID, currentStatus, taskID)
	newPath := pa.taskFilePath(themeID, newStatus, taskID)

	// Perform git mv by renaming and staging both old and new paths
	if err := os.Rename(oldPath, newPath); err != nil {
		return fmt.Errorf("PlanAccess.MoveTask: failed to move task file: %w", err)
	}

	// Commit with git - stage both the removal of old and addition of new
	if err := pa.commitFiles([]string{newPath, oldPath}, fmt.Sprintf("Move task %s: %s -> %s", foundTask.Title, currentStatus, newStatus)); err != nil {
		return fmt.Errorf("PlanAccess.MoveTask: %w", err)
	}

	return nil
}

// DeleteTask deletes a task.
func (pa *PlanAccess) DeleteTask(taskID string) error {
	// Find the task
	foundTask, themeID, currentStatus, _, err := pa.findTaskInPlan(taskID)
	if err != nil {
		return fmt.Errorf("PlanAccess.DeleteTask: %w", err)
	}
	if foundTask == nil {
		return fmt.Errorf("PlanAccess.DeleteTask: task with ID %s not found", taskID)
	}

	filePath := pa.taskFilePath(themeID, currentStatus, taskID)

	// Delete the file
	if err := os.Remove(filePath); err != nil {
		return fmt.Errorf("PlanAccess.DeleteTask: failed to delete task file: %w", err)
	}

	// Commit with git
	if err := pa.commitFiles([]string{filePath}, fmt.Sprintf("Delete task: %s", foundTask.Title)); err != nil {
		return fmt.Errorf("PlanAccess.DeleteTask: %w", err)
	}

	return nil
}

// GetBoardConfiguration returns the static board configuration.
func (pa *PlanAccess) GetBoardConfiguration() (*BoardConfiguration, error) {
	return DefaultBoardConfiguration(), nil
}

// Helper functions

// extractYearFromDate extracts the year from a YYYY-MM-DD date string.
func (pa *PlanAccess) extractYearFromDate(date string) (int, error) {
	if len(date) < 4 {
		return 0, fmt.Errorf("date too short: %s", date)
	}

	year, err := strconv.Atoi(date[:4])
	if err != nil {
		return 0, fmt.Errorf("invalid year in date: %s", date)
	}

	return year, nil
}

// IsValidThemeID checks whether an ID matches the theme abbreviation format (1-3 uppercase letters).
func IsValidThemeID(id string) bool {
	matched, _ := regexp.MatchString(`^[A-Z]{1,3}$`, id)
	return matched
}

// ExtractThemeAbbr extracts the theme abbreviation from any theme-scoped ID.
// For a theme ID like "H", returns "H". For "H-O1", returns "H". For "CF-KR2", returns "CF".
// Returns empty string if the ID doesn't match any known pattern.
func ExtractThemeAbbr(id string) string {
	if IsValidThemeID(id) {
		return id
	}
	re := regexp.MustCompile(`^([A-Z]{1,3})-(?:O|KR|T)\d+$`)
	matches := re.FindStringSubmatch(id)
	if len(matches) == 2 {
		return matches[1]
	}
	return ""
}

// SuggestAbbreviation generates a 1-3 letter abbreviation from a theme name,
// ensuring uniqueness among existing themes.
func SuggestAbbreviation(name string, existingThemes []LifeTheme) string {
	existing := make(map[string]bool)
	for _, t := range existingThemes {
		existing[t.ID] = true
	}

	words := strings.Fields(name)

	// Multi-word: take first letter of each word (up to 3)
	if len(words) > 1 {
		candidate := ""
		for i, w := range words {
			if i >= 3 {
				break
			}
			candidate += strings.ToUpper(w[:1])
		}
		if !existing[candidate] {
			return candidate
		}
	}

	// Single word or multi-word collision: try first 1, 2, 3 letters of first word
	upper := strings.ToUpper(words[0])
	for length := 1; length <= 3 && length <= len(upper); length++ {
		candidate := upper[:length]
		if !existing[candidate] {
			return candidate
		}
	}

	// Fallback: try 2-letter combinations with second letter varying
	if len(upper) >= 1 {
		first := string(upper[0])
		for c := 'A'; c <= 'Z'; c++ {
			candidate := first + string(c)
			if !existing[candidate] {
				return candidate
			}
		}
	}

	// Last resort: try all 3-letter combinations starting with first letter
	if len(upper) >= 1 {
		first := string(upper[0])
		for c1 := 'A'; c1 <= 'Z'; c1++ {
			for c2 := 'A'; c2 <= 'Z'; c2++ {
				candidate := first + string(c1) + string(c2)
				if !existing[candidate] {
					return candidate
				}
			}
		}
	}

	return "X"
}

// ensureThemeIDs ensures all objectives and key results within a theme have proper IDs.
// Counters are per-theme scoped — only this theme's entities are scanned.
func (pa *PlanAccess) ensureThemeIDs(theme LifeTheme, allThemes []LifeTheme) LifeTheme {
	abbr := theme.ID

	// Collect max counters scoped to this theme only
	maxOBJ := collectMaxObjNum(abbr, theme)
	maxKR := collectMaxKRNum(abbr, theme)

	theme.Objectives, _, _ = pa.ensureObjectiveIDs(abbr, theme.ID, theme.Objectives, maxOBJ, maxKR)
	return theme
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

// ensureObjectiveIDs recursively assigns theme-scoped IDs to objectives and their key results.
// abbr is the theme abbreviation used as prefix. parentID is the ID of the parent entity.
// maxOBJ and maxKR are the current per-theme counters, returned updated after assignment.
func (pa *PlanAccess) ensureObjectiveIDs(abbr, parentID string, objectives []Objective, maxOBJ, maxKR int) ([]Objective, int, int) {
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
		obj.Objectives, maxOBJ, maxKR = pa.ensureObjectiveIDs(abbr, obj.ID, obj.Objectives, maxOBJ, maxKR)
	}

	return objectives, maxOBJ, maxKR
}

// generateTaskID generates a new theme-scoped task ID based on existing tasks.
func (pa *PlanAccess) generateTaskID(themeAbbr string, existingTasks []Task) string {
	maxNum := 0
	re := regexp.MustCompile(`^` + regexp.QuoteMeta(themeAbbr) + `-T(\d+)$`)

	for _, task := range existingTasks {
		matches := re.FindStringSubmatch(task.ID)
		if len(matches) == 2 {
			num, err := strconv.Atoi(matches[1])
			if err == nil && num > maxNum {
				maxNum = num
			}
		}
	}

	return fmt.Sprintf("%s-T%d", themeAbbr, maxNum+1)
}

// findTaskStatus finds the current status of a task by searching through all themes and statuses.
func (pa *PlanAccess) findTaskStatus(taskID, themeID string) (string, error) {
	_, _, status, _, err := pa.findTaskInPlan(taskID)
	if err != nil {
		return "", err
	}
	return status, nil
}

// taskOrderFilePath returns the path to the task_order.json file.
func (pa *PlanAccess) taskOrderFilePath() string {
	return filepath.Join(pa.dataPath, "task_order.json")
}

// LoadTaskOrder reads task_order.json and returns the order map.
// Returns an empty map if the file doesn't exist.
func (pa *PlanAccess) LoadTaskOrder() (map[string][]string, error) {
	filePath := pa.taskOrderFilePath()

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return make(map[string][]string), nil
		}
		return nil, fmt.Errorf("PlanAccess.LoadTaskOrder: failed to read file: %w", err)
	}

	var order map[string][]string
	if err := json.Unmarshal(data, &order); err != nil {
		return nil, fmt.Errorf("PlanAccess.LoadTaskOrder: failed to parse file: %w", err)
	}

	if order == nil {
		return make(map[string][]string), nil
	}
	return order, nil
}

// SaveTaskOrder writes the order map to task_order.json and git-commits.
func (pa *PlanAccess) SaveTaskOrder(order map[string][]string) error {
	filePath := pa.taskOrderFilePath()

	if err := writeJSON(filePath, order); err != nil {
		return fmt.Errorf("PlanAccess.SaveTaskOrder: %w", err)
	}

	if err := pa.commitFiles([]string{filePath}, "Update task order"); err != nil {
		return fmt.Errorf("PlanAccess.SaveTaskOrder: %w", err)
	}

	return nil
}

// navigationContextFilePath returns the path to the navigation context file.
func (pa *PlanAccess) navigationContextFilePath() string {
	return filepath.Join(pa.dataPath, "navigation_context.json")
}

// LoadNavigationContext retrieves the saved navigation context.
func (pa *PlanAccess) LoadNavigationContext() (*NavigationContext, error) {
	filePath := pa.navigationContextFilePath()

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("PlanAccess.LoadNavigationContext: failed to read file: %w", err)
	}

	var ctx NavigationContext
	if err := json.Unmarshal(data, &ctx); err != nil {
		return nil, fmt.Errorf("PlanAccess.LoadNavigationContext: failed to parse file: %w", err)
	}

	return &ctx, nil
}

// SaveNavigationContext persists the navigation context.
// Note: This is user preference data, not versioned with git.
func (pa *PlanAccess) SaveNavigationContext(ctx NavigationContext) error {
	filePath := pa.navigationContextFilePath()
	if err := writeJSON(filePath, ctx); err != nil {
		return fmt.Errorf("PlanAccess.SaveNavigationContext: %w", err)
	}

	return nil
}
