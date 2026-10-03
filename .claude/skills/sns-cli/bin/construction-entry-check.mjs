#!/usr/bin/env node
/**
 * construction-entry-check (#733) — Specification refuses to start over a store seam nobody built.
 *
 *   node construction-entry-check.mjs --model <architecture.yaml> --deployment <deployment-dir> --csharp <project>/csharp
 *                                      [--seqmap <enriched seqmap.json>] [--company <root namespace>]
 *                                      [--spec-results <dir>] [--require-first-light [<Access|seam>,…]]
 *
 * The failure this exists to make impossible (#645): the deployment view named `ReservationStore`,
 * Blueprint ruled on it, GOLDEN-PROCESS Step 5 lists "the Step-4b deployment view + STORE SEAMS + fault
 * taxonomy" among its entry artifacts — and the seam project, its section in the seam design doc and
 * its spec simulator were never produced. Step 5 completed and Contract passed over the hole: four
 * trust-chain gates read "no evidence file", which is what a gate over NOTHING looks like, and no
 * implementation could ever have satisfied them. `deployment-view-check` was green through all of
 * it, correctly: its job is yaml<->markdown agreement, and it reported `OK - 3 resource(s)` while
 * the promoted model carried FOUR ResourceAccess components. Nothing joined the two.
 *
 * So this check joins them, and asks what CONSTRUCTION cannot start without. Two families. First,
 * the four things a resource access must have before the spec layer is authored against it:
 *
 *   [S1] the promoted MODEL's ResourceAccess components and the SLOT OWNERS of the deployment view
 *        name the same set — the direction `deployment-view-check` structurally cannot see. Under
 *        `deployment-view/2` (ADR-065) an Access declares a LIST of slots, so this is a set of
 *        owners rather than a row-per-Access identity; [S2]-[S4] then run once per SLOT, because
 *        each slot has its own seam and its own simulator. (Splitting the driver directory and the
 *        implementor packet per slot is Phase 2 of that program, #1099/#1100.)
 *   [S2] a store-seam project, `Component/Access/<X>/Resource/`, declaring the seam interface the
 *        deployment view named (ADR-048 §3, #505);
 *   [S3] a section for that seam in the store-seam design doc (02_Store-Seam-Interfaces.md) — the
 *        surface the test-engineer writes the simulator against;
 *   [S4] a simulator for the store, REGISTERED with both the spec resources (so a case can seed it
 *        and arm faults) and the container (so the real Access is injected with it from Step 6 on).
 *
 * And second, the three things the CONTRACT side cannot start without — the scaffolder's own
 * derivation rules, asked here because no gate ran the scaffolder (#1208, #1209). Friction #438
 * measured exactly three classes of model defect that fail `theagent2 scaffold` while passing SNS
 * promotion, `seqmap complete`, `just test` and the Contract gate; these are those three:
 *
 *   [S5] every Manager use-case permutation is named exactly like a `{Base}_{Variant}` request DTO
 *        of the operation the use case enters — the name the scaffolder binds the permutation by
 *        (ADR-027 §3). It refuses the model when there is none, and until this check nothing
 *        gate-bound asked: SNS warns and applies, `seqmap complete` warns at Blueprint, and the
 *        scaffolder's refusal waits for a `theagent2 scaffold` run no gate requires. That is not a
 *        theory — friction #438 records 29 permutations named `Default` past every gate.
 *   [S6] every operation declares BOTH a request and a response DTO, each declared in the
 *        operation's own facet — #438's 28 one-sided ResourceAccess operations (`Store*`
 *        input-only, `Fetch*` output-only).
 *   [S7] within one facet no two operations share a request DTO — #438's single instance
 *        (`BlackMarkRecord` on `AddBlackMark`/`RetractBlackMark`), which orphaned
 *        `RetractBlackMark_Result`.
 *
 * And third, the one thing a WAVE of seam-bearing components cannot start without — FIRST LIGHT:
 *
 *   [S9] one of the run's seam-bearing components has actually run one seeded case through its
 *        simulator at isolated wiring, and the run said so in a file this checker reads.
 *
 * WHY [S9] EXISTS, and what it is evidence OF. The Software Architect ordered it on relay R-260,
 * 2026-09-13 — *"please address all recommended measures."* — as measure **P3** of the five-whys
 * analysis of the conducting project's first Access build round: four Access components dispatched
 * as one tier, all four stopped on design gaps, and two of the five gap kinds ("the answer has no
 * source"; "no store call can do the job") are invisible to every document review and appear the
 * moment real code meets a real simulator. The measure in its own words: *"One Access, one seeded
 * case, through its simulator at isolated wiring, before the tier is dispatched; add it to the
 * construction-entry check."* One component pays for the whole tier's lesson.
 *
 * THE EVIDENCE IS THE SPEC RUNNER'S OWN RESULTS FILE, never a record somebody types. With
 * `THEAGENT_SPEC_RESULTS` naming a directory (`just spec-verdict` exports it), every spec run writes
 * `<assembly>.<wiring>.results.json` — `{assembly, wiring, total, failed, cases:[{name, wiring, ok,
 * class, detail}]}` — invalidating the file before it produces it, so a run that dies half-way
 * leaves no previous run's green behind (#833, `TheAgent.Spec/SpecResults.cs`). Inside it, this check
 * reads ONE unit family: the ADR-059 DERIVED DURABLE ROUND-TRIP, named `protocol: <Seam> <Dto>.<Field>
 * survives <Write>→<Read>`, whose own docs say what it does — *"both RA CONTRACT operations, at
 * isolated wiring, against the simulator"* (`TheAgent.Spec/ProtocolRoundTrip.cs`). A green one IS the
 * measure's sentence, mechanically: a seeded write through the Access's contract, read back through
 * it, against the registered simulator, at isolated wiring. Nothing about it can be promised — the
 * unit list is derived from the sheet's durable rows, the names are the framework's, and a red one
 * says so by name.
 *
 * ADOPTION (the same posture as the answer-source walk, measure P1): a run whose wave is already
 * under way must not flip red on the day this lands. An unlit run is reported in its own NOT LIT
 * state and stays GREEN; `--require-first-light` makes it a failure — for the whole run when no name
 * follows (at least ONE seam lit, which is the measure), or for the NAMED Access(es)/seam(s), which
 * is how a conductor requires first light on the component it is about to dispatch.
 *
 * Sibling of `deployment-view-check` (facts agree) and `composition-map-check` (the wiring grows
 * with the model). Run all three as the Step-5 entry condition: `just construction-entry-check`.
 *
 * Exit: 0 complete · 1 an omission · 2 usage.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { yamlReader } from './yaml-subset.mjs';
import { readDeploymentView, layoutOf } from './deployment-view.mjs';
import { companyFlag, resolveRoot, specCompositionDir } from './project-root.mjs';

/** Reads one YAML document, or dies with `construction-entry-check: file:line: why` (#813/#803). */
const readYaml = yamlReader('construction-entry-check');

