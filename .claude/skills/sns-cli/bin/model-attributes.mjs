/**
 * model-attributes — ONE pass over the model store's attributes, shared by the two model lints
 * (#1384 the string-kind lint, #1382 the DTO discriminator lint).
 *
 * WHY THIS FILE EXISTS. Both lints ask the same question of the same tree — *"walk every attribute
 * of every DTO of every component, and tell me its name, its type, its optionality, its declared
 * annotations and its address"* — and neither of them is about walking. Two copies of that walk
 * would disagree the first time the model store grows a shape (a component that declares `dtos:`
 * directly, a new component layer), and the disagreement would show up as one lint reporting a site
 * the other cannot see, which is indistinguishable from a bug in the rule. So the walk is here,
 * once, and each lint is only its rule.
 *
 * WHAT AN ATTRIBUTE IS. A `fields:` entry of a `dtos:` entry, reachable from
 * `components.<layer>[].facets[].dtos[]` (and from `components.<layer>[].dtos[]`, which the store's
 * schema permits). Enum members, operations and volatilities are not attributes; nothing here
 * touches them, except that the declared `enums:` of the model ARE read, because "this string is an
 * enumeration" has a remedy — an enum type — and a checker that cannot see the existing enum types
 * cannot name that remedy.
 *
 * ADDRESSING. `Component.Facet.Dto.Field`, the spelling `sns-cli` already uses for a `Dto.Field`
 * reference (`computed_from`, `default_from`). Deliberately NOT a file:line: the model store is
 * mutation-written, its line numbers move under every unrelated edit, and a worklist keyed by line
 * is stale before it is read. An address survives the edit that a line number does not.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse, YamlSubsetError } from './yaml-subset.mjs';

/**
 * The component layers the model store declares. `utilities` is listed although Comanda has none:
 * the walk must not silently skip a layer a project does carry, and a layer key this list omits is
 * exactly that silence.
 */
export const LAYERS = ['managers', 'engines', 'resource_access', 'clients', 'resources', 'utilities'];

/** Read a model store, exiting 2 with a sentence rather than a stack trace (the #803 discipline). */
export function readModel(path, tool) {
  let text;
  try { text = readFileSync(path, 'utf-8'); }
  catch { console.error(`${tool}: cannot read ${path}`); process.exit(2); }
  try { return parse(text, path); }
  catch (e) {
    if (e instanceof YamlSubsetError) { console.error(`${tool}: ${e.message}`); process.exit(2); }
    throw e;
  }
}

/**
 * Resolve `--model` / `--project` to the one `architecture.yaml`. A project directory carries
 * exactly one `*.method/` store; two would mean the caller must say which, and guessing between
 * them is how a lint reports CLEAN over the model nobody is editing.
 */
export function resolveModelPath(opts, tool) {
  if (opts.model) return opts.model;
  if (!opts.project) { console.error(`${tool}: pass --model <architecture.yaml> or --project <dir>`); process.exit(2); }
  let entries;
  try { entries = readdirSync(opts.project, { withFileTypes: true }); }
  catch { console.error(`${tool}: cannot read project directory ${opts.project}`); process.exit(2); }
  const stores = entries
    .filter((e) => e.isDirectory() && e.name.endsWith('.method'))
    .map((e) => join(opts.project, e.name, 'architecture.yaml'))
    .filter((p) => existsSync(p));
  if (stores.length === 1) return stores[0];
  if (stores.length === 0) { console.error(`${tool}: no <name>.method/architecture.yaml under ${opts.project}`); process.exit(2); }
  console.error(`${tool}: ${stores.length} model stores under ${opts.project} (${stores.join(', ')}) — name one with --model`);
  process.exit(2);
}

