# The Walkthrough Log format (`walklog/1`)

**Status:** the design note the Discovery-stage/B tooling contract §4 and issue #406 call for — the
single source for the structured walkthrough log's shape. In the mature mechanic the log is
the *output of frame extraction* from a screen+audio-recorded walkthrough (tooling contract
§4, not yet built); under the simulation waiver (a conducted run with no real stakeholder
sessions) the AI fills the same shape in-session during a chat-driven walk over the rendered
mockup. The
format is identical either way — that is the point of the waiver: the downstream consumers
(Specification-stage scenario formalization, the Blueprint walkthrough-replay regression) never know which
pipeline produced the log.

## Purpose

One log per walkthrough — one BP path walked with the stakeholder over the clickable mockup
(#405). It records the three things a recording would have captured (ADR-040 §2, ADR-037 §4):

1. **which BP branch was walked** — the gateway decision list, the replay identity;
2. **the entered values** — what the stakeholder typed/dictated at each System-Interaction
   step, on realistic data;
3. **the confirmed on-screen outcomes** — what the stakeholder saw and agreed was right,
   plus the approval verdict for the round.

Consumed by:

- **Blueprint** — the set of approved walkthroughs (every BP branch approved) is a Blueprint
  exit condition: capture happens for the first time on the bound-map mockup (ADR-040 §3
  as amended by the #410 process fix / ADR-042);
- **the Stages-D–E replay regression** — approved logs re-verified against every later
  regeneration of the Sequence Map or mockup (`seqmap replay`, #413);
- **Specification-stage scenario formalization** — entered values and confirmed outcomes are **candidate
  example data** for executable scenarios (ADR-033 §1.1, ADR-037 §4), never expectations
  as-is: the mockup's outputs are simulated and the seeded resource state is invisible.

## Relation to the mockup's walk-log export

The mockup runtime (#405, tooling contract §3) exports a per-walk JSON (`candidate: true`,
path id, branches, per-step notes, outcome). That export is a compatible **seed**: its
`entries` lift into this format's `steps` (note → `note`), its `trigger`/`branches`/`outcome`
carry over verbatim. The walklog adds what the mockup cannot know — the structured entered
values, the confirmed outcomes, the session metadata, and the approval.

## Shape (by example — a filled log over widgets BP01, path P06)

The example is illustrative (authored for this design note, not a conducted walkthrough);
real logs are produced only in conduct sessions.

```jsonc
{
  "format": "walklog/1",
  "candidate": true,                       // always true — simulated outputs, invisible seed state
  "system": "Widgets",
  "seqmap": "docs/02_Business/03_Sequence-Map/seqmap.json",

  "bp": "BP01",
  "path": "BP01-P06",                      // positional (seqmap-format.md) — branches below
                                           // are the durable identity, never the path id
  "trigger": { "kind": "message", "label": "Order call",
               "sources": [ { "pool": "Customer", "message": "Order call" } ] },
  "branches": [                            // the replay key: Blueprint matches on these
    { "gateway": "Customer on file?", "taken": "no" },
    { "gateway": "Delivery or pickup?", "taken": "pickup" },
    { "gateway": "Item available?", "taken": "yes" },
    { "gateway": "Order complete?", "taken": "yes" },
    { "gateway": "Under minimum?", "taken": "no" }
  ],

  "session": {
    "round": 1,                            // walkthrough rounds run until every branch is approved
    "date": "2026-07-17",
    "mode": "chat",                        // "chat" (simulation waiver) | "recording" (mature mechanic)
    "conductor": "Software Architect",
    "stakeholder": "Widgets owner"
  },

  "steps": [                               // the SI invocations actually walked, in order —
    {                                      // loop paths may repeat an operation (see semantics)
      "step": 1,
      "operation": "SI01.01",              // the minted SI id from the driving map (opaque key;
                                           // the same id the model and the code carry, ADR-066)
      "message": "Customer lookup",
      "entered": { "phone": "555 01 23" },
      "observed": [                        // confirmed on-screen outcomes, stakeholder language
        { "label": "lookup result", "value": "no match — customer not on file" }
      ],
      "confirmed": true,                   // the stakeholder agreed this is what should happen
      "note": null                         // free-form remark ("price looked off", …)
    },
    {
      "step": 2,
      "operation": "BP01-SI01.02",
      "message": "New customer data",
      "entered": { "name": "L. Marsh", "phone": "555 01 23" },
      "observed": [ { "label": "customer record", "value": "registered — no address (pickup)" } ],
      "confirmed": true,
      "note": "address correctly NOT asked for on the pickup fork"
    },
    {
      "step": 3,
      "operation": "BP01-SI01.05",
      "message": "Item change",
      "entered": { "item": "Hex widget, brass", "quantity": 1 },
      "observed": [ { "label": "order line", "value": "1× Hex widget, brass — 16.50" },
                    { "label": "availability", "value": "in stock" } ],
      "confirmed": true,
      "note": null
    },
    {
      "step": 4,
      "operation": "BP01-SI01.05",         // second capture-loop iteration, same operation
      "message": "Item change",
      "entered": { "item": "Round widget, steel", "quantity": 1 },
      "observed": [ { "label": "order line", "value": "1× Round widget, steel — 8.50" } ],
      "confirmed": true,
      "note": null
    },
    {
      "step": 5,
      "operation": "BP01-SI01.06",
      "message": "Order complete",
      "entered": {},
      "observed": [ { "label": "total", "value": "25.00" },
                    { "label": "minimum check", "value": "above the 15.00 minimum" } ],
      "confirmed": true,
      "note": null
    },
    {
      "step": 6,
      "operation": "BP01-SI01.07",
      "message": "Order confirmed",
      "entered": { "promised time": "18:50" },   // staff-set from house defaults — never computed
      "observed": [ { "label": "workshop ticket", "value": "sent (simulated)" } ],
      "confirmed": true,
      "note": null
    }
  ],

  "outcome": { "kind": "end", "label": "Order handed off", "confirmed": true },

  "approval": {
    "status": "approved",                  // "approved" | "rework"
    "by": "Widgets owner",
    "date": "2026-07-17",
    "remarks": "catalog prices are placeholders — confirm before Intent"
  }
}
```

## Semantics and guarantees

- **Candidate, never expectation.** Every log carries `candidate: true` unconditionally.
  `entered`/`observed` values formalize into executable scenarios in Specification, re-verified
  with the stakeholder where needed (ADR-033 §1.1, ADR-037 §4) — the Blueprint replay checks
  the *interaction sequence*, not these values.
- **Replay identity is `bp` + `branches` (+ the step operation sequence).** Path ids are
  positional and not stable under source edits (seqmap-format.md); the log records them for
  convenience only. `operation` values are the **minted** SI ids and need no translation ever:
  the id is assigned at Mockup and never rewritten (ADR-066), so a walk approved at the Intent
  gate replays against the Design-stage map unchanged. Consumers treat `operation` as an opaque
  key throughout.
- **Loop paths record the walk actually taken.** A path with a `loop` outcome may iterate at
  will during the walkthrough; `steps` is the real ordered invocation list and may repeat
  operations. Replay requires the sequence to be consistent with the path's step cycle, not
  equal in length.
- **`entered` keys are display labels** (stakeholder language) until screen models bind
  them; once the walked screen has a model, prefer the screen model's field names so Specification
  can join values to bindings mechanically. `observed[].label/value` stay stakeholder
  language always — display, don't key (same rule as seqmap message labels).
- **A step may carry an optional `via`** (overlay ≥ 1.8, #1182/ADR-068): the operation whose run
  **caused** this one — a drawn system→system hand-off the app realized as a real call — or
  `"clock"` when the simulated clock fired it. Absent on a click-fired action. It is the EDGE
  self-walk family's attribution evidence; `seqmap replay` ignores it like any unknown step key.
- **A step may carry an optional `decisions`** (overlay ≥ 1.9, #1183): the D-ids of the
  invented-decisions log (mockup-requirements M-3) whose behavior this action realizes — what
  the build CHOSE here because the sources left it open. Same regime as `via`: additive,
  ignored by `seqmap replay`, read by the Intent harvest (`bpm-decisions harvest`) to say which
  walk surfaced which decision.
- **A log may carry an optional `comments` array** (M-12; overlay ≥ 1.9 exports it): the
  findings the walkers attached in the mockup, in order — `text`, `by`, `at`, and where they
  stood (`bp`, `path`, `afterStep`, `screen`). A comment carrying `decision: "D12"` is the
  **answer to an invented decision**, with `verdict: confirmed | rejected | amended`; the
  harvest turns it into a ledger entry that carries its answer instead of one more open
  question. Replay ignores the array; the scribe and the harvest read it.
- **One log per (BP, branch combination, round).** File name `<bp>-<path>.walklog.json`
  under the project's business docs tree
  (`docs/02_Business/04_Walkthroughs/`); a rework round's replacement overwrites — git
  history is the round archive, `session.round` disambiguates.
- **A branch is approved when its latest log has `approval.status: "approved"` and every
  step `confirmed: true`.** Blueprint totality (`seqmap replay --gate`; capture placement per
  the #410 process fix / ADR-042, retired as an exit condition by ADR-045 §3 but kept as
  tooling) requires every gateway edge and every start event exercised by the seqmap's
  covering path set to be exercised by some green approved walk — the covering paths are
  the capture work list, but an approved walk counts toward coverage whether or not it is
  a current representative (#852). A `rework` log stays on disk as the work list.
- **`session.mode` marks provenance.** `"chat"` = the simulation waiver (the
  AI scribes in-session, playing the frame-extraction output); `"recording"` = the mature
  extraction pipeline (tooling contract §4). Downstream consumers ignore the field.
- **A design change to a walked BP owes the walklog re-capture in the same changeloop
  (#598).** The approved logs are the replay regression's baseline; a business-design
  changeloop that adds, removes or re-draws a step in a BP with approved walks leaves
  `seqmap replay` red until the affected logs conform, and a red everyone routes around
  trains the process to ignore red — so the re-capture is part of the changeloop's
  definition of done, exactly like regenerating the map and the call chains. When the
  underlying design decision is already ratified (an SA-blessed ruling or changeloop), the
  re-capture is mechanical conformance, may be agent-proxied, and is recorded in the log's
  `amendments` array: `date`, `kind: "recapture"`, `by`, `change`, `reason` (naming the
  ratified change), `refs`. The original session/approval blocks stay untouched — the
  amendment record, not a re-stamped approval, is what says the log was conformed after the
  walk. A change that is NOT mere conformance (the stakeholder would decide something new)
  is a re-walk, not an amendment.

## Annotating a log a later change staled

**A blessed log is never amended in place and never re-walked because its numbers went stale.**
Ruled by the Software Architect on 2026-08-23 (issue #764, ledger entry QA-024 of the run that
hit it) on a pricing delta where a two-parameter change staled the quoted figures in six approved
logs without moving a single walked verdict. The two alternatives were both refused with their reasons stated:
**amending in place** rewrites the record of a session that happened, which is the one thing a
record may not do; **re-walking** spends a stakeholder hour re-confirming a verdict the change does
not move. Leaving the logs silently stale was refused too — that is how a const set becomes
self-contradictory with nothing reporting it.

So the log gains an **`annotations`** array instead, appended after `approval` because an annotation
always post-dates the approval it does not touch:

```jsonc
  "annotations": [
    {
      "kind": "change-request",              // why the annotation exists
      "date": "2026-08-23",
      "by": "Software Architect - QA-012 ruling, decision review 2026-08-23",
      "refs": ["QA-012", "docs/01_Planning/change-request.md"],
      "amended": false,                       // stated, not implied — see the ruling above
      "reWalked": false,
      "note": "<what changed, when, and the ruling that says this log is annotated not amended>",
      "verdictAffected": false,
      "verdictUnaffectedBecause": "<the reason, in a sentence a reader can disagree with>",
      "stale": [                              // one entry per quote that no longer matches policy
        {
          "at": "step 5 - observed 'minimum banner'",   // human-readable locator
          "quoted": "'you are at 12.50 - delivery starts at 15.00'",
          "houseFigureNow": "the same banner now reads 'delivery starts at 18.00'"
        }
      ]
    }
  ]
```

Rules:

- **The annotation is additive and inert.** `seqmap replay` reads `format`, `candidate`, `bp`,
  `branches`, `steps`, `outcome` and `approval`; it never reads `annotations`, so annotating a log
  cannot change a replay result. Verified, when the ruling landed, on the log set that motivated
  it: the same replay findings before and after.
- **`verdictAffected: true` is not an annotation, it is a re-walk.** If the change moves what the
  stakeholder confirmed, the log is stale as *evidence* and the branch owes a new round — annotate
  it, then walk it. Annotation covers only the case where the quoted figure moved and the confirmed
  outcome did not.
- **`stale` names quotes, never fixes them.** `houseFigureNow` says what the current policy reads;
  it is not a corrected value for the log, and downstream consumers must not lift it as one.
- **Never annotate the provenance records.** An interview note or a stakeholder's own worked example
  records what was said on a date; it is not a statement of current policy and it does not go stale.
  (e.g. `01_Planning/2026-07-13 Interview - Notes.md`, left exactly as it was.)

## Freezing a log set whose id scheme a decision retired

**A log recorded under a retired id scheme is frozen, not migrated.** Ruled by the Software
Architect on 2026-09-02 (ADR-069 §9, issue #1196), on the migration that split **call sites**
(`BPxx.yy`, the drawn system chain) from **System Interactions** (`SIxx.yy`, the operation on a
Manager facet): logs recorded before the split name interaction ids in `steps[].operation` where
the regenerated map now carries call sites, so every step would mismatch. Re-stamping them was
refused — it rewrites the record of a session that happened, the one thing a record may not do —
and so was a one-time translation flag, which resurrects for a single migration the mechanism the
decision deletes.

The frozen logs stay **byte-identical**. That is the whole content of the ruling: evidence of a
walk that happened is not migrated.

### The disposition lives beside the logs, never inside them

A sidecar `walklog-disposition.yaml` next to the walklog set, auto-discovered exactly as
`feasibility.yaml` and `reuse.yaml` are next to the `.bpd` sources:

```yaml
format: walklog-disposition/1
system: Widgets

frozen:
  - scheme: adr-066                  # the retired id scheme these logs were recorded under
    ruling: "SA 2026-09-02, ADR-069 §9 (#1196)"      # who froze them, and where to read why
    reason: "Recorded when one id named both the drawn chain and the operation. ADR-069 split
             the two; these logs name interaction ids where the map now carries call sites.
             Evidence of a walk that happened is not migrated."
    logs:                            # explicit paths, relative to this file — never a glob:
      - BP01-P01-r1.json             # the frozen set is a closed, reviewable list
      - BP01-P02-r1.json
```

**Not the `annotations` array.** That mechanism (#764) is additive and **inert** — `seqmap replay`
reads `format`, `candidate`, `bp`, `branches`, `steps`, `outcome` and `approval`, and never reads
`annotations`, which is exactly what makes annotating safe. A disposition that changes what
`replay` does is by definition not inert, so it cannot live there. Two mechanisms, two jobs: an
annotation says *a quoted figure went stale*; a disposition says *this log's id scheme is
historical*.

### Rules

- **Frozen means excluded from replay, not excluded from approval.** The walk happened and the
  stakeholder approved it. Freezing withdraws the log from *mechanical re-verification*, not from
  the evidence base: a frozen log still counts toward Blueprint's "every BP branch approved".
- **`replay` reports what it skipped, and why.** One line per frozen log, naming the sidecar's
  `scheme` and `ruling`, plus a total. A silently reduced regression reads as a green one.
- **The list is explicit and closed.** No globs, no date ranges: a reviewer must be able to see
  the whole frozen set on one screen and disagree with it. A path naming no log on disk is an
  error, and a log named twice is an error.
- **Freezing is a one-time migration act, not a lane.** A log may be frozen only by a decision
  that retired the scheme it was recorded under, and the `ruling` field must name that decision.
  There is no freezing a log because it became inconvenient.
- **Going forward the case does not recur.** Call-site ids are minted when the block is drawn and
  never expire (ADR-069 §1), so no future log is orphaned by a binding decision.

## Superseding a log set whose mockup was overwritten

**When a mockup is rebuilt with `overwrite`, the run MUST emit a `walklog-disposition` naming the
superseded logs, the reason and the ruling — before the next walk, and in the same change as the
rebuild.** Ruled by the Software Architect on 2026-09-01 (Figaro `OI-156` "«overwrite»", `OI-189`;
issue #1223), in his own words:

> I did a whole walk on the previous mock up, then I realized the mock up is not useful … **Since I
> walked the previous mock up, I did not walk anything.** If something got walked, then it was
> another llm. Therefore, **any walk results must be marked as invalid.**

The failure this closes: a session read walk evidence recorded against a mockup that had since been
overwritten and reported it as current — *"it somehow looked at the previous date of the previous
mockup"*. A walk is evidence about the artefact it was performed on; replace that artefact and the
evidence is about nothing the project still has.

**Superseded is not frozen, and the difference is the whole point.** A frozen log's artefact still
exists — only the id scheme it quotes was retired — so it stays approval evidence and its branch
identity still counts (above). A superseded log's artefact is gone, so it counts as **neither
replay nor approval evidence**: the branch it walked is uncovered again and `--gate` says so.

The same sidecar carries it, as a second section:

```yaml
format: walklog-disposition/1
system: Widgets

superseded:
  - build: "Mockup R1"                # the walked build the rebuild replaced
    overwritten: 2026-09-01           # the day the replacement landed — the frontier, see below
    ruling: "SA 2026-09-01, mockup rebuild «overwrite» (OI-156/OI-189, #1223)"
    reason: "The walk was performed on the build this rebuild replaced. Evidence of a walk is
             evidence about the artefact walked; that artefact no longer exists."
    logs:                             # explicit, closed, relative to this file — never a glob
      - 001-BP01.walklog.json
```

### Rules

- **The logs stay byte-identical, and they stay where they are.** Nothing is re-stamped, nothing is
  deleted, and nothing is moved into an `_archiv/` or `_ungefuehrt/` folder. Retiring by directory
  name was already refused once, on Figaro's Gate-1 record of 2026-08-27: the exclusion "would have
  hung on two tools walking directories differently — **a rule you cannot see by looking at the
  artefact**". **Disposition is data, not location.**
- **The list is explicit and closed, and `replay` checks that it is also COMPLETE.** `overwritten:`
  is not a selector — it is the frontier: any log in that directory walked **on or before** that
  day and named in no disposition is a `[disposition]` finding, and so is a log with no
  `session.date` to judge. The frontier reaches into **sub-directories** as well, so moving a log
  down into a `_ungefuehrt/` folder retires nothing: it is refused for carrying no disposition. That is what makes emitting the disposition required in practice rather
  than in prose: skip it, and the walk set goes red instead of silently counting a walk of a build
  nobody can open any more.
- **`replay` reports every skip, with build and ruling**, and carries the count in its verdict line
  — a regression reduced by a disposition otherwise reads as a green one.
- **A log walked after the overwrite is untouched.** Re-walking is the way out: a superseded branch
  is covered again by a new round on the current build, not by an argument about the old one.
- **This is a disposition, never an amendment.** It says nothing about the walk's verdict and does
  not touch the log's `approval` block — the walk happened, and the record of it stays exactly as
  it was written.

## The replay tool (`seqmap replay`, #413)

The regression that guards Stages D–E — any later Sequence Map or mockup regeneration must
replay the approved logs green (ADR-040 §3 as amended by the #410 process fix):

```sh
node bin/seqmap.mjs replay <seqmap.json> <walklog dir|files...> [--gate]
```

Per approved log (`approval.status: "approved"`; a `rework` log is skipped as the work
list): **integrity** — every step and the outcome must be `confirmed: true`, or the log's
approval claim is itself the finding; **identity** — the log's `bp` + `branches` must
derive a walk of the map's `flow` decision graph, honoring the ratified feasibility
constraints embedded there (#852: the covering `paths` are enumeration-chosen
representatives, so membership in them is **not** identity — a generator/traversal change
must never orphan approved evidence, only a real `.bpd` or constraint change may; path
ids are never matched, and a pre-#852 map without `flow` falls back to covering-set
membership with a warning); **steps** — the log's operation sequence must be consistent
with the derived walk's step cycle under the ADR-037 cursor semantics (exact-next
advance; re-occurrence of an *earlier* step = loop re-entry; a skipped or unknown step =
drift; the walk must consume every modeled step) and the outcome kind/label must match;
**no translation** — a walk recorded at Mockup names the same minted ids the map does, for the
life of the project (ADR-066), so `--binding` and the log's own `binding:` field are both
deleted; a log or map still carrying either, or a step naming a retired `BPxx-SIaa.bb` id, is
refused with the migration path. **dispositions** — a log the sidecar
`walklog-disposition.yaml` declares `frozen:` has its steps withdrawn (branch identity still
counted), a log it declares `superseded:` is not counted at all, and an undisposed log walked on or
before a declared mockup overwrite is a finding rather than a silent green; every skip is named with
its ruling and totalled in the verdict line. `--gate` additionally requires **every gateway edge and every
start event that the map's covering path set exercises to be exercised by a green
approved log** — the Blueprint "every BP branch approved" check, counted on the graph so
approved walks keep counting when the enumerator re-picks its representatives. Exit 1 on
any finding, with the full list.
