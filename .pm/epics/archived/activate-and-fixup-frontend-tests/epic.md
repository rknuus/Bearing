---
name: activate-and-fixup-frontend-tests
status: completed
created: 2026-02-07T16:29:52Z
completed: 2026-02-07T17:01:43Z
progress: 100%
prd: .pm/prds/activate-and-fixup-frontend-tests.md
github: https://github.com/rknuus/Bearing/issues/42
---

# Epic: activate-and-fixup-frontend-tests

## Overview

Establish automated frontend testing for Bearing by installing Vitest + jsdom for unit/component tests and Playwright for E2E tests, following the proven patterns from `tmp/eisenkan/frontend`. Migrate the existing manual `id-parser.test.ts` to Vitest, add foundation component tests, create one E2E smoke test, and wire everything into `make` targets.

## Architecture Decisions

- **Separate `vitest.config.ts`**: Keep test config separate from `vite.config.ts` to avoid polluting the build config with test-only settings (jsdom environment, setup files, `configFile: false` for Svelte plugin). This matches the EisenKan pattern.
- **jsdom over happy-dom**: EisenKan reference uses jsdom — stick with it for consistency and broader DOM API support. Polyfill gaps (e.g., `HTMLDialogElement`) in `vitest.setup.ts`.
- **E2E tests in separate `tests/ui-component/` directory**: Own `package.json` with `@playwright/test` keeps Playwright's heavy dependencies out of the frontend package. Custom runner scripts (not `@playwright/test` CLI) provide control over server readiness checks and reporting.
- **E2E tests run against `localhost:5173`**: Bearing's `make frontend-dev` already starts Vite on port 5173 with mock bindings. No need for a separate port since Bearing doesn't have a native `wails dev` running concurrently during E2E testing.
- **Co-located test files**: `.test.ts` files sit next to their source files, matching the existing `id-parser.test.ts` convention and the EisenKan unit test pattern.

## Technical Approach

### Unit/Component Testing (Vitest)

**New files:**
- `frontend/vitest.config.ts` — Vitest config with jsdom, Svelte plugin (`configFile: false`), `resolve.conditions: ['browser']`
- `frontend/vitest.setup.ts` — HTMLDialogElement polyfill (from EisenKan reference)

**Modified files:**
- `frontend/package.json` — Add `vitest`, `@testing-library/svelte`, `jsdom` as devDeps; add `"test": "vitest"` script
- `frontend/src/lib/utils/id-parser.test.ts` — Rewrite from manual runner to Vitest `describe`/`it`/`expect`

**Key consideration:** The existing `id-parser.test.ts` imports from `../wails/wailsjs/go/models` for `main.LifeTheme`, `main.Objective`, `main.KeyResult`. These are Wails-generated types. In the Vitest jsdom environment, these imports must resolve. Since these are plain TypeScript classes (not runtime bindings), they should work as-is — but this needs verification.

### E2E Testing (Playwright)

**New files:**
- `tests/ui-component/package.json` — `@playwright/test` dependency, `"test"` script
- `tests/ui-component/test-helpers.js` — `TEST_CONFIG` (pointing to `localhost:5173`), `TestReporter`, `waitForServers`
- `tests/ui-component/run-all-tests.js` — Entry point that imports and runs individual test files
- `tests/ui-component/<test-file>.test.js` — At least one E2E test (e.g., app lifecycle: verify views load, navigation works)

### Infrastructure

**Modified files:**
- `Makefile` — Add `test-ui-unit`, `test-ui-component`, `test-ui-component-headless`, `test-ui-component-install` targets; update `test-frontend` to call `test-ui-unit`; update `setup` to include `test-ui-component-install`
- `.gitignore` — Add `frontend/coverage/`, `tests/ui-component/node_modules/`, `tests/ui-component/test-results/`, `tests/ui-component/playwright-report/`

## Implementation Strategy

**Phase 1 (Tasks 43, 45, 47):** Infrastructure — install deps, create configs, add make targets, update gitignore. Verify Vitest runs with a trivial test.

**Phase 2 (Tasks 44, 46):** Migrate existing tests and add foundation unit/component tests. Verify Svelte 5 runes work in test environment.

**Phase 3 (Tasks 48, 49):** Set up Playwright E2E, create one smoke test. Verify end-to-end against mock environment.

**Risk mitigation:**
- `@testing-library/svelte` may not fully support Svelte 5 runes — verify early in Phase 1 with a minimal component render test. If broken, fall back to direct `mount()` from Svelte.
- Wails-generated model imports in tests — verify they resolve in jsdom. If not, create lightweight test fixtures that don't depend on generated code.

## Tasks Created

- [ ] 43.md - Install Vitest dependencies and create config files (parallel: true)
- [ ] 45.md - Add Makefile targets and gitignore entries (parallel: true)
- [ ] 47.md - Migrate id-parser tests from manual runner to Vitest (depends: 43)
- [ ] 44.md - Add foundation component smoke tests (depends: 43, parallel: true)
- [ ] 46.md - Set up Playwright E2E infrastructure (depends: 45, parallel: true)
- [ ] 48.md - Create E2E smoke test for app lifecycle (depends: 46)
- [ ] 49.md - End-to-end verification and fixups (depends: 47, 44, 48)

Total tasks: 7
Parallel tasks: 4 (43, 45, 44, 46)
Sequential tasks: 3 (47, 48, 49)
Estimated total effort: 10-16 hours

## Dependencies

- **`tmp/eisenkan/frontend`** — Reference implementation (read-only, patterns to follow)
- **`frontend/src/lib/wails-mock.ts`** — May need minor adaptation for Vitest component tests (mock reset between tests)
- **`frontend/src/lib/wails/wailsjs/go/models`** — Wails-generated types used in existing test fixtures; must resolve in Vitest

## Success Criteria (Technical)

1. `make test-ui-unit` passes with migrated id-parser tests (covers ~30 assertions) plus at least 3 component smoke tests
2. `make test-ui-component` passes with at least 1 E2E test against `localhost:5173`
3. `make frontend-lint` and `make frontend-check` still pass (no regressions)
4. `git status` shows no test artifacts (gitignore works)
5. Unit test suite completes in under 30 seconds

## Estimated Effort

- **7 tasks**, roughly ordered by dependency
- Tasks 43, 45 are pure infrastructure (config, no test logic)
- Tasks 47, 44 are the core unit testing work
- Tasks 46, 48 are the E2E layer
- Task 49 is integration verification
