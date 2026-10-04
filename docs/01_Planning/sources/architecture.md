# Bearing — Architecture (IDesign / Method)

> Status: **in progress**. This document captures the outcomes of an architecture interview session. It is a living record; sections marked *(parked)* require future decisions. Foundational concepts (funnel, UI inventory, wireframes) live in their own docs; this one focuses on the IDesign decomposition.

## 1. Project framing

Bearing is a **personal planning tool**. Single user, single machine, desktop only (no phone, no sync, no multi-device). The foreseen technology stack is: Svelte for the front-end and C# for the backend. However, **language/UI-framework reimplementations are a portability concern, not an architectural volatility** — the architecture stays language-agnostic at the diagram level.

The user's **daily hot path** is:

1. Set daily focus (Focus tab)
2. Execute tasks for selected tags (Execution tab)
3. Capture / refine ideas opportunistically *during* execution
4. Check out the day at end-of-day
5. Review goals occasionally (out-of-band cadence)

Steps 1–4 are the per-day reality; everything else is colder.

## 2. Non-functional invariants (the floor)

These are not features. They are constraints that shape every Manager operation and every Access write.

- **Every state change is journaled** to a versioned file store. The journal is load-bearing — the audit trail and the version-controlled history of the user's planning. **Realized in two layers:**
  - **State layer** — `VersionedDocumentAccess` atomic writes + git commits. Each commit is timestamped, ordered, replayable (`git checkout <sha>`). Gives time-travel and audit for free.
  - **Operation log layer** — every Manager operation appends one `journal/{yyyy-mm}/{date}-ops.jsonl` line recording `{op, args, ts, version_after, actor}`. Git answers *"what changed;"* the op-log answers *"which operation, by whom, with what arguments."*
  - **Neither layer alone is sufficient** — git is opaque about operation intent (you have to infer from diffs); op-log alone is opaque about resulting state. Together they constitute the journal.
  - **Why not full event sourcing?** Bearing is state-first by user mental model ("my themes," "my focus today"), single-user/single-consumer, and git already provides the temporal/audit dimension. Full event sourcing would pay ceremony costs (event schema evolution, projection rebuilds, snapshotting) for benefits that don't apply at this scale. The two-layer model gets ~80% of event-sourcing's audit/replay value at ~20% of the cost.
- **Mutations are atomic** under rapid-fire user operations. Concurrent calls cannot corrupt state.
- **UI is optimistic; the backend is authoritative.** The UI's speculative state is a *prediction*; the backend's post-mutation state is *canonical*. But to catch misalignments btw. front- and backend, the frontend predicts the expected state and compares the expected with the canonical state provided by the backend. On mismatch, the UI rewrites to the backend's state, not the other way around, logs error details for debugging, and reports a state mismatch error to the user.
- **Uniform mutation envelope.** Every mutation operation returns `{ version, mutated: [...entities], invariants_checked: [...] }`. The UI has one reconciliation routine; new operations don't require new reconciliation code.

## 3. Volatility map

The architecture is **decomposed by volatility, not by funnel stage, domain, or UI tab.** Tabs are UI projections.

| Axis | Volatility | Encapsulated by |
|---|---|---|
| Storage substrate (git today; jj / fossil / CAS tomorrow; on-disk schema) | High over years | Resource Access |
| Advisor reasoning (LLM provider, prompts, agent loops, eventual MCP) | High and ongoing | Engine + Resource Access pair |
| Goal-setting model (OKR today; maybe different later) | Medium | Engine |
| Execution / prioritization model (Eisenhower-backlog today; Cynefin / time-blocks tomorrow) | Medium | Engine |
| Recurrence semantics (daily / weekly / monthly + preferred days) | Low-medium | Engine |
| Day-closure policy (what carries, what archives, what gets logged) | Medium | Engine |
| External agent surface (MCP server, scripting hooks) | Future-volatile | Future Manager / Client |
| Ideation organization details (filtering, sorting, search) | Low (UI-side) | Manager facet |
| **Funnel structure & cross-level linking** | **Stable. Sacred.** | Encoded in domain model |
| **Daily focus + per-tag board view** | **Stable. Sacred.** | Core use case shape |

## 4. Service taxonomy

**Total: 10 services** (3 Managers + 4 Engines + 2 Resource Access + 1 Utility).

