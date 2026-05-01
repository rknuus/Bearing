# uc-10 — Persist UI State

**Purpose:** Persist transient UI state (navigation context, task drafts, advisor enabled flag) without git versioning.

```mermaid
%%{init: {'themeVariables': {'signalTextColor':'#000'}}}%%
sequenceDiagram
    autonumber
    actor User
    participant View as AnyView
    participant App as App.main_go
    participant PM as PlanningManager
    participant AM as AdviceManager
    participant UI as UIStateAccess
    participant FS as Filesystem

    rect rgb(245,245,255)
    Note over User,FS: Save Navigation Context (no git)
    User->>View: change view or toggle filter or collapse section
    View->>App: SaveNavigationContext ctx
    App->>PM: SaveNavigationContext ctx
    PM->>PM: convert manager DTO to access DTO
    PM->>UI: SaveNavigationContext accessCtx
    UI->>FS: write data navigation_context.json (no commit)
    end

    rect rgb(245,255,245)
    Note over User,FS: Load Navigation Context (on app start)
    View->>App: LoadNavigationContext
    App->>PM: LoadNavigationContext
    PM->>UI: LoadNavigationContext
    UI->>FS: read data navigation_context.json
    alt missing or error
        PM-->>View: default CurrentView equals okr
    else ok
        PM-->>View: NavigationContext mapped to manager DTO
    end
    end

    rect rgb(255,250,235)
    Note over User,FS: Save and Load Task Drafts
    View->>App: LoadTaskDrafts or SaveTaskDrafts json
    App->>PM: same
    PM->>UI: LoadTaskDrafts or SaveTaskDrafts json (tasks drafts.json, no commit)
    end

    rect rgb(255,240,245)
    Note over User,FS: Advisor enabled flag (lives in UIStateAccess too)
    View->>App: GetAdviceSetting or SetAdviceSetting enabled
    App->>AM: GetEnabled or SetEnabled enabled
    AM->>UI: LoadAdvisorEnabled or SaveAdvisorEnabled enabled
    end
```

## Notes — error / atomicity / git

- Intentionally NOT git-versioned. Errors during load fall back to a default context; errors during save are surfaced but non-fatal.

## Drift vs `bearing.method`

Aligned. `UIStateAccess` description now enumerates three concerns: navigation context, task drafts, and advisor enabled flag (`Save/LoadAdvisorEnabled` against `advisor.json`).
