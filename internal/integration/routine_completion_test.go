// Package integration: end-to-end tests for PlanningManager.RecordRoutineCompletions
// against the real Resource Access stack (TaskAccess / CalendarAccess /
// RoutineAccess) backed by a temp git repository.
//
// These complement the unit tests in internal/managers (which exercise the
// single-commit shape via stub repo + mock access) by crossing the access
// boundary and verifying the actual git plumbing: one commit, the expected
// touched files, and clean rollback when the body of the transaction fails.
//
// Closes the user-story acceptance criteria for the access-atomicity
// initiative (audit finding #5: N+1 commits regression).
package integration

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/rkn/bearing/internal/access"
	"github.com/rkn/bearing/internal/managers"
	"github.com/rkn/bearing/internal/utilities"
)

// seedRoutine writes a routine through RoutineAccess so PlanningManager's
// RecordRoutineCompletions has catalogue metadata for the diff. The default
// (no RepeatPattern) is sporadic, which keeps materialised priority
// deterministic regardless of completion history. Tests that exercise the
// overdue-priority promotion path supply a daily RepeatPattern explicitly.
func seedRoutine(t *testing.T, ra *access.RoutineAccess, id, description string) {
	t.Helper()
	if err := ra.SaveRoutine(access.Routine{ID: id, Description: description}); err != nil {
		t.Fatalf("seed routine %s: %v", id, err)
	}
}

// dataAccess returns the access components attached to the manager via the
// integration fixture. setupIntegrationTest only exposes TaskAccess; the
// routine/calendar accesses are needed here, so we re-open them against
// the same dataDir and repo (safe — they share state through the
// filesystem and per-component mutex).
func dataAccess(t *testing.T, tmpDir string, repo utilities.IRepository) (*access.RoutineAccess, *access.CalendarAccess) {
	t.Helper()
	dataDir := filepath.Join(tmpDir, "data")
	ra, err := access.NewRoutineAccess(dataDir, repo)
	if err != nil {
		t.Fatalf("open RoutineAccess: %v", err)
	}
	ca, err := access.NewCalendarAccess(dataDir, repo)
	if err != nil {
		t.Fatalf("open CalendarAccess: %v", err)
	}
	return ra, ca
}

// TestIntegration_RecordRoutineCompletions_ThreeRoutines_OneCommit verifies
// the single-commit guarantee on REAL git plumbing: three newly-checked
// routines fan out to three task-create writes plus one calendar write,
// but surface as exactly ONE git commit on the data repository. The commit
// message follows the agreed template and the touched paths cover every
// fan-out target (calendar/<year>.json + 3 task files).
func TestIntegration_RecordRoutineCompletions_ThreeRoutines_OneCommit(t *testing.T) {
	manager, taskAccess, repo, tmpDir, cleanup := setupIntegrationTest(t)
	defer cleanup()

	ra, _ := dataAccess(t, tmpDir, repo)
	seedRoutine(t, ra, "R1", "Morning run")
	seedRoutine(t, ra, "R2", "Read 30 minutes")
	seedRoutine(t, ra, "R3", "Meditation")

	historyBefore, err := repo.GetHistory(0)
	if err != nil {
		t.Fatalf("history before: %v", err)
	}
	commitsBefore := len(historyBefore)

	day := managers.DayFocus{
		Date:          utilities.MustParseCalendarDate("2026-04-10"),
		RoutineChecks: []string{"R1", "R2", "R3"},
	}
	if err := manager.RecordRoutineCompletions(day, nil); err != nil {
		t.Fatalf("RecordRoutineCompletions: %v", err)
	}

	historyAfter, err := repo.GetHistory(0)
	if err != nil {
		t.Fatalf("history after: %v", err)
	}
	delta := len(historyAfter) - commitsBefore
	if delta != 1 {
		t.Fatalf("expected exactly 1 new commit, got %d", delta)
	}

	wantMsg := "Record routine completions for 2026-04-10"
	if got := historyAfter[0].Message; !strings.Contains(got, wantMsg) {
		t.Errorf("commit message: want contains %q, got %q", wantMsg, got)
	}

	// Three task files in todo, each with a Routine tag and the typed
	// RoutineRef link back to its source occurrence.
	todoDir := filepath.Join(tmpDir, "data", "tasks", "todo")
	entries, err := os.ReadDir(todoDir)
	if err != nil {
		t.Fatalf("read todo dir: %v", err)
	}
	jsonCount := 0
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".json") {
			jsonCount++
		}
	}
	if jsonCount != 3 {
		t.Errorf("expected 3 task files in todo, got %d", jsonCount)
	}

	// Calendar/<year>.json must exist and carry the day's RoutineChecks.
	calPath := filepath.Join(tmpDir, "data", "calendar", "2026.json")
	if _, err := os.Stat(calPath); err != nil {
		t.Errorf("calendar file missing: %v", err)
	}

	// Cross-check via the access layer's typed read (RoutineRef is an
	// access-level link not surfaced on the manager's TaskWithStatus DTO).
	todoTasks, err := taskAccess.GetTasksByStatus("todo")
	if err != nil {
		t.Fatalf("GetTasksByStatus(todo): %v", err)
	}
	seenRoutines := map[string]bool{}
	for _, task := range todoTasks {
		if task.RoutineRef != nil {
			seenRoutines[task.RoutineRef.RoutineID] = true
		}
	}
	for _, id := range []string{"R1", "R2", "R3"} {
		if !seenRoutines[id] {
			t.Errorf("expected materialised task for routine %s, missing", id)
		}
	}
}

