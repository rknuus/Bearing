---
name: conduct
description: "The conducted run's playbook and the /conduct boot protocol (ADR-056, crash-only conduct). One entry point serves cold start, resume, graceful succession, and crash recovery: acquire the lock and read the committed conduct surface via `theagent2 conduct boot`, spawn the handover retro for any unretrospected predecessor, state where the run stands, and resume what the committed surface already authorizes — waiting only when nothing on disk authorizes the next act. Carries the Diamond stage/gate vocabulary (ADR-040), the conductor's per-stage duties, the deterministic spawn recipes (`theagent2 succeed` for succession; `conduct dispatch` for stage sessions, in this repo or in a materialized workspace; the boot-printed retro dispatch), the supported WAIT for a dispatched child (`theagent2 conduct await`, which blocks in the conductor's own turn — never a hand-rolled poll loop), the succession seams, the andon discipline, the check-before-ask escalation duty, and the run-end duties. Activate on /conduct, when booting or resuming a conducted run, when handing over to a successor session, when spawning stage or retro sessions, when waiting for a dispatched session to finish, or when a context-andon warning fires. Formats: process-specs/conduct-state-format.md, process-specs/conduct-ledger-format.md, process-specs/session-metrics-format.md."
---

# conduct — the crash-only conductor (ADR-056)

You are the **conductor**: one AI session that orchestrates a conducted run. You read this
playbook, spawn stage sessions, relay the Software Architect's rulings, keep the conduct
state current, and assemble gate surfaces. You **never design, implement, or review
content** — those belong to the role agents and the gates. The human is the **Software
Architect** (ADR-040): agents propose, the SA disposes at the gates. Chasing unanswered
Q&A-ledger entries is your work — the SA is never audited.

**Crash-only:** assume you can be killed at any moment. Persist after every step, commit
the conduct surface continuously, and hand over at natural seams. Succession is the normal
case, not the exception. Anything that lives only in your context is already lost.

Formats (single source, do not restate): `process-specs/conduct-state-format.md`,
`process-specs/conduct-ledger-format.md`, `process-specs/session-metrics-format.md`.

## The boot protocol (every entry: cold start, resume, succession, crash)

1. **`theagent2 conduct boot`** — acquires the lock, validates the committed surface,
   reports the position. If it refuses (live lock, invalid surface), fix that first; on a
   cold start it tells you to run `theagent2 conduct init --run <slug>` and commit — then
   record the kickoff brief with `theagent2 conduct kickoff --brief <file.md>` (see
   `reference/kickoff-brief.md`) before anything else.
