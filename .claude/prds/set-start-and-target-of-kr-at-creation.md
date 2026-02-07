---
name: set-start-and-target-of-kr-at-creation
description: Allow setting start and target values when creating a Key Result
status: backlog
created: 2026-02-07T19:42:34Z
---

# PRD: set-start-and-target-of-kr-at-creation

## Executive Summary

Allow users to set `startValue` and `targetValue` when creating a Key Result, eliminating the current two-step workflow (create, then edit to add values). The creation form expands to a two-row layout with optional start/target fields.

## Problem Statement

After the measure-okr-progress feature, KRs support `startValue`, `currentValue`, and `targetValue`. However, `CreateKeyResult` only accepts a description. Users must create the KR first, then immediately edit it to set start/target — an unnecessary friction that makes the common case (creating a measurable KR) take two interactions instead of one.

## User Stories

### US-1: Create a binary KR in one step
**As a** user defining a new key result,
**I want to** set target=1 during creation,
**So that** the KR immediately renders as a checkbox without a separate edit step.

**Acceptance Criteria:**
- KR creation form shows optional Start and Target number inputs on a second row
- Setting target=1 and creating results in a KR that renders as a checkbox
- Leaving start/target blank defaults to 0 (untracked KR, backward compatible)

### US-2: Create a numeric KR in one step
**As a** user defining a measurable key result,
**I want to** set start=0 and target=10 during creation,
**So that** the KR immediately renders with a progress bar.

**Acceptance Criteria:**
- Numeric start and target inputs accept non-negative integers
- After creation, the KR shows the progress bar with "0 / 10" display
- Start defaults to 0 when left blank

### US-3: Create a quick untracked KR
**As a** user who just wants to jot down a key result quickly,
**I want to** create a KR with only a description (no start/target),
**So that** the workflow stays fast for users who don't need progress tracking yet.

**Acceptance Criteria:**
- Start and Target fields are optional
- Pressing Enter in the description field still creates the KR (start/target default to 0)
- The form behaves identically to today when start/target are not filled in

## Requirements

### Functional Requirements

1. **Backend: Extend `CreateKeyResult` API** — Add `startValue` and `targetValue` parameters (int, default 0) to `CreateKeyResult` in the manager interface, implementation, and Wails binding.

2. **Frontend: Two-row creation form** — When adding a KR, show description on the first row and optional Start/Target number inputs on a second row, with Create/Cancel buttons.

3. **Mock bindings** — Update `CreateKeyResult` mock to accept and store start/target values.

4. **Backward compatibility** — Existing callers passing only description continue to work (start/target default to 0 = untracked).

### Non-Functional Requirements

- No additional latency: single API call, same as today.
- Form layout must not break on narrow viewports (flex-wrap already in use).

## Success Criteria

- Creating a KR with target=1 immediately renders a checkbox (no edit step needed).
- Creating a KR with target>1 immediately renders a progress bar.
- Creating a KR with no start/target values results in an untracked KR (same as today).
- All existing tests continue to pass.

## Constraints & Assumptions

- `startValue` and `targetValue` are non-negative integers (enforced by `min="0"` on inputs).
- `currentValue` always starts at 0 on creation (progress is updated separately).
- The Go `CreateKeyResult` function signature changes — all callers (only the Wails binding) must be updated.

## Out of Scope

- Changing the KR edit form (already supports start/target editing).
- Objective or theme-level progress rollup.
- Validation rules (e.g., target > start) — user may set any non-negative values.
- Changing `currentValue` at creation time.

## Dependencies

- Depends on the completed `measure-okr-progress` epic (merged to main) which added `startValue`, `currentValue`, `targetValue` to the KeyResult model.