// ---------------------------------------------------------------------------- arguments

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const modelPath = flag('--model');
const deploymentDir = flag('--deployment');
const csharpDir = flag('--csharp');
const seqmapPath = flag('--seqmap');
if (!modelPath || !deploymentDir || !csharpDir) {
  console.error('construction-entry-check: --model <architecture.yaml> --deployment <dir> --csharp <dir> are all required ' +
    '(--seqmap <enriched seqmap.json> names the parked use cases, #1256; --company <ns> overrides the C# root ' +
    'namespace, when it is neither the project name nor the architecture name; --spec-results <dir> and ' +
    '--require-first-light [<Access|seam>,…] govern [S9] first light, relay R-260 measure P3)');
  process.exit(2);
}
// `--require-first-light [<Access|seam>[,…]]` — [S9] is REQUIRED, rather than reported. No value
// requires what the measure requires: at least ONE seam of the run lit. Names require each named
// ResourceAccess (any one of its seams) or each named seam — the form a conductor uses on the
// component it is about to dispatch. A name that is neither is a usage error, never a requirement
// that silently requires nothing (the `--require-source-walk` rule, #1620).
const REQUIRE_FIRST_LIGHT = '--require-first-light';
const requireFirstLight = (() => {
  const i = args.indexOf(REQUIRE_FIRST_LIGHT);
  if (i < 0) return undefined;
  const next = args[i + 1];
  if (next === undefined || next.startsWith('--')) return { all: true, names: [] };
  const names = next.split(',').map((x) => x.trim()).filter(Boolean);
  if (!names.length) {
    console.error(`construction-entry-check: ${REQUIRE_FIRST_LIGHT} '${next}' names nothing — give ` +
      'ResourceAccess or seam names, or no value to require that at least one seam of the run is lit');
    process.exit(2);
  }
  return { all: false, names };
})();
// #1256 — the use cases only a PARKED business process asks for, read from the ONE place that
// records them: the enriched sequence map's `parkedInteractions` (`seqmap generate --binding
// --model`, derived from the .bpd headers by `seqmap complete`, #1252). Construction leaves them
// out (`theagent2 scaffold --seqmap`), so [S5] does not ask them for a variant DTO either. A
// Mockup map cannot answer and is refused; no flag means "nothing is parked", stated on the OK line.
const parkedUseCases = new Map();     // use-case id -> { name, parkedBy }
if (seqmapPath) {
  if (!existsSync(seqmapPath)) { console.error(`construction-entry-check: --seqmap ${seqmapPath}: no such file`); process.exit(2); }
  let seqmap;
  try { seqmap = JSON.parse(readFileSync(seqmapPath, 'utf-8')); }
  catch (e) { console.error(`construction-entry-check: --seqmap ${seqmapPath}: not JSON (${e.message})`); process.exit(2); }
  if (typeof seqmap.bindingSource !== 'string') {
    console.error(`construction-entry-check: --seqmap ${seqmapPath}: this is the Mockup map (no bindingSource) — parked use ` +
      'cases are recorded only on the ENRICHED map (`seqmap generate --binding --model`). Pass that map.');
    process.exit(2);
  }
  for (const e of seqmap.parkedInteractions ?? []) parkedUseCases.set(e.si, { name: e.name, parkedBy: e.parkedBy ?? [] });
}
const yamlPath = join(deploymentDir, 'deployment-view.yaml');
const seamDocPath = join(deploymentDir, '02_Store-Seam-Interfaces.md');
for (const p of [modelPath, yamlPath, seamDocPath, csharpDir]) {
  if (!existsSync(p)) { console.error(`construction-entry-check: missing ${p}`); process.exit(2); }
}

