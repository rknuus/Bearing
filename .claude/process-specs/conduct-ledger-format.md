# The Conduct Ledger format (`conduct-ledger/3`)

**Status:** the format spec ADR-056 §2 owes — the single source for the session ledger's
shape. The ledger's role (attribution key for metrics, succession and retro bookkeeping)
is defined by ADR-056; this note fixes the fields and the check surface.

## Purpose

One **append-only** ledger per project recording every session a conducted run spawns —
conductor successions, stage sessions, and headless dispatches (retros) — each in its own
named tmux session (ADR-056 §1d). It is the join raw transcripts cannot provide: session → role + stage + expected
model + window. It gives three mechanisms their data:

1. **Succession** (`theagent2 succeed`, ADR-056 §4): the successor's entry carries the
   *mandated* model and window — no session ever picks its own model;
2. **The hooks** (ADR-056 §6): the birth assert compares the actual session against its
   entry's expectation; the context andon computes fill against the entry's `window`
   (no 200k-vs-1M guessing) and escalates on the entry's thresholds;
3. **Metrics and retros** (ADR-056 §§5/7): every `session-metrics/3` row and every handover
   retro keys on a ledger id; an ended entry without a retro mark is what tells the next
   boot to spawn the handover retro — for the entries the retro rule says owe one (#2016,
   below). **`role: retro` entries are exempt** — a handover retro audits handover, a
   retro session hands nothing over, and auditing the auditor recurses with no fixed
   point (#775). Retro entries never carry a `retro` mark.

Location: **`.theagent/conduct/ledger.yaml`** — committed, beside `state.yaml`
(see `conduct-state-format.md` for the directory contract).

## Shape (by example — illustrative)

```yaml
format: conduct-ledger/3

sessions:
  - id: S-011                       # minted at append, strictly ascending
    role: conductor                 # conductor | retro | a plugin agent role
    node: design                    # rail id at spawn: discovery mockup intent design
                                    # blueprint specification contract construction acceptance
                                    # — or `maintenance`, for work that sits on no rail (#1154)
    model: claude-opus-5            # expected model id (what the transcript must show)
    launch: "opus[1m]"              # the spec passed to `claude --model` (the alias IS the window)
    effort: high                    # optional: the `claude --effort` level the launch carried (#1220);
                                    # absent means the launch named none — never that it was low
    window: 1000000                 # expected context window, tokens — the andon denominator
    narrowed: "window 200000 of the 1000000 a dispatched session gets — a handover retro reads one transcript"
                                    # optional: the run-wide policy this launch sits below, and why,
                                    # in the narrowing verb's own words (#1220)
    andon: { notice: 0.20, urgent: 0.50, halt: 0.70 }   # optional; defaults shown
    cost_andon: { cache_read: 40000000 }                # optional (#1416): the cumulative cache-read
                                    # budget, an ABSOLUTE token count and never a fraction. Absent
                                    # means the ruled default, 20000000 (relay R-137).
    budget: { usd: 12 }                                 # optional (#2016): the brief's USD cap as a
                                    # number, from `conduct dispatch --cap-usd`. Absent, or no
                                    # `usd` = the brief stated no cap, so the session is never over
                                    # budget (retro rule). A legacy `messages:` half still parses
                                    # and is read by nothing (R-666)
    parent: S-009                   # spawning session's id; null for the first entry
    tmux: conduct-figaro-0011       # THE session name: tmux session = Claude session = git author;
                                    # null only when the launch opens no tmux session
    started: 2026-08-19T14:02Z
    # ---- late-write fields (the ONLY fields writable after append) ----
    session_id: 7f3a…-uuid          # bound by the SessionStart hook (birth assert)
    transcript: /home/agent/.claude/projects/-work-figaro/7f3a….jsonl
    ended: 2026-08-19T17:40Z
    retro: S-013                    # the handover retro session's own ledger id; or waived
                                    # (owed, and a human let it go); or exempt (the retro rule
                                    # found none owed — written by `ledger close`, #2016).
                                    # never set on role:retro entries — they owe no handover retro (#775),
                                    # at any level
    arc: blueprint                  # optional: the GATE arc this session served (#790)
    unmeasurable: "the dispatcher passed --model without a matching --launch"
                                    # optional: why no metrics row can EVER exist (#1052);
                                    # only ever written beside a `retro` mark
    foreign_at_exit: "1256 path(s) declared foreign at conduct done 2026-09-10T19:55Z: csharp/A.cs, csharp/B.cs, …"
                                    # optional (K-014): this session ended with a tree it did not
                                    # claim. Written ONLY by `conduct done --foreign <n>` — see the rule below

  - id: S-012
    role: architect
    node: design
    model: claude-opus-5
    launch: "opus[1m]"
    window: 1000000
    parent: S-011
    tmux: system-design-0012
    started: 2026-08-19T14:30Z

  - id: S-013
    role: retro
    subjects: [S-012]               # what this retro is OF (#1470), role:retro only, always a list —
                                    # several ids = one retro of a comparable BATCH, each subject
                                    # still marked separately and each still getting its own record
    node: design
    model: claude-opus-5
    launch: claude-opus-5           # headless -p dispatch; 200k window is fine for a handover retro
    window: 200000
    narrowed: "window 200000 of the 1000000 a dispatched session gets — a handover retro reads one transcript"
    parent: S-014                   # the successor that spawned it (boot step 3)
    tmux: handover-retro-0013       # headless means `-p`, not tmux-less (#849)
    started: 2026-08-19T17:45Z

  - id: S-015
    role: retro
    level: stage                    # optional, role:retro only (#1303): stage | process — a
                                    # non-handover retro, launched by `conduct dispatch --level`;
                                    # absent on a retro row means a handover retro
    node: design
    model: claude-opus-5
    launch: "opus[1m]"
    window: 1000000
    parent: S-014
    tmux: design-stage-retro-0015
    started: 2026-08-19T18:10Z
```

## Rules (checker-enforced)

- `format` is the first line; validators match name and version only (ADR-051 §4).
- **Append-only discipline:** `S-###` ids unique and **strictly ascending in file order**;
  entries are never deleted or reordered. All fields above the late-write divider are
  **immutable once appended** — a corrective entry is a new entry, never a rewrite.
- **Late-write fields:** exactly `session_id`, `transcript`, `ended`, `retro`, `arc`,
  `unmeasurable`, `foreign_at_exit`. Each may be
  written once, by mechanism: `session_id`/`transcript` by the SessionStart hook
  (`theagent2 conduct ledger bind`), `ended` at close (`… ledger close`), `retro` by the
  successor's boot (`… ledger mark-retro`, idempotent: re-marking with the same value is
  a no-op, with a different value an error), `arc` by the retro that draws the gate's
  boundary (`… ledger mark-arc`, same write-once rule), `foreign_at_exit` by
  `conduct done --foreign <n>` (same write-once rule: a second `conduct done` does not
  rewrite the first statement and says which one stands). The handover retro's "patch ledgers
  mechanically" (ADR-056 §5) operates on these fields only.
