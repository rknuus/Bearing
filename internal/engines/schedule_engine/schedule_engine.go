package schedule_engine

import (
	"sort"
	"time"

	"github.com/rkn/bearing/internal/utilities"
)

// IScheduleEngine computes routine occurrences from repeat patterns.
type IScheduleEngine interface {
	ComputeOccurrences(pattern RepeatPattern, exceptions []Exception, start, end string) []string
	ComputeOverdue(pattern RepeatPattern, exceptions []Exception, completedDates []string, asOf string) []string
	EvaluatePeriodCompletion(pattern RepeatPattern, exceptions []Exception, completedDates []string, asOf string) PeriodCompletion
}

// ScheduleEngine is a stateless implementation of IScheduleEngine.
type ScheduleEngine struct{}

// NewScheduleEngine creates a new ScheduleEngine.
func NewScheduleEngine() *ScheduleEngine {
	return &ScheduleEngine{}
}

// parseDate parses a "YYYY-MM-DD" string using the CalendarDate type.
func parseDate(s string) (time.Time, error) {
	d, err := utilities.ParseCalendarDate(s)
	if err != nil {
		return time.Time{}, err
	}
	return d.Time(), nil
}

// formatDate formats a time.Time as "YYYY-MM-DD" using the CalendarDate type.
func formatDate(t time.Time) string {
	return utilities.NewCalendarDate(t).String()
}

// effectiveInterval returns interval clamped to at least 1.
func effectiveInterval(interval int) int {
	if interval <= 0 {
		return 1
	}
	return interval
}

// clampDay returns the given day clamped to the number of days in the
// specified year/month. For example, day 31 in April becomes 30.
func clampDay(year int, month time.Month, day int) int {
	lastDay := time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
	if day > lastDay {
		return lastDay
	}
	return day
}

// generateDaily produces dates at every interval days starting from anchor,
// filtered to [start, end].
func generateDaily(anchor, start, end time.Time, interval int) []time.Time {
	var dates []time.Time
	for d := anchor; !d.After(end); d = d.AddDate(0, 0, interval) {
		if !d.Before(start) {
			dates = append(dates, d)
		}
	}
	return dates
}

// generateWeekly produces dates matching weekdays in every interval-th week
// from the anchor week, filtered to [start, end].
func generateWeekly(anchor, start, end time.Time, interval int, weekdays []int) []time.Time {
	if len(weekdays) == 0 {
		return nil
	}

	// Align to the Monday of the anchor's week.
	anchorWeekday := int(anchor.Weekday())
	if anchorWeekday == 0 {
		anchorWeekday = 7 // Sunday = 7 for ISO week alignment
	}
	weekStart := anchor.AddDate(0, 0, -(anchorWeekday - 1)) // Monday

	sorted := make([]int, len(weekdays))
	copy(sorted, weekdays)
	sort.Ints(sorted)

	var dates []time.Time
	for ws := weekStart; !ws.After(end); ws = ws.AddDate(0, 0, 7*interval) {
		for _, wd := range sorted {
			// wd uses time.Weekday: 0=Sun, 1=Mon, ..., 6=Sat
			offset := wd
			if offset == 0 {
				offset = 7 // Sunday is at end of ISO week
			}
			d := ws.AddDate(0, 0, offset-1)
			if d.Before(anchor) || d.Before(start) || d.After(end) {
				continue
			}
			dates = append(dates, d)
		}
	}
	return dates
}

// generateMonthly produces dates on dayOfMonth every interval months from
// anchor, clamping to month length, filtered to [start, end].
func generateMonthly(anchor, start, end time.Time, interval, dayOfMonth int) []time.Time {
	var dates []time.Time
	y, m, _ := anchor.Date()
	for {
		clamped := clampDay(y, m, dayOfMonth)
		d := time.Date(y, m, clamped, 0, 0, 0, 0, time.UTC)
		if d.After(end) {
			break
		}
		if !d.Before(anchor) && !d.Before(start) {
			dates = append(dates, d)
		}
		// Advance by interval months.
		m += time.Month(interval)
		for m > 12 {
			m -= 12
			y++
		}
	}
	return dates
}

// generateYearly produces dates on the anchor's month/day every interval years,
// clamping Feb 29 to Feb 28 in non-leap years, filtered to [start, end].
func generateYearly(anchor, start, end time.Time, interval int) []time.Time {
	var dates []time.Time
	_, anchorMonth, anchorDay := anchor.Date()
	for y := anchor.Year(); ; y += interval {
		clamped := clampDay(y, anchorMonth, anchorDay)
		d := time.Date(y, anchorMonth, clamped, 0, 0, 0, 0, time.UTC)
		if d.After(end) {
			break
		}
		if !d.Before(anchor) && !d.Before(start) {
			dates = append(dates, d)
		}
	}
	return dates
}

