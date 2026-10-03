---
name: kaizen-report
description: "The Kaizen reporting system the Software Architect ruled on 2026-09-11 (relay R-213, his letters 1A/2A/3B): one ENTRY PAGE per cord pull, added and never changed, plus ONE LANDING PAGE over everything ever done, rewritten whole every time. An AGENT writes both — it draws the charts and it writes the reading of the pull; a program that prints a list can only ever produce a list, which is why the old generated page was useless to him. Written in ENGLISH, self-contained HTML, committed files PULLED never pushed, under `.theagent/conduct/kaizen-report/`. Activate in the SAME turn as `theagent2 kaizen verdict` — the session that rules a pull writes that pull's page before it ends — and whenever somebody asks for the Kaizen report, the improvement log, or what Kaizen has changed. Never write into `kaizen-summary.html` (a redirect here since #1540) or `executive-overview.html`; never merge any of the three."
---

# kaizen-report — the log book, read rather than printed

The Software Architect read the generated Kaizen page and called it **useless as an executive
report**. He was right, and the reason is structural: it is 240 lines of code that print each log
record as a block of text, newest first. **A program that prints a list can only ever produce a
list, however the list is worded.**

So he ruled three things in one turn, and this skill is those three things:

| His letter | What it binds |
|---|---|
| **1 A** | One **entry page per CORD PULL**. Not per session, not per day. It is ADDED, and then it is NEVER changed. |
| **2 A** | An **AGENT** writes it. It draws the charts. It also writes the reading of the pull. He was told plainly that this costs tokens on every run and that a program would be free; he chose the agent. |
| **3 B** | **English.** Method-facing prose whose only reader is the business stakeholder. It binds the entry pages, the landing page and the log book — and it relaxes nothing else. |

## Where it lives

```
.theagent/conduct/kaizen-report/
  index.html          the LANDING PAGE — everything ever done. REWRITTEN WHOLE every time.
  pulls/K-001.html    one ENTRY PAGE per pull. WRITTEN ONCE. NEVER TOUCHED AGAIN.
  pulls/K-002.html
  ...
```

Beside the log book it reads, and beside the two pages it must never touch:

- `.theagent/conduct/kaizen-log.yaml` — **the record.** These pages are a reading of it. Never
  hand-edit it; `theagent2 kaizen pull` / `verdict` / `told` are its only writers.
- `.theagent/conduct/kaizen-summary.html` — a **one-line redirect to this report**, and nothing else
  since #1540. It exists so an old link and an old habit still arrive here. `theagent2 kaizen
  summary` rewrites that redirect; **do not write into it, do not delete it, do not put content
  there.**
- `.theagent/conduct/executive-overview.html` — **his** separate artefact, on his own ruling
  `R-194`. Different page, different question, different language (German). **Never touch it.**

## When this runs

**In the same turn as the verdict.** The agent that analysed a pull — normally the Kaizen agent —
runs `theagent2 kaizen verdict`, then writes that pull's entry page, then rewrites the landing page,
then commits all three together. That ordering is not decoration:

1. **The book first.** It is the record; the page is the reading. If the session dies between the
   two, the record survives and the page can be composed later from it.
2. **The entry page second**, from the verdict you just wrote — **not from the transcript.** You
   have the analysis in your own context already. Re-reading anything to write this page is the
   exact cost this whole system exists to cut.
3. **The landing page last**, because it counts the entry page you just added.

**Do not run it on a schedule, do not add a hook, a timer or a cron, and do not serve it.** These
are committed files, opened with `file://`. Serving them was offered to him and is unanswered; it
must not be read into these letters.

**One pull, one page, one commit.** Not forty bookkeeping commits — the run measured 90 % of its own
commits as administration on the day this system was built, so the system that reports that number
does not add to it.

## The entry page — his five sections, in his order

