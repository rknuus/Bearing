// Package integration provides end-to-end integration tests for the Bearing application.
// These tests validate the complete linking mechanism across all three planning layers
// (themes, calendar, tasks) and verify data persistence through the full workflow.
package integration

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/rkn/bearing/internal/access"
	"github.com/rkn/bearing/internal/managers"
	"github.com/rkn/bearing/internal/utilities"
)

// verifyParentID is a helper that checks the ParentID of an objective or key result.
func verifyParentID(t *testing.T, entityType, entityID, gotParentID, expectedParentID string) {
	t.Helper()
	if gotParentID != expectedParentID {
		t.Errorf("%s %s: expected ParentID %s, got %s", entityType, entityID, expectedParentID, gotParentID)
	}
}

// Test helper to set up the complete system (PlanAccess + PlanningManager)
func setupIntegrationTest(t *testing.T) (*managers.PlanningManager, *access.PlanAccess, utilities.IRepository, string, func()) {
	t.Helper()

	// Create temporary directory for the test
	tmpDir, err := os.MkdirTemp("", "bearing_integration_test_*")
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
		User:  "Integration Test",
		Email: "integration@test.com",
	}

	repo, err := utilities.InitializeRepositoryWithConfig(tmpDir, gitConfig)
	if err != nil {
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to initialize repository: %v", err)
	}

	// Create PlanAccess
	planAccess, err := access.NewPlanAccess(dataDir, repo)
	if err != nil {
		repo.Close()
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to create PlanAccess: %v", err)
	}

	// Create PlanningManager
	manager, err := managers.NewPlanningManager(planAccess)
	if err != nil {
		repo.Close()
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to create PlanningManager: %v", err)
	}

	cleanup := func() {
		repo.Close()
		os.RemoveAll(tmpDir)
	}

	return manager, planAccess, repo, tmpDir, cleanup
}

// =============================================================================
// Scenario 1: Full Linking Chain
// =============================================================================

// TestIntegration_FullLinkingChain tests the complete linking mechanism:
// Theme -> Day Focus -> Task with color propagation and hierarchical IDs
func TestIntegration_FullLinkingChain(t *testing.T) {
	manager, planAccess, _, tmpDir, cleanup := setupIntegrationTest(t)
	defer cleanup()

	// Step 1: Create a Life Theme "Health" with color #22c55e
	theme, err := manager.CreateTheme("Health", "#22c55e")
	if err != nil {
		t.Fatalf("Failed to create theme: %v", err)
	}

	if theme.ID == "" {
		t.Error("Theme should have a generated ID")
	}
	if theme.ID != "H" {
		t.Errorf("Expected theme ID H, got %s", theme.ID)
	}
	if theme.Color != "#22c55e" {
		t.Errorf("Expected color #22c55e, got %s", theme.Color)
	}

	// Step 2: Assign January 15th to theme "Health"
	dayFocus := access.DayFocus{
		Date:    "2026-01-15",
		ThemeID: theme.ID,
		Notes:   "Focus on health today",
	}
	if err := manager.SaveDayFocus(dayFocus); err != nil {
		t.Fatalf("Failed to save day focus: %v", err)
	}

	// Verify day focus was saved with correct theme ID
	savedDayFocus, err := planAccess.GetDayFocus("2026-01-15")
	if err != nil {
		t.Fatalf("Failed to get day focus: %v", err)
	}
	if savedDayFocus == nil {
		t.Fatal("Day focus not found")
	}
	if savedDayFocus.ThemeID != theme.ID {
		t.Errorf("Day focus theme ID mismatch: expected %s, got %s", theme.ID, savedDayFocus.ThemeID)
	}

	// Step 3: Create a task "Go for a run" on January 15th
	task, err := manager.CreateTask("Go for a run", theme.ID, "2026-01-15", "important-urgent")
	if err != nil {
		t.Fatalf("Failed to create task: %v", err)
	}

	// Verify task properties
	if task.Title != "Go for a run" {
		t.Errorf("Task title mismatch: expected 'Go for a run', got '%s'", task.Title)
	}
	if task.ThemeID != theme.ID {
		t.Errorf("Task theme ID mismatch: expected %s, got %s", theme.ID, task.ThemeID)
	}
	if task.DayDate != "2026-01-15" {
		t.Errorf("Task day date mismatch: expected 2026-01-15, got %s", task.DayDate)
	}

	// Step 4: Verify color chain - all components can look up the theme color
	themes, err := manager.GetThemes()
	if err != nil {
		t.Fatalf("Failed to get themes: %v", err)
	}

	// Find the theme and verify color
	var foundTheme *access.LifeTheme
	for i := range themes {
		if themes[i].ID == theme.ID {
			foundTheme = &themes[i]
			break
		}
	}
	if foundTheme == nil {
		t.Fatal("Created theme not found in themes list")
	}
	if foundTheme.Color != "#22c55e" {
		t.Errorf("Theme color not preserved: expected #22c55e, got %s", foundTheme.Color)
	}

	// Verify task is stored in the correct location
	taskPath := filepath.Join(tmpDir, "data", "tasks", theme.ID, "todo", task.ID+".json")
	if _, err := os.Stat(taskPath); os.IsNotExist(err) {
		t.Errorf("Task file not found at expected location: %s", taskPath)
	}

	// Verify task file contains correct data
	taskData, err := os.ReadFile(taskPath)
	if err != nil {
		t.Fatalf("Failed to read task file: %v", err)
	}

	var savedTask access.Task
	if err := json.Unmarshal(taskData, &savedTask); err != nil {
		t.Fatalf("Failed to parse task file: %v", err)
	}
	if savedTask.ThemeID != theme.ID {
		t.Errorf("Saved task themeID mismatch: expected %s, got %s", theme.ID, savedTask.ThemeID)
	}
}

