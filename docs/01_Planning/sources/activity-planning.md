# Activity-based project planning — input document

> **What this is.** The fifth input document, and the only one **not** authored by the Software
> Architect: it is written *for* him, from his own statements, because the four original sources are
> silent on activities. It carries the same recording-grade authority as the others (QB-01) — a
> starting point, not settled truth.
>
> **Status.** Interview **complete** — rounds 1–9, all on 2026-10-09. Every statement is marked: **SA** = the
> Software Architect said it, quoted or tightly paraphrased · **INFERRED** = the author's reading,
> owed a confirmation · **OPEN** = asked, not yet answered. Nothing here is a rule until it reaches
> the Intent document as one.

Cited from the gate documents as `act §…`.

---

## 1. What a Project is, and what its Plan is

**SA, round 3.** A **project** is **an aspect of an idea being worked on** — or the whole of it. One
idea triggers **0..N goals and 0..M projects**.

**SA, round 7 — generalized.** But an idea is not required: a project may hang on a **goal** instead,
or on **nothing** — *"I might plan a gardening project which is not related to any idea nor any
goal."* §2 draws the result.

**INFERRED — this replaces round 1's reading.** A project is therefore its **own entity hanging off
an idea**, not a name for the state an idea is in once it carries work. QB-33 is answered: entity,
not state.

**SA, round 5.** A project is **created from an idea**: *"either to fully or partially realize that
idea."* The project records which of the two it is — which is also what §8's goal join keys on.

**SA, round 6.** The *new project* action appears in **three places**: on the **Idea** page, the
**Goal** page and the **Project** page.

**SA, round 7 — RULED, and it changes §2.** A project links to **an optional parent element, which
may be an idea or a goal**: *"I might plan a gardening project which is not related to any idea nor
any goal. On the other hand I might want to start a project for a goal which is not linked to any
idea. So: a project optionally links to a 'parent element' which can be an idea or a goal."*

So a project's lineage is **one optional link with more than one kind of target** — not a fixed rung
under Idea. When created from the Idea or Goal page the parent is the element it was created from;
from the Project page it is chosen, or left empty.

**OPEN (question AG).** Round 3 ruled that a project realizing *an aspect* of its parent links to
**one progress measure**, and one realizing the whole thing links to the **goal**. Is a measure
therefore a third kind of parent, or is that ruling now superseded by *parent = goal* plus the
whole/aspect flag? §8 holds the ruling it has to reconcile with.

**SA.** A project's **Project Plan** is optional, hangs on the project, and does two things: it
**plans the order of the activities**, and it **keeps track of progress** while the project is
executed.

**SA.** A project without a plan is legitimate — it stays what Bearing has today, a bare backlog of
tasks. Starting work on an idea does not oblige anyone to plan it.

**SA.** The same surface serves both jobs: **Project Design** — itself one of the activities of a
software project — *and* tracking progress during execution. *"Tracking progress is important to me,
it's not just Project Design."* That surface is named **Course** (§13).

## 2. Where it sits

```
Theme ──► Idea ──► Goal ──► Progress measure
            ┊        ┊
            └┄┄┄┄┼┄┄┄┄┄┄┄┄┄┘  ONE optional parent: an idea, a goal or a measure
                 ▼
              Project ──► [ Plan ] ──► Activity ──► Task
                          optional     flat, with
                                       dependencies

              Chores  ──────────────────────► Task     the one board no project owns
```

**INFERRED.** A project is not a rung under Idea: it carries **one optional parent** whose target may
be an idea, a goal or a progress measure. A gardening project hangs on nothing; a project serving a
goal that has no ideas hangs on the goal; a project advancing one measure hangs on that measure. The
user picks a parent and is never asked its type. Round 1's "the plan sits between Goals and Focus"
survives only as a statement about **reading order** — you read the plan after the goal and before the
day — not about ownership.

**INFERRED.** Goals and projects remain two independent things: a goal *measures*, a project *does*.
What round 7 adds is that the link between them may run either way round — a project under a goal, or
a project and a goal side by side under one idea.

