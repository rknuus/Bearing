# Detailed Design

The Method's per-component detailed-design discipline. Write **zero code** during DD — interfaces don't count as code.

## Objective & process

- DD's objective is **risk removal** — eliminate surprises and ripple effects, don't nail down every parameter.
- DD emerges iteratively. Sketch, interview, review, refine, refactor. Plan to iterate when it's cheap (design), not when it's expensive (implementation).
- Refactor the design before the code — moving blocks and arrows is vastly cheaper.
- Make concepts concrete fast — vertical slice dispels disbelievers, jump-starts absorption, establishes leadership.
- **HOP** (Hand-Off Point): Junior HOP needs DD to parameter level; Senior HOP needs only service/interface outline. Know thy team.
- Domain experts throughout — interview to uncover true behavior, reveal facets, operations, data flow.
- Stress-test with outlandish requirements; gems emerge late.

## Use cases & iteration

- All DD driven from use cases — call chains validate architecture; sequence diagrams past a complexity threshold.
- Iterate across **all** contracts simultaneously — bring all to the same maturity together.
- Pursue use cases beyond core; stopping at core leaves gaps.
- Start with **behavior**, not DTOs.

## Contract factoring

- 3-5 ops/interface, ~2.2 interfaces/service, ~0.7-0.8 params/op. Violation = bad design.
- All operations are behavioral business verbs. Zero properties, no CRUD across all interfaces.
- Apply factoring **per layer** — what fits Access doesn't fit Manager.
- Be specific until it hurts, then back off slightly.
- Naming smells (prefixes, suffixes, three-part names) = emerging facets — factor into separate interfaces or subsystems.
- Components commonly have multiple facets; segregate when use-case analysis reveals diverging behaviors.
- Never orchestrate a use case from the client.

## DTOs

- Never share DTOs between use cases at the Manager layer.
- Apply SOLID to DTOs. Polymorphism is the only effective tool for high variability — but **don't default to it** without evidence (see "Polymorphic hierarchical DTOs" below).
- Align data contracts with service contracts; refactor together.
- Never leak internal DTOs outward or Manager DTOs inward.

## Infrastructure framework (iFX)

- Build iFX **first** — reduces risk, simplifies dependencies, establishes the programming model.
- Platform/framework choices never appear in architecture diagrams or service code; with proper iFX, the same system runs on any platform by changing only lower iFX layers.
- Codify policy *through* the iFX — don't rely on developer discipline. Make developers fall into a pit of success.
- Separate business code from iFX code.
- Design iFX for testability and extensibility from day one.

## Namespace & project structure

- Namespace: `<Company>.<Concept>.<Volatility>.<Aspect>` — e.g. `IDesign.Manager.Sales.Interface`, `IDesign.Engine.Validation.Service`.
- `Concept` = `Manager | Engine | Access`.
- `Volatility` = the encapsulated volatility (Sales, Validation, Customer).
- `Aspect` = `Interface` (contracts + DTOs) | `Service` (impl).
- Each component → two projects: Interface and Service. Service references only Interface projects of dependencies.
- IoC / `InProcFactory` resolves contracts to impls. Callers depend on Interface only.
- Convention deliberately reverses standard `<Company>.<Product>.<Subsystem>.<Concept>` to enable broad search.
- Optional 5th segment `<Context>`: e.g. `Manager.Content.Interface.Delivery`. Engines always segregate by Subsystem context; Managers segregate to clarify public consumption.
- Manager DTO rule: never send public DTOs to Engines/Access; never emit component DTOs to clients; public DTOs ship as part of the subsystem SDK.
- Access DTO rule: never emit data entities as DTOs.
- Subsystem hosting composes `Hosting.Register()` calls — declarative composition.
- A vertical slice wires one use case end-to-end through all layers — validates architecture before broader implementation.

## Polymorphic hierarchical DTOs

- Never use `GetBy<...>()` proliferation — canonical DD anti-pattern.
- Define abstract base (e.g. `FindCriteriaBase`) with `KnownType`-registered concrete derivations.
- Service exposes one operation typed on the base — `Find(FindCriteriaBase)`, `Send(NotificationRequestBase)`.
- New variant = new DTO subclass + registration. Contract / gateway / controller never change.
- KnownTypes is the SO equivalent of generics polymorphism — supported by Json.NET, System.Text.Json, etc.
- Encapsulate request volatility in **data contracts**, not service contracts. Data is cheap to extend; service contracts are expensive.
- Hiding GetBy in per-criterion DTO names (`FooByIDFilterCriteria`, `FooByNameFilterCriteria`) is still GetBy — DTO names should not encode the query mechanism.
- Aligns with SOLID: OCP (extend without modifying contract), ISP (one focused op), SRP (each criteria has one reason to change), LSP (any derived substitutes for base), DIP (callers depend on abstraction).

