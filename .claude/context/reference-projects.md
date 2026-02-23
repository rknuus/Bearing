---
created: 2026-02-23T00:00:00Z
last_updated: 2026-02-23T00:00:00Z
version: 1.0
author: Claude Code PM System
---

# Reference Projects

Open-source projects to consult when looking for patterns and prior art.

## Part A — Wails v2 + Svelte Stack

No single project covers the full Wails v2 + Svelte 5 + drag-and-drop stack, so each reference serves a specific purpose.

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

---

## Part B — iDesign / The Method Architecture

iDesign's "The Method" (Juval Lowy, *Righting Software*) is a proprietary methodology with very few open-source implementations. The layer terminology maps to Bearing's backend as follows:

| iDesign Term | Bearing Equivalent | Role |
|---|---|---|
| Client | Frontend (Svelte) | UI, no business logic |
| Manager | `internal/managers/` | Workflow orchestration, business rules |
| Engine | `internal/engines/` | Stateless algorithms, computation |
| Resource Access (Accessor) | `internal/access/` | CRUD, file I/O, data models |
| Utility | `internal/utilities/` | Cross-cutting (versioning, logging) |

### Dependency rules
- Flow is top-down only: Client → Manager → Engine → Accessor
- Managers may call Engines and Accessors, never the reverse
- Engines are stateless; Managers hold workflow state when needed
- Accessors are independent services, not servants to Managers
- Utilities are callable from any layer
- No horizontal calls between Managers (async events only)

## 5. countincognito/Zametek.ProjectPlan — Righting Software in Practice (C#)

- **URL:** https://github.com/countincognito/Zametek.ProjectPlan
- **Stack:** C# (.NET 10), Avalonia UI, ReactiveUI | 229 stars, 50 forks, 620 commits, 10 contributors, 33 releases
- **What it is:** Cross-platform desktop project planning tool explicitly built to automate tasks from *Righting Software*. The most complete open-source implementation of iDesign principles found anywhere.

### Architecture layers

```
Zametek.Contract.ProjectPlan   → Contracts (interfaces for all Manager ViewModels and services)
Zametek.ViewModel.ProjectPlan  → Managers + Engines (orchestration, graph compilers, business logic)
Zametek.Common.ProjectPlan     → Shared models, enums, DTOs (DataContracts)
Zametek.Data.ProjectPlan       → Resource Access (versioned data serialization, file I/O)
Zametek.View.ProjectPlan       → Client (Avalonia UI views, no business logic)
Zametek.Resource.ProjectPlan   → Static assets (icons, images)
Zametek.ProjectPlan            → Entry point (DI wiring via Bootstrapper.cs)
```

### When to consult
- **Full iDesign implementation in a real app** — only open-source project explicitly following *Righting Software*, with 620 commits and 33 releases proving the architecture at scale
- **Contract-first design** — `Zametek.Contract.ProjectPlan` defines all `I*ManagerViewModel` interfaces in a separate project; implementations live in `Zametek.ViewModel.ProjectPlan`
- **Engine separation** — `GraphCompilers/` folder isolates stateless graph algorithms (`VertexGraphCompiler`, `ArrowGraphCompiler`) from the `CoreViewModel` manager that orchestrates them
- **DI wiring (Bootstrapper.cs)** — `Bootstrapper.RegisterIOC()` maps every interface to implementation via Splat IoC: `SplatRegistrations.RegisterLazySingleton<ICoreViewModel, CoreViewModel>()` — analogous to Bearing's `main.go` wiring `PlanningManager` → `PlanAccess`
- **Versioned data models** — `Zametek.Data.ProjectPlan` has `v0_1_0/` through `v0_4_4/` subdirectories showing how to evolve data schemas while maintaining backward compatibility
- **Desktop app patterns** — Avalonia (MVVM) is architecturally comparable to Wails (Go backend + UI frontend); both have a client layer that holds zero business logic
- **Manager granularity** — ~12 distinct manager ViewModels (`ActivitiesManager`, `GanttChartManager`, `ResourceChartManager`, `TrackingManager`, etc.) showing how to decompose a planning domain into focused managers

