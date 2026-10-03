# The review surface — format spec (`review-surface/1`)

Governing decision: **ADR-062**. Produced by the `gate-dossier` skill's
`bin/review-surface.mjs`; consumed by Software Natives Studio's review-browser panel, which runs
the script in the checkout it serves and presents the document without parsing either source
format (ADR-062 §5).

**The unit is the artifact, not the obligation.** The document is an index of every artifact the
project has, each carrying the state of its review. Open questions and owed confirmations are an
*attribute* of an artifact. Ordering puts `review-owed` first and `blessed` last, and **nothing is
ever omitted** — going back to something already blessed is a routine act, not an exception, and
filtering is the reader's choice rather than the index's.

**Nothing in the derivation reads prose.** It branches on typed fields only: the gate record's
`status:` and `blessed:` (`gate-record-format.md`), and the ledger entry's `status:` and
`audience:` (`qa-ledger-format.md`). Prose is only ever the payload — a title to render, never a
thing to interpret. A derivation that guessed the audience out of a free-text `for:` field, or the
blessing date out of `status_label`, would be the mechanism ADR-062 exists to refuse.

## Running it

```sh
review-surface <project-root>                          # human-readable index
review-surface <project-root> --json                   # the review-surface/1 document
review-surface <project-root> --state changed-since-blessed
review-surface <project-root> --audience owner
```

`--state` and `--audience` narrow **the printed list only**. `counts` always reports the whole
derivation: a count that moved with a filter would report the filter rather than the project.
`--audience` selects the artifacts carrying at least one obligation for that audience; the
obligations on a selected artifact are never trimmed, so an entry never understates what it owes.
The audience *split a stakeholder call is run from* is the panel's filter (ADR-062 §6); the flag is
the command line's convenience.

Studio invokes it as `node <script> <project-root> --json` and reads stdout.

## Unavailable is an exit code, never a field

There is no in-band way for a `review-surface/1` document to say "unavailable", and that is
deliberate: **an empty surface and an unavailable one mean opposite things to the reader** — the
first says the project has no artifacts, the second says none can be read. A document that could
say both would let the second be mistaken for the first.

So the script exits **non-zero with the reason on stderr** and writes nothing to stdout when:

| case | why it is not an empty surface |
|---|---|
| no `docs/04_Gates/dossier.yaml` | the checkout has not run the Diamond Process; nothing has curated an artifact |
| `qa_ledger:` unset, or the file missing | no open question could be attached to anything, so a question-free surface would read as settled |
| no readable gate record | there is no review state to derive |
| not inside a git repository | `changed-since-blessed` is derived from git history and from nothing else |
| a gate record that will not parse, one with an out-of-vocabulary `status:`, or a blessed record with no `blessed:` date | no review state can be derived from a broken record — see below |
| an `open` ledger entry with no `audience:` | the derivation branches on it (ADR-062 §2) |

Studio turns any non-zero exit into one `REVIEW_SURFACE_UNAVAILABLE` envelope carrying the
message, because the panel behind it has one behavior: say the surface is unavailable, and why.

One condition is a **warning on stderr and not a failure**, because the surface is still true
without it: a record path that no longer exists (it is not an artifact the project *has*, so it
is left out of the index).

## Which gate records are read

**Every gate record under `docs/04_Gates/`, on the dossier rail or off it.**

That directory is where `gate-record-format.md` puts a project's gate records, and a project that
has run the process over a second family keeps those records right beside the rail's — and such a
record can be `status: pending`, with open obligations of its own. A gate asking for a review asks
whichever rail it hangs from, so sweeping them is right; the sweep is stated here rather than left
to a directory scan to decide by accident.

Records archived **elsewhere** in the tree (`docs/run4/gates/…`) are not read. They belong to a
finished run, and treating their blessings as current would claim this tree was blessed by a gate
that reviewed a different one.

