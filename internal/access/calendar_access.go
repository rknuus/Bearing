package access

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/rkn/bearing/internal/utilities"
)

// ICalendarAccess defines the interface for calendar data access operations.
// All write operations use git versioning through transactions.
type ICalendarAccess interface {
	GetDayFocus(date string) (*DayFocus, error)
	SaveDayFocus(day DayFocus) error
	GetYearFocus(year int) ([]DayFocus, error)

	// WriteDayFocus persists a day focus entry without git-committing.
	// Intended for use inside a manager-orchestrated
	// utilities.RunTransaction so a single terminal commit covers writes
	// spanning multiple Access components.
	WriteDayFocus(day DayFocus) error

	// GetRoutineCompletions returns every date on which routineID was
	// checked, scanning all year files under calendar/. Dates are
	// returned in YYYY-MM-DD form, sorted ascending. Used by the
	// PlanningManager to feed ScheduleEngine.Plan's overdue-priority
	// rule with real cross-day completion history.
	GetRoutineCompletions(routineID string) ([]string, error)
}

// CalendarAccess implements ICalendarAccess with file-based storage and git versioning.
//
// mu serialises the full read-modify-write cycle on calendar/<year>.json. The
// per-path mutex inside writeJSON only protects the atomic-write step itself;
// without mu, two goroutines could each call GetYearFocus, mutate independent
// in-memory copies, and race on SaveDayFocus — losing one set of edits.
//
// A single mutex covers all year files. Calendar writes are infrequent and
// year files are small, so the loss of per-year parallelism is not a concern
// and the simpler invariant is preferred.
//
// Lock-ordering invariant: acquire CalendarAccess.mu before invoking
// commitFiles (which internally takes the repository transaction lock).
// Never invert this order.
type CalendarAccess struct {
	dataPath string
	repo     utilities.IRepository
	mu       sync.Mutex
}

// NewCalendarAccess creates a new CalendarAccess instance.
func NewCalendarAccess(dataPath string, repo utilities.IRepository) (*CalendarAccess, error) {
	if dataPath == "" {
		return nil, fmt.Errorf("CalendarAccess.New: dataPath cannot be empty")
	}
	if repo == nil {
		return nil, fmt.Errorf("CalendarAccess.New: repo cannot be nil")
	}

	ca := &CalendarAccess{
		dataPath: dataPath,
		repo:     repo,
	}

	// Ensure calendar directory exists
	if err := ensureDir(filepath.Join(dataPath, "calendar")); err != nil {
		return nil, fmt.Errorf("CalendarAccess.New: %w", err)
	}

	return ca, nil
}

// yearFocusFilePath returns the path to a year's calendar file.
func (ca *CalendarAccess) yearFocusFilePath(year int) string {
	return filepath.Join(ca.dataPath, "calendar", fmt.Sprintf("%d.json", year))
}

// extractYearFromDate extracts the year from a CalendarDate or date string.
func (ca *CalendarAccess) extractYearFromDate(date string) (int, error) {
	if len(date) < 4 {
		return 0, fmt.Errorf("date too short: %s", date)
	}

	year, err := strconv.Atoi(date[:4])
	if err != nil {
		return 0, fmt.Errorf("invalid year in date: %s", date)
	}

	return year, nil
}

// extractYearFromCalendarDate extracts the year from a CalendarDate.
func (ca *CalendarAccess) extractYearFromCalendarDate(date utilities.CalendarDate) (int, error) {
	if date.IsZero() {
		return 0, fmt.Errorf("date is zero")
	}
	return date.Time().Year(), nil
}

// GetDayFocus returns the day focus for a specific date.
func (ca *CalendarAccess) GetDayFocus(date string) (*DayFocus, error) {
	year, err := ca.extractYearFromDate(date)
	if err != nil {
		return nil, fmt.Errorf("CalendarAccess.GetDayFocus: invalid date format: %w", err)
	}

	ca.mu.Lock()
	defer ca.mu.Unlock()

	entries, err := ca.getYearFocusLocked(year)
	if err != nil {
		return nil, fmt.Errorf("CalendarAccess.GetDayFocus: failed to get year focus: %w", err)
	}

	for _, entry := range entries {
		if entry.Date.String() == date {
			return &entry, nil
		}
	}

	return nil, nil
}

// SaveDayFocus saves or updates a day focus entry.
func (ca *CalendarAccess) SaveDayFocus(day DayFocus) error {
	year, err := ca.extractYearFromCalendarDate(day.Date)
	if err != nil {
		return fmt.Errorf("CalendarAccess.SaveDayFocus: invalid date format: %w", err)
	}

	ca.mu.Lock()
	defer ca.mu.Unlock()

	filePath, found, err := ca.writeDayFocusLocked(day, year)
	if err != nil {
		return fmt.Errorf("CalendarAccess.SaveDayFocus: %w", err)
	}

	// Commit with git
	action := "Update"
	if !found {
		action = "Add"
	}
	if err := commitFiles(ca.repo, []string{filePath}, fmt.Sprintf("%s day focus: %s", action, day.Date.String())); err != nil {
		return fmt.Errorf("CalendarAccess.SaveDayFocus: %w", err)
	}

	return nil
}

