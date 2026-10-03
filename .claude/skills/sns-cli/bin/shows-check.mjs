#!/usr/bin/env node
/**
 * shows-check (#663) — every `shows` display binding is resolved against the GENERATED CONTRACT
 * TYPES and against the call recorder's own visibility rules, at authoring time.
 *
 *   node shows-check.mjs --screens <screen-model-dir> --map <seqmap.json> --csharp <project>/csharp
 *
 * WHAT WENT WRONG WITHOUT IT (#663). Six of VW10's nine display bindings named a field the frozen
 * contract does not have — `SI08.01.SeatableTables` where the result carries `Tables`,
 * `SI08.06.HeldSitting` where it carries `Booking`, `SI08.07.FreedTable` for `FreedTables`,
 * `SI08.07.WaitlistCandidate` for a name/id PAIR, `SI08.08.SeatedTable` for `Tables`, and
 * `SI08.08.VisitOpened` for a fact the system does not produce at that point at all. Every gate the
 * model passed through read the binding as a STRING: `vw-validate --seqmap` leaves `shows` paths
 * unchecked (there is no seeded world in that mode), the anchor emitter passes them through
 * verbatim (resolving them is not its job), and the C# build never sees them (an anchor is a
 * constant, a `shows` path is data). The one mechanism that WOULD have caught them — the display
 * oracle — needs a browser, a seeded world and a driven path, and could not run for that family.
 *
 * AND TYPE-LEVEL RESOLUTION ALONE IS NOT ENOUGH (#630). The hand-authored batch that fixed those
 * six got five of five right against the C# types and three of five wrong against what the RECORDER
 * can carry: a binding to a `List<string>` field resolves perfectly as a property and is invisible
 * to the oracle, which reports it in the same sentence as a field that does not exist. So this
 * check has two arms, and the second is written against the recorder's capability rather than a
 * hardcoded scalar list — it mirrors `CallRecorderInterceptor` (`ScalarFieldsOf` / `AddScalarFields`
 * / `AddCollection` / `IsScalar`, TheAgent.Spec.Trace) key for key, and the mirror is what the
 * fixture tests pin.
 *
 * THE CHECKS
 *
 *   [D1] the binding is `BPxx.yy.<FieldPath>` — a CALL SITE (ADR-069 §5), the shape the oracle's
 *        own split accepts and the key `seqmap generate` writes into `operations`. A BARE FIELD
 *        NAME (`shows Reason`) is this arm's, not [D8]'s, and the distinction cost a project 33
 *        false «binds NOTHING» sentences before #1798: the element DOES bind something, and what
 *        it binds does not resolve. ADR-037 §1 says why it cannot be made to resolve — the oracle
 *        asserts that the element displays the field of the payload A NAMED CALL returned, so the
 *        call-site prefix IS the thing compared against, and a bare name names no call. The
 *        prefix-less form is therefore not a shorter spelling of a binding; it is an incomplete
 *        one, and no ruling has ever defined it (ADR-069 §5 renamed the prefix `SIxx.yy` ->
 *        `BPxx.yy`, it did not make one optional). `vw-validate` accepting the token says what the
 *        LANGUAGE parses, never what the oracle can derive an assertion from;
 *   [D2] the call site resolves through the sequence map to one operation, and that operation's facet
 *        interface declares a `Response<T>` result type in the generated tree;
 *   [D3] every segment of the path is a real property of that type (the #663 defect class);
 *   [D4] the leaf is RECORDABLE — a value one anchor can display and the recorder actually writes:
 *        not a whole collection (#630), not a nested object (the recorder writes its leaves, not
 *        it), not a struct the recorder does not treat as scalar (`DateOnly` is walked as an
 *        object, so a binding to one is invisible), not past the recorder's nesting depth, and
 *        never the reserved `Truncated` marker;
 *   [D5] the row placeholder `[]` sits on a `column` (one declaration, one anchor per element),
 *        over a TOP-LEVEL collection (elements of a nested collection are not recorded, only its
 *        `.Count`), with a recordable element leaf;
 *   [D6] the screen DECLARES what drives the SI the binding reads — a control that `calls` it, or a
 *        section that `reads` it when the screen opens (#762). Where neither does, the operation
 *        reaches the trace only through an earlier screen or through a call the station's markup
 *        invented, and where nothing drives it the oracle produces no assertion at all rather than
 *        a red (reported as a note, never a failure);
 *   [D7] the screen model and the GENERATED anchor contract carry the same bindings — a check that
 *        reads a generated artifact while its source has moved reports over a tree that no longer
 *        exists (#670's shape);
 *   [D8] every `field` and `column` the model declares CARRIES a binding — `shows`, `prefill` or
 *        `fills` — or carries a DECLARED ESCAPE naming the issue that owns the gap. The OBLIGATION
 *        arm (#1794), beside the seven resolution arms above.
 *
 * WHY [D8] EXISTS, AND WHY IT IS AN ERROR (#1794, #628). [D1]-[D7] resolve every binding a screen
 * WRITES. They say nothing about an element that writes NONE, so a screen that binds nothing opted
 * out of the display oracle in SILENCE and this check stayed green over it — the whole of #628.
 * `vw-validate` does not hold the obligation either: it owns the language, and the language makes
 * `shows` optional. Measured on one project's six screen models, 2026-09-18: 149 displaying
 * elements, 37 carrying a `shows`, 8 carrying a `fills`, and TWO ENTIRE SCREENS binding nothing at
 * all — two of which produced three of that day's worked examples. Figaro's Software Architect
 * ruled the binding MANDATORY on relay R-477, his letter «B», 2026-09-18, in his own words:
 * «Every column and field carries a binding, or a declared reason with an issue number. The check
 * fails otherwise.» So this arm is an ERROR, not a warning, and the escape hatch is part of what
 * was bought — an arm with no escape is a different ruling.
 *
 * WHAT COUNTS AS A BINDING, AND WHAT IS NOT OBLIGATED. `shows` binds a DISPLAY, `prefill` the first
 * value of an INPUT (#1753), `fills` the contract input field an input is typed into (#701) — all
 * three resolve against the model, so all three discharge the obligation. THE CLAUSE DISCHARGES IT,
 * NOT THE CLAUSE RESOLVING (#1798): an element declaring `shows Reason` has been bound by its
 * author, badly, and telling them it «binds NOTHING» sends them to add an escape comment beside a
 * binding that is already there — the wrong repair, and it was about to be committed over six
 * screen models in one authoring pass. [D1] holds those elements and says the true sentence.
 * This narrows the population [D8] judges and weakens nothing: no element leaves the check, each
 * one moves to the arm that can name its actual defect. His sentence names
 * COLUMN AND FIELD, and this arm obligates exactly those two: a `banner` is a standing sentence the
 * screen states in its own words and binds nothing by construction, an `action` is pressed, and a
 * `column` marked `action` is a PER-ROW CONTROL rather than a cell (`role()` answers `button` for
 * it, #1628 defect 5) — none of them carries a value, so none of them is asked to bind one.
 * A plain unmarked `field` IS obligated even though `role()` types it as an input: the language has
 * no marker for «read-only, and bound to nothing» (see `role()`'s closing paragraph), and that
 * silence is exactly what the ruling ends — the author now says which it is, by binding it or by
 * declaring why it cannot be bound.
 *
 * THE ESCAPE IS A COMMENT, AND THAT IS A DELIBERATE CHOICE (#1794, #604). The shape was left to the
 * implementor. A new `.vw` CLAUSE would need grammar work in `claude-zulli-marketplace`, where the
 * grammar and `vw-validate` live — a second repository, a second release, and an obligation that
 * cannot be held until both land. A structured comment needs none of that: every reader of the
 * language already strips comments (`screen-model.ts`, and `stripComments` below), so an escape
 * changes no anchor contract, no emitted markup and no byte of any generated artifact. It also
 * follows a practice the corpus already has — VW02's channel picker «had to drop its binding and
 * say so in a comment» (#1080, quoted in `screen-model.ts`); this gives that sentence a spelling a
 * machine can count. THE SPELLING, on the declaration's own line or on the line(s) directly above:
 *
 *     // no-binding: #1234 the clerk's own scratch note; no Manager result answers it
 *     field remark "Note";
 *
 * Both halves are required and each missing half is its own finding: `#<number>` names the issue
 * that OWNS the gap (an escape with no issue is an opt-out with no owner, which is #628 again in a
 * comment), and the prose after it is the «declared reason» the ruling asks for. An element that
 * carries BOTH a binding and an escape is a finding too — one of the two is stale.
 *
 * AN ESCAPE IS A TRACKED DEFERRAL, NOT A CLAIM OF IMPOSSIBILITY. The ruling asks for a reason AND
 * an issue number, and an issue is how work is owned here — so «nothing binds this yet, and #1234
 * carries the pass that binds it» is as legitimate an escape as «no result field can ever answer
 * this». What the arm ends is the SILENCE: before it, an unbound element was indistinguishable
 * from a bound one on every green line this check printed. After it, every unbound element is one
 * of two visible things — a finding, or a declared gap with a named owner, counted on its own.
 *
 * WHY IT LIVES HERE AND NOT IN THE `.vw` VALIDATOR. `vw-validate` (screen-dsl plugin) owns the
 * LANGUAGE: the shape of a path, where a clause may sit, what the grammar accepts. It ships to any
 * project and cannot know a C# contract type or a C# recorder's reflection rules. Both inputs this
 * check joins — the generated contract types and the recorder — live in the project tree, so the
 * check lives with them. The two are complementary, not redundant: a path this check accepts may
 * still be refused by the grammar, and the grammar has no way to know whether `Tables` exists.
 *
 * Exit: 0 every binding resolves and is visible - 1 a finding - 2 usage.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

// ---------------------------------------------------------------------------- arguments

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const screensDir = flag('--screens');
const mapPath = flag('--map');
const csharpDir = flag('--csharp');
if (!screensDir || !mapPath || !csharpDir) {
  console.error('shows-check: --screens <dir> --map <seqmap.json> --csharp <dir> are all required');
  process.exit(2);
}
for (const p of [screensDir, mapPath, csharpDir]) {
  if (!existsSync(p)) { console.error(`shows-check: missing ${p}`); process.exit(2); }
}

const rel = (p) => relative(process.cwd(), p);
const findings = [];
const notes = [];

// ---------------------------------------------------------------------------- the tree walk

/** Every file under `dir` the picker accepts, ignoring build outputs — never an input. */
function walk(dir, pick, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'bin' || entry === 'obj' || entry === 'node_modules') continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, pick, out);
    else if (pick(p)) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------- the sequence map

