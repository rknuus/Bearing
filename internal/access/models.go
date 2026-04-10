// Package access provides data access components for the Bearing application.
// This package contains resource access components that implement the iDesign methodology,
// providing CRUD operations for plan-related entities with git-based versioning.
package access

import (
	"regexp"

	"github.com/rkn/bearing/internal/utilities"
)


// LifeTheme represents a long-term life focus area with associated objectives.
// Life themes are the top-level organizational unit for goals and tasks.
type LifeTheme struct {
	ID         string      `json:"id"`              // 1-3 uppercase letter abbreviation: H, CF, LRN
	Name       string      `json:"name"`            // Human-readable theme name
	Color      string      `json:"color"`           // Hex color code for UI display
	Objectives []Objective `json:"objectives"`      // Associated objectives for this theme
	Routines   []Routine   `json:"routines,omitempty"` // Ongoing health metrics for this theme
}

// Objective represents a medium-term goal under a life theme.
// Objectives contain key results that measure progress toward the goal.
// Objectives can be nested to arbitrary depth.
type Objective struct {
	ID            string      `json:"id"`                      // Theme-scoped ID: H-O1, CF-O3
	ParentID      string      `json:"parentId"`                // ID of parent theme or objective
	Title         string      `json:"title"`                   // Objective title/description
	Status        string      `json:"status,omitempty"`        // Lifecycle status: active, completed, archived (empty = active)
	Tags          []string    `json:"tags,omitempty"`          // Freeform tags for categorization
	ClosingStatus string      `json:"closingStatus,omitempty"` // achieved, partially-achieved, missed, postponed, canceled
	ClosingNotes  string      `json:"closingNotes,omitempty"`  // Reflection notes
	ClosedAt      utilities.Timestamp `json:"closedAt,omitzero"`       // ISO 8601 timestamp
	KeyResults    []KeyResult `json:"keyResults"`              // Measurable key results
	Objectives    []Objective `json:"objectives,omitempty"`    // Nested child objectives
}

// KeyResult represents a measurable outcome for an objective.
// Key results define how progress toward an objective is measured.
type KeyResult struct {
	ID           string `json:"id"`                     // Theme-scoped ID: H-KR1, CF-KR2
	ParentID     string `json:"parentId"`               // ID of owning objective
	Description  string `json:"description"`            // Description of the measurable result
	Type         string `json:"type,omitempty"`         // KR type: "" or "metric" (default), "binary"
	Status       string `json:"status,omitempty"`       // Lifecycle status: active, completed, archived (empty = active)
	StartValue   int    `json:"startValue,omitempty"`   // Starting value (default 0)
	CurrentValue int    `json:"currentValue,omitempty"` // Current progress value
	TargetValue  int    `json:"targetValue,omitempty"`  // Target value (0 = untracked, 1 = binary)
}

// RepeatPattern defines a recurrence schedule for a routine.
type RepeatPattern struct {
	Frequency  string `json:"frequency"`            // "daily", "weekly", "monthly", "yearly"
	Interval   int    `json:"interval"`             // every N (default 1)
	Weekdays   []int  `json:"weekdays,omitempty"`   // for weekly: 0=Sun..6=Sat
	DayOfMonth int    `json:"dayOfMonth,omitempty"` // for monthly
	StartDate  utilities.CalendarDate `json:"startDate"`  // YYYY-MM-DD
}

// ScheduleException represents a single date override in a routine's schedule.
type ScheduleException struct {
	OriginalDate utilities.CalendarDate `json:"originalDate"` // suppressed occurrence date
	NewDate      utilities.CalendarDate `json:"newDate"`      // replacement date
}

// Routine represents an ongoing activity tracked per occurrence for a life theme.
// Periodic routines have a RepeatPattern; sporadic routines have none.
type Routine struct {
	ID            string              `json:"id"`                      // Theme-scoped: {ThemeID}-R{n}
	Description   string              `json:"description"`             // What is being tracked
	RepeatPattern *RepeatPattern      `json:"repeatPattern,omitempty"` // Recurrence schedule (nil = sporadic)
	Exceptions    []ScheduleException `json:"exceptions,omitempty"`    // Date overrides for the schedule
}

// ClosingStatus constants for objective closing workflow
const (
	ClosingStatusAchieved          = "achieved"
	ClosingStatusPartiallyAchieved = "partially-achieved"
	ClosingStatusMissed            = "missed"
	ClosingStatusPostponed         = "postponed"
	ClosingStatusCanceled          = "canceled"
)

// KRType constants for key result types
const (
	// KRTypeMetric is the default KR type with start/current/target values
	KRTypeMetric = "metric"
	// KRTypeBinary is a binary KR type (done/not done) with fixed start=0, target=1
	KRTypeBinary = "binary"
)

