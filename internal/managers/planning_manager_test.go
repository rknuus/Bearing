package managers

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/rkn/bearing/internal/access"
)

// mockThemeAccess implements access.IThemeAccess for testing.
type mockThemeAccess struct {
	themes []access.LifeTheme
}

func newMockThemeAccess() *mockThemeAccess {
	return &mockThemeAccess{
		themes: []access.LifeTheme{
			{ID: "T", Name: "Test Theme", Color: "#3b82f6"},
		},
	}
}

func (m *mockThemeAccess) GetThemes() ([]access.LifeTheme, error) {
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

func (m *mockThemeAccess) SaveTheme(theme access.LifeTheme) error {
	for i, t := range m.themes {
		if t.ID == theme.ID {
			maxO := collectMockMaxObjNum(theme.ID, theme.Objectives)
			maxKR := collectMockMaxKRNum(theme.ID, theme.Objectives)
			theme.Objectives, _, _ = ensureMockObjectiveIDs(theme.ID, theme.ID, theme.Objectives, maxO, maxKR)
			m.themes[i] = theme
			return nil
		}
	}
	if theme.ID == "" {
		theme.ID = SuggestAbbreviation(theme.Name, m.themes)
	}
	maxO := collectMockMaxObjNum(theme.ID, theme.Objectives)
	maxKR := collectMockMaxKRNum(theme.ID, theme.Objectives)
	theme.Objectives, _, _ = ensureMockObjectiveIDs(theme.ID, theme.ID, theme.Objectives, maxO, maxKR)
	m.themes = append(m.themes, theme)
	return nil
}

func (m *mockThemeAccess) DeleteTheme(id string) error {
	for i, t := range m.themes {
		if t.ID == id {
			m.themes = append(m.themes[:i], m.themes[i+1:]...)
			return nil
		}
	}
	return nil
}

// mockTaskAccess implements access.ITaskAccess for testing.
type mockTaskAccess struct {
	mu            sync.Mutex
	tasks         map[string][]access.Task
	taskOrder     map[string][]string
	archivedOrder []string
	nextTaskNum   int
	boardConfig   *access.BoardConfiguration
}

func newMockTaskAccess() *mockTaskAccess {
	return &mockTaskAccess{
		tasks: make(map[string][]access.Task),
	}
}

func (m *mockTaskAccess) GetTasksByTheme(themeID string) ([]access.Task, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var result []access.Task
	for _, tasks := range m.tasks {
		for _, t := range tasks {
			if t.ThemeID == themeID {
				result = append(result, t)
			}
		}
	}
	return result, nil
}

func (m *mockTaskAccess) GetTasksByStatus(status string) ([]access.Task, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if tasks, ok := m.tasks[status]; ok {
		return tasks, nil
	}
	return []access.Task{}, nil
}

func (m *mockTaskAccess) WriteTask(task access.Task) error {
	return m.SaveTask(task)
}

func (m *mockTaskAccess) SaveTask(task access.Task) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	status := "todo"
	for s, tasks := range m.tasks {
		for i, t := range tasks {
			if t.ID == task.ID {
				m.tasks[s][i] = task
				return nil
			}
		}
	}
	if task.ID == "" {
		m.nextTaskNum++
		task.ID = fmt.Sprintf("%s-T%d", task.ThemeID, m.nextTaskNum)
	}
	m.tasks[status] = append(m.tasks[status], task)
	return nil
}

func (m *mockTaskAccess) SaveTaskWithOrder(task access.Task, dropZone string) (*access.Task, error) {
	if err := m.SaveTask(task); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	tasks := m.tasks["todo"]
	saved := tasks[len(tasks)-1]
	if m.taskOrder == nil {
		m.taskOrder = make(map[string][]string)
	}
	m.taskOrder[dropZone] = append(m.taskOrder[dropZone], saved.ID)
	return &saved, nil
}

func (m *mockTaskAccess) UpdateTaskWithOrderMove(task access.Task, oldZone, newZone string) error {
	if err := m.SaveTask(task); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.taskOrder == nil {
		m.taskOrder = make(map[string][]string)
	}
	if ids, ok := m.taskOrder[oldZone]; ok {
		filtered := make([]string, 0, len(ids))
		for _, id := range ids {
			if id != task.ID {
				filtered = append(filtered, id)
			}
		}
		m.taskOrder[oldZone] = filtered
	}
	m.taskOrder[newZone] = append(m.taskOrder[newZone], task.ID)
	return nil
}

func (m *mockTaskAccess) MoveTask(taskID, newStatus string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for status, tasks := range m.tasks {
		for i, task := range tasks {
			if task.ID == taskID {
				m.tasks[status] = append(tasks[:i], tasks[i+1:]...)
				m.tasks[newStatus] = append(m.tasks[newStatus], task)
				return nil
			}
		}
	}
	return nil
}

func (m *mockTaskAccess) WriteMoveTask(taskID, newStatus string) ([]string, error) {
	return nil, m.MoveTask(taskID, newStatus)
}

func (m *mockTaskAccess) ArchiveTask(taskID string) error {
	return m.MoveTask(taskID, string(access.TaskStatusArchived))
}

func (m *mockTaskAccess) WriteArchiveTask(taskID string) ([]string, error) {
	return nil, m.ArchiveTask(taskID)
}

func (m *mockTaskAccess) RestoreTask(taskID string) error {
	return m.MoveTask(taskID, string(access.TaskStatusDone))
}

func (m *mockTaskAccess) WriteRestoreTask(taskID string) ([]string, error) {
	return nil, m.RestoreTask(taskID)
}

func (m *mockTaskAccess) DeleteTask(taskID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for status, tasks := range m.tasks {
		for i, task := range tasks {
			if task.ID == taskID {
				m.tasks[status] = append(tasks[:i], tasks[i+1:]...)
				return nil
			}
		}
	}
	return nil
}

func (m *mockTaskAccess) DeleteTaskWithOrder(taskID string) error {
	if err := m.DeleteTask(taskID); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	for zone, ids := range m.taskOrder {
		filtered := make([]string, 0, len(ids))
		for _, id := range ids {
			if id != taskID {
				filtered = append(filtered, id)
			}
		}
		if len(filtered) != len(ids) {
			m.taskOrder[zone] = filtered
		}
	}
	return nil
}

func (m *mockTaskAccess) LoadTaskOrder() (map[string][]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.taskOrder == nil {
		return make(map[string][]string), nil
	}
	result := make(map[string][]string, len(m.taskOrder))
	for k, v := range m.taskOrder {
		result[k] = append([]string{}, v...)
	}
	return result, nil
}

func (m *mockTaskAccess) SaveTaskOrder(order map[string][]string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.taskOrder = make(map[string][]string, len(order))
	for k, v := range order {
		m.taskOrder[k] = append([]string{}, v...)
	}
	return nil
}

func (m *mockTaskAccess) GetBoardConfiguration() (*access.BoardConfiguration, error) {
	if m.boardConfig != nil {
		return m.boardConfig, nil
	}
	return nil, nil
}

func (m *mockTaskAccess) SaveBoardConfiguration(config *access.BoardConfiguration) error {
	m.boardConfig = config
	return nil
}

func (m *mockTaskAccess) EnsureStatusDirectory(slug string) error   { return nil }
func (m *mockTaskAccess) RemoveStatusDirectory(slug string) error   { return nil }
func (m *mockTaskAccess) RenameStatusDirectory(oldSlug, newSlug string) error { return nil }
func (m *mockTaskAccess) UpdateTaskStatusField(dirSlug, newStatus string) ([]string, error) { return nil, nil }
func (m *mockTaskAccess) WriteTaskOrder(order map[string][]string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.taskOrder = order
	return nil
}
func (m *mockTaskAccess) BoardConfigFilePath() string        { return "board_config.json" }
func (m *mockTaskAccess) TaskOrderFilePath() string          { return "task_order.json" }
func (m *mockTaskAccess) TaskDirPath(status string) string   { return status }
func (m *mockTaskAccess) CommitFiles(paths []string, message string) error { return nil }
func (m *mockTaskAccess) CommitAll(message string) error     { return nil }
func (m *mockTaskAccess) ArchivedOrderFilePath() string { return "archived_order.json" }
func (m *mockTaskAccess) LoadArchivedOrder() ([]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.archivedOrder == nil {
		return []string{}, nil
	}
	return append([]string{}, m.archivedOrder...), nil
}
func (m *mockTaskAccess) WriteArchivedOrder(order []string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.archivedOrder = append([]string{}, order...)
	return nil
}
func (m *mockTaskAccess) SaveArchivedOrder(order []string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.archivedOrder = append([]string{}, order...)
	return nil
}

// mockCalendarAccess implements access.ICalendarAccess for testing.
type mockCalendarAccess struct{}

func (m *mockCalendarAccess) GetDayFocus(date string) (*access.DayFocus, error) { return nil, nil }
func (m *mockCalendarAccess) SaveDayFocus(day access.DayFocus) error            { return nil }
func (m *mockCalendarAccess) GetYearFocus(year int) ([]access.DayFocus, error)  { return nil, nil }

// mockVisionAccess implements access.IVisionAccess for testing.
type mockVisionAccess struct {
	vision *access.PersonalVision
}

func (m *mockVisionAccess) LoadVision() (*access.PersonalVision, error) {
	if m.vision == nil {
		return &access.PersonalVision{}, nil
	}
	return m.vision, nil
}

func (m *mockVisionAccess) SaveVision(vision *access.PersonalVision) error {
	m.vision = vision
	return nil
}

// mockUIStateAccess implements access.IUIStateAccess for testing.
type mockUIStateAccess struct{}

func (m *mockUIStateAccess) LoadNavigationContext() (*access.NavigationContext, error) {
	return nil, nil
}

func (m *mockUIStateAccess) SaveNavigationContext(ctx access.NavigationContext) error {
	return nil
}

func (m *mockUIStateAccess) LoadTaskDrafts() (json.RawMessage, error) {
	return nil, nil
}

func (m *mockUIStateAccess) SaveTaskDrafts(data json.RawMessage) error {
	return nil
}

// newMockManger creates a PlanningManager with all mock dependencies for testing convenience.
func newMockManager() (*PlanningManager, *mockThemeAccess, *mockTaskAccess) {
	ta := newMockThemeAccess()
	ka := newMockTaskAccess()
	pm, _ := NewPlanningManager(ta, ka, &mockCalendarAccess{}, &mockVisionAccess{}, &mockUIStateAccess{})
	return pm, ta, ka
}

// --- Test helper wrappers around behavioral API ---

// testCreateObjective calls Establish to create an objective.
func testCreateObjective(m *PlanningManager, parentId, title string) (*Objective, error) {
	res, err := m.Establish(EstablishRequest{GoalType: GoalTypeObjective, ParentID: parentId, Title: title})
	if err != nil {
		return nil, err
	}
	return res.Objective, nil
}

// testCreateKeyResult calls Establish to create a key result.
func testCreateKeyResult(m *PlanningManager, parentObjectiveId, description string, startValue, targetValue int) (*KeyResult, error) {
	res, err := m.Establish(EstablishRequest{
		GoalType:    GoalTypeKeyResult,
		ParentID:    parentObjectiveId,
		Description: description,
		StartValue:  &startValue,
		TargetValue: &targetValue,
	})
	if err != nil {
		return nil, err
	}
	return res.KeyResult, nil
}

// testAddRoutine calls Establish to create a routine.
func testAddRoutine(m *PlanningManager, themeId, description string, targetValue int, targetType, unit string) (*Routine, error) {
	res, err := m.Establish(EstablishRequest{
		GoalType:    GoalTypeRoutine,
		ParentID:    themeId,
		Description: description,
		TargetValue: &targetValue,
		TargetType:  targetType,
		Unit:        unit,
	})
	if err != nil {
		return nil, err
	}
	return res.Routine, nil
}

// testUpdateTheme calls Revise to update a theme's name and/or color.
func testUpdateTheme(m *PlanningManager, theme LifeTheme) error {
	return m.Revise(ReviseRequest{GoalID: theme.ID, Name: &theme.Name, Color: &theme.Color})
}

// testUpdateObjective calls Revise to update an objective's title and tags.
func testUpdateObjective(m *PlanningManager, objectiveId, title string, tags []string) error {
	req := ReviseRequest{GoalID: objectiveId, Title: &title}
	if tags != nil {
		req.Tags = &tags
	}
	return m.Revise(req)
}

// testUpdateKeyResult calls Revise to update a key result's description.
func testUpdateKeyResult(m *PlanningManager, keyResultId, description string) error {
	return m.Revise(ReviseRequest{GoalID: keyResultId, Description: &description})
}

// testUpdateRoutine calls Revise to update a routine's fields.
func testUpdateRoutine(m *PlanningManager, routineId, description string, currentValue, targetValue int, targetType, unit string) error {
	// For currentValue, use RecordProgress; for other fields, use Revise.
	err := m.Revise(ReviseRequest{
		GoalID:      routineId,
		Description: &description,
		TargetValue: &targetValue,
		TargetType:  &targetType,
		Unit:        &unit,
	})
	if err != nil {
		return err
	}
	return m.RecordProgress(routineId, currentValue)
}

