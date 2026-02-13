---
name: ignore-navigation-context-file-when-creating-new-repo
status: completed
created: 2026-02-13T10:42:48Z
completed: 2026-02-13T10:45:55Z
progress: 100%
prd: .pm/prds/ignore-navigation-context-file-when-creating-new-repo.md
github: [Will be updated when synced to GitHub]
---

# Epic: ignore-navigation-context-file-when-creating-new-repo

## Overview

Add `.gitignore` creation to `PlanAccess.ensureDirectoryStructure()` so that `navigation_context.json` is excluded from the data repo on fresh installs. This is a single-file, single-function change.

## Architecture Decisions

- **Location**: `ensureDirectoryStructure()` in `plan_access.go` — this already runs on every startup and creates missing directories, so adding `.gitignore` creation here follows the existing pattern.
- **Idempotent**: Only create `.gitignore` if it doesn't already exist, preserving any manual edits users may have made.
- **No commit**: The `.gitignore` will be picked up by the next data commit naturally — no need for a special initial commit.

## Technical Approach

### Backend Change

In `PlanAccess.ensureDirectoryStructure()` (`internal/access/plan_access.go` lines 75-90), after creating the required directories, check if `.gitignore` exists in `dataPath`. If not, write a `.gitignore` containing `navigation_context.json`.

### Test

Add a test in `internal/access/plan_access_test.go` (or the integration tests) that verifies:
1. A new `PlanAccess` instance creates `.gitignore` if missing
2. An existing `.gitignore` is not overwritten

## Task Breakdown Preview

- [ ] Task 1: Add .gitignore creation to ensureDirectoryStructure and add test

## Dependencies

- None — self-contained backend change

## Success Criteria (Technical)

- `NewPlanAccess` on a fresh directory creates `.gitignore` with `navigation_context.json`
- Existing `.gitignore` files are not modified
- All existing tests pass
- `make test` and `make lint` pass

## Estimated Effort

- 1 task, XS size
