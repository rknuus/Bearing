# IDesign Practitioner Rules

Field-tested rules from IDesign practice that are referenced often but don't fit the categorical files (`core-principles`, `anti-patterns`, etc.). Kept short on purpose — each rule is a sentence or two; the *reasoning* is in the books and the other knowledge files.

## The five laws

1. **`$ > ;`** — economics over code. Engineering is doing for a dime what any fool does for a dollar.
2. **All good things come from the DoD.** Networking, transactions, security models, CPM, PERT — DoD investments. Parnas 1972 is the bedrock.
3. **Nothing ever happens.** Computers sit idle almost all the time. In the actor world you aspire to 100% utilization.
4. **All roads lead to per-call.** Per-call instancing is the correct default for service activation. Separate the instancing mode from the programming model.
5. **0, 1, Infinity.** Either something is impossible, or there is exactly one way of doing it, or there are infinite ways.

## Subsystem count

A well-factored system has roughly **5 subsystems**: 3 canonical volatilities (**Feed, Notification, Analysis**) plus 2 nature-of-business volatilities. Fewer than 4 indicates missed volatilities; more than ~7 indicates over-decomposition.

## Manager count per subsystem

A well-factored subsystem has roughly **3 Managers**. The exact number isn't sacred, but **4+ is a smell**:

- **4 Managers in one subsystem** usually means the subsystem is doing two jobs and should split, OR two of the Managers actually encapsulate the same volatility at different lifecycle positions and should collapse.
- **1 Manager** is fine for a small subsystem; sometimes the subsystem is volatility-coherent enough that one Manager covers it.
- The test: each Manager owns a distinct axis of change. If two Managers have similar volatility (e.g., both touch the "package lifecycle" axis), they're probably one Manager with two facets.

## Manager count vs. total component count — keep these separate

These two numbers are different and routinely get conflated. Both come from IDesign source material:

- **Typical Manager count**: **~5 Managers** (the publicly-accessible services). Alumni quote: *"you go from 300-500 microservices to 10-20 microservices with only 5 being publicly accessible (aka your Managers)."* A small system stays at 5 with no subsystem layer; a larger multi-subsystem system with ~5 subsystems × ~3 Managers can reach an upper bound of **~15 Managers** — but ~5 is the typical, ~15 is the wide-system ceiling.
- **Typical total component count** (the "order of magnitude of 10" rule): **~10-20 components** total — Managers + Engines + RAs + Resources + Utilities. Alumni quote: *"That takes care of the granularity, and there are even some numbers in the book as to how many in total (order of magnitude of 10)."* The Manager:Engine ratio is typically golden (≈ 2:1 → ~5 Managers + ~3 Engines + ~6 RAs/Resources ≈ 14 components).

**Reviewer guidance:** "Manager count = 6" is **right at the typical norm**, not below it. Do NOT compare a Manager count against "10-15" — that's the upper Manager bound for a large multi-subsystem system, or the *total* component count. The right comparison is: "6 Managers — is each one encapsulating a distinct axis of change?" Quality of decomposition, not arithmetic against an inflated norm.

## Two architectural shapes

There are two architectural shapes — **low cost** and **low latency**. They are **mutually exclusive**. A real system is always a crafted combination, never a uniform pursuit of one. Pick consciously.

## Engine and Manager naming

- **Manager names are nouns** representing broad volatile business concepts (Scheduling, Content, Nutrition).
- **Engine names are verbs** representing volatile activities (Validation, Transformation, Pricing, Filtering, Rendering, Scheduling).
- **Red-flag Engine names** (nouns masquerading as engines): `ModelEngine`, `DiffEngine`, `TaskEngine`, `AgentEngine`, `DataEngine`. If you can't answer "what activity does this Engine perform?" in one word, rename it.
- A verb-named Manager or a noun-named Engine is a functional-decomposition smell.

## Risk targets (project design)

Project risk number conventions:
- **0.5** — fully decompressed (heavy float, slow but safe).
- **0.68–0.69** — normal solution risk.
- **> 0.75** — iffy zone. Asking for trouble. Decompress.
- **0.60–0.65** — appropriate for inexperienced teams.

Multiple critical paths are accidents waiting to happen. Never delete risk outliers; break god activities instead.

## iFX (Infrastructure Framework)

Build a **thin** iFX to mitigate technology as risk, wrap best practice, enforce policy, lower the bar of entry, and promote convention over configuration. Normalize connectivity into **interaction modes**: **API, Intranet, Queued, Bus, Component**. Never let developers spin their own interpretation of vendor SDKs — you'll get five wrong, buggy, insecure implementations. Proxies must be explicit so developers know they're building a distributed system.

## API discipline

- **Admit no one is doing REST** — everyone is doing RPC over HTTP. Embrace it.
- **Controllers are merely facets** — keep them to one or two lines plus a decorator.
- **The API is the New Monolith.** Always provide TypeScript SDKs for WebAPI consumers. Swagger is not enough.
- Separate **public APIs** (coarse-grained) from **private APIs** (fine-grained, business-focused).
- Never put code in the Gateway — it is a security boundary, not a place for logic or orchestration.
- Authorize at the Manager layer — authorize use cases, not individual component calls.