// assertTaskOrderConsistency verifies that the task order map is fully consistent
// with the active (non-archived) tasks on disk: every active task appears in
// exactly one zone under the correct key, there are no stale/orphaned IDs, and
// no duplicates across zones. Archived tasks are excluded — they are intentionally
// removed from task_order.json when archived.
func assertTaskOrderConsistency(t *testing.T, manager *PlanningManager) {
	t.Helper()

	// 1. Load board configuration to get column slugs and todoSlug
	boardConfig, err := manager.getAccessBoardConfig()
	if err != nil || boardConfig == nil {
		boardConfig = defaultAccessBoardConfiguration()
	}
	tSlug := manager.ruleEngine.TodoSlugFromColumns(toColumnInfos(boardConfig.ColumnDefinitions))

	// 2. Load task order map
	orderMap, err := manager.taskAccess.LoadTaskOrder()
	if err != nil {
		t.Errorf("assertTaskOrderConsistency: failed to load task order: %v", err)
		return
	}

	// 3. Build expected zone mapping: taskID -> expectedZone (active columns only)
	expectedZone := make(map[string]string)
	for _, col := range boardConfig.ColumnDefinitions {
		tasks, err := manager.taskAccess.GetTasksByStatus(col.Name)
		if err != nil {
			continue
		}
		for _, task := range tasks {
			zone := manager.ruleEngine.DropZoneForTask(col.Name, task.Priority, tSlug)
			expectedZone[task.ID] = zone
		}
	}

	// 4. Check: every task on disk appears in exactly one zone under the correct key
	for taskID, expZone := range expectedZone {
		foundInZone := ""
		for zone, ids := range orderMap {
			for _, id := range ids {
				if id == taskID {
					if foundInZone != "" {
						t.Errorf("assertTaskOrderConsistency: task %s found in multiple zones: %s and %s", taskID, foundInZone, zone)
					}
					foundInZone = zone
				}
			}
		}
		if foundInZone == "" {
			t.Errorf("assertTaskOrderConsistency: task %s (expected zone %s) not found in any zone", taskID, expZone)
		} else if foundInZone != expZone {
			t.Errorf("assertTaskOrderConsistency: task %s in zone %s, expected zone %s", taskID, foundInZone, expZone)
		}
	}

	// 5. Check: no stale/orphaned IDs in orderMap
	for zone, ids := range orderMap {
		for _, id := range ids {
			expZone, exists := expectedZone[id]
			if !exists {
				t.Errorf("assertTaskOrderConsistency: orphaned ID %s in zone %s (task does not exist on disk)", id, zone)
			} else if expZone != zone {
				t.Errorf("assertTaskOrderConsistency: stale ID %s in zone %s, expected zone %s", id, zone, expZone)
			}
		}
	}

	// 6. Check: no duplicates across zones
	seen := make(map[string]string)
	for zone, ids := range orderMap {
		for _, id := range ids {
			if prevZone, dup := seen[id]; dup {
				t.Errorf("assertTaskOrderConsistency: duplicate ID %s in zones %s and %s", id, prevZone, zone)
			}
			seen[id] = zone
		}
	}
}

// findManagerObjectiveByID walks the manager Objective tree and returns a pointer to the objective with the given ID.
func findManagerObjectiveByID(objectives []Objective, id string) *Objective {
	for i := range objectives {
		if objectives[i].ID == id {
			return &objectives[i]
		}
		if found := findManagerObjectiveByID(objectives[i].Objectives, id); found != nil {
			return found
		}
	}
	return nil
}

// findKeyResultByID walks the manager Objective tree and returns a pointer to the key result with the given ID.
func findKeyResultByID(objectives []Objective, id string) *KeyResult {
	for i := range objectives {
		for j := range objectives[i].KeyResults {
			if objectives[i].KeyResults[j].ID == id {
				return &objectives[i].KeyResults[j]
			}
		}
		if found := findKeyResultByID(objectives[i].Objectives, id); found != nil {
			return found
		}
	}
	return nil
}

func TestNewPlanningManager(t *testing.T) {
	t.Run("creates manager with valid access", func(t *testing.T) {
		manager, err := NewPlanningManager(newMockThemeAccess(), newMockTaskAccess(), &mockCalendarAccess{}, &mockVisionAccess{}, &mockUIStateAccess{})
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if manager == nil {
			t.Fatal("expected manager, got nil")
		}
	})

	t.Run("returns error with nil theme access", func(t *testing.T) {
		_, err := NewPlanningManager(nil, newMockTaskAccess(), &mockCalendarAccess{}, &mockVisionAccess{}, &mockUIStateAccess{})
		if err == nil {
			t.Fatal("expected error for nil theme access")
		}
	})

	t.Run("returns error with nil ui state access", func(t *testing.T) {
		_, err := NewPlanningManager(newMockThemeAccess(), newMockTaskAccess(), &mockCalendarAccess{}, &mockVisionAccess{}, nil)
		if err == nil {
			t.Fatal("expected error for nil ui state access")
		}
	})
}

// =============================================================================
// Theme Update Tests
// =============================================================================

func TestUpdateTheme(t *testing.T) {
	t.Run("updates theme name and color", func(t *testing.T) {
		manager, _, _ := newMockManager()

		themes, _ := manager.GetHierarchy()
		theme := themes[0]
		theme.Name = "Updated Name"
		theme.Color = "#ef4444"

		err := testUpdateTheme(manager,theme)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ = manager.GetHierarchy()
		if themes[0].Name != "Updated Name" {
			t.Errorf("expected name 'Updated Name', got '%s'", themes[0].Name)
		}
		if themes[0].Color != "#ef4444" {
			t.Errorf("expected color '#ef4444', got '%s'", themes[0].Color)
		}
	})

	t.Run("preserves KR progress fields through Revise", func(t *testing.T) {
		manager, _, _ := newMockManager()

		// Create objective with KR (start=0, target=12)
		obj, _ := testCreateObjective(manager, "T", "Read More")
		kr, _ := testCreateKeyResult(manager, obj.ID, "Read 12 books", 0, 12)

		// Set progress to 5
		err := manager.RecordProgress(kr.ID, 5)
		if err != nil {
			t.Fatalf("expected no error setting progress, got %v", err)
		}

		// Now revise the KR (modify start=2, target=20)
		startVal := 2
		targetVal := 20
		err = manager.Revise(ReviseRequest{GoalID: kr.ID, StartValue: &startVal, TargetValue: &targetVal})
		if err != nil {
			t.Fatalf("expected no error revising KR, got %v", err)
		}

		// Verify all three fields survive
		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
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
		manager, _, _ := newMockManager()

		err := testUpdateTheme(manager,LifeTheme{ID: "", Name: "Test"})
		if err == nil {
			t.Fatal("expected error for empty theme ID")
		}
	})

	t.Run("preserves objective hierarchy through update", func(t *testing.T) {
		manager, _, _ := newMockManager()

		// Build nested structure: theme -> obj1 -> obj2 -> kr
		obj1, _ := testCreateObjective(manager,"T", "Level 1")
		obj2, _ := testCreateObjective(manager,obj1.ID, "Level 2")
		kr, _ := testCreateKeyResult(manager,obj2.ID, "Deep KR", 1, 10)

		// Update theme name only
		themes, _ := manager.GetHierarchy()
		theme := themes[0]
		theme.Name = "Renamed Theme"

		err := testUpdateTheme(manager,theme)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		// Verify entire hierarchy survived
		themes, _ = manager.GetHierarchy()
		if themes[0].Name != "Renamed Theme" {
			t.Errorf("expected 'Renamed Theme', got '%s'", themes[0].Name)
		}
		l1 := findManagerObjectiveByID(themes[0].Objectives, obj1.ID)
		if l1 == nil {
			t.Fatal("expected Level 1 objective to survive")
		}
		l2 := findManagerObjectiveByID(themes[0].Objectives, obj2.ID)
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
		manager, _, _ := newMockManager()

		obj, err := testCreateObjective(manager,"T", "My Objective")
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
		manager, _, _ := newMockManager()

		parent, err := testCreateObjective(manager,"T", "Parent Objective")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		child, err := testCreateObjective(manager,parent.ID, "Child Objective")
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
		manager, _, _ := newMockManager()

		l1, _ := testCreateObjective(manager,"T", "Level 1")
		l2, _ := testCreateObjective(manager,l1.ID, "Level 2")
		l3, err := testCreateObjective(manager,l2.ID, "Level 3")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if l3.ID != "T-O3" {
			t.Errorf("expected deeply nested ID, got '%s'", l3.ID)
		}
	})

	t.Run("returns error for empty parentId", func(t *testing.T) {
		manager, _, _ := newMockManager()

		_, err := testCreateObjective(manager,"", "Title")
		if err == nil {
			t.Fatal("expected error for empty parentId")
		}
	})

	t.Run("returns error for empty title", func(t *testing.T) {
		manager, _, _ := newMockManager()

		_, err := testCreateObjective(manager,"T", "")
		if err == nil {
			t.Fatal("expected error for empty title")
		}
	})

	t.Run("returns error for non-existent parent", func(t *testing.T) {
		manager, _, _ := newMockManager()

		_, err := testCreateObjective(manager,"NONEXISTENT", "Title")
		if err == nil {
			t.Fatal("expected error for non-existent parent")
		}
	})
}

func TestUpdateObjective(t *testing.T) {
	t.Run("updates objective title", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Original")
		err := testUpdateObjective(manager,obj.ID, "Updated", nil)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		// Verify the update
		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if found == nil {
			t.Fatal("objective not found after update")
		}
		if found.Title != "Updated" {
			t.Errorf("expected title 'Updated', got '%s'", found.Title)
		}
	})

	t.Run("updates nested objective title", func(t *testing.T) {
		manager, _, _ := newMockManager()

		parent, _ := testCreateObjective(manager,"T", "Parent")
		child, _ := testCreateObjective(manager,parent.ID, "Child")

		err := testUpdateObjective(manager,child.ID, "Updated Child", nil)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, child.ID)
		if found == nil {
			t.Fatal("nested objective not found after update")
		}
		if found.Title != "Updated Child" {
			t.Errorf("expected title 'Updated Child', got '%s'", found.Title)
		}
	})

	t.Run("returns error for empty objectiveId", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := testUpdateObjective(manager,"", "Title", nil)
		if err == nil {
			t.Fatal("expected error for empty objectiveId")
		}
	})

	t.Run("returns error for non-existent objective", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := testUpdateObjective(manager,"NONEXISTENT", "Title", nil)
		if err == nil {
			t.Fatal("expected error for non-existent objective")
		}
	})

	t.Run("sets tags on objective", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Tagged")
		err := testUpdateObjective(manager,obj.ID, "Tagged", []string{"alpha", "beta"})
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if found == nil {
			t.Fatal("objective not found after update")
		}
		if !slices.Equal(found.Tags, []string{"alpha", "beta"}) {
			t.Errorf("expected tags [alpha beta], got %v", found.Tags)
		}
	})

	t.Run("tag round-trip persistence", func(t *testing.T) {
		manager, mockThemes, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Persist Tags")
		tags := []string{"work", "health"}
		err := testUpdateObjective(manager,obj.ID, "Persist Tags", tags)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		// Re-read from access layer to verify persistence
		accessThemes, _ := mockThemes.GetThemes()
		found := findObjectiveByID(accessThemes[0].Objectives, obj.ID)
		if found == nil {
			t.Fatal("objective not found in access layer")
		}
		if !slices.Equal(found.Tags, []string{"work", "health"}) {
			t.Errorf("expected tags [work health], got %v", found.Tags)
		}
	})

	t.Run("deduplicates tags case-insensitively", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Dedup Tags")
		err := testUpdateObjective(manager,obj.ID, "Dedup Tags", []string{"Work", "work", "WORK", "health"})
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if found == nil {
			t.Fatal("objective not found after update")
		}
		// Preserve first occurrence's casing
		if !slices.Equal(found.Tags, []string{"Work", "health"}) {
			t.Errorf("expected tags [Work health], got %v", found.Tags)
		}
	})

	t.Run("rejects empty and whitespace-only tags", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Empty Tags")
		err := testUpdateObjective(manager,obj.ID, "Empty Tags", []string{"", "  ", "valid", "  ", ""})
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if found == nil {
			t.Fatal("objective not found after update")
		}
		if !slices.Equal(found.Tags, []string{"valid"}) {
			t.Errorf("expected tags [valid], got %v", found.Tags)
		}
	})

	t.Run("trims whitespace from tags", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Trim Tags")
		err := testUpdateObjective(manager,obj.ID, "Trim Tags", []string{"  alpha  ", " beta "})
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if found == nil {
			t.Fatal("objective not found after update")
		}
		if !slices.Equal(found.Tags, []string{"alpha", "beta"}) {
			t.Errorf("expected tags [alpha beta], got %v", found.Tags)
		}
	})

	t.Run("nil tags results in empty tags", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Nil Tags")
		err := testUpdateObjective(manager,obj.ID, "Nil Tags", nil)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if found == nil {
			t.Fatal("objective not found after update")
		}
		if len(found.Tags) != 0 {
			t.Errorf("expected empty tags, got %v", found.Tags)
		}
	})
}

