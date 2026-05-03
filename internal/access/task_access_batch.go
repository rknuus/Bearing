package access

import (
	"fmt"
	"os"
	"slices"
)

// =============================================================================
// IBatch facet implementation
// =============================================================================
//
// The two verbs below implement the IBatch facet declared in task_facets.go.
// Each verb takes ta.mu for the entire operation, applies all of its
// per-element mutations under that single critical section, then produces
// exactly ONE git commit covering every touched path.
//
// Promote re-validates each promotion's source state against the on-disk
// task file under the lock so that a concurrent move/edit that happens
// between the manager's pre-scan and the access call cannot turn into a
// silent priority overwrite. The only valid source for a priority
// promotion is "important-not-urgent" (the Eisenhower-quadrant rule);
// any task whose on-disk priority no longer matches is added to
// PromoteOutcome.Skipped and left untouched.
//
// Commit applies N creates and M deletes as a single transaction. Any
// per-element error rolls back the whole batch: we delete every file we
// already created, restore every file we already deleted, and return
// without calling commitFiles. The caller therefore sees either the full
// batch persisted in a single commit or no on-disk change at all.
//
// Lock-ordering invariant: ta.mu is acquired BEFORE the per-repo lock
// inside commitFiles. No path inverts this order.
//
// This file is split out from task_access.go to allow parallel agents
// (task 96 — IBoard verbs) to extend TaskAccess without merge conflicts.
// Methods declared on *TaskAccess in this file belong to the same struct;
// Go permits this freely within a package.

// Promote applies a batch of priority promotions atomically.
//
// Each promotion is re-validated against the on-disk task file: if the
// task's current priority is no longer "important-not-urgent" (the only
// valid source for a promotion), the entry is recorded in
// outcome.Skipped and the file is left unchanged. All applied promotions
// rewrite their task file in place and migrate the task ID across zones
// in task_order.json (remove from old, append to new). One git commit
// covers every touched path.
func (ta *TaskAccess) Promote(req PromoteRequest) (PromoteOutcome, error) {
	ta.mu.Lock()
	defer ta.mu.Unlock()

	outcome := PromoteOutcome{}
	if len(req.Promotions) == 0 {
		return outcome, nil
	}

	orderMap, err := ta.LoadTaskOrder()
	if err != nil {
		return PromoteOutcome{}, fmt.Errorf("TaskAccess.Promote: failed to load task order: %w", err)
	}

	commitPaths := []string{}
	orderChanged := false

	expectedSource := string(PriorityImportantNotUrgent)

	for _, promo := range req.Promotions {
		// Locate the task on disk.
		foundTask, currentStatus, _, err := ta.findTaskInPlan(promo.TaskID)
		if err != nil {
			return PromoteOutcome{}, fmt.Errorf("TaskAccess.Promote: %w", err)
		}
		if foundTask == nil {
			outcome.Skipped = append(outcome.Skipped, promo.TaskID)
			continue
		}

		// Re-validate the source priority under the lock.
		if foundTask.Priority != expectedSource {
			outcome.Skipped = append(outcome.Skipped, promo.TaskID)
			continue
		}

		// Apply the promotion to the task file in place.
		updated := *foundTask
		oldPriority := updated.Priority
		updated.Priority = promo.NewPriority
		if promo.ClearPromotionDate {
			updated.PromotionDate = ""
		}

		filePath := ta.taskFilePath(currentStatus, promo.TaskID)
		if err := writeJSON(filePath, updated); err != nil {
			return PromoteOutcome{}, fmt.Errorf("TaskAccess.Promote: failed to write task %s: %w", promo.TaskID, err)
		}
		commitPaths = append(commitPaths, filePath)

		// Migrate across zones in task_order.json. The zone key is the
		// priority value for tasks that live in the todo column; for
		// tasks in other columns the priority does not influence the
		// zone. We migrate only when the old/new zone keys actually
		// hold this task ID, which is a stable rule independent of
		// column type.
		if oldPriority != promo.NewPriority {
			if migrateTaskAcrossZones(orderMap, promo.TaskID, oldPriority, promo.NewPriority) {
				orderChanged = true
			}
		}

		outcome.Count++
	}

	if orderChanged {
		orderFilePath := ta.taskOrderFilePath()
		if err := writeJSON(orderFilePath, orderMap); err != nil {
			return PromoteOutcome{}, fmt.Errorf("TaskAccess.Promote: failed to write task order: %w", err)
		}
		commitPaths = append(commitPaths, orderFilePath)
	}

	if len(commitPaths) == 0 {
		return outcome, nil
	}

	msg := fmt.Sprintf("Promote %d task(s) by priority date", outcome.Count)
	if err := commitFiles(ta.repo, commitPaths, msg); err != nil {
		return PromoteOutcome{}, fmt.Errorf("TaskAccess.Promote: %w", err)
	}
	return outcome, nil
}