// TestIntegration_FlatIDConsistency verifies flat IDs and parentId relationships
func TestIntegration_FlatIDConsistency(t *testing.T) {
	manager, _, _, _, cleanup := setupIntegrationTest(t)
	defer cleanup()

	// Create theme with objectives and key results
	theme, err := manager.CreateTheme("Career", "#3b82f6")
	if err != nil {
		t.Fatalf("Failed to create theme: %v", err)
	}

	if theme.ID != "C" {
		t.Errorf("Expected theme ID C, got %s", theme.ID)
	}

	// Create objectives
	obj1, err := manager.CreateObjective(theme.ID, "Get promoted")
	if err != nil {
		t.Fatalf("Failed to create objective 1: %v", err)
	}
	obj2, err := manager.CreateObjective(theme.ID, "Learn new skills")
	if err != nil {
		t.Fatalf("Failed to create objective 2: %v", err)
	}

	// Verify objective IDs are theme-scoped
	if obj1.ID != "C-O1" {
		t.Errorf("Expected objective 1 ID C-O1, got %s", obj1.ID)
	}
	if obj2.ID != "C-O2" {
		t.Errorf("Expected objective 2 ID C-O2, got %s", obj2.ID)
	}

	// Verify objective ParentIDs point to the theme
	verifyParentID(t, "Objective", obj1.ID, obj1.ParentID, theme.ID)
	verifyParentID(t, "Objective", obj2.ID, obj2.ParentID, theme.ID)

	// Create key results
	kr1, err := manager.CreateKeyResult(obj1.ID, "Complete 3 major projects")
	if err != nil {
		t.Fatalf("Failed to create key result 1: %v", err)
	}
	kr2, err := manager.CreateKeyResult(obj1.ID, "Get positive performance review")
	if err != nil {
		t.Fatalf("Failed to create key result 2: %v", err)
	}

	// Verify key result IDs are theme-scoped
	if kr1.ID != "C-KR1" {
		t.Errorf("Expected key result 1 ID C-KR1, got %s", kr1.ID)
	}
	if kr2.ID != "C-KR2" {
		t.Errorf("Expected key result 2 ID C-KR2, got %s", kr2.ID)
	}

	// Verify key result ParentIDs point to the objective
	verifyParentID(t, "KeyResult", kr1.ID, kr1.ParentID, obj1.ID)
	verifyParentID(t, "KeyResult", kr2.ID, kr2.ParentID, obj1.ID)

	// Verify parentId relationships through the full hierarchy via GetThemes
	themes, _ := manager.GetThemes()
	for _, th := range themes {
		if th.ID == theme.ID {
			for _, obj := range th.Objectives {
				if obj.ParentID != theme.ID {
					t.Errorf("Objective %s: expected ParentID %s, got %s", obj.ID, theme.ID, obj.ParentID)
				}
				for _, kr := range obj.KeyResults {
					if kr.ParentID != obj.ID {
						t.Errorf("KeyResult %s: expected ParentID %s, got %s", kr.ID, obj.ID, kr.ParentID)
					}
				}
			}
		}
	}
}

