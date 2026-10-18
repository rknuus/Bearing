# Bearing v2 — Record inventory

> **What this is.** Every place the product keeps a record of something that happened — asked for on
> 2026-10-12, so the lot can be classified together instead of one rule at a time. The trigger was
> `BR-124` leaning on an *operation log* that no rule establishes
> ([`10_Business-Policies.md`](10_Business-Policies.md) §3.2): a record nothing introduces cannot be
> classified, and two of the day's four figures rest on it.
>
> **What counts as a record here.** Something the product writes that says what happened or how
> things stood, as against the plan itself. An entity's own fields are not records — a goal's
> objective is the plan. The archive is listed because it is a retention store, not because it is a
> log.
>
> **What the classification has to settle, per row:** is it appended or rewritten · is it version-
> controlled · how long does it live · what reads it · and does a rule establish it at all. The last
> column is that fifth question, and it is the one with findings in it.

## The records

| # | Record | What it holds | Written by | Appended or rewritten | In version control | Established by |
|---|---|---|---|---|---|---|
| R-1 | **Commit history** | Every change to the plan, one commit each | Every write to the user's data | Appended | It **is** the version control | BR-77, BR-79 |
| R-2 | **Operation log** | Which operation, on which task, when — "for audit" | Every operation | Appended (assumed) | Unstated | **Nothing.** Named once, in passing, by BR-124 |
| R-3 | **Task movement record** | That a task moved into a Done or an InProgress column, and when | A board move | Appended | Unstated | BR-124, which leaves *where* it is kept to the Contract (QC-04: the log, or a per-task field) |
| R-4 | **Check-out log** | One check-out's span: the notes written while it was open, its movement lists and its four figures | The work check-out, and only it | **Appended** — one per check-out, never rewritten (SA 2026-10-13) | Yes (part of the plan's data) | BR-33, BR-36, BR-38, BR-125 |
| R-5 | **Committed day focus** | Which boards, activities and routines one date is committed to | Setting a day's focus | **Replaced** per date by the next commit for it | Yes | BR-40, BR-41; becomes history at rollover (BR-44) |
| R-6 | **Progress check-in history** | One measure's check-ins: dated data points, each in the type it was recorded under, the latest of them being the measure's current value. No type-change entries — a measure has no change history (SA 2026-10-16, over 2026-10-12) | A check-in | Appended | Yes | BR-28, §3 |
| R-7 | **Goal check-out record** | One goal's outcome, per-measure statuses and retro | The goal check-out | Appended (one per goal) | Yes | BR-27; survives archiving (BP15.01) |
| R-8 | **Follow-up back-reference** | The link from a follow-up goal to the check-out it came from | Completing a check-out that carries a follow-up | Appended | Yes | BR-31 |
| R-9 | **Advisor conversation** | One session's exchange with the advisor | Asking, and taking the answer | Appended, then **dropped whole** when cleared | **No** — journaled, deliberately outside | BR-66, §3 (SA 2026-10-06) |
| R-10 | **Proposal lifecycle** | Each suggestion's state: pending → applied / dismissed / superseded | Taking an answer, applying, dismissing, superseding | Rewritten per proposal | No — it lives in R-9 | §3, BR-70 |
| R-11 | **Drafts** | Input with no commit behind it yet, anywhere in the product | Typing into any draftable field | Rewritten, then discarded by the write that commits it | **No** — explicitly excluded | BR-121, BP19 |
| R-12 | **Remembered interface state** | How the product was last left: orderings, what was collapsed, the board last worked on | Unstated — nothing draws the write | Rewritten | **No** — a subdirectory excluded from version control | BR-92 |
| R-13 | **The archive** | Entities retained out of the working view | Archiving | Appended; emptied only by unarchiving or deletion | Yes | BR-26, BR-23 |

## What falls out of listing them together

1. **Two of the thirteen rest on nothing.** R-2 is named once, by a rule about something else, and
   R-3 points at R-2 for its storage. Everything the check-out's account reports beyond the board's current
   state reads one or the other (BR-35, BR-124), and the append-only guarantee
   ([`10_Business-Policies.md`](10_Business-Policies.md) POL-11) is a property of records that have
   no rule. **A rule is owed.** The cheapest shape: R-3 is the business record — *the product records
   that a task moved into a Done or an InProgress column, with the date* — and R-2 stops being cited
   at all, since an audit log is a technicality and the Contract can decide whether R-3 rides it.
2. **Three of them are outside version control, and that is the same decision three times** —
   R-9, R-11, R-12. What they have in common is that none of them is the plan: a conversation, an
   uncommitted keystroke, a collapsed section. That is POL-06, and it is worth stating once as the
   test for the next record somebody adds, rather than per rule.
3. **One is rewritten rather than appended** — R-5, whose replacement is the last commit for a date
   winning (BR-41), so what is rewritten is one date's answer and never another's. R-4 joined the
   appended records on 2026-10-13, when the check-out became *everything since the last check-out*
   and its log stopped being keyed to a date (BR-33, BR-36); `Q-7` is settled with it. POL-11 now
   holds over every record but R-5, and R-5 is a commitment rather than history.
4. **Nothing says how long any of them lives.** No row has a retention rule: a check-out log from two years
   ago, a cleared conversation, an archived idea's tasks. For R-1 and R-13 that is deliberate — git
   keeps everything and the archive is retention. For R-2 it is the open question that matters, since
   an unbounded audit log in a single-user desktop product is the one record that grows without
   anybody ever reading it.
5. **R-12 has no writer anywhere.** The restore was drawn in BP01 until 2026-10-12 and the write never
   was; both halves are now technical (`G-7`). It stays in this list because it is still a record the
   product keeps — the classification just says it is not business.
