// Package managers provides business logic components for the Bearing application.
// This package contains manager components that implement the iDesign methodology,
// orchestrating access components and implementing business rules.
package managers

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/rkn/bearing/internal/access"
	"github.com/rkn/bearing/internal/engines/rule_engine"
)

// TaskWithStatus represents a task with its current status.
type TaskWithStatus struct {
	access.Task
	Status     string   `json:"status"`
	SubtaskIDs []string `json:"subtaskIds,omitempty"`
}

// NavigationContext stores the user's navigation state for persistence.
type NavigationContext struct {
	CurrentView       string   `json:"currentView"`
	CurrentItem       string   `json:"currentItem"`
	FilterThemeID     string   `json:"filterThemeId"`
	FilterDate        string   `json:"filterDate"`
	LastAccessed      string   `json:"lastAccessed"`
	ShowCompleted     bool     `json:"showCompleted,omitempty"`
	ShowArchived      bool     `json:"showArchived,omitempty"`
	ShowArchivedTasks bool     `json:"showArchivedTasks,omitempty"`
	ExpandedOkrIds    []string `json:"expandedOkrIds,omitempty"`
	FilterTagIDs      []string `json:"filterTagIds,omitempty"`
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
	UpdateObjective(objectiveId, title string) error
	DeleteObjective(objectiveId string) error

	// Key Results — parentObjectiveId / keyResultId found by tree-walking
	CreateKeyResult(parentObjectiveId, description string, startValue, targetValue int) (*access.KeyResult, error)
	UpdateKeyResult(keyResultId, description string) error
	UpdateKeyResultProgress(keyResultId string, currentValue int) error
	DeleteKeyResult(keyResultId string) error

	// OKR Status — set lifecycle status (active/completed/archived)
	SetObjectiveStatus(objectiveId, status string) error
	SetKeyResultStatus(keyResultId, status string) error

	// Calendar
	GetYearFocus(year int) ([]access.DayFocus, error)
	SaveDayFocus(day access.DayFocus) error
	ClearDayFocus(date string) error

	// Tasks
	GetTasks() ([]TaskWithStatus, error)
	CreateTask(title, themeId, dayDate, priority, description, tags, dueDate, promotionDate string) (*access.Task, error)
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

// PlanningManager implements IPlanningManager with business logic.
type PlanningManager struct {
	planAccess        access.IPlanAccess
	ruleEngine        rule_engine.IRuleEngine
	navigationContext *NavigationContext
}

// NewPlanningManager creates a new PlanningManager instance.
func NewPlanningManager(planAccess access.IPlanAccess) (*PlanningManager, error) {
	if planAccess == nil {
		return nil, fmt.Errorf("PlanningManager.New: planAccess cannot be nil")
	}

	engine := rule_engine.NewRuleEngine(rule_engine.DefaultRules())

	return &PlanningManager{
		planAccess: planAccess,
		ruleEngine: engine,
	}, nil
}

// GetThemes returns all life themes.
func (m *PlanningManager) GetThemes() ([]access.LifeTheme, error) {
	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.GetThemes: %w", err)
	}
	return themes, nil
}

// SaveTheme saves or updates a life theme.
func (m *PlanningManager) SaveTheme(theme access.LifeTheme) error {
	if err := m.planAccess.SaveTheme(theme); err != nil {
		return fmt.Errorf("PlanningManager.SaveTheme: %w", err)
	}
	return nil
}

// DeleteTheme deletes a life theme by ID.
func (m *PlanningManager) DeleteTheme(id string) error {
	if id == "" {
		return fmt.Errorf("PlanningManager.DeleteTheme: id cannot be empty")
	}
	if err := m.planAccess.DeleteTheme(id); err != nil {
		return fmt.Errorf("PlanningManager.DeleteTheme: %w", err)
	}
	return nil
}