### Managers (3) — orchestrate use cases, hold no logic

| Manager | Owns |
|---|---|
| **PlanManager** | Themes, Vision/Mission, Routines, Ideas, Goals, KRs, Focus selection |
| **ExecutionManager** | Tasks, Boards (columns), Day check-out / DayLog |
| **AdviceManager** | Advice (suggestion lifecycle: generated → presented → applied / dismissed), apply-orchestration |

#### Naming rationale

- `PlanningManager` → **`PlanManager`** — gerunds (`-ing`) are activities (Engine territory). Managers are nouns. The Plan is the artifact (themes + ideas + goals + KRs + routines + focus).
- `AdvisorManager` → **`AdviceManager`** — manage *artifact* (advice), not *actor* (advisor). Same logic as PlanManager (managing a Plan, not a Planner).
- `ExecutionManager` — "execution" is a deverbal noun, acceptable. Same class as "production" / "distribution."

### Engines (4) — volatile activities, take inputs, return outputs

| Engine | Activity | Facets |
|---|---|---|
| **PrioritizationEngine** | Assigns Eisenhower quadrant on intake / advisor suggestion | — |
| **RecurrenceEngine** | Routine recurrence math (daily / weekly / monthly + preferred days) | — |
| **CheckoutEngine** | End-of-period evaluation: what completed, what carries, what archives | `DayCheckout`, `GoalCheckout` |
| **SuggestionEngine** | Funnel-context-aware advisor reasoning | — |

#### Why CheckoutEngine has two facets

Day check-out and Goal check-out are the same shape of work: *take a completed period, evaluate against committed intent, produce a closure record*. Originally drawn as two engines (`DayClosureEngine` + `GoalCheckoutEngine`); consolidated when the volatility was recognized as one.

### Resource Access (2) — encapsulate mechanism AND schema

| Access | Encapsulates |
|---|---|
| **VersionedDocumentAccess** | Atomic, transactional read / write of structured documents across two tiers (versioned + scratch). Hides VCS choice (git today) and on-disk schema. |
| **AdvisorClientAccess** | External advisor service. LLM provider, protocol, and transport are **undecided** — see § 12 Q9. The Access encapsulates this volatility regardless of the eventual choice. |

#### Why one Access for storage, not per-entity

The predecessor had `theme_access.go`, `task_access.go`, `routine_access.go`, etc. — data-centric SOA (one Access per noun). Replaced by **one Access encapsulating the storage mechanism and the on-disk schema as a whole.** "Schema is the Access's secret."

#### Two-tier model

`VersionedDocumentAccess` exposes a uniform `tx.write(doc)` interface. Internally it routes by document type via a static registry set at initialization:

```
DocumentTypeRegistry (representative entries):

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
  OperationLogEntry  → { tier: versioned, journaled: false, path: "journal/{yyyy-mm}/{date}-ops.jsonl",
                         append: true }                              # the journal itself; never double-journaled
  ──────────────────────────────────────────────────────────────────────────
  DayLogDraft        → { tier: scratch,   journaled: false, path: ".scratch/daylog-drafts/{date}.json" }
  TaskCreationDraft  → { tier: scratch,   journaled: false, path: ".scratch/task-drafts/{sessionId}.json" }
```

- **Versioned tier** — git-backed, atomic, journaled. Each transaction produces one commit + one journal line.
- **Scratch tier** — gitignored (`.scratch/`), atomic file writes, not journaled. Survives crashes; doesn't pollute history.
- The Manager is tier-agnostic. Adding a new document type means defining the schema and registering it; the Access handles routing.
- **This is data-source resolution, not policy synthesis** — the Access is not deciding *business outcomes*, only *storage routing* by static type lookup.
- **Path schemes for `Goal`, `KeyResult`, `KRCheckIn`, `Task`, `Board`, and `DayLog` are illustrative and provisional.** Open storage-organization questions include: whether `KeyResult`/`KRCheckIn` nest under the Goal folder or live in flat namespaces; whether `Task` is grouped by board / tag / date or stays flat; whether `Board` keys by tag string (rename = file rename) or by stable id; whether `DayLog` is date-sharded by year for browseability. These decisions are **internal to `VersionedDocumentAccess`** — changing them does not ripple into Managers, Engines, or the operation log, which is exactly the encapsulation point of the Access.
- **Keep changes minimal**, e.g. when changing the order of stories in a column/section, the schemas shall be defined in a way that the column/section schema contains a list of task IDs, but not the tasks themselves (see Pivot 5 below).

