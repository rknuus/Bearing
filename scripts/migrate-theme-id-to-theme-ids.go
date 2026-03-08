// Migration script: converts calendar JSON files from themeId (string) to themeIds ([]string).
//
// Usage: go run scripts/migrate-theme-id-to-theme-ids.go
//
// Idempotent: safe to run multiple times. Skips entries that already have themeIds.
// Commits changes via go-git after successful migration.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "migration failed: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("cannot determine home directory: %w", err)
	}

	dataPath := filepath.Join(homeDir, ".bearing", "data")
	calendarDir := filepath.Join(dataPath, "calendar")

	// Check if calendar directory exists
	if _, err := os.Stat(calendarDir); os.IsNotExist(err) {
		fmt.Println("No calendar directory found, nothing to migrate.")
		return nil
	}

	// Find all JSON files in calendar directory
	entries, err := os.ReadDir(calendarDir)
	if err != nil {
		return fmt.Errorf("failed to read calendar directory: %w", err)
	}

	var jsonFiles []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".json") {
			jsonFiles = append(jsonFiles, filepath.Join(calendarDir, entry.Name()))
		}
	}

	if len(jsonFiles) == 0 {
		fmt.Println("No calendar JSON files found, nothing to migrate.")
		return nil
	}

	// Process each file
	anyChanged := false
	var changedFiles []string

	for _, filePath := range jsonFiles {
		changed, err := migrateFile(filePath)
		if err != nil {
			return fmt.Errorf("failed to migrate %s: %w", filePath, err)
		}
		if changed {
			anyChanged = true
			changedFiles = append(changedFiles, filePath)
			fmt.Printf("Migrated: %s\n", filepath.Base(filePath))
		} else {
			fmt.Printf("Skipped (already migrated): %s\n", filepath.Base(filePath))
		}
	}

	if !anyChanged {
		fmt.Println("All files already migrated, no changes needed.")
		return nil
	}

	// Commit changes via go-git
	if err := commitChanges(dataPath, changedFiles); err != nil {
		return fmt.Errorf("failed to commit changes: %w", err)
	}

	fmt.Printf("Successfully migrated and committed %d file(s).\n", len(changedFiles))
	return nil
}

// migrateFile processes a single calendar JSON file. Returns true if the file was modified.
func migrateFile(filePath string) (bool, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return false, fmt.Errorf("failed to read file: %w", err)
	}

	var yearFile map[string]interface{}
	if err := json.Unmarshal(data, &yearFile); err != nil {
		return false, fmt.Errorf("failed to parse JSON: %w", err)
	}

	entriesRaw, ok := yearFile["entries"]
	if !ok {
		return false, nil // No entries key, skip
	}

	entries, ok := entriesRaw.([]interface{})
	if !ok {
		return false, nil // entries is not an array, skip
	}

	fileChanged := false

	for _, entryRaw := range entries {
		entry, ok := entryRaw.(map[string]interface{})
		if !ok {
			continue
		}

		changed := migrateEntry(entry)
		if changed {
			fileChanged = true
		}
	}

	if !fileChanged {
		return false, nil
	}

	// Marshal back with indentation
	output, err := json.MarshalIndent(yearFile, "", "  ")
	if err != nil {
		return false, fmt.Errorf("failed to marshal JSON: %w", err)
	}

	if err := os.WriteFile(filePath, output, 0644); err != nil {
		return false, fmt.Errorf("failed to write file: %w", err)
	}

	return true, nil
}

// migrateEntry converts a single DayFocus entry from themeId to themeIds.
// Returns true if the entry was modified.
func migrateEntry(entry map[string]interface{}) bool {
	_, hasThemeIDs := entry["themeIds"]
	themeIDRaw, hasThemeID := entry["themeId"]

	// Already migrated: themeIds present and themeId absent
	if hasThemeIDs && !hasThemeID {
		return false
	}

	// Has both: prefer themeIds, just delete themeId
	if hasThemeIDs && hasThemeID {
		delete(entry, "themeId")
		return true
	}

	// Has themeId only: migrate
	if hasThemeID {
		themeID, ok := themeIDRaw.(string)
		if !ok {
			// themeId is not a string, remove it
			delete(entry, "themeId")
			return true
		}

		if themeID != "" {
			entry["themeIds"] = []interface{}{themeID}
		}
		// Empty themeId: omit themeIds (don't set it)

		delete(entry, "themeId")
		return true
	}

	// No themeId key at all: skip
	return false
}

// commitChanges opens the data repo and commits the changed files.
func commitChanges(dataPath string, changedFiles []string) error {
	repo, err := git.PlainOpen(dataPath)
	if err != nil {
		return fmt.Errorf("failed to open git repository at %s: %w", dataPath, err)
	}

	worktree, err := repo.Worktree()
	if err != nil {
		return fmt.Errorf("failed to get worktree: %w", err)
	}

	// Stage changed files
	for _, filePath := range changedFiles {
		relPath, err := filepath.Rel(dataPath, filePath)
		if err != nil {
			return fmt.Errorf("failed to get relative path for %s: %w", filePath, err)
		}
		if _, err := worktree.Add(relPath); err != nil {
			return fmt.Errorf("failed to stage %s: %w", relPath, err)
		}
	}

	// Commit
	_, err = worktree.Commit("Migrate calendar themeId to themeIds", &git.CommitOptions{
		Author: &object.Signature{
			Name:  "Bearing Migration",
			Email: "migration@bearing.local",
			When:  time.Now(),
		},
	})
	if err != nil {
		return fmt.Errorf("failed to commit: %w", err)
	}

	return nil
}