// CreateTheme creates a new life theme with the given name and color.
// Returns the created theme with its generated ID.
func (m *PlanningManager) CreateTheme(name, color string) (*access.LifeTheme, error) {
	if name == "" {
		return nil, fmt.Errorf("PlanningManager.CreateTheme: name cannot be empty")
	}
	if color == "" {
		return nil, fmt.Errorf("PlanningManager.CreateTheme: color cannot be empty")
	}

	theme := access.LifeTheme{
		Name:       name,
		Color:      color,
		Objectives: []access.Objective{},
	}

	if err := m.planAccess.SaveTheme(theme); err != nil {
		return nil, fmt.Errorf("PlanningManager.CreateTheme: %w", err)
	}

	// Retrieve the saved theme to get the generated ID
	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.CreateTheme: failed to retrieve created theme: %w", err)
	}

	// Find the theme we just created (the one with matching name and color)
	for i := range themes {
		if themes[i].Name == name && themes[i].Color == color {
			return &themes[i], nil
		}
	}

	return nil, fmt.Errorf("PlanningManager.CreateTheme: theme was created but could not be retrieved")
}

// UpdateTheme updates an existing life theme.
func (m *PlanningManager) UpdateTheme(theme access.LifeTheme) error {
	if theme.ID == "" {
		return fmt.Errorf("PlanningManager.UpdateTheme: theme ID cannot be empty")
	}

	if err := m.planAccess.SaveTheme(theme); err != nil {
		return fmt.Errorf("PlanningManager.UpdateTheme: %w", err)
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
		return nil, fmt.Errorf("PlanningManager.CreateObjective: parentId cannot be empty")
	}
	if title == "" {
		return nil, fmt.Errorf("PlanningManager.CreateObjective: title cannot be empty")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.CreateObjective: %w", err)
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
		return nil, fmt.Errorf("PlanningManager.CreateObjective: parent with ID %s not found", parentId)
	}

	if err := m.planAccess.SaveTheme(*targetTheme); err != nil {
		return nil, fmt.Errorf("PlanningManager.CreateObjective: %w", err)
	}

	// Retrieve updated theme to get the generated objective ID
	themes, err = m.planAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.CreateObjective: failed to retrieve updated theme: %w", err)
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

	return nil, fmt.Errorf("PlanningManager.CreateObjective: objective was created but could not be retrieved")
}

