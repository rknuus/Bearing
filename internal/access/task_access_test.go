package access

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/rkn/bearing/internal/utilities"
)

// strPtr is a small test helper for taking the address of a string literal.
func strPtr(s string) *string { return &s }

// commitCount returns the current number of commits in the test repo.
func commitCount(t *testing.T, repo utilities.IRepository) int {
	t.Helper()
	hist, err := repo.GetHistory(1000)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	return len(hist)
}

func TestUnit_LoadArchivedOrder_EmptyWhenFileMissing(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	order, err := env.tasks.LoadArchivedOrder()
	if err != nil {
		t.Fatalf("LoadArchivedOrder failed: %v", err)
	}
	if len(order) != 0 {
		t.Errorf("Expected empty slice, got %d entries", len(order))
	}
}

func TestUnit_LoadArchivedOrder_ReadsExistingFile(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Write a file directly to simulate pre-existing data
	expected := []string{"H-T3", "H-T2", "H-T1"}
	data, err := json.MarshalIndent(expected, "", "  ")
	if err != nil {
		t.Fatalf("Failed to marshal test data: %v", err)
	}
	filePath := filepath.Join(env.dataDir, "archived_order.json")
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	order, err := env.tasks.LoadArchivedOrder()
	if err != nil {
		t.Fatalf("LoadArchivedOrder failed: %v", err)
	}
	if len(order) != 3 {
		t.Fatalf("Expected 3 entries, got %d", len(order))
	}
	if order[0] != "H-T3" || order[1] != "H-T2" || order[2] != "H-T1" {
		t.Errorf("Unexpected order: %v", order)
	}
}

func TestUnit_WriteArchivedOrder_CreatesFile(t *testing.T) {
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

	order := []string{"H-T2", "H-T1"}
	if err := env.tasks.WriteArchivedOrder(order); err != nil {
		t.Fatalf("WriteArchivedOrder failed: %v", err)
	}

	filePath := filepath.Join(tmpDir, "data", "archived_order.json")
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		t.Error("Expected archived_order.json to exist on disk")
	}

	// Verify no git commit was created
	afterHistory, err := repo.GetHistory(100)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if len(afterHistory) != beforeCount {
		t.Errorf("Expected no new git commit, but commit count changed from %d to %d", beforeCount, len(afterHistory))
	}

	// Verify content round-trips
	loaded, err := env.tasks.LoadArchivedOrder()
	if err != nil {
		t.Fatalf("LoadArchivedOrder failed: %v", err)
	}
	if len(loaded) != 2 || loaded[0] != "H-T2" || loaded[1] != "H-T1" {
		t.Errorf("Unexpected loaded order: %v", loaded)
	}
}

func TestUnit_SaveTaskFile_RoutineTagAllowsEmptyThemeID(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	task := Task{
		Title: "Morning routine task",
		Tags:  []string{"Routine"},
	}
	err := env.tasks.WriteTask(task)
	if err != nil {
		t.Fatalf("Expected no error for Routine-tagged task with empty themeID, got: %v", err)
	}
}

func TestUnit_SaveTaskFile_EmptyThemeIDWithoutRoutineTagFails(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	task := Task{
		Title: "Regular task without theme",
	}
	err := env.tasks.WriteTask(task)
	if err == nil {
		t.Fatal("Expected error for non-Routine task with empty themeID, got nil")
	}
}

