// Package managers provides business logic components for the Bearing application.
// This package contains manager components that implement the iDesign methodology,
// orchestrating access components and implementing business rules.
package managers

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/rkn/bearing/internal/access"
	"github.com/rkn/bearing/internal/engines/rule_engine"
)

// TaskWithStatus represents a task with its current status.
type TaskWithStatus struct {
	access.Task
	Status string `json:"status"`
}

// NavigationContext stores the user's navigation state for persistence.
type NavigationContext struct {
	CurrentView       string   `json:"currentView"`
	CurrentItem       string   `json:"currentItem"`
	FilterThemeID     string   `json:"filterThemeId"`
	LastAccessed      string   `json:"lastAccessed"`
	ShowCompleted     bool     `json:"showCompleted,omitempty"`
	ShowArchived      bool     `json:"showArchived,omitempty"`
	ShowArchivedTasks bool     `json:"showArchivedTasks,omitempty"`
	ExpandedOkrIds    []string `json:"expandedOkrIds,omitempty"`
	FilterTagIDs      []string `json:"filterTagIds,omitempty"`
	VisionCollapsed   *bool    `json:"visionCollapsed,omitempty"`
}

// IPlanningManager defines the interface for planning business logic.
type IPlanningManager interface {
	// Themes
	GetThemes() ([]access.LifeTheme, error)
	CreateTheme(name, color string) (*access.LifeTheme, error)
	UpdateTheme(theme access.LifeTheme) error
	SaveTheme(theme access.LifeTheme) error
	DeleteTheme(id string) error

	// Objectives — parentId can be a theme ID or any objective ID
	CreateObjective(parentId, title string) (*access.Objective, error)
	UpdateObjective(objectiveId, title string, tags []string) error
	DeleteObjective(objectiveId string) error

	// Key Results — parentObjectiveId / keyResultId found by tree-walking
	CreateKeyResult(parentObjectiveId, description string, startValue, targetValue int) (*access.KeyResult, error)
	UpdateKeyResult(keyResultId, description string) error
	UpdateKeyResultProgress(keyResultId string, currentValue int) error
	DeleteKeyResult(keyResultId string) error

	// OKR Status — set lifecycle status (active/completed/archived)
	SetObjectiveStatus(objectiveId, status string) error
	SetKeyResultStatus(keyResultId, status string) error

	// Objective Closing Workflow
	CloseObjective(objectiveId, closingStatus, closingNotes string) error
	ReopenObjective(objectiveId string) error

	// Calendar
	GetYearFocus(year int) ([]access.DayFocus, error)
	SaveDayFocus(day access.DayFocus) error
	ClearDayFocus(date string) error

	// Tasks
	GetTasks() ([]TaskWithStatus, error)
	CreateTask(title, themeId, priority, description, tags, promotionDate string) (*access.Task, error)
	MoveTask(taskId, newStatus string) (*MoveTaskResult, error)
	UpdateTask(task access.Task) error
	DeleteTask(taskId string) error
	ArchiveTask(taskId string) error
	ArchiveAllDoneTasks() error
	RestoreTask(taskId string) error
	ReorderTasks(positions map[string][]string) (*ReorderResult, error)

	// Priority Promotions
	ProcessPriorityPromotions() ([]PromotedTask, error)

	// Board Configuration
	GetBoardConfiguration() (*access.BoardConfiguration, error)

	// Theme Abbreviation
	SuggestThemeAbbreviation(name string) (string, error)

	// Navigation
	LoadNavigationContext() (*NavigationContext, error)
	SaveNavigationContext(ctx NavigationContext) error

	// Task Drafts
	LoadTaskDrafts() (json.RawMessage, error)
	SaveTaskDrafts(data json.RawMessage) error

	// Routines — ongoing health metrics per theme
	AddRoutine(themeId, description string, targetValue int, targetType, unit string) (*access.Routine, error)
	UpdateRoutine(routineId string, description string, currentValue, targetValue int, targetType, unit string) error
	DeleteRoutine(routineId string) error

	// Vision
	GetPersonalVision() (*access.PersonalVision, error)
	SavePersonalVision(mission, vision string) error

	// Progress Rollup
	GetAllThemeProgress() ([]ThemeProgress, error)
}

// MoveTaskResult contains the result of a MoveTask operation,
// including any rule violations that caused rejection.
type MoveTaskResult struct {
	Success    bool                        `json:"success"`
	Violations []rule_engine.RuleViolation `json:"violations,omitempty"`
	Positions  map[string][]string         `json:"positions,omitempty"`
}

// ReorderResult contains the authoritative task positions after a reorder operation.
type ReorderResult struct {
	Success   bool                `json:"success"`
	Positions map[string][]string `json:"positions"`
}

// PromotedTask represents a task that was promoted by ProcessPriorityPromotions.
type PromotedTask struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	OldPriority string `json:"oldPriority"`
	NewPriority string `json:"newPriority"`
}

// ObjectiveProgress represents the computed progress of an objective.
type ObjectiveProgress struct {
	ObjectiveID string  `json:"objectiveId"`
	Progress    float64 `json:"progress"` // 0-100, or -1 if no data
}

// ThemeProgress represents computed progress for a theme and its objectives.
type ThemeProgress struct {
	ThemeID    string              `json:"themeId"`
	Progress   float64             `json:"progress"` // 0-100, average of objective progresses
	Objectives []ObjectiveProgress `json:"objectives"`
}

// PlanningManager implements IPlanningManager with business logic.
type PlanningManager struct {
	planAccess        access.IPlanAccess
	ruleEngine        rule_engine.IRuleEngine
	navigationContext *NavigationContext
	taskOrderMu       sync.Mutex
}

// NewPlanningManager creates a new PlanningManager instance.
func NewPlanningManager(planAccess access.IPlanAccess) (*PlanningManager, error) {
	if planAccess == nil {
		return nil, fmt.Errorf("planAccess cannot be nil")
	}

	engine := rule_engine.NewRuleEngine(rule_engine.DefaultRules())

	pm := &PlanningManager{
		planAccess: planAccess,
		ruleEngine: engine,
	}

	pm.validateTaskOrder()

	return pm, nil
}

// GetThemes returns all life themes.
func (m *PlanningManager) GetThemes() ([]access.LifeTheme, error) {
	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}
	return themes, nil
}

// SaveTheme saves or updates a life theme.
func (m *PlanningManager) SaveTheme(theme access.LifeTheme) error {
	if err := m.planAccess.SaveTheme(theme); err != nil {
		return fmt.Errorf("%w", err)
	}
	return nil
}

// DeleteTheme deletes a life theme by ID.
func (m *PlanningManager) DeleteTheme(id string) error {
	if id == "" {
		return fmt.Errorf("id cannot be empty")
	}
	if err := m.planAccess.DeleteTheme(id); err != nil {
		return fmt.Errorf("%w", err)
	}
	return nil
}

// CreateTheme creates a new life theme with the given name and color.
// Returns the created theme with its generated ID.
func (m *PlanningManager) CreateTheme(name, color string) (*access.LifeTheme, error) {
	if name == "" {
		return nil, fmt.Errorf("name cannot be empty")
	}
	if color == "" {
		return nil, fmt.Errorf("color cannot be empty")
	}

	theme := access.LifeTheme{
		Name:       name,
		Color:      color,
		Objectives: []access.Objective{},
	}

	if err := m.planAccess.SaveTheme(theme); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Retrieve the saved theme to get the generated ID
	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve created theme: %w", err)
	}

	// Find the theme we just created (the one with matching name and color)
	for i := range themes {
		if themes[i].Name == name && themes[i].Color == color {
			return &themes[i], nil
		}
	}

	return nil, fmt.Errorf("theme was created but could not be retrieved")
}

// UpdateTheme updates an existing life theme.
func (m *PlanningManager) UpdateTheme(theme access.LifeTheme) error {
	if theme.ID == "" {
		return fmt.Errorf("theme ID cannot be empty")
	}

	if err := m.planAccess.SaveTheme(theme); err != nil {
		return fmt.Errorf("%w", err)
	}

	return nil
}

