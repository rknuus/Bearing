---
name: replace-colored-dots-on-quadrants-and-sections-by-background-color
status: completed
created: 2026-02-13T13:30:03Z
progress: 100%
prd: .pm/prds/replace-colored-dots-on-quadrants-and-sections-by-background-color.md
github: [Will be updated when synced to GitHub]
---

# Epic: replace-colored-dots-on-quadrants-and-sections-by-background-color

## Overview

Replace the small colored dot indicators on quadrant headers (`EisenhowerQuadrant.svelte`) and board section headers (`EisenKanView.svelte`) with colored header backgrounds and a subtle container body tint. Pure CSS/markup change in 2 files.

## Architecture Decisions

- **Inline style for header background**: Use the existing `color` prop (already passed) to set `background-color` on the header via inline style, same as the dot did. No new props needed.
- **CSS `color-mix()` for subtle tint**: Use `color-mix(in srgb, {color} 8%, white)` or an inline style with low-opacity background for the container body. Alternatively, set `--section-color` as a CSS custom property and use it in both header and body styles.
- **Text contrast via semi-transparent overlay**: Rather than computing luminance in JS, use a consistent approach: white text with a slight text-shadow for readability on all priority colors. The existing colors (red #dc2626, blue #2563eb, amber #f59e0b, gray #6b7280) are all mid-to-dark tones where white text works — amber is the lightest but still dark enough for white bold text.
- **No shared utility**: Both components are independent and the change is small — apply the same pattern in each without abstraction.

## Technical Approach

### EisenhowerQuadrant.svelte

1. Remove `.color-indicator` span from markup
2. Add inline style on `.quadrant-header`: `style="background-color: {color};"`
3. Set `--quadrant-color` CSS custom property on the `.quadrant` container for the body tint
4. Update `.quadrant-header` CSS: remove old `background-color: #f3f4f6`, set text color to white
5. Update `.quadrant` CSS: use the custom property for a subtle tinted background
6. Update `.task-count` badge to work against colored header background
7. Delete `.color-indicator` CSS rule

### EisenKanView.svelte

1. Remove `.section-color` span from markup
2. Add inline style on `.section-header`: `style="background-color: {section.color};"`
3. Set `--section-color` CSS custom property on `.column-section` for the body tint
4. Update `.section-header` CSS: remove gap adjustment, set text color to white, add padding and border-radius
5. Update `.column-section` CSS: use custom property for subtle tinted background
6. Update `.section-count` badge to work against colored header background
7. Delete `.section-color` CSS rule

### No Backend Changes

Pure frontend CSS/markup changes.

## Task Breakdown Preview

- [ ] Task 1: Replace colored dots with header backgrounds and container tints in both components
- [ ] Task 2: Verify lint, type-check, tests, and visual rendering

## Dependencies

None — all changes use existing props and are CSS/markup only.

## Success Criteria (Technical)

- Quadrant and section headers have colored backgrounds instead of dots
- Header text (title, count) is readable against all priority colors
- Container bodies have a subtle tint of the priority color
- Task cards remain white and clearly readable
- No lint, type-check, or test failures
- Works in both Vite and native Wails environments

## Tasks Created

- [ ] 001.md - Replace colored dots with header backgrounds and container tints (parallel: false)
- [ ] 002.md - Verify lint, type-check, tests, and cross-environment rendering (parallel: false)

Total tasks: 2
Parallel tasks: 0
Sequential tasks: 2
