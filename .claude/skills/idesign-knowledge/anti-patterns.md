# Anti-Pattern Catalog

Distilled from Method practitioner experience. Match observed patterns to entries here; cite by name.

## Layering violations

### [CRITICAL] Orchestration in wrong layer
ESB / Gateway / BFF / WebAPI / Client orchestrating use cases smears logic across environments and clients.
**Instead:** Orchestration in Managers; Gateways thin (security only); choreography only between Managers.

### [CRITICAL] Business logic in wrong layer
Balance checks in RA, validation across Managers, transformation in RA, heavy logic in stored procs/controllers.
**Instead:** Orchestration → Manager. Validation → Validation Engine. Authorization → Manager. Transformation → Engine. Never in stored procs/triggers/controllers.

### [CRITICAL] Events/messaging from wrong layer
Engines, RAs, or Clients publishing/subscribing breaks semi-closed architecture. Clients publishing events bypasses single point of entry.
**Instead:** Only Managers engage in pub/sub. Clients only publish requests. Constrain event emission to the Manager layer.

### [CRITICAL] Breaking semi-closed architecture
Engine→Engine, sync Manager→Manager, Engine→Resource direct, lower→upper, sideways calls. Sideways calls are the **Kiss of Death** to VBD.
**Instead:** Engines never call engines or managers. Managers never call other Managers synchronously — use queues/events. RA never references Manager layer.

### [CRITICAL] Client-side use case orchestration — the **Original Sin**
Pushing orchestration to clients creates exponential redundancy and bugs; every new client reimplements all logic. BFF compounds this.
**Instead:** Encapsulate use case orchestration in server-side Managers. Clients submit jobs and interpret hints, never sequence steps.

### [CRITICAL] Inverted architecture exposing data
Putting data/resources at the top forces clients to mediate; couples them to schema; duplicates logic.
**Instead:** Hide data behind services. Architecture exposes behavior, not data.

### [CRITICAL] Leaking entities/DTOs across layers
Sharing RA entities outward, internal DTOs to clients, EF entities as DTOs.
**Instead:** Transform to DTOs at every boundary. Each layer has its own contract types.

### [CRITICAL] Manager-to-Manager synchronous calls
Violates layering, couples use cases, breaks subsystem autonomy.
**Instead:** Single use case stays in one Manager. Cross-Manager via queue/pub-sub (separate use cases).

