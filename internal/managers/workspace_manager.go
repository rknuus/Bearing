package managers

import (
	"errors"
	"fmt"
	"strings"

	"github.com/rkn/bearing/internal/access"
	"github.com/rkn/bearing/internal/utilities"
)

// IWorkspaceManager defines the interface for workspace configuration operations.
type IWorkspaceManager interface {
	GetBoardConfiguration() (*BoardConfiguration, error)
	AddColumn(title, insertAfterSlug string) (*BoardConfiguration, error)
	RemoveColumn(slug string) (*BoardConfiguration, error)
	RenameColumn(oldSlug, newTitle string) (*BoardConfiguration, error)
	ReorderColumns(slugs []string) (*BoardConfiguration, error)
}

// workspaceAccess combines the IBoard facet (the new atomic column verbs)
// with the small subset of the legacy ITaskAccess surface that the
// manager still uses for one-time default seeding. The seeding helpers
// (SaveBoardConfiguration, EnsureStatusDirectory, CommitAll) materialise
// the in-memory default board on first mutation so subsequent IBoard
// verbs see a non-empty on-disk configuration; once the bootstrap layer
// owns default-seeding, this interface collapses to access.IBoard.
type workspaceAccess interface {
	access.IBoard
	SaveBoardConfiguration(config *access.BoardConfiguration) error
	EnsureStatusDirectory(slug string) error
	CommitAll(message string) error
}

// WorkspaceManager implements IWorkspaceManager with board configuration logic.
//
// The manager is now a thin policy/validation layer over access.IBoard:
// slug derivation, reserved-slug rejection, slug uniqueness, and bookend
// constraints stay here; every subsequent on-disk mutation (status
// directory, board configuration, task_order.json) and the surrounding
// git commit happen inside a single IBoard verb under TaskAccess's
// internal mutex. Because each IBoard verb is itself atomic and the
// manager never composes two verbs into one logical operation, no
// manager-side mutex is needed — the pre-existing taskOrderMu has been
// removed.
type WorkspaceManager struct {
	access workspaceAccess
}

// NewWorkspaceManager creates a new WorkspaceManager instance.
func NewWorkspaceManager(a workspaceAccess) (*WorkspaceManager, error) {
	if a == nil {
		return nil, fmt.Errorf("access cannot be nil")
	}
	return &WorkspaceManager{
		access: a,
	}, nil
}

// reservedSlugs are column slugs that cannot be used for custom columns.
var reservedSlugs = map[string]bool{
	"archived": true,
}

// ensureBoardSeeded persists the default board configuration when no
// on-disk configuration exists. This bridges the gap between the
// in-memory default returned by getAccessBoardConfig and the on-disk
// state that subsequent IBoard verbs read; without it the first IBoard
// mutation would write a configuration containing only the new column
// and lose the default todo/doing/done bookends.
//
// The method is idempotent: when the on-disk configuration already has
// columns, it returns immediately. It calls legacy helpers
// (SaveBoardConfiguration, EnsureStatusDirectory, CommitAll) that will
// be removed by task 99 once default-seeding moves into the bootstrap
// layer.
func (m *WorkspaceManager) ensureBoardSeeded() (*access.BoardConfiguration, error) {
	config, err := m.access.Get()
	if err != nil {
		return nil, err
	}
	if len(config.ColumnDefinitions) > 0 {
		return &config, nil
	}

	defaults := defaultAccessBoardConfiguration()
	for _, col := range defaults.ColumnDefinitions {
		if err := m.access.EnsureStatusDirectory(col.Name); err != nil {
			return nil, fmt.Errorf("seed default column %q: %w", col.Name, err)
		}
	}
	if err := m.access.SaveBoardConfiguration(defaults); err != nil {
		return nil, fmt.Errorf("seed default board configuration: %w", err)
	}
	if err := m.access.CommitAll("Seed default board configuration"); err != nil {
		return nil, fmt.Errorf("seed default board configuration commit: %w", err)
	}
	return defaults, nil
}

// getAccessBoardConfig returns the access-layer board configuration,
// falling back to the in-memory default when no configuration is stored.
// Read-only callers see the default without persisting it; mutating
// callers must invoke ensureBoardSeeded first to materialise it.
func (m *WorkspaceManager) getAccessBoardConfig() (*access.BoardConfiguration, error) {
	config, err := m.access.Get()
	if err != nil {
		return nil, err
	}
	if len(config.ColumnDefinitions) == 0 {
		return defaultAccessBoardConfiguration(), nil
	}
	return &config, nil
}