### Not useful for
- Go patterns (C#/.NET-specific)
- Svelte/web frontend patterns
- Drag-and-drop (uses data grids, not kanban)

### Maturity: High (229 stars, 620 commits, 33 releases, 10 contributors, actively maintained on .NET 10)

---

## 6. joerglang/IDesign-VirtualTradeMe — iDesign Skeleton (C#) [supplementary]

- **URL:** https://github.com/joerglang/IDesign-VirtualTradeMe
- **Stack:** C# (.NET) | 32 stars, 11 forks, 9 commits
- **What it is:** Skeleton Visual Studio solution showing the canonical iDesign project layout. No functional code — pure namespace/folder structure reference.

### When to consult
- **Canonical iDesign folder layout** — `Contract`, `DataAccess`, `Engine`, `Manager`, `Proxy`, `Test` per subsystem
- **Namespace conventions** — `<Company>.<Concept>.[<Product>].<Subsystem>` pattern
- **Public vs internal contracts** — Manager contracts are public (in separate Contract projects); Engine and Accessor interfaces stay internal to their projects
- **Utility organization** — `<Company>.Utilities.<Utility>.<Concept>` for cross-cutting concerns (Auditing, Logging, ServiceBus, Metrics)
- **Infrastructure (iFX)** — convention-based service discovery and hosting patterns

### Not useful for
- Actual business logic implementation (skeleton only)
- Go patterns (C#/.NET-specific)
- Modern practices (last updated 2015)

### Maturity: Low (structural reference only)

---

## 7. twilsman/IDesignCodeGenerator — iDesign Scaffolding Tool (C#) [supplementary]

- **URL:** https://github.com/twilsman/IDesignCodeGenerator
- **Stack:** C# (.NET) | 2 stars, 3 forks, 6 commits
- **What it is:** Code generator that scaffolds iDesign-patterned projects from database schema.

### When to consult
- **iDesign layer naming in practice** — generates `IDG.Managers.*`, `IDG.Engines.*`, `IDG.ResourceAccess.*`, `IDG.Shared.Contracts`, `IDG.Shared.DataContracts`, `IDG.Shared.Utilities`
- **Accessor generation patterns** — how DataContracts, DatabaseAccessors, and service interfaces map to database tables
- **Layer wiring** — how Managers orchestrate Engines which use ResourceAccess

### Not useful for
- Go patterns
- Modern .NET (uses Entity Framework Fluent API, older patterns)
- Production code quality (self-described as "rock-stupid" name translation)

### Maturity: Proof-of-concept

---

## 8. evrone/go-clean-template — Go Layered Architecture (closest Go analog)

- **URL:** https://github.com/evrone/go-clean-template
- **Stack:** Go | 7.3k stars, 639 forks, 505 commits
- **What it is:** Clean Architecture template for Go services with REST, gRPC, AMQP, and NATS support.

### iDesign mapping
| go-clean-template | iDesign | Bearing |
|---|---|---|
| `internal/usecase/` | Manager | `internal/managers/` |
| `internal/entity/` | DataContract/Model | `internal/access/models.go` |
| `internal/controller/` | Client | Frontend |
| `internal/repo/` | Resource Access | `internal/access/` |
| `pkg/` | Utility | `internal/utilities/` |

### When to consult
- **Go dependency inversion** — inner layers use only stdlib; outer layers inject via interfaces
- **Interface-driven layer boundaries** — UseCase defines repository interfaces, not the other way around
- **Dependency injection in Go** — constructor-based wiring without frameworks
- **Multiple transport protocols** — same business logic served via REST, gRPC, or message queue
- **Testing patterns** — mock generation with Testify, integration test infrastructure

### Not useful for
- iDesign's Engine layer (no separate computation/algorithm tier)
- Desktop app patterns (server-focused)
- Frontend architecture

### Maturity: Production-grade template (7.3k stars, 505 commits, actively maintained)

---

## 9. irahardianto/service-pattern-go — Go Service Layer with DI (iDesign-adjacent)

- **URL:** https://github.com/irahardianto/service-pattern-go
- **Stack:** Go | 896 stars, 121 forks, 63 commits
- **What it is:** REST API demonstrating SOLID principles with explicit service/repository separation and compile-time dependency injection.

### iDesign mapping
| service-pattern-go | iDesign | Bearing |
|---|---|---|
| `services/` | Manager | `internal/managers/` |
| `repositories/` | Resource Access | `internal/access/` |
| `models/` | DataContract | `internal/access/models.go` |
| `interfaces/` | Contracts | Go interfaces in each package |
| `infrastructures/` | Utility | `internal/utilities/` |

### When to consult
- **Compile-time DI in Go** — `servicecontainer.go` wires all dependencies at startup without reflection or frameworks (closest to how `main.go` wires Bearing's `PlanningManager` → `PlanAccess`)
- **Interface-per-layer pattern** — explicit `IPlayerService` / `IPlayerRepository` contracts
- **Decorator pattern for resilience** — `PlayerRepositoryWithCircuitBreaker` wraps base repository (pattern applicable if Bearing needs retry/fallback around file I/O)
- **Mock-based testing** — Mockery-generated mocks injected through interfaces

### Not useful for
- Engine layer (no separate algorithm tier)
- Desktop/frontend patterns
- Complex domain logic

### Maturity: Stable educational reference (896 stars, well-documented)
