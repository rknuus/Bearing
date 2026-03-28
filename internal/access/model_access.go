package access

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"os/exec"
	"strings"
	"time"
)

// defaultModelTimeout is the default timeout for model CLI invocations.
const defaultModelTimeout = 60 * time.Second

// ModelMessage is the minimal message type for model communication.
type ModelMessage struct {
	Role    string `json:"role"`    // "system", "user", "assistant"
	Content string `json:"content"`
}

// ModelInfo describes an available model provider.
type ModelInfo struct {
	Name      string `json:"name"`
	Provider  string `json:"provider"`
	Type      string `json:"type"`      // "local" or "remote"
	Available bool   `json:"available"`
	Reason    string `json:"reason"`    // why available/unavailable
}

// IModelAccess defines the interface for interacting with language models.
type IModelAccess interface {
	SendMessage(messages []ModelMessage) (string, error)
	GetAvailableModels() []ModelInfo
}

// ClaudeCLIModelAccess implements IModelAccess by invoking the Claude CLI
// as a subprocess with the --print flag.
type ClaudeCLIModelAccess struct {
	timeout time.Duration
}

// NewClaudeCLIModelAccess creates a new ClaudeCLIModelAccess instance.
// If timeout is 0, the default timeout of 60 seconds is used.
func NewClaudeCLIModelAccess(timeout time.Duration) *ClaudeCLIModelAccess {
	if timeout == 0 {
		timeout = defaultModelTimeout
	}
	return &ClaudeCLIModelAccess{timeout: timeout}
}

// Timeout returns the configured timeout duration.
func (m *ClaudeCLIModelAccess) Timeout() time.Duration {
	return m.timeout
}

// SendMessage sends a conversation to the Claude CLI and returns the response text.
// Messages are formatted with role markers and piped via stdin to `claude --print`.
func (m *ClaudeCLIModelAccess) SendMessage(messages []ModelMessage) (string, error) {
	if len(messages) == 0 {
		return "", fmt.Errorf("no messages provided")
	}

	prompt := formatPrompt(messages)

	ctx, cancel := context.WithTimeout(context.Background(), m.timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "claude", "--print")
	cmd.Stdin = strings.NewReader(prompt)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	start := time.Now()
	err := cmd.Run()
	elapsed := time.Since(start)

	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			slog.Error("ClaudeCLIModelAccess.SendMessage: process timed out",
				"pid", cmdPID(cmd),
				"elapsed", elapsed.String(),
				"stderr", stderr.String(),
			)
			return "", fmt.Errorf("The advisor did not respond in time. Please try again.")
		}

		slog.Error("ClaudeCLIModelAccess.SendMessage: process failed",
			"error", err.Error(),
			"elapsed", elapsed.String(),
			"stderr", stderr.String(),
		)
		return "", fmt.Errorf("The advisor is currently unavailable. Please try again later.")
	}

	response := strings.TrimSpace(stdout.String())
	if response == "" {
		slog.Warn("ClaudeCLIModelAccess.SendMessage: empty response from CLI",
			"elapsed", elapsed.String(),
			"stderr", stderr.String(),
		)
		return "", fmt.Errorf("The advisor returned an empty response. Please try again.")
	}

	return response, nil
}

// GetAvailableModels checks for the Claude CLI on PATH and returns model availability.
func (m *ClaudeCLIModelAccess) GetAvailableModels() []ModelInfo {
	_, err := exec.LookPath("claude")
	if err != nil {
		return []ModelInfo{{
			Name:      "Claude",
			Provider:  "Anthropic",
			Type:      "remote",
			Available: false,
			Reason:    "Claude CLI not found on PATH. Install from https://docs.anthropic.com/en/docs/claude-cli",
		}}
	}

	return []ModelInfo{{
		Name:      "Claude",
		Provider:  "Anthropic",
		Type:      "remote",
		Available: true,
		Reason:    "Claude CLI detected",
	}}
}

// formatPrompt concatenates messages with role markers into a single prompt string.
func formatPrompt(messages []ModelMessage) string {
	var parts []string
	for _, msg := range messages {
		label := roleLabel(msg.Role)
		parts = append(parts, label+": "+msg.Content)
	}
	return strings.Join(parts, "\n\n")
}

// roleLabel returns a human-readable label for a message role.
func roleLabel(role string) string {
	switch role {
	case "system":
		return "System"
	case "user":
		return "User"
	case "assistant":
		return "Assistant"
	default:
		if len(role) == 0 {
			return role
		}
		return strings.ToUpper(role[:1]) + role[1:]
	}
}

// cmdPID safely extracts the PID from an exec.Cmd, returning 0 if the process was not started.
func cmdPID(cmd *exec.Cmd) int {
	if cmd.Process != nil {
		return cmd.Process.Pid
	}
	return 0
}