// migrateTaskAcrossZones removes taskID from the oldZone key and appends
// it to the newZone key when oldZone != newZone and the old zone
// actually contains the task. Returns whether any change was made.
//
// The function is conservative: if the oldZone key does not exist or
// does not contain the task, it does nothing — the task may live in a
// zone whose name is its column status rather than its priority, and
// in that case the order map needs no migration on a priority change.
func migrateTaskAcrossZones(orderMap map[string][]string, taskID, oldZone, newZone string) bool {
	if oldZone == newZone || oldZone == "" {
		return false
	}
	ids, ok := orderMap[oldZone]
	if !ok {
		return false
	}
	idx := -1
	for i, id := range ids {
		if id == taskID {
			idx = i
			break
		}
	}
	if idx < 0 {
		return false
	}
	filtered := make([]string, 0, len(ids)-1)
	filtered = append(filtered, ids[:idx]...)
	filtered = append(filtered, ids[idx+1:]...)
	orderMap[oldZone] = filtered
	orderMap[newZone] = append(orderMap[newZone], taskID)
	return true
}

// Commit applies a batch of creates and deletes atomically.
//
// All creates allocate a fresh ID (when Task.ID is empty), write the
// task file under the todo status directory, and append to the
// requested DropZone in task_order.json. All deletes locate the task
// file (in any status directory or in archived/), remove it, and clean
// up its order-map entry (active or archived).
//
// On any per-element failure the whole batch is rolled back: every
// file already created is removed, every file already deleted is
// restored from its in-memory copy, and no git commit is produced. On
// success a single git commit covers every touched path.
func (ta *TaskAccess) Commit(req BatchRequest) (BatchOutcome, error) {
	ta.mu.Lock()
	outcome, commitPaths, msg, rollback, err := ta.commitLocked(req)
	if err != nil {
		ta.mu.Unlock()
		return BatchOutcome{}, err
	}
	if len(commitPaths) == 0 {
		ta.mu.Unlock()
		return outcome, nil
	}

	if err := commitFiles(ta.repo, commitPaths, msg); err != nil {
		rollback()
		ta.mu.Unlock()
		return BatchOutcome{}, fmt.Errorf("TaskAccess.Commit: %w", err)
	}
	ta.mu.Unlock()
	return outcome, nil
}

