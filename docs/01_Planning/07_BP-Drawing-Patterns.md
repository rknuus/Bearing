# Bearing v2 — Business-Process Drawing Patterns

> **What this is.** The nineteen business processes are not nineteen kinds. This page names the
> patterns they are drawn in, so a pattern is reviewed once and each process is then read as its
> variation of one. The rulings the patterns obey are
> [`06_Drawing-Rulings.md`](06_Drawing-Rulings.md) (`DRW-…`).
>
> **One level down** — the patterns a single *path* is drawn in, each with a canonical building
> block and its own BPMN, and the block list per process:
> [`../02_Business/01_Business-Processes/00_Path-Patterns.md`](../02_Business/01_Business-Processes/00_Path-Patterns.md).
>
> **Status.** Every deviation below is applied as of 2026-10-16, on his instruction to compare the
> processes and fix what is off the expected similarity, with BP01–BP05 as the reliable reference.
> Four rows were applied on his word of 2026-10-14 — `BP04.02 + BP04.10`, `BP05.02 + BP05.03`,
> `BP17.02 + BP17.03`, `BP18.02 + BP18.03` — and the last two collapses, `BP12.02 + BP12.03` and
> `BP11.04 + BP11.06`, with the kind dispatch inside `BP17.02` and the seven no-undo notes DRW-20
> struck, on 2026-10-16. One row is a question and stays one: see the foot of the page.

## The patterns

| # | Pattern | Members | Canonical shape | What a member may vary |
|---|---|---|---|---|
| P1 | Surface request | all 19 | Hub task, one request, one reply naming the payload; nothing is fetched — every record is loaded at start-up, so the chain takes what the surface works on and calculates what has to be derived over it (DRW-14) | Which surface, what the payload carries; three surfaces need nothing computed and send no request at all |
| P2 | Entity maintenance | BP02, BP03, BP04, BP05, BP06, BP11, BP12, BP17, BP18 | One editor per entity serving create and amend (DRW-11), one reorder act, the state acts, then P3 for archiving and deleting, and the seams the surface starts (DRW-29) | Which fields, which state acts (DRW-23), whether it archives as well as deletes (DRW-21), whether a write can be refused |
| P3 | Disclose, then act | 15 instances in BP02, BP03, BP04, BP05, BP06, BP07, BP12, BP15, BP16, BP17, BP18 | Read the impact, one gateway with one choice, act on what was confirmed (DRW-16, DRW-17), cascades defaulted per BR-19 | What the cascade reaches, which parts are legally declinable |
| P4 | Day and period cycle | BP08, BP13, BP14 | A period or a day is taken with what has to be computed over it, one commitment is written, the seam into the neighbouring process is drawn (DRW-02) | Which period, what the commitment records |
| P5 | Batch staging | BP10 | A batch left staged is picked up, tidied and committed as a whole | None — one member, ruled distinct from BP19 |
| P6 | Conversation | BP16 | The exchange is in play, a turn is sent, its answer is taken, and its proposals are applied through P3 or dismissed | None — one member |
| P7 | Single cross-cutting operation | BP14, BP19 | One chain every other process binds to rather than redrawing (DRW-13) | What binds it |
| P8 | Session boundary | BP01, BP20 | Opening: preconditions, then the data folder, then where the launch lands. Closing: one act, one request, nothing settled and nothing asked | Which end of the session it is |

## Deviations found, with a proposed disposition

| Where | Deviation | Proposed | Rests on |
|---|---|---|---|
| BP05.02 + BP05.03 | Framing a goal and amending one are two chains for one editor | Collapse into BP05.02; retire BP05.03 — **Applied**: one *Edit the goal* node, one submit, one request | DRW-11 — creation differs only in placement, which is not business relevant |
| BP18.02 + BP18.03 | Creating an activity and amending one are two chains; state is already its own call site | Collapse into BP18.02; retire BP18.03 — **Applied**: one *Edit the activity* node, and the board is ENSURED rather than created, so the one chain serves both | DRW-11 |
| BP12.02 + BP12.03 | Renaming a column and inserting one are two chains, and the insert draws its placement | Collapse into one column editor; retire BP12.03; placement is not drawn, BP12.04 orders them — **Applied**: one *Edit the column* node, one submit, one request, and the second-Backlog refusal is the one chain's | DRW-11, DRW-12 |
| BP12.05 | Changing a role looks like a third variation of the same amend | Stays its own call site: it can be refused, and a refusal is an outcome the drawing carries — BP01.01, the reference launch, draws its own. *(The second leg — that it unwinds completions already counted — is struck on 2026-10-12: BR-60 says a date's recorded completions are the moves that actually happened, so no history unwinds. The drawn note that claimed it is gone.)* | DRW-12 read against BR-58, BR-59, BR-60 |
| BP11.04 + BP11.06 | Prioritizing a task and amending one are two chains; priority is a field of the task | Collapse into BP11.06; retire BP11.04. Moving (BP11.03) and ranking (BP11.05) stay, being placement rather than fields — **Applied**: one branch, *fix what a task says, or re-triage it*, and the Backlog restriction is the one chain's refusal | DRW-12, DRW-23 |
| BP03.04, BP11.09, BP18.04 | Three state toggles drawn as their own call sites | All three stay | DRW-23 — each state has an owner or a consequence beyond the record |
| BP11.09 and BP18.04 | The same activity-state operation is called from two processes | Not a duplication: one operation reused, recorded in the reuse sidecar | ADR-069 |
| BP17.02 + BP17.03 | Creating a project and amending one are two chains, but the kind is declared at creation and is for life | Collapse into one editor, the kind a creation-only field — **Applied**: one *Edit the project* node; the template and the board are ENSURED rather than created, and BR-97's creation-only kind is held by the write's own verification (BR-128) rather than by a second chain | DRW-11 against BR-97 |
| BP04.02 + BP04.10 | An idea has two editors — its fields, and its notes, where leaving the editor is the commit | Collapse into BP04.02 — **Applied** on his word: the notes are a field of the one editor, the submit is the commit, and BP04.10 is retired with its id never reused | DRW-12 against UX-04 |

## What is still a question, and why

| Where | The question |
|---|---|
| The hub's end event | Seven hub processes end at *Everything done* and four name what the gesture did — *Progress measured* (BP06), *Work moved on* (BP11), *Archive reviewed* (BP15), *Opinion taken or left* (BP16). DRW-24 sanctions both, which is why the asymmetry stands: the four were left on his word of 2026-10-13, and only the seven that claimed a state of the data were changed. One word settles it either way. |
