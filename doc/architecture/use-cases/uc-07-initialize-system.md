# uc-7 — Initialize System

**Purpose:** Resolve data dir, set up logging, open / init git repo, wire access components and managers, and validate / repair task order.

```mermaid
sequenceDiagram
    autonumber
    participant Wails as WailsRuntime
    participant App as App.main_go
    participant Boot as bootstrap.Initialize
    participant Repo as Repository
    participant TA as ThemeAccess
    participant TaA as TaskAccess
    participant CA as CalendarAccess
    participant VA as VisionAccess
    participant RoA as RoutineAccess
    participant UI as UIStateAccess
    participant PM as PlanningManager
    participant WM as WorkspaceManager
    participant AM as AdviceManager
    participant CE as ChatEngine
    participant MA as ModelAccess_ClaudeCLI
    participant RE as RuleEngine
    participant FS as Filesystem

    Wails->>App: startup ctx
    App->>Boot: Initialize
    Boot->>FS: resolve BEARING_DATA_DIR or home bearing dir, mkdir
    Boot->>FS: open bearing.log (slog handler)
    Boot->>Repo: InitializeRepositoryWithConfig bearingDir, gitConfig
    Repo->>FS: open or git-init
    Boot->>TA: NewThemeAccess dir, repo
    Boot->>TaA: NewTaskAccess dir, repo
    Boot->>CA: NewCalendarAccess dir, repo
    Boot->>VA: NewVisionAccess dir, repo
    Boot->>RoA: NewRoutineAccess dir, repo
    Boot->>UI: NewUIStateAccess dir
    Boot->>PM: NewPlanningManager themeA, taskA, calA, routineA, visA, uiA
    PM->>RE: NewRuleEngine DefaultRules
    PM->>PM: NewProgressEngine and NewScheduleEngine
    PM->>PM: validateTaskOrder
    PM->>TaA: GetBoardConfiguration
    PM->>RE: TodoSlugFromColumns cols
    loop per status (cols and archived)
        PM->>TaA: GetTasksByStatus status
        PM->>RE: DropZoneForTask status, priority, tSlug for each task
    end
    PM->>TaA: LoadTaskOrder
    PM->>RE: ReconcileTaskOrder orderMap, actualZone
    alt repair needed
        PM->>TaA: SaveTaskOrder repaired
    end
    Boot->>WM: NewWorkspaceManager taskA
    Boot->>CE: NewChatEngine
    Boot->>MA: NewClaudeCLIModelAccess 0
    Boot->>AM: NewAdviceManager themeA, routineA, ce, ma, uiA, pm
    Boot-->>App: Result PM, WM, AM, LogFile
    App->>App: store managers, slog.Info Bearing started
```

## Notes — error / atomicity / git

- Failure of any step is fatal (`bootstrap.Initialize` returns error, app logs and exits the startup path).
- Task order repair is a single `SaveTaskOrder` call (atomic write, but normally a fast-path no-op).

## Drift vs `bearing.method`

Aligned. The model now has `App.startup` delegate to `bootstrap.Initialize()` as the composition root, with `bootstrap` constructing every access component (including `RoutineAccess` and `ModelAccess`), every engine (`RuleEngine`, `ProgressEngine`, `ScheduleEngine`, `ChatEngine`), and all three managers (`PlanningManager`, `WorkspaceManager`, `AdviceManager`). The validator's `client-orchestration` and `closed-layer-skip` findings on this use case are linked to a recorded architectural decision (`Accept App-as-bootstrapper`, status `active`).
