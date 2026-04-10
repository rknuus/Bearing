package utilities

import (
	"encoding/json"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// CalendarDate — Construction
// ---------------------------------------------------------------------------

func TestUnit_CalendarDate_NewStripsTime(t *testing.T) {
	src := time.Date(2026, 4, 10, 14, 30, 59, 123456789, time.UTC)
	d := NewCalendarDate(src)
	got := d.Time()

	if got.Hour() != 0 || got.Minute() != 0 || got.Second() != 0 || got.Nanosecond() != 0 {
		t.Errorf("NewCalendarDate did not strip time: %v", got)
	}
	if got.Year() != 2026 || got.Month() != time.April || got.Day() != 10 {
		t.Errorf("NewCalendarDate changed the date: %v", got)
	}
}

func TestUnit_CalendarDate_NewNormalizesToUTC(t *testing.T) {
	loc, _ := time.LoadLocation("America/New_York")
	// June 15 at 22:00 EDT — local date is June 15, UTC date would be June 16
	src := time.Date(2026, 6, 15, 22, 0, 0, 0, loc)
	d := NewCalendarDate(src)

	if d.Time().Location() != time.UTC {
		t.Errorf("NewCalendarDate did not normalize to UTC: got %v", d.Time().Location())
	}
	// Must preserve the LOCAL date (June 15), not the UTC date
	if d.String() != "2026-06-15" {
		t.Errorf("NewCalendarDate used UTC date instead of local: got %v, want 2026-06-15", d.String())
	}
}

func TestUnit_CalendarDate_TodayAndParsedCompareEqual(t *testing.T) {
	// Simulates the promotion comparison bug: a date parsed from string
	// and a date from Today() must produce the same time.Time for the
	// same calendar date, regardless of local timezone.
	parsed, _ := ParseCalendarDate("2026-04-10")
	constructed := NewCalendarDate(time.Date(2026, 4, 10, 0, 0, 0, 0, time.Local))

	if !parsed.Time().Equal(constructed.Time()) {
		t.Errorf("parsed and constructed CalendarDate differ: parsed=%v, constructed=%v",
			parsed.Time(), constructed.Time())
	}
}

func TestUnit_CalendarDate_ParseValid(t *testing.T) {
	tests := []struct {
		input string
		year  int
		month time.Month
		day   int
	}{
		{"2026-04-10", 2026, time.April, 10},
		{"2024-02-29", 2024, time.February, 29}, // leap year
		{"2000-01-01", 2000, time.January, 1},
		{"1999-12-31", 1999, time.December, 31},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			d, err := ParseCalendarDate(tt.input)
			if err != nil {
				t.Fatalf("ParseCalendarDate(%q) unexpected error: %v", tt.input, err)
			}
			got := d.Time()
			if got.Year() != tt.year || got.Month() != tt.month || got.Day() != tt.day {
				t.Errorf("ParseCalendarDate(%q) = %v, want %d-%02d-%02d",
					tt.input, got, tt.year, tt.month, tt.day)
			}
		})
	}
}

func TestUnit_CalendarDate_ParseInvalid(t *testing.T) {
	tests := []struct {
		name  string
		input string
	}{
		{"not a date", "not-a-date"},
		{"invalid month", "2026-13-01"},
		{"invalid day", "2026-02-30"},
		{"non-leap Feb 29", "2023-02-29"},
		{"timestamp format", "2026-04-10T12:00:00Z"},
		{"empty string", ""},
		{"wrong separator", "2026/04/10"},
		{"partial date", "2026-04"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ParseCalendarDate(tt.input)
			if err == nil {
				t.Errorf("ParseCalendarDate(%q) expected error, got nil", tt.input)
			}
		})
	}
}

func TestUnit_CalendarDate_Today(t *testing.T) {
	now := time.Now()
	d := Today()

	got := d.Time()
	// Today() extracts local year/month/day and stores as UTC midnight.
	expectedDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	if !got.Equal(expectedDate) {
		t.Errorf("Today() = %v, want %v", got, expectedDate)
	}
	if got.Location() != time.UTC {
		t.Errorf("Today() location = %v, want UTC", got.Location())
	}
}