// CommitNoTx applies a batch of creates and deletes atomically WITHOUT
// producing a git commit. The caller (typically utilities.RunTransaction
// at the manager layer) is responsible for staging the working tree and
// emitting a single terminal commit that covers writes spanning multiple
// Access components.
//
// Lock-ordering note: CommitNoTx still acquires ta.mu to serialise
// against other TaskAccess writers. Callers running inside
// utilities.RunTransaction will already hold the per-repo lock acquired
// by repo.Begin(); ta.mu is taken here in addition. Concurrent
// non-transactional writers acquire ta.mu first and the per-repo lock
// second, so a stale concurrent path could deadlock against an outer
// RunTransaction. This matches the established pattern of
// CalendarAccess.WriteDayFocus and is a known cost of the
// cross-Access-atomic-commit design (audit finding #5).
//
// On any per-element failure the rollback semantics are identical to
// Commit's: every file already created is removed, every file already
// deleted is restored, and the call returns an error with no on-disk
// change retained.
func (ta *TaskAccess) CommitNoTx(req BatchRequest) (BatchOutcome, error) {
	ta.mu.Lock()
	defer ta.mu.Unlock()

	outcome, _, _, rollback, err := ta.commitLocked(req)
	if err != nil {
		return BatchOutcome{}, err
	}

	// Test-only fault injection seam: see SetCommitNoTxFaultHookForTest.
	// The hook fires AFTER the in-memory mutations succeed and BEFORE the
	// caller's RunTransaction commits, mimicking a real per-element
	// failure that survives commitLocked but should still trigger the
	// outer transaction cancel.
	if hook := ta.commitNoTxFaultHook; hook != nil {
		if hookErr := hook(); hookErr != nil {
			if rollback != nil {
				rollback()
			}
			return BatchOutcome{}, fmt.Errorf("TaskAccess.CommitNoTx: %w", hookErr)
		}
	}

	return outcome, nil
}

// commitLocked performs the file/order-map mutations of an IBatch.Commit
// request. Caller must hold ta.mu. Returns the outcome, the list of
// touched absolute paths (for the caller's commit step), the suggested
// commit message, and a rollback closure to undo the mutations on a
// later commitFiles failure. Per-element failures are rolled back
// internally and surfaced as an error (commitPaths/rollback are nil in
// that case).
func (ta *TaskAccess) commitLocked(req BatchRequest) (BatchOutcome, []string, string, func(), error) {
	outcome := BatchOutcome{}
	if len(req.Creates) == 0 && len(req.Deletes) == 0 {
		return outcome, nil, "", nil, nil
	}

	// Track for rollback: paths of files we created (to remove on
	// failure) and snapshots of files we deleted (to restore on
	// failure). We also stage order-map mutations in memory first so
	// the on-disk task_order.json / archived_order.json is not touched
	// until every create/delete succeeded.
	createdPaths := []string{}
	type deletedSnapshot struct {
		path     string
		data     []byte
		archived bool
		taskID   string
	}
	deletedSnapshots := []deletedSnapshot{}

	rollback := func() {
		for _, p := range createdPaths {
			_ = os.Remove(p)
		}
		for _, snap := range deletedSnapshots {
			_ = os.WriteFile(snap.path, snap.data, 0644)
		}
	}

	// Load order maps once.
	orderMap, err := ta.LoadTaskOrder()
	if err != nil {
		return BatchOutcome{}, nil, "", nil, fmt.Errorf("TaskAccess.Commit: failed to load task order: %w", err)
	}
	archivedOrder, err := ta.LoadArchivedOrder()
	if err != nil {
		return BatchOutcome{}, nil, "", nil, fmt.Errorf("TaskAccess.Commit: failed to load archived order: %w", err)
	}
	orderChanged := false
	archivedChanged := false

	// Apply creates.
	for i := range req.Creates {
		create := req.Creates[i]
		taskCopy := create.Task
		taskCopy.ID = "" // force ID allocation under the lock
		paths, _, err := ta.saveTaskFile(&taskCopy)
		if err != nil {
			rollback()
			return BatchOutcome{}, nil, "", nil, fmt.Errorf("TaskAccess.Commit: create failed: %w", err)
		}
		createdPaths = append(createdPaths, paths...)
		orderMap[create.DropZone] = append(orderMap[create.DropZone], taskCopy.ID)
		orderChanged = true
		outcome.CreatedIDs = append(outcome.CreatedIDs, taskCopy.ID)
	}

	// Apply deletes.
	for _, taskID := range req.Deletes {
		foundTask, currentStatus, _, err := ta.findTaskInPlan(taskID)
		if err != nil {
			rollback()
			return BatchOutcome{}, nil, "", nil, fmt.Errorf("TaskAccess.Commit: delete failed for %s: %w", taskID, err)
		}
		if foundTask == nil {
			rollback()
			return BatchOutcome{}, nil, "", nil, fmt.Errorf("TaskAccess.Commit: task with ID %s not found", taskID)
		}
		filePath := ta.taskFilePath(currentStatus, taskID)
		data, err := os.ReadFile(filePath)
		if err != nil {
			rollback()
			return BatchOutcome{}, nil, "", nil, fmt.Errorf("TaskAccess.Commit: failed to read task %s: %w", taskID, err)
		}
		isArchived := currentStatus == string(TaskStatusArchived)
		if err := os.Remove(filePath); err != nil {
			rollback()
			return BatchOutcome{}, nil, "", nil, fmt.Errorf("TaskAccess.Commit: failed to delete task %s: %w", taskID, err)
		}
		deletedSnapshots = append(deletedSnapshots, deletedSnapshot{
			path:     filePath,
			data:     data,
			archived: isArchived,
			taskID:   taskID,
		})

		if isArchived {
			if updated, changed := removeFromArchivedOrder(archivedOrder, taskID); changed {
				archivedOrder = updated
				archivedChanged = true
			}
		} else {
			if removeFromOrderMap(orderMap, taskID) {
				orderChanged = true
			}
		}
		outcome.DeletedIDs = append(outcome.DeletedIDs, taskID)
	}

	// Persist order maps.
	commitPaths := []string{}
	commitPaths = append(commitPaths, createdPaths...)
	for _, snap := range deletedSnapshots {
		commitPaths = append(commitPaths, snap.path)
	}

	if orderChanged {
		orderFilePath := ta.taskOrderFilePath()
		if err := writeJSON(orderFilePath, orderMap); err != nil {
			rollback()
			return BatchOutcome{}, nil, "", nil, fmt.Errorf("TaskAccess.Commit: failed to write task order: %w", err)
		}
		commitPaths = append(commitPaths, orderFilePath)
	}
	if archivedChanged {
		archivedFilePath := ta.archivedOrderFilePath()
		if err := writeJSON(archivedFilePath, archivedOrder); err != nil {
			rollback()
			return BatchOutcome{}, nil, "", nil, fmt.Errorf("TaskAccess.Commit: failed to write archived order: %w", err)
		}
		commitPaths = append(commitPaths, archivedFilePath)
	}

	msg := fmt.Sprintf("Batch: %d create(s), %d delete(s)", len(outcome.CreatedIDs), len(outcome.DeletedIDs))
	return outcome, commitPaths, msg, rollback, nil
}

