---
name: integrate-parts-of-alternative-eisenkan-implementation
status: completed
created: 2026-02-08T14:51:02Z
completed: 2026-02-08T16:50:20Z
progress: 100%
prd: .pm/prds/integrate-parts-of-alternative-eisenkan-implementation.md
github: https://github.com/rknuus/Bearing/issues/81
---

# Epic: integrate-parts-of-alternative-eisenkan-implementation

## Overview

Integrate all EisenKan reference features (`tmp/eisenkan/`) into Bearing's existing multi-view architecture. This adds a rule engine, task editing, subtask hierarchy, priority promotion, dynamic board configuration, and optimistic drag-drop with svelte-dnd-action — while preserving Bearing's navigation, predefined data directory, and OKR/Calendar view interop.

## Architecture Decisions

- **New `internal/engines/rule_engine/` package** following iDesign layering: engines sit between managers and resource access, encapsulating pure business logic (WIP limits, transition validation, task age, promotion). This keeps PlanningManager as an orchestrator and avoids bloating it with rule evaluation code.
- **Extend existing Task model** rather than creating a new one: add description, tags, dueDate, promotionDate, parentTaskID, timestamps to the existing `access.Task` struct and file-based storage.
- **svelte-dnd-action** replaces HTML5 native drag-drop for touch/keyboard accessibility and smoother drag UX. The `MoveTasksResult` pattern from the reference provides authoritative backend state for rollback.
- **Board configuration served by backend** — column/section definitions move from hardcoded frontend constants to a `GetBoardConfiguration` API, making the board structure extensible without frontend changes.
- **No new storage backend** — keep file-based JSON + git versioning in `~/.bearing/data/`. Rules stored as a `rules.json` file alongside task data.
- **Wails bindings gap** — task APIs (GetTasks, CreateTask, etc.) are currently only available via mock bindings. All task and board config APIs must be exposed in `main.go`.

## Technical Approach

### Backend

**Extended Task Model (`internal/access/models.go`):**
- Add fields: `Description`, `Tags []string`, `DueDate`, `PromotionDate`, `ParentTaskID *string`, `CreatedAt`, `UpdatedAt`
- Add `SubtaskIDs` to query responses (computed, not stored)
- Add `CascadePolicy` type (NoAction, Archive, Delete, Promote)

**Rule Engine (`internal/engines/rule_engine/`):**
- `IRuleEngine` interface with `EvaluateTaskChange()` and `EvaluateBoardConfigurationChange()`
- Rule types: `max_wip_limit`, `allowed_transitions`, `max_age_days`, `required_fields`
- Context enrichment: gathers WIP counts, task history, hierarchy map from access layer
- Rules stored in `rules.json` with enable/disable, priority, conditions, actions

**PlanningManager Integration:**
- Wire rule engine into CreateTask, UpdateTask, MoveTask flows
- Add `ProcessPriorityPromotions()` — called on app startup and periodically
- Add `GetBoardConfiguration()` — returns column/section definitions
- Subtask cascade: parent auto-moves to "doing" when first child starts; parent completion cascades to children

**Wails Bindings (`main.go`):**
- Expose: GetTasks, CreateTask, UpdateTask, MoveTask, DeleteTask, GetBoardConfiguration, ProcessPriorityPromotions, ValidateTask

### Frontend

**svelte-dnd-action + Optimistic Rollback:**
- Install `svelte-dnd-action` package
- Replace HTML5 drag handlers with `use:dndzone` directive
- `onconsider` for preview, `onfinalize` for backend call
- `MoveTasksResult { success, taskPositions }` pattern: on failure, rollback to backend-provided positions
- `isValidating` / `isRollingBack` flags disable drag during transitions

**EditTaskDialog Component:**
- Modal with fields: title, description, priority (quadrant viz), tags, due date, promotion date
- Opens on task card click
- Save calls UpdateTask, cancel discards changes

**CreateTaskDialog with Eisenhower Quadrants:**
- 4-quadrant grid using svelte-dnd-action for drag-between-quadrants
- Staging area (Q4 / not-important-not-urgent) for new tasks before prioritization
- Batch creation: all prioritized tasks created sequentially on "Done"
- Tasks left in staging are discarded

**Dynamic Board Rendering:**
- Fetch column/section definitions from GetBoardConfiguration on mount
- Render columns and todo-column sections from config (not hardcoded)
- Subtask nesting: indent child tasks under parents, collapsible

**ErrorDialog Component:**
- Displays rule violations from failed moves/creates
- Shows violation category, message, and suggested action

### Mock Bindings & Testing