// ---------------------------------------------------------------------------
// CalendarDate — String / IsZero
// ---------------------------------------------------------------------------

func TestUnit_CalendarDate_String(t *testing.T) {
	d := MustParseCalendarDate("2026-04-10")
	if got := d.String(); got != "2026-04-10" {
		t.Errorf("String() = %q, want %q", got, "2026-04-10")
	}
}

func TestUnit_CalendarDate_StringZero(t *testing.T) {
	var d CalendarDate
	if got := d.String(); got != "" {
		t.Errorf("zero CalendarDate.String() = %q, want empty", got)
	}
}

func TestUnit_CalendarDate_IsZero(t *testing.T) {
	var zero CalendarDate
	if !zero.IsZero() {
		t.Error("zero CalendarDate.IsZero() = false, want true")
	}
	d := MustParseCalendarDate("2026-01-01")
	if d.IsZero() {
		t.Error("non-zero CalendarDate.IsZero() = true, want false")
	}
}

// ---------------------------------------------------------------------------
// CalendarDate — JSON round-trip
// ---------------------------------------------------------------------------

func TestUnit_CalendarDate_JSONRoundTrip(t *testing.T) {
	original := MustParseCalendarDate("2026-04-10")

	b, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("Marshal error: %v", err)
	}
	if string(b) != `"2026-04-10"` {
		t.Errorf("Marshal = %s, want %q", b, "2026-04-10")
	}

	var restored CalendarDate
	if err := json.Unmarshal(b, &restored); err != nil {
		t.Fatalf("Unmarshal error: %v", err)
	}
	if restored.String() != original.String() {
		t.Errorf("round-trip failed: got %q, want %q", restored.String(), original.String())
	}
}

func TestUnit_CalendarDate_JSONRoundTripInStruct(t *testing.T) {
	type record struct {
		Date CalendarDate `json:"date"`
	}
	orig := record{Date: MustParseCalendarDate("2024-02-29")}

	b, err := json.Marshal(orig)
	if err != nil {
		t.Fatalf("Marshal error: %v", err)
	}

	var restored record
	if err := json.Unmarshal(b, &restored); err != nil {
		t.Fatalf("Unmarshal error: %v", err)
	}
	if restored.Date.String() != orig.Date.String() {
		t.Errorf("round-trip in struct: got %q, want %q", restored.Date.String(), orig.Date.String())
	}
}

// ---------------------------------------------------------------------------
// CalendarDate — JSON zero value
// ---------------------------------------------------------------------------

func TestUnit_CalendarDate_MarshalZero(t *testing.T) {
	var d CalendarDate
	b, err := json.Marshal(d)
	if err != nil {
		t.Fatalf("Marshal zero error: %v", err)
	}
	if string(b) != `""` {
		t.Errorf("Marshal zero = %s, want %q", b, `""`)
	}
}

func TestUnit_CalendarDate_UnmarshalEmptyString(t *testing.T) {
	var d CalendarDate
	if err := json.Unmarshal([]byte(`""`), &d); err != nil {
		t.Fatalf("Unmarshal empty string error: %v", err)
	}
	if !d.IsZero() {
		t.Errorf("Unmarshal empty string produced non-zero: %v", d)
	}
}

func TestUnit_CalendarDate_UnmarshalNull(t *testing.T) {
	var d CalendarDate
	if err := json.Unmarshal([]byte(`null`), &d); err != nil {
		t.Fatalf("Unmarshal null error: %v", err)
	}
	if !d.IsZero() {
		t.Errorf("Unmarshal null produced non-zero: %v", d)
	}
}

// ---------------------------------------------------------------------------
// CalendarDate — JSON validation rejection
// ---------------------------------------------------------------------------

