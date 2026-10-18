# Bearing v2 — Business Policies

> **What this is.** The governing statements the business rules are consequences of. Intent §4
> holds roughly a hundred rules; fifteen policies explain nearly all of them, and each rule that
> cites a policy here is that policy applied to one entity, one act or one surface.
>
> **Why collected.** Three reasons, in the order they pay off. A policy is read once and every
> rule under it is then read as its instance — the BP03…BP19 reviews read fifteen statements
> instead of a hundred rules. A question with one right answer is answered by the policy rather
> than by a new ruling. And a rule that contradicts its own policy is visible, which is what §3
> below records.
>
> **What they are not.** Not business rules — a policy constrains no entity and no act by itself,
> and nothing is verified against it. The rules are
> [`01_Intent_Gate-Document.md`](01_Intent_Gate-Document.md) §4 (`BR-…`), the surface decisions
> [`05_UX-Directives.md`](05_UX-Directives.md) (`UX-…`), and how a process is drawn
> [`06_Drawing-Rulings.md`](06_Drawing-Rulings.md) (`DRW-…`). A policy never overrules a rule: where
> the two disagree, §3 names it and the Software Architect decides which one moves.
>
> **Status.** Derived 2026-10-12 from Intent §§1–5, the drawing rulings and the open questions.
> Awaiting the Software Architect's confirmation. One row is owed a ruling (§4).

## 1. The policies

| # | Policy | Rests on |
|---|---|---|
| POL-01 | **One user, one machine, one copy.** No sharing, no sync, no second device and no identity, so no concurrency and no collaboration concern exists anywhere in the product. | `arch §1` |
| POL-02 | **The user acts; the product never acts on the plan by itself.** It may compute, flag and offer — never do. Nothing archives, closes, spawns or reschedules itself, and a flag changes nothing it marks. What the policy is about is the plan as it stands; laying out the ground a first launch needs — the data folder, the template files — is not planning and not an act on a plan (SA 2026-10-12). | BR-22, BR-42, BR-44, BR-61, BR-69, BR-91, BR-110 |
| POL-03 | **A consequential act discloses its whole reach before it takes anything**, and where nothing can legally be left behind the only two answers are approve and abandon. | BR-12, BR-19, BR-21, BR-112, BR-113, BR-117, BR-127 |
| POL-04 | **The nearest rule governs.** Where an act reaches another entity, that entity's own rule applies there unchanged and trumps the rule that reached it, and nothing — rule or drawing — restates a reach beyond the next level down. | BR-12, BR-24, DRW-19 |
| POL-05 | **There is no way back inside the product.** Recovery is version control, outside it: no undo, no reset, no in-product restore, and no repair of a folder in place. | BR-20, BR-77, BR-79, BR-80, ~~BR-83~~ |
| POL-06 | **Nothing is history until the gesture completes** — and what the product keeps outside the commit, a draft or how it was last left, is kept outside the history too. | BR-32, BR-37, BR-63, BR-92, BR-121 |
| POL-07 | **The archive is retention, not a weaker tier of live data.** An archived item is frozen, is hidden from no cascade, and comes back whole or not at all. | BR-05, BR-25, BR-26, BR-112, BR-117 |
| POL-08 | **Bearing has no preferences.** Every choice is the operating system's, fixed by a rule, or decided per gesture — nothing is configurable and nothing is remembered as a setting. | BR-19, BR-44, BR-76, BR-78 |
| POL-09 | **One concept, one home, one gesture.** A variation of an act is a permutation of one operation rather than an act of its own, and the user never acts on more than one thing at a time. | BR-10, BR-39, BR-85, UX-04, DRW-11, DRW-12 |
| POL-10 | **A required link is required for life; everywhere else absence is legitimate** — labelled rather than refused, and never silently filled in. | BR-01, BR-03, BR-04, BR-21, BR-84, BR-96, BR-103 |
| POL-11 | **History is append-only.** What happened is added, never rewritten: a progress check-in is a new data point beside its predecessors and not a correction of them, each check-in keeps the type it was recorded under, and a date's completions are the moves into Done that actually happened. No later act — a column's role changed, an archiving, a deletion — alters what an earlier date recorded. A check-out's log is a projection of that appended record, written once for the span it settles and never rewritten (BR-36). | BR-28, BR-33, BR-35, BR-36, BR-45, BR-60, BR-124 |
| POL-12 | **What can be derived is derived; only what could not be derived again is recorded.** A fact whose inputs move on, or that is a human judgement, is written down; everything else is read from the state it describes, and no surface keeps its own copy. | BR-107, BR-118, DRW-10 |
| POL-13 | **The product reports; the user judges.** An inference is a starting point the user may overrule, a flag is quiet, and an account passes no comment on what it accounts for. | BR-29, BR-35, BR-110 |
| POL-14 | **The plan orders and tracks; it never schedules.** Sequence and progress are modelled; time, cost, capacity and float are not — not stored and not derived. | BR-98, BR-99, BR-111, BR-119, BR-120 |
| POL-15 | **A rule marked *for now* is a declared volatility**, and nothing downstream may assume it permanent. | BR-08, BR-10, BR-86, BR-120 |

