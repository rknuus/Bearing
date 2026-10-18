# Bearing v2 — Blind Review Findings

> **What this is.** One adversarial reviewer per business process, each reading a comment-stripped
> copy of its drawing — no access to the author's reasoning — judging it against
> [`06_Drawing-Rulings.md`](06_Drawing-Rulings.md) and nothing else. All 19 reported. Grouped by
> what is needed, not by process.
>
> Reviewers were not told which rows I had already found violated, so agreement below is
> independent.

## Apply — confirmed, and the ruling's own text decides it

| Ruling | Where | Scale |
|---|---|---|
| DRW-08 | Every one of the 19. Nearly every drawn note in BP04, BP07, BP11, BP12, BP17, BP18 restates Intent, and most restate the rule bound on the same box | ~125 notes across the 19 |
| DRW-20 | BP02, BP03, BP04, BP05, BP11, BP12, BP17 | 7 notes, as already ruled |
| DRW-11 | BP05 (frame/amend), BP12 (rename/insert), BP17 (create/amend), BP18 (create/amend) | 4 collapses, 4 ids retired — **applied for BP05, BP17 and BP18** on 2026-10-14; BP12's rename/insert stands |
| DRW-12 | BP11 (priority into amend), BP05 (link and unlink into amend), BP04 (the two idea editors, as ruled) | 4 further ids retired — **applied for BP05 and BP04** on 2026-10-14; BP11's priority stands |
| DRW-22 | BP05 — unlinking an idea is the goal's optional field cleared | **applied** with the DRW-12 collapse |
| DRW-09 | BP04 returns to `ideationTab`, BP11 to `execution`, BP15 to `archive` — the opening act, not the hub | 3 branches; verified, these are the only three |
| DRW-09 | BP08 makes being current conditional: an optional `Review what was committed?` branch whose only content is re-reading the day just committed. BR-118 says no surface carries a refresh the user has to press | 1 gateway, 1 call site |
| DRW-17 | Applied in BP05: one question with its reaches as answers, no yes/no in front. BP07 left the ruling on 2026-10-17 — its check-out neither discloses nor approves | done |
| DRW-05 | BP10 `messageStart "Draft staged"` names the completed act; all 26 others read "… submitted" or "… requested" | 1 label |
| DRW-02 | BP14 `:Reach the next date;` restates its own `timerStart`; BP16 `:Close the panel;` is the construct the ruling names | 2 steps |
| DRW-10 | BP04 — the note says the filter and ordering survive the session, but no step, request or call site records them | 1 gap |
| DRW-19 | BP04 draws BR-43's focus-selectables consequence two rungs down, with no project-archiving step drawn | 1 step |
| DRW-07 | BP14 `"The day rolled over"`, BP16 `"Conversation cleared"`, BP18 `"What the activity deletion will take"` — the request's own words, no payload | 3 flat cases |

## Ruled (2026-10-11)

| # | What it was | Ruling |
|---|---|---|
| 1 | The advisor's funnel note omits the vision and the mission | Widen the note: the advisor sees them when they are set |
| 2 | A task's three archiving acts looked as if one were undrawn | False positive — day check-out, the card's own menu and clearing a lane are all drawn. Closed |
| 3 | The day check-out's account leaves out the Chores board, while its archive action takes finished chores too | Ruled: the exclusion is gone. The account covers every board a task moved on, Chores among them and no differently (BR-33, BR-34) |
| 4 | A column's role change flips completion across every board the template governs, with no disclosure | Do not warn. The change is easily reverted inside the product, so the user simply does it. The warning text in the drawn note goes with the notes sweep |
| 5 | Clearing the advisor conversation destroys outstanding proposals with no disclosure | Confirm it. The confirmation is business logic, so it is the system's and not the client's: the clear becomes a disclose-then-act pair like every other consequential act |

## Ruled on the six questions (2026-10-11)

