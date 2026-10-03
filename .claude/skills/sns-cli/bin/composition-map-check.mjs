#!/usr/bin/env node
/**
 * composition-map-check (#647) — the full-wiring composition map must GROW WITH THE MODEL.
 *
 *   node composition-map-check.mjs --model <architecture.yaml> --csharp <project>/csharp
 *
 * The failure this exists to make impossible: a whole business-process family fell off three
 * hand-maintained lists at once (the Subsystem project references of the full spec composition, the
 * namespace->subsystem map inside its composition root, and the per-component Service references of
 * the spec assembly). Nothing reported the omission — every gate over the missing family read
 * "no evidence file", which is what a gate over NOTHING looks like, so four trust-chain gates could
 * never go green and no red ever named the cause.
 *
 * So this check derives the expected set from the MODEL (the components and their facets) and from
 * the GENERATED wiring the scaffolder writes from it (Application/Hosting + Subsystem/<X>/Hosting),
 * and fails when any of the lists a human still maintains is missing an entry. A list that is
 * derived — an MSBuild wildcard, or a map read off the generated topology — satisfies the check by
 * construction; that is the point, not a loophole.
 *
 * Exit: 0 complete · 1 an omission · 2 usage.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { yamlReader } from './yaml-subset.mjs';

/** Reads one YAML document, or dies with `composition-map-check: file:line: why` (#813/#803). */
const readYaml = yamlReader('composition-map-check');

// ---------------------------------------------------------------------------- arguments

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const modelPath = flag('--model');
const csharpDir = flag('--csharp');
if (!modelPath || !csharpDir) {
  console.error('composition-map-check: --model <architecture.yaml> --csharp <dir> are both required');
  process.exit(2);
}
for (const p of [modelPath, csharpDir]) {
  if (!existsSync(p)) { console.error(`composition-map-check: missing ${p}`); process.exit(2); }
}

// ---------------------------------------------------------------------------- the model

/** Model tier -> skeleton directory and the name suffix the component carries (ADR-022 layout). */
const TIERS = [
  { key: 'managers', dir: 'Manager', suffix: 'Manager' },
  { key: 'engines', dir: 'Engine', suffix: 'Engine' },
  { key: 'resource_access', dir: 'Access', suffix: 'Access' },
];

const model = readYaml(modelPath);
const company = model?.name;
if (!company) { console.error(`composition-map-check: ${modelPath} names no project`); process.exit(2); }

/** Every component the wiring must carry: its tier, its volatility stem, its facets. */
const components = TIERS.flatMap(({ key, dir, suffix }) =>
  (model.components?.[key] ?? []).map((c) => ({
    modelName: c.name,
    tier: dir,
    // OrderManager -> Order, PricingEngine -> Pricing, SalesAccess -> Sales.
    stem: c.name.endsWith(suffix) ? c.name.slice(0, -suffix.length) : c.name,
    facets: (c.facets ?? []).map((f) => f.name),
  })));

const managers = components.filter((c) => c.tier === 'Manager');
// One subsystem per Manager, named after its volatility stem — the scaffolder's synthesis rule.
const expectedSubsystems = managers.map((m) => m.stem);

// ---------------------------------------------------------------------------- the repo

const problems = [];
const note = (p) => problems.push(p);
const rel = (p) => relative(process.cwd(), p);

