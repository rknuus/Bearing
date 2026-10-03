---
name: executive-overview
description: "The ninety-second executive overview for the Software Architect — one page that says where the work stands without asking him to decode anything. Four moves and nothing else: (1) one sentence on the state of the whole carrying the single number that actually carries it; (2) what blocks us named as a CLASS, never as a list of items; (3) how much is left as a small table of BUCKETS; (4) the honest risk, every line marked MEASURED or NOT YET MEASURED. No identifiers in the prose — no issue numbers, no session names, no relay ids; if a number is the point it is a quantity, not a name. Written by the session from the gate records, the issue tracker and the conduct surface (`conduct goal`, `conduct tracker`, `conduct open-item list`, the gate rail), then rendered to a committed self-contained HTML file at `.theagent/conduct/executive-overview.html`. PULLED, never pushed: activate when the Software Architect (or a conductor on his behalf) asks where things stand, asks for the overview / the executive summary / the state of the run, or asks for a status he can read on a phone. Do not run it on a schedule, do not run it at session end, and do not run it unasked."
---

# executive-overview — where the work stands, in ninety seconds

The Software Architect read an overview one evening and liked it. What he liked was that it
**told him where the work stands without making him decode anything**. What he did not like — and
this is the whole design constraint — is prose full of identifiers. He cannot map an issue number,
a session name or a relay id to anything while reading on a phone.

So this page is **four moves and nothing else**, and each move has a failure it is defined against.

This is a **separate artefact from the Kaizen report**, on his own ruling. The Kaizen report lives at
`.theagent/conduct/kaizen-report/` — one entry page per cord pull, written by the agent that analysed
it (the `kaizen-report` skill). This page is a different question: where the whole run stands. They
stay apart: never write into the Kaizen report, never merge the two.

## When this runs

**Pulled, never pushed.** He was offered a standing cadence and declined it. Run this when somebody
asks for it. Do not add a hook, a timer or a cron; do not instruct any other session to run it; do
not run it at session end "while you are here". A cadence he declined is a cadence that costs tokens
on every run for a page nobody asked for that hour.

## The four moves

### Move 1 — one sentence on the state of the whole

One sentence. It carries **the single number that actually carries it**, and that number is almost
always the goal's own scoreboard: how many of the run's `done_when` conditions are met, out of how
many.

```sh
theagent2 conduct goal          # the standing goal and "DONE WHEN — N of M met"
```

> Four of the ten things this run has to be true for are true, and the two that decide the date
> are the ones still open.

Not: a paragraph. Not: three numbers. If you cannot choose one number, you have not understood the
state well enough to write the sentence yet.

### Move 2 — what blocks us, named as a CLASS

This is the move that fails most often, so it is the one to be strictest about.

```sh
theagent2 conduct tracker       # "N block the next gate", by the run's own declared labels
theagent2 conduct tracker --gate <id>   # the blocking subset for one gate
```

The verb gives you the **count and the members**. Your job is the **class** — read the members'
titles, find what they have in common, and name the shape in his language:

> **Thirteen resource sheets wait for one human signature.**

That is a class. Thirteen bullet points with file names is a **list**, and a list is the failure —
it is exactly the thing he cannot read. One sentence per class, at most a handful of classes. If two
classes collapse into one honest sentence, collapse them.

If the blockers genuinely have no common shape, say that in one sentence — *"the eleven open
blockers have nothing in common; they are eleven unrelated defects"* — which is itself a finding he
can act on. Do not invent a class that is not there.

### Move 3 — how much is left, as a table of BUCKETS

A small table. **Buckets, not rows per item.** Four to eight rows is a table; forty rows is a dump.

| Bucket | Left |
|---|---|
| Waiting on a signature | 13 |
| Built, not yet verified | 6 |
| Not started | 2 |

Sources for the buckets, in order of preference — use a verb's own count before you count anything
by hand:

```sh
theagent2 conduct tracker              # open issues bucketed by the run's declared labels
theagent2 conduct open-item list       # the conduct surface's own open items
theagent2 conduct goal                 # the done_when conditions, met and open
```

