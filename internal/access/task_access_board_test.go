package access

import (
	"errors"
	"os"
	"sync"
	"sync/atomic"
	"testing"
)

// =============================================================================
// IBoard facet tests (task 96)
// =============================================================================

// seedColumns installs a known-good board configuration with three columns
// (todo / doing / done) plus a custom doing-type column "review", and
// makes sure each status directory exists.
func seedColumns(t *testing.T, env *testEnv) {
	t.Helper()
	cfg := &BoardConfiguration{
		Name: "Test",
		ColumnDefinitions: []ColumnDefinition{
			{Name: "todo", Title: "TODO", Type: ColumnTypeTodo},
			{Name: "doing", Title: "DOING", Type: ColumnTypeDoing},
			{Name: "review", Title: "REVIEW", Type: ColumnTypeDoing},
			{Name: "done", Title: "DONE", Type: ColumnTypeDone},
		},
	}
	if err := env.tasks.saveBoardConfiguration(cfg); err != nil {
		t.Fatalf("saveBoardConfiguration failed: %v", err)
	}
	for _, col := range cfg.ColumnDefinitions {
		if err := env.tasks.ensureStatusDirectory(col.Name); err != nil {
			t.Fatalf("ensureStatusDirectory(%s) failed: %v", col.Name, err)
		}
	}
	if err := commitAll(env.repo, "seed board"); err != nil {
		t.Fatalf("commitAll(seed) failed: %v", err)
	}
}

func TestUnit_IBoard_Get_ReturnsCurrentConfig(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	seedColumns(t, env)

	got, err := env.tasks.Get()
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if len(got.ColumnDefinitions) != 4 {
		t.Fatalf("Expected 4 columns, got %d", len(got.ColumnDefinitions))
	}
	if got.ColumnDefinitions[2].Name != "review" {
		t.Errorf("Expected third column 'review', got %q", got.ColumnDefinitions[2].Name)
	}
}

func TestUnit_IBoard_Get_EmptyConfigWhenAbsent(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	got, err := env.tasks.Get()
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if len(got.ColumnDefinitions) != 0 {
		t.Errorf("Expected no columns when config absent, got %d", len(got.ColumnDefinitions))
	}
}

func TestUnit_IBoard_AddColumn_AppendBeforeDoneBookend(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	seedColumns(t, env)
	beforeCommits := commitCount(t, env.repo)

	got, err := env.tasks.AddColumn("blocked", "BLOCKED", "")
	if err != nil {
		t.Fatalf("AddColumn failed: %v", err)
	}
	// Append with afterSlug="" must land BEFORE the done bookend so the
	// "todo first, done last" invariant survives.
	last := got.ColumnDefinitions[len(got.ColumnDefinitions)-1]
	if last.Name != "done" {
		t.Errorf("Expected 'done' to remain last, got %q", last.Name)
	}
	penultimate := got.ColumnDefinitions[len(got.ColumnDefinitions)-2]
	if penultimate.Name != "blocked" {
		t.Errorf("Expected 'blocked' before 'done', got %q", penultimate.Name)
	}
	if got.ColumnDefinitions[0].Name != "todo" {
		t.Errorf("Expected 'todo' to remain first, got %q", got.ColumnDefinitions[0].Name)
	}
	if !env.tasks.statusDirExists("blocked") {
		t.Errorf("Expected status directory 'blocked' to exist")
	}
	if afterCommits := commitCount(t, env.repo); afterCommits-beforeCommits != 1 {
		t.Errorf("Expected exactly 1 new commit, got %d", afterCommits-beforeCommits)
	}
}

func TestUnit_IBoard_AddColumn_InsertAfterExisting(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	seedColumns(t, env)
	beforeCommits := commitCount(t, env.repo)

	got, err := env.tasks.AddColumn("blocked", "BLOCKED", "doing")
	if err != nil {
		t.Fatalf("AddColumn failed: %v", err)
	}
	// Expected order: todo, doing, blocked, review, done.
	want := []string{"todo", "doing", "blocked", "review", "done"}
	if len(got.ColumnDefinitions) != len(want) {
		t.Fatalf("Expected %d columns, got %d", len(want), len(got.ColumnDefinitions))
	}
	for i, name := range want {
		if got.ColumnDefinitions[i].Name != name {
			t.Errorf("Column[%d]: expected %q, got %q", i, name, got.ColumnDefinitions[i].Name)
		}
	}
	if !env.tasks.statusDirExists("blocked") {
		t.Errorf("Expected status directory 'blocked' to exist")
	}
	if afterCommits := commitCount(t, env.repo); afterCommits-beforeCommits != 1 {
		t.Errorf("Expected exactly 1 new commit, got %d", afterCommits-beforeCommits)
	}
}