- Update `wails-mock.ts` with all new APIs (UpdateTask, GetBoardConfiguration, ProcessPriorityPromotions, ValidateTask)
- Extend mock task storage with new fields
- Mock MoveTasksResult pattern with configurable failure
- Unit tests for rule engine (Go), all dialog components (Vitest)
- Happy-path E2E coverage only; corner cases in unit tests
- Verify OKR/Calendar navigation and filtering still work

## Implementation Strategy

### Development Phases

**Phase 1 — Backend Foundation** (tasks 1-2): Extend data model, create rule engine, expose bindings. No frontend changes yet; existing UI continues to work.

**Phase 2 — Frontend Overhaul** (tasks 3-5): Replace drag-drop, add dialogs, render from config. Mock bindings updated in parallel.

**Phase 3 — Polish & Verification** (tasks 6-7): Update all tests, verify cross-view interop, ensure no regressions.

### Risk Mitigation

- **Backward compatibility**: New Task fields are optional with zero-value defaults; existing task JSON files load without migration.
- **Incremental frontend**: svelte-dnd-action can coexist with existing drag handlers during transition.
- **Rule engine opt-in**: Rules start with a permissive default ruleset; WIP limits and transitions are configurable, not hardcoded.

## Task Breakdown Preview

- [ ] #1: Extend Task model, storage layer, and Wails bindings — add new fields to `access.Task`, update `PlanAccess` read/write/move, expose all task + board config APIs in `main.go` (FR-07, FR-09, FR-10, FR-12)
- [ ] #2: Create Rule Engine package and integrate into PlanningManager — `internal/engines/rule_engine/` with WIP limits, transition validation, age rules; wire into Create/Update/MoveTask; add subtask hierarchy with cascade; add priority promotion (FR-01 through FR-06, FR-08, FR-11)
- [ ] #3: Replace drag-drop with svelte-dnd-action and optimistic rollback — install package, replace HTML5 handlers, implement MoveTasksResult pattern with rollback (FR-13, FR-14)
- [ ] #4: Create EditTaskDialog component — full task editing modal with priority quadrant visualization (FR-15)
- [ ] #5: Create Eisenhower quadrant CreateTaskDialog — 4-quadrant staging interface with batch creation and Q4 support (FR-16)
- [ ] #6: Dynamic board configuration rendering and subtask nesting UI — fetch and render columns/sections from backend config, subtask indentation, ErrorDialog for rule violations (FR-17, FR-18, FR-19)
- [ ] #7: Update mock bindings, tests, and verify cross-view interop — extend wails-mock.ts, add unit tests for rule engine and components, verify OKR/Calendar navigation and filtering (FR-20, NFR-04, NFR-05, NFR-06)

## Dependencies

- `svelte-dnd-action` npm package (new frontend dependency)
- Existing `internal/managers/planning_manager.go` — orchestration layer for rule engine integration
- Existing `internal/access/plan_access.go` — extended with new fields and query methods
- `tmp/eisenkan/` reference implementation — design source for all patterns
- Existing cross-view navigation in `App.svelte` — must remain functional throughout

## Success Criteria (Technical)

- All task CRUD operations validated through rule engine before persistence
- WIP limit violations rejected with descriptive error messages in < 10ms
- Drag-drop uses svelte-dnd-action with rollback on server rejection; works on touch and keyboard
- Priority promotion runs on startup and surfaces promoted tasks visually
- Subtask hierarchy enforced (max depth 2, no circular references, cascade on parent moves)
- `make frontend-lint`, `make frontend-check`, `make test` all pass
- OKR view theme navigation and Calendar date navigation continue to work with EisenKan filtering
- Mock bindings in `wails-mock.ts` cover all new APIs for browser-mode testing

## Tasks Created

- [ ] #85 - Extend Task model, storage layer, and Wails bindings (parallel: false)
- [ ] #87 - Create Rule Engine package and integrate into PlanningManager (parallel: false)
- [ ] #88 - Replace drag-drop with svelte-dnd-action and optimistic rollback (parallel: true)
- [ ] #82 - Create EditTaskDialog component (parallel: true)
- [ ] #83 - Create Eisenhower quadrant CreateTaskDialog (parallel: true)
- [ ] #84 - Dynamic board configuration rendering and subtask nesting UI (parallel: true)
- [ ] #86 - Update mock bindings, tests, and verify cross-view interop (parallel: false)

Total tasks: 7
Parallel tasks: 4 (#88, #82, #83, #84 — after backend tasks complete)
Sequential tasks: 3 (#85 → #87 → ... → #86)

## Estimated Effort

- **7 tasks** across 3 phases
- **Critical path**: #85 (model extension) → #87 (rule engine) → #88, #82, #83, #84 (frontend, parallelizable) → #86 (tests/verification)
- Tasks #88, #82, #83, #84 can be worked in parallel once backend is ready