## 3. The worked example — Bearing v2's own plan

**SA.** The activities come from the preliminary decomposition in `architecture.md`: **each Manager,
Engine and ResourceAccess becomes an activity**, following IDesign's bottom-up,
component-by-component approach that walks the dependencies in reverse. Named explicitly:

| Activity | Development? |
|---|---|
| Interviewing — what IDesign calls Requirements | no |
| Architecture | no |
| Detail Design | no |
| Project Design | no |
| Utilities, and the build-up of iFX — *"one of the first activities, certainly"* | yes |
| A utility for Logging | yes |
| One activity per Manager · Engine · ResourceAccess | yes |
| Test Plan | no |
| Test Harness | yes |
| System Testing | no |

**SA.** The plan therefore covers the **whole** project, the fuzzy front end included — the
interviewing and architecture being done right now are activities of it, not preliminaries to it.

**SA.** *"Although I think I want to implement in smaller batches (e.g. something like UC by UC) just
so that I can start early testing. So in reality, my Bearing plan will be more granular than a normal
iDesign plan."*

**SA, round 2.** Organising by use case does **not** nest: instead of one activity per component
there is **one activity per component per use case it supports** — `ExecutionManager · UC3`,
`ExecutionManager · UC5` — and the plan still stays **flat**.

**INFERRED.** Activity granularity is the planner's choice, not a fixed rung. Bearing must not
hard-code what an activity corresponds to, and must not offer sub-activities as the way to get finer.

## 4. Cadence — how often the plan is read

**SA.** Day Focus and Execution are **daily**. The Project page is **weekly to monthly**, roughly —
and how often depends on how big the activities are and how much time there is for the project.

**SA.** It is read on two occasions: when a component or a use case **finishes**, and **at random,
"when I forgot where we stand"**.

**INFERRED.** The second occasion is the demanding one: the page must answer *where do we stand* to
someone arriving with no context.

## 5. Order, dependencies and progress

**SA.** **No estimates.** *"Estimates are less relevant to me, as I cannot plan my leisure time like
working time."* A personal project's capacity is not plannable, so a duration per activity would be
a number nothing could be computed from.

**SA.** **No critical path.** *"For one man projects the plan consists of a single string of
activities. Even if we support parallel activities (which might be handy), the critical path is still
irrelevant, as in a one man project I cannot add more people."*

**SA.** Dependencies are **always finish-to-start**. No start-to-start, no lag, no overlap.

**SA.** The shape is a **graph**, not a chain — *"but it will be relatively simple graphs for one man
projects"*. Parallel activities are allowed even though only one is worked at a time.

**SA.** **Bearing never blocks on the graph.** *"I don't want Bearing to constrain progress states of
plans."* Strictness is weighed in §11.

**SA.** **Completion is offered, never imposed.** When the last task of an activity is moved to Done,
Bearing *may offer* to mark the activity Done. Declining is legitimate: the activity stays
**InProgress** and is closed by hand on the Plan page.

**SA, round 5.** A Done activity **can be reopened** — *"as nobody is perfect, yes, it can be
reopened."* Successors already started are handled by §11's flag, not by a refusal.

**SA, round 3.** Activities are **created on the Plan page**, not on a board: *"activities must model
dependencies. I don't want to do that on the Board page."*

## 6. Activity state versus board state

**SA, round 3.** The two must not be conflated: *"there must be 2 distinct properties."*

**Superseded in round 4 by §10's ruling.** Round 3 added that *"the activity state property can be
calculated from the activity location on the board"*, with Backlog and Todo both counting as Todo,
anything between as InProgress, and Done as Done. That derivation only existed while an activity was a
**card** in a column. Option 2 makes the activity a **board**, so it sits in no column and there is
nothing to derive from: *"so there goes the need to synchronize the column state with the plan state.
In this case the activity state is purely managed on the Plan page."*

