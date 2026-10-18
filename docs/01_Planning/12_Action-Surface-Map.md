# Bearing v2 — Action-to-Surface Map

> **What this is.** Every user action the product is to support, against the **surface** it is
> performed on and the **business process** that draws it. One table, built from the Intent gate
> document — §7's surface inventory, §4's rules, §5's process list and §6's call sites — and then
> read **against the drawings** to find actions no process draws. It is the completeness check §6
> cannot make: §6 lists what each process draws, this lists what each surface must offer.
>
> **Status.** Written 2026-10-16 on the Software Architect's instruction, together with the
> adversarial review in §3. It is a review instrument, not a gate artifact: nothing here is
> intent that §4 does not already carry.

**How to read a row.** *Action* is what the user does. *Surface* is where they do it (Intent §7).
*Drawn by* is the call site that realizes it, or the kind of non-operation it is:

| Kind | Meaning |
|---|---|
| act | a branch of that process's hub, with its own call site |
| payload | not an act of its own — part of a read's answer or a write's request |
| seam | the surface starts a gesture another process owns: the act is drawn there, once, and the surface's own process carries one step for it (DRW-29) |
| state | remembered interface state (BR-92), not a business operation |
| static | no system interaction at all |

---

## 1. The map

### Launch and shell

| Action | Surface | Drawn by | Kind |
|---|---|---|---|
| Start the product | — | `BP01.01` | act |
| Acknowledge a refusal, which closes the product | Start-up refusal | `BP01.09` | act |
| Leave Bearing, ending the session | App shell | `BP20.01` | act |
| Notice the new data folder | New-data-folder notice | `BP01.01`'s answer | payload, said quietly (UX-16) |
| Switch tab | App shell | — | state |
| Read About / the keyboard shortcuts | About · Keyboard shortcuts | — | static |
| See an outcome reported, or a surface still loading | Toasts · Skeleton loaders | the answering call site | static |
| Open the advisor from any tab | App shell | — | seam → BP16 |

### Themes, vision and routines

| Action | Surface | Drawn by | Kind |
|---|---|---|---|
| Read the themes with their goal counts | Themes view | — | derived at start-up |
| Create or change a theme | Theme editor | `BP02.02` | act |
| Reorder themes | Themes view | `BP02.04` | act |
| Delete a theme, with its cascades | Themes view · Theme editor · Delete confirmation | `BP02.05` → `BP02.06` | act |
| Read vision and mission where the themes are | Vision & Mission header | — | in play, loaded at start-up |
| Set, change or clear vision and mission | Vision & Mission editor | `BP02.08` | act |
| Read the routines, paused ones marked | Routines view | — | derived at start-up |
| Create or change a routine | Routine editor | `BP03.02` | act |
| Pause or resume a routine | Routines view | `BP03.04` | act |
| Reorder routines | Routines view | `BP03.05` | act |
| Delete a routine, with its tasks | Routines view · Delete confirmation | `BP03.06` → `BP03.07` | act |
| Create a routine while focusing a day | Day focus editor | `BP03.02` | seam → BP03 |

### Ideas

| Action | Surface | Drawn by | Kind |
|---|---|---|---|
| Read the ideation overview | Ideation view | — | derived at start-up |
| Capture or change an idea, its notes among the fields | Idea editor | `BP04.02` | act |
| Reorder ideas by hand | Ideation view | `BP04.05` | act |
| Sort by recent or alphabetical without disturbing that order | Ideation view | — | derived at start-up (D-7), BR-88 · state |
| Filter the list | Ideation view | — | derived at start-up (D-7) |
| Archive an idea, with its projects | Ideation view · Idea editor | `BP04.06` → `BP04.07` | act |
| Delete an idea, with its projects | Ideation view · Idea editor | `BP04.08` → `BP04.09` | act |
| Promote an idea to a goal | Ideation view | `BP04.11`, the editor pre-filled from the idea | act |
| Start a project from an idea | Ideation view | `BP04.12`, the idea as its parent | act |
| Open the archived ideas | Ideation view | — | derived at start-up |

### Goals and their measures

