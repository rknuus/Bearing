package access

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/rkn/bearing/internal/utilities"
)

// testEnv holds all resource access components for testing.
type testEnv struct {
	themes   *ThemeAccess
	tasks    *TaskAccess
	calendar *CalendarAccess
	vision   *VisionAccess
	routines *RoutineAccess
	repo     utilities.IRepository
	dataDir  string
}

// setupTestEnv creates a test repository with all resource access instances.
// The returned testEnv.tasks also serves as "pa" for backward compat in tests.
func setupTestEnv(t *testing.T) (*testEnv, string, func()) {
	t.Helper()

	tmpDir, err := os.MkdirTemp("", "access_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	dataDir := filepath.Join(tmpDir, "data")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to create data dir: %v", err)
	}

	gitConfig := &utilities.AuthorConfiguration{
		User:  "Test User",
		Email: "test@example.com",
	}
	repo, err := utilities.InitializeRepositoryWithConfig(tmpDir, gitConfig)
	if err != nil {
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to initialize repository: %v", err)
	}

	themes, err := NewThemeAccess(dataDir, repo)
	if err != nil {
		repo.Close()
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to create ThemeAccess: %v", err)
	}

	tasks, err := NewTaskAccess(dataDir, repo)
	if err != nil {
		repo.Close()
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to create TaskAccess: %v", err)
	}

	cal, err := NewCalendarAccess(dataDir, repo)
	if err != nil {
		repo.Close()
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to create CalendarAccess: %v", err)
	}

	vis, err := NewVisionAccess(dataDir, repo)
	if err != nil {
		repo.Close()
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to create VisionAccess: %v", err)
	}

	rtn, err := NewRoutineAccess(dataDir, repo)
	if err != nil {
		repo.Close()
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to create RoutineAccess: %v", err)
	}

	cleanup := func() {
		repo.Close()
		os.RemoveAll(tmpDir)
	}

	return &testEnv{themes: themes, tasks: tasks, calendar: cal, vision: vis, routines: rtn, repo: repo, dataDir: dataDir}, tmpDir, cleanup
}

// setupTestPlanAccess is a backward-compatible helper that returns a TaskAccess
// (which implements most of the old PlanAccess interface methods used in tests).
func setupTestPlanAccess(t *testing.T) (*testEnv, string, func()) {
	t.Helper()
	return setupTestEnv(t)
}

// Model Tests

func TestValidTaskStatuses(t *testing.T) {
	statuses := ValidTaskStatuses()
	if len(statuses) != 3 {
		t.Errorf("Expected 3 task statuses, got %d", len(statuses))
	}

	expected := []TaskStatus{TaskStatusTodo, TaskStatusDoing, TaskStatusDone}
	for i, status := range statuses {
		if status != expected[i] {
			t.Errorf("Expected status %s at index %d, got %s", expected[i], i, status)
		}
	}
}

func TestIsValidTaskStatus(t *testing.T) {
	tests := []struct {
		status string
		valid  bool
	}{
		{"todo", true},
		{"doing", true},
		{"done", true},
		{"invalid", false},
		{"", false},
		{"TODO", false}, // Case sensitive
	}

	for _, tt := range tests {
		t.Run(tt.status, func(t *testing.T) {
			result := IsValidTaskStatus(tt.status)
			if result != tt.valid {
				t.Errorf("IsValidTaskStatus(%s) = %v, want %v", tt.status, result, tt.valid)
			}
		})
	}
}

func TestValidPriorities(t *testing.T) {
	priorities := ValidPriorities()
	if len(priorities) != 3 {
		t.Errorf("Expected 3 priorities, got %d", len(priorities))
	}
}

// PlanAccess Constructor Tests

func TestNewThemeAccess_EmptyDataPath(t *testing.T) {
	_, err := NewThemeAccess("", nil)
	if err == nil {
		t.Error("Expected error for empty dataPath")
	}
}

func TestNewTaskAccess_NilRepo(t *testing.T) {
	_, err := NewTaskAccess("/tmp/test", nil)
	if err == nil {
		t.Error("Expected error for nil repo")
	}
}

func TestNewTaskAccess_CreatesDirectoryStructure(t *testing.T) {
	env, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	dataDir := filepath.Join(tmpDir, "data")

	// Check directory structure was created
	dirs := []string{
		filepath.Join(dataDir, "themes"),
		filepath.Join(dataDir, "calendar"),
		filepath.Join(dataDir, "tasks"),
	}

	for _, dir := range dirs {
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			t.Errorf("Expected directory %s to exist", dir)
		}
	}

	_ = env // Use env to avoid unused variable warning
}

// Theme Tests

func TestGetThemes_EmptyRepository(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	themes, err := env.themes.GetThemes()
	if err != nil {
		t.Fatalf("GetThemes failed: %v", err)
	}

	if len(themes) != 0 {
		t.Errorf("Expected 0 themes, got %d", len(themes))
	}
}

func TestSaveTheme_NewTheme(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	theme := LifeTheme{
		ID:    "H",
		Name:  "Health",
		Color: "#00FF00",
		Objectives: []Objective{
			{
				Title: "Improve fitness",
				KeyResults: []KeyResult{
					{Description: "Run 5k in under 25 minutes"},
					{Description: "Do 50 pushups"},
				},
			},
		},
	}

	err := env.themes.SaveTheme(theme)
	if err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Verify theme was saved
	themes, err := env.themes.GetThemes()
	if err != nil {
		t.Fatalf("GetThemes failed: %v", err)
	}

	if len(themes) != 1 {
		t.Fatalf("Expected 1 theme, got %d", len(themes))
	}

	saved := themes[0]
	if saved.ID != "H" {
		t.Errorf("Expected ID H, got %s", saved.ID)
	}
	if saved.Name != "Health" {
		t.Errorf("Expected name Health, got %s", saved.Name)
	}
	if saved.Color != "#00FF00" {
		t.Errorf("Expected color #00FF00, got %s", saved.Color)
	}

	// Check theme-scoped IDs and parentId
	if len(saved.Objectives) != 1 {
		t.Fatalf("Expected 1 objective, got %d", len(saved.Objectives))
	}
	obj := saved.Objectives[0]
	if obj.ID != "H-O1" {
		t.Errorf("Expected objective ID H-O1, got %s", obj.ID)
	}
	if obj.ParentID != "H" {
		t.Errorf("Expected objective ParentID H, got %s", obj.ParentID)
	}

	if len(obj.KeyResults) != 2 {
		t.Fatalf("Expected 2 key results, got %d", len(obj.KeyResults))
	}
	if obj.KeyResults[0].ID != "H-KR1" {
		t.Errorf("Expected KR ID H-KR1, got %s", obj.KeyResults[0].ID)
	}
	if obj.KeyResults[0].ParentID != "H-O1" {
		t.Errorf("Expected KR ParentID H-O1, got %s", obj.KeyResults[0].ParentID)
	}
	if obj.KeyResults[1].ID != "H-KR2" {
		t.Errorf("Expected KR ID H-KR2, got %s", obj.KeyResults[1].ID)
	}
	if obj.KeyResults[1].ParentID != "H-O1" {
		t.Errorf("Expected KR ParentID H-O1, got %s", obj.KeyResults[1].ParentID)
	}
}

func TestSaveTheme_UpdateExisting(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create initial theme
	theme := LifeTheme{
		ID:    "H",
		Name:  "Health",
		Color: "#00FF00",
	}
	err := env.themes.SaveTheme(theme)
	if err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Update the theme (keep same ID)
	updatedTheme := LifeTheme{
		ID:    "H",
		Name:  "Health & Wellness",
		Color: "#00FF99",
	}
	err = env.themes.SaveTheme(updatedTheme)
	if err != nil {
		t.Fatalf("SaveTheme update failed: %v", err)
	}

	// Verify update
	themes, err := env.themes.GetThemes()
	if err != nil {
		t.Fatalf("GetThemes failed: %v", err)
	}

	if len(themes) != 1 {
		t.Errorf("Expected 1 theme, got %d", len(themes))
	}

	if themes[0].Name != "Health & Wellness" {
		t.Errorf("Expected updated name, got %s", themes[0].Name)
	}
}

func TestSaveTheme_MultipleThemes(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	themes := []LifeTheme{
		{ID: "H", Name: "Health", Color: "#00FF00"},
		{ID: "C", Name: "Career", Color: "#0000FF"},
		{ID: "F", Name: "Family", Color: "#FF0000"},
	}

	for _, theme := range themes {
		if err := env.themes.SaveTheme(theme); err != nil {
			t.Fatalf("SaveTheme failed: %v", err)
		}
	}

	saved, err := env.themes.GetThemes()
	if err != nil {
		t.Fatalf("GetThemes failed: %v", err)
	}

	if len(saved) != 3 {
		t.Fatalf("Expected 3 themes, got %d", len(saved))
	}

	// Verify IDs are abbreviations derived from names
	expectedIDs := []string{"H", "C", "F"}
	for i, theme := range saved {
		if theme.ID != expectedIDs[i] {
			t.Errorf("Expected ID %s, got %s", expectedIDs[i], theme.ID)
		}
	}
}

