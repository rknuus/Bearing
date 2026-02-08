---
name: bearing
status: completed
created: 2026-01-31T14:23:55Z
updated: 2026-02-01T13:33:40Z
completed: 2026-02-01T13:33:40Z
progress: 100%
prd: .pm/prds/bearing.md
github: https://github.com/rknuus/Bearing/issues/1
---

# Epic: Bearing

## Overview

Bearing is a three-layer personal planning system connecting long-term OKRs, mid-term daily focus, and short-term task execution through a visual and structural linking mechanism. This epic focuses on the **core linking infrastructure** that makes the layer connections visible and navigable.

The implementation starts fresh but leverages proven patterns from the EisenKan prototype, particularly the versioning utility for git-based persistence and the iDesign architectural approach.

## Architecture Decisions

### Technology Stack (from PRD)
- **Backend**: Go with Wails framework
- **Frontend**: Svelte 5 with runes
- **Data**: JSON files with git versioning
- **Desktop**: Wails for packaging

### Key Design Decisions

1. **Unified Data Model**: Single hierarchical data structure where life themes contain OKRs, OKRs link to days, days link to tasks. All items carry theme color and hierarchical ID.

2. **Color Propagation**: Theme colors defined once at life-theme level, automatically inherited by all descendant items (OKRs, days, tasks).

3. **Hierarchical ID Scheme**: `THEME-XX.OKR-YY.KR-ZZ` pattern enables parsing lineage from any item's ID.

4. **File-per-Item Storage**: Tasks stored as individual JSON files in theme-based directories with kanban columns as sub-directories. Moving a task = moving the file (clean git history per FR-07).

5. **Reuse EisenKan Utilities**: Migrate `VersioningUtility` for git operations. Adapt architecture patterns (Manager → ResourceAccess → Resource).

## Technical Approach

### Data Model

```
LifeTheme
├── id: string (THEME-01)
├── name: string
├── color: string (hex)
└── objectives: Objective[]
    ├── id: string (THEME-01.OKR-01)
    ├── title: string
    └── keyResults: KeyResult[]
        ├── id: string (THEME-01.OKR-01.KR-01)
        └── description: string

DayFocus
├── date: string (YYYY-MM-DD)
├── themeId: string (links to LifeTheme, defines the color)
└── notes: string (may contain OKR references)

Task
├── id: string (includes theme prefix)
├── title: string
├── themeId: string (links to LifeTheme, defines the color)
├── dayDate: string (links to DayFocus)
├── priority: important-urgent|not-important-urgent|important-not-urgent (Eisenhower)
└── status: todo|[doing|...|]done (based on configurable kanban columns)
```

### Frontend Components

| Component | Purpose |
|-----------|---------|
| `App.svelte` | Navigation shell, view switching |
| `Breadcrumb.svelte` | Clickable lineage path (reusable) |
| `ThemeBadge.svelte` | Color indicator (reusable) |
| `OKRView.svelte` | Long-term: themes, objectives, key results |
| `CalendarView.svelte` | Mid-term: yearly 12×31 grid |
| `EisenKanView.svelte` | Short-term: Kanban board with priority sort |

### Backend Services

Simplified from EisenKan - single manager for MVP:

| Service | Responsibility |
|---------|----------------|
| `PlanningManager` | Orchestrates all CRUD for themes, OKRs, days, tasks |
| `PlanAccess` | JSON file read/write with versioning utility |
| `VersioningUtility` | Git operations (migrated from EisenKan) |

### Linking Mechanism Implementation

1. **Background Color**: CSS custom property `--theme-color` set on container, inherited by children
2. **Hierarchical ID**: Parsed client-side to build breadcrumb
3. **Breadcrumb**: Component receives item ID, parses segments, renders clickable links

## Implementation Strategy

### Guiding Principle
**Linking first, features second.** Every task must demonstrate the linking mechanism working before adding layer-specific features.

### Development Phases

1. **Foundation**: Project setup, utility migration, data model (using fixed Kanban columns as a start)
2. **Vertical Slice**: One item per layer with full linking (1 theme → 1 day → 1 task)
3. **Layer Build-out**: Complete each view while maintaining links
4. **Polish**: Navigation, breadcrumbs, color consistency

### Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Calendar grid performance | Virtual scrolling if needed; test with 365 cells early |
| Versioning utility integration | Migrate early; validate git operations work in new project |
| Three views complexity | Vertical slice first; prove linking before expanding |

## Task Breakdown Preview

High-level task categories (≤10 tasks total):

- [ ] **Project Setup**: Initialize Go/Wails/Svelte project, configure build
- [ ] **Utility Migration**: Port VersioningUtility, adapt for Bearing data paths
- [ ] **Data Model & Persistence**: Define JSON schemas, implement PlanAccess
- [ ] **Linking Components**: Build Breadcrumb, ThemeBadge, color propagation
- [ ] **OKR View**: Life themes CRUD, objectives/KRs display with linking
- [ ] **Calendar View**: Yearly grid, day-theme assignment, color display
- [ ] **EisenKan View**: Kanban board, priority sort, theme color inheritance
- [ ] **Navigation**: View switching, breadcrumb navigation between layers
- [ ] **Integration Testing**: End-to-end linking validation across all layers

## Dependencies

### Internal
- EisenKan VersioningUtility (`tmp/eisenkan/internal/utilities/versioning.go`)
- EisenKan UI patterns (reference only, not direct code reuse)

### External
- Wails v2
- Svelte 5
- go-git library

## Success Criteria (Technical)

### Functional
- [ ] Create theme → color appears on all linked items
- [ ] Assign day to theme → day shows theme color
- [ ] Create task on themed day → task shows theme color
- [ ] Click breadcrumb → navigates to target layer/item
- [ ] ID displayed on items → shows full hierarchical path

### Performance
- [ ] View transitions < 100ms
- [ ] Calendar grid renders 365 cells smoothly
- [ ] Git commit completes < 1s for typical operation

### Quality
- [ ] All data changes persisted and version-controlled
- [ ] No data loss on view switching
- [ ] Breadcrumb always reflects current item's lineage

## Estimated Effort

| Category | Estimate |
|----------|----------|
| Project Setup | Small |
| Utility Migration | Small |
| Data Model | Medium |
| Linking Components | Medium |
| Three Views | Medium each |
| Navigation & Polish | Small |

**Critical Path**: Data Model → Linking Components → Views (can parallelize views once linking works)

## Tasks Created

| # | Task | Parallel | Depends On | Effort |
|---|------|----------|------------|--------|
| [#2](https://github.com/rknuus/Bearing/issues/2) | Project Setup | No | - | S (4-6h) |
| [#3](https://github.com/rknuus/Bearing/issues/3) | Utility Migration | No | #2 | S (2-4h) |
| [#4](https://github.com/rknuus/Bearing/issues/4) | Data Model and Persistence | No | #2, #3 | M (8-12h) |
| [#5](https://github.com/rknuus/Bearing/issues/5) | Linking Components | Yes | #2 | M (6-8h) |
| [#6](https://github.com/rknuus/Bearing/issues/6) | OKR View | Yes | #4, #5 | M (8-12h) |
| [#7](https://github.com/rknuus/Bearing/issues/7) | Calendar View | Yes | #4, #5 | M (8-12h) |
| [#8](https://github.com/rknuus/Bearing/issues/8) | EisenKan View | Yes | #4, #5 | M (10-14h) |
| [#9](https://github.com/rknuus/Bearing/issues/9) | Navigation | No | #6, #7, #8 | S (4-6h) |
| [#10](https://github.com/rknuus/Bearing/issues/10) | Integration Testing | No | #9 | M (8-12h) |

**Summary:**
- Total tasks: 9
- Parallel tasks: 4 (#5, #6, #7, #8)
- Sequential tasks: 5 (#2, #3, #4, #9, #10)
- Estimated total effort: 58-86 hours

**Dependency Graph:**
```
#2 ──┬──▶ #3 ──▶ #4 ──┬──▶ #6 ──┐
     │                │         │
     └──▶ #5 ────────┼──▶ #7 ──┼──▶ #9 ──▶ #10
                     │         │
                     └──▶ #8 ──┘
```
