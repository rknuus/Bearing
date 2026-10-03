# Core IDesign Principles


## Volatility-naming discipline (read this first)

**No volatility, no component.** Before you draw a component on the canvas — Client, Manager, Engine, ResourceAccess, Resource, or Utility — you must be able to name the volatility it encapsulates in one sentence.

- **Clients** encapsulate **consumer / channel / entry-point** volatility — which UI, CLI, webhook receiver, scheduler, or external actor initiates use cases. A Client is a first-class component (the consumer/interaction axis), never an external given.
- **Managers** encapsulate **sequence-of-operations** volatility — how a use case is orchestrated.
- **Engines** encapsulate **activity** volatility — what changes inside a single step of that sequence.
- **ResourceAccess** encapsulates **access** volatility — how the data is reached, not what it is.
- **Resources** encapsulate the volatile *thing itself* (the schema, the topic, the queue).
- **Utilities** encapsulate cross-cutting volatility (logging, security context, etc.). A Utility
  comes in **two shapes** and you must say which — see *Service or library?* below. It is the one
  question the taxonomy above does not answer for you.

If you cannot name the volatility, you do not have a component — you have a domain bucket. A Manager whose name is a domain noun ("Order", "Customer", "Partner") with no written axis-of-change is functional decomposition wearing service-oriented clothes; it will grow into a fat Manager and lock in the cost.

**Practice it audibly.** When you propose a Manager, the next sentence out of your mouth (or onto the canvas) is *"...which encapsulates the volatility that &lt;X changes&gt;."* If you can't finish that sentence, the component isn't ready.

The discipline runs both ways:
- **Every component → a named volatility.** Cannot articulate one → delete it or find the real volatility hiding inside the bucket.
- **Every volatility from interview → a component.** Orphan volatility → add an encapsulator, or reject the volatility as a non-volatility / variable.

This is the most important habit in The Method. Skipping it is the most common path to a system that survives one release and dies in the second.

## Service or library? — the question every Utility owes (ADR-074)

The five layers above each answer the question by construction: a Manager, an Engine and a
ResourceAccess **are** seams, a Resource sits behind one, a Client sits in front of one. Only a
Utility can be either, so a Utility is the one component you have to ask.

**Ask exactly this, out loud, the moment you name a Utility:**

> When something uses this component, does anything cross a process, get serialized, or get
> versioned independently of its caller?

- **Yes ⇒ a SERVICE utility.** A real seam. Facets, operations, DTO-typed contracts, a generated
  Interface project — everything a Manager or an Engine has. A drawn Manager box may call it. A
  message bus, an integration-event publisher, a security-capability check.
- **No ⇒ a LIBRARY utility.** C# types called in-process — classes, structs, and `IDisposable`
  scope handles. **No seam, therefore no contract**: it declares no facets, no operations and no
  DTOs, and **no drawn sequence step may call it**, because there is no boundary for a box to
  cross. Its implementation is the iFX's, and it is reached in-process. Tracing, metrics, logging.

Say it in the model, not only in your head:
`theagent2 sns mutate --kind SetUtilityKind --component <Name> --utility-kind service|library`
(also available as `AddComponent --utility-kind …`). An undeclared Utility reads as `service`
everywhere, and the gate reports it as a question you have not answered yet.

### Why this distinction exists — the derivation, which matters more than the verdict

A design was writing a telemetry component's contract, and the question in front of it was the
ordinary one: *what should this component's contract say about closing a trace span?* Every attempt
to answer produced another hole. There was no observable rule to state, no close operation to
declare, no query facet to read a span back, and the contract wanted `Recorded` / `Emitted` answers
the domain had no way to give.

**The question was unanswerable because its premise was wrong.** The component should not have had
a service contract at all. The rule underneath:

> **Where there is no contract boundary — nothing crosses a process, nothing serializes, nothing
> versions independently of its caller — forcing the component into a service contract manufactures
> questions that have no answers.**

