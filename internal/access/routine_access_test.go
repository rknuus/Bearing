package access

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"testing"

	"github.com/rkn/bearing/internal/utilities"
)

func TestNewRoutineAccess_EmptyDataPath(t *testing.T) {
	_, err := NewRoutineAccess("", nil)
	if err == nil {
		t.Error("Expected error for empty dataPath")
	}
}

func TestNewRoutineAccess_NilRepo(t *testing.T) {
	_, err := NewRoutineAccess("/tmp/test", nil)
	if err == nil {
		t.Error("Expected error for nil repo")
	}
}

func TestGetRoutines_EmptyRepository(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	routines, err := env.routines.GetRoutines()
	if err != nil {
		t.Fatalf("GetRoutines failed: %v", err)
	}

	if len(routines) != 0 {
		t.Errorf("Expected 0 routines, got %d", len(routines))
	}
}

func TestSaveRoutine_NewRoutine(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	routine := Routine{
		ID:          "R1",
		Description: "Morning exercise",
		RepeatPattern: &RepeatPattern{
			Frequency: "daily",
			Interval:  1,
			StartDate: utilities.CalendarDate("2026-01-01"),
		},
	}

	err := env.routines.SaveRoutine(routine)
	if err != nil {
		t.Fatalf("SaveRoutine failed: %v", err)
	}

	// Verify routine was saved
	routines, err := env.routines.GetRoutines()
	if err != nil {
		t.Fatalf("GetRoutines failed: %v", err)
	}

	if len(routines) != 1 {
		t.Fatalf("Expected 1 routine, got %d", len(routines))
	}

	saved := routines[0]
	if saved.ID != "R1" {
		t.Errorf("Expected ID R1, got %s", saved.ID)
	}
	if saved.Description != "Morning exercise" {
		t.Errorf("Expected description 'Morning exercise', got %s", saved.Description)
	}
	if saved.RepeatPattern == nil {
		t.Fatal("Expected RepeatPattern to be set")
	}
	if saved.RepeatPattern.Frequency != "daily" {
		t.Errorf("Expected frequency 'daily', got %s", saved.RepeatPattern.Frequency)
	}
}

func TestSaveRoutine_UpdateExisting(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	// Create initial routine
	routine := Routine{
		ID:          "R1",
		Description: "Morning exercise",
	}
	if err := env.routines.SaveRoutine(routine); err != nil {
		t.Fatalf("SaveRoutine failed: %v", err)
	}

	// Update the routine
	updated := Routine{
		ID:          "R1",
		Description: "Evening meditation",
	}
	if err := env.routines.SaveRoutine(updated); err != nil {
		t.Fatalf("SaveRoutine update failed: %v", err)
	}

	// Verify update
	routines, err := env.routines.GetRoutines()
	if err != nil {
		t.Fatalf("GetRoutines failed: %v", err)
	}

	if len(routines) != 1 {
		t.Errorf("Expected 1 routine, got %d", len(routines))
	}
	if routines[0].Description != "Evening meditation" {
		t.Errorf("Expected updated description, got %s", routines[0].Description)
	}
}

func TestSaveRoutine_EmptyID(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	routine := Routine{
		Description: "No ID routine",
	}
	err := env.routines.SaveRoutine(routine)
	if err == nil {
		t.Error("Expected error for empty routine ID")
	}
}

func TestSaveRoutine_MultipleRoutines(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	routines := []Routine{
		{ID: "R1", Description: "Morning exercise"},
		{ID: "R2", Description: "Read for 30 minutes"},
		{ID: "R3", Description: "Evening review"},
	}

	for _, r := range routines {
		if err := env.routines.SaveRoutine(r); err != nil {
			t.Fatalf("SaveRoutine failed: %v", err)
		}
	}

	saved, err := env.routines.GetRoutines()
	if err != nil {
		t.Fatalf("GetRoutines failed: %v", err)
	}

	if len(saved) != 3 {
		t.Fatalf("Expected 3 routines, got %d", len(saved))
	}

	expectedIDs := []string{"R1", "R2", "R3"}
	for i, r := range saved {
		if r.ID != expectedIDs[i] {
			t.Errorf("Expected ID %s, got %s", expectedIDs[i], r.ID)
		}
	}
}

