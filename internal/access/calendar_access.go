package access

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"sync"

	"github.com/rkn/bearing/internal/utilities"
)

// ICalendarAccess defines the interface for calendar data access operations.
// All write operations use git versioning through transactions.
type ICalendarAccess interface {
	GetDayFocus(date string) (*DayFocus, error)
	SaveDayFocus(day DayFocus) error
	GetYearFocus(year int) ([]DayFocus, error)
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

	entries, err := ca.getYearFocusLocked(year)
	if err != nil {
		return fmt.Errorf("CalendarAccess.SaveDayFocus: failed to get year focus: %w", err)
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
		return fmt.Errorf("CalendarAccess.SaveDayFocus: failed to create calendar directory: %w", err)
	}

	if err := writeJSON(filePath, YearFocusFile{Year: year, Entries: entries}); err != nil {
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