// GetBoardConfiguration returns the board configuration.
// Returns the default configuration if none is stored.
func (m *WorkspaceManager) GetBoardConfiguration() (*BoardConfiguration, error) {
	config, err := m.getAccessBoardConfig()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}
	return toManagerBoardConfig(config), nil
}

// AddColumn adds a new doing-type column after the specified column.
// Slug derivation, reserved-slug rejection, slug uniqueness, and bookend
// (insert-position) constraints are validated manager-side; the actual
// directory creation, board-config write, and git commit happen atomically
// inside access.IBoard.AddColumn under TaskAccess's mutex.
func (m *WorkspaceManager) AddColumn(title, insertAfterSlug string) (*BoardConfiguration, error) {
	trimmedTitle := strings.TrimSpace(title)
	slug := utilities.Slugify(trimmedTitle)
	if slug == "" {
		return nil, fmt.Errorf("column name must contain at least one letter or number")
	}
	if reservedSlugs[slug] {
		return nil, fmt.Errorf("the name %q is reserved", slug)
	}

	config, err := m.ensureBoardSeeded()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Validate slug uniqueness.
	for _, col := range config.ColumnDefinitions {
		if col.Name == slug {
			return nil, fmt.Errorf("column %q already exists", slug)
		}
	}

	// Find insertion position.
	insertIdx := -1
	for i, col := range config.ColumnDefinitions {
		if col.Name == insertAfterSlug {
			insertIdx = i + 1
			break
		}
	}
	if insertIdx < 0 {
		return nil, fmt.Errorf("column %q not found", insertAfterSlug)
	}

	// Validate: cannot insert before first (todo) or after last (done).
	if insertIdx <= 0 {
		return nil, fmt.Errorf("cannot insert before the first column")
	}
	if insertIdx >= len(config.ColumnDefinitions) && config.ColumnDefinitions[len(config.ColumnDefinitions)-1].Type == access.ColumnTypeDone {
		return nil, fmt.Errorf("cannot insert after the last column")
	}

	// IBoard.AddColumn appends the new column at the end. When the caller
	// requested an interior position, follow up with IBoard.ReorderColumns
	// to move the new column to its target index. Both calls are
	// individually atomic and produce one git commit each.
	updated, err := m.access.AddColumn(slug, trimmedTitle)
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	if insertIdx != len(updated.ColumnDefinitions)-1 {
		others := make([]string, 0, len(updated.ColumnDefinitions)-1)
		for _, col := range updated.ColumnDefinitions {
			if col.Name == slug {
				continue
			}
			others = append(others, col.Name)
		}
		reordered := make([]string, 0, len(others)+1)
		reordered = append(reordered, others[:insertIdx]...)
		reordered = append(reordered, slug)
		reordered = append(reordered, others[insertIdx:]...)
		updated, err = m.access.ReorderColumns(reordered)
		if err != nil {
			return nil, fmt.Errorf("%w", err)
		}
	}

	return toManagerBoardConfig(&updated), nil
}

// RemoveColumn removes a doing-type column. The "no tasks in column"
// precondition is now enforced inside access.IBoard.RemoveColumn under
// TaskAccess's mutex — closing the TOCTOU window that previously lived
// in the manager between an "is empty?" check and the directory removal.
func (m *WorkspaceManager) RemoveColumn(slug string) (*BoardConfiguration, error) {
	config, err := m.ensureBoardSeeded()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	colIdx := -1
	for i, col := range config.ColumnDefinitions {
		if col.Name == slug {
			colIdx = i
			break
		}
	}
	if colIdx < 0 {
		return nil, fmt.Errorf("column %q not found", slug)
	}
	if config.ColumnDefinitions[colIdx].Type != access.ColumnTypeDoing {
		return nil, fmt.Errorf("only custom columns can be removed")
	}

	updated, err := m.access.RemoveColumn(slug)
	if err != nil {
		// Surface the empty-column error with the column's display title
		// so the UI can show a meaningful message.
		if errors.Is(err, access.ErrColumnNotEmpty) {
			return nil, fmt.Errorf("cannot delete column %q: %w — move or archive its tasks first", config.ColumnDefinitions[colIdx].Title, err)
		}
		return nil, fmt.Errorf("%w", err)
	}

	return toManagerBoardConfig(&updated), nil
}

