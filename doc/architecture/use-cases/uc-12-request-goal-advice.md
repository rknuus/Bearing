# uc-12 — Request Goal Advice

**Purpose:** AI-powered chat advisor over the OKR hierarchy; can apply structured suggestions back to PlanningManager.

```mermaid
%%{init: {'themeVariables': {'signalTextColor':'#000'}}}%%
sequenceDiagram
    autonumber
    actor User
    participant View as AdvisorChat
    participant App as App.main_go
    participant AM as AdviceManager
    participant TA as ThemeAccess
    participant RoA as RoutineAccess
    participant CE as ChatEngine
    participant MA as ModelAccess_ClaudeCLI
    participant PM as PlanningManager
    participant UI as UIStateAccess
    participant Claude as ClaudeBinary

    rect rgb(245,245,255)
    Note over User,Claude: Request Advice (multi-turn)
    User->>View: Submit message and selectedOKRIds
    View->>App: RequestAdvice message, historyJSON, selectedOKRIds
    App->>App: json.Unmarshal historyJSON to ChatMessage list
    App->>AM: RequestAdvice message, history, selectedOKRIds
    AM->>TA: GetThemes
    AM->>RoA: GetRoutines
    AM->>AM: convertThemesToOKRContext themes, routines, selectedOKRIds
    AM->>CE: AssembleConversation okrContexts, history, message
    CE-->>AM: list of ChatMessage system plus context plus sanitized history plus user
    AM->>AM: convertChatToModelMessages
    AM->>MA: SendMessage modelMessages
    MA->>Claude: spawn claude print, stdin and stdout pipe, timeout
    Claude-->>MA: response text
    MA-->>AM: responseText
    AM->>CE: ParseSuggestions responseText
    CE-->>AM: cleanText, list of Suggestion
    AM-->>View: AdviceResponse Text, Suggestions
    View->>View: append assistant message, render suggestion cards
    end

    rect rgb(245,255,245)
    Note over User,Claude: Accept Suggestion (direct-apply, SYNCHRONOUS)
    User->>View: Click Accept on a suggestion card
    View->>App: AcceptSuggestion suggestionJSON, parentContext
    App->>App: json.Unmarshal suggestionJSON to Suggestion
    App->>AM: AcceptSuggestion suggestion, parentContext
    alt suggestion.Action equals create
        AM->>PM: Establish EstablishRequest theme or objective or key-result or routine
        PM->>TA: GetThemes and SaveTheme (or RoA.SaveRoutine)
    else suggestion.Action equals edit
        AM->>PM: Revise ReviseRequest
        PM->>TA: GetThemes and SaveTheme
    end
    PM-->>AM: nil or err
    AM-->>View: nil or err
    View->>View: refresh themes, mark suggestion as applied
    end

    rect rgb(255,250,235)
    Note over User,Claude: Check Model Availability
    View->>App: GetAvailableModels
    App->>AM: GetAvailableModels
    AM->>MA: GetAvailableModels
    MA->>MA: probe claude binary on PATH, classify local or remote
    MA-->>View: list of ModelInfo name, provider, type, available, reason
    end

    rect rgb(255,240,245)
    Note over User,Claude: Toggle Advisor Setting
    View->>App: GetAdviceSetting or SetAdviceSetting true or false
    App->>AM: GetEnabled or SetEnabled
    AM->>UI: LoadAdvisorEnabled or SaveAdvisorEnabled
    end
```

## Notes — error / atomicity / git

- LLM call has its own timeout (per `ClaudeCLIModelAccess`); errors from `claude` are mapped to user-friendly strings before bubbling up.
- Suggestions that mutate OKRs go through PlanningManager and inherit its git-commit semantics (one commit per accepted suggestion).

## Drift vs `bearing.method`

Aligned. The model now marks `AdviceManager → PlanningManager AcceptSuggestion` as `sync: true` and notes "synchronous direct method call from `AdviceManager.acceptCreate`/`acceptEdit` to `PlanningManager.Establish`/`Revise`. No queue, no message bus, no goroutine indirection." The validator's `same-layer-call` finding is linked to a recorded architectural decision (`Accept synchronous AdviceManager → PlanningManager call as documented architectural debt`, status `revisit`).