### Utility (1) — iFX

Thin infrastructure framework:

- Tag normalization (lowercase, non-alphanumeric → `-`, hyphens/underscores preserved)
- Time provider (`iFX.now()`, `iFX.startOfLocalDay(date)`) — single canonical clock, swappable in tests
- ID generation
- Error envelopes
- Mutation-response envelope helpers
- Possibly: settings-read convenience helpers (proxy reads to Access; writes go through a proper Manager)
- **`publishToClient(envelope)`** — transport for terminal saga envelopes. Backing mechanism (Wails event emission today; WebSocket / SSE / cloud push tomorrow) lives behind the iFX boundary so saga-terminal Managers stay transport-agnostic. See § 5 Pivot 4 for the saga model that depends on it.

## 5. Architectural pivots / load-bearing decisions

### Pivot 1 — Uniform mutation envelope

Every mutation returns `{ version, mutated: [...], invariants_checked: [...] }`. Not per-operation ad-hoc returns. The UI has one reconciliation routine that swaps mutated entities into local store and bumps version. Adding operations doesn't require new reconciliation code.

### Pivot 2 — Single mutation serialization point

All state-changing operations funnel through `VersionedDocumentAccess`. Atomicity is guaranteed by the Access (one transaction in flight at a time, or transactional batching). The Manager owns the **use case as the transaction boundary** — it accumulates writes against a `tx` handle over the course of the use case, then the Access commits as one atomic operation (one git commit, one journal line, one version bump).

Example shape:

```
access.transact(ctx, (tx) => {
  tx.read(...)
  tx.write(doc_a)
  tx.write(doc_b)
  // ...
})  // single commit, single serialization point
```

### Pivot 3 — Advisor is a Manager peer, not a sidecar

`AdviceManager` calls `PlanManager` and `ExecutionManager` via **the same operations the UI uses**. There is no parallel write path. Applying an advisor suggestion is identical to a user clicking the same control. This kills a whole class of "advisor wrote bad state" bugs and keeps the journal clean.

**On batch apply ("Apply all").** Each `ApplySuggestion(suggestionId)` is its own use case making one queued M2M call to the appropriate downstream Manager. **There is no server-side "Apply all" operation** — that would be workflow orchestration inside a Manager, an IDesign violation. The UI iterates through selected suggestions, calling `ApplySuggestion` once per id. This is batch invocation of the same use case, not orchestration of disparate use cases (no Original Sin) because each apply is a complete unit and the batch has no emergent server-side meaning.

**Failure policy: abort-on-first-failure.** The UI's iteration loop breaks on the first non-success envelope. Rationale: a buried error among successful follow-ups makes the revert calculus harder; aborting keeps the applied-set small and the failure-point visible. Suggestions after the failure are *not attempted* — the user fixes / dismisses / retries the failing one and either re-runs Apply all or applies remaining individually. Failure policy lives entirely in UX code, never in the backend.

### Pivot 4 — Multi-Manager user gestures are choreographed sagas, not orchestrated workflows

When a user gesture spans more than one Manager use case, the relationship is a **saga**: an ordered sequence of *independent* use cases connected by queued M2M calls that pass an **envelope-in-progress** forward through the chain.

- **Each step is a complete use case** in its own right (single Manager interaction, single transaction). Steps are linked only temporally within a saga, not semantically — UC1 and UC5 below are independent UCs that happen to be ordered.
- **No `await`.** The originating Manager fires the queued call and is done. No waiting; no synthesizing of others' envelopes.
- **The envelope-in-progress flows through queued-call payloads.** Each step appends its own mutations.
- **The terminal step publishes** the combined envelope to the UI via `iFX.publishToClient`. The terminal step knows it is terminal because the saga shape is fixed in code (encoded in the chain of queued calls).
- **No saga coordinator.** A central orchestrator would be a Manager-of-Managers — an anti-pattern. Sagas are pure choreography; their shape lives in the call chain and is documented per-saga.
- **The UI receives one envelope per saga**, not per step. No partial saga state is visible.

