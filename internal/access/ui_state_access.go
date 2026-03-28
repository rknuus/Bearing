package access

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// IUIStateAccess defines the interface for persisting transient UI state
// across sessions. These operations do not use git versioning.
type IUIStateAccess interface {
	LoadNavigationContext() (*NavigationContext, error)
	SaveNavigationContext(ctx NavigationContext) error
	LoadTaskDrafts() (json.RawMessage, error)
	SaveTaskDrafts(data json.RawMessage) error
	LoadAdvisorEnabled() (bool, error)
	SaveAdvisorEnabled(enabled bool) error
}

// UIStateAccess implements IUIStateAccess with file-based storage.
// Writes are not git-versioned.
type UIStateAccess struct {
	dataPath string
}

// NewUIStateAccess creates a new UIStateAccess instance.
func NewUIStateAccess(dataPath string) *UIStateAccess {
	return &UIStateAccess{dataPath: dataPath}
}

// navigationContextFilePath returns the path to the navigation context file.
func (ua *UIStateAccess) navigationContextFilePath() string {
	return filepath.Join(ua.dataPath, "navigation_context.json")
}

// LoadNavigationContext retrieves the saved navigation context.
func (ua *UIStateAccess) LoadNavigationContext() (*NavigationContext, error) {
	filePath := ua.navigationContextFilePath()

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("UIStateAccess.LoadNavigationContext: failed to read file: %w", err)
	}

	var ctx NavigationContext
	if err := json.Unmarshal(data, &ctx); err != nil {
		return nil, fmt.Errorf("UIStateAccess.LoadNavigationContext: failed to parse file: %w", err)
	}

	return &ctx, nil
}

// SaveNavigationContext persists the navigation context.
// Note: This is user preference data, not versioned with git.
func (ua *UIStateAccess) SaveNavigationContext(ctx NavigationContext) error {
	filePath := ua.navigationContextFilePath()
	if err := writeJSON(filePath, ctx); err != nil {
		return fmt.Errorf("UIStateAccess.SaveNavigationContext: %w", err)
	}

	return nil
}

// taskDraftsFilePath returns the path to the task drafts file.
func (ua *UIStateAccess) taskDraftsFilePath() string {
	return filepath.Join(ua.dataPath, "tasks", "drafts.json")
}

// LoadTaskDrafts retrieves saved task drafts.
// Returns nil if no drafts file exists or if it cannot be read (graceful degradation).
func (ua *UIStateAccess) LoadTaskDrafts() (json.RawMessage, error) {
	data, err := os.ReadFile(ua.taskDraftsFilePath())
	if err != nil {
		return nil, nil
	}
	return json.RawMessage(data), nil
}

// SaveTaskDrafts persists task drafts.
// Note: This is ephemeral planning data, not versioned with git.
func (ua *UIStateAccess) SaveTaskDrafts(data json.RawMessage) error {
	if err := os.WriteFile(ua.taskDraftsFilePath(), data, 0644); err != nil {
		return fmt.Errorf("UIStateAccess.SaveTaskDrafts: %w", err)
	}
	return nil
}

// advisorSettingsFilePath returns the path to the advisor settings file.
func (ua *UIStateAccess) advisorSettingsFilePath() string {
	return filepath.Join(ua.dataPath, "advisor_settings.json")
}

// advisorSettings is the JSON structure for advisor settings.
type advisorSettings struct {
	Enabled bool `json:"enabled"`
}

// LoadAdvisorEnabled retrieves the advisor enabled setting.
// Returns false if the file does not exist (advisor disabled by default).
func (ua *UIStateAccess) LoadAdvisorEnabled() (bool, error) {
	filePath := ua.advisorSettingsFilePath()

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, fmt.Errorf("UIStateAccess.LoadAdvisorEnabled: failed to read file: %w", err)
	}

	var settings advisorSettings
	if err := json.Unmarshal(data, &settings); err != nil {
		return false, fmt.Errorf("UIStateAccess.LoadAdvisorEnabled: failed to parse file: %w", err)
	}

	return settings.Enabled, nil
}

// SaveAdvisorEnabled persists the advisor enabled setting.
// Note: This is user preference data, not versioned with git.
func (ua *UIStateAccess) SaveAdvisorEnabled(enabled bool) error {
	filePath := ua.advisorSettingsFilePath()
	if err := writeJSON(filePath, advisorSettings{Enabled: enabled}); err != nil {
		return fmt.Errorf("UIStateAccess.SaveAdvisorEnabled: %w", err)
	}
	return nil
}
