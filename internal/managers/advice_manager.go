package managers

import (
	"fmt"
	"log/slog"

	"github.com/rkn/bearing/internal/access"
	"github.com/rkn/bearing/internal/engines/chat_engine"
)

// IAdviceManager defines the interface for AI advisor operations.
type IAdviceManager interface {
	RequestAdvice(message string, history []chat_engine.ChatMessage, selectedOKRIds []string) (*chat_engine.AdviceResponse, error)
	GetAvailableModels() []access.ModelInfo
	GetEnabled() (bool, error)
	SetEnabled(enabled bool) error
	AcceptSuggestion(suggestion chat_engine.Suggestion, parentContext string) error
}

// AdviceManager orchestrates the AI advisor flow by coordinating ChatEngine,
// ModelAccess, ThemeAccess, and UIStateAccess.
type AdviceManager struct {
	themeAccess     access.IThemeAccess
	chatEngine      chat_engine.IChatEngine
	modelAccess     access.IModelAccess
	uiStateAccess   access.IUIStateAccess
	planningManager *PlanningManager
}

// NewAdviceManager creates a new AdviceManager instance.
// All dependencies must be non-nil.
func NewAdviceManager(
	themeAccess access.IThemeAccess,
	chatEngine chat_engine.IChatEngine,
	modelAccess access.IModelAccess,
	uiStateAccess access.IUIStateAccess,
	planningManager *PlanningManager,
) (*AdviceManager, error) {
	if themeAccess == nil {
		return nil, fmt.Errorf("themeAccess cannot be nil")
	}
	if chatEngine == nil {
		return nil, fmt.Errorf("chatEngine cannot be nil")
	}
	if modelAccess == nil {
		return nil, fmt.Errorf("modelAccess cannot be nil")
	}
	if uiStateAccess == nil {
		return nil, fmt.Errorf("uiStateAccess cannot be nil")
	}
	if planningManager == nil {
		return nil, fmt.Errorf("planningManager cannot be nil")
	}

	return &AdviceManager{
		themeAccess:     themeAccess,
		chatEngine:      chatEngine,
		modelAccess:     modelAccess,
		uiStateAccess:   uiStateAccess,
		planningManager: planningManager,
	}, nil
}

// RequestAdvice sends a user message to the AI advisor with OKR context and
// conversation history. It returns the advisor's response with any parsed
// suggestions.
func (am *AdviceManager) RequestAdvice(message string, history []chat_engine.ChatMessage, selectedOKRIds []string) (*chat_engine.AdviceResponse, error) {
	// 1. Fetch themes
	themes, err := am.themeAccess.GetThemes()
	if err != nil {
		slog.Error("AdviceManager.RequestAdvice: failed to fetch themes",
			"error", err)
		return nil, fmt.Errorf("Unable to load your goals. Please try again.")
	}

	// 2. Convert themes to OKR context, filtering by selectedOKRIds
	okrContexts := convertThemesToOKRContext(themes, selectedOKRIds)

	// 3. Assemble conversation
	conversationMessages := am.chatEngine.AssembleConversation(okrContexts, history, message)

	// 4. Convert ChatMessages to ModelMessages
	modelMessages := convertChatToModelMessages(conversationMessages)

	// 5. Send to model
	responseText, err := am.modelAccess.SendMessage(modelMessages)
	if err != nil {
		slog.Error("AdviceManager.RequestAdvice: model access failed",
			"error", err)
		return nil, err
	}

	// 6. Parse suggestions from response
	cleanText, suggestions := am.chatEngine.ParseSuggestions(responseText)

	return &chat_engine.AdviceResponse{
		Text:        cleanText,
		Suggestions: suggestions,
	}, nil
}

// GetAvailableModels returns the list of available AI models.
func (am *AdviceManager) GetAvailableModels() []access.ModelInfo {
	return am.modelAccess.GetAvailableModels()
}

// GetEnabled returns whether the advisor feature is enabled.
func (am *AdviceManager) GetEnabled() (bool, error) {
	return am.uiStateAccess.LoadAdvisorEnabled()
}