| Action | Surface | Drawn by | Kind |
|---|---|---|---|
| Read the goals with their active measures and the two flags | Goals view | — | derived at start-up |
| Commit to a goal, or change one — theme, objective, horizon, the ideas behind it | Goal editor | `BP05.02` | act |
| Reorder goals within a theme | Goals view | `BP05.11` | act |
| Add a measure, or change one — its type, start value, target, unit and direction | Goals view | `BP06.03` | act |
| Reorder the measures | Goals view | `BP06.05` | act |
| Remove a measure | Goals view | `BP06.07` | act |
| Set a measure aside | Goals view | `BP06.11` | act |
| Work a goal's measures | Goals view | — | hand-over → BP06, on this same view |
| Open the measures set aside | Goals view | — | seam → BP15, the Goals archive listing each under its goal |
| Read a measure's check-in history | Goals view | — | in play, loaded at start-up with the measure |
| Record where a measure stands, moving its current value, with an optional note | Progress check-in | `BP06.02` | act |
| Archive a goal, with the three answers | Goals view · Goal editor | `BP05.12` → `BP05.13` | act |
| Delete a goal, with its cascades | Goals view · Goal editor · Delete confirmation | `BP05.14` → `BP05.15` | act |
| Check a goal out | Goals view | — | hand-over → BP07, which observes what it judges |
| Start a project from a goal or a measure | Goals view | `BP05.19`, that parent carried in | act |
| Open the archived goals and measures | Goals view | — | derived at start-up |

### Closing a goal out

| Action | Surface | Drawn by | Kind |
|---|---|---|---|
| Read what the system observed: the inferred status per measure and the goal's linked projects | Goal check-out | `BP07.01` | act |
| Rate the overall outcome, required | Goal check-out | `BP07.04`'s request | payload |
| Override an inferred status | Goal check-out | `BP07.04`'s request | payload |
| Write the retro and the per-measure notes | Goal check-out | `BP07.04`'s request | payload |
| Archive the goal, or leave it active | Goal check-out | `BP07.04`'s request | payload |
| Pick which linked projects go with the goal | Goal check-out | `BP07.04`'s request | payload |
| Complete the check-out | Goal check-out | `BP07.04` | act |
| Carry the commitment forward | Goal check-out | `BP07.04`'s request | payload |
| Leave the sitting, and find it again | Goal check-out | `BP19.01`, the draft in play on the next visit | act |

### The day, and looking back

| Action | Surface | Drawn by | Kind |
|---|---|---|---|
| Read what a day can be focused on | Day focus editor | — | derived at start-up |
| Commit a date's boards and routines | Day focus editor | `BP08.02` | act |
| Read a date's focus | Day focus editor · Execution view | — | derived at start-up (D-9, D-16) |
| Read a period, with its theme balance | Focus views | — | derived at start-up |
| Step the period, or switch the scope | Focus views | — | derived at start-up (D-11, D-12) |
| Explain one day | Focus views | — | derived at start-up |
| Open a day to change its plan | Focus views | — | derived at start-up |
| Advance the date at midnight, said quietly where the user is working | — (clock) | `BP14.01` | act |

### Work

| Action | Surface | Drawn by | Kind |
|---|---|---|---|
| Read the board strip, focus first | Execution view | — | derived at start-up |
| Read a board with its lineage | Execution view | — | derived at start-up |
| Open another board | Execution view | — | act, the strip and the board both in play (D-14, D-19) |
| Move a task, send it back to the Backlog | Execution view · Task context menu | `BP11.03` | act |
| Order a task | Execution view · Task context menu | `BP11.05` | act |
| Change what a task says, or re-triage it | Task editor · Task context menu | `BP11.06` | act |
| Archive one task | Task context menu | `BP11.07` | act |
| Delete a task | Task context menu · Delete confirmation | `BP11.08` | act |
| Answer the completion offer a last task raises | Execution view | `BP11.09` | act |
| Fold a column, a section or a project's boards | Execution view | — | state |
| Capture a batch of tasks | Task creation | `BP10.02`–`BP10.06` | seam → BP10 |
| Manage the lanes | Column overflow menu | `BP12.02`–`BP12.08` | seam → BP12 |
| Check the work out | Execution view · Day focus editor | `BP13.01` → `BP13.03` | seam → BP13 |
| Open the archived tasks | Execution view | — | derived at start-up |

### Capture, lanes, check-out

