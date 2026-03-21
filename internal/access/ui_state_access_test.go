package access

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func setupTestUIStateAccess(t *testing.T) (*UIStateAccess, string, func()) {
	t.Helper()

	tmpDir, err := os.MkdirTemp("", "ui_state_access_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	dataDir := filepath.Join(tmpDir, "data")
	if err := os.MkdirAll(filepath.Join(dataDir, "tasks"), 0755); err != nil {
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to create data dirs: %v", err)
	}

	ua := NewUIStateAccess(dataDir)

	cleanup := func() {
		os.RemoveAll(tmpDir)
	}

	return ua, tmpDir, cleanup
}

func TestUnit_LoadNavigationContext_ReturnsNilWhenFileDoesNotExist(t *testing.T) {
	ua, _, cleanup := setupTestUIStateAccess(t)
	defer cleanup()

	ctx, err := ua.LoadNavigationContext()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ctx != nil {
		t.Fatalf("expected nil context when file does not exist, got %+v", ctx)
	}
}

func TestUnit_LoadNavigationContext_ReturnsSavedContext(t *testing.T) {
	ua, _, cleanup := setupTestUIStateAccess(t)
	defer cleanup()

	todayFocus := true
	tagFocus := false
	visionCollapsed := true

	saved := NavigationContext{
		CurrentView:                  "eisenkan",
		CurrentItem:                  "task-42",
		FilterThemeID:                "THM",
		FilterThemeIDs:               []string{"THM", "WRK"},
		LastAccessed:                 "2026-03-21T10:00:00Z",
		ShowCompleted:                true,
		ShowArchived:                 false,
		ShowArchivedTasks:            true,
		ExpandedOkrIds:               []string{"THM-O1", "THM-O2"},
		FilterTagIDs:                 []string{"tag1", "tag2"},
		TodayFocusActive:             &todayFocus,
		TagFocusActive:               &tagFocus,
		CollapsedSections:            []string{"sec1"},
		CollapsedColumns:             []string{"col1"},
		CalendarDayEditorDate:        "2026-03-21",
		CalendarDayEditorExpandedIds: []string{"exp1"},
		VisionCollapsed:              &visionCollapsed,
	}

	if err := ua.SaveNavigationContext(saved); err != nil {
		t.Fatalf("unexpected error saving: %v", err)
	}

	loaded, err := ua.LoadNavigationContext()
	if err != nil {
		t.Fatalf("unexpected error loading: %v", err)
	}
	if loaded == nil {
		t.Fatal("expected non-nil context after save")
	}

	if loaded.CurrentView != saved.CurrentView {
		t.Errorf("CurrentView: expected %q, got %q", saved.CurrentView, loaded.CurrentView)
	}
	if loaded.CurrentItem != saved.CurrentItem {
		t.Errorf("CurrentItem: expected %q, got %q", saved.CurrentItem, loaded.CurrentItem)
	}
	if loaded.FilterThemeID != saved.FilterThemeID {
		t.Errorf("FilterThemeID: expected %q, got %q", saved.FilterThemeID, loaded.FilterThemeID)
	}
	if len(loaded.FilterThemeIDs) != len(saved.FilterThemeIDs) {
		t.Errorf("FilterThemeIDs length: expected %d, got %d", len(saved.FilterThemeIDs), len(loaded.FilterThemeIDs))
	}
	if loaded.LastAccessed != saved.LastAccessed {
		t.Errorf("LastAccessed: expected %q, got %q", saved.LastAccessed, loaded.LastAccessed)
	}
	if loaded.ShowCompleted != saved.ShowCompleted {
		t.Errorf("ShowCompleted: expected %v, got %v", saved.ShowCompleted, loaded.ShowCompleted)
	}
	if loaded.ShowArchivedTasks != saved.ShowArchivedTasks {
		t.Errorf("ShowArchivedTasks: expected %v, got %v", saved.ShowArchivedTasks, loaded.ShowArchivedTasks)
	}
	if len(loaded.ExpandedOkrIds) != len(saved.ExpandedOkrIds) {
		t.Errorf("ExpandedOkrIds length: expected %d, got %d", len(saved.ExpandedOkrIds), len(loaded.ExpandedOkrIds))
	}
	if len(loaded.FilterTagIDs) != len(saved.FilterTagIDs) {
		t.Errorf("FilterTagIDs length: expected %d, got %d", len(saved.FilterTagIDs), len(loaded.FilterTagIDs))
	}
	if loaded.TodayFocusActive == nil || *loaded.TodayFocusActive != todayFocus {
		t.Errorf("TodayFocusActive: expected %v, got %v", todayFocus, loaded.TodayFocusActive)
	}
	if loaded.TagFocusActive == nil || *loaded.TagFocusActive != tagFocus {
		t.Errorf("TagFocusActive: expected %v, got %v", tagFocus, loaded.TagFocusActive)
	}
	if len(loaded.CollapsedSections) != len(saved.CollapsedSections) {
		t.Errorf("CollapsedSections length: expected %d, got %d", len(saved.CollapsedSections), len(loaded.CollapsedSections))
	}
	if len(loaded.CollapsedColumns) != len(saved.CollapsedColumns) {
		t.Errorf("CollapsedColumns length: expected %d, got %d", len(saved.CollapsedColumns), len(loaded.CollapsedColumns))
	}
	if loaded.CalendarDayEditorDate != saved.CalendarDayEditorDate {
		t.Errorf("CalendarDayEditorDate: expected %q, got %q", saved.CalendarDayEditorDate, loaded.CalendarDayEditorDate)
	}
	if len(loaded.CalendarDayEditorExpandedIds) != len(saved.CalendarDayEditorExpandedIds) {
		t.Errorf("CalendarDayEditorExpandedIds length: expected %d, got %d", len(saved.CalendarDayEditorExpandedIds), len(loaded.CalendarDayEditorExpandedIds))
	}
	if loaded.VisionCollapsed == nil || *loaded.VisionCollapsed != visionCollapsed {
		t.Errorf("VisionCollapsed: expected %v, got %v", visionCollapsed, loaded.VisionCollapsed)
	}
}

func TestUnit_SaveNavigationContext_WritesAndReadsBack(t *testing.T) {
	ua, _, cleanup := setupTestUIStateAccess(t)
	defer cleanup()

	ctx := NavigationContext{
		CurrentView: "calendar",
		CurrentItem: "day-2026-03-21",
	}

	if err := ua.SaveNavigationContext(ctx); err != nil {
		t.Fatalf("unexpected error saving: %v", err)
	}

	loaded, err := ua.LoadNavigationContext()
	if err != nil {
		t.Fatalf("unexpected error loading: %v", err)
	}
	if loaded == nil {
		t.Fatal("expected non-nil context after save")
	}
	if loaded.CurrentView != "calendar" {
		t.Errorf("expected CurrentView 'calendar', got %q", loaded.CurrentView)
	}
	if loaded.CurrentItem != "day-2026-03-21" {
		t.Errorf("expected CurrentItem 'day-2026-03-21', got %q", loaded.CurrentItem)
	}
}

func TestUnit_LoadTaskDrafts_ReturnsNilWhenFileDoesNotExist(t *testing.T) {
	ua, _, cleanup := setupTestUIStateAccess(t)
	defer cleanup()

	data, err := ua.LoadTaskDrafts()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if data != nil {
		t.Fatalf("expected nil when file does not exist, got %s", string(data))
	}
}

func TestUnit_SaveTaskDrafts_WritesAndReadsBack(t *testing.T) {
	ua, _, cleanup := setupTestUIStateAccess(t)
	defer cleanup()

	drafts := json.RawMessage(`{"q1":[{"title":"Buy groceries"}],"q2":[]}`)

	if err := ua.SaveTaskDrafts(drafts); err != nil {
		t.Fatalf("unexpected error saving: %v", err)
	}

	loaded, err := ua.LoadTaskDrafts()
	if err != nil {
		t.Fatalf("unexpected error loading: %v", err)
	}
	if loaded == nil {
		t.Fatal("expected non-nil drafts after save")
	}
	if string(loaded) != string(drafts) {
		t.Errorf("expected %s, got %s", string(drafts), string(loaded))
	}
}
