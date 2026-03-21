package main

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUnit_BearingDataDirOverride(t *testing.T) {
	tmpDir := t.TempDir()

	old := os.Getenv("BEARING_DATA_DIR")
	defer os.Setenv("BEARING_DATA_DIR", old)

	os.Setenv("BEARING_DATA_DIR", tmpDir)

	app := NewApp()
	ctx := context.TODO()
	app.startup(ctx)
	defer app.shutdown(ctx)

	// Verify directory structure was created in the temp dir
	for _, subdir := range []string{"themes", "tasks/todo", "tasks/doing", "tasks/done", "tasks/archived", "calendar"} {
		path := filepath.Join(tmpDir, subdir)
		if _, err := os.Stat(path); os.IsNotExist(err) {
			t.Errorf("Expected directory %s to exist", subdir)
		}
	}

	// Verify git repo was initialized
	gitDir := filepath.Join(tmpDir, ".git")
	if _, err := os.Stat(gitDir); os.IsNotExist(err) {
		t.Error("Expected .git directory to exist in temp data dir")
	}

	// Verify log file was created in temp dir
	logPath := filepath.Join(tmpDir, "bearing.log")
	if _, err := os.Stat(logPath); os.IsNotExist(err) {
		t.Error("Expected bearing.log to exist in temp data dir")
	}
}

func TestUnit_LoggerInitialization(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "bearing.log")

	logFile, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatalf("Failed to open log file: %v", err)
	}
	defer logFile.Close()

	handler := slog.NewTextHandler(logFile, &slog.HandlerOptions{Level: slog.LevelInfo, AddSource: true})
	logger := slog.New(handler)
	logger.Info("Bearing starting up", "dataDir", tmpDir, "mode", "test")

	// Flush by syncing and closing
	if err := logFile.Sync(); err != nil {
		t.Fatalf("Failed to sync log file: %v", err)
	}

	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("Failed to read log file: %v", err)
	}

	content := string(data)
	if !strings.Contains(content, "Bearing starting up") {
		t.Errorf("Log file does not contain startup message, got: %s", content)
	}
	if !strings.Contains(content, "dataDir=") {
		t.Errorf("Log file does not contain dataDir attribute, got: %s", content)
	}
}

func TestUnit_LoggerFallback(t *testing.T) {
	// Use a path that cannot be opened for writing
	unwritablePath := "/dev/null/nonexistent/bearing.log"

	_, err := os.OpenFile(unwritablePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err == nil {
		t.Fatal("Expected error opening unwritable path, but got nil")
	}

	// Verify fallback to stderr handler works without panic
	handler := slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo, AddSource: true})
	logger := slog.New(handler)
	logger.Warn("Failed to open log file, falling back to stderr", "path", unwritablePath, "error", err)
}

func TestUnit_LogFrontend(t *testing.T) {
	tmpDir := t.TempDir()
	logPath := filepath.Join(tmpDir, "test.log")

	logFile, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatalf("Failed to open log file: %v", err)
	}
	defer logFile.Close()

	handler := slog.NewTextHandler(logFile, &slog.HandlerOptions{Level: slog.LevelInfo, AddSource: true})
	oldDefault := slog.Default()
	slog.SetDefault(slog.New(handler))
	defer slog.SetDefault(oldDefault)

	app := NewApp()

	app.LogFrontend("error", "something broke", "App.svelte")
	app.LogFrontend("warn", "something suspicious", "TaskView.svelte")
	app.LogFrontend("info", "page loaded", "main.ts")

	if err := logFile.Sync(); err != nil {
		t.Fatalf("Failed to sync log file: %v", err)
	}

	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("Failed to read log file: %v", err)
	}

	content := string(data)

	// Verify error-level entry
	if !strings.Contains(content, "something broke") {
		t.Error("Log missing error message 'something broke'")
	}
	if !strings.Contains(content, "level=ERROR") {
		t.Error("Log missing ERROR level entry")
	}

	// Verify warn-level entry
	if !strings.Contains(content, "something suspicious") {
		t.Error("Log missing warn message 'something suspicious'")
	}
	if !strings.Contains(content, "level=WARN") {
		t.Error("Log missing WARN level entry")
	}

	// Verify info-level entry
	if !strings.Contains(content, "page loaded") {
		t.Error("Log missing info message 'page loaded'")
	}
	if !strings.Contains(content, "level=INFO") {
		t.Error("Log missing INFO level entry")
	}

	// Verify source and origin attributes are present
	if !strings.Contains(content, "origin=frontend") {
		t.Error("Log missing origin=frontend attribute")
	}
	if !strings.Contains(content, "source=App.svelte") {
		t.Error("Log missing source=App.svelte attribute")
	}
}
