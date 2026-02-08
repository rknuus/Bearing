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
	if len(priorities) != 3 {
		t.Errorf("Expected 3 priorities, got %d", len(priorities))
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
		{"not-important-not-urgent", false},
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

	// Update the theme (keep same ID)
	updatedTheme := LifeTheme{
		ID:    "H",
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

	// Verify IDs are abbreviations derived from names
	expectedIDs := []string{"H", "C", "F"}
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
	err := pa.DeleteTheme("H")
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

	if themes[0].ID != "C" {
		t.Errorf("Expected remaining theme to be C, got %s", themes[0].ID)
	}
}

func TestDeleteTheme_NotFound(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	err := pa.DeleteTheme("ZZZ")
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
		ThemeID: "H",
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
	if retrieved.ThemeID != "H" {
		t.Errorf("Expected themeID H, got %s", retrieved.ThemeID)
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
		ThemeID: "H",
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
		{Date: "2026-01-15", ThemeID: "H", Notes: "Day 1"},
		{Date: "2026-01-16", ThemeID: "H", Notes: "Day 2"},
		{Date: "2026-02-01", ThemeID: "C", Notes: "Day 3"},
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
		ThemeID:  "H",
		DayDate:  "2026-01-15",
		Priority: string(PriorityImportantUrgent),
	}

	err := pa.SaveTask(task)
	if err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Retrieve and verify
	tasks, err := pa.GetTasksByTheme("H")
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
		ThemeID: "H",
	}

	if err := pa.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Get tasks by status
	todoTasks, err := pa.GetTasksByStatus("H", "todo")
	if err != nil {
		t.Fatalf("GetTasksByStatus failed: %v", err)
	}

	if len(todoTasks) != 1 {
		t.Errorf("Expected 1 todo task, got %d", len(todoTasks))
	}

	// No doing tasks
	doingTasks, err := pa.GetTasksByStatus("H", "doing")
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

	_, err := pa.GetTasksByStatus("H", "invalid")
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
		ThemeID: "H",
	}

	if err := pa.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Move to doing
	err := pa.MoveTask("H-T1", "doing")
	if err != nil {
		t.Fatalf("MoveTask failed: %v", err)
	}

	// Verify task moved
	todoTasks, _ := pa.GetTasksByStatus("H", "todo")
	doingTasks, _ := pa.GetTasksByStatus("H", "doing")

	if len(todoTasks) != 0 {
		t.Errorf("Expected 0 todo tasks, got %d", len(todoTasks))
	}
	if len(doingTasks) != 1 {
		t.Errorf("Expected 1 doing task, got %d", len(doingTasks))
	}

	// Verify file exists in new location
	newPath := filepath.Join(tmpDir, "data", "tasks", "H", "doing", "H-T1.json")
	if _, err := os.Stat(newPath); os.IsNotExist(err) {
		t.Error("Task file not found in new location")
	}

	// Verify file removed from old location
	oldPath := filepath.Join(tmpDir, "data", "tasks", "H", "todo", "H-T1.json")
	if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
		t.Error("Task file should not exist in old location")
	}
}

func TestMoveTask_InvalidStatus(t *testing.T) {
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	err := pa.MoveTask("H-T1", "invalid")
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

	err := pa.MoveTask("H-T999", "doing")
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
		ThemeID: "H",
	}

	if err := pa.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Delete task
	err := pa.DeleteTask("H-T1")
	if err != nil {
		t.Fatalf("DeleteTask failed: %v", err)
	}

	// Verify deletion
	tasks, err := pa.GetTasksByTheme("H")
	if err != nil {
		t.Fatalf("GetTasksByTheme failed: %v", err)
	}

	if len(tasks) != 0 {
		t.Errorf("Expected 0 tasks, got %d", len(tasks))
	}

	// Verify file removed
	taskPath := filepath.Join(tmpDir, "data", "tasks", "H", "todo", "H-T1.json")
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

	err := pa.DeleteTask("H-T999")
	if err == nil {
		t.Error("Expected error for non-existent task")
	}
}

// Flat ID Generation Tests

func TestFlatIDGeneration(t *testing.T) {
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
			ThemeID: "H",
		}
		if err := pa.SaveTask(task); err != nil {
			t.Fatalf("SaveTask failed: %v", err)
		}
	}

	tasks, err := pa.GetTasksByTheme("H")
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
	dayFocus := DayFocus{Date: "2026-01-15", ThemeID: "H", Notes: "Test"}
	if err := pa.SaveDayFocus(dayFocus); err != nil {
		t.Fatalf("SaveDayFocus failed: %v", err)
	}

	calendarPath := filepath.Join(dataDir, "calendar", "2026.json")
	if _, err := os.Stat(calendarPath); os.IsNotExist(err) {
		t.Error("2026.json should exist")
	}

	// Save task and verify task structure
	task := Task{Title: "Test task", ThemeID: "H"}
	if err := pa.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	taskPath := filepath.Join(dataDir, "tasks", "H", "todo", "H-T1.json")
	if _, err := os.Stat(taskPath); os.IsNotExist(err) {
		t.Error("H-T1.json should exist in todo directory")
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

	task := Task{Title: "Test task", ThemeID: "H"}
	if err := pa.SaveTask(task); err != nil {
		t.Fatalf("SaveTask failed: %v", err)
	}

	// Move task
	if err := pa.MoveTask("H-T1", "doing"); err != nil {
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
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	theme := LifeTheme{
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

	err := pa.SaveTheme(theme)
	if err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	themes, _ := pa.GetThemes()
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
	pa, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// First save: create theme with initial objectives
	theme := LifeTheme{
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

	err := pa.SaveTheme(theme)
	if err != nil {
		t.Fatalf("SaveTheme (initial) failed: %v", err)
	}

	// Read back the saved theme to get assigned IDs
	themes, _ := pa.GetThemes()
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

	err = pa.SaveTheme(updated)
	if err != nil {
		t.Fatalf("SaveTheme (update) failed: %v", err)
	}

	themes, _ = pa.GetThemes()
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

func TestSuggestAbbreviation(t *testing.T) {
	tests := []struct {
		name     string
		existing []LifeTheme
		expected string
	}{
		{"Health", nil, "H"},
		{"Career", nil, "C"},
		{"Personal Finance", nil, "PF"},
		{"Health And Wellness", nil, "HAW"},
		// Collision: single-letter taken
		{"Health", []LifeTheme{{ID: "H"}}, "HE"},
		// Collision: first 2 letters taken
		{"Health", []LifeTheme{{ID: "H"}, {ID: "HE"}}, "HEA"},
		// Multi-word collision
		{"Career Growth", []LifeTheme{{ID: "CG"}}, "C"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := SuggestAbbreviation(tt.name, tt.existing)
			if result != tt.expected {
				t.Errorf("SuggestAbbreviation(%q) = %q, want %q", tt.name, result, tt.expected)
			}
		})
	}
}

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
