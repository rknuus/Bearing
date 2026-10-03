#!/usr/bin/env node
/**
 * store-seam-check (#798, #593) — the store-seam DESIGN DOC and the landed seam must state the
 * same interface.
 *
 *   node store-seam-check.mjs --deployment <deployment-dir> --csharp <project>/csharp
 *
 * The failure this exists to make impossible (#798): `02_Store-Seam-Interfaces.md` §1 is the design
 * statement of `ISalesStore`, and it is what a dispatched implementor is pointed at when the seam
 * has to change. It had drifted from `Component/Access/Sales/Resource/ISalesStore.cs` on five
 * points — the namespace (the #505 relocation, which the same document records two sections
 * earlier), two `idempotencyKey` parameters the #462 correction removed, and two operations added
 * later (`GetOrdersForDay`, `GetOpenTabs`) — for months, across two runs. #593 had already
 * reported three of the five and nothing enforced the reconciliation. A design doc that describes
 * an interface the code no longer has is a source of invented work.
 *
 * Nothing was aimed at it: `deployment-view-check` compares the deployment yaml against the
 * deployment markdown, `construction-entry-check` [S3] asks only whether a SECTION EXISTS for each seam,
 * and the C# build never reads a fenced code block. This check reads both sides:
 *
 *   [D1] every ```csharp fence in the doc that declares `public interface I<X>Store` is matched to
 *        the ONE file that declares it under --csharp (the seam is single-definition by design,
 *        #505 — which is what makes the comparison possible at all);
 *   [D2] the fence's `namespace` is the file's namespace;
 *   [D3] the fence's members and the interface's members are the same set, signature for
 *        signature — parameters and return types included;
 *   [D4] the fence's `public sealed record *Row` declarations and the records the seam's namespace
 *        actually declares are the same set, parameter list for parameter list (defaults
 *        included — a trailing default is what lets a seed row stay silent about a field);
 *   [D5] the idempotency table's class-(b) rows and the seam methods that take a
 *        `Guid idempotencyKey` are the same set — the drift #798 found at the end of the document,
 *        where two writes were still classed as needing a synthetic key after the code stopped
 *        taking one. Its heading may be numbered (`## 7. Idempotency classes …`); a seam that
 *        declares no `Guid idempotencyKey` parameter on ANY operation is reported NOT COMPARABLE
 *        rather than failed, because the parameter comparison decides nothing about it
 *        (figaro#363 §2). A MISSING section is still a failure, and a seam that takes keys
 *        elsewhere but not on the classed operation is still a failure.
 *
 * The CODE IS THE TRUTH in every disagreement (both #593 and #798 ruled it so): the fix is to
 * re-state the document, never to bend the seam to the prose. The prose AROUND the fences — why
 * PostgreSQL, what a null carried rate card means, which rung of ADR-048 §2 a write takes — is the
 * document's own business and is not read here.
 *
 * Sibling of `deployment-view-check` (the same directory's yaml and markdown state the same facts)
 * and `composition-map-check` (the wiring grows with the model).
 *
 * Exit: 0 agree · 1 drift · 2 usage.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ---------------------------------------------------------------------------- arguments

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const deploymentDir = flag('--deployment');
const csharpDir = flag('--csharp');
if (!deploymentDir || !csharpDir) {
  console.error('store-seam-check: --deployment <dir> --csharp <dir> are both required');
  process.exit(2);
}
const docPath = join(deploymentDir, '02_Store-Seam-Interfaces.md');
for (const p of [docPath, csharpDir]) {
  if (!existsSync(p)) { console.error(`store-seam-check: missing ${p}`); process.exit(2); }
}
const rel = (p) => relative(process.cwd(), p);

// ---------------------------------------------------------------------------- C# reading

/** Comments carry the WHY on both sides and are never the same text; the declaration is. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/** One declaration, whitespace-normalised, so a re-wrapped parameter list is not a difference. */
const normalise = (decl) => decl
  .replace(/\s+/g, ' ')
  .replace(/\s*([(),])\s*/g, '$1')
  .replace(/,/g, ', ')
  .replace(/\s*<\s*/g, '<')
  .replace(/\s+>/g, '>')   // inside a generic only — `IReadOnlyList<string> tables` keeps its space
  .trim();

