package managers

import (
	"testing"

	"github.com/rkn/bearing/internal/access"
)

// newMockWorkspaceManager creates a WorkspaceManager with a mock task access for testing.
func newMockWorkspaceManager() (*WorkspaceManager, *mockTaskAccess) {
	ta := newMockTaskAccess()
	wm, _ := NewWorkspaceManager(ta)
	return wm, ta
}

func TestNewWorkspaceManager(t *testing.T) {
	t.Run("creates workspace manager with valid access", func(t *testing.T) {
		wm, err := NewWorkspaceManager(newMockTaskAccess())
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
		if wm == nil {
			t.Fatal("expected workspace manager, got nil")
		}
	})

	t.Run("returns error with nil access", func(t *testing.T) {
		_, err := NewWorkspaceManager(nil)
		if err == nil {
			t.Fatal("expected error for nil access")
		}
	})
}

func TestWorkspace_GetBoardConfiguration(t *testing.T) {
	wm, _ := newMockWorkspaceManager()

	config, err := wm.GetBoardConfiguration()
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
}

func TestWorkspace_AddColumn(t *testing.T) {
	wm, _ := newMockWorkspaceManager()

	config, err := wm.AddColumn("In Review", "doing")
	if err != nil {
		t.Fatalf("AddColumn failed: %v", err)
	}
	if len(config.ColumnDefinitions) != 4 {
		t.Errorf("Expected 4 columns, got %d", len(config.ColumnDefinitions))
	}
	if config.ColumnDefinitions[2].Name != "in-review" {
		t.Errorf("Expected 'in-review' at index 2, got %q", config.ColumnDefinitions[2].Name)
	}
	if config.ColumnDefinitions[2].Title != "In Review" {
		t.Errorf("Expected title 'In Review', got %q", config.ColumnDefinitions[2].Title)
	}
	if config.ColumnDefinitions[2].Type != "doing" {
		t.Errorf("Expected doing type, got %q", config.ColumnDefinitions[2].Type)
	}
}

func TestWorkspace_AddColumn_DuplicateSlug(t *testing.T) {
	wm, _ := newMockWorkspaceManager()

	_, err := wm.AddColumn("Doing", "todo")
	if err == nil {
		t.Fatal("expected error for duplicate slug")
	}
}

func TestWorkspace_AddColumn_ReservedSlug(t *testing.T) {
	wm, _ := newMockWorkspaceManager()

	_, err := wm.AddColumn("Archived", "doing")
	if err == nil {
		t.Fatal("expected error for reserved slug")
	}
}

func TestWorkspace_AddColumn_AfterDone(t *testing.T) {
	wm, _ := newMockWorkspaceManager()

	_, err := wm.AddColumn("After Done", "done")
	if err == nil {
		t.Fatal("expected error for inserting after done")
	}
}

func TestWorkspace_RemoveColumn(t *testing.T) {
	wm, _ := newMockWorkspaceManager()

	// First add a column
	_, err := wm.AddColumn("Review", "doing")
	if err != nil {
		t.Fatalf("AddColumn failed: %v", err)
	}

	// Then remove it
	config, err := wm.RemoveColumn("review")
	if err != nil {
		t.Fatalf("RemoveColumn failed: %v", err)
	}
	if len(config.ColumnDefinitions) != 3 {
		t.Errorf("Expected 3 columns after removal, got %d", len(config.ColumnDefinitions))
	}
}

func TestWorkspace_RemoveColumn_NonEmpty(t *testing.T) {
	wm, mockTasks := newMockWorkspaceManager()

	_, err := wm.AddColumn("Review", "doing")
	if err != nil {
		t.Fatalf("AddColumn failed: %v", err)
	}

	// Add a task to the column
	mockTasks.tasks["review"] = []access.Task{{ID: "T-T1", ThemeID: "T", Title: "Test"}}

	_, err = wm.RemoveColumn("review")
	if err == nil {
		t.Fatal("expected error for non-empty column")
	}
}

func TestWorkspace_RemoveColumn_TodoType(t *testing.T) {
	wm, _ := newMockWorkspaceManager()

	_, err := wm.RemoveColumn("todo")
	if err == nil {
		t.Fatal("expected error for removing todo column")
	}
}

func TestWorkspace_RemoveColumn_DoneType(t *testing.T) {
	wm, _ := newMockWorkspaceManager()

	_, err := wm.RemoveColumn("done")
	if err == nil {
		t.Fatal("expected error for removing done column")
	}
}

func TestWorkspace_RenameColumn(t *testing.T) {
	wm, _ := newMockWorkspaceManager()

	config, err := wm.RenameColumn("doing", "In Progress")
	if err != nil {
		t.Fatalf("RenameColumn failed: %v", err)
	}
	if len(config.ColumnDefinitions) != 3 {
		t.Errorf("Expected 3 columns, got %d", len(config.ColumnDefinitions))
	}
	if config.ColumnDefinitions[1].Name != "in-progress" {
		t.Errorf("Expected slug 'in-progress', got %q", config.ColumnDefinitions[1].Name)
	}
	if config.ColumnDefinitions[1].Title != "In Progress" {
		t.Errorf("Expected title 'In Progress', got %q", config.ColumnDefinitions[1].Title)
	}
}

func TestWorkspace_RenameColumn_TitleOnlyChange(t *testing.T) {
	wm, _ := newMockWorkspaceManager()

	// "Doing" slugifies to "doing" which matches oldSlug — title-only change
	config, err := wm.RenameColumn("doing", "Doing")
	if err != nil {
		t.Fatalf("RenameColumn failed: %v", err)
	}
	if config.ColumnDefinitions[1].Name != "doing" {
		t.Errorf("Expected slug 'doing' unchanged, got %q", config.ColumnDefinitions[1].Name)
	}
	if config.ColumnDefinitions[1].Title != "Doing" {
		t.Errorf("Expected title 'Doing', got %q", config.ColumnDefinitions[1].Title)
	}
}

func TestWorkspace_RenameColumn_DuplicateSlug(t *testing.T) {
	wm, _ := newMockWorkspaceManager()

	_, err := wm.RenameColumn("doing", "Todo")
	if err == nil {
		t.Fatal("expected error for duplicate slug")
	}
}

func TestWorkspace_ReorderColumns(t *testing.T) {
	wm, _ := newMockWorkspaceManager()

	_, _ = wm.AddColumn("Review", "doing")
	_, _ = wm.AddColumn("Testing", "review")

	config, err := wm.ReorderColumns([]string{"todo", "testing", "review", "doing", "done"})
	if err != nil {
		t.Fatalf("ReorderColumns failed: %v", err)
	}
	if len(config.ColumnDefinitions) != 5 {
		t.Errorf("Expected 5 columns, got %d", len(config.ColumnDefinitions))
	}
	if config.ColumnDefinitions[1].Name != "testing" {
		t.Errorf("Expected 'testing' at index 1, got %q", config.ColumnDefinitions[1].Name)
	}
}

func TestWorkspace_ReorderColumns_TodoNotFirst(t *testing.T) {
	wm, _ := newMockWorkspaceManager()

	_, err := wm.ReorderColumns([]string{"doing", "todo", "done"})
	if err == nil {
		t.Fatal("expected error when todo is not first")
	}
}

func TestWorkspace_ReorderColumns_DoneNotLast(t *testing.T) {
	wm, _ := newMockWorkspaceManager()

	_, err := wm.ReorderColumns([]string{"todo", "done", "doing"})
	if err == nil {
		t.Fatal("expected error when done is not last")
	}
}