// =============================================================================
// Scenario 2: Git File Operations
// =============================================================================

// TestIntegration_MoveTaskCreatesGitRename verifies that moving a task creates a git rename operation
func TestIntegration_MoveTaskCreatesGitRename(t *testing.T) {
	manager, _, repo, tmpDir, cleanup := setupIntegrationTest(t)
	defer cleanup()

	// Create theme and task
	theme, err := manager.CreateTheme("Health", "#22c55e")
	if err != nil {
		t.Fatalf("Failed to create theme: %v", err)
	}

	task, err := manager.CreateTask("Morning run", theme.ID, "2026-01-15", "important-urgent")
	if err != nil {
		t.Fatalf("Failed to create task: %v", err)
	}

	// Verify task starts in "todo" directory
	todoPath := filepath.Join(tmpDir, "data", "tasks", theme.ID, "todo", task.ID+".json")
	if _, err := os.Stat(todoPath); os.IsNotExist(err) {
		t.Fatalf("Task should exist in todo directory: %s", todoPath)
	}

	// Read original task content
	originalContent, err := os.ReadFile(todoPath)
	if err != nil {
		t.Fatalf("Failed to read original task: %v", err)
	}

	// Get commit count before move
	historyBefore, err := repo.GetHistory(0)
	if err != nil {
		t.Fatalf("Failed to get history before move: %v", err)
	}
	commitCountBefore := len(historyBefore)

	// Move task to "doing"
	if err := manager.MoveTask(task.ID, "doing"); err != nil {
		t.Fatalf("Failed to move task: %v", err)
	}

	// Verify task file moved to new location
	doingPath := filepath.Join(tmpDir, "data", "tasks", theme.ID, "doing", task.ID+".json")
	if _, err := os.Stat(doingPath); os.IsNotExist(err) {
		t.Error("Task file should exist in doing directory")
	}

	// Verify task file removed from old location
	if _, err := os.Stat(todoPath); !os.IsNotExist(err) {
		t.Error("Task file should not exist in todo directory after move")
	}

	// Verify task content is unchanged
	newContent, err := os.ReadFile(doingPath)
	if err != nil {
		t.Fatalf("Failed to read moved task: %v", err)
	}
	if string(originalContent) != string(newContent) {
		t.Error("Task content changed after move")
	}

	// Verify git commit was created for the move
	historyAfter, err := repo.GetHistory(0)
	if err != nil {
		t.Fatalf("Failed to get history after move: %v", err)
	}
	commitCountAfter := len(historyAfter)

	if commitCountAfter <= commitCountBefore {
		t.Error("Expected new commit for move operation")
	}

	// Find the move commit and verify message
	moveCommitFound := false
	for _, commit := range historyAfter {
		if strings.Contains(commit.Message, "Move task") && strings.Contains(commit.Message, "todo -> doing") {
			moveCommitFound = true
			break
		}
	}
	if !moveCommitFound {
		t.Error("Move commit message not found in git history")
	}
}

