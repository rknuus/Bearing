---
name: review-framing-juval-method
description: "Gate-review framing — the SYSTEM DESIGN lens: the Manager / Engine / ResourceAccess / Resource / Utility decomposition, judged against Juval Löwy's Righting Software and the IDesign clinic material, quoted verbatim with chapter and line. Loaded by the `gate-reviewer` agent when its brief names this framing; it is the lens, the agent is the protocol. Its subject is the structure a human freezes at the Blueprint gate — does every component encapsulate one volatility, is the architecture closed, does any component exist that nothing changes, are the call chains symmetric — the judgement no lint can make. Not a knowledge base for designing: `idesign-knowledge` is that. This skill exists to make a REVIEW FINDING citable."
---

# The Juval framing — structure, and the volatility each box owns

You are reviewing the **decomposition and the layering**: which components exist, what each one
encapsulates, and who may call whom. Not the DTOs, the facets or the operation names (that is
`review-framing-monty-ddc`, and a contract finding you make here is a `note` naming that framing).

The Software Architect named this framing on 2026-09-08, beside the Monty one: *"like manager
engine ResourceAccess we should have a Juval-framed agent."*

## ⚠ Proprietary material — the licence position

`method-verbatim.md` quotes **Righting Software and licensed IDesign clinic material verbatim**,
authorised by the licence holder in his ruling of 2026-09-09 (relay R-104, letter «A»): quotation
is allowed **with the file or chapter on every citation**, and the skills ship through the
**private** marketplace. Nothing scans this tree for proprietary content — he was offered that
guard and declined it in the same change, knowingly — so a public export of this plugin is a
**licence event**, not a routine release. The excerpts stay inside the toolchain and inside the
review reports it produces.

## Load order

1. **`method-verbatim.md`** — the structure rules, the design don'ts, the closed-architecture
   relaxations, the symmetry rule and the composition law, each quoted with its chapter and line.
   Load it always; it is your spine.
2. `idesign-knowledge/core-principles.md`, `practitioner-rules.md`, `anti-patterns.md` (a sibling
   skill) — the curated working form, with the counts and the field rules. Good for the *fix* half
   of a finding, and for the component-count bands. **Never cite them as the source.**

## How to review, in the order that works

1. **Start from the volatilities, not the components.** For each volatility the design registers:
   which single component encapsulates it? For each component: which single volatility does it
   own? Two components on one axis is a split that will move together forever; a component on no
   axis is a **phantom**, and the Method's answer is that if there is no volatility you need
   neither a Manager nor an Engine.
2. **Classify every component by the five questions** (`method-verbatim.md`, ch3): who / what /
   how-business / how-resource / where. A component that answers two of them is mis-typed. A
   Manager whose name is a verb, or an Engine whose name is a noun, is the naming rule broken —
   and the naming rule is a decomposition smell, not a style one.
3. **Walk every call chain against the don'ts.** Client → several Managers in one use case; Client
   → Engine; Engine → Engine; Access → Access; anything calling **up**; a queued call to more than
   one Manager; an Engine, Access or Resource publishing or subscribing. Each of those is a
   quotable line, not an opinion.
4. **Check the ends of the chains.** Every leg ends at a ResourceAccess; a Resource is never a
   step's callee (this toolchain's ADR-036 is that rule made mechanical, and the model's own
   checks already cover the mechanical half). What is left for you is whether the Access is doing
   the join the Method says it should do, or whether the Manager is doing it.
5. **Look for symmetry.** Four use cases on a Manager, three of which publish an event and one of
   which does not, is a smell in the source's own words — in *both* directions (absence and
   presence).
6. **Ask the Manager question** — expensive / expendable / almost expendable (ch3). It is the
   sharpest single test of whether a Manager is real, and it is a question you can actually answer
   from a sequence: what happens to this Manager when the use case changes?
7. **Then composition.** Throw the use cases at the structure: does every one of them compose out
   of these boxes without a new box, and without a box doing something it is not? A structure that
   only supports the use cases already drawn has not been validated — it has been transcribed.

## The counts, and how to use them without embarrassing yourself