This holds whether the deployment is single-process (queued = in-process dispatch, latency ~µs) or distributed (queued = real message/RPC, latency ~ms+). The contract is identical; only the transport changes.

### Authority axiom

The backend's post-mutation state is canonical. The UI's pre-mutation speculation is a prediction. On mismatch, the UI rewrites to backend state. Without this axiom, "reconciliation" has no defined direction.

### Pivot 5 — UI cache is push-fed, not pull-driven

The UI maintains a local cache as a *predicted mirror* of backend state. The cache is **push-fed**: every successful mutation (single use case or saga) produces an envelope that the UI absorbs into its cache. The UI never polls.

- **Envelope = cache update.** Every mutation envelope carries the canonical post-mutation state of the affected entities. The UI applies it.
- **Reads serve from cache.** UI projections (board strips, task counts, derived views) are computed at render time from the cache. No backend round-trip per read.
- **The cache is a prediction, not state.** It's reconciled to backend on every envelope and on explicit pull points. The backend remains authoritative per the Authority axiom.
- **Pull is the safety net, not the default.** Explicit pull-on-entry queries (`GetBoardSummary`, etc.) reconcile the cache at view mount, on cold start, and after missed envelopes. Outside those moments, the cache + push is the steady state.
- **Deployment-agnostic.** The same contract works for in-process (µs latency) and cloud (ms+ latency). The cache pays off more as latency rises, but the architecture doesn't change.

The cache itself is a UI/client implementation concern (not a service in the IDesign decomposition), but the *contract* the backend honors — full mutated entities in envelopes; proactive push for saga terminals; uniform envelope shape — exists to make this cache strategy viable.

## 6. Closed-architecture rules

- **Manager** may call: `Engine`, `Access`, **queued** `Manager` (Manager-to-Manager is always queued, never synchronous)
- **Engine** may call: `Access` (for reference reads); never another Engine; never publishes / subscribes to events
- **Access** may call: its underlying resource only; never another Access
- **Utility** (iFX) callable from anywhere
- No sideways calls between resources, no calls up, no foreign keys or triggers between cylinders
- **The use case owns the data** — never orchestrate use cases from the client (the Original Sin)
- No client-side composition of multiple Manager operations into a single semantic action; that's what queued Manager-to-Manager calls or Saga patterns are for

## 7. Pseudocode convention

Use-case diagrams use role-prefixed steps inside a transaction:

| Prefix | Meaning |
|---|---|
| `validate FK:` | foreign-key existence / state check |
| `validate inv:` | invariant check (uniqueness, reserved-string, etc.) |
| `read:` | read for use-case logic (not validation) |
| `normalize:` / `compute:` | pure transformations / engine calls |
| `mutate:` | state-changing write |
| `commit` | end-of-transaction marker |

Every mutation returns the uniform envelope from Pivot 1; reads return data + version.

**Implicit op-log append.** Every Manager mutation operation appends one `OperationLogEntry` line at commit time as part of the transaction. The append is not shown in the pseudocode for each use case (it would be noise — the discipline is universal). Equivalent to a `mutate: append OperationLogEntry{op, args, ts, version_after, actor}` step inside `transact(tx)` before `commit`. See § 2's two-layer journaling for the rationale.

## 8. Sagas and use cases drawn so far

### S1 — SetDailyFocus saga

The user gesture "set today's focus" spans two independent use cases, ordered temporally and connected by a queued M2M call. Per Pivot 4, this is a **choreographed saga**, not a single use case.

```
S1 choreography (UI initiates with one IPC call to UC1):

  Step 1 (origin):    UC1 — PlanManager.SetDailyFocus
                        ├─ runs own transaction, commits DayFocus
                        ├─ builds envelope-in-progress: { mutated: [DayFocus], version, ... }
                        └─ queues Step 2 with payload {args, envelope-in-progress}
                           (PlanManager is done — no await, no return data of its own)

  Step 2 (terminal):  UC5 — ExecutionManager.ScheduleRoutineTasks
                        ├─ runs own transaction, commits routine tasks
                        ├─ appends own mutations to envelope: { mutated: [DayFocus, ...Tasks] }
                        └─ publishes combined envelope via iFX.publishToClient
```