### [CRITICAL] Ubiquitous eventing / granular choreography
Events for ALL interactions ups complexity, smears bus credentials. Choreography too granular = **Big Smear** (3 hops in, can't follow intention).
**Instead:** Mix eventing and RPC by design need. Choreography only between Managers, judiciously.

### [CRITICAL] Unmonitored circular event references
Circular interactions in queue systems → infinite loops (177k+ messages observed).
**Instead:** Cycle-detection protocol; validate subscribers at deploy; one bus per environment.

### [CRITICAL] Temporal coupling between subsystems
All subsystems must be available simultaneously. Staircase / fork-claw / wall interaction diagrams = decomposition smell.
**Instead:** Subsystem autonomy; workflows degrade gracefully; queues/events decouple temporally.

### [MAJOR] Constructor injection in SO code
Greedy constructors imply state, recreate the monolith, force the container to reference everything.
**Instead:** Dependency Inversion via factory at point of use. Per-call services, zero state.

### [MAJOR] Cross-cutting concerns in business code
Inline telemetry, ad-hoc text logs, fluent validation in Managers.
**Instead:** Bake telemetry and logging into iFX. Guard clauses only at top of stack; business validation in Validation Engine.

### [MAJOR] Breaking RA encapsulation
Splitting RA by DB technology, source-aware signatures, separate accessors for affiliated operations.
**Instead:** RA encapsulates technology and partitioning internally. Factor by business affinity, not storage tech.

### [MAJOR] External services not treated as resources
Direct external service calls in Manager/Engine — duplication, timeout chaos.
**Instead:** Wrap external services in RA. Common contract, swappable. Queue long-running access.

### [MAJOR] Exposing Managers directly as API endpoints
Couples internal architecture to external consumers; bloats the gateway.
**Instead:** Separate WebAPI layer in front of Managers. Gateway has zero code (NAT/security only).

## Naming smells

### [CRITICAL] Functional decomposition as architecture
Components named `SellingManager`, `CookingEngine`, `PatientManager` — flowchart-mirroring diagrams. Even bad VBD beats any functional decomposition.
**Instead:** Decompose by axes of volatility (same customer over time / different customers at the same time).

### [CRITICAL] DDD applied to service orientation
DDD is functional decomposition in disguise at the system level. Couples state and behavior; produces fat APIs; no DDD system has held its shape.
**Instead:** DDD only inside components (OO code design); VBD for system architecture. NDDD: identify what's *unrelated* to business domains and make those the system domains.

### [CRITICAL] Technology/patterns masquerading as architecture
DDD, microservices, SpringBoot, CQRS, Kafka, BFF, Dapr, GraphQL — technology-first imposes functional decomposition.
**Instead:** Architecture is technology-agnostic. Tech belongs in Operational Concepts.

### [CRITICAL] Conflating architecture with deployment
Modular monolith can be horribly monolithic internally; microservices can be a distributed monolith.
**Instead:** Architecture, deployment, technology, detailed design are separate decisions. A Method system deploys collapsed (single EXE) or expanded (cloud) by config alone.

### [CRITICAL] Big block diagram as architecture — the **Painful Ball of Spikes**
Massive diagrams mixing marketing/tech/entities/features = **Ivory Tower Architecture**.
**Instead:** Proper VBD + DD. One diagram per concept. Distinguish marketing-architecture from solution-architecture.

### [CRITICAL] UI-centric or API-first service design
Designing services around UI widgets, micro-frontends, or API shapes → hyper-granularity, exposed internals.
**Instead:** Three distinct activities: business process analysis, UX, system design. REST/API are clients of the business architecture, not drivers.

### [CRITICAL] Hyper-granular microservice proliferation
"Feature = service" → 300-1600+ services (Uber: 2200; "1600 projects = microservices gone way bad").
**Instead:** Method taxonomy controls granularity. Most systems: 10-20 services, ~5 publicly accessible Managers.

### [CRITICAL] Appland thinking — the **Modern Monolith**
Vendor marketing + KISS rhetoric → interconnected blobs of microservices with no structural design.
**Instead:** Build systems of services, not applications. Architecture and deployment are separate.

### [CRITICAL] God service / super service
Monolithic Manager with hundreds of operations; 20+ disparate Controller actions push context shims to clients.
**Instead:** VBD finds the right granularity. 3-5 ops per facet (12 max). Each Manager: distinct volatility, 3-5 (max 9) core use cases.

### [MAJOR] Same domain name down the stack
`FooManager → FooEngine → FooAccess → FooData` is functional-decomposition smell.
**Instead:** Each tier name reflects what *that tier* encapsulates. Cross-tier subsystem alignment by volatility, not 1:1.

### [MAJOR] Three-part names / prefix-suffix smells
`ConversationReconstructionEngine`, `OfferCatalogManager` raises a facet to a service. Generates `CheckSftpFileType1..N`.
**Instead:** Manager names: broad nouns. Differentiate by namespace, not affixes. Bridge/Strategy for variations.

### [MAJOR] Confusing use cases with volatilities
"Trade", "Observe", "Register", "Sync", "Fulfill" as volatilities = functional decomposition. One Manager per use case → service explosion.
**Instead:** Use cases drive design but are not the decomposition unit. Managers group related use cases by *concept*.

### [MAJOR] Confusing variable with volatile
Variable (configurable rules, currencies) ≠ volatile (changes requiring new code/behavior).
**Instead:** Volatile drives architecture; variable informs detailed design.

### [MAJOR] Components for non-volatile things
Manager-per-SLA-tier or per-technical-concern proliferates services.
**Instead:** Non-volatile use cases live in any sensible Manager. Technical concerns live in iFX.

### [MAJOR] Speculative volatility hunting
"What if we expand into unrelated domains" drives speculative design.
**Instead:** Real and present volatilities only. Keep options open early; don't design imaginary requirements.

### [MAJOR] Manager named "Workflow" / "WorkflowManager"
Workflow is a mechanism, not a business volatility. A standalone WorkflowManager hides the actual domain.
**Instead:** Identify the business volatility being orchestrated. Express workflow as a facet on the domain Manager.

### [MINOR] Too many words on diagrams
Diagrams must pass the **3 As** — Absorb, Adopt, Advocate.

## Contract smells

### [CRITICAL] CRUD / data-centric service design
GetBy proliferation, generic Save, "if it could inherit `IDataAccess<I,T>`, you've exposed the DB". Business doesn't speak Get/Delete/Upsert.
**Instead:** Business verbs (`AddLineItemToOrder`, `ActivateAccount`, `RecordPersonDeceased`). Edit pattern over Create/Update/Delete.

### [CRITICAL] REST as universal inter-service connectivity
Predictable failure: 4 verbs insufficient → routing abandoned → JSON envelopes look like SOAP → revolt at first need for queues.
**Instead:** REST/HTTP for public APIs only. Internal: messaging via bus, RPC where appropriate, IPC/queues. Tech last.

### [CRITICAL] Shared canonical DTOs across contexts
Couples lifetimes; system metadata in DTO bases couples wildly varying volatilities; property-bag DTOs become if/else hell.
**Instead:** Each context: own DTOs. Mapping is investment, not duplication. Owning more DTOs is small price for lifetime decoupling.

### [CRITICAL] Foregoing appropriate solutions for simpler ones
DB tables as queues, skipping SO programming model, homogeneous web farms. The 11th-hour retrofit never ends well.
**Instead:** Adopt the appropriate solution early.

### [MAJOR] Switch/if-else instead of polymorphism
40-parameter controller actions, query-string-heavy APIs.
**Instead:** Polymorphic detailed design. Specialized Bridge/Strategy per context group.

### [MAJOR] GetBy proliferation
`GetByName`/`GetById`/`GetByDate` (or hidden in request objects) → contract bloat, coupling. Iterating over a service call is a sin.
**Instead:** Single business-verb operation (`Load`, `Filter`, `Summarize`) with polymorphic criteria DTOs. Never differentiate one vs many.

### [MAJOR] Fat events
Including all data to "reduce dependencies" couples publisher to subscribers; publisher guesses subscriber needs.
**Instead:** Event data driven by the publishing use case. Business-event subscribers define the contract; publisher complies. Events lean (~256K limit).

### [MAJOR] Conflating responses with events
Same contract for caller-response and bus-published events.
**Instead:** Separate contracts. Notification ≠ response.

### [MAJOR] Business and observable events used interchangeably
Business events: subscriber-owned contract, specific use-case data. Observables: publisher-owned, general.
**Instead:** Distinguish them; for business events the subscriber defines the contract.

### [MAJOR] Expecting message ordering from queues
Any retry/playback scrambles order.
**Instead:** Design for reliable delivery, not ordered delivery. If you need ordering, rethink the design.

### [MAJOR] Catch-all aggregated Manager — `AdminDataManager`
Lumps configurable items; loses subsystem ownership.
**Instead:** Admin use cases as facets within the subsystem that uses them.

### [MAJOR] Single centralized enterprise bus (ESB)
Has never actually succeeded; orgs go around it.
**Instead:** Multiple specialized smaller buses. Internal bus per system + external bus for inter-system (Feed subsystem as receiver).

### [MAJOR] Implementation details leaked into contracts
DB IDs, EF shapes, query objects, infrastructure concerns in contracts.
**Instead:** Entity GUIDs only, never DB IDs. Plumbing values via message headers, not contract params.

### [MAJOR] Chatty / oversized interactions — staircase, fork, glove, double-back
Iterating over a service call. 50MB+ object graphs. Bad call-chain shapes.
**Instead:** Chunky, not chatty. Aggregate gets into one `Load`. Visualize call chains — diagram is the diagnostic tool.

### [MAJOR] Formal graph search on distributed fractals
BFS/DFS over distributed N:M graphs may never conclude.
**Instead:** Visitor Pattern — flood the graph; subjects emit observables.

### [MINOR] Queue-per-operation
Operational overhead grows; breaks facet-as-cohesion.
**Instead:** Start queue-per-contract. Use Topics from the start.

## Data smells

### [CRITICAL] Data autonomy fallacy / database-per-service
98% of business data usage is reads, 97% aggregates. Pure data autonomy → coupling, replication, or client-side orchestration.
**Instead:** Decompose by volatility, not data ownership. Shared data via well-designed RA. Service count doesn't dictate storage count.

### [CRITICAL] Data-centric SOA / data hoarding
Service-per-table, schema-as-service, public CRUD; DDD+microservices → redundant silos.
**Instead:** Services encapsulate volatility. Information hiding by volatility. Controlled sharing via Venn-overlap with small common middle.

### [CRITICAL] Wrong storage technology for data shape
DB tables as queues, RDBMS for graphs, document DB for write-heavy logs.
**Instead:** Match store to form. Polyglot persistence. Federated backend with multiple storage types.

### [CRITICAL] Distributed monolith from microservices without VBD
Functional decomp + HTTP = double punch most projects can't survive.
**Instead:** Granularity by volatility. Diagram runtime behavior to *see* the coupling before *feeling* it.

### [CRITICAL] Backhaul eventing as data-autonomy compensation
Domain services backhauling data via event sourcing → Access components subscribing to each other.
**Instead:** Recognize Data Autonomy as a fallacy. Managers encapsulate use cases — that's the cross-service coordination mechanism.

### [MAJOR] DB tables as message queues / Outbox pattern
You build your own retry/TTL/dead-letter/poison handling. The DB will fail before the queue tech.
**Instead:** Use professional messaging tech. Throttle to handle overflow.

### [MAJOR] Monolithic ORM context
EF model spanning hundreds of entities; slow startup; frightening migrations.
**Instead:** ~70 tables max per context. Properly factored models align with encapsulated volatilities. Dapper for flat data.

### [MAJOR] Direct ETL from resource databases
Violates RA encapsulation; OLTP fails when warehouse offline.
**Instead:** RA mediates analytics. Bus-based feed patterns. Defer modification to the subsystem with Command Authority.

### [MAJOR] Serializable isolation deadlock by design
Concurrent transactions sharing read locks then writing → deadlock.
**Instead:** Solve concurrency in service code. Separate use cases architecturally; queue rather than nest transactions.

### [MAJOR] In-memory aggregation state at scale
Won't scale in dynamic distributed graphs.
**Instead:** Graph database for aggregation state.

### [MAJOR] Caching proxy instances across environments
Leaked connections crash service hosts.
**Instead:** Don't cache proxy instances. Cache the marketplace graph (addresses), not the proxies.

### [MAJOR] Piping query concerns through layers
Sort/page/filter exposed up from RA → each layer reimplements an inferior LINQ/SQL.
**Instead:** Sorting/paging/filtering are presentation concerns. RA returns strongly typed aggregates.

## Process smells

### [CRITICAL] Architecture-last, hack-then-refactor — **skateboard-to-car**, **Pagoda-to-Microwave**
Iterations tear down and rebuild prior work; cumulative cost ≈ O(n²).
**Instead:** Full VBD pass before construction. Sprint 0 = the Method. Design Big, Build Small.

### [CRITICAL] Agile as excuse for no engineering — **Fragile**
Skips architecture, requirements, QA, project design. Velocity theater.
**Instead:** Agile = execution rhythm; cannot substitute for thinking. Replace velocity with project-design metrics (critical path, cost, risk).

### [CRITICAL] Estimation/planning without project design
Summing user-story points; converting points to hours is a type mismatch.
**Instead:** Critical-path analysis, quantified risk (float), estimation against the architectural decomposition. Estimate the architecture, staff to the critical path.

### [CRITICAL] Coding before architecture and DD
No refactoring fixes coupling baked in early. Perpetual refactoring is orders of magnitude more expensive than upfront design.
**Instead:** Design Big, Build Small. Full Method architecture upfront. Vertical slice validates before full implementation.

### [CRITICAL] Feature-first construction
Nothing officially done until the end. Earned-value charts don't work. Devs bend VBD into functional implementation. "90% done" forever.
**Instead:** Build by service/component along the critical path, bottom-up. Manager Simulators enable early UI demos.

### [CRITICAL] Deadline-driven quality sacrifice
Cutting infrastructure (logging, security, tests, config) to hit dates.
**Instead:** Concede on scope/timing, never on thoroughness.

### [CRITICAL] Making things up without stakeholder input
Cardinal sin: bad assumptions instead of interviews. Copy-paste from learning sites/AI = inconsistent fragments. (Seven duplicate wrong Service Bus implementations in one codebase.)
**Instead:** Interview rigorously. Manual proficiency before tools. Define use cases only after interviews iterate.

### [CRITICAL] Technology-first / ego-driven design
Diagrams of Azure resources instead of logical decomposition; websocket-message discussions instead of use cases.
**Instead:** VBD before tech. Architecture is tech-agnostic. Map to tech *after* modeling.

### [CRITICAL] Padding estimates
Costs inflate up the chain; triggers Parkinson's Law and gold plating.
**Instead:** Estimate honestly. Express uncertainty as ranges. Risk decompression buffers are part of project design.

### [CRITICAL] Ignoring risk metrics / float
Risk > 0.75 is the iffy zone. Multiple critical paths are accidents waiting to happen.
**Instead:** Risk < 0.7 normal; 0.60-0.65 inexperienced teams. Decompress at integration points. Never delete outliers — break god activities.

### [MAJOR] Solutions masquerading as requirements
"We need a screen that uploads files" instead of the business problem.
**Instead:** Interview for business process, not data entry mechanics. "If you had no computers, how would you do this?"

### [MAJOR] Design by committee on self-organizing teams
Everyone an architect = "freaking disaster".
**Instead:** Architect role limited to senior-junior pair. Don't make developers do design.

### [MAJOR] Scaling failure by adding people / SAFe
Throwing more people at failure reproduces the Painful Ball of Spikes at scale.
**Instead:** Fix the architecture, not the headcount. Project Design with critical-path analysis determines the minimum team.

### [MAJOR] Calling a redesign a "refactor"
Mislabel prevents inspect-and-adapt from recognizing rework.
**Instead:** True refactor = decomposition unchanged AND no breaking contract changes. Otherwise it's a redesign — plan accordingly.

### [MAJOR] Success-under-10K-instructions illusion
Below Parnas's threshold, weak methods appear to succeed; the smart-guy developer thrives. Catastrophic at scale.
**Instead:** Apply the Method regardless of apparent project size — the threshold will be crossed.

### [MAJOR] Ivory tower dump-and-run
Architects who never implement give architecture a negative stigma.
**Instead:** Architects own implementation through vertical slices. Apprenticeship-style practice.

### [MAJOR] Forcing Method adoption without organizational readiness
Pushing aggressively, dismissing developer concerns, applying the Method in isolation.
**Instead:** Drop bread crumbs gradually. Gain control of a bounded piece. Engagement, not authority.

### [MAJOR] Losing strategic intent
Without "what not to do", you can't know if you're done.
**Instead:** Recite strategic intent at every standup. Every team member should know the mission and their part.

## Project structure

### [CRITICAL] Flat `contracts/` and `components/` directories
Divorces contracts from the components that define them.
**Instead:** Each component as two sibling projects: `{Component}/Interface/` (contracts + DTOs) and `{Component}/Service/` (impl). Group by component first, then by aspect.

### [CRITICAL] No contract/implementation separation
Consumers forced to depend on implementation; defeats location transparency.
**Instead:** Always split: Interface project (contracts + DTOs only) vs. Service project. Consumers reference Interface only.

### [MAJOR] Sharing DTOs across use cases at Manager layer
Hidden coupling between use cases that should be independently evolvable.
**Instead:** Per-use-case DTOs. Base class for shared structure (`FindCriteriaBase`); concrete derivatives. `UseCaseFactory` routes by concrete DTO type.

### [CRITICAL] Emitting data entities as DTOs beyond Access
Smears storage details across the architecture.
**Instead:** Separate Access DTOs from data entities. Map at the Access boundary. Access DTOs represent logical data, not physical storage.

## Contract design (sub-catalog)

### [CRITICAL] `GetBy<...>()` proliferation on contracts
Combinatorial contract explosion as new criteria emerge. Violates OCP.
**Instead:** Single `Find(CriteriaBase)` with KnownType-derived hierarchy. Adding a search path = new DTO subclass; contract unchanged. Satisfies OCP, ISP, SRP, LSP, DIP simultaneously.

### [MAJOR] Hiding GetBy in per-criterion request DTOs
`FooByIDFilterCriteria`, `FooByNameFilterCriteria` — same anti-pattern, hidden in DTOs. Loses intellisense too.
**Instead:** Genuinely polymorphic hierarchical DTOs where the base represents the abstract concept, not the query mechanism.

## Testing — information barrier

### [MAJOR] Tests authored with visibility into the production implementation
Tests confirm what the code does instead of probing what the contract says. The two encodings collapse into one — defects hiding in the gap become invisible.
**Instead:** Enforce the information barrier. Single-developer: red-first TDD. Multi-agent: spawn Test Terminator and Production Terminator independently with prompts restricted to contract/DTOs/use case only. Green-from-start is acceptable only when the structural barrier was enforced.
