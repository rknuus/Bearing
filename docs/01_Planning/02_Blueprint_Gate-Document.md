# Bearing v2 — Blueprint Gate Document

> **Gate.** `blueprint` — *Bless system design; the model is const* (ADR-040 §1, ADR-064).
> **Freezes.** The architecture model: components, contracts, DTOs, sequences, activity diagrams.
> **Reviewer.** Human, after a blind peer review (ADR-015).
> **Status.** Pre-Intent. The material below was sketched **before** the business design was frozen —
> which inverts the Diamond's order, since Design compiles *frozen* business truth. It is therefore
> **input to the Design stage, not a Design-stage artifact**, and every element of it is re-derivable
> and re-negotiable once Intent closes.

**Source.** `sources/architecture.md` in its entirety, plus the entity reference fields
from `sources/funnel.md` and three design-relevant statements from the wireframes. Cited inline by
prefix and the source document's own heading number — `arch §…` (`sources/architecture.md`),
`funnel §…` (`sources/funnel.md`), `wf §…` (`sources/ui-wireframes.md`). The index's Sources table is
the legend.

**Not in the model store.** `Bearing.method/` holds only `project.yaml` and `architecture.yaml` from
onboarding. Nothing below has been registered via `sns-cli`; no components, contracts, DTOs, use cases
or sequences exist in the model yet.

---

## 1. Non-functional invariants — the floor (`arch §2`)

Not features: constraints that shape every Manager operation and every Access write.

### 1.1 Every state change is journaled — in two layers

| Layer | Mechanism | Answers |
|---|---|---|
| **State** | `VersionedDocumentAccess` atomic writes + git commits — timestamped, ordered, replayable (`git checkout <sha>`) | *What changed* |
| **Operation log** | One `journal/{yyyy-mm}/{date}-ops.jsonl` line per Manager operation: `{op, args, ts, version_after, actor}` | *Which operation, by whom, with what arguments* |

**Neither layer alone is sufficient** — git is opaque about operation intent (you infer from diffs);
the op-log is opaque about resulting state. Together they constitute the journal, and **the journal is
load-bearing**: it is the audit trail and the version-controlled history of the user's planning.

**Why not full event sourcing** (`arch §2`): Bearing is state-first by the user's own mental model
("my themes", "my focus today"), single-consumer, and git already supplies the temporal dimension.
Event sourcing would pay schema-evolution, projection-rebuild and snapshotting costs for benefits that
do not apply at this scale. The two-layer model buys ~80% of the audit/replay value at ~20% of the cost.

### 1.2 The other three

- **Mutations are atomic** under rapid-fire user operations. Concurrent calls cannot corrupt state.
- **The UI is optimistic; the backend is authoritative** — the **Authority axiom** (`arch §5`). The
  UI's pre-mutation speculation is a *prediction*; the backend's post-mutation state is *canonical*.
  The frontend predicts the expected state and compares it against the canonical state the backend
  returns; on mismatch the UI **rewrites to the backend's state**, logs the details, and reports a
  state-mismatch error to the user. Without this axiom, "reconciliation" has no defined direction.
- **Uniform mutation envelope** — every mutation returns `{ version, mutated: [...entities], invariants_checked: [...] }`.
  One reconciliation routine in the UI; new operations need no new reconciliation code.

---

## 2. Volatility map (`arch §3`)

**The architecture is decomposed by volatility — not by funnel stage, domain, or UI tab. Tabs are UI
projections.** This is the harvest the Design stage decomposes against (ADR-040 §3).

| Axis | Volatility | Encapsulated by |
|---|---|---|
| Storage substrate (git today; jj / fossil / content-addressed store tomorrow; on-disk schema) | High over years | Resource Access |
| Advisor reasoning (LLM provider, prompts, agent loops, eventual MCP) | High and ongoing | Engine + Resource Access pair |
| Goal-setting model (OKR today; maybe different later) | Medium | Engine |
| Execution / prioritization model (Eisenhower-backlog today; Cynefin / time-blocks tomorrow) | Medium | Engine |
| Recurrence semantics (daily / weekly / monthly + preferred days) | Low–medium | Engine |
| Day-closure policy (what carries, what archives, what gets logged) | Medium | Engine |
| External agent surface (MCP server, scripting hooks) | Future-volatile | Future Manager / Client |
| Ideation organization details (filtering, sorting, search) | Low (UI-side) | Manager facet |
| **Funnel structure & cross-level linking** | **Stable. Sacred.** | Encoded in the domain model |
| **Daily focus + per-tag board view** | **Stable. Sacred.** | Core use-case shape |

**Gap (G-10 in the Intent document):** ADR-040 §2 requires the harvest to annotate *every gateway,
every "it depends", every 1-of-N* **with provenance**. This table is a conclusion without its
evidence. Re-harvesting from the BPMNs once they exist is a Discovery duty, not a Design one.

---

## 3. Service taxonomy (`arch §4`, `arch §14`)

**10 services: 3 Managers + 4 Engines + 2 Resource Access + 1 Utility** — order of magnitude 10, per
IDesign expectation.

### 3.1 Managers (3) — orchestrate use cases, hold no logic

