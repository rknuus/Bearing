# 01 — RuleEngine Dependency Inversion Violation

> **Status: RESOLVED** — Commit `91382a4` (2026-03-20)
> RuleEngine now defines its own `TaskData` DTO in `internal/engines/rule_engine/models.go`. The `access` import has been removed from the engines package entirely. The Manager converts `access.Task` → `rule_engine.TaskData` before calling the Engine.

## Finding

The RuleEngine (Engine layer) directly imports and depends on `access.Task` (Resource Access layer). Engines sit above Resource Access but below Managers. An Engine must never reference RA types — it should define its own input contract.

## Severity: Critical

## Urgency: Immediate

This is a hard layering violation. If the storage representation of `Task` changes, the Engine breaks. The dependency arrow points the wrong direction.

## Current State

**`internal/engines/rule_engine/models.go:7`**
```go
import (
    "github.com/rkn/bearing/internal/access"
)
```

**`internal/engines/rule_engine/models.go:23-29`** — `TaskEvent.Task` is typed as `*access.Task`:
```go
type TaskEvent struct {
    Type      EventType    `json:"type"`
    Task      *access.Task `json:"task"`
    OldStatus string       `json:"oldStatus,omitempty"`
    NewStatus string       `json:"newStatus,omitempty"`
    AllTasks  []TaskInfo   `json:"allTasks,omitempty"`
}
```

**`internal/engines/rule_engine/rule_engine.go:227`** — Engine reads `event.Task.Title`, `event.Task.Description`, `event.Task.Priority`, `event.Task.CreatedAt` directly from access types.

**`internal/managers/planning_manager.go:1201-1205`** — Manager passes `access.Task` pointer directly to the Engine:
```go
event := rule_engine.TaskEvent{
    Type:     rule_engine.EventTaskCreate,
    Task:     &task,  // task is access.Task
    AllTasks: taskInfos,
}
```

## Target State

The RuleEngine defines its own input DTO (`rule_engine.TaskData`) containing only the fields the Engine needs. The Manager transforms `access.Task` into `rule_engine.TaskData` before calling the Engine.

```
Engine layer:  rule_engine.TaskData  (owns this type)
Manager layer: transforms access.Task → rule_engine.TaskData
Access layer:  access.Task           (owns this type)
```

The `import "github.com/rkn/bearing/internal/access"` line is removed from the Engine package entirely.

## Steps

1. **Define `rule_engine.TaskData`** in `internal/engines/rule_engine/models.go`:
   ```go
   type TaskData struct {
       ID          string `json:"id"`
       Title       string `json:"title"`
       Description string `json:"description,omitempty"`
       Priority    string `json:"priority"`
       CreatedAt   string `json:"createdAt,omitempty"`
   }
   ```
   This contains only the fields the Engine actually reads: `Title` (checkRequiredFields), `Description` (checkRequiredFields), `Priority` (checkRequiredFields), `CreatedAt` (checkMaxAge), `ID` (checkWIPLimit exclusion).

2. **Update `TaskEvent.Task`** field type from `*access.Task` to `*TaskData`.

3. **Remove the import** of `github.com/rkn/bearing/internal/access` from `models.go`.

4. **Add a conversion helper** in the Manager (`internal/managers/planning_manager.go`):
   ```go
   func toEngineTaskData(t access.Task) rule_engine.TaskData {
       return rule_engine.TaskData{
           ID:          t.ID,
           Title:       t.Title,
           Description: t.Description,
           Priority:    t.Priority,
           CreatedAt:   t.CreatedAt,
       }
   }
   ```

5. **Update all call sites** in the Manager that create `rule_engine.TaskEvent`:
   - `planning_manager.go:1201` — `CreateTask`
   - `planning_manager.go:1286` — `MoveTask`
   - `planning_manager.go:1361` — `UpdateTask`
   Convert `access.Task` to `rule_engine.TaskData` before constructing the event.

6. **Run tests**: `make test` — all `rule_engine_test.go` and `planning_manager_test.go` tests must pass.

7. **Verify no access import remains**: `grep -r "internal/access" internal/engines/` should return nothing.

## Risk

- **Low risk**: The Engine only reads 5 fields from the Task. The `TaskData` struct is a strict subset. No behavioral change occurs.
- **Test coverage**: Existing `rule_engine_test.go` tests construct `TaskEvent` with `access.Task` — these must be updated to use `TaskData` instead. Since the tests directly construct the struct, this is a straightforward find-and-replace.

## Dependencies

- **None** — this fix is self-contained and should be done first.
- **Enables**: Finding 02 (shared DTOs) benefits from this fix since it eliminates one cross-layer type dependency.
- **Can be done together with**: Finding 02.
