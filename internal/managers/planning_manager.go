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
}

// IPlanningManager defines the interface for planning business logic.
type IPlanningManager interface {
	// Themes
	GetThemes() ([]access.LifeTheme, error)
	CreateTheme(name, color string) (*access.LifeTheme, error)
	UpdateTheme(theme access.LifeTheme) error
	SaveTheme(theme access.LifeTheme) error
	DeleteTheme(id string) error

	// Objectives
	CreateObjective(themeId, title string) (*access.Objective, error)
	UpdateObjective(themeId string, objective access.Objective) error
	DeleteObjective(themeId, objectiveId string) error

	// Key Results
	CreateKeyResult(okrId, description string) (*access.KeyResult, error)
	UpdateKeyResult(themeId, objectiveId string, keyResult access.KeyResult) error
	DeleteKeyResult(themeId, objectiveId, keyResultId string) error

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

// CreateObjective creates a new objective within a theme.
// Returns the created objective with its generated ID.
func (m *PlanningManager) CreateObjective(themeId, title string) (*access.Objective, error) {
	if themeId == "" {
		return nil, fmt.Errorf("PlanningManager.CreateObjective: themeId cannot be empty")
	}
	if title == "" {
		return nil, fmt.Errorf("PlanningManager.CreateObjective: title cannot be empty")
	}

	// Get existing themes to find the one we want to modify
	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.CreateObjective: %w", err)
	}

	// Find the theme
	var targetTheme *access.LifeTheme
	for i := range themes {
		if themes[i].ID == themeId {
			targetTheme = &themes[i]
			break
		}
	}

	if targetTheme == nil {
		return nil, fmt.Errorf("PlanningManager.CreateObjective: theme with ID %s not found", themeId)
	}

	// Add new objective (ID will be generated by SaveTheme)
	newObjective := access.Objective{
		Title:      title,
		KeyResults: []access.KeyResult{},
	}
	targetTheme.Objectives = append(targetTheme.Objectives, newObjective)

	// Save the updated theme
	if err := m.planAccess.SaveTheme(*targetTheme); err != nil {
		return nil, fmt.Errorf("PlanningManager.CreateObjective: %w", err)
	}

	// Retrieve updated theme to get the generated objective ID
	themes, err = m.planAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.CreateObjective: failed to retrieve updated theme: %w", err)
	}

	for _, theme := range themes {
		if theme.ID == themeId {
			// Return the last objective (the one we just added)
			if len(theme.Objectives) > 0 {
				return &theme.Objectives[len(theme.Objectives)-1], nil
			}
		}
	}

	return nil, fmt.Errorf("PlanningManager.CreateObjective: objective was created but could not be retrieved")
}

// UpdateObjective updates an existing objective within a theme.
func (m *PlanningManager) UpdateObjective(themeId string, objective access.Objective) error {
	if themeId == "" {
		return fmt.Errorf("PlanningManager.UpdateObjective: themeId cannot be empty")
	}
	if objective.ID == "" {
		return fmt.Errorf("PlanningManager.UpdateObjective: objective ID cannot be empty")
	}

	// Get existing themes
	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("PlanningManager.UpdateObjective: %w", err)
	}

	// Find and update the objective
	found := false
	for i := range themes {
		if themes[i].ID == themeId {
			for j := range themes[i].Objectives {
				if themes[i].Objectives[j].ID == objective.ID {
					themes[i].Objectives[j] = objective
					found = true
					if err := m.planAccess.SaveTheme(themes[i]); err != nil {
						return fmt.Errorf("PlanningManager.UpdateObjective: %w", err)
					}
					break
				}
			}
			break
		}
	}

	if !found {
		return fmt.Errorf("PlanningManager.UpdateObjective: objective with ID %s not found in theme %s", objective.ID, themeId)
	}

	return nil
}

// DeleteObjective deletes an objective from a theme.
func (m *PlanningManager) DeleteObjective(themeId, objectiveId string) error {
	if themeId == "" {
		return fmt.Errorf("PlanningManager.DeleteObjective: themeId cannot be empty")
	}
	if objectiveId == "" {
		return fmt.Errorf("PlanningManager.DeleteObjective: objectiveId cannot be empty")
	}

	// Get existing themes
	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("PlanningManager.DeleteObjective: %w", err)
	}

	// Find and delete the objective
	found := false
	for i := range themes {
		if themes[i].ID == themeId {
			newObjectives := make([]access.Objective, 0, len(themes[i].Objectives))
			for _, obj := range themes[i].Objectives {
				if obj.ID == objectiveId {
					found = true
				} else {
					newObjectives = append(newObjectives, obj)
				}
			}
			if found {
				themes[i].Objectives = newObjectives
				if err := m.planAccess.SaveTheme(themes[i]); err != nil {
					return fmt.Errorf("PlanningManager.DeleteObjective: %w", err)
				}
			}
			break
		}
	}

	if !found {
		return fmt.Errorf("PlanningManager.DeleteObjective: objective with ID %s not found in theme %s", objectiveId, themeId)
	}

	return nil
}

