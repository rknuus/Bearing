package rule_engine

import (
	"fmt"
	"sort"
	"strings"
)

// IRuleEngine defines the interface for rule evaluation operations.
type IRuleEngine interface {
	// EvaluateTaskChange evaluates whether a task change is allowed by all active rules.
	EvaluateTaskChange(event TaskEvent) (*RuleEvaluationResult, error)
	// DropZoneForTask returns the drop zone ID for a task. For todo-type columns,
	// the drop zone is the priority (for section-based rendering). For other columns,
	// the drop zone is the status itself.
	DropZoneForTask(status, priority, todoSlug string) string
	// TodoSlugFromColumns returns the slug of the todo-type column from a column list.
	TodoSlugFromColumns(columns []ColumnInfo) string
	// ReconcileTaskOrder corrects an order map so each task appears in exactly
	// the zone that its actual zone dictates. Removes stale entries, deduplicates,
	// and adds missing tasks.
	ReconcileTaskOrder(existingOrder map[string][]string, actualZone map[string]string) (map[string][]string, bool)
}

// RuleEngine implements IRuleEngine. It is stateless and evaluates rules
// against provided context without requiring external dependencies.
type RuleEngine struct {
	rules []Rule
}

// NewRuleEngine creates a new RuleEngine with the given rules.
func NewRuleEngine(rules []Rule) *RuleEngine {
	return &RuleEngine{rules: rules}
}

// DefaultRules returns a set of permissive default rules.
func DefaultRules() []Rule {
	return []Rule{
		{
			ID:          "wip-limit-doing",
			Name:        "WIP Limit for Doing Column",
			Category:    "validation",
			TriggerType: "task_move",
			Conditions: map[string]interface{}{
				"max_wip_limit": 20,
				"column":        "doing",
			},
			Enabled:  true,
			Priority: 100,
		},
		{
			ID:          "allowed-transitions",
			Name:        "Allowed Column Transitions",
			Category:    "workflow",
			TriggerType: "task_move",
			Conditions: map[string]interface{}{
				"allow_all": true,
			},
			Enabled:  true,
			Priority: 90,
		},
		{
			ID:          "required-fields-create",
			Name:        "Required Fields for Task Creation",
			Category:    "validation",
			TriggerType: "task_create",
			Conditions: map[string]interface{}{
				"required_fields": []interface{}{"title"},
			},
			Enabled:  true,
			Priority: 100,
		},
	}
}

// EvaluateTaskChange evaluates all applicable rules against a task event.
func (re *RuleEngine) EvaluateTaskChange(event TaskEvent) (*RuleEvaluationResult, error) {
	if event.Task == nil {
		return nil, fmt.Errorf("RuleEngine.EvaluateTaskChange: task cannot be nil")
	}

	applicable := re.filterApplicableRules(string(event.Type))
	if len(applicable) == 0 {
		return &RuleEvaluationResult{Allowed: true}, nil
	}

	var violations []RuleViolation
	for _, rule := range applicable {
		v := re.evaluateRule(rule, event)
		violations = append(violations, v...)
	}

	sort.Slice(violations, func(i, j int) bool {
		return violations[i].Priority > violations[j].Priority
	})

	return &RuleEvaluationResult{
		Allowed:    len(violations) == 0,
		Violations: violations,
	}, nil
}

// filterApplicableRules returns enabled rules matching the event type.
func (re *RuleEngine) filterApplicableRules(eventType string) []Rule {
	var applicable []Rule
	for _, rule := range re.rules {
		if !rule.Enabled {
			continue
		}
		if rule.TriggerType == eventType || rule.TriggerType == "all" {
			applicable = append(applicable, rule)
		}
	}
	return applicable
}

// evaluateRule evaluates a single rule and returns any violations.
func (re *RuleEngine) evaluateRule(rule Rule, event TaskEvent) []RuleViolation {
	switch rule.Category {
	case "validation":
		return re.evaluateValidationRule(rule, event)
	case "workflow":
		return re.evaluateWorkflowRule(rule, event)
	default:
		return nil
	}
}

// evaluateValidationRule evaluates validation rules (WIP limits, required fields).
func (re *RuleEngine) evaluateValidationRule(rule Rule, event TaskEvent) []RuleViolation {
	var violations []RuleViolation

	// WIP Limit
	if maxWIP, ok := rule.Conditions["max_wip_limit"]; ok {
		if v := re.checkWIPLimit(rule, event, maxWIP); v != nil {
			violations = append(violations, *v)
		}
	}

	// Required Fields
	if reqFields, ok := rule.Conditions["required_fields"]; ok {
		violations = append(violations, re.checkRequiredFields(rule, event, reqFields)...)
	}

	return violations
}

// evaluateWorkflowRule evaluates workflow rules (allowed transitions).
func (re *RuleEngine) evaluateWorkflowRule(rule Rule, event TaskEvent) []RuleViolation {
	// allow_all permits any transition (used for dynamic columns)
	if allowAll, ok := rule.Conditions["allow_all"].(bool); ok && allowAll {
		return nil
	}
	if transitions, ok := rule.Conditions["allowed_transitions"]; ok {
		if v := re.checkAllowedTransition(rule, event, transitions); v != nil {
			return []RuleViolation{*v}
		}
	}
	return nil
}