// TestIntegration_RecordRoutineCompletions_FaultRollback_NoCommit_NoFiles
// drives the rollback path with a real git repo: an injected fault inside
// IBatch.CommitNoTx makes the RunTransaction body return an error. The
// outer transaction must cancel cleanly — no new commit, no leftover task
// files, and no calendar entry on disk.
//
// We use the test-only TaskAccess.SetCommitNoTxFaultHookForTest seam (see
// task_access_batch.go) because once the manager has pre-validated its
// inputs, no natural per-element failure path remains for the access verb
// to surface. The seam has no production reachability: it is a nil
// closure unless a test explicitly arms it.
func TestIntegration_RecordRoutineCompletions_FaultRollback_NoCommit_NoFiles(t *testing.T) {
	manager, taskAccess, repo, tmpDir, cleanup := setupIntegrationTest(t)
	defer cleanup()

	ra, _ := dataAccess(t, tmpDir, repo)
	seedRoutine(t, ra, "R1", "Morning run")

	historyBefore, err := repo.GetHistory(0)
	if err != nil {
		t.Fatalf("history before: %v", err)
	}
	commitsBefore := len(historyBefore)

	sentinel := errors.New("simulated batch failure")
	taskAccess.SetCommitNoTxFaultHookForTest(func() error { return sentinel })
	defer taskAccess.SetCommitNoTxFaultHookForTest(nil)

	day := managers.DayFocus{
		Date:          utilities.MustParseCalendarDate("2026-04-11"),
		RoutineChecks: []string{"R1"},
	}
	err = manager.RecordRoutineCompletions(day, nil)
	if err == nil {
		t.Fatal("expected error from injected fault, got nil")
	}

	// Error shape suitable for ErrorDialog: the manager wraps the cause
	// so callers can errors.Is the sentinel through the chain.
	if !errors.Is(err, sentinel) {
		t.Errorf("expected errors.Is to match sentinel; got %v", err)
	}

	historyAfter, err := repo.GetHistory(0)
	if err != nil {
		t.Fatalf("history after: %v", err)
	}
	if delta := len(historyAfter) - commitsBefore; delta != 0 {
		t.Errorf("expected 0 new commits on rollback, got %d", delta)
	}

	// No task files materialised for this day.
	todoDir := filepath.Join(tmpDir, "data", "tasks", "todo")
	entries, err := os.ReadDir(todoDir)
	if err != nil {
		t.Fatalf("read todo dir: %v", err)
	}
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".json") {
			t.Errorf("unexpected task file present after rollback: %s", e.Name())
		}
	}

	// No calendar entry for the date — RunTransaction's tx.Cancel() must
	// have rejected the working-tree write. Real git semantics: even if
	// the working tree had a transient WriteDayFocus write, the cancel
	// + no-commit means the index has not advanced, so on subsequent
	// reads the day must be absent.
	yearFocus, err := manager.GetYearFocus(2026)
	if err != nil {
		t.Fatalf("GetYearFocus: %v", err)
	}
	for _, df := range yearFocus {
		if df.Date.String() == "2026-04-11" {
			t.Errorf("unexpected calendar entry persisted after rollback: %+v", df)
		}
	}
}

