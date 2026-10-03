---
name: idesign-knowledge
description: "IDesign / The Method architecture knowledge base — volatility-based decomposition, Manager/Engine/ResourceAccess/Resource layering, contract and DTO discipline, anti-patterns, dialectic questions, validation rules. Activate when working on architecture, components, contracts, or design review in this project."
---

# IDesign / The Method Knowledge Base

This skill is a small library of IDesign methodology references that designing, reviewing, and constructing roles in theagent2 load on demand. Each topic is a separate companion file in this skill directory; load only what's relevant to the current task.

## Topics

| File | When to load |
|---|---|
| `core-principles.md` | Volatility-based decomposition, the four laws, Manager/Engine/RA/R/U layering, encapsulator rules. Foundational — load first when designing or auditing a new architecture. |
| `practitioner-rules.md` | Field-tested rules: the five laws, subsystem count, naming, risk targets, iFX, API/messaging/data/Saga discipline, mentorship, hard "do not"s. Load alongside `core-principles.md` for the rule reference. |
| `detailed-design.md` | The Method's per-component detailed-design discipline. The construction loop's `detailed_design` step. |
| `contract-smells.md` | Anti-patterns in contracts (interfaces). Load when designing or reviewing a contract. |
| `dto-smells.md` | Anti-patterns in DTOs. Load when designing or reviewing data shapes. |
| `anti-patterns.md` | Common architectural anti-patterns at the system level. Load during architecture review or drift analysis. |
| `dialectic-questions.md` | Socratic prompts for challenging an architectural choice. Load before or during a self-critique pass. |
| `interview-completeness-checklist.md` | 19-item coverage checklist the interview-architect runs before suggesting wrap-up. Different from `dialectic-questions.md` — that one's about quality of analysis; this one's about whether the analysis has surfaced everything that matters. |
| `drafting-completeness-checklist.md` | 14-item coverage checklist the drafting-architect runs before `DONE ▸`. Scoped to Design-phase decomposition only — explicitly defers DTOs, test plans, facet rationalization, and exact signatures to Construction.detailed_design. Use this as the pre-handoff walk-through. |
| `validation-rules.md` | Concrete checks the conformance auditor and the static validator apply. Load when running validation or auditing conformance. |
| `observability.md` | Where IDesign expects telemetry, logging, and traceability. Load when designing observability layers. |

## How to use

1. Read this index. Select the 1-3 topics relevant to your current task.
2. Use `Read` on the chosen file(s). Paths are relative to this skill directory.
3. Do not read all files unless you genuinely need the full reference — they are individually substantial.
4. The IDesign source of truth is `../theagent/sources/` and `../theagent/.method/` outside this project; this skill is a curated subset, not a full mirror. If you need something missing, ask the user before improvising.

## Rules

- This is a *knowledge* skill, not a *workflow* skill. It describes IDesign principles; it does not prescribe theagent2 CLI invocations. Plumbing lives in other skills.
- Don't paraphrase from training data. The Method has specific discipline; cite from the companion files when you state a rule.
