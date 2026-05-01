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

// TestSaveTask_NewTask, TestSaveTask_ThemeChange, TestSaveTask_EmptyThemeID,
// and TestGetTasksByStatus removed by task 99: their behaviour is now
// covered by ITask facet tests (Create/Save/Find) in task_access_test.go.

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

// TestMoveTask*, TestDeleteTask* removed by task 99: ITask.Move and
// ITask.Delete tests in task_access_test.go cover the same scenarios.

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

// TestTaskIDGeneration removed by task 99: ITask.Create's ID-allocation
// behaviour is verified by TestUnit_ITask_Create_AssignsUniqueIDsConcurrently
// in task_access_test.go.

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
	if _, err := env.tasks.Create(Task{Title: "Test task", ThemeID: "H"}, "important-not-urgent"); err != nil {
		t.Fatalf("Create failed: %v", err)
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

// TestGitVersioning_MoveTaskUsesGitMv removed by task 99: ITask.Move's
// commit-message format is verified by TestUnit_ITask_Move_*.

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

// TestSaveTaskWithOrder*, TestDeleteTaskWithOrder, TestUpdateTaskWithOrderMove*
// removed by task 99: ITask.Create / ITask.Delete / ITask.Move tests in
// task_access_test.go cover the same atomic-with-order behaviour.

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

// TestArchiveTask*, TestRestoreTask*, TestGetTasksByStatus_Archived removed
// by task 99: ITask.Archive and ITask.Restore tests in task_access_test.go
// cover the same scenarios.

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

// TestGetTasksByTheme_IncludesArchivedForIDGeneration,
// TestUnit_SaveTaskFile_RejectsDuplicateID, TestGenerateTaskIDMismatchedThemeInFile
// removed by task 99: ITask.Create's ID-allocation behaviour (including the
// archived-directory collision avoidance) is verified by ITask facet tests.

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
	if err := env.tasks.removeStatusDirectory("empty-col"); err != nil {
		t.Fatalf("removeStatusDirectory on empty dir failed: %v", err)
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
	if err := env.tasks.removeStatusDirectory("non-empty"); err == nil {
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

	if err := env.tasks.renameStatusDirectory("old-name", "new-name"); err != nil {
		t.Fatalf("renameStatusDirectory failed: %v", err)
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
	if err := env.tasks.writeTaskOrder(order); err != nil {
		t.Fatalf("writeTaskOrder failed: %v", err)
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