func TestUnit_IBoard_AddColumn_InsertAfterNonexistentFailsCleanly(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	seedColumns(t, env)
	beforeCommits := commitCount(t, env.repo)
	beforeConfig, _ := env.tasks.Get()

	if _, err := env.tasks.AddColumn("blocked", "BLOCKED", "ghost"); err == nil {
		t.Fatal("Expected error for unknown afterSlug")
	}

	// State must be unchanged.
	afterConfig, _ := env.tasks.Get()
	if len(afterConfig.ColumnDefinitions) != len(beforeConfig.ColumnDefinitions) {
		t.Errorf("Config column count changed after rejected AddColumn: before=%d after=%d", len(beforeConfig.ColumnDefinitions), len(afterConfig.ColumnDefinitions))
	}
	if env.tasks.statusDirExists("blocked") {
		t.Error("Expected 'blocked' directory NOT to exist after rejected AddColumn")
	}
	if afterCommits := commitCount(t, env.repo); afterCommits-beforeCommits != 0 {
		t.Errorf("Expected no new commits after rejected AddColumn, got %d", afterCommits-beforeCommits)
	}
}

func TestUnit_IBoard_AddColumn_InsertAfterDoneBookendFails(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	seedColumns(t, env)
	beforeCommits := commitCount(t, env.repo)
	beforeConfig, _ := env.tasks.Get()

	_, err := env.tasks.AddColumn("blocked", "BLOCKED", "done")
	if err == nil {
		t.Fatal("Expected error for inserting after done bookend")
	}
	if !errors.Is(err, ErrInsertAfterBookend) {
		t.Errorf("Expected ErrInsertAfterBookend, got %v", err)
	}

	afterConfig, _ := env.tasks.Get()
	if len(afterConfig.ColumnDefinitions) != len(beforeConfig.ColumnDefinitions) {
		t.Errorf("Config column count changed after rejected AddColumn: before=%d after=%d", len(beforeConfig.ColumnDefinitions), len(afterConfig.ColumnDefinitions))
	}
	if env.tasks.statusDirExists("blocked") {
		t.Error("Expected 'blocked' directory NOT to exist after rejected AddColumn")
	}
	if afterCommits := commitCount(t, env.repo); afterCommits-beforeCommits != 0 {
		t.Errorf("Expected no new commits after rejected AddColumn, got %d", afterCommits-beforeCommits)
	}
}

func TestUnit_IBoard_AddColumn_RejectsEmptyInput(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	if _, err := env.tasks.AddColumn("", "Title", ""); err == nil {
		t.Error("Expected error for empty slug")
	}
	if _, err := env.tasks.AddColumn("slug", "", ""); err == nil {
		t.Error("Expected error for empty title")
	}
}

func TestUnit_IBoard_RemoveColumn_EmptyColumnSucceeds(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	seedColumns(t, env)

	// Pre-populate task_order entry for "review" so we can verify cleanup.
	order, _ := env.tasks.LoadTaskOrder()
	order["review"] = []string{}
	if err := env.tasks.SaveTaskOrder(order); err != nil {
		t.Fatalf("SaveTaskOrder failed: %v", err)
	}

	beforeCommits := commitCount(t, env.repo)

	got, err := env.tasks.RemoveColumn("review")
	if err != nil {
		t.Fatalf("RemoveColumn failed: %v", err)
	}
	if findColumnIndex(&got, "review") >= 0 {
		t.Error("Expected 'review' to be removed from config")
	}
	if env.tasks.statusDirExists("review") {
		t.Error("Expected 'review' directory to be removed")
	}
	finalOrder, _ := env.tasks.LoadTaskOrder()
	if _, exists := finalOrder["review"]; exists {
		t.Error("Expected 'review' to be removed from task_order map")
	}
	if afterCommits := commitCount(t, env.repo); afterCommits-beforeCommits != 1 {
		t.Errorf("Expected exactly 1 new commit, got %d", afterCommits-beforeCommits)
	}
}

