// Package utilities_test provides unit tests for VersioningUtility
package utilities

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Helper function to create test AuthorConfiguration
func testAuthorConfig() *AuthorConfiguration {
	return &AuthorConfiguration{
		User:  "Test Author",
		Email: "test@example.com",
	}
}

// TestVersioningUtility_InitializeRepository_FactoryFunction tests factory function availability
func TestUnit_VersioningUtility_FactoryFunction(t *testing.T) {
	// Test that the factory function is available and works
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "factory_test")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Factory function failed: %v", err)
	}
	defer repo.Close()

	if repo == nil {
		t.Fatal("Factory function returned nil repository")
	}
}

// TestVersioningUtility_InitializeRepository_NewRepository tests creating new repository
func TestUnit_VersioningUtility_NewRepository(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "test_repo")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Expected successful initialization, got error: %v", err)
	}
	defer repo.Close()

	if repo.Path() != repoPath {
		t.Errorf("Expected path %s, got %s", repoPath, repo.Path())
	}

	// Verify .git directory was created
	gitDir := filepath.Join(repoPath, ".git")
	if _, err := os.Stat(gitDir); os.IsNotExist(err) {
		t.Error("Expected .git directory to be created")
	}
}

// TestVersioningUtility_InitializeRepository_ExistingRepository tests opening existing repository
func TestUnit_VersioningUtility_ExistingRepository(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "existing_repo")

	// Create repository first
	repo1, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to create initial repository: %v", err)
	}
	repo1.Close()

	// Open existing repository
	repo2, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Expected successful opening of existing repository, got error: %v", err)
	}
	defer repo2.Close()

	if repo2.Path() != repoPath {
		t.Errorf("Expected path %s, got %s", repoPath, repo2.Path())
	}
}

// TestVersioningUtility_InitializeRepository_InvalidPath tests invalid path handling
func TestUnit_VersioningUtility_InvalidPath(t *testing.T) {
	// Test with read-only parent directory (simulated)
	invalidPath := "/dev/null/invalid_repo"
	_, err := InitializeRepositoryWithConfig(invalidPath, testAuthorConfig())
	if err == nil {
		t.Error("Expected error for invalid path, got nil")
	}
}

// TestVersioningUtility_GetRepositoryStatus tests repository status retrieval
func TestUnit_VersioningUtility_RepositoryStatus(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "status_test")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to initialize repository: %v", err)
	}
	defer repo.Close()

	// Test empty repository status
	status, err := repo.Status()
	if err != nil {
		t.Fatalf("Failed to get repository status: %v", err)
	}

	if status == nil {
		t.Fatal("Expected status object, got nil")
	}

	// Create a test file
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("test content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	// Get status with untracked file
	status, err = repo.Status()
	if err != nil {
		t.Fatalf("Failed to get repository status: %v", err)
	}

	if len(status.UntrackedFiles) == 0 {
		t.Error("Expected untracked files, got none")
	}

	if !containsString(status.UntrackedFiles, "test.txt") {
		t.Error("Expected test.txt to be in untracked files")
	}
}

// TestVersioningUtility_StageChanges tests file staging
func TestUnit_VersioningUtility_StageChanges(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "stage_test")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to initialize repository: %v", err)
	}
	defer repo.Close()

	// Create test files
	testFile1 := filepath.Join(repoPath, "file1.txt")
	testFile2 := filepath.Join(repoPath, "file2.txt")

	if err := os.WriteFile(testFile1, []byte("content1"), 0644); err != nil {
		t.Fatalf("Failed to create test file 1: %v", err)
	}
	if err := os.WriteFile(testFile2, []byte("content2"), 0644); err != nil {
		t.Fatalf("Failed to create test file 2: %v", err)
	}

	// Stage all files via transaction
	tx, txErr := repo.Begin()
	if txErr != nil {
		t.Fatalf("Failed to begin transaction: %v", txErr)
	}
	err = tx.Stage([]string{"."})
	if err != nil {
		_ = tx.Cancel()
		t.Fatalf("Failed to stage changes: %v", err)
	}

	// Check status
	status, err := repo.Status()
	if err != nil {
		t.Fatalf("Failed to get status: %v", err)
	}

	if len(status.StagedFiles) == 0 {
		t.Error("Expected staged files, got none")
	}
}