func TestUnit_CalendarDate_UnmarshalInvalid(t *testing.T) {
	tests := []struct {
		name  string
		input string
	}{
		{"not a date", `"not-a-date"`},
		{"invalid month", `"2026-13-01"`},
		{"invalid day", `"2026-02-30"`},
		{"non-leap Feb 29", `"2023-02-29"`},
		{"timestamp in date field", `"2026-04-10T12:00:00Z"`},
		{"number", `12345`},
		{"boolean", `true`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var d CalendarDate
			if err := json.Unmarshal([]byte(tt.input), &d); err == nil {
				t.Errorf("Unmarshal(%s) expected error, got nil", tt.input)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// CalendarDate — omitempty
// ---------------------------------------------------------------------------

func TestUnit_CalendarDate_OmitZero(t *testing.T) {
	// Go 1.24+ omitzero calls IsZero() on struct types to decide whether to
	// omit the field. CalendarDate{}.IsZero() returns true, so it is omitted.
	type record struct {
		Name string       `json:"name"`
		Date CalendarDate `json:"date,omitzero"`
	}
	r := record{Name: "test"}
	b, err := json.Marshal(r)
	if err != nil {
		t.Fatalf("Marshal error: %v", err)
	}

	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("Unmarshal to map error: %v", err)
	}
	if _, exists := m["date"]; exists {
		t.Errorf("zero CalendarDate with omitzero was not omitted: %s", b)
	}
}

func TestUnit_CalendarDate_OmitZeroPresent(t *testing.T) {
	type record struct {
		Name string       `json:"name"`
		Date CalendarDate `json:"date,omitzero"`
	}
	r := record{Name: "test", Date: MustParseCalendarDate("2026-04-10")}
	b, err := json.Marshal(r)
	if err != nil {
		t.Fatalf("Marshal error: %v", err)
	}

	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("Unmarshal to map error: %v", err)
	}
	if _, exists := m["date"]; !exists {
		t.Errorf("non-zero CalendarDate with omitempty was omitted: %s", b)
	}
}

// ---------------------------------------------------------------------------
// CalendarDate — TextMarshaler / TextUnmarshaler
// ---------------------------------------------------------------------------

func TestUnit_CalendarDate_TextRoundTrip(t *testing.T) {
	original := MustParseCalendarDate("2026-04-10")

	b, err := original.MarshalText()
	if err != nil {
		t.Fatalf("MarshalText error: %v", err)
	}
	if string(b) != "2026-04-10" {
		t.Errorf("MarshalText = %q, want %q", b, "2026-04-10")
	}

	var restored CalendarDate
	if err := restored.UnmarshalText(b); err != nil {
		t.Fatalf("UnmarshalText error: %v", err)
	}
	if restored.String() != original.String() {
		t.Errorf("text round-trip: got %q, want %q", restored.String(), original.String())
	}
}

func TestUnit_CalendarDate_TextZero(t *testing.T) {
	var d CalendarDate
	b, err := d.MarshalText()
	if err != nil {
		t.Fatalf("MarshalText zero error: %v", err)
	}
	if string(b) != "" {
		t.Errorf("MarshalText zero = %q, want empty", b)
	}

	var restored CalendarDate
	if err := restored.UnmarshalText([]byte("")); err != nil {
		t.Fatalf("UnmarshalText empty error: %v", err)
	}
	if !restored.IsZero() {
		t.Errorf("UnmarshalText empty produced non-zero: %v", restored)
	}
}

// ---------------------------------------------------------------------------
// CalendarDate — edge cases
// ---------------------------------------------------------------------------

func TestUnit_CalendarDate_LeapYear(t *testing.T) {
	d, err := ParseCalendarDate("2024-02-29")
	if err != nil {
		t.Fatalf("2024-02-29 should be valid (leap year): %v", err)
	}
	if d.String() != "2024-02-29" {
		t.Errorf("got %q, want %q", d.String(), "2024-02-29")
	}
}

func TestUnit_CalendarDate_NonLeapYear(t *testing.T) {
	_, err := ParseCalendarDate("2023-02-29")
	if err == nil {
		t.Error("2023-02-29 should be invalid (non-leap year)")
	}
}

func TestUnit_CalendarDate_UTCMidnight(t *testing.T) {
	// A UTC midnight timestamp should produce the expected date
	src := time.Date(2026, 4, 10, 0, 0, 0, 0, time.UTC)
	d := NewCalendarDate(src)
	if d.String() != "2026-04-10" {
		t.Errorf("UTC midnight: got %q, want %q", d.String(), "2026-04-10")
	}
}

// ---------------------------------------------------------------------------
// CalendarDate — MustParse
// ---------------------------------------------------------------------------

func TestUnit_CalendarDate_MustParsePanics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("MustParseCalendarDate with invalid input did not panic")
		}
	}()
	MustParseCalendarDate("invalid")
}

