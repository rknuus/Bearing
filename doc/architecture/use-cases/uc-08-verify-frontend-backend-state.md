# uc-8 — Verify Frontend-Backend State

**Purpose:** After every mutation, re-fetch backend state and diff it against the optimistic client state; log mismatches.

```mermaid
%%{init: {'themeVariables': {'signalTextColor':'#000'}}}%%
sequenceDiagram
    autonumber
    actor User
    participant View as AnyView
    participant App as App.main_go
    participant PM as PlanningManager
    participant TA as ThemeAccess
    participant TaA as TaskAccess
    participant CA as CalendarAccess

    rect rgb(245,245,255)
    Note over User,CA: Verify OKR State (after mutation in OKRView)
    View->>View: optimistic update local themes
    View->>App: GetHierarchy
    App->>PM: GetHierarchy equals getThemes
    PM->>TA: GetThemes
    TA-->>View: backend list of LifeTheme
    View->>View: checkStateFromData theme, local, backend, id, THEME_FIELDS
    View->>View: plus flattenObjectives plus flattenKeyResults diff
    alt mismatch
        View->>App: LogFrontend error, mismatchDetails, state-check
        View->>View: error banner, loadThemes to recover
    end
    end

    rect rgb(245,255,245)
    Note over User,CA: Verify Task State (after mutation in EisenKan)
    View->>App: GetTasks
    App->>PM: GetTasks
    PM->>TaA: GetBoardConfiguration
    loop per status plus archived
        PM->>TaA: GetTasksByStatus status
    end
    PM->>TaA: LoadTaskOrder and LoadArchivedOrder
    PM->>PM: sort by zone then position
    PM-->>View: list of TaskWithStatus
    View->>View: checkFullState local, backend, zone-aware
    alt mismatch
        View->>App: LogFrontend error, mismatch, state-check
    end
    end

    rect rgb(255,250,235)
    Note over User,CA: Verify Day Focus (after CalendarView edit)
    View->>App: GetYearFocus year
    App->>PM: GetYearFocus year
    PM->>CA: GetYearFocus year
    CA-->>View: list of DayFocus
    View->>View: diff vs yearFocus map, LogFrontend on mismatch
    end
```

## Notes — error / atomicity / git

- This is a *read-only* verification pattern; no commits.
- The `LogFrontend` binding writes to slog (not git). It's the user-facing failsafe when optimistic UI diverges from the source of truth.

## Drift vs `bearing.method`

Aligned. Implementation in `frontend/src/lib/utils/state-check.ts` (`checkStateFromData`, `checkFullState`).
