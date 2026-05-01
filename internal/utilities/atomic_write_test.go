package utilities

import (
	"encoding/json"
	"errors"
	"math"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
)

func TestUnit_AtomicWriteJSON_HappyPath(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "data.json")

	payload := map[string]any{
		"name":  "bearing",
		"count": 42,
	}

	if err := AtomicWriteJSON(path, payload); err != nil {
		t.Fatalf("AtomicWriteJSON returned error: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read written file: %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("written file is not valid JSON: %v", err)
	}

	if got["name"] != "bearing" {
		t.Errorf("got name %v, want %q", got["name"], "bearing")
	}
	// json.Unmarshal decodes numbers into float64
	if got["count"] != float64(42) {
		t.Errorf("got count %v, want 42", got["count"])
	}

	// 2-space indentation marker present
	if !containsTwoSpaceIndent(data) {
		t.Errorf("expected 2-space indented JSON, got: %s", string(data))
	}

	// Temp file must not linger
	if _, err := os.Stat(path + ".tmp"); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("temp file should not exist after success, got err=%v", err)
	}
}

func TestUnit_AtomicWriteJSON_IdempotentRetry(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "data.json")

	payloadA := map[string]int{"v": 1}
	payloadB := map[string]int{"v": 2}

	if err := AtomicWriteJSON(path, payloadA); err != nil {
		t.Fatalf("first write failed: %v", err)
	}
	if err := AtomicWriteJSON(path, payloadB); err != nil {
		t.Fatalf("second write failed: %v", err)
	}
	if err := AtomicWriteJSON(path, payloadB); err != nil {
		t.Fatalf("third (idempotent) write failed: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read final file: %v", err)
	}
	var got map[string]int
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("final file is not valid JSON: %v", err)
	}
	if got["v"] != 2 {
		t.Errorf("got v=%d, want 2", got["v"])
	}
}

func TestUnit_AtomicWriteJSON_MissingParentDir(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "missing-subdir", "data.json")

	err := AtomicWriteJSON(path, map[string]int{"v": 1})
	if err == nil {
		t.Fatalf("expected error for missing parent directory, got nil")
	}

	// No file should be created at the target path
	if _, statErr := os.Stat(path); !errors.Is(statErr, os.ErrNotExist) {
		t.Errorf("target file should not exist after failure, got err=%v", statErr)
	}
	// No temp file either
	if _, statErr := os.Stat(path + ".tmp"); !errors.Is(statErr, os.ErrNotExist) {
		t.Errorf("temp file should not exist after failure, got err=%v", statErr)
	}
}

func TestUnit_AtomicWriteJSON_MarshalErrorLeavesNoTempFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "data.json")

	// json.Marshal cannot encode +Inf / NaN — triggers a marshal error before any file IO.
	err := AtomicWriteJSON(path, math.Inf(1))
	if err == nil {
		t.Fatalf("expected marshal error for +Inf, got nil")
	}

	if _, statErr := os.Stat(path); !errors.Is(statErr, os.ErrNotExist) {
		t.Errorf("target file should not exist after marshal error, got err=%v", statErr)
	}
	if _, statErr := os.Stat(path + ".tmp"); !errors.Is(statErr, os.ErrNotExist) {
		t.Errorf("temp file should not exist after marshal error, got err=%v", statErr)
	}
}

func TestUnit_AtomicWriteJSON_PreservesPriorContentOnFailure(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "data.json")

	if err := AtomicWriteJSON(path, map[string]int{"v": 1}); err != nil {
		t.Fatalf("seed write failed: %v", err)
	}
	original, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read seed: %v", err)
	}

	// Trigger marshal error — file must be untouched.
	if err := AtomicWriteJSON(path, math.NaN()); err == nil {
		t.Fatalf("expected marshal error for NaN, got nil")
	}

	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read after failure: %v", err)
	}
	if string(original) != string(after) {
		t.Errorf("file content changed after failed write:\nbefore=%s\nafter=%s", original, after)
	}
}

// TestUnit_AtomicWriteJSON_ConcurrentReaderNeverSeesTornWrite spins a reader
// goroutine that repeatedly reads the target file while a writer goroutine
// rewrites it many times with payloads of varying size. Every successful
// read must yield a valid JSON document — never a partial / torn file.
func TestUnit_AtomicWriteJSON_ConcurrentReaderNeverSeesTornWrite(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "data.json")

	// Seed the file so the reader has something to read from the start.
	if err := AtomicWriteJSON(path, map[string]any{"v": 0, "pad": ""}); err != nil {
		t.Fatalf("seed write failed: %v", err)
	}

	const iterations = 200
	var stop atomic.Bool
	var readCount atomic.Uint64
	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		for !stop.Load() {
			data, err := os.ReadFile(path)
			if err != nil {
				if errors.Is(err, os.ErrNotExist) {
					continue
				}
				t.Errorf("reader: unexpected read error: %v", err)
				return
			}
			if len(data) == 0 {
				t.Errorf("reader: observed empty file (torn write)")
				return
			}
			var v map[string]any
			if err := json.Unmarshal(data, &v); err != nil {
				t.Errorf("reader: observed invalid JSON (torn write): %v\ncontent=%q", err, string(data))
				return
			}
			readCount.Add(1)
		}
	}()

	for i := 0; i < iterations; i++ {
		// Vary the payload size so successive writes differ in length —
		// this maximises the chance of catching a torn write if rename
		// were not atomic.
		pad := make([]byte, (i*37)%1024)
		for j := range pad {
			pad[j] = 'x'
		}
		payload := map[string]any{
			"v":   i,
			"pad": string(pad),
		}
		if err := AtomicWriteJSON(path, payload); err != nil {
			stop.Store(true)
			wg.Wait()
			t.Fatalf("writer iteration %d failed: %v", i, err)
		}
	}

	stop.Store(true)
	wg.Wait()

	if readCount.Load() == 0 {
		t.Errorf("reader observed zero successful reads — concurrency test did not exercise the reader")
	}
}

// containsTwoSpaceIndent returns true if data contains a "\n  " sequence,
// signalling that json.MarshalIndent used the expected 2-space indentation.
func containsTwoSpaceIndent(data []byte) bool {
	for i := 0; i+2 < len(data); i++ {
		if data[i] == '\n' && data[i+1] == ' ' && data[i+2] == ' ' {
			return true
		}
	}
	return false
}
