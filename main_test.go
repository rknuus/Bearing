package main

import (
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestGetLocale(t *testing.T) {
	app := NewApp()
	locale := app.GetLocale()

	if locale == "" {
		t.Fatal("GetLocale() returned empty string")
	}

	// BCP 47 pattern: letters, optionally followed by hyphen and more letters/digits
	bcp47 := regexp.MustCompile(`^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,})*$`)
	if !bcp47.MatchString(locale) {
		t.Errorf("GetLocale() = %q, does not match BCP 47 pattern", locale)
	}
}

func TestGetLocale_LCAllOverride(t *testing.T) {
	app := NewApp()

	old := os.Getenv("LC_ALL")
	defer os.Setenv("LC_ALL", old)

	os.Setenv("LC_ALL", "de_CH.UTF-8")
	locale := app.GetLocale()

	if locale != "de-CH" {
		t.Errorf("GetLocale() with LC_ALL=de_CH.UTF-8 = %q, want %q", locale, "de-CH")
	}
}

func TestGetLocale_LANGFallback(t *testing.T) {
	app := NewApp()

	oldLCAll := os.Getenv("LC_ALL")
	oldLang := os.Getenv("LANG")
	defer func() {
		os.Setenv("LC_ALL", oldLCAll)
		os.Setenv("LANG", oldLang)
	}()

	os.Setenv("LC_ALL", "")
	os.Setenv("LANG", "fr_FR.UTF-8")
	locale := app.GetLocale()

	if locale != "fr-FR" {
		t.Errorf("GetLocale() with LANG=fr_FR.UTF-8 = %q, want %q", locale, "fr-FR")
	}
}

func TestGetLocale_LCAllTakesPrecedenceOverLANG(t *testing.T) {
	app := NewApp()

	oldLCAll := os.Getenv("LC_ALL")
	oldLang := os.Getenv("LANG")
	defer func() {
		os.Setenv("LC_ALL", oldLCAll)
		os.Setenv("LANG", oldLang)
	}()

	os.Setenv("LC_ALL", "ja_JP.UTF-8")
	os.Setenv("LANG", "fr_FR.UTF-8")
	locale := app.GetLocale()

	if locale != "ja-JP" {
		t.Errorf("GetLocale() with LC_ALL=ja_JP, LANG=fr_FR = %q, want %q", locale, "ja-JP")
	}
}

func TestGetLocale_IgnoresCAndPOSIX(t *testing.T) {
	app := NewApp()

	oldLCAll := os.Getenv("LC_ALL")
	oldLang := os.Getenv("LANG")
	defer func() {
		os.Setenv("LC_ALL", oldLCAll)
		os.Setenv("LANG", oldLang)
	}()

	for _, val := range []string{"C", "POSIX"} {
		os.Setenv("LC_ALL", val)
		os.Setenv("LANG", "")
		locale := app.GetLocale()

		// Should fall through to macOS defaults or en-US, not return "C"/"POSIX"
		if locale == val {
			t.Errorf("GetLocale() should ignore LC_ALL=%s, but returned %q", val, locale)
		}
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
