---
name: update-theme-abbreviation-upon-renaming
description: Allow users to update a theme's abbreviation (and cascade to all child IDs) when renaming a theme
status: backlog
created: 2026-02-07T18:51:37Z
---

# PRD: Update Theme Abbreviation Upon Renaming

## Executive Summary

When a user renames a life theme in Bearing, the theme's abbreviation (used as its ID and prefix for all child entity IDs) remains unchanged. This creates a confusing mismatch — e.g., a theme renamed from "Health" to "Career Fitness" retains the abbreviation "H" and all children keep IDs like "H-O1". This feature adds an auto-suggest-and-confirm flow that proposes a new abbreviation when a theme is renamed, and cascades the change to all child entity IDs atomically.

## Problem Statement

Theme abbreviations serve as the primary identifier throughout the OKR hierarchy. They appear in the UI next to every theme, objective, key result, and task. When a user renames a theme, the abbreviation stays frozen at its original value, leading to:

- **Cognitive mismatch**: The abbreviation no longer relates to the theme name, making it harder to scan and navigate the OKR tree.
- **Confusion over time**: As users iterate on their life themes, stale abbreviations accumulate and lose meaning.
- **No workaround**: There is currently no way to change a theme's abbreviation after creation.

This matters now because Bearing is designed for long-term personal planning — theme names will evolve, and abbreviations need to keep up.

## User Stories

### Primary Persona: Bearing User

A person managing their life goals through OKR hierarchies in Bearing. They periodically refine their theme names to better reflect evolving priorities.

### User Story 1: Rename with abbreviation update

**As a** Bearing user,
**I want to** be offered a new abbreviation when I rename a theme,
**so that** my abbreviations stay meaningful and consistent with theme names.

**Acceptance Criteria:**
- When the user changes a theme name and saves, a confirmation dialog appears showing the suggested new abbreviation.
- The dialog shows the old abbreviation, the suggested new abbreviation, and an editable text field to customize.
- The user can accept the new abbreviation, edit it, or keep the old one.
- If accepted, the abbreviation and all child entity IDs update atomically.

### User Story 2: Abbreviation collision handling

**As a** Bearing user,
**I want** the system to avoid suggesting an abbreviation that conflicts with an existing theme,
**so that** I don't accidentally create duplicate identifiers.

**Acceptance Criteria:**
- The suggested abbreviation must not collide with any existing theme abbreviation.
- If the user manually enters an abbreviation that collides, show a validation error.
- Abbreviation must be 1-3 uppercase letters only.

### User Story 3: Preserve option to keep old abbreviation

**As a** Bearing user,
**I want** the option to keep the current abbreviation when renaming,
**so that** I can rename a theme without disrupting existing IDs if I prefer stability.

**Acceptance Criteria:**
- The confirmation dialog includes a "Keep current" option.
- Choosing "Keep current" saves only the name change, leaving all IDs untouched.

## Requirements

### Functional Requirements

1. **Abbreviation suggestion on rename**: When a theme name is changed and saved, the system generates a suggested new abbreviation using the existing `SuggestAbbreviation` algorithm, excluding the current theme's own abbreviation from collision checks.
2. **Confirmation dialog**: A modal/dialog presents:
   - The old abbreviation (read-only).
   - The suggested new abbreviation (editable text field, validated: 1-3 uppercase letters, no collision with other themes).
   - Actions: "Update abbreviation", "Keep current", "Cancel" (reverts the rename entirely).
3. **Cascading ID update**: When the user confirms a new abbreviation, all child entity IDs are updated:
   - Objectives: `OLD-O1` → `NEW-O1`
   - Key Results: `OLD-KR1` → `NEW-KR1`
   - Tasks: `OLD-T1` → `NEW-T1`
4. **Atomic persistence**: The theme abbreviation change and all child ID changes are saved and committed to the git-versioned storage in a single atomic commit.
5. **Backend API**: A new or updated backend method (e.g., `RenameThemeAbbreviation(oldID, newID string)`) handles the cascade and atomic save.
6. **Frontend binding**: The frontend calls `SuggestThemeAbbreviation` to get the suggestion and a new method to execute the rename.
7. **Navigation context update**: If the current navigation context references any of the renamed IDs, update those references.

### Non-Functional Requirements

1. **Data integrity**: No partial updates — either all IDs update or none do. The operation must be atomic at the storage layer.
2. **Performance**: The cascade operation should complete in under 1 second for a realistic number of themes/objectives/KRs/tasks (< 100 entities per theme).
3. **No data loss**: The git commit ensures recoverability if anything goes wrong.

## Success Criteria

- Users can rename a theme and update its abbreviation (and all child IDs) in a single flow.
- No orphaned or inconsistent IDs exist after the operation.
- The confirmation dialog only appears when the theme name actually changed.
- Existing tests continue to pass; new tests cover the cascading rename logic.

## Constraints & Assumptions

- **Constraint**: Abbreviations are currently used as primary keys in the JSON storage. The cascading rename must update all references consistently.
- **Constraint**: The `SuggestAbbreviation` function already exists and handles collision avoidance — reuse it.
- **Assumption**: Theme rename is an infrequent operation, so optimizing for simplicity over raw performance is appropriate.
- **Assumption**: The number of child entities per theme is small enough that in-memory processing is sufficient.

## Out of Scope

- Bulk-renaming multiple themes at once.
- Allowing abbreviation changes independent of theme rename (no standalone "edit abbreviation" action).
- Undo/redo support for abbreviation changes (git history provides recovery).
- Changing the abbreviation format (remains 1-3 uppercase letters).

## Dependencies

- **Internal**: `SuggestAbbreviation` function in `internal/access/plan_access.go`.
- **Internal**: `SaveTheme` and related persistence methods in the access layer.
- **Internal**: Git-versioned storage commit logic.
- **Internal**: Navigation context persistence (`~/.bearing/data/navigation_context.json`).
- **Frontend**: Wails bindings for new/updated backend methods.
- **Frontend**: Mock bindings in `wails-mock.ts` for browser testing.
