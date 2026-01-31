// Package utilities provides core utilities implementing the iDesign methodology.
// This package contains utility components that provide essential services
// to higher-level components in the application architecture.
package utilities

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

// AuthorConfiguration represents git user configuration
type AuthorConfiguration struct {
	User  string // Git commit author name
	Email string // Git commit author email
}

// CommitInfo represents information about a single commit
type CommitInfo struct {
	ID        string    // Commit hash
	Author    string    // Author name
	Email     string    // Author email
	Timestamp time.Time // Commit timestamp
	Message   string    // Commit message
}

// RepositoryStatus represents the current state of a repository
type RepositoryStatus struct {
	CurrentBranch  string   // Active branch name
	ModifiedFiles  []string // List of changed files
	StagedFiles    []string // List of files ready for commit
	UntrackedFiles []string // List of unversioned files
	HasConflicts   bool     // Indicates presence of merge conflicts
}

// Global per-repository serialization (canonical-path keyed)
var (
	repoLocksMu sync.Mutex
	repoLocks   = map[string]*sync.Mutex{}
)

func getRepoLock(canonicalPath string) *sync.Mutex {
	repoLocksMu.Lock()
	defer repoLocksMu.Unlock()
	if m := repoLocks[canonicalPath]; m != nil {
		return m
	}
	m := &sync.Mutex{}
	repoLocks[canonicalPath] = m
	return m
}

func canonicalizePath(p string) (string, error) {
	abs, err := filepath.Abs(p)
	if err != nil {
		return "", err
	}
	eval, err := filepath.EvalSymlinks(abs)
	if err != nil {
		// If no symlink, fall back to abs
		return abs, nil
	}
	return eval, nil
}

// RepositoryValidationRequest defines validation parameters
type RepositoryValidationRequest struct {
	DirectoryPath       string   // Path to directory to validate as repository
	RequiredFiles       []string // Optional: files that must exist (empty for repository-only validation)
	RequiredDirectories []string // Optional: directories that must exist (empty for repository-only validation)
}

// RepositoryValidationResult provides validation outcome
type RepositoryValidationResult struct {
	RepositoryValid  bool     // Repository validation success
	ExistingPaths    []string // Files/directories that exist (empty if no paths specified)
	MissingPaths     []string // Files/directories missing (empty if no paths specified)
	ErrorMessage     string   // Human-readable error for failures
	TechnicalDetails string   // Detailed error information for debugging
}

// InitializeRepositoryWithConfig initializes or opens a repository with git configuration
func InitializeRepositoryWithConfig(path string, gitConfig *AuthorConfiguration) (IRepository, error) {
	logger := slog.Default()

	// Validate git configuration is provided
	if gitConfig == nil {
		return nil, fmt.Errorf("InitializeRepositoryWithConfig requires AuthorConfiguration - cannot be nil")
	}

	if gitConfig.User == "" || gitConfig.Email == "" {
		return nil, fmt.Errorf("InitializeRepositoryWithConfig requires complete AuthorConfiguration - both user (%s) and email (%s) must be non-empty", gitConfig.User, gitConfig.Email)
	}

	logger.Debug("Initializing repository",
		"path", path,
		"user", gitConfig.User,
		"email", gitConfig.Email)

	// Validate path is not empty
	if strings.TrimSpace(path) == "" {
		return nil, fmt.Errorf("VersioningUtility.InitializeRepository cannot initialize repository with empty path")
	}

	// Ensure directory exists
	if err := os.MkdirAll(path, 0755); err != nil {
		return nil, fmt.Errorf("VersioningUtility.InitializeRepository failed to create directory: %w", err)
	}

	// Initialize or open Git repository
	var gitRepo *git.Repository
	var err error

	// Try to open existing repository first
	gitRepo, err = git.PlainOpen(path)
	if err != nil {
		// Repository doesn't exist, create new one
		gitRepo, err = git.PlainInit(path, false)
		if err != nil {
			return nil, fmt.Errorf("VersioningUtility.InitializeRepository failed to initialize Git repository: %w", err)
		}
	}

	canon, _ := canonicalizePath(path)
	repo := &repository{
		path:          path,
		canonicalPath: canon,
		gitRepo:       gitRepo,
		gitConfig:     gitConfig,
		mutex:         &sync.RWMutex{},
		logger:        logger,
	}

	logger.Info("Repository initialized successfully", "path", path)

	return repo, nil
}

