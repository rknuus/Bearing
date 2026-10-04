# Bearing v2 — Blueprint Gate Document

> **Gate.** `blueprint` — *Bless system design; the model is const* (ADR-040 §1, ADR-064).
> **Freezes.** The architecture model: components, contracts, DTOs, sequences, activity diagrams.
> **Reviewer.** Human, after a blind peer review (ADR-015).
> **Status.** Pre-Intent. The material below was sketched **before** the business design was frozen —
> which inverts the Diamond's order, since Design compiles *frozen* business truth. It is therefore
> **input to the Design stage, not a Design-stage artifact**, and every element of it is re-derivable
> and re-negotiable once Intent closes.

**Source.** `sources/architecture.md` in its entirety, plus the entity reference fields
from `sources/funnel.md` and three design-relevant statements from the wireframes. Cited as `arch §…`,
`funnel §…`, `wf §…`.

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
load-bearing**: it is the audit trail and the version-controlled history of the Planner's planning.

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
  state-mismatch error to the Planner. Without this axiom, "reconciliation" has no defined direction.
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
| **PlanManager** | Themes, Vision/Mission, Routines, Ideas, Goals, KRs, Focus selection |
| **ExecutionManager** | Tasks, Boards (columns), Day check-out / DayLog |
| **AdviceManager** | Advice — the suggestion lifecycle `generated → presented → applied / dismissed` — and apply-orchestration |

**Naming rationale** (`arch §4`): `PlanningManager` → **`PlanManager`**, because gerunds are
activities and belong to Engines; Managers are nouns, and the Plan is the artifact (themes + ideas +
goals + KRs + routines + focus). `AdvisorManager` → **`AdviceManager`**, managing the *artifact*
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
- **`RecurrenceEngine`**'s job is unclear (`arch §12 Q2`): selection authority beats recurrence in the
  focus use case, so the Engine currently fires nowhere. Candidate homes: pre-suggesting today's
  routines, the coverage views, advisor nudges ("you missed your Wednesday slot"). Its real
  justification depends on **QB-10** — the routine spawn rule nobody has stated yet.

### 3.3 Resource Access (2) — encapsulate mechanism *and* schema

| Access | Encapsulates |
|---|---|
| **VersionedDocumentAccess** | Atomic, transactional read/write of structured documents across two tiers (versioned + scratch). Hides the VCS choice (git today) **and the on-disk schema**. |
| **AdvisorClientAccess** | The external advisor service. LLM provider, protocol and transport are **undecided** (`arch §12 Q9` → Contract gate). The Access encapsulates that volatility regardless of the eventual choice. |

**One Access for storage, not one per entity** (`arch §4`). The predecessor had `theme_access.go`,
`task_access.go`, `routine_access.go` — data-centric SOA, one Access per noun. v2 replaces that with
**one Access encapsulating the storage mechanism and the on-disk schema as a whole**: *"schema is the
Access's secret."*

#### The two-tier model

`VersionedDocumentAccess` exposes a uniform `tx.write(doc)` and routes internally by document type
through a static registry fixed at initialization:

```
Theme              → { tier: versioned, journaled: true,  path: "themes/{id}.json" }
Idea               → { tier: versioned, journaled: true,  path: "ideas/{id}.json" }
Goal               → { tier: versioned, journaled: true,  path: "goals/{id}.json" }
KeyResult          → { tier: versioned, journaled: true,  path: "goals/{goalId}/krs/{id}.json" }
KRCheckIn          → { tier: versioned, journaled: true,  path: "goals/{goalId}/checkins/{ts}.json" }
Routine            → { tier: versioned, journaled: true,  path: "routines/{id}.json" }
Task               → { tier: versioned, journaled: true,  path: "tasks/{id}.json" }
Board              → { tier: versioned, journaled: true,  path: "boards/{tag}.json" }
DayFocus           → { tier: versioned, journaled: true,  path: "focus/{date}.json" }
DayLog             → { tier: versioned, journaled: true,  path: "daylogs/{date}.json" }
OperationLogEntry  → { tier: versioned, journaled: false, path: "journal/{yyyy-mm}/{date}-ops.jsonl", append: true }
─────────────────────────────────────────────────────────────────────────────────────
DayLogDraft        → { tier: scratch,   journaled: false, path: ".scratch/daylog-drafts/{date}.json" }
TaskCreationDraft  → { tier: scratch,   journaled: false, path: ".scratch/task-drafts/{sessionId}.json" }
```

