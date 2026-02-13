---
name: identify-and-dry-code-duplication
description: Eliminate clearly duplicated logic blocks across Go backend and Svelte frontend by extracting shared helpers and components
status: backlog
created: 2026-02-13T15:13:50Z
---

# PRD: identify-and-dry-code-duplication

## Executive Summary

Identify and eliminate significant code duplication across the Bearing codebase (Go backend and Svelte frontend). Focus conservatively on clearly duplicated logic blocks — 10+ lines repeated 3+ times — by extracting shared utility functions, helper methods, and components. CSS/styling duplication is excluded (already addressed by the dry-css-code epic).

## Problem Statement

The codebase has grown organically and accumulated duplicated logic in two areas:

**Go backend** (`internal/access/plan_access.go`): Git transaction boilerplate (~50 lines) is copy-pasted across 6+ methods. Task-finding loops (~30 lines) repeat across 3 methods. JSON marshal+write patterns repeat across 5 methods.

**Svelte frontend**: The `getBindings()` function is duplicated in 4 components. Theme lookup helpers (`getTheme`, `getThemeColor`) repeat across 3 components. Priority label constants are defined in 3 places.

This duplication creates maintenance burden: changes must be made in multiple places and can drift out of sync.

## User Stories

### US-1: Go backend — Extract git transaction helper
**As a** backend developer,
**I want** git transaction boilerplate extracted into a reusable helper,
**So that** adding new data-modifying operations doesn't require copy-pasting 10 lines of transaction code.

**Acceptance Criteria:**
- A helper method handles: get relative path, begin transaction, stage files, commit with message
- All existing methods in `plan_access.go` that use this pattern are refactored to call the helper
- All existing Go tests pass without modification
- Error messages remain descriptive (include the calling method context)

### US-2: Go backend — Extract task-finding helper
**As a** backend developer,
**I want** the "find task by ID across all themes/statuses" loop extracted into a helper,
**So that** task lookup logic exists in one place.

**Acceptance Criteria:**
- A helper method walks themes → statuses → tasks to find a task by ID
- Returns the task, its theme ID, status name, and index (or an error)
- `MoveTask`, `DeleteTask`, and `findTaskStatus` are refactored to use it
- All existing Go tests pass without modification

### US-3: Go backend — Extract JSON write helper
**As a** backend developer,
**I want** the JSON marshal + file write pattern extracted into a helper,
**So that** serialization logic isn't repeated across 5 methods.

**Acceptance Criteria:**
- A `writeJSON(filePath string, data interface{}) error` helper handles MarshalIndent + WriteFile
- All methods that marshal JSON and write to disk use this helper
- All existing Go tests pass without modification

### US-4: Frontend — Extract shared getBindings utility
**As a** frontend developer,
**I want** the Wails/mock bindings lookup in one shared utility,
**So that** every component doesn't redefine the same function.

**Acceptance Criteria:**
- A shared utility in `frontend/src/lib/` provides `getBindings()`
- All components (`App.svelte`, `CalendarView.svelte`, `EisenKanView.svelte`, `OKRView.svelte`) import from the shared utility instead of defining their own
- Works in all three dev environments (native, Wails dev, Vite mock)
- All existing frontend tests pass

### US-5: Frontend — Extract shared theme helpers
**As a** frontend developer,
**I want** theme lookup functions (`getTheme`, `getThemeColor`) in one shared utility,
**So that** theme resolution logic isn't scattered across multiple components.

**Acceptance Criteria:**
- Shared functions in `frontend/src/lib/utils/` for theme lookup by ID and color resolution
- All components that perform theme lookups use the shared functions
- Default fallback color (`#6b7280`) defined in one place
- All existing frontend tests pass

### US-6: Frontend — Extract shared priority constants
**As a** frontend developer,
**I want** priority label mappings defined once,
**So that** adding/changing priority labels is a single-place change.

**Acceptance Criteria:**
- Priority labels (`important-urgent` → `Q1`, etc.) defined in a shared constants file
- All components that reference priority labels import from the shared source
- All existing frontend tests pass

## Requirements

### Functional Requirements

**FR-1: Go git transaction helper**
- New method on `PlanAccess`: handles relative path resolution, transaction begin, stage, commit
- Accepts: file path(s) and commit message
- Returns: error (wrapping the caller's context)
- Refactor: `SaveTheme`, `SaveDayFocus`, `SaveTask`, `MoveTask`, `DeleteTask`, and any other methods using the pattern

**FR-2: Go task-finding helper**
- New method on `PlanAccess`: walks loaded plan data to find a task by ID
- Returns: task reference, theme ID, status name, task index within the status slice
- Refactor: `MoveTask`, `DeleteTask`, `findTaskStatus`

**FR-3: Go JSON write helper**
- New method or function: `writeJSON(filePath string, v interface{}) error`
- Uses `json.MarshalIndent` with 2-space indent (matching current behavior)
- Refactor: all methods that do marshal+write

**FR-4: Frontend getBindings utility**
- New file: `frontend/src/lib/utils/bindings.ts` (or similar)
- Exports `getBindings()` with the same runtime detection logic
- Refactor: remove local `getBindings` definitions from all components

**FR-5: Frontend theme helpers**
- New file: `frontend/src/lib/utils/theme-helpers.ts` (or similar)
- Exports `getTheme(themes, themeId)` and `getThemeColor(themes, themeId)`
- Refactor: replace inline theme lookups in all components

**FR-6: Frontend priority constants**
- New file: `frontend/src/lib/constants/priorities.ts` (or similar)
- Exports the priority label mapping
- Refactor: replace inline definitions in all components

### Non-Functional Requirements

**NFR-1: No behavior change**
- All refactoring must be pure extraction — identical behavior before and after
- All existing tests must pass without modification

**NFR-2: Minimal new abstractions**
- Extract only what's clearly duplicated. Do not create speculative abstractions
- Keep Go error handling idiomatic (no error middleware or wrappers)
- Do not refactor patterns that are repeated fewer than 3 times

## Success Criteria

- Zero duplicated logic blocks (>10 lines, 3+ repetitions) remain in the identified patterns
- All existing Go tests pass
- All existing frontend tests pass
- Frontend lint passes
- No new files beyond the extracted utilities/constants

## Constraints & Assumptions

- Go error handling remains idiomatic `if err != nil` — no error wrapping utilities
- CSS/styling duplication is out of scope (handled by dry-css-code epic)
- Existing test coverage is sufficient to catch regressions
- The `plan_access.go` file is the primary Go file with duplication; other Go files have minimal duplication

## Out of Scope

- CSS/styling duplication (addressed by prior epic)
- Creating new abstractions beyond direct extraction (no visitor patterns, no generic tree walkers)
- Refactoring patterns that appear fewer than 3 times
- Adding new tests (existing tests verify behavior preservation)
- Changing public API signatures
- Go error handling refactoring

## Dependencies

- None — pure refactoring with no external dependencies
- Assumes the dry-css-code epic is already merged (it is)
