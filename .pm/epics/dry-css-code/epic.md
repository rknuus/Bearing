---
name: dry-css-code
status: completed
created: 2026-02-13T14:02:06Z
completed: 2026-02-13T14:39:55Z
progress: 100%
prd: .pm/prds/dry-css-code.md
github: TBD
---

# Epic: dry-css-code

## Overview

Eliminate CSS duplication across the Bearing frontend by:
1. Defining a design token palette (CSS custom properties) in `styles.css`
2. Extracting shared Svelte components for buttons, dialogs, and error banners
3. Migrating all existing components to use the tokens and shared components

This is a pure refactor — no visual changes.

## Architecture Decisions

- **CSS custom properties over utility classes** — Design tokens as `:root` variables in `styles.css`. Components reference `var(--color-primary-600)` instead of `#2563eb`. This leverages the existing `--theme-color` pattern already in place.
- **Shared Svelte components over global CSS classes** — Encapsulate repeated UI patterns (buttons, dialogs, error banners) as components in `frontend/src/lib/components/`, not as global CSS utility classes. This keeps styles scoped and co-located with markup.
- **Skip FormField component** — `TaskFormFields.svelte` already exists as a shared form component. Views that bypass it (CalendarView, OKRView inline forms) have minor styling differences that will be normalized via design tokens rather than a new wrapper component.
- **Skip separate Badge component** — Priority badges are duplicated in only 2 files (EisenKanView, EisenhowerQuadrant). Extract as a small `PriorityBadge.svelte` or fold into existing `ThemeBadge.svelte` if the API fits.
- **Normalize inconsistencies during migration** — Minor drift (border-radius 4px vs 6px, z-index 100 vs 1000, error banner color #fef2f2 vs #fee2e2) will be unified to the most common value. This is acceptable because the differences were accidental copy-paste drift, not intentional design.

## Technical Approach

### Design Tokens (`styles.css`)

Add to `:root` in `frontend/src/styles.css`:

**Colors** — Map existing hardcoded hex values:
- Gray: `--color-gray-50` (#f9fafb) through `--color-gray-900` (#111827)
- Primary (blue): `--color-primary-300` (#93c5fd), `--color-primary-500` (#3b82f6), `--color-primary-600` (#2563eb), `--color-primary-700` (#1d4ed8)
- Success (green): `--color-success-500` (#10b981), `--color-success-600` (#059669)
- Warning (amber): `--color-warning-400` (#fcd34d), `--color-warning-500` (#f59e0b)
- Error (red): `--color-error-50` (#fef2f2), `--color-error-100` (#fee2e2), `--color-error-200` (#fecaca), `--color-error-500` (#ef4444), `--color-error-600` (#dc2626), `--color-error-800` (#991b1b)

**Spacing** — `--space-1` (0.25rem) through `--space-8` (3rem)

**Border radius** — `--radius-sm` (4px), `--radius-md` (6px), `--radius-lg` (8px), `--radius-full` (9999px)

### Shared Components (`frontend/src/lib/components/`)

**`Button.svelte`**
- Props: `variant` (`"primary"` | `"secondary"` | `"icon"` | `"danger"`), `disabled`, `type`, `size`
- Slot for button content (text + optional icon)
- Spreads `$$restProps` for `onclick`, `class`, etc.
- Icon variant supports color sub-variants via a `color` prop

**`Dialog.svelte`**
- Props: `title`, `maxWidth` (default `400px`)
- Snippet/slot for body content, snippet/slot for footer actions
- Overlay click-to-close with event
- Unified z-index (1000)

**`ErrorBanner.svelte`**
- Props: `message`, `dismissable` (default `true`)
- Callback: `ondismiss`
- Unified colors: `--color-error-50` bg, `--color-error-200` border, `--color-error-600` text

### Migration

Replace duplicated CSS + markup in these files:
- **CreateTaskDialog.svelte** — Use Dialog, Button, ErrorBanner
- **EditTaskDialog.svelte** — Use Dialog, Button, ErrorBanner
- **CalendarView.svelte** — Use Dialog, Button (normalize border-radius)
- **EisenKanView.svelte** — Use Button, ErrorBanner
- **OKRView.svelte** — Use Button, ErrorBanner
- **EisenhowerQuadrant.svelte** — Extract priority badge
- **App.svelte** — Use Button (if applicable)
- **All components** — Replace hardcoded hex colors with `var(--color-*)` tokens

## Implementation Strategy

**Order matters:** Tokens first (no-op change), then components (encapsulate patterns), then migration (swap usages), then color sweep (mechanical replacement).

Each task should pass `make frontend-lint` and `make frontend-check` independently. Visual verification after each migration step.

## Task Breakdown Preview

- [ ] Task 1: Define design tokens — Add CSS custom properties to `styles.css` `:root`
- [ ] Task 2: Create `Button.svelte` — Extract button component with primary/secondary/icon/danger variants
- [ ] Task 3: Create `Dialog.svelte` — Extract modal overlay + container component with slots
- [ ] Task 4: Create `ErrorBanner.svelte` — Extract dismissable error banner component
- [ ] Task 5: Migrate CreateTaskDialog + EditTaskDialog — Replace inline styles with Dialog, Button, ErrorBanner
- [ ] Task 6: Migrate CalendarView — Replace dialog/button patterns with shared components
- [ ] Task 7: Migrate EisenKanView + OKRView + EisenhowerQuadrant — Replace button/error/badge patterns
- [ ] Task 8: Replace all remaining hardcoded hex colors with CSS custom property tokens across all components

## Dependencies

- No external dependencies
- Task 1 (tokens) must land before Task 8 (color sweep)
- Tasks 2-4 (component creation) must land before Tasks 5-7 (migration)
- Task 8 can run after all migrations

## Success Criteria (Technical)

- `grep -r '#[0-9a-fA-F]\{3,8\}' frontend/src/ --include='*.svelte'` returns zero matches in `<style>` blocks (excluding `color-mix()` and similar CSS functions that need literal hex)
- No duplicated button/dialog/error-banner CSS blocks across components
- `make frontend-lint` passes
- `make frontend-check` passes
- Existing app functionality unchanged — test both Wails native and browser mock mode

## Tasks Created
- [ ] 001.md - Define design tokens in styles.css (parallel: true)
- [ ] 002.md - Create Button.svelte shared component (parallel: true, depends: 001)
- [ ] 003.md - Create Dialog.svelte shared component (parallel: true, depends: 001)
- [ ] 004.md - Create ErrorBanner.svelte shared component (parallel: true, depends: 001)
- [ ] 005.md - Migrate CreateTaskDialog and EditTaskDialog (parallel: true, depends: 002-004)
- [ ] 006.md - Migrate CalendarView (parallel: true, depends: 002-003)
- [ ] 007.md - Migrate EisenKanView, OKRView, EisenhowerQuadrant (parallel: true, depends: 002, 004)
- [ ] 008.md - Replace all remaining hardcoded hex colors (parallel: false, depends: 005-007)

Total tasks: 8
Parallel tasks: 7
Sequential tasks: 1
Sizes: 2×XS, 3×S, 3×M

## Estimated Effort

- 8 tasks total
- Each task is independently shippable
- Tasks 2-4 (component creation) can be parallelized
- Tasks 5-7 (migration) can be parallelized after components exist
