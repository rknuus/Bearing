package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"

	"github.com/rkn/bearing/internal/access"
	"github.com/rkn/bearing/internal/managers"
	"github.com/rkn/bearing/internal/utilities"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

// App struct holds the application state
type App struct {
	ctx             context.Context
	planningManager *managers.PlanningManager
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Initialize data directory
	homeDir, err := os.UserHomeDir()
	if err != nil {
		log.Printf("Warning: Failed to get home directory: %v", err)
		return
	}

	repoPath := filepath.Join(homeDir, ".bearing")
	if err := os.MkdirAll(repoPath, 0755); err != nil {
		log.Printf("Warning: Failed to create data directory: %v", err)
		return
	}

	// Initialize git repository for versioning
	gitConfig := &utilities.AuthorConfiguration{
		User:  "Bearing App",
		Email: "bearing@localhost",
	}

	repo, err := utilities.InitializeRepositoryWithConfig(repoPath, gitConfig)
	if err != nil {
		log.Printf("Warning: Failed to initialize repository: %v", err)
		return
	}

	// Initialize PlanAccess
	planAccess, err := access.NewPlanAccess(repoPath, repo)
	if err != nil {
		log.Printf("Warning: Failed to initialize PlanAccess: %v", err)
		return
	}

	// Initialize PlanningManager
	planningManager, err := managers.NewPlanningManager(planAccess)
	if err != nil {
		log.Printf("Warning: Failed to initialize PlanningManager: %v", err)
		return
	}

	a.planningManager = planningManager
	log.Printf("Bearing initialized with data path: %s", repoPath)
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, Welcome to Bearing!", name)
}

// KeyResult represents a measurable outcome (for Wails binding)
type KeyResult struct {
	ID           string `json:"id"`
	ParentID     string `json:"parentId"`
	Description  string `json:"description"`
	Status       string `json:"status,omitempty"`
	StartValue   int    `json:"startValue,omitempty"`
	CurrentValue int    `json:"currentValue,omitempty"`
	TargetValue  int    `json:"targetValue,omitempty"`
}

// Objective represents a medium-term goal (for Wails binding)
type Objective struct {
	ID         string      `json:"id"`
	ParentID   string      `json:"parentId"`
	Title      string      `json:"title"`
	Status     string      `json:"status,omitempty"`
	KeyResults []KeyResult `json:"keyResults"`
	Objectives []Objective `json:"objectives,omitempty"`
}

// LifeTheme represents a long-term life focus area (for Wails binding)
type LifeTheme struct {
	ID         string      `json:"id"`
	Name       string      `json:"name"`
	Color      string      `json:"color"`
	Objectives []Objective `json:"objectives"`
}

// DayFocus represents a daily focus entry (for Wails binding)
type DayFocus struct {
	Date    string `json:"date"`
	ThemeID string `json:"themeId"`
	Notes   string `json:"notes"`
	Text    string `json:"text"`
}

// Task represents a single actionable item (for Wails binding)
type Task struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Description   string   `json:"description,omitempty"`
	ThemeID       string   `json:"themeId"`
	DayDate       string   `json:"dayDate"`
	Priority      string   `json:"priority"`
	Tags          []string `json:"tags,omitempty"`
	DueDate       string   `json:"dueDate,omitempty"`
	PromotionDate string   `json:"promotionDate,omitempty"`
	ParentTaskID  *string  `json:"parentTaskId,omitempty"`
	CreatedAt     string   `json:"createdAt,omitempty"`
	UpdatedAt     string   `json:"updatedAt,omitempty"`
}

// TaskWithStatus represents a task with its kanban column status (for Wails binding)
type TaskWithStatus struct {
	Task
	Status     string   `json:"status"`
	SubtaskIDs []string `json:"subtaskIds,omitempty"`
}

// SectionDefinition defines a priority section within a column (for Wails binding)
type SectionDefinition struct {
	Name  string `json:"name"`
	Title string `json:"title"`
	Color string `json:"color"`
}

// ColumnDefinition defines a single column's structure (for Wails binding)
type ColumnDefinition struct {
	Name     string              `json:"name"`
	Title    string              `json:"title"`
	Type     string              `json:"type"`
	Sections []SectionDefinition `json:"sections,omitempty"`
}

// BoardConfiguration defines the board structure and column layout (for Wails binding)
type BoardConfiguration struct {
	Name              string             `json:"name"`
	ColumnDefinitions []ColumnDefinition `json:"columnDefinitions"`
}

