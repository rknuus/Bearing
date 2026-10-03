# The Business-Rules Registry (`business-rules/1`) and World Seed (`world/1`) formats

**Status:** the design note ADR-043 §6 calls for, reconciled to **ADR-044** (the
LLM-authored pivot, #421) and **ADR-046** (in-mockup rules review): the single source for
the shapes of the **business-rules registry** — the mockup's **explanation + verification
fuel**: the explain overlay renders rules-fired + provenance from it, and `bpm-verify`'s
oracle derives its expectations from it — and of the **world seed** the authored app
seeds from. It is **not a separately reviewed artifact** (ADR-046: rules review happens
*in the mockup* — explain mode + the coverage panel) and **not interpreter input**
(ADR-044: the mockup is authored vanilla-JS application code). The file is **extracted
from the blessed app by default**; authoring it first remains allowed. The ADRs fix the
decisions; this note fixes the shapes. Same strict YAML-subset regime as
`si-binding-format.md` / the feasibility sidecar: two-space indent, one field per line in
the documented order, inline `[lists]` and `{ maps }`, `#` comments; the strict parser is
the format validation.

**The load-bearing non-goal (ADR-043 §3, review note b):** the registry, the world seed,
and the v2 rule engine are **design-stage instruments — never imported into production
code.** The real system derives from the model + the Specification-stage spec layer; Specification
formalizes *from* these artifacts (candidate rule data, ADR-037 §4 extended), re-verifying
with the stakeholder. Anything that would `import` the registry from production code is a
design violation, not a shortcut.

**Who authors what:** theagent2 tooling owns these formats, the conformance/walklog
**overlay library**, and the **verification harness** (`bpm-verify`, whose expectation
oracle is the salvaged ADR-043 engine — ADR-044 §§4/6). The project's **Design-stage conduct
session authors the actual `business-rules.yaml` and `world.yaml`** from the ratified
material, and LLM-authors the mockup builds themselves (the Mockup-stage spike from Intent
material with a mandatory invented-decisions log; the Blueprint build from registry + model)
— tooling ships only synthetic test fixtures.

## `business-rules.yaml` (`business-rules/1`)

Location: `docs/02_Business/08_Business-Rules/business-rules.yaml` (per project;
`world.yaml` sits next to it). Presented and blessed at Blueprint.

```yaml
format: business-rules/1
system: Widgets

rules:
  # one entry per ratified behavioral rule; provenance MANDATORY
  - id: BR-001                        # ^BR-\d{3}$, unique, ascending
    type: flat-fee                    # from the closed type set below
    when: [ { path: order.effectiveChannel, op: eq, value: delivery } ]
    params: { amount: 4.00, label: "Delivery fee" }
    provenance: "Interview 2026-07-13: '4.00 fee (delivery only)'; kept on BP07 driven-trip conversions per QA-013, dropped on BP10 undriven."

  - id: BR-002
    type: percent-discount
    when: [ { path: customer.starred, op: eq, value: true } ]
    params: { percent: 10, appliesTo: goods, label: "Regular's discount" }
    provenance: "Interview 2026-07-13: 'starred regulars 10% off the goods, never the fee'."

pipelines:
  # ordered composition where the ratified rules compose (ADR-043 §2)
  - id: PL-pricing
    stages: [ subtotal, BR-002, BR-003, BR-001 ]   # `subtotal` is the one built-in stage
    provenance: "Pricing order ratified across the BP01 read-back examples (walklog BP01-P06)."

effects:
  # what each SI DOES to the store — the behavioral half of the map's narrated emits
  - si: SI01.05
    effect: append
    target: orders.current.lines
    fields: { item: $form.item, qty: $form.qty, price: $store.catalog[item].price }
    provenance: "SI01.05 CaptureOrderItem — activity diagram + walklogs (BP01)."
```

### Entry fields, in order

- **rules[]**: `id`, `type`, `when` (optional), `params`, `provenance` (mandatory);
  boundary-bearing types may additionally carry `inclusive` + `realizedBy`
  (Design-stage/D enrichment — see below).
- **pipelines[]**: `id` (`^PL-[a-z-]+$`), `stages` (inline list: `subtotal` or `BR-###`
  refs — every ref must exist), `provenance`.
- **effects[]**: `si` (bound `SIxx.yy`; must exist in the Sequence Map), `effect` (closed
  set below), `target` (store path), `fields`/`params` per type, `provenance` (the SI/BP
  the behavior comes from — the traceability chain).

### The closed rule-type set (v2.0.0)

The closed set is the registry's schema and the **verification oracle's** vocabulary: the
oracle (the salvaged domain-blind engine, ADR-044 §4) computes expected amounts, verdicts
and mutations from these entries generically — zero domain constants, zero domain
conditionals — and the authored app must **agree with it** under `bpm-verify` (independent
derivations: LLM authoring vs. mechanical interpretation). A ratified rule that fits no
type weakens the harness to replay-only for that rule until the type set is extended — a
plugin version bump (the type-set-creep tripwire, ADR-043 review note c / ADR-044: if this
set grows past a handful, Step 8 hears it).

**The tripwire has fired once, and the set did not grow.** A conducted run ratified a rule
no type could express — *an order acquires the delivery minimum and the discount rate it
was completed under and keeps them for its whole life* (#778, ledger entries
QA-025/026/028 of the run that hit it). The
extension ruled for it (SA, 2026-08-23) was **per-order parameter indirection**, below:
a rule's numeric figure may be read off the record rather than held by the house. It
needs **no eighth rule type and no sixth effect type** — the stamp is written by the
ordinary `update` effect — which is why it was preferred to a new `pinned-parameter`
type. That run's own registry was *not* re-encoded: the run is closed and stands
as prose plus replay-only for this rule.

| type | params | semantics |
|---|---|---|
| `flat-fee` | `amount`, `label` | adds a labeled amount line when `when` holds |
| `percent-discount` | `percent`, `appliesTo` (item class \| `all`), `label` | percentage off the matching subtotal when `when` holds |
| `threshold-check` | `min`, `of` (stage ref: `subtotal`, the running `total`, a prior `BR-###`, or a context path), `label` | non-mutating verdict `under`/`met` — drives UI (e.g. suggest add-ons), never blocks |
| `counter-flag` | `countOf` (store path), `atLeast`, `label` | raises a flag/banner when the count reaches the threshold |
| `timer-alert` | `afterMinutes`, `from` (timestamp field), `while` (predicate list), `label` | raises an alert when the session clock passes `from + afterMinutes` while the predicate holds |
| `membership-verdict` | `of` (field), `setRef` (world data ref), `label` | verdict `in`/`out` against a world-defined set (e.g. delivery zone) |
| `flag-verdict` | `path`, `label` | surfaces a boolean store flag as a verdict (e.g. out of stock) |

### Per-order parameter indirection (`business-rules/1.1`, #778)

A rule's **numeric figure may be carried on the record** instead of held by the house.
Written in place of the literal:

```yaml
  - id: BR-003
    type: threshold-check
    when: [ { path: order.channel, op: eq, value: delivery } ]
    params: { min: { from: order.carriedMin, default: 18.00 }, of: subtotal, label: "18.00 delivery minimum" }
    inclusive: at-or-above
    provenance: "…the order is judged against the minimum it was completed under (QA-026/028)…"
```

- **`from`** is a context path — `order.*`, `customer.*`, `item.*`, `world.*`, the same
  roots the predicates resolve in. **`default`** is the house figure, applied while the
  record carries nothing there (absent *or* null: the unstamped draft, which the
  predicate language has no is-absent operator to test).
- **Only numeric figures may be indirected**: `amount` (flat-fee), `percent`
  (percent-discount), `min` (threshold-check), `atLeast` (counter-flag), `afterMinutes`
  (timer-alert). `of`, `countOf`, `setRef`, `path`, `appliesTo` and `label` name things,
  and a name is not a figure a record can carry.
- **The stamp is written by the ordinary `update` effect** with a literal field, on the
  interaction that attaches it (`fields: { carriedMin: 18.00 }` at the completing SI).
  No new effect type; the record's own figure then rides through every later
  re-computation without any rule knowing when it was attached.
- **A registry using the shape declares `format: business-rules/1.1`.** That version
  string is the whole compatibility mechanism, and it is why the extension is a
  *compatibility event*: a verifier or checker that predates indirection reads
  `{ from, default }` where it expects a number, so it must refuse the file rather than
  price the rule at `NaN` — and it does, on the format line. Registries that use no
  indirection stay `business-rules/1` and are read by both. Minimum versions:
  **screen-dsl ≥ 1.10.0** (engine + `bpm-verify`), `TheAgent.Spec.Lint` since #778.
- `bpm-verify` **WARNs when no record in the whole run carried a figure of its own** —
  app and oracle agreeing while everything reads the default verifies the house figure
  twice, not the carriage.

### Boundary enrichment (`inclusive` / `realizedBy`) — Design-stage/D, spec-lint (#536)

The **boundary-bearing** rule types — `threshold-check` (`min`), `counter-flag`
(`atLeast`), `timer-alert` (`afterMinutes`) — may carry two additional OPTIONAL keys,
consumed by the ADR-033 §5 masking-class checker (`spec-lint`), which requires every
ruled threshold to have a visible spec case pinning the exact-equality input:

```yaml
  - id: BR-003
    type: threshold-check
    when: [ { path: order.channel, op: eq, value: delivery } ]
    params: { min: 15.00, of: subtotal, label: "15.00 delivery minimum" }
    inclusive: at-or-above          # which side equality falls on — transcribes the gate ruling
    realizedBy: [ { si: SI01.06, operation: VerifyMinimumReached, field: Subtotal } ]
    provenance: "…"
```

- **`inclusive`**: `at-or-above` | `above-only` (for maxima: `at-or-below` |
  `below-only`) — pins which side of the boundary the equality input lands on. This is
  a *transcription* of a gate ruling (name it in `provenance`), never a new decision.
- **`realizedBy`**: list of `{ si, operation, field }` sites — the model operation(s)
  whose request/response field carries the boundary value, joining the rule to the
  spec layer's case surface. Added in Design/D once the model exists (the registry
  itself is blessed at Blueprint, *before* any model); re-presented at Contract.
