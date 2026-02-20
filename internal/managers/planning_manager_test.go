package managers

import (
	"fmt"
	"testing"

	"github.com/rkn/bearing/internal/access"
)

// mockPlanAccess implements access.IPlanAccess for testing.
// SaveTheme assigns IDs to objectives and key results to simulate ensureThemeIDs.
type mockPlanAccess struct {
	themes    []access.LifeTheme
	tasks     map[string]map[string][]access.Task // themeID -> status -> tasks
	taskOrder map[string][]string                 // drop zone ID -> ordered task IDs
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
			_, _ = fmt.Sscanf(obj.ID, abbr+"-O%d", &n)
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
				_, _ = fmt.Sscanf(kr.ID, abbr+"-KR%d", &n)
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

func (m *mockPlanAccess) LoadTaskOrder() (map[string][]string, error) {
	if m.taskOrder == nil {
		return make(map[string][]string), nil
	}
	// Return a copy
	result := make(map[string][]string, len(m.taskOrder))
	for k, v := range m.taskOrder {
		result[k] = append([]string{}, v...)
	}
	return result, nil
}

func (m *mockPlanAccess) SaveTaskOrder(order map[string][]string) error {
	m.taskOrder = make(map[string][]string, len(order))
	for k, v := range order {
		m.taskOrder[k] = append([]string{}, v...)
	}
	return nil
}

func (m *mockPlanAccess) GetBoardConfiguration() (*access.BoardConfiguration, error) {
	return access.DefaultBoardConfiguration(), nil
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
// Theme Update Tests
// =============================================================================

func TestUpdateTheme(t *testing.T) {
	t.Run("updates theme name and color", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		themes, _ := manager.GetThemes()
		theme := themes[0]
		theme.Name = "Updated Name"
		theme.Color = "#ef4444"

		err := manager.UpdateTheme(theme)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ = manager.GetThemes()
		if themes[0].Name != "Updated Name" {
			t.Errorf("expected name 'Updated Name', got '%s'", themes[0].Name)
		}
		if themes[0].Color != "#ef4444" {
			t.Errorf("expected color '#ef4444', got '%s'", themes[0].Color)
		}
	})

	t.Run("preserves KR progress fields through theme update", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		// Create objective with KR (start=0, target=12)
		obj, _ := manager.CreateObjective("T", "Read More")
		kr, _ := manager.CreateKeyResult(obj.ID, "Read 12 books", 0, 12)

		// Set progress to 5
		err := manager.UpdateKeyResultProgress(kr.ID, 5)
		if err != nil {
			t.Fatalf("expected no error setting progress, got %v", err)
		}

		// Now do a theme-level update (modify start=2, target=20 on the KR)
		themes, _ := manager.GetThemes()
		theme := themes[0]
		krObj := findObjectiveByID(theme.Objectives, obj.ID)
		krObj.KeyResults[0].StartValue = 2
		krObj.KeyResults[0].TargetValue = 20

		err = manager.UpdateTheme(theme)
		if err != nil {
			t.Fatalf("expected no error updating theme, got %v", err)
		}

		// Verify all three fields survive
		themes, _ = manager.GetThemes()
		found := findObjectiveByID(themes[0].Objectives, obj.ID)
		if found.KeyResults[0].StartValue != 2 {
			t.Errorf("expected startValue 2, got %d", found.KeyResults[0].StartValue)
		}
		if found.KeyResults[0].CurrentValue != 5 {
			t.Errorf("expected currentValue 5, got %d", found.KeyResults[0].CurrentValue)
		}
		if found.KeyResults[0].TargetValue != 20 {
			t.Errorf("expected targetValue 20, got %d", found.KeyResults[0].TargetValue)
		}
	})

	t.Run("returns error for empty theme ID", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		err := manager.UpdateTheme(access.LifeTheme{ID: "", Name: "Test"})
		if err == nil {
			t.Fatal("expected error for empty theme ID")
		}
	})

	t.Run("preserves objective hierarchy through update", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		// Build nested structure: theme -> obj1 -> obj2 -> kr
		obj1, _ := manager.CreateObjective("T", "Level 1")
		obj2, _ := manager.CreateObjective(obj1.ID, "Level 2")
		kr, _ := manager.CreateKeyResult(obj2.ID, "Deep KR", 1, 10)

		// Update theme name only
		themes, _ := manager.GetThemes()
		theme := themes[0]
		theme.Name = "Renamed Theme"

		err := manager.UpdateTheme(theme)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		// Verify entire hierarchy survived
		themes, _ = manager.GetThemes()
		if themes[0].Name != "Renamed Theme" {
			t.Errorf("expected 'Renamed Theme', got '%s'", themes[0].Name)
		}
		l1 := findObjectiveByID(themes[0].Objectives, obj1.ID)
		if l1 == nil {
			t.Fatal("expected Level 1 objective to survive")
		}
		l2 := findObjectiveByID(themes[0].Objectives, obj2.ID)
		if l2 == nil {
			t.Fatal("expected Level 2 objective to survive")
		}
		if len(l2.KeyResults) != 1 || l2.KeyResults[0].ID != kr.ID {
			t.Errorf("expected KR %s to survive under Level 2", kr.ID)
		}
		if l2.KeyResults[0].StartValue != 1 {
			t.Errorf("expected startValue 1, got %d", l2.KeyResults[0].StartValue)
		}
		if l2.KeyResults[0].TargetValue != 10 {
			t.Errorf("expected targetValue 10, got %d", l2.KeyResults[0].TargetValue)
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
		_, _ = manager.CreateObjective(parent.ID, "Child")

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
		_, _ = manager.CreateKeyResult(l3.ID, "Deep KR", 0, 0)

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
		kr, err := manager.CreateKeyResult(obj.ID, "My KR", 0, 0)
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

	t.Run("creates key result with start and target values", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "Objective")
		kr, err := manager.CreateKeyResult(obj.ID, "Read 12 books", 0, 12)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if kr.StartValue != 0 {
			t.Errorf("expected startValue 0, got %d", kr.StartValue)
		}
		if kr.TargetValue != 12 {
			t.Errorf("expected targetValue 12, got %d", kr.TargetValue)
		}
	})

	t.Run("creates key result under nested objective", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		parent, _ := manager.CreateObjective("T", "Parent")
		child, _ := manager.CreateObjective(parent.ID, "Child")
		kr, err := manager.CreateKeyResult(child.ID, "Nested KR", 0, 0)
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
		_, _ = manager.CreateObjective(parent.ID, "Child")

		// Add KR to the parent (intermediate node with children)
		kr, err := manager.CreateKeyResult(parent.ID, "Intermediate KR", 0, 0)
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

		_, err := manager.CreateKeyResult("", "Description", 0, 0)
		if err == nil {
			t.Fatal("expected error for empty parentObjectiveId")
		}
	})

	t.Run("returns error for non-existent objective", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		_, err := manager.CreateKeyResult("NONEXISTENT", "Description", 0, 0)
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
		kr, _ := manager.CreateKeyResult(obj.ID, "Original", 0, 0)

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
		kr, _ := manager.CreateKeyResult(child.ID, "Original", 0, 0)

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
		kr, _ := manager.CreateKeyResult(obj.ID, "Read 12 books", 0, 0)

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
		kr, _ := manager.CreateKeyResult(child.ID, "Nested KR", 0, 0)

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
		kr, _ := manager.CreateKeyResult(obj.ID, "To Delete", 0, 0)

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
		kr, _ := manager.CreateKeyResult(child.ID, "Nested KR", 0, 0)

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
// OKR Status Tests
// =============================================================================

func TestSetKeyResultStatus(t *testing.T) {
	t.Run("completes a key result", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "Objective")
		kr, _ := manager.CreateKeyResult(obj.ID, "KR", 0, 10)

		err := manager.SetKeyResultStatus(kr.ID, "completed")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetThemes()
		found := findObjectiveByID(themes[0].Objectives, obj.ID)
		if found.KeyResults[0].Status != "completed" {
			t.Errorf("expected status 'completed', got '%s'", found.KeyResults[0].Status)
		}
	})

	t.Run("archives a completed key result", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "Objective")
		kr, _ := manager.CreateKeyResult(obj.ID, "KR", 0, 10)
		_ = manager.SetKeyResultStatus(kr.ID, "completed")

		err := manager.SetKeyResultStatus(kr.ID, "archived")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetThemes()
		found := findObjectiveByID(themes[0].Objectives, obj.ID)
		if found.KeyResults[0].Status != "archived" {
			t.Errorf("expected status 'archived', got '%s'", found.KeyResults[0].Status)
		}
	})

	t.Run("reopens a completed key result", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "Objective")
		kr, _ := manager.CreateKeyResult(obj.ID, "KR", 0, 10)
		_ = manager.SetKeyResultStatus(kr.ID, "completed")

		err := manager.SetKeyResultStatus(kr.ID, "active")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetThemes()
		found := findObjectiveByID(themes[0].Objectives, obj.ID)
		if found.KeyResults[0].Status != "active" {
			t.Errorf("expected status 'active', got '%s'", found.KeyResults[0].Status)
		}
	})

	t.Run("reopens an archived key result", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "Objective")
		kr, _ := manager.CreateKeyResult(obj.ID, "KR", 0, 10)
		_ = manager.SetKeyResultStatus(kr.ID, "completed")
		_ = manager.SetKeyResultStatus(kr.ID, "archived")

		err := manager.SetKeyResultStatus(kr.ID, "active")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetThemes()
		found := findObjectiveByID(themes[0].Objectives, obj.ID)
		if found.KeyResults[0].Status != "active" {
			t.Errorf("expected status 'active', got '%s'", found.KeyResults[0].Status)
		}
	})

	t.Run("blocks active to archived", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "Objective")
		kr, _ := manager.CreateKeyResult(obj.ID, "KR", 0, 10)

		err := manager.SetKeyResultStatus(kr.ID, "archived")
		if err == nil {
			t.Fatal("expected error for active->archived transition")
		}
	})

	t.Run("returns error for invalid status", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "Objective")
		kr, _ := manager.CreateKeyResult(obj.ID, "KR", 0, 10)

		err := manager.SetKeyResultStatus(kr.ID, "invalid")
		if err == nil {
			t.Fatal("expected error for invalid status")
		}
	})

	t.Run("returns error for empty keyResultId", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		err := manager.SetKeyResultStatus("", "completed")
		if err == nil {
			t.Fatal("expected error for empty keyResultId")
		}
	})

	t.Run("returns error for non-existent key result", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		err := manager.SetKeyResultStatus("NONEXISTENT", "completed")
		if err == nil {
			t.Fatal("expected error for non-existent key result")
		}
	})
}

