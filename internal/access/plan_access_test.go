package access

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/rkn/bearing/internal/utilities"
)

// Test helper to create a test repository and PlanAccess instance
func setupTestPlanAccess(t *testing.T) (*PlanAccess, string, func()) {
	t.Helper()

	// Create temporary directory
	tmpDir, err := os.MkdirTemp("", "plan_access_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	// Create data subdirectory
	dataDir := filepath.Join(tmpDir, "data")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to create data dir: %v", err)
	}

	// Initialize git repository
	gitConfig := &utilities.AuthorConfiguration{
		User:  "Test User",
		Email: "test@example.com",
	}

	repo, err := utilities.InitializeRepositoryWithConfig(tmpDir, gitConfig)
	if err != nil {
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to initialize repository: %v", err)
	}

	// Create PlanAccess
	pa, err := NewPlanAccess(dataDir, repo)
	if err != nil {
		repo.Close()
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to create PlanAccess: %v", err)
	}

	cleanup := func() {
		repo.Close()
		os.RemoveAll(tmpDir)
	}

	return pa, tmpDir, cleanup
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
	if len(priorities) != 4 {
		t.Errorf("Expected 4 priorities, got %d", len(priorities))
	}
}

func TestIsValidPriority(t *testing.T) {
	tests := []struct {
		priority string
		valid    bool
	}{
		{"important-urgent", true},
		{"important-not-urgent", true},
		{"not-important-urgent", true},
		{"not-important-not-urgent", true},
		{"invalid", false},
		{"", false},
	}

	for _, tt := range tests {
		t.Run(tt.priority, func(t *testing.T) {
			result := IsValidPriority(tt.priority)
			if result != tt.valid {
				t.Errorf("IsValidPriority(%s) = %v, want %v", tt.priority, result, tt.valid)
			}
		})
	}
}

// PlanAccess Constructor Tests

func TestNewPlanAccess_EmptyDataPath(t *testing.T) {
	_, err := NewPlanAccess("", nil)
	if err == nil {
		t.Error("Expected error for empty dataPath")
	}
}

func TestNewPlanAccess_NilRepo(t *testing.T) {
	_, err := NewPlanAccess("/tmp/test", nil)
	if err == nil {
		t.Error("Expected error for nil repo")
	}
}

func TestNewPlanAccess_CreatesDirectoryStructure(t *testing.T) {
	pa, tmpDir, cleanup := setupTestPlanAccess(t)
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

	_ = pa // Use pa to avoid unused variable warning
}

// Theme Tests

func TestGetThemes_EmptyRepository(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	themes, err := pa.GetThemes()
	if err != nil {
		t.Fatalf("GetThemes failed: %v", err)
	}

	if len(themes) != 0 {
		t.Errorf("Expected 0 themes, got %d", len(themes))
	}
}