// ValidateRepositoryAndPaths validates a directory as a git repository and optionally checks file/directory existence
func ValidateRepositoryAndPaths(request RepositoryValidationRequest) (*RepositoryValidationResult, error) {
	logger := slog.Default()

	logger.Debug("Validating repository and paths",
		"directory_path", request.DirectoryPath,
		"required_files_count", len(request.RequiredFiles),
		"required_dirs_count", len(request.RequiredDirectories))

	// Validate input parameters
	if strings.TrimSpace(request.DirectoryPath) == "" {
		return &RepositoryValidationResult{
			RepositoryValid:  false,
			ErrorMessage:     "Directory path cannot be empty",
			TechnicalDetails: "RepositoryValidationRequest.DirectoryPath is empty or contains only whitespace",
		}, nil
	}

	// Check if directory exists and is accessible
	dirInfo, err := os.Stat(request.DirectoryPath)
	if err != nil {
		if os.IsNotExist(err) {
			return &RepositoryValidationResult{
				RepositoryValid:  false,
				ErrorMessage:     "Directory does not exist",
				TechnicalDetails: fmt.Sprintf("Directory path '%s' does not exist: %v", request.DirectoryPath, err),
			}, nil
		}
		return &RepositoryValidationResult{
			RepositoryValid:  false,
			ErrorMessage:     "Cannot access directory",
			TechnicalDetails: fmt.Sprintf("Failed to access directory '%s': %v", request.DirectoryPath, err),
		}, nil
	}

	// Verify it's actually a directory
	if !dirInfo.IsDir() {
		return &RepositoryValidationResult{
			RepositoryValid:  false,
			ErrorMessage:     "Path points to file, not directory",
			TechnicalDetails: fmt.Sprintf("Path '%s' points to a file, not a directory", request.DirectoryPath),
		}, nil
	}

	// Check for .git directory
	gitPath := filepath.Join(request.DirectoryPath, ".git")
	gitInfo, err := os.Stat(gitPath)
	if err != nil {
		if os.IsNotExist(err) {
			return &RepositoryValidationResult{
				RepositoryValid:  false,
				ErrorMessage:     "Directory is not a git repository",
				TechnicalDetails: fmt.Sprintf("No .git directory found in '%s'", request.DirectoryPath),
			}, nil
		}
		return &RepositoryValidationResult{
			RepositoryValid:  false,
			ErrorMessage:     "Cannot access git repository structure",
			TechnicalDetails: fmt.Sprintf("Failed to access .git directory in '%s': %v", request.DirectoryPath, err),
		}, nil
	}

	if !gitInfo.IsDir() {
		return &RepositoryValidationResult{
			RepositoryValid:  false,
			ErrorMessage:     "Invalid git repository structure",
			TechnicalDetails: fmt.Sprintf(".git in '%s' is not a directory", request.DirectoryPath),
		}, nil
	}

	// Try to open the repository to verify it's valid
	_, err = git.PlainOpen(request.DirectoryPath)
	if err != nil {
		return &RepositoryValidationResult{
			RepositoryValid:  false,
			ErrorMessage:     "Corrupted git repository",
			TechnicalDetails: fmt.Sprintf("Failed to open git repository at '%s': %v", request.DirectoryPath, err),
		}, nil
	}

	// Repository validation successful
	result := &RepositoryValidationResult{
		RepositoryValid:  true,
		ExistingPaths:    make([]string, 0),
		MissingPaths:     make([]string, 0),
		ErrorMessage:     "",
		TechnicalDetails: "",
	}

	// If no paths to validate, return successful repository validation
	if len(request.RequiredFiles) == 0 && len(request.RequiredDirectories) == 0 {
		logger.Info("Repository validation successful", "directory_path", request.DirectoryPath)
		return result, nil
	}

	// Validate required files
	for _, filePath := range request.RequiredFiles {
		if strings.TrimSpace(filePath) == "" {
			continue // Skip empty file paths
		}

		fullPath := filepath.Join(request.DirectoryPath, filePath)
		if _, err := os.Stat(fullPath); err == nil {
			result.ExistingPaths = append(result.ExistingPaths, filePath)
		} else {
			result.MissingPaths = append(result.MissingPaths, filePath)
		}
	}

	// Validate required directories
	for _, dirPath := range request.RequiredDirectories {
		if strings.TrimSpace(dirPath) == "" {
			continue // Skip empty directory paths
		}

		fullPath := filepath.Join(request.DirectoryPath, dirPath)
		if info, err := os.Stat(fullPath); err == nil && info.IsDir() {
			result.ExistingPaths = append(result.ExistingPaths, dirPath)
		} else {
			result.MissingPaths = append(result.MissingPaths, dirPath)
		}
	}

	logger.Info("Repository and path validation completed",
		"directory_path", request.DirectoryPath,
		"repository_valid", result.RepositoryValid,
		"existing_paths", len(result.ExistingPaths),
		"missing_paths", len(result.MissingPaths))

	return result, nil
}

