// Package managers provides business logic components for the Bearing application.
// This package contains manager components that implement the iDesign methodology,
// orchestrating access components and implementing business rules.
package managers

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/rkn/bearing/internal/access"
	"github.com/rkn/bearing/internal/engines/progress_engine"
	"github.com/rkn/bearing/internal/engines/rule_engine"
	"github.com/rkn/bearing/internal/engines/schedule_engine"
	"github.com/rkn/bearing/internal/utilities"
)

// TaskWithStatus represents a task with its current status.
type TaskWithStatus struct {
	Task
	Status string `json:"status"`
}

// NavigationContext stores the user's navigation state for persistence.
type NavigationContext struct {
	CurrentView                  string                 `json:"currentView"`
	CurrentItem                  string                 `json:"currentItem"`
	FilterThemeID                string                 `json:"filterThemeId"`
	FilterThemeIDs               []string               `json:"filterThemeIds,omitempty"`
	LastAccessed                 utilities.Timestamp    `json:"lastAccessed"`
	ShowCompleted                bool                   `json:"showCompleted,omitempty"`
	ShowArchived                 bool                   `json:"showArchived,omitempty"`
	ShowArchivedTasks            bool                   `json:"showArchivedTasks,omitempty"`
	ExpandedOkrIds               []string               `json:"expandedOkrIds,omitempty"`
	FilterTagIDs                 []string               `json:"filterTagIds,omitempty"`
	TodayFocusActive             *bool                  `json:"todayFocusActive,omitempty"`
	TagFocusActive               *bool                  `json:"tagFocusActive,omitempty"`
	CollapsedSections            []string               `json:"collapsedSections,omitempty"`
	CollapsedColumns             []string               `json:"collapsedColumns,omitempty"`
	CalendarDayEditorDate        utilities.CalendarDate `json:"calendarDayEditorDate,omitempty"`
	CalendarDayEditorExpandedIds []string               `json:"calendarDayEditorExpandedIds,omitempty"`
	VisionCollapsed              *bool                  `json:"visionCollapsed,omitempty"`
	RoutinesCollapsed            *bool                  `json:"routinesCollapsed,omitempty"`
}

// IGoalStructure defines behavioral operations for managing the OKR hierarchy.
type IGoalStructure interface {
	GetHierarchy() ([]LifeTheme, error)
	Establish(req EstablishRequest) (*EstablishResult, error)
	Revise(req ReviseRequest) error
	RecordProgress(goalId string, value int) error
	Dismiss(goalId string) error
	SuggestAbbreviation(name string) (string, error)
}

// IGoalLifecycle defines operations for OKR status transitions.
type IGoalLifecycle interface {
	SetObjectiveStatus(objectiveId, status string) error
	SetKeyResultStatus(keyResultId, status string) error
	CloseObjective(objectiveId, closingStatus, closingNotes string) error
	ReopenObjective(objectiveId string) error
}

// ITaskExecution defines operations for task management on the board.
type ITaskExecution interface {
	GetTasks() ([]TaskWithStatus, error)
	CreateTask(title, themeId, priority, description, tags, promotionDate string) (*Task, error)
	MoveTask(taskId, newStatus, newPriority string, positions map[string][]string) (*MoveTaskResult, error)
	UpdateTask(task Task) error
	DeleteTask(taskId string) error
	ArchiveTask(taskId string) error
	ArchiveAllDoneTasks() error
	RestoreTask(taskId string) error
	ReorderTasks(positions map[string][]string) (*ReorderResult, error)
	ProcessPriorityPromotions() ([]PromotedTask, error)
}

// IFocusPlanning defines operations for calendar day focus.
type IFocusPlanning interface {
	GetYearFocus(year int) ([]DayFocus, error)
	SaveDayFocus(day DayFocus) error
	ClearDayFocus(date string) error
}

// IVision defines operations for personal vision management.
type IVision interface {
	GetPersonalVision() (*PersonalVision, error)
	SavePersonalVision(mission, vision string) error
}

// IProgress defines operations for progress computation.
type IProgress interface {
	GetAllThemeProgress() ([]ThemeProgress, error)
}

// IUIState defines operations for UI state persistence.
type IUIState interface {
	LoadNavigationContext() (*NavigationContext, error)
	SaveNavigationContext(ctx NavigationContext) error
	LoadTaskDrafts() (json.RawMessage, error)
	SaveTaskDrafts(data json.RawMessage) error
}

// IPlanningManager defines the full interface for planning business logic,
// composed of 7 facet interfaces.
type IPlanningManager interface {
	IGoalStructure
	IGoalLifecycle
	ITaskExecution
	IFocusPlanning
	IVision
	IProgress
	IUIState
}

// RuleViolation represents a single rule violation in the Manager layer's public interface.
type RuleViolation struct {
	RuleID   string `json:"ruleId"`
	Priority int    `json:"priority"`
	Message  string `json:"message"`
	Category string `json:"category"`
}

// MoveTaskResult contains the result of a MoveTask operation,
// including any rule violations that caused rejection.
type MoveTaskResult struct {
	Success    bool                `json:"success"`
	Violations []RuleViolation     `json:"violations,omitempty"`
	Positions  map[string][]string `json:"positions,omitempty"`
}

// ReorderResult contains the authoritative task positions after a reorder operation.
type ReorderResult struct {
	Success   bool                `json:"success"`
	Positions map[string][]string `json:"positions"`
}

// PromotedTask represents a task that was promoted by ProcessPriorityPromotions.
type PromotedTask struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	OldPriority string `json:"oldPriority"`
	NewPriority string `json:"newPriority"`
}

// ObjectiveProgress represents the computed progress of an objective.
type ObjectiveProgress struct {
	ObjectiveID string  `json:"objectiveId"`
	Progress    float64 `json:"progress"` // 0-100, or -1 if no data
}

// ThemeProgress represents computed progress for a theme and its objectives.
type ThemeProgress struct {
	ThemeID    string              `json:"themeId"`
	Progress   float64             `json:"progress"` // 0-100, average of objective progresses
	Objectives []ObjectiveProgress `json:"objectives"`
}

// Task represents a task in the Manager layer's public interface.
type Task struct {
	ID            string                 `json:"id"`
	Title         string                 `json:"title"`
	Description   string                 `json:"description,omitempty"`
	ThemeID       string                 `json:"themeId"`
	Priority      string                 `json:"priority"`
	Tags          []string               `json:"tags,omitempty"`
	PromotionDate utilities.CalendarDate `json:"promotionDate,omitempty"`
	CreatedAt     utilities.Timestamp    `json:"createdAt,omitempty"`
	UpdatedAt     utilities.Timestamp    `json:"updatedAt,omitempty"`
}

// KeyResult represents a measurable outcome in the Manager layer's public interface.
type KeyResult struct {
	ID           string `json:"id"`
	ParentID     string `json:"parentId"`
	Description  string `json:"description"`
	Type         string `json:"type,omitempty"`
	Status       string `json:"status,omitempty"`
	StartValue   int    `json:"startValue,omitempty"`
	CurrentValue int    `json:"currentValue,omitempty"`
	TargetValue  int    `json:"targetValue,omitempty"`
}

// Objective represents a medium-term goal in the Manager layer's public interface.
type Objective struct {
	ID            string              `json:"id"`
	ParentID      string              `json:"parentId"`
	Title         string              `json:"title"`
	Status        string              `json:"status,omitempty"`
	Tags          []string            `json:"tags,omitempty"`
	ClosingStatus string              `json:"closingStatus,omitempty"`
	ClosingNotes  string              `json:"closingNotes,omitempty"`
	ClosedAt      utilities.Timestamp `json:"closedAt,omitempty"`
	KeyResults    []KeyResult         `json:"keyResults"`
	Objectives    []Objective         `json:"objectives,omitempty"`
}

// RepeatPattern defines a recurrence schedule for a routine in the Manager layer.
type RepeatPattern struct {
	Frequency  string                 `json:"frequency"`
	Interval   int                    `json:"interval"`
	Weekdays   []int                  `json:"weekdays,omitempty"`
	DayOfMonth int                    `json:"dayOfMonth,omitempty"`
	StartDate  utilities.CalendarDate `json:"startDate"`
}

// ScheduleException represents a single date override in a routine's schedule in the Manager layer.
type ScheduleException struct {
	OriginalDate utilities.CalendarDate `json:"originalDate"`
	NewDate      utilities.CalendarDate `json:"newDate"`
}

// Routine represents an ongoing activity tracked per occurrence in the Manager layer's public interface.
// Periodic routines have a RepeatPattern; sporadic routines have none.
type Routine struct {
	ID            string              `json:"id"`
	Description   string              `json:"description"`
	RepeatPattern *RepeatPattern      `json:"repeatPattern,omitempty"`
	Exceptions    []ScheduleException `json:"exceptions,omitempty"`
}

// LifeTheme represents a life focus area in the Manager layer's public interface.
type LifeTheme struct {
	ID         string      `json:"id"`
	Name       string      `json:"name"`
	Color      string      `json:"color"`
	Objectives []Objective `json:"objectives"`
}

// DayFocus represents a daily focus entry in the Manager layer's public interface.
type DayFocus struct {
	Date          utilities.CalendarDate `json:"date"`
	ThemeIDs      []string               `json:"themeIds,omitempty"`
	Notes         string                 `json:"notes"`
	Text          string                 `json:"text"`
	OkrIDs        []string               `json:"okrIds,omitempty"`
	Tags          []string               `json:"tags,omitempty"`
	RoutineChecks []string               `json:"routineChecks,omitempty"`
}

// SectionDefinition defines a priority section within a column.
type SectionDefinition struct {
	Name  string `json:"name"`
	Title string `json:"title"`
	Color string `json:"color"`
}

// ColumnDefinition defines a single column's structure.
type ColumnDefinition struct {
	Name     string              `json:"name"`
	Title    string              `json:"title"`
	Type     string              `json:"type"`
	Sections []SectionDefinition `json:"sections,omitempty"`
}

// BoardConfiguration defines the board structure and column layout.
type BoardConfiguration struct {
	Name              string             `json:"name"`
	ColumnDefinitions []ColumnDefinition `json:"columnDefinitions"`
}

// PersonalVision stores the user's personal mission and vision statements.
type PersonalVision struct {
	Mission   string              `json:"mission"`
	Vision    string              `json:"vision"`
	UpdatedAt utilities.Timestamp `json:"updatedAt,omitempty"`
}

// RoutineOccurrence represents a routine due on a specific date.
//
// MissedCount is only meaningful for "overdue" entries: it contains the total
// number of missed occurrences absorbed into this single collapsed entry. The
// field is omitted from JSON when zero so non-overdue entries round-trip cleanly.
type RoutineOccurrence struct {
	RoutineID   string `json:"routineId"`
	Description string `json:"description"`
	Date        string `json:"date"`
	Status      string `json:"status"` // "scheduled", "overdue", "sporadic"
	Checked     bool   `json:"checked"`
	MissedCount int    `json:"missedCount,omitempty"`
}

// RoutinePeriodProgress represents period-based completion for a routine.
type RoutinePeriodProgress struct {
	RoutineID string `json:"routineId"`
	Completed int    `json:"completed"`
	Expected  int    `json:"expected"`
	Period    string `json:"period"`
	OnTrack   bool   `json:"onTrack"`
}

