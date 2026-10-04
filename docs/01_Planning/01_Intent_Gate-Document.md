# Bearing v2 — Intent Gate Document

> **Gate.** `intent` — *Bless business design; the business intent is const* (ADR-040 §1, ADR-064).
> **Freezes.** BPMNs + System Interactions, screen models, the approved walkthroughs with their
> example data, the business map.
> **Reviewers.** Stakeholder + Software Architect (here the same person).
> **Status.** Pre-gate. Material captured, artifacts not yet authored. Nothing const.

**Provenance note (ADR-028).** Bearing v2 has had no recorded stakeholder sessions. The business
intent reaches the factory as four documents authored by the Software Architect, who is also the
product's domain expert and its only user. Every statement below traces to one of those documents by
section, cited inline as `funnel §…`, `arch §…`, `inv`, `wf §…`. Whether owner-authored documents
satisfy ADR-028's "every artifact element traces to a recorded stakeholder statement" is a **ruling
owed** — see QB-01.

---

## 1. Business framing

Bearing is a **personal planning tool**. It links durable intent to concrete daily action, so that the
path from *"what matters to me"* to *"what I'm doing right now"* is visible and navigable
(`funnel §Purpose`). Product line: *"Connect what matters to what gets done."* (`wf §7.1`, `wf §7.3`)

