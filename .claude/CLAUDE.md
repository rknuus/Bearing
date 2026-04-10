# TheMethod Architecture Context

This project uses **TheMethod** (IDesign) for system architecture.

## Architecture Definition
The architecture is defined in `bearing.method`. This YAML file contains:
- **Project identity**: vision, mission, objectives
- **Volatility analysis**: identified and rejected volatilities with evidence and rationale
- **Components**: organized by layer (Clients, Managers, Engines, ResourceAccess, Resources, Utilities)
- **Topology**: subsystem groupings, architecture type, message bus
- **Use cases**: core and regular use cases with call chains and sequence steps

## ⚠️ Critical Rule
**Always use `theagent_*` tools to modify the `.method` file. Do NOT edit the `.method` file directly.**

The write tools validate against the Method schema and create backups automatically.

## TheAgent MCP Tools

### Read Tools
- `theagent_get_architecture` — returns the parsed architecture model
- `theagent_validate` — runs validation rules against the architecture
- `theagent_diagram` — renders architecture diagrams (Mermaid)
- `theagent_info` — returns summary info about the architecture
- `theagent_view_diagram` — start the live diagram viewer in a browser (auto-updates when .method file changes)
- `theagent_list_projects` — list all Method projects in this workspace

### Write Tools
- `theagent_add_component` — add a component to a specified layer
- `theagent_remove_component` — remove a component (cascading removal from use cases, topology, volatilities)
- `theagent_rename_component` — rename a component (cascading updates across use cases, topology, volatilities)
- `theagent_add_volatility` — add an identified volatility
- `theagent_reject_volatility` — reject a volatility with reason
- `theagent_add_use_case` — add a use case (core or regular)
- `theagent_remove_use_case` — remove a use case by name

## Agent Hierarchy

Start every interaction with `@architect` in chat or run `claude --agent architect` from the command line.

The architect gathers context, presents findings with numbered options, then delegates to specialized subagents. **Do not invoke subagents directly** — always start with the architect.

| Agent | Role |
|-------|------|
| **architect** | Coordinator — gathers context, presents findings with options, delegates to subagents |
| iterate | Applies design changes to the .method file |
| validate | Runs architecture validation (hard + soft rules) |
| drift | Compares codebase against .method model |
| implement-{lang} | Stack-specific implementors (csharp, java, typescript, go, python, cpp) |
| test | Test generation and verification |
| review | Code review specialist (read-only) |
| challenge | Socratic challenger — probes architecture with dialectic questions |

> The old `/the:iterate`, `/the:validate`, and `/the:drift` slash commands have been replaced by the agent hierarchy. Use `@architect` instead.
> Use `/the:challenge` (or `/the:challenge --juval` / `/the:challenge --monty`) to invoke the Socratic challenger directly.

---

## Core Principles (TheMethod / IDesign)

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
- Define services by roles — Managers, Engines, Resource Access, Utilities — not by size; a microservice equals a Method Subsystem rooted by a Manager.
- Express all operations as behavioral business verbs — zero properties, property-like operations, or CRUD across all interfaces.
- Target 3–5 operations per interface, ~2.2 interfaces per service, ~0.7–0.8 parameters per operation.
- Expose a single entry point per system or service — multiple entry points multiply security, compensation, and change-impact concerns.
- Default to per-call instancing; make Engines and RAs session-full toward their Manager.
- Never queue calls to Engines or Resource Access — a message bus triggers use cases, so a Manager is always involved.
- Restrict clients to publishing requests, never events — events imply completed work, and only Managers perform work.
- Confine Resource Access to access volatility only — not processing, judgment, or interpretation. Use Strategy or Bridge Pattern for provider variability.
- Keep Managers as pure orchestration — a sequence of calls with data-contract transformation. Logic creeping in is a Method smell.
- Forbid Engine-to-Engine and RA-to-RA calls; forbid Engines and RAs from publishing or subscribing to events.
- Enforce closed architecture — call only the layer immediately underneath; no sideways calls, no cross-resource foreign keys or triggers.
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


### Volatility Identification
- **axes of volatility** — the two dimensions of change in any business:
  1. The **same customer over time** — business context evolves, usage patterns shift
  2. **Different customers at the same point in time** — not all customers use the system the same way
- If a candidate volatility cannot map to either axis, it is likely functional decomposition in disguise
- Watch for **solutions masquerading as requirements** — "cooking" is a solution; the real requirement is "feeding" or even "well-being of the occupants"
- Do not encapsulate the nature of the business — aspects that are fairly constant and would be done poorly if encapsulated

## General guidelines

> Think carefully and implement the most concise solution that changes as little code as possible.

Follow existing patterns in the codebase.

## Project-Specific Instructions

- See [README](../README.md) for background about the project
- Document all architectural aspects in `doc/architecture/`
- To build, test, etc. use `make` commands. Do not come up with own commands. If a `make` command you need is missing, tell the user
- Cover new/changed code by tests, unless coverage is not possible: in this case confirm with the user
- Always lint code before committing and only disable rules for genuine false positives, not for non-idiomatic code: `make lint` in the project root
- Always run all tests before committing: `make test && make test-ui-component-headless && make test-e2e-headless` in the project root
- Ensure backend state changes are atomic to avoid state inconstistencies between frontend and backend because of race conditions
- Log all relevant events, especially errors with all relevant details except sensitive data like passwords
- To analyze errors read the log file `~/.bearing/bearing.log`
- For Svelte 5 questions, fetch and use: https://svelte.dev/llms-full.txt
- For svelte-dnd-actions, refer to the local README snapshot at `../tmp/docs/svelte-dnd-action/README.md`
- For Wails v2, refer to the local docs snapshot at `../tmp/docs/wails/`
- Apply frontend changes to both the browser-based testing variant based on mock bindings and the native application variant based on Wails runtime
- When changing frontend code, carefully avoid uncaught exceptions and infinite loops in the native application
- In Svelte 5 `$effect` blocks, never read and write the same `$state` variable. Use `untrack()` for state the effect modifies but should not depend on
- Task state modifications in the frontend must verify state consistency with backends at the end
- No business logic in client code
- Avoid code duplication
- Do not pollute production code with test code, e.g. no testid in frontend code
- Always use strongly typed internal representation of values (e.g. dates) and take care of validation immediately after parsing input and format only immediately before output/display