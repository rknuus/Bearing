---
name: gate-dossier
description: "Gate Review Dossiers (ADR-051) — the identical-in-every-project review surface for the Diamond gates: one generated static page per conducted gate showing the evidence table (PASS / RULING OWED / OPEN / NOTE), the standing suite-strength evidence at Contract (ADR-054 Part A — mutation score, survivor dispositions, fuzz findings), the standing resource-protocol review at Contract (ADR-059 — one blessed sheet per ResourceAccess), the gate-entry prediction sheet diffed against what actually fired (#941 — standing at every pending gate of the conducting run), the artifact inventory counted live from the project tree, and the rulings still owed. Project-owned data lives in docs/04_Gates/ (dossier.yaml + one record.yaml per gate, formats dossier-config/1_* and gate-record/1_*); the template, rail, gate vocabulary and styling are process-owned and ship here. Activate when conducting or preparing a gate review (the record is a gate-exit artifact), when asked to build/regenerate/check the (gate) dossiers, when a gate record or dossier.yaml changes, or when a gate's evidence/agenda/open items move. Format: process-specs/gate-record-format.md."
---

# gate-dossier — the per-gate review surface

One dossier per Diamond gate (ADR-040), same surface in every project, so the Software
Architect always knows where to look: **evidence first, then the counted artifact inventory,
then the rulings still owed.** The dossier is a **view, never the truth** — status authority
stays with the project tracker and the gate records.

Format (single source, do not restate): `process-specs/gate-record-format.md` — theagent2 ships
the process-spec set as `process-specs/`, next to the `agents/` and `skills/` it installs.
Governing decision: ADR-051.

## Build / check

```sh
node <this-skill>/bin/dossier-build.mjs <project-root>          # regenerate
node <this-skill>/bin/dossier-build.mjs <project-root> --check  # drift guard, exit 1
```

Reads `<project-root>/docs/04_Gates/dossier.yaml` plus one `record.yaml` per conducted gate,
existence-checks and counts every artifact path against the tree (**a missing path fails the
build**), and writes self-contained HTML beside the records. Deterministic — no timestamps;
run `--check` in the same places `bpm-build --check` runs.

