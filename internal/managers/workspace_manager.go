package managers

import (
	"fmt"
	"strings"
	"sync"

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

// WorkspaceManager implements IWorkspaceManager with board configuration logic.
type WorkspaceManager struct {
	taskAccess  access.ITaskAccess
	taskOrderMu sync.Mutex
}

// NewWorkspaceManager creates a new WorkspaceManager instance.
func NewWorkspaceManager(taskAccess access.ITaskAccess) (*WorkspaceManager, error) {
	if taskAccess == nil {
		return nil, fmt.Errorf("taskAccess cannot be nil")
	}
	return &WorkspaceManager{
		taskAccess: taskAccess,
	}, nil
}

// reservedSlugs are column slugs that cannot be used for custom columns.
var reservedSlugs = map[string]bool{
	"archived": true,
}

// getAccessBoardConfig returns the access-layer board configuration,
// falling back to the default if none is stored.
func (m *WorkspaceManager) getAccessBoardConfig() (*access.BoardConfiguration, error) {
	config, err := m.taskAccess.GetBoardConfiguration()
	if err != nil {
		return nil, err
	}
	if config == nil {
		return defaultAccessBoardConfiguration(), nil
	}
	return config, nil
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
func (m *WorkspaceManager) AddColumn(title, insertAfterSlug string) (*BoardConfiguration, error) {
	slug := utilities.Slugify(title)
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

	// Validate slug uniqueness
	for _, col := range config.ColumnDefinitions {
		if col.Name == slug {
			return nil, fmt.Errorf("column %q already exists", slug)
		}
	}

	// Find insertion position
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

	// Validate: cannot insert before first (todo) or after last (done)
	if insertIdx <= 0 {
		return nil, fmt.Errorf("cannot insert before the first column")
	}
	if insertIdx >= len(config.ColumnDefinitions) && config.ColumnDefinitions[len(config.ColumnDefinitions)-1].Type == access.ColumnTypeDone {
		// insertIdx points past the last column, which is done-type — insert before done
		return nil, fmt.Errorf("cannot insert after the last column")
	}

	newCol := access.ColumnDefinition{
		Name:  slug,
		Title: strings.TrimSpace(title),
		Type:  access.ColumnTypeDoing,
	}

	// Insert at position
	config.ColumnDefinitions = append(config.ColumnDefinitions[:insertIdx],
		append([]access.ColumnDefinition{newCol}, config.ColumnDefinitions[insertIdx:]...)...)

	// Create directory
	if err := m.taskAccess.EnsureStatusDirectory(slug); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Save config
	if err := m.taskAccess.SaveBoardConfiguration(config); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	if err := m.taskAccess.CommitAll(fmt.Sprintf("Add column: %s", strings.TrimSpace(title))); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	return toManagerBoardConfig(config), nil
}

// RemoveColumn removes a doing-type column that has no tasks.
func (m *WorkspaceManager) RemoveColumn(slug string) (*BoardConfiguration, error) {
	config, err := m.getAccessBoardConfig()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Find column and validate type
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

	// Check no tasks in column
	tasks, err := m.taskAccess.GetTasksByStatus(slug)
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}
	if len(tasks) > 0 {
		return nil, fmt.Errorf("cannot delete column %q: it still has %d task(s) — move or archive them first", config.ColumnDefinitions[colIdx].Title, len(tasks))
	}

	// Remove directory
	if err := m.taskAccess.RemoveStatusDirectory(slug); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Clean task order entries
	m.taskOrderMu.Lock()
	orderMap, loadErr := m.taskAccess.LoadTaskOrder()
	if loadErr == nil {
		if _, exists := orderMap[slug]; exists {
			delete(orderMap, slug)
			_ = m.taskAccess.WriteTaskOrder(orderMap)
		}
	}
	m.taskOrderMu.Unlock()

	// Update config
	config.ColumnDefinitions = append(config.ColumnDefinitions[:colIdx], config.ColumnDefinitions[colIdx+1:]...)
	if err := m.taskAccess.SaveBoardConfiguration(config); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	if err := m.taskAccess.CommitAll(fmt.Sprintf("Remove column: %s", slug)); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	return toManagerBoardConfig(config), nil
}

// RenameColumn renames a column, migrating its directory and updating task order.
func (m *WorkspaceManager) RenameColumn(oldSlug, newTitle string) (*BoardConfiguration, error) {
	newSlug := utilities.Slugify(newTitle)
	if newSlug == "" {
		return nil, fmt.Errorf("column name must contain at least one letter or number")
	}
	if reservedSlugs[newSlug] {
		return nil, fmt.Errorf("the name %q is reserved", newSlug)
	}
	if oldSlug == newSlug {
		// Only title change, no slug change — just update the title
		config, err := m.getAccessBoardConfig()
		if err != nil {
			return nil, fmt.Errorf("%w", err)
		}
		found := false
		for i, col := range config.ColumnDefinitions {
			if col.Name == oldSlug {
				config.ColumnDefinitions[i].Title = strings.TrimSpace(newTitle)
				found = true
				break
			}
		}
		if !found {
			return nil, fmt.Errorf("column %q not found", oldSlug)
		}
		if err := m.taskAccess.SaveBoardConfiguration(config); err != nil {
			return nil, fmt.Errorf("%w", err)
		}
		if err := m.taskAccess.CommitAll(fmt.Sprintf("Rename column title: %s", strings.TrimSpace(newTitle))); err != nil {
			return nil, fmt.Errorf("%w", err)
		}
		return toManagerBoardConfig(config), nil
	}

	config, err := m.getAccessBoardConfig()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Validate old column exists and new slug is unique
	colIdx := -1
	for i, col := range config.ColumnDefinitions {
		if col.Name == oldSlug {
			colIdx = i
		}
		if col.Name == newSlug {
			return nil, fmt.Errorf("column %q already exists", newSlug)
		}
	}
	if colIdx < 0 {
		return nil, fmt.Errorf("column %q not found", oldSlug)
	}

	// Rename directory
	if err := m.taskAccess.RenameStatusDirectory(oldSlug, newSlug); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Update task_order.json keys
	m.taskOrderMu.Lock()
	orderMap, loadErr := m.taskAccess.LoadTaskOrder()
	if loadErr == nil {
		if ids, exists := orderMap[oldSlug]; exists {
			orderMap[newSlug] = ids
			delete(orderMap, oldSlug)
			_ = m.taskAccess.WriteTaskOrder(orderMap)
		}
	}
	m.taskOrderMu.Unlock()

	// Update config
	config.ColumnDefinitions[colIdx].Name = newSlug
	config.ColumnDefinitions[colIdx].Title = strings.TrimSpace(newTitle)
	if err := m.taskAccess.SaveBoardConfiguration(config); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	if err := m.taskAccess.CommitAll(fmt.Sprintf("Rename column: %s -> %s", oldSlug, strings.TrimSpace(newTitle))); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	return toManagerBoardConfig(config), nil
}

// ReorderColumns reorders columns while enforcing bookend constraints.
func (m *WorkspaceManager) ReorderColumns(slugs []string) (*BoardConfiguration, error) {
	config, err := m.getAccessBoardConfig()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	if len(slugs) != len(config.ColumnDefinitions) {
		return nil, fmt.Errorf("expected %d columns, got %d", len(config.ColumnDefinitions), len(slugs))
	}

	// Build lookup
	colMap := make(map[string]access.ColumnDefinition, len(config.ColumnDefinitions))
	for _, col := range config.ColumnDefinitions {
		colMap[col.Name] = col
	}

	// Validate: all slugs present, no duplicates
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

	// Validate bookends: first must be todo, last must be done
	if reordered[0].Type != access.ColumnTypeTodo {
		return nil, fmt.Errorf("first column cannot be moved")
	}
	if reordered[len(reordered)-1].Type != access.ColumnTypeDone {
		return nil, fmt.Errorf("last column cannot be moved")
	}

	config.ColumnDefinitions = reordered
	if err := m.taskAccess.SaveBoardConfiguration(config); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	if err := m.taskAccess.CommitAll("Reorder columns"); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	return toManagerBoardConfig(config), nil
}