/** The identifier a `(`-terminated declaration declares: scan back from the closing paren. */
const declaredName = (decl) => {
  let depth = 0;
  for (let i = decl.length - 1; i >= 0; i--) {
    if (decl[i] === ')') depth++;
    else if (decl[i] === '(') {
      depth--;
      if (depth === 0) return (decl.slice(0, i).match(/(\w+)\s*$/) || [])[1];
    }
  }
  return undefined;
};

/** The body between the braces that follow `index`, or undefined when they never close. */
const bracedBody = (src, index) => {
  const open = src.indexOf('{', index);
  if (open < 0) return undefined;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open + 1, i);
  }
  return undefined;
};

/** Statements of an interface body: split on the `;` that are not inside parentheses/generics. */
const statements = (body) => {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '(' || c === '<') depth++;
    else if (c === ')' || c === '>') depth--;
    else if (c === ';' && depth <= 0) { out.push(body.slice(start, i)); start = i + 1; }
  }
  return out.map((s) => s.trim()).filter(Boolean);
};

/** Every `public sealed record X(…)` in a source, as `{ name, decl }`. */
const records = (src) => {
  const out = [];
  for (const m of src.matchAll(/public\s+(?:sealed\s+)?record\s+\w+\s*\(/g)) {
    let depth = 0;
    for (let i = m.index; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')' && --depth === 0) {
        const decl = normalise(src.slice(m.index, i + 1)).replace(/^public (?:sealed )?record /, 'record ');
        out.push({ name: declaredName(decl), decl });
        break;
      }
    }
  }
  return out;
};

const csFiles = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'bin' || entry === 'obj' || entry === 'node_modules') continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...csFiles(p));
    else if (entry.endsWith('.cs')) out.push(p);
  }
  return out;
};

const sources = csFiles(csharpDir).map((path) => {
  const src = stripComments(readFileSync(path, 'utf-8'));
  return { path, src, namespace: (src.match(/^\s*namespace\s+([\w.]+)\s*;/m) || [])[1] };
});

// ---------------------------------------------------------------------------- the document

const doc = readFileSync(docPath, 'utf-8');
const fences = [...doc.matchAll(/```csharp\n([\s\S]*?)```/g)]
  .map((m) => ({ body: m[1], line: doc.slice(0, m.index).split('\n').length }))
  .filter((f) => /public\s+interface\s+I\w*Store\b/.test(f.body));

const problems = [];
const at = (f) => `${rel(docPath)}:${f.line}`;

if (fences.length === 0)
  problems.push(`${rel(docPath)}: no \`\`\`csharp fence declares a \`public interface I…Store\` — the seam statements the check compares are not there, and a check over nothing is a failure, not a pass`);

