---
name: support-all-fields-when-creating-task
status: backlog
created: 2026-02-08T19:54:30Z
progress: 0%
prd: .pm/prds/support-all-fields-when-creating-task.md
github: https://github.com/rknuus/Bearing/issues/93
---

# Epic: support-all-fields-when-creating-task

## Overview

Extend the `CreateTask` API from 4 parameters (title, themeId, dayDate, priority) to also accept description, tags, dueDate, and promotionDate. Update the CreateTaskDialog to let users optionally fill in these fields per task entry while keeping the Eisenhower quadrant drag-and-drop workflow.

## Architecture Decisions

- **Use a struct parameter instead of many positional strings**: The Go `CreateTask` method currently takes 4 strings. Adding 4 more positional strings is unwieldy. Instead, change the API to accept a `CreateTaskRequest` struct (or add the optional fields to the existing `Task` struct passed through). However, Wails v2 bindings work best with simple parameters. **Decision**: Keep positional parameters but add the new optional fields. Wails serializes them fine and this is consistent with the existing pattern. Alternatively, if there are too many params, use a single JSON object. Need to check Wails v2 struct binding support.
- **Extend PendingTask interface**: Add optional fields (description, tags, dueDate, promotionDate) to the `PendingTask` interface in `EisenhowerQuadrant.svelte` so task entries can carry this data through the quadrant UI.
- **Collapsible detail section per task**: Each task entry in a quadrant gets an expand/collapse toggle to show optional fields, keeping the quick-entry flow uncluttered.

## Technical Approach

### Backend Changes

1. **`internal/managers/planning_manager.go`**: Extend `CreateTask` signature to accept description, tags (as comma-separated string or slice), dueDate, promotionDate. Set these on the Task struct before saving.
2. **`main.go`**: Update the `App.CreateTask` Wails binding to pass through the new parameters.
3. **Validation**: DueDate and PromotionDate should be validated as valid date strings (YYYY-MM-DD) if non-empty. Tags can be a string slice. Description is freeform.

### Frontend Changes

4. **`frontend/src/lib/wails-mock.ts`**: Update `CreateTask` mock to accept and store the new fields.
5. **`frontend/src/components/EisenhowerQuadrant.svelte`**: Extend `PendingTask` interface with optional description, tags, dueDate, promotionDate fields.
6. **`frontend/src/components/CreateTaskDialog.svelte`**:
   - Add a DayDate picker (replacing the hardcoded `today`)
   - Add per-task expandable detail section with Description, Tags, DueDate, PromotionDate inputs
   - Update the `createTask` prop type to include new parameters
   - Pass all fields through when calling `createTask`
7. **`frontend/src/views/EisenKanView.svelte`**: Update `apiCreateTask` call to pass through new fields.

### Tests

8. Update Go tests for `CreateTask` in `planning_manager_test.go`
9. Update frontend tests for CreateTaskDialog and EisenKanView

## Tasks Created
- [ ] #94 - Extend CreateTask backend API and Wails binding with new parameters (parallel: true)
- [ ] #95 - Update frontend mock bindings, types, and EisenKanView callsite (depends on #94)
- [ ] #96 - Add optional fields UI to CreateTaskDialog (depends on #95)

Total tasks: 3
Sequential: all 3 (#94 → #95 → #96)

## Dependencies

None — all infrastructure (SaveTask, data model) already supports these fields.

## Success Criteria (Technical)

- `make test` passes (all Go tests)
- `make test-frontend` passes (all frontend tests)
- `make frontend-lint` and `make frontend-check` pass with 0 errors, 0 warnings
- Creating a task with description and tags via the dialog persists all fields to disk

## Estimated Effort

Small-medium — 3 tasks. Backend API change is straightforward, UI work is the bulk (adding fields to the quadrant entries without cluttering the UX).
