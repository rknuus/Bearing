# Bearing v2 — Parked functionality

> **What this is.** Capability the Software Architect has looked at, found inconsistent or missing,
> and deliberately set aside. A parked item is **carried into the architecture and stops there**:
> the decomposition has to be able to absorb it without a do-over, and it is then neither
> detail-designed nor implemented. Nothing is built for it and nothing is drawn for it — no business
> process, no system interaction, no screen.
>
> **What it is not.** Not an open question: nothing here waits for an answer
> ([`09_Open-Design-Questions.md`](09_Open-Design-Questions.md) is where what waits lives). Not a
> rule either — the rule as written is the rule that holds, and the row says only what changing it
> would take.
>
> **Why it is written down.** A gap nobody records comes back as a finding at every review, and an
> architecture that first meets it at implementation time pays for it then. Recorded once, it is
> answered once and designed for once.

## The parked items

| # | Parked | Why it is inconsistent | What the architecture has to absorb |
|---|---|---|---|
| P-1 | **Archiving a theme.** BR-23 archives an idea, a goal, a progress measure, a task and a project, and excludes the theme; a theme is left with deletion as its only way out, and deletion is unrecoverable inside the product (BR-20, POL-05). | Archiving is retention and the one way to take something out of the working view without destroying it (POL-07). The theme is the top of the funnel, so it is the entity a user is most likely to outgrow and least able to lose, and it is exactly where retention is missing. Set aside 2026-10-18 as not worth the product's while. | Which kinds archive is data, not structure: the archive facility is already general over five kinds (BR-23 to BR-26), and nothing may be hardwired to that list or to the reaches BR-112 names. A sixth kind, with a cascade of its own, must cost a rule and not a redesign. |
| P-2 | **Archiving a routine.** BR-23 excludes it and offers pausing instead (BR-91, BR-43). | Pausing answers *not now*; it does not answer *not again*. A routine the user is done with stays in the Routines view for life or is deleted outright, which is the same unrecoverable exit the theme has. Set aside 2026-10-18 on the same grounds. | The same as P-1: a routine becomes a sixth archivable kind, with its tasks already archivable on their own (BR-61) and therefore a reach to decide, not to invent. |

Both were raised by the Software Architect on 2026-10-18 — *"it's inconsistent to not offer
archiving of a theme. But it's also not important to me … consider it for the architecture design,
but then not detail-design nor implement it. Same for routines."*