// ---------------------------------------------------------------------------
// Timestamp — Construction
// ---------------------------------------------------------------------------

func TestUnit_Timestamp_New(t *testing.T) {
	src := time.Date(2026, 4, 10, 14, 30, 59, 0, time.UTC)
	ts := NewTimestamp(src)
	got := ts.Time()

	if !got.Equal(src) {
		t.Errorf("NewTimestamp changed the time: got %v, want %v", got, src)
	}
}

func TestUnit_Timestamp_ParseValid(t *testing.T) {
	tests := []struct {
		input string
	}{
		{"2026-04-10T14:30:59Z"},
		{"2026-04-10T14:30:59+02:00"},
		{"2026-04-10T00:00:00Z"},
		{"2024-02-29T23:59:59Z"},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			ts, err := ParseTimestamp(tt.input)
			if err != nil {
				t.Fatalf("ParseTimestamp(%q) unexpected error: %v", tt.input, err)
			}
			if ts.IsZero() {
				t.Errorf("ParseTimestamp(%q) produced zero value", tt.input)
			}
		})
	}
}

func TestUnit_Timestamp_ParseInvalid(t *testing.T) {
	tests := []struct {
		name  string
		input string
	}{
		{"not a timestamp", "not-a-timestamp"},
		{"date only", "2026-04-10"},
		{"missing timezone", "2026-04-10T14:30:59"},
		{"empty string", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ParseTimestamp(tt.input)
			if err == nil {
				t.Errorf("ParseTimestamp(%q) expected error, got nil", tt.input)
			}
		})
	}
}

func TestUnit_Timestamp_Now(t *testing.T) {
	before := time.Now().UTC()
	ts := Now()
	after := time.Now().UTC()

	got := ts.Time()
	if got.Before(before) || got.After(after) {
		t.Errorf("Now() = %v, not between %v and %v", got, before, after)
	}
	if got.Location() != time.UTC {
		t.Errorf("Now() location = %v, want UTC", got.Location())
	}
}

// ---------------------------------------------------------------------------
// Timestamp — String / IsZero
// ---------------------------------------------------------------------------

func TestUnit_Timestamp_String(t *testing.T) {
	ts := MustParseTimestamp("2026-04-10T14:30:59Z")
	if got := ts.String(); got != "2026-04-10T14:30:59Z" {
		t.Errorf("String() = %q, want %q", got, "2026-04-10T14:30:59Z")
	}
}

func TestUnit_Timestamp_StringZero(t *testing.T) {
	var ts Timestamp
	if got := ts.String(); got != "" {
		t.Errorf("zero Timestamp.String() = %q, want empty", got)
	}
}

func TestUnit_Timestamp_IsZero(t *testing.T) {
	var zero Timestamp
	if !zero.IsZero() {
		t.Error("zero Timestamp.IsZero() = false, want true")
	}
	ts := MustParseTimestamp("2026-01-01T00:00:00Z")
	if ts.IsZero() {
		t.Error("non-zero Timestamp.IsZero() = true, want false")
	}
}

