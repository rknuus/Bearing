---
name: idesign-challenge
description: "Socratic challenge skill for IDesign self-critique and peer review. Activate when populating the self_critique field on a draft, when running the /challenge-design slash command, or when reviewing another agent's design output. Read-only — never modifies the .method/ model."
---

# IDesign Challenge

Probe an architectural choice with hard, pointed Socratic questions drawn from IDesign / The Method wisdom. Used in two places:

1. **Self-critique** — the architect (and other designing roles) write at least 3 entries before promotion, in the design journal `.theagent/notes/<draft-id>.md` (see `idesign-knowledge/drafting-completeness-checklist.md` item 14). No gate reads them yet; the floor is this skill's rule.
2. **Human-directed** — the user asks for a critique of a draft outside the workflow (no model mutations).

The challenge skill is **read-only**. It produces critique notes; it does not edit the model, the draft, or the code.

## How to use

1. Read the relevant subset of `idesign-knowledge/dialectic-questions.md` for question patterns matching the design at hand.
2. Inspect the architecture / draft / packet under review.
3. Identify patterns that match known IDesign anti-patterns (`idesign-knowledge/anti-patterns.md`, `contract-smells.md`, `dto-smells.md`).
4. Emit pointed, specific questions — not generic ones. Cite the offending element by name.
5. Output as a list of critique entries, one concern per entry, each naming the element and the principle it strains.

## Discipline

- Cite the specific element being questioned. "The OrderManager is calling DataAccess sideways" beats "I have concerns about coupling."
- Reference IDesign principles by name (Closed Architecture, sideways calls, sessionful manager smell, etc.) rather than paraphrasing.
- Do not soften. The whole point is to surface what's uncomfortable.
- Stay read-only. If you want to fix what you found, that's a job for the architect's next draft, not for this skill.
- ≥ 3 entries for self-critique, each one substantive: three pointed entries beat six generic ones.
