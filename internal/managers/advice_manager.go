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
// It delegates to PlanningManager.Establish for create actions and
// PlanningManager.Revise for edit actions.
func (am *AdviceManager) AcceptSuggestion(suggestion chat_engine.Suggestion, parentContext string) error {
	switch suggestion.Action {
	case "create":
		return am.acceptCreate(suggestion, parentContext)
	case "edit":
		return am.acceptEdit(suggestion)
	default:
		return fmt.Errorf("unknown suggestion action: %s", suggestion.Action)
	}
}

// acceptCreate routes a create suggestion to PlanningManager.Establish.
func (am *AdviceManager) acceptCreate(suggestion chat_engine.Suggestion, parentContext string) error {
	switch suggestion.Type {
	case "theme":
		if suggestion.ThemeData == nil {
			return fmt.Errorf("theme suggestion missing themeData")
		}
		_, err := am.planningManager.Establish(EstablishRequest{
			GoalType: GoalTypeTheme,
			Name:     suggestion.ThemeData.Name,
			Color:    suggestion.ThemeData.Color,
		})
		if err != nil {
			slog.Error("AcceptSuggestion: failed to create theme",
				"name", suggestion.ThemeData.Name, "error", err)
			return fmt.Errorf("Failed to create theme: %w", err)
		}
		return nil

	case "objective":
		if suggestion.ObjectiveData == nil {
			return fmt.Errorf("objective suggestion missing objectiveData")
		}
		parentID := suggestion.ObjectiveData.ParentID
		if parentID == "" {
			parentID = parentContext
		}
		if parentID == "" {
			return fmt.Errorf("objective suggestion requires a parent (theme or objective ID)")
		}
		_, err := am.planningManager.Establish(EstablishRequest{
			GoalType: GoalTypeObjective,
			ParentID: parentID,
			Title:    suggestion.ObjectiveData.Title,
		})
		if err != nil {
			slog.Error("AcceptSuggestion: failed to create objective",
				"title", suggestion.ObjectiveData.Title, "parentID", parentID, "error", err)
			return fmt.Errorf("Failed to create objective: %w", err)
		}
		return nil

	case "key_result":
		if suggestion.KeyResultData == nil {
			return fmt.Errorf("key result suggestion missing keyResultData")
		}
		parentID := suggestion.KeyResultData.ParentObjectiveID
		if parentID == "" {
			parentID = parentContext
		}
		if parentID == "" {
			return fmt.Errorf("key result suggestion requires a parent objective ID")
		}
		startVal := suggestion.KeyResultData.StartValue
		targetVal := suggestion.KeyResultData.TargetValue
		_, err := am.planningManager.Establish(EstablishRequest{
			GoalType:    GoalTypeKeyResult,
			ParentID:    parentID,
			Description: suggestion.KeyResultData.Description,
			StartValue:  &startVal,
			TargetValue: &targetVal,
		})
		if err != nil {
			slog.Error("AcceptSuggestion: failed to create key result",
				"description", suggestion.KeyResultData.Description, "parentID", parentID, "error", err)
			return fmt.Errorf("Failed to create key result: %w", err)
		}
		return nil

	case "routine":
		if suggestion.RoutineData == nil {
			return fmt.Errorf("routine suggestion missing routineData")
		}
		themeID := suggestion.RoutineData.ThemeID
		if themeID == "" {
			themeID = parentContext
		}
		if themeID == "" {
			return fmt.Errorf("routine suggestion requires a theme ID")
		}
		targetVal := suggestion.RoutineData.TargetValue
		_, err := am.planningManager.Establish(EstablishRequest{
			GoalType:    GoalTypeRoutine,
			ParentID:    themeID,
			Description: suggestion.RoutineData.Description,
			TargetValue: &targetVal,
			TargetType:  suggestion.RoutineData.TargetType,
			Unit:        suggestion.RoutineData.Unit,
		})
		if err != nil {
			slog.Error("AcceptSuggestion: failed to create routine",
				"description", suggestion.RoutineData.Description, "themeID", themeID, "error", err)
			return fmt.Errorf("Failed to create routine: %w", err)
		}
		return nil

	default:
		return fmt.Errorf("unknown suggestion type: %s", suggestion.Type)
	}
}

