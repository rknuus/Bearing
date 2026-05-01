// Package bootstrap provides startup orchestration for the Bearing application.
// It resolves the data directory, initializes logging, the git repository,
// all resource access components, and both managers.
package bootstrap

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/rkn/bearing/internal/access"
	"github.com/rkn/bearing/internal/engines/chat_engine"
	"github.com/rkn/bearing/internal/managers"
	"github.com/rkn/bearing/internal/utilities"
)

// Result holds the initialized components returned by Initialize.
type Result struct {
	PlanningManager  *managers.PlanningManager
	WorkspaceManager *managers.WorkspaceManager
	AdviceManager    *managers.AdviceManager
	LogFile          *os.File
}

// Initialize performs all startup orchestration: resolves the data directory,
// sets up logging, initializes the git repository, creates all resource access
// components, and wires both managers. It returns an error on any failure (fail-fast).
func Initialize() (*Result, error) {
	// Resolve data directory (BEARING_DATA_DIR overrides default ~/.bearing/)
	bearingDir := os.Getenv("BEARING_DATA_DIR")
	if bearingDir == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("failed to get home directory: %w", err)
		}
		bearingDir = filepath.Join(homeDir, ".bearing")
	}
	if err := os.MkdirAll(bearingDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
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
	}

	slog.Info("Bearing starting up", "dataDir", bearingDir, "mode", "init")

	// Initialize git repository for versioning
	gitConfig := &utilities.AuthorConfiguration{
		User:  "Bearing App",
		Email: "bearing@localhost",
	}
	repo, err := utilities.InitializeRepositoryWithConfig(bearingDir, gitConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize repository: %w", err)
	}

	// Initialize Resource Access components
	themeAccess, err := access.NewThemeAccess(bearingDir, repo)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize ThemeAccess: %w", err)
	}
	taskAccess, err := access.NewTaskAccess(bearingDir, repo)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize TaskAccess: %w", err)
	}
	// Materialise the default board configuration on first startup. The
	// call is idempotent — on subsequent runs board_config.json already
	// exists and SeedDefaultBoard returns without writing or committing.
	// This replaces the lazy WorkspaceManager.ensureBoardSeeded bridge
	// (task 109): seeding is data-bootstrap work, not column-op work.
	if err := taskAccess.SeedDefaultBoard(); err != nil {
		return nil, fmt.Errorf("failed to seed default board configuration: %w", err)
	}
	// One-time migration: backfill Task.RoutineRef on tasks materialised
	// under the legacy "routine:<id>:<date>" Description + "Routine" tag
	// convention. Idempotent; produces no commit on a fully-migrated repo.
	// Runs BEFORE any manager construction so PlanningManager never sees
	// a half-migrated state.
	if err := migrateRoutineRefs(taskAccess, repo, bearingDir, slog.Default()); err != nil {
		return nil, fmt.Errorf("failed to migrate routine refs: %w", err)
	}
	calendarAccess, err := access.NewCalendarAccess(bearingDir, repo)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize CalendarAccess: %w", err)
	}
	visionAccess, err := access.NewVisionAccess(bearingDir, repo)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize VisionAccess: %w", err)
	}
	routineAccess, err := access.NewRoutineAccess(bearingDir, repo)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize RoutineAccess: %w", err)
	}
	uiStateAccess := access.NewUIStateAccess(bearingDir)

	// Initialize Managers
	planningManager, err := managers.NewPlanningManager(themeAccess, taskAccess, calendarAccess, routineAccess, visionAccess, uiStateAccess)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize PlanningManager: %w", err)
	}
	workspaceManager, err := managers.NewWorkspaceManager(taskAccess)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize WorkspaceManager: %w", err)
	}

	// Initialize ChatEngine
	chatEngine := chat_engine.NewChatEngine()

	// Initialize ModelAccess
	modelAccess := access.NewClaudeCLIModelAccess(0)

	// Initialize AdviceManager
	adviceManager, err := managers.NewAdviceManager(themeAccess, routineAccess, chatEngine, modelAccess, uiStateAccess, planningManager)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize AdviceManager: %w", err)
	}

	slog.Info("Bearing initialized", "dataDir", bearingDir)

	return &Result{
		PlanningManager:  planningManager,
		WorkspaceManager: workspaceManager,
		AdviceManager:    adviceManager,
		LogFile:          logFile,
	}, nil
}
