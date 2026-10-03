---
name: process-interview-transcripts
description: "Distill a raw interview or meeting transcript (VTT/SRT, Teams/Zoom/Meet export, or pasted text) into a clean, project-relevant Markdown notes file. Strips timestamps, speaker noise, filler, small talk, and methodology/working-style/tooling tangents while preserving processes, flows, actors, decisions, validation rules, specific numbers, edge cases, and open questions. Activate when asked to process, clean, distill, de-fluff, trim, or summarize a meeting/interview transcript into notes."
---

# Process Interview Transcripts

Turn a raw, verbatim meeting or interview transcript into a focused **notes** file that keeps
only the substance a downstream reader (business analyst, architect, PM) needs, and drops the
conversational noise. You are a distiller, not an author: optimise for fidelity, not prose. The **raw transcript stays the single source of truth** — these notes are a *derivative* of it: a convenient distillation that must never supersede or contradict the transcript, and must stay reproducible from it.

> **theagent2 project layout.** Interview transcripts and their notes live under
> `docs/01_Planning/Meeting-Notes/` (raw `*.vtt`/`*.srt` next to the
> `* - Notes.md` you produce). This is the first stage of the upfront design pipeline
> (ADR-030): notes feed `review-business-process-bpmn`, which derives the System Interactions
> (= IDesign use cases) the rest of the design hangs off.

## When to use

- The user points at a transcript (`*.vtt`, `*.srt`, a Teams/Zoom/Meet export, or pasted text)
  and wants it cleaned up, distilled, trimmed, summarised into notes, or "the fluff removed".
- You need usable input for modelling work (business processes, system interactions,
  requirements) but only have the raw recording transcript.

## Output

Write a sibling file named `<transcript base name> - Notes.md` next to the source (or wherever
the user asks). Open it with a provenance blockquote so the lineage is never lost:

```markdown
# <Meeting / Interview title> — Notes

> <Subject> distilled from the raw transcript (`<source file name>`).
> Methodology, working-style, and general tangents removed — only project-relevant
> substance kept.
```

Never overwrite, move, or delete the source transcript — the notes are a derived artifact that
must be reproducible from it.

## Procedure

1. **Read the whole transcript first.** Understand the real topics before cutting anything.
   Note the participants and which one is the subject-matter expert (SME).
2. **Segment by topic, not by speaker turn.** Gather everything said about one process /
   feature / decision together, even if the conversation jumped around or doubled back.
3. **Cut, keep and restructure** per the two taxonomies and the topic template below.
4. **Surface ambiguities** as explicit open questions instead of guessing or silently
   resolving them.
5. **Re-read your notes against the transcript** to confirm you neither invented nor dropped a
   material point.

## Cut the fluff — remove

- Timestamps, cue numbers, `WEBVTT` headers, speaker labels, and turn-by-turn attribution
  (unless *who said it* is the point — a commitment, an owner, a disagreement).
- Greetings, small talk, scheduling chatter, "can you hear me", screen-share fumbling.
- Filler and verbal tics ("um", "you know", "like", "does that make sense").
- Repetition and restatements — keep the single clearest version.
- Methodology / working-style / tooling tangents that are not the project's substance
  (how to model, which diagram tool to use, meta-talk about the meeting itself).
- Off-topic digressions and jokes.

## Keep the substance — preserve

- **Processes & flows** — the ordered steps of how something works, and who does each step.
- **Actors / roles / systems** — the participants in each process (include "the system").
- **Decisions & rationale** — what was decided and *why*. The why is gold; keep it.
- **Constraints & specific numbers** — "exactly 3 slots", "within 24 hours", limits, formats.
- **Validation & business rules** — what must hold, what gets rejected, guard conditions.
- **Use cases (System Interactions)** — the discrete, named operations an actor invokes on the
  system, each a single interaction that returns a result. These become the System Interactions
  downstream; capture them as behavioural verbs.
- **Acceptance criteria** — each use case's success boundary / postcondition ("done when …").
- **Alternative paths (permutations)** — the materially-different outcomes of a use case
  (rejection, expiry, not-found), not just the happy path.
- **Edge cases, exceptions, and explicitly deferred / future work** — label these clearly.
- **Open questions & disagreements** — anything unresolved or flagged for follow-up.
- **Domain terminology** — keep the SME's exact terms; don't paraphrase jargon away.

## Structure each topic

```markdown
## <Topic / Process name> (<ref id if any, e.g. BP03>)

**Prerequisites:** <preconditions, if stated>

**Actors / lanes:** <list — include the system>

<One or two lines of design intent / context.>

### Flow

1. **<Step name> (<actor>):** <what happens>.
2. ...

### Validation

- <rule> — <where / when enforced>.

### Edge cases & future work

- **<name>:** <description, and whether it is in scope now or deferred>.
```

Use only the subsections a topic actually needs; omit the empty ones. For non-process content
(a list of requirements, a glossary, a set of decisions) reuse the same header + bullet style
in a shape that fits.

## Faithfulness rules

- **Do not invent.** If the transcript doesn't say it, it doesn't go in the notes. Never fill
  gaps with plausible-sounding detail.
- **Do not resolve ambiguity silently.** Record it as an open question.
- **Preserve specifics verbatim** — numbers, names, thresholds, error conditions, units.
- **Convert relative dates to absolute** ("next quarter" → the actual date) when the meeting
  date is known; otherwise flag the relative reference.
- **Attribute only when it matters** — a commitment, an owner, or a point of disagreement.
- **Stay concise.** Tighten the prose, but never at the cost of a material fact.

## Tiny example

Raw:

```
00:14:32.100 --> 00:14:39.880
Koen: Yeah so um, the customer, they — well, they pick the device right, and then,
you know, they hit "request a maintenance job". But — and this is important — if
there's no active plan we shouldn't even let them through.
```

Distilled:

```markdown
1. **Request (Customer):** select the device and click "Request a maintenance job".

### Validation
- A customer cannot request a job without an active maintenance plan — validate at the start.
```
