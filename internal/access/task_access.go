package access

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/rkn/bearing/internal/utilities"
)

// ITaskAccess defines the interface for task data access operations.
// All write operations use git versioning through transactions.
type ITaskAccess interface {
	// Tasks
	GetTasksByTheme(themeID string) ([]Task, error)
	GetTasksByStatus(status string) ([]Task, error)
	SaveTask(task Task) error
	WriteTask(task Task) error
	SaveTaskWithOrder(task Task, dropZone string) (*Task, error)
	UpdateTaskWithOrderMove(task Task, oldZone, newZone string) error
	MoveTask(taskID, newStatus string) error
	WriteMoveTask(taskID, newStatus string) ([]string, error)
	ArchiveTask(taskID string) error
	WriteArchiveTask(taskID string) ([]string, error)
	RestoreTask(taskID string) error
	WriteRestoreTask(taskID string) ([]string, error)
	DeleteTask(taskID string) error
	DeleteTaskWithOrder(taskID string) error

	// Task Query
	FindTasksByTag(tag string) ([]TaggedTask, error)

	// Task Order
	LoadTaskOrder() (map[string][]string, error)
	SaveTaskOrder(order map[string][]string) error
	WriteTaskOrder(order map[string][]string) error

	// Archived Order
	ArchivedOrderFilePath() string
	LoadArchivedOrder() ([]string, error)
	WriteArchivedOrder(order []string) error
	SaveArchivedOrder(order []string) error

	// Board Configuration
	GetBoardConfiguration() (*BoardConfiguration, error)
	SaveBoardConfiguration(config *BoardConfiguration) error
	EnsureStatusDirectory(slug string) error
	RemoveStatusDirectory(slug string) error
	RenameStatusDirectory(oldSlug, newSlug string) error
	UpdateTaskStatusField(dirSlug, newStatus string) ([]string, error)
	BoardConfigFilePath() string
	TaskOrderFilePath() string
	TaskDirPath(status string) string

	// Version Control
	CommitFiles(paths []string, message string) error
	CommitAll(message string) error
}

