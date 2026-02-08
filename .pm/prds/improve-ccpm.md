---
name: improve-ccpm
description: Fix gh issue create bug, separate CCPM sources from PM data, and upstream local fixes to fork
status: backlog
created: 2026-02-08T12:35:31Z
---

# PRD: improve-ccpm

## Executive Summary

Improve the Claude Code PM (CCPM) integration in the Bearing project by fixing a `gh issue create --json` syntax error that breaks GitHub sync, separating CCPM framework sources from PM data files to avoid permission conflicts, and upstreaming two local fixes to the `tmp/ccpm/` fork repository.

## Problem Statement

Three issues degrade the CCPM developer experience:

1. **`gh issue create --json` syntax error**: The `epic-sync` command uses `--json number -q .number` with `gh issue create` (lines 126, 169, 176 of `epic-sync.md`), but `gh issue create` does not support the `--json` flag. This causes a hard failure every time issues are synced to GitHub, requiring the AI model to detect the error and work around it by parsing the URL output instead. This wastes tokens and creates inconsistent workarounds.

2. **CCPM sources mixed with PM data**: Epics (`.pm/epics/`) and PRDs (`.pm/prds/`) live inside `.claude/`, the same directory tree as CCPM framework code. When Claude Code edits epic/task files, it triggers a "modify settings files?" permission prompt because `.claude/` is a settings directory. This friction occurs on every file edit during epic execution. Separating data from framework would allow CCPM to be managed as a submodule under `.claude/` while keeping data in a location that doesn't require elevated permissions.

3. **Local fixes not upstreamed**: Two commits made directly to `.claude/ccpm/` contain useful fixes that should be contributed back to the `tmp/ccpm/` fork:
   - `d6b905d`: Path adaptation — changes script references from `ccpm/scripts/pm/X.sh` to `.claude/ccpm/scripts/pm/X.sh`
   - `d14cacf`: Exclude archived epics from status counts + close task files on epic merge

## User Stories

### US1: As a developer using CCPM, I want `gh issue create` to work reliably so that GitHub sync doesn't require manual error recovery

**Acceptance Criteria:**
- `/pm:epic-sync` creates GitHub issues without errors
- Issue numbers are captured correctly from the `gh issue create` output URL
- The fix is applied in both `.claude/ccpm/commands/pm/epic-sync.md` and `tmp/ccpm/ccpm/commands/pm/epic-sync.md`

### US2: As a developer, I want CCPM data (epics, PRDs) stored outside `.claude/` so that editing them doesn't trigger settings permission prompts

**Acceptance Criteria:**
- Epic files live in a directory outside `.claude/` (e.g. `.pm/epics/`)
- PRD files live in a directory outside `.claude/` (e.g. `.pm/prds/`)
- All CCPM commands and scripts find files in the new locations
- CCPM framework sources remain in `.claude/ccpm/` (or as a submodule)
- No "modify settings?" permission prompt when editing epic/task/PRD files

### US3: As a CCPM contributor, I want my local fixes available in the fork so I can submit them upstream

**Acceptance Criteria:**
- The path adaptation fix (`d6b905d`) is cherry-picked or ported to `tmp/ccpm/`
- The archived-epic exclusion fix (`d14cacf`) is cherry-picked or ported to `tmp/ccpm/`
- The `gh issue create --json` fix is also applied to `tmp/ccpm/`
- `tmp/ccpm/` has clean commits ready for upstream PR

## Requirements

### Functional Requirements

**FR1: Fix `gh issue create --json` error**
- Replace `--json number -q .number` with URL parsing in `epic-sync.md`
- The pattern: `gh issue create ... | grep -oE '[0-9]+$'` extracts the issue number from the returned URL (e.g. `https://github.com/owner/repo/issues/42` → `42`)
- Apply to all 3 occurrences (lines 126, 169, 176)

**FR2: Relocate PM data files**
- Move `.pm/epics/` to a new location outside `.claude/` (proposed: `.pm/epics/`)
- Move `.pm/prds/` to a new location outside `.claude/` (proposed: `.pm/prds/`)
- Update all hardcoded path references in:
  - ~40 command files in `.claude/ccpm/commands/pm/`
  - ~14 shell scripts in `.claude/ccpm/scripts/pm/`
  - Rule files with path examples (e.g. `path-standards.md`)
- Preserve archived epics during migration

**FR3: Upstream fixes to fork**
- Port the `gh issue create` fix to `tmp/ccpm/`
- Port the path adaptation fix to `tmp/ccpm/` (note: the path prefix may differ between Bearing's `.claude/ccpm/` and the fork's `ccpm/` structure)
- Port the archived-epic exclusion + task-closing fix to `tmp/ccpm/`
- Ensure the fork's commands/scripts are internally consistent

### Non-Functional Requirements

- No breaking changes to existing CCPM command invocation (e.g. `/pm:status` still works)
- Migration should handle both active and archived epics
- The data directory relocation should be a single, reviewable change

## Success Criteria

- `/pm:epic-sync` runs without `--json` flag errors on a test epic
- `/pm:status`, `/pm:epic-list`, `/pm:prd-list` all work after data relocation
- Editing files under the new data directory does not trigger settings permission prompts
- `tmp/ccpm/` fork has clean, portable commits for the three fixes
- `make test` still passes (no regressions)

## Constraints & Assumptions

- **Assumption**: The new data directory (`.pm/`) will not trigger Claude Code settings permission prompts since it's outside `.claude/`
- **Assumption**: CCPM commands are discovered via `.claude/commands/` symlinks/copies and that mechanism doesn't change
- **Constraint**: The path adaptation fix for the fork (`tmp/ccpm/`) uses `ccpm/` prefix (not `.claude/ccpm/`), so the upstream version differs from the Bearing-local version
- **Constraint**: Cannot change CCPM's command discovery mechanism (must remain in `.claude/commands/`)

## Out of Scope

- Changing CCPM to use environment variables or a config file for paths (would be a larger upstream change)
- Converting `.claude/ccpm/` into an actual git submodule (separate future task)
- Modifying the CCPM command discovery mechanism
- Adding new CCPM features beyond the three fixes described

## Dependencies

- `gh` CLI installed and authenticated (already the case)
- `tmp/ccpm/` fork repository exists and is pushable (already the case)
- Familiarity with the CCPM command/script structure (documented in this PRD)