// Repository provides version control operations for a specific repository
type IRepository interface {
	Path() string
	Status() (*RepositoryStatus, error)
	// Begin starts a Transaction that holds a per-repo lock across multiple state operations until you commit or cancel.
	Begin() (ITransaction, error)

	// Dual approach: limited sync + unlimited streaming
	GetHistory(limit int) ([]CommitInfo, error)
	GetHistoryStream() <-chan CommitInfo

	GetFileHistory(filePath string, limit int) ([]CommitInfo, error)
	GetFileHistoryStream(filePath string) <-chan CommitInfo

	GetFileDifferences(hash1, hash2 string) ([]byte, error)

	// Repository validation
	ValidateRepositoryAndPaths(request RepositoryValidationRequest) (*RepositoryValidationResult, error)

	Close() error
}

// repository implements Repository
type repository struct {
	path          string
	canonicalPath string
	gitRepo       *git.Repository
	gitConfig     *AuthorConfiguration
	mutex         *sync.RWMutex
	logger        *slog.Logger
}

// Repository Implementation

// Path returns the absolute path of the repository
func (r *repository) Path() string {
	return r.path
}

// Status returns the current status of the repository
func (r *repository) Status() (*RepositoryStatus, error) {
	r.mutex.RLock()
	defer r.mutex.RUnlock()

	return r.statusInternal()
}

// statusInternal returns repository status without acquiring locks (for internal use)
func (r *repository) statusInternal() (*RepositoryStatus, error) {
	workTree, err := r.gitRepo.Worktree()
	if err != nil {
		return nil, fmt.Errorf("repository.Status failed to get worktree for %s: %w", r.path, err)
	}

	status, err := workTree.Status()
	if err != nil {
		return nil, fmt.Errorf("repository.Status failed to get status for %s: %w", r.path, err)
	}

	// Get current branch
	head, err := r.gitRepo.Head()
	var currentBranch string
	if err != nil {
		currentBranch = "HEAD" // Detached HEAD or empty repo
	} else {
		currentBranch = head.Name().Short()
	}

	// Parse status
	var modifiedFiles, stagedFiles, untrackedFiles []string
	hasConflicts := false

	for filename, fileStatus := range status {
		// Priority order: staged > modified > untracked
		if fileStatus.Staging != git.Unmodified && fileStatus.Staging != git.Untracked {
			stagedFiles = append(stagedFiles, filename)
		} else if fileStatus.Worktree == git.Untracked || fileStatus.Staging == git.Untracked {
			untrackedFiles = append(untrackedFiles, filename)
		} else if fileStatus.Worktree != git.Unmodified {
			modifiedFiles = append(modifiedFiles, filename)
		}

		// Check for conflicts
		if fileStatus.Staging == git.UpdatedButUnmerged {
			hasConflicts = true
		}
	}

	return &RepositoryStatus{
		CurrentBranch:  currentBranch,
		ModifiedFiles:  modifiedFiles,
		StagedFiles:    stagedFiles,
		UntrackedFiles: untrackedFiles,
		HasConflicts:   hasConflicts,
	}, nil
}

