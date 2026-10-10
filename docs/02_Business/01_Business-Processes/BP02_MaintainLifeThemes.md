# BP02 — Maintain life themes

**Stage.** Discovery / Mockup — before the Intent gate. Nothing here is const.

| | |
|---|---|
| **Trigger** | **User**, two to four times a year — a life area needs attention. |
| **Goal** | The set of life areas, their colours and their order say what matters to the user; vision and mission say who they want to become. |
| **Actors** | **User** (the only human; also the stakeholder) · **Bearing** (the system). No external system takes part. |
| **Source** | `diagrams/BP02_MaintainLifeThemes.bpd` — the one tagged source for both levels. |
| **Sources it traces to** | `funnel §1`, `wf §2.1`, `wf §2.2`, `wf §2.5` |
| **Rules it exercises** | BR-03, BR-09, BR-13, BR-16, BR-19, BR-20, BR-21, BR-95, BR-117, BR-121 |

## The flow in one paragraph

Opening the Themes tab reads the life areas with a live count of the goals and routines under each. One act follows: add a theme, rename or recolour one, reorder them, delete one, or state a vision and mission. Only the deletion is consequential, and it discloses what it will take before it takes anything — a goal or a routine cannot be left theme-less, so where either exists the gesture is approve-or-abandon; ideas may stay behind theme-less, so that cascade is a real choice and starts off. A second real choice rides with it: the routines go either way, but the task occurrences they already produced are governed by the routine's own rule where the deletion reaches it (BR-12, BR-16), so taking them is declinable too and leaving them puts them on Chores with nothing producing new ones.

## Level 1 — fully detailed (system chains inline-expanded)

![BP02 level 1](SVG/BP02_MaintainLifeThemes.01_detailed.svg)

## Level 2 — detailed (system chains collapsed, one box per call site)

![BP02 level 2](SVG/BP02_MaintainLifeThemes.02_detailed.svg)

## Call sites

Nine, each one synchronous call into the system. The ids are **call sites of this process**
(`BP02.yy`, ADR-069) — which System Interaction each resolves to is a Design decision, recorded in
`si-binding.yaml`, never a rename. Variations of one request are permutations of one operation and
never a second call site; the `.bpd`'s header comment records which were collapsed and why.

| Call site | On the box | What it does | Steps |
|---|---|---|---|
| [`BP02.01`](../02_System-Interactions/BP02.01_ReadTheThemesOverview.md) | Read the themes overview | Archived goals are not counted. The count states what is live under the theme today. Whether the prose is set is what distinguishes a collapsed section from one never written; the prose itself is read on expanding it. | 3 |
| [`BP02.02`](../02_System-Interactions/BP02.02_CreateTheme.md) | Create a theme | — | 2 |
| [`BP02.03`](../02_System-Interactions/BP02.03_AmendTheme.md) | Amend a theme | One request covers the name, the colour or both. The colour reaches every entity under the theme. | 1 |
| [`BP02.04`](../02_System-Interactions/BP02.04_ReorderThemes.md) | Reorder themes | Order is relative, so a theme's place is never a stored index. | 1 |
| [`BP02.05`](../02_System-Interactions/BP02.05_ReadTheDeletionImpact.md) | See what deleting a theme takes | A goal and a routine each require a theme, so keeping one is not a legal outcome: the gesture is then approve-or-abandon. An idea may stay behind theme-less, so that cascade is the one real choice and starts off. The disclosure reaches two levels down, because a deleted goal takes its projects and measures with it, and so does an included idea. An archived descendant is counted like a live one. The routines' task occurrences are collected and marked declinable, since a routine reached by this deletion is still governed by BR-16. | 8, one gateway |
| [`BP02.06`](../02_System-Interactions/BP02.06_DeleteTheme.md) | Delete a theme | The request carries the cascade the user approved. What happens below a deleted goal or idea is that entity's own rule, applied where the deletion reaches it. | 4 |
| [`BP02.07`](../02_System-Interactions/BP02.07_ReadVisionAndMission.md) | Read vision and mission | — | 1 |
| [`BP02.08`](../02_System-Interactions/BP02.08_RecordVisionAndMission.md) | Record vision and mission | Both fields are optional. Empty text is the unset state. | 2 |
| [`BP02.09`](../02_System-Interactions/BP02.09_SeedTheStarterThemes.md) | Seed the starter themes | The only thing in the product with a default worth seeding. BP01 seeds the same set at a first run; whether the two call sites are one System Interaction is a Design finding. | 2 |
| [`BP02.10`](../02_System-Interactions/BP02.10_DraftTheThemeInput.md) | Draft the theme input | Keeps what is typed as a draft, out of version control. One-way: nothing waits for it, and the write that commits the form discards it. Every form on this surface drafts this way (BR-121). | 1 |
