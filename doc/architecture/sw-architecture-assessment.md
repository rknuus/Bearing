# Software Architecture Assessment

> Assessment date: 2026-03-20
> Scope: Full system — bearing.method, Go backend (internal/), Wails gateway (main.go), Svelte frontend, sequence diagrams

---

## What's Good

### 1. Clean layer separation in the Go backend

The codebase has genuine Manager/Engine/ResourceAccess/Utility layering. `PlanningManager` orchestrates calls to `PlanAccess` and `RuleEngine`. The utility layer provides git-backed persistence. Calling direction is strictly downward — no upward or lateral calls in production code. This is exactly what closed architecture demands.

### 2. Interface-driven design throughout

Every layer is fronted by an explicit interface: `IPlanningManager`, `IPlanAccess`, `IRuleEngine`, `IRepository`, `ITransaction`. The Manager depends on `access.IPlanAccess` (not `*PlanAccess`). This enables testability and enforces contract boundaries.

### 3. Git-backed ACID-like transactions for data integrity

The `ITransaction` / `Begin()`/`Stage()`/`Commit()` pattern serializes writes per repository using canonical-path-keyed mutexes. Combined with atomic operations like `SaveTaskWithOrder` (task file + task_order.json in a single git transaction), this gives real atomicity guarantees for a file-based store. The `validateTaskOrder()` startup repair is good defensive programming — it heals stale state on boot.

### 4. Engine is genuinely stateless

`RuleEngine` receives all context through `TaskEvent` (including `AllTasks` for WIP-limit checks). It holds no state, makes no external calls, and is trivially testable. This is correct Engine behavior: it evaluates a condition and returns a result.

### 5. DTO boundary between Wails and internal types

`main.go` defines its own structs for Wails binding and manually converts to/from `access.*` types. While verbose, this prevents Wails serialization concerns from leaking into internal layers.

### 6. Frontend state verification pattern

The `state-check.ts` utility and its usage pattern (`checkFullState` after mutations) is an unusual and valuable pattern. After the frontend optimistically applies a change, it re-fetches backend state and compares. This catches frontend/backend drift early. Few projects do this deliberately.

### 7. Comprehensive sequence diagram documentation

The 17 sequence diagrams in `doc/architecture/diagrams/` cover every interaction pattern from theme CRUD to startup initialization to batch operations. They accurately reflect the code. This is rare — most projects either lack diagrams or have diagrams that lie.

---

## What's Bad

### 1. The `.method` file is completely empty — architecture exists only in code

The `bearing.method` file contains zero components, zero volatilities, zero use cases. Yet the code has a fully functioning system with a Manager, an Engine, a Resource Access component, and a Utility.

**Rationale:** The entire point of The Method is that the architecture is defined first, and code implements it. Here it is backwards. There is no volatility analysis, no identified axes of change, no core use cases in the formal model. The `.method` file says the project has zero components when it has at least four. Architecture without a model is just code that happens to be organized well today.

### 2. The App struct in `main.go` is a God Gateway with logic

`main.go` is 1337 lines. The `App` struct defines 40+ public methods, performs DTO conversion (business transformation), initialization orchestration, error handling, and logging — all inline.

**Rationale:** The Method says: "Never put code in the Gateway — it is a security boundary, not a place for logic or orchestration." Yet App contains recursive DTO conversion logic (`convertObjective`, `convertObjectiveToAccess`), business decisions like `GetLocale()` with macOS-specific fallback, and full DTO type definitions duplicated from the access layer. The `convertObjective` function appears twice (one for each direction) with identical recursive structure — a sign that the contract boundary is in the wrong place.

### 3. Only one Manager does everything — PlanningManager is a feature bucket

`PlanningManager` is 2138 lines with 38 methods covering themes, objectives, key results, routines, tasks, board configuration, navigation context, task drafts, personal vision, progress computation, and priority promotions.

**Rationale:** The Method limits Managers to ~5 without subsystems, each encapsulating a single volatility axis. `PlanningManager` encapsulates at least 5 distinct volatilities: OKR hierarchy, task board, calendar/focus, vision/progress, and UI state. The Method says 3–5 operations per interface; this one has 38.

