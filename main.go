package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/rkn/bearing/internal/access"
	"github.com/rkn/bearing/internal/managers"
	"github.com/rkn/bearing/internal/utilities"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

// version is set at build time via -ldflags; defaults to "dev"
var version = "dev"

//go:embed all:frontend/dist
var assets embed.FS

// App struct holds the application state
type App struct {
	ctx             context.Context
	planningManager *managers.PlanningManager
	logFile         *os.File
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
		slog.Warn("Failed to get home directory", "error", err)
		return
	}

	bearingDir := filepath.Join(homeDir, ".bearing")
	if err := os.MkdirAll(bearingDir, 0755); err != nil {
		slog.Warn("Failed to create data directory", "error", err)
		return
	}

	// Initialize file-backed slog logger
	logPath := filepath.Join(bearingDir, "bearing.log")
	logFile, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		handler := slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo, AddSource: true})
		slog.SetDefault(slog.New(handler))
		slog.Warn("Failed to open log file, falling back to stderr", "path", logPath, "error", err)
	} else {
		handler := slog.NewTextHandler(logFile, &slog.HandlerOptions{Level: slog.LevelInfo, AddSource: true})
		slog.SetDefault(slog.New(handler))
		a.logFile = logFile
	}

	slog.Info("Bearing starting up", "dataDir", bearingDir, "mode", version)

	repoPath := bearingDir

	// Initialize git repository for versioning
	gitConfig := &utilities.AuthorConfiguration{
		User:  "Bearing App",
		Email: "bearing@localhost",
	}

	repo, err := utilities.InitializeRepositoryWithConfig(repoPath, gitConfig)
	if err != nil {
		slog.Warn("Failed to initialize repository", "error", err)
		return
	}

	// Initialize PlanAccess
	planAccess, err := access.NewPlanAccess(repoPath, repo)
	if err != nil {
		slog.Warn("Failed to initialize PlanAccess", "error", err)
		return
	}

	// Initialize PlanningManager
	planningManager, err := managers.NewPlanningManager(planAccess)
	if err != nil {
		slog.Warn("Failed to initialize PlanningManager", "error", err)
		return
	}

	a.planningManager = planningManager
	slog.Info("Bearing initialized", "dataDir", repoPath)
}

// shutdown is called when the app is closing
func (a *App) shutdown(ctx context.Context) {
	slog.Info("Bearing shutting down")
	if a.logFile != nil {
		a.logFile.Close()
	}
}

// LogFrontend receives a log entry from the frontend and writes it via slog
func (a *App) LogFrontend(level, message, source string) {
	attrs := []any{"source", source, "origin", "frontend"}
	switch level {
	case "error":
		slog.Error(message, attrs...)
	case "warn":
		slog.Warn(message, attrs...)
	default:
		slog.Info(message, attrs...)
	}
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, Welcome to Bearing!", name)
}

