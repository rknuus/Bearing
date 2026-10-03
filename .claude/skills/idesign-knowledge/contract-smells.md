# Contract Design Smells

## Naming

### [CRITICAL] CRUD verbs in operation names (Create/Read/Update/Delete/Get/Set/Save/Upsert)
Business doesn't speak Get/Delete/Upsert. If your contract could inherit `IDataAccess<I,T>`, you've exposed the DB.
**Instead:** Express in business terms — `RecordMarriage`, `CreditAccount`, `ActivateAccount`. `Edit()` over `Create/Update/Delete` for low-volatility UI use cases.

### [MAJOR] GetBy/FilterBy proliferation (`GetByName`, `GetById`, `FilterByStatus`)
Hiding GetBy in request DTOs makes it worse. Iterating over a service call is a sin.
**Instead:** Single business verb (`Load`, `Filter`, `Summarize`) with polymorphic criteria DTOs. Differentiate via criteria objects. Never differentiate one vs. many.

### [MAJOR] Prefix/suffix naming on contracts/operations (`SendEmail`/`SendSms`, `IInstallationManagementAccess`)
Variability encoded in operation name; contract grows linearly with each new variant. Surface symptom of GetBy.
**Instead:** Single polymorphic operation (`Find(CriteriaBase)`, `Send(NotificationRequestBase)`); variants are derived DTO classes via KnownTypes. Differentiate by namespace/subsystem, not affixes.

### [MAJOR] Three-part service or manager names (`OfferCatalogManager`, `SearchScopeManager`)
Indicates too much granularity, often a facet elevated to a subsystem.
**Instead:** Broad nouns; `SearchScopeManager` → `CatalogManager` with `ISearchScope` facet. Use `???` as placeholder rather than a forced three-part name.

### [MAJOR] Operation names that don't imply action
Service contracts are behavioral; non-action names = drift toward data exposure.
**Instead:** Every operation is a business verb conveying intent. Zero properties or property-like operations across all interfaces.

### [MAJOR] Manager self-edges in a use case's call chain

A use case's call chain contains an edge where the caller and callee are the **same Manager** (e.g., `PartnerManager → PartnerManager.AssignCapabilities → PartnerManager.ConfigureIntegration → PartnerManager.SetCommercialTerms → ...`). The self-call appears as a step in the public call chain.

**Why it's a smell:** Orchestration is leaking onto the contract surface. Either:

- **Collapse:** the self-called operations are internal helpers of one larger use case → consolidate into a single orchestrating Manager operation (e.g., `RegisterPartner(request)`) with the internal steps as private methods. They disappear from the **contract** call chain — and, unless the model names them, from the trace with it: conformance is *gated* at **component-call** granularity, so a private helper no modeled box names is below what any check sees (`observability.md`). If a step must stay visible, it is not a helper: it is an Engine call the sequence draws, or — when it is the Manager's own work — an **internal-step box** the sequence draws, which the generated entry body spans (ADR-061 decision 13). Only the first of the two is gated today.
- **Promote to Saga:** the self-called operations are distinct use cases that just happen to be sequenced today → split into separate Manager operations, each its own use case with its own call chain. Cross-Manager coordination (if needed) goes through the event log.
- **Workflow as a facet, never as a service:** if the *orchestration itself* is the volatility (e.g., partner onboarding has different shapes per region or partner type), express it as a facet on the domain Manager — `IPartnerOnboardingFlow` on `PartnerManager` with one orchestrating operation. **Never** create a `WorkflowManager` (anti-pattern: Manager named "Workflow" — see `anti-patterns.md`).

**Diagnostic question:** *"If I drew the use-case list from scratch from the interview, would I list each of these self-called operations as a separate business use case the user can perform?"* If yes → split into separate operations / Sagas. If no → collapse into one orchestrating operation with private steps.

**Workflow is everywhere — but not as services.** Many domains are workflow-heavy (onboarding, fulfillment, dispute resolution). Workflow being load-bearing for the business does NOT justify a `WorkflowManager`. It justifies workflow being expressed as facets on the right domain Managers, with the volatility (sequence, branching, compensation) encapsulated inside one operation.

**Instead:** the public Manager surface only exposes operations that map 1:1 to business use cases. Internal orchestration stays internal — as private helpers, as a facet hiding the choreography, or as a Saga across the event log. Internal-as-private-helper does mean unchecked: nothing spans a helper the model does not name, and the modeled sequence is *gated* at component-call granularity only (`observability.md`). Collapse a step into a helper when it is plumbing; model it — as an Engine call, or as an internal-step box — when its order or its outcome must be visible.

### [MAJOR] Non-use-case-named operations on a Manager contract
Manager doing how-to work (Engine logic) or exposing data primitives.
**Instead:** Each Manager operation maps to a business use case from interviews. If it doesn't, it belongs in an Engine, Access layer, or different facet.

## Cohesion

### [CRITICAL] Fat Manager
Single contract with too many core use cases. Couples multiple volatilities; bloats further with secondary use cases. Violates SRP/ISP/SoC. 20+ disparate Controller actions push context shims to clients.
**Instead:** Separate facets per volatility area. High cohesion: a single reason to change.