## 2. What the policies decide

Open questions from [`09_Open-Design-Questions.md`](09_Open-Design-Questions.md) whose answer follows
from a policy, so no new ruling is needed:

| Question | Answer | From |
|---|---|---|
| G-1 Deleting an item out of the archive | The act exists and is owed a drawing: the archive shelters nothing, and the rules already say an archived item may be deleted outright — without the act, parked work can only be destroyed outside the product | POL-07, POL-05 |
| G-2 A deletion reaching a check-out log | The log keeps the names of the boards it accounted for, never references to them | POL-11 |
| G-6 The draft rule's discard half | Discarding the draft is the committing operation's business and is never drawn | POL-06 |
| G-4 The advisor cannot fail | A non-answer is a named outcome with a retry, never silence | POL-02, BR-75 |
| G-7 Nothing writes the remembered interface state | Persisting it is technical: it is outside the history, so no business act records it | POL-06, POL-12 |
| Q-3 What a new column template starts from | Four lanes, one per role — with two, the day's plan and two of the four figures are structurally zero | POL-08, POL-11 |

Two collapses in [`07_BP-Drawing-Patterns.md`](07_BP-Drawing-Patterns.md) marked *needs your word*
are answered the same way by POL-09: a project's kind is a creation-only field of one editor, and an
idea's notes are a permutation of the idea's editor. Both collapse.

## 3. Violations — where a rule or a drawing contradicts its own policy

Swept 2026-10-12: every rule in Intent §4 and all nineteen `.bpd` sources against the fifteen
policies. **Nine of the eleven drawing findings are applied** — the sources, both generated levels,
their SVGs and the SI exports are regenerated, and
[`08_BP-Review-Findings.md`](08_BP-Review-Findings.md) carries the applied list. The rows below keep
their reasoning and say what became of each. Findings already recorded elsewhere are not repeated here — the notes sweep (`DRW-08`),
the seven no-undo notes (`DRW-20`), the create/amend collapses (`DRW-11`, `DRW-12`) and the two
`multiInstance` defects stand as they are in
[`08_BP-Review-Findings.md`](08_BP-Review-Findings.md). What follows is what reading the drawings
against the policies found that reading them against the rulings did not.

### 3.1 The drawings