What survives is the distinction itself, and why it was drawn: an activity's state and a task's column
are two different properties, because *"on the plan visualization I don't care about Backlog vs. Todo.
That's a means to distinguish tasks for the future (Backlog) and for today (Todo)."* Backlog-versus-Todo
is a statement about tasks and never reaches the Course page.

**INFERRED.** The activity's state therefore has exactly one owner — the Course page (§7) — set by
hand, with "all its tasks are Done" offered as a prompt (§5) and never applied on its own.

## 7. The Plan page

**SA.** It shows **a visualization of the activities and their dependencies**, with **colour codes for
their states**, plus **statistics about the overall state** — *"e.g. how many Done, InProgress, and
Todo activities compared to the total number of activities"*.

**SA.** *"In contrast to iDesign, I'm tempted to use node-diagrams instead of arrow-diagrams."*

**INFERRED.** Activity-on-node is the standard precedence-diagram form and what every modern tool
draws; Löwy's activity-on-arrow notation exists to carry durations and float on the arrows, which §5
drops. Dropping the arrow diagram follows from dropping estimates.

**SA, round 5.** The graph is laid out **automatically**, with no stored node positions: *"my possibly
naive bet is that personal projects must be manageable in terms of complexity, so I'd keep it
automatic."*

**SA, round 5.** What a node shows **about its tasks** — a count, a bar, nothing — is *"too early to
decide."*

**INFERRED.** The graph plus the counts *are* the answer to "where do we stand" (§4) — no separate
summary surface is owed.

**SA, round 4.** The page is called **Course** — *"I like Course"*. Bearing's own metaphor: you set a
course and you stay on course, so the one word carries both planning and tracking. It is explicitly
**not** *Project Design* (§9).

## 8. The goal join

**SA.** *"Ideas clearly link to goals, not to measures."* That is today's `BR-04`, and it stands.

**SA, round 3.** The project's own link follows from its **scope**: a project that is **an aspect** of
the idea is *"a step towards a goal"* and links to **one progress measure**; a project that is **the
entire idea** links to **the goal**. A project may also be related to no goal at all.

**SA, round 8 — RULED, superseding the inference that followed.** There is **one parent link**. Its
target may be an **idea**, a **goal** or a **progress measure**, and it may be empty. There is **no
whole/aspect flag**: *"No, absolutely positively **no** whole/aspect flag. I don't care about how many
kinds there are. Conceptually, it's *one* parent. As user I don't give a damn dime about the type."*

**INFERRED.** So the type is a storage fact, not a user-facing one: the UI offers *one* parent picker
over ideas, goals and measures, shows one parent, and never asks the user which kind it is.

**SA, round 3.** Phase goals stay: *"phase goals are still on, but time horizon is still optional."*
`funnel §3`'s sequential-goals pattern and the plan coexist — the plan orders work, phase goals
commit to and measure stretches of it. BR-08 is unchanged.

## 9. Scoping against the Method

Löwy's project design (*Righting Software*, part II) asks for ten things. Four survive.

| The Method asks for | In Bearing? | Why |
|---|---|---|
| **The activity list** — every activity, coding and not | **yes** | §3. The whole point. |
| **The dependency network** | **yes** | §5, finish-to-start, a graph. |
| **The build order** it implies — bottom-up, components in reverse dependency order | **yes** | §3. The plan's primary output. |
| **Progress tracking** against the plan | **yes** | §6/§7, as states and counts. |
| **A duration estimate per activity** | **no** | §5: leisure capacity is not plannable, so the number has nothing to feed. |
| **Float, and the critical path** | **no** | Both computed from durations; the critical path exists to tell you where to add people. |
| **Staffing, and the staffing-driven solutions** (normal, compressed) | **no** | One person, always. Compression buys nothing. |
| **The time–cost curve and the decompression point** | **no** | No durations, no cost model, no trade-off to plot. |
| **Risk (criticality, activity risk)** | **no** | Derived from float. Falls with it. |
| **Earned-value progress** | **no** | Replaced by state counts — §7 asks for counts, not value. |

