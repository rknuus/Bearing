# Makefile for Bearing Frontend

SHELL := /bin/bash
.ONESHELL:
.SHELLFLAGS := -eufo pipefail -c

.PHONY: help
help: ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z0-9_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development

.PHONY: install
install: ## Install frontend dependencies
	@echo "Installing frontend dependencies..."
	@npm install

.PHONY: dev
dev: ## Run Vite dev server (for browser testing with mock bindings)
	@echo "Starting Vite dev server for browser testing..."
	@echo "Server: http://localhost:5173 (with mock Wails bindings)"
	@npm run dev

##@ Build

.PHONY: build
build: lint ## Build frontend for production
	@echo "Running TypeScript type checking..."
	@npm run check
	@echo "Building frontend..."
	@npm run build

.PHONY: build-dist
build-dist: ## Build frontend dist only (no lint/check)
	@npm run build

.PHONY: check
check: ## Run TypeScript type checking
	@echo "Running TypeScript type checking..."
	@npm run check

.PHONY: lint
lint: ## Run frontend linter (ESLint + Svelte)
	@echo "Running frontend linter..."
	@npm run lint

##@ Testing

.PHONY: test
test: ## Run TypeScript checks and Vitest unit tests
	@echo "Running TypeScript type checking..."
	@npm run check
	@echo "Running Vitest unit tests..."
	@npm test -- --run

.PHONY: e2e-install
e2e-install: ## Install Playwright test dependencies
	@echo "Installing Playwright test dependencies..."
	@cd ../tests/ui-component && npm install
	@echo "Installing Playwright browsers..."
	@cd ../tests/ui-component && npx playwright install chromium

.PHONY: e2e
e2e: ## Run Playwright E2E tests (requires dev server running)
	@echo "Running Playwright E2E tests against Vite dev server..."
	@echo "Note: Ensure 'make dev' is running in another terminal first"
	@echo "      Vite server: http://localhost:5173 (with mock Wails bindings)"
	@cd ../tests/ui-component && npm test

.PHONY: e2e-headless
e2e-headless: ## Run Playwright E2E tests in headless mode
	@echo "Running Playwright UI component tests in headless mode..."
	@cd ../tests/ui-component && HEADLESS=true npm test