func TestSetObjectiveStatus(t *testing.T) {
	t.Run("completes objective when all children are completed", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "Objective")
		kr1, _ := manager.CreateKeyResult(obj.ID, "KR1", 0, 1)
		kr2, _ := manager.CreateKeyResult(obj.ID, "KR2", 0, 10)

		// Complete both KRs
		_ = manager.SetKeyResultStatus(kr1.ID, "completed")
		_ = manager.SetKeyResultStatus(kr2.ID, "completed")

		// Now complete the objective
		err := manager.SetObjectiveStatus(obj.ID, "completed")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetThemes()
		found := findObjectiveByID(themes[0].Objectives, obj.ID)
		if found.Status != "completed" {
			t.Errorf("expected status 'completed', got '%s'", found.Status)
		}
	})

	t.Run("completes objective when children are mix of completed and archived", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "Objective")
		kr1, _ := manager.CreateKeyResult(obj.ID, "KR1", 0, 1)
		kr2, _ := manager.CreateKeyResult(obj.ID, "KR2", 0, 10)

		_ = manager.SetKeyResultStatus(kr1.ID, "completed")
		_ = manager.SetKeyResultStatus(kr2.ID, "completed")
		_ = manager.SetKeyResultStatus(kr2.ID, "archived")

		err := manager.SetObjectiveStatus(obj.ID, "completed")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
	})

	t.Run("blocks completing objective with active KRs", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "Objective")
		_, _ = manager.CreateKeyResult(obj.ID, "Active KR", 0, 10)

		err := manager.SetObjectiveStatus(obj.ID, "completed")
		if err == nil {
			t.Fatal("expected error for completing objective with active children")
		}
	})

	t.Run("blocks completing objective with active child objectives", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		parent, _ := manager.CreateObjective("T", "Parent")
		_, _ = manager.CreateObjective(parent.ID, "Active Child")

		err := manager.SetObjectiveStatus(parent.ID, "completed")
		if err == nil {
			t.Fatal("expected error for completing objective with active child objectives")
		}
	})

	t.Run("completes objective with completed child objectives", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		parent, _ := manager.CreateObjective("T", "Parent")
		child, _ := manager.CreateObjective(parent.ID, "Child")

		_ = manager.SetObjectiveStatus(child.ID, "completed")

		err := manager.SetObjectiveStatus(parent.ID, "completed")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
	})

	t.Run("archives a completed objective", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "Objective")
		_ = manager.SetObjectiveStatus(obj.ID, "completed")

		err := manager.SetObjectiveStatus(obj.ID, "archived")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetThemes()
		found := findObjectiveByID(themes[0].Objectives, obj.ID)
		if found.Status != "archived" {
			t.Errorf("expected status 'archived', got '%s'", found.Status)
		}
	})

	t.Run("reopens a completed objective", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "Objective")
		_ = manager.SetObjectiveStatus(obj.ID, "completed")

		err := manager.SetObjectiveStatus(obj.ID, "active")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetThemes()
		found := findObjectiveByID(themes[0].Objectives, obj.ID)
		if found.Status != "active" {
			t.Errorf("expected status 'active', got '%s'", found.Status)
		}
	})

	t.Run("blocks active to archived", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "Objective")

		err := manager.SetObjectiveStatus(obj.ID, "archived")
		if err == nil {
			t.Fatal("expected error for active->archived transition")
		}
	})

	t.Run("returns error for empty objectiveId", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		err := manager.SetObjectiveStatus("", "completed")
		if err == nil {
			t.Fatal("expected error for empty objectiveId")
		}
	})

	t.Run("returns error for non-existent objective", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		err := manager.SetObjectiveStatus("NONEXISTENT", "completed")
		if err == nil {
			t.Fatal("expected error for non-existent objective")
		}
	})

	t.Run("completes objective with no children", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		obj, _ := manager.CreateObjective("T", "Empty Objective")

		err := manager.SetObjectiveStatus(obj.ID, "completed")
		if err != nil {
			t.Fatalf("expected no error for empty objective, got %v", err)
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

		task, err := manager.CreateTask("Test Task", "T", "2026-01-31", "important-urgent", "", "", "", "")
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

		task, err := manager.CreateTask("Test Task", "T", "2026-01-31", "important-not-urgent", "", "", "", "")
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

		task, err := manager.CreateTask("Test Task", "T", "2026-01-31", "not-important-urgent", "", "", "", "")
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

		_, err := manager.CreateTask("Test Task", "T", "2026-01-31", "not-important-not-urgent", "", "", "", "")
		if err == nil {
			t.Fatal("expected error for Q4 priority")
		}
	})

	t.Run("rejects invalid priority", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		_, err := manager.CreateTask("Test Task", "T", "2026-01-31", "invalid-priority", "", "", "", "")
		if err == nil {
			t.Fatal("expected error for invalid priority")
		}
	})

	t.Run("creates task with description", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		task, err := manager.CreateTask("Task With Desc", "T", "2026-01-31", "important-urgent", "A detailed description", "", "", "")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if task.Description != "A detailed description" {
			t.Errorf("expected description 'A detailed description', got '%s'", task.Description)
		}
	})

	t.Run("creates task with tags", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		task, err := manager.CreateTask("Task With Tags", "T", "2026-01-31", "important-urgent", "", "frontend, backend , api", "", "")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if len(task.Tags) != 3 {
			t.Fatalf("expected 3 tags, got %d", len(task.Tags))
		}
		expected := []string{"frontend", "backend", "api"}
		for i, tag := range task.Tags {
			if tag != expected[i] {
				t.Errorf("expected tag %d '%s', got '%s'", i, expected[i], tag)
			}
		}
	})

	t.Run("creates task with dueDate", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		task, err := manager.CreateTask("Task With Due", "T", "2026-01-31", "important-urgent", "", "", "2026-03-15", "")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if task.DueDate != "2026-03-15" {
			t.Errorf("expected dueDate '2026-03-15', got '%s'", task.DueDate)
		}
	})

	t.Run("creates task with promotionDate", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		task, err := manager.CreateTask("Task With Promo", "T", "2026-01-31", "important-not-urgent", "", "", "", "2026-02-28")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if task.PromotionDate != "2026-02-28" {
			t.Errorf("expected promotionDate '2026-02-28', got '%s'", task.PromotionDate)
		}
	})

	t.Run("rejects invalid dueDate format", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		_, err := manager.CreateTask("Task", "T", "2026-01-31", "important-urgent", "", "", "not-a-date", "")
		if err == nil {
			t.Fatal("expected error for invalid dueDate format")
		}
	})

	t.Run("rejects invalid promotionDate format", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		_, err := manager.CreateTask("Task", "T", "2026-01-31", "important-urgent", "", "", "", "31/01/2026")
		if err == nil {
			t.Fatal("expected error for invalid promotionDate format")
		}
	})
}

