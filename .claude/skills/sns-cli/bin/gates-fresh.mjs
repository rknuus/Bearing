#!/usr/bin/env node
/**
 * gates-fresh (#659) — the stage-exit condition that enumerates the programme's gates WITH the time
 * each one last ran against the artifacts it reads.
 *
 *   node gates-fresh.mjs --registry <gates.yaml> [--stamps <dir>] [--root <repo>] [--gate|--check|--audit]
 *   node gates-fresh.mjs --registry <gates.yaml> --stamp <gate> [--args "<recipe args>"]
 *
 * The failure this exists to make impossible (#659): `just call-chains-check` was RED from Design
 * through Blueprint, the whole of Specification, Contract and two Construction landings — nine
 * call-chain documents
 * that had never been generated — because the changeloop that names the gate never ran it, and
 * nothing in the process noticed. The three findings before it (#641 a lint CLEAN over zero
 * boundaries, #647 a family absent from the wiring that judges it, #655 a mutation pass CLEAN over
 * zero mutants) are checks that say the WRONG THING. This one is a check NOBODY ASKED: making a
 * gate honest does nothing if it is never invoked, and an absence has no output to read.
 *
 * So the evidence is inverted. Instead of asking a gate for its verdict, ask the tree for a RECORD
 * that the gate ran, and compare that record against the inputs the gate reads:
 *
 *   - the registry (`gates.yaml`) declares, per gate, the command a human runs, the paths that
 *     command READS, and why they are its inputs;
 *   - every gate's `just` recipe ends with `just gate-stamp <gate>`, which writes
 *     `<stamps>/<gate>.lastrun.json` — when it ran, over which input set, at which digest. The
 *     recipes run under `set -euo pipefail` and just aborts a recipe at its first failing line, so
 *     a RED gate never reaches its stamp: no stamp is the honest record of a gate that did not pass;
 *   - this check re-digests each gate's inputs and reports FRESH / STALE / NEVER-RUN.
 *
 * Two behaviors carry #973 — a committed stamp claiming a green over inputs that no longer exist,
 * found by a human reading `git diff` four times in one day:
 *
 *   - `--check` (wired into `just test` as `just gate-stamp-check`) fails on any STALE stamp, so
 *     a change that edits a gate's inputs either re-runs that gate in the same change or leaves
 *     `just test` red naming the command to run. NEVER-RUN does NOT fail it: an absent stamp is
 *     an honest absence (spec-seqcheck has real findings parked under #802/#711 and has never
 *     stamped), and stage exits already refuse over it via `--gate` — only a stamp that CLAIMS a
 *     green it no longer covers is the lie this closes;
 *   - `--stamp` over an UNCHANGED input set writes nothing: a stamp diff that moves only `at` is
 *     noise a committer would have to recognize and restore, so it is prevented at the source.
 *
 * The freshness sidecar is #712's, reused: a machine-written `.lastrun.json` recording when a run
 * happened and what it saw, so "no recorded run" is a PRINTED FACT rather than an invisible absence.
 *
 * A registry is itself a hand-maintained list, which is #647's class, so it is checked before it is
 * trusted — on every run, not only under `--audit`:
 *
 *   [R1] a declared input path that matches no file. An input set that resolves to nothing digests
 *        to the same value forever: a gate that reports FRESH and can never go stale.
 *   [R2] a gate whose command names a `just` recipe the Justfile does not have.
 *   [R3] a gate whose recipe does not stamp itself — a green run that leaves no evidence is exactly
 *        the hole this check exists to close.
 *   [R4] a `just gate-stamp X` in the Justfile naming a gate the registry does not declare.
 *
 * Exit: 0 report written (or, under --gate, every gate FRESH; under --check, no gate STALE) ·
 * 1 a gate is STALE or NEVER-RUN under --gate, or STALE under --check · 2 usage, or a registry
 * that cannot be trusted ([R1]-[R4]).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { yamlReader } from './yaml-subset.mjs';

/** Reads one YAML document, or dies with `gates-fresh: file:line: why` (#813/#803). */
const readYaml = yamlReader('gates-fresh');

// ---------------------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};
const has = (name) => argv.includes(name);

const registryPath = flag('--registry');
if (!registryPath) {
  console.error('gates-fresh: --registry <gates.yaml> is required');
  process.exit(2);
}
if (!existsSync(registryPath)) {
  console.error(`gates-fresh: missing ${registryPath}`);
  process.exit(2);
}
const root = resolve(flag('--root') ?? process.cwd());
const stampDir = resolve(flag('--stamps') ?? join(dirname(resolve(registryPath)), 'gates'));
const justfilePath = flag('--justfile') ?? join(root, 'Justfile');
const stampGate = flag('--stamp');
const stampArgs = (flag('--args') ?? '').trim();
const strict = has('--gate');
const staleOnly = has('--check');
const auditOnly = has('--audit');