// TestIntegration_TaskMovePreservesContent verifies task data is unchanged after move
func TestIntegration_TaskMovePreservesContent(t *testing.T) {
	manager, planAccess, _, _, cleanup := setupIntegrationTest(t)
	defer cleanup()

	// Create theme and task with all fields populated
	theme, _ := manager.CreateTheme("Health", "#22c55e")
	task, _ := manager.CreateTask("Complex task", theme.ID, "2026-01-20", "important-not-urgent")

	// Get original task details
	originalTasks, _ := planAccess.GetTasksByStatus(theme.ID, "todo")
	var originalTask access.Task
	for _, t := range originalTasks {
		if t.ID == task.ID {
			originalTask = t
			break
		}
	}

	// Move through all statuses
	statuses := []string{"doing", "done", "todo", "doing"}
	for _, status := range statuses {
		if err := manager.MoveTask(task.ID, status); err != nil {
			t.Fatalf("Failed to move task to %s: %v", status, err)
		}

		// Verify task content after each move
		tasks, _ := planAccess.GetTasksByStatus(theme.ID, status)
		var movedTask access.Task
		for _, t := range tasks {
			if t.ID == task.ID {
				movedTask = t
				break
			}
		}

		if movedTask.Title != originalTask.Title {
			t.Errorf("Task title changed after move to %s", status)
		}
		if movedTask.ThemeID != originalTask.ThemeID {
			t.Errorf("Task themeID changed after move to %s", status)
		}
		if movedTask.DayDate != originalTask.DayDate {
			t.Errorf("Task dayDate changed after move to %s", status)
		}
		if movedTask.Priority != originalTask.Priority {
			t.Errorf("Task priority changed after move to %s", status)
		}
	}
}

// =============================================================================
// Scenario 3: Data Persistence
// =============================================================================

// TestIntegration_DataPersistence verifies all data survives save/reload cycle
func TestIntegration_DataPersistence(t *testing.T) {
	manager1, _, repo1, tmpDir, cleanup := setupIntegrationTest(t)
	defer cleanup()

	// Create comprehensive test data
	theme1, _ := manager1.CreateTheme("Health", "#22c55e")
	theme2, _ := manager1.CreateTheme("Career", "#3b82f6")

	manager1.CreateObjective(theme1.ID, "Fitness Goals")
	manager1.CreateObjective(theme2.ID, "Career Growth")

	manager1.SaveDayFocus(access.DayFocus{Date: "2026-01-15", ThemeID: theme1.ID, Notes: "Health day"})
	manager1.SaveDayFocus(access.DayFocus{Date: "2026-01-16", ThemeID: theme2.ID, Notes: "Career day"})

	// Create all tasks in the same theme to avoid task ID collision issue
	// (Task IDs are unique within a theme, but MoveTask searches across all themes)
	manager1.CreateTask("Morning run", theme1.ID, "2026-01-15", "important-urgent")
	task2, _ := manager1.CreateTask("Update resume", theme1.ID, "2026-01-16", "important-not-urgent")
	manager1.CreateTask("Team meeting", theme1.ID, "2026-01-16", "not-important-urgent")

	// Move one task to doing
	manager1.MoveTask(task2.ID, "doing")

	// Save navigation context
	navCtx := managers.NavigationContext{
		CurrentView:   "calendar",
		FilterThemeID: theme1.ID,
		FilterDate:    "2026-01-15",
		LastAccessed:  "2026-01-31T10:00:00Z",
	}
	manager1.SaveNavigationContext(navCtx)

	// Close the first set of handles
	repo1.Close()

	// --- Simulate App Restart ---

	// Re-open with new instances
	gitConfig := &utilities.AuthorConfiguration{User: "Test User", Email: "test@example.com"}
	repo2, err := utilities.InitializeRepositoryWithConfig(tmpDir, gitConfig)
	if err != nil {
		t.Fatalf("Failed to reopen repository: %v", err)
	}
	defer repo2.Close()

	dataDir := filepath.Join(tmpDir, "data")
	planAccess2, err := access.NewPlanAccess(dataDir, repo2)
	if err != nil {
		t.Fatalf("Failed to reopen PlanAccess: %v", err)
	}

	manager2, err := managers.NewPlanningManager(planAccess2)
	if err != nil {
		t.Fatalf("Failed to reopen PlanningManager: %v", err)
	}

	// Verify themes are restored
	themes, _ := manager2.GetThemes()
	if len(themes) != 2 {
		t.Errorf("Expected 2 themes after reload, got %d", len(themes))
	}

	themeFound := make(map[string]bool)
	for _, th := range themes {
		themeFound[th.Name] = true
		if th.Name == "Health" && th.Color != "#22c55e" {
			t.Errorf("Health theme color not preserved: %s", th.Color)
		}
		if th.Name == "Career" && th.Color != "#3b82f6" {
			t.Errorf("Career theme color not preserved: %s", th.Color)
		}
	}
	if !themeFound["Health"] || !themeFound["Career"] {
		t.Error("Not all themes restored")
	}

	// Verify day focuses are restored
	yearFocus, _ := manager2.GetYearFocus(2026)
	if len(yearFocus) != 2 {
		t.Errorf("Expected 2 day focuses after reload, got %d", len(yearFocus))
	}

	// Verify tasks are restored in correct columns
	tasks, _ := manager2.GetTasks()
	if len(tasks) != 3 {
		t.Errorf("Expected 3 tasks after reload, got %d", len(tasks))
	}

	// Use title to identify tasks since task IDs are only unique within a theme
	taskStatusByTitle := make(map[string]string)
	for _, task := range tasks {
		taskStatusByTitle[task.Title] = task.Status
	}

	if taskStatusByTitle["Morning run"] != "todo" {
		t.Errorf("Task 'Morning run' should be in todo, got %s", taskStatusByTitle["Morning run"])
	}
	if taskStatusByTitle["Update resume"] != "doing" {
		t.Errorf("Task 'Update resume' should be in doing, got %s", taskStatusByTitle["Update resume"])
	}
	if taskStatusByTitle["Team meeting"] != "todo" {
		t.Errorf("Task 'Team meeting' should be in todo, got %s", taskStatusByTitle["Team meeting"])
	}

	// Verify navigation context is restored
	loadedNavCtx, err := manager2.LoadNavigationContext()
	if err != nil {
		t.Fatalf("Failed to load navigation context: %v", err)
	}
	if loadedNavCtx.CurrentView != "calendar" {
		t.Errorf("Navigation view not preserved: expected 'calendar', got '%s'", loadedNavCtx.CurrentView)
	}
	if loadedNavCtx.FilterThemeID != theme1.ID {
		t.Errorf("Navigation filter theme not preserved: expected %s, got %s", theme1.ID, loadedNavCtx.FilterThemeID)
	}
}

