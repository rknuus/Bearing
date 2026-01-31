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
	MoveTask(taskID, newStatus string) error
	DeleteTask(taskID string) error

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
		theme.ID = pa.generateThemeID(themes)
	}

	// Ensure objective and key result IDs are generated
	theme = pa.ensureThemeIDs(theme)

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
	themesFile := ThemesFile{Themes: themes}
	data, err := json.MarshalIndent(themesFile, "", "  ")
	if err != nil {
		return fmt.Errorf("PlanAccess.SaveTheme: failed to marshal themes: %w", err)
	}

	filePath := pa.themesFilePath()
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return fmt.Errorf("PlanAccess.SaveTheme: failed to create themes directory: %w", err)
	}

	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("PlanAccess.SaveTheme: failed to write themes file: %w", err)
	}

	// Commit with git
	relPath, err := pa.relativePathFromRepo(filePath)
	if err != nil {
		return fmt.Errorf("PlanAccess.SaveTheme: failed to get relative path: %w", err)
	}

	tx, err := pa.repo.Begin()
	if err != nil {
		return fmt.Errorf("PlanAccess.SaveTheme: failed to begin transaction: %w", err)
	}

	if err := tx.Stage([]string{relPath}); err != nil {
		tx.Cancel()
		return fmt.Errorf("PlanAccess.SaveTheme: failed to stage file: %w", err)
	}

	action := "Update"
	if !found {
		action = "Add"
	}
	_, err = tx.Commit(fmt.Sprintf("%s theme: %s", action, theme.Name))
	if err != nil {
		return fmt.Errorf("PlanAccess.SaveTheme: failed to commit: %w", err)
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
	themesFile := ThemesFile{Themes: newThemes}
	data, err := json.MarshalIndent(themesFile, "", "  ")
	if err != nil {
		return fmt.Errorf("PlanAccess.DeleteTheme: failed to marshal themes: %w", err)
	}

	filePath := pa.themesFilePath()
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("PlanAccess.DeleteTheme: failed to write themes file: %w", err)
	}

	// Commit with git
	relPath, err := pa.relativePathFromRepo(filePath)
	if err != nil {
		return fmt.Errorf("PlanAccess.DeleteTheme: failed to get relative path: %w", err)
	}

	tx, err := pa.repo.Begin()
	if err != nil {
		return fmt.Errorf("PlanAccess.DeleteTheme: failed to begin transaction: %w", err)
	}

	if err := tx.Stage([]string{relPath}); err != nil {
		tx.Cancel()
		return fmt.Errorf("PlanAccess.DeleteTheme: failed to stage file: %w", err)
	}

	_, err = tx.Commit(fmt.Sprintf("Delete theme: %s", deletedTheme.Name))
	if err != nil {
		return fmt.Errorf("PlanAccess.DeleteTheme: failed to commit: %w", err)
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
	yearFile := YearFocusFile{Year: year, Entries: entries}
	data, err := json.MarshalIndent(yearFile, "", "  ")
	if err != nil {
		return fmt.Errorf("PlanAccess.SaveDayFocus: failed to marshal year focus: %w", err)
	}

	filePath := pa.yearFocusFilePath(year)
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return fmt.Errorf("PlanAccess.SaveDayFocus: failed to create calendar directory: %w", err)
	}

	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("PlanAccess.SaveDayFocus: failed to write year focus file: %w", err)
	}

	// Commit with git
	relPath, err := pa.relativePathFromRepo(filePath)
	if err != nil {
		return fmt.Errorf("PlanAccess.SaveDayFocus: failed to get relative path: %w", err)
	}

	tx, err := pa.repo.Begin()
	if err != nil {
		return fmt.Errorf("PlanAccess.SaveDayFocus: failed to begin transaction: %w", err)
	}

	if err := tx.Stage([]string{relPath}); err != nil {
		tx.Cancel()
		return fmt.Errorf("PlanAccess.SaveDayFocus: failed to stage file: %w", err)
	}

	action := "Update"
	if !found {
		action = "Add"
	}
	_, err = tx.Commit(fmt.Sprintf("%s day focus: %s", action, day.Date))
	if err != nil {
		return fmt.Errorf("PlanAccess.SaveDayFocus: failed to commit: %w", err)
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

// SaveTask saves or updates a task.
// If the task ID is empty, a new ID will be generated.
func (pa *PlanAccess) SaveTask(task Task) error {
	if task.ThemeID == "" {
		return fmt.Errorf("PlanAccess.SaveTask: themeID cannot be empty")
	}

	// Generate ID if not provided
	if task.ID == "" {
		existingTasks, err := pa.GetTasksByTheme(task.ThemeID)
		if err != nil {
			return fmt.Errorf("PlanAccess.SaveTask: failed to get existing tasks: %w", err)
		}
		task.ID = pa.generateTaskID(existingTasks)
	}

	// Determine status - find existing task or default to todo
	status := string(TaskStatusTodo)
	existingStatus, err := pa.findTaskStatus(task.ID, task.ThemeID)
	if err != nil {
		return fmt.Errorf("PlanAccess.SaveTask: failed to find existing task status: %w", err)
	}
	if existingStatus != "" {
		status = existingStatus
	}

	// Ensure task directory exists
	dirPath := pa.taskDirPath(task.ThemeID, status)
	if err := os.MkdirAll(dirPath, 0755); err != nil {
		return fmt.Errorf("PlanAccess.SaveTask: failed to create task directory: %w", err)
	}

	// Save task to file
	data, err := json.MarshalIndent(task, "", "  ")
	if err != nil {
		return fmt.Errorf("PlanAccess.SaveTask: failed to marshal task: %w", err)
	}

	filePath := pa.taskFilePath(task.ThemeID, status, task.ID)
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("PlanAccess.SaveTask: failed to write task file: %w", err)
	}

	// Commit with git
	relPath, err := pa.relativePathFromRepo(filePath)
	if err != nil {
		return fmt.Errorf("PlanAccess.SaveTask: failed to get relative path: %w", err)
	}

	tx, err := pa.repo.Begin()
	if err != nil {
		return fmt.Errorf("PlanAccess.SaveTask: failed to begin transaction: %w", err)
	}

	if err := tx.Stage([]string{relPath}); err != nil {
		tx.Cancel()
		return fmt.Errorf("PlanAccess.SaveTask: failed to stage file: %w", err)
	}

	action := "Update"
	if existingStatus == "" {
		action = "Add"
	}
	_, err = tx.Commit(fmt.Sprintf("%s task: %s", action, task.Title))
	if err != nil {
		return fmt.Errorf("PlanAccess.SaveTask: failed to commit: %w", err)
	}

	return nil
}

