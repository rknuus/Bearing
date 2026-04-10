package utilities

import (
	"encoding/json"
	"fmt"
	"time"
)

const calendarDateFormat = "2006-01-02"

// CalendarDate represents a date without a time component.
// It wraps time.Time and enforces YYYY-MM-DD serialization.
// The zero value serializes as an empty string and is omitted
// by json:",omitzero" (Go 1.24+) because IsZero returns true.
type CalendarDate struct {
	t time.Time
}

// NewCalendarDate creates a CalendarDate from a time.Time, stripping the
// time-of-day component while preserving the location.
func NewCalendarDate(t time.Time) CalendarDate {
	return CalendarDate{
		t: time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location()),
	}
}

// ParseCalendarDate parses a "YYYY-MM-DD" string into a CalendarDate.
// It rejects values that do not round-trip: for example "2023-02-29" parses
// as 2023-03-01 in the standard library, so the re-format check catches it.
func ParseCalendarDate(s string) (CalendarDate, error) {
	t, err := time.Parse(calendarDateFormat, s)
	if err != nil {
		return CalendarDate{}, fmt.Errorf("invalid CalendarDate %q: %w", s, err)
	}
	// Reject dates that the standard library silently normalises (e.g. Feb 30).
	if t.Format(calendarDateFormat) != s {
		return CalendarDate{}, fmt.Errorf("invalid CalendarDate %q: date does not exist", s)
	}
	return CalendarDate{t: t}, nil
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

// Today returns the current local date.
func Today() CalendarDate {
	return NewCalendarDate(time.Now())
}

// Time returns the underlying time.Time value.
func (d CalendarDate) Time() time.Time {
	return d.t
}

// String returns the date formatted as "YYYY-MM-DD".
// The zero value returns an empty string.
func (d CalendarDate) String() string {
	if d.t.IsZero() {
		return ""
	}
	return d.t.Format(calendarDateFormat)
}

// IsZero reports whether d represents the zero value.
func (d CalendarDate) IsZero() bool {
	return d.t.IsZero()
}

// MarshalJSON implements json.Marshaler.
// Zero value produces "", otherwise "YYYY-MM-DD".
func (d CalendarDate) MarshalJSON() ([]byte, error) {
	return json.Marshal(d.String())
}

// UnmarshalJSON implements json.Unmarshaler.
// Accepts null, "", and valid "YYYY-MM-DD" strings.
func (d *CalendarDate) UnmarshalJSON(b []byte) error {
	var s *string
	if err := json.Unmarshal(b, &s); err != nil {
		return fmt.Errorf("CalendarDate: expected string or null, got %s", string(b))
	}
	if s == nil || *s == "" {
		d.t = time.Time{}
		return nil
	}
	parsed, err := ParseCalendarDate(*s)
	if err != nil {
		return err
	}
	d.t = parsed.t
	return nil
}

// MarshalText implements encoding.TextMarshaler.
func (d CalendarDate) MarshalText() ([]byte, error) {
	return []byte(d.String()), nil
}

// UnmarshalText implements encoding.TextUnmarshaler.
func (d *CalendarDate) UnmarshalText(b []byte) error {
	s := string(b)
	if s == "" {
		d.t = time.Time{}
		return nil
	}
	parsed, err := ParseCalendarDate(s)
	if err != nil {
		return err
	}
	d.t = parsed.t
	return nil
}

// Timestamp represents an instant in time with full precision.
// It wraps time.Time and enforces RFC3339 serialization.
// The zero value serializes as an empty string and is omitted
// by json:",omitzero" (Go 1.24+) because IsZero returns true.
type Timestamp struct {
	t time.Time
}

// NewTimestamp creates a Timestamp from a time.Time.
func NewTimestamp(t time.Time) Timestamp {
	return Timestamp{t: t}
}

// ParseTimestamp parses an RFC3339 string into a Timestamp.
func ParseTimestamp(s string) (Timestamp, error) {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return Timestamp{}, fmt.Errorf("invalid Timestamp %q: %w", s, err)
	}
	return Timestamp{t: t}, nil
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
	return Timestamp{t: time.Now().UTC()}
}

// Time returns the underlying time.Time value.
func (ts Timestamp) Time() time.Time {
	return ts.t
}

// String returns the timestamp formatted as RFC3339.
// The zero value returns an empty string.
func (ts Timestamp) String() string {
	if ts.t.IsZero() {
		return ""
	}
	return ts.t.Format(time.RFC3339)
}

// IsZero reports whether ts represents the zero value.
func (ts Timestamp) IsZero() bool {
	return ts.t.IsZero()
}

// MarshalJSON implements json.Marshaler.
// Zero value produces "", otherwise an RFC3339 string.
func (ts Timestamp) MarshalJSON() ([]byte, error) {
	return json.Marshal(ts.String())
}

// UnmarshalJSON implements json.Unmarshaler.
// Accepts null, "", and valid RFC3339 strings.
func (ts *Timestamp) UnmarshalJSON(b []byte) error {
	var s *string
	if err := json.Unmarshal(b, &s); err != nil {
		return fmt.Errorf("Timestamp: expected string or null, got %s", string(b))
	}
	if s == nil || *s == "" {
		ts.t = time.Time{}
		return nil
	}
	parsed, err := ParseTimestamp(*s)
	if err != nil {
		return err
	}
	ts.t = parsed.t
	return nil
}

// MarshalText implements encoding.TextMarshaler.
func (ts Timestamp) MarshalText() ([]byte, error) {
	return []byte(ts.String()), nil
}

// UnmarshalText implements encoding.TextUnmarshaler.
func (ts *Timestamp) UnmarshalText(b []byte) error {
	s := string(b)
	if s == "" {
		ts.t = time.Time{}
		return nil
	}
	parsed, err := ParseTimestamp(s)
	if err != nil {
		return err
	}
	ts.t = parsed.t
	return nil
}
