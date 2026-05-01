package access

import (
	"errors"
	"fmt"
	"os"
)

// =============================================================================
// IBoard facet implementation (task 96)
// =============================================================================
//
// The six verbs below implement the IBoard facet declared in task_facets.go.
// Each verb is atomic: it acquires ta.mu, performs every filesystem mutation
// (status directory, board_config.json, task_order.json) it touches, and
// then issues a SINGLE git commit via commitFiles before releasing the lock.
//
// Resource-level invariants enforced here:
//   - RemoveColumn refuses to drop a non-empty column. The empty-check
//     reads the directory under the SAME ta.mu that ITask.Move/Create take
//     when they place tasks into a column, eliminating the TOCTOU window
//     that previously lived in the manager.
//   - Rename/Retitle/Reorder/RemoveColumn refuse unknown slugs.
//
// Reserved-slug checks ("archived"), slug-uniqueness, bookend constraints
// (first=todo, last=done), and slug derivation from a display title remain
// in the manager — they are policy concerns, not resource invariants.
//
// Lock-ordering invariant (same as ITask facet): ta.mu is acquired BEFORE
// the per-repo lock that commitFiles takes inside repo.Begin(). No path in
// this file inverts this order.

// ErrColumnNotEmpty is returned by RemoveColumn when the target column
// still contains tasks. Manager-side callers can wrap this with a UI
// message; access leaves the on-disk state untouched.
var ErrColumnNotEmpty = errors.New("column not empty")

// ErrInsertAfterBookend is returned by AddColumn when the requested
// afterSlug is the trailing done-type bookend column — inserting after
// it would violate the "done last" invariant.
var ErrInsertAfterBookend = errors.New("cannot insert after the done bookend column")

// findColumnIndex locates a column by slug in the supplied configuration.
// Returns -1 when the slug is absent. The caller holds ta.mu.
func findColumnIndex(config *BoardConfiguration, slug string) int {
	for i, col := range config.ColumnDefinitions {
		if col.Name == slug {
			return i
		}
	}
	return -1
}

// loadBoardLocked returns a non-nil board configuration. The caller holds
// ta.mu. When no config file exists yet, an empty BoardConfiguration is
// returned so callers can mutate and persist it without nil-checks.
func (ta *TaskAccess) loadBoardLocked() (*BoardConfiguration, error) {
	config, err := ta.GetBoardConfiguration()
	if err != nil {
		return nil, err
	}
	if config == nil {
		config = &BoardConfiguration{}
	}
	return config, nil
}

// Get returns the current board configuration. When no config file exists,
// an empty BoardConfiguration is returned (zero columns) — manager-side
// defaults are applied above this layer.
func (ta *TaskAccess) Get() (BoardConfiguration, error) {
	ta.mu.Lock()
	defer ta.mu.Unlock()

	config, err := ta.loadBoardLocked()
	if err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.Get: %w", err)
	}
	return *config, nil
}

// AddColumn inserts a new doing-type column with the given slug and title
// into the board configuration at the position implied by afterSlug,
// creates its status directory, and commits both changes in a single git
// commit. Caller-side policy (slug derivation, reserved-slug rejection,
// slug uniqueness) stays in the manager; this verb only enforces
// non-empty inputs and the bookend invariant local to insertion.
//
// Position semantics:
//   - afterSlug == ""           : append at the end, but BEFORE a
//                                 trailing done-type column when present
//                                 so the "done last" bookend invariant
//                                 is preserved.
//   - afterSlug == "<existing>" : insert immediately after that slug.
//                                 Rejected with ErrInsertAfterBookend
//                                 when afterSlug names the trailing
//                                 done-type bookend.
//   - afterSlug == "<missing>"  : returns an error and makes no on-disk
//                                 changes (config, directory untouched).
func (ta *TaskAccess) AddColumn(slug, title, afterSlug string) (BoardConfiguration, error) {
	if slug == "" {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.AddColumn: slug cannot be empty")
	}
	if title == "" {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.AddColumn: title cannot be empty")
	}

	ta.mu.Lock()
	defer ta.mu.Unlock()

	config, err := ta.loadBoardLocked()
	if err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.AddColumn: %w", err)
	}

	// Resolve target index without mutating the slice yet — that way an
	// invalid afterSlug aborts before any filesystem or commit work.
	insertIdx, err := resolveInsertIndex(config, afterSlug)
	if err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.AddColumn: %w", err)
	}

	newCol := ColumnDefinition{
		Name:  slug,
		Title: title,
		Type:  ColumnTypeDoing,
	}
	cols := config.ColumnDefinitions
	updated := make([]ColumnDefinition, 0, len(cols)+1)
	updated = append(updated, cols[:insertIdx]...)
	updated = append(updated, newCol)
	updated = append(updated, cols[insertIdx:]...)
	config.ColumnDefinitions = updated

	if err := ta.EnsureStatusDirectory(slug); err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.AddColumn: %w", err)
	}

	if err := ta.SaveBoardConfiguration(config); err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.AddColumn: %w", err)
	}

	if err := commitFiles(ta.repo, []string{ta.boardConfigFilePath()}, fmt.Sprintf("Add column: %s", title)); err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.AddColumn: %w", err)
	}

	return *config, nil
}