// TaskAccess implements ITaskAccess with file-based storage and git versioning.
type TaskAccess struct {
	dataPath string
	repo     utilities.IRepository
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

// TaskDirPath returns the directory path for a given status (public).
func (ta *TaskAccess) TaskDirPath(status string) string {
	return ta.taskDirPath(status)
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
	if task.ThemeID == "" {
		return nil, false, fmt.Errorf("TaskAccess.saveTaskFile: themeID cannot be empty")
	}

	now := time.Now().UTC().Format(time.RFC3339)
	isNew := task.ID == ""

	// Generate ID if not provided
	if isNew {
		task.ID = ta.generateTaskID(task.ThemeID)
	}

	// Set timestamps
	if task.CreatedAt == "" {
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

// WriteTask writes a task to disk without committing.
func (ta *TaskAccess) WriteTask(task Task) error {
	_, _, err := ta.saveTaskFile(&task)
	if err != nil {
		return fmt.Errorf("TaskAccess.WriteTask: %w", err)
	}
	return nil
}

// SaveTask saves or updates a task.
// If the task ID is empty, a new ID will be generated and CreatedAt is set.
// UpdatedAt is always set to the current time on every save.
func (ta *TaskAccess) SaveTask(task Task) error {
	paths, isNew, err := ta.saveTaskFile(&task)
	if err != nil {
		return fmt.Errorf("TaskAccess.SaveTask: %w", err)
	}

	// Commit with git
	action := "Update"
	if isNew {
		action = "Add"
	}
	if err := commitFiles(ta.repo, paths, fmt.Sprintf("%s task: %s", action, task.Title)); err != nil {
		return fmt.Errorf("TaskAccess.SaveTask: %w", err)
	}

	return nil
}

// SaveTaskWithOrder atomically saves a task and appends it to the task order
// in a single git commit. This prevents race conditions when creating multiple
// tasks concurrently.
func (ta *TaskAccess) SaveTaskWithOrder(task Task, dropZone string) (*Task, error) {
	taskPaths, isNew, err := ta.saveTaskFile(&task)
	if err != nil {
		return nil, fmt.Errorf("TaskAccess.SaveTaskWithOrder: %w", err)
	}

	// Load current order, append task ID, and write order file
	orderMap, err := ta.LoadTaskOrder()
	if err != nil {
		return nil, fmt.Errorf("TaskAccess.SaveTaskWithOrder: failed to load task order: %w", err)
	}
	orderMap[dropZone] = append(orderMap[dropZone], task.ID)

	orderFilePath := ta.taskOrderFilePath()
	if err := writeJSON(orderFilePath, orderMap); err != nil {
		return nil, fmt.Errorf("TaskAccess.SaveTaskWithOrder: failed to write task order: %w", err)
	}

	// Commit all affected files in a single transaction
	action := "Update"
	if isNew {
		action = "Add"
	}
	commitPaths := append(taskPaths, orderFilePath)
	if err := commitFiles(ta.repo, commitPaths, fmt.Sprintf("%s task: %s", action, task.Title)); err != nil {
		return nil, fmt.Errorf("TaskAccess.SaveTaskWithOrder: %w", err)
	}

	return &task, nil
}

// UpdateTaskWithOrderMove atomically saves a task and moves its entry from
// oldZone to newZone in task_order.json in a single git commit.
func (ta *TaskAccess) UpdateTaskWithOrderMove(task Task, oldZone, newZone string) error {
	taskPaths, _, err := ta.saveTaskFile(&task)
	if err != nil {
		return fmt.Errorf("TaskAccess.UpdateTaskWithOrderMove: %w", err)
	}

	orderMap, err := ta.LoadTaskOrder()
	if err != nil {
		return fmt.Errorf("TaskAccess.UpdateTaskWithOrderMove: failed to load task order: %w", err)
	}

	// Remove from old zone
	if ids, ok := orderMap[oldZone]; ok {
		filtered := make([]string, 0, len(ids))
		for _, id := range ids {
			if id != task.ID {
				filtered = append(filtered, id)
			}
		}
		orderMap[oldZone] = filtered
	}

	// Append to new zone
	orderMap[newZone] = append(orderMap[newZone], task.ID)

	orderFilePath := ta.taskOrderFilePath()
	if err := writeJSON(orderFilePath, orderMap); err != nil {
		return fmt.Errorf("TaskAccess.UpdateTaskWithOrderMove: failed to write task order: %w", err)
	}

	commitPaths := append(taskPaths, orderFilePath)
	if err := commitFiles(ta.repo, commitPaths, fmt.Sprintf("Update task: %s", task.Title)); err != nil {
		return fmt.Errorf("TaskAccess.UpdateTaskWithOrderMove: %w", err)
	}

	return nil
}

// WriteMoveTask moves a task file to a new status directory without committing.
// Returns the affected file paths (old + new) for the caller to include in a batch commit.
func (ta *TaskAccess) WriteMoveTask(taskID, newStatus string) ([]string, error) {
	foundTask, currentStatus, _, err := ta.findTaskInPlan(taskID)
	if err != nil {
		return nil, fmt.Errorf("TaskAccess.WriteMoveTask: %w", err)
	}
	if foundTask == nil {
		return nil, fmt.Errorf("TaskAccess.WriteMoveTask: task with ID %s not found", taskID)
	}
	if currentStatus == newStatus {
		return nil, nil
	}

	oldPath := ta.taskFilePath(currentStatus, taskID)
	newPath := ta.taskFilePath(newStatus, taskID)

	if err := os.Rename(oldPath, newPath); err != nil {
		return nil, fmt.Errorf("TaskAccess.WriteMoveTask: failed to move task file: %w", err)
	}

	return []string{oldPath, newPath}, nil
}

// MoveTask moves a task to a new status using git mv.
// The caller (manager layer) is responsible for validating the target status.
func (ta *TaskAccess) MoveTask(taskID, newStatus string) error {
	foundTask, currentStatus, _, findErr := ta.findTaskInPlan(taskID)
	if findErr != nil {
		return fmt.Errorf("TaskAccess.MoveTask: %w", findErr)
	}
	title := taskID
	oldStatus := ""
	if foundTask != nil {
		title = foundTask.Title
		oldStatus = currentStatus
	}

	paths, err := ta.WriteMoveTask(taskID, newStatus)
	if err != nil {
		return fmt.Errorf("TaskAccess.MoveTask: %w", err)
	}
	if paths == nil {
		return nil
	}

	if err := commitFiles(ta.repo, paths, fmt.Sprintf("Move task %s: %s -> %s", title, oldStatus, newStatus)); err != nil {
		return fmt.Errorf("TaskAccess.MoveTask: %w", err)
	}

	return nil
}

// WriteArchiveTask moves a task file to the archived directory without committing.
// Returns the affected file paths (old + new) for the caller to include in a batch commit.
func (ta *TaskAccess) WriteArchiveTask(taskID string) ([]string, error) {
	_, currentStatus, _, err := ta.findTaskInPlan(taskID)
	if err != nil {
		return nil, fmt.Errorf("TaskAccess.WriteArchiveTask: %w", err)
	}
	if currentStatus == string(TaskStatusArchived) {
		return nil, nil
	}

	oldPath := ta.taskFilePath(currentStatus, taskID)
	newPath := ta.taskFilePath(string(TaskStatusArchived), taskID)

	if err := os.Rename(oldPath, newPath); err != nil {
		return nil, fmt.Errorf("TaskAccess.WriteArchiveTask: failed to move task file: %w", err)
	}

	return []string{oldPath, newPath}, nil
}

// ArchiveTask moves a task to the archived directory.
func (ta *TaskAccess) ArchiveTask(taskID string) error {
	paths, err := ta.WriteArchiveTask(taskID)
	if err != nil {
		return fmt.Errorf("TaskAccess.ArchiveTask: %w", err)
	}
	if paths == nil {
		return nil
	}

	if err := commitFiles(ta.repo, paths, fmt.Sprintf("Archive task: %s", taskID)); err != nil {
		return fmt.Errorf("TaskAccess.ArchiveTask: %w", err)
	}

	return nil
}

// WriteRestoreTask moves a task file from the archived directory to done without committing.
// Returns the affected file paths (old + new) for the caller to include in a batch commit.
func (ta *TaskAccess) WriteRestoreTask(taskID string) ([]string, error) {
	_, currentStatus, _, err := ta.findTaskInPlan(taskID)
	if err != nil {
		return nil, fmt.Errorf("TaskAccess.WriteRestoreTask: %w", err)
	}
	if currentStatus != string(TaskStatusArchived) {
		return nil, fmt.Errorf("TaskAccess.WriteRestoreTask: task %s is not archived (status: %s)", taskID, currentStatus)
	}

	oldPath := ta.taskFilePath(string(TaskStatusArchived), taskID)
	newPath := ta.taskFilePath(string(TaskStatusDone), taskID)

	if err := os.Rename(oldPath, newPath); err != nil {
		return nil, fmt.Errorf("TaskAccess.WriteRestoreTask: failed to move task file: %w", err)
	}

	return []string{oldPath, newPath}, nil
}

// RestoreTask moves a task from the archived directory to done.
func (ta *TaskAccess) RestoreTask(taskID string) error {
	paths, err := ta.WriteRestoreTask(taskID)
	if err != nil {
		return fmt.Errorf("TaskAccess.RestoreTask: %w", err)
	}
	if paths == nil {
		return nil
	}

	if err := commitFiles(ta.repo, paths, fmt.Sprintf("Restore task: %s", taskID)); err != nil {
		return fmt.Errorf("TaskAccess.RestoreTask: %w", err)
	}

	return nil
}

// DeleteTask deletes a task.
func (ta *TaskAccess) DeleteTask(taskID string) error {
	// Find the task
	foundTask, currentStatus, _, err := ta.findTaskInPlan(taskID)
	if err != nil {
		return fmt.Errorf("TaskAccess.DeleteTask: %w", err)
	}
	if foundTask == nil {
		return fmt.Errorf("TaskAccess.DeleteTask: task with ID %s not found", taskID)
	}

	filePath := ta.taskFilePath(currentStatus, taskID)

	// Delete the file
	if err := os.Remove(filePath); err != nil {
		return fmt.Errorf("TaskAccess.DeleteTask: failed to delete task file: %w", err)
	}

	// Commit with git
	if err := commitFiles(ta.repo, []string{filePath}, fmt.Sprintf("Delete task: %s", foundTask.Title)); err != nil {
		return fmt.Errorf("TaskAccess.DeleteTask: %w", err)
	}

	return nil
}

// DeleteTaskWithOrder atomically deletes a task file and removes it from the
// task order in a single git commit.
func (ta *TaskAccess) DeleteTaskWithOrder(taskID string) error {
	// Find the task
	foundTask, currentStatus, _, err := ta.findTaskInPlan(taskID)
	if err != nil {
		return fmt.Errorf("TaskAccess.DeleteTaskWithOrder: %w", err)
	}
	if foundTask == nil {
		return fmt.Errorf("TaskAccess.DeleteTaskWithOrder: task with ID %s not found", taskID)
	}

	filePath := ta.taskFilePath(currentStatus, taskID)

	// Delete the file
	if err := os.Remove(filePath); err != nil {
		return fmt.Errorf("TaskAccess.DeleteTaskWithOrder: failed to delete task file: %w", err)
	}

	// Remove from task order
	commitPaths := []string{filePath}
	orderMap, loadErr := ta.LoadTaskOrder()
	if loadErr == nil {
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
		if changed {
			orderFilePath := ta.taskOrderFilePath()
			if err := writeJSON(orderFilePath, orderMap); err != nil {
				return fmt.Errorf("TaskAccess.DeleteTaskWithOrder: failed to write task order: %w", err)
			}
			commitPaths = append(commitPaths, orderFilePath)
		}
	}

	// Commit with git
	if err := commitFiles(ta.repo, commitPaths, fmt.Sprintf("Delete task: %s", foundTask.Title)); err != nil {
		return fmt.Errorf("TaskAccess.DeleteTaskWithOrder: %w", err)
	}

	return nil
}

// taskOrderFilePath returns the path to the task_order.json file.
func (ta *TaskAccess) taskOrderFilePath() string {
	return filepath.Join(ta.dataPath, "task_order.json")
}

// TaskOrderFilePath returns the path to the task_order.json file (public).
func (ta *TaskAccess) TaskOrderFilePath() string {
	return ta.taskOrderFilePath()
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

// WriteTaskOrder writes the order map to task_order.json without committing.
func (ta *TaskAccess) WriteTaskOrder(order map[string][]string) error {
	filePath := ta.taskOrderFilePath()
	if err := writeJSON(filePath, order); err != nil {
		return fmt.Errorf("TaskAccess.WriteTaskOrder: %w", err)
	}
	return nil
}

// SaveTaskOrder writes the order map to task_order.json and git-commits.
func (ta *TaskAccess) SaveTaskOrder(order map[string][]string) error {
	if err := ta.WriteTaskOrder(order); err != nil {
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

// ArchivedOrderFilePath returns the path to the archived_order.json file (public).
func (ta *TaskAccess) ArchivedOrderFilePath() string {
	return ta.archivedOrderFilePath()
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

// WriteArchivedOrder writes the order slice to archived_order.json without committing.
func (ta *TaskAccess) WriteArchivedOrder(order []string) error {
	filePath := ta.archivedOrderFilePath()
	if err := writeJSON(filePath, order); err != nil {
		return fmt.Errorf("TaskAccess.WriteArchivedOrder: %w", err)
	}
	return nil
}

// SaveArchivedOrder writes the order slice to archived_order.json and git-commits.
func (ta *TaskAccess) SaveArchivedOrder(order []string) error {
	if err := ta.WriteArchivedOrder(order); err != nil {
		return fmt.Errorf("TaskAccess.SaveArchivedOrder: %w", err)
	}
	if err := commitFiles(ta.repo, []string{ta.archivedOrderFilePath()}, "Update archived order"); err != nil {
		return fmt.Errorf("TaskAccess.SaveArchivedOrder: %w", err)
	}
	return nil
}

// boardConfigFilePath returns the path to the board configuration file.
func (ta *TaskAccess) boardConfigFilePath() string {
	return filepath.Join(ta.dataPath, "board_config.json")
}

// BoardConfigFilePath returns the path to the board configuration file (public).
func (ta *TaskAccess) BoardConfigFilePath() string {
	return ta.boardConfigFilePath()
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

// SaveBoardConfiguration writes the board configuration to file without git commit.
// The caller is responsible for committing the change.
func (ta *TaskAccess) SaveBoardConfiguration(config *BoardConfiguration) error {
	filePath := ta.boardConfigFilePath()
	if err := writeJSON(filePath, config); err != nil {
		return fmt.Errorf("TaskAccess.SaveBoardConfiguration: %w", err)
	}
	return nil
}

// EnsureStatusDirectory creates a task status directory if it doesn't exist.
func (ta *TaskAccess) EnsureStatusDirectory(slug string) error {
	dir := ta.taskDirPath(slug)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("TaskAccess.EnsureStatusDirectory: failed to create directory %s: %w", dir, err)
	}
	return nil
}

// RemoveStatusDirectory removes an empty task status directory.
func (ta *TaskAccess) RemoveStatusDirectory(slug string) error {
	dir := ta.taskDirPath(slug)
	if err := os.Remove(dir); err != nil {
		return fmt.Errorf("TaskAccess.RemoveStatusDirectory: failed to remove directory %s: %w", dir, err)
	}
	return nil
}

// RenameStatusDirectory renames a task status directory.
func (ta *TaskAccess) RenameStatusDirectory(oldSlug, newSlug string) error {
	oldDir := ta.taskDirPath(oldSlug)
	newDir := ta.taskDirPath(newSlug)
	if err := os.Rename(oldDir, newDir); err != nil {
		return fmt.Errorf("TaskAccess.RenameStatusDirectory: failed to rename %s to %s: %w", oldDir, newDir, err)
	}
	return nil
}

// UpdateTaskStatusField reads all task JSON files in a status directory,
// updates each task's status-related data to reflect the new status,
// and returns the list of affected file paths (for commit orchestration).
// Note: This does NOT rename the directory — use RenameStatusDirectory for that.
func (ta *TaskAccess) UpdateTaskStatusField(dirSlug, newStatus string) ([]string, error) {
	dirPath := ta.taskDirPath(dirSlug)
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, fmt.Errorf("TaskAccess.UpdateTaskStatusField: failed to read directory: %w", err)
	}

	var affectedPaths []string
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		filePath := filepath.Join(dirPath, entry.Name())
		// Read, update, and write back — tasks don't have a status field in JSON
		// (status is derived from directory), but this method is available for
		// future use if task files gain a status field.
		affectedPaths = append(affectedPaths, filePath)
	}
	return affectedPaths, nil
}

// CommitFiles stages and commits the given file paths with a message.
func (ta *TaskAccess) CommitFiles(paths []string, message string) error {
	return commitFiles(ta.repo, paths, message)
}

// CommitAll stages all changes in the repository and commits with the given message.
func (ta *TaskAccess) CommitAll(message string) error {
	return commitAll(ta.repo, message)
}

// generateTaskID generates a new theme-scoped task ID by scanning filenames
// across all status directories (including archived). This is resilient to
// data inconsistencies where a file's name doesn't match its internal themeId.
func (ta *TaskAccess) generateTaskID(themeAbbr string) string {
	maxNum := 0
	re := regexp.MustCompile(`^` + regexp.QuoteMeta(themeAbbr) + `-T(\d+)\.json$`)

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

	return fmt.Sprintf("%s-T%d", themeAbbr, maxNum+1)
}
