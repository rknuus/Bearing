# Bearing v2 — Derived data inventory

> **What this is.** Everything the product **computes** from what it keeps, as against what it
> stores. Written 2026-10-17 on the Software Architect's instruction, when the page reads left the
> business processes: *"Extend UIP startup by generic loading persistent and by calculating derived
> data."* A derived value is no business act — counting a theme's goals is not something the user
> asks for — but the **rule** that says what it is still has to live somewhere, and this is where.
>
> **What is persistent** is already written down twice and is not repeated here: the entities are
> Intent §3, and the records something happened are
> [`11_Record-Inventory.md`](11_Record-Inventory.md). Everything in this list is computed from those
> two and is never stored.
>
> **When it is computed** is a detail design decision. The business statement is that every surface
> works from current values without the user asking for a refresh (BR-118); the product loads the
> persistent data once, at start-up, and derives this list from it (`UIP01`, `BP01.01`).
>
> **Keeping it current.** A new row appears whenever a rule says a surface shows something the
> product does not store. The rule column is the point of the list: **a derived value with no rule
> behind it is a finding**, not an implementation detail.

## The derived values

| # | Derived value | Derived from | Rule | Where it shows |
|---|---|---|---|---|
| D-1 | Each theme's goal count | the goals under a theme, archived ones left out | BR-95 | Themes view |
| D-2 | The active goals, grouped by theme, with their active progress measures | goals, measures, the archive | BR-87, BR-28 | Goals view |
| D-3 | A goal with no linked idea, flagged | a goal's idea links | BR-04 | Goals view |
| D-4 | A goal whose horizon has passed, flagged quietly | a goal's horizon against today | BR-22 | Goals view |
| D-5 | A measure's current value | its check-in history — the latest point, or the start value until there is one | BR-28, DRW-10 | Goals view |
| D-6 | A status inferred per measure | the check-ins recorded under the measure's current type | BR-28, BR-29 | the goal check-out, which asks for it as part of the sitting (`BP07.01`, `BP05.18`) |
| D-7 | The ideas the filter and the ordering in force admit | ideas, the remembered ordering | BR-03, BR-88 | Ideation view |
| D-8 | Which routines are due or overdue | each active routine's recurrence and preferred days against today | BR-91 | Routines view · day focus editor |
| D-9 | The day's selectables | non-archived projects with their kind and activities, active routines, the date's committed focus | BR-41, BR-43 | Day focus editor |
| D-10 | Which activities are ready | an activity's unfinished predecessors | BR-99 | Day focus editor · Course view |
| D-11 | The period a focus view shows, and how it relates to now | the chosen scope and date against today | BR-46, BR-93 | Focus views |
| D-12 | The theme balance over a period | the period's days and the focus committed on each, days with no focus being a share of their own | BR-47 | Focus views |
| D-13 | Which logs explain a day | each check-out log's span against that date — both where two split it, none while the span is open | BR-38, BR-33 | Focus views |
| D-14 | The boards in play | every board of a non-archived project | BR-49, BR-43 | Execution view |
| D-15 | Chores in play | whether Chores carries a task that is not done | BR-107 | Execution view |
| D-16 | The board strip's order, the date's focused boards first | the day focus against the boards in play | BR-116, BR-50 | Execution view |
| D-17 | Which board opens | the strip's order where the date has a focus, the first board otherwise | BR-51 | Execution view |
| ~~D-18~~ | ~~The boards on offer when tasks are captured, Chores left out~~ **Retired 2026-10-18**, its number never reused: capture names no board at all, landing the batch on the board it was opened from, so there is nothing to offer (BR-62) | — | BR-62 | — |
| D-19 | A board's columns | the template that governs the board | BR-108 | Execution view · column settings |
| D-20 | The Backlog's three triage sections, empty ones included | the tasks in the Backlog by priority | BR-57, BR-54 | Execution view |
| D-21 | A task's lineage, as far as it reaches | task → activity → project → parent → theme, or the routine on Chores | BR-102, BR-09, BR-96 | Execution view |
| D-22 | An activity whose predecessor is unfinished, flagged | the project's dependency edges and states | BR-110 | Execution view · Course view |
| D-23 | How many boards a column template governs | the project's activities | BR-97 | Column settings |
| D-24 | Which column role changes are legal | the template's roles — one Backlog, at least one Done | BR-60, BR-59 | Column settings |
| D-25 | Which columns carry tasks, across every board the template governs | the tasks on those boards | **none** | Column settings |
| D-26 | The live projects with their parent and their kind | projects, the archive | BR-96, BR-26 | Course view |
| D-27 | A project's and a course's Done / InProgress / Todo counts | the activities' states | BR-109 | Course view |
| D-28 | A course's activity order | the dependency edges, then the name | BR-119 | Course view |
| D-29 | The archived items of a kind, each archived goal carrying its check-out record | the archive | BR-26, BR-27 | Archive views |
| D-30 | The account since the last check-out, with its four figures | the movement record and the focuses over that span | BR-33, BR-45, BR-124, BR-41, BR-35, BR-125 | the work check-out, which asks for it as part of the gesture (`BP13.01`) |
| D-31 | The tasks still open on an activity's board, and what may become of them | the tasks on that board against their columns' roles | BR-127, BR-109 | Execution view, under the completion offer |

## What falls out of listing them together

1. **One derived value rests on no rule at all.** `D-25` — which columns carry tasks, across every
   board a template governs — is drawn and shown, and nothing in Intent §4 says it. A rule is owed,
   or the disclosure it feeds has to say where its number comes from.
2. **Two of them are not loaded with the rest, and that is deliberate.** `D-6` and `D-30` are
   computed when a check-out opens, because they are what the system *observed* for that judgment
   (BR-39) rather than something a surface shows. They stay drawn as the call sites they are.
3. **Everything else is a surface's content.** None of it is an act, which is why the page reads
   left the business processes on 2026-10-17: the product loads what it keeps and derives this list
   from it, and a business process draws only what the user *does*.