// TestVersioningUtility_StageChanges_SelectiveStaging tests pattern-based staging
func TestUnit_VersioningUtility_SelectiveStaging(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "selective_stage_test")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to initialize repository: %v", err)
	}
	defer repo.Close()

	// Create test files
	txtFile := filepath.Join(repoPath, "test.txt")
	mdFile := filepath.Join(repoPath, "readme.md")

	if err := os.WriteFile(txtFile, []byte("text content"), 0644); err != nil {
		t.Fatalf("Failed to create txt file: %v", err)
	}
	if err := os.WriteFile(mdFile, []byte("# Readme"), 0644); err != nil {
		t.Fatalf("Failed to create md file: %v", err)
	}

	// Use a transaction for staging to ensure files are visible
	tx2, txErr2 := repo.Begin()
	if txErr2 != nil {
		t.Fatalf("Failed to begin transaction: %v", txErr2)
	}
	err = tx2.Stage([]string{"*.txt"})
	if err != nil {
		_ = tx2.Cancel()
		t.Fatalf("Failed to stage txt files: %v", err)
	}

	status, err := repo.Status()
	if err != nil {
		t.Fatalf("Failed to get status: %v", err)
	}

	// Should have staged txt file but not md file
	if !containsString(status.StagedFiles, "test.txt") {
		t.Error("Expected test.txt to be staged")
	}
	if containsString(status.StagedFiles, "readme.md") {
		t.Error("Expected readme.md to NOT be staged")
	}
}

// TestVersioningUtility_CommitChanges tests commit creation
func TestUnit_VersioningUtility_CommitChanges(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "commit_test")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to initialize repository: %v", err)
	}
	defer repo.Close()

	// Create and stage a test file
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("test content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	tx3, txErr3 := repo.Begin()
	if txErr3 != nil {
		t.Fatalf("Failed to begin transaction: %v", txErr3)
	}
	err = tx3.Stage([]string{"."})
	if err != nil {
		_ = tx3.Cancel()
		t.Fatalf("Failed to stage changes: %v", err)
	}

	// Create commit
	commitHash, err := tx3.Commit("Initial commit")
	if err != nil {
		t.Fatalf("Failed to commit changes: %v", err)
	}

	if commitHash == "" {
		t.Error("Expected commit hash, got empty string")
	}

	if len(commitHash) != 40 { // SHA-1 hash length
		t.Errorf("Expected 40 character hash, got %d characters", len(commitHash))
	}
}

