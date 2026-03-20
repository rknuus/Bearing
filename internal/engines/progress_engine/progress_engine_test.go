package progress_engine

import (
	"math"
	"testing"
)

func TestUnit_ComputeKRProgress(t *testing.T) {
	tests := []struct {
		name string
		kr   KeyResultData
		want float64
	}{
		{"zero target returns -1", KeyResultData{TargetValue: 0}, -1},
		{"start equals target returns 0", KeyResultData{StartValue: 5, CurrentValue: 5, TargetValue: 5}, 0},
		{"halfway", KeyResultData{StartValue: 0, CurrentValue: 50, TargetValue: 100}, 50},
		{"complete", KeyResultData{StartValue: 0, CurrentValue: 100, TargetValue: 100}, 100},
		{"over 100 clamped", KeyResultData{StartValue: 0, CurrentValue: 150, TargetValue: 100}, 100},
		{"below zero clamped", KeyResultData{StartValue: 50, CurrentValue: 10, TargetValue: 100}, 0},
		{"nonzero start", KeyResultData{StartValue: 20, CurrentValue: 60, TargetValue: 100}, 50},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := computeKRProgress(tt.kr)
			if !floatEqual(got, tt.want) {
				t.Errorf("computeKRProgress() = %f, want %f", got, tt.want)
			}
		})
	}
}

func TestUnit_IsActiveOKRStatus(t *testing.T) {
	if !isActiveOKRStatus("") {
		t.Error("empty string should be active")
	}
	if !isActiveOKRStatus("active") {
		t.Error("\"active\" should be active")
	}
	if isActiveOKRStatus("completed") {
		t.Error("\"completed\" should not be active")
	}
	if isActiveOKRStatus("archived") {
		t.Error("\"archived\" should not be active")
	}
}

func TestUnit_ComputeAllThemeProgress_NoThemes(t *testing.T) {
	pe := NewProgressEngine()
	result := pe.ComputeAllThemeProgress(nil)
	if len(result) != 0 {
		t.Errorf("expected 0 themes, got %d", len(result))
	}
}

func TestUnit_ComputeAllThemeProgress_NoObjectives(t *testing.T) {
	pe := NewProgressEngine()
	result := pe.ComputeAllThemeProgress([]ThemeData{
		{ID: "T1", Objectives: []ObjectiveData{}},
	})
	if len(result) != 1 {
		t.Fatalf("expected 1 theme, got %d", len(result))
	}
	if result[0].ThemeID != "T1" {
		t.Errorf("ThemeID = %q, want T1", result[0].ThemeID)
	}
	if result[0].Progress != -1 {
		t.Errorf("Progress = %f, want -1", result[0].Progress)
	}
}

func TestUnit_ComputeAllThemeProgress_SingleKR(t *testing.T) {
	pe := NewProgressEngine()
	result := pe.ComputeAllThemeProgress([]ThemeData{
		{ID: "T1", Objectives: []ObjectiveData{
			{ID: "O1", Status: "active", KeyResults: []KeyResultData{
				{ID: "KR1", Status: "active", StartValue: 0, CurrentValue: 50, TargetValue: 100},
			}},
		}},
	})
	if len(result) != 1 {
		t.Fatalf("expected 1 theme, got %d", len(result))
	}
	if !floatEqual(result[0].Progress, 50) {
		t.Errorf("Theme progress = %f, want 50", result[0].Progress)
	}
	if len(result[0].Objectives) != 1 {
		t.Fatalf("expected 1 objective progress, got %d", len(result[0].Objectives))
	}
	if !floatEqual(result[0].Objectives[0].Progress, 50) {
		t.Errorf("Objective progress = %f, want 50", result[0].Objectives[0].Progress)
	}
}

func TestUnit_ComputeAllThemeProgress_SkipsNonActive(t *testing.T) {
	pe := NewProgressEngine()
	result := pe.ComputeAllThemeProgress([]ThemeData{
		{ID: "T1", Objectives: []ObjectiveData{
			{ID: "O1", Status: "completed", KeyResults: []KeyResultData{
				{ID: "KR1", Status: "active", StartValue: 0, CurrentValue: 100, TargetValue: 100},
			}},
		}},
	})
	if !floatEqual(result[0].Progress, -1) {
		t.Errorf("Progress = %f, want -1 (completed objective should be skipped)", result[0].Progress)
	}
}

