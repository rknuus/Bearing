# The SI Binding Map format (`si-binding/2`)

**Status:** the design note ADR-041 and issue #411 call for — the single source for the
binding map's shape. Consumed by `seqmap complete` (the model↔BPMN completeness checker,
ADR-041 §3) and the enriched Sequence Map regeneration (#412).

> **ADR-069 (2026-09-02, #1196) — `si-binding/2`. This file is the JOIN between two
> populations.** A **call site** (`BP07.03`) is the system chain a business process
> draws — the block, however it is started (a step's send, a timer, the scheduler, a
> cross-process continuation); a **System Interaction** (`SIxx.yy`) is the operation on a Manager facet that the
> system offers. **Many call sites resolve to one System Interaction**, and the resolution is
> discovered during Design — because reuse is not visible from a first drawing. The file
> therefore has two sections with two owners: `interactions:` (what the system offers, and how
> the model realizes it) and `callSites:` (which drawn block resolves to which interaction).
> Re-pointing a call site is a one-line edit here and rewrites nothing anywhere else.
>
> **Deleted by ADR-069:** the `aliasOf` record. It existed only because one identifier carried
> both jobs — a repair for an identity minted before the information to mint it existed. A second
> `callSites` row on an existing interaction, with its mandatory `rationale`, states the reuse
> directly and at the stage where it is true. **`reuse.yaml` is NOT deleted** — see § Semantics.

> **ADR-066 (superseded by ADR-069): this file is not a rename map.** That still holds and is
> not weakened: nothing here rewrites an id in any source. The `provisional:` list stays
> deleted, `seqmap rebind` stays deleted, and walkthrough logs still need no id translation —
> they are recorded against call-site ids, which never expire.

> **ADR-068 (2026-09-02, #1182): the binding covers the whole block.** Per **call site**,
> every **box** binds to what realizes it in the model (`boxes:`) and every **system-side send**
> binds to the call or event that carries it (`sends:`). ADR-069 moved these from the interaction
> to the call site: a union over blocks that legitimately differ has no drawing order, and drawing
> order is what the generated sequence is built from. The model's use-case sequence is then
> **generated** from block × binding (`seqmap sequence`), never hand-authored, and `seqmap
> complete --si <si-export dir>` holds the result to the block ([C14]/[C15]).

## Purpose

One **architect-authored** YAML file per project recording two different things:

1. **`interactions:` — what the system offers.** Per System Interaction: the use-case name it
   settled on. That is all: the operation is declared on the model use case (ADR-067 §1), and the
   realization declarations belong per block, below.
2. **`callSites:` — which drawn block resolves to which interaction, and which PERMUTATION of it
   the block exercises.** The many-to-one map, plus the ADR-068 realization declarations for that
   block (`boxes:`, `sends:`, `edges:`). This is the section that moves while Design iterates, and
   moving it is the cheapest edit in the process: no drawing, no screen model, no mockup key and
   no walkthrough log changes when a call site is re-pointed. (A re-point *can* require a model
   edit — a new interaction needs a use case, and an interaction losing its last call site is
   `[C9]`.)

**Binding is two decisions per call site** (ADR-069 §3): *which System Interaction does this block
resolve to*, and *which permutation of it does it exercise*. The second is why two call sites on
one interaction may draw different blocks — they call different polymorphic request variants of
one operation, which is the pattern the Method is built on.

Together with the model it is **the record of the facet·operation each System Interaction
resolves to**: the model holds the resolution (use case → permutation → client-hop operation),
this file is the architect's authored side of it, and `seqmap complete` joins the two and stamps
`{component, facet, name}` into the generated Sequence Map. The facet is deliberately **not**
restated here by hand — the model already holds it, and two hand-maintained restatements of one
property eventually disagree (the reason #1148 deleted the `historical:` list).

It is a hand-file (the YAML family, like `qa.yaml`) — never generated, never squashed.

Location: `docs/03_Technology/01_System-Design/si-binding.yaml` (ADR-030 §4 tree — system
design owns the binding; the blessed business tree stays const).

## Shape (by example — illustrative; the real map is authored in Design-stage conduct)

```yaml
format: si-binding/2
system: Widgets

interactions:                       # WHAT THE SYSTEM OFFERS — minted at Design
  - si: SI01.03                     # ^SI\d{2}\.\d{2}$ — no facet meaning, no process meaning
    name: Filter                    # use-case name; = the model use case's --name. The
                                    # operation is declared on the use case itself (ADR-067 §1)

  - si: SI01.01
    name: CaptureOrderItem

  - si: SI02.01
    name: ConfirmOrder

callSites:                          # WHICH DRAWN BLOCK RESOLVES TO WHICH INTERACTION, and
                                    # which PERMUTATION of it the block exercises. This is the
                                    # many-to-one map, and the section that moves while Design
                                    # iterates. The ADR-068 realization declarations live HERE,
                                    # per block: one drawn block realizes one permutation's
                                    # sequence, generated from that block alone.
  - callSite: BP01.02               # ^BP\d{2}\.\d{2}$ — a system chain BP01 draws
    si: SI01.03
    permutation: Filter_ByName      # the model permutation this block realizes, {Base}_{Variant}
    boxes:                          # one declaration per drawn BOX of THIS block (step label,
                                    # verbatim — the si-export is the authority, ADR-068)
      - box: "Check stock"
        realizedBy: { operation: InventoryAccess.Stock.CheckAvailability }   # a component call
      - box: "Reserve the item"                # qualify the ref as far as needed: Operation,
        realizedBy: { operation: Reserve }     # Facet.Operation, or Component.Facet.Operation
      - box: "Note the shortfall"
        realizedBy: { internal: "Note the shortfall" }   # a Manager-own step (ADR-061): the
                                               # value is the model's internal-step label
      - box: "Capture the line"
        realizedBy: { expands: [Sales.CaptureLine, Audit.RecordLine] }   # one business box,
                                               # several model steps
    sends:                            # one declaration per SYSTEM-SIDE send of THIS block
                                      # (message label, verbatim): a hand-off onto another
                                      # system chain (the export's `triggers`), a send to the
                                      # system pool, or a cross-BP continuation (#1167 join).
                                      # Human/blackbox sends bind nothing — they are UI.
      - send: "Trigger reconciliation"
        realizedBy: { operation: ReconciliationManager.Runs.MaterializeProjection }
      - send: "Queue the nightly sync"
        realizedBy: { event: NightlySyncDue }  # an event/queued hand-off, not a direct call

  - callSite: BP02.01               # a SECOND call site on SI01.03: same operation, a DIFFERENT
    si: SI01.03                     # request variant. Its block legitimately differs from
    permutation: Filter_ByLocation  # BP01.02's — that is what a permutation IS.
    rationale: "BP02 filters the same catalogue by location rather than by name — one
                operation, a second request variant."       # MANDATORY on the 2nd+ row
    boxes: [ ... ]

  - callSite: BP01.01               # a block whose OWN gateway selects the variant: no
    si: SI01.01                     # row-level `permutation:`; the edges name them instead.
    edges:                          # one declaration per system-side gateway edge INSIDE this
                                    # block, matched on literal labels
      - gateway: "Delivery order?"  # the .bpd `if` condition, verbatim
        taken: "yes"                # the branch label, verbatim
        realizedBy: { permutation: PriceOrder_Delivery }   # request-variant edge
      - gateway: "Delivery order?"
        taken: "no (pickup)"
        realizedBy: { permutation: PriceOrder_Pickup }
      - gateway: "In stock?"
        taken: "yes"
        realizedBy: { sequence: SQ01.01.01 }   # outcome edge: realized within one modeled
      - gateway: "In stock?"                   # sequence (activity-diagram branch;
        taken: "no"                            # trace-verified at Construction)
        realizedBy: { sequence: SQ01.01.01 }

  - callSite: BP01.03
    si: SI02.01
    permutation: ConfirmOrder_Standard
```

There is **no `historical:` list** (retired by #1148, which subsumed #1055): a call site that
belongs to no live System Interaction says so in its own source — the `.bpd` header carries
`status dissolved -> <Successor> ["reason"]` (or `retired` / `parked`), and every one of that
process's call sites is excluded from the binding inventory by that declaration. A map that
still carries `historical:` is refused with the migration path.

There is **no `aliasOf` record** (retired by ADR-069). Under `si-binding/1` an alias said *two
minted ids name one operation* — a repair for an identity minted before the information to mint
it existed. With call sites and interactions separate, that discovery is two `callSites` rows
pointing at the same `si`, which is the ordinary case rather than an exception. A map that still
carries `aliasOf:` is refused with the migration path.

## Rules (checker-enforced, ADR-041 §§1–2, ADR-069 §§3/6)

Every rule below is an **error** — `seqmap complete` prints it and exits 1 — with one stated
exception, `[C7-shape]`, which it prints and does not fail on (ADR-041 §3a, #1208). A rule is eligible
for that tier only when a **named** downstream gate hard-refuses the same thing; the tier is a
statement about which gate owns a rule, never about how much a finding is worth. For `[C7-shape]`
that gate is **Contract**, and the check is `construction-entry-check` `[S5]` — which asks the real
question this file cannot: whether a DTO with the permutation's exact name is declared in the entry
operation's facet as a variant of that operation's request DTO.

- **Total over the LIVE call-site inventory.** Every call site of a **live** process in the
  tagged `.bpd` set has exactly **one** `callSites` row — plain id equality, no hops. No
  duplicate `callSite`. A row naming a call site no supplied source draws is a dead row (error).
  A call site of a **non-live** process (its `.bpd` header declares `status
  dissolved|retired|parked`, #1148) is accounted for by that declaration and owes no row. A row
  that still names a block of a **dissolved or retired** process is the inverse error (`[C13]`).
  A row naming a block of a **parked** process is **kept** (#1252): parked means drawn,
  deliberately not built, and *revivable*, and the row is the only record of which interaction
  the parked block resolves to — deleting it would turn revival into a rebuild. The parked
  status is **derived from the `.bpd` header on every run**; nothing on the row or the
  `interactions:` entry repeats it (two originals of one fact, #861). Such a row is held to no
  drawing-side check (`[C2]`, `[C5]`, `[C14]`/`[C15]`, `[C16]`) and is never generated
  (`sequence` refuses it by name); it counts only on the interaction side, below. What it parks
  reaches Construction through the enriched map's `parkedInteractions` (`seqmap-format.md`):
  `theagent2 scaffold --seqmap` leaves the use case out and `construction-entry-check --seqmap`
  does not ask it for a variant DTO (#1256).
- **Injectivity is DROPPED (ADR-069).** Many call sites resolving to one `si` is the normal case,
  not a collision. What replaces it: every `si` named by a `callSites` row has exactly one
  `interactions` entry; no duplicate `si` **within `interactions:`**; no duplicate `name`. And the
  **reverse** check — an `interactions` entry that **no call site resolves to** is a use case
  beyond the business design (`[C9]`): the system would offer an operation nothing asks for.
  An entry resolved to **only by rows of parked processes** is the same question with a
  different answer — something asks for it, the asker is just not being built now — and is
  reported as **`[C9-parked]`**, a standing **warning** naming the parked process(es) that revive
  it, never an error (#1252). It becomes the `[C9]` it then is the moment those rows go.
  **The MODEL can exempt an interaction from this rule, and only the model can (#1320):** a use
  case declaring `lifecycle: future` (decided, deliberately deferred) or `lifecycle: retired`
  (decided AGAINST, kept as a record, its id never re-minted) raises no `[C9]` — at either
  granularity — because the emptiness the rule infers a defect from is *declared*. The
  `interactions:` entry gains **no key** for this: the lifecycle is read from the model, keeping
  one original of the fact (#861). The exemption is printed on every run and named on the summary
  line, never taken silently, and it has one hard constraint: a **live** call site resolving to
  such an interaction is `[C9-notbuilt]`, an **error** — a process being built cannot ask for an
  operation the design is not building. A *parked* row resolving to one is fine: that is two
  halves of the same decision.
- **EVERY call site carries its own full realization declarations** (ADR-069 §3). There is no
  designated authority and no shared copy: a single generating row would leave the others silently
  empty or silently stale, with nothing able to tell "points elsewhere" from "nobody filled it in".
  The redundancy is deliberate and is made checkable instead.
- **`[C16]` — two call sites on the same `(si, permutation)` must draw the same activities, byte
  for byte.** Same operation, same request shape, therefore the same activities. A divergence is a
  design finding with exactly two honest resolutions: harmonize the two drawings, or mint the
  second permutation the design has actually got. The error names **both sides** and the
  activities that differ — the reader is handed the disagreement, not a verdict. Equality is
  **never** required across one *interaction*: different permutations of one operation ought to
  draw differently, and demanding otherwise would forbid the polymorphic request-DTO pattern.
- **A call site names exactly one permutation, or its block's gateway names them.** Exactly one
  of the row's `permutation:` and a request-variant `edges` entry (`realizedBy: { permutation: … }`)
  must be present. Both is a contradiction — the row says "always this variant", the gateway says
  "it depends". Neither leaves the sequence ungenerable. Every named permutation must exist under
  the row's `si` in the model — `[C7]`, an error — and be named `{Base}_{Variant}` per the
  scaffolder contract — `[C7-shape]`, a **warning** (#1208). The two are one sentence and two
  severities on purpose: existence is what this check owns, and the shape is the
  Construction-stage scaffolder's contract, which the scaffolder itself refuses at Construction
  and the model itself only warns about (SNS's `PermutationWithoutVariantDto`). `complete`
  reports it on every run and never fails on it; see ADR-041 §3a for the tier and its bar.
- **A permutation no call site exercises is dead**, exactly as an interaction with no call site
  is: the model offers a request variant nothing draws. `[C9]`, at permutation granularity — and
  `[C9-parked]`, a warning, when only parked rows exercise it.
- **Boxes, sends and edges are declared PER CALL SITE**, against that block's si-export. One
  drawn block realizes one permutation's sequence, generated from that block alone (ADR-068 +
  ADR-069 §3). A declaration on the `interactions:` entry is refused with the migration path.
- **A rationale is mandatory on reuse.** The **first** `callSites` row bound to a given `si`
  needs none. **Every subsequent** row bound to that same `si` must carry a non-empty
  `rationale`. Declaring that the system creates nothing new for this arrow is a design finding,
  and it is stated where the finding is made. (This is the job `reuse.yaml` used to do, at the
  stage where it can actually be done.)
- **Call sites bound to one INTERACTION may draw it differently** (ADR-069 §6) — they may be
  exercising different permutations, and then they ought to. Equality is checked one level down,
  per permutation, by `[C16]` above. Where one interaction is drawn by three call sites whose
  blocks visibly differ — a first confirm, a re-confirm after a correction, a re-confirm on
  conversion — under `[C16]` that is not a violation to be waived but a model **missing its
  permutations**, and the check says so.
- **There is no `si: none`.** A drawn block the system does not realize is a business-design
  finding and a change-loop re-entry, not a disposition expressible here. `[C2]` fails it
  deliberately. Only the `.bpd` header's `status dissolved|retired|parked` (#1148) takes a whole
  non-live process out of the inventory.
- **`system:` is compared against the `.bpd` sources' system pool**, not against the model's
  `projectName` — the binding map is a statement *about the drawn business design*, so the
  drawings are its authority. The sibling format under the same tree keys its own `system:`
  differently: `deployment-view.yaml` and every `*.protocol.yaml` are statements about the
  model's components and are compared against `projectName` (`resource-protocol-format.md`).
  The two are **not the same field**, and two sibling files spelling the system name differently
  can be the correct state of a repository. Both comparisons ignore case, so a `Widgets`/`widgets`
  split between the two is never a finding (#1065).
- **Id shapes** per `design-artifact-conventions`: `si` matches `^SI\d{2}\.\d{2}$`; `callSite`
  matches `^BP\d{2}\.\d{2}$`; `sequence` references match `^SQ\d{2}\.\d{2}\.\d{2}$` and must sit
  under their entry's `si` coordinate. A **bare `SIxx.yy` in the `callSites` section**, or a
  **`BPxx.yy` in the `interactions` section**, is the two populations confused for each other and
  is refused naming ADR-069. A leftover `provisional:` or `aliasOf:` key is refused with its
  migration path.
- **Edges** are matched on the **verbatim** `(gateway, taken)` label pair from the `.bpd`.
  Every system-side edge needs exactly one declaration; a declaration matching no edge is a
  dead declaration (error). Pool-side gateways are **never** declared here (covered by the
  seqmap path set + Blueprint walkthroughs — ADR-041 §2).
- **`realizedBy` forms:** `{permutation: <name>}` for request-variant edges (must exist under
  the model use case and have a non-empty sequence — `[C7]`; the `{Base}_{Variant}` naming is
  `[C7-shape]`, warned and not failed, exactly as on the row form above);
  `{sequence: SQxx.yy.zz}` for outcome edges (structural check at design time;
  semantic verification is the Construction-stage trace differ's job).
- **Boxes and sends (ADR-068, checked as `[C14]`/`[C15]` when `complete` is run with
  `--si <si-export dir>`):** the box/send universes come from the **si-export** (the generated
  projection of the block — `bpmn-dsl si-export`) of the call sites bound to this interaction,
  matched on **verbatim** labels. Totality both ways: every drawn box and every system-side send
  has exactly one declaration; a declaration matching nothing is dead ([C14]). An `{operation: …}`
  ref must resolve to exactly one facet operation in the model — qualify a bare name that is
  ambiguous ([C14] lists the candidates). A declaration the generated sequence does not realize
  yet is `[C14]` (run `seqmap sequence`); a model step no box declaration stands above is
  `[C15]` — the sequence is a *refinement* of the block, never more. Step 0 (the client hop) is
  exempt: it realizes the request arrow, not a drawn box. `{internal: <label>}` matches the
  model's ADR-061 internal step by label; `{event: <name>}` is structural only (there is no model
  event catalog to resolve against).
- **YAML subset.** The file is parsed by a strict subset parser: two-space indentation,
  `key: value` scalars (bare or double-quoted), inline lists `[a, b]`, inline maps
  `{ key: value }`, `- ` block-list items, `#` comments. Anything else is a parse error —
  the strictness is the format validation.
- **A scalar may wrap** (#1204/#1207, 2026-09-03). Any string-valued key accepts a folded or
  literal block scalar (`key: >-` / `key: |`, continuation lines indented deeper than the key)
  and a double-quoted scalar whose closing `"` falls on a later line — the spelling the example
  above already uses. Folding joins the lines with single spaces; `|` keeps the breaks; a blank
  line inside a folded block survives as one break. **Inside a wrapped value there is no syntax
  left to parse**: a `#`, a quote or a backtick is prose. This paragraph once listed only
  single-line scalars while the example above wrapped, and the parser sided with the paragraph —
  so `rationale`, which the Semantics section below makes MANDATORY on a reuse row, was a
  required prose field with no legal way to wrap. A folded rationale did not fail where it was
  written: it was stored as the literal `>-`, and its continuation lines resurfaced hundreds of
  lines later as `unexpected content after callSites`.

## Semantics

- **Authored, incremental.** The architect appends/edits entries as binding proceeds through
  Design; `seqmap complete` is cheap loose-stage feedback (never blocking mid-stage,
  ADR-040 §8) and gates only when presented at Blueprint.
- **The `callSites` section is expected to move.** Re-pointing a row is the mechanism by which
  reuse is recorded once it becomes visible, and it is deliberately the cheapest edit available:
  it rewrites nothing. An interaction left with no call sites after a re-point is a dead
  interaction and must be removed or re-bound — see the totality rule above. Design's iteration
  is bounded by the Blueprint gate, where the map is presented and the checks gate.
- **Nothing is rewritten** (ADR-066's win, preserved). The drawings carry call-site ids from the
  first stakeholder walk to the last; the model carries System Interaction ids from Design to
  production. Neither population is ever renumbered to meet the other.
- **Reuse is a design finding, and it is countable.** Because the two populations are distinct,
  the map yields a number the Design-stage gate record reports: *N call sites resolve to M System
  Interactions*. Under `si-binding/1` a shared interaction merely appeared in two `definitions[]`
  entries and the ratio could not be formed.
- **A non-live process is a disposition, not an omission (#1055 → #1148).** A business process
  dissolved into another during Discovery/Mockup leaves its call sites behind in a source that is
  **const** from the gate that blessed it, so they cannot be removed and they resolve to no live
  System Interaction. Binding them anyway imports a superseded flow into the model as a
  live `realizedBy` edge; leaving them out silently is indistinguishable from forgetting one.
  The disposition therefore lives in the **source's own header** — the `status` directive
  (`bpmn-dsl` ≥ 1.16.0), a typed field, not prose, so ADR-062 §2 / ADR-063 §3 ("structure, not
  prose") still holds — and three properties follow:
  1. **Totality is preserved** — over the live inventory, which is what totality is for. An
     unmentioned call site of a **live** process is still `[C2]`, unchanged.
  2. **One declaration, many consumers.** The same directive drives the diagram banner, the
     Design Book badge, the gate-dossier panel and this exclusion; nothing is restated by hand
     (the hand-written `historical:` list this replaced was a second restatement of the same
     fact, and two hand-maintained restatements of one property eventually disagree).
  3. **Reason and authority in the source.** The directive carries the successor and the
     stakeholder-facing reason; the gate whose blessing froze the source is the gate record's
     business, next to every other const fact of that stage.
  A frozen call site owes no model use case (`[C3]`/`[C4]`), and the gateway edges inside its
  block owe no realization declaration (`[C5]`). It also drops out of the **bound** Sequence Map,
  which carries the live inventory (the map stamps `status` on the process entry). `[C10]` is
  deliberately unaffected: a screen action still calling a frozen call site is a stale view, and
  stays a finding. Nothing rewrites a frozen id: it stands in its const source, accounted
  for by the source's own `status` directive.
- **`reuse.yaml` stays, and keeps its job.** A draft of ADR-069 deleted it on the premise that no
  System Interactions exist at Mockup. The premise is false for the case #635 was filed for: a
  **second business-design pass over a system that is already built** (ADR-041:163-166), where the
  interactions do exist, and a screen model of the built system already calls them. The sidecar declares, at
  Mockup, that a drawn call reuses a built interaction, and `[C12]` then **binds Design's hands**:
  a Design that invents a new interaction for that call fails the gate. Nothing else in
  `si-binding/2` can express that constraint — binding the call site to a brand-new interaction is
  otherwise legal, and owes a rationale only on a second row, of which there is none. The
  sidecar's `si:` field now names the **call site** whose target is constrained.
- **Not the same as a second `callSites` row.** `reuse.yaml` is a Mockup-stage *constraint on
  Design*; a second `callSites` row is a Design-stage *finding*. One binds, the other records.

## Migration from `si-binding/1`

Mechanical, and no System Interaction is renumbered:

1. `format: si-binding/1` → `si-binding/2`.
2. `bindings:` → `interactions:`, dropping any `aliasOf` entry (its `si` becomes a `callSites`
   row pointing at the survivor, carrying the alias's `rationale` verbatim).
3. Add a `callSites:` row per drawn block, pointing at the interaction its source already named.
   For a project migrated from ADR-066's single id, a block drawn in `BP07` takes the next
   free `BP07.nn` and points at the `SIxx.yy` it already carried. The second slot is a free
   append-only number, never a position (ADR-069 §1).
4. Re-key `reuse.yaml`: each entry's `si:` names the **call site** whose target is constrained
   (`BPxx.yy`), not the interaction. The sidecar is **not** deleted — see § Semantics, "`reuse.yaml`
   stays, and keeps its job": it constrains Design from a Mockup-stage declaration, and nothing
   else in `si-binding/2` expresses that.
