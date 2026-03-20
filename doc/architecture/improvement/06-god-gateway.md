# 06 — App Struct Is a God Gateway with Logic

## Finding

`main.go` is 1337 lines. The `App` struct defines 40+ public methods, performs DTO conversion (business transformation), initialization orchestration, error handling, and logging — all inline. The Method says: "Never put code in the Gateway."

## Severity: High

## Urgency: Soon

The gateway contains recursive DTO conversion logic, business decisions (GetLocale with OS-specific fallback), and full DTO type definitions duplicated from the access layer.

## Current State

**`main.go:30-34`** — App struct holds a single Manager reference:
```go
type App struct {
    ctx             context.Context
    planningManager *managers.PlanningManager
    logFile         *os.File
}
```

**`main.go:170-295`** — 14 DTO struct definitions (KeyResult, Objective, Routine, LifeTheme, DayFocus, Task, TaskWithStatus, SectionDefinition, ColumnDefinition, BoardConfiguration, ObjectiveProgress, ThemeProgress, PersonalVision, NavigationContext) that duplicate access-layer types.

**`main.go:298-367`** — Two recursive conversion functions (`convertObjective`, `convertObjectiveToAccess`) that mirror each other. These are business transformations, not gateway concerns.

**`main.go:137-167`** — `GetLocale()` with macOS-specific `defaults read` fallback. This is platform detection logic, not a gateway operation.

**`main.go:43-106`** — `startup()` performs orchestration: data directory resolution, logger setup, repository initialization, component wiring. While initialization must happen somewhere, the gateway should delegate to a factory or bootstrap function.

**Pattern repeated 40+ times**: Every method follows the same template:
```go
func (a *App) SomeMethod(args...) (result, error) {
    if a.planningManager == nil { return nil/error }
    result, err := a.planningManager.SomeMethod(args...)
    if err != nil { slog.Error(...); return nil/err }
    // convert DTOs
    return converted, nil
}
```

## Target State

The gateway (App struct) should be a thin pass-through:
1. **No DTO conversion**: Manager returns types that are directly Wails-serializable, or a separate converter package handles the mapping.
2. **No business logic**: `GetLocale()` moves to a utility.
3. **No orchestration**: Startup logic moves to a bootstrap/factory function.
4. **Minimal boilerplate**: The nil-check + log + convert pattern should be eliminated through better design.

## Steps

1. **Move `GetLocale()`** to `internal/utilities/locale.go` as a standalone function `DetectLocale() string`. The gateway calls `utilities.DetectLocale()`.

2. **Extract startup orchestration** into a factory function:
   ```go
   // internal/bootstrap/bootstrap.go
   func Initialize(bearingDir string) (*managers.OKRManager, *managers.TaskBoardManager, *managers.CalendarManager, error)
   ```
   The gateway's `startup()` calls this factory. The factory handles repository init, PlanAccess creation, and Manager wiring.

3. **Eliminate gateway DTOs** (depends on Finding 02):
   Once the Manager layer has its own DTOs with proper JSON tags, the gateway can return Manager types directly through Wails bindings. This eliminates `main.go:170-295` entirely and removes `convertObjective`/`convertObjectiveToAccess`.

   If Wails requires specific struct tags or types that differ from Manager DTOs, create a thin `internal/gateway/converter.go` package — but keep it out of `main.go`.

4. **Reduce boilerplate**: After Manager decomposition (Finding 04), each gateway method routes to the correct Manager. The nil-check pattern becomes a single check per Manager at startup time (fail-fast). If the Manager is non-nil after startup, no per-method nil checks are needed.

5. **Reduce main.go to ~200 lines**: After all moves, `main.go` should contain only:
   - `App` struct with Manager references
   - `startup()` calling the bootstrap factory
   - `shutdown()`
   - Thin pass-through methods (one line each)

## Risk

- **Wails binding constraints**: Wails requires exported methods on the bound struct. Cannot use interfaces or multiple structs without additional binding setup. This limits how thin the gateway can be.
- **DTO serialization**: Wails may require specific JSON tag conventions. Verify that Manager DTOs serialize correctly before removing gateway DTOs.
- **main.go is the entry point**: Changes here affect the application's startup. Test thoroughly with both native and dev modes.

## Dependencies

- **Depends on**: Finding 02 (shared DTOs) — Manager must have its own DTOs before gateway DTOs can be removed.
- **Depends on**: Finding 04 (God Manager) — gateway routes to multiple Managers after decomposition.
- **Can start with**: Moving `GetLocale()` and extracting startup orchestration (independent of other findings).
