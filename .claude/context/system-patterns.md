---
created: 2026-02-20T14:57:09Z
last_updated: 2026-02-28T15:17:06Z
version: 1.1
author: Claude Code PM System
---

# System Patterns

## Architecture: iDesign Methodology (Backend)

### Layer Structure
1. **Entry Point** (`main.go`) — Wails bindings, dependency injection
2. **Business Logic Layer**:
  a) `internal/managers/`: Business logic, orchestration
  b) `internal/engines/`: Algorithms, rules
3. **Access Layer** (`internal/access/`) — Data access, CRUD, file I/O, models
4. **Cross-cutting Layer** (`internal/utilities`) - Components shared by all layers

### Data Flow
```
Frontend (Svelte) → Wails IPC → main.go bindings → PlanningManager → PlanAccess → Filesystem
```

### Key Pattern: Manager orchestrates Access
- `PlanningManager` holds a `PlanAccess` reference
- All business rules live in the manager (WIP limits, task validation, priority promotion)
- Access layer is rule-agnostic (pure CRUD + versioning)
- No business logic whatsoever in the frontend/clients

### Task Storage: Flat by Status
- Tasks stored in `tasks/{status}/{taskID}.json` (no theme directory)
- `GetTasksByStatus(status)` reads a single directory
- `GetTasksByTheme(themeID)` filters across all statuses by `task.ThemeID`
- `findTaskInPlan(taskID)` iterates 4 status dirs (not themes × statuses)
- `saveTaskFile` includes a uniqueness guard to prevent duplicate task IDs

## Frontend Patterns

### Binding Abstraction
```typescript
// bindings.ts — getBindings() returns Wails runtime or mock based on environment
const bindings = getBindings();
const tasks = await bindings.GetTasks();
```
All Go methods are accessed through this abstraction, enabling browser-based development with mocks.

### Svelte 5 Runes
- `$state` for reactive state
- `$derived` / `$derived.by()` for computed values
- `$effect` for side effects (with `untrack()` to break write-read cycles)
- `$props` for component props with TypeScript interfaces

### $effect Safety Rule
Never read and write the same `$state` variable in an `$effect`. Use `untrack()`:
```svelte
$effect(() => {
    const ft = filteredTasks;  // tracked dependency
    untrack(() => {
        columnItems = grouped;  // written but not tracked
    });
});
```

### Optimistic Updates with Rollback
EisenKan drag-and-drop uses optimistic UI updates:
1. Update UI immediately on drop
2. Call backend API
3. If API fails or rules reject → rollback to snapshot

### Cross-View Navigation
Views expose navigation callbacks via props:
- `onNavigateToTheme(themeId)` → OKR View
- `onNavigateToDay(date, themeId?)` → Calendar View
- `onNavigateToTasks(options?)` → EisenKan View

### Git Versioning
- Every data mutation auto-commits via go-git
- Data directory (`~/.bearing/data/`) is a git repository
- Enables undo/history via git log

### Board Configuration
Kanban board structure is dynamic, fetched from `GetBoardConfiguration()`:
- Column definitions (name, title, type, optional sections)
- Sections within columns (e.g., priority bands in Todo)
- Rule definitions (WIP limits, allowed transitions)

## CSS Patterns
- CSS custom properties: `--color-gray-*`, `--color-primary-*`, `--color-error-*`
- `color-mix(in srgb, color %, white)` for tinted backgrounds
- Flexbox for vertical layouts, CSS Grid for board columns
- `min-height: 0` at each flex level for overflow scroll propagation
