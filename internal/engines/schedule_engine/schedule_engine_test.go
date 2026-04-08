package schedule_engine

import (
	"reflect"
	"testing"
)

func TestUnit_DailyEveryDay(t *testing.T) {
	se := NewScheduleEngine()
	result := se.ComputeOccurrences(RepeatPattern{
		Frequency: "daily",
		Interval:  1,
		StartDate: "2025-01-01",
	}, nil, "2025-01-01", "2025-01-05")

	want := []string{"2025-01-01", "2025-01-02", "2025-01-03", "2025-01-04", "2025-01-05"}
	if !reflect.DeepEqual(result, want) {
		t.Errorf("got %v, want %v", result, want)
	}
}

func TestUnit_DailyEvery3Days(t *testing.T) {
	se := NewScheduleEngine()
	result := se.ComputeOccurrences(RepeatPattern{
		Frequency: "daily",
		Interval:  3,
		StartDate: "2025-01-01",
	}, nil, "2025-01-01", "2025-01-10")

	want := []string{"2025-01-01", "2025-01-04", "2025-01-07", "2025-01-10"}
	if !reflect.DeepEqual(result, want) {
		t.Errorf("got %v, want %v", result, want)
	}
}

func TestUnit_WeeklyMonWedFri(t *testing.T) {
	se := NewScheduleEngine()
	// 2025-01-06 is a Monday
	result := se.ComputeOccurrences(RepeatPattern{
		Frequency: "weekly",
		Interval:  1,
		Weekdays:  []int{1, 3, 5}, // Mon, Wed, Fri
		StartDate: "2025-01-06",
	}, nil, "2025-01-06", "2025-01-12")

	want := []string{"2025-01-06", "2025-01-08", "2025-01-10"}
	if !reflect.DeepEqual(result, want) {
		t.Errorf("got %v, want %v", result, want)
	}
}

func TestUnit_WeeklyEvery2Weeks(t *testing.T) {
	se := NewScheduleEngine()
	// 2025-01-06 is a Monday
	result := se.ComputeOccurrences(RepeatPattern{
		Frequency: "weekly",
		Interval:  2,
		Weekdays:  []int{1}, // Monday only
		StartDate: "2025-01-06",
	}, nil, "2025-01-06", "2025-02-03")

	// Week of Jan 6, skip week of Jan 13, week of Jan 20, skip Jan 27, week of Feb 3
	want := []string{"2025-01-06", "2025-01-20", "2025-02-03"}
	if !reflect.DeepEqual(result, want) {
		t.Errorf("got %v, want %v", result, want)
	}
}

func TestUnit_MonthlyOn15th(t *testing.T) {
	se := NewScheduleEngine()
	result := se.ComputeOccurrences(RepeatPattern{
		Frequency:  "monthly",
		Interval:   1,
		DayOfMonth: 15,
		StartDate:  "2025-01-15",
	}, nil, "2025-01-01", "2025-04-30")

	want := []string{"2025-01-15", "2025-02-15", "2025-03-15", "2025-04-15"}
	if !reflect.DeepEqual(result, want) {
		t.Errorf("got %v, want %v", result, want)
	}
}

func TestUnit_MonthlyOn31stClamps(t *testing.T) {
	se := NewScheduleEngine()
	result := se.ComputeOccurrences(RepeatPattern{
		Frequency:  "monthly",
		Interval:   1,
		DayOfMonth: 31,
		StartDate:  "2025-01-31",
	}, nil, "2025-01-01", "2025-05-31")

	// Jan 31, Feb 28 (2025 not leap), Mar 31, Apr 30, May 31
	want := []string{"2025-01-31", "2025-02-28", "2025-03-31", "2025-04-30", "2025-05-31"}
	if !reflect.DeepEqual(result, want) {
		t.Errorf("got %v, want %v", result, want)
	}
}

func TestUnit_YearlyMarch15(t *testing.T) {
	se := NewScheduleEngine()
	result := se.ComputeOccurrences(RepeatPattern{
		Frequency: "yearly",
		Interval:  1,
		StartDate: "2023-03-15",
	}, nil, "2023-01-01", "2026-12-31")

	want := []string{"2023-03-15", "2024-03-15", "2025-03-15", "2026-03-15"}
	if !reflect.DeepEqual(result, want) {
		t.Errorf("got %v, want %v", result, want)
	}
}

