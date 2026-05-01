package bootstrap

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/rkn/bearing/internal/access"
	"github.com/rkn/bearing/internal/utilities"
)

// migrateTestEnv bundles a real TaskAccess + git-backed repo for migration tests.
type migrateTestEnv struct {
	taskAccess *access.TaskAccess
	repo       utilities.IRepository
	dataDir    string
	logger     *slog.Logger
	logBuf     *bytes.Buffer
}

func setupMigrateTestEnv(t *testing.T) *migrateTestEnv {
	t.Helper()

	tmpDir := t.TempDir()
	dataDir := filepath.Join(tmpDir, "data")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}

	gitConfig := &utilities.AuthorConfiguration{User: "Test", Email: "test@example.com"}
	repo, err := utilities.InitializeRepositoryWithConfig(tmpDir, gitConfig)
	if err != nil {
		t.Fatalf("init repo: %v", err)
	}
	t.Cleanup(func() { _ = repo.Close() })

	ta, err := access.NewTaskAccess(dataDir, repo)
	if err != nil {
		t.Fatalf("new task access: %v", err)
	}

	logBuf := &bytes.Buffer{}
	logger := slog.New(slog.NewTextHandler(logBuf, &slog.HandlerOptions{Level: slog.LevelDebug}))

	return &migrateTestEnv{
		taskAccess: ta,
		repo:       repo,
		dataDir:    dataDir,
		logger:     logger,
		logBuf:     logBuf,
	}
}

// seedRoutineTaskFile writes a task JSON file directly to the todo directory,
// bypassing TaskAccess.Save so we can stage exactly the legacy on-disk shape
// without triggering a commit per task.
func seedRoutineTaskFile(t *testing.T, dataDir string, task access.Task) {
	t.Helper()
	dir := filepath.Join(dataDir, "tasks", "todo")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("mkdir todo: %v", err)
	}
	if err := utilities.AtomicWriteJSON(filepath.Join(dir, task.ID+".json"), task); err != nil {
		t.Fatalf("seed task: %v", err)
	}
}

func commitCount(t *testing.T, repo utilities.IRepository) int {
	t.Helper()
	hist, err := repo.GetHistory(1000)
	if err != nil {
		t.Fatalf("GetHistory: %v", err)
	}
	return len(hist)
}

func loadTaskFromDisk(t *testing.T, dataDir, taskID string) access.Task {
	t.Helper()
	tasksDir := filepath.Join(dataDir, "tasks")
	entries, err := os.ReadDir(tasksDir)
	if err != nil {
		t.Fatalf("read tasks dir: %v", err)
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		path := filepath.Join(tasksDir, entry.Name(), taskID+".json")
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var task access.Task
		if err := json.Unmarshal(data, &task); err != nil {
			t.Fatalf("unmarshal %s: %v", path, err)
		}
		return task
	}
	t.Fatalf("task %s not found on disk", taskID)
	return access.Task{}
}

func TestMigrateRoutineRefs_BackfillsAllMatchingTasks(t *testing.T) {
	env := setupMigrateTestEnv(t)

	// Three legacy routine-tagged tasks across two routines and two dates,
	// plus one user-added tag mixed in to verify it's preserved.
	tasks := []access.Task{
		{
			ID:          "T1",
			Title:       "Walk the dog",
			Description: "routine:R1:2026-04-30",
			Tags:        []string{"Routine"},
		},
		{
			ID:          "T2",
			Title:       "Walk the dog",
			Description: "routine:R1:2026-05-01",
			Tags:        []string{"Routine", "morning"},
		},
		{
			ID:          "T3",
			Title:       "Meditate",
			Description: "routine:R2:2026-05-01",
			Tags:        []string{"Routine"},
		},
	}
	for _, tk := range tasks {
		seedRoutineTaskFile(t, env.dataDir, tk)
	}

	preCommits := commitCount(t, env.repo)

	if err := migrateRoutineRefs(env.taskAccess, env.repo, env.dataDir, env.logger); err != nil {
		t.Fatalf("migrateRoutineRefs: %v", err)
	}

	postCommits := commitCount(t, env.repo)
	if got, want := postCommits-preCommits, 1; got != want {
		t.Errorf("expected exactly %d new commit, got %d", want, got)
	}

	// All three tasks should now have RoutineRef set, no "Routine" tag,
	// and user tags preserved.
	want := map[string]struct {
		routineID string
		date      string
		tags      []string
	}{
		"T1": {"R1", "2026-04-30", []string{}},
		"T2": {"R1", "2026-05-01", []string{"morning"}},
		"T3": {"R2", "2026-05-01", []string{}},
	}
	for id, exp := range want {
		got := loadTaskFromDisk(t, env.dataDir, id)
		if got.RoutineRef == nil {
			t.Errorf("task %s: RoutineRef nil, expected non-nil", id)
			continue
		}
		if got.RoutineRef.RoutineID != exp.routineID {
			t.Errorf("task %s: RoutineID = %q, want %q", id, got.RoutineRef.RoutineID, exp.routineID)
		}
		if string(got.RoutineRef.Date) != exp.date {
			t.Errorf("task %s: Date = %q, want %q", id, got.RoutineRef.Date, exp.date)
		}
		for _, tag := range got.Tags {
			if tag == "Routine" {
				t.Errorf("task %s: 'Routine' tag still present after migration", id)
			}
		}
		// Compare remaining tags as sets.
		if len(got.Tags) != len(exp.tags) {
			t.Errorf("task %s: tags = %v, want %v", id, got.Tags, exp.tags)
			continue
		}
		for i, tag := range exp.tags {
			if got.Tags[i] != tag {
				t.Errorf("task %s: tag[%d] = %q, want %q", id, i, got.Tags[i], tag)
			}
		}
	}
}

