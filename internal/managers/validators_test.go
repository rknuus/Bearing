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

func TestUnit_ValidateTagName_RejectsReserved(t *testing.T) {
	reserved := []string{
		"Untagged", "untagged", "UNTAGGED", "UnTaGgEd",
		"All", "all", "ALL", "aLL",
	}
	for _, name := range reserved {
		if err := validateTagName(name); err == nil {
			t.Errorf("validateTagName(%q) = nil, want error", name)
		}
	}
}

func TestUnit_ValidateTagName_AcceptsNormal(t *testing.T) {
	allowed := []string{
		"", "frontend", "backend", "api", "Routine", "health",
		"Untagged-extra", "All-Hands", "alley", "tagged",
	}
	for _, name := range allowed {
		if err := validateTagName(name); err != nil {
			t.Errorf("validateTagName(%q) = %v, want nil", name, err)
		}
	}
}

func TestUnit_ValidateTagNames_RejectsAnyReserved(t *testing.T) {
	cases := [][]string{
		{"Untagged"},
		{"frontend", "All"},
		{"backend", "untagged", "api"},
	}
	for _, names := range cases {
		if err := validateTagNames(names); err == nil {
			t.Errorf("validateTagNames(%v) = nil, want error", names)
		}
	}
}

func TestUnit_ValidateTagNames_AcceptsClean(t *testing.T) {
	clean := [][]string{
		nil,
		{},
		{"frontend"},
		{"frontend", "backend", "api"},
		{"Routine"},
	}
	for _, names := range clean {
		if err := validateTagNames(names); err != nil {
			t.Errorf("validateTagNames(%v) = %v, want nil", names, err)
		}
	}
}