| Manager | Owns |
|---|---|
| **PlanManager** | Themes, Vision/Mission, Routines, Ideas, Goals, progress measures, Focus selection |
| **ExecutionManager** | Tasks, Boards (columns), work check-out / check-out log |
| **AdviceManager** | Advice — the suggestion lifecycle `generated → presented → applied / dismissed` — and apply-orchestration |

**Naming rationale** (`arch §4`): `PlanningManager` → **`PlanManager`**, because gerunds are
activities and belong to Engines; Managers are nouns, and the Plan is the artifact (themes + ideas +
goals + progress measures + routines + focus). `AdvisorManager` → **`AdviceManager`**, managing the *artifact*
(advice), not the *actor* (advisor) — the same logic. `ExecutionManager` stands, "execution" being a
deverbal noun of the same class as "production" or "distribution".

### 3.2 Engines (4) — volatile activities: inputs in, outputs out

| Engine | Activity | Facets |
|---|---|---|
| **PrioritizationEngine** | Assigns the Eisenhower quadrant on intake / advisor suggestion | — |
| **RecurrenceEngine** | Routine recurrence math (daily / weekly / monthly + preferred days) | — |
| **CheckoutEngine** | End-of-period evaluation: what completed, what carries, what archives | `DayCheckout`, `GoalCheckout` |
| **SuggestionEngine** | Funnel-context-aware advisor reasoning | — |

**Why `CheckoutEngine` has two facets:** day and goal check-out are the same shape of work — *take a
completed period, evaluate against committed intent, produce a closure record*. Originally drawn as
two engines (`DayClosureEngine` + `GoalCheckoutEngine`) and consolidated once the volatility was
recognized as one.

**Two Engines are at risk** and must survive the Design stage on their own merits:

- **`PrioritizationEngine`** has no facets and no callers (`arch §12 Q8`). Priority is entirely
  user-driven today — batch `[ Prioritize to ⬇ ]`, drag-to-section, the `PrioritizeTask` operation.
  The author's own lean is to **drop it** unless a non-human priority producer emerges. A component
  nothing changes is exactly what a Blueprint review is meant to catch.
- **`RecurrenceEngine`** has a job and a firing point as of 2026-10-06 (**QB-10**): it computes
  **due** for a date and **overdue** for a routine from the fixed schedule (BR-91), and it is called
  by the day-selectables read, which marks each routine. It still creates nothing — only selection
  does (BR-42). Whether that one computation earns an Engine is the open question now (`arch §12 Q2`).

### 3.3 Resource Access (2) — encapsulate mechanism *and* schema

| Access | Encapsulates |
|---|---|
| **VersionedDocumentAccess** | Atomic, transactional read/write of the **version-controlled** documents. Hides the VCS choice (git today) **and the on-disk schema**. ⚠ The sources give it a second, *scratch* tier for unversioned data; the Software Architect ruled on 2026-10-05 that **unversioned data is not reached through this Access** — see §3.3. |
| **AdvisorClientAccess** | The external advisor service. LLM provider, protocol and transport are **undecided** (`arch §12 Q9` → Contract gate). The Access encapsulates that volatility regardless of the eventual choice. |

**One Access for storage, not one per entity** (`arch §4`). The predecessor had `theme_access.go`,
`task_access.go`, `routine_access.go` — data-centric SOA, one Access per noun. v2 replaces that with
**one Access encapsulating the storage mechanism and the on-disk schema as a whole**: *"schema is the
Access's secret."*

#### The document-type registry, and the seam it does *not* cover

`VersionedDocumentAccess` exposes a uniform `tx.write(doc)` and routes internally by document type
through a static registry fixed at initialization:

```
Theme              → { journaled: true,  path: "themes/{id}.json" }
Idea               → { journaled: true,  path: "ideas/{id}.json" }
Goal               → { journaled: true,  path: "goals/{id}.json" }
ProgressMeasure    → { journaled: true,  path: "goals/{goalId}/measures/{id}.json" }
ProgressCheckIn    → { journaled: true,  path: "goals/{goalId}/checkins/{ts}.json" }
Routine            → { journaled: true,  path: "routines/{id}.json" }
Task               → { journaled: true,  path: "tasks/{id}.json" }
Board              → { journaled: true,  path: "boards/{tag}.json" }
DayFocus           → { journaled: true,  path: "focus/{date}.json" }
DayLog             → { journaled: true,  path: "daylogs/{date}.json" }
OperationLogEntry  → { journaled: false, path: "journal/{yyyy-mm}/{date}-ops.jsonl", append: true }
```

- Every document here is git-backed, atomic and journaled. One transaction → one commit + one journal
  line. ⚠ One tier is **missing**: the advisor conversation is journaled but **not** version-controlled
  (QB-20, 2026-10-06), so `journaled: true` must become separable from git-backed. **The op-log is never double-journaled** — it *is* the journal.
- **The Manager is schema-agnostic.** A new document type means defining the schema and registering it;
  the Access handles the routing. This is **data-source resolution by static type lookup, not policy
  synthesis** — the Access decides storage routing, never business outcomes.
- **The path schemes for `Goal`, `ProgressMeasure`, `ProgressCheckIn`, `Task`, `Board` and `DayLog` are
  illustrative and provisional.** Open storage-organization questions — whether measures and check-ins
  nest under the goal folder or live flat; whether tasks group by board / tag / date or stay flat;
  whether a board keys by tag string (rename = file rename) or by stable id; whether check-out logs shard by
  year — are **internal to the Access**. Changing them must not ripple into Managers, Engines or the
  op-log; that non-rippling *is* the encapsulation claim, and it is testable.