// TestVersioningUtility_GetRepositoryHistory tests commit history retrieval
func TestUnit_VersioningUtility_RepositoryHistory(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "history_test")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to initialize repository: %v", err)
	}
	defer repo.Close()

	// Test empty repository
	history, err := repo.GetHistory(10)
	if err != nil {
		t.Fatalf("Failed to get history from empty repo: %v", err)
	}
	if len(history) != 0 {
		t.Errorf("Expected empty history, got %d commits", len(history))
	}

	// Create commits
	for i := 1; i <= 3; i++ {
		testFile := filepath.Join(repoPath, "file"+string(rune('0'+i))+".txt")
		content := []byte("content " + string(rune('0'+i)))

		if err := os.WriteFile(testFile, content, 0644); err != nil {
			t.Fatalf("Failed to create test file %d: %v", i, err)
		}

		tx4, txErr4 := repo.Begin()
		if txErr4 != nil {
			t.Fatalf("Failed to begin transaction: %v", txErr4)
		}
		err = tx4.Stage([]string{"."})
		if err != nil {
			_ = tx4.Cancel()
			t.Fatalf("Failed to stage changes %d: %v", i, err)
		}

		_, err = tx4.Commit("Commit " + string(rune('0'+i)))
		if err != nil {
			t.Fatalf("Failed to commit %d: %v", i, err)
		}

		// Small delay to ensure different timestamps
		time.Sleep(10 * time.Millisecond)
	}

	// Get full history
	history, err = repo.GetHistory(0)
	if err != nil {
		t.Fatalf("Failed to get repository history: %v", err)
	}

	if len(history) != 3 {
		t.Errorf("Expected 3 commits, got %d", len(history))
	}

	// Verify commit info
	for _, commit := range history {
		if commit.ID == "" {
			t.Error("Expected commit ID, got empty")
		}
		if commit.Author != "Test Author" {
			t.Errorf("Expected author 'Test Author', got '%s'", commit.Author)
		}
		if commit.Email != "test@example.com" {
			t.Errorf("Expected email 'test@example.com', got '%s'", commit.Email)
		}
		if commit.Timestamp.IsZero() {
			t.Error("Expected timestamp, got zero time")
		}
		if commit.Message == "" {
			t.Error("Expected commit message, got empty")
		}
	}

	// Test with limit
	limitedHistory, err := repo.GetHistory(2)
	if err != nil {
		t.Fatalf("Failed to get limited history: %v", err)
	}

	if len(limitedHistory) != 2 {
		t.Errorf("Expected 2 commits with limit, got %d", len(limitedHistory))
	}
}

// TestVersioningUtility_GetRepositoryHistoryStream tests streaming commit history
func TestUnit_VersioningUtility_RepositoryHistoryStream(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "stream_test")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to initialize repository: %v", err)
	}
	defer repo.Close()

	// Create a commit
	testFile := filepath.Join(repoPath, "stream_test.txt")
	if err := os.WriteFile(testFile, []byte("stream content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	tx5, txErr5 := repo.Begin()
	if txErr5 != nil {
		t.Fatalf("Failed to begin transaction: %v", txErr5)
	}
	err = tx5.Stage([]string{"."})
	if err != nil {
		_ = tx5.Cancel()
		t.Fatalf("Failed to stage changes: %v", err)
	}

	_, err = tx5.Commit("Stream test commit")
	if err != nil {
		t.Fatalf("Failed to commit: %v", err)
	}

	// Test streaming
	commitChan := repo.GetHistoryStream()

	var receivedCommits []CommitInfo
	for commit := range commitChan {
		receivedCommits = append(receivedCommits, commit)
	}

	if len(receivedCommits) != 1 {
		t.Errorf("Expected 1 commit from stream, got %d", len(receivedCommits))
	}

	if len(receivedCommits) > 0 {
		commit := receivedCommits[0]
		if commit.Author != "Test Author" {
			t.Errorf("Expected author 'Test Author', got '%s'", commit.Author)
		}
		if !strings.Contains(commit.Message, "Stream test commit") {
			t.Errorf("Expected commit message to contain 'Stream test commit', got '%s'", commit.Message)
		}
	}
}

// TestVersioningUtility_GetFileHistory tests file-specific history
func TestUnit_VersioningUtility_FileHistory(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "file_history_test")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to initialize repository: %v", err)
	}
	defer repo.Close()

	testFile := filepath.Join(repoPath, "tracked_file.txt")
	otherFile := filepath.Join(repoPath, "other_file.txt")

	// Create initial commit with tracked file
	if err := os.WriteFile(testFile, []byte("version 1"), 0644); err != nil {
		t.Fatalf("Failed to create tracked file: %v", err)
	}
	if err := os.WriteFile(otherFile, []byte("other content"), 0644); err != nil {
		t.Fatalf("Failed to create other file: %v", err)
	}

	tx6, txErr6 := repo.Begin()
	if txErr6 != nil {
		t.Fatalf("Failed to begin transaction: %v", txErr6)
	}
	err = tx6.Stage([]string{"."})
	if err != nil {
		_ = tx6.Cancel()
		t.Fatalf("Failed to stage initial changes: %v", err)
	}

	_, err = tx6.Commit("Initial commit")
	if err != nil {
		t.Fatalf("Failed to create initial commit: %v", err)
	}

	// Modify only the tracked file
	if err := os.WriteFile(testFile, []byte("version 2"), 0644); err != nil {
		t.Fatalf("Failed to modify tracked file: %v", err)
	}

	tx7, txErr7 := repo.Begin()
	if txErr7 != nil {
		t.Fatalf("Failed to begin transaction: %v", txErr7)
	}
	err = tx7.Stage([]string{"tracked_file.txt"})
	if err != nil {
		_ = tx7.Cancel()
		t.Fatalf("Failed to stage tracked file: %v", err)
	}

	_, err = tx7.Commit("Updated tracked file")
	if err != nil {
		t.Fatalf("Failed to commit tracked file update: %v", err)
	}

	// Get file history
	fileHistory, err := repo.GetFileHistory("tracked_file.txt", 0)
	if err != nil {
		t.Fatalf("Failed to get file history: %v", err)
	}

	if len(fileHistory) != 2 {
		t.Errorf("Expected 2 commits in file history, got %d", len(fileHistory))
	}

	// Test non-existent file
	nonExistentHistory, err := repo.GetFileHistory("nonexistent.txt", 0)
	if err != nil {
		t.Fatalf("Failed to get history for non-existent file: %v", err)
	}

	if len(nonExistentHistory) != 0 {
		t.Errorf("Expected 0 commits for non-existent file, got %d", len(nonExistentHistory))
	}
}