func TestSaveTheme_NewTheme(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	theme := LifeTheme{
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

	err := pa.SaveTheme(theme)
	if err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Verify theme was saved
	themes, err := pa.GetThemes()
	if err != nil {
		t.Fatalf("GetThemes failed: %v", err)
	}

	if len(themes) != 1 {
		t.Fatalf("Expected 1 theme, got %d", len(themes))
	}

	saved := themes[0]
	if saved.ID != "THEME-01" {
		t.Errorf("Expected ID THEME-01, got %s", saved.ID)
	}
	if saved.Name != "Health" {
		t.Errorf("Expected name Health, got %s", saved.Name)
	}
	if saved.Color != "#00FF00" {
		t.Errorf("Expected color #00FF00, got %s", saved.Color)
	}

	// Check hierarchical IDs
	if len(saved.Objectives) != 1 {
		t.Fatalf("Expected 1 objective, got %d", len(saved.Objectives))
	}
	obj := saved.Objectives[0]
	if obj.ID != "THEME-01.OKR-01" {
		t.Errorf("Expected objective ID THEME-01.OKR-01, got %s", obj.ID)
	}

	if len(obj.KeyResults) != 2 {
		t.Fatalf("Expected 2 key results, got %d", len(obj.KeyResults))
	}
	if obj.KeyResults[0].ID != "THEME-01.OKR-01.KR-01" {
		t.Errorf("Expected KR ID THEME-01.OKR-01.KR-01, got %s", obj.KeyResults[0].ID)
	}
	if obj.KeyResults[1].ID != "THEME-01.OKR-01.KR-02" {
		t.Errorf("Expected KR ID THEME-01.OKR-01.KR-02, got %s", obj.KeyResults[1].ID)
	}
}

func TestSaveTheme_UpdateExisting(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create initial theme
	theme := LifeTheme{
		Name:  "Health",
		Color: "#00FF00",
	}
	err := pa.SaveTheme(theme)
	if err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Update the theme
	updatedTheme := LifeTheme{
		ID:    "THEME-01",
		Name:  "Health & Wellness",
		Color: "#00FF99",
	}
	err = pa.SaveTheme(updatedTheme)
	if err != nil {
		t.Fatalf("SaveTheme update failed: %v", err)
	}

	// Verify update
	themes, err := pa.GetThemes()
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
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	themes := []LifeTheme{
		{Name: "Health", Color: "#00FF00"},
		{Name: "Career", Color: "#0000FF"},
		{Name: "Family", Color: "#FF0000"},
	}

	for _, theme := range themes {
		if err := pa.SaveTheme(theme); err != nil {
			t.Fatalf("SaveTheme failed: %v", err)
		}
	}

	saved, err := pa.GetThemes()
	if err != nil {
		t.Fatalf("GetThemes failed: %v", err)
	}

	if len(saved) != 3 {
		t.Fatalf("Expected 3 themes, got %d", len(saved))
	}

	// Verify IDs are sequential
	expectedIDs := []string{"THEME-01", "THEME-02", "THEME-03"}
	for i, theme := range saved {
		if theme.ID != expectedIDs[i] {
			t.Errorf("Expected ID %s, got %s", expectedIDs[i], theme.ID)
		}
	}
}

func TestDeleteTheme(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create themes
	theme1 := LifeTheme{Name: "Health", Color: "#00FF00"}
	theme2 := LifeTheme{Name: "Career", Color: "#0000FF"}

	if err := pa.SaveTheme(theme1); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}
	if err := pa.SaveTheme(theme2); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Delete first theme
	err := pa.DeleteTheme("THEME-01")
	if err != nil {
		t.Fatalf("DeleteTheme failed: %v", err)
	}

	// Verify deletion
	themes, err := pa.GetThemes()
	if err != nil {
		t.Fatalf("GetThemes failed: %v", err)
	}

	if len(themes) != 1 {
		t.Fatalf("Expected 1 theme, got %d", len(themes))
	}

	if themes[0].ID != "THEME-02" {
		t.Errorf("Expected remaining theme to be THEME-02, got %s", themes[0].ID)
	}
}

func TestDeleteTheme_NotFound(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	err := pa.DeleteTheme("THEME-99")
	if err == nil {
		t.Error("Expected error when deleting non-existent theme")
	}
}

// DayFocus Tests

func TestGetDayFocus_NotFound(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	dayFocus, err := pa.GetDayFocus("2026-01-15")
	if err != nil {
		t.Fatalf("GetDayFocus failed: %v", err)
	}

	if dayFocus != nil {
		t.Error("Expected nil for non-existent day focus")
	}
}

func TestSaveDayFocus(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create a theme first
	theme := LifeTheme{Name: "Health", Color: "#00FF00"}
	if err := pa.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Save day focus
	dayFocus := DayFocus{
		Date:    "2026-01-15",
		ThemeID: "THEME-01",
		Notes:   "Focus on morning exercise",
	}

	err := pa.SaveDayFocus(dayFocus)
	if err != nil {
		t.Fatalf("SaveDayFocus failed: %v", err)
	}

	// Retrieve and verify
	retrieved, err := pa.GetDayFocus("2026-01-15")
	if err != nil {
		t.Fatalf("GetDayFocus failed: %v", err)
	}

	if retrieved == nil {
		t.Fatal("Expected day focus, got nil")
	}

	if retrieved.Date != "2026-01-15" {
		t.Errorf("Expected date 2026-01-15, got %s", retrieved.Date)
	}
	if retrieved.ThemeID != "THEME-01" {
		t.Errorf("Expected themeID THEME-01, got %s", retrieved.ThemeID)
	}
	if retrieved.Notes != "Focus on morning exercise" {
		t.Errorf("Expected notes, got %s", retrieved.Notes)
	}
}