func TestDeleteObjective(t *testing.T) {
	t.Run("deletes objective from theme", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "To Delete")
		err := manager.Dismiss(obj.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		if len(themes[0].Objectives) != 0 {
			t.Errorf("expected 0 objectives after delete, got %d", len(themes[0].Objectives))
		}
	})

	t.Run("deletes nested objective and its children", func(t *testing.T) {
		manager, _, _ := newMockManager()

		parent, _ := testCreateObjective(manager,"T", "Parent")
		_, _ = testCreateObjective(manager,parent.ID, "Child")

		// Delete the parent -- child should be gone too
		err := manager.Dismiss(parent.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		if len(themes[0].Objectives) != 0 {
			t.Errorf("expected 0 objectives after deleting parent, got %d", len(themes[0].Objectives))
		}
	})

	t.Run("deletes middle objective in 3-level hierarchy and cascades grandchildren", func(t *testing.T) {
		manager, _, _ := newMockManager()

		l1, _ := testCreateObjective(manager,"T", "Level 1")
		l2, _ := testCreateObjective(manager,l1.ID, "Level 2")
		l3, _ := testCreateObjective(manager,l2.ID, "Level 3")
		_, _ = testCreateKeyResult(manager,l3.ID, "Deep KR", 0, 0)

		// Delete the middle objective (Level 2) -- Level 3 and its KR should be gone too
		err := manager.Dismiss(l2.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		l1After := findManagerObjectiveByID(themes[0].Objectives, l1.ID)
		if l1After == nil {
			t.Fatal("expected Level 1 to still exist")
		}
		if len(l1After.Objectives) != 0 {
			t.Errorf("expected 0 children after deleting middle, got %d", len(l1After.Objectives))
		}

		// Verify the grandchild is truly gone
		l3After := findManagerObjectiveByID(themes[0].Objectives, l3.ID)
		if l3After != nil {
			t.Error("expected Level 3 to be gone after deleting Level 2")
		}
	})

	t.Run("deletes child without affecting parent", func(t *testing.T) {
		manager, _, _ := newMockManager()

		parent, _ := testCreateObjective(manager,"T", "Parent")
		child, _ := testCreateObjective(manager,parent.ID, "Child")

		err := manager.Dismiss(child.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
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
		manager, _, _ := newMockManager()

		err := manager.Dismiss("")
		if err == nil {
			t.Fatal("expected error for empty objectiveId")
		}
	})

	t.Run("returns error for non-existent objective", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := manager.Dismiss("FAKE-O99")
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
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		kr, err := testCreateKeyResult(manager,obj.ID, "My KR", 0, 0)
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
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		kr, err := testCreateKeyResult(manager,obj.ID, "Read 12 books", 0, 12)
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
		manager, _, _ := newMockManager()

		parent, _ := testCreateObjective(manager,"T", "Parent")
		child, _ := testCreateObjective(manager,parent.ID, "Child")
		kr, err := testCreateKeyResult(manager,child.ID, "Nested KR", 0, 0)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if kr.ID != "T-KR1" {
			t.Errorf("expected nested KR ID, got '%s'", kr.ID)
		}
	})

	t.Run("creates key result on intermediate objective that has children", func(t *testing.T) {
		manager, _, _ := newMockManager()

		parent, _ := testCreateObjective(manager,"T", "Parent")
		_, _ = testCreateObjective(manager,parent.ID, "Child")

		// Add KR to the parent (intermediate node with children)
		kr, err := testCreateKeyResult(manager,parent.ID, "Intermediate KR", 0, 0)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if kr.ID != "T-KR1" {
			t.Errorf("expected ID 'T-KR1', got '%s'", kr.ID)
		}

		// Verify the parent still has both children and the key result
		themes, _ := manager.GetHierarchy()
		parentObj := findManagerObjectiveByID(themes[0].Objectives, parent.ID)
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
		manager, _, _ := newMockManager()

		_, err := testCreateKeyResult(manager,"", "Description", 0, 0)
		if err == nil {
			t.Fatal("expected error for empty parentObjectiveId")
		}
	})

	t.Run("returns error for non-existent objective", func(t *testing.T) {
		manager, _, _ := newMockManager()

		_, err := testCreateKeyResult(manager,"NONEXISTENT", "Description", 0, 0)
		if err == nil {
			t.Fatal("expected error for non-existent objective")
		}
	})

	t.Run("preserves custom start/target", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		kr, err := testCreateKeyResult(manager,obj.ID, "Read 12 books", 2, 14)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if kr.StartValue != 2 {
			t.Errorf("expected startValue 2, got %d", kr.StartValue)
		}
		if kr.TargetValue != 14 {
			t.Errorf("expected targetValue 14, got %d", kr.TargetValue)
		}
	})

	t.Run("default start/target values", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		kr, err := testCreateKeyResult(manager,obj.ID, "Read 12 books", 0, 12)
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

	t.Run("start greater than target returns error", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		_, err := testCreateKeyResult(manager,obj.ID, "Invalid", 10, 5)
		if err == nil {
			t.Fatal("expected error when start > target")
		}
		if !strings.Contains(err.Error(), "cannot exceed") {
			t.Errorf("expected error to contain 'cannot exceed', got: %s", err.Error())
		}
	})

	t.Run("start equals target is allowed", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		_, err := testCreateKeyResult(manager,obj.ID, "Valid", 5, 5)
		if err != nil {
			t.Fatalf("expected no error when start == target, got %v", err)
		}
	})
}

func TestUpdateKeyResult(t *testing.T) {
	t.Run("updates key result description", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		kr, _ := testCreateKeyResult(manager,obj.ID, "Original", 0, 0)

		err := testUpdateKeyResult(manager,kr.ID, "Updated")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if found.KeyResults[0].Description != "Updated" {
			t.Errorf("expected description 'Updated', got '%s'", found.KeyResults[0].Description)
		}
	})

	t.Run("updates key result under nested objective", func(t *testing.T) {
		manager, _, _ := newMockManager()

		parent, _ := testCreateObjective(manager,"T", "Parent")
		child, _ := testCreateObjective(manager,parent.ID, "Child")
		kr, _ := testCreateKeyResult(manager,child.ID, "Original", 0, 0)

		err := testUpdateKeyResult(manager,kr.ID, "Updated Nested")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		childObj := findManagerObjectiveByID(themes[0].Objectives, child.ID)
		if childObj.KeyResults[0].Description != "Updated Nested" {
			t.Errorf("expected 'Updated Nested', got '%s'", childObj.KeyResults[0].Description)
		}
	})

	t.Run("returns error for empty keyResultId", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := testUpdateKeyResult(manager,"", "Description")
		if err == nil {
			t.Fatal("expected error for empty keyResultId")
		}
	})

	t.Run("returns error for non-existent key result", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := testUpdateKeyResult(manager,"NONEXISTENT", "Description")
		if err == nil {
			t.Fatal("expected error for non-existent key result")
		}
	})
}

func TestUpdateKeyResultProgress(t *testing.T) {
	t.Run("updates key result currentValue", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		kr, _ := testCreateKeyResult(manager,obj.ID, "Read 12 books", 0, 0)

		err := manager.RecordProgress(kr.ID, 5)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if found.KeyResults[0].CurrentValue != 5 {
			t.Errorf("expected currentValue 5, got %d", found.KeyResults[0].CurrentValue)
		}
	})

	t.Run("updates key result under nested objective", func(t *testing.T) {
		manager, _, _ := newMockManager()

		parent, _ := testCreateObjective(manager,"T", "Parent")
		child, _ := testCreateObjective(manager,parent.ID, "Child")
		kr, _ := testCreateKeyResult(manager,child.ID, "Nested KR", 0, 0)

		err := manager.RecordProgress(kr.ID, 10)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		childObj := findManagerObjectiveByID(themes[0].Objectives, child.ID)
		if childObj.KeyResults[0].CurrentValue != 10 {
			t.Errorf("expected currentValue 10, got %d", childObj.KeyResults[0].CurrentValue)
		}
	})

	t.Run("returns error for empty keyResultId", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := manager.RecordProgress("", 5)
		if err == nil {
			t.Fatal("expected error for empty keyResultId")
		}
	})

	t.Run("returns error for non-existent key result", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := manager.RecordProgress("NONEXISTENT", 5)
		if err == nil {
			t.Fatal("expected error for non-existent key result")
		}
	})
}

func TestDeleteKeyResult(t *testing.T) {
	t.Run("deletes key result", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		kr, _ := testCreateKeyResult(manager,obj.ID, "To Delete", 0, 0)

		err := manager.Dismiss(kr.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if len(found.KeyResults) != 0 {
			t.Errorf("expected 0 key results after delete, got %d", len(found.KeyResults))
		}
	})

	t.Run("deletes key result under nested objective", func(t *testing.T) {
		manager, _, _ := newMockManager()

		parent, _ := testCreateObjective(manager,"T", "Parent")
		child, _ := testCreateObjective(manager,parent.ID, "Child")
		kr, _ := testCreateKeyResult(manager,child.ID, "Nested KR", 0, 0)

		err := manager.Dismiss(kr.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		childObj := findManagerObjectiveByID(themes[0].Objectives, child.ID)
		if len(childObj.KeyResults) != 0 {
			t.Errorf("expected 0 key results after delete, got %d", len(childObj.KeyResults))
		}
	})

	t.Run("returns error for empty keyResultId", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := manager.Dismiss("")
		if err == nil {
			t.Fatal("expected error for empty keyResultId")
		}
	})

	t.Run("returns error for non-existent key result", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := manager.Dismiss("FAKE-KR99")
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
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		kr, _ := testCreateKeyResult(manager,obj.ID, "KR", 0, 10)

		err := manager.SetKeyResultStatus(kr.ID, "completed")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if found.KeyResults[0].Status != "completed" {
			t.Errorf("expected status 'completed', got '%s'", found.KeyResults[0].Status)
		}
	})

	t.Run("archives a completed key result", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		kr, _ := testCreateKeyResult(manager,obj.ID, "KR", 0, 10)
		_ = manager.SetKeyResultStatus(kr.ID, "completed")

		err := manager.SetKeyResultStatus(kr.ID, "archived")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if found.KeyResults[0].Status != "archived" {
			t.Errorf("expected status 'archived', got '%s'", found.KeyResults[0].Status)
		}
	})

	t.Run("reopens a completed key result", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		kr, _ := testCreateKeyResult(manager,obj.ID, "KR", 0, 10)
		_ = manager.SetKeyResultStatus(kr.ID, "completed")

		err := manager.SetKeyResultStatus(kr.ID, "active")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if found.KeyResults[0].Status != "active" {
			t.Errorf("expected status 'active', got '%s'", found.KeyResults[0].Status)
		}
	})

	t.Run("reopens an archived key result", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		kr, _ := testCreateKeyResult(manager,obj.ID, "KR", 0, 10)
		_ = manager.SetKeyResultStatus(kr.ID, "completed")
		_ = manager.SetKeyResultStatus(kr.ID, "archived")

		err := manager.SetKeyResultStatus(kr.ID, "active")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if found.KeyResults[0].Status != "active" {
			t.Errorf("expected status 'active', got '%s'", found.KeyResults[0].Status)
		}
	})

	t.Run("blocks active to archived", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		kr, _ := testCreateKeyResult(manager,obj.ID, "KR", 0, 10)

		err := manager.SetKeyResultStatus(kr.ID, "archived")
		if err == nil {
			t.Fatal("expected error for active->archived transition")
		}
	})

	t.Run("returns error for invalid status", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		kr, _ := testCreateKeyResult(manager,obj.ID, "KR", 0, 10)

		err := manager.SetKeyResultStatus(kr.ID, "invalid")
		if err == nil {
			t.Fatal("expected error for invalid status")
		}
	})

	t.Run("returns error for empty keyResultId", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := manager.SetKeyResultStatus("", "completed")
		if err == nil {
			t.Fatal("expected error for empty keyResultId")
		}
	})

	t.Run("returns error for non-existent key result", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := manager.SetKeyResultStatus("NONEXISTENT", "completed")
		if err == nil {
			t.Fatal("expected error for non-existent key result")
		}
	})
}

