package access

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"

	"github.com/rkn/bearing/internal/utilities"
)

// ITaskAccess defines the legacy task-data access surface that has not
// yet migrated to the ITask/IBatch/IBoard facets. It now contains only
// the read-mostly helpers the Manager layer (PlanningManager) still uses.
// Each entry should eventually move into a facet (Find covers most of
// the read paths).
//
// The atomic write verbs (Find, Create, Save, Move, Archive, Restore,
// Delete, Reorder, Promote, Commit, Get/AddColumn/RemoveColumn/
// RenameColumn/RetitleColumn/ReorderColumns) live on access.ITask,
// access.IBatch, and access.IBoard — callers should depend on those
// facets, not on ITaskAccess.
//
// Default-board seeding (formerly handled lazily by
// WorkspaceManager.ensureBoardSeeded via SaveBoardConfiguration /
// EnsureStatusDirectory / CommitAll) now lives in
// bootstrap.Initialize, which calls TaskAccess.SeedDefaultBoard once
// at startup. Those three legacy helpers were therefore unexported
// (saveBoardConfiguration, ensureStatusDirectory) or removed (the
// bare CommitAll bridge has no remaining production caller).
type ITaskAccess interface {
	// Read-mostly helpers still used by PlanningManager.
	GetTasksByTheme(themeID string) ([]Task, error)
	GetTasksByStatus(status string) ([]Task, error)
	FindTasksByTag(tag string) ([]TaggedTask, error)
	LoadTaskOrder() (map[string][]string, error)
	SaveTaskOrder(order map[string][]string) error
	LoadArchivedOrder() ([]string, error)
	GetBoardConfiguration() (*BoardConfiguration, error)
}

// TaskAccess implements ITaskAccess with file-based storage and git versioning.
//
// Concurrency: mu is the single internal mutex that serialises every
// resource-mutating operation on TaskAccess. It covers (a) task files in
// the per-status directories, (b) task_order.json, (c) archived_order.json,
// and (d) task-ID generation (which must not race against itself or
// against task creation).
//
// Lock-ordering invariant: callers must acquire TaskAccess.mu BEFORE the
// per-repo lock taken inside commitFiles. Inverting this order can
// deadlock against any other component that locks the repo first and
// then attempts to call into TaskAccess.
//
// This unification closes audit findings #4 (split task_order mutex),
// #6 (task-ID generation race), and #7 (Move/Archive split critical
// sections — file rename and order-map mutation now happen under one
// lock, in one commit).
type TaskAccess struct {
	dataPath string
	repo     utilities.IRepository
	mu       sync.Mutex
}

// NewTaskAccess creates a new TaskAccess instance.
func NewTaskAccess(dataPath string, repo utilities.IRepository) (*TaskAccess, error) {
	if dataPath == "" {
		return nil, fmt.Errorf("TaskAccess.New: dataPath cannot be empty")
	}
	if repo == nil {
		return nil, fmt.Errorf("TaskAccess.New: repo cannot be nil")
	}

	ta := &TaskAccess{
		dataPath: dataPath,
		repo:     repo,
	}

	// Ensure task directory structure exists
	if err := ta.ensureDirectoryStructure(); err != nil {
		return nil, fmt.Errorf("TaskAccess.New: %w", err)
	}

	return ta, nil
}

// ensureDirectoryStructure creates the required task directory structure.
func (ta *TaskAccess) ensureDirectoryStructure() error {
	config, _ := ta.GetBoardConfiguration()
	var dirs []string
	if config != nil {
		for _, col := range config.ColumnDefinitions {
			dirs = append(dirs, filepath.Join(ta.dataPath, "tasks", col.Name))
		}
	} else {
		// Default column directories when no config file exists
		dirs = append(dirs,
			filepath.Join(ta.dataPath, "tasks", "todo"),
			filepath.Join(ta.dataPath, "tasks", "doing"),
			filepath.Join(ta.dataPath, "tasks", "done"),
		)
	}
	dirs = append(dirs, filepath.Join(ta.dataPath, "tasks", string(TaskStatusArchived)))

	for _, dir := range dirs {
		if err := ensureDir(dir); err != nil {
			return err
		}
	}

	// Create .gitignore if it doesn't exist (excludes non-versioned files)
	gitignorePath := filepath.Join(ta.dataPath, ".gitignore")
	if _, err := os.Stat(gitignorePath); os.IsNotExist(err) {
		if err := os.WriteFile(gitignorePath, []byte("navigation_context.json\ntasks/drafts.json\n"), 0644); err != nil {
			return fmt.Errorf("failed to create .gitignore: %w", err)
		}
	}

	// Ensure tasks/drafts.json is in .gitignore (may be missing in existing data dirs)
	if existing, err := os.ReadFile(gitignorePath); err == nil {
		if !strings.Contains(string(existing), "tasks/drafts.json") {
			updated := string(existing)
			if !strings.HasSuffix(updated, "\n") {
				updated += "\n"
			}
			updated += "tasks/drafts.json\n"
			if err := os.WriteFile(gitignorePath, []byte(updated), 0644); err != nil {
				return fmt.Errorf("failed to update .gitignore: %w", err)
			}
		}
	}

	return nil
}

