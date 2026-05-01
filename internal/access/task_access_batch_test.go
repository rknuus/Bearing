package access

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

// makeTaskInTodo writes a task file directly to the todo status directory
// and registers it in task_order.json under the priority zone. It bypasses
// TaskAccess's lock to set up test fixtures without producing extra git
// commits.
func makeTaskInTodo(t *testing.T, env *testEnv, id, themeID, priority string) {
	t.Helper()
	task := Task{
		ID:       id,
		Title:    id,
		ThemeID:  themeID,
		Priority: priority,
	}
	dir := env.tasks.taskDirPath(string(TaskStatusTodo))
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("mkdir %s: %v", dir, err)
	}
	path := filepath.Join(dir, id+".json")
	data, err := json.MarshalIndent(task, "", "  ")
	if err != nil {
		t.Fatalf("marshal task: %v", err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatalf("write task: %v", err)
	}

	// Register in task_order.json under the priority zone.
	orderMap, err := env.tasks.LoadTaskOrder()
	if err != nil {
		t.Fatalf("load task order: %v", err)
	}
	orderMap[priority] = append(orderMap[priority], id)
	if err := env.tasks.WriteTaskOrder(orderMap); err != nil {
		t.Fatalf("write task order: %v", err)
	}

	// Commit the fixture so subsequent stage operations on the file
	// are valid (otherwise go-git logs an "entry not found" warning).
	if err := commitAll(env.repo, "fixture: add "+id); err != nil {
		t.Fatalf("commit fixture: %v", err)
	}
}

// readTaskFromTodo reads the task with the given ID from the todo
// status directory, failing the test if it cannot be loaded.
func readTaskFromTodo(t *testing.T, env *testEnv, id string) Task {
	t.Helper()
	path := filepath.Join(env.tasks.taskDirPath(string(TaskStatusTodo)), id+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read task %s: %v", id, err)
	}
	var task Task
	if err := json.Unmarshal(data, &task); err != nil {
		t.Fatalf("unmarshal task %s: %v", id, err)
	}
	return task
}

func TestUnit_Promote_HappyPath_AllPromoted(t *testing.T) {
	t.Parallel()
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	for _, id := range []string{"H-T1", "H-T2", "H-T3"} {
		makeTaskInTodo(t, env, id, "H", string(PriorityImportantNotUrgent))
	}

	before := commitCount(t, env.repo)

	req := PromoteRequest{
		Promotions: []TaskPromotion{
			{TaskID: "H-T1", NewPriority: string(PriorityImportantUrgent), ClearPromotionDate: true},
			{TaskID: "H-T2", NewPriority: string(PriorityImportantUrgent), ClearPromotionDate: true},
			{TaskID: "H-T3", NewPriority: string(PriorityImportantUrgent), ClearPromotionDate: true},
		},
	}
	outcome, err := env.tasks.Promote(req)
	if err != nil {
		t.Fatalf("Promote returned error: %v", err)
	}
	if outcome.Count != 3 {
		t.Errorf("expected Count=3, got %d", outcome.Count)
	}
	if len(outcome.Skipped) != 0 {
		t.Errorf("expected no skipped, got %v", outcome.Skipped)
	}

	after := commitCount(t, env.repo)
	if after-before != 1 {
		t.Errorf("expected exactly one new commit, got %d", after-before)
	}

	// Verify each task's on-disk priority.
	for _, id := range []string{"H-T1", "H-T2", "H-T3"} {
		task := readTaskFromTodo(t, env, id)
		if task.Priority != string(PriorityImportantUrgent) {
			t.Errorf("task %s priority = %q, want %q", id, task.Priority, PriorityImportantUrgent)
		}
	}

	// Verify task_order.json migrated from old zone to new zone.
	orderMap, err := env.tasks.LoadTaskOrder()
	if err != nil {
		t.Fatalf("LoadTaskOrder: %v", err)
	}
	if leftover, ok := orderMap[string(PriorityImportantNotUrgent)]; ok && len(leftover) != 0 {
		t.Errorf("expected old zone empty, got %v", leftover)
	}
	newZone := orderMap[string(PriorityImportantUrgent)]
	for _, id := range []string{"H-T1", "H-T2", "H-T3"} {
		if !slices.Contains(newZone, id) {
			t.Errorf("expected %s in new zone, got %v", id, newZone)
		}
	}
}

