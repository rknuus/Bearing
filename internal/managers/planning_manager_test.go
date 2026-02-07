package managers

import (
	"fmt"
	"testing"

	"github.com/rkn/bearing/internal/access"
)

// mockPlanAccess implements access.IPlanAccess for testing.
// SaveTheme assigns IDs to objectives and key results to simulate ensureThemeIDs.
type mockPlanAccess struct {
	themes []access.LifeTheme
	tasks  map[string]map[string][]access.Task // themeID -> status -> tasks
}

func newMockPlanAccess() *mockPlanAccess {
	return &mockPlanAccess{
		themes: []access.LifeTheme{
			{ID: "T", Name: "Test Theme", Color: "#3b82f6"},
		},
		tasks: make(map[string]map[string][]access.Task),
	}
}

func (m *mockPlanAccess) GetThemes() ([]access.LifeTheme, error) {
	return m.themes, nil
}

// collectMockMaxObjNum scans objectives to find the highest O number for a theme abbreviation.
func collectMockMaxObjNum(abbr string, objectives []access.Objective) int {
	max := 0
	for _, obj := range objectives {
		if obj.ID != "" {
			var n int
			fmt.Sscanf(obj.ID, abbr+"-O%d", &n)
			if n > max {
				max = n
			}
		}
		if childMax := collectMockMaxObjNum(abbr, obj.Objectives); childMax > max {
			max = childMax
		}
	}
	return max
}

// collectMockMaxKRNum scans key results to find the highest KR number for a theme abbreviation.
func collectMockMaxKRNum(abbr string, objectives []access.Objective) int {
	max := 0
	for _, obj := range objectives {
		for _, kr := range obj.KeyResults {
			if kr.ID != "" {
				var n int
				fmt.Sscanf(kr.ID, abbr+"-KR%d", &n)
				if n > max {
					max = n
				}
			}
		}
		if childMax := collectMockMaxKRNum(abbr, obj.Objectives); childMax > max {
			max = childMax
		}
	}
	return max
}

// ensureMockObjectiveIDs recursively assigns theme-scoped IDs to objectives and key results.
func ensureMockObjectiveIDs(abbr, parentID string, objectives []access.Objective, nextO, nextKR int) ([]access.Objective, int, int) {
	for i := range objectives {
		objectives[i].ParentID = parentID
		if objectives[i].ID == "" {
			nextO++
			objectives[i].ID = fmt.Sprintf("%s-O%d", abbr, nextO)
		}
		for j := range objectives[i].KeyResults {
			objectives[i].KeyResults[j].ParentID = objectives[i].ID
			if objectives[i].KeyResults[j].ID == "" {
				nextKR++
				objectives[i].KeyResults[j].ID = fmt.Sprintf("%s-KR%d", abbr, nextKR)
			}
		}
		objectives[i].Objectives, nextO, nextKR = ensureMockObjectiveIDs(abbr, objectives[i].ID, objectives[i].Objectives, nextO, nextKR)
	}
	return objectives, nextO, nextKR
}

func (m *mockPlanAccess) SaveTheme(theme access.LifeTheme) error {
	for i, t := range m.themes {
		if t.ID == theme.ID {
			// Simulate ensureThemeIDs
			maxO := collectMockMaxObjNum(theme.ID, theme.Objectives)
			maxKR := collectMockMaxKRNum(theme.ID, theme.Objectives)
			theme.Objectives, _, _ = ensureMockObjectiveIDs(theme.ID, theme.ID, theme.Objectives, maxO, maxKR)
			m.themes[i] = theme
			return nil
		}
	}
	if theme.ID == "" {
		theme.ID = access.SuggestAbbreviation(theme.Name, m.themes)
	}
	maxO := collectMockMaxObjNum(theme.ID, theme.Objectives)
	maxKR := collectMockMaxKRNum(theme.ID, theme.Objectives)
	theme.Objectives, _, _ = ensureMockObjectiveIDs(theme.ID, theme.ID, theme.Objectives, maxO, maxKR)
	m.themes = append(m.themes, theme)
	return nil
}