// ---------------------------------------------------------------------------
// Timestamp — JSON round-trip
// ---------------------------------------------------------------------------

func TestUnit_Timestamp_JSONRoundTrip(t *testing.T) {
	original := MustParseTimestamp("2026-04-10T14:30:59Z")

	b, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("Marshal error: %v", err)
	}
	if string(b) != `"2026-04-10T14:30:59Z"` {
		t.Errorf("Marshal = %s, want %q", b, "2026-04-10T14:30:59Z")
	}

	var restored Timestamp
	if err := json.Unmarshal(b, &restored); err != nil {
		t.Fatalf("Unmarshal error: %v", err)
	}
	if !restored.Time().Equal(original.Time()) {
		t.Errorf("round-trip failed: got %v, want %v", restored.Time(), original.Time())
	}
}

func TestUnit_Timestamp_JSONRoundTripInStruct(t *testing.T) {
	type record struct {
		Created Timestamp `json:"created"`
	}
	orig := record{Created: MustParseTimestamp("2026-04-10T14:30:59Z")}

	b, err := json.Marshal(orig)
	if err != nil {
		t.Fatalf("Marshal error: %v", err)
	}

	var restored record
	if err := json.Unmarshal(b, &restored); err != nil {
		t.Fatalf("Unmarshal error: %v", err)
	}
	if !restored.Created.Time().Equal(orig.Created.Time()) {
		t.Errorf("round-trip in struct: got %v, want %v", restored.Created.Time(), orig.Created.Time())
	}
}

// ---------------------------------------------------------------------------
// Timestamp — JSON zero value
// ---------------------------------------------------------------------------

func TestUnit_Timestamp_MarshalZero(t *testing.T) {
	var ts Timestamp
	b, err := json.Marshal(ts)
	if err != nil {
		t.Fatalf("Marshal zero error: %v", err)
	}
	if string(b) != `""` {
		t.Errorf("Marshal zero = %s, want %q", b, `""`)
	}
}

func TestUnit_Timestamp_UnmarshalEmptyString(t *testing.T) {
	var ts Timestamp
	if err := json.Unmarshal([]byte(`""`), &ts); err != nil {
		t.Fatalf("Unmarshal empty string error: %v", err)
	}
	if !ts.IsZero() {
		t.Errorf("Unmarshal empty string produced non-zero: %v", ts)
	}
}

func TestUnit_Timestamp_UnmarshalNull(t *testing.T) {
	var ts Timestamp
	if err := json.Unmarshal([]byte(`null`), &ts); err != nil {
		t.Fatalf("Unmarshal null error: %v", err)
	}
	if !ts.IsZero() {
		t.Errorf("Unmarshal null produced non-zero: %v", ts)
	}
}

// ---------------------------------------------------------------------------
// Timestamp — JSON validation rejection
// ---------------------------------------------------------------------------