**INFERRED — the finding this pass produces.** What remains is Löwy's project design **minus time**: a
dependency-ordered activity list with states and a picture of itself. That is legitimate and useful,
and it is *not* project design in the Method's sense — the Method's quantitative half is the half
that computes a schedule, and a personal tool has no schedule to compute. The page must therefore
never be named *project design*, so that the day a commercial project needs float and compression
nobody expects to find them here.

## 10. Where activities live — the board question

**SA, round 2 (overruling the sources).** *"I'm thinking about supporting activities on the Execution
boards. In this case tasks would be sub-elements of activities. … Activities on the board would be
similar to Jira's stories and Tasks would be equivalent to Jira's tasks. … And with this we are back
at hierarchical execution board elements despite having decided against that originally in the source
documents. So that decision is overruled now."*

**SA, round 3 (reopening it).** *"The EisenKan and activity concepts clash. The risk of
inconsistencies is high because there are many edge conditions. The more I think about it, the less I
like the idea of showing activities on the boards. That would mean we could revert the related
overrule decision. How about this: each activity would get its own board. But as consequence in the
Day Focus I would need to select all activities (possibly multiple per project) I want to work on at a
certain day."*

Three candidate shapes. **Option 2 is the open proposal**; option 1 is the round-2 overruling, held
pending; option 3 is the author's middle ground.

| | **1. Activity as a card** | **2. Activity as a board** | **3. Activity as a row** |
|---|---|---|---|
| Board identity | tag / project | **activity** | project |
| Task is | a card inside an activity card | a card on the activity's board | a card in the activity's row |
| Eisenhower | clashes — two card levels × three sections | **intact** — the board holds tasks only | clashes again, inside the Backlog column |
| Strip length | short | **long** (≈20 chips for Bearing v2) | short |
| Activity state | from its column (§6) | explicit, task-derived suggestion | from its tasks' columns |

### Clickable mockups (2026-10-09)

Both shapes were built as interactive mockups so the choice can be made by using them rather than by
reading about them. Each carries the Course page, the Execution board and the Day-focus editor, on
Bearing v2's own 18 activities, with a **Frictions** toggle that marks every edge condition in place.

| Shape | Mockup |
|---|---|
| Option 1 — activity as a card | <https://claude.ai/artifact/78gmoX4AgFcZyasuy6wtah> |
| Option 2 — activity as a board | <https://claude.ai/artifact/9kaBT831KPGu79Gw6hVmUz> |

Source: `scratchpad/mockup/{option1,option2}.html` from one template. Pre-Intent, throwaway, not a
screen model — nothing downstream may cite them.

### Consequences of option 2 — activity as a board

**Board identity**
1. Board identity moves from tag → activity.
2. A project with no plan still needs a board ⇒ the clean rule is that **every project has one
   implicit activity** and a plan merely adds more. Without it there are two kinds of board owner.
3. The reserved `untagged` board **disappears**: cascade orphans land in their project's implicit
   activity. Reserved boards fall from three to two.
4. `routine` stays — the one board owned by no project (BR-07, BR-61).

**The boards strip**
5. Grouping goes three deep: theme → project → activity, where today it is theme → tag.
6. Chip count explodes — Bearing v2 alone is ≈20 activities. The strip needs a filter (today's focus,
   or non-Done only) or it stops being a strip.
7. The funnel context header grows to `Theme › Goal › Project › Activity` — four segments.

**Day Focus**
8. The Day Focus holds **activities**, several per project: more selections per day than picking
   projects would be.
9. It wants an assist — pick a project, be offered its **ready** activities, which the plan knows.
10. Rollover (BR-44) is unaffected: it advances whatever the focus holds.
11. A new way to be wrong: focusing an activity whose predecessor is unfinished (§11).

**Columns**
12. Column sets are per board, so a 20-activity project means 20 setups ⇒ a **column template on the
    project**, inherited by its activity boards, becomes necessary. New concept.
13. BR-59 (exactly one Backlog, ≥1 Done) now has 20× as many boards to hold legal.

