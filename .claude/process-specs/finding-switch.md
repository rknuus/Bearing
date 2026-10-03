# The Finding Switch — what is fixed in stride, and what deserves an issue

**Status:** process rule, first step (SA, 2026-09-01). Single source for the disposition of a
finding a session meets **outside its work list**. `CLAUDE.md`, the conduct skill's brief
contract, and the stage agents cite this note; none of them restate it. Amended 2026-09-13 on the
Software Architect's order on relay R-260 — *"please address all recommended measures"* (measure
P5) — with § *A review finding marked `mechanisable: yes`*, the one route out of a gate review's
report for a guard nobody is otherwise asked to build.

## Why this note exists

Measured on figaro, 2026-09-01: **128 issues opened against 47 closed** since the run's day zero —
2.7 opened per close, the open count 22 → 82 in eight days with no downward trend. Median
time-to-close was ~7 hours, so the tracker was not clogged; it was being *fed*. Reading the 40
newest open issues for the reason each was filed rather than fixed gave five shapes:

| the session filed instead of fixing because … | ≈ of 40 |
|---|---|
| the decision belongs to the Software Architect | 11 |
| a const artefact lags behind a ruling already made — each stale artefact its own issue | 10 |
| the fix lives in a tool, a plugin skill, a hook, a generated output | 10 |
| closing one issue left a remainder, which got a new number | 4 |
| a genuine new design defect | 6 |

Only the last row is what a tracker exists for. The rest followed the process to the letter:
`CLAUDE.md` said «discover-but-not-fixing: open an issue before moving on» with no lower bound and
no other exit; the brief said «on ambiguity: file an issue and stop», which cannot tell a content
fence from a tooling defect; a ruling that touched eight const artefacts produced eight issues.
The feeling this produces — *one step forward, two steps back* — was the SA's, and it was
measured to the decimal.

GitHub Issues stay the source of truth for findings. This note only fixes **which findings are
issues**, and what the others are instead.

## The switch (structural, not a judgement)

At the moment a session meets a finding that is not on its work list, it answers two questions:

1. **Would the fix change the *meaning* of a const artefact** — a blessed drawing, screen model,
   business rule, contract, SI semantics, a ruling's wording?
2. **Are there two or more defensible readings** of what the right fix is?

**No to both → fix in stride.** **Yes to either → an issue.** Nothing else decides it: not
size alone, not "it feels trivial", not whether the session is in the mood.

### Stride — fix now, own commit, no issue

A stride fix qualifies only when **all five** hold; a session that cannot say yes to every line
takes the issue route and says which line failed.

1. No const artefact changes meaning (question 1 above).
2. No business rule, contract or SI semantics move — ids, labels of business content, rulings
   are untouched.
3. An **existing check** goes green, or a generated output re-derives from its source, or the
   defect is reproducible before and gone after — correctness needs no human to judge it.
4. One commit, under **~30 minutes** including the check. Over budget is not stride.
5. The fix lands in a repository the session may write — its own workstream, or a plugin the
   session is a maintainer of (`CLAUDE.md` § plugin checkouts). A toolchain defect the session
   cannot fix (theagent2, sns-cli) is an issue **there**, with the workaround applied in stride
   here; the session does not stop over it.

Typical stride fixes: a red `--check` cured by regeneration; a stale rendered output; a broken
link or path; a script or hook defect; a `.gitkeep`/ignore mistake; a typo in a *technical*
label. Typical non-stride findings that look small: a wrong business word on a blessed drawing;
a task-closure rule that "obviously" should also cover a second case; anything the brief's
`## Fences` names as content.

**Mechanics — never `git stash` in a shared tree.** Sessions in a conducted workstream share one
working tree (`RAIL-NAMING-MIGRATION-PLAN.md` §2; friction log, 2026-08 mutation pass): a stash
pockets *every* dirty file in the index, another session's included.

- The fix touches files you are not editing (the usual case): **commit by path, in ONE step** —
  `git commit <the fix's files> -m '<subject>'`. In-flight work stays in the tree, untouched.
  **The pathspec has to be on the COMMIT, not only on a `git add`.** `git add <paths> && git
  commit` scopes the STAGING and then commits the WHOLE INDEX, so whatever a sibling session
  staged in that window becomes your commit — measured twice on one run: `F-D03` (28 spec files
  and a deletion swept into two unrelated commits) and `F-D285` (a sibling's staged `git rm`
  swept into a bookkeeping commit). Nothing goes red when it happens: the tree is byte-for-byte
  what everyone intended and only the AUTHORSHIP is wrong, which is why the losing spelling
  survives every review.
