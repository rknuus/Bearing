---
name: remove-useless-eisenhower-section
status: backlog
created: 2026-02-08T19:24:31Z
progress: 0%
prd: .pm/prds/remove-useless-eisenhower-section.md
github: [Will be updated when synced to GitHub]
---

# Epic: remove-useless-eisenhower-section

## Overview

Remove the Q4 (`not-important-not-urgent`) priority from the data model and board configuration. Since the backend already rejects Q4 task creation, this is a cleanup: delete the constant, remove the section from board configs, and simplify the manager's priority validation to use `IsValidPriority()` instead of a hardcoded allowlist.

## Architecture Decisions

- **Remove Q4 from the model layer entirely**: Delete `PriorityNotImportantNotUrgent` constant and remove it from `ValidPriorities()`. This is safe since no task can exist with this priority.
- **Simplify CreateTask validation**: Replace the manager's hardcoded 3-priority allowlist with a call to `access.IsValidPriority()`, since the model will now only contain the 3 valid priorities.
- **No frontend logic changes**: Only the mock board config and test fixtures need updating — the EisenKanView already renders sections dynamically from the config.

## Technical Approach

### Backend (`internal/access/models.go`)
1. Remove `PriorityNotImportantNotUrgent` constant
2. Remove it from `ValidPriorities()` slice
3. Remove Q4 section from `DefaultBoardConfiguration()`
4. Update the `Priority` comment on the Task struct field

### Backend (`internal/managers/planning_manager.go`)
5. Replace the hardcoded 3-priority allowlist in `CreateTask()` with `access.IsValidPriority(priority)` — now that Q4 is gone from the model, this is equivalent and simpler

### Frontend (`frontend/src/lib/wails-mock.ts`)
6. Remove Q4 section from mock board configuration

### Tests
7. Update `plan_access_test.go`: remove Q4 from `TestValidPriorities` expected count and `TestIsValidPriority` test cases
8. Update `planning_manager_test.go`: adjust the "rejects Q4 priority" test (Q4 is still invalid, but the error may come from `IsValidPriority` now)
9. Update `EisenKanView.test.ts`: remove Q4 section from test board config fixture and any assertions about it

## Tasks Created
- [ ] 001.md - Remove Q4 from backend model and board configuration (parallel: true)
- [ ] 002.md - Simplify CreateTask priority validation in planning manager (parallel: false, depends on 001)
- [ ] 003.md - Update frontend mock config and tests (parallel: true)

Total tasks: 3
Parallel tasks: 2 (001, 003)
Sequential tasks: 1 (002 depends on 001)

## Dependencies

None — self-contained cleanup.

## Success Criteria (Technical)

- `make test` passes (all Go tests)
- `make frontend-test` passes (all frontend tests)
- `make frontend-lint` and `make frontend-check` pass with 0 errors and 0 warnings
- `ValidPriorities()` returns exactly 3 priorities
- `DefaultBoardConfiguration()` TODO column has exactly 3 sections

## Estimated Effort

Small — 3 tasks, all straightforward deletions and simplifications. No new code, no migrations.