// taskFilePath returns the path to a task file based on status.
func (ta *TaskAccess) taskFilePath(status, taskID string) string {
	return filepath.Join(ta.dataPath, "tasks", status, taskID+".json")
}

// taskDirPath returns the path to a task status directory.
func (ta *TaskAccess) taskDirPath(status string) string {
	return filepath.Join(ta.dataPath, "tasks", status)
}

// allStatusSlugs returns all status directory slugs from board config plus "archived".
func (ta *TaskAccess) allStatusSlugs() []string {
	config, _ := ta.GetBoardConfiguration()
	var slugs []string
	if config != nil {
		slugs = make([]string, 0, len(config.ColumnDefinitions)+1)
		for _, col := range config.ColumnDefinitions {
			slugs = append(slugs, col.Name)
		}
	} else {
		slugs = []string{"todo", "doing", "done"}
	}
	slugs = append(slugs, string(TaskStatusArchived))
	return slugs
}

// findTaskInPlan searches all statuses for a task by ID.
// Returns the task, status name, and task index within the status list.
func (ta *TaskAccess) findTaskInPlan(taskID string) (*Task, string, int, error) {
	statuses := ta.allStatusSlugs()
	for _, status := range statuses {
		tasks, err := ta.GetTasksByStatus(status)
		if err != nil {
			continue
		}
		for i, task := range tasks {
			if task.ID == taskID {
				return &task, status, i, nil
			}
		}
	}

	return nil, "", -1, nil
}

// FindTasksByTag returns all tasks across all statuses that contain the exact tag string.
func (ta *TaskAccess) FindTasksByTag(tag string) ([]TaggedTask, error) {
	var result []TaggedTask

	for _, status := range ta.allStatusSlugs() {
		tasks, err := ta.GetTasksByStatus(status)
		if err != nil {
			return nil, fmt.Errorf("TaskAccess.FindTasksByTag: failed to get tasks with status %s: %w", status, err)
		}
		for _, t := range tasks {
			for _, taskTag := range t.Tags {
				if taskTag == tag {
					result = append(result, TaggedTask{Task: t, Status: status})
					break
				}
			}
		}
	}

	return result, nil
}

// GetTasksByTheme returns all tasks for a specific theme by filtering across all statuses.
func (ta *TaskAccess) GetTasksByTheme(themeID string) ([]Task, error) {
	var allTasks []Task

	for _, status := range ta.allStatusSlugs() {
		tasks, err := ta.GetTasksByStatus(status)
		if err != nil {
			return nil, fmt.Errorf("TaskAccess.GetTasksByTheme: failed to get tasks with status %s: %w", status, err)
		}
		for _, t := range tasks {
			if t.ThemeID == themeID {
				allTasks = append(allTasks, t)
			}
		}
	}

	return allTasks, nil
}

// GetTasksByStatus returns all tasks for a specific status.
// Accepts any slug string; returns empty list if directory doesn't exist.
func (ta *TaskAccess) GetTasksByStatus(status string) ([]Task, error) {
	dirPath := ta.taskDirPath(status)

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []Task{}, nil
		}
		return nil, fmt.Errorf("TaskAccess.GetTasksByStatus: failed to read task directory: %w", err)
	}

	var tasks []Task
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		filePath := filepath.Join(dirPath, entry.Name())
		data, err := os.ReadFile(filePath)
		if err != nil {
			return nil, fmt.Errorf("TaskAccess.GetTasksByStatus: failed to read task file %s: %w", filePath, err)
		}

		var task Task
		if err := json.Unmarshal(data, &task); err != nil {
			return nil, fmt.Errorf("TaskAccess.GetTasksByStatus: failed to parse task file %s: %w", filePath, err)
		}

		tasks = append(tasks, task)
	}

	return tasks, nil
}