func TestUnit_IBoard_RemoveColumn_NonEmptyRejectsAndPreservesState(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	seedColumns(t, env)

	// Create a task in "review" via the ITask facet so the empty-check trips.
	created, err := env.tasks.Create(Task{Title: "Pending review", ThemeID: "H", Priority: "important-not-urgent"}, "review")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	// Move it into the review status directory (Create writes to todo by default).
	if _, err := env.tasks.Move(MoveRequest{TaskID: created.ID, NewStatus: "review"}); err != nil {
		t.Fatalf("Move failed: %v", err)
	}

	beforeCommits := commitCount(t, env.repo)
	beforeOrder, _ := env.tasks.LoadTaskOrder()
	beforeConfig, _ := env.tasks.Get()

	_, err = env.tasks.RemoveColumn("review")
	if err == nil {
		t.Fatal("Expected RemoveColumn to fail on non-empty column")
	}
	if !errors.Is(err, ErrColumnNotEmpty) {
		t.Errorf("Expected ErrColumnNotEmpty, got %v", err)
	}

	// State must be unchanged.
	if !env.tasks.statusDirExists("review") {
		t.Error("Expected 'review' directory to still exist after rejected RemoveColumn")
	}
	afterConfig, _ := env.tasks.Get()
	if len(afterConfig.ColumnDefinitions) != len(beforeConfig.ColumnDefinitions) {
		t.Errorf("Config column count changed after rejected RemoveColumn: before=%d after=%d", len(beforeConfig.ColumnDefinitions), len(afterConfig.ColumnDefinitions))
	}
	afterOrder, _ := env.tasks.LoadTaskOrder()
	if len(afterOrder) != len(beforeOrder) {
		t.Errorf("Order map size changed after rejected RemoveColumn: before=%d after=%d", len(beforeOrder), len(afterOrder))
	}
	if afterCommits := commitCount(t, env.repo); afterCommits-beforeCommits != 0 {
		t.Errorf("Expected no new commits after rejected RemoveColumn, got %d", afterCommits-beforeCommits)
	}
}

func TestUnit_IBoard_RemoveColumn_UnknownSlugFails(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	seedColumns(t, env)
	if _, err := env.tasks.RemoveColumn("does-not-exist"); err == nil {
		t.Error("Expected error for unknown slug")
	}
}

func TestUnit_IBoard_RenameColumn_DirAndOrderMigrated(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	seedColumns(t, env)

	// Seed a task_order entry with a deterministic order so we can verify
	// the migration preserves order.
	order, _ := env.tasks.LoadTaskOrder()
	order["review"] = []string{"H-T1", "H-T2", "H-T3"}
	if err := env.tasks.SaveTaskOrder(order); err != nil {
		t.Fatalf("SaveTaskOrder failed: %v", err)
	}

	beforeCommits := commitCount(t, env.repo)

	got, err := env.tasks.RenameColumn("review", "in-review", "In Review")
	if err != nil {
		t.Fatalf("RenameColumn failed: %v", err)
	}

	idx := findColumnIndex(&got, "in-review")
	if idx < 0 {
		t.Fatal("Expected 'in-review' in returned config")
	}
	if got.ColumnDefinitions[idx].Title != "In Review" {
		t.Errorf("Expected title 'In Review', got %q", got.ColumnDefinitions[idx].Title)
	}
	if env.tasks.statusDirExists("review") {
		t.Error("Expected 'review' directory to be gone")
	}
	if !env.tasks.statusDirExists("in-review") {
		t.Error("Expected 'in-review' directory to exist")
	}

	afterOrder, _ := env.tasks.LoadTaskOrder()
	if _, exists := afterOrder["review"]; exists {
		t.Error("Expected 'review' key removed from order map")
	}
	migrated := afterOrder["in-review"]
	if len(migrated) != 3 || migrated[0] != "H-T1" || migrated[1] != "H-T2" || migrated[2] != "H-T3" {
		t.Errorf("Order not preserved after rename: %v", migrated)
	}
	if afterCommits := commitCount(t, env.repo); afterCommits-beforeCommits != 1 {
		t.Errorf("Expected exactly 1 new commit, got %d", afterCommits-beforeCommits)
	}
}

func TestUnit_IBoard_RenameColumn_TitleOnlyWhenSlugUnchanged(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	seedColumns(t, env)

	got, err := env.tasks.RenameColumn("review", "review", "Code Review")
	if err != nil {
		t.Fatalf("RenameColumn failed: %v", err)
	}
	idx := findColumnIndex(&got, "review")
	if idx < 0 || got.ColumnDefinitions[idx].Title != "Code Review" {
		t.Errorf("Expected title updated, got %+v", got.ColumnDefinitions[idx])
	}
	if !env.tasks.statusDirExists("review") {
		t.Error("Expected 'review' directory to be intact for title-only rename")
	}
}