func TestUnit_Promote_StaleSourceIsSkipped(t *testing.T) {
	t.Parallel()
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	makeTaskInTodo(t, env, "H-T1", "H", string(PriorityImportantNotUrgent))
	makeTaskInTodo(t, env, "H-T2", "H", string(PriorityImportantNotUrgent))
	// H-T3 is "stale": its on-disk priority changed between the manager's
	// scan and the access call.
	makeTaskInTodo(t, env, "H-T3", "H", string(PriorityNotImportantUrgent))

	before := commitCount(t, env.repo)

	req := PromoteRequest{
		Promotions: []TaskPromotion{
			{TaskID: "H-T1", NewPriority: string(PriorityImportantUrgent), ClearPromotionDate: true},
			{TaskID: "H-T2", NewPriority: string(PriorityImportantUrgent), ClearPromotionDate: true},
			{TaskID: "H-T3", NewPriority: string(PriorityImportantUrgent), ClearPromotionDate: true},
		},
	}
	outcome, err := env.tasks.Promote(req)
	if err != nil {
		t.Fatalf("Promote returned error: %v", err)
	}
	if outcome.Count != 2 {
		t.Errorf("expected Count=2, got %d", outcome.Count)
	}
	if len(outcome.Skipped) != 1 || outcome.Skipped[0] != "H-T3" {
		t.Errorf("expected Skipped=[H-T3], got %v", outcome.Skipped)
	}

	after := commitCount(t, env.repo)
	if after-before != 1 {
		t.Errorf("expected exactly one new commit, got %d", after-before)
	}

	// H-T3 still at not-important-urgent, untouched.
	t3 := readTaskFromTodo(t, env, "H-T3")
	if t3.Priority != string(PriorityNotImportantUrgent) {
		t.Errorf("H-T3 priority changed: got %q, want %q", t3.Priority, PriorityNotImportantUrgent)
	}
	t1 := readTaskFromTodo(t, env, "H-T1")
	if t1.Priority != string(PriorityImportantUrgent) {
		t.Errorf("H-T1 priority = %q, want %q", t1.Priority, PriorityImportantUrgent)
	}
}

func TestUnit_Commit_HappyPath_CreatesAndDeletes(t *testing.T) {
	t.Parallel()
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Pre-populate one task that we will delete.
	makeTaskInTodo(t, env, "H-T9", "H", string(PriorityImportantUrgent))

	before := commitCount(t, env.repo)

	req := BatchRequest{
		Creates: []TaskCreate{
			{
				Task:     Task{Title: "first new", ThemeID: "H", Priority: string(PriorityImportantUrgent)},
				DropZone: string(PriorityImportantUrgent),
			},
			{
				Task:     Task{Title: "second new", ThemeID: "H", Priority: string(PriorityImportantNotUrgent)},
				DropZone: string(PriorityImportantNotUrgent),
			},
		},
		Deletes: []string{"H-T9"},
	}
	outcome, err := env.tasks.Commit(req)
	if err != nil {
		t.Fatalf("Commit returned error: %v", err)
	}
	if len(outcome.CreatedIDs) != 2 {
		t.Errorf("expected 2 created IDs, got %v", outcome.CreatedIDs)
	}
	if len(outcome.DeletedIDs) != 1 || outcome.DeletedIDs[0] != "H-T9" {
		t.Errorf("expected DeletedIDs=[H-T9], got %v", outcome.DeletedIDs)
	}

	after := commitCount(t, env.repo)
	if after-before != 1 {
		t.Errorf("expected exactly one new commit, got %d", after-before)
	}

	// Verify deleted file is gone.
	deletedPath := filepath.Join(env.tasks.taskDirPath(string(TaskStatusTodo)), "H-T9.json")
	if _, err := os.Stat(deletedPath); !os.IsNotExist(err) {
		t.Errorf("expected deleted task file to be gone, got err=%v", err)
	}

	// Verify each created file exists in the todo dir.
	for _, id := range outcome.CreatedIDs {
		path := filepath.Join(env.tasks.taskDirPath(string(TaskStatusTodo)), id+".json")
		if _, err := os.Stat(path); err != nil {
			t.Errorf("expected created task file %s, got err=%v", path, err)
		}
	}

	// Verify task_order.json reflects creates and delete.
	orderMap, err := env.tasks.LoadTaskOrder()
	if err != nil {
		t.Fatalf("LoadTaskOrder: %v", err)
	}
	for _, ids := range orderMap {
		if slices.Contains(ids, "H-T9") {
			t.Errorf("H-T9 still present in order map: %v", orderMap)
		}
	}
	if !slices.Contains(orderMap[string(PriorityImportantUrgent)], outcome.CreatedIDs[0]) {
		t.Errorf("first created not in important-urgent zone: %v", orderMap)
	}
	if !slices.Contains(orderMap[string(PriorityImportantNotUrgent)], outcome.CreatedIDs[1]) {
		t.Errorf("second created not in important-not-urgent zone: %v", orderMap)
	}
}

