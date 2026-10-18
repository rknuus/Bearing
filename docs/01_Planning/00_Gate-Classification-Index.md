# Bearing v2 — Gate Classification Index

> **What this is.** The Software Architect, who is also Bearing's domain expert and its only
> stakeholder, sketched Bearing v2 before the factory was available. His input therefore does not
> arrive as interview transcripts but as five authored design documents — this project's recordings
> (QB-01), the fifth of them authored for him from his own statements because the other four are
> silent on activities. This index records how every piece of that input was classified across the
> Diamond Process's four gates (ADR-040 §1, ADR-064 naming), and points at the four gate documents
> that hold the classified material.
>
> **Stage.** Discovery / Mockup, before the Intent gate. Nothing here is const.

## The four gates (ADR-040 §1)

| Gate | Freezes | Reviewer | This project's document |
|---|---|---|---|
| **Intent** | BPMNs + SIs, screen models, approved walkthroughs (+ example data), the business map | stakeholder + Software Architect | [`01_Intent_Gate-Document.md`](01_Intent_Gate-Document.md) |
| **Blueprint** | the architecture model: components, contracts, DTOs, sequences, activity diagrams | human (after blind peer review) | [`02_Blueprint_Gate-Document.md`](02_Blueprint_Gate-Document.md) |
| **Contract** | the spec layer (ADR-033 §7B) + deployment decisions (ADR-071) + resource protocol sheets (ADR-059) — the last human review before acceptance | human | [`03_Contract_Gate-Document.md`](03_Contract_Gate-Document.md) |
| **Acceptance** | the verified system | human (+ ui-designer sampling) | [`04_Acceptance_Gate-Document.md`](04_Acceptance_Gate-Document.md) |

Alongside the four, [`12_Action-Surface-Map.md`](12_Action-Surface-Map.md) maps every user action to
the surface it is performed on and the business process that draws it — a review instrument over
the Intent document, not intent of its own, and the place the completeness check against the
drawings is recorded.

Alongside the four, [`14_Parked-Functionality.md`](14_Parked-Functionality.md) holds capability
the Software Architect has set aside: carried into the architecture so the decomposition can absorb
it later, and neither detail-designed nor implemented.

Alongside the four, [`05_UX-Directives.md`](05_UX-Directives.md) holds surface decisions the Software
Architect has already made. It is not a gate document and no gate freezes it: the Intent gate's rules
are about behaviour, the Acceptance gate's brief is about craft, and a decision about *which control,
where* belongs to neither. It is a holding pen until the screen models exist to absorb it.

## Sources