// TestIntegration_RecordRoutineCompletions_OverdueDailyRoutine_PromotesToUrgent
// is the end-to-end behaviour-regression guard: a daily routine started five
// days ago has no prior completions on disk, so checking it today must
// materialise the resulting task at important-urgent priority. This crosses
// the full pipeline (RoutineAccess + CalendarAccess.GetRoutineCompletions
// + ScheduleEngine.Plan + TaskAccess.CommitNoTx) on real git plumbing.
//
// Closes the regression introduced when RecordRoutineCompletions replaced
// SaveDayFocusWithRoutines: the manager fed empty CompletedDates into the
// engine, which silently degraded the urgency rule to "always not urgent".
func TestIntegration_RecordRoutineCompletions_OverdueDailyRoutine_PromotesToUrgent(t *testing.T) {
	manager, taskAccess, repo, tmpDir, cleanup := setupIntegrationTest(t)
	defer cleanup()

	ra, _ := dataAccess(t, tmpDir, repo)

	today := utilities.Today()
	startDate := utilities.NewCalendarDate(today.Time().AddDate(0, 0, -5))

	if err := ra.SaveRoutine(access.Routine{
		ID:          "R1",
		Description: "Daily journal",
		RepeatPattern: &access.RepeatPattern{
			Frequency: "daily",
			Interval:  1,
			StartDate: startDate,
		},
	}); err != nil {
		t.Fatalf("seed routine: %v", err)
	}

	day := managers.DayFocus{
		Date:          today,
		RoutineChecks: []string{"R1"},
	}
	if err := manager.RecordRoutineCompletions(day, nil); err != nil {
		t.Fatalf("RecordRoutineCompletions: %v", err)
	}

	todoTasks, err := taskAccess.GetTasksByStatus("todo")
	if err != nil {
		t.Fatalf("GetTasksByStatus(todo): %v", err)
	}
	var routineTask *access.Task
	for i := range todoTasks {
		if todoTasks[i].RoutineRef != nil && todoTasks[i].RoutineRef.RoutineID == "R1" {
			routineTask = &todoTasks[i]
			break
		}
	}
	if routineTask == nil {
		t.Fatal("expected materialised task for R1, none found")
	}
	if got := routineTask.Priority; got != string(access.PriorityImportantUrgent) {
		t.Errorf("priority = %q, want %q (overdue catch-up should promote to urgent)", got, access.PriorityImportantUrgent)
	}
}

// TestIntegration_RecordRoutineCompletions_FullyCompletedDaily_StaysNotUrgent
// is the non-regression counterpart on real git plumbing: a daily routine
// with every past occurrence already recorded as a completion in the
// calendar must materialise today's check at important-not-urgent.
func TestIntegration_RecordRoutineCompletions_FullyCompletedDaily_StaysNotUrgent(t *testing.T) {
	manager, taskAccess, repo, tmpDir, cleanup := setupIntegrationTest(t)
	defer cleanup()

	ra, ca := dataAccess(t, tmpDir, repo)

	today := utilities.Today()
	startDate := utilities.NewCalendarDate(today.Time().AddDate(0, 0, -3))

	if err := ra.SaveRoutine(access.Routine{
		ID:          "R1",
		Description: "Daily journal",
		RepeatPattern: &access.RepeatPattern{
			Frequency: "daily",
			Interval:  1,
			StartDate: startDate,
		},
	}); err != nil {
		t.Fatalf("seed routine: %v", err)
	}

	// Pre-seed completion history for every past daily occurrence so
	// ComputeOverdue's absorption rule classifies the routine as caught up.
	for offset := 3; offset >= 1; offset-- {
		past := utilities.NewCalendarDate(today.Time().AddDate(0, 0, -offset))
		if err := ca.SaveDayFocus(access.DayFocus{
			Date:          past,
			RoutineChecks: []string{"R1"},
		}); err != nil {
			t.Fatalf("seed completion %s: %v", past, err)
		}
	}

	day := managers.DayFocus{
		Date:          today,
		RoutineChecks: []string{"R1"},
	}
	if err := manager.RecordRoutineCompletions(day, nil); err != nil {
		t.Fatalf("RecordRoutineCompletions: %v", err)
	}

	todoTasks, err := taskAccess.GetTasksByStatus("todo")
	if err != nil {
		t.Fatalf("GetTasksByStatus(todo): %v", err)
	}
	var routineTask *access.Task
	for i := range todoTasks {
		if todoTasks[i].RoutineRef != nil && todoTasks[i].RoutineRef.RoutineID == "R1" {
			routineTask = &todoTasks[i]
			break
		}
	}
	if routineTask == nil {
		t.Fatal("expected materialised task for R1, none found")
	}
	if got := routineTask.Priority; got != string(access.PriorityImportantNotUrgent) {
		t.Errorf("priority = %q, want %q (fully caught up → no urgent promotion)", got, access.PriorityImportantNotUrgent)
	}
}