Learn to recognise the manufactured ones, because that is the practical skill here. A *real*
contract question has a wrong answer: the domain, a business process, or a stakeholder prefers one
option over the others. A *manufactured* one only has choices — every candidate is equally
arbitrary, and the design can pick any of them without anything in the world objecting. When you
find yourself inventing an answer nobody can be wrong about, stop and check the premise.

Once the component is understood as a library, the original question does not get a better answer:
**it disappears.** The caller holds a disposable scope, `using` closes it, no contract boundary is
crossed anywhere in that sentence, and there is nothing left for a contract to say. That
disappearance is the evidence the decomposition is right.

**Telemetry is the worked example, never the rule.** The criterion is the *boundary*, not the
subject matter — a message bus is every bit as cross-cutting as a tracer and is emphatically a
service. Do not read this as "infrastructure is a library"; read it as "ask about the boundary".

### What the model records for a library — deliberately little

A library Utility **names its C# surface in its description and the model does not model it
further.** This is a decision, not an omission.

In this model a facet is not a name: it is a generated `I{facet}` interface file, a
`.methodcontract` line and an Interface project. Declaring a facet on a library is therefore not
*naming* its surface, it is *writing a contract* for something with no boundary — the very thing
the rule above refuses. Modelling the members would be worse: a second, weaker copy of the C# type
system that nothing executes and that can only drift from the types the iFX actually ships.

What the model still holds for a library is everything genuinely architectural — the component
exists, it is in the Utilities layer, it encapsulates a named volatility, and its description names
its C# surface for a reader. What it does not hold is the shape of types the compiler already owns.

## Use case vs. workflow (foundational distinction)

A **use case** is a single user-initiated interaction with the system, orchestrated by **one Manager**. One entry, one Manager, one session boundary. The Manager's public contract lists use cases.

A **workflow** is a sequence of use cases — across Managers, possibly across sessions or hours/days. Workflows are *emergent* from how use cases compose; they are **not** a service category.

**Consequences:**

- **There is no `WorkflowManager`, `WorkflowEngine`, or `WorkflowService`.** Workflow is a mechanism, not a service. The architectural smell of "Workflow" in a service name is functional decomposition.
- **Workflow orchestration belongs inside the Manager** as a facet (`IPartnerOnboardingFlow` on `PartnerManager`) or as a Saga across the event log when crossing subsystems. It never lives on the Manager's public surface as multiple sequenced operations a contract caller could invoke standalone.
- **Manager self-edges in a call chain** (the same Manager calling itself across multiple operations in a sequence diagram) signal workflow conflation — collapse into one orchestrating use case with private steps, or split into separate use cases each with their own call chain.
- **A "use case" that reads like a multi-step story spanning Manager interactions is a workflow.** Decompose it into its constituent use cases; the workflow then becomes the sequence in which the user (or a Saga) invokes those use cases.

The cost of conflating use case with workflow: contracts grow workflow-shaped (multi-step orchestration on the public surface), use-case cohesion erodes, and the test "does this Manager have ≥4 operations because of workflow-bloat?" almost always returns yes.

## Decomposition
- Decompose based on volatility, not domain models, requirements, features, or technology — functional decomposition guarantees pain.
- Design big, build small — architect for all present, future, known, and unknown use cases upfront; then build incrementally over a stable architecture.
- Treat architecture as immutable once decomposed by volatility — changes in behavior or priorities never require a different decomposition.
- Apply VBD fractally at every scope level, from system architecture to contract factoring.
- Seek the smallest composable set of components — system size must be proportional to business complexity.
- Limit to ~5 Managers without subsystems, ~3 per subsystem; constrain core use cases to 3–5 (max 9).
- Assign Managers to sequence-of-operations volatility; assign Engines to activity volatility within that sequence. No volatility, no component.
- Encapsulate realistic volatility, not nature-of-business changes — fundamental business nature changes require a do-over.
- Never derive architecture with technology in mind — deploy the same architecture to any target by changing config alone.
- Match every design artifact to a volatility and every volatility to a place in the design.
- Design against core use cases only — the hundreds of use cases they give you will change; core use cases represent the nature of the system.
- Go broad before deep on volatility; distinguish volatilities from variables — if the system operates without knowledge of a concern, it is a variable.
- Separate volatility identification from solution design — state "timeline volatility," never jump to "queuing."
- Separate architecture from deployment from infrastructure — these are distinct concerns.

