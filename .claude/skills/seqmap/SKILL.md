---
name: seqmap
description: "Sequence-Map tooling over the tagged .bpd business-process sources. Verbs: `generate`, `check`, `complete`, `unused`, `sequence`, `si-docs`, `replay` — what each does, and what it validates, is in the skill body (## Commands). Activate when asked to generate, regenerate, validate, or check the Sequence Map / seqmap, when the BPs' .bpd sources or the screen models changed, when the mockup runtime needs its expectation map, when a new business process reuses a System Interaction the system already has (the reuse.yaml sidecar), when a source or a screen model still carries a retired BPxx-SIaa.bb id or a Design-tier SIxx.yy, when asked to replay/verify walkthrough logs or check Blueprint walkthrough coverage, when asked whether the System Interaction documents still match the model (or the other way round), when asked which operations, facets or DTOs are unused/dead/ballast or whether anything in the model is unreachable from the business design, or when asked to run/check model↔BPMN completeness, the binding, or Blueprint readiness. Formats: process-specs/seqmap-format.md, si-binding-format.md, walkthrough-log-format.md."
---

# seqmap — the Sequence Map from tagged `.bpd` sources

Mockup builds the clickable mockup **before any Method model exists** (ADR-040 §2). The
mature Sequence Map is a projection of the architecture model (ADR-037 §2); its Mockup-stage
stand-in is derived from what already exists machine-readably: the tagged `.bpd` single
sources (one per BP, tooling contract §1) and — once authored — the screen models.