func (m *mockPlanAccess) DeleteTheme(id string) error {
	for i, t := range m.themes {
		if t.ID == id {
			m.themes = append(m.themes[:i], m.themes[i+1:]...)
			return nil
		}
	}
	return nil
}

func (m *mockPlanAccess) GetDayFocus(date string) (*access.DayFocus, error) {
	return nil, nil
}

func (m *mockPlanAccess) SaveDayFocus(day access.DayFocus) error {
	return nil
}

func (m *mockPlanAccess) GetYearFocus(year int) ([]access.DayFocus, error) {
	return nil, nil
}

func (m *mockPlanAccess) GetTasksByTheme(themeID string) ([]access.Task, error) {
	var result []access.Task
	if themeMap, ok := m.tasks[themeID]; ok {
		for _, tasks := range themeMap {
			result = append(result, tasks...)
		}
	}
	return result, nil
}

func (m *mockPlanAccess) GetTasksByStatus(themeID, status string) ([]access.Task, error) {
	if themeMap, ok := m.tasks[themeID]; ok {
		if tasks, ok := themeMap[status]; ok {
			return tasks, nil
		}
	}
	return []access.Task{}, nil
}

func (m *mockPlanAccess) SaveTask(task access.Task) error {
	if m.tasks[task.ThemeID] == nil {
		m.tasks[task.ThemeID] = make(map[string][]access.Task)
	}
	// Default to todo status for new tasks
	status := "todo"
	if m.tasks[task.ThemeID][status] == nil {
		m.tasks[task.ThemeID][status] = []access.Task{}
	}

	// Check if task already exists and update
	for s, tasks := range m.tasks[task.ThemeID] {
		for i, t := range tasks {
			if t.ID == task.ID {
				m.tasks[task.ThemeID][s][i] = task
				return nil
			}
		}
	}

	// Generate ID if not provided
	if task.ID == "" {
		task.ID = "task-001"
	}
	m.tasks[task.ThemeID][status] = append(m.tasks[task.ThemeID][status], task)
	return nil
}

func (m *mockPlanAccess) MoveTask(taskID, newStatus string) error {
	for themeID, themeMap := range m.tasks {
		for status, tasks := range themeMap {
			for i, task := range tasks {
				if task.ID == taskID {
					// Remove from old status
					m.tasks[themeID][status] = append(tasks[:i], tasks[i+1:]...)
					// Add to new status
					if m.tasks[themeID][newStatus] == nil {
						m.tasks[themeID][newStatus] = []access.Task{}
					}
					m.tasks[themeID][newStatus] = append(m.tasks[themeID][newStatus], task)
					return nil
				}
			}
		}
	}
	return nil
}

func (m *mockPlanAccess) DeleteTask(taskID string) error {
	for themeID, themeMap := range m.tasks {
		for status, tasks := range themeMap {
			for i, task := range tasks {
				if task.ID == taskID {
					m.tasks[themeID][status] = append(tasks[:i], tasks[i+1:]...)
					return nil
				}
			}
		}
	}
	return nil
}

func (m *mockPlanAccess) LoadNavigationContext() (*access.NavigationContext, error) {
	return nil, nil
}

func (m *mockPlanAccess) SaveNavigationContext(ctx access.NavigationContext) error {
	return nil
}

func TestNewPlanningManager(t *testing.T) {
	t.Run("creates manager with valid access", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, err := NewPlanningManager(mockAccess)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if manager == nil {
			t.Fatal("expected manager, got nil")
		}
	})

	t.Run("returns error with nil access", func(t *testing.T) {
		_, err := NewPlanningManager(nil)
		if err == nil {
			t.Fatal("expected error for nil access")
		}
	})
}

// =============================================================================
// Objective CRUD Tests
// =============================================================================