const seams = [];
for (const fence of fences) {
  const src = stripComments(fence.body);
  const name = (src.match(/public\s+interface\s+(I\w*Store)\b/) || [])[1];
  const docNamespace = (src.match(/^\s*namespace\s+([\w.]+)\s*;/m) || [])[1];

  // [D1] the one file that declares it
  const declaring = sources.filter((s) => new RegExp(`public\\s+interface\\s+${name}\\b`).test(s.src));
  if (declaring.length === 0) {
    problems.push(`${at(fence)}: \`${name}\` is designed here and declared by no file under ${rel(csharpDir)} — either the seam was never built or the document names an interface that does not exist`);
    continue;
  }
  if (declaring.length > 1) {
    problems.push(`${at(fence)}: \`${name}\` is declared by ${declaring.length} files (${declaring.map((d) => rel(d.path)).join(', ')}) — the seam is single-definition by design (#505); the document cannot be checked against two`);
    continue;
  }
  const file = declaring[0];
  seams.push({ name, file, fence });

  // [D2] namespace
  if (!docNamespace)
    problems.push(`${at(fence)}: the \`${name}\` fence declares no namespace; ${rel(file.path)} says \`${file.namespace}\``);
  else if (docNamespace !== file.namespace)
    problems.push(`${name}: namespace — the document says \`${docNamespace}\`, ${rel(file.path)} says \`${file.namespace}\``);

  // [D3] members
  const memberSet = (body, where) => {
    const map = new Map();
    for (const s of statements(body ?? '')) {
      const decl = normalise(s);
      const member = declaredName(decl);
      if (!member) { problems.push(`${where}: cannot read the declaration \`${decl}\` as a seam operation`); continue; }
      if (map.has(member)) problems.push(`${where}: \`${member}\` is declared twice — this check keys operations by name and cannot compare overloads`);
      map.set(member, decl);
    }
    return map;
  };
  const docMembers = memberSet(bracedBody(src, src.indexOf(`interface ${name}`)), at(fence));
  const codeMembers = memberSet(bracedBody(file.src, file.src.indexOf(`interface ${name}`)), rel(file.path));

  for (const [member, decl] of docMembers) {
    if (!codeMembers.has(member))
      problems.push(`${name}.${member}: designed in the document, absent from ${rel(file.path)} — the code is the truth; delete it from the fence or take it down the resource-designer route`);
    else if (codeMembers.get(member) !== decl)
      problems.push(`${name}.${member}: signature — the document says \`${decl}\`, the seam declares \`${codeMembers.get(member)}\``);
  }
  for (const member of codeMembers.keys())
    if (!docMembers.has(member))
      problems.push(`${name}.${member}: declared by ${rel(file.path)}, missing from the document's fence — an operation an implementor reading the design would not know exists`);

  // [D4] the store rows, against every record the seam's own namespace declares
  const docRows = new Map(records(src).map((r) => [r.name, r.decl]));
  const codeRows = new Map();
  for (const s of sources.filter((s) => s.namespace === file.namespace))
    for (const r of records(s.src)) codeRows.set(r.name, r.decl);

  for (const [row, decl] of docRows) {
    if (!codeRows.has(row))
      problems.push(`${row}: designed in the \`${name}\` fence, declared by no file in \`${file.namespace}\``);
    else if (codeRows.get(row) !== decl)
      problems.push(`${row}: shape — the document says \`${decl}\`, \`${file.namespace}\` declares \`${codeRows.get(row)}\``);
  }
  for (const row of codeRows.keys())
    if (!docRows.has(row))
      problems.push(`${row}: declared by \`${file.namespace}\`, missing from the \`${name}\` fence — a store row the design statement does not carry`);
}

// [D5] the idempotency table against the seams' actual key parameters

// Rows read `| `AppendRefusal` (`StoreRefusal`) | Sales/PG | why |`, and the first cell may name
// two operations (`ClaimStock` / `ReleaseStock`) or an alias that is the CONTRACT operation's name
// rather than the seam method's. So: every backticked identifier in the first cell that is a seam
// method is a row's claim; a row whose first cell names no seam method at all is a row about an
// operation that no longer exists. A struck-through cell (`~~AppendBounce~~`) is the table
// RECORDING a key that was retired and makes no claim.
const seamMethods = new Map();
for (const seam of seams)
  for (const s of statements(bracedBody(seam.file.src, seam.file.src.indexOf(`interface ${seam.name}`)) ?? '')) {
    const decl = normalise(s);
    seamMethods.set(`${seam.name}.${declaredName(decl)}`, decl);
  }
const keyed = new Set([...seamMethods].filter(([, decl]) => /\bGuid idempotencyKey\b/.test(decl)).map(([k]) => k));

// A seam none of whose operations takes a `Guid idempotencyKey` is NOT COMPARABLE on this axis, not
// wrong. Such a seam carries its idempotency some other way — a request object with the key inside
// it, or a natural key — and the parameter-level comparison below then says nothing at all about
// the row. Reporting that as a class-(b) failure is a false red against a correct document
// (figaro#363 §2). It stays a FAILURE where the seam does take keys somewhere and not on this
// operation: that is the drift #798 was built for.
const keylessSeams = new Set(
  seams.filter((s) => ![...keyed].some((k) => k.startsWith(`${s.name}.`))).map((s) => s.name));
const notComparable = [];

