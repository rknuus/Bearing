package access

import "github.com/rkn/bearing/internal/utilities"

// This file declares the new TaskAccess facet interfaces and their
// request/outcome DTOs introduced by the access-atomicity initiative
// (Epic 2: taskaccess-facet-refactor).
//
// The legacy ITaskAccess (33 methods) is being decomposed into three
// cohesive facets where each facet name carries the noun, allowing
// methods to be plain business verbs:
//
//   - ITask  : single-task lifecycle verbs (Find, Create, Save, Move, ...)
//   - IBatch : cross-task atomic verbs (Promote, Commit)
//   - IBoard : board structure verbs (Get, AddColumn, RemoveColumn, ...)
//
// Implementations land in subsequent tasks (94, 95, 96) on the existing
// TaskAccess struct. Until then the legacy ITaskAccess surface is
// preserved unchanged so callers continue to compile.

// ITask is the single-task lifecycle facet of TaskAccess. Each verb is
// atomic: it performs the file/order mutations and the underlying commit
// in a single critical section.
type ITask interface {
	Find(filter TaskFilter) ([]Task, error)
	Create(task Task, zone string) (Task, error)
	Save(task Task) error
	Move(req MoveRequest) (MoveOutcome, error)
	Archive(taskID string) error
	Restore(taskID string) error
	Delete(taskID string) error
	Reorder(positions map[string][]string) (ReorderOutcome, error)
}

// IBatch is the cross-task batch facet of TaskAccess. Each verb applies
// N writes inside a single transaction, re-validating preconditions
// against on-disk state under the access lock.
//
// CommitNoTx is the no-commit variant of Commit: it performs the full
// batch of file/order-map mutations atomically (including rollback on
// per-element failure) but does NOT produce a git commit. Intended for
// use inside utilities.RunTransaction at the manager layer where a
// single terminal commit covers writes spanning multiple Access
// components. The caller is responsible for staging and committing the
// working tree.
type IBatch interface {
	Promote(req PromoteRequest) (PromoteOutcome, error)
	Commit(req BatchRequest) (BatchOutcome, error)
	CommitNoTx(req BatchRequest) (BatchOutcome, error)
	ArchiveDoneTasksByTag(scope string) (int, error)
}

// IBoard is the board-structure facet of TaskAccess. Each verb applies
// the configuration change, the matching filesystem operation, and the
// commit atomically.
//
// AddColumn inserts a new column at the position implied by afterSlug:
//   - afterSlug == ""           : append at the end, but BEFORE the
//                                 trailing done-type bookend column when
//                                 one is present (preserves the "todo
//                                 first, done last" invariant).
//   - afterSlug == "<existing>" : insert immediately after that slug.
//                                 Inserting after a done-type column is
//                                 rejected because it would push the
//                                 bookend out of last position.
//   - afterSlug == "<missing>"  : returns an error and makes no on-disk
//                                 changes.
type IBoard interface {
	Get() (BoardConfiguration, error)
	AddColumn(slug, title, afterSlug string) (BoardConfiguration, error)
	RemoveColumn(slug string) (BoardConfiguration, error)
	RenameColumn(oldSlug, newSlug, newTitle string) (BoardConfiguration, error)
	RetitleColumn(slug, newTitle string) (BoardConfiguration, error)
	ReorderColumns(slugs []string) (BoardConfiguration, error)
}

// RoutineRef identifies a particular occurrence of a routine. The
// RoutineID identifies which routine, and Date pins the specific
// occurrence (a routine can produce many tasks across dates). Used by
// TaskFilter for routine-scoped task queries and by Task to link a
// task back to its originating routine occurrence.
type RoutineRef struct {
	RoutineID string                 `json:"routineId"`
	Date      utilities.CalendarDate `json:"date"`
}

// TaskFilter is the flexible filter passed to ITask.Find. All fields are
// optional; a nil pointer means "do not filter on this dimension".
// Multiple non-nil fields are combined with AND.
type TaskFilter struct {
	ThemeID    *string     `json:"themeId,omitempty"`
	Status     *string     `json:"status,omitempty"`
	Tag        *string     `json:"tag,omitempty"`
	RoutineRef *RoutineRef `json:"routineRef,omitempty"`
}

// MoveRequest is the input to ITask.Move. NewPriority empty means the
// task's existing priority is preserved. Positions, when supplied, are
// the client's view of the target ordering for the affected zones; the
// access verb merges them with on-disk state under the lock.
//
// Task, when non-nil, carries an arbitrary in-place rewrite of the
// task's content (title, description, priority, tags, ...). The access
// verb performs the rewrite, the optional zone migration (status
// change), and the order-map update under one critical section and
// emits a single git commit. When Task is nil the verb falls back to
// the legacy behaviour: it loads the on-disk task and applies only
// NewPriority — used by drag-drop callers that have no field changes.
//
// When Task is non-nil, Task.ID must equal TaskID (the access verb
// asserts this). NewPriority is ignored when Task is non-nil because
// Task.Priority is authoritative.
type MoveRequest struct {
	TaskID      string              `json:"taskId"`
	NewStatus   string              `json:"newStatus"`
	NewPriority string              `json:"newPriority,omitempty"`
	Positions   map[string][]string `json:"positions,omitempty"`
	Task        *Task               `json:"task,omitempty"`
}

// MoveOutcome is the result of ITask.Move. Title is the moved task's
// title (returned for convenience). Positions is the authoritative
// post-write ordering of the zones that the move touched.
type MoveOutcome struct {
	Title     string              `json:"title"`
	Positions map[string][]string `json:"positions"`
}

// ReorderOutcome is the result of ITask.Reorder. Positions is the
// authoritative post-write ordering of the zones the reorder touched.
type ReorderOutcome struct {
	Positions map[string][]string `json:"positions"`
}

// TaskPromotion describes a single priority promotion to be applied as
// part of an IBatch.Promote call. The manager pre-computes these from
// PromotionDate; access re-validates each one against current on-disk
// state inside the lock and skips stale entries.
type TaskPromotion struct {
	TaskID              string `json:"taskId"`
	NewPriority         string `json:"newPriority"`
	ClearPromotionDate  bool   `json:"clearPromotionDate"`
}

// PromoteRequest is the input to IBatch.Promote.
type PromoteRequest struct {
	Promotions []TaskPromotion `json:"promotions"`
}

// PromoteOutcome is the result of IBatch.Promote. Count is the number
// of promotions actually applied; Skipped lists task IDs whose source
// state failed re-validation under the lock.
type PromoteOutcome struct {
	Count   int      `json:"count"`
	Skipped []string `json:"skipped,omitempty"`
}

// TaskCreate describes one task to be created as part of an
// IBatch.Commit call.
type TaskCreate struct {
	Task     Task   `json:"task"`
	DropZone string `json:"dropZone"`
}

// BatchRequest is the input to IBatch.Commit. Creates and Deletes are
// applied atomically in a single transaction; the shape is extensible
// (Updates etc.) without breaking existing callers.
type BatchRequest struct {
	Creates []TaskCreate `json:"creates,omitempty"`
	Deletes []string     `json:"deletes,omitempty"`
}

// BatchOutcome is the result of IBatch.Commit.
type BatchOutcome struct {
	CreatedIDs []string `json:"createdIds,omitempty"`
	DeletedIDs []string `json:"deletedIds,omitempty"`
}
