# BP11 — Work the board

**Stage.** Discovery / Mockup — before the Intent gate. Nothing here is const.

| | |
|---|---|
| **Trigger** | **User**, continuously — the hot path. This is where the day is actually spent. |
| **Goal** | Work moves along: the right board is open, tasks sit where they belong, and what is finished is finished. |
| **Actors** | **User** (the only human; also the stakeholder) · **Bearing** (the system). No external system takes part. |
| **Source** | `diagrams/BP11_WorkTheBoard.bpd` — the one tagged source for both levels. |
| **Sources it traces to** | `wf §6.1`, `wf §6.3`, `arch §8 UC2` |
| **Rules it exercises** | BR-17, BR-20, BR-23, BR-43, BR-49, BR-51, BR-53, BR-54, BR-56, BR-57, BR-64, BR-107, BR-108, BR-109, BR-110, BR-116, BR-121 |

## The flow in one paragraph

The Execution page reads the strip — every board that exists except an archived project's, which archiving hides along with withdrawing the project from the selectables, Chores among them while it carries work that is not done, with the date's focused boards grouped at the front and one board named to open. A board reads its columns from its owner's template, its cards with their priority, the three triage buckets in the Backlog including the empty ones, and the lineage of the work on it: theme, goal, project, activity. Then one act, repeatable: move work along, re-triage something, order what is waiting, fix what a task says, file one away, or throw one away. Moving an activity's last task into Done raises the completion offer, which the user answers either way — declining leaves the activity InProgress, to be closed by hand on the Course page. Priority changes only in the Backlog, so work in motion is sent back there first, which re-opens its triage; content and placement are separate concerns, and the board is neither, since a task stays on the board it was created on for its whole life.

## Level 1 — fully detailed (system chains inline-expanded)

![BP11 level 1](SVG/BP11_WorkTheBoard.01_detailed.svg)

## Level 2 — detailed (system chains collapsed, one box per call site)

![BP11 level 2](SVG/BP11_WorkTheBoard.02_detailed.svg)

## Call sites

Ten, each one synchronous call into the system. The ids are **call sites of this process**
(`BP11.yy`, ADR-069) — which System Interaction each resolves to is a Design decision, recorded in
`si-binding.yaml`, never a rename. Variations of one request are permutations of one operation and
never a second call site; the `.bpd`'s header comment records which were collapsed and why.

| Call site | On the box | What it does | Steps |
|---|---|---|---|
| [`BP11.01`](../02_System-Interactions/BP11.01_ReadTheBoardsInPlay.md) | Read the boards in play | Every live board, an archived project's left out, Chores while it carries open work, the focused ones grouped at the front, and the board to open named. | 5 |
| [`BP11.02`](../02_System-Interactions/BP11.02_ReadABoard.md) | Read a board | Columns from the template that governs it — a project's own, or the Chores board's own — cards with their priority, the three buckets kept present, the lineage of the work, and a quiet flag on an activity whose predecessor is unfinished. | 5 |
| [`BP11.03`](../02_System-Interactions/BP11.03_MoveTask.md) | Move a task | Places the task in the column it was dropped on, keeps its priority with it, and reports whether an activity's last task reached Done. | 3 |
| [`BP11.04`](../02_System-Interactions/BP11.04_PrioritizeTask.md) | Prioritize a task | Records the triage bucket for a task in the Backlog, and refuses the change with a reason for one outside it. | 2, one gateway |
| [`BP11.05`](../02_System-Interactions/BP11.05_RankTask.md) | Rank a task | Records the new relative order within the bucket or the column. | 1 |
| [`BP11.06`](../02_System-Interactions/BP11.06_AmendTask.md) | Amend a task | Applies the title and description. The board and the column are untouched. | 1 |
| [`BP11.07`](../02_System-Interactions/BP11.07_ArchiveTask.md) | Archive a task | The archiving act that takes a single card — one of the three a task has. | 1 |
| [`BP11.08`](../02_System-Interactions/BP11.08_DeleteTask.md) | Delete a task | Deletes the task. It owns nothing, so nothing goes with it. | 1 |
| [`BP11.09`](../02_System-Interactions/BP11.09_SetTheActivityDone.md) | Set the activity Done | Records the activity's state — the completion offer answered from the board. | 1 |
| [`BP11.10`](../02_System-Interactions/BP11.10_DraftTheTaskInput.md) | Draft the task input | Keeps what is typed as a draft, out of version control. One-way: nothing waits for it, and the write that commits the form discards it. Every form on this surface drafts this way (BR-121). | 1 |

**Moving between columns and sending a task back to the Backlog are one request**, as are ranking
within a bucket and ranking within a column. `BP11.09` is the one call site §6 did not list under
this process: the completion offer BR-109 raises has to be answerable where it is raised, and the
same operation is BP18's in the project's plan — which binding records at Design, not this drawing.

## Findings for the Software Architect

1. **A task deletion has no impact read, and that is deliberate.** Every other destructive act in
   the product is two call sites, an impact read then the write, because it reaches something. A task
   owns nothing (BR-17), so there is nothing to disclose; the drawing keeps the confirmation step —
   there is no in-app undo (BR-20) — and skips the empty read rather than minting a call site that
   would always answer *nothing*.
2. **An activity's state is the Course page's to own (BR-109), and this process only answers the
   offer.** It never sets a state the user did not ask for, and reopening a Done activity is BP18's.
