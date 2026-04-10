package access

import (
	"encoding/json"
	"os"
	"path/filepath"
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
