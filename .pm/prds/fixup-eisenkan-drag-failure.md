---
name: fixup-eisenkan-drag-failure
description: Fix EisenKan drag-and-drop crash and priority promotions startup error
status: backlog
created: 2026-02-13T10:08:45Z
---

# PRD: fixup-eisenkan-drag-failure

## Executive Summary

The EisenKan board's drag-and-drop functionality crashes when dragging tasks between columns, making task status transitions via drag unusable. A secondary startup error prevents priority promotions from processing. Both issues need to be resolved to restore full EisenKan functionality.

## Problem Statement

### Drag-and-Drop Crash
When a user drags a task card to a different column, a `TypeError: undefined is not an object (evaluating 'originalDragTarget.parentElement')` is thrown from `svelte-dnd-action`'s `keepOriginalElementInDom` function. This makes the drag-and-drop feature completely broken — it fails 100% of the time.

**Root Cause**: The sectioned Todo column creates a separate `dndzone` per Eisenhower priority section (Q1, Q2, Q3) but incorrectly passes the entire column's items (`columnItems[column.name]`) to each zone instead of only the section-specific items. `svelte-dnd-action` expects the items array to exactly match the children rendered in the zone. The mismatch causes the library to reference DOM elements that don't exist within the zone, leading to the `parentElement` crash.

Relevant code: `EisenKanView.svelte` lines 442-444 — `use:dndzone={{ items: columnItems[column.name] ?? [], ... }}` is used inside each section's `{#each}` loop that only renders `sectionTasks`.

### Priority Promotions Startup Error
The `ProcessPriorityPromotions` API call in `onMount` fails with `[EisenKan] Failed to process priority promotions`. While non-blocking (the view still loads), this prevents automatic priority escalation from functioning.

## User Stories

### US-1: Drag task between columns
**As a** user viewing the EisenKan board
**I want to** drag a task from one column to another (e.g., Todo → Doing)
**So that** I can quickly change a task's status without opening the edit dialog

**Acceptance Criteria:**
- Dragging a task card from Todo to Doing updates its status
- Dragging a task card from Doing to Done updates its status
- The optimistic update shows immediately, with rollback on server rejection
- Rule violations (e.g., WIP limits) show the error dialog and revert the move
- No JavaScript errors occur during drag operations

### US-2: Drag task between priority sections
**As a** user viewing the EisenKan Todo column
**I want to** drag a task between Eisenhower priority sections (Q1, Q2, Q3)
**So that** I can reprioritize tasks visually within the board

**Acceptance Criteria:**
- Each priority section (Q1, Q2, Q3) is an independent drop zone
- Dragging a task from Q1 to Q2 updates its priority
- Items in each section's dndzone match the rendered children exactly
- The backend is called to persist the priority change

### US-3: Priority promotions on startup
**As a** user opening the EisenKan board
**I want** overdue tasks to be automatically promoted in priority
**So that** urgent items surface without manual intervention

**Acceptance Criteria:**
- `ProcessPriorityPromotions` executes successfully on board mount
- Tasks promoted are reflected in the refreshed task list
- Errors are handled gracefully without blocking the board

## Requirements

### Functional Requirements

#### FR-1: Fix dndzone item arrays in sectioned columns
- Each priority section's `dndzone` must receive only the items for that section, not the entire column
- The `consider` and `finalize` handlers must be updated to work with section-level item arrays
- When a task is dropped into a section, its priority should be updated to match the target section

#### FR-2: Fix cross-column drag for sectioned columns
- Dragging from a section zone to a regular column zone (and vice versa) must work correctly
- The `handleDndFinalize` handler must detect both status changes (column moves) and priority changes (section moves)
- The `MoveTask` backend API must be called for status changes; a priority update mechanism is needed for section moves

#### FR-3: Fix priority promotions startup error
- Investigate why `ProcessPriorityPromotions` fails and fix the root cause
- Ensure the API works in both native (Wails) and browser (mock) environments

### Non-Functional Requirements

- No regressions to existing EisenKan test suite
- No `$effect` infinite loops (follow existing `untrack()` patterns)
- Drag-and-drop remains responsive (< 200ms visual feedback via `flipDurationMs`)

## Success Criteria

- Dragging tasks between all columns works without JavaScript errors
- Dragging tasks between priority sections in the Todo column works
- `ProcessPriorityPromotions` completes without error on board startup
- All existing EisenKan unit and E2E tests pass
- New tests cover the fixed drag scenarios

## Constraints & Assumptions

- Must use `svelte-dnd-action` (v0.9.69) — no library switch
- Must maintain the optimistic update + rollback pattern
- The backend `MoveTask` API handles status transitions; section-level priority changes may need a separate or extended API call
- The three dev environments (native, Wails dev, Vite mock) must all work

## Out of Scope

- Redesigning the Kanban board layout or column structure
- Adding new columns or changing Eisenhower priority categories
- Touch/mobile drag-and-drop improvements
- Drag-and-drop for subtask reordering or reparenting

## Dependencies

- `svelte-dnd-action` library behavior for multi-zone setups
- Backend `MoveTask` API for status transitions
- Backend `UpdateTask` or similar API for priority changes within the Todo column
- Backend `ProcessPriorityPromotions` API correctness
