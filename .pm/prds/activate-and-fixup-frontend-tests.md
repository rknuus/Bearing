---
name: activate-and-fixup-frontend-tests
description: Establish automated frontend testing with Vitest, svelte-testing-library, and Playwright E2E
status: backlog
created: 2026-02-07T16:18:23Z
---

# PRD: activate-and-fixup-frontend-tests

## Executive Summary

Bearing's frontend has zero automated test coverage. The only test file (`id-parser.test.ts`) uses a custom browser-console runner and cannot be executed by CI or `make` commands. This PRD establishes a complete frontend testing stack — unit tests with Vitest, component tests with svelte-testing-library, and E2E tests with Playwright — and migrates existing manual tests into the automated framework. The initial scope focuses on infrastructure setup plus tests for the most critical code paths, creating a foundation that future development can build on.

## Reference Implementation

The directory `tmp/eisenkan/frontend` contains a working test setup for a similar Wails v2 + Svelte 5 project. Use it as the primary reference for:

- **Vitest config**: `tmp/eisenkan/frontend/vitest.config.ts` — separate from `vite.config.ts`, uses `jsdom` environment, `svelte()` plugin with `configFile: false`, `resolve.conditions: ['browser']`
- **Vitest setup**: `tmp/eisenkan/frontend/vitest.setup.ts` — polyfills `HTMLDialogElement.showModal()` and `.close()` for jsdom
- **Unit test patterns**: `tmp/eisenkan/frontend/src/lib/components/ErrorDialog.test.ts` — helper functions, `tick()` for Svelte reactivity, `vi.fn()` for mocks, `it.each` for parameterized tests
- **E2E test structure**: `tmp/eisenkan/tests/ui-component/` — separate directory with own `package.json`, custom `TestReporter`, `test-helpers.js` with server readiness checks
- **E2E test patterns**: Custom Playwright runner scripts (not `@playwright/test` CLI), `chromium.launch()` with configurable headless mode
- **Make targets**: `test-ui-unit`, `test-ui-component`, `test-ui-component-headless`, `test-ui-component-install`
- **Dependencies**: `vitest ^2.0.0`, `@testing-library/svelte ^5.3.1`, `jsdom ^27.4.0`, `@playwright/test ^1.56.1`

Follow these patterns unless there is a clear reason to deviate.

## Problem Statement

**What problem are we solving?**

Frontend regressions can only be caught by manual testing. The three main views (OKRView, CalendarView, EisenKanView) contain complex state management, recursive rendering, and CRUD operations with no automated verification. The project's CLAUDE.md mandates "ensure all tests pass" and "cover new/changed code by tests," but there is no frontend test infrastructure to support this.

**Why is this important now?**

- The backend has comprehensive test coverage (unit, integration, performance, benchmark tests), but the frontend has none — creating an asymmetric quality gap.
- The existing `id-parser.test.ts` manual tests prove the need exists — someone wrote tests but had no framework to automate them.
- The `wails-mock.ts` (614 lines) already provides a complete mock of the Go backend API, making component and E2E testing feasible without the native runtime.
- As the frontend grows (three large views already totaling ~70KB of Svelte code), the cost of not having tests compounds with each change.

## User Stories

### US-1: Developer runs frontend unit tests via make command

**As a** developer working on Bearing,
**I want to** run `make test-ui-unit` and get automated test results,
**So that** I can verify my changes don't break existing functionality before committing.

**Acceptance Criteria:**
- `make test-ui-unit` runs TypeScript checks then executes Vitest unit/component tests
- Tests run in under 30 seconds for the initial test suite
- Exit code is non-zero on failure (compatible with CI)
- Test output clearly shows pass/fail status per test

### US-2: Developer writes a unit test for utility code

**As a** developer adding or modifying utility functions,
**I want to** write standard Vitest tests alongside the source code,
**So that** pure logic is tested without DOM or component overhead.

**Acceptance Criteria:**
- `.test.ts` files co-located with source are auto-discovered by Vitest
- TypeScript and path aliases work in test files
- Wails-generated files in `frontend/src/lib/wails/` are excluded from test discovery