// DayFocus represents the daily focus on one or more life themes.
// It links a calendar date to life themes with optional notes.
type DayFocus struct {
	Date           utilities.CalendarDate `json:"date"`         // Date in YYYY-MM-DD format
	ThemeIDs       []string `json:"themeIds,omitempty"`        // Links to LifeTheme.IDs
	Notes          string   `json:"notes"`                     // Optional daily notes
	Text           string   `json:"text"`                      // Free-text content for the day
	OkrIDs         []string `json:"okrIds,omitempty"`          // Optional OKR item references (Objective/KR IDs)
	Tags           []string `json:"tags,omitempty"`            // Optional day-level tags
	RoutineChecks  []string `json:"routineChecks,omitempty"`   // IDs of routines checked off on this date
}

// Task represents a single actionable item linked to a life theme.
// Tasks are organized in a kanban-style board with status derived from directory location.
type Task struct {
	ID            string   `json:"id"`                       // Unique task identifier
	Title         string   `json:"title"`                    // Task title/description
	Description   string   `json:"description,omitempty"`    // Detailed task description
	ThemeID       string   `json:"themeId"`                  // Links to a LifeTheme.ID
	Priority      string   `json:"priority"`                 // Eisenhower matrix: important-urgent, important-not-urgent, not-important-urgent
	Tags          []string `json:"tags,omitempty"`           // Freeform tags for categorization
	PromotionDate utilities.CalendarDate `json:"promotionDate,omitzero"` // Date when priority should be promoted (YYYY-MM-DD)
	CreatedAt     utilities.Timestamp    `json:"createdAt,omitzero"`     // ISO 8601 creation timestamp
	UpdatedAt     utilities.Timestamp    `json:"updatedAt,omitzero"`     // ISO 8601 last-update timestamp
}

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

// QueryCriteria defines search parameters for filtered task retrieval.
type QueryCriteria struct {
	Columns        []string `json:"columns,omitempty"`        // Filter by column names (todo, doing, done)
	Sections       []string `json:"sections,omitempty"`       // Filter by priority section names
	Priority       string   `json:"priority,omitempty"`       // Filter by priority value
	Tags           []string `json:"tags,omitempty"`           // Filter by tags (any match)
}

// TaggedTask pairs a task with its current status directory slug.
// Used by FindTasksByTag to return tasks along with their status.
type TaggedTask struct {
	Task   Task   `json:"task"`
	Status string `json:"status"`
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

// Slugify delegates to utilities.Slugify.
// Deprecated: Use utilities.Slugify directly.
func Slugify(title string) string {
	return utilities.Slugify(title)
}

// IsValidThemeID checks whether an ID matches the theme abbreviation format (1-3 uppercase letters).
func IsValidThemeID(id string) bool {
	matched, _ := regexp.MatchString(`^[A-Z]{1,3}$`, id)
	return matched
}

// ExtractThemeAbbr extracts the theme abbreviation from any theme-scoped ID.
// For a theme ID like "H", returns "H". For "H-O1", returns "H". For "CF-KR2", returns "CF".
// Returns empty string if the ID doesn't match any known pattern.
func ExtractThemeAbbr(id string) string {
	if IsValidThemeID(id) {
		return id
	}
	re := regexp.MustCompile(`^([A-Z]{1,3})-(?:O|KR|T)\d+$`)
	matches := re.FindStringSubmatch(id)
	if len(matches) == 2 {
		return matches[1]
	}
	return ""
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

// ThemesFile represents the structure of the themes.json file
type ThemesFile struct {
	Themes []LifeTheme `json:"themes"`
}

// YearFocusFile represents the structure of a year's calendar file (e.g., 2026.json)
type YearFocusFile struct {
	Year    int        `json:"year"`
	Entries []DayFocus `json:"entries"`
}

// PersonalVision stores the user's personal mission and vision statements.
type PersonalVision struct {
	Mission   string `json:"mission"`
	Vision    string `json:"vision"`
	UpdatedAt utilities.Timestamp `json:"updatedAt,omitzero"`
}

// NavigationContext stores the user's navigation state for persistence.
type NavigationContext struct {
	CurrentView    string   `json:"currentView"`
	CurrentItem    string   `json:"currentItem"`
	FilterThemeID  string   `json:"filterThemeId"`              // deprecated: kept for backward compat
	FilterThemeIDs []string `json:"filterThemeIds,omitempty"`   // multi-theme filter
	LastAccessed   utilities.Timestamp `json:"lastAccessed"`
	ShowCompleted  bool     `json:"showCompleted,omitempty"`
	ShowArchived      bool     `json:"showArchived,omitempty"`
	ShowArchivedTasks bool     `json:"showArchivedTasks,omitempty"`
	ExpandedOkrIds    []string `json:"expandedOkrIds,omitempty"`
	FilterTagIDs      []string `json:"filterTagIds,omitempty"`
	TodayFocusActive  *bool    `json:"todayFocusActive,omitempty"`
	TagFocusActive    *bool    `json:"tagFocusActive,omitempty"`
	CollapsedSections            []string `json:"collapsedSections,omitempty"`
	CollapsedColumns             []string `json:"collapsedColumns,omitempty"`
	CalendarDayEditorDate        string   `json:"calendarDayEditorDate,omitempty"`
	CalendarDayEditorExpandedIds []string `json:"calendarDayEditorExpandedIds,omitempty"`
	VisionCollapsed              *bool    `json:"visionCollapsed,omitempty"`
}
