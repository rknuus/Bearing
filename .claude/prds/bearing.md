---
name: bearing
description: Personal planning system with interlinked long-, medium-, and short-term planning layers
status: complete
created: 2026-01-31T13:56:42Z
completed: 2026-02-01T13:33:40Z
---

# PRD: Bearing

## Executive Summary

Bearing is a personal planning system that supports interlinked long-, medium-, and short-term planning. The core value proposition is making it simple for users to understand how their daily tasks connect to daily focus areas and long-term objectives. The system consists of three planning layers—OKRs (long-term), a yearly daily-focus calendar (mid-term), and a Kanban-like board dubbed EisenKan (short-term)—connected through a visual and structural linking mechanism.

### Inspiration Sources
- **Long-term**: "The 7 Habits of Highly Effective People" by Stephen R. Covey, combined with OKR methodology
- **Mid-term**: Google Sheets yearly focus tracker template
- **Short-term**: Obsidian Kanban extension, enhanced with Eisenhower matrix pre-prioritization ("EisenKan")

## Problem Statement

### The Problem
Users struggle to maintain alignment between their daily activities and their long-term goals. Existing tools typically address only one planning horizon:
- Task managers focus on immediate execution but lose sight of bigger objectives
- Goal-setting tools define aspirations but disconnect from daily action
- Calendar tools schedule time but don't link activities to purpose

### Why This Matters Now
Knowledge workers and individuals seeking intentional living need a unified system that:
- Makes the connection between daily tasks and life goals explicit and visible
- Provides appropriate views for different planning horizons
- Keeps planning lightweight rather than becoming overhead

## User Stories

### Primary Persona: Intentional Planner
A professional or individual who:
- Has multiple life areas (career, health, family, personal projects)
- Wants to make progress on long-term goals through daily action
- Struggles to maintain focus across competing priorities

### User Journeys

#### US-01: Define Long-Term Direction
**As an** intentional planner,
**I want to** create life themes to group OKRs and objectives with key results,
**So that** I have clear long-term direction organized by life themes.

**Acceptance Criteria:**
- Can create user-defined life themes (not predefined themes)
- Each group has a distinct background color
- Can define objectives within life themes
- Can define measurable key results within objectives
- Themes, objectives, and key results have hierarchical IDs

#### US-02: Plan Daily Focus for the Year
**As an** intentional planner,
**I want to** view an entire year as a grid and assign each day to a theme,
**So that** I can see how my time is allocated across priorities.

**Acceptance Criteria:**
- Display 12 columns (months) × 31 rows (days)
- Weekends visually distinct from weekdays
- Can assign any day to a life theme via color
- Can enter optional custom text per day
- Can optionally reference specific OKRs in day text
- Full year visible at once

#### US-03: Execute Daily Tasks with Priority
**As an** intentional planner,
**I want to** manage today's tasks on a Kanban board with Eisenhower prioritization,
**So that** I focus on what's truly important and urgent.

**Acceptance Criteria:**
- Kanban board with configurable columns (at least Todo and Done, typically also In Progress, and sometimes more WIP columns)
- New tasks must be assigned an Eisenhower quadrant (excluding Q4: not important, not urgent)
- Todo column auto-sorts by Eisenhower priority
- Tasks inherit theme color from the day/life theme
- Do task management like in example of EisenKan (=Eisenhower-based Kanban board) available in `tmp/eisenkan/`

#### US-04: Navigate Between Planning Layers
**As an** intentional planner,
**I want to** easily see how items relate across layers and navigate between them,
**So that** I maintain context while working at any level.

**Acceptance Criteria:**
- Background color consistently indicates life theme across all layers
- Hierarchical IDs visible on items
- Breadcrumb trail shows path (e.g., "Health Group > Q1 Fitness OKR > Week 5 > Task")
- Clicking breadcrumb segments navigates to that layer/item

#### US-05: Persist and Version Planning Data
**As an** intentional planner,
**I want to** have my planning data saved in version-controlled files,
**So that** I own my data and can track changes over time.

**Acceptance Criteria:**
- All data stored as JSON files
- Changes committed to git automatically
- Can view history of changes
- Data readable/editable outside the application if needed
- Moving tasks corresponds to moving a file in the version controlled directory, but does not change any file content

## Requirements

### Functional Requirements

#### FR-01: Three-Layer Planning Structure
The system shall provide three distinct planning views:
1. **Long-term view**: OKR management (themes, objectives, key results)
2. **Mid-term view**: Yearly daily-focus calendar grid
3. **Short-term view**: EisenKan board for task execution

#### FR-02: Linking Mechanism
The system shall link items across layers using:
1. **Background color**: Each life theme has a unique color that propagates to linked days and tasks
2. **Hierarchical ID convention**: Items have structured IDs reflecting their position (e.g., `THEME-01.OKR-02.KR-03`)
3. **Breadcrumb trail**: Clickable navigation path displayed on items showing full lineage

#### FR-03: OKR Management
- Users shall be able to create, edit, and delete life themes with user-defined names
- Each life theme shall have an assigned background color
- Users shall be able to create objectives within life themes
- Users shall be able to create key results within objectives
- The system shall enforce hierarchical tree structure (life theme → Objective → Key Result)

