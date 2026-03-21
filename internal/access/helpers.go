package access

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/rkn/bearing/internal/utilities"
)

// writeJSON marshals v as indented JSON and writes it to filePath.
func writeJSON(filePath string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal JSON: %w", err)
	}
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}
	return nil
}

// commitFiles resolves paths relative to the repository, begins a transaction,
// stages the given absolute file paths, and commits with the provided message.
func commitFiles(repo utilities.IRepository, paths []string, message string) error {
	relPaths := make([]string, 0, len(paths))
	repoPath := repo.Path()
	for _, p := range paths {
		rel, err := filepath.Rel(repoPath, p)
		if err != nil {
			return fmt.Errorf("failed to get relative path: %w", err)
		}
		relPaths = append(relPaths, rel)
	}

	tx, err := repo.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	if err := tx.Stage(relPaths); err != nil {
		_ = tx.Cancel()
		return fmt.Errorf("failed to stage files: %w", err)
	}

	if _, err := tx.Commit(message); err != nil {
		return fmt.Errorf("failed to commit: %w", err)
	}

	return nil
}

// commitAll stages all changes in the repository and commits with the given message.
func commitAll(repo utilities.IRepository, message string) error {
	tx, err := repo.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	if err := tx.Stage([]string{"."}); err != nil {
		_ = tx.Cancel()
		return fmt.Errorf("failed to stage: %w", err)
	}
	if _, err := tx.Commit(message); err != nil {
		return fmt.Errorf("failed to commit: %w", err)
	}
	return nil
}

// ensureDir creates a directory if it doesn't exist.
func ensureDir(path string) error {
	if err := os.MkdirAll(path, 0755); err != nil {
		return fmt.Errorf("failed to create directory %s: %w", path, err)
	}
	return nil
}
