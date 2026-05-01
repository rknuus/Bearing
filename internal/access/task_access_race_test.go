package access

import (
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

// =============================================================================
// Cross-facet concurrent-writer tests (task 100).
//
// These tests cover the race scenarios identified in the access-atomicity
// audit:
//   - #4 split-mutex (verified indirectly: every facet shares ta.mu).
//   - #6 task-ID generation collisions for routine-style "T<n>" IDs.
//   - #7 Move/Archive split (verified end-to-end: cross-zone consistency).
//   - #8 archived-order corruption under concurrent writers.
//
// Each test uses a shared TaskAccess instance and enough goroutines to make
// race-free serialisation observable under `go test -race`.
// =============================================================================

// TestUnit_RaceCrossFacet_MoveVsRenameColumn_NoHalfState exercises a
// concurrent ITask.Move(taskA -> review) with an IBoard.RenameColumn(review,
// code-review). The first verb that grabs ta.mu observes the pre-race world;
// the second observes the post-first-verb world. Either ordering must yield
// a self-consistent on-disk state: the column slug, the status directory,
// the order-map keys, and the task file location must all agree.
func TestUnit_RaceCrossFacet_MoveVsRenameColumn_NoHalfState(t *testing.T) {
	const iterations = 20

	for i := 0; i < iterations; i++ {
		env, _, cleanup := setupTestPlanAccess(t)
		seedColumns(t, env)

		// Seed a task in todo that the Move goroutine will migrate to
		// "review". The RenameColumn goroutine renames the same target
		// column.
		created, err := env.tasks.Create(Task{Title: "racer", ThemeID: "H", Priority: "important-not-urgent"}, "todo")
		if err != nil {
			cleanup()
			t.Fatalf("iter %d: Create failed: %v", i, err)
		}

		var wg sync.WaitGroup
		var moveErr, renameErr error
		wg.Add(2)
		go func() {
			defer wg.Done()
			_, moveErr = env.tasks.Move(MoveRequest{TaskID: created.ID, NewStatus: "review"})
		}()
		go func() {
			defer wg.Done()
			_, renameErr = env.tasks.RenameColumn("review", "code-review", "Code Review")
		}()
		wg.Wait()

		// End state must be self-consistent regardless of who won.
		cfg, err := env.tasks.Get()
		if err != nil {
			cleanup()
			t.Fatalf("iter %d: Get failed: %v", i, err)
		}
		hasReview := findColumnIndex(&cfg, "review") >= 0
		hasCodeReview := findColumnIndex(&cfg, "code-review") >= 0
		reviewDir := env.tasks.statusDirExists("review")
		codeReviewDir := env.tasks.statusDirExists("code-review")

		// Exactly one of {review, code-review} must be present in the
		// configuration; the matching status directory must exist; the
		// other must not.
		if hasReview == hasCodeReview {
			cleanup()
			t.Fatalf("iter %d: configuration has review=%v code-review=%v (must be exclusive); moveErr=%v, renameErr=%v",
				i, hasReview, hasCodeReview, moveErr, renameErr)
		}
		if hasReview && !reviewDir {
			cleanup()
			t.Fatalf("iter %d: config has 'review' but directory missing (moveErr=%v, renameErr=%v)", i, moveErr, renameErr)
		}
		if hasCodeReview && !codeReviewDir {
			cleanup()
			t.Fatalf("iter %d: config has 'code-review' but directory missing (moveErr=%v, renameErr=%v)", i, moveErr, renameErr)
		}
		if !hasReview && reviewDir {
			cleanup()
			t.Fatalf("iter %d: 'review' directory exists but column removed from config (moveErr=%v, renameErr=%v)", i, moveErr, renameErr)
		}
		if !hasCodeReview && codeReviewDir {
			cleanup()
			t.Fatalf("iter %d: 'code-review' directory exists but column not in config (moveErr=%v, renameErr=%v)", i, moveErr, renameErr)
		}

		// Order-map keys must reflect the surviving slug exclusively.
		order, err := env.tasks.LoadTaskOrder()
		if err != nil {
			cleanup()
			t.Fatalf("iter %d: LoadTaskOrder failed: %v", i, err)
		}
		if hasCodeReview {
			if _, exists := order["review"]; exists {
				cleanup()
				t.Fatalf("iter %d: order map still contains stale 'review' key after rename: %v", i, order)
			}
		}
		if hasReview {
			if _, exists := order["code-review"]; exists {
				cleanup()
				t.Fatalf("iter %d: order map contains 'code-review' key when column was not renamed: %v", i, order)
			}
		}

		cleanup()
	}
}

// TestUnit_RaceCrossFacet_MoveVsArchive_OrdersConsistent runs a concurrent
// ITask.Move(taskA, doing) and ITask.Archive(taskB) and checks that BOTH
// task_order.json and archived_order.json end up in mutually consistent
// states: taskA appears exactly once in active zones, taskB appears
// exactly once in archived order, and neither leaks into the other side.
// Repeated iterations exercise both schedule orderings.
func TestUnit_RaceCrossFacet_MoveVsArchive_OrdersConsistent(t *testing.T) {
	const iterations = 20

	for i := 0; i < iterations; i++ {
		env, _, cleanup := setupTestPlanAccess(t)
		a := seedTaskInTodo(t, env, "H", fmt.Sprintf("a-%d", i), nil)
		b := seedTaskInTodo(t, env, "H", fmt.Sprintf("b-%d", i), nil)

		var wg sync.WaitGroup
		var moveErr, archiveErr error
		wg.Add(2)
		go func() {
			defer wg.Done()
			_, moveErr = env.tasks.Move(MoveRequest{TaskID: a.ID, NewStatus: "doing"})
		}()
		go func() {
			defer wg.Done()
			archiveErr = env.tasks.Archive(b.ID)
		}()
		wg.Wait()

		if moveErr != nil {
			cleanup()
			t.Fatalf("iter %d: Move failed: %v", i, moveErr)
		}
		if archiveErr != nil {
			cleanup()
			t.Fatalf("iter %d: Archive failed: %v", i, archiveErr)
		}

		order, err := env.tasks.LoadTaskOrder()
		if err != nil {
			cleanup()
			t.Fatalf("iter %d: LoadTaskOrder failed: %v", i, err)
		}
		archived, err := env.tasks.LoadArchivedOrder()
		if err != nil {
			cleanup()
			t.Fatalf("iter %d: LoadArchivedOrder failed: %v", i, err)
		}

		// taskA: must appear exactly once across active zones, never in archived.
		seenA := 0
		for _, ids := range order {
			for _, id := range ids {
				if id == a.ID {
					seenA++
				}
			}
		}
		if seenA != 1 {
			cleanup()
			t.Fatalf("iter %d: taskA expected 1 occurrence in active zones, saw %d (order=%v)", i, seenA, order)
		}
		for _, id := range archived {
			if id == a.ID {
				cleanup()
				t.Fatalf("iter %d: taskA leaked into archived order: %v", i, archived)
			}
		}

		// taskB: must appear exactly once in archived, never in active.
		seenB := 0
		for _, id := range archived {
			if id == b.ID {
				seenB++
			}
		}
		if seenB != 1 {
			cleanup()
			t.Fatalf("iter %d: taskB expected 1 occurrence in archived order, saw %d (archived=%v)", i, seenB, archived)
		}
		for _, ids := range order {
			for _, id := range ids {
				if id == b.ID {
					cleanup()
					t.Fatalf("iter %d: taskB leaked into active zone (order=%v)", i, order)
				}
			}
		}

		cleanup()
	}
}

// TestUnit_RaceCrossFacet_ConcurrentArchive_ArchivedOrderConsistent stresses
// archived_order.json under N>=8 concurrent Archive callers (audit #8). After
// every goroutine finishes, the archived-order slice must contain each task
// exactly once and have no duplicates or drops.
func TestUnit_RaceCrossFacet_ConcurrentArchive_ArchivedOrderConsistent(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	const goroutines = 12
	tasks := make([]Task, 0, goroutines)
	for i := 0; i < goroutines; i++ {
		tasks = append(tasks, seedTaskInTodo(t, env, "H", fmt.Sprintf("t-%d", i), nil))
	}

	var wg sync.WaitGroup
	errs := make(chan error, goroutines)
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func(id string) {
			defer wg.Done()
			if err := env.tasks.Archive(id); err != nil {
				errs <- err
			}
		}(tasks[i].ID)
	}
	wg.Wait()
	close(errs)

	for err := range errs {
		t.Fatalf("Archive failed under concurrency: %v", err)
	}

	archived, err := env.tasks.LoadArchivedOrder()
	if err != nil {
		t.Fatalf("LoadArchivedOrder failed: %v", err)
	}
	if len(archived) != goroutines {
		t.Fatalf("Expected %d archived entries, got %d: %v", goroutines, len(archived), archived)
	}
	seen := map[string]struct{}{}
	for _, id := range archived {
		if _, dup := seen[id]; dup {
			t.Fatalf("Duplicate ID in archived order: %s (full=%v)", id, archived)
		}
		seen[id] = struct{}{}
	}
	for _, task := range tasks {
		if _, ok := seen[task.ID]; !ok {
			t.Fatalf("Task %s missing from archived order: %v", task.ID, archived)
		}
	}
}