## Ambient context

- Cross-cutting state (caller, tenant, correlation/trace ID, worktree scope, locale) flows through the call chain via iFX-owned ambient context — `AsyncLocal<T>`, `OperationContext`, per-call DI scope. **Never** as explicit DTO parameters threaded through every operation.
- Distinguish business data (order ID, line items — explicit DTO params) from cross-cutting context. If a parameter appears on every method in a chain and is never transformed, it's ambient.
- Set context at the entry boundary (`Client → Manager`); read anywhere downstream. Lower layers must never mutate context.
- Resolve client-context variation (iPhone vs Android, tenant, locale) via ambient context + IoC binding — Manager orchestration stays identical; iFX resolves the device-specific Engine/RA.
- `if (context.DeviceType == ...)` in a Manager = leak — volatility escaped into orchestration. Factor into a swappable Engine/RA.
- Context is a cross-cutting concern owned by the iFX. If developers wire it explicitly, the iFX is incomplete.
- Never global singletons or thread-locals without typed abstraction — both break under async/await, parallel execution, test isolation.

## Validation Engine — placement & factoring

- Validation is an **Engine** concern, not a Manager concern. Result of validation is used during flow control in the Manager. Manager code stays clean and almost-expendable.
- A Validation Engine is warranted only when validation is independently volatile from the business processes it guards. "Is the validation independently volatile from the Engines' business logic?"
- Validation requiring DB lookup (balance check, entity existence) → strong Engine candidate. Can't live in a Manager — Managers don't access resources.
- Smearing validation across Managers = anti-pattern. Calls become 95% validation, 5% orchestration.
- Fluent validation in Managers: stop. Guard clauses (null checks) only at top-of-stack; complex business validation in a Validation Engine, optionally paired with a Rules Engine.
- Field-quality (required, length, format, dropdown existence): *not* Engine work. Front end prompts user; back end throws generic exception.
- **Value validation is often not volatile — that is what frameworks are for.** Apply the validation framework **as a Utility**, at any layer that needs it (including the WebAPI layer), and apply it **consistently**. A value rule enforced in one place and assumed everywhere else is the failure mode; uniform application is the point, not the layer it sits in.
- **Attribute-based validation: `System.ComponentModel.DataAnnotations` is the neutral ground, and only where it adds semantic meaning to a human reader.** Decorating a data model with framework goo (`[ForeignKey] int CustomerId`) is acceptable only for classes that never cross a module boundary — a model carrying persistence or transport attributes across a boundary drags that technology into every consumer.
- **Defense in depth, with different failure semantics per side.** Client and server enforce the same field-quality rules, for different reasons: the client fails so it can prompt the user *without calling the service*; the server fails with a **generic error ID and no explanation of what failed**. A back-end field-quality failure means the client has a bug or was compromised — the back end should never *have* to fail one. Explanatory refusals are business refusals and belong to the business tier; machine preconditions get an ID, not a sentence.
- **What a Validation Engine actually contains** (as opposed to value validation): object-hierarchy integrity, associative rules, user-profile constraints, data entitlement. If the "validation" is a length or a required field, it is framework/Utility work — no Engine.
- Guard clauses ≠ Validation Engine work. Guards are contract-boundary preconditions. Engines encapsulate volatile business rules.
- RA uses **assertions** (`Debug.Assert`), not validation. Code asserts contract requirements, doesn't branch on null.
- Authorization belongs at Manager level (or implicit claim-based filtering at data-access). Never in Engines or RA.

## Engine factoring

- Managers own *what* (sequence + flow control). Engines own *how* (rules, calculations, transformations). Resources own *where*. RA cannot call up.
- Engines must be autonomous atomic units, orchestrated by Managers. Any `Engine → Engine` edge is a violation.
- Single-operation Engine = red flag (unless known placeholder for imminent expansion). Logic likely belongs in the Manager or a related Engine.
- Engine used by exactly one Manager = red flag for over-engineering. Volume of rules alone doesn't justify an Engine — *volatility* does.
- Engine names = verbs (Validation, Transformation, Filtering, Pricing). Manager names = nouns. Verb-named Manager or noun-named Engine = functional smell.
- Manager:Engine ratio empirically ~1.5:1. 8+ Managers with proportional Engines = functional decomposition.
- Validation Engines aggregate cross-cutting facets from multiple subsystems — complex business rules, not simple data validation (that's a Utility).
- Validation facets evolve: (1) become cross-cutting → promote to Common; (2) collapsed volatilities diverge → segregate into separate components.
- State validation in concurrent environments needs optimistic concurrency — pass version from validation time and verify it hasn't changed at execution.
- Define validation taxonomy first: field-quality (boundary), business-rule (Engine), cross-subsystem consistency (Validation Engine), authorization (Manager/infra). Taxonomy informs placement.
