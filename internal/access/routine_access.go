package access

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/rkn/bearing/internal/utilities"
)

// IRoutineAccess defines the interface for routine data access operations.
// All write operations use git versioning through transactions.
type IRoutineAccess interface {
	GetRoutines() ([]Routine, error)
	SaveRoutine(routine Routine) error
	DeleteRoutine(id string) error
	SaveRoutines(routines []Routine) error

	// WriteRoutine, WriteSaveRoutines, and WriteDeleteRoutine persist
	// changes without git-committing. They are intended for use inside a
	// manager-orchestrated utilities.RunTransaction so a single terminal
	// commit covers writes spanning multiple Access components.
	WriteRoutine(routine Routine) error
	WriteSaveRoutines(routines []Routine) error
	WriteDeleteRoutine(id string) error
}

// RoutineAccess implements IRoutineAccess with file-based storage and git versioning.
//
// mu serialises the full read-modify-write cycle on routines.json. The
// per-path mutex inside writeJSON only protects the atomic-write step itself;
// without mu, two goroutines could each call GetRoutines, mutate independent
// in-memory copies, and race on SaveRoutine — losing one set of edits.
//
// Lock-ordering invariant: acquire RoutineAccess.mu before invoking
// commitFiles (which internally takes the repository transaction lock).
// Never invert this order.
type RoutineAccess struct {
	dataPath string
	repo     utilities.IRepository
	mu       sync.Mutex
}

// NewRoutineAccess creates a new RoutineAccess instance.
func NewRoutineAccess(dataPath string, repo utilities.IRepository) (*RoutineAccess, error) {
	if dataPath == "" {
		return nil, fmt.Errorf("RoutineAccess.New: dataPath cannot be empty")
	}
	if repo == nil {
		return nil, fmt.Errorf("RoutineAccess.New: repo cannot be nil")
	}

	return &RoutineAccess{
		dataPath: dataPath,
		repo:     repo,
	}, nil
}

// routinesFilePath returns the path to the routines.json file.
func (ra *RoutineAccess) routinesFilePath() string {
	return filepath.Join(ra.dataPath, "routines.json")
}

// GetRoutines returns all routines.
func (ra *RoutineAccess) GetRoutines() ([]Routine, error) {
	ra.mu.Lock()
	defer ra.mu.Unlock()
	return ra.getRoutinesLocked()
}

// getRoutinesLocked reads and parses routines.json. The caller must hold ra.mu.
func (ra *RoutineAccess) getRoutinesLocked() ([]Routine, error) {
	filePath := ra.routinesFilePath()

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []Routine{}, nil
		}
		return nil, fmt.Errorf("RoutineAccess.GetRoutines: failed to read routines file: %w", err)
	}

	var routinesFile RoutinesFile
	if err := json.Unmarshal(data, &routinesFile); err != nil {
		return nil, fmt.Errorf("RoutineAccess.GetRoutines: failed to parse routines file: %w", err)
	}

	return routinesFile.Routines, nil
}

// SaveRoutine saves or updates a single routine.
// The routine ID must be set by the caller.
func (ra *RoutineAccess) SaveRoutine(routine Routine) error {
	if routine.ID == "" {
		return fmt.Errorf("RoutineAccess.SaveRoutine: routine ID cannot be empty")
	}

	ra.mu.Lock()
	defer ra.mu.Unlock()

	filePath, found, err := ra.writeRoutineLocked(routine)
	if err != nil {
		return fmt.Errorf("RoutineAccess.SaveRoutine: %w", err)
	}

	// Commit with git
	action := "Update"
	if !found {
		action = "Add"
	}
	if err := commitFiles(ra.repo, []string{filePath}, fmt.Sprintf("%s routine: %s", action, routine.Description)); err != nil {
		return fmt.Errorf("RoutineAccess.SaveRoutine: %w", err)
	}

	return nil
}

// WriteRoutine writes a routine to disk without git-committing. The caller is
// expected to coordinate the terminal commit (typically via
// utilities.RunTransaction at the manager layer).
//
// Shares ra.mu with SaveRoutine so the read-modify-write cycle remains
// serialised across committing and non-committing variants.
func (ra *RoutineAccess) WriteRoutine(routine Routine) error {
	if routine.ID == "" {
		return fmt.Errorf("RoutineAccess.WriteRoutine: routine ID cannot be empty")
	}

	ra.mu.Lock()
	defer ra.mu.Unlock()

	if _, _, err := ra.writeRoutineLocked(routine); err != nil {
		return fmt.Errorf("RoutineAccess.WriteRoutine: %w", err)
	}
	return nil
}

