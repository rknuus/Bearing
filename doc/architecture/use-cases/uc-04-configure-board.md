# uc-4 — Configure Board

**Purpose:** Add / remove / rename / reorder kanban columns, with bookend constraints (todo first, done last).

```mermaid
%%{init: {'themeVariables': {'signalTextColor':'#000'}}}%%
sequenceDiagram
    autonumber
    actor User
    participant View as EisenKanView_BoardConfigDialog
    participant App as App.main_go
    participant WM as WorkspaceManager
    participant TaA as TaskAccess
    participant Repo as Repository
    participant FS as Filesystem_git

    rect rgb(245,245,255)
    Note over User,FS: Add Column
    User->>View: Submit title, insertAfterSlug
    View->>App: AddColumn title, insertAfterSlug
    App->>WM: AddColumn
    WM->>WM: Slugify title, reject reserved archived, validate uniqueness
    WM->>TaA: GetBoardConfiguration
    WM->>WM: validate insertion not before todo or after done bookends
    WM->>TaA: EnsureStatusDirectory slug
    WM->>TaA: SaveBoardConfiguration config
    WM->>TaA: CommitAll Add column title
    TaA->>Repo: Begin, Stage, Commit
    WM-->>View: BoardConfiguration
    View->>View: replace boardConfig
    end

    rect rgb(245,255,245)
    Note over User,FS: Remove Column
    User->>View: Confirm removal slug
    View->>App: RemoveColumn slug
    App->>WM: RemoveColumn
    WM->>TaA: GetBoardConfiguration, validate type equals doing
    WM->>TaA: GetTasksByStatus slug, must be empty
    WM->>TaA: RemoveStatusDirectory slug
    WM->>TaA: LoadTaskOrder, WriteTaskOrder without slug
    WM->>TaA: SaveBoardConfiguration config
    WM->>TaA: CommitAll Remove column slug
    WM-->>View: BoardConfiguration
    end

    rect rgb(255,250,235)
    Note over User,FS: Rename Column
    User->>View: Edit column title
    View->>App: RenameColumn oldSlug, newTitle
    App->>WM: RenameColumn
    WM->>WM: Slugify -> newSlug, if unchanged title-only path
    WM->>TaA: RenameStatusDirectory oldSlug, newSlug
    WM->>TaA: LoadTaskOrder, migrate zone keys, WriteTaskOrder
    WM->>TaA: SaveBoardConfiguration config
    WM->>TaA: CommitAll Rename column newTitle
    end
```

## Notes — error / atomicity / git

- All column ops use `taskAccess.CommitAll(...)` so directory rename + config update + `task_order.json` migration land in one git commit.
- Frontend has no optimistic updates here — it waits for the new `BoardConfiguration` from the backend before re-rendering columns.

## Drift vs `bearing.method`

Aligned. Model captures column ops at intent level; the code's `LoadTaskOrder`/`WriteTaskOrder` write-only mutex pair is summarised as `SaveTaskOrder` in the model — equivalent semantics.