func TestDeleteRoutine(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	// Create routines
	r1 := Routine{ID: "R1", Description: "Morning exercise"}
	r2 := Routine{ID: "R2", Description: "Read for 30 minutes"}

	if err := env.routines.SaveRoutine(r1); err != nil {
		t.Fatalf("SaveRoutine failed: %v", err)
	}
	if err := env.routines.SaveRoutine(r2); err != nil {
		t.Fatalf("SaveRoutine failed: %v", err)
	}

	// Delete one routine
	if err := env.routines.DeleteRoutine("R1"); err != nil {
		t.Fatalf("DeleteRoutine failed: %v", err)
	}

	// Verify deletion
	routines, err := env.routines.GetRoutines()
	if err != nil {
		t.Fatalf("GetRoutines failed: %v", err)
	}

	if len(routines) != 1 {
		t.Fatalf("Expected 1 routine, got %d", len(routines))
	}
	if routines[0].ID != "R2" {
		t.Errorf("Expected remaining routine ID R2, got %s", routines[0].ID)
	}
}

func TestDeleteRoutine_NotFound(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	err := env.routines.DeleteRoutine("R99")
	if err == nil {
		t.Error("Expected error when deleting non-existent routine")
	}
}

func TestSaveRoutines_BulkWrite(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	routines := []Routine{
		{ID: "R1", Description: "Morning exercise"},
		{ID: "R2", Description: "Read for 30 minutes"},
		{ID: "R3", Description: "Evening review"},
	}

	if err := env.routines.SaveRoutines(routines); err != nil {
		t.Fatalf("SaveRoutines failed: %v", err)
	}

	saved, err := env.routines.GetRoutines()
	if err != nil {
		t.Fatalf("GetRoutines failed: %v", err)
	}

	if len(saved) != 3 {
		t.Fatalf("Expected 3 routines, got %d", len(saved))
	}
}

func TestSaveRoutines_OverwritesExisting(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	// Save initial routines
	initial := []Routine{
		{ID: "R1", Description: "First"},
		{ID: "R2", Description: "Second"},
	}
	if err := env.routines.SaveRoutines(initial); err != nil {
		t.Fatalf("SaveRoutines failed: %v", err)
	}

	// Overwrite with different set
	replacement := []Routine{
		{ID: "R5", Description: "New one"},
	}
	if err := env.routines.SaveRoutines(replacement); err != nil {
		t.Fatalf("SaveRoutines failed: %v", err)
	}

	saved, err := env.routines.GetRoutines()
	if err != nil {
		t.Fatalf("GetRoutines failed: %v", err)
	}

	if len(saved) != 1 {
		t.Fatalf("Expected 1 routine after overwrite, got %d", len(saved))
	}
	if saved[0].ID != "R5" {
		t.Errorf("Expected ID R5, got %s", saved[0].ID)
	}
}

func TestGetRoutines_FileFormat(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	routine := Routine{
		ID:          "R1",
		Description: "Test routine",
	}
	if err := env.routines.SaveRoutine(routine); err != nil {
		t.Fatalf("SaveRoutine failed: %v", err)
	}

	// Read the raw file to verify JSON structure
	filePath := filepath.Join(env.dataDir, "routines.json")
	data, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("Failed to read routines.json: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("Failed to parse raw JSON: %v", err)
	}

	if _, ok := raw["routines"]; !ok {
		t.Error("Expected 'routines' key in JSON file")
	}
}

func TestNextRoutineID_EmptyList(t *testing.T) {
	id := NextRoutineID([]Routine{})
	if id != "R1" {
		t.Errorf("Expected R1, got %s", id)
	}
}

func TestNextRoutineID_Sequential(t *testing.T) {
	routines := []Routine{
		{ID: "R1"},
		{ID: "R2"},
		{ID: "R3"},
	}
	id := NextRoutineID(routines)
	if id != "R4" {
		t.Errorf("Expected R4, got %s", id)
	}
}

