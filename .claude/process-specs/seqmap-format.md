# The Sequence Map format (`seqmap/1`)

**Status:** the design note the Discovery-stage/B tooling contract §2 and issue #404 call for — the
single source for the map's shape. The generator is the `seqmap` skill (shipped with theagent2);
the Design-stage regenerator (ADR-037 §2, model-derived) emits the **same shape on the same ids**,
with three declared additions.

> **ADR-066 (2026-09-02, #1181): one map shape, one id space.** A System Interaction's id is
> minted once at Mockup and never rewritten, so the `binding: "provisional" | "bound"`
> discriminator and the `operations[].home` field are **deleted** — a Mockup map and a Design map
> key on the same ids. `seqmap rebind` is deleted with them.

## Purpose

One machine-readable expectation map per project — an ordered list of `{from, to, operation}`
System-Interaction invocations per business process, with the BP's branch structure as an
enumerable path set. Consumed by:

1. the **clickable mockup runtime** (#405) — resolves screen-action `calls`, simulates each
   operation's responses from `operations[op].definitions[].emits`;
2. the **walkthrough log** (#406, [`walkthrough-log-format.md`](walkthrough-log-format.md)) —
   a walkthrough records which `paths[].id` it walked;
3. the **Blueprint walkthrough-replay regression** — approved walkthroughs replay against the
   mockup after the map is regenerated from the Design-stage model. No id translation is
   involved: the walk and the map name the same interactions (ADR-066).

## Ids (`design-artifact-conventions`)

Operations are keyed by the **minted `SIxx.yy`** id, derived from the tagged `.bpd` sources.
The key is the same at Mockup and at Design; a shared SI appears **once** in `operations`, with
one `definitions[]` entry per business process that defines it. Consumers treat `operation`
values as opaque keys.

Given the model, `seqmap generate --binding <si-binding.yaml> --model <model.json>` (#412) emits
the same map **enriched**, with three declared additions and no key change:

- `operations[op].operation` carries the **model's facet operation** for the SI's client
  hop — `{ "component", "facet", "name" }`. There is exactly **one**: one System Interaction is
  one operation call (`design-artifact-conventions`), and an operation's variations are
  permutations *of that operation*, dispatched on a polymorphic request DTO. Since ADR-067
  (#1186) it is read from the model's own **`useCases[].operationId`** declaration — the use
  case says which operation it is, and permutation step 0 (the client hop) is derived from that
  — instead of being assembled by walking the permutations and taking each first step, which
  answered a one-answer question with a list and emitted the `variants` field #676 carried for
  the divergent case (deleted in #1185). C11 no longer checks that the permutations agree,
  because the model can no longer hold two answers; SNS's own promotion gate
  (`Gate.UseCaseOperationUndeclared`) refuses a use case that draws steps and declares nothing.
  The entry-level `name` is the USE-CASE name (checked by `complete` C3) and coincides with the
  operation name only by convention; consumers that join against a call trace (the UI channel)
  must use `operation.name`, never `name`. Emitted only when the model carries its component
  catalog (`componentDetails`), which C11 then also checks: every sequence step's
  `operationRef` — and the declaration itself — must resolve to a real facet operation. **This
  field is where the facet lives** — the id does not carry it (ADR-066 §3).
- the map records **`bindingSource`** (the binding map's filename) and a `generated`
  header citing tooling contract §7;
- an **aliased** id (ADR-066 §5) resolves to its survivor's entry;
- the ADR-041 completeness check runs **inside** the generation — an enriched map only exists
  if the check is green.

What each SI resolves to is recorded in the SI binding map
([`si-binding-format.md`](si-binding-format.md), ADR-041 as amended by ADR-066), which also
drives the model↔BPMN completeness check (`seqmap complete`).

## Non-live sources: the generators skip, the inspectors do not (#1243)

A `.bpd` header may declare `status dissolved|retired|parked` (#1148) — the business process is
out of the live inventory, by the source itself. Since #1243 that declaration reaches the
generated map:

- **`generate` and `check` leave the source out entirely.** No `operations` entries, no
  `paths`, no `processes[]` entry, and its filename is absent from `sources`. A consumer of the
  map — the clickable mockup, the Design Book, the gate dossier — therefore never has to filter
  for itself, which is the whole point: on `figaro` the exclusion of BP07 lived only as prose in
  a Q&A entry, and over twelve days produced five issues and a scope ruling about drawings
  nobody was building.
- **What was left out is recorded in `nonLive`** (below), so nothing is lost by the skip — a
  reader that wants to *say* a process is parked reads that array and needs no second parse of
  the `.bpd` headers.
- **The skip is never silent.** One line on stderr, every run:
  `seqmap: skipped 2 non-live source(s): BP07_Parked (parked) · BP09_Retired (retired) — pass
  --include-parked to act on them anyway`
- **A source named directly on the command line is skipped like one found by a directory
  sweep** — otherwise the rule holds only until somebody points the tool at the file.
- **`--include-parked` restores the old behaviour.** The default changed, not the capability.
  It has **no bound form**: a non-live process's blocks resolve to no `callSites` row by
  [C13], so `--binding`/`--model` would have nothing to stamp onto them, and the combination is
  refused rather than quietly ignored.
- **All three states are treated alike.** Whether a `dissolved` process should instead be
  deleted from the source tree is a ruling about that tree, not something a generator acts on.
- **The INSPECTORS never skip.** `seqmap complete` and `seqmap unused` read every source as
  written, non-live included — that is precisely how [C13] can refuse a `callSites` row that
  still names a frozen block. "Ignored" is a statement about what is *generated*, never about
  what is *checked*: a skip that reached the checks would make "parked but still wired into the
  binding" invisible, which is the rot the mechanism exists against. `--include-parked` is
  refused there, for the same reason it exists nowhere else: an option that contributes nothing
  is not accepted-and-ignored.
- **`seqmap sequence` is a generator too** — it emits model mutations — and refuses a call site
  frozen by a non-live status by name, rather than reporting the missing `callSites` row that
  [C13] requires. There is no `--include-parked` form of it.
- **`seqmap replay`** reads `nonLive` and withdraws a walk of a listed process the way it
  withdraws a superseded one: a notice on stderr, counted in the verdict line, evidence for
  neither replay nor approval. A walk performed before the parking is not a broken map.
- **A PARKED process's binding rows are kept, and the ENRICHED map says what they park** (#1252,
  #1256). `complete` derives "parked" from the `.bpd` header and keeps the rows of a parked
  process (a dissolved/retired one's are still `[C13]`); an interaction only such rows resolve
  to is `[C9-parked]`, a warning naming what revives it. `generate --binding --model` records
  those interactions under **`parkedInteractions`** (below) — the ONE place Construction reads
  them from: `theagent2 scaffold --seqmap` leaves the use case out (no entry body, a refusing
  dispatcher arm) and `construction-entry-check --seqmap` does not ask it for a variant DTO.
  A Mockup map has no binding and cannot answer; both refuse it.

## Shape (by example, abridged from the widgets map)

```jsonc
{
  "format": "seqmap/1",
  "generated": "GENERATED by `seqmap generate` — do not edit (…)",
  "system": "Widgets",                       // the one system pool all sources share
  "sources": ["BP01_TakePhoneOrder.bpd", "…"],   // the LIVE sources this map was built from

  // present only when sources were skipped (#1243) — what was left out, and why. Absent
  // under --include-parked, where nothing was skipped and each process carries its own
  // `status` instead.
  "nonLive": [
    { "bp": "BP07", "name": "ReconcileStock", "source": "BP07_ReconcileStock.bpd",
      "status": { "state": "parked" } },
    { "bp": "BP03", "name": "PhoneIntake", "source": "BP03_PhoneIntake.bpd",
      "status": { "state": "dissolved", "successor": "BP01_TakePhoneOrder" } }
  ],

  // ENRICHED maps only, present only when something is parked (#1256): the interactions only a
  // PARKED process asks for — drawn, not built, revivable. The blocks themselves are not in
  // `operations` (their source was skipped); this is what Construction reads to leave the use
  // case out. Derived from the .bpd headers via the rows `complete` keeps (#1252); nothing is
  // hand-maintained here.
  "parkedInteractions": [
    { "si": "SI04.01", "name": "AssignTable",
      "operation": { "component": "SeatingManager", "facet": "Seating", "operation": "AssignTable" },
      "parkedBy": ["BP07"], "callSites": ["BP07.01"] }
  ],

  // global SI catalog — one entry per unique operation id, keys sorted
  "operations": {
    "SI01.07": {
      "id": "SI01.07_ConfirmOrder",          // full id as written in the si block
      "name": "ConfirmOrder",
      // "reused": true,                     // present only when a reuse.yaml declares this
                                             // interaction one the system already had (#635)
      "definitions": [                       // one per BP that defines it (>1 = shared SI)
        {
          "bp": "BP01",
          "trigger": { "kind": "message", "label": "Order confirmed" },
          //           kind: "message" (a pool sends in) | "timer" | "start" (self-triggered)
          "emits": [                         // everything the chain sends out, source order —
            { "message": "Workshop ticket",   // the mockup's simulated responses/effects
              "to": "Workshop (BP06_PrepareTicket)", "blackbox": true },
            // an emit that lands on ANOTHER system chain in the same source names the
            // operation the hand-off starts (#1182/ADR-068) — the same-BP consequence edge
            // the EDGE self-walk family asserts ("fired as the consequence of the declared
            // source"). Cross-BP hand-offs join through the receiving side's typed process
            // pool (#1167) instead.
            { "message": "Trigger reconciliation", "to": "Widgets", "operation": "SI05.01" }
          ],
          "ends": ["Ticket sent"]            // the chain's end-event label(s)
        },
        { "bp": "BP09", "trigger": { "kind": "message", "label": "Corrected order" }, "…": "…" }
      ]
    }
  },

  "processes": [
    {
      "bp": "BP01",
      "name": "TakePhoneOrder",
      "source": "BP01_TakePhoneOrder.bpd",

      // the .bpd header's lifecycle, when the source declares one (#1148). Under the #1243
      // default a non-live process has no entry here at all — it is in `nonLive` above — so
      // this field appears only under --include-parked:
      //   "status": { "state": "parked" }
      //   "status": { "state": "dissolved", "successor": "BP01_TakePhoneOrder" }

      // flow-ordered {from, to, operation}: first occurrence across the path set,
      // then the system-self-triggered chains (timer/condition starts) in source order
      "interactions": [
        { "from": "Shop Staff", "to": "Widgets", "operation": "SI01.01" },
        // an interaction from a TYPED initiator pool (#1167) carries the typing — this is the
        // scheduler-invocable / continuation surface the mockup and the gate read:
        //   { "from": "Sync-Intervall fällig", "to": "Widgets", "operation": "…",
        //     "initiator": { "kind": "scheduler" } }
        //   { "from": "Widgets · Listing (BP01)", "to": "Widgets", "operation": "…",
        //     "initiator": { "kind": "process", "process": "BP01_TakePhoneOrder" } }
        { "from": "Widgets", "to": "Widgets", "operation": "…",   // only self-triggered ones
          "trigger": { "kind": "timer", "label": "…" } }
      ],

      // the enumerable branch structure: a gateway-edge-COVERING path set, not the
      // combinatorial product — every gateway branch of every path-emitting pool appears
      // in at least one path (ADR-037 §1: every BP branch once)
      "paths": [
        {
          "id": "BP01-P01",                  // stable only for unchanged sources — see below
          "pool": "Shop Staff",        // the role walking this path
          // a path in a TYPED initiator pool (#1167) carries the typing; absent = human.
          // The same field appears on the pool's entry in `flow.pools`, so replay can label
          // gate gaps (the scheduler's act / a continuation) without the .bpd:
          //   "initiator": { "kind": "scheduler" }
          //   "initiator": { "kind": "process", "process": "BP01_TakePhoneOrder" }
          "trigger": {                       // what starts the chain
            "kind": "message", "label": "Order call",
            "sources": [ { "pool": "Customer", "message": "Order call" } ]
            // a system-raised trigger carries the raising operation:
            //   { "pool": "Widgets", "message": "No-show alert", "operation": "SI08.01" }
            // "external": true = the sender lives in another BP (cross-BP hand-off)
          },
          "branches": [                      // the gateway decisions this path takes, in order
            { "gateway": "Customer on file?", "taken": "no" }
          ],
          "steps": [                         // the ordered SI invocations on this path
            { "operation": "BP01-SI01.01", "message": "Customer lookup" }
          ],
          "outcome": { "kind": "end", "label": "Order placed" }
          // or { "kind": "loop", "backTo": "capture", "label": "Capture item (add/remove)" }
          //    — the path re-enters an earlier step (a .bpd back-edge `goto`); walking it
          //    once covers the loop branch, the walkthrough may iterate at will
        }
      ],

      // the decision graphs the paths were enumerated from (#852). Replay identity: a
      // walk is valid when its own `branches` derive a walk of these graphs (honoring
      // `constraints`) — NOT when it is a member of the covering set above, whose
      // representatives are an enumeration choice and change with the generator.
      "flow": {
        "pools": [
          {
            "pool": "Shop Staff",
            "roots": [0],                    // node indexes of the pool's start events
            "nodes": [                       // one node per pool statement, source order
              { "k": "start", "label": "Order call", "to": 1 },
              { "k": "gw", "gateway": "Customer on file?",
                "out": [ { "taken": "no", "to": 2 }, { "taken": "yes", "to": 3 } ] },
              { "k": "step", "to": 3,        // `steps` only where the statement sends to a system chain
                "steps": [ { "operation": "BP01-SI01.01", "message": "Customer lookup" } ] },
              { "k": "end", "label": "Order placed" }
              // { "k": "goto", "to": 2, "backTo": "capture", "label": "Capture the thing" }
              //    — a .bpd back-edge; reaching it with its target already on the walk
              //    terminates the walk with the `loop` outcome
            ]
          }
        ],
        // the feasibility sidecar's ratified constraints, embedded so replay can judge
        // any branch combination without the sidecar (rationale kept for findings)
        "constraints": [
          { "gateway": "Under minimum?", "taken": "yes",
            "requires": { "gateway": "Delivery or pickup?", "taken": "delivery" },
            "rationale": "the 15.00 minimum is delivery-only — ratified (#419)." }
        ]
      }
    }
  ],

  // screen-model join (empty until .vw screen models exist): operation -> the actions
  // that invoke it. Populated by `generate --screens <dir>` from `calls`/`also` bindings.
  "screens": {
    "BP01-SI01.01": [ { "file": "…​.vw", "screen": "OrderDesk", "action": "Lookup", "via": "calls" } ]
  }
}
```

## The feasibility sidecar (`seqmap-feasibility/1`, #419)

The `.bpd` graph is structure; some branch **combinations** are semantically impossible in
the domain (a gateway-edge-covering enumeration treats gateways as independent and will
otherwise pair them — the #419 finding: covering paths that combined `pickup` with
`Under minimum? = yes` against the ratified pricing rule). An **authored, reviewable**
sidecar — `feasibility.yaml`, sitting **next to the `.bpd` sources** and auto-discovered by
`generate`/`check`/`complete` — declares per-edge data constraints:

```yaml
format: seqmap-feasibility/1

processes:
  - bp: BP01
    constraints:
      - gateway: "Under minimum?"          # the constrained EDGE (gateway + taken)
        taken: "yes"
        requires: { gateway: "Delivery or pickup?", taken: "delivery" }
        rationale: "the 15.00 minimum is delivery-only — ratified, walklog BP01-P06 (#419)."
      - gateway: "Under minimum?"
        taken: "yes"
        excludes: { gateway: "Pickup accepted?", taken: "yes" }
        rationale: "A zone-rescued (converted) order has fee & minimum waived (#419)."
```

- **Semantics (order-aware):** a constraint is evaluated against the **ordered branch
  prefix** at the moment the edge is taken during enumeration — `requires` means the prefix
  already contains the named edge; `excludes` means it does not. Later same-label gateways
  are unaffected (e.g. a rescue offer *after* the constrained edge).
- **Pruned, then re-covered:** infeasible combinations are never enumerated; the covering
  algorithm re-covers the affected edges via feasible prefixes. An edge no feasible path
  can reach fails generation loudly (constraint contradiction or business-design finding).
- **`rationale` is mandatory** — the sidecar encodes *ratified statements*, and each
  constraint cites its provenance; it is reviewed like any design artifact.
- **Recorded:** a map generated under constraints carries `feasibility: ["feasibility.yaml"]`
  (after `sources`); maps without a sidecar are byte-identical to pre-#419 output.
- Validation at generation: every referenced gateway and branch label must exist in the BP
  (typo/staleness guard); every `bp` must be in the source set. Same strict YAML-subset
  regime as `si-binding-format.md`.

## The reuse sidecar (`seqmap-reuse/1`, #635; rekeyed by ADR-066)

A **second business-design pass** adds a business process to a system that is already built,
and that process **reuses a System Interaction the system already has**. Writing the id down
used to be the problem: an id belonged to its home BP, whose source had already been rewritten
to bound ids at Design and so could not join a Mockup-stage generate. That whole problem is
gone with the second id space — under ADR-066 the new source simply writes the built SI's
**minted id**, because the id is global and permanent.

What is *not* mechanical, and is why the sidecar survives, is the intention: "Design creates
nothing new for this one". An authored `reuse.yaml`, sitting **next to the `.bpd` sources** and
auto-discovered by `generate`/`check`/`complete`, states it as a fact:

```yaml
format: seqmap-reuse/1

reuses:
  - si: SI01.01                      # the interaction this pass reuses; it already exists
    rationale: "BP12 identifies the caller with the customer lookup BP01 already has (#635)."
```

- **`generate` (Mockup):** the reused interaction's chain is written in the *new* process's own
  source, so the mockup simulates it from that BP's `emits` like any other. The map records
  `operations[si].reused: true` and carries `reuse: ["reuse.yaml"]` (after
  `sources`/`feasibility`). A map with no sidecar is byte-identical to pre-#635 output.
- **`complete` (Design) — check `[C12]`:** the declared id must have a binding entry, i.e. it
  must be an interaction the design already carries. A declaration for an id the binding map
  does not know is this pass inventing what it said it reused.
- **`rationale` is mandatory**, and staleness is guarded: every declared id must be carried by
  some `si` block in the source set. Same strict YAML-subset regime as `si-binding-format.md`.
- **Retired with the two-id lifecycle:** the `provisional:`/`bound:` pair. There is one id, so
  there is one field.

## The unused report (`seqmap-unused/4`)

`seqmap unused --format json` emits a **report**, not a map: a different document with its own
`format` string, produced from the same three sources `complete` joins (tagged `.bpd` × binding
map × `ReadArchitecture` model). It answers *what does nothing reach* — the question `[C9]` asks
half of, at permutation level.

**Why it is not a reference count.** A pointer from a dead branch is still a pointer: on the
conducted run measured for this design, 100 of 102 operations had at least one, which makes the
count worthless. The report is a **reachability computation anchored in the drawing** — roots are
the drawn call sites, and everything the walk does not touch is a candidate.

```jsonc
{
  "format": "seqmap-unused/4",
  "model": "model.json", "binding": "si-binding.yaml", "sources": ["…/BP01_OrderThing.bpd"],
  "nonLiveProcesses": [{ "bp": "BP03", "status": "dissolved" }],
  // the model's own tombstones (#1320) — the use cases `seqmap complete` exempts, listed here
  // so the two checkers' outputs can be read side by side over the one fact they share (#1360)
  "notBuiltUseCases": [{ "si": "SI02.01", "name": "ReconcileStock", "lifecycle": "retired" }],
  "counts": {
    "components": 4, "facets": 5, "operations": 9, "useCases": 3, "permutations": 6,
    "callSites": 4, "liveCallSites": 4,
    "operationMarks": { "USED": 5, "PARKED": 0, "DEAD-BRANCH-ONLY": 1, "ORPHAN": 3, "UTILITY": 2 },
    "facetMarks": { "USED": 3, "PARKED": 0, "DEAD-BRANCH-ONLY": 0, "ORPHAN": 2, "UTILITY": 1 },
    "permutationStates": { "DRAWN": 4, "PARKED": 0, "UNDRAWN": 2 },
    "exemptOperations": 4,
    "exemptOnComponentLifecycle": 1,      // its component carries `lifecycle: future`
    "exemptOnUseCaseLifecycle": 1,        // every route to it runs through a not-built use case
    "exemptOnUtilitiesLayer": 2           // its component is on the `Utilities` layer (#1242)
  },
  "permutations": [
    { "si": "SI02.01", "useCase": "SweepThings", "permutation": "SweepThings_Deep",
      "state": "UNDRAWN", "steps": 1, "callSites": [] }
  ],
  "operations": [
    { "qname": "ThingStoreAccess.ThingStore.PersistThing", "component": "ThingStoreAccess",
      "facet": "ThingStore", "operation": "PersistThing", "mark": "USED",
      // "component-lifecycle" | "utilities-layer" | "use-case-lifecycle"
      "exempt": false, "exemptBy": null,
      "lifecycle": null, "layer": "ResourceAccess",
      "calls": 1, "callSites": ["BP01.01"], "via": ["SI01.01 PlaceThing_A"] }
  ],
  "facets": [
    { "qname": "AuditAccess.AuditTrail", "component": "AuditAccess", "facet": "AuditTrail",
      "mark": "ORPHAN", "exempt": false, "exemptBy": null, "lifecycle": null,
      "layer": "ResourceAccess", "operations": 1 }
  ],
  "dtos": { "total": 22, "seeds": 18, "reached": 21,                       // only with --dtos
            "unreached": [{ "name": "OrphanRow", "classification": "supporting", "fields": 2 }] },
  "findings": ["AuditAccess.AuditTrail.RecordAudit"],
  "parked": []                                  // reached only through a parked process's rows (#1256)
}
```

- **The `/4` addition is the third exemption, and the first that is not a lifecycle** (#1242):
  the component's **LAYER**. A `Utilities` component is reached by **no sequence step on
  purpose** — sequences mirror Manager orchestration (ADR-031), and a cross-cutting call flows
  through the iFX ambient context rather than as a drawn step (ADR-061). The drafting
  completeness checklist has stated the rule *by LAYER, not by the name of the thing* for as long
  as it has existed; a walker that exempted only `lifecycle: future` made two statements of one
  fact disagree, and left a project modelling a live utility one way to be green — writing
  `lifecycle: future` on a component it is building, a lie in the one machine-readable deferral
  statement this walk trusts.

  So this is not "utilities are used": **reachability from drawn call sites is the wrong question
  for that layer**, and the mark says so. Where a finding mark would have stood the row reads
  **`UTILITY`** — a fifth value in `mark`, outside the four-mark rank order on purpose (no
  `Math.min` rollup can produce it), carrying `exemptBy: "utilities-layer"`, counted under
  `exemptOnUtilitiesLayer`, printed on its own `EXEMPT (UTILITY)` line with the rule that exempts
  it, and never `--check`-red. It hides nothing:
  - a Utility a **live drawing does reach** still reads `USED`, a parked one `PARKED` — those are
    positive facts the walk established, and ADR-074 makes them possible (a `service` Utility is a
    legal sequence tail; only a `library` one has no boundary for a box to cross);
  - a Utility already declared `lifecycle: future` keeps **that** exemption, spelled the way the
    model spelled it — nothing changes for a component the design has spoken about;
  - the rule is the layer and nothing else: the same component on `ResourceAccess` is the finding
    it always was. The comparison is case-folded, because SNS carries the one layer in two
    spellings (`utilities` key, `Utilities` display value).

  A facet on a Utilities component is never unused, by the same rollup and for the same reason.
  The **`--dtos`** axis is untouched and needed no change: its closure seeds from *every*
  operation's payload rather than from the reached set, so a Utility contract's DTOs were already
  reachable — a different question, never asked of the drawing.

- **The `/3` addition is the second exemption** (#1360): a **use case** the model declares
  `lifecycle: future | retired` (#1320). `seqmap complete` has read that declaration as a
  TOMBSTONE since #1320 — *"a retired interaction is a TOMBSTONE"*, printed as *"N exempt on a
  model lifecycle"* — while `unused` did not read it at all, so the operations BEHIND a retired
  use case were a note in one checker and a finding in the other. Two checks over one model fact
  must not give opposite verdicts: the declaration was authored to settle the question where a
  machine reads it, and a second checker that re-raises it un-settles it.

  It silences nothing on its own, and the three limits are the point:
  - an operation is exempt on it only when **every** route that reaches it runs through a
    not-built use case — one route from a `live` use case and the finding stands, with that
    route named;
  - an **ORPHAN reached by nothing is never exempt** (`via` is empty): no declaration was made
    about it, and inferring one from an emptiness is the reference-counting mistake above;
  - an operation a **live** drawing reaches is `USED`, never "exempt" — a retired use case with
    live rows still has its entry operation entered, and that contradiction is `complete`'s
    `[C9-notbuilt]`, not something this report relabels.

  Every row says WHICH exemption it carries in **`exemptBy`**, the two are counted apart, and the
  use cases themselves are listed under `notBuiltUseCases`. The MARKS did not change: an exempt
  operation still reports the mark the walk computed.

- **`PARKED` is the `/2` addition** (#1256): an operation reached only through the rows of a
  PARKED process (#1252 — drawn, deliberately not built, revivable) and a permutation only such a
  row names. Neither `USED` nor a finding: it is asked for by a drawing nobody is building now,
  its owner is named (the process that revives it), and it is never `--check`-red. It is listed
  under `parked`, on its own line in the text report, and it becomes `USED` when the process is
  revived or the finding it then is when the process is dissolved.

  **A parked row that names no permutation asks for EVERY permutation of its interaction**
  (#1431), not for none. The live case of that input is an abort — the block is drawn, the
  variant it exercises is unknown, so nothing under it can be confirmed *or condemned* — and
  filling the parked roots from the named permutations alone made the same input silently
  **condemn**: the front door read `PARKED` (the entry leg reads the ROW) while everything behind
  it read `UNDRAWN`, and the operations under those permutations became `--check`-red
  `DEAD-BRANCH-ONLY` findings on a **parked** process. A parked drawing *owes* the missing branch
  and nobody is being asked to supply it, so all of its variants are equally asked for by a
  drawing nobody is building now — which is precisely what `PARKED` means. The live case is
  untouched: it still aborts, before the roots are built. The parked-ness is read from the
  `.bpd` header's own `status` line and from nothing else — never a name list, a directory or a
  per-call-site flag; **the header is the truth and the folder is its mirror**, and two
  vocabularies for one fact is the drift that rule exists to prevent.

- **`operations` and `facets` list the WHOLE universe**, not only the candidates — the report is
  also the sheet the "is this cut too fine" conversation is built from (`calls` = live call count,
  `callSites` = which drawn blocks reach it). `findings` is the candidate subset, both exemptions
  already removed, and it is exactly what `--check` fails on.
- **The marks.** `USED` reached from a drawn root; `PARKED` reached only through a parked
  process's rows; `DEAD-BRANCH-ONLY` reached only through a permutation nobody draws; `ORPHAN`
  reached by nothing; `UTILITY` on the `Utilities` layer, where the question is not asked. An operation's mark is the **best** state
  any root reaches it through, and **a facet is unused iff every operation on it is**.
- **The answer is decisive or there is no answer.** There is deliberately **no** "possibly
  reachable" tier. Every input that would leave the root set incomplete is an **abort**, not a
  softer mark — see the two below. Unmet preconditions are collected and reported **together**,
  because they have different owners and different remedies (a drawing edit, a binding edit, a
  model rename) and learning them one at a time is three round trips for one answer. An earlier cut of this format carried an `UNDECIDED` mark for
  both cases; it was an artefact of accepting a defective input, and a mark that means "the tool
  was run too early" is not a finding.
  - **A live `callSites` row that names no permutation.** The block is drawn — its interaction is
    entered — but which request variant it exercises is unknown, so no permutation under that
    interaction can be confirmed or condemned. This is `complete`'s `[C1]`; `unused` refuses it,
    because an answer computed over it is not a weaker answer but an unsound one. Note that such a
    row can be defective and change no mark (when sibling rows already name every permutation) —
    which is why it is a precondition rather than a note.
  - **A `throw` in a live drawn block.** The one step construct with no binding form: `boxes:` has
    `{operation}` / `{internal}` / `{expands}` and nothing for it, and a throw is not a `call`
    block, so `callSites:` cannot address it either. A chain it starts is a root nothing can name,
    and the operations under that chain read as dead while being drawn. `throw` is retired for
    exactly this reason (bpmn-tools#54); the replacement is `:task;` + `send "…" to <handle>`,
    whose receiving `messageStart` → `call` block yields a **real call site** the walk follows.
- **The entry operation.** A use case's declared operation (ADR-067) is `USED` as soon as a live
  call site resolves to its interaction — on the strength of the ROW, not of a step list, since a
  generated sequence need not repeat the entry hop as a step. The drawn block enters the Manager;
  which request variant it selects is a question one level down, and a Manager facet is a
  client-facing entry surface that only a Client may enter.
- **`exempt` is the ONE intent input**, and it is the component's `lifecycle: future`
  (ADR-027 §5). There is deliberately no per-operation "deliberately unwired" marker: under this
  Method a Manager operation with no use case is not unwired but *not an operation yet*, and an
  Engine/Access operation with no caller is either serving a `future` component or is an
  unfinished edit — both transient states with an owner, not standing conditions needing a
  blessing. A justification written into a `description` is prose and silences nothing.
- **A candidate is a red finding, never a deletion instruction** (Software Architect,
  2026-09-04). The aborts make the walk decisive about *reachability*; they do not make it a
  verdict. "Used" is not "needed" — an operation called by exactly one step of exactly one
  permutation is used, and whether two operations do the same job is not a question a reachability
  graph answers — and nothing BELOW a permutation is checked at all, so a redundant step inside a
  correctly drawn block is not findable here.
- **DTO fields are out of scope.** `--dtos` closes over operation payloads, field types and
  `{Base}_{Variant}` relations only. A *field* counts as used once a rule, a resource fate or a
  screen model touches it — three more sources and three more ways to be wrong, and its own brief.
- **Deterministic**, on the same terms as the map: no timestamps, every list sorted, every
  comparison a name or id comparison. Same three artefacts → byte-identical bytes.

## Semantics and guarantees

- **One SI = one message into the system pool.** A path step exists exactly where a pool
  step `send`s to a system-chain trigger. SI-internal granularity (steps and gateways inside
  the `si` block) is deliberately absent from the MAP and stays absent (an ADR-068 non-goal):
  the map is the edge-only expectation surface. The internals live in the **si-export**
  (`bpmn-dsl si-export`, `si-export/3`, one file per CALL SITE) — the block's own
  machine-readable projection, which
  the mockup skeleton, the STALE self-walk family and the `complete --si` refinement checks
  consume. The one internal fact the map does carry is the `emits[].operation` consequence
  field above, because a hand-off between chains is an EDGE of the map's own graph.
- **Paths cover, they don't enumerate.** The set is the smallest greedy DFS selection in
  which every reachable gateway edge appears at least once and every start event yields at
  least one path. Loops terminate a path with a `loop` outcome instead of unrolling.
  Pools that never call the system (e.g. a pure customer pool) emit no paths.
- **Paths are representatives, `flow` is the identity (#852).** Which combinations the
  covering set picks is an enumeration choice — a traversal tweak, a new pruning, or a
  feasibility-sidecar change re-picks them with no design change. Consumers must therefore
  never treat membership in `paths` as walk identity: `seqmap replay` derives a walked
  branch combination through `flow` (constraints included), and its `--gate` totality
  counts covered gateway edges and starts, so an approved walk keeps counting when the
  representatives move. Only a real `.bpd`/constraint change invalidates a walk.
- **Deterministic.** Same sources → byte-identical map; no timestamps. A regenerated file
  that differs means the sources changed or someone hand-edited the map (`seqmap check`
  guards this).
- **Path ids are positional** (`BPxx-Pnn` in emission order): stable across regeneration of
  unchanged sources, **not** stable under source edits. Walkthrough logs must therefore
  record the branch list alongside the path id; the Blueprint replay matches on branches, not
  on `Pnn`.
- The `trigger`/`emits` labels are stakeholder-language message names, not identifiers —
  display them, don't key on them.
