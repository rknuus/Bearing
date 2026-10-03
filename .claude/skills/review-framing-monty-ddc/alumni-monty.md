# Monty and Juval on the contract surface — verbatim, with thread ids

**Source, and how to cite it.** The IDesign alumni Google Group, mirrored in `theagent-unchained`
at `knowledge/sources/idesign-alumni-md/<thread-id>.md`, indexed by `alumni-index.json` (2'951
threads, 2011-04 → 2026-03; 941 carry Monty Montgomery, 825 carry Juval Löwy). Quoted verbatim by
the licence holder's ruling of 2026-09-09 (relay R-104, letter «A»). **Proprietary — see the
SKILL.md warning.**

Cite a quote as:

> Monty Montgomery, IDesign alumni, thread `eavjQ_6x1xc` *"The Fat WebAPI Anti-Pattern Lives On!"*

**Author trust** (`knowledge/sources/extractions/source-trust-hierarchy.md`, verbatim): Tier 1 —
*"Juval Löwy — Creator of TheMethod, IDesign founder"*, *"Monty Montgomery — Senior IDesign
associate"*, *"'Righting Software' book — The canonical text"*. Tier 2 — other IDesign employees
and the clinic materials. Tier 3 — *"Other Google Group contributors — may have partial or
incorrect understanding … If a community post contradicts Tier 1/2 sources, the Tier 1/2 source
wins."* **Only Tier 1 and Tier 2 may carry a `blocking` finding.** A thread's poster is in its
markdown header; `juval.lowy@idesign.net` and `mo...@idesign.net` are the two Tier-1 handles.

---

## The measured detailed design — the numbers a finding may be argued against

Thread `F07NI8D93Xg` — *"Detailed Design Write Up"*, Juval Löwy, 100 messages. A completed
Method detailed design on a large first-of-a-kind system, reported with its metrics. This is the
strongest citation in this file, because it is measurement rather than doctrine.

On the process (line 84):

> Like any design effort, the detailed design was iterative, and followed the steps of the August
> email below. It was done as prescribed by the AMC and practiced at the DD clinic, no more no
> less: Is this logically consistent? Is this cohesive? Is this an independent facet? Is there
> high variability where polymorphism can help?

On how the interfaces were reached (line 90):

> Then the design team for each subsystem sketched out the interfaces, as grab-bags of operations,
> warts and all, with every design smells you can think of. Then iteratively the design team
> cleaned up each subsystem, removing the smells, and constantly validating against the use cases.

The scope (lines 139, 141):

> The detailed design calls for 47 interfaces. There are additional 8 interfaces with 0 operations
> that are placeholders in case certain aspects mature into facets of services.

> There is a total of 145 operations across the interfaces. There are also some 30 structures and
> enums.

Interfaces per service (lines 155, 157):

> For example, 10 services implemented 3 interfaces. The average was 2.65 interfaces per service.

> Righting Software calls for 2.2 interfaces per service, so this is congruent.

Operations per interface (line 197):

> The average is 3.09 operation per interface. Recall that Righting Software and the AMC all for
> 3-5 operations as the optimal count.

Parameters per operation (lines 209, 211):

> You can see that most of the operations are fairly terse with the average being 0.79.

> Incidentally, in the late 1990's I measured a similar project and it had 0.7 parameters per
> operation.

Design attributes — the three sentences that make a whole class of finding checkable (lines 215,
217, 221, 225):

> All operations are behavioral in nature.

> Across all interfaces there are zero properties or property-like operations. This includes the
> resource access that only offer atomic business verbs, not CRUDS/IO.

> In addition, there is not a single operation that corresponds to a feature.

> Recall from Righting Software and the AMC that features are always aspects of integration, not
> implementation.

**How to use the numbers.** They are norms observed on real designs, not thresholds. *"47
interfaces, 145 operations, 2.65 interfaces per service, 3.09 operations per interface, 0.79
parameters per operation, zero property operations, zero feature operations"* is what a finished
Method detailed design looked like when it was counted. A model far outside one of those bands is
a **question to ask**, not a finding by itself — the finding is what the outlier turns out to be
when you read it. *Zero properties* and *zero feature-shaped operations*, on the other hand, are
absolutes in the source's own words, and a violation of either is citable as such.

---

## Facet factoring, and what context does to it

Thread `kv8-Y7PNar8` — *"Manager faceting"*, Monty Montgomery answering a practitioner who asked
whether facets are factored at the namespace or at the interface.

The correction (line 78) — the technique is not a free choice:

> The technique you select for factoring facets depends on whether context affects the service's
> behaviors. To determine if context affects the service's behaviors, you must run the process of
> detailed design and perform another round of interviewing to determine whether the multiple
> client contexts require the same use cases or whether you hear the use cases are diverging
> between contexts.

Common use cases, data variability by context (line 84):