- **Fields:** every entry has `id`, `role`, `node`, `model`, `launch`, `window`,
  `parent`, `tmux`, `started`, in that order. `andon` is optional (defaults
  `0.20 / 0.50 / 0.70` — notice / urgent / halt; SA ruling 2026-08-19, ADR-056 §6);
  thresholds are fractions of `window`, strictly ascending. `effort` (after `launch`) and
  `narrowed` (after `window`) are optional and additive (#1220) — see the two rules below.
  `cost_andon` (after `andon`) is optional and additive the same way (#1416), and so are
  `level` (after `role`, #1303) and `subjects` (after `level`, #1470) — see the rules below.
- **Who owes a handover retro is a RULE, and `retro: exempt` is its mark** (#2016). The Software
  Architect, figaro relay R-656, point 2 (2026-09-30): *"A retro runs only after a conductor, or
  after a session that failed, was refused or ran over budget. Other sessions get no retro."*
  «Over budget» is over the brief's USD cap; a brief that states no USD cap is never over budget
  (figaro relay R-666, letter «C»). One decision (`conduct/retro-rule.ts`) reads, for each condition:
  **conductor** — `role:`; **failed** — the completion sentinel's exit code, non-zero; **refused**
  — a capacity refusal in the bound transcript, by record shape; **over budget** — `budget.usd`
  against the session's metrics row (own `cost_usd` plus priced sub-agents).
  A condition it cannot read makes the verdict UNDECIDED, never a waiver: no transcript, a USD cap
  and no row, or no sentinel on a close no verb vouched for (a hand close is `conduct boot`'s
  recipe for a crashed session; the verbs that end a session on purpose — `await --close`,
  `relay deliver`, `supervise stop`, `sa-status retire` — make a missing sentinel no failure).
  `ledger close` writes `retro: exempt` when the verdict waives the retro; `conduct boot` lists
  only owed and undecided entries and counts the exempt ones in one line; `mark-retro --retro
  exempt` is refused unless the rule agrees; `conduct retro` launches nothing for a waived
  subject. `exempt` is its own value on purpose: `waived` means a retro WAS owed and a human let it
  go, `S-###` means one ran, and a reader counting skipped debts must not count the rule's.
  **`budget` is a birth field** (after `cost_andon`, optional and additive like it): what the
  session was allowed is fixed when it starts. Every row written before it has none, so every
  such row is, by the definition, not over budget — nothing re-reads an old brief's prose. Rows
  written between #2016 and R-666 may carry `messages:` (a message aim, from a dispatch flag since
  removed); it still validates as a positive whole number and the retro rule does not read it.
- **`level` names a non-handover retro** (#1303). ADR-056 §5 gives the retro agent three
  levels; only `role: retro` rows may carry the field, and only `handover | stage | process`.
  `conduct dispatch --role retro --level stage|process` writes it — a stage or process retro
  has no subject session, so it is a briefed dispatch. `conduct retro <subject-id>` does not
  write it: a `role: retro` row without `level` is a handover retro, which every retro row
  written before the field was. Immutable like every birth field.
- **`subjects` names what a handover retro is OF** (#1470). Only `role: retro` rows carry it,
  it is always a LIST (one entry for a single-subject retro, so every reader has one shape),
  and each id must name a distinct entry that appears EARLIER in the file — the same three
  checks `parent` gets, and for the same reason. `theagent2 conduct retro <subject-id...>`
  writes it at append time; immutable like every birth field. The Software Architect ruled one
  handover retro per BATCH of comparable workers rather than one per worker (figaro relay
  R-159, his letter A, 2026-09-10), and before this field a retro's own row said nothing at all
  about what it retrospected — survivable while a retro had exactly one subject, and not
  survivable now. It does NOT replace the subjects' own `retro:` marks: those stay per subject,
  so a session a batch covered and a session whose retro was skipped remain distinguishable,
  and each subject still gets its own `sessions/<S-###>.md` record (the shape `mark-retro`
  refuses without and `conduct boot` reads as "already retrospected").
- **`foreign_at_exit` records that a session ended with a tree it did not claim** (Kaizen
  pull K-014). Optional and additive, and written by exactly one verb. `conduct done`
  refuses over unsaved work — that is what it is for — but on a checkout two sessions
  share, the dirt it refuses over is routinely ANOTHER live session's work in progress:
  1,256 paths on 2026-09-10, none of them the refused session's, and it could not commit
  them (that signs another writer's work with its own name, #1391), discard them (that
  destroys hours of live work) or stash them. So the verb was unusable by design in a
  conducted run's normal configuration, and a finished session's only route out was to
  bypass its own completion verb — the "done-but-unclosed" shape #1017 exists for.
  `--foreign <n>` makes the refusal ACKNOWLEDGEABLE: the caller states how many dirty
  paths it is declaring foreign, **the count must match what the guard sees** (a flag that
  never looked would let a session wave away its own uncommitted work, which is the whole
  thing the guard prevents), and this field keeps the number and the first few paths so a
  retro can read that it happened and decide whether it mattered. The session's OWN dirty
  work still refuses, always: the dirt classifier is untouched. Whether the guard should
  instead ATTRIBUTE every dirty path to its live owner, or the default write envelope be
  redefined, are the two larger shapes on #1450 and stay the Software Architect's to weigh.
- **`andon` and `cost_andon` are two different seams, in two different units, for two
  different failures** (#1416). `andon` is a FRACTION OF `window`: it guards running out of
  room, and its `(0,1)` validation is correct for that. `cost_andon.cache_read` is an
  ABSOLUTE count of cumulative cache-read tokens: it guards the BILL, which is denominated in
  tokens and not in percentages. On a 200k window the two moved together and one seam did both
  jobs; the 1M window multiplied every percentage threshold by five in absolute terms and
  separated them. Measured over 915 costed sessions: the 39 sessions with 300+ messages cost
  $2,074 (21% of the run), **none** reached the 50% urgent tier, 19 sat below the 20% notice
  tier, and 25 fell through every seam the process had. Lowering 20/50/70 cannot fix that —
  they are percentages of a denominator that is now a per-session variable. So the percentage
  thresholds are UNCHANGED and stay unchanged, and this sits beside them.
- **`cost_andon`'s level is the Software Architect's, and he ruled it: 20,000,000 cumulative
  cache-read tokens per session** (#1416; relay R-137, his letter «a», 2026-09-10). #1416
  settled the shape and left the number to him, because a level he has not ruled is not one a
  toolchain invents. The ruled figure lives in one constant — `DEFAULT_COST_ANDON` in
  `conduct/types.ts` — and every entry is measured against it on every tool call; an entry
  that declares `cost_andon:` overrides it. It never blocks: it signals at the crossing and
  again at every FURTHER multiple of the budget read (Kaizen pull K-003 — announced only at
  the first crossing, it let seven sessions read 71,369,369 cache-read tokens, $35.68, after
  being told to hand over), and the AI Architect holds the seam.
- **`role` vocabulary:** `conductor`, `retro`, or an agent name shipped in the plugin's
  `agents/` (e.g. `interview-architect`, `architect`, `test-engineer`, `implementor`).
- **`node`** uses the ADR-040 rail ids — the attribution key
  for per-node metrics. It is the rail node the cursor sat on **when the entry was minted**,
  and it is above the divider: nothing re-stamps it, ever.
- **`node: maintenance` is the tenth VALUE and not a tenth rail node** (`conduct-ledger/3`,
  #1154). A maintenance surface (#1152) carries no gates and no rail cursor, so a session
  dispatched against one has no rail node to be stamped with — and before this it was handed one
  anyway. Sixty-four rows of this repository's run-4 ledger read `node: construction`, fifty-four
  of them chore sweeps that never touched Construction. Nothing summed wrong: a `node-<rail>.yaml`
  rollup totals over the ids IT names, so no wrong dollar entered a stage. What went wrong was a
  verdict — `conduct boot` printed `GAP node rows undercount the ledger: construction omits …`
  over fifty-four sessions no work could ever add to Construction. The Software Architect ruled
  the bump on 2026-09-01, and ruled AGAINST the alternative of making `node:` optional: every
  reader having to handle a missing value was the stated reason.
  - **`RailId` still means the nine words.** The value is a union (`RailId | 'maintenance'`), not
    a tenth member of the rail, so every rail-shaped check — cursor position, gate order, "which
    rails are behind the cursor" — is untouched and cannot quietly acquire one.
  - **A rollup stays rail-only.** `node-<rail>.yaml` is a rail node's gate-frozen arithmetic and
    a maintenance surface has no gate to freeze one at. Nothing rolls maintenance work up.
  - **`conduct dispatch` and `succeed` default to it** on a maintenance surface and refuse a rail
    node there, so nobody has to type the lie the old shape required.
  - **Migration:** `theagent2 conduct migrate-ledger` — idempotent, rewrites lines rather than
    documents, moves the format line everywhere, re-stamps every row of a `kind: maintenance`
    surface, and re-stamps a CONDUCTED run's row only when `--restamp <ids>` names it. It refuses
    to re-stamp any id a node rollup lists: that list is what the runtime cross-checks the ledger
    against, so re-stamping one would not correct a row, it would stop the surface validating.
- **`arc` is the second partition, and it exists because one partition was not enough**
  (#790). Optional; a gate id (`intent blueprint contract acceptance`), never a stage id. It names the gate arc the
  session **served**, which is a different question from where the cursor was at its birth,
  and the two answers legitimately differ. A conductor outlives the rail node it was minted
  at: Run 4's S-007 was stamped `intent` at 17:40Z, then conducted the end of Design and the
  opening of Specification, and its $18.21 books to `node-intent.yaml`. An handover retro is stamped where
  its dispatcher stood, not where its subject ran. Spec work books to the stage that owns it
  wherever it runs. Each stamp is defensible on its own terms, and all three diverged from
  what every human called "the Gate-4 arc" — a Gate-4 dispatch brief named three sessions as
  construction work that the ledger stamps `contract`, `specification` and `acceptance`.
  **The fix is never to mutate `stage`.** An immutable birth stamp is what makes this file
  evidence rather than a record of opinion, and a re-stamped ledger could not answer "where
  was the run when this session was minted" at all. So the arc is added beside it:
  - a node row stays complete **by stamp** — `session-metrics/3` keys node rows to `node`
    and the runtime cross-checks that list against the ledger, unchanged by this field;
  - a gate annex becomes complete **by arc** — `theagent2 conduct metrics arc <gate>` lists
    the arc's sessions, splitting those the stamp already covers from those stamped
    elsewhere, whose costs stay in their own node rows and enter no gate total twice.
  An entry with no mark belongs to its own gate's arc when it is gate-stamped, and to no arc
  otherwise; an explicit mark always wins over the stamp. Run 4's stage retro wrote this
  partition by hand as an `adjacent_work` block in `metrics/node-construction.yaml` because there was
  nowhere else to put it; that block is what this field mechanizes.
  **What `arc` does NOT cover:** a birth field that recorded the wrong *dispatch shape* —
  S-037 carries `tmux: null` but ran in the named window `run4-l1-s032`. That is the same
  family (a birth-time field the launch then contradicted) but a different case, and this
  field is not a general escape hatch for it. That case was closed at its source instead
  (#849): `tmux` stayed immutable and the recipe that minted it wrong was fixed to mint
  the window name it then launches into — see the `tmux` rule below. S-037's entry still
  says `tmux: null`, and it still stands as written.
- **`model:` is a model id, and a window suffix on it is not a model change** (#1052). The
  window is `window:`, a number, and the alias that requests it is `launch:`. When a suffix
  leaks into `model:` anyway (`claude-opus-5[1m]`), the birth assert and `measure` compare the
  model id and let it pass — a session that ran exactly the model it was told to must not read
  as a model swap. A DIFFERENT id (`claude-sonnet-5` recorded, `claude-opus-5` observed) still
  contradicts, loudly: that is the swap the assert exists to catch.
- **A LAUNCH ALIAS PASSED AS A MODEL IS RESOLVED AT THE MINT, and the field stays
  unamendable** (#1553). `--model opus[1m]` used to be written into `model:` exactly as typed,
  which made the birth field permanently untrue: `measure` refuses a row whose model
  contradicts the transcript, and `model:` is a birth field no verb may amend, so figaro's
  `S-1456` booked $0.00 in every cost total for the life of the run. `opus[1m]` is the tier's
  own name — in the model policy, in the conduct playbook and in `--launch` — so a caller
  passing it is using the vocabulary the toolchain taught them, and a tool that understands a
  word it taught should not fail silently on it. Every append now resolves an alias through
  the same table `--launch` uses and writes the resolved id (`claude-opus-5`); `launch:` is
  untouched. A MODEL ID is never rewritten — a dated or pinned id (`claude-opus-4-5-…`) and an
  id outside the tier table (`claude-fable-5-1`) are recorded exactly as given, and an alias
  the policy has never heard of is left alone so the birth assert reports it. The resolution
  happens at the MOMENT OF WRITING, in `appendLedgerEntry`, and therefore on every launch verb
  at once: `dispatch`, `succeed`, `conduct retro`, `dispatch --fork`, the long-lived dispatch,
  the SA-STATUS launch and the hand `ledger append`. It is NOT a repair afterwards: birth fields
  stay unamendable, because the birth assert is the only thing that can catch a launch that
  did not realize its ledger row.
- **The mismatch andon verifies the MODEL, never the WINDOW** (#1552). The transcript's
  `model` field is `claude-opus-5` for a session on `opus` and for a session on `opus[1m]`
  alike — the 1M window is a request-level beta, not a distinct model id — so the window is
  simply not recoverable there and the andon says so in its own refusal text. The window is
  verified separately and by contradiction, against `window:`: more observed context than the
  declared window has room for. Until 2026-09-12 the comparison was also unnormalised, so
  `opus[1m]` against `claude-opus-5` read as a model swap and blocked every tool call of a
  correctly-launched session — an ADR-056 §6 error is loud by design, so a false one is the
  maximum cost the mechanism can impose.
- **`unmeasurable` is the ruling that ends a retro debt no verb can discharge** (#1052).
  Optional, late-written, a non-empty REASON, and never written alone — it hangs from the
  `retro` mark it justifies, so an entry carrying it without one is invalid. The deadlock it
  breaks: `measure` refuses a transcript whose model contradicts the entry, `mark-retro`
  refuses without a metrics row (#776), and `model:`/`launch:` are birth fields no verb may
  amend — so an entry whose launch did not realize its recorded intent could never discharge
  its debt, `conduct boot` re-printed the dispatch recipe forever, and the Figaro adoption run
  paid twice to retrospect a 3-second session. The verb refuses the ruling where a row exists
  or where the transcript would yield one: the escape hatch is for the unmeasurable, never for
  the unmeasured. The session record is still required — only the row is waived. What the
  ruling never does is turn a missing cost into $0.00: `conduct boot` names every ruled entry
  with its reason, beneath an estimate that stays a floor.
  **A STANDING ruling waives the row exactly as a fresh one does** (#1556). The waive used to
  be keyed on `--unmeasurable` being passed in THAT invocation, and the field is write-once,
  so a second `mark-retro` over an entry already carrying the ruling was refused on both
  doors: no flag left to pass, and no metrics row — which is precisely what the ruling says
  can never exist. A successor discharging a debt its predecessor recorded could type nothing
  that worked. `mark-retro` now reads the ruling off the entry, waives the row on it, and says
  on stdout that it stood on a standing ruling and whose words those are. The `--unmeasurable`
  pre-flight is deliberately not re-applied to a standing ruling, and the session record is
  still required — no flag and no ruling waives that.
- **The brief join is the id, not a field** (#829): a stage session dispatched by
  `theagent2 conduct dispatch` has its brief retained at
  `.theagent/conduct/briefs/<id>.md`, committed in the same commit as its ledger entry.
- **The git identity is the id, not a field either** (#815): a session launched by
  `theagent2 conduct dispatch` / `theagent2 succeed` (or by the boot's retro recipe)
  commits as `<role>/<id>` at `<local>+<id>@<domain>`, derived from the entry's `role` and
  the checkout's configured email — so `git log --author=+S-012` is exactly one session's
  work and the run's own domain still gathers the whole run. It is injected per process as
  `GIT_AUTHOR_*`/`GIT_COMMITTER_*` at the launch, never written to repo config: the
  configured identity belongs to the human in the same tree, and his commits are the ones
  carrying no `+S-###`. `theagent2 conduct identity <id>` prints the four variables;
  `--check` compares a running session against its entry. Run 4 had none of this — every
  actor committed as `run4 conductor <run4@bellavista.invalid>`, which is why the delivery
  receipt it rested a gate ruling on proved nothing.
  The entry carries no `brief:` field — the filename *is* the join, and it holds for a
  session launched in a materialized workspace too (`dispatch --cwd`), because the brief
  is retained here regardless of where the session runs. An entry whose role is neither
  `conductor` nor `retro` and that has no brief file was launched by hand, outside the
  verb: that is the audit gap, not a missing field.
- **`tmux` is THE SESSION'S NAME, and it is the only name the session has** (#1060,
  ADR-056 §1d). Shape: `<work-slug>-<serial>` — `issue-sweep-0091`, `system-design-0084`.
  One string in four places at once: the detached **tmux session** it runs in (one tmux
  session, one `claude`, so `tmux ls` answers "what is alive"), the `--remote-control` name
  under which it appears in the Claude session list, the git author name it commits as
  (email keeps the `+S-###` subaddress, so `git log --author=+S-091` is unchanged), and this
  field. `null` only when the launch opens no tmux session at all.
  - **The slug names the WORK, not the role.** A run has many sessions of one role, so
    `architect-0084` would be nearly as opaque as the bare `S-084` it replaces; the dispatch
    brief already knows what the session is for. `conduct dispatch --name <slug>` requires it
    and refuses a slug that merely repeats the role.
  - **The serial is the ledger id**, zero-padded to four: `issue-sweep-0091` *is* `S-091`.
    That is what keeps the human-readable name and the machine id one fact rather than a
    translation table.
  - **The name and the id are minted by the same append.** `tmux` is above the late-write
    divider, so the value has to be right at append time; composing it from the serial the
    append is itself minting means the launch and the ledger cannot be written apart at all.
    `theagent2 conduct dispatch` does both in one verb; the retro recipe `conduct boot`
    prints passes `--name handover-retro` and substitutes the `<minted-name>` the append
    prints back. Run 4 is the cost of the old split — S-037 was minted `--tmux -` from a
    recipe that then launched it into `run4-l1-s032`, so the ledger will say `tmux: null`
    about it forever, and every reader that took `null` to mean *headless* was misled.
  - **`-p` is about the prompt, not the tmux session**: a headless retro still runs in its
    own named session, because a `claude -p` subprocess of a conductor dies with it (OI-023).
    Headless is the exception (§1d) — nobody can attach to a `-p` run and watch it.
  - Entries from before #1060 carry a WINDOW name (`figaro-architect-1`) and keep the old
    `<role>/<id>` git identity; nothing re-stamps them, and the liveness probe reads both.
- **`window` is tokens** (an integer); `launch` is the exact model spec handed to
  `claude --model`. The pair exists because a plain model id silently means a 200k window
  (the error class ADR-056 §6 kills): the birth assert checks `model`, the andon divides
  by `window`, and `launch` documents how the pair was requested.
- **`effort` completes the launch, and it is optional and additive** (#1220). The entry
  recorded the model and the window a session was born with and never the reasoning-effort
  tier, so a run could not say whether a session ran at `high` or at `max` — and the Software
  Architect moved this programme from `max` to `high` on 2026-08-30 (*"most of the time, high
  would probably be good enough"*) with no row anywhere able to measure whether that held. It
  is a birth field, above the divider with the rest of the launch, because `--effort` rides
  the same command as `--model` and no session may revise it about itself. Every entry
  written before the field stays valid, and an absent value means **the launch named no
  level** — never that the level was low, and nothing defaults it. `theagent2 conduct
  dispatch --effort`, `theagent2 conduct retro --effort` and `theagent2 conduct ledger append
  --effort` write it; `session-metrics/3` copies it onto the session's row.
- **`narrowed` says which run-wide policy this launch sits below, and why** (#1220). A verb
  that narrows a policy for one session records the narrowing where the session is priced,
  not in an open item somebody has to find: `theagent2 conduct retro` narrows the window
  every time — a handover retro reads one transcript, so it runs at 200 000 where a
  dispatched session gets 1 000 000 — and on the Figaro run of 2026-09-01 that narrowing was
  reported only as prose in `OI-150`, which no reader of this file or of a metrics row ever
  sees. One line of free text, written by the narrowing verb at append time, immutable like
  every other birth field, and copied onto the session's `session-metrics/3` row. It is a
  STATEMENT, not a permission: nothing reads it to relax a check.
- **Timestamps** are UTC ISO-8601 to the minute (`YYYY-MM-DDTHH:MMZ`).
- **YAML subset** as in `conduct-state-format.md`; the strict parser is the format
  validation.

## The check (`theagent2` runtime)

```sh
theagent2 conduct retro <S-###> [<S-###> …]   # one retro; several subjects = one BATCH (#1470)
theagent2 conduct ledger append --role <r> --node <n> --model <id> --launch <spec> \
  --window <tokens> --parent <S-###|-> --name <work-slug>     # mints S-### AND <slug>-<serial>
  #  … --effort <level>  optional: the `claude --effort` level the launch carried (#1220)
  #  … --tmux <name|->  instead of --name: a literal name for a session named elsewhere,
  #                     or `-` for one that opens no tmux session at all
theagent2 conduct ledger bind <S-###> --session-id <uuid> --transcript <path>
theagent2 conduct ledger close <S-###>
theagent2 conduct ledger mark-retro <S-###> --retro <S-###|waived> \
  [--unmeasurable "<why no metrics row can ever exist>"]         # the deadlock breaker (#1052)
theagent2 conduct ledger mark-arc <S-###> --arc <intent|blueprint|contract|acceptance>  # (#790)
theagent2 conduct metrics arc <G#> | --all                      # the by-arc partition, read-only
theagent2 conduct boot        # validates the whole ledger; reports unmarked ended entries,
                              # and the arc split whenever a mark disagrees with a stamp
theagent2 conduct migrate-ledger [project] [--check] [--dry-run] [--restamp <S-###,…>]
                              # conduct-ledger/2 -> /3 and session-metrics/2 -> /3 (#1154)
```

The runtime is the validator (fail-closed). An entry that is `ended` without `retro` is
not an error — it is the boot-time signal to spawn the handover retro (ADR-056 §3 step 3).

## Consumers

- **`theagent2 succeed`** — appends the successor entry, launches with `launch`, exports
  the entry id as `THEAGENT2_LEDGER_ENTRY` into the child (ADR-056 §4).
- **The birth assert / context andon hooks** — expectation and denominator (ADR-056 §6).
- **`theagent2 conduct inflight`** — the one-shot live-session answer for an environment
  manager about to restart under the run (#1048). It reads the process table, not this file:
  `ended` is a late write (the conductor stamps it at close, often hours after the child
  exited), so "entry without `ended`" over-blocks, and the `tmux` field is a name, not a
  liveness fact — `tmux ls` answers who is alive, this file answers who they are. Live `claude` processes are attributed through the `THEAGENT2_LEDGER_ENTRY`
  above, and a `.theagent-run/dispatch/<id>.done` sentinel vetoes the attribution — that
  child has exited. The contract, for callers outside the run:

  ```sh
  theagent2 conduct inflight [--conducted-only]
  # exit 0  nothing in flight, stdout empty — the only answer that authorizes a restart
  # exit 1  one line per live session:
  #           session <S-###> <pid> <role> <stage> <started>   (`-` where this ledger has no entry)
  #           loose <pid> <started> <command>                   (live claude nobody can name)
  # exit 2  the process table could not be read — "do not restart", never "nothing"
  ```
- **The handover retro** — sole transcript reader; finds the predecessor's `transcript` here,
  emits the `session-metrics/3` row keyed on the entry id (ADR-056 §5). For a dispatched
  stage session it also reads `briefs/<id>.md` and diffs it against what the session had
  to discover for itself (ADR-056 §1b).
- **Stage- and process-retro metrics aggregation** — stage and role attribution (ADR-056 §7). The stage retro at a gate
  marks the arc of every session that served the gate but is stamped elsewhere, so its gate
  annex is complete without the node row absorbing costs that are not its own.
