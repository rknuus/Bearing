# Gate record & dossier config — format spec (`gate-record/1_<term>`, `dossier-config/1_<term>`)

Governing decision: **ADR-051**. Consumed by the `gate-dossier` skill
(`bin/dossier-build.mjs`), which merges these files with a live scan of the project tree and emits one self-contained HTML dossier per gate.

Format keys follow ADR-051 §4: `<name>/<version>_<term>` — the version is the schema version,
the term is a speaking word for the human reader (the gate for records, the project for the
config). **Validators match name and version only.**

Both files use the same strict YAML subset as the other project artifacts (`qa.yaml`,
`si-binding.yaml`): two-space indents, `key: value` scalars, block lists of mappings,
full-line `#` comments, one line per field. The strictness IS the format validation.

Three shapes sit outside that subset, and the builder refuses each by name at the file and line
that carries it rather than failing somewhere downstream (#885):

- a **trailing comment** after a value — `friction: 3   # counted by the retro`. A comment
  occupies a whole line here, or it is part of the value; put it on its own line above the key.
- a **flow collection** — `issues: ["#812"]`, `totals: {cost_usd: 82.80}`. A list is a block
  list, one `- ` item per line, indented two spaces under its key.
- a **list-shaped key written as one value** — `issues: "#812"` where a list belongs. Before
  #885 this reached an array method inside a render function and came out as a raw TypeError.

Every YAML skeleton below is therefore a document the builder accepts **as written**: the
toolchain's own `dossier-spec-skeleton` test copies the skeletons verbatim into a fixture
project and builds them with the real builder, so an example in this spec and the parser that
has to read it cannot drift apart.

## Where they live

```
<project-root>/docs/04_Gates/
  dossier.yaml                    # project config, format: dossier-config/1_<project>
  gate-intent/record.yaml         # one record per CONDUCTED gate
  gate-blueprint/record.yaml      #   format: gate-record/1_<gate id>
  gate-blueprint/predictions.yaml # gate-ENTRY prediction sheet (#941), format: gate-predictions/1_<id>
  gate-contract/record.yaml
  index.html, gate-*.html         # GENERATED — never hand-edited, --check guarded
```

A gate with no record renders as NOT REACHED. Records are written **at gate exit by the
conducting side** (ADR-051 §2) and amended only when their source records change.

The builder OWNS every other file in that directory: `--check` reports a page nothing writes any
more — a gate dropped from the rail — as an `(orphan)` and the regenerate run deletes it (#883).
Beside the generated pages, keep `dossier.yaml` and the record directories and nothing else;
dotfiles are ignored.

## Self-containment (ADR-051 §3)

- Every `path`/`source` is **project-root-relative**, stays under the project root, and must
  exist — the builder fails on a missing path or a `../` escape, so a dossier cannot claim an
  artifact that is not on disk or one that is not the project's. **Every** one of them:
  `checks[].source`, `sections[].artifacts[].path`, `suite_strength.source`, `components[].model`,
  `resource_protocols.sheets[].path`, `conduct.source`, the config's `qa_ledger` and each rail
  entry's `record` — an absolute path is refused on the same route. Until #906 only two of those
  fields were escape-checked and the rest rested on the author's care, which is not what this
  paragraph says.
- The rule and the `status` vocabulary are checked on **every gate record under `docs/`**, on
  the dossier rail or off it. A project that has run the process more than once keeps the other
  runs' records elsewhere in the tree; those are gate records too, and a whole run's records
  drifted on both rules while nothing read them (#836, #837). Off the rail the builder checks
  only these two closed rules — the full schema answers to a rail, and an off-rail record
  answers to its own run's.
- Paths under `docs/` render as links; paths elsewhere (model store, code) render as
  existence-checked text.
- Issue references are tracker-relative (`#NN`); `tracker` in the config is the only place a
  tracker URL appears. No reference to documents outside the project.

## `dossier.yaml` — project config

```yaml
format: dossier-config/1_widgets
program: "Widgets — conducted run 1"
subject: "Widget-orders domain, developed from business intent A to Z"
tracker: "https://github.com/raphaelzulliger/theagent-unchained/issues"
trail_commit: ee31825c
# qa_ledger is optional (ADR-060): with it, confirm quotes verify verbatim against the
# ledger, and deferred-scope rulings must re-surface on every pending gate's open items.
qa_ledger: widgets.method/qa.yaml
# model is optional (#1155): the Method model this project's gates review. With it, the
# dossier renders a standing "Declared deferrals" panel listing every component the model
# marks `lifecycle: future` — decided by the design, deliberately not built in this cycle.
# The gate predicate goes SILENT on such a component (its facet-lessness and its absence
# from the call chains are declared, not defects), so without the panel the reviewer would
# have to notice the component's ABSENCE to learn it exists. Omit the key and no panel
# renders; a model with no deferrals renders no panel either.
model: widgets.method/architecture.yaml
# rail: state per Diamond node; ids fixed by ADR-040/064 — discovery mockup intent design
#       blueprint specification contract construction acceptance.
# One entry per node; omitted nodes default to locked.
# Stage states: done | active | locked.   Gate states: blessed | pending | locked.
rail:
  - id: discovery
    state: done
  - id: intent
    state: blessed
    # record: the directory under docs/04_Gates/ holding this gate's record.yaml
    record: gate-intent
```

## `record.yaml` — one per conducted gate

```yaml
format: gate-record/1_blueprint
# gate: must match a rail gate id pointing at this directory
gate: blueprint
reviewer: "Software Architect (after blind peer review, ADR-015)"
# status: blessed | pending — a CLOSED SET, and NOT the conduct state's `passed`
# (see the note under the conduct annex, #837)
status: blessed
# blessed: the blessing date, YYYY-MM-DD. REQUIRED when status is blessed, REFUSED when
# pending — see 'The blessing date is typed' below (ADR-062 §2, #1016).
blessed: 2026-07-28
status_label: "BLESSED 2026-07-28"
disposition: "One line: what was decided, by whom, on what subject."
# lede: project color only — the generic 'what this gate decides' text is template-owned.
# Top-level prose is read for an ask like everything else; the record's OWN 'authority:' /
# 'not_an_ask:' would sit here, beside 'status:' — but moving the ask to 'confirm:' is almost
# always right, since a lede tracks nothing (#879).
lede: "Project color only — the generic 'what this gate decides' text is template-owned."
# stats: the verdict strip; keep to at most 6 tiles
stats:
  - n: "17"
    label: components
# checks: the evidence table; quote authoritative records.
# EVERY string this record carries is read for prose that ASKS the reviewer to confirm
# something; whatever carries an asking string names 'authority:' (+ ruling/basis) or declares
# 'not_an_ask:' — here, the row (#862, #879, see below).
checks:
  - name: "seqmap replay (46 approved logs)"
    # id: OPTIONAL, and how a REQUIRED check is recognised — see 'Required checks' below.
    # Lower-case, digits and hyphens; it names the command, not the prose in 'name:'.
    id: seqmap-replay
    result: "46/46 green"
    # not_covered: REQUIRED on every GREEN check of a pending record (#1221), and REQUIRED
    # whenever the result carries a score (a %, or X/Y) whatever the verdict
    not_covered:
      - "Replay verifies the approved walkthroughs against the regenerated map — nothing off the walked paths, nothing about spec or code."
    # verdict: green=PASS  amber=RULING OWED  red=OPEN  info=NOTE  waiver=WAIVED
    verdict: green
    # source (a project-relative path) and/or ref (a tracker ref) — either or both
    source: docs/03_Technology/01_System-Design/GATE-2-BLESSING.md
    ref: "#413"
  # A WAIVED row (#1071): the check could not run. 'result:' is REFUSED here — a waived check
  # produced none — and all three fields below are REQUIRED. See 'Waiving a check' below.
  - name: "call-chains check"
    id: call-chains-check
    verdict: waiver
    reason: "The generator needs the promoted model, and promotion happens at this gate's own act."
    accepted_by: "Software Architect"
    unblocked_by: "The promotion act — the check runs in the first changeloop after this gate."
    ref: "#1071"
# confirm: optional (ADR-060) — the confirmations asked of the reviewer.
# 'authority:' is REQUIRED on every item (#845): the governing ruling's ledger id, or the
# literal 'none'. The two shapes:
confirm:
  - authority: QA-026
    # ruling: required with a ruling id — the ledger 'answer', VERBATIM (whitespace-normalized
    # equality is enforced when dossier.yaml names qa_ledger)
    ruling: "Completes at the new numbers — the figures attach at completion."
    # digest: OPTIONAL and rarely written here (#1049). Every quoted ruling must RESOLVE a
    # digest — the plain-language Lesart the dossier and the review surface render in place of
    # the quote — and it normally comes from the ledger entry 'authority:' names. Write it here
    # only when the reading this item asks for is narrower than the ledger's own summary, or
    # when the authority is not a ledger entry at all.
    digest: "An order's figures attach when it completes, not when it was first priced."
    text: "Confirm the pinned attachment moment is completion, not first pricing."
  # 'authority: none' — no ruling covers this one; it is a judgement call
  - authority: none
    # basis: required with 'none' — what was checked, and what it found
    basis: "Swept the ledger and the Gate-2 record for a display-rounding ruling; none exists."
    text: "Confirm 2-decimal display rounding on the order total."
# suite_strength: ADR-054 Part A — STANDING evidence at Contract (see below)
suite_strength:
  source: docs/03_Technology/02_Spec/SUITE-STRENGTH.md
  # ref: optional tracker ref for the conduct
  ref: "#510"
  summary: "Optional one-paragraph project color."
  # not_covered: REQUIRED with a measured pass (ADR-060, #818) — which behaviours in the
  # gate's scope the scores do not reach
  not_covered:
    - "Part A only — the reference model as SUT; nothing about the production flow."
  # components: one per component whose reference model was mutated
  components:
    - name: "Engine/Pricing — 30 visible units"
      # model: optional, existence-checked
      model: csharp/Spec/Widgets.Spec/PricingReferenceModel.cs
      # mutants, killed, survived, wall: all optional
      mutants: "49"
      killed: "49"
      survived: "0"
      score: "100 %"
      wall: "3.5 min"
      verdict: green
      note: "Optional — mutant table, exclusions, refinements."
  # survivors: optional — one entry per survivor, each dispositioned
  survivors:
    - id: "M03 / M04 — rounding mode swapped"
      # state: open | closed | ratified
      state: closed
      # ref: optional
      ref: "#511"
      disposition: "What it proved and what was done about it."
  # fuzz: optional — one entry per recorded fuzz run
  fuzz:
    - name: "Pricing property-driven generator, seed 20260812"
      result: "2,000,000 iterations — 0 findings, 4.8 s"
      # verdict: optional, defaults to info
      verdict: green
# sections: the review surface, in review order
sections:
  - title: "The model"
    # An asking blurb is refused unless the SECTION names 'authority:' (both shapes as above)
    # or declares 'not_an_ask:'; for a blurb, moving the ask to 'confirm:' is almost always
    # the right answer (#873).
    blurb: "One sentence on why this group is reviewed together."
    artifacts:
      - label: "Canonical model (architecture.yaml)"
        path: widgets.method/architecture.yaml
        # ext: optional — count only this extension in a directory
        ext: .yaml
        # depth: optional — 0 = non-recursive directory count
        depth: 0
        note: "Optional one-liner shown under the path."
# open: rulings & open items.
# ref: tracker refs (#NN) become links; other ids stay text.   state: open | closed | ratified
open:
  - ref: "N1"
    state: ratified
    text: "One sentence."
```

## The blessing date is typed (ADR-062 §2, #1016)

`status_label` is a **display string** — "BLESSED 2026-07-28", "PASSED 2026-08-16 — with two
amber checks carried forward", "BLESSED — const". It stays free text, and it stays what the
dossier renders in the status pill.

The date the gate was blessed is **also** a typed field, `blessed: YYYY-MM-DD`:

- **Required when `status: blessed`.** A blessed gate has a blessing date; a record that cannot
  say when it was blessed cannot be compared against anything.
- **Refused when `status: pending`.** A gate that has not been blessed has no blessing date, and
  a date written there would be a prediction dressed as a record.
- **The date of the blessing this record records.** Where a record was re-blessed through a
  change loop, it is the latest blessing act the record itself accounts for — not the first one,
  and not an addendum sign-off on a document beside the gate.

The field exists because the review surface (ADR-062) derives `changed-since-blessed` for every
artifact by comparing `git log -1 -- <path>` against the blessing date of the gate that blessed
it. Recovering that date by regexing it out of `status_label` would put prose interpretation back
into a derivation the Software Architect ruled must be deterministic — and the labels above show
why it cannot work anyway: two of the three carry no parsable date in the same position, and one
carries no date at all.

**Where the rule is enforced.** On the records the dossier **rail** carries — the full record
schema answers to a rail. The off-rail sweep below keeps checking exactly its two process-wide
rules (the closed vocabularies and self-containment) and nothing else: a record from a run that
finished before this field existed is not accused of owing it, which is the mistake #850 fixed for
the conduct annex. The one other reader that needs the date — `review-surface.mjs`, which reads
the records under `docs/04_Gates/` whether or not they are on the rail — requires it of every
blessed record it reads, and says so with an exit code rather than guessing
(`review-surface-format.md`).

## `suite_strength` — standing Gate-3 evidence (ADR-054 Part A)

The section is **template-owned and standing at Contract**: it renders on the Contract dossier
whether or not the record carries the block. With no block it renders OPEN — *no suite-strength
pass is recorded* — so an omitted pass is visible at the gate instead of silently absent. Other
gates render the section only when their record carries the block.

The block carries **either** `components` (a measured pass) **or** `waiver` (one line saying why
nothing is measurable — e.g. no component carries a naive reference model), never both and never
neither. `source` is mandatory and existence-checked: the block quotes the project's
suite-strength record, it never restates it.

Findings in this block are **ADR-013 barrier material** — spec owner, conductor and Software
Architect only. A dossier is a review surface for the gate, never an implementor artifact.

## `resource_protocols` — standing Gate-3 evidence (ADR-059)

The section is **template-owned and standing at Contract**, on the same mechanism as
`suite_strength`: it renders on the Gate-3 dossier whether or not the record carries the
block; with no block it renders OPEN — *no resource-protocol review is recorded* — so an
unreviewed resource surface is visible at the gate instead of silently absent.

The block carries **either** `sheets` (a reviewed pass) **or** `waiver` (one line saying why there
is no resource surface to review — e.g. the system has no ResourceAccess, so no sheet can exist),
never both and never neither — the same contract `suite_strength` carries above. `reviewer` is
mandatory in both cases: a waiver is a review outcome, accepted by a named reviewer, not an
absence of review.

**One entry per SHEET, grouped under its owning ResourceAccess** (ADR-065, #1093), quoting the
reviewed sheet (`docs/03_Technology/03_Deployment/protocol/<Seam>.protocol.yaml`, format
`resource-protocol/2`). Until 2026-08-28 it was one entry per ResourceAccess, because an Access
stood on one resource; an Access may now stand on several and own a sheet per seam, so `name` is
the **seam** and the optional `access:` names the Access the row groups under. An Access carrying
several sheets then reads as a visibly multi-line review item rather than as something the
reviewer has to notice.

`access:` is **optional**, deliberately: whether the Gate-3 surface takes this shape is ADR-065's
open question **O3**, on which the Software Architect has not ruled. A row without it renders
ungrouped rather than failing the build — nothing goes red on account of an unruled question.

`path` is existence-checked; `verdict: green` asserts the sheet's `--check` was green at
review time and the named reviewer blessed it. The reviewer is the SA or the domain-architect
delegate the brief names (ADR-058).

`on:` is **optional** and carries the day that verdict was given, `YYYY-MM-DD`. It exists
because this review act is routinely performed while the gate is still **pending**, and a
pending record dates nothing — `blessed:` is REQUIRED on a blessed record and REFUSED on a
pending one (#1016). The **review surface** (ADR-062) reads a green row as a blessing of that
one sheet on that one day: with the date it can say the sheet was blessed then, and a sheet that
moves AFTER its verdict reads `changed-since-blessed` against the verdict's own day rather than
going quiet. Without the date the surface can only stop asking for an act already performed, and
must keep reading the sheet off whatever older gate last blessed it — which is how fourteen
sheets on a real run read as owing a review act four days after a delegate signed them green.
Omit `on:` and nothing breaks; no other builder reads it.

**Once the gate is CROSSED the block is blocking, not merely visible (#971).** A Gate-3 record
whose gate is crossed and whose `resource_protocols` block is **absent**, or which **names no
reviewer**, or which carries **any sheet at a verdict other than `green`**, is a `dossier-check`
FAILURE — not an OPEN placeholder. The placeholder stays exactly right for a gate not yet
crossed: `amber` there is an honest in-progress record of an act still owed. A `waiver` passes at
a crossed gate too — it is a review outcome a named reviewer accepted, not an absence of review.

*Crossed* is read from **both** surfaces that can say it: the record's own `status: blessed`, and
the run's conduct state recording that gate `passed` (`process-specs/conduct-state-format.md`).
The two vocabularies stay separate (see the conduct annex below, #837) — but a run can walk
through a gate whose record still reads `pending`, and the evidence rule has to see the crossing,
not the label. The rule applies to the records on the dossier **rail**; an off-rail record from an
earlier run answers to its own run's rules, and accusing a gate crossed before ADR-059 existed of
owing a sheet is the mistake #850 fixed for the conduct annex.

The failure is reported **after** the pages are written or compared, and the build still writes
them: the rendered sheet (below) is the surface the owed review act is performed against, so a
check that withheld the review surface until the review happened would be a deadlock. Its message
names the remedy — the review act, not an edit to the record.

**The sheet is rendered, not summarized (#969).** The builder reads each named sheet and puts
its own words on the gate page: a Mermaid `erDiagram` of the `shape:` section (ADR-053 — Mermaid,
never PlantUML), a plain column table per table (name, type, nullability, key, constraint lines),
and — the half the Software Architect asked for by name — **one short line per use case allowed to
invoke a seam operation whose effect class destroys content already stored** (the kind's danger
classes: `delete`/`ddl`, `DELETE`, `rewrite` — `process-specs/resource-protocol-format.md`),
derived from the sheet's `operations` effect annotations crossed with its `allow` lists, off the
same table the sheet's own `--check` reports from. The reviewer therefore reviews the table design and
what can wipe data, at gate speed, instead of 26 kB of nested YAML per store. Nothing of this is
authored into the record: the sheet stays the single source, which is ADR-059's own rule that the
review and the enforcement read the same file. A sheet the renderer cannot read, or one carrying
no `shape:` section, says so on the page — it never renders an empty box, and it never fails the
build, because the sheet's validator is its own `--check`.

```yaml
resource_protocols:
  # reviewer: the Software Architect, or the named delegate per ADR-058
  reviewer: "Software Architect"
  # Either 'sheets' (below) or, when the system has no ResourceAccess at all, one line:
  #   waiver: "No ResourceAccess in the system — Managers and Engines only, so no sheet can exist."
  sheets:
    # name: the SEAM (the sheet's identity since ADR-065). access: the Access it groups under.
    - name: ISalesStore
      access: SalesAccess
      path: docs/03_Technology/03_Deployment/protocol/ISalesStore.protocol.yaml
      verdict: green
      # on: optional — the day the verdict was given, YYYY-MM-DD. The review surface reads it
      #     as the blessing date of this one sheet (see above).
      on: 2026-08-30
      note: "Optional — e.g. the danger-class ops flagged and accepted."
```

## `deployment_decisions` — the ruled products and the hosting concept (ADR-071, #1247)

**Standing at Contract**, beside `resource_protocols`, and shaped like it. The deployment
view (`deployment-view/3`) carries the Software Architect's rulings — the resource kind and the
concrete product behind every slot, and the hosting operational concept — each stamped
`ruled: { by, on, basis }` on the artefact it governs, made at the START of the resource-designer
pass, before any protocol sheet is authored (ADR-071 §2). This block is the **evidence that those
rulings were made and confirmed**, not a second copy of them: the page renders each row's ruling
**from the deployment view** (#969 — rendered, never restated), and a `verdict: green` says the
named reviewer confirmed the ruling as recorded. A gate reviews evidence; it does not re-decide.

The block carries **either** `rows` with a `source` (the deployment view the rows are read against)
**or** a `waiver` (one line: the system stands on no resource, so there is no product to rule) —
never both, never neither. `reviewer` is mandatory in both cases.

**Totality.** A block that is written is written whole: one row per slot of the deployment view
(Access and Utility slots alike) plus one row named `hosting`, no row for a slot the view does
not carry, and **no row over a decision the view has not ruled** — a row cannot confirm a ruling
that does not exist; the remedy is the ruling. These are build failures whenever the block is
present, pending or crossed.

**Missing at Contract renders OPEN** on a pending record, exactly as `resource_protocols` does.
**Once the gate is crossed** (record `blessed`, or the run's conduct state recording Contract as
`passed`) an absent block, a missing reviewer, or a row at any verdict other than `green` is a
`dossier-check` FAILURE — the #971 rule, unchanged. Blueprint carries no such block: the model is
product- and hosting-free (ADR-048 §1), so a deployment question holds nothing there.

```yaml
deployment_decisions:
  reviewer: "Software Architect"
  source: docs/03_Technology/03_Deployment/deployment-view.yaml
  # Either 'rows' (below) or, when nothing stands on a resource, one line:
  #   waiver: "Managers and Engines only — the system stands on no resource, so there is nothing to rule."
  rows:
    - name: hosting              # the hosting operational concept — always one row
      verdict: green
    - name: sales-store          # one row per SLOT, by slot name (Access or Utility)
      verdict: green
      note: "Optional — e.g. PostgreSQL confirmed against the cost envelope."
```

## `predictions.yaml` — the gate-entry prediction sheet (#941)

Before a gate's checks run, the conductor writes down **what could go wrong here and which
check is expected to catch it** — one sheet per gate, beside the record it will serve. At gate
exit the stage retro diffs the sheet against what actually fired (the `predictions:` block of
the conduct annex, below). The sheet exists on its own merit: it is a cheap way to notice that
a check you were counting on stayed silent. It is **not** run-verdict instrumentation — runs
close with a retrospective, never a verdict (SA ruling 2026-08-23, #941).

Three rules make the sheet honest, and the first is the whole mechanism:

- **Authored at gate entry, committed before the gate's checks run.** Git ordering is the
  proof that the predictions predate the outcomes. A sheet first committed at gate exit is a
  reconstruction — the exact thing the sheet replaces.
- **Never edited after the checks run.** The diff belongs to the conduct annex; the sheet
  stays what was predicted. (Fixing a typo is fine; adding, dropping or rewording a risk after
  the outcome is known is not.)
- **Seriousness is the stage retro's judgement, not the builder's.** A sheet whose diffs never
  produce a `silent` or an `unpredicted` entry across gates is a sheet nobody took seriously,
  and the stage retro says so. The builder checks structure only.

The dossier renders the sheet joined with its diff as a standing section: on a **pending**
gate record of the conducting run, a missing sheet renders OPEN — visible exactly while it can
still be written honestly. A **blessed** record with no sheet renders nothing: unlike the
conduct annex, a prediction sheet cannot be backfilled, by construction, so a permanent OPEN
over history would be noise nobody can act on.

```yaml
format: gate-predictions/1_blueprint
# gate: must match the record.yaml beside this sheet
gate: blueprint
# by: who authored the sheet — the conductor session, naming the SA where he raised the risk
by: "conductor S-041"
rows:
  # id: unique in this sheet; the conduct annex diff references it
  - id: P1
    risk: "The spec layer may pin the inverse of QA-026's ruled direction."
    # named_by: who raised the risk — conductor, SA, a stage session, an issue ref
    named_by: conductor
    # oracle: the check expected to catch the risk if it is real
    oracle: "The reviewer's ruling-quote comparison on the Gate-3 record."
    # if_silent: what the oracle's silence would mean
    if_silent: "A suite at full mutation score asserting a direction nobody verified."
```

The sheet is prediction prose, not a review ask: the check-before-ask sweep does not read it,
and there is no `authority:` mechanism here. A question for the reviewer goes in the record's
`confirm:` list, never in a risk row.

## `conduct` — the conduct annex, standing at the gates the run conducted (ADR-056)

The section is **template-owned and standing at every gate this run crossed**: it renders whether
or not the record carries the block; with no block it renders OPEN — *no conduct annex is
recorded* — so a skipped stage retro is visible at the gate instead of silently absent.

**Standing is decided per gate, from the run's own conduct state (amendment 2026-08-21, #850).**
The run's `state.yaml` names the record of every gate it reached (`gates`, where `passed` requires
`record:` — `conduct-state-format.md`), and the annex is standing at exactly those records. Two
things follow, and both were wrong before: a project whose `docs/04_Gates` rail carries an
**earlier** run's gates — blessed before ADR-056 existed — is never accused of owing an annex those
gates never owed; and a gate **this** run crossed with no stage retro renders OPEN even though the
conduct ledger sits above the project rather than in it (which is where it belongs — #836 — and
which is why the old test, `does the project carry a ledger`, was false in exactly the runs the
section exists for). A project checked out with no run around it, or a gate no run's state names,
shows nothing. An annex a record DOES carry is always rendered — only the missing-annex
placeholder is scoped.

The block is authored by the **stage retro at gate exit** (ADR-056 §5), from the stage's
`session-metrics/1` rows — never hand-computed. Costs are list-price estimates and render as
such. Issues the annex references stay authoritative.

**The cost column is the sessions' own turns; the sub-agents are a second column** (#1070).
A session row's `cost_usd` is what the transcript pre-filter summed over that session's own
transcript, and an in-process `Task`/`Agent` child — an ADR-015 blind peer reviewer, say —
writes a transcript of its own that the sum never sees. Until #1070 nothing added them
anywhere, so a stage that ran eight review rounds priced them at zero on the one surface a
gate quotes outside the room. So `by_role[]` and `totals` may each carry
`subagent_cost_usd` — a list-price estimate or the literal `unmeasured`, refused if it is
neither — and the dossier renders it as its own column with the two summed under the table.
The field is optional, because a gate crossed before it existed cannot carry it, but its
absence is never silent: the dossier prints one line saying the stage's in-process dispatches
are outside every number above, and an absent cell renders *not stated* rather than blank,
which a cost column is read as zero.

**`source` names an in-project COPY of the stage row, not the ledger (#836).** The conduct
ledger is **run-scoped**: it lives at the run workspace's root, above the project, because one
run can touch more than one project. A record may not point out of the project (§3 above), so at
gate exit the stage retro copies `<run-root>/.theagent/conduct/metrics/stage-<rail>.yaml` into the
project beside the record it serves — `docs/…/<gate dir>/stage-<rail>.yaml` — and `source` names
the copy. The copy is **byte-identical** to the row: it is a copy, never an edit, and the builder
re-compares the two whenever the run root is reachable from the project, so a stage row amended
after the gate cannot leave a stale number on the dossier. A project checked out on its own has
no reachable run root and the comparison is skipped, not failed.

**Two surfaces, two words for a crossed gate — do not carry one into the other (#837).** A record
is `blessed` or `pending`; the conduct state (`process-specs/conduct-state-format.md`) records the
same gate as `pending | at-gate | passed`. A conductor writing both in one session wrote `passed`
into two run-4 records, where nothing read them for a whole run. The builder now refuses `passed`
in a record by name, on the rail or off it.

```yaml
conduct:
  # source: the in-project copy, byte-identical to the run's node-design row (#836)
  source: docs/04_Gates/gate-blueprint/node-design.yaml
  node: design
  # summary is read for an ask like any other prose — NOT exempt for being retro-authored;
  # an asking summary declares on this block (#879)
  summary: "One paragraph naming the dominant friction pattern and dispatch-quality observations."
  by_role:
    - role: architect
      cost_usd: 68.90
      # subagent_cost_usd: what this role's in-process Task/Agent children spent (#1070) —
      # a list-price estimate or the literal `unmeasured`. Optional only because a gate
      # crossed before the field existed cannot carry it; state it wherever the stage row's
      # restatement block has it.
      subagent_cost_usd: 21.40
      wall_minutes: 402
      # output_tokens: optional
      output_tokens: 204110
  totals:
    cost_usd: 82.80
    subagent_cost_usd: 21.40
    wall_minutes: 724
  # rework: optional; stage-retro-counted
  rework:
    redispatches: 2
    bounced_checks: 1
  # friction: friction-log entries attributed to the stage
  friction: 3
  # issues: optional; tracker refs become links. A BLOCK list — this format has no inline
  # '[…]' list, and the one that stood here crashed the builder for anyone who copied it (#885).
  # These refs are the stage's OWN — what it filed. Where the annex instead reports the
  # tracker's state at the gate, that citation is the GATE-BLOCKING SUBSET and never a total
  # (#1222, below); `theagent2 conduct tracker --gate <id>` prints it in this shape.
  issues:
    - "#812"
  # predictions: the diff of the gate-entry prediction sheet (#941) against what fired,
  # authored by the stage retro at gate exit. Optional only where no sheet exists (a gate
  # whose entry predates the mechanism); wherever a sheet exists the retro authors the diff.
  predictions:
    # sheet: the gate-entry sheet beside this record, committed before the checks ran
    sheet: docs/04_Gates/gate-blueprint/predictions.yaml
    # outcomes: one entry per sheet row, by id — the diff is TOTAL, every row dispositioned.
    # outcome: fired   — the risk was real and the predicted oracle caught it
    #          silent  — the risk was real and the predicted oracle said NOTHING; the
    #                    strongest finding a sheet can produce, and the reason it exists
    #          nothing — the risk did not materialize at this gate
    outcomes:
      - id: P1
        outcome: fired
        note: "Caught at the ruling-quote comparison, as predicted."
    # unpredicted: what the gate caught that NO row predicted — counts against the sheet,
    # and an accumulation of them is the stage retro's evidence of box-ticking
    unpredicted:
      - text: "The replay caught a re-priced order total no row named."
        ref: "#936"
```

## The issue evidence is the gate-blocking subset (#1222)

Wherever a record cites the tracker as evidence about **what stands between this run and the
blessing** — a `checks[]` row resting on issue counts, an `open[]` item's evidence, the conduct
annex's `issues:` where it reports the tracker rather than the stage's own filings — **it cites
the issues that block THIS gate, and says so. Never the total open count.**

The total is the pile, and the pile is not what a gate turns on. Measured on 2026-09-01: a
run's tracker held **82 open issues, 80 of them carrying no label at all**, no milestone and
no deferred state, while the frontier that actually governed the gate was **four red checks**.
A record that had cited "82 open" would have been accurate and useless in the same line — the
reviewer cannot tell from it whether anything stands between the run and the blessing.

- **The subset is defined by the run's own declared label** for that gate — `tracker.blocking.<gate>`
  in `conduct-state-format.md`. The labels are declared per run and never shipped by the
  toolchain: a record on a project whose tracker uses different words is unaffected.
- **`theagent2 conduct tracker --gate <id>` prints the block**, with the count line above it
  (`N of M open issues carry '<label>'`), so the citation is copied rather than counted by
  hand — and so the subset always says what it is a subset of. A run that declares no labels
  has no subset to cite and carries the key as it always did.
- **A number in the record still names what it does not reach.** The subset is a score-shaped
  claim like any other: the scope-and-limit rule below applies unchanged — "issues carrying
  the gate's blocking label" does not mean "everything that could stop this gate", it means
  everything somebody labelled.

## Scope-and-limit lines, confirm items, carried items (ADR-060, #818)

Born from the run-4 Gate-3 bounce ("that is luck, not process"): the owner's one request
about measurement — *"when you put a number in front of me, tell me what it measures and
what it does not"* — plus the two comparisons that gate performed only by human reading.
Three build-enforced rules:

- **A bare percentage is refused.** Any `checks[]` row whose `result` carries a score (a
  percentage, or an `X/Y` count) must carry `not_covered:` — one or more lines naming what
  in the gate's scope the number does **not** reach. Same for a measured `suite_strength`
  pass (block-level `not_covered:`). The detector errs toward asking: if a non-score number
  trips it, scope it or rephrase.
- **A green check with no stated limit is refused.** On a **pending** record, every `checks[]`
  row whose `verdict` is `green` must carry `not_covered:` — see *A green row says what it did
  not look at* below. Rendered **beside the verdict**, in reading type, on the dossier.
- **Confirm items name their authority.** The optional `confirm:` list puts each confirmation
  asked of the reviewer beside the thing it rests on, and `authority:` is required on every
  item — see *Confirm items name their authority* below.
- **An ask names its authority wherever it is written.** Any string in the record whose prose
  asks the reviewer to confirm something answers to the same rule, on the mapping that carries
  it — the duty is about the request, not the field it is written in (#862, #873, #879). A short
  exempt list names the keys where a request cannot be written; everything else is read. See
  *The ask follows the request* below.
- **Nothing crosses a gate quietly.** On every **pending** gate record (blessed records are
  history and are not edited retroactively): each item still `state: open` on an earlier
  gate's record must re-appear in `open[]` (as `open`, or `closed` with its closure shown),
  and each `deferred:` ruling in the ledger must appear among the open items by its issue
  ref — a deferred-scope ruling re-surfaces at every gate until its step is drawn (the
  gate-record half of the qa-ledger `deferred` mechanic, #840).

## A green row says what it did not look at (#1221)

`not_covered:` is **required on every `checks[]` row whose `verdict` is `green`**, on a
**pending** record. Not a style rule — a green row is where a reviewer stops reading, so it is
the row that has to state its own limits.

The case that made it required: on the Figaro run `seqmap complete` stood **GREEN — 0 findings,
15 BPs, 27 SIs**, measured first-hand the evening before a stakeholder walk. The walk hit a
cross-pool hand-off that was drawn in the `.bpd`, present identically in both process levels,
written into the SI markdown as step 5 of 5 — and **absent from the Sequence Map the mockup
walks**. Nothing was wrong with the check. `seqmap complete` verifies SI ids and gateway edges;
it never looks *inside* an SI, so it measures the **binding, not the coverage**. The row said
`green` and nothing else, and a reader took "complete, green" to mean the drawn flows are
implemented — more than the check ever said.

So:

- Every green row carries one or more `not_covered:` lines naming what the check does **not**
  reach. Write the check's *scope boundary*, not an apology: "verifies SI ids and gateway edges,
  never the steps inside an SI".
- **Red rows are exempt** — a red row argues itself; nobody reads a failure as a guarantee.
  `amber`, `info` and `waiver` rows are not required to carry one either (a waiver carries
  `reason:`/`unblocked_by:` instead), though the score rule above still applies to any of them.
- **Pending records only.** A blessed record is history and is not edited retroactively — the
  same carve-out the carried-item rule makes. Every record passes through `pending` on the way
  to blessed, so the rule reaches every gate conducted from here on; records blessed before it
  existed are left as they are and gain nothing retroactively.
- It renders **beside the verdict**, in reading type — not under the result in footnote italics.
  A limit one column away from the chip, in the type a reader is trained to skip, is a limit
  disclosed after the conclusion is already formed (the #1049 lesson about undifferentiated
  presentation).

## Confirm items name their authority (ADR-056 §1c, #845)

The lintable half of the **check before ask** duty. Every item a record asks a reviewer to
*confirm* rests on one of exactly two things, and they are **different requests** the reviewer
is entitled to tell apart:

| shape | fields | the request being made |
|---|---|---|
| a ruling covers it | `authority: QA-0NN` + `ruling:` (the ledger answer, verbatim) | *confirm my reading of this ruling* — the reviewer compares the assertion against the quote |
| no ruling covers it | `authority: none` + `basis:` (one line: what was checked, what it found) | *make a judgement call* — the reviewer decides something no ruling has decided |

Build-enforced, **structure not content**:

- `authority:` is required, and is either `QA-###` or the literal `none`; anything else fails.
- With a ruling id: `ruling:` must be present and non-empty, and with `qa_ledger:` set in
  `dossier.yaml` it must equal the ledger's `answer` verbatim (whitespace-normalized) — a
  paraphrase, or a quote of a superseded reading, fails the build. This is the side-by-side
  collision that catches a QA-026-style inversion at the surface instead of by luck. `basis:`
  is refused here: a cited ruling speaks for itself.
- **A superseded ruling fails the build, at all four gates** (#944, ADR-060 amendment
  2026-08-23). The verbatim comparison above catches an answer that was *reworded*; it cannot
  catch one that was *replaced*, because the quoted entry's own text never moves. So an item whose
  `authority:` names a ruling that a later entry declares it `supersedes` fails, and the message
  names the replacement. Run 4's Gate-3 bounce is the precedent — QA-028 replaced QA-026, and a
  record quoting QA-026 perfectly would still have been quoting the wrong rule. Not scoped to the
  later gates: the artifact asserting the wrong rule in Run 4 was the **business-tier** written
  description of pricing, which the owner forbade anyone to quote until corrected (#787).
- With `none`: `basis:` must be present and non-empty, and `ruling:` is refused — the
  declaration is the point, and an undeclared judgement call reads as a quoted reading.
- The predecessor field `qa:` is gone; an item still carrying it fails with a pointer to
  `authority:`.
- **A quoted ruling must resolve a digest** (#1049, SA ruling 2026-08-26). A verbatim answer
  can run to thousands of characters, and a surface that renders four of them whole is a
  surface the reviewer scrolls past. So the dossier and the Studio review panel render a
  two-or-three-sentence **Lesart** and put the quote one expander away — which only works if a
  Lesart exists. Resolution order, and there is no third source:

  1. `digest:` written on the confirm item itself — for a reading narrower than the ledger's
     own summary, or for an authority that is not a ledger entry;
  2. the `digest:` of the ledger entry `authority:` names (`qa-ledger-format.md`) — the usual
     home, because one digest there serves every surface that quotes the ruling.

  An item that resolves neither **fails the build**. `authority: none` resolves nothing and
  needs nothing: its `basis` line *is* the plain reading, so a `digest:` beside it is refused —
  a summary of a summary.

  The anti-paraphrase guard is the same three rules the ledger carries, and the surfaces state
  them where they render: the digest is **non-authoritative** (the quote governs, and the
  expanded block says so in as many words), it **names the ruling** it summarizes, and it
  covers the **current state only** — no history, no supersession narrative, no decision dates.

An item that can name **neither** authority is not a judgement call — it is an unchecked
assertion, and it is the conductor's to resolve before assembly, not the reviewer's. The build
refuses it rather than letting it reach a human (ADR-056 §1c; Run 4 spent six rulings on
questions whose answers were already on disk).

The dossier renders the label beside every item — *CONFIRM A READING* with the quote, or
*JUDGEMENT CALL* with its basis — so the distinction is visible without reading the record.
Whether a reading is **right** stays the reviewer's call; the build only checks that the
authority is declared and internally consistent.

## The ask follows the request (ADR-056 §1c, #862, #873, #879)

The `confirm:` list is where a confirmation *belongs*, not the only place one can be written. The
same ask parked in a `checks[]` `result`, a `sections[]` `blurb`, an artifact `note`, a survivor
`disposition` or the record's own `lede` is the same request to the same human, so the build reads
**every string the record carries** for confirm-shaped prose and holds whatever carries an asking
string to the authority rules above — `authority: QA-0NN` + `ruling:`, or `authority: none` +
`basis:`. Three ways forward, and no fourth:

| the row | what to do |
|---|---|
| it belongs on the confirm surface | move it to `confirm:` |
| it is evidence *and* an ask (a tracked open item with a `ref`, an amber check row) | keep it where it is and name its authority there |
| the words are not a request at all | `not_an_ask:` — one line saying why |

**The read list is inverted, and this is the point (#879).** #862 named two fields, #873 a third,
and each of the last two was found the same way: someone verified the previous fix against the
tree and found the ask one field further along. A list of the fields that *are* read is a list
that stays one field short until somebody looks. So the build reads everything and exempts a
short, named set instead:

| exempt key | why a request cannot be written there |
|---|---|
| `authority`, `ruling`, `basis`, `not_an_ask`, `digest` | the declaration itself. `ruling:` quotes the owner's answer **verbatim**, and that answer is very often the words of a request, because the question it answered was one; `basis:` says what was checked; `not_an_ask:` says why the words are not a request; `digest:` is the Lesart *of* a ruling, so it inherits the same wording one step removed. Reading these would fail a correctly declared row on its own declaration. |
| `format`, `gate`, `status`, `verdict`, `state` | closed vocabularies, each checked against its own set |
| `path`, `source`, `model`, `ref`, `issues` | paths and references — existence-checked, rendered as links |

Nothing else is exempt, and a field added to this format is covered the day it is added rather
than the day the omission is noticed. Numeric fields carry no exemption because they need none: a
count, a score or a wall time cannot read as a request, and an exemption that never fires is a
claim nobody checks.

**Which thing must declare.** The mapping that carries the asking string, because that is what an
author edits: the `checks[]` row for its `result`, the section for its `blurb`, the artifact for
its `note`, the survivor for its `disposition`, the `conduct:` annex for its `summary`, and — for
the record's own top-level prose (`lede`, `disposition`, `status_label`) — **the record**, whose
`authority:`/`ruling:`/`basis:`/`not_an_ask:` sit at the top level beside `status:`. One
declaration answers for the whole mapping.

Two fields have no place to track a request and are steered accordingly. A **`sections[]` blurb**
says what a group of artifacts *is*; **top-level record prose** says what the gate decided. A
request written in either is tracked, answered and closed nowhere, so for both the first way
forward is to move it — to `confirm:`, or to `open:` where it carries a `ref`. The other two ways
stay available because the detector errs toward asking, and a rule with no escape hatch would turn
a blessed record red with rewriting its ruled prose as the only way out.

**The `conduct:` annex is read like anything else, and is deliberately not exempt.** Its `summary`
is retro-authored audit prose about the run rather than a request to the gate's reviewer, which is
an argument for exempting it — but the annex is prose a human wrote about a run that had open
questions, so a request *can* land there, and an exemption would be a blind spot in exactly the
place the argument says to stop looking. Instead the annex declares on its own block, in one line,
the same way a row does.

The detector **errs toward asking**, like the bare-percentage one: an imperative `confirm`
opening a sentence trips it whether or not a request was meant. `confirm` as a noun, a name or
a past tense (*"the confirm writes regardless"*, *"ConfirmBooking"*, *"confirmed
byte-identical"*) does not — the imperative arm needs a sentence boundary before the verb and
an object after it.

`not_an_ask:` is the way out of a false positive, and it is a **declaration, not a switch**: a
line saying why the words are not a request, on the row, where the next reader finds it. The
reservations run's *"Confirm and amend re-check at commit time"* is the standing example — the
ruled name of a design response (business rule BR-R05), which the system performs and which
asks nobody for anything. A `not_an_ask:` on prose that reads as no request is refused too: a
dead declaration outlives the phrasing it excused and would silence a later edit.

The rule is enforced on every gate record **in the project, on the rail or off it** — a record
that asked an unauthorised question asked it whichever run's rail it hangs from. Off the rail the
sweep reads lines rather than parsing (another run's record may use a YAML shape the strict parser
refuses), so it checks that an asking value's carrier — the enclosing list row, the enclosing
block, or the record at column zero — names `authority:` or `not_an_ask:` at all; which shape it
is, and whether a quote matches the ledger word for word, is checked on the rail.

Wherever the ask sits, its authority **renders beside the prose that asks** — the quoted ruling,
or *judgement call* with its basis — so the reviewer compares a reading rather than trusting it.
`not_an_ask:` renders nothing.

## Verdict taxonomy (template-owned, closed set)

| verdict | renders as | meaning |
|---|---|---|
| `green` | PASS | mechanically checked or recorded as passed |
| `amber` | RULING OWED | a decision owed to the reviewer — not a defect |
| `red` | OPEN | an open defect or blocker |
| `info` | NOTE | context the reviewer should see; no action implied |
| `waiver` | WAIVED | the check could not run, and a named person accepted that (`checks:` rows only) |

`waiver` is legal in `checks:` alone. The `suite_strength` and `resource_protocols` blocks each
carry a block-level `waiver:` of their own, and a row-level one inside them would be a second way
to say the same thing.

## Waiving a check (#1071, ADR-058 §3)

ADR-058 §3 binds every mechanical exit check: **run green, or explicitly waived in writing in the
gate record, with the reason. No check is ever skipped silently.** Until `waiver` existed, an
author who could not run a check had no way of saying so *in the evidence table* — the honest
options were prose somewhere else, or nothing, and nothing is easier. That is how a skipped check
and a passing one came to look identical.

A waived row carries **no `result:`** (a waived check produced none, and a row carrying both would
let a stale measurement pose as the reason nothing was measured) and three mandatory fields:

| field | what it says |
|---|---|
| `reason` | why the check could not be run |
| `accepted_by` | who accepted the waiver — a waiver is a review outcome, accepted by a named person, never an omission |
| `unblocked_by` | what would make it runnable |

The third is the Software Architect's #939 ruling — *every expected failure names the thing that
will remove it* — applied at the gate instead of at the build. The `source`/`ref` rule is
unchanged: a waived row still needs one, and on a waiver it is normally the issue that will lift it.

## Required checks (#1071)

Each gate owes a fixed set of mechanical checks. The set is **template-owned** — it ships in
`dossier-build.mjs` beside the rail and the gate vocabulary, and lands in every project
identically. A row answers for a required check by its **`id:`**, never by its `name:` prose,
so a record may word the row however it reads best.

| gate | required check ids |
|---|---|
| Intent | `intent-entry-check`, `qa-check` |
| Blueprint | `seqmap-complete`, `seqmap-replay`, `call-chains-check`, `qa-check`, `promotion-gate` |
| Contract | `spec-lint`, `spec-seqcheck`, `construction-entry-check`, `store-seam-check`, `call-chains-check`, `resource-protocol-check` |
| Acceptance | `acceptance-partition`, `client-e2e` |

Every id above is one a process document already binds to that gate; the builder carries the
citation per entry and prints it when the row is missing.

**A required check with no row renders OPEN** on a `pending` gate page, exactly as an absent
`suite_strength` block does — the gap is visible while it can still be closed. It is not
rendered on a record already `blessed`: like a prediction sheet, an evidence row cannot be
backfilled honestly, and a permanent OPEN over history is noise nobody can act on.

**It BLOCKS** — a `dossier-build --check` failure, reported after the pages are written — once
the gate is **crossed** (the record's own `blessed`, or the run's conduct state recording the
gate `passed`) **and the record is one this run conducted**, read from the run's conduct state
exactly as the conduct annex reads it. A gate crossed by an earlier run answers to that run's
rules; accusing it of owing a row that did not exist then is the #850 mistake.

What this does **not** reach, said plainly rather than left to be discovered: a project building
a dossier outside a conducted run gets the OPEN placeholder and no block. The block is scoped to
the run that crossed the gate because that run is the only party who can still act on it.

## Regeneration

```sh
dossier-build <project-root>          # writes docs/04_Gates/*.html
dossier-build <project-root> --check  # exit 1 on drift or missing artifacts
```

Deterministic: identical inputs produce byte-identical pages (no timestamps).
