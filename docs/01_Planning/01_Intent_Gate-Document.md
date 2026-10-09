# Bearing v2 — Intent Gate Document

> **Gate.** `intent` — *Bless business design; the business intent is const* (ADR-040 §1, ADR-064).
> **Freezes.** BPMNs + System Interactions, screen models, the approved walkthroughs with their
> example data, the business map.
> **Reviewers.** Stakeholder + Software Architect (here the same person).
> **Status.** Pre-gate. Material captured, artifacts not yet authored. Nothing const.

**Provenance note (ADR-040 §1, citing ADR-028).** The business intent reaches the factory not as
interview recordings but as four documents authored by the Software Architect, who is also the
product's domain expert and its only user. **They are this project's recordings** (QB-01) — valid
provenance, and as imperfect as any recording: some of what they state gets overruled, and §11 holds
the first eight. Every statement below cites one of them by prefix and that document's own heading
number — `funnel §…` (`sources/funnel.md`), `arch §…` (`sources/architecture.md`), `wf §…`
(`sources/ui-wireframes.md`), `inv` (`sources/ui-inventory.md`, no section numbers).

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
| **User** | Human — the only human actor | Owns every entity; is simultaneously stakeholder, operator and beneficiary. Bearing has exactly one, and every rule below that says *the user* means them. |
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
| Goal | What am I committing to? | a quarter or a year when time-bound; open-ended otherwise | medium |
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

| Entity | What it is, in the user's terms | Archivable? | Deletable? |
|---|---|---|---|
| **Theme** | An evergreen life area that is never "completed" (Health, Career, Relationships). Edited 2–4× per year. Groups goals and routines; owns the colour that propagates downstream. | ✗ | ✓ (cascade offered) |
| **Vision / Mission** | Optional reflective prose one rung *above* themes — "who you want to become", "what you're here to do". Feeds the advisor's higher-frame critique when set; omitted when unset. Nothing depends on it. | ✗ | n/a (reset by emptying) |
| **Idea** | A candidate for future realization. Most never become goals — that is the point. Owns a unique tag, which identifies its Kanban board. | ✓ | ✓ (cascade offered) |
| **Goal** | A commitment: an objective, anchored to exactly one theme, linked to 0..N ideas, and carrying 0..N progress measures. **A time horizon is optional** — a goal may be time-bound (a quarter, a year) or open-ended. | ✓ (via check-out) | ✓ (idea deletion optional) |
| **Progress measure** | A measurable indicator of progress toward a goal, and the thing a goal is judged against. Typed **numeric** (target + unit + direction ↑/↓) or **boolean** (done / not done). OKR's *key result* is **one realization** of this concept, not the concept itself — the goal-setting approach may change (BR-08), the need to measure progress does not. | — | via its goal |
| **Progress check-in** | One dated data point on one progress measure, with an optional note. History is append-only and keyed to the measure's identity, never to its display position. | — | — |
| **Routine** | An evergreen recurring activity that doesn't warrant a goal — maintenance, not achievement. Sits parallel to goals under a theme. Pausable via an Active toggle. | ✗ | ✓ (cascade offered) |
| **Day focus** | Per-day state: which tags and which routines get attention on one date. Not an entity with downstream ownership. | ✗ | — |
| **Task** | A unit of work on exactly one board, carrying an Eisenhower priority and a column. | ✓ | ✓ (no cascade) |
| **Board** | The Kanban surface of one tag. Identified by the tag string. | — | — |
| **Column** | A lane on a board, carrying a *role* (`Backlog` / `Todo` / `InProgress` / `Done`) separate from its user-editable name. | — | ✓ (cascade or reject) |
| **Day log** | The record of one checked-out day: notes plus the completed and in-progress task sets at the moment of check-out. Becomes immutable history after rollover. | — | — |
| **Goal check-out** | The closing record of one goal: overall outcome, per-measure statuses with notes, what-worked / what-didn't retro. Stays attached to the archived goal. | — | — |
| **Suggestion** | One structured, actionable advisor proposal with a lifecycle `pending → applied / dismissed / superseded`. The conversation it belongs to is **journaled but not version-controlled** (SA 2026-10-06) — kept as history, outside git. | — | — |
| **Draft** | Unfinished input the user has not committed: a batch of staged tasks, and day-check-out notes being written. A draft survives abandoning the gesture, a crash and an app restart, and is **not** a commit: nothing it describes takes effect until the gesture is completed (BR-37, BR-63). | — | — |
| **Interface state** | How the product was last left — orderings, what was collapsed, the board last worked on. Remembered between sessions, deliberately outside the planning history (BR-92). Not authored by the user and not part of what the journal records. | — | — |

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

**These rules are about behaviour, not about the screens.** How a rule is presented — which tab, which
view, which dialog, which button, which wording — is deliberately *not* stated here: that is the screen models' business, and
fixing it in a business rule would freeze UX at the Intent gate. Surface decisions already made live in
[`05_UX-Directives.md`](05_UX-Directives.md); the `wf §…` citations stay, so the realization the
Software Architect sketched remains one hop away.

**A `BR-` number is an identifier, not a position.** A rule keeps its number for life: if it moves to
another sub-section it takes its number with it (BR-08 and BR-10 sit in §4.8 for that reason), and a
retired number is never reused (BR-11 was retired on 2026-10-05 when it moved out of this document).
The numbering was last re-sequenced on 2026-10-04; from that point ids are permanent, on the same
principle as a System Interaction id (ADR-066).

### 4.1 Structure and linking

