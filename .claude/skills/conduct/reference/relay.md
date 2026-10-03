# conduct — reference: Relaying a question to a human pane (#781)

Part of the `conduct` skill — this section stood in `SKILL.md` and moved here VERBATIM (#1322), so a conductor's boot carries the protocol and opens this at the moment the duty applies. Nothing in it became optional by moving; `SKILL.md` names when to read it.

## Relaying a question to a human pane (#781)

The pane you put product questions to is **not a conducted session** (Run 4: the proxy
owner in `run4-proxy`), and the tmux transport has no integrity check: `send-keys` exits 0
whether or not the pane received the keystrokes — a pane sitting on a dialog eats the
paste — and `capture-pane` returns the *visible* rows, so a long ruling is clipped and a
truncated answer is indistinguishable from a terse one. Run 4 lost two owner rulings that
way. **Never retype a ruling out of a pane capture.**

- **Ask:** `theagent2 conduct relay send --pane <pane> --message <question.md>` — the
  question is a FILE (it is retained and committed before the paste, so the ask outlives
  you), and it carries its own delivery contract: the pane writes its COMPLETE answer to
  `.theagent/conduct/relay/<id>.answer.md`, terminated by `RELAY-RECEIPT <id> <nonce>`.
- **Ask a ROLE instead of a pane:** `theagent2 conduct relay send --to <role> --message
  <question.md>` (ADR-072 §2). `--to` resolves the role's OPEN ledger row to its live pane,
  the way `conduct await` resolves a pane from a ledger id — so nobody has to know which
  serial a role carries today, and a succession cannot misdirect a question. Use `--to
  sa-twin` when the run has a twin registered. **A role with no live session is not a
  failure:** the question is still retained and committed, the record reads `pane: none`, and
  `relay status` lists it **UNADDRESSED** — nobody has been asked yet, and whoever boots into
  that role next collects it first.

**A question for HIM is self-contained, and the verb now enforces the lede (#1267).** He must be
able to answer it on a phone with nothing else open. Write it in this order:

1. **What this is about**, in the design's own words — the business process, the screen, the
   operation — two sentences. An issue number is a reference at the **end**, never the subject.
2. **What we believed / what is true now**, one sentence each, when that is why the question exists.
3. **The options**, each with what it does to the model and to the gate, one sentence — and your
   recommendation.
4. **How to answer**: one letter.

`relay send` refuses a question for him whose FIRST SENTENCE leads with an issue number, a commit
hash, a session id, a relay id, an open item or a friction id — the cheapest proxy there is for
"written for the tracker". Nothing below the lede is checked, and a good question *does* cite its
issue. The refusal applies to `--pane` and `--to sa` only: a relay `--to <role>` is one session
writing to another, and for those an id is exactly the right subject.

His words on the shape that was refused, 2026-09-06: *"questions like this are not self-contained
and I have no chance to anser them"*.
- **Collect:** `theagent2 conduct relay receive <id>` — verifies the receipt, commits the
  answer, prints the FILE. Three loud failures replace the silent drop: **UNDELIVERED**
  (exit 3, no answer file — the paste never landed), **INCOMPLETE** (4, no terminator —
  the writer stopped mid-ruling), **MISMATCH** (5, wrong nonce or an answer edited after
  its receipt).
- **Carry it back:** `theagent2 conduct relay deliver <id>` (ADR-072 §§3, 5) — the return
  leg. It commits the answer file path-scoped when nobody has, verifies the receipt (through
  `receive`, so the three loud exits are unchanged), **captures the Interviewer's pane and ENDS
  that session**, and then hands the answer to the session that asked: pasted into its pane when
  it is still live, or — the normal case — printed as the `theagent2 conduct dispatch --fork
  <asker> --role <its role> --answer <id> --name <slug>` line, because a session that asks ENDS
  and comes back as a fork.
    - **The ending** is his complaint of 2026-09-07: *"I can now see quite some attention
      sessions still being there … otherwise, I don't know which one I have to put my attention
      on and which one not."* An answered Interviewer left alive is indistinguishable in his list
      from one holding an open question, and until this the ending was a `/exit` somebody typed
      by hand. `--keep` overrides it.
    - **The capture comes FIRST, and it is not optional.** The same day, four SA-ATTENTION rows
      were closed as answered and their sessions ended four minutes and nine seconds after he had
      typed a four-paragraph RULING into one of those panes. Nobody read it; a handover retro
      recovered it two and a half hours later and it reversed his own earlier position. So the
      whole scrollback goes to `<id>.pane.txt`, committed, and its tail into the deliverer's own
      output — that is the read. A typed turn the answer file does not account for stops the
      ending outright, is retained at `<id>.unread.md`, and leaves the session running.
    - **Never kill an SA-ATTENTION pane by hand** — not `tmux kill-session`, not `/exit` typed
      into it. `relay deliver` is the ending; `theagent2 conduct await <id> --close` is the
      deliberate one. Both leave a record.
- **Inherit:** `theagent2 conduct relay status` — an OPEN relay is a question a human was
  asked and nobody collected. It is yours whether or not you sent it. An UNADDRESSED one is
  listed first: it is a question nobody has seen at all.

The receipt proves the answer arrived whole, for that question. **Who wrote it is a
separate claim, and the record settles it from git** (#815): `receive` reads the commit
that introduced the answer's bytes, so the relay record says either

- `identity: authored` + `answer_author: <name> <email>` — the pane wrote the file **and
  committed it**, under an identity that is not the collector's. That commit is the
  independent evidence, and a gate record may cite it by name; or
- `identity: collected` + `collected_by: …` — nobody but the collector committed it, or a
  commit that merely swept the file up was **declined** as evidence and the row says why in
  `authorship_declined`. The answer is whole and answers that question; authorship rests on
  the collector's word. **Do not write "he wrote and committed it himself" over a
  `collected` relay** — that is the exact sentence Run 4's Contract record and conduct
  state carried without support.

**A commit is not an act of authorship just because it touched the file (K-020).** On
2026-09-10, 58 of one run's 186 relay rows read `identity: authored` and every one of the
58 named a **conducted session** in `answer_author` — not one named a human, and three of
them were questions the Software Architect was still asleep in front of. Nobody forged
anything: `git add .theagent/conduct/` in an unrelated bookkeeping commit is enough, because
"the last commit touching this path" is satisfied by any sweep. So `authored` now needs all
of four things, and every failure is reported on stdout and on the row:

1. the commit **introduced the answer's own bytes** — not an earlier draft of them;
2. it changed **nothing else** — one file, or it is bookkeeping;
3. the answer file does not itself say `identity: collected` — the writer's statement about
   its own file wins, and a declaration can only **lower** the claim (a file claiming
   `authored` grants nothing);
4. for a question addressed to **him** (`to: sa`), the committer carries **no `+S-###`
   subaddress** — a session identity in that slot disproves what it claims.

**`theagent2 conduct relay identity [<id>] [--fix]`** re-runs that settlement from the
evidence, for one row or every received row, and **exits 6** when a row claims more than the
evidence supports — so it is the audit to run **before a gate record cites a relay as
somebody's own act**. `--fix` rewrites the failing rows from the same evidence; there is
deliberately no flag that *sets* `authored`.

So for a ruling a gate will be blessed on, ask the pane to **commit its own answer file, by
itself, in one path-scoped commit** before you receive it. Quote a relayed ruling into a Q&A
entry or a gate record from the received file, citing the relay id and the identity field.
