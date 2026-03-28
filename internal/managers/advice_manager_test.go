package managers

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/rkn/bearing/internal/access"
	"github.com/rkn/bearing/internal/engines/chat_engine"
)

// --- Mock implementations for AdviceManager tests ---

// mockAdviceThemeAccess implements access.IThemeAccess for AdviceManager tests.
type mockAdviceThemeAccess struct {
	themes []access.LifeTheme
	err    error
}

func (m *mockAdviceThemeAccess) GetThemes() ([]access.LifeTheme, error) {
	return m.themes, m.err
}

func (m *mockAdviceThemeAccess) SaveTheme(_ access.LifeTheme) error {
	return nil
}

func (m *mockAdviceThemeAccess) DeleteTheme(_ string) error {
	return nil
}

// mockAdviceChatEngine implements chat_engine.IChatEngine for AdviceManager tests.
type mockAdviceChatEngine struct {
	assembledMessages []chat_engine.ChatMessage
	cleanText         string
	suggestions       []chat_engine.Suggestion
}

func (m *mockAdviceChatEngine) AssembleConversation(_ []chat_engine.OKRContext, history []chat_engine.ChatMessage, userMessage string) []chat_engine.ChatMessage {
	if m.assembledMessages != nil {
		return m.assembledMessages
	}
	messages := make([]chat_engine.ChatMessage, 0, 1+len(history)+1)
	messages = append(messages, chat_engine.ChatMessage{Role: "system", Content: "system prompt"})
	messages = append(messages, history...)
	messages = append(messages, chat_engine.ChatMessage{Role: "user", Content: userMessage})
	return messages
}

func (m *mockAdviceChatEngine) ParseSuggestions(responseText string) (string, []chat_engine.Suggestion) {
	text := responseText
	if m.cleanText != "" {
		text = m.cleanText
	}
	return text, m.suggestions
}

// mockAdviceModelAccess implements access.IModelAccess for AdviceManager tests.
type mockAdviceModelAccess struct {
	response string
	err      error
	models   []access.ModelInfo
}

func (m *mockAdviceModelAccess) SendMessage(_ []access.ModelMessage) (string, error) {
	return m.response, m.err
}

func (m *mockAdviceModelAccess) GetAvailableModels() []access.ModelInfo {
	if m.models != nil {
		return m.models
	}
	return []access.ModelInfo{}
}

// mockAdviceUIStateAccess implements access.IUIStateAccess for AdviceManager tests.
type mockAdviceUIStateAccess struct {
	advisorEnabled bool
	advisorErr     error
}

func (m *mockAdviceUIStateAccess) LoadNavigationContext() (*access.NavigationContext, error) {
	return nil, nil
}

func (m *mockAdviceUIStateAccess) SaveNavigationContext(_ access.NavigationContext) error {
	return nil
}

func (m *mockAdviceUIStateAccess) LoadTaskDrafts() (json.RawMessage, error) {
	return nil, nil
}

func (m *mockAdviceUIStateAccess) SaveTaskDrafts(_ json.RawMessage) error {
	return nil
}

func (m *mockAdviceUIStateAccess) LoadAdvisorEnabled() (bool, error) {
	return m.advisorEnabled, m.advisorErr
}

func (m *mockAdviceUIStateAccess) SaveAdvisorEnabled(enabled bool) error {
	if m.advisorErr != nil {
		return m.advisorErr
	}
	m.advisorEnabled = enabled
	return nil
}

// newTestAdviceManager creates an AdviceManager with the given mocks for
// testing. It also creates a minimal PlanningManager using stub dependencies.
func newTestAdviceManager(
	themeAccess access.IThemeAccess,
	chatEngine chat_engine.IChatEngine,
	modelAccess access.IModelAccess,
	uiStateAccess access.IUIStateAccess,
) (*AdviceManager, error) {
	// Create a minimal PlanningManager for the dependency
	pm, err := NewPlanningManager(
		themeAccess,
		newMockTaskAccess(),
		&mockCalendarAccess{},
		&mockVisionAccess{},
		uiStateAccess,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create PlanningManager for test: %w", err)
	}

	return NewAdviceManager(themeAccess, chatEngine, modelAccess, uiStateAccess, pm)
}

