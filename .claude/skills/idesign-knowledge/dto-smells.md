# DTO Design Smells

## Schema-driven DTOs

### [CRITICAL] Table-schema DTOs
Mirror DB tables; consumers couple to schema; schema changes ripple.
**Instead:** DTOs reflect use cases, not tables. Transform at the RA boundary. DTOs are often aggregates of multiple entities.

### [CRITICAL] Data entities exposed as DTOs
EF/ORM models with both data-contract and ORM attributes; entity types in interface signatures.
**Instead:** Never emit entities as DTOs. Separate Access entities from DTOs; map at the boundary. Mapping is a necessary evil of good SO.

### [MAJOR] Database IDs in DTO contracts
Leaks impl details into contracts.
**Instead:** Entity GUIDs only, never DB IDs. Plumbing values via message headers, not DTO properties.

## Canonical-DTO coupling

### [CRITICAL] Canonical DTO across unrelated contexts
Couples lifetimes for the system's lifetime. Even DDD acknowledges this — hence "bounded context".
**Instead:** Per-context DTOs. The Method establishes context by **volatility**, not domain model.

### [CRITICAL] Canonical DTO with unfilled properties per caller
Destroys information hiding; consumers guess which fields apply.
**Instead:** Polymorphic requests/responses with namespaced ambient context. Return what the consumer is allowed to see — nothing less, nothing more.

### [CRITICAL] Shared DTOs between internal layers
Couples internal-component lifetimes with client lifetimes. Changes ripple to all consumers.
**Instead:** Never share component DTOs with clients. Never transmit public DTOs into the architecture. Map between component and public DTOs; ship public DTOs as the subsystem SDK.

## Business objects masquerading as DTOs

### [CRITICAL] Domain objects as DTOs
Couples data and behavior — DDD domain-model approach. Leads to `GetName()`-style APIs, data shipping between contexts, fat APIs.
**Instead:** Behavior and data forever split in SO. DTOs carry state; Engines/Managers carry behavior. The use case owns the data.

### [CRITICAL] Domain objects grafted onto services
Same disease in service shape — properties as operations, data shipping, state-exposing APIs.
**Instead:** DDD only at OOP code-design within components. SO ≠ OO.

## Logic in DTOs

### [CRITICAL] Methods / computed properties on DTOs
Pseudo-domain objects; couple data transport with logic; serialization breaks.
**Instead:** Properties only. DTOs satisfy SRP — single responsibility is carrying data across boundaries.

### [MAJOR] DTO transformation logic in Resource Access
Full rewrite per vendor; mixes retrieval with shaping.
**Instead:** Consolidate transformations in a transformation Engine. Evaluate volatility first — DTO transformation is often a tech problem, not a volatile business one.

## Generalization

### [MAJOR] Overly generalized DTOs
Bloated with mutually-exclusive or irrelevant properties. DTO-level Super-Service smell.
**Instead:** Balance size/count via Cost-vs-Count U-curve. Ideally unique DTOs per operation; pragmatic sharing only at low-volatility internal boundaries — never at Manager-to-client.

### [CRITICAL] Dynamic property-bag DTOs
Programming by exception; if/else hell; very leaky.
**Instead:** Strongly typed DTOs with polymorphic design. Behavioral SO + polymorphism solves what GraphQL attempts for data-centric SO, without the explosion of variation.

## Polymorphism

### [MAJOR] Defaulting to polymorphic DTO without analysis
Premature abstraction. Polymorphic is the *correct default* the moment a facet operation gains 2+ variants of the same conceptual use case (same return type, same verb, same postconditions). It's wrong only when applied speculatively to a single-variant op.
**Instead:** Count variants. 0-1: revisit behavioral design first. 2+: closed/sealed tagged-union root + wire discriminator + exhaustive dispatch is the default — no further justification needed.

### [MAJOR] Empty abstract base DTO with 0-1 concrete variants
Either unripe behavioral design or speculative abstraction.
**Instead:** Empty base with 2+ sealed variants is a *feature* (anemic tag, no behavior, SRP-clean) and not a smell. The Method's anti-inheritance stance targets behavioral inheritance (methods, virtuals, state+behavior), not anemic sum-type tag roots.

### [MAJOR] Different endpoints differentiated by DTO type
Another form of GetBy. Pushes selection to the caller.
**Instead:** Service accepts a polymorphic base; resolves via Strategy/Bridge internally.

## Cohesion

### [MAJOR] DTOs that aren't aggregates
Forces consumers to make multiple calls and assemble — chatty.
**Instead:** DTOs as meaningful business aggregates serving complete use cases. Aggregate gets into a single `Load`.

### [MAJOR] DTOs not cohesive with their facet
Multiple unrelated concerns; SRP violated at the data-contract level.
**Instead:** Same factoring technique for contract and DTO. Operation factoring scopes DTOs to ops.

### [CRITICAL] DTO changes rippling between subsystems
DTOs shared/coupled across subsystem boundaries; encapsulation broken.
**Instead:** Each subsystem maintains its own DTOs; map at boundaries. Owning more DTOs is small price for lifetime decoupling.

### [MAJOR] System context coupled with business DTOs
Originator, environment, security claims mixed with business data — different volatilities.
**Instead:** Context as a separate system-related contract. Flow out-of-band in message headers ("Message is the Application").

## Polymorphic hierarchical DTOs (the missing positive)

### [MAJOR] Flat DTOs without base-class polymorphism for request/response variability
Each new variant requires a new operation = GetBy. Violates OCP/SRP/DIP.
**Instead:** Hierarchical DTOs with abstract base (`FindCriteriaBase`, `NotificationRequestBase`) and concrete derivatives. Register via KnownTypes. Service exposes one operation typed on the base; runtime resolves by concrete type. New variant = new subclass; contract and intermediate layers untouched.