// resolveInsertIndex maps the afterSlug semantics of AddColumn to the
// concrete index at which the new column should be spliced into the
// existing ColumnDefinitions slice. Caller holds ta.mu.
func resolveInsertIndex(config *BoardConfiguration, afterSlug string) (int, error) {
	cols := config.ColumnDefinitions

	// Default-append position: end of slice, but before a trailing
	// done-type bookend if one is present.
	if afterSlug == "" {
		idx := len(cols)
		if idx > 0 && cols[idx-1].Type == ColumnTypeDone {
			idx--
		}
		return idx, nil
	}

	idx := findColumnIndex(config, afterSlug)
	if idx < 0 {
		return 0, fmt.Errorf("column %q not found", afterSlug)
	}
	if cols[idx].Type == ColumnTypeDone {
		return 0, ErrInsertAfterBookend
	}
	return idx + 1, nil
}

// RemoveColumn drops the named column from the board configuration. The
// "no tasks in column" precondition is re-validated under ta.mu against
// on-disk state — this closes the TOCTOU window that previously lived in
// the manager between an "is empty?" check and the directory removal.
// On a non-empty column, ErrColumnNotEmpty is returned and NO on-disk
// changes are made (config, directory, and order map are untouched).
func (ta *TaskAccess) RemoveColumn(slug string) (BoardConfiguration, error) {
	ta.mu.Lock()
	defer ta.mu.Unlock()

	config, err := ta.loadBoardLocked()
	if err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.RemoveColumn: %w", err)
	}

	colIdx := findColumnIndex(config, slug)
	if colIdx < 0 {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.RemoveColumn: column %q not found", slug)
	}

	// TOCTOU invariant: empty-check happens INSIDE the same critical section
	// that ITask.Move/Create use to add tasks to a column.
	tasks, err := ta.GetTasksByStatus(slug)
	if err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.RemoveColumn: %w", err)
	}
	if len(tasks) > 0 {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.RemoveColumn: %w (%d task(s))", ErrColumnNotEmpty, len(tasks))
	}

	// Remove the (empty) status directory. Failure here aborts before any
	// config rewrite so the on-disk state stays self-consistent.
	if err := ta.removeStatusDirectory(slug); err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.RemoveColumn: %w", err)
	}

	// Drop the slug from task_order.json under the same lock that ITask
	// orders take.
	commitPaths := []string{ta.boardConfigFilePath()}
	orderMap, loadErr := ta.LoadTaskOrder()
	if loadErr == nil {
		if _, exists := orderMap[slug]; exists {
			delete(orderMap, slug)
			orderFilePath := ta.taskOrderFilePath()
			if err := writeJSON(orderFilePath, orderMap); err != nil {
				return BoardConfiguration{}, fmt.Errorf("TaskAccess.RemoveColumn: failed to write task order: %w", err)
			}
			commitPaths = append(commitPaths, orderFilePath)
		}
	}

	config.ColumnDefinitions = append(config.ColumnDefinitions[:colIdx], config.ColumnDefinitions[colIdx+1:]...)
	if err := ta.SaveBoardConfiguration(config); err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.RemoveColumn: %w", err)
	}

	if err := commitFiles(ta.repo, commitPaths, fmt.Sprintf("Remove column: %s", slug)); err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.RemoveColumn: %w", err)
	}

	return *config, nil
}