- **`form`** on a site (optional, default `literal`) — HOW that field expresses the
  boundary. Ruled 2026-08-17 (D1) after a conducted run measured the literal-only form
  too narrow: of one family's four boundary-bearing rules, one fitted it and three
  could not.

| `form` | the site also carries | what the checker verifies |
|---|---|---|
| `literal` | — | a visible case's field literal EQUALS the boundary (a delivery minimum) |
| `delta` | `from` | the boundary is a DURATION and the field an ABSOLUTE position, so the pinned value equals `from + boundary`. `from` reads either as a number (minutes since midnight, e.g. `1110`) or as a clock literal (`"2026-07-17T19:30:00"`) for a field typed `DateTime` — same arithmetic, two representations (#539) |
| `derived` | `pinnedBy` | the boundary lives on no field at all (a relationship between params, or a value computed inside an Engine), so the site NAMES the visible case that pins it and the checker verifies that case exists, is visible and stimulates the operation. A join, not a waiver — deleting, renaming or withholding the case turns the rule red — but it cannot verify the named case pins the boundary *correctly* |
| `carried` | `pinnedBy` + `value` | #778's shape, for an INDIRECTED boundary: the figure is read off the record, so pinning the house `default` says nothing about the carriage. The site names the visible case that judges a record against a figure of *its own* and states that figure; the checker verifies the case exists, is visible, stimulates the operation **and pins that literal at the site's field**. Stronger than `derived`: there is a literal to compare, it is just not the house's |

  A `delta` site without `from`, a `derived` site without `pinnedBy`, or a `carried` site
  without both `pinnedBy` and `value`, is refused outright rather than quietly downgraded
  to `literal`. A `carried` site on a rule whose param holds a plain literal is refused
  too — no record carries a figure there.

  **An indirected boundary owes BOTH halves**: the house `default` pinned by an ordinary
  literal site, *and* one `carried` site. With only the house half, `spec-lint` reports
  `BoundaryUnjoined` naming the carried path — a case surface where every order is judged
  at today's figure never exercises the ruled carriage.

Both keys are additive and IGNORED by the Blueprint harness (`bpm-verify` validates
required keys only), so the format string stays `business-rules/1`. A
boundary-bearing rule *without* them is legal at Blueprint and becomes a `spec-lint`
finding (`BoundaryUnjoined`) at Contract entry — the enrichment debt is mechanical,
never silent.

### Predicates (`when` / `while`)

AND-list of `{ path, op, value }`; `op` ∈ `eq | ne | gt | gte | lt | lte | in | has`.
Paths resolve into the evaluation context: `order.*`, `customer.*`, `item.*`, `world.*`.
No expressions, no OR (write two rules), no nesting — the review surface stays flat.

### The closed effect-type set (v2.0.0)

| effect | semantics |
|---|---|
| `create` | new record pushed into the `target` collection (`fields`; record identity rides the fields — keyed upsert is a type-set extension when a ratified rule needs it) |
| `append` | new entry in a `target` list (`fields`) |
| `update` | mutate the record at `target` — a plain dotted path to a singleton record, not a list-element selector (list-element addressing is a type-set extension) |
| `set-flag` | set `value` (default `true`) at the `target` path |
| `query` | read-only view data (no mutation) |

Field sources: `$form.<field>` (the invoking action's form input), `$store.<path>`,
`$rule.<BR-###>` (a rule's computed amount/verdict), `$clock` (the session clock).

## `world.yaml` (`world/1`)

The authored seed for what the approved walkthroughs don't cover — reviewed like every
hand-file; per-section provenance.

```yaml
format: world/1
system: Widgets
provenance: "Catalog and zone from the interview record 2026-07-13; accounts synthetic-plausible under simulation waiver 2."

catalog:
  - item: "Hex widget, brass"
    price: 16.50
    class: goods
    special: false
    outOfStock: false

zones:
  inZone: [ "Northside", "Riverside" ]          # membership-verdict setRef target

customers:
  - name: "L. Marsh"
    phone: "555 01 23"
    starred: false
    blackMarks: 0

clock: { start: "18:00" }                        # the simulated session clock's origin
```

## The authored build, the overlay, and verified conformance (ADR-044 §§3–5)

There is **no generator for the mockup**: the app is LLM-written vanilla-JS application
code — the Mockup-stage spike from the Intent material (invented-decisions log mandatory,
feeding the Q&A ledger), the Blueprint build from **this registry + the model**, with actions
keyed to bound SI ids. The authored app:

- **seeds from `world.yaml`** (authoritative for its collections and the clock start) and
  may surface exemplars from the approved walklogs; the runtime **session clock** starts
  at `world.clock.start` and is user-advanceable (how `timer-alert` rules are exercised
  interactively, deterministically);
- **includes the conformance/walklog overlay library** (the one generic runtime piece):
  it registers the app's store and `invoke(SI, form)`-shaped entry points, observes real
  interactions against the bound Sequence Map (ADR-037 §3 forgiving mode), data-infers
  branch decisions (ambiguity marked for the scribe, never guessed), and exports the walk
  log (`candidate: true`) — the walklog/replay/`--gate` toolchain is unchanged;
- runs `file://`, zero backend, zero external systems (the §1 bar).

**Determinism is verified conformance, not byte-regeneration (ADR-044 §5):** authored
code is not byte-regenerable, so a rebuild (or a registry/model change) is good when
**`bpm-verify` is green and the approved logs replay green** — never when bytes match.
`bpm-verify` *(tooling in progress on the v2 branch, with the overlay library)* derives
headless behavioral assertions from the registry entries and checks the authored app
against the **expectation oracle** — the salvaged domain-blind engine computing expected
amounts/verdicts/mutations from the same entries the author wrote from; app and oracle
derive independently and must agree. Staleness therefore surfaces as **red checks, not
byte diffs** — the accepted trade, friction-watched. The v1 walker remains available as a
dev/authoring flag only — **not capture-grade** (contract §11); it must not face a
stakeholder. Registry, world, maps, and the oracle keep the strict byte/`--check` regime
unchanged.

## Validation (harness-side, fail-loud)

`bpm-verify` validates the registry/world shapes before deriving assertions: unknown
`type`/`effect`/`op`; missing `provenance`; `stages` referencing unknown rules;
`effects[].si` absent from the map; `setRef`/store paths absent from the world/store
shape; duplicate or non-ascending `BR-###` ids; a `when` path outside the context roots.
The strictness is the review guarantee — a registry that validates is a registry whose
shape is checkable, leaving Blueprint review to the one question that needs a human: *does
each entry match its ratified statement?*