func TestSaveDayFocus_Update(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Save initial day focus
	dayFocus := DayFocus{
		Date:    "2026-01-15",
		ThemeID: "THEME-01",
		Notes:   "Initial notes",
	}

	if err := pa.SaveDayFocus(dayFocus); err != nil {
		t.Fatalf("SaveDayFocus failed: %v", err)
	}

	// Update
	dayFocus.Notes = "Updated notes"
	if err := pa.SaveDayFocus(dayFocus); err != nil {
		t.Fatalf("SaveDayFocus update failed: %v", err)
	}

	// Verify
	retrieved, err := pa.GetDayFocus("2026-01-15")
	if err != nil {
		t.Fatalf("GetDayFocus failed: %v", err)
	}

	if retrieved.Notes != "Updated notes" {
		t.Errorf("Expected updated notes, got %s", retrieved.Notes)
	}
}

func TestGetYearFocus(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Save multiple day focuses
	days := []DayFocus{
		{Date: "2026-01-15", ThemeID: "THEME-01", Notes: "Day 1"},
		{Date: "2026-01-16", ThemeID: "THEME-01", Notes: "Day 2"},
		{Date: "2026-02-01", ThemeID: "THEME-02", Notes: "Day 3"},
	}

	for _, day := range days {
		if err := pa.SaveDayFocus(day); err != nil {
			t.Fatalf("SaveDayFocus failed: %v", err)
		}
	}

	// Get year focus
	yearFocus, err := pa.GetYearFocus(2026)
	if err != nil {
		t.Fatalf("GetYearFocus failed: %v", err)
	}

	if len(yearFocus) != 3 {
		t.Errorf("Expected 3 day focuses, got %d", len(yearFocus))
	}

	// Verify sorted by date
	if yearFocus[0].Date != "2026-01-15" {
		t.Errorf("Expected first date 2026-01-15, got %s", yearFocus[0].Date)
	}
	if yearFocus[2].Date != "2026-02-01" {
		t.Errorf("Expected last date 2026-02-01, got %s", yearFocus[2].Date)
	}
}

func TestGetYearFocus_EmptyYear(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	yearFocus, err := pa.GetYearFocus(2025)
	if err != nil {
		t.Fatalf("GetYearFocus failed: %v", err)
	}

	if len(yearFocus) != 0 {
		t.Errorf("Expected 0 day focuses, got %d", len(yearFocus))
	}
}

// Task Tests

func TestSaveTask_NewTask(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create a theme first
	theme := LifeTheme{Name: "Health", Color: "#00FF00"}
	if err := pa.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Save task
	task := Task{
		Title:    "Morning run",
		ThemeID:  "THEME-01",
		DayDate:  "2026-01-15",
		Priority: string(PriorityImportantUrgent),
	}

	err := pa.SaveTask(task)
	if err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Retrieve and verify
	tasks, err := pa.GetTasksByTheme("THEME-01")
	if err != nil {
		t.Fatalf("GetTasksByTheme failed: %v", err)
	}

	if len(tasks) != 1 {
		t.Fatalf("Expected 1 task, got %d", len(tasks))
	}

	saved := tasks[0]
	if saved.ID != "task-001" {
		t.Errorf("Expected ID task-001, got %s", saved.ID)
	}
	if saved.Title != "Morning run" {
		t.Errorf("Expected title 'Morning run', got %s", saved.Title)
	}
}

func TestSaveTask_EmptyThemeID(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	task := Task{
		Title: "Test task",
	}

	err := pa.SaveTask(task)
	if err == nil {
		t.Error("Expected error for empty themeID")
	}
}

