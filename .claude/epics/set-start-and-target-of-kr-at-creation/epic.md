---
name: set-start-and-target-of-kr-at-creation
status: completed
created: 2026-02-07T19:44:16Z
progress: 100%
prd: .claude/prds/set-start-and-target-of-kr-at-creation.md
github: https://github.com/rknuus/Bearing/issues/55
---

# Epic: set-start-and-target-of-kr-at-creation

## Overview

Extend the `CreateKeyResult` API to accept optional `startValue` and `targetValue` parameters, and expand the frontend KR creation form to a two-row layout exposing these fields. This is a small, vertical-slice change touching the manager interface, implementation, Wails binding, frontend form, and mock bindings.

## Architecture Decisions

- **Extend existing function signature** rather than adding a separate method. `CreateKeyResult` gains two int parameters (`startValue`, `targetValue`). Go doesn't have optional parameters, so callers always pass all args (0 for untracked).
- **No new API endpoint** — this modifies the existing `CreateKeyResult` path end-to-end.
- **No CSS changes needed** — the existing `.new-item-form` with `flex-wrap: wrap` already supports multi-row layouts.

## Technical Approach

### Backend
- `IPlanningManager.CreateKeyResult(parentObjectiveId, description string, startValue, targetValue int)` — add two int params.
- `PlanningManager.CreateKeyResult` — pass `startValue`/`targetValue` into the `access.KeyResult` struct on line 357.
- `App.CreateKeyResult` Wails binding — add params, forward to manager.
- Update existing unit tests in `planning_manager_test.go` to pass the new params (0, 0 for existing tests; add one test with non-zero values).

### Frontend
- Add `newKeyResultStartValue` and `newKeyResultTargetValue` state variables (default 0).
- Expand the KR creation form (`addingKeyResultToObjective` block) to two rows: description on row 1, Start/Target inputs + Create/Cancel on row 2.
- Update `createKeyResult()` to pass the new values to `getBindings().CreateKeyResult()` and reset them on success.
- Enter in description field still triggers create (existing behavior preserved).

### Mock Bindings
- Update `CreateKeyResult` in `wails-mock.ts` to accept `startValue`/`targetValue` and store them on the new KR object.

## Task Breakdown Preview

- [ ] Task 1: Extend CreateKeyResult backend API and update frontend form + mock bindings

This is a single cohesive change — the backend signature, frontend form, and mock must change together for the app to compile and work. Splitting further would leave the app in a broken intermediate state.

## Dependencies

- `measure-okr-progress` epic (completed, merged) — provides the `StartValue`/`CurrentValue`/`TargetValue` fields on `KeyResult`.

## Success Criteria (Technical)

- `make backend-test` passes with updated and new test cases.
- `make frontend-lint` and `make frontend-check` pass.
- `make frontend-build` succeeds.
- Creating a KR via mock bindings (localhost:5173) with target=1 renders checkbox; with target=10 renders progress bar; with no values renders untracked.

## Tasks Created

- [ ] #56 - Extend CreateKeyResult API with start/target and update frontend form

Total tasks: 1
Estimated total effort: S

## Estimated Effort

- 1 task, small scope (~30 lines changed across 5 files).