func TestDeleteTheme(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create themes
	theme1 := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	theme2 := LifeTheme{ID: "C", Name: "Career", Color: "#0000FF"}

	if err := env.themes.SaveTheme(theme1); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}
	if err := env.themes.SaveTheme(theme2); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Delete first theme
	err := env.themes.DeleteTheme("H")
	if err != nil {
		t.Fatalf("DeleteTheme failed: %v", err)
	}

	// Verify deletion
	themes, err := env.themes.GetThemes()
	if err != nil {
		t.Fatalf("GetThemes failed: %v", err)
	}

	if len(themes) != 1 {
		t.Fatalf("Expected 1 theme, got %d", len(themes))
	}

	if themes[0].ID != "C" {
		t.Errorf("Expected remaining theme to be C, got %s", themes[0].ID)
	}
}

func TestDeleteTheme_NotFound(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	err := env.themes.DeleteTheme("ZZZ")
	if err == nil {
		t.Error("Expected error when deleting non-existent theme")
	}
}

// DayFocus Tests

func TestGetDayFocus_NotFound(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	dayFocus, err := env.calendar.GetDayFocus("2026-01-15")
	if err != nil {
		t.Fatalf("GetDayFocus failed: %v", err)
	}

	if dayFocus != nil {
		t.Error("Expected nil for non-existent day focus")
	}
}

func TestSaveDayFocus(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create a theme first
	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Save day focus
	dayFocus := DayFocus{
		Date:     utilities.MustParseCalendarDate("2026-01-15"),
		ThemeIDs: []string{"H"},
		Notes:    "Focus on morning exercise",
	}

	err := env.calendar.SaveDayFocus(dayFocus)
	if err != nil {
		t.Fatalf("SaveDayFocus failed: %v", err)
	}

	// Retrieve and verify
	retrieved, err := env.calendar.GetDayFocus("2026-01-15")
	if err != nil {
		t.Fatalf("GetDayFocus failed: %v", err)
	}

	if retrieved == nil {
		t.Fatal("Expected day focus, got nil")
	}

	if retrieved.Date.String() != "2026-01-15" {
		t.Errorf("Expected date 2026-01-15, got %s", retrieved.Date)
	}
	if len(retrieved.ThemeIDs) != 1 || retrieved.ThemeIDs[0] != "H" {
		t.Errorf("Expected themeIDs [H], got %v", retrieved.ThemeIDs)
	}
	if retrieved.Notes != "Focus on morning exercise" {
		t.Errorf("Expected notes, got %s", retrieved.Notes)
	}
}

func TestSaveDayFocus_Update(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Save initial day focus
	dayFocus := DayFocus{
		Date:     utilities.MustParseCalendarDate("2026-01-15"),
		ThemeIDs: []string{"H"},
		Notes:    "Initial notes",
	}

	if err := env.calendar.SaveDayFocus(dayFocus); err != nil {
		t.Fatalf("SaveDayFocus failed: %v", err)
	}

	// Update
	dayFocus.Notes = "Updated notes"
	if err := env.calendar.SaveDayFocus(dayFocus); err != nil {
		t.Fatalf("SaveDayFocus update failed: %v", err)
	}

	// Verify
	retrieved, err := env.calendar.GetDayFocus("2026-01-15")
	if err != nil {
		t.Fatalf("GetDayFocus failed: %v", err)
	}

	if retrieved.Notes != "Updated notes" {
		t.Errorf("Expected updated notes, got %s", retrieved.Notes)
	}
}

func TestGetYearFocus(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Save multiple day focuses
	days := []DayFocus{
		{Date: utilities.MustParseCalendarDate("2026-01-15"), ThemeIDs: []string{"H"}, Notes: "Day 1"},
		{Date: utilities.MustParseCalendarDate("2026-01-16"), ThemeIDs: []string{"H"}, Notes: "Day 2"},
		{Date: utilities.MustParseCalendarDate("2026-02-01"), ThemeIDs: []string{"C"}, Notes: "Day 3"},
	}

	for _, day := range days {
		if err := env.calendar.SaveDayFocus(day); err != nil {
			t.Fatalf("SaveDayFocus failed: %v", err)
		}
	}

	// Get year focus
	yearFocus, err := env.calendar.GetYearFocus(2026)
	if err != nil {
		t.Fatalf("GetYearFocus failed: %v", err)
	}

	if len(yearFocus) != 3 {
		t.Errorf("Expected 3 day focuses, got %d", len(yearFocus))
	}

	// Verify sorted by date
	if yearFocus[0].Date.String() != "2026-01-15" {
		t.Errorf("Expected first date 2026-01-15, got %s", yearFocus[0].Date)
	}
	if yearFocus[2].Date.String() != "2026-02-01" {
		t.Errorf("Expected last date 2026-02-01, got %s", yearFocus[2].Date)
	}
}

func TestGetYearFocus_EmptyYear(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	yearFocus, err := env.calendar.GetYearFocus(2025)
	if err != nil {
		t.Fatalf("GetYearFocus failed: %v", err)
	}

	if len(yearFocus) != 0 {
		t.Errorf("Expected 0 day focuses, got %d", len(yearFocus))
	}
}

// Task Tests

func TestSaveTask_NewTask(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create a theme first
	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Save task
	task := Task{
		Title:    "Morning run",
		ThemeID:  "H",
		Priority: string(PriorityImportantUrgent),
	}

	err := env.tasks.SaveTask(task)
	if err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Retrieve and verify
	tasks, err := env.tasks.GetTasksByTheme("H")
	if err != nil {
		t.Fatalf("GetTasksByTheme failed: %v", err)
	}

	if len(tasks) != 1 {
		t.Fatalf("Expected 1 task, got %d", len(tasks))
	}

	saved := tasks[0]
	if saved.ID != "H-T1" {
		t.Errorf("Expected ID H-T1, got %s", saved.ID)
	}
	if saved.Title != "Morning run" {
		t.Errorf("Expected title 'Morning run', got %s", saved.Title)
	}
}

func TestSaveTask_ThemeChange(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create two themes
	if err := env.themes.SaveTheme(LifeTheme{ID: "W", Name: "Work", Color: "#0000FF"}); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}
	if err := env.themes.SaveTheme(LifeTheme{ID: "L", Name: "Learning", Color: "#00FF00"}); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Create task under Work theme
	task := Task{
		Title:    "Study Go",
		ThemeID:  "W",
		Priority: string(PriorityImportantUrgent),
	}
	if err := env.tasks.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Verify task exists under Work
	workTasks, err := env.tasks.GetTasksByTheme("W")
	if err != nil {
		t.Fatalf("GetTasksByTheme failed: %v", err)
	}
	if len(workTasks) != 1 {
		t.Fatalf("Expected 1 task under W, got %d", len(workTasks))
	}

	// Move task to Learning theme by updating themeId
	movedTask := workTasks[0]
	movedTask.ThemeID = "L"
	if err := env.tasks.SaveTask(movedTask); err != nil {
		t.Fatalf("SaveTask (theme change) failed: %v", err)
	}

	// Old theme should have no tasks
	workTasks, err = env.tasks.GetTasksByTheme("W")
	if err != nil {
		t.Fatalf("GetTasksByTheme failed: %v", err)
	}
	if len(workTasks) != 0 {
		t.Errorf("Expected 0 tasks under W after theme change, got %d", len(workTasks))
	}

	// New theme should have the task
	learnTasks, err := env.tasks.GetTasksByTheme("L")
	if err != nil {
		t.Fatalf("GetTasksByTheme failed: %v", err)
	}
	if len(learnTasks) != 1 {
		t.Fatalf("Expected 1 task under L, got %d", len(learnTasks))
	}
	if learnTasks[0].ID != movedTask.ID {
		t.Errorf("Expected task ID %s, got %s", movedTask.ID, learnTasks[0].ID)
	}
	if learnTasks[0].ThemeID != "L" {
		t.Errorf("Expected themeID L, got %s", learnTasks[0].ThemeID)
	}
}

func TestSaveTask_EmptyThemeID(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	task := Task{
		Title: "Test task",
	}

	err := env.tasks.SaveTask(task)
	if err == nil {
		t.Error("Expected error for empty themeID")
	}
}

func TestGetTasksByStatus(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create theme
	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Save task (defaults to todo)
	task := Task{
		Title:   "Morning run",
		ThemeID: "H",
	}

	if err := env.tasks.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Get tasks by status
	todoTasks, err := env.tasks.GetTasksByStatus("todo")
	if err != nil {
		t.Fatalf("GetTasksByStatus failed: %v", err)
	}

	if len(todoTasks) != 1 {
		t.Errorf("Expected 1 todo task, got %d", len(todoTasks))
	}

	// No doing tasks
	doingTasks, err := env.tasks.GetTasksByStatus("doing")
	if err != nil {
		t.Fatalf("GetTasksByStatus failed: %v", err)
	}

	if len(doingTasks) != 0 {
		t.Errorf("Expected 0 doing tasks, got %d", len(doingTasks))
	}
}

