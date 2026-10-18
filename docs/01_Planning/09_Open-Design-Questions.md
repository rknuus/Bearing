# Bearing v2 — Open Design Questions

> **What this is.** What five adversarial reviews of the Intent document and the nineteen drawings
> found and could not settle. Everything they found that had one right answer is already applied;
> this page is the residue, ranked. Each row says what is missing or ambiguous, what the user would
> see differently, and what I would do.

> **Answered on 2026-10-12 by the business policies** ([`10_Business-Policies.md`](10_Business-Policies.md) §2),
> and applied where a drawing carried the defect: **G-2** (a check-out log keeps the names of the boards it
> accounted for — a rule is owed, §3.2), **G-6** (discarding a draft is the committing operation's
> business and is never drawn — the three drawn steps are gone), **G-7** (persisting the remembered
> interface state and the ideation filter is technical — BP01's restore step and BP04's note are gone),
> **Q-3** (a new column template starts from four lanes, now in BR-108), **Q-12** (the capture picker
> reads live boards only, now bound in BP10.01). **G-1** (deleting out of the archive) and **G-4** (the
> advisor's non-answer) owed a drawn branch each, and both are **drawn as of 2026-10-16** — see their
> rows.

> **Settled on 2026-10-13 by the check-out's span.** The check-out settles everything since the last
> one, and everything up to now where there has never been one (BR-33). That **dissolves G-3** — there
> is no date to pick and no unreachable day, so no hand-over is owed — and **dissolves Q-7**: the log
> is appended once per check-out and never rewritten, so there is no re-run to be immutable against.
> **Q-13**'s remainder is applied with it, in BP13's narrative.

## Gaps — a capability or a consequence nothing covers

| # | What is missing | What it costs the user | Recommendation |
|---|---|---|---|
| ~~G-1~~ | **CLOSED 2026-10-16 — drawn in BP15** as *drop one for good*, `BP15.04` disclosing what the deletion takes by the item's own rule and `BP15.05` writing it. The deferral to BP15's own review is withdrawn: a concrete issue is fixed when it is identified, whether or not the drawing has been reviewed (SA). **Deleting an item out of the archive.** Four kinds archive, the rules say an archived item can be "deleted outright", and the unarchive refusal exists for "a member deleted out of the archive" — but no process offers the act. The owning processes all read live items only. | Parked work can never be destroyed from inside the product. Two years of archived ideas can only be cleared by deleting the data folder or by git surgery. | A fourth branch in BP15, on the surface the user is already looking at |
| G-2 | **A deletion never reaches a committed day focus or a check-out log.** Deleting or archiving a project, activity or routine is disclosed as "this project, its activities, its tasks" and silently changes the plan for today and for every future date already focused. Nothing says whether a check-out log holds its boards by value or by reference. | The user approves one thing and a second thing changes unseen. The adherence statistic — the one number that judges them over time — is computed over boards that may no longer exist. | Disclose the focus dates a deletion touches; rule that the log keeps names, not references, so history cannot be rewritten |
| ~~G-3~~ | ~~**An earlier day that was never checked out cannot be reached.**~~ **Dissolved 2026-10-13** — the check-out takes everything since the last one, so the user back from two weeks away settles those two weeks with the gesture they already have. BP13's bare *Open the day check-out* was right: there is nothing to pick (BR-33, BR-45) | — | — |
| ~~G-4~~ | **CLOSED 2026-10-16 — drawn in BP16**: the ask answers with its proposals or with what went wrong, by one outcome. No retry arrow is drawn — a request worth repeating is the whole gesture started again (SA 2026-10-16). An apply that fails is not this — it is BR-128's rejected write, which no process draws. **The advisor cannot fail in any drawing.** No timeout, no unreachable model, no retry, no apply-failed — though the surface inventory documents an apply-failed and a network-error state, and a rule already says retrying re-sends the request. | The product's one external dependency has its real failure mode undesigned, and two documented screen states have no process that produces them. | A non-answer branch and a retry in BP16, plus a failed outcome on the apply |
| G-5 | **Two of the three documented ways to start a project are undrawn**, and nothing reads the candidates. The inventory offers project creation from the Idea, Goal and Course pages; only the Course page is drawn. No read fetches the parent candidates, and the goal's "pick an idea to link" has no read behind it either. | A user on an idea cannot start a project from it, and in the project editor nothing fetches what its one parent could be. | Draw the two entries as hand-overs, add the candidate reads — or strike the two pages from the inventory |
| G-6 | **The draft rule's second half is drawn on three writes out of fifteen.** The drafting process deliberately keeps the *keep* half and leaves the *discard* to each committing write; three processes draw it, twelve do not. | A committed field can come back carrying its superseded draft: rename a theme, commit, reopen the editor, see the old text. | One ruling either way — a drawn step on every committing write, or a recorded decision that the discard is the operation's business and never drawn |
| G-7 | **Nothing writes the remembered interface state** that start-up restores, and nothing writes the filter and ordering a read consumes. | The promise that the product comes back as it was left traces to no request. | Either a write where the state changes, or an explicit ruling that persisting it is technical |
| G-8 | **The Operating-system actor contributes to no process.** It is declared as supplying the data-folder location, the locale, the colour scheme and the reduced-motion preference; only the folder is drawn, and nothing says what happens when one changes while the product runs. | Three of the four things a declared actor supplies have no entry point. | A read at launch, or move the three to the Contract as technicalities |
| ~~G-9~~ | ~~**No drawing and no rule says a write verifies what it was given.**~~ **Answered 2026-10-14 — now BR-128:** the system owns the verification of every write, because no client carries business logic of any kind; a failed verification rejects the write and says why, and nothing is partially applied. The rules a write binds (BR-01's required theme, BR-97's creation-only kind, BR-59's lane legality) are enforced there. | — | Carried into every use case at Design. Whether the six chains that draw a refusal gateway today keep it, now that the rule is generic, is read per process as each is reviewed |

Closed on 2026-10-11 after being raised: a review read BP01's folder gateway as letting an
unversioned or foreign folder be loaded. It does not — the folder's state is one of the start-up
preconditions, so the precondition gateway refuses it, the outcome is reported, and the chain never
reaches the load. One refusal, one box, and no second branch owed.

## Ambiguities — two readings, and the user sees the difference

| # | The words | Reading A | Reading B | Recommendation |
|---|---|---|---|---|
| Q-1 | A numeric measure is "target + unit + direction", and its status comes from a percentage that is never defined | percent = current ÷ target, or target ÷ current for a downward measure | percent measured from a baseline, which needs a start value no entity carries | A — and say so, since no baseline is kept |
| ~~Q-2~~ | ~~"Focus adherence is measured over time"~~ | ~~focused boards that saw work ÷ boards focused — did I keep my commitments~~ | ~~focused boards worked ÷ boards worked — how much of my work was on plan~~ | **Moot 2026-10-17** — neither: the figure is dropped. Only a card entering InProgress or Done is recorded, so a task worked on over several days leaves nothing on the days between and either ratio counts movements instead of work (~~BR-123~~) |
| Q-3 | A new column template "starts from the default columns, one Backlog and one Done among them" | two lanes | four, one per role | **Settled 2026-10-12** — four, one per role: with two, the Todo rule and two of the four check-out figures are structurally zero until the user hand-builds the lanes. Now in BR-108 |
| Q-4 | "Moving an activity's last task to Done may offer to mark the activity Done" | last = no card outside a Done column, so one Backlog card suppresses the offer forever | last = the last card in motion, so Backlog cards are ignored | B, with Backlog cards then disclosed under the open-cards rule |
| Q-5 | A routine "recurs Daily, Weekly, Monthly or Yearly", carries a frequency and preferred days | preferred days are the due dates, frequency is a check | frequency is the obligation, preferred days a hint | A, plus a rule for a pattern with no preferred day |
| Q-6 | "Selecting a routine ensures it has exactly one outstanding task" | completed-but-unarchived is not outstanding, so a second selection the same day creates a second card | the card on the board is what is owed, so nothing is created | B — otherwise a second Gym card appears when the editor is reopened at noon |
| ~~Q-7~~ | ~~The day log "becomes immutable history after rollover", while the check-out is idempotent per date~~ | — | — | **Dissolved 2026-10-13** — neither reading survives: a log is written once for the span it settles and never re-run, so immutability is what it is and not a clause (BR-36) |
| Q-8 | "At most one outstanding proposal per target" | target = the entity | target = entity plus the aspect proposed on | B, since one exchange can return two proposals on one goal |
| Q-9 | "One conversation runs for the session" | session = app run | until the user clears it, restarts included | B, which is what "cleared deliberately" says |
| Q-10 | A follow-up goal's horizon "advances to the next period of the same granularity" | next after the original's, which may already be past | first period beginning after the check-out | B |
| Q-11 | An unarchive is refused where "a surrounding it needs" is gone | needed = what an invariant requires: parent, board, column | needed includes the prior position, so a deleted neighbour blocks it | A, and say ordering neighbours are not needed |
| Q-12 | The capture picker reads "the boards that exist" | every board, archived projects' included | live boards only | B |
| ~~Q-13~~ | The two state figures are counted "over the boards the account covers together with the boards the span's focuses chose" | the account is only what moved, so a focused-but-untouched board contributes nothing | a focused board with four Todo cards contributes them as unkept intentions | **B, applied 2026-10-13** — in the rules (BR-35) and now in BP13's narrative too |