/**
 * The model a lint is about: the canonical STORE, or a DRAFT projected to the same shape (#1438).
 *
 * ═══ THE GAP THIS CLOSES ═══════════════════════════════════════════════════════════════════
 *
 * Both model lints read `architecture.yaml`. A draft is an OP-LOG with no projection on disk, so
 * an annotation wave — whose whole purpose is to cure these lints' findings — could not ask
 * whether it had. The only two moves were both bad: promote blind, and behind a promote on a real
 * project sits the contract regeneration (Figaro: 1,141 files); or re-implement the lint's input,
 * which figaro's session S-992 did on 2026-09-10 in ~30 lines of throwaway code (parse the
 * canonical store, apply the 44-entry batch to the parsed field objects in memory, call
 * `findings()`). It was right — it predicted 74 → 30 and the post-promote measurement was exactly
 * 30 — and every future wave on every project would have had to write it again, each time with its
 * own chance of spelling the engine's flat keys (`kind_width`, `kind_opaque`, `kind_round_trip`)
 * slightly wrong and believing a wrong number.
 *
 * ═══ WHY THIS IS SMALL, AND WHAT WAS ALREADY THERE ══════════════════════════════════════════
 *
 * Nothing here projects a draft. `sns-cli project (--main-oplog | --draft <ref>) --emit
 * canonical-yaml` ALREADY DOES, and its output contract is the reason this works at all: the RAW
 * canonical YAML, verbatim on stdout, no JSON envelope — the byte-faithful artifact the SN-OpLog
 * CI guardrail `==`-compares to `architecture.yaml`. Byte-faithful to the store means it carries
 * every key the store carries, `kind:` and `shape_ok:` included, which is exactly what
 * `sns-cli read --kind ReadArchitecture` does NOT (they are store keys, absent from the read DTO —
 * the observation that made the gap look unclosable).
 *
 * So the projection is somebody else's authority and stays there. This is a pipe.
 *
 * ═══ TWO FLAGS, NOT ONE, AND THAT IS DELIBERATE ═════════════════════════════════════════════
 *
 * `--project` means DIFFERENT THINGS to the two surfaces: to a lint it is a DIRECTORY holding one
 * `<name>.method/`, to `sns-cli` it is a REGISTERED PROJECT NAME. They coincide often enough to
 * be dangerous and not always, and a checker that guesses one from the other reports CLEAN over
 * whichever model it happened to find. So a draft read takes `--draft <ref>` AND
 * `--sns-project <name>`, and says so when one is missing.
 *
 * The manual path is unchanged and still supported, for a box with no `sns-cli` on PATH:
 *
 *     sns-cli project --project <name> --draft <ref> --emit canonical-yaml > /tmp/draft.yaml
 *     model-string-kind.mjs --model /tmp/draft.yaml
 *
 * `$SNS_CLI` overrides the executable, which is how the suite runs this without a Studio build.
 */
export function readDraftModel(opts, tool) {
  const draft = String(opts.draft ?? '').trim();
  const project = String(opts.snsProject ?? '').trim();
  if (!project) {
    console.error(`${tool}: --draft needs --sns-project <name> — the REGISTERED project name sns-cli `
      + `knows, which is not the same thing as --project <dir> (a directory holding one *.method/). `
      + `Guessing one from the other is how a lint reports CLEAN over the wrong model.`);
    process.exit(2);
  }
  if (opts.model) {
    console.error(`${tool}: --draft and --model are two different models — pass one. `
      + `--model lints a store on disk; --draft lints the projection of a draft's op-log.`);
    process.exit(2);
  }
  const bin = process.env.SNS_CLI || 'sns-cli';
  const args = ['project', '--project', project, '--draft', draft, '--emit', 'canonical-yaml'];
  const run = spawnSync(bin, args, { encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024 });
  if (run.error) {
    console.error(`${tool}: cannot run \`${bin}\` (${run.error.code || run.error.message}). `
      + `Set $SNS_CLI to the executable, or project the draft yourself and pass the file:\n`
      + `  ${bin} project --project ${project} --draft ${draft} --emit canonical-yaml > /tmp/draft.yaml\n`
      + `  ${tool}.mjs --model /tmp/draft.yaml`);
    process.exit(2);
  }
  // The output contract is the check: on failure stdout stays EMPTY and the §6 error envelope is
  // on stderr, so a caller never mistakes an envelope for canonical YAML. Reporting sns-cli's own
  // words is the point — a lint that says "projection failed" hides the reason the operator needs.
  if (run.status !== 0) {
    console.error(`${tool}: \`${bin} ${args.join(' ')}\` exited ${run.status}:\n${(run.stderr || '').trim()}`);
    process.exit(2);
  }
  const subject = `draft ${draft} of project ${project} (projected canonical YAML)`;
  if (!String(run.stdout ?? '').trim()) {
    console.error(`${tool}: ${bin} exited 0 and produced no canonical YAML for ${subject}.`);
    process.exit(2);
  }
  try { return { doc: parse(run.stdout, subject), subject }; }
  catch (e) {
    if (e instanceof YamlSubsetError) { console.error(`${tool}: ${e.message}`); process.exit(2); }
    throw e;
  }
}