// saveTaskFile writes a task to disk without committing.
// Returns the file path and whether the task is new.
func (ta *TaskAccess) saveTaskFile(task *Task) ([]string, bool, error) {
	if task.ThemeID == "" && !slices.Contains(task.Tags, "Routine") {
		return nil, false, fmt.Errorf("TaskAccess.saveTaskFile: themeID cannot be empty")
	}

	now := utilities.Now()
	isNew := task.ID == ""

	// Generate ID if not provided
	if isNew {
		task.ID = ta.generateTaskID(task.ThemeID)
	}

	// Set timestamps
	if task.CreatedAt.IsZero() {
		task.CreatedAt = now
	}
	task.UpdatedAt = now

	// Determine status
	status := string(TaskStatusTodo)
	var affectedPaths []string
	if !isNew {
		existing, existingStatus, _, err := ta.findTaskInPlan(task.ID)
		if err != nil {
			return nil, false, fmt.Errorf("TaskAccess.saveTaskFile: failed to find existing task: %w", err)
		}
		if existing != nil {
			status = existingStatus
		}
	}

	// Save task to file
	filePath := ta.taskFilePath(status, task.ID)
	if err := writeJSON(filePath, *task); err != nil {
		return nil, false, fmt.Errorf("TaskAccess.saveTaskFile: %w", err)
	}
	affectedPaths = append(affectedPaths, filePath)

	return affectedPaths, isNew, nil
}

// taskOrderFilePath returns the path to the task_order.json file.
func (ta *TaskAccess) taskOrderFilePath() string {
	return filepath.Join(ta.dataPath, "task_order.json")
}

// LoadTaskOrder reads task_order.json and returns the order map.
// Returns an empty map if the file doesn't exist.
func (ta *TaskAccess) LoadTaskOrder() (map[string][]string, error) {
	filePath := ta.taskOrderFilePath()

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return make(map[string][]string), nil
		}
		return nil, fmt.Errorf("TaskAccess.LoadTaskOrder: failed to read file: %w", err)
	}

	var order map[string][]string
	if err := json.Unmarshal(data, &order); err != nil {
		return nil, fmt.Errorf("TaskAccess.LoadTaskOrder: failed to parse file: %w", err)
	}

	if order == nil {
		return make(map[string][]string), nil
	}
	return order, nil
}

// writeTaskOrder writes the order map to task_order.json without committing.
// Internal helper; tests in the same package may call it directly.
func (ta *TaskAccess) writeTaskOrder(order map[string][]string) error {
	filePath := ta.taskOrderFilePath()
	if err := writeJSON(filePath, order); err != nil {
		return fmt.Errorf("TaskAccess.writeTaskOrder: %w", err)
	}
	return nil
}

// SaveTaskOrder writes the order map to task_order.json and git-commits.
func (ta *TaskAccess) SaveTaskOrder(order map[string][]string) error {
	ta.mu.Lock()
	defer ta.mu.Unlock()
	if err := ta.writeTaskOrder(order); err != nil {
		return fmt.Errorf("TaskAccess.SaveTaskOrder: %w", err)
	}
	if err := commitFiles(ta.repo, []string{ta.taskOrderFilePath()}, "Update task order"); err != nil {
		return fmt.Errorf("TaskAccess.SaveTaskOrder: %w", err)
	}
	return nil
}

// archivedOrderFilePath returns the path to the archived_order.json file.
func (ta *TaskAccess) archivedOrderFilePath() string {
	return filepath.Join(ta.dataPath, "archived_order.json")
}

// LoadArchivedOrder reads archived_order.json and returns the order slice.
// Returns an empty slice if the file doesn't exist.
func (ta *TaskAccess) LoadArchivedOrder() ([]string, error) {
	filePath := ta.archivedOrderFilePath()

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, fmt.Errorf("TaskAccess.LoadArchivedOrder: failed to read file: %w", err)
	}

	var order []string
	if err := json.Unmarshal(data, &order); err != nil {
		return nil, fmt.Errorf("TaskAccess.LoadArchivedOrder: failed to parse file: %w", err)
	}

	if order == nil {
		return []string{}, nil
	}
	return order, nil
}

// writeArchivedOrder writes the order slice to archived_order.json without
// committing. Internal helper; tests in the same package may call it directly.
func (ta *TaskAccess) writeArchivedOrder(order []string) error {
	filePath := ta.archivedOrderFilePath()
	if err := writeJSON(filePath, order); err != nil {
		return fmt.Errorf("TaskAccess.writeArchivedOrder: %w", err)
	}
	return nil
}