| # | Question | Ruling |
|---|---|---|
| 1 | Does a reply label in the request's own words, passive past tense, count as repeating it? | No. The ~35 replies stand, and DRW-07's row records it |
| 2 | Is a filler step significant — `:Reject the deletion;`, `:Leave the tab;`? | Not required by the notation (tested: a branch holding only its jump compiles). Awaiting the ruling |
| 3 | Is a read drawn as several inner steps one technicality or several business acts? | One step per read unless the distinction matters to the business — which is the ruling already recorded in Contract §4.9 for six processes; the other eight were never swept and are now in the apply pass |
| 4 | Does BP06's numeric/boolean dispatch pre-empt Design? | Yes, premature. The gateway is gone: one step appends the dated check-in in the measure's own terms, and the two shapes are permutations Design discovers |
| 5 | BP05's archive branch carries an approve gateway and then a reach selection | Collapsed to one question with its reaches as answers — the check-out ruling (BR-30) applied where the same question is asked directly |
| 6 | BP11's completion gateway asks the user a question while also stating what the answer carried | Split into two: first what the answer said — did this move close an activity's last task — and only then the user's own answer. Where no activity owns the board, the offer was never put |

## Covered — raised by the Software Architect, 2026-10-11

**Marking an activity Done while tasks on its board are still open.** The path was drawn — an
activity's state can be set at any time from the Course page — but the case was not: nothing in the
drawing or in Intent said what becomes of the open cards. Now covered by a new rule and a new call
site: the change discloses the open cards first, and the user answers with one of three — close them
with the activity, set them aside, or leave them open. Leaving them open is legitimate, because the
state is the planner's judgement and not a claim about every card. Where nothing is open the
disclosure is empty, and reopening a Done activity discloses nothing because it takes nothing.

The three answers differ only in what the record says: closing records completions that the day's
figures then count, setting aside archives them as work dropped rather than finished, and leaving
them open leaves live cards under a finished activity.

## Applied 2026-10-12 — the policy sweep

The business policies ([`10_Business-Policies.md`](10_Business-Policies.md)) were derived from Intent
§4 and swept against all nineteen drawings. Eleven findings, nine of them applied in the same pass;
the full list with its reasoning is that page's §3.

| Where | What was wrong | What was done |
|---|---|---|
| BP11 | The completion offer recorded an activity Done with no disclosure of the cards still open, while BP18 draws the pair | The offer discloses, then asks what becomes of the open cards, then records — the shape BP18 already had. It was drawn as `BP11.11` (`BP11.10` stays retired and was not reused) until 2026-10-18, when `BP11.11` was retired too: the open cards are derived from what start-up loaded (D-31), so the disclosure costs no request. The three answers were folded into the close in the same pass — a field of the request, not a drawn sub-flow, in BP11 and BP18 alike |
| BP12 | A drawn note said a Done-to-InProgress role change unwinds completions already counted; BR-60 says a date's completions are the moves that actually happened | The note is gone, and the patterns page's BP12.05 row loses that leg |
| BP09 | The overview note still carried the Chores exclusion your ruling of 2026-10-11 removed from the account | Corrected in the note and in the source's provenance: Chores is never chosen, so it stands in no adherence figure while the account still covers it |
| BP04, BP07, BP10 | The draft discard was drawn on three committing writes and on none of the other twelve | The three steps are gone; the discard is the committing operation's business (G-6) |
| BP01, BP04 | One half of a technicality was drawn: a restore of the remembered interface state and a note asserting the ideation filter survives the session, with nothing writing either | Both are gone (G-7) |
| BP17 | A new column template started from two lanes, which leaves the Todo rule and two of the four check-out figures structurally zero | Four columns, one per role — **BR-108 moves** (Q-3) |
| BP10 | The capture picker read "the boards that exist" with no liveness filter, where BP11 reads live ones | BR-43 bound and the step and its reply renamed (Q-12) |
| BP05 | A drawn note stated a *for-now* decision as a flat fact: a goal having no parent and no children | The note is gone. BP18.07's note was raised with it and holds — what it states is BR-99, an invariant, not BR-120's *for-now* |
| BP11 | A board's lineage read did not say the chain may stop short | The step says *as far as it reaches*, with BR-96 bound beside BR-09 |
| BP12 | Archiving a whole column's worth of tasks discloses nothing | **Owed**: that page's §4 asks it on its own now — does clearing a lane say how many cards it files away? The role-change ruling is not part of it (restated 2026-10-13) |
| BP11 | The hub had no way out: every branch looped back, so the end event *Work moved on* had no incoming flow — found by `bpmn-tools validate` during the apply pass, and pre-existing | *Move to another board* becomes an `elseif` and *nothing more* takes the `else`, the shape the other eight hub processes have |
| — | Three operations archive tasks and differ only in scope | Recorded as a Design finding, not a drawing change |

