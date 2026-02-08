---
name: fixup-calendar
status: completed
created: 2026-02-01T14:33:58Z
updated: 2026-02-06T12:00:00Z
completed: 2026-02-06T12:00:00Z
progress: 100%
prd: .pm/prds/fixup-calendar.md
github: https://github.com/rknuus/Bearing/issues/11
---

# Epic: fixup-calendar

## Overview

Fix the Calendar view which is stuck on "Loading calendar..." indefinitely. The issue is that `window.go.main.App` is not available when the CalendarView component mounts, because the mock bindings are initialized in App.svelte's `onMount` but CalendarView's `onMount` runs before or concurrently.

## Root Cause Analysis

After reviewing the code, the issue is clear:

1. **CalendarView.svelte** (lines 41-48):
   ```typescript
   function getBindings() {
     return window.go?.main?.App;  // Returns undefined if mocks not ready
   }

   onMount(async () => {
     await loadData();  // Calls getBindings() which returns undefined
   });
   ```

2. **App.svelte** (lines 234-241):
   ```typescript
   onMount(() => {
     if (!isWailsRuntime()) {
       initMockBindings();  // Sets up window.go.main.App
     }
     // ...
   });
   ```

3. **The Problem**: Svelte's `onMount` callbacks execute in component render order. CalendarView's `onMount` may run before App.svelte's `onMount` completes, so `window.go.main.App` is still undefined when CalendarView tries to fetch data.

4. **In Wails mode**: The bindings are injected by the Wails runtime before any JavaScript runs, so this race condition doesn't exist.

5. **In browser mode**: The mocks are not initialized until App.svelte's `onMount`, creating a race condition.

## Architecture Decisions

- **Fix initialization order**: Initialize mock bindings synchronously at module load time, not in `onMount`
- **Keep existing API**: No changes to component APIs or backend
- **Minimal change**: Only modify the mock initialization timing

## Technical Approach

### Solution

Move `initMockBindings()` call from App.svelte's `onMount` to module-level execution in App.svelte (or in main.ts/index.ts if it exists). This ensures mocks are available before any component mounts.

### Alternative Considered

Adding a reactive check in CalendarView to wait for bindings - rejected because it adds complexity to every view component instead of fixing the root cause.

## Implementation Strategy

1. Move mock initialization to happen synchronously at app startup
2. Verify calendar loads in both browser and Wails modes
3. Ensure no regression in other views

## Task Breakdown Preview

- [ ] Fix mock binding initialization timing
- [ ] Verify calendar loads correctly in browser mode
- [ ] Verify no regression in Wails mode

## Dependencies

- None - this is a self-contained frontend fix

## Success Criteria (Technical)

- Calendar view loads within 2 seconds in browser mode (`make frontend-dev`)
- Calendar view loads within 2 seconds in Wails mode (`make dev`)
- No console errors related to "bindings not available"
- OKR and EisenKan views continue to work correctly

## Estimated Effort

- Small: Single file change (1-2 lines)
- Low risk: Well-understood initialization order issue
- Quick verification: Manual testing in both modes

## Tasks Created

- [ ] #12 - Fix mock binding initialization timing (parallel: false)
- [ ] #13 - Verify calendar functionality in browser mode (parallel: false, depends on #12)
- [ ] #14 - Verify no regression in Wails mode (parallel: true, depends on #12)

Total tasks: 3
Parallel tasks: 1 (Task #14 can run alongside Task #13)
Sequential tasks: 2 (Tasks #12 → #13)
Estimated total effort: 1.5 hours
