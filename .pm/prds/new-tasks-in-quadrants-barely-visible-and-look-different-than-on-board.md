---
name: new-tasks-in-quadrants-barely-visible-and-look-different-than-on-board
description: Make task cards in Eisenhower quadrants visually consistent with board task cards
status: backlog
created: 2026-02-13T11:14:17Z
---

# PRD: new-tasks-in-quadrants-barely-visible-and-look-different-than-on-board

## Executive Summary

Task cards in the Eisenhower quadrants (CreateTaskDialog) are barely visible and look completely different from the rich task cards on the EisenKan board. This creates a disjointed user experience where the same conceptual object — a task — appears in two drastically different visual styles depending on context. The fix is to align quadrant task cards with the board's visual design.

## Problem Statement

When users create tasks via CreateTaskDialog, the pending tasks rendered in the Eisenhower quadrants are plain white rectangles with a thin gray border, no theme color, no badges, and no metadata. Meanwhile, tasks on the board have a prominent left color accent, priority badges, theme names, and action buttons.

This causes:
1. **Poor visibility** — quadrant tasks blend into the background due to low contrast (light border on light background, minimal shadow)
2. **Inconsistent mental model** — users see the same task look completely different in two views, breaking visual continuity
3. **Missing context** — quadrant tasks show only a title, so users can't tell which theme a task belongs to or its priority at a glance

## User Stories

### US-1: Task creator sees rich cards in quadrants
**As a** user creating tasks in the batch creation dialog,
**I want** task cards in the quadrants to look like the cards on the board,
**So that** I can immediately recognize them and see relevant metadata.

**Acceptance criteria:**
- Quadrant task cards display a left border accent in the task's theme color
- Quadrant task cards show the priority badge (Q1/Q2/Q3) matching the quadrant they're in
- Quadrant task cards show the theme name when a theme is assigned
- Card styling (padding, shadow, border-radius) matches the board's `.task-card`

### US-2: Task creator can easily see new tasks
**As a** user who just entered a new task,
**I want** the task card to be visually prominent in the quadrant,
**So that** I can confirm it was created and placed correctly.

**Acceptance criteria:**
- Task cards have sufficient contrast against the quadrant background
- Shadow and border styling make cards clearly distinguishable
- Cards are at least as prominent as board task cards

## Requirements

### Functional Requirements

1. **Theme color accent**: Render a 4px left border in the task's theme color on quadrant task cards (matching `.task-card { border-left: 4px solid var(--theme-color) }` from the board)
2. **Priority badge**: Show the quadrant's priority label (Q1/Q2/Q3) as a colored badge on each task card, using the same badge styling as the board
3. **Theme name**: Display the theme name (if assigned) below or beside the task title
4. **Card styling alignment**: Match padding (`0.75rem`), border-radius (`6px`), and box-shadow (`0 1px 3px rgba(0, 0, 0, 0.1)`) from the board's `.task-card`
5. **Hover effects**: Match the board's hover shadow (`0 4px 6px rgba(0, 0, 0, 0.1)`)
6. **Drag affordance**: Maintain `cursor: grab` and drag-and-drop functionality

### Non-Functional Requirements

1. **No layout breakage**: Quadrants must still fit within the CreateTaskDialog without overflow or scroll issues — cards are more compact in quadrants, so sizing should be proportional
2. **Performance**: No additional API calls — use data already available on `PendingTask` (themeId, title) and quadrant props (color, title/priority)
3. **Consistency**: Changes apply in both mock-binding (localhost:5173) and native Wails environments

## Success Criteria

- Quadrant task cards are visually distinguishable from the background at a glance
- A user seeing a quadrant card and a board card can tell they represent the same kind of object
- No regressions in drag-and-drop between quadrants

## Constraints & Assumptions

- **PendingTask already has `themeId`** — theme color/name lookup is needed from the themes list (must be passed as a prop or resolved)
- **Priority is implicit from quadrant placement** — no need to store it on PendingTask; the quadrant's own color/title provides this
- The staging quadrant (Q4) can remain visually dimmed but should still use the improved card style

## Out of Scope

- Adding new metadata fields to PendingTask (e.g., due date display, action buttons like delete/edit on individual cards)
- Changing the board's task card design
- Refactoring CreateTaskDialog layout or flow

## Dependencies

- Theme data (colors, names) must be available in the quadrant component — may require passing themes as a prop to `EisenhowerQuadrant`
- Existing `ThemeBadge` component can potentially be reused