// WriteDayFocus persists a day focus entry without git-committing. The caller
// is expected to coordinate the terminal commit (typically via
// utilities.RunTransaction at the manager layer).
//
// Shares ca.mu with SaveDayFocus so the read-modify-write cycle remains
// serialised across committing and non-committing variants.
func (ca *CalendarAccess) WriteDayFocus(day DayFocus) error {
	year, err := ca.extractYearFromCalendarDate(day.Date)
	if err != nil {
		return fmt.Errorf("CalendarAccess.WriteDayFocus: invalid date format: %w", err)
	}

	ca.mu.Lock()
	defer ca.mu.Unlock()

	if _, _, err := ca.writeDayFocusLocked(day, year); err != nil {
		return fmt.Errorf("CalendarAccess.WriteDayFocus: %w", err)
	}
	return nil
}

// writeDayFocusLocked performs the in-memory upsert and disk write of a day
// focus entry without committing. Caller must hold ca.mu. Returns the file
// path written and whether the entry already existed (false = newly added).
func (ca *CalendarAccess) writeDayFocusLocked(day DayFocus, year int) (string, bool, error) {
	entries, err := ca.getYearFocusLocked(year)
	if err != nil {
		return "", false, fmt.Errorf("failed to get year focus: %w", err)
	}

	// Find and update existing entry, or add new one
	found := false
	for i, e := range entries {
		if e.Date.String() == day.Date.String() {
			entries[i] = day
			found = true
			break
		}
	}
	if !found {
		entries = append(entries, day)
	}

	// Sort entries by date
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Date.Time().Before(entries[j].Date.Time())
	})

	// Save to file
	filePath := ca.yearFocusFilePath(year)
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return "", found, fmt.Errorf("failed to create calendar directory: %w", err)
	}

	if err := writeJSON(filePath, YearFocusFile{Year: year, Entries: entries}); err != nil {
		return "", found, err
	}

	return filePath, found, nil
}

// GetYearFocus returns all day focus entries for a specific year.
func (ca *CalendarAccess) GetYearFocus(year int) ([]DayFocus, error) {
	ca.mu.Lock()
	defer ca.mu.Unlock()
	return ca.getYearFocusLocked(year)
}

// getYearFocusLocked reads and parses the year file. The caller must hold ca.mu.
func (ca *CalendarAccess) getYearFocusLocked(year int) ([]DayFocus, error) {
	filePath := ca.yearFocusFilePath(year)

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []DayFocus{}, nil
		}
		return nil, fmt.Errorf("CalendarAccess.GetYearFocus: failed to read year focus file: %w", err)
	}

	var yearFile YearFocusFile
	if err := json.Unmarshal(data, &yearFile); err != nil {
		return nil, fmt.Errorf("CalendarAccess.GetYearFocus: failed to parse year focus file: %w", err)
	}

	return yearFile.Entries, nil
}

// GetRoutineCompletions returns every date on which routineID appears in
// DayFocus.RoutineChecks, scanning every <year>.json file under calendar/.
// Result is YYYY-MM-DD strings sorted ascending. Missing calendar/ directory
// yields an empty slice without error. Malformed year files are logged and
// skipped — a single corrupt file must not poison the whole query.
//
// Read-only path: takes ca.mu to keep the file-level snapshot consistent
// with concurrent writers (RMW invariant).
func (ca *CalendarAccess) GetRoutineCompletions(routineID string) ([]string, error) {
	if routineID == "" {
		return nil, fmt.Errorf("CalendarAccess.GetRoutineCompletions: routineID cannot be empty")
	}

	ca.mu.Lock()
	defer ca.mu.Unlock()

	calendarDir := filepath.Join(ca.dataPath, "calendar")
	dirEntries, err := os.ReadDir(calendarDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, fmt.Errorf("CalendarAccess.GetRoutineCompletions: failed to read calendar directory: %w", err)
	}

	var dates []string
	for _, entry := range dirEntries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasSuffix(name, ".json") {
			continue
		}
		yearStr := strings.TrimSuffix(name, ".json")
		year, err := strconv.Atoi(yearStr)
		if err != nil {
			// Not a year file (e.g. a stray file). Skip silently.
			continue
		}

		entries, err := ca.getYearFocusLocked(year)
		if err != nil {
			slog.Warn("CalendarAccess.GetRoutineCompletions: skipping malformed year file",
				"year", year, "error", err)
			continue
		}
		for _, df := range entries {
			for _, rid := range df.RoutineChecks {
				if rid == routineID {
					dates = append(dates, df.Date.String())
					break
				}
			}
		}
	}

	sort.Strings(dates)
	return dates, nil
}