func TestCreateObjective(t *testing.T) {
	t.Run("creates objective under theme", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, err := manager.CreateObjective("T", "My Objective")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if obj == nil {
			t.Fatal("expected objective, got nil")
		}
		if obj.Title != "My Objective" {
			t.Errorf("expected title 'My Objective', got '%s'", obj.Title)
		}
		if obj.ID != "T-O1" {
			t.Errorf("expected ID 'T-O1', got '%s'", obj.ID)
		}
	})

	t.Run("creates nested objective under objective", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		parent, err := manager.CreateObjective("T", "Parent Objective")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		child, err := manager.CreateObjective(parent.ID, "Child Objective")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if child.Title != "Child Objective" {
			t.Errorf("expected title 'Child Objective', got '%s'", child.Title)
		}
		if child.ID != "T-O2" {
			t.Errorf("expected ID 'T-O2', got '%s'", child.ID)
		}
	})

	t.Run("creates deeply nested objective", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		l1, _ := manager.CreateObjective("T", "Level 1")
		l2, _ := manager.CreateObjective(l1.ID, "Level 2")
		l3, err := manager.CreateObjective(l2.ID, "Level 3")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if l3.ID != "T-O3" {
			t.Errorf("expected deeply nested ID, got '%s'", l3.ID)
		}
	})

	t.Run("returns error for empty parentId", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		_, err := manager.CreateObjective("", "Title")
		if err == nil {
			t.Fatal("expected error for empty parentId")
		}
	})

	t.Run("returns error for empty title", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		_, err := manager.CreateObjective("T", "")
		if err == nil {
			t.Fatal("expected error for empty title")
		}
	})

	t.Run("returns error for non-existent parent", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		_, err := manager.CreateObjective("NONEXISTENT", "Title")
		if err == nil {
			t.Fatal("expected error for non-existent parent")
		}
	})
}

func TestUpdateObjective(t *testing.T) {
	t.Run("updates objective title", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "Original")
		err := manager.UpdateObjective(obj.ID, "Updated")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		// Verify the update
		themes, _ := manager.GetThemes()
		found := findObjectiveByID(themes[0].Objectives, obj.ID)
		if found == nil {
			t.Fatal("objective not found after update")
		}
		if found.Title != "Updated" {
			t.Errorf("expected title 'Updated', got '%s'", found.Title)
		}
	})

	t.Run("updates nested objective title", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		parent, _ := manager.CreateObjective("T", "Parent")
		child, _ := manager.CreateObjective(parent.ID, "Child")

		err := manager.UpdateObjective(child.ID, "Updated Child")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetThemes()
		found := findObjectiveByID(themes[0].Objectives, child.ID)
		if found == nil {
			t.Fatal("nested objective not found after update")
		}
		if found.Title != "Updated Child" {
			t.Errorf("expected title 'Updated Child', got '%s'", found.Title)
		}
	})

	t.Run("returns error for empty objectiveId", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		err := manager.UpdateObjective("", "Title")
		if err == nil {
			t.Fatal("expected error for empty objectiveId")
		}
	})

	t.Run("returns error for non-existent objective", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		err := manager.UpdateObjective("NONEXISTENT", "Title")
		if err == nil {
			t.Fatal("expected error for non-existent objective")
		}
	})
}

