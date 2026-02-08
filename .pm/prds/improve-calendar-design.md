---
name: improve-calendar-design
description: Redesign calendar grid to weekday-aligned layout with rectangular text cells per day
status: completed
created: 2026-02-06T14:48:58Z
---

# PRD: improve-calendar-design

## Executive Summary

Redesign the CalendarView from a simple 31-row × 12-column numeric grid to a weekday-aligned layout where each month's days are positioned at their actual weekday row. Each day gets a rectangular text cell for free-text entry alongside its day number. The result is a calendar that reads like a real planner — days of the week on the left, months flowing across, and inline text showing what each day is about.

## Problem Statement

### The Problem

The current calendar is a uniform 31×12 grid where every month starts at row 1. This obscures the actual day-of-week structure — you can't see at a glance which days are Mondays, which are weekends, or how the weeks flow. The square cells are too small for text and don't communicate any content beyond a colored dot. It functions more as a color-coding heatmap than a usable planner.

### Why This Matters Now

The calendar is the mid-term planning layer that bridges long-term OKRs and short-term tasks. For it to serve that role, users need to see *what* they planned for each day, not just *which theme* it belongs to. A weekday-aligned layout with text cells transforms the calendar from a passive color display into an active planning surface.

## User Stories

### US-01: Weekday-Aware Year Overview

**As a** Bearing user,
**I want** to see my year calendar aligned by weekdays (Mon–Sun),
**So that** I can see the rhythm of my week and spot patterns across months at a glance.

**Acceptance Criteria:**
- Left column shows weekday labels (Mon, Tue, Wed, Thu, Fri, Sat, Sun) repeating for each calendar week row
- Weeks start on Monday
- January 1, 2026 (Thursday) appears in the "Thu" row; February 1, 2026 (Sunday) appears in the "Sun" row
- Empty cells appear where a month has no day for that weekday slot (e.g., Jan has no Mon/Tue/Wed in its first week)

### US-02: Day Text Entry

**As a** Bearing user,
**I want** to enter free text for any day in the calendar,
**So that** I can note my planned focus, appointments, or reminders directly in the year overview.

**Acceptance Criteria:**
- Each day has a rectangular text cell (width ≈ 4–5× height)
- Text is displayed in a single line, cropped (not wrapped, not resized) if it exceeds the cell width
- Text persists across sessions (stored in the data model)
- Cell height accommodates exactly 1 row of text at the default font size

### US-03: Clear Sunday Distinction

**As a** Bearing user,
**I want** Sundays to be visually distinct from other days,
**So that** I can quickly identify week boundaries in the grid.

**Acceptance Criteria:**
- Sunday rows have a distinct background color (e.g., light blue or light gray)
- Saturday rows have the same background as weekdays (no special treatment)
- When a theme color is assigned to a Sunday: the day-number cell retains the Sunday background; the text cell shows the theme color
- When a theme color is assigned to a non-Sunday: both cells show the theme color background

### US-04: Month-Day Number Column

**As a** Bearing user,
**I want** to see the day-of-month number next to each text cell,
**So that** I can quickly identify specific dates without counting rows.

**Acceptance Criteria:**
- Each month has two sub-columns: a narrow day-number column and a wider text column
- Day numbers are right-aligned in their column
- The day-number column is narrow (just wide enough for "31")
- Month header spans both sub-columns

## Requirements

### Functional Requirements

#### FR-01: Weekday-Aligned Grid Layout

Replace the current 31-row × 12-column grid with a weekday-aligned layout:

- **Rows:** 7 weekday slots (Mon–Sun) repeated for the maximum number of calendar weeks any month spans in the displayed year. For 2026 this is 6 weeks = 42 rows.
- **Columns:** 1 weekday-label column + 12 × 2 month columns (day number + text) = 25 columns total.
- **Alignment:** Each month's day 1 is placed at the row matching its weekday (Monday-based: Mon=row 1, Tue=row 2, ... Sun=row 7 within each week group).
- **Empty cells:** Rows before a month's first day and after its last day within the grid are left empty/blank.

#### FR-02: Weekday Label Column

- Leftmost column displays abbreviated weekday names: Mon, Tue, Wed, Thu, Fri, Sat, Sun.
- Labels repeat for each week row (6 repetitions for a 6-week month year).
- Labels use sticky positioning (remain visible during horizontal scroll).

#### FR-03: Full Month Names in Header

