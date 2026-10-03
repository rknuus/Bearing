---
name: design-artifact-conventions
description: "The naming & numbering system that makes every design artifact traceable end-to-end — from the business discussion, through system design and code design, to the code itself. Defines the IDs (BP## business processes, SIxx.yy System Interactions MINTED ONCE AT MOCKUP and never renamed, CCxx.yy call chains, SQxx.yy.zz sequences, SQxx.yy.zz.NN steps), the alias record for the rare Design-stage discovery that two minted ids are one operation, how they map to the .method model (use case + permutation) and to code (ADR-027 — the facet rides BESIDE the id, never inside it), and how to trace forward (statement→code) and backward (code→statement). There is no provisional id form and no rename at binding (ADR-066). Load whenever you assign, reference, or follow a design-artifact ID — in BPMN, activity/sequence diagrams, markdown, the model, code, commits, or reviews — during design OR implementation. The same IDs are reused everywhere to tie the artifacts together."
---

# Design Artifact Conventions — the traceability spine

**The whole point of this naming system is traceability.** Every design artifact carries **one stable
identifier**, and that **same identifier is reused at every tier** — so any artifact can be followed,
unbroken, from the **business discussion** → **system design** → **code design** → the **code itself**,
and back again. The IDs are the thread that ties the BPMN box, the activity diagram, the markdown spec,
the `.method` model entry, the call-chain diagram, the generated code, the commit message, and the
drift report all to *the same thing*.

An inconsistent, invented, or loosely-reused number **breaks the chain** — that is the one cardinal sin.
When you create, name, reference, or follow any design artifact, use these conventions exactly.

## When to load this skill

- You are **assigning** a number/name to an artifact (business process, system interaction, call chain,
  sequence, use case, permutation, DTO).
- You are **referencing** one — in a diagram, a markdown file, a `.method` mutation, source code, a
  commit message, or a review.
- You need to **trace** between representations: *"what implements `SI03.02`?"*, *"which use case is
  this code?"*, *"which business process did this come from?"*, *"what breaks if I change this?"*.

This applies in the **design phase and the implementation phase**, to the architect, interview-architect,
implementor, drift, reviewers, and any ad-hoc session. (Binding decisions: ADR-030, amended by
ADR-066 — one id, minted at Mockup, never rewritten.)

## The four tiers and the one thread

| Tier | Artifact | Identifier | The ID also appears in… |
|---|---|---|---|
| **Business discussion** | Business process | `BP##` | the `.bpmn`, the BP overview markdown |
| | System interaction — *minted at Mockup* | `SIxx.yy` | the BPMN system-lane box, the SI markdown, the activity diagram, the mockup action key, the walkthrough log |
| **System design** | The same System Interaction — *bound to a facet·operation* | `SIxx.yy` — **unchanged** | **model use case**, call chain, sequences, **code** |
| | Call chain (per operation) | `CCxx.yy` | the call-chain markdown (Mermaid fence, ADR-053), the System-Design README, the model use-case sequence |
| | Sequence (per variation) | `SQxx.yy.zz` | the sequence markdown (Mermaid fence, ADR-053) |
| | Sequence **step** (per box) | `SQxx.yy.zz.NN` | the activity-diagram box, the Steps-table row, the recorded component call, the OTEL span (`idesign.activity_step`) |
| **Code design** | Model use case + permutation | use case `SIxx.yy` · permutation `zz` | the `.method` model, the scaffolder manifests |
| **Code** | Source (facet / operation / DTO) | `I{facet}` · operation · `{Base}_{Variant}` (ADR-027) | source files, OTEL spans, commit refs |

The **System Interaction id `SIxx.yy`** is the keystone: it is the use case (the operation a business
step triggers), and it is the join key between every tier. Learn it and everything else hangs off it.

**One id, minted once, never rewritten (ADR-066).** The id is assigned at **Mockup**, the moment the
interaction is derived from the `.bpd`, and it is the id the code carries in production. There is no
second, "final" id and therefore no rename: the *System design* row above is the **same identifier** as
the row above it, which is the whole point.

## The identifiers, precisely

### System interaction — `SIxx.yy` (the minted, canonical, only id)
- **Global** — unique across the whole project, not just inside one business process.
- **Flat** — `xx` and `yy` are a numbering convenience (a block, and a position inside it). `xx` is
  **not** a facet, **not** a business-process number, and binds nothing. Reading meaning out of the
  digits is the mistake this scheme exists to prevent.
- **Permanent** — minted at Mockup, never renamed, never reassigned, never reused once retired.
- The SI still **is** the operation (= the use case) — that join is unchanged; what changed is that
  the operation's *address in the architecture* is no longer spelled inside the number.
