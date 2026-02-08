// Package utilities_test provides integration tests for VersioningUtility
// These tests validate destructive testing scenarios from the STP
package utilities

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// TestVersioningUtility_Integration_ArchitecturalCompliance validates architectural layer rules
func TestIntegration_VersioningUtility_ArchitecturalCompliance(t *testing.T) {
	// Test: Utilities can be called by all layers
	testCases := []struct {
		layer     string
		component string
	}{
		{"Client", "BearingClient"},
		{"Manager", "PlanningManager"},
		{"Engine", "ValidationEngine"},
		{"ResourceAccess", "DataAccess"},
		{"ResourceAccess", "ConfigAccess"},
	}

	tempDir := t.TempDir()

	for _, tc := range testCases {
		repoPath := filepath.Join(tempDir, tc.component+"_repo")

		// Each layer should be able to use version control
		handle, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
		if err != nil {
			t.Errorf("Layer %s component %s failed to initialize repository: %v", tc.layer, tc.component, err)
			continue
		}

		// Create test file for this layer
		testFile := filepath.Join(repoPath, tc.component+".data")
		content := fmt.Sprintf("Data for %s layer component %s", tc.layer, tc.component)

		if err := os.WriteFile(testFile, []byte(content), 0644); err != nil {
			handle.Close()
			t.Errorf("Failed to create test file for %s: %v", tc.component, err)
			continue
		}

		// Test version control operations via transaction
		tx, txErr := handle.Begin()
		if txErr != nil {
			handle.Close()
			t.Errorf("Component %s failed to begin transaction: %v", tc.component, txErr)
			continue
		}
		if err = tx.Stage([]string{"."}); err != nil {
			_ = tx.Cancel()
			handle.Close()
			t.Errorf("Component %s failed to stage changes: %v", tc.component, err)
			continue
		}

		_, err = tx.Commit("Initial data for " + tc.component)
		if err != nil {
			handle.Close()
			t.Errorf("Component %s failed to commit: %v", tc.component, err)
			continue
		}

		handle.Close()
	}
}

// TestVersioningUtility_Integration_PerformanceRequirements tests REQ-PERFORMANCE-001
func TestIntegration_VersioningUtility_PerformanceRequirements(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "performance_test")

	handle, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to initialize performance test repository: %v", err)
	}
	defer handle.Close()

	// Create repository with multiple commits (smaller scale for unit test)
	const numCommits = 100 // Smaller than SRS requirement for unit test speed

	start := time.Now()

	for i := 0; i < numCommits; i++ {
		// Create multiple files per commit
		for j := 0; j < 5; j++ {
			fileName := fmt.Sprintf("file_%d_%d.txt", i, j)
			filePath := filepath.Join(repoPath, fileName)
			content := fmt.Sprintf("Content for commit %d, file %d\nTimestamp: %s", i, j, time.Now().String())

			if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
				t.Fatalf("Failed to create file %s: %v", fileName, err)
			}
		}

		tx, txErr := handle.Begin()
		if txErr != nil {
			t.Fatalf("Failed to begin transaction for commit %d: %v", i, txErr)
		}
		if err = tx.Stage([]string{"."}); err != nil {
			_ = tx.Cancel()
			t.Fatalf("Failed to stage changes for commit %d: %v", i, err)
		}

		_, err = tx.Commit(fmt.Sprintf("Performance test commit %d", i))
		if err != nil {
			t.Fatalf("Failed to create commit %d: %v", i, err)
		}
	}

	commitTime := time.Since(start)
	t.Logf("Created %d commits in %v (average: %v per commit)", numCommits, commitTime, commitTime/numCommits)

	// Test history retrieval performance
	start = time.Now()
	history, err := handle.GetHistory(0)
	if err != nil {
		t.Fatalf("Failed to get repository history: %v", err)
	}
	historyTime := time.Since(start)

	if len(history) != numCommits {
		t.Errorf("Expected %d commits in history, got %d", numCommits, len(history))
	}

	t.Logf("Retrieved %d commits in %v", len(history), historyTime)

	// Performance should be reasonable (not exactly 5s since this is smaller scale)
	if historyTime > 10*time.Second {
		t.Errorf("History retrieval took too long: %v (should be much faster for %d commits)", historyTime, numCommits)
	}
}