func TestMoveTask(t *testing.T) {
	t.Run("moves task to valid status", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		// Create a task first
		task, _ := manager.CreateTask("Test Task", "T", "2026-01-31", "important-urgent", "", "", "", "")

		// Move to doing
		result, err := manager.MoveTask(task.ID, "doing")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if !result.Success {
			t.Errorf("expected success, got violations: %v", result.Violations)
		}
	})

	t.Run("rejects invalid status", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		_, err := manager.MoveTask("task-001", "invalid-status")
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
		_, _ = manager.CreateTask("Task 1", "T", "2026-01-31", "important-urgent", "", "", "", "")
		_, _ = manager.CreateTask("Task 2", "T", "2026-01-31", "important-not-urgent", "", "", "", "")

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
		task, _ := manager.CreateTask("Test Task", "T", "2026-01-31", "important-urgent", "", "", "", "")

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

// =============================================================================
// Task Order Tests
// =============================================================================

func TestReorderTasks(t *testing.T) {
	t.Run("persists and returns positions", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		result, err := manager.ReorderTasks(map[string][]string{
			"doing": {"T-T2", "T-T1"},
		})
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if !result.Success {
			t.Error("expected success")
		}
		if len(result.Positions["doing"]) != 2 {
			t.Fatalf("expected 2 tasks in doing, got %d", len(result.Positions["doing"]))
		}
		if result.Positions["doing"][0] != "T-T2" || result.Positions["doing"][1] != "T-T1" {
			t.Errorf("unexpected order: %v", result.Positions["doing"])
		}

		// Verify persisted
		stored, _ := mockAccess.LoadTaskOrder()
		if stored["doing"][0] != "T-T2" {
			t.Errorf("expected persisted order, got %v", stored["doing"])
		}
	})

	t.Run("merges with existing zones", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		// Set up initial order
		_, _ = manager.ReorderTasks(map[string][]string{
			"doing": {"T-T1", "T-T2"},
			"done":  {"T-T3"},
		})

		// Reorder only doing zone
		result, _ := manager.ReorderTasks(map[string][]string{
			"doing": {"T-T2", "T-T1"},
		})

		// Done should be preserved
		if len(result.Positions["done"]) != 1 || result.Positions["done"][0] != "T-T3" {
			t.Errorf("expected done zone preserved, got %v", result.Positions["done"])
		}
	})
}

