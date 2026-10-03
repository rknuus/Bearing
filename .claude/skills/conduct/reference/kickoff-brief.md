# conduct — reference: The kickoff brief — who performs each gate act (ADR-058 §2)

Part of the `conduct` skill — this section stood in `SKILL.md` and moved here VERBATIM (#1322), so a conductor's boot carries the protocol and opens this at the moment the duty applies. Nothing in it became optional by moving; `SKILL.md` names when to read it.

## The kickoff brief — who performs each gate act (ADR-058 §2)

A re-entry route may skip a gate's **review**, never its **act**. Every stage the route
walks still ends with that gate's human act — **bless** (Intent), **promote** (Blueprint),
**approve** (Contract), **accept** (Acceptance) — performed by the Software Architect or by a
delegate the kickoff brief names **explicitly, per act**. An act nobody is named for is not
skipped: the run **pauses** there.

The brief is a markdown file with two required sections:

```markdown
## Route
Discovery -> Intent -> Design -> Specification -> Contract -> Construction -> Acceptance

## Gate acts
- intent bless: pause-for-SA
- blueprint promote: delegate the overseer session
- contract approve: pause-for-SA
- acceptance accept: pause-for-SA
```

Rules:

- **The acts follow the STAGES, not the gates you listed.** Discovery and Mockup owe Intent's
  act, Design owes Blueprint's, Specification owes Contract's, Construction owes Acceptance's. The route above
  never names Blueprint and still owes `promote` — that is exactly the line a forgetting brief
  leaves out, and exactly what Run 4 discovered at the promotion step, with nobody on the run
  holding the act (#764, #786).
- **Two legal covers, no third.** `delegate <who>` or `pause-for-SA`. Prose ("whoever is
  around") is refused: an actor nothing can read mechanically is an actor the run finds out
  it lacks when the act falls due.
- **Register it:** `theagent2 conduct kickoff --brief <file.md>` lints the route against the
  acts it owes, refuses on an uncovered one, then retains the brief at
  `.theagent/conduct/kickoff.md` and commits it. `--check` lints without writing anything.
  Every `conduct boot` then prints the route and each act's holder, so a successor about to
  perform one reads who holds it instead of guessing.
- **The act still carries the gate's mechanical exit checks** (promotion predicate,
  walkthrough-replay regression, …): each run green or **explicitly waived in writing** in
  the gate record, with the reason. No check is ever skipped silently (ADR-058 §3). Since
  #1071 this is enforced rather than remembered: each gate has a required-check list in the
  gate-dossier template, a `checks:` row answers for one by its `id:`, and a required check
  with no row renders OPEN on the gate page and **fails `dossier-build --check`** once the
  gate is crossed by the run that conducted it. When you cannot run one, record it as
  `verdict: waiver` with the reason, who accepted it, and what would make it runnable — a
  waiver is a review outcome, and "nothing" is no longer the easier option.
