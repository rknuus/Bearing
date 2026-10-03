---
name: sns-cli
description: "How to invoke the Software Natives Studio (SNS) CLI to read and mutate the IDesign architecture model — drafts, components, contracts, DTOs, validation. The architect, implementor, test-engineer, conformance-auditor, drift, and ui-designer agents all load this skill before touching the model."
---

# SNS CLI

`sns-cli` is the IDesign architecture model CLI shipped by the SNS team. theagent2 agents do not invoke it directly — they invoke `theagent2 sns <command>`, which reads workflow state and injects `--project / --draft` before exec'ing `sns-cli`.

## Checkout-local (2026-07-14, per D-CHECKOUT-LOCAL-V1) — read this first

The whole registration/workstream machinery was retired upstream. What changed on the surface you type:

- **`--workstream` / `--workstream-id` no longer exist on ANY verb.** Passing either is an unrecognized-option parse error (exit 2). Every dated note below that mentions `--workstream` injection or workstream flags is superseded on that point.
- **No registration, no global registry.** `list-projects` and `delete-project` are gone; `~/.software-natives-studio/` is gone. `init --kind InitFromScratch` still scaffolds the `.method` store — it registers nothing.
- **Resolution is checkout-anchored.** sns-cli resolves the `*.method` store from the CWD, walking up parent directories. `--project` survives as a vestigial label (the wrapper still injects it).
- **A workstream IS a git checkout/worktree containing the store.** Created with `git clone`/`git worktree add`, compared with `git merge`, deleted with git. The SNS-managed workstream verbs (`create-workstream`, `list-workstreams`, `get-workstream`, `workstream-lifecycle`) are gone.
- **Drafts are unchanged** (`--draft`, `create-draft --kind {FromCanonical|FromDraft}`, draft-lifecycle, conflict-resolution) — they live within the checkout. That flag is REQUIRED and has no default: omit it and the call dies at parse time with `USAGE_PARSE_ERROR: Option '--kind' is required`, before anything runs. It is named here because this line is what a grep for `create-draft` finds first; the full grammar is far below, under IDrafts.
- **`sns-cli serve [path]`** runs the per-checkout Studio UI (human-facing; opens a browser, dies on Ctrl-C). Agents don't need it.

## Mental model — same surface as a human (ADR-014)

You are a colleague. The architectural model lifecycle is **owned by SNS**. Both humans and agents use the same surface — the per-checkout Studio UI (`sns-cli serve`) in the browser, or `sns-cli` in the terminal. The wrapper exists only to spare you typing `--project`/`--draft` every call and to enforce theagent2's role/draft gates.