func TestSetObjectiveStatus(t *testing.T) {
	t.Run("completes objective when all children are completed", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		kr1, _ := testCreateKeyResult(manager,obj.ID, "KR1", 0, 1)
		kr2, _ := testCreateKeyResult(manager,obj.ID, "KR2", 0, 10)

		// Complete both KRs
		_ = manager.SetKeyResultStatus(kr1.ID, "completed")
		_ = manager.SetKeyResultStatus(kr2.ID, "completed")

		// Now complete the objective
		err := manager.SetObjectiveStatus(obj.ID, "completed")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if found.Status != "completed" {
			t.Errorf("expected status 'completed', got '%s'", found.Status)
		}
	})

	t.Run("completes objective when children are mix of completed and archived", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		kr1, _ := testCreateKeyResult(manager,obj.ID, "KR1", 0, 1)
		kr2, _ := testCreateKeyResult(manager,obj.ID, "KR2", 0, 10)

		_ = manager.SetKeyResultStatus(kr1.ID, "completed")
		_ = manager.SetKeyResultStatus(kr2.ID, "completed")
		_ = manager.SetKeyResultStatus(kr2.ID, "archived")

		err := manager.SetObjectiveStatus(obj.ID, "completed")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
	})

	t.Run("blocks completing objective with active KRs", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		_, _ = testCreateKeyResult(manager,obj.ID, "Active KR", 0, 10)

		err := manager.SetObjectiveStatus(obj.ID, "completed")
		if err == nil {
			t.Fatal("expected error for completing objective with active children")
		}
	})

	t.Run("blocks completing objective with active child objectives", func(t *testing.T) {
		manager, _, _ := newMockManager()

		parent, _ := testCreateObjective(manager,"T", "Parent")
		_, _ = testCreateObjective(manager,parent.ID, "Active Child")

		err := manager.SetObjectiveStatus(parent.ID, "completed")
		if err == nil {
			t.Fatal("expected error for completing objective with active child objectives")
		}
	})

	t.Run("completes objective with completed child objectives", func(t *testing.T) {
		manager, _, _ := newMockManager()

		parent, _ := testCreateObjective(manager,"T", "Parent")
		child, _ := testCreateObjective(manager,parent.ID, "Child")

		_ = manager.SetObjectiveStatus(child.ID, "completed")

		err := manager.SetObjectiveStatus(parent.ID, "completed")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
	})

	t.Run("archives a completed objective", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		_ = manager.SetObjectiveStatus(obj.ID, "completed")

		err := manager.SetObjectiveStatus(obj.ID, "archived")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if found.Status != "archived" {
			t.Errorf("expected status 'archived', got '%s'", found.Status)
		}
	})

	t.Run("reopens a completed objective", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		_ = manager.SetObjectiveStatus(obj.ID, "completed")

		err := manager.SetObjectiveStatus(obj.ID, "active")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if found.Status != "active" {
			t.Errorf("expected status 'active', got '%s'", found.Status)
		}
	})

	t.Run("blocks active to archived", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")

		err := manager.SetObjectiveStatus(obj.ID, "archived")
		if err == nil {
			t.Fatal("expected error for active->archived transition")
		}
	})

	t.Run("returns error for empty objectiveId", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := manager.SetObjectiveStatus("", "completed")
		if err == nil {
			t.Fatal("expected error for empty objectiveId")
		}
	})

	t.Run("returns error for non-existent objective", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := manager.SetObjectiveStatus("NONEXISTENT", "completed")
		if err == nil {
			t.Fatal("expected error for non-existent objective")
		}
	})

	t.Run("completes objective with no children", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Empty Objective")

		err := manager.SetObjectiveStatus(obj.ID, "completed")
		if err != nil {
			t.Fatalf("expected no error for empty objective, got %v", err)
		}
	})
}

// =============================================================================
// Routine CRUD Tests
// =============================================================================

func TestAddRoutine(t *testing.T) {
	t.Run("creates routine with correct ID", func(t *testing.T) {
		manager, _, _ := newMockManager()

		routine, err := testAddRoutine(manager,"T", "Exercise sessions per week", 3, "at-or-above", "times/week")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if routine.ID != "T-R1" {
			t.Errorf("expected ID 'T-R1', got '%s'", routine.ID)
		}
		if routine.Description != "Exercise sessions per week" {
			t.Errorf("expected description 'Exercise sessions per week', got '%s'", routine.Description)
		}
		if routine.TargetValue != 3 {
			t.Errorf("expected targetValue 3, got %d", routine.TargetValue)
		}
		if routine.TargetType != "at-or-above" {
			t.Errorf("expected targetType 'at-or-above', got '%s'", routine.TargetType)
		}
		if routine.Unit != "times/week" {
			t.Errorf("expected unit 'times/week', got '%s'", routine.Unit)
		}
		if routine.CurrentValue != 0 {
			t.Errorf("expected currentValue 0, got %d", routine.CurrentValue)
		}
	})

	t.Run("auto-increments routine ID", func(t *testing.T) {
		manager, _, _ := newMockManager()

		r1, _ := testAddRoutine(manager,"T", "Routine one", 1, "at-or-above", "")
		r2, _ := testAddRoutine(manager,"T", "Routine two", 2, "at-or-below", "kg")
		if r1.ID != "T-R1" {
			t.Errorf("expected T-R1, got %s", r1.ID)
		}
		if r2.ID != "T-R2" {
			t.Errorf("expected T-R2, got %s", r2.ID)
		}
	})

	t.Run("returns error for empty description", func(t *testing.T) {
		manager, _, _ := newMockManager()

		_, err := testAddRoutine(manager,"T", "", 3, "at-or-above", "")
		if err == nil {
			t.Fatal("expected error for empty description")
		}
	})

	t.Run("returns error for whitespace-only description", func(t *testing.T) {
		manager, _, _ := newMockManager()

		_, err := testAddRoutine(manager,"T", "   ", 3, "at-or-above", "")
		if err == nil {
			t.Fatal("expected error for whitespace-only description")
		}
	})

	t.Run("returns error for invalid targetType", func(t *testing.T) {
		manager, _, _ := newMockManager()

		_, err := testAddRoutine(manager,"T", "Test", 3, "invalid-type", "")
		if err == nil {
			t.Fatal("expected error for invalid targetType")
		}
	})

	t.Run("returns error for zero targetValue", func(t *testing.T) {
		manager, _, _ := newMockManager()

		_, err := testAddRoutine(manager,"T", "Test", 0, "at-or-above", "")
		if err == nil {
			t.Fatal("expected error for zero targetValue")
		}
	})

	t.Run("returns error for negative targetValue", func(t *testing.T) {
		manager, _, _ := newMockManager()

		_, err := testAddRoutine(manager,"T", "Test", -1, "at-or-above", "")
		if err == nil {
			t.Fatal("expected error for negative targetValue")
		}
	})

	t.Run("returns error for non-existent theme", func(t *testing.T) {
		manager, _, _ := newMockManager()

		_, err := testAddRoutine(manager,"NONEXISTENT", "Test", 3, "at-or-above", "")
		if err == nil {
			t.Fatal("expected error for non-existent theme")
		}
	})

	t.Run("returns error for empty themeId", func(t *testing.T) {
		manager, _, _ := newMockManager()

		_, err := testAddRoutine(manager,"", "Test", 3, "at-or-above", "")
		if err == nil {
			t.Fatal("expected error for empty themeId")
		}
	})
}

func TestUpdateRoutine(t *testing.T) {
	t.Run("updates all routine fields", func(t *testing.T) {
		manager, _, _ := newMockManager()

		routine, _ := testAddRoutine(manager,"T", "Original", 5, "at-or-above", "kg")
		err := testUpdateRoutine(manager,routine.ID, "Updated", 3, 10, "at-or-below", "lbs")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		updated := themes[0].Routines[0]
		if updated.Description != "Updated" {
			t.Errorf("expected description 'Updated', got '%s'", updated.Description)
		}
		if updated.CurrentValue != 3 {
			t.Errorf("expected currentValue 3, got %d", updated.CurrentValue)
		}
		if updated.TargetValue != 10 {
			t.Errorf("expected targetValue 10, got %d", updated.TargetValue)
		}
		if updated.TargetType != "at-or-below" {
			t.Errorf("expected targetType 'at-or-below', got '%s'", updated.TargetType)
		}
		if updated.Unit != "lbs" {
			t.Errorf("expected unit 'lbs', got '%s'", updated.Unit)
		}
	})

	t.Run("returns error for empty routineId", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := testUpdateRoutine(manager,"", "Desc", 1, 5, "at-or-above", "")
		if err == nil {
			t.Fatal("expected error for empty routineId")
		}
	})

	t.Run("returns error for non-existent routine", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := testUpdateRoutine(manager,"T-R999", "Desc", 1, 5, "at-or-above", "")
		if err == nil {
			t.Fatal("expected error for non-existent routine")
		}
	})

}

func TestDeleteRoutine(t *testing.T) {
	t.Run("deletes routine", func(t *testing.T) {
		manager, _, _ := newMockManager()

		routine, _ := testAddRoutine(manager,"T", "To Delete", 5, "at-or-above", "")
		err := manager.Dismiss(routine.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		if len(themes[0].Routines) != 0 {
			t.Errorf("expected 0 routines after delete, got %d", len(themes[0].Routines))
		}
	})

	t.Run("returns error for empty routineId", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := manager.Dismiss("")
		if err == nil {
			t.Fatal("expected error for empty routineId")
		}
	})

	t.Run("returns error for non-existent routine", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := manager.Dismiss("T-R999")
		if err == nil {
			t.Fatal("expected error for non-existent routine")
		}
	})
}

func TestRoutineIsOnTrack(t *testing.T) {
	t.Run("at-or-above on track", func(t *testing.T) {
		routine := access.Routine{TargetType: "at-or-above", CurrentValue: 5, TargetValue: 3}
		if !routine.IsOnTrack() {
			t.Error("expected on track (5 >= 3)")
		}
	})

	t.Run("at-or-above at target", func(t *testing.T) {
		routine := access.Routine{TargetType: "at-or-above", CurrentValue: 3, TargetValue: 3}
		if !routine.IsOnTrack() {
			t.Error("expected on track (3 >= 3)")
		}
	})

	t.Run("at-or-above off track", func(t *testing.T) {
		routine := access.Routine{TargetType: "at-or-above", CurrentValue: 2, TargetValue: 3}
		if routine.IsOnTrack() {
			t.Error("expected off track (2 < 3)")
		}
	})

	t.Run("at-or-below on track", func(t *testing.T) {
		routine := access.Routine{TargetType: "at-or-below", CurrentValue: 75, TargetValue: 80}
		if !routine.IsOnTrack() {
			t.Error("expected on track (75 <= 80)")
		}
	})

	t.Run("at-or-below at target", func(t *testing.T) {
		routine := access.Routine{TargetType: "at-or-below", CurrentValue: 80, TargetValue: 80}
		if !routine.IsOnTrack() {
			t.Error("expected on track (80 <= 80)")
		}
	})

	t.Run("at-or-below off track", func(t *testing.T) {
		routine := access.Routine{TargetType: "at-or-below", CurrentValue: 82, TargetValue: 80}
		if routine.IsOnTrack() {
			t.Error("expected off track (82 > 80)")
		}
	})
}

// =============================================================================
// Task Tests (unchanged signatures)
// =============================================================================