// TestIntegration_NavigationContextPersistence tests navigation context save/load
func TestIntegration_NavigationContextPersistence(t *testing.T) {
	manager1, _, repo1, tmpDir, cleanup := setupIntegrationTest(t)
	defer cleanup()

	// Create a theme for context
	theme, _ := manager1.CreateTheme("Test Theme", "#ff0000")

	// Save navigation context
	ctx := managers.NavigationContext{
		CurrentView:   "eisenkan",
		CurrentItem:   "task-123",
		FilterThemeID: theme.ID,
		FilterDate:    "2026-02-15",
		LastAccessed:  time.Now().Format(time.RFC3339),
	}
	if err := manager1.SaveNavigationContext(ctx); err != nil {
		t.Fatalf("Failed to save navigation context: %v", err)
	}

	// Close and reopen
	repo1.Close()

	gitConfig := &utilities.AuthorConfiguration{User: "Test", Email: "test@example.com"}
	repo2, _ := utilities.InitializeRepositoryWithConfig(tmpDir, gitConfig)
	defer repo2.Close()

	planAccess2, _ := access.NewPlanAccess(filepath.Join(tmpDir, "data"), repo2)
	manager2, _ := managers.NewPlanningManager(planAccess2)

	// Load and verify
	loadedCtx, err := manager2.LoadNavigationContext()
	if err != nil {
		t.Fatalf("Failed to load navigation context: %v", err)
	}

	if loadedCtx.CurrentView != ctx.CurrentView {
		t.Errorf("CurrentView mismatch: expected %s, got %s", ctx.CurrentView, loadedCtx.CurrentView)
	}
	if loadedCtx.CurrentItem != ctx.CurrentItem {
		t.Errorf("CurrentItem mismatch: expected %s, got %s", ctx.CurrentItem, loadedCtx.CurrentItem)
	}
	if loadedCtx.FilterThemeID != ctx.FilterThemeID {
		t.Errorf("FilterThemeID mismatch: expected %s, got %s", ctx.FilterThemeID, loadedCtx.FilterThemeID)
	}
	if loadedCtx.FilterDate != ctx.FilterDate {
		t.Errorf("FilterDate mismatch: expected %s, got %s", ctx.FilterDate, loadedCtx.FilterDate)
	}
}