func TestGetTasksByStatus_UnknownStatus_ReturnsEmpty(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	tasks, err := env.tasks.GetTasksByStatus("nonexistent-column")
	if err != nil {
		t.Errorf("Expected no error for unknown status directory, got: %v", err)
	}
	if len(tasks) != 0 {
		t.Errorf("Expected empty task list for unknown status, got %d tasks", len(tasks))
	}
}

func TestMoveTask(t *testing.T) {
	env, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create theme
	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Save task
	task := Task{
		Title:   "Morning run",
		ThemeID: "H",
	}

	if err := env.tasks.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Move to doing
	err := env.tasks.MoveTask("H-T1", "doing")
	if err != nil {
		t.Fatalf("MoveTask failed: %v", err)
	}

	// Verify task moved
	todoTasks, _ := env.tasks.GetTasksByStatus("todo")
	doingTasks, _ := env.tasks.GetTasksByStatus("doing")

	if len(todoTasks) != 0 {
		t.Errorf("Expected 0 todo tasks, got %d", len(todoTasks))
	}
	if len(doingTasks) != 1 {
		t.Errorf("Expected 1 doing task, got %d", len(doingTasks))
	}

	// Verify file exists in new location
	newPath := filepath.Join(tmpDir, "data", "tasks", "doing", "H-T1.json")
	if _, err := os.Stat(newPath); os.IsNotExist(err) {
		t.Error("Task file not found in new location")
	}

	// Verify file removed from old location
	oldPath := filepath.Join(tmpDir, "data", "tasks", "todo", "H-T1.json")
	if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
		t.Error("Task file should not exist in old location")
	}
}

func TestMoveTask_InvalidStatus(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	err := env.tasks.MoveTask("H-T1", "invalid")
	if err == nil {
		t.Error("Expected error for invalid status")
	}
}

func TestMoveTask_NotFound(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create theme to have something searchable
	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	err := env.tasks.MoveTask("H-T999", "doing")
	if err == nil {
		t.Error("Expected error for non-existent task")
	}
}

func TestDeleteTask(t *testing.T) {
	env, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create theme
	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Save task
	task := Task{
		Title:   "Morning run",
		ThemeID: "H",
	}

	if err := env.tasks.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Delete task
	err := env.tasks.DeleteTask("H-T1")
	if err != nil {
		t.Fatalf("DeleteTask failed: %v", err)
	}

	// Verify deletion
	tasks, err := env.tasks.GetTasksByTheme("H")
	if err != nil {
		t.Fatalf("GetTasksByTheme failed: %v", err)
	}

	if len(tasks) != 0 {
		t.Errorf("Expected 0 tasks, got %d", len(tasks))
	}

	// Verify file removed
	taskPath := filepath.Join(tmpDir, "data", "tasks", "todo", "H-T1.json")
	if _, err := os.Stat(taskPath); !os.IsNotExist(err) {
		t.Error("Task file should not exist after deletion")
	}
}

func TestDeleteTask_NotFound(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create theme
	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	err := env.tasks.DeleteTask("H-T999")
	if err == nil {
		t.Error("Expected error for non-existent task")
	}
}

// Flat ID Generation Tests

func TestFlatIDGeneration(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	theme := LifeTheme{
		ID:    "H",
		Name:  "Health",
		Color: "#00FF00",
		Objectives: []Objective{
			{
				Title: "Fitness",
				KeyResults: []KeyResult{
					{Description: "KR 1"},
					{Description: "KR 2"},
				},
			},
			{
				Title: "Nutrition",
				KeyResults: []KeyResult{
					{Description: "KR 3"},
				},
			},
		},
	}

	err := env.themes.SaveTheme(theme)
	if err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	themes, _ := env.themes.GetThemes()
	saved := themes[0]

	// Theme ID
	if saved.ID != "H" {
		t.Errorf("Expected theme ID H, got %s", saved.ID)
	}

	// First objective
	if saved.Objectives[0].ID != "H-O1" {
		t.Errorf("Expected objective ID H-O1, got %s", saved.Objectives[0].ID)
	}
	if saved.Objectives[0].ParentID != "H" {
		t.Errorf("Expected objective ParentID H, got %s", saved.Objectives[0].ParentID)
	}

	// First objective's key results
	if saved.Objectives[0].KeyResults[0].ID != "H-KR1" {
		t.Errorf("Expected KR ID H-KR1, got %s", saved.Objectives[0].KeyResults[0].ID)
	}
	if saved.Objectives[0].KeyResults[0].ParentID != "H-O1" {
		t.Errorf("Expected KR ParentID H-O1, got %s", saved.Objectives[0].KeyResults[0].ParentID)
	}
	if saved.Objectives[0].KeyResults[1].ID != "H-KR2" {
		t.Errorf("Expected KR ID H-KR2, got %s", saved.Objectives[0].KeyResults[1].ID)
	}
	if saved.Objectives[0].KeyResults[1].ParentID != "H-O1" {
		t.Errorf("Expected KR ParentID H-O1, got %s", saved.Objectives[0].KeyResults[1].ParentID)
	}

	// Second objective
	if saved.Objectives[1].ID != "H-O2" {
		t.Errorf("Expected objective ID H-O2, got %s", saved.Objectives[1].ID)
	}
	if saved.Objectives[1].ParentID != "H" {
		t.Errorf("Expected objective ParentID H, got %s", saved.Objectives[1].ParentID)
	}

	// Second objective's key result
	if saved.Objectives[1].KeyResults[0].ID != "H-KR3" {
		t.Errorf("Expected KR ID H-KR3, got %s", saved.Objectives[1].KeyResults[0].ID)
	}
	if saved.Objectives[1].KeyResults[0].ParentID != "H-O2" {
		t.Errorf("Expected KR ParentID H-O2, got %s", saved.Objectives[1].KeyResults[0].ParentID)
	}
}

// Task ID Generation Tests

func TestTaskIDGeneration(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create theme
	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Create multiple tasks
	for i := 0; i < 5; i++ {
		task := Task{
			Title:   "Task",
			ThemeID: "H",
		}
		if err := env.tasks.SaveTask(task); err != nil {
			t.Fatalf("SaveTask failed: %v", err)
		}
	}

	tasks, err := env.tasks.GetTasksByTheme("H")
	if err != nil {
		t.Fatalf("GetTasksByTheme failed: %v", err)
	}

	if len(tasks) != 5 {
		t.Fatalf("Expected 5 tasks, got %d", len(tasks))
	}

	// Verify sequential IDs
	expectedIDs := []string{"H-T1", "H-T2", "H-T3", "H-T4", "H-T5"}
	idMap := make(map[string]bool)
	for _, task := range tasks {
		idMap[task.ID] = true
	}

	for _, expected := range expectedIDs {
		if !idMap[expected] {
			t.Errorf("Expected task ID %s to exist", expected)
		}
	}
}

// File Structure Tests

func TestFileStructure(t *testing.T) {
	env, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	dataDir := filepath.Join(tmpDir, "data")

	// Create theme
	theme := LifeTheme{
		ID:    "H",
		Name:  "Health",
		Color: "#00FF00",
		Objectives: []Objective{
			{
				Title: "Fitness",
				KeyResults: []KeyResult{
					{Description: "Run 5k"},
				},
			},
		},
	}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Verify themes.json exists
	themesPath := filepath.Join(dataDir, "themes", "themes.json")
	if _, err := os.Stat(themesPath); os.IsNotExist(err) {
		t.Error("themes.json should exist")
	}

	// Verify themes.json content
	data, err := os.ReadFile(themesPath)
	if err != nil {
		t.Fatalf("Failed to read themes.json: %v", err)
	}

	var themesFile ThemesFile
	if err := json.Unmarshal(data, &themesFile); err != nil {
		t.Fatalf("Failed to parse themes.json: %v", err)
	}

	if len(themesFile.Themes) != 1 {
		t.Errorf("Expected 1 theme in file, got %d", len(themesFile.Themes))
	}

	// Save day focus and verify calendar structure
	dayFocus := DayFocus{Date: utilities.MustParseCalendarDate("2026-01-15"), ThemeIDs: []string{"H"}, Notes: "Test"}
	if err := env.calendar.SaveDayFocus(dayFocus); err != nil {
		t.Fatalf("SaveDayFocus failed: %v", err)
	}

	calendarPath := filepath.Join(dataDir, "calendar", "2026.json")
	if _, err := os.Stat(calendarPath); os.IsNotExist(err) {
		t.Error("2026.json should exist")
	}

	// Save task and verify task structure
	task := Task{Title: "Test task", ThemeID: "H"}
	if err := env.tasks.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	taskPath := filepath.Join(dataDir, "tasks", "todo", "H-T1.json")
	if _, err := os.Stat(taskPath); os.IsNotExist(err) {
		t.Error("H-T1.json should exist in todo directory")
	}
}

// Git Versioning Tests

