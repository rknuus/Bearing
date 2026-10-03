#!/usr/bin/env node
/**
 * coverage-inverted-check — ADR-033 §6's INVERTED STRUCTURAL CHECK, built at last.
 *
 *   node coverage-inverted-check.mjs --coverage <report.xml|dir> --csharp <project>/csharp
 *                                    [--component <path fragment>] [--out <report.md>]
 *
 * WHAT ADR-033 §6 ASKS FOR, and this tool does that and nothing else:
 *
 *   "Inverted structural check: after a full spec run (visible + hidden + generated), production
 *    code still uncovered is code no specified behavior demands. It has two readings and a human
 *    tells them apart: either the suite is short — the uncovered line hints at a potentially
 *    missing spec test — or the code is long — dead code, gold-plating, or an invented special
 *    case; delete or justify. Neither reading is a rule and neither is a hard gate: both inform
 *    the reviewer."
 *
 * The section was written on 2026-07-16 and NO TOOL RAN IT until the Software Architect's ruling
 * of 2026-09-18 (relay R-479) made coverage mandatory to RUN. That ruling is the occasion for this
 * file; it is not a widening of the rule.
 *
 * THE ONE FENCE, AND IT IS THE REASON TO READ THIS COMMENT BEFORE EDITING THE FILE.
 * THIS CHECK READS NO PERCENTAGE AND FAILS ON NO PERCENTAGE. It prints none, it compares none, it
 * takes no threshold flag, and it has no --min, no --fail-under and no --target. His words:
 *
 *   "I'd make «code coverage» mandatory - but not gate it as a «must reach 100%» - but «MUST be
 *    run» (and be handed over to reviewer agent)"
 *
 * and, on the two readings:
 *
 *   "Both are not hard gates for a script (i.e. if red then don't proceed) - but they inform the
 *    reviewer."
 *
 * So a script CANNOT decide which reading applies to a line, and this one does not try. It locates
 * uncovered production code and hands the list to a human. Every coverage tool on earth ships a
 * threshold option and turning it on feels like doing the job properly; that is exactly why this
 * paragraph is at the top of the file. Adding one changes his ruling.
 *
 * HOW IT FAILS — on an invocation it cannot honour, never on what it found:
 *
 *   exit 0   it ran. Uncovered lines were listed, or there were none. THE COUNT NEVER CHANGES THE
 *            EXIT CODE.
 *   exit 2   it could not run: no --coverage, no report at that path, a report it cannot parse, or
 *            a report whose classes resolve to no production file under --csharp (an invocation
 *            aimed at the wrong tree, the failure mode `resource-protocol --csharp .` is famous
 *            for). "I looked in the wrong place" must never read as "the code is clean".
 *
 * THE REPORT IS THE PRODUCT. Its receiver is a reviewer agent. Which agent is the RUN'S PROPOSAL
 * and not a ruling of the Software Architect (OI-1907): he wrote "reviewer agent", singular, and
 * did not say which. The run proposes the craft reviewer, who already owns dead code, with the
 * missing-spec-test reading handed on to the test engineer, who owns the spec layer.
 *
 * INPUT FORMAT: Cobertura XML — what `dotnet test --collect:"XPlat Code Coverage"` (coverlet)
 * writes by default, and what every other .NET collector can emit. A directory argument is walked
 * for `*.cobertura.xml`, and several reports merge: a line is covered if ANY report covers it,
 * which is the whole point of the "visible + hidden + generated" run the ADR names.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

const TOOL = 'coverage-inverted-check';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const die = (msg) => { console.error(`${TOOL}: ${msg}`); process.exit(2); };

for (const a of args) {
  if (/^--(min|minimum|threshold|fail-under|target|require-coverage)(=|$)/.test(a)) {
    die(`${a} is a coverage THRESHOLD. This check has none and never will — ADR-033 §6: coverage `
      + `is instrumentation, never a gate or target (SA ruling, relay R-479).`);
  }
}

const coverageArg = flag('--coverage');
const csharpArg = flag('--csharp');
const componentArg = flag('--component');
const outArg = flag('--out');

if (!coverageArg || !csharpArg) {
  console.error(`usage: ${TOOL} --coverage <report.xml|dir> --csharp <dir> [--component <fragment>] [--out <report.md>]`);
  process.exit(2);
}
if (!existsSync(coverageArg)) die(`no coverage report at ${coverageArg} — the spec run writes one when the collector is wired in`);
if (!existsSync(csharpArg)) die(`no production tree at ${csharpArg}`);

const csharpRoot = resolve(csharpArg);
const cwd = process.cwd();
const rel = (p) => (isAbsolute(p) ? relative(cwd, p) : p);

/* ------------------------------------------------------------------ report discovery */