/**
 * The one model-loading entry point of both lints: `--draft` when asked for, `--model`/`--project`
 * otherwise. Returns the parsed document AND the subject line the report prints, so a reader can
 * always tell WHICH model a number was measured over — a draft's count and a store's count are
 * different claims and must never look alike.
 */
export function resolveModelDoc(opts, tool) {
  if (String(opts.draft ?? '').trim()) return readDraftModel(opts, tool);
  const path = resolveModelPath(opts, tool);
  return { doc: readModel(path, tool), subject: path };
}

/**
 * A declared type, taken apart. `string?` is an optional string; `List<string>` is a collection OF
 * strings and its ELEMENT is what a string rule is about; `List<string>?` is both.
 *
 * The collection spellings are the ones the store actually uses plus the two a C# author reaches
 * for next (`IReadOnlyList<>`, `T[]`). An unrecognised generic is left whole — it is a DTO type or
 * an enum type, and a rule about strings must not fire on it.
 */
export function parseType(raw) {
  const text = String(raw ?? '').trim();
  let body = text;
  let optional = false;
  if (body.endsWith('?')) { optional = true; body = body.slice(0, -1).trim(); }
  let collection = false;
  let element = body;
  const generic = body.match(/^(List|IList|IReadOnlyList|ICollection|IEnumerable|HashSet|ISet)<(.+)>$/);
  if (generic) { collection = true; element = generic[2].trim(); }
  else if (body.endsWith('[]')) { collection = true; element = body.slice(0, -2).trim(); }
  // An element may itself be optional: `List<string?>`.
  let elementOptional = false;
  if (element.endsWith('?')) { elementOptional = true; element = element.slice(0, -1).trim(); }
  return { raw: text, body, element, optional, elementOptional, collection };
}

/** Does this declared type carry text — `string`, `string?`, `List<string>`? */
export function isStringTyped(raw) {
  return parseType(raw).element === 'string';
}

/**
 * The annotation an attribute carries, read in BOTH spellings, because which one the authoring
 * surface lands on is not settled (see the two lints' headers: `sns-cli` cannot write either yet).
 *
 *   flat    `kind: free-text` + `kind_width: 400` + `kind_opaque: true`
 *   nested  `kind: {name: free-text, width: 400, opaque: true}`
 *
 * The flat spelling is what a scalar `set_semantics`-style property can carry, and is therefore the
 * one recommended; the nested spelling is what issue #1384's table reads like. Accepting both costs
 * nine lines and removes a whole class of "the lint cannot see what I wrote".
 */
export function readAnnotation(field, prefix) {
  const value = field?.[prefix];
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const name = value.name ?? value.kind ?? value.value ?? null;
    const props = { ...value };
    delete props.name;
    return { name: name == null ? null : String(name), props, spelling: 'nested' };
  }
  const props = {};
  const p = `${prefix}_`;
  for (const [k, v] of Object.entries(field)) if (k.startsWith(p)) props[k.slice(p.length)] = v;
  return { name: String(value), props, spelling: 'flat' };
}

/** Every enum type the model declares, by name — the remedy a string-that-is-an-enumeration wants. */
export function declaredEnums(doc) {
  const names = new Set();
  for (const { component } of components(doc))
    for (const e of asList(component.enums)) if (e?.name) names.add(String(e.name));
  return names;
}

