# Validation Rules

Concrete checks the conformance auditor and the static validator apply.

## 1. Decomposition quality

- **Functional decomposition smell**: components named after features (`ReportingManager`, `BillingEngine`, `ShippingAccess`).
- **Domain decomposition smell**: components mirror departments (`SalesManager`, `HRManager`).
- **Solutions masquerading as requirements**: "email notification" instead of "notification transport volatility".
- **Speculative design**: encapsulating extremely unlikely changes ("SCUBA-ready high heels").
- **Coupled volatilities**: a single `WorkflowManager` for Trading + Administration + Market — each is a separate volatility.
- **UI-driven service explosion**: `MenuManager`, `iPadManager` — UI is delivery, not volatility.
- **Shallow volatility analysis**: stopping at the first surface volatility. In an IoT system, "terminal type" / "sensor type" are surface; "environment" is the true unifying volatility.

## 2. Naming

- Manager: noun for the encapsulated volatility (`AccountManager` ✓; `BillingManager` ✗ — gerund).
- Engine: verb / activity (`CalculatingEngine`, `ValidationEngine`, `MatchingEngine`).
- ResourceAccess: prefix is the resource noun, suffix is `Access` (`CustomerAccess` ✓; `BillingAccess` ✗).
- Atomic business verbs (`Credit`, `Debit`, `Transfer`) belong in **operation names**, not component names.
- Utility names indicate cross-cutting infra: `Cache`, `Logger`, `MessageBus`.

## 3. Ratios & granularity

- **Manager:Engine ratio**: 1M→0-1E; 2M→~1E; 3M→~2E; 5M→~3E. ~1.5:1 is the empirical golden ratio.
- **8+ Managers** in one subsystem strongly indicates functional/domain decomposition.
- **~10 components** per subsystem is the order-of-magnitude target.
- Two Managers using two different Engines for the *same* activity = functional decomposition or missed activity volatility.
- Two Managers/Engines that can't share a RA may indicate access-volatility or atomic-verb factoring is wrong.

## 4. Symmetry

- Good architectures are symmetric — repeated call patterns across use cases.
- 3 of 4 use cases publish an event and the 4th doesn't = smell.
- 1 of 4 queues to another Manager and others don't = smell.
- Asymmetry in event/queue usage often = missing volatility or misassigned responsibility.

## 5. Volatility coverage

