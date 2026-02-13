---
name: consistently-format-dates-by-locale
description: Auto-detect OS locale and use it to consistently format all user-facing dates across native and browser environments
status: backlog
created: 2026-02-13T16:08:13Z
---

# PRD: consistently-format-dates-by-locale

## Executive Summary

All user-facing dates in Bearing should be formatted according to the user's OS locale settings, and this formatting must be consistent between the native Wails app and the browser-based development/test environment. Currently, dates are either hardcoded in specific formats or rely on `toLocaleDateString(undefined, ...)` which produces different results in WKWebView vs Chrome because browsers ignore macOS regional format settings.

## Problem Statement

Bearing runs in three environments with different locale behavior:

1. **Native Wails app (WKWebView)** — inherits macOS system locale, so `toLocaleDateString()` respects regional settings.
2. **Wails dev proxy (localhost:34115)** — uses the browser's own language setting, ignoring OS regional format preferences.
3. **Vite dev server (localhost:5173)** — same browser locale issue as above.

A user with English language but Swiss regional settings (e.g. `dd.MM.yyyy` date format) sees different date formatting across environments. Additionally, some dates are hardcoded in specific formats (e.g. `dd-Mon-yyyy` in CalendarView) or displayed as raw ISO strings (e.g. `2025-01-15` on task cards), bypassing locale formatting entirely.

This is confusing and makes the browser-based test environment an unreliable representation of the native app.

## User Stories

### US1: Consistent date display across environments
**As a** user with non-US regional settings,
**I want** all dates in the app to be formatted according to my OS locale,
**so that** dates look familiar and consistent regardless of how I run the app.

**Acceptance Criteria:**
- Dates displayed in the native app and browser-based app use the same format
- The format matches the user's macOS regional settings (not browser language)
- No hardcoded date formats remain in user-facing display code

### US2: Locale-formatted task dates
**As a** user viewing the EisenKan board,
**I want** task card dates (dayDate) to be displayed in my locale format,
**so that** I can quickly read dates without mentally parsing ISO format.

**Acceptance Criteria:**
- Task card dates like `2025-01-15` render as e.g. `15.01.2025` (Swiss) or `1/15/2025` (US)
- ISO format is preserved internally for storage and API communication
- The date is still clickable for navigation

### US3: Locale-formatted calendar dates
**As a** user viewing the Calendar view,
**I want** dates and month/weekday names to respect my locale,
**so that** the calendar feels native to my regional settings.

**Acceptance Criteria:**
- Calendar day display uses locale-appropriate format
- Month names use locale-appropriate names (currently hardcoded English)
- Weekday names use locale-appropriate abbreviations (currently hardcoded English)

## Requirements

### Functional Requirements

1. **Go backend locale detection**: Add a `GetLocale()` API that reads the OS locale (via `LANG`, `LC_TIME`, or macOS-specific APIs like `defaults read NSGlobalDomain AppleLocale`) and returns a BCP 47 locale tag (e.g. `en-CH`, `de-CH`).

2. **Frontend locale provider**: Create a shared utility that stores the detected locale and provides formatting functions. The locale is fetched once on app startup via `GetLocale()`.

3. **Date formatting utility**: Provide a `formatDate(isoString: string): string` function (and variants for different display needs) that uses `Intl.DateTimeFormat` with the detected locale. All user-facing date rendering must go through this utility.

4. **Browser fallback**: In the browser-only environment (Vite mock bindings), the mock `GetLocale()` should return `navigator.language` as a reasonable default, since OS locale detection is not available. Document that for accurate locale testing, use the native app or Wails dev mode.

5. **Migrate all date display points**:
   - `EisenKanView`: header "today" display, task card `dayDate` values, context menu day label
   - `CalendarView`: `displayDate()`, `monthNames`, `shortMonthNames`, `weekdayNames`
   - `EisenhowerQuadrant`: `today` display on pending task cards
   - `CreateTaskDialog` / `EditTaskDialog`: date input fields use native `<input type="date">` which already respects browser locale — no change needed for inputs, but any displayed date text should use the utility

### Non-Functional Requirements

- **Performance**: Locale detection happens once on startup. `Intl.DateTimeFormat` objects should be cached (created once per format variant), not instantiated on every render.
- **No external dependencies**: Use built-in `Intl` APIs — no date formatting libraries.
- **Backward compatibility**: Internal date storage remains ISO 8601 (`YYYY-MM-DD`). Only display formatting changes.

## Success Criteria

- All user-facing dates use the OS-detected locale for formatting
- Native app and browser-based Wails dev app display identical date formats
- No hardcoded English month/weekday names in display code
- No raw ISO date strings shown to users
- Existing tests pass; new tests cover the formatting utility

## Constraints & Assumptions

- **Assumption**: macOS provides a readable locale setting via `defaults read NSGlobalDomain AppleLocale` or `LANG` environment variable. This needs verification on the target system.
- **Assumption**: `Intl.DateTimeFormat` with a specific locale tag produces the expected regional format in both WKWebView and Chrome.
- **Constraint**: The Vite-only browser environment cannot detect OS locale — the mock fallback uses `navigator.language`, which may differ from OS settings. This is acceptable since the Vite environment is for development only.
- **Constraint**: `<input type="date">` fields are browser-controlled and cannot be overridden to use a custom locale. Their display is acceptable as-is.

## Out of Scope

- User-configurable locale override in app settings (auto-detect only for now)
- Time formatting (the app currently only displays dates, not times)
- Right-to-left (RTL) locale support
- Server-side date formatting — all formatting happens client-side
- Changing date storage format (remains ISO 8601)

## Dependencies

- **Go backend**: Needs a new `GetLocale()` binding method
- **Wails bindings regeneration**: After adding the Go method, Wails bindings must be regenerated
- **Mock bindings update**: `wails-mock.ts` needs a `GetLocale` mock implementation