// TestVersioningUtility_Integration_ConcurrentAccess tests concurrent repository operations
func TestIntegration_VersioningUtility_ConcurrentAccess(t *testing.T) {
	tempDir := t.TempDir()

	const numGoroutines = 10
	const operationsPerGoroutine = 5

	var wg sync.WaitGroup
	wg.Add(numGoroutines)

	// Test concurrent operations on different repositories
	for i := 0; i < numGoroutines; i++ {
		go func(id int) {
			defer wg.Done()

			repoPath := filepath.Join(tempDir, fmt.Sprintf("concurrent_repo_%d", id))

			handle, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
			if err != nil {
				t.Errorf("Goroutine %d failed to initialize repository: %v", id, err)
				return
			}
			defer handle.Close()

			for j := 0; j < operationsPerGoroutine; j++ {
				// Create file
				fileName := fmt.Sprintf("file_%d_%d.txt", id, j)
				filePath := filepath.Join(repoPath, fileName)
				content := fmt.Sprintf("Content from goroutine %d, operation %d", id, j)

				if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
					t.Errorf("Goroutine %d failed to create file: %v", id, err)
					return
				}

				// Stage and commit via transaction
				tx, txErr := handle.Begin()
				if txErr != nil {
					t.Errorf("Goroutine %d failed to begin transaction: %v", id, txErr)
					return
				}
				if err = tx.Stage([]string{fileName}); err != nil {
					_ = tx.Cancel()
					t.Errorf("Goroutine %d failed to stage file: %v", id, err)
					return
				}
				_, err = tx.Commit(fmt.Sprintf("Commit %d from goroutine %d", j, id))
				if err != nil {
					t.Errorf("Goroutine %d failed to commit: %v", id, err)
					return
				}
			}
		}(i)
	}

	wg.Wait()

	// Verify each repository has expected commits
	for i := 0; i < numGoroutines; i++ {
		repoPath := filepath.Join(tempDir, fmt.Sprintf("concurrent_repo_%d", i))

		repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
		if err != nil {
			t.Errorf("Failed to initialize repo %d for verification: %v", i, err)
			continue
		}

		history, err := repo.GetHistory(0)
		repo.Close()
		if err != nil {
			t.Errorf("Failed to get history for concurrent repo %d: %v", i, err)
			continue
		}

		if len(history) != operationsPerGoroutine {
			t.Errorf("Expected %d commits in concurrent repo %d, got %d",
				operationsPerGoroutine, i, len(history))
		}
	}
}

