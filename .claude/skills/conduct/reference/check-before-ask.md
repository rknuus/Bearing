# conduct — reference: Check before ask (#822)

Part of the `conduct` skill — this section stood in `SKILL.md` and moved here VERBATIM (#1322), so a conductor's boot carries the protocol and opens this at the moment the duty applies. Nothing in it became optional by moving; `SKILL.md` names when to read it.

## Check before ask (#822)

A human ruling is the run's scarcest resource. Escalation duty runs both ways: sitting on
an open question is a conduct failure, and so is putting a question to a human whose
answer is already on disk — it launders an unchecked assertion into a blessed one (Run 4
did it six times; the one question the conductor **computed** first closed in one round).

- **Gate assembly:** every item the record asks a reviewer to *confirm* must quote,
  verbatim beside the assertion, the ruling it rests on — or state that no ruling covers
  it. These are different requests and the item says which one it is making:
  *confirm the reading of QA-0NN (quoted)* vs. *judgement call — no covering ruling*.
  An item that cannot name its authority is not a judgement call; it is an unchecked
  assertion, and it is yours to resolve before assembly, not the reviewer's.
  The gate record carries this in the `confirm:` list's `authority:` field — a ruling id
  with the quote, or `none` with a `basis:` line naming what you checked — and
  `dossier-build --check` refuses an item that carries neither, so an unchecked assertion
  fails your own build before it reaches a human (#845,
  `process-specs/gate-record-format.md`). Parking the ask somewhere else in the record does
  not get you out of it, and there is no field left to park it in: the build reads EVERY
  string a record carries for confirm-shaped prose and asks the same question of whatever
  carries it (#862, #873, #879 — only the declaration fields, the closed vocabularies and the
  paths are exempt). Where the ask is genuinely both evidence and a request — a tracked open
  item, an amber check — keep it where it is and name the authority there; where the words only
  *look* like a request, say so in one line with `not_an_ask:`. A section blurb and the
  record's own `lede`/`disposition` are the places where moving the ask is almost always the
  answer: they say what a group of artifacts is and what the gate decided, and a request
  written in either is tracked, answered and closed nowhere.
- **The verb looks first, and it costs nothing** (Kaizen K-010). `conduct relay send --pane`
  and `--to sa` — the two addresses that end at a human — search this surface for records
  already using the question's own words, and print what they find: the relay ANSWER files,
  the ARCHIVE and the STATE, with the id, the date, the letter the answer states and the
  phrase that matched. It reads phrases and not meaning, so a candidate may be a neighbour
  rather than the same question; it never blocks, and it replaces none of the duty above. What
  it replaces is the case where nobody looked: on 2026-09-10 a question he had answered at
  15:20Z was put to him again at 18:51Z, and a whole Interviewer session had to be born to find
  that out — twice, for $2.44. Read the candidate lines before you send the next one, and say in
  the question itself why the precedent does not cover it.
- **Every escalation:** state what was checked and what the check found — or why it
  cannot be checked. Compute what is computable and present the computation; that is
  what makes one round suffice. A conductor's spot-check is not a sweep and a
  predecessor's addendum is not evidence — check the source, or dispatch a session that
  can.

This narrows nothing about routing: a question that is genuinely the owner's or the SA's
still goes to them — it arrives carrying its check.
