---
name: consistently-format-dates-by-locale
status: backlog
created: 2026-02-13T16:09:43Z
progress: 0%
prd: .pm/prds/consistently-format-dates-by-locale.md
github: [Will be updated when synced to GitHub]
---

# Epic: consistently-format-dates-by-locale

## Overview

Add OS locale detection to the Go backend and a shared frontend date-formatting utility so that every user-facing date in Bearing is rendered consistently using `Intl.DateTimeFormat` with an explicit locale, eliminating environment-dependent formatting differences between WKWebView and Chrome.

## Architecture Decisions

- **Locale source: Go backend, not frontend** — The Go backend reads the OS locale once and exposes it via `GetLocale() string`. This is the only reliable way to get the actual macOS regional setting; browsers expose only language preference, not regional format. The frontend calls `GetLocale()` on startup and caches the result.
- **`Intl.DateTimeFormat` with cached formatters** — All date formatting uses the built-in `Intl` API with the backend-provided locale. Formatter instances are created once per format variant (short date, long date, weekday, month name) and reused.
- **Single formatting utility module** — A new `frontend/src/lib/utils/date-format.ts` module owns all formatting logic. Components import formatting functions rather than calling `toLocaleDateString` or hardcoding format strings directly.
- **ISO storage unchanged** — Internal date values remain `YYYY-MM-DD` strings. Formatting is display-only.
- **Mock fallback** — The mock `GetLocale()` returns `navigator.language` for the Vite-only environment. This is acceptable since the Vite environment is for development only.

## Technical Approach

### Backend (Go)

Add a `GetLocale()` method to the `App` receiver in `main.go` that:
1. Reads `defaults read NSGlobalDomain AppleLocale` (macOS-specific, returns e.g. `en_CH`)
2. Converts underscore notation to BCP 47 hyphen notation (`en_CH` → `en-CH`)
3. Falls back to `os.Getenv("LANG")` if the macOS command fails, parsing the locale prefix
4. Returns `"en-US"` as ultimate fallback

### Frontend

**New module: `frontend/src/lib/utils/date-format.ts`**
- `initLocale()` — calls `getBindings().GetLocale()`, caches result, creates `Intl.DateTimeFormat` instances
- `formatDate(iso: string)` — short date (e.g. `15.01.2025` for `de-CH`)
- `formatDateLong(iso: string)` — long date with weekday (e.g. `Mittwoch, 15. Januar 2025`)
- `formatMonthName(monthIndex: number)` — locale month name
- `formatShortMonthName(monthIndex: number)` — locale abbreviated month name
- `formatWeekdayShort(dayIndex: number)` — locale abbreviated weekday name (Mon-indexed)

**Initialization: `App.svelte`**
- Call `initLocale()` during app startup (before views render), alongside existing data loading

**Migration of display points:**
- `EisenKanView` — `formatToday()` uses `formatDateLong()`, task card `{task.dayDate}` uses `formatDate()`, context menu uses `formatDate()`
- `CalendarView` — `displayDate()` uses `formatDate()`, `monthNames`/`shortMonthNames`/`weekdayNames` replaced by formatting functions
- `EisenhowerQuadrant` — `today` uses `formatDate()`

### Mock Bindings

Add `GetLocale` to `mockAppBindings` in `wails-mock.ts` returning `navigator.language`.

## Implementation Strategy

The tasks are ordered to build the foundation first (backend + utility), then migrate views one at a time. Each task is independently testable.

### Testing Approach
- **Go**: Unit test for `GetLocale()` verifying it returns a valid BCP 47 tag
- **Frontend utility**: Unit tests for `date-format.ts` with a fixed locale (e.g. `de-CH`) verifying all format functions produce expected output
- **Component tests**: Existing tests continue to pass; date display assertions may need updating if they matched hardcoded formats

## Task Breakdown Preview

- [ ] Task 1: Add `GetLocale()` Go backend method + unit test
- [ ] Task 2: Create `date-format.ts` utility module with `initLocale()` and formatting functions + unit tests
- [ ] Task 3: Wire `initLocale()` into app startup (`App.svelte`) and add `GetLocale` to mock bindings
- [ ] Task 4: Migrate EisenKanView date displays to use formatting utility
- [ ] Task 5: Migrate CalendarView date displays and locale-aware month/weekday names
- [ ] Task 6: Migrate EisenhowerQuadrant date display

## Dependencies

- **Wails bindings regeneration**: After adding `GetLocale()` in Go, run `make generate` to produce TypeScript bindings
- **App startup sequencing**: `initLocale()` must complete before views render (it's a single async call, fast)

## Success Criteria (Technical)

- `GetLocale()` returns a valid BCP 47 locale tag on macOS
- All `toLocaleDateString(undefined, ...)` calls replaced with utility functions using the backend-provided locale
- All hardcoded English month/weekday name arrays removed from display code
- All raw ISO date strings (`YYYY-MM-DD`) displayed through `formatDate()`
- All existing tests pass; new tests cover `GetLocale()` and `date-format.ts`
- Native app and Wails dev proxy show identical date formatting

## Tasks Created
- [ ] 001.md - Add GetLocale() Go backend method (parallel: true)
- [ ] 002.md - Create date-format.ts utility module (parallel: true)
- [ ] 003.md - Wire locale initialization into app startup and mock bindings (parallel: false)
- [ ] 004.md - Migrate EisenKanView date displays (parallel: true)
- [ ] 005.md - Migrate CalendarView date displays and locale-aware names (parallel: true)
- [ ] 006.md - Migrate EisenhowerQuadrant date display (parallel: true)

Total tasks: 6
Parallel tasks: 5
Sequential tasks: 1
Estimated total effort: 9.5 hours

## Estimated Effort

- **6 tasks**, each small and focused
- Backend task (1) is independent; frontend tasks (2-6) are sequential but individually small
- Critical path: Task 1 → Task 2 → Task 3 → Tasks 4/5/6 (parallelizable)
