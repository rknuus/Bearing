package managers

import (
	"testing"

	"github.com/rkn/bearing/internal/access"
)

// mockPlanAccess implements access.IPlanAccess for testing
type mockPlanAccess struct {
	themes []access.LifeTheme
	tasks  map[string]map[string][]access.Task // themeID -> status -> tasks
}

func newMockPlanAccess() *mockPlanAccess {
	return &mockPlanAccess{
		themes: []access.LifeTheme{
			{ID: "THEME-01", Name: "Test Theme", Color: "#3b82f6"},
		},
		tasks: make(map[string]map[string][]access.Task),
	}
}

func (m *mockPlanAccess) GetThemes() ([]access.LifeTheme, error) {
	return m.themes, nil
}

func (m *mockPlanAccess) SaveTheme(theme access.LifeTheme) error {
	for i, t := range m.themes {
		if t.ID == theme.ID {
			m.themes[i] = theme
			return nil
		}
	}
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

func TestCreateTask(t *testing.T) {
	t.Run("creates task with valid priority Q1", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		task, err := manager.CreateTask("Test Task", "THEME-01", "2026-01-31", "important-urgent")
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

		task, err := manager.CreateTask("Test Task", "THEME-01", "2026-01-31", "important-not-urgent")
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

		task, err := manager.CreateTask("Test Task", "THEME-01", "2026-01-31", "not-important-urgent")
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

		_, err := manager.CreateTask("Test Task", "THEME-01", "2026-01-31", "not-important-not-urgent")
		if err == nil {
			t.Fatal("expected error for Q4 priority")
		}
	})

	t.Run("rejects invalid priority", func(t *testing.T) {
		mockAccess := newMockPlanAccess()
		manager, _ := NewPlanningManager(mockAccess)

		_, err := manager.CreateTask("Test Task", "THEME-01", "2026-01-31", "invalid-priority")
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
		task, _ := manager.CreateTask("Test Task", "THEME-01", "2026-01-31", "important-urgent")

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
		manager.CreateTask("Task 1", "THEME-01", "2026-01-31", "important-urgent")
		manager.CreateTask("Task 2", "THEME-01", "2026-01-31", "important-not-urgent")

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
		task, _ := manager.CreateTask("Test Task", "THEME-01", "2026-01-31", "important-urgent")

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
