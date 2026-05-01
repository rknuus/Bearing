# uc-9 — Manage Personal Vision

**Purpose:** Read / update the personal mission and vision statements (root motivational context).

```mermaid
%%{init: {'themeVariables': {'signalTextColor':'#000'}}}%%
sequenceDiagram
    autonumber
    actor User
    participant View as OKRView_VisionPanel
    participant App as App.main_go
    participant PM as PlanningManager
    participant VA as VisionAccess
    participant Repo as Repository
    participant FS as Filesystem

    rect rgb(245,245,255)
    Note over User,FS: Load on view mount
    View->>App: GetPersonalVision
    App->>PM: GetPersonalVision
    PM->>VA: LoadVision
    VA->>FS: read vision.json
    VA-->>View: mission, vision, updatedAt
    end

    rect rgb(245,255,245)
    Note over User,FS: Save Personal Vision
    User->>View: Edit and Save
    View->>App: SavePersonalVision mission, vision
    App->>PM: SavePersonalVision mission, vision
    PM->>PM: build PersonalVision Mission, Vision, UpdatedAt now
    PM->>VA: SaveVision PersonalVision
    VA->>FS: writeJSON vision.json
    VA->>Repo: commitFiles vision.json, Update personal vision
    Repo->>FS: Begin, Stage, Commit
    PM-->>View: nil
    View->>View: optimistic update, editingVision equals false
    end
```

## Notes — error / atomicity / git

- Single-file commit per save; no rule evaluation.

## Drift vs `bearing.method`

Aligned.
