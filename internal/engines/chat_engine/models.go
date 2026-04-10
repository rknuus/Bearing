// Package chat_engine provides Engine layer components for assembling
// AI advisor conversations and parsing structured suggestions. It is
// stateless and operates on its own input/output DTOs, without importing
// access layer types.
package chat_engine

// ChatMessage represents a single message in a conversation.
type ChatMessage struct {
	Role    string `json:"role"`    // "system", "user", "assistant"
	Content string `json:"content"`
}

// OKRContext holds the OKR data passed to the engine for context assembly.
type OKRContext struct {
	ThemeID    string         `json:"themeId"`
	ThemeName  string         `json:"themeName"`
	Objectives []OKRObjective `json:"objectives,omitempty"`
	Routines   []OKRRoutine   `json:"routines,omitempty"`
}

// OKRObjective represents an objective with optional children and key results.
type OKRObjective struct {
	ID         string         `json:"id"`
	Title      string         `json:"title"`
	Status     string         `json:"status,omitempty"`
	KeyResults []OKRKeyResult `json:"keyResults,omitempty"`
	Children   []OKRObjective `json:"children,omitempty"`
}

// OKRKeyResult represents a key result with start, current, and target values.
type OKRKeyResult struct {
	ID           string `json:"id"`
	Description  string `json:"description"`
	StartValue   int    `json:"startValue"`
	CurrentValue int    `json:"currentValue"`
	TargetValue  int    `json:"targetValue"`
}

// OKRRoutine represents a routine. Periodic routines have a repeat pattern;
// sporadic routines have none. Numeric tracking is no longer part of the model.
type OKRRoutine struct {
	ID          string `json:"id"`
	Description string `json:"description"`
}

// AdviceResponse is the response from the advisor containing text and
// optional structured suggestions.
type AdviceResponse struct {
	Text        string       `json:"text"`
	Suggestions []Suggestion `json:"suggestions,omitempty"`
}

// Suggestion represents a structured suggestion from the advisor.
type Suggestion struct {
	Type   string `json:"type"`   // "theme", "objective", "key_result", "routine"
	Action string `json:"action"` // "create", "edit"
	// Type-specific data -- only one will be populated.
	ThemeData     *ThemeSuggestion     `json:"themeData,omitempty"`
	ObjectiveData *ObjectiveSuggestion `json:"objectiveData,omitempty"`
	KeyResultData *KeyResultSuggestion `json:"keyResultData,omitempty"`
	RoutineData   *RoutineSuggestion   `json:"routineData,omitempty"`
}

// ThemeSuggestion holds data for a suggested theme creation or edit.
type ThemeSuggestion struct {
	ID    string `json:"id,omitempty"`
	Name  string `json:"name"`
	Color string `json:"color,omitempty"`
}

// ObjectiveSuggestion holds data for a suggested objective creation or edit.
type ObjectiveSuggestion struct {
	ID       string `json:"id,omitempty"`
	Title    string `json:"title"`
	ParentID string `json:"parentId,omitempty"`
}

// KeyResultSuggestion holds data for a suggested key result creation or edit.
type KeyResultSuggestion struct {
	ID                string `json:"id,omitempty"`
	Description       string `json:"description"`
	StartValue        int    `json:"startValue"`
	CurrentValue      int    `json:"currentValue"`
	TargetValue       int    `json:"targetValue"`
	ParentObjectiveID string `json:"parentObjectiveId,omitempty"`
}

// RoutineSuggestion holds data for a suggested routine creation or edit.
// Routines no longer carry numeric targets — periodicity is expressed via
// repeat patterns (added separately in the OKR view).
type RoutineSuggestion struct {
	ID          string `json:"id,omitempty"`
	Description string `json:"description"`
}
