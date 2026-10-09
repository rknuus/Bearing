# BP01 — Start Bearing

**Stage.** Discovery / Mockup — **before the Intent gate**. Nothing here is const.

| | |
|---|---|
| **Trigger** | The user launches Bearing. |
| **Goal** | The user ends up working in Bearing, on their own data, with the data folder under version control — or is told why they cannot and what to do about it. |
| **Actors** | **User** (the only human; also the stakeholder) · **Bearing** (the system). No external system takes part. |
| **Source** | `diagrams/BP01_StartBearing.bpd` — the one tagged source for both levels. |
| **Sources it traces to** | `wf §7.1` (onboarding), `wf §7.2` (bootstrapping, no settings), `wf §7.7` (new-data-folder notification) |
| **Rules it exercises** | BR-80, BR-81, BR-82, BR-48 |

## The flow in one paragraph

Every launch resolves the conventional data folder and ends in one of three outcomes. **Usable
data** — the folder is Bearing's own, or is brought under version control on the spot — and the user
simply works. **A repository Bearing did not create** — refused; the user moves it aside by hand and
relaunches. **A new, empty folder** — the user is told before any of their data is touched, and is
the one who decides what that means: quit and restore a backup, or continue as a first run. Only
that last path reaches onboarding, which seeds five starter themes, lets them be adjusted inline,
offers vision and mission, and can be skipped at either step. Completion lands on Focus.

## Level 1 — fully detailed (system chains inline-expanded)

![BP01 level 1](SVG/BP01_StartBearing.01_detailed.svg)

## Level 2 — detailed (system chains collapsed, one box per call site)

![BP01 level 2](SVG/BP01_StartBearing.02_detailed.svg)

## Call sites

Five, each one synchronous call into the system. The ids are **call sites of this process**
(`BP01.yy`, ADR-069) — which System Interaction each resolves to is a Design decision, recorded in
`si-binding.yaml`, never a rename.

| Call site | On the box | What it does | Steps |
|---|---|---|---|
| [`BP01.01`](../02_System-Interactions/BP01.01_StartUp.md) | Start up | Resolves the path, inspects the folder, and does the one thing its state calls for: load · version-control then load · refuse · create then version-control. Reports the outcome. | 10, one gateway of four branches |
| [`BP01.02`](../02_System-Interactions/BP01.02_StartOnboarding.md) | Start onboarding | Creates the five starter themes and returns the set. | 2 |
| [`BP01.03`](../02_System-Interactions/BP01.03_AmendTheStarterSet.md) | Amend the starter set | Applies one inline edit, removal or addition and returns the set. | 2 |
| [`BP01.04`](../02_System-Interactions/BP01.04_RecordVisionAndMission.md) | Record vision and mission | Stores both and confirms what was stored. | 2 |
| [`BP01.05`](../02_System-Interactions/BP01.05_CompleteOnboarding.md) | Complete onboarding | Records that onboarding is complete and opens Focus. | 2 |

**Three of §6's eleven candidate interactions turned out not to be operations.** *Adopt a folder
already under version control*, *bring an unversioned folder under version control* and *create a
folder* are **branches of `BP01.01`**, not three calls — the launch is one request, and the folder's
state is a variation of one answer. *Report that a new folder was created* and *report a foreign
repository* are that call's **answer**, carried on the message back to the user. *Skip a wizard step*
and *skip the wizard* are **gateway edges into `BP01.05`**: skipping is completing, minus what was
skipped. What is left is the five above.

## Findings for the Software Architect

1. **The process is wider than its name.** This drawing covers **every** launch, because three of
   the four folder states are ordinary returning-user launches, and §6 lists their interactions under
   this process. §5 calls it *"Start Bearing for the first time"* with the trigger *"App launch with
   no usable data folder"*, which is narrower than its own interaction list. Either the name and
   trigger widen — *"Start Bearing"* / *"App launch"*, as drawn here — or states 1–2 move into a
   process of their own. **Ruling owed.**
2. **Repeated amendment is drawn as a multi-instance step**, not as a loop: one instance per
   adjustment on the onboarding screen. If reviewing it as an explicit loop back to the review step
   reads better to the stakeholder, it is a one-line change.
3. **`BP01.03` may well be `BP02`'s theme edit.** Rule 9 forbids naming another process's call site
   here, so the drawing keeps its own id and Design records the reuse. Flagged so it is not
   rediscovered as duplication.
4. **A call site's speaking name is drawn in the *requester's* pool, so it is written in the
   requester's words.** The compiler labels the request arrow `<call-site id> · <speaking name>` and
   **discards the authored `send` label**, so that one string is both what the user asks for and what
   the system-side box is called. `BP01.01` therefore reads *Start up*, not *Resolve the data folder*
   — resolving the folder is what the system does inside the block, and no user thinks about it at
   launch. Same for `BP01.02`: *Start onboarding*, not *Seed the starter themes*. **The naming rule
   for every remaining BP:** name a call site for the request, never for the internal work.
   ⚠ Upstream: the arrow should carry the author's own `send` label and the box the speaking name;
   one string cannot honestly serve both. Worth raising against `bpmn-dsl`.

## Regenerating

```bash
bpmn-dsl build   diagrams/BP01_StartBearing.bpd --outputs       # both .bpmn levels
bpmn-dsl lint    diagrams/                                      # authoring rules
bpmn-dsl build   diagrams/ --check                              # staleness gate
bpmn-dsl si-export diagrams/ -o ../02_System-Interactions       # the per-call-site projections
render-bpmn-to-svg diagrams/<level>/BP01_StartBearing.bpmn -o SVG/BP01_StartBearing.<level>.svg \
  --si-docs ../02_System-Interactions
```

The `.bpmn`, the SVGs and everything under `02_System-Interactions/` are **generated**. Edit the
`.bpd` and rebuild; never hand-edit the output.