// NavigationContext represents the user's navigation state (for Wails binding)
type NavigationContext struct {
	CurrentView    string   `json:"currentView"`
	CurrentItem    string   `json:"currentItem"`
	FilterThemeID  string   `json:"filterThemeId"`
	FilterDate     string   `json:"filterDate"`
	LastAccessed   string   `json:"lastAccessed"`
	ShowCompleted  bool     `json:"showCompleted,omitempty"`
	ShowArchived   bool     `json:"showArchived,omitempty"`
	ExpandedOkrIds []string `json:"expandedOkrIds,omitempty"`
}

// convertObjective recursively converts an access.Objective to a Wails Objective
func convertObjective(o access.Objective) Objective {
	keyResults := make([]KeyResult, len(o.KeyResults))
	for i, kr := range o.KeyResults {
		keyResults[i] = KeyResult{
			ID:           kr.ID,
			ParentID:     kr.ParentID,
			Description:  kr.Description,
			Status:       kr.Status,
			StartValue:   kr.StartValue,
			CurrentValue: kr.CurrentValue,
			TargetValue:  kr.TargetValue,
		}
	}
	objectives := make([]Objective, len(o.Objectives))
	for i, child := range o.Objectives {
		objectives[i] = convertObjective(child)
	}
	result := Objective{
		ID:         o.ID,
		ParentID:   o.ParentID,
		Title:      o.Title,
		Status:     o.Status,
		KeyResults: keyResults,
	}
	if len(objectives) > 0 {
		result.Objectives = objectives
	}
	return result
}

// convertObjectiveToAccess recursively converts a Wails Objective to an access.Objective
func convertObjectiveToAccess(o Objective) access.Objective {
	keyResults := make([]access.KeyResult, len(o.KeyResults))
	for i, kr := range o.KeyResults {
		keyResults[i] = access.KeyResult{
			ID:           kr.ID,
			ParentID:     kr.ParentID,
			Description:  kr.Description,
			Status:       kr.Status,
			StartValue:   kr.StartValue,
			CurrentValue: kr.CurrentValue,
			TargetValue:  kr.TargetValue,
		}
	}
	objectives := make([]access.Objective, len(o.Objectives))
	for i, child := range o.Objectives {
		objectives[i] = convertObjectiveToAccess(child)
	}
	result := access.Objective{
		ID:         o.ID,
		ParentID:   o.ParentID,
		Title:      o.Title,
		Status:     o.Status,
		KeyResults: keyResults,
	}
	if len(objectives) > 0 {
		result.Objectives = objectives
	}
	return result
}

// GetThemes returns all life themes with objectives and key results
func (a *App) GetThemes() ([]LifeTheme, error) {
	if a.planningManager == nil {
		return []LifeTheme{}, nil
	}

	themes, err := a.planningManager.GetThemes()
	if err != nil {
		return nil, err
	}

	// Convert to Wails binding types
	result := make([]LifeTheme, len(themes))
	for i, t := range themes {
		objectives := make([]Objective, len(t.Objectives))
		for j, o := range t.Objectives {
			objectives[j] = convertObjective(o)
		}
		result[i] = LifeTheme{
			ID:         t.ID,
			Name:       t.Name,
			Color:      t.Color,
			Objectives: objectives,
		}
	}
	return result, nil
}

// CreateTheme creates a new life theme with name and color
func (a *App) CreateTheme(name, color string) (*LifeTheme, error) {
	if a.planningManager == nil {
		return nil, fmt.Errorf("planning manager not initialized")
	}

	theme, err := a.planningManager.CreateTheme(name, color)
	if err != nil {
		return nil, err
	}

	return &LifeTheme{
		ID:         theme.ID,
		Name:       theme.Name,
		Color:      theme.Color,
		Objectives: []Objective{},
	}, nil
}

// UpdateTheme updates an existing life theme
func (a *App) UpdateTheme(theme LifeTheme) error {
	if a.planningManager == nil {
		return fmt.Errorf("planning manager not initialized")
	}

	// Convert objectives and key results recursively
	objectives := make([]access.Objective, len(theme.Objectives))
	for i, o := range theme.Objectives {
		objectives[i] = convertObjectiveToAccess(o)
	}

	return a.planningManager.UpdateTheme(access.LifeTheme{
		ID:         theme.ID,
		Name:       theme.Name,
		Color:      theme.Color,
		Objectives: objectives,
	})
}