func TestCreateTask(t *testing.T) {
	t.Run("creates task with valid priority Q1", func(t *testing.T) {
		manager, _, _ := newMockManager()

		task, err := manager.CreateTask("Test Task", "T", "important-urgent", "", "", "")
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
		manager, _, _ := newMockManager()

		task, err := manager.CreateTask("Test Task", "T", "important-not-urgent", "", "", "")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if task.Priority != "important-not-urgent" {
			t.Errorf("expected priority 'important-not-urgent', got '%s'", task.Priority)
		}
	})

	t.Run("creates task with valid priority Q3", func(t *testing.T) {
		manager, _, _ := newMockManager()

		task, err := manager.CreateTask("Test Task", "T", "not-important-urgent", "", "", "")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if task.Priority != "not-important-urgent" {
			t.Errorf("expected priority 'not-important-urgent', got '%s'", task.Priority)
		}
	})

	t.Run("rejects Q4 priority", func(t *testing.T) {
		manager, _, _ := newMockManager()

		_, err := manager.CreateTask("Test Task", "T", "not-important-not-urgent", "", "", "")
		if err == nil {
			t.Fatal("expected error for Q4 priority")
		}
	})

	t.Run("rejects invalid priority", func(t *testing.T) {
		manager, _, _ := newMockManager()

		_, err := manager.CreateTask("Test Task", "T", "invalid-priority", "", "", "")
		if err == nil {
			t.Fatal("expected error for invalid priority")
		}
	})

	t.Run("creates task with description", func(t *testing.T) {
		manager, _, _ := newMockManager()

		task, err := manager.CreateTask("Task With Desc", "T", "important-urgent", "A detailed description", "", "")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if task.Description != "A detailed description" {
			t.Errorf("expected description 'A detailed description', got '%s'", task.Description)
		}
	})

	t.Run("creates task with tags", func(t *testing.T) {
		manager, _, _ := newMockManager()

		task, err := manager.CreateTask("Task With Tags", "T", "important-urgent", "", "frontend, backend , api", "")
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

	t.Run("ignores trailing comma and whitespace in tags", func(t *testing.T) {
		manager, _, _ := newMockManager()

		task, err := manager.CreateTask("Task Trailing", "T", "important-urgent", "", "frontend, backend, ", "")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if len(task.Tags) != 2 {
			t.Fatalf("expected 2 tags, got %d: %v", len(task.Tags), task.Tags)
		}
		expected := []string{"frontend", "backend"}
		for i, tag := range task.Tags {
			if tag != expected[i] {
				t.Errorf("expected tag %d '%s', got '%s'", i, expected[i], tag)
			}
		}
	})

	t.Run("creates task with promotionDate", func(t *testing.T) {
		manager, _, _ := newMockManager()

		task, err := manager.CreateTask("Task With Promo", "T", "important-not-urgent", "", "", "2026-02-28")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if task.PromotionDate != "2026-02-28" {
			t.Errorf("expected promotionDate '2026-02-28', got '%s'", task.PromotionDate)
		}
	})

	t.Run("rejects invalid promotionDate format", func(t *testing.T) {
		manager, _, _ := newMockManager()

		_, err := manager.CreateTask("Task", "T", "important-urgent", "", "", "31/01/2026")
		if err == nil {
			t.Fatal("expected error for invalid promotionDate format")
		}
	})
}

func TestMoveTask(t *testing.T) {
	t.Run("moves task to valid status", func(t *testing.T) {
		manager, _, _ := newMockManager()

		// Create a task first
		task, _ := manager.CreateTask("Test Task", "T", "important-urgent", "", "", "")

		// Move to doing
		result, err := manager.MoveTask(task.ID, "doing", nil)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if !result.Success {
			t.Errorf("expected success, got violations: %v", result.Violations)
		}

		assertTaskOrderConsistency(t, manager)
	})

	t.Run("rejects invalid status", func(t *testing.T) {
		manager, _, _ := newMockManager()

		_, err := manager.MoveTask("task-001", "invalid-status", nil)
		if err == nil {
			t.Fatal("expected error for invalid status")
		}
	})
}

func TestGetTasks(t *testing.T) {
	t.Run("returns all tasks with status", func(t *testing.T) {
		manager, _, _ := newMockManager()

		// Create tasks
		_, _ = manager.CreateTask("Task 1", "T", "important-urgent", "", "", "")
		_, _ = manager.CreateTask("Task 2", "T", "important-not-urgent", "", "", "")

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
		manager, _, _ := newMockManager()

		// Create a task
		task, _ := manager.CreateTask("Test Task", "T", "important-urgent", "", "", "")

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

		assertTaskOrderConsistency(t, manager)
	})

	t.Run("returns error for empty ID", func(t *testing.T) {
		manager, _, _ := newMockManager()

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
		manager, _, mockAccess := newMockManager()

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
		manager, _, _ := newMockManager()

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
		manager, _, _ := newMockManager()

		// Create tasks — they end up in todo with same priority
		_, _ = manager.CreateTask("First", "T", "important-urgent", "", "", "")
		_, _ = manager.CreateTask("Second", "T", "important-urgent", "", "", "")

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
		manager, _, _ := newMockManager()

		// No task order set — should still return tasks
		_, _ = manager.CreateTask("Task", "T", "important-urgent", "", "", "")

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
		manager, _, mockAccess := newMockManager()

		// Interleave two important-urgent tasks with two important-not-urgent tasks
		// within the same "todo" status. The merge sort will split [A,B,C,D] into
		// two halves and may never directly compare A(iu) with D(iu) if cross-zone
		// comparisons return "equal".
		mockAccess.tasks["todo"] = []access.Task{
			{ID: "T-A", Title: "A", ThemeID: "T", Priority: "important-urgent", CreatedAt: "2026-01-01T00:00:00Z"},
			{ID: "T-B", Title: "B", ThemeID: "T", Priority: "important-not-urgent", CreatedAt: "2026-01-02T00:00:00Z"},
			{ID: "T-C", Title: "C", ThemeID: "T", Priority: "important-not-urgent", CreatedAt: "2026-01-03T00:00:00Z"},
			{ID: "T-D", Title: "D", ThemeID: "T", Priority: "important-urgent", CreatedAt: "2026-01-04T00:00:00Z"},
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
		manager, _, _ := newMockManager()

		task, _ := manager.CreateTask("Test", "T", "important-urgent", "", "", "")

		result, err := manager.MoveTask(task.ID, "doing", nil)
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

		assertTaskOrderConsistency(t, manager)
	})
}

func TestDeleteTask_CleansUpOrder(t *testing.T) {
	t.Run("removes task from order on delete", func(t *testing.T) {
		manager, _, mockAccess := newMockManager()

		task, _ := manager.CreateTask("Test", "T", "important-urgent", "", "", "")

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

		assertTaskOrderConsistency(t, manager)
	})
}

func TestCreateTask_AppendsToOrder(t *testing.T) {
	t.Run("new task is appended to its drop zone", func(t *testing.T) {
		manager, _, mockAccess := newMockManager()

		task, _ := manager.CreateTask("Test", "T", "important-urgent", "", "", "")

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

		assertTaskOrderConsistency(t, manager)
	})
}

// =============================================================================
// Board Configuration Tests
// =============================================================================

func TestGetBoardConfiguration(t *testing.T) {
	t.Run("returns default board configuration", func(t *testing.T) {
		manager, _, _ := newMockManager()

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
// Batch Task Creation Tests
// =============================================================================

func TestUnit_CreateTask_BatchSequential(t *testing.T) {
	t.Run("creates 5 tasks sequentially with mixed priorities", func(t *testing.T) {
		manager, _, mockAccess := newMockManager()

		type taskSpec struct {
			title    string
			priority string
		}
		specs := []taskSpec{
			{"Task A", "important-urgent"},
			{"Task B", "important-not-urgent"},
			{"Task C", "not-important-urgent"},
			{"Task D", "important-urgent"},
			{"Task E", "important-not-urgent"},
		}

		createdIDs := make([]string, 0, len(specs))
		for _, spec := range specs {
			task, err := manager.CreateTask(spec.title, "T", spec.priority, "", "", "")
			if err != nil {
				t.Fatalf("CreateTask(%q) returned error: %v", spec.title, err)
			}
			if task == nil {
				t.Fatalf("CreateTask(%q) returned nil task", spec.title)
			}
			if task.ID == "" {
				t.Fatalf("CreateTask(%q) returned empty task ID", spec.title)
			}
			createdIDs = append(createdIDs, task.ID)
		}

		// Verify all IDs are unique
		seen := make(map[string]bool, len(createdIDs))
		for _, id := range createdIDs {
			if seen[id] {
				t.Errorf("duplicate task ID: %s", id)
			}
			seen[id] = true
		}

		// Verify all tasks are in the task order under correct zones
		order, err := mockAccess.LoadTaskOrder()
		if err != nil {
			t.Fatalf("LoadTaskOrder returned error: %v", err)
		}

		allOrderedIDs := make(map[string]bool)
		for _, ids := range order {
			for _, id := range ids {
				allOrderedIDs[id] = true
			}
		}
		for _, id := range createdIDs {
			if !allOrderedIDs[id] {
				t.Errorf("task %s not found in task order", id)
			}
		}

		// Verify priority zone assignments
		for i, spec := range specs {
			zone := spec.priority // for todo tasks, drop zone = priority
			if !slices.Contains(order[zone], createdIDs[i]) {
				t.Errorf("task %s (priority %s) not found in zone %s", createdIDs[i], spec.priority, zone)
			}
		}

		assertTaskOrderConsistency(t, manager)
	})
}

// =============================================================================
// Archive / Restore Tests
// =============================================================================

func TestArchiveTask(t *testing.T) {
	t.Run("archives a done task", func(t *testing.T) {
		manager, _, _ := newMockManager()

		task, _ := manager.CreateTask("Test Task", "T", "important-urgent", "", "", "")
		_, _ = manager.MoveTask(task.ID, "done", nil)

		err := manager.ArchiveTask(task.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		// Verify archived
		tasks, _ := manager.GetTasks()
		for _, tw := range tasks {
			if tw.ID == task.ID {
				if tw.Status != "archived" {
					t.Errorf("expected status 'archived', got '%s'", tw.Status)
				}
				assertTaskOrderConsistency(t, manager)
				return
			}
		}
		t.Error("archived task not found in GetTasks")
	})

	t.Run("rejects non-done task", func(t *testing.T) {
		manager, _, _ := newMockManager()

		task, _ := manager.CreateTask("Test Task", "T", "important-urgent", "", "", "")

		err := manager.ArchiveTask(task.ID)
		if err == nil {
			t.Fatal("expected error for non-done task")
		}
	})

	t.Run("returns error for empty ID", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := manager.ArchiveTask("")
		if err == nil {
			t.Fatal("expected error for empty ID")
		}
	})
}

func TestArchiveAllDoneTasks(t *testing.T) {
	t.Run("archives all done tasks", func(t *testing.T) {
		manager, _, _ := newMockManager()

		t1, _ := manager.CreateTask("Task 1", "T", "important-urgent", "", "", "")
		t2, _ := manager.CreateTask("Task 2", "T", "important-not-urgent", "", "", "")
		_, _ = manager.CreateTask("Task 3", "T", "important-urgent", "", "", "")

		_, _ = manager.MoveTask(t1.ID, "done", nil)
		_, _ = manager.MoveTask(t2.ID, "done", nil)
		// Task 3 stays in todo

		err := manager.ArchiveAllDoneTasks()
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		tasks, _ := manager.GetTasks()
		archivedCount := 0
		todoCount := 0
		for _, tw := range tasks {
			if tw.Status == "archived" {
				archivedCount++
			}
			if tw.Status == "todo" {
				todoCount++
			}
		}
		if archivedCount != 2 {
			t.Errorf("expected 2 archived tasks, got %d", archivedCount)
		}
		if todoCount != 1 {
			t.Errorf("expected 1 todo task, got %d", todoCount)
		}

		assertTaskOrderConsistency(t, manager)
	})

	t.Run("no-op when no done tasks", func(t *testing.T) {
		manager, _, _ := newMockManager()

		_, _ = manager.CreateTask("Task 1", "T", "important-urgent", "", "", "")

		err := manager.ArchiveAllDoneTasks()
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		tasks, _ := manager.GetTasks()
		if len(tasks) != 1 || tasks[0].Status != "todo" {
			t.Error("task should remain in todo")
		}
	})
}

func TestRestoreTask(t *testing.T) {
	t.Run("restores archived task to done", func(t *testing.T) {
		manager, _, _ := newMockManager()

		task, _ := manager.CreateTask("Test Task", "T", "important-urgent", "", "", "")
		_, _ = manager.MoveTask(task.ID, "done", nil)
		_ = manager.ArchiveTask(task.ID)

		err := manager.RestoreTask(task.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		tasks, _ := manager.GetTasks()
		for _, tw := range tasks {
			if tw.ID == task.ID {
				if tw.Status != "done" {
					t.Errorf("expected status 'done', got '%s'", tw.Status)
				}
				return
			}
		}
		t.Error("restored task not found")
	})

	t.Run("restores task into task_order", func(t *testing.T) {
		manager, _, mockAccess := newMockManager()

		task, _ := manager.CreateTask("Test Task", "T", "important-urgent", "", "", "")
		_, _ = manager.MoveTask(task.ID, "done", nil)
		_ = manager.ArchiveTask(task.ID)

		// Verify task is removed from task_order after archive
		orderBefore, _ := mockAccess.LoadTaskOrder()
		for zone, ids := range orderBefore {
			for _, id := range ids {
				if id == task.ID {
					t.Errorf("archived task %s should not be in task_order zone %s", task.ID, zone)
				}
			}
		}

		err := manager.RestoreTask(task.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		// Verify task is back in task_order under the "done" zone
		orderAfter, _ := mockAccess.LoadTaskOrder()
		found := false
		for _, id := range orderAfter["done"] {
			if id == task.ID {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("restored task %s should be in task_order zone 'done', got %v", task.ID, orderAfter)
		}

		assertTaskOrderConsistency(t, manager)
	})

	t.Run("rejects non-archived task", func(t *testing.T) {
		manager, _, _ := newMockManager()

		task, _ := manager.CreateTask("Test Task", "T", "important-urgent", "", "", "")

		err := manager.RestoreTask(task.ID)
		if err == nil {
			t.Fatal("expected error for non-archived task")
		}
	})

	t.Run("returns error for empty ID", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := manager.RestoreTask("")
		if err == nil {
			t.Fatal("expected error for empty ID")
		}
	})
}

func TestGetTasks_IncludesArchived(t *testing.T) {
	manager, _, _ := newMockManager()

	t1, _ := manager.CreateTask("Task 1", "T", "important-urgent", "", "", "")
	_, _ = manager.CreateTask("Task 2", "T", "important-not-urgent", "", "", "")

	_, _ = manager.MoveTask(t1.ID, "done", nil)
	_ = manager.ArchiveTask(t1.ID)

	tasks, err := manager.GetTasks()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if len(tasks) != 2 {
		t.Fatalf("expected 2 tasks (1 todo + 1 archived), got %d", len(tasks))
	}

	statusMap := map[string]int{}
	for _, tw := range tasks {
		statusMap[tw.Status]++
	}
	if statusMap["todo"] != 1 {
		t.Errorf("expected 1 todo task, got %d", statusMap["todo"])
	}
	if statusMap["archived"] != 1 {
		t.Errorf("expected 1 archived task, got %d", statusMap["archived"])
	}
}

func TestMoveTask_AfterArchiving(t *testing.T) {
	manager, _, _ := newMockManager()

	// Create a task, move to done, then archive it
	task1, _ := manager.CreateTask("Task 1", "T", "important-urgent", "", "", "")
	_, _ = manager.MoveTask(task1.ID, "done", nil)
	_ = manager.ArchiveTask(task1.ID)

	// Create a new task (ID must not collide with the archived one)
	task2, err := manager.CreateTask("Task 2", "T", "important-urgent", "", "", "")
	if err != nil {
		t.Fatalf("expected no error creating task after archive, got %v", err)
	}
	if task2.ID == task1.ID {
		t.Fatalf("new task ID %s collides with archived task ID %s", task2.ID, task1.ID)
	}

	// Move the new task from todo to doing — should succeed without rule violation
	result, err := manager.MoveTask(task2.ID, "doing", nil)
	if err != nil {
		t.Fatalf("expected no error moving task after archive, got %v", err)
	}
	if !result.Success {
		t.Errorf("expected move to succeed, got violations: %v", result.Violations)
	}
}

// Column CRUD Tests are in workspace_manager_test.go

func TestUnit_MoveTask_CustomColumn(t *testing.T) {
	manager, _, mockAccess := newMockManager()

	// Add custom column via workspace manager (sharing the same task access)
	wm, _ := NewWorkspaceManager(mockAccess)
	_, _ = wm.AddColumn("Review", "doing")

	// Create a task
	task, err := manager.CreateTask("Test task", "T", "important-urgent", "", "", "")
	if err != nil {
		t.Fatalf("CreateTask failed: %v", err)
	}

	// Move to custom column
	result, err := manager.MoveTask(task.ID, "review", nil)
	if err != nil {
		t.Fatalf("MoveTask to custom column failed: %v", err)
	}
	if !result.Success {
		t.Errorf("Expected move to succeed, got violations: %v", result.Violations)
	}
}

func TestUnit_MoveTask_InvalidColumn(t *testing.T) {
	manager, _, _ := newMockManager()

	_, err := manager.MoveTask("T-T1", "nonexistent", nil)
	if err == nil {
		t.Error("Expected error for invalid target column")
	}
}

func TestUnit_MoveTask_CrossColumnToSectionWithPositions(t *testing.T) {
	manager, _, mockAccess := newMockManager()

	// Create 3 tasks in todo with priority "important-urgent" (they'll be in I&U zone)
	task1, err := manager.CreateTask("Task 1", "T", "important-urgent", "", "", "")
	if err != nil {
		t.Fatalf("CreateTask 1 failed: %v", err)
	}
	task2, err := manager.CreateTask("Task 2", "T", "important-urgent", "", "", "")
	if err != nil {
		t.Fatalf("CreateTask 2 failed: %v", err)
	}
	task3, err := manager.CreateTask("Task 3", "T", "important-urgent", "", "", "")
	if err != nil {
		t.Fatalf("CreateTask 3 failed: %v", err)
	}

	// Verify initial order in important-urgent zone is [task1, task2, task3]
	initialOrder, err := mockAccess.LoadTaskOrder()
	if err != nil {
		t.Fatalf("LoadTaskOrder failed: %v", err)
	}
	expectedInitial := []string{task1.ID, task2.ID, task3.ID}
	if !slices.Equal(initialOrder["important-urgent"], expectedInitial) {
		t.Fatalf("Initial order mismatch: got %v, want %v", initialOrder["important-urgent"], expectedInitial)
	}

	// Move task1 to "doing" with positions for the doing zone (matches frontend behavior)
	_, err = manager.MoveTask(task1.ID, "doing", map[string][]string{
		"doing": {task1.ID},
	})
	if err != nil {
		t.Fatalf("MoveTask to doing failed: %v", err)
	}

	// Verify task1 is now in "doing" zone and removed from "important-urgent"
	afterDoingOrder, err := mockAccess.LoadTaskOrder()
	if err != nil {
		t.Fatalf("LoadTaskOrder after doing failed: %v", err)
	}
	if slices.Contains(afterDoingOrder["important-urgent"], task1.ID) {
		t.Errorf("task1 should not be in important-urgent zone after move to doing")
	}
	if !slices.Contains(afterDoingOrder["doing"], task1.ID) {
		t.Errorf("task1 should be in doing zone after move to doing")
	}

	// Move task1 back to "todo" with explicit positions placing it at position 0
	desiredOrder := []string{task1.ID, task2.ID, task3.ID}
	result, err := manager.MoveTask(task1.ID, "todo", map[string][]string{
		"important-urgent": desiredOrder,
	})
	if err != nil {
		t.Fatalf("MoveTask back to todo failed: %v", err)
	}
	if !result.Success {
		t.Fatalf("MoveTask back to todo not successful: %v", result.Violations)
	}

	// Verify task order via GetTasks — tasks in important-urgent zone should be [task1, task2, task3]
	allTasks, err := manager.GetTasks()
	if err != nil {
		t.Fatalf("GetTasks failed: %v", err)
	}
	var iuTasks []string
	for _, task := range allTasks {
		if task.Priority == "important-urgent" && task.Status == "todo" {
			iuTasks = append(iuTasks, task.ID)
		}
	}
	if !slices.Equal(iuTasks, desiredOrder) {
		t.Errorf("GetTasks order mismatch in important-urgent zone:\n  got  %v\n  want %v", iuTasks, desiredOrder)
	}

	// Verify task_order.json directly
	finalOrder, err := mockAccess.LoadTaskOrder()
	if err != nil {
		t.Fatalf("LoadTaskOrder final failed: %v", err)
	}
	if !slices.Equal(finalOrder["important-urgent"], desiredOrder) {
		t.Errorf("task_order.json mismatch in important-urgent zone:\n  got  %v\n  want %v", finalOrder["important-urgent"], desiredOrder)
	}

	assertTaskOrderConsistency(t, manager)
}

func TestUnit_MoveTask_ConcurrentWithReorder(t *testing.T) {
	manager, _, mockAccess := newMockManager()

	// Create tasks in I&U zone (todo column, important-urgent priority)
	task1, err := manager.CreateTask("IU Task 1", "T", "important-urgent", "", "", "")
	if err != nil {
		t.Fatalf("CreateTask 1 failed: %v", err)
	}
	task2, err := manager.CreateTask("IU Task 2", "T", "important-urgent", "", "", "")
	if err != nil {
		t.Fatalf("CreateTask 2 failed: %v", err)
	}

	// Create a task in "doing"
	doingTask, err := manager.CreateTask("Doing Task", "T", "important-urgent", "", "", "")
	if err != nil {
		t.Fatalf("CreateTask doing failed: %v", err)
	}
	_, err = manager.MoveTask(doingTask.ID, "doing", map[string][]string{
		"doing": {doingTask.ID},
	})
	if err != nil {
		t.Fatalf("MoveTask to doing failed: %v", err)
	}

	// Run MoveTask (doing→todo/I&U) and ReorderTasks (doing zone) concurrently
	// to verify the mutex prevents lost updates.
	var wg sync.WaitGroup
	var moveErr, reorderErr error

	wg.Add(2)
	go func() {
		defer wg.Done()
		// Move doingTask back to todo/I&U, placing it first
		_, moveErr = manager.MoveTask(doingTask.ID, "todo", map[string][]string{
			"important-urgent": {doingTask.ID, task1.ID, task2.ID},
		})
	}()
	go func() {
		defer wg.Done()
		// Spurious reorder of doing zone (simulates source-zone finalize)
		_, reorderErr = manager.ReorderTasks(map[string][]string{
			"doing": {},
		})
	}()
	wg.Wait()

	if moveErr != nil {
		t.Fatalf("MoveTask failed: %v", moveErr)
	}
	if reorderErr != nil {
		t.Fatalf("ReorderTasks failed: %v", reorderErr)
	}

	// Verify the final task order is consistent:
	// - important-urgent zone must contain [doingTask, task1, task2]
	// - doing zone must be empty
	finalOrder, err := mockAccess.LoadTaskOrder()
	if err != nil {
		t.Fatalf("LoadTaskOrder failed: %v", err)
	}

	expectedIU := []string{doingTask.ID, task1.ID, task2.ID}
	if !slices.Equal(finalOrder["important-urgent"], expectedIU) {
		t.Errorf("important-urgent zone mismatch:\n  got  %v\n  want %v", finalOrder["important-urgent"], expectedIU)
	}
	if len(finalOrder["doing"]) != 0 {
		t.Errorf("doing zone should be empty, got %v", finalOrder["doing"])
	}

	assertTaskOrderConsistency(t, manager)
}

func TestUnit_ValidateTaskOrder_RepairsCorruptData(t *testing.T) {
	mockTasks := newMockTaskAccess()

	// Create tasks: task1 in todo/I&U, task2 in doing
	task1 := access.Task{ID: "T-T1", Title: "Task 1", ThemeID: "T", Priority: "important-urgent"}
	task2 := access.Task{ID: "T-T2", Title: "Task 2", ThemeID: "T", Priority: "important-urgent"}
	mockTasks.tasks["todo"] = []access.Task{task1}
	mockTasks.tasks["doing"] = []access.Task{task2}

	// Corrupt task_order.json: task1 in TWO zones, task2 in wrong zone
	mockTasks.taskOrder = map[string][]string{
		"important-urgent":     {"T-T1"},
		"important-not-urgent": {"T-T1"}, // stale duplicate
		"doing":                {},       // task2 missing from correct zone
		"important-urgent-dup": {"T-T2"}, // task2 in wrong zone
	}

	// NewPlanningManager calls validateTaskOrder
	manager, err := NewPlanningManager(newMockThemeAccess(), mockTasks, &mockCalendarAccess{}, &mockVisionAccess{}, &mockUIStateAccess{})
	if err != nil {
		t.Fatalf("NewPlanningManager failed: %v", err)
	}

	order, err := manager.taskAccess.LoadTaskOrder()
	if err != nil {
		t.Fatalf("LoadTaskOrder failed: %v", err)
	}

	// task1 should only be in important-urgent
	if !slices.Contains(order["important-urgent"], "T-T1") {
		t.Errorf("T-T1 should be in important-urgent, got %v", order["important-urgent"])
	}
	if slices.Contains(order["important-not-urgent"], "T-T1") {
		t.Errorf("T-T1 should NOT be in important-not-urgent, got %v", order["important-not-urgent"])
	}

	// task2 should be in doing (its actual status), not in important-urgent-dup
	if !slices.Contains(order["doing"], "T-T2") {
		t.Errorf("T-T2 should be in doing zone, got %v", order["doing"])
	}
	if slices.Contains(order["important-urgent-dup"], "T-T2") {
		t.Errorf("T-T2 should NOT be in important-urgent-dup, got %v", order["important-urgent-dup"])
	}
}

// =============================================================================
// Progress Rollup Tests
// =============================================================================

func TestGetAllThemeProgress(t *testing.T) {
	t.Run("single KR progress", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Obj1")
		kr, _ := testCreateKeyResult(manager,obj.ID, "KR1", 0, 100)
		_ = manager.RecordProgress(kr.ID, 50)

		progress, err := manager.GetAllThemeProgress()
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if len(progress) != 1 {
			t.Fatalf("expected 1 theme progress, got %d", len(progress))
		}
		if progress[0].ThemeID != "T" {
			t.Errorf("expected themeId 'T', got '%s'", progress[0].ThemeID)
		}
		// KR progress: (50-0)/(100-0)*100 = 50%
		if progress[0].Progress != 50 {
			t.Errorf("expected theme progress 50, got %f", progress[0].Progress)
		}
	})

	t.Run("multiple KRs average", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Obj1")
		kr1, _ := testCreateKeyResult(manager,obj.ID, "KR1", 0, 100)
		_ = manager.RecordProgress(kr1.ID, 100) // 100%
		kr2, _ := testCreateKeyResult(manager,obj.ID, "KR2", 0, 100)
		_ = manager.RecordProgress(kr2.ID, 0) // 0%

		progress, err := manager.GetAllThemeProgress()
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		// Average: (100 + 0) / 2 = 50%
		if progress[0].Progress != 50 {
			t.Errorf("expected theme progress 50, got %f", progress[0].Progress)
		}
	})

	t.Run("untracked KR excluded", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Obj1")
		kr1, _ := testCreateKeyResult(manager,obj.ID, "KR tracked", 0, 100)
		_ = manager.RecordProgress(kr1.ID, 80) // 80%
		_, _ = testCreateKeyResult(manager,obj.ID, "KR untracked", 0, 0) // targetValue=0, excluded

		progress, err := manager.GetAllThemeProgress()
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		// Only tracked KR counts: 80%
		if progress[0].Progress != 80 {
			t.Errorf("expected theme progress 80, got %f", progress[0].Progress)
		}
	})

	t.Run("completed KR excluded", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Obj1")
		kr1, _ := testCreateKeyResult(manager,obj.ID, "KR active", 0, 100)
		_ = manager.RecordProgress(kr1.ID, 60) // 60%
		kr2, _ := testCreateKeyResult(manager,obj.ID, "KR completed", 0, 1)
		_ = manager.RecordProgress(kr2.ID, 1)
		_ = manager.SetKeyResultStatus(kr2.ID, "completed")

		progress, err := manager.GetAllThemeProgress()
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		// Only active KR counts: 60%
		if progress[0].Progress != 60 {
			t.Errorf("expected theme progress 60, got %f", progress[0].Progress)
		}
	})

	t.Run("archived KR excluded", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Obj1")
		kr1, _ := testCreateKeyResult(manager,obj.ID, "KR active", 0, 100)
		_ = manager.RecordProgress(kr1.ID, 40) // 40%
		kr2, _ := testCreateKeyResult(manager,obj.ID, "KR archived", 0, 1)
		_ = manager.RecordProgress(kr2.ID, 1)
		_ = manager.SetKeyResultStatus(kr2.ID, "completed")
		_ = manager.SetKeyResultStatus(kr2.ID, "archived")

		progress, err := manager.GetAllThemeProgress()
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		// Only active KR counts: 40%
		if progress[0].Progress != 40 {
			t.Errorf("expected theme progress 40, got %f", progress[0].Progress)
		}
	})

	t.Run("nested objective progress rollup", func(t *testing.T) {
		manager, _, _ := newMockManager()

		parent, _ := testCreateObjective(manager,"T", "Parent")
		child, _ := testCreateObjective(manager,parent.ID, "Child")
		kr1, _ := testCreateKeyResult(manager,parent.ID, "Parent KR", 0, 100)
		_ = manager.RecordProgress(kr1.ID, 100) // 100%
		kr2, _ := testCreateKeyResult(manager,child.ID, "Child KR", 0, 100)
		_ = manager.RecordProgress(kr2.ID, 0) // 0%

		progress, err := manager.GetAllThemeProgress()
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		// Child objective: 0%
		// Parent objective: avg(100%, 0%) = 50% (parent KR + child obj progress)
		// Theme: 50%
		if progress[0].Progress != 50 {
			t.Errorf("expected theme progress 50, got %f", progress[0].Progress)
		}
		// Check child objective progress
		var childProgress float64 = -2
		for _, op := range progress[0].Objectives {
			if op.ObjectiveID == child.ID {
				childProgress = op.Progress
			}
		}
		if childProgress != 0 {
			t.Errorf("expected child progress 0, got %f", childProgress)
		}
	})

	t.Run("theme-level progress averages top-level objectives", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj1, _ := testCreateObjective(manager,"T", "Obj1")
		kr1, _ := testCreateKeyResult(manager,obj1.ID, "KR1", 0, 100)
		_ = manager.RecordProgress(kr1.ID, 100) // 100%

		obj2, _ := testCreateObjective(manager,"T", "Obj2")
		kr2, _ := testCreateKeyResult(manager,obj2.ID, "KR2", 0, 100)
		_ = manager.RecordProgress(kr2.ID, 0) // 0%

		progress, err := manager.GetAllThemeProgress()
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		// Theme: avg(100%, 0%) = 50%
		if progress[0].Progress != 50 {
			t.Errorf("expected theme progress 50, got %f", progress[0].Progress)
		}
	})

	t.Run("empty theme returns -1 progress", func(t *testing.T) {
		manager, _, _ := newMockManager()

		progress, err := manager.GetAllThemeProgress()
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if len(progress) != 1 {
			t.Fatalf("expected 1 theme progress, got %d", len(progress))
		}
		if progress[0].Progress != -1 {
			t.Errorf("expected theme progress -1, got %f", progress[0].Progress)
		}
	})

	t.Run("objective with no tracked KRs returns -1", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Obj1")
		_, _ = testCreateKeyResult(manager,obj.ID, "Untracked KR", 0, 0)

		progress, err := manager.GetAllThemeProgress()
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		// Objective has only untracked KRs -> -1
		// Theme also -1 (no objectives with valid progress)
		if progress[0].Progress != -1 {
			t.Errorf("expected theme progress -1, got %f", progress[0].Progress)
		}
		var objProgress float64 = -2
		for _, op := range progress[0].Objectives {
			if op.ObjectiveID == obj.ID {
				objProgress = op.Progress
			}
		}
		if objProgress != -1 {
			t.Errorf("expected objective progress -1, got %f", objProgress)
		}
	})

	t.Run("completed objective excluded from theme progress", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj1, _ := testCreateObjective(manager,"T", "Active Obj")
		kr1, _ := testCreateKeyResult(manager,obj1.ID, "KR1", 0, 100)
		_ = manager.RecordProgress(kr1.ID, 80) // 80%

		obj2, _ := testCreateObjective(manager,"T", "Completed Obj")
		kr2, _ := testCreateKeyResult(manager,obj2.ID, "KR2", 0, 1)
		_ = manager.RecordProgress(kr2.ID, 1)
		_ = manager.SetKeyResultStatus(kr2.ID, "completed")
		_ = manager.SetObjectiveStatus(obj2.ID, "completed")

		progress, err := manager.GetAllThemeProgress()
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		// Only active objective counts: 80%
		if progress[0].Progress != 80 {
			t.Errorf("expected theme progress 80, got %f", progress[0].Progress)
		}
	})

	t.Run("binary KR progress", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Obj1")
		kr, _ := testCreateKeyResult(manager,obj.ID, "Binary KR", 0, 1)

		// Not done
		progress, _ := manager.GetAllThemeProgress()
		if progress[0].Progress != 0 {
			t.Errorf("expected progress 0 for incomplete binary KR, got %f", progress[0].Progress)
		}

		// Done
		_ = manager.RecordProgress(kr.ID, 1)
		progress, _ = manager.GetAllThemeProgress()
		if progress[0].Progress != 100 {
			t.Errorf("expected progress 100 for complete binary KR, got %f", progress[0].Progress)
		}
	})

	t.Run("KR progress clamped to 0-100", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Obj1")
		kr, _ := testCreateKeyResult(manager,obj.ID, "Over-achieved KR", 0, 10)
		_ = manager.RecordProgress(kr.ID, 20) // Over-achieved

		progress, _ := manager.GetAllThemeProgress()
		if progress[0].Progress != 100 {
			t.Errorf("expected clamped progress 100, got %f", progress[0].Progress)
		}
	})
}

