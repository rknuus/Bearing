# 03 — Business Logic in the Wrong Layers

> **Status: RESOLVED** — Phase 1+2: Commit `a03a2a6` (2026-03-20). Phase 3: 2026-03-22.
> Phase 1: `Slugify` → `utilities/strings.go`, `SuggestAbbreviation` → managers, validators → `managers/validators.go`, `DefaultBoardConfiguration` → managers.
> Phase 2: Progress computation → new `ProgressEngine` at `internal/engines/progress_engine/`.
> Phase 3: `reconcileTaskOrder`, `dropZoneForTask`, `todoSlugFromConfig` → `RuleEngine` methods `ReconcileTaskOrder`, `DropZoneForTask`, `TodoSlugFromColumns`. New `ColumnInfo` DTO. All 15 Manager call sites updated. `vol-task-ordering` updated with `RuleEngine` as co-encapsulator.

## Finding

Six pieces of business logic are in the wrong architectural layer. The access layer contains business rules and utility functions. The Manager contains computation logic that belongs in an Engine.

## Severity: High

## Urgency: Immediate

The Method requires: "Keep Managers as pure orchestration" and "Confine Resource Access to access volatility only — not processing, judgment, or interpretation." Multiple violations exist.

## Current State

### 1. `SuggestAbbreviation()` — Access layer has ID generation logic

**`internal/access/plan_access.go:973-1029`** — `SuggestAbbreviation` implements a multi-strategy abbreviation algorithm (multi-word initials, progressive length, fallback combinations). This is business logic for theme identity, not data access.

**Called from**: `plan_access.go:279` (in `SaveTheme`) and `planning_manager.go:1937` (via `SuggestThemeAbbreviation`).

**Should be**: Manager or Engine layer. The Manager calls this before passing data to RA.

### 2. `Slugify()` — Access layer has utility function

**`internal/access/models.go:290-309`** — `Slugify` converts titles to URL-friendly slugs. This is a pure string utility with no access-layer concern.

**Called from**: `planning_manager.go:1666, 1796` (Manager uses it for column operations).

**Should be**: Utilities layer or a standalone helper function in the Manager.

### 3. `DefaultBoardConfiguration()` — Access layer defines business defaults

**`internal/access/models.go:173-199`** — Defines the default board layout including column names, types, and Eisenhower priority sections with specific colors. This encodes business knowledge (what the default board looks like).

**Called from**: `plan_access.go:859` (fallback when no config file), `planning_manager.go:1557` (fallback in RestoreTask).

**Should be**: Manager layer. The Manager decides what the default board is; the RA just stores/retrieves.

### 4. `IsValidPriority()`, `IsValidOKRStatus()` — Access layer has validation rules

**`internal/access/models.go:333-340`** — `IsValidPriority` validates Eisenhower priority values.
**`internal/access/models.go:267-276`** — `IsValidOKRStatus` validates OKR lifecycle states.
**`internal/access/models.go:87-93`** — `IsValidClosingStatus` validates closing workflow states.

**Called from**: `planning_manager.go:1168, 721, 832` (Manager uses these for validation).

**Should be**: Manager or Engine layer. Business validation rules should not live with data access. The RA should not have opinions about what constitutes a valid priority.

### 5. `computeKRProgress()`, `computeObjectiveProgress()` — Manager has computation logic

**`internal/managers/planning_manager.go:2020-2036`** — `computeKRProgress` calculates percentage from start/current/target.
**`internal/managers/planning_manager.go:2045-2089`** — `computeObjectiveProgress` recursively aggregates child progress.

**Should be**: Engine layer (new ProgressEngine). Stateless computation over a dataset is exactly what Engines are for.

### 6. `validateTaskOrder()` — Manager has data repair logic

**`internal/managers/planning_manager.go:991-1054`** — Repairs `task_order.json` by cross-referencing against actual task files on disk. This is a reconciliation algorithm, not orchestration.

**Should be**: Engine layer. The Manager should pass both datasets to an Engine that returns the corrected order.

## Target State

| Logic | Current | Target | Method |
|-------|---------|--------|--------|
| `SuggestAbbreviation()` | access | Manager (or Engine for complex ID gen) | Move function, update callers |
| `Slugify()` | access/models.go | utilities or Manager helper | Move function |
| `DefaultBoardConfiguration()` | access/models.go | Manager | Move function, RA returns nil when no file |
| `IsValidPriority()`, `IsValidOKRStatus()` | access/models.go | Manager or shared constants pkg | Move functions |
| `computeKRProgress()`, `computeObjectiveProgress()` | Manager | New ProgressEngine | Create engine, move logic |
| `validateTaskOrder()` | Manager | New method on RuleEngine or ProgressEngine | Extract reconciliation logic |

## Steps

### Phase 1: Quick wins (no new components)

1. **Move `Slugify()`** from `access/models.go` to a new file `internal/utilities/strings.go` (or inline in Manager). Update imports in `planning_manager.go:1666, 1796`.

2. **Move `DefaultBoardConfiguration()`** from `access/models.go` to `internal/managers/planning_manager.go`. Update `plan_access.go:859` to return `nil, nil` when no config file exists (caller handles default). Update `planning_manager.go:1557`.

3. **Move `SuggestAbbreviation()`** from `access/plan_access.go` to `internal/managers/planning_manager.go`. The Manager calls it before `SaveTheme`, removing the RA's ID generation responsibility. Update `plan_access.go:279` to require `theme.ID` to be non-empty (error if empty).

4. **Move validation functions** (`IsValidPriority`, `IsValidOKRStatus`, `IsValidClosingStatus`, `IsValidRoutineTargetType`) — these define business constants. Move them to the Manager package or a shared `internal/domain` package. Note: the Priority and OKRStatus type definitions and constants can stay in access since they define the storage enum, but the `IsValid*` functions that encode business rules should move.

### Phase 2: New Engine (requires new component)

5. **Create `ProgressEngine`** in `internal/engines/progress_engine/`:
   - Interface: `IProgressEngine` with `ComputeThemeProgress(themes []ThemeData) []ThemeProgress`
   - Move `computeKRProgress`, `computeObjectiveProgress`, `isActiveOKRStatus` from `planning_manager.go` to the new engine
   - Manager calls `progressEngine.ComputeThemeProgress(themes)` in `GetAllThemeProgress`
   - See Finding 08 for detailed steps

6. **Extract `validateTaskOrder()` logic** into a utility function or engine method that takes the actual task zones and the current order map, and returns the corrected map. The Manager still calls it, but the logic lives in the appropriate layer.

## Risk

- **Phase 1 is low risk**: Moving functions between packages is mechanical. Test coverage will catch regressions.
- **Phase 2 is medium risk**: Creating a new Engine requires careful interface design and test updates.
- **`SuggestAbbreviation` move** requires updating `SaveTheme` in PlanAccess to no longer auto-generate IDs. The Manager must always provide an ID. Verify all paths through `CreateTheme` set an ID before calling `SaveTheme`.

## Dependencies

- **Phase 1**: Can be done independently, in any order.
- **Phase 2**: Depends on deciding the Engine's scope (Finding 08 covers this in detail).
- **Related to**: Finding 01 (Engine dependency inversion) — new ProgressEngine must not import access types.
- **Related to**: Finding 04, 05 (God components) — moving logic out of PlanAccess/PlanningManager reduces their size.