// TestUnit_RaceCrossFacet_ConcurrentCreate_RoutineIDsUnique closes audit
// finding #6 for the routine-style "T<n>" code path: when ThemeID is empty
// and the task carries the "Routine" tag, generateTaskID must allocate
// unique IDs even under concurrent Create calls. ≥8 goroutines x several
// creates each ensures the lock reliably serialises ID allocation.
func TestUnit_RaceCrossFacet_ConcurrentCreate_RoutineIDsUnique(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	const goroutines = 10
	const perGoroutine = 4

	var wg sync.WaitGroup
	results := make(chan string, goroutines*perGoroutine)
	errs := make(chan error, goroutines*perGoroutine)

	for g := 0; g < goroutines; g++ {
		wg.Add(1)
		go func(g int) {
			defer wg.Done()
			for i := 0; i < perGoroutine; i++ {
				task := Task{
					Title: fmt.Sprintf("routine-g%d-i%d", g, i),
					Tags:  []string{"Routine"},
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

	expected := goroutines * perGoroutine
	seen := map[string]struct{}{}
	for id := range results {
		// Every routine ID must follow the "T<n>" shape (no theme prefix).
		if !strings.HasPrefix(id, "T") || strings.Contains(id, "-") {
			t.Fatalf("Expected routine ID matching 'T<n>', got %q", id)
		}
		if _, dup := seen[id]; dup {
			t.Fatalf("Duplicate routine ID under concurrent Create: %s", id)
		}
		seen[id] = struct{}{}
	}
	if len(seen) != expected {
		t.Fatalf("Expected %d unique routine IDs, got %d", expected, len(seen))
	}

	// Every created task must be discoverable via Find and live in the todo zone.
	all, err := env.tasks.Find(TaskFilter{Status: strPtr("todo")})
	if err != nil {
		t.Fatalf("Find failed: %v", err)
	}
	if len(all) != expected {
		t.Fatalf("Expected %d tasks in todo, found %d", expected, len(all))
	}
	order, err := env.tasks.LoadTaskOrder()
	if err != nil {
		t.Fatalf("LoadTaskOrder failed: %v", err)
	}
	if len(order["todo"]) != expected {
		t.Fatalf("Expected %d entries in todo order, got %d", expected, len(order["todo"]))
	}
}

// TestUnit_RaceCrossFacet_PromoteVsConcurrentSave verifies that IBatch.Promote
// re-validates each task's source priority under the lock against on-disk
// state (audit #4 + #7). One goroutine calls Promote; another concurrently
// rewrites a target task's priority via ITask.Save, which races for ta.mu.
// If the Save lands first the Promote MUST detect the stale source and skip
// that task; if Promote lands first the Save lands afterward and overwrites
// the promoted priority. Either outcome must leave the on-disk state
// internally consistent — the disk priority and order-map zone always agree.
func TestUnit_RaceCrossFacet_PromoteVsConcurrentSave(t *testing.T) {
	const iterations = 15

	for i := 0; i < iterations; i++ {
		env, _, cleanup := setupTestPlanAccess(t)
		makeTaskInTodo(t, env, "H-T1", "H", string(PriorityImportantNotUrgent))
		makeTaskInTodo(t, env, "H-T2", "H", string(PriorityImportantNotUrgent))

		// Goroutine A: promote both tasks important-not-urgent ->
		// important-urgent. Goroutine B: rewrite H-T1 to a different
		// priority. The order in which these grab ta.mu determines the
		// outcome.
		req := PromoteRequest{
			Promotions: []TaskPromotion{
				{TaskID: "H-T1", NewPriority: string(PriorityImportantUrgent), ClearPromotionDate: true},
				{TaskID: "H-T2", NewPriority: string(PriorityImportantUrgent), ClearPromotionDate: true},
			},
		}

		// Read the original task to construct a Save-rewrite payload.
		original := readTaskFromTodo(t, env, "H-T1")
		rewritten := original
		rewritten.Priority = string(PriorityNotImportantUrgent)

		var wg sync.WaitGroup
		var outcome PromoteOutcome
		var promoteErr, saveErr error
		var promoteDone atomic.Bool

		wg.Add(2)
		go func() {
			defer wg.Done()
			outcome, promoteErr = env.tasks.Promote(req)
			promoteDone.Store(true)
		}()
		go func() {
			defer wg.Done()
			saveErr = env.tasks.Save(rewritten)
		}()
		wg.Wait()

		if promoteErr != nil {
			cleanup()
			t.Fatalf("iter %d: Promote failed: %v", i, promoteErr)
		}
		if saveErr != nil {
			cleanup()
			t.Fatalf("iter %d: Save failed: %v", i, saveErr)
		}

		t1 := readTaskFromTodo(t, env, "H-T1")
		// H-T2 always promotes (it never raced).
		t2 := readTaskFromTodo(t, env, "H-T2")
		if t2.Priority != string(PriorityImportantUrgent) {
			cleanup()
			t.Fatalf("iter %d: H-T2 expected promoted to important-urgent, got %q", i, t2.Priority)
		}
		if contains(outcome.Skipped, "H-T2") {
			cleanup()
			t.Fatalf("iter %d: H-T2 unexpectedly listed as skipped: %v", i, outcome.Skipped)
		}

		// H-T1: depending on schedule either Promote saw the stale source
		// (from the Save) and skipped it, OR Promote ran first and Save
		// overwrote the promoted priority afterwards.
		switch t1.Priority {
		case string(PriorityNotImportantUrgent):
			// Save landed last (or Save ran first then Promote skipped).
			// Either way, t1 priority on disk == "not-important-urgent".
		case string(PriorityImportantUrgent):
			// Promote landed last and applied.
			if contains(outcome.Skipped, "H-T1") {
				cleanup()
				t.Fatalf("iter %d: H-T1 priority=important-urgent on disk but Promote reported skipped", i)
			}
		default:
			cleanup()
			t.Fatalf("iter %d: H-T1 priority unexpected: %q (skipped=%v)", i, t1.Priority, outcome.Skipped)
		}

		// The task must still appear exactly once across the order map's
		// active zones, regardless of who won.
		order, err := env.tasks.LoadTaskOrder()
		if err != nil {
			cleanup()
			t.Fatalf("iter %d: LoadTaskOrder failed: %v", i, err)
		}
		count := 0
		for _, ids := range order {
			for _, id := range ids {
				if id == "H-T1" {
					count++
				}
			}
		}
		if count != 1 {
			cleanup()
			t.Fatalf("iter %d: H-T1 expected to appear once in order map, saw %d (order=%v)", i, count, order)
		}

		cleanup()
	}
}

// contains reports whether s is present in xs.
func contains(xs []string, s string) bool {
	for _, x := range xs {
		if x == s {
			return true
		}
	}
	return false
}
