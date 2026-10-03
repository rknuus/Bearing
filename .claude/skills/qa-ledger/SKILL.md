---
name: qa-ledger
description: "The project's Q&A ledger (.method/qa.yaml, ADR-040 §3) — the typed, append-only home of design questions that need a stakeholder/owner answer: the AI appends questions with what they block, the Software Architect records answers with provenance; parked threads live here too. Ships the gate check: `qa check` lints the ledger and enforces 'no open Q&A-ledger entry blocking a promoted element' at Intent (business tier) and Blueprint (any block). Activate when a design question needs the stakeholder (append an entry instead of guessing), when recording or looking up an answer, when picking up parked threads, or when checking Intent/Blueprint ledger readiness. Format: process-specs/qa-ledger-format.md."
---

# qa-ledger — the Q&A channel's home (`.method/qa.yaml`)

A genuine domain gap during design does not get guessed around — it travels the Q&A channel
(ADR-040 §3): **the AI raises a typed question, the Software Architect puts it to the
stakeholder, the answer lands here with provenance.** The ledger is append-only design
history; promotion never squashes it. Format (single source, do not restate):
`process-specs/qa-ledger-format.md` — theagent2 ships the process-spec set as
`process-specs/`, next to the `agents/` and `skills/` it installs.

## Where it lives

`.method/qa.yaml` — next to `architecture.yaml`, **never inside it**. Before the `.method`
store exists (Stages A–B), create the bare folder and the file; it is just a file.

## How to append a question (the AI's side)

Edit the file directly — no tool, no ceremony. Take the next `QA-###` id (strictly
ascending), `status: open`, the question, `blocks` (the ids your work is stuck on — empty
list for a parked thread), `audience` (who can settle it), `asked`, `source` (where it
arose). One line per field, tight wording; longer context stays in the session notes your
`source` points at.

```yaml
  - id: QA-007
    status: open
    question: "May a driver record a partial cash payment, or is it all-or-owed?"
    blocks: [BP07, SI03.01]
    audience: owner
    asked: 2026-07-19
    source: "Design-stage decomposition of the settlement volatility (harvest item V-07)"
```

**`audience` is required on every open entry** and is one of exactly two words (ADR-062):

