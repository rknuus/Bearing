---
name: call-chains
description: "Regenerate the project's Call-Chain documentation (docs/03_Technology/02_Call-Chains) from the architecture model — one markdown per modeled sequence (SQxx.yy.zz) carrying a Mermaid SEQUENCE diagram (who calls whom, with the model's own step notes) and a Mermaid ACTIVITY diagram drawn from the model's declared sequence paths (D-SEQUENCE-PATH-V1, #564), plus the README index with step and path counts. These files are GENERATED: the model is the source and hand-editing them is how they went stale for four changeloops (#567). Activate when a model changeloop lands, when asked to regenerate/refresh/check the call chains or the SQ diagrams, when the call-chain docs disagree with the model, or when a sequence gains, loses or re-declares a path. `--check` is the staleness gate for CI. Governing decisions: ADR-030/ADR-031 (docs and model reconcile by id), ADR-036 (legs end at the ResourceAccess), ADR-053 (Mermaid, not PlantUML)."
---

# call-chains — the model's use-case realization, rendered

Two views of one truth, per modeled sequence:

- **the sequence diagram** — who calls whom, in the order the model draws, every step carrying its
  `SQxx.yy.zz.nn` id and the design's note;
- **the activity diagram** — which of those steps ONE run takes, and under what condition, drawn
  from the model's `paths:` declaration. A sequence that declares no path says so in words instead
  of getting a straight-line picture, because a straight line would assert a claim the model has
  not made.

The activity diagram matters beyond documentation: it is drawn from the *same* declaration that
`seqcheck trace` holds recorded runs to. The picture and the gate cannot drift apart, because
there is only one source. Before the paths existed, the fork lived in prose — *"the 'Delivery
order?' fork lives in this sequence's activity diagram"* — and no diagram existed to hold it.

## Build / check

```bash
# the model, as JSON (the generator never re-parses the model's YAML)
sns-cli read --project <project> --kind ReadArchitecture > /tmp/arch.json

node bin/callchain-build.mjs --model /tmp/arch.json --out docs/03_Technology/02_Call-Chains
node bin/callchain-build.mjs --model /tmp/arch.json --out docs/03_Technology/02_Call-Chains --check
```

`--check` writes nothing and exits 1 listing every file that does not match the model — including
a markdown for a sequence the model no longer draws, which is stale in the direction a reader
cannot see. Run the build at the end of every model changeloop, in the same slot as
`seqmap generate` and the scaffolder; run `--check` in CI.

Both modes also hold the output to one property `--check` cannot see by comparison: **no Mermaid
entity escape (`#59;`) outside a fence** (#1059). The `;` → `#59;` substitution is fence dialect —
a bare semicolon terminates a Mermaid statement — and it once leaked into the step prose, showing
readers `contact#59; payment method` where the model says `contact; payment method`. Because
`--check` re-runs this generator, a defect the generator makes *consistently* reproduces
byte-identically and the gate is green by construction; the guard is what catches the class. The
build fails with exit 2 when this run generated such an escape, and `--check` fails with exit 1
when a committed file still carries one. An entity the model's own prose contains is left alone.

In this repository both are wired as `just call-chains` and `just call-chains-check`. The
changeloop does not run that check by name: it runs **`just derived-check`** (#785), which runs this
gate together with the three other derived-artifact gates — the bound Sequence Map, the Design Book
and the screen wireframes — and reports every stale one. Four commands a conduct had to remember is
how these documents went stale twice.

## What it will not do

- It will not invent a path. Paths are a design act, authored into the model
  (`sns-cli mutate --kind SequencePath`); this skill renders what is declared.
- It will not merge a hand edit. The files are overwritten; anything worth keeping belongs in the
  model — the step `note`, the path `guard`, the use-case `description` all reach the page.
- It will not touch the authored System-Interaction markdowns under `docs/02_Business` — those are
  written by a human and reconciled by id, never generated.