// acceptEdit routes an edit suggestion to PlanningManager.Revise.
func (am *AdviceManager) acceptEdit(suggestion chat_engine.Suggestion) error {
	switch suggestion.Type {
	case "theme":
		if suggestion.ThemeData == nil || suggestion.ThemeData.ID == "" {
			return fmt.Errorf("theme edit suggestion requires themeData with id")
		}
		req := ReviseRequest{GoalID: suggestion.ThemeData.ID}
		if suggestion.ThemeData.Name != "" {
			name := suggestion.ThemeData.Name
			req.Name = &name
		}
		if suggestion.ThemeData.Color != "" {
			color := suggestion.ThemeData.Color
			req.Color = &color
		}
		if err := am.planningManager.Revise(req); err != nil {
			slog.Error("AcceptSuggestion: failed to edit theme",
				"id", suggestion.ThemeData.ID, "error", err)
			return fmt.Errorf("Failed to edit theme: %w", err)
		}
		return nil

	case "objective":
		if suggestion.ObjectiveData == nil || suggestion.ObjectiveData.ID == "" {
			return fmt.Errorf("objective edit suggestion requires objectiveData with id")
		}
		req := ReviseRequest{GoalID: suggestion.ObjectiveData.ID}
		if suggestion.ObjectiveData.Title != "" {
			title := suggestion.ObjectiveData.Title
			req.Title = &title
		}
		if err := am.planningManager.Revise(req); err != nil {
			slog.Error("AcceptSuggestion: failed to edit objective",
				"id", suggestion.ObjectiveData.ID, "error", err)
			return fmt.Errorf("Failed to edit objective: %w", err)
		}
		return nil

	case "key_result":
		if suggestion.KeyResultData == nil || suggestion.KeyResultData.ID == "" {
			return fmt.Errorf("key result edit suggestion requires keyResultData with id")
		}
		req := ReviseRequest{GoalID: suggestion.KeyResultData.ID}
		if suggestion.KeyResultData.Description != "" {
			desc := suggestion.KeyResultData.Description
			req.Description = &desc
		}
		startVal := suggestion.KeyResultData.StartValue
		req.StartValue = &startVal
		targetVal := suggestion.KeyResultData.TargetValue
		req.TargetValue = &targetVal
		if err := am.planningManager.Revise(req); err != nil {
			slog.Error("AcceptSuggestion: failed to edit key result",
				"id", suggestion.KeyResultData.ID, "error", err)
			return fmt.Errorf("Failed to edit key result: %w", err)
		}
		return nil

	case "routine":
		if suggestion.RoutineData == nil || suggestion.RoutineData.ID == "" {
			return fmt.Errorf("routine edit suggestion requires routineData with id")
		}
		req := ReviseRequest{GoalID: suggestion.RoutineData.ID}
		if suggestion.RoutineData.Description != "" {
			desc := suggestion.RoutineData.Description
			req.Description = &desc
		}
		targetVal := suggestion.RoutineData.TargetValue
		req.TargetValue = &targetVal
		if suggestion.RoutineData.TargetType != "" {
			tt := suggestion.RoutineData.TargetType
			req.TargetType = &tt
		}
		if suggestion.RoutineData.Unit != "" {
			unit := suggestion.RoutineData.Unit
			req.Unit = &unit
		}
		if err := am.planningManager.Revise(req); err != nil {
			slog.Error("AcceptSuggestion: failed to edit routine",
				"id", suggestion.RoutineData.ID, "error", err)
			return fmt.Errorf("Failed to edit routine: %w", err)
		}
		return nil

	default:
		return fmt.Errorf("unknown suggestion type for edit: %s", suggestion.Type)
	}
}

