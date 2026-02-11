---
name: refactor-task-creation-and-editing
status: backlog
created: 2026-02-11T19:36:56Z
progress: 0%
prd: .pm/prds/refactor-task-creation-and-editing.md
github: https://github.com/rknuus/Bearing/issues/97
---

# Epic: refactor-task-creation-and-editing

## Overview

Extract the duplicated task form fields from CreateTaskDialog and EditTaskDialog into a shared `TaskFormFields.svelte` component. Add a theme selector to EditTaskDialog (currently missing), remove its priority radio group, and pass `themes` from EisenKanView to EditTaskDialog.

No backend changes needed — `UpdateTask` already handles `themeId` updates.

## Architecture Decisions

- **Shared component, not shared dialog**: Only form fields are extracted into `TaskFormFields.svelte`. Dialog chrome (overlay, modal, action buttons) stays in each dialog since they have different structures (Create has Eisenhower grid, Edit is a simple form).
- **Bindable props pattern**: `TaskFormFields` uses `$bindable()` props for field values so parent components can read/write them directly, matching existing Svelte 5 patterns in the codebase.
- **Tags as string in form, array in Task**: The shared component works with comma-separated string (matching current UX). Conversion to `string[]` happens in the dialog's save handler, as it does today.

## Technical Approach

### Shared Component: `TaskFormFields.svelte`

New component at `frontend/src/components/TaskFormFields.svelte` rendering:
- Title (text input, required)
- Theme (select dropdown from `themes` prop)
- Description (textarea)
- Tags (text input, comma-separated)
- Due Date (date input)
- Promotion Date (date input)

Props: `title`, `themeId`, `description`, `tags`, `dueDate`, `promotionDate` (all `$bindable()`), `themes: LifeTheme[]`, `disabled: boolean`.

CSS for `.form-group`, `.form-row`, and input styles moves into this component.

### CreateTaskDialog Changes

- Replace inline form fields (lines 172–235) with `<TaskFormFields>` binding to existing state variables
- Remove duplicated form CSS (`.form-group`, input styles)
- Keep: Eisenhower grid, quadrant drag-and-drop, staging logic, dialog chrome

### EditTaskDialog Changes

- Replace inline form fields (lines 104–168) with `<TaskFormFields>` binding to edit state variables
- Remove priority radio group entirely — `handleSave` preserves `task.priority` unchanged
- Add `themes` prop to component interface
- Remove duplicated form CSS

### EisenKanView Changes

- Pass `themes` to `<EditTaskDialog>` (currently only passed to CreateTaskDialog)

## Task Breakdown Preview

- [ ] Task 1: Create `TaskFormFields.svelte` shared component with all 6 fields, bindable props, and form CSS
- [ ] Task 2: Refactor `CreateTaskDialog` to use `TaskFormFields`, remove duplicated form markup and CSS
- [ ] Task 3: Refactor `EditTaskDialog` to use `TaskFormFields`, remove priority radio group, add `themes` prop
- [ ] Task 4: Update `EisenKanView` to pass `themes` to `EditTaskDialog`
- [ ] Task 5: Update tests for both dialogs and add tests for `TaskFormFields`

## Dependencies

- None — all backend APIs already support the required operations

## Success Criteria (Technical)

- Both dialogs render identical form fields via the shared component
- EditTaskDialog allows changing theme; change persists after save
- EditTaskDialog has no priority selector; save preserves existing priority
- `make frontend-lint` and `make frontend-check` pass
- All existing tests pass (with updates for changed component structure)
- No visual regression in either dialog (minus removed priority radio)

## Estimated Effort

- 4 tasks, purely frontend refactoring
- No backend changes, no new APIs
- Critical path: Task 1 (shared component) → Tasks 2, 3 (parallel) → Task 4 (verify)

## Tasks Created

- [ ] #98 - Create TaskFormFields shared component (parallel: false)
- [ ] #99 - Refactor CreateTaskDialog to use TaskFormFields (parallel: true)
- [ ] #100 - Refactor EditTaskDialog to use TaskFormFields, add theme, remove priority (parallel: true)
- [ ] #101 - Lint, type-check, and verify all tests pass (parallel: false)

Total tasks: 4
Parallel tasks: 2 (#99, #100)
Sequential tasks: 2 (#98, #101)
