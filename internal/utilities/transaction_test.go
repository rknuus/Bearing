package utilities

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

// initTransactionTestRepo creates a fresh git repository for transaction tests.
func initTransactionTestRepo(t *testing.T) IRepository {
	t.Helper()
	repoPath := filepath.Join(t.TempDir(), "tx_repo")
	repo, err := InitializeRepositoryWithConfig(repoPath, testAuthorConfig())
	if err != nil {
		t.Fatalf("failed to init repo: %v", err)
	}
	t.Cleanup(func() { _ = repo.Close() })
	return repo
}

// commitCount returns the number of commits in the repository.
func commitCount(t *testing.T, repo IRepository) int {
	t.Helper()
	commits, err := repo.GetHistory(0)
	if err != nil {
		t.Fatalf("failed to get history: %v", err)
	}
	return len(commits)
}

// TestUnit_RunTransaction_HappyPath_SingleFile verifies a single-file write
// is staged and committed via RunTransaction.
func TestUnit_RunTransaction_HappyPath_SingleFile(t *testing.T) {
	repo := initTransactionTestRepo(t)
	target := filepath.Join(repo.Path(), "alpha.txt")

	err := RunTransaction(repo, "add alpha", func() error {
		return os.WriteFile(target, []byte("alpha"), 0644)
	})
	if err != nil {
		t.Fatalf("RunTransaction returned error: %v", err)
	}

	if got := commitCount(t, repo); got != 1 {
		t.Fatalf("expected 1 commit, got %d", got)
	}

	commits, _ := repo.GetHistory(1)
	if commits[0].Message != "add alpha" {
		t.Errorf("expected commit message 'add alpha', got %q", commits[0].Message)
	}

	status, err := repo.Status()
	if err != nil {
		t.Fatalf("status failed: %v", err)
	}
	if len(status.ModifiedFiles)+len(status.StagedFiles)+len(status.UntrackedFiles) != 0 {
		t.Errorf("expected clean working tree, got %+v", status)
	}
}