// Stage stages files matching the provided patterns
func (r *repository) Stage(patterns []string) error {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	workTree, err := r.gitRepo.Worktree()
	if err != nil {
		return fmt.Errorf("repository.Stage failed to get worktree for %s: %w", r.path, err)
	}

	// First check for conflicts to prevent staging conflicted files
	status, err := r.statusInternal()
	if err != nil {
		return fmt.Errorf("repository.Stage failed to get status for %s: %w", r.path, err)
	}

	if status.HasConflicts {
		return fmt.Errorf("repository.Stage cannot stage files while conflicts exist in %s", r.path)
	}

	// Stage matching files
	for _, pattern := range patterns {
		if pattern == "." {
			// Stage all files
			_, err := workTree.Add(".")
			if err != nil {
				return fmt.Errorf("repository.Stage failed to stage all files in %s: %w", r.path, err)
			}
		} else if strings.Contains(pattern, "*") || strings.Contains(pattern, "?") {
			// Handle glob patterns by expanding them
			matches, err := filepath.Glob(filepath.Join(r.path, pattern))
			if err != nil {
				r.logger.Error("Repository staging error",
					"operation", "Stage",
					"path", r.path,
					"pattern", pattern,
					"error", err,
					"details", "failed to expand glob pattern")
				continue
			}

			// Stage each matched file
			for _, match := range matches {
				// Convert absolute path to relative path from repo root
				relPath, err := filepath.Rel(r.path, match)
				if err != nil {
					r.logger.Error("Repository staging error",
						"operation", "Stage",
						"path", r.path,
						"file", match,
						"error", err,
						"details", "failed to get relative path")
					continue
				}

				_, err = workTree.Add(relPath)
				if err != nil {
					r.logger.Error("Repository staging error",
						"operation", "Stage",
						"path", r.path,
						"file", relPath,
						"error", err,
						"details", "failed to stage matched file")
					continue
				}
			}
		} else {
			// Stage specific file path
			_, err := workTree.Add(pattern)
			if err != nil {
				r.logger.Error("Repository staging error",
					"operation", "Stage",
					"path", r.path,
					"pattern", pattern,
					"error", err,
					"details", "failed to stage file")
				// Continue with other patterns instead of failing entirely
				continue
			}
		}
	}

	r.logger.Debug("Files staged successfully",
		"path", r.path,
		"patterns", patterns)

	return nil
}

// Commit creates a commit with all staged changes
func (r *repository) Commit(message string) (string, error) {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	// Validate that git configuration is available
	if r.gitConfig == nil {
		return "", fmt.Errorf("repository.Commit no git configuration available - repository must be initialized with AuthorConfiguration")
	}

	if r.gitConfig.User == "" || r.gitConfig.Email == "" {
		return "", fmt.Errorf("repository.Commit git configuration incomplete - both user (%s) and email (%s) are required", r.gitConfig.User, r.gitConfig.Email)
	}

	workTree, err := r.gitRepo.Worktree()
	if err != nil {
		return "", fmt.Errorf("repository.Commit failed to get worktree for %s: %w", r.path, err)
	}

	commitHash, err := workTree.Commit(message, &git.CommitOptions{
		Author: &object.Signature{
			Name:  r.gitConfig.User,
			Email: r.gitConfig.Email,
			When:  time.Now(),
		},
	})
	if err != nil {
		return "", fmt.Errorf("repository.Commit failed to create commit in %s: %w", r.path, err)
	}

	r.logger.Info("Commit created successfully",
		"path", r.path,
		"hash", commitHash.String(),
		"author", r.gitConfig.User,
		"email", r.gitConfig.Email)

	return commitHash.String(), nil
}

// ITransaction facet provides a repository-scoped critical section and mutating ops.
type ITransaction interface {
	// Mutating ops under held lock (delegating to the underlying repo)
	Stage(patterns []string) error
	// Commit also releases the held lock; subsequent calls become no-ops
	Commit(message string) (string, error)
	Cancel() error
}

// transaction implements ITransaction
type transaction struct {
	repo     *repository
	lock     *sync.Mutex
	released bool
}

func (r *repository) Begin() (ITransaction, error) {
	lock := getRepoLock(r.canonicalPath)
	startWait := time.Now()
	lock.Lock()
	waitMs := time.Since(startWait).Milliseconds()
	if waitMs > 0 {
		r.logger.Debug("Transaction acquired repo lock",
			"path", r.canonicalPath,
			"wait_ms", waitMs)
	}
	return &transaction{repo: r, lock: lock, released: false}, nil
}

func (t *transaction) Stage(patterns []string) error {
	if t.released {
		return fmt.Errorf("transaction already finalized")
	}
	return t.repo.Stage(patterns)
}