// SetEnabled enables or disables the advisor feature.
func (am *AdviceManager) SetEnabled(enabled bool) error {
	return am.uiStateAccess.SaveAdvisorEnabled(enabled)
}

// AcceptSuggestion applies a suggestion from the advisor to the OKR hierarchy.
// This is a stub that will be implemented in Epic 3.
func (am *AdviceManager) AcceptSuggestion(_ chat_engine.Suggestion, _ string) error {
	return fmt.Errorf("suggestion acceptance not yet implemented")
}

// convertThemesToOKRContext converts access layer themes to engine layer OKR
// contexts. If selectedOKRIds is non-empty, only themes whose ID appears in
// the selection are included.
func convertThemesToOKRContext(themes []access.LifeTheme, selectedOKRIds []string) []chat_engine.OKRContext {
	filter := buildIDSet(selectedOKRIds)

	contexts := make([]chat_engine.OKRContext, 0, len(themes))
	for _, theme := range themes {
		if len(filter) > 0 {
			if _, ok := filter[theme.ID]; !ok {
				continue
			}
		}

		ctx := chat_engine.OKRContext{
			ThemeID:    theme.ID,
			ThemeName:  theme.Name,
			Objectives: convertObjectivesToOKR(theme.Objectives),
			Routines:   convertRoutinesToOKR(theme.Routines),
		}
		contexts = append(contexts, ctx)
	}

	return contexts
}

// convertObjectivesToOKR recursively converts access objectives to engine
// OKR objectives.
func convertObjectivesToOKR(objectives []access.Objective) []chat_engine.OKRObjective {
	if len(objectives) == 0 {
		return nil
	}

	result := make([]chat_engine.OKRObjective, len(objectives))
	for i, obj := range objectives {
		result[i] = chat_engine.OKRObjective{
			ID:         obj.ID,
			Title:      obj.Title,
			Status:     obj.Status,
			KeyResults: convertKeyResultsToOKR(obj.KeyResults),
			Children:   convertObjectivesToOKR(obj.Objectives),
		}
	}
	return result
}

// convertKeyResultsToOKR converts access key results to engine OKR key results.
func convertKeyResultsToOKR(keyResults []access.KeyResult) []chat_engine.OKRKeyResult {
	if len(keyResults) == 0 {
		return nil
	}

	result := make([]chat_engine.OKRKeyResult, len(keyResults))
	for i, kr := range keyResults {
		result[i] = chat_engine.OKRKeyResult{
			ID:           kr.ID,
			Description:  kr.Description,
			StartValue:   kr.StartValue,
			CurrentValue: kr.CurrentValue,
			TargetValue:  kr.TargetValue,
		}
	}
	return result
}

// convertRoutinesToOKR converts access routines to engine OKR routines.
func convertRoutinesToOKR(routines []access.Routine) []chat_engine.OKRRoutine {
	if len(routines) == 0 {
		return nil
	}

	result := make([]chat_engine.OKRRoutine, len(routines))
	for i, r := range routines {
		result[i] = chat_engine.OKRRoutine{
			ID:           r.ID,
			Description:  r.Description,
			CurrentValue: r.CurrentValue,
			TargetValue:  r.TargetValue,
			TargetType:   r.TargetType,
			Unit:         r.Unit,
		}
	}
	return result
}

// convertChatToModelMessages converts engine ChatMessages to access
// ModelMessages for the model layer.
func convertChatToModelMessages(messages []chat_engine.ChatMessage) []access.ModelMessage {
	result := make([]access.ModelMessage, len(messages))
	for i, msg := range messages {
		result[i] = access.ModelMessage{
			Role:    msg.Role,
			Content: msg.Content,
		}
	}
	return result
}

// buildIDSet creates a lookup set from a string slice. Returns nil for empty
// input, allowing callers to distinguish "no filter" from "empty filter."
func buildIDSet(ids []string) map[string]struct{} {
	if len(ids) == 0 {
		return nil
	}
	set := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		set[id] = struct{}{}
	}
	return set
}
