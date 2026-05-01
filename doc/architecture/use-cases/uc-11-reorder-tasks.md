# uc-11 — Reorder Tasks

**Purpose:** Persist intra-zone drag-and-drop order changes within columns.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant View as EisenKanView
    participant App as App.main_go
    participant PM as PlanningManager
    participant TaA as TaskAccess
    participant Repo as Repository
    participant FS as Filesystem

    User->>View: Drag task within same zone (no status change)
    View->>App: ReorderTasks positions map zone to taskIds
    App->>PM: ReorderTasks positions
    PM->>PM: lock taskOrderMu
    PM->>TaA: LoadTaskOrder, returns orderMap
    PM->>PM: orderMap zone equals ids, merge proposed positions
    PM->>TaA: SaveTaskOrder orderMap
    TaA->>FS: write task_order.json
    TaA->>Repo: commitFiles task_order.json, Reorder tasks
    PM-->>View: ReorderResult Success=true, Positions equal orderMap
    View->>View: replace authoritative positions, verifyTaskState
```

## Notes — error / atomicity / git

- Single-file commit; serialised by `taskOrderMu`.
- The Manager merges proposed positions into the **full** order map so untouched zones aren't clobbered.

## Drift vs `bearing.method`

Aligned.