func TestGitVersioning_ThemeCommit(t *testing.T) {
	env, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create theme
	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Check git history
	gitConfig := &utilities.AuthorConfiguration{User: "Test", Email: "test@example.com"}
	repo, _ := utilities.InitializeRepositoryWithConfig(tmpDir, gitConfig)
	defer repo.Close()

	history, err := repo.GetHistory(10)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}

	if len(history) == 0 {
		t.Error("Expected at least one commit")
	}

	// Verify commit message mentions the theme
	found := false
	for _, commit := range history {
		if commit.Message == "Add theme: Health" {
			found = true
			break
		}
	}
	if !found {
		t.Error("Expected commit message 'Add theme: Health'")
	}
}

func TestGitVersioning_MoveTaskUsesGitMv(t *testing.T) {
	env, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create theme and task
	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	task := Task{Title: "Test task", ThemeID: "H"}
	if err := env.tasks.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Move task
	if err := env.tasks.MoveTask("H-T1", "doing"); err != nil {
		t.Fatalf("MoveTask failed: %v", err)
	}

	// Check git history for move commit
	gitConfig := &utilities.AuthorConfiguration{User: "Test", Email: "test@example.com"}
	repo, _ := utilities.InitializeRepositoryWithConfig(tmpDir, gitConfig)
	defer repo.Close()

	history, err := repo.GetHistory(10)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}

	// Find move commit
	found := false
	for _, commit := range history {
		if commit.Message == "Move task Test task: todo -> doing" {
			found = true
			break
		}
	}
	if !found {
		t.Error("Expected commit message for move operation")
	}
}

// Recursive Flat ID Generation Tests

func TestRecursiveObjectiveIDGeneration(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	theme := LifeTheme{
		ID:    "H",
		Name:  "Health",
		Color: "#00FF00",
		Objectives: []Objective{
			{
				Title: "Fitness",
				KeyResults: []KeyResult{
					{Description: "Run 5k"},
				},
				Objectives: []Objective{
					{
						Title: "Cardio",
						KeyResults: []KeyResult{
							{Description: "Run daily"},
							{Description: "Cycle weekly"},
						},
						Objectives: []Objective{
							{
								Title: "Marathon prep",
								KeyResults: []KeyResult{
									{Description: "Run 10k"},
								},
							},
						},
					},
					{
						Title: "Strength",
						KeyResults: []KeyResult{
							{Description: "Bench press"},
						},
					},
				},
			},
		},
	}

	err := env.themes.SaveTheme(theme)
	if err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	themes, _ := env.themes.GetThemes()
	saved := themes[0]

	// Top-level objective: H-O1 (Fitness), parentId = H
	obj1 := saved.Objectives[0]
	if obj1.ID != "H-O1" {
		t.Errorf("Expected H-O1, got %s", obj1.ID)
	}
	if obj1.ParentID != "H" {
		t.Errorf("Expected ParentID H, got %s", obj1.ParentID)
	}
	if obj1.KeyResults[0].ID != "H-KR1" {
		t.Errorf("Expected H-KR1, got %s", obj1.KeyResults[0].ID)
	}
	if obj1.KeyResults[0].ParentID != "H-O1" {
		t.Errorf("Expected KR ParentID H-O1, got %s", obj1.KeyResults[0].ParentID)
	}

	// Second-level objective: H-O2 (Cardio), parentId = H-O1
	child1 := obj1.Objectives[0]
	if child1.ID != "H-O2" {
		t.Errorf("Expected H-O2, got %s", child1.ID)
	}
	if child1.ParentID != "H-O1" {
		t.Errorf("Expected ParentID H-O1, got %s", child1.ParentID)
	}
	if child1.KeyResults[0].ID != "H-KR2" {
		t.Errorf("Expected H-KR2, got %s", child1.KeyResults[0].ID)
	}
	if child1.KeyResults[0].ParentID != "H-O2" {
		t.Errorf("Expected KR ParentID H-O2, got %s", child1.KeyResults[0].ParentID)
	}
	if child1.KeyResults[1].ID != "H-KR3" {
		t.Errorf("Expected H-KR3, got %s", child1.KeyResults[1].ID)
	}
	if child1.KeyResults[1].ParentID != "H-O2" {
		t.Errorf("Expected KR ParentID H-O2, got %s", child1.KeyResults[1].ParentID)
	}

	// Third-level objective: H-O3 (Marathon prep), parentId = H-O2
	grandchild := child1.Objectives[0]
	if grandchild.ID != "H-O3" {
		t.Errorf("Expected H-O3, got %s", grandchild.ID)
	}
	if grandchild.ParentID != "H-O2" {
		t.Errorf("Expected ParentID H-O2, got %s", grandchild.ParentID)
	}
	if grandchild.KeyResults[0].ID != "H-KR4" {
		t.Errorf("Expected H-KR4, got %s", grandchild.KeyResults[0].ID)
	}
	if grandchild.KeyResults[0].ParentID != "H-O3" {
		t.Errorf("Expected KR ParentID H-O3, got %s", grandchild.KeyResults[0].ParentID)
	}

	// Second-level objective: H-O4 (Strength), parentId = H-O1
	child2 := obj1.Objectives[1]
	if child2.ID != "H-O4" {
		t.Errorf("Expected H-O4, got %s", child2.ID)
	}
	if child2.ParentID != "H-O1" {
		t.Errorf("Expected ParentID H-O1, got %s", child2.ParentID)
	}
	if child2.KeyResults[0].ID != "H-KR5" {
		t.Errorf("Expected H-KR5, got %s", child2.KeyResults[0].ID)
	}
	if child2.KeyResults[0].ParentID != "H-O4" {
		t.Errorf("Expected KR ParentID H-O4, got %s", child2.KeyResults[0].ParentID)
	}
}

func TestRecursiveIDGeneration_PreservesExistingIDs(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// First save: create theme with initial objectives
	theme := LifeTheme{
		ID:    "C",
		Name:  "Career",
		Color: "#0000FF",
		Objectives: []Objective{
			{
				Title: "Existing objective",
				KeyResults: []KeyResult{
					{Description: "Existing KR"},
				},
				Objectives: []Objective{
					{
						Title: "Existing child",
					},
				},
			},
		},
	}

	err := env.themes.SaveTheme(theme)
	if err != nil {
		t.Fatalf("SaveTheme (initial) failed: %v", err)
	}

	// Read back the saved theme to get assigned IDs
	themes, _ := env.themes.GetThemes()
	initial := themes[0]

	// Verify initial IDs: C-O1, C-O2, C-KR1
	if initial.Objectives[0].ID != "C-O1" {
		t.Fatalf("Expected initial objective ID C-O1, got %s", initial.Objectives[0].ID)
	}
	if initial.Objectives[0].Objectives[0].ID != "C-O2" {
		t.Fatalf("Expected initial child ID C-O2, got %s", initial.Objectives[0].Objectives[0].ID)
	}
	if initial.Objectives[0].KeyResults[0].ID != "C-KR1" {
		t.Fatalf("Expected initial KR ID C-KR1, got %s", initial.Objectives[0].KeyResults[0].ID)
	}

	// Second save: update theme, adding new items while preserving existing IDs
	updated := LifeTheme{
		ID:    "C",
		Name:  "Career",
		Color: "#0000FF",
		Objectives: []Objective{
			{
				ID:    "C-O1",
				Title: "Existing objective",
				KeyResults: []KeyResult{
					{ID: "C-KR1", Description: "Existing KR"},
					{Description: "New KR"},
				},
				Objectives: []Objective{
					{
						ID:    "C-O2",
						Title: "Existing child",
					},
					{
						Title: "New child",
					},
				},
			},
			{
				Title: "New objective",
			},
		},
	}

	err = env.themes.SaveTheme(updated)
	if err != nil {
		t.Fatalf("SaveTheme (update) failed: %v", err)
	}

	themes, _ = env.themes.GetThemes()
	saved := themes[0]

	// Existing IDs preserved
	if saved.Objectives[0].ID != "C-O1" {
		t.Errorf("Expected preserved ID C-O1, got %s", saved.Objectives[0].ID)
	}
	if saved.Objectives[0].ParentID != "C" {
		t.Errorf("Expected ParentID C, got %s", saved.Objectives[0].ParentID)
	}
	if saved.Objectives[0].KeyResults[0].ID != "C-KR1" {
		t.Errorf("Expected preserved KR ID C-KR1, got %s", saved.Objectives[0].KeyResults[0].ID)
	}
	if saved.Objectives[0].KeyResults[0].ParentID != "C-O1" {
		t.Errorf("Expected KR ParentID C-O1, got %s", saved.Objectives[0].KeyResults[0].ParentID)
	}
	if saved.Objectives[0].Objectives[0].ID != "C-O2" {
		t.Errorf("Expected preserved child ID C-O2, got %s", saved.Objectives[0].Objectives[0].ID)
	}
	if saved.Objectives[0].Objectives[0].ParentID != "C-O1" {
		t.Errorf("Expected child ParentID C-O1, got %s", saved.Objectives[0].Objectives[0].ParentID)
	}

	// New IDs generated based on max existing number
	if saved.Objectives[0].KeyResults[1].ID != "C-KR2" {
		t.Errorf("Expected new KR ID C-KR2, got %s", saved.Objectives[0].KeyResults[1].ID)
	}
	if saved.Objectives[0].KeyResults[1].ParentID != "C-O1" {
		t.Errorf("Expected new KR ParentID C-O1, got %s", saved.Objectives[0].KeyResults[1].ParentID)
	}
	if saved.Objectives[0].Objectives[1].ID != "C-O3" {
		t.Errorf("Expected new child ID C-O3, got %s", saved.Objectives[0].Objectives[1].ID)
	}
	if saved.Objectives[0].Objectives[1].ParentID != "C-O1" {
		t.Errorf("Expected new child ParentID C-O1, got %s", saved.Objectives[0].Objectives[1].ParentID)
	}
	if saved.Objectives[1].ID != "C-O4" {
		t.Errorf("Expected new objective ID C-O4, got %s", saved.Objectives[1].ID)
	}
	if saved.Objectives[1].ParentID != "C" {
		t.Errorf("Expected new objective ParentID C, got %s", saved.Objectives[1].ParentID)
	}
}