| Action | Surface | Drawn by | Kind |
|---|---|---|---|
| Stage a task | Task creation | `BP10.02` | act |
| Change a staged task | Task creation | `BP10.03` | act |
| Move a staged task into another priority column | Task creation | `BP10.03` | act |
| Reorder the staged tasks | Task creation | `BP10.04` | act |
| Discard one staged task | Task creation | `BP10.05` | act |
| Discard all the staged tasks | Task creation | `BP10.05` | act |
| Commit the batch | Task creation | `BP10.06` | act |
| Pick the batch up again | Task creation | — | in play, loaded at start-up: a batch left staged is in play |
| Read the column template, with what may change and how far it reaches | Column overflow menu | — | derived at start-up |
| Add a lane, or rename one | Column overflow menu | `BP12.02` | act |
| Reorder the columns | Execution view | `BP12.04` | act |
| Change what a lane means | Column overflow menu | `BP12.05` | act |
| Clear a lane out by archiving its tasks | Column overflow menu | `BP12.06` | act |
| Delete a column, with its tasks | Column overflow menu · Delete confirmation | `BP12.07` → `BP12.08` | act |
| Answer the completion offer a lane becoming Done raises | Column overflow menu | `BP12.10` | act |
| Read the account since the last check-out | Work check-out | `BP13.01` | act |
| Write the check-out notes while the span is open | Work check-out | `BP19.01`, the notes in play on the next visit | act |
| Choose whether to archive what the span completed | Work check-out | `BP13.03`'s request | payload |
| Complete the check-out | Work check-out | `BP13.03` | act |

### Projects and their course

| Action | Surface | Drawn by | Kind |
|---|---|---|---|
| Read the project list with its counts | Course view | — | derived at start-up |
| Start a project, or change one — its parent, its kind at create | Project editor | `BP17.02` | act |
| Archive a project, with its activities and tasks | Course view | `BP17.14` → `BP17.15` | act |
| Delete a project, with everything it is | Course view · Delete confirmation | `BP17.04` → `BP17.05` | act |
| Open a project's course | Course view | — | derived at start-up |
| Read a course: activities, dependencies, flags, counts | Course view | — | derived at start-up |
| Add an activity, or change one, its notes among the fields | Activity editor | `BP18.02` | act |
| Set an activity's state, reopening included | Course view | `BP18.10` → `BP18.04` | act |
| Add a dependency, refused on a cycle | Dependency editor | `BP18.07` | act |
| Drop a dependency | Dependency editor | `BP18.08` | act |
| Delete an activity, with its board's tasks | Course view · Delete confirmation | `BP18.05` → `BP18.06` | act |
| Open the archived projects | Course view | — | derived at start-up |

### The advisor, the archive, drafts

| Action | Surface | Drawn by | Kind |
|---|---|---|---|
| Open the conversation, with where the user is | Advisor panel | — | act, asking the system for nothing: the session's conversation is in play |
| Ask, with the whole funnel as context | Advisor panel | `BP16.02` | act |
| Take the answer and its typed proposals | Advisor panel | `BP16.03` | act |
| Read what went wrong, and send the question again | Advisor panel | `BP16.02` again | act |
| Take a proposal up | Advisor panel | `BP16.07` → `BP16.04` | act |
| Turn a proposal down | Advisor panel | `BP16.05` | act |
| Start the conversation over | Advisor panel | `BP16.06` | act |
| Jump to where a proposal landed | Advisor panel | — | state |
| Read the archived items of one kind | Archive views | — | derived at start-up |
| Read one archived item | Archive views | — | in play, loaded at start-up (D-29) |
| Filter or sort the list | Archive views | — | state, the client's own (BR-92) |
| Bring one back, judged in the one request | Archive views | `BP15.03` | act |
| Destroy one out of the archive, disclosed first | Archive views | `BP15.04` → `BP15.05` | act |
| Keep what is being typed, anywhere | every editor | `BP19.01` | act |

---

## 2. What the map says about coverage