- **Keep changes minimal** (`arch §4`): a column or section schema holds a **list of task ids**, not the
  tasks themselves, so reordering within a column writes one small document rather than N.

**The unversioned seam is not this Access.** `arch §4` put unversioned data in a second *scratch tier*
**inside** `VersionedDocumentAccess`, routed by the same registry (`DayLogDraft`, `TaskCreationDraft`,
both under a gitignored `.scratch/`). The Software Architect ruled on **2026-10-05** that
**non-version-controlled data is not accessed through `VersionedDocumentAccess`**. That is a structural
correction, not a detail:

- The data is real and must persist — the two draft types, plus **remembered interface state** (Intent
  BR-92), whose whole point is to be excluded from version control.
- So the two-tier model collapses: this Access encapsulates *one* mechanism (a versioned document
  store), which is what made it a single volatility in the first place. A tier that is explicitly
  **not** versioned and **not** journaled was a second mechanism wearing the same contract.
- **Pivot 2 is scoped accordingly** (§4): it governs *version-controlled* state. A draft save and an
  interface-state write are not journaled, carry no version, and have no business inside a use case's
  transaction. `arch §8`'s `SaveDayLogDraft` (drawn as a `transact(tx) … commit` against this Access) is
  drawn wrongly as a result.
- **Which component owns the unversioned store is a Design-stage question**, not one to settle here.

**Three document types are missing from the registry** and must be added or explained during Design:

| Entity | Where it comes from | Status |
|---|---|---|
| `GoalCheckout` | `funnel §Entity reference fields`, `wf §4.4` — an entity with its own id, outcome, per-measure statuses, retro text, and a follow-up back-reference | **not registered** |
| Vision / Mission | `funnel §1`, `wf §2.5` — persistent Markdown prose, presumably a workspace singleton | **not registered** |
| `Suggestion` / advice | `arch §4` AdviceManager "owns the suggestion lifecycle" | **not registered** — depends on `arch §12 Q12` (persistent vs. ephemeral) |

### 3.4 Utility (1) — iFX

A thin infrastructure framework, callable from anywhere:

