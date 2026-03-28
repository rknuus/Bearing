package access

import (
	"os/exec"
	"strings"
	"testing"
	"time"
)

func TestUnit_ClaudeCLIModelAccess_DefaultTimeout(t *testing.T) {
	ma := NewClaudeCLIModelAccess(0)
	if ma.Timeout() != 60*time.Second {
		t.Errorf("expected default timeout of 60s, got %v", ma.Timeout())
	}
}

func TestUnit_ClaudeCLIModelAccess_CustomTimeout(t *testing.T) {
	ma := NewClaudeCLIModelAccess(30 * time.Second)
	if ma.Timeout() != 30*time.Second {
		t.Errorf("expected custom timeout of 30s, got %v", ma.Timeout())
	}
}

func TestUnit_ClaudeCLIModelAccess_GetAvailableModels(t *testing.T) {
	ma := NewClaudeCLIModelAccess(0)

	models := ma.GetAvailableModels()
	if len(models) == 0 {
		t.Fatal("expected at least one model info entry")
	}

	model := models[0]
	if model.Name != "Claude" {
		t.Errorf("expected model name 'Claude', got %q", model.Name)
	}
	if model.Provider != "Anthropic" {
		t.Errorf("expected provider 'Anthropic', got %q", model.Provider)
	}
	if model.Type != "remote" {
		t.Errorf("expected type 'remote', got %q", model.Type)
	}
	if model.Reason == "" {
		t.Error("expected non-empty reason")
	}
}

func TestUnit_ClaudeCLIModelAccess_SendMessage_ErrorHandling(t *testing.T) {
	// Use a non-existent binary to trigger an exec error.
	// We achieve this by temporarily creating an access that calls a binary
	// that doesn't exist. Since ClaudeCLIModelAccess always calls "claude",
	// we test by ensuring PATH does not contain "claude" — but that's environment
	// dependent. Instead, we test the error path by sending an empty message list.
	ma := NewClaudeCLIModelAccess(5 * time.Second)

	t.Run("empty messages returns error", func(t *testing.T) {
		_, err := ma.SendMessage(nil)
		if err == nil {
			t.Fatal("expected error for nil messages")
		}
		_, err = ma.SendMessage([]ModelMessage{})
		if err == nil {
			t.Fatal("expected error for empty messages")
		}
	})

	t.Run("non-existent binary returns user-friendly error", func(t *testing.T) {
		// Temporarily override PATH to ensure "claude" is not found.
		// We use a short timeout and a message that would trigger CLI invocation.
		origPath := t.TempDir() // empty dir as PATH — no binaries found
		t.Setenv("PATH", origPath)

		_, err := ma.SendMessage([]ModelMessage{
			{Role: "user", Content: "hello"},
		})
		if err == nil {
			t.Fatal("expected error when claude binary is not on PATH")
		}
		// The error should be user-friendly, not a raw exec error.
		errMsg := err.Error()
		if strings.Contains(errMsg, "exec:") || strings.Contains(errMsg, "not found in") {
			t.Errorf("error message should be user-friendly, got: %q", errMsg)
		}
	})
}

func TestUnit_FormatPrompt(t *testing.T) {
	messages := []ModelMessage{
		{Role: "system", Content: "You are a helpful assistant."},
		{Role: "user", Content: "What is 2+2?"},
		{Role: "assistant", Content: "4"},
	}

	result := formatPrompt(messages)

	if !strings.Contains(result, "System: You are a helpful assistant.") {
		t.Error("expected system message with 'System:' prefix")
	}
	if !strings.Contains(result, "User: What is 2+2?") {
		t.Error("expected user message with 'User:' prefix")
	}
	if !strings.Contains(result, "Assistant: 4") {
		t.Error("expected assistant message with 'Assistant:' prefix")
	}

	// Verify messages are separated by double newlines
	parts := strings.Split(result, "\n\n")
	if len(parts) != 3 {
		t.Errorf("expected 3 parts separated by double newlines, got %d", len(parts))
	}
}

func TestUnit_RoleLabel(t *testing.T) {
	tests := []struct {
		role     string
		expected string
	}{
		{"system", "System"},
		{"user", "User"},
		{"assistant", "Assistant"},
	}

	for _, tt := range tests {
		t.Run(tt.role, func(t *testing.T) {
			if got := roleLabel(tt.role); got != tt.expected {
				t.Errorf("roleLabel(%q) = %q, want %q", tt.role, got, tt.expected)
			}
		})
	}
}

func TestIntegration_ClaudeCLIModelAccess_SendMessage(t *testing.T) {
	if _, err := exec.LookPath("claude"); err != nil {
		t.Skip("claude CLI not on PATH")
	}

	ma := NewClaudeCLIModelAccess(30 * time.Second)

	response, err := ma.SendMessage([]ModelMessage{
		{Role: "user", Content: "Reply with exactly the word 'hello' and nothing else."},
	})
	if err != nil {
		t.Fatalf("SendMessage failed: %v", err)
	}
	if response == "" {
		t.Fatal("expected non-empty response")
	}

	t.Logf("Claude response: %s", response)
}