**Every surface in Intent §7 appears in §1**, each with at least one act unless the row says why it has
none, and every one of §6's call sites appears in exactly one row — the two lists reconcile. The surfaces carry **79 call sites**, and 14 rows are seams or hand-overs — a surface moving the user to another
surface. Ten are drawn as a step in the surface's own process; the two that are not say why in F-3.
Four rows left that list on 2026-10-16, being acts on the surface's own item rather than a move
anywhere: the goal
and the project defined on an idea or on a goal are submitted where their editor was opened
(`BP04.11`, `BP04.12`, `BP05.19`).

**Three kinds of row are deliberately not call sites** and are listed so their absence is not read as
a gap: a *payload* (the figures of a check-out, the override of an inferred status, a filter), *state*
(a fold, the ordering in force, a jump), and *static* content (About, the shortcuts).

---

## 3. Adversarial review — the gaps this found

| # | Finding | Disposition |
|---|---|---|
| F-1 | **The check-in was asked about, and the answer turned out to be the model's.** Both check-in acts are BP06's and always were — `BP06.01` reads one measure's history, `BP06.02` records against it — performed on BP05's surfaces, exactly like the measure's other four acts. What was missing was in the measure itself: it tracked no current value against its target. | **Fixed in the model, not the drawing.** A numeric measure now carries a start value, a target, a unit, a direction and a current value initialized to the start and moved by each check-in; a boolean starts at not done (BR-28). The per-goal check-in history of the same day is withdrawn by its author, and `BP05.17`, which read it, is retired with it. `BP06.01` is retired too, since 2026-10-17: every record is loaded at start-up, so looking at a measure's history asks the system for nothing. **`BP06.01` went on 2026-10-17** with every opening read, and on 2026-10-18 looking at a history stopped being an act at all: the check-ins are in play with the measure, so the drawing has no box for reading them. |
| F-2 | **The measure acts are performed inside the goal editor, which commits on one submit.** `wf §4.2` puts the measures in the goal editor as rows and UX-04 makes that editor one submit, one request — so either the rows are part of the goal's request, or they write on their own and the editor is not one submit. | **Answered 2026-10-16, by the ruling that the v1 key-result surface is preserved.** v1 writes each measure act on its own — `Establish` for a new key result, `Revise` for its description, start and target, `RecordProgress` for its value, `Dismiss` to drop it — with the rows inline on the goals surface rather than inside a goal dialog. So `BP06.03`, `BP06.05`, `BP06.07` stay call sites of their own, the goal editor commits the goal's own fields, and `wf §4.2`'s measures-inside-the-dialog sketch is what the ruling drops. |
| F-3 | **A seam was drawn in two processes and in none of the other thirteen rows.** `BP17` drew *plan its work* and `BP09` *change a day's plan*; promoting an idea, starting a project from an idea or a goal, checking a goal out, capturing a task, managing the lanes, settling the work and opening an archive view drew nothing. | **Fixed 2026-10-16**, on his asking where BP05's check-out was: DRW-02 makes a seam significant, so eleven are now drawn as one step with a note — BP04 (3), BP05 (3), BP11 (4), BP17 (1) — each returning to the hub and minting no call site (DRW-29). Two rows stay undrawn and say why: the advisor is reachable from every tab, so it belongs to no one hub, and BP08's two — add a routine, settle the work — sit on a linear drawing with no hub to hang a branch on. **Amended 2026-10-16**: four of them are not seams at all but acts on the surface's own item, so they draw what they cause — checking a goal out reads the inferred statuses (`BP05.18`), and the goal and the project defined on an idea or a goal are submitted where the editor was opened (`BP04.11`, `BP04.12`, `BP05.19`). Ten drawn seams remain, each a move to another surface. The live count is DRW-29's, not this row's: **eleven** since BP14's seam went with the rollover's offer on 2026-10-18. |
| F-4 | **Retrying a failed advisor call** had no branch (`G-4`) and **deleting an item out of the archive** had no act (`G-1`). | **Both fixed 2026-10-16**, on the ruling that a concrete issue is fixed when it is identified, review or no review. BP16's ask now answers with its proposals or with what went wrong, and the question can be sent again; BP15 gains *drop one for good*, `BP15.04` → `BP15.05`. |
| F-5 | Two void surfaces still appear in the source's own inventory — the onboarding wizard (BR-82) and the Settings view (BR-76). Neither is in Intent §7, and no row above references them. | Nothing to do; recorded so the next reader of `wf §7.1`/`§7.2` does not re-derive a gap. |