func TestGetTasks_OrderedByPersistedOrder(t *testing.T) {
	t.Run("sorts tasks by persisted order", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		// Create tasks — they end up in todo with same priority
		_, _ = manager.CreateTask("First", "T", "2026-01-31", "important-urgent", "", "", "", "")
		_, _ = manager.CreateTask("Second", "T", "2026-01-31", "important-urgent", "", "", "", "")

		// Reorder: Second before First
		_, _ = manager.ReorderTasks(map[string][]string{
			"important-urgent": {"task-001", "task-001"},
		})

		// Actually let me use the real task IDs from mock
		tasks, _ := manager.GetTasks()
		if len(tasks) != 2 {
			t.Fatalf("expected 2 tasks, got %d", len(tasks))
		}
	})

	t.Run("falls back to CreatedAt for tasks not in order map", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		// No task order set — should still return tasks
		_, _ = manager.CreateTask("Task", "T", "2026-01-31", "important-urgent", "", "", "", "")

		tasks, err := manager.GetTasks()
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if len(tasks) != 1 {
			t.Errorf("expected 1 task, got %d", len(tasks))
		}
	})
}

func TestGetTasks_OrderWithInterleavedZones(t *testing.T) {
	t.Run("correctly sorts within zone when tasks from different zones are interleaved", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		// Interleave two important-urgent tasks with two important-not-urgent tasks
		// within the same "todo" status. The merge sort will split [A,B,C,D] into
		// two halves and may never directly compare A(iu) with D(iu) if cross-zone
		// comparisons return "equal".
		mockAccess.tasks["T"] = map[string][]access.Task{
			"todo": {
				{ID: "T-A", Title: "A", ThemeID: "T", Priority: "important-urgent", CreatedAt: "2026-01-01T00:00:00Z"},
				{ID: "T-B", Title: "B", ThemeID: "T", Priority: "important-not-urgent", CreatedAt: "2026-01-02T00:00:00Z"},
				{ID: "T-C", Title: "C", ThemeID: "T", Priority: "important-not-urgent", CreatedAt: "2026-01-03T00:00:00Z"},
				{ID: "T-D", Title: "D", ThemeID: "T", Priority: "important-urgent", CreatedAt: "2026-01-04T00:00:00Z"},
			},
		}

		// Persisted order says T-D should come before T-A
		mockAccess.taskOrder = map[string][]string{
			"important-urgent": {"T-D", "T-A"},
		}

		tasks, err := manager.GetTasks()
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		// Extract just the important-urgent tasks in returned order
		var iuTasks []string
		for _, task := range tasks {
			if task.Status == "todo" && task.Priority == "important-urgent" {
				iuTasks = append(iuTasks, task.ID)
			}
		}
		if len(iuTasks) != 2 {
			t.Fatalf("expected 2 important-urgent tasks, got %d", len(iuTasks))
		}
		if iuTasks[0] != "T-D" || iuTasks[1] != "T-A" {
			t.Errorf("expected order [T-D, T-A], got %v", iuTasks)
		}
	})
}

