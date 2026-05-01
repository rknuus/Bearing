# uc-1 — Manage OKR Hierarchy

**Purpose:** Create and edit themes, objectives, key results, and routines via a single behavioral API (`Establish` / `Revise` / `RecordProgress` / `Dismiss`).

```mermaid
%%{init: {'themeVariables': {'signalTextColor':'#000'}}}%%
sequenceDiagram
    autonumber
    actor User
    participant View as OKRView
    participant App as App.main_go
    participant PM as PlanningManager
    participant TA as ThemeAccess
    participant RoA as RoutineAccess
    participant Repo as Repository
    participant FS as Filesystem_git

    rect rgb(245,245,255)
    Note over User,FS: Create Theme
    User->>View: Click New Theme, submit name and color
    View->>App: Establish goalType=theme, name, color
    App->>PM: Establish EstablishRequest
    PM->>PM: createTheme name color
    PM->>TA: GetThemes
    PM->>PM: SuggestAbbreviation name, existing -> ID
    PM->>TA: SaveTheme theme
    TA->>TA: ensureThemeIDs
    TA->>FS: writeJSON themes.json
    TA->>Repo: commitFiles themes.json, Add theme NAME
    Repo->>FS: Begin, Stage, Commit
    PM->>TA: GetThemes (re-read for final ID)
    TA-->>PM: themes
    PM-->>App: EstablishResult Theme
    App-->>View: result.theme
    View->>View: append created to themes
    View->>View: refreshProgress and verifyThemeState
    end

    rect rgb(245,255,245)
    Note over User,FS: Create Objective (parentId may be theme or any objective)
    User->>View: Add objective under parent
    View->>App: Establish goalType=objective, parentId, title
    App->>PM: Establish
    PM->>PM: createObjective parentId, title
    PM->>TA: GetThemes
    PM->>PM: tree-walk to find parent, append new objective
    PM->>TA: SaveTheme modifiedTheme, commit Update theme
    TA->>Repo: commitFiles
    PM->>TA: GetThemes (fetch generated ID)
    PM-->>App: EstablishResult Objective
    App-->>View: created objective
    View->>View: insertObjectiveUnderParent, verifyThemeState
    end

    rect rgb(255,250,235)
    Note over User,FS: Create Key Result
    User->>View: Add KR under objective (description, start, target)
    View->>App: Establish goalType=key-result, parentId, description, start, target
    App->>PM: Establish
    PM->>PM: createKeyResult parentObjId, description, start, target
    PM->>TA: GetThemes, findObjectiveByID, append KR
    PM->>TA: SaveTheme, commitFiles
    PM->>TA: GetThemes (fetch generated KR ID)
    PM-->>View: EstablishResult KeyResult
    end

    rect rgb(255,240,245)
    Note over User,FS: Add Routine (GLOBAL, not theme-scoped)
    User->>View: Add routine (description, repeatPattern)
    View->>App: Establish goalType=routine, description, repeatPattern
    App->>PM: Establish
    PM->>PM: addRoutine description, repeatPattern
    PM->>RoA: GetRoutines
    PM->>PM: NextRoutineID routines -> Rn
    PM->>RoA: SaveRoutine routine
    RoA->>FS: writeJSON routines.json
    RoA->>Repo: commitFiles routines.json, Add or Update routine
    PM-->>View: EstablishResult Routine
    end

    rect rgb(240,245,255)
    Note over User,FS: Close Objective with cascading KR close
    User->>View: Close objective (closingStatus, closingNotes)
    View->>App: CloseObjective objectiveId, status, notes
    App->>PM: CloseObjective
    PM->>TA: GetThemes, findObjectiveByID
    PM->>PM: validate transition, set Status, ClosingNotes, ClosedAt
    PM->>PM: cascade-close child KRs
    PM->>TA: SaveTheme, commitFiles
    PM-->>View: nil error
    View->>View: verifyThemeState
    end

    rect rgb(255,245,235)
    Note over User,FS: Revise / RecordProgress / Dismiss share the same shape
    View->>App: Revise or RecordProgress or Dismiss (goalId, ...)
    App->>PM: same
    PM->>PM: detectGoalType goalId (theme, objective, key-result, routine)
    PM->>TA: GetThemes or RoA.GetRoutines
    PM->>TA: SaveTheme or RoA.SaveRoutine or RoA.DeleteRoutine
    end
```

## Notes — error / atomicity / git

- Each `SaveTheme` is committed in its own git transaction by `commitFiles(repo, …)` (Begin → Stage → Commit) inside `ThemeAccess`; routine writes commit `routines.json` via `RoutineAccess`.
- Frontend uses optimistic update + `verifyThemeState()` (uc-8); on backend error the view calls `loadThemes()` to re-sync.

## Drift vs `bearing.method`

Aligned. The model now lists the behavioral quartet (`Establish` / `Revise` / `RecordProgress` / `Dismiss`) plus `GetHierarchy`, `SuggestAbbreviation`, and the status/close/reopen lifecycle ops. `RoutineAccess` is now a first-class `resource_access` component and global routine sequences route through it (no longer through `ThemeAccess`).