- Month header row displays full month names: January, February, March, ..., December.
- Each month header spans its two sub-columns (day number + text).
- Headers use sticky positioning (remain visible during vertical scroll).

#### FR-04: Rectangular Cell Dimensions

- Text cells have a width-to-height ratio of approximately 4–5:1.
- Cell height fits exactly 1 line of text at the component's base font size.
- Day-number cells are narrow (width sized to fit "31" comfortably).

#### FR-05: Free-Text Day Content

- Each day's text cell supports inline free-text entry.
- Text is stored as a new `text` field in the DayFocus data model.
- Text displays in a single line with `overflow: hidden` and `text-overflow: ellipsis`.
- No font-size changes or cell resizing based on content length.

#### FR-06: Sunday Background Styling

- Sunday rows receive a distinct background color (subtle, e.g., `#eef2ff` or similar light tint).
- Saturday rows and weekday rows share the same default background.
- When a theme color is assigned to a Sunday:
  - Day-number cell: retains Sunday background color.
  - Text cell: displays theme color as background.
- When a theme color is assigned to any other day:
  - Both day-number and text cells display theme color as background.

#### FR-07: Theme Assignment via Modal

- Clicking a day cell opens the existing edit modal dialog.
- Modal allows theme selection (dropdown) and text entry (text input replacing the notes textarea).
- Save/Cancel/Clear behavior unchanged from current implementation.

#### FR-08: Theme Legend

- Retain the theme legend below the grid showing all themes with their color badges.
- Clicking a theme legend item navigates to OKRView (existing behavior).

#### FR-09: Remove Task Count Badges

- Remove the task count badge overlay from day cells.
- This declutters the new rectangular cell layout.

### Non-Functional Requirements

#### NFR-01: Performance

- Year data loads within 2 seconds (existing requirement, unchanged).
- Grid rendering should remain smooth — no layout thrashing from 42×25 cells.

#### NFR-02: Scroll Behavior

- Horizontal scrolling with sticky weekday labels (left) and sticky month headers (top).
- Smooth scroll to "today" when clicking the Today button.

#### NFR-03: Responsiveness

- Grid supports horizontal scroll on narrow viewports (same as current behavior).
- Minimum cell width ensures text remains legible.

## Success Criteria

1. Weekday labels (Mon–Sun) appear in the left column, repeating per week.
2. Each month's days are aligned to the correct weekday row (e.g., Jan 1 2026 on Thu, Feb 1 on Sun).
3. Month headers show full names (January, February, ...).
4. Each day has two sub-columns: a narrow day number and a wider text cell.
5. Text cells are rectangular (~4–5:1 width:height ratio) and crop overflow with ellipsis.
6. Only Sunday rows have a distinct background color.
7. Theme color assignment respects the Sunday rule (day-number cell keeps Sunday bg).
8. Free-text can be entered and persisted for any day.
9. Task count badges are removed from cells.
10. Theme legend is present below the grid.

## Constraints & Assumptions

### Constraints

- Must work within the existing Svelte 5 + Wails architecture.
- Must use the existing `DayFocus` data model (extended with a `text` field).
- Pure CSS styling (no CSS framework introduction).
- Must maintain cross-view navigation (to OKRView via legend, to EisenKanView via other means).

### Assumptions

- The `text` field will be added to the `DayFocus` struct in Go and exposed via Wails bindings.
- The mock bindings will be updated to support the `text` field.
- The maximum number of calendar weeks per year (6) is sufficient for all years.
- Users are comfortable with horizontal scrolling to see all 12 months.

## Out of Scope

1. **Drag-to-assign themes** — bulk painting across multiple days.
2. **Inline cell editing** — text entry happens via the existing modal for now.
3. **Month/week summary statistics** — no per-month theme breakdowns.
4. **Streak/pattern visualization** — no connected-day indicators.
5. **Keyboard navigation** — tab/arrow between cells.
6. **Traditional monthly view** — no single-month zoom mode.
7. **Dark mode** — not addressed in this PRD.

## Dependencies

### Internal

- **Go backend**: Add `text` field to `DayFocus` struct and update JSON serialization.
- **Wails bindings**: Regenerate TypeScript types after Go model change.
- **Mock bindings**: Update `wails-mock.ts` with `text` field support.
- **Existing CalendarView**: This PRD replaces the current grid layout entirely.

### External

- None.