### 4. PlanAccess is also a God Component

`IPlanAccess` has 30+ methods spanning themes, calendar, tasks, task ordering, board configuration, versioning, navigation, vision, and task drafts. It handles file I/O, JSON marshaling, directory management, ID generation, and git operations.

**Rationale:** Resource Access should be confined to access volatility only — "not processing, judgment, or interpretation." But PlanAccess performs ID generation (`generateTaskID`, `SuggestAbbreviation`, `ensureThemeIDs`), directory structure decisions (`ensureDirectoryStructure`), and slug generation (`Slugify`). Multiple distinct resources (7+ different JSON files/directories) are accessed through one RA component. IDesign targets ~2.2 interfaces per service with ~3–5 operations per interface; this has one interface with 30 methods.

### 5. Business logic in the wrong layers

Several pieces of business logic are misplaced:

| Logic | Current location | Correct location |
|-------|-----------------|-----------------|
| `SuggestAbbreviation()` | access | Engine or Manager |
| `Slugify()` | access | Utility |
| `DefaultBoardConfiguration()` | access | Manager |
| `IsValidPriority()`, `IsValidOKRStatus()` | access | Engine or Manager |
| `computeKRProgress()`, `computeObjectiveProgress()` | Manager | Engine |
| `validateTaskOrder()` startup repair | Manager | Engine |

**Rationale:** The Method requires: "Keep Managers as pure orchestration — a sequence of calls with data-contract transformation. Logic creeping in is a Method smell." The Manager has computation logic and data repair logic. The access layer has business rules and utility functions. When the access layer knows that "important-urgent" is a valid priority, the database has been given opinions about the business.

### 6. The RuleEngine has a dependency inversion violation

In `internal/engines/rule_engine/models.go`: `import "github.com/rkn/bearing/internal/access"`. The `TaskEvent` struct references `*access.Task`.

**Rationale:** This is a hard layering violation. Engines sit above Resource Access but below Managers. Engines should never reference RA types — they should define their own input contract. The Manager should transform access DTOs into engine DTOs before calling. If the storage representation of a Task changes, the rule engine breaks. The brain has been coupled to the filing cabinet.

### 7. DTOs are shared and reused across layers

`access.Task`, `access.LifeTheme`, `access.Objective` are used directly by the Manager. The Manager's `TaskWithStatus` embeds `access.Task`. The RuleEngine receives `*access.Task` directly.

**Rationale:** The Method says: "Never share DTOs between use cases at the Manager layer; never leak internal DTOs outward or Manager DTOs inward." Access-layer DTOs flow through the Manager unchanged and are passed into the Engine, creating cross-layer coupling.

### 8. No subsystem boundaries despite multiple concern areas

The system has a single Manager, single RA, single Engine, and no subsystems.

**Rationale:** The Method says: "Treat subsystems as the unit of extensibility and scale." This system has at least three natural subsystems: OKR (themes/objectives/KRs), Task Board (kanban/rules/ordering), and Calendar (day focus). Currently, changing board configuration logic risks breaking theme management because they share the same Manager and RA.

### 9. NavigationContext and TaskDrafts are pass-through toll booths

`LoadNavigationContext`, `SaveNavigationContext`, `LoadTaskDrafts`, `SaveTaskDrafts` are pass-through operations in the Manager — no orchestration, no validation, no rule evaluation.

**Rationale:** These are pure UI state persistence concerns with no business logic and no volatility to encapsulate. The Manager acts as a proxy adding zero value. Methods that do nothing but `return m.planAccess.LoadTaskDrafts()` are not orchestration.

### 10. Progress computation belongs in an Engine, not the Manager

`computeKRProgress()`, `computeObjectiveProgress()`, and `GetAllThemeProgress()` implement recursive progress rollup calculations directly in the Manager.