// SaveTheme saves or updates a life theme (legacy method)
func (a *App) SaveTheme(theme LifeTheme) error {
	if a.planningManager == nil {
		return fmt.Errorf("planning manager not initialized")
	}

	return a.planningManager.SaveTheme(access.LifeTheme{
		ID:    theme.ID,
		Name:  theme.Name,
		Color: theme.Color,
	})
}

// DeleteTheme deletes a life theme by ID
func (a *App) DeleteTheme(id string) error {
	if a.planningManager == nil {
		return fmt.Errorf("planning manager not initialized")
	}

	return a.planningManager.DeleteTheme(id)
}

// CreateObjective creates a new objective under a parent (theme or objective)
func (a *App) CreateObjective(parentId, title string) (*Objective, error) {
	if a.planningManager == nil {
		return nil, fmt.Errorf("planning manager not initialized")
	}

	obj, err := a.planningManager.CreateObjective(parentId, title)
	if err != nil {
		return nil, err
	}

	return &Objective{
		ID:         obj.ID,
		Title:      obj.Title,
		KeyResults: []KeyResult{},
	}, nil
}

// UpdateObjective updates an existing objective's title
func (a *App) UpdateObjective(objectiveId, title string) error {
	if a.planningManager == nil {
		return fmt.Errorf("planning manager not initialized")
	}

	return a.planningManager.UpdateObjective(objectiveId, title)
}

// DeleteObjective deletes an objective by ID (tree-walked)
func (a *App) DeleteObjective(objectiveId string) error {
	if a.planningManager == nil {
		return fmt.Errorf("planning manager not initialized")
	}

	return a.planningManager.DeleteObjective(objectiveId)
}

// CreateKeyResult creates a new key result under an objective at any depth
func (a *App) CreateKeyResult(parentObjectiveId, description string, startValue, targetValue int) (*KeyResult, error) {
	if a.planningManager == nil {
		return nil, fmt.Errorf("planning manager not initialized")
	}

	kr, err := a.planningManager.CreateKeyResult(parentObjectiveId, description, startValue, targetValue)
	if err != nil {
		return nil, err
	}

	return &KeyResult{
		ID:           kr.ID,
		Description:  kr.Description,
		StartValue:   kr.StartValue,
		CurrentValue: kr.CurrentValue,
		TargetValue:  kr.TargetValue,
	}, nil
}

// UpdateKeyResult updates an existing key result's description
func (a *App) UpdateKeyResult(keyResultId, description string) error {
	if a.planningManager == nil {
		return fmt.Errorf("planning manager not initialized")
	}

	return a.planningManager.UpdateKeyResult(keyResultId, description)
}

// UpdateKeyResultProgress updates only the currentValue of a key result
func (a *App) UpdateKeyResultProgress(keyResultId string, currentValue int) error {
	if a.planningManager == nil {
		return fmt.Errorf("planning manager not initialized")
	}

	return a.planningManager.UpdateKeyResultProgress(keyResultId, currentValue)
}

// DeleteKeyResult deletes a key result by ID (tree-walked)
func (a *App) DeleteKeyResult(keyResultId string) error {
	if a.planningManager == nil {
		return fmt.Errorf("planning manager not initialized")
	}

	return a.planningManager.DeleteKeyResult(keyResultId)
}

// SetObjectiveStatus sets the lifecycle status of an objective
func (a *App) SetObjectiveStatus(objectiveId, status string) error {
	if a.planningManager == nil {
		return fmt.Errorf("planning manager not initialized")
	}

	return a.planningManager.SetObjectiveStatus(objectiveId, status)
}

// SetKeyResultStatus sets the lifecycle status of a key result
func (a *App) SetKeyResultStatus(keyResultId, status string) error {
	if a.planningManager == nil {
		return fmt.Errorf("planning manager not initialized")
	}

	return a.planningManager.SetKeyResultStatus(keyResultId, status)
}

// SuggestThemeAbbreviation suggests a unique abbreviation for a theme name
func (a *App) SuggestThemeAbbreviation(name string) (string, error) {
	if a.planningManager == nil {
		return "", fmt.Errorf("planning manager not initialized")
	}

	return a.planningManager.SuggestThemeAbbreviation(name)
}

// GetYearFocus returns all day focus entries for a specific year
func (a *App) GetYearFocus(year int) ([]DayFocus, error) {
	if a.planningManager == nil {
		return []DayFocus{}, nil
	}

	entries, err := a.planningManager.GetYearFocus(year)
	if err != nil {
		return nil, err
	}

	// Convert to Wails binding types
	result := make([]DayFocus, len(entries))
	for i, e := range entries {
		result[i] = DayFocus{
			Date:    e.Date,
			ThemeID: e.ThemeID,
			Notes:   e.Notes,
			Text:    e.Text,
		}
	}
	return result, nil
}