func TestBackwardCompatibility_NoObjectivesField(t *testing.T) {
	// Test that JSON without the "objectives" field on Objective deserializes cleanly
	jsonData := `{
		"themes": [
			{
				"id": "H",
				"name": "Health",
				"color": "#00FF00",
				"objectives": [
					{
						"id": "H-O1",
						"parentId": "H",
						"title": "Fitness",
						"keyResults": [
							{"id": "H-KR1", "parentId": "H-O1", "description": "Run 5k"}
						]
					}
				]
			}
		]
	}`

	var themesFile ThemesFile
	err := json.Unmarshal([]byte(jsonData), &themesFile)
	if err != nil {
		t.Fatalf("Failed to unmarshal backward-compatible JSON: %v", err)
	}

	if len(themesFile.Themes) != 1 {
		t.Fatalf("Expected 1 theme, got %d", len(themesFile.Themes))
	}

	obj := themesFile.Themes[0].Objectives[0]
	if len(obj.Objectives) != 0 {
		t.Errorf("Expected 0 child objectives for backward-compat JSON, got %d", len(obj.Objectives))
	}
}

// Theme-Scoped ID Tests


func TestIsValidThemeID(t *testing.T) {
	tests := []struct {
		id    string
		valid bool
	}{
		{"H", true},
		{"CF", true},
		{"LRN", true},
		{"ABCD", false},
		{"h", false},
		{"", false},
		{"H-O1", false},
		{"123", false},
	}

	for _, tt := range tests {
		t.Run(tt.id, func(t *testing.T) {
			result := IsValidThemeID(tt.id)
			if result != tt.valid {
				t.Errorf("IsValidThemeID(%q) = %v, want %v", tt.id, result, tt.valid)
			}
		})
	}
}

func TestExtractThemeAbbr(t *testing.T) {
	tests := []struct {
		id       string
		expected string
	}{
		{"H", "H"},
		{"CF", "CF"},
		{"LRN", "LRN"},
		{"H-O1", "H"},
		{"CF-KR2", "CF"},
		{"LRN-T5", "LRN"},
		{"INVALID", ""},
		{"", ""},
	}

	for _, tt := range tests {
		t.Run(tt.id, func(t *testing.T) {
			result := ExtractThemeAbbr(tt.id)
			if result != tt.expected {
				t.Errorf("ExtractThemeAbbr(%q) = %q, want %q", tt.id, result, tt.expected)
			}
		})
	}
}

// Task Order Tests

func TestLoadTaskOrder_Missing(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	order, err := env.tasks.LoadTaskOrder()
	if err != nil {
		t.Fatalf("LoadTaskOrder failed: %v", err)
	}
	if len(order) != 0 {
		t.Errorf("Expected empty map, got %d entries", len(order))
	}
}

func TestSaveAndLoadTaskOrder(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	order := map[string][]string{
		"doing":            {"H-T1", "H-T2"},
		"important-urgent": {"H-T3", "H-T4", "H-T5"},
	}

	if err := env.tasks.SaveTaskOrder(order); err != nil {
		t.Fatalf("SaveTaskOrder failed: %v", err)
	}

	loaded, err := env.tasks.LoadTaskOrder()
	if err != nil {
		t.Fatalf("LoadTaskOrder failed: %v", err)
	}

	if len(loaded) != 2 {
		t.Fatalf("Expected 2 zones, got %d", len(loaded))
	}
	if len(loaded["doing"]) != 2 {
		t.Errorf("Expected 2 tasks in doing, got %d", len(loaded["doing"]))
	}
	if loaded["doing"][0] != "H-T1" || loaded["doing"][1] != "H-T2" {
		t.Errorf("Unexpected doing order: %v", loaded["doing"])
	}
	if len(loaded["important-urgent"]) != 3 {
		t.Errorf("Expected 3 tasks in important-urgent, got %d", len(loaded["important-urgent"]))
	}
}

func TestSaveTaskOrder_Overwrite(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Save initial order
	order1 := map[string][]string{"doing": {"H-T1"}}
	if err := env.tasks.SaveTaskOrder(order1); err != nil {
		t.Fatalf("SaveTaskOrder failed: %v", err)
	}

	// Overwrite
	order2 := map[string][]string{"doing": {"H-T2", "H-T1"}}
	if err := env.tasks.SaveTaskOrder(order2); err != nil {
		t.Fatalf("SaveTaskOrder failed: %v", err)
	}

	loaded, err := env.tasks.LoadTaskOrder()
	if err != nil {
		t.Fatalf("LoadTaskOrder failed: %v", err)
	}

	if loaded["doing"][0] != "H-T2" || loaded["doing"][1] != "H-T1" {
		t.Errorf("Expected overwritten order, got %v", loaded["doing"])
	}
}

func TestSaveTaskOrder_Idempotent(t *testing.T) {
	env, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	order := map[string][]string{
		"doing":            {"H-T1", "H-T2"},
		"important-urgent": {"H-T3"},
	}

	// First save — should commit
	if err := env.tasks.SaveTaskOrder(order); err != nil {
		t.Fatalf("First SaveTaskOrder failed: %v", err)
	}

	// Second save with identical data — should succeed (no error)
	if err := env.tasks.SaveTaskOrder(order); err != nil {
		t.Fatalf("Second SaveTaskOrder with identical data should not fail, got: %v", err)
	}

	// Verify only one "Update task order" commit exists (not two)
	gitConfig := &utilities.AuthorConfiguration{User: "Test", Email: "test@example.com"}
	repo, _ := utilities.InitializeRepositoryWithConfig(tmpDir, gitConfig)
	defer repo.Close()

	history, err := repo.GetHistory(10)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}

	orderCommits := 0
	for _, c := range history {
		if c.Message == "Update task order" {
			orderCommits++
		}
	}
	if orderCommits != 1 {
		t.Errorf("Expected exactly 1 'Update task order' commit, got %d", orderCommits)
	}
}

func TestUnit_EnsureDirectoryStructure_CreatesGitignore(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	gitignorePath := filepath.Join(env.tasks.dataPath, ".gitignore")
	data, err := os.ReadFile(gitignorePath)
	if err != nil {
		t.Fatalf("Expected .gitignore to exist: %v", err)
	}
	expected := "navigation_context.json\ntasks/drafts.json\n"
	if string(data) != expected {
		t.Errorf("Expected .gitignore to contain %q, got %q", expected, string(data))
	}
}

