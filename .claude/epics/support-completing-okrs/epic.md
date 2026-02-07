---
name: support-completing-okrs
status: backlog
created: 2026-02-07T19:59:11Z
progress: 0%
prd: .claude/prds/support-completing-okrs.md
github: https://github.com/rknuus/Bearing/issues/57
---

# Epic: support-completing-okrs

## Overview

Add a `Status` field to Objective and KeyResult models enabling a completion lifecycle: `active` → `completed` → `archived`. The backend enforces that parent Objectives cannot be completed until all children are complete. The frontend renders completed items as dimmed/struck-through, provides complete/reopen/archive action buttons, and offers view-level toggles to hide completed and archived items.

## Architecture Decisions

- **Status as a string field with zero-value default**: Use `Status string` with `json:"status,omitempty"` on both `Objective` and `KeyResult`. Empty string means `active`, ensuring backward compatibility with existing data — no migration needed.
- **Unified status transition API**: Rather than 6 separate methods (CompleteObjective, CompleteKeyResult, ReopenObjective, etc.), use 2 generic methods: `SetObjectiveStatus(id, status)` and `SetKeyResultStatus(id, status)` with validation inside. This halves the API surface. Valid transitions: `""/"active" → "completed"`, `"completed" → "archived"`, `"completed"/"archived" → "active"` (reopen), and blocking `"active" → "archived"`.
- **No status on Life Themes**: Themes remain containers without lifecycle status.
- **Toggle persistence via NavigationContext**: Store `showCompleted` and `showArchived` booleans in the existing `NavigationContext` struct to persist view toggles across sessions without adding new storage mechanisms.

## Technical Approach

### Data Model Changes (`internal/access/models.go`)
- Add `Status string` field to `Objective` and `KeyResult` structs with `json:"status,omitempty"`
- Add `OKRStatus` type with constants: `OKRStatusActive`, `OKRStatusCompleted`, `OKRStatusArchived`
- Add validation helper `IsValidOKRStatus()`

### Backend (`internal/managers/planning_manager.go`, `main.go`)
- Add `SetObjectiveStatus(objectiveId, status string) error`:
  - Validates status transition
  - For `"completed"`: walks children to verify all are completed/archived, returns error listing incomplete items if any
  - For `"archived"`: verifies current status is `"completed"`
  - For `"active"` (reopen): always allowed from completed/archived
- Add `SetKeyResultStatus(keyResultId, status string) error`:
  - Same transition rules minus the children check
- Add Wails binding wrappers in `main.go` and update `convertObjective`/`convertObjectiveToAccess` to include `Status` field
- Add `ShowCompleted` and `ShowArchived` fields to `NavigationContext` in both access and managers layers

### Frontend (`OKRView.svelte`, `wails-mock.ts`)
- Add `status?: string` to TypeScript `Objective` and `KeyResult` interfaces
- Add action buttons per item based on status: "Complete" (active→completed), "Reopen" (completed→active, archived→active), "Archive" (completed→archived)
- Add CSS classes for completed items: `opacity: 0.5`, `text-decoration: line-through`
- Add header toggles: "Show completed" and "Show archived" checkboxes
- Filter rendering based on toggle state: hide completed items when toggle off, hide archived items when toggle off
- Persist toggles by saving to NavigationContext on change
- Update mock bindings with `SetObjectiveStatus` and `SetKeyResultStatus` implementations plus NavigationContext fields

### Wails Binding Types (`main.go`)
- Add `Status` field to `Objective` and `KeyResult` Wails binding structs
- Update `convertObjective` and `convertObjectiveToAccess` to pass `Status` through

## Implementation Strategy

1. **Model + Backend first**: Add Status field and business logic with tests — this is the foundation
2. **Wails bindings**: Expose to frontend and update type converters
3. **Frontend + Mock**: Add UI controls, styling, filtering, and mock bindings together
4. **Navigation context**: Extend with toggle persistence

## Task Breakdown Preview

- [ ] Task 1: Add Status field to data models and OKR status constants
- [ ] Task 2: Implement SetObjectiveStatus and SetKeyResultStatus in PlanningManager with validation logic and tests
- [ ] Task 3: Add Wails binding methods and update type converters in main.go
- [ ] Task 4: Extend NavigationContext with ShowCompleted/ShowArchived fields across all layers
- [ ] Task 5: Update frontend TypeScript interfaces, mock bindings, and add SetObjectiveStatus/SetKeyResultStatus mock implementations
- [ ] Task 6: Add complete/reopen/archive action buttons and completed/archived visual styling to OKRView
- [ ] Task 7: Add view-level show/hide toggles for completed and archived items with NavigationContext persistence

## Dependencies

- **set-start-and-target-of-kr-at-creation** epic must be merged first (modifies KR model and creation flow)
- Existing progress tracking fields (`startValue`, `currentValue`, `targetValue`) are unaffected

## Success Criteria (Technical)

- All status transitions validated in backend with test coverage
- Parent Objective completion blocked when children are active, with descriptive error
- Existing data without status field loads correctly as active (zero-value backward compat)
- Completed items render dimmed/struck-through in OKR view
- Archived items hidden by default, shown via toggle
- Toggle states persist across app restarts
- All three dev environments work: native app, Wails dev, Vite mock
- Linters and all tests pass

## Estimated Effort

- **7 tasks**, small-to-medium scope each
- Tasks 1-4 (backend): ~60% of effort
- Tasks 5-7 (frontend): ~40% of effort
- Critical path: Task 1 → Task 2 → Task 3 → Tasks 5-7 (Task 4 can parallel Task 2)

## Tasks Created
- [ ] #58 - Add Status field to data models and OKR status constants (parallel: false)
- [ ] #60 - Implement SetObjectiveStatus and SetKeyResultStatus in PlanningManager (parallel: false, depends: #58)
- [ ] #62 - Add Wails binding methods and update type converters (parallel: false, depends: #60)
- [ ] #64 - Extend NavigationContext with ShowCompleted/ShowArchived fields (parallel: true)
- [ ] #59 - Update frontend TypeScript interfaces and mock bindings (parallel: false, depends: #62)
- [ ] #61 - Add complete/reopen/archive action buttons and visual styling (parallel: false, depends: #59)
- [ ] #63 - Add view-level show/hide toggles with NavigationContext persistence (parallel: false, depends: #64, #61)

Total tasks: 7
Parallel tasks: 1 (#64)
Sequential tasks: 6
Critical path: #58 → #60 → #62 → #59 → #61 → #63