| # | Rule | Source |
|---|---|---|
| BR-01 | Every **goal** has exactly one theme (required). | `funnel §Linking rules` |
| BR-02 | Every **routine** has exactly one theme (required). | `funnel §Linking rules` |
| BR-03 | An **idea** has zero or one theme (optional affiliation — `funnel §Linking model`: `idea.theme_id, optional`; the Idea editor draws `Theme (optional)` beside a required `Title *` and `Tag *`). A theme-less idea is legitimate and arises two ways: captured without a theme, or left theme-less when its theme was deleted with its ideas kept (BR-13). **Affiliating it to a theme later is an ordinary act** — so theme-less is a *transient state*, not a category an idea belongs to. Theme-less ideas are grouped together, under the label **Unthemed** (SA 2026-10-06), for exactly as long as they are theme-less. | `funnel §2`, `wf §3.1`, `wf §3.2`, SA 2026-10-06 |
| BR-04 | A **goal** links 0..N ideas, typically 1. A goal with **no linked idea is legitimate** — it is judged on its progress measures alone — **and is flagged as such**, so it is obvious that no idea is assigned. The flag is on the *state*, not on the history: it makes no difference whether the goal was created that way or lost its idea to a deletion (BR-14), so nothing needs remembering. | `funnel §3`, `wf §4.1`, SA 2026-10-05 |
| BR-05 | An idea's **tag is unique across all ideas, active and archived**. An archived idea still owns its tag. **An archived idea cannot be edited** (SA 2026-10-06), so releasing its tag means unarchiving it, editing, archiving again — or deleting the idea outright. | `funnel §Linking rules`, `wf §3.2`, SA 2026-10-06 |
| BR-06 | **Tag normalization:** lowercase; non-alphanumeric characters replaced by `-`; hyphens and underscores preserved. Applied on save, and the normalized form is what the user is shown before committing. | `funnel §Linking rules`, `wf §3.2` |
| BR-07 | **Reserved tag strings are rejected wherever a tag can be created or renamed**, and the set is `{routine, untagged, all}`. | `arch §8`, SA 2026-10-06 |
| BR-09 | **Colour propagates** from theme through every entity downstream of it in the funnel order (§2.1's Graph A) — goals, routines, ideas, focus selections, boards, tasks. Colour is never the only signal; it always pairs with a name or a label. | `funnel §Linking rules`, `wf` guideline #1 |

### 4.2 Deletion and cascade

| # | Rule | Source |
|---|---|---|
| BR-12 | **Deletion offers a cascade over what lies downstream of it in the funnel order (§2.1's Graph A), one opt-in per layer.** Reach is *transitive* — a theme reaches its ideas' tasks through its ideas (BR-13) — but it is never *assumed*: every layer is a separate choice, defaulting to keep (BR-19), so no entity is destroyed because something above it was. Ownership is what makes a layer's removal automatic and unasked (a goal's own progress measures, BR-15); everything else is offered. | `funnel §Deletion cascade rule`, SA 2026-10-05 |
| BR-13 | **Theme** → deleting a theme offers **three independent cascades, each defaulting to keep**: its **goals and routines**; its **ideas**; and the **tasks on those ideas' boards**. Deleting a theme is a rare, deliberate event — the one moment where sweeping up everything beneath it is a reasonable ask — so each layer is offered rather than assumed. Ideas that are kept simply lose the theme affiliation (BR-03 makes theme-less legitimate); deleting the ideas but keeping their tasks is BR-14's path, and leaves that work untagged. | `funnel`, `wf §2.4`, SA 2026-10-04/05 |
| BR-14 | **Idea** → cascade offered for its board and all its tasks. Always removes the idea and its tag, and clears the link from any goal; linked goals survive, minus the link. A goal left with no linked idea by this deletion is **flagged like any other idea-less goal** (BR-04) — the consequence is visible rather than silent, and needs no special "lost its idea" state. | `funnel`, `wf §2.4`, SA 2026-10-05 |
| BR-15 | **Goal** → cascade offered for its **linked ideas**, defaulting to *keep*. Its own progress measures and check-in history always go with it. Tasks are never reached from a goal: they belong to the idea's board, and a goal has no claim on them. ⚠ This **overturns** the sources, which declare goal deletion cascade-free by design (`funnel §Deletion cascade rule`, `wf §2.4`) — `funnel.md` needs correcting (G-14). | `funnel`, `wf §2.4`, SA 2026-10-04 |
| BR-16 | **Routine** → cascade offered for the task occurrences it has already produced. Without it, the routine simply stops producing new ones. | `funnel`, `wf §2.4` |
| BR-17 | **Task** → owns nothing, no cascade. | `funnel`, `wf §2.4` |
| BR-18 | **Column** → the one case where declining the cascade **rejects the deletion** rather than detaching, because a task must be in some column and there is no safe fallback. An empty column deletes cleanly. | `funnel`, `wf §2.4`, `arch §9` |
| BR-19 | **Every cascade is off by default**, decided per deletion, and **not configurable** — the safer outcome is always the one the user gets without acting. | `wf §2.4`, `arch §9` |
| BR-20 | **There is no in-app undo.** The user is told so at the point of deletion, and told that the data is under version control. | `wf §2.4` |
| BR-21 | **Declining a cascade detaches where detaching is legal, and rejects the deletion where it is not.** An idea loses its theme, a tag's tasks become untagged work. A **goal** and a **routine** have a required theme (BR-01, BR-02), so a theme deletion that would orphan one is **rejected** — the same answer the column case already gives (BR-23). Cascade, or keep the theme. | `arch §9`, `funnel`, SA 2026-10-06 |

### 4.3 Archive and check-out

| # | Rule | Source |
|---|---|---|
| BR-22 | **Archive is always a conscious manual gesture — there is no exception** (SA 2026-10-06). A goal does not archive when its horizon passes; a task does not archive after N days in Done; **a completed routine task does not archive itself either** — routine work is not treated specially. A goal whose horizon has passed is **subtly flagged as due** in the Goals view instead — visible, not loud, and it never acts on the goal. | `funnel §Archive`, `wf §7.8`, `wf §6.1`, SA 2026-10-06 |
| BR-23 | **Archivable, and by which act:** an **idea**, directly — a low-stakes parking gesture; a **goal**, directly as well — **at any time, independent of check-out** (SA 2026-10-06), which check-out merely *offers* as its closing action (BR-30); a **task**, three ways — through day check-out (BR-34), **individually** from its context menu, and by archiving a whole column's worth at once. **A routine's task archives by those same three acts and no others** (BR-61). **Not archivable:** theme, routine (pause it instead), day focus. | `funnel §Archive`, `wf §7.8`, `wf §6.1`, SA 2026-10-05, SA 2026-10-06 |
| BR-24 | **Archive does not cascade.** Archiving an idea does not archive its tasks; archiving a goal does not archive its linked ideas. | `wf §7.8` |
| BR-25 | **Unarchive restores the item to its prior state and its prior position.** Ordering is **relative**, so an archived item's position is never occupied while it is away — it can be reclaimed on return without colliding with anything or renumbering its neighbours. | `wf §7.8`, SA 2026-10-04 |
| BR-26 | Archived items are **retained, not removed** — hidden from the working view and retrievable on demand. | `funnel §Archive`, `wf §7.8` |
| BR-27 | **Goal check-out** captures: an overall outcome (Achieved / Partially achieved / Missed / Abandoned — required), a status per progress measure with an optional note, a what-worked / what-didn't retro, and the closing actions. Available **at any time** — it is not gated on a horizon passing, and a goal need not have a horizon at all. | `funnel §Archive`, `wf §4.4` |
| BR-28 | **Every progress measure is typed, numeric or boolean — there is no untyped measure** (SA 2026-10-06; further types may come, none are foreseen). **Per-measure status is auto-inferred, by measure type.** Numeric: `≥100% → Hit`, `50–99% → Partial`, `<50% → Missed`. Boolean: `Done → Hit`, `Not done → Missed` — **boolean never auto-infers Partial**, because the type has no intermediate state. | `inv`, `wf §4.4`, SA 2026-10-06 |
| BR-29 | The user may **override any auto-inferred status**, including setting a boolean measure to Partial. The rule constrains the inference, never the final human judgment. | `wf §4.4` |
| BR-30 | Goal check-out closing actions: **archive the goal — default ON**; **create a follow-up goal — default OFF**. Declining the archive leaves the goal active and loses nothing: it can be archived directly later (BR-23). Typically a goal is archived *after* being checked out, but that is habit, not a rule. | `funnel §Archive`, `wf §4.4`, SA 2026-10-06 |
| BR-31 | **Carry-forward** seeds a follow-up goal from the checked-out one: theme inherited; linked ideas inherited verbatim; objective carried over, marked as a continuation and editable; **only the Partial and Missed measures**, with numeric progress reset to zero and booleans to Not done; check-out notes dropped (they were retrospective); and a back-reference to the originating check-out, so the iteration chain is traceable. **A time horizon is carried forward only if the original had one** — then it advances to the next period of the same granularity; otherwise the follow-up is open-ended like its predecessor. The user reviews before it is committed, and abandoning the follow-up still completes the check-out. **A horizon's granularity is the user's choice** — the product dictates none (SA 2026-10-06), so “the next period” in a carry-forward follows whatever the checked-out goal used. | `funnel §Archive`, `wf §4.4`, SA 2026-10-04 |
| BR-32 | **Goal check-out is a single deliberate sitting** — abandoning it discards every partial input. | `wf §4.4` |
| BR-33 | **Day check-out** captures what the system observes completed and still open, with the user confirming rather than editing it, plus optional day notes and the closing actions. **Both lists are read from the board's current state, not from when anything moved** (SA 2026-10-06): completed = *currently in a Done column*, still open = *past Backlog and not Done* (BR-35). Reachable from more than one place; it is the same gesture wherever it is started. ⚠ Consequence: a task finished yesterday and left unarchived appears again today, and checking out an earlier day (BR-45) shows today's board rather than that day's — the archive action, default ON (BR-34), is what keeps the list from accumulating. | `funnel §Archive`, `wf §6.4`, SA 2026-10-06 |
| BR-34 | Day check-out closing actions: **archive the completed tasks — default ON**; **reset the still-open tasks — default OFF**. | `funnel §Archive`, `wf §6.4` |
| BR-35 | **“Still open” for check-out purposes** = any task **past Backlog and not yet Done**, whenever it was last touched (SA 2026-10-06). Completed tasks — those **currently in Done** — are handled by the archive action; **Backlog is never touched**, since nothing there was started. Neither predicate needs a movement timestamp: both read the board as it stands. **Reset returns such a task to its Backlog triage section at the top, not to its old slot** (SA 2026-10-06): among the tasks being reset together, **the further right the column they came from, the higher they land** — so what was in progress sits above what was merely to do — and tasks coming back from the *same* column keep their order relative to each other. | `wf §6.4`, SA 2026-10-04, SA 2026-10-06 |
| BR-36 | **Day check-out is idempotent per date** — running it again on the same day updates that day's log rather than creating a second one ("checked out at 5 pm, worked more, ran it again at 9 pm"). | `funnel §Archive`, `wf §6.4` |
| BR-37 | **Abandoning a day check-out keeps the notes and commits nothing else.** Day notes are a running journal — started in the morning, finished in the evening — so they are drafted continuously and survive abandoning the gesture, a crash and a restart. A draft is still **not a commit**: none of the closing actions fire and no day log is written until the check-out is completed. This is the same draft behaviour as task capture (BR-63). **Goal check-out deliberately differs** (BR-32): it is a single judgment made in one sitting, not an entry accumulated over a day, so there is nothing there worth carrying between attempts. | `wf §6.4`, SA 2026-10-05 |
| BR-38 | A day's log remains available as the explanation of that day when the period is reviewed later. | `wf §6.4` |
| BR-39 | **The check-out shape is reusable:** what the system observed (read-only) → optional reflection → per-item judgment where there is any → opt-in closing actions, where archiving defaults ON and everything else defaults OFF → one named closing gesture. A future entity needing a check-out copies this shape rather than inventing one. | `wf §7.11` |

### 4.4 Focus and the day

| # | Rule | Source |
|---|---|---|
| BR-40 | **The day is the unit of focus** — focus is always recorded *for a day*. It is **not** only editable from a day-scoped view: **the user can set a day's focus from any time scope**, week, month or year included. Selecting a day in a longer period opens that day for editing without leaving the period behind. Longer periods aggregate the day grain; they never replace it, and they are never the only place a plan can be changed. | `funnel §4`, `wf §5.1`, SA 2026-10-04 |
| BR-93 | **The smallest focus-view scope is a week** — a one-day view overviews nothing. The scopes are week, month and year; the day stays the unit of focus (BR-40), edited in a day focus editor opened from whichever period view is showing. ⚠ Overrules the sources' four modes with Day editable-only. | SA 2026-10-06, over `wf §5.1` |
| BR-41 | Two kinds of thing are selected for a day: **tags** (which bring their board into play for the day) and **routines** (which put their task on the board, BR-42). Both are grouped by theme, so the funnel link is visible at the point of choice. | `funnel §4`, `wf §5.1.a` |
| BR-42 | **Selecting a routine for a day ensures it has exactly one outstanding task — selection is what creates it, and it creates at most one.** If an outstanding task for that routine already exists, selecting the routine again — the next day, or a week later — creates **no second task**: the old one is still what is owed. **Due and overdue are treated identically**; nothing about the clock changes the rule. An outstanding task persists until it is completed, and **deselecting a routine never removes a task already created**. | `funnel §4`, `arch §9`, SA 2026-10-05 |
| BR-91 | **A routine's schedule is fixed, and it determines due and overdue — it just never creates a task.** Routines are pre-scheduled: for any date, the recurrence and preferred days say whether a routine is **due** that day, and a routine is **overdue** when it was due on an earlier date and was not selected then. That is a computation, not advice — a fixed schedule is the whole point of a routine. What the schedule does not do is put work on the board: only selecting a routine does (BR-42). | `funnel §Routines`, SA 2026-10-05, SA 2026-10-06 |
| BR-94 | **A routine recurs Daily, Weekly, Monthly or Yearly** — four patterns, no fifth. The sources' **Custom** is removed (it was never defined) and **Yearly** is added. The frequency unit follows the pattern (`3× per week` under Weekly), and preferred days stay as they are. | `wf §2.3`, SA 2026-10-06 |
| BR-95 | **The Themes view counts active goals and routines only** — archived goals are not counted (SA 2026-10-06). | `wf §2.1`, SA 2026-10-06 |
| BR-43 | Only non-archived ideas and **active** (non-paused) routines can be selected for a day. **Archiving an idea therefore removes its tag from the focus selectables and hides its board** (SA 2026-10-06) — both, not one. | `arch §8 UC1`, SA 2026-10-06 |
| BR-44 | **The day rolls at local midnight, and that is not configurable.** Rollover does exactly one thing: **it advances which day is current, so the day focus in play becomes the new date's** — empty until the user sets it — and everything that follows from the day focus follows it: the focused tags, and with them the boards those tags put in play (BR-50, BR-51). The previous day's focus becomes history, reachable from the period views, and the previous day's log becomes history. **Rollover creates nothing and destroys nothing**: no tasks are spawned — only selecting a routine does that (BR-42) — nothing is archived, nothing is closed (BR-45). Nothing appears on the board overnight that the user did not ask for, and nothing leaves it either. | `funnel §Day rollover`, `wf §7.2`, SA 2026-10-05, SA 2026-10-06 |
| BR-45 | **A day that was never checked out stays checkable out.** Midnight passing does not close a day against the user — someone working past midnight, or away for a few days, can still check out the days they left open. Rollover advances *which day is current*; it does not forfeit the unchecked ones. | `funnel §Day rollover`, SA 2026-10-04 |
| BR-46 | **Every period view says which period it is showing and how that relates to now, and can always be stepped and re-scoped** — the absolute period, its relation to the present, the always-available moves to the previous period, the next period and back to the current one, **and the always-available switch to any other period scope** (BR-93). The current day is always findable. | `wf §5.1`, SA 2026-10-04, SA 2026-10-06 |
| BR-47 | **Each period view reports theme balance over the period it shows** — how the user's attention was distributed across themes. | `funnel §4`, `wf §5.1` |
| BR-48 | **Bearing opens on Focus** — that is where a day typically starts. Themes and Ideation are where the funnel gets *defined*, a few times a year; Focus and Execution are where it gets *used*. (First run opens on onboarding instead.) A later change may open the **last page used** instead, remembered as excluded interface state (BR-92); not now. | `funnel §UX principles`, `wf §7.1`, SA 2026-10-06 |

### 4.5 Execution and prioritization

| # | Rule | Source |
|---|---|---|
| BR-49 | **There are exactly two kinds of board:** one always-present aggregate over *every* task, and one board per tag. `routine` and `untagged` are **reserved tag strings**, so their boards arise under the same rule as any other tag's — there is no special-case board type. | `funnel §5`, `wf §6.1` |
| BR-50 | **One visibility rule for every board, with no special cases: a tag's board is present when that tag has something to show** — it is in today's focus, or it still carries tasks. `routine` and `untagged` qualify by that same rule: `routine` while it carries any task, outstanding or already completed (nothing archives itself, BR-61); `untagged` while untagged work exists — whether deliberately captured that way (BR-90) or left behind by a deletion (BR-14). | `funnel §5`, `wf §6.1`, SA 2026-10-06 |
| BR-51 | **The user arrives at the aggregate board**, unless the day has a focus — in which case they arrive at what they planned to work on. | `funnel §5`, `wf §6.1` |
| BR-52 | **Triage happens at intake, so priority lives in the Backlog and nowhere else.** Work that has left the Backlog has already been triaged; re-asserting priority there would be noise. | `funnel §5`, `wf §6.1` |
| BR-53 | **Exactly three triage buckets**, ordered urgency first: Important & Urgent · Not Important & Urgent · Important & Not Urgent. **"Not Important & Not Urgent" is deliberately absent** — a forcing function: if a task is neither important nor urgent it does not belong on the board at all. | `funnel §5`, `wf §6.1` |
| BR-54 | **A task's priority travels with it** once it leaves the Backlog, stays visible, and **re-applies if it comes back** — so returning a task to the Backlog is the act of re-opening its triage. | `funnel §5`, `wf §6.1` |
| BR-55 | **New tasks always enter at the Backlog**, in the triage bucket they were captured into. | `wf §6.1`, `wf §6.2` |
| BR-56 | **Priority is changeable only while a task is in the Backlog.** To re-triage work in motion, the user sends it back first. | `wf §6.1` |
| BR-57 | **The three triage buckets are always present, including when empty** — the structure does not vanish with its contents. | `wf §6.1`, `wf §7.6` |
| BR-58 | **A column carries a role — `{Backlog, Todo, InProgress, Done}` — and a name, and they are different things.** Four roles, no neutral escape hatch: every column commits to a workflow meaning. Renaming a column never changes its meaning; day check-out and the advisor read the role, never the name. | `arch §10` |
| BR-59 | **A board has exactly one Backlog column and at least one Done column.** A board without a Backlog makes no sense — new tasks always enter there (BR-55) and a re-tagged task has to land somewhere (BR-64) — and neither does a board with no Done. The three triage buckets are not splittable across two Backlogs, so Backlog is capped at one; **Done is not capped** — several Done columns are fine. Other roles may be shared freely. | `arch §10`, SA 2026-10-06 |
| BR-60 | **A column's role may change, and the consequences are owned by the user:** InProgress → Done makes its tasks count as completed; Done → InProgress retroactively unwinds completions; Backlog → anything dissolves the triage buckets while the tasks keep their priority. | `arch §10` |
| BR-61 | **A routine's task is an ordinary task.** It is completed, archived and deleted by the same acts as any other (BR-23), with no automatic archiving and no special lifetime — which is also what `wf §6.1` says (*completed routine tasks are kept in their last-known column; no auto-archive*). What keeps the board honest is BR-42: selecting the routine again creates no second task while one is still outstanding. | `wf §6.1`, SA 2026-10-06 |
| BR-62 | **The reserved tags cannot be chosen when capturing a task.** Routine work arises only from a routine being due; untagged work arises from a task captured with no tag at all (BR-90) or from an idea being deleted without its tasks (BR-14). | `wf §6.2`, SA 2026-10-05 |
| BR-63 | **Task capture is a batch gesture.** Several tasks are staged across the triage buckets and committed together; staged work is **drafted** (BR-37's draft semantics) so that leaving the gesture does not destroy it; discarding it is an explicit act, and nothing is committed until the batch is. | `wf §6.2` |
| BR-64 | **A task's content and its placement are separate concerns.** Content (what the task is) is edited; placement (its bucket, its column) is changed by moving the task. **Re-tagging is possible only while the task is in the Backlog**: a board's columns may come to be specific to its tag, so moving work in flight to another board could land it in a column that board does not have. Work already in motion is sent back to the Backlog first — the same gesture BR-54 uses for re-triage. | `wf §6.3`, SA 2026-10-05 |
| BR-65 | **A new tag comes into existence only by creating an idea** — never as a side effect of capturing a task. Capturing a task chooses among the tags that already exist (or none at all, BR-90); ideation is what creates them. | `wf §6.2` |
| BR-90 | **A task may be captured with no tag at all**, and becomes untagged work. Not every task belongs to an idea: some work is simply work. Untagged therefore has two sources — a tagless capture, and an idea deleted without its tasks (BR-14), which is also the path a theme deletion takes when it removes the ideas but keeps their tasks. | SA 2026-10-05 |

### 4.6 The advisor

| # | Rule | Source |
|---|---|---|
| BR-66 | **There is one advisor**, available from anywhere in the product, aware of where the user currently is, and **never blocking** — consulting it does not suspend the work. One conversation runs for the session and is cleared deliberately. | `inv`, `wf §7.5` |
| BR-67 | The advisor **sees the whole funnel** — themes, ideas, goals, routines, focus history, tasks, progress check-ins — plus Vision and Mission when set. Specialization by context is a matter of what it is asked, never of there being several advisors. | `wf §7.5` |
| BR-68 | **An advisor proposal is a structured, typed object, never prose to be parsed.** That is what makes a proposal applicable at all, and what makes "which thing does this change?" answerable with certainty. | `wf §7.5` |
| BR-69 | **Applying a proposal writes it, immediately and completely. One rule, no exceptions.** Consequently **a proposal to create something must carry everything that thing needs** — the advisor may not propose a half-finished entity for the user to complete; lacking information, it asks. | `wf §7.5` |
| BR-70 | **At most one outstanding proposal per target at any time.** A revised proposal for the same target supersedes its predecessor, so the user is never asked to choose between two proposals that would overwrite each other. Already-applied and already-declined proposals are closed and unaffected. | `wf §7.5` |
| BR-71 | **Applying or declining a whole answer at once acts on its still-outstanding proposals, in order**; already-resolved ones are skipped. | `wf §7.5` |
| BR-72 | **The advisor acts only through the operations the user has** — there is no second write path, so advisor-applied changes are indistinguishable from the user's own, and the journal stays coherent. | `arch §5 Pivot 3` |
| BR-73 | **Four areas the advisor may only speak about, never act in:** creating ideas (ideation is human territory), setting a day's focus (an explicit human commitment), archiving anything (a conscious gesture — BR-22), and pausing or resuming a routine. Bulk action is out of scope. | `wf §7.5` |
| BR-74 | **An advisor proposal may change a part of the funnel the user is not working in, and when it does they are told.** The advisor reads the whole funnel (BR-67) while the user is working at one stage of it at a time, so a proposal raised while thinking about an **idea** can land on a **goal** ("promote this") or on a **task** ("break this down"). It is applied where that change belongs — the user is not taken there to approve it — and because the change happened where they were not looking, saying so is part of applying it. | `wf §7.5`, SA 2026-10-05 |
| BR-75 | **The advisor never silently fails and never half-succeeds.** If it returns something the product cannot act on, the user is told it could not be used — not handed an inert proposal, and not handed a sentence dressed up as advice. The advisor can of course *say* anything it likes in the conversation (BR-68 keeps proposals structured and prose prose); what it cannot do is produce something that looks like a proposal and is not one. | `wf §7.5`, SA 2026-10-05 |

### 4.7 First run, storage and settings

| # | Rule | Source |
|---|---|---|
| BR-76 | **Bearing has no user-facing settings.** A personal planning tool whose themes and routines cut across everything (health, sleep) maps to *one* workspace, not several, so there is nothing to choose between. | `funnel`, `arch §11`, `wf §7.2` |
| BR-77 | The **user's data lives in one place, chosen by platform convention, and it is version-controlled from the first run.** Moving it is a filesystem act, performed outside the product. | `arch §11`, `wf §7.2` |
| BR-92 | **Remembered interface state is kept, and kept out of the user's history.** How the product was last left — the ordering in force (BR-88), which themes were collapsed, which board was last worked on (BR-51) — is remembered between sessions. It lives in a subdirectory of the data folder that is **explicitly excluded from version control**, so it survives restarts without entering the planning history: it is not something the user authored, it does not belong in the audit trail, and a change to it is not a change to the plan. A restored backup therefore brings back the plan, not the furniture. | SA 2026-10-05 |
| BR-78 | **Everything that would otherwise be a preference is either taken from the operating system** (locale, colour scheme, reduced motion) **or fixed**. | `wf §7.2` |
| BR-79 | **Backup is version control, not a product feature.** Interchange with other tools is out of scope. | `wf §7.2` |
| BR-80 | **On start-up the product finds or creates the user's data, and brings it under version control if it is not already.** Four states are possible, and they are not the same event: **no folder** → create it, version-control it, and tell the user **before any of their data is touched** (BR-81); **a folder that is not version-controlled** → bring it under version control and carry on; **a folder version-controlled by this Bearing** → load it; **a folder version-controlled by something else** — an older Bearing, or a repository that was never Bearing's — → **refused, both cases alike** (SA 2026-10-06): the product adopts nothing it did not create, and the user moves the folder aside by hand. **No migration from v1**; migration *within* v2 will be supported, which is a later concern and never part of first-time opening. | `wf §7.2`, SA 2026-10-05, SA 2026-10-06 |
| BR-81 | **The user — not the product — distinguishes a first run from lost data.** Bearing deliberately does not guess: finding no data, it says so and lets the user either proceed as new or stop and restore a backup themselves. It offers no in-product restore, no folder choosing, and no alternative location. | `inv`, `wf §7.7` |
| BR-82 | **A first run is guided by an onboarding wizard** ([`05_UX-Directives.md`](05_UX-Directives.md) UX-03): it seeds a small starter set of themes (3–5) so the user never faces an empty product, and then offers Vision & Mission. **It can be skipped step by step or in its entirety, and skipping costs nothing** — the product behaves identically either way, and everything the wizard offers can be done later from the Themes tab. | `funnel §UX principles`, `wf §7.1`, SA 2026-10-05 |
| BR-83 | **The starter theme set can be seeded again later** — a user who skipped the wizard, or deleted every theme, is not stranded. Nothing else in the product has a sensible default to seed: ideas, goals and routines are personal by definition. | `wf §7.6` |
| BR-84 | **A goal cannot be created before a theme exists**, and the user is told why rather than being shown an unusable form — BR-01 is kept honest at the point of creation. | `wf §7.6` |

### 4.8 Scope decisions that are business decisions

| # | Decision | Source |
|---|---|---|
| BR-08 | **Goals are flat — for now.** No parent and no child goals: decomposition uses sequential goals on the same idea, or tasks. A *current* choice, not an invariant — the goal-setting approach is itself expected to be volatile (`arch §3`: "goal-setting model, medium volatility"), so nesting may return. Nothing downstream may assume flatness is permanent. *(Was §4.1; moved here 2026-10-05 — a loosened constraint is a scope decision, not an invariant.)* | `funnel §3`, `arch §3` |
| BR-10 | **One canonical home per entity — for now.** A parent does not embed its children; a child carries its parent as context. **Routines are the single deliberate exception**, having no home of their own. A working principle rather than an invariant; it may not survive contact with use. *(Was §4.1; moved here 2026-10-05, same reason as BR-08.)* | `funnel §1`, `wf §2.1` |
| BR-85 | **The user never selects more than one entity to act on.** No multi-select, no range selection, no bulk-action bar. This is a rule about *selection*, not about effect — a cascading deletion (BR-13) and applying a whole advisor answer (BR-71) both touch many entities, but each is **one gesture on one entity** whose consequences the user accepted; neither is the user picking a set. | `inv`, `wf §7.11`, SA 2026-10-05 |
| BR-86 | **An idea has no second grouping axis beyond its theme.** A tag is not a counter-example: BR-05 makes it **unique to one idea**, so it names and identifies that idea's board rather than gathering several ideas together — a label of exactly one member groups nothing. What was considered and rejected is a user-defined labels field that *many* ideas could share, which would put two overlapping ways to organize the same ideas in front of the user. Finding related ideas across themes is served by searching their text and by asking the advisor, not by a second taxonomy. | `inv`, `wf §3.1`, SA 2026-10-05 |
| BR-87 | **Goals are deliberately unfiltered** — grouping them by theme does the work. | `wf §4.1` |
| BR-88 | **A collection the user has ordered by hand has one canonical order, and sorting it another way never disturbs that order.** Today the orderings on offer are *recently added*, *recently edited* and *alphabetical*, against the hand-made order they are viewed instead of; the hand-made order is what the user gets back by asking for it, untouched. The ordering in force is remembered between sessions (BR-92). **For ideas, the hand-made order is a grouping convenience and nothing more** (SA 2026-10-06): the user drags related ideas next to each other, or lets new ones land wherever they land, so the collection is only ever *partly* ordered on purpose. It carries no priority, no front-of-mind rank, and **no consequence anywhere else in the funnel**. | `wf §3.1`, `wf` guideline #16, SA 2026-10-06 |
| BR-89 | **Out of scope for routines:** skip-on-holiday rules, streak goals, reminders and notifications. | `funnel §Routines` |

---

## 5. Required business processes

**The cut, with ids assigned.** Sixteen business processes cover every statement in the four sources
and every surface in §7; the ids are `BP01`…`BP16` in funnel order and are **permanent once a `.bpd`
is written** (`design-artifact-conventions`). The Software Architect confirms the cut before authoring
begins — BPMNs are authored from his statements, not from this table. Per BP the deliverable is one
tagged `.bpd` (the single source for both detailed levels, `bpmn-dsl`), the two generated `.bpmn`, one
`BP##_<Name>.md` overview in `docs/02_Business/01_Business-Processes/`, and one SI markdown per
interaction in `02_System-Interactions/`.

Every process runs between a **User** pool and the **Bearing** (system) pool unless the *Pools* column
says otherwise. `SIs` is the count from §6, before cross-process reuse is collapsed.

| BP | Business process | Trigger | Pools | SIs | Hot path | Sources |
|---|---|---|---|---|---|---|
| **BP01** | **Start Bearing for the first time** — resolve or create the data folder, let the user disambiguate a first run from lost data, refuse a folder versioned by anything else (BR-80), then run the onboarding wizard: seed the starter themes, optionally state vision and mission | App launch with no usable data folder | + filesystem state as a start event | 11 | — | `wf §7.1`, `wf §7.2`, `wf §7.7` |
| **BP02** | **Maintain life themes** — add, rename, recolour, reorder, delete a theme (with its three cascades, BR-13); edit vision and mission | user, 2–4× per year | | 7 | — | `funnel §1`, `wf §2.1`, `wf §2.2`, `wf §2.5` |
| **BP03** | **Maintain routines** — define, amend, pause, resume, reorder, delete a routine under a theme; its schedule is fixed (BR-91, BR-94) | user, rare | | 6 | — | `funnel §Routines`, `wf §2.3` |
| **BP04** | **Capture and curate ideas** — capture an idea with its unique tag, write and refine its notes, re-affiliate it to a theme, filter/sort/order, archive or delete it | user, opportunistic — *including during execution* | | 9 | ✓ (step 3) | `funnel §2`, `wf §3.1`, `wf §3.2` |
| **BP05** | **Commit to and maintain a goal** — promote an idea or frame a theme-only goal; define the objective, its typed progress measures (BR-28), its linked ideas and a horizon if it has one; amend, reorder, archive directly (BR-23) or delete it | user, at the start of a cycle | | 13 | — | `funnel §3`, `wf §4.1`, `wf §4.2` |
| **BP06** | **Track goal progress** — check in on one progress measure, numeric or boolean, with a note; read its history | user, periodic out-of-band cadence | | 3 | — | `wf §4.3` |
| **BP07** | **Close out a goal** — rate the outcome, judge each progress measure, write the retro, archive, optionally carry forward | user, end of cycle | | 3 | — | `funnel §Archive`, `wf §4.4` |
| **BP08** | **Set a day's focus** — pick that day's tags and routines from whichever focus view is showing (BR-40); routine selection ensures one outstanding task (BR-42) | user, every morning | | 4 | ✓ (step 1) | `funnel §4`, `wf §5.1.a`, `arch §8 S1` |
| **BP09** | **Review focus history** — read the week, month or year overview with its coverage strip; step the period, re-scope, select any day to edit it (BR-46, BR-93) | user, occasional | | 3 | — | `funnel §4`, `wf §5.1.b–d` |
| **BP10** | **Capture tasks** — stage a batch across the three Eisenhower sections and commit them to Backlog | user, at intake | | 7 | ✓ | `wf §6.2` |
| **BP11** | **Work the board** — read which boards are in play, move, rank and re-prioritize tasks, edit content, re-tag in Backlog, archive individually, delete | user, continuously | | 9 | ✓ (step 2) | `wf §6.1`, `wf §6.3`, `arch §8 UC2` |
| **BP12** | **Manage board columns** — rename, insert before/after, reorder, change role, archive all, delete with or without cascade (BR-59: one Backlog, ≥1 Done) | user, rare | | 6 | — | `wf §6.1`, `arch §8 DeleteColumn`, `arch §10` |
| **BP13** | **Close out the day** — confirm what is in Done and what is still open (BR-33), write day notes, archive the completed, optionally reset the open ones (BR-35) | user, end of day | | 3 | ✓ (step 4) | `funnel §Archive`, `wf §6.4` |
| **BP14** | **Roll the day over** — at local midnight advance which day is current, so the day focus in play becomes the new date's; creates nothing (BR-44) | Clock | **`scheduler pool`** + Bearing; no user lane | 1 | ✓ | `funnel §Day rollover`, `arch §12 Q1` |
| **BP15** | **Review archived material** — browse, filter and unarchive archived ideas, goals or tasks (BR-25) | user, occasional | | 6 | — | `wf §7.8` |
| **BP16** | **Consult the advisor** — ask in the context of the active view and selection, read the structured suggestions, apply or dismiss them individually or per response | user, opportunistic | + **Advisor service** as a black-box pool | 5 | — | `wf §7.5` |

**Calibration.** Sixteen processes over ~85 distinct interactions averages five or six a process, with
the spread running from BP14's single step to BP05's thirteen — deliberately fine rather than coarse,
and the opposite of the one-BP-with-21-gateways failure ADR-040 warns about. **BP14 is the one to
watch**: a single-step clock process is a BPMN only because the trigger is an actor that needs a lane,
and it may read better as a start event inside BP08 — the Software Architect's call.

**Not business processes, recorded so their absence is a decision.** The About, Keyboard-shortcuts and
Help dialogs carry no system interaction (static content). Toasts, skeleton loaders and empty states
are presentation of other processes' outcomes. The shared delete confirmation is a step inside whichever
process owns the entity, never a process of its own. **There is no Settings process** — there is no
Settings view (BR-76).

**Cross-process reuse** — several interactions are defined once and reused: *Record vision and
mission* (BP01, BP02), *Delete a theme / an idea / a routine* with their cascades (BP02, BP03, BP04),
*Read the selectable tags* (BP08, BP10), *Archive a task* (BP11, BP13), *Unarchive* (BP15 against all
three types), and the day check-out itself, reachable from Execution and from a focus view (BP13). Each
keeps **one** minted `SIxx.yy` across every process that triggers it (ADR-066), with `reuse.yaml`
recording the rationale.

**Economic framing (the business map) is OWED** — see §10; the price tag per BP is a subjective value
(QB-09).

---

## 6. Candidate System Interactions

**No ids are assigned here.** SI ids are **minted once at Mockup and never renamed** (ADR-066,
`design-artifact-conventions`), and there is no provisional id form. The list below names the system
interactions the screens imply, so the Mockup stage can mint against a known inventory. Every screen
action is an SI; every call from a business-process pool into the System pool is an SI. **An interaction
reached from more than one business process is one system interaction, not several** — several groups
below name the same one.

Grouped by the candidate BP that owns them:

**BP01 — "Start Bearing for the first time"** — Resolve the data folder · Adopt a data folder already under
Bearing's version control · Bring an existing, unversioned data folder under version control ·
Create a data folder and bring it under version control · Report that a new data folder was created ·
Report a data folder that is versioned but not by this Bearing · Seed the starter themes ·
Record vision and mission · Skip a wizard step · Skip the wizard · Complete the wizard

**BP02 — "Maintain life themes"** — Create a theme · Rename/recolour a theme · Reorder themes ·
Delete a theme (with and without cascade) · Read the themes overview with its goal and routine counts ·
Record vision and mission · Read vision and mission

**BP03 — "Maintain routines"** — Define a routine · Amend a routine · Pause a routine · Resume a routine ·
Reorder routines within a theme · Delete a routine (with and without cascade)

**BP04 — "Capture and curate ideas"** — Capture an idea · Validate a proposed tag · Amend an idea ·
Refine idea notes (auto-save) · Reorder ideas *(a grouping convenience, no funnel consequence — BR-88)* ·
Re-affiliate an idea to a theme · Archive an idea · Delete an idea (with and without cascade) ·
Read the ideation overview (filtered, sorted, theme-scoped)

**BP05 — "Commit to and maintain a goal"** — Frame a goal · Promote an idea to a goal · Amend a goal ·
Link an idea to a goal · Unlink an idea from a goal · Add a progress measure · Amend a progress
measure · Remove a progress measure · Reorder progress measures · Reorder goals within a theme ·
Read the goals overview · **Archive a goal** (directly, independent of check-out — BR-23) · Delete a goal (with and without cascade over its linked ideas, BR-15)

**BP06 — "Track goal progress"** — Record a numeric progress check-in · Record a boolean progress
check-in · Read a progress measure's check-in history

**BP07 — "Close out a goal"** — Read a goal's check-out proposal (auto-inferred per-measure statuses) ·
Close out a goal, archiving it or not (BR-30) · Seed a follow-up goal from a check-out

> **Close-out and archiving are not the same act, and unarchiving is the inverse of neither.** Closing
> out records a judgment (outcome, per-measure statuses, retro) and *offers* to archive as its closing
> action. Unarchiving brings a goal back into the working set; it does **not** revoke the check-out
> record, which stays with the goal. So the inverse pair is archive/unarchive, and close-out sits
> beside it — a goal can be archived directly, at any time, whether it was checked out or not
> (BR-23, QB-32).

**BP08 — "Set a day's focus"** — Read a day's selectables grouped by theme · Set a day's focus ·
Schedule the day's routine tasks · Read a day's focus summary *(each is scoped by **which** day, since
the day is reached from a period view, BR-40/BR-93 — not by which view it was reached from)*

**BP09 — "Review focus history"** — Read the week overview · Read the month overview · Read the year
overview *(each carries that period's theme balance, BR-47 — it is not a separate read; and each is
parameterized by **which** week/month/year, so previous, next and back-to-current are that same read,
not three more. Switching scope is one of these three reads; there is no day-scoped read, BR-93)*

**BP10 — "Capture tasks"** — Read the selectable tags · Stage a task draft · Amend a staged task draft ·
Reorder staged task drafts · Discard a staged task draft · Discard all staged task drafts ·
Commit the staged tasks

**BP11 — "Work the board"** — Read which boards are in play (BR-50) · Read a board, and the lineage of the
work on it — the theme it belongs to, the goal it serves, the tag it is filed under (UX-11 is where that
lineage is shown) · Rank a task · Prioritize a task · Move a task ·
Amend a task's content (its title and description) · Re-tag a task, Backlog only (BR-64) ·
Archive a task *(individually, BR-23)* · Delete a task

**BP12 — "Manage board columns"** — Rename a column · Insert a column · Reorder columns ·
Change a column's role · Archive every task in a column (an archiving path for tasks, BR-23) ·
Delete a column (with and without cascade)

**BP13 — "Close out the day"** — Read the day's completed and in-progress tasks · Save the day-notes
draft · Close out the day

**BP15 — "Review archived material"** — Read the archived ideas (filtered) · Unarchive an idea ·
Read the archived goals (filtered), each with its check-out record · Unarchive a goal ·
Read the archived tasks (filtered) · Unarchive a task

**BP14 — "Roll the day over"** — Roll the day over *(advance the current day; the day focus in play becomes the new date's. One interaction, and it writes no task — BR-44)*

**BP16 — "Consult the advisor"** — Open an advisor conversation with its context and selection ·
Ask the advisor · Apply a suggestion (ten catalog types) · Dismiss a suggestion · Clear the
conversation

> Count: roughly **85 distinct system interactions** across the **16** business processes of §5 —
> §6's groups sum to 96 before cross-process reuse is collapsed. The count is a scope signal worth
> attention before Mockup opens.

---

## 7. Screen model inventory

The surfaces that become the screen models in `docs/02_Business/06_Screen-Models/`. Every one has an
ASCII wireframe and design notes in the source; the inventory is complete at view/dialog level, and
drill-down into individual fields and component states was explicitly out of scope for the sketch
(`inv` preamble) **except** where a field is structural (the Tag field's four states, the two progress-check-in
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
| Progress check-in | dialog | `§4.3` | numeric variant · boolean variant |
| Goal check-out | dialog | `§4.4` | — |
| Focus view — Week (smallest scope, BR-93) | view | `§5.1.b` | populated · no history (`§7.6`) · current week · past week · future week |
| Focus view — Month | view | `§5.1.c` | populated · no history · current month · past month · future month |
| Focus view — Year | view | `§5.1.d` | populated · no history · current year · past year · future year |
| Day focus editor (opened by selecting a day in any focus view) | panel/dialog — shape owed | `§5.1.a` | today · past day · future day · nothing to focus on (`§7.6`) |
| Execution view | view | `§6.1` | populated · collapsed column · empty board · no tasks anywhere (`§7.6`) |
| Column overflow menu | menu | `§6.1` | — |
| Task context menu | menu | `§6.1` | Backlog variant · in-motion variant |
| Task creation (batch) | dialog | `§6.2` | staged · empty · tag picker open/filtered/no-tags |
| Task editor | dialog | `§6.3` | in Backlog · in motion |
| Day check-out | dialog | `§6.4` | — |
| Onboarding wizard (first run) | view | `§7.1` | step 1 themes · step 2 vision & mission |
| About | dialog | `§7.3` | — |
| Keyboard shortcuts | dialog | `§7.4` | — |
| Advisor panel | split panel | `§7.5` | thinking · streaming · pending card · applied · dismissed · superseded · apply-failed · network error |
| Archive views (Ideation / Goals / Execution) | view | `§7.8` | per type, with filters |
| New-data-folder notification | modal | `§7.7` | — |
| Toasts | overlay | `§7.7` | success · error-with-retry · stacked (max 3) |
| Skeleton loaders | overlay | `§7.7` | — |

**There is no Settings view** (BR-76) — recorded here so its absence is a reviewed decision, not an
omission.

**There is no day-scoped focus view** (BR-93) — the same kind of reviewed absence. Every focus view
carries the same two controls, inventoried once instead of per row (BR-46): **step the period**
(previous · next · current) and **switch the scope**. The day focus editor holds `§5.1.a`'s content;
its **shape is owed** — inline, side panel or dialog is for the screen models to decide.

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
| Durability | Drafts survive crashes; recovery after accidental data loss is a filesystem operation the user performs, not an app feature. | `arch §4`, `wf §7.7` |
| Integrations | Exactly one external dependency: the advisor service. Everything else is local. | `arch §4` |
| Offline tolerance | The app works fully offline. **The advisor follows its configured model**: a local model works offline, an online model does not — and then the user is simply out of luck, with the inline error and retry already specified. No queuing, no fallback, no second model (SA 2026-10-06). | `wf §7.7`, SA 2026-10-06 |
| Window | **Minimum** window size 1024 × 640 px — a floor on how *small* the window may get, enforced by the shell, which refuses to resize below it. There is **no maximum**: the upper bound is the display, and the layout is expected to use whatever size it is given. Comfortable ≈ 1280 × 720; ≈ 1600 × 720 with the advisor open — those two are targets the layout is designed around, not limits. | `wf §7.9`, SA 2026-10-06 |
| Form factors | Desktop only. No mobile layout, no tablet target, no vertical reflow. Touch input is supported through 44×44 hit targets but not optimized for. | `wf §7.9` |
| Accessibility | Colour is never the only signal; every focusable element has a visible keyboard focus ring; the full keyboard map is first-class; `prefers-reduced-motion` is honoured. | `wf` guidelines #1, #12, #14 |
| Latency budget | The UI is optimistic and push-fed, so local mutations must feel instant; the advisor is the only surface allowed to show "thinking". | `arch §5` |
| Cost | Advisor token cost is the only running cost. No envelope stated — **owed at Contract**. | — |
| Operator | The user. No administrator, no ops role, **no telemetry backend** — the sources' “log for telemetry” means a **local log file**, read by the user or nobody. | `wf §7.5`, SA 2026-10-06 |

---

## 9. Candidate example data (walkthrough seed)

The wireframes carry one coherent dataset throughout. It is **candidate data, not finished
expectations** (ADR-040 §2) — but it is consistent across 2200 lines and is the natural seed for the
behavioural spike, the Mockup walkthroughs, and later the spec layer's labeled seed rows (ADR-033).

- **Reference date:** Monday, 11 May 2026.
- **Themes:** Health · Career · Learning · Relationships · Personal — the pre-seeded set; the
  onboarding wizard names the first one **Career** too (QB-08).
- **Vision:** *"A focused, generous engineer who ships things he's proud of, while staying healthy and
  present with the people he loves."* **Mission:** *"Build durable tools and the discipline to use them daily."*
- **Ideas:** `#bearing-v2` "Build Bearing v2" (Career, → goal) · `#tauri` "Migrate to Tauri" (Career,
  unlinked) · `#10k` "Run a 10k" (Health, → goal) · `#cold` "Try cold plunges" (Health) ·
  `#korean` "Learn Korean (A2)" (Learning) · `#pottery` "Take pottery classes" ·
  `#kitchen` "Renovate kitchen" (untagged). Counts quoted: 47 ideas total, 12 goal-linked, 35 unlinked,
  18 untagged.
- **Goals** (the examples are OKR-shaped, so their progress measures appear as "KR1…KR4"): "Run a 10k by Jun 2026" (Health, Q2 2026, linked `#10k`) with KR1 *Run 5k under 28 min*
  (numeric, target 28 min, ↓, 73%), KR2 *Complete 12-week training plan* (numeric, target 12 weeks, ↑,
  50% → 73% at check-out), KR3 *Average 25 km/week running* (numeric, 100% ✓), KR4 *Sub-60-min 10k race
  day* (boolean, Not done) · "Reduce body fat to 15%" (Health, Q2 2026, theme-only) ·
  "Ship Bearing v2 by Q3 2026" (Career, Q3 2026, linked `#bearing-v2`).
- **Progress check-in history:** Apr 16 → 2/12 (17%) · Apr 30 → 4/12 (33%, *"First long run done"*) ·
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
| G-01 | **Business-process BPMNs** — 16 tagged `.bpd` sources → L1 + L2, one per BP in §5, in `docs/02_Business/01_Business-Processes/` | interview-architect | §5 names the required set with `BP01`…`BP16` assigned; nothing is drawn. Needs the Software Architect's confirmation of the cut first (BP14 is the one he may fold into BP08). |
| G-02 | **System Interaction markdowns + activity diagrams**, with **minted `SIxx.yy` ids** | interview-architect | §6 lists ~85 distinct interactions across the 16 BPs. Ids mint at Mockup (ADR-066) — do not pre-assign. |
| G-03 | **Screen models** in the project's own format in `docs/02_Business/06_Screen-Models/` | interview-architect | §7 inventories the 30+ surfaces; the ASCII wireframes are the input, not the artifact. |
| G-04 | **Provisional Sequence Map** in `docs/02_Business/03_Sequence-Map/` | `seqmap generate` | Derived from the BPs and screen models. |
| G-05 | **Business map** in `docs/02_Business/05_Business-Map/`, **with a price tag per BP** | Software Architect | The price tag is a **subjective value**: the most the Software Architect would pay for that BP if he had to pay (**QB-09**). ⚠ He also notes the method fits personal projects poorly — the numbers rank scope, they do not justify it. |
| G-06 | **LLM-authored behavioural spike** + its mandatory invented-decisions log (ADR-044) | interview-architect | The spike is what the stakeholder walks at Intent (ADR-045: flows early, data late). |
| G-07 | **Walkthrough capture** — the flows taken, the values entered, the outcomes confirmed | Software Architect | §9 is a candidate seed, not an approved walkthrough. |
| G-08 | **Q&A ledger** `Bearing.method/qa.yaml` | architect / Software Architect | **Does not exist.** `qa check` enforces no open blocking entry at Intent. §12's 23 entries are the initial content. |
| G-09 | **Business-rules registry** (ADR-043) | interview-architect | §4's ~90 rules are the content; the registry is the capture-grade artifact the spike reads. |
| G-10 | **Volatility harvest** with provenance per entry | interview-architect | `arch §3` has the map; per-entry provenance ("every gateway, every *it depends*, every 1-of-N") is missing. Carried to the Blueprint document §2. |
| ~~G-11~~ | ~~The four source documents under version control~~ | ops | **CLOSED** 2026-10-04 — the sources moved to `docs/01_Planning/sources/` and are committed as business and design input. |
| ~~G-12~~ | ~~A provenance ruling on the four source documents standing in for recorded sessions~~ | Software Architect | **CLOSED** 2026-10-06 — they are the recordings (**QB-01**). |
| ~~G-13~~ | ~~One reserved-tag list~~ | interview-architect | **CLOSED** 2026-10-06 — `{routine, untagged, all}` (BR-07, **QB-02**). |
| G-14 | **Deletion cascade for goals** — `funnel.md` and `wf §2.4` declare goal deletion cascade-free; the Software Architect reversed that on 2026-10-04. BR-15 is the statement of record | interview-architect | Not a contradiction between sources — a decision that supersedes them. |

---

## 11. Known contradictions between the source documents

Eight places where the sources disagree with each other. **Six are resolved; C-2 and C-6 remain** —
and neither needs a stakeholder ruling: both are slips to fix when the artifacts are authored. A
ruling is recorded here, not back into the source — a recording stays as spoken (QB-01).

| # | Contradiction | Where |
|---|---|---|
| ~~C-1~~ | ~~A detached goal has no theme.~~ **RESOLVED 2026-10-06** — a theme deletion that would orphan a goal or routine is rejected; `theme_id` stays required (BR-21, **QB-03**). | `arch §9` vs `funnel §Linking rules` |
| C-2 | **Deleting a goal "clears any Focus selections referencing it"** — but day focus holds selected *idea* and *routine* ids, never goal ids. | `wf §2.4` vs `funnel §Entity reference fields` |
| ~~C-3~~ | ~~Reserved-tag list differs across documents.~~ **RESOLVED 2026-10-06** — `{routine, untagged, all}` (BR-07, **QB-02**). | `funnel`, `wf §3.2` vs `arch §8` |
| ~~C-4~~ | ~~Day check-out's task lists are “derived from task movement timestamps”, but Task carries none.~~ **RESOLVED 2026-10-06** — both lists are current-state predicates (BR-33, BR-35, **QB-23**), so no timestamp is needed and the sources' “moved to Done today” wording is superseded. | `wf §6.4` vs `arch §8` |
| ~~C-5~~ | ~~Per-task Archive action.~~ **RESOLVED 2026-10-06** — the action exists (BR-23, **QB-22**); `wf §6.1`'s context menus simply omit it. | `wf §7.8` vs `wf §6.1` |
| C-6 | **A "Data-path-missing dialog" with radio options** ("Use a different existing data folder") appears in the focus-landing table and in guideline #17, contradicting `§7.2`/`§7.7`, which offer only `[ Quit ]` / `[ Continue ]` and explicitly refuse folder picking. | `wf §7.10`, guideline #17 vs `wf §7.2`, `wf §7.7` |
| ~~C-7~~ | ~~Tab-level preferences have no home.~~ **RESOLVED 2026-10-05** — remembered interface state is kept in a version-control-excluded subdirectory of the data folder (BR-92). It is not a setting, so removing the Settings document type cost nothing. | `wf §3.1` vs `arch §11` |
| ~~C-8~~ | ~~“Untagged” names two different things.~~ **RESOLVED 2026-10-06** — Ideation's section becomes **Unthemed** (it holds theme-less ideas, which all have tags); Execution's **Untagged** board keeps its name, where the word is literally true (BR-03, **QB-21**). | `wf §3.1` vs `wf §6.1` |

One further single-document slip, noted for the authoring pass rather than as a ruling: the Week-mode
wireframe shows five of seven day cards (`wf §5.1.b`). (The Themes-tab counter's scope was the other
one; it is answered — active only, BR-95.)

---

## 12. Business questions — Q&A ledger candidates (business tier)

**All thirty-two are answered** (the last of them on 2026-10-06); the table is the record of what was
asked and what was decided, to be appended to `Bearing.method/qa.yaml` once it exists. No business
question blocks the Intent gate any more — what remains owed is artifacts, not answers (§10).

| # | Question | Blocks |
|---|---|---|
| ~~QB-01~~ | ~~Do the four source documents satisfy the provenance requirement, standing in for recorded stakeholder sessions?~~ **ANSWERED 2026-10-06: yes — they are this project's recordings.** As imperfect as any recording: some of what they state is overruled. | — |
| ~~QB-02~~ | ~~What is the final reserved-tag set?~~ (C-3) **ANSWERED 2026-10-06: `{routine, untagged, all}`** — BR-07. | — |
| ~~QB-03~~ | ~~When a theme is deleted without cascade, what happens to its goals and routines, whose theme is required?~~ (C-1) **ANSWERED 2026-10-06: the deletion is rejected** — BR-21. | — |
| ~~QB-04~~ | ~~Is the default landing tab Focus or Execution?~~ **ANSWERED 2026-10-06: Focus** — BR-48. Opening the last page used instead is a possible later change, not now. | — |
| ~~QB-05~~ | ~~What is “auto-promote-priority”, named as a hardcoded default but defined nowhere?~~ **ANSWERED 2026-10-06: it is dropped** — it has no stated meaning, so it is removed from the gate documents and ignored where `wf §7.2` names it. | — |
| ~~QB-06~~ | ~~Is remembered interface state kept, and where does it live?~~ **ANSWERED 2026-10-05: it is kept**, in a subdirectory of the version-controlled data folder that is explicitly excluded from version control — BR-92. This resolves C-7: the state the sources called a "preference" is not a setting and never needed the deleted Settings type. | — |
| ~~QB-07~~ | ~~“Log for telemetry” appears twice for advisor payload failures, but there is no telemetry backend and no operator.~~ **ANSWERED 2026-10-06: a local log file.** | — |
| ~~QB-08~~ | ~~Is the first theme called **Work** (onboarding) or **Career** (every other example)?~~ **ANSWERED 2026-10-06: Career**, everywhere. | — |
| ~~QB-09~~ | ~~What does a “price tag per business process” mean for a single-user personal tool?~~ **ANSWERED 2026-10-06: a subjective value** — the most the Software Architect would pay for that BP if he had to pay. He notes the method fits personal projects poorly; the tags therefore rank scope rather than justify it. | G-05 |
| ~~QB-10~~ | ~~What does a routine's schedule actually advise?~~ **ANSWERED 2026-10-06: nothing — it computes.** Routines are pre-scheduled, so the schedule says whether a routine is **due** on a given date, and **overdue** when it was due earlier and not selected then. No advice rule is owed; what the clock still never does is create a task (BR-91, BR-42). | — |
| ~~QB-11~~ | ~~What does the **Custom** recurrence pattern mean?~~ **ANSWERED 2026-10-06: it is removed, and Yearly is added** — Daily · Weekly · Monthly · Yearly (BR-94). | — |
| ~~QB-12~~ | ~~For a goal that **has** a horizon, does the horizon passing without a check-out do anything?~~ **ANSWERED 2026-10-06: it subtly flags the goal as due** in the Goals view — a quiet signal, no auto-archive (BR-22), no advisor nudge required. | — |
| ~~QB-13~~ | ~~Must every progress measure be typed (numeric or boolean)?~~ **ANSWERED 2026-10-06: yes — numeric or boolean, always** (BR-28). The untyped third measure in `wf §4.2` is a drawing omission; the Goals view and the check-out already draw it with the numeric vocabulary. More types may come; none are foreseen. | — |
| ~~QB-14~~ | ~~When a goal has a time horizon, what granularities are admissible?~~ **ANSWERED 2026-10-06: the user's choice** — the product dictates none (BR-31). | — |
| ~~QB-15~~ | ~~Can an archived idea's tag be renamed to release the name?~~ **ANSWERED 2026-10-06: no — an archived idea is not editable.** Release the tag by unarchiving, editing and archiving again, or by deleting the idea (BR-05). | — |
| ~~QB-16~~ | ~~Does archiving an idea remove its tag from the Focus selectables and hide its board?~~ **ANSWERED 2026-10-06: both** (BR-43). | — |
| ~~QB-17~~ | ~~Must every board have exactly one Backlog column?~~ **ANSWERED 2026-10-06: exactly one Backlog and at least one Done**; Done is uncapped, Backlog is not (BR-59). | — |
| ~~QB-18~~ | ~~Does the Themes-tab goal counter count active goals or all goals ever?~~ **ANSWERED 2026-10-06: active only** — archived goals are not counted (BR-95). | — |
| ~~QB-19~~ | ~~Does the advisor need to work offline?~~ **ANSWERED 2026-10-06: it follows its configured model** — local model, works offline; online model with no connection, tough luck (the inline error and retry already cover it). No queuing and no fallback. | — |
| ~~QB-20~~ | ~~Is the advisor's conversation history user data or ephemeral session state?~~ **ANSWERED 2026-10-06: journaled, but not under version control.** | — |
| ~~QB-21~~ | ~~“Untagged” labels two unrelated things — rename one?~~ (C-8) **ANSWERED 2026-10-06: Ideation's section is renamed “Unthemed”**; Execution's `Untagged` board keeps its name. Theme-less ideas are legal and reachable two ways (BR-03), so the section stays — only its label was wrong. | — |
| ~~QB-22~~ | ~~Can a task be archived individually, outside the day check-out?~~ (C-5) **ANSWERED 2026-10-06: yes** — from the task context menu (BR-23). | — |
| ~~QB-23~~ | ~~What makes a task appear in the day check-out's two lists?~~ (C-4) **ANSWERED 2026-10-06: current state, not movement.** Completed = **currently in Done**, whenever it got there; still open = **past Backlog and not Done**, whenever it was last touched (BR-33, BR-35). | — |
| ~~QB-24~~ | ~~Does deleting a theme's ideas through the theme cascade also take those ideas' tasks?~~ **ANSWERED 2026-10-05:** yes, as a third independent opt-in defaulting to keep — the theme gesture offers goals-and-routines, ideas, and tasks separately (BR-13). | — |
| ~~QB-25~~ | ~~When a check-out resets a task, does it return to its exact old position or just to its old bucket?~~ **ANSWERED 2026-10-06: to the top of its triage section** — neither. Among tasks reset together, the further right their column, the higher they land; same-column tasks keep their relative order (BR-35). | — |
| ~~QB-26~~ | ~~When does a completed routine task archive itself?~~ **ANSWERED 2026-10-06: it does not.** Routine tasks get no special treatment — auto-archiving is dropped; they archive by the same acts as any task (BR-61, BR-22, BR-23). | — |
| ~~QB-27~~ | ~~The product has two opposite draft semantics.~~ **ANSWERED 2026-10-05:** there is one — **a draft survives abandonment** (BR-37, BR-63). The Software Architect withdrew the discard ruling of 2026-10-04: *"keeping the draft around is consistent… I didn't like the original wording."* Goal check-out's discard (BR-32) stands as a stated exception with its own reason, not as a second semantic. | — |
| ~~QB-28~~ | ~~Is a goal with no linked idea legitimate or flagged?~~ **ANSWERED 2026-10-05: both.** The state is legitimate and it is flagged, so that no idea being assigned is obvious. The flag keys off the current state, so the product never has to remember that a goal once had an idea. | — |
| ~~QB-29~~ | ~~Does a routine occurrence arise from being due, or from being due and selected?~~ **ANSWERED 2026-10-05: from being selected.** Selecting a routine ensures one outstanding task exists; due and overdue get identical treatment; re-selecting never duplicates; the clock creates nothing (BR-42, BR-44, BR-91). | — |
| ~~QB-30~~ | ~~What happens to a data folder version-controlled by something other than this Bearing?~~ **ANSWERED 2026-10-06: refuse to adopt it** — an older Bearing's repository and a never-Bearing one alike; the user moves the folder manually. No v1 migration; within-v2 migration comes later and is not a first-open concern (BR-80). | — |
| ~~QB-31~~ | ~~What is manual ordering of ideas for, and over what set?~~ **ANSWERED 2026-10-06: for grouping related ideas together, and nothing else.** Ideas end up only partly ordered on purpose; the order carries no priority and no consequence elsewhere in the funnel (BR-88). | — |
| ~~QB-32~~ | ~~Can a goal checked out *without* archiving be archived afterwards?~~ **ANSWERED 2026-10-06: yes — a goal can be archived at any time**, independent of check-out, which only offers it as a closing action. Typically it happens after check-out, by habit (BR-23, BR-30). | — |

---

## 13. Downstream — what this gate hands on

- **To Blueprint:** the volatility harvest (`arch §3`, recorded here as a Discovery side-channel), the
  entity relationships of §2.1's Graph B (data references), the business rules of §4 as the behaviour the model must realize,
  and the frozen SIs as the use cases to decompose against.
- **To Contract:** §4's concrete thresholds and defaults, §9's example dataset as seed-row candidates,
  §8's operational concerns as deployment-decision input, and the stack intent (Svelte + C#).
- **To Acceptance:** the daily hot path (§1.2) as the primary acceptance flow, the approved walkthroughs
  once captured, and the UI craft rules carried in the Acceptance document.