#### FR-04: Daily Focus Calendar
- The system shall display a yearly grid with 12 columns (months) and 31 rows (days)
- Weekend days shall be visually distinguished from weekdays
- Users shall be able to assign any day to a life theme
- Users shall be able to enter optional custom text for any day
- Day text may contain references to specific OKRs (detection mechanism TBD)

#### FR-05: EisenKan Task Board
- The system shall provide a Kanban board interface
- New tasks shall require Eisenhower quadrant assignment (Q1: urgent+important, Q2: important+not urgent, Q3: urgent+not important)
- Q4 (not important, not urgent) shall not be available as a task priority
- Todo column shall auto-sort tasks by Eisenhower priority (Q1 → Q2 → Q3)
- Tasks shall inherit theme color from their associated day/life theme
- Detailed specifications for the EisenKan board except the linking aspect are available in `tmp/eisenkan/doc/`

#### FR-06: Navigation
- The system shall provide one dedicated view per planning layer
- Users shall be able to navigate between views
- Breadcrumb trails shall be clickable for direct navigation to parent items

#### FR-07: Data Persistence
- All planning data shall be stored as JSON files
- The system shall use the versioning utility for git-based change tracking
- File changes shall be committed atomically using transactions
- Moving tasks corresponds to moving a file in the version controlled directory, but does not change any file content

### Quality Attribute Requirements

#### QAR-01: Performance
- View transitions shall feel instantaneous (<100ms)
- The yearly calendar grid shall render smoothly with all 365+ days visible
- File operations shall not block the UI

#### QAR-02: Usability
- The linking mechanism shall be immediately visible without user action (colors, IDs)
- Navigation between layers shall require at most 2 clicks
- The system shall work offline (local files, no network dependency)

#### QAR-03: Data Portability
- JSON files shall be human-readable
- Data shall be usable without the application (plain files + git)
- No proprietary formats or encryption

#### QAR-04: Platform Support
- Desktop application via Wails (macOS primary, Windows/Linux secondary)
- Browser-based execution for testing purposes

## Technical Constraints

### Technology Stack
- **Backend**: Go
- **Desktop Framework**: Wails
- **Frontend**: Svelte 5 (with runes)
- **Data Format**: JSON files
- **Version Control**: Git (via existing versioning utility from EisenKan prototype)

### Architecture Decisions
- **Fresh start**: New project structure (not extending EisenKan prototype directly)
- **Port concepts**: EisenKan functionality to be reimplemented in new architecture
- **Reuse utilities**: Versioning utility (`tmp/eisenkan/internal/utilities/versioning.go`) to be migrated

## Success Criteria

### MVP Success Metrics
1. **Linking visibility**: User can identify an item's life theme within 1 second (via color)
2. **Navigation**: User can traverse from task to OKR in ≤2 clicks
3. **Data integrity**: All changes persisted and version-controlled without data loss
4. **Layer coverage**: All three views functional with core features

### Qualitative Goals
- Planning feels lightweight, not bureaucratic
- Connection between daily action and long-term goals is always visible
- System encourages intentional prioritization (Eisenhower matrix)

## Constraints & Assumptions

### Constraints
- No cloud sync in MVP (local-only)
- No mobile application in MVP (desktop-only)
- No import/export tools in MVP
- Single-user system (no collaboration features)

### Assumptions
- Users are comfortable with desktop applications
- Users understand or are willing to learn OKR methodology
- Users value data ownership (local files, version control)
- A year-long calendar view is manageable on typical desktop screens

## Out of Scope

The following are explicitly NOT included in MVP:

1. **Cloud synchronization** - Data stays local
2. **Mobile applications** - Desktop only
3. **Collaboration features** - Single user
4. **Import/export wizards** - Manual file management
5. **Recurring tasks** - Each task is standalone
6. **Time tracking** - Focus on planning, not tracking
7. **Notifications/reminders** - No alerts system
8. **Sidebar tree navigation** - Deferred to post-MVP (see TODO)
9. **Calendar integrations** - No external calendar sync
10. **Reporting/analytics** - No dashboards or charts

## Dependencies

### Internal Dependencies
- Versioning utility from EisenKan prototype must be migrated
- EisenKan concepts (Kanban + Eisenhower) must be reimplemented

### External Dependencies
- Wails framework for desktop packaging
- Svelte 5 for frontend
- go-git library (already used in versioning utility)

## Open Design Decisions

The following decisions are deferred to detailed design phase:

1. **OKR reference detection in day text**: Auto-detect patterns vs. explicit markup
2. **Hierarchical ID format**: Exact convention (e.g., `THEME-01.OKR-02` vs. `T01-O02`)
3. **Color palette**: Fixed set vs. user-selectable colors
4. **Ad-hoc items**: How to handle future support for orphan mid/short-term items
5. **Breadcrumb interaction**: Hover preview vs. click-only navigation

## Future Enhancements

Post-MVP features to consider:

1. **Sidebar tree navigation** - Collapsible hierarchy view
2. **Ad-hoc items** - Support short/mid-term items not linked to life themes
3. **Context-based views** - Show relevant layer based on current activity
4. **Progress tracking** - Visual progress indicators on OKRs
5. **Templates** - Predefined life theme structures
6. **Search** - Cross-layer search functionality
