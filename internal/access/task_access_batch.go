package access

import (
	"fmt"
	"os"
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

	outcome, _, _, _, err := ta.commitLocked(req)
	if err != nil {
		return BatchOutcome{}, err
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
