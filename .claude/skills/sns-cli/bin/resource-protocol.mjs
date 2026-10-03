#!/usr/bin/env node
/**
 * resource-protocol (#841, ADR-059; seam-keyed under ADR-065 #1090) — the Resource Protocol Sheet
 * skeleton generator — which REFUSES a slot whose kind and product the Software Architect has not
 * ruled (ADR-071 §2, #1246; the stamp lives in deployment-view/3) — and its staleness/completeness gate (format `resource-protocol/2`,
 * process-specs/resource-protocol-format.md).
 *
 *   node resource-protocol.mjs --skeleton --model <arch.json> --deployment <dir> --csharp <dir> [--ra <Name>] [--seam <ISeam>] [--require-source-walk [<Name>,…]]
 *   node resource-protocol.mjs --check    --model <arch.json> --deployment <dir> --csharp <dir> [--require-all] [--require-source-walk [<Name>,…]]
 *   node resource-protocol.mjs --schema   --deployment <dir> [--ra <Name>] [--seam <ISeam>]
 *
 * ONE SHEET PER SEAM, at `<deployment>/protocol/<Seam>.protocol.yaml` (ADR-065 decision 4). Until
 * 2026-08-28 it was one sheet per ResourceAccess, because the deployment view gave each Access one
 * resource. It no longer does: an Access declares a list of named SLOTS, one per resource in one
 * role, so it may own several seams and several slots may share one. Two loop variables follow
 * from that, and keeping them apart is most of this file's structure:
 *
 *   - the ACCESS answers "whose contract fields are these fates about", "which use cases reach
 *     here", and "which `Service/` sources answer a fault" — one manifest, one `raRoot`;
 *   - the SLOT carries the resourceKind that selects the shape vocabulary and the effect classes,
 *     and the SEAM says which operations exist and which sheet this is.
 *
 * Two consequences worth stating because they are easy to get wrong: fates completeness is checked
 * per ACCESS across all of that Access's sheets (a field may be durable in the store we own and a
 * selector against the customer's API — ADR-065 decision 11), and [P9]/[P10] union the declared
 * fault identities across an Access's sheets before comparing them to the one `Service/` scan
 * (#1091) — comparing one sheet at a time would turn correct code red the moment an Access owned
 * two seams. That one scan answers both directions: [P9] the identity the code answers and no
 * sheet declares, [P10] the identity a sheet declares and the (already constructed) code answers
 * nowhere (#1004).
 *
 * The sheet is a
 * HYBRID file (ADR-059): the row keys are GENERATED from the const model and the seam interface —
 * fates rows (dto, field), operations rows (op), allow rows (useCase, name) — and everything the
 * human reviews at Contract is AUTHORED: the resource shape, every fate, every roundTrip pair, every
 * effect class, every allowlist, the answerable `faults` (#999, wholly authored), every note. `--skeleton` (re)generates the generated half and
 * PRESERVES the authored half; `--check` regenerates it in memory and fails on any disagreement,
 * so the sheet can be wrong only loudly, never silently stale — the same pattern as
 * `seqmap complete` and `call-chains-check`.
 *
 * Inputs (issue #841):
 *   --model       ReadArchitecture JSON (envelope or bare payload), same feed as `seqmap complete`.
 *                 Supplies the system name, the component catalog, and use-case reachability from
 *                 `useCases[].permutations[].sequenceSteps[].calleeComponentName` (ADR-036: the
 *                 model's chains end at the RA, so the list exists).
 *   --deployment  the directory holding `deployment-view.yaml` (ADR-048 §5) — the sheet's
 *                 kind/product vocabulary is keyed by its `resourceKind` — and
 *                 `02_Store-Seam-Interfaces.md`, the Stage-C design statement of each seam.
 *   --csharp      the project's C# root, read for two generated/designed artifacts:
 *                 (1) the RA's `.methodcontract` manifest — the generated projection of the const
 *                 model that carries the OWNED CONTRACT DTOS AND FIELDS, nested row/card DTOs
 *                 included, under the `Facet.Dto` keys this sheet's rows are keyed by. It is read
 *                 here because it is exactly the contract surface the spec runner's derived
 *                 round-trip will build against (#842), so sheet and enforcement read one
 *                 universe. (Until #888 it was also the ONLY place the nested row/card DTOs could
 *                 be seen at all — ReadArchitecture's `dtos` omitted every DTO reached only
 *                 through a field, e.g. an OrderRecord's line records. That is fixed: the read now
 *                 carries the transitive field-reachable closure, so the #842 reason is the one
 *                 that still stands, and repointing this tool at the model read is a decision about
 *                 which universe sheet and enforcement share — not a workaround to retire.) The
 *                 resource-designer pass therefore runs AFTER contracts are
 *                 generated — the tool refuses to derive a fates universe it cannot see whole.
 *                 (2) the seam interface declaration, from CODE when it exists (the code is the
 *                 truth — #593/#798 rulings, enforced by `store-seam-check`), and from the seam
 *                 document's ```csharp fence before construction has landed it.
 *
 * Recorded implementation choices (ADR-059 leaves them to the tooling; reasoning in the format
 * spec's "--check" section, amended with #841):
 *   - FATES COVER THE REQUEST-REACHABLE FIELD UNIVERSE: every field of every DTO reachable from
 *     some contract operation's REQUEST (nested DTOs included). The four fates (durable | selector
 *     | instructive | transformed) name what the RA does with data ARRIVING at it; a
 *     response-only field never arrives — it is an observation, guarded by the durable round-trips
 *     of the written fields — so demanding a fate for it would pad the Contract review surface with
 *     unanswerable rows (the SA's standing constraint is to keep that surface minimal).
 *   - ROUNDTRIP PAIRS NAME RA CONTRACT OPERATIONS, not seam operations: ADR-059's enforcement
 *     derives the check as "write a DTO ... read back through the RA contract", over the generated
 *     contract types. --check additionally requires the write op's request to carry the fated DTO
 *     and the read op's response to return it — a pair that cannot round-trip the field is as
 *     wrong as a missing one.
 *   - `_`-PREFIXED allow entries are declared non-use-case entry points (`_maintenance`) and are
 *     exempt from model reachability; `_fixture` is RESERVED for the spec runner's fixture context
 *     (exempt by design, never declarable — a sheet granting it would grant production-path code a
 *     hole).
 *
 * `--schema` (#970) is the third verb: it emits `<deployment>/schema/<RA>.schema.sql` from the
 * BLESSED shape section of each RelationalDB sheet, so the store driver's schema is generated from
 * the design the human reviewed at Contract rather than re-typed from it into a hand-written
 * migration. It reads no model and no C# — the shape is wholly authored — and refuses to emit from
 * a shape that does not pass the [P6] checks. `--check` then holds any committed schema file to
 * what the sheet emits today ([P7]), because a generated file nobody regenerates goes stale the
 * same way a hand-written one drifts (#567). DocumentDB and RestApi have no schema to emit and are
 * reported as such: a document store has no DDL and a REST API no schema (ADR-059 amendment).
 *
 * THE ANSWER-SOURCE WALK ([P11], [P12]) — the Software Architect's order on relay R-260, 2026-09-13:
 * "please address all recommended measures." Figaro's first Access build round stopped on design
 * gaps in all four Access components, and the two biggest kinds were "the answer has no source" and
 * "no store call can do the job": a contract operation promised a returned field or a write that no
 * seam member and no request field could supply, and every one passed the Contract gate, because
 * nothing walked each returned field back to a source. The sheet's sixth section, `walk:`, is that
 * walk per contract operation VARIANT — where every returned field comes from (request | seam |
 * constant | rule), which ONE seam call performs every write, and which ONE call carries every
 * "in the same act" — and [P11] holds each named source to something that exists. [P12] is its
 * mechanical half, the rule both Figaro sheet reviews marked "mechanisable: yes" (finding F2, rounds 1
 * and 2): a durable field has a column on a table its write's seam call acts on, AND a member on
 * what that call passes. An Access that carries no walk yet is its own NOT WALKED state — reported,
 * green — and `--require-source-walk` turns it red, for every sheet or for the named ones.
 *
 * Exit: 0 ok · 1 findings · 2 usage/unreadable input.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { parse as parseYaml, yamlReader } from './yaml-subset.mjs';
import { DANGER_CLASSES } from './resource-danger.mjs';
import { readDeploymentView } from './deployment-view.mjs';

const readYaml = yamlReader('resource-protocol');
const rel = (p) => relative(process.cwd(), p) || p;
const die = (msg) => { console.error(`resource-protocol: ${msg}`); process.exit(2); };

// ---------------------------------------------------------------------------- arguments

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const skeleton = has('--skeleton');
const check = has('--check');
const schema = has('--schema');
if ([skeleton, check, schema].filter(Boolean).length !== 1)
  die('exactly one of --skeleton, --check or --schema is required');
const modelFile = flag('--model');
const deploymentDir = flag('--deployment');
const csharpDir = flag('--csharp');
// --schema reads only the sheet and the deployment view: the shape is wholly authored, so the
// model and the C# tree say nothing about it (they are what --skeleton and --check regenerate).
if (!deploymentDir || (!schema && (!modelFile || !csharpDir)))
  die(schema ? '--deployment <dir> is required' : '--model <arch.json>, --deployment <dir> and --csharp <dir> are all required');
for (const p of [modelFile, deploymentDir, csharpDir]) if (p && !existsSync(p)) die(`missing ${p}`);
const onlyRa = flag('--ra');
const onlySeam = flag('--seam');
const requireAll = has('--require-all');
// `--require-source-walk [<Access|seam>[,…]]` — the answer-source walk ([P11]/[P12]) is REQUIRED for
// the named ResourceAccess(es) or seam(s), or for every sheet in the run when no name follows. Without
// it an Access that carries no walk is reported in its own NOT WALKED state and stays green: sheets
// blessed before the walk existed must not flip red on the day this checker is installed, and the
// conductor requires the walk exactly where the ruling puts it — before each component's next
// implementor round (relay R-260, 2026-09-13). On `--skeleton` the same flag ADDS the section to a
// sheet that carries none, so the author starts from the generated keys instead of a blank.
const REQUIRE_WALK = '--require-source-walk';
const requireWalk = (() => {
  const i = args.indexOf(REQUIRE_WALK);
  if (i < 0) return undefined;
  if (schema) die(`${REQUIRE_WALK} belongs to --check and --skeleton; --schema reads no walk`);
  const next = args[i + 1];
  if (next === undefined || next.startsWith('--')) return { all: true, names: [] };
  const names = next.split(',').map((x) => x.trim()).filter(Boolean);
  if (!names.length) die(`${REQUIRE_WALK} '${next}' names nothing — give ResourceAccess or seam names, or no value to require the walk of every sheet in the run`);
  return { all: false, names };
})();

// ---------------------------------------------------------------------------- format vocabulary
// Per-resourceKind shape section and effect classes (resource-protocol-format.md). Extending this
// table IS the process-side work a new resource kind owes (ADR-059 consequences).

// The `danger` classes — the ones the Contract reviewer report names, answering the SA's "what can
// wipe data" — are NOT declared here: they come from `resource-danger.mjs`, the one table the
// gate dossier renders from as well (#977). The reported list and the reviewed list are the same
// list, or the review is of something the checker does not flag.

// `entry` is the shape section's ROW GRAMMAR (#968): `id` is the key that names one row — the
// thing an `on:` target and the Contract reviewer refer to — `members` the key that carries what is
// inside it, and `requires` any further key without which the row states nothing. A row with no
// members is the empty-schema hole #968 names: a sheet with `tables: [ { name: orders } ]` passed
// green while declaring no design at all.
const KINDS = {
  RelationalDB: {
    shapeKey: 'tables', effects: ['read', 'insert', 'update', 'upsert', 'delete', 'ddl'], danger: DANGER_CLASSES.RelationalDB,
    entry: { noun: 'table', id: 'name', members: 'columns', memberNoun: 'column', memberTyped: true },
  },
  DocumentDB: {
    shapeKey: 'collections', effects: ['read', 'upsert', 'delete'], danger: DANGER_CLASSES.DocumentDB,
    entry: { noun: 'collection', id: 'name', members: 'fields', memberNoun: 'field', requires: ['partitionKey'] },
  },
  RestApi: {
    shapeKey: 'endpoints', effects: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], danger: DANGER_CLASSES.RestApi,
    // An endpoint's content IS its method+path pair; there is no member list under it — and the
    // PAIR is also its identity (#1104). Keyed on the path alone, a sheet could not declare both
    // `GET /salesOrders` and `POST /salesOrders`: the second read as the first declared twice. The
    // shape section of a RestApi sheet is the complete list of calls the system may ever issue
    // against the external system, and the reviewer's question is which of them can destroy data,
    // so a vocabulary that cannot express two methods on one path forces the author to invent a
    // distinct path or drop a call — and a call missing from the list is the hole the sheet exists
    // to close.
    entry: { noun: 'endpoint', id: 'path', idParts: ['method', 'path'] },
  },
  File: {
    shapeKey: 'files', effects: ['read', 'append', 'rewrite', 'delete'], danger: DANGER_CLASSES.File,
    entry: { noun: 'file', id: 'path', members: 'layout', memberNoun: 'layout entry', memberScalarOk: true },
  },
};
const FATES = ['durable', 'selector', 'instructive', 'transformed'];
/** A fates row's key. NUL as separator is written as an ESCAPE, never a raw byte (#978). */
const fieldKey = (dto, field) => `${dto}\u0000${field}`;
const fieldOf = (key) => key.split('\u0000')[1];
const ALL_SHAPE_KEYS = Object.values(KINDS).map((k) => k.shapeKey);
// The relational constraint vocabulary the shape may carry verbatim. INDEX is not a table
// constraint — it becomes its own CREATE INDEX statement (see --schema) — which is why the
// generator has to know the keyword rather than pass every string through blindly.
const REL_CONSTRAINTS = ['CHECK', 'FOREIGN KEY', 'UNIQUE', 'PRIMARY KEY', 'INDEX'];
const constraintKeyword = (s) => REL_CONSTRAINTS.find((k) => new RegExp(`^${k}\\b`, 'i').test(String(s).trim()));

// ---------------------------------------------------------------------------- shape reading
// The `shape:` section is the ONE part of the sheet a human reviews (ADR-059, amended 2026-08-23:
// the LLM designs the tables, the human reviews that design and the delete/ddl effects, and never
// looks at a C# type). Until #968 nothing read it: a sheet with no shape at all, or with tables
// carrying no columns, passed `--check` green — the reviewed section was the only one neither
// generated, nor validated, nor executed. These readers are shared by --check (which reports) and
// --schema (which refuses to emit a schema from a shape that does not hold), so the vocabulary is
// stated once.

/** `primary` | `unique` | `primary (a, b)` → { kind, columns } | undefined when unreadable. */
function readKey(raw) {
  const k = String(raw).trim();
  if (k === 'unique') return { kind: 'unique' };
  if (k === 'primary') return { kind: 'primary' };
  const m = k.match(/^primary\s*\(([^()]*)\)$/);
  if (!m) return undefined;
  const columns = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  return columns.length ? { kind: 'primary', columns } : undefined;
}

/** The table's primary-key column list, from its columns' `key:` declarations ([] when none). */
function primaryKeyOf(table) {
  const declared = [];
  for (const col of table.columns || []) {
    if (!col || col.key === undefined) continue;
    const key = readKey(col.key);
    if (key?.kind === 'primary') declared.push(key.columns ?? [col.name]);
  }
  return declared[0] ?? [];
}

/**
 * [P6] the shape section, against the deployment view's resourceKind. Returns the set of entry ids
 * (table/collection/endpoint/file names) so the `operations` rows' `on:` targets can be resolved
 * against the shape the reviewer blessed. `report(msg)` collects findings; `note(msg)` collects
 * reviewer-facing observations that are not failures.
 */
function checkShape(shape, kind, kindName, report, note = () => {}) {
  const ids = new Set();
  if (!shape || typeof shape !== 'object' || Array.isArray(shape)) {
    report(`[P6] no shape section — the resource design is the one part of this sheet a human reviews (ADR-059)`);
    return ids;
  }
  for (const k of Object.keys(shape))
    if (ALL_SHAPE_KEYS.includes(k) && k !== kind.shapeKey)
      report(`[P6] shape.${k} is another kind's vocabulary — this RA is ${kindName} (${kind.shapeKey})`);
  const own = shape[kind.shapeKey];
  if (!Array.isArray(own) || own.length === 0) {
    report(`[P6] shape.${kind.shapeKey} is missing or empty — ${kindName} review vocabulary (resource-protocol-format.md)`);
    return ids;
  }
  const e = kind.entry;
  own.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      report(`[P6] shape.${kind.shapeKey}[${i}] is not a ${e.noun} mapping`);
      return;
    }
    // The entry's IDENTITY: one key for most kinds, the (method, path) PAIR for a REST endpoint
    // (#1104). Every part must be there before the entry has a name at all, so a missing one ends
    // this entry rather than producing findings about `undefined`.
    const idParts = e.idParts ?? [e.id];
    const missingId = idParts.filter((k) => typeof entry[k] !== 'string' || !entry[k].trim());
    if (missingId.length) {
      report(`[P6] shape.${kind.shapeKey}[${i}] has no ${missingId.map((k) => `'${k}'`).join(' and no ')} — ` +
        (idParts.length > 1
          ? `an ${e.noun} is named by its ${idParts.join(' and ')} TOGETHER, and that pair is what an \`on:\` target and the reviewer refer to`
          : `every ${e.noun} is named, and the name is what an \`on:\` target and the reviewer refer to`));
      return;
    }
    const id = idParts.map((k) => entry[k].trim()).join(' ');
    if (ids.has(id)) report(`[P6] ${e.noun} '${id}' is declared twice`);
    ids.add(id);
    for (const req of e.requires || [])
      if (entry[req] === undefined || String(entry[req]).trim() === '')
        report(`[P6] ${e.noun} '${id}' has no '${req}'`);
    if (e.members) {
      const members = entry[e.members];
      const scalar = e.memberScalarOk && typeof members === 'string' && members.trim() !== '';
      if (!scalar && (!Array.isArray(members) || members.length === 0)) {
        report(`[P6] ${e.noun} '${id}' declares no ${e.members} — an empty ${e.noun} is not a design, and it is what let a sheet claim a schema it does not have (#968)`);
      } else if (!scalar) {
        const seen = new Set();
        members.forEach((m, j) => {
          if (!m || typeof m !== 'object' || Array.isArray(m)) {
            report(`[P6] ${e.noun} '${id}' ${e.members}[${j}] is not a ${e.memberNoun} mapping`);
            return;
          }
          if (typeof m.name !== 'string' || !m.name.trim()) {
            report(`[P6] ${e.noun} '${id}' ${e.members}[${j}] has no 'name'`);
            return;
          }
          if (seen.has(m.name)) report(`[P6] ${e.noun} '${id}' declares ${e.memberNoun} '${m.name}' twice`);
          seen.add(m.name);
          if (e.memberTyped && (typeof m.type !== 'string' || !m.type.trim()))
            report(`[P6] ${e.noun} '${id}' ${e.memberNoun} '${m.name}' has no 'type' — the generated schema (#970) has nothing to declare it as`);
        });
      }
    }
  });
  // relational extras run over the COMPLETE id set: a foreign key may name a table the sheet
  // declares further down, and a forward reference is not a finding
  if (kindName === 'RelationalDB') {
    const tables = own.filter((e) => e && typeof e === 'object' && typeof e.name === 'string' && e.name.trim());
    for (const entry of tables) checkRelationalTable(entry, entry.name, ids, report, note);
    // #1742: the emitted order is the FK dependency order, and only a cycle has none. This is a
    // whole-shape property, so it is read once here rather than per table.
    const order = tableOrder(tables);
    if (order.error) report(`[P6] ${order.error}`);
  }
  return ids;
}

