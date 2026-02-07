// Package managers provides business logic components for the Bearing application.
// This package contains manager components that implement the iDesign methodology,
// orchestrating access components and implementing business rules.
package managers

import (
	"fmt"

	"github.com/rkn/bearing/internal/access"
)

// TaskWithStatus represents a task with its current status.
type TaskWithStatus struct {
	access.Task
	Status string `json:"status"`
}

// NavigationContext stores the user's navigation state for persistence.
type NavigationContext struct {
	CurrentView   string `json:"currentView"`
	CurrentItem   string `json:"currentItem"`
	FilterThemeID string `json:"filterThemeId"`
	FilterDate    string `json:"filterDate"`
	LastAccessed  string `json:"lastAccessed"`
	ShowCompleted bool   `json:"showCompleted,omitempty"`
	ShowArchived  bool   `json:"showArchived,omitempty"`
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

	// Calendar
	GetYearFocus(year int) ([]access.DayFocus, error)
	SaveDayFocus(day access.DayFocus) error
	ClearDayFocus(date string) error

	// Tasks
	GetTasks() ([]TaskWithStatus, error)
	CreateTask(title, themeId, dayDate, priority string) (*access.Task, error)
	MoveTask(taskId, newStatus string) error
	UpdateTask(task access.Task) error
	DeleteTask(taskId string) error

	// Theme Abbreviation
	SuggestThemeAbbreviation(name string) (string, error)

	// Navigation
	LoadNavigationContext() (*NavigationContext, error)
	SaveNavigationContext(ctx NavigationContext) error
}

// PlanningManager implements IPlanningManager with business logic.
type PlanningManager struct {
	planAccess        access.IPlanAccess
	navigationContext *NavigationContext
}

// NewPlanningManager creates a new PlanningManager instance.
func NewPlanningManager(planAccess access.IPlanAccess) (*PlanningManager, error) {
	if planAccess == nil {
		return nil, fmt.Errorf("PlanningManager.New: planAccess cannot be nil")
	}

	return &PlanningManager{
		planAccess: planAccess,
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

// GetTasks returns all tasks with their status across all themes.
func (m *PlanningManager) GetTasks() ([]TaskWithStatus, error) {
	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.GetTasks: failed to get themes: %w", err)
	}

	var allTasks []TaskWithStatus

	for _, theme := range themes {
		for _, status := range access.ValidTaskStatuses() {
			tasks, err := m.planAccess.GetTasksByStatus(theme.ID, string(status))
			if err != nil {
				return nil, fmt.Errorf("PlanningManager.GetTasks: failed to get tasks for theme %s status %s: %w", theme.ID, status, err)
			}

			for _, task := range tasks {
				allTasks = append(allTasks, TaskWithStatus{
					Task:   task,
					Status: string(status),
				})
			}
		}
	}

	return allTasks, nil
}

// CreateTask creates a new task with the given properties.
// Priority must be one of: important-urgent, important-not-urgent, not-important-urgent.
// Note: not-important-not-urgent (Q4) is intentionally excluded from EisenKan.
func (m *PlanningManager) CreateTask(title, themeId, dayDate, priority string) (*access.Task, error) {
	// Validate priority is one of the allowed values (no Q4)
	validPriorities := []string{
		string(access.PriorityImportantUrgent),
		string(access.PriorityImportantNotUrgent),
		string(access.PriorityNotImportantUrgent),
	}

	isValid := false
	for _, p := range validPriorities {
		if priority == p {
			isValid = true
			break
		}
	}

	if !isValid {
		return nil, fmt.Errorf("PlanningManager.CreateTask: invalid priority %s, must be one of: important-urgent, important-not-urgent, not-important-urgent", priority)
	}

	task := access.Task{
		Title:    title,
		ThemeID:  themeId,
		DayDate:  dayDate,
		Priority: priority,
	}

	if err := m.planAccess.SaveTask(task); err != nil {
		return nil, fmt.Errorf("PlanningManager.CreateTask: failed to save task: %w", err)
	}

	// Get the saved task with generated ID
	tasks, err := m.planAccess.GetTasksByTheme(themeId)
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.CreateTask: failed to get created task: %w", err)
	}

	// Find the newly created task (last one with matching title)
	for i := len(tasks) - 1; i >= 0; i-- {
		if tasks[i].Title == title && tasks[i].Priority == priority {
			return &tasks[i], nil
		}
	}

	return &task, nil
}

// MoveTask moves a task to a new status (todo, doing, done).
func (m *PlanningManager) MoveTask(taskId, newStatus string) error {
	if !access.IsValidTaskStatus(newStatus) {
		return fmt.Errorf("PlanningManager.MoveTask: invalid status %s", newStatus)
	}

	if err := m.planAccess.MoveTask(taskId, newStatus); err != nil {
		return fmt.Errorf("PlanningManager.MoveTask: failed to move task: %w", err)
	}

	return nil
}

// UpdateTask updates an existing task.
func (m *PlanningManager) UpdateTask(task access.Task) error {
	if task.ID == "" {
		return fmt.Errorf("PlanningManager.UpdateTask: task ID cannot be empty")
	}

	if err := m.planAccess.SaveTask(task); err != nil {
		return fmt.Errorf("PlanningManager.UpdateTask: failed to update task: %w", err)
	}

	return nil
}

// DeleteTask deletes a task by ID.
func (m *PlanningManager) DeleteTask(taskId string) error {
	if taskId == "" {
		return fmt.Errorf("PlanningManager.DeleteTask: task ID cannot be empty")
	}

	if err := m.planAccess.DeleteTask(taskId); err != nil {
		return fmt.Errorf("PlanningManager.DeleteTask: failed to delete task: %w", err)
	}

	return nil
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
		CurrentView:   ctx.CurrentView,
		CurrentItem:   ctx.CurrentItem,
		FilterThemeID: ctx.FilterThemeID,
		FilterDate:    ctx.FilterDate,
		LastAccessed:  ctx.LastAccessed,
		ShowCompleted: ctx.ShowCompleted,
		ShowArchived:  ctx.ShowArchived,
	}, nil
}

// SaveNavigationContext persists the current navigation context.
func (m *PlanningManager) SaveNavigationContext(ctx NavigationContext) error {
	accessCtx := access.NavigationContext{
		CurrentView:   ctx.CurrentView,
		CurrentItem:   ctx.CurrentItem,
		FilterThemeID: ctx.FilterThemeID,
		FilterDate:    ctx.FilterDate,
		LastAccessed:  ctx.LastAccessed,
		ShowCompleted: ctx.ShowCompleted,
		ShowArchived:  ctx.ShowArchived,
	}

	if err := m.planAccess.SaveNavigationContext(accessCtx); err != nil {
		return fmt.Errorf("PlanningManager.SaveNavigationContext: %w", err)
	}

	m.navigationContext = &ctx
	return nil
}