// boardConfigFilePath returns the path to the board configuration file.
func (ta *TaskAccess) boardConfigFilePath() string {
	return filepath.Join(ta.dataPath, "board_config.json")
}

// GetBoardConfiguration returns the board configuration.
// Reads from board_config.json if it exists, returns nil if no config file.
func (ta *TaskAccess) GetBoardConfiguration() (*BoardConfiguration, error) {
	filePath := ta.boardConfigFilePath()
	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("TaskAccess.GetBoardConfiguration: failed to read config file: %w", err)
	}

	var config BoardConfiguration
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("TaskAccess.GetBoardConfiguration: failed to parse config file: %w", err)
	}
	return &config, nil
}

// saveBoardConfiguration writes the board configuration to file without
// committing. Internal helper used by the IBoard verbs and the
// SeedDefaultBoard bootstrap entry point — both wrap the write in a
// single git commit at the verb level.
func (ta *TaskAccess) saveBoardConfiguration(config *BoardConfiguration) error {
	filePath := ta.boardConfigFilePath()
	if err := writeJSON(filePath, config); err != nil {
		return fmt.Errorf("TaskAccess.saveBoardConfiguration: %w", err)
	}
	return nil
}

// ensureStatusDirectory creates a task status directory if it doesn't
// exist. Internal helper used by IBoard.AddColumn and SeedDefaultBoard.
func (ta *TaskAccess) ensureStatusDirectory(slug string) error {
	dir := ta.taskDirPath(slug)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("TaskAccess.ensureStatusDirectory: failed to create directory %s: %w", dir, err)
	}
	return nil
}

// removeStatusDirectory removes an empty task status directory.
// Internal helper; tests in the same package may call it directly.
func (ta *TaskAccess) removeStatusDirectory(slug string) error {
	dir := ta.taskDirPath(slug)
	if err := os.Remove(dir); err != nil {
		return fmt.Errorf("TaskAccess.removeStatusDirectory: failed to remove directory %s: %w", dir, err)
	}
	return nil
}

// renameStatusDirectory renames a task status directory.
// Internal helper used by IBoard.RenameColumn; tests in the same package may
// call it directly.
func (ta *TaskAccess) renameStatusDirectory(oldSlug, newSlug string) error {
	oldDir := ta.taskDirPath(oldSlug)
	newDir := ta.taskDirPath(newSlug)
	if err := os.Rename(oldDir, newDir); err != nil {
		return fmt.Errorf("TaskAccess.renameStatusDirectory: failed to rename %s to %s: %w", oldDir, newDir, err)
	}
	return nil
}

// generateTaskID generates a new theme-scoped task ID by scanning filenames
// across all status directories (including archived). This is resilient to
// data inconsistencies where a file's name doesn't match its internal themeId.
// When themeAbbr is empty (e.g. for routine tasks), IDs use the format "T{n}"
// instead of "{themeAbbr}-T{n}".
func (ta *TaskAccess) generateTaskID(themeAbbr string) string {
	maxNum := 0

	var re *regexp.Regexp
	if themeAbbr == "" {
		re = regexp.MustCompile(`^T(\d+)\.json$`)
	} else {
		re = regexp.MustCompile(`^` + regexp.QuoteMeta(themeAbbr) + `-T(\d+)\.json$`)
	}

	for _, status := range ta.allStatusSlugs() {
		entries, err := os.ReadDir(ta.taskDirPath(status))
		if err != nil {
			continue
		}
		for _, entry := range entries {
			matches := re.FindStringSubmatch(entry.Name())
			if len(matches) == 2 {
				num, err := strconv.Atoi(matches[1])
				if err == nil && num > maxNum {
					maxNum = num
				}
			}
		}
	}

	if themeAbbr == "" {
		return fmt.Sprintf("T%d", maxNum+1)
	}
	return fmt.Sprintf("%s-T%d", themeAbbr, maxNum+1)
}

// =============================================================================
// ITask facet implementation
// =============================================================================
//
// The eight verbs below implement the ITask facet declared in task_facets.go.
// Each verb is atomic: it acquires ta.mu, performs the file/order mutations
// across whatever state it touches, calls commitFiles to produce ONE git
// commit, and releases the lock. Internal helpers (saveTaskFile,
// findTaskInPlan, generateTaskID, LoadTaskOrder, LoadArchivedOrder, the
// Write* helpers) are reused without re-locking — they assume the caller
// holds ta.mu.
//
// Lock-ordering invariant: ta.mu is acquired BEFORE the per-repo lock that
// commitFiles takes inside repo.Begin(). No path inverts this order.