The gate rail in `.theagent/conduct/state.yaml` says which gates are passed and which are pending;
the gate records under the project's `docs/04_Gates/` (per `process-specs/gate-record-format.md`)
say what each pending gate still owes. Where a gate dossier exists, its evidence table is already
the bucketed view — read it rather than recomputing it.

**Do not re-derive a number a verb already prints.** A skill that tells a session to count issues by
hand when one command prints the count costs more than it saves.

### Move 4 — the honest risk

He explicitly allowed this page to state a risk in a plain voice. It carries a condition, and the
condition is not optional:

**Every risk line is marked MEASURED or NOT YET MEASURED**, so he knows which sentences to trust.

> **MEASURED** — The suite has been green on every run for six days, so the date is not at risk
> from test debt.
>
> **NOT YET MEASURED** — Nothing has exercised the deployment path end to end, so we do not know
> whether the date is at risk from it.

*MEASURED* means you can name the register, the command or the record the claim came from, and you
would produce it if asked. *NOT YET MEASURED* means you believe it and nothing has checked it. When
in doubt it is NOT YET MEASURED — an unmarked guess he acts on is the expensive failure this whole
page is defined against.

The HTML template below makes the mark a **required slot**, not a footnote asking you to remember.
A risk line with no mark does not go on the page.

## The no-identifier rule

**No identifiers in the prose.** Not issue numbers, not session names, not relay ids, not gate
record paths, not commit hashes, not open-item ids. **If a number is the point, it is a quantity,
not a name.**

| Do not write | Write |
|---|---|
| `#1443 and #1471 block Contract` | Two defects block the next gate |
| `S-1295 is still open` | One session is still running |
| `R-178 is unanswered` | One question is waiting on you |
| `13 sheets (see docs/03_.../protocol/)` | Thirteen resource sheets wait for one signature |

This applies to the **prose and the table**. It does not forbid you from *reading* identifiers — you
must, to get the counts right. It forbids them from reaching the page.

## What it reads, and which verb answers which question

| Question | Register | Verb |
|---|---|---|
| State of the whole, the one number | the standing goal | `theagent2 conduct goal` |
| What blocks us, and how many | the issue tracker | `theagent2 conduct tracker` |
| What blocks one named gate | the issue tracker | `theagent2 conduct tracker --gate <id>` |
| What the run itself is carrying | the conduct surface | `theagent2 conduct open-item list` |
| Which gates are passed, which pending | the gate rail | `.theagent/conduct/state.yaml` |
| What a pending gate still owes | the gate records | `docs/04_Gates/*/record.yaml`, and the gate dossier where one is built |

`theagent2 conduct tracker` exits 0 whatever it finds, and exits 2 when the tracker cannot be read
at all. **Exit 2 is not "nothing blocks us"** — it is "we do not know", and that is a NOT YET
MEASURED line on the page, not a silent zero.

## When a move cannot be made honestly

If a move cannot be produced from what the registers actually hold, **say so on the page** in one
plain sentence, and say what is missing. Do not fill the gap with adjectives.

> We cannot say how much is left: the run has never declared what it sorts its open work by, so
> nothing can be counted into buckets.

A page that states a *plausible* overview is worse than no page at all, because he will act on it.
Everything on this page is either measured from a register you can name, or marked as not measured.

## The HTML render

The page is also written to a **committed file**, beside the Kaizen summary and under a name of its
own:

```
.theagent/conduct/executive-overview.html
```

Three properties, each with a reason:

- **A file, not a served page.** He was told that plainly before he chose this, and he chose it
  anyway. Do not build a server, do not add a port, do not write instructions for serving it.
- **It survives the session.** That is the whole reason he asked for it — the overview he liked
  existed only in a pane and was gone.
- **Self-contained.** One file, no external stylesheet, no CDN, no font fetch, no script. It is
  opened with `file://` on a box that may have no network at all, and a page that renders as
  unstyled text because a CDN is unreachable is a page nobody reads.