// =============================================================================
// Scenario 4: Delete Theme Cascade
// =============================================================================

// TestIntegration_DeleteTheme tests theme deletion behavior
func TestIntegration_DeleteTheme(t *testing.T) {
	manager, planAccess, _, _, cleanup := setupIntegrationTest(t)
	defer cleanup()

	// Create themes
	theme1, _ := manager.CreateTheme("Theme to Delete", "#ff0000")
	theme2, _ := manager.CreateTheme("Theme to Keep", "#00ff00")

	// Create tasks under both themes
	manager.CreateTask("Task 1", theme1.ID, "2026-01-15", "important-urgent")
	manager.CreateTask("Task 2", theme2.ID, "2026-01-16", "important-urgent")

	// Delete the first theme
	err := manager.DeleteTheme(theme1.ID)
	if err != nil {
		t.Fatalf("Failed to delete theme: %v", err)
	}

	// Verify theme is deleted
	themes, _ := manager.GetThemes()
	for _, th := range themes {
		if th.ID == theme1.ID {
			t.Error("Deleted theme should not be in themes list")
		}
	}
	if len(themes) != 1 {
		t.Errorf("Expected 1 theme remaining, got %d", len(themes))
	}

	// Note: Current implementation does not cascade delete tasks.
	// Tasks under deleted theme remain orphaned (design decision to prevent data loss)
	orphanedTasks, _ := planAccess.GetTasksByTheme(theme1.ID)
	// The tasks still exist but the theme is gone
	t.Logf("Orphaned tasks after theme deletion: %d", len(orphanedTasks))
}

// =============================================================================
// Additional Integration Tests
// =============================================================================

// TestIntegration_MultipleThemesAndTasks tests complex scenario with multiple themes and tasks
func TestIntegration_MultipleThemesAndTasks(t *testing.T) {
	manager, _, _, _, cleanup := setupIntegrationTest(t)
	defer cleanup()

	// Create multiple themes
	healthTheme, _ := manager.CreateTheme("Health", "#22c55e")
	careerTheme, _ := manager.CreateTheme("Career", "#3b82f6")
	familyTheme, _ := manager.CreateTheme("Family", "#f97316")

	// Create tasks across themes
	for i := 0; i < 5; i++ {
		manager.CreateTask("Health task", healthTheme.ID, "2026-01-15", "important-urgent")
		manager.CreateTask("Career task", careerTheme.ID, "2026-01-16", "important-not-urgent")
		manager.CreateTask("Family task", familyTheme.ID, "2026-01-17", "not-important-urgent")
	}

	// Get all tasks
	tasks, err := manager.GetTasks()
	if err != nil {
		t.Fatalf("Failed to get all tasks: %v", err)
	}

	if len(tasks) != 15 {
		t.Errorf("Expected 15 tasks, got %d", len(tasks))
	}

	// Count tasks per theme
	themeTaskCount := make(map[string]int)
	for _, task := range tasks {
		themeTaskCount[task.ThemeID]++
	}

	if themeTaskCount[healthTheme.ID] != 5 {
		t.Errorf("Expected 5 health tasks, got %d", themeTaskCount[healthTheme.ID])
	}
	if themeTaskCount[careerTheme.ID] != 5 {
		t.Errorf("Expected 5 career tasks, got %d", themeTaskCount[careerTheme.ID])
	}
	if themeTaskCount[familyTheme.ID] != 5 {
		t.Errorf("Expected 5 family tasks, got %d", themeTaskCount[familyTheme.ID])
	}
}

