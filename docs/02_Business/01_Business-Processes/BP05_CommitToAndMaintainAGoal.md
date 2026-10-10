# BP05 — Commit to and maintain a goal

**Stage.** Discovery / Mockup — before the Intent gate. Nothing here is const.

| | |
|---|---|
| **Trigger** | **User**, at the start of a cycle — a commitment to make, or one to maintain. |
| **Goal** | A commitment exists with an objective, the ideas behind it and a horizon if it has one — and ends its life by being archived or deleted. What it is judged against is BP06's. |
| **Actors** | **User** (the only human; also the stakeholder) · **Bearing** (the system). No external system takes part. |
| **Source** | `diagrams/BP05_CommitToAndMaintainAGoal.bpd` — the one tagged source for both levels. |
| **Sources it traces to** | `funnel §3`, `wf §4.1` |
| **Rules it exercises** | BR-01, BR-04, BR-05, BR-08, BR-15, BR-22, BR-23, BR-84, BR-87, BR-112, BR-117, BR-121 |

## The flow in one paragraph

The Goals tab reads the active goals grouped by theme, flagging those with no linked idea and those whose horizon has passed. One act follows: frame a goal, change the commitment, reorder them, archive one, or delete one. Framing is refused with a reason where no theme exists yet. Archiving and deleting each disclose what they will take first, the progress measures and their check-in history going along unasked either way (BR-15, BR-112); archiving a goal is the one place a keep answer is legal, because an archived goal still exists and so orphans nothing. Shaping what a goal is measured by is BP06's, and judging it is BP07's.

## Level 1 — fully detailed (system chains inline-expanded)

![BP05 level 1](SVG/BP05_CommitToAndMaintainAGoal.01_detailed.svg)

## Level 2 — detailed (system chains collapsed, one box per call site)

![BP05 level 2](SVG/BP05_CommitToAndMaintainAGoal.02_detailed.svg)

## Call sites

Eleven, each one synchronous call into the system. The ids are **call sites of this process**
(`BP05.yy`, ADR-069) — which System Interaction each resolves to is a Design decision, recorded in
`si-binding.yaml`, never a rename. Variations of one request are permutations of one operation and
never a second call site; the `.bpd`'s header comment records which were collapsed and why.

**`BP05.06` to `BP05.10` are retired** — the progress-measure lifecycle moved to **BP06** on
2026-10-10, so one process holds the measure and this one holds the commitment. A retired number is
never reused, which is why the ids below run `.01`–`.05` and then `.11`–`.15`: an id is an
identifier, not a position.

| Call site | On the box | What it does | Steps |
|---|---|---|---|
| [`BP05.01`](../02_System-Interactions/BP05.01_ReadTheGoalsOverview.md) | Read the goals overview | The flags read the current state. Nothing acts on the goal. | 4 |
| [`BP05.02`](../02_System-Interactions/BP05.02_FrameGoal.md) | Frame a goal | One request frames a theme-only goal and promotes an idea alike. The horizon may be absent. | 1, one gateway |
| [`BP05.03`](../02_System-Interactions/BP05.03_AmendGoal.md) | Amend a goal | A goal has no parent and no children. | 1 |
| [`BP05.04`](../02_System-Interactions/BP05.04_LinkIdea.md) | Link an idea to a goal | — | 1 |
| [`BP05.05`](../02_System-Interactions/BP05.05_UnlinkIdea.md) | Unlink an idea from a goal | — | 1 |
| [`BP05.11`](../02_System-Interactions/BP05.11_ReorderGoals.md) | Reorder goals within a theme | — | 1 |
| [`BP05.12`](../02_System-Interactions/BP05.12_ReadTheArchivingImpact.md) | See what archiving a goal takes | Cascade, the goal alone, or reject. The keep answer is legal here because an archived goal still exists. | 4 |
| [`BP05.13`](../02_System-Interactions/BP05.13_ArchiveGoal.md) | Archive a goal | Archiving is independent of closing out. A check-out record already attached stays with the goal. | 3 |
| [`BP05.14`](../02_System-Interactions/BP05.14_ReadTheDeletionImpact.md) | See what deleting a goal takes | The measures and their history go unasked. Keeping a project behind is not offered. | 5 |
| [`BP05.15`](../02_System-Interactions/BP05.15_DeleteGoal.md) | Delete a goal | — | 4 |
| [`BP05.16`](../02_System-Interactions/BP05.16_DraftTheGoalInput.md) | Draft the goal input | Keeps what is typed as a draft, out of version control. One-way: nothing waits for it, and the write that commits the form discards it. Every form on this surface drafts this way (BR-121). | 1 |
