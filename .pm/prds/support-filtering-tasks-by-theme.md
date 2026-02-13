---
name: support-filtering-tasks-by-theme
description: Add clickable theme pill/chip UI to EisenKanView for filtering tasks by one or more themes
status: backlog
created: 2026-02-13T15:28:09Z
---

# PRD: support-filtering-tasks-by-theme

## Executive Summary

Add a row of clickable, colored theme pills/chips to the EisenKanView that lets users filter the task board by one or more life themes. When themes are selected, only tasks belonging to those themes are shown. The selection supports multi-toggle (click to add/remove themes) and persists across sessions via the existing navigation context.

## Problem Statement

Users of the Eisenhower/Kanban task board see all tasks from all themes at once. As task count grows, the board becomes noisy and hard to focus on. There is no UI to filter by theme — the `filterThemeId` prop exists but can only be set by navigating from OKRView or CalendarView, and it supports only a single theme. Users need a direct, in-view control to focus on one or more themes at a time.

## User Stories

### US-1: Filter tasks by clicking theme pills
**As a** user viewing the EisenKanView,
**I want to** click theme-colored pills to filter the board to specific themes,
**So that** I can focus on tasks relevant to a particular area of my life.

**Acceptance Criteria:**
- A row of theme pills appears above the task board, one per theme
- Each pill shows the theme color and abbreviated ID (or short name)
- Clicking a pill toggles it on (active filter) or off
- Multiple themes can be active simultaneously
- When one or more pills are active, only tasks with matching `themeId` are shown
- When no pills are active, all tasks are shown (no filter)
- Visual distinction between active and inactive pills (e.g., full color vs dimmed/outlined)

### US-2: Clear all theme filters
**As a** user with active theme filters,
**I want to** quickly clear all filters to see all tasks again,
**So that** I don't have to click each pill individually.

**Acceptance Criteria:**
- A "clear all" mechanism exists (e.g., an "All" pill or a clear button)
- Clicking it deselects all theme pills and shows all tasks
- The clear control is visually distinct from theme pills

### US-3: Persist theme filter selection across sessions
**As a** user who filters by specific themes regularly,
**I want** my filter selection to persist when I leave and return to EisenKanView,
**So that** I don't have to re-select my preferred themes every time.

**Acceptance Criteria:**
- Selected theme IDs are saved to the navigation context file (`~/.bearing/data/navigation_context.json`)
- On app restart, opening EisenKanView restores the previously persisted theme filter selection
- Switching to another view and back also restores the selection

### US-3a: Smart default on first open
**As a** user opening EisenKanView for the first time (no persisted filter),
**I want** the view to default to today's calendar theme if one is set,
**So that** I immediately see the tasks most relevant to my day.

**Acceptance Criteria:**
- On first open (no persisted `filterThemeIds` in navigation context), look up today's date in the DayFocus/year-focus data
- If today has an assigned theme, pre-select that single theme pill
- If today has no assigned theme, show all tasks (no filter active)
- Once the user manually changes the filter, persistence takes over and this default no longer applies

### US-4: Theme pills reflect available themes
**As a** user who adds or removes life themes,
**I want** the pill bar to automatically reflect the current set of themes,
**So that** filters stay in sync with my theme configuration.

**Acceptance Criteria:**
- Pills are dynamically generated from the loaded themes list
- If a persisted filter references a deleted theme, it is silently ignored
- New themes appear as pills without requiring page reload

## Requirements

### Functional Requirements

**FR-1: Theme pill bar component**
- Horizontal row of pills rendered above the EisenKanView columns
- Each pill: theme color background (or border), theme ID/name text
- Active state: full color, visually prominent
- Inactive state: dimmed/outlined, clearly clickable
- An "All" pill (or clear button) to deselect all filters

**FR-2: Multi-select filter logic**
- Change `filterThemeId: string | undefined` to `filterThemeIds: string[]` in App.svelte
- EisenKanView's `filteredTasks` logic updated: if `filterThemeIds` is non-empty, show only tasks whose `themeId` is in the array; if empty, show all
- Pill click handler: toggle theme ID in/out of the array

**FR-3: Navigation context persistence**
- Update Go `NavigationContext` struct: change `FilterThemeID string` to `FilterThemeIDs []string`
- Update `SaveNavigationContext` / `LoadNavigationContext` to handle the array
- Frontend persists `filterThemeIds` array via navigation context on change
- On EisenKanView mount, restore from navigation context

**FR-4: Incoming theme from other views**
- OKRView has "TSK" buttons next to each theme that navigate the user to EisenKanView pre-filtered to that theme. CalendarView can similarly navigate to EisenKanView with a theme. These existing navigation paths currently set a single `filterThemeId`.
- Update these paths: when the user arrives at EisenKanView via one of these buttons, set `filterThemeIds` to `[thatThemeId]` (overriding any persisted selection)
- Existing `onNavigateToTheme` callbacks updated to work with the array model

**FR-5: Smart default from today's calendar theme**
- On first open (no persisted `filterThemeIds` in navigation context and no incoming theme from another view), load today's DayFocus entry
- If today has an assigned theme, initialize `filterThemeIds` to `[todayThemeId]`
- If today has no assigned theme, initialize `filterThemeIds` to `[]` (show all tasks)

### Non-Functional Requirements

**NFR-1: No backend filtering**
- Filtering remains client-side (all tasks loaded, filtered in view)
- No new Go API endpoints needed

**NFR-2: Responsive layout**
- Pill bar wraps gracefully if there are many themes
- Does not push the task board off-screen

**NFR-3: Accessible**
- Pills are keyboard-navigable and have appropriate aria labels

## Success Criteria

- Users can filter EisenKanView to any combination of themes via pill clicks
- Filter persists across view switches and app restarts
- Cross-view navigation (OKR → Tasks with theme filter) still works
- All existing tests pass (no regressions)
- New UI components are covered by tests

## Constraints & Assumptions

- EisenKanView only — CalendarView and OKRView are out of scope
- Client-side filtering (no backend `QueryCriteria` usage yet)
- The existing `filterDate` mechanism remains unchanged and works alongside theme filtering
- Theme pills use the existing `ThemeBadge` shared component style where possible
- Maximum ~10-15 themes expected; no virtualization needed for the pill bar

## Out of Scope

- CalendarView or OKRView theme filtering UI
- Full-text task search
- Tag-based filtering
- Backend query/filter API (QueryCriteria implementation)
- Combining theme filter with status/priority filters (future enhancement)

## Dependencies

- Existing `ThemeBadge` component (can be reused or adapted for pills)
- Existing navigation context persistence infrastructure
- `getTheme`/`getThemeColor` shared utilities (recently extracted)
