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

	dataPath := filepath.Join(homeDir, ".bearing", "data")
	if err := os.MkdirAll(dataPath, 0755); err != nil {
		log.Printf("Warning: Failed to create data directory: %v", err)
		return
	}

	// Initialize git repository for versioning
	gitConfig := &utilities.AuthorConfiguration{
		User:  "Bearing App",
		Email: "bearing@localhost",
	}

	repo, err := utilities.InitializeRepositoryWithConfig(dataPath, gitConfig)
	if err != nil {
		log.Printf("Warning: Failed to initialize repository: %v", err)
		return
	}

	// Initialize PlanAccess
	planAccess, err := access.NewPlanAccess(dataPath, repo)
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
	log.Printf("Bearing initialized with data path: %s", dataPath)
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, Welcome to Bearing!", name)
}

// KeyResult represents a measurable outcome (for Wails binding)
type KeyResult struct {
	ID          string `json:"id"`
	Description string `json:"description"`
}

// Objective represents a medium-term goal (for Wails binding)
type Objective struct {
	ID         string      `json:"id"`
	Title      string      `json:"title"`
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

// NavigationContext represents the user's navigation state (for Wails binding)
type NavigationContext struct {
	CurrentView   string `json:"currentView"`
	CurrentItem   string `json:"currentItem"`
	FilterThemeID string `json:"filterThemeId"`
	FilterDate    string `json:"filterDate"`
	LastAccessed  string `json:"lastAccessed"`
}

// convertObjective recursively converts an access.Objective to a Wails Objective
func convertObjective(o access.Objective) Objective {
	keyResults := make([]KeyResult, len(o.KeyResults))
	for i, kr := range o.KeyResults {
		keyResults[i] = KeyResult{
			ID:          kr.ID,
			Description: kr.Description,
		}
	}
	objectives := make([]Objective, len(o.Objectives))
	for i, child := range o.Objectives {
		objectives[i] = convertObjective(child)
	}
	result := Objective{
		ID:         o.ID,
		Title:      o.Title,
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
			ID:          kr.ID,
			Description: kr.Description,
		}
	}
	objectives := make([]access.Objective, len(o.Objectives))
	for i, child := range o.Objectives {
		objectives[i] = convertObjectiveToAccess(child)
	}
	result := access.Objective{
		ID:         o.ID,
		Title:      o.Title,
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
func (a *App) CreateKeyResult(parentObjectiveId, description string) (*KeyResult, error) {
	if a.planningManager == nil {
		return nil, fmt.Errorf("planning manager not initialized")
	}

	kr, err := a.planningManager.CreateKeyResult(parentObjectiveId, description)
	if err != nil {
		return nil, err
	}

	return &KeyResult{
		ID:          kr.ID,
		Description: kr.Description,
	}, nil
}

// UpdateKeyResult updates an existing key result's description
func (a *App) UpdateKeyResult(keyResultId, description string) error {
	if a.planningManager == nil {
		return fmt.Errorf("planning manager not initialized")
	}

	return a.planningManager.UpdateKeyResult(keyResultId, description)
}

// DeleteKeyResult deletes a key result by ID (tree-walked)
func (a *App) DeleteKeyResult(keyResultId string) error {
	if a.planningManager == nil {
		return fmt.Errorf("planning manager not initialized")
	}

	return a.planningManager.DeleteKeyResult(keyResultId)
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
		CurrentView:   ctx.CurrentView,
		CurrentItem:   ctx.CurrentItem,
		FilterThemeID: ctx.FilterThemeID,
		FilterDate:    ctx.FilterDate,
		LastAccessed:  ctx.LastAccessed,
	}, nil
}

// SaveNavigationContext persists the current navigation state
func (a *App) SaveNavigationContext(ctx NavigationContext) error {
	if a.planningManager == nil {
		return nil // Silently ignore if not initialized
	}

	return a.planningManager.SaveNavigationContext(managers.NavigationContext{
		CurrentView:   ctx.CurrentView,
		CurrentItem:   ctx.CurrentItem,
		FilterThemeID: ctx.FilterThemeID,
		FilterDate:    ctx.FilterDate,
		LastAccessed:  ctx.LastAccessed,
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