- **Versioned tier** — git-backed, atomic, journaled. One transaction → one commit + one journal line.
- **Scratch tier** — gitignored, atomic file writes, not journaled. Survives crashes; does not pollute
  history.
- **The Manager is tier-agnostic.** A new document type means defining the schema and registering it;
  the Access handles the routing. This is **data-source resolution by static type lookup, not policy
  synthesis** — the Access decides storage routing, never business outcomes.
- **The op-log is never double-journaled** — it *is* the journal.
- **The path schemes for Goal, KeyResult, KRCheckIn, Task, Board and DayLog are illustrative and
  provisional.** Open storage-organization questions — whether KRs and check-ins nest under the goal
  folder or live flat; whether tasks group by board / tag / date or stay flat; whether a board keys by
  tag string (rename = file rename) or by stable id; whether day logs shard by year — are **internal
  to the Access**. Changing them must not ripple into Managers, Engines or the op-log; that
  non-rippling *is* the encapsulation claim, and it is testable.
- **Keep changes minimal** (`arch §4`): a column or section schema holds a **list of task ids**, not
  the tasks themselves, so reordering within a column writes one small document rather than N.

**Three document types are missing from the registry** and must be added or explained during Design:

| Entity | Where it comes from | Status |
|---|---|---|
| `GoalCheckout` | `funnel §Entity reference fields`, `wf §4.4` — an entity with its own id, outcome, per-KR statuses, retro text, and a follow-up back-reference | **not registered** |
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
All state-changing operations funnel through `VersionedDocumentAccess`, which guarantees atomicity
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
There is no parallel write path: applying a suggestion is identical to the Planner clicking the same
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

### UC1 — `PlanManager.SetDailyFocus(date, ideaIds[], routineIds[])`

```
└─► VersionedDocumentAccess.transact(tx)
      ├─► validate FK:  every id in ideaIds resolves to an Idea (not archived)
      ├─► validate FK:  every id in routineIds resolves to a Routine (active, not paused)
      ├─► mutate:       write DayFocus{date, ideaIds, routineIds}
      └─► commit
└─► build envelope-in-progress { mutated: [DayFocus], version }
└─► queue UC5 with { date, routineIds, envelopeInProgress }
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
timestamps). A denormalized field gets added only when a query pattern earns it. ⚠ `wf §6.4` already
assumes such timestamps exist — contradiction **C-4** / **QB-23**, and `arch §12 Q3`.

### UC3 — `PlanManager.CaptureIdea(title, themeId?, tagInput?, details?)`

```
└─► transact(tx)
      ├─► validate inv: title is non-empty
      ├─► normalize:    tag = normalize(tagInput ?? deriveFrom(title))   // iFX helper
      ├─► validate inv: tag ∉ {"routine", "untagged", "all"}             // reserved
      ├─► validate inv: tag is unique across all ideas (active + archived)
      ├─► validate FK:  themeId (if provided) resolves to a Theme (not archived)
      ├─► mutate:       write Idea{id, themeId?, title, tag, details?, archived_at: null}
      └─► commit
