package access

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/rkn/bearing/internal/utilities"
)

// IVisionAccess defines the interface for vision data access operations.
// All write operations use git versioning through transactions.
type IVisionAccess interface {
	LoadVision() (*PersonalVision, error)
	SaveVision(vision *PersonalVision) error
}

// VisionAccess implements IVisionAccess with file-based storage and git versioning.
type VisionAccess struct {
	dataPath string
	repo     utilities.IRepository
}

// NewVisionAccess creates a new VisionAccess instance.
func NewVisionAccess(dataPath string, repo utilities.IRepository) (*VisionAccess, error) {
	if dataPath == "" {
		return nil, fmt.Errorf("VisionAccess.New: dataPath cannot be empty")
	}
	if repo == nil {
		return nil, fmt.Errorf("VisionAccess.New: repo cannot be nil")
	}

	return &VisionAccess{
		dataPath: dataPath,
		repo:     repo,
	}, nil
}

// visionFilePath returns the path to the vision.json file.
func (va *VisionAccess) visionFilePath() string {
	return filepath.Join(va.dataPath, "vision.json")
}

// LoadVision retrieves the saved personal vision.
// Returns an empty PersonalVision (not error) if the file doesn't exist.
func (va *VisionAccess) LoadVision() (*PersonalVision, error) {
	filePath := va.visionFilePath()

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return &PersonalVision{}, nil
		}
		return nil, fmt.Errorf("VisionAccess.LoadVision: failed to read file: %w", err)
	}

	var vision PersonalVision
	if err := json.Unmarshal(data, &vision); err != nil {
		return nil, fmt.Errorf("VisionAccess.LoadVision: failed to parse file: %w", err)
	}

	return &vision, nil
}

// SaveVision persists the personal vision and commits via git.
func (va *VisionAccess) SaveVision(vision *PersonalVision) error {
	filePath := va.visionFilePath()
	if err := writeJSON(filePath, vision); err != nil {
		return fmt.Errorf("VisionAccess.SaveVision: %w", err)
	}

	if err := commitFiles(va.repo, []string{filePath}, "Update personal vision"); err != nil {
		return fmt.Errorf("VisionAccess.SaveVision: %w", err)
	}

	return nil
}
