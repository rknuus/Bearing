package managers

import (
	"testing"

	"github.com/rkn/bearing/internal/access"
	"github.com/rkn/bearing/internal/engines/progress_engine"
)

func TestUnit_ToManagerTask_RoundTrip(t *testing.T) {
	original := access.Task{
		ID:            "task-1",
		Title:         "Test Task",
		Description:   "A description",
		ThemeID:       "T",
		Priority:      "important-urgent",
		Tags:          []string{"tag1", "tag2"},
		PromotionDate: "2026-04-01",
		CreatedAt:     "2026-03-20T10:00:00Z",
		UpdatedAt:     "2026-03-20T12:00:00Z",
	}
	mTask := toManagerTask(original)
	result := toAccessTask(mTask)
	assertTaskEqual(t, original, result)
}

func TestUnit_ToManagerTask_EmptyOptionals(t *testing.T) {
	original := access.Task{
		ID:       "task-2",
		Title:    "Minimal",
		ThemeID:  "T",
		Priority: "important-not-urgent",
	}
	mTask := toManagerTask(original)
	result := toAccessTask(mTask)
	assertTaskEqual(t, original, result)
}

func TestUnit_ToManagerKeyResult_RoundTrip(t *testing.T) {
	original := access.KeyResult{
		ID:           "kr-1",
		ParentID:     "obj-1",
		Description:  "Run 100 miles",
		Type:         "numeric",
		Status:       "active",
		StartValue:   0,
		CurrentValue: 42,
		TargetValue:  100,
	}
	mKR := toManagerKeyResult(original)
	result := toAccessKeyResult(mKR)
	assertKeyResultEqual(t, original, result)
}

func TestUnit_ToManagerRoutine_RoundTrip(t *testing.T) {
	original := access.Routine{
		ID:           "r-1",
		Description:  "Weekly exercise",
		CurrentValue: 3,
		TargetValue:  4,
		TargetType:   "at_least",
		Unit:         "sessions",
	}
	mRoutine := toManagerRoutine(original)
	result := toAccessRoutine(mRoutine)
	assertRoutineEqual(t, original, result)
}

func TestUnit_ToManagerRoutine_RoundTripWithRepeatPattern(t *testing.T) {
	original := access.Routine{
		ID:           "r-2",
		Description:  "Daily meditation",
		CurrentValue: 1,
		TargetValue:  1,
		TargetType:   "at_least",
		Unit:         "sessions",
		RepeatPattern: &access.RepeatPattern{
			Frequency: "weekly",
			Interval:  1,
			Weekdays:  []int{0, 2, 4},
			StartDate: "2026-04-01",
		},
	}
	mRoutine := toManagerRoutine(original)
	result := toAccessRoutine(mRoutine)
	assertRoutineEqual(t, original, result)
}

func TestUnit_ToManagerObjective_RoundTrip(t *testing.T) {
	original := access.Objective{
		ID:            "obj-1",
		ParentID:      "T",
		Title:         "Get fit",
		Status:        "active",
		Tags:          []string{"health"},
		ClosingStatus: "achieved",
		ClosingNotes:  "Done well",
		ClosedAt:      "2026-03-15",
		KeyResults: []access.KeyResult{
			{ID: "kr-1", ParentID: "obj-1", Description: "Run 100 miles", TargetValue: 100, CurrentValue: 50},
		},
		Objectives: []access.Objective{
			{ID: "obj-2", ParentID: "obj-1", Title: "Sub-objective", KeyResults: []access.KeyResult{}},
		},
	}
	mObj := toManagerObjective(original)
	result := toAccessObjective(mObj)
	assertObjectiveEqual(t, original, result)
}

func TestUnit_ToManagerObjective_Empty(t *testing.T) {
	original := access.Objective{
		ID:         "obj-3",
		Title:      "Empty objective",
		KeyResults: []access.KeyResult{},
	}
	mObj := toManagerObjective(original)
	result := toAccessObjective(mObj)
	assertObjectiveEqual(t, original, result)
}

