package rule_engine

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

// IRuleEngine defines the interface for rule evaluation operations.
type IRuleEngine interface {
	// EvaluateTaskChange evaluates whether a task change is allowed by all active rules.
	EvaluateTaskChange(event TaskEvent) (*RuleEvaluationResult, error)
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
				"allowed_transitions": map[string]interface{}{
					"todo":     []interface{}{"doing", "done"},
					"doing":    []interface{}{"todo", "done"},
					"done":     []interface{}{"todo", "doing"},
					"archived": []interface{}{"todo"},
				},
			},
			Enabled:  true,
			Priority: 90,
		},
		{
			ID:          "max-age-doing",
			Name:        "Max Age in Doing Column",
			Category:    "automation",
			TriggerType: "all",
			Conditions: map[string]interface{}{
				"max_age_days": 30,
				"column":       "doing",
			},
			Enabled:  true,
			Priority: 50,
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
		{
			ID:          "subtask-hierarchy",
			Name:        "Subtask Hierarchy Validation",
			Category:    "validation",
			TriggerType: "all",
			Conditions: map[string]interface{}{
				"max_depth":           2,
				"validate_parent":     true,
				"no_circular_refs":    true,
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
	case "automation":
		return re.evaluateAutomationRule(rule, event)
	default:
		return nil
	}
}

// evaluateValidationRule evaluates validation rules (WIP limits, required fields, subtask hierarchy).
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

	// Subtask Hierarchy
	if _, ok := rule.Conditions["validate_parent"]; ok {
		violations = append(violations, re.checkSubtaskHierarchy(rule, event)...)
	}

	return violations
}

// evaluateWorkflowRule evaluates workflow rules (allowed transitions).
func (re *RuleEngine) evaluateWorkflowRule(rule Rule, event TaskEvent) []RuleViolation {
	if transitions, ok := rule.Conditions["allowed_transitions"]; ok {
		if v := re.checkAllowedTransition(rule, event, transitions); v != nil {
			return []RuleViolation{*v}
		}
	}
	return nil
}

// evaluateAutomationRule evaluates automation rules (max age warnings).
func (re *RuleEngine) evaluateAutomationRule(rule Rule, event TaskEvent) []RuleViolation {
	if maxAgeDays, ok := rule.Conditions["max_age_days"]; ok {
		if v := re.checkMaxAge(rule, event, maxAgeDays); v != nil {
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

// checkSubtaskHierarchy validates parent task references and depth constraints.
func (re *RuleEngine) checkSubtaskHierarchy(rule Rule, event TaskEvent) []RuleViolation {
	if event.Task.ParentTaskID == nil || *event.Task.ParentTaskID == "" {
		return nil // Not a subtask, no hierarchy to validate
	}

	var violations []RuleViolation
	parentID := *event.Task.ParentTaskID

	// Check parent exists
	parentExists := false
	for _, t := range event.AllTasks {
		if t.ID == parentID {
			parentExists = true
			break
		}
	}
	if !parentExists {
		violations = append(violations, RuleViolation{
			RuleID:   rule.ID,
			Priority: rule.Priority,
			Message:  fmt.Sprintf("Parent task %q does not exist", parentID),
			Category: rule.Category,
		})
		return violations
	}

	// Check no circular references: task cannot be its own parent
	if event.Task.ID != "" && event.Task.ID == parentID {
		violations = append(violations, RuleViolation{
			RuleID:   rule.ID,
			Priority: rule.Priority,
			Message:  "Task cannot be its own parent",
			Category: rule.Category,
		})
		return violations
	}

	// Check circular refs: walk up the parent chain
	if event.Task.ID != "" {
		taskMap := make(map[string]*string) // id -> parentTaskID
		for _, t := range event.AllTasks {
			if t.ID == event.Task.ID {
				// Use the new parent from the event
				pid := parentID
				taskMap[t.ID] = &pid
			} else {
				taskMap[t.ID] = t.ParentTaskID
			}
		}
		if _, exists := taskMap[event.Task.ID]; !exists {
			pid := parentID
			taskMap[event.Task.ID] = &pid
		}

		visited := map[string]bool{event.Task.ID: true}
		current := parentID
		for current != "" {
			if visited[current] {
				violations = append(violations, RuleViolation{
					RuleID:   rule.ID,
					Priority: rule.Priority,
					Message:  "Circular parent reference detected",
					Category: rule.Category,
				})
				return violations
			}
			visited[current] = true
			pid, ok := taskMap[current]
			if !ok || pid == nil {
				break
			}
			current = *pid
		}
	}

	// Check max depth
	if maxDepthRaw, ok := rule.Conditions["max_depth"]; ok {
		maxDepth, valid := toInt(maxDepthRaw)
		if valid {
			depth := 1 // current task is already 1 level deep
			current := parentID
			taskMap := make(map[string]*string)
			for _, t := range event.AllTasks {
				taskMap[t.ID] = t.ParentTaskID
			}
			for current != "" {
				pid, ok := taskMap[current]
				if !ok || pid == nil || *pid == "" {
					break
				}
				depth++
				current = *pid
			}
			if depth > maxDepth {
				violations = append(violations, RuleViolation{
					RuleID:   rule.ID,
					Priority: rule.Priority,
					Message:  fmt.Sprintf("Subtask depth %d exceeds maximum depth %d", depth, maxDepth),
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

// checkMaxAge warns if a task has been in a column too long.
func (re *RuleEngine) checkMaxAge(rule Rule, event TaskEvent, maxAgeDaysRaw interface{}) *RuleViolation {
	maxAgeDays, ok := toInt(maxAgeDaysRaw)
	if !ok {
		return nil
	}

	column, _ := rule.Conditions["column"].(string)
	if event.Task.CreatedAt == "" {
		return nil
	}

	createdAt, err := time.Parse(time.RFC3339, event.Task.CreatedAt)
	if err != nil {
		return nil
	}

	age := time.Since(createdAt)
	maxAge := time.Duration(maxAgeDays) * 24 * time.Hour

	if age > maxAge {
		return &RuleViolation{
			RuleID:   rule.ID,
			Priority: rule.Priority,
			Message:  fmt.Sprintf("Task has exceeded max age: %.0f days in column %q (limit: %d days)", age.Hours()/24, column, maxAgeDays),
			Category: rule.Category,
		}
	}
	return nil
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
