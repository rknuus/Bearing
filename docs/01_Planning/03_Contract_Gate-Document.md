# Bearing v2 — Contract Gate Document

> **Gate.** `contract` — *Spec review; the diamond closes on paper.* **The last human review before
> acceptance** (ADR-040 §1, §4).
> **Freezes.** The ADR-033 §7B spec layer; plus, by amendment, the **deployment decisions** block
> (ADR-071) and one blessed **Resource Protocol Sheet** per ResourceAccess (ADR-059).
> **Reviewer.** Human.
> **Status.** Pre-Intent. What exists is *input* to the Specification stage: technology intent,
> concrete thresholds, failure contracts and seed-data candidates lifted out of the business sketch.
> No spec layer, no sheets, no rulings.

**Why this document exists now.** Much of what the Software Architect wrote is already
Contract-grade — exact thresholds, exact error texts, idempotency statements, a typed advisor schema.
Classifying it here keeps it out of the Intent gate (where it would over-constrain the business
review) without losing it.

---

## 1. Technology intent on record

| Dimension | On record | Source | Status |
|---|---|---|---|
| Front end | Svelte | `arch §1` | **Foreseen**, not ruled |
| Back end | C# | `arch §1` | **Foreseen**, not ruled |
| Desktop shell | Wails is named repeatedly (`MinSize` enforcement, event emission, `os.UserConfigDir()`, Go's standard library) — all inherited from the **Go-based v1**, while v2's stated back end is C# | `wf §7.9`, `wf §7.2`, `arch §11`, `arch §4` | **Contradiction — DV-06** |
| Store | Local filesystem, git-versioned, one repository in the OS application-data folder | `arch §2`, `wf §7.2` | Ruling owed |
| Advisor | Undecided — provider, protocol and transport all open | `arch §12 Q9` | **Ruling owed — DV-02** |
| Portability stance | Language and UI-framework reimplementation is a **portability concern, not an architectural volatility** — the architecture stays language-agnostic at the diagram level | `arch §1` | Recorded |

---

## 2. Deployment decisions owed (ADR-071)

ADR-071 opens the resource-designer pass (between Blueprint and Specification) with a **ruling round**:
the architect proposes a resource kind and product per slot plus the hosting operational concept, the
Software Architect rules, and only then are the protocol sheets authored. The record then carries a
`deployment_decisions` block — one row per slot plus hosting, with a named reviewer and the verbatim
ruling — which is **OPEN when absent and blocking once the gate is crossed**.

The Q&A ledger's **deployment tier** (`DV:<slot>`, `DV:hosting`) fails at Contract only; it is
reported but never failing at Intent and Blueprint, because the model stays product- and
hosting-free (ADR-048 §1).

| # | Ledger key | Decision owed | Proposal on record | Depends on |
|---|---|---|---|---|
| DV-01 | `DV:VersionedDocumentAccess` | Resource **kind** and **product** for the document store | Kind: local versioned document store. Product: **git** today, with jj / fossil / a content-addressed store named as the tomorrow-candidates the Access exists to absorb (`arch §3`) | — |
| DV-02 | `DV:AdvisorClientAccess` | Resource **kind**, **product**, **protocol** and **transport** for the advisor | None. `arch §12 Q9` enumerates the axes: provider (Anthropic / OpenAI-compatible / local model / mixed), protocol (HTTP / stdio / subprocess bridge), transport (direct SDK / CLI wrapper / compatible endpoint). Earlier "Claude SDK via TS bridge" speculation was **retracted 2026-05-17**; the predecessor's approach is explicitly **not authoritative** | QB-19 (offline tolerance), Q6 (advisor use cases), Q12 (persistence), licence terms, latency budget, future MCP ambitions |
| DV-03 | `DV:hosting` — topology shape | Single process on one desktop machine; queued Manager-to-Manager calls degenerate to in-process dispatch (~µs) | The contract is identical for a distributed deployment (~ms+); **only the transport changes** (`arch §5 Pivot 4`) | — |
| DV-04 | `DV:hosting` — target class | Desktop application on macOS, Linux and Windows, each with its own data-folder convention; hard window floor 1024 × 640 | `wf §7.2`, `wf §7.9` | — |
| DV-05 | `DV:hosting` — cost envelope and operator | Operator is the Planner. The **only** running cost is advisor inference; no envelope is stated anywhere | — | DV-02 |
| DV-06 | `DV:hosting` — shell technology | Unresolved: every shell-level statement in the sources is Go/Wails (inherited from v1) while the stated back end is C#. Either the shell stays Go and the C# backend is hosted behind it, or the Wails-specific statements (`MinSize`, event emission, `os.UserConfigDir()`) are v1 residue to be restated | `wf §7.9`, `wf §7.2`, `arch §4`, `arch §11` | — |
| DV-07 | `DV:hosting` — partial deployment | The app must be **fully functional offline**; only the advisor degrades, with an inline error and a retry. Needs confirming as a deployment decision, not just a UI state | `wf §7.7` | QB-19 |

---

## 3. Resource Protocol Sheets owed (ADR-059)

**Two sheets, one per ResourceAccess**, authored after the DV rulings and **blessed by a human at this
gate** — standing dossier evidence, OPEN when absent. Each is `resource-protocol/1`: resource shape,
contract-field fates, per-use-case effect allowlist. They live in `docs/03_Technology/04_Resources/`.
From the Construction stage onward the spec runner enforces the sheet, so the reviewed artifact and
the executed one are the same file.

### 3.1 `VersionedDocumentAccess` — material already available

The document-type registry (Blueprint document §3.3) is the store-seam interface in draft. What the
sheet will need on top of it:

- **Resource shape.** A git repository rooted at the OS application-data folder; one JSON document
  per entity at the registered path; one append-only JSONL file per month for the operation log; a
  gitignored `.scratch/` subtree for the two draft types.
- **Transaction semantics.** One transaction in flight at a time (or transactional batching); one
  transaction → one atomic file write set + one git commit + one journal line + one version bump
  (`arch §5 Pivot 2`).
- **Contract-field fates.** The provisional path schemes for `Goal`, `KeyResult`, `KRCheckIn`, `Task`,
  `Board` and `DayLog` are explicitly **internal to the Access** (`arch §4`) — the sheet is where
  those fates get settled, and where the claim "changing them does not ripple into Managers, Engines
  or the op-log" becomes a reviewable statement rather than an assertion.
- **Effect allowlist.** The versioned tier is journaled; the scratch tier is not; the op-log itself is
  **never double-journaled**.
- **Fault taxonomy** (per the `csharp-access-conventions` discipline — the RA holds the one sanctioned
  catch in the system): a concurrency or lock contention is retried then rethrown; a missing document
  is an *answer*, not an exception; a malformed document on disk is a bug; a git failure (dirty tree,
  detached head, no write permission, exhausted disk) needs a stated class — **none of this exists yet**.
- **Open storage questions to settle in the sheet:** whether KRs and check-ins nest under the goal
  folder or live flat; whether tasks group by board / tag / date or stay flat; whether a board keys by
  tag string or by stable id (a tag rename is a file rename if by string — Blueprint F-5); whether day
  logs shard by year.

### 3.2 `AdvisorClientAccess` — blocked

Nothing can be authored until DV-02 is ruled. What the sheet will have to cover regardless: the wire
DTOs kept distinct from the contract DTOs; the auth seam; idempotency for any write-shaped call; the
fault table for the network seam (a refusal or an unparseable payload is an *answer* — see §6's
failure contracts; a timeout or 5xx is retried then rethrown; an unmapped error is a bug); and the
streaming contract, since the UI renders cards incrementally (`wf §7.7`).

---

## 4. Spec-layer content candidates

The ADR-033 layer the test-engineer authors in the Specification stage, over generated contract types,
split visible / hidden (ADR-033 §4). Everything below is *input*: concrete, already-decided behaviour
that a spec can assert against. The visible/hidden partition is the test-engineer's call, not this
document's.

### 4.1 Validation rules with exact semantics

| # | Rule | Exact form | Source |
|---|---|---|---|
| V-01 | Tag normalization | Lowercase; non-alphanumeric → `-`; hyphens and underscores preserved. (`wf §3.2` states it as "spaces replaced with hyphens, non-alphanumeric *stripped*" — **narrower than `funnel.md`'s "replaced by `-`". Reconcile.**) | `funnel`, `wf §3.2` |
| V-02 | Tag required | Non-empty. Save disabled while empty. | `wf §3.2` |
| V-03 | Tag unique | Across **all** ideas, active and archived. Error names the colliding idea. | `funnel`, `wf §3.2` |
| V-04 | Tag reserved | `{routine, untagged, all}` per `arch §8 UC3`; `{routine}` per the two UI documents. **QB-02.** | `arch §8` |
| V-05 | Validation timing | On **blur** and on **Save attempt** — never on every keystroke. | `wf §3.2` |
| V-06 | Normalization preview | Shown **only when normalization changes the input**. Informational, not a warning. | `wf §3.2` |
| V-07 | Goal theme | Required; `[ + Goal ]` with zero themes is intercepted. | `funnel`, `wf §7.6` |
| V-08 | Routine theme | Required; pre-filled from the parent card, changeable. | `funnel`, `wf §2.3` |
| V-09 | Theme fields | Name and colour both required. | `wf §2.2` |
| V-10 | Goal fields | Theme, objective, time horizon and at least one key result required; horizon defaults to the current quarter. | `wf §4.2` |
| V-11 | Priority required in Backlog | `column.role == Backlog ⇒ priority is required`. | `arch §8 UC2` |
| V-12 | One Backlog per board | Invariant. | `arch §10` |
| V-13 | Focus selectables | Ideas must be non-archived; routines must be active. | `arch §8 UC1` |
| V-14 | Column delete | `cascade=false` ∧ tasks non-empty → reject with `TasksWouldOrphan(count)`. | `arch §8` |
| V-15 | Vision / Mission | Both optional; saving with both empty is a valid state. | `wf §2.5` |
| V-16 | `change_priority` suggestion | Rejected at Apply time if the task is no longer in Backlog. | `wf §7.5` |
| V-17 | `modify_idea` with `new_tag` | Runs the full V-01…V-04 path; a collision fails the Apply and leaves the card pending with `⚠ Tag conflict with "<other idea>"`. | `wf §7.5` |

### 4.2 Thresholds and defaults, verbatim

| Subject | Value |
|---|---|
| Numeric KR auto-infer | `≥ 100% → ✓ Hit` · `50–99% → ⚠ Partial` · `< 50% → ✗ Missed` |
| Boolean KR auto-infer | `Done → ✓ Hit` · `Not done → ✗ Missed` · **never Partial** |
| Goal check-out defaults | Archive **ON**; carry-forward **OFF** |
| Day check-out defaults | Archive completed **ON**; reset in-progress **OFF** |
| Carry-forward KR selection | Only `⚠ Partial` and `✗ Missed`; numeric reset to 0, boolean reset to Not done; check-out notes dropped |
| Carry-forward horizon | Next period relative to the checked-out goal (Q2 → Q3) |
| Carry-forward objective | Copied with the literal prefix `"Continue: "` |
| Backlog sections | Exactly 3, ordered Important & Urgent · Not Important & Urgent · Important & Not Urgent |
| Toast stack | Max **3** visible, newest on top; a 4th dismisses the oldest immediately; success auto-dismiss ≈ **3 s**; error-with-retry is sticky but still displaceable; the cap may drop to 2 on short windows |
| Pre-seeded themes | 3–5: Work / Health / Learning / Relationships / Personal |
| Window floor | 1024 × 640 px (hard, shell-enforced); comfortable ≈ 1280 × 720; with the advisor ≈ 1600 × 720 |
| Advisor split min-widths | ≈ 500 px content · ≈ 400 px advisor; the divider cannot pass either floor; below ≈ 1000 px window width, opening the advisor auto-closes the Boards strip's secondary chips |
| Dialog max-widths | ≈ 720 px typical · ≈ 840 px for the Goal editor, batch Task creation and Goal check-out; full-bleed minus 24 px below 800 px window width |
| Ideation sidebar | Fixed ≈ 180 px at every window width |
| Animation | 150–300 ms for micro-interactions; colour/background up to 200 ms; panel entrance/exit up to 300 ms; `transform` and `opacity` only |
| Focus ring | 2 px solid outline at 2 px offset, `:focus-visible` only, sized to the **hit target**, not the glyph |
| Hit target | ≥ 44 × 44 px for every interactive control, including inline glyphs |
| Day rollover | Local midnight, hardcoded |
| Default landing board | `All`, unless today has a focus selection → the most-recently-active tag board |
| Archive view default sort | Archived-date descending |
| Ideation sort options | Manual (canonical, default) · Recently added · Recently edited · Alphabetical |

### 4.3 Property candidates (ADR-033 properties, not scenarios)

| # | Property |
|---|---|
| P-01 | **Tag normalization is idempotent** — `normalize(normalize(x)) == normalize(x)`. |
| P-02 | **Routine scheduling is idempotent and additive-only** — N calls ≡ 1 call for the same date and routine set; no call ever deletes a task. |
| P-03 | **Day check-out is idempotent per date** — re-running updates the existing day log rather than creating a second one. |
| P-04 | **Day-log draft save is last-write-wins per date.** |
| P-05 | **Every mutation returns the uniform envelope** `{ version, mutated, invariants_checked }` — no operation has an ad-hoc return shape. |
| P-06 | **A saga emits exactly one envelope to the client** — never the partial state between its steps. |
| P-07 | **Priority survives a round trip out of and back into Backlog** — move out, move back, the Eisenhower section is unchanged. |
| P-08 | **At most one pending advisor card per target** at any time. |
| P-09 | **Cascade never orphans** — after any delete with `cascade=true`, no task references a deleted board, no goal references a deleted idea, no routine references a deleted theme. |
| P-10 | **Declining a cascade never destroys** — the detach path leaves every downstream entity reachable (on the `untagged` board, or theme-less). |
| P-11 | **Every committed mutation produces exactly one commit and exactly one op-log line.** |
| P-12 | **The op-log and git agree** — for every op-log line, the recorded `version_after` resolves to a commit whose tree matches the line's mutated entities. |
| P-13 | **Archive is reversible** — archive then unarchive restores the entity to a view-equivalent state. |
| P-14 | **Archive never cascades** — archiving an idea leaves its task set untouched. |
| P-15 | **Mutations are atomic under concurrency** — interleaved rapid-fire operations never produce a partially written transaction. |
| P-16 | **Tag uniqueness holds across the archive boundary** — no sequence of create / archive / rename operations yields two ideas with one tag. |
| P-17 | **A board shows iff it has something to show** — the visibility predicate is a pure function of (today's focus, in-flight tasks, orphan tasks). |

### 4.4 Naive reference models (mandatory by default, ADR-040 §4)

Four pieces of behaviour are simple enough to model naively and valuable enough to be worth it, since
they are where the real logic lives:

1. **Tag normalization** — a pure string function.
2. **KR auto-infer** — a pure function of (KR type, progress) → label.
3. **Routine spawn** — a pure function of (date, recurrence, frequency, preferred days, already-spawned
   set) → tasks to create. **Blocked on QB-10**, which is precisely why it is worth modelling.
4. **Board visibility** — a pure function of (tags with tasks, today's focus, routine tasks in flight,
   orphan tasks) → the boards strip.

### 4.5 Seed-row candidates

The Intent document's §9 carries a single coherent dataset — themes, ideas with tags, goals with four
typed KRs and three dated check-ins, four routines with distinct recurrences, a full day of tasks
across four columns and three sections, a day check-out, a goal check-out with mixed outcomes, and
three archived goals. It is **business-sourced rather than test-engineer-invented**, which is the
whole point of ADR-040 §2's capture, but it is **candidate data**: the mockup's outputs are simulated
and the seeded resource state behind an expected result is invisible in a walkthrough, so the
Specification stage must **re-verify every expected value**, with the stakeholder where needed.

### 4.6 UI anchors (ADR-027 / ADR-037 §5)

Stable element ids for the E2E tests to locate controls by are **generated deterministically in the
Specification stage's scaffolding pass**. The naming conventions they will have to serve are already
fixed and should be read as constraints on the anchor scheme:

- **Tab-header button order, invariant across all five tabs:** `[ Show archived <type>… ]` ·
  view-mode controls (search, sort) · `[ ✦ Advisor ]` · `[ + … ]`. The advisor button is always
  immediately before the create button when both are present; the create button is always rightmost.
- **Board strip naming:** `All`, `Routines`, `Untagged` are capitalized; tag boards are lowercase and
  match the tag string exactly.
- **Abbreviation rule:** `Imp. & Urgent`-style abbreviation is permitted **only** where horizontal
  width forces it (column headers, narrow chips) — never in body prose, button labels or design notes.

---

## 5. Failure contracts (ADR-033 failure contracts)

Every failure the sources specify, with its surface and its exact user-facing shape where one is given.

| # | Failure | Surface | Contract |
|---|---|---|---|
| E-01 | Tag collision | Idea editor | `⚠ This tag is already used by "<title>".` + *"Pick a different tag — each idea owns a unique tag."* Save disabled. |
| E-02 | Reserved tag | Idea editor | `⚠ "routine" is reserved — it identifies the Routines board.` + a constructive alternative. Save disabled. |
| E-03 | Save in flight | Every editor, confirmation, batch creation | Primary button → `[ Saving… ⟳ ]`, disabled; secondary buttons (Cancel, Close) stay **active** so the Planner can abort. |
| E-04 | Save failed | Same | Inline, next to the field or button that produced it. Toasts are reserved for transient acknowledgments. |
| E-05 | Advisor unreachable | Advisor conversation | Inline **in place of the response that did not arrive**: `⚠ Couldn't reach the advisor. Check your connection.` + `[ Retry ]`, which re-sends without re-typing. History stays intact. |
| E-06 | Apply failed — target gone | Suggestion card | `⚠ Target no longer exists.` The `[ Apply ]` button is **removed**; `[ Dismiss ]` remains. The card stays pending. This is the partial-failure mode `[ Apply all ]` falls back to. |
| E-07 | Apply failed — tag conflict | Suggestion card | `⚠ Tag conflict with "<other idea>"`; the card stays pending. |
| E-08 | Apply failed — priority not applicable | Suggestion card | `change_priority` on a task no longer in Backlog is rejected with an inline error. |
| E-09 | Advisor payload unrecognized type | Advisor conversation | Render the `prose` field as a plain message — **no card, no Apply**. Log for telemetry (**QB-07**). This is the graceful-degradation path that lets the catalog evolve. |
| E-10 | Advisor payload schema-invalid | Advisor conversation | **Drop the suggestion entirely**; show a discreet toast *"Advisor returned an unparseable suggestion — try rephrasing your question"*. Log for telemetry. |
| E-11 | Column delete would orphan | Delete confirmation | Reject, surfaced as a **hard error with the cascade prompt highlighted**; the Planner either cascades or cancels. Backend: `TasksWouldOrphan(count)`. |
| E-12 | Optimistic-UI mismatch | Anywhere | The UI **rewrites to the backend's state**, logs the details for debugging, and **reports a state-mismatch error to the Planner**. |
| E-13 | Data folder missing or unreachable symlink | App launch, before any content | Create (or replace) the folder, `git init`, then the modal new-data-folder notification with `[ Quit ]` / `[ Continue ]`. No folder picker, no in-app restore. |
| E-14 | Batch apply, mid-sequence failure | Advisor | **Abort on first failure** — the UI's loop breaks; later suggestions are not attempted. Policy lives in UX code, never in the backend. ⚠ `wf §7.5` also says *"the other cards still apply and the conflicting one stays pending"* — **contradiction, DV/spec ruling owed (QC-01).** |

---

## 6. The advisor suggestion catalog — the one real contract already written

`wf §7.5` specifies a closed, typed catalog. This is Contract-grade as written and is the most
spec-ready artifact in the whole source set.

### 6.1 Common shape

```
{
  "type":        "<one of the ten catalog types>",
  "target_type": "<kr | goal | objective | idea | task | routine | day_focus>",
  "target_id":   "<string — null for create_* types>",
  "button_label":"<derived from type + target>",
  "prose":       "<one-line summary shown above the card>",
  ...type-specific fields...
}
```

`type` and `target_type` are required for every suggestion. `target_id` is required for every
`modify_*`, `move_*`, `change_priority`, `archive_*` and `link_*` type, and **null** for `create_*`.

### 6.2 The ten types

| `type` | `target_type` | Required fields | Apply label |
|---|---|---|---|
| `modify_kr` | `kr` | `goal_id`, `target_id`, `new_text`; optionally `new_target`, `new_unit`, `new_direction` (numeric) or `new_done` (boolean) | `Apply → KR <position>` |
| `add_kr` | `goal` | `target_id`, `kr_text`, `kr_type`, `target_value`, `unit`, `direction` (numeric only) | `Apply → New KR` |
| `modify_objective` | `objective` | `target_id` (the goal), `new_objective` | `Apply → Objective` |
| `create_goal` | `goal` | `theme_id`, `objective`, `time_horizon`, `key_results[]`; optional `linked_idea_ids[]` | `Apply → New goal: <summary>` |
| `create_task` | `task` | `tag`, `title`, `description?`, `eisenhower_quadrant` (one of the three valid sections) | `Apply → New task on #<tag>` |
| `create_routine` | `routine` | `theme_id`, `name`, `recurrence`, `frequency`; optional `preferred_days[]` | `Apply → New routine "<name>"` |
| `modify_idea` | `idea` | `target_id` + at least one of `new_title`, `new_notes`, `new_theme_id`, `new_tag` | `Apply → Idea "<title>"` |
| `link_idea_to_goal` | `goal` | `target_id` (the goal), `idea_id` | `Apply → Link #<tag> to <goal>` |
| `move_task` | `task` | `target_id`, `new_column` (`backlog`/`to_do`/`in_progress`/`done`); `new_section` only when `new_column = backlog` | `Apply → Move "<title>" to <column>` |
| `change_priority` | `task` | `target_id`, `new_section` (one of three; the task must be in Backlog) | `Apply → "<title>" → <section>` |

### 6.3 Per-type semantics on record

- `modify_kr` on a boolean KR sets `new_done` instead of `new_target` / `new_unit`.
- `add_kr` inherits the goal's existing KR conventions where a field can be inferred.
- `create_goal` is the structural shape behind "promote idea to goal"; after Apply a cross-tab toast
  offers `[ Open Goals ]`.
- `create_task` lands the task in Backlog under the chosen quadrant; the toast offers `[ Open Execution ]`.
- `link_idea_to_goal` appends to `linked_idea_ids[]` and is **idempotent** — already linked means the
  Apply silently succeeds and the card resolves.

### 6.4 Deliberately absent, and why (business policy — Intent BR-72)

`create_idea` (ideation is human territory) · `set_focus_today` (daily focus is an explicit human
commitment) · every `archive_*` (archive is a conscious gesture) · `set_routine_active`
(pause/resume is the Planner's call) · bulk operations (out of scope for v1). The advisor may suggest
any of these **in prose, without a card**.

### 6.5 Evolution rule

New types ship as new `type` values with their required-field spec; E-09's unrecognized-type fallback
guarantees that an older client meeting a newer advisor degrades to prose instead of breaking. **This
is a versioning contract and belongs in the spec layer explicitly**, not only in a design note.

---

## 7. Suite-strength evidence owed (ADR-054 Part A)

At Specification exit, before this gate: a mutation + fuzz pass against the naive reference models of
§4.4, with **every survivor triaged** and the visible spec hardened accordingly. The mutation score,
the survivor dispositions and the fuzz findings become standing dossier evidence at this gate.

Nothing exists yet. The four reference models of §4.4 are what that pass will run against — which is
the practical argument for not skipping them.

---

## 8. Open questions — Contract tier

| # | Question | Blocks |
|---|---|---|
| QC-01 | **Batch-apply failure policy contradicts itself** — `arch §5 Pivot 3` says *abort on first failure, later suggestions not attempted*; `wf §7.5` says *the other cards still apply and the conflicting one stays pending*. One of them is the contract. | E-14, the Apply-all spec, the advisor panel |
| QC-02 | **Tag normalization has two definitions** — "non-alphanumeric **replaced by** `-`" (`funnel`) vs. "spaces replaced with hyphens, non-alphanumeric **stripped**" (`wf §3.2`). These produce different tags for the same input. | V-01, P-01, the reference model |
| QC-03 | **What is the fault taxonomy of the git seam?** Dirty tree, detached head, no write permission, disk full, a lock held by an external `git` process. Which are answers, which are retried, which are bugs? | the `VersionedDocumentAccess` protocol sheet |
| QC-04 | **Is the op-log queryable, and at what cost?** `arch §12 Q3` proposes answering "what completed today" from the journal. If so, the Access owns a query surface the registry does not describe. | the protocol sheet, Blueprint F-4 |
| QC-05 | **What is the advisor's streaming contract?** The UI renders cards incrementally and enables each card's Apply as it completes. That is a wire-level requirement on `AdvisorClientAccess`. | the `AdvisorClientAccess` protocol sheet, DV-02 |
| QC-06 | **Is there a telemetry sink at all?** Two failure paths say "log for telemetry" in a product with no operator and no backend. | E-09, E-10, QB-07 |
| QC-07 | **How is a `TaskCreationDraft`'s `{sessionId}` defined, given that drafts must survive app restarts?** | the registry, Blueprint F-10 |
| QC-08 | **Which shell technology?** See DV-06 — every shell-level statement in the sources is Go/Wails while the back end is stated as C#. | DV-06, the UI anchors, the window floor enforcement |

---

## 9. Standing review items this gate will carry

Per ADR-040's amendments, the Contract gate's agenda is not only the spec layer:

| Item | Status |
|---|---|
| The ADR-033 §7B spec layer | **NOT REACHED** |
| Suite-strength evidence (ADR-054 Part A) — mutation score, survivor dispositions, fuzz findings | **NOT REACHED** |
| One blessed Resource Protocol Sheet per ResourceAccess (ADR-059) — 2 expected | **OPEN** (absent) |
| `deployment_decisions` block with named reviewer and verbatim rulings (ADR-071) | **OPEN** (absent) |
| Q&A ledger deployment tier `DV:*` — fails **here** only | **OPEN** (7 entries owed, §2) |
| `construction-entry-check` [S5] | **NOT REACHED** |
| Gate-entry prediction sheet, diffed against what actually fired (#941) | **NOT REACHED** |

**After this gate, no human reads any project artifact until Acceptance.** Only the standing duties
remain — spec-hardening triage and process-change approvals. That is the reason the review items above
are not negotiable at this gate: there is no later opportunity.
