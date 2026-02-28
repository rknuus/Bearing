// Package integration provides performance benchmarks for the Bearing application.
// These benchmarks verify that key operations meet performance requirements:
// - Calendar renders 365 days in < 100ms
// - View transitions < 100ms
package integration

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/rkn/bearing/internal/access"
	"github.com/rkn/bearing/internal/managers"
	"github.com/rkn/bearing/internal/utilities"
)

// setupBenchmarkEnvironment creates a test environment for benchmarking
func setupBenchmarkEnvironment(b *testing.B) (*managers.PlanningManager, *access.PlanAccess, utilities.IRepository, string, func()) {
	b.Helper()

	tmpDir, err := os.MkdirTemp("", "bearing_benchmark_*")
	if err != nil {
		b.Fatalf("Failed to create temp dir: %v", err)
	}

	dataDir := filepath.Join(tmpDir, "data")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		os.RemoveAll(tmpDir)
		b.Fatalf("Failed to create data dir: %v", err)
	}

	gitConfig := &utilities.AuthorConfiguration{
		User:  "Benchmark Test",
		Email: "benchmark@test.com",
	}

	repo, err := utilities.InitializeRepositoryWithConfig(tmpDir, gitConfig)
	if err != nil {
		os.RemoveAll(tmpDir)
		b.Fatalf("Failed to initialize repository: %v", err)
	}

	planAccess, err := access.NewPlanAccess(dataDir, repo)
	if err != nil {
		repo.Close()
		os.RemoveAll(tmpDir)
		b.Fatalf("Failed to create PlanAccess: %v", err)
	}

	manager, err := managers.NewPlanningManager(planAccess)
	if err != nil {
		repo.Close()
		os.RemoveAll(tmpDir)
		b.Fatalf("Failed to create PlanningManager: %v", err)
	}

	cleanup := func() {
		repo.Close()
		os.RemoveAll(tmpDir)
	}

	return manager, planAccess, repo, tmpDir, cleanup
}

// =============================================================================
// Performance Tests (Target: < 100ms)
// =============================================================================

// TestPerformance_CalendarYearLoad tests that loading 365 days completes in < 100ms
func TestPerformance_CalendarYearLoad(t *testing.T) {
	manager, _, _, _, cleanup := setupIntegrationTest(t)
	defer cleanup()

	// Pre-populate with 365 days of data
	theme, _ := manager.CreateTheme("Year Theme", "#22c55e")

	year := 2026
	startDate := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	for i := 0; i < 365; i++ {
		date := startDate.AddDate(0, 0, i).Format("2006-01-02")
		_ = manager.SaveDayFocus(access.DayFocus{
			Date:    date,
			ThemeID: theme.ID,
			Notes:   "Daily focus note",
		})
	}

	// Measure load time
	start := time.Now()
	yearFocus, err := manager.GetYearFocus(year)
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("Failed to get year focus: %v", err)
	}

	if len(yearFocus) != 365 {
		t.Errorf("Expected 365 day focuses, got %d", len(yearFocus))
	}

	// Performance target: < 100ms
	if elapsed > 100*time.Millisecond {
		t.Errorf("Calendar year load took %v, target is < 100ms", elapsed)
	}

	t.Logf("Calendar year load (365 days): %v", elapsed)
}

// TestPerformance_ViewTransition_ThemesToTasks tests view transition performance
func TestPerformance_ViewTransition_ThemesToTasks(t *testing.T) {
	manager, _, _, _, cleanup := setupIntegrationTest(t)
	defer cleanup()

	// Create themes with tasks
	for i := 0; i < 5; i++ {
		theme, _ := manager.CreateTheme("Theme", "#ff0000")
		for j := 0; j < 10; j++ {
			_, _ = manager.CreateTask("Task", theme.ID, "2026-01-15", "important-urgent", "", "", "", "")
		}
	}

	// Measure theme load time
	start := time.Now()
	themes, _ := manager.GetThemes()
	themeLoadTime := time.Since(start)

	// Measure task load time
	start = time.Now()
	tasks, _ := manager.GetTasks()
	taskLoadTime := time.Since(start)

	totalTransitionTime := themeLoadTime + taskLoadTime

	if len(themes) != 5 {
		t.Errorf("Expected 5 themes, got %d", len(themes))
	}
	if len(tasks) != 50 {
		t.Errorf("Expected 50 tasks, got %d", len(tasks))
	}

	// Performance target: < 100ms for combined transition
	if totalTransitionTime > 100*time.Millisecond {
		t.Errorf("View transition took %v, target is < 100ms", totalTransitionTime)
	}

	t.Logf("Theme load: %v, Task load: %v, Total: %v", themeLoadTime, taskLoadTime, totalTransitionTime)
}