func TestUnit_YearlyFeb29HandlesNonLeapYears(t *testing.T) {
	se := NewScheduleEngine()
	result := se.ComputeOccurrences(RepeatPattern{
		Frequency: "yearly",
		Interval:  1,
		StartDate: "2024-02-29",
	}, nil, "2024-01-01", "2028-12-31")

	// 2024 leap -> Feb 29, 2025 non-leap -> Feb 28, 2026 -> Feb 28, 2027 -> Feb 28, 2028 leap -> Feb 29
	want := []string{"2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"}
	if !reflect.DeepEqual(result, want) {
		t.Errorf("got %v, want %v", result, want)
	}
}

func TestUnit_ExceptionSuppressAndReplace(t *testing.T) {
	se := NewScheduleEngine()
	result := se.ComputeOccurrences(RepeatPattern{
		Frequency: "daily",
		Interval:  1,
		StartDate: "2025-01-01",
	}, []Exception{
		{OriginalDate: "2025-01-03", NewDate: "2025-01-06"},
	}, "2025-01-01", "2025-01-07")

	// 1,2,4,5,6(replacement),6(regular),7
	want := []string{"2025-01-01", "2025-01-02", "2025-01-04", "2025-01-05", "2025-01-06", "2025-01-06", "2025-01-07"}
	if !reflect.DeepEqual(result, want) {
		t.Errorf("got %v, want %v", result, want)
	}
}

func TestUnit_ExceptionReplacementOutsideRange(t *testing.T) {
	se := NewScheduleEngine()
	result := se.ComputeOccurrences(RepeatPattern{
		Frequency: "daily",
		Interval:  1,
		StartDate: "2025-01-01",
	}, []Exception{
		{OriginalDate: "2025-01-03", NewDate: "2025-01-10"},
	}, "2025-01-01", "2025-01-05")

	// 1,2,4,5 (3 suppressed, replacement 10 outside range)
	want := []string{"2025-01-01", "2025-01-02", "2025-01-04", "2025-01-05"}
	if !reflect.DeepEqual(result, want) {
		t.Errorf("got %v, want %v", result, want)
	}
}

func TestUnit_StartDateAfterRangeStart(t *testing.T) {
	se := NewScheduleEngine()
	result := se.ComputeOccurrences(RepeatPattern{
		Frequency: "daily",
		Interval:  1,
		StartDate: "2025-01-05",
	}, nil, "2025-01-01", "2025-01-07")

	// Only generates from StartDate, so 5,6,7
	want := []string{"2025-01-05", "2025-01-06", "2025-01-07"}
	if !reflect.DeepEqual(result, want) {
		t.Errorf("got %v, want %v", result, want)
	}
}

func TestUnit_StartDateAfterRangeEnd(t *testing.T) {
	se := NewScheduleEngine()
	result := se.ComputeOccurrences(RepeatPattern{
		Frequency: "daily",
		Interval:  1,
		StartDate: "2025-02-01",
	}, nil, "2025-01-01", "2025-01-31")

	if len(result) != 0 {
		t.Errorf("expected empty result, got %v", result)
	}
}

func TestUnit_ComputeOverdueMixedCompletedAndMissed(t *testing.T) {
	se := NewScheduleEngine()
	result := se.ComputeOverdue(RepeatPattern{
		Frequency: "daily",
		Interval:  1,
		StartDate: "2025-01-01",
	}, nil, []string{"2025-01-01", "2025-01-03"}, "2025-01-05")

	// Occurrences before Jan 5: 1,2,3,4. Completed: 1,3. Overdue: 2,4.
	want := []string{"2025-01-02", "2025-01-04"}
	if !reflect.DeepEqual(result, want) {
		t.Errorf("got %v, want %v", result, want)
	}
}

func TestUnit_ComputeOverdueAllCompleted(t *testing.T) {
	se := NewScheduleEngine()
	result := se.ComputeOverdue(RepeatPattern{
		Frequency: "daily",
		Interval:  1,
		StartDate: "2025-01-01",
	}, nil, []string{"2025-01-01", "2025-01-02", "2025-01-03"}, "2025-01-04")

	if len(result) != 0 {
		t.Errorf("expected empty result, got %v", result)
	}
}

func TestUnit_ComputeOverdueNoneCompleted(t *testing.T) {
	se := NewScheduleEngine()
	result := se.ComputeOverdue(RepeatPattern{
		Frequency: "daily",
		Interval:  1,
		StartDate: "2025-01-01",
	}, nil, nil, "2025-01-04")

	want := []string{"2025-01-01", "2025-01-02", "2025-01-03"}
	if !reflect.DeepEqual(result, want) {
		t.Errorf("got %v, want %v", result, want)
	}
}