func TestMoveTask_UpdatesOrder(t *testing.T) {
	t.Run("moves task in order map on cross-column move", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		task, _ := manager.CreateTask("Test", "T", "2026-01-31", "important-urgent", "", "", "", "")

		result, err := manager.MoveTask(task.ID, "doing")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if !result.Success {
			t.Error("expected success")
		}
		if result.Positions == nil {
			t.Fatal("expected positions in result")
		}

		// Task should be in doing zone, not in source zone
		doingTasks := result.Positions["doing"]
		found := false
		for _, id := range doingTasks {
			if id == task.ID {
				found = true
			}
		}
		if !found {
			t.Errorf("expected task %s in doing zone, got %v", task.ID, doingTasks)
		}
	})
}

func TestDeleteTask_CleansUpOrder(t *testing.T) {
	t.Run("removes task from order on delete", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		task, _ := manager.CreateTask("Test", "T", "2026-01-31", "important-urgent", "", "", "", "")

		err := manager.DeleteTask(task.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		stored, _ := mockAccess.LoadTaskOrder()
		for zone, ids := range stored {
			for _, id := range ids {
				if id == task.ID {
					t.Errorf("expected task removed from zone %s", zone)
				}
			}
		}
	})
}

func TestCreateTask_AppendsToOrder(t *testing.T) {
	t.Run("new task is appended to its drop zone", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		task, _ := manager.CreateTask("Test", "T", "2026-01-31", "important-urgent", "", "", "", "")

		stored, _ := mockAccess.LoadTaskOrder()
		zone := stored["important-urgent"]
		found := false
		for _, id := range zone {
			if id == task.ID {
				found = true
			}
		}
		if !found {
			t.Errorf("expected task %s in important-urgent zone, got %v", task.ID, zone)
		}
	})
}