| # | Policy | Where, and what contradicts it | What it takes |
|---|---|---|---|
| V-1 | POL-03 | **BP11's completion offer sets an activity Done with no disclosure of the cards still open on its board.** BP18 draws the pair — read the impact, then act on the answer — and BP11 jumps straight to recording the state. The cards in the Backlog are not reached by *the last task into Done*, so the disclosure is not vacuous | The same disclose-then-act pair in BP11, or a recorded decision that the board's offer fires only where nothing is open — **Applied**: the offer discloses, asks what becomes of the open cards, then records. The disclosure was a call site (`BP11.11`, minted where `BP11.10` stays retired) until 2026-10-18, when it was retired in turn: the cards still open on that board are derived from what start-up loaded (D-31), so POL-03 is met without asking the system anything. The three answers were folded into the close on the same day: they are what the one request carries, not a sub-flow in front of it (BP18 with it) |
| V-2 | POL-11 | **BP12's role-change note says a Done-to-InProgress change "unwinds completions that were already counted".** BR-60 says the opposite: a date's recorded completions read the moves into Done that actually happened, and moving a lane into or out of Done rewrites no history | The note goes — it is wrong, not merely redundant. [`07_BP-Drawing-Patterns.md`](07_BP-Drawing-Patterns.md) keeps BP12.05 as its own call site partly on this leg, which goes with it; the call site still stands on being refusable — **Applied**: the note is gone, and the patterns page's BP12.05 row loses that leg |
| V-3 | POL-12 | **BP09's overview note still says "The Chores board is absent from history".** The ruling of 2026-10-11 removed that exclusion from the day's account — it covers every board a task moved on, Chores among them and no differently — and BP13 was corrected while BP09 was not | The note goes, or says the thing that is true: Chores is in the account like every other board a task moved on — **Applied** in the note and in the source's provenance, and the adherence figure it also spoke of is void since 2026-10-17 (~~BR-123~~) |
| V-4 | POL-06 | **The draft discard is drawn on three committing writes and on none of the other twelve** — BP04.10, BP07.04 and BP10.06 draw it; every other write that commits a drafted field does not | The three steps go, under §2's answer to G-6 — **Applied**: the three steps are gone |
| V-5 | POL-06 | **One half of a technicality is drawn.** BP01 draws the restore of the remembered interface state, and BP04's note asserts that the filter and the ordering survive the session — while nothing anywhere writes either | Both halves are technical, so BP01's step and BP04's note go (§2, G-7) — **Applied**: BP01's step and BP04's note are gone |
| V-6 | POL-11 | **BP17.02 starts a new column template from "one Backlog and one Done".** With two lanes the day's plan at the task level has no Todo to sit in, and two of the check-out's four figures are structurally zero until the user hand-builds the lanes | Four lanes, one per role (§2, Q-3) — **Applied**, and **BR-108 moves**: a new template starts from four columns, one per role |
| V-7 | POL-07 | **BP10.01 reads "the boards that exist" with no liveness filter**, where BP11.01 reads only the boards of a project that is not archived. An archived project's boards are hidden from the working view, so they cannot be a capture destination | Bind the rule, as BP11.01 does (§2, Q-12) — **Applied**: BR-43 bound, the step and its reply renamed |
| V-8 | POL-15 | **Two drawn notes state a *for-now* decision as a flat fact** — BP05.03's "A goal has no parent and no children" and BP18.07's single dependency type. Both are declared volatilities, and a stakeholder reading a drawing should not be shown one as settled | Both go with the notes sweep; they restate Intent in any case — **Applied for BP05 only.** BP18.07's note was raised with it and holds: what it states is BR-99, an invariant, not BR-120's *for-now* |
| V-9 | POL-03 | **BP12 archives a whole column's worth of tasks with no disclosure of how many.** Every other act that reaches several entities at once discloses first, and unarchiving is one item at a time | **Owed** — it is §4's one question, and nothing else is bundled with it |
| V-10 | POL-10 | **BP11.02 reads the lineage without saying it can be partial.** A task whose project has no parent, or whose routine is theme-less, reaches no theme and carries no colour — absence is legitimate here and the drawing does not say so | One step or a bound rule on the read — **Applied**: the step reads *as far as it reaches*, with BR-96 bound beside BR-09 |
| V-11 | POL-09 | **Three operations archive tasks and differ only in scope** — one card (BP11.07), a column's worth (BP12.06), a date's completions (BP13.03). Not a drawing change: the rules name them as three acts, and whether they resolve to one operation is a Design finding | Recorded here so it is not re-discovered at Design — **Recorded**, no change |
| V-17 | POL-09 | **BP11 had no way out.** Every branch of its hub looped back, so the end event *Work moved on* had no incoming flow at all — every other hub process carries a *nothing more* branch into its end. Found by the validator while the rest of the sweep was being applied, and pre-existing | **Applied**: *move to another board* becomes an `elseif` and *nothing more* takes the `else`, the shape the other eight hub processes have |

### 3.2 The rules — where Intent moves