**Eisenhower**
14. **The clash disappears** — a board holds only tasks, so the Backlog's three sections keep their
    meaning. This is the option's reason to exist.
15. But triage inside a three-task activity backlog earns little. Eisenhower pays off on a crowded
    board, and activity boards are small by design; `All` becomes where triage actually matters.

**Tasks**
16. Moving a task between activities = moving between boards ⇒ an explicit **move to activity**
    action, where today it is retagging.
17. "In the project but in no activity" is only expressible via consequence 2's implicit activity.
18. Per-board task counts become the evidence the Plan page's suggestion (§5) rests on.

**Activity state**
19. §6's derivation **falls away, and that is a gain** (SA, round 4): an activity that *is* a board
    never sits in a column, *"so there goes the need to synchronize the column state with the plan
    state. In this case the activity state is purely managed on the Plan page."* One owner, one
    property, no reconciliation — and §5's *offer, never impose* is exactly what remains.

**Check-out**
20. Day check-out (BR-33/BR-35) computes over today's focused **activity boards** instead of focused
    tags. Mechanism unchanged, scope redefined.
21. Goal check-out: unaffected.

**Advisor**
22. Every suggestion type keyed on tags re-keys to activities.
23. It **gains** a capability: the plan says which activities are ready, so "what should I work on"
    gets a derived answer instead of a heuristic.

**Lifecycle**
24. Creating an activity creates a board; deleting one deletes a board (§12).
25. Archiving a project archives N boards at once (BR-43 hides an archived board).
26. More documents in the versioned store and more op-log entries. Small but real.

**Tags**
27. With the activity as board identity and the project as the grouping, **tag has no job left** but
    naming the routine board — so option 2 is what makes retiring tags (round 3, L) achievable.

**Cost of the change**
28. None in migration terms: no v1 migration exists (BR-80) and this is pre-Intent.

### The home for work that belongs to no project

Option 2 makes every board an activity, which leaves work that belongs to no project without a home.
**Open — §14 W** holds the option space and the Software Architect's own framing of it.

## 11. Dependency strictness

**SA, round 3.** *"I cannot explain why, but I feel Bearing should not be strict about this."*

| | **Strict** — refuse to start | **Flag** — allow, remark | **Silent** — allow, say nothing |
|---|---|---|---|
| For | The plan means something; the graph is authoritative; self-deception is impossible. | Tells you at the one moment it matters; costs nothing; a flag that clears itself cannot rot; the advisor can use it; prompts the useful question *was this dependency real?* | Zero mechanism, zero noise. The graph on the Plan page already holds the information. |
| Against | In a one-person project the plan is a hypothesis, often wrong. *Done* is a judgement — a predecessor 95% finished may unblock fine. The tool would push its owner into marking things Done to get work done, corrupting the data to satisfy the tool. And the edge cases multiply: reopened predecessor, deleted predecessor, cycle. | Needs a decision on where it shows, and a flag routinely ignored becomes furniture. | The one moment you want to know is when you start, and you will not be on the Plan page then. The dependency data then only ever serves a drawing. |

**SA, round 5 — RULED.** **Flag.** *"Subtly flag, but tolerate."* A quiet marker on the activity —
its node, and its board header — naming the unfinished predecessor. Nothing blocks.

**INFERRED.** *Subtly flag* is the same gesture BR-22 already uses for a goal whose horizon has
passed, so this is an existing idiom rather than a new one. No dismissal is needed: the flag clears
itself when the predecessor completes, which is what makes it cheap to live with. It also feeds
§10's *ready* set for free.

**SA, round 5.** A **cycle is refused**: *"cyclic dependencies don't make sense. Refuse them."* The one
place Bearing is strict about the graph — and not a contradiction, because §11 governs *progress*
while this governs the graph being a graph.

## 12. The smaller rulings