// sampleThemes returns test themes with objectives, key results, and routines.
func sampleThemes() []access.LifeTheme {
	return []access.LifeTheme{
		{
			ID:    "H",
			Name:  "Health",
			Color: "#22c55e",
			Objectives: []access.Objective{
				{
					ID:       "H-O1",
					ParentID: "H",
					Title:    "Run a marathon",
					Status:   "active",
					KeyResults: []access.KeyResult{
						{
							ID:           "H-KR1",
							ParentID:     "H-O1",
							Description:  "Run 40km per week",
							StartValue:   0,
							CurrentValue: 25,
							TargetValue:  40,
						},
					},
					Objectives: []access.Objective{
						{
							ID:       "H-O2",
							ParentID: "H-O1",
							Title:    "Improve 5K time",
							Status:   "active",
						},
					},
				},
			},
			Routines: []access.Routine{
				{
					ID:           "H-R1",
					Description:  "Sleep 8 hours",
					CurrentValue: 7,
					TargetValue:  8,
					TargetType:   "at-or-above",
					Unit:         "hours",
				},
			},
		},
		{
			ID:    "CF",
			Name:  "Career & Finance",
			Color: "#3b82f6",
			Objectives: []access.Objective{
				{
					ID:       "CF-O1",
					ParentID: "CF",
					Title:    "Get promoted",
					Status:   "active",
				},
			},
		},
	}
}