func TestDeleteObjective(t *testing.T) {
	t.Run("deletes objective from theme", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "To Delete")
		err := manager.DeleteObjective(obj.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetThemes()
		if len(themes[0].Objectives) != 0 {
			t.Errorf("expected 0 objectives after delete, got %d", len(themes[0].Objectives))
		}
	})

	t.Run("deletes nested objective and its children", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		parent, _ := manager.CreateObjective("T", "Parent")
		manager.CreateObjective(parent.ID, "Child")

		// Delete the parent -- child should be gone too
		err := manager.DeleteObjective(parent.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetThemes()
		if len(themes[0].Objectives) != 0 {
			t.Errorf("expected 0 objectives after deleting parent, got %d", len(themes[0].Objectives))
		}
	})

	t.Run("deletes middle objective in 3-level hierarchy and cascades grandchildren", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		l1, _ := manager.CreateObjective("T", "Level 1")
		l2, _ := manager.CreateObjective(l1.ID, "Level 2")
		l3, _ := manager.CreateObjective(l2.ID, "Level 3")
		manager.CreateKeyResult(l3.ID, "Deep KR")

		// Delete the middle objective (Level 2) -- Level 3 and its KR should be gone too
		err := manager.DeleteObjective(l2.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetThemes()
		l1After := findObjectiveByID(themes[0].Objectives, l1.ID)
		if l1After == nil {
			t.Fatal("expected Level 1 to still exist")
		}
		if len(l1After.Objectives) != 0 {
			t.Errorf("expected 0 children after deleting middle, got %d", len(l1After.Objectives))
		}

		// Verify the grandchild is truly gone
		l3After := findObjectiveByID(themes[0].Objectives, l3.ID)
		if l3After != nil {
			t.Error("expected Level 3 to be gone after deleting Level 2")
		}
	})

	t.Run("deletes child without affecting parent", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		parent, _ := manager.CreateObjective("T", "Parent")
		child, _ := manager.CreateObjective(parent.ID, "Child")

		err := manager.DeleteObjective(child.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetThemes()
		if len(themes[0].Objectives) != 1 {
			t.Fatalf("expected 1 objective (parent), got %d", len(themes[0].Objectives))
		}
		if themes[0].Objectives[0].Title != "Parent" {
			t.Errorf("expected parent to remain, got '%s'", themes[0].Objectives[0].Title)
		}
		if len(themes[0].Objectives[0].Objectives) != 0 {
			t.Errorf("expected 0 children after delete, got %d", len(themes[0].Objectives[0].Objectives))
		}
	})

	t.Run("returns error for empty objectiveId", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		err := manager.DeleteObjective("")
		if err == nil {
			t.Fatal("expected error for empty objectiveId")
		}
	})

	t.Run("returns error for non-existent objective", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		err := manager.DeleteObjective("NONEXISTENT")
		if err == nil {
			t.Fatal("expected error for non-existent objective")
		}
	})
}

// =============================================================================
// Key Result CRUD Tests
// =============================================================================

func TestCreateKeyResult(t *testing.T) {
	t.Run("creates key result under objective", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "Objective")
		kr, err := manager.CreateKeyResult(obj.ID, "My KR")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if kr.Description != "My KR" {
			t.Errorf("expected description 'My KR', got '%s'", kr.Description)
		}
		if kr.ID != "T-KR1" {
			t.Errorf("expected ID 'T-KR1', got '%s'", kr.ID)
		}
	})

	t.Run("creates key result under nested objective", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		parent, _ := manager.CreateObjective("T", "Parent")
		child, _ := manager.CreateObjective(parent.ID, "Child")
		kr, err := manager.CreateKeyResult(child.ID, "Nested KR")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if kr.ID != "T-KR1" {
			t.Errorf("expected nested KR ID, got '%s'", kr.ID)
		}
	})

	t.Run("creates key result on intermediate objective that has children", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		parent, _ := manager.CreateObjective("T", "Parent")
		manager.CreateObjective(parent.ID, "Child")

		// Add KR to the parent (intermediate node with children)
		kr, err := manager.CreateKeyResult(parent.ID, "Intermediate KR")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if kr.ID != "T-KR1" {
			t.Errorf("expected ID 'T-KR1', got '%s'", kr.ID)
		}

		// Verify the parent still has both children and the key result
		themes, _ := manager.GetThemes()
		parentObj := findObjectiveByID(themes[0].Objectives, parent.ID)
		if len(parentObj.Objectives) != 1 {
			t.Errorf("expected 1 child objective, got %d", len(parentObj.Objectives))
		}
		if len(parentObj.KeyResults) != 1 {
			t.Errorf("expected 1 key result, got %d", len(parentObj.KeyResults))
		}
		if parentObj.KeyResults[0].Description != "Intermediate KR" {
			t.Errorf("expected description 'Intermediate KR', got '%s'", parentObj.KeyResults[0].Description)
		}
	})

	t.Run("returns error for empty parentObjectiveId", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		_, err := manager.CreateKeyResult("", "Description")
		if err == nil {
			t.Fatal("expected error for empty parentObjectiveId")
		}
	})

	t.Run("returns error for non-existent objective", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		_, err := manager.CreateKeyResult("NONEXISTENT", "Description")
		if err == nil {
			t.Fatal("expected error for non-existent objective")
		}
	})
}