// The heading is matched with an OPTIONAL section number: the document numbers its sections
// (`## 7. Idempotency classes (ADR-048 §2)`), and the un-numbered pattern this used to carry could
// never match one — a false red on a section that is right there, and it only became visible the
// day the first seam landed in code, because the branch below runs only when `seams.length > 0`
// (figaro#363 §2).
const sectionStart = doc.search(/^##\s+(?:\d+(?:\.\d+)*\.?\s+)?Idempotency/m);
const sectionEnd = sectionStart < 0 ? -1 : doc.slice(sectionStart + 1).search(/^##\s/m);
const section = sectionStart < 0 ? undefined
  : sectionEnd < 0 ? doc.slice(sectionStart) : doc.slice(sectionStart, sectionStart + 1 + sectionEnd);
if (seams.length && !section)
  problems.push(`${rel(docPath)}: no \`## Idempotency\` section — the table enumerating the seams' class-(b) writes is where a retired or a new \`idempotencyKey\` shows up, and it is not there`);

const sectionLine = section ? doc.slice(0, sectionStart).split('\n').length : 0;
const tableRows = !section ? [] : section.split('\n')
  .map((text, i) => ({ text, line: sectionLine + i }))
  .filter(({ text }) => /^\|/.test(text) && !/^\|[\s:|-]*\|$/.test(text))   // rows, not the separator
  .map(({ text, line }) => ({ cell: text.split('|')[1] ?? '', line }))
  .filter(({ cell }) => /`/.test(cell) && !/~~/.test(cell))
  .map(({ cell, line }) => ({
    line,
    named: [...cell.matchAll(/`(\w+)`/g)].map((m) => m[1]),
    ops: [...cell.matchAll(/`(\w+)`/g)].map((m) => m[1]).filter((op) => [...seamMethods.keys()].some((k) => k.endsWith(`.${op}`))),
  }));

if (seams.length && section && tableRows.length === 0)
  problems.push(`${rel(docPath)}: the idempotency table's class-(b) rows were not recognised — the check cannot compare them against the seams' key parameters, which is itself a failure`);

for (const row of tableRows) {
  if (row.ops.length === 0) {
    problems.push(`${rel(docPath)}:${row.line}: the idempotency table names ${row.named.map((n) => `\`${n}\``).join(' / ')} and no seam declares an operation of that name — the row outlived the operation`);
    continue;
  }
  for (const op of row.ops) {
    const matches = [...seamMethods.keys()].filter((k) => k.endsWith(`.${op}`));
    if (matches.some((k) => keyed.has(k))) continue;
    const declaring = [...new Set(matches.map((k) => k.slice(0, k.indexOf('.'))))];
    if (declaring.every((seam) => keylessSeams.has(seam))) {
      notComparable.push(`${rel(docPath)}:${row.line}: \`${op}\` is classed class-(b), and ${declaring.map((n) => `\`${n}\``).join(' / ')} declares no \`Guid idempotencyKey\` parameter on ANY operation — not comparable: this seam states its idempotency key some other way (inside a request object, or a natural key), so the parameter comparison decides nothing here. Read the row by hand`);
      continue;
    }
    problems.push(`${rel(docPath)}:${row.line}: the idempotency table classes \`${op}\` as needing a synthetic \`idempotencyKey\`; ${matches.join(', ')} takes none — either the seam dedups on a natural key now (strike the row through, as #462's two are) or the classification is stale`);
  }
}
for (const k of keyed)
  if (!tableRows.some((r) => r.ops.some((op) => k.endsWith(`.${op}`))))
    problems.push(`${rel(docPath)}: \`${k}\` takes a \`Guid idempotencyKey\` and the idempotency table does not list it — the table is where the seam's class-(b) writes are enumerated`);

// ---------------------------------------------------------------------------- verdict

for (const n of notComparable) console.error(`store-seam-check: NOT COMPARABLE — ${n}`);

if (problems.length) {
  for (const p of problems) console.error(`store-seam-check: ${p}`);
  console.error(`\n${problems.length} drift(s) between ${rel(docPath)} and the landed seams. The CODE is the truth (#593, #798): re-state the document. A seam that must genuinely change goes down the resource-designer route first (#689), and the document follows it.`);
  process.exit(1);
}
console.log(`store-seam-check: OK — ${seams.length} seam(s) (${seams.map((s) => s.name).join(', ')}); namespace, operations, store rows and the idempotency table all match what is declared under ${rel(csharpDir)}.${notComparable.length ? ` ${notComparable.length} idempotency row(s) not comparable — see above.` : ''}`);