// TestVersioningUtility_GetFileDifferences tests file difference retrieval
func TestUnit_VersioningUtility_FileDifferences(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "diff_test")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to initialize repository: %v", err)
	}
	defer repo.Close()

	testFile := filepath.Join(repoPath, "diff_file.txt")

	// Create first commit
	if err := os.WriteFile(testFile, []byte("line 1\nline 2\nline 3\n"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	tx8, txErr8 := repo.Begin()
	if txErr8 != nil {
		t.Fatalf("Failed to begin transaction: %v", txErr8)
	}
	err = tx8.Stage([]string{"."})
	if err != nil {
		_ = tx8.Cancel()
		t.Fatalf("Failed to stage first version: %v", err)
	}

	hash1, err := tx8.Commit("First version")
	if err != nil {
		t.Fatalf("Failed to commit first version: %v", err)
	}

	// Create second commit
	if err := os.WriteFile(testFile, []byte("line 1\nmodified line 2\nline 3\nline 4\n"), 0644); err != nil {
		t.Fatalf("Failed to modify test file: %v", err)
	}

	tx9, txErr9 := repo.Begin()
	if txErr9 != nil {
		t.Fatalf("Failed to begin transaction: %v", txErr9)
	}
	err = tx9.Stage([]string{"."})
	if err != nil {
		_ = tx9.Cancel()
		t.Fatalf("Failed to stage second version: %v", err)
	}

	hash2, err := tx9.Commit("Second version")
	if err != nil {
		t.Fatalf("Failed to commit second version: %v", err)
	}

	// Get differences
	diff, err := repo.GetFileDifferences(hash1, hash2)
	if err != nil {
		t.Fatalf("Failed to get file differences: %v", err)
	}

	if len(diff) == 0 {
		t.Error("Expected diff content, got empty")
	}

	diffString := string(diff)
	if !strings.Contains(diffString, "modified line 2") {
		t.Error("Expected diff to contain 'modified line 2'")
	}
	if !strings.Contains(diffString, "line 4") {
		t.Error("Expected diff to contain 'line 4'")
	}
}

// TestVersioningUtility_InvalidCommitHash tests error handling for invalid commit hashes
func TestUnit_VersioningUtility_InvalidCommitHash(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "invalid_hash_test")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to initialize repository: %v", err)
	}
	defer repo.Close()

	// Test with invalid hash
	_, err = repo.GetFileDifferences("invalid_hash", "another_invalid_hash")
	if err == nil {
		t.Error("Expected error for invalid commit hashes, got nil")
	}
}

