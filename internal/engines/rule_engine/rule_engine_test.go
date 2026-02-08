package rule_engine

import (
	"testing"
	"time"

	"github.com/rkn/bearing/internal/access"
)

// helper to create a string pointer
func strPtr(s string) *string {
	return &s
}

// =============================================================================
// Constructor Tests
// =============================================================================

func TestUnit_NewRuleEngine(t *testing.T) {
	t.Run("creates engine with rules", func(t *testing.T) {
		rules := DefaultRules()
		engine := NewRuleEngine(rules)
		if engine == nil {
			t.Fatal("expected non-nil engine")
		}
	})

	t.Run("creates engine with empty rules", func(t *testing.T) {
		engine := NewRuleEngine(nil)
		if engine == nil {
			t.Fatal("expected non-nil engine")
		}
	})
}

func TestUnit_DefaultRules(t *testing.T) {
	rules := DefaultRules()
	if len(rules) == 0 {
		t.Fatal("expected default rules to be non-empty")
	}

	// Verify all rules have IDs and are enabled
	for _, rule := range rules {
		if rule.ID == "" {
			t.Error("rule has empty ID")
		}
		if rule.Name == "" {
			t.Errorf("rule %s has empty name", rule.ID)
		}
		if !rule.Enabled {
			t.Errorf("default rule %s should be enabled", rule.ID)
		}
	}
}

// =============================================================================
// Required Fields Tests
// =============================================================================

