---
name: add-missing-ui-tests
description: Add unit tests for CalendarView, EisenKanView, App.svelte, and expand E2E test suite
status: backlog
created: 2026-02-08T11:51:04Z
---

# PRD: add-missing-ui-tests

## Executive Summary

Bearing's frontend has unit tests for 3 of 7 components/views and minimal E2E coverage (basic navigation only). CalendarView, EisenKanView, and App.svelte have zero unit tests. This PRD defines the scope for achieving full behavioral test coverage across all views and expanding E2E tests to cover real user workflows, providing regression safety as the application evolves.

## Problem Statement

Current test coverage has significant gaps:

| Component | Unit Tests | E2E Coverage |
|-----------|-----------|--------------|
| Breadcrumb | 6 tests | - |
| ThemeBadge | 4 tests | - |
| ThemedContainer | 3 tests | - |
| id-parser | 24 tests | - |
| OKRView | 9 tests | - |
| **CalendarView** | **0 tests** | **none** |
| **EisenKanView** | **0 tests** | **none** |
| **App.svelte** | **0 tests** | **basic nav only** |

The three untested views contain complex behavior: CalendarView has a 12-month grid with edit modals and year navigation; EisenKanView has drag-and-drop, priority sorting, context menus, and optimistic updates; App.svelte has keyboard shortcuts, cross-view navigation, and state persistence. Any regression in these areas goes undetected.

The existing Playwright E2E suite only verifies that the app loads and nav links switch views — it doesn't test any actual user workflows like creating tasks, editing calendar days, or navigating between views via cross-links.

## User Stories

### US1: Developer modifying CalendarView
**As a** developer changing CalendarView logic,
**I want** unit tests that verify day editing, year navigation, and theme legend behavior,
**So that** I catch regressions before they reach the app.

**Acceptance Criteria:**
- Tests verify the calendar grid renders 12 months with correct day counts
- Tests verify opening/saving/canceling the day edit modal
- Tests verify year navigation (prev/next/today)
- Tests verify theme legend renders with correct colors
- Tests verify error state shows retry button
- Tests verify clearing a day focus (empty theme + text)

### US2: Developer modifying EisenKanView
**As a** developer changing task management logic,
**I want** unit tests that verify task CRUD, drag-and-drop columns, and priority sorting,
**So that** task workflows remain correct.

**Acceptance Criteria:**
- Tests verify three columns render (todo, doing, done)
- Tests verify creating a task via the dialog
- Tests verify task cards show theme color, priority, and action buttons
- Tests verify moving tasks between columns updates state
- Tests verify priority auto-sorting in the todo column
- Tests verify delete with optimistic update
- Tests verify error banner appears and can be dismissed
- Tests verify filtering by theme and date

### US3: Developer modifying App.svelte navigation
**As a** developer changing navigation or routing logic,
**I want** unit tests for keyboard shortcuts, cross-view navigation, and state persistence,
**So that** navigation behavior is regression-proof.

**Acceptance Criteria:**
- Tests verify keyboard shortcuts (Cmd/Ctrl+1/2/3) switch views
- Tests verify Backspace navigates up (clear filter, then go home)
- Tests verify cross-view navigation callbacks (navigateToTheme, navigateToDay, navigateToTasks)
- Tests verify navigation context is saved on view change
- Tests verify navigation context is restored on mount

### US4: Developer verifying end-to-end workflows
**As a** developer releasing a new version,
**I want** E2E tests that exercise real user workflows across views,
**So that** I have confidence the integrated application works correctly.

**Acceptance Criteria:**
- E2E test: create a theme in OKR view, verify it appears in calendar theme legend
- E2E test: assign a day focus in calendar, navigate to tasks view filtered by that theme
- E2E test: create a task, drag it from todo to doing, verify column change
- E2E test: use keyboard shortcuts to navigate between views
- E2E test: verify navigation state persists across page reload

## Requirements

### Functional Requirements

#### FR1: CalendarView Unit Tests
- Render calendar grid with mock theme and focus data
- Open edit modal by clicking a day cell
- Save day focus with theme + text
- Clear day focus when both fields are empty
- Navigate years with prev/next buttons
- "Today" button resets to current year
- Cancel edit via Escape key and overlay click
- Theme legend displays all themes with correct colors
- Error state renders with retry action
- Loading state renders during data fetch

#### FR2: EisenKanView Unit Tests
- Render three Kanban columns with mock task data
- Open create dialog, fill form, submit
- Validate disabled submit when title is empty
- Task cards display theme color border, priority label, date
- Delete task triggers optimistic removal
- Priority sorting: Q1 > Q2 > Q3 in todo column
- Filter tasks by theme ID prop
- Filter tasks by date prop
- Error banner renders and dismisses
- Context menu renders with navigation options

#### FR3: App.svelte Unit Tests
- View routing: each nav link renders the correct view
- Keyboard shortcuts dispatch correct navigation
- Cross-view navigation: navigateToTheme sets OKR view + item
- Cross-view navigation: navigateToDay sets Calendar view + filter
- Cross-view navigation: navigateToTasks sets EisenKan view + filter
- Breadcrumb reflects current view and active filters
- Navigation context loaded on mount
- Navigation context saved on view change

#### FR4: Expanded E2E Tests
- Full workflow: create theme → add objective → add key result
- Full workflow: edit calendar day → save → verify persistence
- Full workflow: create task → move across columns
- Cross-view: navigate from task context menu to theme in OKR view
- State persistence: navigate to a view, reload page, verify same view loads
- Keyboard navigation between views

### Non-Functional Requirements

- All unit tests must run in < 5 seconds total (Vitest + jsdom)
- E2E tests must run in < 30 seconds total (Playwright headless)
- Tests must use the existing mock bindings from `wails-mock.ts` — no new mock infrastructure
- Tests must follow existing patterns (see OKRView.test.ts for unit test conventions, app-lifecycle.test.js for E2E conventions)
- No flaky tests: avoid timing-dependent assertions; use `waitFor` / `findBy` for async renders

## Success Criteria

- All 7 frontend views/components have unit tests (currently 4/7)
- CalendarView has >= 8 test cases covering render, edit, navigation, error states
- EisenKanView has >= 10 test cases covering CRUD, drag-drop, sorting, filtering
- App.svelte has >= 6 test cases covering routing, shortcuts, persistence
- E2E suite has >= 4 workflow tests beyond the existing 3 lifecycle tests
- `make test-frontend` passes with 0 failures
- `make test-frontend-e2e-headless` passes with 0 failures

## Constraints & Assumptions

- **Testing framework**: Vitest + @testing-library/svelte for unit tests, Playwright for E2E
- **Mock data**: Reuse seed data from `wails-mock.ts` — tests run against the same mock bindings used for browser dev
- **Drag-and-drop**: Playwright can simulate drag events; Vitest/jsdom has limited drag support — test drag logic at the state level in unit tests, full interaction in E2E
- **Keyboard events**: jsdom supports `KeyboardEvent` dispatch for unit testing shortcuts
- **No backend changes**: All tests use existing mock infrastructure

## Out of Scope

- Backend Go test additions (already well-covered)
- Visual regression / screenshot testing
- Performance / load testing of the frontend
- Testing the ComponentDemo.svelte (demo-only, not user-facing)
- Accessibility (a11y) audit — valuable but separate effort
- Testing actual Wails runtime integration (native WebView) — covered by manual testing

## Dependencies

- Existing mock bindings in `frontend/src/lib/wails-mock.ts` must remain stable
- Playwright browsers installed (`make test-frontend-e2e-install`)
- Vite dev server for E2E tests (`make frontend-dev`)