- **A deletion needs no `git rm`.** `rm` the file and name its path in the path-scoped commit —
  a commit that names paths takes their worktree state, deletions included. `git rm` stages the
  deletion the instant it runs, and from that instant until your own commit, any sibling's
  commit that covers the path takes it instead. An untracked file is the one case that still
  needs `git add` first — then name the same paths on the commit, in the same call.
- The fix touches a file you have half-edited, or lives in another repository: **`git worktree
  add <dir> -b stride/<slug>`**, fix there, commit, push, merge, remove the worktree. Plugin
  repositories: a scratch clone, never the marketplace checkout (#771).

**Record — commit prefix and one friction entry, no issue.**

- Subject `fix(stride): <what>`; body carries `Found while: <the task, or #NN>` and the check
  that proved it. The prefix is what the retro and `issue-flow.sh` count.
- One entry in `.theagent/conduct/friction-log.yaml`, `tag: tooling` (or `conduct` where the
  defect was in how the run was conducted), `evidence:` the commit hash. The friction log is the
  register of what the process cost the run; a stride fix is exactly that, and the retro already
  reads it — nothing is lost from the accounting by not opening an issue.
- **No issue.** A stride fix with an issue is the fan-out this note removes.

### Issue — everything the switch sends past stride

An issue is opened, as `CLAUDE.md` prescribes, with symptom, evidence `file:line`, the rule
violated, severity — **and one more line: which switch question sent it here**, so the reader can
tell a decision request from a defect at a glance. Two labels carry that distinction:

- **`decide`** — the finding needs the Software Architect's ruling (question 2, or a content
  fence). The body's first sentence is the question, plain, before any evidence
  (`CLAUDE.md` § Communicating with the Software Architect). The session's **computed
  recommendation** and the alternatives follow — «confirm my reading» is a cheaper request than
  «choose», and check-before-ask (#822) applies here as everywhere. Where the entry blocks a
  gate, the same question is also appended to the Q&A ledger with `audience: architect` and
  `blocks:` filled in, so the gate check keeps it on the frontier; the issue and the ledger entry
  cite each other.
- **`accepted`** — the SA ruled «this is a given, not a bug». The issue is **closed** with the
  ruling quoted (who, when, the words), and the given is written where the team reads current
  state — the project's known-givens register once it exists, until then the gate record's
  `confirm:` list. An accepted finding is never left open "for later": an open backlog is unknown
  liability, and a closed issue with the case made is the record.

The existing labels keep their meaning: `bug`, `tech-debt`, `deferred` (real, but not before a
named gate — say which).

### A hazard in our own machinery also gets one line in the Kaizen log book

**Rule (SA, 2026-09-11, item 6, his letter «B»): every issue about a hazard in our own machinery —
the toolchain, the conduct surface, the hooks, the skills, the launch verbs — gets ONE LINE in the
Kaizen log book as well: `theagent2 kaizen pull --text "<what you saw>" --ref "<the issue>"`.**

It is an ADDITION to the issue, never a replacement for it, and it is deliberately NOT an open item
on the conduct surface: `state.yaml` has a line budget (K-012), and a register that every boot pays
for cannot also be where hazards accumulate.

Why it is worth the extra line. The hazard behind the 17-hour, USD 57.83 twin session of
2026-09-11 had been **filed five days earlier**. No session saw it — an issue lives in the tracker,
and no role reads the tracker first. The Kaizen agent reads `theagent2 kaizen list` FIRST, by its
own instructions, and the log book is the one register in this system whose readers are the roles
that act on how the work moves.

What counts: a hazard is a thing that will hurt a FUTURE session, not a defect in a work artefact.
"`supervise stop` kills the pane and the question in it" is one. "This drawing contradicts that
sheet" is not — that is an ordinary issue and stops here.

### A review finding marked `mechanisable: yes` also gets a tooling issue for the guard

**Rule (SA, relay R-260, 2026-09-13 — *"please address all recommended measures"*, measure P5):
when a gate-review finding marked `mechanisable: yes` is fixed as an INSTANCE, the session that
fixes it opens a **tooling issue for the guard** — the check that would have caught the class — and
the finding's disposition names that issue by number.**

It is an ADDITION to fixing the instance, never a replacement for it, and it is the same shape as
the Kaizen line above: one more line, at the one moment somebody is holding the finding.

Why it is worth the extra line. The class the rule is named after was measured on the conducting
project: **two** Resource-Protocol-Sheet reviews marked the **same** rule *"mechanisable: yes"* —
finding F2, rounds 1 and 2 — nobody built the guard, and the class was then found **by hand a third
time**, by an implementor, in code. A reviewer is forbidden from filing anything (that is
deliberate: `gate-reviewer.md` § *What you do NOT do*), so a `mechanisable:` line has exactly one
route out of the report, and until this rule it had none. **A named receiver is not a route** —
the same lesson the review third-class walk records for Construction (Kaizen `K-056`).

Who, and what it says:

| the finding | who opens the guard issue |
|---|---|
| **rule class** (ADR-073 §6 — the architect closes it, the Software Architect never sees it) | the **architect** session that fixes the instance, in the same change |
| **design class** (§6a — a human accepts it, one finding at a time) | the **conductor** that persists the report, at gate exit, once the acceptance is recorded |

The issue carries what `CLAUDE.md` asks of every issue, plus three things this class owes: the
finding's own id and the report path it lives in (`docs/04_Gates/<gate>/reviews/…`, the `gate-review/1`
head's `reviewed:` sha included), the reviewer's `mechanisable:` line **verbatim** — it is the
guard's brief — and the label `tech-debt` (it is a missing check, not a defect in the artefact the
review read). A guard in the toolchain is a hazard in our own machinery, so the Kaizen line above
applies to it as well.