func TestGetTasksByStatus(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create theme
	theme := LifeTheme{Name: "Health", Color: "#00FF00"}
	if err := pa.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Save task (defaults to todo)
	task := Task{
		Title:   "Morning run",
		ThemeID: "THEME-01",
	}

	if err := pa.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Get tasks by status
	todoTasks, err := pa.GetTasksByStatus("THEME-01", "todo")
	if err != nil {
		t.Fatalf("GetTasksByStatus failed: %v", err)
	}

	if len(todoTasks) != 1 {
		t.Errorf("Expected 1 todo task, got %d", len(todoTasks))
	}

	// No doing tasks
	doingTasks, err := pa.GetTasksByStatus("THEME-01", "doing")
	if err != nil {
		t.Fatalf("GetTasksByStatus failed: %v", err)
	}

	if len(doingTasks) != 0 {
		t.Errorf("Expected 0 doing tasks, got %d", len(doingTasks))
	}
}

func TestGetTasksByStatus_InvalidStatus(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	_, err := pa.GetTasksByStatus("THEME-01", "invalid")
	if err == nil {
		t.Error("Expected error for invalid status")
	}
}

func TestMoveTask(t *testing.T) {
	pa, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create theme
	theme := LifeTheme{Name: "Health", Color: "#00FF00"}
	if err := pa.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Save task
	task := Task{
		Title:   "Morning run",
		ThemeID: "THEME-01",
	}

	if err := pa.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Move to doing
	err := pa.MoveTask("task-001", "doing")
	if err != nil {
		t.Fatalf("MoveTask failed: %v", err)
	}

	// Verify task moved
	todoTasks, _ := pa.GetTasksByStatus("THEME-01", "todo")
	doingTasks, _ := pa.GetTasksByStatus("THEME-01", "doing")

	if len(todoTasks) != 0 {
		t.Errorf("Expected 0 todo tasks, got %d", len(todoTasks))
	}
	if len(doingTasks) != 1 {
		t.Errorf("Expected 1 doing task, got %d", len(doingTasks))
	}

	// Verify file exists in new location
	newPath := filepath.Join(tmpDir, "data", "tasks", "THEME-01", "doing", "task-001.json")
	if _, err := os.Stat(newPath); os.IsNotExist(err) {
		t.Error("Task file not found in new location")
	}

	// Verify file removed from old location
	oldPath := filepath.Join(tmpDir, "data", "tasks", "THEME-01", "todo", "task-001.json")
	if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
		t.Error("Task file should not exist in old location")
	}
}

func TestMoveTask_InvalidStatus(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	err := pa.MoveTask("task-001", "invalid")
	if err == nil {
		t.Error("Expected error for invalid status")
	}
}

func TestMoveTask_NotFound(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create theme to have something searchable
	theme := LifeTheme{Name: "Health", Color: "#00FF00"}
	if err := pa.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	err := pa.MoveTask("task-999", "doing")
	if err == nil {
		t.Error("Expected error for non-existent task")
	}
}

func TestDeleteTask(t *testing.T) {
	pa, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create theme
	theme := LifeTheme{Name: "Health", Color: "#00FF00"}
	if err := pa.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Save task
	task := Task{
		Title:   "Morning run",
		ThemeID: "THEME-01",
	}

	if err := pa.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Delete task
	err := pa.DeleteTask("task-001")
	if err != nil {
		t.Fatalf("DeleteTask failed: %v", err)
	}

	// Verify deletion
	tasks, err := pa.GetTasksByTheme("THEME-01")
	if err != nil {
		t.Fatalf("GetTasksByTheme failed: %v", err)
	}

	if len(tasks) != 0 {
		t.Errorf("Expected 0 tasks, got %d", len(tasks))
	}

	// Verify file removed
	taskPath := filepath.Join(tmpDir, "data", "tasks", "THEME-01", "todo", "task-001.json")
	if _, err := os.Stat(taskPath); !os.IsNotExist(err) {
		t.Error("Task file should not exist after deletion")
	}
}

func TestDeleteTask_NotFound(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create theme
	theme := LifeTheme{Name: "Health", Color: "#00FF00"}
	if err := pa.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	err := pa.DeleteTask("task-999")
	if err == nil {
		t.Error("Expected error for non-existent task")
	}
}