// MoveTask moves a task to a new status using git mv.
func (pa *PlanAccess) MoveTask(taskID, newStatus string) error {
	if !IsValidTaskStatus(newStatus) {
		return fmt.Errorf("PlanAccess.MoveTask: invalid status %s", newStatus)
	}

	// Find the task and its current status
	var foundTask *Task
	var currentStatus string
	var themeID string

	// We need to search through all themes to find this task
	themes, err := pa.GetThemes()
	if err != nil {
		return fmt.Errorf("PlanAccess.MoveTask: failed to get themes: %w", err)
	}

	for _, theme := range themes {
		for _, status := range ValidTaskStatuses() {
			tasks, err := pa.GetTasksByStatus(theme.ID, string(status))
			if err != nil {
				continue
			}
			for _, task := range tasks {
				if task.ID == taskID {
					foundTask = &task
					currentStatus = string(status)
					themeID = theme.ID
					break
				}
			}
			if foundTask != nil {
				break
			}
		}
		if foundTask != nil {
			break
		}
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

	// Get relative paths for git
	oldRelPath, err := pa.relativePathFromRepo(oldPath)
	if err != nil {
		return fmt.Errorf("PlanAccess.MoveTask: failed to get relative old path: %w", err)
	}
	newRelPath, err := pa.relativePathFromRepo(newPath)
	if err != nil {
		return fmt.Errorf("PlanAccess.MoveTask: failed to get relative new path: %w", err)
	}

	// Commit with git - stage both the removal of old and addition of new
	tx, err := pa.repo.Begin()
	if err != nil {
		return fmt.Errorf("PlanAccess.MoveTask: failed to begin transaction: %w", err)
	}

	// Stage the new file and the deletion of the old file
	if err := tx.Stage([]string{newRelPath, oldRelPath}); err != nil {
		tx.Cancel()
		return fmt.Errorf("PlanAccess.MoveTask: failed to stage files: %w", err)
	}

	_, err = tx.Commit(fmt.Sprintf("Move task %s: %s -> %s", foundTask.Title, currentStatus, newStatus))
	if err != nil {
		return fmt.Errorf("PlanAccess.MoveTask: failed to commit: %w", err)
	}

	return nil
}

// DeleteTask deletes a task.
func (pa *PlanAccess) DeleteTask(taskID string) error {
	// Find the task
	var foundTask *Task
	var currentStatus string
	var themeID string

	themes, err := pa.GetThemes()
	if err != nil {
		return fmt.Errorf("PlanAccess.DeleteTask: failed to get themes: %w", err)
	}

	for _, theme := range themes {
		for _, status := range ValidTaskStatuses() {
			tasks, err := pa.GetTasksByStatus(theme.ID, string(status))
			if err != nil {
				continue
			}
			for _, task := range tasks {
				if task.ID == taskID {
					foundTask = &task
					currentStatus = string(status)
					themeID = theme.ID
					break
				}
			}
			if foundTask != nil {
				break
			}
		}
		if foundTask != nil {
			break
		}
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
	relPath, err := pa.relativePathFromRepo(filePath)
	if err != nil {
		return fmt.Errorf("PlanAccess.DeleteTask: failed to get relative path: %w", err)
	}

	tx, err := pa.repo.Begin()
	if err != nil {
		return fmt.Errorf("PlanAccess.DeleteTask: failed to begin transaction: %w", err)
	}

	if err := tx.Stage([]string{relPath}); err != nil {
		tx.Cancel()
		return fmt.Errorf("PlanAccess.DeleteTask: failed to stage deletion: %w", err)
	}

	_, err = tx.Commit(fmt.Sprintf("Delete task: %s", foundTask.Title))
	if err != nil {
		return fmt.Errorf("PlanAccess.DeleteTask: failed to commit: %w", err)
	}

	return nil
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

// generateThemeID generates a new theme ID based on existing themes.
func (pa *PlanAccess) generateThemeID(existingThemes []LifeTheme) string {
	maxNum := 0
	re := regexp.MustCompile(`^THEME-(\d+)$`)

	for _, theme := range existingThemes {
		matches := re.FindStringSubmatch(theme.ID)
		if len(matches) == 2 {
			num, err := strconv.Atoi(matches[1])
			if err == nil && num > maxNum {
				maxNum = num
			}
		}
	}

	return fmt.Sprintf("THEME-%02d", maxNum+1)
}

// ensureThemeIDs ensures all objectives and key results have proper hierarchical IDs.
func (pa *PlanAccess) ensureThemeIDs(theme LifeTheme) LifeTheme {
	for i := range theme.Objectives {
		obj := &theme.Objectives[i]
		if obj.ID == "" {
			obj.ID = fmt.Sprintf("%s.OKR-%02d", theme.ID, i+1)
		}

		for j := range obj.KeyResults {
			kr := &obj.KeyResults[j]
			if kr.ID == "" {
				kr.ID = fmt.Sprintf("%s.KR-%02d", obj.ID, j+1)
			}
		}
	}

	return theme
}

// generateTaskID generates a new task ID based on existing tasks.
func (pa *PlanAccess) generateTaskID(existingTasks []Task) string {
	maxNum := 0
	re := regexp.MustCompile(`^task-(\d+)$`)

	for _, task := range existingTasks {
		matches := re.FindStringSubmatch(task.ID)
		if len(matches) == 2 {
			num, err := strconv.Atoi(matches[1])
			if err == nil && num > maxNum {
				maxNum = num
			}
		}
	}

	return fmt.Sprintf("task-%03d", maxNum+1)
}

// findTaskStatus finds the current status of a task by searching through all status directories.
func (pa *PlanAccess) findTaskStatus(taskID, themeID string) (string, error) {
	for _, status := range ValidTaskStatuses() {
		filePath := pa.taskFilePath(themeID, string(status), taskID)
		if _, err := os.Stat(filePath); err == nil {
			return string(status), nil
		}
	}
	return "", nil
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
	data, err := json.MarshalIndent(ctx, "", "  ")
	if err != nil {
		return fmt.Errorf("PlanAccess.SaveNavigationContext: failed to marshal context: %w", err)
	}

	filePath := pa.navigationContextFilePath()
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("PlanAccess.SaveNavigationContext: failed to write file: %w", err)
	}

	return nil
}
