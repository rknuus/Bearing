---
name: themes-and-hierarchical-okrs
description: Make OKRs nestable to arbitrary depth so users can model 10-year to quarterly goal hierarchies
status: backlog
created: 2026-02-06T10:01:27Z
---

# PRD: Hierarchical OKRs

## Executive Summary

Extend the OKR system from its current fixed 3-level structure (Theme → Objective → Key Result) to support arbitrary nesting depth. This allows users to model goal hierarchies like 10-year goals → 1-year goals → quarterly goals, all under a life theme. Any objective at any level can have both child objectives AND key results.

## Problem Statement

### The Problem

The current OKR structure is fixed at exactly three levels: Life Theme → Objective → Key Result. This prevents users from modeling multi-horizon goal planning where long-term goals decompose into progressively shorter-term goals:

- A 10-year vision decomposes into 1-year objectives
- A 1-year objective decomposes into quarterly objectives
- A quarterly objective has concrete key results

Currently, users must flatten this into a single objective level, losing the hierarchical relationship between goals at different time horizons.

### Why This Matters Now

The core value of Bearing is linking daily tasks to long-term goals. Without multi-level OKRs, that link is weak — users can't trace a quarterly key result back through a yearly goal to a decade-long vision. The hierarchy IS the linking mechanism for the long-term planning layer.

## User Stories

### US-01: Create Nested Objectives

**As an** intentional planner,
**I want to** create objectives under existing objectives,
**So that** I can decompose long-term goals into progressively shorter-term goals.

**Acceptance Criteria:**
- Can create a child objective under any existing objective
- Nesting works to arbitrary depth (no hardcoded limit)
- The hierarchy is visually clear in the OKR view (indentation/nesting)
- Can expand/collapse any level

### US-02: Mix Key Results and Child Objectives

**As an** intentional planner,
**I want to** add both key results AND child objectives to any objective,
**So that** I can track measurable outcomes at every level, not just the leaf level.

**Acceptance Criteria:**
- An objective can have zero or more key results
- An objective can simultaneously have zero or more child objectives
- Key results and child objectives are visually distinct within the same parent
- Deleting a key result does not affect child objectives and vice versa

### US-03: Navigate Deep Hierarchies

**As an** intentional planner,
**I want to** expand, collapse, and navigate multi-level OKR trees,
**So that** I can focus on the level I'm working at without losing context.

**Acceptance Criteria:**
- Expand/collapse works at every level
- Breadcrumb trail reflects the full path (Theme > Objective > Objective > ...)
- Can navigate directly to any level via breadcrumb

### US-04: CRUD at Any Level

**As an** intentional planner,
**I want to** create, edit, and delete objectives at any depth,
**So that** I can restructure my goal hierarchy as my planning evolves.

**Acceptance Criteria:**
- Can create objectives as children of any objective (not just directly under themes)
- Can edit objective title at any level
- Deleting an objective deletes all its descendants (child objectives and key results)
- Delete confirmation shows what will be removed

## Requirements

### Functional Requirements

#### FR-01: Recursive Objective Model

The `Objective` data model must support self-referencing children:
- An `Objective` contains an optional list of child `Objective`s
- An `Objective` contains an optional list of `KeyResult`s
- Both can coexist on the same objective
- This replaces the current fixed Theme → Objective → KeyResult hierarchy

#### FR-02: Backend CRUD for Nested Objectives

Extend the backend API to support operations at arbitrary depth:
- `CreateObjective(parentId string, title string)` — parentId can be a theme ID or an objective ID
- `UpdateObjective(objectiveId string, title string)` — identify by objective ID only
- `DeleteObjective(objectiveId string)` — cascading delete of all descendants
- `GetThemes()` — returns the full recursive tree as before

#### FR-03: Frontend Recursive Rendering

The OKR view must recursively render the objective tree:
- Each level is visually indented or nested
- Expand/collapse toggle at each objective that has children
- "Add child objective" and "Add key result" actions available on every objective
- Inline editing works at all levels

#### FR-04: Hierarchical ID Generation

The system must generate IDs for objectives at any depth:
- IDs must be unique and encode the hierarchy
- The exact scheme is an implementation detail (not user-facing)
- IDs must remain stable (not change when siblings are added/removed)

### Non-Functional Requirements

#### NFR-01: Performance
- OKR tree rendering must remain responsive with up to 5 nesting levels and ~100 total objectives
- Expand/collapse must be instantaneous

#### NFR-02: Data Migration
- Existing themes.json files with the old 3-level structure must continue to work
- No manual migration step required — the new model is a superset of the old one

#### NFR-03: Backward Compatibility
- Calendar and EisenKan views continue to reference themes by theme ID (unchanged)
- Breadcrumb navigation continues to work, extended to show deeper paths

## Success Criteria

1. User can create a 3+ level objective hierarchy under a theme
2. User can add key results at any level in the hierarchy
3. Existing data loads without migration
4. All existing tests continue to pass
5. OKR view renders the tree correctly at all depths

## Constraints & Assumptions

### Constraints
- Must use the existing Go + Svelte + Wails stack
- Must maintain JSON file storage format
- Must preserve git versioning behavior

### Assumptions
- Users won't typically exceed 5 levels of nesting
- The naming convention (objectives at all levels are still "objectives") is acceptable — no need for distinct names like "goal", "initiative", "objective"

## Out of Scope

1. **Progress rollup** — Aggregating child KR progress to parent objectives
2. **Drag-and-drop reordering** — Moving objectives between parents
3. **Time period fields** — Structured time metadata on objectives (hierarchy implies scope)
4. **OKR templates** — Predefined goal structures
5. **Theme changes** — Themes remain flat with name + color (already working)

## Dependencies

### Internal
- Current OKR CRUD implementation (backend + frontend) must be refactored
- Hierarchical ID generation logic must be extended

### External
- None — self-contained change within existing stack
