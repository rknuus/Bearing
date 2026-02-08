---
name: update-theme-abbreviation-upon-renaming
status: backlog
created: 2026-02-07T18:58:30Z
progress: 0%
prd: .pm/prds/update-theme-abbreviation-upon-renaming.md
github: https://github.com/rknuus/Bearing/issues/50
---

# Epic: Update Theme Abbreviation Upon Renaming

## Overview

Add a cascading theme abbreviation rename feature. When a user renames a theme, a confirmation dialog suggests a new abbreviation. If accepted, the backend atomically updates the theme ID and all child entity IDs (objectives, key results, tasks) plus DayFocus references and navigation context, committed as a single git transaction.

## Architecture Decisions

- **New `RenameThemeAbbreviation` method in PlanAccess**: A single access-layer method handles the entire cascade (theme ID, objective/KR IDs and parentIDs, task IDs/themeIDs/files, DayFocus themeIDs, navigation context) and commits atomically. This keeps business logic in the backend and avoids multiple round-trips.
- **Reuse `SuggestAbbreviation`**: The existing algorithm generates collision-free suggestions. Pass other themes (excluding self) to allow the current abbreviation to be "freed".
- **String prefix replacement for IDs**: Child entity IDs follow the pattern `{ABBR}-{type}{num}`. Renaming means replacing the prefix portion, which is a simple string operation.
- **Task file relocation**: Tasks are stored at `tasks/{themeID}/{status}/{taskID}.json`. Renaming requires moving files from the old directory to the new one and updating the JSON contents.
- **Frontend confirmation dialog**: A modal in OKRView shown after theme name edit, before final save. The dialog calls `SuggestThemeAbbreviation` and, if user confirms, calls the new `RenameThemeAbbreviation` binding.

## Technical Approach

### Backend (Go)

1. **`IPlanAccess.RenameThemeAbbreviation(oldID, newID string) error`** — New method on the access layer:
   - Validate newID format (1-3 uppercase letters) and uniqueness.
   - Load themes, find theme by oldID.
   - Rewrite theme ID, all objective IDs/parentIDs, all KR IDs/parentIDs recursively.
   - Move task files from `tasks/{oldID}/` to `tasks/{newID}/`, updating each task's ID and ThemeID.
   - Update DayFocus entries across all year files where ThemeID == oldID.
   - Update navigation context if it references oldID or any old child IDs.
   - Write all changed files, stage them, commit as a single git transaction.
2. **`IPlanningManager.RenameThemeAbbreviation(oldID, newID string) error`** — Thin wrapper calling access layer.
3. **`App.RenameThemeAbbreviation(oldID, newID string) error`** — Wails binding exposed to frontend.

### Frontend (Svelte)

1. **Abbreviation confirmation dialog** in OKRView: After editing a theme name, if the name changed, show a modal with:
   - Old abbreviation (read-only)
   - Suggested new abbreviation (editable, validated)
   - "Update abbreviation" / "Keep current" / "Cancel" buttons
2. **Validation**: 1-3 uppercase letters, no collision with other themes.
3. **Mock binding**: Add `RenameThemeAbbreviation` to `wails-mock.ts` with matching cascade logic for browser testing.

### Data Entities Affected by Cascade

| Entity | Field(s) updated | Storage location |
|--------|-----------------|-----------------|
| LifeTheme | `id` | `themes/themes.json` |
| Objective | `id`, `parentId` | `themes/themes.json` (nested) |
| KeyResult | `id`, `parentId` | `themes/themes.json` (nested) |
| Task | `id`, `themeId` | `tasks/{themeID}/{status}/{taskID}.json` (files moved) |
| DayFocus | `themeId` | `calendar/{year}.json` |
| NavigationContext | `currentItem`, `filterThemeId` | `navigation_context.json` |

## Implementation Strategy

- **Phase 1** (Tasks 1-2): Backend — access layer rename + manager/binding wiring
- **Phase 2** (Task 3): Frontend — confirmation dialog + mock bindings
- **Phase 3** (Task 4): Integration testing and verification

## Task Breakdown Preview

- [ ] Task 1: Implement `RenameThemeAbbreviation` in `PlanAccess` with cascading ID updates, task file relocation, DayFocus updates, navigation context updates, and atomic git commit. Add unit tests.
- [ ] Task 2: Wire up through `PlanningManager` interface + `App` Wails binding. Add integration test.
- [ ] Task 3: Add abbreviation confirmation dialog to OKRView with validation. Add `RenameThemeAbbreviation` to mock bindings. Update frontend tests.
- [ ] Task 4: End-to-end verification — run all make targets, verify no regressions, test the full rename flow.

## Dependencies

- `SuggestAbbreviation` in `internal/access/plan_access.go` (existing, reused)
- `SaveTheme` / git transaction logic in access layer (existing pattern to follow)
- `SuggestThemeAbbreviation` Wails binding (existing, reused by frontend)
- OKRView theme editing flow (existing, dialog added after name save)

## Success Criteria (Technical)

- `RenameThemeAbbreviation("H", "CF")` updates theme ID, all `H-O*`/`H-KR*` IDs to `CF-O*`/`CF-KR*`, moves task files, updates DayFocus entries, all in one git commit.
- No orphaned references to old abbreviation in any storage file after rename.
- Collision with existing theme abbreviation returns an error (not applied).
- All existing tests pass. New tests cover: basic rename, cascade correctness, collision rejection, empty/invalid input.
- Frontend dialog appears only when theme name changes, validates input, and calls correct binding.

## Estimated Effort

- **Total**: 4 tasks, ~S-M size each
- **Critical path**: Task 1 (access layer) → Task 2 (wiring) → Task 3 (frontend) → Task 4 (verification)
- All tasks are sequential due to dependencies.