func TestUnit_Timestamp_UnmarshalInvalid(t *testing.T) {
	tests := []struct {
		name  string
		input string
	}{
		{"not a timestamp", `"not-a-timestamp"`},
		{"date only in timestamp field", `"2026-04-10"`},
		{"number", `12345`},
		{"boolean", `true`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var ts Timestamp
			if err := json.Unmarshal([]byte(tt.input), &ts); err == nil {
				t.Errorf("Unmarshal(%s) expected error, got nil", tt.input)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Timestamp — omitempty
// ---------------------------------------------------------------------------

func TestUnit_Timestamp_OmitZero(t *testing.T) {
	// Go 1.24+ omitzero calls IsZero() on struct types to decide whether to
	// omit the field. Timestamp{}.IsZero() returns true, so it is omitted.
	type record struct {
		Name    string    `json:"name"`
		Created Timestamp `json:"created,omitzero"`
	}
	r := record{Name: "test"}
	b, err := json.Marshal(r)
	if err != nil {
		t.Fatalf("Marshal error: %v", err)
	}

	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("Unmarshal to map error: %v", err)
	}
	if _, exists := m["created"]; exists {
		t.Errorf("zero Timestamp with omitzero was not omitted: %s", b)
	}
}

func TestUnit_Timestamp_OmitZeroPresent(t *testing.T) {
	type record struct {
		Name    string    `json:"name"`
		Created Timestamp `json:"created,omitzero"`
	}
	r := record{Name: "test", Created: MustParseTimestamp("2026-04-10T14:30:59Z")}
	b, err := json.Marshal(r)
	if err != nil {
		t.Fatalf("Marshal error: %v", err)
	}

	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("Unmarshal to map error: %v", err)
	}
	if _, exists := m["created"]; !exists {
		t.Errorf("non-zero Timestamp with omitempty was omitted: %s", b)
	}
}

// ---------------------------------------------------------------------------
// Timestamp — TextMarshaler / TextUnmarshaler
// ---------------------------------------------------------------------------

func TestUnit_Timestamp_TextRoundTrip(t *testing.T) {
	original := MustParseTimestamp("2026-04-10T14:30:59Z")

	b, err := original.MarshalText()
	if err != nil {
		t.Fatalf("MarshalText error: %v", err)
	}
	if string(b) != "2026-04-10T14:30:59Z" {
		t.Errorf("MarshalText = %q, want %q", b, "2026-04-10T14:30:59Z")
	}

	var restored Timestamp
	if err := restored.UnmarshalText(b); err != nil {
		t.Fatalf("UnmarshalText error: %v", err)
	}
	if !restored.Time().Equal(original.Time()) {
		t.Errorf("text round-trip: got %v, want %v", restored.Time(), original.Time())
	}
}

func TestUnit_Timestamp_TextZero(t *testing.T) {
	var ts Timestamp
	b, err := ts.MarshalText()
	if err != nil {
		t.Fatalf("MarshalText zero error: %v", err)
	}
	if string(b) != "" {
		t.Errorf("MarshalText zero = %q, want empty", b)
	}

	var restored Timestamp
	if err := restored.UnmarshalText([]byte("")); err != nil {
		t.Fatalf("UnmarshalText empty error: %v", err)
	}
	if !restored.IsZero() {
		t.Errorf("UnmarshalText empty produced non-zero: %v", restored)
	}
}

// ---------------------------------------------------------------------------
// Timestamp — edge cases
// ---------------------------------------------------------------------------

func TestUnit_Timestamp_WithOffset(t *testing.T) {
	ts := MustParseTimestamp("2026-04-10T14:30:59+02:00")
	// The parsed time should be equivalent to 12:30:59 UTC
	expected := time.Date(2026, 4, 10, 12, 30, 59, 0, time.UTC)
	if !ts.Time().Equal(expected) {
		t.Errorf("offset time: got %v, want %v", ts.Time(), expected)
	}
}

// ---------------------------------------------------------------------------
// Timestamp — MustParse
// ---------------------------------------------------------------------------

func TestUnit_Timestamp_MustParsePanics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("MustParseTimestamp with invalid input did not panic")
		}
	}()
	MustParseTimestamp("invalid")
}

// ---------------------------------------------------------------------------
// Cross-type validation: wrong format in wrong field
// ---------------------------------------------------------------------------

func TestUnit_CrossType_TimestampInCalendarDateField(t *testing.T) {
	type record struct {
		Date CalendarDate `json:"date"`
	}
	input := `{"date":"2026-04-10T12:00:00Z"}`
	var r record
	if err := json.Unmarshal([]byte(input), &r); err == nil {
		t.Error("timestamp string in CalendarDate field should fail, got nil")
	}
}

func TestUnit_CrossType_CalendarDateInTimestampField(t *testing.T) {
	type record struct {
		Created Timestamp `json:"created"`
	}
	input := `{"created":"2026-04-10"}`
	var r record
	if err := json.Unmarshal([]byte(input), &r); err == nil {
		t.Error("CalendarDate string in Timestamp field should fail, got nil")
	}
}