### US-3: Developer writes a component test for a Svelte 5 component

**As a** developer modifying a Svelte component,
**I want to** render the component in a test environment and assert on its output and behavior,
**So that** I can verify component logic, rendering, and user interactions.

**Acceptance Criteria:**
- svelte-testing-library works with Svelte 5 runes mode
- Components that call Wails bindings can be tested using the existing mock infrastructure
- `$state`, `$derived`, and `$effect` work correctly in the test environment

### US-4: Developer runs E2E tests against the browser mock environment

**As a** developer making cross-cutting changes,
**I want to** run Playwright tests against the Vite dev server with mock bindings,
**So that** I can verify full user flows work end-to-end without the native Wails runtime.

**Acceptance Criteria:**
- `make test-ui-component` runs Playwright tests (requires `make frontend-dev` running in another terminal)
- `make test-ui-component-headless` runs Playwright tests in headless mode
- Tests run against `localhost:5173` with mock bindings
- At least one E2E test verifies a critical path (e.g., creating a theme, navigating views)

### US-5: Existing manual tests are migrated

**As a** developer,
**I want** the existing `id-parser.test.ts` manual tests migrated to Vitest,
**So that** all test knowledge is captured in the automated framework and the manual runner is removed.

**Acceptance Criteria:**
- All test cases from `id-parser.test.ts` are present in the Vitest version
- The manual `window.runIdParserTests()` browser-console runner is removed
- Tests pass and cover the same assertions as before

## Requirements

### Functional Requirements

#### FR-1: Vitest Setup
- Install `vitest`, `@testing-library/svelte`, and `jsdom` as dev dependencies in `frontend/package.json`
- Create `frontend/vitest.config.ts` (separate from `vite.config.ts`, following the EisenKan pattern)
- Create `frontend/vitest.setup.ts` for DOM polyfills (e.g., `HTMLDialogElement`)
- Configure `resolve.conditions: ['browser']` for proper Svelte resolution
- Use `svelte()` plugin with `configFile: false` to disable `vitePreprocess` in tests
- Add `"test"` script to `frontend/package.json`: `"test": "vitest"`
- Exclude `frontend/src/lib/wails/` from test discovery

#### FR-2: Svelte Component Testing Setup
- Verify Svelte 5 runes mode compatibility with `@testing-library/svelte` in jsdom environment
- Create a test helper/setup file that configures mock Wails bindings for component tests
- Use `tick()` from `svelte` for waiting on reactivity in tests (as in EisenKan reference)

#### FR-3: Migrate id-parser Tests
- Rewrite `frontend/src/lib/utils/id-parser.test.ts` as Vitest tests using `describe`/`it`/`expect`
- Remove the manual `window.runIdParserTests()` runner and any browser-console test infrastructure
- Preserve all existing test cases and assertions

