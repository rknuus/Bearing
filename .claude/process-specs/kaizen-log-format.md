# The Kaizen Log Book format (`kaizen-log/1`)

**Status:** the single source for the shape of `.theagent/conduct/kaizen-log.yaml` — the log book
of ADR-075. What the log book is *for* is that ADR; this note fixes its fields, its closed
vocabularies, and the check surface (the `theagent2` runtime).

## Purpose

One committed, machine-readable file per conducted run that records **every pull of the Kaizen
cord and what was decided about it** — including the pulls whose verdict was to do nothing. The
Software Architect asked for exactly that, on 2026-09-10, in his own words:

> A LOG BOOK records every pull and its verdict INCLUDING the verdicts that decided to do nothing:
> «maybe we can decide not to do nothing right now, but still the record is there.»

A verdict of `nothing` is therefore a **first-class entry**, not an absence. A pull that was looked
at and dismissed leaves the same trace as one that changed the process, because the next session
that meets the same symptom needs to know it was already examined — the failure a log with only
success stories in it produces is the same idea proposed and dismissed twice.

Location: **`.theagent/conduct/kaizen-log.yaml`** — committed, beside the resume surface, the
ledger and the friction log (`conduct-state-format.md` holds the directory's full contract). The
file is **optional**: a run in which the cord has never been pulled has none.

**Four verbs write it, and nothing else does:**

- `theagent2 kaizen pull` appends one entry — the pull.
- `theagent2 kaizen verdict <K-###>` writes the analysis and the verdict onto that entry, once —
  and `--dry-run` shows that write before it happens, touching nothing.
- `theagent2 kaizen told <K-###>` writes the loop's last step — that the Kaizen agent was told
  what was done — onto an entry that already carries a verdict, once.
- `theagent2 kaizen read <K-###>` appends what a LATER LOOK at a ruled trial found, against the
  observation point that trial's own verdict named. Append-only, not write-once, and `--dry-run`
  shows the row before it lands.

All four validate the whole file, mint or resolve the id in the runtime, append or patch
atomically, and leave the commit to the caller. The log book is never hand-edited, exactly as
`open_items` and the friction log are never hand-edited.

**A pull RECORDS; the VERB does not stop anything — and the LINE still drains.** No verb in this
format signals, kills, pauses or drains a running session, so a reader of this file must not assume
that a `stop: halt` entry stopped anything. What the RUN does is a separate fact and it is RULED:
the Software Architect answered ADR-075 §5 question 1 with his letter `1c` on 2026-09-10 — *"Drain
by default, and the puller may declare a hard stop when the thing it saw is actively burning tokens
or damaging the tree"* — and confirmed it on 2026-09-15 against a proposal to scope a pull. Running
sessions finish their current piece, nothing new starts until the improvement is established and
the Kaizen agent is told, and the DRAIN IS NEVER WAIVED: the only variation his ruling allows is
upward, to `halt`. Draining is the conductor's act, performed because the log book carries an open
pull. See *What a pull asks of running work — RULED* below.

## Shape (by example — illustrative)

```yaml
format: kaizen-log/1

run: adoption                      # the run slug — the same one `state.yaml` and the ledger carry
project: figaro                    # optional: the repository this run works on

entries:                           # LAST key in the file — appending an entry is an append at EOF
  - id: K-001
    pulled: 2026-09-10T16:41Z      # when the cord was pulled (UTC, minute precision)
    by: S-1197                     # the ledger id of the session that pulled
    role: architect                # the puller's role, off its ledger row
    node: design                   # the rail node it pulled on, off its ledger row
    stop: drain                    # drain | halt — what the puller ASKS of running work
    saw: "Four re-dispatches of the same blind review, each re-reading the whole model export,
      because the reviewer is never told which findings the previous round already fixed."
    evidence: "S-1180..S-1183 metrics rows; .theagent/conduct/sessions/S-1183.md"

    # --- written later, by `kaizen verdict`, once ---
    ruled: 2026-09-10T18:05Z       # when the verdict was recorded
    ruled_by: S-1204               # the session that recorded it
    analysed_by: [S-1201, S-1204]  # every session that took part; a `kaizen` session among them
    verdict: experiment            # changed | experiment | nothing
    analysis: "The rounds are not re-reading because the reviewer is careless; the brief hands it
      no diff, so re-reading is the only correct thing it can do."
    change: "b41c9d2 — the review brief template now carries the previous round's findings"
    hypothesis: "Round 2+ costs under half of round 1. Measured on the next two review chains;
      reverted if it does not."
    experiment: "The template change is live for the next two review chains only. Seen in the
      metrics rows of those chains. Reverted by reverting b41c9d2, one commit."
```

## Rules (checker-enforced)

- `format` is the first line and is `kaizen-log/1`; validators match name and version only
  (ADR-051 §4).
- `run` is a non-empty string and matches the run slug in `state.yaml`. `project` is optional.
- **`entries` is the LAST top-level key.** The same rule the friction log carries, for the same
  reason: an append-only register is appended to at end of file, and a key below `entries:` forces
  every writer to insert into the middle instead — which is how the first friction log in
  existence drifted into invalid YAML with nobody reading it (#1119).
- **`entries`** is a list (may be empty). Every entry carries the **pull** fields, all required:
  - `id` — `K-` and an ascending serial, zero-padded to three (`K-001`, `K-042`). **Minted by the
    runtime, never typed by a caller**: the next id is the highest serial in the file plus one, so
    a file that slipped out of order gets an id that cannot collide rather than one that
    reproduces the disorder — the rule `nextOpenItemId` already follows. The writer refuses rather
    than mint an id the file already carries. Ids are local labels for one run.
  - `pulled` — `YYYY-MM-DDTHH:MMZ`, UTC, minute precision, as every stamp on the conduct surface
    is. When the cord was pulled, not when the entry was written.
  - `by` — the ledger id (`S-###`) of the session that pulled. Required, and it must be a ledger
    id: a puller nobody can join to the ledger is a puller nobody can ask. Any role may pull —
    that is the point of the cord (ADR-075 §2).
  - `role` — the puller's role, read off its ledger row rather than typed. Free-form: the role
    catalog moves, and an entry from before a role existed must stay readable.
  - `node` — one of the nine rail ids (`discovery mockup intent design blueprint specification
    contract construction acceptance`), read off the puller's ledger row. **Optional**, and this
    is the one place this format is looser than the friction log: a maintenance surface has no
    rail node at all (#1171), and a cord that a maintenance session cannot pull is not a cord.
    An entry without a node says the pull happened off the rail; it is not a defect.
  - `stop` — exactly one of `drain | halt`. What the puller ASKS of work already running:
    `drain` — running sessions finish their piece, new dispatches serve Kaizen; `halt` — the
    puller is asking for work to stop where it stands. **Recorded, never enforced** (see Purpose).
    The default is `drain` and it is RULED, not provisional (his letter `1c`, 2026-09-10,
    confirmed 2026-09-15). A puller ESCALATES to `halt` when the thing it saw is actively burning
    tokens or damaging the tree, and says why in `saw`. No puller, conductor or AI Architect may
    declare a third mode that waives the drain — see *What a pull asks of running work — RULED*.
  - `saw` — what the puller saw, in prose a reader who was not there can act on. No length rule.
  - `evidence` — **every entry names what it rests on.** A commit, a session record, a metrics
    row, a transcript observation, a file and line. A pull with no evidence is a feeling, and the
    analysis that follows one cannot start. The field is prose, deliberately: what counts as
    evidence differs per pull, and a typed reference would exclude the metrics and transcript
    observations that produce the best ones. Same rule, same words, as the friction log's.
- The **verdict** fields are written later and are all absent or all present together, except the
  three that are conditional. An entry with none of them is **open** — the pull has been recorded
  and not yet analysed, which is a real and expected state:
  - `ruled` — `YYYY-MM-DDTHH:MMZ`, when the verdict was recorded.
  - `ruled_by` — the ledger id of the session that recorded it.
  - `analysed_by` — a non-empty list of ledger ids: every session that took part in the analysis.
    **The Kaizen agent is involved in the analysis of every pull** (ADR-075 §3, his own words), so
    the verb refuses a list in which no session's ledger role is `kaizen` — unless the caller
    passes `--without-kaizen <why>`, which records the reason as `kaizen_absent` on the entry.
    The rule must never destroy the record: an analysis that happened without the Kaizen agent is
    worth recording *and* worth marking, which is what the escape hatch buys.
  - `kaizen_absent` — optional prose; present exactly when the analysis ran without a `kaizen`
    session, saying why. Rendered as a flag in the executive summary.
  - `verdict` — exactly one of:
    - `changed` — an improvement was established. `change` is then required.
    - `experiment` — a small, cheap change was made **as a test**, because "not every change has
      [will] yield benefits right away" (his words, 2026-09-10). `change` **and** `hypothesis` are
      then both required: an experiment with no hypothesis is a change nobody can judge, and it is
      the shape this vocabulary exists to refuse.
    - `nothing` — analysed, and nothing was done. `analysis` is still required, and `change` and
      `hypothesis` must be absent. **This is a first-class verdict**, by his own words above.
  - `analysis` — always required with a verdict: what was actually going on. Not a restatement of
    `saw` — the finding, in the analyst's words.
  - `change` — required for `changed` and `experiment`, forbidden for `nothing`: what was done and
    where, as a commit, an ADR, an issue or a path. A verdict that says something changed and
    cannot say what is not a record.
  - `hypothesis` — required for `experiment`, optional for `changed`, forbidden for `nothing`:
    what is expected to improve, how it will be seen, and what would revert it.
  - `experiment` — optional for `changed` and `experiment`, forbidden for `nothing`: the TEST that
    was set up. The hypothesis is what you EXPECT; this is what you BUILT to see it — what is in
    place, how it is observed, and what reverts it. It is deliberately **not** required by
    `verdict: experiment`: the field arrived on 2026-09-11 into a book that already held two
    experiments, and a rule that refuses the whole file over a record written before the rule
    existed destroys the register it was meant to improve. His own words on the change, `R-213`:
    *"The 35 records keep everything they have today."*
  - `told` — optional; the ledger id of the `kaizen` session that was told what was done. The loop
    he described ends there — *"work resumes only after an improvement is established and the
    Kaizen agent has been told what was done"* — and an entry whose verdict is written but whose
    `told` is empty is shown as *not yet told* in the executive summary. It is a shown absence
    rather than a refusal: this format records the loop, it does not run it.
    **Written by either of two verbs, and write-once whichever wrote it.** `kaizen verdict
    --told` covers the case where the analyst is there to hear it; `kaizen told <K-###>` covers
    the ordinary case, because a `changed` verdict is recorded by the session that ESTABLISHED
    the change and that session is frequently the only one awake. The second verb exists because
    the first run of this book produced three entries (K-010, K-014, K-018) ruled with `told`
    empty and no verb able to fill it — a loop the format could describe and the toolchain could
    not close. Telling the same session twice is a no-op; naming a different one is refused,
    because being told is an event, and a session whose ledger role is not `kaizen` is refused,
    because the loop ends with the Kaizen agent.

    **AN ABSENT `told` MEANS ONE OF TWO THINGS, AND THE BOOK DERIVES WHICH — no new field**
    (Figaro `F-D536`, 2026-09-21). *Not applicable*: the `verdict` is `nothing` **and** `ruled_by`
    is a session whose ledger role is `kaizen`. Nothing was established, so there is no later act
    to tell anybody about and no session will ever be dispatched to hear one — **the mark can never
    be written by any actor**, and `kaizen told` says exactly that rather than naming the caller's
    role. *Owed*: every other untold ruled pull, including a `nothing` that some OTHER role wrote,
    because the Kaizen agent was not the one who ruled it and can still be told. `theagent2 kaizen
    list` prints the split beside its «N of M pulls, K open» line; it was 5 owed and 33 not
    applicable out of 38 on the first book large enough to notice, which had reported only «0 open»
    about all 38. **Neither state is ever filled in automatically**: writing the mark for a step
    nobody took is the objection the verb itself raises.
  - `reads` — optional; a LIST, appended to, of what later looks at this trial FOUND. Absent until
    somebody goes back and measures. Only on a `changed` or an `experiment`: a `nothing` verdict
    changed nothing, so there is no trial to read and the verb refuses one. Each row carries
    `at` (`YYYY-MM-DDTHH:MMZ`), `by` (the ledger id of the session that looked), `outcome` — one of
    **`kept` | `reverted` | `inconclusive`** — and `found`, which says what was measured against
    the hypothesis's own bar. `inconclusive` is FIRST CLASS for `nothing`'s reason: a trial whose
    observation point was reached and did not decide is a fact, and the next reader must be able to
    learn it without re-taking the measurement.
    **Why a list and not a field.** A trial may be read at an interim observation point and again
    when its sample closes, and the second reading must not erase the first. A reading is also
    **not a verdict and cannot become one**: the verdict stays write-once and a changed mind is
    still a new pull. Recording the same look twice is refused; a later look with a different
    finding is accepted.
    **Why the field exists** (#1850, Kaizen `K-137`, 2026-09-20). The book asks every
    `experiment` for a hypothesis, an observation point and a revert — and then had no field, no
    verb and no listing that could say whether the read ever happened. Measured on the `adoption`
    run: **sixteen** trials stood ruled that way, and **six of them had already been read** — in a
    later pull's `analysis`, in a wave's carry-forward register, in a session record — while the
    book showed all sixteen as identical rows. The clearest case is the whole argument: the
    analysis of `K-053` took `K-003`'s own measurement, found it short of `K-003`'s own bar
    (a 35 % fall against an "at least half" claim), and wrote *"read here as evidence and not as a
    verdict on K-003"* — because nothing could hold it. `K-003`'s stated revert never fired.
    **ANY role may take a reading**, and that is deliberate: being told is the Kaizen agent's step
    by his own words, but a reading is a MEASUREMENT, and the session best placed to take one is
    usually the conductor that has just persisted the report the trial was betting on.
    **Where the unread ones are named:** the closing line of `theagent2 kaizen list`, and
    `kaizen list --trials`. Deliberately **not** `conduct boot` — a boot line is paid by every
    session of every run on every turn (#821), while `kaizen list` is run by the sessions that
    analyse a pull, who are told to read the book FIRST. So the owner is whoever next pulls the
    cord and the trigger is the next pull.
- Entry ids are unique within the file. Entries are in pull order, because they are appended.
- **An entry's pull fields are never rewritten.** The verdict is a bounded late write onto an
  existing entry — the same split `conduct-ledger/3` draws between its immutable birth fields and
  its late-write set, for the same reason: rewriting what was seen destroys the record of what was
  known when. A verdict is written **once**; a second `kaizen verdict` on the same entry is
  refused, and a changed mind is a new pull that cites the old one in its `saw`.
- **A verdict is SEEN before it is written: `theagent2 kaizen verdict <K-###> … --dry-run`**
  prints the entry that would land — every field, the id it targets, the log book it lands in —
  and writes nothing, neither the book nor the HTML pointer. Every refusal still fires, so a dry
  run that exits 0 is a call that would land. **Run it on your first call, always.** It exists
  because a session that ran the verb once with placeholder values to learn its required flags
  thereby wrote the permanent verdict of a ruled, merged improvement (`K-119`, 2026-09-19;
  issue #1825, Kaizen `K-121`) — and because every other write-once surface in this toolchain
  could already be inspected first (`conduct dispatch --check`, `conduct migrate-state --check`,
  `resource-protocol --check`).
- **The write-once rule is not relaxed and there is no `--amend`.** The refusal a second write
  meets names the repairs the verb WILL accept — the dry run above, `kaizen told` while that
  field is still open, this pull's page under `.theagent/conduct/kaizen-report/` for an analysis
  that outgrew one field, and a new pull for a genuinely changed mind. A bounded same-session
  correction was proposed and **refused by ruling** (the conductor of the `adoption` run, on
  #1825): a second writer of a write-once field costs the trustworthiness of the whole register.

## What a pull asks of running work — RULED

**This was ADR-075 §5's first provisional default and it is not provisional any more.** The
Software Architect ruled it with his letter `1c` on 2026-09-10, selecting this option verbatim:

> *"(c) Drain by default, and the puller may declare a hard stop when the thing it saw is actively
> burning tokens or damaging the tree."*

He confirmed it on 2026-09-15, against a proposal to scope a pull to the part of the line that
shares the defect, with *"keep that rule"* — recorded as *"the question is closed and no session
may re-open it."*

| what it binds | the rule |
|---|---|
| the default | `drain`. `CORD_STOP_DEFAULT` in `packages/runtime/src/conduct/kaizen.ts` already holds it; his answer costs no code, because `--stop halt` is what the letter's second half asks for |
| what drain means | running sessions finish their current piece; nothing new starts until the improvement is established and the Kaizen agent is told what was done |
| the scope | the WHOLE line. There is no scoped pull |
| the only variation | UPWARD, by the puller, to `halt`, with the reason in `saw` |
| what nobody may do | waive it. There is no third mode. A session that declares one is inventing authority, and the run will follow it — measured, `K-127`/`K-130`, 2026-09-20 |
| who may change it | the Software Architect, and only him |

**The verb still enforces nothing, and that is not a contradiction.** Draining is the conductor's
act, taken because the log book carries an open pull. The two sentences — *the verb records* and
*the line drains* — must be read apart.

## There are no provisional defaults left — ALL FIVE ARE RULED

**This section used to name the defaults that were still placeholders. There are none** (Kaizen
`K-131`, 2026-09-20). The Software Architect answered all five of ADR-075 §5's questions on
2026-09-10 in a SINGLE turn — `1c 2b 3b 4b 5c` — recorded in
`.theagent/conduct/relay/R-178.answer.md` with each letter quoted beside the option text it
selected. `K-130` moved the first row and said in as many words that it had not measured the rest;
`K-131` measured them, and they had been ruled in the same breath.

| what | his letter | what it settles | what it cost |
|---|---|---|---|
| what a pull asks of running work | **`1c`** | drain by default; the puller may escalate to `halt`; nobody waives it — see *What a pull asks of running work — RULED*, above | nothing: `drain` was already the default and `--stop halt` already existed |
| what the cord is called | **`3b`** | the **Kaizen cord**, `theagent2 kaizen pull`. «Andon» keeps meaning the context and cost tier alarms and is NOT renamed | nothing: no `.alias('andon')` was ever added |
| what fires the Kaizen agent | **`2b`** | a cheap watch that escalates — `theagent2 kaizen watch`, at every session end and on a four-hour timer, recording a pull and telling the conductor. The expensive DISPATCH stays a session's decision | nothing: it was built to his letter on 2026-09-11 |

**Two more of his letters are recorded where they belong rather than here.** `4b` — a free hand in
this checkout AND upstream under his risk rule of 2026-09-07, with RISK and not location as the
test — is a rule about the Kaizen agent's own authority and lives in `agents/kaizen.md`. `5c` —
Kaizen runs ALONGSIDE the delivery goal rather than replacing or suspending it — is a fact about a
run's goal and lives in that run's `conduct goal`.

**WHY THIS SECTION KEPT ITS PLACE INSTEAD OF BEING DELETED.** A reader who met the word
*provisional* in an older copy of this file, in a nine-day-old brief or in a session record needs
somewhere to land. An empty heading is far cheaper than the sweep that re-discovers the question is
closed — which is exactly what `K-131` had to pay for.

## Hazards in our own machinery live here too (SA, 2026-09-11, item 6)

Beside the pulls that see a process going badly, this book carries **one line per issue about a
hazard in our own machinery** — the toolchain, the conduct surface, the hooks, the skills, the
launch verbs. His letter «B» of 2026-09-11, on the option *"Put a hazard in our own machinery where
sessions read it"*: every such issue gets one line here, and **not** an open item on the conduct
surface, whose line budget is what K-012 is about.

The measurement that produced the rule: the hazard behind a 17-hour, USD 57.83 twin session had
been filed as an issue five days before. No session saw it, because no role reads the issue tracker
first — and this book is read first, by the one role whose subject is how the work moves.

Such an entry is an ordinary pull (`theagent2 kaizen pull`), with the issue as its `evidence`. It
carries no new field and no new vocabulary: a hazard somebody has written down is a thing somebody
SAW, which is what a pull is.

## What does not live here

- **Friction.** What the process *cost* the run is the friction log (`friction-log-format.md`);
  what the run decided to *change about the process* is this file. A pull that ends in `changed`
  will usually also owe a friction entry, and they are different records with different readers:
  one is evidence for the process retro, the other is the decision trail.
- **Open items.** A pull that still blocks the run belongs in `state.yaml`'s `open_items` as well,
  where every boot reports it. The log book is not read at boot — deliberately, so that a register
  that will grow all run long never becomes a per-turn context cost.
- **The report.** What a human reads is `.theagent/conduct/kaizen-report/` — one entry page per
  pull, written by the agent that analysed it (his `R-213`, letters `1A`/`2A`; the `kaizen-report`
  skill). It is a reading of this file, never a source for it. There is no generated summary page
  any more: `theagent2 kaizen summary` writes a one-line pointer at that report and nothing else
  (#1540). One question, one answer.
- **Counts.** Any total — pulls, verdicts, experiments open — is derived from `entries`, in the
  report or in `kaizen list`, never stored beside them where it can disagree.

## Check surface

The `theagent2` runtime is the validator, fail-closed, exactly as it is for the friction log:
`theagent2 kaizen pull`, `verdict`, `list` and `summary` each validate the whole file before they
touch it, and refuse — naming the field and the value — on anything this spec rejects. A missing
file is not an error; a present and malformed one is.

Unlike the friction log, **`conduct boot` does not read this file**. That is a deliberate
omission and not an oversight: the boot surface is what every session pays for on every turn, and
this register exists to reduce that kind of cost, not to add to it.

## The reporting system these fields feed (his ruling, `R-213`, 2026-09-11)

The log book is the **record**. What he reads is a **report**, and on 2026-09-11 he ruled its three
open questions in one turn — `1 A`, `2 A`, `3 B`:

| His letter | What it binds |
|---|---|
| **1 A** | **One entry page per CORD PULL.** Not per session, not per day. An entry page is ADDED and then NEVER changed. |
| **2 A** | **An AGENT writes the page** — it draws the charts and writes the reading of the pull. A program printing a list can only ever produce a list. |
| **3 B** | **English.** This settles a `CLAUDE.md`-class collision: method-facing prose whose only reader is the business stakeholder. It binds the entry pages, the landing page and this book. Nothing else is relaxed. |

Where it lives, beside the book: `.theagent/conduct/kaizen-report/` — `index.html` is the landing
page over everything ever done and is **rewritten whole** every time; `pulls/K-###.html` is one
entry page per pull and is **never rewritten**. How an agent writes them is the `kaizen-report`
skill, which is where the template and the five required sections live.

**This report is the only report.** The generated page that used to stand beside it is retired:
`kaizen-summary.html` now holds a one-line redirect here and no content of its own (#1540). It was
retired because two artefacts answered one question, and the tooling kept regenerating the wrong
one — which cost the Software Architect three requests for one report on 2026-09-11.

The five sections of an entry page are his, from `C-006`: what was looked at, what was found, the
hypothesis built, the experiment set up, the change planned or executed. Four of the five were
already fields here. `experiment` is the fifth, and that is why it exists.

## Version history

- `kaizen-log/1` (2026-09-20, Kaizen `K-137`, #1850) — `reads` added, optional and additive, with
  the `kaizen read` verb and the `kaizen list --trials` view. Every record written before it keeps
  every field it had, and the version is unchanged because nothing that was valid became invalid
  (ADR-051 §4).
- `kaizen-log/1` (2026-09-11, `R-213`) — `experiment` added, optional and additive; every record
  written before it keeps every field it had. The version is unchanged because nothing that was
  valid became invalid (ADR-051 §4: validators match name and version only).
- `kaizen-log/1` (2026-09-10, ADR-075) — first version.
