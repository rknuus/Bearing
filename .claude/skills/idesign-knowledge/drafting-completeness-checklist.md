# Drafting completeness checklist

The drafting architect runs this checklist **before** ending its turn with `DONE ▸`. Each item points at an existing IDesign rule (anti-pattern, contract-smell, core-principle); the checklist's job is to make sure the rules get *applied*, not to redefine them.

**This is a coverage check for Design phase decomposition.** It is *not* a detailed-design check. Several IDesign concerns (DTO shape, exact operation signatures, test cases, facet rationalization to 3-5 ops) are **deliberately deferred to Construction.detailed_design** — flagging them here would produce stage-inappropriate noise. See "What this checklist does NOT cover" below.

If any item is "no" and the architect can't articulate why deferring is fine, the draft is not ready. Keep iterating.

---

## Volatility & encapsulation

1. **Volatility ↔ component coverage runs both ways.** Cite: `core-principles.md` "Volatility-naming discipline" — *no volatility, no component*.
   - (a) **Every volatility → an encapsulator.** No orphan volatilities. `theagent2 sns read --kind ReadArchitecture --draft <id> --sections volatilities` should show none.
   - (b) **Every component → a named volatility.** For each Manager / Engine / RA / Resource / **Utility** on the canvas you can write the axis-of-change in one sentence. A component without a stated volatility is a domain bucket, not a component — collapse it, rename it to the volatility it actually encapsulates, or delete it.

