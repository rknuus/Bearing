# BP12 — Manage board columns

**Stage.** Discovery / Mockup — before the Intent gate. Nothing here is const.

| | |
|---|---|
| **Trigger** | **User**, rarely — the lanes no longer fit the work. |
| **Goal** | The board's lanes match how the work actually flows, with one Backlog and at least one Done still standing. |
| **Actors** | **User** (the only human; also the stakeholder) · **Bearing** (the system). No external system takes part. |
| **Source** | `diagrams/BP12_ManageBoardColumns.bpd` — the one tagged source for both levels. |
| **Sources it traces to** | `wf §6.1`, `arch §8 DeleteColumn`, `arch §10` |
| **Rules it exercises** | BR-18, BR-20, BR-21, BR-23, BR-54, BR-58, BR-59, BR-60, BR-108, BR-117, BR-121 |

## The flow in one paragraph

Columns come from a template, never from the board itself: one per project governing every board of that project with no deviation inside it, plus Chores's own, which governs that one board. The template read reports each column with its role and its name, how many boards that template governs, which role changes are legal, and which columns carry tasks across all of those boards — so the user is told what may change, and how far it reaches, instead of being refused after the fact. That reach is the thing to keep in view: an activity-based project's template governs one board per activity, so inserting, reordering, re-roling or deleting a lane lands on every one of them at once, while archiving a lane's tasks reaches only the board the user is on. Then one act, repeatable: rename, insert before or after, reorder, change what a lane means, clear a lane out by archiving everything in it, or remove a lane. The Backlog role never changes and the last Done column cannot leave the role; within those limits the consequences are the user's, InProgress → Done making its tasks count as completed and Done → InProgress unwinding completions already counted. Deleting a column discloses the tasks it holds board by board, archived ones counted, and declining rejects the deletion rather than detaching, because a task cannot be left without a column; a column empty everywhere has nothing to disclose and deletes cleanly. A second Backlog, and the removal of the Backlog or the last Done, are refused with their reason rather than silently prevented.

## Level 1 — fully detailed (system chains inline-expanded)

![BP12 level 1](SVG/BP12_ManageBoardColumns.01_detailed.svg)

## Level 2 — detailed (system chains collapsed, one box per call site)

![BP12 level 2](SVG/BP12_ManageBoardColumns.02_detailed.svg)

## Call sites

Nine, each one synchronous call into the system. The ids are **call sites of this process**
(`BP12.yy`, ADR-069) — which System Interaction each resolves to is a Design decision, recorded in
`si-binding.yaml`, never a rename. Variations of one request are permutations of one operation and
never a second call site; the `.bpd`'s header comment records which were collapsed and why.

| Call site | On the box | What it does | Steps |
|---|---|---|---|
| [`BP12.01`](../02_System-Interactions/BP12.01_ReadTheColumnTemplate.md) | Read the column template | The template that governs the board, how many boards it governs, each column's role and name, which role changes are legal, and which columns carry tasks across those boards. | 5 |
| [`BP12.02`](../02_System-Interactions/BP12.02_RenameColumn.md) | Rename a column | Applies the name. The role is untouched — check-out and the advisor read the role, never the name. | 1 |
| [`BP12.03`](../02_System-Interactions/BP12.03_InsertColumn.md) | Insert a column | Places the column where the request names it, with its role and name, or refuses the insertion with its reason where the invariant forbids it. | 3, one gateway |
| [`BP12.04`](../02_System-Interactions/BP12.04_ReorderColumns.md) | Reorder columns | Records the new left-to-right order in the template. | 1 |
| [`BP12.05`](../02_System-Interactions/BP12.05_ChangeColumnRole.md) | Change a column's role | Records the new role within BR-60's two limits, or refuses with a reason, and recounts what the Done columns hold. | 3, one gateway |
| [`BP12.06`](../02_System-Interactions/BP12.06_ArchiveColumnTasks.md) | Archive a column's tasks | Archives every task in the column **on the board the user is on** and leaves the column in the template. | 2 |
| [`BP12.07`](../02_System-Interactions/BP12.07_ReadTheColumnDeletionImpact.md) | See what deleting a column takes | Collects the tasks in that column on every board the template governs, archived ones counted, and reports what the deletion will take board by board. | 4 |
| [`BP12.08`](../02_System-Interactions/BP12.08_DeleteColumn.md) | Delete a column | Deletes the tasks it held on every board the template governs and the column from the template, or refuses with its reason where the invariant protects it. | 3, one gateway |
| [`BP12.09`](../02_System-Interactions/BP12.09_DraftTheColumnInput.md) | Draft the column input | Keeps what is typed as a draft, out of version control. One-way: nothing waits for it, and the write that commits the form discards it. Every form on this surface drafts this way (BR-121). | 1 |

**Inserting before and inserting after are one request.** So are configuring a project's template and
configuring Chores's own: the gesture is the same and only the owner differs (BR-108). The two call
sites §6 did not list are the **template read**, which is what makes the role limits visible before
the user commits to a change, and the **deletion impact read**, the same two-call-site shape every
reaching act has.

## Findings for the Software Architect

1. **The invariant is enforced per template, not per board (BR-59), and so is every write here but one.** For an activity-based project with dozens of activity boards that is one check rather than dozens — and it also means a role change or a column deletion lands on **every** board of that project at once. The template read now reports how many boards it governs and the deletion discloses board by board; how loudly the surface warns about the blast radius is §7's.
2. **Archiving a lane's tasks is the one act scoped to a single board.** It touches tasks, not the template, so it reaches the board in front of the user — unlike the four acts that change the template itself. Flagged because the asymmetry is easy to misread as an inconsistency.