// TestRepositoryHandle_StatusAndOperations tests repository repo operations
func TestUnit_VersioningUtility_RepositoryHandle(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "repo_test")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to initialize repository: %v", err)
	}
	defer repo.Close()

	// Test path
	if repo.Path() != repoPath {
		t.Errorf("Expected path %s, got %s", repoPath, repo.Path())
	}

	// Create test file
	testFile := filepath.Join(repoPath, "repo_test.txt")
	if err := os.WriteFile(testFile, []byte("repo test"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	// Test status
	status, err := repo.Status()
	if err != nil {
		t.Fatalf("Failed to get status from repo: %v", err)
	}

	if len(status.UntrackedFiles) == 0 {
		t.Error("Expected untracked files from repo status")
	}

	// Test staging
	tx10, txErr10 := repo.Begin()
	if txErr10 != nil {
		t.Fatalf("Failed to begin transaction: %v", txErr10)
	}
	err = tx10.Stage([]string{"."})
	if err != nil {
		_ = tx10.Cancel()
		t.Fatalf("Failed to stage via repo: %v", err)
	}

	// Test commit
	commitHash, err := tx10.Commit("Handle test commit")
	if err != nil {
		t.Fatalf("Failed to commit via repo: %v", err)
	}

	if commitHash == "" {
		t.Error("Expected commit hash from repo, got empty")
	}
}

// TestRepositoryHandle_ConflictDetection tests conflict detection
func TestUnit_VersioningUtility_ConflictDetection(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "conflict_test")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to initialize repository: %v", err)
	}
	defer repo.Close()

	// For now, just test that conflict detection doesn't crash
	// Full conflict testing would require more complex git state manipulation
	status, err := repo.Status()
	if err != nil {
		t.Fatalf("Failed to get status for conflict test: %v", err)
	}

	// In a clean repo, there should be no conflicts
	if status.HasConflicts {
		t.Error("Expected no conflicts in clean repository")
	}
}

// Helper function to check if slice contains string
func containsString(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

// Transaction coverage tests

// TestUnit_VersioningUtility_Transaction_Basic covers Begin/Stage/Commit happy path
func TestUnit_VersioningUtility_Transaction_Basic(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "tx_basic_repo")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to initialize repository: %v", err)
	}
	defer repo.Close()

	// Create a file
	filePath := filepath.Join(repoPath, "a.txt")
	if err := os.WriteFile(filePath, []byte("hello"), 0644); err != nil {
		t.Fatalf("Failed to write file: %v", err)
	}

	tx, err := repo.Begin()
	if err != nil {
		t.Fatalf("Begin failed: %v", err)
	}
	if err := tx.Stage([]string{"a.txt"}); err != nil {
		_ = tx.Cancel()
		t.Fatalf("Stage failed: %v", err)
	}
	commitHash, err := tx.Commit("tx basic")
	if err != nil {
		t.Fatalf("Commit failed: %v", err)
	}
	if commitHash == "" {
		t.Error("Expected non-empty commit hash from transaction commit")
	}
}

// TestUnit_VersioningUtility_Transaction_CancelReleasesLock ensures Cancel unblocks other Begin
func TestUnit_VersioningUtility_Transaction_CancelReleasesLock(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "tx_cancel_release")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}
	defer repo.Close()

	tx1, err := repo.Begin()
	if err != nil {
		t.Fatalf("Begin tx1 failed: %v", err)
	}

	done := make(chan struct{}, 1)
	go func() {
		tx2, err := repo.Begin()
		if err == nil {
			_ = tx2.Cancel()
		}
		close(done)
	}()

	// Should remain blocked briefly
	select {
	case <-done:
		t.Fatal("tx2 should not have begun before tx1 is released")
	case <-time.After(150 * time.Millisecond):
	}

	_ = tx1.Cancel()
	select {
	case <-done:
		// ok
	case <-time.After(1 * time.Second):
		t.Fatal("tx2 did not begin after tx1 cancel")
	}
}