const map = JSON.parse(readFileSync(mapPath, 'utf-8'));
if (!map.operations) { console.error(`shows-check: ${rel(mapPath)} declares no operations`); process.exit(2); }
/** Call-site id -> the operation(s) it enters through (`operation.variants`, #676 — any matches). */
const operationsBySi = new Map(
  Object.entries(map.operations).map(([si, o]) => [si, [o.operation, ...(o.operation?.variants ?? [])]]));

// ---------------------------------------------------------------------------- the generated types

/**
 * The generated contract surface, indexed per COMPONENT ROOT (`Component/<Tier>/<Stem>/Interface`).
 * Per root rather than globally because DTO names are facet-scoped and legitimately repeat across
 * components — `Sitting` is declared three times in this tree, and a global index would resolve a
 * booking's sitting against a seating engine's.
 */
const roots = new Map();

/** The brace block opening at `open`, and the index just past its close. */
function block(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') { depth -= 1; if (depth === 0) return { body: text.slice(open + 1, i), end: i + 1 }; }
  }
  return { body: text.slice(open + 1), end: text.length };
}

/** The component root a generated interface file belongs to: everything above its `Interface/`. */
function rootOf(file) {
  const marker = '/Interface/';
  const i = file.indexOf(marker);
  return i >= 0 ? file.slice(0, i + marker.length - 1) : null;
}

