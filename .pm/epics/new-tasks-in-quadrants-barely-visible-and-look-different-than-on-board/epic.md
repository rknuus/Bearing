---
name: new-tasks-in-quadrants-barely-visible-and-look-different-than-on-board
status: completed
created: 2026-02-13T11:35:58Z
progress: 100%
prd: .pm/prds/new-tasks-in-quadrants-barely-visible-and-look-different-than-on-board.md
github: [Will be updated when synced to GitHub]
---

# Epic: new-tasks-in-quadrants-barely-visible-and-look-different-than-on-board

## Overview

Align the task cards in `EisenhowerQuadrant.svelte` (used in `CreateTaskDialog`) with the board's `.task-card` styling in `EisenKanView.svelte`. The quadrant cards currently show only a title with minimal styling. They need a theme-color left accent, priority badge, theme name, and matching card dimensions/shadow.

## Architecture Decisions

- **No shared component extraction** — The quadrant card is simpler than the board card (no subtask toggle, no footer actions, no date/delete buttons). Creating a shared `TaskCard` component would add unnecessary abstraction. Instead, replicate the relevant visual styles directly in `EisenhowerQuadrant.svelte`.
- **Pass themes as a prop** — `CreateTaskDialog` already has `themes: LifeTheme[]`. Pass it through to `EisenhowerQuadrant` so cards can resolve `themeId` → color/name.
- **Derive priority label from existing quadrant props** — The quadrant already receives `quadrantId` (e.g., `important-urgent`) and `color`. A simple local mapping provides the Q1/Q2/Q3 label, matching the board's `priorityLabels`.
- **Reuse `ThemeBadge` component** — Already used on the board for the colored dot in the task header.

## Technical Approach

### Changes Required

**`EisenhowerQuadrant.svelte`:**
1. Add `themes` prop (`LifeTheme[]`) and import `ThemeBadge`
2. Add local `priorityLabel` derived from `quadrantId` (Q1/Q2/Q3, empty for staging)
3. Add a helper to resolve `themeId` → theme color and name
4. Update card markup: add `.task-header` with `ThemeBadge`, priority badge, and theme name
5. Update card CSS to match board: `border-left: 4px solid`, `padding: 0.75rem`, `border-radius: 6px`, `box-shadow: 0 1px 3px rgba(0,0,0,0.1)`, hover shadow `0 4px 6px`

**`CreateTaskDialog.svelte`:**
1. Pass `themes` prop to each `<EisenhowerQuadrant>` instance (2 render sites)

### No Backend Changes

All data is already available client-side. No new API calls needed.

## Implementation Strategy

This is a single, focused UI change touching only 2 files. Implement in one task.

## Task Breakdown Preview

- [ ] Task 1: Update EisenhowerQuadrant card styling and markup to match board task cards (pass themes prop, add theme color accent, priority badge, theme name, align CSS)
- [ ] Task 2: Verify lint, type-check, and tests pass; confirm in both Vite and native environments

## Dependencies

- `ThemeBadge` component (already exists at `frontend/src/lib/components/ThemeBadge.svelte`)
- `themes` data already available in `CreateTaskDialog` props

## Success Criteria (Technical)

- Quadrant task cards have 4px left border in task's theme color (or fallback gray if no theme)
- Priority badge (Q1/Q2/Q3) rendered with matching color from the board
- Theme name shown when task has a theme assigned
- Card padding, shadow, and border-radius match the board's `.task-card`
- Hover effects match the board
- Drag-and-drop still works correctly between quadrants
- No lint errors, type errors, or test failures
- Works in both mock-binding (Vite) and native Wails environments

## Tasks Created

- [ ] 001.md - Update EisenhowerQuadrant card markup and styling to match board task cards (parallel: false)
- [ ] 002.md - Verify lint, type-check, tests, and cross-environment rendering (parallel: false)

Total tasks: 2
Parallel tasks: 0
Sequential tasks: 2
