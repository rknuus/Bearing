# BP10 — Capture tasks

**Stage.** Discovery / Mockup — before the Intent gate. Nothing here is const.

| | |
|---|---|
| **Trigger** | **User**, at intake — work worth writing down, often mid-execution. |
| **Goal** | A batch of tasks lands on its boards at the Backlog, in the triage buckets the user captured them into. |
| **Actors** | **User** (the only human; also the stakeholder) · **Bearing** (the system). No external system takes part. |
| **Source** | `diagrams/BP10_CaptureTasks.bpd` — the one tagged source for both levels. |
| **Sources it traces to** | `wf §6.2` |
| **Rules it exercises** | BR-53, BR-55, BR-62, BR-63, BR-65, BR-90, BR-103 |

## The flow in one paragraph

Capture reads the boards that exist, grouped by project and with Chores left out of the offer. The user stages tasks across the three triage buckets, tidying the batch as they go — amend a staged draft, reorder them, discard one or all — and then commits it as one act or leaves it. A staged batch is a draft: it survives leaving the gesture, a crash and a restart, is kept outside version control, and takes effect only on commit. A task that names no board at all lands on Chores, and capturing a task never creates a board.

## Level 1 — fully detailed (system chains inline-expanded)

![BP10 level 1](SVG/BP10_CaptureTasks.01_detailed.svg)

## Level 2 — detailed (system chains collapsed, one box per call site)

![BP10 level 2](SVG/BP10_CaptureTasks.02_detailed.svg)

## Call sites

Seven, each one synchronous call into the system. The ids are **call sites of this process**
(`BP10.yy`, ADR-069) — which System Interaction each resolves to is a Design decision, recorded in
`si-binding.yaml`, never a rename. Variations of one request are permutations of one operation and
never a second call site; the `.bpd`'s header comment records which were collapsed and why.

| Call site | On the box | What it does | Steps |
|---|---|---|---|
| [`BP10.01`](../02_System-Interactions/BP10.01_ReadTheSelectableBoards.md) | Read the selectable boards | Chores is never a destination the user picks. Naming no board at all is what sends a task there. The answer is empty until the first project exists, and then naming no board is the only legal capture. | 2 |
| [`BP10.02`](../02_System-Interactions/BP10.02_StageTaskDraft.md) | Stage a task draft | A staged draft is not a commit. It is kept outside version control. | 2 |
| [`BP10.03`](../02_System-Interactions/BP10.03_AmendStagedDraft.md) | Amend a staged draft | — | 1 |
| [`BP10.04`](../02_System-Interactions/BP10.04_ReorderStagedDrafts.md) | Reorder staged drafts | — | 1 |
| [`BP10.05`](../02_System-Interactions/BP10.05_DiscardStagedDrafts.md) | Discard staged drafts | One request discards a single draft and the whole batch alike. | 1 |
| [`BP10.06`](../02_System-Interactions/BP10.06_CommitStagedTasks.md) | Commit the staged tasks | Capturing a task never creates a board. The batch commits as one act. | 4 |
| [`BP10.07`](../02_System-Interactions/BP10.07_ReadTheStagedBatch.md) | Read the staged batch | The answer is empty where nothing was left staged. A draft is kept outside version control. | 1 |