## Layering
- Define services by roles — Clients, Managers, Engines, Resource Access, Utilities — not by size; a microservice equals a Method Subsystem rooted by a Manager.
- Express all operations as behavioral business verbs — zero properties, property-like operations, or CRUD across all interfaces.
- Target 3–5 operations per interface, ~2.2 interfaces per service, ~0.7–0.8 parameters per operation.
- Expose a single entry point per system or service — multiple entry points multiply security, compensation, and change-impact concerns.
- Default to per-call instancing; make Engines and RAs session-full toward their Manager.
- Never queue calls to Engines or Resource Access — a message bus triggers use cases, so a Manager is always involved.
- Restrict clients to publishing requests, never events — events imply completed work, and only Managers perform work.
- Confine Resource Access to access volatility only — not processing, judgment, or interpretation. Use Strategy or Bridge Pattern for provider variability.
- Keep Managers as pure orchestration — a sequence of calls with data-contract transformation. Logic creeping in is a Method smell.
- Forbid Engine-to-Engine and RA-to-RA calls; forbid Engines and RAs from publishing or subscribing to events.
- Enforce semi-closed architecture — calls flow downward through the layer hierarchy; no sideways calls, no upward calls, no cross-resource foreign keys or triggers. Managers and Engines may both call ResourceAccess directly.
- Route Manager-to-Manager communication across subsystems only via queuing or pub/sub for temporal decoupling.
- Treat subsystems as the unit of extensibility and scale — each deploys its own instances of shared Engines and Access services.

## Contracts
- Communicate always with explicit contracts; treat facets, not services, as the unit of cohesion with a single reason to change.
- Prefer specific contracts over generalized ones — be as specific as possible until it hurts, then back off just a little.
- Segregate interfaces by messaging pattern — never combine event-based with request-response on the same facet.
- Never share DTOs between use cases at the Manager layer; never leak internal DTOs outward or Manager DTOs inward.
- Never multi-purpose DTOs — separate external contracts from internal storage entities; never leak schema publicly.
- Apply SOLID to DTOs and use DTO polymorphism for information hiding; DTOs belong with the service contract as its SDK.
- Differentiate Commands (single subscriber, business action) from Observables (multiple subscribers, event notification) — subscribers own event contracts.
- Use RPC over REST for internal business systems — business operations have infinite verb variability. Segregate private APIs from public.
- Never put code in the Gateway — it is a security boundary, not a place for logic or orchestration.
- Return arrays across service boundaries, not deferred sequences — deferred execution is dangerous in distributed computing.

## Data
- Start ACID transactions as upstream as possible and engulf as much as possible — atomic transactions are the ultimate error recovery.
- Accept that compensation is always business-specific — all attempts at generic compensation have failed; plan new use cases for error recovery.
- Propagate transactions per taxonomy: Managers use client/service, Engines/RAs use client, Utilities use server — this eliminates deadlocks.
- Use volatile resource managers in cloud; accept eventual consistency with manual compensation rather than forcing distributed transactions.
- Distinguish System of Record (temporal transactional data) from System of Truth (enterprise collective agreement); reconcile with a dedicated flow.
- Apply Ingest-Then-Digest for data feeds — get data in efficiently, then process at leisure including re-transform and replay.
- Avoid synchronized data copies — synced data is always out of sync; strive for Command Authority over data autonomy.
- Keep all business logic out of stored procedures and the database; apply polyglot persistence — fit the store to the data's form.
- Design Sagas around use cases as the Unit of Consistency; order steps from most to least likely to fail. Make every operation idempotent.