// UpdateObjective finds an objective by ID anywhere in the tree and updates its title.
func (m *PlanningManager) UpdateObjective(objectiveId, title string) error {
	if objectiveId == "" {
		return fmt.Errorf("PlanningManager.UpdateObjective: objectiveId cannot be empty")
	}
	if title == "" {
		return fmt.Errorf("PlanningManager.UpdateObjective: title cannot be empty")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("PlanningManager.UpdateObjective: %w", err)
	}

	for i := range themes {
		if obj := findObjectiveByID(themes[i].Objectives, objectiveId); obj != nil {
			obj.Title = title
			if err := m.planAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("PlanningManager.UpdateObjective: %w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("PlanningManager.UpdateObjective: objective with ID %s not found", objectiveId)
}

// DeleteObjective finds an objective by ID anywhere in the tree and removes it.
// Children are removed automatically since they are nested in the struct.
func (m *PlanningManager) DeleteObjective(objectiveId string) error {
	if objectiveId == "" {
		return fmt.Errorf("PlanningManager.DeleteObjective: objectiveId cannot be empty")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("PlanningManager.DeleteObjective: %w", err)
	}

	for i := range themes {
		if parentSlice, idx := findObjectiveParent(&themes[i].Objectives, objectiveId); parentSlice != nil {
			*parentSlice = append((*parentSlice)[:idx], (*parentSlice)[idx+1:]...)
			if err := m.planAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("PlanningManager.DeleteObjective: %w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("PlanningManager.DeleteObjective: objective with ID %s not found", objectiveId)
}

// CreateKeyResult creates a new key result under an objective found anywhere in the tree.
// parentObjectiveId is the objective ID at any depth.
func (m *PlanningManager) CreateKeyResult(parentObjectiveId, description string, startValue, targetValue int) (*access.KeyResult, error) {
	if parentObjectiveId == "" {
		return nil, fmt.Errorf("PlanningManager.CreateKeyResult: parentObjectiveId cannot be empty")
	}
	if description == "" {
		return nil, fmt.Errorf("PlanningManager.CreateKeyResult: description cannot be empty")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.CreateKeyResult: %w", err)
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
		return nil, fmt.Errorf("PlanningManager.CreateKeyResult: objective with ID %s not found", parentObjectiveId)
	}

	if err := m.planAccess.SaveTheme(*targetTheme); err != nil {
		return nil, fmt.Errorf("PlanningManager.CreateKeyResult: %w", err)
	}

	// Retrieve updated theme to get the generated key result ID
	themes, err = m.planAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.CreateKeyResult: failed to retrieve updated theme: %w", err)
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

	return nil, fmt.Errorf("PlanningManager.CreateKeyResult: key result was created but could not be retrieved")
}

// UpdateKeyResult finds a key result by ID anywhere in the tree and updates its description.
func (m *PlanningManager) UpdateKeyResult(keyResultId, description string) error {
	if keyResultId == "" {
		return fmt.Errorf("PlanningManager.UpdateKeyResult: keyResultId cannot be empty")
	}
	if description == "" {
		return fmt.Errorf("PlanningManager.UpdateKeyResult: description cannot be empty")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("PlanningManager.UpdateKeyResult: %w", err)
	}

	for i := range themes {
		if obj, krIdx := findKeyResultParent(themes[i].Objectives, keyResultId); obj != nil {
			obj.KeyResults[krIdx].Description = description
			if err := m.planAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("PlanningManager.UpdateKeyResult: %w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("PlanningManager.UpdateKeyResult: key result with ID %s not found", keyResultId)
}

// UpdateKeyResultProgress finds a key result by ID anywhere in the tree and updates its currentValue.
func (m *PlanningManager) UpdateKeyResultProgress(keyResultId string, currentValue int) error {
	if keyResultId == "" {
		return fmt.Errorf("PlanningManager.UpdateKeyResultProgress: keyResultId cannot be empty")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("PlanningManager.UpdateKeyResultProgress: %w", err)
	}

	for i := range themes {
		if obj, krIdx := findKeyResultParent(themes[i].Objectives, keyResultId); obj != nil {
			obj.KeyResults[krIdx].CurrentValue = currentValue
			if err := m.planAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("PlanningManager.UpdateKeyResultProgress: %w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("PlanningManager.UpdateKeyResultProgress: key result with ID %s not found", keyResultId)
}

// DeleteKeyResult finds a key result by ID anywhere in the tree and removes it.
func (m *PlanningManager) DeleteKeyResult(keyResultId string) error {
	if keyResultId == "" {
		return fmt.Errorf("PlanningManager.DeleteKeyResult: keyResultId cannot be empty")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("PlanningManager.DeleteKeyResult: %w", err)
	}

	for i := range themes {
		if obj, krIdx := findKeyResultParent(themes[i].Objectives, keyResultId); obj != nil {
			obj.KeyResults = append(obj.KeyResults[:krIdx], obj.KeyResults[krIdx+1:]...)
			if err := m.planAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("PlanningManager.DeleteKeyResult: %w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("PlanningManager.DeleteKeyResult: key result with ID %s not found", keyResultId)
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
		return fmt.Errorf("PlanningManager.SetObjectiveStatus: objectiveId cannot be empty")
	}
	if status == "" {
		return fmt.Errorf("PlanningManager.SetObjectiveStatus: status cannot be empty")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("PlanningManager.SetObjectiveStatus: %w", err)
	}

	for i := range themes {
		if obj := findObjectiveByID(themes[i].Objectives, objectiveId); obj != nil {
			if err := validateOKRStatusTransition(obj.Status, status); err != nil {
				return fmt.Errorf("PlanningManager.SetObjectiveStatus: %w", err)
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
					return fmt.Errorf("PlanningManager.SetObjectiveStatus: cannot complete objective %s; active children: %v", objectiveId, incompleteItems)
				}
			}

			obj.Status = status
			if err := m.planAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("PlanningManager.SetObjectiveStatus: %w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("PlanningManager.SetObjectiveStatus: objective with ID %s not found", objectiveId)
}

// SetKeyResultStatus sets the lifecycle status of a key result.
func (m *PlanningManager) SetKeyResultStatus(keyResultId, status string) error {
	if keyResultId == "" {
		return fmt.Errorf("PlanningManager.SetKeyResultStatus: keyResultId cannot be empty")
	}
	if status == "" {
		return fmt.Errorf("PlanningManager.SetKeyResultStatus: status cannot be empty")
	}

	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("PlanningManager.SetKeyResultStatus: %w", err)
	}

	for i := range themes {
		if obj, krIdx := findKeyResultParent(themes[i].Objectives, keyResultId); obj != nil {
			kr := &obj.KeyResults[krIdx]
			if err := validateOKRStatusTransition(kr.Status, status); err != nil {
				return fmt.Errorf("PlanningManager.SetKeyResultStatus: %w", err)
			}

			kr.Status = status
			if err := m.planAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("PlanningManager.SetKeyResultStatus: %w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("PlanningManager.SetKeyResultStatus: key result with ID %s not found", keyResultId)
}

// GetYearFocus returns all day focus entries for a specific year.
func (m *PlanningManager) GetYearFocus(year int) ([]access.DayFocus, error) {
	if year < 1900 || year > 9999 {
		return nil, fmt.Errorf("PlanningManager.GetYearFocus: invalid year %d", year)
	}
	entries, err := m.planAccess.GetYearFocus(year)
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.GetYearFocus: %w", err)
	}
	return entries, nil
}

// SaveDayFocus saves or updates a day focus entry.
func (m *PlanningManager) SaveDayFocus(day access.DayFocus) error {
	if day.Date == "" {
		return fmt.Errorf("PlanningManager.SaveDayFocus: date cannot be empty")
	}
	if err := m.planAccess.SaveDayFocus(day); err != nil {
		return fmt.Errorf("PlanningManager.SaveDayFocus: %w", err)
	}
	return nil
}

// ClearDayFocus removes a day focus entry by setting empty theme ID.
func (m *PlanningManager) ClearDayFocus(date string) error {
	if date == "" {
		return fmt.Errorf("PlanningManager.ClearDayFocus: date cannot be empty")
	}

	// Get the existing entry to check if it exists
	existing, err := m.planAccess.GetDayFocus(date)
	if err != nil {
		return fmt.Errorf("PlanningManager.ClearDayFocus: %w", err)
	}

	// If there's no existing entry, nothing to clear
	if existing == nil {
		return nil
	}

	// Save with empty theme ID to clear it
	cleared := access.DayFocus{
		Date:    date,
		ThemeID: "",
		Notes:   existing.Notes, // Preserve notes
		Text:    existing.Text,  // Preserve text
	}

	if err := m.planAccess.SaveDayFocus(cleared); err != nil {
		return fmt.Errorf("PlanningManager.ClearDayFocus: %w", err)
	}

	return nil
}

// dropZoneForTask returns the drop zone ID for a task based on its status and priority.
// Todo tasks use their priority section name; doing/done tasks use the column name.
func dropZoneForTask(status, priority string) string {
	if status == string(access.TaskStatusTodo) && priority != "" {
		return priority
	}
	return status
}

// GetTasks returns all tasks with their status across all themes.
// Tasks are sorted by persisted order from task_order.json within each drop zone.
// SubtaskIDs are computed at runtime by scanning for tasks with matching ParentTaskID.
func (m *PlanningManager) GetTasks() ([]TaskWithStatus, error) {
	var allTasks []TaskWithStatus

	for _, status := range access.AllTaskStatuses() {
		tasks, err := m.planAccess.GetTasksByStatus(string(status))
		if err != nil {
			return nil, fmt.Errorf("PlanningManager.GetTasks: failed to get tasks for status %s: %w", status, err)
		}

		for _, task := range tasks {
			allTasks = append(allTasks, TaskWithStatus{
				Task:   task,
				Status: string(status),
			})
		}
	}

	// Sort tasks by persisted order
	orderMap, err := m.planAccess.LoadTaskOrder()
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.GetTasks: failed to load task order: %w", err)
	}

	if len(orderMap) > 0 {
		// Build position index: taskID -> position within its drop zone
		posIndex := make(map[string]int)
		for _, ids := range orderMap {
			for i, id := range ids {
				posIndex[id] = i
			}
		}

		sort.SliceStable(allTasks, func(i, j int) bool {
			a, b := allTasks[i], allTasks[j]
			zoneA := dropZoneForTask(a.Status, a.Priority)
			zoneB := dropZoneForTask(b.Status, b.Priority)
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

	// Compute SubtaskIDs: for each task, find children whose ParentTaskID matches
	parentToChildren := make(map[string][]string)
	for _, t := range allTasks {
		if t.ParentTaskID != nil && *t.ParentTaskID != "" {
			parentToChildren[*t.ParentTaskID] = append(parentToChildren[*t.ParentTaskID], t.ID)
		}
	}
	for i := range allTasks {
		if children, ok := parentToChildren[allTasks[i].ID]; ok {
			allTasks[i].SubtaskIDs = children
		}
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
			Status:       t.Status,
			Priority:     t.Priority,
			ParentTaskID: t.ParentTaskID,
			CreatedAt:    t.CreatedAt,
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
// Optional fields: description, tags (comma-separated), dueDate (YYYY-MM-DD), promotionDate (YYYY-MM-DD).
func (m *PlanningManager) CreateTask(title, themeId, dayDate, priority, description, tags, dueDate, promotionDate string) (*access.Task, error) {
	if !access.IsValidPriority(priority) {
		return nil, fmt.Errorf("PlanningManager.CreateTask: invalid priority: %s", priority)
	}

	if dueDate != "" {
		if _, err := time.Parse("2006-01-02", dueDate); err != nil {
			return nil, fmt.Errorf("PlanningManager.CreateTask: invalid dueDate format: %s", dueDate)
		}
	}
	if promotionDate != "" {
		if _, err := time.Parse("2006-01-02", promotionDate); err != nil {
			return nil, fmt.Errorf("PlanningManager.CreateTask: invalid promotionDate format: %s", promotionDate)
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
		DayDate:       dayDate,
		Priority:      priority,
		Description:   description,
		Tags:          tagSlice,
		DueDate:       dueDate,
		PromotionDate: promotionDate,
	}

	// Evaluate rules before creating
	taskInfos, err := m.buildTaskInfoList()
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.CreateTask: failed to build task context: %w", err)
	}
	event := rule_engine.TaskEvent{
		Type:     rule_engine.EventTaskCreate,
		Task:     &task,
		AllTasks: taskInfos,
	}
	if _, err := m.evaluateRules(event); err != nil {
		return nil, fmt.Errorf("PlanningManager.CreateTask: %w", err)
	}

	// Save task and update task order atomically in a single git commit
	zone := dropZoneForTask(string(access.TaskStatusTodo), task.Priority)
	createdTask, err := m.planAccess.SaveTaskWithOrder(task, zone)
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.CreateTask: failed to save task: %w", err)
	}

	return createdTask, nil
}

// MoveTask moves a task to a new status (todo, doing, done).
// Returns a MoveTaskResult with violation details on rejection.
func (m *PlanningManager) MoveTask(taskId, newStatus string) (*MoveTaskResult, error) {
	if !access.IsValidTaskStatus(newStatus) {
		return nil, fmt.Errorf("PlanningManager.MoveTask: invalid status %s", newStatus)
	}

	// Get all tasks to find the task being moved and build context
	allTasks, err := m.GetTasks()
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.MoveTask: failed to get tasks: %w", err)
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
		return nil, fmt.Errorf("PlanningManager.MoveTask: task %s not found", taskId)
	}

	// Build task info list for rule context
	taskInfos := make([]rule_engine.TaskInfo, len(allTasks))
	for i, t := range allTasks {
		taskInfos[i] = rule_engine.TaskInfo{
			ID:           t.ID,
			Title:        t.Title,
			Status:       t.Status,
			Priority:     t.Priority,
			ParentTaskID: t.ParentTaskID,
			CreatedAt:    t.CreatedAt,
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
		return nil, fmt.Errorf("PlanningManager.MoveTask: rule evaluation failed: %w", evalErr)
	}
	if !result.Allowed {
		return &MoveTaskResult{
			Success:    false,
			Violations: result.Violations,
		}, nil
	}

	// Perform the move
	if err := m.planAccess.MoveTask(taskId, newStatus); err != nil {
		return nil, fmt.Errorf("PlanningManager.MoveTask: failed to move task: %w", err)
	}

	// Update task order: remove from source drop zone, append to target
	sourceZone := dropZoneForTask(oldStatus, movingTask.Priority)
	targetZone := dropZoneForTask(newStatus, movingTask.Priority)
	orderMap, err := m.planAccess.LoadTaskOrder()
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.MoveTask: failed to load task order: %w", err)
	}
	orderMap[sourceZone] = removeFromSlice(orderMap[sourceZone], taskId)
	orderMap[targetZone] = append(orderMap[targetZone], taskId)
	if err := m.planAccess.SaveTaskOrder(orderMap); err != nil {
		return nil, fmt.Errorf("PlanningManager.MoveTask: failed to save task order: %w", err)
	}

	// Subtask cascade: parent auto-moves to "doing" when first child starts
	if newStatus == string(access.TaskStatusDoing) && movingTask.ParentTaskID != nil && *movingTask.ParentTaskID != "" {
		parentID := *movingTask.ParentTaskID
		for _, t := range allTasks {
			if t.ID == parentID && t.Status == string(access.TaskStatusTodo) {
				_ = m.planAccess.MoveTask(parentID, string(access.TaskStatusDoing))
				break
			}
		}
	}

	// Subtask cascade: parent completion cascades children to "done"
	if newStatus == string(access.TaskStatusDone) {
		for _, t := range allTasks {
			if t.ParentTaskID != nil && *t.ParentTaskID == taskId && t.Status != string(access.TaskStatusDone) {
				_ = m.planAccess.MoveTask(t.ID, string(access.TaskStatusDone))
			}
		}
	}

	return &MoveTaskResult{Success: true, Positions: orderMap}, nil
}

// UpdateTask updates an existing task.
func (m *PlanningManager) UpdateTask(task access.Task) error {
	if task.ID == "" {
		return fmt.Errorf("PlanningManager.UpdateTask: task ID cannot be empty")
	}

	// Evaluate rules before updating
	taskInfos, err := m.buildTaskInfoList()
	if err != nil {
		return fmt.Errorf("PlanningManager.UpdateTask: failed to build task context: %w", err)
	}
	event := rule_engine.TaskEvent{
		Type:     rule_engine.EventTaskUpdate,
		Task:     &task,
		AllTasks: taskInfos,
	}
	if _, err := m.evaluateRules(event); err != nil {
		return fmt.Errorf("PlanningManager.UpdateTask: %w", err)
	}

	if err := m.planAccess.SaveTask(task); err != nil {
		return fmt.Errorf("PlanningManager.UpdateTask: failed to update task: %w", err)
	}

	return nil
}

// ProcessPriorityPromotions promotes tasks whose PromotionDate has been reached.
// Tasks with priority "important-not-urgent" are promoted to "important-urgent"
// and their PromotionDate is cleared.
func (m *PlanningManager) ProcessPriorityPromotions() ([]PromotedTask, error) {
	allTasks, err := m.GetTasks()
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.ProcessPriorityPromotions: failed to get tasks: %w", err)
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
			return nil, fmt.Errorf("PlanningManager.ProcessPriorityPromotions: failed to promote task %s: %w", t.ID, err)
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
		return fmt.Errorf("PlanningManager.DeleteTask: task ID cannot be empty")
	}

	// Delete task and update task order atomically in a single git commit
	if err := m.planAccess.DeleteTaskWithOrder(taskId); err != nil {
		return fmt.Errorf("PlanningManager.DeleteTask: failed to delete task: %w", err)
	}

	return nil
}

// ArchiveTask archives a done task and all its subtasks.
func (m *PlanningManager) ArchiveTask(taskId string) error {
	if taskId == "" {
		return fmt.Errorf("PlanningManager.ArchiveTask: task ID cannot be empty")
	}

	allTasks, err := m.GetTasks()
	if err != nil {
		return fmt.Errorf("PlanningManager.ArchiveTask: failed to get tasks: %w", err)
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
		return fmt.Errorf("PlanningManager.ArchiveTask: task %s not found", taskId)
	}
	if targetTask.Status != string(access.TaskStatusDone) {
		return fmt.Errorf("PlanningManager.ArchiveTask: task %s is not done (status: %s)", taskId, targetTask.Status)
	}

	// Collect all subtask IDs (any status) recursively, then prepend parent
	toArchive := append([]string{taskId}, collectDescendantIDs(taskId, allTasks)...)

	for _, id := range toArchive {
		if err := m.planAccess.ArchiveTask(id); err != nil {
			return fmt.Errorf("PlanningManager.ArchiveTask: failed to archive task %s: %w", id, err)
		}
	}

	// Remove archived task IDs from task order
	if err := m.removeFromTaskOrder(toArchive); err != nil {
		return fmt.Errorf("PlanningManager.ArchiveTask: %w", err)
	}

	return nil
}

// ArchiveAllDoneTasks archives all root-level done tasks and their subtasks.
func (m *PlanningManager) ArchiveAllDoneTasks() error {
	allTasks, err := m.GetTasks()
	if err != nil {
		return fmt.Errorf("PlanningManager.ArchiveAllDoneTasks: failed to get tasks: %w", err)
	}

	// Build set of done task IDs
	doneSet := make(map[string]bool)
	for _, t := range allTasks {
		if t.Status == string(access.TaskStatusDone) {
			doneSet[t.ID] = true
		}
	}

	// Find root-level done tasks (no parent, or parent is not done)
	for _, t := range allTasks {
		if t.Status != string(access.TaskStatusDone) {
			continue
		}
		if t.ParentTaskID != nil && *t.ParentTaskID != "" && doneSet[*t.ParentTaskID] {
			continue // Parent is also done — parent's cascade will handle this
		}
		if err := m.ArchiveTask(t.ID); err != nil {
			return fmt.Errorf("PlanningManager.ArchiveAllDoneTasks: %w", err)
		}
	}

	return nil
}

// RestoreTask restores an archived task and all its archived subtasks to done.
func (m *PlanningManager) RestoreTask(taskId string) error {
	if taskId == "" {
		return fmt.Errorf("PlanningManager.RestoreTask: task ID cannot be empty")
	}

	allTasks, err := m.GetTasks()
	if err != nil {
		return fmt.Errorf("PlanningManager.RestoreTask: failed to get tasks: %w", err)
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
		return fmt.Errorf("PlanningManager.RestoreTask: task %s not found", taskId)
	}
	if targetTask.Status != string(access.TaskStatusArchived) {
		return fmt.Errorf("PlanningManager.RestoreTask: task %s is not archived (status: %s)", taskId, targetTask.Status)
	}

	// Collect archived subtask IDs recursively, then prepend parent
	toRestore := append([]string{taskId}, collectArchivedDescendantIDs(taskId, allTasks)...)

	for _, id := range toRestore {
		if err := m.planAccess.RestoreTask(id); err != nil {
			return fmt.Errorf("PlanningManager.RestoreTask: failed to restore task %s: %w", id, err)
		}
	}

	return nil
}

// collectDescendantIDs returns all descendant task IDs for a parent, regardless of status.
func collectDescendantIDs(parentID string, allTasks []TaskWithStatus) []string {
	var result []string
	for _, t := range allTasks {
		if t.ParentTaskID != nil && *t.ParentTaskID == parentID {
			result = append(result, t.ID)
			result = append(result, collectDescendantIDs(t.ID, allTasks)...)
		}
	}
	return result
}

// collectArchivedDescendantIDs returns archived descendant task IDs for a parent.
func collectArchivedDescendantIDs(parentID string, allTasks []TaskWithStatus) []string {
	var result []string
	for _, t := range allTasks {
		if t.ParentTaskID != nil && *t.ParentTaskID == parentID && t.Status == string(access.TaskStatusArchived) {
			result = append(result, t.ID)
			result = append(result, collectArchivedDescendantIDs(t.ID, allTasks)...)
		}
	}
	return result
}

// removeFromTaskOrder removes the given task IDs from all drop zones in the task order.
func (m *PlanningManager) removeFromTaskOrder(taskIDs []string) error {
	orderMap, err := m.planAccess.LoadTaskOrder()
	if err != nil {
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
			return fmt.Errorf("failed to save task order: %w", err)
		}
	}

	return nil
}

// ReorderTasks accepts proposed positions for one or more drop zones,
// merges them into the full order map, persists, and returns authoritative positions.
func (m *PlanningManager) ReorderTasks(positions map[string][]string) (*ReorderResult, error) {
	orderMap, err := m.planAccess.LoadTaskOrder()
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.ReorderTasks: failed to load task order: %w", err)
	}

	// Merge proposed positions into the full order map
	for zone, ids := range positions {
		orderMap[zone] = ids
	}

	if err := m.planAccess.SaveTaskOrder(orderMap); err != nil {
		return nil, fmt.Errorf("PlanningManager.ReorderTasks: failed to save task order: %w", err)
	}

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
		return nil, fmt.Errorf("PlanningManager.GetBoardConfiguration: %w", err)
	}
	return config, nil
}

// SuggestThemeAbbreviation suggests a unique abbreviation for a theme name.
func (m *PlanningManager) SuggestThemeAbbreviation(name string) (string, error) {
	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return "", fmt.Errorf("PlanningManager.SuggestThemeAbbreviation: %w", err)
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
			CurrentView: "home",
		}, nil
	}
	if ctx == nil {
		return &NavigationContext{
			CurrentView: "home",
		}, nil
	}

	return &NavigationContext{
		CurrentView:       ctx.CurrentView,
		CurrentItem:       ctx.CurrentItem,
		FilterThemeID:     ctx.FilterThemeID,
		FilterDate:        ctx.FilterDate,
		LastAccessed:      ctx.LastAccessed,
		ShowCompleted:     ctx.ShowCompleted,
		ShowArchived:      ctx.ShowArchived,
		ShowArchivedTasks: ctx.ShowArchivedTasks,
		ExpandedOkrIds:    ctx.ExpandedOkrIds,
		FilterTagIDs:      ctx.FilterTagIDs,
	}, nil
}

// SaveNavigationContext persists the current navigation context.
func (m *PlanningManager) SaveNavigationContext(ctx NavigationContext) error {
	accessCtx := access.NavigationContext{
		CurrentView:       ctx.CurrentView,
		CurrentItem:       ctx.CurrentItem,
		FilterThemeID:     ctx.FilterThemeID,
		FilterDate:        ctx.FilterDate,
		LastAccessed:      ctx.LastAccessed,
		ShowCompleted:     ctx.ShowCompleted,
		ShowArchived:      ctx.ShowArchived,
		ShowArchivedTasks: ctx.ShowArchivedTasks,
		ExpandedOkrIds:    ctx.ExpandedOkrIds,
		FilterTagIDs:      ctx.FilterTagIDs,
	}

	if err := m.planAccess.SaveNavigationContext(accessCtx); err != nil {
		return fmt.Errorf("PlanningManager.SaveNavigationContext: %w", err)
	}

	m.navigationContext = &ctx
	return nil
}
