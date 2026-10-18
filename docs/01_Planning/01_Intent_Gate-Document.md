# Bearing v2 — Intent Gate Document

> **Gate.** `intent` — *Bless business design; the business intent is const* (ADR-040 §1, ADR-064).
> **Freezes.** BPMNs + System Interactions, screen models, the approved walkthroughs with their
> example data, the business map.
> **Reviewers.** Stakeholder + Software Architect (here the same person).
> **Status.** Pre-gate. Material captured, artifacts not yet authored. Nothing const.

**Provenance note (ADR-040 §1, citing ADR-028).** The business intent reaches the factory not as
interview recordings but as documents authored by the Software Architect, who is also the product's
domain expert and its only user. **They are this project's recordings** (QB-01) — valid provenance, and
as imperfect as any recording: some of what they state gets overruled, and §11 holds nine such places.
Every statement below cites one by prefix and that document's own heading number — `funnel §…`
(`sources/funnel.md`), `arch §…` (`sources/architecture.md`), `wf §…` (`sources/ui-wireframes.md`),
`inv` (`sources/ui-inventory.md`, no section numbers).

**A fifth source, authored differently.** `act §…` (`sources/activity-planning.md`) is not the
Software Architect's own writing: it was authored for him from his statements over nine interview
rounds, the four originals being silent on activities, and every line in it is marked SA (he said it)
or INFERRED (the author's reading, owed a confirmation). It carries the same recording-grade authority
as the others and is the provenance for the Course stage, for `BR-96`…`BR-111`, and for BP17.

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
| **Version control (git)** | External system | The data folder is a git repository and every change to the plan is a commit. Drafts (§3) and remembered interface state (BR-92) are excluded from it (`arch §2`, `wf §7.2`) |

### 1.2 The daily hot path — the primary flow (`arch §1`)

1. Set daily focus (Focus tab)
2. Execute tasks on the selected boards and on Chores when it carries open work (Execution tab)
3. Capture / refine ideas opportunistically during execution
4. Check out the day at end-of-day
5. Review goals occasionally (out-of-band cadence)

Steps 1–4 are the per-day reality; everything else is colder. This ordering is the scope-and-priority
statement for the business design: the funnel's right-hand side is hot, its left-hand side is
settings-adjacent.

---

## 2. The funnel — the business design's spine

Six stages, each answering exactly one question at one time horizon and one volatility
(`funnel §Mental model`, and `act §2` for Course):

| Stage | Question | Horizon | Volatility |
|---|---|---|---|
| Theme | What matters to me in life? | years / decades | very low |
| Idea | What might I want to do? | months / years (or never) | high — many die |
| Goal | What am I committing to? | a quarter or a year when time-bound; open-ended otherwise | medium |
| Course | What has to be built or done, and in what order? | weeks / months | medium |
| Focus | What gets attention today? | day / week | very high |
| Execution | What's the next task? | hours / days | very high |

Rendered as six chevron-connected tabs carrying the left-to-right flow
(`funnel §Tab structure`, `wf §1`), plus a seventh outside the chevron:

```
[ Themes ] › [ Ideation ] › [ Goals ] › [ Course ] › [ Focus ] › [ Execution ]      [ Routines ]
  values      candidates     OKRs       projects     today       kanban            upkeep
```

**Routines stand beside the flow, not in it** (SA 2026-10-13): a routine has no theme and is
maintenance rather than achievement (BR-02), so its home is a tab of its own, outside the chevron
and downstream of nothing (BR-10). The chevron still carries six stages.

Course is the sixth tab (QB-39): the home of projects and of the activities a project is planned as,
and the one surface that both plans the order of activities and tracks progress through them. One
stage, two entities — so the six stages above do not map one-to-one onto Graph A's nodes, and the
medium volatility in the table is the project's: an activity's is higher, since a plan is re-cut as
the work is understood. The tab is deliberately not called *Project Design*, since it is not only
about designing but also about executing a plan per project (`act §9`).

### 2.1 Two graphs, deliberately kept apart (`funnel §Linking model`)

**Graph A — funnel order** (workflow / time of creation; "downstream" always means to the right):

```
Theme ──► Idea ──► Goal ──► Project ──► Activity ──► Task
                               ▲           ▲
            Focus selects projects and activities for one day
```

A project's parent may be any of the three things to its left — an idea, a goal or a progress
measure — or nothing at all (BR-96), so the arrow into Project is one link with several possible
sources rather than a fixed rung. The Activity rung is conditional too: only an *activity-based*
project has activities, and a *simple* project runs straight from project to task (BR-97). Only Task
is unconditional — every task sits on exactly one board, and a board's owner is an activity, a
simple project, or nothing at all in the case of the built-in Chores board (BR-101, BR-102,
BR-103).

**Graph B — data references** (who holds a reference to whom):

```
Theme ◄──── Idea            (idea.theme_id, optional)
  ▲
  │ (goal.theme_id, required)
Goal ────► Idea             (goal.linked_idea_ids, 0..N)

Project ──► Idea | Goal | Progress measure   (one optional parent, BR-96)
Activity ─► Project                          (required — activity-based projects only, BR-97)
Activity ─► Activity                         (depends-on, 0..N, same project only, BR-99)
Board ────► Activity | Project | —           (its owner; nothing at all for Chores — BR-101)
Column ───► Board                            (a lane, carrying a role and a name — BR-58)
Task ─────► Board                            (exactly one, never two — BR-103)
Task ─────► Column                           (exactly one, on that board — BR-58)
Task ─────► Routine                          (when spawned)
```

Goal ↔ Task is indirect by design (`funnel §Goal ↔ Task`) with the chain being
 `Task ──► Activity ──► Project ──► its parent` in an activity-based project and
`Task ──► Project ──► its parent` in a simple one (BR-97).
Whether that parent is a goal, a measure, an idea or nothing is the project's business. There is no
direct goal → task reference. A task on Chores has no chain at all (BR-102).

---

## 3. Business vocabulary — the entities

> What the product **keeps** is this table plus [`11_Record-Inventory.md`](11_Record-Inventory.md);
> what it **computes** from them is [`13_Derived-Data-Inventory.md`](13_Derived-Data-Inventory.md),
> each value with the rule that governs it. The product loads the first at start-up and derives
> the second from it, which is why no process draws a page read (SA 2026-10-17).

Business meaning and lifecycle only. The *storage* shape of each (document type, path, tier) is the
`VersionedDocumentAccess` secret and belongs to the Blueprint gate; the field-level reference lists
in `funnel §Entity reference fields` are carried forward there as DTO input.

| Entity | What it is, in the user's terms | Archivable? | Deletable? |
|---|---|---|---|
| **Theme** | An evergreen life area that is never "completed" (Health, Career, Relationships). Edited 2–4× per year. Groups its goals and the ideas affiliated to it; owns the colour that propagates downstream. | ✗ | ✓ (cascade offered) |
| **Vision / Mission** | Optional reflective prose one rung *above* themes — "who you want to become", "what you're here to do". Feeds the advisor's higher-frame critique when set; omitted when unset. Nothing depends on it. | ✗ | n/a (reset by emptying) |
| **Idea** | A candidate for future realization. Most never become goals — that is the point. One idea may yield 0..N goals and 0..M projects (`act §1`). | ✓ | ✓ (cascade or reject, BR-14) |
| **Project** | Work being done on something (QB-33). It carries one optional parent, whose target may be an idea, a goal or a progress measure, or be empty: a project may realize an aspect of an idea or the whole of it, serve a goal that has no idea behind it, or stand alone like a gardening project. Every project is of one of two kinds, declared at creation (BR-97): *simple*, which has no plan, or *activity-based*, which has one. | ✓ (BR-112) | ✓ (cascade or reject, BR-114) |
| **Plan** | The ordering of one project's activities, hanging on the project. It does two jobs with one surface: it says what has to be done in what order, and it tracks how far the project has got (`act §1`). | — | — |
| **Course** | The surface that holds projects and their plans, and where activities are created and ordered (BR-105). What it shows is §7's. | — | — |
| **Goal** | A commitment: an objective, anchored to exactly one theme, linked to 0..N ideas, and carrying 0..N progress measures. A time horizon is optional: a goal may be time-bound (e.g. a quarter, a year, due on a specific date) or open-ended. | ✓ (directly, at any time — BR-23) | ✓ (cascade or reject, BR-15) |
| **Progress measure** | A measurable indicator of progress toward a goal, and the thing a goal is judged against. Typed numeric — a start value, a target, a unit and a direction ↑/↓, with a current value initialized to the start — or boolean (done / not done, starting at not done). Tracking the current value against the target is the whole point of it, and a check-in is what moves the current value. OKR's *key result* is one realization of this concept, not the concept itself, i.e. the goal-setting approach may change (BR-08), the need to measure progress does not. | ✓ (directly, at any time — BR-23; or with its goal — BR-112) | ✓ removed directly, nothing asked (BR-115), or with its goal (BR-15) |
| **Progress check-in** | One dated data point on one progress measure, with an optional note, which is what moves that measure's current value. History is append-only and keyed to the measure's identity, never to its display position. Append-only is what decides a second check-in on a date already covered: it is another data point beside the first, never a correction of it. | with its measure (BR-112) | with its measure (BR-115) |
| **Routine** | An evergreen recurring practice that doesn't warrant a goal. Maintenance, not achievement. Stands beside the funnel rather than inside it: maintenance, not achievement, so it has no theme and lives in a view of its own (BR-02, BR-10). Pausable via an Active toggle. | ✗ | ✓ (cascade offered, BR-16) |
| **Day focus** | Per-day state: which projects, activities, and routines get attention on one date (BR-41). Not an entity with downstream ownership. The Chores board joins the day unselected, while it carries open work (BR-107) — derived, never stored. | ✗ | — |
| **Activity** | A discrete, finishable piece of work between a project and its tasks, depending finish-to-start on other activities of the same project. In development work an activity is often one component, or one component per use case it supports, but also work that is not development at all (interviewing, architecture, a test plan, system testing). Carries a name, a state (Todo · InProgress · Done) that the Course page owns alone (BR-109), and its own notes field. It owns a board (BR-101). Activities are flat: finer granularity means more activities, never sub-activities (BR-98). Exists only in an activity-based project (BR-97). | ✓ — with its project (BR-112); not separately | ✓ (cascade or reject, BR-104) |
| **Task** | A unit of work on exactly one board (BR-103), carrying an Eisenhower priority and a column. It need not belong to an activity, or to any project (QB-35). | ✓ | ✓ (no cascade) |
| **Board** | A Kanban surface, identified by its owner: an activity, a simple project, or nothing at all — the one built-in Chores board, which holds every task with no project behind it, routine-spawned and one-off alike (BR-49, BR-101, BR-102). | with its owner | with its owner |
| **Column** | A lane on a board, carrying a *role* (`Backlog` / `Todo` / `InProgress` / `Done`) separate from its user-editable name. Capture's three *priority columns* are not columns in this sense and are kept by nothing: they are how that surface lays the three priorities out (BR-53, BR-57). | — | ✓ (cascade or reject) |
| **Check-out log** | The record one work check-out writes, covering everything since the check-out before it (BR-33): the notes written while that span was open, its completed list and its four figures (BR-125). Appended once per check-out and never rewritten (BR-36). A day is explained by the log whose span covers it, and a day may be covered by more than one, or by none yet (BR-38). | — | — |
| **Goal check-out** | The closing record of one goal: overall outcome, per-measure statuses with notes, what-worked / what-didn't retro. Stays attached to the archived goal. | — | — |
| **Suggestion** | One structured, actionable advisor proposal with a lifecycle `pending → applied / dismissed / superseded`. The conversation it belongs to is journaled but not version-controlled (SA 2026-10-06). | — | — |
| **Draft** | Any input the user has not committed yet, wherever it arises — a batch of staged tasks, check-out notes being written, a goal check-out in progress, an idea's notes as they are typed, any form being filled in, an unsent advisor question. The list is examples, not a boundary: if it is not committed it is a draft (BR-121). A draft survives abandoning the gesture, a crash and an app restart, and is not a commit: nothing it describes takes effect until the gesture is completed, and no draft is version-controlled (BR-121). Resuming one is a convenience, never part of the planning history. | — | — |
| **Interface state** | How the product was last left — orderings, what was collapsed, the board last worked on. Remembered between sessions, deliberately outside the planning history (BR-92). Not authored by the user and not part of what the journal records. | — | — |

### 3.1 How a task reaches a theme

`Task ──► Activity ──► Project ──► its parent ──► Theme`, or
`Task ──► Project ──► its parent ──► Theme` where the project is simple and has no activity rung
(BR-97). The kind of project changes the hop count, never the destination, so every row below holds
for both kinds. A task on Chores reaches no theme at all: it hangs off a routine or off nothing, and a routine has no
theme (BR-02).

| A task's route to a theme | Reaches one? |
|---|---|
| its project's parent is a goal | always — a goal's theme is required (BR-01) |
| its project's parent is a progress measure | always — through that measure's goal |
| its project's parent is an idea | when that idea has a theme — optional, BR-03 |
| its project has no parent | no |
| on Chores, spawned by a routine | no — a routine has no theme (BR-02) |
| on Chores, captured one-off | no |

Colour propagation follows this same chain (BR-09).

---

## 4. Business rules and invariants

The rules a stakeholder can confirm or refute. Each cites its source. These are the candidate contents
of the business-rules registry (ADR-043) that the behavioural spike and later the spec layer must
honour.

These rules are about behaviour, not about the screens. How a rule is presented — which tab, which
view, which dialog, which button, which wording — is not stated here: that is the screen models'
business. Surface decisions already made live in [`05_UX-Directives.md`](05_UX-Directives.md); the
`wf §…` citations stay, so the realization the Software Architect sketched remains one hop away.

A `BR-` number is an identifier, not a position: a rule keeps its number for life and takes it along
when it moves to another sub-section, and a retired number is never reused. Ids are permanent on the
same principle as a System Interaction id (ADR-069, superseding ADR-066). Retired numbers, never reused: `BR-06`,
`BR-07`, `BR-11`, `BR-71`, `BR-73`, `BR-106`. A rule **voided** rather than retired keeps its row,
struck through with the reason: `BR-83`, `BR-123`. So 121 rules are live and the highest id is 129. `BR-71` — *applying or declining a whole answer at
once* — went on 2026-10-18: applying and dismissing each act on the one proposal the user picked,
which is what BR-85 says of every other gesture in the product.

### 4.1 Structure and linking

| # | Rule | Source |
|---|---|---|
| BR-01 | **Every goal has exactly one theme, required.** | `funnel §Linking rules` |
| BR-02 | **A routine has no theme.** Routines are maintenance rather than achievement, so nothing about a life area attaches to them — *"For Routines I don't care about themes, really"* (SA 2026-10-13, over the optional affiliation of 2026-10-11 and over `funnel §Linking rules`, which required one). Three things follow: they have a home of their own instead of living under a life area (BR-10), a theme deletion has no routine cascade (BR-13), and a task on Chores reaches no theme by any path (§3.1), so it carries no colour (BR-09). Nothing blocks defining a routine before any theme exists, as nothing ever did (BR-84). | `funnel §Linking rules`, SA 2026-10-11 |
| BR-03 | **An idea has 0..1 theme — the affiliation is optional.** A theme-less idea is legitimate and arises two ways: captured without a theme, or left theme-less when its theme was deleted with its ideas kept (BR-13). Affiliating it to a theme later is an ordinary act. Theme-less ideas are grouped together under the label Unthemed, for exactly as long as they are theme-less. | `funnel §2`, `wf §3.1`, `wf §3.2`, SA 2026-10-06 |
| BR-04 | **A goal links 0..N ideas, typically 1.** A goal with no linked idea is legitimate — it is judged on its progress measures alone — and is flagged as such, so it is obvious that no idea is assigned. The flag reads the current *state*, not the history: it makes no difference whether the goal was created that way or lost its idea to a deletion (BR-14). | `funnel §3`, `wf §4.1`, SA 2026-10-05 |
| BR-96 | **A project is an entity of its own, with exactly one optional parent.** The parent's target may be an idea, a goal or a progress measure, or there may be none. One parent, single-valued, and the user is never asked which kind of thing that parent is. There is no whole/aspect flag and no second link. | SA 2026-10-09, `act §1`, `act §8` |
| BR-97 | **A project is either *simple* or *activity-based*, and the user declares which at creation.** A simple project has no plan and gets one board of its own, created with the project. An activity-based project has a plan and gets one board per activity (BR-101), each created as its activity is (BR-65, BR-105). The kind governs nothing else: both kinds carry a parent the same way (BR-96), archive and delete the same way (BR-112, BR-114), and are focused the same way (BR-41). The declaration is for life — there is no migration between the kinds in either direction (QB-44) — so wanting the other kind means creating a project of that kind, and the work does not follow it, a task staying on the board it was created on (BR-64). | SA 2026-10-10, `act §1` |
| BR-98 | **An activity belongs to exactly one project, and activities are flat — there are no sub-activities.** Finer granularity is expressed as more activities: where work is batched use case by use case, there is one activity per component per use case it supports (`ExecutionManager · UC2,UC3`, `ExecutionManager · UC5`), not a tree. Bearing never hard-codes what an activity corresponds to — the granularity is the planner's. | SA 2026-10-09, `act §3` |
| BR-99 | **A dependency between activities is finish-to-start, and only within one project.** No start-to-start, no lag, no overlap, and no edge to an activity of another project. The result is a graph, not a chain: several activities may be ready at once. | SA 2026-10-09, `act §5`, `act §12` |
| BR-100 | **A dependency that would close a cycle is refused**, naming the path it would close. | SA 2026-10-09, `act §11` |
| BR-101 | **A board is identified by its owner, and there are three kinds of owner:** an activity, in an activity-based project — so that project's work sits on its activities' boards and never on a board of its own; a simple project itself (BR-97); and nothing at all, for the single built-in Chores board (BR-102). A board holds one level of card, tasks, and the hierarchy lives in which board is being looked at. | SA 2026-10-09, `act §10` |
| BR-102 | **Chores is the one board nothing owns — no project, no activity — and the one board the product creates itself.** It comes into existence at the first start-up, with the data folder (BR-80), and stays for the life of the product: it can be neither archived nor deleted. It holds every task with no project behind it: routine-spawned tasks (BR-42) and one-off tasks alike. It has no state, no dependencies and no node on any Course page. | SA 2026-10-09, SA 2026-10-10, `act §10` |
| BR-103 | **A task sits on exactly one board** — one activity's, one simple project's, or Chores (BR-101). There is no task without a board and no task on two. | SA 2026-10-09, SA 2026-10-10, `act §10` |
| BR-09 | **Colour propagates from a theme to everything that hangs off it** — its goals directly, its ideas, and through those the projects, activities, boards, focus selections and tasks beneath them. A task is reached by §3.1's chain, so a task whose project has no parent, whose parent is a theme-less idea, or which sits on Chores at all (BR-02), carries no colour. Colour is never the only signal; it always pairs with a name or a label. | `funnel §Linking rules`, `wf` guideline #1 |

### 4.2 Deletion and cascade

The per-level rows run in funnel order, so the chain a deletion travels is their order; routine and
column sit outside the funnel at the end of them, and the general rules bracket the lot.

| # | Rule | Source |
|---|---|---|
| BR-12 | **A deletion asks before it destroys anything the deleted entity does not solely own.** What it does own goes unasked — a goal's progress measures and their check-in history, an activity's dependency edges. Everything else is offered as a cascade. The nearest rule governs: where a deletion reaches another entity, that entity's own rule applies there unchanged and trumps the rule that reached it, so a higher rule never restates a lower one and no rule describes a reach beyond the next level down. Whether declining a cascade is even an option is therefore not settled here: it follows from whether the reached entity can legally exist without the deleted one (BR-21, BR-113). | `funnel §Deletion cascade rule`, SA 2026-10-05, SA 2026-10-10 |
| BR-13 | **Theme** → two cascades are offered: its goals and its ideas (the routines cascade is gone with the affiliation, SA 2026-10-13). What happens below is BR-15's and BR-14's, and the goals cascade may turn the whole gesture into approve-or-reject (BR-113). An idea that is kept loses the theme affiliation and stays legitimate (BR-03); a goal cannot be kept, because its theme is required (BR-21). The ideas cascade is the only real choice here, off until the user takes it (BR-19). | `funnel`, `wf §2.4`, SA 2026-10-04/05, SA 2026-10-11, SA 2026-10-13 |
| BR-14 | **Idea** → a cascade is offered for the projects hanging on it, and declining it rejects the deletion. Detaching is not offered, although a parentless project is legal (BR-96). The idea's own links go with it: any goal that linked it survives minus the link, and a goal left with no linked idea is flagged like any other (BR-04). | `funnel`, `wf §2.4`, SA 2026-10-05, SA 2026-10-09 |
| BR-15 | **Goal** → two cascades: its linked ideas, and the projects parented on it or on one of its progress measures (BR-96). Declining the project cascade rejects the deletion. Its own progress measures and their check-in history always go with it, unasked (BR-12), so BR-115 is not consulted for a measure that goes down with its goal. | `funnel`, `wf §2.4`, SA 2026-10-04, SA 2026-10-09 |
| BR-115 | **Progress measure** → its own check-in history goes with it, unasked, and nothing else does, so nothing is asked: a project parented on it survives minus the link, a parentless project being legal (BR-96). | SA 2026-10-10, SA 2026-10-16, BR-96 |
| BR-114 | **Project** → everything the project is goes with it: an activity-based project's activities, or a simple project's own board and the tasks on it (BR-97, BR-101). Declining refuses the deletion (BR-113). The parent survives, minus the link. | SA 2026-10-09/10, `act §12` |
| BR-104 | **Activity** → its tasks go with it, and declining refuses the deletion, always rather than conditionally (BR-113). Its dependency edges are simply deleted, never reconnected: the gap is not closed transitively. | SA 2026-10-09, `act §12` |
| BR-17 | **Task** → owns nothing, no cascade. | `funnel`, `wf §2.4` |
| BR-16 | **Routine** → a cascade is offered for the task occurrences it has already produced. Without it, the routine simply stops producing new ones. | `funnel`, `wf §2.4` |
| BR-18 | **Column** → declining the cascade rejects the deletion rather than detaching (BR-21). An empty column deletes cleanly. | `funnel`, `wf §2.4`, `arch §9` |
| BR-113 | **Nothing below a project can be detached, so every cascade from the project down is approve-or-abandon.** An activity needs a project (BR-98) and a task needs a board, which is an activity or a simple project (BR-101, BR-103), so declining has no legal outcome to fall back on. The gesture asks the user to approve what it will take, naming which activities and which tasks, and does nothing at all if they decline. This holds for deletion (BR-14, BR-15, BR-104, BR-114) and for archiving (BR-112) alike. | SA 2026-10-09 |
| BR-19 | **A cascade is off by default only where declining it is legal**, decided per deletion, never remembered and not configurable. Where declining is not legal (BR-21), there is no default to set: the cascade is not a choice but part of what the gesture discloses, and the user approves it or abandons the deletion. | `wf §2.4`, `arch §9`, SA 2026-10-10 |
| BR-20 | **There is no in-app undo.** The user is told so at the point of deletion, and told that the data is under version control. | `wf §2.4` |
| BR-117 | **The archive is no shield from a deletion.** A cascade counts an archived descendant exactly like a live one and names it in what the gesture discloses, so nothing can outlive its parent and unarchive into an illegal state (BR-25). | SA 2026-10-10 |
| BR-21 | **Declining a cascade detaches where detaching is legal, and rejects the deletion where it is not** — which is what decides, level by level, whether declining is offered at all (BR-12). An idea loses its theme and survives (BR-03). A goal has a required theme (BR-01), so a theme deletion that would orphan one is rejected: cascade, or keep the theme. A task cannot be left without a column (BR-18) or without a board (BR-104), so those deletions are refused, and there is no detached state to fall back on: a task never moves to another board at all (BR-64, BR-103). The project is the one level where a legal detached state exists and is still not offered (BR-14, BR-15). | `arch §9`, `funnel`, SA 2026-10-06, SA 2026-10-11 |

### 4.3 Archive and check-out

| # | Rule | Source |
|---|---|---|
| BR-22 | **Archive is always a conscious manual gesture — there is no exception.** A goal does not archive when its horizon passes; a task does not archive after N days in Done; a completed routine task does not archive itself either. A goal whose horizon has passed is subtly flagged as due in the Goals view instead — visible, not loud, and it never acts on the goal. | `funnel §Archive`, `wf §7.8`, `wf §6.1`, SA 2026-10-06 |
| BR-23 | **Archivable, and by which act:** an idea, directly; a goal, directly and at any time, independent of check-out, which only offers it as a closing action (BR-30), and that act carries its progress measures and its check-in history with it (BR-112); a progress measure, directly and at any time — which is how a measure that turns out not to say anything about its goal is set aside instead of deleted — and its own check-in history goes with it, coming back with it into a live goal (BR-25, BR-112); a task, four ways — through the work check-out (BR-34), individually from its context menu, by archiving a whole column's worth at once, and by being set aside when its activity is closed (BR-127); a routine's task, by those same three acts and no others (BR-61); a project, directly, and that act carries its activities and their tasks with it (BR-112) — which is the only way an activity is archived at all, however that project comes to be archived, whether directly or through an idea's or a goal's cascade (BR-112). Not archivable: theme, routine (pause it instead), day focus, the Chores board (BR-102), an activity on its own, and a progress check-in on its own. The first two are an acknowledged inconsistency, parked rather than answered: they are carried into the architecture and no further (`14_Parked-Functionality.md` P-1, P-2, SA 2026-10-18). | `funnel §Archive`, `wf §7.8`, `wf §6.1`, SA 2026-10-05, SA 2026-10-06, SA 2026-10-16 |
| BR-24 | **Archiving reaches no further than the entity archived, unless a rule says it does.** Where it does reach, the reached entity's own rule governs there unchanged and trumps the rule that reached it: the nearest rule governs archiving exactly as it governs deletion (BR-12). This rule therefore names no level and counts no exceptions — the reaches that exist are BR-112's, and the inverse is BR-25's. | `wf §7.8` |
| BR-112 | **Archiving cascades below a project, and the user is told exactly what goes with it.** Archiving a project archives its activities and their tasks, or — for a simple project, which has no activities (BR-97) — its own board and the tasks on it (BR-101); the gesture discloses what it will take — which activities and which tasks — and the user approves the whole cascade or rejects it, in which case nothing is archived at all (BR-113). Archiving an idea archives the projects that came from it on that same informed approval (QB-42). Archiving a goal offers three answers (QB-43): cascade, archive the goal alone, or reject — the keep option is legal here and only here, because an archived goal still exists and so orphans nothing. Those three answers are the **explicit** archiving request's. A goal archived as a check-out's closing action takes the reach the sitting already carries: the user picked its linked projects there, one by one, so nothing is disclosed again and nothing is approved twice (BR-30, SA 2026-10-17). Its own progress measures and their check-in history go with it unasked under every one of the three, exactly as they do on deletion (BR-15), and come back with it on unarchiving (BR-25). Archiving a progress measure takes its own check-in history with it, unasked, and brings it back with it (BR-25); it reaches nothing else, a project parented on it keeping a parent that still exists (BR-26). These three reaches are the whole of archiving's reach (BR-24). | SA 2026-10-09, SA 2026-10-16 |
| BR-25 | **Unarchive must leave the overall state consistent, and it is rejected whenever it cannot.** Consistency is judged over the item and its surroundings together, never the item alone: the whole bundle that was archived comes back exactly as it went, in its prior state and prior position, and into surroundings that can still hold it. Ordering is relative, so an archived item's position is never occupied while it is away. A partial unarchive can never be consistent and is therefore always refused, in either direction: no subset of a bundle can be picked for restore, and no member of one can be restored on its own while the rest stay archived. Nothing is offered to choose, nothing is re-parented, nothing is relocated and nothing is approximated. Where the bundle can no longer be reassembled — a member deleted out of the archive (BR-05), a surrounding it needs now gone — the item stays archived. | `wf §7.8`, SA 2026-10-04, SA 2026-10-10 |
| BR-05 | **An archived item cannot be edited — any archived item, not only an idea.** To change one: unarchive it (BR-25), edit, archive it again — or delete it outright. The freeze covers everything the item carries, so an archived goal's objective, horizon and links are out of reach, and so are its progress measures and any check-in against one of them, whether the measure went down with the goal or was archived on its own (BR-23). Reading an archived item is still allowed (BR-26). | `funnel §Linking rules`, `wf §3.2`, SA 2026-10-06, SA 2026-10-10 |
| BR-26 | **Archived items are retained, not removed** — kept on disk, hidden from the working view, and reachable for reading only by an explicit act. Editing is BR-05's, coming back is BR-25's. | `funnel §Archive`, `wf §7.8` |
| BR-27 | **Goal check-out captures** an overall outcome (Achieved / Partially achieved / Missed / Abandoned — required), a status per active progress measure with an optional note, a what-worked / what-didn't retro, and the closing actions. A measure archived on its own is out of the working set, so it is neither judged here nor carried forward (BR-23, BR-26, BR-31). It is available at any time: not gated on a horizon passing, and a goal need not have a horizon at all. | `funnel §Archive`, `wf §4.4`, SA 2026-10-16 |
| BR-28 | **Every progress measure is typed, numeric or boolean — there is no untyped measure** (further types may come, none are foreseen), and per-measure status is auto-inferred by measure type. Numeric: `≥100% → Hit`, `50–99% → Partial`, `<50% → Missed`, the percentage being how far the current value has moved from the start value towards the target. Boolean: `Done → Hit`, `Not done → Missed` — boolean never auto-infers Partial, the type having no intermediate state. A numeric measure carries a start value, a target, a unit and a direction, and a current value initialized to the start value and moved by each check-in; a boolean one carries done / not done and starts at not done. The type can be amended afterwards, like the start value, the target and the unit, and the check-ins already recorded are left as they stand — each keeps the type it was recorded under, and the inference reads the measure's current type over the check-ins recorded under that type. Nothing records that the type changed: a measure has no change history, and that an operation happened is the operation log's business, which holds for every user operation alike and is modelled in no business process (SA 2026-10-16, over the dated type-change entry of SA 2026-10-12). Where the current type has no check-in under it yet, no status is inferred and the user judges it unaided (BR-29). | `inv`, `wf §4.4`, SA 2026-10-06, SA 2026-10-12, SA 2026-10-16 |
| BR-29 | **The user may override any auto-inferred status**, including setting a boolean measure to Partial. The rule constrains the inference, never the final human judgment. | `wf §4.4` |
| BR-30 | **Goal check-out closing actions: archive the goal, pre-selected, and create a follow-up goal, default OFF.** The check-out asks one question — archive the goal, or leave it active — whether to carry the commitment forward is answered in the sitting and the completing request creates the follow-up (BR-31), and where the goal is archived the sitting presents its **linked projects**, every one of them pre-selected to go along, and the user leaves active whichever should stay. That pick is a field of the sitting, carried by the completing write: at check-out there is **no disclosure to approve and no cascade cycle** (SA 2026-10-17). The informed approval of BR-112 belongs to an explicit archiving request, where the goal is archived on its own and the cascade is all the gesture is about. The check-out completes under every answer; a goal left active loses nothing, since it can be archived directly later (BR-23). | `funnel §Archive`, `wf §4.4`, SA 2026-10-06, SA 2026-10-10, SA 2026-10-11, SA 2026-10-17 |
| BR-31 | **Carry-forward seeds a follow-up goal from the checked-out one:** theme inherited; linked ideas inherited verbatim; objective carried over, marked as a continuation and editable; only the Partial and Missed measures, with each numeric current value reset to its start value and booleans to Not done; check-out notes dropped; and a back-reference to the originating check-out, so the iteration chain is traceable. A time horizon is carried forward only if the original had one — then it advances to the next period of the same granularity; otherwise the follow-up is open-ended like its predecessor. A horizon's granularity is the user's choice, so the next period follows whatever the checked-out goal used. The sitting says only **whether** to carry forward; what the follow-up inherits is this rule's and needs no round trip, so the check-out's own completing request creates it and nothing is left to decide after that last gesture. Amending the follow-up is not part of the check-out: once it exists it is a goal like any other, edited in BP05 (SA 2026-10-17). | `funnel §Archive`, `wf §4.4`, SA 2026-10-04 |
| BR-32 | **A goal check-out in progress is a draft** — what BR-27 captures is kept under §3's draft semantics. | `wf §4.4`, SA 2026-10-10 |
| BR-33 | **The work check-out settles everything since the last check-out, however long ago that was; where there has never been one, it settles everything up to now** (SA 2026-10-13, over the sources' date-keyed check-out). No date is picked and none can be missed. **The day is not what it settles** — when to check out is the user's decision, several check-outs in one day are legitimate and so is one with nothing in its span (BR-36). **It captures what that span's movements say was done, and the user reads it rather than editing it** — an account with nothing in it to change leaves nothing to answer, so no act is drawn for agreeing with it and leaving the check-out is the way out (SA 2026-10-18) — plus the notes written while the span was open (BR-37) and the closing action. The completed list and the two movement figures are built from what moved inside the span (BR-124), not from the board's current state, so nothing an earlier check-out settled appears; the two remaining figures are counts of the board as it stands, which is the end of that span, and BR-35 says which is which. It is reachable from more than one place and is the same gesture wherever it is started. The board scope is **every board a task moved on, whether or not the user committed to it**, Chores among them and no differently: the check-out summarizes what was actually done, and work done away from the focus is the last thing it should hide. Because the movements are what the lists read, the focus does not bound them, and the account keeps no per-day focus standing: the figure that read one is void (~~BR-123~~, SA 2026-10-17). A span nothing moved in still has an account: the notes, an empty completed list, and the movement figures at zero. Revisitable when the check-out screen is designed. | `funnel §Archive`, `wf §6.4`, SA 2026-10-06, SA 2026-10-09, SA 2026-10-11, SA 2026-10-13 |
| BR-34 | **The check-out has one closing action: archive the completed tasks, default ON.** It takes the tasks the account listed as completed in the span it settles (BR-33, BR-35), on every board the account covers, Chores included and no differently — one of the three acts that archive a routine's task (BR-23). Tasks already archived by hand are simply not there to take. A task finished before the last check-out and left unarchived then stays on its board: a check-out only ever offers its own span's completions, and the card's own menu, clearing a lane and being set aside with its activity are the other ways it is archived (BR-23). **There is no reset of the still-open tasks** (SA 2026-10-11): a card's column, and the state its lane's role gives it, are the only record that the work was started and how far it got (BR-60), resetting it is unrecoverable inside the product (BR-20), and the decision it expressed — what gets attention tomorrow — is expressed by setting the next day's focus, which selects without touching a card (BR-41). A card that genuinely belongs back in the Backlog is moved there on the board, where the user can see it and move it straight back. | `funnel §Archive`, `wf §6.4`, SA 2026-10-10, SA 2026-10-11, SA 2026-10-13 |
| BR-35 | **The check-out's four figures, now that movement is recorded (BR-124).** Two read the movements of the span the check-out settles (BR-33), because no count of the board can see them: completed = moved into a Done column inside the span; started = moved into an InProgress column inside it — a task started and finished inside the span has left InProgress, and a Done column accumulates across days. Two are counts of the board as it stands at the moment of check-out, which is the end of that span, over the boards the account covers together with the boards the span's focuses chose: still in progress = currently in an InProgress column; planned but never started = currently in a Todo column, every one of them planned by the user's own decision (BR-126). **All four therefore describe one span and one moment**, which is what settling everything since the last check-out buys (SA 2026-10-13): there is no check-out whose state figures are about a board that has since moved on. The Backlog is outside every figure, since nothing there was planned for a day or started. Only the completed list is acted on, by the archive (BR-34); the rest is information. | `wf §6.4`, SA 2026-10-04, SA 2026-10-06, SA 2026-10-11, SA 2026-10-13 |
| BR-36 | **A check-out closes its span, so there is nothing to re-run.** The log it writes is appended and never rewritten (`10_Business-Policies.md` POL-11). **When to check out is the user's decision alone:** several in one day are legitimate, each settling its own span, and a span in which nothing happened is legitimate too — it is accounted for with empty lists, figures at zero and whatever notes were written (BR-33). The sources' idempotence per date is gone with the date, and so is their 5 pm / 9 pm case: working on after checking out and checking out again writes a second log, for the evening's span, rather than restating the first (SA 2026-10-13). | `funnel §Archive`, `wf §6.4`, SA 2026-10-13 |
| BR-37 | **The check-out's notes are drafted continuously, not only when the gesture is left** — one running journal kept while the span is open, so the draft is current at every moment. They are the check-out's and not a date's: the check-out takes the journal written since the previous one, and the next span starts empty (SA 2026-10-13). What is drafted and what that costs is §3's. | `wf §6.4`, SA 2026-10-05, SA 2026-10-13 |
| BR-38 | **A check-out's log remains available** as the explanation of the stretch it covers, when the period is reviewed later. A day is explained by the log whose span covers it — by both, where two check-outs split that day — and the days since the last check-out have none yet (SA 2026-10-13). | `wf §6.4`, SA 2026-10-13 |

### 4.4 Focus and the day

| # | Rule | Source |
|---|---|---|
| BR-40 | **The day is the unit of focus** — focus is always recorded for a day. The user can set a day's focus from any time scope, week, month or year included; selecting a day in a longer period opens that day for editing without leaving the period behind. Longer periods aggregate the day grain; they never replace it. Which day is never restricted: a past day, today and a future day are all focusable, and a past day's focus is set and changed exactly like today's — selecting a routine there creates its task now, the way it would for today (BR-42). | `funnel §4`, `wf §5.1`, SA 2026-10-04 |
| BR-93 | **The smallest focus-view scope is a week.** The scopes are week, month and year; the day stays the unit of focus (BR-40), edited in a day focus editor opened from whichever period view is showing. | SA 2026-10-06, over `wf §5.1` |
| BR-41 | **Two kinds of thing are selected for a day: boards and routines.** A board is selected by selecting its owner — an activity of an activity-based project, or a simple project itself (BR-97, BR-101) — and a routine puts its task on the Chores board (BR-42). The shape of the selection is 0..N projects and, inside each activity-based project, 0..M of its activities, so several boards of one project can be in play on one day; picking a project offers its ready activities, which the plan knows (BR-99), and nothing forces them to be picked one by one. Activities are grouped by their project; the routines are one list, grouped by nothing, since a routine has no theme (BR-02). A third thing joins the day without ever being selected: the Chores board, while it carries open work (BR-107). A day's focus is the selection as last committed: committing again replaces what was there rather than adding to it, so the boards in play are exactly what the last commit named and nothing accumulates across visits. Dropping a routine that way still leaves the task it already spawned (BR-42). | `funnel §4`, `wf §5.1.a`, SA 2026-10-09, SA 2026-10-10 |
| BR-42 | **Selecting a routine for a day ensures it has exactly one outstanding task — selection is what creates it, and it creates at most one.** If an outstanding task for that routine already exists, selecting the routine again creates no second task: the old one is still what is owed. Due and overdue are treated identically. An outstanding task persists until it is completed, and deselecting a routine never removes a task already created. The task lands on the Chores board (BR-102). | `funnel §4`, `arch §9`, SA 2026-10-05, SA 2026-10-09 |
| BR-91 | **A routine's schedule is fixed, and it determines due and overdue — it just never creates a task.** For any date, the recurrence and preferred days say whether a routine is due that day, and a routine is overdue when it was due on an earlier date and was not selected then. That is a computation, not advice. What the schedule does not do is put work on the board: only selecting a routine does (BR-42). A paused routine is out of the computation altogether — it is not active, so it is neither due nor overdue (BR-43) — and the days it spent paused never become overdue once it is resumed. Because a past day's focus can still be set (BR-40), what is overdue follows the selections as they now stand. | `funnel §Routines`, SA 2026-10-05, SA 2026-10-06 |
| BR-94 | **A routine recurs Daily, Weekly, Monthly or Yearly** — four patterns, no fifth. The frequency unit follows the pattern (`3× per week` under Weekly), and a routine also carries preferred days. | `wf §2.3`, SA 2026-10-06 |
| BR-95 | **The Themes view counts active goals only** — archived goals are not counted. Routines are not on that view at all, and are not counted there (BR-02, BR-10, SA 2026-10-13). | `wf §2.1`, SA 2026-10-06, SA 2026-10-11, SA 2026-10-13 |
| BR-43 | **Only the boards of non-archived projects and active, non-paused routines can be selected for a day** — an activity-based project's activities, or a simple project itself (BR-97). Archiving removes the thing from the focus selectables and hides its board, both and not one. Archiving an idea or a goal reaches the projects hanging on it (BR-112). | `arch §8 UC1`, SA 2026-10-06 |
| BR-107 | **The Chores board is in play, unselected, exactly while it carries a task that is not Done.** The user never selects it, and membership is live: adding a task puts it in play, completing the last one takes it out. Nothing of it is kept beyond the tasks themselves — how it is derived is technical (SA 2026-10-11, Contract §4.9). ⚠ Consequence: nothing stores the membership, and a past date's is only partly recoverable — Chores appears in a log exactly for the spans in which a chore moved (BR-33, BR-124), so a day on which one was captured and left untouched leaves no trace of it at all (SA 2026-10-13). | SA 2026-10-09, `act §10` |
| BR-44 | **The day rolls at local midnight, and that is not configurable.** Start-up sets the day in play to the current date, which is not a rollover: there is no previous day to advance from, only no day at all (BR-80). Rollover changes exactly one thing: it advances which day is current, so the day focus in play becomes the new date's — empty until the user sets it — and everything that follows from the day focus follows it: the focused boards (BR-41, BR-50, BR-51), plus Chores if it has open work (BR-107). The previous day's focus is history the moment the date moves on, reachable from the period views, and nothing is done to it: that date's record already exists and the rollover neither writes nor moves it (R-5). The day that just ended joins the span the next check-out settles (BR-33). Rollover creates nothing and destroys nothing: no tasks are spawned — only selecting a routine does that (BR-42) — nothing is archived and nothing is closed (BR-45). **Rollover offers nothing.** The surface says quietly that the date advanced, and where the new date carries no focus it says that with it — one quiet notice in UX-16's register (SA 2026-10-18) — and nothing is asked: setting a focus is the user's own act, started where every other day's focus is set (BR-40, BP08). Nothing interrupts what the user is doing either, in the sense BR-66 gives the advisor: the board they are on stays open and a gesture already under way, a drag included, is unaffected. A day left unfocused stays unfocused. | `funnel §Day rollover`, `wf §7.2`, SA 2026-10-05, SA 2026-10-06 |
| BR-45 | **No work is forfeited by not checking out.** Rollover advances which day is current; it does not forfeit the days nobody settled, because the next check-out's span still reaches back over them (BR-33). Since 2026-10-13 this is structural rather than an affordance: there is no date to pick and nothing to go back for. | `funnel §Day rollover`, SA 2026-10-04, SA 2026-10-13 |
| BR-46 | **Every period view says which period it is showing and how that relates to now, and can always be stepped and re-scoped** — the absolute period, its relation to the present, the always-available moves to the previous period, the next period and back to the current one, and the always-available switch to any other period scope (BR-93). The current day is always findable. | `wf §5.1`, SA 2026-10-04, SA 2026-10-06 |
| BR-47 | **Each period view reports theme balance over the period it shows** — how the user's attention was distributed across themes. | `funnel §4`, `wf §5.1` |
| BR-48 | **Bearing opens on Focus.** A **first-time startup opens Themes instead** (SA 2026-10-11) — the five life areas the template files brought are there, and that is where the user would go first anyway. **A first-time startup is not a condition of its own: it is the launch on which a data folder had to be set up** (BR-80, SA 2026-10-11). So start-up answers it once, where it inspects the folder, and nothing else has to be remembered or recorded to know it. A later change may open the last page used, remembered as excluded interface state (BR-92); not now. | `funnel §UX principles`, `wf §7.1`, SA 2026-10-06, SA 2026-10-11 |

### 4.5 Execution and prioritization

| # | Rule | Source |
|---|---|---|
| BR-49 | **There are exactly three kinds of board:** one per activity of an activity-based project, one per simple project (BR-97), and the single built-in Chores board that nothing owns (BR-102). There is no aggregate board over every task. | `funnel §5`, `wf §6.1`, SA 2026-10-09 |
| BR-50 | **A board is in today's focus because it was chosen; Chores is the one board that gets there by being derived.** Carrying tasks puts no board in play. The day's selection is BR-41's; the single derived member is Chores, in play exactly while it carries a task that is not Done (BR-107): routine tasks while they are outstanding or completed-but-unarchived (nothing archives itself, BR-61) and one-off project-less tasks while they exist. | `funnel §5`, `wf §6.1`, SA 2026-10-06, SA 2026-10-09, SA 2026-10-10 |
| BR-116 | **Every board is in the board strip, and today's focus is what orders it.** The focused boards are grouped at the front and subtly marked, so the Execution page makes it obvious at a glance where the day's attention is meant to go; Chores joins that group while it is in play (BR-107). Everything else follows and stays reachable — the focus orders and emphasizes the strip, it never removes anything from it. Since an activity-based project can carry dozens of boards, an out-of-focus one is one entry per project rather than one per activity, opening to its activities' boards on demand, which is what keeps the strip bounded. How the grouping, the marking and the unfolding are drawn is §7's. | SA 2026-10-09, SA 2026-10-10 |
| BR-51 | **A board is always open on the Execution page, and the day's focus decides which one.** The user arrives at the activity they planned to work on, or at Chores when that is all the day holds. Where the day has no focus to arrive from, the first board in the strip opens (BR-116) rather than nothing at all — an arbitrary board beats an empty page. There is no aggregate board to fall back on (BR-49) and none is needed: Chores is built in (BR-102), so at least one board always exists and the no-board-open case does not arise — until the first project or activity is defined, Chores is the only board there is and it is what opens. A board with no tasks on it is an empty board, not an empty page. | `funnel §5`, `wf §6.1`, SA 2026-10-09, SA 2026-10-10 |
| BR-108 | **A board's columns come from a column template, never from the board itself.** A project owns one template, and it governs every board of that project with no deviation inside it: all of an activity-based project's activity boards, or the single board of a simple project (BR-97). Chores owns a template too, and this is where the two differ — nothing owns Chores (BR-102), so its template belongs to that one board rather than to a project, and governs nothing else. The gesture that configures either is the same, and BR-59's invariant holds for both. So the product carries one template per project, plus Chores's. **A new template starts from four columns, one per role** (2026-10-12, over `arch §10`'s two): with only a Backlog and a Done, the day's plan at the task level has no Todo to sit in (BR-126) and two of the check-out's four figures are structurally zero (BR-35) until the user hand-builds the lanes. | SA 2026-10-09, SA 2026-10-10, `act §12` |
| BR-105 | **Activities are created on the Course page, not on a board.** An activity-based project only (BR-97): a simple project has no activities to create. | SA 2026-10-09, `act §5` |
| BR-109 | **An activity's state is Todo · InProgress · Done, and the Course page owns it alone.** Completion is offered, never imposed: leaving an activity's board with nothing open may offer to mark the activity Done — by moving its last task to Done (BP11), or by a lane change that makes the cards in it done (BR-60, BP12) — and declining is a legitimate answer that leaves it InProgress, to be closed by hand on the Course page. A Done activity can be reopened, and reopening takes nothing. Setting one Done while cards on its board are still open is BR-127's. | SA 2026-10-09, `act §5`, `act §6` |
| BR-110 | **An unfinished predecessor is subtly flagged, never blocking.** Starting an activity whose predecessor is not Done is permitted, and Bearing marks it quietly, naming the predecessor — the same gesture BR-22 uses for a goal past its horizon. No dismissal exists: the flag clears itself when the predecessor completes. | SA 2026-10-09, `act §11` |
| BR-52 | **Triage happens at intake, so priority lives in the Backlog and nowhere else.** This is the principle; its mechanics are BR-54 (the priority travels with the task and re-applies on return) and BR-56 (it is changeable only in the Backlog), and those two are what the drawings bind. | `funnel §5`, `wf §6.1` |
| BR-53 | **Exactly three priorities**, ordered urgency first: Important & Urgent · Not Important & Urgent · Important & Not Urgent. “Not Important & Not Urgent” is deliberately absent: a task that is neither does not belong on the board at all. | `funnel §5`, `wf §6.1` |
| BR-54 | **A task's priority travels with it** once it leaves the Backlog, stays visible, and re-applies if it comes back — so returning a task to the Backlog is the act of re-opening its triage. | `funnel §5`, `wf §6.1` |
| BR-55 | **New tasks always enter at the Backlog**, at the priority they were captured into. | `wf §6.1`, `wf §6.2` |
| BR-56 | **Priority is changeable only while a task is in the Backlog.** To re-triage work in motion, the user sends it back first. | `wf §6.1` |
| BR-57 | **The three priorities are always present, including when empty** — each its own section of the Backlog on a board, and each its own column in capture, where the column a task is staged into is the priority it carries (BR-63). | `wf §6.1`, `wf §7.6` |
| BR-58 | **A column carries a role — `{Backlog, Todo, InProgress, Done}` — and a name, and they are different things.** Four roles, no neutral escape hatch. Renaming a column never changes its meaning; the check-out and the advisor read the role, never the name. A lane added to a template enters **InProgress**, the role most added lanes carry (`arch §10`), and is given another meaning by the role act — naming a lane can neither set a role nor change one (SA 2026-10-18). | `arch §10` |
| BR-59 | **A board has exactly one Backlog column and at least one Done column.** Backlog is capped at one; Done is not — several Done columns are fine. Other roles may be shared freely. A board's columns come from a column template (BR-108), so this invariant is enforced once per template — once per project, plus once for Chores — rather than once per board. It is what bounds the role changes BR-60 allows, and the role change is where it is enforced: naming a lane cannot reach it (BR-58, SA 2026-10-18). | `arch §10`, SA 2026-10-06, SA 2026-10-10 |
| BR-60 | **A column's role may change within two limits, and the consequences are otherwise the user's.** The Backlog column's role cannot change at all. A Done column's role can change only while another Done column remains, since a board always has at least one (BR-59). Within those limits: a role change moves the check-out's two state figures (BR-35), because those count the cards in an InProgress or a Todo column as they stand — and it changes nothing about any date's recorded completions, which read the moves into Done that actually happened (BR-124). Moving a lane into or out of Done rewrites no history. **What this reaches is the cards in that lane, and the change sets their state**: a lane that becomes Done sets the cards in it to done, and a lane that leaves Done sets them to waiting or in motion, by the role it takes (`arch §10`, SA 2026-10-18). The new role is never Backlog — the Backlog's role cannot change and no change may add a second — so those three are the states a card is set to. Whether that state is kept per card or read from the lane it sits in is detail design, not business (QC-04). A task a check-out has already archived is settled and no later role change touches it (BR-05, BR-34). A role change into Done can leave an activity with nothing open, which raises the same completion offer a last move into Done raises (BR-109) — answered activity by activity, since the change reaches every board the template governs, and with nothing to disclose because nothing is left open (BR-108, BR-127, SA 2026-10-18). | `arch §10`, SA 2026-10-10 |
| BR-61 | **A routine's task is an ordinary task.** It is completed, archived and deleted by the same acts as any other (BR-23), with no automatic archiving and no special lifetime. Selecting the routine again creates no second task while one is still outstanding (BR-42). | `wf §6.1`, SA 2026-10-06 |
| BR-62 | **Capture names no board: the batch lands on the board capture was opened from.** Capture is opened on a board (BP11) and the user can only write tasks down for the board in front of them, so no destination is offered and none is chosen. Chores is reached the same way as any other board — by being the board the user is on — and its two populations still arrive their own ways, there being no third since a task never moves between boards (BR-64): routine work when a routine is selected (BR-42), and work captured while Chores is open (BR-90). | `wf §6.2`, SA 2026-10-05, SA 2026-10-18 |
| BR-63 | **Task capture is a batch gesture.** Several tasks are staged across the three priority columns and committed together; staged work is drafted (§3's draft semantics) and discarding it is an explicit act. | `wf §6.2` |
| BR-64 | **A task's content and its placement are separate concerns, and its board is neither.** Content is edited; placement — its priority, its column — is changed by moving the task within its board. A task cannot move to another board at all: it is created on one board and stays there for its whole life (BR-103). Work already in motion is sent back to the Backlog first to be re-triaged, the same gesture BR-54 uses. | `wf §6.3`, SA 2026-10-05, SA 2026-10-10 |
| BR-65 | **A new board comes into existence only by creating its owner** — an activity, on the Course page (BR-105), or a simple project, whose one board is created with it (BR-97) — never as a side effect of capturing a task. Capturing a task lands on the board it was opened from and chooses nothing at all (BR-62). | `wf §6.2`, SA 2026-10-09 |
| BR-90 | **Work with no project behind it is captured on Chores** — the board capture was opened from, like every other capture (BR-62, BR-102). Not every task belongs to a project: some work is simply work. | SA 2026-10-05, SA 2026-10-18 |

### 4.6 The advisor

| # | Rule | Source |
|---|---|---|
| BR-66 | **There is one advisor**, available from anywhere in the product, aware of where the user currently is, and never blocking — consulting it does not suspend the work. One conversation runs for the session and is cleared deliberately. | `inv`, `wf §7.5` |
| BR-67 | **The advisor sees the whole funnel** — themes, ideas, goals, routines, focus history, tasks, progress check-ins — plus Vision and Mission when set. | `wf §7.5` |
| BR-68 | **An advisor proposal is a structured, typed object, never prose to be parsed.** | `wf §7.5` |
| BR-69 | **Applying a proposal writes it, immediately and completely. One rule, no exceptions.** Consequently a proposal to create something must carry everything that thing needs: the advisor may not propose a half-finished entity for the user to complete; lacking information, it asks. | `wf §7.5` |
| BR-70 | **At most one outstanding proposal per target at any time.** A revised proposal for the same target supersedes its predecessor. Already-applied and already-declined proposals are closed and unaffected. | `wf §7.5` |
| BR-72 | **The advisor acts only through the operations the user has** — there is no second write path, and no act is withheld from it. It may propose anything the user could do, deletions included; what it cannot do is act without the user accepting the proposal (BR-69). Because the operation is the user's own, everything that operation does when the user invokes it happens here too: a deletion still discloses what it will take and is still approved or abandoned (BR-12, BR-113), and an archiving still offers the answers its rule offers (BR-112). | `arch §5 Pivot 3`, SA 2026-10-10 |
| BR-74 | **An advisor proposal may change a part of the funnel the user is not working in, and when it does they are told.** A proposal raised while thinking about an idea can land on a goal or on a task. It is applied where that change belongs — the user is not taken there to approve it — and saying so is part of applying it. | `wf §7.5`, SA 2026-10-05 |
| BR-75 | **The advisor never silently fails and never half-succeeds.** If it returns something the product cannot act on, the user is told it could not be used, rather than being handed an inert proposal. Prose in the conversation stays prose (BR-68); what cannot happen is something that looks like a proposal and is not one. | `wf §7.5`, SA 2026-10-05 |

### 4.7 First run, storage and settings

| # | Rule | Source |
|---|---|---|
| BR-76 | **Bearing has no user-facing settings.** | `funnel`, `arch §11`, `wf §7.2` |
| BR-77 | **The user's data lives in one place, chosen by platform convention, and it is version-controlled from the first run.** Moving it is a filesystem act, performed outside the product. | `arch §11`, `wf §7.2` |
| BR-78 | **Everything that would otherwise be a preference is either taken from the operating system or fixed** — locale, colour scheme and reduced motion come from the OS. | `wf §7.2` |
| BR-79 | **Backup is version control, not a product feature.** Interchange with other tools is out of scope. | `wf §7.2` |
| BR-80 | **On start-up the product either finds its own data or creates it; anything else it refuses to touch.** Three states are possible, and they are not the same event: no folder, an unreachable symlink target included → create it, version-control it, install the template files, the Chores board among them (BR-102), report it in passing without stopping the launch (BR-81), and then load it like any other folder; a folder version-controlled by this Bearing that the product recognises as its own → load it; **anything else → refused, and Bearing does not start** — a folder that is not version-controlled, one version-controlled by something else (an older Bearing or a repository that was never Bearing's), and one it does not recognise as its own, all three alike — and the user moves the folder aside by hand. Something is off in every refused case, so no repair is attempted in place. How the product recognises its own folder is a technicality for the Contract document (SA 2026-10-11); at Intent it is enough that it does, and that it refuses anything else. This supersedes `wf §7.2` state 4, which ran `git init` in place on an unversioned folder and proceeded. No migration from v1; migration within v2 will be supported, which is a later concern and never part of first-time opening. | `wf §7.2`, SA 2026-10-05, SA 2026-10-06, SA 2026-10-10 |
| BR-81 | **Setting up a new data folder is reported in passing, and the launch carries on.** The report is low-ceremony — a transient notice, not a dialog: it blocks nothing, nothing waits for it to be acknowledged, and the launch carries on regardless, landing on Themes (BR-48, BR-82 — there is no onboarding to follow, SA 2026-10-11). A Bearing folder that was there and is now gone is possible but unlikely, so the product does not stop the launch to ask: a folder set up by accident is removed outside Bearing before a backup is restored at that path, and the fresh folder overwrote nothing. Bearing offers no in-product restore, no folder choosing, and no alternative location. | `inv`, `wf §7.7`, SA 2026-10-11 |
| BR-82 | **There is no onboarding wizard.** The template files installed with the data folder (BR-80) make the product usable the moment it opens — five life areas, a Chores board — so a first run needs no guided setup: it opens **Themes** (BR-48), with those five in front of the user, and that is the whole of it. Naming a life area, dropping one, adding one of their own, and writing a vision and a mission are the **same acts as on any later day**, done the same way, in the Themes process; nothing in start-up duplicates them. *"Since the idea to use template files to populate new Bearing folders, I don't think we need the wizard"* (SA 2026-10-11). This voids `wf §7.1`'s wizard and `05_UX-Directives` UX-03. | `funnel §UX principles`, `wf §7.1`, SA 2026-10-05, SA 2026-10-10, SA 2026-10-11 |
| ~~BR-83~~ | ~~**The five shipped life areas can be restored later**, from the Themes tab.~~ **VOID 2026-10-11** — there is no restoring the shipped set and no resetting the data folder: *"I don't see a need to reset the data directory and if I feel like it I can delete the entire folder and start from scratch"* (SA). The five still **ship** with the template files (BR-80, BR-82); getting them back means deleting the folder outside Bearing and letting the next launch set one up. **Nothing in the product has a default that can be asked for again**, so the product has no "fill it in for me" affordance at all. `BP02.09` is retired with it, and `wf §7.6`'s offer is void. | `wf §7.6`, SA 2026-10-10, SA 2026-10-11 |
| BR-84 | **A goal cannot be created before a theme exists**, and the user is told why rather than being shown an unusable form (BR-01). A routine has no such precondition: it has no theme at all (BR-02). | `wf §7.6`, SA 2026-10-11 |

### 4.8 Scope decisions that are business decisions

| # | Decision | Source |
|---|---|---|
| BR-08 | **Goals are flat — for now.** No parent and no child goals: decomposition uses sequential goals on the same idea, or tasks. A current choice, not an invariant — the goal-setting approach is itself expected to be volatile (`arch §3`) — so nesting may return, and nothing downstream may assume flatness is permanent. Phase goals stay, and a plan does not take decomposition over from them: a goal commits and measures, a plan orders, and they coexist joined at the project (BR-96). | `funnel §3`, `arch §3`, SA 2026-10-09 |
| BR-10 | **One canonical home per entity — for now.** A parent does not embed its children; a child carries its parent as context. Routines were the single deliberate exception, living under their life area on the Themes tab; since they have no theme they have a home of their own (BR-02, SA 2026-10-13), and the principle holds with nothing excepted. A working principle rather than an invariant. | `funnel §1`, `wf §2.1` |
| BR-86 | **An idea has no second grouping axis beyond its theme — for now.** Finding related ideas across themes is served by searching their text and by asking the advisor, not by a second taxonomy. A current choice rather than an invariant: it may not hold in practice, so nothing downstream may assume a single axis is permanent. | `inv`, `wf §3.1`, SA 2026-10-05, SA 2026-10-10 |
| BR-87 | **Goals are deliberately unfiltered** — grouping them by theme does the work. | `wf §4.1` |
| BR-111 | **A plan orders and tracks; it never schedules.** No duration estimate per activity, no float, no critical path, no staffing, no compressed solution, no time–cost curve, no earned value. Four of the Method's ten project-design concerns survive — the activity list, the dependency network, the build order they imply, and progress tracking (`act §9`); the other six are not modelled, not stored and not derived. | SA 2026-10-09, `act §5`, `act §9` |
| BR-120 | **One dependency type between activities — for now.** A dependency is technical and finish-to-start (BR-99); there is no second, preference-only edge for ordering work that does not technically depend on anything, such as two engines that could be built in either order. Expressing a preference with a technical edge would blur what a dependency means, and that is the reason the preference edge is owed rather than improvised. A current choice, not an invariant: nothing downstream may assume a single edge type is permanent. | SA 2026-10-10, `act §5` |
| BR-89 | **Out of scope for routines:** skip-on-holiday rules, streak goals, reminders and notifications. | `funnel §Routines` |

### 4.9 Cross-cutting behaviour

Each of these binds every surface, or any entity, and no single stage owns it.

| # | Rule | Source |
|---|---|---|
| BR-118 | **Every surface reflects current truth without the user commanding a refresh.** A change made anywhere appears wherever it is shown — the board strip's membership and ordering, a board's cards, the Themes counts, an archive view's contents — and no surface carries a refresh the user has to press. Nothing a surface shows is kept separately from the state it shows, BR-107 being the pattern, so being current is the normal case rather than an update that has to be arranged — **how** that is achieved is technical (SA 2026-10-11, Contract §4.9). The advisor is included, and its latency being higher than everything else's is accepted: its panel comes current on its own when the answer arrives, and stays non-blocking meanwhile (BR-66). Retrying a failed advisor call re-sends a request; it is not a refresh of a stale surface — and it is the whole gesture asked again rather than a loop inside the pending one, so no drawing carries a retry arrow (SA 2026-10-16). The rule is about the truth a surface settles on, not about what it may show on the way there: whether a change is painted before it is confirmed, and what happens when it has to be taken back, is `arch §2`'s optimistic-UI concern and belongs to the Blueprint. | SA 2026-10-10, `arch §2` |
| BR-121 | **Unfinished input is a draft, and no draft is version-controlled.** Wherever the product holds input it has no commit for yet, what it holds is a draft in §3's sense: it survives abandoning the gesture, a crash and a restart, it changes nothing until the gesture completes, and it stays out of the planning history. This is the general rule the particular ones instance (BR-32, BR-37, BR-63), so a surface that saves as the user types — an idea's notes — is drafting and not committing, and the commit is the completion of the gesture. **Forms are included**, a dialog as much as an editor: a half-filled form comes back half-filled after a crash, and that covers the advisor's unsent question too. Keeping a draft is one-way — nothing waits for it — and whichever write commits the input discards the draft it came from. Where a draft is kept is not a business concern: it lives with the user's data and outside version control, like the remembered interface state (BR-92), and the shape of that is the Blueprint's. | SA 2026-10-10 |
| BR-122 | **Start-up satisfies its technical preconditions before it touches the user's data, and refuses to start when it cannot.** A precondition is a technicality — the git version, for one — and which ones there are belongs in the Contract document, not here. What is intent: the product checks them first, writes nothing when the check fails, names what is missing, and closes on the user's confirmation like any other start-up refusal (BR-80, section 7's start-up refusal row). What is not a precondition is best effort, reported where it fails and never a gate on launching. | SA 2026-10-10, SA 2026-10-11 |
| ~~BR-123~~ | ~~**Focus adherence is measured over time, never judged on the day** — a check-out's log recording, per day of the span it settled, whether that day's focus **chose** each board its account covered, and the ratio read over a period in BP09.~~ **VOID 2026-10-17** — *"Drop adherence"* (SA). The product records only a card entering InProgress or Done (BR-124), so a task worked on over several days records nothing on the days between: a day spent on a committed board scored zero while one off-focus card flipped the same day scored against it — *"that doesn't work for tasks which take more than a day"*. The ratio measured recorded movement rather than work, and measuring work would mean keeping a third thing nothing else needs. The theme balance already says where the attention went (BR-47). Nothing records a per-day focus standing any more: the check-out's account still covers every board a task moved on, Chores among them (BR-33), and its figures stay the span's (BR-35, BR-125). | SA 2026-10-11, SA 2026-10-13, SA 2026-10-17 |
| BR-124 | **The product records when a task moves into a Done or an InProgress column, and the check-out's account reads that record.** Nothing needs to know when a card entered Todo or Backlog (BR-35). The operation log already carries it for audit — which operation, on which task, when — so this is a decision to read what is kept, not a new thing to keep (SA 2026-10-11). It supersedes the 2026-10-06 ruling that the check-out needs no movement data (QB-23, C-4), and restores the sources' original "moved to Done today" wording. Whether the figures query that log or a denormalized per-task field earns its place is the Contract's (QC-04). | SA 2026-10-11 |
| BR-125 | **The check-out reports its span's figures, not only its lists:** how many tasks were completed, how many were started, how many are still in progress, and how many were planned but never started (BR-35). They are what that check-out's log keeps (BR-38). **The period views do not aggregate those figures** — they read the dated movement record itself (BR-124), so a span straddling a period boundary needs no rule and a period's numbers never depend on when the user happened to check out (SA 2026-10-13). | SA 2026-10-11, SA 2026-10-13 |
| BR-126 | **The Todo column is the day's plan at the task level: a card is in Todo because the user decided to do it today.** Planning a day includes moving cards back out of Todo into the Backlog, so a card that stays there stays by decision and nothing is carried over by accident (SA 2026-10-11). It is the second of the two planning levels and the finer one — the day's focus selects boards, activities and routines (BR-41), Todo selects the tasks on them — and the act itself is an ordinary board move (BR-64, `BP11`), not a gesture of its own. This is what makes the check-out's fourth figure a count of unkept intentions rather than a standing backlog (BR-35). | SA 2026-10-11 |
| BR-128 | **Every write is verified by the system, and a failed verification rejects the write and says why.** The system owns the verification of what it is given — no surface is trusted to have checked anything, because no client carries business logic of any kind. So the rules a write binds are enforced where the write happens: a goal reaches the store with a theme (BR-01) or not at all, a project's kind is not amendable (BR-97), a lane change that would leave no Backlog is refused (BR-59). A rejection is an answer, not an accident: the write does not happen, the reason comes back, and nothing is partially applied. | SA 2026-10-14 |
| BR-129 | **Every gesture can be abandoned, and abandoning commits nothing.** Wherever the product asks the user for something — a dialog, an editor, a check-out, a batch being staged — leaving it is always available and always legitimate: nothing it describes takes effect, nothing is partially applied, and what was typed stays a draft that comes back (BR-121). Abandoning is the answer to anything the product shows that the user does not want to carry through, which is why no surface needs a *no* of its own and no account needs agreeing with (BR-33). Because it is available at **every** user action, no drawing models it: a process draws the path through the gesture, and the way out of every box is the same way out (DRW-30, SA 2026-10-18). | SA 2026-10-18 |
| BR-127 | **Setting an activity Done while tasks on its board are still open discloses them and asks what becomes of them.** The three answers are: close them with the activity, set them aside, or leave them open — and leaving them open is legitimate, because the activity's state is the planner's judgement and not a claim about every card (BR-109). Closing them moves each card into its board's Done column, an ordinary move (BR-64) that the movement record then carries, so the completed figure of the span covering that move counts them (BR-33, BR-35, BR-124); setting them aside archives them (BR-23), which records that the work was dropped rather than finished; leaving them open leaves a Done activity with live cards on its board. Where nothing is open the disclosure is empty and there is nothing to answer. Reopening a Done activity discloses nothing: it takes nothing. | SA 2026-10-11 |
| BR-85 | **The user never selects more than one entity to act on.** No multi-select, no range selection, no bulk-action bar. It is a rule about selection, not about effect: a cascading deletion (BR-13) touches many entities as one gesture on one entity. The advisor is no exception to it either — a proposal is applied or dismissed one at a time (~~BR-71~~ retired 2026-10-18). | `inv`, `wf §7.11`, SA 2026-10-05 |
| BR-88 | **A collection the user has ordered by hand has one canonical order, and sorting it another way never disturbs that order.** The orderings on offer are recently added, recently edited and alphabetical, against the hand-made order they are viewed instead of; the hand-made order is what the user gets back by asking for it, untouched. The ordering in force is remembered between sessions (BR-92). For ideas, the hand-made order is a grouping convenience and nothing more: it carries no priority, no front-of-mind rank, and no consequence anywhere else in the funnel. | `wf §3.1`, `wf` guideline #16, SA 2026-10-06 |
| BR-119 | **A collection with no hand-made order is listed by its own structure first, then alphabetically.** For a project's activities that means dependencies first and name second: the dependency graph is a partial order, so activities it leaves unordered relative to each other are listed by name. Activities carry no hand-made order of their own, which is what distinguishes them from every collection BR-88 governs, and no preference edge exists to give them one (BR-120). | SA 2026-10-10 |
| BR-92 | **Remembered interface state is kept, and kept out of the user's history.** How the product was last left — the ordering in force (BR-88), which themes were collapsed, which board was last worked on (BR-51) — is remembered between sessions. It lives in a subdirectory of the data folder that is explicitly excluded from version control, so it survives restarts without entering the planning history. | SA 2026-10-05 |
| BR-39 | **The check-out shape is reusable:** what the system observed (read-only) → the judgment, which is an overall outcome where the entity has one to rate (BR-27) and a per-item status where there are items, with the reflection that goes with it optional → opt-in closing actions, where archiving defaults ON and everything else defaults OFF → one named closing gesture. The judgment comes before the reflection, as BP07 draws it; a check-out with nothing to judge has neither (BP13). A future entity needing a check-out copies this shape rather than inventing one. | `wf §7.11` |

---

## 5. Required business processes

**The cut, with ids assigned.** Nineteen business processes cover every statement in the five sources
and every surface in §7; the ids are `BP01`…`BP20` in funnel order, `BP09` retired on 2026-10-17 and
never reused and are **permanent once a `.bpd`
is written** (`design-artifact-conventions`). The Software Architect confirms the cut before authoring
begins — BPMNs are authored from his statements, not from this table. Per BP the deliverable is one
tagged `.bpd` (the single source for both detailed levels, `bpmn-dsl`), the two generated `.bpmn`, one
`BP##_<Name>.md` overview in `docs/02_Business/01_Business-Processes/`, and one SI markdown per
interaction in `02_System-Interactions/`.

Every process runs between a **User** pool and the **Bearing** (system) pool unless the *Pools* column
says otherwise. `SIs` is the count of that process's **call sites**: minted from its drawing where one
exists, and §6's candidate count where it does not. How many distinct System Interactions they
resolve to is a Design finding (ADR-069, §6).

| BP | Business process | Trigger | Pools | SIs | Hot path | Sources |
|---|---|---|---|---|---|---|
| **BP01** | **Start Bearing** — resolve the data folder and do what its state calls for: load it, create it (version-controlled, with the template files) and load it, or refuse to start — when a technical precondition is unmet (BR-122), and on any folder it does not recognise as its own (BR-80); a first-time startup lands on Themes, any other launch on Focus (BR-48), and there is no onboarding wizard (BR-82); close the product when the user acknowledges a refused start-up | App launch | + filesystem state as a start event | 2 | — | `wf §7.1`, `wf §7.2`, `wf §7.7` |
| **BP02** | **Maintain life themes** — add, rename, recolour, reorder, delete a theme with its two cascades (BR-13); edit vision and mission | user, 2–4× per year | | 5 | — | `funnel §1`, `wf §2.1`, `wf §2.2`, `wf §2.5` |
| **BP03** | **Maintain routines** — define, amend, pause, resume, reorder, delete a routine, in the Routines view of their own (BR-02, BR-10); its schedule is fixed (BR-91, BR-94) | user, rare | | 5 | — | `funnel §Routines`, `wf §2.3` |
| **BP04** | **Capture and curate ideas** — capture an idea, edit it in one editor whose fields include its notes, everything typed drafting as it is filled in and committing on submit (BR-121), re-affiliate it to a theme, order it by hand, archive or delete it; define a goal on it or create a project on it, each editor submitted here (SA 2026-10-16) | user, opportunistic, including during execution | | 8 | ✓ (step 3) | `funnel §2`, `wf §3.1`, `wf §3.2` |
| **BP05** | **Commit to and maintain a goal** — promote an idea or frame a theme-only goal; one editor serves committing to something and changing it alike (UX-04), carrying its objective, its theme, a horizon if it has one and the ideas behind it (BR-04), chosen and cleared in that same editor; read the goals with their progress measures, which are the goals' own sub-items (BR-28); reorder goals within a theme, archive directly (BR-23) or delete it, both disclosing what they will take and both carrying the goal's measures and its check-in history unasked (BR-15, BR-112); check a goal out, which reads the statuses the system infers and leaves the sitting to BP07, and create a project on the goal or one of its measures, submitted here (SA 2026-10-16). What the goal is measured by is BP06's | user, at the start of a cycle | | 7 | — | `funnel §3`, `wf §4.1` |
| **BP06** | **Measure a goal's progress** — the whole life of a goal's progress measures: add one, typed numeric or boolean and tracking a current value against its target (BR-28), edit it in that same editor, its type among the fields, reorder them, remove one, which takes nothing with it (BR-115); check in against one with a note, which moves its current value; its check-ins are in play with it, so looking at how it has moved is no act. A measure is a sub-item of its goal with no page of its own, so the measures are read with the goals (BP05) and this process has no overview of its own, reading one measure's check-ins when it is opened. The history is append-only, so a second check-in on one date is a second data point; set one aside, reach the ones set aside through the Goals archive (BP15) when it turns out not to say anything about the goal, which takes nothing with it either (BR-23, BR-112); and an archived goal is frozen, so its measures take nothing at all (BR-05) | user, at the start of a cycle, then on a periodic out-of-band cadence | | 5 | — | `wf §4.2`, `wf §4.3` |
| **BP07** | **Check out a goal** — rate the outcome, judge each progress measure, write the retro, archive the goal with the linked projects the sitting picks (BR-30), ask for a follow-up where one is wanted, then one completing gesture that executes the lot; an unfinished sitting is kept as a draft (BR-32) | user, end of cycle | | 2 | — | `funnel §Archive`, `wf §4.4` |
| **BP08** | **Set a day's focus** — pick that day's boards — activities, or a simple project — and routines from whichever focus view is showing (BR-40, BR-41); Chores joins unselected while it carries open work (BR-107); routine selection ensures one outstanding task (BR-42) | user, every morning | | 1 | ✓ (step 1) | `funnel §4`, `wf §5.1.a`, `arch §8 S1` |
| **BP10** | **Capture tasks** — stage a batch across the three priority columns and commit them to the Backlog of the board capture was opened from (BR-62) | user, at intake | | 5 | ✓ | `wf §6.2` |
| **BP11** | **Work the board** — read which boards are in play, move and order tasks, edit what one says and re-triage it in that same editor, archive individually, delete; answer the completion offer a last task into Done raises (BR-109), the cards still open on the activity's board being on the surface already and what becomes of them answered with the close itself (BR-127) | user, continuously | | 6 | ✓ (step 2) | `wf §6.1`, `wf §6.3`, `arch §8 UC2` |
| **BP12** | **Manage board columns** — add a lane or rename one in one editor, reorder, change role, archive all, delete with or without cascade (BR-59: one Backlog, ≥1 Done, enforced once per template, BR-108, and enforced on the role change since naming a lane cannot reach it); a lane that becomes Done makes its cards done and may complete an activity, which raises BR-109's offer | user, rare | | 7 | — | `wf §6.1`, `arch §8 DeleteColumn`, `arch §10` |
| **BP13** | **Check out the work done** — confirm the account the movements since the last check-out say and read its four figures (BR-33, BR-124, BR-125), write the check-out notes, archive what that span completed (BR-34) | user, when they choose to settle what they have done | | 2 | ✓ (step 4) | `funnel §Archive`, `wf §6.4` |
| **BP14** | **Roll the day over** — at local midnight advance which day is current, so the day focus in play becomes the new date's; creates nothing, touches no previous date's record and offers nothing, the advance and an empty new day being said quietly (BR-44, UX-16) | Clock | **`scheduler pool`** + Bearing + user, who is told and does nothing | 1 | ✓ | `funnel §Day rollover`, `arch §12 Q1` |
| **BP15** | **Review archived material** — the two acts an archived item takes, reading it and narrowing the list being neither — unarchive an archived idea, goal, measure, project or task, which always cascades whole and is neither disclosed nor confirmed — one request judges whether the bundle can come back, acts where it can, and answers what came back or why it cannot (BR-25); and delete one out of the archive, disclosed by its own rule first (BR-05, BR-12) | user, occasional | | 3 | — | `wf §7.8` |
| **BP16** | **Consult the advisor** — ask in the context of the active view and selection, read the structured suggestions, apply or dismiss one at a time (BR-85); applying runs the user's own operation, so what it will take is disclosed and approved first (BR-72) | user, opportunistic | + Advisor service as a black-box pool | 6 | — | `wf §7.5` |
| **BP17** | **Maintain a project** — one editor serves starting a project and changing one alike (UX-04), taking its parent — an idea, a goal, a measure or nothing (BR-96) — and declaring it simple or activity-based once and for the project's life (BR-97, QB-44), the one request ensuring its template and its board rather than creating them; read the project list with its activity counts; archive it, which is the only way an activity is archived (BR-23, BR-112), or delete it (BR-114), both approve-or-abandon (BR-113) | user, when work begins or ends | | 5 | — | `act §1`, `act §12` |
| **BP18** | **Plan a project's course** — read the graph with its states and its Done / InProgress / Todo counts; edit and delete activities, one editor serving a new activity and a changed one alike (UX-04, BR-98, BR-104); order them with finish-to-start dependencies, refusing a cycle (BR-99, BR-100); set an activity's state, reopen a Done one, and close one whose last task has landed (BR-109) — disclosing the cards still open on its board first, and asking what becomes of them (BR-127). An activity-based project only (BR-97, BR-105). It does not absorb BP11: working an activity's board stays BP11's, and this process never touches a task's column | user, weekly to monthly | | 7 | — | `act §5`, `act §7`, `act §9`, `act §12` |
| **BP19** | **Keep an edit as a draft** — every draftable field in the product, drawn once: while the user fills one in, what they typed is kept as a draft that survives abandoning the gesture, a crash and a restart, changes nothing until the gesture completes, and is discarded by whichever write commits it (BR-121). Replaces the eleven per-process draft chains retired on 2026-10-11; a staged task batch is BP10's and not this (BR-63) | user, constantly | | 1 | ✓ (every edit) | `wf §3.2`, `wf §6.4`, SA 2026-10-10, SA 2026-10-11 |
| **BP20** | **Close Bearing** — end the session: the user leaves and the product shuts down. Nothing is pending (every gesture is committed or left as a draft, BR-121) and nothing is settled — the span since the last check-out stays open for the next one (BR-33). The start-up refusal's close is BP01's own path and keeps its own call site | user, once a session | | 1 | — | SA 2026-10-17 |

**Calibration.** Nineteen processes over **79** live call sites averages four a process, the
spread running from the single chains of BP08, BP14, BP19 and BP20 to BP04's eight. The column
counts what each drawing mints **today**: the retired ids are named per process in §6 and are not
counted here. The candidate list this table
was first written against held 104. **BP19** is new on 2026-10-11 and
is what took the average down: eleven processes each drew a draft chain of their own, all realizing
one operation, and they are retired in favour of one drawing plus a bound BR-121 on the step that
fills the field (SA 2026-10-11). **BP14** is the one left worth watching: a
single-step clock process is a BPMN only because the trigger is an actor that needs a lane, and it may
read better as a start event inside BP08 — the Software Architect's call. **BP01** is the other end of
the same question and settled the other way: it lost seven call sites on 2026-10-10 and 2026-10-11 —
the starter themes the template files already ship, then the onboarding wizard entire — and draws two,
because what a first launch does that a later one does not is *where it lands*, not a flow of its own.
Two processes reached fifteen call sites and both were split on 2026-10-10, each along a seam its own
entities already made: **BP05** gave the progress-measure lifecycle to **BP06**, and **BP17** gave the
plan to **BP18**. In every one of the three the drawing's annotation density was the symptom; the cut
followed an entity boundary, and in BP01's case another process's business.

**Not business processes, recorded so their absence is a decision.** The About, Keyboard-shortcuts and
Help dialogs carry no system interaction (static content). Toasts, skeleton loaders and empty states
are presentation of other processes' outcomes. The shared delete confirmation is a step inside whichever
process owns the entity, never a process of its own. **There is no Settings process** — there is no
Settings view (BR-76).

**Cross-process reuse** — several interactions are defined once and reused:
*Delete a theme / an idea / a routine* with their cascades (BP02, BP03, BP04),
*Archive a task* (BP11, BP12, BP13 — the three acts BR-23
names), *Set an activity's state* (BP11's completion offer, BP12's own since 2026-10-18, and BP18) and *read what closing it takes* (BP18), *Archive a goal* with the
disclosure that precedes it (BP05 — the check-out archives inside its own completing write instead,
BR-30), *Read the inferred statuses, the draft and the linked projects* (BP05, BP07), the *goal editor* (BP04's promotion and BP05's own), the *project editor* (BP04, BP05 and BP17, each submitting where it was opened), and the work check-out itself, reachable from Execution and
from a focus view (BP13). *Unarchive* is no longer in this list: BP15 serves all five archivable
kinds from one call site rather than reusing anything. *Record vision and mission* left it on
2026-10-11 with the onboarding wizard: BP01 retired its copy, so BP02 is the only process that
records the prose. Each is drawn as that process's **own call site** `BPxx.yy`; whether two call sites resolve to one System
Interaction is a Design finding recorded in `si-binding.yaml`, never asserted here (ADR-069, §6), with
`reuse.yaml` carrying the rationale.

**Economic framing (the business map) is OWED** — see §10; the price tag per BP is a subjective value
(QB-09).

---

## 6. Call sites per business process

**No System Interaction ids are assigned here; the call-site ids below are minted by their own drawings, at Mockup, and the facet ids a Design binding gives them are not minted at this stage
either** (ADR-069, superseding ADR-066):

| | belongs to | minted | shape |
|---|---|---|---|
| **Call site** — the drawn system chain | the **business process** | at **Mockup**, when the chain is drawn, by that drawing's author alone | `BP01.03` |
| **System Interaction** — the operation on a Manager facet | the **system** | at **Design**, when the architect decides the system offers it | `SIxx.yy` |

So a `.bpd` carries `BPxx.yy` call-site tags — `bpmn-dsl lint` rule 9 **refuses** an `SIxx.yy` tag in a
drawing — and which System Interaction, and which permutation of it, each call site resolves to is
recorded at Design in `si-binding.yaml`, where it may be re-pointed as a one-file data edit without
touching any drawing.

The groups below are therefore not collapsed. Several do name what will turn out to be one operation
— *Record vision and mission* appears under both BP01 and BP02 — and deciding that here would assert
a structural decision before the information to make it exists. Each process names the chains it
calls; the collapsing is a Design finding, recorded as two `callSites` rows against one interaction.

Grouped by the BP that owns them. A group marked **(drawn)** is no longer a candidate list: those
call sites are minted, they carry the ids their `.bpd` gives them, and the drawing is what defines
them. The unmarked groups are still candidates and will be replaced by their drawing's own ids.

**BP01 — "Start Bearing"** (drawn) — `BP01.01` Start up · `BP01.09` Close Bearing. Seven ids are
**retired** and never reused: `BP01.02` *Seed the starter themes* (SA 2026-10-10, the themes ship
with the template files) and, with the onboarding wizard (SA 2026-10-11), `BP01.03` *Amend a starter
theme*, `BP01.04` *Record vision and mission*, `BP01.05` *Complete onboarding*, `BP01.06` *Remove a
starter theme*, `BP01.07` *Add a theme* and `BP01.08` *Draft the wizard input* — every one of them
`BP02`'s work.

**BP02 — "Maintain life themes"** (drawn) — `BP02.02` Edit a
theme · `BP02.04` Reorder themes · `BP02.05` See what deleting a theme
takes · `BP02.06` Delete a theme · `BP02.08` Record vision and
mission. **Four are retired** (SA 2026-10-11), their ids never reused (ADR-066): `BP02.03` *Amend a
theme*, because one editor serves creating and editing and what separated the two chains was a new
theme's placement in the order, which is not business relevant; `BP02.07` *Read
vision and mission*, because the surface carries it whole and an expand has nothing left to
fetch; `BP02.09` *Restore the shipped life areas*, with BR-83; and `BP02.10` *Draft the theme input*,
because a theme is a name and a colour and a colour does not draft

**BP03 — "Maintain routines"** (drawn) — `BP03.02` Edit a
routine · `BP03.04` Pause or resume a routine · `BP03.05` Reorder
routines · `BP03.06` See what deleting a routine takes · `BP03.07` Delete a routine

**BP04 — "Capture and curate ideas"** (drawn) — `BP04.02`
Edit an idea · `BP04.05` Reorder ideas
· `BP04.06` See what archiving an idea takes · `BP04.07` Archive an idea · `BP04.08` See what
deleting an idea takes · `BP04.09` Delete an idea · `BP04.11` Define a goal · `BP04.12` Create a
project — the last two minted 2026-10-16: the editor opens over the Ideation view with the idea as
the goal's link or the project's parent and is **submitted here**, so the write is this drawing's,
while maintaining the goal is BP05's and working the project BP17's

**BP05 — "Commit to and maintain a goal"** (drawn) — `BP05.02`
Edit a goal · `BP05.11` Reorder goals within a theme · `BP05.12` See what archiving a goal
takes · `BP05.13` Archive a goal · `BP05.14` See what deleting a goal takes · `BP05.15` Delete a
goal · `BP05.19` Create a
project — both minted
2026-10-16, because checking a goal out and starting a project on one are acts on the Goals view's
own goal: the first reads what the view does not carry (the status inferred per measure, an
earlier sitting's draft, and the projects linked to the goal, on which the check-out settles its
archiving), the second submits the project editor where it was opened, and the sitting
and the project's course stay BP07's and BP18's. Retired: `BP05.17` *Read check-in history* — minted and withdrawn on 2026-10-16 with the
goal-held check-in history it read, a measure keeping its own — `BP05.16`, the draft
chain, 2026-10-11, and `BP05.06`, `BP05.07`, `BP05.08`, `BP05.09`, `BP05.10` — the progress-measure
lifecycle moved to BP06 on 2026-10-10 and the numbers are never reused, which is why the group runs
`.01`–`.05`, then `.11`–`.15`, then `.18`–`.19`.

**BP06 — "Measure a goal's progress"** (drawn) — `BP06.02` Record a progress check-in · `BP06.03` Edit a progress
measure · `BP06.05` Reorder progress measures · `BP06.07` Remove a progress
measure · `BP06.11` Archive a progress measure. `BP06.11` is minted on 2026-10-16, with the ruling
that a measure is archivable on its own (BR-23): one that turns out not to say anything about its
goal is set aside rather than deleted. Two impact reads are retired the same day, their ids never
reused (ADR-066): `BP06.06` *See what removing a measure takes* and `BP06.10` *See what archiving a
measure takes*. The only thing a measure owns is its check-in history, which goes with it unasked, so
neither act discloses anything and neither is approved — the shape a task's deletion already has
(BR-17, BR-115). `BP06.01` *Read a measure's check-in history* is retired on 2026-10-17, its id never
reused: the check-ins are in play with the measure, so looking at how one has moved asks the system
for nothing (DRW-14)

**BP07 — "Check out a goal"** (drawn) — `BP07.01` Read the inferred statuses and the
linked projects · `BP07.04` Close out the goal. Three are retired on 2026-10-17, their ids never
reused (ADR-066): `BP07.03` *See what archiving the goal takes* — the check-out discloses nothing and
approves nothing, the sitting carrying the goal's linked projects and picking which go with it
(BR-30, BR-112) — and `BP07.05` *Seed a follow-up goal* with `BP07.06` *Create the follow-up goal*,
because the sitting holds every decision and one request executes them all: the check-out stored, the
archiving done, the follow-up created from BR-31's own inheritance rules, the outcome reported.
Editing that follow-up is no longer part of the check-out — it is a goal like any other and BP05's
editor amends it

> **Close-out and archiving are not the same act, and unarchiving is the inverse of neither.** Closing
> out records a judgment (outcome, per-measure statuses, retro) and offers to archive as its closing
> action. Unarchiving brings a goal back into the working set; it does not revoke the check-out
> record, which stays with the goal. So the inverse pair is archive/unarchive, and close-out sits
> beside it: a goal can be archived directly, at any time, whether it was checked out or not
> (BR-23, QB-32).

**BP08 — "Set a day's focus"** (drawn) — , the date's
committed focus among them · `BP08.02` Set the day's focus. Retired on 2026-10-16, its id never
reused (ADR-066): `BP08.03` *Read the day's focus* — the write answers with the focus it committed,
so a client that just wrote the state knows it, and the editor's own opening read carries what the
date already holds


**BP10 — "Capture tasks"** (drawn) — `BP10.02` Stage a task · `BP10.03` Edit a staged task, the
priority among its fields and a move into another priority column the same request · `BP10.04`
Reorder staged tasks · `BP10.05` Discard staged tasks · `BP10.06` Commit the staged tasks. Retired on 2026-10-17, its id never reused (ADR-066): `BP10.07`
*Read the staged batch* — every record is loaded at start-up, so a batch left staged is in play and
capture picks it up without asking (DRW-14).

**BP11 — "Work the board"** (drawn) — `BP11.03` Move a task · `BP11.05` Order a task · `BP11.06` Edit a
task, the priority among its fields · `BP11.07` Archive a task · `BP11.08` Delete a task · `BP11.09` Set the activity Done ·
Retired on 2026-10-18, its id never reused: `BP11.11` *See what closing the activity takes* — the
move's answer raises the offer and the open cards are derived (D-31), so nothing is asked.
Retired on 2026-10-16: `BP11.04` *Prioritize a task*,
the priority being a field of the task and its change a variation of the one editing request
(DRW-12, DRW-23)

**BP12 — "Manage board columns"** (drawn) — `BP12.02` Edit a
column, whether the lane is new or not · `BP12.04` Reorder columns · `BP12.05` Change a column's role ·
`BP12.06` Archive a column's tasks · `BP12.07` See what deleting a column takes · `BP12.08` Delete a
column · `BP12.10` Set the activity Done, minted on 2026-10-18 for the completion offer a lane that
becomes Done raises (BR-109, BR-60); `BP12.09` is a retired id and is not reused (ADR-066). Retired on 2026-10-16: `BP12.03` *Insert a column*, one editor per entity serving a new lane
and a renamed one alike, with where it lands left to `BP12.04` (UX-04, DRW-11)

**BP13 — "Check out the work done"** (drawn) — `BP13.01` Read the account since the last check-out · `BP13.03` Check out the work

**BP15 — "Review archived material"** (drawn) — `BP15.03`
Unarchive an item · `BP15.04` See what deleting the archived item takes · `BP15.05` Delete an
archived item. `BP15.04` and `BP15.05` are minted on 2026-10-16 and close `G-1`: the rules let an
archived item be deleted outright (BR-05) and the unarchive refusal exists for a member deleted out
of the archive (BR-25), but no process offered the act, and the owning processes all read live items
only. Retired the same day, its id never reused (ADR-066): `BP15.02` *See what unarchiving will
bring back* — unarchiving offers nothing to choose and destroys nothing, so it discloses nothing and
is not confirmed, and the judging is `BP15.03`'s own first act, reported with whatever came back.
The five archivable kinds are not five operations: the kind and the filter are the read's payload,
and unarchiving — like deleting — is one request whose consequences differ by what the item carries,
so §6's eight candidates drew as four.

**BP14 — "Roll the day over"** (drawn) — `BP14.01` Roll the day over. Advancing the date is the whole
of it: there is nothing to collapse into the one request, and what the surface then says is its
answer being shown (UX-16) rather than a second chain.

**BP17 — "Maintain a project"** (drawn) — `BP17.02` Create a
project · `BP17.04` See what deleting a project takes · `BP17.05` Delete a
project · `BP17.14` See what archiving a project takes · `BP17.15` Archive a project. Retired: `BP17.16` — the draft chain, 2026-10-11 — and
`BP17.06` … `BP17.13` — the plan moved to BP18 on 2026-10-10 and the numbers are never reused, which
is why the group runs `.01`–`.05` and then `.14`–`.15`. **Archiving a project was missing from this
list's candidates** although BR-23 makes it an act; it belongs here, since archiving a project is the
only way an activity is archived at all.

**BP18 — "Plan a project's course"** (drawn) — `BP18.02` Create an
activity · `BP18.04` Set an activity's state · `BP18.05` See what
deleting an activity takes · `BP18.06` Delete an activity · `BP18.07` Add a dependency · `BP18.08`
Remove a dependency · `BP18.10` See what the state change takes.

**BP20 — "Close Bearing"** (drawn) — `BP20.01` Close Bearing. Minted on 2026-10-17: leaving the
product was drawn by no process, `BP01.09` being reached only from the refusal path of a launch that
cannot continue. Closing is one operation drawn by two processes, and which System Interaction both
resolve to is Design's (ADR-069). It settles nothing and asks nothing: a confirmation guards against
losing work, and what is half-written is a draft by then (BR-121).

**BP19 — "Keep an edit as a draft"** (drawn) — `BP19.01` Keep the edit as a draft. One chain for
every draftable field in the product. It replaces the eleven per-process draft chains retired on
2026-10-11 — `BP03.08`, `BP04.04`, `BP05.16`, `BP06.09`, `BP07.02`, `BP11.10`, `BP12.09`, `BP13.02`,
`BP16.08`, `BP17.16`, `BP18.09` — whose ids are never reused (ADR-066): storing a draft is one
operation, so it is drawn once and every editing process binds BR-121 to the step that fills the
field. A staged task batch is not this (BP10, BR-63).

**Also retired on 2026-10-11, for a different reason** — `BP02.03` *Amend a theme*, `BP03.03`
*Amend a routine*, `BP04.03` *Amend an idea* and `BP06.04` *Amend a progress measure*: one editor
per entity serves creating and editing alike (UX-04), and nothing separated each pair of chains
but the fields they stored, so each is ONE request now — `BP02.02` *Edit a theme*, `BP03.02`
*Edit a routine*, `BP04.02` *Edit an idea*, `BP06.03` *Edit a progress measure*. Their ids are
never reused.

**BP16 — "Consult the advisor"** (drawn) — `BP16.02` Ask the advisor · `BP16.03` Take the advisor's answer · `BP16.04` Apply the proposal · `BP16.05`
Dismiss the proposal · `BP16.06` Clear the conversation · `BP16.07` See what applying will take. The round trip to the service is two
chains because the advisor is never blocking (BR-66); the ten catalog types are a proposal's
payload, not ten operations, and each act takes the one proposal the user picked (~~BR-71~~). Retired on 2026-10-17, its id never reused (ADR-066): `BP16.01` *Open
the advisor conversation* — the session's conversation and the view the user is on are both in play,
so opening the panel asks the system for nothing (DRW-14).

> **Drafting is ONE call site in the whole product** (SA 2026-10-11). Every draftable field drafts
> as it is filled in (BR-121), and keeping a draft is one operation wherever the field sits — so it
> is drawn once, as `BP19.01`, and every editing process binds BR-121 to the step that fills the
> field instead of minting a chain of its own. Until 2026-10-11 eleven processes each had a
> *Draft the … input* call site; all eleven are retired and their ids are never reused (ADR-066).
> A staged task batch is not this: the user picks it up, amends it and commits it as a batch, which
> is work of its own (BP10, BR-63).
>
> **Fourteen page reads are retired on 2026-10-17**, their ids never reused (ADR-066): `BP02.01`,
> `BP03.01`, `BP04.01`, `BP05.01`, `BP08.01`, `BP09.01`, `BP09.02`, `BP10.01`, `BP11.01`, `BP11.02`,
> `BP12.01`, `BP15.01`, `BP17.01` and `BP18.01` — and `BP05.18` with them, the check-out observing for itself what the sitting judges (BP07). What a surface shows is loaded and derived at
> start-up, so arriving on one asks the system for nothing: the persistent data is §3 and
> [`11_Record-Inventory.md`](11_Record-Inventory.md), and every value computed from it, with the rule
> that governs it, is [`13_Derived-Data-Inventory.md`](13_Derived-Data-Inventory.md). **`BP09` stopped being a business
> process with them**: nothing was left but looking and moving, so it is `UIP02 — Choose focus
> period` now, beside `UIP01`, and the id `BP09` is retired and never reused (SA 2026-10-17).
>
> Count: **79 call sites** across the 19 business processes of §5, **all minted** — every process is
> drawn, so nothing on this list is a candidate any more. How many distinct System Interactions they
> resolve to is not knowable here (ADR-069 defers that to Design). Take 79 as the scope signal, and
> expect the interaction count to come out lower.

---

## 7. Screen model inventory

The surfaces that become the screen models in `docs/02_Business/06_Screen-Models/`. How the user moves between them, and that each is worked until they leave it, is drawn once in `UIP01_WorkInBearing` — a **User Interface Process**, not a business process: it mints no call site and asks the system for nothing (SA 2026-10-17). Every one except
the four Course surfaces has an ASCII wireframe and design notes in the source; the Course surfaces
are **owed** — `act` is prose, and the two throwaway mockups it links (`act §10`) are pre-Intent
explorations that nothing downstream may cite. What the Course view must show is ruled: an
automatically laid-out node diagram of activities and their finish-to-start dependencies
(activity-on-node, not Löwy's activity-on-arrow, which exists to carry the durations BR-111 drops),
colour-coded by state, with counts of Done / InProgress / Todo against the total, and no stored node
positions. Whether a node shows anything about its tasks is still open (SA 2026-10-09).

Four further surface facts belong here rather than to a business rule: the unfinished-predecessor flag
(BR-110) appears on the activity's node and on its board; the surface is never named *project design*
(BR-111, §2); the board strip stays bounded by folding — an activity-based project outside today's
focus folds into one entry that unfolds to its activities' boards (BR-116), whose exact gesture the
Execution screen model settles (QB-45); and creating a project (BR-96) is offered from the Idea, Goal and Course pages, with the
project-kind choice (BR-97) in the project editor.

The inventory is complete at view/dialog level — with two additions made on 2026-10-11, the activity state-change disclosure (BR-127) and the start-up
refusal below: `BP01` draws it and Contract `E-15`/`E-16`/`E-17` specify it, and it was the one
surface this table had missed. Drill-down into individual fields and component states
was out of scope for the sketch (`inv` preamble) except where a field is structural — the two
progress-check-in variants.

| Surface | Kind | Wireframe | Documented states |
|---|---|---|---|
| App shell (tab bar, content area, help entry) | shell | `§1` | active tab |
| Start-up refusal | modal, and the launch does not continue | `§7.7` | an unmet precondition on the machine (`E-16`) · a data folder Bearing will not touch (`E-15`, `E-17`). Acknowledging it closes the product (BR-122, BR-80, `BP01.09`) |
| Themes view | view | `§2.1` | populated · zero themes (`§7.6`) |
| Routines view | view | `§2.3` | populated · no routine yet · paused rows (BR-02, BR-10) |
| Vision & Mission header | inline section | `§2.1` | collapsed-set · expanded-set · never-set |
| Theme editor | dialog | `§2.2` | create · edit |
| Routine editor | dialog | `§2.3` | create · edit · paused |
| Delete confirmation (shared by every deletable entity, §4.2) | dialog | `§2.4` | with cascade option · without · column-reject |
| Vision & Mission editor | dialog | `§2.5` | — |
| Ideation view | view | `§3.1` | populated · collapsed/expanded card · zero ideas (`§7.6`) · archived view (`§7.8`) |
| Idea editor | dialog | `§3.2` | create · edit |
| Goals view | view | `§4.1` | populated · zero goals (`§7.6`) · archived view (`§7.8`) |
| Goal editor | dialog | `§4.2` | create · edit · carry-forward pre-fill · promote-from-idea pre-fill |
| Progress check-in | dialog | `§4.3` | numeric variant · boolean variant |
| Goal check-out | dialog | `§4.4` | — |
| Course view | view | owed | one activity-based project selected · project list · no projects · simple project (its one board, no plan — BR-97) |
| Project editor | dialog | owed | create (from an idea · from a goal · from a measure · from nothing) · edit · kind chosen at create (BR-97) |
| Activity editor | dialog | owed | create · edit · its notes · its dependency list |
| Dependency editor | inline on the graph | owed | adding an edge · refused as a cycle (BR-100) |
| Focus view — Week (smallest scope, BR-93) | view | `§5.1.b` | populated · no history (`§7.6`) · current week · past week · future week |
| Focus view — Month | view | `§5.1.c` | populated · no history · current month · past month · future month |
| Focus view — Year | view | `§5.1.d` | populated · no history · current year · past year · future year |
| Day focus editor (opened by selecting a day in any focus view) | panel/dialog — shape owed | `§5.1.a` | today · past day · future day · nothing to focus on (`§7.6`) · Chores present unselected (BR-107) |
| Execution view | view | `§6.1` | populated · collapsed column · empty board · no tasks anywhere (`§7.6`) · boards strip with today's focus grouped first and subtly marked (BR-116), the rest grouped by project with its filter (BR-101) · first board open when the day has no focus (BR-51) |
| Column overflow menu | menu | `§6.1` | — |
| Task context menu | menu | `§6.1` | Backlog variant · in-motion variant |
| Task creation (batch) | dialog | `§6.2` | staged · empty |
| Task editor | dialog | `§6.3` | in Backlog · in motion |
| Work check-out | dialog | `§6.4` | — |
| ~~Onboarding wizard (first run)~~ **VOID 2026-10-11** | — | `§7.1` | There is no wizard (BR-82). A first-time startup opens the Themes view, and editing a theme, a vision or a mission there is BP02's (BR-48). |
| About | dialog | `§7.3` | — |
| Keyboard shortcuts | dialog | `§7.4` | — |
| Advisor panel | split panel | `§7.5` | thinking · streaming · pending card · applied · dismissed · superseded · apply-failed · network error, which offers the question again (BR-75, BR-118) |
| Archive views (Ideation / Goals / Course / Execution) | view | `§7.8` | per type, reached from the tab that owns the kind, with whatever filtering and sorting the client offers (BR-92); Goals holds archived goals and archived progress measures, each measure named under the goal it belongs to, since a measure has no page of its own; Course holds archived projects, and the activities and tasks that went down with them. Each view carries the two acts an archived item takes: bring it back, or destroy it (BR-23, BR-112, BR-25, BR-05) |
| New-data-folder notice | transient notice | `§7.7` | — · **not a modal** (BR-81, SA 2026-10-11): it blocks nothing and nothing waits on it |
| Toasts | overlay | `§7.7` | success · error-with-retry · stacked (max 3) |
| Skeleton loaders | overlay | `§7.7` | — |

**There is no Settings view** (BR-76) and **no day-scoped focus view** (BR-93) — both recorded here so
the absences are reviewed decisions rather than omissions. Every focus view carries the same two
controls, inventoried once instead of per row (BR-46): step the period (previous · next · current) and
switch the scope. The day focus editor holds `§5.1.a`'s content; its shape is owed — inline, side panel
or dialog is for the screen models to decide.

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
| Load | Personal scale: ~10–20 active goals; a few hundred ideas; tasks over years of use. | `funnel §3`, `wf §7.11` |
| Storage | Versioned file store in the OS application-data folder, git-initialized on first run. Every state change is a commit. | `arch §2`, `wf §7.2` |
| Audit | Two layers, both load-bearing: git (*what changed*) and an operation log (*which operation, with what arguments*). Neither alone suffices. | `arch §2` |
| Durability | Drafts survive crashes; recovery after accidental data loss is a filesystem operation the user performs, not an app feature. | `arch §4`, `wf §7.7` |
| Integrations | Exactly one external dependency: the advisor service. Everything else is local. | `arch §4` |
| Offline tolerance | The app works fully offline. The advisor follows its configured model: a local model works offline, an online model does not, and then the inline error and retry are the whole answer. No queuing, no fallback, no second model. | `wf §7.7`, SA 2026-10-06 |
| Window | Minimum window size 1024 × 640 px, enforced by the shell, which refuses to resize below it. There is no maximum: the upper bound is the display, and the layout uses whatever size it is given. Comfortable ≈ 1280 × 720, ≈ 1600 × 720 with the advisor open — targets the layout is designed around, not limits. | `wf §7.9`, SA 2026-10-06 |
| Form factors | Desktop only. No mobile layout, no tablet target, no vertical reflow. Touch input is supported through 44×44 hit targets but not optimized for. | `wf §7.9` |
| Accessibility | Colour is never the only signal; every focusable element has a visible keyboard focus ring; the full keyboard map is first-class; `prefers-reduced-motion` is honoured. | `wf` guidelines #1, #12, #14 |
| Latency budget | The UI is optimistic and push-fed, so local mutations must feel instant; the advisor is the only surface allowed to show "thinking". | `arch §5` |
| Cost | Advisor token cost is the only running cost. No envelope stated — **owed at Contract**. | — |
| Operator | The user. No administrator, no ops role, no telemetry backend: “log for telemetry” means a local log file, read by the user or nobody. | `wf §7.5`, SA 2026-10-06 |

---

## 9. Candidate example data (walkthrough seed)

The wireframes carry one coherent dataset throughout. It is candidate data, not finished expectations
(ADR-040 §2), and it is the natural seed for the behavioural spike, the Mockup walkthroughs, and later
the spec layer's labeled seed rows (ADR-033).

- **Reference date:** Monday, 11 May 2026.
- **Themes:** Health · Career · Learning · Relationships · Personal — the set the template files
  ship (BR-82), one of them named **Career** (QB-08). There is no second set: the wizard that
  pre-seeded one is void (SA 2026-10-11).
- **Vision:** *"A focused, generous engineer who ships things he's proud of, while staying healthy and
  present with the people he loves."* **Mission:** *"Build durable tools and the discipline to use them daily."*
- **Ideas:** "Build Bearing v2" (Career, → goal) · "Migrate to Tauri" (Career, unlinked) ·
  "Run a 10k" (Health, → goal) · "Try cold plunges" (Health) · "Learn Korean (A2)" (Learning) ·
  "Take pottery classes" · "Renovate kitchen" (**Unthemed**). Counts quoted: 47 ideas total, 12
  goal-linked, 35 unlinked, 18 theme-less.
- **Goals** (the examples are OKR-shaped, so their progress measures appear as "KR1…KR4"): "Run a 10k by Jun 2026" (Health, Q2 2026, linked to "Run a 10k") with KR1 *Run 5k under 28 min*
  (numeric, start 32 min, current 29 min, target 28 min, ↓, 73%), KR2 *Complete 12-week training plan*
  (numeric, start 0, current 6, target 12 weeks, ↑, 50% → 73% at check-out), KR3 *Average 25 km/week
  running* (numeric, start 0, current 25, target 25 km, ↑, 100% ✓), KR4 *Sub-60-min 10k race day*
  (boolean, Not done) · "Reduce body fat to 15%" (Health, Q2 2026, theme-only) ·
  "Ship Bearing v2 by Q3 2026" (Career, Q3 2026, linked to "Build Bearing v2").
- **Progress check-in history:** Apr 16 → 2/12 (17%) · Apr 30 → 4/12 (33%, *"First long run done"*) ·
  May → 6/12 (50%, *"Halfway through. Pace is steady; long runs feel easier."*). Boolean: May 28 Not
  done → Jun 14 still Not done, *"Rainy race day, finished at 62 min — sub-60 missed."*
- **Routines:** Gym (3×/week, M·W·F) · Meditation (daily) · Sleep before 23:00 (daily, **paused**) ·
  Anki review (daily) — no theme on any of them (BR-02).
- **Projects and their course:** "Bearing v2" (parent: the goal *Ship Bearing v2 by Q3 2026*), with a
  plan of 18 activities — *Interviewing* and *Architecture* Done, *Project Design*, *Detail Design* and
  *Utilities + iFX* InProgress, the rest Todo, ordered bottom-up by the dependencies (`act §3`) ·
  "Renovate kitchen" (parent: the idea of the same name; a **simple** project — one board, no plan, BR-97).
- **Focus for May 11:** the activity *Project Design*; routines Gym, Meditation. Chores joins
  unselected, carrying the two routine tasks (BR-107). Week theme balance Career 3/7, none 4/7 — the Health and Learning
  shares this example used to show came off themed routines and went with the affiliation
  (BR-02, BR-47, SA 2026-10-13).
- **Tasks on the *Project Design* board:** Backlog — *Spec funnel*, *Migration plan* (Imp & Urgent);
  *Triage stale issues* (Not Imp & Urgent); two more in Imp & Not Urgent. To do — *Wireframes doc*,
  *Color tokens*, *Logo work*, *Onboarding flow*. In progress — *Themes view*. Done — *IA sketch*.
- **Work check-out on May 11**, settling the span since the May 10 check-out: completed 2 — *Wireframes doc*, *Color tokens*; started 1 —
  *Themes view (impl)*; still in progress 1; planned but never started 2 — *Logo work*,
  *Onboarding flow* (BR-125); notes *"Wireframes took longer than expected. Themes view started but blocked
  on the color picker decision."* The *Gym* chore moved into Done on Chores that day, so it is in the
  account like any other board's work and the same closing action archives it (BR-33, BR-34).
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

Closed and not reused: `G-11`, `G-12`, `G-13`, `G-15`.

| # | Missing artifact | Owner | Note |
|---|---|---|---|
| G-01 | **Business-process BPMNs** — 19 tagged `.bpd` sources → L1 + L2, one per BP in §5, in `docs/02_Business/01_Business-Processes/` | interview-architect | **Complete as of 2026-10-10** — all nineteen are drawn — `BP01`…`BP08`, `BP10`…`BP20`, the id `BP09` retired on 2026-10-17 — each a tagged `.bpd` with both levels generated, validated and rendered. The cut stands as confirmed that day, with BP05 split at the progress measure and BP17 split at the plan. One shape question stays open and does not block the gate: whether BP14 folds into BP08. |
| G-02 | **System Interaction markdowns + activity diagrams** | interview-architect | **Complete as of 2026-10-16** — §6 lists **79 call sites** across the 19 BPs, all minted, and `bpmn-dsl si-export` generates both artifacts for every one of them: a deterministic `BPxx.yy.json` and a developer markdown carrying that chain's Mermaid activity diagram (ADR-068, ADR-053). They are GENERATED and never hand-edited; `si-export --check` is the staleness gate. A drawing carries its own **call-site ids `BPxx.yy`**, minted as it is drawn; `SIxx.yy` ids are minted at **Design** and bound in `si-binding.yaml` (ADR-069, superseding ADR-066) — do not pre-assign either. |
| G-03 | **Screen models** in the project's own format in `docs/02_Business/06_Screen-Models/` | interview-architect | §7 inventories the 30+ surfaces; the ASCII wireframes are the input, not the artifact. |
| G-04 | **Provisional Sequence Map** in `docs/02_Business/03_Sequence-Map/` | `seqmap generate` | Derived from the BPs and screen models. |
| G-05 | **Business map** in `docs/02_Business/05_Business-Map/`, with a price tag per BP | Software Architect | The price tag is a subjective value: the most the Software Architect would pay for that BP if he had to pay (QB-09). ⚠ The method fits personal projects poorly — the numbers rank scope, they do not justify it. |
| G-06 | **LLM-authored behavioural spike** + its mandatory invented-decisions log (ADR-044) | interview-architect | The spike is what the stakeholder walks at Intent (ADR-045: flows early, data late). |
| G-07 | **Walkthrough capture** — the flows taken, the values entered, the outcomes confirmed | Software Architect | §9 is a candidate seed, not an approved walkthrough. |
| G-08 | **Q&A ledger** `Bearing.method/qa.yaml` | architect / Software Architect | Does not exist. `qa check` enforces no open blocking entry at Intent. §12's entries are the initial content. |
| G-09 | **Business-rules registry** (ADR-043) | interview-architect | §4's 121 live rule rows are the content; the registry is the capture-grade artifact the spike reads. |
| G-10 | **Volatility harvest** with provenance per entry | interview-architect | `arch §3` has the map; per-entry provenance ("every gateway, every *it depends*, every 1-of-N") is missing. Carried to the Blueprint document §2. |
| G-14 | **Deletion cascade for goals** — `funnel.md` and `wf §2.4` declare goal deletion cascade-free; the Software Architect reversed that on 2026-10-04. BR-15 is the statement of record | interview-architect | Not a contradiction between sources — a decision that supersedes them. |

---

## 11. Known contradictions between the source documents

Nine places where the sources disagree with each other, or with a ruling made since. **All are
resolved.** A resolution is recorded here, never written back into the source — a recording stays as
spoken (QB-01) — so this table is what the authoring pass reads.

| # | Contradiction | Where |
|---|---|---|
| ~~C-1~~ | ~~A detached goal has no theme.~~ **RESOLVED 2026-10-06** — a theme deletion that would orphan a goal or routine is rejected; `theme_id` stays required (BR-21, **QB-03**). **The routine half is SUPERSEDED 2026-10-11**: a routine's theme is optional (BR-02), so a theme deletion keeps its routines or takes them, and only a goal can turn the gesture into approve-or-reject. That puts `arch §9`'s own answer — *"Theme / Idea / Routine: `cascade=false` → detach"* — back in force for a routine, and leaves it overruled for a goal alone. | `arch §9` vs `funnel §Linking rules` |
| ~~C-2~~ | ~~Deleting a goal "clears any Focus selections referencing it".~~ **RESOLVED 2026-10-09** — the clause is **void**: a day focus holds **boards and routines** (BR-41) and never a goal, so a goal deletion has no focus selection to clear. What it does touch is its own measures and check-in history, and, optionally, its linked ideas (BR-15). Nothing to implement; the authoring pass drops the clause. | `wf §2.4` vs `funnel §Entity reference fields` |
| ~~C-3~~ | ~~Reserved-tag list differs across documents.~~ **RESOLVED 2026-10-06** — `{routine, untagged, all}` (BR-07, **QB-02**). **MOOT since 2026-10-09** — the tag itself is retired (QB-40) and BR-07 with it, so there is no reserved set to agree on. | `funnel`, `wf §3.2` vs `arch §8` |
| ~~C-4~~ | ~~Day check-out's task lists are “derived from task movement timestamps”, but Task carries none.~~ **RESOLVED 2026-10-06** — both lists are current-state predicates (BR-33, BR-35, **QB-23**), so no timestamp is needed and the sources' “moved to Done today” wording is superseded. **REOPENED AND ANSWERED THE OTHER WAY 2026-10-11** — the lists are movement-based after all (BR-124, BR-125), and the sources' original wording stands. | `wf §6.4` vs `arch §8` |
| ~~C-5~~ | ~~Per-task Archive action.~~ **RESOLVED 2026-10-06** — the action exists (BR-23, **QB-22**); `wf §6.1`'s context menus simply omit it. | `wf §7.8` vs `wf §6.1` |
| ~~C-6~~ | ~~A "Data-path-missing dialog" with radio options~~ ("Use a different existing data folder"). **RESOLVED 2026-10-09** — the radio options are **void**. The ruled behaviour is BR-80/BR-81 as drawn in `BP01`: create the folder, bring it under version control, and report it in a transient notice that blocks nothing — the `[ Quit ]` / `[ Continue ]` pair is void too (SA 2026-10-11), the launch carries on and lands on Themes (BR-82). No folder picker, no adoption of a repository Bearing did not create, no in-app restore — already recorded as Contract `E-13`. The authoring pass drops the radio list from the focus-landing table and from guideline #17's mention. (QA-01 falls with it: a transient notice has no Esc to answer.) | `wf §7.10`, guideline #17 vs `wf §7.2`, `wf §7.7` |
| ~~C-7~~ | ~~Tab-level preferences have no home.~~ **RESOLVED 2026-10-05** — remembered interface state is kept in a version-control-excluded subdirectory of the data folder (BR-92). It is not a setting, so removing the Settings document type cost nothing. | `wf §3.1` vs `arch §11` |
| ~~C-8~~ | ~~“Untagged” names two different things.~~ **RESOLVED 2026-10-06, and the second half voided 2026-10-09** — Ideation's section becomes **Unthemed** (it holds theme-less ideas, BR-03, **QB-21**). The Execution **Untagged** board that was to keep its name no longer exists: work with no project lives on **Chores** (BR-102), so the collision is gone rather than resolved. | `wf §3.1` vs `wf §6.1` |
| ~~C-9~~ | ~~UC5's routine-spawn guard is date-scoped.~~ **RESOLVED 2026-10-09** — `arch §UC5` reads *"existing routine tasks **for date**"* and spawns for every routine *"not already spawned **today**"*, which creates a second task for a routine whose earlier task is still outstanding. BR-42 forbids that: selection ensures **exactly one outstanding task**, whenever the earlier one was created, with due and overdue treated identically. **BR-42 governs.** The authoring pass restates the guard as *has no outstanding task for this routine*, dropping the date from both the read and the test. UC5's two other properties — additive-only, and never deleting tasks for deselected routines — already agree with BR-42. | `arch §UC5` vs BR-42 |

One further single-document slip, noted for the authoring pass rather than as a ruling: the Week-mode
wireframe shows five of seven day cards (`wf §5.1.b`). (The Themes-tab counter's scope was the other
one; it is answered — active only, BR-95.)

---

## 12. Business questions — Q&A ledger candidates (business tier)

**The original thirty-two are all answered** (the last on 2026-10-06), and so are `QB-33`…`QB-39`,
which opened on 2026-10-09 with the Project and Activity vocabulary and were answered the same day
across nine interview rounds recorded in `act`. The table is the record of what was asked and what was
decided, to be appended to `Bearing.method/qa.yaml` once it exists. `QB-40` (the tag), `QB-41` (deleting a parent
that has projects), `QB-42` (archiving one) and `QB-43` (archiving a goal) all opened and closed the
same day. **Three questions opened on 2026-10-10**, of which `QB-46` (an archived item whose parent is deleted)
closed the same day, as did `QB-47` (unarchiving a child whose parent is still archived). **None is open** in
this tier: `QB-44` (migrating a project between its two kinds) closed on 2026-10-10, and `QB-45` (how
the board strip folds) is re-filed to the screen models — a UI question the Intent gate does not need
answered (SA 2026-10-10).

| # | Question | Blocks |
|---|---|---|
| ~~QB-01~~ | ~~Do the four source documents satisfy the provenance requirement, standing in for recorded stakeholder sessions?~~ **ANSWERED 2026-10-06: yes — they are this project's recordings.** As imperfect as any recording: some of what they state is overruled. | — |
| ~~QB-02~~ | ~~What is the final reserved-tag set?~~ (C-3) **ANSWERED 2026-10-06: `{routine, untagged, all}`** — BR-07, a rule retired with the tag on 2026-10-09 (QB-40), so the answer is of record only. | — |
| ~~QB-03~~ | ~~When a theme is deleted without cascade, what happens to its goals and routines, whose theme is required?~~ (C-1) **ANSWERED 2026-10-06: the deletion is rejected** — BR-21. **Half SUPERSEDED 2026-10-11**: that answer now holds for the goals only — the routines are a declinable cascade, kept theme-less where the user declines it (BR-02, BR-13). | — |
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
| ~~QB-21~~ | ~~“Untagged” labels two unrelated things — rename one?~~ (C-8) **ANSWERED 2026-10-06: Ideation's section is renamed “Unthemed”**; Execution's `Untagged` board keeps its name. Theme-less ideas are legal and reachable two ways (BR-03), so the section stays — only its label was wrong. | — **SECOND HALF SUPERSEDED 2026-10-09 (C-8)** — the Execution `Untagged` board no longer exists; Chores replaces it (BR-102). |
| ~~QB-22~~ | ~~Can a task be archived individually, outside the day check-out?~~ (C-5) **ANSWERED 2026-10-06: yes** — from the task context menu (BR-23). | — |
| ~~QB-23~~ | ~~What makes a task appear in the day check-out's two lists?~~ (C-4) **ANSWERED 2026-10-06: current state, not movement.** Completed = **currently in Done**, whenever it got there; still open = **past Backlog and not Done**, whenever it was last touched (BR-33, BR-35). | — **SUPERSEDED 2026-10-11: movement, not current state** (BR-124, BR-125). |
| ~~QB-24~~ | ~~Does deleting a theme's ideas through the theme cascade also take those ideas' tasks?~~ **ANSWERED 2026-10-05: yes, the reach continues** — but not as a third opt-in. The cascade meta-rule (BR-12) gives the theme gesture two cascades (BR-13) and leaves everything below an idea to BR-14, which approves or abandons rather than offering a choice. | — |
| ~~QB-25~~ | ~~When a check-out resets a task, does it return to its exact old position or just to its old bucket?~~ **ANSWERED 2026-10-06: to the top of its triage section** — neither. Among tasks reset together, the further right their column, the higher they land; same-column tasks keep their relative order (BR-35). | — **MOOT 2026-10-11** — the check-out has no reset (BR-34). |
| ~~QB-26~~ | ~~When does a completed routine task archive itself?~~ **ANSWERED 2026-10-06: it does not.** Routine tasks get no special treatment — auto-archiving is dropped; they archive by the same acts as any task (BR-61, BR-22, BR-23). | — |
| ~~QB-27~~ | ~~The product has two opposite draft semantics.~~ **ANSWERED 2026-10-05:** there is one — **a draft survives abandonment** (BR-37, BR-63). The Software Architect withdrew the discard ruling of 2026-10-04: *"keeping the draft around is consistent… I didn't like the original wording."* Goal check-out is no longer the exception it was recorded as: its partial input is drafted too (BR-32). | — |
| ~~QB-28~~ | ~~Is a goal with no linked idea legitimate or flagged?~~ **ANSWERED 2026-10-05: both.** The state is legitimate and it is flagged, so that no idea being assigned is obvious. The flag keys off the current state, so the product never has to remember that a goal once had an idea. | — |
| ~~QB-29~~ | ~~Does a routine occurrence arise from being due, or from being due and selected?~~ **ANSWERED 2026-10-05: from being selected.** Selecting a routine ensures one outstanding task exists; due and overdue get identical treatment; re-selecting never duplicates; the clock creates nothing (BR-42, BR-44, BR-91). | — |
| ~~QB-30~~ | ~~What happens to a data folder version-controlled by something other than this Bearing?~~ **ANSWERED 2026-10-06: refuse to adopt it** — an older Bearing's repository and a never-Bearing one alike; the user moves the folder manually. No v1 migration; within-v2 migration comes later and is not a first-open concern (BR-80). | — |
| ~~QB-31~~ | ~~What is manual ordering of ideas for, and over what set?~~ **ANSWERED 2026-10-06: for grouping related ideas together, and nothing else.** Ideas end up only partly ordered on purpose; the order carries no priority and no consequence elsewhere in the funnel (BR-88). | — |
| ~~QB-32~~ | ~~Can a goal checked out *without* archiving be archived afterwards?~~ **ANSWERED 2026-10-06: yes — a goal can be archived at any time**, independent of check-out, which only offers it as a closing action. Typically it happens after check-out, by habit (BR-23, BR-30). | — |
| ~~QB-33~~ | ~~**Is a project an entity, or a state of an idea?** §3 records it as the state — an idea that carries work — with no document of its own, because the tag, the board and the focus selectable already exist and are keyed on the idea. The alternative is a `Project` entity between idea and board, which would need its own lifecycle, its own archive rule and a reason the tag cannot carry it.~~ **ANSWERED 2026-10-09: an entity of its own**, with one optional parent whose target may be an idea, a goal or a progress measure — BR-96. | §3, the funnel graphs, G-15 |
| ~~QB-34~~ | ~~**What does an activity carry, in business terms?** A name, an owner (always the user), a state, an estimate? Löwy's project design wants a duration estimate per activity, because float and the critical path are computed from it. Is Bearing's activity estimated, or only ordered?~~ **ANSWERED 2026-10-09:** a name, a state, its dependencies and its own notes field — nothing else yet, pending the UI prototype. **No estimate**, and therefore no float and no critical path — BR-111, `act §9`. | the Activity entity |
| ~~QB-35~~ | ~~**Does every task belong to an activity?** §3 says *at most one* — so loose tasks on a project's board stay legal, as untagged work already is (BR-90). Confirm, or require one. And: can an activity exist with no tasks yet (a planned but undecomposed piece of work)?~~ **ANSWERED 2026-10-09: every task belongs to exactly one board, and a board *is* an activity** — so exactly one activity, or the built-in Chores board (BR-101…BR-103). An activity with no tasks yet is a planned activity and perfectly legal. | BR-90, the Activity entity |
| ~~QB-36~~ | ~~**What is a dependency between activities, exactly?** Finish-to-start only, or also start-to-start? Bearing has **no** dependency notion anywhere today — no blockers, no predecessors — so this is new mechanics: cycles must be refused, and *ready* (every predecessor done) becomes a derived state the board has to show.~~ **ANSWERED 2026-10-09: finish-to-start only, within one project, forming a graph; a cycle is refused and nothing else blocks** — BR-99, BR-100, BR-110. | the Activity entity, Execution |
| ~~QB-37~~ | ~~**How do activities and goals relate?** BR-08 kept goals flat *for now*, with decomposition served by sequential goals or tasks — the layer activities now occupy. Are they two independent decompositions of one project (a goal measures, an activity sequences), or does one of them give way?~~ **ANSWERED 2026-10-09: two independent decompositions, joined optionally at the project** — a goal measures, a plan orders. BR-08 is unchanged: phase goals stay. BR-96, `act §8`. | BR-08, the Goal entity |
| ~~QB-38~~ | ~~**Does the day's focus select an activity, or stay on the project?** Today a focus selects tags and routines (BR-40, BR-41) and tags bring boards into play (BR-50). If activities are where order lives, focusing *the next ready activity* is the natural gesture — and it changes the hot path, which is the one flow the product exists for. Related: a blocked task can be Important & Urgent, which the three Eisenhower buckets cannot express.~~ **ANSWERED 2026-10-09: the focus selects activities** — several per project where wanted, with the plan's *ready* set offered. BR-106, merged into **BR-41** on 2026-10-10. | BR-40, BR-41, BR-50, §1.2 |
| ~~QB-39~~ | ~~**Where does the activity rung live in the product?** A sixth funnel stage with its own tab, a level inside Execution (a strip above the board, like Boards), or a network view of its own. The answer settles what §2's five-stage story becomes and how many BPs §5 owes.~~ **ANSWERED 2026-10-09: a sixth stage and a sixth tab, Course**, between Goals and Focus — §2. | §2, §5, §7 |
| ~~QB-40~~ | ~~Is the tag retired?~~ **ANSWERED 2026-10-09: yes, retired** — *"tags were a somewhat awkward solution to connect different Bearing parts."* The Software Architect's one condition was the theme link, and §3.1 shows the chain covers it in **more** cases than the tag did, since a goal-parented or measure-parented project always reaches a theme where `Task ──tag──► Idea` never could. **BR-06** and **BR-07** are retired; **BR-05**, **BR-62**, **BR-64**, **BR-65**, **BR-86**, **BR-90** restated; the Idea editor's `Tag *` field and its four states go; task capture picks a board. | — |
| ~~QB-41~~ | ~~What does deleting an idea or a goal do to the projects hanging off it?~~ **ANSWERED 2026-10-09: cascade the project with the user's approval, or reject the deletion** — the same answer for both cases (BR-14, BR-15). Detaching to parentless is **not** offered, although a parentless project is legal (BR-96), which makes this deliberately stricter than BR-21 and is recorded there as such. | — |
| ~~QB-42~~ | ~~Can a project be archived — and does archiving an idea reach the projects hanging off it?~~ **ANSWERED 2026-10-09: both — archiving an idea archives its projects, with the user informed and approving** (BR-112). So a project is archivable, and archiving reaches it. | — |
| ~~QB-43~~ | ~~Does archiving a goal archive the projects parented on it, or on one of its measures?~~ **ANSWERED 2026-10-09: ask, and offer three answers** — cascaded archiving, the goal alone, or rejection (BR-112). *"Archiving a goal without archiving related projects sounds slightly weird to me, but it might happen."* The keep option exists here and nowhere else below a goal, because an archived goal still exists and so orphans nothing. | — |
| ~~QB-44~~ | **ANSWERED 2026-10-10: no — there is no migration in either direction.** *"No, a migration would be quite messy"* (SA). BR-97 carries it: the kind is declared at creation and holds for the project's life. A task cannot move between boards (BR-64), so nothing carries the work across either — the other kind means a new project, planned from scratch. ~~Can a project migrate between its two kinds — simple → activity-based, or back?~~ BR-97 makes the kind a declaration at creation, which leaves migration unanswered: *"what is unclear to me right now is whether we should support migration from simple to activity-based or back"* (SA 2026-10-10). The two directions are not symmetric. **Simple → activity-based** has a defensible shape: the project's one board becomes its first activity, keeping its tasks and its columns, and further activities are planned after it. **Activity-based → simple** has none that preserves BR-103: *N* boards would have to collapse into one, merging *N* task sets into one column template, and an activity's identity would be destroyed rather than archived. The third answer is the one that was taken. | BR-97, BR-101, BR-103, BR-64 |
| ~~QB-45~~ | **RE-FILED 2026-10-10 — a UI question, not a business one, and nothing at this gate waits on it.** ~~How does the board strip fold and unfold?~~ BR-116 fixes the *bound* — an activity-based project outside today's focus is one entry, not one entry per activity — and leaves the gesture open: *"we can do so by folding activity-based projects not part of the Day Focus boards into a single chip and support unfolding. How exactly I don't know yet"* (SA 2026-10-10). Open sub-questions: whether a folded chip shows a count or a state summary; whether unfolding is transient or sticky; whether the boards *in* today's focus stay unfolded always; and what happens when today's focus alone already overflows the strip. It is settled with the Execution screen model (G-03), where the bound BR-116 fixes is the business input it needs. | BR-116, BR-41, §7 |
| ~~QB-47~~ | ~~May an archived item be unarchived on its own while its parent is still archived?~~ **ANSWERED 2026-10-10: no — and the rule is general.** Unarchiving is rejected unless it reproduces exactly the state the item was archived from (BR-25), so restoring a task whose board has since been archived is refused rather than re-parented. | — |
| ~~QB-46~~ | ~~What happens to an archived item whose parent was deleted while it was away?~~ **ANSWERED 2026-10-10: option A — the deletion reaches the archive** (BR-117): *"a deletion is stronger than archiving and it's the simplest. Deletion is reversible thanks to the git history."* The question as it stood: nothing in §4.2 says whether a deletion cascade reaches into the archive, so an archived descendant can outlive its parent and unarchive into an illegal state — *"unarchiving it might lead to invalid state"* (SA 2026-10-10). Reachable cases: an archived project under a deleted idea, goal or progress measure; an archived goal under a deleted theme; an archived task under a deleted activity, simple project or column. Not cases: an archived idea under a deleted theme, since theme-less is legal (BR-03), and a progress measure, which is not archivable (BR-23). Four options. **A — the deletion reaches the archive:** the cascade counts archived descendants and names them in its disclosure, so no orphan can ever exist and BR-25 stays unconditional; the cost is that a deletion destroys parked work the working view never showed, with the disclosure as the only warning. **B — an archived descendant blocks the deletion:** reject it until the user unarchives and deals with it; the cost is the extra step for a predetermined answer that BR-19 was just relaxed to avoid, plus a hunt through the archive. **C — the archive keeps ancestry as a snapshot, not a link:** unarchive restores to a legal home chosen at restore time — a parentless project (BR-96), the Chores board (BR-103), the Backlog column — asking where the law forbids the orphan state; the cost is that unarchive stops being the exact inverse of archive (BR-25) and becomes a gesture that can ask a question. **D — an orphan is readable but not restorable:** the archive keeps it as a record and refuses the unarchive with its reason; the cost is a one-way archive and a new item state the rest of the model has no notion of. A was also the only one the existing body already implied — BR-26 makes the archive a visibility state rather than a separate store, BR-12 grants an archived child's rule no exemption, and BR-25's exact-inverse claim holds only if a deletion cannot leave an illegal survivor. | — |

---

## 13. Downstream — what this gate hands on

- **To Blueprint:** the volatility harvest (`arch §3`, recorded here as a Discovery side-channel), the
  entity relationships of §2.1's Graph B, the business rules of §4 as the behaviour the model must
  realize, and the business processes of §5 with the call sites their drawings mint as the chains to
  decompose against. This gate hands on no System Interaction: an SI is minted at Design (ADR-069,
  §6). Revisit when SIs and use cases are dealt with.
- **To Contract:** §4's concrete thresholds and defaults, §9's example dataset as seed-row candidates,
  §8's operational concerns as deployment-decision input, and the stack intent (Svelte + C#).
- **To Acceptance:** the daily hot path (§1.2) as the primary acceptance flow, the approved walkthroughs
  once captured, and the UI craft rules carried in the Acceptance document.

---

## 14. Aspect interaction map

A review instrument, not a rule table: it names Bearing's high-level aspects and every pair of them
that does or could couple, so that a new rule can be checked against the pairs it touches instead of
against the whole document. It is appended rather than inserted because a `§N` is an identifier the
way a `BR-` number is — moving the sections that follow §4 would break every citation to them.

**How to read it.** The last column is where the coupling is ruled. **A pair with nothing there is a
gap**, and closing one is what this table exists for. Every pair below is currently ruled. A rule that
appears nowhere in the table is one that lives inside a single aspect and crosses nothing — which is
checkable, and is how the table itself is audited.

**The aspects.** **A1** funnel structure and linking · **A2** project kinds and plans · **A3** boards,
columns and tasks · **A4** Chores · **A5** routines and scheduling · **A6** day focus and periods ·
**A7** check-out · **A8** deletion and cascade · **A9** archive and unarchive · **A10** progress
measurement · **A11** ordering and grouping · **A12** colour and theme reach · **A13** advisor ·
**A14** drafts, gestures and undo · **A15** storage, version control and first run · **A16** surface
freshness and navigation

| Pair | What couples them | Ruled by |
|---|---|---|
| A1 × A2 | a project's parent is an idea, a goal or a measure, or nothing; an activity needs a project | BR-96, BR-98 |
| A1 × A3 | a board's owner is an activity or a simple project; a task sits on exactly one board | BR-101, BR-103 |
| A1 × A4 | a task with no project behind it lives on Chores, captured there like anywhere else | BR-62, BR-90, BR-102 |
| A1 × A5 | a routine stands beside the funnel, under no theme at all | BR-02, BR-10 |
| A1 × A6 | what a day selects are funnel leaves — boards and routines | BR-41 |
| A1 × A7 | a goal check-out judges a goal; carry-forward inherits its theme and its ideas | BR-27, BR-31 |
| A1 × A8 | every link is a cascade edge, and the nearest rule governs | BR-12 … BR-21 |
| A1 × A9 | archiving reaches along the same edges, with fewer of them, and an archived item is frozen | BR-05, BR-24, BR-112 |
| A1 × A10 | a progress measure can be a project's parent | BR-96 |
| A1 × A11 | a collection the user has ordered by hand keeps that order; activities have none | BR-88, BR-119 |
| A1 × A12 | colour reaches a task through the project chain | BR-09, §3.1 |
| A1 × A13 | the advisor reads the whole funnel | BR-67 |
| A1 × A14 | an idea's notes draft as they are typed and commit when the gesture completes | BR-121 |
| A1 × A15 | no goal before a theme exists; the shipped life areas seed the funnel, once, with the data folder | BR-80, BR-82, BR-84 |
| A1 × A16 | counts and flags are derived from current state, and a passed horizon is flagged quietly | BR-04, BR-22, BR-95, BR-118 |
| A2 × A3 | the project kind decides how many boards; a board exists only by its owner being created, on the Course page; one column template per project | BR-65, BR-97, BR-101, BR-105, BR-108 |
| A2 × A3 | moving an activity's last task to Done may offer to close the activity | BR-109 |
| A2 × A6 | the selection is 0..N projects and 0..M activities inside each; the plan knows which are ready | BR-41, BR-99 |
| A2 × A7 | the plan offers the day's boards; the check-out's scope is not bounded by them | BR-33, BR-41 |
| A2 × A8 | project and activity cascades are approve-or-abandon | BR-104, BR-113, BR-114 |
| A2 × A9 | archiving a project takes its activities and their tasks; unarchiving is its inverse | BR-25, BR-112 |
| A2 × A10 | a goal measures and a plan orders; they coexist, joined at the project | BR-08, BR-96 |
| A2 × A11 | a list of activities is ordered by dependencies, then by name | BR-119, BR-120 |
| A2 × A14 | the activity-completion offer is offered, never imposed | BR-109 |
| A2 × A16 | the strip groups today's focus first and folds out-of-focus projects | BR-116 |
| A3 × A4 | three kinds of board; Chores carries a column template of its own, is captured onto only by being the board the user is on, and a task never moves onto or off it | BR-49, BR-62, BR-64, BR-108 |
| A3 × A5 | a routine's task is an ordinary task | BR-61 |
| A3 × A6 | which boards are in play | BR-50 |
| A3 × A7 | the completed list reads the date's movements, so a later role change cannot rewrite what a check-out reported; the state figures read columns, so a role change moves them until the span is checked out | BR-33, BR-35, BR-60, BR-124 |
| A3 × A8 | a column deletion cascades or is refused; a task owns nothing | BR-17, BR-18 |
| A3 × A9 | a task archives three ways, one of them a whole column's worth | BR-23 |
| A3 × A11 | the three priorities, and a task's priority re-applying when it is moved back to the Backlog | BR-53, BR-54, BR-55 |
| A3 × A13 | the advisor reads a column's role, never its name | BR-58 |
| A3 × A14 | capture is a batch; one entity is acted on at a time | BR-63, BR-85 |
| A4 × A5 | a selected routine's task lands on Chores | BR-42 |
| A4 × A6 | Chores joins the day derived, never chosen | BR-50, BR-107 |
| A4 × A7 | a chore is in the account and in the archive action, no differently from any other board | BR-33, BR-34 |
| A4 × A9 | Chores is never archived and never deleted | BR-23, BR-102 |
| A4 × A12 | a chore reaches no theme by any path, so it carries no colour | §3.1, BR-02, BR-09 |
| A4 × A15 | Chores comes into existence at the first start-up | BR-80, BR-102 |
| A4 × A16 | Chores sits in the front group while it is in play | BR-51, BR-116 |
| A5 × A6 | the schedule computes due and overdue, a paused routine being out of it; selecting is what creates the task, on any date | BR-40, BR-42, BR-43, BR-91 |
| A5 × A8 | the occurrences cascade is declinable | BR-16, BR-19 |
| A5 × A9 | a routine is paused, never archived, and its completed task never archives itself | BR-22, BR-23 |
| A5 × A13 | the advisor may propose pausing a routine; applying runs the user's own operation | BR-72 |
| A6 × A7 | the check-out's scope is every board worked on, in the day's focus or not; a day nobody settled is not lost, because the next check-out's span reaches back over it | BR-33, BR-35, BR-45 |
| A6 × A9 | archiving withdraws a thing from the selectables | BR-43 |
| A6 × A11 | period views aggregate the day grain and report theme balance | BR-40, BR-46, BR-47 |
| A6 × A13 | the advisor may propose a day's focus; applying runs the user's own operation | BR-72 |
| A6 × A15 | the focus is committed plan data; the Chores membership is never stored | BR-107 |
| A6 × A16 | rollover says quietly that the date advanced, and that the new day has no focus, without interrupting anything or offering anything | BR-44, BR-51, UX-16 |
| A7 × A9 | the closing actions archive, and closing out is not archiving | BR-30, BR-34, §6 |
| A7 × A10 | per-measure status is inferred, and the inference is overridable | BR-28, BR-29 |
| A7 × A14 | both check-outs draft their partial input, and the check-out shape is reusable by whatever needs one next | BR-32, BR-37, BR-39 |
| A7 × A15 | a check-out's log is history the moment it is written; rollover only advances which day is current | BR-38, BR-44 |
| A8 × A9 | a deletion reaches the archive; an unarchive must leave a consistent state | BR-25, BR-117 |
| A8 × A13 | an accepted delete suggestion runs the user's delete, disclosure and approval included | BR-69, BR-72 |
| A8 × A14 | no in-app undo, said at the point of deletion; one entity per gesture | BR-20, BR-85 |
| A8 × A15 | recovery from a deletion is a version-control act | BR-20, BR-79 |
| A9 × A10 | a goal's measures and their check-in history go with it, unasked, and come back with it; a measure archived on its own takes its own history along and comes back only into a live goal; no check-in can be recorded against an archived goal or an archived measure | BR-05, BR-15, BR-23, BR-25, BR-112 |
| A9 × A11 | an archived item's position is never occupied while it is away | BR-25 |
| A9 × A15 | archived items are retained on disk | BR-26 |
| A9 × A16 | hidden from the working view, reachable only by an explicit act | BR-26 |
| A10 × A8 | removing a measure takes the measure and its check-in history, unasked, and a project parented on it survives minus the link | BR-96, BR-115 |
| A10 × A13 | the advisor proposes against measures through the user's own operations | BR-68, BR-72 |
| A11 × A15 | the ordering in force is remembered outside the planning history | BR-88, BR-92 |
| A11 × A16 | sorting another way never disturbs the hand-made order | BR-88 |
| A12 × A16 | colour is never the only signal | BR-09, §8 |
| A13 × A2 | the advisor may propose creating a project or an activity, through those same operations | BR-72 |
| A13 × A14 | one outstanding proposal per target; applying writes completely | BR-69, BR-70 |
| A13 × A15 | the conversation is journaled but not version-controlled | §3 |
| A13 × A16 | non-blocking, current on its own, and it says when it changed something elsewhere | BR-66, BR-74, BR-118 |
| A14 × A15 | no draft is version-controlled | BR-121 |
| A14 × A16 | a draft is current at every moment | BR-37 |
| A15 × A16 | the landing tab, and remembered interface state | BR-48, BR-92 |
