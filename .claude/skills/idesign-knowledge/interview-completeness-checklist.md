# Interview completeness checklist

The interview-architect runs through this checklist **before** suggesting wrap-up. Each item is a question whose answer should already be persisted (in the SNS model or the design journal) or is explicitly an open thread the user has decided to defer.

**This is not a quality bar for the *answers* — it's a coverage bar for the *questions*.** A "yes — covered" answer can mean "we addressed it and persisted findings" or "we explicitly chose to leave it open and noted it in the journal." A "no — not yet covered" means the agent has work left.

If any item is "no" and the user hasn't explicitly deferred it, the interview is not complete — keep asking.

---

## Volatility coverage

1. **Have all four volatility categories been *considered* (Customer / Time / Domain / Implementation)?** Not every project has volatilities in every category — but *consideration* means the agent has asked the question and either persisted a volatility or recorded "no volatility along this axis" reasoning in the journal.

2. **For each persisted volatility: is the *encapsulation boundary* clear?** I.e., a single component in the eventual drafting can encapsulate this volatility's range without leaking into other components. If unsure, it's a parked question for the drafting architect.

3. **Have *rejected candidate volatilities* been recorded with their rejection reason?** The journal's "Alternatives considered + rejected" section.

## Use-case coverage

4. **Are the system's primary use cases all named?** "Primary" means the use cases that justify the system existing. Secondary / edge cases can come later in drafting.

5. **For each use case: at least one acceptance criterion?** Not a comprehensive test plan — just enough that the drafting architect can identify the use case's success boundary.

6. **Are *permutations* (alternative paths through a use case) considered for any use case where they materially change the architecture?** Not required for every use case; required where the alternative path changes the components involved.

## Decisions

7. **Are user-declared *constraints* recorded as decisions?** Things the user has said are non-negotiable (deployment model, partner contracts, regulatory boundaries, etc.) — even if they're not formally "decisions" in the dialectic sense, capturing them prevents the drafting architect from reopening them.

8. **For each decision: is the *rationale* substantive?** A decision with rationale "user said so" is weak. The rationale should reference the constraint, observation, or volatility the decision resolves.

## Operational concepts

9. **Latency posture surfaced?** What's the user's actual sensitivity to delay — synchronous, near-real-time, eventually-consistent, batch? Often implicit; persist explicitly.

10. **Consistency posture surfaced?** Strong, eventual, per-aggregate, cross-aggregate? Especially when use cases imply cross-system events.

11. **Error-handling / recoverability posture surfaced?** What's the user's tolerance for partial failure, retry behavior, manual reconciliation? Persist as op-concept.

12. **Observability / telemetry posture surfaced?** Not necessarily a full plan — but the user's mental model of "what do we need to see when something goes wrong" should be captured.

## Cross-cutting concerns inventory

13. **Have *cross-cutting concerns* been enumerated?** Identity, authentication, multi-tenancy, audit, retention/privacy, regional partitioning. Each either becomes an op-concept, a volatility, or a decision. None should silently fall through.

14. **Are there *entity lifecycles* with discrete states + transitions?** When the domain has things that go through states (order: pending → shipped → delivered → returned; subscription: trial → active → paused → cancelled; ticket: open → resolved → closed), lifecycle is a first-class architectural anchor. The drafting architect will want this explicit. Capture as op-concept or as a use-case sequence-step.

## Spec quality (mission / vision / background / objectives)

15. **Mission**: ≤ 2 sentences. Names the system's purpose. Answers "why does this thing exist." Persist via `update --kind Spec --mission`.

16. **Vision**: aspirational. Describes the *end-state of the world* the system contributes to — not a mechanistic description of features. Easy test: "Does the vision describe what's *true about the world* if we succeed, vs what the system *does*?" Persist via `update --kind Spec --vision`.

17. **Background**: 1–3 paragraphs. Context that doesn't fit anywhere else — domain frame, history, the problem space we inherit. Persist via `update --kind Spec --body` (Spec body = background).

18. **Objectives**: bullet list of concrete success criteria (JSON array on the wire). Different from acceptance criteria of use cases — these are *project-level* objectives.

## Deferred items

19. **Have items deferred to other stakeholders / future sessions been explicitly captured?** "I need to ask my product manager about X" / "We don't know yet, will revisit in the next interview pass" — these belong in the journal under "Open threads", not lost.

---

## When to run this checklist

- **Before** the agent first suggests "I think we have enough; want to wrap up?" — the agent runs the checklist silently, and if items 1–19 are not all "yes — covered" (model or journal) or explicitly deferred, the agent does NOT suggest wrap-up yet.
- **When the user asks "are we done?"** — the agent runs the checklist out loud, surfacing each item's status, before answering.

## Discipline

- The checklist is a coverage check, not a quality bar. Quality lives in the dialectic and the challenge skill.
- "Persisted in the journal" counts as covered — not every item becomes a model entity.
- An item explicitly deferred by the user is covered. Items silently skipped by the agent are not.
- The checklist supplements, doesn't replace, `dialectic-questions.md` and `idesign-challenge`. Those are about quality of analysis; this is about whether the analysis has surfaced everything that matters.