```

### UC4 — `ExecutionManager.CheckOutDay(date, options{archiveCompleted, resetInProgress, notesMd})`

The Manager accumulates one `DayLog` plus N task mutations **inside one transaction** — Pivot 2's
"the Manager owns the transaction boundary". The whole check-out lands as one commit or none of it does.

```
└─► transact(tx)
      ├─► read:    completedTasks  = tasks completed today      (predicate TBD — Q3)
      ├─► read:    inProgressTasks = tasks in progress today    (predicate TBD — Q3)
      ├─► compute: result = CheckoutEngine.DayCheckout(completedTasks, inProgressTasks, options)
      │              → DayCheckoutResult { dayLog, taskMutations[] }
      │                 taskMutations: { taskId, archived_at }        when archiveCompleted
      │                                { taskId, column: <backlog>, rank: <end of section> }  when resetInProgress
      ├─► mutate:  write result.dayLog
      ├─► mutate:  for each m in result.taskMutations → write the task with m applied
      └─► commit
```

Sibling operation — draft auto-save, scratch tier, idempotent (last write wins per date), promoted to
the versioned `DayLog` on check-out and then cleaned up:

```
ExecutionManager.SaveDayLogDraft(date, notesMd)
└─► transact(tx) → mutate: write/update DayLogDraft{date, notesMd, status: "draft"} → commit
```

### UC5 — `ExecutionManager.ScheduleRoutineTasks(date, routineIds[], envelopeInProgress)` *[queued entry]*

```
└─► transact(tx)
      ├─► read:    existing routine tasks for date
      ├─► mutate:  for each routineId not already spawned today → write Task{tag="routine", ...}
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
- **Undrawn use cases that will be sagas:** `DeleteTheme(cascade=true)` (Plan write + Execution task
  and board deletions) · `DeleteIdea(cascade=true)` (Plan write + board and task deletions) ·
  `DeleteRoutine(cascade=true)` (Plan write + task deletions) · `ApplyAdvisorSuggestion` — *iff*
  `AdviceManager` has persistent state (`arch §12 Q12`); if suggestions are ephemeral it is a pure
  dispatch.

### Cross-cutting patterns (`arch §9`)

**Scheduling pattern** (exemplified by UC5) — any operation in this family must be **eager** (the
journal records cause and effect in lockstep), **idempotent** (N calls ≡ 1 call), and
**additive-only** (creates what is missing; never deletes for "no longer needed").

**Cascade pattern** — a binary `cascade: bool` **per call**, off by default in the UI. Theme / Idea /
Routine with `cascade=false` → **detach**; Column with `cascade=false` and non-empty → **reject**
(the unique case: `task.column` is required, so there is no clean detach state); Goal and Task have no
cascade option. **No configuration layer** for cascade defaults. ⚠ "Detach" conflicts with the
required `theme_id` on goals and routines — **C-1 / QB-03**.

**Optimistic-UI / authority** — the UI predicts, the backend confirms; on mismatch the UI reverts to
backend state and reports an error to the Planner.

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
separate from name, so renaming preserves behaviour (day check-out and the advisor key off role).
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
day check-out and one column operation. The Intent document's §6 implies roughly **80 system
interactions**. Every one of them needs a Manager operation, and the facet/operation/DTO factoring is
the Design stage's core work. Grouped by owner, the undrawn surface is:

