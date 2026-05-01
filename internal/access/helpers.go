package access

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/rkn/bearing/internal/utilities"
)

// writeJSONLocks serialises concurrent writeJSON calls targeting the same
// path. utilities.AtomicWriteJSON delegates ordering to its callers (a
// concurrent rename race against a shared temp file would otherwise surface
// as ENOENT on rename), so we hold a per-path mutex for the duration of each
// write.
var (
	writeJSONLocksMu sync.Mutex
	writeJSONLocks   = map[string]*sync.Mutex{}
)

func lockForPath(filePath string) *sync.Mutex {
	writeJSONLocksMu.Lock()
	defer writeJSONLocksMu.Unlock()
	if m, ok := writeJSONLocks[filePath]; ok {
		return m
	}
	m := &sync.Mutex{}
	writeJSONLocks[filePath] = m
	return m
}

// writeJSON marshals v as indented JSON and atomically writes it to filePath
// using a write-to-temp + fsync + rename sequence. Readers observing filePath
// will see either the previous fully-written content or the new fully-written
// content — never a torn write. Concurrent writes to the same filePath are
// serialised so that the shared temp file is not raced.
func writeJSON(filePath string, v any) error {
	m := lockForPath(filePath)
	m.Lock()
	defer m.Unlock()
	return utilities.AtomicWriteJSON(filePath, v)
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
