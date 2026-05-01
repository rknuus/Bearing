package schedule_engine

import "github.com/rkn/bearing/internal/utilities"

// RoutineInput is the engine-layer view of a routine for materialisation
// planning. The engine stays decoupled from the access layer: callers
// translate access.Routine into RoutineInput (and access.ScheduleException
// into Exception) before invoking Plan.
type RoutineInput struct {
	ID            string
	Description   string
	RepeatPattern *RepeatPattern // nil for sporadic routines
	Exceptions    []Exception
	// CompletedDates lists every prior check for this routine across all
	// dates. Used by ComputeOverdue's absorption rule when classifying the
	// priority of a newly-checked occurrence.
	CompletedDates []string
}

// ExistingTaskRef captures the minimum information the engine needs about a
// previously-materialised routine task to decide whether it should be
// deleted in response to a routine being unchecked. The manager pre-fetches
// these via ITask.Find({RoutineRef: …}) and passes them in; the engine does
// not perform I/O.
type ExistingTaskRef struct {
	TaskID    string
	RoutineID string
	Date      utilities.CalendarDate
	Status    string // "todo", "doing", "done", "archived"
}

// RoutineCheckDiff describes the change in routine checks for a single date
// that the manager wants to materialise into tasks atomically.
//
// NewlyChecked and NewlyUnchecked are routine IDs. ExistingTasks supplies
// the candidate-delete pool for NewlyUnchecked routines; only those whose
// status is todo or doing will be added to MaterializationPlan.Deletes
// (done and archived tasks preserve completion history).
type RoutineCheckDiff struct {
	Date           utilities.CalendarDate
	NewlyChecked   []string
	NewlyUnchecked []string
	ExistingTasks  []ExistingTaskRef
}

// TaskSpec is the engine-layer description of a task the manager should
// create. The manager translates this into access.TaskCreate (filling the
// DropZone string from Status+Priority) before submitting to IBatch.Commit.
// Keeping the engine free of zone-formatting concerns matches the existing
// access/engine separation.
type TaskSpec struct {
	RoutineID   string
	Date        utilities.CalendarDate
	Description string
	Priority    string // "important-urgent" or "important-not-urgent"
	Status      string // always "todo" for newly materialised routine tasks
	Tags        []string
}

// MaterializationPlan is the pure-data result of Plan: a deterministic set
// of task creates and deletes the access layer should apply atomically. The
// engine never performs I/O, so Deletes is a slice of task IDs already
// resolved by the manager via the supplied ExistingTasks.
type MaterializationPlan struct {
	Creates []TaskSpec
	Deletes []string
}

// routineTagName is the system tag applied to all materialised routine
// tasks. It serves as a UI marker; the authoritative routine link lives in
// Task.RoutineRef.
const routineTagName = "Routine"

// Plan computes the materialisation plan for a routine-check diff:
//
//   - For each newly-checked routine, emit a TaskSpec. Priority is
//     important-urgent when either ComputeOverdue indicates an outstanding
//     occurrence on or before today, or the diff date is in the past
//     (covers sporadic routines and back-dated checks); otherwise
//     important-not-urgent.
//   - For each newly-unchecked routine, emit a delete for any matching
//     ExistingTaskRef whose status is todo or doing. done/archived tasks
//     are intentionally preserved — they are completion history.
//
// Plan is pure: no I/O, no side effects. All inputs are the diff, the
// routine catalogue, and the today reference date.
func (se *ScheduleEngine) Plan(diff RoutineCheckDiff, routines []RoutineInput, today utilities.CalendarDate) MaterializationPlan {
	var plan MaterializationPlan

	if len(diff.NewlyChecked) > 0 {
		byID := make(map[string]RoutineInput, len(routines))
		for _, r := range routines {
			byID[r.ID] = r
		}

		for _, routineID := range diff.NewlyChecked {
			routine, ok := byID[routineID]
			if !ok {
				// Defensive: routine catalogue out of sync with the diff.
				// Skip rather than fabricate task content.
				continue
			}

			priority := "important-not-urgent"
			if se.isCheckedOccurrenceUrgent(routine, diff.Date, today) {
				priority = "important-urgent"
			}

			plan.Creates = append(plan.Creates, TaskSpec{
				RoutineID:   routine.ID,
				Date:        diff.Date,
				Description: routine.Description,
				Priority:    priority,
				Status:      "todo",
				Tags:        []string{routineTagName},
			})
		}
	}

	if len(diff.NewlyUnchecked) > 0 && len(diff.ExistingTasks) > 0 {
		uncheckedSet := make(map[string]bool, len(diff.NewlyUnchecked))
		for _, id := range diff.NewlyUnchecked {
			uncheckedSet[id] = true
		}

		for _, t := range diff.ExistingTasks {
			if !uncheckedSet[t.RoutineID] {
				continue
			}
			if t.Date != diff.Date {
				continue
			}
			if t.Status != "todo" && t.Status != "doing" {
				continue
			}
			plan.Deletes = append(plan.Deletes, t.TaskID)
		}
	}

	return plan
}

// isCheckedOccurrenceUrgent reports whether a newly-checked routine
// occurrence on diff.Date should be classified as urgent. An occurrence
// is urgent when:
//
//   - it is being checked for a date in the past (the user is back-filling
//     an overdue or sporadic routine), or
//   - the routine has any outstanding overdue occurrence as of today.
func (se *ScheduleEngine) isCheckedOccurrenceUrgent(routine RoutineInput, checkDate, today utilities.CalendarDate) bool {
	// Lexicographic compare on YYYY-MM-DD matches chronological order.
	if checkDate.String() < today.String() {
		return true
	}
	if routine.RepeatPattern == nil {
		return false
	}
	overdue := se.ComputeOverdue(*routine.RepeatPattern, routine.Exceptions, routine.CompletedDates, today.String())
	return len(overdue) > 0
}