// ArchiveDoneTasksByTag archives every task currently in the done status
// directory whose tag list satisfies the supplied scope, in a single
// atomic transaction:
//
//   - scope == ScopeAll      : every done task is archived.
//   - scope == ScopeUntagged : only done tasks with an empty tag list
//                              are archived.
//   - otherwise              : done tasks whose Tags slice contains the
//                              scope string (membership match) are
//                              archived. Multi-tag tasks qualify when at
//                              least one tag equals the scope.
//
// Each matched task is moved from tasks/done/<id>.json to
// tasks/archived/<id>.json, removed from every zone in task_order.json,
// and prepended to archived_order.json (most recently archived first,
// matching ITask.Archive). All filesystem mutations happen under ta.mu;
// any per-task failure rolls every preceding move back and surfaces an
// error with no on-disk change retained. On success a SINGLE git commit
// covers every touched path with the message
// "Archive done tasks (scope=<scope>)".
//
// Returns the number of tasks actually archived. Returns (0, nil) when
// the done set is empty or no done task matches the scope; in that case
// no commit is produced.
func (ta *TaskAccess) ArchiveDoneTasksByTag(scope string) (int, error) {
	ta.mu.Lock()
	defer ta.mu.Unlock()

	doneTasks, err := ta.GetTasksByStatus(string(TaskStatusDone))
	if err != nil {
		return 0, fmt.Errorf("TaskAccess.ArchiveDoneTasksByTag: %w", err)
	}

	matched := make([]Task, 0, len(doneTasks))
	for _, t := range doneTasks {
		if scopeMatches(scope, t.Tags) {
			matched = append(matched, t)
		}
	}
	if len(matched) == 0 {
		return 0, nil
	}

	// Track moved files so we can roll back any partial rename if a
	// later step fails. Each entry records both the original done path
	// and the new archived path; rollback renames new -> old.
	type movedFile struct {
		oldPath string
		newPath string
	}
	moved := make([]movedFile, 0, len(matched))

	rollback := func() {
		for i := len(moved) - 1; i >= 0; i-- {
			_ = os.Rename(moved[i].newPath, moved[i].oldPath)
		}
	}

	commitPaths := make([]string, 0, 2*len(matched)+2)

	for _, t := range matched {
		oldPath := ta.taskFilePath(string(TaskStatusDone), t.ID)
		newPath := ta.taskFilePath(string(TaskStatusArchived), t.ID)
		if err := os.Rename(oldPath, newPath); err != nil {
			rollback()
			return 0, fmt.Errorf("TaskAccess.ArchiveDoneTasksByTag: failed to move task %s: %w", t.ID, err)
		}
		moved = append(moved, movedFile{oldPath: oldPath, newPath: newPath})
		commitPaths = append(commitPaths, oldPath, newPath)
	}

	// Mutate the order maps in memory first so a write failure on either
	// file leaves only the in-memory state dirty, which we then discard.
	orderMap, err := ta.LoadTaskOrder()
	if err != nil {
		rollback()
		return 0, fmt.Errorf("TaskAccess.ArchiveDoneTasksByTag: failed to load task order: %w", err)
	}
	orderChanged := false
	for _, t := range matched {
		if removeFromOrderMap(orderMap, t.ID) {
			orderChanged = true
		}
	}

	archived, err := ta.LoadArchivedOrder()
	if err != nil {
		rollback()
		return 0, fmt.Errorf("TaskAccess.ArchiveDoneTasksByTag: failed to load archived order: %w", err)
	}
	// Prepend each matched task ID so the most recently archived task
	// appears first, mirroring ITask.Archive's single-task semantics.
	// Iterate in reverse so the relative order of matched[] is preserved
	// at the head of the resulting slice.
	for i := len(matched) - 1; i >= 0; i-- {
		archived = append([]string{matched[i].ID}, archived...)
	}

	if orderChanged {
		orderFilePath := ta.taskOrderFilePath()
		if err := writeJSON(orderFilePath, orderMap); err != nil {
			rollback()
			return 0, fmt.Errorf("TaskAccess.ArchiveDoneTasksByTag: failed to write task order: %w", err)
		}
		commitPaths = append(commitPaths, orderFilePath)
	}

	archivedFilePath := ta.archivedOrderFilePath()
	if err := writeJSON(archivedFilePath, archived); err != nil {
		rollback()
		return 0, fmt.Errorf("TaskAccess.ArchiveDoneTasksByTag: failed to write archived order: %w", err)
	}
	commitPaths = append(commitPaths, archivedFilePath)

	msg := fmt.Sprintf("Archive done tasks (scope=%s)", scope)
	if err := commitFiles(ta.repo, commitPaths, msg); err != nil {
		rollback()
		return 0, fmt.Errorf("TaskAccess.ArchiveDoneTasksByTag: %w", err)
	}
	return len(matched), nil
}

// scopeMatches reports whether a task with the supplied tag list
// qualifies under the given scope literal. See ArchiveDoneTasksByTag for
// the matching semantics.
func scopeMatches(scope string, tags []string) bool {
	switch scope {
	case ScopeAll:
		return true
	case ScopeUntagged:
		return len(tags) == 0
	default:
		return slices.Contains(tags, scope)
	}
}
