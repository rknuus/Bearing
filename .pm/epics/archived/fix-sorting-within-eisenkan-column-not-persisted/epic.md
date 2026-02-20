---
name: fix-sorting-within-eisenkan-column-not-persisted
status: completed
created: 2026-02-20T15:44:04Z
completed: 2026-02-20T16:18:54Z
progress: 100%
prd: .pm/prds/fix-sorting-within-eisenkan-column-not-persisted.md
github: Will be updated when synced to GitHub
architect: off
---

# Epic: Fix Sorting Within EisenKan Column Not Persisted

## Overview

Restore persisted task ordering within EisenKan columns by adding a `task_order.json` file to the data store, a `ReorderTasks` backend API, and updating the frontend to use backend-authoritative ordering instead of client-side sorting.

## Architecture Decisions

- **Separate order file, not per-task fields**: Task ordering spans tasks from multiple theme directories displayed in a single column. A central `task_order.json` (dropZoneId → ordered taskIds) is the only viable approach without restructuring storage. No task file content is ever modified for ordering.
- **Backend authoritative**: The frontend proposes position changes; the backend persists and returns the definitive order. The frontend reconciles with the backend response. This matches the standalone eisenkan's `MoveTasks` pattern.
- **Self-healing ordering**: Tasks on disk but absent from `task_order.json` are appended to the end of their drop zone. Stale entries (deleted tasks) are silently filtered. If `task_order.json` doesn't exist, tasks are ordered by `CreatedAt`.
- **Drop zone IDs**: Priority labels for Todo sections (`important-urgent`, etc.), column names for others (`doing`, `done`). Matches the existing convention in `BoardConfiguration.SectionDefinition.Name` and `ColumnDefinition.Name`.

## Technical Approach

### Layer-by-Layer Changes

#### Access Layer (`internal/access/`)

**New file**: No new files — add methods to `PlanAccess`.

**New methods on `IPlanAccess`**:
- `LoadTaskOrder() (map[string][]string, error)` — Reads `task_order.json`. Returns empty map if file doesn't exist.
- `SaveTaskOrder(order map[string][]string) error` — Writes `task_order.json` and git-commits.

**Modified methods**: None. `SaveTask`, `MoveTask`, `DeleteTask` remain unchanged — the manager layer coordinates order updates.

#### Manager Layer (`internal/managers/`)

**New method on `IPlanningManager`**:
- `ReorderTasks(positions map[string][]string) (*ReorderResult, error)` — Validates task IDs exist, merges proposed positions into the full order map, persists, returns authoritative positions for all drop zones.

**New type**:
- `ReorderResult { Success bool; Positions map[string][]string }` — Authoritative positions response.

**Modified methods**:
- `GetTasks()` — After loading tasks, load `task_order.json` and sort tasks within each status group by their position in the order map. Tasks not in the order map go at the end (sorted by `CreatedAt`).
- `MoveTask()` — After a successful cross-column move, update `task_order.json`: remove task from source drop zone, append to target drop zone. Return authoritative positions in `MoveTaskResult`.
- `CreateTask()` — After saving, append the new task ID to its drop zone in `task_order.json`.
- `DeleteTask()` — After deleting, remove the task ID from `task_order.json`.

**Modified type**:
- `MoveTaskResult` — Add `Positions map[string][]string` field for authoritative positions.

#### Wails Bindings (`main.go`)

**New binding**:
- `ReorderTasks(positions map[string][]string) (*ReorderResult, error)` — Delegates to `PlanningManager.ReorderTasks`.

**Modified bindings**:
- `MoveTask()` return type — Include `Positions` field from updated `MoveTaskResult`.

#### Frontend (`frontend/src/`)

