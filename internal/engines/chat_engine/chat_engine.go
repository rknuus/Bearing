package chat_engine

import (
	"encoding/json"
	"fmt"
	"log/slog"
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
	// assistant response text. Returns the cleaned text (with suggestion
	// blocks replaced by short placeholders) and any parsed suggestions.
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

// suggestionOpenMarker is the fenced code block opening for suggestion blocks.
const suggestionOpenMarker = "```bearing-suggestion"

// suggestionCloseMarker is the fenced code block closing for suggestion blocks.
const suggestionCloseMarker = "```"

// rawSuggestion is an intermediate struct for unmarshalling flat JSON from
// suggestion blocks before converting to the typed Suggestion DTOs.
type rawSuggestion struct {
	Type   string `json:"type"`
	Action string `json:"action"`
	// Theme fields
	ID    string `json:"id,omitempty"`
	Name  string `json:"name,omitempty"`
	Color string `json:"color,omitempty"`
	// Objective fields
	Title    string `json:"title,omitempty"`
	ParentID string `json:"parentId,omitempty"`
	// Key result fields
	Description       string `json:"description,omitempty"`
	StartValue        int    `json:"startValue,omitempty"`
	CurrentValue      int    `json:"currentValue,omitempty"`
	TargetValue       int    `json:"targetValue,omitempty"`
	ParentObjectiveID string `json:"parentObjectiveId,omitempty"`
	// Routine fields
	TargetType string `json:"targetType,omitempty"`
	Unit       string `json:"unit,omitempty"`
	ThemeID    string `json:"themeId,omitempty"`
}

// ParseSuggestions extracts bearing-suggestion JSON blocks from raw assistant
// response text. It returns the cleaned text (with suggestion blocks replaced
// by short placeholders) and the parsed suggestions. Malformed blocks are
// logged and skipped without affecting the rest of the parsing.
func (ce *ChatEngine) ParseSuggestions(responseText string) (string, []Suggestion) {
	var suggestions []Suggestion
	var cleaned strings.Builder

	remaining := responseText
	for {
		openIdx := strings.Index(remaining, suggestionOpenMarker)
		if openIdx == -1 {
			cleaned.WriteString(remaining)
			break
		}

		// Write text before the suggestion block.
		cleaned.WriteString(remaining[:openIdx])

		// Move past the opening marker.
		afterOpen := remaining[openIdx+len(suggestionOpenMarker):]

		// Find the closing fence.
		closeIdx := strings.Index(afterOpen, suggestionCloseMarker)
		if closeIdx == -1 {
			// No closing fence found; treat the rest as plain text.
			cleaned.WriteString(remaining[openIdx:])
			break
		}

		jsonContent := strings.TrimSpace(afterOpen[:closeIdx])
		remaining = afterOpen[closeIdx+len(suggestionCloseMarker):]

		// Parse the JSON block.
		var raw rawSuggestion
		if err := json.Unmarshal([]byte(jsonContent), &raw); err != nil {
			slog.Warn("ParseSuggestions: skipping malformed suggestion block",
				"error", err,
				"content", jsonContent)
			continue
		}

		suggestion, placeholder, ok := convertRawSuggestion(raw)
		if !ok {
			continue
		}

		suggestions = append(suggestions, suggestion)
		cleaned.WriteString(placeholder)
	}

	if len(suggestions) == 0 {
		return cleaned.String(), nil
	}
	return cleaned.String(), suggestions
}

// convertRawSuggestion converts a rawSuggestion to a typed Suggestion and
// generates a placeholder string. Returns false if the type is unknown.
func convertRawSuggestion(raw rawSuggestion) (Suggestion, string, bool) {
	s := Suggestion{
		Type:   raw.Type,
		Action: raw.Action,
	}

	isEdit := raw.Action == "edit"

	switch raw.Type {
	case "theme":
		s.ThemeData = &ThemeSuggestion{
			ID:    raw.ID,
			Name:  raw.Name,
			Color: raw.Color,
		}
		if isEdit {
			return s, "[Suggestion: Edit theme]", true
		}
		return s, fmt.Sprintf("[Suggestion: New theme %q]", raw.Name), true

	case "objective":
		s.ObjectiveData = &ObjectiveSuggestion{
			ID:       raw.ID,
			Title:    raw.Title,
			ParentID: raw.ParentID,
		}
		if isEdit {
			return s, "[Suggestion: Edit objective]", true
		}
		return s, fmt.Sprintf("[Suggestion: New objective %q]", raw.Title), true

	case "key_result":
		s.KeyResultData = &KeyResultSuggestion{
			ID:                raw.ID,
			Description:       raw.Description,
			StartValue:        raw.StartValue,
			CurrentValue:      raw.CurrentValue,
			TargetValue:       raw.TargetValue,
			ParentObjectiveID: raw.ParentObjectiveID,
		}
		if isEdit {
			return s, "[Suggestion: Edit key result]", true
		}
		return s, fmt.Sprintf("[Suggestion: New key result %q]", raw.Description), true

	case "routine":
		s.RoutineData = &RoutineSuggestion{
			ID:          raw.ID,
			Description: raw.Description,
			TargetValue: raw.TargetValue,
			TargetType:  raw.TargetType,
			Unit:        raw.Unit,
			ThemeID:     raw.ThemeID,
		}
		if isEdit {
			return s, "[Suggestion: Edit routine]", true
		}
		return s, fmt.Sprintf("[Suggestion: New routine %q]", raw.Description), true

	default:
		slog.Warn("ParseSuggestions: skipping suggestion with unknown type",
			"type", raw.Type)
		return Suggestion{}, "", false
	}
}

// buildSystemPrompt constructs the system prompt from OKR context data.
func (ce *ChatEngine) buildSystemPrompt(okrData []OKRContext) string {
	var b strings.Builder

	b.WriteString("You are a personal OKR advisor for the Bearing app. ")
	b.WriteString("Help the user define, refine, and track their Objectives and Key Results.\n\n")

	// Suggestion format instructions.
	b.WriteString("When suggesting a concrete new goal or change to an existing goal, include a structured suggestion block:\n\n")
	b.WriteString("```bearing-suggestion\n")
	b.WriteString("{\"type\": \"objective\", \"action\": \"create\", \"title\": \"Exercise 4x per week\", \"parentId\": \"H\"}\n")
	b.WriteString("```\n\n")
	b.WriteString("Supported types: \"theme\", \"objective\", \"key_result\", \"routine\".\n")
	b.WriteString("Supported actions: \"create\" (new item), \"edit\" (modify existing item — must include \"id\" of existing item).\n\n")
	b.WriteString("Fields by type:\n")
	b.WriteString("- theme: name, color (optional), id (required for edit)\n")
	b.WriteString("- objective: title, parentId (theme or parent objective ID), id (required for edit)\n")
	b.WriteString("- key_result: description, startValue, currentValue, targetValue, parentObjectiveId, id (required for edit)\n")
	b.WriteString("- routine: description, targetValue, targetType (\"at_least\" or \"at_most\"), unit, themeId, id (required for edit)\n\n")
	b.WriteString("Reference existing items by their actual IDs shown in the OKR context above.\n\n")

	// Auto-extraction instructions.
	b.WriteString("When the user describes goals in natural language, automatically extract ")
	b.WriteString("start and target values for key results and routines. For example, ")
	b.WriteString("\"run 3 times per week\" implies targetValue=3 and unit=\"times/week\"; ")
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
