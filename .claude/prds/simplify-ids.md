---
name: simplify-ids
description: Replace hierarchical dot-notation IDs with flat, globally unique IDs across all OKR entities
status: backlog
created: 2026-02-07T14:27:25Z
---

# PRD: simplify-ids

## Executive Summary

Replace the current hierarchical dot-notation ID system (e.g., `THEME-01.OKR-01.OKR-01.KR-01`) with flat, globally unique IDs (e.g., `THEME-1`, `OBJ-22`, `KR-3`, `TASK-1`). Parent-child relationships will be tracked via explicit `parentId` fields instead of encoding hierarchy in the ID string.

## Problem Statement

Objective and key result IDs grow linearly with nesting depth. A key result three levels deep becomes `THEME-01.OKR-01.OKR-01.KR-01` — hard to read, reference, and display. The hierarchy encoded in the ID is redundant since the data model already stores entities in nested structures. Additionally, the current naming is inconsistent: themes use `THEME-##`, objectives use `OKR-##`, key results use `KR-##`, and tasks use `task-###` (lowercase, three-digit padding).

## User Stories

1. **As a user**, I want short, readable IDs so I can quickly identify and reference any entity.
   - *Acceptance criteria*: No ID exceeds its prefix plus a number (e.g., `OBJ-5`, not `THEME-01.OKR-01.OKR-05`).

2. **As a user**, I want consistent ID formatting across all entity types so the system feels cohesive.
   - *Acceptance criteria*: All IDs follow the pattern `PREFIX-N` with uppercase prefix and unpadded number.

## Requirements

### Functional Requirements

1. **New ID format**: All entity IDs follow the pattern `PREFIX-N` where:
   - Theme: `THEME-N`
   - Objective: `OBJ-N`
   - Key Result: `KR-N`
   - Task: `TASK-N`
   - `N` is an unpadded positive integer (1, 2, ... 99, 100, ...).

2. **Global uniqueness**: Each ID is unique within its entity type. Counters are global, not scoped to a parent.

3. **Explicit parent references**: Add a `parentId` field to `Objective` and `KeyResult` structs. For objectives, `parentId` references either a theme ID or another objective ID. For key results, `parentId` references an objective ID.

4. **ID generation**: Scan all existing entities of the same type to find the current max number, then increment. Same approach as today but globally scoped.

5. **Task directory structure**: Task files on disk currently live under `tasks/{THEME-ID}/{status}/`. Update the directory layout or file naming to use the new `TASK-N` format and `THEME-N` directory names.

6. **Frontend ID parsing**: Replace the hierarchical `id-parser.ts` utility. Breadcrumb navigation and ancestor expansion must use the `parentId` chain instead of splitting on dots.

7. **Navigation context**: `~/.bearing/data/navigation_context.json` references entity IDs — these will use the new format.

### Non-Functional Requirements

- No data migration. This is a breaking change; existing data files will not be auto-converted.
- No changes to the nested JSON storage structure in `themes.json` — objectives and key results remain nested arrays. The `parentId` field is additive.

## Success Criteria

- All entity IDs match `PREFIX-N` format (no dots, no padding, uppercase).
- Existing tests pass with updated ID expectations.
- Breadcrumb navigation works by traversing `parentId` references.
- Lint and type checks pass.

## Constraints & Assumptions

- **Breaking change**: Users must recreate their data after this change. Acceptable given early stage.
- **Nested JSON preserved**: The tree structure in `themes.json` stays as-is; `parentId` is a denormalized convenience field.
- **Counter persistence**: Counters are derived at runtime by scanning existing entities — no separate counter file needed.

## Out of Scope

- Data migration tooling for existing files.
- Changing the nested storage structure to a flat entity store.
- UI changes beyond updating ID display and breadcrumb logic.

## Dependencies

- Go backend: `internal/access/models.go`, `internal/access/plan_access.go`
- Frontend: `frontend/src/lib/utils/id-parser.ts`, `frontend/src/views/OKRView.svelte`, `frontend/src/lib/wails-mock.ts`
- Tests: `internal/integration/integration_test.go`, any frontend tests referencing IDs
