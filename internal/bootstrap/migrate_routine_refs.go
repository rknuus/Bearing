package bootstrap

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/rkn/bearing/internal/access"
	"github.com/rkn/bearing/internal/utilities"
)

// routineDescPattern matches the legacy routine-task description convention:
// "routine:<routineID>:<YYYY-MM-DD>". This is how routine-materialised tasks
// linked back to their originating routine occurrence before the typed
// Task.RoutineRef field existed.
var routineDescPattern = regexp.MustCompile(`^routine:([^:]+):(\d{4}-\d{2}-\d{2})$`)

// routineMigrationTag is the legacy "Routine" tag dropped from migrated
// tasks. The typed RoutineRef field now carries the linkage; the tag was
// only ever a discoverability hack.
const routineMigrationTag = "Routine"

// migrateRoutineRefs is a one-time migration that backfills the typed
// Task.RoutineRef field on tasks that were materialised under the legacy
// convention of stuffing "routine:<id>:<date>" into Description and tagging
// "Routine".
//
// All migrated writes are bundled into a single git commit titled
// "Migrate Routine tag to typed routineRef" via utilities.RunTransaction.
// The migration is idempotent: re-running on a fully-migrated repo finds
// no tagged-but-unparsed tasks and produces no commit. Tasks tagged
// "Routine" with non-matching descriptions (user-edited) are preserved
// as-is and a warning is logged.
//
// The helper does NOT route writes through TaskAccess.Save because that
// verb produces one commit per call (and would also re-acquire the
// per-repo lock that RunTransaction already holds, causing a deadlock).
// Writing the on-disk task files directly via utilities.AtomicWriteJSON
// inside the transaction is the simplest path to a single migration
// commit. The on-disk schema (one JSON file per task under
// <dataPath>/tasks/<status>/<id>.json) is stable; the migration only
// updates the file contents, never the path.
//
// The helper is invoked from bootstrap.Initialize after access components
// are wired and before any manager construction, so managers never see a
// half-migrated state.
func migrateRoutineRefs(taskAccess access.ITask, repo utilities.IRepository, dataPath string, logger *slog.Logger) error {
	routineTag := routineMigrationTag
	tasks, err := taskAccess.Find(access.TaskFilter{Tag: &routineTag})
	if err != nil {
		return fmt.Errorf("migrateRoutineRefs: find tagged tasks: %w", err)
	}

	// Pre-compute the migration plan so we can short-circuit (no commit)
	// when nothing needs to change. Each entry pairs the updated task with
	// the on-disk file path the writer will overwrite.
	type plan struct {
		task     access.Task
		filePath string
	}
	var plans []plan
	for _, task := range tasks {
		if task.RoutineRef != nil {
			// Already migrated by a future-flow source; skip.
			continue
		}
		m := routineDescPattern.FindStringSubmatch(task.Description)
		if m == nil {
			logger.Warn("routine-tagged task with non-matching description; preserving",
				"taskID", task.ID, "description", task.Description)
			continue
		}
		date, parseErr := utilities.ParseCalendarDate(m[2])
		if parseErr != nil {
			logger.Warn("routine-tagged task with unparseable date; preserving",
				"taskID", task.ID, "description", task.Description, "error", parseErr)
			continue
		}

		filePath, locateErr := locateTaskFile(dataPath, task.ID)
		if locateErr != nil {
			return fmt.Errorf("migrateRoutineRefs: locate task %s: %w", task.ID, locateErr)
		}

		updated := task
		updated.RoutineRef = &access.RoutineRef{RoutineID: m[1], Date: date}
		updated.Tags = removeTag(updated.Tags, routineMigrationTag)
		updated.UpdatedAt = utilities.Now()

		plans = append(plans, plan{task: updated, filePath: filePath})
	}

	if len(plans) == 0 {
		// Idempotent no-op: fully migrated already, or no Routine-tagged
		// tasks ever existed. Produce no commit.
		return nil
	}

	if err := utilities.RunTransaction(repo, "Migrate Routine tag to typed routineRef", func() error {
		for _, p := range plans {
			if writeErr := utilities.AtomicWriteJSON(p.filePath, p.task); writeErr != nil {
				return fmt.Errorf("write task %s: %w", p.task.ID, writeErr)
			}
		}
		return nil
	}); err != nil {
		return fmt.Errorf("migrateRoutineRefs: %w", err)
	}

	logger.Info("Routine→RoutineRef migration applied",
		"migratedCount", len(plans))
	return nil
}

// removeTag returns a copy of tags with every occurrence of target stripped.
// User-added tags are preserved.
func removeTag(tags []string, target string) []string {
	out := make([]string, 0, len(tags))
	for _, t := range tags {
		if t != target {
			out = append(out, t)
		}
	}
	return out
}

// locateTaskFile scans <dataPath>/tasks/* for a file named <taskID>.json and
// returns its absolute path. The migration cannot derive status from the
// Task DTO alone (Task has no Status field), so we discover the file by
// scanning each status subdirectory. The on-disk filename is always
// "<taskID>.json".
func locateTaskFile(dataPath, taskID string) (string, error) {
	tasksDir := filepath.Join(dataPath, "tasks")
	entries, err := os.ReadDir(tasksDir)
	if err != nil {
		return "", fmt.Errorf("read tasks dir: %w", err)
	}
	target := taskID + ".json"
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		// Defensive: skip dotfiles (e.g. .gitkeep) accidentally surfacing as dirs.
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		candidate := filepath.Join(tasksDir, entry.Name(), target)
		if _, statErr := os.Stat(candidate); statErr == nil {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("task file %s not found under %s", target, tasksDir)
}