const rel = (p) => relative(process.cwd(), p);
const problems = [];
const note = (p) => problems.push(p);
// Advisories are printed on every run and fail nothing — the [S9] adoption state and the two facts
// that are worth saying out loud without being a refusal (relay R-260 measure P3).
const advisories = [];
const advise = (p) => advisories.push(p);

// ---------------------------------------------------------------------------- the three sources

const model = readYaml(modelPath);
if (!model?.name) { console.error(`construction-entry-check: ${modelPath} names no project`); process.exit(2); }
// The C# ROOT NAMESPACE, from the same place the scaffolder takes it: the PROJECT name (#1343,
// figaro#372). `architecture.yaml`'s own `name:` is a different field and routinely a different
// string — figaro's project is `Figaro` and its document opens `name: figaro`, which made every
// path below one letter away from a path that exists, and reported four landed seams and their
// simulators missing. `--company` overrides, as it does for the scaffolder and for `spec-seqcheck`.
const { root: company, source: companySource } = resolveRoot({
  company: companyFlag(args),
  searchDirs: [dirname(resolve(modelPath)), resolve(csharpDir, '..')],
  fallback: model.name,
  fallbackSource: "architecture.yaml 'name'",
});
const modeled = (model.components?.resource_access ?? []).map((c) => c.name);
// A Utility that stands on a resource owns slots too (ADR-071 §4). The model may carry Utilities
// that stand on nothing (a security utility, a message bus), so only the direction "every slot
// owner is modeled" holds for them — not "every modeled Utility owns a slot".
const modeledUtilities = (model.components?.utilities ?? []).map((c) => c.name);

const view = readDeploymentView(deploymentDir, 'construction-entry-check');
for (const p of view.problems) note(p);
const declared = view.slots;
const owners = [...new Set(declared.map((s) => s.owner))];
const accessOwners = [...new Set(declared.filter((s) => s.ownerTier === 'Access').map((s) => s.owner))];
const utilityOwners = [...new Set(declared.filter((s) => s.ownerTier === 'Utility').map((s) => s.owner))];