The bands are in `idesign-knowledge/practitioner-rules.md` (curated) and in the source: **order of
magnitude of 10 components in total**, roughly 5 subsystems, ~5 Managers typically, ~3 Managers
per subsystem with 4+ a smell, a Manager:Engine ratio around 2:1.

They are **norms, not thresholds**. "Six Managers is above five" is not a finding — it is
arithmetic. The finding is what you get when you ask, per Manager, *which axis of change does this
one own*, and two of them turn out to own the same one. Write that; never write the count alone.

## What a good finding looks like

> **F1 — `FeedManager` encapsulates nothing: the Feed subsystem is driven by another
> subsystem's Manager.** `FeedManager` appears on zero sequence steps, while
> `ReconciliationManager` reaches `FeedAccess` 15 times and `ChannelAccess` 13 times — across a
> subsystem boundary. *Righting Software* ch3, Design "Don'ts": a Manager that is
> **"Expendable — you shrug off a change request, thinking little of it. The Manager is
> pass-through — a design flaw and distortion of the architecture."** Either the Feed volatility is
> owned by `ReconciliationManager` and `FeedManager` is a phantom to be struck or marked
> `lifecycle: future`, or the Feed use cases belong on `FeedManager` and the chains are wrong.
> Mechanisable: partly — a check can find a Manager with zero sequence steps; it cannot decide
> which of the two remedies is right.

It names the elements, counts the edges, quotes the rule, and states both remedies without
choosing for the human.

## What a bad finding looks like

> *The decomposition has 30 components, which is above the order of magnitude of 10.*

Arithmetic against a band, with no argument about any component. Do not write it.

## Extraction — the commands, handed to you rather than discovered

His rider on the ruling that put this reviewer on Fable (2026-09-09): *"it shall make use of
subagents to gatther data … How the data shall be extraced may be a good candidate for telling it
(so he does not have to find out himselves during the review)."* So: **dispatch a `Task` helper per
extraction, name its model, and give it the command below.** Every one of these is a trap this run
has already paid for once; none of them is guesswork.

| what you need | the command that works | the trap it avoids |
|---|---|---|
| the canonical model | `sns-cli read --kind ReadArchitecture --project <Project> > out.json` | **never** `theagent2 sns read` (the wrapper dies with ENOBUFS at ~1.9 MB) and **never** `--draft` on a promoted store (exit 4). A read that shows an Access with no facets and untyped `operationDraft` prose is the WRONG model |
| the SI/gateway coverage | `BPMN_DSL=<docs>/_bpmn-dsl-ast-flush-shim.mjs node <seqmap>/seqmap.mjs complete <bpd dir> <parked/future> <parked/abandoned> --binding <si-binding.yaml> --model <fresh export> --screens <vw dir>` | naming only one parked folder, or none, invents findings about processes nobody is building |
| the model-rule lints | `node .claude/skills/sns-cli/bin/model-dto-shape.mjs --project .` and `node .claude/skills/sns-cli/bin/model-string-kind.mjs --project .` | these are your FLOOR: a finding that repeats one of them is a wasted round |
| the resource sheets | `node .claude/skills/sns-cli/bin/resource-protocol.mjs --check --model <fresh export> --deployment <docs>/03_Deployment --csharp csharp` | `--csharp .` walks out of the project through a symlink and aborts on foreign fixtures — it reads as a project defect and is not one |
| the ruling citations | `node .claude/skills/qa-ledger/bin/qa.mjs citations <qa.yaml> <fresh export>` | the ADR-060 collision; you must state agreement per pair, in writing |

Two standing rules for the helpers: **redirect big reads to a file** (a 1.9 MB payload through a
pipe truncates silently), and **read the evidence yourself** before you write a finding on it — a
helper returns data, never a judgement.

## One thing this framing must not do

**Do not redesign.** You may say a component owns no volatility and name the two ways out; you may
not propose a new decomposition. The architect authored this model with the business design in
front of them and a Q&A ledger behind them, and a reviewer who re-decomposes from the outside is
producing a second design, not a review of the first one.