**`EisenKanView.svelte`**:
- Remove the auto-sort by priority in the `$effect` block (lines 145-159). The backend now returns tasks in the correct order.
- Replace the early `return` on same-column reorder (line 329) with a `ReorderTasks` call.
- Replace the early `return` on same-section reorder in `handleSectionDndFinalize` with a `ReorderTasks` call.
- After `MoveTask` calls, use returned `positions` to update display order.
- Optimistic UI: apply drag result immediately, reconcile with backend response on callback.

**`wails-mock.ts`**:
- Add `taskPositions: Record<string, string[]>` state (like standalone's `MockBackend`).
- Implement `ReorderTasks(positions)` — detect moves, validate, update positions, return authoritative result.
- Update `MoveTask` mock to maintain `taskPositions`.
- Update `GetTasks` mock to return tasks in `taskPositions` order.
- Update `CreateTask`/`DeleteTask` mocks to maintain `taskPositions`.

## Implementation Strategy

### Task Ordering (bottom-up)

1. **Access layer**: Add `LoadTaskOrder`/`SaveTaskOrder` to `IPlanAccess` and `PlanAccess`.
2. **Manager layer**: Add `ReorderTasks`, modify `GetTasks`/`MoveTask`/`CreateTask`/`DeleteTask` to maintain order.
3. **Wails bindings**: Add `ReorderTasks` binding, update `MoveTask` return type.
4. **Frontend mock**: Update `wails-mock.ts` with ordering state and `ReorderTasks`.
5. **Frontend view**: Update `EisenKanView.svelte` to use backend ordering and call `ReorderTasks`.
6. **Tests**: Add tests at each layer.

### Risk Mitigation

- **Backward compatibility**: If `task_order.json` is missing, `GetTasks` falls back to `CreatedAt` ordering. First mutation creates the file.
- **Data corruption**: `task_order.json` is self-healing — stale IDs are filtered, missing tasks appended. A corrupted file can be deleted and the system recovers.

## Task Breakdown Preview

- [ ] Task 1: Access layer — `LoadTaskOrder`/`SaveTaskOrder` + tests
- [ ] Task 2: Manager layer — `ReorderTasks` + modify `GetTasks`/`MoveTask`/`CreateTask`/`DeleteTask` for order maintenance + tests
- [ ] Task 3: Wails bindings — `ReorderTasks` binding + update `MoveTask` return type
- [ ] Task 4: Frontend — Update `wails-mock.ts` with ordering, update `EisenKanView.svelte` to use backend ordering + call `ReorderTasks` + tests

## Dependencies

- No external dependencies. All changes are internal.
- Task 1 → Task 2 → Task 3 → Task 4 (sequential, each layer builds on the previous).
- Wails binding generation needed after Task 3.

## Success Criteria (Technical)

- `task_order.json` is created/updated on first reorder, move, create, or delete
- `GetTasks()` returns tasks sorted by persisted order
- `ReorderTasks` persists and returns authoritative positions
- `MoveTask` returns authoritative positions alongside rule violations
- Frontend reconciles with backend-authoritative positions
- All existing tests pass; new tests cover order persistence, self-healing, and backward compatibility
- Linting and type checking pass

## Estimated Effort

- 4 tasks, medium complexity
- Access layer: S (new file I/O methods)
- Manager layer: M (multiple method changes + new method + tests)
- Wails bindings: XS (thin delegation)
- Frontend: M (mock state + view changes + tests)

## Tasks Created
- [ ] 2.md - Access layer — LoadTaskOrder/SaveTaskOrder (parallel: false)
- [ ] 3.md - Manager layer — ReorderTasks + order maintenance in GetTasks/MoveTask/CreateTask/DeleteTask (parallel: false)
- [ ] 4.md - Wails bindings — ReorderTasks binding + update MoveTask return type (parallel: false)
- [ ] 5.md - Frontend — wails-mock.ts ordering + EisenKanView.svelte backend-authoritative ordering (parallel: false)

Total tasks: 4
Parallel tasks: 0
Sequential tasks: 4
Estimated total effort: S + M + XS + M