> If the use cases are the same and there's no indication during interviewing that they're
> diverging, you do not need to factor facets by context. You will have a single facet with use
> cases common across the contexts. If your system and/or contexts requires data variability
> within a volatility for the same use cases, then you can segregate the DTOs by context
> namespace. You may optionally leverage a DTO-driven strategy or bridge pattern as well.

Diverging use cases (line 90):

> If the use cases between contexts are diverging, then you must decouple the facets and segregate
> them by context namespace. It's important to note that each context may also require data
> variability. You may optionally leverage DTO-driven strategy or bridge pattern in either context
> or both.

On where a faceting problem usually comes from (line 44):

> As we explore in the Method Anti-Patterns module of the DDC, challenges with your detailed design
> often result from unripe architecture.

And on bloat (line 60):

> With this in mind, it appears there's a fair amount of bloat going on in the Consultation
> volatility. None of which has anything to do with Consultation.

The mantra (line 114):

> The Mantra of DD: *Just keep sketching…Just keep sketching…*

**How to use it.** A finding that a facet should be split by context must say **which contexts**
and **whether their use cases diverge** — that is the test in the source's own words. A finding
that a component's facets have bloated says what the volatility is and which facets have nothing
to do with it.

---

## Operations that are not use cases: the Fat API

Thread `eavjQ_6x1xc` — *"The Fat WebAPI Anti-Pattern Lives On!"*, Monty Montgomery.

The anti-pattern (line 11):

> As I've lamented many times, in the field the Fat API Anti-Pattern is by far the most common.
> Just like the Fat Button Click Anti-Pattern of the previous epoch, the entire system ends up in
> your controllers.

Why the Manager is the answer, and what a Manager *is* (line 19):

> The real problem of course is determining why your architecture even suggests that you should put
> any code in your controllers in the first place. The secret sauce of the IDesign Method's
> volatility encapsulation has always been the Manager Service. A Manager *mediates* use cases.
> i.e. A Manager *manages* the sequence of use case execution. As it turns out, in most commercial
> and enterprise systems use case sequences change all the time, making them the most volatile
> aspect of your system. A Manager Service also allows you to establish and enforce the correct
> layer in your system to execute use cases, leaving your WebAPI controllers lean *by design*.

**How to use it.** This is the citation for a Client-side orchestration finding **as it shows on
the contract surface**: a client that must call three operations in order to accomplish one
business act is a use case that no Manager operation names. (The layering half of that finding
belongs to the Juval framing.)

---

## Monty on AI reviewers — read this before you write your first finding

`knowledge/sources/extractions/google-group-copilot-instructions.md`, distilled from the alumni
thread *"copilot instructions for The Method"* (Feb–Mar 2026). His words about tools like you:

> Current AI tools deliver productivity gains on *mechanical* parts only — "nothing more than a
> better IntelliSense"

> "The Tool can only ever be as good as the input"

> "Bigger is not better. 1M tokens just become a noisy mess"

What he says he actually wants — and it is the brief for this whole framing:

> A true ***digital design assistant*** — an assistant that can provide the same value in design as
> an AMC or DDC critique cycle

> Current focus: code review and recommendation against Detailed Design best practice and Method
> architecture. "The PR Cop for the pervasive human and AI behavior of 'just add another service'
> and 'just add another operation/method'."

> "Why does AI NEVER suggest using an interface?!?"

And Juval, in the same thread, on the honest scope of an AI critic:

> "Long before the tools are ready to generate high quality code, you can and should rely on AI to
> critic your code and enforce standards"

> Should not eliminate human code review, but should eliminate technical violations

**One caveat about this file, stated because it is the honest one:** the two AI threads above are
quoted here from theagent2's *extraction* of the thread, not from the thread markdown itself, so
the quotes are marked as extraction-sourced. Cite them as
`extractions/google-group-copilot-instructions.md`. Everything else in this file is quoted from
the thread mirror and carries its thread id and line.

---

## Further threads worth opening, by id (not quoted here)

Read these when a finding needs their exact words; all carry Monty or Juval.

| thread id | title | why |
|---|---|---|
| `hiM-IgouGFw` | Resource layer and database joins. | what a ResourceAccess may join, and where a join belongs — Monty **and** Juval |
| `dpvK6VeMqN4` | A manager in the Method | what a Manager is and is not (23 messages) |
| `3q3Wkz2hYcc` | From the Field: S1E1 — I can't make this stuff up. I don't have to! | field examples of contract decay |
| `i49bPRtK3HA` / `D13gQ8MhAEs` | Escaping Appland / Escaping Appland: Revisited | the app-shaped system and how it reads on the contract surface |
| `hpR5SM3FDGE` | A Reoccurring Theme: eCommerce DDD + Microservices | DDD aggregates arriving as DTOs |
| `XhtUkfxawkg` | Stream Processing Engine | Engine contracts and what belongs on them |
| `hhn-GF30ZVY` / `iqu_JAM_rLk` | Fractal Architecture: Kata #6 / #5 | worked katas, contract level |
| `0bqRzVEEBiQ` | AI and The Method | Monty on this exact use of the material |