// =============================================================================
// Personal Vision Tests
// =============================================================================

func TestPersonalVision(t *testing.T) {
	t.Run("returns empty vision when file does not exist", func(t *testing.T) {
		manager, _, _ := newMockManager()

		vision, err := manager.GetPersonalVision()
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if vision.Mission != "" {
			t.Errorf("expected empty mission, got %q", vision.Mission)
		}
		if vision.Vision != "" {
			t.Errorf("expected empty vision, got %q", vision.Vision)
		}
	})

	t.Run("save and load round-trip", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := manager.SavePersonalVision("To live well", "Be the best version of myself")
		if err != nil {
			t.Fatalf("expected no error saving, got %v", err)
		}

		vision, err := manager.GetPersonalVision()
		if err != nil {
			t.Fatalf("expected no error loading, got %v", err)
		}
		if vision.Mission != "To live well" {
			t.Errorf("expected mission 'To live well', got %q", vision.Mission)
		}
		if vision.Vision != "Be the best version of myself" {
			t.Errorf("expected vision 'Be the best version of myself', got %q", vision.Vision)
		}
		if vision.UpdatedAt == "" {
			t.Error("expected UpdatedAt to be set")
		}
	})
}

func TestCloseObjective(t *testing.T) {
	t.Run("closes objective and sets all fields correctly", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		kr1, _ := testCreateKeyResult(manager,obj.ID, "KR1", 0, 10)
		kr2, _ := testCreateKeyResult(manager,obj.ID, "KR2", 0, 5)

		err := manager.CloseObjective(obj.ID, "achieved", "Great progress!")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if found.Status != "completed" {
			t.Errorf("expected status 'completed', got '%s'", found.Status)
		}
		if found.ClosingStatus != "achieved" {
			t.Errorf("expected closingStatus 'achieved', got '%s'", found.ClosingStatus)
		}
		if found.ClosingNotes != "Great progress!" {
			t.Errorf("expected closingNotes 'Great progress!', got '%s'", found.ClosingNotes)
		}
		if found.ClosedAt == "" {
			t.Error("expected closedAt to be set")
		}

		// Child KRs should be completed
		foundKR1 := findKeyResultByID(themes[0].Objectives, kr1.ID)
		if foundKR1.Status != "completed" {
			t.Errorf("expected KR1 status 'completed', got '%s'", foundKR1.Status)
		}
		foundKR2 := findKeyResultByID(themes[0].Objectives, kr2.ID)
		if foundKR2.Status != "completed" {
			t.Errorf("expected KR2 status 'completed', got '%s'", foundKR2.Status)
		}
	})

	t.Run("does not close already completed KRs again", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		kr1, _ := testCreateKeyResult(manager,obj.ID, "KR1", 0, 10)
		_, _ = testCreateKeyResult(manager,obj.ID, "KR2", 0, 5)

		// Complete KR1 before closing
		_ = manager.SetKeyResultStatus(kr1.ID, "completed")

		err := manager.CloseObjective(obj.ID, "partially-achieved", "")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
	})

	t.Run("fails on non-active objective", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		_ = manager.CloseObjective(obj.ID, "achieved", "")

		err := manager.CloseObjective(obj.ID, "missed", "")
		if err == nil {
			t.Fatal("expected error for closing non-active objective")
		}
	})

	t.Run("fails with invalid closing status", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")

		err := manager.CloseObjective(obj.ID, "invalid-status", "")
		if err == nil {
			t.Fatal("expected error for invalid closing status")
		}
	})

	t.Run("fails with empty objectiveId", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := manager.CloseObjective("", "achieved", "")
		if err == nil {
			t.Fatal("expected error for empty objectiveId")
		}
	})

	t.Run("fails for non-existent objective", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := manager.CloseObjective("NONEXISTENT", "achieved", "")
		if err == nil {
			t.Fatal("expected error for non-existent objective")
		}
	})

	t.Run("closes with empty notes", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")

		err := manager.CloseObjective(obj.ID, "canceled", "")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if found.ClosingNotes != "" {
			t.Errorf("expected empty closingNotes, got '%s'", found.ClosingNotes)
		}
	})
}