// TestUnit_VersioningUtility_Transaction_CommitReleasesLock ensures Commit unblocks other Begin
func TestUnit_VersioningUtility_Transaction_CommitReleasesLock(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "tx_commit_release")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to init repo: %v", err)
	}
	defer repo.Close()

	// Prepare content to allow commit to succeed
	if err := os.WriteFile(filepath.Join(repoPath, "f.txt"), []byte("x"), 0644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	tx1, err := repo.Begin()
	if err != nil {
		t.Fatalf("Begin tx1 failed: %v", err)
	}
	if err := tx1.Stage([]string{"f.txt"}); err != nil {
		_ = tx1.Cancel()
		t.Fatalf("stage: %v", err)
	}

	done := make(chan struct{}, 1)
	go func() {
		tx2, err := repo.Begin()
		if err == nil {
			_ = tx2.Cancel()
		}
		close(done)
	}()

	// Commit and release
	if _, err := tx1.Commit("msg"); err != nil {
		t.Fatalf("commit: %v", err)
	}

	select {
	case <-done:
		// ok
	case <-time.After(1 * time.Second):
		t.Fatal("tx2 did not begin after tx1 commit")
	}
}

// TestUnit_VersioningUtility_Transaction_Idempotency checks multiple finalizations
func TestUnit_VersioningUtility_Transaction_Idempotency(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "tx_idem")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("init repo: %v", err)
	}
	defer repo.Close()

	tx, err := repo.Begin()
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	if err := tx.Cancel(); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	// second cancel should be no-op
	if err := tx.Cancel(); err != nil {
		t.Fatalf("second cancel: %v", err)
	}
	// commit after cancel must error
	if _, err := tx.Commit("x"); err == nil {
		t.Fatal("expected commit error after cancel")
	}
}

// TestUnit_VersioningUtility_Transaction_SymlinkSerialization ensures canonical path locking with symlink
func TestUnit_VersioningUtility_Transaction_SymlinkSerialization(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "real")
	symlinkPath := filepath.Join(tempDir, "link")

	repo1, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("init real: %v", err)
	}
	defer repo1.Close()

	if err := os.Symlink(repoPath, symlinkPath); err != nil {
		t.Fatalf("symlink: %v", err)
	}

	repo2, err := InitializeRepositoryWithConfig(symlinkPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("init link: %v", err)
	}
	defer repo2.Close()

	tx1, err := repo1.Begin()
	if err != nil {
		t.Fatalf("begin tx1: %v", err)
	}

	done := make(chan struct{}, 1)
	go func() {
		tx2, err := repo2.Begin()
		if err == nil {
			_ = tx2.Cancel()
		}
		close(done)
	}()

	select {
	case <-done:
		t.Fatal("repo2 begin should block while repo1 holds lock")
	case <-time.After(150 * time.Millisecond):
	}

	_ = tx1.Cancel()
	select {
	case <-done:
		// ok
	case <-time.After(1 * time.Second):
		t.Fatal("repo2 begin did not proceed after repo1 cancel")
	}
}

