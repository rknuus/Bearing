# Dialectic Questions

Socratic probes for architecture review. Match the trigger; ask the question; do not soften.

## Volatility & decomposition

**Trigger:** Services named after domain nouns (`OrderService`, `CustomerService`, `ProductService`).
**Ask:** Which axis of volatility does each service encapsulate? Or did you just group "things" by domain? When the next use case lands, how many of these change simultaneously?

**Trigger:** Services named after business domains rather than volatilities, claiming to be agile.
**Ask:** When a regulation changes tomorrow and touches five of your domain services, how is that agile? Isn't this guaranteeing every change is expensive — the *opposite* of agility?

**Trigger:** A volatility marked as varying both per-customer and over time.
**Ask:** Volatile on both axes is a red flag for functional decomposition. What is the true underlying volatility, and on which single axis does it actually change?

**Trigger:** Service boundaries derived from DDD bounded contexts, no Manager/Engine/RA taxonomy.
**Ask:** Which contexts are orchestrations, and which are calculations? DDD gives you no taxonomy to answer that. Without distinguishing Managers from Engines from RA, how do you prevent the contexts from becoming god services?

**Trigger:** Service boundaries aligned to DDD aggregates rather than volatility.
**Ask:** DDD is OOP-focused. Have you confirmed you didn't just perform functional decomposition and call it domain-driven design? The Method's place for DDD is *inside* a component, not at the system boundary.

**Trigger:** Top-level subsystems named after functional areas or workflows.
**Ask:** "Selling" and "Reading" are functional areas. List the volatile aspects of each — do they overlap? Is there a higher concept that composes both, named for what *changes* not what the system *does*?

**Trigger:** 1:1 alignment Manager-name → ResourceAccess-name (`FooManager → FooAccess → FooData`).
**Ask:** What volatility is each layer encapsulating, or is this domain decomposition wearing a service-oriented costume?

**Trigger:** Manager names with three or more domain terms (`<Domain><Concern>Manager` shape — e.g., `OrderIntakeManager`, `CatalogueAlignmentManager`, `OperatorWorkbenchManager`).
**Ask:** Is "Intake" a separate Manager or a facet of `OrderManager`? Spell out the volatility each three-part name encapsulates — if the cohesion is on a sub-domain concern, that's a facet on a broader Manager, not its own Manager. Where in the design journal is the facet plan for this Manager set? `anti-patterns.md [MAJOR] Three-part names / prefix-suffix smells` calls this "raising a facet to a service."

**Trigger:** Manager named "Workflow" or "WorkflowManager".
**Ask:** Workflow is a mechanism, not a volatility. What is the actual business volatility this Manager orchestrates, and how is it distinct from orchestration that emerges in any Manager?

**Trigger:** Custom-built component with no identified volatility.
**Ask:** If it's truly non-volatile, why aren't you buying it off the shelf? And if you can't buy it — what volatility are you failing to see?

**Trigger:** Validation in a single Manager's write path.
**Ask:** Is validation only needed when writing? If other subsystems also validate, you've scattered a cross-cutting volatility. Walk me through every place data gets checked — is this a shared concern?

**Trigger:** Single Manager with broad responsibility scope.
**Ask:** You say it "just orchestrates." Show me the code. If it has conditionals beyond simple routing, you have unextracted Engine volatility hiding in your orchestration layer.

**Trigger:** Service or Manager named "Observability" / "Monitoring" conflating data collection with analysis.
**Ask:** Observability provides *raw data*. Analysis provides *insight* (inflight ETL, aggregation, renormalization). Where is your Analysis volatility?

**Trigger:** A Decision in the draft says "X is encapsulated within subsystem A as a facet", but the decomposition has X as a separate Manager (or vice-versa).
**Ask:** Walk each Decision against the actual components. If a Decision disagrees with the decomposition, one of them is wrong. Which is the considered choice, and have you rewritten the other to match — or did the contradiction slip past you?

