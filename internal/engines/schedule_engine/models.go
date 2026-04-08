// Package schedule_engine provides Engine layer components for computing
// routine occurrences from repeat patterns. It is stateless and operates
// on its own input/output DTOs, without importing access layer types.
package schedule_engine

// RepeatPattern defines when a routine recurs.
type RepeatPattern struct {
	Frequency  string // "daily", "weekly", "monthly", "yearly"
	Interval   int    // every N periods (default 1)
	Weekdays   []int  // for weekly: 0=Sun..6=Sat (time.Weekday values)
	DayOfMonth int    // for monthly: which day
	StartDate  string // anchor date YYYY-MM-DD
}

// Exception represents a rescheduled occurrence.
type Exception struct {
	OriginalDate string // suppressed date YYYY-MM-DD
	NewDate      string // replacement date YYYY-MM-DD
}

// PeriodCompletion shows how many occurrences were completed in the current period.
type PeriodCompletion struct {
	Completed int    // occurrences checked in current period
	Expected  int    // occurrences scheduled in current period
	Period    string // "day", "week", "month", "year"
	OnTrack   bool   // Completed >= Expected (for period so far)
}