**Properties of S1:**
- UC1 and UC5 are **independent UCs.** Their relationship is purely temporal within S1 — neither owns the other; each has standalone meaning. (See § 12 Q10 for the parked question on whether UC1 + UC5 are too granular as "core" use cases.)
- **Scheduling is eager, idempotent, and additive-only** — fires as soon as UC1 commits; calling it again with the same inputs does nothing; never deletes tasks for unselected routines.
- **The UI sees one combined envelope** when UC5 publishes — never the partial state between UC1's commit and UC5's commit.

### UC1 — PlanManager.SetDailyFocus

The origin step of saga **S1**. Writes DayFocus, builds the envelope-in-progress, queues UC5.

```
PlanManager.SetDailyFocus(date, ideaIds[], routineIds[])
  └─► VersionedDocumentAccess.transact(tx)
        ├─► validate FK:  every id in ideaIds resolves to an Idea (not archived)
        ├─► validate FK:  every id in routineIds resolves to a Routine (active, not paused)
        ├─► mutate:       write DayFocus{date, ideaIds, routineIds}
        └─► commit
  └─► build envelope-in-progress: { mutated: [DayFocus], version }
  └─► queue UC5 with payload { date, routineIds, envelopeInProgress }
```

### UC2 — Move a task / mark done (three operations)

Three distinct semantics → three operations. Each has a single volatility axis:

```
ExecutionManager.RankTask(taskId, rank)                  // ordering within current group
ExecutionManager.PrioritizeTask(taskId, quadrant, rank?) // Eisenhower section change (Backlog only)
ExecutionManager.MoveTask(taskId, state, priority?, rank?)  // column / lifecycle change
```

```
ExecutionManager.MoveTask(taskId, state, priority?, rank?)
  └─► VersionedDocumentAccess.transact(tx)
        ├─► validate FK:  taskId resolves to a Task (not archived)
        ├─► validate FK:  state references an existing column on this task's board
        ├─► validate inv: column.role == Backlog ⇒ priority is required
        ├─► mutate:       task.state    = state
        ├─► mutate:       task.priority = priority ?? task.priority   // preserved when leaving Backlog
        ├─► mutate:       task.rank     = rank ?? <end of new column>
        └─► commit
```

**No lifecycle timestamp fields on Task for now.** "When was this task last moved" / "when was it created" / "when did it complete" are derivable from the journal (op-log entries record op + ts + taskId; git commits carry timestamps too). If a future query pattern makes a denormalized field worth its keep, we'll add one then.

### UC3 — Capture idea

PlanManager use case. Creates an Idea with normalized tag, uniqueness and reserved-string checks, and optional theme affiliation.

```
PlanManager.CaptureIdea(title, themeId?, tagInput?, details?)
  └─► VersionedDocumentAccess.transact(tx)
        ├─► validate inv: title is non-empty
        ├─► normalize:    tag = normalize(tagInput ?? deriveFrom(title))   // iFX helper
        ├─► validate inv: tag ∉ {"routine", "untagged", "all"}              // reserved
        ├─► validate inv: tag is unique across all ideas (active + archived)
        ├─► validate FK:  themeId (if provided) resolves to a Theme (not archived)
        ├─► mutate:       write Idea{id, themeId?, title, tag, details?, archived_at: null}
        └─► commit
```

**Reserved tag list:** `{routine, untagged, all}`. The `routine` and `untagged` strings are board namespaces per `funnel.md`; `all` is the synthetic aggregate board.

### UC4 — Close the day

The Manager accumulates multiple writes (one `DayLog` + N task mutations) inside a single transaction — the *"Manager owns the transaction boundary"* discipline from Pivot 2. The whole checkout either lands as one atomic commit or none of it does.

```
ExecutionManager.CheckOutDay(date, options{archiveCompleted, resetInProgress, notesMd})
  └─► VersionedDocumentAccess.transact(tx)
        ├─► read:    completedTasks  = tasks completed today (predicate TBD — § 12 Q3)
        ├─► read:    inProgressTasks = tasks in progress today (predicate TBD — § 12 Q3)
        │
        ├─► compute: result = CheckoutEngine.DayCheckout(completedTasks, inProgressTasks, options)
        │              returns DayCheckoutResult {
        │                dayLog: DayLog{date, notes, completedIds[], inProgressIds[]},
        │                taskMutations: [
        │                  // one per completed task, if options.archiveCompleted:
        │                  { taskId, archived_at: iFX.now() },
        │                  // one per in-progress task, if options.resetInProgress:
        │                  { taskId, column: <backlog column id>, rank: <end of preserved-priority section> }
        │                ]
        │              }
        │
        ├─► mutate:  write result.dayLog
        ├─► mutate:  for each m in result.taskMutations → write task with m applied
        └─► commit
```