**Two truths that kill most "setup" confusion (#362, #363, D-CHECKOUT-LOCAL-V1):**
- **A project is just a checkout with a `.method/` store** — no account, no server, no registry row. `sns-cli init --kind InitFromScratch` creates the store; from then on every sns-cli invocation finds it from the CWD.
- **The checkout you are in IS the workstream.** Nothing needs to be created, registered, or bound to start working; parallel workstreams are parallel git checkouts.

**The boundary is contextual — bootstrap vs. mid-run:**

- **Bootstrap context** (no binding / no `.method` store — the errors say so): the right move is to complete the one-time bootstrap, not to declare a barrier. Recommend `theagent2 onboard` (idempotent: scaffold → bind → create the store), or run it / the manual steps yourself **with the user's consent** — it only writes local files. Order matters: `theagent2 sns bind --project <name>` comes FIRST (binding before the store exists is fine), then `theagent2 sns init --kind InitFromScratch`.
- **Mid-run context** (a workflow run is in flight and the model was reachable before): "project not found" / a failing store resolution now means real breakage — a barrier. Surface it verbatim as a barrier-exception request; do not auto-retry, do not re-init, do not paper over.

**You never (in any context):**
- Create or destroy sibling checkouts/worktrees on your own initiative. If a parallel workstream is needed, ask the human — it's a git act (`git clone` / `git worktree add`).
- Run `sns-cli init` mid-run without the user asking for it. Onboarding is a deliberate, user-visible act.

**You always:**
- Use `theagent2 sns <command>` for project / draft / architecture work.
- Use `theagent2 sns bind --project P` to record which project label the current run targets — this records, it does not create.
- Surface SNS errors verbatim to the conductor. SNS is the source of truth for what's allowed; do not interpret.

## The contract

- **`sns-cli` is stateless and checkout-anchored.** Every invocation resolves the `.method` store from the CWD (walking up). `--project <name>` rides along as a vestigial label; draft-scoped ops take `--draft <id>`. No session, no active-project binding, no per-role ACL.
- **State lives on theagent2's side**, in `.theagent-run/workflow-state.json`. The wrapper reads from there.
- **Agents use the wrapper.** `theagent2 sns read --kind ReadArchitecture` is the agent-facing form. Raw `sns-cli` is reserved for cross-project reads (rare, explicit — run it from the other project's checkout).
- **Strict project flag.** If an agent passes `--project` to the wrapper, the wrapper errors out. Cross-project work goes through raw `sns-cli` from the other checkout.
- **Wire shape (every successful response):**
  ```json
  {"schema_version":"1.0.0","success":true,"data":{...}}
  ```
- **Error envelope (every failure):**
  ```json
  {"schema_version":"1.0.0","success":false,"error":{"code":"...","message":"...","rule_id":"...","field_path":"...","expected":"...","got":"...","suggestion":"..."}}
  ```
  Stdout for success, stderr for errors. Non-zero exit on failure.

## Command surface

### IRegistry (no `--project`)

```
theagent2 sns version
```

(`list-projects` retired with the global registry — D-CHECKOUT-LOCAL-V1.)

### IProject (project-scoped)

```
theagent2 sns info   --kind {Self|Spec}
theagent2 sns init   --kind {InitFromScratch|InitFromExisting} [variant flags]
theagent2 sns update --kind {Metadata|Spec}                    [variant flags]
```

### IArchitecture (read-only)

```
theagent2 sns read       --kind {ReadArchitecture|ReadComponent|ReadFacets|ReadOperations|ReadSubsystems|ReadOperationalConcepts}
theagent2 sns validate   --kind {ValidateArchitecture|ValidateDraftPromotionGate}
theagent2 sns diff       --kind {DiffVersions|DiffComponentAtAnchor|DiscoverBaselineAnchor}
theagent2 sns challenge  --persona {architect|mentor|none} --target {whole|draft|component} [--target-ref <name-or-uuid>]
```

`ValidateDraftPromotionGate` requires `--draft`. The wrapper supplies it from `state.current.active_draft_id`.

`challenge` takes **no `--kind`** — it is the one IArchitecture verb that selects its variant elsewhere. `--persona` AND `--target` are both REQUIRED, both lower-case on the wire, and `--target component` additionally requires `--target-ref`.

### IArchitectureEdit (mutate, draft-only)

```
theagent2 sns mutate      --kind <variant>  [variant-specific flags]
theagent2 sns mutate-bulk (--batch-file <path> | --batch-stdin)
```

The 58 mutation variants the SNS CLI accepts under `--kind`, with their **required flags** (the parser-enforced minimum — invocations missing any of these produce `USAGE_FLAG_MISSING_FOR_KIND` and are wasted tokens). Optional flags are not listed; use the structured error response to discover them or consult the SNS team's CLI grammar for the full set. The table is the complete wire surface and is gated against the grammar by `just sns-cli-skill-verbs-check` — a verb the grammar declares and this table omits is a build failure, because the "never improvise" rule above makes an undocumented verb an unreachable one (#919). Since #927 that gate reads **every `--kind` list and every `--kind` example in this whole document**, not just this table: a `{A|B|C}` list must equal the grammar's set exactly, and a one-off example must name a kind that still exists. So trust the kinds written here — and when you change one, change the grammar's side or the check fails.

| `--kind` | Required flags |
|---|---|
| **Components** | |
| `AddComponent` | `--name`, `--component-type` |
| `RemoveComponent` | `--component` |
| `RenameComponent` | `--component`, `--new-name` |
| `SetComponentLifecycle` | `--component`, `--lifecycle` |
| `SetUtilityKind` | `--component`, `--utility-kind` |
| `SetComponentConsumes` | `--component`, `--consumes` (CSV of Utility names; `""` clears) |
| **Subsystems** | |
| `CreateSubsystem` | `--name`, `--description` |
| `RemoveSubsystem` | `--subsystem` |
| `RenameSubsystem` | `--subsystem`, `--new-name` |
| `AssignToSubsystem` | `--component`, `--subsystem` |
| `RemoveFromSubsystem` | `--component` |
| **Volatilities** | |
| `AddVolatility` | `--name` |
| `RejectVolatility` | `--name` |
| `RemoveRejectedVolatility` | `--name` |
| `SetVolatilityEncapsulators` | `--name`, `--encapsulators` |
| **Use cases** | |
| `AddUseCase` | `--name`, `--category` — **plus `--id` whenever the id is a keystone** (see below); optional `--operation` |
| `RemoveUseCase` | `--use-case-ref` |
| `SetAcceptanceCriterion` | `--use-case-ref`, `--action` |
| `SetUseCaseCategory` | `--use-case-ref`, `--category` |
| `SetUseCaseName` | `--use-case-ref`, `--new-name` |
| `SetUseCaseOperation` | `--use-case-ref`, `--operation` — **the operation this System Interaction IS** (see below) |
| `SetUseCaseLifecycle` | `--use-case-ref`, `--lifecycle` — `live\|future\|retired` (see below) |
| `AddPermutation` | `--use-case`, `--name` |
| `RemovePermutation` | `--use-case`, `--permutation-index` (the deprecated alias `--index` is still accepted) |
| `RenamePermutation` | `--use-case`, `--permutation-index`, `--new-name` |
| `SequenceStep` | `--use-case`, `--permutation-index`, `--action` — plus, per action: `add` → `--caller`, `--callee`, `--async` (`true` queued / `false` sync — no default, #1166) and one of `--operation` / `--operation-draft` (or `--step-kind internal` → `--caller`, `--label`; or `--step-json` in place of these flags); `remove` → `--step-index`; `update` → `--step-index` AND the step's EXISTING `--operation` / `--operation-draft` — the engine refuses a note-only or caller-only update with `step_missing_operation` («exactly one of `--operation` or `--operation-draft` is required»), so re-supply the operation the step already carries and only the fields you pass are overlaid; `reorder` → `--from-index`, `--to-index` |
| `SequencePath` | `--use-case`, `--permutation-index`, `--action`, `--path-name` — plus, for `--action set`: `--steps` (see below) |
| `AttachOperationToStep` | `--use-case`, `--permutation-index`, `--step-index` — **never `--step-index 0`** (see below) |
| `ChangeOperationOnStep` | `--use-case`, `--permutation-index`, `--step-index` — **never `--step-index 0`** (see below) |
| `DetachOperationFromStep` | `--use-case`, `--permutation-index`, `--step-index` |
| **Facets** | |
| `AddFacet` | `--component`, `--name` |
| `RenameFacet` | `--facet`, `--new-name` |
| `MoveFacet` | `--facet`, `--source-component`, `--target-component` |
| `RemoveFacet` | `--facet` |
| **Operations** | |
| `AddOperation` | `--facet`, `--name` |
| `SetOperationDtos` | `--operation` |
| `RenameOperation` | `--operation`, `--new-name` |
| `RemoveOperation` | `--operation` |
| **DTOs** | |
| `AddDto` | `--facet`, `--name` |
| `RenameDto` | `--dto`, `--new-name` |
| `RemoveDto` | `--dto` |
| `SetDtoExtends` | `--dto` — plus `--extends-ref` (see below) |
| `AddDtoField` | `--dto`, `--field-name`, `--field-type` |
| `RenameDtoField` | `--dto`, `--field`, `--new-field-name` |
| `UpdateDtoFieldType` | `--dto`, `--field`, `--field-type` |
| `SetDtoFieldDescription` | `--dto`, `--field` |
| `SetDtoFieldSemantics` | `--dto`, `--field` — plus at least one of `--computed-from` / `--default` / `--default-from` / `--domain` / `--field-kind` / `--shape-ok` (see below) |
| `RemoveDtoField` | `--dto`, `--field` |
| **Enumerated types** | |
| `AddEnum` | `--component`, `--name`, `--members` |
| `SetEnumMembers` | `--enum`, `--members` — REFUSES `--description`, which it does not write (#1575) |
| `RemoveEnum` | `--enum` |
| **Operational concepts** | |
| `AddOperationalConcept` | `--name`, `--category` |
| `UpdateOperationalConcept` | `--name` |
| `RemoveOperationalConcept` | `--name` |
| **Decisions** | |
| `AddDecision` | `--title`, `--rationale` |
| `UpdateDecision` | `--name` |
| `RemoveDecision` | `--name` |
| **Universal** | |
| `SetDescription` | `--entity-type`, `--name`, `--description`, `--child` (entityType ∈ component / facet / operation / dto / dto_field / **enum** / volatility / use_case / subsystem / sequence_step / permutation) |

**Addressing is by NAME, not by UUID** (SNS iteration-2). The `--*-id` slots this table
used to list (`--facet-id`, `--dto-id`, `--operation-id`, `--component-name`,
`--field-name` on the DTO-field edits, `--old-name`) are REMOVED: supplying one now fails
loud with a redirect to the name flag rather than being ignored. Names resolve at apply
time and fail loud on no-match or ambiguity.

**Context copies are addressed by name + scope, never by UUID (#788).** IDesign
context copies mean the SAME DTO or operation name legitimately lives in several facets
(Comanda has `RateCard` in `PricingEngine.OrderPricing`, `OrderManager.Composition` and
`SalesAccess.Orders`), and the same facet name in several components. Pass the parent
handle to disambiguate — the name alone is ambiguous by construction:

| Addressing a … | Scope flags |
|---|---|
| DTO / operation | `--facet <name>` (add `--component <name>` when the facet name is itself shared) |
| DTO field | `--facet` / `--component` on top of `--dto` (or `--child` on `SetDescription`) |
| Facet | `--component <name>` |

They are OPTIONAL and work on the CREATE verbs (`AddDto`, `AddOperation`,
`AddDtoField`), on the universal `SetDescription` (for `dto` / `dto_field` /
`operation` / `facet`), and — since #922 — on **all five DTO-field edit verbs**
(`RenameDtoField`, `UpdateDtoFieldType`, `SetDtoFieldDescription`,
`SetDtoFieldSemantics`, `RemoveDtoField`). Those five packed no scope until then, so a
field of a context-copy DTO had no legal address at all: the refusal suggested the
entity UUID, which this section forbids. Example:

```
theagent2 sns mutate --kind SetDescription --entity-type dto \
  --name RateCard --facet OrderPricing --component PricingEngine \
  --description "..."
```

Without a scope the call still fails loud (`UNRESOLVED_ADDRESSING`, exit 3) and the
message names the flag that narrows it. Do NOT reach for the entity UUID: model UUIDs
regenerate on replay and must never be persisted or compared across reads.

**An OPERATION on a sequence step is scoped by QUALIFYING THE NAME, not by a flag
(#1172).** `SequenceStep` (add / update), `AttachOperationToStep` and
`ChangeOperationOnStep` already scope operation lookup to the step's callee component,
which is enough to tell two components apart but NOT two context copies on one component
— `ProjectManager` carries `CreateWorkstream` on `IWorkstreamLifecycle` and again on
`Studio.IWorkstreamLifecycle` and `Cli.IWorkstreamLifecycle`. Pass the facet with it:

```
--operation Studio.IWorkstreamLifecycle.CreateWorkstream     # Facet.Operation
--operation ProjectManager.Cli.IWorkstreamLifecycle.CreateWorkstream   # Component.Facet.Operation
```

That is exactly the `qualifiedName` the `AmbiguousName` envelope prints in its
`candidates` list, so the fix for an ambiguity is to copy a candidate back into
`--operation`. `--facet` / `--component` do NOT scope these verbs; the qualified name is
the mechanism. A qualified name whose facet half is wrong reports `UnknownName` and lists
the facets that DO carry the operation, so a typo never reads as "the operation is gone".
Before this, a step onto a context copy had no legal address at all — the envelope's only
offer was the UUID, which the paragraph above forbids.

**A use case DECLARES the operation it is; step 0 is derived, never attached (ADR-067,
#1186).** One System Interaction is ONE operation call (`design-artifact-conventions`), and
an operation's variations are permutations OF THAT OPERATION, dispatched on a polymorphic
request DTO and named `{Base}_{Variant}` (ADR-027). Say it once:

```
theagent2 sns mutate --kind SetUseCaseOperation --use-case-ref SI02.01 \
  --operation TabManager.Visit.CaptureRound
```

`--operation` takes the same bare / `Facet.Operation` / `Component.Facet.Operation`
spellings as everywhere else, resolved UNSCOPED (a use case has no callee to scope by), so
an ambiguous bare name is refused with the qualified candidates. `AddUseCase` takes an
optional `--operation` for the case where the facet operation already exists; a use case
with none is INCOMPLETE, not illegal — a normal mid-Design state.

Consequently **`AttachOperationToStep` / `ChangeOperationOnStep` at `--step-index 0` are
refused**: step 0 is the client hop by construction (ADR-036 — a chain starts at the Client
and ends at the ResourceAccess), so its operation is not an independent fact. Before the
hoist the answer was given N times, once per permutation, by N attachments that nothing made
agree, and Comanda's `SI02.01` held two and reached construction. Steps 1..N are unchanged.
Drawing the client hop with `SequenceStep --action add --operation …` still works and hoists
the operation onto the use case for you.

**An edit that would give one use case a SECOND client-hop operation is REFUSED at the write**
(`use_case_operation_conflict`, #1192): two permutations entering through different operations
is the `SI02.01` defect itself, and the refusal names both fixes — make one a request variant
of the other (ONE operation, two request DTOs, `{Base}_{Variant}` permutations), or give the
second hop its own System Interaction with its own minted id. A second permutation entering
through the SAME operation is the legal shape and is untouched. To change which operation a use
case IS, use `SetUseCaseOperation` — never a step.

A conflict that was ALREADY in the model is not refused (that would make an unrelated sequence
edit fail because of a defect elsewhere in the file); it is reported as a non-blocking smell and
refused at promotion, where `Gate.UseCaseOperationUndeclared` also refuses a use case that draws
sequence steps and declares nothing (error — overridable via `--accept-findings`, and recorded in
`promotion-overrides.yaml`). Historical op-logs are unaffected either way: replay never refuses,
and a step-0 operation replays as a SEED of the declaration.

Notes:
- **Always supply a substantive `--description`** even when not required — it's surfaced everywhere in the model and absent descriptions become future debt.
- For `update --kind Spec` (project-level vision/mission via `theagent2 sns update --kind Spec ...`): exactly one of `--body` or `--body-file` is required (`USAGE_BODY_XOR`).
- For `update --kind Metadata`: at least one of `--name`, `--vision`, `--mission`, `--objectives` is required.
- For `mutate --kind UpdateDecision`: `--name` addresses the decision, and **at least one payload flag** (`--title`, `--rationale`, `--status`, `--context`, `--options-json`, `--exploration-json`, `--selected`, `--description`, `--related-components`, `--related-findings`, `--add-related-decisions`, `--remove-related-decisions`) is required — a payload-less call is `USAGE_FLAG_MISSING_FOR_KIND`, not a recorded no-op (#788).

Authoring behavior:
- **`SetDtoExtends` is how the ADR-027 variant relation gets onto a DTO that already exists
  (#916).** `--extends-ref <Base>` sets it; `--extends-ref ''` (present, empty) CLEARS it; omitting
  the flag entirely is a `missing_required_property` refusal, not a silent no-op. The engine
  enforces both ADR-027 §3 cross-checks and refuses BEFORE writing: the base must be declared in
  the SAME facet as the variant (`scope_violation`), and the relation must agree with the
  `{Base}_{Variant}` naming — `{Base}_{Variant}_Result` extends `{Base}_Result` —
  (`invalid_property_value`). Add `--facet` (plus `--component` when the facet name is itself
  shared) to address a context copy. Every other property of the DTO — id, description, fields,
  per-field comparison classes and ruled domains, and its POSITION in the facet's DTO list — is
  left exactly as it was; that position is load-bearing (ADR-027 §3: KnownType order,
  dispatcher-arm order, `.methodseq` block order), which is why RemoveDto + AddDto was never a
  safe repair.
- **`SetDtoFieldSemantics` is how a DTO field says what its value MEANS to the spec layer
  (#536, ADR-033 §5).** Four omit-when-absent keys, at least one of which must be supplied — a
  call carrying none is a `missing_required_property` refusal, not a recorded no-op:
  `--computed-from <Dto.Field,...>` names the input fields an asserted response field is computed
  over; `--default <literal>` and `--default-from <Dto.Field>` state what an OMITTED optional field
  means and are mutually exclusive (`invalid_property_value` when both are supplied; setting one
  removes the other); `--domain positive|non-negative|non-empty` (#570) declares the field's RULED
  input domain, which is what makes the degenerate value checkable — the value an
  equivalence-class author never seeds because it is not a case of anything (a party of zero, an
  empty basket, a blank name). Each flag is present-and-empty = CLEAR, present-and-non-empty = set,
  absent = leave the key untouched. Every `Dto.Field` reference is resolved against the live model
  BEFORE the first node write, so a typo'd ref fails with the field byte-identical. Like
  `AddDtoField`, it takes `--facet` (plus `--component` when the facet name is itself shared) to
  address a context copy (#922).
- **The same verb writes the two MODEL-LINT ANNOTATIONS (#1385).** They are how a field answers a
  lint instead of arguing with it, and each is a NAME plus the properties that name requires,
  supplied as a JSON object of scalars:

  ```
  theagent2 sns mutate --kind SetDtoFieldSemantics --dto FindCustomer --field Needle \
    --field-kind free-text --field-kind-props '{"width":200,"opaque":true}'

  theagent2 sns mutate --kind SetDtoFieldSemantics --dto ErpOfferPayload --field PayloadKind \
    --shape-ok wire-format --shape-ok-ref '#1382'
  ```

  `--field-kind` writes `kind:` — WHY this attribute must be text — which `model-string-kind`
  (#1384) requires of every `string`. `--shape-ok` writes `shape_ok:`, the per-attribute
  suppression `model-dto-shape` (#1382) accepts, and `--shape-ok-ref` names the ruling it rests
  on; a suppression naming no ruling is a finding of its own. Three things to know:
  **(1) the LINT owns both vocabularies, not the CLI** — run the lint to learn which kinds and
  which codes exist and what each requires, because the tool writes whatever you state and the
  lint is what reports an unknown or incomplete one; **(2) types survive** — `{"width":200,
  "opaque":true}` is written as a number and a boolean, which is what the lint demands, so state
  them as JSON types rather than as strings; **(3) the annotation is written WHOLE** — setting one
  replaces every property the field carried under it, and `--field-kind ''` clears the name and its
  properties together.
- **A DRAFT can be linted BEFORE it is promoted (#1438).** Both lints take
  `--draft <ref> --sns-project <name>`, project the draft's op-log through `sns-cli project --emit
  canonical-yaml` — the byte-faithful store YAML, `kind:` and `shape_ok:` included — and lint that.
  It answers the one question an annotation wave has: *did my batch actually cure the findings?*
  Ask it BEFORE promoting: behind a promote on a real project sits the contract regeneration (1,141
  files on Figaro), and the alternatives were promoting blind or hand-writing a throwaway simulation
  of the lint's own input. `--sns-project` is the REGISTERED project name and is deliberately not
  `--project`, which is a DIRECTORY to a lint; guessing one from the other reports CLEAN over the
  wrong model. Note `sns-cli read --kind ReadArchitecture` will NOT do — `kind:` and `shape_ok:` are
  store keys and the read DTO does not carry them. With no `sns-cli` on PATH, do it in two steps:
  `sns-cli project --project <name> --draft <ref> --emit canonical-yaml > /tmp/draft.yaml` then
  `model-string-kind.mjs --model /tmp/draft.yaml`.
- **The three enumerated-type verbs are how the model SAYS a field has a closed vocabulary
  (#703).** An enum is declared on the COMPONENT, beside its facets — a named type in this model
  never crosses a component boundary — so `AddEnum --component <C> --name <TypeName> --members
  early,late` (`--description` optional, and worth supplying). `--members` is the WHOLE list in
  declaration order, in the WIRE spelling that travels; `SetEnumMembers --enum <T> --members ...`
  REPLACES it wholesale. Both refuse an empty list, a repeated member, and any member that is not a
  WORD (a letter, then letters / digits / `-` / `_`): the case the verb exists for was a vocabulary
  spelled as the data it stood for — `18:30` and `20:30` — which downstream code kept parsing back
  into a number and faulting on everything that was not one. `RemoveEnum --enum <T>` REFUSES while
  any DTO field is still typed on the enum, and names those fields; retype them first. Pass
  `--component <C>` to `SetEnumMembers` / `RemoveEnum` when the same enum name is declared on more
  than one component. A field JOINS the vocabulary by being typed on it — `AddDtoField --field-type
  <TypeName>` (the bare name, `<TypeName>?` or `List<TypeName>` all count as typed on it).
- **The DESCRIPTION is a fourth verb, and `SetEnumMembers` refuses to write it (#1575).** An enum
  description is rendered verbatim into the generated contract file and into the Design Book, so a
  sentence the model has outgrown is a false statement on a surface a human reads once. Change it
  with `SetDescription --entity-type enum --name <TypeName> --component <C> --description "<text>"`
  — component-scoped like the other enum verbs, and an empty `--description` clears the key.
  `SetEnumMembers --description` used to be ACCEPTED and DROPPED (members changed, text did not,
  `success: true`); it now fails loud with `USAGE_FLAG_NOT_FOR_KIND` and names this verb. Members
  and description are two writes, not one. `--action append` REPLACES rather than composing on a
  draft — that is a gap in the replay of `setDescriptionMode`, it is not specific to enums, and it
  is tracked as #1580; pass the whole text.
- **`AddUseCase --id` is how an EXTERNAL key gets into the model (#428/#417).** Without it the
  engine mints a UUID, which is right for a use case nobody references from outside. It is wrong
  whenever the id is a keystone: `design-artifact-conventions` keys a use case as `SIxx.yy`, and
  `seqmap complete` C3/C9 joins the SI binding map to the model on `useCases[].id` — a minted UUID
  can never satisfy that gate. The flag was silently dropped between 2026-06-01 and 2026-08-09, so
  two Stage-C conducts had to route around this CLI through a raw `mutate-bulk` entry. It works
  again; do not use the raw shape for this.
- `AddUseCase` auto-seeds a "Default" permutation at index 0 — only for ops the CLI authors going forward (the op records `seedDefaultPermutation:true`; historical logs replay as authored, no index shifts). Consequence: `SequenceStep --permutation-index 0` works immediately after `AddUseCase` with no prior `AddPermutation`; an explicit `AddPermutation` now appends at index 1+.
- `SequenceStep --action add` **requires** `--async true` (queued) or `--async false` (sync) for a component-call step — there is no default, so an add without it is refused with `USAGE_FLAG_MISSING_FOR_KIND` (#1166, #1463); no add-then-update dance is needed for an async step. It also accepts `--step-json` (individual flags overlay JSON keys). Foot-gun (SNS-tracked, open): when both are supplied, step-json `from` beats `--caller`, and explicit UUID keys inside step-json are ignored.
- **A step is one BOX of the use case's activity diagram, and not every box is a component call
  (ADR-061 decision 13).** `--step-kind` picks which: `component-call` (the default — the
  `--caller`/`--callee`/`--operation` shape) or `internal`, a box the Manager performs ITSELF. The
  canonical example is a component call that fetches the user followed by a box that *verifies the
  e-mail address*. An internal box carries `--caller` and `--label` and nothing else:

  ```bash
  sns-cli mutate --kind SequenceStep --use-case RegisterUser --permutation-index 0 \
      --action add --step-kind internal --caller UserManager --label VerifyEmailAddress \
      --note "the address must be an address before anything is written"
  ```

  `--label` is a **PascalCase identifier** — it names the private step method the generated Manager
  entry body calls (`Step02_VerifyEmailAddress`) and is the box's identity in the diagram; put the
  prose in `--note`. Supplying `--callee`, `--operation` or `--operation-draft` on an internal box is
  refused (`USAGE_FLAG_NOT_FOR_KIND`), and a misspelled kind is refused
  (`USAGE_STEP_KIND_INVALID`) rather than read as a component call. Both kinds share ONE ordinal
  space, so every box — internal ones included — keeps its `SQxx.yy.zz.NN` id and must appear in the
  `SequencePath --steps` lists like any other step.
- **`SequencePath` declares which ordered subsets of a permutation's drawn steps ONE run may take
  (#564, D-SEQUENCE-PATH-V1).** `--action set` is an UPSERT keyed by `--path-name` and needs
  `--steps 1,3,4` — 1-based step ordinals, ascending, a subsequence of the drawn order;
  `--action remove` needs only the name. `--guard "<free text>"` names the condition under which a
  run takes the path. The name must be unique within the permutation, because it is the id a
  conformance verdict and the generated activity diagram report. Ordinals go stale the moment steps
  are inserted, removed or reordered — that is the price of a declaration a human can read — so six
  `sequence-path-*` rules turn a stale one into an ERROR (unnamed, duplicate name, empty, ordinal
  out of range, ordinals out of order, and: once a permutation declares ANY path, every step it
  draws must lie on at least one of them). Since #603 `promote` REFUSES on those findings
  (`SEQUENCE_PATH_FINDINGS`) unless the caller passes `--accept-findings`, which lands the draft and
  records the override in `promotion-overrides.yaml` beside the model.
- `RemovePermutation`: `--permutation-index` is canonical; `--index` is a deprecated alias.
- `RenamePermutation`: renames a permutation IN PLACE. Use it instead of `RemovePermutation` + re-author: a re-authored permutation appends at the END of its use case and shifts the index of every sibling that followed it, and permutation order is load-bearing (ADR-027 §3). Addressed exactly like `RemovePermutation` (#1006).
- `--use-case-id` / `--volatility-id` are removed. Use-case addressing is by NAME (`--use-case`) — the replay-stable identifier; UUIDs regenerate on every replay (known/tracked SNS-side). Never persist or compare entity UUIDs across reads/replays; key on names.

`mutate-bulk` cap: 100 mutations per batch. **ATOMIC since 2026-06-12** — all-or-nothing; the earlier 2026-06-10 non-atomicity note is superseded (see "Strict replay (2026-06-12)").

#### The `mutate-bulk` batch file

The batch source is `--batch-file <path>` XOR `--batch-stdin` — there is no `--batch` flag, and
supplying both or neither is `USAGE_BATCH_XOR`. The body is JSON: either a top-level array of
mutation objects, or `{ "mutations": [ … ] }`.

A batch entry is **not** a `--kind` invocation. It is the engine-level mutation the `--kind` arm
would have produced, so each entry names an `entityType` + `action` pair directly and carries the
rest of the payload in `properties`. Worked example — a use case, a second permutation on it, and a
component, applied as one atomic batch:

```json
[
  { "entityType": "use_case",    "action": "add",
    "entityName": "SI02.01",
    "targetLayer": "core",
    "description": "Sell a figure",
    "properties": ["name:Sell a figure", "seedDefaultPermutation:true"] },

  { "entityType": "permutation", "action": "add",
    "entityName": "Sell a figure",
    "properties": ["name:Card declined"] },

  { "entityType": "component",   "action": "add",
    "entityName": "SalesManager",
    "targetLayer": "managers",
    "description": "Owns the selling workflow" }
]
```

The keys an entry may carry — **these are the only ones read; every other key is silently
ignored**:

- **entityType** — `use_case` / `component` / `permutation` / `sequence-step` / … (hyphen and
  underscore spellings are both accepted).
- **action** — `add`, `rename`, `set_category`, … : the engine-side action, not the `--kind` name.
- **entityName** — the ADDRESSING handle. The entity's own name for a create; the PARENT's name
  wherever the matching `--kind` arm addresses a parent (`--use-case` on `AddPermutation` and
  `SequenceStep`).
- **targetLayer** — the layer for a component (`managers`, `resource_access`); the CATEGORY for a
  use case (`core` / `regular`).
- **parentName**, **newName**, **description** — as on the matching flags.
- **properties** — an ARRAY OF `"key:value"` STRINGS, never an object. This is where the per-kind
  payload lives (`name:`, `permutation_index:`, `steps:<json>`, `resolveNames:true`, …), exactly as
  the `mutate --kind …` arm packs it.

Consequences worth knowing before you write a 900-entry batch:

- `properties` as a JSON **object** is dropped, and the mutation then fails as
  `malformed_op_log_entry` / *"handler returned a null outcome under dry-run"* — a shape complaint
  that names neither the dropped key nor the missing payload (#1054).
- Acceptance criteria are **not reachable** from a batch: the criterion fields (`useCaseRef`,
  `criterionId`, `criterionGiven`, …) are not among the keys above, so a
  `set_acceptance_criterion` entry arrives empty and is refused as `empty_criterion`. Author those
  with `mutate --kind SetAcceptanceCriterion`.
- A rejected batch appends NOTHING (atomic) and the refusal names the failing index —
  *"validation failed at mutation 1: …"*.

### IDrafts

```
theagent2 sns create-draft        --kind {FromCanonical|FromDraft} [--from-draft-id <parent-draft-id>] [--name <label>]
theagent2 sns lifecycle           --kind {Promote|Discard|Rebase}  [--reason <text>] [--dry-run] [--drop-invalid] [--accept-findings]
theagent2 sns conflict-resolution --kind {DetectConflicts}
theagent2 sns diagnose            [--strict]
theagent2 sns prune
theagent2 sns list-drafts
```

`--from-draft-id` is REQUIRED for `create-draft --kind FromDraft` (`USAGE_FLAG_MISSING_FOR_KIND`); there is no `--from`. `list-drafts` takes no filter flag — it lists them all and you filter client-side.

`Promote` on success returns `{promoted: true, appliedOpCount, noOpRemovals[], invalidOps[]}` — camelCase on the wire, like every other response. A BLOCKED promote returns `{promoted: false, appliedOpCount: 0, failureCode, failureMessage}` plus whichever per-op list explains it: `invalidOps[{opIndex, entityType, action, entityName, reason, errorCode}]` when ops no longer apply to the moved canonical, `conflicts[{opIndex, opSummary, conflictKind, detail?}]` when replay simulation collided (`conflictKind` ∈ `duplicateAdd` / `missingTarget` / `staleProperty` / `crossWorkstreamCollision`). Read the verdict from `data.promoted`, never from the envelope's `success`.

**Recovering a draft that will not promote** — this is the path the CLI's own help text prints, and `conflict-resolution` is **not** part of it:

1. **`theagent2 sns diagnose`** — READ-ONLY strict dry-run; always exit 0 on a successful diagnosis (a dirty verdict is an informational read, not a failure). Returns `{invalidOps[], noOpRemovals[], wouldPromoteCleanly}`, where `invalidOps` is the COMPLETE list — collect-all, not first-failure — each entry carrying `{opIndex, reason, errorCode}`. This is the step that tells you WHY, and it writes nothing, so run it first.
2. **`theagent2 sns lifecycle --kind Rebase [--dry-run]`** — reapply the draft's ops onto the moved canonical. Clean → a NEW draft with provenance (`{rebased: true, outcome: "rebased", newDraftId, oldBaseRef, newBaseRef}`); conflicts → REPORT-ONLY, nothing written anywhere (`{rebased: false, outcome: "conflicts", conflictCount, conflicts[]}`). `outcome` is one of `rebased` / `conflicts` / `alreadyCurrent` / `cleanDryRun` / `failed`. Reach for this FIRST when canonical moved under the draft — no partial rebase, no auto-drop, no op rewriting.
3. **`theagent2 sns prune`** — MUTATING, and there is no confirmation gate: invoking it performs it. Rewrites the op-log to its cleanly-promotable subset after backing the prior one up, returning `{backupPath, kept, dropped, droppedDiagnostics[]}`. It DROPS authored work, so run it only after `diagnose` showed you exactly what goes. It does NOT promote.
4. Re-promote with `lifecycle --kind Promote`.

`--drop-invalid` on `lifecycle --kind Promote` is steps 3 and 4 in one call; the response then also carries `pruneBackupPath` and `prunedDroppedDiagnostics`. A plain promote never compacts.

`conflict-resolution --kind DetectConflicts` is READ-ONLY and ADVISORY: it re-detects against the draft on every call (no conflict-id to pass) and returns `{conflictEntries[], replayHaltedAtOpIndex}` — empty plus `-1` means a clean replay. The two MUTATING kinds it used to carry were **REMOVED (#474)**: both wrote canonical through the legacy clone-swap without appending to `main.oplog.yaml`, leaving `canonical != project(main-op-log)`, and both skipped the gates promote enforces. Neither had a reason to exist once promote became op-log-backed — one was "run promote again", and the other read a decisions payload and then discarded it. Use the four steps above.

## Strict replay (2026-06-12, per D-STRICT-REPLAY-V1)

Dated update — supersedes the 2026-06-10 tolerance-era notes where marked below.

- **Strict replay is the default everywhere.** An op-log is 100% valid or the operation hard-errors: reads, validates, diagnoses, and promotes all fail with `{opIndex, reason, errorCode}` plus a recovery pointer (Rebase + the I4 recovery procedure). There are no partial models — a draft projects completely or not at all.
- **`replayStats` is now an invariant.** `appliedOpCount == opCount` on any successful read; anything else IS the hard error. The `Replay.DroppedOps` validate Warning is retired — the condition it warned about is now an error.
- **NEW: `draft-lifecycle --kind Rebase [--dry-run]`** (wrapper form: `theagent2 sns lifecycle --kind Rebase`). Reapplies a draft's ops onto a moved canonical base. Clean reapply → a NEW draft with provenance; conflicts → report-only, nothing written. This is the ONLY surface where tolerant reapply lives.
- **`mutate-bulk` is now ATOMIC** — all-or-nothing batches; a mid-batch failure appends nothing and needs no op-index recovery bookkeeping. (Supersedes the 2026-06-10 non-atomicity foot-gun.)
- **Ambiguous removes hard-error.** A name-addressed Remove* matching multiple entities is an error; removing every match requires explicit `--all` opt-in (applied to 8 name-addressed kinds).
- ~~**`list-*` take `--workstream <name>`** (canonical); `--workstream-id` is a deprecated alias.~~ **SUPERSEDED 2026-07-14** (D-CHECKOUT-LOCAL-V1): both flags are removed from the entire grammar; `list-*` resolve against the checkout's store like everything else.
- **`diagnose --strict` is redundant but accepted** — diagnose IS the strict replayer running in collect-all-failures mode.
- **`--drop-invalid`** is an explicit, strict-scoped compaction of a known-invalid log — a deliberate operator action, never an implicit read-path behavior.

## Discipline

- **After you change a model element, run `theagent2 where-used <Dto.Field | Facet.Op | Enum.member>` before you open files** — it lists every `path:line` in the project that names it (model, sheets, binding, C#, spec, docs); open only those (#1467; `--files-only` when the name is widely shared).
- **Never `Read` `.method/*.yaml` files directly.** The model is what `theagent2 sns read` returns — structured, section-filterable, scoped to a draft if needed. Direct YAML reads burn the context window for thousands of tokens you don't use and risk seeing partial state. In a mature project `architecture.yaml` reaches MBs.
- **Always invoke via `theagent2 sns ...`.** Never `sns-cli` directly unless doing an explicit cross-project read.
- **Never improvise CLI calls.** If a command isn't documented here, surface a barrier-exception request rather than guess.
- **Mutations only on drafts.** Canonical is read-only; promotion is the only path to canonical, and it's gated.
- **Pass errors verbatim.** Non-zero exit or structured error envelope → surface to the conductor with the exact stderr; do not retry without context.

## Operational foot-guns (2026-06-10)

- ~~`mutate-bulk` batches are NOT atomic~~ **SUPERSEDED 2026-06-12**: `mutate-bulk` is now atomic (all-or-nothing) — see "Strict replay (2026-06-12)". No op-index recovery bookkeeping needed.
- ~~`LayerKeyFromName` silently falls back to `managers` for unrecognized layer strings~~ **SUPERSEDED 2026-08-29 (#1054)**: `AddComponent` now REFUSES a `--component-type` it cannot map (`invalid_component_type`), listing the accepted tokens — `client, manager, engine, resourceaccess, utility, resource` — and naming the one you meant when you passed a layer spelling instead (`--component-type Clients` → *"names the layer, not the component type — pass --component-type client"*). The tokens are singular and lower-case; they are NOT the `Clients` / `ResourceAccess` spellings `ReadArchitecture` returns in `components[].layer`. `--layer` is guarded too since #1126: it takes the layer spellings (`Clients`, `resource_access`, and their PascalCase and singular forms), and a string it cannot resolve at all is REFUSED (`invalid_layer`) rather than filed on `managers`. The two vocabularies stay distinct — `--component-type` takes only the singular tokens, `--layer` takes the layer names — but neither flag can silently pick a layer for you now. The old fallback filed the component on the `managers` layer and the name rule then blamed the NAME ("must end with 'Manager'"), whose hint would have put a Client on the Managers layer.
- `--category` on `AddUseCase` / `SetUseCaseCategory` is `core` or `regular` — nothing else. Since #1054 anything else is refused as `invalid_use_case_category` naming both values (and mapping the common near-misses: `supporting`/`secondary`/`future` → `regular`, `primary` → `core`). Before that it surfaced as `MALFORMED_OP_LOG_ENTRY` blaming `--action`. The `--category` on the operational-concept kinds is a DIFFERENT vocabulary and is not restricted.
- Large reads: redirect to a file, don't pipe — piped output >~64KB truncates mid-JSON in agent shells. `theagent2 sns read ... > /tmp/x.json`, then parse the file.
- Never hand-edit draft op-logs: `operations_integrity_hash` (SHA-256 over the canonical ops serialization) plus engine-coupled op semantics (replay-closure) make manual edits unsafe. A draft needing manual repair = SNS handoff, not an edit.

## Validation errors are actionable

We dropped `get_schema` from the contract on the assumption that `validate` (and other failure responses) carry enough information to fix the call. Every error envelope includes `rule_id`, `field_path`, `expected`, `got`, `suggestion` where applicable. If a validation error doesn't contain enough to act on, surface it to the conductor unmodified; do not paper over with retries.

## Test plan surface retired (2026-07-16)

The model-level test-plan surface (`AddTestSuite --spiral-level` and friends, `ReadTestPlan`, `ValidateTestPlan`, `.method/test-plan.yaml`) is retired — D-TESTPLAN-RETIRE-V1 (SNS `docs/decisions/2026-07-16-retire-test-plan-surface.md`), following ADR-033/034: the testing artifact is the C# spec layer, not model-registered suites. Do not register tests in the model; a `test-plan.yaml` found in an old checkout is inert history the runtime no longer reads.

## Modeling for construction — the scaffolder contract (ADR-027)

`theagent2 scaffold` derives the C# construction surface from the model. It FAILS LOUDLY on any
violation of these conventions — model them right and construction is free; model them wrong and
the scaffold run hands you the exact finding:

- **Component names carry the layer suffix** (`SalesManager`, `ValidationEngine`, `CustomerAccess`)
  — SNS enforces this; the scaffolder strips it to derive the volatility (`Manager/Sales`).
- **Facet name = folder = `I{facet}`.** One facet name drives all three; pick it accordingly
  (`Orders` → `IOrders`, `OrderValidation` → `IOrderValidation`).
- **Operation variations are DTO names: `{Base}_{Variant}`.** A DTO named `PlaceOrder_DineIn`
  whose `PlaceOrder` is an operation's request DTO IS a variation of that operation. `_` in DTO
  names is RESERVED for this. `--extends-ref` on a variant DTO is REQUIRED, not optional (#910):
  the scaffolder cross-checks the relation against the naming and errors both on a disagreement
  and on an ABSENCE — a variation with no relation reads as "no variation here" to every consumer
  that walks the relation instead of parsing the name. Set it at birth on `AddDto`; on a DTO that
  already exists, `SetDtoExtends` sets it (and `--extends-ref ''` clears it) without touching
  anything else the DTO carries — #916 retired the RemoveDto + AddDto repair, which re-authored
  the whole DTO and moved it to the END of its facet's DTO list. A variant DTO carries only
  its EXTRA fields; shared fields live on the base.
- **Per-variant results are `{Base}_{Variant}_Result`**, allowed only when the operation's response
  is named `{Base}_Result`, and all-or-none per operation (all → the dispatcher widens; none →
  shared base result).
- **In a Manager, variation ≡ use case:** every use-case permutation entering a Manager must be
  named exactly like a variant request DTO of the entry operation (`PlaceOrder_DineIn`), and every
  Manager variant needs a permutation. Engine/Access variations need no use-case backing. The
  ENTRY operation is the use case's own `SetUseCaseOperation` declaration (ADR-067), which is why
  every permutation of one use case is a variant of the SAME operation and never a second one.
- **Construction-ready means typed:** every sequence step the scaffolder consumes needs a resolved
  operation (`--operation`), not a Design-phase `--operation-draft` label; permutations need steps.
- **Field types:** C# primitives, `List<T>`, trailing `?` for optional; DTO-typed fields may only
  reference DTOs of the SAME facet (context-scoped DTOs — never another component's types).

The scaffolder emits the conformance manifests from the same model (`.methodseq` → IDESIGN031,
`.methodvar` → IDESIGN030, `.methodcontract` → IDESIGN032), so what you model here is exactly what
the compiler later enforces on the implementor.

## Reading the architecture back (`ReadArchitecture` output shape)

`theagent2 sns read --kind ReadArchitecture` returns each use case under `useCases[]`. Each use case exposes the SAME call chain THREE ways — all derived from the same stored sequence data, so they agree (modulo the resolve-filter noted below):

- **`sequences[]`** — recommended for review (resolved names + layers + verb). Array of permutations; each has `name`, `description`, `steps[]`. Each step: `from`, `fromLayer`, `to`, `toLayer`, `sync`, `async`, `note`, `operationRef` (resolved operation name, or null), `operationDraft` (free-text Design-phase call label, or null), `params`, `returnType`. Read the call verb from `sequences[].steps[].operationDraft`. NOTE: this view omits any step whose caller/callee does not resolve to a component.
- **`permutations[]`** — flat / UUID view, guaranteed-complete. Array of permutations; each has `index`, `name`, `description`, and `sequenceSteps[]` (⚠ the step array is `sequenceSteps`, **NOT** `steps` — `permutations[].steps[]` does not exist and reads as empty). Each step: `index`, `stepId`, `callerComponentId` / `callerComponentName`, `calleeComponentId` / `calleeComponentName`, `operationId` / `operationName`, `note`, `operationDraft`.
- **`callChain[]`** — deduped topology only: `from`, `fromLayer`, `to`, `toLayer`, `sync`, `async`. No call label, by design — do not read the verb here.

Beside those three, each use case carries **`operationId` / `operationRef`** — THE operation the System Interaction is (ADR-067, #1186), declared once on the use case rather than derived by walking the permutations and taking each first step. That is the field to read for "which facet operation does this SI call": the Sequence Map's `operations[si].operation`, the scaffolder and the Construction-stage UI join all read it. Strictly paired (both present or both null) like a step's; null on a use case that has not declared one yet.

The Design-phase free-text call label `operationDraft` rides both `sequences[].steps[]` and `permutations[].sequenceSteps[]`, never `callChain[]`. When a step has a typed operation instead, it carries `operationRef`/`operationName` (mutually exclusive with `operationDraft`).

### The DTO universe in one read (2026-08-23, #888 + #909)

**`dtos[]` at the top level is the WHOLE DECLARED CONTRACT UNIVERSE** — every DTO every component declares, once, with its fields (SA ruling of 2026-08-23). Reachability is not the filter: the ADR-027 operation variations (`{Base}_{Variant}`, reached from their base through `extends`/`variants` — 47 of Comanda's 283) and the DTOs nothing names at all are in it too. Read this list when you need the types and their fields; nothing a component declares is missing from it.

The two per-component lists are the REACHABILITY view over that same universe, and mean exactly what they say. `componentDetails[].operationTypes` is what the component's operations wire. `componentDetails[].supportingTypes` is the **transitive closure of the DTOs reachable through field types** from those operation DTOs — nested row/card DTOs, the element type of a collection field (`List<OrderLineRecord>` reaches `OrderLineRecord`), anything below them, and (since #909) anything named only by the EXTRA fields of a variation, each with its fields. A variation itself is never a supporting type — it is a request shape, and the top-level `dtos[]` is where you find it. A field type resolves in the facet that declares the DTO holding it, so the three `RateCard` context copies stay three distinct DTOs with their own ids and fields.

History, because both defects were silent absences rather than wrong values. Until #888 the field walk went one level deep and unwrapped only `T[]`, so a DTO named only as `List<T>` on another DTO's field was absent from the read, and tools needing the whole contract universe read the generated `.methodcontract` manifest instead. Until #909 the top-level `dtos[]` was the union of the two per-component lists, so the variations and the unreferenced DTOs were absent from it as well. `componentDetails[].facets[].dtos[]` — the per-facet declaration list the scaffolder reads — always carried every declared DTO and is unchanged; the top-level list now agrees with it.

### Reading verdicts and telemetry (2026-06-10)

- Promote verdict = `data.promoted` + process exit code. Top-level `success: true` on a FAILED promote is deliberate (transport-level acknowledgment). Same pattern for other lifecycle ops: read the data payload, not the envelope.
- Draft reads carry `replayStats`. **Updated 2026-06-12 (strict era):** `replayStats` is an invariant — `appliedOpCount == opCount` on any successful read; an invalid op-log no longer produces a partial projection with dropped-op telemetry, it hard-errors the read. The `Replay.DroppedOps` Warning is retired. See "Strict replay (2026-06-12)".
- `validate --kind ValidateDraftPromotionGate` dry-runs the promotion gate without writing. Warning-severity gate findings do not hard-block `Promote` (verified: `gate_passed:false` on warnings promoted cleanly).
- **Updated 2026-08-16 (#603, amends D-WS-20): ERROR-severity findings from the D-SEQUENCE-PATH-V1 rule set DO hard-block `Promote`.** The six ids are `sequence-path-unnamed`, `sequence-path-duplicate-name`, `sequence-path-empty`, `sequence-path-step-out-of-range`, `sequence-path-steps-out-of-order`, `sequence-path-step-uncovered` — plus `sequence-step-coupling-undeclared` (#1166) and `Gate.UseCaseOperationUndeclared` (ADR-067, #1186: a use case that draws sequence steps but declares no operation). A blocked promote returns `{promoted:false, failureCode:"SEQUENCE_PATH_FINDINGS", blockingFindings:[...]}`, exit 5, and leaves the draft intact — fix the model and re-promote. `--accept-findings` lands anyway and RECORDS the accepted findings in `promotion-overrides.yaml` in the `.method` store; the response carries `findingsOverridden:true` and `overrideRecordPath`. Every other rule keeps its advisory posture — the refusal is that closed set only.

- **Added 2026-08-31 (#1155): a component can say it is not built yet, and the gate accepts it.**
  `mutate --kind SetComponentLifecycle --component <Name> --lifecycle {live|future}` (also
  available as `AddComponent --lifecycle future`). `future` means the design DECIDED the
  component and this build deliberately defers it — IDesign's "design big, build small". The
  four rules that infer a defect from emptiness go silent on it (`Gate.ContractsMissingOwners`,
  `DecompositionFitness.OrphanManager`, `DecompositionFitness.ComponentMissingEncapsulator`,
  `unreferenced-component`), and the gate response lists it in a new NON-blocking bucket,
  `deferred_components`, alongside an info finding `Gate.ComponentDeferred`. `live` is the
  default and is stored as the ABSENCE of the key, so flipping a component back leaves no trace
  and no model written before #1155 changes shape. It is a closed vocabulary — any other value
  is refused. The key on disk is `lifecycle`, NOT `status`: `status` on a component is the
  merge-and-flag warning-state, and the two must be able to coexist. The marker's ONE hard
  constraint: a `future` component that a use-case sequence still routes a step to raises
  `Gate.DeferredComponentIsRouted` at severity **error** and fails the gate — the build cannot
  both skip a component and call it. The scaffolder and `workspace derive` skip a `future`
  component too (no skeleton, no packet), so nobody is asked to implement it.

- **Added 2026-09-07 (#1320): a use case can say it is not built — and, for the first time, that it was decided AGAINST.**
  `mutate --kind SetUseCaseLifecycle --use-case-ref <SIxx.yy|name> --lifecycle {live|future|retired}`
  (also available as `AddUseCase --lifecycle …`). `future` is the use-case peer of the component
  marker — decided by the design, deliberately not built yet. `retired` is the state that did not
  exist: **decided against, kept as a record, its id never re-minted** — a tombstone. It is
  deliberately NOT `future`, which asserts the opposite intent, and it is NOT the `--category`
  vocabulary, which is `core|regular` and explicitly folds `future`/`deferred`/`backlog` into
  `regular`. `live` is the default and is stored as the ABSENCE of the key, so reviving a use case
  leaves no trace and no model written before #1320 changes shape; any other value is refused with
  the vocabulary and the nearest match (`abandoned`/`dissolved` → `retired`, `parked`/`deferred` →
  `future`). What it changes: the gate lists it in a new NON-blocking bucket, `deferred_use_cases`,
  alongside an info finding `Gate.UseCaseDeferred`; `Gate.AcceptanceCriteriaUnconfirmed` goes
  silent on it (nothing confirms a System Interaction nobody built) and
  `Gate.UseCaseOperationUndeclared` goes silent on a `retired` one only (a `future` use case's
  operation is a decision the design already made); and `seqmap complete` raises no `[C9]` for it
  at either granularity, printing the exemption on every run instead. The one hard constraint has
  two halves, each at the surface that owns the fact: `Gate.NotBuiltUseCaseIsConfirmed` (error) —
  a not-built use case may not carry a CONFIRMED acceptance criterion; and seqmap's
  `[C9-notbuilt]` (error) — a LIVE call site may not resolve to it. Its own sequences stay drawn:
  a tombstone's record IS its sequences.

- **Added 2026-09-09 (ADR-074): a Utility says whether it is a SERVICE or a LIBRARY.**
  `mutate --kind SetUtilityKind --component <Name> --utility-kind {service|library}` (also
  available as `AddComponent --utility-kind library`). The Software Architect ruled that the
  IDesign Utility category was carrying two animals: a **service** utility is a real seam — facets,
  operations, DTO-typed contracts, and a drawn Manager box may call it (a message bus, a capability
  check); a **library** utility is C# types called in-process, `IDisposable` handles included, with
  **no contract boundary** (tracing, metrics, logging). The criterion is the boundary, never the
  subject matter: *does anything cross a process, serialize, or version independently of the
  caller?* A library declares **no facets, no operations and no DTOs** — its C# surface is named in
  its description and modelled no further, because a facet here is a generated interface plus a
  `.methodcontract` line, which is a contract, not a name. **Utilities layer only**: the key is
  refused outright on any other layer, which already answers the question by construction. Unlike
  the two lifecycle markers, the default value is WRITTEN, not dropped — `live` is a state a
  component returns to, `service` is an ANSWER, and an answer stored as an absence cannot be told
  apart from a question nobody put. **Absent reads as `service`**, which is what every rule did
  before the field existed, so no model written before ADR-074 changes meaning. Four rules:
  `UtilityKind.Unstated` (info — the question, for a Utility that has not been asked),
  `UtilityKind.LibraryDeclared` (info — the answer said out loud),
  `UtilityKind.LibraryDeclaresContract` (warning — a library that grew facets), and the one hard
  constraint, `UtilityKind.LibraryIsRouted` (**error**, fails the gate): **nothing may draw a
  sequence step to a library**, because a drawn step IS a boundary crossing and a library has none.

- **Added 2026-09-27 (#1747): a component declares the Utilities it uses WITHOUT a drawn leg.**
  `mutate --kind SetComponentConsumes --component <Name> --consumes <Utility,…>` (set semantics:
  the list replaces the previous one; `--consumes ""` clears it). The scaffolder derives a Service
  project's references from DRAWN steps, so a Utility no flow draws could never be referenced: a
  storage Utility a ResourceAccess reads inside its own operation, and every LIBRARY Utility (no
  step may be drawn to one). `consumes` **draws nothing and is not a call edge** — no sequence step,
  no `.methodseq` line, no subsystem membership; it becomes a ProjectReference and nothing else: a
  **service** Utility's `Interface` project (plus `SoEx.Proxy`, it is called through
  `Proxy.ForComponent<…>`), a **library** Utility's `Service` project (its C# types live there).
  **Only a Utility may be named, and only a Manager, an Engine or a ResourceAccess may declare it** —
  both refused at write time, so no call rule moves: every one of those layers may already use a
  Utility. Stored by component id, so a rename never desyncs it; a purge strips it. The gate
  re-checks what can still drift (`UtilityConsumption.Unresolved` / `.NotAUtility` /
  `.ConsumerLayer` / `.DeferredUtility`, all errors) — the last one fires when a consumed Utility is
  declared `lifecycle: future` afterwards. Use it for a use no flow draws; a call that belongs to a
  business flow is still a drawn step.

## Resource Protocol Sheets (ADR-059, #841)

One sheet per ResourceAccess at `docs/03_Technology/03_Deployment/protocol/<RA>.protocol.yaml`
(format `resource-protocol/1`, spec: `process-specs/resource-protocol-format.md`): the RA's
resource-facing contract — resource shape, per-field fates with durable round-trips, effect
allowlist per use case. Human-reviewed once at Contract; the spec runner enforces the same file.
The sheet is HYBRID: `just resource-protocol-skeleton <project> [<RA>]` generates the row keys
from the const model (via the RA's `.methodcontract` manifest), the seam interface and the
deployment view, preserving all authored values on regeneration; the Stage-C architect fills
shape, fates and allowlists in the resource-designer pass (ADR-048 §3) — AFTER contracts are
generated. `just resource-protocol-check <project>` is the staleness/completeness gate
(`derived-check` member; the Gate-3 exit runs it with `--require-all`). Companion bin:
`bin/resource-protocol.mjs`.
