---
name: bump-go-toolchain
status: backlog
created: 2026-04-10T09:28:53Z
progress: 0%
initiative: .ccpm/initiatives/bump-go-toolchain/bump-go-toolchain.md
depends_on: []
---

# Epic: bump-go-toolchain

## Overview
Upgrade the Go toolchain from 1.25.0 to the latest stable release, pin it via the `toolchain` directive in `go.mod`, and update CI to derive versions from project configuration instead of hardcoding them.

## Scope
- Update `go.mod` `go` and `toolchain` directives to latest stable Go
- Run `go mod tidy` and resolve dependency changes
- Update `.github/workflows/release.yml` to use `go-version-file: go.mod` instead of hardcoded version
- Replace `go install wails@v2.11.0` in CI with `go tool wails` (uses `tool` directive from `go.mod`)
- Verify build, tests, and linting pass

## Dependencies
- None (first and only epic in this initiative)

## Tasks Created
- [ ] 35.md - Bump go.mod to Go 1.26.2 with toolchain directive (parallel: false)
- [ ] 36.md - Update CI to derive Go version from go.mod (parallel: false, depends on 35)

Total tasks: 2
Parallel tasks: 0
Sequential tasks: 2
Estimated total effort: 1.5 hours