func TestUnit_EvaluatePeriodCompletionWeeklyPattern(t *testing.T) {
	se := NewScheduleEngine()
	// 2025-01-08 is a Wednesday. Week is Mon Jan 6 - Sun Jan 12.
	// Weekly Mon/Wed/Fri pattern from Jan 6.
	// Full week: Mon Jan 6, Wed Jan 8, Fri Jan 10 = 3 expected.
	// Up to Wed Jan 8: Mon Jan 6, Wed Jan 8 = 2 expected so far.
	// Completed: Jan 6 => 1 completed so far out of 2 expected => not on track.
	result := se.EvaluatePeriodCompletion(RepeatPattern{
		Frequency: "weekly",
		Interval:  1,
		Weekdays:  []int{1, 3, 5},
		StartDate: "2025-01-06",
	}, nil, []string{"2025-01-06"}, "2025-01-08")

	if result.Period != "week" {
		t.Errorf("Period = %q, want \"week\"", result.Period)
	}
	if result.Expected != 3 {
		t.Errorf("Expected = %d, want 3", result.Expected)
	}
	if result.Completed != 1 {
		t.Errorf("Completed = %d, want 1", result.Completed)
	}
	if result.OnTrack {
		t.Error("OnTrack = true, want false (1 completed of 2 expected so far)")
	}
}

func TestUnit_EvaluatePeriodCompletionMonthlyOnTrack(t *testing.T) {
	se := NewScheduleEngine()
	// Monthly on the 15th, asOf = 2025-01-20.
	// Period: Jan 1 - Jan 31. Occurrences in period: Jan 15 = 1.
	// Up to Jan 20: Jan 15 = 1 expected so far.
	// Completed: Jan 15 => on track.
	result := se.EvaluatePeriodCompletion(RepeatPattern{
		Frequency:  "monthly",
		Interval:   1,
		DayOfMonth: 15,
		StartDate:  "2025-01-15",
	}, nil, []string{"2025-01-15"}, "2025-01-20")

	if result.Period != "month" {
		t.Errorf("Period = %q, want \"month\"", result.Period)
	}
	if result.Expected != 1 {
		t.Errorf("Expected = %d, want 1", result.Expected)
	}
	if result.Completed != 1 {
		t.Errorf("Completed = %d, want 1", result.Completed)
	}
	if !result.OnTrack {
		t.Error("OnTrack = false, want true")
	}
}

func TestUnit_EvaluatePeriodCompletionBehindSchedule(t *testing.T) {
	se := NewScheduleEngine()
	// Daily, asOf = 2025-01-05. Period for daily = just Jan 5.
	// Occurrences: Jan 5 = 1. Completed: none => behind.
	result := se.EvaluatePeriodCompletion(RepeatPattern{
		Frequency: "daily",
		Interval:  1,
		StartDate: "2025-01-01",
	}, nil, nil, "2025-01-05")

	if result.Period != "day" {
		t.Errorf("Period = %q, want \"day\"", result.Period)
	}
	if result.Expected != 1 {
		t.Errorf("Expected = %d, want 1", result.Expected)
	}
	if result.Completed != 0 {
		t.Errorf("Completed = %d, want 0", result.Completed)
	}
	if result.OnTrack {
		t.Error("OnTrack = true, want false")
	}
}

func TestUnit_WeeklyEmptyWeekdaysReturnsEmpty(t *testing.T) {
	se := NewScheduleEngine()
	result := se.ComputeOccurrences(RepeatPattern{
		Frequency: "weekly",
		Interval:  1,
		Weekdays:  nil,
		StartDate: "2025-01-06",
	}, nil, "2025-01-06", "2025-01-12")

	if len(result) != 0 {
		t.Errorf("expected empty result for empty weekdays, got %v", result)
	}
}

func TestUnit_IntervalZeroTreatedAsOne(t *testing.T) {
	se := NewScheduleEngine()
	result := se.ComputeOccurrences(RepeatPattern{
		Frequency: "daily",
		Interval:  0,
		StartDate: "2025-01-01",
	}, nil, "2025-01-01", "2025-01-03")

	want := []string{"2025-01-01", "2025-01-02", "2025-01-03"}
	if !reflect.DeepEqual(result, want) {
		t.Errorf("got %v, want %v", result, want)
	}
}