## Process
- Calculate project duration from the topology of the project network — do not estimate it. Estimate units first as a sanity check.
- Put dollar sign over semicolon — economics take precedence over code; engineering is doing for a dime what any fool does for a dollar.
- Construct incrementally, not iteratively — without architecture, iteration just tears down and rebuilds. Architecture enables agile, not opposes it.
- Reserve design authority for the architect — never make developers do design; self-organizing teams for architecture is sanctioned mob rule.
- Drive all detailed design from use cases: validate with call chains, sketch contracts, iterate across all contracts simultaneously until churning calms.
- Use sequence diagrams past a certain complexity; involve domain experts throughout; stress-test with outlandish requirements. Write zero code during detailed design.
- Always refactor the design before the code — moving blocks and arrows is vastly cheaper than refactoring code.
- Build all infrastructure services first — reduces risk and simplifies the dependency diagram. Milestones at integration points, not sprint boundaries.
- Track float consumption deterministically — consuming float completely is suicidal; scope changes create a new project design.
- Never ask permission to do the right thing — build trust through results, not arguments; frame architecture value as business agility and opportunity gained.
- Practice requires a mentor — without one, incorrect solutions risk becoming permanent damage. The true practice is 5% design and 110% mentorship.


## Volatility Identification

- **axes of volatility** -- the two dimensions of change in any business:
  1. The **same customer over time** -- business context evolves, usage patterns shift
  2. **Different customers at the same point in time** -- not all customers use the system the same way
- If a candidate volatility cannot map to either axis, it is likely functional decomposition in disguise
- Watch for **solutions masquerading as requirements** -- "cooking" is a solution; the real requirement is "feeding" or even "well-being of the occupants"
- Do not encapsulate the nature of the business -- aspects that are fairly constant and would be done poorly if encapsulated

### Volatility categories (sns-cli `--category` allowed values)

When persisting a volatility via `theagent2 sns mutate --kind AddVolatility`, the `--category` flag takes one of these four values. The category describes *what kind of change* the volatility encapsulates:

| `--category` value | What it captures | Examples |
|---|---|---|
| `Customer` | Variation across different customers at the same point in time (axis 2 above) | Different customer tenants, partner-specific contracts, regional regulatory regimes |
| `Time` | Variation in the same customer over time (axis 1 above) | Product roadmap evolution, growing partner roster, lifecycle-stage progression |
| `Domain` | Variation in the business domain itself (the shape of the work being done) | Pricing strategy, fulfillment model, sales-channel protocols |
| `Implementation` | Variation in the technical substrate that supports the domain | Storage technology, deployment topology, partner-integration protocols |

If a candidate volatility doesn't fit any of these four, that's a strong signal it's not a real volatility — likely a function in disguise.

## Project Spec (mission / vision / background / objectives)

The IDesign project Spec captures the *why* of the system in four named fields. They are distinct concepts; the agent must keep them distinct when persisting via `theagent2 sns update --kind Spec`:

| IDesign concept | sns-cli flag | What it captures | Form / length |
|---|---|---|---|
| **Mission** | `--mission <text>` | The system's *purpose*. Answers "why does this thing exist." Use present tense; name the value delivered. | ≤ 2 sentences. Direct. No mechanism — *what* the system does for whom, not *how*. |
| **Vision** | `--vision <text>` | The *end-state of the world* the system contributes to when successful. Aspirational. | 1–2 sentences. Tests: does it describe what's *true about the world* if we succeed? Or does it describe what the system *does*? Latter is a Mission-impostor. |
| **Background** | `--body <text>` (or `--body-file <path>`) | The domain context, history, problem space, constraints. The "stage-setting" content. | 1–3 paragraphs. Plain prose; markdown OK. |
| **Objectives** | `--objectives <json-array>` | Concrete, project-level success criteria. Different from acceptance criteria of use cases — these are about the *project*'s success, not a specific use case. | JSON array of strings. Each ≤ 1 sentence. |

### Quality gates the agent self-checks before persisting

- **Mission**: ≤ 2 sentences. No mechanism. If it reads like "the system processes orders by …" — that's a function description, not a mission.
- **Vision**: aspirational. Test: "if we succeed, what's true about the world?" If the vision describes the *system's* behavior instead, rewrite from the outside-in.
- **Background**: keep distinct from mission/vision. Background is about *what's already there*; mission/vision are about *what we're adding*.
- **Objectives**: each is a concrete success criterion, testable in principle. "Be successful" is not an objective. "Achieve <metric> in <horizon>" is.