| | Ruling |
|---|---|
| **Creation** | Activities are created on the **Plan page** only (§5). |
| **Deletion** | *"The usual cascade question and the either delete tasks or reject activity deletion answer"* — offer the cascade; where the tasks cannot be left orphaned, refuse the deletion. Same shape as BR-03 and BR-21. |
| **Attributes** | Name, state, dependencies and **notes**. Nothing else yet: *"I need to play with the UI prototype to definitively decide."* |
| **Notes** | A **separate field of the activity**, not the idea's note reused: *"I might want to keep track of some thoughts related to an activity."* (round 8) |
| **Dependency scope** | *"No, dependencies only **within** a project."* (round 5) |
| **Cycles** | Refused (§11). |
| **Deleting a predecessor** | **Its dependency edges are simply deleted**, not reconnected: *"closing the gap sounds sexy, but I'm a bit worried about edge cases. Simply deleting the dependencies should be a lot simpler. And after a deletion, the user should verify and fix up the dependencies anyway."* (round 5) |
| **Column template** | **Per project, with no deviation inside a project** (round 5). |
| **Phase goal ends** | Nothing happens to the plan (round 5). |
| **Reopening** | Allowed (§5). |
| **Tag** | If tags survive and one board = one tag, an activity's tag follows from §10's outcome (round 3, N). |
| **Day Focus** | *"The Day Focus does not hold tasks. Previously it held tags. … Newly the Day Focus will be about which projects to tackle. Think roughly tag ~= project, even though I want to either get rid of tags or change the meaning."* Under §10 option 2 it holds activities instead. |

## 13. The name — settled

**SA, round 4.** **Course.** Rejected along the way: *Project Design* (§9 — it tracks too), *Activity
planning and progress* (accurate, long), *Chart*, *Plan*, *Activity Plan*.

**INFERRED.** So *Course* is a vocabulary entry owed to Intent §3, and the Plan/Project page is the
**Course page**. A project's course is its activities, their order and where it has got to.

## 14. Questions, and how they closed

### Nothing open

Rounds 1–9 closed every question this document opened. What is owed now is **downstream work**, not
more interviewing: the rulings here have to reach the Intent document as vocabulary, rules, processes
and surfaces (G-15), and the §9 scoping finding has to reach whoever names the Course page.


### W — where does work that belongs to no project live?

**SA, round 4.** *"Certain things would be nice to plan, even though they don't belong to any project.
Tasks without a parent activity. … E.g. the task 'Tidy up browser tabs'. But I don't see clearly how it
should be and I want a clean, simple concept. Not a mix of some tasks."*

**INFERRED — the question is two questions, and answering them together is what produced a mixture.**

| | **Nothing exists outside a project** | **Work may exist outside every project** |
|---|---|---|
| **A board is always an activity** | **W2** — every board is an activity of some project; a project with no plan gets one implicit activity | **W1** — an activity hangs on a project *or on nothing*; a project-less activity is a standing board |
| **A board may be a project** | **W3** — the project owns the board, the activity is a *filter* on it | **W4** — two declared board kinds, activity boards and loose boards |

**SA, round 6 — proposed.** **W7 — one non-project board**, holding routine tasks *and* project-less
one-off tasks. Assessed below; it is now the author's recommendation.

Two more that sit outside the grid:

- **W5 — unowned work is not on a board at all.** It lives in a flat list with no columns, no
  Eisenhower and no focus, and a task can be promoted from it into an activity. Boards stay purely
  activities.
- **W6 — routines already cover it.** *Routine* is glossed (Intent §3) as *"an evergreen recurring
  **practice** … maintenance, not achievement"*, which is exactly what *Tidy up browser tabs* is. The
  `routine` board already exists and already belongs to no project. The residue is the one-off
  project-less task — *Renew passport* — which W6 alone does not house.

