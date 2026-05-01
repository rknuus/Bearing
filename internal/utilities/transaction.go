package utilities

import "fmt"

// RunTransaction executes fn within a repository transaction, providing
// cross-Access atomic write semantics for managers that need to coordinate
// writes across multiple Access components in a single git commit.
//
// Lifecycle:
//   - Begins a transaction (acquires the per-repo lock).
//   - Invokes fn, which is expected to perform any number of file writes
//     against the repository's working tree.
//   - On fn error: cancels the transaction (releases the lock without
//     committing) and returns the wrapped error so callers see the cause.
//   - On fn success: stages the entire working tree ("." pattern) and
//     commits with the supplied message. Any commit error is returned
//     wrapped; rollback is implicit because no commit was created.
//
// The function does not change the IRepository / ITransaction contract —
// it is a pure utility wrapper around the existing Begin/Stage/Commit
// primitives, mirroring the access-layer commitAll helper but exposed at
// the utility layer for manager-level orchestration.
func RunTransaction(repo IRepository, message string, fn func() error) error {
	tx, err := repo.Begin()
	if err != nil {
		return fmt.Errorf("RunTransaction failed to begin transaction: %w", err)
	}

	if err := fn(); err != nil {
		_ = tx.Cancel()
		return fmt.Errorf("RunTransaction body failed: %w", err)
	}

	if err := tx.Stage([]string{"."}); err != nil {
		_ = tx.Cancel()
		return fmt.Errorf("RunTransaction failed to stage changes: %w", err)
	}

	if _, err := tx.Commit(message); err != nil {
		return fmt.Errorf("RunTransaction failed to commit: %w", err)
	}

	return nil
}