// convertThemesToOKRContext converts access layer themes to engine layer OKR
// contexts. If selectedOKRIds is non-empty, a theme is included when the theme
// itself or any of its descendants (objectives, key results, routines) appears
// in the selection. Only the selected descendants are kept, giving the model
// focused context.
func convertThemesToOKRContext(themes []access.LifeTheme, selectedOKRIds []string) []chat_engine.OKRContext {
	filter := buildIDSet(selectedOKRIds)
	if len(filter) == 0 {
		// No filter — include everything.
		contexts := make([]chat_engine.OKRContext, 0, len(themes))
		for _, theme := range themes {
			contexts = append(contexts, chat_engine.OKRContext{
				ThemeID:    theme.ID,
				ThemeName:  theme.Name,
				Objectives: convertObjectivesToOKR(theme.Objectives),
				Routines:   convertRoutinesToOKR(theme.Routines),
			})
		}
		return contexts
	}

	// With a filter: include a theme when any of its IDs match.
	contexts := make([]chat_engine.OKRContext, 0, len(themes))
	for _, theme := range themes {
		_, themeSelected := filter[theme.ID]

		objs := filterObjectivesToOKR(theme.Objectives, filter)
		routines := filterRoutinesToOKR(theme.Routines, filter)

		if !themeSelected && len(objs) == 0 && len(routines) == 0 {
			continue
		}

		// If the theme itself was selected, include all its descendants.
		if themeSelected {
			objs = convertObjectivesToOKR(theme.Objectives)
			routines = convertRoutinesToOKR(theme.Routines)
		}

		contexts = append(contexts, chat_engine.OKRContext{
			ThemeID:    theme.ID,
			ThemeName:  theme.Name,
			Objectives: objs,
			Routines:   routines,
		})
	}
	return contexts
}

// filterObjectivesToOKR converts objectives keeping only those (or whose
// descendants) appear in the filter set. Selected objectives include all
// their children; unselected objectives are included only if a child matches.
func filterObjectivesToOKR(objectives []access.Objective, filter map[string]struct{}) []chat_engine.OKRObjective {
	var result []chat_engine.OKRObjective
	for _, obj := range objectives {
		_, objSelected := filter[obj.ID]

		krs := filterKeyResultsToOKR(obj.KeyResults, filter)
		children := filterObjectivesToOKR(obj.Objectives, filter)

		if !objSelected && len(krs) == 0 && len(children) == 0 {
			continue
		}

		// If the objective itself was selected, include all its KRs and children.
		if objSelected {
			krs = convertKeyResultsToOKR(obj.KeyResults)
			children = convertObjectivesToOKR(obj.Objectives)
		}

		result = append(result, chat_engine.OKRObjective{
			ID:         obj.ID,
			Title:      obj.Title,
			Status:     obj.Status,
			KeyResults: krs,
			Children:   children,
		})
	}
	return result
}

// filterKeyResultsToOKR keeps only key results whose ID is in the filter set.
func filterKeyResultsToOKR(keyResults []access.KeyResult, filter map[string]struct{}) []chat_engine.OKRKeyResult {
	var result []chat_engine.OKRKeyResult
	for _, kr := range keyResults {
		if _, ok := filter[kr.ID]; ok {
			result = append(result, chat_engine.OKRKeyResult{
				ID:           kr.ID,
				Description:  kr.Description,
				StartValue:   kr.StartValue,
				CurrentValue: kr.CurrentValue,
				TargetValue:  kr.TargetValue,
			})
		}
	}
	return result
}

// filterRoutinesToOKR keeps only routines whose ID is in the filter set.
func filterRoutinesToOKR(routines []access.Routine, filter map[string]struct{}) []chat_engine.OKRRoutine {
	var result []chat_engine.OKRRoutine
	for _, r := range routines {
		if _, ok := filter[r.ID]; ok {
			result = append(result, chat_engine.OKRRoutine{
				ID:           r.ID,
				Description:  r.Description,
				CurrentValue: r.CurrentValue,
				TargetValue:  r.TargetValue,
				TargetType:   r.TargetType,
				Unit:         r.Unit,
			})
		}
	}
	return result
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
