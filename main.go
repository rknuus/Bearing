package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"os"

	"github.com/rkn/bearing/internal/access"
	"github.com/rkn/bearing/internal/bootstrap"
	"github.com/rkn/bearing/internal/engines/chat_engine"
	"github.com/rkn/bearing/internal/managers"
	"github.com/rkn/bearing/internal/utilities"
	"github.com/wailsapp/wails/v2"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

// version is set at build time via -ldflags; defaults to "dev"
var version = "dev"

//go:embed all:frontend/dist
var assets embed.FS

// App struct holds the application state
type App struct {
	ctx              context.Context
	planningManager  *managers.PlanningManager
	workspaceManager *managers.WorkspaceManager
	adviceManager    *managers.AdviceManager
	logFile          *os.File
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	result, err := bootstrap.Initialize()
	if err != nil {
		slog.Error("Bearing startup failed", "error", err)
		return
	}

	a.planningManager = result.PlanningManager
	a.workspaceManager = result.WorkspaceManager
	a.adviceManager = result.AdviceManager
	a.logFile = result.LogFile
	slog.Info("Bearing started", "version", version)
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
func (a *App) GetLocale() string {
	return utilities.DetectLocale()
}

// --- OKR lifecycle operations ---

func (a *App) SetObjectiveStatus(objectiveId, status string) error {
	return a.planningManager.SetObjectiveStatus(objectiveId, status)
}

func (a *App) SetKeyResultStatus(keyResultId, status string) error {
	return a.planningManager.SetKeyResultStatus(keyResultId, status)
}

func (a *App) CloseObjective(objectiveId, closingStatus, closingNotes string) error {
	return a.planningManager.CloseObjective(objectiveId, closingStatus, closingNotes)
}

func (a *App) ReopenObjective(objectiveId string) error {
	return a.planningManager.ReopenObjective(objectiveId)
}

// --- Behavioral goal operations ---

func (a *App) GetHierarchy() ([]managers.LifeTheme, error) {
	return a.planningManager.GetHierarchy()
}

func (a *App) Establish(req managers.EstablishRequest) (*managers.EstablishResult, error) {
	return a.planningManager.Establish(req)
}

func (a *App) Revise(req managers.ReviseRequest) error {
	return a.planningManager.Revise(req)
}

func (a *App) RecordProgress(goalId string, value int) error {
	return a.planningManager.RecordProgress(goalId, value)
}

func (a *App) Dismiss(goalId string) error {
	return a.planningManager.Dismiss(goalId)
}

func (a *App) SuggestAbbreviation(name string) (string, error) {
	return a.planningManager.SuggestAbbreviation(name)
}

// --- Calendar operations ---

func (a *App) GetYearFocus(year int) ([]managers.DayFocus, error) {
	return a.planningManager.GetYearFocus(year)
}

func (a *App) SaveDayFocus(day managers.DayFocus) error {
	return a.planningManager.SaveDayFocus(day)
}

func (a *App) ClearDayFocus(date string) error {
	return a.planningManager.ClearDayFocus(date)
}

func (a *App) GetRoutinesForDate(date string) ([]managers.RoutineOccurrence, error) {
	return a.planningManager.GetRoutinesForDate(date)
}

func (a *App) RescheduleRoutineOccurrence(routineID, originalDate, newDate string) error {
	return a.planningManager.RescheduleRoutineOccurrence(routineID, originalDate, newDate)
}

func (a *App) GetRoutineProgress(routineID string) (*managers.RoutinePeriodProgress, error) {
	return a.planningManager.GetRoutineProgress(routineID)
}

// --- Task operations ---

func (a *App) GetTasks() ([]managers.TaskWithStatus, error) {
	return a.planningManager.GetTasks()
}

func (a *App) CreateTask(title, themeId, priority, description, tags, promotionDate string) (*managers.Task, error) {
	return a.planningManager.CreateTask(title, themeId, priority, description, tags, promotionDate)
}

func (a *App) UpdateTask(task managers.Task) error {
	return a.planningManager.UpdateTask(task)
}

func (a *App) MoveTask(taskId, newStatus string, positions map[string][]string) (*managers.MoveTaskResult, error) {
	return a.planningManager.MoveTask(taskId, newStatus, positions)
}

func (a *App) DeleteTask(taskId string) error {
	return a.planningManager.DeleteTask(taskId)
}

func (a *App) ArchiveTask(taskId string) error {
	return a.planningManager.ArchiveTask(taskId)
}

func (a *App) ArchiveAllDoneTasks() error {
	return a.planningManager.ArchiveAllDoneTasks()
}

func (a *App) RestoreTask(taskId string) error {
	return a.planningManager.RestoreTask(taskId)
}

func (a *App) ReorderTasks(positions map[string][]string) (*managers.ReorderResult, error) {
	return a.planningManager.ReorderTasks(positions)
}

func (a *App) ProcessPriorityPromotions() ([]managers.PromotedTask, error) {
	return a.planningManager.ProcessPriorityPromotions()
}

// --- Board configuration operations ---

func (a *App) GetBoardConfiguration() (*managers.BoardConfiguration, error) {
	return a.workspaceManager.GetBoardConfiguration()
}

func (a *App) AddColumn(title, insertAfterSlug string) (*managers.BoardConfiguration, error) {
	return a.workspaceManager.AddColumn(title, insertAfterSlug)
}

func (a *App) RemoveColumn(slug string) (*managers.BoardConfiguration, error) {
	return a.workspaceManager.RemoveColumn(slug)
}

func (a *App) RenameColumn(oldSlug, newTitle string) (*managers.BoardConfiguration, error) {
	return a.workspaceManager.RenameColumn(oldSlug, newTitle)
}

func (a *App) ReorderColumns(slugs []string) (*managers.BoardConfiguration, error) {
	return a.workspaceManager.ReorderColumns(slugs)
}

// --- Navigation context operations ---

func (a *App) LoadNavigationContext() (*managers.NavigationContext, error) {
	return a.planningManager.LoadNavigationContext()
}

func (a *App) SaveNavigationContext(ctx managers.NavigationContext) error {
	return a.planningManager.SaveNavigationContext(ctx)
}

// --- Task drafts operations ---

// LoadTaskDrafts retrieves saved task drafts as a JSON string.
func (a *App) LoadTaskDrafts() string {
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

// SaveTaskDrafts persists task drafts from a JSON string.
func (a *App) SaveTaskDrafts(data string) error {
	return a.planningManager.SaveTaskDrafts(json.RawMessage(data))
}

// --- Progress operations ---

func (a *App) GetAllThemeProgress() ([]managers.ThemeProgress, error) {
	return a.planningManager.GetAllThemeProgress()
}

// --- Personal vision operations ---

func (a *App) GetPersonalVision() (*managers.PersonalVision, error) {
	return a.planningManager.GetPersonalVision()
}

func (a *App) SavePersonalVision(mission, vision string) error {
	return a.planningManager.SavePersonalVision(mission, vision)
}

// --- Advisor operations ---

// RequestAdvice sends a user message to the AI advisor with conversation
// history and optional OKR selection.
func (a *App) RequestAdvice(message string, historyJSON string, selectedOKRIds []string) (*chat_engine.AdviceResponse, error) {
	var history []chat_engine.ChatMessage
	if historyJSON != "" {
		if err := json.Unmarshal([]byte(historyJSON), &history); err != nil {
			slog.Error("RequestAdvice: failed to parse history JSON", "error", err)
			return nil, fmt.Errorf("Invalid conversation history format.")
		}
	}

	return a.adviceManager.RequestAdvice(message, history, selectedOKRIds)
}

// GetAvailableModels returns the list of available AI model providers.
func (a *App) GetAvailableModels() []access.ModelInfo {
	return a.adviceManager.GetAvailableModels()
}

// GetAdviceSetting returns whether the advisor feature is enabled.
func (a *App) GetAdviceSetting() (bool, error) {
	return a.adviceManager.GetEnabled()
}

// SetAdviceSetting enables or disables the advisor feature.
func (a *App) SetAdviceSetting(enabled bool) error {
	return a.adviceManager.SetEnabled(enabled)
}

// AcceptSuggestion applies a structured suggestion from the advisor.
func (a *App) AcceptSuggestion(suggestionJSON string, parentContext string) error {
	var suggestion chat_engine.Suggestion
	if err := json.Unmarshal([]byte(suggestionJSON), &suggestion); err != nil {
		slog.Error("AcceptSuggestion: failed to parse suggestion JSON", "error", err)
		return fmt.Errorf("Invalid suggestion format.")
	}

	return a.adviceManager.AcceptSuggestion(suggestion, parentContext)
}

// SetMinWindowSize updates the OS-level minimum window size at runtime.
func (a *App) SetMinWindowSize(width, height int) {
	wailsRuntime.WindowSetMinSize(a.ctx, width, height)
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
		MinWidth:  900,
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