| Manager | Undrawn operation families |
|---|---|
| **PlanManager** | Theme CRUD + reorder + delete-with-cascade · Vision/Mission read + write · Routine CRUD + pause/resume + reorder + delete-with-cascade · Idea amend, notes auto-save, re-affiliate, reorder, archive, unarchive, delete-with-cascade · Idea tag validation (the Collision / Reserved query behind `wf §3.2`) · Goal CRUD + reorder + archive + unarchive + delete · KR add/amend/remove/reorder · KR check-in (numeric + boolean) · Goal check-out + carry-forward seeding · Focus clear / copy / set-for-another-date (the UC-family question, `arch §12 Q10`) · Ideation read projections (filter / sort / theme scope / archive view) |
| **ExecutionManager** | Task amend · Task archive / unarchive / delete · Task-draft stage / amend / reorder / discard / discard-all / commit · Column rename / insert / reorder / role-change / archive-all · Board read projections (boards strip, funnel context header, All-board aggregate) · Day rollover (`arch §12 Q1`) · Archived-tasks view |
| **AdviceManager** | Open conversation with context + selection · Ask · Apply (ten catalog types) · Dismiss · Clear · Supersession bookkeeping (if suggestions persist) |
| **Cross** | Bootstrap / first-run (`wf §7.2` steps 1–5) · Pre-seed default themes · Onboarding completion |

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
| Q1 | **Day-rollover trigger** — who fires the new-day routine spawn? | **Blueprint** | Client-driven `RolloverDay(date)`, invoked when the client detects a new local day; avoids a backend timer thread. Interacts with BR-44 and with the BPMN's `scheduler pool`. |
| Q2 | **What is `RecurrenceEngine`'s actual job**, given that selection authority beats recurrence in UC1? | **Blueprint** | Pre-suggesting today's routines; coverage views; advisor nudges. **Blocked on QB-10** (the spawn rule is a business question first). |
| Q3 | **"Completed today" / "in progress today" predicates** for day check-out, with no timestamp fields on Task | **Blueprint**, then Contract | Read the journal (purer) or add a `lastEnteredAt`-style denormalization (faster). A query-efficiency decision, not a correctness one — but **QB-23** must state the business predicate first. |
| Q4 | **`ChangeColumnRole`** — full pseudocode and consequence handling | **Blueprint** | Defer to a board-management use-case pass. |
| Q6 | **The advisor-apply use case** — exercises queued Manager-to-Manager and the apply-via-same-operations contract | **Blueprint** | Not yet drawn. Gates Q9 and Q12. |
| Q7 | **Goal check-out + theme cascade** — validates the `GoalCheckout` facet and theme-level cascade | **Blueprint** | Not yet drawn. Will surface **C-1 / QB-03** concretely. |
| Q8 | **Is `PrioritizationEngine` justified?** No facets, no callers, no system-driven priority logic | **Blueprint** | Drop unless a non-human priority producer emerges. If priority stays a human decision the Engine is dead weight. |
| Q9 | **Advisor backend** — provider (Anthropic / OpenAI-compatible / local / mixed), protocol (HTTP / stdio / subprocess bridge), transport (direct SDK / CLI wrapper / compatible endpoint) | **Contract** (ADR-071 `DV:` tier) | No decision made; earlier speculation was retracted 2026-05-17 and the predecessor's approach is not authoritative. Depends on licence terms, the single-machine constraint, offline tolerance (**QB-19**), the latency budget, and whether an MCP server is eventually wanted. `AdvisorClientAccess` encapsulates it regardless. |
| Q10 | **Is `SetDailyFocus` still a "core" use case, or are UC1 + UC5 too granular?** Both halves feel implementation-shaped rather than user-shaped after the split | **Blueprint** | Park until more focus use cases surface; if variants emerge (set / clear / copy-from-yesterday / set-for-a-future-date / advisor-adjusted), promote to a use-case family. |
| Q11 | **Board creation: eager (saga) or lazy (materialize on first use)?** | **Blueprint** | Lean **lazy** — symmetric with the funnel's "show when there's something to show", avoids materializing boards for ideas that die, keeps UC3 a clean single-Manager use case. Requires the UI to fall back to default columns for a tag with no board document. |
| Q12 | **Does `AdviceManager` have persistent state, or are suggestions ephemeral?** | **Blueprint** | Persistence buys audit ("show past suggestions and how I decided") and makes `ApplySuggestion` a saga; ephemeral makes `AdviceManager` a thin dispatcher. Determines what it actually *manages* — and whether a `Suggestion` document type exists at all. Business input in **QB-20**. |

---

## 12. Findings against the sketch

Observations a Blueprint review would be expected to raise. Recorded now so the Design stage opens
with them in hand rather than rediscovering them.

