> **RESOLVED** -- PlanningManager split into 7 facet interfaces (IGoalStructure, IGoalLifecycle, ITaskExecution, IFocusPlanning, IVision, IProgress, IUIState) + WorkspaceManager extracted for board column configuration.

# 04 — PlanningManager Is a God Manager

## Finding

`PlanningManager` is 2138 lines with 38 methods in `IPlanningManager` covering themes, objectives, key results, routines, tasks, board configuration, calendar, navigation context, task drafts, personal vision, progress computation, and priority promotions. The Method limits Managers to 3-5 operations per interface and targets ~2.2 interfaces per service.

## Severity: High

## Urgency: Soon

This does not block functionality but violates core Method principles. Every change to any concern risks breaking unrelated concerns because they share the same Manager.

## Current State

**`internal/managers/planning_manager.go:40-111`** — `IPlanningManager` interface with 38 methods:

| Concern | Methods | Count |
|---------|---------|-------|
| Themes | `GetThemes`, `CreateTheme`, `UpdateTheme`, `SaveTheme`, `DeleteTheme` | 5 |
| Objectives | `CreateObjective`, `UpdateObjective`, `DeleteObjective` | 3 |
| Key Results | `CreateKeyResult`, `UpdateKeyResult`, `UpdateKeyResultProgress`, `DeleteKeyResult` | 4 |
| OKR Status | `SetObjectiveStatus`, `SetKeyResultStatus`, `CloseObjective`, `ReopenObjective` | 4 |
| Calendar | `GetYearFocus`, `SaveDayFocus`, `ClearDayFocus` | 3 |
| Tasks | `GetTasks`, `CreateTask`, `MoveTask`, `UpdateTask`, `DeleteTask`, `ArchiveTask`, `ArchiveAllDoneTasks`, `RestoreTask`, `ReorderTasks` | 9 |
| Priority Promotions | `ProcessPriorityPromotions` | 1 |
| Board Config | `GetBoardConfiguration` | 1 |
| Theme Abbreviation | `SuggestThemeAbbreviation` | 1 |
| Navigation | `LoadNavigationContext`, `SaveNavigationContext` | 2 |
| Task Drafts | `LoadTaskDrafts`, `SaveTaskDrafts` | 2 |
| Routines | `AddRoutine`, `UpdateRoutine`, `DeleteRoutine` | 3 |
| Vision | `GetPersonalVision`, `SavePersonalVision` | 2 |
| Progress | `GetAllThemeProgress` | 1 |

**Struct**: `planning_manager.go:149-154` — holds `planAccess`, `ruleEngine`, `navigationContext`, `taskOrderMu`.

## Target State

Split into 3 Managers aligned with the identified volatilities:

### 1. OKRManager
Encapsulates: `vol-okr-hierarchy`, `vol-okr-lifecycle`, `vol-personal-vision`
Methods: Theme CRUD, Objective CRUD, KR CRUD, Routines, OKR Status, Vision
~20 methods → further decomposed via interface segregation into 3-4 facets

### 2. TaskBoardManager
Encapsulates: `vol-task-management`, `vol-task-board-rules`, `vol-board-configuration`, `vol-task-ordering`
Methods: Task CRUD, MoveTask, Archive/Restore, Reorder, Board Config, Priority Promotions
~15 methods → decomposed into 3-4 facets

### 3. CalendarManager
Encapsulates: `vol-calendar-focus`
Methods: GetYearFocus, SaveDayFocus, ClearDayFocus
~3 methods → single facet

### Removed from Managers
- NavigationContext, TaskDrafts → direct Gateway-to-RA (Finding 09)
- Progress computation → ProgressEngine (Finding 08)
- SuggestThemeAbbreviation → OKRManager or Engine

## Steps

1. **Create `internal/managers/okr_manager.go`** with `IOKRManager` interface containing:
   - Theme operations (5 methods)
   - Objective operations (3 methods)
   - Key Result operations (4 methods)
   - OKR Status operations (4 methods)
   - Routine operations (3 methods)
   - Vision operations (2 methods)
   - Abbreviation (1 method)

2. **Create `internal/managers/taskboard_manager.go`** with `ITaskBoardManager` interface containing:
   - Task CRUD (5 methods)
   - Task lifecycle (Archive, ArchiveAll, Restore — 3 methods)
   - Task movement (MoveTask, ReorderTasks — 2 methods)
   - Board configuration (GetBoardConfiguration, AddColumn, RemoveColumn, RenameColumn, ReorderColumns — 5 methods)
   - Priority promotions (1 method)

3. **Create `internal/managers/calendar_manager.go`** with `ICalendarManager` interface containing:
   - GetYearFocus, SaveDayFocus, ClearDayFocus (3 methods)

4. **Move method implementations** from `planning_manager.go` to the appropriate new files. Each Manager gets its own struct with only the dependencies it needs.

5. **Update `main.go`** to instantiate all three Managers and wire them:
   ```go
   type App struct {
       ctx              context.Context
       okrManager       *managers.OKRManager
       taskBoardManager *managers.TaskBoardManager
       calendarManager  *managers.CalendarManager
       logFile          *os.File
   }
   ```

6. **Update tests**: Split `planning_manager_test.go` into `okr_manager_test.go`, `taskboard_manager_test.go`, `calendar_manager_test.go`.

7. **Deprecate `PlanningManager`**: Either remove it entirely or keep it as a facade that delegates to the three new Managers (for backward compatibility during migration).

## Risk

- **High effort**: This is the largest refactoring in the plan. The Manager has 2138 lines of code and tests.
- **Cross-concern methods**: Some operations span concerns (e.g., `CreateTask` validates priority via OKR constants). These need clear contracts between Managers or shared validation utilities.
- **Test migration**: All tests reference `PlanningManager`. Must be updated method-by-method.
- **Gateway impact**: `main.go` references `a.planningManager` in 40+ places. Must be updated to route to the correct Manager.

## Dependencies

- **Do after**: Finding 01, 02, 03 — fix layering violations first so the new Managers are clean from the start.
- **Do together with**: Finding 05 (God RA) — splitting the Manager is most effective when the RA is also split, so each Manager has its own RA.
- **Enables**: Finding 07 (subsystem boundaries) — the three Managers become the roots of three subsystems.