#### Draft auto-save (sibling operation)

```
ExecutionManager.SaveDayLogDraft(date, notesMd)
  └─► VersionedDocumentAccess.transact(tx)
        ├─► mutate:  write/update DayLogDraft{date, notesMd, status: "draft"}
        └─► commit
```

Drafts live in the scratch tier (gitignored, not journaled). Idempotent (last-write-wins per date). Promoted to versioned `DayLog` on `CheckOutDay`; draft entry cleaned up.

### UC5 — ExecutionManager.ScheduleRoutineTasks

The terminal step of saga **S1**. Receives the envelope-in-progress from UC1, appends own mutations, publishes the combined envelope to the UI. **Idempotent and additive-only** — scheduling a routine that already has a task for the date is a no-op; scheduling never deletes tasks for routines no longer selected.

```
ExecutionManager.ScheduleRoutineTasks(date, routineIds[], envelopeInProgress)   [queued entry]
  └─► VersionedDocumentAccess.transact(tx)
        ├─► read:    existing routine tasks for date
        ├─► mutate:  for each routineId not already spawned today → write Task{tag="routine", ...}
        └─► commit
  └─► append own mutations to envelopeInProgress: { mutated: [DayFocus, ...Tasks] }
  └─► publish: iFX.publishToClient(envelopeInProgress)
```

### Saga audit — sagas vs. single-Manager UCs

Of the use cases drawn so far:
- **Sagas:** S1 (SetDailyFocus: UC1 + UC5)
- **Single-Manager UCs:** UC2 (RankTask / PrioritizeTask / MoveTask), UC3 (CaptureIdea — assuming **lazy** Board creation per § 12 Q11), UC4 (CheckOutDay, SaveDayLogDraft), DeleteColumn

**Undrawn UCs that will be sagas when drawn:**
- **DeleteTheme (cascade=true)** — Plan write + Execution task/board deletions
- **DeleteIdea (cascade=true)** — Plan write + Execution Board & task deletions
- **DeleteRoutine (cascade=true)** — Plan write + Execution task deletions
- **ApplyAdvisorSuggestion** — *iff* AdviceManager has persistent state (§ 12 Q12). If suggestions are ephemeral, it's a pure dispatch (single-Manager).

These will each need full saga treatment per Pivot 4 when drawn (§ 12 Q6 for the advisor flow; the deletion sagas have no parked Q yet but will surface when we draw cold-path UCs).

### `DeleteColumn` (cascade pattern aligned with `ui-wireframes.md` § 2.4)

```
ExecutionManager.DeleteColumn(boardId, columnId, cascade: bool)
  └─► VersionedDocumentAccess.transact(tx)
        ├─► validate FK:  columnId exists on boardId
        ├─► read:         tasks where task.column == columnId
        ├─► branch:
        │     ├─► cascade=false ∧ tasks not empty:
        │     │     reject with TasksWouldOrphan(count)
        │     ├─► cascade=true:
        │     │     for each task: tx.delete(task)
        │     └─► (cascade=false ∧ empty: proceed)
        ├─► mutate:       board.columns = board.columns without columnId
        └─► commit
```

## 9. Cross-cutting patterns

### Scheduling pattern

The shape exemplified by `ScheduleRoutineTasks` (UC5). General properties any operation in this family should hold:

- **Eager**, not lazy. The journal records cause and effect in lockstep; backend state is always canonical regardless of who's looking.
- **Idempotent**. Calling Schedule N times with the same input is identical to calling it once.
- **Additive-only**. Scheduling creates what's missing; never deletes for "no longer needed." Removing a routine from focus does *not* delete its already-scheduled task.

### Cascade pattern (per `ui-wireframes.md` § 2.4)

