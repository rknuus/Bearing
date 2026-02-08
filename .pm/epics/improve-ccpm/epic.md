---
name: improve-ccpm
status: completed
created: 2026-02-08T12:36:49Z
completed: 2026-02-08T14:42:00Z
progress: 100%
prd: .pm/prds/improve-ccpm.md
github: https://github.com/rknuus/Bearing/issues/76
---

# Epic: improve-ccpm

## Overview

Fix three issues in the CCPM integration: a `gh issue create --json` syntax error in `epic-sync.md`, data file location causing permission prompts, and upstreaming local fixes to the `tmp/ccpm/` fork. The changes are primarily text substitutions across CCPM command and script files.

## Architecture Decisions

- **Data directory**: Move epics and PRDs from `.pm/epics/` and `.pm/prds/` to `.pm/epics/` and `.pm/prds/`. The `.pm/` directory is outside `.claude/` so Claude Code won't treat edits as settings modifications.
- **Dual-copy approach**: Both `.claude/commands/pm/` (Claude Code discovery) and `.claude/ccpm/commands/pm/` (framework source) are near-identical copies. Both must be updated in lockstep. The fork at `tmp/ccpm/` uses `ccpm/` prefix paths and is updated separately.
- **`gh issue create` fix**: Replace `--json number -q .number` with `grep -oE '[0-9]+$'` on the URL output. This is a simple pipe substitution.
- **Upstream strategy**: Apply fixes to `tmp/ccpm/` as separate clean commits. The path relocation (FR2) is Bearing-specific and should NOT be upstreamed — only the `--json` fix and the archived-epic/task-closing fix are portable.

## Technical Approach

### Fix `gh issue create --json` (FR1)

Three occurrences in `epic-sync.md` (lines ~126, ~169, ~176) use:
```bash
gh issue create ... --json number -q .number)
```
Replace with:
```bash
gh issue create ... | grep -oE '[0-9]+$')
```

Files affected (2 identical copies):
- `.claude/ccpm/commands/pm/epic-sync.md`
- `.claude/commands/pm/epic-sync.md`

### Relocate PM data (FR2)

Global find-and-replace across ~51 files:
- `.pm/epics/` → `.pm/epics/`
- `.pm/prds/` → `.pm/prds/`

Files affected:
- 19 files in `.claude/ccpm/commands/pm/` (~100 references)
- 19 files in `.claude/commands/pm/` (~99 references)
- 12 files in `.claude/ccpm/scripts/pm/` (~52 references)
- 1 file in `.claude/ccpm/rules/` (1 reference)

Physical file moves:
- `.pm/epics/` → `.pm/epics/` (including `archived/` subdirectory)
- `.pm/prds/` → `.pm/prds/`

### Upstream to fork (FR3)

Apply to `tmp/ccpm/`:
1. The `--json` fix (same as FR1 but only in `ccpm/commands/pm/epic-sync.md`)
2. The archived-epic exclusion from `status.sh` (from commit `d14cacf`)
3. The task-closing on merge from `epic-merge.md` (from commit `d14cacf`)

Note: The path adaptation fix (`d6b905d`) changed `ccpm/scripts/pm/` → `.claude/ccpm/scripts/pm/` which is Bearing-specific. The fork should keep `ccpm/scripts/pm/` prefix. So this commit is NOT upstreamed as-is.

## Task Breakdown Preview

- [ ] Task 1: Fix `gh issue create --json` in epic-sync.md (both copies + fork)
- [ ] Task 2: Relocate PM data from `.claude/` to `.pm/` (move files + update all path references)
- [ ] Task 3: Upstream archived-epic and task-closing fixes to fork
- [ ] Task 4: Verify all `/pm:` commands work after changes

## Dependencies

- `tmp/ccpm/` fork must be on a clean branch
- No active epics in `.pm/epics/` that would conflict with the move (currently only archived + this one)

## Success Criteria (Technical)

- `grep -r '\.pm/epics/' .claude/ccpm/ .claude/commands/` returns zero matches after relocation
- `grep -r '\.pm/prds/' .claude/ccpm/ .claude/commands/` returns zero matches after relocation
- `grep -r '\-\-json number' .claude/ccpm/ .claude/commands/` returns zero matches after fix
- `/pm:status` works and shows correct counts
- `tmp/ccpm/` has clean commits on a feature branch

## Estimated Effort

- 4 tasks, each small to medium
- Tasks 1 and 3 can be done in parallel
- Task 2 is the largest (bulk text replacement + file moves)
- Task 4 is verification only
- Total: ~1 session

## Tasks Created
- [x] #77 - Fix gh issue create --json syntax error (parallel: true)
- [x] #78 - Relocate PM data from .claude/ to .pm/ (parallel: false)
- [x] #79 - Upstream archived-epic and task-closing fixes to fork (parallel: true)
- [x] #80 - Verify all PM commands work after changes (parallel: false, depends on #77-#79)

Total tasks: 4
Parallel tasks: 2
Sequential tasks: 2