for (const file of walk(csharpDir, (p) => p.endsWith('.cs'))) {
  const root = rootOf(file);
  if (!root) continue;
  const source = readFileSync(file, 'utf-8');
  const ns = /^namespace\s+([\w.]+)\s*;/m.exec(source)?.[1];
  if (!roots.has(root)) roots.set(root, { types: new Map(), operations: new Map() });
  const index = roots.get(root);

  // enums — recorded as scalars (`IsEnum`), spelled by `[EnumMember]` (WireValue, #703).
  for (const m of source.matchAll(/^public\s+enum\s+(\w+)/gm)) index.types.set(m[1], { kind: 'enum', file });

  // contract classes and their properties, base type carried: a permutation request derives from
  // its operation request, and reflection reads inherited properties too.
  for (const m of source.matchAll(/^public\s+(?:sealed\s+|abstract\s+)?class\s+(\w+)(?:\s*:\s*(\w+))?/gm)) {
    const at = source.indexOf('{', m.index);
    if (at < 0) continue;
    const body = block(source, at).body;
    const props = [...body.matchAll(/public\s+(?:required\s+)?([\w<>?,.[\]]+)\s+(\w+)\s*\{\s*get;/g)]
      .map((p) => ({ name: p[2], type: p[1] }));
    index.types.set(m[1], { kind: 'class', base: m[2] ?? null, props, file });
  }

  // the facet interface — the ONLY authority on which result type an operation returns.
  if (/^public\s+interface\s+\w+/m.test(source) && ns) {
    const parts = ns.split('.');
    const at = parts.indexOf('Interface');
    if (at === 3 && parts.length > at + 1) {
      // `Comanda.Manager.Reservation.Interface.Booking` -> component `ReservationManager`, facet `Booking`.
      const component = `${parts[2]}${parts[1]}`;
      const facet = parts[at + 1];
      for (const m of source.matchAll(/Task<Response<(\w+)>>\s+(\w+)\s*\(/g))
        index.operations.set(`${component} ${facet} ${m[2]}`, { result: m[1], root });
    }
  }
}

/** The result type a call site's operation returns, or the reason it could not be resolved. */
function resultTypeOf(si) {
  const candidates = operationsBySi.get(si);
  if (!candidates)
    return { error: `${si} is not in ${rel(mapPath)} — the binding names a call site the sequence map does not have` };
  for (const op of candidates) {
    if (!op?.component || !op?.facet || !op?.name) continue;
    for (const [root, index] of roots) {
      const hit = index.operations.get(`${op.component} ${op.facet} ${op.name}`);
      if (hit) return { root, index, type: hit.result, operation: op.name };
    }
  }
  const named = candidates.filter(Boolean).map((o) => `${o.component}.${o.facet}.${o.name}`).join(' / ');
  return { error: `${si} (${named}) — no generated facet interface under ${rel(csharpDir)} declares that operation, so the result type it returns is unknown` };
}

// ---------------------------------------------------------------------------- the recorder, mirrored

/**
 * `CallRecorderInterceptor.IsScalar` (TheAgent.Spec.Trace), as a static question about a DECLARED
 * type. A value one anchor can render: the listed reference/struct types, any C# primitive, and any
 * enum. Everything else is WALKED — which is exactly why a binding to it records nothing under its
 * own name.
 *
 * `DateOnly` is deliberately NOT here: the recorder does not list it and it is neither primitive
 * nor an enum, so it is walked as an object and reaches the trace as `Date.Year`, `Date.Month`, and
 * the rest. A screen bound to a `DateOnly` field displays a date and asserts nothing.
 */
const SCALARS = new Set([
  'string', 'bool', 'decimal', 'Guid', 'DateTime', 'DateTimeOffset', 'TimeSpan',
  'byte', 'sbyte', 'short', 'ushort', 'int', 'uint', 'long', 'ulong', 'char', 'float', 'double',
  'nint', 'nuint', 'String', 'Boolean', 'Decimal', 'Byte', 'SByte', 'Int16', 'UInt16', 'Int32',
  'UInt32', 'Int64', 'UInt64', 'Char', 'Single', 'Double',
]);

/**
 * Framework types the recorder does NOT treat as scalar and therefore WALKS, named here so the
 * finding can say what actually happens instead of "this type is declared nowhere". `DateOnly` is
 * the one this tree carries: `IsScalar` lists `DateTime` and not it, and a `DateOnly` is neither
 * primitive nor an enum, so a result field of that type reaches the trace as `Date.Year`,
 * `Date.Month`, `Date.Day`, `Date.DayNumber` and never as `Date`.
 */
const WALKED = new Map([
  ['DateOnly', 'Year, Month, Day, DayNumber, DayOfWeek, DayOfYear'],
  ['TimeOnly', 'Hour, Minute, Second, Millisecond, Ticks'],
]);

const bare = (type) => type.replace(/\s+/g, '').replace(/\?$/, '');

/** The element type of a collection the recorder would project, or null when it is not one. */
function elementOf(type) {
  const t = bare(type);
  const generic = /^(?:List|IList|IReadOnlyList|ICollection|IReadOnlyCollection|IEnumerable|HashSet|ISet)<(.+)>$/.exec(t);
  if (generic) return generic[1];
  if (t.endsWith('[]')) return t.slice(0, -2);
  return null;
}

function typeKind(index, type) {
  const t = bare(type);
  if (SCALARS.has(t)) return { kind: 'scalar' };
  if (WALKED.has(t)) return { kind: 'walked', leaves: WALKED.get(t) };
  const element = elementOf(t);
  if (element) return { kind: 'collection', element };
  const declared = index.types.get(t);
  if (!declared) return { kind: 'unknown' };
  return declared.kind === 'enum' ? { kind: 'scalar' } : { kind: 'class', declared };
}

/** A type's properties, inherited ones included — `Type.GetProperties()` returns those too. */
function propertiesOf(index, declared, seen = new Set()) {
  const out = [...declared.props];
  if (declared.base && !seen.has(declared.base)) {
    seen.add(declared.base);
    const parent = index.types.get(declared.base);
    if (parent?.kind === 'class') out.push(...propertiesOf(index, parent, seen));
  }
  return out;
}

/** The recorder's nesting budget: `AddScalarFields` recurses while `depth < 2`. */
const DEPTH_CAP = 2;

/**
 * Resolve one `shows` path against the result type, answering both questions at once: does every
 * segment exist, and does the recorder write the leaf under the name the oracle looks up?
 *
 * Returns `{ ok, key }` or `{ ok: false, why }` — `key` being the recorder key the assertion will
 * look for, so a green line can SAY what it will assert rather than merely claim to have checked.
 */
function resolvePath(root, index, resultType, path, kind) {
  if ((path.match(/\[\]/g) ?? []).length > 1)
    return { ok: false, why: '[D5] two row placeholders in one path — one declaration stands for one anchor per element of ONE collection' };

  const segments = path.split('.');
  const start = index.types.get(resultType);
  if (!start || start.kind !== 'class')
    return { ok: false, why: `[D2] the generated tree declares no contract class ${resultType}` };
  let current = { kind: 'class', declared: start };
  let owner = resultType;
  let depth = 0;
  let key = '';

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const last = i === segments.length - 1;
    const indexed = /^(\w+)(\[\]|\[(\d+)\])$/.exec(segment);
    const name = indexed ? indexed[1] : segment;
    if (!/^\w+$/.test(name)) return { ok: false, why: `[D1] '${segment}' is not a field name` };
    if (current.kind !== 'class')
      return { ok: false, why: `[D3] the path continues past ${key} into '${segment}', and ${key} is not an object` };

    const property = propertiesOf(index, current.declared).find((p) => p.name === name);
    if (!property) {
      const available = propertiesOf(index, current.declared).map((p) => p.name);
      return {
        ok: false,
        why: `[D3] ${owner} has no field named ${name} — it carries ${available.join(', ') || '(nothing)'}`,
      };
    }
    if (name === 'Truncated')
      return { ok: false, why: '[D4] Truncated is the recorder\'s own capture-cap marker, never a value a screen shows' };

    const type = typeKind(index, property.type);
    if (type.kind === 'unknown')
      return {
        ok: false,
        why: `[D2] ${owner}.${name} is a ${bare(property.type)}, declared nowhere under ${rel(root)} — the check cannot say whether the binding resolves, and an unresolvable binding is a finding, never a pass`,
      };

    if (indexed) {
      if (type.kind !== 'collection')
        return { ok: false, why: `[D5] the row placeholder is on ${owner}.${name}, a ${bare(property.type)} — [] repeats over a collection and there is nothing here to repeat over` };
      if (indexed[2] === '[]' && kind !== 'column')
        return { ok: false, why: `[D5] the row placeholder declares one anchor per element and this is a ${kind}, not a column — a single control cannot render a collection (#630)` };
      if (depth > 0)
        return { ok: false, why: `[D5] ${key}${name} is a collection nested inside another object, and the recorder writes only its .Count, never its elements — bind a top-level collection or a display-ready scalar (#630)` };
      key += `${name}[${indexed[2] === '[]' ? 'i' : indexed[3]}]`;
      const element = typeKind(index, type.element);
      if (element.kind === 'unknown')
        return { ok: false, why: `[D2] the elements of ${owner}.${name} are ${type.element}, declared nowhere under ${rel(root)}` };
      if (last) {
        if (element.kind === 'scalar') return { ok: true, key };
        return { ok: false, why: `[D4] ${key} is a ${type.element}, not a value one cell can display — name the element field the column renders (${name}[].<Field>)` };
      }
      if (element.kind !== 'class')
        return { ok: false, why: `[D3] the path continues past ${key}, whose elements are ${type.element}` };
      current = element;
      owner = type.element;
      depth = 1; // AddCollection projects an element through AddScalarFields at depth + 1.
      key += '.';
      continue;
    }

    if (type.kind === 'collection') {
      if (last)
        return {
          ok: false,
          why: `[D4] ${owner}.${name} is a ${bare(property.type)} — the recorder writes ${key}${name}.Count and ${key}${name}[0] onward, never ${key}${name} itself, so one anchor bound to the whole collection can display nothing the oracle can find. Bind an element path (${name}[]) on a column, or a display-ready scalar (#630)`,
        };
      if (segments[i + 1] === 'Truncated')
        return { ok: false, why: `[D4] Truncated is the recorder's own capture-cap marker on ${key}${name}, never a value a screen shows` };
      if (segments[i + 1] === 'Count' && i + 2 === segments.length) {
        if (depth > 0) return { ok: false, why: `[D4] ${key}${name}.Count is nested past the recorder's own walk` };
        return { ok: true, key: `${key}${name}.Count` };
      }
      return {
        ok: false,
        why: `[D5] ${key}${name} is a ${bare(property.type)} and the path steps into it without the row placeholder — write ${name}[].${segments.slice(i + 1).join('.')} on a column`,
      };
    }

    if (type.kind === 'walked')
      return {
        ok: false,
        why: `[D4] ${owner}.${name} is a ${bare(property.type)}, which CallRecorder.IsScalar does not list — it is neither primitive nor an enum, so the recorder WALKS it and the trace carries ${key}${name}.{${type.leaves}} instead of ${key}${name}. Nothing is recorded under the field's own name, so the binding is invisible to the display oracle; give the DTO a display-ready form of the value`,
      };

    if (last) {
      if (type.kind === 'scalar') return { ok: true, key: key + name };
      return {
        ok: false,
        why: `[D4] ${owner}.${name} is a ${bare(property.type)}, an object the recorder walks INTO — it writes ${key}${name}.<leaf> for each of that object's scalar fields and never ${key}${name} itself. Name the leaf the screen shows`,
      };
    }

    if (type.kind === 'scalar')
      return { ok: false, why: `[D3] the path continues past ${owner}.${name}, which is a ${bare(property.type)}` };
    if (depth + 1 > DEPTH_CAP)
      return { ok: false, why: `[D4] ${key}${name} is nested deeper than the recorder walks (it stops after ${DEPTH_CAP} levels), so nothing under it reaches the trace` };
    current = type;
    owner = bare(property.type);
    depth += 1;
    key += `${name}.`;
  }

  return { ok: false, why: `[D1] '${path}' resolves to nothing` };
}

// ---------------------------------------------------------------------------- the bindings

/** Strips `//` and block comments without touching string literals — the screen language's own rule. */
function stripComments(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"') { const end = source.indexOf('"', i + 1); const stop = end < 0 ? source.length : end + 1; out += source.slice(i, stop); i = stop; continue; }
    if (ch === '/' && source[i + 1] === '/') { const nl = source.indexOf('\n', i); i = nl < 0 ? source.length : nl; continue; }
    if (ch === '/' && source[i + 1] === '*') { const end = source.indexOf('*/', i + 2); i = end < 0 ? source.length : end + 2; out += ' '; continue; }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * The `shows` and `prefill` clauses of one screen model. Deliberately NOT a second screen-model parser: the
 * screen-dsl skill's `vw-validate` owns the language and the runtime's own reader owns the anchor
 * inventory. This reads the one clause, with the statement keyword that says whether the anchor is
 * a field or a column — enough to ask whether the binding resolves, and enough to notice that a
 * generated contract no longer matches the model it was generated from.
 */
function showsOf(source) {
  const out = [];
  for (const m of stripComments(source).matchAll(/\b(field|column)\s+([A-Za-z0-9_.]+)([^;{]*);/g)) {
    // WHATEVER THE CLAUSE NAMES, NOT ONLY WHAT RESOLVES (#1798). These patterns required a DOT
    // until then, so `shows Reason` — a bare field name — matched nothing and the clause was
    // invisible to every arm below: [D1] never asked whether it was a binding, and [D8] read the
    // element as binding NOTHING. One authored binding, and no true sentence about it anywhere.
    // The SHAPE question is [D1]'s and is asked below; this reader's job is only to see the clause.
    const shows = /\bshows\s+([A-Za-z0-9_][A-Za-z0-9_.[\]]*)/.exec(m[3] ?? '')?.[1];
    if (shows) out.push({ kind: m[1], name: m[2], shows, clause: 'shows' });
    // `prefill` names where the FIRST value of an INPUT comes from (#1753). It resolves against
    // the same types as a display, so it is checked here — and it is NOT a display, so the two
    // are never merged: see the [D4] split below.
    const prefill = /\bprefill\s+([A-Za-z0-9_][A-Za-z0-9_.[\]]*)/.exec(m[3] ?? '')?.[1];
    if (prefill) out.push({ kind: m[1], name: m[2], shows: prefill, clause: 'prefill' });
  }
  return out;
}

/**
 * The bare CALL SITE ids one screen model declares it `reads` — the load-time reads, in the model's own
 * words (#762). Read as a SET over the file, not per section: [D7] asks whether the generated
 * contract still carries the declaration, and the section a clause sits in is the runtime reader's
 * business, not this check's. The map's full `BPxx.yy_Name` form normalizes to the bare id the
 * bindings are keyed by.
 */
function readsOf(source) {
  const out = new Set();
  for (const m of stripComments(source).matchAll(/(?:^|[\s;{])reads\s+([A-Za-z0-9_.]+)\s*;/g)) {
    const cs = /^(BP\d{2}\.\d{2})/.exec(m[1] ?? '')?.[1];
    if (cs) out.add(cs);
  }
  return out;
}

/**
 * The source with every comment replaced by spaces of the same length — offsets, line breaks and
 * every string literal preserved byte for byte, so a match found in the masked copy indexes the
 * ORIGINAL. `stripComments` above cannot serve [D8]: it DELETES, so the offset of a declaration in
 * its output names a different place in the file, and the escape has to be found by position.
 *
 * Returns the masked text, the `//` comment of each line (1-based), which is where an escape is
 * written, and the lines that carry CODE — a line can hold both, and telling them apart is what
 * keeps one declaration's trailing escape from being read as the next declaration's.
 */
function maskComments(source) {
  const masked = [...source];
  const comments = new Map();
  let line = 1;
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\n') { line += 1; i += 1; continue; }
    if (ch === '"') {
      const end = source.indexOf('"', i + 1);
      const stop = end < 0 ? source.length : end + 1;
      // A skipped span STILL CARRIES ITS LINE BREAKS. Counting them only in the branch above puts
      // every later comment on the wrong line the moment a `doc /* … */` block is passed — which
      // is most of a real screen model, and it silently loses the escapes of everything below it.
      line += source.slice(i, stop).split('\n').length - 1;
      i = stop;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i);
      const stop = nl < 0 ? source.length : nl;
      comments.set(line, `${comments.get(line) ?? ''}${source.slice(i + 2, stop)}`);
      for (let k = i; k < stop; k += 1) masked[k] = ' ';
      i = stop;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? source.length : end + 2;
      for (let k = i; k < stop; k += 1) if (masked[k] !== '\n') masked[k] = ' ';
      line += source.slice(i, stop).split('\n').length - 1;
      i = stop;
      continue;
    }
    i += 1;
  }
  const code = new Set();
  masked.join('').split('\n').forEach((text, i) => { if (text.trim()) code.add(i + 1); });
  return { masked: masked.join(''), comments, code };
}

/**
 * A declared escape read out of one comment, or null when the comment is not one. The reason is
 * everything after the issue number, with a leading dash or colon dropped so both
 * `#12 — because …` and `#12 because …` read the same.
 */
function escapeOf(comment) {
  if (comment === undefined) return null;
  const m = /\bno-binding\s*:\s*(.*)$/i.exec(comment);
  if (!m) return null;
  const rest = m[1].replace(/\s+/g, ' ').trim();
  const issue = /^#(\d+)\b/.exec(rest);
  const reason = (issue ? rest.slice(issue[0].length) : rest).replace(/^\s*[-–—:]\s*/, '').trim();
  return { issue: issue ? issue[1] : null, reason, text: rest };
}

/**
 * Every `field` and `column` one screen model declares, with what binds it and the escape that may
 * stand on it — the population [D8] holds the obligation over.
 *
 * Deliberately NOT a second screen-model parser, for the same reason `showsOf` is not: it reads the
 * declaration statement and its modifiers, which is all the obligation asks about. The escape is
 * looked for in two places and no others — on the line the declaration ENDS on (a trailing comment)
 * and on the contiguous comment lines directly ABOVE where it starts, which is how the corpus
 * already writes a note about a declaration.
 */
function elementsOf(source) {
  const { masked, comments, code } = maskComments(source);
  const lineAt = (offset) => (masked.slice(0, offset).match(/\n/g)?.length ?? 0) + 1;
  // The SECTION an element is reported under — the nearest section header above it, the same ten
  // kinds the language's own validator accepts (`SECTION_KINDS`, screen-model.ts). A LABEL only:
  // two fields of one screen legitimately share a name (VW10 has `key` twice), and a finding that
  // cannot be told apart from its neighbour is half a finding. The line number beside it is the
  // locator that cannot be wrong.
  const sections = [...masked.matchAll(/\b(?:table|detail|form|list|cards|kpis|toolbar|wizard|step|gallery)\s+([A-Za-z0-9_]+)\s*\{/g)]
    .map((m) => ({ at: m.index, name: m[1] }));
  const sectionAt = (offset) => [...sections].reverse().find((s) => s.at < offset)?.name ?? 'Screen';
  const out = [];
  for (const m of masked.matchAll(/\b(field|column)\s+([A-Za-z0-9_.]+)([^;{]*);/g)) {
    const tail = m[3] ?? '';
    const start = lineAt(m.index);
    const end = lineAt(m.index + m[0].length);
    // The comment block directly above is read AS ONE TEXT, not line by line: a reason worth
    // writing rarely fits in one line, and reading each line alone truncates it at the first wrap.
    // Only comment-ONLY lines count as «above»: a trailing escape sits on a line that also carries
    // a declaration, and that line is the line above the NEXT declaration. Read without this, one
    // element's escape silently discharges its neighbour's obligation — measured while landing
    // #1794 on the golden process, where a stamped `key` box discharged the `partySize` beneath it.
    const above = [];
    for (let l = start - 1; comments.has(l) && !code.has(l); l -= 1) above.unshift(comments.get(l));
    const escape = escapeOf(comments.get(end)) ?? escapeOf(above.join(' '));
    const modifiers = tail
      .replace(/"[^"]*"/g, ' ')
      .replace(/\b(?:shows|prefill)\s+[A-Za-z0-9_][A-Za-z0-9_.[\]]*/g, ' ')
      .replace(/\bfills\s+[A-Za-z0-9_\s]+?(?=\s*(?:\bshows\b|\bprefill\b|\bwhen\b|\bexample\b|$))/g, ' ')
      .trim().split(/\s+/).filter(Boolean);
    // A CLAUSE IS A BINDING HERE EVEN WHEN ITS VALUE DOES NOT RESOLVE (#1798) — the dot these three
    // patterns used to require is what made [D8] say «binds NOTHING» about an element whose
    // declaration carried `shows Reason` on the same line. The obligation arm asks ONE question:
    // did the author bind this element or declare who owns the gap. Whether what they bound
    // resolves is [D1]'s question, and [D1] now asks it of exactly these clauses — so narrowing
    // this population loses no element, it hands each one to the arm that can speak truly about it.
    const binding = /\bshows\s+[A-Za-z0-9_]/.test(tail) ? 'shows'
      : /\bprefill\s+[A-Za-z0-9_]/.test(tail) ? 'prefill'
        : /\bfills\s+[A-Za-z0-9_]/.test(tail) ? 'fills' : null;
    out.push({ kind: m[1], name: m[2], section: sectionAt(m.index), line: start, modifiers, binding, escape });
  }
  return out;
}

const screens = new Map();
for (const file of walk(screensDir, (p) => p.endsWith('.vw'))) {
  const source = readFileSync(file, 'utf-8');
  const name = /screen\s+([A-Za-z0-9_]+)\s*\{/.exec(stripComments(source))?.[1] ?? basename(file, '.vw');
  screens.set(name, { file, model: showsOf(source), modelReads: readsOf(source), elements: elementsOf(source), contract: null, contractFile: null, calls: new Set(), contractReads: new Set() });
}

for (const file of walk(csharpDir, (p) => p.endsWith('.uicontract.json'))) {
  const doc = JSON.parse(readFileSync(file, 'utf-8'));
  if (doc.format !== 'ui-anchor-contract/1') continue;
  if (!screens.has(doc.screen))
    screens.set(doc.screen, { file: null, model: [], modelReads: new Set(), elements: [], contract: null, contractFile: null, calls: new Set(), contractReads: new Set() });
  const entry = screens.get(doc.screen);
  entry.contract = (doc.anchors ?? []).filter((a) => a.shows || a.prefill);
  entry.contractFile = file;
  // What DRIVES an operation on this screen: a control that `calls` it, or a section declared
  // `reads SI02.02;` — the load-time read a worklist issues when the screen opens, which has no
  // control to hang it on (#762). Both are declarations of the same fact ("this screen asks for
  // this operation"), so both answer [D6]; a `reads` may carry the map's full `BPxx.yy_Name` form,
  // which is normalized to the bare id the bindings are keyed by.
  for (const a of doc.anchors ?? []) {
    if (a.calls) entry.calls.add(a.calls);
    for (const r of a.reads ?? []) {
      const cs = /^(BP\d{2}\.\d{2})/.exec(r)?.[1];
      if (cs) { entry.calls.add(cs); entry.contractReads.add(cs); }
    }
  }
}

// ---------------------------------------------------------------------------- the verdict

let checked = 0;
let green = 0;
let bound = 0;
const lines = [];

// [D8] the OBLIGATION arm's own tally — printed whether or not it finds anything, because the
// ruling that bought the arm asks for the count either way («The check tool counts bound and
// unbound elements»).
const obligation = { elements: 0, screens: 0, bound: 0, declared: 0, unbound: 0, exempt: 0 };
const obligationLines = [];

for (const [screen, entry] of [...screens].sort(([a], [b]) => a.localeCompare(b))) {
  /**
   * One row per bound ANCHOR — never per `shows` string: two anchors legitimately render the same
   * value (a list and its summary), and keying on the path would collapse them into one and take
   * the kind of whichever was read last, which is how a row placeholder on a field would pass.
   */
  // ---- [D8] the OBLIGATION arm (#1794, SA ruling R-477 «B»).
  //
  // Read against the MODEL and not the generated contract, for two reasons: the escape is a comment
  // and no generated artifact carries one (by design — see the header), and an element that binds
  // NOTHING never reaches the anchor contract's bound list at all, which is the silence the arm
  // exists to end. A screen known only from a generated contract has no model to hold the
  // obligation over and is skipped rather than guessed at.
  if (entry.file) {
    const own = [];
    obligation.screens += 1;
    for (const element of entry.elements) {
      const at = `${screen}.${element.section}.${element.name}`;
      // A `column` marked `action` is a per-row CONTROL, not a cell: it is pressed, carries no
      // value, and `role()` answers `button` for it (#1628 defect 5). Nothing to bind.
      if (element.kind === 'column' && element.modifiers.includes('action')) {
        obligation.exempt += 1;
        continue;
      }
      obligation.elements += 1;
      if (element.binding && element.escape) {
        obligation.bound += 1;
        findings.push(
          `[D8] ${at}: the model binds it with \`${element.binding}\` AND declares an escape ` +
          `(\`no-binding: ${element.escape.text}\`) — one of the two is stale. An escape says NOTHING ` +
          'binds this element and names the issue that owns that; this one is bound');
        own.push(`    RED      ${element.kind} ${element.section}.${element.name} — bound and escaped at once`);
        continue;
      }
      if (element.binding) { obligation.bound += 1; continue; }
      if (element.escape) {
        if (!element.escape.issue) {
          obligation.unbound += 1;
          findings.push(
            `[D8] ${at}: the ${element.kind} declares \`no-binding: ${element.escape.text}\` and names NO ` +
            'ISSUE — an escape with no issue is an opt-out nobody owns, which is the silence this arm ' +
            'ends (#628). Write the issue that carries the gap: `// no-binding: #<number> <why>`');
          own.push(`    RED      ${element.kind} ${element.section}.${element.name} — escape names no issue`);
          continue;
        }
        if (!element.escape.reason) {
          obligation.unbound += 1;
          findings.push(
            `[D8] ${at}: the ${element.kind} escapes to #${element.escape.issue} and gives NO REASON — ` +
            'the ruling asks for a declared REASON with an issue number, and an issue number alone ' +
            'says only that somebody wrote one down. Say in the comment why nothing binds it');
          own.push(`    RED      ${element.kind} ${element.section}.${element.name} — escape gives no reason`);
          continue;
        }
        obligation.declared += 1;
        own.push(`    DECLARED ${element.kind} ${element.section}.${element.name} — no binding, #${element.escape.issue}: ${element.escape.reason}`);
        continue;
      }
      obligation.unbound += 1;
      findings.push(
        `[D8] ${at}: the model declares a ${element.kind} (${rel(entry.file)}:${element.line}) and binds ` +
        'NOTHING — no `shows`, no `prefill`, no `fills`, and no declared escape. An element that binds ' +
        'nothing opts out of the display oracle in silence and every check stays green over it ' +
        '(#628). Bind it, or declare the reason with the issue that owns the gap, on the ' +
        'declaration or the line above it: `// no-binding: #<number> <why nothing binds it>`');
      own.push(`    UNBOUND  ${element.kind} ${element.section}.${element.name} — nothing binds it and nothing says why`);
    }
    if (own.length) {
      obligationLines.push(`  ${screen}  (${rel(entry.file)})`);
      obligationLines.push(...own);
    }
  }

  /**
   * The model's bindings that are NOT call-site shaped — `shows Reason` rather than
   * `shows BP02.01.Reason` (#1798). They are carried EXPLICITLY, because the list below otherwise
   * reads the generated CONTRACT wherever one exists and a short form never reaches a contract:
   * on a screen that HAS been scaffolded, reading the contract alone is what would keep the very
   * silence this arm ends. Each one falls into the `[D1]` branch of the loop below and is told,
   * in its own words, that it is not a `BPxx.yy.<FieldPath>` binding.
   */
  const CALL_SITE = /^BP\d{2}\.\d{2}\./;
  const shortForm = entry.file ? entry.model.filter((b) => !CALL_SITE.test(b.shows)) : [];
  const bindings = entry.contract
    ? [
        ...entry.contract.map((a) => ({
          shows: a.shows ?? a.prefill,
          clause: a.shows ? 'shows' : 'prefill',
          kind: a.kind,
          name: `${a.section}.${a.name}`,
        })),
        ...shortForm.map((b) => ({ shows: b.shows, clause: b.clause, kind: b.kind, name: b.name })),
      ]
    : entry.model.map((b) => ({ shows: b.shows, clause: b.clause, kind: b.kind, name: b.name }));
  if (bindings.length === 0) continue;
  bound += 1;

  // [D7] the generated contract and the model it was generated from carry the same bindings. The
  // check reads the CONTRACT (it is what the oracle and the markup read), so a model that has
  // moved underneath it makes every answer below about a tree that no longer exists (#670's shape).
  if (entry.contract && entry.file) {
    // The CLAUSE is part of the comparison: a model that turned a `shows` into a `prefill` (#1753)
    // changed what the contract promises, and a check keyed on the path alone would call that
    // unchanged.
    // Call-site shaped bindings ONLY. A short form is a binding the scaffolder cannot carry into a
    // contract — [D1] has just refused it — so its absence from the contract is not staleness, and
    // reporting it here would name the wrong cause AND report one defect twice (#1798).
    const inModel = entry.model.filter((b) => CALL_SITE.test(b.shows)).map((b) => `${b.clause} ${b.shows}`).sort();
    const inContract = entry.contract.map((a) => `${a.shows ? 'shows' : 'prefill'} ${a.shows ?? a.prefill}`).sort();
    const missing = inModel.filter((s) => !inContract.includes(s));
    const extra = inContract.filter((s) => !inModel.includes(s));
    // A key is `<clause> <path>`; it is READ BACK for the message, so a display reads exactly as it
    // always did and a pre-fill says which clause it is.
    const said = (key) => {
      const [clause, ...rest] = key.split(' ');
      const path = rest.join(' ');
      return clause === 'shows' ? path : `${path} as a \`${clause}\``;
    };
    for (const key of new Set(missing))
      findings.push(`[D7] ${screen}: the model binds ${said(key)} and ${rel(entry.contractFile)} does not — the generated contract is stale, so every answer below it is about a tree that no longer exists`);
    for (const key of new Set(extra))
      findings.push(`[D7] ${screen}: ${rel(entry.contractFile)} carries ${said(key)} and ${rel(entry.file)} no longer binds it — the generated contract is stale`);
    // The same question for the LOAD-TIME reads (#762): the model's `reads` clause is what answers
    // [D6], and it answers it only through the generated contract. A declaration that has not been
    // regenerated into the contract would leave the bindings reported UNDRIVEN with the model
    // saying otherwise — the disagreement is the finding, not the note.
    for (const si of [...entry.modelReads].filter((si) => !entry.contractReads.has(si)).sort())
      findings.push(`[D7] ${screen}: the model declares \`reads ${si};\` and ${rel(entry.contractFile)} carries no such read — the generated contract is stale, so the load-time read is declared in the model and invisible to every consumer of the contract`);
    for (const si of [...entry.contractReads].filter((si) => !entry.modelReads.has(si)).sort())
      findings.push(`[D7] ${screen}: ${rel(entry.contractFile)} declares a \`reads\` of ${si} and ${rel(entry.file)} no longer does — the generated contract is stale`);
  } else if (entry.file) {
    notes.push(`${screen}: ${bindings.length} binding(s) checked against the model alone — no generated anchor contract under ${rel(csharpDir)}, so no station has been scaffolded for this screen yet`);
  }

  lines.push(`  ${screen}  (${rel(entry.file ?? entry.contractFile)})`);
  for (const { shows, clause, ...b } of [...bindings].sort((x, y) => x.shows.localeCompare(y.shows) || x.name.localeCompare(y.name))) {
    checked += 1;
    const at = `${screen}.${b.name}`;
    const m = /^(BP\d{2}\.\d{2})\.(.+)$/.exec(shows);
    if (!m) {
      // The TAIL names the repair, and the repair depends on what the author actually wrote. A
      // bare field name is a DIFFERENT mistake from an SIxx.yy, and telling the author of
      // `shows Reason` about interactions-versus-call-sites sends them to read the wrong ruling
      // (#1798). Both tails are true of the clause they are printed for, and neither is printed
      // for the other.
      const tail = shows.includes('.')
        ? 'A screen names the CALL SITE it starts (ADR-069 §5); an SIxx.yy here is the interaction, which a screen model authored at Mockup cannot know'
        : `A BARE FIELD NAME names no call, and the display oracle asserts that this element shows the \`${shows}\` that a NAMED call RETURNED (ADR-037 §1) — with no call named there is nothing to compare it against, so the clause binds the element to nothing checkable. Prefix it with the call site the value arrives on: \`${clause} BPxx.yy.${shows}\``;
      findings.push(`[D1] ${at}: \`${shows}\` is not a BPxx.yy.<FieldPath> binding — the oracle derives no assertion from it. ${tail}`);
      lines.push(`    RED     ${shows} — not a BPxx.yy.<FieldPath> binding`);
      continue;
    }
    const [, si, path] = m;
    const target = resultTypeOf(si);
    if (target.error) {
      findings.push(`[D2] ${at}: ${target.error}`);
      lines.push(`    RED     ${shows} — ${target.error}`);
      continue;
    }
    const verdict = resolvePath(target.root, target.index, target.type, path, b.kind);
    if (!verdict.ok) {
      const id = verdict.why.slice(1, 3);
      const why = verdict.why.slice(5);
      // [D4] IS THE DISPLAY ORACLE'S QUESTION, AND A PRE-FILL DOES NOT ASK IT (#1753). It asks
      // whether the CALL RECORDER can carry the value, because the oracle compares a rendered
      // value against a recorded one. A `prefill` produces no such assertion — it states where a
      // control's first value comes from — so a value the recorder cannot carry is a limit on
      // what could be checked later, never a defect in the binding. The TYPE questions [D1]-[D3]
      // and the row-placeholder rule [D5] are structural and still bind it.
      if (clause === 'prefill' && id === 'D4') {
        notes.push(`${at}: ${shows} resolves against ${target.type} (${target.operation}) and the call recorder cannot carry it — ${why}. It is a \`prefill\`, so no display assertion is derived from it and this is not a finding. Nothing checks the value the control starts with`);
        green += 1;
        lines.push(`    UNRECORDED ${shows} -> ${target.operation} returns ${target.type} (prefill)`);
        continue;
      }
      findings.push(`[${id}] ${at}: ${shows} against ${target.type} (${target.operation}) — ${why}`);
      lines.push(`    RED     ${shows} — ${why.split('—')[0].trim()}`);
      continue;
    }
    green += 1;
    // [D6] driven from this screen, or the oracle has nothing to make an assertion out of.
    const undriven = Boolean(entry.contract) && !entry.calls.has(si);
    lines.push(`    ${undriven ? 'UNDRIVEN' : 'GREEN   '} ${shows} -> ${target.operation} returns ${target.type}, recorded as ${verdict.key}${clause === 'prefill' ? ' (prefill)' : ''}`);
    if (undriven && clause === 'prefill')
      notes.push(`${at}: ${shows} is a \`prefill\` and NOTHING on this screen declares ${si} — no control \`calls\` it and no section \`reads\` it on entry. The control then opens with nothing in it, because the answer it would be filled from is never asked for. A load-time read is declared \`reads ${si};\` on the section it fills (#762)`);
    else if (undriven)
      notes.push(`${at}: ${shows} resolves and is recordable, but NOTHING on this screen declares ${si} — no control \`calls\` it and no section \`reads\` it on entry. The operation reaches the trace only if something else drives it (an earlier screen, or a call the station's markup invented). Where nothing does, the oracle produces no assertion at all rather than a red, and an absent assertion reads as coverage (#673's shape). A load-time read is declared \`reads ${si};\` on the section it fills (#762)`);
  }
}

console.log(`shows-check: ${checked} binding(s) across ${bound} screen(s) with bindings\n`);
for (const line of lines) console.log(line);
// [D8] the count, printed either way — bound, declared and unbound, over the whole screen corpus.
console.log(
  `\nobligation (#1794) — every \`field\` and \`column\` carries a binding or a declared escape:\n` +
  `  ${obligation.elements} element(s) over ${obligation.screens} screen model(s): ` +
  `${obligation.bound} bound, ${obligation.declared} declared, ${obligation.unbound} unbound` +
  `${obligation.exempt ? `, ${obligation.exempt} per-row control(s) exempt` : ''}`);
for (const line of obligationLines) console.log(line);

if (notes.length) {
  console.log('\nnotes:');
  for (const n of notes) console.log(`  - ${n}`);
}

if (findings.length) {
  console.error('');
  for (const f of findings) console.error(`shows-check: ${f}`);
  console.error(
    `\n${findings.length} finding(s) over ${checked} binding(s) and ${obligation.elements} element(s). A ` +
    `\`shows\` path is data everywhere else — the ` +
    'validator leaves it unchecked, the anchor emitter passes it through and the C# build never sees it — so a ' +
    'binding that names a field the contract does not have, or one the recorder cannot carry, reaches a landed ' +
    'screen and is found only by driving it in a browser (#663, #630).');
  process.exit(1);
}
console.log(
  `\nshows-check: OK — all ${green} binding(s) resolve against the generated contract types and are recordable by ` +
  'CallRecorderInterceptor; each line names the recorder key the display oracle will look up, and all ' +
  `${obligation.elements} element(s) either bind a value or declare, with an issue, why they cannot.`);