- **Single user, single machine, desktop only.** No phone, no sync, no multi-device. (`arch §1`)
- **v2 is a rewrite of v1** (`tmp/Bearing-v1`, Go + Wails + Svelte) with modifications. v1 is design
  provenance only — v2 is a separate codebase and does not link against it (`wf` guideline #18).
- **Language and UI framework are a portability concern, not an architectural volatility** — the
  business design is framework-agnostic. (`arch §1`)

### 1.1 Actors

| Actor | Kind | Notes |
|---|---|---|
| **Planner** | Human, the only human actor | Owns every entity; is simultaneously stakeholder, operator and beneficiary |
| **Advisor** | External system (black box) | LLM-backed assistant that reads the funnel graph and proposes structured suggestions. Never writes without an explicit `[ Apply ]`. Product undecided (`arch §12 Q9`) |
| **Clock** | Scheduler | Triggers the local-midnight day rollover (`funnel §Day rollover`). A clock-only trigger is drawn as a `scheduler pool` in BPMN (`bpmn-dsl` lint rule) |
| **Operating system** | External system | Supplies the data-folder location, locale, colour scheme and reduced-motion preference (`wf §7.2`) |
| **Version control (git)** | External system | The data folder is a git repository; every state change is a commit (`arch §2`, `wf §7.2`) |

### 1.2 The daily hot path — the primary flow (`arch §1`)

1. Set daily focus (Focus tab)
2. Execute tasks for the selected tags (Execution tab)
3. Capture / refine ideas opportunistically *during* execution
4. Check out the day at end-of-day
5. Review goals occasionally (out-of-band cadence)

Steps 1–4 are the per-day reality; everything else is colder. This ordering is the scope-and-priority
statement for the business design: the funnel's right-hand side is hot, its left-hand side is
settings-adjacent.

---

## 2. The funnel — the business design's spine

Five stages, each answering exactly one question at one time horizon and one volatility
(`funnel §Mental model`):

| Stage | Question | Horizon | Volatility |
|---|---|---|---|
| Theme | What matters to me in life? | years / decades | very low |
| Idea | What might I want to do? | months / years (or never) | high — many die |
| Goal (OKR) | What am I committing to? | quarter / year | medium |
| Daily focus | What gets attention today? | day / week | very high |
| Kanban | What's the next task? | hours / days | very high |

Rendered as five tabs, chevron-connected to carry the left-to-right flow
(`funnel §Tab structure`, `wf §1`):

```
[ Themes ] › [ Ideation ] › [ Goals ] › [ Focus ] › [ Execution ]
  values      candidates     OKRs       today       kanban
```

**Why five and not four** (`funnel §Why 5 tabs`): a four-tab variant leaks twice — goals without a
parent idea ("stay healthy") orphan, and routines have no home. Themes absorbs both and preserves
theme-colour propagation as a first-class linking mechanic.

### 2.1 Two graphs, deliberately kept apart (`funnel §Linking model`)

**Graph A — funnel order** (workflow / time of creation; "downstream" always means to the right):

```
Theme ──► Idea ──► Goal ──► Focus ──► Task
```

**Graph B — data references** (who holds a reference to whom):

```
Theme ◄──── Idea            (idea.theme_id, optional)
  ▲
  │ (goal.theme_id, required)
Goal ────► Idea             (goal.linked_idea_ids, 0..N)
             ▲
             │ (task.tag = idea.tag)
           Task
             ▲
             │ (task.created_from_routine_id, when spawned)
Theme ◄──── Routine         (routine.theme_id, required)
```

**Goal ↔ Task is indirect by design** (`funnel §Goal ↔ Task`). The chain is
`Task ──tag──► Idea ──linked_idea_ids──► Goal ──theme_id──► Theme`, and there is no direct
goal → task reference, because (a) an idea and its board outlive any single goal, (b) tasks completed
before a goal was framed are still real work, and (c) theme-only goals would otherwise need a
"no-task goal" subtype.

---

## 3. Business vocabulary — the entities

Business meaning and lifecycle only. The *storage* shape of each (document type, path, tier) is the
`VersionedDocumentAccess` secret and belongs to the Blueprint gate; the *field-level* reference lists
in `funnel §Entity reference fields` are carried forward there as DTO input.

| Entity | What it is, in the Planner's terms | Archivable? | Deletable? |
|---|---|---|---|
| **Theme** | An evergreen life area that is never "completed" (Health, Career, Relationships). Edited 2–4× per year. Groups goals and routines; owns the colour that propagates downstream. | ✗ | ✓ (cascade offered) |
| **Vision / Mission** | Optional reflective prose one rung *above* themes — "who you want to become", "what you're here to do". Feeds the advisor's higher-frame critique when set; omitted when unset. Nothing depends on it. | ✗ | n/a (reset by emptying) |
| **Idea** | A candidate for future realization. Most never become goals — that is the point. Owns a unique tag, which identifies its Kanban board. | ✓ | ✓ (cascade offered) |
| **Goal (OKR)** | A commitment: an objective with measurable key results, time-bound to a quarter or a year, anchored to exactly one theme, linked to 0..N ideas. | ✓ (via check-out) | ✓ (no cascade) |
| **Key Result** | A measurable result under a goal. Typed **numeric** (target + unit + direction ↑/↓) or **boolean** (done / not done). | — | via its goal |
| **KR check-in** | One dated progress data point on one KR, with an optional note. History is read-only and keyed to the KR's identity, never its display position. | — | — |
| **Routine** | An evergreen recurring activity that doesn't warrant a goal — maintenance, not achievement. Sits parallel to goals under a theme. Pausable via an Active toggle. | ✗ | ✓ (cascade offered) |
| **Day focus** | Per-day state: which tags and which routines get attention on one date. Not an entity with downstream ownership. | ✗ | — |
| **Task** | A unit of work on exactly one board, carrying an Eisenhower priority and a column. | ✓ | ✓ (no cascade) |
| **Board** | The Kanban surface of one tag. Identified by the tag string. | — | — |
| **Column** | A lane on a board, carrying a *role* (`Backlog` / `Todo` / `InProgress` / `Done`) separate from its user-editable name. | — | ✓ (cascade or reject) |
| **Day log** | The record of one checked-out day: notes plus the completed and in-progress task sets at the moment of check-out. Becomes immutable history after rollover. | — | — |
| **Goal check-out** | The closing record of one goal: overall outcome, per-KR statuses with notes, what-worked / what-didn't retro. Stays attached to the archived goal. | — | — |
| **Suggestion** | One structured, actionable advisor proposal with a lifecycle `pending → applied / dismissed / superseded`. Whether it persists is open (`arch §12 Q12`). | — | — |
| **Draft** | Unfinished input the Planner has not committed: staged tasks in the batch creation dialog, and day-log notes while typing. Survives dialog close and app restart. | — | — |

### 3.1 Tag — the load-bearing linking key

- An idea owns exactly **one** tag; the tag **is** the identity of its Kanban board (`funnel §Linking rules`).
- A task belongs to **exactly one** tag: an idea's tag, the reserved `routine`, or the reserved `untagged`.
- **Tag uniqueness is a load-bearing invariant.** Multiple ideas cannot share a tag. To combine work
  across ideas, consolidate the ideas or use the `All` board with filtering — *do not relax tag
  uniqueness.*

---

## 4. Business rules and invariants

The rules a stakeholder can confirm or refute. Each cites its source. These are the candidate contents
of the business-rules registry (ADR-043) that the behavioural spike and later the spec layer must
honour.

### 4.1 Structure and linking

| # | Rule | Source |
|---|---|---|
| BR-01 | Every **goal** has exactly one theme (required). | `funnel §Linking rules` |
| BR-02 | Every **routine** has exactly one theme (required). | `funnel §Linking rules` |
| BR-03 | An **idea** has zero or one theme (optional affiliation, for colour and grouping). Theme-less ideas are legitimate and get a permanent `Untagged` section on Ideation. | `funnel §2`, `wf §3.1` |
| BR-04 | A **goal** links 0..N ideas, typically 1. A **theme-only goal** (no linked idea) is legitimate; its progress is KR check-ins only, and the state is rendered explicitly as *"theme-only — no idea"*, never hidden. | `funnel §3`, `wf §4.1` |
| BR-05 | An idea's **tag is unique across all ideas, active and archived**. An archived idea still owns its tag. | `funnel §Linking rules`, `wf §3.2` |
| BR-06 | **Tag normalization:** lowercase; non-alphanumeric characters replaced by `-`; hyphens and underscores preserved. Applied on save. A *"Will be saved as:"* preview appears only when normalization changes the input. | `funnel §Linking rules`, `wf §3.2` |
| BR-07 | **Reserved tag strings** are rejected on an idea. `funnel.md` names only `routine`; `arch §8 UC3` sets the list to `{routine, untagged, all}`. **Final list owed — QB-02.** | `funnel §Linking rules`, `arch §8` |
| BR-08 | **Goals are flat.** No parent and no child goals. Decomposition uses sequential goals on the same idea (distinguished by time horizon) or tasks on the Kanban. | `funnel §3` |
| BR-09 | **Colour propagates** from theme through every downstream layer of Graph A — goals, routines, ideas, focus chips, board chips, task priority chips. Colour is never the only signal; it always pairs with a name or label. | `funnel §Linking rules`, `wf` guideline #1 |
| BR-10 | **One canonical home per entity.** Parent tabs do not embed children; children carry upstream context (a theme chip or colour). **Routines are the single deliberate exception** — the Themes tab embeds them because they have no other home. | `funnel §1`, `wf §2.1` |
| BR-11 | **Funnel lineage appears inline, never as a global breadcrumb bar** — on the Execution board header (`● Career › Goal: Ship Bearing v2 › #bearing-v2`), on Focus summary chips, and in child-entity dialog titles. The board header is display-only, not navigation. | `funnel §UX principles`, `wf §1`, `wf §6.1` |

### 4.2 Deletion and cascade

| # | Rule | Source |
|---|---|---|
| BR-12 | **Cascade follows downstream ownership in Graph A** — an entity offers a cascade only where deletion would otherwise orphan data it directly owns. | `funnel §Deletion cascade rule` |
| BR-13 | **Theme** → cascade offered for its goals, routines, and the tasks on their boards. Deleting a theme always clears `theme_id` on its ideas. | `funnel`, `wf §2.4` |
| BR-14 | **Idea** → cascade offered for its board and all its tasks. Always removes the idea and its tag and clears the link from any goal; linked goals survive, minus the link. | `funnel`, `wf §2.4` |
| BR-15 | **Goal** → **no cascade, by design.** It owns only its KRs and check-in history (which go automatically). Linked ideas, their boards and their tasks belong to the upstream idea. The consequence is stated inline so the user does not wonder whether a checkbox is missing. | `funnel`, `wf §2.4` |
| BR-16 | **Routine** → cascade offered for already-spawned tasks on the Routines board. Without cascade, future occurrences simply stop spawning. | `funnel`, `wf §2.4` |
| BR-17 | **Task** → owns nothing, no cascade. | `funnel`, `wf §2.4` |
| BR-18 | **Column** → the one case where declining the cascade **rejects** rather than detaches: `task.column` is required, so a non-cascading delete of a non-empty column has no safe fallback. Empty columns delete cleanly. | `funnel`, `wf §2.4`, `arch §9` |
| BR-19 | **Cascade is off by default** in every dialog, and there is **no configuration layer** for cascade defaults — the dialog is the only gathering surface. | `wf §2.4`, `arch §9` |
| BR-20 | **There is no in-app undo.** The consequence statement says so and names the data folder, which is under version control. | `wf §2.4` |
| BR-21 | Non-cascading deletion of a theme / idea / routine **detaches** (clears `theme_id`, frees the tag to the `untagged` board). ⚠ This contradicts BR-01/BR-02 for goals and routines, whose `theme_id` is required — **QB-03**. | `arch §9`, `funnel` |

### 4.3 Archive and check-out

| # | Rule | Source |
|---|---|---|
| BR-22 | **Archive is always a conscious manual gesture. There is no auto-archive in v1** — goals do not archive when their horizon passes; tasks do not archive after N days in Done. | `funnel §Archive`, `wf §7.8` |
| BR-23 | **Archivable:** Idea (directly, via the Idea editor — low-stakes parking), Goal (via Goal check-out), Task (via Day check-out, or a per-task action). **Not archivable:** Theme, Routine (pause instead), day focus. | `funnel §Archive`, `wf §7.8` |
| BR-24 | **Archive does not cascade.** Archiving an idea does not archive its tasks; archiving a goal does not archive its linked ideas. | `wf §7.8` |
| BR-25 | **Unarchive returns the item to its source state**, at the position it would have occupied (manual order if present, recency otherwise). | `wf §7.8` |
| BR-26 | Archived items stay on disk and are reachable through a tab-level `[ Show archived <type>… ]` that **replaces the tab content**, with `[ ← Back to active <type> ]` to return. Not a modal. | `funnel §Archive`, `wf §7.8` |
| BR-27 | **Goal check-out** captures: overall outcome (Achieved / Partially achieved / Missed / Abandoned — required), per-KR status with optional note, what-worked / what-didn't retro, and closing actions. Available at any time, not gated on the horizon passing. | `funnel §Archive`, `wf §4.4` |
| BR-28 | **Per-KR status auto-infer is type-aware.** Numeric: `≥100% → ✓ Hit`, `50–99% → ⚠ Partial`, `<50% → ✗ Missed`. Boolean: `Done → ✓ Hit`, `Not done → ✗ Missed` — **boolean never auto-emits Partial**, because the type has no intermediate state. | `inv`, `wf §4.4` |
| BR-29 | The Planner may **override any auto-inferred label**, including labelling a boolean KR `⚠ Partial`. The rule constrains auto-infer, never the final human judgment. | `wf §4.4` |
| BR-30 | Goal check-out closing actions: **"Archive this goal" defaults ON**; **"Create a follow-up goal" defaults OFF**. | `funnel §Archive`, `wf §4.4` |
| BR-31 | **Carry-forward** seeds a follow-up goal pre-filled with: theme inherited; linked ideas inherited verbatim; horizon = next period (Q2 → Q3); objective copied with a `"Continue: "` prefix (editable); **only the ⚠ Partial and ✗ Missed KRs**, with numeric progress reset to 0 and booleans reset to Not done; KR check-out notes dropped; and a back-reference to the originating `GoalCheckout`. The Planner reviews and saves — cancelling the carry-forward still completes the check-out. | `funnel §Archive`, `wf §4.4` |
| BR-32 | **Goal check-out is a single deliberate sitting** — Cancel discards all partial input. | `wf §4.4` |
| BR-33 | **Day check-out** captures: auto-detected completed and still-in-progress task lists (read-only), optional Markdown day notes, and opt-in closing actions. Reachable from Execution *and* from the Focus Day-mode summary bar — same dialog. | `funnel §Archive`, `wf §6.4` |
| BR-34 | Day check-out closing actions: **"Archive the N completed tasks" defaults ON**; **"Reset N in-progress tasks to Backlog" defaults OFF**. | `funnel §Archive`, `wf §6.4` |
| BR-35 | **"In progress" for check-out purposes** = any task in a `To do` or `In progress` column on any board active today. Done is handled by the archive action; **Backlog is never touched** (never started, nothing to reset). Reset returns the task to the bottom of its previously-set Eisenhower section. | `wf §6.4` |
| BR-36 | **Day check-out is idempotent per date** — re-running updates the existing day log ("checked out at 5 pm, worked more, ran it again at 9 pm"). | `funnel §Archive`, `wf §6.4` |
| BR-37 | **Day notes auto-save while typing.** Cancelling the dialog preserves the notes but applies none of the bulk closing actions. (Deliberately unlike Goal check-out — BR-32.) | `wf §6.4` |
| BR-38 | The day log surfaces in the Focus Week / Month / Year overviews as detail on the day cell. | `wf §6.4` |
| BR-39 | **The check-out pattern is reusable and fixed:** auto-detected state (read-only) → optional reflection → per-item judgment → opt-in closing actions (archive ON, others OFF) → two-button footer with the gesture named. Future check-out flows copy this shape. | `wf §7.11` |

### 4.4 Focus and the day

| # | Rule | Source |
|---|---|---|
| BR-40 | **Focus is always selected per day** — the day is the unit of intent. Week / Month / Year are **read-only aggregations**; only Day mode writes. Clicking any day in an overview drills into Day mode for that date. | `funnel §4`, `wf §5.1` |
| BR-41 | Two parallel selectables, both theme-coloured and grouped under their theme header: **tags** (activate the tag's board for the day) and **routines** (spawn tasks on the Routines board). | `funnel §4`, `wf §5.1.a` |
| BR-42 | **Selecting a routine spawns a task on the Routines board.** Spawning is **eager, idempotent and additive-only** — spawning twice for the same date is a no-op, and *deselecting a routine never deletes an already-spawned task*. | `funnel §4`, `arch §9` |
| BR-43 | Only non-archived ideas and **active** (non-paused) routines are selectable. | `arch §8 UC1` |
| BR-44 | **The day rolls at local midnight. There is no configuration for it** (no Settings view). On rollover: Day mode advances; the new day's selected routines spawn their tasks per recurrence and preferred-day rules; the previous day's log becomes immutable history; the `[ Today ]` jump and all relative-time chips re-evaluate. | `funnel §Day rollover`, `wf §7.2` |
| BR-45 | Every period view carries **three labels**: absolute title, relative chip in parentheses (`(Today)`, `(in 2 days)`, `(3 weeks ago)`), and a jump-back button matching the mode. Today is always marked. | `wf §5.1` |
| BR-46 | A **coverage strip** at the bottom of each overview summarizes theme balance for the visible period. This is the only analytics surface in the product. | `funnel §4`, `wf §5.1` |
| BR-47 | **Default landing tab is Focus** (`funnel`) — the funnel's left side is settings-adjacent; you live on the right. ⚠ `funnel §UX principles` says "Focus (or Execution)"; `wf §7.1` says onboarding lands on Focus. **Single value owed — QB-04.** | `funnel §UX principles`, `wf §7.1` |

### 4.5 Execution and prioritization

| # | Rule | Source |
|---|---|---|
| BR-48 | **The Boards strip has exactly two kinds of board:** the always-present synthetic **`All`** aggregate, and **per-tag boards**. `routine` and `untagged` are *reserved tag strings* that appear as per-tag boards under the same rule as any other tag — there are no special-case board types. | `funnel §5`, `wf §6.1` |
| BR-49 | **One visibility rule for every board: "show the board for a tag when there's something to show."** A tag board appears when the tag is selected in today's focus (or has tasks); `routine` appears when a routine is selected today **or** routine-tagged tasks are still in flight from earlier days; `untagged` appears when at least one orphan task exists. | `funnel §5`, `wf §6.1` |
| BR-50 | **Default landing board is `All`** — unless today has a focus selection, in which case the most-recently-active tag board for that day opens instead. | `funnel §5`, `wf §6.1` |
| BR-51 | **Eisenhower priority lives in the Backlog column, not in "To do"** — triage happens at intake. Columns after Backlog are flat. | `funnel §5`, `wf §6.1` |
| BR-52 | **Exactly three Backlog sections**, ordered urgency-first: Important & Urgent · Not Important & Urgent · Important & Not Urgent. **"Not Important & Not Urgent" is intentionally absent** as a forcing function for honest triage — if a task is neither, it should not be on the board. | `funnel §5`, `wf §6.1` |
| BR-53 | **Priority is metadata that travels with the task** outside Backlog (surfaced as a `◆` chip) and **re-applies when the task returns to Backlog**. `Move to → Backlog` is therefore the "send back for re-triage" action. | `funnel §5`, `wf §6.1` |
| BR-54 | **New tasks always land in Backlog**, in the section their `[ Prioritize to ⬇ ]` button targeted, appended at the bottom. | `wf §6.1`, `wf §6.2` |
| BR-55 | Priority is changeable **only while the task is in Backlog** — the task context menu hides section moves and priority changes elsewhere, because sections exist only in Backlog and the triage decision has already been made. | `wf §6.1` |
| BR-56 | **Empty Backlog sections never disappear** — they render folded with a `(0)` count, so the model stays legible. | `wf §6.1`, `wf §7.6` |
| BR-57 | **Column roles are `{Backlog, Todo, InProgress, Done}`** — four roles, no neutral escape hatch; every column commits to a workflow semantic. Role is **separate from name** (renaming "In progress" to "Doing" preserves the role; day check-out and the advisor key off role). | `arch §10` |
| BR-58 | **Multiple columns may share a role, except Backlog: at most one Backlog column per board** (the three Eisenhower sections are not meaningfully splittable). Sectioning is implicit from `role == Backlog`. | `arch §10` |
| BR-59 | **Role is mutable, with stated consequences:** InProgress → Done makes its tasks count as done; Done → InProgress retroactively unwinds completions; Backlog → anything collapses the sections while tasks retain priority as metadata. | `arch §10` |
| BR-60 | **Routine-tagged tasks are kept indefinitely** in their last-known column; no auto-archive. The `routine` chip hides on days when the board is empty and nothing is in flight, and reappears when a routine is next due. Same rule for `untagged`. | `wf §6.1` |
| BR-61 | **`routine` and `untagged` are not selectable** when creating a task. Routine tasks arise only from focus selection; untagged tasks only from idea-deletion-without-cascade. | `wf §6.2` |
| BR-62 | **Task capture is a batch session.** N tasks are staged across the three sections, then committed together. **Drafts persist across dialog close and across app restarts**, so `[ Close ]` is non-destructive; `[ Clear All ]` is the only discard. The tag is kept between stagings; the title and description clear. | `wf §6.2` |
| BR-63 | A **task's content** (title, description, tag) is edited in a dialog; its **position** (priority, column) is only ever set by direct manipulation on the board. Editing a task's tag moves it to that tag's board, preserving the column where possible. | `wf §6.3` |
| BR-64 | **No tag can be created from the task-creation picker.** Tags are owned by ideas: create the idea first. With zero ideas the picker reads *"No tags yet — create an idea first"*. | `wf §6.2` |

### 4.6 The advisor

| # | Rule | Source |
|---|---|---|
| BR-65 | **One singleton advisor panel**, reachable from every view header (`[ ✦ Advisor ]`) and by shortcut. It renders as a **right-side split panel**, not a modal — the underlying view stays interactive. State persists across tab switches; the conversation persists per session and is cleared explicitly. | `inv`, `wf §7.5` |
| BR-66 | The advisor **observes the whole funnel graph** — themes, ideas, goals, routines, focus history, tasks, KR check-ins — plus Vision and Mission when set. Per-tab specialization is prompting and default selections only, never separate advisors. | `wf §7.5` |
| BR-67 | **Suggestions are structured objects, never parsed prose.** The UI renders one card per actionable item and derives the `[ Apply → … ]` label from the structured target. | `wf §7.5` |
| BR-68 | **`[ Apply ]` always writes directly. One rule, no exceptions.** Consequently **every creation suggestion must carry all required fields** — the advisor may not propose half-finished entities, and asks in conversation instead when it lacks information. | `wf §7.5` |
| BR-69 | **At most one pending card per target at any time.** A revised suggestion for the same target auto-supersedes the older card (`↻ Superseded`), so the Planner never chooses between two competing Apply buttons. Already-applied or already-dismissed cards are closed states and unaffected. | `wf §7.5` |
| BR-70 | **`[ Apply all ]` / `[ Dismiss all ]` scope to the still-pending cards of one response**, in order; resolved cards are skipped. | `wf §7.5` |
| BR-71 | Applying the advisor's suggestion is **identical to the Planner clicking the same control** — there is no parallel write path. | `arch §5 Pivot 3` |
| BR-72 | **The advisor may not act in these areas, by policy** — it may only speak: creating ideas (ideation is human territory), setting the daily focus (an explicit human commitment), archiving anything, and pausing/resuming routines. Bulk operations are out of scope for v1. | `wf §7.5` |
| BR-73 | **Cross-tab applies never force navigation** — they commit silently and raise a small toast offering the jump. | `wf §7.5` |
| BR-74 | The advisor's **catalog may grow**; an unrecognized type degrades to plain prose rather than breaking the client. (Schema and fallbacks → Contract gate.) | `wf §7.5` |

### 4.7 First run, storage and settings

| # | Rule | Source |
|---|---|---|
| BR-75 | **Bearing has no user-facing settings.** No Settings view, no settings icon, no settings dialog. A personal planning tool with cross-cutting themes (health, sleep) maps to *one* workspace, not several. | `funnel`, `arch §11`, `wf §7.2` |
| BR-76 | The **data folder is the OS-conventional application-data directory** (macOS `~/Library/Application Support/Bearing/`, Linux `~/.config/bearing/`, Windows `%APPDATA%\Bearing\`), **initialized as a git repository on first run**. Relocation is a filesystem-level directory link, performed outside the app. | `arch §11`, `wf §7.2` |
| BR-77 | **Locale, colour scheme and reduced-motion are auto-detected from the OS** with no in-app override. Landing tab, day rollover and "auto-promote-priority" have hardcoded defaults. (The last of these is named but never defined — **QB-05**.) | `wf §7.2` |
| BR-78 | **No backup/restore UI.** Backup is git (`git push`, or copy the folder). Import/export between tools is out of scope. | `wf §7.2` |
| BR-79 | **Bootstrapping:** resolve the OS path → if present and a git repo, load → if present and not a repo, `git init` in place → if missing or a broken symlink, create (or replace) and `git init`, then show the **new-data-folder notification before any app content**. | `wf §7.2` |
| BR-80 | **The Planner is the disambiguator between first run and data loss.** Bearing deliberately does not try to detect the difference. The notification offers `[ Quit ]` (restore a backup at that path, then relaunch) and `[ Continue ]` (proceed to onboarding). There is no in-app "restore from backup", no folder picker, and no "use a different folder". | `inv`, `wf §7.7` |
| BR-81 | **First-run onboarding pre-seeds 3–5 themes** (Work, Health, Learning, Relationships, Personal), editable inline, so Themes is never empty or intimidating. Step 2 offers Vision & Mission and is **genuinely optional**. **Skip is offered at both steps**; the app functions identically either way. | `funnel §UX principles`, `wf §7.1` |
| BR-82 | Themes is the only surface whose empty state offers a **`[ Pre-seed defaults ]`** recovery, because themes are the funnel's root. Ideation has nothing reasonable to pre-seed. | `wf §7.6` |
| BR-83 | **`[ + Goal ]` with no themes is intercepted** — *"Add a theme first — every goal lives under one"* — keeping BR-01 honest. | `wf §7.6` |

### 4.8 Scope decisions that are business decisions

| # | Decision | Source |
|---|---|---|
| BR-84 | **No multi-select and no bulk operations in v1.** Every list action operates on one entity. The only deliberate "bulk" surface is the advisor's response-level Apply all, which scopes to that response's cards. | `inv`, `wf §7.11` |
| BR-85 | **No labels on ideas.** The theme is the single organizational concept; cross-theme grouping is served by text search and by asking the advisor ("find related"). | `inv`, `wf §3.1` |
| BR-86 | **No filters on Goals in v1** — theme grouping does the work. If filtering is ever needed, add one `Current ▾ / All` scope toggle; do not reintroduce dual axes. | `wf §4.1` |
| BR-87 | **One sort per tab, persisted across sessions. Manual is the canonical order; every other sort is a read-only view** and disables drag-reorder with an inline hint. The archive view keeps its own sort, defaulted to archived-date descending. ⚠ "Stored alongside other tab-level preferences" has no home given BR-75 — **QB-06.** | `wf §3.1`, `wf` guideline #16 |
| BR-88 | **Out of scope for routines in v1:** skip-on-holiday rules, streak goals, reminders and notifications. | `funnel §Routines` |
| BR-89 | **Same dialog handles create and edit** for every entity, with the title and primary-button label swapping contextually. | `inv`, `wf` guideline #7 |

---

## 5. Proposed business-process landscape

⚠ **Proposal, not an authored artifact.** BPMNs are authored in Discovery from the stakeholder's own
statements. The list below is the landscape the four source documents imply; the Software Architect
decides the cut before any `.bpd` is written. ADR-040's own calibration warning applies — a first
landscape that produces one BP with 21 gateways is an order of magnitude past calibration, so the
granularity below is deliberately fine rather than coarse.

| # | Candidate business process | Trigger | Funnel stage | Hot path? | Sources |
|---|---|---|---|---|---|
| 1 | **Start Bearing for the first time** — bootstrap the data folder, disambiguate first-run from data loss, pre-seed themes, optionally state vision and mission | App launch with no usable data folder | — | — | `wf §7.1`, `wf §7.2`, `wf §7.7` |
| 2 | **Maintain life themes** — add, rename, recolour, reorder, delete a theme; edit vision and mission | Planner, 2–4× per year | Theme | — | `funnel §1`, `wf §2.1`, `wf §2.2`, `wf §2.5` |
| 3 | **Maintain routines** — define, pause, resume, reorder, delete a routine under a theme | Planner, rare | Theme | — | `funnel §Routines`, `wf §2.3` |
| 4 | **Capture and curate ideas** — capture an idea with its unique tag, write and refine its notes, re-affiliate it to a theme, filter/sort/search, archive or delete it | Planner, opportunistic — *including during execution* | Idea | ✓ (step 3) | `funnel §2`, `wf §3.1`, `wf §3.2` |
| 5 | **Commit to a goal** — promote an idea to a goal, or create a theme-only goal; define objective, horizon, linked ideas and typed key results | Planner, at the start of a cycle | Goal | — | `funnel §3`, `wf §4.1`, `wf §4.2` |
| 6 | **Track goal progress** — check in on one key result, numeric or boolean, with a note; read its history | Planner, periodic out-of-band cadence | Goal | — | `wf §4.3` |
| 7 | **Close out a goal** — rate the outcome, judge each key result, write the retro, archive, optionally carry forward | Planner, end of cycle | Goal | — | `funnel §Archive`, `wf §4.4` |
| 8 | **Set the daily focus** — pick today's tags and routines; routine selection spawns tasks | Planner, every morning | Focus | ✓ (step 1) | `funnel §4`, `wf §5.1.a`, `arch §8 S1` |
| 9 | **Review focus history** — read the week, month or year overview with its coverage strip; drill into any day | Planner, occasional | Focus | — | `funnel §4`, `wf §5.1.b–d` |
| 10 | **Capture tasks** — stage a batch of tasks across the three Eisenhower sections and commit them to Backlog | Planner, at intake | Task | ✓ | `wf §6.2` |
| 11 | **Work the board** — move, rank and re-prioritize tasks; edit task content; delete a task | Planner, continuously | Task | ✓ (step 2) | `wf §6.1`, `wf §6.3`, `arch §8 UC2` |
| 12 | **Manage board columns** — rename, insert before/after, reorder, change role, archive all, delete with or without cascade | Planner, rare | Task | — | `wf §6.1`, `arch §8 DeleteColumn`, `arch §10` |
| 13 | **Close out the day** — confirm what completed and what is still open, write day notes, archive completed tasks, optionally reset in-progress ones | Planner, end of day | Focus / Task | ✓ (step 4) | `funnel §Archive`, `wf §6.4` |
| 14 | **Roll the day over** — at local midnight, advance the active day and spawn the new day's routine tasks | Clock (`scheduler pool`) | Focus | ✓ | `funnel §Day rollover`, `arch §12 Q1` |
| 15 | **Review archived material** — browse, filter and unarchive archived ideas, goals or tasks | Planner, occasional | all | — | `wf §7.8` |
| 16 | **Consult the advisor** — ask a question in the context of the active view and selection, read the structured suggestions, apply or dismiss them individually or per response | Planner, opportunistic | all | — | `wf §7.5` |

**Economic framing (the business map) is OWED** — see §10.

---

## 6. Candidate System Interactions

**No ids are assigned here.** SI ids are **minted once at Mockup and never renamed** (ADR-066,
`design-artifact-conventions`), and there is no provisional id form. The list below names the system
interactions the screens imply, so the Mockup stage can mint against a known inventory. Every screen
action is an SI; every call from a business-process pool into the System pool is an SI.

Grouped by the candidate BP that owns them:

**BP "Start Bearing for the first time"** — Resolve the data folder · Initialize the repository ·
Report that a new data folder was created · Pre-seed the default themes · Record vision and mission ·
Complete onboarding

**BP "Maintain life themes"** — Create a theme · Rename/recolour a theme · Reorder themes ·
Delete a theme (with and without cascade) · Read the themes overview with its goal and routine counts ·
Record vision and mission · Read vision and mission

**BP "Maintain routines"** — Define a routine · Amend a routine · Pause a routine · Resume a routine ·
Reorder routines within a theme · Delete a routine (with and without cascade)

**BP "Capture and curate ideas"** — Capture an idea · Validate a proposed tag · Amend an idea ·
Refine idea notes (auto-save) · Reorder ideas within a theme · Re-affiliate an idea to a theme ·
Archive an idea · Unarchive an idea · Delete an idea (with and without cascade) ·
Read the ideation overview (filtered, sorted, theme-scoped) · Read the archived-ideas overview

**BP "Commit to a goal"** — Frame a goal · Promote an idea to a goal · Amend a goal ·
Link an idea to a goal · Unlink an idea from a goal · Add a key result · Amend a key result ·
Remove a key result · Reorder key results · Reorder goals within a theme ·
Read the goals overview · Delete a goal

**BP "Track goal progress"** — Record a numeric key-result check-in · Record a boolean key-result
check-in · Read a key result's check-in history

**BP "Close out a goal"** — Read a goal's check-out proposal (auto-inferred per-KR labels) ·
Close out a goal · Seed a follow-up goal from a check-out · Read the archived-goals overview ·
Unarchive a goal

**BP "Set the daily focus"** — Read the day's selectables grouped by theme · Set the daily focus ·
Schedule the day's routine tasks · Read the day's focus summary

**BP "Review focus history"** — Read the week overview · Read the month overview · Read the year
overview · Read a period's theme coverage

**BP "Capture tasks"** — Read the selectable tags · Stage a task draft · Amend a staged task draft ·
Reorder staged task drafts · Discard a staged task draft · Discard all staged task drafts ·
Commit the staged tasks

**BP "Work the board"** — Read the boards strip · Read a board with its funnel context · Rank a task ·
Prioritize a task · Move a task · Amend a task's content · Archive a task · Unarchive a task ·
Delete a task · Read the archived-tasks overview

**BP "Manage board columns"** — Rename a column · Insert a column · Reorder columns ·
Change a column's role · Archive every task in a column · Delete a column (with and without cascade)

**BP "Close out the day"** — Read the day's completed and in-progress tasks · Save the day-notes
draft · Close out the day

**BP "Roll the day over"** — Roll the day over

**BP "Consult the advisor"** — Open an advisor conversation with its context and selection ·
Ask the advisor · Apply a suggestion (ten catalog types) · Dismiss a suggestion · Clear the
conversation

> Count: roughly **80 candidate system interactions** across 16 candidate business processes. That
> number is itself a scope signal worth the Software Architect's attention before Mockup opens.

---

## 7. Screen model inventory

The surfaces that become the screen models in `docs/02_Business/06_Screen-Models/`. Every one has an
ASCII wireframe and design notes in the source; the inventory is complete at view/dialog level, and
drill-down into individual fields and component states was explicitly out of scope for the sketch
(`inv` preamble) **except** where a field is structural (the Tag field's four states, the two KR
check-in variants).

| Surface | Kind | Wireframe | Documented states |
|---|---|---|---|
| App shell (tab bar, content area, help entry) | shell | `§1` | active tab |
| Themes view | view | `§2.1` | populated · zero themes (`§7.6`) |
| Vision & Mission header | inline section | `§2.1` | collapsed-set · expanded-set · never-set |
| Theme editor | dialog | `§2.2` | create · edit |
| Routine editor | dialog | `§2.3` | create · edit · paused |
| Delete confirmation (shared by 6 entities) | dialog | `§2.4` | with cascade option · without · column-reject |
| Vision & Mission editor | dialog | `§2.5` | — |
| Ideation view | view | `§3.1` | populated · collapsed/expanded card · zero ideas (`§7.6`) · archived view (`§7.8`) |
| Idea editor | dialog | `§3.2` | Tag field: Normal · Normalization preview · Collision · Reserved |
| Goals view | view | `§4.1` | populated · zero goals (`§7.6`) · archived view (`§7.8`) |
| Goal editor | dialog | `§4.2` | create · edit · carry-forward pre-fill · promote-from-idea pre-fill |
| KR check-in | dialog | `§4.3` | numeric variant · boolean variant |
| Goal check-out | dialog | `§4.4` | — |
| Focus view — Day | view | `§5.1.a` | today · past day · future day · nothing to focus on (`§7.6`) |
| Focus view — Week | view | `§5.1.b` | populated · no history (`§7.6`) |
| Focus view — Month | view | `§5.1.c` | populated · no history |
| Focus view — Year | view | `§5.1.d` | populated · no history |
| Execution view | view | `§6.1` | populated · collapsed column · empty board · no tasks anywhere (`§7.6`) |
| Column overflow menu | menu | `§6.1` | — |
| Task context menu | menu | `§6.1` | Backlog variant · in-motion variant |
| Task creation (batch) | dialog | `§6.2` | staged · empty · tag picker open/filtered/no-tags |
| Task editor | dialog | `§6.3` | in Backlog · in motion |
| Day check-out | dialog | `§6.4` | — |
| First-run onboarding | view | `§7.1` | step 1 themes · step 2 vision & mission |
| About | dialog | `§7.3` | — |
| Keyboard shortcuts | dialog | `§7.4` | — |
| Advisor panel | split panel | `§7.5` | thinking · streaming · pending card · applied · dismissed · superseded · apply-failed · network error |
| Archive views (Ideation / Goals / Execution) | view | `§7.8` | per type, with filters |
| New-data-folder notification | modal | `§7.7` | — |
| Toasts | overlay | `§7.7` | success · error-with-retry · stacked (max 3) |
| Skeleton loaders | overlay | `§7.7` | — |

**There is no Settings view** (BR-75) — recorded here so its absence is a reviewed decision, not an
omission.

---

## 8. Operational concerns (Discovery side-channel)

ADR-040 §2 wants these captured as they come up plus one structured pass before the Intent gate. The
pass below is that structured pass, assembled from the sources. Each row that constrains a technology
choice is carried forward to the Contract gate's deployment decisions (ADR-071).

| Concern | Statement | Source |
|---|---|---|
| Users | Exactly one. No accounts, no authentication, no authorization, no sharing. | `arch §1` |
| Deployment | One desktop machine. No server, no cloud, no sync, no multi-device, no phone. | `arch §1` |
| Platforms | macOS, Linux, Windows — each with its own data-folder convention. | `wf §7.2` |
| Load | Personal scale: ~10–20 active goals; a few hundred ideas; tasks over years of use. Explicitly used to justify rejecting multi-select and OKR nesting. | `funnel §3`, `wf §7.11` |
| Storage | Versioned file store in the OS application-data folder, git-initialized on first run. Every state change is a commit. | `arch §2`, `wf §7.2` |
| Audit | Two layers, both load-bearing: git (*what changed*) and an operation log (*which operation, by whom, with what arguments*). Neither alone suffices. | `arch §2` |
| Durability | Drafts survive crashes; recovery after accidental data loss is a filesystem operation the Planner performs, not an app feature. | `arch §4`, `wf §7.7` |
| Integrations | Exactly one external dependency: the advisor service. Everything else is local. | `arch §4` |
| Offline tolerance | The app must work fully offline; only the advisor degrades (with a documented inline error and retry). | `wf §7.7` |
| Window | Hard floor 1024 × 640 px, enforced by the shell. Comfortable ~1280 × 720; ~1600 × 720 with the advisor open. | `wf §7.9` |
| Form factors | Desktop only. No mobile layout, no tablet target, no vertical reflow. Touch input is supported through 44×44 hit targets but not optimized for. | `wf §7.9` |
| Accessibility | Colour is never the only signal; every focusable element has a visible keyboard focus ring; the full keyboard map is first-class; `prefers-reduced-motion` is honoured. | `wf` guidelines #1, #12, #14 |
| Latency budget | The UI is optimistic and push-fed, so local mutations must feel instant; the advisor is the only surface allowed to show "thinking". | `arch §5` |
| Cost | Advisor token cost is the only running cost. No envelope stated — **owed at Contract**. | — |
| Operator | The Planner. No administrator, no ops role, no telemetry backend (the sources mention "log for telemetry" twice — **QB-07**). | `wf §7.5` |

---

## 9. Candidate example data (walkthrough seed)

The wireframes carry one coherent dataset throughout. It is **candidate data, not finished
expectations** (ADR-040 §2) — but it is consistent across 2200 lines and is the natural seed for the
behavioural spike, the Mockup walkthroughs, and later the spec layer's labeled seed rows (ADR-033).

- **Reference date:** Monday, 11 May 2026.
- **Themes:** Health · Career · Learning · Relationships · Personal (the pre-seeded set, with Work
  appearing as the onboarding name for Career — **QB-08**).
- **Vision:** *"A focused, generous engineer who ships things he's proud of, while staying healthy and
  present with the people he loves."* **Mission:** *"Build durable tools and the discipline to use them daily."*
- **Ideas:** `#bearing-v2` "Build Bearing v2" (Career, → goal) · `#tauri` "Migrate to Tauri" (Career,
  unlinked) · `#10k` "Run a 10k" (Health, → goal) · `#cold` "Try cold plunges" (Health) ·
  `#korean` "Learn Korean (A2)" (Learning) · `#pottery` "Take pottery classes" ·
  `#kitchen` "Renovate kitchen" (untagged). Counts quoted: 47 ideas total, 12 goal-linked, 35 unlinked,
  18 untagged.
- **Goals:** "Run a 10k by Jun 2026" (Health, Q2 2026, linked `#10k`) with KR1 *Run 5k under 28 min*
  (numeric, target 28 min, ↓, 73%), KR2 *Complete 12-week training plan* (numeric, target 12 weeks, ↑,
  50% → 73% at check-out), KR3 *Average 25 km/week running* (numeric, 100% ✓), KR4 *Sub-60-min 10k race
  day* (boolean, Not done) · "Reduce body fat to 15%" (Health, Q2 2026, theme-only) ·
  "Ship Bearing v2 by Q3 2026" (Career, Q3 2026, linked `#bearing-v2`).
- **KR check-in history:** Apr 16 → 2/12 (17%) · Apr 30 → 4/12 (33%, *"First long run done"*) ·
  May → 6/12 (50%, *"Halfway through. Pace is steady; long runs feel easier."*). Boolean: May 28 Not
  done → Jun 14 ✓ Done, *"Finished at 58:42 — sub-60 hit on race day."*
- **Routines:** Gym (Health, 3×/week, M·W·F) · Meditation (Health, daily) ·
  Sleep before 23:00 (Health, daily, **paused**) · Anki review (Learning, daily).
- **Focus for May 11:** tags `bearing-v2`; routines Gym, Meditation. Week coverage Career 3/7,
  Health 4/7, Learning 1/7, none 1/7.
- **Tasks on `#bearing-v2`:** Backlog — *Spec funnel*, *Migration plan* (Imp & Urgent);
  *Triage stale issues* (Not Imp & Urgent); two more in Imp & Not Urgent. To do — *Wireframes doc*,
  *Color tokens*, *Logo work*, *Onboarding flow*. In progress — *Themes view*. Done — *IA sketch*.
- **Day check-out for May 11:** completed *Wireframes doc*, *Gym*, *Color tokens*; in progress
  *Themes view (impl)*; notes *"Wireframes took longer than expected. Themes view started but blocked
  on the color picker decision."*
- **Goal check-out:** outcome *Partially achieved*; KR1 ✓ Hit *"Hit 27:30 in week 10"*;
  KR2 ⚠ Partial *"Missed two weeks in March due to flu"*; KR3 ✓ Hit; KR4 ✗ Missed *"Rainy race day,
  finished at 62 min. Try again Q4."*; worked *"Consistent weekly runs. Early-morning long runs
  helped."*; didn't *"Race-day pacing strategy needed adjustment for weather."*
- **Advisor exchange:** *"Are these KRs well-formed?"* → four suggestions (`modify_kr` on KR2,
  `modify_objective`, `add_kr` KR5, plus prose), with supersession of the KR2 card by
  *"Run 250 km across the 12-week plan."*
- **Archived examples:** "Q1 2024 cleanup" ✓ Achieved, archived 2024-04-02 · "Migrate to Tauri"
  ⚠ Partial, archived 2024-08-15 · "Run a 5k" ✓ Achieved, archived 2025-01-20.

---

## 10. What is still missing before the Intent gate can be opened

| # | Missing artifact | Owner | Note |
|---|---|---|---|
| G-01 | **Business-process BPMNs** (`.bpd` sources → L1 + L2) in `docs/02_Business/01_Business-Processes/` | interview-architect | §5 proposes the landscape; nothing is drawn. Needs the Software Architect's cut first. |
| G-02 | **System Interaction markdowns + activity diagrams**, with **minted `SIxx.yy` ids** | interview-architect | §6 lists ~80 candidates. Ids mint at Mockup (ADR-066) — do not pre-assign. |
| G-03 | **Screen models** in the project's own format in `docs/02_Business/06_Screen-Models/` | interview-architect | §7 inventories the 30+ surfaces; the ASCII wireframes are the input, not the artifact. |
| G-04 | **Provisional Sequence Map** in `docs/02_Business/03_Sequence-Map/` | `seqmap generate` | Derived from the BPs and screen models. |
| G-05 | **Business map** in `docs/02_Business/05_Business-Map/`, **with a price tag per BP** | Software Architect + stakeholder | ADR-040 §2 makes scope and priority an economic decision at Intent. For a single-user personal tool, "what automating it saves or earns" needs a stated meaning — **QB-09**. |
| G-06 | **LLM-authored behavioural spike** + its mandatory invented-decisions log (ADR-044) | interview-architect | The spike is what the stakeholder walks at Intent (ADR-045: flows early, data late). |
| G-07 | **Walkthrough capture** — the flows taken, the values entered, the outcomes confirmed | Software Architect | §9 is a candidate seed, not an approved walkthrough. |
| G-08 | **Q&A ledger** `Bearing.method/qa.yaml` | architect / Software Architect | **Does not exist.** `qa check` enforces no open blocking entry at Intent. §12's 23 entries are the initial content. |
| G-09 | **Business-rules registry** (ADR-043) | interview-architect | §4's ~89 rules are the content; the registry is the capture-grade artifact the spike reads. |
| G-10 | **Volatility harvest** with provenance per entry | interview-architect | `arch §3` has the map; per-entry provenance ("every gateway, every *it depends*, every 1-of-N") is missing. Carried to the Blueprint document §2. |
| ~~G-11~~ | ~~The four source documents under version control~~ | ops | **CLOSED** 2026-10-04 — the sources moved to `docs/01_Planning/sources/` and are committed as business and design input. |
| G-12 | **A provenance ruling** on owner-authored documents standing in for recorded sessions | Software Architect | **QB-01.** |
| G-13 | **`funnel.md` correction** — the reserved-tag list names only `routine`; `untagged` and `all` are missing | interview-architect | Already surfaced by the author at `arch §13`. Resolve with **QB-02**. |

---

## 11. Known contradictions between the source documents

Eight places where the sources disagree with each other. Each needs a ruling before the business
design can be frozen; they are filed as QB entries in §12.

| # | Contradiction | Where |
|---|---|---|
| C-1 | **A detached goal has no theme.** `arch §9` says declining a theme cascade *detaches* (clears `theme_id`); BR-01 says `goal.theme_id` is **required**. Routines have the same problem. | `arch §9` vs `funnel §Linking rules` |
| C-2 | **Deleting a goal "clears any Focus selections referencing it"** — but day focus holds selected *idea* and *routine* ids, never goal ids. | `wf §2.4` vs `funnel §Entity reference fields` |
| C-3 | **Reserved-tag list differs** across documents: `{routine}` vs `{routine, untagged, all}`. The Idea editor's Reserved state only mentions `routine`. | `funnel`, `wf §3.2` vs `arch §8` |
| C-4 | **Day check-out's task lists are "derived from task movement timestamps"**, but `arch §8 UC2` deliberately puts **no lifecycle timestamp fields on Task** and leaves the predicate TBD (`arch §12 Q3`). | `wf §6.4` vs `arch §8`, `arch §12 Q3` |
| C-5 | **Per-task Archive action.** `wf §7.8` lists "a per-task `Archive` action in the task context menu" as a task-archive trigger; neither context-menu variant in `wf §6.1` contains it. | `wf §7.8` vs `wf §6.1` |
| C-6 | **A "Data-path-missing dialog" with radio options** ("Use a different existing data folder") appears in the focus-landing table and in guideline #17, contradicting `§7.2`/`§7.7`, which offer only `[ Quit ]` / `[ Continue ]` and explicitly refuse folder picking. | `wf §7.10`, guideline #17 vs `wf §7.2`, `wf §7.7` |
| C-7 | **Tab-level preferences have no home.** The Ideation sort "is stored alongside other tab-level preferences", but the Settings document type and `SettingsManager` were removed from the design. | `wf §3.1` vs `arch §11` |
| C-8 | **"Untagged" names two different things** — ideas without a *theme* (Ideation sidebar) and tasks without a *tag* (Execution board). Same word, two meanings, two tabs. | `wf §3.1` vs `wf §6.1` |

Two further single-document slips, noted for the authoring pass rather than as rulings: the Week-mode
wireframe shows five of seven day cards (`wf §5.1.b`), and the Themes-tab goal counter's scope
(active vs. all-time) is unstated (`wf §2.1`).

---

## 12. Open business questions — Q&A ledger candidates (business tier)

To be appended to `Bearing.method/qa.yaml` once it exists. `blocks:` names what cannot be frozen until
the question is answered.

| # | Question | Blocks |
|---|---|---|
| QB-01 | Do owner-authored design documents satisfy ADR-028's provenance requirement, standing in for recorded stakeholder sessions? If not, what substitutes? | every Intent artifact |
| QB-02 | What is the final reserved-tag set — `{routine}` or `{routine, untagged, all}`? (C-3) | BR-07, the Idea editor's Reserved state, tag validation |
| QB-03 | When a theme is deleted without cascade, what happens to its goals and routines, whose theme is required? Reject the deletion, require a target theme, or relax the requirement? (C-1) | BR-21, the Delete-theme flow, the goal and routine models |
| QB-04 | Is the default landing tab Focus or Execution? One value, not "or". | BR-47, onboarding completion, the shell |
| QB-05 | What is "auto-promote-priority", named as a hardcoded default but defined nowhere? | BR-77, task intake |
| QB-06 | Where do tab-level UI preferences (the Ideation sort) live, given that there are no settings and no settings document type? (C-7) | BR-87, the Ideation view |
| QB-07 | "Log for telemetry" appears twice for advisor payload failures, but there is no telemetry backend and no operator. Local log file, or drop the wording? | the advisor's failure handling |
| QB-08 | Is the first theme called **Work** (onboarding) or **Career** (every other example)? | BR-81, the pre-seed set |
| QB-09 | What does a "price tag per business process" mean for a single-user personal tool — time saved per week, a subjective value rank, or something else? Without it, scope at Intent is not an economic decision. | G-05, the business map, scope and priority |
| QB-10 | **What is the routine spawn rule?** Recurrence is Daily/Weekly/Monthly/Custom, frequency is "3× per week", and preferred days are an explicitly *soft* hint. On which days does a routine task actually appear, and what does the frequency do if the preferred days do not bind? | BR-42, BR-44, the Routine model, day rollover, `arch §12 Q2` |
| QB-11 | What does the **Custom** recurrence pattern mean? (Skip-on-holiday, streaks and reminders are out of scope.) | the Routine editor, BR-88 |
| QB-12 | Does a goal whose time horizon passes without a check-out do anything at all — a visual signal, an advisor nudge, nothing? | the Goals view, the advisor |
| QB-13 | Must every key result be typed (numeric or boolean)? Two KRs in the wireframe show no type line. | BR-28, the Goal editor, the check-in dialog |
| QB-14 | Are goal time horizons limited to **Quarter** and **Year**, or is a free date range admissible? | the Goal editor, carry-forward's "next period" |
| QB-15 | Can an **archived** idea's tag be renamed to release the name for a new idea, and if so from where? `funnel` implies it; no surface offers it. | BR-05, the archive view |
| QB-16 | Does archiving an idea remove its tag from the Focus selectables and hide its board? (UC1 validates "not archived"; no screen states it.) | BR-43, the Focus Day mode |
| QB-17 | When a task's tag is edited to a board whose columns differ, what happens — "preserved where possible" needs a rule. | BR-63, the Task editor |
| QB-18 | Does the Themes-tab goal counter count active goals or all goals ever? | the Themes view |
| QB-19 | Does the advisor need to work offline at all, or is a degraded advisor acceptable in every case? | the advisor, `arch §12 Q9` (→ Contract) |
| QB-20 | Is the advisor's conversation history part of the Planner's data (journaled, in git) or ephemeral session state? | `arch §12 Q12`, the journal, the advisor panel |
| QB-21 | Is the distinction between "untagged ideas" and the "untagged board" acceptable, or should one be renamed? (C-8) | the Ideation sidebar, the Boards strip, the glossary |
| QB-22 | Can a task be archived individually, outside the day check-out? (C-5) | BR-23, the task context menu |
| QB-23 | Which day-check-out predicate defines "completed today" and "in progress today" in business terms, independent of how it is computed? (C-4) | BR-35, `arch §12 Q3` (→ Blueprint) |

---

## 13. Downstream — what this gate hands on

- **To Blueprint:** the volatility harvest (`arch §3`, recorded here as a Discovery side-channel), the
  entity relationships of Graph B, the business rules of §4 as the behaviour the model must realize,
  and the frozen SIs as the use cases to decompose against.
- **To Contract:** §4's concrete thresholds and defaults, §9's example dataset as seed-row candidates,
  §8's operational concerns as deployment-decision input, and the stack intent (Svelte + C#).
- **To Acceptance:** the daily hot path (§1.2) as the primary acceptance flow, the approved walkthroughs
  once captured, and the UI craft rules carried in the Acceptance document.