func TestSaveTaskWithOrder(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create a theme
	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	task := Task{
		Title:    "Morning run",
		ThemeID:  "H",
		Priority: string(PriorityImportantUrgent),
	}

	saved, err := env.tasks.SaveTaskWithOrder(task, "important-urgent")
	if err != nil {
		t.Fatalf("SaveTaskWithOrder failed: %v", err)
	}

	if saved.ID != "H-T1" {
		t.Errorf("Expected ID H-T1, got %s", saved.ID)
	}

	// Verify task was saved
	tasks, err := env.tasks.GetTasksByTheme("H")
	if err != nil {
		t.Fatalf("GetTasksByTheme failed: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("Expected 1 task, got %d", len(tasks))
	}

	// Verify task order was updated
	order, err := env.tasks.LoadTaskOrder()
	if err != nil {
		t.Fatalf("LoadTaskOrder failed: %v", err)
	}
	if len(order["important-urgent"]) != 1 || order["important-urgent"][0] != "H-T1" {
		t.Errorf("Expected order [H-T1], got %v", order["important-urgent"])
	}
}

func TestSaveTaskWithOrder_Multiple(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Create multiple tasks sequentially
	for i := 0; i < 5; i++ {
		task := Task{
			Title:    "Task",
			ThemeID:  "H",
			Priority: string(PriorityImportantUrgent),
		}
		_, err := env.tasks.SaveTaskWithOrder(task, "important-urgent")
		if err != nil {
			t.Fatalf("SaveTaskWithOrder #%d failed: %v", i+1, err)
		}
	}

	// Verify all 5 tasks exist
	tasks, err := env.tasks.GetTasksByTheme("H")
	if err != nil {
		t.Fatalf("GetTasksByTheme failed: %v", err)
	}
	if len(tasks) != 5 {
		t.Fatalf("Expected 5 tasks, got %d", len(tasks))
	}

	// Verify task order contains all 5
	order, err := env.tasks.LoadTaskOrder()
	if err != nil {
		t.Fatalf("LoadTaskOrder failed: %v", err)
	}
	if len(order["important-urgent"]) != 5 {
		t.Errorf("Expected 5 tasks in order, got %d", len(order["important-urgent"]))
	}
}

func TestDeleteTaskWithOrder(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create a theme
	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Create tasks with order
	task1 := Task{Title: "Task 1", ThemeID: "H", Priority: string(PriorityImportantUrgent)}
	saved1, err := env.tasks.SaveTaskWithOrder(task1, "important-urgent")
	if err != nil {
		t.Fatalf("SaveTaskWithOrder failed: %v", err)
	}

	task2 := Task{Title: "Task 2", ThemeID: "H", Priority: string(PriorityImportantUrgent)}
	_, err = env.tasks.SaveTaskWithOrder(task2, "important-urgent")
	if err != nil {
		t.Fatalf("SaveTaskWithOrder failed: %v", err)
	}

	// Delete first task
	if err := env.tasks.DeleteTaskWithOrder(saved1.ID); err != nil {
		t.Fatalf("DeleteTaskWithOrder failed: %v", err)
	}

	// Verify task was deleted
	tasks, err := env.tasks.GetTasksByTheme("H")
	if err != nil {
		t.Fatalf("GetTasksByTheme failed: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("Expected 1 task after delete, got %d", len(tasks))
	}

	// Verify task order was updated
	order, err := env.tasks.LoadTaskOrder()
	if err != nil {
		t.Fatalf("LoadTaskOrder failed: %v", err)
	}
	if len(order["important-urgent"]) != 1 {
		t.Errorf("Expected 1 task in order after delete, got %d", len(order["important-urgent"]))
	}
	if order["important-urgent"][0] != "H-T2" {
		t.Errorf("Expected remaining task H-T2, got %s", order["important-urgent"][0])
	}
}

func TestUpdateTaskWithOrderMove(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Create task in important-urgent zone
	task := Task{Title: "Morning run", ThemeID: "H", Priority: string(PriorityImportantUrgent)}
	saved, err := env.tasks.SaveTaskWithOrder(task, "important-urgent")
	if err != nil {
		t.Fatalf("SaveTaskWithOrder failed: %v", err)
	}

	// Verify initial zone
	order, _ := env.tasks.LoadTaskOrder()
	if len(order["important-urgent"]) != 1 || order["important-urgent"][0] != saved.ID {
		t.Fatalf("Expected task in important-urgent zone, got %v", order)
	}

	// Move to important-not-urgent zone
	saved.Priority = string(PriorityImportantNotUrgent)
	if err := env.tasks.UpdateTaskWithOrderMove(*saved, "important-urgent", "important-not-urgent"); err != nil {
		t.Fatalf("UpdateTaskWithOrderMove failed: %v", err)
	}

	// Verify task file updated
	tasks, _ := env.tasks.GetTasksByStatus("todo")
	if len(tasks) != 1 {
		t.Fatalf("Expected 1 task, got %d", len(tasks))
	}
	if tasks[0].Priority != string(PriorityImportantNotUrgent) {
		t.Errorf("Expected priority important-not-urgent, got %s", tasks[0].Priority)
	}

	// Verify zone moved in task_order.json
	orderAfter, _ := env.tasks.LoadTaskOrder()
	if len(orderAfter["important-urgent"]) != 0 {
		t.Errorf("Expected empty important-urgent zone, got %v", orderAfter["important-urgent"])
	}
	if len(orderAfter["important-not-urgent"]) != 1 || orderAfter["important-not-urgent"][0] != saved.ID {
		t.Errorf("Expected task in important-not-urgent zone, got %v", orderAfter["important-not-urgent"])
	}
}

func TestUpdateTaskWithOrderMove_MissingFromOldZone(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Create task but DON'T add to order (simulating stale state)
	task := Task{Title: "Orphan task", ThemeID: "H", Priority: string(PriorityImportantUrgent)}
	if err := env.tasks.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	tasks, _ := env.tasks.GetTasksByStatus("todo")
	savedTask := tasks[0]

	// Move from a zone the task isn't in — should still append to new zone
	savedTask.Priority = string(PriorityImportantNotUrgent)
	if err := env.tasks.UpdateTaskWithOrderMove(savedTask, "important-urgent", "important-not-urgent"); err != nil {
		t.Fatalf("UpdateTaskWithOrderMove failed: %v", err)
	}

	order, _ := env.tasks.LoadTaskOrder()
	if len(order["important-not-urgent"]) != 1 || order["important-not-urgent"][0] != savedTask.ID {
		t.Errorf("Expected task in important-not-urgent zone, got %v", order)
	}
}

func TestUnit_EnsureDirectoryStructure_PreservesExistingGitignore(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Overwrite with custom content that already includes tasks/drafts.json
	gitignorePath := filepath.Join(env.tasks.dataPath, ".gitignore")
	custom := "custom_file.txt\nnavigation_context.json\ntasks/drafts.json\n"
	if err := os.WriteFile(gitignorePath, []byte(custom), 0644); err != nil {
		t.Fatalf("Failed to write custom .gitignore: %v", err)
	}

	// Re-run ensureDirectoryStructure
	if err := env.tasks.ensureDirectoryStructure(); err != nil {
		t.Fatalf("ensureDirectoryStructure failed: %v", err)
	}

	data, err := os.ReadFile(gitignorePath)
	if err != nil {
		t.Fatalf("Failed to read .gitignore: %v", err)
	}
	if string(data) != custom {
		t.Errorf("Expected .gitignore to be preserved, got %q", string(data))
	}
}

// --- Archive / Restore tests ---

func TestArchiveTask(t *testing.T) {
	env, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	task := Task{Title: "Morning run", ThemeID: "H", Priority: string(PriorityImportantUrgent)}
	if err := env.tasks.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Move to done first, then archive
	if err := env.tasks.MoveTask("H-T1", "done"); err != nil {
		t.Fatalf("MoveTask failed: %v", err)
	}

	if err := env.tasks.ArchiveTask("H-T1"); err != nil {
		t.Fatalf("ArchiveTask failed: %v", err)
	}

	// Verify task is in archived
	archivedTasks, err := env.tasks.GetTasksByStatus("archived")
	if err != nil {
		t.Fatalf("GetTasksByStatus failed: %v", err)
	}
	if len(archivedTasks) != 1 {
		t.Errorf("Expected 1 archived task, got %d", len(archivedTasks))
	}

	// Verify removed from done
	doneTasks, _ := env.tasks.GetTasksByStatus("done")
	if len(doneTasks) != 0 {
		t.Errorf("Expected 0 done tasks, got %d", len(doneTasks))
	}

	// Verify file location
	newPath := filepath.Join(tmpDir, "data", "tasks", "archived", "H-T1.json")
	if _, err := os.Stat(newPath); os.IsNotExist(err) {
		t.Error("Task file not found in archived location")
	}
}

func TestArchiveTask_AlreadyArchived(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	task := Task{Title: "Test", ThemeID: "H", Priority: string(PriorityImportantUrgent)}
	if err := env.tasks.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}
	if err := env.tasks.ArchiveTask("H-T1"); err != nil {
		t.Fatalf("ArchiveTask failed: %v", err)
	}

	// Archiving again should be a no-op
	if err := env.tasks.ArchiveTask("H-T1"); err != nil {
		t.Errorf("ArchiveTask on already archived task should not error, got: %v", err)
	}
}

func TestArchiveTask_NotFound(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	err := env.tasks.ArchiveTask("H-T999")
	if err == nil {
		t.Error("Expected error for non-existent task")
	}
}

func TestRestoreTask(t *testing.T) {
	env, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	task := Task{Title: "Morning run", ThemeID: "H", Priority: string(PriorityImportantUrgent)}
	if err := env.tasks.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}
	if err := env.tasks.ArchiveTask("H-T1"); err != nil {
		t.Fatalf("ArchiveTask failed: %v", err)
	}

	if err := env.tasks.RestoreTask("H-T1"); err != nil {
		t.Fatalf("RestoreTask failed: %v", err)
	}

	// Verify task is in done
	doneTasks, err := env.tasks.GetTasksByStatus("done")
	if err != nil {
		t.Fatalf("GetTasksByStatus failed: %v", err)
	}
	if len(doneTasks) != 1 {
		t.Errorf("Expected 1 done task, got %d", len(doneTasks))
	}

	// Verify removed from archived
	archivedTasks, _ := env.tasks.GetTasksByStatus("archived")
	if len(archivedTasks) != 0 {
		t.Errorf("Expected 0 archived tasks, got %d", len(archivedTasks))
	}

	// Verify file location
	donePath := filepath.Join(tmpDir, "data", "tasks", "done", "H-T1.json")
	if _, err := os.Stat(donePath); os.IsNotExist(err) {
		t.Error("Task file not found in done location")
	}
}