Every fault is **fatal, on the dossier rail or off it** (#1018): a parse failure, an
out-of-vocabulary `status:`, or a blessed record with no `blessed:` date is a record no review
state can be derived from, and the derivation exits non-zero naming it. There is no warn-and-skip
tier: skipping a record silently drops the obligations it carries — a pending gate's open items
are exactly what would vanish — and a broken record gets fixed, not tolerated forever. (This is
stricter than `dossier-build`'s own off-rail sweep, deliberately: the dossier renders one rail,
while this surface derives review state from **every** record it reads.)

## The artifact set

**Backbone: `sections[].artifacts[]` from every record read.** That list is already a
human-curated, labelled inventory of what somebody reviews at a gate, which is why it beats a raw
directory listing as the primary source (ADR-062 §3). Its curation now has a second consumer: a
gate that lists its artifacts sloppily shows up as a thin review surface.

- a curated **file** is one entry.
- a curated **directory** expands to one entry per file the kind table names, narrowed by the
  record's own `ext:`/`depth:` exactly as the dossier counts it. The unit of review state is the
  file git can date.
- a curated directory that yields **no** named kind — a C# spec tree, a folder of rendered
  images — stays **one entry** of kind `directory`. This is ADR-062 §4 held to: code is not in this
  build, and a Contract record naming `csharp/Spec/` would otherwise put hundreds of `.cs` files
  into the index through the side door. The curated artifact is never lost; it is present at the
  granularity the gate reviewed it at.

**Plus the ledger file itself**, always — it is the home of every open question whose `blocks`
names nothing on disk.

**Plus a sweep** of the project's documentation root, `docs/`, for files with an extension the
kind table names (`.md`, `.bpmn`, `.bpd`, `.vw`, `.yaml`, `.json`) that appear in no gate record.
They are `unreviewed`: "what has nobody looked at?" is one of the questions this surface exists to
answer. Dot-entries, `node_modules/` and `__pycache__/` are skipped. Extensions outside that set
are skipped **in the sweep only** — the rendered HTML of the Design Book and the dossiers, the SVG
wireframes, the mockup's JavaScript, the run logs: all outputs of a builder whose input is already
in this index, and none of them a thing anybody reviews. The curated lists are never filtered this
way: a gate that named an artifact reviewed it whatever its extension.

## Minus everything a non-live process owns (#1566, #1572)

A `.bpd` header declaring `status dissolved|retired|parked` (#1148) says the whole business
process is out of the live inventory. seqmap leaves such a source out of the map it generates
(#1243) and this surface leaves it out of the index: **a drawing nobody is building owes nobody a
review act**, and listing one asks the reviewer for an act that cannot be performed.

**THE HEADER IS THE TRUTH AND THE FOLDER IS ITS MIRROR.** The state is read from the `.bpd`
header's own `status` line and from nothing else. A path-only exclusion would fix today's count
and re-create tomorrow's drift, so where header and folder disagree **the header wins and the
disagreement is reported on stderr**. A file under a `parked/` directory that is not a drawing is
ruled by its location — the folder's own README carries no header to answer with. A curated
directory holding nothing but non-live drawings is dropped whole rather than surviving as one
`directory` entry.

**What was DERIVED from the drawing goes with it.** Same rule, different join — the state still
comes from the header, and only the way an artifact is joined to the process changes:

| derived artifact | joined to its process by |
|---|---|
| an **SI document** (`…/02_System-Interactions/<BPnn>_<Name>/…`) | the `BPnn` its grouping directory carries, or — for the flat per-call-site export `BPxx.yy_Name.md` (`si-export/3`) — its own file name |
| a **call chain** (`SQxx.yy.zz`) | the interaction its own generated heading names (`# <SQ> - <SI> <name>`), then the **call sites of the enriched sequence map** (`seqmap generate --binding --model`: `operations`, `parkedInteractions`) and the SI documents' directories |

Reading the process off the **SQ numbering** would be a coincidence of one project's id minting
rather than a mapping, and a list of `BP` or `SQ` ids in the tool would be the same defect filed
again a month later: nothing is counted out by number.

**A derived artifact is dropped only when EVERY process that reaches it is non-live.** One live
process keeps it in the index whatever else reaches it, and where the two joins disagree the
artifact stays and the disagreement is reported on stderr. The direction is deliberate: a surface
that hides a live artifact loses a review act that is genuinely owed, while one that keeps a
non-live artifact asks for an act nobody has to perform. A project with no sequence map, or with a
map generated without its binding, simply has no second join — every call chain then keeps
whatever its SI document says.

## Review state (closed set, derived)

| state | rule |
|---|---|
| `review-owed` | the artifact carries an open obligation, **or** a gate whose `status: pending` names it |
| `changed-since-blessed` | a `blessed` gate names it and the file's last commit is later than that gate's `blessed:` date |
| `blessed` | a `blessed` gate names it and it has not moved since |
| `unreviewed` | it is in no gate record read |

Read in that order — **an artifact carrying an open obligation ranks with `review-owed` whatever
its gate state.** That is the case ADR-062 calls out by name: a design blessed at Intent with a
question still open against it is not finished business.

Where several blessed gates name one artifact, the **latest** blessing decides; `gate` and
`blessedOn` report that gate.

**The re-walk delta.** The process is walked again for every version, and a re-opened gate
re-names artifacts an earlier walk already blessed. A `review-owed` artifact that a pending gate
names, that an earlier blessed gate also names, and that has **not moved since that blessing**
(same day-resolution comparison as `changed-since-blessed`) additionally carries
`carriedOver: true` — its `blessedOn` is that prior blessing's date, not a second field. Still
owed (a pending gate asks for it), but a reader's real work at a re-opened gate is the new and
the changed, and this typed flag is what lets a surface fold the rest away without hiding it.
An artifact with an open obligation is never carried over — an open question is real work.

**The git comparison is at day resolution, and the blessing day is inclusive.** `blessed:` is a
date; the blessing was pronounced at the end of the work that produced it; a finer resolution
would be invented precision. A commit on the blessing day is not a change since it.

`changed-since-blessed` comes from git rather than a checksum stored at blessing time, because a
checksum would be a second original of a fact git already holds exactly (#861 is the standing
lesson). One `git log` pass over the project root maps every tracked path to its newest commit;
a path that pass did not see falls back to its own `git log -1`. **A path git has never recorded
counts as changed** when a blessed gate names it: it cannot be shown to predate a blessing that
was pronounced over committed history.

## Obligations

Four sources, each attaching where the human answers it:

| `kind` | source | attaches to | `audience` |
|---|---|---|---|
| `question` | an `open` entry in `qa.yaml` | every artifact its `blocks` ids name | the entry's own `audience:` |
| `confirmation` | a `confirm:` item on a **pending** record | that gate record | `architect` |
| `check` | a **non-green** `checks:` row on a **pending** record | that gate record | `architect` |
| `open-item` | an `open:` item still `state: open` on a **pending** record | that gate record | `architect` |

**Pending records only — for open items as well as confirmations.** `gate-record-format.md`
requires every item still open on an earlier gate's record to re-appear on the pending one, so
reading blessed records too would duplicate every carried item and resurrect the ones already
closed. A blessed record's `open:` list is history.

**A gate obligation has no audience of its own**: it is `architect` by construction, because a gate
is the Software Architect's review.

**Matching a `blocks` id to an artifact** is a token match on the artifact's **path** — `BP07` in
`…/BP07_DeliverOrder/SI07.01.md`, `SI07.01` in its file name — bounded so `BP01` never matches
`BP012`. Deliberately the path and not the label: a label is prose a human wrote, and this
derivation does not read prose. A question whose ids match nothing on disk — a parked thread with
`blocks: []` by construction, or an id for something not yet written — attaches to **the ledger**,
which is in the index for exactly that reason. Nothing that somebody owes an answer to falls out
of a surface that exists to carry it.

Every obligation carries `ref` — the tracker reference, for the gate open items that make it
mandatory (`"#812"`, `"N1"`), and `null` where the source has none. Without it the reader has no
way back to the issue.

### `check` — the rows that are not green (#1049)

A pending gate's `checks:` table is its evidence, and the first question a reviewer asks of it is
*which of these are not green?* Until this kind existed the derivation ignored `checks:`
altogether, so that question had no answer on this surface: the Software Architect had to open
the record and read the table. One obligation is emitted per row whose `verdict` is `amber`
(**RULING OWED**) or `red` (**OPEN**), and the verdict rides along in an additive `verdict` field
so a consumer can band the row without reading its prose.

`green` and `info` rows are **not** obligations. They are evidence, they are already rendered on
the dossier, and nothing about them waits on a human.

The distinction the kind draws is the one a reviewer acts on: a `question` or a `confirmation`
asks for a **decision**, while a non-green check asks to be **knowingly accepted** — passing the
gate means accepting each one, and each one is tracked by its `ref`.

### `digest` and `quote` on a confirmation (#1049)

A confirm item's verbatim `ruling:` runs to thousands of characters (Figaro's Contract record
carries one of 4'600), and it used to arrive here as `context` — undifferentiated prose, which a
consumer cannot collapse because it cannot tell it apart from the one-line `basis` of a judgement
call. So the wire tells them apart:

| field | meaning |
|---|---|
| `quote` | the verbatim ruling, the text that **governs**; `null` on a judgement call |
| `digest` | the two-or-three-sentence plain-language reading of that ruling, resolved from the confirm item's own `digest:` else from the `digest:` of the ledger entry `authority:` names (`qa-ledger-format.md`); `null` when neither carries one |
| `context` | unchanged in meaning across every kind — the short prose. On a confirmation: the digest, or the `basis` of a judgement call |

A consumer renders the digest and puts the quote one expander away, and **labels the quote as the
text that governs** — the digest is explicitly non-authoritative. With `digest: null` it says so
("no digest authored yet") rather than inventing a summary; the derivation never paraphrases.

## `kind` (open vocabulary, path-and-extension only)

`gate-record`, `gate-predictions`, `dossier-config`, `qa-ledger`, `resource-protocol`, `bpmn`,
`bpmn-source`, `screen-model`, `si-doc`, `call-chain`, `spec`, `adr`, `sequence-map`, `walklog`,
`doc`, `data`, `directory`, `other`.

First match wins, so the specific rows come before the general ones. **Code joins this table later
as further entries** (ADR-062 §4) — the extension point is a vocabulary row, not a new mechanism,
and the index shape, the review states, the ordering and the endpoint do not change when it does.
`use-case` is reserved for the model store's use cases, which this build does not index: the model
store is SNS's, and this document indexes the project's documentation artifacts.

A consumer must treat `kind` as open and render an unrecognised value sensibly rather than
dropping it. `reviewState` and an obligation's `audience` are **closed**; an obligation's `kind`
(`question`, `confirmation`, `check`, `open-item`) grows the same additive way this one does, so
a consumer renders an unknown obligation kind rather than dropping it.

## The document

```json
{
  "format": "review-surface/1",
  "project": "widgets",
  "artifacts": [
    { "id": "docs/02_Business/01_Business-Processes/BP01.bpmn",
      "label": "Business processes — BP01.bpmn",
      "kind": "bpmn",
      "path": "docs/02_Business/01_Business-Processes/BP01.bpmn",
      "reviewState": "changed-since-blessed",
      "gate": "gate-1-intent",
      "blessedOn": "2026-07-28",
      "lastChanged": "2026-08-19T14:02:11+02:00",
      "audiences": ["owner"],
      "obligations": [
        { "id": "QA-034",
          "kind": "question",
          "audience": "owner",
          "ref": null,
          "title": "May a driver record a partial cash payment, or is it all-or-owed?",
          "since": "2026-07-19",
          "context": "Design-stage decomposition of the settlement volatility (harvest item V-07)",
          "gate": null,
          "authority": null,
          "source": { "file": "widgets.method/qa.yaml", "line": 54 } }
      ] }
  ],
  "gates": [
    { "id": "A", "kind": "stage", "title": "Discovery", "status": "done",
      "record": null, "blessedOn": null, "onRail": true, "counts": null },
    { "id": "intent", "kind": "gate", "title": "Intent", "status": "blessed",
      "record": "gate-1-intent", "blessedOn": "2026-07-28", "onRail": true,
      "counts": { "reviewOwed": 1, "carriedOver": 0, "changedSinceBlessed": 7,
                  "unreviewed": 0, "blessed": 31, "obligations": 1, "total": 39 } }
  ],
  "counts": { "reviewOwed": 4, "changedSinceBlessed": 7, "unreviewed": 2, "blessed": 31, "total": 44 }
}
```

| field | meaning |
|---|---|
| `id` | the artifact's project-relative path — unique, and stable across runs |
| `label` | the gate record's own label for it, or the path where no record named it |
| `kind` | the vocabulary above |
| `path` | project-relative; what Studio routes its viewer at |
| `reviewState` | the closed set above |
| `gate` | the gate directory that decides the state; `null` when `unreviewed` |
| `blessedOn` | the latest blessing date covering it; `null` when never blessed |
| `lastChanged` | ISO 8601 committer date of its newest commit; `null` when git has never recorded it |
| `carriedOver` | `true` on the re-walk delta case above; **absent otherwise** — never `false` |
| `audiences` | the distinct audiences of its obligations, sorted — the panel's filter |
| `obligations` | the list above; `[]` when nothing is owed |

**Compatibility:** additive optional top-level or per-entry fields do **not** bump the format
string — a consumer must ignore fields it does not know (`gates`, `carriedOver`, and the
obligations' `digest`/`quote`/`verdict` all arrived this way). A **new obligation `kind`** is
additive too, and for the same reason a new artifact `kind` is (ADR-062 §4): the index shape, the
review states and the ordering do not move when one arrives, and a consumer that does not know a
kind must render it sensibly rather than drop it — `check` is the first such arrival (#1049).
`review-surface/2` is reserved for a change that alters the meaning of an existing field.
The per-checkout script and the Studio binary version independently; an optional field is what
lets either side lead without breaking the other.

## The rail (`gates`)

The Diamond rail (ADR-040), so a surface can put the gate at the center rather than in a footnote:
first **all nine template entries** (`discovery mockup intent design blueprint specification
contract construction acceptance`) in template order, then every
off-rail gate record the sweep read, sorted by directory — a second walk's records sit beside the
rail's, and *nothing hidden* applies to the rail too.

| field | meaning |
|---|---|
| `id` | the template id (the nine rail words) on the rail; the gate **directory** off it |
| `kind` | `stage` \| `gate` |
| `title` | the speaking name (`Intent`, `Design`, …); off-rail: `"<Speaking> — <dir>"` |
| `status` | gates: `blessed` \| `pending` \| `locked`; stages: `done` \| `active` \| `locked` |
| `record` | the gate directory — the join key to the artifacts' `gate` field; `null` for stages and unconducted gates |
| `blessedOn` | the record's `blessed:` date; `null` otherwise |
| `onRail` | `false` for records `dossier.yaml`'s rail does not name |
| `counts` | per-gate artifact tally (below); **`null` for stages** |

States come from `dossier.yaml`'s `rail:` list exactly as the dossier build reads them — an
unknown rail id or an out-of-vocabulary state is **fatal** (#1018); an absent entry defaults to
`locked`. Where a record exists, the **record's** `status:` and `blessed:` win over the rail
entry: the record is the gate-exit artifact, the rail entry is the run's summary of it.

`counts` tallies the artifacts whose `gate` field names this gate's `record` — one count per
review state, plus `carriedOver`, `obligations` (the summed obligation lists) and `total`. Counts
are over the **whole derivation**, never the `--state`/`--audience` view, same rule as the
top-level `counts`. Stage entries carry `counts: null` deliberately: "produced in this stage" is a
lens over the stage's exit gate, and emitting the tally twice would be a second original of it.

`source.line` on an obligation names the line of its `- id:` in the ledger, or of the item's first
key in the record, so the obligation is answerable **at its original, in Git** rather than in a
rendering. That is the failure this whole decision exists to close: the Figaro run's question list
was a rendering with no original behind it.

## Determinism

Identical inputs produce byte-identical output. Artifacts are ordered by review state, then
`kind`, then `path`; directory walks are sorted; nothing carries a timestamp of its own. The
document is **never stored** — every stored copy of a derived thing is a second original, and two
originals can only diverge (ADR-062, resolved questions; #861 is the precedent).
