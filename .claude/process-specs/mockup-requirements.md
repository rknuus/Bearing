# Mockup Requirements (`mockup/1`) — the behavioral mockup, specified once

**Status:** the single, numbered requirements spec for every LLM-authored behavioral
mockup (the Mockup-stage spike and the Blueprint build). Consolidates ADR-043 §1 (capture-grade
bar), ADR-044 (authored builds), ADR-045 (walks), ADR-046 (in-mockup rules review) and the
conduct findings of run 2 (R1 owner walk, 2026-07-27; figaro reference mockup, owner
input of the same date). The ADRs fix the *decisions*; this spec fixes the *build
requirements* — the authoring session reads it top-to-bottom before writing a line.
Instrument-level requirements (M-9 …) evolve here without ADR ceremony; anything touching
gates, roles, or the review model still needs an ADR.

Maturity tags: **[core]** required in every build · **[blueprint]** required from the Blueprint
build on · **[candidate]** owner-endorsed direction, adopt when tooling lands.

## A. The application (what the stakeholder experiences)

- **M-1 [core] Capture-grade bar (ADR-043 §1, verbatim).** A fully working,
  final-looking, frontend-only app: client-side in-memory domain store seeded from the
  world data; SI actions really mutate it; the ratified rules computed live; free
  navigation — no forced paths, ever; zero backend for *behavior*; loadable from
  `file://` (classic scripts, no build step). A mockup that guides paths, simulates
  emissions, or shows placeholder values must not face a stakeholder.
- **M-2 [core] LLM-authored, never generated** (ADR-044; amended by ADR-068 for the
  per-SI SKELETON only — see M-21). The spike from the Intent material **with the served
  SIs' si-exports as read-first input** (#1182); the Blueprint build from the ratified
  material + the model with bound SI ids. The code is a design-stage instrument:
  behaviorally reviewed, never line-reviewed, never production input.
