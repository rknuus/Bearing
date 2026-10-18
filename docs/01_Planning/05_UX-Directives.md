# Bearing v2 — UX Directives

> **What this is.** Surface decisions the Software Architect has already made, held here until the
> **screen models** (`docs/02_Business/06_Screen-Models/`) exist to absorb them. They are **not business
> rules**: they bind the UI, they do not constrain the system's behaviour, and no gate freezes them in
> this form. The Intent gate's business rules live in
> [`01_Intent_Gate-Document.md`](01_Intent_Gate-Document.md) §4 and deliberately say nothing about
> surfaces; the general UI craft rules — focus, motion, hit targets, conventions — live in
> [`04_Acceptance_Gate-Document.md`](04_Acceptance_Gate-Document.md) §4 as the visual-sampling brief.
>
> **This file is a holding pen, not a home.** When the screen models are authored, each directive below
> moves into the model of the surface it governs and this file is retired.

**Citations.** `funnel §…` (`sources/funnel.md`), `wf §…` (`sources/ui-wireframes.md`), `inv`
(`sources/ui-inventory.md`); `SA <date>` is a direct Software Architect decision. The index's Sources
table is the legend.

| # | Directive | Source |
|---|---|---|
| UX-01 | **Drilling into a day from a longer period does not open a separate dialog.** The period overview stays on screen and the day's editor appears **beside** it, so the user edits a day without losing sight of the week, month or year they are editing it in. | SA 2026-10-04 (on BR-40) |
| UX-02 | **Period navigation is two buttons flanking the selected period** — step backwards on its left, step forwards on its right — not a single control. Returning to the current period is separate from stepping. | SA 2026-10-04 (on BR-46) |
| ~~UX-03~~ | ~~**The guided first-run flow is called the onboarding wizard**~~ **VOID 2026-10-11** — there is no guided first-run flow (BR-82): the template files make the product usable and a first-time startup opens Themes (BR-48). Where the funnel diagram belongs, if anywhere, is open. | SA 2026-10-04, `wf §7.1`, SA 2026-10-11 |
| UX-04 | **One editor per entity serves both creating and editing it**, with its title and its commit action worded for the case at hand. | `inv`, `wf` guideline #7 |
| UX-06 | **Retrieving archived items replaces the working view rather than overlaying it**, with an explicit way back — an archive can hold a year of tasks, which a modal cannot show well, and the replacement makes the mode unambiguous. | `wf §7.8` |
| ~~UX-07~~ | ~~**The shipped life areas can be asked for again from the Themes surface**~~ **VOID 2026-10-11** — BR-83 is void: there is no restore and no reset, and deleting the data folder outside Bearing is how a user starts over (*"I don't see a need to reset the data directory"*, SA). The product therefore has no "fill it in for me" affordance at all. | `wf §7.6`, SA 2026-10-10, SA 2026-10-11 |
| ~~UX-08~~ | ~~**The normalized form of a tag is shown before it is committed**, and only when normalization actually changed what the user typed (BR-06).~~ **VOID 2026-10-09** — the tag is retired with BR-06 (QB-40), so there is no normalization to show. | `wf §3.2` |
| ~~UX-09~~ | ~~**Reserved and colliding tags block the commit and name the conflict** — the colliding idea by title, the reserved string by the board it belongs to (BR-05, BR-07).~~ **VOID 2026-10-09** — the tag is retired with BR-07 (QB-40), so there is no reserved set and no collision to name. | `wf §3.2` |
| UX-10 | **A theme-only goal says so explicitly** rather than rendering as a goal with a blank link (BR-04). | `wf §4.1` |
| UX-11 | **Funnel lineage is shown at the point of execution** — on the board, above the work — and on the day's focus summary, and in the titles of dialogs that act on a child entity. It is orientation, never navigation, and there is **no persistent breadcrumb**: the tab strip already answers "where am I". *(Was Intent BR-11; moved here 2026-10-05 as a UX decision. UX-05 said the same thing and is merged into this row.)* | `wf §1`, `wf §6.1`, guideline #6, SA 2026-10-05 |
| UX-12 | **An idea-less goal's flag is a hint, not an alarm.** BR-04 requires that a goal with no linked idea be visibly flagged, because the state is legitimate and should simply be obvious. It is **not** a warning, an error or anything in-your-face — a quiet marker the eye can find, in the same register as the rest of the row. | SA 2026-10-05 (on BR-04) |
| UX-13 | **Applying an advisor proposal never navigates the user away.** When the change lands on a surface they are not looking at (BR-74), it commits there and is announced in passing — with a way to jump to it if they want — so a conversation is never interrupted by being moved somewhere else. | `wf §7.5`, SA 2026-10-05 |
| UX-14 | **Routines have a view of their own**, and no section of the Themes tab. A routine has no theme (BR-02), so there is nothing to group it under and nothing for it to inherit; the view carries routines and nothing else, and it is the one home BR-10 asks for. Ideation keeps its **Unthemed** group, which holds theme-less ideas and only those (BR-03). The routine editor carries no life area field. | SA 2026-10-13, over SA 2026-10-11 |
| UX-15 | **A check-in's note is never pressed on the user.** The value is the point of the gesture and the note is optional (BR-28), so the note field is foldable and folded by default — the user opens it when they have something to say. The rest of the check-in surface keeps v1's shape: the measure's current value against its target, with its history beneath. | SA 2026-10-16 |
| UX-16 | **A quiet notice is how the product says something happened that no act answers.** Inline on the surface it concerns, in the register UX-12 sets for a marker: visible, never loud, never modal, never blocking, and carrying nothing the user has to clear. It is not a question, and nothing is offered with it — where there is something to be done about it, the user starts that gesture themselves. Two notices about the same moment read as one. Where they are used: the data folder that was just set up (BP01), a goal whose horizon has passed (BR-22, UX-12), a change the advisor landed on a surface the user is not looking at (UX-13, BR-74), and the date advancing at midnight, together with the new date carrying no focus (BR-44, BP14). | SA 2026-10-18 |
