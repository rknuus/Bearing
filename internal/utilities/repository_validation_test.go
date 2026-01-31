package utilities

import (
	"os"
	"path/filepath"
	"testing"
)

// TestUnit_VersioningUtility_ValidateRepositoryAndPaths_ValidRepository tests successful repository validation
func TestUnit_VersioningUtility_ValidateRepositoryAndPaths_ValidRepository(t *testing.T) {
	// Create test directory
	tmpDir, err := os.MkdirTemp("", "TestValidRepository")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Initialize repository
	gitConfig := &AuthorConfiguration{
		User:  "Test Author",
		Email: "test@example.com",
	}

	repo, err := InitializeRepositoryWithConfig(tmpDir, gitConfig)
	if err != nil {
		t.Fatalf("Failed to initialize repository: %v", err)
	}
	defer repo.Close()

	// Test repository-only validation
	request := RepositoryValidationRequest{
		DirectoryPath: tmpDir,
	}

	result, err := ValidateRepositoryAndPaths(request)
	if err != nil {
		t.Fatalf("Validation failed: %v", err)
	}

	if !result.RepositoryValid {
		t.Errorf("Expected repository to be valid, got invalid. Error: %s", result.ErrorMessage)
	}

	if len(result.ExistingPaths) != 0 || len(result.MissingPaths) != 0 {
		t.Errorf("Expected empty path lists for repository-only validation")
	}
}

// TestUnit_VersioningUtility_ValidateRepositoryAndPaths_InvalidDirectory tests invalid directory handling
func TestUnit_VersioningUtility_ValidateRepositoryAndPaths_InvalidDirectory(t *testing.T) {
	// Test non-existent directory
	request := RepositoryValidationRequest{
		DirectoryPath: "/non/existent/directory",
	}

	result, err := ValidateRepositoryAndPaths(request)
	if err != nil {
		t.Fatalf("Validation function should not return error for invalid directories: %v", err)
	}

	if result.RepositoryValid {
		t.Errorf("Expected repository to be invalid for non-existent directory")
	}

	if result.ErrorMessage == "" {
		t.Errorf("Expected error message for invalid directory")
	}
}

// TestUnit_VersioningUtility_ValidateRepositoryAndPaths_NotGitRepository tests non-git directory handling
func TestUnit_VersioningUtility_ValidateRepositoryAndPaths_NotGitRepository(t *testing.T) {
	// Create test directory without git
	tmpDir, err := os.MkdirTemp("", "TestNotGitRepo")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	request := RepositoryValidationRequest{
		DirectoryPath: tmpDir,
	}

	result, err := ValidateRepositoryAndPaths(request)
	if err != nil {
		t.Fatalf("Validation function should not return error: %v", err)
	}

	if result.RepositoryValid {
		t.Errorf("Expected repository to be invalid for non-git directory")
	}

	if result.ErrorMessage == "" {
		t.Errorf("Expected error message for non-git directory")
	}
}

// TestUnit_VersioningUtility_ValidateRepositoryAndPaths_WithPaths tests path validation
func TestUnit_VersioningUtility_ValidateRepositoryAndPaths_WithPaths(t *testing.T) {
	// Create test directory
	tmpDir, err := os.MkdirTemp("", "TestWithPaths")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Initialize repository
	gitConfig := &AuthorConfiguration{
		User:  "Test Author",
		Email: "test@example.com",
	}

	repo, err := InitializeRepositoryWithConfig(tmpDir, gitConfig)
	if err != nil {
		t.Fatalf("Failed to initialize repository: %v", err)
	}
	defer repo.Close()

	// Create test files and directories
	testFile := filepath.Join(tmpDir, "test.txt")
	testDir := filepath.Join(tmpDir, "testdir")

	if err := os.WriteFile(testFile, []byte("test content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	if err := os.Mkdir(testDir, 0755); err != nil {
		t.Fatalf("Failed to create test directory: %v", err)
	}

	// Test validation with paths
	request := RepositoryValidationRequest{
		DirectoryPath:       tmpDir,
		RequiredFiles:       []string{"test.txt", "missing.txt"},
		RequiredDirectories: []string{"testdir", "missingdir"},
	}

	result, err := ValidateRepositoryAndPaths(request)
	if err != nil {
		t.Fatalf("Validation failed: %v", err)
	}

	if !result.RepositoryValid {
		t.Errorf("Expected repository to be valid")
	}

	// Check existing paths
	expectedExisting := []string{"test.txt", "testdir"}
	if len(result.ExistingPaths) != len(expectedExisting) {
		t.Errorf("Expected %d existing paths, got %d", len(expectedExisting), len(result.ExistingPaths))
	}

	// Check missing paths
	expectedMissing := []string{"missing.txt", "missingdir"}
	if len(result.MissingPaths) != len(expectedMissing) {
		t.Errorf("Expected %d missing paths, got %d", len(expectedMissing), len(result.MissingPaths))
	}
}

// TestUnit_VersioningUtility_ValidateRepositoryAndPaths_EmptyPath tests empty path handling
func TestUnit_VersioningUtility_ValidateRepositoryAndPaths_EmptyPath(t *testing.T) {
	request := RepositoryValidationRequest{
		DirectoryPath: "",
	}

	result, err := ValidateRepositoryAndPaths(request)
	if err != nil {
		t.Fatalf("Validation function should not return error for empty path: %v", err)
	}

	if result.RepositoryValid {
		t.Errorf("Expected repository to be invalid for empty path")
	}

	if result.ErrorMessage == "" {
		t.Errorf("Expected error message for empty path")
	}
}

// TestUnit_VersioningUtility_Repository_ValidateRepositoryAndPaths tests repository method delegation
func TestUnit_VersioningUtility_Repository_ValidateRepositoryAndPaths(t *testing.T) {
	// Create test directory
	tmpDir, err := os.MkdirTemp("", "TestRepoMethod")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Initialize repository
	gitConfig := &AuthorConfiguration{
		User:  "Test Author",
		Email: "test@example.com",
	}

	repo, err := InitializeRepositoryWithConfig(tmpDir, gitConfig)
	if err != nil {
		t.Fatalf("Failed to initialize repository: %v", err)
	}
	defer repo.Close()

	// Test repository method with empty directory path (should use repo's path)
	request := RepositoryValidationRequest{
		DirectoryPath: "",
	}

	result, err := repo.ValidateRepositoryAndPaths(request)
	if err != nil {
		t.Fatalf("Repository validation failed: %v", err)
	}

	if !result.RepositoryValid {
		t.Errorf("Expected repository to be valid when using repository method")
	}
}
