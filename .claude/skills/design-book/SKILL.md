---
name: design-book
description: "The project's Design Book (ADR-052) — the linear, human-first documentation surface: chaptered static HTML with a persistent left sidebar, reading order = the process timeline, content order oriented at the DDC deck (business → volatilities → static architecture → use-case realization → contract). The chapter skeleton, sidebar, and styling are process-owned and ship here; genuinely new prose lives in the project's docs/00_Design-Book/book.yaml (format design-book/1_*), and everything else is pulled LIVE from the tree (BP narratives from the BP markdowns, screen blurbs from the .vw doc blocks, diagrams as inline SVGs). Activate when asked to build/regenerate/check the design book, when BP docs, screen models, diagrams or gate records change, when a new stage's chapters need filling, or when asked how the project documentation is organized for humans. Format spec section in: process-specs/gate-record-format.md (companion); governing decision ADR-052."
---

# design-book — the project's linear documentation surface

One book per project: Part I The Business, Part II The System, Part III The Contract,
Part IV Construction & Acceptance. Diagrams first, text second; chapters not yet reachable
render as PLANNED outlines. The book renders truth living elsewhere in the tree — it never
duplicates it (BP narratives come from the BP markdowns' `## Description`, screen blurbs
from the `.vw` doc blocks, gate chapters link the ADR-051 dossiers).

## Build / check

```sh
node <this-skill>/bin/book-build.mjs <project-root>          # regenerate
node <this-skill>/bin/book-build.mjs <project-root> --check  # drift guard, exit 1
```

Reads `<project-root>/docs/00_Design-Book/book.yaml` plus the live tree, writes the chapter
pages beside it (plus the vendored `mermaid.min.js` viewer, ADR-053 — SI and SQ diagrams are
Mermaid fences extracted from their markdowns and rendered client-side; there is no diagram
rendering step). Deterministic. An input a later stage has not produced yet — no BP markdowns,
no screen models, no Method model, no call chains, no spec dir, an unconducted gate's dossier —
renders its chapter as a PLANNED outline instead of failing the build (#1021): the book builds
from the first stage onward, and chapters light up by themselves as stages complete, with
nothing to declare in book.yaml. Inputs that exist but are broken (a screen model without a
doc block, a chain without its mermaid fence, a LIVE process without its SVGs) stay fatal.

**A non-live or undrawn process demands no diagram (#1268).** A business process whose `.bpd`
header declares `status parked|retired|dissolved` (tooling contract §1a) is skipped by the
generators — no `.bpmn`, no SVG comes out of it — so the book EXPECTS its rendered pair to be
absent instead of demanding it; the status is read from the header wherever the source sits,
including a `parked/future/` or `parked/abandoned/` mirror folder, and a folder that disagrees
with the header it mirrors is a reported finding. A dissolved process has no source at all — its
drawing is deleted once the successor carries the subject — so a chapter with neither a source
nor a rendering is a tombstone and demands nothing either. The build does not stop looking: the
moment ANY rendering of a process is on disk, the documented pair is demanded again, non-live or
not. Every chapter of which no diagram was demanded is NAMED on one line with its class, because
a silent skip is a new way to lose a process.

**The pages are a rendering, never a document to edit.** `--check` fails whenever a committed
page no longer matches what the tree produces, and the only correct answer is to re-run the
regenerate command — an edit made in the page is erased by the next build. This guard was red
for four changeloops because running it was a caller's decision (#590); in the theagent-unchained
monorepo it is `just book-check` and runs inside `just test`.

**Both directions of staleness are checked (#878).** Besides the pages the generator still
writes, the check sweeps the output directory for files nothing writes any more: a chapter
dropped from the skeleton leaves its HTML behind, unlinked from every sidebar but still served
and still openable by an old URL. `--check` reports such a file as `(orphan)`; the regenerate
run deletes it. The keep-list is exactly `book.yaml` — the one project-owned source that lives
in the output directory. Put nothing else beside the pages; subdirectories and dotfiles are
left alone (the generator writes neither, so nothing it could orphan hides there).

## What is project-owned (book.yaml) vs pulled live

- **book.yaml:** title/subtitle, chapter 1–2 narrative blocks (`p`/`b`/`q`/`link`), the
  business-map and rulings chapter blocks, gate summaries + dossier links. Optionally
  `bp_description_heading` — the `##` heading the BP-narrative extractor matches (a single
  value or an ordered first-match-wins list; default `Description`): the BP markdowns are
  stakeholder-facing and stay in the stakeholder's language, so the extractor adapts, never
  the documents (#1024).
- **book.yaml, language (#1023):** the book is business-facing, so the LANGUAGE of the
  template-owned chrome is the project's even though its structure is not. Optionally
  `language:` — a BCP 47 tag emitted as every page's `<html lang>` attribute (default `en`) —
  and `strings:` — a flat map overriding individual chrome strings by key: part names
  (`part_business`, …), chapter titles (`chapter_processes`, `chapter_gate_1`, …), section
  furniture (`bp_level1`, `bp_full_document`, `gate_dossier_link`, …), the PLANNED texts, the
  generator's chapter ledes (`volatility_lede`, `specs_lede`, …), table headers and the
  provenance footer. Defaults are today's English, so a project declaring neither renders
  byte-identically; an unknown key fails the build and its message lists every overridable
  key. `{name}` placeholders (counts, filenames) must be kept in an overridden value. The
  tool never translates — the project supplies the text.
- **Pulled live:** the BP list, names and narratives, L1/L2/SI diagrams, screen models and
  wireframes, counts. A chapter's NAME comes from the artifact itself — the BP markdown's H1
  (`# <id> — <name>`), the screen model's own `title "…"` — and only falls back to the
  de-camel-cased filename when the artifact names itself nowhere: a slug read out as words
  is a machine's phrase, in the wrong language for any project that is not English (#1083).
  If prose already exists in an artifact, extract it — never re-type it.

## What is template-owned (do not put into book.yaml)

The part/chapter skeleton, sidebar, PLANNED outlines, styling, and the front-door behavior
(the docs-server serves the book at `/` in `--project` mode). Changing those is a process
change and lands in every project identically. A project may re-word any chrome string into
its own language via `strings:` (#1023, above) — but never add, drop, or reorder chapters:
the WORDING is project-owned, the STRUCTURE is not.