// RoutineTaskInfo carries the metadata needed to create a task for a checked routine.
type RoutineTaskInfo struct {
	RoutineID   string `json:"routineId"`
	Description string `json:"description"`
	IsOverdue   bool   `json:"isOverdue"`
}

// GoalType identifies the kind of goal node in the OKR hierarchy.
type GoalType string

const (
	GoalTypeTheme     GoalType = "theme"
	GoalTypeObjective GoalType = "objective"
	GoalTypeKeyResult GoalType = "key-result"
	GoalTypeRoutine   GoalType = "routine"
)

// EstablishRequest carries the fields needed to create any goal node.
type EstablishRequest struct {
	ParentID      string         `json:"parentId"`
	GoalType      GoalType       `json:"goalType"`
	Name          string         `json:"name,omitempty"`
	Color         string         `json:"color,omitempty"`
	Title         string         `json:"title,omitempty"`
	Description   string         `json:"description,omitempty"`
	StartValue    *int           `json:"startValue,omitempty"`
	TargetValue   *int           `json:"targetValue,omitempty"`
	RepeatPattern *RepeatPattern `json:"repeatPattern,omitempty"`
}

// EstablishResult contains the created goal node.
type EstablishResult struct {
	Theme     *LifeTheme `json:"theme,omitempty"`
	Objective *Objective `json:"objective,omitempty"`
	KeyResult *KeyResult `json:"keyResult,omitempty"`
	Routine   *Routine   `json:"routine,omitempty"`
}

// ReviseRequest carries partial updates for an existing goal node.
// Pointer fields: nil = leave unchanged, non-nil = update to this value.
type ReviseRequest struct {
	GoalID        string         `json:"goalId"`
	Name          *string        `json:"name,omitempty"`
	Color         *string        `json:"color,omitempty"`
	Title         *string        `json:"title,omitempty"`
	Tags          *[]string      `json:"tags,omitempty"`
	Description   *string        `json:"description,omitempty"`
	StartValue    *int           `json:"startValue,omitempty"`
	TargetValue   *int           `json:"targetValue,omitempty"`
	RepeatPattern *RepeatPattern `json:"repeatPattern,omitempty"`
	ClearRepeat   bool           `json:"clearRepeat,omitempty"`
}

// detectGoalType determines the goal type from its ID naming convention.
// Theme IDs are uppercase abbreviations (no hyphens with O/KR suffix).
// Objectives: {themeId}-O{n}, Key Results: {themeId}-KR{n}, Routines: R{n}
func detectGoalType(id string) GoalType {
	if strings.Contains(id, "-KR") {
		return GoalTypeKeyResult
	}
	if strings.Contains(id, "-O") {
		return GoalTypeObjective
	}
	// Routine IDs: R{n} (new format) or {themeId}-R{n} (legacy format)
	if strings.HasPrefix(id, "R") {
		rest := id[1:]
		if _, err := strconv.Atoi(rest); err == nil {
			return GoalTypeRoutine
		}
	}
	if strings.Contains(id, "-R") {
		return GoalTypeRoutine
	}
	return GoalTypeTheme
}

// defaultAccessBoardConfiguration returns the default board configuration
// using access-layer types for internal use within the Manager.
func defaultAccessBoardConfiguration() *access.BoardConfiguration {
	return &access.BoardConfiguration{
		Name: "Bearing Board",
		ColumnDefinitions: []access.ColumnDefinition{
			{
				Name:  "todo",
				Title: "TODO",
				Type:  access.ColumnTypeTodo,
				Sections: []access.SectionDefinition{
					{Name: "important-urgent", Title: "Important & Urgent", Color: "#ef4444"},
					{Name: "not-important-urgent", Title: "Not Important & Urgent", Color: "#f59e0b"},
					{Name: "important-not-urgent", Title: "Important & Not Urgent", Color: "#3b82f6"},
				},
			},
			{
				Name:  "doing",
				Title: "DOING",
				Type:  access.ColumnTypeDoing,
			},
			{
				Name:  "done",
				Title: "DONE",
				Type:  access.ColumnTypeDone,
			},
		},
	}
}

// PlanningManager implements IPlanningManager with business logic.
type PlanningManager struct {
	themeAccess    access.IThemeAccess
	taskAccess     access.ITaskAccess
	calendarAccess access.ICalendarAccess
	routineAccess  access.IRoutineAccess
	visionAccess   access.IVisionAccess
	uiStateAccess  access.IUIStateAccess
	ruleEngine     rule_engine.IRuleEngine
	progressEngine progress_engine.IProgressEngine
	scheduleEngine schedule_engine.IScheduleEngine
	taskOrderMu    sync.Mutex
}

// getAccessBoardConfig returns the access-layer board configuration,
// falling back to the default if none is stored.
func (m *PlanningManager) getAccessBoardConfig() (*access.BoardConfiguration, error) {
	config, err := m.taskAccess.GetBoardConfiguration()
	if err != nil {
		return nil, err
	}
	if config == nil {
		return defaultAccessBoardConfiguration(), nil
	}
	return config, nil
}

// NewPlanningManager creates a new PlanningManager instance.
func NewPlanningManager(
	themeAccess access.IThemeAccess,
	taskAccess access.ITaskAccess,
	calendarAccess access.ICalendarAccess,
	routineAccess access.IRoutineAccess,
	visionAccess access.IVisionAccess,
	uiStateAccess access.IUIStateAccess,
) (*PlanningManager, error) {
	if themeAccess == nil {
		return nil, fmt.Errorf("themeAccess cannot be nil")
	}
	if taskAccess == nil {
		return nil, fmt.Errorf("taskAccess cannot be nil")
	}
	if calendarAccess == nil {
		return nil, fmt.Errorf("calendarAccess cannot be nil")
	}
	if routineAccess == nil {
		return nil, fmt.Errorf("routineAccess cannot be nil")
	}
	if visionAccess == nil {
		return nil, fmt.Errorf("visionAccess cannot be nil")
	}
	if uiStateAccess == nil {
		return nil, fmt.Errorf("uiStateAccess cannot be nil")
	}

	engine := rule_engine.NewRuleEngine(rule_engine.DefaultRules())
	progressEng := progress_engine.NewProgressEngine()
	scheduleEng := schedule_engine.NewScheduleEngine()

	pm := &PlanningManager{
		themeAccess:    themeAccess,
		taskAccess:     taskAccess,
		calendarAccess: calendarAccess,
		routineAccess:  routineAccess,
		visionAccess:   visionAccess,
		uiStateAccess:  uiStateAccess,
		ruleEngine:     engine,
		progressEngine: progressEng,
		scheduleEngine: scheduleEng,
	}

	pm.validateTaskOrder()

	return pm, nil
}

// getThemes returns all life themes.
func (m *PlanningManager) getThemes() ([]LifeTheme, error) {
	themes, err := m.themeAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}
	result := make([]LifeTheme, len(themes))
	for i, t := range themes {
		result[i] = toManagerLifeTheme(t)
	}
	return result, nil
}

// deleteTheme deletes a life theme by ID.
func (m *PlanningManager) deleteTheme(id string) error {
	if id == "" {
		return fmt.Errorf("id cannot be empty")
	}
	if err := m.themeAccess.DeleteTheme(id); err != nil {
		return fmt.Errorf("%w", err)
	}
	return nil
}

// createTheme creates a new life theme with the given name and color.
// Returns the created theme with its generated ID.
func (m *PlanningManager) createTheme(name, color string) (*LifeTheme, error) {
	if name == "" {
		return nil, fmt.Errorf("name cannot be empty")
	}
	if color == "" {
		return nil, fmt.Errorf("color cannot be empty")
	}

	// Get existing themes to generate unique abbreviation
	existingThemes, err := m.themeAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	theme := access.LifeTheme{
		ID:         SuggestAbbreviation(name, existingThemes),
		Name:       name,
		Color:      color,
		Objectives: []access.Objective{},
	}

	if err := m.themeAccess.SaveTheme(theme); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Retrieve the saved theme to get the generated ID
	themes, err := m.themeAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve created theme: %w", err)
	}

	// Find the theme we just created (the one with matching name and color)
	for i := range themes {
		if themes[i].Name == name && themes[i].Color == color {
			result := toManagerLifeTheme(themes[i])
			return &result, nil
		}
	}

	return nil, fmt.Errorf("theme was created but could not be retrieved")
}

// findObjectiveByID walks the access.Objective tree and returns a pointer to the objective with the given ID.
// Returns nil if not found.
func findObjectiveByID(objectives []access.Objective, id string) *access.Objective {
	for i := range objectives {
		if objectives[i].ID == id {
			return &objectives[i]
		}
		if found := findObjectiveByID(objectives[i].Objectives, id); found != nil {
			return found
		}
	}
	return nil
}

// findObjectiveParent walks the access.Objective tree and returns the parent's Objectives slice and the index
// of the objective with the given ID within that slice. Returns nil, -1 if not found.
func findObjectiveParent(objectives *[]access.Objective, id string) (*[]access.Objective, int) {
	for i := range *objectives {
		if (*objectives)[i].ID == id {
			return objectives, i
		}
		if parentSlice, idx := findObjectiveParent(&(*objectives)[i].Objectives, id); parentSlice != nil {
			return parentSlice, idx
		}
	}
	return nil, -1
}

// findKeyResultParent walks the access.Objective tree and returns a pointer to the objective
// containing the key result with the given ID, and the index of the key result.
// Returns nil, -1 if not found.
func findKeyResultParent(objectives []access.Objective, krID string) (*access.Objective, int) {
	for i := range objectives {
		for j := range objectives[i].KeyResults {
			if objectives[i].KeyResults[j].ID == krID {
				return &objectives[i], j
			}
		}
		if obj, idx := findKeyResultParent(objectives[i].Objectives, krID); obj != nil {
			return obj, idx
		}
	}
	return nil, -1
}

// createObjective creates a new objective under a parent (theme or objective).
// parentId can be a theme ID or any objective ID at any depth.
// Returns the created objective with its generated ID.
func (m *PlanningManager) createObjective(parentId, title string) (*Objective, error) {
	if parentId == "" {
		return nil, fmt.Errorf("parentId cannot be empty")
	}
	if title == "" {
		return nil, fmt.Errorf("title cannot be empty")
	}

	themes, err := m.themeAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	newObjective := access.Objective{
		Title:      title,
		KeyResults: []access.KeyResult{},
	}

	// Try to find parentId as a theme ID first
	var targetTheme *access.LifeTheme
	for i := range themes {
		if themes[i].ID == parentId {
			targetTheme = &themes[i]
			targetTheme.Objectives = append(targetTheme.Objectives, newObjective)
			break
		}
	}

	// If not a theme, search for parentId as an objective ID
	if targetTheme == nil {
		for i := range themes {
			if parentObj := findObjectiveByID(themes[i].Objectives, parentId); parentObj != nil {
				targetTheme = &themes[i]
				parentObj.Objectives = append(parentObj.Objectives, newObjective)
				break
			}
		}
	}

	if targetTheme == nil {
		return nil, fmt.Errorf("parent with ID %s not found", parentId)
	}

	if err := m.themeAccess.SaveTheme(*targetTheme); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Retrieve updated theme to get the generated objective ID
	themes, err = m.themeAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve updated theme: %w", err)
	}

	// Find the newly created objective (last child of the parent)
	for _, theme := range themes {
		if theme.ID == targetTheme.ID {
			// If parent was the theme itself
			if theme.ID == parentId {
				if len(theme.Objectives) > 0 {
					result := toManagerObjective(theme.Objectives[len(theme.Objectives)-1])
					return &result, nil
				}
			}
			// If parent was an objective
			if parentObj := findObjectiveByID(theme.Objectives, parentId); parentObj != nil {
				if len(parentObj.Objectives) > 0 {
					result := toManagerObjective(parentObj.Objectives[len(parentObj.Objectives)-1])
					return &result, nil
				}
			}
		}
	}

	return nil, fmt.Errorf("objective was created but could not be retrieved")
}

