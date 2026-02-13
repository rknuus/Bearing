---
name: identify-and-dry-code-duplication
status: completed
created: 2026-02-13T15:17:12Z
progress: 100%
prd: .pm/prds/identify-and-dry-code-duplication.md
github: [Will be updated when synced to GitHub]
---

# Epic: identify-and-dry-code-duplication

## Overview

Extract clearly duplicated logic blocks into shared helpers across Go backend and Svelte frontend. Six extraction targets grouped into two independent tracks (Go and frontend) that can be worked in parallel. All refactoring is pure extraction with no behavior changes.

## Architecture Decisions

- **Go helpers as private methods on PlanAccess**: The git transaction helper and task-finding helper are methods on the `PlanAccess` struct since they need access to `repo` and `plan` fields. The JSON write helper can be a package-level function since it's stateless.
- **Frontend utilities in `lib/utils/` and `lib/constants/`**: Follow existing project conventions. `getBindings()` goes in utils alongside the existing `wails-mock.ts`. Theme helpers and priority constants get their own files.
- **No new abstractions**: Each extraction is a direct lift of repeated code into a single function. No generics, interfaces, or patterns beyond what's needed.

## Technical Approach

### Go Backend (3 extractions in `plan_access.go`)

1. **`commitFiles(paths []string, message string) error`** — private method on `PlanAccess` that resolves relative paths, begins a git transaction, stages files, and commits. Replaces ~10 lines × 6+ call sites.

2. **`findTaskInPlan(taskID string) (task, themeID, status, index)`** — private method that walks the loaded plan to locate a task. Replaces ~30 lines × 3 call sites.

3. **`writeJSON(filePath string, v any) error`** — package-level function that does `MarshalIndent` + `WriteFile`. Replaces ~6 lines × 5 call sites.

### Svelte Frontend (3 extractions)

1. **`lib/utils/bindings.ts`** — exports `getBindings()` with runtime Wails detection and mock fallback. Replaces local definitions in 4 components.

2. **`lib/utils/theme-helpers.ts`** — exports `getTheme()` and `getThemeColor()`. Replaces inline lookups in 3 components.

3. **`lib/constants/priorities.ts`** — exports `priorityLabels` mapping. Replaces inline definitions in 3 components.

## Implementation Strategy

Two independent tracks that can run in parallel:
- **Track A (Go)**: Extract all 3 Go helpers, refactor call sites, run Go tests
- **Track B (Frontend)**: Extract all 3 frontend utilities, refactor imports, run frontend tests + lint

Each track modifies different files with no overlap, so they can be done concurrently or sequentially.

## Task Breakdown Preview

- [ ] Task 1: Extract Go backend helpers (git transaction, task-finding, JSON write) and refactor call sites
- [ ] Task 2: Extract frontend shared utilities (getBindings, theme helpers, priority constants) and refactor imports
- [ ] Task 3: Final verification — run full test suite and lint from root

## Dependencies

- None — pure refactoring, no external dependencies
- Track A and Track B are independent of each other

## Success Criteria (Technical)

- `make test` passes (all Go + frontend tests)
- `make lint` passes (Go + frontend linters)
- Zero `cd frontend && npm` patterns in root Makefile (already done)
- No duplicated blocks matching the 6 identified patterns remain
- No changes to public API signatures or exported types

## Tasks Created
- [ ] 001.md - Extract Go backend helpers and refactor call sites (parallel: true)
- [ ] 002.md - Extract frontend shared utilities and refactor imports (parallel: true)
- [ ] 003.md - Final verification — full test suite and lint (parallel: false)

Total tasks: 3
Parallel tasks: 2 (001 and 002 can run concurrently)
Sequential tasks: 1 (003 depends on 001 + 002)
Estimated total effort: 4.5 hours

## Estimated Effort

- 3 tasks, moderate complexity
- Single-session implementation — straightforward extract-and-replace refactoring
- Tasks 1 and 2 can run in parallel