func TestUpdateKeyResult(t *testing.T) {
	t.Run("updates key result description", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "Objective")
		kr, _ := manager.CreateKeyResult(obj.ID, "Original")

		err := manager.UpdateKeyResult(kr.ID, "Updated")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetThemes()
		found := findObjectiveByID(themes[0].Objectives, obj.ID)
		if found.KeyResults[0].Description != "Updated" {
			t.Errorf("expected description 'Updated', got '%s'", found.KeyResults[0].Description)
		}
	})

	t.Run("updates key result under nested objective", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		parent, _ := manager.CreateObjective("T", "Parent")
		child, _ := manager.CreateObjective(parent.ID, "Child")
		kr, _ := manager.CreateKeyResult(child.ID, "Original")

		err := manager.UpdateKeyResult(kr.ID, "Updated Nested")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetThemes()
		childObj := findObjectiveByID(themes[0].Objectives, child.ID)
		if childObj.KeyResults[0].Description != "Updated Nested" {
			t.Errorf("expected 'Updated Nested', got '%s'", childObj.KeyResults[0].Description)
		}
	})

	t.Run("returns error for empty keyResultId", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		err := manager.UpdateKeyResult("", "Description")
		if err == nil {
			t.Fatal("expected error for empty keyResultId")
		}
	})

	t.Run("returns error for non-existent key result", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		err := manager.UpdateKeyResult("NONEXISTENT", "Description")
		if err == nil {
			t.Fatal("expected error for non-existent key result")
		}
	})
}

func TestUpdateKeyResultProgress(t *testing.T) {
	t.Run("updates key result currentValue", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "Objective")
		kr, _ := manager.CreateKeyResult(obj.ID, "Read 12 books")

		err := manager.UpdateKeyResultProgress(kr.ID, 5)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetThemes()
		found := findObjectiveByID(themes[0].Objectives, obj.ID)
		if found.KeyResults[0].CurrentValue != 5 {
			t.Errorf("expected currentValue 5, got %d", found.KeyResults[0].CurrentValue)
		}
	})

	t.Run("updates key result under nested objective", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		parent, _ := manager.CreateObjective("T", "Parent")
		child, _ := manager.CreateObjective(parent.ID, "Child")
		kr, _ := manager.CreateKeyResult(child.ID, "Nested KR")

		err := manager.UpdateKeyResultProgress(kr.ID, 10)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetThemes()
		childObj := findObjectiveByID(themes[0].Objectives, child.ID)
		if childObj.KeyResults[0].CurrentValue != 10 {
			t.Errorf("expected currentValue 10, got %d", childObj.KeyResults[0].CurrentValue)
		}
	})

	t.Run("returns error for empty keyResultId", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		err := manager.UpdateKeyResultProgress("", 5)
		if err == nil {
			t.Fatal("expected error for empty keyResultId")
		}
	})

	t.Run("returns error for non-existent key result", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		err := manager.UpdateKeyResultProgress("NONEXISTENT", 5)
		if err == nil {
			t.Fatal("expected error for non-existent key result")
		}
	})
}

func TestDeleteKeyResult(t *testing.T) {
	t.Run("deletes key result", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "Objective")
		kr, _ := manager.CreateKeyResult(obj.ID, "To Delete")

		err := manager.DeleteKeyResult(kr.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetThemes()
		found := findObjectiveByID(themes[0].Objectives, obj.ID)
		if len(found.KeyResults) != 0 {
			t.Errorf("expected 0 key results after delete, got %d", len(found.KeyResults))
		}
	})

	t.Run("deletes key result under nested objective", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		parent, _ := manager.CreateObjective("T", "Parent")
		child, _ := manager.CreateObjective(parent.ID, "Child")
		kr, _ := manager.CreateKeyResult(child.ID, "Nested KR")

		err := manager.DeleteKeyResult(kr.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetThemes()
		childObj := findObjectiveByID(themes[0].Objectives, child.ID)
		if len(childObj.KeyResults) != 0 {
			t.Errorf("expected 0 key results after delete, got %d", len(childObj.KeyResults))
		}
	})

	t.Run("returns error for empty keyResultId", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		err := manager.DeleteKeyResult("")
		if err == nil {
			t.Fatal("expected error for empty keyResultId")
		}
	})

	t.Run("returns error for non-existent key result", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		err := manager.DeleteKeyResult("NONEXISTENT")
		if err == nil {
			t.Fatal("expected error for non-existent key result")
		}
	})
}

