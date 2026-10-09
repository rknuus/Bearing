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
| UX-03 | **The guided first-run flow is called the onboarding wizard** (BR-82), and the funnel diagram appears only on its first step. | SA 2026-10-04, `wf §7.1` |
| UX-04 | **One editor per entity serves both creating and editing it**, with its title and its commit action worded for the case at hand. | `inv`, `wf` guideline #7 |
| UX-06 | **Retrieving archived items replaces the working view rather than overlaying it**, with an explicit way back — an archive can hold a year of tasks, which a modal cannot show well, and the replacement makes the mode unambiguous. | `wf §7.8` |
| UX-07 | **The starter theme set is re-seedable from the Themes surface when it is empty** (BR-83) — the one "fill it in for me" affordance in the product, and the only empty state that offers an action with no equivalent elsewhere. | `wf §7.6` |
| UX-08 | **The normalized form of a tag is shown before it is committed**, and only when normalization actually changed what the user typed (BR-06). | `wf §3.2` |
| UX-09 | **Reserved and colliding tags block the commit and name the conflict** — the colliding idea by title, the reserved string by the board it belongs to (BR-05, BR-07). | `wf §3.2` |
| UX-10 | **A theme-only goal says so explicitly** rather than rendering as a goal with a blank link (BR-04). | `wf §4.1` |
| UX-11 | **Funnel lineage is shown at the point of execution** — on the board, above the work — and on the day's focus summary, and in the titles of dialogs that act on a child entity. It is orientation, never navigation, and there is **no persistent breadcrumb**: the tab strip already answers "where am I". *(Was Intent BR-11; moved here 2026-10-05 as a UX decision. UX-05 said the same thing and is merged into this row.)* | `wf §1`, `wf §6.1`, guideline #6, SA 2026-10-05 |
| UX-12 | **An idea-less goal's flag is a hint, not an alarm.** BR-04 requires that a goal with no linked idea be visibly flagged, because the state is legitimate and should simply be obvious. It is **not** a warning, an error or anything in-your-face — a quiet marker the eye can find, in the same register as the rest of the row. | SA 2026-10-05 (on BR-04) |
| UX-13 | **Applying an advisor proposal never navigates the user away.** When the change lands on a surface they are not looking at (BR-74), it commits there and is announced in passing — with a way to jump to it if they want — so a conversation is never interrupted by being moved somewhere else. | `wf §7.5`, SA 2026-10-05 |