// SaveDayFocus saves or updates a day focus entry
func (a *App) SaveDayFocus(day DayFocus) error {
	if a.planningManager == nil {
		return fmt.Errorf("planning manager not initialized")
	}

	return a.planningManager.SaveDayFocus(access.DayFocus{
		Date:    day.Date,
		ThemeID: day.ThemeID,
		Notes:   day.Notes,
		Text:    day.Text,
	})
}

// ClearDayFocus removes a day focus entry
func (a *App) ClearDayFocus(date string) error {
	if a.planningManager == nil {
		return fmt.Errorf("planning manager not initialized")
	}

	return a.planningManager.ClearDayFocus(date)
}

// GetTasks returns all tasks with their kanban status
func (a *App) GetTasks() ([]TaskWithStatus, error) {
	if a.planningManager == nil {
		return []TaskWithStatus{}, nil
	}

	tasks, err := a.planningManager.GetTasks()
	if err != nil {
		return nil, err
	}

	result := make([]TaskWithStatus, len(tasks))
	for i, t := range tasks {
		result[i] = TaskWithStatus{
			Task: Task{
				ID:            t.ID,
				Title:         t.Title,
				Description:   t.Description,
				ThemeID:       t.ThemeID,
				DayDate:       t.DayDate,
				Priority:      t.Priority,
				Tags:          t.Tags,
				DueDate:       t.DueDate,
				PromotionDate: t.PromotionDate,
				ParentTaskID:  t.ParentTaskID,
				CreatedAt:     t.CreatedAt,
				UpdatedAt:     t.UpdatedAt,
			},
			Status:     t.Status,
			SubtaskIDs: t.SubtaskIDs,
		}
	}
	return result, nil
}

// CreateTask creates a new task with the given properties
func (a *App) CreateTask(title, themeId, dayDate, priority, description, tags, dueDate, promotionDate string) (*Task, error) {
	if a.planningManager == nil {
		return nil, fmt.Errorf("planning manager not initialized")
	}

	task, err := a.planningManager.CreateTask(title, themeId, dayDate, priority, description, tags, dueDate, promotionDate)
	if err != nil {
		return nil, err
	}

	return &Task{
		ID:            task.ID,
		Title:         task.Title,
		Description:   task.Description,
		ThemeID:       task.ThemeID,
		DayDate:       task.DayDate,
		Priority:      task.Priority,
		Tags:          task.Tags,
		DueDate:       task.DueDate,
		PromotionDate: task.PromotionDate,
		ParentTaskID:  task.ParentTaskID,
		CreatedAt:     task.CreatedAt,
		UpdatedAt:     task.UpdatedAt,
	}, nil
}

// UpdateTask updates an existing task
func (a *App) UpdateTask(task Task) error {
	if a.planningManager == nil {
		return fmt.Errorf("planning manager not initialized")
	}

	return a.planningManager.UpdateTask(access.Task{
		ID:            task.ID,
		Title:         task.Title,
		Description:   task.Description,
		ThemeID:       task.ThemeID,
		DayDate:       task.DayDate,
		Priority:      task.Priority,
		Tags:          task.Tags,
		DueDate:       task.DueDate,
		PromotionDate: task.PromotionDate,
		ParentTaskID:  task.ParentTaskID,
		CreatedAt:     task.CreatedAt,
		UpdatedAt:     task.UpdatedAt,
	})
}

// RuleViolation represents a single rule violation (for Wails binding)
type RuleViolation struct {
	RuleID   string `json:"ruleId"`
	Priority int    `json:"priority"`
	Message  string `json:"message"`
	Category string `json:"category"`
}

// MoveTaskResult contains the result of a MoveTask operation (for Wails binding)
type MoveTaskResult struct {
	Success    bool            `json:"success"`
	Violations []RuleViolation `json:"violations,omitempty"`
}

// PromotedTask represents a task that was promoted (for Wails binding)
type PromotedTask struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	OldPriority string `json:"oldPriority"`
	NewPriority string `json:"newPriority"`
}

// MoveTask moves a task to a new kanban column status
func (a *App) MoveTask(taskId, newStatus string) (*MoveTaskResult, error) {
	if a.planningManager == nil {
		return nil, fmt.Errorf("planning manager not initialized")
	}

	result, err := a.planningManager.MoveTask(taskId, newStatus)
	if err != nil {
		return nil, err
	}

	// Convert violations
	var violations []RuleViolation
	for _, v := range result.Violations {
		violations = append(violations, RuleViolation{
			RuleID:   v.RuleID,
			Priority: v.Priority,
			Message:  v.Message,
			Category: v.Category,
		})
	}

	return &MoveTaskResult{
		Success:    result.Success,
		Violations: violations,
	}, nil
}