// writeRoutineLocked performs the in-memory upsert and disk write without
// committing. Caller must hold ra.mu. Returns the file path written and
// whether the routine already existed (false = newly added).
func (ra *RoutineAccess) writeRoutineLocked(routine Routine) (string, bool, error) {
	routines, err := ra.getRoutinesLocked()
	if err != nil {
		return "", false, fmt.Errorf("failed to get existing routines: %w", err)
	}

	// Find and update existing routine, or add new one
	found := false
	for i, r := range routines {
		if r.ID == routine.ID {
			routines[i] = routine
			found = true
			break
		}
	}
	if !found {
		routines = append(routines, routine)
	}

	// Save to file
	filePath := ra.routinesFilePath()
	if err := writeJSON(filePath, RoutinesFile{Routines: routines}); err != nil {
		return "", found, err
	}

	return filePath, found, nil
}

// DeleteRoutine deletes a routine by ID.
func (ra *RoutineAccess) DeleteRoutine(id string) error {
	ra.mu.Lock()
	defer ra.mu.Unlock()

	filePath, err := ra.deleteRoutineLocked(id)
	if err != nil {
		return fmt.Errorf("RoutineAccess.DeleteRoutine: %w", err)
	}

	// Commit with git
	if err := commitFiles(ra.repo, []string{filePath}, fmt.Sprintf("Delete routine: %s", id)); err != nil {
		return fmt.Errorf("RoutineAccess.DeleteRoutine: %w", err)
	}

	return nil
}

// WriteDeleteRoutine removes a routine from disk without git-committing. See
// WriteRoutine for usage rationale; shares ra.mu with the committing variant.
func (ra *RoutineAccess) WriteDeleteRoutine(id string) error {
	ra.mu.Lock()
	defer ra.mu.Unlock()

	if _, err := ra.deleteRoutineLocked(id); err != nil {
		return fmt.Errorf("RoutineAccess.WriteDeleteRoutine: %w", err)
	}
	return nil
}

// deleteRoutineLocked performs the in-memory removal and disk write of a
// routine deletion without committing. Caller must hold ra.mu.
func (ra *RoutineAccess) deleteRoutineLocked(id string) (string, error) {
	routines, err := ra.getRoutinesLocked()
	if err != nil {
		return "", fmt.Errorf("failed to get existing routines: %w", err)
	}

	// Find and remove the routine
	found := false
	newRoutines := make([]Routine, 0, len(routines))
	for _, r := range routines {
		if r.ID == id {
			found = true
		} else {
			newRoutines = append(newRoutines, r)
		}
	}

	if !found {
		return "", fmt.Errorf("routine with ID %s not found", id)
	}

	// Save updated routines
	filePath := ra.routinesFilePath()
	if err := writeJSON(filePath, RoutinesFile{Routines: newRoutines}); err != nil {
		return "", err
	}

	return filePath, nil
}

// SaveRoutines writes all routines at once and git-commits.
func (ra *RoutineAccess) SaveRoutines(routines []Routine) error {
	ra.mu.Lock()
	defer ra.mu.Unlock()

	filePath, err := ra.writeSaveRoutinesLocked(routines)
	if err != nil {
		return fmt.Errorf("RoutineAccess.SaveRoutines: %w", err)
	}

	if err := commitFiles(ra.repo, []string{filePath}, "Update routines"); err != nil {
		return fmt.Errorf("RoutineAccess.SaveRoutines: %w", err)
	}

	return nil
}

// WriteSaveRoutines replaces all routines on disk without git-committing. See
// WriteRoutine for usage rationale; shares ra.mu with the committing variant.
func (ra *RoutineAccess) WriteSaveRoutines(routines []Routine) error {
	ra.mu.Lock()
	defer ra.mu.Unlock()

	if _, err := ra.writeSaveRoutinesLocked(routines); err != nil {
		return fmt.Errorf("RoutineAccess.WriteSaveRoutines: %w", err)
	}
	return nil
}

// writeSaveRoutinesLocked replaces the entire routines file. Caller must hold
// ra.mu.
func (ra *RoutineAccess) writeSaveRoutinesLocked(routines []Routine) (string, error) {
	filePath := ra.routinesFilePath()
	if err := writeJSON(filePath, RoutinesFile{Routines: routines}); err != nil {
		return "", err
	}
	return filePath, nil
}

// NextRoutineID scans existing routine IDs for the R{n} pattern and returns R{max+1}.
func NextRoutineID(routines []Routine) string {
	maxNum := 0
	for _, r := range routines {
		if strings.HasPrefix(r.ID, "R") {
			if n, err := strconv.Atoi(r.ID[1:]); err == nil && n > maxNum {
				maxNum = n
			}
		}
	}
	return fmt.Sprintf("R%d", maxNum+1)
}
