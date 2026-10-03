# The Conduct State format (`conduct-state/3`)

**Status:** the format spec ADR-056 §2 owes — the single source for the resume surface's
shape. The crash-only conduct model is defined by ADR-056; this note fixes the fields, the
directory contract of `.theagent/conduct/`, and the check surface (the `theagent2` runtime).

## Purpose

One small, committed, machine-readable file per project that answers a successor session's
first question: **where does the run stand?** A conducted run is crash-only (ADR-056): the
conductor session assumes it can be killed at any moment, so the resume surface must be
current on disk after every step — a fresh session boots from this file plus the session
ledger, never from a predecessor's context. It gives ADR-038 §4's rule ("every conduct
session leaves the resume surface current") a typed home so that:

1. `theagent2 conduct boot` can state the run position mechanically — stage cursor, gate
   statuses, open items — before the conductor reads anything else;
2. `theagent2 succeed` can **refuse** a handover whose surface is stale or uncommitted;
3. a critical retro finding has a blocking home (an `andon` open item) that the next boot
   cannot miss.

Location: **`.theagent/conduct/state.yaml`** — committed (the `.theagent/` convention,
ADR-001/-014). The directory's full contract:

```
.theagent/conduct/
  state.yaml        # this file — the resume surface (conduct-state/3)
  ledger.yaml       # append-only session ledger (conduct-ledger/3)
  archive.yaml      # open items pruned off the resume surface (conduct-archive/2)
  tripwires.yaml    # the run's paid-for traps (conduct-tripwires/2) — optional, agent-authored
  friction-log.yaml # what the process cost the run (friction-log/2) — optional, agent-authored
  metrics/          # per-session rows + node aggregates (session-metrics/3)
  sessions/         # handover-distilled session records (S-###.md, prose — see below)
  briefs/           # retained dispatch briefs (<ledger-id>.md, ADR-056 §1b)
  kickoff.md        # retained kickoff brief — the route and its gate acts (ADR-058 §2)
```

`kickoff.md` is written by `theagent2 conduct kickoff --brief <file.md>`, which refuses
a brief whose route leaves a gate act uncovered (#848). Its two sections are fixed:
`## Route` names the rail the run walks as one arrow-separated chain (`discovery -> intent ->
design -> …`), and `## Gate acts` carries one line per act the route owes — `- blueprint promote:
delegate <who>` or `- blueprint promote: pause-for-SA`. The acts are derived from the **stages** on
the route (discovery and mockup owe intent, design owes blueprint, specification owes contract,
construction owes acceptance), not from the gates named on
it: a route that skips Blueprint's review still owes Blueprint's act, and that is the one the
forgetting brief omits. Every `conduct boot` reports the coverage, so a successor about to
perform an act reads who holds it.

Only `state.yaml` and `ledger.yaml` are read at boot. `archive.yaml` is the cold
half of the same surface: committed and greppable, never in a session's context.

The state file **indexes; it is never the truth.** GitHub issues and the gate records
(ADR-051) stay authoritative — same rule as the program docs. Big artifacts are referenced
by path, never embedded. The gitignored `.theagent-run/` stays the scratch home; the boot
lock lives there (`.theagent-run/conduct.lock` — PIDs are machine-local, ADR-056 §3).

## More than one surface, and only ever one default (#1152)

A project has one conducted run at a time, and that run ends. What it does not stop having is
**sessions** — a sweep, a chore queue, the housekeeping between runs. Until #1152 those had
nowhere to go but the finished run's ledger, and fifty of them landed in run 4's, weeks after it
closed.

So `.theagent/conduct/` is the DEFAULT surface, not the only one. A workstream may carry others
side by side — `.theagent/maintenance/`, say — each a complete surface with its own `state.yaml`,
`ledger.yaml`, `briefs/`, `metrics/` and `sessions/`. Which one a process reads and writes is
**`THEAGENT2_CONDUCT_SURFACE`**: one directory name under `.theagent/`, never a path, defaulting
to `conduct`. Selection is an explicit variable and never a search or a guess, for the same
reason `THEAGENT2_CONDUCT_ROOT` is (#828): binding a session into the wrong ledger is silent and
permanent. `theagent2 conduct dispatch` exports it into every child it launches, so a maintenance
session's birth assert, context andon, metrics row and git identity all follow it home, and
`conduct boot` lists the surfaces a workstream carries.

## Shape (by example — illustrative)

```yaml
format: conduct-state/3

run: figaro                        # run slug; names the ledger's run and the tmux prefix
kind: conducted                    # conducted (a run on the rail) | maintenance (#1152)
status: active                     # active | closed — a closed surface refuses a dispatch
cursor: design                     # rail id being worked (ADR-040/064): discovery mockup
                                   # intent design blueprint specification contract
                                   # construction acceptance
gates:                             # one row per gate, in rail order
  intent: { status: passed, record: docs/04_Gates/gate-intent/record.yaml }
  blueprint: { status: at-gate, record: docs/04_Gates/gate-blueprint/record.yaml }
  contract: { status: pending }
  acceptance: { status: pending }
goal:                              # the run's standing goal (#1218) — BESIDE the items, never among them
  text: "Bring Figaro's ordering flow to a state the salon can run a real day on, backend included."
  source: verbatim                 # verbatim (his own words, `ref` required) | reading (the conductor's, pending confirmation)
  on: 2026-09-03                   # when it was set or last re-authored
  ref: ".theagent/conduct/sessions/S-014.md"   # where the words are on record
  by: S-014                        # the session that wrote it
  done_when:                       # when the goal is REACHED (#1232) — flat, ordered, one line each
    - text: "the models are according to the process and the latest schemas"
      source: verbatim             # same marking as the goal: his words | the conductor's reading
      state: met                   # open | met
      met: 2026-09-04              # the day it was reached — required when met, absent when open
      ref: ".theagent/conduct/sessions/S-014.md"
    - text: "the behavioral mockup is walkable"
      source: reading              # the conductor's, unconfirmed — marked as such wherever it is shown
      state: open
  assessed:                        # rulings READ and found to move no destination (#1822) — appended, never replaced
    - ruling: R-480                # the id `goal check` names on its evidence line
      on: 2026-09-19               # the day it was assessed
      by: S-3087                   # who assessed it — required: an assessment with no author is a suppression
      ref: ".theagent/conduct/relay/R-494.answer.md"   # where the reading rests
      note: "an instrument, not a pivot: adds no done_when and removes none"   # optional, ONE short line
      goal_on: 2026-09-18          # the goal it was judged against — decoration for the reader
      goal_digest: 8f2a1c3d5e70    # …and its fingerprint, which is what the machine compares
tracker:                           # the labels this run sorts its ISSUES by (#1222) — declared once, never shipped
  blocking:                        # the label marking an issue as blocking a gate — one per gate, all four, distinct
    intent: blocks-intent
    blueprint: blocks-blueprint
    contract: blocks-contract
    acceptance: blocks-acceptance
  deferred: deferred               # the label meaning "real, but not now"
  states: [decide, accepted]       # optional: further labels that also count as a triage state
  repo: raphaelzulliger/figaro     # optional: only when the issues do not live in the workstream's own repo
  on: 2026-09-04                   # when the labels were declared or last re-declared
  by: S-024                        # the session that declared them
open_items:
  - id: OI-004
    severity: andon                # andon = blocks the next boot's report until addressed
    text: "handover retro on S-012: SA ruling on driver settlement found in transcript, in no ledger"
    ref: ".theagent/conduct/sessions/S-012.md"
  - id: OI-005
    severity: normal
    text: "Q&A entry QA-014 unanswered for 3 sessions — chase before the Blueprint surface"
    ref: ".method/qa.yaml"
updated: 2026-08-19                # bumped on every write
```

A **maintenance surface** is the same file without the rail:

```yaml
format: conduct-state/3

run: maintenance                   # the surface's slug; identities subaddress onto it
kind: maintenance                  # no cursor and no gates — see the rule below
status: active
open_items: []
updated: 2026-08-31
```

And a **closed** surface carries the stamp that says what closed it:

```yaml
status: closed
closed: { on: 2026-08-21, ref: "docs/04_Gates/gate-acceptance/owner-disposition.md", by: S-046 }
```

## Rules (checker-enforced)

- `format` is the first line; validators match name and version only (ADR-051 §4).
- **`kind` vocabulary is closed:** `conducted | maintenance` (#1152). A **conducted** surface is
  a run walking the Diamond rail and carries `cursor` and `gates`. A **maintenance** surface
  carries NEITHER, and a `cursor:` or `gates:` key on one is refused: it is not on the rail and
  never was, and four gate rows reading `pending` forever would be an index of nothing. The
  Software Architect considered exactly that dummy-gates alternative and rejected it
  (2026-08-31). A maintenance surface is a real place because it has a status of its own, not
  because it has gates.
- **`status` vocabulary is closed:** `active | closed` (#1152). `theagent2 conduct dispatch`
  **refuses** against a closed surface — a finished run takes no new sessions. Three things are
  deliberately NOT refused, because a finished run's own business does not finish with it: the
  handover retro (`theagent2 conduct retro`), the ledger's late writes (`conduct ledger
  close|measure|mark-retro`), and `conduct boot` itself. The refusal names all of them, and names
  the way out for new work.
- **`closed` is required exactly when `status: closed`** — an inline map with `on` (`YYYY-MM-DD`),
  `ref` (where the closure is recorded: a gate record, an owner disposition, an issue, an
  open-item id) and optional `by` (the closing session). Same rule and same reason as a `passed`
  gate naming its `record:`: the state file indexes, and an index entry with nothing behind it is
  a claim nobody can check. **The transition is `theagent2 conduct close`, never a hand edit** —
  it stamps, commits, and refuses without a `--ref`. **`closed` is TERMINAL: there is no `reopen`
  verb, and there is not to be one** — ruled by the Software Architect on 2026-09-01 (#1153),
  answering the methodology question `close` shipped without. A finished run stays finished; work
  that needs sessions goes to a new conducted run or to the maintenance surface. Two alternatives
  were put to him and rejected: a `conduct reopen --ref <ruling>` symmetric with `close`, and a
  bounded re-opening admitting one re-walked gate. The reason for rejecting the symmetric verb is
  worth keeping: a run that is closed only until somebody types the counterpart is not closed. If
  a real case ever appears, it is one verb and one field transition to add, and that case will be
  the evidence for why the mechanism exists — do not add it in anticipation.
  *Why the field exists:* run 4 was closed on 2026-08-21 and said so only inside one open item's
  prose — "THE RUN IS CLOSED … Do not open a stage: nothing on disk authorizes further work."
  Fifty-two sessions were dispatched onto it afterwards and nothing objected, because no verb
  reads an open item's `text:`. The prose item stays where it is; it is the historical record of
  how the closure was made known. This field is what a verb can read.
- **`cursor` vocabulary is closed:** `discovery mockup intent design blueprint specification
  contract construction acceptance` — the ADR-040 rail ids as
  fixed by `gate-record-format.md`. A cursor on a gate id means the gate surface is being
  assembled or awaits the ruling.
- **`gates` status vocabulary is closed:** `pending | at-gate | passed`. `passed` requires
  `record:` naming the gate record path (the authoritative artifact); the runtime checks
  the file exists. Gates appear in rail order, all four always present — on a conducted
  surface; a maintenance surface has no `gates:` key at all.
  **`passed` is this surface's word only.** The gate record it names says `blessed` or
  `pending` (`gate-record-format.md`) — two surfaces, two words for the same fact. A conductor
  writing both in one session carried `passed` into two run-4 records and nothing read them for
  a whole run; `dossier-build` now refuses the word in a record by name (#837).
- **`open_items`:** ids `OI-###`, unique, ascending in file order. `severity` is
  `andon | normal`. An `andon` item is reported first by every `conduct boot` and blocks
  `theagent2 succeed` (a handover must not bury a blocking finding); `normal` items are
  reported, never blocking. **An item is raised by `theagent2 conduct open-item add`, and an
  andon is lowered by `theagent2 conduct clear` — neither by a hand edit** (see *Raising an
  item* and *Clearing an andon* below). Raising used to be the one write with no verb, so it
  was the one write with no validation: every other path goes through the atomic writer that
  checks the whole surface first, and a hand-appended item at the wrong indentation is what
  stopped a run's `state.yaml` parsing, with nothing noticing until an unrelated command
  died reading it (#1124). Items are removed when resolved — the state file indexes,
  history lives in issues/records (`ref`). Removal is `theagent2 conduct prune`, never a
  hand edit: it moves the item **verbatim** into `archive.yaml`, so removing costs nothing
  and loses nothing (see *The surface budget* below). An `andon` item is never archivable.
  Items are READ with `theagent2 conduct open-item list` — one headline line each, and the
  whole text of one item by id (`… list OI-###`) — rather than by re-reading this block: on
  a real run the block is 79 KB of prose re-read by every session at boot (#1316).
- **An item that claims work is under way NAMES THE SESSION (#791).** Write the ledger id
  (`S-###`) into the item's text — "SPECIFICATION IS OPEN (session S-014, test-engineer)" — and
  every `conduct boot` checks the claim against the ledger and the machine, annotating the
  item in place with `DEAD` / `ENDED` / `ALIVE` / `UNVERIFIABLE`. Without an id the item is
  prose nothing can check, and a killed session leaves it asserting live work forever: run
  4's OI-021 said the specification node was open for eighteen hours after the session was
  killed. This is
  a writing rule, not a schema field — the id may sit anywhere in the text.
- **An inbound ruling is persisted before it is acted on (#824).** A ruling, an
  authorization, or a standing conduct directive that arrives as a pane turn lands as an
  open item (or in the surface it governs — Q&A ledger, gate record) and is committed
  before the first act performed under it; commit order is the evidence, and the handover retro
  verifies it. The record restates what was asked INCLUDING the alternatives offered, what
  was answered, by whom and when, and what it authorizes or changes — an answer whose menu
  is nowhere on disk ("option 1 accepted") is not a decision record. Run 4 issued the same
  standing directive into three sessions' panes and it reached disk zero times. Like #791,
  a writing rule, not a schema field.
- **A handover names the next act (#824).** At every succession seam the surface carries
  one item that either states the successor's next act with the ref that authorizes it, or
  says in as many words that nothing proceeds without the Software Architect's direction.
  The boot protocol's final step acts on exactly this item — the successor resumes what
  disk authorizes and waits only when nothing does — so a surface silent on it puts the
  successor back to guessing at a gate boundary.
- **`goal`** (optional, #1218): the run's **standing goal** — one paragraph saying what the run
  is trying to achieve, dated, attributed, and marked as whose words it is. It sits **beside**
  the open items and never among them, because it is the one durable thing a run carries that is
  not item-shaped: measured on figaro on 2026-09-03, the run had 57 decisions in the Q&A ledger,
  162 issues in the tracker, 189 open items, 222 sessions in the ledger and a friction log — and
  no place at all for the goal every one of those items was supposed to serve. A change of goal
  therefore landed nowhere, and only became visible later as a contradiction between two items.
  Fields: `text` (non-empty), `source`, `on` (`YYYY-MM-DD`), `ref`, `by` (a ledger id).
  - **`source` vocabulary is closed:** `verbatim | reading`. `verbatim` is the **Software
    Architect's own words**, quoted; `reading` is the **conductor's paraphrase, standing until he
    confirms it**. The distinction is the point of the field, not a nicety: on the figaro run a
    conductor's paraphrase of an instruction contradicted the run's own answered Q&A entry and
    stood on the surface unchallenged, because nothing said it was a paraphrase. A goal field is
    a paraphrase until it is confirmed, so it says which it is — the same verbatim-versus-reading
    marking rulings already carry.
  - **`ref` is required when `source: verbatim`** — where he said it (a session record, an issue,
    the kickoff brief). Same rule and same reason as a `passed` gate naming its record: "these
    are his words" is a claim, and a claim with nothing behind it is one nobody can check. A
    `reading` needs no ref; it is the conductor's own sentence and is marked as such.
  - **Written by `theagent2 conduct goal set`, never by a hand edit** — the rule `open_items`
    learned in #1124. Re-authoring **replaces**: there is one current goal, and its history is in
    git. Seed it from the kickoff brief at the first succession and re-author it at each gate.
  - **It is injected at `SessionStart`, and only there.** Every session opened in the workstream
    gets it once, at no cost to the human, and `conduct boot` restates it under the run position.
    Deliberately **not** on `PostToolUse`: 218 figaro sessions made 12,891 tool calls, so a
    400-token paragraph on each is ≈5.2 M tokens across a run — and a line present on every tool
    call is a line nobody reads.
  - **Optional, and absent means silent.** A run with no goal reads and behaves exactly as it did
    before the field existed; that is why the field is additive and moved no format version.
  - **`on` is what makes the goal ASKABLE (#1219).** It is not a decoration: it is the day the
    goal was last put to the Software Architect, and every staleness judgement is measured from
    it. `theagent2 conduct goal confirm --ref <where>` re-dates it when he reads the goal back
    and says it still stands — a confirmed `reading` is recorded as `verbatim` at that moment,
    because a reading is defined as standing only **until** he confirms it, and `ref` names where
    he did. A **correction** is not a confirmation: it goes through `goal set`, which is how a
    pivot gets declared, dated and attributed instead of being discovered later. Nothing else
    about the field changed, and no reader owes a new value — a run whose goal is never confirmed
    reads exactly as it did before.
  - **`done_when` (optional, #1232): when the goal is REACHED.** A goal alone is a direction: it
    cannot be checked, and it cannot tell a session whether the act it is about to perform serves
    the goal or merely resembles it. `done_when` is the destination — an **ordered, FLAT list** of
    conditions, one line each, that sits under the goal it belongs to. Per condition: `text`
    (non-empty, ONE line, ≤ 160 characters), `source` (the same closed `verbatim | reading`
    vocabulary and the same `ref`-when-verbatim rule the goal itself obeys), `state`
    (`open | met`), `met` (`YYYY-MM-DD`, **required when `state: met`** and absent when open), and
    `ref`.
    - **Flat, never a tree.** No sub-conditions, no nesting: the run already carries four
      item-shaped registers (`qa.yaml`, the tracker, `open_items`, the ledger) for anything that
      needs decomposing, and a recursive goal tree is a structure nobody prunes. The whole value
      of `goal:` is that it is the one register a human reads in one breath — which is also why
      at most **10** conditions are accepted. A list longer than that is a work plan, and work is
      item-shaped; it is also the surface budget below, which the goal block spends from like
      everything else in this file.
    - **`met:` is a DAY, and the day is the mechanism.** A condition that went met *after* the
      goal was last put to the Software Architect is the fifth staleness signal of `goal check`
      (#1219) — and the most common thing that ever moves under a goal. Because it is dated, the
      signal goes quiet again once he has confirmed; an undated one would fire forever. The
      granularity is the same `YYYY-MM-DD` limitation the elapsed signal carries: a condition met
      on the same day the goal was last confirmed does not fire, and the elapsed signal picks it
      up two days later.
    - **The last condition going met means the goal is, on its own terms, REACHED.** Every reader
      is told so, and told that the successor goal is the Software Architect's to state, never a
      conductor's to infer. A run that walks past that moment is working towards a destination it
      has already arrived at.
    - **Written by `theagent2 conduct goal done-when add` and `… done-when met --which <n>`**,
      never by a hand edit — the `open_items` rule from #1124 again. `goal set --done-when "<one
      line>"` (repeatable) writes them with the goal, in the goal's own voice. `--which` is the
      1-based position the goal is rendered with, everywhere it is rendered. Re-authoring the goal
      **replaces** the list and says so: a condition belongs to the goal it checks.
    - **Restated with the goal wherever the goal is shown** — the `SessionStart` banner, `conduct
      boot`, `conduct goal`, and the confirm prompt. That is affordable exactly because the
      conditions are short by construction, and the construction is enforced rather than hoped
      for: one line, capped, at most ten. A confirmed goal adopts its conditions with it, since
      the prompt showed him both.
    - **Optional, and absent means silent.** A goal with no `done_when` reads, renders and
      behaves exactly as it did before the field existed; no format version moved.
  - **`assessed` (optional, #1822): the rulings that were READ and move no destination.** `goal
    check` names every ruling answered since the goal was last put to the Software Architect, and
    the commonest honest outcome of reading one is *"this changes nothing"*. The register had no
    way to say that: `confirm` claims **he** confirmed the goal, which he did not and was never
    asked to, and `set` rewrites his words over a ruling that moved none of them. So the conductor
    that did the honest thing left the trigger exactly as it found it, and the next conductor
    repeated the whole read — one `goal check`, then N answer files, to reach the same negative.
    Measured on the figaro run at three re-derivations of one four-relay negative, with the remedy
    reached for being prose in a next-act item: a fourth register for a fact the verb already
    computes (K-107), stale the moment a fifth relay is answered. Per assessment: `ruling` (the
    id, one token, never a sentence), `on` (`YYYY-MM-DD`), `by` (the ledger id of the session that
    assessed it), `ref` (where the reading rests), `note` (optional, ONE line, ≤ 200 characters),
    `goal_on` and `goal_digest` (the goal it was judged against).
    - **Silencing is not confirming, and `by` and `ref` are what keep them apart.** Both are
      **required**, unlike almost everything else optional on this surface: an assessment takes a
      name off the evidence line, and a suppression nobody can attribute is indistinguishable from
      the drift #1219 exists to catch. *"I read it and it changes nothing"* is a claim, and a claim
      with nothing behind it is one nobody can check — the same rule a `verbatim` goal's `ref`
      obeys.
    - **Nothing is ever destroyed.** The list is **appended** to, never replaced, and a second
      assessment of the same ruling lands beside the first rather than over it — two readings of
      one ruling are two facts, and the verb tells the second assessor who was first. What the
      assessment changes is what `goal check` NAMES, never what the surface remembers.
    - **And the check says it filtered.** Both answers of `goal check` — the one that still asks
      and the one that has nothing to ask — print the count of rulings that were not weighed and
      their ids. A subset the reader cannot see is the hand-picked subset again, wearing a
      machine's coat.
    - **`goal_digest` is the fingerprint of the goal TEXT it was judged against** (the first 12
      hex characters of its SHA-256). *"It moves no destination"* is a claim about one paragraph
      and may never be inherited by another, so a `goal set` — the verb a **pivot** is declared
      through — retires every standing assessment and names the ones it retired; a `goal confirm`
      does not, because the paragraph is written back unchanged and the destination did not move.
      In practice that retirement is belt-and-braces rather than routine, and it is worth knowing
      why: `goal set` re-dates the goal to the day of the pivot, and the ruling signals compare
      against that date, so every ruling answered before a pivot goes quiet by itself.
    - **Written by `theagent2 conduct goal assess --ruling <id> --ref <where>`** and read by
      `theagent2 conduct goal assessed`, never by a hand edit — the `open_items` rule from #1124
      again. Deliberately **not** in the `SessionStart` banner, unlike `done_when`: the conditions
      are injected everywhere because every session needs the destination to judge its own next
      act, while an assessment is bookkeeping about a trigger only a conductor ever reads, and a
      line every session pays for and one role uses is the shape this field's own register
      refuses.
    - **There is no cap on the count, deliberately.** A refusal at a ceiling would send a
      conductor back to the re-derivation the field exists to end. The list stops growing on its
      own at every `goal confirm`, which re-dates the goal and so silences every ruling answered
      before it; what is bounded instead is each entry, by the one-line `note`.
    - **Optional, and absent means silent.** A goal with no `assessed` reads, renders and behaves
      exactly as it did before the field existed; no format version moved.
- **`tracker`** (optional, #1222): the **labels this run sorts its issues by** — a blocking
  marker per gate and the label meaning *real, but not now*. The tracker is the register the
  Software Architect actually reads to judge progress, and on 2026-09-01 it was the only
  register a run kept with no structure at all: **82 open issues, 80 of them with no label**,
  no milestone, and no deferred state, while the factory's own tracker beside it held more
  than twice the open count and did not read as drowning, because it was sorted. So the
  number in front of him said eighty-two while the frontier that governed the gate was four
  red checks.
  - **Declared per run, never shipped by the toolchain.** The labels belong to whatever
    tracker the run uses; a hard-coded list would be describing somebody else's repository.
    `blocks-intent` above is an example, not a vocabulary. Declaring them does not create
    them: `gh label create` does, once.
  - **Every gate, and distinct.** `blocking` names a label for all four gates. A gate with no
    declared label reports "nothing blocks" for the one reason that nothing could ever be
    counted there, and silence reads as green; two gates sharing a label cannot say **which**
    gate an issue blocks, which is the only question the labels answer.
  - **An issue is TRIAGED when it carries one of the declared labels** — a gate's blocking
    marker, `deferred`, or one of the optional `states`. Everything else is untriaged, and
    untriaged is what the warning counts.
  - **Advisory, always.** `conduct boot` and `theagent2 conduct tracker` report *"N block the
    next gate"* instead of *"N open"* and warn about the untriaged remainder; **nothing
    blocks, nothing refuses, no gate check reads this field.** The measured failure was a
    human reading a counter that meant nothing, not a run that needed stopping.
  - **Written by `theagent2 conduct tracker set`, never by a hand edit** — the rule
    `open_items` learned in #1124 and `goal:` in #1218. Re-declaring **replaces**: the labels
    are a standing convention, not a history, and git holds the set the run had before.
  - **A conducted run's, and only a conducted run's.** Three of the four declared labels name
    gates, and a maintenance surface has none (#1152) — the block is refused there.
  - **Optional, and absent means silent.** A run that declares nothing boots exactly as it did
    before the field existed, makes no subprocess call, and pays nothing. No format version
    moved.
  - **What a gate record cites is the gate-blocking subset**, never the total —
    `gate-record-format.md`, *The issue evidence is the gate-blocking subset*.
    `theagent2 conduct tracker --gate <id>` prints it in the shape the record's conduct annex
    takes.
- **`tripwires` is NOT a field of this format** (#1563). It was one until 2026-09-12 and it
  is not any more: the paid-for traps live in the sibling file **`tripwires.yaml`**
  (`conduct-tripwires/2`) — see *The tripwires file* below for the format, and for why it
  moved. A state file that still carries the block is migrated by
  `theagent2 conduct migrate-state`, not refused; `conduct boot` says so until it is.
- **Small or wrong:** anything longer than a line of text belongs behind a `ref` path or
  an issue number. **100 lines is the budget** — `conduct boot` warns above it and
  `theagent2 succeed` refuses above it (see *The surface budget*).
- **YAML subset** (same regime as `qa-ledger-format.md`): two-space indentation, one field
  per line in the documented order, bare or double-quoted scalars, inline `{maps}` and
  `[lists]`, full-line and trailing `#` comments. The strict parser is the format
  validation.

## The tripwires file (`tripwires.yaml`, `conduct-tripwires/2`)

**The run's paid-for traps** (ADR-056 §1b): one line per trap — the issue number first (the
issue is the truth; the line indexes it), then the file or flag and the failure mode.
Appended when a trap is paid for, removed only when the trap is **structurally** removed,
never because a session survived it.

```yaml
format: conduct-tripwires/2
tripwires:
  # A BARE STRING IS UNTAGGED, AND AN UNTAGGED ENTRY IS IN EVERY BRIEF.
  - "#789: scaffold without the three in-clone root flags rewrites every csproj to point outside the clone"
  # A TAGGED ENTRY SAYS WHICH SESSIONS IT BINDS, AND BINDS NO OTHERS.
  - text: "#793: dotnet build fails on 'relativeworktrees' — EnableSourceControlManagerQueries=false"
    binds: ["role:implementor", "node:construction"]
```

`format` and `tripwires` are the only two keys, and an entry has `text` and `binds` and
nothing else — what an entry MEANS lives in its text. The file is **optional** — a run that
has met no trap has none — and it is **committed and greppable** like the rest of
`.theagent/conduct/`.

### The tags, and the four properties that bound them (#1824)

The line above — *"a brief pastes only the entries tagged for its role"* — was written in
the present tense on 2026-09-12 and was **not true**: entries were bare strings, there was
no tag in `conduct-tripwires/1`, and no selector existed anywhere. So a conductor either
pasted the whole corpus (≈14,000 tokens per dispatch on the figaro run: 55,888 B over ~35
entries, since the brief's TEXT became the child's first prompt) or chose by hand — and
choosing by hand dropped the one entry its own session was about to need **four times**,
once under the very words *"the ones that bind a session that … merges a pull request"*.

- **`binds` is a list of tags, and there are exactly two kinds.** `role:<slug>` and
  `node:<one of the nine rail ids, or maintenance>`. There is no third kind: an entry that
  binds one ACT says so in its own text, because no enumeration of acts exists to check a
  tag against and a vocabulary invented for this file would be one nobody could validate.
  `node:` values are checked against the node table — a typo there is a trap that silently
  binds nobody. `role:` values are checked for SHAPE only, never against a list, because the
  role table is open by construction (a dispatch may name a project-local agent).
- **ANY tag may match — the reading is OR, never AND.**
  `binds: ["role:devops", "node:construction"]` means *"this binds a devops session, and it
  binds anything on construction"*. Where two readings differ, this format takes the one
  that pastes MORE: an entry pasted into a brief that did not need it costs tokens, and an
  entry dropped from a brief that did costs what the entry documents.

**Four properties, none of them negotiable:**

1. **The default is INCLUDE.** An untagged entry goes into every brief, for ever, at no
   thought. A selection that names neither a role nor a node filters nothing at all.
2. **The child is TOLD it was filtered**, with both counts, in the composed section's first
   paragraph. A subset the reader cannot see is the hand-picked subset wearing a machine's
   coat.
3. **The version moved and the old file still parses.** A `conduct-tripwires/1` file is read
   as a corpus in which every entry is untagged — which by property 1 is byte-for-byte the
   behaviour it had before. `theagent2 conduct tripwires --migrate` moves the version (the
   format LINE and nothing else; `--check` says whether it is owed and writes nothing), and
   it is needed only when the first TAGGED entry is written.
4. **Classify no entry you do not understand.** Under-tagging is the safe error. Tagging is
   an editorial act on a run's own paid-for experience, performed by that run's conductor:
   **no verb writes a tag**, deliberately.

### Who pastes the section

**`theagent2 conduct dispatch --tripwires` composes the brief's `## Tripwires` section** from
this file: every untagged entry, plus those tagged for the dispatched role or node, with both
counts stated to the child, the conductor's own note under the heading kept, and every entry
VERBATIM. Without the flag nothing changes — the section is whatever the conductor wrote —
and the dispatch says once that the mechanism exists. `theagent2 conduct tripwires --role R
--node N` previews the same selection entry by entry, and `--section` prints what the child
would receive.

**Since Kaizen K-191 the composed section is an INDEX, as a trial** (the Software Architect's
letter «C» on relay R-689, 2026-10-01). The brief lists one headline per selected entry — its
first sentence, at most 200 characters — and the dispatch writes the full section, every entry
verbatim under `### n/m`, to **`briefs/<id>.tripwires.md`** beside the retained brief, in the
same dispatch commit. The child reads entry n with `theagent2 conduct tripwires --brief <id>
--entry <n|all>` from any directory: a `--cwd` workspace resolves the run through
`THEAGENT2_CONDUCT_ROOT`, which every workspace launch carries, so no brief names a path
outside its workspace (#553). Each open appends one line to `.theagent-run/tripwire-reads.jsonl`
(`at`, `brief`, `entry`, `by`, `bytes`) — the instrument of the trial's revert reading, which is
on K-191. `--tripwire-form full` keeps the shape above; flipping the default back is the revert.

**It also ends a contradiction a hand paste cannot resolve.** A workspace-bound brief may name
no absolute path outside the workspace (#553), and a trap's whole value is naming the tree it
bit. Pasted by hand, the rule *"paste the block verbatim"* and that fence cannot both be
obeyed — every `--cwd` brief of the run that raised this was forced to rewrite paths or choose
entries. Composed, the fence reads the brief the **conductor wrote** and the corpus is
appended after it, so a trap may say exactly where it bit.

**It lived in `state.yaml` until 2026-09-12, and it does not any more** (#1563). The reason
is a measurement, not a taste. The state file is cache-written by every conducted session at
boot and cache-read on every turn afterwards (#821), and on the figaro run this block was
**28,069 B of 72,284 B — 39 %** of that per-turn cost. Nothing read it from there:

1. It was never in the runtime's TypeScript shape. It sat in `STATE_KEY_ORDER` only so that a
   write put it back where it found it.
2. **A brief pastes only the entries tagged for its role**, not all of them (figaro `OI-856`,
   the Software Architect's letter «A» on relay R-159) — which became true with
   `conduct-tripwires/2` and `conduct dispatch --tripwires` (#1824) and was, when this
   paragraph was first written, a description of a mechanism that did not exist. So the whole
   list rode in every session's context for the sake of the two or three entries that
   session's brief had already quoted verbatim.

**Moving it changed no brief, no tagging, no index and no rule** — only where the composer
reads the entries from. What it must never change is one byte of one entry, because the
entries are pasted **verbatim** into a child's brief and a quote that has drifted is a child
walking into a trap the run already paid for. `theagent2 conduct migrate-state` therefore
MOVES LINES rather than re-emitting YAML, and refuses outright if a surface somehow has both
a block and a file — two homes for one list is the drift the move exists to end.

**Nothing reads this file at boot, on purpose.** Like `archive.yaml` it is the cold half of
the surface: it is read by whoever composes a dispatch brief, and by the checks.

## The surface budget and the prune (`archive.yaml`, `conduct-archive/2`)

**A conducted session pays for this file twice** — once as cache-write when it boots, then
again as cache-read on every turn it takes — and every session after it pays again. Run 4
measured the consequence: `state.yaml` grew 417 B → 123,906 B (281 lines, 66 open items),
nothing was ever removed, and at the end a ~60 KB file was on the order of 10 % of a
conductor's per-turn context (#821). Append-only had no counterpart; this is it.

- **The budget is 100 lines.** `conduct boot` reports the surface's size on every boot
  (bytes / lines / items, plus the archived count) and warns above the budget with the
  command that clears it. `theagent2 succeed` **refuses** above it.
- **`theagent2 conduct prune <ids…>`** archives exactly those items; **`--keep <ids>`**
  archives the complement — the shape a seam wants ("carry these four forward"). Items
  move byte-for-byte, the verb commits its own bookkeeping, and it refuses to archive an
  `andon` item (blocking by definition, so it never leaves the boot surface).
- **`theagent2 succeed --keep <ids>`** does the same prune inside the succession commit. On a
  maintenance surface the successor is stamped **`node: maintenance`** — the surface sits on no
  rail and has no cursor to take a node from, and since `conduct-ledger/3` the ledger has a value
  that says exactly that (#1154). `--node` still overrides, for the surface that knows which rail
  node its chore belongs to. It used to be **required** here, which meant naming a rail node for
  work that touched no rail: sixty-four rows of run 4's ledger read `node: construction` that way.
  Naming the carry set is also the acknowledgement that clears the budget: a surface whose
  items are all still live passes every id and hands over whole, deliberately and on the
  record. Silence above the budget is the only thing refused.
- **The judgement stays with the conductor** — which item is resolved is a content
  question this format already answered ("items are removed when resolved"). The runtime
  owns the mechanics that made obeying it unaffordable: the durable home, the verbatim
  move, the guard, and the measurement.

`archive.yaml` (`conduct-archive/2`) is a list of the pruned items in prune order, each
carrying its original `id`/`severity`/`text`/`ref` plus three stamps written on the way
out: `pruned` (`YYYY-MM-DD`), `at` (the cursor at the seam), and `by` (the pruning
session's ledger id, when known). `at` is **omitted on a maintenance surface**, which has no
cursor to stamp — that relaxation is why the archive moved to `conduct-archive/2` rather than
being quietly widened (#1152). The file is committed, so history is recoverable from it
directly as well as from git.

**The archive's key is the pair `id` + `id_reuse`, not the id alone (#1427).** Normally an id
appears once and `id_reuse` is absent — that is every entry in every archive written before
this rule, so nothing migrates and absence *means* "first holder". But one `OI-###` can name
two DIFFERENT items: the allocator read only the live surface until #1309, so a pruned id was
handed straight back, four times on run figaro/adoption. Archiving the live twin of such a
pair used to be impossible — it appended a second entry under an id the archive held and the
validator refused it, so each pair needed a permanent `DO NOT PRUNE` guard item beside it, and
the eight rows were 21.3 % of that run's item surface, re-read on every request of every
session. Now the second holder is archived beside the first as `id_reuse: 2`, the third as
`id_reuse: 3`, and:

- **No id is ever renumbered**, live or archived — commit messages, other items' `ref:` lines
  and session records cite those strings, and a register that renames what history points at
  is not an archive. A `grep OI-376` still lands on both entries.
- **`id_reuse` is a whole number ≥ 2**; the first holder omits it, so each holder has exactly
  one encoding and a duplicate cannot hide behind `id_reuse: 1`.
- **The same entry twice is still refused** — `OI-376 is archived twice`, unchanged. What the
  pair narrows is the rule, not its teeth: only a *different* item may share an id.
- `prune` says so on stdout when it happens, because the `DO NOT PRUNE` guard item that stood
  for the collision is spent the moment the twin is archived.
- **The version does not move**, and that is the deliberate half. A version bump is owed when a
  file's meaning changes under a reader — but every archive on disk is unchanged by this rule
  (no entry gains a field it did not have), and bumping would make the *ordinary* archive of
  *every* run unreadable to a binary one release behind, to describe a shape only a colliding
  run ever writes. The forward direction is stated rather than hidden: an older binary reading
  an archive that DOES carry `id_reuse` refuses it as `OI-nnn is archived twice`, which is the
  same refusal it gave before and a fair report of a file it cannot represent.

```yaml
format: conduct-archive/2
items:
  - id: OI-026
    severity: normal
    text: "RESOLVED 2026-08-20 by the SA route ruling …"
    ref: ".theagent/conduct/sessions/S-018.md"
    pruned: 2026-08-21
    at: contract
    by: S-025
  - id: OI-376                       # a SECOND, different item under one id (#1427):
    id_reuse: 2                      # the twin the pre-#1309 allocator minted
    severity: normal
    text: "RESOLVED — the live twin of the archived OI-376"
    pruned: 2026-09-10
    at: construction
    by: S-1102
```

## Raising an item (`theagent2 conduct open-item add`, #1124)

```
theagent2 conduct open-item add --severity andon|normal --text "<what is open>" [--ref <where>]
```

**There is no `--id`.** Ids must be strictly ascending, and an id a human types is exactly how
that rule gets broken; the runtime knows the highest one the surface carries and assigns the
next. `--severity` is the closed vocabulary for the same reason.

The verb **does not commit**, unlike `clear`, `prune` and `dispatch`. Those three commit
because their whole point is a transition an auditor must be able to place in the run. Raising
an item is the ordinary bookkeeping of a session in the middle of doing something else; the
session commits it with the work it belongs to.

It refuses on an already-unparseable surface rather than appending to it. That state is a
conductor's repair, and #1067 made the identity lookup survive it so the repair can be
committed by whoever makes it.

## Clearing an andon (`theagent2 conduct clear`, #807)

An `andon` is the one severity the surface had no way out of. `prune` refuses it by design
("a blocking finding never leaves the boot surface"), `succeed` refuses while one stands,
and no verb performed the demotion prune's own refusal asked for — so the transition
happened as a hand edit, and only when the tooling finally forced it. Run 4 measured the
latency: the ruling resolving OI-026 was recorded at 20:43 and the one lifting OI-030 at
21:26; both `severity: andon` lines came off in a single commit at 22:31, at the succession
seam, because `theagent2 succeed` would not run. For that hour the committed surface told a
booting successor that the run was stopped while it was running — the mirror image of #791.

- **`theagent2 conduct clear <ids…> --ref <where the resolution is recorded>`** lowers the
  named andon items to `normal` and rewrites each `text` as
  `RESOLVED <date> by <ledger-id> per <ref> — <original text>` (the form this format's own
  archive example already uses). It refuses a missing `--ref` (an andon lowered without a
  reference is a blocking finding that vanished), a non-andon id (that is `prune`'s job), an
  unknown id, and a dirty `.theagent/conduct/`; it commits its own bookkeeping. `--by`
  defaults to `$THEAGENT2_LEDGER_ENTRY`.
- **Clearing lowers; it does not remove.** The andon is what blocked. Whether the remaining
  text still earns its place on the boot surface is the separate question `prune` answers.
- **The judgement stays with the conductor** — same split as the prune: which item is
  resolved is a content question, and the runtime owns only that the transition is one
  command, is stamped, and can therefore be prompted for.
- **`conduct boot` prompts for it.** Under each standing andon it reports how long the item
  has stood (from the committed history of `state.yaml` — no format field, no hand
  discipline) and names every open item whose text mentions the andon's id, with the exact
  clear command. Run 4's resolving rulings named their blocker verbatim ("resolving OI-026",
  "lifting the OI-030 breach hold") while the andon sat one line above, still blocking.
  `theagent2 succeed`'s refusal names the same command.

## The session records (`sessions/S-###.md`)

The handover retro (ADR-056 §5) distills each ended session into `sessions/<ledger-id>.md` —
prose, not YAML, but with three required headings so successors can scan them:
`## What happened`, `## Decisions & rulings` (each with where it was persisted),
`## Open at exit`. The runtime checks the three are present (a heading may carry a
parenthetical after the required text) and that the filename names a ledger entry;
`conduct ledger mark-retro` refuses outright while the record is absent — a retro that
left nothing behind is not done (#776). This realizes ADR-001's run-end reflection pass in part: the distilled
record is the promoted episodic memory; the raw transcript is read exactly once (by the handover retro,
via the pre-filter) and archived at run end (ADR-056 §7).

## The check (`theagent2` runtime)

```sh
theagent2 conduct boot       # validates state + ledger + the metrics/ and sessions/ surfaces,
                             # acquires the lock, reports position, what is unmeasured, and
                             # the size of the surface it just read
theagent2 succeed            # refuses unless state + ledger are valid AND committed AND within
                             # the line budget; --keep <ids> prunes the rest on the way through
theagent2 conduct goal       # print the run's standing goal (#1218); `goal set` writes it —
                             # --source verbatim (his words, --ref required) | reading (yours)
theagent2 conduct goal assess # a ruling was READ and moves no destination (#1822) — the third
                             # write, and the answer `goal check` had no way to take. Silencing
                             # is not confirming: it names the session, never him, destroys
                             # nothing, and `goal assessed` shows every one with its author
theagent2 conduct goal check # is the goal stale enough to spend one word of the Software
                             # Architect's attention on (#1219)? exit 0 no, 1 yes, 2 no goal;
                             # `goal confirm --ref <where>` records the word he answers with
theagent2 conduct goal done-when add --text "<one line>" --source reading
                             # when the goal is REACHED (#1232) — a flat, ordered list under it
theagent2 conduct goal done-when met --which 2
                             # condition 2 is reached today; the DAY is what puts the goal back
                             # to him at the next succession
theagent2 conduct tracker    # the open issues by this run's DECLARED labels (#1222): "N block
                             # the next gate", the deferred count, and a WARNING naming the
                             # issues with no triage state. Exits 0 whatever it finds — it
                             # reports, it never gates. `--gate <id>` prints that gate's
                             # blocking subset in the shape a gate record cites
theagent2 conduct tracker set --blocking intent=blocks-intent … --deferred deferred
                             # declare the labels once; every gate needs one, and the four
                             # must be distinct
theagent2 conduct clear      # lower resolved andon item(s) to normal, stamped RESOLVED with
                             # the reference that resolves them, and commit
theagent2 conduct prune      # move resolved items verbatim to archive.yaml and commit;
                             # <ids…> archives those, --keep <ids> archives the complement
theagent2 conduct dispatch   # ledger append + brief lint + launch; refuses while a
                             # required ADR-056 §1b brief section is missing, and refuses
                             # outright against a CLOSED surface (#1152)
theagent2 conduct close      # record that a run is finished: status + the closure stamp, and
                             # commit. --ref is required; there is no reopen
theagent2 conduct init --kind maintenance
                             # stand up a surface that records sessions and owns no gates
theagent2 conduct migrate-state
                             # conduct-state/2 -> /3 (and conduct-archive/1 -> /2) over every
                             # surface a workstream carries, AND the tripwires: block out to
                             # tripwires.yaml (conduct-tripwires/1, #1563 — that step is
                             # version-independent, because the key was never in this format's
                             # shape; `conduct tripwires --migrate` moves that file to /2 when
                             # its first TAGGED entry is written, #1824). Idempotent, line-by-line, and it never changes a value
                             # or a byte of a trap — a finished run is recorded finished by
                             # `conduct close`, which is a judgement with a reference behind it
```

There is no separate checker script: the runtime that consumes the file is the validator
(fail-closed — an invalid surface refuses boot with a diagnostic, exit 1).

## Consumers

- **`theagent2 conduct boot`** — the successor's first act (ADR-056 §3).
- **`theagent2 succeed`** — the currency-and-committed gate (ADR-056 §4).
- **The `SessionStart` hook** — reads `goal` and opens every session in the workstream with it,
  `done_when` conditions included (#1218, #1232). It reads the goal **leniently**, exactly as
  `readRunSlug` reads the slug: a session
  most needs to know what the run is for in the moment its surface is broken, because that is the
  moment it is repairing it. A banner never fails on the file; the verbs that act on it still do.
  For a **conductor's** session — and no other — the same hook adds the one-line confirm when the
  goal has gone stale (#1219): a conductor opening a session is a succession, and a succession is
  where the goal is put back to him — including when a `done_when` condition has gone met since he
  last saw it (#1232). It tells the conductor to ask; the asking is the conductor's
  own turn, because a hook cannot hold a dialogue and must never block one.
- **The retro agent** — the handover retro writes andon items on critical leaks; the stage retro reads open items per
  stage (ADR-056 §5).
- **The conduct skill** — verifies the index against issues and gate records at boot
  (semantic check; the runtime does the mechanical one).
- **`dossier-build`** (the `gate-dossier` skill, ADR-051) — reads `gates[].record` to decide
  which gate dossiers the conduct annex is standing on: the gates THIS run crossed, and not a
  historical rail's (#850). A second reader of that field — a `passed` row that forgets its
  `record:` now also loses the gate's annex placeholder.
