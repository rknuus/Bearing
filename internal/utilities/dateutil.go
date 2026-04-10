package utilities

import (
	"encoding/json"
	"fmt"
	"time"
)

const calendarDateFormat = "2006-01-02"

// CalendarDate represents a date without a time component as a YYYY-MM-DD string.
// Using a string-based type (rather than a struct) ensures Wails binding generation
// resolves it as a plain string in TypeScript while still providing Go type safety.
// The zero value is the empty string, compatible with json omitempty.
// Validation happens at parse time (ParseCalendarDate, UnmarshalJSON).
type CalendarDate string

// NewCalendarDate creates a CalendarDate from a time.Time, extracting the
// local year/month/day. This means time.Now() produces today's local date,
// while time.Parse results use the parsed date as-is.
func NewCalendarDate(t time.Time) CalendarDate {
	return CalendarDate(t.Format(calendarDateFormat))
}

// ParseCalendarDate parses a "YYYY-MM-DD" string into a CalendarDate.
// It rejects values that do not round-trip: for example "2023-02-29" parses
// as 2023-03-01 in the standard library, so the re-format check catches it.
func ParseCalendarDate(s string) (CalendarDate, error) {
	t, err := time.Parse(calendarDateFormat, s)
	if err != nil {
		return "", fmt.Errorf("invalid CalendarDate %q: %w", s, err)
	}
	if t.Format(calendarDateFormat) != s {
		return "", fmt.Errorf("invalid CalendarDate %q: date does not exist", s)
	}
	return CalendarDate(s), nil
}

// MustParseCalendarDate is like ParseCalendarDate but panics on error.
// Intended for test data construction only.
func MustParseCalendarDate(s string) CalendarDate {
	d, err := ParseCalendarDate(s)
	if err != nil {
		panic(err)
	}
	return d
}

// Today returns the current date in the user's local timezone.
// This is correct for a local-first desktop app: the user's wall-clock
// date is what matters.
func Today() CalendarDate {
	return NewCalendarDate(time.Now())
}

// Time returns the date as a time.Time (UTC midnight).
// Parsing is performed on each call; for repeated access, cache the result.
func (d CalendarDate) Time() time.Time {
	if d == "" {
		return time.Time{}
	}
	t, _ := time.Parse(calendarDateFormat, string(d))
	return t
}

// String returns the YYYY-MM-DD representation, or "" for the zero value.
func (d CalendarDate) String() string {
	return string(d)
}

// IsZero reports whether d represents the zero value (empty string).
func (d CalendarDate) IsZero() bool {
	return d == ""
}

// UnmarshalJSON implements json.Unmarshaler.
// Accepts null, "", and valid "YYYY-MM-DD" strings.
func (d *CalendarDate) UnmarshalJSON(b []byte) error {
	var s *string
	if err := json.Unmarshal(b, &s); err != nil {
		return fmt.Errorf("CalendarDate: expected string or null, got %s", string(b))
	}
	if s == nil || *s == "" {
		*d = ""
		return nil
	}
	parsed, err := ParseCalendarDate(*s)
	if err != nil {
		return err
	}
	*d = parsed
	return nil
}

// MarshalText implements encoding.TextMarshaler.
func (d CalendarDate) MarshalText() ([]byte, error) {
	return []byte(d), nil
}

// UnmarshalText implements encoding.TextUnmarshaler.
func (d *CalendarDate) UnmarshalText(b []byte) error {
	s := string(b)
	if s == "" {
		*d = ""
		return nil
	}
	parsed, err := ParseCalendarDate(s)
	if err != nil {
		return err
	}
	*d = parsed
	return nil
}

// Timestamp represents an instant in time as an RFC3339 string.
// Using a string-based type ensures Wails binding generation resolves it
// as a plain string in TypeScript while still providing Go type safety.
// The zero value is the empty string, compatible with json omitempty.
type Timestamp string

// NewTimestamp creates a Timestamp from a time.Time.
func NewTimestamp(t time.Time) Timestamp {
	return Timestamp(t.Format(time.RFC3339))
}

// ParseTimestamp parses an RFC3339 string into a Timestamp.
func ParseTimestamp(s string) (Timestamp, error) {
	if _, err := time.Parse(time.RFC3339, s); err != nil {
		return "", fmt.Errorf("invalid Timestamp %q: %w", s, err)
	}
	return Timestamp(s), nil
}

// MustParseTimestamp is like ParseTimestamp but panics on error.
// Intended for test data construction only.
func MustParseTimestamp(s string) Timestamp {
	ts, err := ParseTimestamp(s)
	if err != nil {
		panic(err)
	}
	return ts
}

// Now returns the current time in UTC as a Timestamp.
func Now() Timestamp {
	return NewTimestamp(time.Now().UTC())
}

// Time returns the timestamp as a time.Time.
// Parsing is performed on each call; for repeated access, cache the result.
func (ts Timestamp) Time() time.Time {
	if ts == "" {
		return time.Time{}
	}
	t, _ := time.Parse(time.RFC3339, string(ts))
	return t
}

// String returns the RFC3339 representation, or "" for the zero value.
func (ts Timestamp) String() string {
	return string(ts)
}

// IsZero reports whether ts represents the zero value (empty string).
func (ts Timestamp) IsZero() bool {
	return ts == ""
}

// UnmarshalJSON implements json.Unmarshaler.
// Accepts null, "", and valid RFC3339 strings.
func (ts *Timestamp) UnmarshalJSON(b []byte) error {
	var s *string
	if err := json.Unmarshal(b, &s); err != nil {
		return fmt.Errorf("Timestamp: expected string or null, got %s", string(b))
	}
	if s == nil || *s == "" {
		*ts = ""
		return nil
	}
	parsed, err := ParseTimestamp(*s)
	if err != nil {
		return err
	}
	*ts = parsed
	return nil
}

// MarshalText implements encoding.TextMarshaler.
func (ts Timestamp) MarshalText() ([]byte, error) {
	return []byte(ts), nil
}

// UnmarshalText implements encoding.TextUnmarshaler.
func (ts *Timestamp) UnmarshalText(b []byte) error {
	s := string(b)
	if s == "" {
		*ts = ""
		return nil
	}
	parsed, err := ParseTimestamp(s)
	if err != nil {
		return err
	}
	*ts = parsed
	return nil
}