func TestRestoreTask_NotArchived(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	task := Task{Title: "Test", ThemeID: "H", Priority: string(PriorityImportantUrgent)}
	if err := env.tasks.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	err := env.tasks.RestoreTask("H-T1")
	if err == nil {
		t.Error("Expected error when restoring non-archived task")
	}
}

func TestRestoreTask_NotFound(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	err := env.tasks.RestoreTask("H-T999")
	if err == nil {
		t.Error("Expected error for non-existent task")
	}
}

func TestGetTasksByStatus_Archived(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Create two tasks, archive one
	t1 := Task{Title: "Task 1", ThemeID: "H", Priority: string(PriorityImportantUrgent)}
	t2 := Task{Title: "Task 2", ThemeID: "H", Priority: string(PriorityImportantUrgent)}
	if err := env.tasks.SaveTask(t1); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}
	if err := env.tasks.SaveTask(t2); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}
	if err := env.tasks.ArchiveTask("H-T1"); err != nil {
		t.Fatalf("ArchiveTask failed: %v", err)
	}

	// Should find only the archived task
	archivedTasks, err := env.tasks.GetTasksByStatus("archived")
	if err != nil {
		t.Fatalf("GetTasksByStatus failed: %v", err)
	}
	if len(archivedTasks) != 1 {
		t.Errorf("Expected 1 archived task, got %d", len(archivedTasks))
	}
	if archivedTasks[0].ID != "H-T1" {
		t.Errorf("Expected archived task H-T1, got %s", archivedTasks[0].ID)
	}
}

func TestAllTaskStatuses_IncludesArchived(t *testing.T) {
	statuses := AllTaskStatuses()
	found := false
	for _, s := range statuses {
		if s == TaskStatusArchived {
			found = true
			break
		}
	}
	if !found {
		t.Error("AllTaskStatuses should include archived")
	}
}

func TestGetTasksByTheme_IncludesArchivedForIDGeneration(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Create two tasks: H-T1 and H-T2
	task1 := Task{Title: "Task one", ThemeID: "H", Priority: string(PriorityImportantUrgent)}
	if err := env.tasks.SaveTask(task1); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}
	task2 := Task{Title: "Task two", ThemeID: "H", Priority: string(PriorityImportantUrgent)}
	if err := env.tasks.SaveTask(task2); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Archive both tasks
	if err := env.tasks.ArchiveTask("H-T1"); err != nil {
		t.Fatalf("ArchiveTask H-T1 failed: %v", err)
	}
	if err := env.tasks.ArchiveTask("H-T2"); err != nil {
		t.Fatalf("ArchiveTask H-T2 failed: %v", err)
	}

	// Create a new task — should get H-T3, not H-T1 (collision with archived)
	task3 := Task{Title: "Task three", ThemeID: "H", Priority: string(PriorityImportantUrgent)}
	if err := env.tasks.SaveTask(task3); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Verify new task got H-T3
	todoTasks, err := env.tasks.GetTasksByStatus("todo")
	if err != nil {
		t.Fatalf("GetTasksByStatus failed: %v", err)
	}
	if len(todoTasks) != 1 {
		t.Fatalf("Expected 1 todo task, got %d", len(todoTasks))
	}
	if todoTasks[0].ID != "H-T3" {
		t.Errorf("Expected new task ID H-T3, got %s (ID collision with archived task)", todoTasks[0].ID)
	}
}

func TestUnit_SaveTaskFile_RejectsDuplicateID(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create theme
	theme := LifeTheme{ID: "H", Name: "Health", Color: "#00FF00"}
	if err := env.themes.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Create a task normally — gets H-T1
	task1 := Task{Title: "Task one", ThemeID: "H", Priority: string(PriorityImportantUrgent)}
	if err := env.tasks.SaveTask(task1); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Manually place a rogue file at H-T2 in archived (simulating corruption)
	archivedDir := env.tasks.taskDirPath("archived")
	if err := os.MkdirAll(archivedDir, 0755); err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}
	rogueTask := Task{ID: "H-T2", Title: "Rogue", ThemeID: "H", Priority: string(PriorityImportantUrgent)}
	rogueData, _ := json.Marshal(rogueTask)
	roguePath := env.tasks.taskFilePath("archived", "H-T2")
	if err := os.WriteFile(roguePath, rogueData, 0644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	// generateTaskID scans filenames on disk, so it sees H-T1 in todo and
	// H-T2 in archived — even if H-T2's internal themeId doesn't match.
	// It generates H-T3 (max=2, next=3).
	task2 := Task{Title: "Task two", ThemeID: "H", Priority: string(PriorityImportantUrgent)}
	if err := env.tasks.SaveTask(task2); err != nil {
		t.Fatalf("SaveTask should succeed (generateTaskID returns H-T3, no conflict): %v", err)
	}

	// Verify H-T3 was created (H-T2 was seen in archived, so max=2, next=3)
	todoTasks, err := env.tasks.GetTasksByStatus("todo")
	if err != nil {
		t.Fatalf("GetTasksByStatus failed: %v", err)
	}
	found := false
	for _, task := range todoTasks {
		if task.ID == "H-T3" {
			found = true
		}
	}
	if !found {
		t.Error("Expected H-T3 in todo tasks")
	}
}

func TestGenerateTaskIDMismatchedThemeInFile(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create two themes
	if err := env.themes.SaveTheme(LifeTheme{ID: "W", Name: "Work", Color: "#FF0000"}); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}
	if err := env.themes.SaveTheme(LifeTheme{ID: "L", Name: "Life", Color: "#00FF00"}); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Place a file named W-T1.json in archived with themeId "L" (data inconsistency)
	archivedDir := env.tasks.taskDirPath("archived")
	if err := os.MkdirAll(archivedDir, 0755); err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}
	rogueTask := Task{ID: "W-T1", Title: "Mismatched", ThemeID: "L", Priority: string(PriorityImportantUrgent)}
	rogueData, _ := json.Marshal(rogueTask)
	if err := os.WriteFile(env.tasks.taskFilePath("archived", "W-T1"), rogueData, 0644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	// Creating a new W task should skip W-T1 and produce W-T2
	newTask := Task{Title: "New work task", ThemeID: "W", Priority: string(PriorityImportantUrgent)}
	if err := env.tasks.SaveTask(newTask); err != nil {
		t.Fatalf("SaveTask should succeed but got: %v", err)
	}

	todoTasks, err := env.tasks.GetTasksByStatus("todo")
	if err != nil {
		t.Fatalf("GetTasksByStatus failed: %v", err)
	}
	found := false
	for _, task := range todoTasks {
		if task.ID == "W-T2" {
			found = true
		}
	}
	if !found {
		ids := make([]string, len(todoTasks))
		for i, task := range todoTasks {
			ids[i] = task.ID
		}
		t.Errorf("Expected W-T2 in todo tasks, got: %v", ids)
	}
}

func TestIsAnyTaskStatus(t *testing.T) {
	if !IsAnyTaskStatus("archived") {
		t.Error("IsAnyTaskStatus should accept 'archived'")
	}
	if !IsAnyTaskStatus("todo") {
		t.Error("IsAnyTaskStatus should accept 'todo'")
	}
	if IsAnyTaskStatus("invalid") {
		t.Error("IsAnyTaskStatus should reject 'invalid'")
	}
}

// === Board Configuration Persistence Tests ===

func TestUnit_GetBoardConfiguration_NilWhenNoFile(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	config, err := env.tasks.GetBoardConfiguration()
	if err != nil {
		t.Fatalf("GetBoardConfiguration failed: %v", err)
	}
	if config != nil {
		t.Errorf("Expected nil config when no file exists, got %+v", config)
	}
}

func TestUnit_SaveAndGetBoardConfiguration(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	custom := &BoardConfiguration{
		Name: "Custom Board",
		ColumnDefinitions: []ColumnDefinition{
			{Name: "todo", Title: "Backlog", Type: ColumnTypeTodo},
			{Name: "in-review", Title: "In Review", Type: ColumnTypeDoing},
			{Name: "doing", Title: "Doing", Type: ColumnTypeDoing},
			{Name: "done", Title: "Done", Type: ColumnTypeDone},
		},
	}

	if err := env.tasks.SaveBoardConfiguration(custom); err != nil {
		t.Fatalf("SaveBoardConfiguration failed: %v", err)
	}

	loaded, err := env.tasks.GetBoardConfiguration()
	if err != nil {
		t.Fatalf("GetBoardConfiguration failed: %v", err)
	}
	if loaded.Name != "Custom Board" {
		t.Errorf("Expected 'Custom Board', got %q", loaded.Name)
	}
	if len(loaded.ColumnDefinitions) != 4 {
		t.Errorf("Expected 4 columns, got %d", len(loaded.ColumnDefinitions))
	}
	if loaded.ColumnDefinitions[1].Name != "in-review" {
		t.Errorf("Expected second column 'in-review', got %q", loaded.ColumnDefinitions[1].Name)
	}
}