- **M-3 [core] Invented-decisions log, BOUND to what it shaped** (`DESIGN-NOTES.md`,
  D-entries: what-the-docs-say / chose / why / **`SI:`**) — one entry per decision *chosen
  rather than read*, every entry feeding the Q&A ledger. UX/instrument decisions are logged
  the same way. **Each entry names the System Interaction(s) whose behavior it shaped**
  (`SI: SI01.03, SI01.04`), and the build declares the same fact on its side
  (`A.si('SI01.03', { hash, decisions: ['D12'] })` — `bpm-skeleton --decisions` projects the
  log's binding onto the registration). `SI: instrument` marks a decision that shaped the
  *instrument* rather than the business and binds to nothing; **every other unbound entry is
  a lint warning** (`bpm-decisions check`), because a decision no walk can surface is a
  decision no walker can answer. The binding is what M-8's third row renders and what the
  Intent harvest counts. *(#1183, Figaro 2026-09-02: 57 D-entries, invisible during the walk
  — the stakeholder met invented behavior as designed behavior and reacted to it as a
  defect.)*
- **M-4 [core] State persists across reloads** *(owner, 2026-07-27)*. Browser storage
  (e.g. localStorage) so an accidental reload mid-walkthrough resumes where it left off.
  Reset is explicit (M-9), never implicit via reload. **Persistence boundary** *(R1,
  D31)*: the app world resumes exactly; instrument session state (the overlay's walk
  recording, explain coverage) may honestly restart with a visible note — never
  silently, never pretending continuity the record doesn't have.
- **M-5 [core] Simulated clock** — seeded from the world data, user-advanceable
  (+15m/+1h style), never `Date.now()`-driven behavior; timer rules become walkable.
- **M-6 [core] External systems are simulated AND walkable** *(owner, 2026-07-27; retagged
  [blueprint]→[core] by ADR-068/#1182)*. When the business design involves external
  systems, the mockup exposes them as their own views/tabs so the walker can *influence*
  them — trigger their inbound events, inspect what the system under design sent them. An
  external system that only exists as a narrated side effect is not walkable. The mockup
  is the first fully working implementation minus real external systems; those are
  simulated where possible — a barcode-reader **simulator**, never a reader. A Mockup-stage
  build may no longer narrate an external system.

## B. Observation & review instruments (the overlay and its UI)

- **M-7 [core] The conformance/walklog overlay** (installed skill, vendored
  **unmodified**; version noted in the README). Forgiving observation only — recorded,
  never enforced; walklogs are byproducts with the pending-approval skeleton.
- **M-8 [core] Explain mode** (ADR-046): toggleable, **OFF by default**; toggled on,
  each action shows the SIs called and the rules fired with computed values and
  provenance quotes; includes the **rules coverage panel** (fired/unfired, collapsed by
  default) and, at Blueprint, the **delta filter** ("new/changed since the spike" — the
  ADR-045 walk is that panel walked empty).
  **A third row: "decided, not read"** *(#1183)*. Beside the SIs called and the rules fired,
  each action shows the **invented decisions it realizes** — the M-3 D-entries bound to that
  SI, one line each in the log's own plain words (what the sources say / what the build
  chose), collapsed by default like the coverage panel. Each carries an **answer**
  affordance (M-12). The rules row explains what the sources DID say; this row is the other
  half — what nobody said and the build decided anyway. The walk is where an invented
  decision is cheapest to settle: the list is too long to pre-read (57 in Figaro), and most
  entries only matter at the moment the behavior shows.
  **The coverage panel gains a decisions tab** *(#1183)*: which D-entries the walks met and
  which they never did — an unmet invented decision is one the walk did not test, the same
  reading as an unfired rule. Instrument and unbound entries are named beside the
  denominator, never folded into it.
- **M-9 [core] Dev console** *(owner, 2026-07-27)*: one unobtrusive place (top corner)
  collecting the instrument controls — **reset data to seed**, explain-mode toggle,
  UC-map toggle (M-10), diagnostics toggle. Never mixed into the app's own chrome.
- **M-10 [candidate] Use-case map overlay** *(owner, 2026-07-27, figaro)*: a static
  toggle that outlines **every control with the SI/use-case it invokes** (`data-uc`
  outlines) — the at-a-glance complement to explain mode's after-the-fact panel.
- **M-11 [core] Goal-directed walk drawer** *(R1 findings, D23–D37)*:
  - the BP's **paths as selectable rows**, labeled by their branch decisions in plain
    words, with walked/unwalked state (the path list *is* the branch coverage view);
  - selecting a path shows a **checklist**: trigger hint ("Start here: …"), steps +
    gateway decisions in flow order, and **data hints** for data-decided branches
    derived from the rules ("keep the item total under the 15.00 minimum");
  - ticks follow the walker's **free** clicks — selecting a path never locks the app;
  - the **walk verdict single-sources from the overlay** (matched/differed); checklist
    ticks are display-only and never claim completion;
  - **plain language only**: no "candidates/drift/steps" jargon outside the diagnostics
    toggle; deviation from the selected path is a grey note ("recorded"); an action that
    is mapped but unexpected here reads "unexpected here — recorded"; **red is reserved**
    for actions in no mapped flow at all;
  - at walk start, undecided gateways are neutral ("decisions pending"), never alarming;
  - **ending a walk freezes the checklist** (dimmed, "walk ended — ticks frozen"); an early
    end says so and offers a prominent **restart** on both the banner and the path row —
    ticks must never keep updating against a frozen verdict (R1 finding #4, D36).

## C. Conduct plumbing (findings must reach the filesystem)

- **M-12 [core] In-UI findings capture** *(owner, 2026-07-27; implemented in the R1 spike, D34)*: walkers (stakeholder +
  Software Architect) can attach a **comment right in the mockup** — on the current
  walk step, screen, or a clicked element — without leaving the app. Comments ride the
  walklog export as first-class entries (who/where/when/text).
  **A comment carrying a D-id is the ANSWER to an invented decision** *(#1183)*: confirm,
  reject or amend, right where the behavior showed, with the D-entry's own words in front of
  the walker (M-8). It rides the export under its `decision` id and its `verdict`
  (`confirmed` | `rejected` | `amended`), reaches the sidecar immediately (M-13), and the
  Intent harvest turns it into a **ledger entry WITH its answer** instead of one more open
  question (`bpm-decisions harvest`). Comments survive a reload with the walk — a finding
  lost to an accidental refresh is the loss M-4 forbids.
- **M-13 [core] The conduct sidecar** *(owner, 2026-07-27 — PROVEN in R1, D37; the generic
  skill version landed with #1183: `bpm-serve` in the business-process-mockup skill, and the
  overlay's own client half — `create({ conduct: true })` — so a build no longer hand-writes
  either)*: when the mockup is **served** by the conducting session (rather
  than opened `file://`), a minimal local endpoint receives walklogs, comments, and
  action traces and **appends them to the project filesystem** (e.g.
  `…/08_Behavioral-Spike/walks/`), so findings reach the conducting Claude session
  live — no copy-paste. Strictly write-only telemetry: the sidecar implements **zero
  business behavior** (M-1's zero-backend bar concerns the app's behavior; conduct
  telemetry is exempt but must degrade gracefully — without a sidecar, M-12 falls back
  to manual export, and the app runs unchanged from `file://`).

## D. Verification (unchanged anchors)

- **M-14 [core] Headless-loadable + committed smoke; full contract at Blueprint** *(Mockup-stage
  form per the R1 sync review, owner ruling 2026-07-27)*. Every build's domain core loads
  without a browser (classic scripts; a `window` shim suffices) and ships a **committed
  headless smoke** — green before any stakeholder walk (the R1 exemplar caught D35).
  From the **Blueprint build on**, the core additionally exposes the full app-side contract
  `create(world) → { store, select, invoke, rule, pipeline, advance }`, behaviors keyed
  to the rules file's ids, so `bpm-verify` can drive it.
- **M-15 [blueprint] Verified conformance** (ADR-044 §5): rebuild good = `bpm-verify` green
  + approved logs replay green — never byte-identity. The rules file + world seed are
  distilled behind the build (ADR-046): explanation + verification fuel, extracted by
  default, never separately reviewed.
- **M-22 [core] A rebuild that OVERWRITES the mockup owes the walk disposition** *(Software
  Architect ruling 2026-09-01, Figaro `OI-156`/`OI-189`; #1223)*. Replacing the walked build
  invalidates the walks performed on it — *"Since I walked the previous mock up, I did not walk
  anything … any walk results must be marked as invalid"*. So the rebuild emits, in the same
  change, a `walklog-disposition.yaml` `superseded:` group naming the replaced build, the day it
  was overwritten, the ruling and the affected logs (format: `walkthrough-log-format.md`). The
  logs stay **byte-identical and in place** — never moved to an archive folder, never deleted,
  never re-stamped: **disposition is data, not location**. `seqmap replay` refuses an undisposed
  log walked on or before the declared overwrite instead of counting it, so the obligation is
  mechanical, not a matter of remembering.
- **M-18 [core] The build walks itself before a human does** *(Figaro R2 walk findings,
  2026-08-28; made a **gate condition** 2026-09-01, #1162)*. A **committed self-walk** drives the
  **rendered DOM** — real mouse events on
  real controls — through the map's covering path set, and the overlay must recognise each
  path; the evidence attaches to the gate dossier and is green before any stakeholder walk.
  **A green self-walk — all seven families below — is a condition of LEAVING THE MOCKUP STAGE**
  *(Software Architect ruling 2026-09-01, #1162)*: Gate 1 ("Intent") does not open without the
  evidence, and the Gate-1 entry check `just intent-entry-check` refuses on its absence as
  channel **[A5]**, beside the four Discovery-stage side-channels. The evidence is the harness's
  `selfwalk/1` JSON, committed as `selfwalk.json` in the subject's Gate-1 record directory
  (`04_Gates/gate-intent-<subject>/`). Before that ruling the requirement was written but
  conditional — it only spoke in a project that had bothered to run a self-walk, so a Sequence-Map
  path producible by no walk of the app could reach the Design stage unremarked.
  **`seqmap complete` is deliberately NOT mockup-aware, and that is not to be re-proposed**
  (#1162): teaching the Blueprint-entry check to read this evidence was the rejected option — it
  would make a Design-stage check depend on a Mockup-stage artifact, require a mockup to exist
  before the check could run at all, and give one job a second checking mechanism. The check keeps
  its single home in the families below; what the ruling changed is that running them is no longer
  optional.
  A control that is present but **disabled is a hard failure**, never a silent no-op: the
  walk asks for a click and either gets one or fails. Seven assertion families, all generic
  (the only project-authored part is the walk plan — which control, which words, which
  value, per step):
  - **WALK** — every covering-set path is completed by clicks alone, and the overlay's
    verdict for it is *matched*. A path that hands over between BPs (pick a task up in one
    process, land in another) carries its verdict across the bridge — an implicit end that
    drops the status makes exactly the handover paths unjudgeable, in a stakeholder walk
    too.
  - **REACH (no dead control)** — every System Interaction a **screen model** declares
    (`calls` / `also`) is fired by a **click** during the self-walk. Unreached is allowed
    only with a reason declared in the walk plan, never silently.
  - **COVER (no operation the map names goes unfired)** *(#1161, Figaro 2026-09-01)* —
    every operation the **Sequence Map** names in a path of a business process **the app
    serves** is fired by something during the run: a click, or the **consequence** of one.
    The in-scope set of processes comes from the app's own **view registry** — what its
    views declare they serve — so the denominator maintains itself instead of drifting from
    the map. Uncovered is allowed only with a reason declared in the walk plan, never
    silently. The defect class it closes is one REACH structurally cannot see: a screen
    model declares **actions**, so a **consequence** System Interaction — one that fires
    because another act happened — is nobody's action, enters no screen model, and can
    never be in REACH's denominator. An app may therefore write such an operation's effect
    **inline** instead of calling it and stay green everywhere, because the world is right
    and only the **provenance** is wrong. That is an attribution defect, and no behavioural
    assertion can see it: in Figaro the status really was set, the journal really read
    «Ausgeliefert», 251 assertions across four suites passed, and a human found it by hand.
  - **EDGE (a drawn hand-off fires as the consequence of its declared source)** *(#1182 /
    ADR-068; Figaro walk 2026-09-02, figaro#161 defect 1)* — widens COVER, which cannot ask
    *by what* an operation fired. The denominator is the map's **system→system edges** of
    the served processes: same-BP consequence emits (`emits[].operation`), process
    continuations (`initiator.kind: process`, #1167) and scheduler paths. Each target must
    fire with the **`via`** the app records on the overlay step (`'clock'` for the
    simulated clock; the skeleton's dispatcher stamps it automatically) — never by any
    caller. The defect class: a drawn BP01→BP05 hand-off dead in the build while an
    operator button fires the target — world right, COVER green, edge gone. The same
    `unreached` allowlist excuses an edge, keyed by the target operation.
  - **STALE (the build matches the drawing it was built against)** *(#1182 / ADR-068)* —
    the si-export content hash each `A.si(id, …)` declares (M-21) equals the export's
    current hash, per served SI. A block redrawn after the build turns the self-walk red
    instead of drifting silently; the fix is to re-author that SI's body against the
    current export. A plan naming no `siExports` directory gets a note, never a silent
    green.
  - **HONEST (an empty answer says why)** — a result panel reporting nothing but zeros
    renders an explanation of what would make it non-zero. Mechanically: a zero-valued KPI
    block carries a `[data-empty-reason]` element.
  - **SHOWS (a displayed figure is the operation's own answer)** — for each `shows OP.field`
    in the screen models, the value rendered during the walk equals that field of the
    response the overlay recorded for `OP`. Its precondition is M-20; without M-20 the
    family has no oracle and degrades into project-specific hand-counting.
  Controls are addressed **by the words the screen model declares**, not by internal
  selectors, so label drift is a failing walk rather than a silent rename.
- **M-19 [core] No verification may reach past the UI and still count as UI evidence**
  *(Figaro R2 walk findings, 2026-08-28)*. A test that advances a flow by calling the domain
  layer (`A.si(…)`, the headless core, the store) proves the **domain**. Those tests stay and
  keep their own value — they stop counting as walk evidence. A build whose only green
  surfaces reach past the UI has not been walked, however many assertions it reports. The
  Figaro spike went to its first walker with 103 green assertions and a System Interaction
  that no click sequence could reach.

## E. App-side discipline (obligations of the authored app)

- **M-16 [core] Honest overlay reporting** *(R1, D13/D35)*: timer/system SIs are path
  **triggers**, never reported as walk steps (their rule evidence rides the adjacent
  human action); a gateway is declared **once, at the moment the business decides it** —
  a re-observation (stray re-lookup, redial) reports the SI but never re-declares the
  branch. Dishonest reporting silently corrupts every walk verdict downstream.
- **M-17 [core] The operative rules copy is declared, the record stays the record**
  *(R1, D12)*: when `file://` forces a JS-literal copy of the rules file, the YAML
  remains the file **on record** (and the Blueprint delta baseline), the copy is
  hand-synced, and the README names the seam. The smoke (M-14) is the cheap place to
  pin the copy's computed values to the record's worked examples.
- **M-20 [core] Every figure a screen shows is a named field of an operation's answer**
  *(Figaro R2 walk findings, 2026-08-28)*. A number on a screen is bound to `OP.field` — a
  field the System Interaction's contract actually answers with — and never to a tally the
  UI computes for itself. Two consequences, both cheap: a model claim naming a field the
  operation never answers fails at authoring time instead of in front of a stakeholder, and
  the M-18 SHOWS check needs no project knowledge to judge the figure. Where the operation
  should answer with a count and does not, the fix is the **operation's answer**, not a
  synthetic figure in the UI. The Figaro run panel read «7 Match-Aufgaben erstellt» over a
  task list holding one, because the KPI was bound to the app's own tally of *parked orders*
  while its label named *created tasks*; as long as those two agreed nothing showed.

- **M-21 [core] SI-internal fidelity — skeleton generated, bodies authored** *(#1182 /
  ADR-068; Figaro walk 2026-09-02: three walk-blocking defects, one form — the drawing was
  right, the build realized it half)*. For every SI the app serves (its own view registry),
  the build implements **every drawn box**, every `send` to a system target as a **real
  call of the target operation** (never inlined) carrying the drawn payload (`carries`),
  and every bound rule via the registry. **Skeleton generated, bodies authored**: per
  served SI the tool (`bpm-skeleton`, business-process-mockup skill) emits the mockup's
  JavaScript skeleton from the **si-export** — one stub function per box, one predicate
  stub per gateway, the sends as real calls of the target operation — and the LLM writes
  the bodies against the in-memory store. This is the one scoped amendment to ADR-044's
  "LLM-authored, never generated" (the C# side, ADR-061, is the pattern, not the target).
  `A.si(id, …)` **declares the export hash** it was built against (the STALE family
  compares it). The authoring brief names the served SIs' exports as **read-first** input,
  and `DESIGN-NOTES.md` carries a **per-SI provenance table** (which export, which hash,
  what was invented beyond it). The mockup is authored from the block, never generated
  from the model — it exists to find holes before Design.

## Provenance of requirements

| Source | Requirements |
|---|---|
| ADR-043 §1 / #420 (owner bar) | M-1 |
| ADR-044 | M-2, M-3, M-7, M-15 |
| ADR-045/046 (owner, 2026-07-26) | M-8, M-15 |
| R1 owner-walk findings (2026-07-27, D23–D30, #425) | M-11 |
| figaro reference + owner input (2026-07-27) | M-4, M-6, M-9, M-10, M-12, M-13 |
| R1 conduct proof (2026-07-27): spike implements M-4/9/10/12/13; sidecar = `serve-conduct.py` beside `index.html`, appends to `walks/conduct.jsonl` + numbered walklogs | status column of record |
| R1 sync review + owner ruling (2026-07-27): M-14 split into Mockup-stage form (headless-loadable + committed smoke) and Blueprint full contract; D13/D35 → M-16; D12 → M-17; D31 → M-4 boundary note | M-14, M-16, M-17, M-4 |
| Figaro R2 walk findings (2026-08-28, #1114): six defects on a build with 103 green assertions — an unreachable SI behind a disabled control, a mislabeled banner, an off-map fourth step, a dropped handover verdict, two indistinguishable map paths, and a KPI bound to the wrong tally; four found by the harness rather than by a human, once the assertion family existed | M-18, M-19, M-20 |
| Figaro walkthrough finding (2026-09-01, #1161; downstream raphaelzulliger/figaro#139): a consequence System Interaction whose two lines the delivery run had written INLINE instead of calling it, leaving its map path producible by no walk while 251 assertions across four suites stayed green — an attribution defect no behavioural surface can see, found by a human and not by any tool | M-18 (COVER) |
| Figaro stakeholder walk (2026-09-02, #1182/ADR-068; figaro#161–#163): three walk-blocking defects, one form — a drawn step missing entirely (the BP01→BP05 hand-off dead behind an operator button), a business rule read half out of a step note, a drawn payload (article × channel × ACTION × version) realized as a field diff. Root cause: the build's only machine input stripped the SI internals the capture-grade bar demanded | M-21, M-6 [core], M-18 (EDGE, STALE), M-2 (exports read-first) |

| Figaro mockup rebuild (2026-09-01/03, #1223): a whole walk performed on a mockup that was then rebuilt with «overwrite» — 19 logs retired by FOLDER NAME, one live log left unmarked and counted as current, 0 dispositions although the format had shipped two days earlier | M-22 |
| Figaro stakeholder walk (2026-09-02, #1183, child of #1182): the build's 57 invented decisions were invisible during the walk — a few surfaced ad hoc as inline hints, by the author's initiative, with no list behind them; the Software Architect never came across the D-entries in the walk at all | M-3 (`SI:` binding + lint), M-8 (third row + decisions tab), M-12 (the answer), M-13 (generic sidecar) |

Changes to this spec: append/renumber-never, cite the walk finding or owner statement
that motivated the entry, and log a friction entry when a requirement proves wrong in
conduct.
