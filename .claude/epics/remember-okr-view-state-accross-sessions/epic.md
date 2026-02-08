---
name: remember-okr-view-state-accross-sessions
status: completed
created: 2026-02-08T10:01:48Z
progress: 100%
prd: .claude/prds/remember-okr-view-state-accross-sessions.md
github: https://github.com/rknuus/Bearing/issues/65
---

# Epic: remember-okr-view-state-accross-sessions

## Overview

Persist the OKR tree's expanded/collapsed node state by adding an `expandedOkrIds` field to the existing `NavigationContext` struct. The field flows through the same save/load pipeline already used for `showCompleted` and `showArchived`. On the frontend, `OKRView.svelte` initializes `expandedIds` from the loaded context on mount and syncs changes back via an `$effect`.

## Architecture Decisions

- **Extend NavigationContext, don't create a new file/struct.** The expanded IDs are small (tens of strings) and conceptually part of the same "view state" already stored there. Adding a field to the existing struct keeps the pipeline unchanged.
- **Store as `[]string` / `string[]`.** A flat array of IDs is sufficient — no need for a tree structure since `SvelteSet` can be constructed from an array directly.
- **Use `omitempty` on Go side.** Ensures backward compatibility — old JSON files without the field deserialize cleanly to an empty/nil slice.
- **Sync pattern: mirror the existing `showCompleted`/`showArchived` `$effect`.** Load on mount, save via `$effect` that watches the `expandedIds` set. Use `untrack()` for the save call to avoid infinite loops.

## Technical Approach

### Backend (Go)

Add `ExpandedOkrIds []string `json:"expandedOkrIds,omitempty"`` to the `NavigationContext` struct in all three locations:
- `internal/access/models.go`
- `internal/managers/planning_manager.go`
- `main.go`

Update the field-by-field copying in `PlanningManager.LoadNavigationContext()` and `SaveNavigationContext()` to include the new field.

No new endpoints, no schema migration. The JSON file auto-gains the field on next save.

### Frontend

**`wails-mock.ts`**: Add `expandedOkrIds?: string[]` to the `NavigationContext` interface.

**`OKRView.svelte`**:
1. On mount (inside existing `onMount`), read `navCtx.expandedOkrIds` and populate `expandedIds` SvelteSet.
2. Add an `$effect` that watches `expandedIds.size` (to detect mutations) and saves the current set as an array to NavigationContext. Follow the same load-then-merge pattern used for `showCompleted`/`showArchived` to avoid overwriting other fields.

**`App.svelte`**: The `saveNavigationContext()` function currently only saves the App-level fields. The OKRView already saves its own fields independently by loading the full context, merging, and saving. No changes needed in App.svelte — the existing pattern handles it.

### Mock Bindings

The mock `NavigationContext` type and `localStorage` persistence in `wails-mock.ts` will automatically carry the new field since it serializes the full object. Just add the optional field to the TypeScript interface.

## Implementation Strategy

1. Add the Go field in all three struct locations and update the manager copy logic.
2. Update the TypeScript `NavigationContext` interface in `wails-mock.ts`.
3. Modify `OKRView.svelte` to load and save `expandedOkrIds`.
4. Run existing tests + lint + type checks to verify no regressions.

## Task Breakdown Preview

- [ ] Task 1: Add `ExpandedOkrIds` field to Go `NavigationContext` structs and manager copy logic
- [ ] Task 2: Add `expandedOkrIds` to TypeScript `NavigationContext` in `wails-mock.ts`
- [ ] Task 3: Load expanded IDs on mount and save on change in `OKRView.svelte`
- [ ] Task 4: Verify with lint, type check, and tests

## Dependencies

- No external dependencies.
- Internal: the existing NavigationContext save/load pipeline (Go persistence layer, Wails bindings, mock bindings).

## Success Criteria (Technical)

- Expanding nodes in OKR view, navigating away, and navigating back restores the expansion state.
- Closing and reopening the app restores the expansion state.
- An existing `navigation_context.json` without `expandedOkrIds` loads without error (all nodes collapsed by default).
- `make frontend-lint`, `make frontend-check`, and Go tests all pass.
- Browser mock bindings at `localhost:5173` persist expanded state in `localStorage`.

## Estimated Effort

- 4 tasks, all straightforward field additions and a single `$effect`.
- ~1 hour of implementation work. No architectural risk.
- Critical path: tasks 1-3 are sequential (backend field → TS type → Svelte integration). Task 4 is validation.

## Tasks Created
- [ ] #66 - Add ExpandedOkrIds field to Go NavigationContext structs (parallel: false)
- [ ] #67 - Add expandedOkrIds to TypeScript NavigationContext interface (parallel: false)
- [ ] #68 - Load and save expanded OKR IDs in OKRView.svelte (parallel: false)
- [ ] #69 - Run full verification suite (parallel: false)

Total tasks: 4
Parallel tasks: 0
Sequential tasks: 4
Estimated total effort: 1 hour
