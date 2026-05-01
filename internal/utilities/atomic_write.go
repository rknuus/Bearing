package utilities

import (
	"encoding/json"
	"fmt"
	"os"
)

// AtomicWriteJSON marshals v as 2-space indented JSON and writes it to path
// using a write-to-temp + fsync + rename sequence. The temp file (path+".tmp")
// is fsynced before being renamed over path, so a reader observing path will
// either see the previous fully-written content or the new fully-written
// content — never a torn write.
//
// On marshal/write/fsync failure the temp file is removed (best-effort) and
// the original path is left untouched. The function does not take a mutex;
// callers are responsible for serialising concurrent writes to the same path.
func AtomicWriteJSON(path string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("AtomicWriteJSON failed to marshal JSON for %s: %w", path, err)
	}

	tmpPath := path + ".tmp"

	f, err := os.OpenFile(tmpPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		return fmt.Errorf("AtomicWriteJSON failed to create temp file %s: %w", tmpPath, err)
	}

	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return fmt.Errorf("AtomicWriteJSON failed to write temp file %s: %w", tmpPath, err)
	}

	if err := f.Sync(); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return fmt.Errorf("AtomicWriteJSON failed to fsync temp file %s: %w", tmpPath, err)
	}

	if err := f.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("AtomicWriteJSON failed to close temp file %s: %w", tmpPath, err)
	}

	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("AtomicWriteJSON failed to rename %s to %s: %w", tmpPath, path, err)
	}

	return nil
}