// GetLocale detects the system locale and returns a BCP 47 locale tag.
// Environment variables (LC_ALL, LANG) take precedence over macOS system
// settings, since setting them signals deliberate override intent.
func (a *App) GetLocale() string {
	// Check POSIX locale environment variables (LC_ALL overrides LANG)
	for _, key := range []string{"LC_ALL", "LANG"} {
		env := os.Getenv(key)
		if env == "" || env == "C" || env == "POSIX" {
			continue
		}
		// Strip encoding suffix (e.g. ".UTF-8")
		if idx := strings.Index(env, "."); idx != -1 {
			env = env[:idx]
		}
		if env != "" {
			return strings.ReplaceAll(env, "_", "-")
		}
	}

	// Fall back to macOS system locale
	out, err := exec.Command("defaults", "read", "NSGlobalDomain", "AppleLocale").Output()
	if err == nil {
		locale := strings.TrimSpace(string(out))
		// Strip variant suffix (e.g. "@rg=chzzzz")
		if idx := strings.Index(locale, "@"); idx != -1 {
			locale = locale[:idx]
		}
		if locale != "" {
			return strings.ReplaceAll(locale, "_", "-")
		}
	}

	return "en-US"
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
	CurrentView       string   `json:"currentView"`
	CurrentItem       string   `json:"currentItem"`
	FilterThemeID     string   `json:"filterThemeId"`
	FilterDate        string   `json:"filterDate"`
	LastAccessed      string   `json:"lastAccessed"`
	ShowCompleted     bool     `json:"showCompleted,omitempty"`
	ShowArchived      bool     `json:"showArchived,omitempty"`
	ShowArchivedTasks bool     `json:"showArchivedTasks,omitempty"`
	ExpandedOkrIds    []string `json:"expandedOkrIds,omitempty"`
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
		slog.Warn("GetThemes: planning manager not initialized")
		return []LifeTheme{}, nil
	}

	themes, err := a.planningManager.GetThemes()
	if err != nil {
		slog.Error("GetThemes failed", "error", err)
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
		slog.Warn("CreateTheme: planning manager not initialized")
		return nil, fmt.Errorf("planning manager not initialized")
	}

	theme, err := a.planningManager.CreateTheme(name, color)
	if err != nil {
		slog.Error("CreateTheme failed", "error", err, "name", name)
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
		slog.Warn("UpdateTheme: planning manager not initialized")
		return fmt.Errorf("planning manager not initialized")
	}

	// Convert objectives and key results recursively
	objectives := make([]access.Objective, len(theme.Objectives))
	for i, o := range theme.Objectives {
		objectives[i] = convertObjectiveToAccess(o)
	}

	err := a.planningManager.UpdateTheme(access.LifeTheme{
		ID:         theme.ID,
		Name:       theme.Name,
		Color:      theme.Color,
		Objectives: objectives,
	})
	if err != nil {
		slog.Error("UpdateTheme failed", "error", err, "themeId", theme.ID)
	}
	return err
}

// SaveTheme saves or updates a life theme (legacy method)
func (a *App) SaveTheme(theme LifeTheme) error {
	if a.planningManager == nil {
		slog.Warn("SaveTheme: planning manager not initialized")
		return fmt.Errorf("planning manager not initialized")
	}

	err := a.planningManager.SaveTheme(access.LifeTheme{
		ID:    theme.ID,
		Name:  theme.Name,
		Color: theme.Color,
	})
	if err != nil {
		slog.Error("SaveTheme failed", "error", err, "themeId", theme.ID)
	}
	return err
}

// DeleteTheme deletes a life theme by ID
func (a *App) DeleteTheme(id string) error {
	if a.planningManager == nil {
		slog.Warn("DeleteTheme: planning manager not initialized")
		return fmt.Errorf("planning manager not initialized")
	}

	err := a.planningManager.DeleteTheme(id)
	if err != nil {
		slog.Error("DeleteTheme failed", "error", err, "themeId", id)
	}
	return err
}

// CreateObjective creates a new objective under a parent (theme or objective)
func (a *App) CreateObjective(parentId, title string) (*Objective, error) {
	if a.planningManager == nil {
		slog.Warn("CreateObjective: planning manager not initialized")
		return nil, fmt.Errorf("planning manager not initialized")
	}

	obj, err := a.planningManager.CreateObjective(parentId, title)
	if err != nil {
		slog.Error("CreateObjective failed", "error", err, "parentId", parentId)
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
		slog.Warn("UpdateObjective: planning manager not initialized")
		return fmt.Errorf("planning manager not initialized")
	}

	err := a.planningManager.UpdateObjective(objectiveId, title)
	if err != nil {
		slog.Error("UpdateObjective failed", "error", err, "objectiveId", objectiveId)
	}
	return err
}

// DeleteObjective deletes an objective by ID (tree-walked)
func (a *App) DeleteObjective(objectiveId string) error {
	if a.planningManager == nil {
		slog.Warn("DeleteObjective: planning manager not initialized")
		return fmt.Errorf("planning manager not initialized")
	}

	err := a.planningManager.DeleteObjective(objectiveId)
	if err != nil {
		slog.Error("DeleteObjective failed", "error", err, "objectiveId", objectiveId)
	}
	return err
}