// ProcessPriorityPromotions promotes tasks whose PromotionDate has been reached
func (a *App) ProcessPriorityPromotions() ([]PromotedTask, error) {
	if a.planningManager == nil {
		return nil, fmt.Errorf("planning manager not initialized")
	}

	promoted, err := a.planningManager.ProcessPriorityPromotions()
	if err != nil {
		return nil, err
	}

	result := make([]PromotedTask, 0, len(promoted))
	for _, p := range promoted {
		result = append(result, PromotedTask{
			ID:          p.ID,
			Title:       p.Title,
			OldPriority: p.OldPriority,
			NewPriority: p.NewPriority,
		})
	}
	return result, nil
}

// DeleteTask deletes a task by ID
func (a *App) DeleteTask(taskId string) error {
	if a.planningManager == nil {
		return fmt.Errorf("planning manager not initialized")
	}

	return a.planningManager.DeleteTask(taskId)
}

// GetBoardConfiguration returns the board structure and column layout
func (a *App) GetBoardConfiguration() (*BoardConfiguration, error) {
	if a.planningManager == nil {
		return nil, fmt.Errorf("planning manager not initialized")
	}

	config, err := a.planningManager.GetBoardConfiguration()
	if err != nil {
		return nil, err
	}

	// Convert to Wails binding types
	columns := make([]ColumnDefinition, len(config.ColumnDefinitions))
	for i, col := range config.ColumnDefinitions {
		sections := make([]SectionDefinition, len(col.Sections))
		for j, sec := range col.Sections {
			sections[j] = SectionDefinition{
				Name:  sec.Name,
				Title: sec.Title,
				Color: sec.Color,
			}
		}
		columns[i] = ColumnDefinition{
			Name:     col.Name,
			Title:    col.Title,
			Type:     string(col.Type),
			Sections: sections,
		}
	}

	return &BoardConfiguration{
		Name:              config.Name,
		ColumnDefinitions: columns,
	}, nil
}

// LoadNavigationContext retrieves the saved navigation state
func (a *App) LoadNavigationContext() (*NavigationContext, error) {
	if a.planningManager == nil {
		return &NavigationContext{CurrentView: "home"}, nil
	}

	ctx, err := a.planningManager.LoadNavigationContext()
	if err != nil {
		return &NavigationContext{CurrentView: "home"}, nil
	}

	return &NavigationContext{
		CurrentView:    ctx.CurrentView,
		CurrentItem:    ctx.CurrentItem,
		FilterThemeID:  ctx.FilterThemeID,
		FilterDate:     ctx.FilterDate,
		LastAccessed:   ctx.LastAccessed,
		ShowCompleted:  ctx.ShowCompleted,
		ShowArchived:   ctx.ShowArchived,
		ExpandedOkrIds: ctx.ExpandedOkrIds,
	}, nil
}

// SaveNavigationContext persists the current navigation state
func (a *App) SaveNavigationContext(ctx NavigationContext) error {
	if a.planningManager == nil {
		return nil // Silently ignore if not initialized
	}

	return a.planningManager.SaveNavigationContext(managers.NavigationContext{
		CurrentView:    ctx.CurrentView,
		CurrentItem:    ctx.CurrentItem,
		FilterThemeID:  ctx.FilterThemeID,
		FilterDate:     ctx.FilterDate,
		LastAccessed:   ctx.LastAccessed,
		ShowCompleted:  ctx.ShowCompleted,
		ShowArchived:   ctx.ShowArchived,
		ExpandedOkrIds: ctx.ExpandedOkrIds,
	})
}

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Strip the "frontend/dist" prefix from embedded assets
	assetsFS, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		panic(fmt.Sprintf("Failed to create assets sub-filesystem: %v", err))
	}

	// Create application with options
	err = wails.Run(&options.App{
		Title:     "Bearing",
		Width:     1200,
		Height:    800,
		MinWidth:  800,
		MinHeight: 600,
		AssetServer: &assetserver.Options{
			Assets: assetsFS,
		},
		BackgroundColour: &options.RGBA{R: 255, G: 255, B: 255, A: 255},
		Debug: options.Debug{
			OpenInspectorOnStartup: true,
		},
		OnStartup: app.startup,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