- Regex: `^SI\d{2}\.\d{2}$` · example `SI03.02`
- **Minting a new one:** take the next free number with the whole `.bpd` set in view (the Sequence
  Map's `operations` keys are the inventory). Uniqueness is global, so "what is free" is a
  project-wide question, never a per-process one.
- The operation's **variations** (polymorphic request DTOs) are **not** part of the SI id. A business
  process defines a step's trigger and goal, so the step names the **operation**, not a variation of it.
  Variations are **permutations** discovered at design time — they are numbered one tier down, on the
  **sequence** `SQxx.yy.zz` (and in the model as permutations of the use case). The polymorphic DRO
  appears in the *code* that invokes the operation, not in the business-level SI id.

### There is no provisional id — and no `BP` prefix, ever
The scheme once gave an SI a provisional `BPxx-SIaa.bb` at BPMN time and rewrote it to a bound
`SIxx.yy` when the facets were known. **That is retired outright** (ADR-066, #1181), with no
compatibility spelling:

- **`BPxx-SIaa.bb` / `BPxx-CCaa.bb` / `BPxx-SQaa.bb.cc` are not legal ids.** `bpmn-dsl lint` refuses a
  `BP`-prefixed `si` tag (rule 9); `seqmap` refuses one in a source, a screen model or a binding map.
- **Nothing rewrites ids.** `seqmap rebind` is gone. The `.bpd`, the `.vw`, the SI markdown, the
  Sequence Map, the mockup and the walkthrough logs all carry the minted id from the first stakeholder
  walk to production.
- **The facet does not live in the id.** It is a *binding* — next section.
- **An old commit may still show the prefixed form.** That is history, and history is where it stays:
  do not restore it, and do not add a translation for it.

### The facet·operation is a binding, not part of the id
Which component facet, and which operation on it, an SI resolves to is a **Design-stage** fact. Design
still decides it, at Design — ADR-066 changed *when the id is final*, not *when the volatility
decomposition happens*. The resolution is recorded in two places and encoded in none:

- **the model** (the authority): the use case `SIxx.yy` and its **declared operation** —
  `mutate --kind SetUseCaseOperation --use-case-ref SIxx.yy --operation <Component.Facet.Operation>`
  (ADR-067). One SI is one operation call, so the model holds exactly one answer, and each
  permutation's step 0 — the client hop — is DERIVED from it rather than attached per permutation.
  Before ADR-067 the answer was given N times, once per permutation, by N independent
  `AttachOperationToStep --step-index 0` acts that nothing required to agree, and Comanda's
  `SI02.01` held two client hops all the way into construction (#1185);
- **`si-binding.yaml`** (`process-specs/si-binding-format.md`): the architect-authored entry naming the
  SI, its use-case name, its gateway-edge realizations, and any alias.

`seqmap complete` joins the two and stamps the resolution into the generated Sequence Map
(`operations[SIxx.yy].operation = {component, facet, name}`). Never hand-copy the facet into the
authored file — the model already holds it, and two hand-maintained copies of one fact diverge.

### An alias — the rare "these two are one operation"
Design may discover that two **minted** ids name one and the same operation. Do **not** renumber either
one. Record an alias on the binding map:

```yaml
- si: SI02.03
  aliasOf: SI01.07          # SI02.03 turned out to be SI01.07; SI01.07 is the survivor
  rationale: "…"            # mandatory — an alias is a design finding, not bookkeeping
```

The alias is rare and visible by construction. The retired id is **never reused** for anything else, and
the survivor is never renamed to meet it halfway. An si block carrying `SI02.03` resolves, for every
check and every generated artifact, to `SI01.07`'s entry.

A **shared** SI is not an alias and needs none: two business processes triggering the same interaction
write the same minted id, and the Sequence Map collapses them into one entry with one `definitions[]`
element per defining process. `reuse.yaml` records, with a mandatory rationale, that a new process
reuses an interaction the system already has.

### Call chain — `CCxx.yy` (one per operation = one per SI)
The operation's overall call structure — **1:1 with the SI** (`CCxx.yy` ↔ `SIxx.yy`), variation-agnostic,
so **one CC covers the operation's 1..n variations** (its 1..n `SQ` sequences). Regex
`^CC\d{2}\.\d{2}$` (example `CC03.02`).

### Sequence — `SQxx.yy.zz` (one per variation)
The concrete sequence diagram for one permutation — **the SI's coordinate plus a variation slot**
(`SQxx.yy.zz` sits under SI `SIxx.yy`). One SI/operation has **1..n** sequences, one per variation. Regex
`^SQ\d{2}\.\d{2}\.\d{2}$` (example `SQ03.02.01`).

### Sequence step — `SQxx.yy.zz.NN` (one per activity-diagram box)
A single box of the sequence — `NN` = the step's ordinal within `SQxx.yy.zz` (the row in the SI's Steps
table / the box in the activity diagram). This is the finest id and the unit of the
design↔trace link: each step is a component call, spanned by the iFX proxy and joinable to its id
(`idesign.activity_step = SQxx.yy.zz.NN`) — the granularity checks run at; steps collapsed into a
private Manager helper are below it (see `observability.md`, ADR-031 §§1–3). Regex
`^SQ\d{2}\.\d{2}\.\d{2}\.\d{2}$` (example `SQ03.02.01.04`). The fourth slot is the *only* place an
SQ id grows past three.

### Business process — `BP##`
Regex: `^BP\d{2}$` · example `BP03`.

### Deriving CC/SQ from an SI, and when CC is a separate diagram
CC and SQ are normally drawn at system design, but may be drafted at any time — the SI's id is already
final, so a diagram drafted early is never renamed. From an SI `SIxx.yy`:
- **CC** keeps the SI's coordinate — replace `SI`→`CC` → `CCxx.yy` (**1:1 with the SI**).
- **SQ** appends the variation slot — `SQxx.yy.NN`, one per permutation `NN` the SI turns out to have
  (so one SI yields **1..n** SQs; a single-variation SI has just `…xx.yy.01`).

**Single-variation collapse.** When an operation has exactly one variation, its CC and SQ are the *same*
diagram: keep **one SQ diagram (`…xx.yy.01`)** and surface the CC id as a **column in the Call-Chains
index**, not a duplicate diagram. A standalone CC diagram earns its place only once an operation has **≥2
variations (≥2 `SQ` sequences)**.

### The SI name is a design hint, not a contract
The SI/use-case `--name` names *what the SI does* (e.g. `RegisterNewCustomer`) — a stable,
human-readable identifier assigned early, before any facet/operation/DTO exists. It must uniquely
identify the SI and follow the behavioural-verb, no-CRUD style (the `review-business-process-bpmn`
naming rules), but it is **not** a contract that the eventual Manager operation's name or signature must
match: `Register`, `RegisterCustomer`, and `RegisterNewCustomer` are all admissible operation forms.
**Nothing enforces name = operation** — the operation identifier settles during system design. Treat the
SI name as a design hint that firms up at binding, not a schema to police. (The *id* does not firm up at
binding — it was final at Mockup. Only the name and the facet·operation resolution settle later.)

### Migrating a project that still carries provisional ids
A project already on bound `SIxx.yy` ids needs **no migration**: it keeps every value it has, as its
minted ids. The facet meaning of `xx` is declared **historical** — it may still happen to line up with
the facets, nothing may rely on it, no check asserts it, and when Design later moves an operation to
another facet the id does not move (ADR-066 §7).

A project still mid-Mockup on `BPxx-SIaa.bb` re-mints **once**: pick an `SIxx.yy` for each provisional
id (globally unique, meaning-free) and rewrite the sources, the screen models, the SI markdowns and the
walkthrough logs together. This is a one-time migration, not a stage of the process — after it, nothing
in the project ever renames an id again. Drop the `provisional:` lists from `si-binding.yaml` in the same
change; that lineage lives in git history.

There is no tool for the re-mint: `seqmap rebind`, which used to perform the binding-time rewrite, is
deleted (ADR-066). Issue #351 — "the use-case SI id is not a settable, rebindable field" — loses its
motivating case, because nothing renumbers.

## How the id maps across tiers (the joins)

- **Business ↔ SI.** A business process is a *workflow* (a sequence of use cases); each SI is a *use case*
  in it. The BP overview's "System Interactions" table lists them. One SI may **recur across business
  processes** (a use case reused by several workflows) — it appears as the same `SIxx.yy` in each BP's
  BPMN; there is never a per-BP prefix or suffix.
- **SI ↔ `.method` model.** The SI **is** the operation, and the **operation** `SIxx.yy` is the **use
  case**: `AddUseCase --id "SIxx.yy" --name "<WhatTheSIDoes>"` → the explorer shows
  **"SI01.01 RequestOnboarding"**. Which operation it IS is declared on the use case itself
  (`SetUseCaseOperation`, ADR-067) — one SI, one operation, one place. Each **variation** the
  operation turns out to have is a **permutation** `zz` (`AddPermutation`) — *below* the SI, not
  part of its id, and a variation OF THAT ONE OPERATION, never a second one. `--name` carries the SI's behavioural
  "what it does" name — a **design hint, not a contract** (see *The SI name is a design hint* above); the
  prefix stays *out* of `--name` so the scaffolder's C# identifier derivation (ADR-027) stays clean. The
  call chain `CCxx.yy` is the use case's modeled sequence; `SQxx.yy.zz` is a permutation's sequence.
- **SI ↔ code.** The model use case/permutation drives the scaffold: facet → `I{facet}` folder, operation
  → operation, variant DTO → `{Base}_{Variant}` (ADR-027). So `SIxx.yy` resolves to a facet/operation in
  source, and each permutation `zz` to a specific request-DTO variant the operation dispatches on. The
  facet rides **beside** the id — `I{facet}` · operation · `SIxx.yy` in the scaffold's provenance and in
  the OTEL span — never inside it (ADR-066 §3). You cannot read the facet out of the number, and you are
  never meant to: ask the model, or read the generated Sequence Map's `operations[SIxx.yy].operation`.

## Tracing, both directions

- **Forward (discussion → code):** a passage in the interview transcript → its `BP##` → the SI box in the
  BPMN, already carrying its minted `SIxx.yy` → use case `SIxx.yy` (+ its permutations `zz`) in the model → `CCxx.yy` /
  `SQxx.yy.zz` → the facet/operation/DTO in source → each box's `SQxx.yy.zz.NN` span in the trace. *"This code exists because the stakeholder said X."*
- **Backward (code → discussion):** a source file's facet/operation/DTO (or a runtime span's `idesign.activity_step` `SQxx.yy.zz.NN`) → `SIxx.yy` → the SI markdown
  (its Steps table + Q&A) → the BP(s) it appears in → the transcript passage. Use this to answer *"why is
  this here?"* and *"what's affected if I change it?"* — the id set is your impact map.

## Source-of-truth ordering

**transcript** (the authority) > **docs** (the human-facing design narrative) > **`.method` model** (the
machine projection). When two disagree, the higher tier wins and you fix the lower. **docs lead, the model
follows.** The IDs are what let you reconcile them mechanically, and the docs↔model half of that is a
COMMAND, not an intention: `seqmap si-docs <SI markdown dir> --model <model.json>` joins the SI
documents' `SIxx.yy_Name.md` filenames against the model's use cases both ways — a document with
no use case, a use case with no document, the same id under two names (#346; `just si-docs-check`
runs it, inside `just derived-check`). `SQxx.yy.zz` ↔ the use case's permutation `zz` reconciles
the same way, in the call-chain documents.

## Where the artifacts live

One flat `docs/` tree per project (the former `docs/Projects/<P0N>` vs `docs/Product/` split is
retired): `01_Planning` (transcripts + notes, Stage-A side-channels), `02_Business`
(`01_Business-Processes` = BPMN/BP, `02_System-Interactions` = SI markdown + activity diagrams,
`03_Sequence-Map`, `05_Business-Map`, `06_Screen-Models`), `03_Technology` (`01_System-Design`,
`02_Call-Chains` = `CCxx.yy` + `SQxx.yy.zz`, `02_Spec`, `03_Validation`), `04_Gates` (ADR-051
dossiers). Stages per ADR-040; the project's `docs/STRUCTURE.md` is the tree's spec.

## Rules of use (the discipline that keeps the chain intact)

1. **Never invent or loosely reuse a number.** One artifact, one id; one id, one artifact.
2. **An id is permanent from the moment it is minted.** Not "stable, renumber deliberately" — *permanent*.
   Nothing in the process renames an SI, and no tool exists to. If Design finds that two minted ids are
   one operation, record an **alias** (above); if an interaction dies, its id is retired and never reused.
3. **Use the same id in every representation** — diagram label, filename, markdown heading, model `--id`,
   code comment/trace, commit ref, review finding.
4. **Reference by id.** When you mention an artifact anywhere, name its id.
5. **No id ever carries a `BP` prefix.** `BPxx-SIaa.bb`, `BPxx-CCaa.bb` and `BPxx-SQaa.bb.cc` are not
   ids — they are a retired scheme (ADR-066). `bpmn-dsl lint` and `seqmap` refuse them.
6. **The SI id is the operation, never a variation.** Keep the SI two-part (`SIxx.yy`); the variation
   lives on the sequence `SQxx.yy.zz`, the model permutation, and the code — never grafted back onto the SI.

## Relationship to other skills

- **`idesign-knowledge`** — the architecture *method* (volatility, layering, contracts). This skill is the
  naming/traceability layer *on top* of it.
- **`review-business-process-bpmn`** — the *procedure* that produces BPs and SIs (and **mints** each
  SI's `SIxx.yy` while drawing). It uses the id system defined here.
- **`seqmap`** — the tooling over the tagged `.bpd` set: it holds the id inventory (`operations` keys),
  and `complete` is what checks every minted SI resolves to exactly one binding entry or an alias.
- **`process-interview-transcripts`** — produces the upstream transcript/notes the BP traces back to.
- **ADR-066** — the decision this skill operationalizes: one id, minted at Mockup, never rewritten; the
  facet·operation is a binding.
- **ADR-030** — the pipeline and the original id lifecycle (amended by ADR-066 on 2026-09-02).
- **ADR-041** — the binding map and the completeness gate (amended by ADR-066: no rename map, no
  rewrite).