const reportFiles = [];
const walk = (dir, depth = 0) => {
  if (depth > 8) return;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, depth + 1);
    else if (/\.cobertura\.xml$/i.test(entry) || entry.toLowerCase() === 'coverage.xml') reportFiles.push(p);
  }
};
if (statSync(coverageArg).isDirectory()) walk(resolve(coverageArg));
else reportFiles.push(resolve(coverageArg));

if (reportFiles.length === 0) {
  die(`no Cobertura report under ${rel(resolve(coverageArg))} — looked for *.cobertura.xml and coverage.xml`);
}

/* ------------------------------------------------------------------ Cobertura parsing
 *
 * Deliberately a small scanner over the document rather than an XML dependency: the skill bins
 * carry no package.json and a checker that cannot run without `npm install` does not run.
 * Cobertura is a flat, attribute-only format — <sources>, <class filename=…>, <method name=…>,
 * <line number=… hits=…/> — so a scanner reads all of it that this check needs.
 */

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : undefined;
};

/** filename -> Map(lineNumber -> {hits, method}) */
const lines = new Map();
const sourceRoots = new Set();
let sawClass = false;

for (const file of reportFiles) {
  const xml = readFileSync(file, 'utf8');
  if (!/<coverage[\s>]/.test(xml)) die(`${rel(file)} is not a Cobertura report (no <coverage> element)`);

  for (const m of xml.matchAll(/<source>([^<]*)<\/source>/g)) {
    const s = m[1].trim();
    if (s) sourceRoots.add(s);
  }

  let currentFile = null;
  let currentMethod = null;
  for (const m of xml.matchAll(/<(class|method|line)\b([^>]*)>/g)) {
    const kind = m[1];
    const tag = m[0];
    if (kind === 'class') {
      sawClass = true;
      currentFile = attr(tag, 'filename') ?? null;
      currentMethod = null;
    } else if (kind === 'method') {
      currentMethod = attr(tag, 'name') ?? null;
    } else if (kind === 'line' && currentFile) {
      const number = Number(attr(tag, 'number'));
      const hits = Number(attr(tag, 'hits') ?? '0');
      if (!Number.isFinite(number)) continue;
      if (!lines.has(currentFile)) lines.set(currentFile, new Map());
      const perFile = lines.get(currentFile);
      const prev = perFile.get(number);
      // Several reports MERGE: covered anywhere is covered. A method name from any report wins.
      perFile.set(number, {
        hits: Math.max(hits, prev?.hits ?? 0),
        method: prev?.method ?? currentMethod ?? null,
      });
    }
  }
}

if (!sawClass) die(`${reportFiles.map(rel).join(', ')} carries no <class> element — an empty or truncated report`);

/* ------------------------------------------------------------------ production filter */

const NOT_PRODUCTION = [
  `${sep}obj${sep}`, `${sep}bin${sep}`,
  `${sep}Spec${sep}`, `.Spec${sep}`, `${sep}Simulators${sep}`, `${sep}Tests${sep}`, `.Tests${sep}`,
];
const GENERATED = [/\.g\.cs$/i, /\.generated\.cs$/i, /\.designer\.cs$/i, new RegExp(`\\${sep}Generated\\${sep}`, 'i')];

const resolveToTree = (filename) => {
  const candidates = [];
  if (isAbsolute(filename)) candidates.push(filename);
  for (const root of sourceRoots) candidates.push(resolve(root, filename));
  candidates.push(resolve(cwd, filename));
  for (const c of candidates) {
    const norm = resolve(c);
    if (norm.startsWith(csharpRoot + sep) || norm === csharpRoot) return norm;
  }
  return null;
};

let classesSeen = 0;
let classesUnderTree = 0;
let classesInComponent = 0;
const uncoveredByFile = new Map();   // absolute path -> [{line, method}]
let coveredProductionLines = 0;

for (const [filename, perFile] of lines) {
  classesSeen += 1;
  const abs = resolveToTree(filename);
  if (!abs) continue;
  classesUnderTree += 1;
  const relPath = relative(cwd, abs);
  if (NOT_PRODUCTION.some((frag) => (sep + relPath).includes(frag))) continue;
  if (GENERATED.some((re) => re.test(relPath))) continue;
  if (componentArg && !relPath.includes(componentArg)) continue;
  classesInComponent += 1;

  for (const [number, { hits, method }] of [...perFile].sort((a, b) => a[0] - b[0])) {
    if (hits > 0) { coveredProductionLines += 1; continue; }
    if (!uncoveredByFile.has(abs)) uncoveredByFile.set(abs, []);
    uncoveredByFile.get(abs).push({ line: number, method });
  }
}

