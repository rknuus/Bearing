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

// workspaceAccess is the access surface WorkspaceManager depends on.
// After task 109 it is exactly access.IBoard — the manager no longer
// performs any default-board seeding; bootstrap.Initialize calls
// TaskAccess.SeedDefaultBoard once at startup so every IBoard verb here
// sees a non-empty on-disk configuration on the first call.
type workspaceAccess interface {
	access.IBoard
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

// getAccessBoardConfig returns the access-layer board configuration.
// In production the on-disk configuration is always non-empty —
// bootstrap.Initialize seeds the default board via
// TaskAccess.SeedDefaultBoard before any manager runs — but the
// access.DefaultBoardConfiguration() fallback stays as a defensive
// guard for tests or stripped-down deployments that bypass bootstrap.
func (m *WorkspaceManager) getAccessBoardConfig() (*access.BoardConfiguration, error) {
	config, err := m.access.Get()
	if err != nil {
		return nil, err
	}
	if len(config.ColumnDefinitions) == 0 {
		return access.DefaultBoardConfiguration(), nil
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
// Slug derivation, reserved-slug rejection, slug uniqueness, and the
// "cannot insert after done bookend" constraint are validated
// manager-side; the actual insertion-in-place, status directory creation,
// board-config write, and git commit happen atomically inside
// access.IBoard.AddColumn under TaskAccess's mutex — a single verb, a
// single git commit.
func (m *WorkspaceManager) AddColumn(title, insertAfterSlug string) (*BoardConfiguration, error) {
	trimmedTitle := strings.TrimSpace(title)
	slug := utilities.Slugify(trimmedTitle)
	if slug == "" {
		return nil, fmt.Errorf("column name must contain at least one letter or number")
	}
	if reservedSlugs[slug] {
		return nil, fmt.Errorf("the name %q is reserved", slug)
	}

	config, err := m.getAccessBoardConfig()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Validate slug uniqueness and resolve the insertion target so we can
	// surface the user-facing "cannot insert after the last column"
	// message before the access-layer call.
	afterIdx := -1
	for i, col := range config.ColumnDefinitions {
		if col.Name == slug {
			return nil, fmt.Errorf("column %q already exists", slug)
		}
		if col.Name == insertAfterSlug {
			afterIdx = i
		}
	}
	if afterIdx < 0 {
		return nil, fmt.Errorf("column %q not found", insertAfterSlug)
	}
	if config.ColumnDefinitions[afterIdx].Type == access.ColumnTypeDone {
		return nil, fmt.Errorf("cannot insert after the last column")
	}

	updated, err := m.access.AddColumn(slug, trimmedTitle, insertAfterSlug)
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	return toManagerBoardConfig(&updated), nil
}

// RemoveColumn removes a doing-type column. The "no tasks in column"
// precondition is now enforced inside access.IBoard.RemoveColumn under
// TaskAccess's mutex — closing the TOCTOU window that previously lived
// in the manager between an "is empty?" check and the directory removal.
func (m *WorkspaceManager) RemoveColumn(slug string) (*BoardConfiguration, error) {
	config, err := m.getAccessBoardConfig()
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

	config, err := m.getAccessBoardConfig()
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
	return toManagerBoardConfig(&updated), nil
}

// ReorderColumns reorders columns while enforcing the bookend invariant
// (first column must be todo-type, last must be done-type). The actual
// rewrite is delegated to access.IBoard.ReorderColumns.
func (m *WorkspaceManager) ReorderColumns(slugs []string) (*BoardConfiguration, error) {
	config, err := m.getAccessBoardConfig()
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