// ComputeOccurrences generates all occurrence dates for the given pattern
// within [start, end], applying exceptions (suppressions and replacements).
func (se *ScheduleEngine) ComputeOccurrences(pattern RepeatPattern, exceptions []Exception, start, end string) []string {
	startDate, err := parseDate(start)
	if err != nil {
		return nil
	}
	endDate, err := parseDate(end)
	if err != nil {
		return nil
	}
	if pattern.StartDate.IsZero() {
		return nil
	}
	anchor := pattern.StartDate.Time()
	if anchor.After(endDate) {
		return nil
	}

	interval := effectiveInterval(pattern.Interval)

	var raw []time.Time
	switch pattern.Frequency {
	case "daily":
		raw = generateDaily(anchor, startDate, endDate, interval)
	case "weekly":
		raw = generateWeekly(anchor, startDate, endDate, interval, pattern.Weekdays)
	case "monthly":
		day := pattern.DayOfMonth
		if day <= 0 {
			day = anchor.Day()
		}
		raw = generateMonthly(anchor, startDate, endDate, interval, day)
	case "yearly":
		raw = generateYearly(anchor, startDate, endDate, interval)
	default:
		return nil
	}

	// Build exception maps.
	suppressed := make(map[string]bool)
	var replacements []time.Time
	for _, ex := range exceptions {
		suppressed[ex.OriginalDate.String()] = true
		if !ex.NewDate.IsZero() {
			nd := ex.NewDate.Time()
			if !nd.Before(startDate) && !nd.After(endDate) {
				replacements = append(replacements, nd)
			}
		}
	}

	// Filter suppressed, collect remaining.
	var result []time.Time
	for _, d := range raw {
		if !suppressed[formatDate(d)] {
			result = append(result, d)
		}
	}
	result = append(result, replacements...)

	// Sort and format.
	sort.Slice(result, func(i, j int) bool { return result[i].Before(result[j]) })

	out := make([]string, len(result))
	for i, d := range result {
		out[i] = formatDate(d)
	}
	return out
}

// ComputeOverdue returns occurrence dates before asOf that are not in
// completedDates.
func (se *ScheduleEngine) ComputeOverdue(pattern RepeatPattern, exceptions []Exception, completedDates []string, asOf string) []string {
	asOfDate, err := parseDate(asOf)
	if err != nil {
		return nil
	}
	dayBefore := formatDate(asOfDate.AddDate(0, 0, -1))

	occurrences := se.ComputeOccurrences(pattern, exceptions, pattern.StartDate.String(), dayBefore)

	completed := make(map[string]bool, len(completedDates))
	for _, d := range completedDates {
		completed[d] = true
	}

	var overdue []string
	for _, d := range occurrences {
		if !completed[d] {
			overdue = append(overdue, d)
		}
	}
	return overdue
}

// EvaluatePeriodCompletion determines how many occurrences in the current
// period have been completed versus how many were expected up to asOf.
func (se *ScheduleEngine) EvaluatePeriodCompletion(pattern RepeatPattern, exceptions []Exception, completedDates []string, asOf string) PeriodCompletion {
	asOfDate, err := parseDate(asOf)
	if err != nil {
		return PeriodCompletion{}
	}

	periodStart, periodEnd, period := periodBounds(asOfDate, pattern.Frequency)

	// All occurrences in the full period.
	allInPeriod := se.ComputeOccurrences(pattern, exceptions, formatDate(periodStart), formatDate(periodEnd))

	// Occurrences expected up to asOf (for on-track evaluation).
	upToAsOf := se.ComputeOccurrences(pattern, exceptions, formatDate(periodStart), asOf)

	completed := make(map[string]bool, len(completedDates))
	for _, d := range completedDates {
		completed[d] = true
	}

	// Count completed within the full period.
	var completedCount int
	for _, d := range allInPeriod {
		if completed[d] {
			completedCount++
		}
	}

	expectedSoFar := len(upToAsOf)

	// Count completed up to asOf for on-track check.
	var completedSoFar int
	for _, d := range upToAsOf {
		if completed[d] {
			completedSoFar++
		}
	}

	return PeriodCompletion{
		Completed: completedCount,
		Expected:  len(allInPeriod),
		Period:    period,
		OnTrack:   completedSoFar >= expectedSoFar,
	}
}

// periodBounds returns the start and end dates of the period containing
// asOf, based on the frequency.
func periodBounds(asOf time.Time, frequency string) (time.Time, time.Time, string) {
	switch frequency {
	case "daily":
		return asOf, asOf, "day"
	case "weekly":
		// Monday to Sunday.
		wd := int(asOf.Weekday())
		if wd == 0 {
			wd = 7
		}
		monday := asOf.AddDate(0, 0, -(wd - 1))
		sunday := monday.AddDate(0, 0, 6)
		return monday, sunday, "week"
	case "monthly":
		first := time.Date(asOf.Year(), asOf.Month(), 1, 0, 0, 0, 0, time.UTC)
		last := first.AddDate(0, 1, -1)
		return first, last, "month"
	case "yearly":
		first := time.Date(asOf.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
		last := time.Date(asOf.Year(), 12, 31, 0, 0, 0, 0, time.UTC)
		return first, last, "year"
	default:
		return asOf, asOf, ""
	}
}