function asList(v) { return Array.isArray(v) ? v : v == null ? [] : [v]; }

/**
 * A DTO reference resolved to a DTO NAME — `extends`, `inputDto`, `outputDto`.
 *
 * WHY THIS EXISTS (#1412 point 3). The model store keys DTO references by **UUID**
 * (`extends: af4d7b0f-…`, `ArchitectureManager.ResolveDtoHierarchy`), while every rule in these
 * lints is written against DTO NAMES, because a name is what an address, a message and a worklist
 * can carry. Comparing an id against a set of names silently matches NOTHING, and "nothing matched"
 * is indistinguishable from "no variant relation exists" — so a request VARIANT read as a
 * standalone DTO, and every result-side rule fired on it. Six Figaro request fields were reported
 * as results that way, each carrying an honest `free-text`, with no remedy but a false annotation.
 *
 * The hand-authored fixtures spell the same references by NAME, which is why the defect survived a
 * green suite: the tests never used the spelling the store writes. Both spellings resolve here —
 * id first, name as the fallback — so a fixture stays readable and a real store is read correctly.
 * Anything that resolves to neither is returned as it stands, so a dangling reference stays visible
 * rather than turning into a silent null.
 */
export function dtoNameResolver(doc) {
  const byId = new Map();
  for (const { dto } of dtos(doc)) {
    const name = dto.name == null ? '' : String(dto.name);
    if (dto.id != null && name) byId.set(String(dto.id), name);
  }
  return (ref) => (ref == null ? null : byId.get(String(ref)) ?? String(ref));
}

/** Every component of every layer, with the layer it was found in. */
export function* components(doc) {
  const root = doc?.components ?? {};
  for (const layer of LAYERS)
    for (const component of asList(root[layer]))
      if (component && typeof component === 'object') yield { layer, component };
}

/**
 * Every DTO of the model: `{layer, componentName, facetName, dto}`. A DTO declared directly on a
 * component (no facet) reports its facet as `-`, so an address is always four segments and a
 * worklist never has to know which shape produced it.
 */
export function* dtos(doc) {
  for (const { layer, component } of components(doc)) {
    const componentName = String(component.name ?? '?');
    for (const dto of asList(component.dtos))
      if (dto && typeof dto === 'object') yield { layer, componentName, facetName: '-', dto };
    for (const facet of asList(component.facets)) {
      const facetName = String(facet?.name ?? '-');
      for (const dto of asList(facet?.dtos))
        if (dto && typeof dto === 'object') yield { layer, componentName, facetName, dto };
    }
  }
}

/**
 * Every ATTRIBUTE of the model, which is what both lints are rules about.
 *
 * `siblings` is the whole field list of the owning DTO, because every DTO-shape rule is about an
 * attribute IN THE COMPANY of the others — a discriminator is only a finding beside conditionally
 * valid properties, and a flag is only a finding beside a value nothing defines on its false
 * branch. Handing each attribute its siblings is what lets the DTO lint stay a per-attribute rule
 * with a per-attribute suppression, rather than a per-DTO one that cannot be excused precisely.
 */
export function* attributes(doc) {
  // `extends` is resolved to the base DTO's NAME (#1412 point 3): the store writes a UUID there,
  // and a rule that prints or compares the raw reference reads as `a variant of af4d7b0f-…`.
  const nameOf = dtoNameResolver(doc);
  for (const { layer, componentName, facetName, dto } of dtos(doc)) {
    const dtoName = String(dto.name ?? '?');
    const fields = asList(dto.fields).filter((f) => f && typeof f === 'object');
    for (const field of fields) {
      const name = String(field.name ?? '?');
      yield {
        layer,
        componentName,
        facetName,
        dtoName,
        dto,
        extends: nameOf(dto.extends),
        field,
        siblings: fields,
        name,
        type: String(field.type ?? ''),
        parsed: parseType(field.type),
        comparisonClass: field.comparison_class == null ? null : String(field.comparison_class),
        address: `${componentName}.${facetName}.${dtoName}.${name}`,
      };
    }
  }
}

