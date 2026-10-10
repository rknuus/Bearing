# BP03 — Maintain routines

**Stage.** Discovery / Mockup — before the Intent gate. Nothing here is const.

| | |
|---|---|
| **Trigger** | **User**, rarely — a recurring practice needs attention. |
| **Goal** | The practices the user keeps up are defined, scheduled, on or off hold, and in the order they want to read them. |
| **Actors** | **User** (the only human; also the stakeholder) · **Bearing** (the system). No external system takes part. |
| **Source** | `diagrams/BP03_MaintainRoutines.bpd` — the one tagged source for both levels. |
| **Sources it traces to** | `funnel §Routines`, `wf §2.3` |
| **Rules it exercises** | BR-02, BR-16, BR-19, BR-42, BR-43, BR-91, BR-94, BR-121 |

## The flow in one paragraph

A theme on the Themes tab reads its routines with due and overdue derived from each active routine's schedule — a computation that writes nothing, and one a paused routine is out of altogether: it is not active, so it is neither due nor overdue, and the days it spends paused never become overdue once it is resumed. One act follows: define a routine, amend one, put one on hold or take it off hold, reorder them, or delete one. Deleting discloses the task occurrences the routine already produced; that cascade is declinable, so it starts off, and declining leaves the occurrences on Chores while the routine stops producing new ones.

## Level 1 — fully detailed (system chains inline-expanded)

![BP03 level 1](SVG/BP03_MaintainRoutines.01_detailed.svg)

## Level 2 — detailed (system chains collapsed, one box per call site)

![BP03 level 2](SVG/BP03_MaintainRoutines.02_detailed.svg)

## Call sites

Eight, each one synchronous call into the system. The ids are **call sites of this process**
(`BP03.yy`, ADR-069) — which System Interaction each resolves to is a Design decision, recorded in
`si-binding.yaml`, never a rename. Variations of one request are permutations of one operation and
never a second call site; the `.bpd`'s header comment records which were collapsed and why.

| Call site | On the box | What it does | Steps |
|---|---|---|---|
| [`BP03.01`](../02_System-Interactions/BP03.01_ReadAThemesRoutines.md) | Read a theme's routines | Due and overdue are computed from the recurrence and the preferred days of the active routines, the paused ones being left out. The computation writes nothing. | 3 |
| [`BP03.02`](../02_System-Interactions/BP03.02_DefineRoutine.md) | Define a routine | The theme is required. The recurrence is Daily, Weekly, Monthly or Yearly. | 3 |
| [`BP03.03`](../02_System-Interactions/BP03.03_AmendRoutine.md) | Amend a routine | — | 1 |
| [`BP03.04`](../02_System-Interactions/BP03.04_SetRoutineActive.md) | Pause or resume a routine | One request covers both directions. A paused routine leaves the focus selectables and the due computation, and returns to both on resume. | 1 |
| [`BP03.05`](../02_System-Interactions/BP03.05_ReorderRoutines.md) | Reorder routines | — | 1 |
| [`BP03.06`](../02_System-Interactions/BP03.06_ReadTheDeletionImpact.md) | See what deleting a routine takes | The occurrences are a declinable cascade, so it starts off. Declining leaves them on Chores and stops the routine producing new ones. | 3 |
| [`BP03.07`](../02_System-Interactions/BP03.07_DeleteRoutine.md) | Delete a routine | The request carries the cascade the user approved. | 2 |
| [`BP03.08`](../02_System-Interactions/BP03.08_DraftTheRoutineInput.md) | Draft the routine input | Keeps what is typed as a draft, out of version control. One-way: nothing waits for it, and the write that commits the form discards it. Every form on this surface drafts this way (BR-121). | 1 |