- Tag normalization (lowercase, non-alphanumeric → `-`, hyphens/underscores preserved)
- Time provider — `iFX.now()`, `iFX.startOfLocalDay(date)`: a single canonical clock, swappable in tests
- Id generation
- Error envelopes
- Mutation-response envelope helpers
- Possibly settings-read convenience helpers (reads proxy to the Access; writes go through a Manager)
- **`publishToClient(envelope)`** — transport for terminal saga envelopes. The backing mechanism (the
  desktop shell's event emission today; WebSocket / SSE / cloud push tomorrow) lives behind the iFX
  boundary so saga-terminal Managers stay transport-agnostic.

> ADR-074 ("a utility is a service or a library") applies at Design time: the time provider and
> `publishToClient` behave like a service seam, while tag normalization and id generation are a
> library. Worth a deliberate split rather than one bag.

---

## 4. The five pivots — load-bearing decisions (`arch §5`)

### Pivot 1 — Uniform mutation envelope
Every mutation returns `{ version, mutated: [...], invariants_checked: [...] }` — not per-operation
ad-hoc returns. The UI has one reconciliation routine that swaps mutated entities into the local store
and bumps the version. Adding operations requires no new reconciliation code.

### Pivot 2 — Single mutation serialization point
**All changing operations of version-controlled state** funnel through `VersionedDocumentAccess`,
which guarantees atomicity
(one transaction in flight, or transactional batching). **The Manager owns the use case as the
transaction boundary**: it accumulates writes against a `tx` handle over the course of the use case,
and the Access commits them as one atomic operation — one git commit, one journal line, one version bump.

```
access.transact(ctx, (tx) => {
  tx.read(...)
  tx.write(doc_a)
  tx.write(doc_b)
})  // single commit, single serialization point
```

### Pivot 3 — The advisor is a Manager peer, not a sidecar
`AdviceManager` calls `PlanManager` and `ExecutionManager` **through the same operations the UI uses**.
There is no parallel write path: applying a suggestion is identical to the user clicking the same
control. This kills a whole class of "the advisor wrote bad state" bugs and keeps the journal clean.

- **On batch apply.** Each `ApplySuggestion(suggestionId)` is its own use case making one queued
  Manager-to-Manager call. **There is no server-side "Apply all"** — that would be workflow
  orchestration inside a Manager. The UI iterates and calls `ApplySuggestion` once per id: batch
  *invocation* of one use case, not orchestration of disparate ones, so no Original Sin.
- **Failure policy: abort on first failure**, and it lives **entirely in UX code, never in the
  backend**. The UI's loop breaks on the first non-success envelope; later suggestions are not
  attempted. Rationale: a buried error among successful follow-ups makes the revert calculus harder;
  aborting keeps the applied set small and the failure point visible.

### Pivot 4 — Multi-Manager gestures are choreographed sagas, not orchestrated workflows
When a user gesture spans more than one Manager use case, the relationship is a **saga**: an ordered
sequence of *independent* use cases connected by queued Manager-to-Manager calls that pass an
**envelope-in-progress** forward.

- **Each step is a complete use case** — single Manager interaction, single transaction. Steps are
  linked only *temporally* within the saga, never semantically.
- **No `await`.** The originating Manager fires the queued call and is done.
- **The envelope-in-progress flows through the queued payloads;** each step appends its own mutations.
- **The terminal step publishes** the combined envelope via `iFX.publishToClient`. It knows it is
  terminal because the saga shape is fixed in the chain of queued calls.
- **No saga coordinator** — a central orchestrator would be a Manager-of-Managers. Sagas are pure
  choreography; their shape lives in the call chain and is documented per saga.
- **The UI receives one envelope per saga**, never partial saga state.

This holds whether the deployment is single-process (queued = in-process dispatch, ~µs) or distributed
(queued = real message or RPC, ~ms+). The contract is identical; only the transport changes.

### Pivot 5 — The UI cache is push-fed, not pull-driven
The UI keeps a local cache as a *predicted mirror* of backend state, fed by every mutation envelope.
It never polls.

- **Envelope = cache update.** Every envelope carries the canonical post-mutation state of the
  affected entities; the UI applies it.
- **Reads serve from cache.** Board strips, task counts and derived views are computed at render time.
- **The cache is a prediction, not state** — reconciled on every envelope and at explicit pull points.
- **Pull is the safety net:** explicit pull-on-entry queries (`GetBoardSummary`, …) reconcile at view
  mount, on cold start, and after missed envelopes.
- **Deployment-agnostic** — the same contract serves in-process and cloud latencies.

The cache is a client concern and not a service in the decomposition, but the *contract the backend
honours* — full mutated entities in envelopes, proactive push for saga terminals, one envelope shape —
exists to make it viable.

---

## 5. Closed-architecture rules (`arch §6`)

- **Manager** may call: Engine, Access, **queued** Manager (Manager-to-Manager is *always* queued,
  never synchronous)
- **Engine** may call: Access (for reference reads); never another Engine; never publishes or
  subscribes to events
- **Access** may call: its underlying resource only; never another Access
- **Utility (iFX)** is callable from anywhere
- No sideways calls between resources, no calls up, no foreign keys or triggers between cylinders
- **The use case owns the data** — never orchestrate use cases from the client (the Original Sin)
- No client-side composition of multiple Manager operations into one semantic action; that is what
  queued Manager-to-Manager calls and sagas are for

---

## 6. Pseudocode and diagram conventions (`arch §7`)

Use-case diagrams use role-prefixed steps inside a transaction:

| Prefix | Meaning |
|---|---|
| `validate FK:` | foreign-key existence / state check |
| `validate inv:` | invariant check (uniqueness, reserved string, …) |
| `read:` | read for use-case logic, not validation |
| `normalize:` / `compute:` | pure transformation or Engine call |
| `mutate:` | state-changing write |
| `commit` | end-of-transaction marker |

Every mutation returns the Pivot-1 envelope; reads return data plus a version.

**The op-log append is implicit.** Every Manager mutation appends one `OperationLogEntry` at commit
time inside the transaction. It is omitted from each use case's pseudocode because the discipline is
universal and repeating it would be noise.

> Note for the Design stage: under ADR-068 the **SI block is the single control-flow source** and
> sequences are **generated** from block × binding (`seqmap sequence`), never hand-authored. The
> pseudocode below is therefore a *sketch of intent*, not the sequence artifact — the sequences come
> from the frozen SI activity diagrams once Intent closes.

---

## 7. Use cases and sagas drawn so far (`arch §8`)

### S1 — SetDailyFocus saga

The gesture "set today's focus" spans two independent use cases, ordered temporally and joined by a
queued call. Per Pivot 4 this is **choreography, not a single use case**.

```
Step 1 (origin):   UC1 — PlanManager.SetDailyFocus
                     ├─ runs own transaction, commits DayFocus
                     ├─ builds envelope-in-progress { mutated: [DayFocus], version }
                     └─ queues Step 2 with { args, envelope-in-progress }   (no await, no return)

Step 2 (terminal): UC5 — ExecutionManager.ScheduleRoutineTasks
                     ├─ runs own transaction, commits routine tasks
                     ├─ appends own mutations { mutated: [DayFocus, ...Tasks] }
                     └─ publishes the combined envelope via iFX.publishToClient
```

UC1 and UC5 are **independent** use cases whose relationship is purely temporal. Scheduling is
**eager, idempotent and additive-only**. The UI sees **one** combined envelope — never the partial
state between the two commits.

### UC1 — `PlanManager.SetDailyFocus(date, boardOwnerIds[], routineIds[])`

```
└─► VersionedDocumentAccess.transact(tx)
      ├─► validate FK:  every id in boardOwnerIds resolves to an activity, or to a simple
      │                 project, whose project is not archived                    // BR-41, BR-43
      ├─► validate FK:  every id in routineIds resolves to a Routine (active, not paused)
      ├─► mutate:       write DayFocus{date, boardOwnerIds, routineIds}
      └─► commit
└─► build envelope-in-progress { mutated: [DayFocus], version }
└─► queue UC5 with { date, routineIds, envelopeInProgress }

**Corrected 2026-10-11.** It selected **ideas**, which a day focus has not held since the tag was
retired (**QB-40**, 2026-10-09): a day selects **boards and routines**, and a board is selected by
selecting its owner — an activity, or a simple project itself (**BR-41**, BR-97, BR-101).
```

### UC2 — Move a task / mark done: **three** operations, one volatility axis each

```
ExecutionManager.RankTask(taskId, rank)                      // ordering within the current group
ExecutionManager.PrioritizeTask(taskId, quadrant, rank?)     // Eisenhower section change (Backlog only)
ExecutionManager.MoveTask(taskId, state, priority?, rank?)   // column / lifecycle change
```

```
ExecutionManager.MoveTask(taskId, state, priority?, rank?)
└─► transact(tx)
      ├─► validate FK:  taskId resolves to a Task (not archived)
      ├─► validate FK:  state references an existing column on this task's board
      ├─► validate inv: column.role == Backlog ⇒ priority is required
      ├─► mutate:       task.state    = state
      ├─► mutate:       task.priority = priority ?? task.priority   // preserved when leaving Backlog
      ├─► mutate:       task.rank     = rank ?? <end of new column>
      └─► commit
```

**No lifecycle timestamp fields on Task, deliberately.** "When was this last moved / created /
completed" is derivable from the journal (op-log entries carry op + ts + taskId; git commits carry
timestamps). A denormalized field gets added only when a query pattern earns it. ⚠ **As of 2026-10-11 a query
pattern does earn it:** the check-out's lists and figures read its span's movements (Intent
BR-124, BR-125), so the journal is queried or a field is denormalized — **Q3** and **QC-04** are
reopened on exactly that choice, and `wf §6.4`'s timestamp assumption is reinstated.

