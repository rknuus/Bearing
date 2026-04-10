package access

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/rkn/bearing/internal/utilities"
)

// IRoutineAccess defines the interface for routine data access operations.
// All write operations use git versioning through transactions.
type IRoutineAccess interface {
	GetRoutines() ([]Routine, error)
	SaveRoutine(routine Routine) error
	DeleteRoutine(id string) error
	SaveRoutines(routines []Routine) error
}

// RoutineAccess implements IRoutineAccess with file-based storage and git versioning.
type RoutineAccess struct {
	dataPath string
	repo     utilities.IRepository
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

	routines, err := ra.GetRoutines()
	if err != nil {
		return fmt.Errorf("RoutineAccess.SaveRoutine: failed to get existing routines: %w", err)
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

// DeleteRoutine deletes a routine by ID.
func (ra *RoutineAccess) DeleteRoutine(id string) error {
	routines, err := ra.GetRoutines()
	if err != nil {
		return fmt.Errorf("RoutineAccess.DeleteRoutine: failed to get existing routines: %w", err)
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
		return fmt.Errorf("RoutineAccess.DeleteRoutine: routine with ID %s not found", id)
	}

	// Save updated routines
	filePath := ra.routinesFilePath()
	if err := writeJSON(filePath, RoutinesFile{Routines: newRoutines}); err != nil {
		return fmt.Errorf("RoutineAccess.DeleteRoutine: %w", err)
	}

	// Commit with git
	if err := commitFiles(ra.repo, []string{filePath}, fmt.Sprintf("Delete routine: %s", id)); err != nil {
		return fmt.Errorf("RoutineAccess.DeleteRoutine: %w", err)
	}

	return nil
}

// SaveRoutines writes all routines at once and git-commits.
func (ra *RoutineAccess) SaveRoutines(routines []Routine) error {
	filePath := ra.routinesFilePath()
	if err := writeJSON(filePath, RoutinesFile{Routines: routines}); err != nil {
		return fmt.Errorf("RoutineAccess.SaveRoutines: %w", err)
	}

	if err := commitFiles(ra.repo, []string{filePath}, "Update routines"); err != nil {
		return fmt.Errorf("RoutineAccess.SaveRoutines: %w", err)
	}

	return nil
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