// removeFromOrderMap removes taskID from every zone in orderMap and returns
// whether any change was made.
func removeFromOrderMap(orderMap map[string][]string, taskID string) bool {
	changed := false
	for zone, ids := range orderMap {
		filtered := make([]string, 0, len(ids))
		for _, id := range ids {
			if id != taskID {
				filtered = append(filtered, id)
			}
		}
		if len(filtered) != len(ids) {
			orderMap[zone] = filtered
			changed = true
		}
	}
	return changed
}

// removeFromArchivedOrder removes taskID from the archived-order slice and
// returns the (possibly trimmed) slice along with whether a change occurred.
func removeFromArchivedOrder(order []string, taskID string) ([]string, bool) {
	filtered := make([]string, 0, len(order))
	for _, id := range order {
		if id != taskID {
			filtered = append(filtered, id)
		}
	}
	return filtered, len(filtered) != len(order)
}

// Find returns tasks matching the supplied filter. All filter fields are
// optional and combine with AND. RoutineRef is reserved for Epic 3 (task
// 102) when Task gains the matching field; for now it is a no-op.
func (ta *TaskAccess) Find(filter TaskFilter) ([]Task, error) {
	ta.mu.Lock()
	defer ta.mu.Unlock()

	var statuses []string
	if filter.Status != nil {
		statuses = []string{*filter.Status}
	} else {
		statuses = ta.allStatusSlugs()
	}

	var result []Task
	for _, status := range statuses {
		tasks, err := ta.GetTasksByStatus(status)
		if err != nil {
			return nil, fmt.Errorf("TaskAccess.Find: %w", err)
		}
		for _, t := range tasks {
			if filter.ThemeID != nil && t.ThemeID != *filter.ThemeID {
				continue
			}
			if filter.Tag != nil {
				if !slices.Contains(t.Tags, *filter.Tag) {
					continue
				}
			}
			// TODO(task 102): wire RoutineRef filter when Task gains the field.
			result = append(result, t)
		}
	}
	return result, nil
}

// Create allocates a fresh task ID, writes the task file in the todo
// status directory, appends the new ID to the supplied zone in
// task_order.json, and commits both files in a single git commit. The
// task-ID allocation is serialised by ta.mu (closes audit finding #6).
func (ta *TaskAccess) Create(task Task, zone string) (Task, error) {
	ta.mu.Lock()
	defer ta.mu.Unlock()

	// Force ID allocation under the lock.
	task.ID = ""
	taskPaths, _, err := ta.saveTaskFile(&task)
	if err != nil {
		return Task{}, fmt.Errorf("TaskAccess.Create: %w", err)
	}

	orderMap, err := ta.LoadTaskOrder()
	if err != nil {
		return Task{}, fmt.Errorf("TaskAccess.Create: failed to load task order: %w", err)
	}
	orderMap[zone] = append(orderMap[zone], task.ID)

	orderFilePath := ta.taskOrderFilePath()
	if err := writeJSON(orderFilePath, orderMap); err != nil {
		return Task{}, fmt.Errorf("TaskAccess.Create: failed to write task order: %w", err)
	}

	commitPaths := append(taskPaths, orderFilePath)
	if err := commitFiles(ta.repo, commitPaths, fmt.Sprintf("Add task: %s", task.Title)); err != nil {
		return Task{}, fmt.Errorf("TaskAccess.Create: %w", err)
	}
	return task, nil
}

// Save writes the task file in place (no zone change, no order-map
// mutation) and produces a single commit.
func (ta *TaskAccess) Save(task Task) error {
	ta.mu.Lock()
	defer ta.mu.Unlock()

	if task.ID == "" {
		return fmt.Errorf("TaskAccess.Save: task ID is required")
	}
	paths, _, err := ta.saveTaskFile(&task)
	if err != nil {
		return fmt.Errorf("TaskAccess.Save: %w", err)
	}
	if err := commitFiles(ta.repo, paths, fmt.Sprintf("Update task: %s", task.Title)); err != nil {
		return fmt.Errorf("TaskAccess.Save: %w", err)
	}
	return nil
}

