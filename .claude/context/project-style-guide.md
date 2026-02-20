---
created: 2026-02-20T14:57:09Z
last_updated: 2026-02-20T14:57:09Z
version: 1.0
author: Claude Code PM System
---

# Project Style Guide

## Go Conventions

### Package Structure
- `internal/access/` — Data access (models + CRUD)
- `internal/managers/` — Business logic
- `internal/engines/` — Business logic
- `internal/utilities/` — Cross-cutting utilities
- Follow iDesign: business logic only in `internal/managers/` and `internal/engines/`

### Naming
- Test functions: `TestUnit_DescriptiveName`, `TestIntegration_DescriptiveName`, `TestPerformance_DescriptiveName`
- Package comments on all packages
- Struct field tags: `json:"camelCase"` with `omitempty` where appropriate

### Error Handling
- Return errors up the call stack
- Manager layer translates access errors into domain errors
- Frontend receives error messages via Wails binding return values

## Svelte/TypeScript Conventions

### Component Structure
- PascalCase for component filenames: `EditTaskDialog.svelte`
- Props via TypeScript interfaces with `$props()`:
  ```svelte
  interface Props { title: string; onSave: (data: T) => void; }
  let { title, onSave }: Props = $props();
  ```
- Svelte 5 runes only (no legacy `$:` reactive statements)

### State Management
- `$state` for local component state
- `$derived` for computed values
- `$effect` with `untrack()` when writing state the effect reads
- `SvelteSet` / `SvelteMap` for reactive collections

### File Organization
- Views in `src/views/` — full-page views
- Components in `src/components/` — feature-specific components
- Lib components in `src/lib/components/` — reusable UI primitives
- Utils in `src/lib/utils/` — pure helper functions
- Tests co-located: `Component.svelte` → `Component.test.ts`

### CSS
- Scoped `<style>` blocks in each component
- CSS custom properties for theming (defined globally, consumed locally)
- No external CSS frameworks — hand-written CSS
- Mobile not targeted (desktop-only app)

## Testing Conventions

### Frontend (Vitest + @testing-library/svelte)
- Test files: `*.test.ts` co-located with source
- Use `@testing-library/svelte` for component rendering
- Mock Wails bindings via `wails-mock.ts`
- Zero-warning ESLint policy

### Backend (Go stdlib)
- Test files: `*_test.go` in same package
- Naming prefixes for test categories: `TestUnit_`, `TestIntegration_`, `TestPerformance_`
- Integration tests use temp directories
- Benchmark tests with `testing.B`

## Commit Style
- Conventional commits: `fix:`, `feat:`, `chore:`
- Lowercase descriptions
- Co-authored-by for AI-assisted commits

## Linting
- Frontend: ESLint with `eslint-plugin-svelte`, zero warnings (`--max-warnings 0`)
- Backend: golangci-lint with comprehensive ruleset
- Always lint before committing (`make lint`)
- Wails-generated files in `frontend/src/lib/wails/` excluded from linting
