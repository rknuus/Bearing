# 07 — No Subsystem Boundaries Despite Multiple Concern Areas

## Finding

The system has a single Manager, single RA, single Engine, and no subsystems. The Method says: "Treat subsystems as the unit of extensibility and scale." The system has at least three natural subsystems based on volatility analysis.

## Severity: Medium

## Urgency: Soon

Without subsystem boundaries, changing board configuration logic risks breaking theme management because they share the same Manager and RA.

## Current State

The entire backend is one flat set of components:
```
Clients:          BearingClient, App
Managers:         PlanningManager (1, does everything)
Engines:          RuleEngine (1, only task rules)
Resource Access:  PlanAccess (1, does everything)
Utilities:        Repository (1)
```

All components live in the same deployment unit. There are no subsystem boundaries in the package structure or the `.method` file.

## Target State

Three subsystems, each with its own Manager and RA:

### Subsystem 1: OKR
```
Manager:  OKRManager
Engine:   ProgressEngine (new)
RA:       ThemeAccess, VisionAccess
```
Encapsulates: `vol-okr-hierarchy`, `vol-okr-lifecycle`, `vol-progress-computation`, `vol-personal-vision`

### Subsystem 2: TaskBoard
```
Manager:  TaskBoardManager
Engine:   RuleEngine (existing)
RA:       TaskAccess
```
Encapsulates: `vol-task-management`, `vol-task-board-rules`, `vol-board-configuration`, `vol-task-ordering`

### Subsystem 3: Calendar
```
Manager:  CalendarManager
Engine:   (none needed currently)
RA:       CalendarAccess
```
Encapsulates: `vol-calendar-focus`

### Shared
```
Utilities: Repository (shared across all subsystems)
```

### Cross-subsystem communication
- **Calendar → OKR**: The CalendarView references theme IDs and OKR IDs in day focus entries. This is a data reference (IDs), not a call dependency. No Manager-to-Manager call needed.
- **TaskBoard → OKR**: Tasks reference theme IDs. Again, a data reference. No cross-subsystem call needed at the backend level.
- **Today Focus Filtering**: Entirely client-side. The client reads from both CalendarManager and TaskBoardManager and applies filtering locally.

## Steps

1. **Complete Findings 04 and 05 first** — split the Manager and RA into three each.

2. **Create package structure**:
   ```
   internal/
     managers/
       okr_manager.go
       taskboard_manager.go
       calendar_manager.go
     engines/
       rule_engine/          (existing)
       progress_engine/      (new, Finding 08)
     access/
       theme_access.go
       task_access.go
       calendar_access.go
       vision_access.go
       models.go             (shared data types)
   ```

3. **Update `.method` file** topology to reflect subsystems using theagent tools.

4. **Update `main.go`** to instantiate components per subsystem:
   ```go
   // OKR subsystem
   themeAccess := access.NewThemeAccess(repoPath, repo)
   visionAccess := access.NewVisionAccess(repoPath, repo)
   progressEngine := progress_engine.NewProgressEngine()
   okrManager := managers.NewOKRManager(themeAccess, visionAccess, progressEngine)

   // TaskBoard subsystem
   taskAccess := access.NewTaskAccess(repoPath, repo)
   ruleEngine := rule_engine.NewRuleEngine(rule_engine.DefaultRules())
   taskBoardManager := managers.NewTaskBoardManager(taskAccess, ruleEngine)

   // Calendar subsystem
   calendarAccess := access.NewCalendarAccess(repoPath, repo)
   calendarManager := managers.NewCalendarManager(calendarAccess)
   ```

5. **Verify no cross-subsystem calls** at the Manager level. Each Manager only calls its own RA and Engine(s).

## Risk

- **Shared models.go**: The data types (`LifeTheme`, `Task`, `DayFocus`, etc.) are currently all in `access/models.go`. After splitting, each RA should ideally own its own types. However, some types are referenced across subsystems (e.g., theme IDs in tasks). A shared `internal/domain/types.go` or keeping `access/models.go` as shared types is acceptable initially.
- **Package explosion**: Going from 4 packages to 8+ packages adds complexity. Keep subsystems in the same top-level packages (managers, engines, access) — subsystem boundaries are logical, not necessarily separate Go modules.

## Dependencies

- **Depends on**: Finding 04 (God Manager) and Finding 05 (God RA) — must split components before defining subsystems.
- **Depends on**: Finding 01 (Engine dependency inversion) — Engine must not import access types.
- **This is the culmination** of findings 01-05. Once those are done, subsystem boundaries emerge naturally.
