# Makefile for Bearing

SHELL := /bin/bash
.ONESHELL:
.SHELLFLAGS := -eufo pipefail -c

APP_NAME := bearing
BIN_DIR := build/bin
OUTPUT := $(BIN_DIR)/$(APP_NAME)

# Version can be set via environment variable: make build VERSION=1.0.0
VERSION ?= dev

# Build flags to suppress duplicate library warnings on macOS
ifeq ($(shell uname),Darwin)
	BUILD_FLAGS := -ldflags "-X main.version=$(VERSION) -w"
	export CGO_LDFLAGS := $(CGO_LDFLAGS) -Wl,-no_warn_duplicate_libraries
else
	BUILD_FLAGS := -ldflags "-X main.version=$(VERSION)"
endif

.PHONY: help
help: ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z0-9_-]+:.*?##/ { printf "  \033[36m%-28s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development

.PHONY: setup
setup: frontend-install test-frontend-e2e-install ## Setup project (install all dependencies)
	@echo "Project setup complete!"
	@echo ""
	@echo "To run the application:"
	@echo "  make dev              - Run in development mode (Wails + Vite HMR)"
	@echo "  make frontend-dev     - Run frontend only (browser testing)"
	@echo "  make build            - Build production binary"

.PHONY: generate
generate: frontend-install ## Generate Wails bindings (required after cloning or in new worktrees)
	@if [ ! -d "frontend/src/lib/wails/wailsjs" ]; then \
		echo "Building frontend first..."; \
		$(MAKE) --no-print-directory -C frontend build-dist; \
		echo "Generating Wails bindings..."; \
		~/go/bin/wails generate module; \
		echo "Bindings generated at frontend/src/lib/wails/"; \
	else \
		echo "Wails bindings already exist, skipping generation."; \
	fi

.PHONY: dev
dev: generate frontend-lint ## Run Wails app in development mode with hot reload
	@echo "Starting Wails development mode..."
	@echo "Vite dev server with HMR enabled"
	@echo "Native app window will open"
	~/go/bin/wails dev

.PHONY: frontend-dev
frontend-dev: ## Run Vite dev server only (for browser testing with mock bindings)
	@$(MAKE) --no-print-directory -C frontend dev

.PHONY: stop-dev
stop-dev: ## Stop any running dev servers
	@echo "Stopping any process on port 5173..."
	@-lsof -ti:5173 | xargs kill -9 2>/dev/null || true
	@echo "Done."

##@ Build

.PHONY: build
build: generate frontend-lint ## Build Wails desktop application
	@echo "Building $(APP_NAME)..."
	@$(MAKE) --no-print-directory -C frontend check
	@echo "Building Wails application..."
	~/go/bin/wails build
	@echo "Build complete: $(OUTPUT)"

.PHONY: build-go
build-go: ## Build Go binary only (without frontend)
	@echo "Building Go binary..."
	@mkdir -p $(BIN_DIR)
	go build $(BUILD_FLAGS) -o $(OUTPUT) .

.PHONY: clean
clean: ## Clean build artifacts
	@echo "Cleaning build artifacts..."
	@rm -rf $(BIN_DIR)
	@rm -rf build/
	@rm -rf frontend/dist/
	@rm -rf frontend/node_modules/

##@ Testing

.PHONY: test
test: lint test-backend test-frontend ## Lint all code and run all tests (Go + frontend)

.PHONY: test-backend
test-backend: ## Run all Go tests
	@echo "Running all Go tests..."
ifeq ($(shell uname),Darwin)
	CGO_LDFLAGS="$(CGO_LDFLAGS) -Wl,-no_warn_duplicate_libraries" go test ./...
else
	go test ./...
endif

.PHONY: test-backend-unit
test-backend-unit: ## Run Go unit tests only
	@echo "Running Go unit tests..."
ifeq ($(shell uname),Darwin)
	CGO_LDFLAGS="$(CGO_LDFLAGS) -Wl,-no_warn_duplicate_libraries" go test -short -run "TestUnit_" ./...
else
	go test -short -run "TestUnit_" ./...
endif

.PHONY: test-backend-integration
test-backend-integration: ## Run Go integration tests
	@echo "Running Go integration tests..."
ifeq ($(shell uname),Darwin)
	CGO_LDFLAGS="$(CGO_LDFLAGS) -Wl,-no_warn_duplicate_libraries" go test -run "TestIntegration_" ./internal/integration/...
else
	go test -run "TestIntegration_" ./internal/integration/...
endif

.PHONY: test-backend-performance
test-backend-performance: ## Run Go performance tests
	@echo "Running Go performance tests..."
ifeq ($(shell uname),Darwin)
	CGO_LDFLAGS="$(CGO_LDFLAGS) -Wl,-no_warn_duplicate_libraries" go test -run "TestPerformance_" ./internal/integration/...
else
	go test -run "TestPerformance_" ./internal/integration/...
endif

.PHONY: test-backend-bench
test-backend-bench: ## Run Go benchmarks
	@echo "Running Go benchmarks..."
ifeq ($(shell uname),Darwin)
	CGO_LDFLAGS="$(CGO_LDFLAGS) -Wl,-no_warn_duplicate_libraries" go test -bench=. -benchmem ./internal/integration/...
else
	go test -bench=. -benchmem ./internal/integration/...
endif

.PHONY: test-frontend
test-frontend: ## Run frontend TypeScript checks and Vitest unit tests
	@$(MAKE) --no-print-directory -C frontend test

.PHONY: test-frontend-e2e-install
test-frontend-e2e-install: ## Install Playwright test dependencies
	@$(MAKE) --no-print-directory -C frontend e2e-install

.PHONY: test-frontend-e2e
test-frontend-e2e: ## Run Playwright E2E tests (requires frontend-dev running)
	@$(MAKE) --no-print-directory -C frontend e2e

.PHONY: test-frontend-e2e-headless
test-frontend-e2e-headless: ## Run Playwright E2E tests in headless mode
	@$(MAKE) --no-print-directory -C frontend e2e-headless

##@ Frontend

.PHONY: frontend-install
frontend-install: ## Install frontend dependencies
	@$(MAKE) --no-print-directory -C frontend install

.PHONY: frontend-build
frontend-build: ## Build frontend for production
	@$(MAKE) --no-print-directory -C frontend build

.PHONY: frontend-check
frontend-check: ## Run TypeScript type checking
	@$(MAKE) --no-print-directory -C frontend check

.PHONY: frontend-lint
frontend-lint: ## Run frontend linter (ESLint + Svelte)
	@$(MAKE) --no-print-directory -C frontend lint

##@ Utilities

.PHONY: lint
lint: frontend-lint ## Run all linters (Go + frontend)
	@echo "Running Go linter..."
	go tool golangci-lint run ./...

.PHONY: fmt
fmt: ## Format Go code
	@echo "Formatting Go code..."
	go fmt ./...
