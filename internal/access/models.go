// Package access provides data access components for the Bearing application.
// This package contains resource access components that implement the iDesign methodology,
// providing CRUD operations for plan-related entities with git-based versioning.
package access

// LifeTheme represents a long-term life focus area with associated objectives.
// Life themes are the top-level organizational unit for goals and tasks.
type LifeTheme struct {
	ID         string      `json:"id"`         // 1-3 uppercase letter abbreviation: H, CF, LRN
	Name       string      `json:"name"`       // Human-readable theme name
	Color      string      `json:"color"`      // Hex color code for UI display
	Objectives []Objective `json:"objectives"` // Associated objectives for this theme
}

// Objective represents a medium-term goal under a life theme.
// Objectives contain key results that measure progress toward the goal.
// Objectives can be nested to arbitrary depth.
type Objective struct {
	ID         string      `json:"id"`                   // Theme-scoped ID: H-O1, CF-O3
	ParentID   string      `json:"parentId"`             // ID of parent theme or objective
	Title      string      `json:"title"`                // Objective title/description
	Status     string      `json:"status,omitempty"`     // Lifecycle status: active, completed, archived (empty = active)
	KeyResults []KeyResult `json:"keyResults"`           // Measurable key results
	Objectives []Objective `json:"objectives,omitempty"` // Nested child objectives
}

// KeyResult represents a measurable outcome for an objective.
// Key results define how progress toward an objective is measured.
type KeyResult struct {
	ID           string `json:"id"`                     // Theme-scoped ID: H-KR1, CF-KR2
	ParentID     string `json:"parentId"`               // ID of owning objective
	Description  string `json:"description"`            // Description of the measurable result
	Status       string `json:"status,omitempty"`       // Lifecycle status: active, completed, archived (empty = active)
	StartValue   int    `json:"startValue,omitempty"`   // Starting value (default 0)
	CurrentValue int    `json:"currentValue,omitempty"` // Current progress value
	TargetValue  int    `json:"targetValue,omitempty"`  // Target value (0 = untracked, 1 = binary)
}

// DayFocus represents the daily focus on a specific life theme.
// It links a calendar date to a life theme with optional notes.
type DayFocus struct {
	Date    string `json:"date"`    // Date in YYYY-MM-DD format
	ThemeID string `json:"themeId"` // Links to a LifeTheme.ID
	Notes   string `json:"notes"`   // Optional daily notes
	Text    string `json:"text"`    // Free-text content for the day
}

// Task represents a single actionable item linked to a life theme.
// Tasks are organized in a kanban-style board with status derived from directory location.
type Task struct {
	ID            string   `json:"id"`                       // Unique task identifier
	Title         string   `json:"title"`                    // Task title/description
	Description   string   `json:"description,omitempty"`    // Detailed task description
	ThemeID       string   `json:"themeId"`                  // Links to a LifeTheme.ID
	DayDate       string   `json:"dayDate"`                  // Associated date in YYYY-MM-DD format
	Priority      string   `json:"priority"`                 // Eisenhower matrix: important-urgent, important-not-urgent, not-important-urgent
	Tags          []string `json:"tags,omitempty"`           // Freeform tags for categorization
	DueDate       string   `json:"dueDate,omitempty"`        // Due date in YYYY-MM-DD format
	PromotionDate string   `json:"promotionDate,omitempty"`  // Date when priority should be promoted (YYYY-MM-DD)
	ParentTaskID  *string  `json:"parentTaskId,omitempty"`   // ID of parent task for subtask hierarchy
	CreatedAt     string   `json:"createdAt,omitempty"`      // ISO 8601 creation timestamp
	UpdatedAt     string   `json:"updatedAt,omitempty"`      // ISO 8601 last-update timestamp
}

// CascadePolicy defines how parent task operations affect subtasks.
type CascadePolicy string

