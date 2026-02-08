---
name: support-all-fields-when-creating-task
description: Extend CreateTask API and dialog to support Description, Tags, DueDate, PromotionDate, and custom DayDate at creation time
status: backlog
created: 2026-02-08T19:52:11Z
---

# PRD: support-all-fields-when-creating-task

## Executive Summary

Extend the task creation flow so users can set all editable fields (Description, Tags, DueDate, PromotionDate, and a custom DayDate) at creation time, instead of being forced to create a minimal task and then immediately edit it. The Eisenhower quadrant UI for batch entry is kept, with optional fields added to each task entry.

## Problem Statement

The `CreateTask` API only accepts 4 parameters (title, themeId, dayDate, priority). Fields like Description, Tags, DueDate, and PromotionDate can only be set after creation via EditTaskDialog. DayDate is hardcoded to today's date. This forces a two-step workflow: create a bare task, then immediately open the edit dialog to fill in details. The backend `UpdateTask` already supports all fields — the gap is in `CreateTask`.

## User Stories

### US-1: Set all fields when creating a task
**As a** user creating a new task on the EisenKan board,
**I want** to optionally fill in Description, Tags, DueDate, PromotionDate, and choose a custom DayDate,
**So that** I can create a fully specified task in one step without needing to edit it immediately after.

**Acceptance Criteria:**
- The CreateTaskDialog shows optional fields (Description, Tags, DueDate, PromotionDate) for each task entry in the quadrant UI
- DayDate defaults to today but can be changed
- All optional fields default to empty/unset
- The existing quick-entry flow (just title + drag to quadrant) still works — optional fields don't slow it down
- Created tasks have all specified fields persisted

### US-2: Backend accepts all fields at creation
**As a** developer,
**I want** the CreateTask API to accept all editable task fields,
**So that** the frontend can pass them through in a single call.

**Acceptance Criteria:**
- `CreateTask` Go method accepts Description, Tags, DueDate, and PromotionDate in addition to the existing 4 parameters
- The Wails binding in `main.go` is updated to match
- The mock bindings in `wails-mock.ts` are updated to match
- All fields are validated and persisted on creation

## Requirements

### Functional Requirements

1. **Extend CreateTask backend API**: Add Description, Tags, DueDate, PromotionDate parameters to `PlanningManager.CreateTask()` and the Wails binding in `main.go`
2. **Allow custom DayDate**: The frontend should allow the user to pick a date instead of hardcoding today
3. **Extend CreateTaskDialog UI**: Add optional collapsible/expandable fields for Description, Tags, DueDate, PromotionDate to each task entry in the quadrant view
4. **Update mock bindings**: Update `mockAppBindings.CreateTask()` in `wails-mock.ts` to accept and store the new fields

### Non-Functional Requirements

- Optional fields must not clutter the quick-entry UX — they should be hidden by default or minimally intrusive
- Existing tests must be updated for the new API signature
- No changes to EditTaskDialog needed — it already supports all fields

## Success Criteria

- Creating a task with all fields filled results in a persisted task file with all fields populated
- Creating a task with only title (leaving optional fields empty) still works as before
- All Go tests, frontend tests, lint, and type checks pass

## Constraints & Assumptions

- The Eisenhower quadrant drag-and-drop UI is kept — fields are added per task entry, not as a separate form
- ParentTaskID (subtask creation) is out of scope for this PRD

## Out of Scope

- Subtask creation (ParentTaskID)
- Changes to EditTaskDialog
- Changes to task file storage format (already supports all fields via JSON serialization)

## Dependencies

- None — the backend data layer already persists all Task fields via `SaveTask`