- Binary `cascade: bool` parameter, **per-call**, off by default in the UI dialog.
- Theme / Idea / Routine: `cascade=false` → **detach** (theme_id cleared, tag becomes untagged board, etc.).
- Column: `cascade=false` ∧ tasks not empty → **reject** (unique case — `task.column` is required, no clean detach state).
- Goal / Task: no cascade option (no downstream-owned data).
- **No configuration layer** for cascade defaults — the dialog is the gathering surface; configuration would defeat § 2.4's safer-default contract.

### Optimistic-UI / authority

- UI predicts; backend confirms.
- Every mutation response is `{ version, mutated: [...], invariants_checked: [...] }`.
- UI matches predicted state against `mutated` + `version`; on mismatch, UI reverts to backend state and reports an error to the user.

## 10. Column property model

```
Column {
  id:    <stable opaque>,
  role:  ColumnRole,         // {Backlog, Todo, InProgress, Done}
  name:  string,             // user-editable display name
  order: int,
}
```

- **Role enum: `{Backlog, Todo, InProgress, Done}`.** Four roles, no `Neutral` escape hatch — every column commits to a workflow semantic.
- **Role is separate from name.** Renaming a column from "InProgress" to "Doing" preserves the role; system behavior (day-checkout, advisor) keys off role.
- **Multiple columns may share a role** (except Backlog). Most custom-added columns will have role `InProgress` — for the backend, the four roles distinguish all relevant cases.
- **At most one Backlog column per board** (invariant). The three Eisenhower sections aren't meaningfully splittable across multiple Backlog columns.
- **Sectioning is implicit from `role == Backlog`.** No separate `sectioned: bool` flag.
- **Role is mutable** with consequences:
  - InProgress → Done: tasks suddenly count as "done" (user's intent).
  - Done → InProgress: completions retroactively unwound.
  - Backlog → other: Eisenhower sections collapse; tasks retain `priority` as metadata.
  - Operation: `ChangeColumnRole(boardId, columnId, newRole)` *(parked — not drawn yet)*.

## 11. Settings & configuration

**Bearing has no user-facing settings** (per `ui-wireframes.md` § 7.2). The `Settings` document type, `SettingsManager` placeholder, and the OS-config-file layer have all been **removed** from the design. Rationale: a personal planning tool with cross-cutting themes/routines (health, sleep) maps to *one workspace*, not several — so the storage location is fixed by OS convention (macOS `~/Library/Application Support/Bearing/`, Linux `~/.config/bearing/`, Windows `%APPDATA%\Bearing\`) via Go's `os.UserConfigDir()`, and initialized as a git repo on first run. OS-level preferences (locale, theme, motion) are auto-detected. No other concerns currently warrant a configurable knob.

If a real configurable concern emerges later (advisor backend choice per § 12 Q9 is a candidate), a settings surface and the corresponding document type / Manager facet are added at that point — with concrete justification rather than as speculative scaffolding.

## 12. Open questions / parked

| # | Question | Lean |
|---|---|---|
| Q1 | **Day-rollover trigger** — who fires the new-day routine spawn? | Client-driven (`RolloverDay(date)` op invoked by client when it detects new local day); avoids backend timer thread |
| Q2 | **RecurrenceEngine's actual job** — selection authority beats recurrence in UC1, so where does the Engine fire? | Pre-suggesting today's routines; coverage views; advisor "you missed your Wed slot" suggestions |
| Q3 | **"Completed today" and "in progress today" predicates** for day-checkout's `completedTasks` / `inProgressTasks` reads. With no `enteredColumnAt` / `transitionAt` field on Task (intentionally omitted — see UC2), the predicate must be derived from the journal (op-log entries record MoveTask ops with timestamps) or by reintroducing a denormalized field if journal queries prove too slow. | Defer — current pseudocode marks the predicate TBD. When UC4 is drawn in detail, decide whether to read journal directly (purer) or add a `lastEnteredAt`-style field as denormalization (faster). The op-log already records what we'd need; this is purely a query-efficiency decision, not a correctness one. |
| Q4 | **`ChangeColumnRole` operation** — full pseudocode + consequence handling | Defer to board-management use-case pass |
| Q6 | **Advisor-apply use case** — exercises queued Manager-to-Manager and the apply-via-same-operations contract | Not yet drawn |
| Q7 | **Goal check-out + theme cascade** — validates `CheckoutEngine.GoalCheckout` facet and theme-level cascade | Not yet drawn |
| Q8 | **Is `PrioritizationEngine` justified?** Priority is currently entirely user-driven (batch creation `[Prioritize to ⬇]`, drag-to-section, `PrioritizeTask` op). No system-driven priority logic exists; the engine has no facets and no callers. | Drop unless/until a non-human priority producer emerges (ML-based triage, rule engine, advisor logic that doesn't fit in `SuggestionEngine`). If priority remains a human-only decision, the engine is dead weight. |
| Q9 | **Advisor backend choice** — LLM provider (Anthropic / OpenAI-compatible / local model / mixed), protocol (HTTP / stdio / subprocess bridge), and transport (direct SDK / CLI wrapper / OpenAI-compatible endpoint). Earlier session speculation about "Claude SDK via TS bridge" was retracted on 2026-05-17; no decision has been made for the rewrite. The predecessor's approach is not authoritative either. | Defer until use cases for the advisor are sketched (Q6). The choice depends on: license terms, single-user/single-machine constraints, offline tolerance, latency budget for the optimistic-UI flow, and whether the advisor will eventually expose an MCP server. `AdvisorClientAccess` encapsulates this regardless. |
| Q10 | **Is `SetDailyFocus` (now UC1) still a "core" use case, or are UC1 + UC5 too granular?** "Set daily focus" felt core when it was one UC; after splitting into UC1 (PlanManager write) + UC5 (ExecutionManager scheduling) joined by saga S1, both partial UCs feel implementation-shaped rather than user-shaped. Worth asking whether there are **variants** that suggest a broader core UC family (e.g., "ManageFocus(date, action)" covering set / clear / copy-from-yesterday / set-for-future-date / advisor-driven adjustment). | Park until more focus-related use cases surface during cold-path review. If multiple variants emerge with shared structure, consider promoting them to a UC family. If `SetDailyFocus` stays unique, accept that the saga's component UCs are simply implementation-level units that don't need "core" status. |
| Q11 | **Board creation: eager (saga) vs. lazy (materialize on first use).** When an Idea is created, should a corresponding `Board` document with default columns be created eagerly (saga at idea creation crossing PlanManager → ExecutionManager) or lazily (Board materializes on first task / first column edit, UI renders default columns as fallback when no Board document exists)? Decision determines whether UC3 stays single-Manager or becomes saga S2. | Lean **lazy** — symmetric with the funnel's *"show when there's something to show"* rule, avoids materializing Board documents for ideas that die without execution, keeps UC3 as a clean single-Manager use case. Requires UI fallback-rendering of default columns for tags with no Board document yet. |
| Q12 | **Does AdviceManager have persistent state (suggestion lifecycle), or are suggestions ephemeral?** If lifecycle is persisted (`generated → presented → applied / dismissed` tracked on disk), `ApplySuggestion` is a saga: Advice write + downstream Manager write. If suggestions are ephemeral (in-memory, regenerated on demand by SuggestionEngine, no persistence), `ApplySuggestion` is a pure dispatch — single downstream Manager call, no saga. | Defer to advisor UC drawing (§ 12 Q6). Persistence enables audit / "show past suggestions and how I decided"; ephemeral simplifies the architecture (and makes AdviceManager a thin dispatcher rather than a state-owning Manager). The choice has knock-on effects on what AdviceManager actually *manages*. |

## 13. Doc gaps surfaced

- ✅ `ui-wireframes.md` § 2.4 column-delete row — **patched in this session**
- ⏳ `funnel.md` tag-normalization rule mentions only `"routine"` as reserved; needs `"untagged"` and `"all"` added
- ⏳ `ui-wireframes.md` lacks a per-section section for column-management UI (column rename, role change, role implications)
- ⏳ Drafts (DayLog, batch-task) — `ui-wireframes.md` § 7.7 / 6.2 mention drafts but don't specify the scratch-tier / gitignored model

## 14. Total service count

3 Managers + 4 Engines + 2 Accesses + 1 Utility = **10 services**. Order of magnitude 10, per IDesign expectation.

---

*End of session notes. Continue at any of the parked questions (§ 12) when resuming.*
