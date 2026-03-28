package managers

import (
	"encoding/json"
	"fmt"
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

func TestUnit_AdviceManager_AcceptSuggestion_NotImplemented(t *testing.T) {
	ta := &mockAdviceThemeAccess{themes: []access.LifeTheme{}}
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
	}
	err = am.AcceptSuggestion(suggestion, "H")
	if err == nil {
		t.Fatal("expected error for unimplemented AcceptSuggestion")
	}
	if err.Error() != "suggestion acceptance not yet implemented" {
		t.Errorf("unexpected error message: %v", err)
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

	// Test with filter
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
