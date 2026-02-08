---
name: improve-calendar-design
status: completed
created: 2026-02-06T14:54:18Z
progress: 100%
prd: .pm/prds/improve-calendar-design.md
github: https://github.com/rknuus/Bearing/issues/28
---

# Epic: improve-calendar-design

## Overview

Redesign the CalendarView from a flat 31-row × 12-column grid into a weekday-aligned planner layout. The new grid has 42 rows (7 weekdays × 6 week slots) and 25 columns (1 weekday label + 12 months × 2 sub-columns each). Each day gets a narrow day-number cell and a wider rectangular text cell. The entire change is scoped to one Svelte component rewrite, one Go struct field addition, and corresponding type/mock updates.

## Architecture Decisions

- **Single component rewrite**: The entire visual change lives in `CalendarView.svelte`. No new components needed — the current file (748 lines) will be rewritten in place.
- **Additive data model change**: Add a `text` string field to `DayFocus` alongside the existing `notes` field. This is backward-compatible — existing JSON files without `text` will deserialize with an empty string (Go's zero value). No migration needed.
- **CSS Grid for layout**: Continue using CSS Grid (no framework). The grid template changes from `40px repeat(12, 1fr)` to `50px repeat(12, 24px 1fr)` to accommodate the weekday label + (day-number + text) pairs.
- **Computation over data**: Weekday alignment is computed from `new Date(year, month, 1).getDay()` at render time. No new backend APIs needed — the frontend already has all the data it needs from `GetYearFocus`.
- **Reuse existing modal pattern**: The edit dialog stays as a modal overlay. Only the form fields change (text input replaces notes textarea).

## Technical Approach

### Backend (Go)

**Files to modify:**
- `internal/access/models.go` — Add `Text string \`json:"text"\`` to `DayFocus` struct
- `main.go` — Add `Text string \`json:"text"\`` to the Wails binding `DayFocus` struct, update conversion functions between access and binding types

No changes needed to `SaveDayFocus`, `GetYearFocus`, `ClearDayFocus` logic — they persist the full struct, so the new field flows through automatically.

### Frontend Types & Mocks

**Files to modify:**
- `frontend/src/lib/wails/wailsjs/go/models.ts` — Add `text: string` property to `DayFocus` class
- `frontend/src/lib/wails-mock.ts` — Add `text` field to the `DayFocus` interface, update mock `SaveDayFocus`/`ClearDayFocus` to handle it

### Frontend Component (CalendarView.svelte)

**Grid layout rewrite:**
- Rows: 7 weekdays (Mon–Sun) × max_weeks (computed per year, typically 5–6) = up to 42 rows
- Columns: `50px repeat(12, 24px 1fr)` — weekday label, then per-month (day-number, text)
- Weekday labels in leftmost column, sticky left
- Full month names ("January"–"December") in header row, each spanning 2 columns, sticky top

**Date alignment computation:**
- `getMonthStartWeekday(year, month)`: Returns 0-6 (Mon=0 ... Sun=6) for the 1st of the month
- `getMaxWeeks(year)`: Computes max calendar weeks any month spans — `ceil((startWeekday + daysInMonth) / 7)` across all 12 months
- Each month's day N maps to row = `(startWeekday + N - 1)`, where row indices repeat in groups of 7

**Cell rendering:**
- Day-number cell: narrow (24px), right-aligned text, background follows theme color (except Sundays keep Sunday bg)
- Text cell: flexible width (1fr), left-aligned, single-line with `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`
- Cell height: `~1.5rem` (one line of text), giving a width:height ratio of ~4–5:1
- Sunday rows: subtle background tint (`#eef2ff`), day-number cell retains this even when themed
- Today indicator: outline on both sub-columns of today's date

**Removals:**
- Task count badges (rendering + `getTaskCount` function + `taskCounts` state)
- `aspect-ratio: 1` on cells (replaced by rectangular dimensions)
- Weekend detection for Saturdays (only Sundays are special now)
- Short month names constant (replaced by full names)

**Dialog updates:**
- Replace `<textarea>` for notes with `<input type="text">` for the `text` field
- Keep theme dropdown as-is
- Update save logic to persist `text` field
- Dialog title uses full month name

### Infrastructure

No deployment, scaling, or monitoring changes — this is a purely frontend + data model change for a desktop app.

## Implementation Strategy

**Development phases:**
1. Data model first (Go + types + mocks) — ensures the `text` field flows end-to-end before any UI work
2. Grid layout + cell rendering (the bulk of the work) — rewrite the Svelte template and CSS
3. Dialog update + integration verification — wire up text editing and verify all interactions

**Risk mitigation:**
- The existing `notes` field is preserved (not removed), so no data loss
- Mock bindings allow frontend development without running the Go backend
- The grid computation can be unit-tested by verifying weekday alignment against known dates (e.g., Jan 1 2026 = Thursday)

**Testing approach:**
- `make test` — Go unit tests verify DayFocus serialization with new `text` field
- `make test-frontend` — TypeScript type checking catches type mismatches
- Manual verification in `make frontend-dev` (browser mode with mocks) for visual layout correctness

## Task Breakdown Preview

- [ ] Task 1: Add `text` field to DayFocus data model (Go structs, TS types, mock bindings)
- [ ] Task 2: Rewrite CalendarView grid layout with weekday alignment (CSS grid, date computation, weekday labels, full month headers, sticky positioning)
- [ ] Task 3: Implement cell rendering and styling (day-number + text sub-columns, rectangular cells, Sunday background rules, theme colors, today indicator, text ellipsis, remove task badges)
- [ ] Task 4: Update edit dialog and save logic (text input field, persist text, full month names in title)
- [ ] Task 5: Verify integration and run tests (year navigation, today button, theme legend, cross-view navigation, Go tests, TS type checks)

## Dependencies

### Internal
- `internal/access/models.go` — DayFocus struct (modify)
- `main.go` — Wails DayFocus struct + conversion (modify)
- `frontend/src/lib/wails/wailsjs/go/models.ts` — Generated TS types (modify)
- `frontend/src/lib/wails-mock.ts` — Mock bindings (modify)
- `frontend/src/views/CalendarView.svelte` — Component rewrite (modify)

### External
- None

## Success Criteria (Technical)

1. `make test` passes — Go tests verify DayFocus with `text` field serializes/deserializes correctly
2. `make test-frontend` passes — No TypeScript type errors
3. Grid renders 42 rows × 25 columns with correct weekday alignment for 2026 (Jan 1 on Thu, Feb 1 on Sun, etc.)
4. Text cells display content with ellipsis overflow, cells are rectangular (~4–5:1 ratio)
5. Sunday rows have distinct background; themed Sundays keep Sunday bg on day-number cell
6. Edit dialog saves and loads `text` field correctly
7. Year navigation, today button, and theme legend work as before

## Estimated Effort

- **Task 1** (data model): Small — ~30 min, 5 files touched, additive only
- **Task 2** (grid layout): Large — ~2-3 hours, core algorithmic + CSS work
- **Task 3** (cell rendering): Medium — ~1-2 hours, mostly CSS + template
- **Task 4** (dialog update): Small — ~30 min, minor form changes
- **Task 5** (integration): Small — ~30 min, run tests + manual verification
- **Total**: ~5-7 hours
- **Critical path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 (sequential)

## Tasks Created

- [ ] #29 - Add text field to DayFocus data model (parallel: false)
- [ ] #30 - Rewrite CalendarView grid layout with weekday alignment (parallel: false)
- [ ] #31 - Implement cell rendering and styling (parallel: false)
- [ ] #32 - Update edit dialog and save logic for text field (parallel: false)
- [ ] #33 - Verify integration and run tests (parallel: false)

Total tasks: 5
Parallel tasks: 0
Sequential tasks: 5
Estimated total effort: 5.5 hours