// checkWIPLimit checks if moving a task to a column would exceed the WIP limit.
func (re *RuleEngine) checkWIPLimit(rule Rule, event TaskEvent, maxWIPRaw interface{}) *RuleViolation {
	if event.Type != EventTaskMove {
		return nil
	}

	maxWIP, ok := toInt(maxWIPRaw)
	if !ok {
		return nil
	}

	column, _ := rule.Conditions["column"].(string)
	if column == "" || event.NewStatus != column {
		return nil
	}

	// Count tasks currently in the target column (excluding the task being moved)
	count := 0
	for _, t := range event.AllTasks {
		if t.Status == column && t.ID != event.Task.ID {
			count++
		}
	}

	if count >= maxWIP {
		return &RuleViolation{
			RuleID:   rule.ID,
			Priority: rule.Priority,
			Message:  fmt.Sprintf("WIP limit exceeded: column %q has %d tasks, limit is %d", column, count, maxWIP),
			Category: rule.Category,
		}
	}
	return nil
}

// checkRequiredFields validates that required fields are non-empty on the task.
func (re *RuleEngine) checkRequiredFields(rule Rule, event TaskEvent, reqFieldsRaw interface{}) []RuleViolation {
	fields, ok := reqFieldsRaw.([]interface{})
	if !ok {
		return nil
	}

	var violations []RuleViolation
	for _, f := range fields {
		fieldName, ok := f.(string)
		if !ok {
			continue
		}
		switch fieldName {
		case "title":
			if strings.TrimSpace(event.Task.Title) == "" {
				violations = append(violations, RuleViolation{
					RuleID:   rule.ID,
					Priority: rule.Priority,
					Message:  "Task title is required",
					Category: rule.Category,
				})
			}
		case "description":
			if strings.TrimSpace(event.Task.Description) == "" {
				violations = append(violations, RuleViolation{
					RuleID:   rule.ID,
					Priority: rule.Priority,
					Message:  "Task description is required",
					Category: rule.Category,
				})
			}
		case "priority":
			if strings.TrimSpace(event.Task.Priority) == "" {
				violations = append(violations, RuleViolation{
					RuleID:   rule.ID,
					Priority: rule.Priority,
					Message:  "Task priority is required",
					Category: rule.Category,
				})
			}
		}
	}
	return violations
}

// checkAllowedTransition verifies the column transition is allowed.
func (re *RuleEngine) checkAllowedTransition(rule Rule, event TaskEvent, transitionsRaw interface{}) *RuleViolation {
	if event.Type != EventTaskMove {
		return nil
	}
	if event.OldStatus == "" || event.NewStatus == "" || event.OldStatus == event.NewStatus {
		return nil
	}

	transitions, ok := transitionsRaw.(map[string]interface{})
	if !ok {
		return nil
	}

	allowedRaw, exists := transitions[event.OldStatus]
	if !exists {
		return &RuleViolation{
			RuleID:   rule.ID,
			Priority: rule.Priority,
			Message:  fmt.Sprintf("No transitions defined from column %q", event.OldStatus),
			Category: rule.Category,
		}
	}

	allowed, ok := allowedRaw.([]interface{})
	if !ok {
		return nil
	}

	for _, a := range allowed {
		if fmt.Sprintf("%v", a) == event.NewStatus {
			return nil // Transition is allowed
		}
	}

	return &RuleViolation{
		RuleID:   rule.ID,
		Priority: rule.Priority,
		Message:  fmt.Sprintf("Transition from %q to %q is not allowed", event.OldStatus, event.NewStatus),
		Category: rule.Category,
	}
}

// toInt converts an interface{} value to int.
func toInt(v interface{}) (int, bool) {
	switch val := v.(type) {
	case int:
		return val, true
	case float64:
		return int(val), true
	case int64:
		return int(val), true
	default:
		return 0, false
	}
}

// DropZoneForTask returns the drop zone ID for a task based on its status and priority.
// For todo-type columns the drop zone is the priority section name (when set);
// for other columns the drop zone is the status itself.
func (re *RuleEngine) DropZoneForTask(status, priority, todoSlug string) string {
	if status == todoSlug && priority != "" {
		return priority
	}
	return status
}

// TodoSlugFromColumns returns the slug of the todo-type column from the given
// column list. Falls back to "todo" when no todo-type column is found.
func (re *RuleEngine) TodoSlugFromColumns(columns []ColumnInfo) string {
	for _, col := range columns {
		if col.Type == "todo" {
			return col.Name
		}
	}
	return "todo"
}

// ReconcileTaskOrder takes the existing order map and a map of actual task zones
// (taskID -> correct zone) and returns the corrected order map.
// It removes stale entries, deduplicates, and adds missing tasks to their correct zones.
func (re *RuleEngine) ReconcileTaskOrder(existingOrder map[string][]string, actualZone map[string]string) (map[string][]string, bool) {
	changed := false

	// Remove stale entries: keep only IDs whose actual zone matches the zone key
	for zone, ids := range existingOrder {
		filtered := make([]string, 0, len(ids))
		for _, id := range ids {
			if actualZone[id] == zone {
				filtered = append(filtered, id)
			} else {
				changed = true
			}
		}
		existingOrder[zone] = filtered
	}

	// Add missing tasks to their correct zone
	present := make(map[string]bool)
	for _, ids := range existingOrder {
		for _, id := range ids {
			present[id] = true
		}
	}
	for id, zone := range actualZone {
		if !present[id] {
			existingOrder[zone] = append(existingOrder[zone], id)
			changed = true
		}
	}

	return existingOrder, changed
}
