---
created: 2026-02-20T14:57:09Z
last_updated: 2026-02-28T15:17:06Z
version: 1.1
author: Claude Code PM System
---

# Progress

## Current State
- Branch: main
- All tests passing (190 frontend + Go suite)
- No uncommitted changes

## Recent Completed Work
- **Flatten task directory structure** — Removed theme directory level from task paths (`tasks/{themeID}/{status}/` → `tasks/{status}/`). Includes bash migration script (`make migrate-tasks`) and full codebase refactor across access layer, manager, mock, and tests.
- **Fix duplicate task IDs** — Added uniqueness guard in `saveTaskFile` to prevent ID collisions. Manually re-ID'd archived duplicates (L-T32..38 → L-T50..56).
- **Fix failure to move task from todo to doing** — Added archived-to-todo transition in rule engine, included archived tasks in `GetTasksByTheme` for ID generation, skip archived tasks when finding move target in `MoveTask`.
- Per-column vertical scrolling in EisenKan board (CSS height constraint fix)
- Drop zone scoping to view/dialog context
- Locale-aware date formatting across all views

## Active Epics
- Theme abbreviation update upon renaming (backlog, not decomposed)

## Outstanding PRDs
- 30+ PRDs in the system, mostly historical
- Active area: EisenKan usability improvements