const seamDoc = readFileSync(seamDocPath, 'utf-8');
// A seam has a section when a heading names it in backticks: "## 4. `IReservationStore` — ...".
const documentedSeams = new Set(
  [...seamDoc.matchAll(/^#{2,}[^\n`]*`(\w+)`/gm)].map((m) => m[1]));

const root = resolve(csharpDir);
// `<Root>.Spec.Composition` is the generated name, and `<Root>.SpecLayer.Composition` is what a tree
// carries when the first would shadow the spec framework's own `TheAgent.Spec` (figaro#372 part 2).
// Whichever the tree has is the one asked about; the checker resolves, it does not rename.
const composition = specCompositionDir(root, company);
const compositionDir = composition.dir;
const simulatorDir = join(compositionDir, 'Simulators');
/**
 * The GENERATED spec composition (ADR-065 decision 5, #1096) — every slot's simulator created,
 * registered with the spec under its slot name, and bound into its Access's slot carrier. `slot-wiring`
 * emits it and `slot-wiring-check` holds it to the slot table; [S4] below asks only whether each
 * slot of THIS run reached it.
 */
const generatedSpecSlots = join(compositionDir, `${company}SpecSlots.cs`);
let reportedMissingComposition = false;
if (!existsSync(compositionDir))
  note(`${rel(compositionDir)} does not exist — nothing registers a store simulator, so no spec case can seed resource state`);

// ------------------------------------------------------- [S1] model <-> deployment view

for (const name of modeled) {
  if (!accessOwners.includes(name))
    note(`[S1] ${name}: a ResourceAccess in the promoted model, owning no slot in ${rel(yamlPath)} — its store is bound to no product and everything below is unasked-for (#645)`);
}
for (const name of accessOwners) {
  if (!modeled.includes(name))
    note(`[S1] ${name}: owns slots in ${rel(yamlPath)}, and is not a ResourceAccess of the promoted model — the deployment view binds a store nothing accesses`);
}
for (const name of utilityOwners) {
  if (!modeledUtilities.includes(name))
    note(`[S1] ${name}: owns slots in ${rel(yamlPath)} as a Utility, and is not a Utility of the promoted model — the deployment view binds a resource nothing uses (ADR-071 §4)`);
}

// ------------------------------------------------------------------ [S2]-[S4] per declared SLOT
// One slot is one resource in one role, so each owes its own seam, its own seam-doc section and its
// own simulator. An Access with two slots is two rows here, deliberately: the whole point of
// ADR-065 is that the second resource stops being invisible.

for (const r of declared) {
  const ra = r.owner;
  const { tier, stem } = layoutOf(ra, r.ownerTier);
  const seam = r.seam;
  const resource = r.resource;
  if (!seam || !resource) {
    note(`[S2] ${ra} slot '${r.slot}': ${rel(yamlPath)} declares no ${seam ? 'resource' : 'seam'} — the entry condition cannot be checked, which is itself a failure`);
    continue;
  }

  // [S2] the store-seam project and the seam interface inside it.
  const resourceDir = join(root, 'Component', tier, stem, 'Resource');
  const csproj = join(resourceDir, `${company}.${tier}.${stem}.Resource.csproj`);
  if (!existsSync(csproj)) {
    note(`[S2] ${ra}: no store-seam project — ${rel(csproj)} does not exist, so ${seam} is a name in the deployment view and nothing else (#505)`);
  } else {
    const seamFile = join(resourceDir, `${seam}.cs`);
    if (!existsSync(seamFile))
      note(`[S2] ${ra}: ${rel(resourceDir)} exists but declares no ${seam} — ${rel(seamFile)} is missing`);
    else if (!new RegExp(`interface\\s+${seam}\\b`).test(readFileSync(seamFile, 'utf-8')))
      note(`[S2] ${ra}: ${rel(seamFile)} declares no \`interface ${seam}\``);
  }

  // [S3] the seam's section in the store-seam design doc.
  if (!documentedSeams.has(seam))
    note(`[S3] ${ra}: no section for \`${seam}\` in ${rel(seamDocPath)} — the test-engineer has no seam surface to write ${resource}Simulator against`);

  // [S4] the simulator, and its registration on BOTH sides — asserted against the GENERATED spec
  // composition (ADR-065 decision 5, #1096/#1100). It used to be asserted against whatever the
  // composition project happened to hand-write, which is the surface that made #645 possible:
  // three registrations look exactly like four. The generated file cannot be short by one, so what
  // is worth checking moved — from "did a human write the pair" to "is the generated file present
  // and does it carry THIS slot". A stale generated file is `just slot-wiring-check`'s question,
  // not this one's; here the question is whether the slot arrived in the composition at all.
  const simulatorName = `${resource}Simulator`;
  const simulatorFile = join(simulatorDir, `${simulatorName}.cs`);
  if (!existsSync(simulatorFile))
    note(`[S4] ${ra}: no spec simulator — ${rel(simulatorFile)} does not exist, so a case cannot seed ${resource} state or arm a fault on it`);
  if (!existsSync(generatedSpecSlots)) {
    if (!reportedMissingComposition) {
      note(`[S4] ${rel(generatedSpecSlots)} does not exist — the spec composition is GENERATED from the slot table (ADR-065 decision 5); \`just slot-wiring\` writes it`);
      reportedMissingComposition = true;
    }
  } else {
    const generated = readFileSync(generatedSpecSlots, 'utf-8');
    if (!generated.includes(`new ${simulatorName}(`))
      note(`[S4] ${ra}: ${simulatorName} is never constructed in ${rel(generatedSpecSlots)} — an unregistered simulator is a green over an absence (#645)`);
    if (!new RegExp(`Register<${seam}>\\s*\\([^)]*"${r.slot}"\\)`).test(generated))
      note(`[S4] ${ra}: slot '${r.slot}' is not registered with the spec resources in ${rel(generatedSpecSlots)} — a case's GivenResourceState for ${resource} would reach nothing`);
    // The container side is the Access's slot CARRIER, not the bare seam: an Access is handed all
    // its slots at once, so one carrier is what the container binds however many slots there are.
    if (!new RegExp(`As<${ra}Slots>\\s*\\(`).test(generated))
      note(`[S4] ${ra}: its slot carrier ${ra}Slots is not registered with the container in ${rel(generatedSpecSlots)} — the real ${ra} has no store to inject from Step 6 on`);
  }
}

// ------------------------------- [S5] every Manager permutation binds to a variant request DTO
//
// The OTHER thing Construction cannot start without, and the reason it is here (#1208). The
// scaffolder binds a use-case permutation to the Manager operation it enters by NAME: the
// permutation must be named exactly like a `{Base}_{Variant}` request DTO of that operation,
// where `{Base}` is the operation's own request DTO (ADR-027 §3, ADR-022 §7 — in a Manager a
// variation maps 1:1 to a use case). `derive.ts` `deriveUseCaseBindings` refuses the model when
// it is not, and the refusal is not survivable: the binding is skipped, the Manager's
// `hasGeneratedFacade` goes false, and the emitters drop its dispatcher and its variation file
// while still writing the `{Permutation}UseCase` entry body that nothing then routes to.
//
// WHY HERE, AND WHY AS AN ERROR. Until #1208 nothing gate-bound refused it. SNS warns and applies
// (`PermutationWithoutVariantDto`, a smell — the #594 design-ahead ruling), `seqmap complete`
// reports it as a `[C7-shape]` WARNING at Blueprint (ADR-041 §3a: the shape is a Construction
// contract, and Blueprint freezes the system design), and the scaffolder's own refusal only
// happens when somebody runs `theagent2 scaffold` — which no gate requires and `just test`
// cannot host, because it needs a live sns-cli read. So the rule was real at every layer and
// blocking at none of the gates. This check is where that ends: it is the Construction entry
// condition, required at Contract, it reads the promoted model, and it needs no toolchain
// outside this repository. Nothing is warned about twice on one run — Blueprint's warning and
// this error are two gates apart, which is the whole point of the split.
//
// It asks the REAL question, not the silhouette `seqmap complete` can afford. seqmap sees the
// binding map and can only test the name for an underscore; here the model is in hand, so the
// check is the scaffolder's own: does a DTO with exactly this name exist in the entry
// operation's facet, derived as a variant of that operation's request DTO?
//
// Scoped to MANAGER entry operations, mirroring `deriveUseCaseBindings`, which iterates use
// cases per Manager. A use case entering an Engine or an Access is a different defect and not
// this check's to name.

const CS_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const opById = new Map();         // operation id -> { component, facet, op, isManager }
for (const [family, list] of Object.entries(model.components ?? {}))
  for (const c of list ?? [])
    for (const f of c.facets ?? [])
      for (const o of f.operations ?? [])
        opById.set(o.id, { component: c.name, facet: f, op: o, isManager: family === 'managers' });

/** The variant request DTOs of `op` within its own facet — `derive.ts` pass 2, verbatim. */
const variantRequestsOf = (facet, baseName) =>
  (facet.dtos ?? [])
    .map((d) => d.name)
    .filter((n) => n.startsWith(`${baseName}_`) && !n.endsWith('_Result')
      && CS_IDENTIFIER.test(n.slice(baseName.length + 1)));

let permutationsChecked = 0;
const parkedSkipped = [];
for (const uc of model.use_cases?.core ?? []) {
  const perms = uc.sequences ?? [];
  if (!perms.length) continue;                     // no permutation, nothing to bind
  const parked = parkedUseCases.get(uc.id);
  if (parked) {                                    // #1256 — not built, so not asked (see above)
    parkedSkipped.push(`${uc.id} '${uc.name}' (${parked.parkedBy.join(', ') || 'parked'})`);
    continue;
  }
  const entry = uc.operationId ? opById.get(uc.operationId) : null;
  if (!entry) {
    // A promoted model cannot carry one (SNS's own `Gate.UseCaseOperationUndeclared` refuses to
    // promote it), so reaching here means the check cannot be run — which is itself a failure,
    // the same reading [S2] takes of a deployment view that declares no seam.
    note(`[S5] ${uc.id} '${uc.name}': declares no resolvable entry operation, so the permutation names ` +
      `cannot be checked against one — the scaffolder binds a permutation BY NAME to a variant request DTO ` +
      `of the operation the use case enters (ADR-067 §1 declares it)`);
    continue;
  }
  if (!entry.isManager) continue;                  // not a Manager use case — see the note above
  const base = (entry.facet.dtos ?? []).find((d) => d.id === entry.op.inputDto);
  if (!base) {
    note(`[S5] ${uc.id} '${uc.name}': its entry operation ${entry.component}.${entry.facet.name}.${entry.op.name} ` +
      `declares no request DTO in its own facet, so no permutation of it can be named '{Base}_{Variant}'`);
    continue;
  }
  const variants = variantRequestsOf(entry.facet, base.name);
  for (const p of perms) {
    permutationsChecked++;
    if (variants.includes(p.name)) continue;
    note(`[S5] ${uc.id} '${uc.name}' permutation '${p.name}': names no variant request DTO of ` +
      `${entry.component}.${entry.facet.name}.${entry.op.name} (declared variants: ` +
      `${variants.length ? variants.join(', ') : 'none'}). The scaffolder binds the permutation to its ` +
      `request shape BY NAME, so it refuses this model and the Manager silently loses its dispatcher ` +
      `(ADR-027 §3). Declare '${base.name}_{Variant}' in facet '${entry.facet.name}' — its fields carry ` +
      `what makes this variation different — or rename the permutation to a variant that exists`);
  }
}

// -------------------------------- [S6]/[S7] every operation carries a derivable request/response
//
// The other two thirds of what friction #438 measured (#1209). `derive.ts` `deriveFacet` runs over
// EVERY facet of EVERY component — not just Managers — and refuses three shapes before it can
// classify a single DTO role:
//
//   [S6] an operation whose `inputDto` or `outputDto` is absent, or names a DTO that is not
//        declared in the operation's OWN facet. The scaffolder needs both to emit the contract
//        method (`Task<Response<TResult>> Op(TRequest)`), and a facet-foreign DTO is not in scope
//        for the interface it is emitting. #438's instance is 28 one-sided ResourceAccess
//        operations — `Store*` written input-only, `Fetch*` output-only.
//   [S7] two operations of one facet sharing a request DTO. Variant attribution is by NAME
//        (`{Base}_{Variant}`, the same rule [S5] rests on), so a base shared by two operations
//        makes every variant of it ambiguous — and the loser's `_Result` becomes an orphan the
//        leftover pass then refuses as a reserved name. #438's instance is `BlackMarkRecord` on
//        `AddBlackMark`/`RetractBlackMark`, orphaning `RetractBlackMark_Result`.
//
// Both are ERRORS for [S5]'s reason: nothing gate-bound refused them either. They are the same
// structural question asked of data the promoted model already carries, so this check can ask it
// with no toolchain outside this repository — where `theagent2 scaffold --verify`, which asks the
// whole ADR-027 contract at once, needs a live sns-cli read and can never be a `just test` member.
// That remains the better answer to the CLASS, and #1209 leaves it open as a candidate ADR
// revision; these two close the holes #438 actually measured.

let operationsChecked = 0;
for (const list of Object.values(model.components ?? {}))
  for (const c of list ?? [])
    for (const f of c.facets ?? []) {
      const dtoById = new Map((f.dtos ?? []).map((d) => [d.id, d]));
      const opByRequestName = new Map();   // request DTO name -> the first operation claiming it
      for (const op of f.operations ?? []) {
        operationsChecked++;
        const where = `${c.name}.${f.name}.${op.name}`;
        const req = op.inputDto ? dtoById.get(op.inputDto) : undefined;
        const res = op.outputDto ? dtoById.get(op.outputDto) : undefined;
        for (const [role, dto, field] of [['request', req, 'inputDto'], ['response', res, 'outputDto']]) {
          if (dto) continue;
          note(`[S6] ${where}: declares no ${role} DTO — \`${field}\` is ` +
            `${op[field] ? `'${op[field]}', which facet '${f.name}' does not declare` : 'absent'}. ` +
            `The scaffolder emits every operation as \`Task<Response<TResult>> ${op.name}(TRequest)\` and ` +
            `refuses a model that cannot name both in the operation's own facet (ADR-027 §3), so a one-sided ` +
            `operation stops Construction having passed every gate (#438)`);
        }
        if (!req) continue;
        const prior = opByRequestName.get(req.name);
        if (prior) {
          note(`[S7] ${where}: shares request DTO '${req.name}' with ${c.name}.${f.name}.${prior} — ` +
            `variant attribution is BY NAME, so a '${req.name}_{Variant}' belongs to neither operation ` +
            `unambiguously and the loser's '${op.name}_Result' is left an orphan the scaffolder refuses ` +
            `as a reserved name (ADR-027 §3). Give each operation its own request DTO (#438)`);
          continue;
        }
        opByRequestName.set(req.name, op.name);
      }
    }

// ------------------------------------------------ [S8] every deployment decision is RULED (ADR-071)
//
// The deployment view is /3: kind and product per slot, and the hosting operational concept, are
// the Software Architect's rulings, stamped `ruled: { by, on, basis }` on the artefact they govern.
// Construction builds drivers for the products the view names, so an unruled slot here would make a
// guess real in code. The remedy is the ruling — put the question to him — never a stamp typed to
// pass this check (#1247).

for (const u of view.unruled) note(`[S8] ${u}`);

// ------------------------------------------------ [S9] FIRST LIGHT (relay R-260, measure P3)
//
// One of the run's seam-bearing components has run one seeded case through its simulator at
// isolated wiring — read off the spec runner's own results file, never off a typed record. See the
// header: the unit family is the ADR-059 derived durable round-trip, `protocol: <Seam> …`, which by
// construction runs the Access's write and read CONTRACT operations against the registered
// simulator at isolated wiring. Green ⇒ that seam is LIT.

const specResultsDir = resolve(flag('--spec-results') ?? join(csharpDir, 'Spec', 'evidence', 'spec-results'));
const PROTOCOL_PREFIX = 'protocol: ';
/** seam -> { green, red, at } over every ISOLATED results file in the directory. */
const roundTrips = new Map();
const resultFiles = [];
if (existsSync(specResultsDir)) {
  for (const name of readdirSync(specResultsDir).filter((f) => f.endsWith('.results.json')).sort()) {
    const file = join(specResultsDir, name);
    let doc;
    try { doc = JSON.parse(readFileSync(file, 'utf-8')); }
    catch (e) {
      advise(`[S9] ${rel(file)} is not readable JSON (${e.message}) — a results file that cannot be ` +
        'read says nothing about first light, and it is named rather than skipped in silence');
      continue;
    }
    // The FILE'S OWN `wiring` decides, never its name: the run is what knew its wiring, and the
    // name is a convenience the runner composes from it (`SpecResults.FileFor`).
    if (doc?.wiring !== 'isolated') continue;
    const at = statSync(file).mtimeMs;
    resultFiles.push(rel(file));
    for (const c of doc.cases ?? []) {
      if (typeof c?.name !== 'string' || !c.name.startsWith(PROTOCOL_PREFIX)) continue;
      const seam = c.name.slice(PROTOCOL_PREFIX.length).split(' ')[0];
      if (!seam) continue;
      const tally = roundTrips.get(seam) ?? { green: 0, red: 0, at: 0 };
      if (c.ok === true) tally.green++; else tally.red++;
      tally.at = Math.max(tally.at, at);
      roundTrips.set(seam, tally);
    }
  }
}

/** The newest mtime of the files a seam's round-trip is a statement ABOUT — its inputs. */
const seamInputsNewestMs = (seam) => {
  let newest = 0;
  for (const r of declared.filter((s) => s.seam === seam)) {
    const { tier, stem } = layoutOf(r.owner, r.ownerTier);
    for (const p of [
      join(root, 'Component', tier, stem, 'Resource', `${seam}.cs`),
      join(simulatorDir, `${r.resource}Simulator.cs`),
      join(deploymentDir, 'protocol', `${seam}.protocol.yaml`),
    ]) if (existsSync(p)) newest = Math.max(newest, statSync(p).mtimeMs);
  }
  return newest;
};

const seamsOfOwner = new Map();          // owner -> [seam…]
for (const r of declared) {
  if (!r.seam) continue;
  seamsOfOwner.set(r.owner, [...new Set([...(seamsOfOwner.get(r.owner) ?? []), r.seam])]);
}
const declaredSeams = [...new Set(declared.map((s) => s.seam).filter(Boolean))];
const litSeams = declaredSeams.filter((s) => (roundTrips.get(s)?.green ?? 0) > 0);
const staleSeams = litSeams.filter((s) => seamInputsNewestMs(s) > (roundTrips.get(s).at + 1000));
// Freshness is REPORTED and never enforced. An mtime is a fact about this checkout — a fresh clone
// has no results file at all (the runner's output is a run artifact, not a committed one), so the
// only case where the comparison means anything is the one it is printed for: an evidence file this
// tree produced before this tree's seam, sheet or simulator last moved. The enforcement a project
// wants there is cheap and is the measure itself: re-run the suite at isolated wiring.
for (const s of staleSeams)
  advise(`[S9] ${s}: its first light is recorded, and the run PREDATES the seam, sheet or simulator it ` +
    'ran against — re-run the suite at isolated wiring before reading this as first light (advisory: ' +
    'an mtime is a fact about this checkout, so it is reported, never enforced)');

if (requireFirstLight) {
  const where = `${rel(specResultsDir)}${existsSync(specResultsDir) ? '' : ' (which does not exist)'}`;
  const how = 'the evidence is one green `protocol: <Seam> …` case in an ISOLATED spec results file — ' +
    'the ADR-059 derived durable round-trip, which writes and reads back through the Access contract ' +
    'against the registered simulator. Produce it with `THEAGENT_SPEC_RESULTS=<dir> ' +
    'THEAGENT_SPEC_WIRING=isolated` over the spec assembly (`just spec-verdict` exports both)';
  if (requireFirstLight.all) {
    if (litSeams.length === 0)
      note(`[S9] NO FIRST LIGHT — none of the ${declaredSeams.length} seam(s) this run declares ` +
        `(${declaredSeams.join(', ')}) has a green derived round-trip at isolated wiring in ${where}. ` +
        'Build ONE of them and run one seeded case through its simulator before the tier is ' +
        `dispatched: one component pays for the whole tier's lesson (relay R-260 measure P3). ${how}`);
  } else {
    for (const name of requireFirstLight.names) {
      const seams = seamsOfOwner.get(name) ?? (declaredSeams.includes(name) ? [name] : null);
      if (!seams) {
        console.error(`construction-entry-check: ${REQUIRE_FIRST_LIGHT} '${name}' is neither a slot owner ` +
          `nor a seam of ${rel(yamlPath)} (owners: ${owners.join(', ')}; seams: ${declaredSeams.join(', ')}) — ` +
          'a requirement naming nothing would require nothing, silently');
        process.exit(2);
      }
      if (!seams.some((s) => litSeams.includes(s)))
        note(`[S9] ${name}: NOT LIT — no green derived round-trip at isolated wiring in ${where} for ` +
          `${seams.length > 1 ? `any of its seams (${seams.join(', ')})` : seams[0]}` +
          `${seams.some((s) => (roundTrips.get(s)?.red ?? 0) > 0) ? ', and its recorded round-trips are RED' : ''}. ${how}`);
    }
  }
}

/** The [S9] state, printed on every run — a green that does not say it is unlit is #645's shape. */
const firstLightLine = (() => {
  if (!existsSync(specResultsDir))
    return `NOT LIT — no spec results directory at ${rel(specResultsDir)}; the spec runner writes one ` +
      'when THEAGENT_SPEC_RESULTS is set (`just spec-verdict`)' +
      (requireFirstLight ? '' : `. Advisory; ${REQUIRE_FIRST_LIGHT} makes it a failure (relay R-260 measure P3)`);
  if (resultFiles.length === 0)
    return `NOT LIT — ${rel(specResultsDir)} holds no results file at ISOLATED wiring` +
      (requireFirstLight ? '' : `. Advisory; ${REQUIRE_FIRST_LIGHT} makes it a failure (relay R-260 measure P3)`);
  if (litSeams.length === 0)
    return `NOT LIT — ${resultFiles.length} isolated results file(s) and no green derived round-trip for ` +
      `any of ${declaredSeams.join(', ')}` +
      (requireFirstLight ? '' : `. Advisory; ${REQUIRE_FIRST_LIGHT} makes it a failure (relay R-260 measure P3)`);
  return `LIT — ${litSeams.map((s) => `${s} (${roundTrips.get(s).green} green derived round-trip(s)` +
    `${roundTrips.get(s).red ? `, ${roundTrips.get(s).red} red` : ''})`).join(', ')} at isolated wiring, ` +
    `from ${resultFiles.join(', ')}` +
    (litSeams.length < declaredSeams.length
      ? `; unlit: ${declaredSeams.filter((s) => !litSeams.includes(s)).join(', ')}`
      : '') +
    (staleSeams.length ? `; ${staleSeams.length} stale (see the note above)` : '');
})();

// ---------------------------------------------------------------------------- verdict

for (const a of advisories) console.log(`construction-entry-check: advisory: ${a}`);
console.log(`construction-entry-check: first light [S9]: ${firstLightLine}`);

if (problems.length) {
  for (const p of problems) console.error(`construction-entry-check: ${p}`);
  console.error(
    `\nRead under C# root \`${company}\` (from ${companySource}), spec composition \`${composition.name}\`. ` +
    `If those are not what this tree carries, every path finding above is artefactual — pass \`--company\` ` +
    `(#1343, figaro#372).`);
  console.error(
    `\n${problems.length} omission(s). Specification does not start over these: a spec layer authored against a seam ` +
    `nobody built produces trust-chain gates no implementation can satisfy, and the red says "no evidence file" ` +
    `rather than naming the cause (#645, #733). The three scaffolder-contract rules fail the same way one stage ` +
    `later — the scaffolder refuses the model, having passed every gate: a permutation naming no variant request ` +
    `DTO ([S5], #1208), a one-sided operation ([S6]) and a request DTO shared by two operations ([S7], #1209). ` +
    `An [S9] omission is the wave's own entry condition: one seam-bearing component runs one seeded case through ` +
    `its simulator at isolated wiring before the tier is dispatched (relay R-260 measure P3).`);
  process.exit(1);
}
console.log(
  `construction-entry-check: OK — ${declared.length} slot(s) across ${owners.length} resource access(es) ` +
  `(${declared.map((r) => `${r.owner}/${r.slot}`).join(', ')}); model and deployment view name the same ` +
  `set of Accesses, and each slot has a store-seam project, a section in ${rel(seamDocPath)} and a ` +
  `simulator registered with both the spec resources and the container. ` +
  `${permutationsChecked} Manager permutation(s) name a declared variant request DTO` +
  (parkedSkipped.length
    ? ` (${parkedSkipped.length} parked use case(s) left out, not built: ${parkedSkipped.join(', ')})`
    : seqmapPath ? ' (no use case is parked)' : ' (no --seqmap given, so nothing is taken as parked)') + '; ' +
  `${operationsChecked} operation(s) carry a request and a response DTO of their own facet, none shared. ` +
  `Every slot and the hosting concept carry the Software Architect's ruling (ADR-071). ` +
  `C# root \`${company}\` (from ${companySource}); spec composition \`${composition.name}\`.`);