func TestNextRoutineID_GapsInSequence(t *testing.T) {
	routines := []Routine{
		{ID: "R1"},
		{ID: "R5"},
		{ID: "R3"},
	}
	id := NextRoutineID(routines)
	if id != "R6" {
		t.Errorf("Expected R6, got %s", id)
	}
}

func TestNextRoutineID_IgnoresNonMatchingIDs(t *testing.T) {
	routines := []Routine{
		{ID: "R1"},
		{ID: "H-R2"},   // Legacy theme-scoped ID
		{ID: "custom"},  // Non-standard ID
		{ID: "R3"},
	}
	id := NextRoutineID(routines)
	if id != "R4" {
		t.Errorf("Expected R4, got %s", id)
	}
}

// TestSaveRoutine_ConcurrentWriters verifies that the RoutineAccess RMW mutex
// prevents lost updates when many goroutines call SaveRoutine in parallel for
// distinct routines. Without the mutex, two goroutines could each read the
// same baseline, mutate independent in-memory copies, and race on the write
// step — losing one set of edits. Run under `go test -race` to additionally
// surface any data race on shared internal state.
func TestSaveRoutine_ConcurrentWriters(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	const n = 16

	var wg sync.WaitGroup
	errs := make(chan error, n)
	wg.Add(n)
	for i := 1; i <= n; i++ {
		go func(idx int) {
			defer wg.Done()
			r := Routine{
				ID:          fmt.Sprintf("R%d", idx),
				Description: fmt.Sprintf("Routine %d", idx),
			}
			if err := env.routines.SaveRoutine(r); err != nil {
				errs <- fmt.Errorf("SaveRoutine(R%d): %w", idx, err)
			}
		}(i)
	}
	wg.Wait()
	close(errs)

	for err := range errs {
		t.Errorf("concurrent SaveRoutine failed: %v", err)
	}

	saved, err := env.routines.GetRoutines()
	if err != nil {
		t.Fatalf("GetRoutines failed: %v", err)
	}

	if len(saved) != n {
		t.Fatalf("Expected %d routines after concurrent writes, got %d", n, len(saved))
	}

	ids := make([]string, len(saved))
	for i, r := range saved {
		ids[i] = r.ID
	}
	sort.Strings(ids)

	expected := make([]string, n)
	for i := 0; i < n; i++ {
		expected[i] = fmt.Sprintf("R%d", i+1)
	}
	sort.Strings(expected)

	for i, want := range expected {
		if ids[i] != want {
			t.Errorf("Missing routine after concurrent writes: want %v, got %v", expected, ids)
			break
		}
	}
}

// TestUnit_RoutineAccess_WriteRoutine_PersistsWithoutCommit verifies that
// WriteRoutine writes the routine to disk but produces no git commit.
func TestUnit_RoutineAccess_WriteRoutine_PersistsWithoutCommit(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	beforeHead := headCommitID(t, env.repo)

	r := Routine{ID: "R1", Description: "Daily walk"}
	if err := env.routines.WriteRoutine(r); err != nil {
		t.Fatalf("WriteRoutine failed: %v", err)
	}

	saved, err := env.routines.GetRoutines()
	if err != nil {
		t.Fatalf("GetRoutines failed: %v", err)
	}
	if len(saved) != 1 || saved[0].ID != "R1" {
		t.Fatalf("WriteRoutine did not persist correctly: got %#v", saved)
	}

	afterHead := headCommitID(t, env.repo)
	if beforeHead != afterHead {
		t.Errorf("WriteRoutine produced an unexpected commit: HEAD %q -> %q", beforeHead, afterHead)
	}
}

// TestUnit_RoutineAccess_WriteSaveRoutines_PersistsWithoutCommit verifies the
// bulk no-commit variant.
func TestUnit_RoutineAccess_WriteSaveRoutines_PersistsWithoutCommit(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	beforeHead := headCommitID(t, env.repo)

	routines := []Routine{
		{ID: "R1", Description: "First"},
		{ID: "R2", Description: "Second"},
	}
	if err := env.routines.WriteSaveRoutines(routines); err != nil {
		t.Fatalf("WriteSaveRoutines failed: %v", err)
	}

	saved, err := env.routines.GetRoutines()
	if err != nil {
		t.Fatalf("GetRoutines failed: %v", err)
	}
	if len(saved) != 2 {
		t.Fatalf("Expected 2 routines, got %d", len(saved))
	}

	afterHead := headCommitID(t, env.repo)
	if beforeHead != afterHead {
		t.Errorf("WriteSaveRoutines produced an unexpected commit: HEAD %q -> %q", beforeHead, afterHead)
	}
}