### UC3 — `PlanManager.EditIdea(ideaId?, title, themeId?, details?)`

```
└─► transact(tx)
      ├─► validate inv: title is non-empty
      ├─► validate inv: the idea, where one is named, is not archived      // BR-05
      ├─► validate FK:  themeId (if provided) resolves to a Theme (not archived)
      ├─► mutate:       write Idea{id, themeId?, title, details?, archived_at: null}
      └─► commit
```

**Renamed and narrowed 2026-10-11.** It was `CaptureIdea`, after the call site `BP04.02_CaptureIdea`
— which is retired: writing an idea down and changing one are **one** request now,
`BP04.02_EditIdea` (UX-04), and `BP04.03_AmendIdea` went with it. The three tag lines are void too:
the tag was retired on 2026-10-09 (**QB-40**), so there is nothing to normalize, nothing reserved to
refuse and nothing to keep unique. An idea carries a title, an optional theme and its notes.

### UC4 — `ExecutionManager.CheckOut(options{archiveCompleted, notesMd})`

The Manager accumulates one `DayLog` plus N task mutations **inside one transaction** — Pivot 2's
"the Manager owns the transaction boundary". The whole check-out lands as one commit or none of it does.

```
└─► transact(tx)
      ├─► read:    movedInSpan     = the task movements since the last check-out  (source TBD — Q3)
      ├─► compute: completed/started/planned from movedToday; stillInProgress/neverStarted from columns
      ├─► compute: result = CheckoutEngine.DayCheckout(completedTasks, inProgressTasks, options)
      │              → DayCheckoutResult { dayLog, taskMutations[] }
      │                 taskMutations: { taskId, archived_at }        when archiveCompleted
      ├─► mutate:  write result.dayLog
      ├─► mutate:  for each m in result.taskMutations → write the task with m applied
      └─► commit
```

Sibling operation — draft auto-save, last write wins while the span is open (BR-37), promoted to the versioned
`DayLog` on check-out and then cleaned up. ⚠ **Drawn wrongly as written:** it runs a
`VersionedDocumentAccess.transact(tx)`, which the 2026-10-05 ruling forbids for unversioned data (§3.3,
F-11). The operation stands; its callee does not:

```
ExecutionManager.SaveCheckOutNotesDraft(notesMd)
└─► transact(tx) → mutate: write/update CheckOutNotesDraft{notesMd, status: "draft"} → commit
```

### UC5 — `ExecutionManager.ScheduleRoutineTasks(date, routineIds[], envelopeInProgress)` *[queued entry]*

```
└─► transact(tx)
      ├─► read:    existing routine tasks for date
      ├─► mutate:  for each routine with no outstanding task → write Task{board: Chores, ...}
      └─► commit
└─► append own mutations to envelopeInProgress { mutated: [DayFocus, ...Tasks] }
└─► publish: iFX.publishToClient(envelopeInProgress)
```

### `ExecutionManager.DeleteColumn(boardId, columnId, cascade: bool)`

```
└─► transact(tx)
      ├─► validate FK:  columnId exists on boardId
      ├─► read:         tasks where task.column == columnId
      ├─► branch:
      │     ├─► cascade=false ∧ tasks not empty → reject with TasksWouldOrphan(count)
      │     ├─► cascade=true                    → for each task: tx.delete(task)
      │     └─► cascade=false ∧ empty           → proceed
      ├─► mutate:       board.columns = board.columns without columnId
      └─► commit
```

### Saga audit (`arch §8`)

