package access

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/rkn/bearing/internal/utilities"
)

func TestUnit_LoadArchivedOrder_EmptyWhenFileMissing(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	order, err := env.tasks.LoadArchivedOrder()
	if err != nil {
		t.Fatalf("LoadArchivedOrder failed: %v", err)
	}
	if len(order) != 0 {
		t.Errorf("Expected empty slice, got %d entries", len(order))
	}
}

func TestUnit_LoadArchivedOrder_ReadsExistingFile(t *testing.T) {
	env, _, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	// Write a file directly to simulate pre-existing data
	expected := []string{"H-T3", "H-T2", "H-T1"}
	data, err := json.MarshalIndent(expected, "", "  ")
	if err != nil {
		t.Fatalf("Failed to marshal test data: %v", err)
	}
	filePath := filepath.Join(env.dataDir, "archived_order.json")
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	order, err := env.tasks.LoadArchivedOrder()
	if err != nil {
		t.Fatalf("LoadArchivedOrder failed: %v", err)
	}
	if len(order) != 3 {
		t.Fatalf("Expected 3 entries, got %d", len(order))
	}
	if order[0] != "H-T3" || order[1] != "H-T2" || order[2] != "H-T1" {
		t.Errorf("Unexpected order: %v", order)
	}
}

func TestUnit_WriteArchivedOrder_CreatesFile(t *testing.T) {
	env, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	gitConfig := &utilities.AuthorConfiguration{User: "Test", Email: "test@example.com"}
	repo, _ := utilities.InitializeRepositoryWithConfig(tmpDir, gitConfig)
	defer repo.Close()

	beforeHistory, err := repo.GetHistory(100)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	beforeCount := len(beforeHistory)

	order := []string{"H-T2", "H-T1"}
	if err := env.tasks.WriteArchivedOrder(order); err != nil {
		t.Fatalf("WriteArchivedOrder failed: %v", err)
	}

	filePath := filepath.Join(tmpDir, "data", "archived_order.json")
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		t.Error("Expected archived_order.json to exist on disk")
	}

	// Verify no git commit was created
	afterHistory, err := repo.GetHistory(100)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if len(afterHistory) != beforeCount {
		t.Errorf("Expected no new git commit, but commit count changed from %d to %d", beforeCount, len(afterHistory))
	}

	// Verify content round-trips
	loaded, err := env.tasks.LoadArchivedOrder()
	if err != nil {
		t.Fatalf("LoadArchivedOrder failed: %v", err)
	}
	if len(loaded) != 2 || loaded[0] != "H-T2" || loaded[1] != "H-T1" {
		t.Errorf("Unexpected loaded order: %v", loaded)
	}
}

func TestUnit_SaveArchivedOrder_CommitsToGit(t *testing.T) {
	env, tmpDir, cleanup := setupTestPlanAccess(t)
	defer cleanup()

	order := []string{"H-T3", "H-T2", "H-T1"}
	if err := env.tasks.SaveArchivedOrder(order); err != nil {
		t.Fatalf("SaveArchivedOrder failed: %v", err)
	}

	// Verify content round-trips
	loaded, err := env.tasks.LoadArchivedOrder()
	if err != nil {
		t.Fatalf("LoadArchivedOrder failed: %v", err)
	}
	if len(loaded) != 3 {
		t.Fatalf("Expected 3 entries, got %d", len(loaded))
	}
	if loaded[0] != "H-T3" || loaded[1] != "H-T2" || loaded[2] != "H-T1" {
		t.Errorf("Unexpected loaded order: %v", loaded)
	}

	// Verify a git commit was created
	gitConfig := &utilities.AuthorConfiguration{User: "Test", Email: "test@example.com"}
	repo, _ := utilities.InitializeRepositoryWithConfig(tmpDir, gitConfig)
	defer repo.Close()

	history, err := repo.GetHistory(10)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}

	found := false
	for _, c := range history {
		if c.Message == "Update archived order" {
			found = true
			break
		}
	}
	if !found {
		t.Error("Expected a git commit with message 'Update archived order'")
	}
}