- `owner` — business truth only the stakeholder can settle ("does the minimum apply before
  or after the discount?"). These are the questions read out at a stakeholder call.
- `architect` — methodology and judgement calls that are the Software Architect's ("should
  this operation have an SI behind it?").

Pick by *who can answer it*, not by who is nearer. Guessing here routes a stakeholder
question to the wrong person, and the field exists precisely so no LLM has to re-read the
prose to decide. It stays optional on `answered`/`withdrawn` entries — those are history.

Then run `qa check` — the strict parser is the format validator.

## How answers land (the Software Architect's side)

Flip `status` to `answered`, add `answer` (verbatim or tight paraphrase), `answered` date,
optionally `answeredBy` and a `recording` pointer. Dead questions get `status: withdrawn` +
`withdrawn` date (+ `reason`) — entries are never deleted. Model elements the answer
unblocked may carry a `qa: QA-###` reference (a reference, never the content).

**Trace the ruling** (ADR-060, #840): add `exercisedBy: [...]` naming the drawn artifact
that exercises the ruled behavior — an `SIxx.yy` / `BP##` / `SQ` / `CC` / `VW` id, a walked
path id `BPxx-Pnn`, or `spec:<PropertyName>` for rulings that are not step-shaped. If the
behavior is ruled but deliberately not in this release, use
`deferred: "#NN — <one-line scope note>"` instead (issue ref required; mutually exclusive
with `exercisedBy`). A missing trace is fine mid-stage and a **hard red at every gate**.

**A ruling that REMOVES something names its enforcing surface** (#1241, SA 2026-09-05): if the
answer takes a business process out of scope, add `enforcedBy: [BP07]` — the process whose own
`.bpd` header must declare `status parked|retired|dissolved` (tooling contract §1a). `BP##` ids
only; mutually exclusive with `exercisedBy`, and it may sit beside `deferred`. The link is
checked both ways under `--map`: a claim over a process that still reads live is a lint error,
and a non-live process no ruling claims is a hard red at both gates. **A scope decision written
only in the `answer` prose is invisible to every tool** — that is what this field ends.

**A ruling the TOOLCHAIN carries names the change** (figaro#406, SA letter «A» on figaro#404,
2026-09-08): if the answer's whole content is *"the toolchain changed and the model did not"*, add
`toolingBy: { kind: issue, ref: "figaro#316" }` — or `{ kind: commit, ref: "<repo>@<sha>" }`, the
same field's other form. Nothing drawn exercises such a ruling, no process goes out of force and
nothing is deferred: the work is **done**, just not done in the model. The value is a **pair, never
a bare string** (a token a program reads is typed, not prose it must parse), `kind` is a closed
enum because the check branches on it, and the reference must be **repository-qualified** — a bare
`#316` names an issue in no stated repository and is refused. It stands alone: mutually exclusive
with `exercisedBy`, `enforcedBy` **and** `deferred`. It prints on every gate run
(`tooling: QA-### → issue <repo>#<n> …`) so the gate record can carry it.

**Write the digest in the same edit** (#1049, SA ruling 2026-08-26): `digest:` is two or three
sentences of plain language saying what the ruling means, and `digested:` is the day you wrote
them. The review surface renders the digest and puts the verbatim `answer` one expander away —
a 4'600-character ruling is a wall nobody reads at review time. Three standing rules: the
digest is **non-authoritative** (the `answer` governs, and every surface says so beside it), it
covers the **current state only** (no history, no supersession narrative, no decision dates),
and it is rewritten **whenever the answer is** — `digested` older than `answered` fails the
lint, and a missing digest is a hard red at every gate.

## The gate check

```sh
node bin/qa.mjs check <qa.yaml>            # lint (shape, append-only ids, status/field consistency)
node bin/qa.mjs check <qa.yaml> --gate 1   # + open entries blocking BP##/SIxx.yy/VW## fail
node bin/qa.mjs check <qa.yaml> --gate 2   # + ANY open entry with non-empty blocks fails
node bin/qa.mjs check <qa.yaml> --gate 1 --map docs/.../seqmap.json
                                           # + exercisedBy SI/BP/path ids must resolve in the map
node bin/qa.mjs digest <qa.yaml>           # the answer revision digest + who supersedes what
```

**The revision digest** (#944, SA ruling 2026-08-23): `qa digest <qa.yaml>` prints every
answered ruling with an 8-hex fingerprint of its normalised `answer`, and marks each one a
later entry has declared it `supersedes`. Those are the **two ways a ruling goes stale** under
an artifact that asserts it: the wording was edited (the fingerprint moved), or the ruling was
replaced outright. The second is the load-bearing one — no answer in this ledger's history has
ever been edited in place, so every real change of mind is a new entry (QA-025 → QA-026 →
QA-028), and run 4's Contract bounce was exactly that shape. **A report, not a gate:** where an
asserting artifact records the fingerprint it was written against, and which gate the staleness
reddens, are not ruled yet.

**The citation report** (ADR-060, #812): `qa citations <qa.yaml> <model.json> [...]` prints
every `QA-###` cited in model prose SIDE BY SIDE with the ledger answer it cites — the
collision run 4 never performed (four model notes cited QA-026 while asserting its opposite,
all checks green). It fails mechanically on citations of missing/open/withdrawn entries, and on
any `QA-###` the model file's text holds that did not come out as a row (#1062 — figaro's Review
5 got 50 rows against 59 occurrences, one whole use case's citations missing, and nothing said
so; a reviewer told to check *every* citation needs the enumeration to be total or to say that
it is not). Naming an unanswered entry AS OPEN — "QA-034 is open and blocks this SI" — is
disclosure, not an authority claim: reported, never a finding, the same treatment `qa stamps`
gives its pointers. Judging agreement is the named duty of Design-stage drafting completeness and
the blind ADR-015 review brief, pair by pair, in writing.

Intent = the business design promotes; gate 2 = the model promotes ("no open Q&A-ledger
entry blocking a promoted element", ADR-040 §3). Open entries with `blocks: []` are parked
threads — reported, never blocking. **Both gates also fail on any answered ruling with
none of `exercisedBy`, `enforcedBy`, `toolingBy` or `deferred`** — a ruling nothing drawn can
exercise must not cross a gate green (ADR-060; the run-4 #784 incident). Deferred rulings,
exclusions and toolchain traces print on every gate run (`deferred: QA-### → #NN …`,
`enforced: QA-### → BP07 out of scope …`, `tooling: QA-### → issue <repo>#<n> …`); the
gate record carries each one. Pass `--map` at gates: without it the exclusion check cannot run
and the gate says `enforcement UNVERIFIED` (#1241).
**Both gates likewise fail on any answered ruling with no `digest`** (#1049) — the review
surface would have nothing to show but the verbatim wall. Mid-stage the check only counts them.
Loose-stage rule (ADR-040 §8): run freely mid-stage; it gates only at the gate presentation.