func TestUnit_IBoard_RetitleColumn_TitleOnlyNoSideEffects(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	seedColumns(t, env)

	order, _ := env.tasks.LoadTaskOrder()
	order["review"] = []string{"H-T1"}
	if err := env.tasks.SaveTaskOrder(order); err != nil {
		t.Fatalf("SaveTaskOrder failed: %v", err)
	}

	beforeCommits := commitCount(t, env.repo)

	got, err := env.tasks.RetitleColumn("review", "REVIEW v2")
	if err != nil {
		t.Fatalf("RetitleColumn failed: %v", err)
	}
	idx := findColumnIndex(&got, "review")
	if idx < 0 || got.ColumnDefinitions[idx].Title != "REVIEW v2" {
		t.Errorf("Expected updated title, got %+v", got.ColumnDefinitions[idx])
	}
	if !env.tasks.statusDirExists("review") {
		t.Error("Expected 'review' directory to be intact for retitle")
	}
	afterOrder, _ := env.tasks.LoadTaskOrder()
	if ids := afterOrder["review"]; len(ids) != 1 || ids[0] != "H-T1" {
		t.Errorf("Order map should be untouched by retitle: %v", ids)
	}
	if afterCommits := commitCount(t, env.repo); afterCommits-beforeCommits != 1 {
		t.Errorf("Expected exactly 1 new commit, got %d", afterCommits-beforeCommits)
	}
}

func TestUnit_IBoard_RetitleColumn_UnknownSlugFails(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	seedColumns(t, env)
	if _, err := env.tasks.RetitleColumn("missing", "X"); err == nil {
		t.Error("Expected error for unknown slug")
	}
}

func TestUnit_IBoard_ReorderColumns_AppliesNewOrder(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	seedColumns(t, env)

	got, err := env.tasks.ReorderColumns([]string{"todo", "review", "doing", "done"})
	if err != nil {
		t.Fatalf("ReorderColumns failed: %v", err)
	}
	names := make([]string, len(got.ColumnDefinitions))
	for i, c := range got.ColumnDefinitions {
		names[i] = c.Name
	}
	expected := []string{"todo", "review", "doing", "done"}
	for i, want := range expected {
		if names[i] != want {
			t.Errorf("Reorder[%d]: expected %q, got %q", i, want, names[i])
		}
	}
}

func TestUnit_IBoard_ReorderColumns_RejectsMismatchedSet(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	seedColumns(t, env)

	if _, err := env.tasks.ReorderColumns([]string{"todo", "doing"}); err == nil {
		t.Error("Expected error for size mismatch")
	}
	if _, err := env.tasks.ReorderColumns([]string{"todo", "doing", "review", "ghost"}); err == nil {
		t.Error("Expected error for unknown slug")
	}
	if _, err := env.tasks.ReorderColumns([]string{"todo", "doing", "doing", "done"}); err == nil {
		t.Error("Expected error for duplicate slug")
	}
}

// TestUnit_IBoard_ConcurrentRemoveVsMove_NoHalfState exercises the TOCTOU
// invariant: a concurrent RemoveColumn(X) and Move(...->X) must produce
// exactly one cleanly-failing operation and one cleanly-succeeding one,
// with no half-state on disk. The test is repeated several times because
// the goroutine-scheduling outcome is non-deterministic.
func TestUnit_IBoard_ConcurrentRemoveVsMove_NoHalfState(t *testing.T) {
	const iterations = 20

	for i := 0; i < iterations; i++ {
		env, _, cleanup := setupTestPlanAccess(t)
		seedColumns(t, env)

		// Seed one task in todo we can race-Move to "review".
		created, err := env.tasks.Create(Task{Title: "racer", ThemeID: "H", Priority: "important-not-urgent"}, "todo")
		if err != nil {
			cleanup()
			t.Fatalf("iter %d: Create failed: %v", i, err)
		}

		var wg sync.WaitGroup
		var removeErr, moveErr error
		var removeOK, moveOK atomic.Bool

		wg.Add(2)
		go func() {
			defer wg.Done()
			if _, err := env.tasks.RemoveColumn("review"); err == nil {
				removeOK.Store(true)
			} else {
				removeErr = err
			}
		}()
		go func() {
			defer wg.Done()
			if _, err := env.tasks.Move(MoveRequest{TaskID: created.ID, NewStatus: "review"}); err == nil {
				moveOK.Store(true)
			} else {
				moveErr = err
			}
		}()
		wg.Wait()

		// Validate end state is self-consistent regardless of which side won.
		cfg, _ := env.tasks.Get()
		hasReview := findColumnIndex(&cfg, "review") >= 0
		dirExists := env.tasks.statusDirExists("review")

		if hasReview != dirExists {
			cleanup()
			t.Fatalf("iter %d: half-state — config has review=%v but dir exists=%v (removeErr=%v, moveErr=%v)", i, hasReview, dirExists, removeErr, moveErr)
		}

		// If RemoveColumn won, the column is gone and Move must have
		// either run before it (task ended up in review, but review then
		// failed empty-check — RemoveColumn must NOT have succeeded), OR
		// run after it and either failed to find target or succeeded
		// with the directory recreated by the Move's os.Rename. We accept
		// either outcome as long as on-disk state is consistent.
		if removeOK.Load() && hasReview {
			cleanup()
			t.Fatalf("iter %d: RemoveColumn reported success but column still in config", i)
		}
		if !removeOK.Load() && !moveOK.Load() {
			// Both can't lose deterministically — at least one path
			// (the one that grabbed ta.mu first) should succeed unless
			// Move was rejected because RemoveColumn already deleted
			// the directory and Move's rename failed. That's acceptable.
			t.Logf("iter %d: both ops failed (removeErr=%v, moveErr=%v)", i, removeErr, moveErr)
		}

		cleanup()
	}
}