// TestPerformance_TaskMoveOperation tests task move performance
func TestPerformance_TaskMoveOperation(t *testing.T) {
	manager, _, _, _, cleanup := setupIntegrationTest(t)
	defer cleanup()

	theme, _ := manager.CreateTheme("Move Test", "#ff0000")
	task, _ := manager.CreateTask("Task to move", theme.ID, "2026-01-15", "important-urgent", "", "", "", "")

	// Measure move time
	start := time.Now()
	moveResult, err := manager.MoveTask(task.ID, "doing", nil)
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("Failed to move task: %v", err)
	}
	if !moveResult.Success {
		t.Fatalf("Move task rejected: %v", moveResult.Violations)
	}

	// Performance target: < 100ms (includes git commit)
	if elapsed > 100*time.Millisecond {
		t.Errorf("Task move took %v, target is < 100ms", elapsed)
	}

	t.Logf("Task move operation: %v", elapsed)
}

// TestPerformance_NavigationContextLoad tests navigation context persistence performance
func TestPerformance_NavigationContextLoad(t *testing.T) {
	manager, _, _, _, cleanup := setupIntegrationTest(t)
	defer cleanup()

	// Save navigation context
	ctx := managers.NavigationContext{
		CurrentView:   "eisenkan",
		CurrentItem:   "task-123",
		FilterThemeID: "THEME-01",
		FilterDate:    "2026-01-15",
		LastAccessed:  time.Now().Format(time.RFC3339),
	}
	_ = manager.SaveNavigationContext(ctx)

	// Measure load time
	start := time.Now()
	loadedCtx, err := manager.LoadNavigationContext()
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("Failed to load navigation context: %v", err)
	}
	if loadedCtx == nil {
		t.Fatal("Loaded context is nil")
	}

	// Performance target: < 10ms (simple JSON read)
	if elapsed > 10*time.Millisecond {
		t.Errorf("Navigation context load took %v, target is < 10ms", elapsed)
	}

	t.Logf("Navigation context load: %v", elapsed)
}

// =============================================================================
// Benchmarks (for detailed performance analysis)
// =============================================================================

// BenchmarkCalendarYearLoad benchmarks loading 365 days of calendar data
func BenchmarkCalendarYearLoad(b *testing.B) {
	manager, _, _, _, cleanup := setupBenchmarkEnvironment(b)
	defer cleanup()

	// Pre-populate with 365 days
	theme, _ := manager.CreateTheme("Year Theme", "#22c55e")
	year := 2026
	startDate := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	for i := 0; i < 365; i++ {
		date := startDate.AddDate(0, 0, i).Format("2006-01-02")
		_ = manager.SaveDayFocus(access.DayFocus{
			Date:    date,
			ThemeID: theme.ID,
			Notes:   "Daily focus note",
		})
	}

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		_, err := manager.GetYearFocus(year)
		if err != nil {
			b.Fatalf("GetYearFocus failed: %v", err)
		}
	}
}

// BenchmarkViewTransition benchmarks the data loading for view switches
func BenchmarkViewTransition(b *testing.B) {
	manager, _, _, _, cleanup := setupBenchmarkEnvironment(b)
	defer cleanup()

	// Create test data
	for i := 0; i < 5; i++ {
		theme, _ := manager.CreateTheme("Theme", "#ff0000")
		for j := 0; j < 10; j++ {
			_, _ = manager.CreateTask("Task", theme.ID, "2026-01-15", "important-urgent", "", "", "", "")
		}
	}

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		// Simulate view transition: load themes and tasks
		_, _ = manager.GetThemes()
		_, _ = manager.GetTasks()
	}
}

// BenchmarkThemeCreation benchmarks theme creation including git commit
func BenchmarkThemeCreation(b *testing.B) {
	manager, _, _, _, cleanup := setupBenchmarkEnvironment(b)
	defer cleanup()

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		_, err := manager.CreateTheme("Theme", "#ff0000")
		if err != nil {
			b.Fatalf("CreateTheme failed: %v", err)
		}
	}
}

// BenchmarkTaskCreation benchmarks task creation including git commit
func BenchmarkTaskCreation(b *testing.B) {
	manager, _, _, _, cleanup := setupBenchmarkEnvironment(b)
	defer cleanup()

	theme, _ := manager.CreateTheme("Benchmark Theme", "#ff0000")

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		_, err := manager.CreateTask("Task", theme.ID, "2026-01-15", "important-urgent", "", "", "", "")
		if err != nil {
			b.Fatalf("CreateTask failed: %v", err)
		}
	}
}

// BenchmarkTaskMove benchmarks task movement including git operations
func BenchmarkTaskMove(b *testing.B) {
	manager, _, _, _, cleanup := setupBenchmarkEnvironment(b)
	defer cleanup()

	// Pre-create tasks for moving
	theme, _ := manager.CreateTheme("Move Theme", "#ff0000")
	var taskIDs []string
	for i := 0; i < b.N; i++ {
		task, _ := manager.CreateTask("Task", theme.ID, "2026-01-15", "important-urgent", "", "", "", "")
		taskIDs = append(taskIDs, task.ID)
	}

	statuses := []string{"doing", "done", "todo"}
	statusIndex := 0

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		_, err := manager.MoveTask(taskIDs[i], statuses[statusIndex], nil)
		if err != nil {
			b.Fatalf("MoveTask failed: %v", err)
		}
		statusIndex = (statusIndex + 1) % len(statuses)
	}
}