func TestUnit_AdviceManager_RequestAdvice_Success(t *testing.T) {
	themes := sampleThemes()
	ta := &mockAdviceThemeAccess{themes: themes}
	ce := &mockAdviceChatEngine{cleanText: "Here is my advice."}
	ma := &mockAdviceModelAccess{response: "Here is my advice."}
	ua := &mockAdviceUIStateAccess{}

	am, err := newTestAdviceManager(ta, ce, ma, ua)
	if err != nil {
		t.Fatalf("failed to create AdviceManager: %v", err)
	}

	resp, err := am.RequestAdvice("Help me with my goals", nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp == nil {
		t.Fatal("expected non-nil response")
	}
	if resp.Text != "Here is my advice." {
		t.Errorf("expected response text 'Here is my advice.', got %q", resp.Text)
	}
}

func TestUnit_AdviceManager_RequestAdvice_WithSelectedOKRIds(t *testing.T) {
	themes := sampleThemes()

	var capturedContexts []chat_engine.OKRContext
	ta := &mockAdviceThemeAccess{themes: themes}
	ce := &mockAdviceChatEngine{}
	// Override AssembleConversation to capture the OKR contexts
	capturingEngine := &capturingChatEngine{
		inner:    ce,
		captured: &capturedContexts,
	}
	ma := &mockAdviceModelAccess{response: "Advice for health."}
	ua := &mockAdviceUIStateAccess{}

	pm, _ := NewPlanningManager(ta, newMockTaskAccess(), &mockCalendarAccess{}, &mockVisionAccess{}, ua)
	am, err := NewAdviceManager(ta, capturingEngine, ma, ua, pm)
	if err != nil {
		t.Fatalf("failed to create AdviceManager: %v", err)
	}

	// Select only the Health theme
	resp, err := am.RequestAdvice("Focus on health", nil, []string{"H"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp == nil {
		t.Fatal("expected non-nil response")
	}

	// Verify only Health theme was passed to the engine
	if len(capturedContexts) != 1 {
		t.Fatalf("expected 1 OKR context, got %d", len(capturedContexts))
	}
	if capturedContexts[0].ThemeID != "H" {
		t.Errorf("expected theme ID 'H', got %q", capturedContexts[0].ThemeID)
	}
}

func TestUnit_AdviceManager_RequestAdvice_ModelError(t *testing.T) {
	themes := sampleThemes()
	ta := &mockAdviceThemeAccess{themes: themes}
	ce := &mockAdviceChatEngine{}
	ma := &mockAdviceModelAccess{err: fmt.Errorf("The advisor is currently unavailable. Please try again later.")}
	ua := &mockAdviceUIStateAccess{}

	am, err := newTestAdviceManager(ta, ce, ma, ua)
	if err != nil {
		t.Fatalf("failed to create AdviceManager: %v", err)
	}

	resp, err := am.RequestAdvice("Hello", nil, nil)
	if err == nil {
		t.Fatal("expected error from model access")
	}
	if resp != nil {
		t.Error("expected nil response on error")
	}
	if err.Error() != "The advisor is currently unavailable. Please try again later." {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestUnit_AdviceManager_RequestAdvice_ThemeAccessError(t *testing.T) {
	ta := &mockAdviceThemeAccess{err: fmt.Errorf("disk read error")}
	ce := &mockAdviceChatEngine{}
	ma := &mockAdviceModelAccess{response: "unused"}
	ua := &mockAdviceUIStateAccess{}

	am, err := newTestAdviceManager(ta, ce, ma, ua)
	if err != nil {
		t.Fatalf("failed to create AdviceManager: %v", err)
	}

	resp, err := am.RequestAdvice("Hello", nil, nil)
	if err == nil {
		t.Fatal("expected error from theme access")
	}
	if resp != nil {
		t.Error("expected nil response on error")
	}
	if err.Error() != "Unable to load your goals. Please try again." {
		t.Errorf("unexpected user-friendly error message: %v", err)
	}
}

func TestUnit_AdviceManager_GetAvailableModels(t *testing.T) {
	models := []access.ModelInfo{
		{Name: "Claude", Provider: "Anthropic", Type: "remote", Available: true, Reason: "CLI detected"},
	}
	ta := &mockAdviceThemeAccess{themes: []access.LifeTheme{}}
	ce := &mockAdviceChatEngine{}
	ma := &mockAdviceModelAccess{models: models}
	ua := &mockAdviceUIStateAccess{}

	am, err := newTestAdviceManager(ta, ce, ma, ua)
	if err != nil {
		t.Fatalf("failed to create AdviceManager: %v", err)
	}

	result := am.GetAvailableModels()
	if len(result) != 1 {
		t.Fatalf("expected 1 model, got %d", len(result))
	}
	if result[0].Name != "Claude" {
		t.Errorf("expected model name 'Claude', got %q", result[0].Name)
	}
}

func TestUnit_AdviceManager_GetEnabled_Default(t *testing.T) {
	ta := &mockAdviceThemeAccess{themes: []access.LifeTheme{}}
	ce := &mockAdviceChatEngine{}
	ma := &mockAdviceModelAccess{}
	ua := &mockAdviceUIStateAccess{advisorEnabled: false}

	am, err := newTestAdviceManager(ta, ce, ma, ua)
	if err != nil {
		t.Fatalf("failed to create AdviceManager: %v", err)
	}

	enabled, err := am.GetEnabled()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if enabled {
		t.Error("expected advisor to be disabled by default")
	}
}

func TestUnit_AdviceManager_SetEnabled(t *testing.T) {
	ta := &mockAdviceThemeAccess{themes: []access.LifeTheme{}}
	ce := &mockAdviceChatEngine{}
	ma := &mockAdviceModelAccess{}
	ua := &mockAdviceUIStateAccess{}

	am, err := newTestAdviceManager(ta, ce, ma, ua)
	if err != nil {
		t.Fatalf("failed to create AdviceManager: %v", err)
	}

	if err := am.SetEnabled(true); err != nil {
		t.Fatalf("unexpected error setting enabled: %v", err)
	}

	enabled, err := am.GetEnabled()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !enabled {
		t.Error("expected advisor to be enabled after SetEnabled(true)")
	}
}

func TestUnit_AdviceManager_MultiTurn(t *testing.T) {
	themes := sampleThemes()
	ta := &mockAdviceThemeAccess{themes: themes}
	ce := &mockAdviceChatEngine{}
	ma := &mockAdviceModelAccess{response: "First response."}
	ua := &mockAdviceUIStateAccess{}

	am, err := newTestAdviceManager(ta, ce, ma, ua)
	if err != nil {
		t.Fatalf("failed to create AdviceManager: %v", err)
	}

	// First turn: no history
	resp1, err := am.RequestAdvice("Hello", nil, nil)
	if err != nil {
		t.Fatalf("unexpected error on first turn: %v", err)
	}
	if resp1.Text != "First response." {
		t.Errorf("expected 'First response.', got %q", resp1.Text)
	}

	// Build history from first turn
	history := []chat_engine.ChatMessage{
		{Role: "user", Content: "Hello"},
		{Role: "assistant", Content: resp1.Text},
	}

	// Second turn: with history
	ma.response = "Second response."
	resp2, err := am.RequestAdvice("Follow up", history, nil)
	if err != nil {
		t.Fatalf("unexpected error on second turn: %v", err)
	}
	if resp2.Text != "Second response." {
		t.Errorf("expected 'Second response.', got %q", resp2.Text)
	}
}

func TestUnit_AdviceManager_AcceptSuggestion_CreateObjective(t *testing.T) {
	themes := sampleThemes()
	ta := &mockAdviceThemeAccess{themes: themes}
	ce := &mockAdviceChatEngine{}
	ma := &mockAdviceModelAccess{}
	ua := &mockAdviceUIStateAccess{}

	am, err := newTestAdviceManager(ta, ce, ma, ua)
	if err != nil {
		t.Fatalf("failed to create AdviceManager: %v", err)
	}

	suggestion := chat_engine.Suggestion{
		Type:   "objective",
		Action: "create",
		ObjectiveData: &chat_engine.ObjectiveSuggestion{
			Title:    "Improve diet",
			ParentID: "H",
		},
	}
	err = am.AcceptSuggestion(suggestion, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify the objective was created under the Health theme
	savedThemes, _ := ta.GetThemes()
	healthTheme := savedThemes[0]
	found := false
	for _, obj := range healthTheme.Objectives {
		if obj.Title == "Improve diet" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected 'Improve diet' objective to be created under Health theme")
	}
}

func TestUnit_AdviceManager_AcceptSuggestion_CreateRoutine(t *testing.T) {
	themes := sampleThemes()
	ta := &mockAdviceThemeAccess{themes: themes}
	ce := &mockAdviceChatEngine{}
	ma := &mockAdviceModelAccess{}
	ua := &mockAdviceUIStateAccess{}

	am, err := newTestAdviceManager(ta, ce, ma, ua)
	if err != nil {
		t.Fatalf("failed to create AdviceManager: %v", err)
	}

	suggestion := chat_engine.Suggestion{
		Type:   "routine",
		Action: "create",
		RoutineData: &chat_engine.RoutineSuggestion{
			Description: "Track water intake",
			TargetValue: 8,
			TargetType:  "at-or-above",
			Unit:        "glasses",
			ThemeID:     "H",
		},
	}
	err = am.AcceptSuggestion(suggestion, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify the routine was created under the Health theme
	savedThemes, _ := ta.GetThemes()
	healthTheme := savedThemes[0]
	found := false
	for _, r := range healthTheme.Routines {
		if r.Description == "Track water intake" {
			found = true
			if r.TargetValue != 8 {
				t.Errorf("expected target value 8, got %d", r.TargetValue)
			}
			if r.Unit != "glasses" {
				t.Errorf("expected unit 'glasses', got %q", r.Unit)
			}
			break
		}
	}
	if !found {
		t.Error("expected 'Track water intake' routine to be created under Health theme")
	}
}

func TestUnit_AdviceManager_AcceptSuggestion_EditObjective(t *testing.T) {
	themes := sampleThemes()
	ta := &mockAdviceThemeAccess{themes: themes}
	ce := &mockAdviceChatEngine{}
	ma := &mockAdviceModelAccess{}
	ua := &mockAdviceUIStateAccess{}

	am, err := newTestAdviceManager(ta, ce, ma, ua)
	if err != nil {
		t.Fatalf("failed to create AdviceManager: %v", err)
	}

	suggestion := chat_engine.Suggestion{
		Type:   "objective",
		Action: "edit",
		ObjectiveData: &chat_engine.ObjectiveSuggestion{
			ID:    "H-O1",
			Title: "Run a half marathon",
		},
	}
	err = am.AcceptSuggestion(suggestion, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify the objective title was updated
	savedThemes, _ := ta.GetThemes()
	healthTheme := savedThemes[0]
	if len(healthTheme.Objectives) == 0 {
		t.Fatal("expected objectives to exist")
	}
	if healthTheme.Objectives[0].Title != "Run a half marathon" {
		t.Errorf("expected title 'Run a half marathon', got %q", healthTheme.Objectives[0].Title)
	}
}

func TestUnit_AdviceManager_AcceptSuggestion_UnknownType(t *testing.T) {
	themes := sampleThemes()
	ta := &mockAdviceThemeAccess{themes: themes}
	ce := &mockAdviceChatEngine{}
	ma := &mockAdviceModelAccess{}
	ua := &mockAdviceUIStateAccess{}

	am, err := newTestAdviceManager(ta, ce, ma, ua)
	if err != nil {
		t.Fatalf("failed to create AdviceManager: %v", err)
	}

	suggestion := chat_engine.Suggestion{
		Type:   "unknown_type",
		Action: "create",
	}
	err = am.AcceptSuggestion(suggestion, "H")
	if err == nil {
		t.Fatal("expected error for unknown suggestion type")
	}
	if !strings.Contains(err.Error(), "unknown suggestion type") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestUnit_AdviceManager_AcceptSuggestion_ParentContextFallback(t *testing.T) {
	themes := sampleThemes()
	ta := &mockAdviceThemeAccess{themes: themes}
	ce := &mockAdviceChatEngine{}
	ma := &mockAdviceModelAccess{}
	ua := &mockAdviceUIStateAccess{}

	am, err := newTestAdviceManager(ta, ce, ma, ua)
	if err != nil {
		t.Fatalf("failed to create AdviceManager: %v", err)
	}

	// Objective with no parentId in suggestion — should fall back to parentContext
	suggestion := chat_engine.Suggestion{
		Type:   "objective",
		Action: "create",
		ObjectiveData: &chat_engine.ObjectiveSuggestion{
			Title: "Meditate daily",
		},
	}
	err = am.AcceptSuggestion(suggestion, "H")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify the objective was created under the Health theme via parentContext
	savedThemes, _ := ta.GetThemes()
	healthTheme := savedThemes[0]
	found := false
	for _, obj := range healthTheme.Objectives {
		if obj.Title == "Meditate daily" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected 'Meditate daily' objective to be created under Health theme via parentContext fallback")
	}
}

func TestUnit_AdviceManager_AcceptSuggestion_CreateKeyResult(t *testing.T) {
	themes := sampleThemes()
	ta := &mockAdviceThemeAccess{themes: themes}
	ce := &mockAdviceChatEngine{}
	ma := &mockAdviceModelAccess{}
	ua := &mockAdviceUIStateAccess{}

	am, err := newTestAdviceManager(ta, ce, ma, ua)
	if err != nil {
		t.Fatalf("failed to create AdviceManager: %v", err)
	}

	suggestion := chat_engine.Suggestion{
		Type:   "key_result",
		Action: "create",
		KeyResultData: &chat_engine.KeyResultSuggestion{
			Description:       "Run 50km per week",
			StartValue:        0,
			TargetValue:       50,
			ParentObjectiveID: "H-O1",
		},
	}
	err = am.AcceptSuggestion(suggestion, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify the key result was created
	savedThemes, _ := ta.GetThemes()
	healthTheme := savedThemes[0]
	found := false
	for _, kr := range healthTheme.Objectives[0].KeyResults {
		if kr.Description == "Run 50km per week" {
			found = true
			if kr.StartValue != 0 {
				t.Errorf("expected start value 0, got %d", kr.StartValue)
			}
			if kr.TargetValue != 50 {
				t.Errorf("expected target value 50, got %d", kr.TargetValue)
			}
			break
		}
	}
	if !found {
		t.Error("expected 'Run 50km per week' key result to be created")
	}
}

func TestUnit_AdviceManager_AcceptSuggestion_UnknownAction(t *testing.T) {
	themes := sampleThemes()
	ta := &mockAdviceThemeAccess{themes: themes}
	ce := &mockAdviceChatEngine{}
	ma := &mockAdviceModelAccess{}
	ua := &mockAdviceUIStateAccess{}

	am, err := newTestAdviceManager(ta, ce, ma, ua)
	if err != nil {
		t.Fatalf("failed to create AdviceManager: %v", err)
	}

	suggestion := chat_engine.Suggestion{
		Type:   "objective",
		Action: "delete",
	}
	err = am.AcceptSuggestion(suggestion, "H")
	if err == nil {
		t.Fatal("expected error for unknown action")
	}
	if !strings.Contains(err.Error(), "unknown suggestion action") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestUnit_AdviceManager_AcceptSuggestion_MissingParentErrors(t *testing.T) {
	themes := sampleThemes()
	ta := &mockAdviceThemeAccess{themes: themes}
	ce := &mockAdviceChatEngine{}
	ma := &mockAdviceModelAccess{}
	ua := &mockAdviceUIStateAccess{}

	am, err := newTestAdviceManager(ta, ce, ma, ua)
	if err != nil {
		t.Fatalf("failed to create AdviceManager: %v", err)
	}

	// Objective without parent context or parentId
	err = am.AcceptSuggestion(chat_engine.Suggestion{
		Type:          "objective",
		Action:        "create",
		ObjectiveData: &chat_engine.ObjectiveSuggestion{Title: "No parent"},
	}, "")
	if err == nil {
		t.Fatal("expected error for missing parent")
	}
	if !strings.Contains(err.Error(), "requires a parent") {
		t.Errorf("unexpected error: %v", err)
	}

	// Key result without parent
	err = am.AcceptSuggestion(chat_engine.Suggestion{
		Type:          "key_result",
		Action:        "create",
		KeyResultData: &chat_engine.KeyResultSuggestion{Description: "No parent KR"},
	}, "")
	if err == nil {
		t.Fatal("expected error for missing parent on key result")
	}

	// Routine without theme
	err = am.AcceptSuggestion(chat_engine.Suggestion{
		Type:        "routine",
		Action:      "create",
		RoutineData: &chat_engine.RoutineSuggestion{Description: "No theme routine"},
	}, "")
	if err == nil {
		t.Fatal("expected error for missing theme on routine")
	}
}

func TestUnit_ConvertThemesToOKRContext(t *testing.T) {
	themes := sampleThemes()

	// Test with no filter (all themes)
	contexts := convertThemesToOKRContext(themes, nil)
	if len(contexts) != 2 {
		t.Fatalf("expected 2 contexts, got %d", len(contexts))
	}

	// Verify Health theme conversion
	health := contexts[0]
	if health.ThemeID != "H" {
		t.Errorf("expected theme ID 'H', got %q", health.ThemeID)
	}
	if health.ThemeName != "Health" {
		t.Errorf("expected theme name 'Health', got %q", health.ThemeName)
	}
	if len(health.Objectives) != 1 {
		t.Fatalf("expected 1 objective, got %d", len(health.Objectives))
	}

	obj := health.Objectives[0]
	if obj.ID != "H-O1" {
		t.Errorf("expected objective ID 'H-O1', got %q", obj.ID)
	}
	if obj.Title != "Run a marathon" {
		t.Errorf("expected objective title 'Run a marathon', got %q", obj.Title)
	}
	if obj.Status != "active" {
		t.Errorf("expected status 'active', got %q", obj.Status)
	}
	if len(obj.KeyResults) != 1 {
		t.Fatalf("expected 1 key result, got %d", len(obj.KeyResults))
	}

	kr := obj.KeyResults[0]
	if kr.ID != "H-KR1" {
		t.Errorf("expected KR ID 'H-KR1', got %q", kr.ID)
	}
	if kr.StartValue != 0 || kr.CurrentValue != 25 || kr.TargetValue != 40 {
		t.Errorf("unexpected KR values: start=%d current=%d target=%d", kr.StartValue, kr.CurrentValue, kr.TargetValue)
	}

	// Verify nested objectives
	if len(obj.Children) != 1 {
		t.Fatalf("expected 1 child objective, got %d", len(obj.Children))
	}
	if obj.Children[0].ID != "H-O2" {
		t.Errorf("expected child objective ID 'H-O2', got %q", obj.Children[0].ID)
	}

	// Verify routines
	if len(health.Routines) != 1 {
		t.Fatalf("expected 1 routine, got %d", len(health.Routines))
	}
	routine := health.Routines[0]
	if routine.ID != "H-R1" {
		t.Errorf("expected routine ID 'H-R1', got %q", routine.ID)
	}
	if routine.Unit != "hours" {
		t.Errorf("expected unit 'hours', got %q", routine.Unit)
	}

	// Test with theme ID filter
	filteredContexts := convertThemesToOKRContext(themes, []string{"CF"})
	if len(filteredContexts) != 1 {
		t.Fatalf("expected 1 filtered context, got %d", len(filteredContexts))
	}
	if filteredContexts[0].ThemeID != "CF" {
		t.Errorf("expected filtered theme 'CF', got %q", filteredContexts[0].ThemeID)
	}

	// Test with empty slice (should return all)
	allContexts := convertThemesToOKRContext(themes, []string{})
	if len(allContexts) != 2 {
		t.Fatalf("expected 2 contexts with empty filter, got %d", len(allContexts))
	}

	// Test with objective ID — should include parent theme, only the selected objective
	objContexts := convertThemesToOKRContext(themes, []string{"H-O1"})
	if len(objContexts) != 1 {
		t.Fatalf("expected 1 context for objective filter, got %d", len(objContexts))
	}
	if objContexts[0].ThemeID != "H" {
		t.Errorf("expected parent theme 'H', got %q", objContexts[0].ThemeID)
	}
	if len(objContexts[0].Objectives) != 1 {
		t.Fatalf("expected 1 objective, got %d", len(objContexts[0].Objectives))
	}
	if objContexts[0].Objectives[0].ID != "H-O1" {
		t.Errorf("expected objective 'H-O1', got %q", objContexts[0].Objectives[0].ID)
	}
	// Selected objective should include all its KRs and children
	if len(objContexts[0].Objectives[0].KeyResults) != 1 {
		t.Errorf("expected 1 KR under selected objective, got %d", len(objContexts[0].Objectives[0].KeyResults))
	}
	if len(objContexts[0].Objectives[0].Children) != 1 {
		t.Errorf("expected 1 child under selected objective, got %d", len(objContexts[0].Objectives[0].Children))
	}

	// Test with KR ID — should include parent theme and parent objective
	krContexts := convertThemesToOKRContext(themes, []string{"H-KR1"})
	if len(krContexts) != 1 {
		t.Fatalf("expected 1 context for KR filter, got %d", len(krContexts))
	}
	if len(krContexts[0].Objectives) != 1 {
		t.Fatalf("expected 1 objective for KR filter, got %d", len(krContexts[0].Objectives))
	}
	if len(krContexts[0].Objectives[0].KeyResults) != 1 {
		t.Fatalf("expected 1 KR, got %d", len(krContexts[0].Objectives[0].KeyResults))
	}
	if krContexts[0].Objectives[0].KeyResults[0].ID != "H-KR1" {
		t.Errorf("expected KR 'H-KR1', got %q", krContexts[0].Objectives[0].KeyResults[0].ID)
	}

	// Test with objective + its KRs — objective selected means all descendants included
	mixedContexts := convertThemesToOKRContext(themes, []string{"H-O1", "H-KR1"})
	if len(mixedContexts) != 1 {
		t.Fatalf("expected 1 context, got %d", len(mixedContexts))
	}
	if len(mixedContexts[0].Objectives) != 1 {
		t.Fatalf("expected 1 objective, got %d", len(mixedContexts[0].Objectives))
	}

	// Test with routine ID
	routineContexts := convertThemesToOKRContext(themes, []string{"H-R1"})
	if len(routineContexts) != 1 {
		t.Fatalf("expected 1 context for routine filter, got %d", len(routineContexts))
	}
	if len(routineContexts[0].Routines) != 1 {
		t.Fatalf("expected 1 routine, got %d", len(routineContexts[0].Routines))
	}
	if routineContexts[0].Routines[0].ID != "H-R1" {
		t.Errorf("expected routine 'H-R1', got %q", routineContexts[0].Routines[0].ID)
	}
}

// capturingChatEngine wraps a chat engine and captures the OKR contexts
// passed to AssembleConversation.
type capturingChatEngine struct {
	inner    chat_engine.IChatEngine
	captured *[]chat_engine.OKRContext
}

func (c *capturingChatEngine) AssembleConversation(okrData []chat_engine.OKRContext, history []chat_engine.ChatMessage, userMessage string) []chat_engine.ChatMessage {
	*c.captured = okrData
	return c.inner.AssembleConversation(okrData, history, userMessage)
}

func (c *capturingChatEngine) ParseSuggestions(responseText string) (string, []chat_engine.Suggestion) {
	return c.inner.ParseSuggestions(responseText)
}
