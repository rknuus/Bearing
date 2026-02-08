---
name: fixup-calendar
description: Fix Calendar view stuck on "Loading calendar..." - data never loads
status: completed
created: 2026-02-01T14:28:13Z
---

# PRD: fixup-calendar

## Executive Summary

The Calendar view in Bearing is non-functional due to an initial implementation defect. When navigating to the Calendar view, users see "Loading calendar..." indefinitely - the calendar grid never renders. This is a critical bug that blocks one of the three core planning layers.

## Problem Statement

### The Problem

The Calendar view fails to load and display the yearly 12×31 grid. Users cannot:
- View the yearly calendar
- Assign days to life themes
- Add notes to days
- See how their time is allocated across priorities

### Why This Matters Now

The Calendar view is one of the three core planning layers in Bearing. Without it, the mid-term planning capability is completely broken, undermining the core value proposition of interlinked planning layers.

### Observed Behavior

- **Expected**: Calendar view displays 12-month × 31-day grid with theme colors and day data
- **Actual**: Calendar view shows "Loading calendar..." message indefinitely
- **Affects**: Both `make dev` (Wails) and `make frontend-dev` (browser) modes

## User Stories

### US-01: View Calendar

**As an** intentional planner,
**I want to** open the Calendar view and see the yearly grid,
**So that** I can plan my daily focus across the year.

**Acceptance Criteria:**
- Calendar view renders within 2 seconds of navigation
- 12-month × 31-day grid is visible
- Weekend days are visually distinct from weekdays
- Previously assigned theme colors display on days
- Loading indicator disappears once data is loaded

## Requirements

### Functional Requirements

#### FR-01: Calendar Data Loading
- The system shall fetch year focus data when Calendar view mounts
- The system shall handle both empty data (new user) and existing data
- The system shall transition from loading state to rendered state upon data receipt

#### FR-02: Calendar Rendering
- The system shall display the 12×31 grid after data loads
- The system shall show theme colors on days with assigned themes
- The system shall display task count badges where applicable

### Non-Functional Requirements

#### NFR-01: Performance
- Calendar view shall render within 2 seconds
- Loading state shall be displayed during data fetch

#### NFR-02: Error Handling
- If data fetch fails, display error message instead of infinite loading
- Provide retry mechanism for failed loads

## Success Criteria

1. **Primary**: Calendar view loads and displays the yearly grid
2. **Secondary**: Theme assignments and notes are visible on days
3. **Measurable**: Loading completes in < 2 seconds

## Constraints & Assumptions

### Constraints
- Fix must work in both Wails and browser development modes
- Must not break existing OKR or EisenKan views

### Assumptions
- Backend `GetYearFocus` API is functional
- Issue is in frontend data fetching or state management

## Out of Scope

- OKR view issues (separate PRD if needed)
- EisenKan view issues (separate PRD if needed)
- New calendar features
- Performance optimization beyond basic loading

## Dependencies

### Internal Dependencies
- Backend `PlanningManager.GetYearFocus()` must be functional
- Wails bindings must expose calendar APIs correctly
- Mock data must be available for browser-only mode

## Technical Investigation Areas

Likely root causes to investigate:
1. **Wails binding**: `GetYearFocus` not properly exposed or called
2. **Mock implementation**: Browser mock missing or returning wrong data
3. **Async handling**: Promise/async not awaited correctly in Svelte 5
4. **State initialization**: Reactive state not triggering re-render
5. **Error swallowing**: Exception caught but not surfaced