## Messaging discipline

- Differentiate **Commands** (single subsystem consumer) from **Observables** (multiple subsystem consumers).
- Use **`-ing` / `-ed` suffixes** for event names.
- **One topic per facet.**
- Never expect ordering from messaging technology.
- **Throttling is your friend.** A single queue with throttling often outperforms horizontal scale-out — DB response to load is not linear; the DB will fail long before the queue tech.
- Queue-based systems handle the same throughput at a fraction of the cost with mild latency increase.

## Data discipline

- **Cache reference data at host startup**, not via Cache-Aside.
- **Polyglot persistence** — fit the store to the data's form.
- **Avoid synchronized data copies** like the plague — they're always out of sync.
- **Weak references between schema sets**, not foreign keys.
- **Immutability** is the essential property.
- **Ingest then Digest** for data feeds — get data in efficiently, store raw, transform at leisure.
- The **use case owns the data** — a fundamental departure from the Domain Model.

## Saga discipline

- Use **event-driven Sagas around the Use Case as the Unit of Consistency**.
- **Order steps from most to least likely to fail.**
- **Never run steps in parallel.**
- Partition transactional and non-transactional resources.
- **The cloud signals the end of distributed transactions** — embrace compensation. The inevitable conclusion is some kind of human compensation.

## Detailed design

- **Self-edit your designs iteratively** — you will not get it right the first time.
- **Break analysis paralysis**: 3-5 core use cases gets you started. Have the courage to throw something on the canvas.
- The Mantra of DD: **just keep sketching**.
- **Refactoring diagrams beats refactoring code.**
- Brownfield systems: include **decommissioning old capability** in the plan, or people keep using the old way.

## Customer interview

- **Plan interviewing into PD** — you must not infer, guess, make it up, or crystal-ball it.
- **Ask customers to describe a user's day.**
- When you ask for use cases you never get them — you get **workflows**. The business is solutioning.
- **Gems emerge late** in interviews when the interviewee relaxes.
- Customer interview soft skills are of equal importance as design and technology.
- Validate your architecture by **pulling additional use cases off the shelf and throwing them at it** until swings stop breaking things.

## Architect role and mentorship

- **Being an architect is 5% design and 110% mentorship.** Your job is to make a developer community of broad-spectrum acumen productive — if they fail, it is the architect's fault.
- **Know Thy Team — assess the HOP** (Hand-Off Point) honestly. Junior HOP requires DD down to parameters; Senior HOP requires only service/interface outlines.
- **No one touches code without formal onboarding** — create a syllabus, schedule training, run labs.
- **Architects review every PR**: pull, compile, run, test, review. You must absolutely code (SME, frameworks, PoCs, scaffolding) — devs read code, not documents.
- **Always be looking for apprentices.** You are neither scalable nor sustainable — delegate and grow your team.
- **Reserve design authority for the architect** — never make developers do design; self-organizing teams for architecture is sanctioned mob rule.

## Advocacy and career

- **You win the war grass-roots, one system at a time.**
- **Engage, not enrage.** Find common shared values as the launch point. Being right counts for nothing if you make enemies you don't need.
- **Frame per audience**: TTM and agility for C-Suite, efficiency for PMO, excellence for developers.
- Design early projects with **risk around 0.5–0.65** to guarantee wins and rebuild trust. Success breeds success.
- **No complaint without contribution** — an alternative must always be brought to the table.
- **DO NOT BE AFRAID TO MAKE MISTAKES** — but be the first to admit when it's not working.
- **No one gets to call themselves an architect** until their design has survived intact through to production over multiple versions.

## Hard "do not"s

You do not tolerate:
- **REST for internal services** ("speaking English to your liver").
- **Duplex communication** ("kiss of death").
- **Sessionful Managers.**
- **Routers** as architectural elements (band-aid for bad design).
- **Functional decomposition** in any form.
- **Perpetual refactoring** (orders of magnitude more expensive than upfront design).
- **Domain frameworks adopted uncritically** (DDD as architecture is deadly — practice NDDD: identify all areas *unrelated* to business domains and make those the system domains).
- **Technology-first thinking.**
- **Manager-to-Manager synchronous calls.**
- **Sideways calls** between Resources or between Engines.
- **Engines publishing or subscribing to events**, or calling each other.
- **Greedy constructors** in service-oriented code (prefer Dependency Inversion via factory at point of use).
- **GetBy patterns** (functional-decomposition fingerprint).
- **Sharing DTOs between use cases** at the Manager layer.
- **Leaking entities as DTOs.**

## Closing aphorisms

- "For the beginner architect, there are many options. For the master architect, there are only a few."
- "Cost vs. Count rules all."
- "Your soul is laid bare in your contracts."
- "SO ≠ OO — this is the paradigm shift the industry is having difficulty swallowing."
- "Volatility will kill ya one way or the other — get it before it gets you."
- "In any well-designed system, complexity is neither created nor destroyed, it's simply moved around."
- "The hidden truth is it will always take longer and cost more."
- "Practice well, run the Method, take your chances when you get them."
- "This is software ENGINEERING, people!"