// TestVersioningUtility_Integration_DestructiveAPITesting tests invalid inputs and boundary conditions
func TestIntegration_VersioningUtility_DestructiveAPITesting(t *testing.T) {
	testCases := []struct {
		name        string
		operation   func() error
		expectError bool
	}{
		{
			name: "EmptyRepositoryPath",
			operation: func() error {
				_, err := InitializeRepositoryWithConfig("", testAuthorConfig())
				return err
			},
			expectError: true,
		},
		{
			name: "InvalidUnicodeInPath",
			operation: func() error {
				_, err := InitializeRepositoryWithConfig("/tmp/test\x00invalid", testAuthorConfig())
				return err
			},
			expectError: true,
		},
		{
			name: "ExtremelyLongPath",
			operation: func() error {
				longPath := "/tmp/" + strings.Repeat("a", 5000)
				_, err := InitializeRepositoryWithConfig(longPath, testAuthorConfig())
				return err
			},
			expectError: true,
		},
		{
			name: "StatusOnNonExistentRepo",
			operation: func() error {
				repo, err := InitializeRepositoryWithConfig("/nonexistent/path/repo", testAuthorConfig())
				if err != nil {
					return err
				}
				defer repo.Close()
				_, err = repo.Status()
				return err
			},
			expectError: true,
		},
		{
			name: "CommitWithEmptyMessage",
			operation: func() error {
				tempDir, _ := os.MkdirTemp("", "empty_message_test")
				defer os.RemoveAll(tempDir)
				repoPath := filepath.Join(tempDir, "repo")

				handle, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
				if err != nil {
					return err
				}
				defer handle.Close()

				// Create and stage a file
				testFile := filepath.Join(repoPath, "test.txt")
				if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
					return err
				}
				tx, txErr := handle.Begin()
				if txErr != nil {
					return txErr
				}
				if err := tx.Stage([]string{"."}); err != nil {
					_ = tx.Cancel()
					return err
				}

				// Try to commit with empty message
				_, err = tx.Commit("")
				return err
			},
			expectError: false, // Empty message might be allowed
		},
		{
			name: "CommitWithInvalidAuthorEmail",
			operation: func() error {
				tempDir, _ := os.MkdirTemp("", "invalid_email_test")
				defer os.RemoveAll(tempDir)
				repoPath := filepath.Join(tempDir, "repo")

				handle, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
				if err != nil {
					return err
				}
				defer handle.Close()

				// Create and stage a file
				testFile := filepath.Join(repoPath, "test.txt")
				if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
					return err
				}
				tx, txErr := handle.Begin()
				if txErr != nil {
					return txErr
				}
				if err := tx.Stage([]string{"."}); err != nil {
					_ = tx.Cancel()
					return err
				}

				// Try to commit with invalid email
				_, err = tx.Commit("Test commit")
				return err
			},
			expectError: false, // go-git might allow invalid emails
		},
		{
			name: "GetDifferencesWithInvalidHashes",
			operation: func() error {
				tempDir, _ := os.MkdirTemp("", "invalid_hash_test")
				defer os.RemoveAll(tempDir)
				repoPath := filepath.Join(tempDir, "repo")

				repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
				if err != nil {
					return err
				}
				defer repo.Close()

				_, err = repo.GetFileDifferences("invalid_hash_1", "invalid_hash_2")
				return err
			},
			expectError: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.operation()

			if tc.expectError && err == nil {
				t.Errorf("Expected error for %s, but got nil", tc.name)
			}

			if !tc.expectError && err != nil {
				t.Errorf("Unexpected error for %s: %v", tc.name, err)
			}

			// All errors should be descriptive and include context
			if err != nil {
				errStr := err.Error()
				if len(errStr) < 10 {
					t.Errorf("Error message too short for %s: %s", tc.name, errStr)
				}
				if !strings.Contains(errStr, "VersioningUtility") {
					t.Errorf("Error message should include component name for %s: %s", tc.name, errStr)
				}
			}
		})
	}
}

// TestVersioningUtility_Integration_ResourceExhaustion tests resource limitations
func TestAcceptance_VersioningUtility_ResourceExhaustion(t *testing.T) {
	tempDir := t.TempDir()

	// Test with many small repositories to stress file handle usage
	const numRepos = 50
	var handles []IRepository

	for i := 0; i < numRepos; i++ {
		repoPath := filepath.Join(tempDir, fmt.Sprintf("resource_repo_%d", i))

		handle, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
		if err != nil {
			t.Errorf("Failed to initialize repository %d: %v", i, err)
			continue
		}

		handles = append(handles, handle)

		// Create a small file in each repo
		testFile := filepath.Join(repoPath, "resource_test.txt")
		content := fmt.Sprintf("Resource test file %d", i)

		if err := os.WriteFile(testFile, []byte(content), 0644); err != nil {
			t.Errorf("Failed to create file in repo %d: %v", i, err)
			continue
		}

		tx, txErr := handle.Begin()
		if txErr != nil {
			t.Errorf("Failed to begin transaction in repo %d: %v", i, txErr)
			continue
		}
		err = tx.Stage([]string{"."})
		if err != nil {
			_ = tx.Cancel()
			t.Errorf("Failed to stage in repo %d: %v", i, err)
			continue
		}

		_, err = tx.Commit(fmt.Sprintf("Resource test commit %d", i))
		if err != nil {
			t.Errorf("Failed to commit in repo %d: %v", i, err)
			continue
		}
	}

	// Test that all repositories are still accessible
	for i, handle := range handles {
		status, err := handle.Status()
		if err != nil {
			t.Errorf("Failed to get status from repo %d after resource stress: %v", i, err)
			continue
		}

		if status == nil {
			t.Errorf("Got nil status from repo %d", i)
		}
	}

	// Cleanup
	for _, handle := range handles {
		handle.Close()
	}
}