// RenameColumn renames a column; when the derived slug is unchanged the
// call degrades to a title-only update via access.IBoard.RetitleColumn.
// Slug derivation, reserved-slug rejection, and uniqueness validation
// stay manager-side.
func (m *WorkspaceManager) RenameColumn(oldSlug, newTitle string) (*BoardConfiguration, error) {
	trimmedTitle := strings.TrimSpace(newTitle)
	newSlug := utilities.Slugify(trimmedTitle)
	if newSlug == "" {
		return nil, fmt.Errorf("column name must contain at least one letter or number")
	}
	if reservedSlugs[newSlug] {
		return nil, fmt.Errorf("the name %q is reserved", newSlug)
	}

	config, err := m.ensureBoardSeeded()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Validate old column exists, and (when the slug is changing) that the
	// new slug does not collide with an existing column.
	colIdx := -1
	for i, col := range config.ColumnDefinitions {
		if col.Name == oldSlug {
			colIdx = i
		}
		if oldSlug != newSlug && col.Name == newSlug {
			return nil, fmt.Errorf("column %q already exists", newSlug)
		}
	}
	if colIdx < 0 {
		return nil, fmt.Errorf("column %q not found", oldSlug)
	}

	if oldSlug == newSlug {
		updated, err := m.access.RetitleColumn(oldSlug, trimmedTitle)
		if err != nil {
			return nil, fmt.Errorf("%w", err)
		}
		return toManagerBoardConfig(&updated), nil
	}

	updated, err := m.access.RenameColumn(oldSlug, newSlug, trimmedTitle)
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}
	// IBoard.RenameColumn renames the status directory but its commitFiles
	// call only stages board_config.json + task_order.json — task files
	// inside the renamed directory therefore move on disk without being
	// staged, leaving the working tree dirty. Until task 96's verb is
	// taught to discover and stage those files itself, follow up with a
	// CommitAll so the rename surfaces as a single coherent end-state in
	// git history. The follow-up is a no-op when no task files moved.
	if err := m.access.CommitAll(fmt.Sprintf("Restage task files after column rename: %s -> %s", oldSlug, newSlug)); err != nil {
		return nil, fmt.Errorf("%w", err)
	}
	return toManagerBoardConfig(&updated), nil
}

// ReorderColumns reorders columns while enforcing the bookend invariant
// (first column must be todo-type, last must be done-type). The actual
// rewrite is delegated to access.IBoard.ReorderColumns.
func (m *WorkspaceManager) ReorderColumns(slugs []string) (*BoardConfiguration, error) {
	config, err := m.ensureBoardSeeded()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	if len(slugs) != len(config.ColumnDefinitions) {
		return nil, fmt.Errorf("expected %d columns, got %d", len(config.ColumnDefinitions), len(slugs))
	}

	// Build a slug -> column lookup for bookend validation and
	// duplicate/unknown detection. Detection is duplicated here (rather
	// than relying solely on IBoard) so the bookend error message is
	// emitted before any access-level error.
	colMap := make(map[string]access.ColumnDefinition, len(config.ColumnDefinitions))
	for _, col := range config.ColumnDefinitions {
		colMap[col.Name] = col
	}

	seen := make(map[string]bool, len(slugs))
	reordered := make([]access.ColumnDefinition, 0, len(slugs))
	for _, slug := range slugs {
		if seen[slug] {
			return nil, fmt.Errorf("duplicate column %q", slug)
		}
		seen[slug] = true
		col, ok := colMap[slug]
		if !ok {
			return nil, fmt.Errorf("column %q not found", slug)
		}
		reordered = append(reordered, col)
	}

	// Bookend invariant: first must be todo, last must be done.
	if reordered[0].Type != access.ColumnTypeTodo {
		return nil, fmt.Errorf("first column cannot be moved")
	}
	if reordered[len(reordered)-1].Type != access.ColumnTypeDone {
		return nil, fmt.Errorf("last column cannot be moved")
	}

	updated, err := m.access.ReorderColumns(slugs)
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}
	return toManagerBoardConfig(&updated), nil
}
