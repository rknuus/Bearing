# The Session Metrics format (`session-metrics/3`)

**Status:** the format spec ADR-056 §7 owes — the single source for the run's numbers.
The metrics pipeline (transcripts → ledger attribution → per-session rows → per-node
aggregates → the run dataset) is defined by ADR-056 §7; this note fixes the row shapes.

## Purpose

A conducted run must yield its own numbers — cost, time, tokens per stage and role — for
project retrospection and for external presentation of the run. Nothing extra is
instrumented: session transcripts already record per-message token usage and timestamps;
the conduct ledger (`conduct-ledger/3`) keys every session to node + role + model. Two
row kinds live under **`.theagent/conduct/metrics/`** (committed):

- **`<S-###>.yaml`** — one per ended session, emitted by **`theagent2 conduct ledger close`**
  from the transcript pre-filter's `--usage-summary` output (kind `session`);
- **`node-<rail>.yaml`** — one per rail node, assembled by the stage retro at the gate
  (kind `node`) and **re-summed afterwards by `theagent2 conduct metrics restate`**
  (#834, below); the same numbers feed the gate dossier's conduct annex (ADR-051).

Costs are always **estimates at list price** and say so — the pipeline never sees billing
truth, and pretending otherwise would poison the 8c-metrics tradition of honest ratios.

## Shape (by example — illustrative)

```yaml
format: session-metrics/3
kind: session

session: S-012                     # conduct-ledger/3 entry id — the attribution key
role: architect
node: design                       # the ledger's stamp: a rail id, or `maintenance` (#1154)
model: claude-opus-5               # from the transcript, verified against the ledger
effort: high                       # optional: the `claude --effort` level the launch carried (#1220);
                                   # absent means the launch named none — never that it was low
narrowed: "window 200000 of the 1000000 a dispatched session gets — a handover retro reads one transcript"
                                   # optional: the run-wide policy this session ran below, in the
                                   # narrowing verb's own words; copied from the ledger entry
tokens:
  input: 1841203                   # non-cache input
  output: 96410
  cache_read: 40210554
  cache_write: 2210890
cost_usd: { estimate: 41.20, basis: list-price, prices: 2026-08 }   # prices = price-table version
time: { wall_minutes: 190, active_minutes: 122 }   # active = gaps > 5 min excluded
counts: { messages: 214, tool_calls: 151, dispatches: 3 }   # sessions + subagents dispatched
                                   # `messages` is also what the session-length band is read
                                   # against (#1418) — see the rule below
dispatched: [S-013, S-015]         # the ledger children the count rests on; omitted when none
subagents:                         # the in-process Task/Agent children; omitted when none
  - agent: 3f9a1c2                 # Claude Code's agent id (its transcript's filename)
    model: claude-sonnet-5         # what it ACTUALLY ran, read from its own transcript
    off_entry: true                # present only when that contradicts the entry's `model:`
    messages: 46
    tokens: { input: 12040, output: 8110, cache_read: 220400, cache_write: 15200 }
    cost_usd: 1.42                 # list price, from the same table; or the literal `unmeasured`
source: transcript-prefilter/1 + conduct-ledger/3   # every producer of the numbers above
```

```yaml
format: session-metrics/3
kind: node

node: design
sessions: [S-011, S-012, S-014]    # every ledger entry attributed to the node
by_role:                           # one row per role seen at the node
  # subagent_cost_usd = what this role's in-process Task/Agent children spent (#1070);
  # `cost_usd` stays the sessions' own turns, and the two are added in total_cost_usd
  conductor:  { cost_usd: 12.10, subagent_cost_usd: 0.00,  wall_minutes: 310, output_tokens: 51204 }
  architect:  { cost_usd: 68.90, subagent_cost_usd: 21.40, wall_minutes: 402, output_tokens: 204110 }
  retro:      { cost_usd: 1.80,  subagent_cost_usd: 0.00,  wall_minutes: 12,  output_tokens: 8110 }
totals: { cost_usd: 82.80, subagent_cost_usd: 21.40, total_cost_usd: 104.20, wall_minutes: 724, output_tokens: 263424 }
rework: { redispatches: 2, bounced_checks: 1 }     # stage-retro-counted, from issues + handover records
friction: 3                        # friction-log entries attributed to the node
downtime:                          # one entry per interval the RUN could not act; omit when none
  - minutes: 16
    window: "2026-08-21T01:44Z (last message) -> 02:00Z (ledger `ended`)"
    cause: "#830 - the role-guard brick; alive, lock held, unable to act"
    attribution: tooling           # tooling | conduct | human | external | capacity
  - minutes: 241
    window: "2026-09-17T02:19Z (start INFERRED, not stamped) -> 2026-09-17T06:20Z (end)"
    cause: "account out of capacity - the spend limit stopped every session where it stood"
    attribution: capacity          # written by `theagent2 conduct metrics downtime`
```

## Rules (checker-enforced)

- `format` is the first line; validators match name and version only (ADR-051 §4).
  `kind` is second: `session | stage` — closed set.
- **Session rows:** `session` must name an existing `conduct-ledger/3` entry; one row per
  entry (`metrics/<S-###>.yaml`), written once at close — a correction replaces the file in
  a reviewed commit, there is no append semantics here. All four token counters present
  (zero when the transcript lacks a kind). `cost_usd.basis` is always `list-price`;
  `prices` names the price-table version of the tool that computed it.
- **Node rows:** `sessions` lists every ledger entry with that `node` — the runtime
  cross-checks completeness against the ledger; a session missing from its node row is
  an error (silent undercounting reads as cheapness).
- **A session row's `node` may be `maintenance`; a node row's may not** (`session-metrics/3`,
  #1154). A session row copies the ledger's stamp and the runtime refuses a row that disagrees
  with it, so the two vocabularies have to match. A `node-<rail>.yaml` is a different object: a
  rail node's gate-frozen arithmetic, and a maintenance surface (#1152) has no gate to freeze one
  at. Nothing rolls maintenance work up — it has no stage cost to price — so no
  `node-maintenance.yaml` exists and none is owed.
  The bump is what ends a verdict nobody could clear: until it, a chore sweep dispatched onto a
  surface with no cursor was stamped with a rail node anyway, and `conduct boot` read the result
  back as `GAP node rows undercount the ledger: construction omits …` over fifty-four sessions
  that do not belong to Construction and never will. Move a surface with
  `theagent2 conduct migrate-ledger` (see `conduct-ledger-format.md`).
- **A node row is complete by ledger STAMP, and the gate annex is complete by ARC** (#790).
  A `conduct-ledger/3` `node` is fixed when the entry is minted and is never re-stamped, so
  a session that outlives its rail node keeps booking to where it was born: Run 4's S-007 was
  stamped `intent`, conducted the end of Design and the opening of Specification, and its
  $18.21 sits in `node-intent.yaml`. The remedy is NOT to widen what a node row may list — that check is
  what makes the row evidence, and a row that could list anything would price nothing. It is
  the ledger's optional late-written `arc`, which names the gate a session **served**. So:
  - node rows are untouched by this field. `sessions` still means "every entry the ledger
    stamps with this node", `restatement` still sums exactly those, and no arc mark ever
    moves a dollar between node rows;
  - the gate arc is read separately with `theagent2 conduct metrics arc <gate>`, which splits
    the arc into the sessions the stamp already covers and those stamped elsewhere, prices
    each from its own session row, and names the unmeasured rather than counting them as
    $0.00. Nothing is written and nothing is double-counted: an adjacent session's cost stays
    in its own node row and is only *shown* beside the gate it served.
  Run 4's Acceptance stage retro had to hand-write that second half as an `adjacent_work:` block in
  `metrics/node-construction.yaml`, having found that its own dispatch brief named three sessions as
  construction work that the ledger stamps `contract`, `specification` and `acceptance`. A
  hand-written block is still legal prose on a node row; it is no longer the only place the
  split can live.
- **A node row says what it rests on, and is re-summed when that changes.** The stage retro
  assembles the row at the gate exit and is dispatched by the conductor that ran that
  gate, *while that conductor is still live* — so the gate's most expensive session is
  `unmeasured` in the row that prices its own node, every time, by construction (#834).
  Neither side can move: the stage retro runs at the gate (ADR-056 §5) and the conductor must not
  end before the gate is recorded. So the row is not the last word:
  - `measured_subtotal.sessions` — the sessions the hand-written numbers rest on. It is
    optional (a row may simply cover everything it lists) but it is what staleness is
    measured against; `coverage.metrics_rows: 0` says the same thing for a row that rests
    on nothing. Every id must also appear under `sessions`, or the row is REFUSED.
  - `restatement:` — **machine-owned**, appended after the stage retro's prose and rewritten in
    place, never merged into it. It carries `measured`, `added`, `unmeasured`, `by_role`
    and `totals` summed over the session rows that exist now — each of those in the three
    cost terms of the rule below (`cost_usd`, `subagent_cost_usd`, `total_cost_usd`).
    Nothing is derived here and no price table lives here: it is arithmetic over
    `kind: session` rows.
  `conduct ledger close` and `conduct ledger measure` restate the stages they touch, so
  the gate conductor's own close is what closes its own gate's numbers — the one moment
  that is guaranteed to arrive even at the last gate of a run, which has no successor to
  amend anything. Restating **discharges no retro debt**: a cost row is not a handover
  audit, and the handover retro owed on those sessions is still owed (ADR-056 §5).
- **Downtime is a stage field, and it never sums into one integer** (#835). An interval in
  which the run held the conduct lock and could not act belongs to no session row: a session
  row measures a session, and this is the *absence* of one — the tokens stop, so the
  pre-filter has nothing to sum, and the interval falls between a session's last message and
  its `ended` stamp, a hole invisible to every consumer of the format. The same hole swallows
  a session waiting to be killed, a session waiting on the lock, an orphaned child whose
  dispatcher crashed, and any wall-clock stall between one session ending and its successor
  booting. Run 4's construction node lost 16 of its 100 elapsed minutes that way and the cost table
  showed them as free. So `downtime` is a **list**, one entry per interval, each carrying
  `minutes` (non-negative), `window` (the interval in words, both ends named), `cause` (what
  made the run unable to act, naming the issue where there is one) and `attribution` — a
  closed set: `tooling | conduct | human | external | capacity`. The attribution matters as much as the
  minutes: downtime caused by a tool defect and downtime caused by waiting on a human are
  different findings, and one total would merge them into a number that means nothing. The
  field is optional (most stages have none) and nothing here invents a denominator,
  an availability percentage or a target for it.
  **`capacity` is the fifth member** (K-116): the model account hits its spend limit, every
  session dies where it stands, and nothing can run until the reset. Measured at 573 of 2,760
  minutes — 21 % — of one 46-hour window, which makes it the largest single term this register
  carries. It is deliberately not `external`: `external` names something outside the run's
  machinery and outside its people that FAILED and that somebody must act on, while a capacity
  stop is a cost the Software Architect has ruled accepted. Merging an accepted cost into the
  same integer as an unaccepted failure is exactly what per-interval attribution exists to
  prevent. A row carrying `capacity` is refused by any toolchain older than this rule, which is
  loud rather than silent, and is the price of widening the set.
- **The write path is `theagent2 conduct metrics downtime`**, and it is the only one. The field
  is the stage retro's to author at a gate from ledger timestamps and handover records, and it
  is the conductor's to stamp the moment an outage ends — the verb serves both, takes a start,
  an end, a `--cause` and an `--attribution`, and appends the interval above the machine-owned
  restatement block without touching the retro's prose. `--inferred-start` marks a start that
  was estimated rather than stamped, in the interval's own `window`: an outage is noticed at its
  END, and an inferred start that does not say so reads as measured. Nothing else may write this
  field — before the verb existed the only mechanism was hand-editing a node row, and one
  241-minute stop was consequently recorded three times, in three shapes, in three places, where
  no consumer could read any of them.
- **`restatement.totals` carries `downtime_minutes`** — the row's own `downtime:` list, summed.
  It is NOT inside `wall_minutes` and nothing subtracts it: a session row measures a session and
  an outage is the *absence* of one, so an outage that killed every session is in no session's
  span and cannot be taken out of a sum of session spans. It is published beside the sums so a
  reader dividing by the node's ELAPSED calendar span — the only clock the outage is inside —
  has the term without going back to the row. No percentage is derived from it, here or anywhere.
- **`effort:` and `narrowed:` are ATTRIBUTION, optional, and copied from the ledger** (#1220).
  `session-metrics/3` recorded `model:` and the ledger recorded `model:`/`launch:`, and neither
  recorded the reasoning-effort tier — so a run could not answer whether a session ran at `high`
  or at `max`. The Software Architect moved this programme from `max` to `high` on 2026-08-30
  (*"most of the time, high would probably be good enough — probably even better"*) and no row
  in any run could measure whether that held; a claim either way would have been unevidenced.
  Both fields are **additive**: a row written before they existed stays valid, and so does a row
  whose entry carries neither. What is refused is a row that STATES one and disagrees with the
  ledger entry — the same rule `role`/`node`/`model` live under, because these are the launch's
  facts and not the row's. An absent `effort` means the launch named no level; it never means
  the level was low, and nothing may default it.
  `narrowed:` is the third half of the same finding: **where a verb narrows a run-wide policy for
  one session, the narrowing is recorded where the session is priced.** `theagent2 conduct retro`
  narrows the window every time — a handover retro reads one transcript, so it runs at 200 000
  where a dispatched session gets 1 000 000 — and on the Figaro run of 2026-09-01 that narrowing
  was reported only as prose in one open item (`OI-150`), which no reader of the ledger or of a
  metrics row ever sees. One line, free text, written by the narrowing verb at append time. It is
  a STATEMENT, not a permission: nothing reads it to relax a check.
- **Derived, never authored:** session-row numbers come from the pre-filter's usage
  summary; hand-edited numbers are indistinguishable from lies. The `source` field names
  every producer so a reader can regenerate. Because they are derived, no agent takes them:
  `close` runs the pre-filter itself (#819). Attribution — `role`, `stage`, `model` — comes
  from the ledger entry; every number comes from the transcript, except the one below.
- **`dispatches` is counted from the ledger, not from the transcript** (#838). A conductor
  does not dispatch with a tool the transcript names: it opens a detached tmux window or
  runs `claude -p`, and both are `Bash` calls, so a transcript-only count of `Task`/`Agent`
  spawns is 0 for every conductor row by construction. Run 4's conductors show 35 ledger
  sessions between them and measured as orchestrating nothing — the field was the only
  orchestration-volume signal in this format and it was a constant zero, so every
  reviewed-vs-produced or orchestration-overhead ratio built on it was built on nothing.
  The ledger already holds the truth and cannot be fooled by which tool was used: a
  dispatch is an entry whose `parent` is this session. So `dispatches` = those ledger
  children **plus** the pre-filter's in-process `Task`/`Agent` spawns, which get no ledger
  id (an architect's blind peer review is a real dispatch) and can never be the same event.
  `dispatched:` lists the ledger children by id — optional, present only when there are
  any, and it may be shorter than the count for exactly that reason. Both inputs are
  derived, so the rule above still holds; `source` names both. The row is written at close,
  by which time every child is already appended (the ledger append happens *at* dispatch),
  and a predecessor measured at its successor's boot counts that succession as the dispatch
  it was.
- **`counts.messages` is the number the SESSION-LENGTH BAND is read against** (#1418). Cost
  per message rises with session length, superlinearly: measured across 915 costed sessions,
  **$0.060** below 50 messages, **$0.072** at 50–149, **$0.105** at 150–299, **$0.142** at
  300+. The stated design target for a stage session is therefore the **~50–149-message
  band**, and **the floor is as much the point as the ceiling** — below 50 the saving is
  $0.012/message against a full boot of $1.01–$3.53, and 207 of those 915 sessions already
  sat there, so a naive "shorter is cheaper" rule would manufacture a failure this run does
  not have. **`role: retro` is exempt**: 458 of the 915 sessions are handover retros at
  $2.87 each, the cheapest thing the process does.
  The band **states, it never refuses**. `theagent2 conduct ledger close` (and `ledger
  measure`) prints one line saying where a session landed, at the moment it is priced, for
  sizing the NEXT one; nothing blocks on it and nothing warns mid-flight. If only one
  trigger is ever built it is the cost andon (`conduct-ledger/3`, #1416), because cumulative
  `cache_read` is the billed quantity and a message count is only a proxy for it.
  The figures above are #943's, **re-read rather than re-derived**, and they carry that
  issue's two caveats: the dataset predates the three cost levers of 2026-09-09 (the
  absolute $/message numbers will shift down; the SHAPE, driven by cache-read re-reading, is
  untouched by them), and two denominators are in circulation for the same run
  ($9,689.72/915 against $7,134/886), neither yet declared authoritative.
- **`subagents:` records what the in-process children ran on** (#1066). `dispatches` counts
  the `Task`/`Agent` spawns; nothing recorded *what they were*, and that is the hole a gate
  falls into. Every model control in this process is per SESSION — a ledger entry mandates
  `model:`, the birth assert checks the transcript against it, `measure` refuses a
  contradicting row — and a sub-agent has no ledger entry, so there is no field to assert
  against it. Figaro's Stage-C architect (entry `claude-opus-5`, correct the whole way
  through) lost its first ADR-015 blind reviewer to a spend limit at 23:44, re-dispatched on
  `sonnet`, and completed three review rounds there including the ACCEPT that closed the
  stage's review chain — against a run policy that excluded Sonnet in as many words. The
  ledger was right, the andon was quiet, `reviews.md` headed all eight rounds identically,
  and the substitution was found only because the `model` key happened to survive the
  transcript pre-filter's payload clipping. An ADR-015 blind peer review is a real dispatch
  producing evidence a gate cites, and its reviewer was the one agent in the run with no
  ledger entry, no row and no recorded model.
  Nothing new is instrumented: a sub-agent's transcript is a sibling `agent-<id>.jsonl`
  beside the session's own, carrying the parent's `sessionId` and its own model, so the
  block is derived like every other number here. Per entry: `agent` (unique in the list),
  `model` (**required** — the whole point; `unknown` when the sub-agent never took a turn),
  `off_entry: true` **only** when the model contradicts the entry's (a window suffix is not
  a contradiction, #1052), `messages`, optional `tokens`, and `cost_usd` — a list-price
  estimate **or the literal `unmeasured`**, never a silent zero.
  **`cost_usd` at the row's top level does not include them**, deliberately: that number
  means "what the pre-filter summed over the session's own transcript" in the node rows,
  the restatement arithmetic, the gate dossier's conduct annex and the boot coverage line,
  and quietly widening it would move all of those with nothing saying so. Sub-agent spend is
  stated per child, and summed deliberately by the rule below.
- **Sub-agent spend is ADDED to every total that reads as "what this cost", as its own named
  term** (#1070). The per-child numbers existed from the paragraph above and nothing summed
  them, so a session that dispatched heavily measured as cheap: a Stage-C fixture with three
  blind review rounds reported $0.09 while its children cost $0.44 — five times the measured
  spend, outside every total, under a line that said *every ended session measured*. The two
  candidate fixes are not equal. Folding the children into the row's `cost_usd` gives one
  number whose meaning changed silently, and a run's cost figures are what the Software
  Architect presents outside the room — a figure that means one thing this run and another
  thing next run cannot be compared to itself. So the row keeps its meaning and the totals
  carry two terms:
  - **node rows** — the machine-owned `restatement:` block carries `subagent_cost_usd` and
    `total_cost_usd` beside `cost_usd`, per role and in the totals, plus `subagent_unpriced`
    when the price table could not price a child (both sums are then a FLOOR, and an unpriced
    child is counted nowhere — never as $0.00);
  - **`conduct metrics arc`** — the gate arc prices its members the same way, split stated;
  - **the boot coverage line** — `metrics: n/m ended sessions measured — $X` is the run's
    spend, sub-agents included, and the `sub-agents:` line beside it says which part of $X is
    theirs so a reader can still tie the number to a session row;
  - **the gate dossier's conduct annex** (ADR-051, `gate-record-format.md`) — a
    `subagent_cost_usd` on `by_role[]` and `totals`, its own column, the sum under the table.
  The annex field is optional, because a gate crossed before the field existed cannot carry
  it — but the dossier says so in words rather than leaving a blank cost cell, which is read
  as zero. Nothing here re-derives anything: these are sums over the `subagents[].cost_usd`
  values the rows already carry.
  The block **records; it does not refuse.** The model policy is work-relative (#1041/#1068)
  — design, review and conduct work never below the second tier, code and tools free to sit
  lower — so the same model is correct for an architect's mechanical helper and wrong for its
  blind peer reviewer, and a derived row cannot tell those apart. Making the substitution *impossible*
  rather than merely visible is #1068.
- **A succession is measured by the ENDER, which is the first instant the row is true**
  (#1677). `theagent2 succeed` writes the predecessor's `ended` while that predecessor is
  still writing its goodbye turns — the verb runs as a tool call inside that very turn — so a
  row derived there, or at the successor's boot seconds later, would freeze an undercount
  into a write-once file. The ender that `succeed` starts on the predecessor's pane waits for
  the turn to end and then VERIFIES the session is gone; only after that does it derive the
  row. Until this was wired, an outgoing conductor was the one role nothing measured: five
  consecutive conductors of one run closed at $0.00, each bill found a watch late by its
  successor's `GAP no metrics row` line, one of them the most expensive row of its window.
  The paths the ender does not cover stay exactly as they were — a predecessor whose pane is
  already gone is measured by `succeed` itself (its transcript is already final), and a
  predecessor kept alive with `--keep-predecessor`, or one whose ender gives up, is a `GAP` at
  the successor's boot and is filled by `theagent2 conduct ledger measure <S-###>`. A row that
  cannot be derived never fails the succession: a missing row is recoverable, a run with no
  conductor is not.
- **Measurement never blocks a close.** A session with no bound transcript, an empty
  transcript, a transcript whose model contradicts the ledger, or a model the price table
  does not know closes anyway and states which of those it was. The row is then owed, and
  `conduct boot` counts it as a gap — an unmeasured session that says so is honest; one
  that closes silently is the $0.00 this format exists to prevent.
- **YAML subset** as in `conduct-state-format.md`; the strict parser is the format
  validation.

## The check (`theagent2` runtime + pre-filter)

```sh
theagent2 conduct ledger close <S-###>
                                  # records `ended` AND derives metrics/<S-###>.yaml from
                                  # the bound transcript — every dispatched session passes
                                  # here, which is why the row lives here (#819)
theagent2 conduct ledger measure <S-###> | --all
                                  # the backfill: derive the rows still missing (after a
                                  # late `ledger bind`, or for sessions closed before this
                                  # was a close-time side effect). Idempotent; write-once
node .claude/skills/conduct/bin/transcript-prefilter.mjs <transcript.jsonl> --usage-summary
                                  # the mechanical numbers both verbs above turn into a row.
                                  # THAT path, from the conducted checkout — a plugin-cache or
                                  # marketplace copy is a lagging snapshot that prices ~2x high,
                                  # emits no `prefilter-notice`, and still calls itself
                                  # `transcript-prefilter/1` (F-C11, F-D549, Kaizen K-144)
theagent2 conduct metrics arc <G#> | --all
                                  # the by-arc partition beside the by-stamp one (#790):
                                  # which sessions served a gate, what they cost, and which
                                  # of them a node row books somewhere else. Read-only
theagent2 conduct metrics restate <rail> | --all
                                  # re-sum the node rows over the session rows that exist
                                  # now. `close`/`measure` do it for the sessions they
                                  # touch; this is the backfill for rows already on disk.
                                  # Idempotent: a row that rests on everything is left alone
theagent2 conduct boot            # validates every metrics row against ledger + format,
                                  # and reports what is NOT measured
theagent2 conduct ledger mark-retro <S-###> --retro <S-###>
                                  # refuses unless that handover retro left its record (and its row,
                                  # when a transcript was bound to derive one from)
theagent2 conduct ledger mark-retro <S-###> --retro <S-###> --unmeasurable "<why>"
                                  # the ruling for a session no verb can ever measure — a
                                  # transcript whose model contradicts the entry's birth
                                  # stamp, which `measure` refuses and no verb may amend
                                  # (#1052). Discharges the retro debt with the reason
                                  # written into the ledger; the record is still required,
                                  # and the cost still enters no total
```

**Why not the handover retro.** A row was the handover retro's to write until run 4 measured 5 of its 25
sessions: the handover retro fires at conductor **succession** seams, and a dispatched architect,
test-engineer, implementor or retro session simply ends — so the whole Gate-3 arc's
measured spend was 100 % conductor overhead by construction, not by finding (#819). The
handover-fidelity audit still belongs at a succession, because that is when there is a
handover to audit. The numbers belong to every session, so they are taken where every
session already passes. The handover retro still verifies the row is there and derives it if it is not.

`conduct boot` splits its findings by whether the data can be trusted (#776):

- **Refused (exit 1)** — a row nothing may be computed from: invalid YAML, a wrong
  `format`/`kind`, a filename disagreeing with the `session:`/`stage:` inside, an id no
  ledger entry carries, a session row whose `role`/`stage`/`model` contradicts the ledger, or
  whose `effort`/`narrowed` is present and contradicts it (absent is legal — the fields are
  additive, #1220),
  a malformed number block, a `basis` other than `list-price`, a second row for one stage,
  a node row listing a session the ledger puts elsewhere, or a filename that is neither
  `<S-###>.yaml` nor `node-<rail>.yaml` (a typo'd row silently would not count), or a
  `measured_subtotal.sessions`/`restatement.measured` naming a session the row does not list,
  or a `downtime` entry that is not a list of maps with a non-negative `minutes`, a non-empty
  `window` and `cause`, and an `attribution` from the closed set (an unattributed interval is
  the number this field exists to prevent), or a `dispatched` entry that is not a ledger id
  whose `parent` is this session, or a `counts.dispatches` smaller than the `dispatched`
  list it rests on (#838), or a `subagents` entry with no `agent`, no `model`, a repeated
  `agent`, an `off_entry` that is not `true`, or a `cost_usd` that is neither a number nor
  the literal `unmeasured` (#1066).
- **Reported as a `GAP`, exit 0** — honest but incomplete, which is normal mid-run: an
  ended session with no row or no record, a node row that omits ledger entries of its
  stage, a record missing one of its required headings, an ended entry with no
  `transcript` bound (with the re-attribution command — attribution is confirmed from
  transcript *content*, never from mtime), or a node row whose numbers predate a session
  row that exists now (named with `conduct metrics restate`, #834). Refusing here would wedge a conductor over owed
  retro work; silence is what let Run 4 govern a ~$179 spend off a $41.82 sum.

Every boot prints the coverage line — `metrics: <measured>/<ended> ended sessions
measured — $<sum> list-price estimate` — so the number a budget governor sums always
arrives with its denominator. Zero rows print `metrics BLIND`, naming the $0.00 that a
governor would otherwise read as cheapness.

When a ledger `arc` mark disagrees with a stamp, boot prints an `arc attribution` line naming
the gate, how many of its sessions are stamped elsewhere, and what they cost — outside every
stage total, by design. An unmarked ledger prints nothing here, and that silence is honest:
it says the birth stamps are the whole story, which is the normal case rather than a hole.

It prints a `downtime:` line beside that one, summed per `attribution` and never into a
single number, naming the stage each interval sits in. When no node row declares one it
says `downtime: none recorded` rather than nothing at all — silence and zero look identical
in a dataset, and this field exists because run 4's silence read as free (#835).

## Consumers

- **The gate dossier's conduct annex** (ADR-051 extension; ADR-056 §7) — renders the
  node row at each gate.
- **The process-retro run dataset** — the per-node per-role cost/time table and the
  reviewed-vs-produced ratios assemble from these rows at run end (ADR-038 §5's Step-8
  harvest, with better inputs).
- **External presentation of the run** — the SA's summit dataset (ADR-056 Context).