func TestUnit_Commit_MidBatchFailure_NoStateChange(t *testing.T) {
	t.Parallel()
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Pre-populate a task we would delete after the failing create.
	makeTaskInTodo(t, env, "H-T9", "H", string(PriorityImportantUrgent))

	before := commitCount(t, env.repo)
	beforeOrder, err := env.tasks.LoadTaskOrder()
	if err != nil {
		t.Fatalf("LoadTaskOrder: %v", err)
	}

	// Snapshot the entries currently inside the todo directory so we can
	// detect any leftover create later.
	dir := env.tasks.taskDirPath(string(TaskStatusTodo))
	beforeEntries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir %s: %v", dir, err)
	}
	beforeNames := map[string]bool{}
	for _, e := range beforeEntries {
		beforeNames[e.Name()] = true
	}

	// Second create has neither ThemeID nor the "Routine" tag — saveTaskFile
	// rejects it, simulating a mid-batch write failure.
	req := BatchRequest{
		Creates: []TaskCreate{
			{
				Task:     Task{Title: "valid create", ThemeID: "H", Priority: string(PriorityImportantUrgent)},
				DropZone: string(PriorityImportantUrgent),
			},
			{
				Task:     Task{Title: "invalid create", ThemeID: "" /* and no Routine tag */},
				DropZone: string(PriorityImportantUrgent),
			},
		},
		Deletes: []string{"H-T9"},
	}
	outcome, err := env.tasks.Commit(req)
	if err == nil {
		t.Fatalf("expected error from Commit, got nil; outcome=%+v", outcome)
	}

	// No new commit.
	after := commitCount(t, env.repo)
	if after != before {
		t.Errorf("expected no new commit on rollback, got %d new", after-before)
	}

	// Pre-existing task file still on disk.
	preExisting := filepath.Join(dir, "H-T9.json")
	if _, err := os.Stat(preExisting); err != nil {
		t.Errorf("expected pre-existing task file to be restored, got err=%v", err)
	}

	// No leftover task files from the partial create.
	afterEntries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir %s: %v", dir, err)
	}
	for _, e := range afterEntries {
		if !beforeNames[e.Name()] {
			t.Errorf("leftover file after rollback: %s", e.Name())
		}
	}

	// Order map unchanged on disk (we never persisted the in-memory mutations).
	afterOrder, err := env.tasks.LoadTaskOrder()
	if err != nil {
		t.Fatalf("LoadTaskOrder: %v", err)
	}
	if !sameOrderMap(beforeOrder, afterOrder) {
		t.Errorf("order map changed after rollback:\nbefore=%v\nafter=%v", beforeOrder, afterOrder)
	}
}

// sameOrderMap is a deep-equal helper for map[string][]string.
func sameOrderMap(a, b map[string][]string) bool {
	if len(a) != len(b) {
		return false
	}
	for k, av := range a {
		bv, ok := b[k]
		if !ok || len(av) != len(bv) {
			return false
		}
		for i := range av {
			if av[i] != bv[i] {
				return false
			}
		}
	}
	return true
}