| Source | Cited as | Lines | Role |
|---|---|---|---|
| `sources/funnel.md` | `funnel §…` | 346 | The basic idea of the rewrite — the five-stage funnel, the linking model, the stage semantics |
| `sources/architecture.md` | `arch §…` | 465 | The foreseen IDesign decomposition, the pivots, and 11 parked questions |
| `sources/ui-inventory.md` | `inv` | 67 | Hierarchical inventory of UI surfaces at view/dialog level |
| `sources/ui-wireframes.md` | `wf §…` | 2226 | ASCII wireframe + design notes per surface, plus 19 cross-document UX guidelines |
| `sources/activity-planning.md` | `act §…` | 566 | Not authored by the Software Architect — written for him from his statements over nine interview rounds, every line marked SA or INFERRED. Projects, the Course page, activities and their dependencies, and the scoping of Löwy's project design down to what a single-person tool can use |
| `tmp/Bearing-v1/` | — | — | The predecessor app (Go + Wails + Svelte). Design provenance only; v2 is a separate codebase (wireframes guideline #18). |

**Reading a citation.** The four gate documents cite their source inline by the prefix above plus the
source document's own heading number — so `wf §5.1.a` is the wireframes' "Day mode" sub-section,
`arch §12 Q9` is question 9 in the architecture document's parked-questions table, and
`funnel §Day rollover` is a heading that carries a name rather than a number. `inv` takes no section
number: the inventory is one flat list. A citation never points at a line number, so it survives the
source being edited.

The source paths above are relative to this directory: the sources live in
`docs/01_Planning/sources/` and are committed — they are this project's substitute for the
interview transcripts `docs/01_Planning/` is meant to hold, and the only record of the business
intent. Keeping them in the repository satisfies ADR-051 §3, which requires every path a gate dossier
claims to exist under the project root.

> ⚠ `tmp/Bearing-v1/` is not in the repository — `tmp/` is git-excluded
> (`.git/info/exclude`). Nothing in the business design depends on it: it is cited as provenance for
> inherited UI patterns only, never as a constraint (wireframes guideline #18). No gate artifact may
> claim a path under `tmp/`.

## Classification rule

Each unit of source information was assigned to the gate whose artifact class it belongs to, not to
the gate where it happens to be convenient:

1. **Intent** — anything a stakeholder can confirm or refute without knowing how the system is built:
   the funnel, the entities as *business vocabulary*, business rules and invariants, the screens and
   their states, the flows, the example data, the operational constraints on the product.
2. **Blueprint** — anything about *how the system is built*: components and their volatilities,
   contracts, DTOs, operations, sequences, transaction and call-chain rules, on-disk schema (the
   Access's secret).
3. **Contract** — anything that turns a rule into an *executable expectation or a technology
   commitment*: concrete thresholds and error texts, idempotency properties, failure contracts, seed
   rows, UI anchors, the resource products and the hosting shape.
4. **Acceptance** — anything only judgeable on the *running system*, especially the UI craft that has
   no mechanical oracle: focus behaviour, animation, hit targets, visual conventions, and the
   end-to-end flows as acceptance criteria.

Where one source paragraph carries two layers, it was split, and both halves are cross-referenced.
Example: the advisor suggestion catalog's *policy* ("the advisor may not archive on the user's behalf")
is Intent; its *schema* (`type`, `target_id`, required fields per type) is Contract.

## Coverage ledger — every source section is classified

### `funnel.md`

| Source section | Gate(s) |
|---|---|
| Purpose; Mental model (5 stages × horizon × volatility) | Intent |
| Tab structure; Why 5 tabs and not 4 | Intent |
| Linking model — Graph A (funnel order) | Intent |
| Linking model — Graph B (data references); Entity reference fields | Intent (vocabulary + relationships) · Blueprint (field-level shape → DTOs) |
| Linking rules; tag uniqueness; tag normalization rule | Intent (rules) · Contract (normalization algorithm + messages) |
| Goal ↔ Task indirect by design | Intent |
| Deletion cascade rule | Intent |
| Stage 1 Themes; Vision & Mission | Intent |
| Stage 2 Ideation | Intent |
| Stage 3 Goals; OKRs deliberately flat | Intent |
| Stage 4 Focus; Day/Week/Month/Year; Day rollover | Intent |
| Stage 5 Execution; Eisenhower in Backlog; three sections, no Q4 | Intent |
| Archive and check-out flows | Intent |
| Routines (definition vs. selection, editor fields, entry points, card summary) | Intent |
| UX principles for the funnel (6 items) | Intent · Acceptance (#2 chevrons, #6 colour propagation as sampling criteria) |
| What this replaces in current Bearing | Intent (v1 → v2 scope delta) |

### `architecture.md`

| Source section | Gate(s) |
|---|---|
| §1 Project framing; daily hot path | Intent (hot path = the primary flow) · Contract (stack: Svelte + C#) |
| §2 Non-functional invariants (journaling, atomicity, optimistic UI, uniform envelope) | Blueprint · Acceptance (verifiable properties) |
| §3 Volatility map | Blueprint (harvest consumed at Design) · Intent (recorded as the Discovery side-channel) |
| §4 Service taxonomy (3 M / 4 E / 2 RA / 1 U) + naming rationale | Blueprint |
| §4 Two-tier model; DocumentTypeRegistry; path schemes | Blueprint (Access secret) · Contract (resource protocol sheets) |
| §4 Utility (iFX) | Blueprint |
| §5 Pivots 1–5 + Authority axiom | Blueprint |
| §6 Closed-architecture rules | Blueprint |
| §7 Pseudocode convention; implicit op-log append | Blueprint |
| §8 S1, UC1–UC5, DeleteColumn, saga audit | Blueprint |
| §9 Cross-cutting patterns (scheduling, cascade, optimistic UI) | Blueprint · Contract (properties) |
| §10 Column property model | Blueprint · Intent (role vocabulary + consequences are user-visible) |
| §11 Settings & configuration (none) | Intent (no settings) · Contract (hardcoded defaults, OS paths) |
| §12 Open questions Q1–Q12 | split per question — see the table in `02_Blueprint_Gate-Document.md` §8 |
| §13 Doc gaps surfaced | Intent (two of three are business-doc gaps) |
| §14 Total service count | Blueprint |

### `ui-inventory.md`

| Source section | Gate(s) |
|---|---|
| App shell; per-tab view and dialog inventory | Intent (screen model inventory) |
| Cross-cutting: Advisor panel, Empty states, Loading/error states, New-data-folder dialog, Archive, Window size, Focus management, References/conventions, Multi-select out of scope, Onboarding, No Settings, About, Shortcuts | Intent (the surfaces exist and what they are for) · Acceptance (the craft rules) · Contract (the schemas and failure contracts) |

### `ui-wireframes.md`

| Source section | Gate(s) |
|---|---|
| §1 App shell | Intent · Acceptance (44×44 targets, colour-not-only-signal) |
| §2 Themes tab (2.1–2.5) | Intent |
| §2.4 Delete confirmation — per-entity consequence/cascade table | Intent (policy) · Contract (exact copy + reject behaviour) |
| §3 Ideation (3.1, 3.2 incl. Tag-field UX four states) | Intent (surface + rules) · Contract (validation states, messages) |
| §4 Goals (4.1–4.4) | Intent · Contract (auto-infer thresholds, carry-forward field-level rules) |
| §5 Focus (5.1.a–d) | Intent |
| §6 Execution (6.1–6.4) | Intent · Contract (board-visibility predicates, day-checkout predicates) |
| §7.1 First-run onboarding | Intent |
| §7.2 Settings view (there is none) + Bootstrapping steps 1–5 | Intent (no settings) · Contract (OS paths, git init) · Acceptance (bootstrap paths) |
| §7.3 About dialog | Intent · Acceptance |
| §7.4 Keyboard shortcuts dialog | Intent (the dialog) · Acceptance (the keymap) |
| §7.5 Advisor panel; resolved states; supersession; what the advisor knows | Intent (policy + surface) · Contract (supersession invariant) |
| §7.5 Suggestion catalog (common shape, catalog table, per-type semantics, validation) | Contract (schema + fallbacks) · Intent (which types exist and which are excluded) |
| §7.6 Empty states (6 surfaces) | Intent · Acceptance (the shape rule) |
| §7.7 Loading and error states (9 patterns) | Contract (failure contracts) · Acceptance (visual behaviour) |
| §7.7 New-data-folder notification | Intent (the decision is the user's) · Acceptance (bootstrap path) |
| §7.8 Archive — model and views | Intent · Contract (filters, default sorts) |
| §7.9 Window size and responsive policy | Acceptance · Intent (desktop-only is a product constraint) |
| §7.10 Focus management (universal rules, landing table, trapping, tab order) | Acceptance |
| §7.11 Glyph reference, naming conventions, date formats, check-out pattern, no multi-select | Acceptance (conventions) · Intent (no multi-select is a scope decision) |
| Cross-document UX guidelines #1–#19 | Acceptance (#1–5, 9–15, 17, 19) · Intent (#6–8, 16, 18) |

## State of the material, by gate

| Gate | Material available now | Principal gaps |
|---|---|---|
| **Intent** | Substantial — the funnel, 121 business rules, the full screen inventory with wireframes and states, a coherent example dataset, and all nineteen business processes drawn with their 79 call sites minted | No activity diagrams per call site; no System Interactions (their ids mint at Design, ADR-069); no screen models in the project's own format; no business map / price tags; no behavioural spike; no walkthrough capture; no Q&A ledger |
| **Blueprint** | Substantial for a pre-Intent stage — 10 services, 5 pivots, 6 use cases drawn, the closed-architecture rules | Model not in the `.method` store; most operations undrawn; 4 sagas named but undrawn; 11 parked questions; several contradictions against the business docs (see §9 of the Blueprint document) |
| **Contract** | Fragmentary but real — stack intent, resource slots, concrete thresholds, failure contracts, seed-data candidates | Advisor product undecided (Q9); no deployment-decision rulings; no resource protocol sheets; no spec layer |
| **Acceptance** | Rich on UI craft — 19 guidelines, the focus-landing table, the keymap, the glyph and naming conventions, the responsive policy | No acceptance criteria written against blessed flows (they depend on the walkthroughs); visual sampling not yet briefed |

## Open questions raised by the classification

The classification surfaced 47 business questions (`QB-01`…`QB-47`) and nine contradictions between
the source documents (`C-1`…`C-9`). **No question is open:** `QB-44`, whether a project may migrate
between its simple and activity-based kinds, was answered *no* on 2026-10-10, and `QB-45`, how the
board strip folds, is re-filed to the screen models as a UI question, so nothing at the Intent gate
waits on it. Every
other question is answered and every contradiction is resolved; each answer is recorded with the
question. The classification also re-filed `architecture.md`'s eleven parked questions across the
gates. They live in:

- `01_Intent_Gate-Document.md` §12 — business tier, Q&A-ledger candidates
- `02_Blueprint_Gate-Document.md` §8 — design tier, incl. Q1–Q12 re-classified
- `03_Contract_Gate-Document.md` §2 — deployment tier (`DV:<slot>`, `DV:hosting` per ADR-071)

None of these are in `Bearing.method/qa.yaml` yet: the ledger does not exist. Creating it and
appending the business-tier entries is the next mechanical step, because `qa check` enforces "no open
Q&A-ledger entry blocking a promoted element" at the Intent gate.