- **Sagas drawn:** S1 (UC1 + UC5)
- **Single-Manager use cases drawn:** UC2 (three operations), UC3 (assuming **lazy** board creation per
  `arch §12 Q11`), UC4 (+ `SaveDayLogDraft`), `DeleteColumn`
- **Undrawn use cases that will be sagas:** `DeleteTheme` when its **tasks** flag is set (Plan write +
  Execution task and board deletions — its other flag stays inside Plan) ·
  `DeleteIdea(cascade=true)` (Plan write + board and task deletions) ·
  `DeleteRoutine(cascade=true)` (Plan write + task deletions) · `DeleteGoal` stays single-Manager even
  with its cascade set, since it reaches only ideas (BR-15) · `ApplyAdvisorSuggestion` — *iff*
  `AdviceManager` has persistent state (`arch §12 Q12`); if suggestions are ephemeral it is a pure
  dispatch.

### Cross-cutting patterns (`arch §9`)

**Scheduling pattern** (exemplified by UC5) — any operation in this family must be **eager** (the
journal records cause and effect in lockstep), **idempotent** (N calls ≡ 1 call), and
**additive-only** (creates what is missing; never deletes for "no longer needed").

**Cascade pattern** — cascade flags **per call**, every one off by default in the UI, with **no
configuration layer** for the defaults. The sources' single binary `cascade: bool` no longer fits
every delete; the business rules set the arity per entity:

| Delete | Cascade flags | `cascade=false` |
|---|---|---|
| Theme | **two** — ideas · those ideas' tasks (BR-13). The goals are not a flag: declining is not legal for them, so there is no default to set (BR-19). The routines cascade went with the affiliation (BR-02, 2026-10-13) | kept ideas lose their theme and survive (BR-03); **rejected** only where a goal would be orphaned, since `goal.theme_id` alone is required (BR-01, BR-21) |
| Idea | one — its board and tasks (BR-14) | the idea and its tag go; linked goals survive minus the link |
| Goal | one — its **linked ideas** (BR-15) | the goal, its measures and its check-in history go; tasks are never reached from a goal |
| Routine | one — the task occurrences it produced (BR-16) | it stops producing new ones |
| Column | one (BR-18) | **rejected** when non-empty, since `task.column` is required |
| Task | none (BR-17) | — |

⚠ Two consequences for the operation signatures: `DeleteTheme` takes **two** booleans, not one,
and `DeleteGoal` takes one where the sources gave it none (BR-15 overturned them on 2026-10-04).

**Optimistic-UI / authority** — the UI predicts, the backend confirms; on mismatch the UI reverts to
backend state and reports an error to the user.

---

## 8. Column property model (`arch §10`)

```
Column {
  id:    <stable opaque>,
  role:  ColumnRole,     // { Backlog, Todo, InProgress, Done }
  name:  string,         // user-editable display name
  order: int,
}
```

Four roles, **no `Neutral` escape hatch** — every column commits to a workflow semantic. Role is
separate from name, so renaming preserves behaviour (the check-out and the advisor key off role).
Multiple columns may share a role **except Backlog: at most one Backlog column per board**, since the
three Eisenhower sections are not meaningfully splittable. Sectioning is **implicit from
`role == Backlog`** — there is no separate `sectioned: bool`. Role is mutable with the consequences
listed in the Intent document (BR-59); the operation `ChangeColumnRole(boardId, columnId, newRole)`
is **parked and not drawn** (`arch §12 Q4`).

---

## 9. Settings and configuration (`arch §11`)

**Removed from the design, deliberately:** the `Settings` document type, the `SettingsManager`
placeholder, and the OS-config-file layer. A personal planning tool with cross-cutting themes and
routines maps to *one* workspace, so the storage location is fixed by OS convention and
git-initialized on first run; OS-level preferences are auto-detected. If a real configurable concern
emerges — the advisor backend (`arch §12 Q9`) is the named candidate — the surface and its document
type are added *then*, with justification, rather than as speculative scaffolding.

⚠ This removal is what leaves the Ideation sort preference homeless — **C-7 / QB-06**.

---

## 10. Operation inventory still owed

The six drawn use cases cover the two hottest gestures (set focus, work the board) plus idea capture,
one check-out and one column operation. The Intent document's §6 implies roughly **80 system
interactions**. Every one of them needs a Manager operation, and the facet/operation/DTO factoring is
the Design stage's core work. Grouped by owner, the undrawn surface is:

| Manager | Undrawn operation families |
|---|---|
| **PlanManager** | Theme CRUD + reorder + delete-with-cascade · Vision/Mission read + write · Routine CRUD + pause/resume + reorder + delete-with-cascade · Idea amend, notes auto-save, re-affiliate, reorder, archive, unarchive, delete-with-cascade · Idea tag validation (the Collision / Reserved query behind `wf §3.2`) · Goal CRUD + reorder + archive + unarchive + delete · KR add/amend/remove/reorder · KR check-in (numeric + boolean) · Goal check-out + carry-forward seeding · Focus clear / copy / set-for-another-date (the UC-family question, `arch §12 Q10`) · Day rollover (`arch §12 Q1`) — *moved here from ExecutionManager 2026-10-06: rollover advances the current day and the day focus in play, and writes no task (BR-44), so it is focus state, not board state. Final allocation is the Design stage's call* · Ideation read projections (filter / sort / theme scope / archive view) |
| **ExecutionManager** | Task amend · Task archive / unarchive / delete · Task-draft stage / amend / reorder / discard / discard-all / commit · Column rename / insert / reorder / role-change / archive-all · Board read projections (boards strip, funnel context header, All-board aggregate) · Archived-tasks view |
| **AdviceManager** | Open conversation with context + selection · Ask · Apply (ten catalog types) · Dismiss · Clear · Supersession bookkeeping (if suggestions persist) |
| **Cross** | Bootstrap / first-run (`wf §7.2` steps 1–5) · Install the template files (the five life areas and the Chores board ship with them) · Start-up precondition checks (BR-122) — *onboarding completion dropped 2026-10-11: there is no wizard (BR-82), and where a first launch lands is BP01's one decision* |