func TestUnit_ToManagerLifeTheme_RoundTrip(t *testing.T) {
	original := access.LifeTheme{
		ID:    "T",
		Name:  "Health",
		Color: "#3b82f6",
		Objectives: []access.Objective{
			{
				ID: "obj-1", ParentID: "T", Title: "Get fit",
				KeyResults: []access.KeyResult{
					{ID: "kr-1", ParentID: "obj-1", Description: "Run", TargetValue: 100},
				},
			},
		},
		Routines: []access.Routine{
			{ID: "r-1", Description: "Exercise", CurrentValue: 3, TargetValue: 4, TargetType: "at_least"},
		},
	}
	mTheme := toManagerLifeTheme(original)
	result := toAccessLifeTheme(mTheme)
	assertLifeThemeEqual(t, original, result)
}

func TestUnit_ToManagerLifeTheme_NoRoutines(t *testing.T) {
	original := access.LifeTheme{
		ID:         "T",
		Name:       "Career",
		Color:      "#ef4444",
		Objectives: []access.Objective{},
	}
	mTheme := toManagerLifeTheme(original)
	result := toAccessLifeTheme(mTheme)
	if len(result.Routines) != 0 {
		t.Errorf("expected nil/empty routines, got %d", len(result.Routines))
	}
}

func TestUnit_ToManagerDayFocus_RoundTrip(t *testing.T) {
	original := access.DayFocus{
		Date:     "2026-03-20",
		ThemeIDs: []string{"T1", "T2"},
		Notes:    "Focus day",
		Text:     "Some text",
		OkrIDs:   []string{"obj-1"},
		Tags:     []string{"daily"},
	}
	mDF := toManagerDayFocus(original)
	result := toAccessDayFocus(mDF)
	assertDayFocusEqual(t, original, result)
}

func TestUnit_ToManagerDayFocus_EmptySlices(t *testing.T) {
	original := access.DayFocus{
		Date: "2026-01-01",
	}
	mDF := toManagerDayFocus(original)
	result := toAccessDayFocus(mDF)
	if result.Date != original.Date {
		t.Errorf("date: got %q, want %q", result.Date, original.Date)
	}
}

func TestUnit_ToManagerBoardConfig(t *testing.T) {
	original := &access.BoardConfiguration{
		Name: "Test Board",
		ColumnDefinitions: []access.ColumnDefinition{
			{
				Name:  "todo",
				Title: "TODO",
				Type:  access.ColumnTypeTodo,
				Sections: []access.SectionDefinition{
					{Name: "important-urgent", Title: "I&U", Color: "#ef4444"},
					{Name: "important-not-urgent", Title: "I&nU", Color: "#3b82f6"},
				},
			},
			{
				Name:  "doing",
				Title: "Doing",
				Type:  "custom",
			},
			{
				Name:  "done",
				Title: "Done",
				Type:  access.ColumnTypeDone,
			},
		},
	}
	result := toManagerBoardConfig(original)
	if result.Name != original.Name {
		t.Errorf("name: got %q, want %q", result.Name, original.Name)
	}
	if len(result.ColumnDefinitions) != len(original.ColumnDefinitions) {
		t.Fatalf("columns: got %d, want %d", len(result.ColumnDefinitions), len(original.ColumnDefinitions))
	}
	// Check todo column with sections
	todoCol := result.ColumnDefinitions[0]
	if todoCol.Name != "todo" || todoCol.Type != string(access.ColumnTypeTodo) {
		t.Errorf("todo column: name=%q type=%q", todoCol.Name, todoCol.Type)
	}
	if len(todoCol.Sections) != 2 {
		t.Fatalf("todo sections: got %d, want 2", len(todoCol.Sections))
	}
	if todoCol.Sections[0].Name != "important-urgent" || todoCol.Sections[0].Color != "#ef4444" {
		t.Errorf("section 0: name=%q color=%q", todoCol.Sections[0].Name, todoCol.Sections[0].Color)
	}
	// Check custom column without sections
	doingCol := result.ColumnDefinitions[1]
	if doingCol.Name != "doing" || doingCol.Type != "custom" {
		t.Errorf("doing column: name=%q type=%q", doingCol.Name, doingCol.Type)
	}
	if len(doingCol.Sections) != 0 {
		t.Errorf("doing sections: got %d, want 0", len(doingCol.Sections))
	}
}

