---
name: integrate-parts-of-alternative-eisenkan-implementation
description: Integrate EisenKan reference features (rule engine, task editing, priority promotion, subtasks, optimistic drag-drop) into Bearing while preserving multi-view navigation and OKR/calendar interop
status: backlog
created: 2026-02-08T14:41:36Z
---

# PRD: integrate-parts-of-alternative-eisenkan-implementation

## Executive Summary

The `tmp/eisenkan/` reference implementation contains mature features — rule engine, task editing, priority promotion, subtask hierarchy, dynamic board configuration, and optimistic drag-drop — that Bearing's EisenKan view currently lacks. This PRD covers integrating all EisenKan features into Bearing while preserving Bearing's multi-view navigation (OKR, Calendar, EisenKan), predefined data directory, and cross-view interoperability.

## Problem Statement

Bearing's EisenKan view is a simplified port of the reference implementation. Key gaps:

- **No task editing** — tasks can be created and moved but not modified after creation.
- **No rule engine** — no WIP limits, transition validation, or workflow enforcement.
- **No priority promotion** — tasks cannot automatically escalate by date.
- **No subtask hierarchy** — flat task list only.
- **No optimistic drag-drop** — no rollback on server rejection; no touch/accessibility support.
- **Hardcoded board structure** — column/section definitions live in the frontend, not driven by backend configuration.

The reference implementation in `tmp/eisenkan/` solves all of these. Integrating its features brings Bearing's task management to production quality.

## User Stories

### US-01: Edit an existing task
**As a** user, **I want to** modify a task's title, description, priority, tags, and due date after creation, **so that** I can refine tasks as requirements evolve.

**Acceptance Criteria:**
- Clicking a task opens an edit dialog with all editable fields
- Changes persist immediately on save
- Priority changes re-sort the task in the Todo column
- Cancel discards unsaved changes

### US-02: Automatic priority promotion
**As a** user, **I want** tasks to automatically escalate in priority when their promotion date arrives, **so that** approaching deadlines surface without manual intervention.

**Acceptance Criteria:**
- Tasks have an optional promotion date field
- When the promotion date is reached, the task's priority increases (e.g., Q2 → Q1)
- Promoted tasks visually indicate they were auto-promoted
- Promotion runs on app startup and periodically during use

### US-03: Subtask hierarchy
**As a** user, **I want to** break tasks into subtasks with parent-child relationships, **so that** I can manage complex work incrementally.

**Acceptance Criteria:**
- Tasks can have a parent task (ParentTaskID)
- Subtasks are visually nested under their parent
- Cascade policies apply when parent tasks move columns (configurable: no action, archive, delete, promote)
- Filtering supports: all tasks, top-level only, subtasks only

### US-04: Optimistic drag-drop with rollback
**As a** user, **I want** drag-drop to feel instant with automatic rollback if the server rejects the move, **so that** the UI feels responsive while maintaining data integrity.

**Acceptance Criteria:**
- Dragging a task updates the UI immediately (optimistic)
- Backend validates the move (WIP limits, transition rules)
- On rejection, the UI rolls back to the previous state with an error message
- Touch devices are supported via svelte-dnd-action

### US-05: WIP limits and workflow rules
**As a** user, **I want** the board to enforce work-in-progress limits and valid transitions, **so that** I maintain focus and follow a disciplined workflow.

**Acceptance Criteria:**
- Configurable WIP limit per column (e.g., max 3 tasks in "Doing")
- Moving a task to a column at its WIP limit is rejected with a clear message
- Rule violations surfaced in the UI (not silently dropped)

### US-06: Dynamic board configuration
**As a** user, **I want** board columns and sections to be defined by backend configuration, **so that** the board structure is consistent and extensible.

**Acceptance Criteria:**
- Frontend renders columns/sections from a GetBoardConfiguration API
- Todo column sections correspond to Eisenhower quadrants
- Adding/removing sections requires only backend changes

### US-07: Eisenhower quadrant task creation
**As a** user, **I want to** create tasks using a 4-quadrant Eisenhower interface, **so that** I deliberately prioritize each task at creation time.