func TestUnit_FindTaskInPlan_DynamicStatuses(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Save a custom config with an extra column
	custom := &BoardConfiguration{
		Name: "Custom Board",
		ColumnDefinitions: []ColumnDefinition{
			{Name: "todo", Title: "TODO", Type: ColumnTypeTodo},
			{Name: "review", Title: "Review", Type: ColumnTypeDoing},
			{Name: "done", Title: "Done", Type: ColumnTypeDone},
		},
	}
	if err := env.tasks.SaveBoardConfiguration(custom); err != nil {
		t.Fatalf("SaveBoardConfiguration failed: %v", err)
	}

	// Create the review directory and put a task in it
	if err := env.tasks.EnsureStatusDirectory("review"); err != nil {
		t.Fatalf("EnsureStatusDirectory failed: %v", err)
	}

	task := Task{ID: "T-T1", ThemeID: "T", Title: "Review task", Priority: "important-urgent"}
	if err := writeJSON(env.tasks.taskFilePath("review", "T-T1"), task); err != nil {
		t.Fatalf("Failed to write task: %v", err)
	}

	// findTaskInPlan should find it in the "review" status
	found, status, _, err := env.tasks.findTaskInPlan("T-T1")
	if err != nil {
		t.Fatalf("findTaskInPlan failed: %v", err)
	}
	if found == nil {
		t.Fatal("Expected to find task T-T1")
	}
	if status != "review" {
		t.Errorf("Expected status 'review', got %q", status)
	}
}

func TestUnit_EnsureStatusDirectory(t *testing.T) {
	env, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	dirPath := filepath.Join(tmpDir, "data", "tasks", "in-review")

	if err := env.tasks.EnsureStatusDirectory("in-review"); err != nil {
		t.Fatalf("EnsureStatusDirectory failed: %v", err)
	}
	if _, err := os.Stat(dirPath); os.IsNotExist(err) {
		t.Error("Expected directory to exist after EnsureStatusDirectory")
	}

	if err := env.tasks.EnsureStatusDirectory("in-review"); err != nil {
		t.Fatalf("Idempotent EnsureStatusDirectory failed: %v", err)
	}
	if _, err := os.Stat(dirPath); os.IsNotExist(err) {
		t.Error("Expected directory to still exist after idempotent call")
	}
}

func TestUnit_RemoveStatusDirectory(t *testing.T) {
	env, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	if err := env.tasks.EnsureStatusDirectory("empty-col"); err != nil {
		t.Fatalf("EnsureStatusDirectory failed: %v", err)
	}
	if err := env.tasks.RemoveStatusDirectory("empty-col"); err != nil {
		t.Fatalf("RemoveStatusDirectory on empty dir failed: %v", err)
	}
	dirPath := filepath.Join(tmpDir, "data", "tasks", "empty-col")
	if _, err := os.Stat(dirPath); !os.IsNotExist(err) {
		t.Error("Expected directory to be removed")
	}

	if err := env.tasks.EnsureStatusDirectory("non-empty"); err != nil {
		t.Fatalf("EnsureStatusDirectory failed: %v", err)
	}
	filePath := filepath.Join(tmpDir, "data", "tasks", "non-empty", "task.json")
	if err := os.WriteFile(filePath, []byte("{}"), 0644); err != nil {
		t.Fatalf("Failed to create file in directory: %v", err)
	}
	if err := env.tasks.RemoveStatusDirectory("non-empty"); err == nil {
		t.Error("Expected error when removing non-empty directory")
	}
}

func TestUnit_RenameStatusDirectory(t *testing.T) {
	env, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	if err := env.tasks.EnsureStatusDirectory("old-name"); err != nil {
		t.Fatalf("EnsureStatusDirectory failed: %v", err)
	}
	filePath := filepath.Join(tmpDir, "data", "tasks", "old-name", "task.json")
	if err := os.WriteFile(filePath, []byte(`{"id":"T1"}`), 0644); err != nil {
		t.Fatalf("Failed to create file: %v", err)
	}

	if err := env.tasks.RenameStatusDirectory("old-name", "new-name"); err != nil {
		t.Fatalf("RenameStatusDirectory failed: %v", err)
	}

	oldPath := filepath.Join(tmpDir, "data", "tasks", "old-name")
	newPath := filepath.Join(tmpDir, "data", "tasks", "new-name")
	if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
		t.Error("Expected old directory to not exist")
	}
	if _, err := os.Stat(newPath); os.IsNotExist(err) {
		t.Error("Expected new directory to exist")
	}
	movedFile := filepath.Join(newPath, "task.json")
	data, err := os.ReadFile(movedFile)
	if err != nil {
		t.Fatalf("Expected file to exist under new name: %v", err)
	}
	if string(data) != `{"id":"T1"}` {
		t.Errorf("Expected file contents preserved, got %s", string(data))
	}
}

func TestUnit_CommitAll(t *testing.T) {
	env, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	gitConfig := &utilities.AuthorConfiguration{User: "Test", Email: "test@example.com"}
	repo, _ := utilities.InitializeRepositoryWithConfig(tmpDir, gitConfig)
	defer repo.Close()

	baseHistory, err := repo.GetHistory(100)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	baseCount := len(baseHistory)

	configPath := env.tasks.boardConfigFilePath()
	if err := writeJSON(configPath, map[string]string{"name": "modified"}); err != nil {
		t.Fatalf("Failed to write board config: %v", err)
	}
	taskFile := filepath.Join(tmpDir, "data", "tasks", "todo", "X-T1.json")
	if err := os.WriteFile(taskFile, []byte(`{"id":"X-T1"}`), 0644); err != nil {
		t.Fatalf("Failed to write task file: %v", err)
	}

	if err := env.tasks.CommitAll("batch update"); err != nil {
		t.Fatalf("CommitAll failed: %v", err)
	}

	afterHistory, err := repo.GetHistory(100)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if len(afterHistory)-baseCount != 1 {
		t.Errorf("Expected exactly 1 new commit, got %d", len(afterHistory)-baseCount)
	}
	if afterHistory[0].Message != "batch update" {
		t.Errorf("Expected commit message 'batch update', got %q", afterHistory[0].Message)
	}

	status, err := repo.Status()
	if err != nil {
		t.Fatalf("Status failed: %v", err)
	}
	if len(status.ModifiedFiles)+len(status.StagedFiles)+len(status.UntrackedFiles) != 0 {
		t.Error("Expected no uncommitted files after CommitAll")
	}
}

func TestUnit_WriteTaskOrder(t *testing.T) {
	env, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	gitConfig := &utilities.AuthorConfiguration{User: "Test", Email: "test@example.com"}
	repo, _ := utilities.InitializeRepositoryWithConfig(tmpDir, gitConfig)
	defer repo.Close()

	beforeHistory, err := repo.GetHistory(100)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	beforeCount := len(beforeHistory)

	order := map[string][]string{"todo": {"H-T1", "H-T2"}}
	if err := env.tasks.WriteTaskOrder(order); err != nil {
		t.Fatalf("WriteTaskOrder failed: %v", err)
	}

	filePath := filepath.Join(tmpDir, "data", "task_order.json")
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		t.Error("Expected task_order.json to exist on disk")
	}

	afterHistory, err := repo.GetHistory(100)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if len(afterHistory) != beforeCount {
		t.Errorf("Expected no new git commit, but commit count changed from %d to %d", beforeCount, len(afterHistory))
	}
}

// === Slugify Tests ===

func TestUnit_Slugify(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"In Review", "in-review"},
		{"DOING", "doing"},
		{"  In Progress  ", "in-progress"},
		{"hello--world", "hello-world"},
		{"Special!@#Chars", "special-chars"},
		{"", ""},
		{"---", ""},
		{"a", "a"},
		{"Hello World 123", "hello-world-123"},
		{"Über Cool", "ber-cool"}, // Non-ASCII becomes hyphen, leading hyphen trimmed
	}

	for _, tt := range tests {
		got := Slugify(tt.input)
		if got != tt.expected {
			t.Errorf("Slugify(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestUnit_EnsureDirectoryStructure_CustomConfig(t *testing.T) {
	env, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Save custom config before calling ensureDirectoryStructure
	custom := &BoardConfiguration{
		Name: "Custom Board",
		ColumnDefinitions: []ColumnDefinition{
			{Name: "backlog", Title: "Backlog", Type: ColumnTypeTodo},
			{Name: "in-progress", Title: "In Progress", Type: ColumnTypeDoing},
			{Name: "review", Title: "Review", Type: ColumnTypeDoing},
			{Name: "shipped", Title: "Shipped", Type: ColumnTypeDone},
		},
	}
	if err := env.tasks.SaveBoardConfiguration(custom); err != nil {
		t.Fatalf("SaveBoardConfiguration failed: %v", err)
	}

	// Re-run ensureDirectoryStructure
	if err := env.tasks.ensureDirectoryStructure(); err != nil {
		t.Fatalf("ensureDirectoryStructure failed: %v", err)
	}

	// Verify custom directories exist
	for _, slug := range []string{"backlog", "in-progress", "review", "shipped", "archived"} {
		dirPath := filepath.Join(tmpDir, "data", "tasks", slug)
		if _, err := os.Stat(dirPath); os.IsNotExist(err) {
			t.Errorf("Expected directory %q to exist", slug)
		}
	}
}
