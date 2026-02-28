---
created: 2026-02-20T14:57:09Z
last_updated: 2026-02-28T15:17:06Z
version: 1.1
author: Claude Code PM System
---

# Project Structure

## Root Layout
```
bearing/
├── main.go                     # Wails app entry point, Go bindings
├── main_test.go                # Main package tests
├── wails.json                  # Wails configuration
├── Makefile                    # All dev operations
├── CLAUDE.md                   # AI assistant instructions
├── go.mod / go.sum             # Go dependencies
├── frontend/                   # Svelte 5 frontend
├── internal/                   # Go backend packages
├── build/                      # Build output
├── scripts/                    # Utility scripts (e.g., migration)
├── tests/                      # E2E test support
└── .pm/                        # Project management (gitignored)
```

## Backend (Go)
```
internal/
├── access/
│   ├── models.go               # Domain models (LifeTheme, Task, etc.)
│   ├── plan_access.go          # Data access layer (CRUD, file I/O)
│   └── plan_access_test.go
├── managers/
│   ├── planning_manager.go     # Business logic (rules, orchestration)
│   └── planning_manager_test.go
├── utilities/
│   ├── versioning.go           # Git-based data versioning
│   ├── versioning_test.go
│   ├── versioning_integration_test.go
│   └── repository_validation_test.go
└── integration/
    ├── integration_test.go     # End-to-end integration tests
    └── benchmark_test.go       # Performance benchmarks
```

## Frontend (Svelte 5)
```
frontend/src/
├── App.svelte                  # Navigation, routing, shortcuts
├── App.test.ts
├── views/
│   ├── OKRView.svelte          # Life themes, objectives, key results
│   ├── CalendarView.svelte     # 12×31 yearly grid
│   ├── EisenKanView.svelte     # Kanban + Eisenhower board
│   └── *.test.ts               # View tests
├── components/
│   ├── CreateTaskDialog.svelte # New task with Eisenhower matrix
│   ├── EditTaskDialog.svelte   # Task editing
│   ├── EisenhowerQuadrant.svelte # Priority quadrant component
│   ├── ErrorDialog.svelte      # Rule violation display
│   ├── ThemeFilterBar.svelte   # Theme filter chips
│   └── TaskFormFields.svelte   # Shared form fields
└── lib/
    ├── components/             # Reusable UI components
    │   ├── Breadcrumb.svelte
    │   ├── Button.svelte
    │   ├── Dialog.svelte
    │   ├── ErrorBanner.svelte
    │   ├── ThemeBadge.svelte
    │   └── ThemedContainer.svelte
    ├── utils/
    │   ├── bindings.ts         # Wails/mock binding abstraction
    │   ├── date-format.ts      # Locale-aware date formatting
    │   ├── id-parser.ts        # Hierarchical ID parsing
    │   └── theme-helpers.ts    # Theme color/lookup utilities
    ├── constants/
    │   └── priorities.ts       # Eisenhower priority labels/config
    ├── wails-mock.ts           # Mock bindings for browser dev
    └── wails/                  # Wails-generated files (gitignored from lint)
```

## Data Storage
```
~/.bearing/                     # Git-versioned data directory
├── themes/themes.json          # Life themes with nested OKRs
├── calendar/YYYY.json          # Day focus entries per year
├── tasks/                      # Tasks organized by status (flat)
│   ├── todo/                   # Pending tasks
│   ├── doing/                  # In-progress tasks
│   ├── done/                   # Completed tasks
│   └── archived/               # Archived tasks
├── task_order.json             # Persisted task ordering per drop zone
├── navigation_context.json     # Persisted UI state (not git-versioned)
└── .git/                       # Auto-managed git repo
```

## Key File Naming Patterns
- Go tests: `*_test.go` with `TestUnit_`, `TestIntegration_`, `TestPerformance_` prefixes
- Svelte components: PascalCase `.svelte` files
- Frontend tests: `*.test.ts` co-located with source
- Utilities: camelCase `.ts` files