if (componentArg && classesInComponent === 0 && classesUnderTree > 0) {
  die(`--component ${componentArg} matches no measured production file under ${rel(csharpRoot)} — `
    + `the filter excluded everything the report measured. Refusing to report "nothing uncovered" `
    + `over a component this report never saw.`);
}

if (classesUnderTree === 0) {
  die(`the report names ${classesSeen} source file(s) and NONE of them is under ${rel(csharpRoot)} — `
    + `the invocation is aimed at the wrong tree, or the collector ran over a different checkout. `
    + `Refusing to report "nothing uncovered" over a tree this report never measured.`);
}

/* ------------------------------------------------------------------ the report */

const sourceLine = (abs, n) => {
  try { return (readFileSync(abs, 'utf8').split('\n')[n - 1] ?? '').trim(); } catch { return ''; }
};

const out = [];
const say = (s = '') => out.push(s);

say(`# Inverted structural check — uncovered production code (ADR-033 §6)`);
say();
say(`Report(s): ${reportFiles.map(rel).join(', ')}`);
say(`Production tree: ${rel(csharpRoot)}${componentArg ? `  (filtered to \`${componentArg}\`)` : ''}`);
say();
say(`**This is an ADVISORY. It judges nothing and it fails on nothing it found.** Every line below`);
say(`has TWO readings and a human tells them apart (SA ruling, relay R-479, 2026-09-18):`);
say();
say(`- **the suite may be short** — the line hints at a POTENTIALLY MISSING SPEC TEST. That is the`);
say(`  test engineer's, who owns the spec layer;`);
say(`- **the code may be long** — dead code, gold-plating, an invented special case; delete or`);
say(`  justify. That is the craft reviewer's, whose charter already carries dead code.`);
say();
say(`It may also be neither. An uncovered line is a hint, not evidence — read the line.`);
say();
say(`No percentage appears in this report, by rule: coverage is instrumentation, never a gate or a`);
say(`target, and no percentage-coverage threshold exists anywhere in the gate (ADR-033 §6).`);
say();

const totalUncovered = [...uncoveredByFile.values()].reduce((n, xs) => n + xs.length, 0);

if (totalUncovered === 0) {
  say(`**No uncovered production line.** Every production line this report measured was executed by`);
  say(`the run that produced it. Nothing is owed to a reviewer.`);
} else {
  const files = [...uncoveredByFile.keys()].sort();
  say(`Uncovered production lines: **${totalUncovered}**, over ${files.length} file(s).`);
  say();
  for (const abs of files) {
    say(`## ${relative(cwd, abs)}`);
    say();
    // Group consecutive uncovered lines of one method into a run — a reviewer reads a block, not
    // a scatter of numbers.
    const entries = uncoveredByFile.get(abs);
    let run = null;
    const flushRun = () => {
      if (!run) return;
      const where = run.method ? `  \`${run.method}\`` : '';
      const range = run.from === run.to ? `${run.from}` : `${run.from}-${run.to}`;
      say(`- **${relative(cwd, abs)}:${range}**${where}`);
      say(`  \`\`\``);
      for (let n = run.from; n <= Math.min(run.to, run.from + 9); n += 1) say(`  ${n}: ${sourceLine(abs, n)}`);
      if (run.to > run.from + 9) say(`  … ${run.to - run.from - 9} more line(s)`);
      say(`  \`\`\``);
      run = null;
    };
    for (const { line, method } of entries) {
      if (run && line === run.to + 1 && method === run.method) { run.to = line; continue; }
      flushRun();
      run = { from: line, to: line, method };
    }
    flushRun();
    say();
  }
}

const text = out.join('\n') + '\n';
if (outArg) {
  writeFileSync(outArg, text);
  console.log(`${TOOL}: wrote ${rel(resolve(outArg))}`);
}
console.log(text);
console.log(`${TOOL}: OK — ran over ${classesUnderTree} measured production source file(s) from `
  + `${reportFiles.length} report(s); ${totalUncovered} uncovered production line(s) reported to a `
  + `human, ${coveredProductionLines} covered. This check fails on no number and has passed.`);
process.exit(0);
