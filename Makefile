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
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development

.PHONY: setup
setup: frontend-install ## Setup project (install all dependencies)
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
		cd frontend && npm run build; \
		echo "Generating Wails bindings..."; \
		cd .. && ~/go/bin/wails generate module; \
		echo "Bindings generated at frontend/src/lib/wails/"; \
	else \
		echo "Wails bindings already exist, skipping generation."; \
	fi

.PHONY: dev
dev: generate ## Run Wails app in development mode with hot reload
	@echo "Starting Wails development mode..."
	@echo "Vite dev server with HMR enabled"
	@echo "Native app window will open"
	~/go/bin/wails dev

.PHONY: frontend-dev
frontend-dev: ## Run Vite dev server only (for browser testing with mock bindings)
	@echo "Starting Vite dev server for browser testing..."
	@echo "Server: http://localhost:5173 (with mock Wails bindings)"
	@cd frontend && npm run dev

.PHONY: stop-dev
stop-dev: ## Stop any running dev servers
	@echo "Stopping any process on port 5173..."
	@-lsof -ti:5173 | xargs kill -9 2>/dev/null || true
	@echo "Done."

##@ Build

.PHONY: build
build: generate ## Build Wails desktop application
	@echo "Building $(APP_NAME)..."
	@echo "Running TypeScript type checking..."
	@cd frontend && npm run check
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
test: ## Run all Go tests
	@echo "Running all tests..."
ifeq ($(shell uname),Darwin)
	CGO_LDFLAGS="$(CGO_LDFLAGS) -Wl,-no_warn_duplicate_libraries" go test ./...
else
	go test ./...
endif

.PHONY: test-unit
test-unit: ## Run unit tests only
	@echo "Running unit tests..."
ifeq ($(shell uname),Darwin)
	CGO_LDFLAGS="$(CGO_LDFLAGS) -Wl,-no_warn_duplicate_libraries" go test -short -run "TestUnit_" ./...
else
	go test -short -run "TestUnit_" ./...
endif

.PHONY: test-integration
test-integration: ## Run integration tests
	@echo "Running integration tests..."
ifeq ($(shell uname),Darwin)
	CGO_LDFLAGS="$(CGO_LDFLAGS) -Wl,-no_warn_duplicate_libraries" go test -run "TestIntegration_" ./internal/integration/...
else
	go test -run "TestIntegration_" ./internal/integration/...
endif

.PHONY: test-performance
test-performance: ## Run performance tests
	@echo "Running performance tests..."
ifeq ($(shell uname),Darwin)
	CGO_LDFLAGS="$(CGO_LDFLAGS) -Wl,-no_warn_duplicate_libraries" go test -run "TestPerformance_" ./internal/integration/...
else
	go test -run "TestPerformance_" ./internal/integration/...
endif

.PHONY: test-bench
test-bench: ## Run benchmarks
	@echo "Running benchmarks..."
ifeq ($(shell uname),Darwin)
	CGO_LDFLAGS="$(CGO_LDFLAGS) -Wl,-no_warn_duplicate_libraries" go test -bench=. -benchmem ./internal/integration/...
else
	go test -bench=. -benchmem ./internal/integration/...
endif

.PHONY: test-frontend
test-frontend: ## Run frontend TypeScript checks
	@echo "Running TypeScript type checking..."
	@cd frontend && npm run check

##@ Frontend

.PHONY: frontend-install
frontend-install: ## Install frontend dependencies
	@echo "Installing frontend dependencies..."
	@cd frontend && npm install

.PHONY: frontend-build
frontend-build: ## Build frontend for production
	@echo "Running TypeScript type checking..."
	@cd frontend && npm run check
	@echo "Building frontend..."
	@cd frontend && npm run build

.PHONY: frontend-check
frontend-check: ## Run TypeScript type checking
	@echo "Running TypeScript type checking..."
	@cd frontend && npm run check

##@ Utilities

.PHONY: lint
lint: ## Run Go linter
	@echo "Running Go linter..."
	golangci-lint run ./...

.PHONY: fmt
fmt: ## Format Go code
	@echo "Formatting Go code..."
	go fmt ./...