From his own words (`C-006`): *"a small infographic page containing what was looked at, what was
found, potential hypothesis built, and potential experiment set up and potential changes planned or
even executed … So... Numbers."*

| Section | Field it reads | The failure it is defined against |
|---|---|---|
| **What was looked at** | `saw` | A page that opens with a conclusion nobody can check. |
| **What was found** | `analysis` | Restating the symptom instead of naming the mechanism. |
| **The hypothesis** | `hypothesis` | A change nobody can judge later. |
| **The experiment set up** | `experiment` | A claim that something is "being tried" with nothing observable. |
| **What changed** | `change`, `verdict` | A verdict that cannot say what was done. `nothing` is a real answer here and it is written as one. |
| **The numbers** | whatever the pull measured | Adjectives where a quantity was available. |

**A section with nothing in it says so in one sentence.** *"No hypothesis was formed: the verdict was
that nothing should be done."* Never leave a heading with filler under it, and never invent a
hypothesis to fill the slot.

**The numbers are the point of the page.** If the pull measured something, it is a chart. If the pull
measured nothing, the page says *"this pull measured nothing"* in one line and carries no chart —
an invented chart is worse than an absent one.

## The landing page — everything ever done

Rewritten **whole**, every time, so it can never disagree with the book. Five things, and nothing
else:

1. **One sentence on the state of the whole**, carrying the single number that carries it — normally
   *how many pulls, how many changed something.*
2. **The shape of the book, as charts**: pulls per day, the verdict mix, who pulls the cord, and how
   many ruled pulls are still waiting to be told. Every one of those is countable from
   `theagent2 kaizen list` in one screen — **do not re-derive by hand what that verb prints.**
