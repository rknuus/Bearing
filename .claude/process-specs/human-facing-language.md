# Human-facing language — how an agent writes when a person reads it

**Status:** process rule (SA, 2026-09-14). Single source for the LANGUAGE STYLE of every text an
agent writes for a human to read. The agent files and skills that write to a human cite this note.
They do not restate it.

His order, verbatim, 2026-09-14:

> *"Please double check that everything that talks to a human (SA-ATTENTION and SA-STATUS) uses
> 'ASD-STE100 simplified English'. i guess agent or skill instructions are the right place for
> that?"*

## The rule

**Write in ASD-STE100 Simplified Technical English.**

- One fact per sentence.
- Active voice.
- Present tense.
- Maximum 20 words per sentence.
- One word for one thing. Use no synonyms.
- No metaphors.
- No tracker words. Do not write «premise», «residue», «superseded».
- No capitals for emphasis. An acronym and an identifier keep their own case.

## What it binds — the whole session, not one artefact

**The rule binds every word you put in front of a human.** It binds the question card. It binds
the dialogue around the card. It binds a status report. It binds a digest. It binds the sentence
you type into his pane after he answers.

This scope line exists because the opposite was measured. Until 2026-09-14 the rule lived inside
one fenced template in `agents/interviewer.md`. The fence bound the card. It did not bind the
conversation, and the conversation carries most of the words he reads. On relay `R-283` that
morning, 29 percent of the sentences the Interviewer wrote him ran over 20 words. The longest ran
72. Two status reports of the same morning, `SR-041` and `SR-042`, ran 31 percent and 18 percent
over the cap.

## What it does NOT bind

**It does not bind your reasoning.** Think in any shape you like. The rule governs output.

**It does not bind agent-to-agent text.** A dispatch brief, a session record, a commit message, an
issue body and a relay `--to <role>` are read by agents. They keep their own conventions.

**It does not choose the LANGUAGE. It chooses the STYLE.** If a project rules that an artefact is
written in another natural language, that ruling decides the language of that artefact. This note
then says nothing about it. Read the project's own `CLAUDE.md` for that ruling.

**It does not cap a turn.** The cap is per sentence. A long answer is allowed. A long sentence is
not. Anthropic's April 2026 postmortem measured a 3 percent quality drop from hard caps on whole
turns, and reverted them. This is sentence discipline. It is not a brevity cap.

## Capitals are not emphasis

His order, verbatim, 2026-09-18, after he had pasted one status report whole as the example:

> *"SA-STATUS's way of presenting data is actually pretty bad. Upper case words, no bullet points,
> no grouping like "Need action", "needs attention", "State of project", "..." (i don' tknow what
> grouping would make sense) let's fix the isntruction for SA-STATUS agent/skill to improve
> situation."*

He names three faults. The first is a language fault, so it is ruled here and it binds every
surface. The other two are the SHAPE of a report, and they are ruled where its author is
instructed: `skills/sa-twin/SKILL.md`, section «SA-STATUS».

**Write no word in capitals for emphasis.** Write *The spec suite cannot compile*, never *THE SPEC
SUITE CANNOT COMPILE*.

- An acronym, an identifier and a product name keep their own case. `SA-STATUS`, `BP01`, `R-478`
  and `SI10.02` are names.
- A quotation is copied as it stands. His words are never corrected, and neither is anybody's.
- Emphasis does not survive audio. He plays a report on his phone (`#1586`), and a voice reads a
  capital word and a bold word as the plain word. So emphasis costs the reader and buys the
  listener nothing. State the important fact in words.

## The question card is not restated here

`agents/interviewer.md` holds the **question card** the Software Architect approved on relay
`R-191`. The card states this same language inside itself. That paragraph is his text. Nobody
edits it, shortens it or reorders it. The card also lives in exactly one place, by his ruling of
2026-09-11. Do not copy it into another file.

**If the card and this note ever differ, the card wins for the card.** This note wins everywhere
else.

## Who cites this note

| File | What the rule binds there |
|---|---|
| `agents/interviewer.md` | every word in the pane the Software Architect reads, plus the card |
| `agents/sa-twin.md`, `skills/sa-twin/SKILL.md` | every report, digest and question the twin authors for him |
| `agents/interview-architect.md` | every turn it puts in front of the Software Architect |

**`agents/sa-status.md` and `skills/sa-status/SKILL.md` are deliberately absent.** That surface
echoes a report verbatim and adds nothing. Its whole defence is that it changes no word. A language
rule in that file reads as permission to tidy the echo, which is the one failure it must not have.
The AUTHOR of the report is the sa-twin, and the rule binds the author. An echo of a compliant
report is compliant.

## The audio question is settled

He plays an SA-STATUS report as audio in the car (`#1586`). A capped sentence can read worse aloud
than flowing prose. The Interviewer asked him on relay `R-284`, 2026-09-14. His whole answer is the
letter «A».

**«A» keeps the cap on the status report.** Every sentence stays under 20 words, like every other
text an agent writes for him. One rule covers all surfaces. Nobody decides which surface they are
on.

He read the cost first. The cap rewrites about one sentence in four or five. `SR-041` ran 31
percent of its sentences over 20 words, and the longest ran 34. `SR-042` ran 18 percent, and the
longest ran 36.

**One letter answers one question. Read no more into it.**

- He does not rule on the *one word for one thing* clause alone. The card offers to drop that
  clause later. He does not take the option, so the clause stands as part of the whole rule.
- He does not change `agents/sa-status.md` or `skills/sa-status/SKILL.md`. The section above gives
  the reason they carry no language rule.
- He does not relax `K-034`. A question to the Software Architect is English, whatever its subject.
- He says nothing about the content, the shape or the cadence of any report. He ruled on the
  shape on 2026-09-18, and that ruling lives in `skills/sa-twin/SKILL.md`. It changes no word of
  the letter «A» above.