// TestUnit_VersioningUtility_Transaction_CancelNoCommit ensures cancel leaves history unchanged
func TestUnit_VersioningUtility_Transaction_CancelNoCommit(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "tx_cancel_no_commit")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("init repo: %v", err)
	}
	defer repo.Close()

	initialHistory, err := repo.GetHistory(0)
	if err != nil {
		t.Fatalf("get history: %v", err)
	}
	initialCount := len(initialHistory)

	if err := os.WriteFile(filepath.Join(repoPath, "x.txt"), []byte("x"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	tx, err := repo.Begin()
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	if err := tx.Stage([]string{"x.txt"}); err != nil {
		_ = tx.Cancel()
		t.Fatalf("stage: %v", err)
	}
	_ = tx.Cancel()

	afterHistory, err := repo.GetHistory(0)
	if err != nil {
		t.Fatalf("history after cancel: %v", err)
	}
	if len(afterHistory) != initialCount {
		t.Fatalf("expected no new commits after cancel, got %d vs %d", len(afterHistory), initialCount)
	}
}

// TestUnit_VersioningUtility_Transaction_FinalizedBehavior ensures methods error after commit/cancel
func TestUnit_VersioningUtility_Transaction_FinalizedBehavior(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "tx_finalize_repo")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to initialize repository: %v", err)
	}
	defer repo.Close()

	tx, err := repo.Begin()
	if err != nil {
		t.Fatalf("Begin failed: %v", err)
	}
	if err := tx.Cancel(); err != nil {
		t.Fatalf("Cancel failed: %v", err)
	}

	if err := tx.Stage([]string{"."}); err == nil {
		t.Error("Expected error on Stage after Cancel, got nil")
	}
	if _, err := tx.Commit("msg"); err == nil {
		t.Error("Expected error on Commit after Cancel, got nil")
	}
}

// TestUnit_VersioningUtility_Transaction_Serialization ensures same-repo transactions serialize
func TestUnit_VersioningUtility_Transaction_Serialization(t *testing.T) {
	tempDir := t.TempDir()
	repoPath := filepath.Join(tempDir, "tx_serial_repo")

	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to initialize repository: %v", err)
	}
	defer repo.Close()

	// Hold a transaction lock
	tx1, err := repo.Begin()
	if err != nil {
		t.Fatalf("Begin tx1 failed: %v", err)
	}

	started := make(chan struct{}, 1)
	done := make(chan struct{}, 1)

	go func() {
		close(started)
		// This Begin should block until tx1 is finalized
		tx2, err := repo.Begin()
		if err == nil {
			_ = tx2.Cancel()
		}
		close(done)
	}()

	// Ensure goroutine started
	select {
	case <-started:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("goroutine did not start in time")
	}

	// Verify it does not complete before we release tx1
	select {
	case <-done:
		t.Fatal("second Begin should have been blocked while tx1 held the lock")
	case <-time.After(200 * time.Millisecond):
		// expected: still blocked
	}

	// Release tx1 and expect tx2 to proceed shortly
	_ = tx1.Cancel()
	select {
	case <-done:
		// ok
	case <-time.After(1 * time.Second):
		t.Fatal("second Begin did not proceed after releasing tx1")
	}
}

// TestUnit_VersioningUtility_Transaction_DifferentRepos_NoBlocking ensures different repos don't block each other
func TestUnit_VersioningUtility_Transaction_DifferentRepos_NoBlocking(t *testing.T) {
	tempDir := t.TempDir()
	repoPathA := filepath.Join(tempDir, "repoA")
	repoPathB := filepath.Join(tempDir, "repoB")

	repoA, err := InitializeRepositoryWithConfig(repoPathA, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to initialize repoA: %v", err)
	}
	defer repoA.Close()

	repoB, err := InitializeRepositoryWithConfig(repoPathB, testAuthorConfig())
	if err != nil {
		t.Fatalf("Failed to initialize repoB: %v", err)
	}
	defer repoB.Close()

	// Hold tx on repoA
	txA, err := repoA.Begin()
	if err != nil {
		t.Fatalf("Begin on repoA failed: %v", err)
	}
	defer func() { _ = txA.Cancel() }()

	done := make(chan error, 1)
	go func() {
		txB, err := repoB.Begin()
		if err == nil {
			_ = txB.Cancel()
		}
		done <- err
	}()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Begin on repoB returned error: %v", err)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("Begin on repoB should not block due to repoA transaction")
	}
}