#### FR-4: Add Foundation Component Tests
- Add at least one smoke test for each reusable component (`Breadcrumb`, `ThemeBadge`, `ThemedContainer`)
- Add at least one meaningful test for a view component (e.g., OKRView renders a theme's objectives)
- Follow the EisenKan pattern: helper functions for DOM queries, `beforeEach`/`afterEach` for setup/cleanup

#### FR-5: Playwright E2E Setup
- Create `tests/ui-component/` directory with its own `package.json` (containing `@playwright/test` dependency)
- Create `tests/ui-component/test-helpers.js` with `TEST_CONFIG`, `TestReporter`, `waitForServers` (following EisenKan pattern)
- Create `tests/ui-component/run-all-tests.js` as the test runner entry point
- Create at least one E2E test that exercises a critical user flow against the mock environment
- E2E tests run against `localhost:5173` (the Vite dev server with mock bindings)

#### FR-6: Wails Mock Integration for Tests
- Adapt or wrap `wails-mock.ts` so it can be used in Vitest component tests (not just browser runtime)
- Ensure mock bindings can be reset between tests to prevent state leakage

#### FR-7: Makefile Targets
Add the following targets under the existing `##@ Testing` section:

| Target | Description |
|--------|-------------|
| `test-ui-unit` | Run TypeScript type checking, then run Vitest unit tests (`cd frontend && npm run check && npm test -- --run`) |
| `test-ui-component-install` | Install Playwright test dependencies and browsers (`cd tests/ui-component && npm install && npx playwright install chromium`) |
| `test-ui-component` | Run Playwright E2E tests (requires `make frontend-dev` running) |
| `test-ui-component-headless` | Run Playwright E2E tests in headless mode (`HEADLESS=true`) |

Update the existing `test-frontend` target to run `test-ui-unit` (replacing the current TypeScript-check-only behavior). Update `setup` target to include `test-ui-component-install`.

#### FR-8: Gitignore Updates
Add the following entries to `.gitignore`:

```
# Test artifacts
frontend/coverage/
tests/ui-component/node_modules/
tests/ui-component/test-results/
tests/ui-component/playwright-report/
```

### Non-Functional Requirements

#### NFR-1: Performance
- Unit/component test suite completes in under 30 seconds
- E2E test suite completes in under 2 minutes

#### NFR-2: Developer Experience
- Tests can be run in watch mode during development (`vitest --watch`)
- Clear error messages when tests fail
- No special setup beyond `npm install` required for unit tests
- `make test-ui-component-install` handles Playwright browser installation

#### NFR-3: Compatibility
- Must work with Svelte 5 runes mode (`compilerOptions.runes: true`)
- Must not interfere with the existing Vite build configuration
- Must not introduce runtime dependencies (all test deps are devDependencies)

## Success Criteria

1. `make test-ui-unit` runs and passes with at least 10 unit/component test cases
2. `make test-ui-component` runs and passes with at least 1 E2E test
3. All migrated id-parser tests pass
4. At least one Svelte component renders successfully in the test environment
5. The existing `make frontend-lint` and `make frontend-check` continue to pass
6. No regressions in the native Wails app or browser mock environment
7. Test artifacts are excluded from git via `.gitignore`

## Constraints & Assumptions

### Constraints
- Svelte 5 runes mode is non-negotiable — testing libraries must support it
- The `wails-mock.ts` mock bindings are the primary mechanism for isolating frontend from backend; no real Go backend calls in tests
- Must follow existing project patterns (co-located test files, `make` commands, TypeScript strict mode)
- Follow the EisenKan reference patterns (`tmp/eisenkan/frontend`) unless there is a clear reason to deviate

### Assumptions
- `@testing-library/svelte` supports Svelte 5 runes (verify during implementation; fall back to alternative if not)
- `jsdom` can handle the DOM APIs used by the Svelte components (polyfill gaps like `HTMLDialogElement` in setup file)
- Playwright can connect to the Vite dev server started separately via `make frontend-dev`

## Out of Scope

- **Visual regression testing** (screenshots, Percy, Chromatic)
- **Comprehensive test coverage** for all views and all user flows — this effort establishes foundation + key paths only
- **CI/CD pipeline integration** — tests are run locally via `make`; CI integration is a future concern
- **Performance/load testing** of the frontend
- **Testing the native Wails WebView runtime** — all tests run against browser/jsdom environments
- **Backend test changes** — Go test infrastructure is already mature

## Dependencies

### External
- `vitest ^2.0.0` — unit/component test runner (compatible with Vite)
- `@testing-library/svelte ^5.3.1` — Svelte component testing utilities
- `jsdom ^27.4.0` — DOM environment for component tests
- `@playwright/test ^1.56.1` — E2E test framework (in separate `tests/ui-component/package.json`)

### Internal
- `tmp/eisenkan/frontend` — reference implementation for test patterns and configuration
- `frontend/src/lib/wails-mock.ts` — existing mock bindings, may need adaptation for Vitest usage
- `frontend/src/lib/utils/id-parser.ts` — source for migrated tests
- `Makefile` — needs new targets (`test-ui-unit`, `test-ui-component`, `test-ui-component-headless`, `test-ui-component-install`)
- `frontend/package.json` — needs new scripts and devDependencies
- `.gitignore` — needs test artifact exclusions