// findObjectiveByID walks the objective tree and returns a pointer to the objective with the given ID.
// Returns nil if not found.
func findObjectiveByID(objectives []Objective, id string) *Objective {
	for i := range objectives {
		if objectives[i].ID == id {
			return &objectives[i]
		}
		if found := findObjectiveByID(objectives[i].Objectives, id); found != nil {
			return found
		}
	}
	return nil
}

// findObjectiveParent walks the objective tree and returns the parent's Objectives slice and the index
// of the objective with the given ID within that slice. Returns nil, -1 if not found.
func findObjectiveParent(objectives *[]Objective, id string) (*[]Objective, int) {
	for i := range *objectives {
		if (*objectives)[i].ID == id {
			return objectives, i
		}
		if parentSlice, idx := findObjectiveParent(&(*objectives)[i].Objectives, id); parentSlice != nil {
			return parentSlice, idx
		}
	}
	return nil, -1
}

// findKeyResultParent walks the objective tree and returns a pointer to the objective
// containing the key result with the given ID, and the index of the key result.
// Returns nil, -1 if not found.
func findKeyResultParent(objectives []Objective, krID string) (*Objective, int) {
	for i := range objectives {
		for j := range objectives[i].KeyResults {
			if objectives[i].KeyResults[j].ID == krID {
				return &objectives[i], j
			}
		}
		if obj, idx := findKeyResultParent(objectives[i].Objectives, krID); obj != nil {
			return obj, idx
		}
	}
	return nil, -1
}

// Objective is an alias for access.Objective used in tree-walking helpers.
type Objective = access.Objective

// CreateObjective creates a new objective under a parent (theme or objective).
// parentId can be a theme ID or any objective ID at any depth.
// Returns the created objective with its generated ID.
func (m *PlanningManager) CreateObjective(parentId, title string) (*access.Objective, error) {
	if parentId == "" {
		return nil, fmt.Errorf("parentId cannot be empty")
	}
	if title == "" {
		return nil, fmt.Errorf("title cannot be empty")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	newObjective := access.Objective{
		Title:      title,
		KeyResults: []access.KeyResult{},
	}

	// Try to find parentId as a theme ID first
	var targetTheme *access.LifeTheme
	for i := range themes {
		if themes[i].ID == parentId {
			targetTheme = &themes[i]
			targetTheme.Objectives = append(targetTheme.Objectives, newObjective)
			break
		}
	}

	// If not a theme, search for parentId as an objective ID
	if targetTheme == nil {
		for i := range themes {
			if parentObj := findObjectiveByID(themes[i].Objectives, parentId); parentObj != nil {
				targetTheme = &themes[i]
				parentObj.Objectives = append(parentObj.Objectives, newObjective)
				break
			}
		}
	}

	if targetTheme == nil {
		return nil, fmt.Errorf("parent with ID %s not found", parentId)
	}

	if err := m.planAccess.SaveTheme(*targetTheme); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Retrieve updated theme to get the generated objective ID
	themes, err = m.planAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve updated theme: %w", err)
	}

	// Find the newly created objective (last child of the parent)
	for _, theme := range themes {
		if theme.ID == targetTheme.ID {
			// If parent was the theme itself
			if theme.ID == parentId {
				if len(theme.Objectives) > 0 {
					return &theme.Objectives[len(theme.Objectives)-1], nil
				}
			}
			// If parent was an objective
			if parentObj := findObjectiveByID(theme.Objectives, parentId); parentObj != nil {
				if len(parentObj.Objectives) > 0 {
					return &parentObj.Objectives[len(parentObj.Objectives)-1], nil
				}
			}
		}
	}

	return nil, fmt.Errorf("objective was created but could not be retrieved")
}

// validateTags trims whitespace, filters empty strings, and deduplicates case-insensitively
// (preserving the first occurrence's casing).
func validateTags(tags []string) []string {
	var result []string
	seen := make(map[string]bool)
	for _, tag := range tags {
		trimmed := strings.TrimSpace(tag)
		if trimmed == "" {
			continue
		}
		lower := strings.ToLower(trimmed)
		if seen[lower] {
			continue
		}
		seen[lower] = true
		result = append(result, trimmed)
	}
	return result
}

