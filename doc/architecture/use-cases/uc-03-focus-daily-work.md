# uc-3 — Focus Daily Work

**Purpose:** Assign themes / OKR IDs / tags to calendar days, drive auto-filtering of EisenKan, and resolve routines for a date.

```mermaid
%%{init: {'themeVariables': {'signalTextColor':'#000'}}}%%
sequenceDiagram
    autonumber
    actor User
    participant View as CalendarView
    participant App as App.main_go
    participant PM as PlanningManager
    participant CA as CalendarAccess
    participant TA as ThemeAccess
    participant RoA as RoutineAccess
    participant SE as ScheduleEngine
    participant UI as UIStateAccess
    participant Repo as Repository
    participant FS as Filesystem_git

    rect rgb(245,245,255)
    Note over User,FS: Save Day Focus (with OKR tags)
    User->>View: Edit day cell, save
    View->>App: SaveDayFocus date, themeIds, notes, text, okrIds, tags
    App->>PM: SaveDayFocus DayFocus
    PM->>PM: validate date non-empty
    PM->>CA: SaveDayFocus toAccessDayFocus day
    CA->>FS: upsert calendar year.json sorted by date
    CA->>Repo: commitFiles calendar year.json, Save day focus date
    PM-->>View: nil
    View->>View: yearFocus.set date, day, verifyDayState
    end

    rect rgb(245,255,245)
    Note over User,FS: Today Focus auto-filter on EisenKan
    User->>View: Toggle Today Focus in EisenKan
    View->>App: GetYearFocus currentYear
    App->>PM: GetYearFocus year
    PM->>CA: GetYearFocus year, reads calendar year.json
    CA-->>View: list of DayFocus
    View->>View: resolve today entry, derive filterThemeIds and filterTagIds
    View->>App: SaveNavigationContext todayFocusActive=true, filterThemeIds, ...
    App->>PM: SaveNavigationContext ctx
    PM->>UI: SaveNavigationContext accessCtx (no git)
    UI->>FS: write navigation_context.json
    end

    rect rgb(255,250,235)
    Note over User,FS: Calendar Copy-Paste (Multi-Cell)
    User->>View: Multi-select cells, paste from clipboard cell
    loop per target day
        View->>App: SaveDayFocus targetDate, source themeIds, target notes preserved
        App->>PM: SaveDayFocus
        PM->>CA: SaveDayFocus day
        CA->>Repo: commitFiles per write (one commit per day)
    end
    end

    rect rgb(255,240,245)
    Note over User,FS: Get Routines For Date (scheduled, overdue, sporadic)
    User->>View: Open day editor or render routine row in calendar
    View->>App: GetRoutinesForDate date
    App->>PM: GetRoutinesForDate date
    PM->>RoA: GetRoutines (NOT ThemeAccess - routines are global)
    PM->>CA: GetYearFocus year (loads RoutineChecks completion data)
    PM->>PM: build checkedByDate map
    loop per routine
        alt sporadic (no RepeatPattern)
            PM->>PM: emit sporadic with checked flag
        else periodic
            PM->>SE: ComputeOccurrences pattern, exceptions, date, date
            SE-->>PM: occurrences for this date
            opt date equals today
                PM->>SE: ComputeOverdue pattern, exceptions, completedDates, today
                SE-->>PM: overdueDates
                PM->>PM: collapse to single entry with MissedCount equal len overdue
            end
        end
    end
    PM-->>View: list of RoutineOccurrence routineId, status, checked, missedCount
    View->>View: render in CalendarView day editor or routine strip
    end
```

## Notes — error / atomicity / git

- Day focus writes are git-committed per save; copy-paste is a loop of independent commits (not transactional across days).
- `SaveNavigationContext` is intentionally *not* git-committed (UI state only).

## Drift vs `bearing.method`

Aligned. The model now routes `GetRoutinesForDate` through `RoutineAccess` (routines are global), documents the overdue collapse to a single entry per routine with `MissedCount` (only emitted when `date == today`), and includes the `RescheduleRoutineOccurrence` sequence with `Routine.Exceptions []ScheduleException`.
