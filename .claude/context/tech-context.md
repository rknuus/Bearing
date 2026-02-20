---
created: 2026-02-20T14:57:09Z
last_updated: 2026-02-20T14:57:09Z
version: 1.0
author: Claude Code PM System
---

# Tech Context

## Languages & Runtimes
- **Go** 1.25 — Backend logic, data access, Wails bindings
- **TypeScript** 5.6 — Frontend with strict type checking via svelte-check
- **Node.js** 18+ — Frontend build tooling

## Frameworks
- **Wails** v2 (v2.11.0) — Go + Web frontend desktop framework
  - Native WebView (macOS: WebKit, Windows: WebView2)
  - Go methods exposed as JS bindings via runtime
  - Dev mode: Vite HMR with WebSocket bridge at localhost:34115
- **Svelte** 5 — Frontend UI framework
  - Runes mode enabled (`$state`, `$derived`, `$effect`, `$props`)
  - Compiler options in `svelte.config.js`

## Key Dependencies

### Go
- `github.com/wailsapp/wails/v2` v2.11.0 — Desktop framework
- `github.com/go-git/go-git/v5` v5.16.4 — Git operations for data versioning
- `github.com/golangci/golangci-lint` — Go linter (via `go tool`)

### Frontend
- `svelte` ^5.0.0 — UI framework
- `svelte-dnd-action` ^0.9.69 — Drag-and-drop for Kanban board
- `vite` ^6.0.0 — Build tool and dev server
- `vitest` ^3.0.0 — Unit test framework
- `@testing-library/svelte` ^5.3.1 — Component testing
- `eslint` ^9.39.2 + `eslint-plugin-svelte` ^3.14.0 — Linting
- `svelte-check` ^4.0.0 — TypeScript type checking
- `jsdom` ^27.4.0 — Test environment

## Development Tools
- **Makefile** — All dev operations (`make dev`, `make test`, `make lint`, etc.)
- **ESLint** — Frontend linting with svelte plugin, zero warnings policy
- **golangci-lint** — Go linting with comprehensive rule set
- **Vitest** — 139 frontend unit tests
- **Playwright** — E2E testing support

## Development Environments
| Mode | URL | IPC | Use Case |
|------|-----|-----|----------|
| Native | N/A (WebView) | Wails runtime | Production-like testing |
| Wails Dev | localhost:34115 | WebSocket | Full-stack dev with HMR |
| Vite Dev | localhost:5173 | Mock bindings | Frontend-only rapid iteration |