func TestUnit_ToManagerPersonalVision(t *testing.T) {
	original := &access.PersonalVision{
		Mission:   "Make the world better",
		Vision:    "A peaceful world",
		UpdatedAt: "2026-03-20T10:00:00Z",
	}
	result := toManagerPersonalVision(original)
	if result.Mission != original.Mission {
		t.Errorf("mission: got %q, want %q", result.Mission, original.Mission)
	}
	if result.Vision != original.Vision {
		t.Errorf("vision: got %q, want %q", result.Vision, original.Vision)
	}
	if result.UpdatedAt != original.UpdatedAt {
		t.Errorf("updatedAt: got %q, want %q", result.UpdatedAt, original.UpdatedAt)
	}
}

func TestUnit_ToEngineThemeData(t *testing.T) {
	theme := access.LifeTheme{
		ID: "T",
		Objectives: []access.Objective{
			{
				ID:     "obj-1",
				Status: "active",
				KeyResults: []access.KeyResult{
					{ID: "kr-1", Status: "active", StartValue: 0, CurrentValue: 50, TargetValue: 100},
					{ID: "kr-2", Status: "completed", StartValue: 0, CurrentValue: 10, TargetValue: 10},
				},
				Objectives: []access.Objective{
					{
						ID:     "obj-2",
						Status: "active",
						KeyResults: []access.KeyResult{
							{ID: "kr-3", StartValue: 0, CurrentValue: 0, TargetValue: 5},
						},
					},
				},
			},
		},
	}
	result := toEngineThemeData(theme)
	if result.ID != "T" {
		t.Errorf("ID: got %q, want %q", result.ID, "T")
	}
	if len(result.Objectives) != 1 {
		t.Fatalf("objectives: got %d, want 1", len(result.Objectives))
	}
	obj := result.Objectives[0]
	assertEngineObjective(t, obj, "obj-1", "active", 2, 1)
	// Check key results mapped correctly
	if obj.KeyResults[0].CurrentValue != 50 || obj.KeyResults[0].TargetValue != 100 {
		t.Errorf("kr-1 values: current=%d target=%d", obj.KeyResults[0].CurrentValue, obj.KeyResults[0].TargetValue)
	}
	// Check nested objective
	child := obj.Objectives[0]
	assertEngineObjective(t, child, "obj-2", "active", 1, 0)
}

func TestUnit_ToEngineThemeData_Empty(t *testing.T) {
	theme := access.LifeTheme{ID: "T", Objectives: []access.Objective{}}
	result := toEngineThemeData(theme)
	if result.ID != "T" {
		t.Errorf("ID: got %q, want %q", result.ID, "T")
	}
	if len(result.Objectives) != 0 {
		t.Errorf("objectives: got %d, want 0", len(result.Objectives))
	}
}

// --- helpers ---

func assertTaskEqual(t *testing.T, want, got access.Task) {
	t.Helper()
	if got.ID != want.ID {
		t.Errorf("ID: got %q, want %q", got.ID, want.ID)
	}
	if got.Title != want.Title {
		t.Errorf("Title: got %q, want %q", got.Title, want.Title)
	}
	if got.Description != want.Description {
		t.Errorf("Description: got %q, want %q", got.Description, want.Description)
	}
	if got.ThemeID != want.ThemeID {
		t.Errorf("ThemeID: got %q, want %q", got.ThemeID, want.ThemeID)
	}
	if got.Priority != want.Priority {
		t.Errorf("Priority: got %q, want %q", got.Priority, want.Priority)
	}
	assertStringSlice(t, "Tags", want.Tags, got.Tags)
	if got.PromotionDate != want.PromotionDate {
		t.Errorf("PromotionDate: got %q, want %q", got.PromotionDate, want.PromotionDate)
	}
	if got.CreatedAt != want.CreatedAt {
		t.Errorf("CreatedAt: got %q, want %q", got.CreatedAt, want.CreatedAt)
	}
	if got.UpdatedAt != want.UpdatedAt {
		t.Errorf("UpdatedAt: got %q, want %q", got.UpdatedAt, want.UpdatedAt)
	}
}

