---
name: move-frontend-make-commands-to-frontend-makefile
status: completed
created: 2026-02-13T15:02:20Z
progress: 100%
prd: .pm/prds/move-frontend-make-commands-to-frontend-makefile.md
github: [Will be updated when synced to GitHub]
---

# Epic: move-frontend-make-commands-to-frontend-makefile

## Overview

Extract all frontend build logic from the root `Makefile` into a new `frontend/Makefile` with short target names, then replace the root frontend targets with single-line `make -C frontend <target>` proxies. This is a straightforward file restructuring with no behavior changes.

## Architecture Decisions

- **`make -C` for delegation**: Standard GNU Make feature, avoids subshell `cd` hacks, propagates exit codes correctly, works on macOS and Linux.
- **Short target names in frontend/**: `lint` instead of `frontend-lint` — natural when running from `frontend/` directory. Root proxies handle the `frontend-` prefix mapping.
- **E2E tests in frontend Makefile**: Despite living in `../tests/ui-component/`, E2E tests are purely frontend concerns and belong in the frontend Makefile. Referenced via relative path.
- **`$(MAKE)` variable**: Root proxies use `@$(MAKE) -C frontend <target>` (not `make -C`) to respect recursive Make conventions and user-set MAKEFLAGS.

## Technical Approach

This is purely a Makefile refactoring — no application code, no npm scripts, no Go code changes.

### New file: `frontend/Makefile`
- Copy frontend target bodies from root Makefile
- Remove `cd frontend &&` prefixes (already in the right directory)
- Add standard `SHELL`, `.PHONY`, and `help` target
- E2E targets use `cd ../tests/ui-component && ...` relative paths

### Modified file: Root `Makefile`
- Replace each frontend target body with `@$(MAKE) -C frontend <target>`
- Keep target names, help annotations, and section groupings unchanged
- Composite targets (`test`, `lint`, `build`, `dev`) work unchanged because their dependencies (`frontend-lint`, `test-frontend`, etc.) are now proxies

## Implementation Strategy

This can be done in a single task — create the frontend Makefile and update the root Makefile simultaneously, then verify all targets work. There's no phased rollout needed since there are no external consumers and the change is easily reversible.

## Task Breakdown Preview

- [ ] Task 1: Create `frontend/Makefile` with all frontend targets and update root `Makefile` to use proxies
- [ ] Task 2: Verify all Make targets work from both root and frontend directories

## Dependencies

- None — pure build-system refactor

## Success Criteria (Technical)

- `make help` from root shows same targets as before
- `make help` from `frontend/` shows frontend-specific targets
- All root proxy targets delegate correctly (verified by running each)
- Zero `cd frontend && npm` patterns remain in root Makefile
- `make test` from root still runs both Go and frontend tests
- `make lint` from root still runs both Go and frontend linters

## Tasks Created
- [ ] 001.md - Create frontend/Makefile and convert root targets to proxies (parallel: false)
- [ ] 002.md - Verify all Make targets from both directories (parallel: false)

Total tasks: 2
Parallel tasks: 0
Sequential tasks: 2
Estimated total effort: 1.5 hours

## Estimated Effort

- 2 tasks, minimal complexity
- Single-session implementation — straightforward file restructuring
