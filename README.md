# Bearing

## About

Bearing is a personal planning system supporting interlinked long-, medium, and short-term planning.

### Three Planning Layers

1. **Long-term (OKR View)**: Life Themes with Objectives and Key Results
2. **Mid-term (Calendar View)**: Yearly 12×31 grid for daily focus assignment
3. **Short-term (EisenKan View)**: Kanban board with Eisenhower priority sorting

The core value is the **linking mechanism** - theme colors propagate through all layers, and hierarchical IDs enable navigation between related items.

## Prerequisites

- [Go](https://golang.org/dl/) 1.21+
- [Node.js](https://nodejs.org/) 18+
- [Wails](https://wails.io/) v2 (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)

## Quick Start

```bash
# Install dependencies
make setup

# Run in development mode (opens native app with hot reload)
make dev
```

## Development

### Available Commands

Run `make help` to see all available commands:

```
Development:
  make setup              Setup project (install all dependencies)
  make dev                Run Wails app in development mode with hot reload
  make frontend-dev       Run Vite dev server only (for browser testing)
  make stop               Stop any running dev/test server processes

Build:
  make build              Build Wails desktop application
  make build-go           Build Go binary only (without frontend)
  make clean              Clean build artifacts

Testing:
  make test                       Run all tests (Go + frontend)
  make test-backend               Run all Go tests
  make test-backend-unit          Run Go unit tests only
  make test-backend-integration   Run Go integration tests
  make test-backend-performance   Run Go performance tests
  make test-backend-bench         Run Go benchmarks
  make test-frontend              Run frontend TypeScript checks and Vitest tests
  make test-ui-component          Run Playwright UI component tests
  make test-ui-component-headless Run Playwright UI component tests (headless)
  make test-e2e                   Run true E2E tests (starts Wails dev, runs tests)
  make test-e2e-headless          Run true E2E tests (headless)

Frontend:
  make frontend-install   Install frontend dependencies
  make frontend-build     Build frontend for production
  make frontend-check     Run TypeScript type checking
```

### Development Modes

**Full Application (Wails + Native Window)**
```bash
make dev
```
Opens a native desktop window with Vite hot module replacement enabled.

**Frontend Only (Browser Testing)**
```bash
make frontend-dev
```
Runs Vite dev server at http://localhost:5173 with mock Wails bindings. Useful for UI development without the native wrapper.

## Building

```bash
# Build production binary
make build
```

The built application will be in `build/bin/bearing`.

## Testing

```bash
# Run all tests
make test

# Run specific test categories
make test-backend-unit          # Go unit tests
make test-backend-integration   # Go integration tests
make test-backend-performance   # Go performance tests
make test-backend-bench         # Go benchmarks
make test-frontend              # Frontend type checks + Vitest
make test-ui-component-headless # Playwright UI component tests
make test-e2e-headless          # True E2E tests (with file verification)
```

### Test Structure

- `internal/access/*_test.go` - Data access layer tests
- `internal/managers/*_test.go` - Business logic tests
- `internal/utilities/*_test.go` - Utility tests
- `internal/integration/*_test.go` - Go integration tests
- `tests/ui-component/` - Playwright UI component tests (against Vite mock bindings)
- `tests/e2e/` - Playwright E2E tests (against Wails dev server with file verification)

## Project Structure

```
bearing/
├── main.go                     # Wails application entry point
├── wails.json                  # Wails configuration
├── frontend/                   # Svelte 5 frontend
│   ├── src/
│   │   ├── App.svelte         # Main app with navigation
│   │   ├── views/             # OKRView, CalendarView, EisenKanView
│   │   └── lib/
│   │       ├── components/    # Breadcrumb, ThemeBadge, etc.
│   │       └── utils/         # ID parser, helpers
│   └── package.json
├── internal/
│   ├── access/                # Data access layer (PlanAccess)
│   ├── managers/              # Business logic (PlanningManager)
│   ├── utilities/             # Git versioning utility
│   └── integration/           # Go integration tests
├── tests/
│   ├── ui-component/          # Playwright UI component tests
│   └── e2e/                   # Playwright E2E tests
├── scripts/                   # Test runner scripts
└── Makefile
```

## Data Storage

Data is stored in `~/.bearing/` as JSON files with git versioning:

```
~/.bearing/
├── themes/themes.json         # Life themes with OKRs
├── calendar/2026.json         # Day focus entries
└── tasks/            # Tasks organized by theme
    ├── todo/
    ├── doing/
    └── done/
```

## Development Notes

This application is developed using specification-driven multi-agent ML model support based on [CCPM](https://github.com/automazeio/ccpm).