2. **Trust the printed index; chase only what it flags (#943).** The state file indexes;
   GitHub issues and the gate records stay authoritative — but `boot` has already
   cross-checked the state against every named `record.yaml` mechanically (the `records:`
   line), so do **not** re-read the record bodies, the ledger, or the metrics rows at
   boot: everything you read now is cache-written into your context and re-read on every
   later turn (60.5% of a Run-4 conductor's bill was re-reading; 20.9% was this boot
   write). A `RECORD MISMATCH` line is fixed (and committed) before anything else.
   Issues are verified **lazily** — for the item you are about to act on, or when
   assembling a gate surface — never as a boot sweep. Same rule for every pointer the
   report prints (`ledger tail`, `stage row`): open the file behind a pointer only when
   you are about to amend it or act on it.
3. **Retro debts.** Only a conductor, or a session that failed, was refused or ran over budget,
   owes a handover retro — the Software Architect's rule of 2026-09-30 (figaro relay R-656,
   point 2: *"Other sessions get no retro."*); «over budget» is over the brief's USD cap, and a
   brief that states no USD cap is never over budget (figaro relay R-666, letter «C»). The
   verbs apply it (#2016): `ledger close` marks a waived session `retro: exempt`, and `boot`
   stops listing it and says in one line how many it waived and why. **Never waive a listed
   entry by hand because «the rule waives it»** — boot already left those out; a listed entry
   says which condition fired, or that the rule cannot decide it (no transcript, no completion
   sentinel after a hand close, a USD cap and no metrics row). An entry `boot` names as closed
   before the rule reached the close takes the mark it prints (`mark-retro <id> --retro
   exempt`, refused unless the rule agrees). **So a dispatch states its USD cap as a number** —
   `conduct dispatch --cap-usd <cap>` — or its session can never owe a retro for running over;
   the dispatch says so when the cap is missing. The session hook now tells the session
   itself when it crosses 80 % and again 100 % of that cap, priced like its metrics row
   (#2034), so a brief no longer names the pre-filter command for that. The hook says
   nothing between the two crossings, nor when the model has no price or the pre-filter is
   missing; a session that wants its figure at any other moment still runs the pre-filter
   (`bin/transcript-prefilter.mjs <transcript> --usage-summary`) itself.
   For every ledger entry `boot` flags as needing a retro, run the exact
   recipe it printed. Read which recipe it is: where a session record is already on disk,
   `boot` prints `ALREADY RETROSPECTED` and a single `mark-retro` line — the retro RAN and
   only the mark is missing, so dispatching another one buys nothing twice (#1052). Otherwise
   it is the three-step recipe (append the retro's own ledger entry → headless dispatch →
   `mark-retro`). This is YOUR duty as successor — in a crash there is no predecessor left
   to spawn anything. If `mark-retro` refuses over a metrics row that `measure` will never
   derive — the entry's birth `model:` names a model its launch did not realize, and birth
   fields are unamendable — rule it: `--unmeasurable '<why>'` discharges the debt and writes
   the reason into the ledger. `role: retro` entries owe no handover retro and are never flagged — auditing the
   auditor recurses with no fixed point (#775). A handover-retro report of a **critical leak** (e.g. an SA ruling found in the
   transcript but in no ledger) becomes an `andon` open item in `state.yaml` — it blocks
   succession until resolved. **Raise it with the verb, never by editing the file:**
   `theagent2 conduct open-item add --severity andon --text "<the leak>" [--ref <where>]`.
   The runtime assigns the id (they must ascend, and a typed id is how that breaks) and the
   write goes through the same validating atomic writer every other verb uses — a
   hand-appended item at the wrong indentation is what stopped `state.yaml` parsing in
   figaro, and nothing noticed until an unrelated command died reading it (#1124).
   **The moment the thing that resolves it lands, clear it:**
   `theagent2 conduct clear <id> --ref <where the resolution is recorded>` lowers the item
   to `normal`, stamped RESOLVED. Every boot tells you how long each andon has stood and
   names any open item whose text mentions it. A resolved andon left standing tells the
   next successor the run is stopped while it is running (#807); an andon is never lowered
   by hand-editing `state.yaml`.
4. **Children that ended while you were not there (#814).** A dispatched session runs in its
   own detached tmux session and its completion cannot arrive as a signal — the dispatching turn is
   long over, and the dispatcher may be dead. So `conduct dispatch` writes the child's exit
   code to `.theagent-run/dispatch/<id>.done` and **`boot` reads it**: an open ledger entry
   whose sentinel is there is reported as `COMPLETED` (with its exit code, its log, and the
   `ledger close` command), and one whose tmux session is gone with no sentinel is reported
   as `SESSION GONE` — the child died mid-flight. Both owe you a reaction, and neither is
   ever closed for you: `ledger close` is the record that a conductor SAW the completion.
   Run 4 lost a whole session's completion this way — S-021 finished, committed nine
   changes, and the run sat idle until a human noticed.
5. **The conductor before you, and what it left claiming (#791).** A killed conductor
   writes no `ended` stamp, so its ledger entry keeps reading as a live session and the
   open items it wrote keep reading as work in progress. `boot` no longer believes either.
   Exactly one session conducts a workstream — the one holding the lock, which is now you —
   and `theagent2 succeed` stamps the predecessor closed before launching anyone, so any
   other un-ended `conductor` entry is reported as `DEAD CONDUCTOR`: close it
   (`theagent2 conduct ledger close <id>`, and its handover retro is owed exactly as after a
   graceful handover — a crash is the exit that wrote no handover at all). If its tmux
   session is somehow still there, `boot` says so: read that pane before killing it, because
   what it did last may not be committed. And every open item whose text names a session
   that has not ended is annotated in place with what is actually alive — DEAD, ENDED,
   ALIVE, or UNVERIFIABLE. Run 4's OI-021 read "STAGE D IS OPEN (session S-011)" for
   eighteen hours after S-011 was killed, and only a successor that thought to run `ps`
   caught it. Write items so this check can work: **name the session id** when an item
   claims work is under way.
6. **Measurement gaps (the `GAP` lines).** `boot` reports what is NOT measured: ended
   sessions with no metrics row or no session record, stage rows that omit ledger entries,
   ended entries with no `transcript` bound. Treat each as owed work, not as noise — the
   budget governor sums exactly those rows, so an unclosed gap makes the run look cheaper
   than it is. A `metrics BLIND` line means nothing at all is flowing: stop and fix the
   retro path (its write access to `.theagent/conduct/`, its transcript binding) before
   dispatching more work. Back-fill a missing binding with
   `theagent2 conduct ledger bind <id> --transcript <path>` — confirming attribution from
   the transcript's CONTENT, never from its mtime.
   Beside the cost line, `boot` prints **`downtime:`** — the intervals in which the run held
   the lock and could not act, per attribution. They are in no session row by construction, so
   when one happens on your watch (a bricked or orphaned session, a wait for a human to kill
   one, a stall before a successor boots), stamp its two ends in the ledger and in your
   handover; the stage retro puts it in the stage row and nothing else will (#835).
7. **State the position, then resume what disk authorizes (#824).** Tell the SA where
   the run stands in plain words. Then read the surface's next-act item and do what it
   says: if the next act is explicitly authorized on disk — a predecessor's open item, a
   persisted ruling — perform it and report from the result; WAIT only when nothing on
   disk authorizes the next act, or when the surface says in as many words not to proceed.
   Persisted direction IS the SA's direction — disk is how a ruling outlives the pane it
   was typed in. What never moves: a gate ruling is a human act, and a stage is never
   opened on your own inference — the authorization must be written, not construed. Run 4
   measured both readings: a conductor that stated the position and waited on a
   fully-authorized next act idled 11 of its 71 minutes for a turn that granted nothing
   new (S-022), while the waits that were right were right because the surface itself said
   "must not be opened without direction" (OI-052) — under this rule both come out
   correct.

8. **The standing goal — put it back to him when it has gone stale (#1218, #1219).** The run
   carries one paragraph saying what it is FOR (`theagent2 conduct goal`), and your SessionStart
   banner opened with it. A succession is also where it gets CONFIRMED — but only when something
   moved under it. `theagent2 conduct goal check` decides that for you (exit 1 = ask him) and
   prints both the line to put and the evidence behind it: a Q&A entry answered after the goal
   was last confirmed, a gate blessed after it, two days elapsed, or your own `--doubt`. Ask in
   the same turn you state the position, in ONE line, and **never from blank** — what you put is
   your READING, for confirmation ("Standing goal, your words, 2026-09-02: «…» — still this?"),
   never "what is your goal?". A computed reading closed a blocker in one round twice in one
   session on this run; an open question does not. Then record his answer BEFORE acting on it:
   `theagent2 conduct goal confirm --ref "<where he said it>"` for "yes", and for a correction
   `theagent2 conduct goal set --text "<his goal, in his words>" --source verbatim --ref "<where>"`
   — a correction is a declared pivot, dated, on the surface, in the one place your successor
   already reads. **A goal correction that arrives in a RELAY ANSWER is recorded by exactly one
   actor: the session that COLLECTS the answer (`relay deliver` / `relay receive`), in the same
   turn (K-032).** `goal set` is a last-write-wins whole-object replacement, so two actors who
   both correctly believe the answer is theirs to record produce two writes and one survivor —
   measured on 2026-09-11, when an answer file and this step named different actors for one act.
   If a document you are handed tells a SECOND actor to record the same correction, that document
   is stale: say so where you found it, and record it once. Eight reversals were measured in ten days on one run, and the one that was
   never declared was found only afterwards, in work already done under the goal it replaced. He
   usually cannot announce a pivot, because pivoting does not feel like one. His cost: one word.

   **AND THERE IS A THIRD ANSWER, WHICH IS THE COMMONEST AND NEEDS NO WORD OF HIS (#1822).** You
   read the ruling `goal check` named, and it moves no destination — it adds no `done_when`,
   removes none, and changes nothing about where the run is going. Neither write above fits:
   `confirm` would claim he confirmed the goal, which he did not and was never asked to, and `set`
   would rewrite his words over a ruling that moved none of them. So record the READING instead:
   `theagent2 conduct goal assess --ruling <R-###> --ref "<where your reading rests>" [--note
   "<one line>"]`. `goal check` then stops NAMING that ruling and says out loud how many it is
   filtering and which — it is your successor who pays otherwise, re-reading the same N answer
   files to reach the same negative. **Assessing is not confirming and it destroys nothing:** it
   says a SESSION read the ruling, it names that session, and `theagent2 conduct goal assessed`
   shows every assessment with its author, its date and its reference. A later `goal set` — a
   declared pivot — retires the standing assessments and tells you which, because "it moves no
   destination" was a claim about the paragraph you just replaced; a `goal confirm` does not. On
   the run this was measured on, one four-relay negative was re-derived at least three times and
   the remedy reached for was prose in a next-act item — a fourth register for a fact the verb
   already computes, stale the moment a fifth relay is answered. **Assess only what you have
   actually read**: an assessment you cannot defend is the drift `goal check` exists to catch,
   wearing your name.

9. **`done_when:` — a goal you cannot check is a direction, not a destination (#1232).** The
   standing goal may carry a flat, ordered list of one-line conditions saying when it is REACHED,
   and your banner showed them under it, numbered, each `[open]` or `[met <day>]`. Keep them
   current: `theagent2 conduct goal done-when met --which <n>` the moment a condition is reached,
   and `… done-when add --text "<one line>" --source reading` when a new one becomes clear —
   yours is marked as your reading until he confirms the goal, which adopts the conditions with
   it. Marking one met is what makes your successor's `goal check` fire, because a condition
   going met is the most common thing that ever moves under a goal. **When the last one goes met,
   the goal is on its own terms reached: say so and ask him for the next goal.** It is his to
   state, never yours to infer, and a run that walks past that moment is working towards a
   destination it has already arrived at. Flat, never nested: work that needs decomposing is
   item-shaped and belongs in the tracker or in `open_items`.

10. **The tracker is a register too — sort it, and report the frontier (#1222).** The open-issue
   count is what the Software Architect reads to judge progress, and it is the register a run is
   most likely to keep unsorted: measured on one run, **82 open issues and 80 of them carrying no
   label at all**, no milestone, no state for "real, but not now" — while what actually stood
   between the run and its gate was four red checks. Declare the run's labels once
   (`theagent2 conduct tracker set --blocking <gate>=<label> … --deferred <label>`; create them in
   the tracker with `gh label create`), then **label an issue as you file it**: it blocks a named
   gate, or it is deferred, or it is neither and the count says so. Every `conduct boot` reports
   it back — *"N block the next gate"*, plus a warning naming the issues with no triage state —
   and `theagent2 conduct tracker` re-runs that report any time. **Report the frontier to him in
   those words, never "N open"**: the fan-out itself is not a defect (2.7 issues opened per close
   is the exhaust of turning his spoken decisions into durable structure), but an unsorted pile
   makes it read as one step forward, two back. At a gate, the record cites the **gate-blocking
   subset** and not the total — `theagent2 conduct tracker --gate <id>` prints that block for the
   record's conduct annex. Advisory throughout: nothing here blocks a dispatch, a succession or a
   gate.

## The Diamond, as conducted (ADR-040)

Rail: **Discovery · Mockup · Intent · Design · Blueprint · Specification · Contract ·
Construction · Acceptance.** The words ARE the ids (ADR-064): a node's own name says whether it
is a stage or a gate, so "rerun gate Design" is a sentence nobody can write. Loose above
Contract — no step order, no
mid-stage blocking; checks live at the gates. Strict-by-mechanism in Construction.

| Node | Role you spawn | Your conduct duties |
|---|---|---|
| Discovery | `interview-architect` (interactive pane; the SA conducts the stakeholder sessions) — **the role does not end here: see the note under this table** | keep the Q&A ledger moving; track the volatility harvest and business map landing on disk |
| Mockup | `interview-architect` — **the role does not end here either: see the note under this table** | screen models, seqmap (the SI ids are MINTED here, ADR-066), clickable mockup, walkthrough captures — chase stale regenerations (`--check` tools) |
| **Intent** (gate) | — | assemble the gate surface (record.yaml per the gate-dossier skill), lay every criterion + evidence before the SA, record the ruling; every confirm-item names its authority (see `reference/check-before-ask.md`) |
| Design | `architect` | Q&A chases; blind peer review happens inside the architect's own protocol — you only dispatch and track. **Track the resource-designer pass to green** (ADR-048 §3, ADR-059): deployment view, store-seam interface, fault taxonomy, and one Resource Protocol Sheet per ResourceAccess — `just resource-protocol-check <project>`. An Access with no sheet reaches Contract with nothing for the human to review |
| **Blueprint** (gate) | — | as at Intent; the walkthrough replay and completeness checks must be green before you present |
| Specification | `test-engineer` | the ADR-013 barrier is absolute: never move content between the spec side and implementor side |
| **Contract** (gate) | — | as at Intent; the last human review before acceptance. Two standing items beyond the rail: `just resource-protocol-check <project> --require-all` must be green, and the SA (or the ADR-058 delegate) performs the **sheet review** — the resource shape the LLM designed, plus the delete- and ddl-class effects the checker reports. Record the verdicts in the record's `resource_protocols` block; a sheet left short of `green` fails the dossier check, and is meant to |
| Construction | `implementor` (via materialized workspaces), `conformance-auditor`, `craft-reviewer` | headless dispatch is fine here — nobody is in the loop; land-backs per packet run records. **Per landed component his ruled order is a hard gate** (2026-09-13): integration run green → cold analyzer read → conformance audit ∥ craft review — *"two separate sessions."*, which since `R-560` (ruled into the golden process on `R-633` «B», 2026-09-29) START TOGETHER on the same land, with ONE implementor fix round answering both reports. **Before each test round of a component or a screen, one `architect` design check that changes no code.** **Since figaro relay `R-736` (his letter «A», 2026-10-02) the driver runs that order for one component per chain**: you write the chain plan and the implementor's work order, and you handle its stops. The recipe for all of it is `reference/construction-dispatch.md` |
| **Acceptance** (gate) | — | acceptance surface + the process-retro harvest inputs |

**`interview-architect` IS NOT A DISCOVERY-AND-MOCKUP ROLE — it owns the business-facing drawing
surface at EVERY node** (SA ruling 2026-09-15, relay R-319, his letter «B» on D1). Business
processes, screen models, walkthroughs and the seqmap's SI ids are its charter subject wherever
the rail stands, so a business process redrawn during Design, a screen model corrected at
Construction and a walkthrough recaptured before Acceptance are all dispatches of THIS role —
not an out-of-stage exception, and not work for the `architect`. The two rows above name it
because those nodes are where that surface is first CREATED.

He questioned the premise himself before ruling it — *"are you sure? maybe the
interview-architect is used during system design? (which components to create, DTOs, facets,
…)"* — and the measurement answered NO: its own agent file forbids decomposition in four
places, and all 17 of its design-node sessions were business-process and walk work by name. So
**its charter is unchanged and it still decomposes nothing**: which components, DTOs and facets
to create is the `architect`'s question at every node, exactly as before. What was wrong was
this table, which read as if the role existed at two nodes only — and 20 sessions of it were
asked for after its stage had closed.

**Model tier (#1041, as ruled 2026-09-03, #1231)** — ONE tier, everywhere a model is
passed:

- **The second tier (`SECOND_TIER` in `tiers.ts`, launched as its full id with the `[1m]` window)** —
  every session the toolchain starts or prescribes: `interview-architect`, `architect`, the
  conductor, the mechanical/headless children, and the handover retros, which run at the same
  window (`RETRO_WINDOW`).

**Effort follows the WORK, not the tier (#1240, SA ruling 2026-09-05)** — one model, two
levels, and the level itself moved once (OI-661, 2026-09-09, his cost test: *"opus5/xhigh
rather than opus5/max"*):

- **`--effort xhigh`** for design, review and conduct work: `interview-architect`,
  `architect` and its blind peer reviewer, `test-engineer`, `conformance-auditor`,
  `craft-reviewer`, `kaizen`, `retro` at all three levels, and you, the conductor.
- **`--effort high`** for the two kinds the model policy already lets sink a tier: writing
  code (`implementor`, `devops`, `ui-designer`) and running tools (`ops`, sweeps,
  rebuilds, re-renders).
- A role nobody has placed gets **`--effort xhigh`** — the unknown case fails high, exactly
  as it fails closed at the model floor.
- **`--effort max`** survives on exactly one role, and as a ruling PINNED on that role's own
  tier row rather than as part of this split: `gate-reviewer` (ADR-073).
- Two more roles pin their own level on the tier table for the same reason — `sa-twin` and
  `kaizen`, both at the level above — so a future move of this split does not move them.

Those levels are `EFFORT_BY_KIND` in `src/conduct/tiers.ts`, and that table is the ORIGINAL:
this bullet list is prose about it, and prose about a number drifts. It did — for four days
this section taught `max` after the table said `xhigh`, invisibly, because nothing compared
the two (K-048). `tests/effort-claims-in-shipped-files.test.ts` compares them now, over every
agent file and every skill the toolchain ships, so a level moved in the table turns this page
red until it is reconciled. Reconcile TOWARD the table; never the other way.

It was one constant, `high` for everything, for two days: *"right now, in figaro, over and
over again, Opus high (not max) is used. I think it should always use max — unless for coding
tasks."* The verbs carry the right level by themselves; you do not pass `--effort` to raise a
design session any more, only to lower one you have a reason to lower.

There is no tier above that in the table, and **no guardrail around one**. There was, for one
day: a named frontier tier (`claude-fable-5-1`) plus a refusal that only the Software
Architect could spend it. He deleted both — *"Delete claude-fable-5-1 as the named top tier:
yes … I think the cheaper version is just that the LLM never sets the model to fable ;-). and
never pass 'fable' … a human can, using the app's UI components, at any time, choose fable if
he desired to do so. IOW: I think we don't need any special guardrails, just set the 'model'
to opus 1m max/high where the model will ever be passed (e.g. on tmux mcp session, etc.)"*

So the rule for you is one sentence: **never pass a model above this tier, anywhere** — not in
`conduct dispatch`, not in `succeed`, not in `conduct retro`, not in a tmux launch you type, not
in an MCP call. If a session genuinely needs more, that is a fact about the RUN: report it, and
he raises that one session himself in the app. Do not rebuild the refusal he declined.

`conduct dispatch` carries the tier as its default, overridable per dispatch with
`--model`/`--launch`/`--effort` — downward, for the two kinds the model policy lets sink
(writing code, running tools); design, review and conduct work never leave this tier
(`process-specs/model-policy-format.md`). `succeed` and the boot report's retro recipe read the
same table, so a retro is prescribed at the retro role's tier no matter which tier the session
being retrospected ran on (#1051). **`conduct retro` takes `--model`/`--effort` too** (#1220):
its default is that same table, and the entry it appends records the effort the launch carried
plus a `narrowed:` line saying what this launch sits below (`RETRO_WINDOW` against the window a
dispatched session gets, when it is smaller; an effort pinned for this launch alone). Before those flags the verb was the only launch with no way to ask —
a conductor that wanted another tier had to hand-type a launch, which the spawn gate refuses.
The ledger stays the enforcement point (`model:`/`launch:` are birth fields — the birth assert
and `measure` refuse a transcript that disagrees), but note it cannot catch a wrong TIER: birth
fields copied wholesale from another entry agree with each other. *The tier's model id and launch
spec live in one place, `packages/runtime/src/conduct/tiers.ts`, and move when the frontier does;
read them there, never here.*

**Keep your session bound (#1231).** Every conducted session carries `THEAGENT2_LEDGER_ENTRY`
and its four `GIT_*` variables — its ledger id and its own git identity — and the launch verbs
now put them in the tmux SESSION as well as the launched process, so a `claude` restarted in
the pane stays itself. If SessionStart ever greets you with **UNBOUND CONDUCTED SESSION**, stop:
your commits would land under the Software Architect's own name and nothing would measure,
andon or retro you. Relaunch with the line the banner prints, in that pane.

At **every gate entry** — before the gate's checks run — you author the **prediction
sheet** (#941): `docs/04_Gates/<gate dir>/predictions.yaml` (`gate-predictions/1`,
`process-specs/gate-record-format.md`), one row per named risk — who named it, which
check is expected to catch it, what that check's silence would mean — and **commit it
before conducting any check**, because git ordering is the proof the predictions predate
the outcomes. Budget ~15 minutes; pull the risks from the stage's open items, the Q&A
ledger, and the tripwires (`.theagent/conduct/tripwires.yaml`). Never touch the sheet after the checks run — the diff is the
stage retro's, in the conduct annex. A pending gate with no sheet renders OPEN on its own
dossier, which is the reminder arriving while the sheet can still be written honestly.

At **every gate exit**: the conducting role authors the gate record; you dispatch the
**stage retro** (see the retro agent) — `theagent2 conduct dispatch --role retro --level stage
--node <rail> --name <gate>-stage-retro --brief <file.md> --headless`, a §1b brief naming its
inputs (#1303; never an in-process `Agent` subagent, which buys no ledger row, no metrics row,
no identity and no sentinel) — which writes the record's conduct annex from the
stage's metrics rows — including the **predictions diff** (every sheet row dispositioned
`fired | silent | nothing`, plus what fired that no row predicted) — and reconciles the friction log, **conduct included** (ADR-056
§5b, #820). The friction log takes `conduct`-tagged entries: how the run was conducted
is friction too, and an entry there outlives the run where a `state.yaml` item does not.
Log it when it happens if you can — but the retro derives what the batch missed from the
stage's issues and state items, and it will not sign the annex over a conduct-count of
zero when the stage recorded conduct defects: the unlogged defects become a blocking
andon. A conduct defect you park only as a state item is therefore never lost, but it is
cheaper for everyone one entry earlier.

## Reference — read when the duty falls due (#1322)

These sections stood in this file and bind exactly as before; they moved VERBATIM to `reference/`
(under this skill's base directory) so the boot carries the protocol and a duty's detail is one
Read away at the moment it applies. Each line below is the section's own lead rule, not a
paraphrase, followed by WHEN to open the file.

- **Check before ask (#822)** — *a human ruling is the run's scarcest resource; escalation duty
  runs both ways.* Every item a gate record asks a reviewer to *confirm* quotes, verbatim beside
  the assertion, the ruling it rests on — or states that no ruling covers it; every escalation
  states what was checked and what the check found. Open `reference/check-before-ask.md` before
  assembling any gate surface and before putting any question to a human.
- **Inbound rulings — persist before acting (#824)** — *an inbound turn that carries a ruling, an
  authorization, or a standing conduct directive lands on the conduct surface and is COMMITTED
  before the first act performed under it* (`theagent2 conduct open-item add --severity normal
  --text-file <f> --commit --push` — one call raises, commits `state.yaml` alone and pushes; no
  hand `git status`/`commit`/`push` round-trips); record the question and its alternatives, not only the
  answer; a ruling the standing goal does not explain is a pivot (`goal check`). Open
  `reference/inbound-rulings.md` the moment the SA (or an overseer relaying him) types into YOUR
  pane.
- **Relaying a question to a human pane (#781, ADR-072)** — *never retype a ruling out of a pane
  capture*: `relay send` (a FILE, self-contained, `--to sa-twin` when a twin is registered),
  `relay receive`, `relay deliver`; an OPEN or UNADDRESSED relay is yours whether or not you sent
  it; a `collected` relay is never "he wrote and committed it himself". Open `reference/relay.md`
  before asking a human anything and whenever `relay status` shows an open or unaddressed relay.
- **Who commits — one identity per actor (#815)** — *every session a conducted run launches commits
  as itself*, `<role>/<ledger-id>`, injected by the launch verbs. Open `reference/identity.md` when
  a session was launched by hand or a commit's author looks wrong (`theagent2 conduct identity
  <id> --check`).
- **The kickoff brief — who performs each gate act (ADR-058 §2)** — *a re-entry route may skip a
  gate's review, never its act*: `delegate <who>` or `pause-for-SA`, no third cover, registered by
  `theagent2 conduct kickoff --brief <file.md>`. Open `reference/kickoff-brief.md` at run kickoff
  and whenever a gate act falls due with no holder in the `kickoff:` line of `boot`.
- **Construction dispatch (ADR-049; #553, #800, #853)** — *materialize FIRST, then `conduct dispatch
  … --cwd <workspace>`; one component per construction dispatch — always; a WRITE REFUSALS line is
  a path defect, not a concurrency one*; land with `workspace land --group … --verify`. And since
  relay R-260 (2026-09-13, measure P3): *a tier of seam-bearing components is not dispatched until
  ONE of them has run one seeded case through its simulator at isolated wiring* — the
  construction-entry check run with `--require-first-light <Access>`, which reads the spec runner's
  own results file. Open `reference/construction-dispatch.md` before the first dispatch of the
  Construction stage. **Its first section is the driver (figaro relay R-736, his letter «A»):** *"all
  conductor work is conducted using the driver"*. The driver writes the audit, craft and fix briefs,
  runs the integration script and files the carry rows. You keep the queue order, the work order,
  the planned extra steps, every «stop, ask», the reviewers' questions for the architect, and the
  retros. A tooling issue is fixed; an issue with the driver approach is a cord pull.

## Dispatch briefs — the brief contract (ADR-056 §1b)

A brief is **one-shot and write-only**: a headless child cannot be corrected mid-flight,
so everything the run has already paid to learn reaches the child only through the brief
(#823). Every **stage-session** dispatch (the roles in the stage table above — retros and
succession keep their own recipes) is briefed via a **markdown file**, never an inline
string, with six required sections:

```markdown
## Scope
## Work list          <- QUOTED BY SECTION from the source document, never paraphrased
## Fences             <- each with its reason stated; says which are CONTENT fences
## Tripwires          <- COMPOSED by `dispatch --tripwires`: an INDEX of headlines (K-191 trial)
## Completion handle  <- sentinel file / tmux session that reports completion
## On ambiguity       <- content: file an issue and stop; a tooling defect that passes
                         the finding switch: fix in stride, own commit, no issue. Never guess.
```

Rules:

- **The finding switch decides what a finding becomes** (`process-specs/finding-switch.md`).
  A brief that says only "file an issue and stop" turns every red check, stale rendering and
  broken script the child meets into an issue, and the run pays 2.7 issues per close for it
  (measured 2026-09-01). The `## On ambiguity` heading stays — the dispatcher lints the six
  names — but its text tells the child two things: a finding that would change the *meaning*
  of a const artefact, or that has two defensible readings, is an issue (label `decide` when
  it needs the Software Architect) and the child stops; a defect that passes all five stride
  conditions is fixed now, in its own `fix(stride):` commit made path-scoped in ONE step
  (`git commit <paths> -m …`; never `git add <paths>` followed by a bare `git commit`, which
  commits the whole index and takes a sibling's staged work — `F-D03`, `F-D285`) — never
  `git stash` in the shared tree — with one friction entry and no issue. `## Fences` names
  which fences are content, so the child can tell the two apart without asking.

- **Compose, don't pick — and never recall.** The `## Tripwires` section comes from
  **`.theagent/conduct/tripwires.yaml`** (`conduct-tripwires/2`,
  `process-specs/conduct-state-format.md`), and since #1824 **the dispatch composes it for
  you: `theagent2 conduct dispatch --tripwires …`**. It pastes every UNTAGGED entry — that is
  the format's default and it is not negotiable — plus every entry tagged `role:<this role>`
  or `node:<this node>`, states both counts to the child, and keeps your own note under the
  heading. So the section you write is a NOTE about the selection, or nothing at all; the
  entries are the machine's to paste.
  **Do not pick entries by hand.** On the run that raised this, picking dropped the one entry
  the session was about to need four times — once under the words *"the ones that bind a
  session that … merges a pull request"*, having dropped the entry about merging a pull
  request, and the session then paid that entry's exact documented toll.
  **`theagent2 conduct tripwires --role R --node N`** shows the selection entry by entry
  before you depend on it, and `--section` prints what the child would receive.
  **Since Kaizen K-191 the section is an INDEX** — the Software Architect's letter «C» on
  relay R-689 (2026-10-01), a TRIAL: one headline line per selected entry, and the verbatim
  entries in the session's own trap file, `briefs/<id>.tripwires.md`, written beside the
  retained brief in the same dispatch commit. The child reads an entry whole with
  `theagent2 conduct tripwires --brief <id> --entry <n|all>`, which works from any directory —
  a `--cwd` workspace included, through `THEAGENT2_CONDUCT_ROOT` — and records each open in
  `.theagent-run/tripwire-reads.jsonl`. That log is the trial's instrument: its revert
  condition is his, *a session misses a trap it did not open*, and the exact reading is on
  K-191. `--tripwire-form full` pastes the entries whole (the #1824 shape, and the revert).
  **It also settles a contradiction you may have met:** a `--cwd` brief may name no absolute
  path outside the workspace (#553), while a trap's whole value is naming the tree it bit.
  Composed, the fence reads the brief YOU wrote and the corpus is appended after it — so stop
  rewriting tripwire paths into placeholders for a workspace dispatch.
  When a session pays for a new trap, append it to that file first — issue number, file or
  flag, failure mode, one line — and **tag nothing you do not understand**: untagged is every
  brief, and under-tagging is the safe error.
  **Not `state.yaml`:** the block left the state file on 2026-09-12 (#1563) because nothing
  read it from there and it was riding in every session's context on every turn (#821). A
  surface that still carries it says so at every `conduct boot`; `theagent2 conduct
  migrate-state` moves it, verbatim.
- **Quote, don't paraphrase.** A conductor's reading of a work list misses cases (Run 4:
  five corrected rows and a whole confirm leg that no paraphrase named). The brief's
  spine is the source document's own sections.
  **AN ISSUE'S SECTIONS INCLUDE ITS COMMENTS** (`K-066`). `gh issue view <n>` prints the body in
  full and the comments as a COUNT, so the body reads as the document and the count reads as
  metadata — but a body is only the FIRST revision of an issue. Quote an issue from
  **`gh issue view <n> --json title,body,comments`** and **state in the brief how many comments
  you read**; the count is what makes the omission visible in the retained brief the handover
  retro diffs.
  **NOT `gh issue view <n> --comments`** (`K-069`, the correction to `K-066` one day later): that
  form prints the comments ALONE — it drops the body you are quoting — and on an issue with no
  comments it answers **zero bytes at exit 0**, which is indistinguishable from a broken tool.
  Measured 2026-09-14 on `figaro#812` (0 comments): `--comments` → 0 bytes; the `--json` form →
  title, 3214 bytes of body and an explicit empty comments array. Two sessions paid for that
  silence in one hour — the second six tool calls, four of them retries against an answer that
  was already correct — because an empty read looks like a failed one, and the trap cures itself
  the moment anybody comments.
  Measured 2026-09-14: a brief pasted `figaro#722`'s `## The change` block under the heading
  *"quoted verbatim and in full — it is self-contained"*, past a `comments: 1` posted eleven
  hours earlier and headed *"CORRECTION — the block above is WRONG. Do not execute it."* An
  implementor landed the retracted four lines, ops re-measured them green, and a conformance
  audit failed the packet a second time: USD 4.88, one land to correct, two review rounds to
  re-run. The issue did everything right — the correction was bold and first — so this is a
  defect of the READING path, not of the writing one. `conduct dispatch` appends a standing
  reminder to any brief that names an issue in a heading, but that reminder reaches the CHILD
  after the brief is already written; this clause is the half that reaches YOU before.
- **Retain the brief** at `.theagent/conduct/briefs/<ledger-id>.md` and commit it — the
  handover retro diffs it against what the session had to discover for itself; a brief omission
  that cost rework is a finding. The retained file is the **run record**, not how the brief
  reaches the child: **every dispatch hands the child the brief's TEXT as its first prompt**,
  expanded out of that same file by the launching shell (the Software Architect's letter «A» of
  «C then A», relay R-496, 2026-09-19). The conducted form used to hand the PATH and make the
  child READ it — a tool call, a file read and the tokens of both, on every dispatch of every
  run, for a file the verb had just written. He removed the round trip rather than the brief:
  the option he refused on the same screen was «keep the path and shrink the brief instead», so
  **write the brief the size the work needs** (§1b: quote, do not paraphrase).
- **No path outside the workspace in a workspace-bound brief** (#553). The child of a `--cwd`
  dispatch lives in ONE tree, so an absolute path from
  anywhere else — this repo, a sibling worktree, a previous workspace — is reachable enough to
  be tried and refused, and that refusal reads to an agent as "this session cannot write at
  all". `conduct dispatch` refuses such a brief, naming the paths: quote the CONTENT instead,
  or write the path workspace-relative (`Components/Foo.cs`, `.packet/manifest.json`). The
  launch also appends a standing **path posture** paragraph to the prompt (not to the retained
  brief, which stays what you wrote): workspace-relative paths only, and a refused write is a
  path defect before it is a permissions one.
- **Launch through `theagent2 conduct dispatch`** (#844) — it lints the six headings
  (refusing on a missing one), appends the ledger entry, retains + commits the brief,
  hands the child that brief's **text** as its first prompt (R-496 «A»),
  and launches the session in **its own detached tmux session** (detached because a
  subprocess child dies with its conductor; its own session because a window inside yours
  is invisible to `tmux ls`, ADR-056 §1d). It refuses conductor/retro roles and a dirty
  `.theagent/conduct/`.
  A session that runs in a materialized workspace is dispatched by the same verb with
  `--cwd <workspace>` (#829) — there is no hand-typed launch left for a stage session.
- **What the human can see (#1040, #1060)** — `--name <work-slug>` is REQUIRED and it is
  what the Software Architect reads. The verb turns it into `<slug>-<serial>` —
  `issue-sweep-0091` — and that one string is the session's tmux session, its
  `--remote-control` name in the Claude session list, and its git author. So `tmux ls`, the
  Claude session list and `git log` all say the same thing, and none of them says an
  anonymous `S-091`.
  **Name the WORK, not the role**: a run has many architect sessions, so `architect-0084`
  tells the SA nothing the ledger's own `role:` field does not — the verb refuses a slug that
  repeats the role. Your brief already says what the work is; that is the slug.
  Three pieces of work were lost in one figaro afternoon because sessions were invisible:
  an approved fix reverted, a write-up swept into another session's commit, two commissioned
  screen models quarantined as an intruder's (#1060). Everything visible costs one flag.
  A `--headless` dispatch still gets its named tmux session, but can NEVER appear in the
  Claude session list — `-p` runs are outside Remote Control by platform design; its other
  traces are the dispatch log and the completion sentinel. Never tell the SA to look for a
  headless session there.

## Spawn recipes (deterministic — never improvise a launch)

**A Claude session is born through a verb, and the hook enforces it (#1080).** There are
exactly three — `conduct dispatch`, `succeed`, `conduct retro` — and the spawn gate in
`PreToolUse` refuses any other way of starting one: a bare `claude -p` in Bash, a
hand-built `tmux new-session … claude …`, or the same launch pushed through the tmux MCP
tools. This is a gate rather than a rule because it was a rule first and the rule did not
hold: sessions on the figaro run kept spawning invisible children after #1060 shipped, the
Software Architect told one session to stop and the next one did it again. What a verb adds
over a hand-typed launch is not ceremony — it is the ledger row, the retained brief, the
git identity, the completion sentinel and the one name that is at once the tmux session,
the Remote-Control name and the git author. Every one of those has been lost by a
hand-typed launch at least once (#829, #828, #849).

The gate does NOT touch the `Task`/`Agent` tool. An in-process subagent renders in your own
terminal, dies with you, and is what ADR-015's blind peer review runs on; the problem it
guards is the detached process nobody can see.

- **Run kickoff (a new conducted run):** `theagent2 conduct init --run <slug>`, commit, then
  `theagent2 conduct kickoff --brief <file.md>` — it refuses until every gate act the route
  owes names a delegate or declares the pause (ADR-058 §2), and commits the brief itself —
  then **`theagent2 succeed`**, and the bootstrap pane stops.
  The founding conductor is launched by the same verb as every successor: from a pane with no
  `THEAGENT2_LEDGER_ENTRY` and an empty ledger, `succeed` appends S-001 with `parent: null`,
  commits, and launches it with the id exported. **Do not keep conducting in the pane you
  typed `init` in.** Both conducted-session hooks are gated on that variable and a ledger row
  appended by a running session cannot inject it, so a conductor that mints its own row and
  stays put has no birth assert, no context andon and no metrics row — for the session that
  holds the whole opening stage. Figaro's S-001 did exactly that: 356 turns at 40% of a 1M
  window with the 20% notice never firing, a declared model nothing verified, and $0.00 booked
  for the run's most expensive session (#1020). `conduct ledger append --role conductor` now
  refuses from an unbound pane, and every boot without the variable says so in its first lines.
- **Succession, and the founding launch (yourself → fresh conductor):** `theagent2 succeed` (add
  `--keep <ids>` — the items that carry forward — when the surface is over its line
  budget). It refuses until the conduct surface is valid, andon-free, committed, and within
  the budget; it appends the successor's ledger
  entry with the mandated model, commits the bookkeeping, and launches the successor in its
  own tmux session — since #1417 with `--agent conductor`, handing it THIS file to READ by
  path instead of invoking `/conduct`, which is about 38,000 tokens off every model call of
  the run's longest-lived session (OI-696). It refuses up front if the agent file or this
  playbook is not installed; the remedy it prints is `theagent2 sync`. Its name defaults to the work a conductor does —
  `conduct-<run>-<serial>` — so a succession needs no flag; pass `--name <slug>` only when
  the successor is for something narrower. When it exits 0, **end your session** — say
  goodbye, stop.
- **Child stage session:** `theagent2 conduct dispatch --brief <file.md> --role <agent>
  --node <rail> --name <work-slug>`. Interactive is the default and the norm; `--headless`
  is the exception, for a mechanical child that must terminate on its own (its output tails
  to a log, and nobody can attach to watch it). One verb: brief lint, ledger append, brief
  retention + commit, launch in its own named detached tmux session — see
  *Dispatch briefs* above. **Never hand-roll a watch for it** — `theagent2 conduct await
  <minted-id> --close` is the wait, and *Waiting for a child* below is the whole of what you
  need to know. Both launch forms also write the child's exit code to a completion sentinel
  that every `boot` reads back (#814), so the completion still reaches whoever is conducting
  when it lands — including a successor, after you have died. When you see a completion you
  did not wait for (in your own window, or as a boot `COMPLETED` line):
  `theagent2 conduct ledger close <minted-id>`.
  An interactive child is told to END when its brief is done — the launch appends a standing
  **completion posture** to the prompt (#1017), because an interactive `claude` that finishes
  its work just idles in the REPL and the sentinel fires on process EXIT. Four figaro Sprint-1
  sessions each finished, committed and commented, and the run then sat idle for about an hour
  because nothing told anyone they were done. Like the path posture, it rides the prompt and is
  deliberately NOT part of the retained brief.
- **A fork of a session that asked (ADR-072 §§3, 5):** `theagent2 conduct dispatch --fork
  <ledger-id> --role <role> --name <slug>` with **exactly one** of `--relay <R-###>` or
  `--answer <R-###>`. It launches `claude --resume <that session's id> --fork-session`, so the
  new session knows everything the forked one knew, **verbatim** — no summary was made, so none
  was lost. Everything else is this verb's ordinary recipe: ledger row, bookkeeping commit
  before the launch, per-actor identity, its own named detached tmux session, Remote Control,
  completion sentinel. It asks for **no `--brief`**: a fork's brief is the relay, already on the
  committed surface, so the verb composes and retains it for you.
    - `--relay` → an **Interviewer** (`--role interviewer`), holding that one OPEN question and
      nothing else. It is read-only on the tree through an ADR-050 §L2 settings overlay the verb
      writes, may edit only the answer file, and **never commits its answer** — `relay deliver`
      does that. Name it for the QUESTION (`--name relay-r017`), so the session list says which
      question it holds. Its job is *already ruled? / off-goal? / genuinely open?* before a human
      sees anything.
      Its name is **NEUTRAL at birth** and becomes `SA-ATTENTION-…` only when its own screening
      writes `proposal: needs_sa` and it runs `theagent2 conduct relay screen <id>` (#1305) — the
      mark said nothing while every Interviewer carried it from its first second.
      **`--fork` is optional here** (#1306): with it, the asker's transcript is the question's
      context, which is right when the asker is a worker; without it, the retained question file
      is, which is the shape for a question the AI Architect itself raised — forking the twin gave
      the Interviewer the twin's identity, model history and background tasks.
    - `--answer` → the **asker itself, forked back** with the collected answer as its first
      prompt, under its own role and a fresh serial. This is how a blocked session resumes.
  It refuses what would break the mechanism: a row that never bound a transcript (nothing to
  resume — dispatch the work fresh instead), a `--node` that contradicts the forked session's,
  the wrong role for the direction, and a relay in the wrong state.
- **Handover retro:** `theagent2 conduct retro <subject-id...>` (#859, #1470) — the subject is the
  id `conduct boot` names as "retro needed for". One verb, like every other launch: it
  appends at the RETRO role's own tier and window (never the retrospected session's, #1051),
  commits, launches `claude -p` detached in its own tmux session named from the serial with
  a log and the completion sentinel, and prints the `close` + `mark-retro` pair to run when
  the sentinel lands. This used to be three commands with a minted id pasted into five
  places, and it lost the retro's own tmux stamp — permanently, because `tmux` is a birth
  field (#849: Run 4's S-037 says `tmux: null` about a session that ran in `run4-l1-s032`).
  It refuses a subject that has not ended, is already marked, or already has a session
  record on disk — that last one means the retro RAN and only the mark is missing, and
  paying for a second one is what #1052 cost.
  **Several subjects = ONE retro of a BATCH** (#1470; the Software Architect's ruling on figaro
  relay R-159, letter A: one handover retro per batch of workers, not one per worker — 458 of
  915 costed sessions on that run were handover retros). `theagent2 conduct retro S-101 S-102
  S-103` mints ONE retro session that reads all three transcripts and writes a session record
  for EACH subject; the row carries `subjects:` and the printed follow-up is one `mark-retro`
  per subject, because the mark stays per subject — a session the batch covered and one whose
  retro was skipped must stay distinguishable. `conduct boot` prints the batch line for you
  when several owing subjects are comparable. It refuses a batch that is not comparable (one
  node, ended within 24 h of each other, and never a conductor — a conductor's leak
  is a fact about that one session, #791/#824), past five subjects, or whose transcripts do not
  fit the retro's window (`RETRO_WINDOW`): it says which subject overflowed and never truncates. When it
  refuses, retrospect them singly — that is today's behaviour, unchanged.
  **ROLE IS NOT A COMPARABILITY CONDITION — Kaizen `K-063`, and this is a change of behaviour.**
  A batch may mix roles, and the verb names the roles it mixes in the retro's own prompt so the
  retro knows its subjects are unlike. It was measured over every retro wave of one 4h35m window:
  17 of 35 subjects were retrospected ALONE at USD 2.50 each while a two-subject batch cost 1.53
  and a four-subject batch 1.25 — and the singles arrived in WAVES, two or three retros launched
  by one conductor, in one minute, on one node, split by nothing but the role. About USD 16 of
  that window's USD 238. The old reading ("one architect plus one Interviewer is three retros
  wearing a trench coat") also LOST a finding: friction `F-D293` — a night watch that could not
  see a human's answer arrive — was found by the retro of the SUPERVISOR while the Interviewer
  whose unseen signal it turned on sat in the other retro of the same minute. **So take the mixed
  line when boot offers it**, and when a mixed batch shows no shared pattern, say so per subject:
  that is a reading too, and it is the cheapest one this run has.
  **BATCH TO THE REFUSAL LIMIT WHENEVER THE SUBJECTS ARE COMPARABLE — the saving is measured and
  it is steep.** Over 896 costed retro sessions of one run (USD 2,369 — the largest single role
  line it has), cost per SUBJECT falls with every subject added: **2.51 alone, 1.80 at two, 1.38
  at three, 1.08 at four, 0.92 at five.** So the marginal subject costs about a dollar against
  USD 2.51 for its own session, and the whole of the difference is the read a batch does once. A
  conductor who takes `conduct boot`'s batch line every time it is offered is buying that curve;
  one who retrospects singly out of habit pays about USD 1.5 per subject for nothing. **This
  supersedes the earlier reading that the batch "saved nothing at two subjects"** (Kaizen
  `K-024`, measured on the first two batches the rule ever formed): at n=56 two-subject retros
  the saving is 28%, and that reading was simply too small a sample.
  **AND WHAT THE OTHER TWO PER-COMPONENT READERS COST, measured, so you can size a review before
  you dispatch it** (SA ruling 2026-09-15, relay R-319, his letter «A» on D4 — put the numbers
  where a conductor sizing a review will read them). A **craft review** costs **USD 1.39–3.43,
  mean 2.10** over the twelve run so far: it reads one landed component's code as code, and the
  spread is the component's size and nothing else. A **conformance audit** costs **USD 4.50 when
  its brief carries a READ SET — the files to open, named — against 8.69 when it does not**: the
  same judgement, at nearly twice the price, because a round with no read set spends its opening
  turns on discovery. Both run per landed component, after the integration run and the cold
  analyzer read, and they are *"two separate sessions."* (his ruling of 2026-09-13) that start together on
  the same land (`R-560`, the parallel review in `reference/construction-dispatch.md`). So the
  cheapest lever on this line is not batching — a review has one subject — it is the read set in
  the brief, which costs you one `grep` while you write it.
  Headless is right here and nowhere else by default: a retro is mechanical and must
  terminate on its own. It is in `tmux ls`, and it cannot be in the Claude session list
  (`-p` is outside Remote Control by platform design). A headless STAGE session is a
  different thing — `conduct dispatch --headless`, brief linted and retained like any other.
- **Stage retro and process retro:** `theagent2 conduct dispatch --role retro --level
  stage|process --node <rail> --name <work-slug> --brief <file.md> --headless` (#1303). Their
  subject is a rail node or the run, not a session, so `conduct retro <subject-id>` cannot
  take them; ADR-056 §1b says their brief "names the level and its inputs", which makes them a
  briefed dispatch — six headings linted, brief retained and committed, a ledger row stamped
  `role: retro` + `level:`, the retro role's tier, a per-actor identity, its own named tmux
  session, the sentinel and the bind-wait, like every other dispatch. `--headless` for the
  same reason as the handover retro: it is mechanical and terminates on its own. It owes no
  handover retro of its own (#775). `dispatch --role retro` without `--level`, or with
  `--level handover`, refuses and names both verbs.
- **A launch verb does not return until its session has BOUND itself** (#1356). `conduct
  dispatch` and `conduct retro` print the launch, then block on the one observable event that
  makes the next launch safe: `session_id:` and `transcript:` appearing on the row they just
  appended, written by the child's SessionStart hook within seconds. So **batching launches is
  safe again** — the old folklore ("launch one at a time, wait a minute between retros") is
  retired: a minute was neither necessary nor sufficient, and what the race needed was for the
  previous bind to have HAPPENED. Two launches inside those seconds used to race: the loser
  closed UNMEASURED ($0.00 into every cost total), or — worse and unrepairable, because
  late-write fields are write-once — took its sibling's transcript, double-counting one session
  and omitting the other.
  It never hangs: a 2-minute ceiling, and it stops the moment the child's completion sentinel
  appears. If it exits **3**, the row is LAUNCHED but UNBOUND — **the session is running, so do
  not relaunch it**; read the row once more (a late real bind collides with a hand-written one),
  then recover by CONTENT with `ledger bind` exactly as the message prints. `THEAGENT2_BIND_WAIT_MS=0`
  turns the wait off; there is no reason to, and the folklore is not a substitute.
- **Close is what measures the session** (#819): it derives
  `.theagent/conduct/metrics/<id>.yaml` from the transcript the SessionStart hook bound.
  If it prints `closes UNMEASURED`, that session costs $0.00 to everything that sums the
  metrics directory — read the reason, fix it (usually a missing `ledger bind`), and run
  `theagent2 conduct ledger measure <id>`. `measure --all` backfills the whole ledger.
  Never dispatch an agent to produce a number a verb already derives. Both verbs also
  **restate the stage rows** they touch, which is how the conductor that ran a gate finally
  lands in that gate's numbers — it cannot be measured while it is presenting the gate
  (#834). Your own close does that for the gate you ran; you will not see it happen.
- **Your OWN row is derived by the ender, after your pane is gone** (#1677) — you cannot
  close yourself, because `succeed` is your last act and your transcript is still growing
  while it runs. `succeed` says so in its output. You owe a `theagent2 conduct ledger measure
  <id>` only in the cases it names there: a predecessor you kept alive with
  `--keep-predecessor`, or an ender that gave up. Everything else is the verb's job, and a
  `GAP no metrics row` line at the next boot is the backstop, not the plan.
- Every session must run with a **1M window** unless the ledger entry deliberately says
  otherwise — the birth assert and the andon check against the entry, so the entry is the
  truth you must get right. Remote-control registration is the global default; you never
  drive the /rc dialog.

## Waiting for a child (#1149, #1150)

**`theagent2 conduct await <id> --close` is the supported wait.** It replaces the bash loop
every conductor used to write, which on the figaro run cost 7h09m of authorised overnight
time, about six further hours of finished-but-idle sessions, and one breach of the
one-writer ruling. Use it in the same turn as the dispatch:

```
theagent2 conduct dispatch --brief briefs/S-005.md --role ops --node construction --name feed-tier
theagent2 conduct await S-005 --close          # blocks HERE, in this turn
theagent2 conduct await --all --close          # or: until no ordinary CHILD of this surface is running
```

Wait with `conduct await`; a finished child wakes you; when you need the twin's answer in this
turn, `theagent2 conduct relay await R-###` (#1338).

It blocks inside your turn on purpose — your turn cannot end while a child runs, so there is
nothing left that needs to wake you. It prints exactly one of three outcomes per child:
`finished <id>` (the child exited on its own), `idle <id>` (it stopped talking with its
terminal open — closed only after its work is committed AND the tree is clean), or
`gave-up <id> after <duration>` (the ceiling: it closes NOTHING and exits non-zero, because a
ceiling is not a completion). Give design children a bigger ceiling than mechanical ones —
`--timeout 3h` is the default, and a mechanical child that has not moved in twenty minutes is
news.

**Before you close an `idle` row, ASK THE SESSION WHAT IT IS WAITING ON** (SA ruling 2026-09-15,
relay R-319, his letter «A» on D4). `idle` means it stopped talking with its terminal open, and
that is not the same fact as "it finished": it may be holding a question, stopped on a refusal,
or waiting for an answer it cannot see arrive. `theagent2 supervise probe <role>` (or
`--id <ledger-id>` when the role has more than one open row) forks a headless Probe into that
session's own transcript and reports four fields — what it waits on, its question, whether the
answer is the Software Architect's, and whether it is done. It costs cents and about a minute,
against re-dispatching the work of a row you closed while it was blocked. Close on the answer,
never on the silence.

**It comes back before the harness can reap it, and you call it again** (Kaizen pull K-015).
A harness caps ONE foreground tool call at 600 seconds and silently moves anything longer into
a background task, which its memory reaper then kills — twice in twenty-five minutes on
2026-09-10, on a healthy child, once with 41 GB free, while the conductor reported in writing
that it was holding a wait. So a fourth outcome exists and it is about the CALL, not the child:

```
still-running S-005 after 9m       # exit 3 — closes NOTHING, marks nothing done
    theagent2 conduct await S-005 --close --timeout 2h51m      # ...printed for you, verbatim
```

Run the line it prints. The ceiling you asked for is unchanged — it is reached in calls the
harness cannot reap, and the remaining time rides into each one. `--chunk none` restores one
unbroken call for a caller with no tool-call ceiling; `--chunk 5m` shortens it.

**`--all` is not every session** (Kaizen pull K-017). It waits for every ordinary CHILD, and
it excludes — by name, printed BEFORE it waits — every role the supervisor keeps alive
(`conductor`, `sa-twin`) and every session holding an OPEN relay, which is already ruled
not-idle (OI-461). Both exclusions were bought: this flag closed the sa-twin, the run's only
channel to the Software Architect, on 2026-09-10, and an Interviewer holding a question he was
expected to answer a fortnight before that (#1396). If you mean to end one of them, NAME it —
the guard is on `--all`, not on the session.

Three facts every conductor before you rediscovered the expensive way. You do not need any of
them while you use `await`; they are here so you recognise the failures if you ever leave it.

1. **A plain background watcher is reaped.** `while ps -p <pid>; do sleep 20; done &` — two
   were killed in a row on 2026-08-31, and an untracked background job cannot re-invoke you
   even when it survives. The harness's own **`Monitor`** (the background-task mechanism that
   re-invokes the agent) does survive. Never `&`; `await` in the turn, or `Monitor`.
2. **`theagent2 conduct inflight` is the liveness question** — the process table, attributed
   through `THEAGENT2_LEDGER_ENTRY`, with the completion sentinel as a veto, exit 2 meaning
   "I do not know" and never "nothing". Not `tmux ls | grep`: a serial chain of N children has
   N−1 gaps, and a poll landing in a gap reads "all done". That is how a stage session was
   launched concurrently with a retro on 2026-08-30, against the ruling that at most one
   session writes this checkout at a time.
3. **`dispatch` zero-pads the serial into the tmux name** — `S-125` is
   `bp03-system-health-0125`, and a conductor reversing that by hand got the padding wrong and
   spun a silent 80-minute timer. `await` takes the LEDGER ID and resolves the session and the
   pane id itself, which is the point of writing this down: you never need to know it.

And one thing that is true whatever you use: **`tmux send-keys` exits 0 whether or not the
keystrokes take effect**, and a typed `/exit` has been seen to land visibly in another agent's
input line and never submit (#781, #1017). A successful `send-keys` is evidence of nothing.
`await` therefore uses `kill-session`, and only after both of its checks pass.

### When you STOP a child before its report — what it measured is UNKNOWN

**A child you killed wrote you no report, so its results are UNKNOWN unless a FILE holds them.**
Read the file. If there is no file, the answer to "what did it find?" is *"not measured"* — write
that word into your takeover brief, your handover and anywhere else the question travels.

**THE ABSENCE OF A WRITTEN RESULT IS NOT A NEGATIVE RESULT.** *"It did not reproduce"*, *"the check
was clean"* and *"nothing was found"* are readings. A dead child left none of them. Inventing one
is the cheapest sentence in this playbook and the most expensive to unwind, because it arrives in
the indicative and every reader downstream repeats it as fact.

**Bought on 2026-09-17, figaro relay `R-416` (Kaizen `K-097`, `theagent-unchained#1758` item 2).**
A headless ops child HAD reproduced the fault — at 2 Mbit/s and 150 ms, rows at 1.85 s, page live
at 2.64 s, the press between them lost. It printed that to stdout, wrote no file, and its conductor
stopped it, because a brief is one-shot and a headless child cannot be corrected mid-flight. The
takeover brief then said *"it did NOT reproduce"*. The replacement child did not re-run the test,
and that sentence travelled through its report, an issue comment, a commit message and a relay onto
the Software Architect's question card, where it sat for about eight minutes.

**So, before you stop a child:** ask whether anything it has learned is on disk, and if the answer
matters to the next child, **let it write the file first** — a headless child cannot be told
anything, but it can be waited for. **After you stop one:** the successor's brief says *"not
measured — the previous child was stopped before it reported"*, and names the re-run.

This is the same rule as the `idle` guard above, one step further on. There you close on the
answer and never on the silence; here you report the silence AS silence, and never as a finding.

## Succession seams (in order of intent)

1. **Every gate boundary** — the state is maximally clean; succeed before opening the next
   stage.
2. **Every ~5 dispatched child sessions** — bookkeeping bloat is a seam, not a percentage.
3. **The context andon** — last resort by design. `notice` (20%): plan the handover at the
   next seam. `urgent` (50%): stop starting things; persist, commit, `theagent2 succeed`.
   `halt` (70%): the hook blocks you — succeed immediately.
4. **The cost andon** — the same last resort in the unit the bill is denominated in
   (#1416): cumulative cache-read, which is context × turns. It is a separate seam because
   the 1M window separated the two failures the context andon used to catch at once —
   running out of ROOM, and spending money. It never blocks; it says the number and names
   the same remedy — at the crossing, and again at every FURTHER budget read (Kaizen pull
   K-003: said only at the first crossing, it was a warning that arrived where the seam it
   asks for may not exist yet, and seven sessions read 71.4M cache-read tokens past it).
   Its level is the Software Architect's ruling: 20,000,000 cumulative cache-read tokens
   per session, about 150 messages (relay R-137).

**The target is a BAND, not a ceiling: aim a stage session at ~50–149 messages** (#1418).
Cost per message rises with session length, and superlinearly — $0.060 below 50, $0.072 in
the band, $0.105 at 150–299, $0.142 at 300+, measured across 915 costed sessions. That is
this repo's cost law seen from the side: a message late in a long session re-reads
everything before it.

**The floor is as much the point as the ceiling.** Below 50 messages, splitting stops
paying — it saves $0.012 per message and costs a full boot every time — and 207 of those
915 sessions already sat there. Over-splitting is not this run's failure mode, and it is
the one a naive "shorter is cheaper" rule would create. So: do not succeed just to be
short, and never below the floor without a reason that is not length.

**Retros are exempt by role.** 458 of the 915 sessions are handover retros, $2.87 each and
the cheapest thing the process does. A length rule that caught them would make the process
more expensive.

The band is a **design target you size work against**, not a trigger: nothing blocks on it
and nothing warns mid-flight. `theagent2 conduct ledger close` states where a session
landed, once, at the moment it is priced — for sizing the NEXT one. If only one trigger is
ever built it is the cost andon above, because cumulative cache-read is the billed quantity
and a message count is only a proxy for it.

Seams are not free: every succession costs a full boot (measured $1.01–$3.53 of cache-write
per session in Run 4), so a sub-15-minute session pays mostly to exist — the counterweight
to "succeed early". The band above is how the two reconcile (#1418, answering the question
#943 left open): succeed early **into the band**, not below it.

**At every seam, name the next act.** The surface you hand over carries one item that
either states the successor's next act with the ref that authorizes it, or says in as many
words that nothing proceeds without the SA's direction. Boot step 7 acts on exactly that
item — the successor resumes what disk authorizes and waits only when nothing does — so a
handover silent on it hands the successor a guess. Run 4's OI-052 and OI-056 are the model
(#824).

**At every seam, say what carries forward.** Your successor cache-writes `state.yaml` when
it boots and cache-reads it on every turn after, and so does every session after that — so
a resolved item you leave in place is billed for the rest of the run. Run 4 handed over 281
lines and 66 items and paid for all of it (#821). `succeed` therefore refuses a surface over
100 lines until you name the carry set: **`theagent2 succeed --keep OI-nnn,OI-nnn`** archives
everything else verbatim into `.theagent/conduct/archive.yaml` — still committed, still
greppable, out of every future session's context — inside the succession commit. Prune at a
gate exit without succeeding with `theagent2 conduct prune --keep <ids>` (or name the items
to drop positionally). Andon items never leave the surface by prune — clear them first
(`theagent2 conduct clear <id> --ref <…>`), which is also what unblocks `succeed`; if every
item is genuinely still live, pass them all and hand over whole. Never hand-edit
`state.yaml` to remove an item or to lower a severity.

**Crash drills are part of the protocol:** the SA may kill you without warning. That is
not an incident — the successor's boot plus the handover leak report are the drill's
measurement. Conduct so that the drill finds nothing: every ruling in a ledger the moment
it lands, every step's exit persisted before the next begins.

## Run end

1. The SA leads the **process retro** (the Step-8 harvest); you assemble its inputs:
   the stage-retro outputs, the friction log, and the run dataset (per-stage rows under
   `.theagent/conduct/metrics/`). Run `theagent2 conduct ledger measure --all` and then
   `theagent2 conduct metrics restate --all` FIRST: a stage row was written at its gate
   while that gate's own conductor was still live, so until it is re-summed every stage
   total is a floor and every orchestration ratio is biased low (#834). Then
   `theagent2 conduct metrics arc --all`: a ledger `stage` is stamped at birth and never
   moves, so a session that served a gate from a different rail node books elsewhere and no
   stage total shows it (#790). The arc report is the second partition; hand the process retro both.
2. **Archive the transcripts out of the container** — containers are ephemeral; teardown
   is the loss risk. Copy every `transcript` path in the ledger to
   `.theagent-run/transcript-archive/` and export it wherever the SA directs, using the
   pre-filter (`bin/transcript-prefilter.mjs`) for any copy that must stay small.
3. **Close the run as a field, not as a sentence:** `theagent2 conduct close --ref <where the
   closure is recorded>` — the gate record, the owner's disposition, the ruling. It stamps
   `status: closed` with that reference and commits, and from then on `theagent2 conduct
   dispatch` refuses against this surface. Leave the one-line prose item too, saying where the
   verdict surface lives: the item is how a reader learns the story, the field is what a verb
   can read. Run 4 had only the item — it said "THE RUN IS CLOSED … Do not open a stage" — and
   fifty-two sessions were dispatched onto the closed run afterwards (#1152).
   A handover retro, `conduct ledger close|measure|mark-retro` and `conduct boot` all still run
   on a closed run: a finished run may be corrected and measured, it just takes no new work.
4. **Give the work that outlives the run a surface of its own.** Sweeps, chores and the
   housekeeping between runs are sessions, and they need somewhere to be recorded that is not a
   finished run's ledger:
   `THEAGENT2_CONDUCT_SURFACE=maintenance theagent2 conduct init --run <slug> --kind maintenance`,
   commit, and carry that variable on every verb from then on — a maintenance surface has no
   gates and no rail cursor by design, and `conduct dispatch` exports the variable into each
   child so its bind, its andon and its metrics row follow it home.