// =============================================================================
// Task Tests (unchanged signatures)
// =============================================================================

func TestCreateTask(t *testing.T) {
	t.Run("creates task with valid priority Q1", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		task, err := manager.CreateTask("Test Task", "T", "2026-01-31", "important-urgent")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if task == nil {
			t.Fatal("expected task, got nil")
		}
		if task.Title != "Test Task" {
			t.Errorf("expected title 'Test Task', got '%s'", task.Title)
		}
		if task.Priority != "important-urgent" {
			t.Errorf("expected priority 'important-urgent', got '%s'", task.Priority)
		}
	})

	t.Run("creates task with valid priority Q2", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		task, err := manager.CreateTask("Test Task", "T", "2026-01-31", "important-not-urgent")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if task.Priority != "important-not-urgent" {
			t.Errorf("expected priority 'important-not-urgent', got '%s'", task.Priority)
		}
	})

	t.Run("creates task with valid priority Q3", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		task, err := manager.CreateTask("Test Task", "T", "2026-01-31", "not-important-urgent")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if task.Priority != "not-important-urgent" {
			t.Errorf("expected priority 'not-important-urgent', got '%s'", task.Priority)
		}
	})

	t.Run("rejects Q4 priority", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		_, err := manager.CreateTask("Test Task", "T", "2026-01-31", "not-important-not-urgent")
		if err == nil {
			t.Fatal("expected error for Q4 priority")
		}
	})

	t.Run("rejects invalid priority", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		_, err := manager.CreateTask("Test Task", "T", "2026-01-31", "invalid-priority")
		if err == nil {
			t.Fatal("expected error for invalid priority")
		}
	})
}

func TestMoveTask(t *testing.T) {
	t.Run("moves task to valid status", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		// Create a task first
		task, _ := manager.CreateTask("Test Task", "T", "2026-01-31", "important-urgent")

		// Move to doing
		err := manager.MoveTask(task.ID, "doing")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
	})

	t.Run("rejects invalid status", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		err := manager.MoveTask("task-001", "invalid-status")
		if err == nil {
			t.Fatal("expected error for invalid status")
		}
	})
}

func TestGetTasks(t *testing.T) {
	t.Run("returns all tasks with status", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		// Create tasks
		manager.CreateTask("Task 1", "T", "2026-01-31", "important-urgent")
		manager.CreateTask("Task 2", "T", "2026-01-31", "important-not-urgent")

		tasks, err := manager.GetTasks()
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if len(tasks) != 2 {
			t.Errorf("expected 2 tasks, got %d", len(tasks))
		}

		// Check that status is included
		for _, task := range tasks {
			if task.Status != "todo" {
				t.Errorf("expected status 'todo', got '%s'", task.Status)
			}
		}
	})
}

func TestDeleteTask(t *testing.T) {
	t.Run("deletes existing task", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		// Create a task
		task, _ := manager.CreateTask("Test Task", "T", "2026-01-31", "important-urgent")

		// Delete it
		err := manager.DeleteTask(task.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		// Verify it's gone
		tasks, _ := manager.GetTasks()
		if len(tasks) != 0 {
			t.Errorf("expected 0 tasks after delete, got %d", len(tasks))
		}
	})

	t.Run("returns error for empty ID", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		err := manager.DeleteTask("")
		if err == nil {
			t.Fatal("expected error for empty ID")
		}
	})
}
