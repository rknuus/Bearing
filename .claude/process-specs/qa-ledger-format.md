# The Q&A Ledger format (`qa-ledger/1`)

**Status:** the design note ADR-040 §3 and issue #414 call for — the single source for the
ledger's shape. The ledger itself is defined by ADR-040 §3; this note fixes the fields and
the check surface (the `qa-ledger` skill).

## Purpose

One typed, **append-only** ledger per project for design questions that need a stakeholder
(or owner) answer: the AI appends questions as they arise, the Software Architect records
the answers — no ceremony. It gives the Q&A channel (ADR-040 §3) a defined home so that:

1. a genuine domain gap **blocks visibly** — the entry names what it blocks, and the gate
   check refuses promotion while a blocking entry is open;
2. every answer lands **with provenance** — source, dates, recording pointer where one
   exists (ADR-028); a model element the answer unblocked still traces to a stakeholder
   statement (elements may carry a `qa: QA-###` reference);
3. parked threads from any design stage have one place (the Discovery-stage/B P1–P8 threads are
   natural first entries when Design-stage conduct picks them up);
4. the **behavioral build's invented decisions** land here at Intent (mockup-requirements
   M-3): every D-entry the spike chose rather than read becomes an entry, and one a walker
   **answered in the mockup** becomes an `answered` entry carrying that answer — the walk is
   where an invented decision is cheapest to settle (#1183). `bpm-decisions harvest … --yaml`
   drafts them; the ids and the reading stay the Software Architect's.

Location: **`.method/qa.yaml`** — next to `architecture.yaml`, **never inside it** (the
model stays free of prose rationale). Before the `.method` store exists (Stages A–B), the
file may sit alone in a bare `.method/` folder — it is just a file; whether SNS ever syncs
it alongside the model is a deliberately open ADR-014 boundary question (ADR-040 §3).
Promotion never squashes the ledger — it is design history, not draft content.

## Shape (by example — illustrative)

```yaml
format: qa-ledger/1

entries:
  - id: QA-001
    status: answered
    question: "Does the 15.00 delivery minimum apply after a regular's 10% discount, or before?"
    blocks: [SI01.02]                  # what an open entry blocks: BP##, SIxx.yy, SQ/CC ids,
                                       # VW screens, or a bare model-element name;
                                       # [] = parked thread
    audience: owner                    # who can settle it: owner | architect (ADR-062).
                                       # Required while open; optional once terminal.
    asked: 2026-07-18
    source: "Design-stage modeling of PriceOrder — minimum-check ordering ambiguous in BP01 notes"
    answer: "After the discount: the discounted order total must reach 15.00; the fee never counts."
    answered: 2026-07-19
    answeredBy: "Widgets owner via Software Architect"
    digest: "The minimum is tested on the discounted total. A regular's 10% comes off first, and the order qualifies only if what is left reaches 15.00. The fee is never part of that sum."
                                       # digest: the Lesart the review surface renders in place
                                       # of the quote — 2-3 sentences, ONE line, CURRENT STATE
                                       # ONLY, and NON-AUTHORITATIVE: the 'answer' above governs
    digested: 2026-07-19               # the day the digest was last (re)written; must be at
                                       # least as new as 'answered'
    exercisedBy: [SI01.02]            # the drawn artifact that makes the ruling exercisable
                                       # (ADR-060 #840): SI/BP/SQ/CC/VW ids, walked path ids
                                       # BPxx-Pnn, or spec:<PropertyName>; alternative:
                                       # deferred: "#NN — <why the step is deliberately not
                                       # in this release>" (mutually exclusive)
    recording: "01_Planning/2026-07-19 Design - Q&A session.m4a"

  - id: QA-002
    status: open
    question: "May a driver record a partial cash payment, or is it all-or-owed?"
    blocks: [BP07, SI03.01]
    audience: owner
    asked: 2026-07-19
    source: "Design-stage decomposition of the settlement volatility (harvest item V-07)"

  - id: QA-003
    status: withdrawn
    question: "Do pickup orders need a numbered shelf slot?"
    blocks: []
    asked: 2026-07-18
    source: "Parked thread P7 (Step-3 handoff)"
    withdrawn: 2026-07-19
    reason: "Superseded — the owner folded shelf handling into BP08 during Intent review."

  - id: QA-004
    status: answered
    question: "QA-001 ruled the minimum is tested after the discount. A draft priced before a rate change and completed after it would be tested against which minimum?"
    blocks: [SI01.06]
    asked: 2026-07-20
    source: "Design-stage design of the carried-rates mechanism — QA-001's answer does not reach the held-draft case"
    answer: "The minimum in force at completion. Completing an order prices it there and then; whatever sat on the screen before is a working estimate."
    answered: 2026-07-20
    answeredBy: "Widgets owner via Software Architect"
    supersedes: [QA-001]               # this answer REPLACES QA-001's (ADR-060 amendment,
                                       # #944): every artifact stamped against QA-001 is
                                       # stale until it is re-read against this entry
    exercisedBy: [SI01.06]

  - id: QA-005
    status: answered
    question: "Does V1 report order status back to the sales channels?"
    blocks: [BP07]
    asked: 2026-07-21
    source: "Mockup review — BP07 drawn, never scoped"
    answer: "No. Status reporting is post-V1; no channel is told anything in this release."
    answered: 2026-07-21
    answeredBy: "Widgets owner via Software Architect"
    digest: "V1 tells no sales channel what happened to an order. Status reporting waits for a later release."
    digested: 2026-07-21
    enforcedBy: [BP07]                 # the ruling REMOVES something: the machine-readable
                                       # surface that enforces it is BP07's own .bpd header,
                                       # which must declare `status parked` (#1241)
    deferred: "#812 — post-V1"

  - id: QA-006
    status: answered
    question: "Where does the answer to a question the toolchain answered live?"
    blocks: []
    asked: 2026-09-08
    source: "Contract-gate ledger review"
    answer: "The toolchain changed and the model did not."
    answered: 2026-09-08
    answeredBy: "Software Architect"
    digest: "Nothing in the model moved. A checker gained a field, and that change is the answer."
    digested: 2026-09-08
    toolingBy: { kind: issue, ref: "figaro#316" }   # the THIRD trace kind (figaro#406): the
                                       # toolchain change that carries the ruling. `kind: commit`
                                       # with `ref: <repo>@<sha>` is the same field's other form
```

## Rules (checker-enforced)

- **Append-only discipline:** `QA-###` ids unique and **strictly ascending in file order**;
  entries are never deleted (withdraw instead). Status transitions: `open → answered`,
  `open → withdrawn`; `answered`/`withdrawn` are terminal.
- **Fields by status** (in the order shown above): every entry has `id`, `status`,
  `question`, `blocks`, `asked`, `source`, and — while `open` — `audience`. `answered`
  requires `answer` + `answered` (date);
  `answeredBy`, `digest`, `digested`, `supersedes`, `exercisedBy`, `enforcedBy`, `toolingBy`,
  `deferred` optional
  (field order: `answeredBy`, `digest`, `digested`,
  `supersedes`, `exercisedBy`, `enforcedBy`, `toolingBy`, `deferred`). `withdrawn` requires `withdrawn` (date); `reason` optional. `recording` is
  optional on any entry. An `open` entry carries none of the terminal or trace fields.
- **`audience` — who can settle it** (ADR-062, a closed enum): `owner` for business truth
  only the stakeholder can settle, `architect` for methodology and judgement calls that are
  the Software Architect's. **Required on every `status: open` entry**; optional on
  `answered` and `withdrawn`, which are history the review surface never reads. Position in
  the field order: after `blocks`, before `asked`. It is an enum and not free text because
  the review surface (`review-surface-format.md`) **branches** on it, and anything a derivation
  branches on is a typed field — prose is only ever the payload.
- **The digest — a Lesart to render where the quote will not fit (#1049, SA ruling
  2026-08-26).** An answered entry may carry `digest:` — two or three sentences of plain
  language saying what the ruling means — plus `digested:`, the day that text was last
  written. It exists because a review surface cannot render a 4'600-character verbatim answer
  and still be read: the surface shows the digest, and the verbatim `answer` sits one
  expander away.

  Four rules, and they are the whole guard against paraphrase drift:

  | rule | why |
  |---|---|
  | the digest is **non-authoritative** | the `answer` governs. Every surface that renders a digest labels the verbatim text beside it as the text that governs |
  | it names **the ruling it summarizes** | a digest read away from its entry is a claim with no author; the id is how a reader gets back to the original |
  | **current state only** — no history, no supersession narrative, no decision dates | the same rule the diagram note-style follows: facts now. Provenance lives in the quote, in `answeredBy`, and in the ledger's own append-only order |
  | `digested` is **at least as new as** `answered` | staleness is the one thing a checker can settle. Correctness stays a human concern; this catches the answer that was amended while the digest stood still |

  **Authoring duty:** whoever writes or amends the verbatim `answer` writes or rewrites the
  digest in the same edit — never a separate pass. A digest authored later is a digest
  written by somebody who was not in the room.

  **Where it is enforced.** `digest`/`digested` come as a pair and `digested >= answered` is a
  lint error the moment either is present. A missing digest is reported mid-stage as a to-do
  and is a **hard red at any gate** (`qa check --gate intent|blueprint`) — the same shape ADR-060 gave
  `exercisedBy` (#840), and for the same reason: a ruling nobody can read at the surface it is
  reviewed on crosses the gate as a silent green.

- **Supersession — `supersedes` (#944, SA ruling 2026-08-23).** An answered entry whose
  answer **replaces** an earlier entry's answer names it: `supersedes: [QA-026]` (inline list;
  more than one earlier ruling may be replaced at once). The targets must exist, be **earlier**
  in file order, and be `answered` — an entry cannot supersede itself, a later entry, an `open`
  entry (nothing was answered to replace) or a `withdrawn` one (the question was retired, not
  its answer). Chains are legal and expected: QA-025 → QA-026 → QA-028 is three answers on one
  behaviour, each superseding the last.

  **Do not confuse it with `withdrawn`.** Withdrawing retires a *question* that was never
  answered. `supersedes` records that a *ruling that was given* no longer holds — the ledger
  stays append-only either way, and neither ever edits the earlier entry.

  **Why the field exists rather than being inferred.** The mechanism this feeds (below) needs a
  trigger, and in this ledger's whole operating history **no `answer` has ever been amended in
  place** — the only six answer lines ever removed came from one commit that discarded the Run-1
  ledger and seeded a fresh one. Every real change of mind was a *new entry*: QA-025 → QA-026 →
  QA-028, and QA-027 narrowed by QA-029. A mechanism watching only for edited wording would
  therefore have caught **none** of the Run-4 cases that motivated it, including the Contract
  bounce, where QA-028 replaced QA-026 and every document written against QA-026 stayed green.
  The declaration is a human judgement and an undeclared supersession is still a silent green;
  the checker can enforce only that a *declared* one is honoured.

- **The answer revision digest (#944).** Every answered entry has a **revision digest** —
  8 hex characters of SHA-256 over its normalised `answer` text (dashes folded, whitespace
  collapsed, trimmed). It is **computed, never authored**, and never stored in the ledger. It is
  the same device `verdict-check` applies to ADR-038 §5 and for the same recorded reason: that
  check first compared criterion *names* only, criterion 2 was reworded substantively while
  keeping its name, and every surface stayed green having answered the old question.

  So a ruling goes stale two ways, and **both** are triggers: its wording is edited in place
  (the digest moves), or a later entry declares that it `supersedes` it (the ruling is replaced
  outright). `qa digest <qa.yaml>` prints one line per answered entry — id, digest, and whether
  a later entry has superseded it.

- **The citation stamp (#944, SA ruling 2026-08-23; ADR-060 amendment, mechanism 5).** Every
  citation of a ruling in the **asserting surface** carries the digest it was written against,
  inline and beside the id it already cites:

  ```
  QA-026@f54a0664          # in C# comments, markdown, YAML, .bpd, .vw prose alike
  ```

  A stamped citation is a finding two ways, and re-stamping is the remedy for only one of them:

  | finding | what happened | the remedy |
  |---|---|---|
  | the digest does not match the ledger | the answer was reworded | re-read the citing text; if nothing about it changes, `qa stamps --restamp QA-###` re-stamps that ruling everywhere in one command |
  | the ruling has been superseded | it was replaced outright | **re-stamping is wrong** — the citing text must be re-read against the *new* ruling and cite that one instead |
  | a bare `QA-###` in the asserting surface | never stamped | stamp it |

  `qa stamps <qa.yaml> <path>…` is the check; the paths passed to it **are** the asserting surface,
  named by the calling recipe rather than guessed from a layout, as `qa citations` and `seqmap`
  already do. Generated files are skipped — they regenerate from the model, whose prose is covered
  by the citation report. **Gate-record confirm items are not stamped either:** they already quote
  the ruling verbatim (`authority:` + `ruling:`, #845) and the dossier build already compares that
  quote to the ledger character for character, which is stronger than a digest. What they gain is
  the supersession rule — an item naming a replaced ruling fails the build, at **all four gates**.

- **A ruling that REMOVES something — `enforcedBy` (#1241, SA ruling 2026-09-05).** An answered
  entry whose answer takes a business process **out of scope** names the machine-readable surface
  that enforces the exclusion: `enforcedBy: [BP07]`, the process whose own `.bpd` header must
  declare a non-live `status` (the taxonomy is `stage-ab-tooling-contract.md` §1a). Tokens are
  `BP##` ids and nothing else — a whole process is the smallest thing that can carry a lifecycle
  header. Mutually exclusive with `exercisedBy`: a ruling is either exercised by something drawn
  and live, or enforced by something declared out of force. It may sit **beside** `deferred`, and
  usually does — a parked process is exactly a deferred one.

  **Why the field exists.** Before it, an exclusion had nowhere typed to live: it was written as
  prose in the `answer`, and **no checker reads prose**. Measured on one conducted project: a
  process excluded on day one produced, over the next twelve days, five issues about
  inconsistencies inside a drawing nobody was building, plus a scope question that spent a ruling
  excluding it again. The exclusion was stored where humans read and machines do not. `enforcedBy`
  is the pointer from the decision to the surface that makes it act, and the gate check below
  refuses the pair when the surface does not agree.

- **A ruling the TOOLCHAIN carries — `toolingBy` (figaro#406; SA letter «A» on figaro#404,
  2026-09-08).** Some rulings answer a question by changing the **toolchain** and leaving the model
  alone; their whole content is *"the toolchain changed and the model did not"*. Nothing drawn
  exercises them, no process goes out of force, nothing is deferred — the work is **done**, it is
  simply not done in the model. Such an entry names the toolchain change instead:

  ```yaml
  toolingBy: { kind: issue,  ref: "figaro#316" }
  toolingBy: { kind: commit, ref: "theagent-unchained@3238c7f" }
  ```

  **The value is a pair, never a bare string** — a token a program reads is typed, not prose it must
  parse (SA standing directive 2026-09-08 17:20Z, design rule 15:36Z). `kind` is a closed enum
  (`issue` | `commit`) for the same reason `audience` is one: the check **branches** on it, to know
  what shape `ref` must have. Writing it as a pair is also what makes the ledger free to name the
  tracker **issue** today and a **commit** tomorrow without a format change or a new ruling.

  **What "resolves" means here is weaker than for the other two kinds, and that is stated rather
  than hidden.** `exercisedBy` resolves against the generated Sequence Map and `enforcedBy` against
  a process's own lifecycle header; the object a `toolingBy` names lives in **another repository**,
  which no generated ground truth covers and which the checker will not reach over the network. So
  resolution is **shape plus repository qualification**: the reference must name one identifiable
  object in a *named* repository, so a reader can go to it. A bare `#316` is refused — it names an
  issue in no stated repository, and the toolchain change is usually in a different repository from
  the ledger tracing to it. The field proves a reference is **followable**, never that the change
  behind it is the right one.

  **It stands alone.** Mutually exclusive with `exercisedBy` (then the model *did* change), with
  `enforcedBy` (then a process went out of force) and with `deferred` (then the change has not
  landed, and the deferral is the honest trace). Like the other kinds it satisfies the ADR-060 trace
  requirement at every gate, and like `deferred` and `enforcedBy` it never goes quiet: a gate run
  prints `tooling: QA-### → issue <repo>#<n> — the toolchain changed, the model did not — "…"`, so
  the gate record can carry the row. Field order: after `enforcedBy`, before `deferred`.

  **Why the field exists.** Before it, an answered, complete entry of this kind was **red at every
  gate**, and its author had two ways out: invent a trace — claim `enforcedBy` over a process nobody
  excluded, which is a lie no checker can catch — or carry the red. One conducted project carried
  that red across a Contract gate for two days, deliberately, after being told the cost. See the
  ADR-060 amendment of 2026-09-10.

- **Ruling traceability (ADR-060, #840):** an answered ruling should name the drawn artifact
  that exercises it in `exercisedBy` — the `blocks` vocabulary plus walked path ids
  (`BPxx-Pnn`, the seqmap's gateway-covering paths) and named spec properties
  (`spec:<MemberName>`) for rulings that are not step-shaped. A ruling whose behavior is
  deliberately not in the current release instead carries
  `deferred: "#NN — <one-line scope note>"` (must start with the tracking issue ref;
  mutually exclusive with `exercisedBy`), and one whose whole content is that the toolchain
  changed carries `toolingBy: { kind, ref }` (above). Mid-stage a missing trace is a to-do; **at any
  gate it is a hard red — no owner waiver** (see the gate check below). Deferred rulings are
  reported on every gate run so the gate record carries them forward until the step is drawn.
- **Answers are verbatim or tight paraphrase** — one line. The ledger is not prose storage;
  longer context lives in the session notes the `source` points at (ADR-028 journal
  entries reference ledger ids, not the other way around).
- **`blocks` vocabulary:** `BP##`, `SIxx.yy`, `SQxx.yy.zz[.NN]` / `CCxx.yy`, `VW##…` screen
  ids, a bare model-element name (component / facet / DTO), or — the **deployment tier**
  (ADR-071 §5, #1247) — `DV:<slot>` (a slot of the deployment view, by its slot name) and
  `DV:hosting` (the hosting operational concept). A token that *looks like* one of
  the id forms but is malformed is a lint error, and a retired `BPxx-SIaa.bb` id is refused with
  the ADR-066 migration path.
- **The deployment tier fails at Contract only.** Which product stands behind a slot, and where
  the system runs, are decisions about the deployment view — never about the model, which is
  product- and hosting-free (ADR-048 §1). An open entry whose blocks are all `DV:` tokens is
  *reported* at Intent and Blueprint and holds neither; it fails `--gate contract`. A mixed entry
  keeps the rule its other blocks earn. Discovery's operational-concerns pass owes its questions
  **to the ledger** in this form: an "owed questions" table in the operational-concerns document
  is a draft of ledger entries, not a ledger — Figaro's Q-OPS-03 ("deployment target and owner")
  reached no gate because it never left that table.
- **`SIxx.yy` is a BUSINESS-tier token** (ADR-066): the id names a System Interaction, which is
  drawn at Mockup and blessed at Intent, and it is the *same* id the model later realizes —
  there is no second, model-stage id to distinguish it from. So an open question blocking an SI
  blocks the business design. `SQ`/`CC` stay model tier: those artifacts are derived at Design.
- **Dates** are `YYYY-MM-DD`.
- **YAML subset** (same regime as `si-binding-format.md`): two-space indentation, one field
  per line in the documented order, bare or double-quoted scalars, inline `[lists]`,
  full-line and trailing `#` comments, and — for a typed token that a bare string could only
  smuggle as prose — an inline `{ key: value, key: value }` map, whose keys are held to the
  documented order the same way the entry's own fields are. The strict parser is the format
  validation.

## The gate check (`qa-ledger` skill)

```sh
node bin/qa.mjs check <qa.yaml>            # lint only
node bin/qa.mjs check <qa.yaml> --gate intent
#   + fail on open entries blocking the business design
node bin/qa.mjs check <qa.yaml> --gate blueprint
#   + fail on ANY open entry with a non-deployment block
node bin/qa.mjs check <qa.yaml> --gate contract
#   + fail on ANY open entry with a non-empty blocks list — the deployment tier included
node bin/qa.mjs check <qa.yaml> --gate intent --map docs/.../seqmap.json
                                           # + resolve exercisedBy ids against the Sequence Map
node bin/qa.mjs digest <qa.yaml>           # #944: answer revision digests + supersession marks
```

- **Intent** (business design blessed): an open entry blocking a `BP##`, an `SIxx.yy`, or a
  `VW##` screen fails the gate — "no open Q&A-ledger entry blocking a promoted element"
  (ADR-040 §3, the same check the gate runs for BPs).
- **Blueprint** (model promotes): any open entry that blocks anything *but* the deployment tier
  fails — by Blueprint the business tier is const and model-tier blocks are exactly what promotion
  must not ignore. Deployment-tier-only entries are reported, not failing (ADR-071 §5).
- **Contract** (the deployment view and the sheets are reviewed): any open entry that blocks
  *anything* fails, the deployment tier included — a deployment decision is ruled before Contract
  (ADR-071 §2).
- **Both gates, and both directions of the exclusion link (#1241).** A checker cannot read the
  `answer` prose, so the *link* between a ruling and the process it removes is **authored** —
  `enforcedBy`. What the check owns is that an authored link is honoured, and that no process is
  quietly out of force with nothing on record behind it:
  - **the ruling says it, the drawing does not** — an `enforcedBy` id whose process carries no
    non-live `status` in the Sequence Map. The exclusion exists only in the ledger, so every
    generator still treats the process as live. A **lint error at any time** (with `--map`), not
    only at gates.
  - **the drawing says it, no ruling does** — a process the map reports `parked`/`retired`/
    `dissolved` that no answered entry claims in `enforcedBy`. A process is out of force and the
    decision that put it there is not on record. A **hard red at both gates**.
  Both need `--map`; a gate run without one prints `enforcement UNVERIFIED` rather than passing
  quietly. The hole the check cannot close is stated plainly here so nobody mistakes green for
  proof: **an exclusion written only in the `answer` text, with no `enforcedBy`, is invisible to
  every tool.** Writing the link is the author's duty, and it is the whole point of the field.
- **Both gates** additionally fail on any `answered` entry with neither `exercisedBy`, `enforcedBy`
  nor `deferred` (ADR-060, #840): a ruling no drawn step can exercise must not cross a gate as a
  silent green — the run-4 undrawn-leg incident (#784) is the precedent. The single escape
  is the explicit `deferred` declaration, which the check prints on every gate run
  (`deferred: QA-### → #NN …`) for the gate record to carry until the step is drawn.
- **Both gates** also fail on any `answered` entry with no `digest` (#1049): the review
  surface renders the digest and hides the verbatim answer behind an expander, so a ruling
  with no digest is a ruling the reviewer meets as a wall of text or not at all. Mid-stage the
  check only reports the count (`digest: N answered ruling(s) carry no digest yet`), the same
  loose-stage treatment `exercisedBy` gets.
- With `--map <seqmap.json>`, `exercisedBy` ids (`SIxx.yy`, `BP##`, `BPxx-Pnn`) must resolve
  against the generated Sequence Map — an unresolvable id is a lint error. `spec:` tokens
  and screen/element names stay shape-checked. `enforcedBy` ids resolve the same way, and are
  additionally read for their process `status` (see the gate rules below).

  **Where each id is looked up in the map** — stated here because reading the map's shape
  wrongly produces a false red on a CORRECT trace, which is the one failure a gate condition
  cannot survive (#1381, #1395, #1430):
  - **`SIxx.yy`** — the **`si` field of an `operations` entry**. Since ADR-069 an `operations`
    KEY is a call site (`BPxx.yy`) and the System-Interaction id is the value on the entry. A
    pre-ADR-069 map keys by `SIxx.yy` and carries no `si` field, so there the key is the id; both
    shapes resolve. An id the map records under `parkedInteractions` (#1256) is drawn only by a
    parked process: still a finding — nothing live exercises the ruling — reported as *parked*
    rather than as absent.
  - **`BP##`** — `processes[].bp` **or `nonLive[].bp`**. Since #1243 a process whose `.bpd`
    header declares a non-live `status` is left out of `processes` and recorded under `nonLive`
    instead, with its `status.state`; being listed there **is** the declaration, and it is
    where an `enforcedBy` claim's process lives by definition.
  - **`BPxx-Pnn`** — `processes[].paths[].id`.
- Open entries with `blocks: []` are parked threads: reported, never gate-blocking.
- Lint always runs (shape, ordering, status/field consistency, blocks vocabulary); the gate
  flag only adds the blocking verdict. Loose-stage rule as everywhere: run freely mid-stage,
  gate only at the gate (ADR-040 §8).

## Consumers

- **Intent / Blueprint presentations** — the check above (tooling contract §9), plus
  `qa citations <qa.yaml> <model.json> [...]` (ADR-060, #812): every `QA-###` cited in model
  prose printed beside the answer it cites; mechanical failure for citations of
  missing/open/withdrawn entries, and for any `QA-###` in the file text that did not come out
  as a row (#1062 — the enumeration a blind review relies on is total, or says it is not).
  Naming an unanswered entry as open is disclosure, not an authority claim: reported, never a
  finding. Reading each pair and stating agreement is the drafting architect's and the blind
  reviewer's named obligation.
- **ADR-028 provenance** — the per-draft journal references `QA-###` ids; the `recording`
  pointer closes the loop to the session record.
- **Model traceability** — model elements may carry a `qa: QA-###` reference (a reference,
  never the content; ADR-040 §3).
