---
name: refactor-task-creation-and-editing
description: Extract shared task form fields into a reusable component, add theme editing, and remove priority radio from Edit dialog
status: backlog
created: 2026-02-11T19:33:27Z
---

# PRD: refactor-task-creation-and-editing

## Executive Summary

Unify the task form fields used by CreateTaskDialog and EditTaskDialog into a shared `TaskFormFields` component. Add a theme selector to the Edit dialog (currently missing), and remove the priority radio group from Edit (priority is managed via drag-and-drop on the board). This eliminates duplicated form code and ensures both dialogs show consistent fields.

## Problem Statement

CreateTaskDialog and EditTaskDialog independently implement the same form fields (title, description, tags, due date, promotion date) with duplicated markup and CSS. The Edit dialog is missing a theme selector, so users cannot reassign a task to a different theme after creation. The Edit dialog also has a priority radio group that is redundant — priority in the Todo column is managed by drag-and-drop between Eisenhower sections, and in other columns priority is irrelevant.

## User Stories

### US-1: Change a task's theme after creation

**As a** user editing a task on the EisenKan board,
**I want** to change the task's theme via a dropdown in the Edit dialog,
**So that** I can reassign tasks to the correct theme without deleting and re-creating them.

**Acceptance Criteria:**
- The Edit dialog shows a theme selector dropdown populated with all available themes
- The current theme is pre-selected when the dialog opens
- Saving updates the task's themeId in the backend
- The board reflects the new theme color immediately after save

### US-2: Consistent form fields across Create and Edit

**As a** developer,
**I want** shared form fields extracted into a reusable component,
**So that** adding or changing a field only requires updating one place.

**Acceptance Criteria:**
- A new `TaskFormFields.svelte` component renders: title, theme selector, description, tags, due date, promotion date
- `CreateTaskDialog` uses `TaskFormFields` for its per-task entry form
- `EditTaskDialog` uses `TaskFormFields` for its edit form
- Both dialogs render identical fields with identical labels, placeholders, and styling
- The shared component accepts props for initial values, disabled state, and available themes

### US-3: Remove priority radio group from Edit dialog

**As a** user,
**I want** the Edit dialog to not show a priority selector,
**So that** I manage priority solely via drag-and-drop on the board (in the Todo column's Eisenhower sections).

**Acceptance Criteria:**
- The Edit dialog no longer shows a priority radio group
- Saving from the Edit dialog preserves the task's existing priority unchanged
- Priority is only changed by dragging tasks between Eisenhower sections on the board

## Requirements

### Functional Requirements

1. **Create `TaskFormFields.svelte`**: Extract shared fields (title, theme, description, tags, due date, promotion date) into a reusable component with bindable values and a `themes` prop
2. **Refactor `CreateTaskDialog`**: Replace inline form fields with `TaskFormFields`; keep the Eisenhower quadrant drag-and-drop UI for priority assignment
3. **Refactor `EditTaskDialog`**: Replace inline form fields with `TaskFormFields`; remove the priority radio group; add theme selector via the shared component
4. **Pass themes to EditTaskDialog**: The parent `EisenKanView` must pass the `themes` array to `EditTaskDialog` (currently only passed to `CreateTaskDialog`)
5. **Update `apiUpdateTask` flow**: Ensure the theme change from Edit is persisted via `UpdateTask`

### Non-Functional Requirements

- No visual regression — both dialogs should look the same as before (minus the removed priority radio)
- Shared CSS for form fields lives in the `TaskFormFields` component; dialog-level CSS (overlay, modal box, actions) stays in each dialog
- All existing tests must pass; update tests that assert on Edit dialog fields

## Success Criteria

- Both dialogs render the same set of fields: title, theme, description, tags, due date, promotion date
- Editing a task's theme persists correctly and reflects on the board
- The Edit dialog has no priority selector
- The `TaskFormFields` component is the single source of truth for task form fields
- `make frontend-lint` and `make frontend-check` pass
- All tests pass

## Constraints & Assumptions

- The Eisenhower quadrant drag-and-drop in CreateTaskDialog is unchanged — only the per-task entry form fields are extracted
- The `UpdateTask` backend API already supports updating `themeId`, so no backend changes are needed
- Dialog chrome (overlay, modal box, action buttons) remains in each dialog component — only form fields are shared

## Out of Scope

- Extracting a shared dialog wrapper component (overlay, modal, action buttons)
- Changes to the Eisenhower quadrant or board drag-and-drop behavior
- Backend API changes
- Subtask creation

## Dependencies

- None — all backend APIs already support the required operations