- Every identified volatility maps to a component or operational concept.
- Volatilities map to one of two axes: same-customer-over-time OR different-customers-at-same-time. Failing both = functional decomposition in disguise.
- Rejected volatilities have clear rationale (nature-of-business, too rare, can't encapsulate well).
- Some volatilities map to operational concepts (queuing, event-driven flows, workflow coordination), not components.
- Don't accept the first candidate — seek the *true* underlying volatility.

## 6. Use-case validation

- 2-6 core use cases per system represent the essence of the business; a marketing brochure has at most three bullets.
- Each core use case has a call chain over existing components (no new components for regular use cases).
- Manager is "almost expendable" — Engines/RA/Resources remain stable as the Manager evolves.
- When requirements change, only Manager integration code should change.

## 7. Fat Manager

- Too many unrelated use cases = low cohesion. If volatilities differ, split.
- Each Manager owns a *family* of logically related use cases.
- Splitting: factor monolithic contract into facets per volatility, then promote each facet to its own Manager / subsystem.

## 8. Utility litmus test — two questions, not one

**8a. Is it a Utility at all?** "Could this Utility plausibly be used in any other system?" If no,
it's an Engine or Manager.
- Valid utilities: Security, Logging, Diagnostics, Instrumentation, Pub/Sub, MessageBus, Cache, Hosting.

**8b. Is it a SERVICE or a LIBRARY?** (ADR-074 — `core-principles.md`, *Service or library?*) Every
Utility owes this answer, and it is the one the taxonomy does not give you.
- Ask: *when something uses this component, does anything cross a process, get serialized, or get
  versioned independently of its caller?*
- **Yes ⇒ service.** A real seam — facets, operations, DTO-typed contracts; a drawn Manager box may
  call it. `MessageBus`, `SecurityUtility` are services.
- **No ⇒ library.** C# types called in-process, `IDisposable` handles included. **No facets, no
  operations, no DTOs, and no drawn sequence step may call it** — there is no boundary to cross.
  Tracing, metrics and logging are libraries; their implementation is the iFX's.
- Note the list in 8a mixes both: `MessageBus` and `Pub/Sub` are services; `Logging`,
  `Instrumentation` and `Diagnostics` are libraries; `Security` and `Cache` are whichever their
  boundary makes them in *this* system. **The criterion is the boundary, never the subject matter.**
- Record it: `mutate --kind SetUtilityKind --component <Name> --utility-kind service|library`.
  Undeclared reads as `service`, and the gate reports it as a question still open.
- The failure this prevents: forcing a library into a service contract manufactures questions that
  have no answers — what closes the span, what the close operation returns, which facet reads the
  trace back. If every candidate answer is equally arbitrary, check the premise instead of picking
  one.

## 9. Recurring case-study failures

- **Single-workflow-manager trap**: monolithic `WorkflowManager` merging distinct workflow volatilities. Fix: factor into facets (collapsed) → promote each to its own Manager (expanded).
- **Content-manager trap**: single Manager accumulating unrelated use cases. SRP/ISP/SoC violated simultaneously = fat manager.
- **Device/UI-platform proliferation**: Manager-per-device. The true volatility is environment or interaction model.
- **Ignoring non-functional requirements**: decomposing only by business logic; missing scalability/isolation/deployment volatilities.
- **Stopped-too-early analysis**: accepting first volatility without probing. "Workflow" hides Trading + Administration + Market.

## 10. Detailed-design checklist

**Service contract smells** to validate against:
- Low cohesion — operations that don't belong together.
- Too few (dull facet) or too many operations (>20).
- Overly generalized operations with too many parameters or canonical DTO. (Workflow Managers may legitimately have more parameters.)
- Property-like operations (getters/setters).
- Non-use-case-named operations on a Manager.
- Multiple unrelated contexts on the same Manager.
- Operation names that don't imply action.
- Hierarchical contracts — prefer compositional.

**DTO smells** to validate against:
- Canonical DTOs across unrelated contexts.
- DTOs mirroring database schemas.
- DTOs containing logic.
- DTOs that are business objects rather than transfer objects.
- DTOs that aren't aggregates (forcing chatty interactions).

**Design rules**:
- DTOs align with use cases, not resource schemas. Never pass entities out, public DTOs in, internal DTOs out.
- Manager boundary: separate public/internal DTOs; mapping is an investment.
- Access boundary: separate entities and DTOs; never emit entities as DTOs.
- 3-5 ops per contract optimal; ~12 practical ceiling, 20 hard max.
- DD problems → escalate to architecture.
- SO ≠ OO — don't apply OO patterns to service boundaries.

## 11. Contract factoring

- A **facet** is an autonomous system aspect as an interface — an endpoint, location-transparent.
- Mature components have multiple facets, all logically related and cohesive.
- **Use-case facets** (Manager): operations are use cases, client/API consumable, single point of entry.
- **Component facets** (Engine/Access): internal-only, within subsystem boundary.
- Common engines (Validation, Transformation, Filtering) often have multiple facets — one per consuming subsystem.
- Mixed concerns on one interface → split. Diverging facets over time = correct segregation; converging = collapse.
- Multiple facets dramatically reduce the **Cost vs. Count** ratio.
- Restrict operations to verbs (`DoSomething()`). Meeting metrics doesn't guarantee good design; violating them indicates bad.

## 12. Interaction patterns

**Manager ↔ Manager**: always pub/sub or queued; never sync. `Manager → Pub/Sub → Manager`.
- System workflows: `<Workflow>Manager → Pub/Sub → Manager → Workflows → Cache`.
- UX workflows: `Client → <Workflow>Manager → Workflows → Cache` (state-machine pattern).

**Client / API**:
- `Client → API → Cache (session) → Manager`.
- API Gateway is *never* an orchestration layer.
- Chunky use-case operations preferred over fine-grained resource calls.

**Cache**:
- Local: `Manager → Engine → Cache → Access → Resource` (each subsystem warms own).
- Distributed: first Manager in workflow warms shared cache for all subsystems.
- Local state: `Client → Cache → Manager`.

**Rules engine**: `Manager → Engine → Cache → Rules Engine`. Rules loaded, compiled, cached; access by convention.

**Feed / integration**:
- External feed: `External Pub/Sub → Internal Pub/Sub → Feed Manager`.
- IoT/SCADA: `Device Bus → Feed Manager` (listener).
- File ingestion: validate on receipt; separate external/internal file boundaries.

**Monitor**: `Health Monitor → Pub/Sub → Manager` (Manager exposes health facet).

**System workflow**: sequential stages; metadata accretes through subsystems; compliance checks at the coordinating Manager prevent progression.

**Inflight translation**: `Manager → Pub/Sub → Analysis, Logging, Auditing, Metrics`.

**Blocking-to-async**: `ResponseAwaiter` pattern — susceptible to timeouts and scale limits.

**Local deployment**: `Thin Client → Manager → Engine → Access → Device API → Device`. For legacy device APIs: introduce a `Form-as-Service` wrapper between Engine and Device API.

## 13. Subsystem & topology

- Each subsystem is autonomous in deployment, scaling, lifetime.
- Subsystem = Manager + Engines + RA — a vertical slice.
- Most systems: a handful of subsystems, ~3 Managers per subsystem max.
- Extend by **adding new slices**, not by growing existing components.
- **Collapsed architecture**: contracts factored correctly; impl consolidated for simpler deployment. Valid intermediate.
- **Expanded architecture**: each contract owns a Manager / subsystem; full autonomous scaling.
- Subsystem boundaries align with isolation requirements — failures don't cascade.
- Manager-to-Manager across subsystems: always queued; never sync.

## 14. API contracts

**URI design**:
- Never mix REST and RPC styles in the same URI. Avoid `api/<resource>/<action>`.
- REST: standard verbs only; resource-based URIs; never more than 2 segments deep. Plural for "all"; singular + ID for "one".
- RPC: business-focused (`api/<subsystem>/<action>`).
- No URL versioning — header (`apiVersion`) or context payload.
- IDs on URI, not in payload (exception: sensitive business identifiers, POST-created IDs).
- No URI redundancy — domain already provides context.

**Public vs Internal**:
- Always segregate, separate gateway zones.
- External: strict REST, coarse-grained, partner-friendly, no DELETE.
- Internal: more flexibility, RPC OK, purpose-built per app.
- Gateways have zero code — only NAT and security.

**State & session**:
- Never stateful APIs. State-aware: `GetState() → DoWork(state) → SaveState(state)`.
- User-session state for user-centric values only (login), not incremental use-case data.
- Workflow-driven state; UI workflows optionally driven from backend.
- Distributed session state only — never sticky IPs or static addressing.

**Errors**:
- Translate exceptions to standard codes (200, 201, 304, 400-series, 500).
- Never return stack traces or internal details in release.
- 400-series for gateway-level; 500 for backend.

**Pagination**:
- REST: resource URI sub-path (`/pages/<limit>/start/<item>`).
- RPC: query params (`?limit=10&start=1`).
- No unbounded "get all" queries.

**Security**:
- HTTPS only. Public/private gateway segregation.
- No sensitive data in URIs/payloads.
- Least-privilege data access.
- Differentiate by external partner / internal business unit.

**Formatting**:
- Resource formatting in microservices, never in the gateway.
- No language-specific naming conventions in API responses.

## 15. Security & transactions

- **Authentication**: at the presentation boundary. Intranet may use Windows integrated security across layers. Use a Security Utility.
- **Authorization**: at Manager level — authorize use cases, not individual component calls. Differentiate by partner / business unit.
- **Transactions**: `Client → Manager → Engine → Access → Resource` within a single transaction boundary. SOA transactions carry DTC overhead. Public-queue / pub-sub transactions: broker is the single point of failure. Transaction boundaries align with subsystem boundaries where possible.