| | For | Against |
|---|---|---|
| **W1** | One rule, no exceptions. `untagged` dies, tags die. | *Activity* does double duty: a planning node with dependencies, and a plain bucket. A standing activity is never Done, so its state is meaningless — a finishable thing that never finishes. |
| **W2** | One rule **and** an unbroken funnel: every task still traces to an idea, which is the funnel's premise. One kind of board owner. The implicit activity is created with the project and never seen. | *Tidy up browser tabs* needs an idea and a project first. Ceremony — though once per bucket, not once per task: three such projects would cover a life. |
| **W3** | Few boards, Eisenhower untouched, a task with no activity is natural. | Throws away what option 2 was chosen for: one focused board per activity, and a day focus that selects activities. |
| **W4** | Honest and minimal. | Exactly the mixture that was refused, and every rule needs two cases forever. |
| **W5** | Boards stay pure. The surface matches the work — nobody triages *Tidy up browser tabs* into Eisenhower. | A new surface. And a chore sometimes *does* deserve the board and the day's focus. |
| **W6** | Zero new concepts, using a mechanism built for this exact description. | Leaves one-off project-less tasks homeless. |
| **W7 — RULED** | One membership rule — *no project, so it lives here*. Collapses two reserved boards into one. The board is identical to every other board; the only exception in the system is that it has no activity. | Deliberately re-admits work with no funnel lineage, and risks becoming a dumping ground. |

### Assessing W7 — a single non-project board

**SA, round 7 — RULED: W7.** *"That's my pick."*

**SA, round 7 — RULED.** *"Let's get rid of the `All` board."* It is gone: no aggregate board, no
reserved `all` tag. **Chores** is therefore the only board no activity owns, and the rule reads *every
board is an activity, except the built-in Chores board*. Consequence 15 above — which argued Eisenhower
triage would still pay off on an aggregate board — no longer applies; triage runs inside one activity's
backlog.

**It is not the mixture that was refused.** The membership rule is one sentence — *a task with no
project lives here* — and it is uniform. Routine tasks qualify because a routine has a theme but no
idea and no project; a one-off chore qualifies for the same reason. Today's split between `routine`
and `untagged` separates two populations that share their defining property, so W7 is **one reserved
board fewer**: BR-07's `{routine, untagged, all}` becomes `{<name>, all}`.

**Nothing else needs an exception.** The board has one Backlog with the three Eisenhower sections,
one or more Done columns, its own columns (the template is per project and this board has none), and
no appearance on any Course page — it has no activity, so no state, no dependencies and no node.
BR-50's *one visibility rule, no special cases* survives intact.

**The Q4 forcing function applies here too, unchanged, and that is the answer to the dumping-ground
objection.** `funnel §3` omits *Not Important & Not Urgent* deliberately: *"if a task is neither
important nor urgent it shouldn't be on the board."* Triage therefore does the same work on chores it
does on project work — *Renew passport* is Important & Not Urgent until it is urgent, and a chore that
fits no section is a chore that should not be tracked. No exemption, no softening.

**What it re-admits.** A task here has no idea above it, so the funnel's context header
(`Theme › Goal › Tag`) has nothing to show. That is already true of every routine task, so the hole is
not new — but W7 makes it deliberate rather than incidental, and the header needs a defined empty
state.

**SA, round 8 — RULED.** The board is called **Chores**. The reserved-board list becomes `{chores}` —
one entry, with `routine`, `untagged` and `all` all gone (BR-07 rewritten).

**SA, round 6 — RULED, and it answers the focus question.** The loose board is **never selected**: it
*"should always show up in the list of Day Focus boards whenever there is a non-done routine or a
regular task. So I don't have to select anything in the Day Focus page."* Membership is **live**:
*"when it's not in the list of Day Focus boards but I add a task to it, it should be added. When I
complete all tasks on it, it should be removed."*

So the predicate is one line: **the loose board is in play exactly while it carries a task that is not
Done** — routine-spawned or ordinary alike, which BR-61 already treats as one kind. It is the existing
*show when there is something to show* rule (`ui-inventory §47`) applied to the day's focus rather
than only to the boards strip.

**INFERRED — it must be derived, never stored.** The day focus is a record of a human commitment
(BR-40, BR-73 forbids even the advisor from setting it). If the loose board's membership were written
into that record it would be a focus nobody chose, and rollover (BR-44) would carry it. Compute it at
display time from the board's own contents instead: the stored focus stays purely what the user
picked, and *live* membership follows for free, because a derived predicate is re-evaluated every time
it is read.