// ---------------------------------------------------------------------------- the registry

const registry = readYaml(registryPath);
const gates = registry?.gates;
if (!Array.isArray(gates) || gates.length === 0) {
  console.error(`gates-fresh: ${registryPath} declares no gates`);
  process.exit(2);
}
for (const g of gates) {
  if (!g?.name || !g?.command || !Array.isArray(g?.reads) || g.reads.length === 0) {
    console.error(
      `gates-fresh: ${registryPath}: every gate needs a name, a command and a non-empty reads list ` +
      `(offender: ${JSON.stringify(g?.name ?? g)})`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------- input sets

/** Build outputs and dependency trees are never a gate's INPUT, whatever a declared directory holds. */
const SKIP_DIRS = new Set(['node_modules', 'bin', 'obj', '.git', '.turbo', 'TestResults']);

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

/** A `reads:` glob (`a/**` + `/*.cs`) as an anchored regexp over repo-relative paths. */
function globToRegExp(glob) {
  const DOUBLE = '\u0000';
  const body = glob
    .split('/')
    .map((seg) => (seg === '**' ? DOUBLE : seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')))
    .join('/')
    .split(`${DOUBLE}/`).join('(?:.*/)?')
    .split(`/${DOUBLE}`).join('(?:/.*)?')
    .split(DOUBLE).join('.*');
  return new RegExp(`^${body}$`);
}

/**
 * One `reads:` entry -> the files it names. A leading `?` marks it OPTIONAL: a waiver config or a
 * sidecar that need not exist yet, but whose LATER APPEARANCE must still make the gate stale.
 */
function expand(entry) {
  const optional = entry.startsWith('?');
  const pattern = optional ? entry.slice(1) : entry;
  const star = pattern.indexOf('*');
  if (star < 0) {
    const abs = join(root, pattern);
    if (!existsSync(abs)) return { optional, pattern, files: [] };
    return { optional, pattern, files: statSync(abs).isDirectory() ? [...walk(abs)] : [abs] };
  }
  const base = pattern.slice(0, star).replace(/\/[^/]*$/, '');
  const absBase = join(root, base);
  if (!existsSync(absBase)) return { optional, pattern, files: [] };
  const re = globToRegExp(pattern);
  return { optional, pattern, files: [...walk(absBase)].filter((f) => re.test(relative(root, f))) };
}

/**
 * The input set of one gate: every file it reads, once, sorted. An OPTIONAL input that is not there
 * needs no marker in the digest — when it appears it joins the file list, and the digest moves.
 */
function inputsOf(gate) {
  const files = new Map();
  const absent = [];
  const empty = [];
  for (const entry of gate.reads) {
    const { optional, pattern, files: found } = expand(entry);
    if (found.length === 0) (optional ? absent : empty).push(pattern);
    for (const f of found) files.set(relative(root, f), f);
  }
  const paths = [...files.keys()].sort();
  const h = createHash('sha256');
  for (const p of paths)
    h.update(`${p} ${createHash('sha256').update(readFileSync(files.get(p))).digest('hex')}\n`);
  return { paths, absent: absent.sort(), empty, digest: h.digest('hex').slice(0, 16), abs: files };
}

// ---------------------------------------------------------------------------- [R1]-[R4]

const recipeOf = (command) => {
  const m = /^just\s+([A-Za-z0-9_-]+)/.exec(command.trim());
  return m ? m[1] : null;
};

/** Recipe name -> its body, read from the Justfile itself: a gate's evidence is written by its recipe. */
function readRecipes() {
  if (!existsSync(justfilePath)) return null;
  const recipes = new Map();
  let current = null;
  for (const line of readFileSync(justfilePath, 'utf-8').split('\n')) {
    if (/^\s/.test(line) || line.trim() === '') {
      if (current && line.trim() !== '') recipes.get(current).push(line);
      continue;
    }
    const head = /^([a-zA-Z0-9_-]+)(\s+[^:\n]*)?:/.exec(line);
    current = head ? head[1] : null;
    if (current && !recipes.has(current)) recipes.set(current, []);
  }
  return new Map([...recipes].map(([k, v]) => [k, v.join('\n')]));
}

const recipes = readRecipes();
const registryProblems = [];
const inputs = new Map();

for (const gate of gates) {
  const set = inputsOf(gate);
  inputs.set(gate.name, set);
  for (const p of set.empty)
    registryProblems.push(
      `[R1] ${gate.name}: declared input \`${p}\` matches no file — an input set that resolves to ` +
      `nothing digests the same forever, so the gate would report FRESH and could never go stale (#641's shape)`);
  if (set.paths.length === 0)
    registryProblems.push(`[R1] ${gate.name}: the whole input set is empty — this check would be reporting on nothing`);
}

if (recipes === null) {
  registryProblems.push(
    `[R2] no Justfile at ${relative(root, justfilePath) || justfilePath} — the recipe a gate's command names cannot be checked`);
} else {
  for (const gate of gates) {
    const recipe = recipeOf(gate.command);
    if (!recipe) {
      registryProblems.push(`[R2] ${gate.name}: command \`${gate.command}\` does not name a \`just\` recipe`);
      continue;
    }
    if (!recipes.has(recipe)) {
      registryProblems.push(
        `[R2] ${gate.name}: \`${gate.command}\` names no recipe in the Justfile — the gate cannot be run as declared`);
      continue;
    }
    if (!new RegExp(`gate-stamp\\s+${gate.name}\\b`).test(recipes.get(recipe)))
      registryProblems.push(
        `[R3] ${gate.name}: the \`${recipe}\` recipe never runs \`just gate-stamp ${gate.name}\` — a green run ` +
        `would leave no record, which is the hole this check exists to close (#659)`);
  }
  const declared = new Set(gates.map((g) => g.name));
  for (const [name, body] of recipes) {
    for (const m of body.matchAll(/gate-stamp\s+([A-Za-z0-9_-]+)/g)) {
      if (!declared.has(m[1]))
        registryProblems.push(
          `[R4] the \`${name}\` recipe stamps \`${m[1]}\`, which ${relative(root, resolve(registryPath))} does not ` +
          `declare — the report would be silent about a gate that runs`);
    }
  }
}

if (registryProblems.length) {
  for (const p of registryProblems) console.error(`gates-fresh: ${p}`);
  console.error(
    `\n${registryProblems.length} registry problem(s). A freshness report over a registry that does not describe ` +
    `the gates is worth nothing; fix the registry or the Justfile first.`);
  process.exit(2);
}

// ---------------------------------------------------------------------------- --stamp

const stampPath = (name) => join(stampDir, `${name}.lastrun.json`);

if (stampGate) {
  const gate = gates.find((g) => g.name === stampGate);
  if (!gate) {
    console.error(
      `gates-fresh: --stamp ${stampGate}: no such gate in ${registryPath}. ` +
      `Declared: ${gates.map((g) => g.name).join(', ')}`);
    process.exit(2);
  }
  const set = inputs.get(gate.name);
  mkdirSync(stampDir, { recursive: true });
  const record = {
    gate: gate.name,
    command: gate.command,
    at: new Date().toISOString(),
    ...(stampArgs ? { args: stampArgs } : {}),
    inputs: { count: set.paths.length, digest: set.digest, reads: gate.reads },
  };
  // #973: a re-run over an unchanged input set writes NOTHING. The digest is the authority; a
  // stamp diff that moves only `at` is noise a committer would have to recognize and restore —
  // a discipline that survived only in session briefings until it kept being missed. Prevent
  // the diff instead of policing it: the stamp file only changes when its answer does.
  if (existsSync(stampPath(gate.name))) {
    let prev;
    try { prev = JSON.parse(readFileSync(stampPath(gate.name), 'utf-8')); } catch { prev = null; }
    if (prev &&
        prev.command === record.command &&
        (prev.args ?? '') === (record.args ?? '') &&
        prev.inputs?.count === record.inputs.count &&
        prev.inputs?.digest === record.inputs.digest &&
        JSON.stringify(prev.inputs?.reads) === JSON.stringify(record.inputs.reads)) {
      console.log(
        `gates-fresh: ${gate.name} already recorded green over this input set ` +
        `(digest ${set.digest}, ran ${prev.at}) — stamp left untouched (#973)`);
      process.exit(0);
    }
  }
  writeFileSync(stampPath(gate.name), `${JSON.stringify(record, null, 2)}\n`);
  console.log(
    `gates-fresh: recorded ${gate.name} green over ${set.paths.length} input(s) (digest ${set.digest}) ` +
    `in ${relative(root, stampPath(gate.name))}`);
  process.exit(0);
}

if (auditOnly) {
  console.log(
    `gates-fresh: registry OK — ${gates.length} gate(s), each naming a \`just\` recipe that stamps itself, over a ` +
    `non-empty input set (${gates.map((g) => `${g.name} ${inputs.get(g.name).paths.length}`).join(', ')} file(s)).`);
  process.exit(0);
}

// ---------------------------------------------------------------------------- the report

const now = Date.now();
const ago = (iso) => {
  const h = (now - Date.parse(iso)) / 3_600_000;
  if (!Number.isFinite(h)) return 'unknown';
  if (h < 1) return `${Math.max(0, Math.round(h * 60))}m ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

const rows = gates.map((gate) => {
  const set = inputs.get(gate.name);
  const path = stampPath(gate.name);
  if (!existsSync(path))
    return {
      gate, set, state: 'NEVER-RUN',
      why: `no run recorded — nothing has ever completed \`${gate.command}\` green`,
    };
  let stamp;
  try {
    stamp = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return { gate, set, state: 'NEVER-RUN', why: `${relative(root, path)} is not readable as a run record` };
  }
  if (JSON.stringify(stamp.inputs?.reads ?? []) !== JSON.stringify(gate.reads))
    return {
      gate, set, stamp, state: 'STALE',
      why: 'the declared input set changed since that run — it answered a different question',
    };
  if (stamp.inputs?.digest !== set.digest)
    return {
      gate, set, stamp, state: 'STALE',
      why: `inputs changed since that run (${stamp.inputs?.count ?? '?'} → ${set.paths.length} file(s), ` +
        `digest ${stamp.inputs?.digest ?? '?'} → ${set.digest})`,
    };
  return { gate, set, stamp, state: 'FRESH', why: null };
});

/** A hint only — mtime, not the authority: files touched since the recorded run. */
function touchedSince(row, limit = 6) {
  if (!row.stamp?.at) return [];
  const t = Date.parse(row.stamp.at);
  const hits = [];
  for (const [rel_, abs] of row.set.abs) {
    try {
      if (statSync(abs).mtimeMs > t) hits.push(rel_);
    } catch { /* raced with a concurrent session */ }
    if (hits.length > limit) break;
  }
  return hits;
}

const width = Math.max(...gates.map((g) => g.name.length));
const pad = ' '.repeat(9 + width + 3);
console.log(`gates-fresh: ${gates.length} gate(s) declared by ${relative(root, resolve(registryPath))}\n`);
for (const row of rows) {
  const when = row.stamp?.at ? `ran ${row.stamp.at} (${ago(row.stamp.at)})` : 'never run';
  console.log(`  ${row.state.padEnd(9)} ${row.gate.name.padEnd(width)}  ${String(row.set.paths.length).padStart(4)} inputs · ${when}`);
  console.log(`${pad}${row.gate.command}${row.stamp?.args ? `   (ran with: ${row.stamp.args})` : ''}`);
  if (row.why) console.log(`${pad}${row.why}`);
  if (row.state === 'STALE') {
    const touched = touchedSince(row);
    if (touched.length)
      console.log(
        `${pad}modified since (mtime — a hint; the digest is the authority): ` +
        `${touched.slice(0, 6).join(', ')}${touched.length > 6 ? ', …' : ''}`);
  }
  if (row.set.absent.length) console.log(`${pad}optional input(s) not present: ${row.set.absent.join(', ')}`);
}

const count = (s) => rows.filter((r) => r.state === s).length;
const notFresh = rows.filter((r) => r.state !== 'FRESH');
console.log(`\n${count('FRESH')} FRESH · ${count('STALE')} STALE · ${count('NEVER-RUN')} NEVER-RUN.`);

if (notFresh.length)
  console.log(
    `\nA STALE or NEVER-RUN gate is not the same thing as a RED gate — it is a gate whose last answer does not\n` +
    `cover the tree as it now stands, so quoting that answer at a stage exit certifies artifacts it never read\n` +
    `(#659). Run each of:\n${notFresh.map((r) => `    ${r.gate.command}`).join('\n')}`);

if (strict && notFresh.length) {
  console.error(`\ngates-fresh: ${notFresh.length} of ${rows.length} gate(s) are not fresh — this stage does not exit over them.`);
  process.exit(1);
}

// --check (#973): only a stamp that CLAIMS a green it no longer covers fails here. NEVER-RUN is
// an honest absence — visible above, refused at stage exits by --gate — not a lie to go red on.
const stale = rows.filter((r) => r.state === 'STALE');
if (staleOnly && stale.length) {
  console.error(
    `\ngates-fresh: ${stale.length} committed stamp(s) claim a green over inputs that have since changed ` +
    `(#973). Re-run the named gate(s) as part of the change that moved their inputs.`);
  process.exit(1);
}
process.exit(0);