func TestUnit_ComputeAllThemeProgress_SkipsNonActiveKR(t *testing.T) {
	pe := NewProgressEngine()
	result := pe.ComputeAllThemeProgress([]ThemeData{
		{ID: "T1", Objectives: []ObjectiveData{
			{ID: "O1", Status: "active", KeyResults: []KeyResultData{
				{ID: "KR1", Status: "completed", StartValue: 0, CurrentValue: 100, TargetValue: 100},
				{ID: "KR2", Status: "active", StartValue: 0, CurrentValue: 30, TargetValue: 100},
			}},
		}},
	})
	// Only KR2 (active) should count
	if !floatEqual(result[0].Objectives[0].Progress, 30) {
		t.Errorf("Objective progress = %f, want 30 (completed KR should be skipped)", result[0].Objectives[0].Progress)
	}
}

func TestUnit_ComputeAllThemeProgress_NestedObjectives(t *testing.T) {
	pe := NewProgressEngine()
	result := pe.ComputeAllThemeProgress([]ThemeData{
		{ID: "T1", Objectives: []ObjectiveData{
			{ID: "O1", Status: "active",
				KeyResults: []KeyResultData{
					{ID: "KR1", Status: "active", StartValue: 0, CurrentValue: 100, TargetValue: 100},
				},
				Objectives: []ObjectiveData{
					{ID: "O2", Status: "active", KeyResults: []KeyResultData{
						{ID: "KR2", Status: "active", StartValue: 0, CurrentValue: 0, TargetValue: 100},
					}},
				},
			},
		}},
	})
	// O1 progress = average(KR1=100, O2=0) = 50
	if !floatEqual(result[0].Progress, 50) {
		t.Errorf("Theme progress = %f, want 50", result[0].Progress)
	}
	// Should have progress entries for both O1 and O2
	if len(result[0].Objectives) != 2 {
		t.Fatalf("expected 2 objective progress entries, got %d", len(result[0].Objectives))
	}
}

func TestUnit_ComputeAllThemeProgress_MultipleThemes(t *testing.T) {
	pe := NewProgressEngine()
	result := pe.ComputeAllThemeProgress([]ThemeData{
		{ID: "T1", Objectives: []ObjectiveData{
			{ID: "O1", Status: "active", KeyResults: []KeyResultData{
				{ID: "KR1", Status: "active", StartValue: 0, CurrentValue: 100, TargetValue: 100},
			}},
		}},
		{ID: "T2", Objectives: []ObjectiveData{
			{ID: "O2", Status: "active", KeyResults: []KeyResultData{
				{ID: "KR2", Status: "active", StartValue: 0, CurrentValue: 0, TargetValue: 100},
			}},
		}},
	})
	if len(result) != 2 {
		t.Fatalf("expected 2 themes, got %d", len(result))
	}
	if !floatEqual(result[0].Progress, 100) {
		t.Errorf("T1 progress = %f, want 100", result[0].Progress)
	}
	if !floatEqual(result[1].Progress, 0) {
		t.Errorf("T2 progress = %f, want 0", result[1].Progress)
	}
}

func TestUnit_ComputeAllThemeProgress_UntrackedKR(t *testing.T) {
	pe := NewProgressEngine()
	result := pe.ComputeAllThemeProgress([]ThemeData{
		{ID: "T1", Objectives: []ObjectiveData{
			{ID: "O1", Status: "active", KeyResults: []KeyResultData{
				{ID: "KR1", Status: "active", StartValue: 0, CurrentValue: 0, TargetValue: 0},
			}},
		}},
	})
	// Untracked KR (target=0) returns -1, so objective has no valid progress
	if !floatEqual(result[0].Objectives[0].Progress, -1) {
		t.Errorf("Objective progress = %f, want -1", result[0].Objectives[0].Progress)
	}
}

func floatEqual(a, b float64) bool {
	return math.Abs(a-b) < 0.001
}