**Two populations, one map shape (ADR-069, #1196).** A drawn call and a System Interaction are
**two things**, related many-to-one:

- a **call site** `BPxx.yy` is the system chain a business process DRAWS — the block, however it
  is started (a step's send, a timer, the scheduler, a cross-process continuation). It belongs to
  that process, is minted when the block is drawn with **no project-wide question to answer**, and
  is what every MOCKUP artifact speaks: the `.bpd` block tag, the `.vw` action key, the mockup key,
  the walkthrough log. **A drawing never names a System Interaction** — one that does is refused.
- a **System Interaction** `SIxx.yy` is the operation on a Manager facet — what the SYSTEM offers.
  It belongs to the system, is minted at **Design**, and is what every model-tier artifact speaks.

`si-binding.yaml` is the **only** place they meet, and which call site resolves to which
interaction is discovered during Design — reuse is not visible from a first drawing.

**Nothing is ever rewritten** (ADR-066's win, preserved): a Mockup map and a Design map key on the
*same* call sites, so there is no `binding: provisional | bound` discriminator, no
`operations[].home`, no `rebind`, and no `--binding` translation on `replay`. Design regenerates
the same map **enriched** with what only the model and the binding know: the resolved `si`, its
use-case name, the permutation the block exercises and the facet·operation it lands on. A source
still carrying a `BPxx-SIaa.bb` id is refused with the migration path — that scheme is retired,
with no compatibility spelling.

Format specification: `process-specs/seqmap-format.md` (single source for the shape; do not
restate it here or elsewhere). theagent2 ships the process-spec set as `process-specs/`, next
to the `agents/` and `skills/` it installs.

## The verbs, in one paragraph

This paragraph stood in the skill's frontmatter `description` — the text every session's skill listing carries on every request, whether or not it ever touches a Sequence Map — and moved here VERBATIM (#1322). The `description` keeps the activation clause; this is the what.

Mockup (ADR-040 §2): generate the Sequence Map — the machine-readable {from, to, operation} expectation map that drives the clickable mockup, the walkthrough log and the Blueprint walkthrough-replay regression; every drawn system chain is one CALL SITE, keyed by its BPxx.yy id (ADR-069: minted when the block is drawn, belongs to its business process, never rewritten); derives per-BP interactions and a gateway-edge-covering path set (branches and loops included), optionally joins the screen models (action `calls` → BPxx.yy call sites), emits one deterministic JSON map. Design (ADR-041 as amended by ADR-069): `complete` — the model↔BPMN completeness check gating Blueprint (tagged .bpd × SI binding map × ReadArchitecture model JSON; every drawn call site of a live process resolves to exactly one System Interaction AND one permutation of it, many-to-one is normal, every interaction and every permutation is drawn by somebody, a rationale on every reuse, no system-side gateway edge unrealized, no model use case beyond the business design); `generate --binding --model` — the same map on the same ids, ENRICHED with the model's facet·operation per SI, with the completeness check embedded; with `--si <si-export dir>` also the ADR-068 refinement check ([C14] every drawn box and system-side send bound and realized, [C15] no model step without a business box above it); `unused` — which facets and operations does nothing reach: reachability from the drawn call sites (roots = callSites rows + gateway-realized permutations, `.bpd` `status` honoured), marking every operation USED / DEAD-BRANCH-ONLY / ORPHAN and rolling facets up, exempt on a `lifecycle: future` component, on a use case the model declares `future|retired` (#1320/#1360 — the tombstone `complete` reads), or on the `Utilities` LAYER (#1242 — a cross-cutting call is drawn by no sequence step, so those rows read UTILITY, not ORPHAN), `--dtos` for the DTO closure, `--check` as a gate; decisive or nothing — an unbound call-site row or a `throw` in a live block aborts rather than softening the answer; a finding is red, never a deletion instruction, and the tool never mutates; `sequence` — emit the sns-cli mutation script that generates ONE DRAWN BLOCK's sequence from block × binding (never hand-authored); `si-docs` — the SI markdown <-> model reconciliation (SI documents x model use cases, both directions, no .bpd needed), with `--binding <si-binding.yaml>` also reading the GENERATED ADR-069 call-site export `BPxx.yy_Name.md` as a second document class joined through the binding map's callSites list (#1359 — the export carries no SI id by design, and a project that retired the hand-written class still has a written surface, so the empty-set guard refuses an empty read of BOTH classes); a source whose .bpd header declares `status dissolved|retired|parked` is left OUT of the generated map by default (#1243) — the generators (`generate`, `check`, `sequence`) skip it, name it on stderr and record it under the map's `nonLive`, `--include-parked` puts it back, while the inspectors (`complete`, `unused`) never skip because [C13] must still catch a dissolved/retired process that is still wired into the binding (a PARKED process's rows are kept for revival and its interaction is [C9-parked], a warning, #1252); `replay` — the walkthrough-replay regression (approved walklog/1 logs re-verified against a regenerated map: bp+branches identity derived through the map's flow graphs — never covering-set membership (#852) — loop-aware step-cycle cursor, --gate = every covering-set gateway edge and start walked; guards Specification–Construction).

## Commands

```sh
node bin/seqmap.mjs generate <dir|files...> [--screens <dir>] [-o out.json] [--include-parked]
node bin/seqmap.mjs generate <dir|files...> --binding <si-binding.yaml> --model <model.json> [--screens <dir>] [-o out.json]
node bin/seqmap.mjs check    <seqmap.json> <dir|files...> [--screens <dir>] [--binding ... --model ...] [--include-parked]
node bin/seqmap.mjs complete <dir|files...> --binding <si-binding.yaml> --model <model.json> [--screens <dir>] [--si <si-export dir>]
node bin/seqmap.mjs unused   <dir|files...> --binding <si-binding.yaml> --model <model.json> [--dtos] [--format table|json] [--check]
node bin/seqmap.mjs sequence <dir|files...> --binding <map> --model <model.json> --si <si-export dir> --call-site BPxx.yy [--client <Comp>] [--manager <Comp>]
node bin/seqmap.mjs si-docs  <SI markdown dir|files...> --model <model.json> [--binding <si-binding.yaml>]
node bin/seqmap.mjs replay   <seqmap.json> <walklog dir|files...> [--gate]
```

- `generate` — parse the tagged `.bpd` set (a directory takes all `*.bpd` in it), derive the
  map, validate, write JSON. Deterministic: same sources → byte-identical output. A
  **`feasibility.yaml`** sidecar next to the sources (seqmap-feasibility/1, #419) is
  auto-discovered: authored per-edge constraints (`requires` / order-aware `excludes`,
  rationale mandatory) prune data-infeasible branch combinations from the covering path
  set, with the affected edges re-covered via feasible prefixes; the map records the
  sidecar under `feasibility`. Also honored by `check` and `complete`.
  A **`reuse.yaml`** sidecar (seqmap-reuse/1, #635; rekeyed by ADR-069 §4) is auto-discovered
  the same way: it declares, at MOCKUP, that a drawn call **reuses a System Interaction the
  system already has** (`si:` = the CALL SITE whose target is constrained, `rationale:`
  mandatory). It is written from the drawing, so it can only name what the drawing names. Its
  job is to BIND DESIGN'S HANDS, and nothing else in `si-binding/2` can do it. The map records
  `operations[callSite].reused: true` plus `reuse: ["reuse.yaml"]`; `complete` `[C12]` enforces it.
- `check` — regenerate in memory and fail (exit 1) if the committed map differs. The map is
  GENERATED, never hand-edited; wire `check` wherever the BPs are linted.
- `sequence` — **Design** (#1182/ADR-068, ADR-069 §3): emit the `theagent2 sns mutate` script that
  realizes ONE DRAWN BLOCK in the model — the use-case sequence GENERATED from block × binding,
  never hand-authored. The invocation names a **call site**, not an interaction: an interaction
  may be resolved to by several blocks that legitimately differ, and a union across them has no
  drawing order, which is the only thing a sequence can be generated from. Boxes in drawing order (a request-variant edge selects
  its branch per permutation; outcome-edge branches fold into the one permutation, their paths
  declared as SequencePaths afterwards); `{ operation }` boxes and bound sends become
  Manager-caller steps, `{ internal }` boxes become `--step-kind internal` steps. Step 0 (the
  client hop) carries no operation of its own — ADR-067 (#1186) hoisted it — so the script ends
  with ONE `SetUseCaseOperation` line for the whole use case, the one place a human fills in the
  client-facing operation the drawn block does not name. The tool NEVER mutates — the architect
  reviews the script and applies it on the draft; the `[C14]`/`[C15]` refinement judges the result.
- `unused` — **Design**: *what does nothing reach.* The reachability answer to "which facets and
  operations are dead", over the same three sources `complete` joins. **Reference counting cannot
  answer it** — a pointer from a dead branch is still a pointer, and on the run this was measured
  against 100 of 102 operations had one — and **`[C9]` alone is dangerous**: it answers half the
  question, at permutation level, and all four permutations it reported on that run were drawn.
  So the walk starts at the DRAWN entries: every `callSites` row (its named `permutation:`, plus
  every `edges[].realizedBy.permutation`) is a root, `.bpd` `status parked` / `status dissolved`
  takes its process out of the live inventory, and each permutation is `DRAWN`, `PARKED` (#1256 —
  only a parked process's rows ask for it) or `UNDRAWN`. **A PARKED row that names no permutation
  asks for every permutation of its interaction** (#1431): the live form of that input aborts —
  the variant is unknown, so nothing under it can be confirmed *or condemned* — and taking the
  named permutations alone made the same input silently condemn, marking the front door `PARKED`
  and everything behind it a `--check`-red finding on a **parked** process. A parked drawing owes
  the missing branch and nobody is being asked to supply it. Parked-ness is read from the `.bpd`
  header's own `status` line and nowhere else — the header is the truth, the folder its mirror.
  Every operation is then marked `USED` / `DEAD-BRANCH-ONLY` / `ORPHAN` — the best state any root
  reaches it through — and **a facet is unused iff every operation on it is**. A use case's
  declared entry operation (ADR-067) is USED as soon as a live call site resolves to its
  interaction: the drawn block enters the Manager, and which request variant it selects is a
  question one level down.
  **The intent inputs are the two lifecycles the MODEL already carries.** The component's
  `lifecycle` (ADR-027 §5): everything on a `lifecycle: future` component is exempt. And the USE
  CASE's own `lifecycle: future|retired` (#1320) — the tombstone `seqmap complete` already reads
  — which exempts an operation only when EVERY route that reaches it runs through a use case the
  design says it is not building (#1360: two checks over one model fact must not give opposite
  verdicts). An ORPHAN reached by nothing is never exempt, and one live route makes an operation
  USED rather than exempt. Every row says which exemption it carries (`exemptBy`). There is no
  per-operation "deliberately unwired" marker, on purpose — one would silence exactly the
  findings that point at open, load-bearing gaps, and a justification written into a description
  is prose, which this walk never reads.
  **The third exemption is not a lifecycle but the component's LAYER** (#1242): a `Utilities`
  component is reached by no sequence step *on purpose* — sequences mirror Manager orchestration
  (ADR-031) and a cross-cutting call flows through the iFX ambient context rather than as a drawn
  step (ADR-061) — so reachability from drawn call sites is the **wrong question** for that layer,
  which is what the drafting completeness checklist has always said *by LAYER, not by the name of
  the thing*. An unreached operation (or facet) on a Utilities component therefore reads
  **`UTILITY`**, never `USED`: it is printed with the rule that exempts it, counted apart
  (`exemptOnUtilitiesLayer`), and never `--check`-red. It hides no positive fact — a Utility a
  live drawing does reach still reads `USED` (ADR-074: a `service` Utility is a legal sequence
  tail; only a `library` one has no boundary to cross), and a Utility already declared
  `lifecycle: future` keeps that exemption, spelled the way the model spelled it. The point is
  that a project modelling a live utility no longer has to write `lifecycle: future` on a
  component it is building — a lie in the one machine-readable deferral statement this walk trusts.
  **A finding is red, NEVER a deletion instruction** (Software Architect, 2026-09-04): the report
  names the owner — `lifecycle: future`, or an open issue — or hands it to the human, and the tool
  prints and never mutates. `--dtos` runs the same walk over the DTO graph (transitive closure
  from every operation's `inputDtoId`/`outputDtoId` across field types and `{Base}_{Variant}`
  relations; **DTO fields are explicitly out of scope**). `--format json` is the sheet the
  step-2 conversation is built from — every operation with its mark, live call count and call
  sites.
  **THE ANSWER IS DECISIVE OR THERE IS NO ANSWER.** Every input that would leave the root set
  incomplete **aborts** (exit ≠ 0, nothing emitted, all unmet preconditions reported together),
  rather than being carried as a softer mark:
  a binding row naming a permutation the model does not have; two operations sharing a qualified
  name; a `.bpd` drawing a call site with neither a binding row nor a `status` declaration;
  **a live `callSites` row that names no permutation** (the block is drawn, but the request
  variant it exercises is unknown, so nothing under that interaction can be confirmed or
  condemned — `complete`'s `[C1]`, refused here because an answer computed over it is not weaker
  but unsound); and **a `throw` in a live drawn block** — the one step construct with **no binding
  form**, so a chain it starts is a root nothing can name. `throw` is retired for exactly this
  reason (bpmn-tools#54) and the refusal carries the replacement, `:task;` + `send "…" to
  <handle>`, whose receiving `messageStart` → `call` block yields a real call site this walk
  already follows.
  `--check` additionally exits 1 when any operation is `ORPHAN` / `DEAD-BRANCH-ONLY` on a
  component that is not `future` — the gate half, so a newly introduced orphan surfaces at the
  next gate instead of accruing silently.
- `complete` — **Design** (ADR-041, #411): the model↔BPMN completeness check, the Blueprint
  mechanical gate. Joins the tagged `.bpd` set × the SI binding map
  (`process-specs/si-binding-format.md`) × the model (`ReadArchitecture` JSON, envelope or
  bare — redirect `theagent2 sns read --kind ReadArchitecture` to a file). Fails on: drawn blocks
  with no `callSites` row, rows that draw nothing, missing/empty model use cases, undeclared or
  dead system-side gateway-edge realizations, interactions and permutations nothing draws,
  unresolvable screen actions. **`[C11]`** joins the use case against the model's operation catalog: every
  sequence step must resolve to a real facet operation, and so must the use case's own
  **declared** operation (`useCases[].operationId`, ADR-067/#1186 — one SI is ONE operation
  call, said once on the use case, with permutation step 0 derived from it). The check that
  every permutation ENTERS through the same operation is retired with that ADR: the model can
  no longer hold two answers, so there is nothing to compare (SNS's `Gate.UseCaseOperationUndeclared`
  is what refuses a use case that draws steps and declares nothing).
  **Totality runs over the LIVE CALL SITES** and is plain id equality: every drawn block of a
  live process has exactly ONE `callSites` row, and a row naming a call site no supplied source
  draws is a dead row. There is no `si: none` — a drawn block the system does not realize is a
  business-design finding and a change-loop re-entry, not a disposition expressible in this file.
  **Injectivity is DROPPED** (ADR-069 §8): many call sites resolving to one interaction is the
  normal case — it is the reuse a first drawing cannot see — so "no duplicate `si`" now applies
  **within `interactions:`** only. Three rules replace it:
  **`[C9]` in reverse** — an interaction no call site resolves to, or a permutation no call site
  exercises, is a use case (or a request variant) beyond the business design (one that only rows
  of a **parked** process resolve to is `[C9-parked]`, a standing warning naming what revives it —
  drawn, not built, revivable; #1252);
  **the mandatory rationale** — the FIRST row on an interaction owes none, every subsequent one
  must carry a non-empty `rationale:`, because declaring that the system creates nothing new for
  this block is a design finding and is stated where the finding is made (ADR-069 §7);
  **`[C16]`** — two call sites on the same `(si, permutation)` must declare the same activities,
  and the error names BOTH SIDES and what differs, so the reader is handed the disagreement rather
  than a verdict. Equality is **never** required across one *interaction*: different permutations
  of one operation ought to draw differently, and demanding otherwise would forbid the polymorphic
  request-DTO pattern the Method is built on (ADR-069 §6).
  Each row names **exactly one** permutation, or its block's gateway names them per branch — both
  is a contradiction, neither leaves the sequence ungenerable.
  The `aliasOf` record is **deleted** (ADR-069 §4): with the two populations separate, "these two
  are one operation" is two rows pointing at one `si`, the ordinary case rather than an exception.
  A map still carrying `aliasOf:`, `bindings:` or `provisional:` is refused with its migration path.
  **With `--si <si-export dir>` (#1182/ADR-068) it is also the REFINEMENT check**: the binding's
  `boxes:`/`sends:` sections bind every drawn box (`{ operation | internal | expands }` — an
  ADR-061 internal step is a legal realization, never a dropped box) and every system-side send
  (`{ operation | event }`), matched on verbatim labels against the exports (`bpmn-dsl
  si-export`, `si-export/3` — **one `BPxx.yy.json` per CALL SITE**, ADR-069 §5, bpmn-tools
  ≥ 3.0.0). The export is looked up by the row's call site, so the box universe is the block
  actually drawn rather than the union across every block bound to one interaction. A directory
  still holding the retired `SIxx.yy.json` exports is REFUSED rather than half-read: skipping
  them silently let the check report green over stale content (#1210).
  `[C14]`: totality both ways, ref resolution (qualify an ambiguous bare name),
  declarations the sequence does not realize yet. `[C15]`: no model step without a business box
  above it — step 0 (the client hop) excepted. `[C11]` reads the step `kind`: internal steps
  are accepted mid-sequence and refused at the client hop.
  Cheap loose-stage feedback; gates only when presented at Blueprint (ADR-040 §8).
  **It is a WHOLE-design check** and says so when it is not given one (`[C0]`, #636): handed a
  subset — some of the sources, a binding map covering part of the SI universe — it refuses
  with the partial input named, instead of reporting the part you did not supply as defects.
  Give it every tagged `.bpd`, the project's whole `si-binding.yaml`, and all screen models.
  **`[C12]`** checks the reuse declarations (#635, rekeyed by ADR-069 §4): the declared **call
  site** must be bound, and the interaction it resolves to must be one OTHER call sites already
  resolve to. An interaction reached by this call alone is one **Design minted for it** — which
  is exactly what the Mockup-stage declaration forbade, and which nothing else would catch,
  because a first row owes no rationale.
  **`[C13]`** checks the non-live processes (#1148, which subsumed #1055's hand-written
  `historical:` list): a block a **const** source still carries although the business
  process was dissolved (or retired/parked) binds to nothing, and the **source itself says
  so** — its `.bpd` header carries `status dissolved -> <Successor> ["reason"]` (bpmn-dsl
  ≥ 1.16.0). The declaration is how totality is satisfied without a `callSites` row: every drawn
  block of a non-live process owes no use case, its gateway edges owe no realization, and since
  #1243 **the whole source stays out of the generated map** (see *Non-live sources* below). A
  block of a **live** process is still `[C2]`; a row that names a dissolved or retired block is
  `[C13]`; a map that still carries a `historical:` list is refused with the migration path.
  **Parked is the one state whose rows are kept** (#1252): the row is the only record of which
  interaction the parked block resolves to, so it stays — held to no drawing-side check, never
  generated — and an interaction only such rows resolve to is `[C9-parked]`, a warning, not the
  `[C9]` it would otherwise be. The status is derived from the `.bpd` header on every run; no
  marker on the row repeats it. `[C10]` is
  unaffected — a screen still calling the call site is a stale view. `complete` itself **never
  skips**: it is the inspector, and `[C13]` only exists because it reads the non-live source.
- `si-docs` — the **SI markdown ↔ model reconciliation** (#346): every System Interaction
  document (`docs/02_Business/02_System-Interactions/<BP>/SIxx.yy_Name.md`) has a model use
  case of the same id **and** the same name, and every SI-shaped use case has a document.
  `complete` joins the `.bpd` sources, the binding map, the screen models and the model —
  the SI markdowns are in none of the four, and their only consumers (design-book,
  gate-dossier) *render* them without checking them. Findings: `[D1]` a document whose
  filename still carries a retired `BPxx-` id, or an id that is not `SIxx.yy`-shaped; `[D2]` one id
  documented twice (a reuse is REFERENCED from the second BP, never copied); `[D3]` a
  document the model has no use case for; `[D4]` a use case no document writes up; `[D5]`
  the two disagree about the name. Files that do not match either SI filename shape are
  **skipped**, not reported — a dissolved process leaves companion notes behind (#1081).
  It joins on the filename id alone, so it needs **no `.bpd` sources**: a project whose
  business design arrived as documents, or a brownfield model, is checkable too — which is
  why it is a command rather than a further `complete` `[C…]` code. It refuses (exit 1)
  rather than reporting a green over nothing when the directory holds **no document of
  either class** or the model carries no use cases.

  **`--binding <si-binding.yaml>` adds the SECOND document class** (#1359): the GENERATED
  ADR-069 call-site export `BPxx.yy_Name.md`. That class is keyed by the drawn **call site**
  and carries no System-Interaction id at all — `BPxx.yy.json` holds `format`, `generated`,
  `callSite`, `name`, `speaking`, `hash`, `definition` and nothing else (ADR-069 §5) — so the
  binding map's `callSites:` list is the only place the join to a minted id lives. Pass it and
  `[D4]` fires only when **neither** class covers the use case. The export class can only ever
  *satisfy* `[D4]`; it raises no finding of its own, and each omission is deliberate: no `[D2]`
  (many call sites on one interaction is normal, ADR-069 §8), no `[D5]` (an export is named
  after the drawn **block**, which legitimately differs from the interaction's name), no `[D3]`
  (a binding row naming an interaction the model lacks is `complete`'s `[C9]`, which owns that
  file). An export the binding map resolves to nothing is **named on stderr and counted**, never
  silently skipped; so is the whole class if it is read without `--binding`.

  **Why the empty-set guard reads both classes.** Retiring the hand-written class in favour of
  the generated export is a supported end state: the export is then the whole written surface of
  the interaction. A guard that refuses an empty read of class 1 alone kills the check on a tree
  that is in exactly the state the method asked for, so it refuses only when both are empty.
- `generate --binding --model` — **Design**: the same `seqmap/1` shape on the **same call-site
  keys**, enriched. The `complete` check runs first and any finding aborts — an enriched map only
  exists if the check is green (ADR-037 §2 "raised at derivation"). What it adds per call site:
  `si` (the interaction it resolves to), `interaction` (that interaction's use-case name),
  `permutation` (when the row names one), `operation` = the model's facet·operation for the client
  hop (#676 — this is where the facet lives, since no id carries it), and `bindingSource`. Two drawn blocks resolving to one interaction
  stay **two entries**: they belong to different processes and may exercise different permutations
  of it. `check` verifies a committed map with the same flags.
- `replay` — the **walkthrough-replay regression** (#413; ADR-040 §3/#410): approved
  `walklog/1` logs re-verified against a (re)generated map. Identity is `bp` + `branches`
  derived through the map's per-process `flow` decision graphs, feasibility constraints
  included — never the positional path id, and never membership in the covering `paths`
  (#852: representatives are an enumeration choice; only a real `.bpd`/constraint change
  orphans a walk; a pre-#852 map without `flow` falls back to membership, with a warning).
  The step sequence must be consistent with the derived walk's step cycle (exact-next
  cursor, earlier-step re-occurrence = loop re-entry, all modeled steps consumed); outcome
  kind/label must match; approval integrity enforced. **No id translation**: a walk recorded at
  Mockup names the same call sites the map does, for the life of the project (ADR-066/ADR-069), so
  `--binding` is deleted and a log or map still carrying a `binding:` field is refused. A call-site
  id never expires, so no future log is orphaned by a binding decision either (ADR-069 §9).
  **Dispositions ride in a `walklog-disposition.yaml` sidecar next to the logs**, auto-discovered:
  `frozen:` (an id scheme a decision retired) withdraws a log's STEPS while its branch identity
  still counts as approval evidence (ADR-069 §9); `superseded:` (a mockup rebuilt with
  **overwrite**, #1223) withdraws it from replay AND approval — the artefact it was walked on is
  gone — and any log in that directory walked on or before the declared `overwritten:` day that is
  named in no disposition is a `[disposition]` finding, so the set cannot be silently incomplete.
  The logs stay byte-identical and in place: disposition is data, not location, and a retiring
  FOLDER is a rule you cannot see by looking at the artefact. Every skip is named with its ruling
  and totalled in the verdict line. `--gate` adds the Blueprint totality check: every
  gateway edge and start the covering path set exercises is exercised by a green approved
  log. Rework logs are the work list — skipped, never failing. Wire it wherever the map or
  mockup regenerates in Specification–Construction. Semantics: walkthrough-log-format.md §"The replay tool".
- `rebind` — **deleted** (ADR-066, #1181; stays deleted under ADR-069 §4). It existed to survive
  the binding-time rename, and neither id changes any more: a call site is minted when its block
  is drawn, a System Interaction when Design decides the system offers it, and `si-binding.yaml`
  records the join rather than a rename. The verb refuses with that reason and rewrites nothing.
  If a source still carries `BPxx-SIaa.bb` ids, the project re-tags once, by hand, and never again.
- `--screens` — also scan `*.vw` screen models and join each action whose `calls`/`also`
  names a `BPxx.yy` **call site** into the map's `screens` section (ADR-069 §5: a screen model is
  authored at Mockup, against the drawings, before any System Interaction exists). Unknown call
  sites fail the run; a `BPxx-SIaa.bb` key is refused with its migration path; a Design-tier
  `SIxx.yy` key is `[C10]` with what to write instead; keys that are not call sites at all are
  ignored. With `--binding`, the keys are the same — the binding is consulted only to refuse one
  no `callSites` row carries.

## What it validates (exit 1 on violation)

- every system-pool chain is tagged with a `BPxx.yy_Name` **call site** block (untagged = a
  pre-single-source file — fix the source, not the tool). A block tagged with a System
  Interaction id is refused: a drawing never names one, and which interaction it resolves to
  cannot be guessed from the drawing (ADR-069 §5);
- call-site ids match `design-artifact-conventions`; one id ⇒ one name. **Sharing is not written
  in the drawing**: two processes drawing the same operation write two distinct, permanent call
  sites, and `si-binding.yaml` records that both resolve to one System Interaction (the
  **home-BP rule stays retired**);
- every `send` into the system pool lands on a chain trigger (`messageStart`);
- every gateway branch of every path-emitting pool is covered by some emitted path;
- screen `calls` resolve (with `--screens`).

`complete` additionally runs the ADR-041 §3 check table as amended by ADR-069 §8 ([C1]–[C16] in
the output) and reports **all** findings before failing — a gate presentation wants the full list. `[C0]`
comes first and is different in kind: it is about the INVOCATION, not the design. It fires
when the binding map's rows name business processes no supplied source carries, or when the model
carries interactions the map does not (outnumbering those it does, or named by a screen model) — and
then the check refuses rather than concluding, since a partial check that reports confidently
is worse than one that declines (ADR-049 §8a). A single model use case outside the map is
still the genuine `[C9]` orphan it always was.

Warnings (stderr, non-fatal): drawn-but-never-invoked call sites, pools with gateways that never
call the system, flows ending without an `end` event.

## Non-live sources: the generators skip, the inspectors do not (#1243)

A `.bpd` header may declare `status dissolved|retired|parked` (#1148, bpmn-dsl ≥ 1.16.0). Since
#1243 that declaration reaches the generated surface:

- **`generate` and `check` leave the source out of the map entirely** — no `operations` entries,
  no `paths`, no `processes[]` entry, and its filename absent from `sources`. The mockup, the
  Design Book and the gate dossier therefore never have to filter for themselves. On `figaro`,
  BP07 was taken out of scope and the exclusion lived only as prose in a Q&A entry: twelve days,
  five issues and a scope ruling about drawings nobody was building.
- **What was left out is recorded in the map's `nonLive` array** (`bp`, `name`, `source`,
  `status`), so the skip loses nothing.
- **The skip is never silent** — one line on stderr, every run:
  `seqmap: skipped 2 non-live source(s): BP07_Parked (parked) · BP09_Retired (retired) — pass
  --include-parked to act on them anyway`
- **A source named directly on the command line is skipped like one found by a directory sweep.**
  Otherwise the rule holds only until somebody points the tool at the file.
- **`--include-parked` restores the old behaviour** — the default changed, not the capability.
  It has **no bound form**: a non-live block resolves to no `callSites` row by `[C13]`, so
  `--binding`/`--model` would have nothing to stamp onto it, and the combination is refused.
- **All three states are treated alike.** Whether a `dissolved` process should instead be deleted
  from the source tree is a ruling about that tree, not something a generator acts on.
- **`complete` and `unused` never skip.** They are the inspectors: `[C13]` — a `callSites` row
  that still names a block of a dissolved or retired process — exists only because the check reads
  the non-live source (a parked process's rows are kept and reported as `[C9-parked]`, #1252). "Ignored" is about what is *generated*, never about what is *checked*; a skip that
  reached the checks would make "parked but still wired into the binding" invisible, which is the
  rot the mechanism is against. `--include-parked` is refused there rather than accepted and
  ignored.
- **`sequence` is a generator too** (it emits model mutations) and refuses a frozen call site by
  name. There is no `--include-parked` form of it.
- **`replay`** reads `nonLive` and withdraws a walk of a listed process the way it withdraws a
  superseded one — a notice on stderr, counted in the verdict line, evidence for neither replay
  nor approval. A walk performed before the parking is not a broken map.

The symmetric decision on the diagram side is bpmn-tools 3.4.0 (`build`, `lint` and `si-export`
skip; `spec`, `check` and `ast` read every source as written).

## Conventions

- Input is the **tagged** level-2 source set (e.g. `diagrams/02_detailed/*.bpd`), not the
  untagged `01_detailed` legacy files and not built `.bpmn`.
- Commit the generated map next to the business docs (e.g.
  `docs/02_Business/03_Sequence-Map/seqmap.json`); regenerate on every `.bpd` or screen-model
  change — never edit it.
- **Typed initiator pools ride the map** (#1167; bpmn-dsl ≥ 1.19.0). A `scheduler pool` (the
  clock) or `process pool … from <ProcessId>` (a hand-over from another business process of
  the same system, self-directed allowed) stamps `initiator: {kind: "scheduler"}` /
  `{kind: "process", process: "<id>"}` onto every path, `flow` pool and interaction that
  originates in it — an interaction so tagged is **scheduler-invocable** (the mockup may
  present it as deliberately fireable) or a **continuation** of the named process, and
  `replay --gate` reports an uncovered typed start as the scheduler's act / a continuation,
  never as a missing *human* walkthrough (the coverage is still owed). Untyped pools carry
  no `initiator` field — absent means human.
- **seqmap does not parse `.bpd`. `bpmn-dsl` does** (#407/#1026, bpmn-tools ≥ 3.0.0). Every
  source goes through one `bpmn-dsl ast` run, whose deterministic `bpd-ast/1` dump seqmap
  consumes. It used to carry a **lifted copy** of the plugin's parser instead, policed by a
  pinned grammar manifest and a drift test — and that copy went stale four times in a row,
  silently, each time costing a run its Sequence Map: the `output` directive (#1034), the loop
  markers (#1008), the `si` speaking name (#1047), the typed initiator pools (#1195). The copy,
  the manifest and the drift test are deleted. What replaces the drift test is the dump's
  declared **format version**: two versions that disagree say so out loud instead of one quietly
  mis-reading the other's sources.
- **There is no fallback parser, deliberately.** A fallback would rebuild the duplication this
  deleted, in the one situation where nobody is watching. With `bpmn-dsl` missing, seqmap names
  the binary, how to install it and every path it looked at, and stops. Resolution order:
  `$BPMN_DSL` (an explicit override, and a wrong path is an error rather than a quiet fallback),
  then the marketplace checkout, then the version-keyed plugin cache, newest first.
- Because the grammar is bpmn-dsl's, so is its **refusal**: a source the diagram build rejects
  can never read as green here (#1034), and its parse error arrives in the build's own words.
- **The keyword is bpmn-dsl's; the ID inside the tag is seqmap's.** `call` vs `si` is grammar and
  belongs to the plugin; whether `BP07.03_Name` or `SI03.02_Name` is a legal tag is the ADR-069
  join rule and is checked here, after the parse succeeds. A drawing naming a System Interaction
  parses perfectly well and is refused by `digest()` with what to write instead. The two halves
  moved in the same week and are still two decisions.