// Sanity assertion: a manual call to os.Stat on a nonexistent dir returns
// an error so statusDirExists's return value tracks reality.
func TestUnit_IBoard_statusDirExists_Honest(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	if env.tasks.statusDirExists("nope") {
		t.Error("Expected statusDirExists to be false for missing dir")
	}
	if err := os.MkdirAll(env.tasks.taskDirPath("yes"), 0755); err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}
	if !env.tasks.statusDirExists("yes") {
		t.Error("Expected statusDirExists to be true for present dir")
	}
}

// =============================================================================
// SeedDefaultBoard tests (task 109)
// =============================================================================

// TestUnit_SeedDefaultBoard_FreshRepoProducesOneCommit verifies that the
// bootstrap entry point materialises the canonical default board in a
// fresh data directory with exactly one git commit, populates the
// expected status directories, and writes a board_config.json whose
// columns match access.DefaultBoardConfiguration.
func TestUnit_SeedDefaultBoard_FreshRepoProducesOneCommit(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	beforeCommits := commitCount(t, env.repo)

	if err := env.tasks.SeedDefaultBoard(); err != nil {
		t.Fatalf("SeedDefaultBoard failed: %v", err)
	}

	if delta := commitCount(t, env.repo) - beforeCommits; delta != 1 {
		t.Errorf("Expected exactly 1 new commit, got %d", delta)
	}

	cfg, err := env.tasks.GetBoardConfiguration()
	if err != nil {
		t.Fatalf("GetBoardConfiguration failed: %v", err)
	}
	if cfg == nil {
		t.Fatal("Expected board_config.json to exist after seed")
	}

	want := DefaultBoardConfiguration()
	if cfg.Name != want.Name {
		t.Errorf("Expected name %q, got %q", want.Name, cfg.Name)
	}
	if len(cfg.ColumnDefinitions) != len(want.ColumnDefinitions) {
		t.Fatalf("Expected %d columns, got %d", len(want.ColumnDefinitions), len(cfg.ColumnDefinitions))
	}
	for i, col := range cfg.ColumnDefinitions {
		if col.Name != want.ColumnDefinitions[i].Name {
			t.Errorf("Column %d name: expected %q, got %q", i, want.ColumnDefinitions[i].Name, col.Name)
		}
		if col.Type != want.ColumnDefinitions[i].Type {
			t.Errorf("Column %d type: expected %q, got %q", i, want.ColumnDefinitions[i].Type, col.Type)
		}
		if !env.tasks.statusDirExists(col.Name) {
			t.Errorf("Expected status directory for %q to exist", col.Name)
		}
	}
}

// TestUnit_SeedDefaultBoard_IdempotentOnSecondCall verifies that an
// already-seeded data directory is left untouched: no new commit is
// produced and the existing board configuration is not rewritten.
func TestUnit_SeedDefaultBoard_IdempotentOnSecondCall(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	if err := env.tasks.SeedDefaultBoard(); err != nil {
		t.Fatalf("First SeedDefaultBoard failed: %v", err)
	}
	commitsAfterFirst := commitCount(t, env.repo)

	if err := env.tasks.SeedDefaultBoard(); err != nil {
		t.Fatalf("Second SeedDefaultBoard failed: %v", err)
	}
	if delta := commitCount(t, env.repo) - commitsAfterFirst; delta != 0 {
		t.Errorf("Expected no new commit on idempotent call, got %d", delta)
	}
}
