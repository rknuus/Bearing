# 02 — DTOs Shared Across Layers

## Finding

Access-layer types (`access.Task`, `access.LifeTheme`, `access.Objective`, `access.KeyResult`, `access.DayFocus`, `access.PersonalVision`, `access.BoardConfiguration`) flow through the Manager layer unchanged and are exposed in the Manager's public interface. The Manager's `TaskWithStatus` struct directly embeds `access.Task`. The RuleEngine receives `*access.Task` directly (addressed in Finding 01).

## Severity: Critical

## Urgency: Immediate

The Method says: "Never share DTOs between use cases at the Manager layer; never leak internal DTOs outward or Manager DTOs inward." When the access layer's storage schema changes, the Manager's public API breaks — a clear contract violation.

## Current State

**`internal/managers/planning_manager.go:20-23`** — `TaskWithStatus` embeds `access.Task`:
```go
type TaskWithStatus struct {
    access.Task
    Status string `json:"status"`
}
```

**`internal/managers/planning_manager.go:42-44`** — Manager interface returns access types:
```go
GetThemes() ([]access.LifeTheme, error)
CreateTheme(name, color string) (*access.LifeTheme, error)
UpdateTheme(theme access.LifeTheme) error
```

**`internal/managers/planning_manager.go:68-69`** — Calendar methods use access types:
```go
GetYearFocus(year int) ([]access.DayFocus, error)
SaveDayFocus(day access.DayFocus) error
```

**`internal/managers/planning_manager.go:74`** — CreateTask returns access type:
```go
CreateTask(...) (*access.Task, error)
```

**`internal/managers/planning_manager.go:87`** — GetBoardConfiguration returns access type:
```go
GetBoardConfiguration() (*access.BoardConfiguration, error)
```

**`internal/managers/planning_manager.go:106-107`** — Vision methods use access types:
```go
GetPersonalVision() (*access.PersonalVision, error)
```

**`main.go:298-367`** — The gateway converts between its own DTOs and access DTOs, bypassing the Manager layer's types entirely.

## Target State

The Manager layer defines its own DTOs for its public interface. The Manager transforms access DTOs to manager DTOs internally. The gateway converts between its Wails DTOs and manager DTOs (not access DTOs).

```
Gateway:  main.Task, main.LifeTheme    → converts to/from → Manager DTOs
Manager:  managers.Task, managers.Theme → converts to/from → access.Task, access.LifeTheme
Access:   access.Task, access.LifeTheme (internal, not exposed)
```

## Steps

1. **Define Manager-layer DTOs** in a new file `internal/managers/models.go`:
   - `managers.Theme` (mirrors `access.LifeTheme` shape)
   - `managers.Objective` (mirrors `access.Objective` shape)
   - `managers.KeyResult` (mirrors `access.KeyResult` shape)
   - `managers.Routine` (mirrors `access.Routine` shape)
   - `managers.Task` (with all task fields, no embedding)
   - `managers.TaskWithStatus` (embeds `managers.Task`, not `access.Task`)
   - `managers.DayFocus` (mirrors `access.DayFocus`)
   - `managers.BoardConfiguration` (mirrors `access.BoardConfiguration`)
   - `managers.PersonalVision` (mirrors `access.PersonalVision`)

2. **Add conversion functions** in `internal/managers/converters.go`:
   - `toManagerTheme(access.LifeTheme) Theme`
   - `toAccessTheme(Theme) access.LifeTheme`
   - `toManagerTask(access.Task) Task`
   - `toAccessTask(Task) access.Task`
   - Similar for DayFocus, BoardConfiguration, PersonalVision.

3. **Update `IPlanningManager` interface** to use manager types instead of access types:
   ```go
   GetThemes() ([]Theme, error)
   CreateTheme(name, color string) (*Theme, error)
   UpdateTheme(theme Theme) error
   ```

4. **Update all Manager method implementations** to convert at boundaries:
   - Call access layer → receive access DTO → convert to manager DTO → return manager DTO
   - Receive manager DTO from caller → convert to access DTO → call access layer

5. **Update `main.go`** to convert between Wails DTOs and manager DTOs (not access DTOs):
   - Remove `import "github.com/rkn/bearing/internal/access"` from main.go
   - Update `convertObjective`/`convertObjectiveToAccess` to use manager types
   - Update all method implementations in `main.go`

6. **Run tests**: All existing tests must pass. Manager tests will need updates to use the new types.

## Risk

- **Medium risk**: This is a large refactoring touching the Manager interface, all Manager methods, and the gateway. Must be done carefully to avoid regressions.
- **Verbose conversion code**: The initial Manager DTOs will mirror access DTOs closely. This is intentional — they represent independent contracts that can diverge over time.
- **Test effort**: `planning_manager_test.go` and `main.go` tests (if any) will need type updates.

## Dependencies

- **Do after**: Finding 01 (Engine dependency inversion) — reduces one consumer of access types.
- **Related to**: Finding 06 (God Gateway) — once Manager has its own DTOs, the gateway converts against manager types, simplifying main.go.
- **Can be done incrementally**: Start with `Task`/`TaskWithStatus` (most used), then `LifeTheme`/`Objective`/`KeyResult`, then remaining types.