/** Expand one MSBuild Include, honouring '*' in path segments; returns absolute paths that exist. */
function expandInclude(projectDir, include) {
  const parts = include.split('\\').join('/').split('/');
  let candidates = [projectDir];
  for (const part of parts) {
    const next = [];
    for (const base of candidates) {
      if (!part.includes('*')) {
        next.push(resolve(base, part));
        continue;
      }
      const rx = new RegExp(`^${part.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);
      let entries = [];
      try { entries = readdirSync(base); } catch { entries = []; }
      for (const entry of entries) if (rx.test(entry)) next.push(resolve(base, entry));
    }
    candidates = next;
  }
  return candidates.filter((p) => existsSync(p));
}

/** Every project a csproj references, absolute, wildcards expanded (existing files only). */
function referencesOf(csproj) {
  const text = readFileSync(csproj, 'utf-8');
  const includes = [...text.matchAll(/<ProjectReference\s+Include="([^"]+)"/g)].map((m) => m[1]);
  return includes.flatMap((i) => expandInclude(dirname(csproj), i));
}

// Absolute throughout: a reference expanded from a csproj and a path derived from the model must
// be the same string when they are the same file, whichever form the caller passed on the command line.
const root = resolve(csharpDir);
const specDir = join(root, 'Spec');
const componentDir = join(root, 'Component');
const subsystemDir = join(root, 'Subsystem');
const applicationCsproj = join(root, 'Application', `${company}.Application.csproj`);
const fullCompositionCsproj = join(specDir, `${company}.Spec.Composition.Full`, `${company}.Spec.Composition.Full.csproj`);
const fullCompositionRoot = join(specDir, `${company}.Spec.Composition.Full`, `${company}FullCompositionRoot.cs`);
const specCsproj = join(specDir, `${company}.Spec`, `${company}.Spec.csproj`);

for (const p of [applicationCsproj, fullCompositionCsproj, fullCompositionRoot, specCsproj]) {
  if (!existsSync(p)) { console.error(`composition-map-check: missing ${rel(p)}`); process.exit(2); }
}

const projectOf = (component, half) =>
  join(componentDir, component.tier, component.stem, half, `${company}.${component.tier}.${component.stem}.${half}.csproj`);
const subsystemProjectOf = (name) => join(subsystemDir, name, `${company}.Subsystem.${name}.csproj`);

// Rule 1 — the model's components exist as projects. A modeled component with no skeleton is an
// omission upstream of every list below.
for (const c of components) {
  for (const half of ['Interface', 'Service']) {
    const proj = projectOf(c, half);
    if (!existsSync(proj)) note(`${c.modelName}: the model declares it, ${rel(proj)} does not exist`);
  }
}

// Rule 2 — one subsystem project per Manager, and the generated application composition names
// every one of them (it is the list every downstream wiring reads).
const applicationRefs = new Set(referencesOf(applicationCsproj));
for (const name of expectedSubsystems) {
  const proj = subsystemProjectOf(name);
  if (!existsSync(proj)) { note(`Subsystem/${name}: the model declares ${name}Manager, ${rel(proj)} does not exist — regenerate the wiring`); continue; }
  if (!applicationRefs.has(proj)) note(`Subsystem/${name}: absent from ${rel(applicationCsproj)} — the application composition does not carry it`);
}
for (const ref of applicationRefs) {
  if (!ref.startsWith(`${subsystemDir}/`)) continue;
  const name = ref.split('/').at(-2);
  if (!expectedSubsystems.includes(name)) note(`Subsystem/${name}: referenced by ${rel(applicationCsproj)} but no ${name}Manager is modeled`);
}

// Rule 3 — every modeled component is HOSTED, and every modeled facet has an endpoint. A contract
// with no endpoint resolves as "has not been registered" at run time, which reads like a broken
// implementation rather than a wiring omission.
const hostedComponents = new Map(); // "Tier/Stem" -> [subsystem names]
const hostedFacets = new Set(); // "Tier.Stem.Interface.Facet.IFacet"
for (const name of readdirSync(subsystemDir).sort()) {
  const hosting = join(subsystemDir, name, 'Hosting.cs');
  if (!existsSync(hosting) || !statSync(join(subsystemDir, name)).isDirectory()) continue;
  const text = readFileSync(hosting, 'utf-8');
  for (const m of text.matchAll(/Add(?:Manager|Engine|Access)\(typeof\((Manager|Engine|Access)\.(\w+)\.Service\.\w+\)\)/g)) {
    const key = `${m[1]}/${m[2]}`;
    hostedComponents.set(key, [...(hostedComponents.get(key) ?? []), name]);
  }
  for (const m of text.matchAll(/AddInProcEndpoint<([\w.]+)>\(\)/g)) hostedFacets.add(m[1]);
}
for (const c of components) {
  const hosts = hostedComponents.get(`${c.tier}/${c.stem}`);
  if (hosts === undefined) {
    note(`${c.modelName}: hosted by NO subsystem — no Subsystem/*/Hosting.cs registers ${c.tier}.${c.stem}.Service`);
    continue;
  }
  for (const facet of c.facets) {
    const contract = `${c.tier}.${c.stem}.Interface.${facet}.I${facet}`;
    if (!hostedFacets.has(contract)) note(`${c.modelName}.${facet}: modeled facet with no endpoint in ${hosts.map((h) => `Subsystem/${h}`).join(', ')} — nothing can resolve I${facet}`);
  }
}

// Rule 4 — the full spec composition carries every subsystem, so a spec at subsystem wiring can
// compose the one that owns its target.
const fullRefs = new Set(referencesOf(fullCompositionCsproj));
for (const name of expectedSubsystems) {
  const proj = subsystemProjectOf(name);
  if (existsSync(proj) && !fullRefs.has(proj)) note(`Subsystem/${name}: absent from ${rel(fullCompositionCsproj)} — its contracts are unregistered at subsystem and system wiring`);
}

// Rule 5 — the spec assembly names every component's Service project. Repo-side the omission is
// MASKED (the Services arrive transitively through the full composition); inside an ADR-049
// materialized workspace the full composition is deliberately absent, so a component the list
// forgot cannot be loaded at all.
const specRefs = new Set(referencesOf(specCsproj));
for (const c of components) {
  for (const half of ['Interface', 'Service', 'Resource']) {
    const proj = projectOf(c, half);
    // Only Accesses carry a Resource half (#505), and only where the store seam was scaffolded.
    if (!existsSync(proj)) continue;
    if (!specRefs.has(proj)) note(`${c.modelName}: its ${half} is absent from ${rel(specCsproj)} — the spec layer cannot see ${half === 'Service' ? "the implementation inside an ADR-049 workspace" : `its ${half.toLowerCase()} types except transitively, which hides the omission`}`);
  }
}

// Rule 6 — the composition root must not name a subsystem. The map from a target contract to the
// subsystem that hosts it is read off the generated topology; a literal here is a hand-maintained
// list growing back, and the next family to be added falls off it silently.
const rootText = readFileSync(fullCompositionRoot, 'utf-8');
const literals = [...rootText.matchAll(/^(?![^\n]*\/\/)[^\n]*?\b(?:Comanda|[A-Z]\w*)\.Subsystem\.(\w+)\.Hosting\b/gm)].map((m) => m[1]);
for (const name of [...new Set(literals)]) {
  note(`${rel(fullCompositionRoot)}: names Subsystem.${name}.Hosting in code — the subsystem map must be derived from the generated application topology, never typed per subsystem (#647)`);
}

// ---------------------------------------------------------------------------- verdict

if (problems.length) {
  for (const p of problems) console.error(`composition-map-check: ${p}`);
  console.error(`\n${problems.length} omission(s). Every list above must GROW WITH THE MODEL: a family that falls off one of them produces gates over nothing, not a red that names the cause (#647).`);
  process.exit(1);
}
console.log(
  `composition-map-check: OK — ${components.length} modeled component(s) across ${expectedSubsystems.length} subsystem(s) ` +
  `(${expectedSubsystems.join(', ')}); every one is hosted, referenced by the full spec composition and named by the spec assembly.`);
