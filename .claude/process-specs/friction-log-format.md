# The Friction Log format (`friction-log/2`)

**Status:** the format spec ADR-064 amendment 5 left owing (#1119) — the single source for the
shape of `.theagent/conduct/friction-log.yaml`. What the log is *for* is ADR-056 §5/§5b; this
note fixes its fields, its closed vocabularies, and the check surface (the `theagent2` runtime).

## Purpose

One committed, machine-readable file per conducted run that records **what the process cost the
run** — every ambiguity, tool gap, and conduct defect met while walking the rail. It is the one
cross-run artifact the process retro reads (ADR-038 §5 criterion 5, "friction accounted for"), so
a defect that never lands here is invisible to the pass that judges whether the process is right.

Friction is **conduct-inclusive** (ADR-056 §5b): an entry may record how the run was *conducted* —
a handover not performed, a succession announced and never run — not only what broke in the work
product. The node retro derives the missing entries mechanically at every gate exit and reconciles
them against the node's issue window.

Location: **`.theagent/conduct/friction-log.yaml`** — committed, beside the resume surface and the
ledger (`conduct-state-format.md` holds the directory's full contract). The file is **optional**:
a run that has met no friction yet has none. It is authored and read by agents; nothing derives it.

**One verb writes it: `theagent2 conduct friction add`** (#1439). It validates the whole file,
mints the entry id by continuing the file's own series (#1445), stamps the node off the writing session's ledger row, appends at end of file
and lands the result atomically — so the log is never hand-edited, exactly as `open_items` is
never hand-edited. It leaves the commit to the caller: an entry is committed with the work that
produced it. Before the verb existed the only way to add an entry was a text editor, and the first
real log in existence drifted into invalid YAML that way (#1119); worse, the disposition this
process calls cheapest was the one nobody could perform, so findings routed to an issue instead.

**This file is not a prose friction narrative.** A repository may separately keep a
hand-written Markdown account of the friction its programme met — a different artifact, with a
different shape, a different reader and its own counting tool. This spec governs only the
per-run YAML file named above: `format:`-versioned, machine-read, one entry per friction. If a
project keeps both, the YAML is the one a run derives from and the prose is the one a human
writes; neither is the other's source.

## Shape (by example — illustrative)

```yaml
format: friction-log/2

run: figaro                        # the run slug — the same one `state.yaml` and the ledger carry
project: figaro                    # optional: the repository this run designs

reconciliations:                   # optional; one block per gate exit (ADR-056 §5b)
  - gate: intent
    window: "2026-08-25T13:06Z .. 2026-08-26T12:30Z"
    dispositions:
      - issue: "figaro#38"
        disposition: friction
        entry: F-012              # the entry written for it — must exist under `entries:`
      - issue: "figaro#41"
        disposition: not-friction
        reason: "A question that reached the right addressee is the process, not its friction."

entries:                           # LAST key in the file — appending an entry is an append at EOF
  - id: F-012
    date: 2026-08-25
    node: mockup                   # the rail node the friction happened on (ADR-040/064)
    tag: conduct                   # theory | tooling | conduct — exactly one
    text: "The conductor committed while a dispatched session was working in the same tree and
      swept that session's whole output into its own commit. One working tree means one git
      index, so `git add <path>` narrows what the conductor ADDS but not what the commit TAKES."
    evidence: "225c422 (10 files, 8 of them the other session's); briefs/S-092.md"
    issue: "figaro#83"             # optional; authoritative where present
    session: S-092                 # optional; the ledger id of the session that met it
```

## Rules (checker-enforced)

- `format` is the first line and is `friction-log/2`; validators match name and version only
  (ADR-051 §4). The version is load-bearing: `conduct migrate-rail` bumps it when it rewrites the
  rail vocabulary inside the file (ADR-064 amendment 5), so a file still claiming the previous
  version is a file the migration has not walked.
- `run` is a non-empty string and matches the run slug in `state.yaml`. `project` is optional.
- **`entries` is the LAST top-level key.** An append-only log is appended to at end-of-file, and a
  key below it forces every writer to insert into the middle instead — which is how the first real
  friction log in existence drifted into invalid YAML, and, with no program reading it, nobody
  found out. Put `reconciliations:` above `entries:`.
- **`entries`** is a list (may be empty). Each entry carries, all required:
  - `id` — a short, unique, whitespace-free label (`F-…`) so a gate record, a session record or a
    reconciliation row can cite the entry. Ids are local labels for one run, never rail ids.

    **Minting is the writer's, and it CONTINUES the file's own series** (#1445). An id is `F-`, an
    optional **series** label, and a serial: `F-001` (series none), `F-D57` (series `D`), `F-G1-07`
    (series `G1-`). A run may use the series for the stage or gate **window** an entry belongs to —
    that is what makes the node retro's partition of this log a lookup rather than a scan — and
    `conduct friction add` reads it off the file rather than assuming one: the live series is the
    one carried by the **last entry that has a series**, and the serial is the **highest** in that
    series, so `F-D57` yields `F-D58`. Nothing in the toolchain maps a rail node to a window, so the
    verb never guesses a window boundary: `--series <label>` opens a new one, and the output says
    which series an entry STARTED whenever it started one. A log with no series-carrying id at all
    starts `F-001`. A series may hold digits but must not END in one — `F-G12` reads back as series
    `G`, serial `12`, and an id that parses differently from the way it was minted is a duplicate
    waiting to happen. **The writer refuses rather than mint an id the file already carries.**

    Before this rule the verb minted from 1 regardless, and its first real call put `F-001` into a
    204-entry log whose live series was `F-D57` — no collision, and that was the trap: two id
    vocabularies growing in parallel over one register, which is #1309's shape, and a verb-written
    entry outside every window, invisible to the retro that reads this file. A pre-existing id that
    does not follow the convention is legal input: it is ignored for numbering, still checked for
    uniqueness, and never rewritten — this log is append-only.
  - `date` — `YYYY-MM-DD`, when the friction *happened* (not when it was written down).
  - `node` — one of the nine rail ids: `discovery mockup intent design blueprint specification
    contract construction acceptance`. It is what the node retro correlates against the ledger,
    which is why it is a closed vocabulary and why it migrated with everything else.
  - `tag` — exactly one of `theory | tooling | conduct` (ADR-056 §5b). `theory`: the method's model
    of the work was wrong. `tooling`: a tool defect or gap. `conduct`: how the run was conducted.
  - `text` — what happened, in prose. No length rule; a reader who was not there must be able to
    act on it.
  - `evidence` — **every entry names what it rests on.** A commit, a session record, an open item,
    a transcript observation, a file and line. An entry with no evidence is a recollection, and a
    log of recollections cannot be audited by the retro that reads it, nor believed by the process
    verdict that quotes it. The field is prose, deliberately: what counts as evidence differs per
    entry, and a typed reference would exclude the transcript findings that produce the best ones.
  - `issue` — optional; the tracker ref, `repo#NN` or `#NN`. Authoritative where present. Absent
    **by design** for a stride fix (`finding-switch.md`): a tooling defect fixed on the spot has
    no issue, and its `evidence` is the `fix(stride):` commit — the entry is the whole record, and
    the retro counts the commit prefix, not a tracker number. A reconciliation row never lists
    such an entry, because there was no issue in the window to reconcile.
  - `session` — optional; the ledger id (`S-###`) of the session that met the friction, stamped by
    `conduct friction add` from `THEAGENT2_LEDGER_ENTRY`. **Optional and additive**: an entry
    written before the field existed reads exactly as it did, which is why the field moved no
    format version — the same rule `effort`, `narrowed` and `cost_andon` were added to
    `conduct-ledger/3` under. It exists because the node retro partitions this log by SESSION
    WINDOW, and the only way to do that without the field is to guess from `date` + `node`, which
    two sessions on one node in one day make ambiguous. Present, it must be a ledger id: a stamp
    nobody can join to the ledger is decoration.
- Entry ids are unique within the file. Entries are **not** required to be in date order: a run
  groups them by node and back-fills, and re-sorting an append-only record would edit it.
- **`reconciliations`** is optional; each block records one gate exit's reconciliation of the
  node's issue window against this log (ADR-056 §5b):
  - `gate` — one of `intent blueprint contract acceptance`.
  - `window` — the issue window the retro searched, as prose (the two timestamps, or the query).
  - `dispositions` — one row per issue in the window. Each carries `issue`, and `disposition`,
    which is `friction` or `not-friction`. A `friction` row names the `entry` it produced, and the
    id must exist under `entries:`; a `not-friction` row states a non-empty `reason`. Nothing else
    is counted — the number of issues in the window IS the length of this list, never a field
    beside it that can disagree with it.

## What does not live here

- **Counts.** A gate record's `conduct.friction:` is the number of entries attributed to the node
  (`gate-record-format.md`); this file is the entries themselves. One number, derived, in one place.
- **The resolution.** An entry is not amended with what was later done about it — the `issue` ref
  and the gate records carry that, and rewriting an entry destroys the record of what was known
  when. The programme's Markdown log keeps a `Resolution` line; this one does not.
- **Open items.** A finding that still blocks the run belongs in `state.yaml`'s `open_items`, where
  every boot reports it (`conduct-state-format.md`). Friction is what the run has already paid.

## Check surface

The `theagent2` runtime is the validator, fail-closed, exactly as it is for the resume surface and
the ledger: `theagent2 conduct boot` reads the file when it exists and **refuses to boot** on
anything this spec rejects, naming the field and the value. A missing file is not an error.

Before #1119 nothing read the file at all — the version was decorative, nothing refused a stale
version, and nothing refused an entry that invented a field. The shape lived in the head of
whichever session last wrote one, and the first real instance documented its own tag vocabulary in
a comment and had drifted into invalid YAML.

`conduct boot` also reports one line — the entry count and the tag split — so a run that has
stopped logging friction is visible at every boot rather than at the retro that needed it.

**`theagent2 kaizen watch` reads this file too**, since the Software Architect's letter «B» on relay
`R-505` (2026-09-21): it pulls the Kaizen cord when three entries carrying the SAME `tag` name each
other through `text` or `evidence` and no Kaizen pull has ever named any of them. It **adds no field
and asks no writer to do anything differently** — the test is built on what writers already write,
which is why it moved no format version. The one thing it makes load-bearing that was decorative
before: **citing an earlier entry's `id` in `text` or `evidence` is now read by a program**, so a
citation is how a writer says "this is the same friction as that one".

## Version history

- **Not a version:** how the id is minted (2026-09-10, #1445) — the rule under `id` above fixes what
  the WRITER does; the field's shape ("short, unique, whitespace-free, `F-…`") is unchanged, so every
  existing file stays valid and every existing reader stays right. It is recorded here because the
  format spec and the only writer of the format disagreed, and this says which one is normative.

- **Not a version:** `session` on an entry (2026-09-10, #1439) — optional and additive, so every
  existing file stays valid and every existing reader stays right.

- `friction-log/2` (2026-08-28, ADR-064 amendment 5, #1107) — `stage:` became `node:` with a word
  value and `gate:` took its word, as part of the rail rename. `conduct migrate-rail` performs it.
- `friction-log/1` — the same shape with the retired letter-and-number rail vocabulary. No
  validator ever read it; nothing accepts it now.