/** Relational extras: the key vocabulary, and constraints the schema generator can actually place. */
function checkRelationalTable(table, id, tableIds, report, note) {
  const columns = Array.isArray(table.columns) ? table.columns : [];
  const names = new Set(columns.filter((c) => c && typeof c.name === 'string').map((c) => c.name));
  const primaries = [];
  for (const col of columns) {
    if (!col || col.key === undefined) continue;
    const key = readKey(col.key);
    if (!key) {
      report(`[P6] table '${id}' column '${col.name}' key '${col.key}' — the key vocabulary is 'primary', 'unique' or 'primary (col, col…)'`);
      continue;
    }
    if (key.kind !== 'primary') continue;
    const cols = key.columns ?? [col.name];
    for (const c of cols)
      if (!names.has(c)) report(`[P6] table '${id}' composite primary key names column '${c}', which the table does not declare`);
    primaries.push(cols.join(', '));
  }
  const distinct = [...new Set(primaries)];
  if (distinct.length > 1)
    report(`[P6] table '${id}' declares two different primary keys (${distinct.map((p) => `(${p})`).join(' and ')}) — a table has one`);
  if (!distinct.length) note(`table '${id}' declares no primary key — the generated schema states no row identity for it`);
  if (table.constraints !== undefined) {
    if (!Array.isArray(table.constraints)) {
      report(`[P6] table '${id}' constraints is not a list`);
      return;
    }
    for (const c of table.constraints) {
      if (typeof c !== 'string' || !c.trim()) { report(`[P6] table '${id}' carries an empty constraint`); continue; }
      const kw = constraintKeyword(c);
      if (!kw) { report(`[P6] table '${id}' constraint '${c}' starts with none of ${REL_CONSTRAINTS.join(' / ')} — the generated schema could not place it`); continue; }
      if (kw === 'INDEX') {
        // #1734: an entry the generator cannot read used to become column names in a file that
        // parsed nowhere; now it is refused here, and every column it names must be the table's.
        const ix = readIndex(c);
        if (!ix) { report(`[P6] table '${id}' constraint '${c}' does not read as INDEX [name] (col [ASC|DESC], …) [WHERE …] — the generated schema could not place it`); continue; }
        for (const col of ix.columns)
          if (!names.has(col.name)) report(`[P6] table '${id}' index '${c}' names column '${col.name}', which the table does not declare`);
        continue;
      }
      if (kw === 'UNIQUE') {
        // #1742: a plain UNIQUE (…) is passed through into CREATE TABLE verbatim, as it always was.
        // A FILTERED one is rendered by this generator as a CREATE UNIQUE INDEX, so it is held to
        // what that renderer can read — and one it cannot read is refused rather than written into
        // a table body, where a WHERE has no meaning in any dialect here.
        if (!isFiltered(c)) continue;
        const ux = readUnique(c);
        if (!ux) { report(`[P6] table '${id}' constraint '${c}' does not read as UNIQUE [name] (col, …) [WHERE …] — a filtered uniqueness is emitted as its own CREATE UNIQUE INDEX, and the generated schema could not place this one`); continue; }
        for (const col of ux.columns)
          if (!names.has(col.name)) report(`[P6] table '${id}' filtered unique index '${c}' names column '${col.name}', which the table does not declare`);
        continue;
      }
      if (kw !== 'FOREIGN KEY') continue;
      const m = String(c).match(/REFERENCES\s+("?[\w.]+"?)/i);
      if (m && !tableIds.has(m[1].replace(/"/g, '')))
        report(`[P6] table '${id}' foreign key references '${m[1]}', which this shape does not declare — a store owns its own tables`);
    }
  }
}

// ---------------------------------------------------------------------------- model reading

/** ReadArchitecture JSON — envelope or bare payload (sns-cli skill shape, as in seqmap.mjs). */
function loadModel(file) {
  let j;
  try { j = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { die(`${file}: not valid JSON (${e.message})`); }
  if (j && j.success === false) die(`${file}: sns-cli error envelope (${(j.error && j.error.message) || 'no message'})`);
  const data = j && typeof j === 'object' && j.data !== undefined ? j.data : j;
  if (!data || typeof data !== 'object') die(`${file}: no architecture payload`);
  if (!Array.isArray(data.componentDetails) || data.componentDetails.length === 0)
    die(`${file}: the model carries no component catalog — protocol sheets are a Stage-C artifact over the promoted decomposition`);
  return {
    system: data.projectName,
    componentNames: new Set(data.componentDetails.map((c) => c.name)),
    useCases: (data.useCases || []).map((uc) => ({
      id: uc.id,
      name: uc.name,
      reaches: new Set(
        (uc.permutations || []).flatMap((pm) => (pm.sequenceSteps || []).map((st) => st.calleeComponentName)),
      ),
    })),
  };
}

// ---------------------------------------------------------------------------- contract manifest
// The generated `.methodcontract` projection of the const model ("Generated by theagent2 from
// <project>.method@<oplog> — DO NOT EDIT"). It is the one machine-readable statement of the RA's
// owned contract DTOs WITH their nested row/card DTOs, and the same universe the spec runner's
// derived round-trip builds against (#842).

/** `List<OrderLineRecord>` / `IReadOnlyList<X>` / `X?` / `X[]` → candidate type names inside. */
function baseTypeNames(type) {
  return [...String(type).matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)].map((m) => m[0]);
}

/** `Comanda.Access.Sales.Interface.Orders.OrderRecord` → `Orders.OrderRecord`. */
const facetKey = (ns) => ns.split('.').slice(-2).join('.');

let _manifests; // RA name -> { path, ops: Map, dtos: Map, subtypes: Map } (lazy; --csharp scanned once)
function manifestFor(raName) {
  if (!_manifests) {
    _manifests = new Map();
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'bin' || entry === 'obj' || entry === 'node_modules') continue;
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) walk(p);
        else if (entry.endsWith('.methodcontract')) files.push(p);
      }
    };
    walk(csharpDir);
    const parsed = [];
    for (const path of files) {
      const dtos = new Map();     // 'Facet.Name' -> { fields: [{ name, type }] }
      const subtypes = new Map(); // base 'Facet.Name' -> ['Facet.Derived', …]
      const ops = [];             // { name, reqKey, resKey }
      let componentNs;
      for (const raw of readFileSync(path, 'utf-8').split('\n')) {
        const t = raw.trim().split(/\s+/);
        if (t[0] === 'component') componentNs = t[1];
        else if (t[0] === 'operation') ops.push({ name: t[1], reqKey: facetKey(t[2]), resKey: facetKey(t[3]) });
        else if (t[0] === 'dto') {
          dtos.set(facetKey(t[1]), { fields: [], abstract: t.includes('abstract') });
          // `dto <Ns> [abstract|sealed] [extends <BaseNs>]` — KEEP the inheritance edge. It used
          // to be dropped here, and dropping it is what made every request VARIANT invisible to
          // the closure below: an operation's request key is the abstract base, the fields live
          // on the `_Page` / `_Delta` / `_Assortment` subtypes, and nothing pointed down.
          const at = t.indexOf('extends');
          if (at > 0 && t[at + 1]) {
            const base = facetKey(t[at + 1]);
            if (!subtypes.has(base)) subtypes.set(base, []);
            subtypes.get(base).push(facetKey(t[1]));
          }
        }
        else if (t[0] === 'field')
          // `field <dtoNs> <Name> <type…> <required|nullable>` — the type may hold spaces
          dtos.get(facetKey(t[1]))?.fields.push({ name: t[2], type: t.slice(3, -1).join(' ') });
      }
      if (!componentNs) continue;
      parsed.push({ path, ops, dtos, subtypes, componentNs });
    }
    for (const entry of parsed) {
      // `component Access.Sales` names the model component `SalesAccess` (the scaffolder's
      // layer-folder convention); accept the exact model name too, for robustness.
      const seg = entry.componentNs.split('.');
      for (const name of [entry.componentNs, `${seg[seg.length - 1]}${seg[0]}`]) {
        if (_manifests.has(name))
          die(`two contract manifests answer for '${name}': ${rel(_manifests.get(name).path)} and ${rel(entry.path)} — the contract surface is single-definition`);
        _manifests.set(name, entry);
      }
    }
    // A Utility's model name already carries its own suffix — `Utility.StorageUtility` is
    // `StorageUtility`, never `StorageUtilityUtility`, and `Utility.MessageBus` is `MessageBus`
    // with no suffix at all — so the BARE last segment is a candidate name too. It is added last
    // and only when exactly one manifest claims it: `Access.Feed` and `Manager.Feed` both bare to
    // `Feed`, and an ambiguous alias must resolve to nothing rather than to a coin flip. Both
    // still answer to their unambiguous names (`FeedAccess`, `FeedManager`).
    const bare = new Map();
    for (const entry of parsed) {
      const seg = entry.componentNs.split('.');
      const name = seg[seg.length - 1];
      if (!bare.has(name)) bare.set(name, []);
      bare.get(name).push(entry);
    }
    for (const [name, entries] of bare)
      if (entries.length === 1 && !_manifests.has(name)) _manifests.set(name, entries[0]);
  }
  return _manifests.get(raName);
}

/**
 * Facet-keyed DTO closure over a manifest, walking field types from a set of start keys.
 * A type name resolves to the same facet's DTO first, then to a manifest-unique short name;
 * primitives match nothing and drop out of the walk.
 */
function manifestClosure(manifest, startKeys) {
  const shortIndex = new Map(); // short dto name -> [keys]
  for (const key of manifest.dtos.keys()) {
    const short = key.split('.')[1];
    if (!shortIndex.has(short)) shortIndex.set(short, []);
    shortIndex.get(short).push(key);
  }
  const seen = new Set();
  const visit = (key) => {
    const dto = manifest.dtos.get(key);
    if (!dto || seen.has(key)) return;
    seen.add(key);
    const facet = key.split('.')[0];
    // DOWN the inheritance edge first. A polymorphic request (`dto X abstract` +
    // `dto X_Variant sealed extends X`) carries its fields on the variants, and a field walk
    // alone stops at the abstract base: the variants were then invisible in BOTH directions —
    // their authored fate rows read as stale, and their absent ones were never reported missing.
    for (const sub of manifest.subtypes.get(key) || []) visit(sub);
    for (const field of dto.fields)
      for (const tn of baseTypeNames(field.type)) {
        const candidates = shortIndex.get(tn) || [];
        const sameFacet = candidates.find((k) => k.startsWith(`${facet}.`));
        if (sameFacet) visit(sameFacet);
        else if (candidates.length === 1) visit(candidates[0]);
        // >1 cross-facet candidates: unresolvable by name — leave unvisited rather than guess;
        // the field itself is still fated on its declaring DTO, so nothing goes silent
      }
  };
  for (const k of startKeys) visit(k);
  return seen;
}

// ---------------------------------------------------------------------------- answerable faults
// #999 (SA ruling 2026-08-24, the blessed resource fault tables): ADR-061 decision 8 gives the
// resource seam four verbs — classify, retry, ANSWER WHAT IS ANSWERABLE AS DATA, rethrow what is
// not — and says nothing about which fault class is answerable where. That is a resource-design
// decision (it depends on the contract question the operation asks), so it belongs on the sheet
// the human blesses at Contract and not in an implementor's head. Section 5 declares it; these
// readers are what hold the declaration and the code together.

/** Facet-keyed short-name index over a manifest's DTOs, cached on the manifest. */
function shortIndexOf(manifest) {
  if (!manifest._shortIndex) {
    const index = new Map();
    for (const key of manifest.dtos.keys()) {
      const short = key.split('.')[1];
      if (!index.has(short)) index.set(short, []);
      index.get(short).push(key);
    }
    manifest._shortIndex = index;
  }
  return manifest._shortIndex;
}

/**
 * Does a `answers:` path (`Applied`, or `Outcome.Applied` through a nested DTO) resolve on one of
 * an operation's RESPONSE DTOs? Same name resolution as `manifestClosure`: same facet first, then
 * a manifest-unique short name; a primitive-typed field simply has nothing under it.
 * Returns `{ ok: true }`, or `{ ok: false, at }` naming the segment that did not resolve.
 */
function resolveResponseField(manifest, resKeys, path) {
  const parts = String(path).split('.').map((x) => x.trim());
  if (!parts.length || parts.some((x) => !x)) return { ok: false, at: String(path) };
  let keys = [...resKeys];
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    const next = [];
    let found = false;
    for (const key of keys) {
      const dto = manifest.dtos.get(key);
      const field = dto?.fields.find((f) => f.name === parts[i]);
      if (!field) continue;
      found = true;
      if (last) return { ok: true };
      const facet = key.split('.')[0];
      for (const tn of baseTypeNames(field.type)) {
        const candidates = shortIndexOf(manifest).get(tn) || [];
        const sameFacet = candidates.find((k) => k.startsWith(`${facet}.`));
        if (sameFacet) next.push(sameFacet);
        else if (candidates.length === 1) next.push(candidates[0]);
      }
    }
    if (!found || (!last && !next.length)) return { ok: false, at: parts.slice(0, i + 1).join('.') };
    keys = next;
  }
  return { ok: false, at: String(path) };
}

/** `<domain>:<slug>`, lower case — the product-free identity, never a raw product code. */
const IDENTITY_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*:[a-z0-9][a-z0-9.-]*$/;

/** Comments out, LENGTH AND LINES PRESERVED — [P9] reports file:line, so offsets must survive. */
const blankComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

/** The balanced `(...)` opening at `open`, or undefined. */
function parenSpan(src, open) {
  if (src[open] !== '(') return undefined;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return { inner: src.slice(open + 1, i), end: i };
  }
  return undefined;
}

/**
 * Every fault identity the ResourceAccess ANSWERS, read from its `Service/` sources.
 *
 * The blessed tables fix the shape: the answering catch is per-operation and FILTERED on one
 * declared identity — `catch (StoreFault f) when (f.Identity == "store:version-mismatch")` — while
 * the retry-and-rethrow half is shared plumbing that classifies and `throw;`s. So the scan reads
 * every `catch (...) when (...)` whose FILTER mentions `Identity`, and takes every string literal
 * in that filter as an identity this Access answers (`f.Identity is "a" or "b"` included). A
 * filter that names no identity — `when (IsTransient(fault))` — answers nothing and is not read.
 *
 * Deliberately NOT attributed to a contract operation: that would need C# body parsing, and a
 * wrong attribution turns correct code red. The comparison against the sheet is per Access.
 */
function answeredIdentities(serviceDir) {
  const out = [];
  if (!existsSync(serviceDir)) return out;
  for (const path of csFiles(serviceDir)) {
    const src = blankComments(readFileSync(path, 'utf-8'));
    for (const m of src.matchAll(/\bcatch\s*\(/g)) {
      const decl = parenSpan(src, m.index + m[0].length - 1);
      if (!decl) continue;
      const rest = src.slice(decl.end + 1);
      const when = rest.match(/^\s*when\s*\(/);
      if (!when) continue;
      const filter = parenSpan(rest, when[0].length - 1);
      if (!filter || !/\bIdentity\b/.test(filter.inner)) continue;
      const line = src.slice(0, decl.end).split('\n').length;
      for (const lit of filter.inner.matchAll(/"([^"\\]*)"/g))
        if (lit[1].trim()) out.push({ identity: lit[1], path, line });
    }
  }
  return out;
}

/**
 * Has CONSTRUCTION landed for this ResourceAccess — is its component body written, or is it still
 * the scaffolder's create-once stub? This is what [P10] (#1004) waits for. Between the Contract
 * blessing of a sheet and the Construction-stage landing of the component that implements it,
 * every declared answerable fault is legitimately unanswered, so a red in that window would fail
 * the check for the whole of Specification.
 *
 * The signal is the scaffolder's own marker: `emit/stubs.ts` writes every un-implemented operation
 * as `=> throw new NotImplementedException("Implement <Component>.<Op>.")` (ADR-027 §5), so while
 * ANY stub is left under `Service/` this Access is still an implementor's work queue. Per Access,
 * like the [P9] scan and for the same reason: attributing a stub to a contract operation would need
 * C# body parsing, and a wrong attribution turns correct code red. Deliberately conservative — one
 * remaining stub keeps the whole sheet's declared rows advisory, because a half-written body owes
 * no answering catch yet.
 *
 * GENERATED SOURCES ARE NOT A BODY (figaro#499). The stub proxy is sound only over files somebody
 * is meant to fill in, and the scaffolder also emits files nobody may touch: for a Utility — which
 * is contract-only and hosted through the iFX proxy, so its real body is not in this tree at all —
 * `Service/` receives exactly a request-variant dispatcher carrying the `<auto-generated> … DO NOT
 * EDIT` header, and no operation stubs. That dispatcher throws no `NotImplementedException`, so it
 * used to read as a LANDED body the instant it appeared, and every answerable-fault row on that
 * component's sheets turned into a [P10] whose remedy could not be taken: there is no file the
 * filtered catch could go in (the `Service/` project is not even in the solution), and the only
 * other option offered was to delete a blessed design decision to make a check green. Measured on
 * Figaro's `StorageUtility` the day its contract first carried request variants.
 *
 * So a source the generator marks as its own is skipped before the question is asked, and a
 * `Service/` holding nothing else reads as not landed — the row prints its ordinary reviewer line.
 * Nothing else moves: a hand-owned stub still keeps the sheet advisory, and a hand-written body
 * still lands it.
 */
function constructionLanded(serviceDir) {
  if (!existsSync(serviceDir)) return false;
  const sources = csFiles(serviceDir)
    .map((path) => readFileSync(path, 'utf-8'))
    .filter((src) => !isGeneratedSource(src));
  if (!sources.length) return false;
  return !sources.some((src) => /\bNotImplementedException\b/.test(blankComments(src)));
}

/**
 * Whether the scaffolder wrote this file and owns it (ADR-022 §1, `scaffolder/header.ts`).
 *
 * The marker is on line 1 by construction — `csHeader`/`csHeaderLine` write it there, the orphan
 * scan and the provenance gate both read it there — so only line 1 is inspected: a mention of the
 * word further down is a comment about generated files, not a claim to be one.
 */
function isGeneratedSource(src) {
  return src.slice(0, src.indexOf('\n') + 1 || src.length).includes(GENERATED_MARKER);
}

/** The scaffolder's ownership marker, verbatim from `scaffolder/header.ts`. */
const GENERATED_MARKER = '<auto-generated> Generated by theagent2 from ';

// ---------------------------------------------------------------------------- seam reading
// The seam interface's operation names. Code first (the code is the truth — #593/#798); the seam
// document's ```csharp fence carries the same declaration before construction lands it
// (store-seam-check pins the two identical once both exist, so either source answers the same).

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

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

/** Top-level comma split — a comma inside (), <>, [] or {} belongs to the part it is in. */
const splitTopLevel = (text) => {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '<' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === '>' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
};

/** `[Attr] ref Type name = default` → { name, type }, or undefined. A named tuple element reads the same way. */
const readParam = (text) => {
  let x = String(text).replace(/^\s*(?:\[[^\]]*\]\s*)+/, '');
  const eq = x.indexOf('=');
  if (eq >= 0) x = x.slice(0, eq);
  x = x.trim();
  const m = x.match(/([A-Za-z_]\w*)\s*$/);
  if (!m) return undefined;
  const type = x.slice(0, m.index).replace(/^(?:(?:this|ref|out|in|params|scoped|readonly)\s+)+/, '').trim();
  return type ? { name: m[1], type } : undefined;
};

/**
 * The members of an interface body: `{ name, returns, params: [{ name, type }] }` per method. The
 * NAME is what the `operations` left side is generated from; the return type and the parameters are
 * what the answer-source walk ([P11]) and the durable storage condition ([P12]) resolve against — a
 * `seam:` source names something an operation RETURNS, and a durable field must be carried by
 * something its write's call PASSES.
 */
const interfaceMembers = (body) => {
  const members = [];
  let depth = 0, start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '(' || c === '<') depth++;
    else if (c === ')' || c === '>') depth--;
    else if (c === ';' && depth <= 0) {
      const stmt = body.slice(start, i);
      start = i + 1;
      // The method name is the identifier before the '(' that opens the PARAMETER list — which is
      // not always the statement's FIRST '(': a tuple return type opens one of its own with no
      // identifier in front of it (`(bool Applied, IReadOnlyList<StockLevelRow> Levels)
      // ClaimStock(...)`). Reading the first paren therefore dropped every tuple-returning seam
      // operation from the generated `operations` left side — silently, so nothing could be
      // allowlisted against it either: ICatalogStore.ClaimStock and
      // IReservationStore.InsertWaitlistEntry both went missing (#843). So scan the statement's
      // TOP-LEVEL parens and take the last one an identifier precedes.
      let d = 0, found;
      for (let j = 0; j < stmt.length; j++) {
        const ch = stmt[j];
        if (ch === '(' || ch === '<') {
          if (d === 0 && ch === '(') {
            const m = stmt.slice(0, j).match(/(\w+)\s*(?:<[^<>()]*>)?\s*$/);
            if (m) found = { name: m[1], open: j, head: stmt.slice(0, m.index) };
          }
          d++;
        } else if (ch === ')' || ch === '>') d--;
      }
      if (found) {
        const span = parenSpan(stmt, found.open);
        members.push({
          name: found.name,
          returns: found.head.replace(/^\s*(?:\[[^\]]*\]\s*)+/, '').trim(),
          params: span ? splitTopLevel(span.inner).map(readParam).filter(Boolean) : [],
        });
      }
    }
  }
  return members;
};

