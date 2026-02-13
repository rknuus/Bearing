---
name: move-frontend-make-commands-to-frontend-makefile
description: Move frontend Make targets into frontend/Makefile with root proxies to eliminate duplication and allow running from either directory
status: backlog
created: 2026-02-13T14:58:06Z
---

# PRD: move-frontend-make-commands-to-frontend-makefile

## Executive Summary

Move all frontend-related Make targets from the root `Makefile` into a new `frontend/Makefile`. The root Makefile retains thin proxy targets that delegate via `make -C frontend <target>`, so commands work from either directory without any code duplication.

## Problem Statement

Claude Code (and developers in general) sometimes operates from the `frontend/` directory and expects to run `make lint`, `make test`, etc. locally. Currently all Make targets live in the root `Makefile`, forcing a `cd ..` or absolute path. Additionally, the root Makefile mixes Go backend concerns with frontend npm-wrapper commands, making it harder to navigate.

Moving frontend logic into `frontend/Makefile` solves both problems: commands are runnable from either location, and each Makefile is focused on its own domain.

## User Stories

### US-1: Run frontend commands from frontend directory
**As a** developer working in the frontend directory,
**I want to** run `make lint`, `make check`, `make test` from `frontend/`,
**So that** I don't have to navigate to the project root for routine frontend tasks.

**Acceptance Criteria:**
- `cd frontend && make lint` runs ESLint exactly as `make frontend-lint` does from root
- `cd frontend && make check` runs svelte-check exactly as `make frontend-check` does from root
- `cd frontend && make test` runs Vitest exactly as `make test-frontend` does from root
- `cd frontend && make build` builds frontend exactly as `make frontend-build` does from root
- `cd frontend && make install` installs deps exactly as `make frontend-install` does from root
- `cd frontend && make dev` starts Vite dev server exactly as `make frontend-dev` does from root

### US-2: Run frontend commands from root (backwards compatibility)
**As a** developer using existing workflows,
**I want** all current root-level `make frontend-*` and `make test-frontend*` targets to keep working,
**So that** nothing breaks for existing users or CI.

**Acceptance Criteria:**
- `make frontend-lint` from root still works (delegates to `make -C frontend lint`)
- `make frontend-check` from root still works
- `make frontend-build` from root still works
- `make frontend-install` from root still works
- `make frontend-dev` from root still works
- `make test-frontend` from root still works
- `make test-frontend-e2e` from root still works
- `make test-frontend-e2e-install` from root still works
- Composite targets (`make test`, `make lint`, `make build`, `make dev`) still work

### US-3: No duplicated logic
**As a** maintainer,
**I want** each piece of build logic to exist in exactly one place,
**So that** changes only need to be made once and can't drift out of sync.

**Acceptance Criteria:**
- The root Makefile contains zero `cd frontend && npm ...` commands after migration
- All frontend npm invocations live exclusively in `frontend/Makefile`
- Root proxy targets are single-line `make -C frontend <target>` delegations

## Requirements

### Functional Requirements

**FR-1: Create `frontend/Makefile`**
- New Makefile in `frontend/` with all frontend build logic
- Targets use short names (no `frontend-` prefix): `install`, `build`, `check`, `lint`, `dev`, `test`, `e2e-install`, `e2e`, `e2e-headless`
- Include `help` target listing available commands
- E2E test targets reference `../tests/ui-component/` via relative path from frontend dir

**FR-2: Convert root Makefile frontend targets to proxies**
- Replace each frontend target body with `@$(MAKE) -C frontend <target>`
- Preserve existing target names for backwards compatibility
- Preserve help text annotations (`## ...` comments)
- Preserve target grouping sections (`##@ Frontend`, `##@ Testing` frontend entries)

**FR-3: Update composite root targets**
- `make test` should still run both backend and frontend tests (frontend via proxy)
- `make lint` should still run both Go linter and frontend linter (frontend via proxy)
- `make build` / `make dev` should continue to work with Wails commands that depend on frontend targets

### Non-Functional Requirements

**NFR-1: No behavior change**
- All commands produce identical output and behavior before and after migration
- Exit codes preserved (failures propagate correctly through `make -C`)

**NFR-2: Minimal diff**
- Keep changes focused; don't restructure unrelated parts of either Makefile

## Success Criteria

- All existing `make` commands from root produce the same results
- Frontend commands are additionally runnable from `frontend/`
- Zero duplicated npm/node command invocations across Makefiles
- `make help` from both root and frontend/ show relevant targets

## Constraints & Assumptions

- Wails commands (`wails dev`, `wails build`) must remain in the root Makefile since they orchestrate the full app
- The `generate` target stays in root (it runs `wails generate module` which is a root-level concern)
- E2E tests live in `tests/ui-component/` — the frontend Makefile will reference them via `../tests/ui-component/`
- `make -C` is standard GNU Make and works on macOS and Linux

## Out of Scope

- Restructuring Go/backend Make targets
- Moving the `tests/ui-component/` directory into `frontend/`
- Adding new Make targets beyond what currently exists
- Changes to npm scripts in `package.json`
- CI/CD pipeline changes (if any exist)

## Dependencies

- None — this is a pure build-system refactor with no external dependencies