// CreateKeyResult creates a new key result under an objective at any depth
func (a *App) CreateKeyResult(parentObjectiveId, description string, startValue, targetValue int) (*KeyResult, error) {
	if a.planningManager == nil {
		slog.Warn("CreateKeyResult: planning manager not initialized")
		return nil, fmt.Errorf("planning manager not initialized")
	}

	kr, err := a.planningManager.CreateKeyResult(parentObjectiveId, description, startValue, targetValue)
	if err != nil {
		slog.Error("CreateKeyResult failed", "error", err, "parentObjectiveId", parentObjectiveId)
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
		slog.Warn("UpdateKeyResult: planning manager not initialized")
		return fmt.Errorf("planning manager not initialized")
	}

	err := a.planningManager.UpdateKeyResult(keyResultId, description)
	if err != nil {
		slog.Error("UpdateKeyResult failed", "error", err, "keyResultId", keyResultId)
	}
	return err
}

// UpdateKeyResultProgress updates only the currentValue of a key result
func (a *App) UpdateKeyResultProgress(keyResultId string, currentValue int) error {
	if a.planningManager == nil {
		slog.Warn("UpdateKeyResultProgress: planning manager not initialized")
		return fmt.Errorf("planning manager not initialized")
	}

	err := a.planningManager.UpdateKeyResultProgress(keyResultId, currentValue)
	if err != nil {
		slog.Error("UpdateKeyResultProgress failed", "error", err, "keyResultId", keyResultId)
	}
	return err
}

// DeleteKeyResult deletes a key result by ID (tree-walked)
func (a *App) DeleteKeyResult(keyResultId string) error {
	if a.planningManager == nil {
		slog.Warn("DeleteKeyResult: planning manager not initialized")
		return fmt.Errorf("planning manager not initialized")
	}

	err := a.planningManager.DeleteKeyResult(keyResultId)
	if err != nil {
		slog.Error("DeleteKeyResult failed", "error", err, "keyResultId", keyResultId)
	}
	return err
}

// SetObjectiveStatus sets the lifecycle status of an objective
func (a *App) SetObjectiveStatus(objectiveId, status string) error {
	if a.planningManager == nil {
		slog.Warn("SetObjectiveStatus: planning manager not initialized")
		return fmt.Errorf("planning manager not initialized")
	}

	err := a.planningManager.SetObjectiveStatus(objectiveId, status)
	if err != nil {
		slog.Error("SetObjectiveStatus failed", "error", err, "objectiveId", objectiveId, "status", status)
	}
	return err
}

// SetKeyResultStatus sets the lifecycle status of a key result
func (a *App) SetKeyResultStatus(keyResultId, status string) error {
	if a.planningManager == nil {
		slog.Warn("SetKeyResultStatus: planning manager not initialized")
		return fmt.Errorf("planning manager not initialized")
	}

	err := a.planningManager.SetKeyResultStatus(keyResultId, status)
	if err != nil {
		slog.Error("SetKeyResultStatus failed", "error", err, "keyResultId", keyResultId, "status", status)
	}
	return err
}

// SuggestThemeAbbreviation suggests a unique abbreviation for a theme name
func (a *App) SuggestThemeAbbreviation(name string) (string, error) {
	if a.planningManager == nil {
		slog.Warn("SuggestThemeAbbreviation: planning manager not initialized")
		return "", fmt.Errorf("planning manager not initialized")
	}

	result, err := a.planningManager.SuggestThemeAbbreviation(name)
	if err != nil {
		slog.Error("SuggestThemeAbbreviation failed", "error", err, "name", name)
	}
	return result, err
}

// GetYearFocus returns all day focus entries for a specific year
func (a *App) GetYearFocus(year int) ([]DayFocus, error) {
	if a.planningManager == nil {
		slog.Warn("GetYearFocus: planning manager not initialized")
		return []DayFocus{}, nil
	}

	entries, err := a.planningManager.GetYearFocus(year)
	if err != nil {
		slog.Error("GetYearFocus failed", "error", err, "year", year)
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
		slog.Warn("SaveDayFocus: planning manager not initialized")
		return fmt.Errorf("planning manager not initialized")
	}

	err := a.planningManager.SaveDayFocus(access.DayFocus{
		Date:    day.Date,
		ThemeID: day.ThemeID,
		Notes:   day.Notes,
		Text:    day.Text,
	})
	if err != nil {
		slog.Error("SaveDayFocus failed", "error", err, "date", day.Date)
	}
	return err
}

