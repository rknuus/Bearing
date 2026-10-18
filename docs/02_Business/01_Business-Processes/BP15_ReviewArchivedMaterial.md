# BP15 — Review archived material

**Stage.** Discovery / Mockup — before the Intent gate. Nothing here is const.

| | |
|---|---|
| **Trigger** | **User**, occasionally — something to look up, or something to bring back. |
| **Goal** | Anything that can come back whole is back in the working set exactly as it left, and what is to be destroyed is destroyed from here. |
| **Actors** | **User** (the only human; also the stakeholder) · **Bearing** (the system). No external system takes part. |
| **Source** | `diagrams/BP15_ReviewArchivedMaterial.bpd` — the one tagged source for both levels. |
| **Sources it traces to** | `wf §7.8` |
| **Rules it exercises** | BR-05, BR-12, BR-19, BR-25, BR-26, BR-27, BR-117, BR-118 |

## The flow in one paragraph

The archive is reachable only by an explicit act, and what it holds is retained rather than removed. There is one view per kind — ideas, goals, progress measures, projects, tasks — reached from the tab that owns that kind, each archived goal carrying its check-out record and each measure named under the goal it belongs to, having no page of its own. What the view shows is in play and frozen, so looking at an item asks the system for nothing and changing one means bringing it back first; filtering or sorting the list is the client's own business (BR-92). This process therefore draws the two acts an archived item takes and nothing else. Bringing one back is neither disclosed nor confirmed — it offers nothing to choose and destroys nothing, so the one request judges and acts, and its answer says what came back or what is missing. Unarchiving is judged over the item and its surroundings together: the whole bundle comes back as it went, in its prior state and prior position, and a partial unarchive can never be consistent, so no subset is ever offered in either direction. Where the bundle can no longer be reassembled — a member deleted out of the archive, a surrounding now gone — the item stays archived and the user is told what is missing. Destroying one out of the archive is this process's act too, because the owning processes all read live items and this is the one surface an archived item is in front of the user at all: it discloses what the deletion takes — the item's own rule, exactly as a live item's deletion would — and is approved or abandoned, and afterwards no bundle that needed it can be reassembled.

## Level 1 — fully detailed (system chains inline-expanded)

![BP15 level 1](SVG/BP15_ReviewArchivedMaterial.01_detailed.svg)

## Level 2 — detailed (system chains collapsed, one box per call site)

![BP15 level 2](SVG/BP15_ReviewArchivedMaterial.02_detailed.svg)

## Call sites

Three, each one synchronous call into the system. **`BP15.01` *Read the archived items* is retired on 2026-10-17**, its id never reused (ADR-066): what a surface shows is loaded and derived at start-up, so opening it asks the system for nothing — the derived-data inventory carries each value with the rule that governs it. **One is retired, and its id is never reused** (ADR-066, SA 2026-10-16): `BP15.02` *See what unarchiving will bring back* — unarchiving discloses nothing and is not confirmed, so the judging is the one request's own first act. **`BP15.04` *See what deleting the archived item takes* and `BP15.05` *Delete an archived item* are minted on 2026-10-16**, closing the gap `G-1` recorded: the rules let an archived item be deleted outright (BR-05) and the unarchive refusal exists for a member deleted out of the archive (BR-25), but no process offered the act. The ids are **call sites of this process**
(`BP15.yy`, ADR-069) — which System Interaction each resolves to is a Design decision, recorded in
`si-binding.yaml`, never a rename. Variations of one request are permutations of one operation and
never a second call site; the `.bpd`'s header comment records which were collapsed and why.

| Call site | On the box | What it does | Steps |
|---|---|---|---|
| [`BP15.03`](../02_System-Interactions/BP15.03_UnarchiveItem.md) | Unarchive an item | Judges whether the whole bundle can come back — every member still there, the surroundings still able to hold it — and returns it to its prior state and position where it can. One report carries both outcomes. | 2, one gateway |
| [`BP15.04`](../02_System-Interactions/BP15.04_ReadTheArchivedDeletionImpact.md) | See what deleting the archived item takes | What the item's own rule gives, exactly as for a live one. Empty where the item owns nothing. | 1 |
| [`BP15.05`](../02_System-Interactions/BP15.05_DeleteArchivedItem.md) | Delete an archived item | Deletes what was confirmed. Any bundle that needed it can no longer be reassembled, so an unarchive that wanted it is refused afterwards. | 2 |

**§6's eight candidates draw as two.** The five archivable kinds are **not five operations**:
unarchiving is one
request whose consequences differ by what the item carries — a project brings its activities and
their tasks, a goal brings its measures and their check-in history, a measure brings its own — rather
than by which operation is called. Unarchiving needs no second call site either: there is nothing to
choose and nothing to lose, so it judges and acts in one request.

## Findings for the Software Architect

1. **One delete serves all five kinds, and for two of them it discloses nothing.** The kind is the
   request's payload, as it is for the unarchive, and what the deletion reaches is the
   item's own rule applied where it reaches (BR-12, DRW-19). An idea, a goal and a project own
   something, so the drawing carries the disclose-then-approve shape every destructive act has; a
   task and a measure own nothing, so their disclosure is empty. DRW-28 cannot express that in one
   branch without dispatching on the kind, and a kind is a permutation, not a gateway.
