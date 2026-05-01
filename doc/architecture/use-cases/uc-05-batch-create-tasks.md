# uc-5 — Batch Create Tasks

**Purpose:** Stage multiple tasks in a draft dialog, persist drafts without git, then commit them as a batch.

```mermaid
%%{init: {'themeVariables': {'signalTextColor':'#000'}}}%%
sequenceDiagram
    autonumber
    actor User
    participant View as EisenKanView_BatchDialog
    participant App as App.main_go
    participant PM as PlanningManager
    participant RE as RuleEngine
    participant TaA as TaskAccess
    participant UI as UIStateAccess
    participant Repo as Repository
    participant FS as Filesystem

    rect rgb(245,245,255)
    Note over User,FS: Open dialog, load drafts
    User->>View: Open Create Tasks dialog
    View->>App: LoadTaskDrafts
    App->>PM: LoadTaskDrafts
    PM->>UI: LoadTaskDrafts, reads tasks drafts.json (no git)
    UI-->>View: JSON string
    View->>View: hydrate stagedTasks
    end

    rect rgb(245,255,245)
    Note over User,FS: Stage edits (unsaved)
    User->>View: Add or edit or remove staged tasks
    View->>App: SaveTaskDrafts JSON of stagedTasks
    App->>PM: SaveTaskDrafts rawJSON
    PM->>UI: SaveTaskDrafts json, writes tasks drafts.json (no git)
    end

    rect rgb(255,250,235)
    Note over User,FS: Commit batch
    User->>View: Click Create All
    loop per staged task
        View->>App: CreateTask title, themeId, priority, description, tags, promotionDate
        App->>PM: CreateTask
        PM->>RE: EvaluateTaskChange EventTaskCreate
        alt allowed
            PM->>TaA: SaveTaskWithOrder task, dropZone
            TaA->>Repo: commit Add task
            PM-->>View: Task
            View->>View: remove from staged
        else rejected
            PM-->>View: error rule violation
            View->>View: keep in staged for retry
        end
    end
    alt all succeeded
        View->>App: SaveTaskDrafts empty
        App->>PM: SaveTaskDrafts empty
        PM->>UI: SaveTaskDrafts empty
    end
    View->>View: verifyTaskState once at end
    end
```

## Notes — error / atomicity / git

- Each task is its own git commit; the batch is **not** atomic. Failed tasks remain in the draft for retry.
- Drafts are NOT git-versioned (`UIStateAccess`).

## Drift vs `bearing.method`

Aligned.
