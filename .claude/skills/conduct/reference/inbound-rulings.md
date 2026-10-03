# conduct — reference: Inbound rulings — persist before acting (#824)

Part of the `conduct` skill — this section stood in `SKILL.md` and moved here VERBATIM (#1322), so a conductor's boot carries the protocol and opens this at the moment the duty applies. Nothing in it became optional by moving; `SKILL.md` names when to read it.

## Inbound rulings — persist before acting (#824)

The turns the SA (or an overseer relaying the SA) types into YOUR pane are the run's most
authoritative content and its least durable: a pane turn lives in one session's context,
and the transcript pre-filter reduces payloads to byte counts (#782), so what you do not
write down is gone. Run 4 issued the same standing directive into three sessions' panes
and it reached disk zero times — a rule the run was being conducted under existed nowhere
a successor could read, and a gate record asserted in good faith the opposite of evidence
sitting unpersisted in one conductor's context (#824).

- **Persist before acting.** An inbound turn that carries a ruling, an authorization, or a
  standing conduct directive lands on the conduct surface — an open item, or the Q&A
  ledger / gate record where it belongs — and is COMMITTED before the first act performed
  under it. Commit order is the evidence, and the handover retro checks it (run 4's promotion
  authorization landing four minutes before the promotion is what made that handover verdict
  possible).
- **A standing directive is a ruling.** "Act, then report" changes how the run is
  conducted and binds your successors; it is exactly as persistable as a route ruling.
- **Record the question, not only the answer.** When alternatives were put to the human
  (an option menu, a relayed question), the persisted record restates what was asked and
  what the alternatives were, with the answer, who, and when. "Option 1 accepted" is a
  ruling no later reader can resolve — run 4's OI-060 survives as a record only because
  the conductor restated the ruling in full prose rather than by its menu number.
- **A ruling the standing goal does not explain is a pivot — put the goal back to him
  (#1219).** Persist first, as above; then `theagent2 conduct goal check`, which flags every
  Q&A entry answered since the goal was last confirmed and every `done_when` condition that has
  gone met since (#1232). If you cannot derive the new ruling —
  or the act you are about to perform under it — from the standing goal, say exactly that in one
  line and put your reading back to him (`goal check --doubt "<the act you cannot derive from
  the goal>"` composes it). This is the rarest tier of the cadence and the one that pays: the
  undeclared reversal on the measured run was a ruling that quietly replaced a three-day-old
  one, and it was caught only after work had been committed under it.
- The relay verbs below already persist their half; this rule covers the turns that
  arrive WITHOUT a verb — direct input into your own pane. It slows nothing: the record
  is one open item, written first, with
  `theagent2 conduct open-item add --severity normal --text-file <f> --commit --push`
  (#1124; `--commit` commits this write alone, so the record is committed before the act). Never by editing `state.yaml`: the verb validates the whole surface before it
  lands and assigns the id itself, which a hand edit does neither of.
