// Package access provides data access components for the Bearing application.
// This package contains resource access components that implement the iDesign methodology,
// providing CRUD operations for plan-related entities with git-based versioning.
package access

// LifeTheme represents a long-term life focus area with associated objectives.
// Life themes are the top-level organizational unit for goals and tasks.
type LifeTheme struct {
	ID         string      `json:"id"`         // Hierarchical ID: THEME-01
	Name       string      `json:"name"`       // Human-readable theme name
	Color      string      `json:"color"`      // Hex color code for UI display
	Objectives []Objective `json:"objectives"` // Associated objectives for this theme
}

// Objective represents a medium-term goal under a life theme.
// Objectives contain key results that measure progress toward the goal.
// Objectives can be nested to arbitrary depth, producing hierarchical IDs like THEME-01.OKR-01.OKR-01.
type Objective struct {
	ID         string      `json:"id"`                    // Hierarchical ID: THEME-01.OKR-01
	Title      string      `json:"title"`                 // Objective title/description
	KeyResults []KeyResult `json:"keyResults"`            // Measurable key results
	Objectives []Objective `json:"objectives,omitempty"`  // Nested child objectives
}

// KeyResult represents a measurable outcome for an objective.
// Key results define how progress toward an objective is measured.
type KeyResult struct {
	ID          string `json:"id"`          // Hierarchical ID: THEME-01.OKR-01.KR-01
	Description string `json:"description"` // Description of the measurable result
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
	ID       string `json:"id"`       // Unique task identifier
	Title    string `json:"title"`    // Task title/description
	ThemeID  string `json:"themeId"`  // Links to a LifeTheme.ID
	DayDate  string `json:"dayDate"`  // Associated date in YYYY-MM-DD format
	Priority string `json:"priority"` // Eisenhower matrix: important-urgent, not-important-urgent, important-not-urgent, not-important-not-urgent
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
)

// ValidTaskStatuses returns all valid task status values
func ValidTaskStatuses() []TaskStatus {
	return []TaskStatus{TaskStatusTodo, TaskStatusDoing, TaskStatusDone}
}

// IsValidTaskStatus checks if a status string is valid
func IsValidTaskStatus(status string) bool {
	for _, valid := range ValidTaskStatuses() {
		if string(valid) == status {
			return true
		}
	}
	return false
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
	// PriorityNotImportantNotUrgent represents neither important nor urgent tasks (Eliminate)
	PriorityNotImportantNotUrgent Priority = "not-important-not-urgent"
)

// ValidPriorities returns all valid priority values
func ValidPriorities() []Priority {
	return []Priority{
		PriorityImportantUrgent,
		PriorityImportantNotUrgent,
		PriorityNotImportantUrgent,
		PriorityNotImportantNotUrgent,
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
	CurrentView   string `json:"currentView"`
	CurrentItem   string `json:"currentItem"`
	FilterThemeID string `json:"filterThemeId"`
	FilterDate    string `json:"filterDate"`
	LastAccessed  string `json:"lastAccessed"`
}