func TestReopenObjective(t *testing.T) {
	t.Run("reopens objective and clears all closing fields", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		kr1, _ := testCreateKeyResult(manager,obj.ID, "KR1", 0, 10)
		kr2, _ := testCreateKeyResult(manager,obj.ID, "KR2", 0, 5)

		_ = manager.CloseObjective(obj.ID, "achieved", "Well done!")

		err := manager.ReopenObjective(obj.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if found.Status != "" {
			t.Errorf("expected empty status, got '%s'", found.Status)
		}
		if found.ClosingStatus != "" {
			t.Errorf("expected empty closingStatus, got '%s'", found.ClosingStatus)
		}
		if found.ClosingNotes != "" {
			t.Errorf("expected empty closingNotes, got '%s'", found.ClosingNotes)
		}
		if found.ClosedAt != "" {
			t.Errorf("expected empty closedAt, got '%s'", found.ClosedAt)
		}

		// Child KRs should be reopened
		foundKR1 := findKeyResultByID(themes[0].Objectives, kr1.ID)
		if foundKR1.Status != "" {
			t.Errorf("expected KR1 status empty, got '%s'", foundKR1.Status)
		}
		foundKR2 := findKeyResultByID(themes[0].Objectives, kr2.ID)
		if foundKR2.Status != "" {
			t.Errorf("expected KR2 status empty, got '%s'", foundKR2.Status)
		}
	})

	t.Run("fails on active objective", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")

		err := manager.ReopenObjective(obj.ID)
		if err == nil {
			t.Fatal("expected error for reopening active objective")
		}
	})

	t.Run("does not reopen archived KRs", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")
		kr1, _ := testCreateKeyResult(manager,obj.ID, "KR1", 0, 10)
		kr2, _ := testCreateKeyResult(manager,obj.ID, "KR2", 0, 5)

		// Complete and archive KR1 before closing
		_ = manager.SetKeyResultStatus(kr1.ID, "completed")
		_ = manager.SetKeyResultStatus(kr1.ID, "archived")

		_ = manager.CloseObjective(obj.ID, "achieved", "")

		err := manager.ReopenObjective(obj.ID)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		foundKR1 := findKeyResultByID(themes[0].Objectives, kr1.ID)
		if foundKR1.Status != "archived" {
			t.Errorf("expected KR1 status to remain 'archived', got '%s'", foundKR1.Status)
		}
		foundKR2 := findKeyResultByID(themes[0].Objectives, kr2.ID)
		if foundKR2.Status != "" {
			t.Errorf("expected KR2 status empty, got '%s'", foundKR2.Status)
		}
	})

	t.Run("fails with empty objectiveId", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := manager.ReopenObjective("")
		if err == nil {
			t.Fatal("expected error for empty objectiveId")
		}
	})

	t.Run("fails for non-existent objective", func(t *testing.T) {
		manager, _, _ := newMockManager()

		err := manager.ReopenObjective("NONEXISTENT")
		if err == nil {
			t.Fatal("expected error for non-existent objective")
		}
	})
}

func TestBackwardCompatClosingStatus(t *testing.T) {
	t.Run("existing completed status without closing fields works", func(t *testing.T) {
		manager, _, _ := newMockManager()

		obj, _ := testCreateObjective(manager,"T", "Objective")

		// Use the old SetObjectiveStatus path (no closing fields set)
		// First close all KRs to satisfy the check
		err := manager.SetObjectiveStatus(obj.ID, "completed")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		themes, _ := manager.GetHierarchy()
		found := findManagerObjectiveByID(themes[0].Objectives, obj.ID)
		if found.Status != "completed" {
			t.Errorf("expected status 'completed', got '%s'", found.Status)
		}
		// Closing fields should be empty (not set by old path)
		if found.ClosingStatus != "" {
			t.Errorf("expected empty closingStatus, got '%s'", found.ClosingStatus)
		}
		if found.ClosingNotes != "" {
			t.Errorf("expected empty closingNotes, got '%s'", found.ClosingNotes)
		}
		if found.ClosedAt != "" {
			t.Errorf("expected empty closedAt, got '%s'", found.ClosedAt)
		}
	})
}