3. **THE RUN ECONOMY — A REQUIRED SLOT.** Two numbers, always, even when they are boring:

   ```sh
   W=2026-09-14T00:00:00Z                                             # AN INSTANT, WITH A Z. Never a bare date.
   git log --since=$W --oneline | wc -l                               # all commits
   git log --since=$W --oneline \
     -- ':/' ':(exclude,top).theagent/' | wc -l                       # commits touching anything else
   ```

   **THE WINDOW IS AN INSTANT AND IT IS SPELLED ON THE PAGE.** `git log --since=2026-09-14` does NOT
   mean midnight: git parses a bare date with *approxidate*, which fills every unspecified field from
   the CURRENT time, so that spelling means "since this time of day, yesterday" and it slides by one
   second for every second the page is late. Measured 2026-09-15 on this run: the same repository
   answered **1 312** commits for `--since=2026-09-14T00:00:00Z` and **940** for `--since=2026-09-14`,
   in the same shell, in the same second. The page written at 02:0xZ that morning reported *"since the
   start of 14 September: 1 027 commits"* — a true number for a window the sentence misnamed, and the
   next page to use the same words would have reported a DECREASE on a repository where nothing was
   ever removed. Two readings are comparable only when both name the same instant, so **put the
   instant on the page**, in UTC, and compare only against a page that names the same one.

   **Both numbers come out of `git` itself, and the answer is in the OUTPUT, never in an exit
   code** — that is a rule below, and it is here because the recipe that stood here until
   2026-09-14 broke it twice (`K-076`, #1678). `:/` anchors the pathspec at the repository root
   and `:(exclude,top)` anchors the exclusion there too, so the count is the same from any working
   directory; the `-- . ':(exclude).theagent/'` spelling answers a different number from a
   subdirectory and says nothing about it.

   *all commits* against *commits that touch anything outside the run's own bookkeeping.* **This
   slot exists because the watch missed exactly this number for 36 pulls and the Software Architect
   found it himself** — his message of 2026-09-11: *"that's also an incident!"*. A required slot is
   what turns "somebody might notice" into "somebody must state it". Print both numbers and the
   ratio, on every rewrite, and add one sentence saying whether it moved since the last page.
   Carry the refinement with it — see *Never let a headline eat its refinement* below.
4. **What has actually changed**, as a short table of classes, not a list of pulls. *"Six changes to
   how sessions end"* is a class; six rows naming six pull ids is the failure.
5. **The honest gap**: what the book cannot tell you. One sentence.

Every entry page is linked from here by its id and its headline, newest first — that list is the
index, and it is the one place where a plain list is right.

## Never let a headline eat its refinement

The number that produced this system was *"90 % of our commits are bookkeeping"*. Counted by FILES
rather than by commits, the product dominated by twenty to one. Both are true, and **only the first
is a waste finding**: the product arrives in a few large commits and the bookkeeping in hundreds of
small ones, and what a commit COUNT costs is paid per commit.

So: when a page carries a ratio, it carries the counter-measurement beside it, in the same section,
in the same size of type. *"90 % of commits are bookkeeping"* and *"we are not building anything"*
are different claims, and a page that lets a reader slide from the first to the second has misled
him with true numbers.

## The rules that are not negotiable

- **An entry page, once written, is never changed.** Not to fix a number, not to add a link. That is
  the whole of his letter 1A. If a pull's reading turns out wrong, that is a NEW pull that cites the
  old one — the same rule the log book itself has for a verdict.
- **English.** `lang="en"`. His letter 3B. This relaxes nothing else in the repository: the Business
  Map, the BPMN, the process overviews, the narration, the decks and his executive overview stay
  German.
- **Self-contained.** One file, no external stylesheet, no CDN, no web font, **no script**. Charts
  are inline SVG, drawn as rectangles and text. The page is opened with `file://` on a box that may
  have no network, and a page that renders as unstyled text because a CDN is unreachable is a page
  nobody reads.
- **No identifiers in a headline sentence.** He cannot map a session name or an issue number while
  reading. A pull's own id is its page's name, so it is allowed as a title and in the evidence line
  at the foot — everywhere else, if a number is the point, it is a quantity and not a name.
- **Every claim is measured or marked.** Same bar as the executive overview: if nothing checked it,
  say so on the page.
- **A NUMBER IS READ OUT OF OUTPUT, NEVER OUT OF AN EXIT CODE.** No `-q`, no `--quiet`, no
  `&& echo`, no `|| echo` in a recipe that produces a figure for this page. An exit code has two
  values and no provenance, so a wrong one is indistinguishable from a right one and nothing goes
  red. Measured 2026-09-14 (`K-076`, #1678): the run-economy recipe on this page used
  `grep -qv '^\.theagent/'`; in a Claude Code session `grep` is a shell FUNCTION wrapping a
  different matcher, whose `-q` combined with `-v` inverts the file-level verdict instead of
  selecting non-matching lines — it answered **83** where the truth was **103** over 649 commits,
  and it exited 0 every time. The same recipe could also never count a merge commit, because
  `git show --name-only` prints nothing for one. If a figure needs a filter, take it from a tool
  that PRINTS the answer (`git` pathspecs, `--format`, `wc -l`, `command grep -c`), and prefer
  `command grep` over `grep` whenever a recipe must shell out to a name this environment shadows
  — `grep`, `find` and `pkill` are all functions here.

## Styling

Match the block below, which is the executive overview's visual language plus the chart primitives.
Do not invent a second one.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kaizen — K-000: THE HEADLINE</title>
<style>
:root { color-scheme: light dark; }
body { font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  max-width: 52rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
h2 { font-size: 1.05rem; margin: 2rem 0 .75rem; text-transform: uppercase; letter-spacing: .06em; opacity: .7; }
p { margin: .35rem 0; }
.sub { opacity: .7; margin: 0 0 1.25rem; font-size: .9rem; }
.lede { font-size: 1.2rem; line-height: 1.45; padding: .75rem 1rem; border: 1px solid; border-radius: .5rem; }
.counts { display: flex; flex-wrap: wrap; gap: .75rem; margin: 1rem 0; }
.counts div { border: 1px solid; border-radius: .5rem; padding: .5rem .8rem; min-width: 5.5rem; }
.counts b { display: block; font-size: 1.6rem; font-variant-numeric: tabular-nums; }
.counts span { font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; opacity: .7; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid; }
th { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; opacity: .7; font-weight: 600; }
td.n { text-align: right; font-variant-numeric: tabular-nums; font-size: 1.1rem; }
figure { margin: 1rem 0; }
figcaption { font-size: .8rem; opacity: .7; margin-top: .3rem; }
svg { max-width: 100%; height: auto; }
.v { font-size: .7rem; letter-spacing: .08em; padding: .15rem .45rem; border: 1px solid;
  border-radius: .25rem; vertical-align: .12em; margin-right: .4rem; white-space: nowrap; }
.ev { font-size: .8rem; opacity: .7; }
.gap { opacity: .75; font-style: italic; }
footer { margin-top: 2.5rem; font-size: .8rem; opacity: .65; border-top: 1px solid; padding-top: .75rem; }
</style>
</head>
<body>
<h1>K-000 — THE HEADLINE, IN PLAIN WORDS</h1>
<p class="sub"><span class="v">VERDICT</span> Pulled DD Month YYYY · ruled DD Month YYYY</p>

<h2>What was looked at</h2>
<p>FROM `saw`, IN THE ANALYST'S OWN WORDS — NOT A PARAPHRASE THAT DROPS THE NUMBERS.</p>

<h2>The numbers</h2>
<figure>
<svg viewBox="0 0 640 120" role="img" aria-label="WHAT THE CHART SAYS IN WORDS">
  <rect x="0" y="20" width="576" height="28" fill="#b45309"></rect>
  <rect x="576" y="20" width="64" height="28" fill="#2563eb"></rect>
  <text x="8" y="39" font-size="13" fill="#fff">BOOKKEEPING 280</text>
  <text x="8" y="78" font-size="13">PRODUCT 32</text>
</svg>
<figcaption>WHAT IT IS, AND OVER WHICH WINDOW IT WAS MEASURED.</figcaption>
</figure>

<h2>What was found</h2>
<p>FROM `analysis` — THE MECHANISM, NOT THE SYMPTOM.</p>

<h2>The hypothesis</h2>
<p>FROM `hypothesis`, OR ONE SENTENCE SAYING NONE WAS FORMED AND WHY.</p>

<h2>The experiment set up</h2>
<p>FROM `experiment`, OR ONE SENTENCE SAYING NONE WAS SET UP AND WHY.</p>

<h2>What changed</h2>
<p>FROM `change` — OR, FOR A `nothing` VERDICT, WHAT WAS DECIDED AND WHY IT WAS LEFT ALONE.</p>

<p class="ev">Evidence: FROM `evidence`. Pulled by SESSION, ruled by SESSION, analysed by SESSIONS.</p>

<footer>
Written by the agent that analysed this pull, from the run's Kaizen log book. An entry page is
written once and never changed; a changed reading is a new pull that cites this one.
</footer>
</body>
</html>
```

### The two charts you will almost always need

**A split bar** — one quantity against another, as above: two `<rect>`s whose widths are the two
shares of a fixed total width, each labelled with its absolute number. Use it for a ratio.

**A column series** — one `<rect>` per day or per bucket, x stepped by a constant, height
proportional to the value, the value printed above the column and the label below it. Use it for
"per day" and for "how many of each".

Nothing else is needed. No axes library, no legend box, no gradient, no animation.

## What this page is not

- **Not the executive overview.** That is his separate page, in German, about where the work stands.
- **Not the generated summary.** That keeps existing as the store.
- **Not a dashboard, not served, not scheduled.**
- **Not a place to judge a session or a role.** A finding phrased as somebody's failure is one nobody
  adopts. The subject is always how the work moved.