**Known pressure point:** the Pivot-3 rule that the advisor calls *the same operations the UI uses*
means every one of the ten catalog types must map onto an existing Manager operation. Two do not
obviously: `create_goal` with inline `key_results[]` (is that one operation or a saga?) and
`modify_idea` with `new_tag` (which must run the full tag-validation path). Worth settling early —
it constrains the operation factoring rather than following from it.

---

## 11. Parked questions, re-classified by gate

`arch §12` holds eleven parked questions (numbered Q1–Q12 with Q5 absent). Each is re-filed against
the gate that actually owns it. The author's own lean is preserved.

| # | Question | Owning gate | Lean / note |
|---|---|---|---|
| Q1 | **Day-rollover trigger** — who fires the rollover? *(The original wording asked who fires “the new-day routine spawn”; there is no such spawn — rollover advances the current day and writes no task, BR-44.)* | **Blueprint** | Client-driven `RolloverDay(date)`, invoked when the client detects a new local day; avoids a backend timer thread. Interacts with BR-44 and with the BPMN's `scheduler pool`. What it advances is day-focus state, which is why its operation now sits with **PlanManager** in §10. |
| Q2 | **What is `RecurrenceEngine`'s actual job?** | **Blueprint** | Settled 2026-10-06 (QB-10): compute due/overdue from the fixed schedule for the day-selectables read (BR-91). What is left is whether one pure computation justifies an Engine. |
| ~~Q3~~ | ~~“Completed today” / “in progress today” predicates for day check-out, with no timestamp fields on Task~~ | — | **DISSOLVED 2026-10-06 (QB-23)** — both lists are current-state predicates: *in a Done column*, and *past Backlog and not Done*. No journal query, no `lastEnteredAt`, no timestamp field. **REOPENED 2026-10-11 (Intent BR-124)** — the predicates are movement-based after all; what is open is only whether the figures query the op-log or a per-task field is denormalized. |
| Q4 | **`ChangeColumnRole`** — full pseudocode and consequence handling | **Blueprint** | Defer to a board-management use-case pass. |
| Q6 | **The advisor-apply use case** — exercises queued Manager-to-Manager and the apply-via-same-operations contract | **Blueprint** | Not yet drawn. Gates Q9 and Q12. |
| Q7 | **Goal check-out + theme cascade** — validates the `GoalCheckout` facet and theme-level cascade | **Blueprint** | Not yet drawn. The reject-vs-detach question behind it is settled (BR-21). |
| Q8 | **Is `PrioritizationEngine` justified?** No facets, no callers, no system-driven priority logic | **Blueprint** | Drop unless a non-human priority producer emerges. If priority stays a human decision the Engine is dead weight. |
| Q9 | **Advisor backend** — provider (Anthropic / OpenAI-compatible / local / mixed), protocol (HTTP / stdio / subprocess bridge), transport (direct SDK / CLI wrapper / compatible endpoint) | **Contract** (ADR-071 `DV:` tier) | No decision made; earlier speculation was retracted 2026-05-17 and the predecessor's approach is not authoritative. Depends on licence terms, the single-machine constraint, offline tolerance (**QB-19**), the latency budget, and whether an MCP server is eventually wanted. `AdvisorClientAccess` encapsulates it regardless. |
| Q10 | **Is `SetDailyFocus` still a "core" use case, or are UC1 + UC5 too granular?** Both halves feel implementation-shaped rather than user-shaped after the split | **Blueprint** | Park until more focus use cases surface; if variants emerge (set / clear / copy-from-yesterday / set-for-a-future-date / advisor-adjusted), promote to a use-case family. |
| Q11 | **Board creation: eager (saga) or lazy (materialize on first use)?** | **Blueprint** | Lean **lazy** — symmetric with the funnel's "show when there's something to show", avoids materializing boards for ideas that die, keeps UC3 a clean single-Manager use case. Requires the UI to fall back to default columns for a tag with no board document. |
| Q12 | **Does `AdviceManager` have persistent state?** | **Blueprint** | **Yes** — the conversation is journaled but kept out of version control (QB-20, 2026-10-06). So `ApplySuggestion` is a saga and a `Suggestion` document type exists; what is left is its schema and the git-excluded storage tier it needs, which the registry does not currently have. |

---

## 12. Findings against the sketch

Observations a Blueprint review would be expected to raise. Recorded now so the Design stage opens
with them in hand rather than rediscovering them.