func TestUnit_UpdateTaskPriority_MovesZone(t *testing.T) {
	manager, _, mockAccess := newMockManager()

	// 1. Create task with priority "important-urgent"
	task, err := manager.CreateTask("Test Task", "T", "important-urgent", "", "", "")
	if err != nil {
		t.Fatalf("CreateTask failed: %v", err)
	}

	assertTaskOrderConsistency(t, manager)

	// 2. Update task priority to "not-important-urgent"
	task.Priority = "not-important-urgent"
	err = manager.UpdateTask(*task)
	if err != nil {
		t.Fatalf("UpdateTask failed: %v", err)
	}

	// 3. Verify task moved from old zone to new zone in task_order.json
	orderMap, err := mockAccess.LoadTaskOrder()
	if err != nil {
		t.Fatalf("LoadTaskOrder failed: %v", err)
	}
	if slices.Contains(orderMap["important-urgent"], task.ID) {
		t.Errorf("task %s should NOT be in important-urgent zone after priority change", task.ID)
	}
	if !slices.Contains(orderMap["not-important-urgent"], task.ID) {
		t.Errorf("task %s should be in not-important-urgent zone after priority change", task.ID)
	}

	assertTaskOrderConsistency(t, manager)
}

func TestUnit_UpdateTaskPriority_NoZoneChangeForNonTodo(t *testing.T) {
	manager, _, _ := newMockManager()

	// Create task, move to doing
	task, _ := manager.CreateTask("Test Task", "T", "important-urgent", "", "", "")
	_, _ = manager.MoveTask(task.ID, "doing", nil)

	// Update priority on doing task — zone is status-based, not priority-based
	task.Priority = "not-important-urgent"
	err := manager.UpdateTask(*task)
	if err != nil {
		t.Fatalf("UpdateTask failed: %v", err)
	}

	assertTaskOrderConsistency(t, manager)
}

func TestUnit_UpdateTaskNoPriorityChange_NoOrderUpdate(t *testing.T) {
	manager, _, mockAccess := newMockManager()

	task, _ := manager.CreateTask("Test Task", "T", "important-urgent", "", "", "")

	// Update title only, same priority
	task.Title = "Updated Title"
	err := manager.UpdateTask(*task)
	if err != nil {
		t.Fatalf("UpdateTask failed: %v", err)
	}

	orderMap, _ := mockAccess.LoadTaskOrder()
	if !slices.Contains(orderMap["important-urgent"], task.ID) {
		t.Errorf("task %s should remain in important-urgent zone", task.ID)
	}

	assertTaskOrderConsistency(t, manager)
}

func TestUnit_ProcessPriorityPromotions_MovesZone(t *testing.T) {
	manager, _, mockAccess := newMockManager()

	// Create task with promotion date in the past
	task, err := manager.CreateTask("Promotable Task", "T", "important-not-urgent", "", "", "2020-01-01")
	if err != nil {
		t.Fatalf("CreateTask failed: %v", err)
	}

	// Verify initial zone
	orderBefore, _ := mockAccess.LoadTaskOrder()
	if !slices.Contains(orderBefore["important-not-urgent"], task.ID) {
		t.Fatalf("task should start in important-not-urgent zone")
	}

	// Process promotions
	promoted, err := manager.ProcessPriorityPromotions()
	if err != nil {
		t.Fatalf("ProcessPriorityPromotions failed: %v", err)
	}
	if len(promoted) != 1 {
		t.Fatalf("expected 1 promoted task, got %d", len(promoted))
	}

	// Verify zone moved
	orderAfter, _ := mockAccess.LoadTaskOrder()
	if slices.Contains(orderAfter["important-not-urgent"], task.ID) {
		t.Errorf("task %s should NOT be in important-not-urgent zone after promotion", task.ID)
	}
	if !slices.Contains(orderAfter["important-urgent"], task.ID) {
		t.Errorf("task %s should be in important-urgent zone after promotion", task.ID)
	}

	assertTaskOrderConsistency(t, manager)
}

// =============================================================================
// Archived Order Integration Tests
// =============================================================================

func TestUnit_ArchiveTask_PrependsToArchivedOrder(t *testing.T) {
	manager, _, mockAccess := newMockManager()

	// Create 2 tasks and move them to done
	t1, _ := manager.CreateTask("Task 1", "T", "important-urgent", "", "", "")
	t2, _ := manager.CreateTask("Task 2", "T", "important-urgent", "", "", "")
	_, _ = manager.MoveTask(t1.ID, "done", nil)
	_, _ = manager.MoveTask(t2.ID, "done", nil)

	// Archive them one at a time
	if err := manager.ArchiveTask(t1.ID); err != nil {
		t.Fatalf("failed to archive task 1: %v", err)
	}
	if err := manager.ArchiveTask(t2.ID); err != nil {
		t.Fatalf("failed to archive task 2: %v", err)
	}

	// The second archived task should appear first (most recent first)
	order, _ := mockAccess.LoadArchivedOrder()
	if len(order) != 2 {
		t.Fatalf("expected 2 entries in archived order, got %d", len(order))
	}
	if order[0] != t2.ID {
		t.Errorf("expected most recently archived task %s at position 0, got %s", t2.ID, order[0])
	}
	if order[1] != t1.ID {
		t.Errorf("expected first archived task %s at position 1, got %s", t1.ID, order[1])
	}
}

func TestUnit_ArchiveAllDoneTasks_PreservesRelativeOrder(t *testing.T) {
	manager, _, mockAccess := newMockManager()

	// Create 3 tasks and move them all to done
	t1, _ := manager.CreateTask("Task 1", "T", "important-urgent", "", "", "")
	t2, _ := manager.CreateTask("Task 2", "T", "important-urgent", "", "", "")
	t3, _ := manager.CreateTask("Task 3", "T", "important-urgent", "", "", "")
	_, _ = manager.MoveTask(t1.ID, "done", nil)
	_, _ = manager.MoveTask(t2.ID, "done", nil)
	_, _ = manager.MoveTask(t3.ID, "done", nil)

	// Set up a known display order in the done zone via task_order
	_ = mockAccess.SaveTaskOrder(map[string][]string{
		"done": {t3.ID, t1.ID, t2.ID},
	})

	// Archive a task first to act as "previously archived"
	priorTask, _ := manager.CreateTask("Prior", "T", "important-urgent", "", "", "")
	_, _ = manager.MoveTask(priorTask.ID, "done", nil)
	_ = manager.ArchiveTask(priorTask.ID)

	// Now archive all done tasks
	if err := manager.ArchiveAllDoneTasks(); err != nil {
		t.Fatalf("failed to archive all done tasks: %v", err)
	}

	order, _ := mockAccess.LoadArchivedOrder()
	// The done tasks should come before the previously archived task
	// Find positions of each in the order
	posOf := func(id string) int {
		for i, oid := range order {
			if oid == id {
				return i
			}
		}
		return -1
	}

	priorPos := posOf(priorTask.ID)
	t1Pos := posOf(t1.ID)
	t2Pos := posOf(t2.ID)
	t3Pos := posOf(t3.ID)

	if priorPos == -1 || t1Pos == -1 || t2Pos == -1 || t3Pos == -1 {
		t.Fatalf("expected all 4 tasks in archived order, got %v", order)
	}

	// All newly archived tasks should appear before the previously archived one
	if t1Pos >= priorPos {
		t.Errorf("task 1 (pos %d) should appear before prior task (pos %d)", t1Pos, priorPos)
	}
	if t2Pos >= priorPos {
		t.Errorf("task 2 (pos %d) should appear before prior task (pos %d)", t2Pos, priorPos)
	}
	if t3Pos >= priorPos {
		t.Errorf("task 3 (pos %d) should appear before prior task (pos %d)", t3Pos, priorPos)
	}

	// The relative order among the newly archived tasks should match
	// the done zone display order we set: t3, t1, t2
	if t3Pos >= t1Pos {
		t.Errorf("task 3 (pos %d) should appear before task 1 (pos %d) in archived order", t3Pos, t1Pos)
	}
	if t1Pos >= t2Pos {
		t.Errorf("task 1 (pos %d) should appear before task 2 (pos %d) in archived order", t1Pos, t2Pos)
	}
}

func TestUnit_RestoreTask_RemovesFromArchivedOrder(t *testing.T) {
	manager, _, mockAccess := newMockManager()

	// Create 3 tasks, move to done, then archive all
	t1, _ := manager.CreateTask("Task 1", "T", "important-urgent", "", "", "")
	t2, _ := manager.CreateTask("Task 2", "T", "important-urgent", "", "", "")
	t3, _ := manager.CreateTask("Task 3", "T", "important-urgent", "", "", "")
	_, _ = manager.MoveTask(t1.ID, "done", nil)
	_, _ = manager.MoveTask(t2.ID, "done", nil)
	_, _ = manager.MoveTask(t3.ID, "done", nil)

	_ = manager.ArchiveTask(t1.ID)
	_ = manager.ArchiveTask(t2.ID)
	_ = manager.ArchiveTask(t3.ID)

	// Archived order should be [t3, t2, t1] (most recent first)
	orderBefore, _ := mockAccess.LoadArchivedOrder()
	if len(orderBefore) != 3 {
		t.Fatalf("expected 3 entries before restore, got %d", len(orderBefore))
	}

	// Restore the middle one (t2)
	if err := manager.RestoreTask(t2.ID); err != nil {
		t.Fatalf("failed to restore task: %v", err)
	}

	orderAfter, _ := mockAccess.LoadArchivedOrder()
	if len(orderAfter) != 2 {
		t.Fatalf("expected 2 entries after restore, got %d: %v", len(orderAfter), orderAfter)
	}

	// t2 should not be in the archived order
	for _, id := range orderAfter {
		if id == t2.ID {
			t.Errorf("restored task %s should not be in archived order", t2.ID)
		}
	}

	// t3 and t1 should maintain their relative positions (t3 before t1)
	if orderAfter[0] != t3.ID {
		t.Errorf("expected %s at position 0, got %s", t3.ID, orderAfter[0])
	}
	if orderAfter[1] != t1.ID {
		t.Errorf("expected %s at position 1, got %s", t1.ID, orderAfter[1])
	}
}

func TestUnit_GetTasks_SortsArchivedByArchivedOrder(t *testing.T) {
	manager, _, mockAccess := newMockManager()

	// Directly set up archived tasks with specific order
	mockAccess.tasks["archived"] = []access.Task{
		{ID: "A1", Title: "Alpha", ThemeID: "T", Priority: "important-urgent", CreatedAt: "2026-01-01T00:00:00Z"},
		{ID: "A2", Title: "Beta", ThemeID: "T", Priority: "important-urgent", CreatedAt: "2026-01-02T00:00:00Z"},
		{ID: "A3", Title: "Gamma", ThemeID: "T", Priority: "important-urgent", CreatedAt: "2026-01-03T00:00:00Z"},
	}
	// Archived order: A3 first, then A1, then A2 (not matching CreatedAt order)
	mockAccess.archivedOrder = []string{"A3", "A1", "A2"}

	tasks, err := manager.GetTasks()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	// Filter to just archived tasks
	var archived []TaskWithStatus
	for _, tw := range tasks {
		if tw.Status == "archived" {
			archived = append(archived, tw)
		}
	}

	if len(archived) != 3 {
		t.Fatalf("expected 3 archived tasks, got %d", len(archived))
	}

	// Verify they come back in archived order position: A3, A1, A2
	expectedOrder := []string{"A3", "A1", "A2"}
	for i, expected := range expectedOrder {
		if archived[i].ID != expected {
			t.Errorf("archived task at position %d: expected %s, got %s", i, expected, archived[i].ID)
		}
	}
}

func TestUnit_GetTasks_ArchivedFallbackCreatedAtDescending(t *testing.T) {
	manager, _, mockAccess := newMockManager()

	// Set up archived tasks: some in archived order, some not
	mockAccess.tasks["archived"] = []access.Task{
		{ID: "A1", Title: "Ordered 1", ThemeID: "T", Priority: "important-urgent", CreatedAt: "2026-01-01T00:00:00Z"},
		{ID: "A2", Title: "Ordered 2", ThemeID: "T", Priority: "important-urgent", CreatedAt: "2026-01-02T00:00:00Z"},
		{ID: "U1", Title: "Unordered Old", ThemeID: "T", Priority: "important-urgent", CreatedAt: "2026-01-10T00:00:00Z"},
		{ID: "U2", Title: "Unordered New", ThemeID: "T", Priority: "important-urgent", CreatedAt: "2026-01-20T00:00:00Z"},
	}
	// Only A2 and A1 are in archived order (in that order); U1 and U2 are not
	mockAccess.archivedOrder = []string{"A2", "A1"}

	tasks, err := manager.GetTasks()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	var archived []TaskWithStatus
	for _, tw := range tasks {
		if tw.Status == "archived" {
			archived = append(archived, tw)
		}
	}

	if len(archived) != 4 {
		t.Fatalf("expected 4 archived tasks, got %d", len(archived))
	}

	// Ordered tasks come first (by position): A2, A1
	if archived[0].ID != "A2" {
		t.Errorf("position 0: expected A2 (ordered), got %s", archived[0].ID)
	}
	if archived[1].ID != "A1" {
		t.Errorf("position 1: expected A1 (ordered), got %s", archived[1].ID)
	}

	// Unordered tasks come after, sorted by CreatedAt descending (newest first)
	if archived[2].ID != "U2" {
		t.Errorf("position 2: expected U2 (newest unordered), got %s", archived[2].ID)
	}
	if archived[3].ID != "U1" {
		t.Errorf("position 3: expected U1 (oldest unordered), got %s", archived[3].ID)
	}
}