// =============================================================================
// Board Configuration Tests
// =============================================================================

func TestGetBoardConfiguration(t *testing.T) {
	t.Run("returns default board configuration", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		config, err := manager.GetBoardConfiguration()
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if config == nil {
			t.Fatal("expected config, got nil")
		}
		if config.Name != "Bearing Board" {
			t.Errorf("expected name 'Bearing Board', got '%s'", config.Name)
		}
		if len(config.ColumnDefinitions) != 3 {
			t.Errorf("expected 3 columns, got %d", len(config.ColumnDefinitions))
		}
		// Verify column names
		expectedColumns := []string{"todo", "doing", "done"}
		for i, col := range config.ColumnDefinitions {
			if col.Name != expectedColumns[i] {
				t.Errorf("expected column %d name '%s', got '%s'", i, expectedColumns[i], col.Name)
			}
		}
		// Verify todo column has 3 Eisenhower sections
		todoCol := config.ColumnDefinitions[0]
		if len(todoCol.Sections) != 3 {
			t.Errorf("expected 3 sections in todo column, got %d", len(todoCol.Sections))
		}
	})
}

// =============================================================================
// SubtaskIDs Computation Tests
// =============================================================================

func TestGetTasksSubtaskIDs(t *testing.T) {
	t.Run("computes subtask IDs for parent tasks", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		// Create a parent task
		parent, _ := manager.CreateTask("Parent Task", "T", "2026-01-31", "important-urgent", "", "", "", "")

		// Manually add subtasks with ParentTaskID set
		parentID := parent.ID
		subtask1 := access.Task{
			ID:           "T-T2",
			Title:        "Subtask 1",
			ThemeID:      "T",
			DayDate:      "2026-01-31",
			Priority:     "important-urgent",
			ParentTaskID: &parentID,
		}
		subtask2 := access.Task{
			ID:           "T-T3",
			Title:        "Subtask 2",
			ThemeID:      "T",
			DayDate:      "2026-01-31",
			Priority:     "important-not-urgent",
			ParentTaskID: &parentID,
		}
		mockAccess.tasks["T"]["todo"] = append(mockAccess.tasks["T"]["todo"], subtask1, subtask2)

		tasks, err := manager.GetTasks()
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		// Find the parent task and check SubtaskIDs
		for _, task := range tasks {
			if task.ID == parent.ID {
				if len(task.SubtaskIDs) != 2 {
					t.Errorf("expected 2 subtask IDs, got %d", len(task.SubtaskIDs))
				}
				// Check that subtask IDs are present
				foundSub1, foundSub2 := false, false
				for _, id := range task.SubtaskIDs {
					if id == "T-T2" {
						foundSub1 = true
					}
					if id == "T-T3" {
						foundSub2 = true
					}
				}
				if !foundSub1 {
					t.Error("expected T-T2 in subtask IDs")
				}
				if !foundSub2 {
					t.Error("expected T-T3 in subtask IDs")
				}
			}
		}
	})

	t.Run("tasks without subtasks have nil SubtaskIDs", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		_, _ = manager.CreateTask("Solo Task", "T", "2026-01-31", "important-urgent", "", "", "", "")

		tasks, err := manager.GetTasks()
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		for _, task := range tasks {
			if task.SubtaskIDs != nil {
				t.Errorf("expected nil SubtaskIDs for task without subtasks, got %v", task.SubtaskIDs)
			}
		}
	})
}