// Hierarchical ID Generation Tests

func TestHierarchicalIDGeneration(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	theme := LifeTheme{
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

	err := pa.SaveTheme(theme)
	if err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	themes, _ := pa.GetThemes()
	saved := themes[0]

	// Theme ID
	if saved.ID != "THEME-01" {
		t.Errorf("Expected theme ID THEME-01, got %s", saved.ID)
	}

	// First objective
	if saved.Objectives[0].ID != "THEME-01.OKR-01" {
		t.Errorf("Expected objective ID THEME-01.OKR-01, got %s", saved.Objectives[0].ID)
	}

	// First objective's key results
	if saved.Objectives[0].KeyResults[0].ID != "THEME-01.OKR-01.KR-01" {
		t.Errorf("Expected KR ID THEME-01.OKR-01.KR-01, got %s", saved.Objectives[0].KeyResults[0].ID)
	}
	if saved.Objectives[0].KeyResults[1].ID != "THEME-01.OKR-01.KR-02" {
		t.Errorf("Expected KR ID THEME-01.OKR-01.KR-02, got %s", saved.Objectives[0].KeyResults[1].ID)
	}

	// Second objective
	if saved.Objectives[1].ID != "THEME-01.OKR-02" {
		t.Errorf("Expected objective ID THEME-01.OKR-02, got %s", saved.Objectives[1].ID)
	}

	// Second objective's key result
	if saved.Objectives[1].KeyResults[0].ID != "THEME-01.OKR-02.KR-01" {
		t.Errorf("Expected KR ID THEME-01.OKR-02.KR-01, got %s", saved.Objectives[1].KeyResults[0].ID)
	}
}

// Task ID Generation Tests

func TestTaskIDGeneration(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create theme
	theme := LifeTheme{Name: "Health", Color: "#00FF00"}
	if err := pa.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	// Create multiple tasks
	for i := 0; i < 5; i++ {
		task := Task{
			Title:   "Task",
			ThemeID: "THEME-01",
		}
		if err := pa.SaveTask(task); err != nil {
			t.Fatalf("SaveTask failed: %v", err)
		}
	}

	tasks, err := pa.GetTasksByTheme("THEME-01")
	if err != nil {
		t.Fatalf("GetTasksByTheme failed: %v", err)
	}

	if len(tasks) != 5 {
		t.Fatalf("Expected 5 tasks, got %d", len(tasks))
	}

	// Verify sequential IDs
	expectedIDs := []string{"task-001", "task-002", "task-003", "task-004", "task-005"}
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
	pa, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	dataDir := filepath.Join(tmpDir, "data")

	// Create theme
	theme := LifeTheme{
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
	if err := pa.SaveTheme(theme); err != nil {
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
	dayFocus := DayFocus{Date: "2026-01-15", ThemeID: "THEME-01", Notes: "Test"}
	if err := pa.SaveDayFocus(dayFocus); err != nil {
		t.Fatalf("SaveDayFocus failed: %v", err)
	}

	calendarPath := filepath.Join(dataDir, "calendar", "2026.json")
	if _, err := os.Stat(calendarPath); os.IsNotExist(err) {
		t.Error("2026.json should exist")
	}

	// Save task and verify task structure
	task := Task{Title: "Test task", ThemeID: "THEME-01"}
	if err := pa.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	taskPath := filepath.Join(dataDir, "tasks", "THEME-01", "todo", "task-001.json")
	if _, err := os.Stat(taskPath); os.IsNotExist(err) {
		t.Error("task-001.json should exist in todo directory")
	}
}

// Git Versioning Tests

func TestGitVersioning_ThemeCommit(t *testing.T) {
	pa, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create theme
	theme := LifeTheme{Name: "Health", Color: "#00FF00"}
	if err := pa.SaveTheme(theme); err != nil {
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
	pa, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Create theme and task
	theme := LifeTheme{Name: "Health", Color: "#00FF00"}
	if err := pa.SaveTheme(theme); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	task := Task{Title: "Test task", ThemeID: "THEME-01"}
	if err := pa.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Move task
	if err := pa.MoveTask("task-001", "doing"); err != nil {
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
