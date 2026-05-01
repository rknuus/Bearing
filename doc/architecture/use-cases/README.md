# Use Case Interaction Diagrams

One sequence diagram per use case in `bearing.method`, showing the full front- and backend interaction flow.

Participant aliases used throughout: `User`, `View` (Svelte view), `App` (Wails binding gateway in `main.go`), `PM` (PlanningManager), `WM` (WorkspaceManager), `AM` (AdviceManager), `RE` (RuleEngine), `PE` (ProgressEngine), `CE` (ChatEngine), `SE` (ScheduleEngine), `TA`/`TaA`/`CA`/`VA`/`UI`/`RoA`/`MA` (access components), `Repo` (Repository utility), `FS` (filesystem / git).

## Index

| Use case | Manager | Title |
|---|---|---|
| [uc-1](uc-01-manage-okr-hierarchy.md) | PlanningManager | Manage OKR Hierarchy |
| [uc-2](uc-02-manage-tasks.md) | PlanningManager | Manage Tasks |
| [uc-3](uc-03-focus-daily-work.md) | PlanningManager | Focus Daily Work |
| [uc-4](uc-04-configure-board.md) | WorkspaceManager | Configure Board |
| [uc-5](uc-05-batch-create-tasks.md) | PlanningManager | Batch Create Tasks |
| [uc-6](uc-06-compute-progress.md) | PlanningManager / ProgressEngine | Compute Progress |
| [uc-7](uc-07-initialize-system.md) | bootstrap / App | Initialize System |
| [uc-8](uc-08-verify-frontend-backend-state.md) | (cross-cutting) | Verify Frontend-Backend State |
| [uc-9](uc-09-manage-personal-vision.md) | PlanningManager | Manage Personal Vision |
| [uc-10](uc-10-persist-ui-state.md) | PlanningManager / AdviceManager | Persist UI State |
| [uc-11](uc-11-reorder-tasks.md) | PlanningManager | Reorder Tasks |
| [uc-12](uc-12-request-goal-advice.md) | AdviceManager | Request Goal Advice |

## Drift Summary (.method model vs. codebase)

**Status: aligned.** The previously documented drift items have all been reconciled in `bearing.method` via `theagent_*` write tools. The diagrams above remain code-accurate and now match the model.

What was reconciled:

| Area | Resolution |
|---|---|
| **OKR public API (uc-1)** | Model now uses behavioral quartet `Establish` / `Revise` / `RecordProgress` / `Dismiss` (plus `GetHierarchy`, `SuggestAbbreviation`, status/close/reopen). |
| **RoutineAccess component** | Added as a first-class `resource_access` component, assigned to the OKR subsystem; used by both `PlanningManager` and `AdviceManager`. |
| **Routines storage (uc-1, uc-3, uc-12)** | Routine sequences route through `RoutineAccess` against global `routines.json` (no longer through `ThemeAccess`). |
| **Bootstrap (uc-7)** | `App.startup` delegates to `bootstrap.Initialize()` as the composition root, which constructs all access components, engines, and managers. |
| **Overdue collapse (uc-3)** | Model documents collapse to a single entry per routine with `MissedCount`, only emitted when `date == today`. |
| **Sync cross-manager call (uc-12)** | `AdviceManager → PlanningManager AcceptSuggestion` marked `sync: true`. |
| **ProgressEngine (uc-6)** | Stale "should be extracted" assessment removed; description states delegation to `ProgressEngine`. |
| **Advisor enabled flag (uc-10)** | `UIStateAccess` description enumerates three concerns: navigation context, task drafts, advisor enabled flag. |
| **Schedule data on routines (uc-3)** | New `RescheduleRoutineOccurrence` sequence; `Routine.Exceptions []ScheduleException` documented. |
| **Subsystem hygiene** | New `Advisor` subsystem groups `AdviceManager`, `ChatEngine`, `ModelAccess` (previously unassigned). |

### Open architectural debt (intentional, with decisions)

| Finding | Use case | Decision (status) |
|---|---|---|
| `same-layer-call` — `AdviceManager → PlanningManager` synchronous call | uc-12 | *Accept synchronous AdviceManager → PlanningManager call as documented architectural debt* (`revisit`) |
| `client-orchestration` + `closed-layer-skip` — App calls 3 managers and access components during bootstrap | uc-7 | *Accept App-as-bootstrapper client-orchestration finding for uc-7* (`active`) |

These show up in `theagent_validate` output but are linked to architectural decisions explaining their intentional acceptance.
