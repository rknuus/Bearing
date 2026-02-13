---
name: fixup-eisenkan-drag-failure
status: backlog
created: 2026-02-13T10:13:33Z
progress: 0%
prd: .pm/prds/fixup-eisenkan-drag-failure.md
github: [Will be updated when synced to GitHub]
---

# Epic: fixup-eisenkan-drag-failure

## Overview

Fix two bugs in the EisenKan board: (1) drag-and-drop crashes with a `TypeError` due to `svelte-dnd-action` item/DOM mismatch in sectioned columns, and (2) `ProcessPriorityPromotions` fails on startup. The core fix restructures how per-section drop zones track their items.

## Architecture Decisions

- **Per-section item tracking**: Introduce section-keyed item state (e.g., `sectionItems[sectionName]`) alongside the existing `columnItems` so each section's `dndzone` receives exactly the items it renders. This follows the proven pattern from `EisenhowerQuadrant.svelte`.
- **Priority changes via UpdateTask**: When a task is dragged between priority sections within the Todo column, use the existing `UpdateTask` API (which already supports updating `task.priority`) rather than extending `MoveTask`. This avoids backend changes.
- **Status changes remain via MoveTask**: Cross-column drags continue to use `MoveTask` with the existing optimistic rollback pattern.

## Technical Approach

### Root Cause: Sectioned Column Item Mismatch

In `EisenKanView.svelte` lines 442-444, each priority section creates a `dndzone` with `items: columnItems[column.name]` (all column tasks), but only renders `sectionTasks` (filtered by priority). `svelte-dnd-action` expects the items array to exactly match rendered children, causing a `parentElement` crash when it references DOM nodes that don't exist in the zone.

**Fix**: Each section's `dndzone` must receive its own filtered items array. The `$effect` that populates `columnItems` needs to also produce per-section arrays. The `handleDndConsider` and `handleDndFinalize` handlers need section-aware variants that:
1. Update the correct section's items during drag preview
2. Detect whether a finalized drop is a **priority change** (within-column section move) or a **status change** (cross-column move)
3. Call `UpdateTask` for priority changes, `MoveTask` for status changes

### ProcessPriorityPromotions Startup Error

The mock binding exists and works correctly. The error likely comes from the native/Wails environment where `ProcessPriorityPromotions` may be called before the planning manager is fully initialized. Need to investigate the Go backend initialization order in `main.go` and ensure the manager is ready before the frontend calls the API.

## Implementation Strategy

1. Fix the core dndzone item mismatch (resolves the crash)
2. Add section-aware drag handlers (enables within-column priority moves)
3. Fix the promotions startup error
4. Add test coverage for new drag paths
5. Validate across all three dev environments

## Task Breakdown Preview

- [ ] Task 1: Fix sectioned dndzone item arrays and section-aware drag handlers
- [ ] Task 2: Fix ProcessPriorityPromotions startup error
- [ ] Task 3: Add drag-and-drop test coverage
- [ ] Task 4: Lint, type-check, and validate existing tests pass

## Dependencies

- `svelte-dnd-action` (v0.9.69) — must work with multiple zones sharing items across a column
- Existing `UpdateTask` API — already supports priority field updates
- Existing `MoveTask` API — unchanged, handles status transitions
- Mock bindings in `wails-mock.ts` — may need updates to support section-level mock calls

## Success Criteria (Technical)

- No `TypeError` when dragging tasks between any combination of columns/sections
- Priority updates persist when dragging between Q1/Q2/Q3 sections
- `ProcessPriorityPromotions` completes without error on board mount
- All existing EisenKan unit tests pass (`EisenKanView.test.ts`)
- All existing E2E tests pass (`view-workflows.test.js`)
- `make frontend-lint` and `make frontend-check` pass
- New tests cover cross-column drag and cross-section drag scenarios

## Estimated Effort

- 4 tasks, small-to-medium scope
- Primary risk: `svelte-dnd-action` behavior with multiple zones sharing an underlying data source — may need careful state reconciliation

## Tasks Created
- [ ] 001.md - Fix sectioned dndzone item arrays and section-aware drag handlers (parallel: true)
- [ ] 002.md - Fix ProcessPriorityPromotions startup error (parallel: true)
- [ ] 003.md - Add drag-and-drop test coverage (parallel: false, depends on 001)
- [ ] 004.md - Lint, type-check, and validate all tests pass (parallel: false, depends on 001-003)

Total tasks: 4
Parallel tasks: 2 (001, 002)
Sequential tasks: 2 (003, 004)

