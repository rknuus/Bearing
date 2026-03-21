# 09 — NavigationContext and TaskDrafts Are Pass-Through Toll Booths

> **Status: RESOLVED** — 2026-03-21
> New `UIStateAccess` RA component at `internal/access/ui_state_access.go` owns NavigationContext and TaskDrafts persistence.
> Manager stays in the call path (closed architecture — gateway calls only the layer immediately underneath).
> Fixed lossy DTO conversion: 7 fields (`FilterThemeIDs`, `TodayFocusActive`, `TagFocusActive`, `CollapsedSections`, `CollapsedColumns`, `CalendarDayEditorDate`, `CalendarDayEditorExpandedIds`) were silently dropped; now all 17 fields are mapped through both Manager and gateway layers.

## Finding

`LoadNavigationContext`, `SaveNavigationContext`, `LoadTaskDrafts`, `SaveTaskDrafts` are pass-through operations in the Manager — no orchestration, no validation, no rule evaluation. The Manager acts as a proxy adding zero value.

## Severity: Medium

## Urgency: When convenient

These methods are not architecturally harmful but add unnecessary indirection and bloat the Manager interface.

## Current State

**`internal/managers/planning_manager.go:1994-1996`** — `LoadTaskDrafts` is a pure pass-through:
```go
func (m *PlanningManager) LoadTaskDrafts() (json.RawMessage, error) {
    return m.planAccess.LoadTaskDrafts()
}
```

**`internal/managers/planning_manager.go:1999-2001`** — `SaveTaskDrafts` is a pure pass-through:
```go
func (m *PlanningManager) SaveTaskDrafts(data json.RawMessage) error {
    return m.planAccess.SaveTaskDrafts(data)
}
```

**`internal/managers/planning_manager.go:1942-1968`** — `LoadNavigationContext` reads from RA, constructs a Manager-layer DTO, and returns. No business logic.

**`internal/managers/planning_manager.go:1971-1991`** — `SaveNavigationContext` converts Manager DTO to access DTO and writes. No validation, no rules.

These four methods contribute zero business value in the Manager. They exist only because the gateway calls the Manager for everything.

Note: Neither NavigationContext nor TaskDrafts is git-versioned. The RA writes them as plain files (see `plan_access.go:1229-1236` and `plan_access.go:1255-1260`).

## Target State

The gateway accesses UI state persistence directly through the RA, bypassing the Manager layer entirely. UI state is not business data — it has no business rules, no orchestration, and no volatility to encapsulate at the Manager level.

**Option A: Gateway calls RA directly**
```
BearingClient → App → UIStateAccess (new RA) → file system
```
No Manager involved. The gateway converts its DTOs directly to/from the RA's types.

**Option B: Remove from Manager interface, keep in RA**
Same as Option A but using the existing `PlanAccess` (or its successor) directly from the gateway.

## Steps

1. **Create `internal/access/ui_state_access.go`** with `IUIStateAccess`:
   ```go
   type IUIStateAccess interface {
       LoadNavigationContext() (*NavigationContext, error)
       SaveNavigationContext(ctx NavigationContext) error
       LoadTaskDrafts() (json.RawMessage, error)
       SaveTaskDrafts(data json.RawMessage) error
   }
   ```

2. **Move implementations** from `plan_access.go` (lines 1208-1260) to `ui_state_access.go`.

3. **Update `main.go`** to hold a reference to `IUIStateAccess`:
   ```go
   type App struct {
       // ...managers...
       uiStateAccess access.IUIStateAccess
   }
   ```

4. **Update gateway methods** (`LoadNavigationContext`, `SaveNavigationContext`, `LoadTaskDrafts`, `SaveTaskDrafts`) to call `a.uiStateAccess` directly instead of `a.planningManager`.

5. **Remove from `IPlanningManager`** (lines 92-98):
   ```go
   // Remove these:
   LoadNavigationContext() (*NavigationContext, error)
   SaveNavigationContext(ctx NavigationContext) error
   LoadTaskDrafts() (json.RawMessage, error)
   SaveTaskDrafts(data json.RawMessage) error
   ```

6. **Remove Manager implementations** (lines 1942-2001).

7. **Remove `NavigationContext` type** from the Manager package (lines 26-37) — it duplicates the access layer type.

8. **Update tests**: Any tests that test these methods through the Manager should test through the RA directly.

## Risk

- **Low risk**: These are simple read/write operations with no business logic. Moving them cannot break business rules because there are none.
- **Navigation context caching**: `SaveNavigationContext` caches the context in `m.navigationContext` (line 1989). If anything reads this cached value, that consumer must be updated. Search for `m.navigationContext` usage — currently only set, never read by other methods.

## Dependencies

- **Independent**: Can be done at any time.
- **Do before or during**: Finding 04 (God Manager) — removing 4 methods from the Manager interface reduces the decomposition surface.
- **Related to**: Finding 10 (method file) — the use case for "Persist UI State" (uc-10) should be updated to show direct Gateway-to-RA flow.