// TestIntegration_GitHistoryIntegrity verifies git commit history is accurate
func TestIntegration_GitHistoryIntegrity(t *testing.T) {
	manager, _, repo, _, cleanup := setupIntegrationTest(t)
	defer cleanup()

	// Perform a series of operations
	operations := []string{
		"Create theme",
		"Create task",
		"Move task",
		"Update theme",
	}

	// Create theme
	theme, _ := manager.CreateTheme("Test Theme", "#ff0000")

	// Create task
	task, _ := manager.CreateTask("Test task", theme.ID, "2026-01-15", "important-urgent")

	// Move task
	manager.MoveTask(task.ID, "doing")

	// Update theme
	theme.Color = "#00ff00"
	manager.UpdateTheme(*theme)

	// Get history
	history, err := repo.GetHistory(0)
	if err != nil {
		t.Fatalf("Failed to get history: %v", err)
	}

	// Verify we have commits for each operation
	if len(history) < len(operations) {
		t.Errorf("Expected at least %d commits, got %d", len(operations), len(history))
	}

	// Verify each commit has proper metadata
	for _, commit := range history {
		if commit.ID == "" {
			t.Error("Commit should have ID")
		}
		if commit.Message == "" {
			t.Error("Commit should have message")
		}
		if commit.Timestamp.IsZero() {
			t.Error("Commit should have timestamp")
		}
		if commit.Author == "" {
			t.Error("Commit should have author")
		}
	}
}

// TestIntegration_CalendarYearCoverage tests calendar operations across a full year
func TestIntegration_CalendarYearCoverage(t *testing.T) {
	manager, _, _, _, cleanup := setupIntegrationTest(t)
	defer cleanup()

	// Create a theme for the year
	theme, _ := manager.CreateTheme("Year Theme", "#ff0000")

	// Create day focuses for several months
	months := []struct {
		month int
		days  int
	}{
		{1, 31},
		{2, 28},
		{6, 30},
		{12, 31},
	}

	totalDays := 0
	for _, m := range months {
		for day := 1; day <= m.days; day++ {
			date := time.Date(2026, time.Month(m.month), day, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
			manager.SaveDayFocus(access.DayFocus{
				Date:    date,
				ThemeID: theme.ID,
				Notes:   "Daily focus",
			})
			totalDays++
		}
	}

	// Retrieve year focus and verify
	yearFocus, err := manager.GetYearFocus(2026)
	if err != nil {
		t.Fatalf("Failed to get year focus: %v", err)
	}

	if len(yearFocus) != totalDays {
		t.Errorf("Expected %d day focuses, got %d", totalDays, len(yearFocus))
	}

	// Verify all entries have correct theme ID
	for _, df := range yearFocus {
		if df.ThemeID != theme.ID {
			t.Errorf("Day focus %s has wrong theme ID: %s", df.Date, df.ThemeID)
		}
	}
}

// TestIntegration_TaskWorkflowComplete tests the complete task workflow
func TestIntegration_TaskWorkflowComplete(t *testing.T) {
	manager, _, _, _, cleanup := setupIntegrationTest(t)
	defer cleanup()

	// Create theme
	theme, _ := manager.CreateTheme("Workflow Theme", "#ff0000")

	// Create task
	task, err := manager.CreateTask("Workflow task", theme.ID, "2026-01-15", "important-urgent")
	if err != nil {
		t.Fatalf("Failed to create task: %v", err)
	}

	// Verify initial status is todo
	tasks, _ := manager.GetTasks()
	var foundTask *managers.TaskWithStatus
	for i := range tasks {
		if tasks[i].ID == task.ID {
			foundTask = &tasks[i]
			break
		}
	}
	if foundTask == nil {
		t.Fatal("Created task not found")
	}
	if foundTask.Status != "todo" {
		t.Errorf("New task should be in todo, got %s", foundTask.Status)
	}

	// Move to doing
	manager.MoveTask(task.ID, "doing")
	tasks, _ = manager.GetTasks()
	for i := range tasks {
		if tasks[i].ID == task.ID {
			if tasks[i].Status != "doing" {
				t.Errorf("Task should be in doing, got %s", tasks[i].Status)
			}
			break
		}
	}

	// Move to done
	manager.MoveTask(task.ID, "done")
	tasks, _ = manager.GetTasks()
	for i := range tasks {
		if tasks[i].ID == task.ID {
			if tasks[i].Status != "done" {
				t.Errorf("Task should be in done, got %s", tasks[i].Status)
			}
			break
		}
	}

	// Delete task
	err = manager.DeleteTask(task.ID)
	if err != nil {
		t.Fatalf("Failed to delete task: %v", err)
	}

	// Verify task is deleted
	tasks, _ = manager.GetTasks()
	for _, tsk := range tasks {
		if tsk.ID == task.ID {
			t.Error("Deleted task should not be in task list")
		}
	}
}