func TestUnit_RequiredFields(t *testing.T) {
	rules := []Rule{
		{
			ID:          "required-fields",
			Name:        "Required Fields",
			Category:    "validation",
			TriggerType: "task_create",
			Conditions: map[string]interface{}{
				"required_fields": []interface{}{"title"},
			},
			Enabled:  true,
			Priority: 100,
		},
	}
	engine := NewRuleEngine(rules)

	t.Run("allows task with title", func(t *testing.T) {
		event := TaskEvent{
			Type: EventTaskCreate,
			Task: &access.Task{Title: "My Task", ThemeID: "T", Priority: "important-urgent"},
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Allowed {
			t.Errorf("expected allowed, got violations: %v", result.Violations)
		}
	})

	t.Run("rejects task with empty title", func(t *testing.T) {
		event := TaskEvent{
			Type: EventTaskCreate,
			Task: &access.Task{Title: "", ThemeID: "T", Priority: "important-urgent"},
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Allowed {
			t.Error("expected rejection for empty title")
		}
		if len(result.Violations) != 1 {
			t.Fatalf("expected 1 violation, got %d", len(result.Violations))
		}
		if result.Violations[0].Category != "validation" {
			t.Errorf("expected category 'validation', got %q", result.Violations[0].Category)
		}
	})

	t.Run("rejects task with whitespace-only title", func(t *testing.T) {
		event := TaskEvent{
			Type: EventTaskCreate,
			Task: &access.Task{Title: "   ", ThemeID: "T", Priority: "important-urgent"},
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Allowed {
			t.Error("expected rejection for whitespace-only title")
		}
	})
}

func TestUnit_RequiredFieldsDescription(t *testing.T) {
	rules := []Rule{
		{
			ID:          "required-description",
			Name:        "Required Description",
			Category:    "validation",
			TriggerType: "task_create",
			Conditions: map[string]interface{}{
				"required_fields": []interface{}{"title", "description"},
			},
			Enabled:  true,
			Priority: 100,
		},
	}
	engine := NewRuleEngine(rules)

	t.Run("rejects task missing description", func(t *testing.T) {
		event := TaskEvent{
			Type: EventTaskCreate,
			Task: &access.Task{Title: "Task", ThemeID: "T", Priority: "important-urgent"},
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Allowed {
			t.Error("expected rejection for missing description")
		}
		// Should have exactly one violation (description missing, title is ok)
		if len(result.Violations) != 1 {
			t.Errorf("expected 1 violation, got %d: %v", len(result.Violations), result.Violations)
		}
	})

	t.Run("allows task with all required fields", func(t *testing.T) {
		event := TaskEvent{
			Type: EventTaskCreate,
			Task: &access.Task{Title: "Task", Description: "A description", ThemeID: "T", Priority: "important-urgent"},
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Allowed {
			t.Errorf("expected allowed, got violations: %v", result.Violations)
		}
	})
}

// =============================================================================
// WIP Limit Tests
// =============================================================================

func TestUnit_WIPLimit(t *testing.T) {
	rules := []Rule{
		{
			ID:          "wip-doing",
			Name:        "WIP Limit Doing",
			Category:    "validation",
			TriggerType: "task_move",
			Conditions: map[string]interface{}{
				"max_wip_limit": 2,
				"column":        "doing",
			},
			Enabled:  true,
			Priority: 100,
		},
	}
	engine := NewRuleEngine(rules)

	t.Run("allows move when under WIP limit", func(t *testing.T) {
		event := TaskEvent{
			Type:      EventTaskMove,
			Task:      &access.Task{ID: "T-T3", Title: "Task 3", ThemeID: "T"},
			OldStatus: "todo",
			NewStatus: "doing",
			AllTasks: []TaskInfo{
				{ID: "T-T1", Status: "doing"},
				{ID: "T-T2", Status: "todo"},
				{ID: "T-T3", Status: "todo"},
			},
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Allowed {
			t.Errorf("expected allowed, got violations: %v", result.Violations)
		}
	})

	t.Run("rejects move when at WIP limit", func(t *testing.T) {
		event := TaskEvent{
			Type:      EventTaskMove,
			Task:      &access.Task{ID: "T-T3", Title: "Task 3", ThemeID: "T"},
			OldStatus: "todo",
			NewStatus: "doing",
			AllTasks: []TaskInfo{
				{ID: "T-T1", Status: "doing"},
				{ID: "T-T2", Status: "doing"},
				{ID: "T-T3", Status: "todo"},
			},
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Allowed {
			t.Error("expected rejection for WIP limit exceeded")
		}
		if len(result.Violations) == 0 {
			t.Error("expected at least one violation")
		}
	})

	t.Run("allows move to non-limited column", func(t *testing.T) {
		event := TaskEvent{
			Type:      EventTaskMove,
			Task:      &access.Task{ID: "T-T1", Title: "Task 1", ThemeID: "T"},
			OldStatus: "doing",
			NewStatus: "done",
			AllTasks: []TaskInfo{
				{ID: "T-T1", Status: "doing"},
				{ID: "T-T2", Status: "doing"},
			},
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Allowed {
			t.Errorf("expected allowed for move to done, got violations: %v", result.Violations)
		}
	})

	t.Run("ignores WIP rule for non-move events", func(t *testing.T) {
		event := TaskEvent{
			Type: EventTaskCreate,
			Task: &access.Task{Title: "New Task", ThemeID: "T", Priority: "important-urgent"},
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Allowed {
			t.Errorf("expected allowed for create event, got violations: %v", result.Violations)
		}
	})
}

// =============================================================================
// Allowed Transitions Tests
// =============================================================================

func TestUnit_AllowedTransitions(t *testing.T) {
	rules := []Rule{
		{
			ID:          "transitions",
			Name:        "Allowed Transitions",
			Category:    "workflow",
			TriggerType: "task_move",
			Conditions: map[string]interface{}{
				"allowed_transitions": map[string]interface{}{
					"todo":  []interface{}{"doing"},
					"doing": []interface{}{"done", "todo"},
					"done":  []interface{}{"todo"},
				},
			},
			Enabled:  true,
			Priority: 90,
		},
	}
	engine := NewRuleEngine(rules)

	t.Run("allows valid transition todo->doing", func(t *testing.T) {
		event := TaskEvent{
			Type:      EventTaskMove,
			Task:      &access.Task{ID: "T-T1", Title: "Task", ThemeID: "T"},
			OldStatus: "todo",
			NewStatus: "doing",
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Allowed {
			t.Errorf("expected allowed, got violations: %v", result.Violations)
		}
	})

	t.Run("rejects invalid transition todo->done", func(t *testing.T) {
		event := TaskEvent{
			Type:      EventTaskMove,
			Task:      &access.Task{ID: "T-T1", Title: "Task", ThemeID: "T"},
			OldStatus: "todo",
			NewStatus: "done",
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Allowed {
			t.Error("expected rejection for todo->done transition")
		}
	})

	t.Run("allows valid transition doing->done", func(t *testing.T) {
		event := TaskEvent{
			Type:      EventTaskMove,
			Task:      &access.Task{ID: "T-T1", Title: "Task", ThemeID: "T"},
			OldStatus: "doing",
			NewStatus: "done",
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Allowed {
			t.Errorf("expected allowed, got violations: %v", result.Violations)
		}
	})

	t.Run("allows same-column no-op", func(t *testing.T) {
		event := TaskEvent{
			Type:      EventTaskMove,
			Task:      &access.Task{ID: "T-T1", Title: "Task", ThemeID: "T"},
			OldStatus: "doing",
			NewStatus: "doing",
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Allowed {
			t.Errorf("expected allowed for same-column move")
		}
	})
}

// =============================================================================
// Max Age Tests
// =============================================================================

func TestUnit_MaxAge(t *testing.T) {
	rules := []Rule{
		{
			ID:          "max-age",
			Name:        "Max Age in Doing",
			Category:    "automation",
			TriggerType: "all",
			Conditions: map[string]interface{}{
				"max_age_days": 7,
				"column":       "doing",
			},
			Enabled:  true,
			Priority: 50,
		},
	}
	engine := NewRuleEngine(rules)

	t.Run("no violation for recent task", func(t *testing.T) {
		event := TaskEvent{
			Type: EventTaskMove,
			Task: &access.Task{
				ID:        "T-T1",
				Title:     "Recent Task",
				ThemeID:   "T",
				CreatedAt: time.Now().Add(-24 * time.Hour).Format(time.RFC3339),
			},
			OldStatus: "todo",
			NewStatus: "doing",
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Allowed {
			t.Errorf("expected allowed for recent task, got violations: %v", result.Violations)
		}
	})

	t.Run("violation for old task", func(t *testing.T) {
		event := TaskEvent{
			Type: EventTaskMove,
			Task: &access.Task{
				ID:        "T-T1",
				Title:     "Old Task",
				ThemeID:   "T",
				CreatedAt: time.Now().Add(-10 * 24 * time.Hour).Format(time.RFC3339),
			},
			OldStatus: "todo",
			NewStatus: "doing",
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Allowed {
			t.Error("expected violation for old task")
		}
	})

	t.Run("no violation when createdAt is empty", func(t *testing.T) {
		event := TaskEvent{
			Type: EventTaskMove,
			Task: &access.Task{
				ID:      "T-T1",
				Title:   "Task",
				ThemeID: "T",
			},
			OldStatus: "todo",
			NewStatus: "doing",
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Allowed {
			t.Errorf("expected allowed when no createdAt, got violations: %v", result.Violations)
		}
	})
}

// =============================================================================
// Subtask Hierarchy Tests
// =============================================================================

func TestUnit_SubtaskHierarchy(t *testing.T) {
	rules := []Rule{
		{
			ID:          "subtask-hierarchy",
			Name:        "Subtask Hierarchy",
			Category:    "validation",
			TriggerType: "all",
			Conditions: map[string]interface{}{
				"max_depth":        2,
				"validate_parent":  true,
				"no_circular_refs": true,
			},
			Enabled:  true,
			Priority: 100,
		},
	}
	engine := NewRuleEngine(rules)

	t.Run("allows task without parent", func(t *testing.T) {
		event := TaskEvent{
			Type: EventTaskCreate,
			Task: &access.Task{Title: "Top Level", ThemeID: "T", Priority: "important-urgent"},
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Allowed {
			t.Errorf("expected allowed for top-level task")
		}
	})

	t.Run("allows task with valid parent", func(t *testing.T) {
		event := TaskEvent{
			Type: EventTaskCreate,
			Task: &access.Task{
				ID:           "T-T2",
				Title:        "Subtask",
				ThemeID:      "T",
				Priority:     "important-urgent",
				ParentTaskID: strPtr("T-T1"),
			},
			AllTasks: []TaskInfo{
				{ID: "T-T1", Status: "todo"},
			},
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Allowed {
			t.Errorf("expected allowed for valid subtask, got violations: %v", result.Violations)
		}
	})

	t.Run("rejects task with non-existent parent", func(t *testing.T) {
		event := TaskEvent{
			Type: EventTaskCreate,
			Task: &access.Task{
				ID:           "T-T2",
				Title:        "Subtask",
				ThemeID:      "T",
				Priority:     "important-urgent",
				ParentTaskID: strPtr("NONEXISTENT"),
			},
			AllTasks: []TaskInfo{
				{ID: "T-T1", Status: "todo"},
			},
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Allowed {
			t.Error("expected rejection for non-existent parent")
		}
	})

	t.Run("rejects self-referencing parent", func(t *testing.T) {
		event := TaskEvent{
			Type: EventTaskUpdate,
			Task: &access.Task{
				ID:           "T-T1",
				Title:        "Self Ref",
				ThemeID:      "T",
				Priority:     "important-urgent",
				ParentTaskID: strPtr("T-T1"),
			},
			AllTasks: []TaskInfo{
				{ID: "T-T1", Status: "todo"},
			},
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Allowed {
			t.Error("expected rejection for self-referencing parent")
		}
	})

	t.Run("rejects circular parent reference", func(t *testing.T) {
		// T-T1 -> T-T2 -> T-T1 (circular)
		event := TaskEvent{
			Type: EventTaskUpdate,
			Task: &access.Task{
				ID:           "T-T1",
				Title:        "Task 1",
				ThemeID:      "T",
				Priority:     "important-urgent",
				ParentTaskID: strPtr("T-T2"),
			},
			AllTasks: []TaskInfo{
				{ID: "T-T1", Status: "todo"},
				{ID: "T-T2", Status: "todo", ParentTaskID: strPtr("T-T1")},
			},
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Allowed {
			t.Error("expected rejection for circular reference")
		}
	})

	t.Run("rejects exceeding max depth", func(t *testing.T) {
		// T-T1 -> T-T2 -> T-T3 (depth 2 for T-T3, which equals max)
		// T-T1 -> T-T2 -> T-T3 -> T-T4 (depth 3 for T-T4, exceeds max of 2)
		event := TaskEvent{
			Type: EventTaskCreate,
			Task: &access.Task{
				ID:           "T-T4",
				Title:        "Too Deep",
				ThemeID:      "T",
				Priority:     "important-urgent",
				ParentTaskID: strPtr("T-T3"),
			},
			AllTasks: []TaskInfo{
				{ID: "T-T1", Status: "todo"},
				{ID: "T-T2", Status: "todo", ParentTaskID: strPtr("T-T1")},
				{ID: "T-T3", Status: "doing", ParentTaskID: strPtr("T-T2")},
			},
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Allowed {
			t.Error("expected rejection for exceeding max depth")
		}
	})

	t.Run("allows task at max depth", func(t *testing.T) {
		// T-T1 -> T-T2 (depth 1, within max of 2)
		// T-T1 -> T-T2 -> T-T3 (depth 2 for T-T3, equals max)
		event := TaskEvent{
			Type: EventTaskCreate,
			Task: &access.Task{
				ID:           "T-T3",
				Title:        "At Max Depth",
				ThemeID:      "T",
				Priority:     "important-urgent",
				ParentTaskID: strPtr("T-T2"),
			},
			AllTasks: []TaskInfo{
				{ID: "T-T1", Status: "todo"},
				{ID: "T-T2", Status: "todo", ParentTaskID: strPtr("T-T1")},
			},
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Allowed {
			t.Errorf("expected allowed at max depth, got violations: %v", result.Violations)
		}
	})
}

// =============================================================================
// Error Handling Tests
// =============================================================================

func TestUnit_ErrorHandling(t *testing.T) {
	engine := NewRuleEngine(DefaultRules())

	t.Run("returns error for nil task", func(t *testing.T) {
		event := TaskEvent{
			Type: EventTaskCreate,
			Task: nil,
		}
		_, err := engine.EvaluateTaskChange(event)
		if err == nil {
			t.Error("expected error for nil task")
		}
	})
}

// =============================================================================
// Disabled Rules Tests
// =============================================================================

func TestUnit_DisabledRules(t *testing.T) {
	rules := []Rule{
		{
			ID:          "disabled-rule",
			Name:        "Disabled Rule",
			Category:    "validation",
			TriggerType: "task_create",
			Conditions: map[string]interface{}{
				"required_fields": []interface{}{"title"},
			},
			Enabled:  false,
			Priority: 100,
		},
	}
	engine := NewRuleEngine(rules)

	t.Run("disabled rules are not evaluated", func(t *testing.T) {
		event := TaskEvent{
			Type: EventTaskCreate,
			Task: &access.Task{Title: "", ThemeID: "T", Priority: "important-urgent"},
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Allowed {
			t.Error("expected allowed when all rules are disabled")
		}
	})
}

// =============================================================================
// Multiple Violations Tests
// =============================================================================

func TestUnit_MultipleViolations(t *testing.T) {
	rules := []Rule{
		{
			ID:          "required-fields",
			Name:        "Required Fields",
			Category:    "validation",
			TriggerType: "task_create",
			Conditions: map[string]interface{}{
				"required_fields": []interface{}{"title", "description"},
			},
			Enabled:  true,
			Priority: 100,
		},
	}
	engine := NewRuleEngine(rules)

	t.Run("returns multiple violations", func(t *testing.T) {
		event := TaskEvent{
			Type: EventTaskCreate,
			Task: &access.Task{Title: "", Description: "", ThemeID: "T", Priority: "important-urgent"},
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Allowed {
			t.Error("expected rejection")
		}
		if len(result.Violations) != 2 {
			t.Errorf("expected 2 violations, got %d: %v", len(result.Violations), result.Violations)
		}
	})
}
