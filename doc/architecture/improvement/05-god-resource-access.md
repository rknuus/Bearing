> **RESOLVED** -- PlanAccess split into ThemeAccess, TaskAccess, CalendarAccess, VisionAccess (UIStateAccess already existed).

# 05 — PlanAccess Is a God Resource Access

## Finding

`IPlanAccess` has 30+ methods spanning themes, calendar, tasks, task ordering, board configuration, version control, navigation, vision, and task drafts. It handles 7+ different JSON files/directories through one interface. The Method targets ~2.2 interfaces per service with ~3-5 operations per interface.

## Severity: High

## Urgency: Soon

Every change to task persistence risks breaking theme persistence because they share the same RA and the same struct.

## Current State

**`internal/access/plan_access.go:19-73`** — `IPlanAccess` with 30+ methods:

| Resource | Methods | File(s) Accessed |
|----------|---------|--------------------|
| Themes | `GetThemes`, `SaveTheme`, `DeleteTheme` | `themes/themes.json` |
| Calendar | `GetDayFocus`, `SaveDayFocus`, `GetYearFocus` | `calendar/{year}.json` |
| Tasks | `GetTasksByTheme`, `GetTasksByStatus`, `SaveTask`, `SaveTaskWithOrder`, `UpdateTaskWithOrderMove`, `MoveTask`, `ArchiveTask`, `RestoreTask`, `DeleteTask`, `DeleteTaskWithOrder` | `tasks/{status}/{id}.json` |
| Task Order | `LoadTaskOrder`, `SaveTaskOrder`, `WriteTaskOrder` | `task_order.json` |
| Board Config | `GetBoardConfiguration`, `SaveBoardConfiguration`, `EnsureStatusDirectory`, `RemoveStatusDirectory`, `RenameStatusDirectory`, `UpdateTaskStatusField`, `BoardConfigFilePath`, `TaskOrderFilePath`, `TaskDirPath` | `board_config.json` |
| Version Control | `CommitFiles`, `CommitAll` | N/A (git operations) |
| Navigation | `LoadNavigationContext`, `SaveNavigationContext` | `navigation_context.json` |
| Vision | `LoadVision`, `SaveVision` | `vision.json` |
| Task Drafts | `LoadTaskDrafts`, `SaveTaskDrafts` | `tasks/drafts.json` |

**Also contains business logic** (see Finding 03):
- `SuggestAbbreviation` (line 973)
- `ensureThemeIDs` (line 1033)
- `generateTaskID` (line 1129)
- `Slugify` (in models.go:290)
- `DefaultBoardConfiguration` (in models.go:173)

## Target State

Split into 3 Resource Access components aligned with the Manager decomposition:

### 1. ThemeAccess
Methods: `GetThemes`, `SaveTheme`, `DeleteTheme`
Resource: `themes/themes.json`

### 2. TaskAccess
Methods: Task CRUD, Task Order, Board Config, Directory management
Resources: `tasks/**`, `task_order.json`, `board_config.json`

### 3. CalendarAccess
Methods: `GetDayFocus`, `SaveDayFocus`, `GetYearFocus`
Resource: `calendar/{year}.json`

### Separate concerns
- **VisionAccess**: `LoadVision`, `SaveVision` → `vision.json` (or fold into ThemeAccess since vision is thematically related to OKR)
- **UIStateAccess**: `LoadNavigationContext`, `SaveNavigationContext`, `LoadTaskDrafts`, `SaveTaskDrafts` → direct file I/O without git (Finding 09)

## Steps

1. **Create `internal/access/theme_access.go`** with `IThemeAccess`:
   ```go
   type IThemeAccess interface {
       GetThemes() ([]LifeTheme, error)
       SaveTheme(theme LifeTheme) error
       DeleteTheme(id string) error
   }
   ```

2. **Create `internal/access/task_access.go`** with `ITaskAccess`:
   ```go
   type ITaskAccess interface {
       GetTasksByStatus(status string) ([]Task, error)
       GetTasksByTheme(themeID string) ([]Task, error)
       SaveTask(task Task) error
       SaveTaskWithOrder(task Task, dropZone string) (*Task, error)
       UpdateTaskWithOrderMove(task Task, oldZone, newZone string) error
       MoveTask(taskID, newStatus string) error
       ArchiveTask(taskID string) error
       RestoreTask(taskID string) error
       DeleteTask(taskID string) error
       DeleteTaskWithOrder(taskID string) error
       LoadTaskOrder() (map[string][]string, error)
       SaveTaskOrder(order map[string][]string) error
       WriteTaskOrder(order map[string][]string) error
       GetBoardConfiguration() (*BoardConfiguration, error)
       SaveBoardConfiguration(config *BoardConfiguration) error
       EnsureStatusDirectory(slug string) error
       RemoveStatusDirectory(slug string) error
       RenameStatusDirectory(oldSlug, newSlug string) error
       CommitAll(message string) error
   }
   ```

3. **Create `internal/access/calendar_access.go`** with `ICalendarAccess`:
   ```go
   type ICalendarAccess interface {
       GetDayFocus(date string) (*DayFocus, error)
       SaveDayFocus(day DayFocus) error
       GetYearFocus(year int) ([]DayFocus, error)
   }
   ```

4. **Create `internal/access/vision_access.go`** with `IVisionAccess`.

5. **Move method implementations** from `plan_access.go` to the appropriate new files. Each RA gets its own struct with `dataPath` and `repo`.

6. **Remove `IPlanAccess`** once all consumers use the specific interfaces.

7. **Update Manager constructors** to accept the specific RA interfaces:
   ```go
   func NewOKRManager(themeAccess IThemeAccess, visionAccess IVisionAccess) (*OKRManager, error)
   func NewTaskBoardManager(taskAccess ITaskAccess) (*TaskBoardManager, error)
   func NewCalendarManager(calendarAccess ICalendarAccess) (*CalendarManager, error)
   ```

8. **Update `main.go` startup** to create individual RA instances and wire them.

## Risk

- **Medium risk**: Splitting the RA is mostly mechanical but touches every test file.
- **Shared Repository**: All RA components share the same git Repository utility. This is correct — the Repository is a Utility, and multiple RAs can use the same instance.
- **Shared `dataPath`**: All RAs point to the same root directory. Each RA manages its own subdirectory within it.
- **ID generation**: `generateTaskID` and `ensureThemeIDs` must move to their respective RAs (or to the Manager per Finding 03).

## Dependencies

- **Do together with**: Finding 04 (God Manager) — splitting Manager and RA together ensures clean wiring.
- **Do after**: Finding 03 (misplaced logic) — remove business logic from RA before splitting.
- **Enables**: Finding 07 (subsystem boundaries) — each Manager+RA pair becomes a subsystem.