func (t *transaction) Commit(message string) (string, error) {
	if t.released {
		return "", fmt.Errorf("transaction already finalized")
	}
	start := time.Now()
	hash, err := t.repo.Commit(message)
	holdMs := time.Since(start).Milliseconds()
	t.repo.logger.Debug("Transaction commit finished",
		"path", t.repo.canonicalPath,
		"hold_ms", holdMs,
		"error", err != nil)
	// Always release the lock after commit attempt
	if !t.released {
		t.released = true
		t.lock.Unlock()
	}
	return hash, err
}

func (t *transaction) Cancel() error {
	if t.released {
		return nil
	}
	t.released = true
	t.lock.Unlock()
	t.repo.logger.Debug("Transaction cancelled and lock released", "path", t.repo.canonicalPath)
	return nil
}

// GetHistory returns a limited number of commits from repository history
func (r *repository) GetHistory(limit int) ([]CommitInfo, error) {
	r.mutex.RLock()
	defer r.mutex.RUnlock()

	ref, err := r.gitRepo.Head()
	if err != nil {
		// Repository might be empty
		return []CommitInfo{}, nil
	}

	commitIter, err := r.gitRepo.Log(&git.LogOptions{From: ref.Hash()})
	if err != nil {
		return nil, fmt.Errorf("repository.GetHistory failed to get commit log for %s: %w", r.path, err)
	}

	var commits []CommitInfo
	count := 0

	err = commitIter.ForEach(func(c *object.Commit) error {
		if limit > 0 && count >= limit {
			return fmt.Errorf("limit reached") // Use error to break iteration
		}

		commits = append(commits, CommitInfo{
			ID:        c.Hash.String(),
			Author:    c.Author.Name,
			Email:     c.Author.Email,
			Timestamp: c.Author.When,
			Message:   c.Message,
		})
		count++
		return nil
	})

	// Ignore "limit reached" error
	if err != nil && err.Error() != "limit reached" {
		return nil, fmt.Errorf("repository.GetHistory failed to iterate commits for %s: %w", r.path, err)
	}

	return commits, nil
}

// GetHistoryStream returns a channel that streams all commits
func (r *repository) GetHistoryStream() <-chan CommitInfo {
	ch := make(chan CommitInfo)

	go func() {
		defer close(ch)

		r.mutex.RLock()
		defer r.mutex.RUnlock()

		ref, err := r.gitRepo.Head()
		if err != nil {
			r.logger.Error("Repository error",
				"operation", "GetHistoryStream",
				"path", r.path,
				"error", err,
				"details", "failed to get HEAD reference")
			return
		}

		commitIter, err := r.gitRepo.Log(&git.LogOptions{From: ref.Hash()})
		if err != nil {
			r.logger.Error("Repository error",
				"operation", "GetHistoryStream",
				"path", r.path,
				"error", err,
				"details", "failed to get commit log")
			return
		}

		err = commitIter.ForEach(func(c *object.Commit) error {
			select {
			case ch <- CommitInfo{
				ID:        c.Hash.String(),
				Author:    c.Author.Name,
				Email:     c.Author.Email,
				Timestamp: c.Author.When,
				Message:   c.Message,
			}:
			default:
				// Channel closed, stop iteration
				return fmt.Errorf("channel closed")
			}
			return nil
		})

		if err != nil && err.Error() != "channel closed" {
			r.logger.Error("Repository error",
				"operation", "GetHistoryStream",
				"path", r.path,
				"error", err,
				"details", "failed to iterate commits")
		}
	}()

	return ch
}

// GetFileHistory returns a limited number of commits that modified a specific file
func (r *repository) GetFileHistory(filePath string, limit int) ([]CommitInfo, error) {
	r.mutex.RLock()
	defer r.mutex.RUnlock()

	ref, err := r.gitRepo.Head()
	if err != nil {
		// Repository might be empty
		return []CommitInfo{}, nil
	}

	commitIter, err := r.gitRepo.Log(&git.LogOptions{
		From:     ref.Hash(),
		FileName: &filePath,
	})
	if err != nil {
		return nil, fmt.Errorf("repository.GetFileHistory failed to get commit log for file %s in %s: %w", filePath, r.path, err)
	}

	var commits []CommitInfo
	count := 0

	err = commitIter.ForEach(func(c *object.Commit) error {
		if limit > 0 && count >= limit {
			return fmt.Errorf("limit reached")
		}

		commits = append(commits, CommitInfo{
			ID:        c.Hash.String(),
			Author:    c.Author.Name,
			Email:     c.Author.Email,
			Timestamp: c.Author.When,
			Message:   c.Message,
		})
		count++
		return nil
	})

	if err != nil && err.Error() != "limit reached" {
		return nil, fmt.Errorf("repository.GetFileHistory failed to iterate commits for file %s in %s: %w", filePath, r.path, err)
	}

	return commits, nil
}

