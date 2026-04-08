package managers

import "testing"

func TestUnit_IsValidPriority(t *testing.T) {
	valid := []string{"important-urgent", "important-not-urgent", "not-important-urgent"}
	for _, p := range valid {
		if !IsValidPriority(p) {
			t.Errorf("IsValidPriority(%q) = false, want true", p)
		}
	}
	invalid := []string{"", "high", "low", "urgent", "not-important-not-urgent"}
	for _, p := range invalid {
		if IsValidPriority(p) {
			t.Errorf("IsValidPriority(%q) = true, want false", p)
		}
	}
}

func TestUnit_IsValidOKRStatus(t *testing.T) {
	valid := []string{"", "active", "completed", "archived"}
	for _, s := range valid {
		if !IsValidOKRStatus(s) {
			t.Errorf("IsValidOKRStatus(%q) = false, want true", s)
		}
	}
	invalid := []string{"done", "inactive", "deleted"}
	for _, s := range invalid {
		if IsValidOKRStatus(s) {
			t.Errorf("IsValidOKRStatus(%q) = true, want false", s)
		}
	}
}

func TestUnit_EffectiveOKRStatus(t *testing.T) {
	if got := EffectiveOKRStatus(""); got != "active" {
		t.Errorf("EffectiveOKRStatus(\"\") = %q, want \"active\"", got)
	}
	if got := EffectiveOKRStatus("completed"); got != "completed" {
		t.Errorf("EffectiveOKRStatus(\"completed\") = %q, want \"completed\"", got)
	}
	if got := EffectiveOKRStatus("archived"); got != "archived" {
		t.Errorf("EffectiveOKRStatus(\"archived\") = %q, want \"archived\"", got)
	}
}

func TestUnit_IsValidClosingStatus(t *testing.T) {
	valid := []string{"achieved", "partially-achieved", "missed", "postponed", "canceled"}
	for _, s := range valid {
		if !IsValidClosingStatus(s) {
			t.Errorf("IsValidClosingStatus(%q) = false, want true", s)
		}
	}
	invalid := []string{"", "done", "completed", "failed"}
	for _, s := range invalid {
		if IsValidClosingStatus(s) {
			t.Errorf("IsValidClosingStatus(%q) = true, want false", s)
		}
	}
}

func TestUnit_IsValidKRType(t *testing.T) {
	valid := []string{"", "metric", "binary"}
	for _, s := range valid {
		if !IsValidKRType(s) {
			t.Errorf("IsValidKRType(%q) = false, want true", s)
		}
	}
	invalid := []string{"numeric", "percentage", "boolean"}
	for _, s := range invalid {
		if IsValidKRType(s) {
			t.Errorf("IsValidKRType(%q) = true, want false", s)
		}
	}
}
