---
name: support-focussing-on-multiple-themes-per-day
status: completed
created: 2026-03-08T08:14:18Z
completed: 2026-03-08T09:46:14Z
progress: 100%
prd: .pm/prds/support-focussing-on-multiple-themes-per-day.md
github: [Will be updated when synced to GitHub]
architect: off
---

# Epic: support-focussing-on-multiple-themes-per-day

## Overview

Change `DayFocus` from single-theme (`ThemeID string`) to multi-theme (`ThemeIDs []string`) across the full stack: Go backend structs/APIs, Wails bindings, frontend types, CalendarView visualization, and App.svelte today-focus handling. Multi-theme days render as vertical color stripes with gradient transitions. A standalone migration script converts existing data.

## Architecture Decisions

- **Single field rename, not new entity**: Replace `ThemeID string` with `ThemeIDs []string` on the same struct. No new tables/files/entities needed.
- **No backward-compat shims**: Migration is a prerequisite. The old `themeId` field is fully removed from production code after migration.
- **Leverage existing multi-select**: `ThemeOKRTree` component already supports multi-select via `selectedThemeIds: string[]`. The CalendarView dialog just needs to stop forcing single selection (removing the `ids[ids.length - 1]` extraction).
- **CSS gradient for stripes**: Use `linear-gradient` with equal-width color stops and ~2px gradient transitions. Pure computation per cell, no new CSS classes needed — generated as inline `background` style.
- **Ordering**: `ThemeIDs` array order matches the canonical theme list order (sorted by theme position in `themes` array), not insertion order. This ensures consistent stripe rendering.

## Technical Approach

### Backend Changes

**Files:** `internal/access/models.go`, `internal/access/plan_access.go`, `internal/managers/planning_manager.go`, `main.go`

1. **models.go**: `ThemeID string → ThemeIDs []string` with `json:"themeIds,omitempty"`
2. **plan_access.go**: `GetDayFocus`, `SaveDayFocus`, `GetYearFocus` — no logic changes needed (they just pass the struct through). File I/O serializes the new field automatically.
3. **planning_manager.go**: `ClearDayFocus` sets `ThemeIDs: []string{}` instead of `ThemeID: ""`
4. **main.go**: Wails binding struct `DayFocus` gets `ThemeIDs []string`. The `SaveDayFocus` and `GetYearFocus` conversions between Wails struct and access struct update accordingly.
5. **Go tests**: All test files creating `DayFocus` with `ThemeID: "X"` change to `ThemeIDs: []string{"X"}`.

### Frontend Changes

**Files:** `frontend/src/lib/wails-mock.ts`, `frontend/src/views/CalendarView.svelte`, `frontend/src/App.svelte`, test files

1. **wails-mock.ts**:
   - Interface: `themeId: string` → `themeIds: string[]`
   - `ClearDayFocus`: set `themeIds: []` instead of `themeId: ''`
   - `GetDaysWithTheme`: filter with `.some(id => d.themeIds.includes(id))` instead of `===`

2. **CalendarView.svelte**:
   - State: `editThemeId: string` → `editThemeIds: string[]`
   - `getThemeColor` → `getThemeColors`: return `string[]` (array of colors for all assigned themes)
   - `CellData`: replace `color: string | null` with `colors: string[]`
   - Cell background: generate `linear-gradient(to right, ...)` for multi-theme, solid color for single-theme
   - Dialog `onThemeSelectionChange`: store full array directly (remove last-element extraction)
   - `handleDayClick`: load `focus.themeIds ?? []`
   - `saveDayFocus`: pass `themeIds` array
   - `DAY_FOCUS_FIELDS`: change `'themeId'` to `'themeIds'`

3. **App.svelte**:
   - `todayFocusThemeId: string` → `todayFocusThemeIds: string[]`
   - `resolveTodayFocus` returns `themeIds` array
   - Today-focus toggle sets `filterThemeIds = todayFocusThemeIds`

### Gradient Visualization

For a cell with N theme colors `[c1, c2, ..., cN]`:
- Single theme: `background-color: {c1}20`  (existing behavior)
- Multiple themes: `background: linear-gradient(to right, {c1}20 0%, {c1}20 {band1}%, {c2}20 {band1+2px}%, {c2}20 {band2}%, ...)`
- Band width: `100% / N` per theme
- Transition: ~2px gradient between color stops
- No themes: white/default (or Sunday tint)

A helper function `themeColorsToBackground(colors: string[]): string` computes the CSS value.

### Migration Script

**File:** `scripts/migrate-theme-id-to-theme-ids.go` (standalone, not imported by production code)

- Reads all `~/.bearing/data/calendar/*.json` files
- For each `DayFocus` entry: converts `"themeId": "X"` to `"themeIds": ["X"]`, removes `"themeId"`
- Empty `themeId: ""` → omit `themeIds` (matches `omitempty`)
- Idempotent: if `themeIds` already exists, skip
- Commits via go-git after migration

## Task Breakdown Preview

- [ ] Task 1: Backend data model change — Go structs, APIs, Wails bindings, Go tests
- [ ] Task 2: Frontend data model + visualization — wails-mock.ts, CalendarView (multi-select dialog + gradient stripes), App.svelte, frontend tests
- [ ] Task 3: Migration script — standalone Go utility to convert existing calendar JSON files

## Dependencies

- `ThemeOKRTree` component already supports multi-select (no changes needed)
- Calendar grid layout (day-of-month rows) is unaffected
- Migration must run before deploying new code

## Success Criteria (Technical)

- `DayFocus` struct uses `ThemeIDs []string` across Go and TypeScript
- No `themeId` (singular) references remain in production code
- CalendarView dialog allows selecting 0, 1, or N themes
- Multi-theme cells render vertical color stripes with gradient transitions
- Single-theme cells render solid color (visual parity with current behavior)
- All Go tests pass (`make test-backend`)
- All frontend tests pass (`make test-frontend`)
- `make lint` passes
- State verification (`checkStateFromData`) works with `themeIds`
- Migration script converts existing data correctly and is idempotent

## Tasks Created
- [ ] 186.md - Backend data model — ThemeID to ThemeIDs (parallel: true)
- [ ] 187.md - Frontend multi-theme support + gradient visualization (parallel: false, depends on 186)
- [ ] 188.md - Migration script — themeId to themeIds (parallel: true)

Total tasks: 3
Parallel tasks: 2 (186, 188)
Sequential tasks: 1 (187 depends on 186)
Estimated total effort: 7-11 hours

## Estimated Effort

- 3 tasks, medium complexity
- Task 186 (backend): S (2-3h) — mechanical rename across Go files + tests
- Task 187 (frontend): M (4-6h) — data model + gradient visualization + dialog change + tests
- Task 188 (migration): XS (1-2h) — standalone script reading/writing JSON
- Critical path: 186 → 187. Task 188 is independent.