**Trigger:** A use case the interview captured has no populated call chain in the decomposition.
**Ask:** Every primary use case must drive cleanly through the components. A use case without a call chain is either (a) a hole in your decomposition or (b) a use case that doesn't belong. Which is it for each missing chain?

## Granularity & taxonomy

**Trigger:** > 20 total services or > 5 publicly accessible Managers.
**Ask:** Which taxonomy controls granularity and accessibility, or have you fallen into functional decomposition disguised as microservices?

**Trigger:** 50+ microservices "for agility" without mature DevOps.
**Ask:** What was your objective criterion for "too small" vs "too large"? Microservices shift complexity from code to ops — without mature CI/CD and standardization, you haven't reduced complexity, you've scattered it.

**Trigger:** Service called "micro" without taxonomy reasoning.
**Ask:** What makes it *micro*? If you moved these in-process, would your architecture change, or is "microservice" a deployment decision you confused with architecture?

**Trigger:** Database-per-service with isolated stores.
**Ask:** 98% of business data usage is reads, 97% aggregates. Show me how your federated design handles cross-service aggregates without shipping data or sick coupling.

**Trigger:** Every microservice has its own copy of the same business entity.
**Ask:** Who holds Command Authority? When copies drift, which is truth? Have you confused isolation with autonomy?

**Trigger:** Engines outnumber Managers, or Engines that primarily transform/pass through data.
**Ask:** Have you considered that not everything needs an Engine? If a use case just returns data, could the mapping live in RA — or are you creating an Engine for every operation out of habit?

**Trigger:** Engine called by exactly one Manager.
**Ask:** No reuse, no independent volatility — what is this Engine encapsulating that couldn't live in the Manager? Are you tiering out of habit?

**Trigger:** Manager → RA directly with no Engine layer.
**Ask:** Have you genuinely determined there's no business-process volatility, or are you deferring decomposition and burying calculation in your Managers?

**Trigger:** No utilities or cross-cutting components in the architecture.
**Ask:** Where are logging, caching, security, workflow? If you haven't identified them as volatilities, they'll scatter across every layer as copy-paste.

**Trigger:** Manager with > 5-6 operations or use cases.
**Ask:** Are these distinct volatilities deserving their own Managers, or did you confuse a use-case family for a single Manager?

**Trigger:** Multiple Managers differentiated primarily by SLA / performance.
**Ask:** Why not a single Manager with SLA variance handled in Engine/RA or deployment config? Have you finished the logical design before letting implementation drive decomposition?

**Trigger:** Third-party integration wrapped as a simple RA.
**Ask:** Have you stress-tested that assumption? Third-party integration with long-running activity, Saga, or process-boundary pluggability often deserves its own subsystem.

## Inter-service communication

**Trigger:** Synchronous Manager-to-Manager calls.
**Ask:** The receiving Manager may be serving a different use case. Why is a failure in one cascading into another? Why not pub/sub?

**Trigger:** Pub/sub with no Command vs. Observable distinction.
**Ask:** When A publishes a message and B acts — is it a notification or an imperative? If you can't answer instantly for every message, how will developers reason about workflow ownership?

**Trigger:** Events published from Engine or RA components.
**Ask:** Who owns the use case when a downstream subscriber reacts? You just created an entry point that bypasses the Manager. How do you prevent event storms and async cycles?

**Trigger:** All inter-Manager interactions on the bus, regardless of complexity.
**Ask:** Some workflows are simple, deterministic, single-receiver. What business or architectural driver justifies async complexity, monitoring overhead, harder client model — versus a direct queued call that's simpler/faster/cheaper?

**Trigger:** Kafka used as general messaging.
**Ask:** Ordering is per-partition; with multiple partitions, retries, and rebalancing, consumers see interleaved batches. What is the actual design need? Is Kafka the right tool or are you using it as a message broker and paying for complexity you don't need?

**Trigger:** Outbox pattern as primary consistency mechanism.
**Ask:** Outbox suffers the same prepare/commit race the DTC was designed to solve. Without an independent coordinator, what happens when the process crashes between writing the outbox and publishing — how is that fundamentally different from what you were trying to avoid?