const (
	// CascadePolicyNoAction leaves subtasks unchanged
	CascadePolicyNoAction CascadePolicy = "no_action"
	// CascadePolicyArchive archives subtasks along with the parent
	CascadePolicyArchive CascadePolicy = "archive"
	// CascadePolicyDelete deletes subtasks along with the parent
	CascadePolicyDelete CascadePolicy = "delete"
	// CascadePolicyPromote promotes subtasks to top-level tasks
	CascadePolicyPromote CascadePolicy = "promote"
)

// ColumnType represents the semantic type of a board column.
type ColumnType string

const (
	// ColumnTypeTodo represents the backlog/todo column with Eisenhower priority sections
	ColumnTypeTodo ColumnType = "todo"
	// ColumnTypeDoing represents work-in-progress columns
	ColumnTypeDoing ColumnType = "doing"
	// ColumnTypeDone represents the completed tasks column
	ColumnTypeDone ColumnType = "done"
)

// SectionDefinition defines a priority section within a column.
type SectionDefinition struct {
	Name  string `json:"name"`  // Internal identifier matching a priority value
	Title string `json:"title"` // Display title
	Color string `json:"color"` // Hex color for UI display
}

// ColumnDefinition defines a single column's structure and display properties.
type ColumnDefinition struct {
	Name     string              `json:"name"`               // Internal identifier: "todo", "doing", "done"
	Title    string              `json:"title"`              // Display title: "TODO", "DOING", "DONE"
	Type     ColumnType          `json:"type"`               // Semantic type for UI behavior
	Sections []SectionDefinition `json:"sections,omitempty"` // Priority sections (only for ColumnTypeTodo)
}

// BoardConfiguration defines the board structure and column layout.
type BoardConfiguration struct {
	Name              string             `json:"name"`
	ColumnDefinitions []ColumnDefinition `json:"columnDefinitions"`
}

// DefaultBoardConfiguration returns the default board configuration with
// three columns (todo with Eisenhower sections, doing, done).
func DefaultBoardConfiguration() *BoardConfiguration {
	return &BoardConfiguration{
		Name: "Bearing Board",
		ColumnDefinitions: []ColumnDefinition{
			{
				Name:  "todo",
				Title: "TODO",
				Type:  ColumnTypeTodo,
				Sections: []SectionDefinition{
					{Name: "important-urgent", Title: "Important & Urgent", Color: "#ef4444"},
					{Name: "not-important-urgent", Title: "Not Important & Urgent", Color: "#f59e0b"},
					{Name: "important-not-urgent", Title: "Important & Not Urgent", Color: "#3b82f6"},
				},
			},
			{
				Name:  "doing",
				Title: "DOING",
				Type:  ColumnTypeDoing,
			},
			{
				Name:  "done",
				Title: "DONE",
				Type:  ColumnTypeDone,
			},
		},
	}
}

// QueryCriteria defines search parameters for filtered task retrieval.
type QueryCriteria struct {
	Columns        []string `json:"columns,omitempty"`        // Filter by column names (todo, doing, done)
	Sections       []string `json:"sections,omitempty"`       // Filter by priority section names
	Priority       string   `json:"priority,omitempty"`       // Filter by priority value
	Tags           []string `json:"tags,omitempty"`           // Filter by tags (any match)
	DueDateFrom    string   `json:"dueDateFrom,omitempty"`    // Filter tasks due on or after this date
	DueDateTo      string   `json:"dueDateTo,omitempty"`      // Filter tasks due on or before this date
	HierarchyLevel string   `json:"hierarchyLevel,omitempty"` // "top" for root tasks, "sub" for subtasks, empty for all
}

// TaskStatus represents the kanban column status for tasks
type TaskStatus string

const (
	// TaskStatusTodo represents tasks not yet started
	TaskStatusTodo TaskStatus = "todo"
	// TaskStatusDoing represents tasks in progress
	TaskStatusDoing TaskStatus = "doing"
	// TaskStatusDone represents completed tasks
	TaskStatusDone TaskStatus = "done"
	// TaskStatusArchived represents archived tasks (hidden from board by default)
	TaskStatusArchived TaskStatus = "archived"
)

