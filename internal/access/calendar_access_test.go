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

func TestNewCalendarAccess_EmptyDataPath(t *testing.T) {
	_, err := NewCalendarAccess("", nil)
	if err == nil {
		t.Error("Expected error for empty dataPath")
	}
}

func TestNewCalendarAccess_NilRepo(t *testing.T) {
	_, err := NewCalendarAccess("/tmp/test", nil)
	if err == nil {
		t.Error("Expected error for nil repo")
	}
}

func TestSaveDayFocus_NewEntry(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	day := DayFocus{
		Date:     utilities.MustParseCalendarDate("2026-03-15"),
		ThemeIDs: []string{"H1"},
		Notes:    "Spring planning",
	}

	if err := env.calendar.SaveDayFocus(day); err != nil {
		t.Fatalf("SaveDayFocus failed: %v", err)
	}

	got, err := env.calendar.GetDayFocus("2026-03-15")
	if err != nil {
		t.Fatalf("GetDayFocus failed: %v", err)
	}
	if got == nil {
		t.Fatal("Expected DayFocus, got nil")
	}
	if got.Notes != "Spring planning" {
		t.Errorf("Expected notes 'Spring planning', got %q", got.Notes)
	}
}

// TestSaveDayFocus_ConcurrentSameYear verifies that the read-modify-write
// cycle on calendar/<year>.json is serialised by CalendarAccess.mu. Without
// the mutex, two goroutines could each read the year file, mutate independent
// in-memory copies, and race on writeJSON — losing one set of edits.
//
// Run with `go test -race` to also assert no torn JSON or data races.
func TestSaveDayFocus_ConcurrentSameYear(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	const n = 16

	var wg sync.WaitGroup
	wg.Add(n)
	errs := make(chan error, n)

	for i := 0; i < n; i++ {
		i := i
		go func() {
			defer wg.Done()
			// Distinct days within January 2026.
			date := utilities.MustParseCalendarDate(fmt.Sprintf("2026-01-%02d", i+1))
			day := DayFocus{
				Date:  date,
				Notes: fmt.Sprintf("entry-%d", i),
			}
			if err := env.calendar.SaveDayFocus(day); err != nil {
				errs <- fmt.Errorf("SaveDayFocus(%s): %w", date.String(), err)
			}
		}()
	}

	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatal(err)
	}

	entries, err := env.calendar.GetYearFocus(2026)
	if err != nil {
		t.Fatalf("GetYearFocus failed: %v", err)
	}
	if len(entries) != n {
		t.Fatalf("Expected %d entries after concurrent writes, got %d", n, len(entries))
	}

	seen := make(map[string]string, n)
	for _, e := range entries {
		seen[e.Date.String()] = e.Notes
	}
	for i := 0; i < n; i++ {
		date := fmt.Sprintf("2026-01-%02d", i+1)
		notes, ok := seen[date]
		if !ok {
			t.Errorf("Missing entry for %s — RMW race lost a write", date)
			continue
		}
		if notes != fmt.Sprintf("entry-%d", i) {
			t.Errorf("Entry %s: expected notes %q, got %q", date, fmt.Sprintf("entry-%d", i), notes)
		}
	}

	// Verify the on-disk file is well-formed JSON (no torn write).
	filePath := filepath.Join(env.dataDir, "calendar", "2026.json")
	data, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("Failed to read year file: %v", err)
	}
	var parsed YearFocusFile
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Year file is not valid JSON: %v", err)
	}
	if parsed.Year != 2026 {
		t.Errorf("Expected year 2026 in file, got %d", parsed.Year)
	}
	if len(parsed.Entries) != n {
		t.Errorf("Expected %d entries in file, got %d", n, len(parsed.Entries))
	}
}

// TestUnit_CalendarAccess_WriteDayFocus_PersistsWithoutCommit verifies that
// WriteDayFocus writes the entry to disk but produces no git commit. Managers
// will use this variant inside utilities.RunTransaction so a single terminal
// commit can cover writes spanning multiple Access components.
func TestUnit_CalendarAccess_WriteDayFocus_PersistsWithoutCommit(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	beforeHead := headCommitID(t, env.repo)

	day := DayFocus{
		Date:  utilities.MustParseCalendarDate("2026-04-01"),
		Notes: "April fools",
	}
	if err := env.calendar.WriteDayFocus(day); err != nil {
		t.Fatalf("WriteDayFocus failed: %v", err)
	}

	got, err := env.calendar.GetDayFocus("2026-04-01")
	if err != nil {
		t.Fatalf("GetDayFocus failed: %v", err)
	}
	if got == nil || got.Notes != "April fools" {
		t.Fatalf("WriteDayFocus did not persist correctly: got %#v", got)
	}

	afterHead := headCommitID(t, env.repo)
	if beforeHead != afterHead {
		t.Errorf("WriteDayFocus produced an unexpected commit: HEAD %q -> %q", beforeHead, afterHead)
	}
}

// TestUnit_CalendarAccess_SaveDayFocus_ProducesExactlyOneCommit guards
// against a regression in the Write*/Save* refactor.
func TestUnit_CalendarAccess_SaveDayFocus_ProducesExactlyOneCommit(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	before, err := env.repo.GetHistory(100)
	if err != nil {
		before = nil
	}
	beforeCount := len(before)

	day := DayFocus{
		Date:  utilities.MustParseCalendarDate("2026-05-10"),
		Notes: "Test",
	}
	if err := env.calendar.SaveDayFocus(day); err != nil {
		t.Fatalf("SaveDayFocus failed: %v", err)
	}

	after, err := env.repo.GetHistory(100)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if got := len(after) - beforeCount; got != 1 {
		t.Errorf("SaveDayFocus: expected exactly 1 new commit, got %d", got)
	}
}
