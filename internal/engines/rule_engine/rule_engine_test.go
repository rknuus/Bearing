package rule_engine

import (
	"testing"
	"time"
)

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
			Task: &TaskData{Title: "My Task", Priority: "important-urgent"},
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
			Task: &TaskData{Title: "", Priority: "important-urgent"},
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
			Task: &TaskData{Title: "   ", Priority: "important-urgent"},
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
			Task: &TaskData{Title: "Task", Priority: "important-urgent"},
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
			Task: &TaskData{Title: "Task", Description: "A description", Priority: "important-urgent"},
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
			Task:      &TaskData{ID: "T-T3", Title: "Task 3"},
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
			Task:      &TaskData{ID: "T-T3", Title: "Task 3"},
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
			Task:      &TaskData{ID: "T-T1", Title: "Task 1"},
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
			Task: &TaskData{Title: "New Task", Priority: "important-urgent"},
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
			Task:      &TaskData{ID: "T-T1", Title: "Task"},
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
			Task:      &TaskData{ID: "T-T1", Title: "Task"},
			OldStatus: "todo",
			NewStatus: "done",
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Allowed {
			t.Error("expected rejection for todo->done transition with restrictive rules")
		}
	})

	t.Run("allows valid transition doing->done", func(t *testing.T) {
		event := TaskEvent{
			Type:      EventTaskMove,
			Task:      &TaskData{ID: "T-T1", Title: "Task"},
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
			Task:      &TaskData{ID: "T-T1", Title: "Task"},
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

func TestUnit_AllowedTransitions_Archived(t *testing.T) {
	rules := DefaultRules()
	engine := NewRuleEngine(rules)

	t.Run("allows transition archived->todo", func(t *testing.T) {
		event := TaskEvent{
			Type:      EventTaskMove,
			Task:      &TaskData{ID: "T-T1", Title: "Task"},
			OldStatus: "archived",
			NewStatus: "todo",
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Allowed {
			t.Errorf("expected allowed for archived->todo, got violations: %v", result.Violations)
		}
	})

	t.Run("allows transition archived->doing with permissive policy", func(t *testing.T) {
		event := TaskEvent{
			Type:      EventTaskMove,
			Task:      &TaskData{ID: "T-T1", Title: "Task"},
			OldStatus: "archived",
			NewStatus: "doing",
		}
		result, err := engine.EvaluateTaskChange(event)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Allowed {
			t.Errorf("expected allowed for archived->doing with permissive policy, got violations: %v", result.Violations)
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
			Task: &TaskData{
				ID:        "T-T1",
				Title:     "Recent Task",
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
			Task: &TaskData{
				ID:        "T-T1",
				Title:     "Old Task",
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
			Task: &TaskData{
				ID:    "T-T1",
				Title: "Task",
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
			Task: &TaskData{Title: "", Priority: "important-urgent"},
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
			Task: &TaskData{Title: "", Description: "", Priority: "important-urgent"},
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

// =============================================================================
// DropZoneForTask Tests
// =============================================================================

func TestUnit_DropZoneForTask(t *testing.T) {
	engine := NewRuleEngine(nil)

	t.Run("todo column with priority returns priority", func(t *testing.T) {
		got := engine.DropZoneForTask("todo", "important-urgent", "todo")
		if got != "important-urgent" {
			t.Errorf("expected 'important-urgent', got %q", got)
		}
	})

	t.Run("non-todo column returns status", func(t *testing.T) {
		got := engine.DropZoneForTask("doing", "important-urgent", "todo")
		if got != "doing" {
			t.Errorf("expected 'doing', got %q", got)
		}
	})

	t.Run("todo column with empty priority returns status", func(t *testing.T) {
		got := engine.DropZoneForTask("todo", "", "todo")
		if got != "todo" {
			t.Errorf("expected 'todo', got %q", got)
		}
	})

	t.Run("custom todo slug with priority returns priority", func(t *testing.T) {
		got := engine.DropZoneForTask("backlog", "important-not-urgent", "backlog")
		if got != "important-not-urgent" {
			t.Errorf("expected 'important-not-urgent', got %q", got)
		}
	})

	t.Run("done column returns status", func(t *testing.T) {
		got := engine.DropZoneForTask("done", "", "todo")
		if got != "done" {
			t.Errorf("expected 'done', got %q", got)
		}
	})
}

// =============================================================================
// TodoSlugFromColumns Tests
// =============================================================================

func TestUnit_TodoSlugFromColumns(t *testing.T) {
	engine := NewRuleEngine(nil)

	t.Run("returns todo-type column name", func(t *testing.T) {
		columns := []ColumnInfo{
			{Name: "backlog", Type: "todo"},
			{Name: "in-progress", Type: "doing"},
			{Name: "completed", Type: "done"},
		}
		got := engine.TodoSlugFromColumns(columns)
		if got != "backlog" {
			t.Errorf("expected 'backlog', got %q", got)
		}
	})

	t.Run("falls back to todo when no todo-type column", func(t *testing.T) {
		columns := []ColumnInfo{
			{Name: "in-progress", Type: "doing"},
			{Name: "completed", Type: "done"},
		}
		got := engine.TodoSlugFromColumns(columns)
		if got != "todo" {
			t.Errorf("expected 'todo', got %q", got)
		}
	})

	t.Run("handles empty list", func(t *testing.T) {
		got := engine.TodoSlugFromColumns(nil)
		if got != "todo" {
			t.Errorf("expected 'todo', got %q", got)
		}
	})

	t.Run("returns first todo-type column when multiple exist", func(t *testing.T) {
		columns := []ColumnInfo{
			{Name: "first-todo", Type: "todo"},
			{Name: "second-todo", Type: "todo"},
		}
		got := engine.TodoSlugFromColumns(columns)
		if got != "first-todo" {
			t.Errorf("expected 'first-todo', got %q", got)
		}
	})
}

// =============================================================================
// ReconcileTaskOrder Tests
// =============================================================================

func TestUnit_ReconcileTaskOrder(t *testing.T) {
	engine := NewRuleEngine(nil)

	t.Run("removes stale entries", func(t *testing.T) {
		existingOrder := map[string][]string{
			"todo":  {"t1", "t2"},
			"doing": {"t3"},
		}
		actualZone := map[string]string{
			"t1": "todo",
			"t2": "doing",
			"t3": "doing",
		}
		result, changed := engine.ReconcileTaskOrder(existingOrder, actualZone)
		if !changed {
			t.Error("expected changed=true")
		}
		if len(result["todo"]) != 1 || result["todo"][0] != "t1" {
			t.Errorf("expected todo=['t1'], got %v", result["todo"])
		}
		foundT2 := false
		for _, id := range result["doing"] {
			if id == "t2" {
				foundT2 = true
			}
		}
		if !foundT2 {
			t.Errorf("expected t2 in doing zone, got %v", result["doing"])
		}
	})

	t.Run("adds missing tasks", func(t *testing.T) {
		existingOrder := map[string][]string{
			"todo": {"t1"},
		}
		actualZone := map[string]string{
			"t1": "todo",
			"t2": "doing",
		}
		result, changed := engine.ReconcileTaskOrder(existingOrder, actualZone)
		if !changed {
			t.Error("expected changed=true")
		}
		if len(result["doing"]) != 1 || result["doing"][0] != "t2" {
			t.Errorf("expected doing=['t2'], got %v", result["doing"])
		}
	})

	t.Run("handles empty order map", func(t *testing.T) {
		existingOrder := map[string][]string{}
		actualZone := map[string]string{
			"t1": "todo",
			"t2": "doing",
		}
		result, changed := engine.ReconcileTaskOrder(existingOrder, actualZone)
		if !changed {
			t.Error("expected changed=true")
		}
		if len(result["todo"]) != 1 || result["todo"][0] != "t1" {
			t.Errorf("expected todo=['t1'], got %v", result["todo"])
		}
		if len(result["doing"]) != 1 || result["doing"][0] != "t2" {
			t.Errorf("expected doing=['t2'], got %v", result["doing"])
		}
	})

	t.Run("handles no actual zones", func(t *testing.T) {
		existingOrder := map[string][]string{
			"todo": {"t1"},
		}
		actualZone := map[string]string{}
		result, changed := engine.ReconcileTaskOrder(existingOrder, actualZone)
		if !changed {
			t.Error("expected changed=true when stale entries exist")
		}
		if len(result["todo"]) != 0 {
			t.Errorf("expected empty todo, got %v", result["todo"])
		}
	})

	t.Run("returns changed=false when no changes needed", func(t *testing.T) {
		existingOrder := map[string][]string{
			"todo":  {"t1"},
			"doing": {"t2"},
		}
		actualZone := map[string]string{
			"t1": "todo",
			"t2": "doing",
		}
		_, changed := engine.ReconcileTaskOrder(existingOrder, actualZone)
		if changed {
			t.Error("expected changed=false when order matches actual zones")
		}
	})
}