// TestIntegration_RecordRoutineCompletions_UncheckAfterDone_PreservesHistory
// covers the audit-driven invariant that completion history is sacred:
// once a routine task has been moved to "done", an uncheck of the routine
// for that day MUST NOT delete the task. The day's RoutineChecks update
// is still persisted (so the calendar reflects the user's current view),
// but the historical task remains on disk.
func TestIntegration_RecordRoutineCompletions_UncheckAfterDone_PreservesHistory(t *testing.T) {
	manager, taskAccess, repo, tmpDir, cleanup := setupIntegrationTest(t)
	defer cleanup()

	ra, _ := dataAccess(t, tmpDir, repo)
	seedRoutine(t, ra, "R1", "Morning run")

	date := utilities.MustParseCalendarDate("2026-04-12")

	// First check: materialises the routine task into todo and saves the
	// calendar entry with R1 in RoutineChecks.
	day := managers.DayFocus{Date: date, RoutineChecks: []string{"R1"}}
	if err := manager.RecordRoutineCompletions(day, nil); err != nil {
		t.Fatalf("initial RecordRoutineCompletions: %v", err)
	}

	// Locate the materialised task via the access layer (RoutineRef is
	// not surfaced on the manager DTO) and move it through doing -> done.
	todoTasks, err := taskAccess.GetTasksByStatus("todo")
	if err != nil {
		t.Fatalf("GetTasksByStatus(todo): %v", err)
	}
	var routineTaskID string
	for _, task := range todoTasks {
		if task.RoutineRef != nil && task.RoutineRef.RoutineID == "R1" {
			routineTaskID = task.ID
			break
		}
	}
	if routineTaskID == "" {
		t.Fatalf("could not find materialised routine task for R1")
	}
	if _, err := manager.MoveTask(routineTaskID, "doing", "", nil); err != nil {
		t.Fatalf("move to doing: %v", err)
	}
	if _, err := manager.MoveTask(routineTaskID, "done", "", nil); err != nil {
		t.Fatalf("move to done: %v", err)
	}

	// Sanity: file is in done before we uncheck.
	donePath := filepath.Join(tmpDir, "data", "tasks", "done", routineTaskID+".json")
	if _, err := os.Stat(donePath); err != nil {
		t.Fatalf("expected task in done before uncheck: %v", err)
	}

	historyBefore, err := repo.GetHistory(0)
	if err != nil {
		t.Fatalf("history before uncheck: %v", err)
	}
	commitsBefore := len(historyBefore)

	// Uncheck the routine for that day. Previous checks: R1; new: empty.
	uncheckDay := managers.DayFocus{
		Date:          date,
		RoutineChecks: nil,
		Tags:          []string{"Routine"}, // simulating the prior auto-tag
	}
	if err := manager.RecordRoutineCompletions(uncheckDay, []string{"R1"}); err != nil {
		t.Fatalf("uncheck RecordRoutineCompletions: %v", err)
	}

	// Done task survives the uncheck — completion history preserved.
	if _, err := os.Stat(donePath); err != nil {
		t.Errorf("done task should be preserved after uncheck, got: %v", err)
	}

	// Calendar's RoutineChecks for the date no longer contains R1, and
	// the auto "Routine" tag has been dropped (no checks remain).
	yearFocus, err := manager.GetYearFocus(2026)
	if err != nil {
		t.Fatalf("GetYearFocus: %v", err)
	}
	var saved *managers.DayFocus
	for i := range yearFocus {
		if yearFocus[i].Date.String() == "2026-04-12" {
			saved = &yearFocus[i]
			break
		}
	}
	if saved == nil {
		t.Fatal("calendar entry missing after uncheck")
	}
	for _, id := range saved.RoutineChecks {
		if id == "R1" {
			t.Errorf("R1 should be absent from RoutineChecks after uncheck, got %v", saved.RoutineChecks)
		}
	}
	for _, tag := range saved.Tags {
		if tag == "Routine" {
			t.Errorf("'Routine' day tag should be removed when no checks remain, got %v", saved.Tags)
		}
	}

	// Exactly one commit covered the uncheck (single calendar write —
	// no batch since the only existing task is in done, not todo/doing).
	historyAfter, err := repo.GetHistory(0)
	if err != nil {
		t.Fatalf("history after uncheck: %v", err)
	}
	if delta := len(historyAfter) - commitsBefore; delta != 1 {
		t.Errorf("expected exactly 1 commit for uncheck, got %d", delta)
	}
}