// ValidTaskStatuses returns all valid task status values
func ValidTaskStatuses() []TaskStatus {
	return []TaskStatus{TaskStatusTodo, TaskStatusDoing, TaskStatusDone}
}

// IsValidTaskStatus checks if a status string is a valid kanban column status
func IsValidTaskStatus(status string) bool {
	for _, valid := range ValidTaskStatuses() {
		if string(valid) == status {
			return true
		}
	}
	return false
}

// AllTaskStatuses returns all task status values including archived
func AllTaskStatuses() []TaskStatus {
	return []TaskStatus{TaskStatusTodo, TaskStatusDoing, TaskStatusDone, TaskStatusArchived}
}

// IsAnyTaskStatus checks if a status string is any valid task status (including archived)
func IsAnyTaskStatus(status string) bool {
	for _, valid := range AllTaskStatuses() {
		if string(valid) == status {
			return true
		}
	}
	return false
}

// OKRStatus represents the lifecycle status for objectives and key results
type OKRStatus string

const (
	// OKRStatusActive represents active (in-progress) OKRs
	OKRStatusActive OKRStatus = "active"
	// OKRStatusCompleted represents completed OKRs
	OKRStatusCompleted OKRStatus = "completed"
	// OKRStatusArchived represents archived OKRs (hidden by default)
	OKRStatusArchived OKRStatus = "archived"
)

// IsValidOKRStatus checks if a status string is valid.
// Empty string is treated as valid (equivalent to "active").
func IsValidOKRStatus(status string) bool {
	if status == "" {
		return true
	}
	switch OKRStatus(status) {
	case OKRStatusActive, OKRStatusCompleted, OKRStatusArchived:
		return true
	}
	return false
}

// EffectiveOKRStatus returns "active" if status is empty, otherwise the status as-is.
func EffectiveOKRStatus(status string) string {
	if status == "" {
		return string(OKRStatusActive)
	}
	return status
}

// Priority represents the Eisenhower matrix priority levels
type Priority string

const (
	// PriorityImportantUrgent represents important and urgent tasks (Do First)
	PriorityImportantUrgent Priority = "important-urgent"
	// PriorityImportantNotUrgent represents important but not urgent tasks (Schedule)
	PriorityImportantNotUrgent Priority = "important-not-urgent"
	// PriorityNotImportantUrgent represents not important but urgent tasks (Delegate)
	PriorityNotImportantUrgent Priority = "not-important-urgent"
)

// ValidPriorities returns all valid priority values
func ValidPriorities() []Priority {
	return []Priority{
		PriorityImportantUrgent,
		PriorityImportantNotUrgent,
		PriorityNotImportantUrgent,
	}
}

// IsValidPriority checks if a priority string is valid
func IsValidPriority(priority string) bool {
	for _, valid := range ValidPriorities() {
		if string(valid) == priority {
			return true
		}
	}
	return false
}

// ThemesFile represents the structure of the themes.json file
type ThemesFile struct {
	Themes []LifeTheme `json:"themes"`
}

// YearFocusFile represents the structure of a year's calendar file (e.g., 2026.json)
type YearFocusFile struct {
	Year    int        `json:"year"`
	Entries []DayFocus `json:"entries"`
}

// NavigationContext stores the user's navigation state for persistence.
type NavigationContext struct {
	CurrentView    string   `json:"currentView"`
	CurrentItem    string   `json:"currentItem"`
	FilterThemeID  string   `json:"filterThemeId"`              // deprecated: kept for backward compat
	FilterThemeIDs []string `json:"filterThemeIds,omitempty"`   // multi-theme filter
	FilterDate     string   `json:"filterDate"`
	LastAccessed   string   `json:"lastAccessed"`
	ShowCompleted  bool     `json:"showCompleted,omitempty"`
	ShowArchived   bool     `json:"showArchived,omitempty"`
	ExpandedOkrIds []string `json:"expandedOkrIds,omitempty"`
	FilterTagIDs   []string `json:"filterTagIds,omitempty"`
}
