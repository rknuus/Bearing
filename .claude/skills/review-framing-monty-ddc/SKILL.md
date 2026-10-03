---
name: review-framing-monty-ddc
description: "Gate-review framing — the DETAILED DESIGN lens: DTOs, facets and operations, judged against the IDesign Detailed Design Clinic material and Monty Montgomery's alumni posts, quoted verbatim with their file names and thread ids. Loaded by the `gate-reviewer` agent when its brief names this framing; it is the lens, the agent is the protocol. Its subject is the contract surface a human freezes at a gate — is this factoring cohesive, are these operations business verbs, does this DTO align with a use case or with a table — the judgement no lint can make. Not a knowledge base for designing: `idesign-knowledge` is that. This skill exists to make a REVIEW FINDING citable."
---

# The Monty framing — detailed design, on the contract surface

You are reviewing **DTOs, facets and operations**. Not the layering (that is
`review-framing-juval-method`, and a layering finding you make here is a `note` naming that
framing). Not the business truth. Not the code.

The Software Architect named this framing himself, on 2026-09-08: *"the gate where the method
model is being inspected by the human should be reviewed by an agent that is framed towards Monty
Montgomery's DDC material and all the IDesign alumni mailing-list stuff … Monty should review the
DTOs, the facets and the operations."*

## ⚠ Proprietary material — the licence position, and what it binds you to

The companion files quote **licensed IDesign clinic material and the IDesign alumni mailing list
verbatim**. That quotation is authorised by the licence holder, the Software Architect, in his
ruling of 2026-09-09 (relay R-104, letter «A»): the framing skills **may** quote the clinic
checklist, the book and the alumni posts verbatim, **with the file name or the thread id on every
citation**, and they ship through the **private** marketplace like every other skill.

Two things follow, and they are not decoration:

1. **Every quote you use carries its citation.** That is the condition of the licence, not a
   style preference.
2. **These files are not public material.** Nothing scans the theagent2 skills or the marketplace
   export for proprietary content today — he was offered the guard and declined to build it in
   the same change, knowingly. So a public export of this plugin is a **licence event**, not a
   routine release. Do not copy these excerpts into a public artefact, an issue body, a README or
   anything leaving the toolchain. A review report quoting them stays inside the project it
   reviews.

## Load order

1. **`checklist-verbatim.md`** — the IDesign *Detailed Design Checklist*, whole and verbatim. It is
   two pages and it is your spine: walk the artefact against it, item by item. Load it always.
2. **`alumni-monty.md`** — Monty's and Juval's own words on contract and DTO factoring, with thread
   ids, plus the measured design metrics from a real Method detailed design. Load it when you need
   a rule the checklist states tersely, or a number.
3. `idesign-knowledge/contract-smells.md` and `dto-smells.md` (a sibling skill) — the curated
   working form of the same material, with remedies. Useful for writing the *fix* half of a
   finding. **Never cite them as the source**: they are this toolchain's paraphrase. The source is
   the checklist and the threads.

## How to review, in the order that works

The DDC's own process is *"Just keep sketching"* — yours is *just keep colliding*: one rule, one
element, one verdict.

1. **Read the contract surface first, not the sequences.** Facets, then operations, then DTOs. A
   contract is read the way a consumer meets it — Monty: *"Your soul is laid bare in your
   contracts."*
2. **Per facet:** is it one cohesive unit of behaviour, or a grab bag? Is it a *dull facet* (one
   operation, no reason to exist)? Do two facets on one component encode the same context twice?
   Count facets per component: several facets on one Manager is normal; a Manager that has
   collected a dozen is *"Multiple contexts in same Manager contract"*, which is a checklist line.
3. **Per operation:** does the name imply an **action** the business would recognise? A `Get`,
   `Load`, `Set`, `Save`, `Upsert`, `FindBy…`, `…ByStatus` is the checklist's *naming prefixes and
   suffixes* and its *operation names that do not imply action*. Count parameters. Count operations
   per contract against the measured norms in `alumni-monty.md` — 3–5 optimal, never more than 20.
4. **Per DTO:** does it align with a **use case** or with a **table**? Is it canonical — one DTO
   serving several unrelated operations? Does it carry properties that only apply in some of its
   own populations (the discriminator-beside-optionals shape)? Does it leak a resource entity, a
   database id, a schema name? Is there logic in it?
5. **Then, and only then, the joins:** does each operation's request and result belong to that one
   operation (the DTO pattern, scoped), or is a shared bag passed around? Are the same concepts
   named the same way across facets?
6. **Collide with the lints last.** The mechanical checks in your inputs have already reported the
   string-typing and DTO-shape classes. Your findings must be what they cannot see: cohesion,
   naming, meaning, factoring, and whether an operation corresponds to a **feature** rather than to
   a use case.

## The three questions the DDC asks of every facet

From the design process Juval describes in the alumni thread `F07NI8D93Xg` (*Detailed Design Write
Up*), quoted in `alumni-monty.md`: *"Is this logically consistent? Is this cohesive? Is this an
independent facet? Is there high variability where polymorphism can help?"*

Ask them literally, per facet, and write the answer.

## What a good finding looks like

> **F3 — `IArticleListing.LoadArticlePage` returns `ArticleListingRow`, which is the article
> table.** `ArticleListingRow` carries `ArticleNumber`, `Description`, `CostPrice`, `ListPrice`,
> `StockOnHand` and `ArticleVersion` — the storage row, forwarded. *Detailed Design Checklist*,
> DTO Smells: «Table schema DTOs»; Guidelines: «DTOs must always align with use cases, not
> resource schema». The use case is *decide whether this article may be listed*, and it needs a
> price, a floor and a state, not a row. Mechanisable: no — a checker cannot tell a use-case
> aggregate from a table.

What makes it good: it names the element, it quotes the rule, it says why the rule bites **here**,
and a reader who disagrees knows exactly what to disagree with.

## What a bad finding looks like

> *The DTOs feel schema-driven and the contracts could be more cohesive.*

No element, no citation, no argument. Do not write it. If that is all you have, the artefact is
clean against this framing and your verdict says so.

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

## Monty's own warning about you

He is on record about AI reviewers, in the alumni thread quoted in `alumni-monty.md`: *"The Tool
can only ever be as good as the input"*, and *"Bigger is not better. 1M tokens just become a noisy
mess."* Keep your context tight: the checklist plus the artefact plus the lint output, and reach
for a thread only when you need its exact words.