// Move atomically applies the requested status change, optional priority
// change (or full field rewrite via req.Task), and zone-position update
// for a task. File rename, task-file rewrite, and order-map mutation all
// happen in a single critical section followed by ONE git commit (closes
// audit finding #7).
//
// When req.Task is non-nil the access verb rewrites the entire task file
// with that content (preserving CreatedAt/ID from the on-disk version if
// they would otherwise be zero) and ignores req.NewPriority. This single-
// commit path is used by PlanningManager.UpdateTask when a field edit
// also moves the task across zones, replacing the legacy Save+Move
// composition.
func (ta *TaskAccess) Move(req MoveRequest) (MoveOutcome, error) {
	ta.mu.Lock()
	defer ta.mu.Unlock()

	foundTask, currentStatus, _, err := ta.findTaskInPlan(req.TaskID)
	if err != nil {
		return MoveOutcome{}, fmt.Errorf("TaskAccess.Move: %w", err)
	}
	if foundTask == nil {
		return MoveOutcome{}, fmt.Errorf("TaskAccess.Move: task with ID %s not found", req.TaskID)
	}
	if req.Task != nil && req.Task.ID != "" && req.Task.ID != req.TaskID {
		return MoveOutcome{}, fmt.Errorf("TaskAccess.Move: req.Task.ID %q does not match req.TaskID %q", req.Task.ID, req.TaskID)
	}

	commitPaths := []string{}

	// Compose the task content to write. When req.Task is supplied it
	// is the authoritative source for every field; otherwise we start
	// from the on-disk task and apply the optional NewPriority.
	taskCopy := *foundTask
	contentChanged := false
	if req.Task != nil {
		updated := *req.Task
		updated.ID = foundTask.ID
		if updated.CreatedAt.IsZero() {
			updated.CreatedAt = foundTask.CreatedAt
		}
		taskCopy = updated
		contentChanged = true
	} else if req.NewPriority != "" && req.NewPriority != taskCopy.Priority {
		taskCopy.Priority = req.NewPriority
		contentChanged = true
	}
	taskCopy.UpdatedAt = utilities.Now()

	statusChanged := req.NewStatus != "" && req.NewStatus != currentStatus
	targetStatus := currentStatus
	if statusChanged {
		targetStatus = req.NewStatus
	}

	if statusChanged {
		oldPath := ta.taskFilePath(currentStatus, req.TaskID)
		newPath := ta.taskFilePath(targetStatus, req.TaskID)
		if err := os.Rename(oldPath, newPath); err != nil {
			return MoveOutcome{}, fmt.Errorf("TaskAccess.Move: failed to move task file: %w", err)
		}
		commitPaths = append(commitPaths, oldPath, newPath)
	}

	if contentChanged || statusChanged {
		// Write the (potentially relocated) task file with refreshed
		// fields so the on-disk content matches its directory.
		filePath := ta.taskFilePath(targetStatus, req.TaskID)
		if err := writeJSON(filePath, taskCopy); err != nil {
			return MoveOutcome{}, fmt.Errorf("TaskAccess.Move: failed to write task file: %w", err)
		}
		if !statusChanged {
			commitPaths = append(commitPaths, filePath)
		}
	}

	// Apply order-map updates.
	orderMap, err := ta.LoadTaskOrder()
	if err != nil {
		return MoveOutcome{}, fmt.Errorf("TaskAccess.Move: failed to load task order: %w", err)
	}
	orderChanged := false
	if len(req.Positions) > 0 {
		// Remove the task from every existing zone first so we don't end
		// up with duplicate entries; then merge the supplied zones.
		if removeFromOrderMap(orderMap, req.TaskID) {
			orderChanged = true
		}
		for zone, ids := range req.Positions {
			orderMap[zone] = append([]string(nil), ids...)
			orderChanged = true
		}
	} else if statusChanged {
		// No client-supplied positions: remove from current zones and
		// append to the target status as a single zone.
		removeFromOrderMap(orderMap, req.TaskID)
		orderMap[targetStatus] = append(orderMap[targetStatus], req.TaskID)
		orderChanged = true
	}
	if orderChanged {
		orderFilePath := ta.taskOrderFilePath()
		if err := writeJSON(orderFilePath, orderMap); err != nil {
			return MoveOutcome{}, fmt.Errorf("TaskAccess.Move: failed to write task order: %w", err)
		}
		commitPaths = append(commitPaths, orderFilePath)
	}

	if len(commitPaths) > 0 {
		msg := fmt.Sprintf("Move task %s: %s -> %s", taskCopy.Title, currentStatus, targetStatus)
		if !statusChanged {
			msg = fmt.Sprintf("Update task: %s", taskCopy.Title)
		}
		if err := commitFiles(ta.repo, commitPaths, msg); err != nil {
			return MoveOutcome{}, fmt.Errorf("TaskAccess.Move: %w", err)
		}
	}

	outcome := MoveOutcome{
		Title:     taskCopy.Title,
		Positions: map[string][]string{},
	}
	for zone := range req.Positions {
		outcome.Positions[zone] = append([]string(nil), orderMap[zone]...)
	}
	if statusChanged && len(req.Positions) == 0 {
		outcome.Positions[targetStatus] = append([]string(nil), orderMap[targetStatus]...)
	}
	return outcome, nil
}