**Trigger:** Queued/async calls between Manager and its Engines/RA.
**Ask:** What use case executes meaningfully when those operations run on a separate timeline, disconnected from the Manager? If "read this data" has no context without the use case, why decouple it from the thing that gives it meaning?

**Trigger:** Client publishing events (not requests) to the bus.
**Ask:** Clients can only publish requests. Events mean the system did work — only subsystems do work. Is your "event" a request in disguise, or have you inverted responsibility?

## Contracts & DTOs

**Trigger:** Manager with separate Create / Update / Delete on the same entity.
**Ask:** Are these truly different use cases with different volatilities, or just variants of one Edit? What business event would change one without the others?

**Trigger:** RA with generic CRUD names (`Save`, `Get`, `Update`, `Delete`).
**Ask:** If this Access offers `Save` and `Load` instead of `Credit` and `Debit`, how do you prevent business semantics from leaking into every caller? Are you designing a domain-aware Access or just wrapping an ORM?

**Trigger:** Manager operations named in CRUD or geek terms (`Update`, `Save`, `Modify`).
**Ask:** When the agent corrects customer info, what business behavior is that? If you can't name it in business terms, you wrapped CRUD in a Manager and called it architecture.

**Trigger:** Use cases named in technical/system-internal terminology.
**Ask:** Would the actual user say it that way? A trader says "cancel order", not "cancel matching". What does your naming reveal about how you framed these interactions?

**Trigger:** Constructor injection with multiple parameters in service classes.
**Ask:** What does a greedy constructor tell developers about which types are needed for any operation? Why aren't you resolving at the point of use, guided by the call chain?

**Trigger:** EF entities crossing service boundaries.
**Ask:** What happens when the schema needs to evolve independently from your use cases? Is your UX chained to your storage model?

**Trigger:** Shared database with foreign key constraints across services.
**Ask:** What happens when one service needs to scale independently or migrate storage? Are FKs serving your architecture or constraining it?

**Trigger:** Distributed transaction spanning external services or notifications.
**Ask:** Once that email is sent, no rollback can undo it. Shouldn't you design for compensation rather than pretend atomicity exists?

**Trigger:** Manager operation with > 4-5 dependencies (glove/claw pattern).
**Ask:** Is this orchestrating a use case, or has the Manager become a god service while Engines/RAs are sliced too finely? What happens when one requirement changes?

**Trigger:** Manager referenced by multiple subsystems / contexts.
**Ask:** Managers encapsulate context-specific use cases. If two contexts share a Manager, either the contexts aren't truly different, or you're coupling them. Have you interviewed to verify use cases are diverging?

## State & infrastructure

**Trigger:** Engine/Manager directly accessing stateful actors / cache without RA.
**Ask:** You'd not let an Engine execute SQL directly — would you? RA shields you from the *mechanism*, regardless of whether it's a cylinder on disk or an actor in memory.

**Trigger:** Distributed system, no Feed subsystem.
**Ask:** What happens when this system interacts with other installations or external systems? How do you handle the environment boundary without smearing security across internal architecture?

**Trigger:** Actor or stateful component without mesh topology / parallel computation.
**Ask:** Are these *truly* actors — reactive entities in a smart-connectivity mesh — or stateful services of granular intent? What computational/parallel problem are they solving that justifies the model?

**Trigger:** Actor with direct external dependencies outside its mesh boundary.
**Ask:** A mesh defines clear entry/exit points. If actors reach outside independently, how do you reason about the system's behavior, test it, or know what the mesh does as a unit?

**Trigger:** Synchronized data copies without Command Authority.
**Ask:** Who owns the model and who owns the data? Each service should have its own interpretation. Are you creating debt that spreads through service contracts?

**Trigger:** Validation logic embedded in Manager.
**Ask:** Is this validation independently volatile from the business processes it guards? If tax law changes — does validation need to change independently? That's the litmus for a Validation Engine.

## Process & project

