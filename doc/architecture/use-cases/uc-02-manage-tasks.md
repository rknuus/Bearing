# uc-2 — Manage Tasks

**Purpose:** Create, move, archive, restore, and priority-promote tasks on the EisenKan board.

```mermaid
%%{init: {'themeVariables': {'signalTextColor':'#000'}}}%%
sequenceDiagram
    autonumber
    actor User
    participant View as EisenKanView
    participant App as App.main_go
    participant PM as PlanningManager
    participant RE as RuleEngine
    participant TaA as TaskAccess
    participant Repo as Repository
    participant FS as Filesystem_git

    rect rgb(245,245,255)
    Note over User,FS: Create Task with Rule Evaluation
    User->>View: Submit CreateTaskDialog (title, themeId, priority, ...)
    View->>App: CreateTask title, themeId, priority, description, tags, promotionDate
    App->>PM: CreateTask
    PM->>PM: validate priority, parse tags, parse promotionDate
    PM->>PM: buildTaskInfoList (calls GetTasks for context)
    PM->>RE: EvaluateTaskChange Type=EventTaskCreate, Task, AllTasks
    RE-->>PM: RuleEvaluationResult Allowed, Violations
    PM->>TaA: GetBoardConfiguration
    PM->>RE: TodoSlugFromColumns, DropZoneForTask todo, priority, tSlug
    PM->>TaA: SaveTaskWithOrder task, dropZone
    TaA->>FS: write tasks status id.json and task_order.json
    TaA->>Repo: commitFiles Add task
    PM-->>View: Task with id and timestamps
    View->>View: optimistic insert, verifyTaskState
    end

    rect rgb(245,255,245)
    Note over User,FS: Move Task (drag-drop)
    User->>View: Drag task to new column or priority section
    View->>App: MoveTask taskId, newStatus, newPriority, positions
    App->>PM: MoveTask
    PM->>TaA: GetBoardConfiguration (validate status)
    PM->>PM: GetTasks (locate task, build context)
    PM->>RE: EvaluateTaskChange EventTaskMove, OldStatus, NewStatus, AllTasks
    alt rejected
        RE-->>PM: Allowed=false, Violations
        PM-->>View: MoveTaskResult Success=false, Violations
        View->>View: rollback DnD, surface ErrorBanner with violations
    else accepted
        PM->>TaA: WriteMoveTask taskId, newStatus (no commit yet)
        opt priority change
            PM->>TaA: WriteTask updated priority
        end
        PM->>RE: TodoSlugFromColumns, DropZoneForTask source and target zones
        PM->>TaA: LoadTaskOrder, WriteTaskOrder merged
        PM->>TaA: CommitAll Move task
        TaA->>Repo: Begin, Stage old plus new plus task_order, Commit
        PM-->>View: MoveTaskResult Success=true, Positions
        View->>View: replace authoritative positions, verifyTaskState
    end
    end

    rect rgb(255,250,235)
    Note over User,FS: Archive Task
    User->>View: Archive task (must be done)
    View->>App: ArchiveTask taskId
    App->>PM: ArchiveTask
    PM->>PM: GetTasks (verify status equals done)
    PM->>TaA: WriteArchiveTask taskId, update archived order, remove from task_order
    PM->>TaA: CommitAll Archive task
    PM-->>View: nil error, reload via GetTasks
    end

    rect rgb(255,240,245)
    Note over User,FS: Process Priority Promotions (driven by view on day boundary)
    User->>View: date roll-over hook fires
    View->>App: ProcessPriorityPromotions
    App->>PM: ProcessPriorityPromotions
    PM->>PM: GetTasks, filter promotionDate at or before today
    loop for each promoted task
        PM->>RE: DropZoneForTask for old and new priority
        PM->>TaA: UpdateTaskWithOrderMove task, oldZone, newZone
        TaA->>Repo: Begin, Stage task plus task_order.json, Commit
    end
    PM-->>View: list of PromotedTask
    View->>View: refresh tasks, show toast for each promotion
    end
```

## Notes — error / atomicity / git

- Move/Archive use `WriteX` + `CommitAll` so the task file move, priority rewrite, and `task_order.json` update land in **one** git commit (atomic).
- Rule violations short-circuit BEFORE any write; the frontend rolls the DnD back and shows an `ErrorDialog`.

## Drift vs `bearing.method`

Aligned. Sequences match. The "verifies task is done" step inside `ArchiveTask` is implemented as a `GetTasks` walk rather than a dedicated guard — captured at intent level in the model.