**The session writes this file; there is no generator verb, and that is deliberate.** The four moves
*are* judgement, and a verb would need somewhere to read that judgement from, which would make a
second original of it. Keeping the writing with the author keeps one original. Commit the file in
the same change as the work it describes. The Kaizen side learnt the same lesson the expensive way:
its generated page was retired because a program printing a list can only ever produce a list.

Match the styling below rather than inventing a second visual language.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Where the work stands</title>
<style>
:root { color-scheme: light dark; }
body { font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  max-width: 52rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
h2 { font-size: 1.05rem; margin: 2rem 0 .75rem; text-transform: uppercase; letter-spacing: .06em; opacity: .7; }
p { margin: .35rem 0; }
.sub { opacity: .7; margin: 0 0 1.25rem; font-size: .9rem; }
.lede { font-size: 1.2rem; line-height: 1.45; padding: .75rem 1rem; border: 1px solid; border-radius: .5rem; }
.blocks p { padding: .6rem .8rem; border-left: 3px solid; margin: .6rem 0; font-size: 1.05rem; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid; }
th { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; opacity: .7; font-weight: 600; }
td.n { text-align: right; font-variant-numeric: tabular-nums; font-size: 1.1rem; }
.risk { border: 1px solid; border-radius: .5rem; padding: .7rem .9rem; margin: .7rem 0; }
.mark { font-size: .7rem; letter-spacing: .08em; padding: .15rem .45rem; border: 1px solid;
  border-radius: .25rem; vertical-align: .12em; margin-right: .4rem; white-space: nowrap; }
.gap { opacity: .75; font-style: italic; }
footer { margin-top: 2.5rem; font-size: .8rem; opacity: .65; border-top: 1px solid; padding-top: .75rem; }
</style>
</head>
<body>
<h1>Where the work stands</h1>
<p class="sub">Written DD Month YYYY. Read time: about ninety seconds.</p>

<!-- MOVE 1 — one sentence, one number. -->
<p class="lede">ONE SENTENCE ON THE STATE OF THE WHOLE, CARRYING THE ONE NUMBER.</p>

<!-- MOVE 2 — classes, not lists. One sentence each, a handful at most. -->
<h2>What blocks us</h2>
<div class="blocks">
<p>A CLASS OF BLOCKER, NAMED AS A CLASS.</p>
<p>ANOTHER CLASS, IF THERE HONESTLY IS ONE.</p>
</div>

<!-- MOVE 3 — buckets, not rows per item. -->
<h2>How much is left</h2>
<table>
<tr><th>Bucket</th><th>Left</th></tr>
<tr><td>A BUCKET</td><td class="n">0</td></tr>
<tr><td>ANOTHER BUCKET</td><td class="n">0</td></tr>
</table>

<!-- MOVE 4 — every line carries its mark. No mark, no line. -->
<h2>The risk</h2>
<div class="risk"><p><span class="mark">MEASURED</span>A RISK YOU CAN NAME THE EVIDENCE FOR.</p></div>
<div class="risk"><p><span class="mark">NOT YET MEASURED</span>A RISK NOTHING HAS CHECKED.</p></div>

<!-- Only when a move cannot be made honestly. Delete otherwise. -->
<p class="gap">WHAT WE CANNOT SAY, AND WHAT IS MISSING THAT WOULD LET US SAY IT.</p>

<footer>
Written judgement, not a generated report — a person assembled this from the gate records, the issue
tracker and the conduct surface. Every risk above is marked as measured or as not yet measured.
The Kaizen summary beside this file is a different thing: it is generated whole from the Kaizen log
book on every call.
</footer>
</body>
</html>
```

## What this page is not

- **Not a dashboard.** No charts, no per-item rows, no drill-down, no links to a tracker.
- **Not the Kaizen summary**, and never written into it.
- **Not served.** A standing offer to serve it on a host exists and is unanswered; it was not part
  of the question he answered here, and must not be read into it. Build nothing.
- **Not scheduled.** Pulled, always.