**Trigger:** No upfront architecture document; design deferred to sprints.
**Ask:** Name a complex system — refinery, bridge, aircraft — where architecture *emerged* from incremental construction. Self-organization produces whatever it feels like, on whatever schedule it feels like. What makes this system the exception?

**Trigger:** Sprint-based delivery, no critical path or dependency graph.
**Ask:** What is your critical path? It exists whether you acknowledge it or not. How do you know the team isn't wasting half its capacity on non-critical work while the bottleneck starves?

**Trigger:** Multi-system design, single architect, no architect activities in plan.
**Ask:** Have you calculated sub-critical risk? When the architect isn't dedicated, the team sits idle waiting for design. Have you presented this to management in cost-and-risk language?

**Trigger:** No project design, no critical path, no risk analysis.
**Ask:** How will you know if you're on schedule, or are you just hoping? Without project design, estimates are wishful thinking. What evidence do you have your timeline isn't a guess?

**Trigger:** "Use cases" reading like long workflows spanning sessions.
**Ask:** A use case is a single user-initiated interaction. If your "use case" spans the user going away and coming back, you've conflated workflow with use case — your Manager orchestrations will be bloated and untestable.

**Trigger:** Top-layer features scheduled before lower-layer dependencies.
**Ask:** Are you building clients ahead of Managers, or Managers ahead of Engines? How much rework are you planning to throw away when real dependencies arrive?

**Trigger:** System design dominated by CRUD, thin Managers.
**Ask:** Have you asked what the business would do with no computers? "Simple" data entry accretes business logic over time. Are you designing for the data-entry form, or the business that will outgrow it?

**Trigger:** No unit tests, or tests requiring extensive mocking of internals.
**Ask:** Unit testing presumes units. Where are the independently testable units? If you can't unit-test without standing up half the system, you don't have units — you have a distributed monolith.

**Trigger:** Service marked as "actor" tech to host stateful objects.
**Ask:** Is this the Actor Model, or actors in the marketing sense? What problem are these solving that justifies the model?

## Fractal architecture

**Trigger:** Inter-node relationships modeled as simple references / direct calls.
**Ask:** Edges are integration points carrying weight — first-class architectural elements. What volatilities do your Edges encapsulate? How does your address-space design handle N:M between Nodes?

**Trigger:** Fractal with divergent service taxonomies across node types.
**Ask:** Every node in a fractal must be self-similar — same volatilities, same contracts, only configuration and rules change. If code/volatilities differ across types, what makes this a fractal versus a distributed system with heterogeneous components?

**Trigger:** Fractal design without simulation evidence.
**Ask:** The synthesized model is the wrong model by definition. What simulations validated and refined node configurations? You cannot determine optimal configuration analytically.

**Trigger:** Conceptual view diagrams that look like call chains.
**Ask:** Conceptual views show the *result* of executing a use case, not the *interactions* to execute it. Are you confusing call sequence with architectural relationships between Nodes and their environment?

## Cross-cutting context

**Trigger:** Contract whose operations all carry parameters never transformed (tenant, caller, correlation, locale).
**Ask:** Which parameters are business data, and which are cross-cutting concerns that should flow via ambient context instead?

**Trigger:** Manager containing conditional logic on ambient client context (device, tenant, locale).
**Ask:** If we add a third client type tomorrow (watch, voice assistant), which files change? If the Manager changes, client-context volatility has leaked into orchestration.

**Trigger:** Encapsulating "payment system" while business decisions about payment (how much, when, which provider) leak elsewhere.
**Ask:** Where do payment business rules live? Are you sure they didn't leak with the payment infrastructure?

## Test authorship & information barrier

**Trigger:** Tests whose authorship provenance is unclear, or single agent wrote both production and test code.
**Ask:** Did the author of this test ever see the production implementation? If yes, what evidence do you have that the tests exercise the contract rather than mirror the implementation?

**Trigger:** Test suite green on first run.
**Ask:** Was the information barrier enforced structurally, or do we rely on red-first as our only evidence? With the barrier enforced, green-from-start is expected; without it, red-first was the only proof and we have lost it.