## Ruled 2026-10-13 — the check-out's span

**A check-out settles everything since the last check-out, however long ago that was — and
everything up to now where there has never been one** (*"Using the date is a poor selection
criterion"*). The date is gone as a selection criterion, and with it the finding that two of the four
figures were stale whenever a date was checked out late (`10_Business-Policies.md` V-14).

| What it settles | How |
|---|---|
| The four figures | All four now describe one span and one moment: the two movement figures count what moved inside the span, the two state figures count the board as it stands at the span's end, which is the moment of check-out. **BR-35 and BR-125 move** |
| The record | One log per check-out, appended and never rewritten — so the day log becomes the **check-out log** and the last rewritten record in [`11_Record-Inventory.md`](11_Record-Inventory.md) joins the appended ones. **BR-33, BR-36 and BR-38 move**, and POL-11 holds over every record but the committed day focus |
| Nothing forfeited | **BR-45** is structural rather than an affordance: there is no date to pick, so a fortnight away is settled by the gesture the user already has. That **dissolves G-3** — no hand-over from BP09 into the check-out is owed |
| The idempotence question | **Dissolved with Q-7.** The sources' 5 pm / 9 pm case is answered the other way: working on after a check-out and checking out again writes a second log, for the evening's span, rather than restating the first |
| Per day, still | Focus adherence stayed per day inside the log, because the focus is committed per day. **Superseded 2026-10-17: the figure is dropped and the log keeps no focus standing at all** (~~BR-123~~) |
| The period views | They read the dated movement record itself rather than aggregating the logs' figures, so a span straddling a period boundary needs no rule and a period's numbers do not depend on when the user checked out. **BR-125 moves** |
| Q-13's remainder | Applied: BP13's narrative now says the two state figures count over the boards the account covers **together with** the boards the span's focuses chose |

Drawings: BP13 rewritten (its account read gains the step that takes the span, its close-out appends
the log), BP09's day-log read and note follow it, BP14 no longer carries a log into history.

## Applied 2026-10-13 — the check-out is not a day's, and a hub names its work

Two sweeps after the span ruling, both in your words.

| What you said | What was done |
|---|---|
| *"Day-notes: are they part of a check-out? Then they are check-out-notes. All single-day BRs are probably wrong now"* | **BR-37 moves**: one running journal kept while the span is open, taken by the check-out, the next span starting empty — not a date's journal from morning to evening. The gesture is the **work check-out** throughout (BR-23, BR-33, BR-34, BR-58, §3's Draft row, §7's surface row), BP13 is retitled *Check out the work done* while keeping its minted id, its trigger reads *Work to settle*, and the journal step's `multiInstance` becomes `loop`. **BR-36 says the rest of it**: when to check out is the user's decision alone, several in one day are legitimate, and a span in which nothing happened is accounted for with empty lists and figures at zero |
| *"The first activity reads 'Work the Themes tab', the gateway 'What needs doing?', and the end node 'Life areas attended to' just don't fit together"* | **DRW-25**: the hub task names the work, not the surface — the surface is the opening act's — and the start, the hub, the gateway's answers and the end all speak of the same thing in the vocabulary's own word. BP02 reads *A theme needs attention* → *Work the themes* → *What needs doing? / add or change a theme* → *Everything done*. Same fix in BP03 (routine, not "recurring practice"), BP04, BP05, BP12 and BP17. The exit itself is **DRW-24**: an end event says the gesture is over and never that the data is now right, so the seven that claimed a state — BP12's *Lanes fit the work* among them — now read `Everything done`, while the ends that name what the gesture did keep their words |

## Ruled 2026-10-13 — a routine has no theme

*"For Routines I don't care about themes, really. So do it"* — the optional affiliation of 2026-10-11 is
withdrawn, and `funnel §Linking rules`, which required one, stays superseded.

| What goes | What it leaves |
|---|---|
| The affiliation itself | **BR-02** says a routine has no theme; `routine.theme_id` leaves §3.1 and `create_routine` leaves the Contract with it |
| Its home | Routines had no home of their own and lived under their life area (BR-10, UX-14). They now have **a Routines view of their own**, so **BR-10's one deliberate exception is gone** and the principle holds with nothing excepted |
| One of three cascades | A theme deletion offers **goals and ideas** (BR-13, BR-21), and the declinable second level for a routine's occurrences goes with it — BP02's hardest gesture loses a level, three notes shrink, and BP02.05/BP02.06 lose their BR-02 and BR-16 bindings |
| Colour and attribution | A chore reaches **no** theme by any path (§3.1), so it carries no colour (BR-09) and routine work never enters the theme balance (BR-47). This is the one real loss, and it is accepted |
| Two counts and a grouping | The Themes view counts **goals only** (BR-95) and no longer reads routines at all (BP02.01); the day focus offers the routines as one list (BR-41, BP08); Ideation keeps **Unthemed** for ideas alone (BR-03) |

**No call site is retired** — every change is subtraction inside operations that already exist, so the
104 ids stand. Drawings touched: BP02, BP03 (its section entry becomes the Routines view, its editor
loses the life-area field), BP08.

## Adversarial review, 2026-10-13 — five passes over the day's rulings

Five blind passes, each on comment-stripped sources or on the registers alone: BP02; BP03 + BP08;
BP13 + BP09 + BP14; the rule set against itself; every downstream register against Intent. Forty-odd
findings, of which these were verified and applied.

**Errors the sweep itself introduced** — the ones that justify the exercise:

| Where | What was wrong | What was done |
|---|---|---|
| Intent §3, Routine row | The *Deletable* cell was blanked with the theme affiliation, so the entity table said a routine cannot be deleted while BR-16, `BP03.06` and `BP03.07` delete it | Restored to **✓ (cascade offered, BR-16)** — the occurrences cascade is the routine's own and was never the theme's |
| Intent §9, the example data | All four routines carried a theme, and the week-coverage figures were computed from them: Health 4/7 and Learning 1/7 had no other source | Themes dropped from the four rows; coverage recut to **Career 3/7, none 4/7**. **This moves the business outcome §9 shows**, not only its wording |
| Intent §2, the shell | Routines got a view of their own with no tab to live in — §2 renders six chevron-connected tabs and none is theirs | A **seventh tab, outside the chevron**: routines are maintenance, not a funnel stage, so they stand beside the flow and downstream of nothing. Overrule it if the home belongs elsewhere |
| Intent §5, BP02 row | Still billed the theme deletion as *three cascades (BR-13)* | Two |
| BP02, BP08 overviews | The BP02 paragraph still described the routines cascade with its second declinable level; BP08's call-site row still grouped routines under Unthemed | Both rewritten; they were the last two "a routine may have a theme" statements in the Business tree |
| Acceptance §walkthrough | Step 1 grouped routines by theme under Unthemed; the cascade criterion required a routine cascade to pass; VS-30 required a `ROUTINES` sub-section in a theme card | All three corrected — and step 2's *Routines board*, a pre-existing error, became the **Chores** board (BR-42, BR-102) |
| Blueprint | `DeleteTheme` still took three booleans; `CheckOutDay(date, …)` still took a date and read one date's movements; the notes draft was `SaveDayLogDraft(date, …)`, idempotent per date | Two booleans; `CheckOut(options)` reading the movements since the last check-out; `SaveCheckOutNotesDraft(notesMd)`, last-write-wins while the span is open |
| BP14's drawn note | *"A date never checked out stays checkable out"* — the affordance BR-45 stopped being, still reaching the stakeholder through both levels and the SVG | Replaced by the span fact, in the note and in the two provenance lines |

**Defects the rulings exposed but did not cause:**

| Where | What was wrong | What was done |
|---|---|---|
| BR-33 / BR-123 / V-3 | The adherence flag was written three ways — *was in that day's focus* (which Chores is, by derivation, BR-50), *whether the focus chose it*, and *excluded from the figure* | One wording at the time; **void since 2026-10-17**, the figure and the standing it read both dropped (~~BR-123~~) |
| BR-107 | Claimed a past date's Chores membership is reconstructible from the log, while a chore captured into the Backlog is a move BR-124 does not record | The claim is narrowed: nothing stores the membership, and a day with no chore movement leaves no trace of it |
| BR-127 | Counted a closure into *the day's* completed figure, which no longer exists | The completed figure of the span covering the move |
| §3, R-4, BR-33 | Said the log holds movement *lists*; BR-35 defines one list and four figures | *The completed list*, in all three |
| BP13 | The appended log dropped the completed list the user had just confirmed, so a log could not explain its own days | The list is appended with the figures |
| BP13 | The two state figures were counted before anything read the span's focuses, so a focused board nobody touched reported zero — `Q-13`'s answer was in the rules and not in the drawing | A step reads the boards the focuses chose, and the count runs over both sets |
| BP09 | Read *the* log for a day, where BR-38 makes it 0..2 | Reads every log whose span covers the date; `BP09.02` keeps its id, its label and reply move, and §6 follows |
| BP14 | The gateway asked *Set the new date's focus now?* — presupposing an offer BR-44 only makes when the focus is empty, so a day focused in advance had no path | Asks whether the focus is empty, with the offer nested on that branch (DRW-06) |
| BP08 | The commit returned a day without Chores while both reads add it — and the commit is the moment the routine task lands there | Settled the other way on 2026-10-17: neither chain carries Chores. Nothing stores that membership, and nothing in this process can act on an unfinished chore, so it is derived where the boards are shown (BP11) |
| BP03 | Ordered routines *within the section*, a grouping that no longer exists; `BR-43` was bound to the list read, which would filter paused routines out of the one view that toggles them | Both corrected |
| BP02, BP03 | Notes carrying the no-undo fact (DRW-20), restating a bound rule or Intent (DRW-08), claiming colour for progress measures BR-09 does not reach, and bounding the deletion's disclosure at *two levels down* against BR-113 | Seven notes cut or trimmed in the two drawings |
| BP02 | The gateway answer *state who I want to become* named the vision only, while the branch and the chain edit both | Names both |
| BP08, BP10 | Three call-site rows disagreed with their drawings on step count | 5, 2 and 3, checked against the exports |
| Intent §6 | *"Take 103 as the scope signal"* two lines under *Count: 104* | 104 |

**Raised and deliberately not applied** — each belongs to a BP's own review or to a ruling:

- **BP08 never read the date's committed selection before the picking steps**, so the editor opened with nothing to drop and the commit replaced a selection the user was never shown (BR-41). **Fixed 2026-10-16**: `BP08.01` reads that date's committed focus with the selectables, and `BP08.03` is retired — the write answers with the focus it committed, so nothing is re-read after it.
- **The approve/reject gateway in front of the cascade choice** (BP02, BP03, and the same shape in BP04, BP05, BP17): two blind readers read it as two decisions for one choice, against DRW-17. The shape is the one ruled on 2026-10-11, so it stands until the Software Architect says otherwise.
- **A day spent entirely on Chores** raised the question of what it should do to the adherence figure. BP09's review answered it on 2026-10-17 by dropping the figure: it counted recorded movements, which say nothing about a task worked on over several days (~~BR-123~~).
- `docs/02_Business/02_System-Interactions/` is a **tracked duplicate** of the live export tree, last written before the sweep and carrying pre-ruling text. It should be deleted or regenerated, not patched — 208 files, so it is the Software Architect's call.
- Pre-existing citation rot: UX-08 and UX-09 cite BR-06 and BR-07, both retired; the Contract's board-strip row cites QB-21, whose second half Intent marks superseded.

## Notation defects — outside the rulings

`multiInstance` means sequential instances in this language. BP08 marks the three day-focus pick
steps with it, which asserts an order BR-41 denies ("nothing forces them to be picked one by one").
BP13's half is **fixed (2026-10-13)**: its journal step was marked `multiInstance` where the drawn
fact — one journal kept while the span is open — is `loop`, and it now reads `loop` (BR-37).

## Noted, not findings

The reports mention sources that "do not parse". That is my blinding step, which truncated step
labels containing an apostrophe; the committed sources are intact. Two reviewers flagged an unrecorded retirement (BP03.03, BP07.02); both are recorded — in the
process overview and in BP19's retired-draft list, neither of which a blind reviewer could see.
BP02's `BP02.10` retirement
reason ("a colour does not draft") sits against BR-121 being bound on the theme editor — the one
place the drawing and Intent's own retirement reason disagree.
