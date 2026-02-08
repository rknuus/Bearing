---
name: remove-useless-eisenhower-section
description: Remove the always-empty Q4 (Not Important & Not Urgent) section from the EisenKan TODO column and board configuration
status: backlog
created: 2026-02-08T19:23:17Z
---

# PRD: remove-useless-eisenhower-section

## Executive Summary

Remove the Q4 ("Not Important & Not Urgent") section from the EisenKan board's TODO column. This section is always empty because the backend intentionally rejects Q4 as a valid task priority. Removing it declutters the board and eliminates user confusion about an unusable section.

## Problem Statement

The `DefaultBoardConfiguration` in `internal/access/models.go` defines four Eisenhower priority sections for the TODO column, including Q4 (`not-important-not-urgent`). However, the backend (`internal/managers/planning_manager.go`) explicitly rejects task creation with Q4 priority. In the `CreateTaskDialog`, Q4 is repurposed as a staging area — tasks there are discarded, not saved.

This means the Q4 section on the board is permanently empty, wasting vertical space and potentially confusing users who see a section that can never contain tasks.

## User Stories

### US-1: Board user sees a cleaner TODO column
**As a** user viewing the EisenKan board,
**I want** the TODO column to only show sections that can contain tasks,
**So that** I can focus on my actual priorities without empty sections taking up space.

**Acceptance Criteria:**
- The TODO column renders exactly 3 sections: Q1 (Important & Urgent), Q2 (Important & Not Urgent), Q3 (Not Important & Urgent)
- No Q4 section is visible on the board

## Requirements

### Functional Requirements

1. **Remove Q4 from board configuration**: Remove the `not-important-not-urgent` section from `DefaultBoardConfiguration()` in `internal/access/models.go`
2. **Update mock bindings**: Remove Q4 section from the mock board configuration in `frontend/src/lib/wails-mock.ts`
3. **Remove Q4 priority constant** (if unused elsewhere): Clean up `PriorityNotImportantNotUrgent` constant in `internal/access/models.go` if no other code references it
4. **Update Q4 priority validation comment**: Ensure the backend validation comment in `planning_manager.go` stays accurate

### Non-Functional Requirements

- No migration needed: no tasks with Q4 priority can exist in any database
- No UI layout changes beyond the section removal — the remaining 3 sections should render identically to how they do today

## Success Criteria

- `svelte-check` and `make frontend-lint` pass with 0 errors and 0 warnings
- All existing Go and frontend tests pass (updating any that reference Q4 sections)
- The EisenKan board TODO column shows exactly 3 priority sections

## Constraints & Assumptions

- **Assumption**: No existing database contains tasks with `not-important-not-urgent` priority, since the backend has always rejected it
- **Assumption**: The Q4 priority constant may still be referenced in validation code (to reject it) — that validation can remain or be simplified

## Out of Scope

- Changing the CreateTaskDialog's Q4 staging area behavior (it uses Q4 as a UX concept for staging, not as a real priority)
- Changing Eisenhower priority labels or colors for Q1-Q3
- Any changes to DOING or DONE columns

## Dependencies

- None — this is a self-contained cleanup
