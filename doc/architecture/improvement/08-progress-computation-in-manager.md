# 08 — Progress Computation Belongs in an Engine

## Finding

`computeKRProgress()`, `computeObjectiveProgress()`, and `GetAllThemeProgress()` implement recursive progress rollup calculations directly in the Manager. Progress computation is a stateless calculation over a dataset — exactly what Engines are for.

## Severity: Medium

## Urgency: Soon

The Manager should orchestrate, not compute. This logic will become more complex as progress formulas evolve (weighted averages, different rollup strategies).

## Current State

**`internal/managers/planning_manager.go:2020-2036`** — `computeKRProgress`:
```go
func computeKRProgress(kr access.KeyResult) float64 {
    if kr.TargetValue == 0 { return -1 }
    rangeVal := float64(kr.TargetValue - kr.StartValue)
    if rangeVal == 0 { return 0 }
    progress := float64(kr.CurrentValue-kr.StartValue) / rangeVal * 100
    // clamp to 0-100
}
```

**`internal/managers/planning_manager.go:2039-2041`** — `isActiveOKRStatus` helper:
```go
func isActiveOKRStatus(status string) bool {
    return status == "" || status == "active"
}
```

**`internal/managers/planning_manager.go:2045-2089`** — `computeObjectiveProgress` — recursive function that:
1. Collects progress from active KRs
2. Collects progress from active child objectives (recursion)
3. Averages all progress values
4. Returns the objective's progress and a flat list of all nested objective progress entries

**`internal/managers/planning_manager.go:2092-2137`** — `GetAllThemeProgress` — iterates themes, calls `computeObjectiveProgress` for each active top-level objective, averages results per theme.

Total: ~120 lines of computation logic in the Manager.

## Target State

A new `ProgressEngine` in `internal/engines/progress_engine/` that:
1. Receives theme data as its own input DTO
2. Computes progress using the current algorithm
3. Returns progress results as its own output DTO
4. Is stateless and trivially testable

## Steps

1. **Create `internal/engines/progress_engine/` package** with two files:
   - `models.go` — input/output DTOs
   - `progress_engine.go` — interface and implementation

2. **Define input DTOs** (no access imports):
   ```go
   // models.go
   type KeyResultData struct {
       ID           string
       Status       string
       StartValue   int
       CurrentValue int
       TargetValue  int
   }

   type ObjectiveData struct {
       ID         string
       Status     string
       KeyResults []KeyResultData
       Objectives []ObjectiveData  // recursive
   }

   type ThemeData struct {
       ID         string
       Objectives []ObjectiveData
   }
   ```

3. **Define output DTOs**:
   ```go
   type ObjectiveProgress struct {
       ObjectiveID string
       Progress    float64  // 0-100 or -1
   }

   type ThemeProgress struct {
       ThemeID    string
       Progress   float64
       Objectives []ObjectiveProgress
   }
   ```

4. **Define interface**:
   ```go
   type IProgressEngine interface {
       ComputeAllThemeProgress(themes []ThemeData) []ThemeProgress
   }
   ```

5. **Move computation logic** from `planning_manager.go` to `progress_engine.go`:
   - `computeKRProgress` → private method on `ProgressEngine`
   - `computeObjectiveProgress` → private method on `ProgressEngine`
   - `isActiveOKRStatus` → private helper in the engine
   - `GetAllThemeProgress` orchestration remains in Manager but delegates computation

6. **Add conversion in Manager**:
   ```go
   func (m *OKRManager) GetAllThemeProgress() ([]ThemeProgress, error) {
       themes, err := m.themeAccess.GetThemes()
       if err != nil { return nil, err }
       themeData := toProgressThemeData(themes)  // convert access → engine input
       return m.progressEngine.ComputeAllThemeProgress(themeData), nil
   }
   ```

7. **Write tests** for the ProgressEngine independently of any access or manager types.

8. **Remove progress types** from `planning_manager.go` (lines 135-146: `ObjectiveProgress`, `ThemeProgress`).

9. **Update `.method` file** to add the ProgressEngine component.

## Risk

- **Low risk**: The computation is already a pure function with no side effects. Moving it to a new package is mechanical.
- **Test coverage**: Existing progress tests in `planning_manager_test.go` should be migrated to `progress_engine_test.go` and can test the engine directly.
- **No behavioral change**: The algorithm stays identical.

## Dependencies

- **Independent**: Can be done at any time since it's a new package with no conflicts.
- **Do before**: Finding 04 (God Manager) — the ProgressEngine should exist before the OKRManager is created, so the OKRManager can use it.
- **Must follow**: Finding 01 (Engine dependency inversion) pattern — the ProgressEngine must not import access types.
