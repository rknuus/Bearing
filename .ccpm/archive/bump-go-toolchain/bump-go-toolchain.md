---
name: bump-go-toolchain
description: Upgrade Go toolchain to latest stable with project-pinned version via go.mod toolchain directive
status: complete
created: 2026-04-10T09:26:27Z
updated: 2026-04-10T09:40:46Z
completed: 2026-04-10T09:40:46Z
---

# Initiative: bump-go-toolchain

## Executive Summary

Upgrade the project's Go toolchain from 1.25.0 to the latest stable release (1.26.x) and pin the version as a project-level dependency using Go's built-in `toolchain` directive in `go.mod`. Eliminate hardcoded Go versions from CI in favor of deriving them from project configuration.

## Problem Statement

The project's Go version (1.25.0 in `go.mod` and CI) lags behind the latest stable release. The CI workflow hardcodes version strings for both Go and the Wails CLI, creating drift between what developers run locally and what CI builds against. There is no project-level Go version pinning — developers must manually ensure they have the right version installed.

Specific issues:
1. `go.mod` specifies `go 1.25.0` while the latest stable is 1.26.x
2. CI hardcodes `go-version: "1.25.0"` in `.github/workflows/release.yml`
3. CI installs `wails@v2.11.0` while `go.mod` requires `wails/v2 v2.12.0` — a version mismatch
4. No mechanism ensures all contributors and CI use the same Go version

## User Stories

1. **As a developer**, I want the project to pin its Go toolchain version in `go.mod` so that `go` automatically downloads the correct version when I clone the repo and run any Go command.
   - *Acceptance criteria*: Running `go build` in a fresh clone auto-downloads the pinned Go version without manual installation steps.

2. **As a CI maintainer**, I want the CI workflow to derive its Go version from the project configuration rather than hardcoding it, so version bumps only require changing one file (`go.mod`).
   - *Acceptance criteria*: `.github/workflows/release.yml` reads the Go version from `go.mod` instead of a hardcoded string. Bumping the version in `go.mod` is the only change needed for CI to pick it up.

3. **As a CI maintainer**, I want the Wails CLI version in CI to match the version pinned in `go.mod`'s `tool` directive, eliminating the current v2.11.0 vs v2.12.0 mismatch.
   - *Acceptance criteria*: CI uses `go tool wails` (which respects the `tool` directive) instead of a separately installed global binary.

4. **As a developer**, I want the project to build and pass all tests on the latest stable Go version so I can benefit from performance improvements, language features, and security fixes.
   - *Acceptance criteria*: `make test`, `make test-ui-component-headless`, `make test-e2e-headless`, `make lint`, and `make build` all pass on the bumped Go version.

## Functional Requirements

1. Update `go.mod` `go` directive from `1.25.0` to the latest stable Go version
2. Add `toolchain go1.X.Y` directive to `go.mod` to pin the exact toolchain version
3. Run `go mod tidy` to update `go.sum` and resolve any dependency changes
4. Update `.github/workflows/release.yml` to extract the Go version from `go.mod` rather than hardcoding it
5. Update `.github/workflows/release.yml` to use `go tool wails` instead of globally installing a hardcoded Wails CLI version
6. Verify Wails v2.12.0 compatibility with the new Go version (build + tests)
7. Verify all existing tests pass (`make test`, `make test-ui-component-headless`, `make test-e2e-headless`)
8. Verify linting passes (`make lint`)

## Non-Functional Requirements

1. Zero additional tooling dependencies — only Go's built-in `toolchain` directive
2. Wails must remain at v2.x (v3 upgrade is a separate initiative)
3. CI workflow changes must be backward-compatible with the release process

## Success Criteria

1. `go.mod` contains both `go 1.X.Y` and `toolchain go1.X.Y` directives pointing to the latest stable release
2. `go version` in a fresh environment auto-downloads the pinned toolchain
3. CI derives Go version from `go.mod` — no hardcoded version strings for Go or Wails CLI
4. All tests and linting pass on the new version
5. `make build` produces a working application

## Constraints & Assumptions

- The latest stable Go version is assumed compatible with Wails v2.12.0 (will be verified)
- The `toolchain` directive requires Go 1.21+ on the developer's machine to trigger auto-download (any recent Go install satisfies this)
- CI uses `actions/setup-go` which supports reading from `go.mod` natively via `go-version-file`

## Out of Scope

- Upgrading Wails from v2.x to v3.x (separate initiative)
- Bumping Go module dependencies beyond what `go mod tidy` requires
- Upgrading golangci-lint or changing linter rules
- Adding mise, asdf, Nix, or any external version manager
- Multi-platform CI matrix expansion

## Dependencies

- Latest stable Go release must support the project's CGo requirements (WebKit bindings on macOS)
- `actions/setup-go` must support `go-version-file: go.mod` (confirmed: supported since v4)
