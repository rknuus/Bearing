---
name: measure-okr-progress
status: completed
created: 2026-02-07T19:09:12Z
progress: 100%
prd: .pm/prds/measure-okr-progress.md
github: https://github.com/rknuus/Bearing/issues/51
---

# Epic: Measure OKR Progress

## Overview

Add `startValue`, `currentValue`, and `targetValue` integer fields to the KeyResult model. Binary KRs (target=1) render as checkboxes, numeric KRs render as "current / target" with a progress bar. Over-achievement (current > target) gets distinct styling. Untracked KRs (target=0) display as today. No data migration needed — zero defaults mean "not configured".

## Architecture Decisions

- **Extend existing KeyResult model** rather than creating a new entity. Three new `int` fields with zero defaults provide backward compatibility with no migration.
- **Extend existing `UpdateKeyResult` signature** to accept progress values rather than adding a separate method. The current signature is `UpdateKeyResult(keyResultId, description string)` — change to accept the full KR struct (or add the three int parameters). This keeps the API surface minimal.
- **Progress computation is frontend-only**: The backend stores raw values. The frontend computes percentage (`(current - start) / (target - start) * 100`) and decides rendering mode (checkbox vs. progress bar) based on `targetValue`.
- **Inline editing for `currentValue` only**: Setting `startValue`/`targetValue` happens in the KR edit flow (where description is edited). Updating `currentValue` is a quick action — checkbox toggle or inline number input — that doesn't require opening the full edit form.

## Technical Approach

### Backend (Go)

1. **Model change** (`internal/access/models.go`): Add three fields to `KeyResult`:
   ```go
   StartValue   int `json:"startValue"`
   CurrentValue int `json:"currentValue"`
   TargetValue  int `json:"targetValue"`
   ```
2. **Wails binding type** (`main.go`): Add matching fields to the `KeyResult` struct.
3. **`UpdateKeyResult` signature change**: Extend to pass progress values. Options:
   - `UpdateKeyResult(keyResultId, description string, startValue, currentValue, targetValue int)` — explicit but verbose
   - Or add a dedicated `UpdateKeyResultProgress(keyResultId string, currentValue int)` for quick updates
   - Decision: Add `UpdateKeyResultProgress(keyResultId string, currentValue int)` as a separate lightweight method for quick progress updates, keeping `UpdateKeyResult` for description edits. The KR edit dialog will set start/target via the existing `UpdateTheme` path (full theme save).

### Frontend (Svelte)

1. **Type update** (`OKRView.svelte`): Add `startValue`, `currentValue`, `targetValue` to `KeyResult` interface.
2. **KR rendering** (`OKRView.svelte`): In the KR item template, after the description:
   - `targetValue == 0`: No indicator (current behavior).
   - `targetValue == 1 && startValue == 0`: Checkbox, toggles `currentValue` between 0 and 1.
   - `targetValue > 1`: Compact progress bar + "current / target" label.
   - `currentValue > targetValue`: Over-achievement color/style.
3. **KR edit form**: Add optional `startValue` and `targetValue` inputs alongside the description field.
4. **Quick progress update**: Clicking checkbox or changing the number input calls `UpdateKeyResultProgress`.

### Mock Bindings

- Add `startValue`, `currentValue`, `targetValue` to mock KR data.
- Add `UpdateKeyResultProgress` mock implementation.
- Update `CreateKeyResult` mock to initialize progress fields to 0.

## Implementation Strategy

- **Phase 1** (Task 1): Backend model + new method + tests
- **Phase 2** (Task 2): Frontend rendering + editing + mock bindings
- **Phase 3** (Task 3): Integration verification

Linear dependency chain — each task builds on the previous.

## Task Breakdown Preview

- [ ] Task 1: Extend KeyResult model with progress fields (Go models, Wails binding struct), add `UpdateKeyResultProgress` method through access → manager → App binding, add unit tests.
- [ ] Task 2: Frontend — update KR type, add progress rendering (checkbox / progress bar / over-achievement), add inline currentValue editing, extend KR edit form with start/target fields, update mock bindings and mock data.
- [ ] Task 3: End-to-end verification — run all make targets, verify backward compatibility with existing KRs, test binary toggle, numeric progress, over-achievement display.

## Dependencies

- `KeyResult` struct in `internal/access/models.go` (modified)
- `KeyResult` Wails binding struct in `main.go` (modified)
- `UpdateKeyResult` in `PlanningManager` (kept for description, new method for progress)
- `OKRView.svelte` KR rendering section (modified)
- `wails-mock.ts` mock bindings (modified)

## Success Criteria (Technical)

- Existing KRs with no progress data load and display unchanged (zero defaults).
- New KRs can be created with start/target values via the edit form.
- Binary KRs (target=1) render as checkboxes; toggling calls `UpdateKeyResultProgress` and persists.
- Numeric KRs show "current / target" with a proportional progress bar.
- Over-achievement (current > target) has distinct visual treatment.
- All existing tests pass; new tests cover: progress update, zero-default backward compat, binary toggle.
- Both native (Wails) and browser (mock bindings) environments work correctly.

## Estimated Effort

- **Total**: 3 tasks, S-M size each
- **Critical path**: Task 1 (backend) → Task 2 (frontend) → Task 3 (verification)

## Tasks Created

- [ ] #52 - Extend KeyResult model and add UpdateKeyResultProgress backend method (parallel: false)
- [ ] #53 - Frontend progress rendering, editing, and mock bindings (parallel: false, depends: #52)
- [ ] #54 - End-to-end verification and fixups (parallel: false, depends: #52, #53)

Total tasks: 3
Parallel tasks: 0
Sequential tasks: 3
Estimated total effort: 4-7 hours