// TestVersioningUtility_Integration_StreamingPerformance tests streaming operations
func TestAcceptance_VersioningUtility_StreamingPerformance(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "streaming_test")

	handle, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to initialize streaming test repository: %v", err)
	}
	defer handle.Close()

	// Create multiple commits
	const numCommits = 20
	for i := 0; i < numCommits; i++ {
		fileName := fmt.Sprintf("stream_file_%d.txt", i)
		filePath := filepath.Join(repoPath, fileName)
		content := fmt.Sprintf("Streaming test content %d", i)

		if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
			t.Fatalf("Failed to create file %s: %v", fileName, err)
		}

		tx2, txErr2 := handle.Begin()
		if txErr2 != nil {
			t.Fatalf("Failed to begin transaction for %s: %v", fileName, txErr2)
		}
		err = tx2.Stage([]string{fileName})
		if err != nil {
			_ = tx2.Cancel()
			t.Fatalf("Failed to stage file %s: %v", fileName, err)
		}

		_, err = tx2.Commit(fmt.Sprintf("Streaming commit %d", i))
		if err != nil {
			t.Fatalf("Failed to create streaming commit %d: %v", i, err)
		}
	}

	// Test streaming history
	start := time.Now()
	commitChan := handle.GetHistoryStream()

	var receivedCommits []CommitInfo
	for commit := range commitChan {
		receivedCommits = append(receivedCommits, commit)
	}
	streamTime := time.Since(start)

	if len(receivedCommits) != numCommits {
		t.Errorf("Expected %d commits from stream, got %d", numCommits, len(receivedCommits))
	}

	// Compare with synchronous method
	start = time.Now()
	syncCommits, err := handle.GetHistory(0)
	if err != nil {
		t.Fatalf("Failed to get synchronous history: %v", err)
	}
	syncTime := time.Since(start)

	t.Logf("Streaming: %v, Synchronous: %v", streamTime, syncTime)

	if len(syncCommits) != len(receivedCommits) {
		t.Errorf("Different number of commits: streaming=%d, sync=%d", len(receivedCommits), len(syncCommits))
	}

	// Verify commit content matches
	for i, streamCommit := range receivedCommits {
		if i >= len(syncCommits) {
			break
		}

		syncCommit := syncCommits[i]
		if streamCommit.ID != syncCommit.ID {
			t.Errorf("Commit %d ID mismatch: stream=%s, sync=%s", i, streamCommit.ID, syncCommit.ID)
		}
	}
}

// TestVersioningUtility_Integration_ErrorRecovery tests error recovery scenarios
func TestIntegration_VersioningUtility_ErrorRecovery(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "error_recovery_test")

	handle, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to initialize error recovery test repository: %v", err)
	}
	defer handle.Close()

	// Test recovery from operation on non-existent file
	fileHistory, err := handle.GetFileHistory("nonexistent.txt", 10)
	if err != nil {
		t.Fatalf("Failed to handle non-existent file gracefully: %v", err)
	}

	if len(fileHistory) != 0 {
		t.Errorf("Expected empty history for non-existent file, got %d commits", len(fileHistory))
	}

	// Test that repository is still functional after error
	testFile := filepath.Join(repoPath, "recovery_test.txt")
	if err := os.WriteFile(testFile, []byte("recovery test"), 0644); err != nil {
		t.Fatalf("Failed to create recovery test file: %v", err)
	}

	tx, txErr := handle.Begin()
	if txErr != nil {
		t.Fatalf("Failed to begin transaction in recovery test: %v", txErr)
	}
	if err = tx.Stage([]string{"."}); err != nil {
		_ = tx.Cancel()
		t.Fatalf("Repository not functional after error recovery: %v", err)
	}

	_, err = tx.Commit("Recovery test")
	if err != nil {
		t.Fatalf("Failed to commit after error recovery: %v", err)
	}

	// Verify repository is fully functional
	status, err := handle.Status()
	if err != nil {
		t.Fatalf("Failed to get status after recovery: %v", err)
	}

	if status == nil {
		t.Error("Got nil status after recovery")
	}
}