func assertKeyResultEqual(t *testing.T, want, got access.KeyResult) {
	t.Helper()
	if got.ID != want.ID {
		t.Errorf("ID: got %q, want %q", got.ID, want.ID)
	}
	if got.ParentID != want.ParentID {
		t.Errorf("ParentID: got %q, want %q", got.ParentID, want.ParentID)
	}
	if got.Description != want.Description {
		t.Errorf("Description: got %q, want %q", got.Description, want.Description)
	}
	if got.Type != want.Type {
		t.Errorf("Type: got %q, want %q", got.Type, want.Type)
	}
	if got.Status != want.Status {
		t.Errorf("Status: got %q, want %q", got.Status, want.Status)
	}
	if got.StartValue != want.StartValue {
		t.Errorf("StartValue: got %d, want %d", got.StartValue, want.StartValue)
	}
	if got.CurrentValue != want.CurrentValue {
		t.Errorf("CurrentValue: got %d, want %d", got.CurrentValue, want.CurrentValue)
	}
	if got.TargetValue != want.TargetValue {
		t.Errorf("TargetValue: got %d, want %d", got.TargetValue, want.TargetValue)
	}
}

func assertRoutineEqual(t *testing.T, want, got access.Routine) {
	t.Helper()
	if got.ID != want.ID {
		t.Errorf("ID: got %q, want %q", got.ID, want.ID)
	}
	if got.Description != want.Description {
		t.Errorf("Description: got %q, want %q", got.Description, want.Description)
	}
	if got.CurrentValue != want.CurrentValue {
		t.Errorf("CurrentValue: got %d, want %d", got.CurrentValue, want.CurrentValue)
	}
	if got.TargetValue != want.TargetValue {
		t.Errorf("TargetValue: got %d, want %d", got.TargetValue, want.TargetValue)
	}
	if got.TargetType != want.TargetType {
		t.Errorf("TargetType: got %q, want %q", got.TargetType, want.TargetType)
	}
	if got.Unit != want.Unit {
		t.Errorf("Unit: got %q, want %q", got.Unit, want.Unit)
	}
	if (want.RepeatPattern == nil) != (got.RepeatPattern == nil) {
		t.Errorf("RepeatPattern: got nil=%v, want nil=%v", got.RepeatPattern == nil, want.RepeatPattern == nil)
	} else if want.RepeatPattern != nil {
		if got.RepeatPattern.Frequency != want.RepeatPattern.Frequency {
			t.Errorf("RepeatPattern.Frequency: got %q, want %q", got.RepeatPattern.Frequency, want.RepeatPattern.Frequency)
		}
		if got.RepeatPattern.Interval != want.RepeatPattern.Interval {
			t.Errorf("RepeatPattern.Interval: got %d, want %d", got.RepeatPattern.Interval, want.RepeatPattern.Interval)
		}
		if got.RepeatPattern.StartDate != want.RepeatPattern.StartDate {
			t.Errorf("RepeatPattern.StartDate: got %q, want %q", got.RepeatPattern.StartDate, want.RepeatPattern.StartDate)
		}
	}
}