// ClearDayFocus removes a day focus entry
func (a *App) ClearDayFocus(date string) error {
	if a.planningManager == nil {
		slog.Warn("ClearDayFocus: planning manager not initialized")
		return fmt.Errorf("planning manager not initialized")
	}

	err := a.planningManager.ClearDayFocus(date)
	if err != nil {
		slog.Error("ClearDayFocus failed", "error", err, "date", date)
	}
	return err
}

// GetTasks returns all tasks with their kanban status
func (a *App) GetTasks() ([]TaskWithStatus, error) {
	if a.planningManager == nil {
		slog.Warn("GetTasks: planning manager not initialized")
		return []TaskWithStatus{}, nil
	}

	tasks, err := a.planningManager.GetTasks()
	if err != nil {
		slog.Error("GetTasks failed", "error", err)
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
		slog.Warn("CreateTask: planning manager not initialized")
		return nil, fmt.Errorf("planning manager not initialized")
	}

	task, err := a.planningManager.CreateTask(title, themeId, dayDate, priority, description, tags, dueDate, promotionDate)
	if err != nil {
		slog.Error("CreateTask failed", "error", err, "themeId", themeId)
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
		slog.Warn("UpdateTask: planning manager not initialized")
		return fmt.Errorf("planning manager not initialized")
	}

	err := a.planningManager.UpdateTask(access.Task{
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
	if err != nil {
		slog.Error("UpdateTask failed", "error", err, "taskId", task.ID)
	}
	return err
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
	Success    bool                `json:"success"`
	Violations []RuleViolation     `json:"violations,omitempty"`
	Positions  map[string][]string `json:"positions,omitempty"`
}

// ReorderResult contains the authoritative task positions after a reorder (for Wails binding)
type ReorderResult struct {
	Success   bool                `json:"success"`
	Positions map[string][]string `json:"positions"`
}

// PromotedTask represents a task that was promoted (for Wails binding)
type PromotedTask struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	OldPriority string `json:"oldPriority"`
	NewPriority string `json:"newPriority"`
}

// MoveTask moves a task to a new kanban column status.
// When positions is non-nil, the provided drop zone ordering is applied atomically.
func (a *App) MoveTask(taskId, newStatus string, positions map[string][]string) (*MoveTaskResult, error) {
	if a.planningManager == nil {
		slog.Warn("MoveTask: planning manager not initialized")
		return nil, fmt.Errorf("planning manager not initialized")
	}

	result, err := a.planningManager.MoveTask(taskId, newStatus, positions)
	if err != nil {
		slog.Error("MoveTask failed", "error", err, "taskId", taskId, "newStatus", newStatus)
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
		Positions:  result.Positions,
	}, nil
}

// ProcessPriorityPromotions promotes tasks whose PromotionDate has been reached
func (a *App) ProcessPriorityPromotions() ([]PromotedTask, error) {
	if a.planningManager == nil {
		slog.Warn("ProcessPriorityPromotions: planning manager not initialized")
		return nil, fmt.Errorf("planning manager not initialized")
	}

	promoted, err := a.planningManager.ProcessPriorityPromotions()
	if err != nil {
		slog.Error("ProcessPriorityPromotions failed", "error", err)
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
		slog.Warn("DeleteTask: planning manager not initialized")
		return fmt.Errorf("planning manager not initialized")
	}

	err := a.planningManager.DeleteTask(taskId)
	if err != nil {
		slog.Error("DeleteTask failed", "error", err, "taskId", taskId)
	}
	return err
}

// ArchiveTask archives a done task and all its subtasks
func (a *App) ArchiveTask(taskId string) error {
	if a.planningManager == nil {
		slog.Warn("ArchiveTask: planning manager not initialized")
		return fmt.Errorf("planning manager not initialized")
	}

	err := a.planningManager.ArchiveTask(taskId)
	if err != nil {
		slog.Error("ArchiveTask failed", "error", err, "taskId", taskId)
	}
	return err
}

// ArchiveAllDoneTasks archives all done tasks and their subtasks
func (a *App) ArchiveAllDoneTasks() error {
	if a.planningManager == nil {
		slog.Warn("ArchiveAllDoneTasks: planning manager not initialized")
		return fmt.Errorf("planning manager not initialized")
	}

	err := a.planningManager.ArchiveAllDoneTasks()
	if err != nil {
		slog.Error("ArchiveAllDoneTasks failed", "error", err)
	}
	return err
}

// RestoreTask restores an archived task and its archived subtasks to done
func (a *App) RestoreTask(taskId string) error {
	if a.planningManager == nil {
		slog.Warn("RestoreTask: planning manager not initialized")
		return fmt.Errorf("planning manager not initialized")
	}

	err := a.planningManager.RestoreTask(taskId)
	if err != nil {
		slog.Error("RestoreTask failed", "error", err, "taskId", taskId)
	}
	return err
}

// ReorderTasks accepts proposed positions and returns authoritative order
func (a *App) ReorderTasks(positions map[string][]string) (*ReorderResult, error) {
	if a.planningManager == nil {
		slog.Warn("ReorderTasks: planning manager not initialized")
		return nil, fmt.Errorf("planning manager not initialized")
	}

	result, err := a.planningManager.ReorderTasks(positions)
	if err != nil {
		slog.Error("ReorderTasks failed", "error", err)
		return nil, err
	}

	return &ReorderResult{
		Success:   result.Success,
		Positions: result.Positions,
	}, nil
}

// GetBoardConfiguration returns the board structure and column layout
func (a *App) GetBoardConfiguration() (*BoardConfiguration, error) {
	if a.planningManager == nil {
		slog.Warn("GetBoardConfiguration: planning manager not initialized")
		return nil, fmt.Errorf("planning manager not initialized")
	}

	config, err := a.planningManager.GetBoardConfiguration()
	if err != nil {
		slog.Error("GetBoardConfiguration failed", "error", err)
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
		slog.Warn("LoadNavigationContext: planning manager not initialized")
		return &NavigationContext{CurrentView: "home"}, nil
	}

	ctx, err := a.planningManager.LoadNavigationContext()
	if err != nil {
		slog.Error("LoadNavigationContext failed", "error", err)
		return &NavigationContext{CurrentView: "home"}, nil
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
	}, nil
}

// SaveNavigationContext persists the current navigation state
func (a *App) SaveNavigationContext(ctx NavigationContext) error {
	if a.planningManager == nil {
		slog.Warn("SaveNavigationContext: planning manager not initialized")
		return nil // Silently ignore if not initialized
	}

	err := a.planningManager.SaveNavigationContext(managers.NavigationContext{
		CurrentView:       ctx.CurrentView,
		CurrentItem:       ctx.CurrentItem,
		FilterThemeID:     ctx.FilterThemeID,
		FilterDate:        ctx.FilterDate,
		LastAccessed:      ctx.LastAccessed,
		ShowCompleted:     ctx.ShowCompleted,
		ShowArchived:      ctx.ShowArchived,
		ShowArchivedTasks: ctx.ShowArchivedTasks,
		ExpandedOkrIds:    ctx.ExpandedOkrIds,
	})
	if err != nil {
		slog.Error("SaveNavigationContext failed", "error", err)
	}
	return err
}

// LoadTaskDrafts retrieves saved task drafts as a JSON string
func (a *App) LoadTaskDrafts() string {
	if a.planningManager == nil {
		slog.Warn("LoadTaskDrafts: planning manager not initialized")
		return "{}"
	}

	data, err := a.planningManager.LoadTaskDrafts()
	if err != nil {
		slog.Error("LoadTaskDrafts failed", "error", err)
		return "{}"
	}
	if data == nil {
		return "{}"
	}

	return string(data)
}

// SaveTaskDrafts persists task drafts from a JSON string
func (a *App) SaveTaskDrafts(data string) error {
	if a.planningManager == nil {
		slog.Warn("SaveTaskDrafts: planning manager not initialized")
		return nil
	}

	err := a.planningManager.SaveTaskDrafts(json.RawMessage(data))
	if err != nil {
		slog.Error("SaveTaskDrafts failed", "error", err)
	}
	return err
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
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