| # | Finding |
|---|---|
| F-1 | **Three entities have no document type** — `GoalCheckout`, Vision/Mission, and `Suggestion` (§3.3). The first two are certain to be persistent; the registry as written cannot store them. |
| F-2 | **`PrioritizationEngine` has no caller and no facet** (Q8). A component that nothing changes contradicts volatility-based decomposition. |
| F-3 | **`RecurrenceEngine` has no firing point** (Q2) and its subject matter — the spawn rule — is not specified anywhere (**QB-10**). An Engine encapsulating an unstated policy cannot be reviewed. |
| F-4 | **The journal-as-query-source assumption is untested.** Q3 proposes reading the op-log to answer "what completed today". The op-log is append-only JSONL sharded by month; a per-day predicate over it is a scan. The Access would then own a *query* surface over the journal, which the two-tier registry does not describe. |
| F-5 | **`Board` keyed by tag string makes a tag rename a file rename** (§3.3) while `wf §3.2` promises that renaming a tag silently re-keys the board and updates every task's tag. That is a multi-document write inside one transaction, and possibly a saga (Plan write + Execution re-key) — undrawn, and in tension with the "lazy board creation" lean of Q11. |
| F-6 | **Deletion sagas are named but undrawn** (§7), and all three carry the detach-vs-required-FK contradiction (C-1). They are also the three use cases most likely to need the task/board reach that crosses the Manager boundary. |
| F-7 | **Reads are under-specified relative to writes.** Pivot 5 names exactly one pull-on-entry query (`GetBoardSummary`); the UI needs read projections for every view (boards strip, funnel context, All-board aggregate, coverage strips, archive views, Ideation filter/sort). "Reads return data + version" is the only stated contract. |
| F-8 | **The envelope's `invariants_checked` field has no consumer.** Pivot 1 includes it in every mutation response; nothing in the UI contract or the reconciliation routine reads it. Either it is evidence for the Planner-visible error path, or it is ceremony. |
| F-9 | **The op-log's `actor` field has exactly two possible values** (the Planner, the advisor) in a single-user product — and under Pivot 3 the advisor's writes go through the same operations, so `actor` must be threaded through the queued call to stay meaningful. |
| F-10 | **Draft scoping.** `TaskCreationDraft` keys by `{sessionId}`, but nothing in the design defines a session, and `wf §6.2` promises drafts survive app restarts. A restart-surviving draft keyed by a session id needs the session to be durable — or the key to be something else. |

---

## 13. What the Design stage will need that does not exist yet

| # | Owed |
|---|---|
| D-01 | A **frozen business design** to compile — Design consumes const Intent artifacts (ADR-040 §3). Today the business design and this sketch were authored in parallel. |
| D-02 | The **model in the store** — components, facets, operations, DTOs with comparison classes, use cases keyed by the minted SI ids with their permutations, all via `sns-cli`. |
| D-03 | The **SI binding map** (`si-binding.yaml`, ADR-041) with a per-edge realization declaration, and the ADR-068 refinement: every drawn box bound `{ operation | internal | expands }`, every system-side send bound `{ operation | event }`. |
| D-04 | **Generated sequences** (`seqmap sequence`) from block × binding, ending at the ResourceAccess (ADR-036) — never hand-authored. |
| D-05 | **Activity diagrams** per Manager use case (ADR-031), which become the generated Manager entry bodies (ADR-061). |
| D-06 | The **enriched Sequence Map** and a green `seqmap complete --si <exports>`. |
| D-07 | The **walkthrough-replay regression** — the approved walkthroughs re-run green once the mockup is driven by the model-derived Sequence Map, proving system design did not silently change the business design. |
| D-08 | **Self-critique + a blind peer review** (ADR-015) before the gate. |
| D-09 | A **Q&A ledger with no open entry blocking a promoted element** (`qa check`). |
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
