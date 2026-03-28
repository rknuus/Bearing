package chat_engine

import (
	"fmt"
	"strings"
)

// chatMLMarkers are role markers that must be stripped from user content
// to prevent ChatML injection.
var chatMLMarkers = []string{
	"<|system|>",
	"<|user|>",
	"<|assistant|>",
}

// IChatEngine defines the interface for AI conversation assembly operations.
type IChatEngine interface {
	// AssembleConversation builds a full conversation payload from OKR context,
	// conversation history, and a new user message. The returned slice starts
	// with a system prompt, followed by history messages, then the new user
	// message.
	AssembleConversation(okrData []OKRContext, history []ChatMessage, userMessage string) []ChatMessage

	// ParseSuggestions extracts bearing-suggestion JSON blocks from raw
	// assistant response text. Returns the cleaned text and any parsed
	// suggestions. The current implementation is a stub that returns
	// the input text unchanged and nil suggestions.
	ParseSuggestions(responseText string) (string, []Suggestion)
}

// ChatEngine implements IChatEngine. It is stateless and assembles
// conversations from provided data without requiring external dependencies.
type ChatEngine struct{}

// NewChatEngine creates a new ChatEngine.
func NewChatEngine() *ChatEngine {
	return &ChatEngine{}
}

// AssembleConversation builds a full conversation payload.
func (ce *ChatEngine) AssembleConversation(okrData []OKRContext, history []ChatMessage, userMessage string) []ChatMessage {
	systemPrompt := ce.buildSystemPrompt(okrData)
	sanitizedMessage := sanitizeChatML(userMessage)

	// Capacity: 1 system + history + 1 user message.
	messages := make([]ChatMessage, 0, 1+len(history)+1)
	messages = append(messages, ChatMessage{Role: "system", Content: systemPrompt})
	messages = append(messages, history...)
	messages = append(messages, ChatMessage{Role: "user", Content: sanitizedMessage})

	return messages
}

// ParseSuggestions is a stub that returns the input text and nil suggestions.
// Full parsing of bearing-suggestion blocks will be implemented in task 322.
func (ce *ChatEngine) ParseSuggestions(responseText string) (string, []Suggestion) {
	return responseText, nil
}

// buildSystemPrompt constructs the system prompt from OKR context data.
func (ce *ChatEngine) buildSystemPrompt(okrData []OKRContext) string {
	var b strings.Builder

	b.WriteString("You are a personal OKR advisor for the Bearing app. ")
	b.WriteString("Help the user define, refine, and track their Objectives and Key Results.\n\n")

	// Suggestion format instructions.
	b.WriteString("When you have concrete suggestions for creating or editing OKR items, ")
	b.WriteString("include them as fenced code blocks with the language tag `bearing-suggestion` ")
	b.WriteString("containing valid JSON. Each suggestion must have a \"type\" ")
	b.WriteString("(\"theme\", \"objective\", \"key_result\", or \"routine\"), ")
	b.WriteString("an \"action\" (\"create\" or \"edit\"), and the corresponding data field ")
	b.WriteString("(\"themeData\", \"objectiveData\", \"keyResultData\", or \"routineData\").\n\n")

	// Auto-extraction instructions.
	b.WriteString("When the user describes goals in natural language, automatically extract ")
	b.WriteString("start and target values for key results. For example, ")
	b.WriteString("\"I want to read 12 books this year\" implies startValue=0 and targetValue=12.\n\n")

	if len(okrData) == 0 {
		ce.writeEmptyContextPrompt(&b)
	} else {
		ce.writeOKRContextPrompt(&b, okrData)
	}

	return b.String()
}

// writeEmptyContextPrompt writes instructions biased toward suggesting new items.
func (ce *ChatEngine) writeEmptyContextPrompt(b *strings.Builder) {
	b.WriteString("The user has no OKR items yet. Focus on helping them get started:\n")
	b.WriteString("- Suggest life themes that organize their goals (e.g., Health, Career, Learning)\n")
	b.WriteString("- Propose concrete objectives under those themes\n")
	b.WriteString("- Recommend measurable key results with specific start and target values\n")
	b.WriteString("- Suggest routines that build habits aligned with their objectives\n")
}

// writeOKRContextPrompt writes OKR context and instructions for mixed suggestions.
func (ce *ChatEngine) writeOKRContextPrompt(b *strings.Builder, okrData []OKRContext) {
	b.WriteString("The user's current OKR structure is provided below. ")
	b.WriteString("You can suggest edits to existing items or creation of new ones.\n\n")

	for _, ctx := range okrData {
		fmt.Fprintf(b, "## Theme: %s (ID: %s)\n", ctx.ThemeName, ctx.ThemeID)

		if len(ctx.Objectives) > 0 {
			ce.writeObjectives(b, ctx.Objectives, 0)
		}

		if len(ctx.Routines) > 0 {
			b.WriteString("\nRoutines:\n")
			for _, r := range ctx.Routines {
				fmt.Fprintf(b, "  - %s (ID: %s) current=%d target=%d %s %s\n",
					r.Description, r.ID, r.CurrentValue, r.TargetValue, r.TargetType, r.Unit)
			}
		}

		b.WriteString("\n")
	}
}

// writeObjectives recursively writes objective trees with indentation.
func (ce *ChatEngine) writeObjectives(b *strings.Builder, objectives []OKRObjective, depth int) {
	indent := strings.Repeat("  ", depth+1)

	for _, obj := range objectives {
		status := obj.Status
		if status == "" {
			status = "active"
		}
		fmt.Fprintf(b, "%sObjective: %s (ID: %s, status: %s)\n", indent, obj.Title, obj.ID, status)

		for _, kr := range obj.KeyResults {
			fmt.Fprintf(b, "%s  KR: %s (ID: %s) start=%d current=%d target=%d\n",
				indent, kr.Description, kr.ID, kr.StartValue, kr.CurrentValue, kr.TargetValue)
		}

		if len(obj.Children) > 0 {
			ce.writeObjectives(b, obj.Children, depth+1)
		}
	}
}

// sanitizeChatML strips ChatML role markers from user content to prevent
// prompt injection.
func sanitizeChatML(content string) string {
	result := content
	for _, marker := range chatMLMarkers {
		result = strings.ReplaceAll(result, marker, "")
	}
	return result
}