func assertObjectiveEqual(t *testing.T, want, got access.Objective) {
	t.Helper()
	if got.ID != want.ID {
		t.Errorf("ID: got %q, want %q", got.ID, want.ID)
	}
	if got.ParentID != want.ParentID {
		t.Errorf("ParentID: got %q, want %q", got.ParentID, want.ParentID)
	}
	if got.Title != want.Title {
		t.Errorf("Title: got %q, want %q", got.Title, want.Title)
	}
	if got.Status != want.Status {
		t.Errorf("Status: got %q, want %q", got.Status, want.Status)
	}
	assertStringSlice(t, "Tags", want.Tags, got.Tags)
	if got.ClosingStatus != want.ClosingStatus {
		t.Errorf("ClosingStatus: got %q, want %q", got.ClosingStatus, want.ClosingStatus)
	}
	if got.ClosingNotes != want.ClosingNotes {
		t.Errorf("ClosingNotes: got %q, want %q", got.ClosingNotes, want.ClosingNotes)
	}
	if got.ClosedAt != want.ClosedAt {
		t.Errorf("ClosedAt: got %q, want %q", got.ClosedAt, want.ClosedAt)
	}
	if len(got.KeyResults) != len(want.KeyResults) {
		t.Fatalf("KeyResults length: got %d, want %d", len(got.KeyResults), len(want.KeyResults))
	}
	for i := range want.KeyResults {
		assertKeyResultEqual(t, want.KeyResults[i], got.KeyResults[i])
	}
	if len(got.Objectives) != len(want.Objectives) {
		t.Fatalf("Objectives length: got %d, want %d", len(got.Objectives), len(want.Objectives))
	}
	for i := range want.Objectives {
		assertObjectiveEqual(t, want.Objectives[i], got.Objectives[i])
	}
}

func assertLifeThemeEqual(t *testing.T, want, got access.LifeTheme) {
	t.Helper()
	if got.ID != want.ID {
		t.Errorf("ID: got %q, want %q", got.ID, want.ID)
	}
	if got.Name != want.Name {
		t.Errorf("Name: got %q, want %q", got.Name, want.Name)
	}
	if got.Color != want.Color {
		t.Errorf("Color: got %q, want %q", got.Color, want.Color)
	}
	if len(got.Objectives) != len(want.Objectives) {
		t.Fatalf("Objectives length: got %d, want %d", len(got.Objectives), len(want.Objectives))
	}
	for i := range want.Objectives {
		assertObjectiveEqual(t, want.Objectives[i], got.Objectives[i])
	}
	if len(got.Routines) != len(want.Routines) {
		t.Fatalf("Routines length: got %d, want %d", len(got.Routines), len(want.Routines))
	}
	for i := range want.Routines {
		assertRoutineEqual(t, want.Routines[i], got.Routines[i])
	}
}

func assertDayFocusEqual(t *testing.T, want, got access.DayFocus) {
	t.Helper()
	if got.Date != want.Date {
		t.Errorf("Date: got %q, want %q", got.Date, want.Date)
	}
	assertStringSlice(t, "ThemeIDs", want.ThemeIDs, got.ThemeIDs)
	if got.Notes != want.Notes {
		t.Errorf("Notes: got %q, want %q", got.Notes, want.Notes)
	}
	if got.Text != want.Text {
		t.Errorf("Text: got %q, want %q", got.Text, want.Text)
	}
	assertStringSlice(t, "OkrIDs", want.OkrIDs, got.OkrIDs)
	assertStringSlice(t, "Tags", want.Tags, got.Tags)
}

func assertStringSlice(t *testing.T, name string, want, got []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Errorf("%s length: got %d, want %d", name, len(got), len(want))
		return
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("%s[%d]: got %q, want %q", name, i, got[i], want[i])
		}
	}
}

func assertEngineObjective(t *testing.T, obj progress_engine.ObjectiveData, id, status string, krCount, childCount int) {
	t.Helper()
	if obj.ID != id {
		t.Errorf("ID: got %q, want %q", obj.ID, id)
	}
	if obj.Status != status {
		t.Errorf("Status: got %q, want %q", obj.Status, status)
	}
	if len(obj.KeyResults) != krCount {
		t.Errorf("KeyResults: got %d, want %d", len(obj.KeyResults), krCount)
	}
	if len(obj.Objectives) != childCount {
		t.Errorf("Objectives: got %d, want %d", len(obj.Objectives), childCount)
	}
}