func TestMigrateRoutineRefs_IdempotentSecondRun(t *testing.T) {
	env := setupMigrateTestEnv(t)

	seedRoutineTaskFile(t, env.dataDir, access.Task{
		ID:          "T1",
		Title:       "Walk",
		Description: "routine:R1:2026-05-01",
		Tags:        []string{"Routine"},
	})

	if err := migrateRoutineRefs(env.taskAccess, env.repo, env.dataDir, env.logger); err != nil {
		t.Fatalf("first migrateRoutineRefs: %v", err)
	}
	afterFirst := commitCount(t, env.repo)

	// Second run on a fully-migrated repo must produce no commit.
	if err := migrateRoutineRefs(env.taskAccess, env.repo, env.dataDir, env.logger); err != nil {
		t.Fatalf("second migrateRoutineRefs: %v", err)
	}
	afterSecond := commitCount(t, env.repo)

	if afterSecond != afterFirst {
		t.Errorf("expected idempotent re-run; commit count changed from %d to %d", afterFirst, afterSecond)
	}
}

func TestMigrateRoutineRefs_NoTaggedTasks_NoCommit(t *testing.T) {
	env := setupMigrateTestEnv(t)

	preCommits := commitCount(t, env.repo)
	if err := migrateRoutineRefs(env.taskAccess, env.repo, env.dataDir, env.logger); err != nil {
		t.Fatalf("migrateRoutineRefs: %v", err)
	}
	postCommits := commitCount(t, env.repo)

	if postCommits != preCommits {
		t.Errorf("expected no commit when no Routine-tagged tasks exist; got %d -> %d",
			preCommits, postCommits)
	}
}

func TestMigrateRoutineRefs_MalformedDescription_PreservesTag(t *testing.T) {
	env := setupMigrateTestEnv(t)

	// User-edited description that no longer matches the legacy pattern.
	seedRoutineTaskFile(t, env.dataDir, access.Task{
		ID:          "T1",
		Title:       "Walk",
		Description: "User rewrote this description entirely",
		Tags:        []string{"Routine"},
	})

	preCommits := commitCount(t, env.repo)
	if err := migrateRoutineRefs(env.taskAccess, env.repo, env.dataDir, env.logger); err != nil {
		t.Fatalf("migrateRoutineRefs: %v", err)
	}
	postCommits := commitCount(t, env.repo)

	// No commit because nothing was migrated.
	if postCommits != preCommits {
		t.Errorf("expected no commit on malformed-only set; got %d -> %d", preCommits, postCommits)
	}

	// Tag must be preserved; RoutineRef must remain nil.
	got := loadTaskFromDisk(t, env.dataDir, "T1")
	if got.RoutineRef != nil {
		t.Errorf("RoutineRef = %+v, want nil", got.RoutineRef)
	}
	hasTag := false
	for _, tag := range got.Tags {
		if tag == "Routine" {
			hasTag = true
		}
	}
	if !hasTag {
		t.Errorf("'Routine' tag stripped from malformed task; want preserved")
	}

	// Warning must be logged.
	if !strings.Contains(env.logBuf.String(), "non-matching description") {
		t.Errorf("expected warning log for malformed description; logs:\n%s", env.logBuf.String())
	}
}

func TestMigrateRoutineRefs_AlreadyHasRoutineRef_Skipped(t *testing.T) {
	env := setupMigrateTestEnv(t)

	// A task already migrated by a future-flow source: RoutineRef set,
	// "Routine" tag still present (defensive — could happen if future
	// code sets the ref before the migration runs).
	preExisting := access.Task{
		ID:          "T1",
		Title:       "Walk",
		Description: "routine:R1:2026-05-01",
		Tags:        []string{"Routine"},
		RoutineRef: &access.RoutineRef{
			RoutineID: "R-future",
			Date:      utilities.MustParseCalendarDate("2026-01-01"),
		},
	}
	seedRoutineTaskFile(t, env.dataDir, preExisting)

	preCommits := commitCount(t, env.repo)
	if err := migrateRoutineRefs(env.taskAccess, env.repo, env.dataDir, env.logger); err != nil {
		t.Fatalf("migrateRoutineRefs: %v", err)
	}
	postCommits := commitCount(t, env.repo)

	if postCommits != preCommits {
		t.Errorf("expected no commit when only pre-RoutineRef tasks present; got %d -> %d",
			preCommits, postCommits)
	}

	got := loadTaskFromDisk(t, env.dataDir, "T1")
	if got.RoutineRef == nil || got.RoutineRef.RoutineID != "R-future" {
		t.Errorf("pre-existing RoutineRef overwritten: %+v", got.RoutineRef)
	}
}

func TestRemoveTag_StripsAllOccurrences(t *testing.T) {
	got := removeTag([]string{"a", "Routine", "b", "Routine", "c"}, "Routine")
	want := []string{"a", "b", "c"}
	if len(got) != len(want) {
		t.Fatalf("removeTag: got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("removeTag[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}
