---
name: themes-and-hierarchical-okrs
status: backlog
created: 2026-02-06T10:07:47Z
updated: 2026-02-06T10:17:09Z
progress: 0%
prd: .claude/prds/themes-and-hierarchical-okrs.md
github: https://github.com/rknuus/Bearing/issues/15
---

# Epic: themes-and-hierarchical-okrs

## Overview

Make the `Objective` struct self-referencing so objectives can contain child objectives to arbitrary depth. Currently the data model is fixed at Theme → Objective → KeyResult (3 levels). After this change, it becomes Theme → Objective(s) → ... → Objective(s) → KeyResult(s), where any objective can have both child objectives AND key results.

## Root Cause Analysis

The current code enforces a flat structure in several places:

1. **`Objective` struct** (`internal/access/models.go`): Has `KeyResults []KeyResult` but no `Objectives []Objective` field
2. **`ensureThemeIDs()`** (`internal/access/plan_access.go`): Flat iteration generating `THEME-XX.OKR-XX.KR-XX` — not recursive
3. **`PlanningManager` CRUD** (`internal/managers/planning_manager.go`): All objective/KR methods take `themeId` and navigate only one level deep
4. **`App` Wails bindings** (`main.go`): Duplicates the flat Objective struct and conversion logic
5. **`OKRView.svelte`**: Fixed 3-level accordion with separate `expandedThemes`/`expandedObjectives` sets
6. **`wails-mock.ts`**: Flat ID generation matching `THEME-XX.OKR-XX` pattern

## Architecture Decisions

- **Single recursive change**: Add `Objectives []Objective` field to the `Objective` struct — this is the core change that cascades everywhere
- **Backward compatible**: Existing themes.json without the `objectives` field on Objective will deserialize fine (Go/JSON zero-value = empty slice)
- **Identify by full ID**: All CRUD operations identify objectives by their full hierarchical ID and walk the tree to find them — no need for separate `themeId` + `objectiveId` params
- **Simplify API surface**: Replace `CreateObjective(themeId, title)` with `CreateObjective(parentId, title)` where parentId can be a theme ID or an objective ID
- **Keep existing ID scheme**: Extend `OKR-XX` segments for each nesting level (e.g., `THEME-01.OKR-01.OKR-01.KR-01`)
- **Recursive component**: Frontend uses a single recursive Svelte component for rendering objectives at any depth

## Technical Approach

### Data Model (internal/access/models.go)

Add `Objectives []Objective` to the Objective struct:

```go
type Objective struct {
    ID         string      `json:"id"`
    Title      string      `json:"title"`
    KeyResults []KeyResult `json:"keyResults"`
    Objectives []Objective `json:"objectives,omitempty"` // NEW
}
```

### ID Generation (internal/access/plan_access.go)

Make `ensureThemeIDs` recursive. For a child objective under `THEME-01.OKR-01`, its children get IDs like `THEME-01.OKR-01.OKR-01`, `THEME-01.OKR-01.OKR-02`, etc. Key results at any level follow the same `<parent>.KR-XX` pattern.

### Backend CRUD (internal/managers/planning_manager.go)

Simplify the API:
- `CreateObjective(parentId, title)` — parentId is theme ID or any objective ID; walk tree to find parent
- `UpdateObjective(objectiveId, title)` — find by ID anywhere in tree
- `DeleteObjective(objectiveId)` — find and remove from parent's list (cascading by structure)
- `CreateKeyResult(parentObjectiveId, description)` — unchanged concept, just needs tree walk
- `UpdateKeyResult(keyResultId, description)` — find by ID anywhere in tree
- `DeleteKeyResult(keyResultId)` — find and remove from parent's list

Add a recursive tree-walk helper: `findObjectiveParent(themes, targetId)` that returns the parent's objective slice for mutation.

### Wails Bindings (main.go)

Update the duplicate types and App methods to match the simplified signatures. The Wails Objective type gets the same `Objectives []Objective` field.

### Frontend (OKRView.svelte)

Replace the fixed 3-level accordion with a recursive `ObjectiveNode` component that renders:
- Objective title (with inline edit)
- Expand/collapse toggle
- Child objectives (recursive)
- Key results
- "Add child objective" / "Add key result" buttons

Use a single `expandedIds: Set<string>` instead of separate `expandedThemes`/`expandedObjectives`.

### Mock Bindings (wails-mock.ts)

Update mock CRUD to use tree-walk pattern matching the backend changes.

## Implementation Strategy

The changes cascade from model → access → manager → app → frontend. Each layer builds on the previous. Testing should happen at each layer before moving to the next.

## Task Breakdown Preview

- [ ] Task 1: Add `Objectives` field to data model and make ID generation recursive (models.go + plan_access.go)
- [ ] Task 2: Refactor PlanningManager CRUD to use recursive tree-walking (planning_manager.go)
- [ ] Task 3: Update Wails App bindings and type conversions (main.go)
- [ ] Task 4: Refactor OKRView.svelte to use recursive objective rendering
- [ ] Task 5: Update mock bindings for browser-mode testing (wails-mock.ts)
- [ ] Task 6: Update existing tests and add recursive nesting tests

## Dependencies

- None — self-contained change within existing stack
- No external dependencies or infrastructure changes

## Success Criteria (Technical)

- Can create objectives nested 3+ levels deep under a theme
- Can add key results at any level in the hierarchy
- Existing themes.json loads without migration
- All existing tests pass (plus new ones for nesting)
- OKR view renders and is interactive at all depths
- Calendar and EisenKan views unaffected

## Estimated Effort

- 6 tasks, sequential dependency chain
- Core risk: Frontend recursive rendering complexity
- Low data migration risk (additive struct change)

## Tasks Created

- [ ] #17 - Recursive data model and ID generation (parallel: false)
- [ ] #19 - Refactor PlanningManager CRUD for recursive tree-walking (parallel: false, depends on #17)
- [ ] #20 - Update Wails App bindings and type conversions (parallel: false, depends on #19)
- [ ] #18 - Refactor OKRView to use recursive objective rendering (parallel: false, depends on #20)
- [ ] #21 - Update mock bindings for browser-mode testing (parallel: true, depends on #20)
- [ ] #22 - Update and add tests for recursive OKR nesting (parallel: true, depends on #19)

Total tasks: 6
Parallel tasks: 2 (#21, #22)
Sequential tasks: 4 (#17 → #19 → #20 → #18)
Estimated total effort: 10.5 hours
