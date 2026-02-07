---
name: measure-okr-progress
description: Add progress tracking to key results using start/current/target values, with binary and numeric KR support
status: backlog
created: 2026-02-07T19:02:08Z
---

# PRD: Measure OKR Progress

## Executive Summary

Add progress measurement to key results in Bearing. Each KR gets `startValue`, `currentValue`, and `targetValue` fields. Binary KRs (done/not done) are modeled as target=1. Numeric KRs track current vs. target with support for over-achievement. Progress is displayed inline in the OKR tree next to each key result.

## Problem Statement

Currently, key results in Bearing have only a text description — there is no way to track whether a KR is complete or how far along it is. Users cannot see at a glance which goals are on track and which need attention. This makes Bearing a planning tool but not a progress-tracking tool, which limits its value for ongoing goal management.

This matters now because the core OKR hierarchy is fully implemented and users need the natural next step: tracking progress against their goals.

## User Stories

### User Story 1: Track numeric KR progress

**As a** Bearing user,
**I want to** set a target value on a key result and update my current progress,
**so that** I can see how far I am toward achieving measurable goals.

**Acceptance Criteria:**
- When creating or editing a KR, the user can optionally set `startValue` and `targetValue` (integers).
- `startValue` defaults to 0 if not set.
- The user can update `currentValue` at any time.
- Progress is displayed as "currentValue / targetValue" with a progress bar.
- Over-achievement is supported: `currentValue` can exceed `targetValue`, shown as e.g., "15 / 12 (125%)".

### User Story 2: Track binary KR completion

**As a** Bearing user,
**I want to** mark a key result as done or not done,
**so that** I can track simple yes/no goals without needing numeric values.

**Acceptance Criteria:**
- A KR with no explicit target (or target=1, start=0) renders as a checkbox.
- Checking the box sets `currentValue` to 1; unchecking sets it to 0.
- The progress bar shows 0% or 100%.

### User Story 3: View KR progress in the OKR tree

**As a** Bearing user,
**I want to** see progress indicators next to key results in the OKR hierarchy view,
**so that** I can quickly assess goal status without opening each item.

**Acceptance Criteria:**
- Each KR in the OKR tree shows a compact progress indicator (progress bar or checkbox).
- Numeric KRs show "current / target" text and a proportional progress bar.
- Over-achieved KRs have a distinct visual treatment (e.g., different color, exceeded bar).
- Binary KRs show a checkbox.

## Requirements

### Functional Requirements

1. **Data model extension**: Add `startValue` (int, default 0), `currentValue` (int, default 0), and `targetValue` (int, default 0) fields to the KeyResult model. A `targetValue` of 0 means progress tracking is not configured for that KR.
2. **Update KR progress**: A new backend method to update a KR's `currentValue` without requiring full KR edit. Alternatively, extend the existing `UpdateKeyResult` method.
3. **Progress display**: In the OKR tree view, render progress inline:
   - `targetValue == 0`: No progress indicator (untracked KR, just description text as today).
   - `targetValue == 1 && startValue == 0`: Checkbox (binary).
   - `targetValue > 1`: Progress bar with "currentValue / targetValue" label.
   - `currentValue > targetValue`: Over-achievement styling.
4. **Progress editing**: Clicking the progress indicator or a nearby control lets the user update `currentValue`. For binary KRs, a simple toggle. For numeric KRs, an inline input field.
5. **Backward compatibility**: Existing KRs with no progress fields default to `startValue=0, currentValue=0, targetValue=0` (untracked). No migration needed — zero values mean "not configured".

### Non-Functional Requirements

1. **Performance**: Progress updates should feel instant. No full page reload — update the KR in place.
2. **Data integrity**: Progress values are persisted via the existing git-versioned storage, maintaining recoverability.

## Success Criteria

- Users can set a target on a KR and track current progress against it.
- Binary KRs can be toggled done/not-done via a checkbox.
- Numeric KRs display "current / target" with a progress bar.
- Over-achievement (current > target) is visually indicated.
- Existing KRs without progress data continue to work unchanged.

## Constraints & Assumptions

- **Constraint**: All values are integers (no fractional progress like 3.5 out of 10).
- **Constraint**: Progress fields use zero-value defaults to avoid requiring data migration.
- **Assumption**: Objective and theme rollup (aggregate progress) is deferred to a future iteration. This PRD only covers KR-level progress.
- **Assumption**: `startValue` is typically 0 but can be non-zero (e.g., "Reduce bugs from 50 to 10" → start=50, target=10, where lower is better). However, the initial implementation assumes higher `currentValue` = more progress. Reverse-direction KRs can be considered in a future iteration.

## Out of Scope

- Objective-level or theme-level progress rollup / aggregation.
- Weighted key results.
- Progress history / changelog over time.
- Reverse-direction KRs (where lower current value = more progress).
- Fractional / decimal progress values.
- Progress notifications or reminders.

## Dependencies

- **Internal**: `KeyResult` model in `internal/access/models.go`.
- **Internal**: `UpdateKeyResult` method in `PlanningManager` and `App` Wails binding.
- **Internal**: OKRView component in `frontend/src/views/OKRView.svelte`.
- **Internal**: Mock bindings in `frontend/src/lib/wails-mock.ts`.