// CreateKeyResult creates a new key result within an objective.
// okrId is the hierarchical ID of the objective (e.g., "THEME-01.OKR-01")
func (m *PlanningManager) CreateKeyResult(okrId, description string) (*access.KeyResult, error) {
	if okrId == "" {
		return nil, fmt.Errorf("PlanningManager.CreateKeyResult: okrId cannot be empty")
	}
	if description == "" {
		return nil, fmt.Errorf("PlanningManager.CreateKeyResult: description cannot be empty")
	}

	// Parse the okrId to extract themeId (first part before the dot)
	themeId, objectiveId := parseOkrId(okrId)
	if themeId == "" || objectiveId == "" {
		return nil, fmt.Errorf("PlanningManager.CreateKeyResult: invalid okrId format: %s", okrId)
	}

	// Get existing themes
	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.CreateKeyResult: %w", err)
	}

	// Find the theme and objective
	var targetTheme *access.LifeTheme
	var targetObjectiveIdx int = -1
	for i := range themes {
		if themes[i].ID == themeId {
			targetTheme = &themes[i]
			for j := range themes[i].Objectives {
				if themes[i].Objectives[j].ID == objectiveId {
					targetObjectiveIdx = j
					break
				}
			}
			break
		}
	}

	if targetTheme == nil {
		return nil, fmt.Errorf("PlanningManager.CreateKeyResult: theme with ID %s not found", themeId)
	}
	if targetObjectiveIdx == -1 {
		return nil, fmt.Errorf("PlanningManager.CreateKeyResult: objective with ID %s not found", objectiveId)
	}

	// Add new key result
	newKR := access.KeyResult{
		Description: description,
	}
	targetTheme.Objectives[targetObjectiveIdx].KeyResults = append(
		targetTheme.Objectives[targetObjectiveIdx].KeyResults,
		newKR,
	)

	// Save the updated theme
	if err := m.planAccess.SaveTheme(*targetTheme); err != nil {
		return nil, fmt.Errorf("PlanningManager.CreateKeyResult: %w", err)
	}

	// Retrieve updated theme to get the generated key result ID
	themes, err = m.planAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("PlanningManager.CreateKeyResult: failed to retrieve updated theme: %w", err)
	}

	for _, theme := range themes {
		if theme.ID == themeId {
			for _, obj := range theme.Objectives {
				if obj.ID == objectiveId {
					if len(obj.KeyResults) > 0 {
						return &obj.KeyResults[len(obj.KeyResults)-1], nil
					}
				}
			}
		}
	}

	return nil, fmt.Errorf("PlanningManager.CreateKeyResult: key result was created but could not be retrieved")
}

// UpdateKeyResult updates an existing key result.
func (m *PlanningManager) UpdateKeyResult(themeId, objectiveId string, keyResult access.KeyResult) error {
	if themeId == "" {
		return fmt.Errorf("PlanningManager.UpdateKeyResult: themeId cannot be empty")
	}
	if objectiveId == "" {
		return fmt.Errorf("PlanningManager.UpdateKeyResult: objectiveId cannot be empty")
	}
	if keyResult.ID == "" {
		return fmt.Errorf("PlanningManager.UpdateKeyResult: keyResult ID cannot be empty")
	}

	// Get existing themes
	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("PlanningManager.UpdateKeyResult: %w", err)
	}

	// Find and update the key result
	found := false
	for i := range themes {
		if themes[i].ID == themeId {
			for j := range themes[i].Objectives {
				if themes[i].Objectives[j].ID == objectiveId {
					for k := range themes[i].Objectives[j].KeyResults {
						if themes[i].Objectives[j].KeyResults[k].ID == keyResult.ID {
							themes[i].Objectives[j].KeyResults[k] = keyResult
							found = true
							if err := m.planAccess.SaveTheme(themes[i]); err != nil {
								return fmt.Errorf("PlanningManager.UpdateKeyResult: %w", err)
							}
							break
						}
					}
					break
				}
			}
			break
		}
	}

	if !found {
		return fmt.Errorf("PlanningManager.UpdateKeyResult: key result with ID %s not found", keyResult.ID)
	}

	return nil
}

// DeleteKeyResult deletes a key result from an objective.
func (m *PlanningManager) DeleteKeyResult(themeId, objectiveId, keyResultId string) error {
	if themeId == "" {
		return fmt.Errorf("PlanningManager.DeleteKeyResult: themeId cannot be empty")
	}
	if objectiveId == "" {
		return fmt.Errorf("PlanningManager.DeleteKeyResult: objectiveId cannot be empty")
	}
	if keyResultId == "" {
		return fmt.Errorf("PlanningManager.DeleteKeyResult: keyResultId cannot be empty")
	}

	// Get existing themes
	themes, err := m.planAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("PlanningManager.DeleteKeyResult: %w", err)
	}

	// Find and delete the key result
	found := false
	for i := range themes {
		if themes[i].ID == themeId {
			for j := range themes[i].Objectives {
				if themes[i].Objectives[j].ID == objectiveId {
					newKRs := make([]access.KeyResult, 0, len(themes[i].Objectives[j].KeyResults))
					for _, kr := range themes[i].Objectives[j].KeyResults {
						if kr.ID == keyResultId {
							found = true
						} else {
							newKRs = append(newKRs, kr)
						}
					}
					if found {
						themes[i].Objectives[j].KeyResults = newKRs
						if err := m.planAccess.SaveTheme(themes[i]); err != nil {
							return fmt.Errorf("PlanningManager.DeleteKeyResult: %w", err)
						}
					}
					break
				}
			}
			break
		}
	}

	if !found {
		return fmt.Errorf("PlanningManager.DeleteKeyResult: key result with ID %s not found", keyResultId)
	}

	return nil
}

// parseOkrId parses an OKR ID and returns the theme ID and objective ID.
// For "THEME-01.OKR-01", returns ("THEME-01", "THEME-01.OKR-01")
func parseOkrId(okrId string) (themeId, objectiveId string) {
	// Find the first dot to separate theme from the rest
	for i, c := range okrId {
		if c == '.' {
			return okrId[:i], okrId
		}
	}
	return "", ""
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
	}

	if err := m.planAccess.SaveNavigationContext(accessCtx); err != nil {
		return fmt.Errorf("PlanningManager.SaveNavigationContext: %w", err)
	}

	m.navigationContext = &ctx
	return nil
}
