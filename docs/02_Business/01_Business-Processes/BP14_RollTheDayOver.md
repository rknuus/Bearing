# BP14 — Roll the day over

**Stage.** Discovery / Mockup — before the Intent gate. Nothing here is const.

| | |
|---|---|
| **Trigger** | **Clock** — local midnight, and that is not configurable (BR-44). |
| **Goal** | The current date has advanced, so the day focus in play is the new date's, and the user is told so quietly — without being interrupted and without being asked anything. |
| **Actors** | **Clock** (a `scheduler pool`) · **Bearing** (the system) · **User**, who is told the date moved on and does nothing. |
| **Source** | `diagrams/BP14_RollTheDayOver.bpd` — the one tagged source for both levels. |
| **Sources it traces to** | `funnel §Day rollover`, `arch §12 Q1` |
| **Rules it exercises** | BR-41, BR-44, BR-45 |

## The flow in one paragraph

At local midnight the clock reaches the next date and Bearing advances which date is current. That is the whole of it: the new date's focus comes into play empty until it is set, and nothing is created, archived, closed or settled — no task is spawned, because only selecting a routine does that. The previous date's focus is history the moment the date moves on, reachable from the period views, and nothing is done to it: that record already exists and the rollover neither writes nor moves it (R-5). The day that just ended joins the span the next check-out settles (BR-33). Nothing is offered either: the surface says quietly that the date advanced, and where the new date carries no focus it says that with it — one notice in UX-16's register — while setting a focus stays the user's own act, started on the Focus tab (BP08). And nothing interrupts: the board in front of the user stays open and a gesture already under way, a drag included, is unaffected.

## Level 1 — fully detailed (system chains inline-expanded)

![BP14 level 1](SVG/BP14_RollTheDayOver.01_detailed.svg)

## Level 2 — detailed (system chains collapsed, one box per call site)

![BP14 level 2](SVG/BP14_RollTheDayOver.02_detailed.svg)

## Call sites

One synchronous call into the system. The id is a **call site of this process** (`BP14.yy`,
ADR-069) — which System Interaction it resolves to is a Design decision, recorded in
`si-binding.yaml`, never a rename.

| Call site | On the box | What it does | Steps |
|---|---|---|---|
| [`BP14.01`](../02_System-Interactions/BP14.01_RollTheDayOver.md) | Roll the day over | Advances the current date, puts the new date's focus in play empty, and reports that focus. | 3 |

**Advancing the date is the whole request.** There is nothing to collapse into it, and what the
surface then says is that answer being shown (UX-16) rather than a second chain.

## Findings for the Software Architect

1. **§5 says *no user lane*; this drawing has one, and it carries no act.** The rollover is told to
   the user — the board they are on stays open and nothing is asked — and being told is not
   something they do, so the lane holds the work the clock interrupts and the message that reaches
   it. §5's Pools column is corrected to say that.
2. **The cut still has this as a process of its own, and §5 flags that it may read better as a start
   event inside BP08** — your call. Drawn standalone, which is the cut as it stands; folding it later
   moves one call site into BP08 and retires `BP14`.