/**
 * Every `record` / `class` / `struct` a C# source declares, as name → [{ name, type }]: the positional
 * parameters of a record, plus the `public T Name { get … }` properties of its body. These are the
 * seam's ROW TYPES — `store-seam-check` [D4] already pins the design fence's records to the code's —
 * and the durable storage condition asks whether one of them carries a durable field (#796's class,
 * and Figaro's LastSentImageSlotStoreRow, which carried three of the five fields its sheet fated
 * durable).
 */
const typeDeclarations = (src) => {
  const out = new Map();
  for (const m of src.matchAll(/\b(?:record\s+(?:struct|class)|record|class|struct)\s+([A-Za-z_]\w*)\s*(?:<[^<>(){};]*>)?\s*/g)) {
    const name = m[1];
    const members = [];
    let i = m.index + m[0].length;
    if (src[i] === '(') {
      const span = parenSpan(src, i);
      if (span) {
        for (const p of splitTopLevel(span.inner).map(readParam)) if (p) members.push(p);
        i = span.end + 1;
      }
    }
    const rest = src.slice(i);
    const stop = rest.search(/[;{]/);
    if (stop >= 0 && rest[stop] === '{') {
      const body = bracedBody(src, i + stop);
      if (body)
        for (const pm of body.matchAll(/\bpublic\s+(?:(?:required|virtual|override|new|static)\s+)*([A-Za-z_][\w.<>,?\[\]\s()]*?)\s+([A-Za-z_]\w*)\s*\{\s*(?:get|init|set)\b/g))
          members.push({ name: pm[2], type: pm[1].trim() });
    }
    if (!out.has(name)) out.set(name, members);
  }
  return out;
};

const namespaceOf = (src) => (src.match(/^\s*namespace\s+([\w.]+)\s*[;{]/m) || [])[1];

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

let _csSources; // lazy — --csharp is scanned once, only when a seam is actually resolved
const _seamDecls = new Map(); // seam -> declaration (read once; its notice is reported once)

/**
 * The seam's declaration: `{ ops, sigs, records, source }`, or `{ error }`. `ops` is the operation
 * name list the `operations` left side is generated from; `sigs` the members by name; `records` the
 * row types the seam's own namespace declares (the design fence's, before the code lands).
 */
function seamDeclaration(seamName, notices) {
  if (!_seamDecls.has(seamName)) _seamDecls.set(seamName, readSeamDeclaration(seamName));
  const decl = _seamDecls.get(seamName);
  if (decl.notice && notices && !decl.noticed) { notices.push(decl.notice); decl.noticed = true; }
  return decl;
}
const seamOperations = seamDeclaration;

function readSeamDeclaration(seamName) {
  if (!_csSources) _csSources = csFiles(csharpDir).map((path) => ({ path, src: stripComments(readFileSync(path, 'utf-8')) }));
  const declRe = new RegExp(`interface\\s+${seamName}\\b`);
  const declaring = _csSources.filter((s) => declRe.test(s.src));
  if (declaring.length > 1)
    return { error: `seam ${seamName}: declared by ${declaring.length} files under ${rel(csharpDir)} (${declaring.map((s) => rel(s.path)).join(', ')}) — the seam is single-definition by design (#505)` };
  const declared = (members, records, source, notice) => ({
    ops: members.map((m) => m.name), sigs: new Map(members.map((m) => [m.name, m])), records, source, notice,
  });
  if (declaring.length === 1) {
    const s = declaring[0];
    const body = bracedBody(s.src, s.src.search(declRe));
    if (body === undefined) return { error: `${rel(s.path)}: interface ${seamName} has no closed body` };
    const members = interfaceMembers(body);
    if (!members.length) return { error: `${rel(s.path)}: interface ${seamName} declares no operations` };
    const ns = namespaceOf(s.src);
    const records = new Map();
    for (const x of _csSources)
      if (namespaceOf(x.src) === ns)
        for (const [name, m] of typeDeclarations(x.src)) if (!records.has(name)) records.set(name, m);
    return declared(members, records, rel(s.path));
  }
  // pre-construction: the design statement in the seam document
  const docPath = join(deploymentDir, '02_Store-Seam-Interfaces.md');
  if (existsSync(docPath)) {
    const doc = readFileSync(docPath, 'utf-8');
    const fences = [...doc.matchAll(/```csharp\n([\s\S]*?)```/g)].map((m) => stripComments(m[1]));
    for (const src of fences) {
      if (!declRe.test(src)) continue;
      const body = bracedBody(src, src.search(declRe));
      if (body === undefined) continue;
      const members = interfaceMembers(body);
      if (members.length) {
        // the fence's own records, then those of every fence stating the same namespace
        const ns = namespaceOf(src);
        const records = new Map();
        for (const f of [src, ...fences.filter((f) => f !== src && ns && namespaceOf(f) === ns)])
          for (const [name, m] of typeDeclarations(f)) if (!records.has(name)) records.set(name, m);
        return declared(members, records, rel(docPath),
          `seam ${seamName}: no declaration under ${rel(csharpDir)} yet — read from the design fence in ${rel(docPath)} (store-seam-check pins the two identical once the code lands)`);
      }
    }
  }
  return { error: `seam ${seamName}: declared neither under ${rel(csharpDir)} nor as a \`\`\`csharp fence in ${rel(join(deploymentDir, '02_Store-Seam-Interfaces.md'))} — the operations left side cannot be generated` };
}

// ---------------------------------------------------------------------------- derivation
// The generated half of a sheet, straight from the inputs. Both verbs run this; --skeleton writes
// it, --check compares it. One derivation, two consumers — the generator is its own oracle.
//
// Split in two under ADR-065, because the sheet's generated half now has two sources. Everything
// keyed on the OWNING ACCESS — its contract operations, its request-reachable fates universe, the
// use cases whose chains reach it, its `Service/` root — is derived once per Access and shared by
// every sheet that Access owns. Everything keyed on the SEAM — the kind's vocabulary (from the
// slot) and the operation list (from the interface) — is derived per sheet.

const _accessCache = new Map();

/** The Access half: contract operations, the fates universe, reaching use cases, the source root. */
function deriveAccess(model, raName) {
  if (_accessCache.has(raName)) return _accessCache.get(raName);
  const out = computeAccess(model, raName);
  _accessCache.set(raName, out);
  return out;
}

function computeAccess(model, raName) {
  if (!model.componentNames.has(raName))
    return { error: `deployment-view names ${raName} but the model has no such component — run \`deployment-view-check\`/\`construction-entry-check\` first` };
  const manifest = manifestFor(raName);
  if (!manifest)
    return { error: `${raName}: no .methodcontract manifest under ${rel(csharpDir)} — the sheet's fates cover the generated contract surface, so generate the contracts first (the manifest is the model's own projection, nested DTOs included)` };

  // name -> { requestDtos:Set<'Facet.Dto'>, responseDtos:Set } — merged if two facets reuse a name
  const contractOps = new Map();
  for (const op of manifest.ops) {
    const requestDtos = manifestClosure(manifest, [op.reqKey]);
    const responseDtos = manifestClosure(manifest, [op.resKey]);
    const prev = contractOps.get(op.name);
    if (prev) {
      for (const k of requestDtos) prev.requestDtos.add(k);
      for (const k of responseDtos) prev.responseDtos.add(k);
      prev.resKeys.add(op.resKey);
    } else contractOps.set(op.name, { requestDtos, responseDtos, resKeys: new Set([op.resKey]) });
  }

  const closure = manifestClosure(manifest, manifest.ops.map((op) => op.reqKey));
  const fates = [...manifest.dtos.entries()]
    .filter(([key]) => closure.has(key))
    .map(([key, dto]) => ({ key, fields: dto.fields.map((f) => f.name) }));

  const reaching = model.useCases
    .filter((uc) => uc.reaches.has(raName))
    .map((uc) => ({ id: uc.id, name: uc.name }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // The RA's own source root, from its manifest's home (`<raRoot>/Interface/<X>.methodcontract`):
  // `<raRoot>/Service` is where the answering catches live, and what [P9] scans (#999).
  const raRoot = dirname(dirname(manifest.path));
  return { resourceAccess: raName, contractOps, fates, reaching, manifest, raRoot };
}

/** The seam half: the kind's vocabulary (from the slot) and the seam's operation list. */
function deriveSeam(slot, notices) {
  const kind = KINDS[slot.resourceKind];
  if (!kind)
    return { error: `slot '${slot.slot}' (${slot.owner}): resourceKind '${slot.resourceKind}' has no shape/effect vocabulary in resource-protocol-format.md — a new kind owes the format spec its vocabulary first (ADR-059)` };
  const seam = seamOperations(slot.seam, notices);
  if (seam.error) return { error: seam.error };
  return { kind, seamOps: seam.ops, seamSource: seam.source };
}

// ---------------------------------------------------------------------------- roundTripValue
// #1631, reading 2 (screened on figaro relay R-272, 2026-09-13): an `instructive` fate row may state
// `roundTripValue: <whole number>`, the value a derived round-trip SENDS in that field when it composes
// its READ. A paged read needs it: `Skip(PageIndex * PageSize)` wants a page index of 0 while the page
// size beside it wants a large positive number, and the runner's default for every instructive whole
// number of a read is 100 (`ProtocolRoundTripCase.ReadInstruction`, figaro#684 D2-A), which stays the
// default wherever no value is stated. Like `given:`, it is explicit and reviewed — so a value the
// round-trip can never send is refused here rather than left to read as a promise.

/** The C# whole-number types a value can be sent in, with each one's range. JS numbers lose integers
 * past 2^53, so the 64-bit types are held to the safe range; the runner's loader refuses the same. */
const WHOLE_TYPES = new Map([
  ['sbyte', [-128, 127]], ['byte', [0, 255]], ['short', [-32768, 32767]], ['ushort', [0, 65535]],
  ['int', [-2147483648, 2147483647]], ['uint', [0, 4294967295]],
  ['long', [-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]], ['ulong', [0, Number.MAX_SAFE_INTEGER]],
]);
const CLR_WHOLE = { SByte: 'sbyte', Byte: 'byte', Int16: 'short', UInt16: 'ushort', Int32: 'int', UInt32: 'uint', Int64: 'long', UInt64: 'ulong' };
/** `int` / `int?` / `System.Int32` → `int`; undefined for any other manifest type. */
const wholeTypeOf = (type) => {
  const t = String(type ?? '').trim().replace(/\?$/, '').replace(/^System\./, '');
  return WHOLE_TYPES.has(t) ? t : CLR_WHOLE[t];
};

/**
 * [P2] every `roundTripValue:` of one Access. Accepted only where a derived round-trip sends it: an
 * `instructive` row, a whole number, a whole-number field whose type carries it, on a record the
 * request of some durable row's roundTrip READ carries (a durable row on any of the Access's sheets —
 * the runner looks a read's fate rows up across them too). Refused on any other fate, on a value that
 * is no whole number or does not fit, on a field of another type, and on a record only a WRITE (or
 * nothing any round-trip calls) carries: the round-trip composes a write with distinctive values, so
 * a value there would be a reviewed promise nothing keeps.
 */
function checkRoundTripValues({ raName, access, valueRows, durableRows, P }) {
  const { contractOps, manifest } = access;
  const reads = new Set(durableRows.map((d) => d.row.roundTrip.read).filter((op) => typeof op === 'string'));
  const writes = new Set(durableRows.flatMap((d) => [d.row.roundTrip.write, d.row.roundTrip.given]).filter((op) => typeof op === 'string'));
  for (const { at, dtoKey, field, row } of valueRows) {
    const name = `${dtoKey}.${field}`;
    const value = row.roundTripValue;
    if (row.fate !== 'instructive') {
      P(at, `[P2] ${name} states roundTripValue but its fate is '${shown(row.fate)}' — it is the value a derived round-trip SENDS in an INSTRUCTIVE field of its read; a selector is addressed from the write, and a durable or transformed field keeps its distinctive value`);
      continue;
    }
    if (!Number.isSafeInteger(value)) {
      P(at, `[P2] ${name} roundTripValue '${shown(value)}' is not a whole number — state the number the round-trip sends, unquoted (0, 100, -1)`);
      continue;
    }
    const type = manifest.dtos.get(dtoKey)?.fields.find((x) => x.name === field)?.type;
    const whole = wholeTypeOf(type);
    if (!whole) {
      P(at, `[P2] ${name} roundTripValue on a '${shown(type)}' field — it takes whole-number fields only (${[...WHOLE_TYPES.keys()].join(', ')}); every other instructive type keeps its distinctive value`);
      continue;
    }
    const [min, max] = WHOLE_TYPES.get(whole);
    if (value < min || value > max) {
      P(at, `[P2] ${name} roundTripValue ${value} does not fit its '${type}' field (${min}..${max}) — the derived round-trip could not send it`);
      continue;
    }
    const carriers = [...contractOps].filter(([, op]) => op.requestDtos.has(dtoKey)).map(([op]) => op);
    if (carriers.some((op) => reads.has(op))) continue;
    const written = carriers.filter((op) => writes.has(op));
    P(at, written.length
      ? `[P2] ${name} roundTripValue on a WRITE — ${dtoKey} is carried by the request of ${written.join(', ')}, which a derived round-trip composes with distinctive values, and by no roundTrip read of ${raName}: the value would never be sent`
      : `[P2] ${name} roundTripValue that nothing sends — no durable row of ${raName} names a roundTrip read whose request carries ${dtoKey}${carriers.length ? ` (it is carried by ${carriers.join(', ')})` : ''}, so no derived round-trip composes it`);
  }
}

// ---------------------------------------------------------------------------- answer-source walk
// The Software Architect's order on relay R-260 (2026-09-13): "please address all recommended
// measures." Its first two measures live here. Figaro's first Access build round stopped on design
// gaps in all four Access components; the two biggest kinds were "the answer has no source" (a
// returned field no request field and no seam member can supply) and "no store call can do the job"
// (a write no seam call performs). All of them passed the Contract gate, because the sheet walked
// tables, fates, grants and faults and never the OPERATION — and by design a response field carried
// no row at all. The `walk:` section walks each contract operation variant on paper; [P11] holds
// every name in it to something that exists, [P12] holds every durable field to the column and the
// seam row member its write needs. Existence is what the checker can verify; whether the source is
// the RIGHT one stays the Contract reviewer's question.

const READ_EFFECTS = ['read', 'GET'];
const SOURCE_KINDS = ['request', 'seam', 'constant', 'rule'];
const WALK_KEYS = ['op', 'variant', 'writes', 'acts', 'returns'];
const variantKey = (op, variant) => `${op} ${variant}`;
const isMap = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const shown = (v) => (v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
/** Storage-name comparison: case and separators ignored, so `OrderId` meets `order_id`. */
const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Every (contract operation, request VARIANT) of an Access, in manifest order. A polymorphic request
 * (`dto X abstract` + `dto X_Variant sealed extends X`) is one variant per concrete subtype — the
 * permutations the model draws, and exactly where two variants of one operation read and write
 * different things; any other request is its own single variant.
 */
function operationVariants(manifest) {
  const concrete = (key, seen) => {
    if (seen.has(key)) return [];
    seen.add(key);
    const subs = manifest.subtypes.get(key) || [];
    const own = !subs.length || !manifest.dtos.get(key)?.abstract ? [key] : [];
    return [...own, ...subs.flatMap((sub) => concrete(sub, seen))];
  };
  const out = [];
  const seen = new Set();
  for (const op of manifest.ops)
    for (const variant of concrete(op.reqKey, new Set())) {
      const k = variantKey(op.name, variant);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ op: op.name, variant, reqKey: op.reqKey, resKey: op.resKey });
    }
  return out;
}

/** The DTOs a variant inherits from, nearest first. */
function ancestorsOf(manifest, key) {
  if (!manifest._parents) {
    manifest._parents = new Map();
    for (const [base, subs] of manifest.subtypes) for (const sub of subs) manifest._parents.set(sub, base);
  }
  const out = [];
  for (let k = manifest._parents.get(key); k && !out.includes(k); k = manifest._parents.get(k)) out.push(k);
  return out;
}

/** What one request variant reaches: itself, its ancestors and their field types — never a sibling variant. */
function variantClosure(manifest, variant) {
  const seen = manifestClosure(manifest, [variant]);
  for (const base of ancestorsOf(manifest, variant)) {
    seen.add(base);
    const facet = base.split('.')[0];
    for (const f of manifest.dtos.get(base)?.fields || [])
      for (const tn of baseTypeNames(f.type)) {
        const candidates = shortIndexOf(manifest).get(tn) || [];
        const hit = candidates.find((k) => k.startsWith(`${facet}.`)) ?? (candidates.length === 1 ? candidates[0] : undefined);
        if (hit) for (const k of manifestClosure(manifest, [hit])) seen.add(k);
      }
  }
  return seen;
}

/** Every STRICT descendant of a DTO — the arms of a polymorphic response, sub-arms included. */
function descendantsOf(manifest, key) {
  const out = new Set();
  const visit = (k) => {
    for (const sub of manifest.subtypes.get(k) || []) if (!out.has(sub)) { out.add(sub); visit(sub); }
  };
  visit(key);
  return out;
}

/**
 * The result ARM that answers ONE request variant, by the model's OWN naming contract (#1626):
 * per-variant results are `{Base}_{Variant}_Result` extending `{Base}_Result`, allowed only where
 * the operation's response is named `{Base}_Result` — the rule sns-cli's engine enforces on
 * `AddDto`/`SetDtoExtends`, in the operation's own facet (ADR-027 §3). Undefined where the model
 * declares no such arm, and undefined means the WHOLE response closure: a response nobody split by
 * variant is answered whole by every variant, and a naming the engine would refuse is not one to
 * pair from — a guessed pairing would silently stop ASKING for a field somebody has to answer.
 */
function resultArmOf(manifest, v) {
  if (v.resKey.split('.')[1] !== `${v.reqKey.split('.')[1]}_Result`) return undefined;
  const arm = `${v.resKey.split('.')[0]}.${v.variant.split('.')[1]}_Result`;
  return descendantsOf(manifest, v.resKey).has(arm) ? arm : undefined;
}

/** The fields of a DTO closure, `<Facet>.<Dto>.<Field>`, in manifest order. */
function fieldsOfClosure(manifest, closure) {
  return [...manifest.dtos.entries()]
    .filter(([key]) => closure.has(key))
    .flatMap(([key, dto]) => dto.fields.map((f) => `${key}.${f.name}`));
}

/** Every returned field of a response, nested DTOs and EVERY result arm included. */
function responseFields(manifest, resKey) {
  return fieldsOfClosure(manifest, manifestClosure(manifest, [resKey]));
}

/**
 * What ONE request variant answers: the result arm paired with it (or none), and the returned
 * fields it owes a source for — the base result, whatever either carries through a FIELD, and its
 * OWN arm; never a SIBLING arm's (#1626).
 *
 * `manifestClosure` follows the inheritance edge DOWN, so the whole-response walk handed
 * `FetchArticles_Page` the delta arm's high-water mark and asked where its value comes from — a
 * question that has no answer to that request, and whose only green is a source that is not a
 * source (figaro walked it as `constant: 'not this arm: …'`, which reads correctly and is checked
 * for nothing). The exclusion is the response-side mirror of `variantClosure`, which the REQUEST
 * side has done since the start. Data subtypes NESTED inside the result are untouched — a row DTO
 * with state arms is legitimately answered by every variant that returns the row, and it is reached
 * through a field, not down the response's own inheritance edge.
 */
function variantResponse(manifest, v) {
  const arm = resultArmOf(manifest, v);
  return {
    arm,
    fields: arm ? fieldsOfClosure(manifest, variantClosure(manifest, arm)) : responseFields(manifest, v.resKey),
  };
}

/** The seams of an Access, from the WHOLE slot table: a walk may call a seam this run did not sheet. */
const accessSeams = (raName) => [...new Set(view.slots.filter((sl) => sl.owner === raName).map((sl) => sl.seam))];

/** The members of a C# type text: a tuple's named elements, and the members of every row type it names. */
function membersOfType(typeText, records) {
  const t = String(typeText ?? '');
  const out = [];
  const open = t.indexOf('(');
  const span = open >= 0 ? parenSpan(t, open) : undefined;
  if (span) for (const el of splitTopLevel(span.inner).map(readParam)) if (el) out.push(el);
  const outside = span ? t.slice(0, open) + t.slice(span.end + 1) : t;
  for (const tn of baseTypeNames(outside)) for (const m of records.get(tn) || []) out.push(m);
  return out;
}

/** Does `parts` walk down from a type, member by member? `{ ok }` or `{ ok: false, at }`. */
function resolveMemberPath(typeText, parts, records) {
  let types = [typeText];
  for (let i = 0; i < parts.length; i++) {
    const next = [];
    for (const t of types) for (const m of membersOfType(t, records)) if (m.name === parts[i]) next.push(m.type);
    if (!next.length) return { ok: false, at: parts.slice(0, i + 1).join('.') };
    types = next;
  }
  return { ok: true };
}

/**
 * A `seam:` reference: `<Op>` (what the call returns), `<Op>.<Member>[.<Member>…]` (a member of
 * what it returns — a row member or a named tuple element) or `<Row>.<Member>` (a member of a row
 * type the seam declares). `<ISeam>.` in front scopes it to one seam of a multi-seam Access, and is
 * required where two of its seams declare the same name. `{ ok }` or `{ error }`.
 */
function resolveSeamRef(seams, ref) {
  const text = String(ref ?? '').trim();
  if (!text) return { error: 'names nothing' };
  let parts = text.split('.');
  let scope = seams;
  if (parts.length > 1 && seams.includes(parts[0])) { scope = [parts[0]]; parts = parts.slice(1); }
  const decls = scope.map((seam) => [seam, seamDeclaration(seam)]).filter(([, d]) => !d.error);
  const ops = decls.filter(([, d]) => d.sigs.has(parts[0]));
  if (ops.length > 1)
    return { error: `operation '${parts[0]}' is declared by ${ops.map(([seam]) => seam).join(' and ')} — qualify it as <ISeam>.${text}` };
  if (ops.length === 1) {
    const [seam, d] = ops[0];
    const sig = d.sigs.get(parts[0]);
    const hit = resolveMemberPath(sig.returns, parts.slice(1), d.records);
    return hit.ok ? { ok: true } : { error: `${seam}.${parts[0]} returns '${sig.returns}', which carries no '${hit.at}'` };
  }
  const rows = decls.filter(([, d]) => d.records.has(parts[0]));
  if (!rows.length) return { error: `names neither an operation nor a row type of ${scope.join(', ')}` };
  if (parts.length < 2) return { error: `'${parts[0]}' is a row type, not a value — name its member, <Row>.<Member>` };
  const hits = rows.map(([, d]) => resolveMemberPath(parts[0], parts.slice(1), d.records));
  return hits.some((m) => m.ok) ? { ok: true } : { error: `row type ${parts[0]} has no member '${parts.slice(1).join('.')}'` };
}

/** A `call:` — one seam operation, `<Op>` or `<ISeam>.<Op>`. `{ seam, op }` or `{ error }`. */
function resolveCall(seams, name) {
  let parts = String(name).split('.');
  let scope = seams;
  if (parts.length === 2 && seams.includes(parts[0])) { scope = [parts[0]]; parts = parts.slice(1); }
  if (parts.length !== 1 || !parts[0]) return { error: `'${name}' does not read as <Operation> or <ISeam>.<Operation>` };
  const hits = scope.filter((seam) => seamDeclaration(seam).sigs?.has(parts[0]));
  if (!hits.length) return { error: `no seam of this Access declares an operation '${parts[0]}' (${scope.join(', ')})` };
  if (hits.length > 1) return { error: `'${parts[0]}' is declared by ${hits.join(' and ')} — qualify it as <ISeam>.${parts[0]}` };
  return { seam: hits[0], op: parts[0] };
}

/** A shape section's entries with their ids, named as `checkShape` names them. */
function shapeEntriesOf(sheet, kind) {
  const own = sheet?.shape?.[kind.shapeKey];
  if (!Array.isArray(own)) return [];
  const idParts = kind.entry.idParts ?? [kind.entry.id];
  return own.filter((e) => isMap(e) && idParts.every((k) => typeof e[k] === 'string' && e[k].trim()))
    .map((e) => ({ id: idParts.map((k) => e[k].trim()).join(' '), entry: e }));
}

/** The member names of a shape entry — columns, document fields, layout members — or undefined where the kind lists none. */
function shapeMemberNames(entry, kind) {
  const members = kind.entry.members ? entry?.[kind.entry.members] : undefined;
  if (!Array.isArray(members)) return undefined;
  return members.filter((m) => isMap(m) && typeof m.name === 'string').map((m) => m.name);
}

/**
 * [P11] and [P12] for one Access, over all of its sheets read in this run. Returns 'walked' or
 * 'unwalked'. Keyed per ACCESS for the reason fates completeness is: the contract operations are
 * the Access's while the sheets belong to its seams, so an operation variant owes ONE walk entry
 * across the Access's sheets, and a walk may name calls on any of the Access's seams.
 */
function checkWalk({ raName, access, where, sheetsRead, sheetInfo, durableRows, faultRows, P, infos, notices }) {
  const manifest = access.manifest;
  const seams = accessSeams(raName);
  const variants = operationVariants(manifest);
  // A `--seam` run narrows the SHEETS it checks, not the Access: the walk, and the operations and
  // shape its calls resolve against, may sit on a sibling sheet outside the run. Read those too, or a
  // walked Access reads as NOT WALKED and a correct `column:` as naming nothing.
  for (const sh of allSheets) {
    if (sh.owner !== raName || sheetInfo.has(sh.seam) || !KINDS[sh.resourceKind] || !existsSync(sheetPath(sh.seam))) continue;
    const sheet = readYaml(sheetPath(sh.seam));
    sheetInfo.set(sh.seam, {
      at: rel(sheetPath(sh.seam)), sheet, kind: KINDS[sh.resourceKind], resourceKind: sh.resourceKind,
      sheetOps: new Map((Array.isArray(sheet?.operations) ? sheet.operations : []).filter(isMap).map((o) => [o.op, o])),
    });
  }
  const carriers = [...sheetInfo.keys()].filter((seam) => sheetInfo.get(seam).sheet?.walk !== undefined);

  if (!carriers.length) {
    const state = `${raName} carries no answer-source walk on ${sheetsRead.length === 1 ? 'its sheet' : `any of its sheets (${sheetsRead.join(', ')})`}` +
      ` — ${variants.length} contract operation variant(s) unwalked, and ${durableRows.length} durable field(s) whose column and seam row member [P12] cannot check without it`;
    if (walkRequired(raName, seams))
      P(where, `[P11] ${state}. Required by ${REQUIRE_WALK}: \`resource-protocol.mjs --skeleton … ${REQUIRE_WALK} ${raName}\` adds the section with its generated keys (or put \`walk: []\` on the sheet and run \`just resource-protocol-skeleton\`), then author every source, write and act (resource-protocol-format.md, the walk section)`);
    else
      notices.push(`${where}: [P11] NOT WALKED — ${state}. Advisory; ${REQUIRE_WALK} makes it red (the Software Architect's order on relay R-260)`);
    return 'unwalked';
  }

  const writeCallsOf = new Map(); // variantKey -> [{ seam, op }], or undefined with no writes list
  const seen = new Map();          // variantKey -> the sheet it is walked on
  const faultDeclared = (op, identity) => faultRows.some(({ row }) => row.op === op && row.identity === identity);

  for (const seam of carriers) {
    const { at, sheet } = sheetInfo.get(seam);
    if (!Array.isArray(sheet.walk)) { P(at, `[P11] walk is not a list — one entry per contract operation variant`); continue; }
    sheet.walk.forEach((entry, i) => {
      if (!isMap(entry)) { P(at, `[P11] walk[${i}] is not a mapping`); return; }
      if (typeof entry.op !== 'string' || !entry.op.trim()) { P(at, `[P11] walk[${i}] has no 'op' — the RA contract operation it walks`); return; }
      const ofOp = variants.filter((v) => v.op === entry.op);
      if (!ofOp.length) { P(at, `[P11] walk entry '${entry.op}' names no contract operation of ${raName} (stale — \`just resource-protocol-skeleton\` drops it)`); return; }
      const v = ofOp.find((x) => x.variant === entry.variant);
      if (!v) { P(at, `[P11] walk entry '${entry.op}' names variant '${shown(entry.variant)}', which is no request variant of ${entry.op} — its variant(s): ${ofOp.map((x) => x.variant).join(', ')}`); return; }
      const label = `${v.op} (variant ${v.variant})`;
      const k = variantKey(v.op, v.variant);
      if (seen.has(k)) { P(at, `[P11] ${label} is walked twice${seen.get(k) !== at ? ` — also on ${seen.get(k)}` : ''}; an operation variant has ONE walk`); return; }
      seen.set(k, at);

      // ── writes: each names the ONE seam call that performs it; acts: each "in the same act", ONE call
      const oneCall = (value, what, noun) => {
        if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
          P(at, `[P11] ${label} ${noun} ${what} names no seam call — ${noun === 'write' ? 'every write names the ONE seam call that performs it' : 'what happens "in the same act" happens in ONE call; name it'}`);
          return undefined;
        }
        if (typeof value !== 'string') {
          const n = Array.isArray(value) ? value.length : 0;
          P(at, `[P11] ${label} ${noun} ${what} names ${Array.isArray(value) ? `${n} seam calls [${value.join(', ')}]` : `'${shown(value)}'`} where ONE belongs — ` +
            (noun === 'write' ? 'two calls are two writes, and neither guarantees the other' : `what happens "in the same act" happens in one call${n > 1 ? `; ${n} calls are ${n} acts, and nothing makes them one` : ''}`));
          return undefined;
        }
        const c = resolveCall(seams, value);
        if (c.error) { P(at, `[P11] ${label} ${noun} ${what} names call '${value}' — ${c.error}`); return undefined; }
        const effect = sheetInfo.get(c.seam)?.sheetOps.get(c.op)?.effect;
        if (READ_EFFECTS.includes(effect))
          P(at, `[P11] ${label} ${noun} ${what} names call '${value}', which ${c.seam}'s operations classify as '${effect}' — a read cannot perform it`);
        return c;
      };
      const calls = [];
      if (!Array.isArray(entry.writes)) {
        P(at, `[P11] ${label} has no writes list (found '${shown(entry.writes)}') — list each write with its ONE seam call, or \`writes: []\` when this variant writes nothing`);
      } else {
        entry.writes.forEach((w, j) => {
          if (!isMap(w)) { P(at, `[P11] ${label} writes[${j}] is not a mapping — { write: <what is written>, call: <seam operation> }`); return; }
          const named = typeof w.write === 'string' && w.write.trim();
          if (!named) P(at, `[P11] ${label} writes[${j}] has no 'write' — name what is written`);
          const c = oneCall(w.call, named ? `'${w.write}'` : `writes[${j}]`, 'write');
          if (c) calls.push(c);
        });
      }
      writeCallsOf.set(k, Array.isArray(entry.writes) ? calls : undefined);
      if (entry.acts !== undefined) {
        if (!Array.isArray(entry.acts)) P(at, `[P11] ${label} acts is not a list — { act: <what happens together>, call: <the ONE seam call> }`);
        else entry.acts.forEach((a, j) => {
          if (!isMap(a)) { P(at, `[P11] ${label} acts[${j}] is not a mapping`); return; }
          const named = typeof a.act === 'string' && a.act.trim();
          if (!named) P(at, `[P11] ${label} acts[${j}] has no 'act' — name what happens in the same act`);
          const what = named ? `'${a.act}'` : `acts[${j}]`;
          const c = oneCall(a.call, what, 'act');
          if (c && !calls.some((x) => x.seam === c.seam && x.op === c.op))
            P(at, `[P11] ${label} act ${what} names call '${a.call}', which none of this variant's writes names — the act would be performed by a call the walk never makes`);
        });
      }

      // ── returns: every returned field names ONE source, and that source exists
      const { arm, fields: expected } = variantResponse(manifest, v);
      const requestKeys = [v.variant, ...ancestorsOf(manifest, v.variant)];
      const inputProblem = (input) => {
        const text = String(input ?? '');
        const dot = text.indexOf('.');
        const kind = dot < 0 ? text : text.slice(0, dot);
        const rest = dot < 0 ? '' : text.slice(dot + 1);
        if (kind === 'request') {
          const hit = rest ? resolveResponseField(manifest, requestKeys, rest) : { ok: false, at: '' };
          return hit.ok ? undefined : `the request ${v.variant} carries no '${rest}'${hit.at && hit.at !== rest ? ` (unresolved at '${hit.at}')` : ''}`;
        }
        if (kind === 'seam') { const hit = resolveSeamRef(seams, rest); return hit.ok ? undefined : `seam '${rest}' ${hit.error}`; }
        if (kind === 'fault') return faultDeclared(v.op, rest) ? undefined : `no faults row of ${raName} declares '${rest}' answerable on ${v.op}`;
        return `'${text}' reads as none of request.<field>, seam.<member>, fault.<identity>`;
      };
      if (!Array.isArray(entry.returns)) {
        P(at, `[P11] ${label} has no returns list (found '${shown(entry.returns)}') — one row per field of its response ${v.resKey}`);
      } else {
        const rows = new Set();
        entry.returns.forEach((row, j) => {
          if (!isMap(row) || typeof row.field !== 'string') { P(at, `[P11] ${label} returns[${j}] has no 'field' — <Facet>.<Dto>.<Field> of the response`); return; }
          const f = row.field;
          if (!expected.includes(f)) {
            // Name the SIBLING ARM case for what it is (#1626). A sheet walked before the pairing
            // landed carries a row per sibling field — figaro's `constant: 'not this arm: …'` — and
            // "the response carries no such field" would be false about every one of them: the
            // response does carry it, on an arm this request is not answered by.
            P(at, arm && responseFields(manifest, v.resKey).includes(f)
              ? `[P11] ${label} returns ${f} — that field is carried by a SIBLING result arm, and this variant is answered by ${arm} (stale row; \`just resource-protocol-skeleton\` drops it)`
              : `[P11] ${label} returns ${f} — the response ${v.resKey} carries no such field (stale row; \`just resource-protocol-skeleton\` drops it)`);
            return;
          }
          if (rows.has(f)) { P(at, `[P11] ${label} returns ${f} appears twice`); return; }
          rows.add(f);
          const kinds = SOURCE_KINDS.filter((x) => row[x] !== undefined);
          if (row.source !== undefined)
            P(at, `[P11] ${label} returns ${f} still carries the skeleton's 'source: ${shown(row.source)}' — name the source as request | seam | constant | rule`);
          else if (!kinds.length)
            P(at, `[P11] ${label} returns ${f} names no source — request: <field> | seam: <operation or row member> | constant: <value> | rule: <statement> with from: [...]`);
          if (kinds.length > 1)
            P(at, `[P11] ${label} returns ${f} names ${kinds.length} sources (${kinds.join(', ')}) — exactly one; a value with two sources is a decision left to the implementor`);
          if (row.from !== undefined && !kinds.includes('rule'))
            P(at, `[P11] ${label} returns ${f} carries 'from:' without 'rule:' — from: names a rule's inputs`);
          if (kinds.length !== 1) return;
          const value = row[kinds[0]];
          if (kinds[0] === 'request') {
            const problem = typeof value === 'string' && value.trim() ? inputProblem(`request.${value}`) : 'names no request field';
            if (problem) P(at, `[P11] ${label} returns ${f} from request '${shown(value)}' — ${problem}: that source does not exist`);
          } else if (kinds[0] === 'seam') {
            const hit = typeof value === 'string' ? resolveSeamRef(seams, value) : { error: 'is not a name' };
            if (!hit.ok) P(at, `[P11] ${label} returns ${f} from seam '${shown(value)}' — ${hit.error}: that source does not exist`);
          } else if (kinds[0] === 'constant') {
            if (value === null || typeof value === 'object' || (typeof value === 'string' && !value.trim()))
              P(at, `[P11] ${label} returns ${f} from an empty constant — state the value`);
          } else {
            const says = typeof value === 'string' && value.trim();
            if (!says) P(at, `[P11] ${label} returns ${f} by a rule that states nothing — rule: <the statement the value follows>`);
            if (!Array.isArray(row.from) || !row.from.length)
              P(at, `[P11] ${label} returns ${f} by rule${says ? ` '${value}'` : ''} naming no inputs — a rule computes from something: from: [request.<field>, seam.<member>, fault.<identity>]`);
            else for (const input of row.from) {
              const problem = inputProblem(input);
              if (problem) P(at, `[P11] ${label} returns ${f} by rule — input '${shown(input)}': ${problem}`);
            }
          }
        });
        for (const f of expected)
          if (!rows.has(f)) P(at, `[P11] ${label} returns ${f} has no source row — every returned field names where its value comes from (\`just resource-protocol-skeleton\` adds the row)`);
      }
      for (const key of Object.keys(entry))
        if (!WALK_KEYS.includes(key) && key !== 'note')
          P(at, `[P11] ${label} carries '${key}:', which the walk does not know — ${WALK_KEYS.join(', ')}, note`);
    });
  }
  for (const v of variants)
    if (!seen.has(variantKey(v.op, v.variant)))
      P(where, `[P11] ${v.op} (variant ${v.variant}) has no walk entry on any sheet of ${raName} — every contract operation variant owes one (\`just resource-protocol-skeleton\` adds it)`);

  // [P12] a durable field has a column on a table its write's call acts on, and a member on what that
  // call passes — the rule Figaro's two sheet reviews wrote down as "mechanisable: yes" (finding F2).
  let held = 0;
  for (const d of durableRows) {
    const name = `${d.dtoKey}.${d.field}`;
    const walkedWrites = variants.filter((v) => v.op === d.row.roundTrip.write && writeCallsOf.get(variantKey(v.op, v.variant))
      && variantClosure(manifest, v.variant).has(d.dtoKey));
    for (const v of walkedWrites) {
      const calls = writeCallsOf.get(variantKey(v.op, v.variant));
      const label = `${v.op} (variant ${v.variant})`;
      if (!calls.length) {
        P(d.at, `[P12] durable ${name} — its write ${label} names no seam call in its walk, so nothing is shown to store the field`);
        continue;
      }
      held++;
      const callList = calls.map((c) => c.op).join(', ');

      // the STORAGE half — a member of a shape entry the write's call acts on
      const targets = [];
      for (const c of calls) {
        const info = sheetInfo.get(c.seam);
        if (!info) continue; // an unsheeted seam is --require-all's business, not this condition's
        const shaped = shapeEntriesOf(info.sheet, info.kind);
        const on = info.sheetOps.get(c.op)?.on;
        for (const id of Array.isArray(on) ? on : [])
          targets.push({ id: String(id), kind: info.kind, entry: shaped.find((e) => e.id === String(id))?.entry });
      }
      const listed = targets.filter((t) => shapeMemberNames(t.entry, t.kind) !== undefined);
      const vocab = (listed[0] ?? targets[0])?.kind.entry;
      const noun = vocab?.noun ?? 'entry';
      const memberNoun = vocab?.memberNoun ?? 'member';
      if (d.row.column !== undefined) {
        const text = typeof d.row.column === 'string' ? d.row.column.trim() : '';
        const match = [...targets].sort((a, b) => b.id.length - a.id.length).find((t) => text === t.id || text.startsWith(`${t.id}.`));
        if (!text) {
          P(d.at, `[P12] durable ${name} — column '${shown(d.row.column)}' does not read as <${noun}>.<${memberNoun}>`);
        } else if (!match) {
          P(d.at, `[P12] durable ${name} — column '${text}' names no ${noun} its write ${label} acts on (${callList} on: ${targets.map((t) => t.id).join(', ') || 'nothing'}), so the STORAGE half is missing — the value is kept where its write puts it`);
        } else if (text !== match.id) {
          const member = text.slice(match.id.length + 1);
          const names = shapeMemberNames(match.entry, match.kind);
          if (names && !names.includes(member))
            P(d.at, `[P12] durable ${name} — column '${text}': ${match.kind.entry.noun} '${match.id}' declares no ${match.kind.entry.memberNoun} '${member}', so the STORAGE half is missing`);
        }
      } else if (listed.length && !listed.some((t) => shapeMemberNames(t.entry, t.kind).some((n) => norm(n) === norm(d.field)))) {
        P(d.at, `[P12] durable ${name} — its write ${label} calls ${callList}, which acts on ${listed.map((t) => t.id).join(', ')}, and no ${memberNoun} there is named for it: the STORAGE half is missing. Add the ${memberNoun} to the shape, or name where the value is kept with \`column: <${noun}>.<${memberNoun}>\` on this fates row (\`column: <${noun}>\` when the field is kept as that ${noun}'s rows)`);
      }

      // the SEAM ROW half — a parameter of the call, or a member of a row type it passes
      const reach = [];
      const rowTypes = new Set();
      const params = [];
      for (const c of calls) {
        const decl = seamDeclaration(c.seam);
        const sig = decl.sigs?.get(c.op);
        if (!sig) continue;
        const visited = new Set();
        const walkType = (typeText) => {
          for (const tn of baseTypeNames(typeText)) {
            if (!decl.records.has(tn) || visited.has(tn)) continue;
            visited.add(tn);
            rowTypes.add(tn);
            for (const m of decl.records.get(tn)) { reach.push({ name: m.name, type: tn }); walkType(m.type); }
          }
        };
        for (const prm of sig.params) { params.push(prm.name); reach.push({ name: prm.name }); walkType(prm.type); }
      }
      if (!reach.length && !params.length && !calls.some((c) => seamDeclaration(c.seam).sigs?.has(c.op))) continue; // declaration unreadable — reported where it is read
      const rowList = rowTypes.size ? `row type(s) ${[...rowTypes].join(', ')}` : 'no row type';
      if (d.row.member !== undefined) {
        const text = typeof d.row.member === 'string' ? d.row.member.trim() : '';
        const cut = text.lastIndexOf('.');
        const found = !!text && (cut < 0
          ? reach.some((r) => r.name === text)
          : reach.some((r) => r.type === text.slice(0, cut) && r.name === text.slice(cut + 1)));
        if (!found)
          P(d.at, `[P12] durable ${name} — member '${shown(d.row.member)}' is carried by nothing its write ${label} passes to ${callList} (${rowList}; parameter(s) ${params.join(', ') || 'none'}), so the SEAM ROW half is missing`);
      } else if (!reach.some((r) => norm(r.name) === norm(d.field))) {
        P(d.at, `[P12] durable ${name} — its write ${label} calls ${callList}, and nothing that call passes carries the field: the SEAM ROW half is missing (${rowList}; parameter(s) ${params.join(', ') || 'none'}). Add the member to the seam row type, or name it with \`member: <Row>.<Member>\` on this fates row`);
      }
    }
  }
  infos.push(`${where}: answer-source walk — ${seen.size} of ${variants.length} contract operation variant(s) walked; ${held} durable field write(s) held to a column and a seam row member [P12]`);
  return 'walked';
}

// ---------------------------------------------------------------------------- schema emission
// #970: the relational schema is GENERATED from the blessed `shape:` section, so the implementor
// never hand-writes a second one. Before this, the human blessed a table design at Contract and the
// driver author read it as prose and re-typed it into a migration, with nothing comparing the two
// — #798's doc-drift class reborn one level down, and the exact hole ADR-059 left open for the
// shape section. There is now one source. RelationalDB only: a document store has no DDL to emit
// and a REST API has no schema at all (ADR-059 amendment, #970).

// THE DIALECT IS THE SLOT'S PRODUCT (#1734). The generator wrote one dialect for every product:
// `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` with double-quoted identifiers, which
// PostgreSQL and SQLite accept and T-SQL does not have at all — so a sheet whose slot is ruled on
// SQL Server / Azure SQL Database got a schema its own product cannot run (52 statements over six
// schemas on the first project to rule that product). The product is already declared, on the slot,
// by the Software Architect's ruling (ADR-071 §2): the dialect is DERIVED from it, never a new sheet
// field. A product whose dialect this generator cannot write is REFUSED, not guessed — the guess is
// the defect this replaces.
const DIALECTS = {
  // PostgreSQL ≥ 9.5 and SQLite both take the IF NOT EXISTS forms, partial indexes and "quoted" names.
  ansi: {
    label: 'PostgreSQL / SQLite',
    match: /postgre|npgsql|sqlite/i,
    q: (id) => `"${String(id).replace(/"/g, '""')}"`,
    table: (name, q) => [`CREATE TABLE IF NOT EXISTS ${q(name)} (`],
    index: (name, table, cols, where, q, unique) =>
      [`CREATE ${unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${q(name)} ON ${q(table)} (${cols})${where ? ` WHERE ${where}` : ''};`],
  },
  // T-SQL has no IF NOT EXISTS on CREATE TABLE / CREATE INDEX: the guard is a catalog probe. Names
  // are [bracketed], so no statement depends on the session's QUOTED_IDENTIFIER setting; the probe
  // resolves the table the way the CREATE does (the connection's default schema).
  tsql: {
    label: 'T-SQL (SQL Server / Azure SQL Database)',
    match: /sql\s*server|azure\s*sql|sqlclient/i,
    q: (id) => `[${String(id).replace(/]/g, ']]')}]`,
    table: (name, q) => [`IF OBJECT_ID(${nstr(q(name))}, N'U') IS NULL`, `CREATE TABLE ${q(name)} (`],
    index: (name, table, cols, where, q, unique) => [
      `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = ${nstr(name)} AND object_id = OBJECT_ID(${nstr(q(table))}, N'U'))`,
      `    CREATE ${unique ? 'UNIQUE NONCLUSTERED ' : ''}INDEX ${q(name)} ON ${q(table)} (${cols})${where ? ` WHERE ${where}` : ''};`,
    ],
  },
};
/** A T-SQL Unicode string literal. */
const nstr = (s) => `N'${String(s).replace(/'/g, "''")}'`;

/**
 * The dialect one sheet's schema is written in, read off its slots' `product` and `driver`, or an
 * error naming why none can be written. Every slot sharing the seam builds the same schema, so they
 * must agree on the dialect too.
 */
function dialectOf(sheetKey) {
  const found = sheetKey.slots.map((s) => {
    const words = `${s.product ?? ''} ${s.driver ?? ''}`;
    // SQL Server is tested FIRST: its EF driver's name contains no other product, but a product line
    // such as "Azure SQL Database" must never fall through to a looser match.
    const id = DIALECTS.tsql.match.test(words) ? 'tsql' : DIALECTS.ansi.match.test(words) ? 'ansi' : undefined;
    return { slot: s, id };
  });
  const unknown = found.filter((f) => !f.id);
  if (unknown.length)
    return { error: `${sheetKey.seam}: no schema dialect this generator can write for ${unknown.map((f) => `slot '${f.slot.slot}' (product '${f.slot.product}', driver '${f.slot.driver}')`).join(', ')} — it writes ${Object.values(DIALECTS).map((d) => d.label).join(' and ')}, and it refuses rather than emit DDL its product cannot run (#1734)` };
  const ids = [...new Set(found.map((f) => f.id))];
  if (ids.length > 1)
    return { error: `${sheetKey.seam}: its slots speak two SQL dialects (${found.map((f) => `'${f.slot.slot}' ${DIALECTS[f.id].label}`).join(', ')}) — one sheet emits one schema, so it cannot be written for both (#1734)` };
  return { id: ids[0] };
}

/**
 * `INDEX [name] (a, b DESC) [WHERE …]` → { name?, columns: [{ name, dir? }], where? }, or undefined
 * when the entry does not read that way. The generator used to strip the keyword and the outer
 * parentheses and split on commas, so a NAMED index, a sort direction or a filter became column
 * names — `ON "t" ("ix_name (a", "b) WHERE a IS NULL")` — in a file that parsed nowhere. [P6] now
 * refuses an entry this cannot read, and the schema is written from what it reads.
 */
function readIndex(constraint) {
  const m = String(constraint).trim()
    .match(/^INDEX\s*(?:("?)([A-Za-z_][\w$]*)\1\s*)?\(([^()]*)\)\s*(?:WHERE\s+([\s\S]*?))?\s*;?$/i);
  if (!m) return undefined;
  const columns = m[3].split(',').map((s) => s.trim()).filter(Boolean).map((c) => {
    const k = c.match(/^("?)([A-Za-z_][\w$]*)\1(?:\s+(ASC|DESC))?$/i);
    return k ? { name: k[2], dir: k[3]?.toUpperCase() } : undefined;
  });
  if (!columns.length || columns.some((c) => !c)) return undefined;
  if (m[4] !== undefined && !m[4].trim()) return undefined;
  return { name: m[2], columns, where: m[4]?.trim() };
}

/**
 * `UNIQUE [name] (a, b) [WHERE …]` → { name?, columns: [{ name, dir? }], where? }, or undefined when
 * the entry does not read that way. #1742: a FILTERED uniqueness is not a table constraint in any
 * dialect this generator writes — T-SQL says a filter "can't be applied to primary key or unique
 * constraints" — so the sheet's `UNIQUE (…) WHERE …` has to become a standalone
 * `CREATE UNIQUE INDEX … WHERE …`. Before this the whole string rode into the CREATE TABLE body and
 * the engine refused the table; worse, a deployer who dropped the offending line to get past it
 * dropped the uniqueness rule with it, silently.
 */
function readUnique(constraint) {
  const m = String(constraint).trim()
    .match(/^UNIQUE\s*(?:("?)([A-Za-z_][\w$]*)\1\s*)?\(([^()]*)\)\s*(?:WHERE\s+([\s\S]*?))?\s*;?$/i);
  if (!m) return undefined;
  const columns = m[3].split(',').map((s) => s.trim()).filter(Boolean).map((c) => {
    const k = c.match(/^("?)([A-Za-z_][\w$]*)\1(?:\s+(ASC|DESC))?$/i);
    return k ? { name: k[2], dir: k[3]?.toUpperCase() } : undefined;
  });
  if (!columns.length || columns.some((c) => !c)) return undefined;
  if (m[4] !== undefined && !m[4].trim()) return undefined;
  return { name: m[2], columns, where: m[4]?.trim() };
}

/** Does this constraint entry carry a WHERE? Such an entry may NEVER be passed into CREATE TABLE. */
const isFiltered = (c) => /\bWHERE\b/i.test(String(c));

/** The tables a table's FOREIGN KEY constraints point at — its own name excluded (#1742). */
function foreignKeyTargets(table) {
  const out = [];
  for (const c of (table.constraints || []).map(String)) {
    if (constraintKeyword(c) !== 'FOREIGN KEY') continue;
    const m = c.match(/REFERENCES\s+("?[\w.]+"?)/i);
    if (m && m[1].replace(/"/g, '') !== table.name) out.push(m[1].replace(/"/g, ''));
  }
  return out;
}

/**
 * The order the CREATE TABLE statements are emitted in: a STABLE topological sort over the foreign-
 * key graph, or the cycle that makes one impossible (#1742). DDL has no deferred name resolution for
 * a foreign-key target, so a table emitted before the table it references fails on a fresh database
 * — and the generator used to emit them in sheet order, which made that a matter of luck.
 *
 * It is a DEPTH-FIRST post-order over the sheet's own order, which is stable in the two senses that
 * matter to a reviewer. A shape already in a runnable order is emitted EXACTLY as it stands, line for
 * line, so no correct committed schema moves over this fix. And a shape that is not moves only what
 * it must: a parent is pulled up to just before the child that named it, rather than every child
 * being pushed down past it, so the diff is the one edge and not the whole file.
 *
 * A GENUINE CYCLE IS REFUSED, NOT GUESSED. Breaking one needs `ALTER TABLE … ADD CONSTRAINT` after
 * both tables exist; SQLite cannot run that statement at all, so there is no form this generator
 * could write for every dialect it claims. The sheet author is told which edges close the cycle.
 */
function tableOrder(tables) {
  const first = new Map();
  tables.forEach((t, i) => { if (!first.has(t.name)) first.set(t.name, i); });
  const deps = tables.map((t, i) =>
    [...new Set(foreignKeyTargets(t))].filter((n) => first.has(n)).map((n) => first.get(n)).filter((j) => j !== i));
  const order = [];
  const done = new Set();
  const stack = [];
  let cycle;
  const visit = (i) => {
    if (done.has(i) || cycle) return;
    const at = stack.indexOf(i);
    if (at !== -1) { cycle = [...stack.slice(at), i].map((j) => tables[j].name).join(' → '); return; }
    stack.push(i);
    for (const d of deps[i]) visit(d);
    stack.pop();
    if (cycle) return;
    done.add(i);
    order.push(tables[i]);
  };
  tables.forEach((_, i) => visit(i));
  if (cycle)
    return { error: `the foreign keys form a cycle (${cycle}), so no order of CREATE TABLE statements satisfies them all — one edge has to be added after both tables exist, with ALTER TABLE … ADD CONSTRAINT, which is a statement SQLite cannot run and this generator does not write. Break the cycle in the shape, or take that edge out of the sheet and carry it as a plain column (#1742)` };
  return { order };
}

/** `INDEX …` / filtered `UNIQUE …` on table t → the CREATE INDEX statement it stands for. */
function indexStatement(table, constraint, dialect) {
  const unique = constraintKeyword(constraint) === 'UNIQUE';
  const ix = unique ? readUnique(constraint) : readIndex(constraint);
  if (!ix) return undefined;
  const { q } = dialect;
  const name = ix.name ?? `${table}_${ix.columns.map((c) => c.name).join('_')}_${unique ? 'ux' : 'idx'}`;
  const cols = ix.columns.map((c) => `${q(c.name)}${c.dir ? ` ${c.dir}` : ''}`).join(', ');
  return dialect.index(name, table, cols, ix.where, q, unique);
}

/** The schema file for one relational sheet — deterministic, in foreign-key dependency order. */
function emitSchema(sheetKey, shape, dialectId) {
  const { seam, slots } = sheetKey;
  const dialect = DIALECTS[dialectId];
  const { q } = dialect;
  const L = [];
  L.push(`-- ${seam}.schema.sql — GENERATED from ${seam}.protocol.yaml by`);
  L.push(`-- \`just resource-protocol-schema\` (#970, ADR-059). DO NOT EDIT.`);
  L.push(`--`);
  L.push(`-- The sheet's \`shape:\` section is the single source of this schema: it is what the human`);
  L.push(`-- blesses at Contract (ADR-059, amended 2026-08-23 — the LLM designs the tables, the human`);
  L.push(`-- reviews that design, and nobody hand-writes a second copy of it). To change the schema,`);
  L.push(`-- change the sheet, regenerate, and run the Contract act on the sheet again (ADR-058).`);
  L.push(`--`);
  // One line per SLOT: several slots may share this seam (alike instances in distinct roles), and
  // the schema they build is the same schema — which is exactly why the sheet is not per slot.
  for (const s of slots)
    L.push(`-- Slot '${s.slot}' of ${s.owner}: resource ${s.resource} (${s.resourceKind}${s.product ? ` / ${s.product}` : ''}).`);
  L.push(`-- Column types are the sheet's own words, in the product's vocabulary; the \`constraints:\``);
  L.push(`-- entries are passed through verbatim, which is why the sheet authors them as SQL.`);
  // Named only when it is not the historical one, so a PostgreSQL / SQLite schema that was already
  // correct is byte-for-byte what it was and no committed file goes stale over #1734.
  if (dialectId !== 'ansi') L.push(`-- Dialect: ${dialect.label}, derived from the slot's product.`);
  const indexes = [];
  // #1742: parents before children. `tableOrder` is stable, so a shape already in a runnable order
  // is emitted exactly as it stands; a cycle was refused by [P6] before this function was called.
  for (const table of tableOrder(shape.tables).order ?? shape.tables) {
    const cols = table.columns;
    const w1 = Math.max(...cols.map((c) => q(c.name).length));
    const w2 = Math.max(...cols.map((c) => String(c.type).length));
    const body = cols.map((c) => `    ${q(c.name).padEnd(w1)}  ${String(c.type).padEnd(w2)}${c.nullable === true ? '' : ' NOT NULL'}`.trimEnd());
    const pk = primaryKeyOf(table);
    if (pk.length) body.push(`    PRIMARY KEY (${pk.map(q).join(', ')})`);
    const authored = (table.constraints || []).map(String);
    // a column-level `key: unique` is one UNIQUE constraint — unless the sheet already spells the
    // same one out in `constraints:`, where writing it twice would build two indexes for one rule
    // …and a FILTERED one is no table constraint at all, so it never stands for a column's `key:
    // unique` either — it is a rule about a subset of the rows (#1742).
    const spelled = new Set(authored.filter((c) => constraintKeyword(c) === 'UNIQUE' && !isFiltered(c))
      .map((c) => c.replace(/^UNIQUE\s*/i, '').replace(/[()\s]/g, '')));
    for (const c of cols)
      if (readKey(c.key ?? '')?.kind === 'unique' && !spelled.has(c.name)) body.push(`    UNIQUE (${q(c.name)})`);
    for (const c of authored) {
      // INDEX is never a table constraint, and neither is a filtered UNIQUE: both become their own
      // CREATE [UNIQUE] INDEX statement after the tables (#1742). A WHERE inside a CREATE TABLE body
      // is refused by T-SQL and is meaningless in the others, so it may not be written at all.
      if (constraintKeyword(c) === 'INDEX' || (constraintKeyword(c) === 'UNIQUE' && isFiltered(c))) {
        const stmt = indexStatement(table.name, c, dialect);
        if (stmt) indexes.push(stmt);
      } else body.push(`    ${c}`);
    }
    L.push('');
    L.push(...dialect.table(table.name, q));
    L.push(body.join(',\n'));
    L.push(`);`);
  }
  if (indexes.length) { L.push(''); for (const i of indexes) L.push(...i); }
  L.push('');
  return L.join('\n');
}

/** The schema text for one SHEET, or a reason it has none. --schema and --check both go here. */
function schemaFor(sheetKey) {
  const { seam, resourceKind } = sheetKey;
  const kind = KINDS[resourceKind];
  if (!kind) return { skip: `${seam}: resourceKind '${resourceKind}' has no vocabulary in resource-protocol-format.md` };
  if (resourceKind !== 'RelationalDB')
    return { skip: `${seam} is ${resourceKind} — no schema is generated (a document store has no DDL, a REST API no schema); its shape section stays review-only` };
  const path = sheetPath(seam);
  if (!existsSync(path)) return { skip: `${seam}: no sheet at ${rel(path)} — \`just resource-protocol-skeleton\` generates it` };
  const sheet = readYaml(path);
  const bad = [];
  checkShape(sheet.shape, kind, resourceKind, (m) => bad.push(m));
  if (bad.length)
    return { error: `${rel(path)}: the shape does not hold, so no schema is emitted from it — \`just resource-protocol-check\` names it:\n${bad.map((b) => `  ${b}`).join('\n')}` };
  const dialect = dialectOf(sheetKey);
  if (dialect.error) return { error: dialect.error, dialect: true };
  return { text: emitSchema(sheetKey, sheet.shape, dialect.id) };
}

// ---------------------------------------------------------------------------- deployment view
// The slot table (deployment-view/2, ADR-065). From it come the two things this tool loops over:
// the SHEETS (one per distinct seam, each carrying the slots that name it) and, for the fates and
// fault-identity questions that are per Access, the Accesses that own them.

const view = readDeploymentView(deploymentDir, 'resource-protocol');
if (view.problems.length) {
  for (const p of view.problems) console.error(`resource-protocol: ${p}`);
  die(`the deployment view does not hold — \`deployment-view-check\` is where these are reported`);
}
if (!view.slots.length) die(`${rel(view.path)}: no slots — nothing to sheet`);

const model = modelFile ? loadModel(modelFile) : { system: undefined, componentNames: new Set(), useCases: [] };

/**
 * Do two system names agree? Case is ignored, on purpose (#1065). This file's `system:` is keyed
 * to the model's `projectName`, while its sibling under `03_Technology/` — `si-binding.yaml` — keys
 * its own to the `.bpd` sources' system pool. Two authorities, so the two spellings may
 * legitimately differ, and a `Figaro`/`figaro` split between two adjacent YAML files is never a
 * design defect worth a red gate.
 */
const sameSystem = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

/**
 * The deployment view's disagreement with the model over the system name, or undefined. It is
 * carried rather than fatal: a one-line name comparison must not stop the run before it has
 * evaluated a single fate, effect class, allowlist or fault row (#1065). `--check` reports it
 * alongside its findings — the way `seqmap complete` reports [C1] — and the writing verbs say it
 * once and carry on.
 */
const systemMismatch = view.system && model.system && !sameSystem(view.system, model.system)
  ? `deployment-view system '${view.system}' does not match the model's '${model.system}'`
  : undefined;
if (systemMismatch && !check) console.error(`resource-protocol: ${systemMismatch}`);

const protocolDir = join(deploymentDir, 'protocol');
const sheetPath = (seam) => join(protocolDir, `${seam}.protocol.yaml`);
const schemaDir = join(deploymentDir, 'schema');
const schemaPath = (seam) => join(schemaDir, `${seam}.schema.sql`);

/**
 * One entry per SHEET: `{ seam, slots, owner, resourceKind }`. N slots may share a seam, and the
 * reader has already refused a seam whose sharing slots disagree on kind or owner, so reading
 * either off the first slot is safe here rather than merely convenient.
 */
const allSheets = [...view.bySeam.entries()].map(([seam, slots]) => ({
  seam, slots, owner: slots[0].owner, resourceKind: slots[0].resourceKind,
}));

let sheets = allSheets;
if (onlyRa) {
  sheets = sheets.filter((sh) => sh.owner === onlyRa);
  if (!sheets.length) die(`--ra ${onlyRa}: no such resourceAccess in the deployment view`);
}
if (onlySeam) {
  sheets = sheets.filter((sh) => sh.seam === onlySeam);
  if (!sheets.length) die(`--seam ${onlySeam}: no slot of the deployment view names that seam`);
}
/** True when the run covers the whole system, so an orphan sweep is meaningful. */
const wholeSystem = !onlyRa && !onlySeam;
if (requireWalk && !requireWalk.all) {
  const known = new Set([...view.slots.map((sl) => sl.owner), ...view.bySeam.keys()]);
  const unknown = requireWalk.names.filter((n) => !known.has(n));
  if (unknown.length)
    die(`${REQUIRE_WALK} ${unknown.join(', ')}: no ResourceAccess and no seam of the deployment view has that name — a requirement naming nothing would require nothing, silently`);
}
/** Is the walk required for this Access, or for one of its seams? */
const walkRequired = (owner, seams) => !!requireWalk &&
  (requireWalk.all || requireWalk.names.includes(owner) || seams.some((seam) => requireWalk.names.includes(seam)));

// ---------------------------------------------------------------------------- YAML emission

/** YAML scalar, single-quoted when anything could bite the subset parser or a reader. */
const yScalar = (v) => {
  if (v === null || v === undefined) return 'TODO';
  // A number stays a number: quoting `-1` would re-read as the STRING '-1', and a regenerated sheet
  // would then refuse its own `roundTripValue: -1` (#1631).
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  const s = String(v);
  if (/^[A-Za-z0-9_][A-Za-z0-9_.\- ]*$/.test(s) && !/^(true|false|null|yes|no|on|off)$/i.test(s) && s.trim() === s) return s;
  return `'${s.replace(/'/g, "''")}'`;
};
const yFlow = (v) => {
  if (Array.isArray(v)) return `[${v.map(yFlow).join(', ')}]`;
  if (v && typeof v === 'object')
    return `{ ${Object.entries(v).map(([k, x]) => `${k}: ${yFlow(x)}`).join(', ')} }`;
  return yScalar(v);
};
/** One generated row: the generated keys first, then every authored/extra key, insertion order. */
const yRow = (generated, authored) => {
  const parts = [];
  for (const [k, v] of Object.entries(generated)) parts.push(`${k}: ${yFlow(v)}`);
  for (const [k, v] of Object.entries(authored || {})) if (!(k in generated)) parts.push(`${k}: ${yFlow(v)}`);
  return `{ ${parts.join(', ')} }`;
};

/** The authored `shape:` block, verbatim (its comments are review content); undefined = none. */
function shapeText(sheetSrc) {
  const lines = sheetSrc.split('\n');
  const start = lines.findIndex((l) => /^shape:\s*(#.*)?$/.test(l) || /^shape:\s*\S/.test(l));
  if (start < 0) return undefined;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++)
    if (/^[A-Za-z_]/.test(lines[i]) || /^# ─/.test(lines[i])) { end = i; break; }
  while (end > start + 1 && lines[end - 1].trim() === '') end--;
  return lines.slice(start, end).join('\n');
}

/**
 * @param siblingFates keys (`dto\u0000field`) already fated on ANOTHER sheet of this Access.
 *   A field this sheet does not carry and a sibling does is NOT added here. Under seam-keyed
 *   sheets the fates universe is the ACCESS's, so without this the skeleton would push every field
 *   onto every sheet of an Access and undo the author's distribution on each regeneration — churn
 *   forever. Two things it deliberately does not do: it never drops a row THIS sheet already
 *   carries (a field may legitimately be durable in the store the system owns and a selector
 *   against the customer's API — ADR-065's O2 says so outright), and a field no sheet of the
 *   Access carries at all is emitted on every one of them, so a new contract field can never go
 *   silently unfated. The author keeps the row where it belongs and deletes the others, once.
 */
function emitSheet(sheetKey, access, seamHalf, existing, existingSrc, siblingFates = new Set(), walkPlan = { emit: false, siblingWalked: new Set() }) {
  const { seam, slots, owner, resourceKind } = sheetKey;
  const { reaching } = access;
  const { kind, seamOps } = seamHalf;
  const prevFates = new Map(); // 'Facet.Dto\u0000Field' -> authored row
  for (const d of existing?.fates || [])
    for (const f of d.fields || []) prevFates.set(`${d.dto}\u0000${f.field}`, f);
  const keepFate = (dto, field) => {
    const k = fieldKey(dto, field);
    return prevFates.has(k) || !siblingFates.has(k);
  };
  const fates = access.fates
    .map((d) => ({ ...d, fields: d.fields.filter((f) => keepFate(d.key, f)) }))
    .filter((d) => d.fields.length);
  const prevOps = new Map((existing?.operations || []).map((o) => [o.op, o]));
  const prevAllow = new Map((existing?.allow || []).map((a) => [a.useCase, a]));

  const L = [];
  L.push(`# ${seam}.protocol.yaml — Resource Protocol Sheet (resource-protocol/2, ADR-059/ADR-065).`);
  L.push(`# HYBRID FILE: row keys are GENERATED by \`just resource-protocol-skeleton\` from the const`);
  L.push(`# model and the ${seam} seam; the shape, every fate, roundTrip, effect, allowlist and note`);
  L.push(`# are AUTHORED (Design-stage resource-designer pass) and survive regeneration. Comments outside`);
  L.push(`# the shape section do NOT survive — reviewer-facing prose belongs in \`note:\` values.`);
  L.push(`# \`just resource-protocol-check\` is the staleness/completeness gate (Contract reviews this`);
  L.push(`# sheet; the spec runner enforces it — the review and the enforcement read the same file).`);
  L.push(`#`);
  L.push(`# THE SEAM IS THE IDENTITY (ADR-065 decision 4). There is no \`resourceAccess:\` key: the`);
  L.push(`# owning Access is read from the deployment view's slot table, so moving this seam to a`);
  L.push(`# different Access costs a deployment-view edit and ZERO edits here. Today it is served by:`);
  for (const sl of slots)
    L.push(`#   slot '${sl.slot}' of ${sl.owner} — ${sl.resource} (${sl.resourceKind}${sl.product ? ` / ${sl.product}` : ''})`);
  L.push(`format: resource-protocol/2`);
  L.push(`system: ${yScalar(model.system)}`);
  L.push(`seam: ${seam}`);
  L.push('');
  L.push(`# ── 1. resource shape — AUTHORED, the human-review section, in the kind's own vocabulary ──`);
  const prevShape = existingSrc ? shapeText(existingSrc) : undefined;
  if (prevShape) L.push(prevShape);
  else {
    L.push(`shape:`);
    L.push(`  ${kind.shapeKey}: []   # TODO(author): ${resourceKind} vocabulary — see resource-protocol-format.md`);
  }
  L.push('');
  L.push(`# ── 2. field fates — (dto, field) GENERATED, fate/roundTrip/note AUTHORED ──────────────────`);
  L.push(`# fate: durable | selector | instructive | transformed.`);
  L.push(`# durable ⇒ roundTrip: { write: <RA contract op storing it>, read: <RA contract op returning it> }`);
  L.push(`#            + observe: <Facet>.<Dto>.<Field> when the read answers a DIFFERENT record than the write carries`);
  L.push(`#            + given: <RA contract op> — ONE setup write that runs first, when the write only UPDATES`);
  L.push(`fates:`);
  const grouped = new Map();
  for (const d of fates) grouped.set(d.key, d.fields);
  for (const [dtoKey, fields] of grouped) {
    L.push(`  - dto: ${dtoKey}`);
    L.push(`    fields:`);
    for (const field of fields) {
      const prev = prevFates.get(`${dtoKey}\u0000${field}`);
      const authored = { ...prev };
      delete authored.field;
      L.push(`      - ${yRow({ field }, Object.keys(authored).length ? authored : { fate: 'TODO' })}`);
    }
  }
  L.push('');
  L.push(`# ── 3. seam operations — op names GENERATED from ${seam}, effect class + targets AUTHORED ──`);
  L.push(`# effects (${resourceKind}): ${kind.effects.join(' | ')}. \`on:\` names shape entries.`);
  L.push(`operations:`);
  for (const op of seamOps) {
    const prev = prevOps.get(op);
    const authored = { ...prev };
    delete authored.op;
    L.push(`  - ${yRow({ op }, Object.keys(authored).length ? authored : { effect: 'TODO' })}`);
  }
  L.push('');
  L.push(`# ── 4. effect allowlist — (useCase, name) GENERATED (chains reaching ${owner}), ops AUTHORED ──`);
  L.push(`# A seam operation invoked by a use case outside its list fails the spec run (effect gate).`);
  L.push(`# \`_\`-prefixed entries declare non-use-case housekeeping entry points; \`_fixture\` is reserved.`);
  L.push(`allow:`);
  for (const uc of reaching) {
    const prev = prevAllow.get(uc.id);
    const authored = { ...prev };
    delete authored.useCase;
    delete authored.name;
    L.push(`  - ${yRow({ useCase: uc.id, name: uc.name }, Object.keys(authored).length ? authored : { ops: [] })}`);
  }
  for (const [ucKey, entry] of prevAllow) {
    if (!ucKey.startsWith('_')) continue;
    const authored = { ...entry };
    delete authored.useCase;
    L.push(`  - ${yRow({ useCase: ucKey }, authored)}`);
  }
  L.push('');
  // Section 5 is WHOLLY AUTHORED (#999) — nothing about it is generated, so the merge carries the
  // rows through unchanged. It is emitted for a NEW sheet (so the decision is prompted rather than
  // silently skipped) and for any sheet that already carries the key — never added to a sheet that
  // has none, because a tool that grows a section into every existing sheet is retrofitting a
  // design decision nobody made.
  if (!existing || existing.faults !== undefined) {
    const rows = Array.isArray(existing?.faults) ? existing.faults : [];
    L.push(`# ── 5. answerable faults — WHOLLY AUTHORED: what this seam answers instead of rethrowing ──`);
    L.push(`# Per RA CONTRACT operation: the raised fault identity the seam turns into result data, and`);
    L.push(`# the result field it answers into. Everything not listed RETHROWS (ADR-061 decision 8, the`);
    L.push(`# blessed fault tables' narrow answerability). Answering an identity no row declares is red.`);
    if (!rows.length) {
      L.push(`faults: []   # TODO(author): the answerable faults — or leave empty: the seam then only rethrows`);
    } else {
      L.push(`faults:`);
      for (const row of rows) L.push(`  - ${yRow({}, row)}`);
    }
    L.push('');
  }
  // Section 6 — the answer-source walk (relay R-260, 2026-09-13). Its KEYS are generated — one entry
  // per contract operation variant, one `returns` row per field of that variant's response — and
  // everything that says anything is authored: each row's source, every write with its one call,
  // every act. Emitted for a sheet that already carries `walk:`, or where `--require-source-walk`
  // asks for it; never grown into a sheet on its own, for #999's reason — a tool that adds a section
  // to every blessed sheet is retrofitting a design decision nobody made. A `writes` list nobody
  // authored is emitted as `writes: TODO`, never as `[]`: an empty list is the authored statement
  // "this variant writes nothing", and a generator must not make it on the author's behalf. "That
  // variant's response" is `variantResponse` (#1626): the base result plus the variant's OWN arm
  // where the model pairs them, never a sibling arm's fields — a row regenerated here is a question
  // somebody has to answer, so a question with no answer must not be generated in the first place.
  if (walkPlan.emit) {
    const prevEntries = new Map();
    for (const e of Array.isArray(existing?.walk) ? existing.walk : [])
      if (isMap(e) && typeof e.op === 'string') prevEntries.set(variantKey(e.op, e.variant), e);
    const entries = operationVariants(access.manifest)
      .filter((v) => prevEntries.has(variantKey(v.op, v.variant)) || !walkPlan.siblingWalked.has(variantKey(v.op, v.variant)));
    walkPlan.emitted = entries.map((v) => `${v.op} (${v.variant})`);
    L.push(`# ── 6. answer-source walk — (op, variant, returned field) GENERATED; sources, writes, acts AUTHORED ──`);
    L.push(`# Per RA CONTRACT operation variant: where every returned field comes from — request: <field> |`);
    L.push(`# seam: <operation or row member> | constant: <value> | rule: <statement> with from: [...] — the`);
    L.push(`# ONE seam call of every write (\`writes: []\` when it writes nothing), and the ONE call of every act.`);
    if (!entries.length) L.push(`walk: []`);
    else {
      L.push(`walk:`);
      const list = (key, value, required) => {
        if (value === undefined) { if (required) L.push(`    ${key}: TODO`); return; }
        if (!Array.isArray(value)) { L.push(`    ${key}: ${yFlow(value)}`); return; }
        if (!value.length) { L.push(`    ${key}: []`); return; }
        L.push(`    ${key}:`);
        for (const item of value) L.push(`      - ${isMap(item) ? yRow({}, item) : yFlow(item)}`);
      };
      for (const v of entries) {
        const prev = prevEntries.get(variantKey(v.op, v.variant)) || {};
        L.push(`  - op: ${yScalar(v.op)}`);
        L.push(`    variant: ${yScalar(v.variant)}`);
        for (const [key, value] of Object.entries(prev))
          if (!WALK_KEYS.includes(key)) L.push(`    ${key}: ${yFlow(value)}`);
        list('writes', prev.writes, true);
        list('acts', prev.acts, false);
        const prevRows = new Map();
        for (const r of Array.isArray(prev.returns) ? prev.returns : []) if (isMap(r) && typeof r.field === 'string') prevRows.set(r.field, r);
        const fields = variantResponse(access.manifest, v).fields;
        if (!fields.length) L.push(`    returns: []`);
        else {
          L.push(`    returns:`);
          for (const field of fields) {
            const authored = { ...prevRows.get(field) };
            delete authored.field;
            L.push(`      - ${yRow({ field }, Object.keys(authored).length ? authored : { source: 'TODO' })}`);
          }
        }
      }
    }
    L.push('');
  }
  return L.join('\n');
}

// ---------------------------------------------------------------------------- --skeleton

if (skeleton) {
  const notices = [];
  let wrote = 0;
  // Which fields each existing sheet already fates, so a sheet is not handed rows its sibling
  // owns. Read before anything is written: the distribution is a property of the whole Access.
  const fatedBySheet = new Map(); // seam -> Set(fieldKey)
  const walkedBySheet = new Map(); // seam -> Set(variantKey), for the sheets that CARRY a `walk:` section
  for (const sh of allSheets) {
    const path = sheetPath(sh.seam);
    if (!existsSync(path)) continue;
    const keys = new Set();
    const doc = readYaml(path);
    for (const d of doc?.fates || [])
      for (const f of d.fields || []) if (f?.field) keys.add(fieldKey(d.dto, f.field));
    fatedBySheet.set(sh.seam, keys);
    if (doc?.walk !== undefined)
      walkedBySheet.set(sh.seam, new Set((Array.isArray(doc.walk) ? doc.walk : []).filter(isMap).map((e) => variantKey(e.op, e.variant))));
  }
  /**
   * Does this sheet get section 6? When it already carries one; or when `--require-source-walk` asks
   * for the walk of an Access none of whose sheets carries it — then on the ONE sheet the flag names,
   * or the Access's first sheet. The walk is per Access, so it is started on one sheet, not on all.
   */
  const walkPlanOf = (sheetKey) => {
    const ownerSeams = allSheets.filter((sh) => sh.owner === sheetKey.owner).map((sh) => sh.seam);
    const siblingWalked = new Set();
    for (const seam of ownerSeams) if (seam !== sheetKey.seam) for (const k of walkedBySheet.get(seam) || []) siblingWalked.add(k);
    let emit = walkedBySheet.has(sheetKey.seam);
    if (!ownerSeams.some((seam) => walkedBySheet.has(seam)) && walkRequired(sheetKey.owner, ownerSeams)) {
      const named = requireWalk.all ? [] : ownerSeams.filter((seam) => requireWalk.names.includes(seam));
      emit = named.length ? named.includes(sheetKey.seam) : ownerSeams[0] === sheetKey.seam;
    }
    return { emit, siblingWalked };
  };
  /** Keys fated on some OTHER sheet of the same Access. */
  const siblingFatesOf = (sheetKey) => {
    const out = new Set();
    for (const sh of allSheets)
      if (sh.owner === sheetKey.owner && sh.seam !== sheetKey.seam)
        for (const k of fatedBySheet.get(sh.seam) || []) out.add(k);
    return out;
  };
  for (const sheetKey of sheets) {
    // ADR-071 §2 (#1246): a sheet is authored only AFTER the slot's kind and product are ruled — its
    // whole vocabulary is selected by the kind, so a sheet over a guess is a sheet to rewrite. The
    // ruling point is the START of the resource-designer pass; this refusal is what makes that
    // ordering real rather than advisory. The remedy is the Software Architect's ruling, never a
    // stamp typed here to get past this line.
    const unruled = sheetKey.slots.filter((sl) => sl.unruled.length);
    if (unruled.length)
      die(unruled.map((sl) =>
        `slot '${sl.slot}' of ${sl.owner} (${sl.resourceKind} · ${sl.product}) is not ruled — ${sl.unruled.join('; ')}. ` +
        `No sheet is authored over a product nobody ruled (ADR-071 §2): put the kind and the product to the Software ` +
        `Architect (or the ADR-058 delegate), record the ruling as \`ruled: { by, on, basis }\` on the slot in ` +
        `${rel(view.path)}, then generate the sheet`).join('\n'));
    const access = deriveAccess(model, sheetKey.owner);
    if (access.error) die(access.error);
    const seamHalf = deriveSeam(sheetKey.slots[0], notices);
    if (seamHalf.error) die(seamHalf.error);
    const path = sheetPath(sheetKey.seam);
    const hadSheet = existsSync(path);
    const existingSrc = hadSheet ? readFileSync(path, 'utf-8') : undefined;
    const existing = hadSheet ? readYaml(path) : undefined;
    const walkPlan = walkPlanOf(sheetKey);
    const out = emitSheet(sheetKey, access, seamHalf, existing, existingSrc, siblingFatesOf(sheetKey), walkPlan);
    try { parseYaml(out, path); } catch (e) { die(`emitted sheet for ${sheetKey.seam} does not re-parse — tool bug: ${e.message}`); }
    mkdirSync(protocolDir, { recursive: true });
    if (existingSrc === out) { console.log(`resource-protocol: ${rel(path)} unchanged`); continue; }
    writeFileSync(path, out);
    wrote++;
    // name what moved, so a merge over an authored sheet is auditable at a glance
    if (hadSheet) {
      const prevKeys = new Set();
      for (const d of existing?.fates || []) for (const f of d.fields || []) prevKeys.add(`${d.dto}.${f.field}`);
      const siblings = siblingFatesOf(sheetKey);
      const nowKeys = new Set();
      for (const d of access.fates)
        for (const f of d.fields)
          if (prevKeys.has(`${d.key}.${f}`) || !siblings.has(fieldKey(d.key, f))) nowKeys.add(`${d.key}.${f}`);
      const added = [...nowKeys].filter((k) => !prevKeys.has(k));
      const dropped = [...prevKeys].filter((k) => !nowKeys.has(k));
      const prevWalk = new Set((Array.isArray(existing?.walk) ? existing.walk : []).filter(isMap).map((e) => `${e.op} (${e.variant})`));
      const nowWalk = new Set(walkPlan.emitted ?? []);
      const walkAdded = walkPlan.emit ? [...nowWalk].filter((k) => !prevWalk.has(k)) : [];
      const walkDropped = walkPlan.emit ? [...prevWalk].filter((k) => !nowWalk.has(k)) : [];
      const detail = [
        added.length ? `+${added.length} field row(s): ${added.join(', ')}` : '',
        dropped.length ? `-${dropped.length} stale field row(s): ${dropped.join(', ')}` : '',
        walkAdded.length ? `+${walkAdded.length} walk entr(ies): ${walkAdded.join(', ')}` : '',
        walkDropped.length ? `-${walkDropped.length} stale walk entr(ies): ${walkDropped.join(', ')}` : '',
      ].filter(Boolean).join('; ');
      console.log(`resource-protocol: merged ${rel(path)}${detail ? ` — ${detail}` : ''} (authored content preserved)`);
    } else {
      console.log(`resource-protocol: wrote ${rel(path)} — fill shape, fates, effects, allowlists and the answerable faults (resource-protocol-format.md), then \`just resource-protocol-check\``);
    }
  }
  for (const n of notices) console.log(`resource-protocol: note: ${n}`);
  console.log(`resource-protocol: skeleton over ${sheets.length} seam(s) across ${new Set(sheets.map((sh) => sh.owner)).size} ResourceAccess(es), ${wrote} file(s) written`);
  process.exit(0);
}

// ---------------------------------------------------------------------------- --schema

if (schema) {
  // ONE BAD SHEET IS NOT A BAD RUN (#1206). This loop used to `die` on the first shape that does
  // not hold, so every seam ordered after it was never regenerated — while `--check` went on
  // reporting those same seams' committed schemas as stale and prescribing this very command.
  // Run check, run schema, run check: the loop could not converge, and nothing said why.
  //
  // It costs more than the skipped files. A shape defect is a DESIGN question that legitimately
  // stays open for days waiting on the Software Architect, and for all of that time the generated
  // half of every later sheet is frozen while the Contract-gate check carries findings that have
  // nothing to do with the sheet actually broken.
  //
  // So a sheet whose shape does not hold is reported and skipped, exactly as a RestApi slot is,
  // and the rest still run. The exit code keeps the distinction the caller needs: 0 means every
  // sheet that has a schema now has a CURRENT one, 2 means some were skipped over a shape their
  // sheet cannot emit from. "Generated what it could" never reports as "generated everything".
  let wrote = 0, skipped = 0;
  const broken = [];
  for (const sheetKey of sheets) {
    const result = schemaFor(sheetKey);
    if (result.error) {
      console.error(`resource-protocol: ${result.error}`);
      broken.push(sheetKey.seam);
      continue;
    }
    if (result.skip) { console.log(`resource-protocol: skipped — ${result.skip}`); skipped++; continue; }
    const path = schemaPath(sheetKey.seam);
    mkdirSync(schemaDir, { recursive: true });
    const before = existsSync(path) ? readFileSync(path, 'utf-8') : undefined;
    if (before === result.text) { console.log(`resource-protocol: ${rel(path)} unchanged`); continue; }
    writeFileSync(path, result.text);
    wrote++;
    console.log(`resource-protocol: wrote ${rel(path)}${before === undefined ? '' : ' (regenerated)'}`);
  }
  console.log(`resource-protocol: schema over ${sheets.length} seam(s), ${wrote} written, ${skipped} without one` +
    (broken.length ? `, ${broken.length} NOT emitted — the shape does not hold: ${broken.join(', ')}` : ''));
  if (broken.length)
    die(`${broken.length} seam(s) kept their existing schema because the sheet's shape does not hold ` +
      `(${broken.join(', ')}). Every OTHER seam was regenerated, so \`--check\` now names only the sheets ` +
      `this run could not fix — fix the shape above and run this again`);
  process.exit(0);
}

// ---------------------------------------------------------------------------- --check
// The outer loop is the ACCESS, the inner loop its sheets — one per distinct seam its slots name.
// That nesting is not cosmetic: two conditions are per Access and cannot be answered one sheet at
// a time. Fates completeness (#1088 / ADR-065 decision 11) asks whether every
// request-reachable field of the ACCESS's contract has a row in AT LEAST ONE of that Access's
// sheets, and [P9] (#1091) compares one `Service/` scan against the UNION of the identities all of
// them declare.

const problems = []; // { sheet, msg }
const infos = [];
const notices = [];
const P = (sheet, msg) => problems.push(`${sheet}: ${msg}`);
if (systemMismatch) P(rel(view.path), `[P0] ${systemMismatch}`);

/** sheets grouped by owning Access, in deployment-view order. */
const byOwner = new Map();
for (const sh of sheets) {
  if (!byOwner.has(sh.owner)) byOwner.set(sh.owner, []);
  byOwner.get(sh.owner).push(sh);
}

let checked = 0;
let missingSlots = 0;
const walkStates = { walked: 0, unwalked: 0 };
const slotsInRun = sheets.reduce((n, sh) => n + sh.slots.length, 0);

for (const [raName, ownSheets] of byOwner) {
  const access = deriveAccess(model, raName);
  if (access.error) { P(rel(view.path), access.error); continue; }
  const { contractOps, fates, reaching } = access;

  // The Access-wide accumulators the two per-Access conditions read.
  const wantFields = new Map(); // 'Dto|Field' -> dtoKey
  for (const d of fates) for (const f of d.fields) wantFields.set(fieldKey(d.key, f), d.key);
  const fatedSomewhere = new Set();
  const declaredIdentities = new Set();
  const faultRows = []; // { at, row }
  const sheetsRead = [];
  const sheetInfo = new Map(); // seam -> { at, sheet, kind, resourceKind, sheetOps } — what the walk resolves against
  const durableRows = [];      // { at, dtoKey, field, row } — every durable row [P12] holds to its storage
  const valueRows = [];        // { at, dtoKey, field, row } — every row stating a roundTripValue (#1631)

  for (const sheetKey of ownSheets) {
    const path = sheetPath(sheetKey.seam);
    const at = rel(path);
    // [R1] the ruling (ADR-071, #1246). A sheet over an unruled slot was authored ahead of its
    // ruling — Figaro's six were — and stays visible as such until the stamp exists; the finding
    // counts under `--require-all` like any other. The remedy is the ruling, not the stamp.
    for (const sl of sheetKey.slots)
      if (sl.unruled.length)
        P(rel(view.path), `[R1] slot '${sl.slot}' of ${raName} (${sl.resourceKind} · ${sl.product}): kind and product not ruled — ${sl.unruled.join('; ')}${existsSync(path) ? `; the sheet at ${at} was authored AHEAD of its ruling` : ''} (ADR-071 §2 — the Software Architect rules, then the sheet)`);
    if (!existsSync(path)) {
      // `--require-all` counts SLOTS (ADR-065 decision 9): an Access with two slots and one sheet
      // is red, and the line names the slot rather than the seam so the reviewer knows which
      // resource is the unguarded one.
      for (const sl of sheetKey.slots) {
        missingSlots++;
        const line = `slot '${sl.slot}' of ${raName} stands on ${sl.resource} through seam ${sheetKey.seam}, which has no sheet at ${at} — \`just resource-protocol-skeleton\` generates it`;
        if (requireAll) P(at, line);
        else notices.push(`${line}; advisory without --require-all (the Contract exit runs with it)`);
      }
      continue;
    }
    checked++;
    sheetsRead.push(sheetKey.seam);
    const seamHalf = deriveSeam(sheetKey.slots[0], notices);
    if (seamHalf.error) { P(at, seamHalf.error); continue; }
    const { kind, seamOps } = seamHalf;
    const resourceKind = sheetKey.resourceKind;
    const sheet = readYaml(path);

    // [P0] the sheet's identity row. Under ADR-065 identity is the SEAM: the file is named after
    // it, the deployment view's slot table says which Access owns it, and `resourceAccess:` is gone
    // from the sheet entirely — a sheet that still carries one is a /1 file, and reading it as /2
    // would silently ignore a key its author believed was load-bearing.
    if (sheet.format !== 'resource-protocol/2')
      P(at, `[P0] format '${sheet.format}' is not resource-protocol/2 — ADR-065 moved sheet identity from the ResourceAccess to the seam, and there is no dual grammar (decision 10)`);
    if (model.system && !sameSystem(sheet.system, model.system)) P(at, `[P0] system '${sheet.system}' is not the model's '${model.system}'`);
    if (sheet.seam !== sheetKey.seam) P(at, `[P0] seam '${sheet.seam}' does not match the filename's '${sheetKey.seam}'`);
    if (sheet.resourceAccess !== undefined)
      P(at, `[P0] the sheet carries 'resourceAccess: ${sheet.resourceAccess}' — dropped in resource-protocol/2. The owning Access is read from the deployment view's slot table (${raName} owns this seam), which is what makes moving a seam between Accesses cost zero sheet edits (ADR-065 decision 4)`);

    // [P6] the shape section — vocabulary keyed by the SLOT's resourceKind, and the row grammar of
    // that vocabulary (#968: before this, `shape:` was read by nothing at all)
    const shapeIds = checkShape(sheet.shape, kind, resourceKind, (m) => P(at, m), (m) => infos.push(`${at}: ${m}`));

    // [P1] fates: rows must name real fields, each once, with a legal fate. COMPLETENESS is not
    // asked here — it is the per-Access question below.
    const seenHere = new Set();
    for (const d of sheet.fates || []) {
      const dtoKey = d.dto;
      for (const f of d.fields || []) {
        const key = fieldKey(dtoKey, f.field);
        if (!wantFields.has(key)) {
          P(at, `[P1] fates row ${dtoKey}.${f.field} — the model has no such request-reachable field on ${raName} (stale row; \`just resource-protocol-skeleton\` drops it)`);
          continue;
        }
        if (seenHere.has(key)) { P(at, `[P1] fates row ${dtoKey}.${f.field} appears twice`); continue; }
        seenHere.add(key);
        fatedSomewhere.add(key);
        if (!FATES.includes(f.fate))
          P(at, `[P1] ${dtoKey}.${f.field} has no fate (found '${f.fate ?? ''}') — durable | selector | instructive | transformed`);
        // [P2] durable ⇒ a roundTrip pair of RA contract operations that can carry the field.
        // The pair's optional third coordinate `observe: <Facet>.<Dto>.<Field>` (ADR-059 amendment
        // 2026-08-30, #961) moves the READ end onto another record, for a seam whose write is
        // command-shaped and whose read answers a different one. Its optional FOURTH, `given:
        // <RA contract op>` (ADR-059 amendment 2026-08-30, #1144), names ONE setup write that runs
        // before the write, for a write that only UPDATES and so needs a record to exist. EVERY
        // end is resolved here, at authoring time: that a durable promise nobody can keep is
        // refused before any run is what lets this check need no per-project authoring, and a
        // half-resolved coordinate would reintroduce exactly the silence the row exists to end.
        if (f.fate !== 'durable' && (f.column !== undefined || f.member !== undefined))
          P(at, `[P12] ${dtoKey}.${f.field} names ${[f.column !== undefined && 'column:', f.member !== undefined && 'member:'].filter(Boolean).join(' and ')} but its fate is '${f.fate}' — they name where a DURABLE field is kept`);
        if (f.fate === 'durable' && f.roundTrip && typeof f.roundTrip === 'object' && typeof f.roundTrip.write === 'string')
          durableRows.push({ at, dtoKey, field: f.field, row: f });
        if (f.fate === 'durable') {
          const rt = f.roundTrip;
          if (!rt || typeof rt !== 'object' || !rt.write || !rt.read) {
            P(at, `[P2] durable ${dtoKey}.${f.field} lacks its roundTrip { write, read } pair`);
          } else {
            // What the READ operation's response must carry: the row's own DTO, or the observable's.
            // `null` means the observable itself did not resolve — already reported, and the read
            // end has nothing left to be asked about.
            let readDto = dtoKey;
            if (rt.observe !== undefined && typeof rt.observe !== 'string') {
              readDto = null;
              P(at, `[P2] ${dtoKey}.${f.field} roundTrip observe ${Array.isArray(rt.observe) ? 'is a LIST — a round-trip observes exactly ONE field' : 'is not a single <Facet>.<Dto>.<Field>'}`);
            } else if (rt.observe !== undefined) {
              const text = String(rt.observe);
              const cut = text.lastIndexOf('.');
              const observeDto = cut < 0 ? '' : text.slice(0, cut);
              const observeField = cut < 0 ? '' : text.slice(cut + 1);
              const observed = observeDto.includes('.') ? access.manifest.dtos.get(observeDto) : undefined;
              readDto = null;
              if (!observeDto.includes('.') || !observeField)
                P(at, `[P2] ${dtoKey}.${f.field} roundTrip observe '${text}' does not read as <Facet>.<Dto>.<Field> — the response-side record, and the field on it the written value is compared against`);
              else if (!observed)
                P(at, `[P2] ${dtoKey}.${f.field} roundTrip observe '${text}' names record '${observeDto}', which is no contract DTO of ${raName} — the observable speaks the same facet-qualified contract vocabulary as the \`dto:\` rows`);
              else if (!observed.fields.some((x) => x.name === observeField))
                P(at, `[P2] ${dtoKey}.${f.field} roundTrip observe '${text}' — ${observeDto} has no field '${observeField}', so the written value has nothing to be compared against`);
              else readDto = observeDto;
            }
            // The SETUP WRITE, resolved exactly as the other ends are: one contract operation of
            // the owning Access. Exactly one — a list is a loud refusal, not a silently-used first
            // element, because "no setup write" and "two setup writes" are different promises and
            // the sheet must say which one is enforced.
            if (rt.given !== undefined) {
              if (typeof rt.given !== 'string' || !rt.given)
                P(at, `[P2] ${dtoKey}.${f.field} roundTrip given ${Array.isArray(rt.given) ? 'is a LIST — a round-trip names exactly ONE setup write, never a chain' : `'${rt.given}' is not a single operation name`}`);
              else if (!contractOps.get(rt.given))
                P(at, `[P2] ${dtoKey}.${f.field} roundTrip given '${rt.given}' is no contract operation of ${raName} — the setup write runs before the write, so it speaks the same RA contract vocabulary`);
            }
            for (const [role, opName] of [['write', rt.write], ['read', rt.read]]) {
              const op = contractOps.get(opName);
              if (!op) { P(at, `[P2] ${dtoKey}.${f.field} roundTrip ${role} '${opName}' is no contract operation of ${raName}`); continue; }
              const wanted = role === 'write' ? dtoKey : readDto;
              if (wanted === null) continue;
              const carries = role === 'write' ? op.requestDtos : op.responseDtos;
              if (!carries.has(wanted))
                P(at, `[P2] ${dtoKey}.${f.field} roundTrip ${role} '${opName}' cannot carry ${wanted} in its ${role === 'write' ? 'request' : 'response'} — the derived round-trip would be unconstructible`);
            }
          }
        } else if (f.roundTrip) {
          P(at, `[P2] ${dtoKey}.${f.field} declares a roundTrip but its fate is '${f.fate}' — round-trips belong to durable fields`);
        }
        // `roundTripValue:` (#1631) — what a derived round-trip SENDS in an instructive field of its
        // READ. Whether any round-trip reads through the record is a per-Access question (the durable
        // rows may sit on another sheet), so the row is held here and judged after the sheet loop.
        if (f.roundTripValue !== undefined) valueRows.push({ at, dtoKey, field: f.field, row: f });
      }
    }

    // [P3] operations: the seam's operation set, each classified in the kind's vocabulary
    const sheetOps = new Map();
    for (const o of sheet.operations || []) {
      if (sheetOps.has(o.op)) { P(at, `[P3] operation '${o.op}' listed twice`); continue; }
      sheetOps.set(o.op, o);
      if (!seamOps.includes(o.op)) P(at, `[P3] operation '${o.op}' is not on the ${sheetKey.seam} seam (stale row)`);
      else if (!kind.effects.includes(o.effect))
        P(at, `[P3] operation '${o.op}' unclassified (effect '${o.effect ?? ''}') — ${resourceKind} effects: ${kind.effects.join(' | ')}`);
      // `on:` is what joins section 3 to section 1. Without it the reviewer's second question under
      // the ADR-059 amendment — "what can wipe data" — has no answer: a delete-class operation that
      // names no target says nothing about which of the blessed tables it empties (#968).
      if (!Array.isArray(o.on) || o.on.length === 0)
        P(at, `[P3] operation '${o.op}' names no \`on:\` target — it must name the shape ${kind.entry.noun}(s) it touches`);
      else
        for (const target of o.on)
          if (!shapeIds.has(target))
            P(at, `[P3] operation '${o.op}' names \`on: ${target}\`, which the shape does not declare`);
    }
    for (const op of seamOps)
      if (!sheetOps.has(op)) P(at, `[P3] seam operation '${op}' has no operations row`);
    sheetInfo.set(sheetKey.seam, { at, sheet, kind, resourceKind, sheetOps });

    // [P4] allow: every use case whose chain reaches the OWNING ACCESS, and nothing beyond the
    // model. Reachability is per Access — the model's sequences end at the component (ADR-036) —
    // so each of an Access's sheets carries the same use-case left side, and each states which of
    // its own seam's operations that use case may invoke.
    const sheetAllow = new Map();
    for (const a of sheet.allow || []) {
      if (sheetAllow.has(a.useCase)) { P(at, `[P4] allow entry '${a.useCase}' listed twice`); continue; }
      sheetAllow.set(a.useCase, a);
      if (String(a.useCase).startsWith('_')) {
        if (a.useCase === '_fixture')
          P(at, `[P4] allow entry '_fixture' — reserved for the spec runner's fixture context, never declarable (it would hand production-path code the exemption)`);
        continue; // declared housekeeping entry points are the sheet's own business
      }
      const uc = reaching.find((u) => u.id === a.useCase);
      if (!uc) P(at, `[P4] allow entry '${a.useCase}' — no chain of that use case reaches ${raName} in the model (stale entry)`);
      else if (uc.name !== a.name) P(at, `[P4] allow entry '${a.useCase}' names '${a.name}' but the model's use case is '${uc.name}'`);
    }
    for (const uc of reaching)
      if (!sheetAllow.has(uc.id))
        P(at, `[P4] use case ${uc.id} '${uc.name}' reaches ${raName} and has no allow entry`);

    // [P5] every allowed op is a classified seam operation
    for (const [ucKey, a] of sheetAllow) {
      if (!Array.isArray(a.ops)) { P(at, `[P5] allow entry '${ucKey}' has no ops list`); continue; }
      for (const op of a.ops)
        if (!sheetOps.has(op)) P(at, `[P5] allow entry '${ucKey}' grants '${op}', which is not in operations`);
    }

    // [P8] answerable faults (#999) — the per-resource half of ADR-061 decision 8. The flavor rule
    // (which classes may EVER be answered) is the blessed fault tables'; this section is which
    // identity THIS seam answers, for which operation, into which field. Everything else rethrows,
    // so an absent section is green: it declares nothing answerable.
    const declaredPairs = new Set();
    if (sheet.faults === undefined) {
      infos.push(`${at}: declares no answerable fault - the seam classifies, retries and rethrows everything (resource-protocol-format.md, the faults section)`);
    } else if (!Array.isArray(sheet.faults)) {
      P(at, `[P8] faults is not a list - one row per (contract operation, fault identity) pair`);
    } else {
      sheet.faults.forEach((row, i) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) { P(at, `[P8] faults[${i}] is not a mapping`); return; }
        const where = `faults[${i}]`;
        const identity = row.identity;
        if (typeof row.op !== 'string' || !row.op.trim()) { P(at, `[P8] ${where} has no 'op' - the RA CONTRACT operation whose body answers it`); return; }
        if (typeof identity !== 'string' || !identity.trim()) { P(at, `[P8] ${where} (op ${row.op}) has no 'identity' - the product-free fault identity the seam classifies onto`); return; }
        const answers = row.answers === undefined ? [] : (Array.isArray(row.answers) ? row.answers : [row.answers]);
        if (!answers.length || answers.some((a) => typeof a !== 'string' || !a.trim())) {
          P(at, `[P8] fault '${identity}' on '${row.op}' has no 'answers' field - a fault is answerable only when a result field carries the answer (the answerability test, condition 1)`);
          return;
        }
        if (!IDENTITY_RE.test(identity))
          P(at, `[P8] fault identity '${identity}' on '${row.op}' does not read as <domain>:<slug> (e.g. store:version-mismatch) - the raw product code is the taxonomy's first hop, never this section's`);
        const pair = `${row.op} ${identity}`;
        if (declaredPairs.has(pair)) { P(at, `[P8] fault '${identity}' on '${row.op}' is declared twice`); return; }
        declaredPairs.add(pair);
        declaredIdentities.add(identity);
        faultRows.push({ at, row: { ...row, answers } });
        const op = contractOps.get(row.op);
        if (!op) {
          P(at, `[P8] fault '${identity}' names operation '${row.op}', which is no contract operation of ${raName} (stale row - the contract moved)`);
          return;
        }
        for (const field of answers) {
          const hit = resolveResponseField(access.manifest, op.resKeys, field);
          if (!hit.ok)
            P(at, `[P8] fault '${identity}' on '${row.op}' answers into '${field}', which the response of '${row.op}' does not carry (unresolved at '${hit.at}') - no field, no answer: that is a DESIGN GAP on the sheet, never an invented error code`);
        }
      });
    }

    // reviewer report: the danger classes and the judgement-carrying fates, per sheet
    for (const [opName, o] of sheetOps) {
      if (!kind.danger.includes(o.effect)) continue;
      const grantedTo = [...sheetAllow.values()].filter((a) => Array.isArray(a.ops) && a.ops.includes(opName)).map((a) => a.useCase);
      const on = Array.isArray(o.on) && o.on.length ? ` on ${o.on.join(', ')}` : '';
      infos.push(`${at}: ${o.effect}-class operation '${opName}'${on} — allowed to: ${grantedTo.length ? grantedTo.join(', ') : 'nothing'}`);
    }
    for (const d of sheet.fates || [])
      for (const f of d.fields || []) {
        if ((f.fate === 'transformed' || f.fate === 'instructive') && f.note)
          infos.push(`${at}: ${f.fate} ${d.dto}.${f.field} — ${f.note}`);
        if (f.fate === 'instructive' && Number.isSafeInteger(f.roundTripValue))
          infos.push(`${at}: instructive ${d.dto}.${f.field} — a derived round-trip reading through it sends ${f.roundTripValue} (roundTripValue)`);
      }
  }

  if (!sheetsRead.length) continue; // nothing of this Access is sheeted; already reported above

  // [P2] roundTripValue (#1631), per Access: every durable row of every sheet names the reads.
  checkRoundTripValues({ raName, access, valueRows, durableRows, P });

  // The label the two per-Access findings hang off: one sheet reads as that file, several read as
  // the Access and the sheets that jointly owe the answer.
  const where = sheetsRead.length === 1
    ? rel(sheetPath(sheetsRead[0]))
    : `${raName} (sheets: ${sheetsRead.join(', ')})`;

  // [P1] COMPLETENESS, per Access across its sheets. ADR-065's open question O2: with sheets keyed
  // per seam, a field is owed a row in at least ONE of its Access's sheets, and may legitimately
  // carry different fates in two (durable in the store we own, a selector against the customer's
  // API). This is the recommendation on the table, not a ruling — if the Software Architect rules
  // otherwise, this condition and the format spec's "Where the fate rows live" change together.
  for (const [key, dtoKey] of wantFields)
    if (!fatedSomewhere.has(key))
      P(where, `[P1] ${dtoKey}.${fieldOf(key)} has no fates row in any sheet of ${raName} — every request-reachable field owes one (\`just resource-protocol-skeleton\` adds the row)`);

  // [P9] the SA's red rule: an Access that ANSWERS a fault class no sheet of its declares. The
  // answering catch is the seam's one per-operation filtered catch, so the code states which
  // identities it answers; the sheets state which it may. The scan is per Access — `Service/` is
  // one directory — so the declarations are UNIONED across the Access's sheets before comparing
  // (#1091). One sheet at a time would report correct code as red for every identity the Access's
  // other seam declares.
  const serviceDir = join(access.raRoot, 'Service');
  const answered = answeredIdentities(serviceDir);
  const sightings = new Map(); // identity -> ['file:line', ...]
  for (const a of answered) {
    if (!sightings.has(a.identity)) sightings.set(a.identity, []);
    sightings.get(a.identity).push(`${rel(a.path)}:${a.line}`);
    if (!declaredIdentities.has(a.identity))
      P(where, `[P9] ${rel(a.path)}:${a.line} answers fault '${a.identity}' as result data, and no faults row of ${raName}'s sheet(s) declares it - answerability is a resource-design decision reviewed at Contract (ADR-059), not an implementor's call. Declare it on the sheet of the seam that raises it, or rethrow it`);
  }

  // [P10] the MIRROR of [P9] (#1004): the sheet declares an identity answerable and no `Service/`
  // source answers it - the design blessed an answer and the code rethrows. #999 named this half of
  // the symptom and left it a reviewer line, because it has a window [P9] has not: from the sheet's
  // Contract blessing to the Construction-stage landing every row is unanswered by construction.
  // So it is a finding only once the body EXISTS - `constructionLanded` reads the scaffolder's own
  // stub marker - and a reviewer line before that, exactly as before.
  const landed = constructionLanded(serviceDir);

  // one reviewer line per declared row: what is answered, where it lands, why, and whether any
  // Service source answers it yet (before construction lands, none does - that is not a finding)
  for (const { at, row } of faultRows) {
    const seen = sightings.get(row.identity);
    if (!seen && landed)
      P(at, `[P10] fault '${row.identity}' is declared answerable on '${row.op}' (into ${row.answers.join(', ')}), and no Service source of ${raName} answers it - the component body is written (no create-once stub is left under ${rel(serviceDir)}), so the seam rethrows a fault the design meant to answer. Add the operation's filtered catch, or take the row off the sheet - the sheet and the code are one design (ADR-059), and this is the direction [P9] cannot see`);
    infos.push(`${at}: answerable fault '${row.identity}' on '${row.op}' answers into ${row.answers.join(', ')}`
      + `${row.note ? ` - ${row.note}` : ''}`
      + ` [${seen ? `answered at ${seen.join(', ')}` : landed ? 'no Service source answers it - see the [P10] finding' : 'no Service source answers it yet'}]`);
  }

  // [P11]/[P12] the answer-source walk and the durable fields' storage (relay R-260, 2026-09-13)
  walkStates[checkWalk({ raName, access, where, sheetsRead, sheetInfo, durableRows, faultRows, P, infos, notices })]++;
}

// [P7] the generated schema (#970) — a file that exists must be the one its sheet emits. The schema
// cannot drift from the sheet by construction, but a COMMITTED copy of it can go stale while nobody
// regenerates (#567's class), and a stale schema is a blessed design the database does not have.
// Absence is not a finding: a project adopts the generated schema when its driver does. Keyed per
// SEAM since ADR-065, because that is what the sheet is keyed by.
for (const sheetKey of sheets) {
  const path = schemaPath(sheetKey.seam);
  if (!existsSync(path)) continue;
  const result = schemaFor(sheetKey);
  if (result.skip) {
    P(rel(path), `[P7] a schema file for seam ${sheetKey.seam}, which has none to generate — ${result.skip}`);
  } else if (result.dialect) {
    P(rel(path), `[P7] not re-derivable — ${result.error}`);
  } else if (result.error) {
    notices.push(`${rel(path)}: not re-derived — the sheet's shape does not hold (see the [P6] findings above)`);
  } else if (readFileSync(path, 'utf-8') !== result.text) {
    P(rel(path), `[P7] stale — it is not what ${rel(sheetPath(sheetKey.seam))}'s shape emits today; \`just resource-protocol-schema\` regenerates it`);
  }
}

// The two orphan sweeps — the other half of the ADR-065 checker rule: every slot's seam has exactly
// one sheet, and every sheet's seam belongs to some slot. Only meaningful over the whole system: a
// --ra or --seam run has deliberately narrowed what it looks at, and would report every other
// seam's file as an orphan.
if (existsSync(schemaDir) && wholeSystem)
  for (const entry of readdirSync(schemaDir)) {
    const m = entry.match(/^(.+)\.schema\.sql$/);
    if (m && !view.bySeam.has(m[1]))
      P(rel(join(schemaDir, entry)), `[P7] schema for seam '${m[1]}' — no slot of the deployment view names that seam`);
  }

if (existsSync(protocolDir) && wholeSystem)
  for (const entry of readdirSync(protocolDir)) {
    const m = entry.match(/^(.+)\.protocol\.yaml$/);
    if (m && !view.bySeam.has(m[1]))
      P(rel(join(protocolDir, entry)), `[P0] sheet for seam '${m[1]}' — no slot of the deployment view names that seam. Either a slot lost its seam, or this is a leftover of the /1 layout, where sheets were named after the ResourceAccess`);
  }

for (const n of notices) console.log(`resource-protocol: note: ${n}`);
if (infos.length) {
  console.log(`\nresource-protocol: Contract reviewer report:`);
  for (const i of infos) console.log(`  ${i}`);
}
if (problems.length) {
  console.error('');
  for (const p of problems) console.error(`resource-protocol: ${p}`);
  console.error(`\nresource-protocol: RED — ${problems.length} finding(s) over ${checked} sheet(s). Regenerate the`);
  console.error(`generated half with \`just resource-protocol-skeleton\`; fates, effects, allowlists, faults and the`);
  console.error(`shape are authored (resource-protocol-format.md). A sheet change after Contract owes the`);
  console.error(`Contract act again (ADR-058: skip the review, never the act).`);
  process.exit(1);
}
console.log(`resource-protocol: OK — ${checked} sheet(s) checked over ${byOwner.size} ResourceAccess(es); ${missingSlots} of ${slotsInRun} slot(s) not yet sheeted; ` +
  `${walkStates.unwalked} of ${walkStates.walked + walkStates.unwalked} sheeted ResourceAccess(es) NOT WALKED (no answer-source walk${walkStates.unwalked ? ` — advisory without ${REQUIRE_WALK}` : ''}).`);
