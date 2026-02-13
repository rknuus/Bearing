---
name: dry-css-code
description: Eliminate CSS duplication by extracting reusable Svelte components and defining design tokens
status: backlog
created: 2026-02-13T13:59:15Z
---

# PRD: dry-css-code

## Executive Summary

The Bearing frontend has significant CSS duplication across 13+ Svelte components — hardcoded colors repeated 100+ times, identical button/dialog/form/error-banner styles copy-pasted across files. This PRD defines a plan to eliminate that duplication by extracting reusable Svelte components for common UI patterns and introducing CSS custom properties (design tokens) for colors, spacing, and typography.

## Problem Statement

Every new view or component requires copy-pasting button styles, dialog overlays, form inputs, and error banners from existing components. Color values like `#6b7280` appear 38 times, `#3b82f6` 21 times, `#2563eb` 18 times — all hardcoded. This makes the codebase:

- **Hard to maintain** — A design change (e.g., primary blue) requires editing dozens of files.
- **Inconsistent** — Copied styles drift over time (different padding, border-radius, hover states).
- **Slow to develop** — Building a new view means hunting for the right styles to copy.

This matters now because the app is growing (OKR view, Eisenhower views, task dialogs) and duplication compounds with each addition.

## User Stories

### Developer adding a new view

**As a** developer building a new view,
**I want** to import shared UI components (buttons, dialogs, form fields, error banners),
**so that** I get consistent styling without copying CSS blocks.

**Acceptance Criteria:**
- Can import and use `<Button variant="primary">` without writing button CSS
- Can import `<Dialog>` to get modal overlay + container without duplicating the pattern
- Can import `<ErrorBanner>` for error display without styling from scratch
- New views require only layout-specific CSS, not component-level styling

### Developer changing the design system

**As a** developer updating the color palette or spacing,
**I want** to change a CSS custom property in one place,
**so that** the change propagates everywhere.

**Acceptance Criteria:**
- Changing `--color-primary` in `styles.css` updates all primary buttons, links, and accents
- Changing `--color-gray-500` updates all secondary text and borders
- No component files need editing for a palette-wide color change

## Requirements

### Functional Requirements

#### 1. Design Tokens (CSS Custom Properties)

Define in `styles.css` under `:root`:

**Color palette:**
- Gray scale: `--color-gray-50` through `--color-gray-900` (mapping existing hardcoded values)
- Primary: `--color-primary-500`, `--color-primary-600`, `--color-primary-700` (blues)
- Success: `--color-success-500`, `--color-success-600` (greens)
- Warning: `--color-warning-400`, `--color-warning-500` (ambers)
- Error: `--color-error-500`, `--color-error-600`, `--color-error-50`, `--color-error-100` (reds)

**Spacing scale:**
- `--space-1` through `--space-8` (0.25rem increments: 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3rem)

**Border radius:**
- `--radius-sm` (4px), `--radius-md` (6px), `--radius-lg` (8px), `--radius-full` (9999px)

**Typography:**
- `--text-xs` through `--text-2xl` (mapping existing font sizes)
- `--font-medium` (500), `--font-semibold` (600), `--font-bold` (700)

#### 2. Reusable Svelte Components

Extract the following shared components into `frontend/src/lib/components/`:

**`Button.svelte`**
- Props: `variant` (`"primary"` | `"secondary"` | `"icon"` | `"danger"`), `disabled`, `type`, `size`
- Replaces duplicated button styles in CreateTaskDialog, EditTaskDialog, App.svelte, OKRView, EisenKanView
- Encapsulates hover, disabled, and transition styles

**`Dialog.svelte`**
- Props: `open`, `title`, `maxWidth`
- Provides: overlay backdrop, centered container, close-on-overlay-click, header with title
- Slot for dialog body content
- Replaces duplicated overlay+dialog styles in CreateTaskDialog, EditTaskDialog

**`ErrorBanner.svelte`**
- Props: `message`, `dismissable`
- Events: `ondismiss`
- Replaces duplicated error banner pattern in 5+ components

**`FormField.svelte`** (if warranted)
- Props: `label`, `type`, `required`, `error`
- Wraps input/select/textarea with consistent label, spacing, focus ring
- Replaces duplicated form input styles in TaskFormFields, OKRView, CreateTaskDialog

**`Badge.svelte`**
- Props: `variant`, `size`, `color`
- Replaces duplicated priority badge pattern

#### 3. Migration of Existing Components

- Replace hardcoded color values with CSS custom properties in all component `<style>` blocks
- Replace duplicated UI patterns with the new shared components
- Preserve exact visual appearance — this is a refactor, not a redesign

### Non-Functional Requirements

- **No new dependencies** — Pure CSS custom properties and Svelte components only
- **No visual changes** — Before/after screenshots should be pixel-identical
- **Both environments** — Changes must work in native Wails app and browser mock mode (localhost:5173)
- **No runtime cost** — CSS custom properties are resolved by the browser; no JS overhead
- **Incremental adoption** — Existing component-scoped styles can coexist during migration

## Success Criteria

- Zero hardcoded hex color values in Svelte component `<style>` blocks (all replaced by CSS custom properties)
- Button, dialog, error banner, and badge patterns each defined in exactly one place
- Total CSS lines across all components reduced by 30%+ (rough estimate based on duplication analysis)
- `make frontend-lint` and `make frontend-check` pass
- All existing functionality preserved (no visual or behavioral regressions)

## Constraints & Assumptions

- **Svelte 5 scoped styles** — Component styles are scoped by default; global utility classes work but shared components are preferred
- **Existing theme-color system** — The `--theme-color` CSS variable propagation pattern (for quadrant/section colors) must be preserved and remain compatible
- **No CSS preprocessor** — The project uses plain CSS; no Sass/Less/PostCSS to be introduced
- **Wails v2 WebView** — CSS custom properties are well-supported in all modern WebView engines

## Out of Scope

- Dark mode / theming beyond the current light theme
- CSS-in-JS or Tailwind CSS adoption
- Redesigning any UI elements (colors, spacing, layout remain as-is)
- Responsive/mobile layout changes
- Animation or transition system beyond existing hover/focus transitions

## Dependencies

- No external dependencies
- Requires knowledge of which components use which patterns (captured in the duplication analysis above)
- The existing `ThemeBadge.svelte`, `TaskFormFields.svelte`, and `Breadcrumb.svelte` components may need to be updated to use the new tokens