| # | Finding |
|---|---|
| F-1 | **Three entities have no document type** — `GoalCheckout`, Vision/Mission and `Suggestion` (§3.3). All three are persistent — `Suggestion` as of QB-20 — and the registry as written cannot store them. `Suggestion` also needs a tier the registry lacks: **journaled but not version-controlled**. (Remembered interface state is a fourth persistent thing with no home, but after the 2026-10-05 ruling it is not *this* registry's gap — see F-11.) |
| F-2 | **`PrioritizationEngine` has no caller and no facet** (Q8). A component that nothing changes contradicts volatility-based decomposition. |
| F-3 | **`RecurrenceEngine` is now specified but may be too thin.** Its subject matter is settled — due/overdue from the fixed schedule (BR-91, QB-10) — and its caller is the day-selectables read. The review question flips from “unstated policy” to “one pure function: Engine, or a helper on the Manager?” |
| ~~F-4~~ | ~~The journal-as-query-source assumption is untested.~~ **WITHDRAWN 2026-10-06** — Q3 dissolved (QB-23): the check-out predicates read current board state, so the Access needs no query surface over the op-log. **REINSTATED 2026-10-11** — the check-out reads movements, so the journal-as-query-source assumption is load-bearing again and still untested. |
| F-5 | **`Board` keyed by tag string makes a tag rename a file rename** (§3.3) while `wf §3.2` promises that renaming a tag silently re-keys the board and updates every task's tag. That is a multi-document write inside one transaction, and possibly a saga (Plan write + Execution re-key) — undrawn, and in tension with the "lazy board creation" lean of Q11. |
| F-6 | **Deletion sagas are named but undrawn** (§7). C-1 no longer applies — declining a cascade rejects where the child's parent is required (BR-21) — but the sagas must now draw that rejection. They are also the three use cases most likely to need the task/board reach that crosses the Manager boundary. |
| F-7 | **Reads are under-specified relative to writes.** Pivot 5 names exactly one pull-on-entry query (`GetBoardSummary`); the UI needs read projections for every view (boards strip, funnel context, All-board aggregate, coverage strips, archive views, Ideation filter/sort). "Reads return data + version" is the only stated contract. |
| F-8 | **The envelope's `invariants_checked` field has no consumer.** Pivot 1 includes it in every mutation response; nothing in the UI contract or the reconciliation routine reads it. Either it is evidence for the user-visible error path, or it is ceremony. |
| F-9 | **The op-log's `actor` field has exactly two possible values** (the user, the advisor) in a single-user product — and under Pivot 3 the advisor's writes go through the same operations, so `actor` must be threaded through the queued call to stay meaningful. |
| F-10 | **Draft scoping.** `TaskCreationDraft` keys by `{sessionId}`, but nothing in the design defines a session, and `wf §6.2` promises drafts survive app restarts. A restart-surviving draft keyed by a session id needs the session to be durable — or the key to be something else. |
| F-11 | **Nothing owns the unversioned store.** Drafts and remembered interface state must persist, must stay out of version control, and are not reached through `VersionedDocumentAccess` (SA 2026-10-05) — so some component owns that seam and none is named. Recorded, not resolved: which one it is is a Design-stage decision. |

---

## 13. What the Design stage will need that does not exist yet

| # | Owed |
|---|---|
| BD-01 | A **frozen business design** to compile — Design consumes const Intent artifacts (ADR-040 §3). Today the business design and this sketch were authored in parallel. |
| BD-02 | The **model in the store** — components, facets, operations, DTOs with comparison classes, use cases keyed by the minted SI ids with their permutations, all via `sns-cli`. |
| BD-03 | The **SI binding map** (`si-binding.yaml`, ADR-041) with a per-edge realization declaration, and the ADR-068 refinement: every drawn box bound `{ operation | internal | expands }`, every system-side send bound `{ operation | event }`. |
| BD-04 | **Generated sequences** (`seqmap sequence`) from block × binding, ending at the ResourceAccess (ADR-036) — never hand-authored. |
| BD-05 | **Activity diagrams** per Manager use case (ADR-031), which become the generated Manager entry bodies (ADR-061). |
| BD-06 | The **enriched Sequence Map** and a green `seqmap complete --si <exports>`. |
| BD-07 | The **walkthrough-replay regression** — the approved walkthroughs re-run green once the mockup is driven by the model-derived Sequence Map, proving system design did not silently change the business design. |
| BD-08 | **Self-critique + a blind peer review** (ADR-015) before the gate. |
| BD-09 | A **Q&A ledger with no open entry blocking a promoted element** (`qa check`). |
| D-10 | Resolution of **F-1 … F-10** and of Q1–Q4, Q6–Q8, Q10–Q12. |

---

## 14. Downstream — what this gate hands on

- **To Contract:** the two resource slots (`VersionedDocumentAccess`, `AdvisorClientAccess`) that need
  a kind, a product and a protocol sheet; the document-type registry as the store-seam interface; the
  stack intent (Svelte + C#); and the cross-cutting properties (idempotency, atomicity, envelope
  uniformity) as spec-layer property candidates.
- **To Acceptance:** the journal's two layers as verifiable system properties, the Authority axiom's
  mismatch path as an observable behaviour, and the saga contract ("the UI sees one envelope, never
  partial state") as an end-to-end assertion.