/**
 * Which DTO NAMES are EXTENDED by another DTO — the base half of an ADR-027 variant relation.
 * Resolved through `dtoNameResolver`, because the store's `extends` is a UUID and the callers ask
 * this set `has(dtoName)` (#1412 point 3).
 */
export function extendedBases(doc) {
  const nameOf = dtoNameResolver(doc);
  const bases = new Set();
  for (const { dto } of dtos(doc)) if (dto.extends != null) bases.add(nameOf(dto.extends));
  return bases;
}

/**
 * Which DTOs are an operation's REQUEST, following the ADR-027 variant relation down.
 *
 * Three of the DTO-shape rules, and one of the string rules, are about what a CALLER IS TOLD — a
 * value nothing defines on the miss branch, a refusal with no reason, text asserted exactly by a
 * spec's comparer. None of them is a statement about a request: a request field has no false
 * branch, is refused by nobody, and is compared by no oracle. Firing them on requests would produce
 * findings whose remedy is "nothing", which is how a lint teaches people to argue with it.
 *
 * A DTO reachable from no operation at all — a store row, a nested record — is NOT a request and
 * stays in scope. That is deliberate: `ChannelConfigRow`, the store-seam row the Software Architect
 * objected to by name, is exactly such a DTO.
 */
export function requestDtoNames(doc) {
  const nameOf = dtoNameResolver(doc);
  const requests = new Set();
  for (const { component } of components(doc))
    for (const facet of [...asList(component.facets), component])
      for (const op of asList(facet?.operations))
        if (op?.inputDto != null) {
          const name = nameOf(op.inputDto);
          if (name) requests.add(name);
        }
  // A variant of a request is a request. Iterate to a fixed point: variant chains are short, and
  // "short" is not a reason to assume depth 1.
  //
  // `extends` MUST be resolved before it is compared (#1412 point 3). It was not, and the store
  // spells it as a UUID while this set holds names — so the loop never grew, every request variant
  // fell out of the request set, and the result-side rules fired on it. The failure was silent by
  // construction: an unmatched id and an absent relation look the same from here.
  for (let grew = true; grew;) {
    grew = false;
    for (const { dto } of dtos(doc)) {
      const name = String(dto.name ?? '');
      if (dto.extends != null && requests.has(nameOf(dto.extends)) && !requests.has(name)) {
        requests.add(name);
        grew = true;
      }
    }
  }
  return requests;
}

/** A tiny `--flag value` reader; the sns-cli bin family carries one each, and this is the shared one. */
export function parseArgs(argv, tool, { flags = [], values = [] } = {}) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { console.error(`${tool}: unexpected argument ${a}`); process.exit(2); }
    const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (flags.includes(key)) { opts[key] = true; continue; }
    if (values.includes(key)) {
      const v = argv[++i];
      if (v == null) { console.error(`${tool}: ${a} needs a value`); process.exit(2); }
      opts[key] = v;
      continue;
    }
    console.error(`${tool}: unknown option ${a}`); process.exit(2);
  }
  return opts;
}

/**
 * The shared verdict printer. `--json` exists for ONE reason and it is the acceptance test of both
 * lints (#1384/#1382): the round that these lints enforce writes down the sites it intends to
 * change BEFORE it changes them, and the lints are accepted only if their output over the old tree
 * IS that list. Comparing two lists is a diff; comparing a list against prose is an argument.
 */
export function report(tool, findings, { json, subject, clean }) {
  if (json) {
    console.log(JSON.stringify({ tool, subject, findings }, null, 2));
    return findings.length ? 1 : 0;
  }
  if (!findings.length) { console.log(`${tool}: OK — ${clean}`); return 0; }
  for (const f of findings) console.error(`${tool}: ${f.address}: [${f.rule}] ${f.message}`);
  const byRule = new Map();
  for (const f of findings) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
  const tally = [...byRule.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(', ');
  console.error(`\n${findings.length} finding(s) over ${subject}: ${tally}`);
  return 1;
}