// Archive moves a task to the archived/ directory, removes it from
// task_order.json, prepends it to archived_order.json, and commits all
// three changes in a single git commit.
func (ta *TaskAccess) Archive(taskID string) error {
	ta.mu.Lock()
	defer ta.mu.Unlock()

	foundTask, currentStatus, _, err := ta.findTaskInPlan(taskID)
	if err != nil {
		return fmt.Errorf("TaskAccess.Archive: %w", err)
	}
	if foundTask == nil {
		return fmt.Errorf("TaskAccess.Archive: task with ID %s not found", taskID)
	}
	if currentStatus == string(TaskStatusArchived) {
		return nil
	}

	oldPath := ta.taskFilePath(currentStatus, taskID)
	newPath := ta.taskFilePath(string(TaskStatusArchived), taskID)
	if err := os.Rename(oldPath, newPath); err != nil {
		return fmt.Errorf("TaskAccess.Archive: failed to move task file: %w", err)
	}
	commitPaths := []string{oldPath, newPath}

	orderMap, err := ta.LoadTaskOrder()
	if err != nil {
		return fmt.Errorf("TaskAccess.Archive: failed to load task order: %w", err)
	}
	if removeFromOrderMap(orderMap, taskID) {
		orderFilePath := ta.taskOrderFilePath()
		if err := writeJSON(orderFilePath, orderMap); err != nil {
			return fmt.Errorf("TaskAccess.Archive: failed to write task order: %w", err)
		}
		commitPaths = append(commitPaths, orderFilePath)
	}

	archived, err := ta.LoadArchivedOrder()
	if err != nil {
		return fmt.Errorf("TaskAccess.Archive: failed to load archived order: %w", err)
	}
	// Prepend taskID (most recently archived first).
	archived = append([]string{taskID}, archived...)
	archivedFilePath := ta.archivedOrderFilePath()
	if err := writeJSON(archivedFilePath, archived); err != nil {
		return fmt.Errorf("TaskAccess.Archive: failed to write archived order: %w", err)
	}
	commitPaths = append(commitPaths, archivedFilePath)

	if err := commitFiles(ta.repo, commitPaths, fmt.Sprintf("Archive task: %s", foundTask.Title)); err != nil {
		return fmt.Errorf("TaskAccess.Archive: %w", err)
	}
	return nil
}

// Restore moves a task from archived/ to done/, removes it from
// archived_order.json, appends it to the done zone in task_order.json,
// and commits all three changes in a single git commit.
func (ta *TaskAccess) Restore(taskID string) error {
	ta.mu.Lock()
	defer ta.mu.Unlock()

	foundTask, currentStatus, _, err := ta.findTaskInPlan(taskID)
	if err != nil {
		return fmt.Errorf("TaskAccess.Restore: %w", err)
	}
	if foundTask == nil {
		return fmt.Errorf("TaskAccess.Restore: task with ID %s not found", taskID)
	}
	if currentStatus != string(TaskStatusArchived) {
		return fmt.Errorf("TaskAccess.Restore: task %s is not archived (status: %s)", taskID, currentStatus)
	}

	oldPath := ta.taskFilePath(string(TaskStatusArchived), taskID)
	newPath := ta.taskFilePath(string(TaskStatusDone), taskID)
	if err := os.Rename(oldPath, newPath); err != nil {
		return fmt.Errorf("TaskAccess.Restore: failed to move task file: %w", err)
	}
	commitPaths := []string{oldPath, newPath}

	archived, err := ta.LoadArchivedOrder()
	if err != nil {
		return fmt.Errorf("TaskAccess.Restore: failed to load archived order: %w", err)
	}
	if updated, changed := removeFromArchivedOrder(archived, taskID); changed {
		archivedFilePath := ta.archivedOrderFilePath()
		if err := writeJSON(archivedFilePath, updated); err != nil {
			return fmt.Errorf("TaskAccess.Restore: failed to write archived order: %w", err)
		}
		commitPaths = append(commitPaths, archivedFilePath)
	}

	orderMap, err := ta.LoadTaskOrder()
	if err != nil {
		return fmt.Errorf("TaskAccess.Restore: failed to load task order: %w", err)
	}
	doneZone := string(TaskStatusDone)
	orderMap[doneZone] = append(orderMap[doneZone], taskID)
	orderFilePath := ta.taskOrderFilePath()
	if err := writeJSON(orderFilePath, orderMap); err != nil {
		return fmt.Errorf("TaskAccess.Restore: failed to write task order: %w", err)
	}
	commitPaths = append(commitPaths, orderFilePath)

	if err := commitFiles(ta.repo, commitPaths, fmt.Sprintf("Restore task: %s", foundTask.Title)); err != nil {
		return fmt.Errorf("TaskAccess.Restore: %w", err)
	}
	return nil
}