### [MAJOR] Multiple contexts in same Manager contract
File feeds + WebHooks, or Admin + Runtime in one contract — operations and DTOs will diverge.
**Instead:** Segregate facets when use-case analysis reveals diverging behaviors. Per-context Bridge/Strategy.

### [MAJOR] Catch-all aggregated Manager (`AdminDataManager`)
Connects to many components; loses subsystem ownership.
**Instead:** Admin/definition use cases as facets within the subsystem that uses them most.

### [MINOR] Dull facet — too few operations
Adds interface overhead without behavioral cohesion. Often premature separation.
**Instead:** Collapse into an existing cohesive contract. A single-operation Engine is extraneous unless it's a known placeholder.

## Operation count

### [MAJOR] Contract exceeding 12 operations (hard max ~20)
Naming smells emerging; doing too much.
**Instead:** Factor into facets by volatility/cohesion/independent reasons to change. Target 3-5 ops per facet.

### [MAJOR] Overly generalized operation with too many parameters
30+ params, additive and mutually exclusive in seemingly random ways = endless if/else.
**Instead:** Polymorphic detailed design — specialized DTOs and Strategy. Workflow Managers may legitimately have more params.

### [MAJOR] Method overloads for search combinations
`GetOrder(orderNumber)`, `GetOrder(orderNumber, userId)` — GetBy in disguise.
**Instead:** Single `Inquire(inquiry)` with a polymorphic request DTO. Criteria-based hierarchy, not dozens of overloads.

## Property operations

### [CRITICAL] Property operations masking real behavior (get/set on contracts)
Exposes state instead of behavior. Differentiating endpoints by DTO is GetBy in disguise.
**Instead:** Behavioral operations conveying intent. `Load`/`Edit` patterns over getters/setters.

### [MAJOR] Piping query concerns through layers (sort/page/filter)
Each layer reimplements an inferior LINQ/SQL.
**Instead:** Sort/page/filter are presentation concerns. RA returns strongly typed aggregates.

## Canonical-DTO coupling

### [CRITICAL] Canonical DTO across contexts
Couples lifetimes; even DDD recognizes this — hence "bounded context".
**Instead:** Per-context DTOs. Mapping is investment, not duplication. Owning more DTOs is small price for lifetime decoupling.

### [CRITICAL] Canonical DTO with unfilled properties per caller
Programming by exception. No information hiding.
**Instead:** Polymorphic requests/responses. API returns structures the consumer is allowed to see — nothing less, nothing more.

### [CRITICAL] Internal DTOs exposed at Manager-to-Client boundary
Most volatile boundary in the system coupled to internal details.
**Instead:** Managers define their own data contracts for client-facing operations. Transform at every boundary.

## Hierarchical contracts

### [MAJOR] Hierarchical contract inheritance instead of compositional facets
Couples facets vertically; hard to evolve independently. Service-contract inheritance is rare in real systems.
**Instead:** Compositional facets. Contract inheritance is appropriate mainly for IoT at the Access layer where devices share base behaviors.

### [MAJOR] Single aggregated SDK interface coupling the entire offering
"We want to simplify the SDK" via a single interface defeats facet decoupling.
**Instead:** Focused, facet-aligned SDK interfaces (ISP). Simplify via SDK design, not coupling.

## Factoring metrics

### [MAJOR] Contracts not meeting metrics (3-5 ops, ~2.2 interfaces/service, ~0.7-0.8 params/op)
These metrics observed consistently since the late 1990s.
**Instead:** Use as guardrails during iterative DD. Factor up, down, sideways based on cohesion and independent facets.

### [CRITICAL] Mixing REST and RPC in the same API contract
The worst API anti-pattern. Controller with verby ops + business actions reveals tension: business systems are RPC, not databases.
**Instead:** Acknowledge you're doing RPC over HTTP. Business-focused RPC nomenclature. TS SDKs for consumers. Controllers are facets — apply contract factoring discipline.

### [MAJOR] Switch/if-else branching instead of polymorphic contract design
Query-string-heavy APIs propagate procedural style. 40-parameter controller actions.
**Instead:** Polymorphic DD encapsulates variability in operations *and* DTOs. Specialized Bridge/Strategy per context.

### [MAJOR] DTO pattern without use-case alignment
DTOs not matching the facet's behavioral needs.
**Instead:** Operation factoring — scope DTOs to operations. Domain-informed, context-relative, use-case-driven. Same factoring technique for service contracts and DTOs.

## Namespace convention

### [MAJOR] Namespace missing Aspect segment (`Interface` or `Service`)
Doesn't communicate contract-vs-impl. Breaks broad-search rationale.
**Instead:** Always include `.Interface` or `.Service`. Enables source-control governance and design-driven development.

### [MINOR] Context segregation at wrong layer
Engines segregate by Subsystem context (encapsulate reusable logic consumed differently). Managers segregate by consumption context. Access typically should not — if it needs context, it may be too broad or doing engine work.