// UpdateObjective finds an objective by ID anywhere in the tree and updates its title and tags.
func (m *PlanningManager) UpdateObjective(objectiveId, title string, tags []string) error {
	if objectiveId == "" {
		return fmt.Errorf("objectiveId cannot be empty")
	}
	if title == "" {
		return fmt.Errorf("title cannot be empty")
	}

	validatedTags := validateTags(tags)

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	for i := range themes {
		if obj := findObjectiveByID(themes[i].Objectives, objectiveId); obj != nil {
			obj.Title = title
			obj.Tags = validatedTags
			if err := m.planAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("%w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("objective with ID %s not found", objectiveId)
}

// DeleteObjective finds an objective by ID anywhere in the tree and removes it.
// Children are removed automatically since they are nested in the struct.
func (m *PlanningManager) DeleteObjective(objectiveId string) error {
	if objectiveId == "" {
		return fmt.Errorf("objectiveId cannot be empty")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	for i := range themes {
		if parentSlice, idx := findObjectiveParent(&themes[i].Objectives, objectiveId); parentSlice != nil {
			*parentSlice = append((*parentSlice)[:idx], (*parentSlice)[idx+1:]...)
			if err := m.planAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("%w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("objective with ID %s not found", objectiveId)
}

// CreateKeyResult creates a new key result under an objective found anywhere in the tree.
// parentObjectiveId is the objective ID at any depth.
func (m *PlanningManager) CreateKeyResult(parentObjectiveId, description string, startValue, targetValue int) (*access.KeyResult, error) {
	if parentObjectiveId == "" {
		return nil, fmt.Errorf("parentObjectiveId cannot be empty")
	}
	if description == "" {
		return nil, fmt.Errorf("description cannot be empty")
	}
	if startValue > targetValue {
		return nil, fmt.Errorf("startValue (%d) cannot exceed targetValue (%d)", startValue, targetValue)
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	var targetTheme *access.LifeTheme
	for i := range themes {
		if obj := findObjectiveByID(themes[i].Objectives, parentObjectiveId); obj != nil {
			targetTheme = &themes[i]
			obj.KeyResults = append(obj.KeyResults, access.KeyResult{Description: description, StartValue: startValue, TargetValue: targetValue})
			break
		}
	}

	if targetTheme == nil {
		return nil, fmt.Errorf("objective with ID %s not found", parentObjectiveId)
	}

	if err := m.planAccess.SaveTheme(*targetTheme); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Retrieve updated theme to get the generated key result ID
	themes, err = m.planAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve updated theme: %w", err)
	}

	for _, theme := range themes {
		if theme.ID == targetTheme.ID {
			if obj := findObjectiveByID(theme.Objectives, parentObjectiveId); obj != nil {
				if len(obj.KeyResults) > 0 {
					return &obj.KeyResults[len(obj.KeyResults)-1], nil
				}
			}
		}
	}

	return nil, fmt.Errorf("key result was created but could not be retrieved")
}

// UpdateKeyResult finds a key result by ID anywhere in the tree and updates its description.
func (m *PlanningManager) UpdateKeyResult(keyResultId, description string) error {
	if keyResultId == "" {
		return fmt.Errorf("keyResultId cannot be empty")
	}
	if description == "" {
		return fmt.Errorf("description cannot be empty")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	for i := range themes {
		if obj, krIdx := findKeyResultParent(themes[i].Objectives, keyResultId); obj != nil {
			obj.KeyResults[krIdx].Description = description
			if err := m.planAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("%w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("key result with ID %s not found", keyResultId)
}

// UpdateKeyResultProgress finds a key result by ID anywhere in the tree and updates its currentValue.
func (m *PlanningManager) UpdateKeyResultProgress(keyResultId string, currentValue int) error {
	if keyResultId == "" {
		return fmt.Errorf("keyResultId cannot be empty")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	for i := range themes {
		if obj, krIdx := findKeyResultParent(themes[i].Objectives, keyResultId); obj != nil {
			obj.KeyResults[krIdx].CurrentValue = currentValue
			if err := m.planAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("%w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("key result with ID %s not found", keyResultId)
}

// DeleteKeyResult finds a key result by ID anywhere in the tree and removes it.
func (m *PlanningManager) DeleteKeyResult(keyResultId string) error {
	if keyResultId == "" {
		return fmt.Errorf("keyResultId cannot be empty")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	for i := range themes {
		if obj, krIdx := findKeyResultParent(themes[i].Objectives, keyResultId); obj != nil {
			obj.KeyResults = append(obj.KeyResults[:krIdx], obj.KeyResults[krIdx+1:]...)
			if err := m.planAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("%w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("key result with ID %s not found", keyResultId)
}

// getMaxRoutineNum returns the highest routine number in a theme's routines.
func getMaxRoutineNum(theme access.LifeTheme) int {
	max := 0
	prefix := theme.ID + "-R"
	for _, routine := range theme.Routines {
		if strings.HasPrefix(routine.ID, prefix) {
			var n int
			if _, err := fmt.Sscanf(routine.ID, theme.ID+"-R%d", &n); err == nil && n > max {
				max = n
			}
		}
	}
	return max
}

// findThemeForRoutine finds the theme containing the routine with the given ID.
// Routine IDs are prefixed with the theme ID, e.g. "HF-R1".
func findThemeForRoutine(themes []access.LifeTheme, routineId string) (*access.LifeTheme, int) {
	for i := range themes {
		for j := range themes[i].Routines {
			if themes[i].Routines[j].ID == routineId {
				return &themes[i], j
			}
		}
	}
	return nil, -1
}

// AddRoutine creates a new routine under the specified theme.
func (m *PlanningManager) AddRoutine(themeId, description string, targetValue int, targetType, unit string) (*access.Routine, error) {
	if themeId == "" {
		return nil, fmt.Errorf("themeId cannot be empty")
	}
	if strings.TrimSpace(description) == "" {
		return nil, fmt.Errorf("description cannot be empty")
	}
	if !access.IsValidRoutineTargetType(targetType) {
		return nil, fmt.Errorf("invalid target type: %s", targetType)
	}
	if targetValue <= 0 {
		return nil, fmt.Errorf("targetValue must be positive")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	var targetTheme *access.LifeTheme
	for i := range themes {
		if themes[i].ID == themeId {
			targetTheme = &themes[i]
			break
		}
	}
	if targetTheme == nil {
		return nil, fmt.Errorf("theme with ID %s not found", themeId)
	}

	maxNum := getMaxRoutineNum(*targetTheme)
	routine := access.Routine{
		ID:          fmt.Sprintf("%s-R%d", themeId, maxNum+1),
		Description: strings.TrimSpace(description),
		TargetValue: targetValue,
		TargetType:  targetType,
		Unit:        strings.TrimSpace(unit),
	}
	targetTheme.Routines = append(targetTheme.Routines, routine)

	if err := m.planAccess.SaveTheme(*targetTheme); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	return &routine, nil
}

// UpdateRoutine updates all fields of an existing routine.
func (m *PlanningManager) UpdateRoutine(routineId string, description string, currentValue, targetValue int, targetType, unit string) error {
	if routineId == "" {
		return fmt.Errorf("routineId cannot be empty")
	}
	if strings.TrimSpace(description) == "" {
		return fmt.Errorf("description cannot be empty")
	}
	if !access.IsValidRoutineTargetType(targetType) {
		return fmt.Errorf("invalid target type: %s", targetType)
	}
	if targetValue <= 0 {
		return fmt.Errorf("targetValue must be positive")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	theme, idx := findThemeForRoutine(themes, routineId)
	if theme == nil {
		return fmt.Errorf("routine with ID %s not found", routineId)
	}

	theme.Routines[idx].Description = strings.TrimSpace(description)
	theme.Routines[idx].CurrentValue = currentValue
	theme.Routines[idx].TargetValue = targetValue
	theme.Routines[idx].TargetType = targetType
	theme.Routines[idx].Unit = strings.TrimSpace(unit)

	if err := m.planAccess.SaveTheme(*theme); err != nil {
		return fmt.Errorf("%w", err)
	}
	return nil
}

// DeleteRoutine removes a routine by ID.
func (m *PlanningManager) DeleteRoutine(routineId string) error {
	if routineId == "" {
		return fmt.Errorf("routineId cannot be empty")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	theme, idx := findThemeForRoutine(themes, routineId)
	if theme == nil {
		return fmt.Errorf("routine with ID %s not found", routineId)
	}

	theme.Routines = append(theme.Routines[:idx], theme.Routines[idx+1:]...)

	if err := m.planAccess.SaveTheme(*theme); err != nil {
		return fmt.Errorf("%w", err)
	}
	return nil
}

// validateOKRStatusTransition checks whether a status transition is allowed.
// Returns an error if the transition is invalid.
func validateOKRStatusTransition(currentStatus, newStatus string) error {
	current := access.EffectiveOKRStatus(currentStatus)
	if !access.IsValidOKRStatus(newStatus) {
		return fmt.Errorf("invalid status %q", newStatus)
	}
	target := access.EffectiveOKRStatus(newStatus)

	if current == target {
		return nil // No-op
	}

	switch {
	case current == string(access.OKRStatusActive) && target == string(access.OKRStatusCompleted):
		return nil
	case current == string(access.OKRStatusCompleted) && target == string(access.OKRStatusArchived):
		return nil
	case target == string(access.OKRStatusActive): // Reopen from any non-active state
		return nil
	case current == string(access.OKRStatusActive) && target == string(access.OKRStatusArchived):
		return fmt.Errorf("cannot archive an active item; complete it first")
	default:
		return fmt.Errorf("invalid transition from %q to %q", current, target)
	}
}

// SetObjectiveStatus sets the lifecycle status of an objective.
// Completing an objective requires all direct children to be completed or archived.
func (m *PlanningManager) SetObjectiveStatus(objectiveId, status string) error {
	if objectiveId == "" {
		return fmt.Errorf("objectiveId cannot be empty")
	}
	if status == "" {
		return fmt.Errorf("status cannot be empty")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	for i := range themes {
		if obj := findObjectiveByID(themes[i].Objectives, objectiveId); obj != nil {
			if err := validateOKRStatusTransition(obj.Status, status); err != nil {
				return fmt.Errorf("%w", err)
			}

			// If completing, verify all direct children are completed or archived
			if access.EffectiveOKRStatus(status) == string(access.OKRStatusCompleted) {
				var incompleteItems []string
				for _, child := range obj.Objectives {
					if access.EffectiveOKRStatus(child.Status) == string(access.OKRStatusActive) {
						incompleteItems = append(incompleteItems, child.ID+" ("+child.Title+")")
					}
				}
				for _, kr := range obj.KeyResults {
					if access.EffectiveOKRStatus(kr.Status) == string(access.OKRStatusActive) {
						incompleteItems = append(incompleteItems, kr.ID+" ("+kr.Description+")")
					}
				}
				if len(incompleteItems) > 0 {
					return fmt.Errorf("cannot complete: it still has active items — complete them first")
				}
			}

			obj.Status = status
			if err := m.planAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("%w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("objective with ID %s not found", objectiveId)
}

// SetKeyResultStatus sets the lifecycle status of a key result.
func (m *PlanningManager) SetKeyResultStatus(keyResultId, status string) error {
	if keyResultId == "" {
		return fmt.Errorf("keyResultId cannot be empty")
	}
	if status == "" {
		return fmt.Errorf("status cannot be empty")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	for i := range themes {
		if obj, krIdx := findKeyResultParent(themes[i].Objectives, keyResultId); obj != nil {
			kr := &obj.KeyResults[krIdx]
			if err := validateOKRStatusTransition(kr.Status, status); err != nil {
				return fmt.Errorf("%w", err)
			}

			kr.Status = status
			if err := m.planAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("%w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("key result with ID %s not found", keyResultId)
}

// CloseObjective performs a structured close of an objective with a closing status and optional notes.
// Unlike SetObjectiveStatus, this method actively closes all active child KRs as part of the operation.
func (m *PlanningManager) CloseObjective(objectiveId, closingStatus, closingNotes string) error {
	if objectiveId == "" {
		return fmt.Errorf("objectiveId cannot be empty")
	}
	if !access.IsValidClosingStatus(closingStatus) {
		return fmt.Errorf("invalid closing status %q", closingStatus)
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	for i := range themes {
		if obj := findObjectiveByID(themes[i].Objectives, objectiveId); obj != nil {
			// Must be active to close
			if access.EffectiveOKRStatus(obj.Status) != string(access.OKRStatusActive) {
				return fmt.Errorf("cannot close: objective is not active (current status: %s)", access.EffectiveOKRStatus(obj.Status))
			}

			obj.Status = string(access.OKRStatusCompleted)
			obj.ClosingStatus = closingStatus
			obj.ClosingNotes = closingNotes
			obj.ClosedAt = time.Now().UTC().Format(time.RFC3339)

			// Close all active direct child KRs
			for j := range obj.KeyResults {
				if access.EffectiveOKRStatus(obj.KeyResults[j].Status) == string(access.OKRStatusActive) {
					obj.KeyResults[j].Status = string(access.OKRStatusCompleted)
				}
			}

			if err := m.planAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("%w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("objective with ID %s not found", objectiveId)
}

// ReopenObjective reopens a closed/completed objective, clearing all closing metadata.
// Also reopens all direct child KRs that were completed.
func (m *PlanningManager) ReopenObjective(objectiveId string) error {
	if objectiveId == "" {
		return fmt.Errorf("objectiveId cannot be empty")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	for i := range themes {
		if obj := findObjectiveByID(themes[i].Objectives, objectiveId); obj != nil {
			// Must be completed to reopen
			if access.EffectiveOKRStatus(obj.Status) != string(access.OKRStatusCompleted) {
				return fmt.Errorf("cannot reopen: objective is not completed (current status: %s)", access.EffectiveOKRStatus(obj.Status))
			}

			obj.Status = ""
			obj.ClosingStatus = ""
			obj.ClosingNotes = ""
			obj.ClosedAt = ""

			// Reopen all completed direct child KRs
			for j := range obj.KeyResults {
				if obj.KeyResults[j].Status == string(access.OKRStatusCompleted) {
					obj.KeyResults[j].Status = ""
				}
			}

			if err := m.planAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("%w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("objective with ID %s not found", objectiveId)
}

// GetYearFocus returns all day focus entries for a specific year.
func (m *PlanningManager) GetYearFocus(year int) ([]access.DayFocus, error) {
	if year < 1900 || year > 9999 {
		return nil, fmt.Errorf("invalid year %d", year)
	}
	entries, err := m.planAccess.GetYearFocus(year)
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}
	return entries, nil
}

// SaveDayFocus saves or updates a day focus entry.
func (m *PlanningManager) SaveDayFocus(day access.DayFocus) error {
	if day.Date == "" {
		return fmt.Errorf("date cannot be empty")
	}
	if err := m.planAccess.SaveDayFocus(day); err != nil {
		return fmt.Errorf("%w", err)
	}
	return nil
}

// ClearDayFocus removes a day focus entry by clearing theme IDs.
func (m *PlanningManager) ClearDayFocus(date string) error {
	if date == "" {
		return fmt.Errorf("date cannot be empty")
	}

	// Get the existing entry to check if it exists
	existing, err := m.planAccess.GetDayFocus(date)
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	// If there's no existing entry, nothing to clear
	if existing == nil {
		return nil
	}

	// Save with nil theme IDs to clear it
	cleared := access.DayFocus{
		Date:     date,
		ThemeIDs: nil,
		Notes:    existing.Notes, // Preserve notes
		Text:     existing.Text,  // Preserve text
	}

	if err := m.planAccess.SaveDayFocus(cleared); err != nil {
		return fmt.Errorf("%w", err)
	}

	return nil
}

// dropZoneForTask returns the drop zone ID for a task based on its status and priority.
// Todo tasks use their priority section name; doing/done tasks use the column name.
// dropZoneForTask returns the drop zone ID for a task. For todo-type columns,
// the drop zone is the priority (for section-based rendering). For other columns,
// the drop zone is the status itself. todoSlug is the slug of the todo-type column.
func dropZoneForTask(status, priority, todoSlug string) string {
	if status == todoSlug && priority != "" {
		return priority
	}
	return status
}

// todoSlugFromConfig returns the slug of the todo-type column from the board config.
func todoSlugFromConfig(config *access.BoardConfiguration) string {
	for _, col := range config.ColumnDefinitions {
		if col.Type == access.ColumnTypeTodo {
			return col.Name
		}
	}
	return string(access.TaskStatusTodo) // fallback
}

// validateTaskOrder repairs task_order.json so that each task appears in exactly
// the zone that dropZoneForTask derives from its current (status, priority).
// Removes duplicates and stale entries left by prior race conditions.
func (m *PlanningManager) validateTaskOrder() {
	config, err := m.planAccess.GetBoardConfiguration()
	if err != nil {
		return
	}

	tSlug := todoSlugFromConfig(config)

	// Collect actual zone for every task from disk
	statuses := make([]string, 0, len(config.ColumnDefinitions)+1)
	for _, col := range config.ColumnDefinitions {
		statuses = append(statuses, col.Name)
	}
	statuses = append(statuses, string(access.TaskStatusArchived))

	actualZone := make(map[string]string) // taskID → correct zone
	for _, status := range statuses {
		tasks, err := m.planAccess.GetTasksByStatus(status)
		if err != nil {
			continue
		}
		for _, t := range tasks {
			actualZone[t.ID] = dropZoneForTask(status, t.Priority, tSlug)
		}
	}

	orderMap, err := m.planAccess.LoadTaskOrder()
	if err != nil || len(orderMap) == 0 {
		return
	}

	// Remove stale entries: keep only IDs whose actual zone matches the zone key
	changed := false
	for zone, ids := range orderMap {
		filtered := make([]string, 0, len(ids))
		for _, id := range ids {
			if actualZone[id] == zone {
				filtered = append(filtered, id)
			} else {
				changed = true
			}
		}
		orderMap[zone] = filtered
	}

	// Add missing tasks to their correct zone
	present := make(map[string]bool)
	for _, ids := range orderMap {
		for _, id := range ids {
			present[id] = true
		}
	}
	for id, zone := range actualZone {
		if !present[id] {
			orderMap[zone] = append(orderMap[zone], id)
			changed = true
		}
	}

	if changed {
		slog.Info("validateTaskOrder: repaired task_order.json")
		_ = m.planAccess.SaveTaskOrder(orderMap)
	}
}

// GetTasks returns all tasks with their status across all themes.
// Tasks are sorted by persisted order from task_order.json within each drop zone.
func (m *PlanningManager) GetTasks() ([]TaskWithStatus, error) {
	var allTasks []TaskWithStatus

	config, err := m.planAccess.GetBoardConfiguration()
	if err != nil {
		return nil, fmt.Errorf("failed to get board config: %w", err)
	}

	// Collect statuses from board config + archived
	statuses := make([]string, 0, len(config.ColumnDefinitions)+1)
	for _, col := range config.ColumnDefinitions {
		statuses = append(statuses, col.Name)
	}
	statuses = append(statuses, string(access.TaskStatusArchived))

	for _, status := range statuses {
		tasks, err := m.planAccess.GetTasksByStatus(status)
		if err != nil {
			return nil, fmt.Errorf("failed to get tasks for status %s: %w", status, err)
		}

		for _, task := range tasks {
			allTasks = append(allTasks, TaskWithStatus{
				Task:   task,
				Status: status,
			})
		}
	}

	// Sort tasks by persisted order
	orderMap, err := m.planAccess.LoadTaskOrder()
	if err != nil {
		return nil, fmt.Errorf("failed to load task order: %w", err)
	}

	if len(orderMap) > 0 {
		// Build position index: taskID -> position within its drop zone
		posIndex := make(map[string]int)
		for _, ids := range orderMap {
			for i, id := range ids {
				posIndex[id] = i
			}
		}

		tSlug := todoSlugFromConfig(config)
		sort.SliceStable(allTasks, func(i, j int) bool {
			a, b := allTasks[i], allTasks[j]
			zoneA := dropZoneForTask(a.Status, a.Priority, tSlug)
			zoneB := dropZoneForTask(b.Status, b.Priority, tSlug)
			if zoneA != zoneB {
				return zoneA < zoneB // Total order across zones for sort correctness
			}
			posA, okA := posIndex[a.ID]
			posB, okB := posIndex[b.ID]
			if okA && okB {
				return posA < posB
			}
			if okA {
				return true // Known tasks before unknown
			}
			if okB {
				return false
			}
			// Both unknown: sort by CreatedAt
			return a.CreatedAt < b.CreatedAt
		})
	}

	return allTasks, nil
}

// buildTaskInfoList converts all tasks to rule engine TaskInfo for context.
func (m *PlanningManager) buildTaskInfoList() ([]rule_engine.TaskInfo, error) {
	allTasks, err := m.GetTasks()
	if err != nil {
		return nil, err
	}
	infos := make([]rule_engine.TaskInfo, len(allTasks))
	for i, t := range allTasks {
		infos[i] = rule_engine.TaskInfo{
			ID:           t.ID,
			Title:        t.Title,
			Status:    t.Status,
			Priority:  t.Priority,
			CreatedAt: t.CreatedAt,
		}
	}
	return infos, nil
}

// evaluateRules runs the rule engine and returns an error with violation details if not allowed.
func (m *PlanningManager) evaluateRules(event rule_engine.TaskEvent) (*rule_engine.RuleEvaluationResult, error) {
	result, err := m.ruleEngine.EvaluateTaskChange(event)
	if err != nil {
		return nil, err
	}
	if !result.Allowed {
		msgs := make([]string, len(result.Violations))
		for i, v := range result.Violations {
			msgs[i] = v.Message
		}
		return result, fmt.Errorf("rule violation: %s", strings.Join(msgs, "; "))
	}
	return result, nil
}

// CreateTask creates a new task with the given properties.
// Priority must be one of the valid Eisenhower priorities.
// Optional fields: description, tags (comma-separated), promotionDate (YYYY-MM-DD).
func (m *PlanningManager) CreateTask(title, themeId, priority, description, tags, promotionDate string) (*access.Task, error) {
	if !access.IsValidPriority(priority) {
		return nil, fmt.Errorf("invalid priority: %s", priority)
	}

	if promotionDate != "" {
		if _, err := time.Parse("2006-01-02", promotionDate); err != nil {
			return nil, fmt.Errorf("invalid promotionDate format: %s", promotionDate)
		}
	}

	var tagSlice []string
	if tags != "" {
		for _, tag := range strings.Split(tags, ",") {
			if t := strings.TrimSpace(tag); t != "" {
				tagSlice = append(tagSlice, t)
			}
		}
	}

	task := access.Task{
		Title:         title,
		ThemeID:       themeId,
		Priority:      priority,
		Description:   description,
		Tags:          tagSlice,
		PromotionDate: promotionDate,
	}

	// Evaluate rules before creating
	taskInfos, err := m.buildTaskInfoList()
	if err != nil {
		return nil, fmt.Errorf("failed to build task context: %w", err)
	}
	event := rule_engine.TaskEvent{
		Type:     rule_engine.EventTaskCreate,
		Task:     &task,
		AllTasks: taskInfos,
	}
	if _, err := m.evaluateRules(event); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Save task and update task order atomically in a single git commit
	createConfig, _ := m.planAccess.GetBoardConfiguration()
	zone := dropZoneForTask(string(access.TaskStatusTodo), task.Priority, todoSlugFromConfig(createConfig))
	createdTask, err := m.planAccess.SaveTaskWithOrder(task, zone)
	if err != nil {
		return nil, fmt.Errorf("failed to save task: %w", err)
	}

	return createdTask, nil
}

// MoveTask moves a task to a new status (todo, doing, done).
// When positions is non-nil, the provided drop zone ordering is applied atomically
// with the move. When nil, the task is appended to the end of the target zone.
// Returns a MoveTaskResult with violation details on rejection.
func (m *PlanningManager) MoveTask(taskId, newStatus string, positions map[string][]string) (*MoveTaskResult, error) {
	config, err := m.planAccess.GetBoardConfiguration()
	if err != nil {
		return nil, fmt.Errorf("failed to get board config: %w", err)
	}
	validStatus := false
	for _, col := range config.ColumnDefinitions {
		if col.Name == newStatus {
			validStatus = true
			break
		}
	}
	if !validStatus {
		return nil, fmt.Errorf("invalid status %s", newStatus)
	}

	// Get all tasks to find the task being moved and build context
	allTasks, err := m.GetTasks()
	if err != nil {
		return nil, fmt.Errorf("failed to get tasks: %w", err)
	}

	// Find the task being moved (prefer active copy over archived when IDs collide)
	var movingTask *access.Task
	var oldStatus string
	for _, t := range allTasks {
		if t.ID == taskId && t.Status != string(access.TaskStatusArchived) {
			taskCopy := t.Task
			movingTask = &taskCopy
			oldStatus = t.Status
			break
		}
	}
	if movingTask == nil {
		// Fall back to archived if no active copy exists
		for _, t := range allTasks {
			if t.ID == taskId {
				taskCopy := t.Task
				movingTask = &taskCopy
				oldStatus = t.Status
				break
			}
		}
	}
	if movingTask == nil {
		return nil, fmt.Errorf("task %s not found", taskId)
	}

	// Build task info list for rule context
	taskInfos := make([]rule_engine.TaskInfo, len(allTasks))
	for i, t := range allTasks {
		taskInfos[i] = rule_engine.TaskInfo{
			ID:           t.ID,
			Title:        t.Title,
			Status:    t.Status,
			Priority:  t.Priority,
			CreatedAt: t.CreatedAt,
		}
	}

	// Evaluate rules before moving
	event := rule_engine.TaskEvent{
		Type:      rule_engine.EventTaskMove,
		Task:      movingTask,
		OldStatus: oldStatus,
		NewStatus: newStatus,
		AllTasks:  taskInfos,
	}
	result, evalErr := m.ruleEngine.EvaluateTaskChange(event)
	if evalErr != nil {
		return nil, fmt.Errorf("rule evaluation failed: %w", evalErr)
	}
	if !result.Allowed {
		return &MoveTaskResult{
			Success:    false,
			Violations: result.Violations,
		}, nil
	}

	// Perform the move
	if err := m.planAccess.MoveTask(taskId, newStatus); err != nil {
		return nil, fmt.Errorf("failed to move task: %w", err)
	}

	// Update task order: remove from source drop zone, then apply positions or append to target
	moveTodoSlug := todoSlugFromConfig(config)
	sourceZone := dropZoneForTask(oldStatus, movingTask.Priority, moveTodoSlug)

	m.taskOrderMu.Lock()
	orderMap, err := m.planAccess.LoadTaskOrder()
	if err != nil {
		m.taskOrderMu.Unlock()
		return nil, fmt.Errorf("failed to load task order: %w", err)
	}
	orderMap[sourceZone] = removeFromSlice(orderMap[sourceZone], taskId)
	if positions != nil {
		for zone, ids := range positions {
			orderMap[zone] = ids
		}
	} else {
		targetZone := dropZoneForTask(newStatus, movingTask.Priority, moveTodoSlug)
		orderMap[targetZone] = append(orderMap[targetZone], taskId)
	}
	if err := m.planAccess.SaveTaskOrder(orderMap); err != nil {
		m.taskOrderMu.Unlock()
		return nil, fmt.Errorf("failed to save task order: %w", err)
	}
	m.taskOrderMu.Unlock()

	return &MoveTaskResult{Success: true, Positions: orderMap}, nil
}

// UpdateTask updates an existing task.
func (m *PlanningManager) UpdateTask(task access.Task) error {
	if task.ID == "" {
		return fmt.Errorf("task ID cannot be empty")
	}

	// Evaluate rules before updating
	taskInfos, err := m.buildTaskInfoList()
	if err != nil {
		return fmt.Errorf("failed to build task context: %w", err)
	}
	event := rule_engine.TaskEvent{
		Type:     rule_engine.EventTaskUpdate,
		Task:     &task,
		AllTasks: taskInfos,
	}
	if _, err := m.evaluateRules(event); err != nil {
		return fmt.Errorf("%w", err)
	}

	if err := m.planAccess.SaveTask(task); err != nil {
		return fmt.Errorf("failed to update task: %w", err)
	}

	return nil
}

// ProcessPriorityPromotions promotes tasks whose PromotionDate has been reached.
// Tasks with priority "important-not-urgent" are promoted to "important-urgent"
// and their PromotionDate is cleared.
func (m *PlanningManager) ProcessPriorityPromotions() ([]PromotedTask, error) {
	allTasks, err := m.GetTasks()
	if err != nil {
		return nil, fmt.Errorf("failed to get tasks: %w", err)
	}

	now := time.Now()
	today := now.Format("2006-01-02")
	var promoted []PromotedTask

	for _, t := range allTasks {
		if t.PromotionDate == "" {
			continue
		}
		if t.Priority != string(access.PriorityImportantNotUrgent) {
			continue
		}
		if t.PromotionDate > today {
			continue
		}

		// Promote: important-not-urgent -> important-urgent
		updatedTask := t.Task
		oldPriority := updatedTask.Priority
		updatedTask.Priority = string(access.PriorityImportantUrgent)
		updatedTask.PromotionDate = "" // Clear after promotion

		if err := m.planAccess.SaveTask(updatedTask); err != nil {
			return nil, fmt.Errorf("failed to promote task %s: %w", t.ID, err)
		}

		promoted = append(promoted, PromotedTask{
			ID:          t.ID,
			Title:       t.Title,
			OldPriority: oldPriority,
			NewPriority: string(access.PriorityImportantUrgent),
		})
	}

	return promoted, nil
}

// DeleteTask deletes a task by ID.
func (m *PlanningManager) DeleteTask(taskId string) error {
	if taskId == "" {
		return fmt.Errorf("task ID cannot be empty")
	}

	// Delete task and update task order atomically in a single git commit
	if err := m.planAccess.DeleteTaskWithOrder(taskId); err != nil {
		return fmt.Errorf("failed to delete task: %w", err)
	}

	return nil
}

// ArchiveTask archives a done task.
func (m *PlanningManager) ArchiveTask(taskId string) error {
	if taskId == "" {
		return fmt.Errorf("task ID cannot be empty")
	}

	allTasks, err := m.GetTasks()
	if err != nil {
		return fmt.Errorf("failed to get tasks: %w", err)
	}

	// Find the target task and verify it's done
	var targetTask *TaskWithStatus
	for i := range allTasks {
		if allTasks[i].ID == taskId {
			targetTask = &allTasks[i]
			break
		}
	}
	if targetTask == nil {
		return fmt.Errorf("task %s not found", taskId)
	}
	if targetTask.Status != string(access.TaskStatusDone) {
		return fmt.Errorf("task can only be archived when done")
	}

	if err := m.planAccess.ArchiveTask(taskId); err != nil {
		return fmt.Errorf("failed to archive task %s: %w", taskId, err)
	}

	if err := m.removeFromTaskOrder([]string{taskId}); err != nil {
		return fmt.Errorf("%w", err)
	}

	return nil
}

// ArchiveAllDoneTasks archives all done tasks.
func (m *PlanningManager) ArchiveAllDoneTasks() error {
	allTasks, err := m.GetTasks()
	if err != nil {
		return fmt.Errorf("failed to get tasks: %w", err)
	}

	for _, t := range allTasks {
		if t.Status != string(access.TaskStatusDone) {
			continue
		}
		if err := m.ArchiveTask(t.ID); err != nil {
			return fmt.Errorf("%w", err)
		}
	}

	return nil
}

// RestoreTask restores an archived task to done.
func (m *PlanningManager) RestoreTask(taskId string) error {
	if taskId == "" {
		return fmt.Errorf("task ID cannot be empty")
	}

	allTasks, err := m.GetTasks()
	if err != nil {
		return fmt.Errorf("failed to get tasks: %w", err)
	}

	// Find the target task and verify it's archived
	var targetTask *TaskWithStatus
	for i := range allTasks {
		if allTasks[i].ID == taskId {
			targetTask = &allTasks[i]
			break
		}
	}
	if targetTask == nil {
		return fmt.Errorf("task %s not found", taskId)
	}
	if targetTask.Status != string(access.TaskStatusArchived) {
		return fmt.Errorf("task can only be restored from archive")
	}

	if err := m.planAccess.RestoreTask(taskId); err != nil {
		return fmt.Errorf("failed to restore task %s: %w", taskId, err)
	}

	// Add the restored task to the "done" zone in task_order.json
	boardConfig, err := m.planAccess.GetBoardConfiguration()
	if err != nil || boardConfig == nil {
		boardConfig = access.DefaultBoardConfiguration()
	}
	targetZone := dropZoneForTask(string(access.TaskStatusDone), targetTask.Priority, todoSlugFromConfig(boardConfig))
	m.taskOrderMu.Lock()
	orderMap, err := m.planAccess.LoadTaskOrder()
	if err != nil {
		m.taskOrderMu.Unlock()
		return fmt.Errorf("failed to load task order: %w", err)
	}
	orderMap[targetZone] = append(orderMap[targetZone], taskId)
	if err := m.planAccess.SaveTaskOrder(orderMap); err != nil {
		m.taskOrderMu.Unlock()
		return fmt.Errorf("failed to save task order: %w", err)
	}
	m.taskOrderMu.Unlock()

	return nil
}

// removeFromTaskOrder removes the given task IDs from all drop zones in the task order.
func (m *PlanningManager) removeFromTaskOrder(taskIDs []string) error {
	m.taskOrderMu.Lock()
	orderMap, err := m.planAccess.LoadTaskOrder()
	if err != nil {
		m.taskOrderMu.Unlock()
		return fmt.Errorf("failed to load task order: %w", err)
	}

	idSet := make(map[string]bool, len(taskIDs))
	for _, id := range taskIDs {
		idSet[id] = true
	}

	changed := false
	for zone, ids := range orderMap {
		filtered := make([]string, 0, len(ids))
		for _, id := range ids {
			if !idSet[id] {
				filtered = append(filtered, id)
			}
		}
		if len(filtered) != len(ids) {
			orderMap[zone] = filtered
			changed = true
		}
	}

	if changed {
		if err := m.planAccess.SaveTaskOrder(orderMap); err != nil {
			m.taskOrderMu.Unlock()
			return fmt.Errorf("failed to save task order: %w", err)
		}
	}
	m.taskOrderMu.Unlock()

	return nil
}

// ReorderTasks accepts proposed positions for one or more drop zones,
// merges them into the full order map, persists, and returns authoritative positions.
func (m *PlanningManager) ReorderTasks(positions map[string][]string) (*ReorderResult, error) {
	m.taskOrderMu.Lock()
	orderMap, err := m.planAccess.LoadTaskOrder()
	if err != nil {
		m.taskOrderMu.Unlock()
		return nil, fmt.Errorf("failed to load task order: %w", err)
	}

	// Merge proposed positions into the full order map
	for zone, ids := range positions {
		orderMap[zone] = ids
	}

	if err := m.planAccess.SaveTaskOrder(orderMap); err != nil {
		m.taskOrderMu.Unlock()
		return nil, fmt.Errorf("failed to save task order: %w", err)
	}
	m.taskOrderMu.Unlock()

	return &ReorderResult{Success: true, Positions: orderMap}, nil
}

// removeFromSlice returns a new slice with the first occurrence of val removed.
func removeFromSlice(s []string, val string) []string {
	result := make([]string, 0, len(s))
	for _, v := range s {
		if v != val {
			result = append(result, v)
		}
	}
	return result
}

// GetBoardConfiguration returns the board configuration.
func (m *PlanningManager) GetBoardConfiguration() (*access.BoardConfiguration, error) {
	config, err := m.planAccess.GetBoardConfiguration()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}
	return config, nil
}

// reservedSlugs are column slugs that cannot be used for custom columns.
var reservedSlugs = map[string]bool{
	"archived": true,
}

// AddColumn adds a new doing-type column after the specified column.
func (m *PlanningManager) AddColumn(title, insertAfterSlug string) (*access.BoardConfiguration, error) {
	slug := access.Slugify(title)
	if slug == "" {
		return nil, fmt.Errorf("column name must contain at least one letter or number")
	}
	if reservedSlugs[slug] {
		return nil, fmt.Errorf("the name %q is reserved", slug)
	}

	config, err := m.planAccess.GetBoardConfiguration()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Validate slug uniqueness
	for _, col := range config.ColumnDefinitions {
		if col.Name == slug {
			return nil, fmt.Errorf("column %q already exists", slug)
		}
	}

	// Find insertion position
	insertIdx := -1
	for i, col := range config.ColumnDefinitions {
		if col.Name == insertAfterSlug {
			insertIdx = i + 1
			break
		}
	}
	if insertIdx < 0 {
		return nil, fmt.Errorf("column %q not found", insertAfterSlug)
	}

	// Validate: cannot insert before first (todo) or after last (done)
	if insertIdx <= 0 {
		return nil, fmt.Errorf("cannot insert before the first column")
	}
	if insertIdx >= len(config.ColumnDefinitions) && config.ColumnDefinitions[len(config.ColumnDefinitions)-1].Type == access.ColumnTypeDone {
		// insertIdx points past the last column, which is done-type — insert before done
		return nil, fmt.Errorf("cannot insert after the last column")
	}

	newCol := access.ColumnDefinition{
		Name:  slug,
		Title: strings.TrimSpace(title),
		Type:  access.ColumnTypeDoing,
	}

	// Insert at position
	config.ColumnDefinitions = append(config.ColumnDefinitions[:insertIdx],
		append([]access.ColumnDefinition{newCol}, config.ColumnDefinitions[insertIdx:]...)...)

	// Create directory
	if err := m.planAccess.EnsureStatusDirectory(slug); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Save config
	if err := m.planAccess.SaveBoardConfiguration(config); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	if err := m.planAccess.CommitAll(fmt.Sprintf("Add column: %s", strings.TrimSpace(title))); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	return config, nil
}

// RemoveColumn removes a doing-type column that has no tasks.
func (m *PlanningManager) RemoveColumn(slug string) (*access.BoardConfiguration, error) {
	config, err := m.planAccess.GetBoardConfiguration()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Find column and validate type
	colIdx := -1
	for i, col := range config.ColumnDefinitions {
		if col.Name == slug {
			colIdx = i
			break
		}
	}
	if colIdx < 0 {
		return nil, fmt.Errorf("column %q not found", slug)
	}
	if config.ColumnDefinitions[colIdx].Type != access.ColumnTypeDoing {
		return nil, fmt.Errorf("only custom columns can be removed")
	}

	// Check no tasks in column
	tasks, err := m.planAccess.GetTasksByStatus(slug)
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}
	if len(tasks) > 0 {
		return nil, fmt.Errorf("cannot delete column %q: it still has %d task(s) — move or archive them first", config.ColumnDefinitions[colIdx].Title, len(tasks))
	}

	// Remove directory
	if err := m.planAccess.RemoveStatusDirectory(slug); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Clean task order entries
	m.taskOrderMu.Lock()
	orderMap, loadErr := m.planAccess.LoadTaskOrder()
	if loadErr == nil {
		if _, exists := orderMap[slug]; exists {
			delete(orderMap, slug)
			_ = m.planAccess.WriteTaskOrder(orderMap)
		}
	}
	m.taskOrderMu.Unlock()

	// Update config
	config.ColumnDefinitions = append(config.ColumnDefinitions[:colIdx], config.ColumnDefinitions[colIdx+1:]...)
	if err := m.planAccess.SaveBoardConfiguration(config); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	if err := m.planAccess.CommitAll(fmt.Sprintf("Remove column: %s", slug)); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	return config, nil
}

// RenameColumn renames a column, migrating its directory and updating task order.
func (m *PlanningManager) RenameColumn(oldSlug, newTitle string) (*access.BoardConfiguration, error) {
	newSlug := access.Slugify(newTitle)
	if newSlug == "" {
		return nil, fmt.Errorf("column name must contain at least one letter or number")
	}
	if reservedSlugs[newSlug] {
		return nil, fmt.Errorf("the name %q is reserved", newSlug)
	}
	if oldSlug == newSlug {
		// Only title change, no slug change — just update the title
		config, err := m.planAccess.GetBoardConfiguration()
		if err != nil {
			return nil, fmt.Errorf("%w", err)
		}
		found := false
		for i, col := range config.ColumnDefinitions {
			if col.Name == oldSlug {
				config.ColumnDefinitions[i].Title = strings.TrimSpace(newTitle)
				found = true
				break
			}
		}
		if !found {
			return nil, fmt.Errorf("column %q not found", oldSlug)
		}
		if err := m.planAccess.SaveBoardConfiguration(config); err != nil {
			return nil, fmt.Errorf("%w", err)
		}
		if err := m.planAccess.CommitAll(fmt.Sprintf("Rename column title: %s", strings.TrimSpace(newTitle))); err != nil {
			return nil, fmt.Errorf("%w", err)
		}
		return config, nil
	}

	config, err := m.planAccess.GetBoardConfiguration()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Validate old column exists and new slug is unique
	colIdx := -1
	for i, col := range config.ColumnDefinitions {
		if col.Name == oldSlug {
			colIdx = i
		}
		if col.Name == newSlug {
			return nil, fmt.Errorf("column %q already exists", newSlug)
		}
	}
	if colIdx < 0 {
		return nil, fmt.Errorf("column %q not found", oldSlug)
	}

	// Rename directory
	if err := m.planAccess.RenameStatusDirectory(oldSlug, newSlug); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Update task_order.json keys
	m.taskOrderMu.Lock()
	orderMap, loadErr := m.planAccess.LoadTaskOrder()
	if loadErr == nil {
		if ids, exists := orderMap[oldSlug]; exists {
			orderMap[newSlug] = ids
			delete(orderMap, oldSlug)
			_ = m.planAccess.WriteTaskOrder(orderMap)
		}
	}
	m.taskOrderMu.Unlock()

	// Update config
	config.ColumnDefinitions[colIdx].Name = newSlug
	config.ColumnDefinitions[colIdx].Title = strings.TrimSpace(newTitle)
	if err := m.planAccess.SaveBoardConfiguration(config); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	if err := m.planAccess.CommitAll(fmt.Sprintf("Rename column: %s -> %s", oldSlug, strings.TrimSpace(newTitle))); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	return config, nil
}

// ReorderColumns reorders columns while enforcing bookend constraints.
func (m *PlanningManager) ReorderColumns(slugs []string) (*access.BoardConfiguration, error) {
	config, err := m.planAccess.GetBoardConfiguration()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	if len(slugs) != len(config.ColumnDefinitions) {
		return nil, fmt.Errorf("expected %d columns, got %d", len(config.ColumnDefinitions), len(slugs))
	}

	// Build lookup
	colMap := make(map[string]access.ColumnDefinition, len(config.ColumnDefinitions))
	for _, col := range config.ColumnDefinitions {
		colMap[col.Name] = col
	}

	// Validate: all slugs present, no duplicates
	seen := make(map[string]bool, len(slugs))
	reordered := make([]access.ColumnDefinition, 0, len(slugs))
	for _, slug := range slugs {
		if seen[slug] {
			return nil, fmt.Errorf("duplicate column %q", slug)
		}
		seen[slug] = true
		col, ok := colMap[slug]
		if !ok {
			return nil, fmt.Errorf("column %q not found", slug)
		}
		reordered = append(reordered, col)
	}

	// Validate bookends: first must be todo, last must be done
	if reordered[0].Type != access.ColumnTypeTodo {
		return nil, fmt.Errorf("first column cannot be moved")
	}
	if reordered[len(reordered)-1].Type != access.ColumnTypeDone {
		return nil, fmt.Errorf("last column cannot be moved")
	}

	config.ColumnDefinitions = reordered
	if err := m.planAccess.SaveBoardConfiguration(config); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	if err := m.planAccess.CommitAll("Reorder columns"); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	return config, nil
}

// SuggestThemeAbbreviation suggests a unique abbreviation for a theme name.
func (m *PlanningManager) SuggestThemeAbbreviation(name string) (string, error) {
	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return "", fmt.Errorf("%w", err)
	}
	return access.SuggestAbbreviation(name, themes), nil
}

// LoadNavigationContext retrieves the saved navigation context.
// Returns a default context if none is saved.
func (m *PlanningManager) LoadNavigationContext() (*NavigationContext, error) {
	ctx, err := m.planAccess.LoadNavigationContext()
	if err != nil {
		// Return default context on error
		return &NavigationContext{
			CurrentView: "okr",
		}, nil
	}
	if ctx == nil {
		return &NavigationContext{
			CurrentView: "okr",
		}, nil
	}

	return &NavigationContext{
		CurrentView:       ctx.CurrentView,
		CurrentItem:       ctx.CurrentItem,
		FilterThemeID:     ctx.FilterThemeID,
		LastAccessed:      ctx.LastAccessed,
		ShowCompleted:     ctx.ShowCompleted,
		ShowArchived:      ctx.ShowArchived,
		ShowArchivedTasks: ctx.ShowArchivedTasks,
		ExpandedOkrIds:    ctx.ExpandedOkrIds,
		FilterTagIDs:      ctx.FilterTagIDs,
		VisionCollapsed:   ctx.VisionCollapsed,
	}, nil
}

// SaveNavigationContext persists the current navigation context.
func (m *PlanningManager) SaveNavigationContext(ctx NavigationContext) error {
	accessCtx := access.NavigationContext{
		CurrentView:       ctx.CurrentView,
		CurrentItem:       ctx.CurrentItem,
		FilterThemeID:     ctx.FilterThemeID,
		LastAccessed:      ctx.LastAccessed,
		ShowCompleted:     ctx.ShowCompleted,
		ShowArchived:      ctx.ShowArchived,
		ShowArchivedTasks: ctx.ShowArchivedTasks,
		ExpandedOkrIds:    ctx.ExpandedOkrIds,
		FilterTagIDs:      ctx.FilterTagIDs,
		VisionCollapsed:   ctx.VisionCollapsed,
	}

	if err := m.planAccess.SaveNavigationContext(accessCtx); err != nil {
		return fmt.Errorf("%w", err)
	}

	m.navigationContext = &ctx
	return nil
}

// LoadTaskDrafts retrieves saved task drafts.
func (m *PlanningManager) LoadTaskDrafts() (json.RawMessage, error) {
	return m.planAccess.LoadTaskDrafts()
}

// SaveTaskDrafts persists task drafts.
func (m *PlanningManager) SaveTaskDrafts(data json.RawMessage) error {
	return m.planAccess.SaveTaskDrafts(data)
}

// GetPersonalVision retrieves the saved personal vision.
func (m *PlanningManager) GetPersonalVision() (*access.PersonalVision, error) {
	return m.planAccess.LoadVision()
}

// SavePersonalVision saves the personal mission and vision statements.
func (m *PlanningManager) SavePersonalVision(mission, vision string) error {
	v := &access.PersonalVision{
		Mission:   mission,
		Vision:    vision,
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	return m.planAccess.SaveVision(v)
}

// computeKRProgress computes the progress percentage of a single key result.
// Returns -1 if the KR is untracked (targetValue == 0).
func computeKRProgress(kr access.KeyResult) float64 {
	if kr.TargetValue == 0 {
		return -1
	}
	rangeVal := float64(kr.TargetValue - kr.StartValue)
	if rangeVal == 0 {
		return 0
	}
	progress := float64(kr.CurrentValue-kr.StartValue) / rangeVal * 100
	if progress < 0 {
		return 0
	}
	if progress > 100 {
		return 100
	}
	return progress
}

// isActiveOKRStatus returns true if the status is active (empty or "active").
func isActiveOKRStatus(status string) bool {
	return status == "" || status == "active"
}

// computeObjectiveProgress recursively computes progress for an objective
// and collects all nested objective progress entries.
func computeObjectiveProgress(obj access.Objective) (float64, []ObjectiveProgress) {
	var allObjProgress []ObjectiveProgress
	var progressValues []float64

	// Collect progress from active, tracked KRs
	for _, kr := range obj.KeyResults {
		if !isActiveOKRStatus(kr.Status) {
			continue
		}
		p := computeKRProgress(kr)
		if p >= 0 {
			progressValues = append(progressValues, p)
		}
	}

	// Collect progress from active child objectives
	for _, child := range obj.Objectives {
		if !isActiveOKRStatus(child.Status) {
			continue
		}
		childProgress, childObjProgress := computeObjectiveProgress(child)
		allObjProgress = append(allObjProgress, childObjProgress...)
		if childProgress >= 0 {
			progressValues = append(progressValues, childProgress)
		}
	}

	var progress float64
	if len(progressValues) == 0 {
		progress = -1
	} else {
		var sum float64
		for _, v := range progressValues {
			sum += v
		}
		progress = sum / float64(len(progressValues))
	}

	allObjProgress = append(allObjProgress, ObjectiveProgress{
		ObjectiveID: obj.ID,
		Progress:    progress,
	})

	return progress, allObjProgress
}

// GetAllThemeProgress computes progress for all themes and their objectives.
func (m *PlanningManager) GetAllThemeProgress() ([]ThemeProgress, error) {
	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return nil, err
	}

	result := make([]ThemeProgress, 0, len(themes))
	for _, theme := range themes {
		var themeObjProgress []ObjectiveProgress
		var topLevelProgressValues []float64

		for _, obj := range theme.Objectives {
			if !isActiveOKRStatus(obj.Status) {
				continue
			}
			objProgress, nested := computeObjectiveProgress(obj)
			themeObjProgress = append(themeObjProgress, nested...)
			if objProgress >= 0 {
				topLevelProgressValues = append(topLevelProgressValues, objProgress)
			}
		}

		var themeProgress float64
		if len(topLevelProgressValues) == 0 {
			themeProgress = -1
		} else {
			var sum float64
			for _, v := range topLevelProgressValues {
				sum += v
			}
			themeProgress = sum / float64(len(topLevelProgressValues))
		}

		if themeObjProgress == nil {
			themeObjProgress = []ObjectiveProgress{}
		}

		result = append(result, ThemeProgress{
			ThemeID:    theme.ID,
			Progress:   themeProgress,
			Objectives: themeObjProgress,
		})
	}

	return result, nil
}