**One class, one issue.** A second instance of a class whose guard issue is open is a comment on
that issue, never a new number — the *one ruling, one work list* companion rule below. And a
`mechanisable: yes` whose guard the reviewer could not name is not an excuse to skip this: ask for
the check in the issue and say the finding's text is all there is, so the next reader knows the
brief is thin rather than assuming it is complete.

### A non-live subject is not a finding

Before the two questions above, one prior question: **is the finding's subject live?** A business
process whose `.bpd` header declares `status parked` (future) or `status retired` (abandoned) is out
of force — the Software Architect has decided it is not being built, and it *"should not be
considered at all anywhere at any time … It's as if they were not there"* (SA, 2026-09-05; the
taxonomy is `stage-ab-tooling-contract.md` §1a).

**So: do not file it, do not fix it in stride, do not park it, do not raise it with the Software
Architect.** Drop it, and move on. This holds however correct the finding is — a contradiction
inside a drawing nobody is building is a true statement about nothing.

The rule exists because the alternative was measured. On one conducted project a process was taken
out of scope on day one, in prose that no checker read; over the next twelve days the run produced
**five issues** about inconsistencies inside that drawing plus a scope question that spent a ruling
excluding it from work nobody had proposed including it in. Every one of those findings was
*individually correct*, which is exactly why no session spotted the pattern, and the Software
Architect answered the same question five times. After the non-live sources stopped feeding the
tools, the linter went from five violations to zero and the "drawn but not built" list from twelve
entries to one — **none of that noise was information** (#1241, `claude-zulli-marketplace#57`).

Two boundaries, so the rule is not read wider than it is:

- **It is about the finding's subject, not the file it was found in.** A defect in a *tool* that
  happened to surface while reading a parked drawing is still a finding about the tool.
- **A finding that the status itself is wrong is a finding** — "this is marked parked and we are
  building it", or a status whose reason names no decision (§ the reason string, tooling contract
  §1a). That is a finding about the scope decision, and it goes to the Software Architect.

### Two companion rules

**One ruling, one work list.** When a ruling lands, the session that receives it finds every
artefact the ruling touches (grep the tree — drawings, SI documents, screen models, sheets,
generated outputs) and writes that list **into the ruling's own issue** as a task list
(`- [ ] BP15.bpd`, `- [ ] SI04.02.md`, …), then works it in the same session as far as its
budget allows. A stale artefact is a checkbox on the ruling, never an issue of its own. Six of
the ten «const artefact lags behind a ruling» issues in the sample were one ruling (feed tier,
2026-08-27).

**A rest-gap stays with its parent.** If closing an issue leaves a remainder of the same kind,
append it to the parent as an unchecked item and leave the parent open — or make it a sub-issue.
A new top-level number is only for a remainder that **changes lane**: a stride fix that turned
out to need a decision, or a defect that turned out to be a different defect.

## The number that watches this

`theagent2/docs/process/issue-flow.sh --repo <owner/name> --since <date>` prints, for a window:
issues opened, issues closed, opened-per-close, stride commits (`fix(stride):`), and the open
count by label — the figure the retro's conduct annex quotes and the SA reads in the morning. A
ratio that stays above 2 after this rule is in force is a finding about the rule, and goes to the
process retro as one.

## What this note does not do (yet)

- It does not move decision requests out of GitHub Issues — the SA kept the tracker
  (2026-09-01); `decide` is a label, not a second register.
- It does not define the known-givens register or its rendering in the Design Book; until it
  exists, an `accepted` ruling is quoted in the closing comment and in the next gate record.
- It does not touch Construction: an implementor's writable surface is its own Service project
  and the land-back tamper gate refuses everything else (`agents/implementor.md`); there, a
  finding outside the surface is `DESIGN GAP`, as before.
