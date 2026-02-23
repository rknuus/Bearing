---
created: 2026-02-23T00:00:00Z
last_updated: 2026-02-23T00:00:00Z
version: 1.0
author: Claude Code PM System
---

# Reference Projects

Open-source projects to consult when looking for patterns and prior art. No single project covers the full Wails v2 + Svelte 5 + drag-and-drop stack, so each reference serves a specific purpose.

## 1. rogchap/wombat — Wails v2 Architecture & IPC

- **URL:** https://github.com/rogchap/wombat
- **Stack:** Wails v2, Svelte 4, Go | 1.4k stars, 177 commits, 9 contributors
- **What it is:** Cross-platform gRPC client desktop app.

### When to consult
- **Wails v2 project structure** — how to organize `internal/`, `frontend/`, and root-level Go files in a production Wails app
- **Go ↔ Svelte IPC patterns** — binding design, method exposure, error propagation across the Wails bridge
- **Multi-contributor conventions** — commit hygiene and code organization that scales beyond a single developer
- **Cross-platform build configuration** — CI/CD and platform-specific build targets

### Not useful for
- Svelte 5 runes patterns (uses Svelte 4)
- Drag-and-drop
- Complex frontend state management

---

## 2. thisuxhq/sveltednd — Svelte 5 Drag-and-Drop Patterns

- **URL:** https://github.com/thisuxhq/sveltednd
- **Stack:** Svelte 5, TypeScript | 495 stars, 78 commits
- **What it is:** Lightweight DnD library built natively on Svelte 5 runes.

### When to consult
- **Svelte 5 runes in a DnD context** — idiomatic `$state` / `$effect` usage for drag state tracking
- **TypeScript generics with Svelte 5** — typed draggable/droppable action interfaces
- **Kanban board example** — `src/routes/+page.svelte` shows a Kanban built with Svelte 5 DnD
- **Potential migration target** — if `svelte-dnd-action` ever becomes a maintenance burden, this is the leading Svelte 5-native alternative

### Not useful for
- Go backend patterns
- Wails IPC
- Application-level architecture

---

## 3. Gahara-Editor/gahara — Layered Go Backend with Wails

- **URL:** https://github.com/Gahara-Editor/gahara
- **Stack:** Wails v2, Svelte, Go, TypeScript | 38 stars, 100 commits
- **What it is:** Vim-inspired video editor desktop app.

### When to consult
- **Go `internal/` package layout** — closest analog to Bearing's `internal/managers` + `internal/access` layered architecture
- **Engine/builder abstraction** — dedicated `ffmpegbuilder/` module shows how to isolate algorithm-heavy logic from the access layer (similar to Bearing's `internal/engines`)
- **Platform-specific Go code** — `darwin.go`, `linux.go`, `windows.go` build-tag patterns for OS-specific behavior
- **Balanced Svelte/Go ratio** — 41% Svelte / 39% Go, similar split to Bearing

### Not useful for
- Svelte 5 runes (version unclear, likely Svelte 4)
- Drag-and-drop
- Release management (beta, single release)

---

## 4. Sammy-T/avda — Release Management & Long-Term Maintenance

- **URL:** https://github.com/Sammy-T/avda
- **Stack:** Wails v2, Svelte, Go | 53 stars, 385 commits, 25 releases
- **What it is:** Desktop app for generating and viewing OTPs from Aegis backups.

### When to consult
- **Release discipline** — 25 releases (v1.13.2) with a consistent versioning cadence; best example of maintaining a Wails app over time
- **CI/CD for Wails** — GitHub Actions workflows for cross-platform builds and release automation
- **Compact Go backend** — flat file layout (`app.go`, `config.go`, `data.go`, `main.go`) as a contrast to Bearing's layered `internal/` approach; useful when evaluating whether a simpler structure would suffice for new features
- **Wails upgrade path** — long commit history shows how the project adapted across Wails updates

### Not useful for
- Complex frontend patterns
- Drag-and-drop
- Svelte 5 runes