// TestUnit_RunTransaction_HappyPath_MultiFile verifies multiple file writes
// in one fn invocation produce a single commit containing all of them.
func TestUnit_RunTransaction_HappyPath_MultiFile(t *testing.T) {
	repo := initTransactionTestRepo(t)

	files := map[string]string{
		"alpha.txt":           "alpha",
		"beta.txt":            "beta",
		"sub/gamma.txt":       "gamma",
		"sub/deep/delta.txt":  "delta",
	}

	err := RunTransaction(repo, "add multiple files", func() error {
		for rel, content := range files {
			full := filepath.Join(repo.Path(), rel)
			if err := os.MkdirAll(filepath.Dir(full), 0755); err != nil {
				return err
			}
			if err := os.WriteFile(full, []byte(content), 0644); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("RunTransaction returned error: %v", err)
	}

	if got := commitCount(t, repo); got != 1 {
		t.Fatalf("expected 1 commit (atomic multi-file), got %d", got)
	}

	for rel := range files {
		full := filepath.Join(repo.Path(), rel)
		if _, err := os.Stat(full); err != nil {
			t.Errorf("expected file %s to exist after commit: %v", rel, err)
		}
	}

	status, err := repo.Status()
	if err != nil {
		t.Fatalf("status failed: %v", err)
	}
	if len(status.ModifiedFiles)+len(status.StagedFiles)+len(status.UntrackedFiles) != 0 {
		t.Errorf("expected clean working tree, got %+v", status)
	}
}

// TestUnit_RunTransaction_FnError_RollsBack verifies that when fn returns an
// error, no commit is created and the lock is released so a subsequent
// transaction can proceed.
func TestUnit_RunTransaction_FnError_RollsBack(t *testing.T) {
	repo := initTransactionTestRepo(t)
	target := filepath.Join(repo.Path(), "should_not_commit.txt")
	sentinel := errors.New("inner failure")

	err := RunTransaction(repo, "should not appear", func() error {
		// Write a file so we can confirm it is NOT committed.
		if writeErr := os.WriteFile(target, []byte("oops"), 0644); writeErr != nil {
			return writeErr
		}
		return sentinel
	})
	if err == nil {
		t.Fatal("expected error from RunTransaction, got nil")
	}
	if !errors.Is(err, sentinel) {
		t.Errorf("expected wrapped sentinel error, got %v", err)
	}

	if got := commitCount(t, repo); got != 0 {
		t.Fatalf("expected 0 commits after rollback, got %d", got)
	}

	// File was created on disk by fn, but must not have been committed.
	// The next transaction should succeed (lock released by Cancel).
	if err := RunTransaction(repo, "follow-up", func() error {
		return os.WriteFile(filepath.Join(repo.Path(), "ok.txt"), []byte("ok"), 0644)
	}); err != nil {
		t.Fatalf("follow-up transaction failed (lock not released?): %v", err)
	}

	if got := commitCount(t, repo); got != 1 {
		t.Errorf("expected exactly 1 commit after follow-up, got %d", got)
	}
}

// stubTransaction lets us inject a Commit failure to exercise the
// commit-error path of RunTransaction.
type stubTransaction struct {
	stageErr  error
	commitErr error
	staged    bool
	committed bool
	cancelled bool
}

func (s *stubTransaction) Stage(_ []string) error {
	s.staged = true
	return s.stageErr
}

func (s *stubTransaction) Commit(_ string) (string, error) {
	s.committed = true
	return "", s.commitErr
}

func (s *stubTransaction) Cancel() error {
	s.cancelled = true
	return nil
}

// stubRepo is a minimal IRepository that returns a stubTransaction on Begin.
// Only Begin is exercised by RunTransaction; other methods panic if called.
type stubRepo struct {
	tx        *stubTransaction
	beginErr  error
}

func (s *stubRepo) Path() string                             { return "" }
func (s *stubRepo) Status() (*RepositoryStatus, error)        { panic("unused") }
func (s *stubRepo) Begin() (ITransaction, error) {
	if s.beginErr != nil {
		return nil, s.beginErr
	}
	return s.tx, nil
}
func (s *stubRepo) GetHistory(_ int) ([]CommitInfo, error)            { panic("unused") }
func (s *stubRepo) GetHistoryStream() <-chan CommitInfo               { panic("unused") }
func (s *stubRepo) GetFileHistory(_ string, _ int) ([]CommitInfo, error) {
	panic("unused")
}
func (s *stubRepo) GetFileHistoryStream(_ string) <-chan CommitInfo { panic("unused") }
func (s *stubRepo) GetFileDifferences(_, _ string) ([]byte, error)  { panic("unused") }
func (s *stubRepo) ValidateRepositoryAndPaths(_ RepositoryValidationRequest) (*RepositoryValidationResult, error) {
	panic("unused")
}
func (s *stubRepo) Close() error { return nil }

// TestUnit_RunTransaction_CommitError_Surfaced verifies that an error from
// the underlying Commit call is wrapped and returned to the caller.
func TestUnit_RunTransaction_CommitError_Surfaced(t *testing.T) {
	commitFail := errors.New("commit boom")
	tx := &stubTransaction{commitErr: commitFail}
	repo := &stubRepo{tx: tx}

	err := RunTransaction(repo, "msg", func() error { return nil })
	if err == nil {
		t.Fatal("expected error from RunTransaction, got nil")
	}
	if !errors.Is(err, commitFail) {
		t.Errorf("expected wrapped commit error, got %v", err)
	}
	if !tx.staged {
		t.Error("expected Stage to have been called before Commit")
	}
	if !tx.committed {
		t.Error("expected Commit to have been attempted")
	}
}

// TestUnit_RunTransaction_BeginError_Surfaced verifies that a Begin failure
// is returned wrapped without invoking fn.
func TestUnit_RunTransaction_BeginError_Surfaced(t *testing.T) {
	beginFail := errors.New("begin boom")
	repo := &stubRepo{beginErr: beginFail}

	called := false
	err := RunTransaction(repo, "msg", func() error {
		called = true
		return nil
	})
	if err == nil {
		t.Fatal("expected error from RunTransaction, got nil")
	}
	if !errors.Is(err, beginFail) {
		t.Errorf("expected wrapped begin error, got %v", err)
	}
	if called {
		t.Error("fn should not be called when Begin fails")
	}
}

// TestUnit_RunTransaction_StageError_CancelsAndSurfaces verifies that a
// Stage failure cancels the transaction and returns the wrapped error.
func TestUnit_RunTransaction_StageError_CancelsAndSurfaces(t *testing.T) {
	stageFail := errors.New("stage boom")
	tx := &stubTransaction{stageErr: stageFail}
	repo := &stubRepo{tx: tx}

	err := RunTransaction(repo, "msg", func() error { return nil })
	if err == nil {
		t.Fatal("expected error from RunTransaction, got nil")
	}
	if !errors.Is(err, stageFail) {
		t.Errorf("expected wrapped stage error, got %v", err)
	}
	if !tx.cancelled {
		t.Error("expected Cancel to be called after Stage failure")
	}
	if tx.committed {
		t.Error("Commit must not be called after Stage failure")
	}
}
