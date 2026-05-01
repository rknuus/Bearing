package schedule_engine

import (
	"reflect"
	"testing"

	"github.com/rkn/bearing/internal/utilities"
)

func TestUnit_PlanEmptyDiffYieldsEmptyPlan(t *testing.T) {
	se := NewScheduleEngine()
	plan := se.Plan(RoutineCheckDiff{
		Date: utilities.MustParseCalendarDate("2026-05-01"),
	}, nil, utilities.MustParseCalendarDate("2026-05-01"))

	if len(plan.Creates) != 0 {
		t.Errorf("Creates = %v, want empty", plan.Creates)
	}
	if len(plan.Deletes) != 0 {
		t.Errorf("Deletes = %v, want empty", plan.Deletes)
	}
}

func TestUnit_PlanScheduledRoutineOnDateNotOverdue(t *testing.T) {
	se := NewScheduleEngine()
	today := utilities.MustParseCalendarDate("2026-05-01")
	routine := RoutineInput{
		ID:          "R1",
		Description: "Stretch",
		RepeatPattern: &RepeatPattern{
			Frequency: "daily",
			Interval:  1,
			StartDate: utilities.MustParseCalendarDate("2026-05-01"),
		},
		// CompletedDates empty: there are no PRIOR overdue occurrences
		// because the routine starts today.
	}

	plan := se.Plan(RoutineCheckDiff{
		Date:         today,
		NewlyChecked: []string{"R1"},
	}, []RoutineInput{routine}, today)

	if len(plan.Creates) != 1 {
		t.Fatalf("Creates len = %d, want 1", len(plan.Creates))
	}
	got := plan.Creates[0]
	want := TaskSpec{
		RoutineID:   "R1",
		Date:        today,
		Description: "Stretch",
		Priority:    "important-not-urgent",
		Status:      "todo",
		Tags:        []string{"Routine"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Creates[0] = %#v, want %#v", got, want)
	}
	if len(plan.Deletes) != 0 {
		t.Errorf("Deletes = %v, want empty", plan.Deletes)
	}
}

func TestUnit_PlanOverdueRoutineYieldsUrgentPriority(t *testing.T) {
	se := NewScheduleEngine()
	today := utilities.MustParseCalendarDate("2026-05-05")
	routine := RoutineInput{
		ID:          "R1",
		Description: "Daily journal",
		RepeatPattern: &RepeatPattern{
			Frequency: "daily",
			Interval:  1,
			StartDate: utilities.MustParseCalendarDate("2026-05-01"),
		},
		// No completed dates yet — Jan-style: occurrences May 1..4 are
		// all overdue as of May 5, so checking May 5 should be urgent.
	}

	plan := se.Plan(RoutineCheckDiff{
		Date:         today,
		NewlyChecked: []string{"R1"},
	}, []RoutineInput{routine}, today)

	if len(plan.Creates) != 1 {
		t.Fatalf("Creates len = %d, want 1", len(plan.Creates))
	}
	if plan.Creates[0].Priority != "important-urgent" {
		t.Errorf("Priority = %q, want %q", plan.Creates[0].Priority, "important-urgent")
	}
}

func TestUnit_PlanBackdatedCheckIsUrgent(t *testing.T) {
	se := NewScheduleEngine()
	today := utilities.MustParseCalendarDate("2026-05-05")
	routine := RoutineInput{
		ID:          "R1",
		Description: "Stretch",
		RepeatPattern: &RepeatPattern{
			Frequency: "daily",
			Interval:  1,
			StartDate: utilities.MustParseCalendarDate("2026-05-01"),
		},
		// All earlier occurrences completed except the back-dated one.
		CompletedDates: []string{"2026-05-04"},
	}

	// Back-fill May 3 (a past date). Even though the absorption rule means
	// May 4's check covers May 3 in ComputeOverdue (so the routine has no
	// outstanding occurrences as of today), the diff date is in the past —
	// treat the check as urgent because it represents catching up.
	plan := se.Plan(RoutineCheckDiff{
		Date:         utilities.MustParseCalendarDate("2026-05-03"),
		NewlyChecked: []string{"R1"},
	}, []RoutineInput{routine}, today)

	if len(plan.Creates) != 1 {
		t.Fatalf("Creates len = %d, want 1", len(plan.Creates))
	}
	if plan.Creates[0].Priority != "important-urgent" {
		t.Errorf("Priority = %q, want %q", plan.Creates[0].Priority, "important-urgent")
	}
}

func TestUnit_PlanSporadicRoutineOnTodayIsNotUrgent(t *testing.T) {
	se := NewScheduleEngine()
	today := utilities.MustParseCalendarDate("2026-05-01")
	routine := RoutineInput{
		ID:            "R2",
		Description:   "Read paper",
		RepeatPattern: nil, // sporadic
	}

	plan := se.Plan(RoutineCheckDiff{
		Date:         today,
		NewlyChecked: []string{"R2"},
	}, []RoutineInput{routine}, today)

	if len(plan.Creates) != 1 {
		t.Fatalf("Creates len = %d, want 1", len(plan.Creates))
	}
	if plan.Creates[0].Priority != "important-not-urgent" {
		t.Errorf("Priority = %q, want %q", plan.Creates[0].Priority, "important-not-urgent")
	}
}

func TestUnit_PlanSporadicRoutineBackdatedIsUrgent(t *testing.T) {
	se := NewScheduleEngine()
	today := utilities.MustParseCalendarDate("2026-05-05")
	routine := RoutineInput{
		ID:            "R2",
		Description:   "Read paper",
		RepeatPattern: nil,
	}

	plan := se.Plan(RoutineCheckDiff{
		Date:         utilities.MustParseCalendarDate("2026-05-02"),
		NewlyChecked: []string{"R2"},
	}, []RoutineInput{routine}, today)

	if len(plan.Creates) != 1 {
		t.Fatalf("Creates len = %d, want 1", len(plan.Creates))
	}
	if plan.Creates[0].Priority != "important-urgent" {
		t.Errorf("Priority = %q, want %q", plan.Creates[0].Priority, "important-urgent")
	}
}

func TestUnit_PlanUnknownRoutineIsSkipped(t *testing.T) {
	se := NewScheduleEngine()
	today := utilities.MustParseCalendarDate("2026-05-01")

	plan := se.Plan(RoutineCheckDiff{
		Date:         today,
		NewlyChecked: []string{"R-missing"},
	}, nil, today)

	if len(plan.Creates) != 0 {
		t.Errorf("Creates = %v, want empty (unknown routine skipped)", plan.Creates)
	}
}

func TestUnit_PlanUncheckTodoTaskQueuesDeletion(t *testing.T) {
	se := NewScheduleEngine()
	today := utilities.MustParseCalendarDate("2026-05-01")

	plan := se.Plan(RoutineCheckDiff{
		Date:           today,
		NewlyUnchecked: []string{"R1"},
		ExistingTasks: []ExistingTaskRef{
			{TaskID: "T-1", RoutineID: "R1", Date: today, Status: "todo"},
		},
	}, nil, today)

	if !reflect.DeepEqual(plan.Deletes, []string{"T-1"}) {
		t.Errorf("Deletes = %v, want [T-1]", plan.Deletes)
	}
	if len(plan.Creates) != 0 {
		t.Errorf("Creates = %v, want empty", plan.Creates)
	}
}

func TestUnit_PlanUncheckDoingTaskQueuesDeletion(t *testing.T) {
	se := NewScheduleEngine()
	today := utilities.MustParseCalendarDate("2026-05-01")

	plan := se.Plan(RoutineCheckDiff{
		Date:           today,
		NewlyUnchecked: []string{"R1"},
		ExistingTasks: []ExistingTaskRef{
			{TaskID: "T-1", RoutineID: "R1", Date: today, Status: "doing"},
		},
	}, nil, today)

	if !reflect.DeepEqual(plan.Deletes, []string{"T-1"}) {
		t.Errorf("Deletes = %v, want [T-1]", plan.Deletes)
	}
}

func TestUnit_PlanUncheckDoneTaskPreservesHistory(t *testing.T) {
	se := NewScheduleEngine()
	today := utilities.MustParseCalendarDate("2026-05-01")

	plan := se.Plan(RoutineCheckDiff{
		Date:           today,
		NewlyUnchecked: []string{"R1"},
		ExistingTasks: []ExistingTaskRef{
			{TaskID: "T-1", RoutineID: "R1", Date: today, Status: "done"},
		},
	}, nil, today)

	if len(plan.Deletes) != 0 {
		t.Errorf("Deletes = %v, want empty (done task preserves history)", plan.Deletes)
	}
}

func TestUnit_PlanUncheckArchivedTaskPreservesHistory(t *testing.T) {
	se := NewScheduleEngine()
	today := utilities.MustParseCalendarDate("2026-05-01")

	plan := se.Plan(RoutineCheckDiff{
		Date:           today,
		NewlyUnchecked: []string{"R1"},
		ExistingTasks: []ExistingTaskRef{
			{TaskID: "T-1", RoutineID: "R1", Date: today, Status: "archived"},
		},
	}, nil, today)

	if len(plan.Deletes) != 0 {
		t.Errorf("Deletes = %v, want empty (archived task preserves history)", plan.Deletes)
	}
}

func TestUnit_PlanUncheckIgnoresOtherDates(t *testing.T) {
	se := NewScheduleEngine()
	today := utilities.MustParseCalendarDate("2026-05-01")

	// Existing todo task is for the SAME routine but a DIFFERENT date.
	// The diff only unchecks the routine for today, so the other date's
	// task must not be deleted.
	plan := se.Plan(RoutineCheckDiff{
		Date:           today,
		NewlyUnchecked: []string{"R1"},
		ExistingTasks: []ExistingTaskRef{
			{TaskID: "T-other", RoutineID: "R1", Date: utilities.MustParseCalendarDate("2026-04-30"), Status: "todo"},
		},
	}, nil, today)

	if len(plan.Deletes) != 0 {
		t.Errorf("Deletes = %v, want empty (other-date task untouched)", plan.Deletes)
	}
}

func TestUnit_PlanMixedCheckedAndUnchecked(t *testing.T) {
	se := NewScheduleEngine()
	today := utilities.MustParseCalendarDate("2026-05-01")

	routines := []RoutineInput{
		{
			ID:          "R1",
			Description: "Stretch",
			RepeatPattern: &RepeatPattern{
				Frequency: "daily",
				Interval:  1,
				StartDate: utilities.MustParseCalendarDate("2026-05-01"),
			},
		},
	}

	plan := se.Plan(RoutineCheckDiff{
		Date:           today,
		NewlyChecked:   []string{"R1"},
		NewlyUnchecked: []string{"R2"},
		ExistingTasks: []ExistingTaskRef{
			{TaskID: "T-2", RoutineID: "R2", Date: today, Status: "todo"},
		},
	}, routines, today)

	if len(plan.Creates) != 1 {
		t.Fatalf("Creates len = %d, want 1", len(plan.Creates))
	}
	if plan.Creates[0].RoutineID != "R1" {
		t.Errorf("Creates[0].RoutineID = %q, want R1", plan.Creates[0].RoutineID)
	}
	if !reflect.DeepEqual(plan.Deletes, []string{"T-2"}) {
		t.Errorf("Deletes = %v, want [T-2]", plan.Deletes)
	}
}
