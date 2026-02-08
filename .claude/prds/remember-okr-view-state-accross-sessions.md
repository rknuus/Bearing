---
name: remember-okr-view-state-accross-sessions
description: Persist OKR tree expanded/collapsed node state across sessions and view navigation
status: backlog
created: 2026-02-08T09:59:11Z
---

# PRD: remember-okr-view-state-accross-sessions

## Executive Summary

When a user expands themes and objectives in the OKR tree view, that expansion state is lost when they navigate to another view or close the app. This forces users to repeatedly re-expand the same nodes every time they return to the OKR view. This PRD addresses persisting the expanded/collapsed node state so the OKR tree looks exactly as the user left it.

## Problem Statement

The OKR view's `expandedIds` (a `SvelteSet<string>` tracking which theme and objective nodes are expanded) is held entirely in component-local reactive state. It is not saved anywhere. This means:

- **Navigating away and back** (e.g., OKR → Calendar → OKR) resets all nodes to collapsed.
- **Closing and reopening the app** resets all nodes to collapsed.

Other view state like `showCompleted`, `showArchived`, `currentView`, and `currentItem` are already persisted via `NavigationContext` in `~/.bearing/data/navigation_context.json`. The expanded node state is the primary gap.

## User Stories

### US-1: Retain expanded nodes across view navigation
**As a** user working with OKRs,
**I want** my expanded themes and objectives to remain expanded when I navigate to another view and come back,
**So that** I don't have to re-expand my working context every time I switch views.

**Acceptance Criteria:**
- Expand several themes/objectives in OKR view
- Navigate to Calendar view, then back to OKR view
- All previously expanded nodes remain expanded

### US-2: Retain expanded nodes across app restarts
**As a** user,
**I want** the OKR tree to open with the same expanded/collapsed state as when I last closed the app,
**So that** I can pick up exactly where I left off.

**Acceptance Criteria:**
- Expand several themes/objectives in OKR view
- Close the app entirely
- Reopen the app and navigate to OKR view
- All previously expanded nodes remain expanded

### US-3: Newly created nodes follow sensible defaults
**As a** user,
**I want** a newly created theme or objective to appear expanded after creation,
**So that** I can immediately see and interact with its children.

**Acceptance Criteria:**
- Create a new theme → it appears expanded
- Create a new objective under a theme → it appears expanded
- These new expanded states are persisted like any other

## Requirements

### Functional Requirements

1. **Persist expanded node IDs**: Add an `expandedOkrIds` field (array of strings) to the `NavigationContext` struct and its frontend type.
2. **Save on change**: When the user expands or collapses a node, persist the updated set to `NavigationContext` (debounced or batched to avoid excessive writes).
3. **Restore on mount**: When OKRView mounts, read `expandedOkrIds` from the loaded navigation context and initialize `expandedIds` from it.
4. **Restore on view switch**: When navigating back to the OKR view within a session, the component should restore from the last saved state rather than resetting.
5. **Handle stale IDs gracefully**: If a persisted ID no longer exists (item was deleted), silently ignore it — do not error.
6. **Mock bindings support**: The browser-based testing variant (`wails-mock.ts`) must also support the new field so development on `localhost:5173` works correctly.

### Non-Functional Requirements

1. **Performance**: Saving expanded IDs should not block UI interactions. The set of IDs is small (tens at most), so serialization cost is negligible.
2. **Backwards compatibility**: An existing `navigation_context.json` without `expandedOkrIds` should be handled gracefully (default to empty array / all collapsed).

## Success Criteria

- Users retain their OKR tree expansion state across view switches and app restarts with zero configuration.
- No regressions in existing navigation context persistence.
- All linting, type checks, and tests pass.

## Constraints & Assumptions

- The number of expandable nodes is small enough that storing all expanded IDs as a flat string array is sufficient (no need for a tree diff or compression).
- The existing `NavigationContext` persistence mechanism (JSON file, save/load via Wails bindings) is adequate — no new persistence layer needed.

## Out of Scope

- Scroll position restoration (can be addressed separately).
- Persisting inline editing state or form visibility (these are transient by nature).
- Multi-device sync of view state.
- Undo/redo of expansion state changes.

## Dependencies

- Existing `NavigationContext` persistence pipeline: Go structs in `main.go`, `internal/access/models.go`, `internal/managers/planning_manager.go`; frontend types and save/load calls in `App.svelte`; mock bindings in `wails-mock.ts`.
- No external dependencies.

## Technical Notes

Key files to modify:
- **Go backend**: `NavigationContext` struct in `main.go`, `internal/access/models.go`, `internal/managers/planning_manager.go` — add `ExpandedOkrIds []string` field
- **Frontend types**: Update `NavigationContext` TypeScript type (likely in Wails-generated bindings or local type definitions)
- **OKRView.svelte**: Initialize `expandedIds` from loaded context; sync changes back via `$effect`
- **App.svelte**: Pass/expose `expandedOkrIds` through the navigation context flow
- **wails-mock.ts**: Update mock implementation to include the new field
