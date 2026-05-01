package access

import (
	"fmt"
	"sort"
	"sync"
	"testing"

	"github.com/rkn/bearing/internal/utilities"
)

// headCommitID returns the current HEAD commit hash, or "" if the repository
// has no commits yet. Used by Write* tests to assert the no-commit invariant.
func headCommitID(t *testing.T, repo utilities.IRepository) string {
	t.Helper()
	history, err := repo.GetHistory(1)
	if err != nil {
		// Empty repo (no commits yet) is a normal state at test start.
		return ""
	}
	if len(history) == 0 {
		return ""
	}
	return history[0].ID
}

// TestUnit_ThemeAccess_ConcurrentSaveTheme_NoLostEdits verifies that the
// read-modify-write cycle (GetThemes -> mutate -> SaveTheme) is serialised so
// that N concurrent SaveTheme writers each contributing a distinct theme do
// not lose each other's edits. Without ThemeAccess.mu this test fails: each
// goroutine reads the same baseline, mutates an independent in-memory copy,
// and the last writer's commit clobbers the others.
//
// Run with `go test -race` to also verify there is no data race on the
// themes.json read path.
func TestUnit_ThemeAccess_ConcurrentSaveTheme_NoLostEdits(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	const writers = 16

	var wg sync.WaitGroup
	errs := make(chan error, writers)

	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			theme := LifeTheme{
				ID:    fmt.Sprintf("T%02d", idx),
				Name:  fmt.Sprintf("Theme %d", idx),
				Color: "#000000",
			}
			if err := env.themes.SaveTheme(theme); err != nil {
				errs <- fmt.Errorf("SaveTheme %d: %w", idx, err)
			}
		}(i)
	}

	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatalf("concurrent SaveTheme failed: %v", err)
	}

	saved, err := env.themes.GetThemes()
	if err != nil {
		t.Fatalf("GetThemes failed: %v", err)
	}

	if len(saved) != writers {
		t.Fatalf("expected %d themes after concurrent writes, got %d", writers, len(saved))
	}

	ids := make([]string, len(saved))
	for i, th := range saved {
		ids[i] = th.ID
	}
	sort.Strings(ids)

	expected := make([]string, writers)
	for i := 0; i < writers; i++ {
		expected[i] = fmt.Sprintf("T%02d", i)
	}
	sort.Strings(expected)

	for i := range expected {
		if ids[i] != expected[i] {
			t.Errorf("missing or unexpected theme at index %d: got %q want %q", i, ids[i], expected[i])
		}
	}
}

// TestUnit_ThemeAccess_ConcurrentSaveAndDelete_NoCorruption verifies that
// SaveTheme and DeleteTheme calls executed concurrently never leave themes.json
// in an internally inconsistent state (parse error, duplicate IDs, or a
// resurrected deleted theme).
func TestUnit_ThemeAccess_ConcurrentSaveAndDelete_NoCorruption(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	// Seed N themes that will be deleted concurrently with N new SaveTheme calls.
	const n = 8
	for i := 0; i < n; i++ {
		if err := env.themes.SaveTheme(LifeTheme{
			ID:    fmt.Sprintf("S%02d", i),
			Name:  fmt.Sprintf("Seed %d", i),
			Color: "#111111",
		}); err != nil {
			t.Fatalf("seed SaveTheme %d failed: %v", i, err)
		}
	}

	var wg sync.WaitGroup
	errs := make(chan error, 2*n)

	for i := 0; i < n; i++ {
		wg.Add(2)
		go func(idx int) {
			defer wg.Done()
			if err := env.themes.SaveTheme(LifeTheme{
				ID:    fmt.Sprintf("N%02d", idx),
				Name:  fmt.Sprintf("New %d", idx),
				Color: "#222222",
			}); err != nil {
				errs <- fmt.Errorf("SaveTheme N%02d: %w", idx, err)
			}
		}(i)
		go func(idx int) {
			defer wg.Done()
			if err := env.themes.DeleteTheme(fmt.Sprintf("S%02d", idx)); err != nil {
				errs <- fmt.Errorf("DeleteTheme S%02d: %w", idx, err)
			}
		}(i)
	}

	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatalf("concurrent Save/Delete failed: %v", err)
	}

	saved, err := env.themes.GetThemes()
	if err != nil {
		t.Fatalf("GetThemes failed: %v", err)
	}

	// Expect exactly the N new themes; all seeds must be gone.
	if len(saved) != n {
		t.Fatalf("expected %d themes after concurrent save+delete, got %d", n, len(saved))
	}
	seen := map[string]bool{}
	for _, th := range saved {
		if seen[th.ID] {
			t.Errorf("duplicate theme ID %q in final state", th.ID)
		}
		seen[th.ID] = true
		if th.ID[:1] == "S" {
			t.Errorf("seed theme %q was not deleted", th.ID)
		}
	}
}