// validateTags trims whitespace, filters empty strings, and deduplicates case-insensitively
// (preserving the first occurrence's casing).
func validateTags(tags []string) []string {
	var result []string
	seen := make(map[string]bool)
	for _, tag := range tags {
		trimmed := strings.TrimSpace(tag)
		if trimmed == "" {
			continue
		}
		lower := strings.ToLower(trimmed)
		if seen[lower] {
			continue
		}
		seen[lower] = true
		result = append(result, trimmed)
	}
	return result
}

// deleteObjective finds an objective by ID anywhere in the tree and removes it.
// Children are removed automatically since they are nested in the struct.
func (m *PlanningManager) deleteObjective(objectiveId string) error {
	if objectiveId == "" {
		return fmt.Errorf("objectiveId cannot be empty")
	}

	themes, err := m.themeAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	for i := range themes {
		if parentSlice, idx := findObjectiveParent(&themes[i].Objectives, objectiveId); parentSlice != nil {
			*parentSlice = append((*parentSlice)[:idx], (*parentSlice)[idx+1:]...)
			if err := m.themeAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("%w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("objective with ID %s not found", objectiveId)
}

// createKeyResult creates a new key result under an objective found anywhere in the tree.
// parentObjectiveId is the objective ID at any depth.
func (m *PlanningManager) createKeyResult(parentObjectiveId, description string, startValue, targetValue int) (*KeyResult, error) {
	if parentObjectiveId == "" {
		return nil, fmt.Errorf("parentObjectiveId cannot be empty")
	}
	if description == "" {
		return nil, fmt.Errorf("description cannot be empty")
	}
	if startValue > targetValue {
		return nil, fmt.Errorf("startValue (%d) cannot exceed targetValue (%d)", startValue, targetValue)
	}

	themes, err := m.themeAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	var targetTheme *access.LifeTheme
	for i := range themes {
		if obj := findObjectiveByID(themes[i].Objectives, parentObjectiveId); obj != nil {
			targetTheme = &themes[i]
			obj.KeyResults = append(obj.KeyResults, access.KeyResult{Description: description, StartValue: startValue, TargetValue: targetValue})
			break
		}
	}

	if targetTheme == nil {
		return nil, fmt.Errorf("objective with ID %s not found", parentObjectiveId)
	}

	if err := m.themeAccess.SaveTheme(*targetTheme); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Retrieve updated theme to get the generated key result ID
	themes, err = m.themeAccess.GetThemes()
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve updated theme: %w", err)
	}

	for _, theme := range themes {
		if theme.ID == targetTheme.ID {
			if obj := findObjectiveByID(theme.Objectives, parentObjectiveId); obj != nil {
				if len(obj.KeyResults) > 0 {
					result := toManagerKeyResult(obj.KeyResults[len(obj.KeyResults)-1])
					return &result, nil
				}
			}
		}
	}

	return nil, fmt.Errorf("key result was created but could not be retrieved")
}

// updateKeyResultProgress finds a key result by ID anywhere in the tree and updates its currentValue.
func (m *PlanningManager) updateKeyResultProgress(keyResultId string, currentValue int) error {
	if keyResultId == "" {
		return fmt.Errorf("keyResultId cannot be empty")
	}

	themes, err := m.themeAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	for i := range themes {
		if obj, krIdx := findKeyResultParent(themes[i].Objectives, keyResultId); obj != nil {
			obj.KeyResults[krIdx].CurrentValue = currentValue
			if err := m.themeAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("%w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("key result with ID %s not found", keyResultId)
}

// deleteKeyResult finds a key result by ID anywhere in the tree and removes it.
func (m *PlanningManager) deleteKeyResult(keyResultId string) error {
	if keyResultId == "" {
		return fmt.Errorf("keyResultId cannot be empty")
	}

	themes, err := m.themeAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	for i := range themes {
		if obj, krIdx := findKeyResultParent(themes[i].Objectives, keyResultId); obj != nil {
			obj.KeyResults = append(obj.KeyResults[:krIdx], obj.KeyResults[krIdx+1:]...)
			if err := m.themeAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("%w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("key result with ID %s not found", keyResultId)
}

// addRoutine creates a new routine via RoutineAccess.
func (m *PlanningManager) addRoutine(description string, repeatPattern *RepeatPattern) (*Routine, error) {
	if strings.TrimSpace(description) == "" {
		return nil, fmt.Errorf("description cannot be empty")
	}

	routines, err := m.routineAccess.GetRoutines()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	routine := access.Routine{
		ID:            access.NextRoutineID(routines),
		Description:   strings.TrimSpace(description),
		RepeatPattern: toAccessRepeatPattern(repeatPattern),
	}

	if err := m.routineAccess.SaveRoutine(routine); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	result := toManagerRoutine(routine)
	return &result, nil
}

// deleteRoutine removes a routine by ID via RoutineAccess.
func (m *PlanningManager) deleteRoutine(routineId string) error {
	if routineId == "" {
		return fmt.Errorf("routineId cannot be empty")
	}

	if err := m.routineAccess.DeleteRoutine(routineId); err != nil {
		return fmt.Errorf("%w", err)
	}
	return nil
}

// validateOKRStatusTransition checks whether a status transition is allowed.
// Returns an error if the transition is invalid.
func validateOKRStatusTransition(currentStatus, newStatus string) error {
	current := EffectiveOKRStatus(currentStatus)
	if !IsValidOKRStatus(newStatus) {
		return fmt.Errorf("invalid status %q", newStatus)
	}
	target := EffectiveOKRStatus(newStatus)

	if current == target {
		return nil // No-op
	}

	switch {
	case current == string(access.OKRStatusActive) && target == string(access.OKRStatusCompleted):
		return nil
	case current == string(access.OKRStatusCompleted) && target == string(access.OKRStatusArchived):
		return nil
	case target == string(access.OKRStatusActive): // Reopen from any non-active state
		return nil
	case current == string(access.OKRStatusActive) && target == string(access.OKRStatusArchived):
		return fmt.Errorf("cannot archive an active item; complete it first")
	default:
		return fmt.Errorf("invalid transition from %q to %q", current, target)
	}
}

// SetObjectiveStatus sets the lifecycle status of an objective.
// Completing an objective requires all direct children to be completed or archived.
func (m *PlanningManager) SetObjectiveStatus(objectiveId, status string) error {
	if objectiveId == "" {
		return fmt.Errorf("objectiveId cannot be empty")
	}
	if status == "" {
		return fmt.Errorf("status cannot be empty")
	}

	themes, err := m.themeAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	for i := range themes {
		if obj := findObjectiveByID(themes[i].Objectives, objectiveId); obj != nil {
			if err := validateOKRStatusTransition(obj.Status, status); err != nil {
				return fmt.Errorf("%w", err)
			}

			// If completing, verify all direct children are completed or archived
			if EffectiveOKRStatus(status) == string(access.OKRStatusCompleted) {
				var incompleteItems []string
				for _, child := range obj.Objectives {
					if EffectiveOKRStatus(child.Status) == string(access.OKRStatusActive) {
						incompleteItems = append(incompleteItems, child.ID+" ("+child.Title+")")
					}
				}
				for _, kr := range obj.KeyResults {
					if EffectiveOKRStatus(kr.Status) == string(access.OKRStatusActive) {
						incompleteItems = append(incompleteItems, kr.ID+" ("+kr.Description+")")
					}
				}
				if len(incompleteItems) > 0 {
					return fmt.Errorf("cannot complete: it still has active items — complete them first")
				}
			}

			obj.Status = status
			if err := m.themeAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("%w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("objective with ID %s not found", objectiveId)
}

// SetKeyResultStatus sets the lifecycle status of a key result.
func (m *PlanningManager) SetKeyResultStatus(keyResultId, status string) error {
	if keyResultId == "" {
		return fmt.Errorf("keyResultId cannot be empty")
	}
	if status == "" {
		return fmt.Errorf("status cannot be empty")
	}

	themes, err := m.themeAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	for i := range themes {
		if obj, krIdx := findKeyResultParent(themes[i].Objectives, keyResultId); obj != nil {
			kr := &obj.KeyResults[krIdx]
			if err := validateOKRStatusTransition(kr.Status, status); err != nil {
				return fmt.Errorf("%w", err)
			}

			kr.Status = status
			if err := m.themeAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("%w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("key result with ID %s not found", keyResultId)
}

// CloseObjective performs a structured close of an objective with a closing status and optional notes.
// Unlike SetObjectiveStatus, this method actively closes all active child KRs as part of the operation.
func (m *PlanningManager) CloseObjective(objectiveId, closingStatus, closingNotes string) error {
	if objectiveId == "" {
		return fmt.Errorf("objectiveId cannot be empty")
	}
	if !IsValidClosingStatus(closingStatus) {
		return fmt.Errorf("invalid closing status %q", closingStatus)
	}

	themes, err := m.themeAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	for i := range themes {
		if obj := findObjectiveByID(themes[i].Objectives, objectiveId); obj != nil {
			// Must be active to close
			if EffectiveOKRStatus(obj.Status) != string(access.OKRStatusActive) {
				return fmt.Errorf("cannot close: objective is not active (current status: %s)", EffectiveOKRStatus(obj.Status))
			}

			obj.Status = string(access.OKRStatusCompleted)
			obj.ClosingStatus = closingStatus
			obj.ClosingNotes = closingNotes
			obj.ClosedAt = utilities.Now()

			// Close all active direct child KRs
			for j := range obj.KeyResults {
				if EffectiveOKRStatus(obj.KeyResults[j].Status) == string(access.OKRStatusActive) {
					obj.KeyResults[j].Status = string(access.OKRStatusCompleted)
				}
			}

			if err := m.themeAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("%w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("objective with ID %s not found", objectiveId)
}

// ReopenObjective reopens a closed/completed objective, clearing all closing metadata.
// Also reopens all direct child KRs that were completed.
func (m *PlanningManager) ReopenObjective(objectiveId string) error {
	if objectiveId == "" {
		return fmt.Errorf("objectiveId cannot be empty")
	}

	themes, err := m.themeAccess.GetThemes()
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	for i := range themes {
		if obj := findObjectiveByID(themes[i].Objectives, objectiveId); obj != nil {
			// Must be completed to reopen
			if EffectiveOKRStatus(obj.Status) != string(access.OKRStatusCompleted) {
				return fmt.Errorf("cannot reopen: objective is not completed (current status: %s)", EffectiveOKRStatus(obj.Status))
			}

			obj.Status = ""
			obj.ClosingStatus = ""
			obj.ClosingNotes = ""
			obj.ClosedAt = ""

			// Reopen all completed direct child KRs
			for j := range obj.KeyResults {
				if obj.KeyResults[j].Status == string(access.OKRStatusCompleted) {
					obj.KeyResults[j].Status = ""
				}
			}

			if err := m.themeAccess.SaveTheme(themes[i]); err != nil {
				return fmt.Errorf("%w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("objective with ID %s not found", objectiveId)
}

// GetYearFocus returns all day focus entries for a specific year.
func (m *PlanningManager) GetYearFocus(year int) ([]DayFocus, error) {
	if year < 1900 || year > 9999 {
		return nil, fmt.Errorf("invalid year %d", year)
	}
	entries, err := m.calendarAccess.GetYearFocus(year)
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}
	result := make([]DayFocus, len(entries))
	for i, e := range entries {
		result[i] = toManagerDayFocus(e)
	}
	return result, nil
}

// SaveDayFocus saves or updates a day focus entry.
func (m *PlanningManager) SaveDayFocus(day DayFocus) error {
	if day.Date.IsZero() {
		return fmt.Errorf("date cannot be empty")
	}
	if err := m.calendarAccess.SaveDayFocus(toAccessDayFocus(day)); err != nil {
		return fmt.Errorf("%w", err)
	}
	return nil
}

// SaveDayFocusWithRoutines saves a day focus entry and creates or deletes
// routine tasks based on which routines were checked or unchecked.
//
// It diffs day.RoutineChecks against previousChecks to determine:
//   - newly checked routines: create a task (idempotent — skips if tag already exists)
//   - newly unchecked routines: delete the task if still in todo/doing
//
// It also auto-manages the "Routine" day tag based on whether any routines are checked.
func (m *PlanningManager) SaveDayFocusWithRoutines(day DayFocus, routineInfos []RoutineTaskInfo, previousChecks []string) error {
	if day.Date.IsZero() {
		return fmt.Errorf("date cannot be empty")
	}

	// Build lookup maps
	currentSet := make(map[string]bool, len(day.RoutineChecks))
	for _, id := range day.RoutineChecks {
		currentSet[id] = true
	}
	previousSet := make(map[string]bool, len(previousChecks))
	for _, id := range previousChecks {
		previousSet[id] = true
	}
	infoByID := make(map[string]RoutineTaskInfo, len(routineInfos))
	for _, info := range routineInfos {
		infoByID[info.RoutineID] = info
	}

	// Determine newly checked and newly unchecked routines
	var newlyChecked []string
	for _, id := range day.RoutineChecks {
		if !previousSet[id] {
			newlyChecked = append(newlyChecked, id)
		}
	}
	var newlyUnchecked []string
	for _, id := range previousChecks {
		if !currentSet[id] {
			newlyUnchecked = append(newlyUnchecked, id)
		}
	}

	// Process newly checked routines — create tasks
	for _, routineID := range newlyChecked {
		ref := fmt.Sprintf("routine:%s:%s", routineID, day.Date)

		// Idempotency check: skip if a Routine-tagged task with this description already exists
		existing, err := m.taskAccess.FindTasksByTag("Routine")
		if err != nil {
			return fmt.Errorf("SaveDayFocusWithRoutines: failed to find tasks by tag: %w", err)
		}
		found := false
		for _, t := range existing {
			if t.Task.Description == ref {
				found = true
				break
			}
		}
		if found {
			slog.Debug("SaveDayFocusWithRoutines: task already exists for routine", "routineId", routineID, "date", day.Date)
			continue
		}

		info, ok := infoByID[routineID]
		if !ok {
			slog.Warn("SaveDayFocusWithRoutines: no info for routine, skipping task creation", "routineId", routineID)
			continue
		}

		priority := string(access.PriorityImportantNotUrgent)
		if info.IsOverdue {
			priority = string(access.PriorityImportantUrgent)
		}

		if _, err := m.CreateTask(info.Description, "", priority, ref, "Routine", ""); err != nil {
			return fmt.Errorf("SaveDayFocusWithRoutines: failed to create task for routine %s: %w", routineID, err)
		}
		slog.Info("SaveDayFocusWithRoutines: created task for routine", "routineId", routineID, "date", day.Date)
	}

	// Process newly unchecked routines — delete tasks if eligible
	for _, routineID := range newlyUnchecked {
		ref := fmt.Sprintf("routine:%s:%s", routineID, day.Date)

		matches, err := m.taskAccess.FindTasksByTag("Routine")
		if err != nil {
			return fmt.Errorf("SaveDayFocusWithRoutines: failed to find tasks by tag: %w", err)
		}

		for _, match := range matches {
			if match.Task.Description != ref {
				continue
			}
			if match.Status == string(access.TaskStatusTodo) || match.Status == string(access.TaskStatusDoing) {
				if err := m.DeleteTask(match.Task.ID); err != nil {
					return fmt.Errorf("SaveDayFocusWithRoutines: failed to delete task %s: %w", match.Task.ID, err)
				}
				slog.Info("SaveDayFocusWithRoutines: deleted task for unchecked routine", "routineId", routineID, "taskId", match.Task.ID)
			}
			// done/archived: leave as-is
		}
	}

	// Auto-manage "Routine" day tag
	hasRoutineTag := false
	routineTagIndex := -1
	for i, t := range day.Tags {
		if t == "Routine" {
			hasRoutineTag = true
			routineTagIndex = i
			break
		}
	}

	if len(day.RoutineChecks) > 0 && !hasRoutineTag {
		day.Tags = append(day.Tags, "Routine")
	} else if len(day.RoutineChecks) == 0 && hasRoutineTag {
		day.Tags = append(day.Tags[:routineTagIndex], day.Tags[routineTagIndex+1:]...)
	}

	// Delegate to existing SaveDayFocus
	if err := m.calendarAccess.SaveDayFocus(toAccessDayFocus(day)); err != nil {
		return fmt.Errorf("SaveDayFocusWithRoutines: %w", err)
	}

	return nil
}

// ClearDayFocus removes a day focus entry by clearing theme IDs.
func (m *PlanningManager) ClearDayFocus(date string) error {
	if date == "" {
		return fmt.Errorf("date cannot be empty")
	}

	// Get the existing entry to check if it exists
	existing, err := m.calendarAccess.GetDayFocus(date)
	if err != nil {
		return fmt.Errorf("%w", err)
	}

	// If there's no existing entry, nothing to clear
	if existing == nil {
		return nil
	}

	// Save with nil theme IDs to clear it
	cleared := access.DayFocus{
		Date:     existing.Date,
		ThemeIDs: nil,
		Notes:    existing.Notes, // Preserve notes
		Text:     existing.Text,  // Preserve text
	}

	if err := m.calendarAccess.SaveDayFocus(cleared); err != nil {
		return fmt.Errorf("%w", err)
	}

	return nil
}

// toColumnInfos converts access-layer column definitions to engine-layer ColumnInfo DTOs.
func toColumnInfos(defs []access.ColumnDefinition) []rule_engine.ColumnInfo {
	cols := make([]rule_engine.ColumnInfo, len(defs))
	for i, d := range defs {
		cols[i] = rule_engine.ColumnInfo{Name: d.Name, Type: string(d.Type)}
	}
	return cols
}

// validateTaskOrder repairs task_order.json so that each task appears in exactly
// the zone that its current (status, priority) dictates.
func (m *PlanningManager) validateTaskOrder() {
	config, err := m.getAccessBoardConfig()
	if err != nil {
		return
	}

	tSlug := m.ruleEngine.TodoSlugFromColumns(toColumnInfos(config.ColumnDefinitions))

	statuses := make([]string, 0, len(config.ColumnDefinitions)+1)
	for _, col := range config.ColumnDefinitions {
		statuses = append(statuses, col.Name)
	}
	statuses = append(statuses, string(access.TaskStatusArchived))

	actualZone := make(map[string]string)
	for _, status := range statuses {
		tasks, err := m.taskAccess.GetTasksByStatus(status)
		if err != nil {
			continue
		}
		for _, t := range tasks {
			actualZone[t.ID] = m.ruleEngine.DropZoneForTask(status, t.Priority, tSlug)
		}
	}

	orderMap, err := m.taskAccess.LoadTaskOrder()
	if err != nil || len(orderMap) == 0 {
		return
	}

	orderMap, changed := m.ruleEngine.ReconcileTaskOrder(orderMap, actualZone)
	if changed {
		slog.Info("validateTaskOrder: repaired task_order.json")
		_ = m.taskAccess.SaveTaskOrder(orderMap)
	}
}

// GetTasks returns all tasks with their status across all themes.
// Tasks are sorted by persisted order from task_order.json within each drop zone.
func (m *PlanningManager) GetTasks() ([]TaskWithStatus, error) {
	allTasks := []TaskWithStatus{}

	config, err := m.getAccessBoardConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to get board config: %w", err)
	}

	// Collect statuses from board config + archived
	statuses := make([]string, 0, len(config.ColumnDefinitions)+1)
	for _, col := range config.ColumnDefinitions {
		statuses = append(statuses, col.Name)
	}
	statuses = append(statuses, string(access.TaskStatusArchived))

	for _, status := range statuses {
		tasks, err := m.taskAccess.GetTasksByStatus(status)
		if err != nil {
			return nil, fmt.Errorf("failed to get tasks for status %s: %w", status, err)
		}

		for _, task := range tasks {
			allTasks = append(allTasks, TaskWithStatus{
				Task:   toManagerTask(task),
				Status: status,
			})
		}
	}

	// Sort tasks by persisted order
	orderMap, err := m.taskAccess.LoadTaskOrder()
	if err != nil {
		return nil, fmt.Errorf("failed to load task order: %w", err)
	}

	// Load archived order for archived task sorting
	archivedOrder, err := m.taskAccess.LoadArchivedOrder()
	if err != nil {
		return nil, fmt.Errorf("failed to load archived order: %w", err)
	}
	archivePosIndex := make(map[string]int, len(archivedOrder))
	for i, id := range archivedOrder {
		archivePosIndex[id] = i
	}

	// Build position index for active tasks: taskID -> position within its drop zone
	posIndex := make(map[string]int)
	for _, ids := range orderMap {
		for i, id := range ids {
			posIndex[id] = i
		}
	}

	archivedStatus := string(access.TaskStatusArchived)
	tSlug := m.ruleEngine.TodoSlugFromColumns(toColumnInfos(config.ColumnDefinitions))
	sort.SliceStable(allTasks, func(i, j int) bool {
		a, b := allTasks[i], allTasks[j]
		zoneA := m.ruleEngine.DropZoneForTask(a.Status, a.Priority, tSlug)
		zoneB := m.ruleEngine.DropZoneForTask(b.Status, b.Priority, tSlug)
		if zoneA != zoneB {
			return zoneA < zoneB // Total order across zones for sort correctness
		}

		// Archived tasks: sort by archived order position
		if a.Status == archivedStatus {
			posA, okA := archivePosIndex[a.ID]
			posB, okB := archivePosIndex[b.ID]
			if okA && okB {
				return posA < posB
			}
			if okA {
				return true // Known position before unknown
			}
			if okB {
				return false
			}
			// Both unknown: sort by CreatedAt descending (newest first)
			return a.CreatedAt.Time().After(b.CreatedAt.Time())
		}

		// Active tasks: sort by task_order.json position
		posA, okA := posIndex[a.ID]
		posB, okB := posIndex[b.ID]
		if okA && okB {
			return posA < posB
		}
		if okA {
			return true // Known tasks before unknown
		}
		if okB {
			return false
		}
		// Both unknown: sort by CreatedAt
		return a.CreatedAt.Time().Before(b.CreatedAt.Time())
	})

	return allTasks, nil
}

// buildTaskInfoList converts all tasks to rule engine TaskInfo for context.
func (m *PlanningManager) buildTaskInfoList() ([]rule_engine.TaskInfo, error) {
	allTasks, err := m.GetTasks()
	if err != nil {
		return nil, err
	}
	infos := make([]rule_engine.TaskInfo, len(allTasks))
	for i, t := range allTasks {
		infos[i] = rule_engine.TaskInfo{
			ID:        t.ID,
			Title:     t.Title,
			Status:    t.Status,
			Priority:  t.Priority,
			CreatedAt: t.CreatedAt.String(),
		}
	}
	return infos, nil
}

// evaluateRules runs the rule engine and returns an error with violation details if not allowed.
func (m *PlanningManager) evaluateRules(event rule_engine.TaskEvent) (*rule_engine.RuleEvaluationResult, error) {
	result, err := m.ruleEngine.EvaluateTaskChange(event)
	if err != nil {
		return nil, err
	}
	if !result.Allowed {
		msgs := make([]string, len(result.Violations))
		for i, v := range result.Violations {
			msgs[i] = v.Message
		}
		return result, fmt.Errorf("rule violation: %s", strings.Join(msgs, "; "))
	}
	return result, nil
}

// CreateTask creates a new task with the given properties.
// Priority must be one of the valid Eisenhower priorities.
// Optional fields: description, tags (comma-separated), promotionDate (YYYY-MM-DD).
func (m *PlanningManager) CreateTask(title, themeId, priority, description, tags, promotionDate string) (*Task, error) {
	if !IsValidPriority(priority) {
		return nil, fmt.Errorf("invalid priority: %s", priority)
	}

	var promDate utilities.CalendarDate
	if promotionDate != "" {
		var err error
		promDate, err = utilities.ParseCalendarDate(promotionDate)
		if err != nil {
			return nil, fmt.Errorf("invalid promotionDate format: %s", promotionDate)
		}
	}

	var tagSlice []string
	if tags != "" {
		for _, tag := range strings.Split(tags, ",") {
			if t := strings.TrimSpace(tag); t != "" {
				tagSlice = append(tagSlice, t)
			}
		}
	}

	task := Task{
		Title:         title,
		ThemeID:       themeId,
		Priority:      priority,
		Description:   description,
		Tags:          tagSlice,
		PromotionDate: promDate,
	}

	// Evaluate rules before creating
	taskInfos, err := m.buildTaskInfoList()
	if err != nil {
		return nil, fmt.Errorf("failed to build task context: %w", err)
	}
	event := rule_engine.TaskEvent{
		Type:     rule_engine.EventTaskCreate,
		Task:     toEngineTaskData(task),
		AllTasks: taskInfos,
	}
	if _, err := m.evaluateRules(event); err != nil {
		return nil, fmt.Errorf("%w", err)
	}

	// Save task and update task order atomically in a single git commit
	createConfig, _ := m.getAccessBoardConfig()
	accessTask := toAccessTask(task)
	zone := m.ruleEngine.DropZoneForTask(string(access.TaskStatusTodo), task.Priority, m.ruleEngine.TodoSlugFromColumns(toColumnInfos(createConfig.ColumnDefinitions)))
	createdTask, err := m.taskAccess.SaveTaskWithOrder(accessTask, zone)
	if err != nil {
		return nil, fmt.Errorf("failed to save task: %w", err)
	}

	result := toManagerTask(*createdTask)
	return &result, nil
}

// MoveTask moves a task to a new status (todo, doing, done) and optionally
// updates its priority atomically with the move.
//
// When positions is non-nil, the provided drop zone ordering is applied
// atomically with the move; when nil, the task is appended to the end of the
// target zone (computed from the post-move priority).
//
// When newPriority is non-empty and differs from the task's current priority,
// the task file's priority is rewritten in the same git commit as the status
// change and the order-map update. Pass "" to leave the priority unchanged —
// callers moving into non-sectioned columns (e.g., Doing, Done) should pass "".
//
// Returns a MoveTaskResult with violation details on rejection.
func (m *PlanningManager) MoveTask(taskId, newStatus, newPriority string, positions map[string][]string) (*MoveTaskResult, error) {
	config, err := m.getAccessBoardConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to get board config: %w", err)
	}
	validStatus := false
	for _, col := range config.ColumnDefinitions {
		if col.Name == newStatus {
			validStatus = true
			break
		}
	}
	if !validStatus {
		return nil, fmt.Errorf("invalid status %s", newStatus)
	}
	if newPriority != "" && !IsValidPriority(newPriority) {
		return nil, fmt.Errorf("invalid priority %s", newPriority)
	}

	// Get all tasks to find the task being moved and build context
	allTasks, err := m.GetTasks()
	if err != nil {
		return nil, fmt.Errorf("failed to get tasks: %w", err)
	}

	// Find the task being moved (prefer active copy over archived when IDs collide)
	var movingTask *Task
	var oldStatus string
	for _, t := range allTasks {
		if t.ID == taskId && t.Status != string(access.TaskStatusArchived) {
			taskCopy := t.Task
			movingTask = &taskCopy
			oldStatus = t.Status
			break
		}
	}
	if movingTask == nil {
		// Fall back to archived if no active copy exists
		for _, t := range allTasks {
			if t.ID == taskId {
				taskCopy := t.Task
				movingTask = &taskCopy
				oldStatus = t.Status
				break
			}
		}
	}
	if movingTask == nil {
		return nil, fmt.Errorf("task %s not found", taskId)
	}

	// Build task info list for rule context
	taskInfos := make([]rule_engine.TaskInfo, len(allTasks))
	for i, t := range allTasks {
		taskInfos[i] = rule_engine.TaskInfo{
			ID:        t.ID,
			Title:     t.Title,
			Status:    t.Status,
			Priority:  t.Priority,
			CreatedAt: t.CreatedAt.String(),
		}
	}

	// Evaluate rules before moving
	event := rule_engine.TaskEvent{
		Type:      rule_engine.EventTaskMove,
		Task:      toEngineTaskData(*movingTask),
		OldStatus: oldStatus,
		NewStatus: newStatus,
		AllTasks:  taskInfos,
	}
	result, evalErr := m.ruleEngine.EvaluateTaskChange(event)
	if evalErr != nil {
		return nil, fmt.Errorf("rule evaluation failed: %w", evalErr)
	}
	if !result.Allowed {
		violations := make([]RuleViolation, len(result.Violations))
		for i, v := range result.Violations {
			violations[i] = RuleViolation{
				RuleID:   v.RuleID,
				Priority: v.Priority,
				Message:  v.Message,
				Category: v.Category,
			}
		}
		return &MoveTaskResult{
			Success:    false,
			Violations: violations,
		}, nil
	}

	// Capture the pre-move priority so the source-zone derivation reflects the
	// task's location before any priority update we may apply below.
	oldPriority := movingTask.Priority

	// Perform the move (write-only, no commit yet)
	if _, err := m.taskAccess.WriteMoveTask(taskId, newStatus); err != nil {
		return nil, fmt.Errorf("failed to move task: %w", err)
	}

	// Apply priority change in the same uncommitted batch as the file move.
	// The task file now lives at the new-status path; WriteTask writes the
	// updated priority to that path. CommitAll below ties everything together.
	if newPriority != "" && newPriority != movingTask.Priority {
		movingTask.Priority = newPriority
		if err := m.taskAccess.WriteTask(toAccessTask(*movingTask)); err != nil {
			return nil, fmt.Errorf("failed to update task priority: %w", err)
		}
	}

	// Update task order: remove from source drop zone, then apply positions or append to target
	moveTodoSlug := m.ruleEngine.TodoSlugFromColumns(toColumnInfos(config.ColumnDefinitions))
	sourceZone := m.ruleEngine.DropZoneForTask(oldStatus, oldPriority, moveTodoSlug)

	m.taskOrderMu.Lock()
	orderMap, err := m.taskAccess.LoadTaskOrder()
	if err != nil {
		m.taskOrderMu.Unlock()
		return nil, fmt.Errorf("failed to load task order: %w", err)
	}
	orderMap[sourceZone] = removeFromSlice(orderMap[sourceZone], taskId)
	if positions != nil {
		for zone, ids := range positions {
			orderMap[zone] = ids
		}
	} else {
		targetZone := m.ruleEngine.DropZoneForTask(newStatus, movingTask.Priority, moveTodoSlug)
		orderMap[targetZone] = append(orderMap[targetZone], taskId)
	}
	if err := m.taskAccess.WriteTaskOrder(orderMap); err != nil {
		m.taskOrderMu.Unlock()
		return nil, fmt.Errorf("failed to write task order: %w", err)
	}
	m.taskOrderMu.Unlock()

	if err := m.taskAccess.CommitAll(fmt.Sprintf("Move task '%s' to %s", movingTask.Title, newStatus)); err != nil {
		return nil, fmt.Errorf("failed to commit move: %w", err)
	}

	return &MoveTaskResult{Success: true, Positions: orderMap}, nil
}

// UpdateTask updates an existing task.
// When the priority change moves a todo task to a different drop zone,
// task_order.json is updated atomically with the task file.
func (m *PlanningManager) UpdateTask(task Task) error {
	if task.ID == "" {
		return fmt.Errorf("task ID cannot be empty")
	}

	// Evaluate rules before updating
	taskInfos, err := m.buildTaskInfoList()
	if err != nil {
		return fmt.Errorf("failed to build task context: %w", err)
	}

	// Find existing task to detect zone changes
	var oldPriority, oldStatus string
	for _, t := range taskInfos {
		if t.ID == task.ID {
			oldPriority = t.Priority
			oldStatus = t.Status
			break
		}
	}

	event := rule_engine.TaskEvent{
		Type:     rule_engine.EventTaskUpdate,
		Task:     toEngineTaskData(task),
		AllTasks: taskInfos,
	}
	if _, err := m.evaluateRules(event); err != nil {
		return fmt.Errorf("%w", err)
	}

	accessTask := toAccessTask(task)

	// Check if priority change causes a zone change (only for todo tasks)
	if oldPriority != "" && oldPriority != task.Priority {
		config, _ := m.getAccessBoardConfig()
		todoSlug := m.ruleEngine.TodoSlugFromColumns(toColumnInfos(config.ColumnDefinitions))
		oldZone := m.ruleEngine.DropZoneForTask(oldStatus, oldPriority, todoSlug)
		newZone := m.ruleEngine.DropZoneForTask(oldStatus, task.Priority, todoSlug)
		if oldZone != newZone {
			m.taskOrderMu.Lock()
			err := m.taskAccess.UpdateTaskWithOrderMove(accessTask, oldZone, newZone)
			m.taskOrderMu.Unlock()
			if err != nil {
				return fmt.Errorf("failed to update task with zone move: %w", err)
			}
			return nil
		}
	}

	if err := m.taskAccess.SaveTask(accessTask); err != nil {
		return fmt.Errorf("failed to update task: %w", err)
	}

	return nil
}

// ProcessPriorityPromotions promotes tasks whose PromotionDate has been reached.
// Tasks with priority "important-not-urgent" are promoted to "important-urgent"
// and their PromotionDate is cleared. The task_order.json is updated atomically
// to move each promoted task from the old zone to the new zone.
func (m *PlanningManager) ProcessPriorityPromotions() ([]PromotedTask, error) {
	allTasks, err := m.GetTasks()
	if err != nil {
		return nil, fmt.Errorf("failed to get tasks: %w", err)
	}

	today := utilities.Today()
	var promoted []PromotedTask
	config, _ := m.getAccessBoardConfig()
	todoSlug := m.ruleEngine.TodoSlugFromColumns(toColumnInfos(config.ColumnDefinitions))

	m.taskOrderMu.Lock()
	orderMap, orderErr := m.taskAccess.LoadTaskOrder()
	if orderErr != nil {
		m.taskOrderMu.Unlock()
		return nil, fmt.Errorf("failed to load task order: %w", orderErr)
	}
	orderChanged := false

	for _, t := range allTasks {
		if t.PromotionDate.IsZero() {
			continue
		}
		if t.Priority != string(access.PriorityImportantNotUrgent) {
			continue
		}
		if t.PromotionDate.Time().After(today.Time()) {
			continue
		}

		// Promote: important-not-urgent -> important-urgent
		updatedTask := t.Task
		oldPriority := updatedTask.Priority
		updatedTask.Priority = string(access.PriorityImportantUrgent)
		updatedTask.PromotionDate = "" // Clear after promotion

		accessTask := toAccessTask(updatedTask)
		if err := m.taskAccess.WriteTask(accessTask); err != nil {
			m.taskOrderMu.Unlock()
			return nil, fmt.Errorf("failed to write promoted task %s: %w", t.ID, err)
		}

		oldZone := m.ruleEngine.DropZoneForTask(t.Status, oldPriority, todoSlug)
		newZone := m.ruleEngine.DropZoneForTask(t.Status, string(access.PriorityImportantUrgent), todoSlug)
		if oldZone != newZone {
			if ids, ok := orderMap[oldZone]; ok {
				filtered := make([]string, 0, len(ids))
				for _, id := range ids {
					if id != t.ID {
						filtered = append(filtered, id)
					}
				}
				orderMap[oldZone] = filtered
			}
			orderMap[newZone] = append(orderMap[newZone], t.ID)
			orderChanged = true
		}

		promoted = append(promoted, PromotedTask{
			ID:          t.ID,
			Title:       t.Title,
			OldPriority: oldPriority,
			NewPriority: string(access.PriorityImportantUrgent),
		})
	}

	if orderChanged {
		if err := m.taskAccess.WriteTaskOrder(orderMap); err != nil {
			m.taskOrderMu.Unlock()
			return nil, fmt.Errorf("failed to write task order: %w", err)
		}
	}
	m.taskOrderMu.Unlock()

	if len(promoted) > 0 {
		if err := m.taskAccess.CommitAll(fmt.Sprintf("Promote %d tasks by priority date", len(promoted))); err != nil {
			return nil, fmt.Errorf("failed to commit promotions: %w", err)
		}
	}

	return promoted, nil
}

// DeleteTask deletes a task by ID.
func (m *PlanningManager) DeleteTask(taskId string) error {
	if taskId == "" {
		return fmt.Errorf("task ID cannot be empty")
	}

	// Delete task and update task order atomically in a single git commit
	if err := m.taskAccess.DeleteTaskWithOrder(taskId); err != nil {
		return fmt.Errorf("failed to delete task: %w", err)
	}

	return nil
}

// ArchiveTask archives a done task.
func (m *PlanningManager) ArchiveTask(taskId string) error {
	if taskId == "" {
		return fmt.Errorf("task ID cannot be empty")
	}

	allTasks, err := m.GetTasks()
	if err != nil {
		return fmt.Errorf("failed to get tasks: %w", err)
	}

	// Find the target task and verify it's done
	var targetTask *TaskWithStatus
	for i := range allTasks {
		if allTasks[i].ID == taskId {
			targetTask = &allTasks[i]
			break
		}
	}
	if targetTask == nil {
		return fmt.Errorf("task %s not found", taskId)
	}
	if targetTask.Status != string(access.TaskStatusDone) {
		return fmt.Errorf("task can only be archived when done")
	}

	if _, err := m.taskAccess.WriteArchiveTask(taskId); err != nil {
		return fmt.Errorf("failed to archive task %s: %w", taskId, err)
	}

	if err := m.removeFromTaskOrder([]string{taskId}); err != nil {
		return fmt.Errorf("%w", err)
	}

	// Prepend to archived order (newest archived first)
	archivedOrder, err := m.taskAccess.LoadArchivedOrder()
	if err != nil {
		return fmt.Errorf("failed to load archived order: %w", err)
	}
	archivedOrder = append([]string{taskId}, archivedOrder...)
	if err := m.taskAccess.WriteArchivedOrder(archivedOrder); err != nil {
		return fmt.Errorf("failed to write archived order: %w", err)
	}

	if err := m.taskAccess.CommitAll(fmt.Sprintf("Archive task: %s", targetTask.Title)); err != nil {
		return fmt.Errorf("failed to commit archive: %w", err)
	}

	return nil
}

// ArchiveAllDoneTasks archives all done tasks.
func (m *PlanningManager) ArchiveAllDoneTasks() error {
	allTasks, err := m.GetTasks()
	if err != nil {
		return fmt.Errorf("failed to get tasks: %w", err)
	}

	// Collect done task IDs in their current display order
	var doneIDs []string
	for _, t := range allTasks {
		if t.Status != string(access.TaskStatusDone) {
			continue
		}
		doneIDs = append(doneIDs, t.ID)
	}
	if len(doneIDs) == 0 {
		return nil
	}

	// Archive each task file (write-only, no commit per file)
	for _, id := range doneIDs {
		if _, err := m.taskAccess.WriteArchiveTask(id); err != nil {
			return fmt.Errorf("failed to archive task %s: %w", id, err)
		}
	}
	if err := m.removeFromTaskOrder(doneIDs); err != nil {
		return fmt.Errorf("%w", err)
	}

	// Batch-prepend to archived order preserving their relative display order
	archivedOrder, err := m.taskAccess.LoadArchivedOrder()
	if err != nil {
		return fmt.Errorf("failed to load archived order: %w", err)
	}
	archivedOrder = append(doneIDs, archivedOrder...)
	if err := m.taskAccess.WriteArchivedOrder(archivedOrder); err != nil {
		return fmt.Errorf("failed to write archived order: %w", err)
	}

	if err := m.taskAccess.CommitAll(fmt.Sprintf("Archive all done tasks (%d tasks)", len(doneIDs))); err != nil {
		return fmt.Errorf("failed to commit archive: %w", err)
	}

	return nil
}

// RestoreTask restores an archived task to done.
func (m *PlanningManager) RestoreTask(taskId string) error {
	if taskId == "" {
		return fmt.Errorf("task ID cannot be empty")
	}

	allTasks, err := m.GetTasks()
	if err != nil {
		return fmt.Errorf("failed to get tasks: %w", err)
	}

	// Find the target task and verify it's archived
	var targetTask *TaskWithStatus
	for i := range allTasks {
		if allTasks[i].ID == taskId {
			targetTask = &allTasks[i]
			break
		}
	}
	if targetTask == nil {
		return fmt.Errorf("task %s not found", taskId)
	}
	if targetTask.Status != string(access.TaskStatusArchived) {
		return fmt.Errorf("task can only be restored from archive")
	}

	if _, err := m.taskAccess.WriteRestoreTask(taskId); err != nil {
		return fmt.Errorf("failed to restore task %s: %w", taskId, err)
	}

	// Add the restored task to the "done" zone in task_order.json
	boardConfig, _ := m.getAccessBoardConfig()
	if boardConfig == nil {
		boardConfig = defaultAccessBoardConfiguration()
	}
	targetZone := m.ruleEngine.DropZoneForTask(string(access.TaskStatusDone), targetTask.Priority, m.ruleEngine.TodoSlugFromColumns(toColumnInfos(boardConfig.ColumnDefinitions)))
	m.taskOrderMu.Lock()
	orderMap, err := m.taskAccess.LoadTaskOrder()
	if err != nil {
		m.taskOrderMu.Unlock()
		return fmt.Errorf("failed to load task order: %w", err)
	}
	orderMap[targetZone] = append(orderMap[targetZone], taskId)
	if err := m.taskAccess.WriteTaskOrder(orderMap); err != nil {
		m.taskOrderMu.Unlock()
		return fmt.Errorf("failed to write task order: %w", err)
	}
	m.taskOrderMu.Unlock()

	// Remove from archived order
	archivedOrder, err := m.taskAccess.LoadArchivedOrder()
	if err != nil {
		return fmt.Errorf("failed to load archived order: %w", err)
	}
	filtered := make([]string, 0, len(archivedOrder))
	for _, id := range archivedOrder {
		if id != taskId {
			filtered = append(filtered, id)
		}
	}
	if len(filtered) != len(archivedOrder) {
		if err := m.taskAccess.WriteArchivedOrder(filtered); err != nil {
			return fmt.Errorf("failed to write archived order: %w", err)
		}
	}

	if err := m.taskAccess.CommitAll(fmt.Sprintf("Restore task: %s", targetTask.Title)); err != nil {
		return fmt.Errorf("failed to commit restore: %w", err)
	}

	return nil
}

// removeFromTaskOrder removes the given task IDs from all drop zones in the task order.
// Uses write-only method; caller is responsible for committing.
func (m *PlanningManager) removeFromTaskOrder(taskIDs []string) error {
	m.taskOrderMu.Lock()
	defer m.taskOrderMu.Unlock()

	orderMap, err := m.taskAccess.LoadTaskOrder()
	if err != nil {
		return fmt.Errorf("failed to load task order: %w", err)
	}

	idSet := make(map[string]bool, len(taskIDs))
	for _, id := range taskIDs {
		idSet[id] = true
	}

	changed := false
	for zone, ids := range orderMap {
		filtered := make([]string, 0, len(ids))
		for _, id := range ids {
			if !idSet[id] {
				filtered = append(filtered, id)
			}
		}
		if len(filtered) != len(ids) {
			orderMap[zone] = filtered
			changed = true
		}
	}

	if changed {
		if err := m.taskAccess.WriteTaskOrder(orderMap); err != nil {
			return fmt.Errorf("failed to write task order: %w", err)
		}
	}

	return nil
}

// ReorderTasks accepts proposed positions for one or more drop zones,
// merges them into the full order map, persists, and returns authoritative positions.
func (m *PlanningManager) ReorderTasks(positions map[string][]string) (*ReorderResult, error) {
	m.taskOrderMu.Lock()
	orderMap, err := m.taskAccess.LoadTaskOrder()
	if err != nil {
		m.taskOrderMu.Unlock()
		return nil, fmt.Errorf("failed to load task order: %w", err)
	}

	// Merge proposed positions into the full order map
	for zone, ids := range positions {
		orderMap[zone] = ids
	}

	if err := m.taskAccess.SaveTaskOrder(orderMap); err != nil {
		m.taskOrderMu.Unlock()
		return nil, fmt.Errorf("failed to save task order: %w", err)
	}
	m.taskOrderMu.Unlock()

	return &ReorderResult{Success: true, Positions: orderMap}, nil
}

// removeFromSlice returns a new slice with the first occurrence of val removed.
func removeFromSlice(s []string, val string) []string {
	result := make([]string, 0, len(s))
	for _, v := range s {
		if v != val {
			result = append(result, v)
		}
	}
	return result
}

// toEngineTaskData converts a Task to a rule_engine.TaskData
// for rule evaluation. The Manager owns this transformation.
func toEngineTaskData(t Task) *rule_engine.TaskData {
	return &rule_engine.TaskData{
		ID:          t.ID,
		Title:       t.Title,
		Description: t.Description,
		Priority:    t.Priority,
		CreatedAt:   t.CreatedAt.String(),
	}
}

// GetBoardConfiguration returns the board configuration.
// Returns the default configuration if none is stored.
func (m *PlanningManager) GetBoardConfiguration() (*BoardConfiguration, error) {
	config, err := m.getAccessBoardConfig()
	if err != nil {
		return nil, fmt.Errorf("%w", err)
	}
	return toManagerBoardConfig(config), nil
}

// SuggestAbbreviation generates a 1-3 letter abbreviation from a theme name,
// ensuring uniqueness among existing themes.
func SuggestAbbreviation(name string, existingThemes []access.LifeTheme) string {
	existing := make(map[string]bool)
	for _, t := range existingThemes {
		existing[t.ID] = true
	}

	words := strings.Fields(name)

	// Multi-word: take first letter of each word (up to 3)
	if len(words) > 1 {
		candidate := ""
		for i, w := range words {
			if i >= 3 {
				break
			}
			candidate += strings.ToUpper(w[:1])
		}
		if !existing[candidate] {
			return candidate
		}
	}

	// Single word or multi-word collision: try first 1, 2, 3 letters of first word
	upper := strings.ToUpper(words[0])
	for length := 1; length <= 3 && length <= len(upper); length++ {
		candidate := upper[:length]
		if !existing[candidate] {
			return candidate
		}
	}

	// Fallback: try 2-letter combinations with second letter varying
	if len(upper) >= 1 {
		first := string(upper[0])
		for c := 'A'; c <= 'Z'; c++ {
			candidate := first + string(c)
			if !existing[candidate] {
				return candidate
			}
		}
	}

	// Last resort: try all 3-letter combinations starting with first letter
	if len(upper) >= 1 {
		first := string(upper[0])
		for c1 := 'A'; c1 <= 'Z'; c1++ {
			for c2 := 'A'; c2 <= 'Z'; c2++ {
				candidate := first + string(c1) + string(c2)
				if !existing[candidate] {
					return candidate
				}
			}
		}
	}

	return "X"
}

// SuggestThemeAbbreviation suggests a unique abbreviation for a theme name.
func (m *PlanningManager) suggestThemeAbbreviation(name string) (string, error) {
	themes, err := m.themeAccess.GetThemes()
	if err != nil {
		return "", fmt.Errorf("%w", err)
	}
	return SuggestAbbreviation(name, themes), nil
}

// --- Behavioral goal methods (expand phase) ---

// GetHierarchy returns the full OKR hierarchy.
func (m *PlanningManager) GetHierarchy() ([]LifeTheme, error) {
	return m.getThemes()
}

// Establish creates a new goal node of the specified type.
func (m *PlanningManager) Establish(req EstablishRequest) (*EstablishResult, error) {
	switch req.GoalType {
	case GoalTypeTheme:
		theme, err := m.createTheme(req.Name, req.Color)
		if err != nil {
			return nil, err
		}
		return &EstablishResult{Theme: theme}, nil

	case GoalTypeObjective:
		obj, err := m.createObjective(req.ParentID, req.Title)
		if err != nil {
			return nil, err
		}
		return &EstablishResult{Objective: obj}, nil

	case GoalTypeKeyResult:
		startVal := 0
		if req.StartValue != nil {
			startVal = *req.StartValue
		}
		targetVal := 0
		if req.TargetValue != nil {
			targetVal = *req.TargetValue
		}
		kr, err := m.createKeyResult(req.ParentID, req.Description, startVal, targetVal)
		if err != nil {
			return nil, err
		}
		return &EstablishResult{KeyResult: kr}, nil

	case GoalTypeRoutine:
		routine, err := m.addRoutine(req.Description, req.RepeatPattern)
		if err != nil {
			return nil, err
		}
		return &EstablishResult{Routine: routine}, nil

	default:
		return nil, fmt.Errorf("unknown goal type: %s", req.GoalType)
	}
}

// Revise applies partial updates to an existing goal node.
func (m *PlanningManager) Revise(req ReviseRequest) error {
	if req.GoalID == "" {
		return fmt.Errorf("goalId cannot be empty")
	}

	goalType := detectGoalType(req.GoalID)

	switch goalType {
	case GoalTypeTheme:
		themes, err := m.themeAccess.GetThemes()
		if err != nil {
			return fmt.Errorf("%w", err)
		}
		for i := range themes {
			if themes[i].ID == req.GoalID {
				if req.Name != nil {
					themes[i].Name = *req.Name
				}
				if req.Color != nil {
					themes[i].Color = *req.Color
				}
				if err := m.themeAccess.SaveTheme(themes[i]); err != nil {
					return fmt.Errorf("%w", err)
				}
				return nil
			}
		}
		return fmt.Errorf("theme with ID %s not found", req.GoalID)

	case GoalTypeObjective:
		themes, err := m.themeAccess.GetThemes()
		if err != nil {
			return fmt.Errorf("%w", err)
		}
		for i := range themes {
			if obj := findObjectiveByID(themes[i].Objectives, req.GoalID); obj != nil {
				if req.Title != nil {
					obj.Title = *req.Title
				}
				if req.Tags != nil {
					obj.Tags = validateTags(*req.Tags)
				}
				if err := m.themeAccess.SaveTheme(themes[i]); err != nil {
					return fmt.Errorf("%w", err)
				}
				return nil
			}
		}
		return fmt.Errorf("objective with ID %s not found", req.GoalID)

	case GoalTypeKeyResult:
		themes, err := m.themeAccess.GetThemes()
		if err != nil {
			return fmt.Errorf("%w", err)
		}
		for i := range themes {
			if obj, krIdx := findKeyResultParent(themes[i].Objectives, req.GoalID); obj != nil {
				if req.Description != nil {
					obj.KeyResults[krIdx].Description = *req.Description
				}
				if req.StartValue != nil {
					obj.KeyResults[krIdx].StartValue = *req.StartValue
				}
				if req.TargetValue != nil {
					obj.KeyResults[krIdx].TargetValue = *req.TargetValue
				}
				if err := m.themeAccess.SaveTheme(themes[i]); err != nil {
					return fmt.Errorf("%w", err)
				}
				return nil
			}
		}
		return fmt.Errorf("key result with ID %s not found", req.GoalID)

	case GoalTypeRoutine:
		routines, err := m.routineAccess.GetRoutines()
		if err != nil {
			return fmt.Errorf("%w", err)
		}
		var routine *access.Routine
		for i := range routines {
			if routines[i].ID == req.GoalID {
				routine = &routines[i]
				break
			}
		}
		if routine == nil {
			return fmt.Errorf("routine with ID %s not found", req.GoalID)
		}
		if req.Description != nil {
			routine.Description = strings.TrimSpace(*req.Description)
		}
		if req.ClearRepeat {
			routine.RepeatPattern = nil
		} else if req.RepeatPattern != nil {
			routine.RepeatPattern = toAccessRepeatPattern(req.RepeatPattern)
		}
		if err := m.routineAccess.SaveRoutine(*routine); err != nil {
			return fmt.Errorf("%w", err)
		}
		return nil

	default:
		return fmt.Errorf("unknown goal type for ID %s", req.GoalID)
	}
}

// RecordProgress updates the current value of a measurable goal.
// Routines no longer carry a numeric currentValue — their progress is computed
// from RepeatPattern + routineChecks via ScheduleEngine.
func (m *PlanningManager) RecordProgress(goalId string, value int) error {
	if goalId == "" {
		return fmt.Errorf("goalId cannot be empty")
	}

	goalType := detectGoalType(goalId)

	switch goalType {
	case GoalTypeKeyResult:
		return m.updateKeyResultProgress(goalId, value)

	default:
		return fmt.Errorf("RecordProgress not supported for goal type %s", goalType)
	}
}

// Dismiss removes a goal node by ID.
func (m *PlanningManager) Dismiss(goalId string) error {
	if goalId == "" {
		return fmt.Errorf("goalId cannot be empty")
	}

	goalType := detectGoalType(goalId)

	switch goalType {
	case GoalTypeTheme:
		return m.deleteTheme(goalId)
	case GoalTypeObjective:
		return m.deleteObjective(goalId)
	case GoalTypeKeyResult:
		return m.deleteKeyResult(goalId)
	case GoalTypeRoutine:
		return m.deleteRoutine(goalId)
	default:
		return fmt.Errorf("unknown goal type for ID %s", goalId)
	}
}

// SuggestAbbreviation suggests a unique abbreviation for a goal name.
func (m *PlanningManager) SuggestAbbreviation(name string) (string, error) {
	return m.suggestThemeAbbreviation(name)
}

// LoadNavigationContext retrieves the saved navigation context.
// Returns a default context if none is saved.
func (m *PlanningManager) LoadNavigationContext() (*NavigationContext, error) {
	ctx, err := m.uiStateAccess.LoadNavigationContext()
	if err != nil {
		// Return default context on error
		return &NavigationContext{
			CurrentView: "okr",
		}, nil
	}
	if ctx == nil {
		return &NavigationContext{
			CurrentView: "okr",
		}, nil
	}

	return &NavigationContext{
		CurrentView:                  ctx.CurrentView,
		CurrentItem:                  ctx.CurrentItem,
		FilterThemeID:                ctx.FilterThemeID,
		FilterThemeIDs:               ctx.FilterThemeIDs,
		LastAccessed:                 ctx.LastAccessed,
		ShowCompleted:                ctx.ShowCompleted,
		ShowArchived:                 ctx.ShowArchived,
		ShowArchivedTasks:            ctx.ShowArchivedTasks,
		ExpandedOkrIds:               ctx.ExpandedOkrIds,
		FilterTagIDs:                 ctx.FilterTagIDs,
		TodayFocusActive:             ctx.TodayFocusActive,
		TagFocusActive:               ctx.TagFocusActive,
		CollapsedSections:            ctx.CollapsedSections,
		CollapsedColumns:             ctx.CollapsedColumns,
		CalendarDayEditorDate:        ctx.CalendarDayEditorDate,
		CalendarDayEditorExpandedIds: ctx.CalendarDayEditorExpandedIds,
		VisionCollapsed:              ctx.VisionCollapsed,
		RoutinesCollapsed:            ctx.RoutinesCollapsed,
	}, nil
}

// SaveNavigationContext persists the current navigation context.
func (m *PlanningManager) SaveNavigationContext(ctx NavigationContext) error {
	accessCtx := access.NavigationContext{
		CurrentView:                  ctx.CurrentView,
		CurrentItem:                  ctx.CurrentItem,
		FilterThemeID:                ctx.FilterThemeID,
		FilterThemeIDs:               ctx.FilterThemeIDs,
		LastAccessed:                 ctx.LastAccessed,
		ShowCompleted:                ctx.ShowCompleted,
		ShowArchived:                 ctx.ShowArchived,
		ShowArchivedTasks:            ctx.ShowArchivedTasks,
		ExpandedOkrIds:               ctx.ExpandedOkrIds,
		FilterTagIDs:                 ctx.FilterTagIDs,
		TodayFocusActive:             ctx.TodayFocusActive,
		TagFocusActive:               ctx.TagFocusActive,
		CollapsedSections:            ctx.CollapsedSections,
		CollapsedColumns:             ctx.CollapsedColumns,
		CalendarDayEditorDate:        ctx.CalendarDayEditorDate,
		CalendarDayEditorExpandedIds: ctx.CalendarDayEditorExpandedIds,
		VisionCollapsed:              ctx.VisionCollapsed,
		RoutinesCollapsed:            ctx.RoutinesCollapsed,
	}

	if err := m.uiStateAccess.SaveNavigationContext(accessCtx); err != nil {
		return fmt.Errorf("%w", err)
	}

	return nil
}

// LoadTaskDrafts retrieves saved task drafts.
func (m *PlanningManager) LoadTaskDrafts() (json.RawMessage, error) {
	return m.uiStateAccess.LoadTaskDrafts()
}

// SaveTaskDrafts persists task drafts.
func (m *PlanningManager) SaveTaskDrafts(data json.RawMessage) error {
	return m.uiStateAccess.SaveTaskDrafts(data)
}

// GetPersonalVision retrieves the saved personal vision.
func (m *PlanningManager) GetPersonalVision() (*PersonalVision, error) {
	v, err := m.visionAccess.LoadVision()
	if err != nil {
		return nil, err
	}
	return toManagerPersonalVision(v), nil
}

// SavePersonalVision saves the personal mission and vision statements.
func (m *PlanningManager) SavePersonalVision(mission, vision string) error {
	v := &access.PersonalVision{
		Mission:   mission,
		Vision:    vision,
		UpdatedAt: utilities.Now(),
	}
	return m.visionAccess.SaveVision(v)
}

// GetAllThemeProgress computes progress for all themes and their objectives.
func (m *PlanningManager) GetAllThemeProgress() ([]ThemeProgress, error) {
	themes, err := m.themeAccess.GetThemes()
	if err != nil {
		return nil, err
	}

	// Convert access themes to engine DTOs
	engineThemes := make([]progress_engine.ThemeData, len(themes))
	for i, t := range themes {
		engineThemes[i] = toEngineThemeData(t)
	}

	// Compute progress via engine
	engineResult := m.progressEngine.ComputeAllThemeProgress(engineThemes)

	// Convert engine output to manager DTOs
	result := make([]ThemeProgress, len(engineResult))
	for i, tp := range engineResult {
		objectives := make([]ObjectiveProgress, len(tp.Objectives))
		for j, op := range tp.Objectives {
			objectives[j] = ObjectiveProgress{
				ObjectiveID: op.ObjectiveID,
				Progress:    op.Progress,
			}
		}
		result[i] = ThemeProgress{
			ThemeID:    tp.ThemeID,
			Progress:   tp.Progress,
			Objectives: objectives,
		}
	}

	return result, nil
}

// GetRoutinesForDate returns all routine occurrences (scheduled, overdue, sporadic) for the given date.
func (m *PlanningManager) GetRoutinesForDate(date string) ([]RoutineOccurrence, error) {
	if date == "" {
		return nil, fmt.Errorf("date cannot be empty")
	}

	routines, err := m.routineAccess.GetRoutines()
	if err != nil {
		return nil, fmt.Errorf("GetRoutinesForDate: failed to get routines: %w", err)
	}

	year, err := strconv.Atoi(date[:4])
	if err != nil {
		return nil, fmt.Errorf("GetRoutinesForDate: invalid date format: %w", err)
	}

	yearEntries, err := m.calendarAccess.GetYearFocus(year)
	if err != nil {
		return nil, fmt.Errorf("GetRoutinesForDate: failed to get year focus: %w", err)
	}

	// Build a map of date -> set of checked routine IDs
	checkedByDate := make(map[string]map[string]bool)
	for _, entry := range yearEntries {
		if len(entry.RoutineChecks) > 0 {
			set := make(map[string]bool)
			for _, rid := range entry.RoutineChecks {
				set[rid] = true
			}
			checkedByDate[entry.Date.String()] = set
		}
	}

	result := []RoutineOccurrence{}
	todayChecks := checkedByDate[date]
	today := utilities.Today().String()

	for _, routine := range routines {
		enginePattern := toEngineRepeatPattern(routine.RepeatPattern)
		engineExceptions := toEngineExceptions(routine.Exceptions)

		if enginePattern == nil {
			// Sporadic routine — always shown, check if checked
			checked := todayChecks != nil && todayChecks[routine.ID]
			result = append(result, RoutineOccurrence{
				RoutineID:   routine.ID,
				Description: routine.Description,
				Date:        date,
				Status:      "sporadic",
				Checked:     checked,
			})
			continue
		}

		// Periodic routine — check if scheduled for this date
		occurrences := m.scheduleEngine.ComputeOccurrences(*enginePattern, engineExceptions, date, date)
		for _, occ := range occurrences {
			checked := todayChecks != nil && todayChecks[routine.ID]
			result = append(result, RoutineOccurrence{
				RoutineID:   routine.ID,
				Description: routine.Description,
				Date:        occ,
				Status:      "scheduled",
				Checked:     checked,
			})
		}

		// Overdue is a "today only" view: viewing past or future dates must
		// only show occurrences scheduled for that date itself, never the
		// catch-up backlog.
		if date != today {
			continue
		}

		// Collect all completed dates for this routine across the year.
		var completedDates []string
		for d, checks := range checkedByDate {
			if checks[routine.ID] {
				completedDates = append(completedDates, d)
			}
		}

		// Collapse the engine-returned overdue dates into a single entry per
		// routine: MissedCount is the total count, Date is the most recent
		// missed date. Emit nothing when the routine has no missed occurrences.
		overdueDates := m.scheduleEngine.ComputeOverdue(*enginePattern, engineExceptions, completedDates, date)
		if len(overdueDates) == 0 {
			continue
		}
		maxOverdue := overdueDates[0]
		for _, d := range overdueDates[1:] {
			// Lexicographic compare on YYYY-MM-DD is equivalent to chronological order.
			if d > maxOverdue {
				maxOverdue = d
			}
		}
		result = append(result, RoutineOccurrence{
			RoutineID:   routine.ID,
			Description: routine.Description,
			Date:        maxOverdue,
			Status:      "overdue",
			Checked:     false,
			MissedCount: len(overdueDates),
		})
	}

	return result, nil
}

// RescheduleRoutineOccurrence adds a schedule exception to move a routine occurrence to a new date.
func (m *PlanningManager) RescheduleRoutineOccurrence(routineID, originalDate, newDate string) error {
	if routineID == "" || originalDate == "" || newDate == "" {
		return fmt.Errorf("routineID, originalDate, and newDate cannot be empty")
	}

	routines, err := m.routineAccess.GetRoutines()
	if err != nil {
		return fmt.Errorf("RescheduleRoutineOccurrence: failed to get routines: %w", err)
	}

	for _, routine := range routines {
		if routine.ID == routineID {
			origDate, err := utilities.ParseCalendarDate(originalDate)
			if err != nil {
				return fmt.Errorf("RescheduleRoutineOccurrence: invalid originalDate: %w", err)
			}
			newDt, err := utilities.ParseCalendarDate(newDate)
			if err != nil {
				return fmt.Errorf("RescheduleRoutineOccurrence: invalid newDate: %w", err)
			}
			routine.Exceptions = append(routine.Exceptions, access.ScheduleException{
				OriginalDate: origDate,
				NewDate:      newDt,
			})
			if err := m.routineAccess.SaveRoutine(routine); err != nil {
				return fmt.Errorf("RescheduleRoutineOccurrence: failed to save routine: %w", err)
			}
			return nil
		}
	}

	return fmt.Errorf("RescheduleRoutineOccurrence: routine %s not found", routineID)
}

// GetRoutineProgress computes period-based completion stats for a periodic routine.
func (m *PlanningManager) GetRoutineProgress(routineID string) (*RoutinePeriodProgress, error) {
	if routineID == "" {
		return nil, fmt.Errorf("routineID cannot be empty")
	}

	routines, err := m.routineAccess.GetRoutines()
	if err != nil {
		return nil, fmt.Errorf("GetRoutineProgress: failed to get routines: %w", err)
	}

	// Find the routine
	var routine *access.Routine
	for i := range routines {
		if routines[i].ID == routineID {
			routine = &routines[i]
			break
		}
	}

	if routine == nil {
		return nil, fmt.Errorf("GetRoutineProgress: routine %s not found", routineID)
	}

	if routine.RepeatPattern == nil {
		return nil, fmt.Errorf("GetRoutineProgress: routine %s has no repeat pattern", routineID)
	}

	enginePattern := toEngineRepeatPattern(routine.RepeatPattern)
	engineExceptions := toEngineExceptions(routine.Exceptions)

	todayDate := utilities.Today()
	today := todayDate.String()

	year := todayDate.Time().Year()
	yearEntries, err := m.calendarAccess.GetYearFocus(year)
	if err != nil {
		return nil, fmt.Errorf("GetRoutineProgress: failed to get year focus: %w", err)
	}

	var completedDates []string
	for _, entry := range yearEntries {
		for _, rid := range entry.RoutineChecks {
			if rid == routineID {
				completedDates = append(completedDates, entry.Date.String())
				break
			}
		}
	}

	completion := m.scheduleEngine.EvaluatePeriodCompletion(*enginePattern, engineExceptions, completedDates, today)

	return &RoutinePeriodProgress{
		RoutineID: routineID,
		Completed: completion.Completed,
		Expected:  completion.Expected,
		Period:    completion.Period,
		OnTrack:   completion.OnTrack,
	}, nil
}

// GetRoutines returns all routines via RoutineAccess, converted to manager types.
func (m *PlanningManager) GetRoutines() ([]Routine, error) {
	routines, err := m.routineAccess.GetRoutines()
	if err != nil {
		return nil, fmt.Errorf("GetRoutines: %w", err)
	}
	result := make([]Routine, len(routines))
	for i, r := range routines {
		result[i] = toManagerRoutine(r)
	}
	return result, nil
}