// BenchmarkGetAllTasks benchmarks retrieving all tasks across themes
func BenchmarkGetAllTasks(b *testing.B) {
	manager, _, _, _, cleanup := setupBenchmarkEnvironment(b)
	defer cleanup()

	// Create varied task data
	for i := 0; i < 10; i++ {
		theme, _ := manager.CreateTheme("Theme", "#ff0000")
		for j := 0; j < 20; j++ {
			_, _ = manager.CreateTask("Task", theme.ID, "2026-01-15", "important-urgent", "", "", "", "")
		}
	}

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		_, err := manager.GetTasks()
		if err != nil {
			b.Fatalf("GetTasks failed: %v", err)
		}
	}
}

// BenchmarkNavigationContextRoundTrip benchmarks save and load of navigation context
func BenchmarkNavigationContextRoundTrip(b *testing.B) {
	manager, _, _, _, cleanup := setupBenchmarkEnvironment(b)
	defer cleanup()

	ctx := managers.NavigationContext{
		CurrentView:   "eisenkan",
		CurrentItem:   "task-123",
		FilterThemeID: "THEME-01",
		FilterDate:    "2026-01-15",
		LastAccessed:  time.Now().Format(time.RFC3339),
	}

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		if err := manager.SaveNavigationContext(ctx); err != nil {
			b.Fatalf("SaveNavigationContext failed: %v", err)
		}
		if _, err := manager.LoadNavigationContext(); err != nil {
			b.Fatalf("LoadNavigationContext failed: %v", err)
		}
	}
}

// BenchmarkDayFocusSave benchmarks saving day focus entries
func BenchmarkDayFocusSave(b *testing.B) {
	manager, _, _, _, cleanup := setupBenchmarkEnvironment(b)
	defer cleanup()

	theme, _ := manager.CreateTheme("Focus Theme", "#ff0000")
	baseDate := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		date := baseDate.AddDate(0, 0, i).Format("2006-01-02")
		err := manager.SaveDayFocus(access.DayFocus{
			Date:    date,
			ThemeID: theme.ID,
			Notes:   "Benchmark note",
		})
		if err != nil {
			b.Fatalf("SaveDayFocus failed: %v", err)
		}
	}
}

// =============================================================================
// Large-scale Performance Tests
// =============================================================================

// TestPerformance_LargeDataset tests performance with a realistic large dataset
func TestPerformance_LargeDataset(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping large dataset test in short mode")
	}

	manager, _, _, _, cleanup := setupIntegrationTest(t)
	defer cleanup()

	// Create 10 themes with objectives and key results
	themes := make([]string, 10)
	for i := 0; i < 10; i++ {
		theme, _ := manager.CreateTheme("Theme", "#ff0000")
		themes[i] = theme.ID

		// Add 3 objectives per theme
		for j := 0; j < 3; j++ {
			obj, _ := manager.CreateObjective(theme.ID, "Objective")
			// Add 3 key results per objective
			for k := 0; k < 3; k++ {
				_, _ = manager.CreateKeyResult(obj.ID, "Key Result", 0, 0)
			}
		}
	}

	// Create 100 tasks distributed across themes
	for i := 0; i < 100; i++ {
		themeID := themes[i%10]
		_, _ = manager.CreateTask("Task", themeID, "2026-01-15", "important-urgent", "", "", "", "")
	}

	// Measure full data retrieval
	start := time.Now()

	loadedThemes, _ := manager.GetThemes()
	tasks, _ := manager.GetTasks()

	elapsed := time.Since(start)

	if len(loadedThemes) != 10 {
		t.Errorf("Expected 10 themes, got %d", len(loadedThemes))
	}
	if len(tasks) != 100 {
		t.Errorf("Expected 100 tasks, got %d", len(tasks))
	}

	// Verify objectives and key results
	totalObjectives := 0
	totalKeyResults := 0
	for _, th := range loadedThemes {
		totalObjectives += len(th.Objectives)
		for _, obj := range th.Objectives {
			totalKeyResults += len(obj.KeyResults)
		}
	}

	if totalObjectives != 30 {
		t.Errorf("Expected 30 objectives, got %d", totalObjectives)
	}
	if totalKeyResults != 90 {
		t.Errorf("Expected 90 key results, got %d", totalKeyResults)
	}

	t.Logf("Large dataset retrieval: %v (10 themes, 30 objectives, 90 KRs, 100 tasks)", elapsed)

	// Should complete in reasonable time
	if elapsed > 500*time.Millisecond {
		t.Errorf("Large dataset retrieval took %v, should be < 500ms", elapsed)
	}
}
