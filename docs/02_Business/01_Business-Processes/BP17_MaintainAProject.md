# BP17 — Maintain a project

**Stage.** Discovery / Mockup — before the Intent gate. Nothing here is const.

| | |
|---|---|
| **Trigger** | **User**, when work begins or ends — work to organize, or a project to settle. |
| **Goal** | Every project exists with its parent and its kind, and leaves the working set only by being archived or deleted, with everything it carries disclosed first. |
| **Actors** | **User** (the only human; also the stakeholder) · **Bearing** (the system). No external system takes part. |
| **Source** | `diagrams/BP17_MaintainAProject.bpd` — the one tagged source for both levels. |
| **Sources it traces to** | `act §1`, `act §12` |
| **Rules it exercises** | BR-20, BR-23, BR-26, BR-43, BR-96, BR-97, BR-101, BR-108, BR-109, BR-111, BR-112, BR-113, BR-114, BR-117, BR-121 |

## The flow in one paragraph

The Course tab reads the live projects with their parent and their kind and each one's Done / InProgress / Todo counts. A project is created with its parent — an idea, a goal, a progress measure, or none, single-valued and never asked about by kind — and with its own kind, declared once and held for the project's life, since there is no migration either way. A simple project gets its one board from its column template; an activity-based one gets an empty plan, which is BP18's to lay out. Amending a project reaches its name and its parent and not its kind. Setting a project aside discloses what the archiving takes — its activities and the tasks on their boards, archived ones counted — and the user approves the whole thing or nothing, because nothing below a project can be kept behind; this is the only way an activity is archived at all. Deleting one is the same shape, and the parent survives it minus the link.

## Level 1 — fully detailed (system chains inline-expanded)

![BP17 level 1](SVG/BP17_MaintainAProject.01_detailed.svg)

## Level 2 — detailed (system chains collapsed, one box per call site)

![BP17 level 2](SVG/BP17_MaintainAProject.02_detailed.svg)

## Call sites

Eight, each one synchronous call into the system. The ids are **call sites of this process**
(`BP17.yy`, ADR-069) — which System Interaction each resolves to is a Design decision, recorded in
`si-binding.yaml`, never a rename. Variations of one request are permutations of one operation and
never a second call site; the `.bpd`'s header comment records which were collapsed and why.

**`BP17.06` to `BP17.13` are retired** — the plan moved to **BP18** on 2026-10-10, so one process
holds the project and the other its course. A retired number is never reused, which is why the ids
below run `.01`–`.05` and then `.14`–`.15`: an id is an identifier, not a position.

| Call site | On the box | What it does | Steps |
|---|---|---|---|
| [`BP17.01`](../02_System-Interactions/BP17.01_ReadTheProjectList.md) | Read the project list | The live projects with their parent, their kind and their activity counts by state. | 3 |
| [`BP17.02`](../02_System-Interactions/BP17.02_CreateProject.md) | Create a project | Stores the project with its parent and kind, creates its column template from the default columns, then its one board or its empty plan. | 3, one gateway |
| [`BP17.03`](../02_System-Interactions/BP17.03_AmendProject.md) | Amend a project | Applies the name and the parent. The kind is left as declared. | 2 |
| [`BP17.04`](../02_System-Interactions/BP17.04_ReadTheProjectDeletionImpact.md) | See what deleting a project takes | The activities and their tasks, or a simple project's own board and tasks, archived ones counted. | 4 |
| [`BP17.05`](../02_System-Interactions/BP17.05_DeleteProject.md) | Delete a project | Deletes everything the project is, leaving the parent standing minus the link. | 3 |
| [`BP17.14`](../02_System-Interactions/BP17.14_ReadTheProjectArchivingImpact.md) | See what archiving a project takes | The activities and their tasks, archived ones counted; approved whole or rejected whole. | 4 |
| [`BP17.15`](../02_System-Interactions/BP17.15_ArchiveProject.md) | Archive a project | Archives the activities and their tasks, then the project, withdrawing it from the focus selectables. | 3 |
| [`BP17.16`](../02_System-Interactions/BP17.16_DraftTheProjectInput.md) | Draft the project input | Keeps what is typed as a draft, out of version control. One-way: nothing waits for it, and the write that commits the form discards it. Every form on this surface drafts this way (BR-121). | 1 |

**Creating either kind is one request.** Archiving and deleting are each a disclosure and a write
(BR-112, BR-113, BR-114, BR-117). **Archiving a project was missing from §6's candidate list
altogether** although BR-23 makes it an act and BR-112 its rule — it belongs here, since archiving a
project is the only way an activity is archived.

## Findings for the Software Architect

1. **The project list leaves archived projects out (BR-26), so an archived project comes back only
   through BP15.** Consistent with every other archived entity; noted because the Course tab is also
   where a project would most naturally be brought back from.
