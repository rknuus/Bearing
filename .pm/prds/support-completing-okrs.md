---
name: support-completing-okrs
description: Allow users to complete, reopen, and archive Objectives and Key Results
status: backlog
created: 2026-02-07T19:52:47Z
---

# PRD: support-completing-okrs

## Executive Summary

Add the ability to mark Objectives and Key Results as complete in Bearing's OKR system. Currently, OKRs persist indefinitely with no way to signal that a goal has been achieved. This feature introduces a completion lifecycle: active → completed (dimmed in place) → archived (hidden). Both Objectives and KRs can be completed independently, with the constraint that a parent Objective cannot be completed until all its children are done. Completed items can be reopened.

## Problem Statement

Bearing users track long-term goals through hierarchical OKRs with progress measurement, but there is no way to mark an OKR as "done." This creates several problems:

- **Clutter**: The OKR view accumulates achieved goals that are no longer actionable, making it harder to focus on active work.
- **No sense of closure**: Users cannot distinguish between goals they've achieved and goals still in progress.
- **No lifecycle**: Goals have a natural lifecycle (set → pursue → achieve → reflect), but Bearing only supports the first two stages.

## User Stories

### US-1: Complete a Key Result
**As a** user who has achieved a Key Result,
**I want to** mark it as complete,
**So that** I can see it's done and focus on remaining active KRs.

**Acceptance Criteria:**
- A "complete" action is available on each active Key Result
- Completion is manual and independent of progress values (a KR at 7/10 can be completed; a KR at 10/10 is not auto-completed)
- Completed KRs appear dimmed/struck-through in the hierarchy
- Completed KRs retain their progress values for reference

### US-2: Complete an Objective
**As a** user who has achieved all the Key Results and sub-Objectives under an Objective,
**I want to** mark the Objective as complete,
**So that** I can signal that this goal area is achieved.

**Acceptance Criteria:**
- A "complete" action is available on each Objective
- An Objective can only be completed if all its direct child Objectives and Key Results are already complete
- If the user tries to complete an Objective with active children, show an error explaining which children are still active
- Completed Objectives appear dimmed/struck-through in the hierarchy

### US-3: Reopen a completed OKR
**As a** user who completed an OKR prematurely or wants to continue working on it,
**I want to** reopen it,
**So that** it returns to active status.

**Acceptance Criteria:**
- A "reopen" action is available on each completed Objective and Key Result
- Reopening restores the item to active status with all its data intact
- Reopening a child OKR does not automatically reopen its parent
- Reopening a parent Objective does not affect its children's completion status

### US-4: Archive completed OKRs
**As a** user with many completed OKRs dimmed in the view,
**I want to** archive them to hide them from the default view,
**So that** my OKR view stays clean and focused.

**Acceptance Criteria:**
- An "archive" action is available on each individual completed OKR
- Archiving hides the item from the default OKR view
- Archived items can be revealed via a "show archived" toggle in the view

### US-5: Toggle visibility of all completed OKRs
**As a** user who wants to quickly declutter the OKR view,
**I want to** toggle all completed (but not archived) items on/off,
**So that** I can focus on active work or review what's been achieved.

**Acceptance Criteria:**
- A "show/hide completed" toggle exists in the OKR view header
- When hidden, all completed-but-not-archived OKRs are hidden from view
- The toggle state persists across sessions (saved in navigation context or similar)

## Requirements

### Functional Requirements

#### Data Model Changes
- **FR-1**: Add a `Status` field to both Objective and KeyResult models with values: `active` (default), `completed`, `archived`
- **FR-2**: Existing OKRs without a status field default to `active` (backward compatible via zero-value)

#### Backend API
- **FR-3**: `CompleteObjective(objectiveId string) error` — Validates all children are complete, then sets status to `completed`
- **FR-4**: `CompleteKeyResult(keyResultId string) error` — Sets KR status to `completed`
- **FR-5**: `ReopenObjective(objectiveId string) error` — Sets status back to `active`
- **FR-6**: `ReopenKeyResult(keyResultId string) error` — Sets status back to `active`
- **FR-7**: `ArchiveObjective(objectiveId string) error` — Sets status to `archived` (must already be `completed`)
- **FR-8**: `ArchiveKeyResult(keyResultId string) error` — Sets status to `archived` (must already be `completed`)

#### Frontend
- **FR-9**: Completed OKRs render with dimmed/struck-through styling, distinguishable from active items
- **FR-10**: Archived OKRs are hidden by default, shown when "show archived" is toggled on
- **FR-11**: Context menu or action buttons on OKRs provide complete/reopen/archive actions based on current status
- **FR-12**: Global "show/hide completed" toggle in OKR view header
- **FR-13**: Toggle states (show completed, show archived) persist across sessions
- **FR-14**: When attempting to complete an Objective with active children, display a clear error message listing the incomplete children

#### Validation Rules
- **FR-15**: Cannot complete an Objective if any direct child Objective or Key Result is still `active`
- **FR-16**: Cannot archive an OKR that is still `active` (must be `completed` first)
- **FR-17**: Reopening sets status to `active` regardless of previous state (`completed` or `archived`)
- **FR-18**: Deleting a completed or archived OKR works the same as deleting an active one

### Non-Functional Requirements
- **NFR-1**: Zero-value backward compatibility — existing data files without status fields continue to work (status defaults to `active`)
- **NFR-2**: All status changes are git-versioned like other data changes
- **NFR-3**: Mock bindings in `wails-mock.ts` must support all new APIs for browser testing

## Success Criteria

- Users can complete and reopen both Objectives and Key Results
- Users can archive completed OKRs and toggle their visibility
- Parent Objectives enforce that all children must be complete before the parent can be completed
- Existing OKR data loads without migration (backward compatible)
- All new backend methods are covered by tests
- Frontend works in all three dev environments (native, Wails dev, Vite mock)

## Constraints & Assumptions

- **No time cycles**: Completion is always manual; there are no time-based auto-completion or review cycles
- **No retrospective notes**: Completion does not capture outcome summaries (keep it simple)
- **Status is per-item**: Each Objective and KR has its own independent status; no bulk operations beyond the visibility toggle
- **No status on Life Themes**: Themes are organizational containers and do not have a completion concept

## Out of Scope

- Time-boxing or OKR cycles (quarterly reviews, deadlines)
- Outcome/retrospective notes on completion
- Auto-completion when KR progress reaches target
- Completion status on Life Themes
- Bulk complete/archive operations on multiple OKRs
- Completion history or audit trail beyond git versioning
- Notifications or reminders related to completion

## Dependencies

- **set-start-and-target-of-kr-at-creation** epic (in progress) — should be merged first so the KR model is stable before adding the `Status` field
- Existing progress tracking infrastructure (`startValue`, `currentValue`, `targetValue` on KRs)