**Both directions of staleness are checked (#883).** Besides the pages the generator still
writes, the check sweeps `docs/04_Gates/` for files nothing writes any more: a gate dropped from
the rail leaves its HTML behind, linked from no index but still served by `just serve-project`
and still openable by an old URL — a gate review that no longer exists, presented as if it were
current. `--check` reports such a file as `(orphan)`; the regenerate run deletes it. The
keep-list is exactly `dossier.yaml` — the one project-owned source that lives in the output
directory. Record DIRECTORIES are never touched, and dotfiles are left alone (the generator
writes neither, so nothing it could orphan hides there). Put no other file beside the pages.

**Every gate owes its mechanical checks, and the list is the template's, not the author's
(#1071).** ADR-058 §3 has always said every mechanical exit check is run green or explicitly
waived in writing in the record, with the reason — *no check is ever skipped silently*. Nothing
enforced it: `checks:` was entirely author-supplied, so a record with no row for a check nobody
ran was indistinguishable from one that passed, and the rule bound the memory of a session
assembling a surface for a human who was waiting. Now each gate carries a required-check list
(`GATE_REQUIRES` in the builder, beside the rail and the gate vocabulary), a row answers for one
by its **`id:`**, and a required check with no row **renders OPEN** on a pending gate page and
**fails the build** once the gate is crossed by the run that conducted it. A check you cannot run
is recorded as `verdict: waiver` with `reason:`, `accepted_by:` and `unblocked_by:` — a waiver is
a review outcome a named person accepted, and it satisfies the requirement exactly as a green
does. The gates, their ids and the scoping limit are tabled in the format spec.

**Self-containment is enforced at every path, not by the author's care (#906).** `checks[].source`,
`sections[].artifacts[].path`, `suite_strength.source`, `components[].model`,
`resource_protocols.sheets[].path`, `conduct.source`, `qa_ledger` and each rail entry's `record`
are all refused when they leave the project — a `../` escape or an absolute path fails the build,
naming the field that carries it (ADR-051 §3).

## Authoring a record (the conducting side, at gate exit)

1. Copy the skeleton from the format spec; `format: gate-record/1_<gate speaking term>`.
2. Quote verdicts from the authoritative records (blessing record, standing records) — the
   record quotes, it never invents. Checks that quote a tracker state carry a `ref`.
3. List the review surface in review order; paths project-root-relative, counts come from
   the scan, never hand-written.
4. Self-containment: no path or reference may leave the project (ADR-051 §3); the only
   tracker URL lives in `dossier.yaml`.
5. **At Contract, fill `suite_strength`** — the ADR-054 Part A reference-model pass is standing
   entry evidence (score, survivor dispositions, fuzz findings), quoted from the project's
   suite-strength record. The section renders on the Contract dossier either way: with no block it
   renders OPEN, so an omitted pass shows up at the gate instead of disappearing. If no component
   carries a naive reference model, record a `waiver` line instead.
6. **At Contract, fill `resource_protocols`** — the ADR-059 sheets are standing evidence too:
   one entry per ResourceAccess, naming the reviewed sheet
   (`docs/03_Technology/03_Deployment/protocol/<RA>.protocol.yaml`) and the reviewer, which is the
   Software Architect or the domain-architect delegate the brief names (ADR-058). A green verdict
   asserts the sheet's own `--check` was green at review time. The section renders on the Contract
   dossier either way: with no block it renders OPEN, so an unreviewed resource surface shows up
   at the gate instead of disappearing (#884). Every sheet `path` is existence-checked and may not
   leave the project. If the system has no ResourceAccess at all, record a `waiver` line instead
   of `sheets` — the same escape `suite_strength` carries, so an honest nothing reads as a
   reviewed nothing rather than a permanent red OPEN (#907).
   **Once the gate is crossed, the block BLOCKS (#971):** a Contract record whose gate is crossed —
   its own `status: blessed`, or the run's conduct state recording contract `passed` — and whose block
   is absent, names no reviewer, or carries any sheet at a verdict other than `green` fails
   `dossier-check`. The pages are still written (the rendering is what the review act is
   performed against); the run exits non-zero afterwards, naming the debt. A gate not yet crossed
   keeps the OPEN placeholder, and `amber` there is an honest owed act.
   Each named sheet is **rendered on the page** (#969), never restated into the record: a Mermaid
   `erDiagram` of its `shape:` section (ADR-053), a plain column table per table — name, type,
   nullability, key, constraints — and one line per use case allowed to invoke a seam operation
   that destroys stored content, crossed from the sheet's `operations` effect classes against its
   `allow` lists — the danger classes of the sheet's kind (`delete`/`ddl` relational, `delete`
   document, `DELETE` REST, `rewrite`/`delete` file), read from the one table `--check` reports
   from, plus the sheet's `faults:` section — which raised fault identity the seam answers as
   result data, for which operation, into which result field, and why (#999); a sheet with no rows
   renders the one line saying the seam only rethrows. That is what the SA reviews: the table
   design, what can wipe data, and what the seam answers instead of failing.
7. In a conducted run, a **prediction sheet** sits beside the record (#941):
   `predictions.yaml` (`gate-predictions/1`), authored by the CONDUCTOR at gate **entry** —
   before the gate's checks run — and committed then, so git ordering proves the predictions
   predate the outcomes. One row per named risk: who named it, the check expected to catch it,
   what that check's silence would mean. The stage retro diffs it at gate exit in the conduct
   annex's `predictions:` block — every row dispositioned (`fired | silent | nothing`, the diff
   is total or the build refuses it) plus `unpredicted:` for what fired that no row named. The
   section is standing at every **pending** record of the conducting run: no sheet renders OPEN
   while the sheet can still be written honestly, and disappears once the gate is blessed — a
   prediction cannot be backfilled, so a permanent OPEN over history would be a debt nobody can
   pay.
8. In a conducted run, the record also carries the `conduct` annex — authored by the stage retro
   at gate exit (ADR-056 §5) from the stage's session-metrics rows, per
   `process-specs/gate-record-format.md`. The section is standing at **the gates this run
   crossed**, which the run's `.theagent/conduct/state.yaml` names record by record (#850): with
   no block it renders OPEN, so a skipped retro shows up, while a rail carrying an earlier run's
   gates is not accused of owing an annex those gates never owed.
   Its `source` is an **in-project copy** of the stage row placed beside the record, never the
   run ledger's own path — the ledger is run-scoped and lives above the project, and a record
   may not point out of the project (#836). The copy is byte-identical and the build re-compares
   it against the run's row whenever the run root is reachable.
9. **ADR-060 (#818) — the build enforces three honesty rules:** any check `result` carrying
   a score (a %, or X/Y) needs a `not_covered:` list (what the number does NOT measure — a
   bare percentage fails the build; a measured `suite_strength` pass needs one too), and on a
   PENDING record **every GREEN check needs one too**, whether or not it carries a number
   (#1221: `seqmap complete` stood green while a drawn hand-off was missing from the map,
   because it measures the binding of SI ids and gateway edges, never the steps inside an SI —
   a green row must say what it did not look at; red rows argue themselves, and blessed records
   are history). The scope lines render beside the VERDICT, in reading type, not under the
   result in footnote italics; the
   optional `confirm:` rows name their `authority:` — a ruling id with the ruling quoted
   VERBATIM (with `qa_ledger:` set in `dossier.yaml`, verified word-for-word against the
   ledger's `answer`), or the literal `none` with a `basis:` line declaring that no ruling
   covers it, which the dossier labels as a judgement call (ADR-056 §1c, #845) — and the same
   rule reaches **any** string in the record whose own prose asks the reviewer to confirm
   something, because the duty is about the request, not the field it is written in (#862, #873,
   #879). The read list is inverted: everything is read, and only the declaration fields
   (`authority`/`ruling`/`basis`/`not_an_ask`/`digest` — a ruling quote is often the words of a
   request, and its digest inherits them one step removed),
   the closed vocabularies (`format`/`gate`/`status`/`verdict`/`state`) and the paths
   (`path`/`source`/`model`/`ref`/`issues`) are exempt. Three ways forward: move it to
   `confirm:`, name its authority on the mapping that carries the prose (for the record's own
   `lede`/`disposition` that mapping is the record, so the field sits at the top level beside
   `status:`), or declare with `not_an_ask:` in one line that the words are not a request — and
   for a blurb or a lede, which track nothing, moving it is almost always the right one; and on
   every
   pending gate, items still open at earlier gates plus every ledger `deferred:` ruling must
   re-appear in `open[]` — nothing crosses a gate quietly.
10. **#1049 — a quoted ruling resolves a digest.** A verbatim answer runs to thousands of
   characters, so the dossier renders a two-or-three-sentence plain-language **Lesart** and
   collapses the quote behind it in a `<details>`, labelled *this text governs; the summary
   above is not authoritative*. The digest comes from the ledger entry `authority:` names
   (`digest:` in `qa.yaml` — the usual home, one digest serving every surface), or from a
   `digest:` on the confirm item when the reading asked for here is narrower. An item quoting a
   ruling that resolves **neither** fails the build. `authority: none` needs none and refuses
   one: its `basis` line already *is* the plain reading.
11. Rebuild, then flip the gate's `state` in `dossier.yaml`'s rail when the gate is blessed.

## The review surface (ADR-062)

The same two source formats, assembled for a different question. A dossier answers *is this gate
ready to bless?*; the review surface answers *what is there, what state is its review in, and what
needs me now?* — every artifact the project has, `review-owed` first and `blessed` last, with
nothing hidden, so re-opening something settled at Intent takes no more effort than opening a
pending thing.

```sh
node <this-skill>/bin/review-surface.mjs <project-root>          # human-readable index
node <this-skill>/bin/review-surface.mjs <project-root> --json   # the review-surface/1 document
node <this-skill>/bin/review-surface.mjs <project-root> --audience owner
```

Format (single source, do not restate): `process-specs/review-surface-format.md`.

It lives **here** because this skill already reads both source formats and already counts artifact
inventories from the tree, and ADR-062's own rule is that the derivation adds no third parser of
either format. Both binaries read them through `bin/record-read.mjs` — the strict YAML subset and
the ledger line scan, one copy, injected `die` so each binary names itself.

Unavailable is an **exit code**: no gate directory, no ledger, no git history → non-zero with the
reason on stderr and nothing on stdout. An empty surface and an unavailable one mean opposite
things to the reader, so the document has no way to say the second.

## What is template-owned (do not put into records)

The diamond rail, gate numbers/names, the generic "what this gate decides" texts, the verdict
taxonomy, section layout, styling. If those need to change, change the skill — that change is
a process change and lands in every project identically.