// TestUnit_RoutineAccess_WriteDeleteRoutine_RemovesWithoutCommit verifies the
// no-commit delete variant.
func TestUnit_RoutineAccess_WriteDeleteRoutine_RemovesWithoutCommit(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	if err := env.routines.SaveRoutine(Routine{ID: "R1", Description: "Seed"}); err != nil {
		t.Fatalf("seed SaveRoutine failed: %v", err)
	}

	beforeHead := headCommitID(t, env.repo)

	if err := env.routines.WriteDeleteRoutine("R1"); err != nil {
		t.Fatalf("WriteDeleteRoutine failed: %v", err)
	}

	saved, err := env.routines.GetRoutines()
	if err != nil {
		t.Fatalf("GetRoutines failed: %v", err)
	}
	if len(saved) != 0 {
		t.Errorf("Expected 0 routines after WriteDeleteRoutine, got %d", len(saved))
	}

	afterHead := headCommitID(t, env.repo)
	if beforeHead != afterHead {
		t.Errorf("WriteDeleteRoutine produced an unexpected commit: HEAD %q -> %q", beforeHead, afterHead)
	}
}

// TestUnit_RoutineAccess_CommittingMethods_ProduceExactlyOneCommit guards
// against regressions in the Write*/Save* refactor.
func TestUnit_RoutineAccess_CommittingMethods_ProduceExactlyOneCommit(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	commitsBefore := func() int {
		h, err := env.repo.GetHistory(100)
		if err != nil {
			return 0
		}
		return len(h)
	}

	checkOne := func(name string, fn func() error) {
		t.Helper()
		before := commitsBefore()
		if err := fn(); err != nil {
			t.Fatalf("%s failed: %v", name, err)
		}
		after := commitsBefore()
		if after-before != 1 {
			t.Errorf("%s: expected 1 new commit, got %d", name, after-before)
		}
	}

	checkOne("SaveRoutine", func() error {
		return env.routines.SaveRoutine(Routine{ID: "R1", Description: "A"})
	})
	checkOne("SaveRoutines", func() error {
		return env.routines.SaveRoutines([]Routine{{ID: "R2", Description: "B"}})
	})
	checkOne("DeleteRoutine", func() error {
		return env.routines.DeleteRoutine("R2")
	})
}

func TestRoutineWithExceptions(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	routine := Routine{
		ID:          "R1",
		Description: "Weekly review",
		RepeatPattern: &RepeatPattern{
			Frequency: "weekly",
			Interval:  1,
			Weekdays:  []int{1}, // Monday
			StartDate: utilities.CalendarDate("2026-01-05"),
		},
		Exceptions: []ScheduleException{
			{
				OriginalDate: utilities.CalendarDate("2026-01-12"),
				NewDate:      utilities.CalendarDate("2026-01-13"),
			},
		},
	}

	if err := env.routines.SaveRoutine(routine); err != nil {
		t.Fatalf("SaveRoutine failed: %v", err)
	}

	routines, err := env.routines.GetRoutines()
	if err != nil {
		t.Fatalf("GetRoutines failed: %v", err)
	}

	if len(routines) != 1 {
		t.Fatalf("Expected 1 routine, got %d", len(routines))
	}

	saved := routines[0]
	if len(saved.Exceptions) != 1 {
		t.Fatalf("Expected 1 exception, got %d", len(saved.Exceptions))
	}
	if saved.Exceptions[0].OriginalDate != "2026-01-12" {
		t.Errorf("Expected original date 2026-01-12, got %s", saved.Exceptions[0].OriginalDate)
	}
	if saved.Exceptions[0].NewDate != "2026-01-13" {
		t.Errorf("Expected new date 2026-01-13, got %s", saved.Exceptions[0].NewDate)
	}
}