// Delete removes the task file and cleans up its order-map entries
// (active or archived) in a single git commit.
func (ta *TaskAccess) Delete(taskID string) error {
	ta.mu.Lock()
	defer ta.mu.Unlock()

	foundTask, currentStatus, _, err := ta.findTaskInPlan(taskID)
	if err != nil {
		return fmt.Errorf("TaskAccess.Delete: %w", err)
	}
	if foundTask == nil {
		return fmt.Errorf("TaskAccess.Delete: task with ID %s not found", taskID)
	}

	filePath := ta.taskFilePath(currentStatus, taskID)
	if err := os.Remove(filePath); err != nil {
		return fmt.Errorf("TaskAccess.Delete: failed to delete task file: %w", err)
	}
	commitPaths := []string{filePath}

	if currentStatus == string(TaskStatusArchived) {
		archived, err := ta.LoadArchivedOrder()
		if err == nil {
			if updated, changed := removeFromArchivedOrder(archived, taskID); changed {
				archivedFilePath := ta.archivedOrderFilePath()
				if err := writeJSON(archivedFilePath, updated); err != nil {
					return fmt.Errorf("TaskAccess.Delete: failed to write archived order: %w", err)
				}
				commitPaths = append(commitPaths, archivedFilePath)
			}
		}
	} else {
		orderMap, err := ta.LoadTaskOrder()
		if err == nil {
			if removeFromOrderMap(orderMap, taskID) {
				orderFilePath := ta.taskOrderFilePath()
				if err := writeJSON(orderFilePath, orderMap); err != nil {
					return fmt.Errorf("TaskAccess.Delete: failed to write task order: %w", err)
				}
				commitPaths = append(commitPaths, orderFilePath)
			}
		}
	}

	if err := commitFiles(ta.repo, commitPaths, fmt.Sprintf("Delete task: %s", foundTask.Title)); err != nil {
		return fmt.Errorf("TaskAccess.Delete: %w", err)
	}
	return nil
}

// Reorder merges the supplied positions map into task_order.json. Zones
// not present in the input keep their current contents. Returns the
// authoritative post-write zone contents that the caller touched.
func (ta *TaskAccess) Reorder(positions map[string][]string) (ReorderOutcome, error) {
	ta.mu.Lock()
	defer ta.mu.Unlock()

	orderMap, err := ta.LoadTaskOrder()
	if err != nil {
		return ReorderOutcome{}, fmt.Errorf("TaskAccess.Reorder: failed to load task order: %w", err)
	}
	for zone, ids := range positions {
		orderMap[zone] = append([]string(nil), ids...)
	}

	orderFilePath := ta.taskOrderFilePath()
	if err := writeJSON(orderFilePath, orderMap); err != nil {
		return ReorderOutcome{}, fmt.Errorf("TaskAccess.Reorder: failed to write task order: %w", err)
	}
	if err := commitFiles(ta.repo, []string{orderFilePath}, "Update task order"); err != nil {
		return ReorderOutcome{}, fmt.Errorf("TaskAccess.Reorder: %w", err)
	}

	outcome := ReorderOutcome{Positions: map[string][]string{}}
	for zone := range positions {
		outcome.Positions[zone] = append([]string(nil), orderMap[zone]...)
	}
	return outcome, nil
}
