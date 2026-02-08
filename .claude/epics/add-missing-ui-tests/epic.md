---
name: add-missing-ui-tests
status: completed
created: 2026-02-08T11:54:19Z
completed: 2026-02-08T13:22:00Z
progress: 100%
prd: .claude/prds/add-missing-ui-tests.md
github: https://github.com/rknuus/Bearing/issues/70
---

# Epic: add-missing-ui-tests

## Overview

Add full behavioral unit test coverage for the 3 untested frontend views (CalendarView, EisenKanView, App.svelte) and expand the Playwright E2E suite with real user workflow tests. All unit tests follow the established OKRView.test.ts pattern: mock `window.go.main.App` bindings, render with @testing-library/svelte, assert on DOM selectors. E2E tests follow the app-lifecycle.test.js pattern: Playwright against Vite dev server with mock Wails bindings.

## Architecture Decisions

- **No new test infrastructure**: Reuse the existing `window.go.main.App` mock pattern from OKRView.test.ts. Each test file creates a `makeMockBindings()` that stubs only the APIs its view calls.
- **Drag-and-drop split**: Unit tests verify column state changes via programmatic calls; E2E tests verify actual drag interaction via Playwright.
- **Keyboard shortcuts**: Test via `dispatchEvent(new KeyboardEvent(...))` in jsdom unit tests; verify via `page.keyboard` in E2E.
- **Async rendering**: Use `vi.waitFor()` + `tick()` pattern established in OKRView.test.ts for all async data loading.

## Technical Approach

### Unit Tests (Vitest + @testing-library/svelte)

Each test file mirrors the OKRView.test.ts structure:
1. Fixture factory functions (`makeTestThemes()`, `makeTestTasks()`, etc.)
2. `makeMockBindings()` returning `vi.fn()` stubs for relevant APIs
3. `beforeEach` sets `window.go.main.App`, `afterEach` cleans up
4. `renderView()` helper that renders + waits for async loading to complete

**CalendarView.test.ts** — mock `GetThemes`, `GetYearFocus`, `SaveDayFocus`, `ClearDayFocus`:
- Grid rendering (12 months, correct day count)
- Day edit modal (open, save, cancel, clear)
- Year navigation (prev/next/today)
- Theme legend rendering
- Error + loading states

**EisenKanView.test.ts** — mock `GetTasks`, `GetThemes`, `CreateTask`, `MoveTask`, `DeleteTask`:
- Three-column layout with task cards
- Create task dialog (open, validate, submit)
- Priority sorting in todo column
- Delete with optimistic update
- Filter by theme/date props
- Error banner

**App.test.ts** — mock `LoadNavigationContext`, `SaveNavigationContext`, plus all view-level stubs:
- View routing via nav link clicks
- Keyboard shortcuts (Ctrl+1/2/3, Backspace)
- Cross-view navigation callbacks
- Navigation context persistence (load on mount, save on change)

### E2E Tests (Playwright)

New test file `tests/ui-component/view-workflows.test.js` following existing conventions:
- OKR workflow: create theme + objective + key result
- Calendar workflow: edit day focus, save, verify
- Task workflow: create task, move between columns
- Cross-view navigation and keyboard shortcuts
- State persistence across page reload

## Task Breakdown Preview

- [ ] Task 1: Add CalendarView unit tests (>=8 test cases)
- [ ] Task 2: Add EisenKanView unit tests (>=10 test cases)
- [ ] Task 3: Add App.svelte unit tests (>=6 test cases)
- [ ] Task 4: Add E2E workflow tests (>=4 test cases)
- [ ] Task 5: Verify all tests pass and update CI

## Dependencies

- Mock bindings in `frontend/src/lib/wails-mock.ts` (stable, read-only dependency)
- Playwright browsers installed via `make test-frontend-e2e-install`
- Vite dev server required for E2E tests (`make frontend-dev`)

## Success Criteria (Technical)

- `make test-frontend` passes — all unit tests green, 0 warnings
- `make test-frontend-e2e-headless` passes — all E2E tests green
- CalendarView >= 8 tests, EisenKanView >= 10 tests, App >= 6 tests, E2E >= 4 new workflow tests
- No flaky tests (deterministic async handling)
- Total unit test execution < 5s, E2E < 30s

## Estimated Effort

- 5 tasks, each self-contained and independently implementable
- Tasks 1-3 (unit tests) can be parallelized
- Task 4 (E2E) depends on views being stable but not on unit tests
- Task 5 is a verification pass

## Tasks Created
- [ ] #71 - Add CalendarView unit tests (parallel: true)
- [ ] #72 - Add EisenKanView unit tests (parallel: true)
- [ ] #73 - Add App.svelte unit tests (parallel: true)
- [ ] #74 - Add E2E workflow tests (parallel: true)
- [ ] #75 - Verify all tests pass and finalize (parallel: false, depends on #71-#74)

Total tasks: 5
Parallel tasks: 4
Sequential tasks: 1