**Acceptance Criteria:**
- Task creation dialog shows a 4-quadrant grid
- New tasks start in a staging area and are dragged to a quadrant
- Batch creation supported (multiple tasks at once)
- Q4 (not important, not urgent) available as a staging/deprioritization area

## Requirements

### Functional Requirements

#### Backend — Rule Engine (new package: `internal/engines/rule_engine/`)
- FR-01: Implement RuleEngine as a new Go package following iDesign layering (engines sit between managers and access)
- FR-02: Task transition validation — enforce valid column moves
- FR-03: WIP limit enforcement per column
- FR-04: Task age rule enforcement
- FR-05: Priority promotion processing (date-based automatic escalation)
- FR-06: Board configuration validation

#### Backend — Task Management Enhancements
- FR-07: UpdateTask API — modify title, description, priority, tags, due date, promotion date
- FR-08: Subtask support — ParentTaskID field, cascade policies on parent moves
- FR-09: Advanced QueryCriteria — filter by columns, sections, priority, date ranges, tags, hierarchy level
- FR-10: GetBoardConfiguration API — return column/section definitions with semantic types
- FR-11: MoveTask with validation result — return success/failure with rule violations
- FR-12: Task timestamps — CreatedAt, UpdatedAt fields on all task responses

#### Frontend — EisenKan View Enhancements
- FR-13: Replace HTML5 drag-drop with svelte-dnd-action library
- FR-14: Optimistic updates with rollback pattern for all drag operations
- FR-15: EditTaskDialog component — full task editing with priority quadrant visualization
- FR-16: CreateTaskDialog with 4-quadrant Eisenhower staging interface
- FR-17: Dynamic column/section rendering from GetBoardConfiguration response
- FR-18: Subtask nesting UI — visual hierarchy under parent tasks
- FR-19: ErrorDialog component for rule violation feedback
- FR-20: Preserve all existing OKR view and Calendar view interoperability (theme filtering, task-to-KR linking, date-based views)

### Non-Functional Requirements

- NFR-01: Rule engine must validate moves in < 10ms for boards with up to 500 tasks
- NFR-02: Optimistic UI updates must render in < 16ms (single frame)
- NFR-03: svelte-dnd-action must support keyboard and touch accessibility
- NFR-04: All new Go code covered by unit tests; integration tests for full workflows
- NFR-05: E2E tests cover happy paths only; corner cases and error cases in unit tests
- NFR-06: No regressions in OKR or Calendar view functionality

## Success Criteria

- All EisenKan reference features (except board selection/directory browsing) available in Bearing
- Existing theme-based filtering and cross-view navigation unaffected
- Rule engine enforces WIP limits and transition rules with < 10ms latency
- Drag-drop works on touch devices and supports keyboard navigation
- `make frontend-lint`, `make frontend-check`, and all tests pass

## Constraints & Assumptions

- **Data directory**: Tasks stored in Bearing's predefined directory (`~/.bearing/data/`), not a user-selectable path. Board selection UI from EisenKan is excluded.
- **View navigation**: Bearing's existing App.svelte navigation (Ctrl+1/2/3 switching between OKR, Calendar, EisenKan) is preserved as-is.
- **Wails v2**: Constrained to Wails v2 capabilities (e.g., file dialogs use browser prompts).
- **Svelte 5 runes mode**: All new frontend code must use runes syntax and follow `$effect` safety rules (no read+write of same `$state`).
- **No business logic in client**: Rule enforcement happens in the Go backend; frontend only renders results.

## Out of Scope

- Board selection / directory browsing UI (Bearing uses a fixed data directory)
- View navigation changes (keeping Bearing's multi-view switcher)
- Multi-board support / board switching
- Recently used documents management
- Settings/preferences UI
- Cross-platform recently-used-documents APIs (macOS NSDocumentController, etc.)
- Systematic E2E testing of error cases and corner cases (unit tests cover these)

## Dependencies

- `svelte-dnd-action` npm package for drag-drop
- Existing `internal/managers/planning_manager.go` as integration point for new engine layer
- Existing `internal/access/` layer for data persistence
- `tmp/eisenkan/` reference implementation as design source
