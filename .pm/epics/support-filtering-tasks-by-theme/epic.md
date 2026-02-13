---
name: support-filtering-tasks-by-theme
status: completed
created: 2026-02-13T15:35:37Z
progress: 100%
prd: .pm/prds/support-filtering-tasks-by-theme.md
github: [Will be updated when synced to GitHub]
---

# Epic: support-filtering-tasks-by-theme

## Overview

Add a clickable theme pill bar to EisenKanView for multi-theme filtering. Requires updating the data model from single `filterThemeId` (string) to `filterThemeIds` (string array) across Go backend, App.svelte state, and view props. Includes a smart default that pre-selects today's calendar theme on first open.

## Architecture Decisions

- **Backward-compatible Go struct migration**: Add `FilterThemeIDs []string` alongside existing `FilterThemeID string` in NavigationContext. On load, if `FilterThemeIDs` is empty but `FilterThemeID` is set, migrate the single value to the array. This preserves existing users' persisted filter.
- **Filter state owned by App.svelte**: `filterThemeIds: string[]` replaces `filterThemeId` in App.svelte. Passed as prop to EisenKanView. Pill toggle callbacks flow up via `onFilterThemeToggle` / `onFilterThemeClear`.
- **ThemeFilterBar as standalone component**: New `frontend/src/components/ThemeFilterBar.svelte` renders the pill row. Receives themes list and active filter IDs as props. Emits toggle/clear events. Can be reused in other views later.
- **Client-side filtering only**: No backend query changes. EisenKanView already loads all tasks; the `filteredTasks` derived state simply checks against the `filterThemeIds` array instead of a single string.
- **Smart default via existing GetYearFocus**: On first open (no persisted filter, no incoming theme), call `GetYearFocus()` to look up today's DayFocus entry and use its theme ID.

## Technical Approach

### Backend (Go)
- **Modified file**: `internal/access/models.go`
- Add `FilterThemeIDs []string` field to `NavigationContext` with JSON tag `"filterThemeIds"`
- Keep `FilterThemeID string` for backward compatibility (JSON tag `"filterThemeId"`)
- No API changes — navigation context read/write already handles arbitrary struct fields via JSON marshaling

### Frontend — State & Plumbing
- **App.svelte**: Replace `filterThemeId: string | undefined` with `filterThemeIds: string[]`. Update breadcrumb logic, navigation context save/load, `handleNavigateToTheme` (sets `[themeId]`), and props passed to views.
- **EisenKanView.svelte**: Change `filterThemeId?: string` prop to `filterThemeIds: string[]`. Update `filteredTasks` to check `filterThemeIds.includes(t.themeId)`. Add `onFilterThemeToggle` and `onFilterThemeClear` callback props.
- **CalendarView.svelte**: Change `filterThemeId` prop to `filterThemeIds` for legend highlighting (`.active` class when theme is in array). No filtering behavior changes.

### Frontend — ThemeFilterBar Component
- New file: `frontend/src/components/ThemeFilterBar.svelte`
- Props: `themes: LifeTheme[]`, `activeThemeIds: string[]`
- Events: `onToggle(themeId)`, `onClear()`
- Renders: "All" pill (active when `activeThemeIds` is empty) + one pill per theme
- Styling: active pills use theme color background; inactive pills use dimmed/outlined style

### Frontend — Smart Default
- In App.svelte, during navigation context load: if `filterThemeIds` is empty/undefined AND no incoming theme from cross-view nav, call `GetYearFocus()` with current year, find today's entry, use its `themeId` if set

## Implementation Strategy

Three sequential tasks — the Go struct change is a prerequisite for the frontend work, and the component depends on the state plumbing.

## Task Breakdown Preview

- [ ] Task 1: Update Go NavigationContext struct with FilterThemeIDs and backward-compat migration
- [ ] Task 2: Frontend — state model change, ThemeFilterBar component, EisenKanView integration, smart default, cross-view nav updates
- [ ] Task 3: Tests and final verification

## Dependencies

- Existing `ThemeBadge` component (styling reference for pills)
- Existing `getTheme`/`getThemeColor` shared utilities
- Existing navigation context persistence infrastructure
- `GetYearFocus` API for smart default

## Success Criteria (Technical)

- `make test` passes (all Go + frontend tests)
- `make lint` passes
- Theme pills visible in EisenKanView, multi-select works
- Filter persists in `~/.bearing/data/navigation_context.json` and restores on restart
- Navigating from OKRView "TSK" button sets single-theme filter
- First open with no persisted filter defaults to today's calendar theme
- Old navigation_context.json files with `filterThemeId` string are migrated gracefully

## Tasks Created
- [ ] 001.md - Update Go NavigationContext struct with FilterThemeIDs (parallel: false)
- [ ] 002.md - Frontend — ThemeFilterBar component, state plumbing, smart default (parallel: false)
- [ ] 003.md - Tests and final verification (parallel: false)

Total tasks: 3
Parallel tasks: 0
Sequential tasks: 3 (001 → 002 → 003)
Estimated total effort: 6 hours

## Estimated Effort

- 3 tasks, moderate complexity
- Single-session implementation
- Task 2 is the largest (new component + integration across multiple files)
