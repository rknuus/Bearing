---
name: replace-colored-dots-on-quadrants-and-sections-by-background-color
description: Replace small colored dots on quadrant/section headers with colored header backgrounds and subtle container tints
status: backlog
created: 2026-02-13T13:25:34Z
---

# PRD: replace-colored-dots-on-quadrants-and-sections-by-background-color

## Executive Summary

Replace the small 10px colored dots on Eisenhower quadrant headers and board section headers with colored header backgrounds and a subtle tint on the container body. This makes the priority color association more prominent and visually clear.

## Problem Statement

The quadrant headers (in CreateTaskDialog) and section headers (in EisenKanView's Todo column) use a tiny 10px colored circle to indicate priority. This dot is easy to miss and doesn't create a strong visual association between the color and the priority level. Replacing it with a colored header background and light container tint makes the color coding immediately obvious.

## User Stories

### US-1: User sees priority at a glance
**As a** user viewing the Eisenhower quadrants or board sections,
**I want** the priority color to be prominent via the header background,
**So that** I can instantly identify which quadrant/section I'm looking at.

**Acceptance criteria:**
- Quadrant headers (`EisenhowerQuadrant.svelte`) have a background color derived from the quadrant's priority color
- Section headers (`EisenKanView.svelte`) have a background color derived from the section's color
- The colored dot element is removed from both headers
- Header text remains readable against the colored background (white or dark text based on contrast)

### US-2: Container body has subtle color tint
**As a** user,
**I want** the quadrant/section body to have a very subtle tint of the priority color,
**So that** the color association extends beyond the header without overwhelming the task cards.

**Acceptance criteria:**
- Quadrant containers have a light tint of the priority color as background
- Section containers have a light tint of the section color as background
- Task cards inside remain white and clearly readable against the tinted background
- The tint is subtle enough not to interfere with card readability

## Requirements

### Functional Requirements

1. **Colored header backgrounds**: Replace the `.color-indicator` / `.section-color` dot with a background color on the header bar, using the quadrant/section's priority color
2. **Header text contrast**: Ensure header text (title, count badge) is readable — use white text on dark colors, dark text on light colors, or use a semi-transparent color overlay
3. **Subtle container tint**: Apply a very low-opacity version of the priority color as the container body background (e.g., 5-10% opacity)
4. **Remove dot elements**: Delete the `.color-indicator` span from `EisenhowerQuadrant.svelte` and the `.section-color` span from `EisenKanView.svelte`

### Non-Functional Requirements

1. **No layout shifts**: Removing the dot should not change header alignment or spacing
2. **Consistency**: Both quadrant headers and section headers use the same approach
3. **Works in both environments**: Vite mock-binding and native Wails

## Success Criteria

- Priority colors are immediately visible without looking for a small dot
- Task cards remain clearly readable against tinted backgrounds
- No regressions in drag-and-drop or other interactions

## Constraints & Assumptions

- The `color` prop is already passed to both components — no new data plumbing needed
- Header text color may need to adapt based on background brightness (light vs dark priority colors)

## Out of Scope

- Changing the priority colors themselves
- Adding new color customization features
- Modifying the board column headers (only sections within columns)

## Dependencies

- None — all changes are CSS/markup within existing components