func TestUnit_GenerateTaskID_RoutineTaskFormat(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// First routine task should get ID "T1"
	task1 := Task{
		Title: "First routine task",
		Tags:  []string{"Routine"},
	}
	err := env.tasks.WriteTask(task1)
	if err != nil {
		t.Fatalf("WriteTask failed: %v", err)
	}

	// Verify the file was created with the expected ID pattern
	tasks, err := env.tasks.GetTasksByStatus("todo")
	if err != nil {
		t.Fatalf("GetTasksByStatus failed: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("Expected 1 task, got %d", len(tasks))
	}
	if tasks[0].ID != "T1" {
		t.Errorf("Expected routine task ID 'T1', got '%s'", tasks[0].ID)
	}

	// Second routine task should get ID "T2"
	task2 := Task{
		Title: "Second routine task",
		Tags:  []string{"Routine"},
	}
	err = env.tasks.WriteTask(task2)
	if err != nil {
		t.Fatalf("WriteTask failed: %v", err)
	}

	tasks, err = env.tasks.GetTasksByStatus("todo")
	if err != nil {
		t.Fatalf("GetTasksByStatus failed: %v", err)
	}
	if len(tasks) != 2 {
		t.Fatalf("Expected 2 tasks, got %d", len(tasks))
	}

	foundT2 := false
	for _, task := range tasks {
		if task.ID == "T2" {
			foundT2 = true
			break
		}
	}
	if !foundT2 {
		t.Error("Expected second routine task to have ID 'T2'")
	}
}

func TestUnit_GenerateTaskID_ThemeTaskFormatUnchanged(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	task := Task{
		Title:   "Theme task",
		ThemeID: "H",
	}
	err := env.tasks.WriteTask(task)
	if err != nil {
		t.Fatalf("WriteTask failed: %v", err)
	}

	tasks, err := env.tasks.GetTasksByStatus("todo")
	if err != nil {
		t.Fatalf("GetTasksByStatus failed: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("Expected 1 task, got %d", len(tasks))
	}
	if tasks[0].ID != "H-T1" {
		t.Errorf("Expected theme task ID 'H-T1', got '%s'", tasks[0].ID)
	}
}

func TestUnit_SaveArchivedOrder_CommitsToGit(t *testing.T) {
	env, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	order := []string{"H-T3", "H-T2", "H-T1"}
	if err := env.tasks.SaveArchivedOrder(order); err != nil {
		t.Fatalf("SaveArchivedOrder failed: %v", err)
	}

	// Verify content round-trips
	loaded, err := env.tasks.LoadArchivedOrder()
	if err != nil {
		t.Fatalf("LoadArchivedOrder failed: %v", err)
	}
	if len(loaded) != 3 {
		t.Fatalf("Expected 3 entries, got %d", len(loaded))
	}
	if loaded[0] != "H-T3" || loaded[1] != "H-T2" || loaded[2] != "H-T1" {
		t.Errorf("Unexpected loaded order: %v", loaded)
	}

	// Verify a git commit was created
	gitConfig := &utilities.AuthorConfiguration{User: "Test", Email: "test@example.com"}
	repo, _ := utilities.InitializeRepositoryWithConfig(tmpDir, gitConfig)
	defer repo.Close()

	history, err := repo.GetHistory(10)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}

	found := false
	for _, c := range history {
		if c.Message == "Update archived order" {
			found = true
			break
		}
	}
	if !found {
		t.Error("Expected a git commit with message 'Update archived order'")
	}
}

// =============================================================================
// ITask facet tests (task 94)
// =============================================================================

// seedTaskInTodo creates a task in the todo zone via the new Create verb.
func seedTaskInTodo(t *testing.T, env *testEnv, themeID, title string, tags []string) Task {
	t.Helper()
	created, err := env.tasks.Create(Task{Title: title, ThemeID: themeID, Tags: tags, Priority: "important-not-urgent"}, "todo")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	return created
}

func TestUnit_ITask_Find_ByThemeAndStatusAndTag(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	_ = seedTaskInTodo(t, env, "H", "Buy groceries", []string{"shopping"})
	_ = seedTaskInTodo(t, env, "W", "Write report", []string{"writing"})
	_ = seedTaskInTodo(t, env, "H", "Call plumber", []string{"shopping", "errands"})

	// By theme.
	got, err := env.tasks.Find(TaskFilter{ThemeID: strPtr("H")})
	if err != nil {
		t.Fatalf("Find by theme failed: %v", err)
	}
	if len(got) != 2 {
		t.Errorf("Expected 2 tasks for theme H, got %d", len(got))
	}

	// By status.
	got, err = env.tasks.Find(TaskFilter{Status: strPtr("todo")})
	if err != nil {
		t.Fatalf("Find by status failed: %v", err)
	}
	if len(got) != 3 {
		t.Errorf("Expected 3 tasks in todo, got %d", len(got))
	}

	// By tag.
	got, err = env.tasks.Find(TaskFilter{Tag: strPtr("shopping")})
	if err != nil {
		t.Fatalf("Find by tag failed: %v", err)
	}
	if len(got) != 2 {
		t.Errorf("Expected 2 tasks with tag 'shopping', got %d", len(got))
	}

	// Combined filters AND together.
	got, err = env.tasks.Find(TaskFilter{ThemeID: strPtr("H"), Tag: strPtr("errands")})
	if err != nil {
		t.Fatalf("Find combined failed: %v", err)
	}
	if len(got) != 1 || got[0].Title != "Call plumber" {
		t.Errorf("Expected exactly the plumber task, got %+v", got)
	}
}

func TestUnit_ITask_Create_AssignsUniqueIDsConcurrently(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	const goroutines = 8
	const perGoroutine = 5

	var wg sync.WaitGroup
	results := make(chan string, goroutines*perGoroutine)
	errs := make(chan error, goroutines*perGoroutine)

	for g := 0; g < goroutines; g++ {
		wg.Add(1)
		go func(g int) {
			defer wg.Done()
			for i := 0; i < perGoroutine; i++ {
				task := Task{
					Title:    fmt.Sprintf("g%d-i%d", g, i),
					ThemeID:  "H",
					Priority: "important-not-urgent",
				}
				created, err := env.tasks.Create(task, "todo")
				if err != nil {
					errs <- err
					return
				}
				results <- created.ID
			}
		}(g)
	}
	wg.Wait()
	close(results)
	close(errs)

	for err := range errs {
		t.Fatalf("Create failed under concurrency: %v", err)
	}

	seen := map[string]struct{}{}
	for id := range results {
		if _, dup := seen[id]; dup {
			t.Fatalf("Duplicate task ID under concurrent Create: %s", id)
		}
		seen[id] = struct{}{}
	}
	if len(seen) != goroutines*perGoroutine {
		t.Fatalf("Expected %d unique IDs, got %d", goroutines*perGoroutine, len(seen))
	}

	// Order map should also have one entry per created task in the todo zone.
	order, err := env.tasks.LoadTaskOrder()
	if err != nil {
		t.Fatalf("LoadTaskOrder failed: %v", err)
	}
	if len(order["todo"]) != goroutines*perGoroutine {
		t.Errorf("Expected %d entries in todo zone, got %d", goroutines*perGoroutine, len(order["todo"]))
	}
}

func TestUnit_ITask_Save_DoesNotMutateOrderMap(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	created := seedTaskInTodo(t, env, "H", "First", nil)
	beforeOrder, _ := env.tasks.LoadTaskOrder()

	updated := created
	updated.Title = "First (edited)"
	if err := env.tasks.Save(updated); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	afterOrder, _ := env.tasks.LoadTaskOrder()
	if len(beforeOrder["todo"]) != len(afterOrder["todo"]) {
		t.Errorf("Save should not change order-map length: before=%d after=%d", len(beforeOrder["todo"]), len(afterOrder["todo"]))
	}

	tasks, _ := env.tasks.GetTasksByStatus("todo")
	if len(tasks) != 1 || tasks[0].Title != "First (edited)" {
		t.Errorf("Expected updated title on disk, got %+v", tasks)
	}
}

func TestUnit_ITask_Move_StatusPriorityAndPositions_OneCommit(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	a := seedTaskInTodo(t, env, "H", "A", nil)
	b := seedTaskInTodo(t, env, "H", "B", nil)

	beforeCommits := commitCount(t, env.repo)

	out, err := env.tasks.Move(MoveRequest{
		TaskID:      a.ID,
		NewStatus:   "doing",
		NewPriority: "important-urgent",
		Positions: map[string][]string{
			"doing": {a.ID},
			"todo":  {b.ID},
		},
	})
	if err != nil {
		t.Fatalf("Move failed: %v", err)
	}
	if out.Title != "A" {
		t.Errorf("Expected outcome title 'A', got %q", out.Title)
	}
	afterCommits := commitCount(t, env.repo)
	if afterCommits-beforeCommits != 1 {
		t.Errorf("Expected exactly 1 new commit from Move, got %d", afterCommits-beforeCommits)
	}

	// Task file should be in doing/, with new priority.
	doing, _ := env.tasks.GetTasksByStatus("doing")
	if len(doing) != 1 || doing[0].ID != a.ID {
		t.Errorf("Expected task A in doing, got %+v", doing)
	}
	if doing[0].Priority != "important-urgent" {
		t.Errorf("Expected priority updated to important-urgent, got %q", doing[0].Priority)
	}

	order, _ := env.tasks.LoadTaskOrder()
	if len(order["doing"]) != 1 || order["doing"][0] != a.ID {
		t.Errorf("Expected doing zone = [%s], got %v", a.ID, order["doing"])
	}
	if len(order["todo"]) != 1 || order["todo"][0] != b.ID {
		t.Errorf("Expected todo zone = [%s], got %v", b.ID, order["todo"])
	}
}

func TestUnit_ITask_Archive_OneCommitMovesAndUpdatesOrders(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	a := seedTaskInTodo(t, env, "H", "A", nil)

	beforeCommits := commitCount(t, env.repo)
	if err := env.tasks.Archive(a.ID); err != nil {
		t.Fatalf("Archive failed: %v", err)
	}
	afterCommits := commitCount(t, env.repo)
	if afterCommits-beforeCommits != 1 {
		t.Errorf("Expected exactly 1 commit from Archive, got %d", afterCommits-beforeCommits)
	}

	archived, _ := env.tasks.GetTasksByStatus(string(TaskStatusArchived))
	if len(archived) != 1 || archived[0].ID != a.ID {
		t.Errorf("Expected task A in archived, got %+v", archived)
	}
	order, _ := env.tasks.LoadTaskOrder()
	for zone, ids := range order {
		for _, id := range ids {
			if id == a.ID {
				t.Errorf("Task %s should not be in active zone %q", a.ID, zone)
			}
		}
	}
	archivedOrder, _ := env.tasks.LoadArchivedOrder()
	if len(archivedOrder) != 1 || archivedOrder[0] != a.ID {
		t.Errorf("Expected archived order = [%s], got %v", a.ID, archivedOrder)
	}
}

func TestUnit_ITask_Restore_OneCommitMovesAndUpdatesOrders(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	a := seedTaskInTodo(t, env, "H", "A", nil)
	if err := env.tasks.Archive(a.ID); err != nil {
		t.Fatalf("Archive failed: %v", err)
	}

	beforeCommits := commitCount(t, env.repo)
	if err := env.tasks.Restore(a.ID); err != nil {
		t.Fatalf("Restore failed: %v", err)
	}
	afterCommits := commitCount(t, env.repo)
	if afterCommits-beforeCommits != 1 {
		t.Errorf("Expected exactly 1 commit from Restore, got %d", afterCommits-beforeCommits)
	}

	done, _ := env.tasks.GetTasksByStatus("done")
	if len(done) != 1 || done[0].ID != a.ID {
		t.Errorf("Expected task A in done after restore, got %+v", done)
	}
	archivedOrder, _ := env.tasks.LoadArchivedOrder()
	for _, id := range archivedOrder {
		if id == a.ID {
			t.Errorf("Restored task %s should not still be in archived order", a.ID)
		}
	}
	order, _ := env.tasks.LoadTaskOrder()
	found := false
	for _, id := range order["done"] {
		if id == a.ID {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("Expected restored task in done zone, got %v", order["done"])
	}
}

func TestUnit_ITask_Delete_OneCommitRemovesFileAndOrderEntry(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	a := seedTaskInTodo(t, env, "H", "A", nil)
	beforeCommits := commitCount(t, env.repo)
	if err := env.tasks.Delete(a.ID); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}
	afterCommits := commitCount(t, env.repo)
	if afterCommits-beforeCommits != 1 {
		t.Errorf("Expected exactly 1 commit from Delete, got %d", afterCommits-beforeCommits)
	}

	tasks, _ := env.tasks.GetTasksByStatus("todo")
	if len(tasks) != 0 {
		t.Errorf("Expected empty todo after delete, got %+v", tasks)
	}
	order, _ := env.tasks.LoadTaskOrder()
	for _, id := range order["todo"] {
		if id == a.ID {
			t.Errorf("Deleted task %s should not remain in todo zone order", a.ID)
		}
	}
}

func TestUnit_ITask_Reorder_PreservesAbsentZones(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	a := seedTaskInTodo(t, env, "H", "A", nil)
	b := seedTaskInTodo(t, env, "H", "B", nil)

	// Pre-populate doing zone via direct order write so we can verify it
	// survives a Reorder that omits "doing".
	preOrder, _ := env.tasks.LoadTaskOrder()
	preOrder["doing"] = []string{"placeholder"}
	if err := env.tasks.SaveTaskOrder(preOrder); err != nil {
		t.Fatalf("SaveTaskOrder failed: %v", err)
	}

	out, err := env.tasks.Reorder(map[string][]string{
		"todo": {b.ID, a.ID}, // swap order
	})
	if err != nil {
		t.Fatalf("Reorder failed: %v", err)
	}
	if got := out.Positions["todo"]; len(got) != 2 || got[0] != b.ID || got[1] != a.ID {
		t.Errorf("Expected outcome todo = [%s, %s], got %v", b.ID, a.ID, got)
	}

	order, _ := env.tasks.LoadTaskOrder()
	if got := order["doing"]; len(got) != 1 || got[0] != "placeholder" {
		t.Errorf("Expected doing zone preserved, got %v", got)
	}
	if got := order["todo"]; len(got) != 2 || got[0] != b.ID || got[1] != a.ID {
		t.Errorf("Expected todo reordered to [%s, %s], got %v", b.ID, a.ID, got)
	}
}

// TestUnit_ITask_ConcurrentMoveVsArchive_NoRace runs Move and Archive
// concurrently against the same TaskAccess. -race must report nothing.
func TestUnit_ITask_ConcurrentMoveVsArchive_NoRace(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	tasks := make([]Task, 0, 16)
	for i := 0; i < 16; i++ {
		tasks = append(tasks, seedTaskInTodo(t, env, "H", fmt.Sprintf("t-%d", i), nil))
	}

	const workers = 8
	var wg sync.WaitGroup
	wg.Add(workers)
	for w := 0; w < workers; w++ {
		go func(w int) {
			defer wg.Done()
			id := tasks[w*2].ID
			if w%2 == 0 {
				_, _ = env.tasks.Move(MoveRequest{TaskID: id, NewStatus: "doing"})
			} else {
				_ = env.tasks.Archive(id)
			}
		}(w)
	}
	wg.Wait()
}