// TestUnit_ThemeAccess_WriteTheme_PersistsWithoutCommit verifies that
// WriteTheme writes the theme to disk but produces no git commit. Managers
// will use this variant inside utilities.RunTransaction so a single terminal
// commit can cover writes spanning multiple Access components.
func TestUnit_ThemeAccess_WriteTheme_PersistsWithoutCommit(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	beforeHead := headCommitID(t, env.repo)

	theme := LifeTheme{ID: "T1", Name: "Wellness", Color: "#00ff00"}
	if err := env.themes.WriteTheme(theme); err != nil {
		t.Fatalf("WriteTheme failed: %v", err)
	}

	// File contents reflect the write.
	saved, err := env.themes.GetThemes()
	if err != nil {
		t.Fatalf("GetThemes failed: %v", err)
	}
	if len(saved) != 1 || saved[0].ID != "T1" || saved[0].Name != "Wellness" {
		t.Fatalf("WriteTheme did not persist correctly: got %#v", saved)
	}

	// HEAD must be unchanged — WriteTheme must NOT commit.
	afterHead := headCommitID(t, env.repo)
	if beforeHead != afterHead {
		t.Errorf("WriteTheme produced an unexpected commit: HEAD %q -> %q", beforeHead, afterHead)
	}
}

// TestUnit_ThemeAccess_WriteDeleteTheme_RemovesWithoutCommit verifies that
// WriteDeleteTheme removes the theme from disk without producing a commit.
func TestUnit_ThemeAccess_WriteDeleteTheme_RemovesWithoutCommit(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	// Seed a theme via the committing path.
	if err := env.themes.SaveTheme(LifeTheme{ID: "T1", Name: "Seed", Color: "#000"}); err != nil {
		t.Fatalf("seed SaveTheme failed: %v", err)
	}

	beforeHead := headCommitID(t, env.repo)

	if err := env.themes.WriteDeleteTheme("T1"); err != nil {
		t.Fatalf("WriteDeleteTheme failed: %v", err)
	}

	saved, err := env.themes.GetThemes()
	if err != nil {
		t.Fatalf("GetThemes failed: %v", err)
	}
	if len(saved) != 0 {
		t.Errorf("Expected 0 themes after WriteDeleteTheme, got %d", len(saved))
	}

	afterHead := headCommitID(t, env.repo)
	if beforeHead != afterHead {
		t.Errorf("WriteDeleteTheme produced an unexpected commit: HEAD %q -> %q", beforeHead, afterHead)
	}
}

// TestUnit_ThemeAccess_SaveTheme_ProducesExactlyOneCommit guards against a
// regression where the Write*/Save* refactor accidentally commits twice or
// not at all.
func TestUnit_ThemeAccess_SaveTheme_ProducesExactlyOneCommit(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	before, err := env.repo.GetHistory(100)
	if err != nil {
		before = nil // empty repo
	}
	beforeCount := len(before)

	if err := env.themes.SaveTheme(LifeTheme{ID: "T1", Name: "X", Color: "#000"}); err != nil {
		t.Fatalf("SaveTheme failed: %v", err)
	}

	after, err := env.repo.GetHistory(100)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if got := len(after) - beforeCount; got != 1 {
		t.Errorf("SaveTheme: expected exactly 1 new commit, got %d", got)
	}
}

// TestUnit_ThemeAccess_DeleteTheme_ProducesExactlyOneCommit mirrors the
// SaveTheme regression guard for the delete path.
func TestUnit_ThemeAccess_DeleteTheme_ProducesExactlyOneCommit(t *testing.T) {
	env, _, cleanup := setupTestEnv(t)
	defer cleanup()

	if err := env.themes.SaveTheme(LifeTheme{ID: "T1", Name: "X", Color: "#000"}); err != nil {
		t.Fatalf("seed SaveTheme failed: %v", err)
	}

	before, err := env.repo.GetHistory(100)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	beforeCount := len(before)

	if err := env.themes.DeleteTheme("T1"); err != nil {
		t.Fatalf("DeleteTheme failed: %v", err)
	}

	after, err := env.repo.GetHistory(100)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if got := len(after) - beforeCount; got != 1 {
		t.Errorf("DeleteTheme: expected exactly 1 new commit, got %d", got)
	}
}
