# 10 — The .method File Was Empty (Now Populated)

## Finding

At assessment time, the `bearing.method` file contained zero components, zero volatilities, and zero use cases. The architecture existed only in code. Since the assessment, the `.method` file has been populated with 13 identified volatilities, 3 rejected volatilities, 6 components, 3 core use cases, and 8 regular use cases.

## Severity: Medium

## Urgency: When convenient

The `.method` file now reflects the current architecture. However, it documents the *current* state (with all its violations), not the *target* state. As findings 01-09 are implemented, the `.method` file must be updated to reflect the evolving architecture.

## Current State

The `bearing.method` file accurately documents:
- **13 identified volatilities** covering OKR hierarchy, task management, board configuration, calendar focus, progress computation, persistence, UI state, state verification, today focus filtering, personal vision, and task ordering.
- **3 rejected volatilities**: Eisenhower matrix, Theme-Objective-KR nesting model, Desktop application platform.
- **6 components**: BearingClient, App, PlanningManager, RuleEngine, PlanAccess, Repository.
- **11 use cases** (3 core, 8 regular) with 24 sequence permutations.

But the `.method` file still describes the God components. It has one Manager, one RA, one Engine.

## Target State

As refactoring progresses, the `.method` file should be updated to reflect:
- 3 Managers (OKRManager, TaskBoardManager, CalendarManager)
- 2 Engines (RuleEngine, ProgressEngine)
- 4-5 Resource Access components (ThemeAccess, TaskAccess, CalendarAccess, VisionAccess, UIStateAccess)
- Subsystem topology
- Updated use case sequences reflecting the new component names

## Steps

1. **No immediate action required** — the `.method` file is already populated.

2. **As each finding is implemented**, update the `.method` file using `theagent_*` tools:
   - Finding 01: No `.method` change needed (internal Engine fix).
   - Finding 04: Use `theagent_add_component` to add new Managers, `theagent_remove_component` to remove PlanningManager, `theagent_rename_component` to update use case references.
   - Finding 05: Similarly for RA decomposition.
   - Finding 08: Use `theagent_add_component` to add ProgressEngine.
   - Finding 07: Update topology with subsystem groupings.

3. **Validate after each update**: Use `theagent_validate` to check for rule violations.

## Risk

- **Low risk**: Documentation updates are non-breaking.
- **Drift risk**: If code changes are made without updating the `.method` file, the model will drift again. Use the `drift` agent periodically to verify alignment.

## Dependencies

- **Tracks all other findings**: Each finding's implementation should include a `.method` file update step.