// RenameColumn renames the directory for oldSlug to newSlug, migrates any
// task_order.json entries from oldSlug to newSlug (preserving order), and
// updates the column's slug and title. When oldSlug == newSlug the verb
// degrades to a title-only update (no directory rename, no order-map
// touch). All changes commit as ONE git commit.
func (ta *TaskAccess) RenameColumn(oldSlug, newSlug, newTitle string) (BoardConfiguration, error) {
	if oldSlug == "" || newSlug == "" {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.RenameColumn: slugs cannot be empty")
	}

	ta.mu.Lock()
	defer ta.mu.Unlock()

	config, err := ta.loadBoardLocked()
	if err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.RenameColumn: %w", err)
	}

	colIdx := findColumnIndex(config, oldSlug)
	if colIdx < 0 {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.RenameColumn: column %q not found", oldSlug)
	}

	commitPaths := []string{ta.boardConfigFilePath()}

	if oldSlug != newSlug {
		// Capture task filenames BEFORE the rename so we can stage their old
		// paths (now removed) AND new paths (now present) — without this,
		// the moved task files would surface as untracked working-tree
		// changes after RenameColumn returns.
		var movedFilenames []string
		if entries, err := os.ReadDir(ta.taskDirPath(oldSlug)); err == nil {
			for _, entry := range entries {
				if entry.IsDir() {
					continue
				}
				movedFilenames = append(movedFilenames, entry.Name())
			}
		}

		if err := ta.renameStatusDirectory(oldSlug, newSlug); err != nil {
			return BoardConfiguration{}, fmt.Errorf("TaskAccess.RenameColumn: %w", err)
		}

		// Stage both the (now-missing) old paths and the (now-present) new
		// paths so git records the rename as a single coherent change.
		for _, name := range movedFilenames {
			commitPaths = append(commitPaths,
				ta.taskDirPath(oldSlug)+string(os.PathSeparator)+name,
				ta.taskDirPath(newSlug)+string(os.PathSeparator)+name,
			)
		}

		orderMap, loadErr := ta.LoadTaskOrder()
		if loadErr == nil {
			if ids, exists := orderMap[oldSlug]; exists {
				orderMap[newSlug] = ids
				delete(orderMap, oldSlug)
				orderFilePath := ta.taskOrderFilePath()
				if err := writeJSON(orderFilePath, orderMap); err != nil {
					return BoardConfiguration{}, fmt.Errorf("TaskAccess.RenameColumn: failed to write task order: %w", err)
				}
				commitPaths = append(commitPaths, orderFilePath)
			}
		}
		config.ColumnDefinitions[colIdx].Name = newSlug
	}
	config.ColumnDefinitions[colIdx].Title = newTitle

	if err := ta.SaveBoardConfiguration(config); err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.RenameColumn: %w", err)
	}

	msg := fmt.Sprintf("Rename column: %s -> %s", oldSlug, newTitle)
	if oldSlug == newSlug {
		msg = fmt.Sprintf("Rename column title: %s", newTitle)
	}
	if err := commitFiles(ta.repo, commitPaths, msg); err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.RenameColumn: %w", err)
	}

	return *config, nil
}

// RetitleColumn updates only the display title of a column. The slug,
// status directory, and task_order.json are all left untouched. Produces
// ONE git commit on the board configuration alone.
func (ta *TaskAccess) RetitleColumn(slug, newTitle string) (BoardConfiguration, error) {
	if slug == "" {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.RetitleColumn: slug cannot be empty")
	}

	ta.mu.Lock()
	defer ta.mu.Unlock()

	config, err := ta.loadBoardLocked()
	if err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.RetitleColumn: %w", err)
	}

	colIdx := findColumnIndex(config, slug)
	if colIdx < 0 {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.RetitleColumn: column %q not found", slug)
	}

	config.ColumnDefinitions[colIdx].Title = newTitle

	if err := ta.SaveBoardConfiguration(config); err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.RetitleColumn: %w", err)
	}

	if err := commitFiles(ta.repo, []string{ta.boardConfigFilePath()}, fmt.Sprintf("Rename column title: %s", newTitle)); err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.RetitleColumn: %w", err)
	}

	return *config, nil
}

// ReorderColumns rewrites the column-definition array so its order matches
// the supplied slice. The input must contain exactly the same set of slugs
// (no duplicates, no additions, no removals); bookend constraints
// (first=todo, last=done) remain manager-side policy. Produces ONE git
// commit on the board configuration alone.
func (ta *TaskAccess) ReorderColumns(slugs []string) (BoardConfiguration, error) {
	ta.mu.Lock()
	defer ta.mu.Unlock()

	config, err := ta.loadBoardLocked()
	if err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.ReorderColumns: %w", err)
	}

	if len(slugs) != len(config.ColumnDefinitions) {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.ReorderColumns: expected %d slugs, got %d", len(config.ColumnDefinitions), len(slugs))
	}

	colMap := make(map[string]ColumnDefinition, len(config.ColumnDefinitions))
	for _, col := range config.ColumnDefinitions {
		colMap[col.Name] = col
	}

	seen := make(map[string]bool, len(slugs))
	reordered := make([]ColumnDefinition, 0, len(slugs))
	for _, s := range slugs {
		if seen[s] {
			return BoardConfiguration{}, fmt.Errorf("TaskAccess.ReorderColumns: duplicate slug %q", s)
		}
		seen[s] = true
		col, ok := colMap[s]
		if !ok {
			return BoardConfiguration{}, fmt.Errorf("TaskAccess.ReorderColumns: unknown slug %q", s)
		}
		reordered = append(reordered, col)
	}

	config.ColumnDefinitions = reordered
	if err := ta.SaveBoardConfiguration(config); err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.ReorderColumns: %w", err)
	}

	if err := commitFiles(ta.repo, []string{ta.boardConfigFilePath()}, "Reorder columns"); err != nil {
		return BoardConfiguration{}, fmt.Errorf("TaskAccess.ReorderColumns: %w", err)
	}

	return *config, nil
}

// statusDirExists is a small helper used by tests/callers that need to
// confirm a column's directory was (or was not) materialised on disk
// after an IBoard verb. It does not take the lock.
func (ta *TaskAccess) statusDirExists(slug string) bool {
	info, err := os.Stat(ta.taskDirPath(slug))
	return err == nil && info.IsDir()
}
