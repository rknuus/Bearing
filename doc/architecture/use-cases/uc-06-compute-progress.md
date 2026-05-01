# uc-6 — Compute Progress

**Purpose:** Compute progress for the OKR hierarchy. Read-only, no persistence.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant View as OKRView
    participant App as App.main_go
    participant PM as PlanningManager
    participant TA as ThemeAccess
    participant PE as ProgressEngine
    participant FS as Filesystem

    User->>View: Open OKR view or mutate any OKR
    View->>App: GetAllThemeProgress
    App->>PM: GetAllThemeProgress
    PM->>TA: GetThemes, reads themes.json
    TA->>FS: read themes themes.json
    TA-->>PM: list of access.LifeTheme
    PM->>PM: toEngineThemeData for each theme
    PM->>PE: ComputeAllThemeProgress engineThemes
    PE->>PE: per-KR formula current minus start over target minus start times 100
    PE->>PE: per-Objective avg of child KR progress
    PE->>PE: per-Theme avg of top-level Objective progress
    PE-->>PM: list of ThemeProgress computed
    PM->>PM: convert engine to manager DTOs
    PM-->>View: list of ThemeProgress
    View->>View: themeProgress equals result
```

## Notes — error / atomicity / git

- Pure computation; no commits, no side effects.

## Drift vs `bearing.method`

Aligned. `ProgressEngine` is a first-class engine in the model; `PlanningManager` description and uc-6 text now state that the manager fetches themes via `ThemeAccess` and delegates the entire computation to `ProgressEngine`. The stale "should be extracted" assessment has been removed.