| # | Policy | The rule, against its own policy | What it takes |
|---|---|---|---|
| V-12 | POL-11 | **BR-28 said two things that cannot both hold after a type change.** Each check-in keeps the type it was recorded under, *and* the measure's status is inferred by reading its current type over those check-ins. A boolean inference over numeric data points is undefined, and the reverse reinterprets history | **Ruled 2026-10-12, then narrowed 2026-10-16**: a check-in keeps the type it was recorded under, so the inference reads the measure's current type over the check-ins recorded under that type, and where it has none yet no status is inferred and the user judges unaided (BR-29). The dated type-change entry the first ruling added is withdrawn, with the gateway that wrote it: a measure has no change history, and that an operation happened is the operation log's business, which holds for every user operation alike and is modelled in no drawing (SA, DRW-27). Applied to BR-28, to R-6, to BP06.01 and BP06.03, and to BP07.01's inference step |
| V-13 | POL-11 | **BR-124 leans on an operation log no rule establishes.** Nothing says it exists, what it keeps, how long, or whether it is part of the version-controlled history — and two of the four day figures and the whole append-only guarantee rest on it | **Inventoried**: all thirteen records the product keeps are now listed and cross-classified in [`11_Record-Inventory.md`](11_Record-Inventory.md), which is where this is settled. Two of the thirteen rest on nothing, and a rule is still owed |
| V-14 | POL-11 | **A late check-out's log carries two figures, not four.** BR-125 and BP09.02 say four; BR-35 says a date checked out later reports its movement figures only, because the board no longer stands as it stood | **Ruled 2026-10-13, and the date goes:** the check-out settles *everything since the last check-out*, and everything up to now where there has never been one. All four figures then describe one span ending at the moment of check-out, so the late case cannot arise and the sentence that was owed is not needed. **BR-33, BR-34, BR-35, BR-36, BR-38, BR-44, BR-45, BR-107, BR-123, BR-125 and BR-126 move**, the record is a *check-out log*, and BP13, BP09 and BP14 follow. It also dissolves `G-3` and `Q-7` |
| V-15 | POL-11 | **Nothing says a check-out log holds names rather than references.** Without it, deleting a project rewrites a historical account and the one statistic that judges the user over time is computed over boards that no longer exist | A rule, per §2's answer to G-2. **Elaborated 2026-10-12**; still owed |
| ~~V-16~~ | POL-02 | ~~A first start-up authors plan content with nothing asked.~~ **Withdrawn 2026-10-12.** Setting up the initial data is not planning, so it is not an act on a plan and POL-02 does not reach it (SA). POL-02 says so in its own row now, so this is not re-raised |

### 3.3 Verified clean

POL-01, POL-13 and POL-14 are violated nowhere. The archive-is-no-shield rule is bound on every
impact read that can reach an archived descendant — thirteen of them — and on none that cannot.
No surface reads an archived item where it is not the subject: the views carry the live ones
(BP04, BP06, BP07, BP11, BP17), the archive is a surface of its own (BP15), and a write handed an
archived item refuses it itself (BR-05, BR-128).

## 4. Owed a ruling

**Does clearing a lane say how many cards it files away?** — *deferred to BP12's own review
(SA 2026-10-13); nothing else waits on it.* One act, one question (restated
2026-10-13 — it was asked before as a question about reversible acts in general, which bundled in the
settled role-change ruling and an unrelated gap in the archive, and was unanswerable as a result).

BP12 offers *clear out a lane*: every card in that column on that board is archived in one gesture,
and nothing is disclosed first. Every other act that reaches several entities at once discloses before
it acts — deleting a theme, archiving a project, closing an activity with cards still open (BR-12,
BR-13, BR-112, BR-127). Clearing a lane of fourteen cards archives fourteen tasks without saying
fourteen, and reversing the gesture does not bring them back: unarchiving is one item at a time
(BR-25) and there is no way back inside the product (POL-05, BR-20).

Either answer is cheap, and each is one sentence:

- **It discloses, like its siblings** — BP12 gains an impact read and a call site, and POL-03 holds
  with no exception.
- **It does not**, because the user is looking at the lane they picked and the cards are on screen —
  then POL-03 gains the qualifier that a disclosure is owed only where the act reaches beyond what the
  user is looking at, and **BR-12 names it**.

Not part of this question: **a column's role change**, settled on 2026-10-11 (*do not warn*) and
unaffected — what it changes is what is derived from the lane's role, plus the two figures a check-out
counts off the board as it stands, and no date's recorded completions (BR-60, BR-124, POL-11).
