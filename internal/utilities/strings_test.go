package utilities

import "testing"

func TestUnit_Slugify(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"simple lowercase", "hello", "hello"},
		{"uppercase", "Hello World", "hello-world"},
		{"special characters", "My Task!@#$%", "my-task"},
		{"consecutive spaces", "hello   world", "hello-world"},
		{"leading trailing spaces", "  hello  ", "hello"},
		{"numbers preserved", "task123", "task123"},
		{"mixed", "Code Review (v2)", "code-review-v2"},
		{"empty string", "", ""},
		{"only special chars", "!@#$%", ""},
		{"hyphens preserved", "already-slugified", "already-slugified"},
		{"consecutive hyphens collapsed", "a---b", "a-b"},
		{"unicode replaced", "café latte", "caf-latte"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Slugify(tt.input)
			if got != tt.want {
				t.Errorf("Slugify(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}