**INFERRED — two consequences.**
- The **focus history** views (Week / Month / Year) show what was focused on past dates. A derived
  member cannot be reconstructed for a past date, because it would need that day's task states. So
  the loose board never appears in focus history. That is the honest outcome, and it is consistent:
  it was never a commitment, so there is nothing to look back on.
- **Day check-out** (BR-33, BR-35) computes over the boards in play. The loose board is in play while
  it has open work — but completing its last task removes it, and the check-out is read *after* that
  happens.

  **SA, round 9 — RULED.** Day check-out reads **today's focus boards**, and **Chores is out of
  scope**: *"Day check-out is about tracking progress. For non-project tasks, when they are done,
  they are done."* A chore finished after Chores left the list is simply not in the day's account, and
  that is intended — the board itself stays openable at any time. *"But we will see when we do the UI
  design of day check-out whether I'll change my mind."*

  **INFERRED.** This also fills the gap BR-33 left: BR-33 gives the two predicates (*currently in a
  Done column*; *past Backlog and not Done*) but says only *"the board's current state"*, naming no
  set of boards. The set is today's focus.

### Ruled in rounds 7–9

| # | Question | Answer |
|---|---|---|
| W | Work belonging to no project | **W7** — one built-in board, named **Chores**. §10 |
| — | The `All` board | **Gone.** §10 |
| AG | The parent element | **One parent**; its target may be an idea, a goal or a measure, or be empty. No whole/aspect flag, and the type is never shown to the user. §8 |
| T | An activity's notes | **Its own field**, not the idea's note reused. §12 |
| AF | Day check-out's board scope | **Today's focus boards**; Chores out of scope. Revisitable at the day-check-out UI design. §10 |

### Ruled in round 5

| # | Question | Answer |
|---|---|---|
| X | Cyclic dependencies | **Refused.** §11 |
| Y | Graph layout | **Automatic**, no stored positions. §7 |
| Z | Creating a project | **From an idea**, to realize it fully or partially. §1 |
| AA | Deleting a predecessor | **Delete its edges**; the user verifies and fixes up afterwards. §12 |
| AB | Cross-project dependencies | **No** — within a project only. §12 |
| AC | Column template | **Per project, no deviation inside it.** §12 |
| AD | Task information on a node | **Too early to decide.** §7 |
| R | Unfinished predecessor | **Subtly flag, but tolerate** — the BR-22 idiom. §11 |
| U | Reopening a Done activity | **Yes**, with R's flag on started successors. §5 |
| V | A phase goal ending | **Nothing happens** to the plan. §12 |

### Answered in earlier rounds

| # | Question | Answer |
|---|---|---|
| A | Estimates, critical path | Neither. §5 |
| B | Dependency semantics | Finish-to-start, graph, never blocking. §5, §11 |
| C | Flat or nested | Flat; finer granularity = more activities. §3 |
| D | Activity ↔ task | Offer completion on the last task; the state is the activity's own. §5 |
| E | The page | Node diagram, state colours, state counts. §7 |
| F / I | The goal join | Aspect → one measure; whole idea → the goal; or nothing. Single-valued. §8 |
| G | BR-08's phase goals | They stay; the plan does not replace them. §8 |
| H | Activity attributes | Name, state, dependencies, notes. §12 |
| J | Activity state vs board state | Two properties; the activity's is derived by column **position**. §6 |
| K | Where activities are created | The Plan page. §5 |
| L | The Day Focus | Projects, or activities under §10 option 2. Tags to be retired if possible. §12 |
| M / Q | Activities on the board | **Option 2** — each activity is its own board. §10 |
| N | An activity's tag | Option 2 makes the activity the board, so tags have no job left but `routine`. §10 c27 |
| O | Predecessor unfinished | Not strict; flag-versus-silent still owed (§11, R). |
| P | Deleting an activity | Cascade or refuse. §12 |
