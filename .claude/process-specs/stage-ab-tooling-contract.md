# Discovery-stage/B/C tooling contract

**Status:** provisional single source for the Discovery-stage/B/C tooling the reconciled agent templates
cite (the file keeps its historical `stage-ab-` name; §§6–11 are the Design-stage additions, #379).
References ADR-040 §§2–3 (walkthrough placement as amended by the #410 fix / ADR-042), ADR-037
§§2/7, ADR-041, ADR-043, `design-artifact-conventions`, and the Golden Process build-out
(#378–386, #411–415, #419–420). Each mechanic below is marked **AVAILABLE** or **(not yet built)**.
The rule for any template that cites this note: where a mechanic is AVAILABLE, use the command
surface named here; where it is **(not yet built)**, describe the *intent* and cite the section —
**never invent a command that would fail** (the "template instructs impossible steps" hazard,
ADR-040 §2 consequences).

This note is the *one* place these mechanics are described. #390 (interview-architect), #392
(architect) and any other file reference it by section rather than restating inputs/outputs — single
source, reference-don't-duplicate. When the tooling lands (or shifts), it is fixed here, in one file.

---

## 1. BPMN authoring — single-source, two levels from one `.bpd` — **AVAILABLE**

- One tagged `.bpd` per business process is the sole editable source. `bpmn-dsl build <bp>.bpd
  --level both` emits `<base>.L1.bpmn` (System Interactions **inline-expanded** — the fully-detailed
  level-1 view) **and** `<base>.L2.bpmn` (SIs as **collapsed sub-processes** — the level-2 view).
  **L2 is never hand-maintained** alongside L1.
- An SI's steps live once, in that BP's `si "<id>_<Name>" { … }` block (its home). Same source →
  **byte-identical** rebuild (no timestamps); a regenerated file that differs means someone
  hand-edited generated output.
- After `build`: run `bpmn-tools validate`, then `summarize`, then `render-bpmn-to-svg` for the
  review surface.
- **Lifecycle status (#1148, bpmn-dsl ≥ 1.16.0):** a process that is out of force declares it
  ONCE, in the `.bpd` header — `status <dissolved|retired|parked> [-> <Successor>] ["reason"]`.
  The drawing body is untouched. Every consumer branches on it: the compiled `.bpmn` carries it
  (documentation + `bpd:status` extension), the SVG/PDF renderers draw a banner strip above the
  first pool band plus a watermark, `bpmn-dsl build --check` fails when the BP overview markdown
  misses the localized headline (`STATUS-UNMARKED`), `seqmap` freezes the process's si blocks out
  of the binding inventory (§3a of `si-binding-format.md` — no hand-written `historical:` list),
  the Design Book badges the chapter entry, the gate dossier lists it, and `intent-entry-check`
  exempts it from the business-map obligation. Never restate the status by hand in a second
  artefact — the directive is the single source. **The taxonomy the three tokens name, and what
  follows from each, is §1a below.**
- **The call-site catalog and its per-block `.md` generation are AVAILABLE** (#1182/ADR-068,
  rekeyed by ADR-069 §5; `bpmn-tools` ≥ 3.0.0): `bpmn-dsl si-export <bpd|dir> -o <dir>` writes,
  per DRAWN CALL SITE, one deterministic **`BPxx.yy.json`** (`si-export/3` — ordered boxes,
  gateways with bound rules, sends with pool typing / same-BP `triggers` / drawn payload, notes,
  **content hash**, and ONE `definition`, since a block belongs to the one process that drew it)
  plus the rendered **`BPxx.yy_Name.md`** with its Mermaid activity-diagram fence (ADR-053) — so the
  hand-written SI markdown disappears. GENERATED-never-hand-edited; `si-export … --check`
  byte-compares and flags orphans. Convention: the exports live flat in
  `docs/02_Business/02_System-Interactions/` (json beside md). `seqmap si-docs --binding
  <si-binding.yaml>` reads the rendered `BPxx.yy_Name.md` as a SECOND document class and joins
  it to the minted System-Interaction id through the binding map's `callSites:` list (#1359).
  The join has to go that way round: the export is keyed by the drawn call site and carries no
  SI id at all, so an interaction whose whole written surface is its export is documented — and
  the empty-set guard refuses only when BOTH classes read empty, because retiring the
  hand-written class is a supported end state of this contract. The block also carries **typed slots** the export projects: `rule BR-x`
  on a step, `if "…" rule BR-x then …` on a gateway condition, `send … carries { field, … }` for
  the drawn payload — and lint **rule 10** holds the discipline (a condition in a note inside an
  `si` block is an error; an unbound gateway condition a finding).
- **Deferred — (not yet built):** cross-BP SI **reuse** (`si ref`) and the consistency **linter**
  — the reuse half of the single-source spec (`[[bpmn-single-source-followup]]`). Until it
  ships: an SI is defined in exactly one `.bpd`; **do not** reference a shared SI from another BP
  via `si ref` (a SHARED SI — the same minted id written in both sources — is supported and
  merges in the export/map). A **later** business-design pass reusing an
  interaction the system already **built** is a different case and IS supported: the new BP
  writes the interaction's chain in its own source under the reused id and declares the reuse
  in a `reuse.yaml` sidecar (#635, §2 below).

## 1a. Process lifecycle — the three non-live classes — **AVAILABLE**

A business process is **live** unless its own `.bpd` header says otherwise. Three directives take
one out of force, and they are the whole vocabulary — there is no second spelling of the same fact
anywhere (`bpmn-dsl` ≥ 1.16.0, #1148):

| header directive | the class | what it means |
|---|---|---|
| `status parked ["reason"]` | **future** | thought about, may yet be built — nobody knows yet. It was drawn because drawing it was how the question got asked. |
| `status retired ["reason"]` | **abandoned** | considered and explicitly **not** built, with no successor; at the moment of stamping, believed forever. Covers both entry paths — a process that was in force and was switched off, and one that was never built by decision. |
| `status dissolved -> <Successor> ["reason"]` | **dissolved** | the process ceased to exist and **its subject lives on** in the named successor. A **transitional** state only — see § *Dissolved is deleted* below. |

The drawing body is never touched by any of them, and the source still compiles byte-identically.

**Abandoned is a first-class class, not a tidier `parked`.** In the Software Architect's words
(2026-09-05): *"something abandoned really means that we have thought about it and we do not build
it. This is like a **non-requirement, which has value on its own**."* A non-requirement records that
a question was asked and answered. Delete it and the same idea is proposed, thought through and
rejected again in six months by somebody who cannot know that it already happened.

### The header is authoritative; a folder is never the rule

The directive in the source **is** the status. A project may keep non-live sources in a sibling
directory for legibility, and that directory is then a **mirror** of what the headers already say —
never the thing that makes them non-live. Status carried by location is refused outright
(ADR-070 §4): it is invisible on the artefact, it holds only while every tool walks directories the
same way, and it carries no ruling anyone can disagree with. **Two vocabularies for one fact is the
drift this taxonomy exists to end** — a session that has to consult a folder listing to learn a
process's standing is one edit away from getting it wrong.

### A non-live source derives no project state

The Software Architect's rule, 2026-09-05: a parked or abandoned process *"should not be considered
at all anywhere at any time … It's as if they were not there."* It sits in the repository and may be
picked up later; it contributes nothing in the meantime. Three consequences, and they hold for every
consumer of the design tree. The first two are **enforced by the tools**, not left to discipline —
which is the difference between this and the twelve days that produced the rule:

1. **The generators skip it; the inspectors do not.** `bpmn-dsl build` / `lint` / `si-export`
   (bpmn-tools ≥ 3.4.0, `claude-zulli-marketplace#57`) and `seqmap generate` / `check` (#1243)
   leave a non-live source out entirely — no `.bpmn`, no SVG/PDF, no call-site export, no
   Sequence Map entry, no binding-map obligation, and nothing downstream of those. A source named
   directly on the command line is skipped like one found by a sweep, so it is a property and not
   a convention. `--include-parked` restores the old behaviour on the generators — the default
   changed, not the capability, which is what the banner and watermark of #1148 are for.
   **The checks read everything**: `seqmap complete` and `unused`, and `bpmn-dsl spec`/`check`/
   `ast`, read every source as written — that is how a `callSites` row still naming a frozen
   block gets refused. *Ignored* is a statement about what is **generated**, never about what is
   **checked**. Two duties survive the skip: `build --check` still fails `STATUS-UNMARKED` when a
   non-live process's overview markdown misses its headline, and `qa check` still demands the
   ruling behind the status (§9).
2. **A skip is always reported.** A silent skip is a new way to lose a process. Every run that
   suppresses a source names it and its class, on one line
   (`seqmap: skipped 2 non-live source(s): BP07_Parked (parked) · … — pass --include-parked …`),
   and `seqmap`'s map records the same set in `nonLive` so a reader that wants to *say* a process
   is parked never re-parses the headers (`seqmap-format.md`).
3. **A finding whose subject is a non-live process is not a finding.** Do not file it, do not park
   it, do not raise it with the Software Architect — see `finding-switch.md` § *A non-live subject
   is not a finding*, which owns this rule.

### Dissolved is deleted

`dissolved` is the one class that does not persist. Once the successor carries the subject, the
dissolved process's whole artefact set — the `.bpd`, the compiled `.bpmn` files, the rendered
images, its overview markdown, its call-site exports — is **deleted from the checkout**. The
Software Architect's reason, 2026-09-05: *"something that dissolves will live further — just
different; no information lost when deleted … if you are interested in history, we can use git to go
back."* The current checkout should read as a coherent picture of what is being built, and a
dissolved process is not part of that picture — its subject is, under the successor's name.

No tombstone is kept: the successor's own documents say what it absorbed, and `git log --follow` is
the history. The number may be reused by a later process. This is the **one** deletion ADR-070 §5
permits, and it is permitted because nothing is lost — the subject survives in a named artefact that
is still in the tree. `parked` and `retired` are the opposite case and are **never** deleted: their
subject survives nowhere, so the file is the only record that the question was ever asked.

### The reason string names who, when and where

The `["reason"]` on a status directive is prose with three required facts — **who decided, when, and
where the record is**:

```
status parked "SA 2026-08-24, QA-008 — post-V1: no channel returns order status in this release"
```

A reason that names none of the three is how a decision gets lost: a later session reads it, cannot
tell a ruling from a note, and re-opens the question. The Q&A-ledger entry named here is the same one
that must point back (`enforcedBy:`, `qa-ledger-format.md`) — the ledger and the header cite each
other, and a gate checks that they do.

## 2. Sequence Map — **AVAILABLE** (mature form designed in ADR-037 §2)

- **Definition (ADR-037 §2):** a generated conformance spec — an ordered list of `{from, to,
  operation}` interactions plus UC→BP and sequence→BP mappings.
- **Mockup-stage form:** derived from the **BPs + screen models before the Method model exists**;
  ids are the **minted `SIxx.yy`** (§"id lifecycle") and never change afterwards (ADR-066). It is
  the Mockup-stage attempt to build a mockup *without* the model, which does not exist yet.
- **Consumers:** the clickable mockup (driven by it), the conformance overlay in the
  **authored builds** (the Intent spike walk and the Blueprint delta-only walk — walklog
  capture is an overlay **byproduct**; the first-capture rounds are retired, ADR-044/045),
  and the Stages-D–E **walkthrough-replay regression** (approved logs re-verified against
  every later map or mockup regeneration, §8).
- **Command surface (the `seqmap` skill, #404):**
  `seqmap generate <tagged-.bpd dir> [--screens <vw dir>] -o <seqmap.json>` derives the map from
  the tagged sources (§1) — every message into the system pool is one SI; branches become a
  gateway-edge-covering path set; loops end paths with a loop-back marker. An authored
  **`feasibility.yaml`** sidecar next to the sources (#419, format in seqmap-format.md) prunes
  data-infeasible branch combinations (ratified inter-gateway constraints, rationale per entry);
  the affected edges re-cover via feasible prefixes. An authored **`reuse.yaml`** sidecar
  (#635, format in seqmap-format.md) declares that a process in these sources **reuses an
  already-built System Interaction** — the intention "Design creates nothing new for this one",
  with a mandatory rationale; `seqmap complete` `[C12]` holds Design to it. `seqmap check` fails
  when the committed map differs from a fresh generate (the map is **GENERATED, never
  hand-edited**; byte-identical regeneration, same regime as §1). The shape is specified once, in
  [`seqmap-format.md`](seqmap-format.md); the Design-stage regenerator emits the same shape on the
  same ids, enriched with the model's facet·operation.
- **Screen-model authoring against the map (#405) — AVAILABLE:**
  `vw-validate <models-dir> --seqmap <seqmap.json>` (`screen-dsl` skill, marketplace plugin)
  resolves action `calls`/`also` against the map's `SIxx.yy` operations and `bp` against its
  process set; `requires` degrades to a warning (capabilities bind in Design), `bind` paths are
  unchecked (no seeded world yet), `route` is shape+uniqueness only. A `BP`-prefixed key is an
  error — that scheme is retired (ADR-066, §"id lifecycle"). The join stays exercised against
  synthetic `.vw` fixtures until Mockup-stage conduct authors real screen models.

## 3. Cheap mockup regeneration — **AVAILABLE** (#405)

- A screen-model change regenerates the clickable mockup **idempotently and cheaply** — the stated
  precondition (ADR-040 §2) that makes mockup iteration affordable. The mockup uses
  **simulated components** (ADR-037 §7) and shares its spine (Sequence Map + screen models) with the
  eventual acceptance suite. Placement as amended by ADR-044/045: an **optional
  authoring/consistency aid only — never a stakeholder surface at any stage** (capture-grade rule,
  §11). The stakeholder-facing builds are the LLM-**authored** spike (Intent) and Blueprint build
  (§11); the first-capture rounds are retired (ADR-045).
- **Command surface (the `business-process-mockup` skill, companion of `screen-dsl` in the same
  marketplace plugin):** `bpm-build --seqmap <seqmap.json> [--screens <vw-dir>] -o <mockup-dir>`
  compiles the map (+ screen models, optional — the path walker works with none) into a
  self-contained static mockup of exactly `index.html` + `data.js`. Deterministic (same inputs →
  byte-identical, no timestamps); `bpm-build … --check` fails when the committed mockup is stale —
  same GENERATED-never-hand-edited regime as `seqmap check` (§2).
- **Simulation:** every SI call is answered from `operations[op].definitions[].emits`; every BP is
  walkable branch-by-branch along the map's gateway-edge-covering path set (walk mode steps through
  a path, one *Invoke SI* per step); walk logs export as JSON flagged `candidate: true` — candidate
  example data for §4, never expectations as-is.

## 4. Walkthrough example-data capture — log format **AVAILABLE** (#406); frame extraction **(not yet built)**

- **Mechanism (mature, as amended by ADR-045):** capture is a **byproduct, never a
  ceremony** — the overlay logs whatever the stakeholder happens to walk (the Intent spike
  walk, the Blueprint **delta-only** walk); sessions are **screen-recorded + audio-recorded**;
  the AI extracts entered values and confirmed on-screen outcomes — **no bookkeeping during
  the session**. The frame-extraction pipeline is not yet built; the overlay export (§11)
  covers the log shape today.
- **The structured walkthrough log** is the mechanism's output shape, defined once in
  [`walkthrough-log-format.md`](walkthrough-log-format.md) (`walklog/1`, with a filled example):
  per walkthrough — BP + branch list (the Blueprint replay identity), the ordered SI steps with
  entered values and confirmed on-screen outcomes, the path outcome, and the approval. The
  mockup's walk-log export (§3) is a compatible seed for its `steps`.
- **Simulation waiver** (a conducted run with no real stakeholder sessions): no recording exists;
  walkthroughs run as chat-driven walks over the rendered mockup and the AI fills the log **in-session**
  (`session.mode: "chat"`), playing the frame-extraction role. Same shape either way — the
  recording pipeline, when built, fills the identical format.
- **Output:** **candidate data**, not finished expectations (the mockup's outputs are simulated and
  the seeded resource state is invisible in a walkthrough) → formalized into executable scenarios in
  **Specification**, expected values re-verified with the stakeholder where needed (ADR-033 §1.1, ADR-037
  §4).

## 5. Business map — template **AVAILABLE** (#406)

- **Mechanic (ADR-040 §2):** AI-built, **one entry per BP** — the price tag: what automating it
  saves or earns. The stakeholder and the Software Architect review the entries and **define the
  numbers**; the map is blessed at **Intent**, where scope and priority become an economic
  decision; it then becomes const with the rest of the business design.
- **Template + filled example:** [`business-map-format.md`](business-map-format.md). One Markdown
  file per project in the business docs tree: provenance banner, summary table, one entry per BP
  (price tag + challengeable arithmetic basis), Intent blessing record.
- **Simulation waiver** (a conducted run with no real stakeholder): no real stakeholder
  economics — the numbers are invented and plausible, under the waiver's caveat; the *mechanic* is
  exercised, the numbers are fiction.

---

## 6. SI binding map + model↔BPMN completeness check — **AVAILABLE** (ADR-041, #411)

- **The binding map** records what each **minted** SI resolves to: architect-authored
  `si-binding/1` YAML at `docs/03_Technology/01_System-Design/si-binding.yaml` — one entry per SI
  (`si: SIxx.yy`, `name`, per-edge `realizedBy` declarations, or `aliasOf` + `rationale`). Shape:
  [`si-binding-format.md`](si-binding-format.md). Total & injective over the `.bpd` si-block id
  set. It is **not** a rename map (ADR-066): there is nothing to rename.
- **Command surface (the `seqmap` skill):**
  `seqmap complete <bpd dir> --binding <si-binding.yaml> --model <model.json> [--screens <vw dir>]
  [--si <si-export dir>]`
  — the Blueprint mechanical gate (ADR-037 §2, ADR-040 §3): every SI bound and realized as
  sequences, every system-side gateway edge declared realized (permutation or sequence), no
  model use case beyond the business design, screen actions resolvable. `--model` takes
  `ReadArchitecture` JSON (redirect `theagent2 sns read --kind ReadArchitecture` to a file).
  Reports ALL findings (`[C1]`–`[C15]`, the ADR-041 §3 table as amended by ADR-068), exit 1 on
  any. Loose-stage feedback — run it freely mid-stage; it *gates* only at the Blueprint
  presentation (ADR-040 §8).
- **Design as refinement (#1182/ADR-068).** With the si-exports supplied (`--si <dir>`),
  `complete` additionally holds the model to the drawn block: the binding's `boxes:`/`sends:`
  sections bind every drawn box (`{ operation }` / `{ internal }` (ADR-061) / `{ expands: […] }`)
  and every system-side send (`{ operation }` / `{ event }`), and the checks are **[C14]**
  (totality both ways, resolution, unrealized declarations) and **[C15]** (no model step without
  a business box above it — the sequence refines the block, never more). The model's use-case
  sequence is **generated** from block × binding:
  `seqmap sequence <bpd dir> --binding <map> --model <model.json> --si <exports> --use-case
  SIxx.yy [--client <Comp>] [--manager <Comp>]` emits the `theagent2 sns mutate` script — the
  architect reviews it and applies it on the draft; hand-authoring the sequence is retired.

## 7. Enriched Sequence Map regeneration — **AVAILABLE** (#412)

- **`seqmap rebind` is DELETED** (ADR-066, #1181). The mechanical id rewrite it performed had
  exactly one reason to exist — the id changed at binding — and the id no longer changes. The
  verb refuses with that reason rather than rewriting anything.
- **`seqmap generate <bpd dir> --binding <map> --model <model.json> [--screens] -o …`** —
  the same `seqmap/1` shape on the **same ids**, enriched with the model's facet·operation per
  SI, alias resolution and the non-live drop (deltas in seqmap-format.md). The §6 completeness
  check runs inside — an enriched map only exists if it is green. `seqmap check` verifies a
  committed map with the same flags.
- **`vw-validate`/`bpm-build` key on the minted id** (screen-dsl plugin ≥ v1.4.0): one id form
  at every stage, and a `BP`-prefixed `calls` key is an error naming ADR-066.

## 8. Blueprint walkthrough capture + replay regression — **AVAILABLE** (#413)

- **ADR-045 (2026-07-26, direct owner decision) retires the Blueprint capture rounds and the
  `--gate` totality exit condition**: Blueprint keeps ONE delta-only stakeholder walk (ratified
  rules + Design-stage flow changes) on the verified authored build; capture is an overlay
  **byproduct** of whatever was walked, never a ceremony; the data-grade walk moves to Contract.
  The replay regression runs over the approved logs that exist (spike-era and delta byproducts —
  all on the same ids). `--gate` remains available as tooling; it is no longer a gate condition.
- **Command surface (the `seqmap` skill):**
  `seqmap replay <seqmap.json> <walklog dir|files…> [--gate]`
  — approved logs re-verified against a (re)generated map: approval integrity, `bp`+`branches`
  identity (never path ids), step-cycle consistency (ADR-037 cursor: exact-next, earlier-step
  re-occurrence = loop re-entry, skips/unknowns = drift, all modeled steps consumed) and outcome
  match. No id translation: the log and the map name the same interactions (ADR-066); a log
  still carrying the retired `binding:` field is refused. `--gate` adds the Blueprint
  totality check (every map path covered by a green approved log). Rework logs are the work
  list — skipped, never failing. Verdict semantics: walkthrough-log-format.md §"The replay
  tool". Wire it wherever the map or mockup regenerates during Stages D–E.

## 9. Q&A ledger (`.method/qa.yaml`) — **AVAILABLE** (#414)

- ADR-040 §3: typed append-only `QA-###` entries next to `architecture.yaml`, never inside it;
  the AI appends questions (a direct file edit — no ceremony), the Software Architect records
  answers with provenance. Shape: [`qa-ledger-format.md`](qa-ledger-format.md) (`qa-ledger/1`);
  before the `.method` store exists, the file may sit alone in a bare `.method/` folder.
- **Command surface (the `qa-ledger` skill):** `qa check <qa.yaml> [--gate intent|blueprint]` — lint
  (shape, append-only ids, status/field consistency, blocks vocabulary) plus the gate verdict:
  gate 1 fails on open entries blocking the business tier (`BP##` / `SIxx.yy` / `VW##`),
  gate 2 on ANY open entry with a non-empty `blocks` list — "no open Q&A-ledger entry blocking
  a promoted element". Parked threads (`blocks: []`) are reported, never blocking. The
  Discovery-stage/B parked threads (P1–P8 in the Step-1/Step-3 handoffs) are natural first entries
  when Design-stage conduct picks them up.
- **A ruling the toolchain carries has its own trace** (`toolingBy: { kind, ref }`, figaro#406):
  when the answer's whole content is that the toolchain changed and the model did not, nothing
  drawn exercises it and nothing is deferred, so it names the toolchain change — a
  repository-qualified issue or commit reference. It excludes `exercisedBy`, `enforcedBy` and
  `deferred`, and it prints on every gate run so the gate record can carry it
  (`qa-ledger-format.md`).
- **Pass `--map <seqmap.json>` at every gate.** Without it two checks cannot run: `exercisedBy`
  ids are only shape-checked, and the **exclusion link** of §1a — a ruling that removes a process
  (`enforcedBy: [BP07]`) against the process's own lifecycle header — cannot be verified in either
  direction. A gate run with no map prints `enforcement UNVERIFIED` rather than passing quietly
  (#1241). A scope decision that removes something is where this contract's §1a and the ledger
  meet: the ruling names the process, the process's header names the ruling's date and id, and
  the check refuses the pair when they disagree.

## 10. DTO comparison-class annotation (ADR-034 §3) — **SNS in progress** (#415)

- ADR-034 §3 expects DTO fields annotated with their comparison class (`identity` /
  `generated` / `timestamp` / `tolerance` / `unordered`; default exact); the field + CLI
  surface is SNS-owned (ADR-014) and being implemented under #415 in a parallel SNS session.
- **If the SNS field lands before Design-stage conduct:** use it directly (`AddDtoField`/
  `UpdateDtoFieldType` per the sns-cli skill's then-current grammar); no convention needed.
- **If not:** interim convention — record `comparison: <class>` as the leading token of the
  DTO field *description* (`SetDtoFieldDescription`), one class per field, and log the debt
  in the friction log; when the field lands, a mechanical migration moves the convention
  into the field. Downstream consumers (spec runner, scaffolder comparers) treat the two
  encodings as equivalent during the interim.

## 11. The capture-grade mockup — definition (ADR-043 §1); LLM-authored builds (ADR-044); overlay + harness **AVAILABLE** (#420, #421)

The full numbered build spec is [`mockup-requirements.md`](mockup-requirements.md)
(M-1..M-21) — authoritative for authoring sessions; this section keeps the bar's history.
The bar the Blueprint capture instrument must clear — defined once, after three escalations
against the same surface (#408 presentation, #410/ADR-042 placement, #420 behavior; owner
finding, verbatim in #420):

> **Capture-grade** means the stakeholder is *using an application*, not walking a script:
> a fully working, final-looking **frontend-only** app — every behavior in the frontend,
> no backend, no external systems (the ADR-042 rationale literal).

Operationally (ADR-043 §1, delivery per ADR-044 — the #421 evidence):

1. **A client-side in-memory domain store**, seeded from `world.yaml` and the approved
   walkthrough example data.
2. **SI actions really mutate the store** — editable forms, state persisting across
   screens and views.
3. **The ratified business rules computed live** in the **LLM-authored** app, written
   *from* the business-rules registry (`business-rules-format.md`) and **verified against
   the expectation oracle** (`bpm-verify` — app and oracle derive independently and must
   agree, ADR-044 §4).
4. **Free navigation** — no forced paths; the bound seqmap runs as the **conformance
   overlay** (ADR-037 §3 forgiving mode; the overlay library is the one generic runtime
   piece the authored app includes): observed, logged for walklog capture, never enforced.
   **Explain mode (ADR-046, #424):** toggleable, off by
   default; toggled on, each action shows the SIs called and the rules fired with
   provenance quotes, plus the rules **coverage panel** (fired/unfired across the walks)
   and the **delta filter** ("new/changed since the spike") the ADR-045 Blueprint walk
   walks empty. Since #1183 it also shows the **invented decisions** the action realizes —
   the third row, "decided, not read" (M-3/M-8), answerable in place — and counts them in a
   **decisions tab** beside the rules coverage. The rules file is **explanation + verification fuel, extracted from the
   blessed app by default — never a separately reviewed artifact** (ADR-046).
5. **Zero backend, zero external systems, `file://`** — with **verified conformance
   replacing byte-regeneration** for the authored app (ADR-044 §5: a rebuild is good when
   `bpm-verify` and the replay are green, never when bytes match; registry/world/maps keep
   the strict byte regime).

**Two authored generations (ADR-044 §3, as amended by ADR-068):** the Mockup-stage
**behavioral spike** from the Intent material with the served SIs' **si-exports as read-first
input** (invented-decisions log mandatory — including the per-SI provenance table, M-21 —
feeding the Q&A ledger; walked by the stakeholder at Intent) and the **Blueprint build** from
registry + model (actions keyed to bound SI ids). Per served SI the **skeleton is generated**
(`bpm-skeleton --si <exports> --seqmap <map> [--screens <vw dir>]`, business-process-mockup
skill) and the **bodies are authored** — M-21's scoped amendment to "LLM-authored, never
generated". The self-walk (M-18) asserts seven families; **EDGE** (every system→system
hand-off fires as the consequence of its declared source, via-attributed) and **STALE** (the
declared si-export hash equals the current export) are the two ADR-068 added. **Overlay + harness AVAILABLE** (marketplace branch `feat/bpm-v2-behavioral`,
business-process-mockup v1.4.0): `assets/overlay.js` — the SI-keyed conformance/walklog
overlay the authored app includes (forgiving observation, data-inferred branches with
ambiguity marked for the scribe, `walklog/1` export with a pending-approval skeleton the
scribe stamps); `bpm-verify` (that skill's checker) — strict `business-rules/1` + `world/1`
parsers with the fail-loud validation list, then oracle-vs-app agreement (the salvaged engine vs the
authored app's headless core `create(world) → { store, select, invoke, rule, pipeline,
advance }`) across walklog replay, a world-record context sweep, and the timer horizon,
with never-exercised-rule coverage WARNs; `--selftest` proves it agrees (reference app),
disagrees (drifted app), and round-trips overlay exports through `seqmap replay` green.

**The invented decisions are walk-visible (#1183)** — `bpm-decisions` (business-process-mockup
skill) reads the invented-decisions log (`DESIGN-NOTES.md`, M-3) as a machine input:
`extract` emits the `decisions/1` registry the app hands the overlay (a `file://` JS literal,
with a staleness `--check`), `check` is the M-3 lint (an entry bound to no System Interaction
is a **warning**; `SI: instrument` is the one exemption), and `harvest` is the Intent harvest —
every D-entry with its walk evidence: answered (with the walker's words, for a ledger entry
that carries its answer), open but surfaced, or never surfaced in any walk. `--yaml` drafts
the `qa-ledger/1` entries. **`bpm-serve`** is the generic M-13 conduct sidecar (static files +
`POST /__conduct` → `walks/conduct.jsonl` and a numbered walklog per walk end); the overlay
carries the client half (`create({ conduct: true })`), so neither is hand-written per project
any more.

A mockup that guides paths, simulates emissions, or shows placeholder values is **not
capture-grade** and must not face a stakeholder (auto-memory rule of the same date); the
v1 walker is a dev/authoring flag only.

---

## 12. Change propagation — a redrawn block is STALENESS, never re-synced by memory (#1182/ADR-068)

A `.bpd` `si` block that changes after a spike exists, or after the model's sequence was
generated, is not an instruction to "nachziehen" the consumers from memory — it is **staleness**,
and three checks say so mechanically:

- **the docs side**: `bpmn-dsl si-export … --check` goes red (the committed export no longer
  regenerates) — the export and its rendered markdown are refreshed like any derived artifact;
- **the mockup side**: the **STALE** self-walk family goes red (the hash `A.si` declares no
  longer equals the export's), naming the SI whose body must be re-authored against the current
  export;
- **the model side**: the **[C14]/[C15] refinement check** goes red where the binding's boxes and
  the generated sequence no longer match the block.

The conduct rule: the conductor's next brief lists the changed SIs **by id** (the checks name
them); the receiving session re-authors exactly those bodies / regenerates exactly those
sequences. Nobody diffs drawings by eye, and nobody "remembers" what moved — the class of defect
this section exists for is a build session that read seven SI markdowns by choice and no `.bpd`
at all (the figaro finding behind ADR-068).

---

## 13. Where-used — one query lists every file and line that names a model element — **AVAILABLE** (#1467)

```
theagent2 where-used <element> [--project <dir>] [--model <path>] [--kind <kind>] [--json | --files-only]
```

`<element>` is a dotted suffix of the element's path — `Dto.Field`, `Facet.Dto`, `Facet.Op`,
`Enum.member`, `Component` — or a use case's SI id or name; `--kind` (`component`, `operation`,
`dto`, `dto-field`, `enum`, `enum-member`, `use-case`) narrows an address that names several
elements, and an ambiguous address is refused with the candidates listed. It prints one line per
hit — `path:line: <kind> <line>` — grouped by file, with a count; the kind says what matched:
`qualified` (a dotted form such as `Dto.Field`), `csharp` (the identifier the scaffolder generates,
from the scaffolder's own naming rule), `name` (the simple name — the report says how many other
elements share it) or `wire` (an enum member's wire spelling). It reads the project's
`<name>.method/architecture.yaml` (or `--model`) and every file under the root except build,
dependency and tool directories, the op-log history, symlinks and binaries. It writes nothing.
`--files-only` prints one line per file (its count and the kinds that hit) instead of every line
— use it when the simple name is shared widely and the line list would be longer than the reading
it replaces.

**After you change a model element, run where-used before you open files** — then open only the
files it lists. It was built because that search-by-reading was 83% of a figaro model-fix
session's file-read cost (S-1102).

---

## id lifecycle (`design-artifact-conventions`)

**There is one id and it never changes** (ADR-066, #1181). `SIxx.yy` is **minted at Mockup**,
when the interaction is derived from the `.bpd` — global, permanent, carrying no facet meaning —
and the mockup, the walklogs, the model use case, the sequences and the C# operation all carry
it. A shared SI is simply the same id written in both processes. The provisional `BPxx-SIaa.bb`
form and the binding-time rewrite are retired outright, with no compatibility spelling.

What Design still decides, at Design, is the **facet·operation** each SI resolves to — a
*binding*, recorded in the model and in the binding map (§6), never encoded in the id.