// GetFileHistoryStream returns a channel that streams commits for a specific file
func (r *repository) GetFileHistoryStream(filePath string) <-chan CommitInfo {
	ch := make(chan CommitInfo)

	go func() {
		defer close(ch)

		r.mutex.RLock()
		defer r.mutex.RUnlock()

		ref, err := r.gitRepo.Head()
		if err != nil {
			r.logger.Error("Repository error",
				"operation", "GetFileHistoryStream",
				"path", r.path,
				"filePath", filePath,
				"error", err,
				"details", "failed to get HEAD reference")
			return
		}

		commitIter, err := r.gitRepo.Log(&git.LogOptions{
			From:     ref.Hash(),
			FileName: &filePath,
		})
		if err != nil {
			r.logger.Error("Repository error",
				"operation", "GetFileHistoryStream",
				"path", r.path,
				"filePath", filePath,
				"error", err,
				"details", "failed to get commit log")
			return
		}

		err = commitIter.ForEach(func(c *object.Commit) error {
			select {
			case ch <- CommitInfo{
				ID:        c.Hash.String(),
				Author:    c.Author.Name,
				Email:     c.Author.Email,
				Timestamp: c.Author.When,
				Message:   c.Message,
			}:
			default:
				return fmt.Errorf("channel closed")
			}
			return nil
		})

		if err != nil && err.Error() != "channel closed" {
			r.logger.Error("Repository error",
				"operation", "GetFileHistoryStream",
				"path", r.path,
				"filePath", filePath,
				"error", err,
				"details", "failed to iterate commits")
		}
	}()

	return ch
}

// GetFileDifferences returns the differences between two commits
func (r *repository) GetFileDifferences(hash1, hash2 string) ([]byte, error) {
	r.mutex.RLock()
	defer r.mutex.RUnlock()

	// Get commits
	commit1, err := r.gitRepo.CommitObject(plumbing.NewHash(hash1))
	if err != nil {
		return nil, fmt.Errorf("VersioningUtility.Repository.GetFileDifferences failed to get commit %s: %w", hash1, err)
	}

	commit2, err := r.gitRepo.CommitObject(plumbing.NewHash(hash2))
	if err != nil {
		return nil, fmt.Errorf("VersioningUtility.Repository.GetFileDifferences failed to get commit %s: %w", hash2, err)
	}

	// Get trees
	tree1, err := commit1.Tree()
	if err != nil {
		return nil, fmt.Errorf("VersioningUtility.Repository.GetFileDifferences failed to get tree for commit %s: %w", hash1, err)
	}

	tree2, err := commit2.Tree()
	if err != nil {
		return nil, fmt.Errorf("VersioningUtility.Repository.GetFileDifferences failed to get tree for commit %s: %w", hash2, err)
	}

	// Get patch
	patch, err := tree1.Patch(tree2)
	if err != nil {
		return nil, fmt.Errorf("VersioningUtility.Repository.GetFileDifferences failed to generate patch between %s and %s: %w", hash1, hash2, err)
	}

	return []byte(patch.String()), nil
}

// ValidateRepositoryAndPaths validates the repository and optionally checks file/directory existence
func (r *repository) ValidateRepositoryAndPaths(request RepositoryValidationRequest) (*RepositoryValidationResult, error) {
	// Use the repository's path if no directory path specified
	if strings.TrimSpace(request.DirectoryPath) == "" {
		request.DirectoryPath = r.path
	}

	// Delegate to the standalone function
	return ValidateRepositoryAndPaths(request)
}

// Close releases resources associated with the repository handle
func (r *repository) Close() error {
	// go-git repositories don't need explicit closing
	// but we can log the operation
	r.logger.Debug("Repository handle closed", "path", r.path)
	return nil
}
