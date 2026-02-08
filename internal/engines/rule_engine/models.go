// Package rule_engine provides Engine layer components implementing the iDesign methodology.
// It evaluates business rules for task operations including WIP limits,
// allowed transitions, required fields, and subtask hierarchy constraints.
package rule_engine

import (
	"github.com/rkn/bearing/internal/access"
)

// EventType identifies the kind of task state change being evaluated.
type EventType string

const (
	// EventTaskCreate represents a new task being created.
	EventTaskCreate EventType = "task_create"
	// EventTaskUpdate represents an existing task being modified.
	EventTaskUpdate EventType = "task_update"
	// EventTaskMove represents a task moving between kanban columns.
	EventTaskMove EventType = "task_move"
)

// TaskEvent represents a task state change event for rule evaluation.
type TaskEvent struct {
	Type      EventType    `json:"type"`
	Task      *access.Task `json:"task"`                // The task being created/updated
	OldStatus string       `json:"oldStatus,omitempty"` // Current column (for moves)
	NewStatus string       `json:"newStatus,omitempty"` // Target column (for moves)
	AllTasks  []TaskInfo   `json:"allTasks,omitempty"`  // All tasks for context
}

// TaskInfo is a lightweight task representation with status for rule context.
type TaskInfo struct {
	ID           string  `json:"id"`
	Title        string  `json:"title"`
	Status       string  `json:"status"`
	Priority     string  `json:"priority"`
	ParentTaskID *string `json:"parentTaskId,omitempty"`
	CreatedAt    string  `json:"createdAt,omitempty"`
}

// RuleViolation represents a single rule violation found during evaluation.
type RuleViolation struct {
	RuleID   string `json:"ruleId"`
	Priority int    `json:"priority"` // Higher = more severe
	Message  string `json:"message"`
	Category string `json:"category"` // "validation", "workflow", "automation"
}

// RuleEvaluationResult contains the outcome of rule evaluation.
type RuleEvaluationResult struct {
	Allowed    bool            `json:"allowed"`
	Violations []RuleViolation `json:"violations,omitempty"`
}

// Rule defines a single business rule evaluated against task events.
type Rule struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Category    string                 `json:"category"`    // "validation", "workflow", "automation"
	TriggerType string                 `json:"triggerType"` // "task_create", "task_update", "task_move", "all"
	Conditions  map[string]interface{} `json:"conditions"`
	Enabled     bool                   `json:"enabled"`
	Priority    int                    `json:"priority"` // Higher = evaluated first
}