**Rationale:** Progress computation is a stateless calculation over a data set — exactly what Engines are for. The Manager should pass OKR data to a progress Engine and receive computed results. Instead, the Manager does the math itself, violating "Managers as pure orchestration."

### 11. Excessive git commits for routine operations

Every single save operation creates a git commit. Updating a key result's `currentValue` from 5 to 6 creates a commit. Saving a day focus note creates a commit.

**Rationale:** While git-backed versioning is a valid persistence strategy, committing on every field update creates significant I/O overhead and an enormous commit history with low signal-to-noise ratio. This is a deployment/infrastructure concern leaking into the architecture. The Method says: "Separate architecture from deployment from infrastructure."

---

## Resolution Progress

> Last updated: 2026-03-21

### Resolved

| # | Finding | Commit | What changed |
|---|---------|--------|-------------|
| 01 | RuleEngine dependency inversion | `91382a4` | Engine defines own `TaskData` DTO; no `access` import in engines |
| 02 | Shared DTOs across layers | `942fef8` | Manager defines own types; `IPlanningManager` no longer exposes `access.*` |
| 03 | Misplaced business logic (Phase 1+2) | `a03a2a6` | Validators, `Slugify`, `SuggestAbbreviation`, `DefaultBoardConfiguration` moved to correct layers; `ProgressEngine` created |
| 04 | God Manager | 2026-03-21 | `PlanningManager` decomposed into 7 facet interfaces + `WorkspaceManager` extracted for board column config |
| 05 | God Resource Access | 2026-03-21 | `PlanAccess` split into `ThemeAccess`, `TaskAccess`, `CalendarAccess`, `VisionAccess` (+ existing `UIStateAccess`) |
| 08 | Progress computation in Manager | `a03a2a6` | New `ProgressEngine` at `internal/engines/progress_engine/` |
| 09 | Pass-through toll booths | 2026-03-21 | New `UIStateAccess` RA; Manager stays in path (closed architecture); fixed lossy DTO conversion (7 fields were silently dropped) |
| 06 | God Gateway | 2026-03-21 | Gateway reduced to thin pass-through; `GetLocale()` → utilities; startup → bootstrap; DTOs eliminated; nil-checks removed |

### Remaining — Prioritized

| Priority | # | Finding | Severity | Urgency | Next action |
|----------|---|---------|----------|---------|-------------|
| 1 | 07 | No subsystem boundaries | Medium | Soon | Formalize topology now that Manager/RA decomposition exists |
| 2 | 10 | Method file tracking | Medium | When convenient | Ongoing — update `.method` as code evolves |
| 3 | 11 | Excessive git commits | Low | When convenient | Batch commits per use case; infrastructure concern |
| — | 03 | validateTaskOrder() remainder | Low | When convenient | Move data repair logic from Manager to Engine |
| — | — | IGoalStructure CRUD consolidation | Medium | When convenient | Consolidate 16 CRUD methods into fewer behavioral verbs |

### Recommended execution order

1. **Finding 07** (subsystems) — formalize the boundaries that now exist
2. **IGoalStructure consolidation** — reduce CRUD interface to behavioral verbs
3. **Findings 10, 11, 03-remainder** — ongoing and opportunistic

---

## Summary

The codebase has sound instincts — interface-driven design, downward-only dependencies, atomic transactions, and state verification. These reflect genuine architectural thinking.

The critical layering violations have been resolved (Findings 01, 02, 03, 08, 09). The structural decomposition is now complete: `PlanningManager` exposes 7 volatility-driven facet interfaces (`IGoalStructure`, `IGoalLifecycle`, `ITaskExecution`, `IFocusPlanning`, `IVision`, `IProgress`, `IUIState`), workspace configuration is encapsulated by `WorkspaceManager`, and `PlanAccess` has been split into `ThemeAccess`, `TaskAccess`, `CalendarAccess`, `VisionAccess`, and `UIStateAccess` (Findings 04, 05).

The remaining work is formalizing subsystem boundaries in the topology (Finding 07) and consolidating the `IGoalStructure` facet from 16 CRUD-style methods into fewer behavioral verbs.