1c. **Every Utility declares SERVICE or LIBRARY.** Cite: `core-principles.md` "Service or library?" (ADR-074). The five other layers answer this by construction — a Manager, an Engine and a ResourceAccess *are* seams, a Resource sits behind one, a Client in front of one — so the Utility is the only component you must ask, and you ask it **when you first name it**, not at the gate. The question: *when something uses this component, does anything cross a process, get serialized, or get versioned independently of its caller?* **Yes ⇒ service** (facets, operations, DTO-typed contracts; a drawn Manager box may call it — a message bus, a capability check). **No ⇒ library** (C# types called in-process, `IDisposable` handles included; **no facets, no operations, no DTOs, and no drawn step may call it**; its surface is named in the description and modelled no further; its implementation is the iFX's — tracing, metrics, logging). Record it: `mutate --kind SetUtilityKind --component <Name> --utility-kind service|library`; undeclared reads as `service` and the gate reports `UtilityKind.Unstated`. **Test:** for each Utility, can you name what crosses? If you cannot, and you have nonetheless drawn a facet on it, you are writing a contract for a boundary that does not exist — the mistake this item exists to catch.

2. **No "speculative" volatilities.** Each encapsulator covers a Day-1 active variation, not an imagined-future axis. Cite: `anti-patterns.md [MAJOR] Speculative volatility hunting`. Test: would removing this encapsulator cause a real Day-1 use case to fail? If no — defer to when the variation materialises.

3. **No volatility is a use-case family in disguise.** Cite: `anti-patterns.md [MAJOR] Confusing use cases with volatilities`. Tell: a Manager named for a lifecycle position (e.g., "FulfillmentManager") or for a workflow step is almost always this smell. Managers encapsulate axes of change, not stages.

## Manager-level shape

4. **No Engine or ResourceAccess subscribes to events or queues.** Cite: `core-principles.md` ("Only Managers engage in pub/sub") and `anti-patterns.md [CRITICAL] Events/messaging from wrong layer`. Test: every edge into an Engine or RA in the call chain is a direct call from a Manager, not an event subscription.

5. **No Manager-to-Manager synchronous call.** Cite: `anti-patterns.md [CRITICAL] Manager-to-Manager synchronous calls`. Cross-Manager coordination goes via the event log / queue.

6. **No Manager calls itself on its own contract surface in a use case's call chain.** Self-edges (`PartnerManager → PartnerManager.AssignCapabilities → PartnerManager.ConfigureIntegration → ...`) signal that orchestration is happening at the contract surface when it should be either (a) collapsed into a single orchestrating operation with private internal steps, or (b) split into a Saga across multiple Managers. Cite: `contract-smells.md` (Manager self-edges entry) and `anti-patterns.md [MAJOR] Manager named "Workflow"`. **Workflow is a mechanism, not a service** — express it as a facet on the domain Manager or as a Saga, never as multiple public-surface operations a contract caller could legitimately invoke standalone.

7. **Each subsystem has roughly 3 Managers** (4+ is a smell — collapse or split the subsystem). Cite: `practitioner-rules.md` "Manager count per subsystem".

8. **Each Client → Manager edge in a call chain describes a business use case from the interview.** At Design phase, operations are free-text annotations on `SequenceStep`s, not `AddOperation` entities — the check runs on the annotation. A Client → Manager edge whose annotation does not map to a use case is either internal orchestration leaking onto the contract (collapse) or a missed use case (capture it). Cite: `contract-smells.md [MAJOR] Non-use-case-named operations on a Manager contract`.

## Use-case coverage at the system level

9. **Every primary use case has a populated call chain** (permutation with sequence steps). The chain traverses `Client → Manager → Engine/RA` — **sequence legs end at the ResourceAccess; a Resource is never a sequence-step callee — nor a sequence-step caller** (ADR-036; Resources remain components in the static view, and an inbound event from an external system is drawn as a Client standing for that system). The terminal RA step's call text (`operationDraft`) names the ultimate target: the concrete resource when it is fixed for the permutation, or the target set + the determinant that selects it when the target is 1-of-N at runtime (`<verb> <payload> into the <determinant> — <TargetA | TargetB | TargetC>`) — never a single concrete peer as an "example". A leg ending at an RA is complete, not a finding. **A step whose callee is a `Utilities` component is exempt** — stated by LAYER, not by the name of the thing: a call into a Utility is cross-cutting, not a descent, so it has no depth to cap, at any position in the chain including the last. (A message bus modelled as a `Utilities` component is therefore a legal tail; the same bus modelled as a `Resources` component is not.) **But only a SERVICE utility may be a callee at all** (item 1c, ADR-074): a Utility declared `utilityKind: library` has no contract boundary for a box to cross, is reached in-process through the iFX, and `UtilityKind.LibraryIsRouted` fails the gate as an error if a step is drawn to one. If you find yourself drawing a call to a library, one of the two statements is wrong — either it is really a service, or the call is ambient and the box does not belong on the sequence. Closed Architecture: no sideways calls, no upward calls from RA to Engine/Manager. Cite: `core-principles.md` "Enforce semi-closed architecture".

10. **No same domain name appears on multiple layers** (`FooManager → FooEngine → FooAccess`). Cite: `anti-patterns.md [MAJOR] Same domain name down the stack`. Layer responsibility should be unambiguous from the operation name alone.

10a. **No three-part or prefix-suffix names on components.** Cite: `anti-patterns.md [MAJOR] Three-part names / prefix-suffix smells`. A component name shaped `<Domain><Concern>Manager` (e.g., `OrderIntakeManager`, `CatalogueAlignmentManager`, `OperatorWorkbenchManager`) almost always means the middle term is a facet that should live on a broader Manager — collapse to the broader Manager and capture the facet split in the design journal. **The volatility-existence check (item 1b) does not catch this** because the three-part Manager can have a perfectly nameable volatility; the failure is the name shape, not the volatility absence.

10b. **Facet plan captured in the design journal for every Manager.** Each Manager should have an explicit prose entry in `.theagent/notes/<draft-id>.md` listing the facets it will carry at Component scope (no typed `AddFacet` entities expected here — see `architect.md` "Facets at System scope"). An empty facet plan, or one with exactly one facet per Manager across the board, signals facet-thinking was skipped — the decomposition probably promoted facets to Managers (smell 10a). Cite the facet-as-cohesion-unit principle (`core-principles.md` "treat facets, not services, as the unit of cohesion").

## Cross-cutting subsystem patterns

11. **Feed subsystems follow Ingest-then-Digest.** Cite: `core-principles.md` "Apply Ingest-Then-Digest for data feeds". A Feed Manager normalizes + persists raw input (via Access) and **stops**; downstream Managers subscribe to digest. A Feed Manager that calls a non-Feed RA inline (mutating downstream state synchronously) violates this — the canonical fix is a Feed-side `<X>ReportedEvent`, downstream Manager subscribes.

12. **Closed architecture not broken across Marketplace ↔ Settlement ↔ Notification ↔ Feed ↔ Analytics.** Cite: `core-principles.md` + `anti-patterns.md`. Each subsystem either talks via the event log (default) or via Saga (when distributed consistency is needed). Direct cross-subsystem Manager-to-Manager call chains are a flag.

## Internal consistency

13. **Decisions do not contradict the decomposition.** If a Decision says "X is encapsulated within Marketplace via a facet split" and your decomposition uses two Managers for it, one of them is wrong. Walk each Decision quickly; cross-check against the actual components/subsystems. Pick which side is right and rewrite the other.

14. **The `self_critique` discipline is captured** — at least 3 substantive entries somewhere durable. Today that's the design journal at `.theagent/notes/<draft-id>.md` (ADR-020 v2; see also handoff F18 for the SNS-side ask to make this first-class). Each entry cites a specific element being questioned and the principle being violated; quality matters more than count.

---

## What this checklist does NOT cover (deliberately deferred to Construction.detailed_design)

The following are Design-phase **out of scope** and the reviewer should not flag them as Design-phase findings:

- **Type-safe facets, operations, DTOs.** At Design phase, call chains reference components by UUID; operations, facets, and DTOs appear only as free-text annotations on `SequenceStep`s ("validate policy", "compose package"). Typed entities (`AddFacet`, `AddOperation`, `AddDto`, `AddDtoField`) are created in Construction.detailed_design, per-component, after promotion. The reviewer must not flag "operation X has no AddOperation entity" — it isn't supposed to exist yet.
- **Facet rationalization to 3-5 ops.** Facets don't exist as entities yet. Detailed-design.
- **Exact operation signatures, DTO field-level definitions.** Detailed-design.
- **Test plan / test suites / test cases.** No `AddTestSuite` calls at Design phase. Test planning is downstream, per-component.
- **Algorithms and class structure.** Detailed-design.

If the reviewer flags any of the above as a Design-phase issue, the finding is **stage-inappropriate** — push back politely and route to the architect at Construction.detailed_design instead.

---

## When to run this checklist

- **Before** the architect proposes wrap-up (blind peer review by a second architect instance, ADR-015 — the Software Architect starts that session; there is no `@orchestrator` dispatch) — silent walk-through. If items 1–14 are not all "yes" or explicitly deferred (with rationale captured in the design journal), the architect does NOT hand off yet.
- **When the user asks "is the design ready for review?"** — run the checklist out loud, surfacing each item's status, before answering.

## Discipline

- The checklist is a coverage check, not a quality bar. Quality lives in `dialectic-questions.md` and `idesign-challenge`.
- An item explicitly deferred with rationale (recorded in the design journal) counts as covered. Items silently skipped by the architect do not.
- This checklist supplements, doesn't replace, the broader `anti-patterns.md` / `contract-smells.md` libraries. Those are the rule references; this file is the **walk-through that ensures the rules get applied**.
