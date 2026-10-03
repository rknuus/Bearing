#!/usr/bin/env node
// qa — lint and gate-check the project's Q&A ledger (.method/qa.yaml).
//
// The ledger (ADR-040 §3, format: process-specs/qa-ledger-format.md) is the typed,
// append-only home of design questions: the AI appends, the Software Architect records
// answers. This tool is the mechanical side of "no open Q&A-ledger entry blocking a
// promoted element" — a Gate-1/Gate-2 exit check (ADR-040 §3; tooling contract §9).
//
// Commands:
//   qa check <qa.yaml>            lint only
//   qa check <qa.yaml> --gate intent
//                                 + fail on open entries blocking the business design
//                                 + fail on answered rulings with no exercisedBy trace
//                                   and no deferred-scope declaration (ADR-060, #840)
//                                 + fail on a non-live process no answered ruling claims, and
//                                   on an enforcedBy whose process still reads live (#1241)
//                                 + accept the THIRD trace kind, toolingBy — a ruling whose
//                                   whole content is that the toolchain changed and the model
//                                   did not (figaro#406, SA letter A on figaro#404)
//   qa check <qa.yaml> --gate blueprint
//                                 + fail on ANY open entry with a non-empty blocks list
//                                   (same ruling-trace rule as Intent)
//                                 both gates: + fail on answered rulings with no 'digest'
//                                   (#1049) — the Lesart the review surface renders in place
//                                   of a verbatim answer nobody can read at a glance. Within a
//                                   stage the check only reports how many are still owed.
//   --map <seqmap.json>           resolve exercisedBy SI/BP/path tokens against the
//                                 generated Sequence Map instead of shape-only
//   qa digest <qa.yaml>           #944: print the answer REVISION DIGEST of every answered
//                                 entry — 8 hex characters, COMPUTED and never stored. Not to
//                                 be confused with the entry's authored `digest:` field
//                                 (#1049), which is prose a human wrote for a reader.
//                                 Marks every entry a later one supersedes as well: the
//                                 two triggers for "the ruling this artifact was written
//                                 against no longer holds". A report, not a gate — where
//                                 the asserting side stamps the digest, and which gate the
//                                 staleness reddens, are not ruled yet.
//   qa stamps <qa.yaml> <path>... [--exclude <path>]... [--restamp QA-###]
//                                 #944: check the INLINE CITATION STAMP over an asserting
//                                 surface. Every citation carries the digest it was written
//                                 against -- `QA-026@f54a0664`. The paths given ARE the
//                                 surface (the calling recipe names it, as `qa citations` and
//                                 `seqmap` already do). `--restamp` is the one-command fix for
//                                 a reword with no consequence; it REFUSES a superseded ruling,
//                                 whose remedy is re-reading, not re-stamping.
//   qa citations <qa.yaml> <model.json> [...more.json]
//                                 ADR-060 mechanism 2 (#812): print every QA-### cited in
//                                 model prose SIDE BY SIDE with the ledger answer it cites.
//                                 No semantics — the report exists to be READ (Stage-C
//                                 completeness + the blind ADR-015 review brief); it fails
//                                 mechanically only on citations of missing, open or
//                                 withdrawn entries — and, since #1062, on any QA-### the
//                                 file text holds that did not come out as a row, so a
//                                 blind review can rely on the enumeration being total.
//                                 An unanswered entry NAMED AS OPEN ("QA-034 is open and
//                                 blocks this SI") is disclosure, not an authority claim:
//                                 reported, never a finding (#1062).
//
// Zero dependencies; plain Node. The YAML-subset parser is deliberately strict — the
// strictness IS the format validation (same regime as the si-binding parser; kept as a
// self-contained copy so the skill ships standalone).

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

function die(msg) { process.stderr.write('qa: error: ' + msg + '\n'); process.exit(1); }

const STATUSES = new Set(['open', 'answered', 'withdrawn']);
// audience (ADR-062 §2): WHO can settle an open question — the one field the attention
// queue branches on, which is exactly why it is a closed enum and not free text. `owner` =
// business truth only the stakeholder can settle; `architect` = methodology and judgement
// calls that are the Software Architect's. Required while open, optional once terminal.
const AUDIENCES = new Set(['owner', 'architect']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const QA_ID_RE = /^QA-\d{3}$/;

// blocks-token taxonomy (qa-ledger-format.md): business tier gates at Intent;
// everything else is model tier. Lookalike-but-malformed tokens are lint errors.
//
// `SIxx.yy` is BUSINESS tier since ADR-066 (#1181): the id names a System Interaction, which is
// drawn at Mockup and blessed at Intent, and it is the SAME id the model later realizes — there
// is no second, model-stage id to distinguish it from. So an open question blocking an SI blocks
// the business design, and Intent is the gate that must not pass over it. `SQ`/`CC` stay model
// tier: those artifacts are derived at Design. The retired `BPxx-` forms are refused outright.
const BUSINESS_RES = [/^BP\d{2}$/, /^SI\d{2}\.\d{2}$/, /^VW\d{2}[\w-]*$/];
const MODEL_RES = [
  /^SQ\d{2}\.\d{2}\.\d{2}(\.\d{2})?$/,
  /^CC\d{2}\.\d{2}$/,
];
// `DV:<slot>` / `DV:hosting` is the DEPLOYMENT tier (ADR-071 §5, #1247): a question about which
// product stands behind a slot, or where the system runs, blocks the deployment view — never the
// model, which is product- and hosting-free (ADR-048 §1). So it fails at Contract only, and is
// reported, never failing, at Intent and Blueprint. Until this tier existed such a question could
// only be parked at `blocks: []`, which is how Figaro's "deployment target and owner" (OC-07,
// Q-OPS-03) reached no gate at all.
const DEPLOYMENT_RE = /^DV:(?:hosting|[a-z0-9]+(?:-[a-z0-9]+)*)$/;
const RETIRED_RE = /^BP\d{2}-(?:SI|SQ|CC)\d{2}\.\d{2}/;
const LOOKALIKE_RE = /^(BP|SI|SQ|CC|VW)\d/;
const ELEMENT_RE = /^[A-Za-z_][\w.-]*$/;

function classifyBlock(token) {
  if (BUSINESS_RES.some((re) => re.test(token))) return 'business';
  if (MODEL_RES.some((re) => re.test(token))) return 'model';
  if (DEPLOYMENT_RE.test(token)) return 'deployment';
  if (/^DV:/i.test(token)) return 'malformed';
  if (RETIRED_RE.test(token)) return 'retired';
  if (LOOKALIKE_RE.test(token)) return 'malformed';
  if (ELEMENT_RE.test(token)) return 'element';
  return 'malformed';
}

// exercisedBy-token taxonomy (ADR-060 mechanism 4, #840): the drawn artifact that makes an
// answered ruling exercisable — everything the blocks vocabulary names, plus walked path ids
// (BPxx-Pnn, the seqmap's gateway-covering paths) and named spec properties (spec:<Member>)
// for rulings that are not step-shaped.
const PATH_RE = /^BP\d{2}-P\d{2}$/;
const SPEC_RE = /^spec:[A-Za-z_]\w*$/;
const DEFERRED_RE = /^#\d+\b/;

// toolingBy — THE THIRD TRACE KIND (figaro#406; the Software Architect's letter «A» on
// figaro#404, 2026-09-08). Some rulings answer a question by changing the TOOLCHAIN and leaving
// the model alone: nothing drawn exercises them, no process goes out of force, and nothing is
// deferred — the work is done, it is just not done in the model. Before this field such a ruling
// had no trace it could honestly carry, so `--gate` refused an answered entry that was complete,
// and the two remedies on offer were to invent a trace (`enforcedBy` over a process nobody
// excluded) or to carry a red. One conducted project carried that red for two days.
//
// THE VALUE IS A PAIR, NOT A STRING. `toolingBy: { kind: <issue|commit>, ref: <reference> }`.
// This is the design rule that a token a program reads is typed, never prose it must parse — and
// it is also what settles, by construction, the one question the ruling left open: whether the
// trace names the closed ISSUE or the COMMIT. It names EITHER, says which in `kind`, and the
// checker validates the shape of `ref` accordingly. A ledger may write the tracker issue today
// and a commit tomorrow without the format changing or anyone re-ruling.
//
// WHAT "RESOLVES" MEANS HERE, stated plainly because it is weaker than the other two kinds.
// `exercisedBy` resolves against the generated Sequence Map and `enforcedBy` against a process's
// own lifecycle header — both are ground truths this checker can read. The object a toolingBy
// names lives in ANOTHER repository, which no generated ground truth of this project covers and
// which this checker will not reach over the network. So resolution here is SHAPE plus
// REPOSITORY QUALIFICATION: the reference must name one identifiable object in a named
// repository, so that a reader can go to it. A bare `#316` is refused for exactly that reason —
// it names an issue in no stated repository, and the toolchain change is usually in a different
// one from the ledger.
const TOOLING_KEYS = ['kind', 'ref'];
const TOOLING_KINDS = new Set(['issue', 'commit']);
const TOOLING_REF_RES = {
  issue: /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)?#\d+$/,
  commit: /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)?@[0-9a-f]{7,40}$/,
};

function classifyExercise(token) {
  if (PATH_RE.test(token)) return 'path';
  if (SPEC_RE.test(token)) return 'spec';
  return classifyBlock(token);
}

// ===================================================================================
//  PARSE — strict qa-ledger/1 YAML subset (syntax errors die with file:line)
// ===================================================================================
function parseLedger(file) {
  if (!existsSync(file)) die(`ledger not found: ${file}`);
  const toks = [];
  const rawLines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    if (/^\s*$/.test(raw) || /^\s*#/.test(raw)) continue;
    if (/^\s*\t/.test(raw)) die(`${file}:${i + 1}: tabs are not allowed (two-space indentation)`);
    const indent = raw.match(/^ */)[0].length;
    toks.push({ indent, text: raw.trim(), ln: i + 1 });
  }
  let p = 0;
  const peek = () => toks[p];
  const perr = (tok, msg) => die(`${file}:${tok ? tok.ln : '<eof>'}: ${msg}`);

  const stripComment = (s) => {
    const cut = s.search(/\s#/);
    return (cut >= 0 ? s.slice(0, cut) : s).trim();
  };
  const scalar = (tok, s) => {
    s = s.trim();
    if (s.startsWith('"')) {
      const m = s.match(/^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/);
      if (!m) perr(tok, `bad quoted value: ${s}`);
      return m[1].replace(/\\"/g, '"');
    }
    s = stripComment(s);
    if (!s) perr(tok, 'empty value');
    return s;
  };
  const inlineList = (tok, s) => {
    s = stripComment(s);
    const m = s.match(/^\[(.*)\]$/);
    if (!m) perr(tok, `expected an inline [list], got: ${s}`);
    if (!m[1].trim()) return [];
    return m[1].split(',').map((x) => x.trim().replace(/^"(.*)"$/, '$1'));
  };
  // Split on the commas that are NOT inside a quoted value. `[lists]` above can split naively
  // because their members are ids; a { map }'s values are authored text.
  const splitPairs = (s) => {
    const parts = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quoted) {
        if (c === '\\') { cur += c + (s[i + 1] ?? ''); i++; continue; }
        cur += c;
        if (c === '"') quoted = false;
        continue;
      }
      if (c === '"') { quoted = true; cur += c; continue; }
      if (c === ',') { parts.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    parts.push(cur.trim());
    return parts.filter((x) => x !== '');
  };
  // An inline `{ key: value, key: value }` — the shape a TYPED token takes in this format when a
  // bare string would be prose a program has to parse (`toolingBy`, figaro#406). Insertion order
  // is preserved, so the lint can hold the pair to the documented field order the way the
  // line-by-line reader already holds the entry's own fields to theirs.
  const inlineMap = (tok, s) => {
    s = stripComment(s);
    const m = s.match(/^\{(.*)\}$/);
    if (!m) perr(tok, `expected an inline { map }, got: ${s}`);
    const out = {};
    if (!m[1].trim()) return out;
    for (const pair of splitPairs(m[1])) {
      const kv = pair.match(/^([A-Za-z_]\w*)\s*:\s*(.*)$/);
      if (!kv) perr(tok, `expected 'key: value' inside the { map }, got: ${pair}`);
      let val = kv[2].trim();
      if (val.startsWith('"')) {
        const q = val.match(/^"((?:[^"\\]|\\.)*)"$/);
        if (!q) perr(tok, `bad quoted value in the { map }: ${val}`);
        val = q[1].replace(/\\"/g, '"');
      }
      if (!val) perr(tok, `empty value for '${kv[1]}' in the { map }`);
      if (kv[1] in out) perr(tok, `duplicate key '${kv[1]}' in the { map }`);
      out[kv[1]] = val;
    }
    return out;
  };
  const field = (indent, key, { dash = false, optional = false } = {}) => {
    const tok = peek();
    const prefix = dash ? '- ' : '';
    if (!tok || tok.indent !== indent || !tok.text.startsWith(`${prefix}${key}:`)) {
      if (optional) return null;
      perr(tok, `expected '${prefix}${key}:' at indent ${indent}${tok ? `, got: ${tok.text}` : ''}`);
    }
    p++;
    return { tok, value: tok.text.slice(prefix.length + key.length + 1) };
  };

  const f = field(0, 'format');
  const format = scalar(f.tok, f.value);
  if (format !== 'qa-ledger/1') die(`${file}:${f.tok.ln}: format is '${format}', expected 'qa-ledger/1'`);
  const e = field(0, 'entries');
  if (stripComment(e.value) !== '') perr(e.tok, "'entries:' opens a block list — no inline value");

  const entries = [];
  while (peek() && peek().indent === 2 && peek().text.startsWith('- ')) {
    const idF = field(2, 'id', { dash: true });
    const entry = { id: scalar(idF.tok, idF.value), ln: idF.tok.ln };
    const read = (key, kind = 'scalar', optional = false) => {
      const r = field(4, key, { optional });
      if (!r) return undefined;
      if (kind === 'list') return inlineList(r.tok, r.value);
      if (kind === 'map') return inlineMap(r.tok, r.value);
      return scalar(r.tok, r.value);
    };
    entry.status = read('status');
    entry.question = read('question');
    entry.blocks = read('blocks', 'list');
    entry.audience = read('audience', 'scalar', true);
    entry.asked = read('asked');
    entry.source = read('source');
    entry.answer = read('answer', 'scalar', true);
    entry.answered = read('answered', 'scalar', true);
    entry.answeredBy = read('answeredBy', 'scalar', true);
    // #1049: the authored Lesart of the answer, and the day it was last written. NOT the
    // computed revision digest of `qa digest` — that one is 8 hex characters over the answer
    // text and is never stored. This one is prose a human wrote for a reader.
    entry.digest = read('digest', 'scalar', true);
    entry.digested = read('digested', 'scalar', true);
    entry.supersedes = read('supersedes', 'list', true);
    entry.exercisedBy = read('exercisedBy', 'list', true);
    // #1241: the surface that ENFORCES a ruling which removes something. A ruling nothing
    // drawn can exercise is not automatically untraceable — it may be traceable to a
    // process that declares itself out of force.
    entry.enforcedBy = read('enforcedBy', 'list', true);
    // figaro#406: the third trace kind — the toolchain change that carries a ruling whose whole
    // content is that the toolchain changed and the model did not. A { kind, ref } pair, never a
    // bare string; see TOOLING_KEYS above for why, and for what "resolves" means for it.
    entry.toolingBy = read('toolingBy', 'map', true);
    entry.deferred = read('deferred', 'scalar', true);
    entry.withdrawn = read('withdrawn', 'scalar', true);
    entry.reason = read('reason', 'scalar', true);
    entry.recording = read('recording', 'scalar', true);
    entries.push(entry);
  }
  if (peek()) perr(peek(), `unexpected content after entries: ${peek().text}`);
  return { entries, file };
}

// ===================================================================================
//  LINT + GATE VERDICT
// ===================================================================================
// Load the generated Sequence Map (seqmap/1) as the resolution ground truth for
// exercisedBy tokens: bound SI ids, BP ids, walked path ids. Plain JSON — the map is
// generated, never hand-written, so no strict parser is needed here.
function loadMap(file) {
  if (!existsSync(file)) die(`sequence map not found: ${file}`);
  let map;
  try { map = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { die(`${file}: not valid JSON (${e.message})`); }
  const ops = Object.entries(map.operations ?? {});
  // A KEY of `operations` is a CALL SITE (`BPxx.yy`) since ADR-069 (migrated 2026-09-02); the
  // System-Interaction id is the `si` VALUE on the entry. Reading the keys as SI ids made EVERY
  // `SIxx.yy` token on a post-ADR-069 map report "resolves to no operation" — the only token
  // class an architect can use for a step-shaped ruling, so the finding count grew by one per
  // CORRECTLY traced ruling and no reader could tell a genuine bad token from the noise
  // (#1381, #1395). A pre-ADR-069 map keys by `SIxx.yy` and carries no `si` field, so the key
  // is the id there: both shapes feed one set, and a genuinely absent id is still reported.
  const sis = new Set();
  for (const [key, entry] of ops) {
    if (entry && typeof entry.si === 'string') sis.add(entry.si);
    else if (/^SI\d{2}\.\d{2}$/.test(key)) sis.add(key);
  }
  // An interaction only a PARKED process's rows ask for (#1256) is drawn and deliberately not
  // built, and the enriched map records it apart from `operations` for exactly that reason. It
  // is NOT resolvable — nothing live exercises a ruling traced to it — but it is not unknown
  // either, so the finding says which of the two it is instead of calling a drawn id absent.
  const parkedSis = new Map();
  for (const p of map.parkedInteractions ?? [])
    if (p.si) parkedSis.set(p.si, (p.parkedBy ?? []).join(', '));
  const bps = new Set();
  const paths = new Set();
  // #1148 put the lifecycle on the process in the map; #1241 is the first consumer that
  // reads it here — 'live' is the absence of a status, exactly as in the .bpd header.
  const bpStatus = new Map();
  for (const proc of map.processes ?? []) {
    if (proc.bp) { bps.add(proc.bp); bpStatus.set(proc.bp, proc.status?.state ?? 'live'); }
    for (const path of proc.paths ?? []) if (path.id) paths.add(path.id);
  }
  // #1243 stopped putting a non-live source into `processes` at all and recorded it under
  // `nonLive` instead — "a reader that wants to SAY a process is parked reads that array and
  // needs no second parse of the .bpd headers" (seqmap-format.md). This checker is that reader,
  // and not reading it broke the #1241 mechanism from both ends: every `enforcedBy: [BP07]`
  // — the field whose whole subject is a process out of force — reported "resolves to no
  // process", and the reverse direction (a process out of force no ruling claims) ran over an
  // empty status table and could never fire. Being listed here IS the non-live declaration.
  for (const n of map.nonLive ?? [])
    if (n.bp && !bps.has(n.bp)) { bps.add(n.bp); bpStatus.set(n.bp, n.status?.state ?? 'non-live'); }
  // The shape check this was really making: a seqmap/1 file has operations. It used to key on
  // `sis`, which a post-ADR-069 map can leave empty for reasons that have nothing to do with
  // the file's shape.
  if (!ops.length) die(`${file}: no operations — is this a seqmap/1 file?`);
  return { sis, parkedSis, bps, paths, bpStatus, file };
}

function lint(ledger, map) {
  const problems = [];
  const E = (msg) => problems.push(msg);
  const byId = new Map(ledger.entries.map((e) => [e.id, e]));
  const seen = new Set();
  let lastNum = 0;
  for (const en of ledger.entries) {
    const at = `${en.id} (line ${en.ln})`;
    if (!QA_ID_RE.test(en.id)) E(`${at}: id does not match QA-###`);
    else {
      const num = parseInt(en.id.slice(3), 10);
      if (seen.has(en.id)) E(`${at}: duplicate id`);
      if (num <= lastNum) E(`${at}: ids must be strictly ascending in file order (append-only)`);
      lastNum = Math.max(lastNum, num);
      seen.add(en.id);
    }
    if (!STATUSES.has(en.status)) E(`${at}: status '${en.status}' is not open|answered|withdrawn`);
    if (en.audience !== undefined && !AUDIENCES.has(en.audience))
      E(`${at}: audience '${en.audience}' is not owner|architect — a closed enum, because the attention queue branches on it (ADR-062)`);
    if (!DATE_RE.test(en.asked)) E(`${at}: asked '${en.asked}' is not YYYY-MM-DD`);
    for (const b of en.blocks) {
      const bk = classifyBlock(b);
      if (bk === 'retired') E(`${at}: blocks token '${b}' is a retired PROVISIONAL id — a System ` +
        `Interaction's id is minted once at Mockup and never rewritten (ADR-066, #1181); write its minted SIxx.yy id`);
      else if (bk === 'malformed') E(`${at}: blocks token '${b}' is a malformed id (qa-ledger-format.md vocabulary)`);
    }
    if (en.status === 'answered') {
      if (en.answer === undefined) E(`${at}: answered entry needs an 'answer'`);
      if (en.answered === undefined) E(`${at}: answered entry needs an 'answered' date`);
      else if (!DATE_RE.test(en.answered)) E(`${at}: answered '${en.answered}' is not YYYY-MM-DD`);
      if (en.withdrawn !== undefined || en.reason !== undefined) E(`${at}: answered entry carries withdrawn fields`);
      // The digest (#1049): a pair, and never older than the answer it summarizes.
      // Correctness stays a human concern; staleness is the one thing a checker settles.
      if (en.digest !== undefined && en.digested === undefined)
        E(`${at}: carries a 'digest' with no 'digested' date — the date is what makes staleness checkable (#1049)`);
      if (en.digested !== undefined && en.digest === undefined)
        E(`${at}: carries a 'digested' date with no 'digest' — the date claims a Lesart that is not there (#1049)`);
      if (en.digested !== undefined && !DATE_RE.test(en.digested))
        E(`${at}: digested '${en.digested}' is not YYYY-MM-DD`);
      else if (en.digested !== undefined && en.answered !== undefined && DATE_RE.test(en.answered) && en.digested < en.answered)
        E(`${at}: digested ${en.digested} is older than answered ${en.answered} — the answer was amended and the digest stood still. Rewrite the digest in the same edit as the answer (#1049)`);
      for (const t of en.exercisedBy ?? []) {
        const kind = classifyExercise(t);
        if (kind === 'retired') { E(`${at}: exercisedBy token '${t}' is a retired PROVISIONAL id — ` +
          `an SI's id is minted once at Mockup and never rewritten (ADR-066, #1181)`); continue; }
        if (kind === 'malformed') { E(`${at}: exercisedBy token '${t}' is a malformed id (qa-ledger-format.md vocabulary)`); continue; }
        if (!map) continue;
        if (/^SI\d{2}\.\d{2}$/.test(t) && !map.sis.has(t)) {
          // Still a finding either way — the ruling is not exercisable — but the map knows the
          // difference between an id nothing draws and one only a parked drawing asks for, so
          // the message says which (#1256).
          const parkedBy = map.parkedSis.get(t);
          if (parkedBy !== undefined)
            E(`${at}: exercisedBy '${t}' is drawn only by a PARKED process (${parkedBy || 'see parkedInteractions'}) ` +
              `in ${map.file} — nothing live exercises the ruling. Trace it to a live drawing, or declare the ` +
              `scope (deferred:/enforcedBy:)`);
          else E(`${at}: exercisedBy '${t}' resolves to no operation in ${map.file}`);
        }
        else if (/^BP\d{2}$/.test(t) && !map.bps.has(t)) E(`${at}: exercisedBy '${t}' resolves to no process in ${map.file}`);
        else if (kind === 'path' && !map.paths.has(t)) E(`${at}: exercisedBy '${t}' resolves to no walked path in ${map.file}`);
      }
      // enforcedBy (#1241): BP ids only — a whole process is the smallest thing that can
      // carry a lifecycle header, so it is the smallest thing an exclusion can point at.
      for (const t of en.enforcedBy ?? []) {
        if (!/^BP\d{2}$/.test(t)) {
          E(`${at}: enforcedBy token '${t}' is not a BP## id — an exclusion names the PROCESS whose ` +
            `.bpd header declares it out of force, and a process is the smallest thing that can carry one (#1241)`);
          continue;
        }
        if (!map) continue;
        if (!map.bps.has(t)) { E(`${at}: enforcedBy '${t}' resolves to no process in ${map.file}`); continue; }
        const st = map.bpStatus.get(t);
        if (st === 'live')
          E(`${at}: enforcedBy '${t}' — the ruling takes ${t} out of scope and ${t}'s own source declares no ` +
            `lifecycle status, so every generator still treats it as live. Stamp the .bpd header ` +
            `('status parked|retired|dissolved', tooling contract §1a) or drop the claim (#1241)`);
      }
      if (en.enforcedBy?.length && en.exercisedBy?.length)
        E(`${at}: enforcedBy and exercisedBy are mutually exclusive — a ruling is either exercised by something drawn and live, or enforced by something declared out of force (#1241)`);
      // toolingBy (figaro#406): held to the strictness of the two kinds beside it. The pair is
      // exactly { kind, ref }, in that order; `kind` is a closed enum because the checker BRANCHES
      // on it to know what shape `ref` must have, and anything a program branches on is typed in
      // this format, never prose. The reference must be repository-qualified — see TOOLING_KEYS.
      if (en.toolingBy !== undefined) {
        const keys = Object.keys(en.toolingBy);
        const missing = TOOLING_KEYS.filter((k) => !keys.includes(k));
        const extra = keys.filter((k) => !TOOLING_KEYS.includes(k));
        if (missing.length)
          E(`${at}: toolingBy is missing ${missing.map((k) => `'${k}'`).join(' and ')} — the trace is a ` +
            `{ kind: issue|commit, ref: <repo>#<n> | <repo>@<sha> } pair, not a bare string a program has to parse (figaro#406)`);
        if (extra.length)
          E(`${at}: toolingBy carries unknown key(s) ${extra.map((k) => `'${k}'`).join(', ')} — the pair is exactly { kind, ref } (figaro#406)`);
        if (!missing.length && !extra.length && keys.join(',') !== TOOLING_KEYS.join(','))
          E(`${at}: toolingBy keys are out of order [${keys.join(', ')}] — this format states its fields in one documented order so a reader meets them the same way every time (figaro#406)`);
        const { kind, ref } = en.toolingBy;
        if (kind !== undefined && !TOOLING_KINDS.has(kind))
          E(`${at}: toolingBy.kind '${kind}' is not issue|commit — a closed enum, because the check branches on it ` +
            `to know what shape the reference must have (figaro#406)`);
        if (ref !== undefined && TOOLING_KINDS.has(kind) && !TOOLING_REF_RES[kind].test(ref))
          E(kind === 'issue'
            ? `${at}: toolingBy.ref '${ref}' is not a repository-qualified issue reference — write '<repo>#<number>' ` +
              `(e.g. 'figaro#316'). A bare '#316' names an issue in no stated repository, and the toolchain change is ` +
              `usually in a different repository from this ledger (figaro#406)`
            : `${at}: toolingBy.ref '${ref}' is not a repository-qualified commit reference — write '<repo>@<sha>' ` +
              `with 7 to 40 lowercase hex characters (e.g. 'theagent-unchained@3238c7f') (figaro#406)`);
      }
      // …and it stands ALONE. A ruling carried by a toolchain change is not also exercised by a
      // drawn step (then the model DID change), not also enforcing an exclusion (then a process
      // went out of force), and not also deferred (then the change has not landed and the honest
      // trace is the deferral). Three pairwise rules, added beside the two above and changing
      // neither: this format says what each trace kind means by saying what it excludes.
      if (en.toolingBy !== undefined && en.exercisedBy?.length)
        E(`${at}: toolingBy and exercisedBy are mutually exclusive — a ruling whose whole content is that the ` +
          `toolchain changed and the model did not cannot also be exercised by something drawn (figaro#406)`);
      if (en.toolingBy !== undefined && en.enforcedBy?.length)
        E(`${at}: toolingBy and enforcedBy are mutually exclusive — a ruling either changed the toolchain or took a ` +
          `process out of force; those are two different answers (figaro#406)`);
      if (en.toolingBy !== undefined && en.deferred !== undefined)
        E(`${at}: toolingBy and deferred are mutually exclusive — toolingBy asserts the change EXISTS and names it; ` +
          `a change that has not landed is a deferral, and 'deferred' is the field for it (figaro#406)`);
      if (en.deferred !== undefined && !DEFERRED_RE.test(en.deferred))
        E(`${at}: deferred must start with the tracking issue ref '#NN' — the declaration is only real if an issue carries it`);
      if (en.deferred !== undefined && en.exercisedBy?.length)
        E(`${at}: deferred and exercisedBy are mutually exclusive — a ruling is either exercisable or deliberately deferred`);
      // Supersession (#944): this answer REPLACES an earlier one. Replacement runs one
      // way through an append-only file, and only over a ruling that was actually given.
      for (const t of en.supersedes ?? []) {
        if (!QA_ID_RE.test(t)) { E(`${at}: supersedes token '${t}' is not a QA-### id`); continue; }
        if (t === en.id) { E(`${at}: supersedes itself`); continue; }
        const target = byId.get(t);
        if (!target) { E(`${at}: supersedes '${t}' is not in the ledger`); continue; }
        if (target.ln > en.ln) {
          E(`${at}: supersedes '${t}', which is not earlier in file order — an answer can only replace a ruling that already stood`);
        } else if (target.status !== 'answered') {
          E(`${at}: supersedes '${t}', which is ${target.status} — ` +
            (target.status === 'open'
              ? 'nothing was answered there to replace'
              : 'withdrawing retires a question, it does not make its answer replaceable'));
        }
      }
    } else if (en.status === 'withdrawn') {
      if (en.withdrawn === undefined) E(`${at}: withdrawn entry needs a 'withdrawn' date`);
      else if (!DATE_RE.test(en.withdrawn)) E(`${at}: withdrawn '${en.withdrawn}' is not YYYY-MM-DD`);
      if (en.answer !== undefined || en.answered !== undefined) E(`${at}: withdrawn entry carries answer fields`);
      if (en.exercisedBy !== undefined || en.enforcedBy !== undefined || en.toolingBy !== undefined || en.deferred !== undefined || en.supersedes !== undefined) E(`${at}: withdrawn entry carries trace fields`);
      if (en.digest !== undefined || en.digested !== undefined) E(`${at}: withdrawn entry carries digest fields — there is no answer to summarize`);
    } else if (en.status === 'open') {
      for (const k of ['answer', 'answered', 'answeredBy', 'digest', 'digested', 'supersedes', 'exercisedBy', 'enforcedBy', 'toolingBy', 'deferred', 'withdrawn', 'reason'])
        if (en[k] !== undefined) E(`${at}: open entry carries terminal field '${k}'`);
      // ADR-062 §2: an open entry the queue cannot route to a named human is an entry
      // nobody is holding — the failure that made the Figaro question list a hand-assembled
      // markdown file. Terminal entries are history the queue never reads, so they are exempt.
      if (en.audience === undefined)
        E(`${at}: open entry needs an 'audience' (owner|architect) — who can settle it, after 'blocks' and before 'asked' (ADR-062)`);
    }
  }
  return problems;
}

function gateVerdict(ledger, gate, map) {
  const problems = [];
  const deploymentOnly = [];
  for (const en of ledger.entries) {
    if (en.status !== 'open' || !en.blocks.length) continue;
    const tiers = en.blocks.map(classifyBlock);
    // Deployment-tier blocks (ADR-071 §5): fail at Contract only. An entry whose blocks are ALL
    // deployment-tier is reported at Intent and Blueprint and holds neither; a mixed entry keeps
    // the rule its other blocks earn.
    const nonDeployment = tiers.filter((t) => t !== 'deployment');
    if (!nonDeployment.length) {
      if (gate === 'contract') problems.push(`GATE ${gate}: ${en.id} is open and blocks the deployment view [${en.blocks.join(', ')}] — "${en.question}" (ADR-071 §5: a deployment decision is ruled before Contract)`);
      else deploymentOnly.push(en);
      continue;
    }
    if (gate === 'contract' || gate === 'blueprint' || nonDeployment.some((t) => t === 'business'))
      problems.push(`GATE ${gate}: ${en.id} is open and blocks [${en.blocks.join(', ')}] — "${en.question}"`);
  }
  for (const en of deploymentOnly)
    process.stdout.write(`qa check: GATE ${gate}: ${en.id} is open on the deployment tier [${en.blocks.join(', ')}] — reported, not failing here; it fails at Contract (ADR-071 §5)\n`);
  // ADR-060 mechanism 4 (#840): every answered ruling must trace to a drawn, exercisable
  // artifact or carry an explicit deferred-scope declaration. Hard red — not a warning,
  // not owner-waivable at the gate. Within a stage (no --gate) it is a to-do, not a defect.
  for (const en of ledger.entries) {
    if (en.status !== 'answered') continue;
    if (en.exercisedBy?.length || en.enforcedBy?.length || en.toolingBy !== undefined || en.deferred !== undefined) continue;
    problems.push(`GATE ${gate}: ${en.id} is answered but traces to no drawn step, path or spec property (exercisedBy), ` +
      `no process taken out of force (enforcedBy), no toolchain change (toolingBy) and declares no deferred scope — ` +
      `"${en.question}" (ADR-060)`);
  }
  // #1241 (SA ruling 2026-09-05): a scope decision that REMOVES something must name the
  // machine-readable surface that enforces it, and the two must agree in BOTH directions.
  // A checker cannot read the `answer` prose, so the LINK is authored — what the checker owns
  // is that an authored link is honoured, and that no process is quietly out of force with no
  // ruling behind it. The lint half (an enforcedBy naming a process that still reads live)
  // runs at any time; this is the reverse direction, and it needs the map.
  if (map) {
    const claimed = new Map();
    for (const en of ledger.entries)
      if (en.status === 'answered') for (const t of en.enforcedBy ?? []) claimed.set(t, en.id);
    for (const [bp, state] of map.bpStatus)
      if (state !== 'live' && !claimed.has(bp))
        problems.push(`GATE ${gate}: ${bp} declares 'status ${state}' and no answered ruling in the ledger ` +
          `claims it (enforcedBy) — a process is out of force and the decision that put it there is not on ` +
          `record. Add the ruling, or drop the status (#1241)`);
  }
  // #1049, same shape: the review surface renders the DIGEST and puts the verbatim answer one
  // expander away, so a ruling with no digest is one the reviewer meets as a wall of text or
  // not at all. To-do within a stage (reported below), hard red at the gate.
  for (const en of ledger.entries) {
    if (en.status !== 'answered' || en.digest !== undefined) continue;
    problems.push(`GATE ${gate}: ${en.id} is answered but carries no 'digest' — the review surface has nothing to render in place of the verbatim answer — "${en.question}" (#1049)`);
  }
  return problems;
}

/** How many answered rulings still owe a digest — a to-do count within a stage (#1049). */
function digestlessCount(ledger) {
  return ledger.entries.filter((en) => en.status === 'answered' && en.digest === undefined).length;
}

// Deferred-scope declarations never go quiet: every gate run reports them, so the gate
// record can carry each one forward until its step is drawn (ADR-060; the gate-record
// carried-items check is the other half of this mechanic).
// Exclusions never go quiet either (#1241): a gate run lists every ruling that removes something
// and the process that carries the removal, so the gate record can see the scope of what is NOT
// being built in one place instead of re-deriving it from prose.
function enforcedReport(ledger) {
  return ledger.entries
    .filter((en) => en.status === 'answered' && en.enforcedBy?.length)
    .map((en) => `enforced: ${en.id} → ${en.enforcedBy.join(', ')} out of scope — "${en.question}"`);
}

// A toolchain trace never goes quiet either (figaro#406). The ruling it carries is precisely the
// one a reader of the model cannot see the consequence of — the model did not change — so a gate
// run prints the change it names and the gate record can carry it. This is also the row a machine
// can read that a closed issue's prose could not be.
function toolingReport(ledger) {
  return ledger.entries
    .filter((en) => en.status === 'answered' && en.toolingBy !== undefined)
    .map((en) => `tooling: ${en.id} → ${en.toolingBy.kind} ${en.toolingBy.ref} — the toolchain changed, the model did not — "${en.question}"`);
}

function deferredReport(ledger) {
  return ledger.entries
    .filter((en) => en.status === 'answered' && en.deferred !== undefined)
    .map((en) => `deferred: ${en.id} → ${en.deferred} — "${en.question}"`);
}


// ===================================================================================
//  THE ANSWER REVISION DIGEST — #944 (SA ruling 2026-08-23)
// ===================================================================================
// A ruling goes stale two ways and BOTH are triggers:
//
//   1. its wording is edited in place  -> the digest below moves;
//   2. a later entry declares that it SUPERSEDES it -> the ruling is replaced outright.
//
// (2) is the load-bearing half. In this ledger's whole operating history no `answer`
// has ever been amended in place: the only six answer lines ever removed came from one
// commit that discarded the Run-1 store and seeded a fresh ledger. Every real change of
// mind was a NEW ENTRY, which the append-only rule actively encourages -- QA-025 ->
// QA-026 -> QA-028 on rate attachment, QA-027 narrowed by QA-029 on rounding. Run 4's
// Gate-3 bounce was QA-028 replacing QA-026, so a mechanism watching only for edited
// wording would have caught NONE of the cases #944 was filed for.
//
// The digest itself is the device `verdict-check` applies to ADR-038 section 5, for the
// reason section 5b records: that check first compared criterion NAMES only, criterion 2
// was reworded substantively while keeping its name, and every surface stayed green
// having answered the old question. A ledger amendment that keeps the entry id has
// exactly the same shape.
//
// Computed, never authored, never stored in the ledger.

// Dashes are typed several ways in this tree, and whitespace is reflowed by editors;
// normalise both so a cosmetic reformat does not redden every artifact that cites the
// ruling. Case is significant -- the owner's emphasis is part of what he ruled.
const normAnswer = (s) => s.replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ').trim();

function answerDigest(entry) {
  return createHash('sha256').update(normAnswer(entry.answer ?? '')).digest('hex').slice(0, 8);
}

/** id -> the LATEST entry declaring that it supersedes it (chains are legal). */
function supersessionIndex(ledger) {
  const by = new Map();
  for (const en of ledger.entries) {
    if (en.status !== 'answered') continue;
    for (const t of en.supersedes ?? []) by.set(t, en.id);
  }
  return by;
}

function digestReport(file) {
  const ledger = parseLedger(file);
  const problems = lint(ledger, null);
  if (problems.length) {
    for (const msg of problems) process.stderr.write('qa digest: ' + msg + '\n');
    die(`${problems.length} finding(s) in ${file} — fix the ledger before trusting a digest`);
  }
  const superseded = supersessionIndex(ledger);
  const answered = ledger.entries.filter((e) => e.status === 'answered');
  for (const en of answered) {
    const by = superseded.get(en.id);
    process.stdout.write(
      `${en.id}  ${answerDigest(en)}` +
      (by ? `  SUPERSEDED by ${by}` : '') +
      `  ${String(en.question).replace(/\s+/g, ' ').trim().slice(0, 72)}\n`);
  }
  const n = answered.filter((e) => superseded.has(e.id)).length;
  process.stdout.write(
    `qa digest: ${answered.length} answered ruling(s), ${n} superseded (#944). ` +
    `An artifact asserting a ruling is stale when the digest it was written against has ` +
    `moved, or when the ruling has been superseded.\n`);
}


// ===================================================================================
//  STAMPS — the inline citation stamp (#944, ADR-060 amendment 2026-08-23)
// ===================================================================================
// Every citation of a ruling in the asserting surface carries the digest it was written
// against, beside the id the text already cites:
//
//     QA-026@f54a0664
//
// A citation is stale two ways, and re-stamping is the remedy for only ONE of them:
//
//   - the digest no longer matches  -> the answer was REWORDED. Re-read the citing text;
//     if nothing about it changes, `--restamp QA-###` fixes every site in one command.
//   - the ruling has been SUPERSEDED -> it was replaced outright. Re-stamping is WRONG: the
//     citing text must be re-read against the NEW ruling and cite that one instead.
//
// The Software Architect ruled this over the cheaper design (no stamp; derive the work list
// and acknowledge at the gate) knowing the cost -- 975 citations across 129 hand-authored
// files at the time -- because the cheaper design catches staleness only when a person reads
// a gate surface, and the owner's Gate-4 finding was that both times a number looked better
// than it was, a PERSON found it by READING rather than a MACHINE by CHECKING.

// Generated files are not stamped: they regenerate from their source, and the model's prose
// is covered by `qa citations`. Two ways to be generated -- the provenance header (the same
// signal diamond-metrics.sh buckets on: decided by the FILE, never by its path) and the
// projection formats that are compiled from a hand-written source (.bpd -> .bpmn -> .svg).
const GENERATED_EXT = new Set(['.bpmn', '.svg', '.html', '.pdf', '.png', '.jpg', '.jpeg',
  '.gif', '.ico', '.zip', '.woff', '.woff2', '.ttf', '.dll', '.exe', '.lastrun']);
const SKIP_DIRS = new Set(['node_modules', 'bin', 'obj', 'dist', '.git']);

function surfaceFiles(paths, excluded = []) {
  const out = [];
  const skipped = [];
  const isExcluded = (p) => excluded.some((x) => p === x || p.startsWith(x.replace(/\/*$/, '') + '/'));
  const walk = (p) => {
    if (isExcluded(p)) { skipped.push(p); return; }
    let st;
    try { st = statSync(p); } catch { die(`surface path not found: ${p}`); }
    if (st.isDirectory()) {
      for (const name of readdirSync(p).sort()) {
        if (SKIP_DIRS.has(name)) continue;
        walk(join(p, name));
      }
      return;
    }
    if (GENERATED_EXT.has(extname(p).toLowerCase())) return;
    let text;
    try { text = readFileSync(p, 'utf8'); } catch { return; }
    if (text.includes('\u0000')) return;                                  // binary
    if (text.split('\n', 5).join('\n').includes('auto-generated')) return; // generated
    out.push({ path: p, text });
  };
  for (const p of paths) walk(p);
  return { files: out, skipped };
}

// ONLY A COMMENT CARRIES A STAMP -- outside Markdown, which is prose end to end.
//
// Measured, not assumed. The first backfill of this mechanism stamped 763 sites and among them:
//
//   - three C# spec-case LABEL strings, which the suite-strength evidence under
//     `csharp/Spec/evidence/` quotes back VERBATIM. Moving a label silently unhooks a recorded
//     measurement from the case it measured.
//   - HTML copy inside the Gate-2 behavioural build's `ui.js`, e.g. the heading "Failed at the
//     door - recovery calls (QA-016)". That string is rendered ON SCREEN in the app walked with
//     the restaurant owner; a fingerprint in it is machine bookkeeping in a stakeholder
//     artifact, which is the credibility bar ADR-042/044 exist to hold.
//   - `then "..."` outcome text in the .vw screen models, which the behavioural build's explain
//     overlay surfaces, and `provenance:` values in world.yaml / business-rules.yaml.
//
// Every one of those is DATA or USER-VISIBLE COPY that happens to mention a ruling. A comment is
// the one place in a non-prose file where text is unambiguously about the artifact rather than
// part of it. Citations outside a comment are not silently dropped -- they are counted and
// reported on every run (#939: a check that quietly narrows its own scope reads as one that
// covered everything).
const PROSE_EXT = new Set(['.md']);

function isCitation(line, at, ext) {
  if (PROSE_EXT.has(ext)) return true;
  const t = line.trimStart();
  if (t.startsWith('//') || t.startsWith('#') || t.startsWith('*') || t.startsWith('/*')) return true;
  const before = line.slice(0, at);
  return before.includes('//') || before.includes('#');
}

const CITE_RE = () => /QA-\d{3}(?:@([0-9a-f]{8}))?/g;

function stamps(ledgerFile, paths, restamp, excluded) {
  const ledger = parseLedger(ledgerFile);
  const problems = lint(ledger, null);
  if (problems.length) {
    for (const msg of problems) process.stderr.write('qa stamps: ' + msg + '\n');
    die(`${problems.length} finding(s) in ${ledgerFile} — fix the ledger before checking stamps`);
  }
  const byId = new Map(ledger.entries.map((e) => [e.id, e]));
  const superseded = supersessionIndex(ledger);
  const { files, skipped } = surfaceFiles(paths, excluded);
  // #939's rule, applied to this tool: a check that quietly narrows its own scope reads as
  // one that covered everything. Every exclusion is named on every run.
  for (const p of skipped) process.stdout.write(`qa stamps: EXCLUDED from the surface: ${p}\n`);

  if (restamp) {
    const en = byId.get(restamp);
    if (!en) die(`--restamp ${restamp}: not in the ledger`);
    if (en.status !== 'answered') die(`--restamp ${restamp}: is ${en.status}, not an answered ruling`);
    const by = superseded.get(restamp);
    if (by) {
      die(`--restamp ${restamp}: ${by} SUPERSEDES it — re-stamping would assert that the citing ` +
        `text was written against a ruling that no longer holds. The remedy is to re-read each ` +
        `citation against ${by} and cite that one (#944)`);
    }
    const want = `${restamp}@${answerDigest(en)}`;
    const re = new RegExp(`${restamp}(?:@[0-9a-f]{8})?`, 'g');
    let sites = 0, touched = 0;
    for (const f of files) {
      const ext = extname(f.path).toLowerCase();
      const lines = f.text.split(/\r?\n/);
      let changed = false;
      for (let i = 0; i < lines.length; i++) {
        // Same predicate the check uses, so --restamp can never write a stamp the check would
        // not have asked for -- a label string or user-visible copy in a code file.
        // `re` has a NON-capturing group, so the callback is (match, offset, whole) -- there is
        // no p1 to skip. Getting this wrong silently passed the wrong value as the offset and
        // only the trailing-comment case could see it.
        const next = lines[i].replace(re, (m, at) => {
          if (!isCitation(lines[i], at, ext)) return m;
          if (m !== want) sites++;
          return want;
        });
        if (next !== lines[i]) { lines[i] = next; changed = true; }
      }
      if (changed) { writeFileSync(f.path, lines.join('\n')); touched++; }
    }
    process.stdout.write(`qa stamps: re-stamped ${restamp} at ${sites} site(s) in ${touched} file(s) ` +
      `to ${answerDigest(en)} — a reword with no consequence; a SUPERSESSION is never fixed this way\n`);
    return;
  }

  const findings = [];
  const pointers = [];
  const skippedCites = [];
  for (const f of files) {
    const ext = extname(f.path).toLowerCase();
    const lines = f.text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i].matchAll(CITE_RE())) {
        if (!isCitation(lines[i], m.index, ext)) {
          skippedCites.push(`${f.path}:${i + 1}: ${m[0].slice(0, 6)} is data or user-visible copy, not a comment — not stamped`);
          continue;
        }
        const id = m[0].slice(0, 6);
        const stamp = m[1];
        const at = `${f.path}:${i + 1}: ${id}`;
        const en = byId.get(id);
        if (!en) { findings.push(`${at} is not in the ledger`); continue; }
        // An OPEN or WITHDRAWN entry has no answer, so there is nothing to stamp and nothing
        // that can go stale. Citing one is a POINTER, not an authority claim -- the four real
        // instances in this tree read "QA-017 parked only", "ledger QA-017 asks", "parked as
        // QA-030 (open ...)". Reported, never a finding: the same treatment the ledger already
        // gives parked threads. It is self-healing -- the day the entry is answered, the very
        // same citation becomes a bare citation of an answered ruling and the check flags it as
        // unstamped. (`qa citations` reads model prose, where a cited id is an authority claim
        // by default -- but it makes the same exception since #1062, for text that says in so
        // many words that the entry it names is still open.)
        if (en.status !== 'answered') {
          pointers.push(`${at} is ${en.status} — cited as a pointer, nothing to stamp`);
          continue;
        }
        const by = superseded.get(id);
        if (by) {
          findings.push(`${at} has been SUPERSEDED by ${by} — re-read this text against ${by} and ` +
            `cite that one; re-stamping is not the remedy`);
          continue;
        }
        const want = answerDigest(en);
        if (!stamp) { findings.push(`${at} is not stamped — cite it as ${id}@${want}`); continue; }
        if (stamp !== want) {
          findings.push(`${at}@${stamp} no longer matches the ledger (${want}) — the answer was ` +
            `reworded. Re-read this text; if nothing about it changes, ` +
            `\`qa stamps <ledger> <paths> --restamp ${id}\`` + ` re-stamps every site at once`);
        }
      }
    }
  }
  for (const p of pointers) process.stdout.write('qa stamps: ' + p + '\n');
  for (const p of skippedCites) process.stdout.write('qa stamps: ' + p + '\n');
  if (findings.length) {
    for (const f of findings) process.stderr.write('qa stamps: ' + f + '\n');
    die(`${findings.length} finding(s) over ${files.length} file(s) in the asserting surface`);
  }
  process.stdout.write(`qa stamps: ${files.length} file(s) in the asserting surface, every citation ` +
    `stamped against the ruling as it now reads` +
    (pointers.length ? `; ${pointers.length} pointer(s) at unanswered entries` : '') +
    (skippedCites.length ? `; ${skippedCites.length} citation(s) in data or user-visible copy, not stamped` : '') +
    (pointers.length || skippedCites.length ? ', each named above' : '') +
    ` (#944)\n`);
}

// ===================================================================================
//  CITATIONS — ADR-060 mechanism 2 (#812)
// ===================================================================================
// The run-4 Gate-3 bounce: four model artifacts cited QA-026 by id while asserting its
// opposite, through a full Stage-C pass, a blind review and a promotion — the two texts
// were never collided. This report is the collision: every citing string beside the
// answer it cites. Judging agreement stays with the reader (drafting completeness and
// the blind-review brief name that obligation); only impossible citations fail here.
const QA_CITE_RE = /QA-\d{3}/g;

// TOTALITY -- #1062. A blind reviewer is told to collide EVERY citation with its ledger
// answer, and this report is how they enumerate them; figaro's Review 5 got 50 rows out of
// 59 occurrences in the model, silently, and one whole use case's citations (all three of
// its QA-019 mentions) never reached the reader. A report whose scope can narrow without
// saying so reads as one that covered everything (#939's rule, already applied to `qa
// stamps`). So the walk is checked against the raw file text: every `QA-###` the bytes
// contain must come out as a row, and any that does not is named and reddens the run.
function rawCounts(text) {
  const m = new Map();
  for (const [id] of text.matchAll(/QA-\d{3}/g)) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

function collectCitations(node, path, out) {
  if (typeof node === 'string') {
    for (const m of node.match(QA_CITE_RE) ?? []) out.push({ id: m, path, text: node });
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => {
      const tag = (v && typeof v === 'object' && !Array.isArray(v) && (v.id ?? v.name)) || i;
      collectCitations(v, `${path}[${tag}]`, out);
    });
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      const at = path ? `${path}.${k}` : k;
      // A property NAME can carry a citation too (a map keyed by ruling id). Walking values
      // only left those in the bytes and out of the rows -- invisible under-reporting.
      for (const m of k.match(QA_CITE_RE) ?? []) out.push({ id: m, path: at, text: k });
      collectCitations(v, at, out);
    }
  }
}

// DISCLOSURE IS NOT ASSERTION -- #1062. The rule this tool was born with ("model prose
// citing an id IS an authority claim by construction") has a counter-example figaro found:
// text reading "QA-034 is open and blocks this SI" cites the entry AS AN OPEN CAVEAT, which
// is exactly the practice the ledger asks for, and the report called it a violation. Raising
// on correct disclosure trains reviewers to skim the warnings -- the last thing you want in a
// gate check. So an unanswered entry named together with a word that says it is unanswered is
// reported and never a finding, the same treatment `qa stamps` gives its pointers; a bare
// citation of an unanswered entry ("blocked by QA-002", "see QA-777") stays a finding.
// The word has to be ATTACHED to the id, as its predicate ("QA-034 is open", "QA-017 parked
// only", "parked as QA-030 (open ...)") or as its modifier ("the still-open question QA-034").
// A loose "somewhere nearby" window would read "Fetch open tasks per QA-034" as disclosure and
// wave through a real authority claim -- the leniency has to be narrower than the defect.
const STATUS_WORD = { open: 'open|unanswered|unresolved|pending|parked', withdrawn: 'withdrawn' };
const LEAD_IN = '(?:(?:is|are|was|remains|stays|still|currently|which|that|only)\\b[\\s,:—–-]*){0,3}';
const CARRIER = '(?:(?:the|a|an|still|ledger|entry|question|ruling|item|thread|caveat|as|in|on|of|by)\\b[\\s,:—–-]*){0,3}';

function disclosesStatus(text, id, status) {
  const word = STATUS_WORD[status];
  if (!word) return false;
  const after = new RegExp(`^[\\s,:(\\[—–-]*${LEAD_IN}(?:${word})\\b`, 'i');
  const before = new RegExp(`\\b(?:${word})\\b[\\s,:—–-]*${CARRIER}$`, 'i');
  for (let at = text.indexOf(id); at !== -1; at = text.indexOf(id, at + 1)) {
    if (after.test(text.slice(at + id.length)) || before.test(text.slice(0, at))) return true;
  }
  return false;
}

function citations(ledgerFile, modelFiles) {
  const ledger = parseLedger(ledgerFile);
  const byId = new Map(ledger.entries.map((e) => [e.id, e]));
  // #944: the model store is mutated through sns-cli against an op-log, so it is NOT
  // hand-editable and cannot carry the inline citation stamp. This report is what covers it
  // instead, so the supersession rule has to live here too -- otherwise a superseded ruling
  // cited in model prose is the one place the mechanism cannot see.
  const superseded = supersessionIndex(ledger);
  let bad = 0;
  let total = 0;
  const disclosures = [];
  const unreached = [];
  for (const mf of modelFiles) {
    if (!existsSync(mf)) die(`model file not found: ${mf}`);
    const text = readFileSync(mf, 'utf8');
    let doc;
    try { doc = JSON.parse(text); } catch (e) { die(`${mf}: not valid JSON (${e.message})`); }
    const found = [];
    collectCitations(doc, '', found);
    for (const c of found) {
      total++;
      const en = byId.get(c.id);
      const by = superseded.get(c.id);
      const disclosed = en !== undefined && en.status !== 'answered' && disclosesStatus(c.text, c.id, en.status);
      const answer = en === undefined
        ? '!! NOT IN THE LEDGER'
        : en.status !== 'answered'
          ? disclosed
            ? `-- ${en.status.toUpperCase()} — named as an open caveat, not cited as authority: ${en.question}`
            : `!! ${en.status.toUpperCase()} — cited as authority but not an answered ruling`
        : by ? `!! SUPERSEDED BY ${by} — this text asserts a ruling that no longer holds (#944): ${en.answer}`
        : en.answer;
      if (disclosed) disclosures.push(`${c.id} @ ${mf}: ${c.path}`);
      else if (en === undefined || en.status !== 'answered' || by) bad++;
      process.stdout.write(
        `${c.id} @ ${mf}: ${c.path}\n` +
        `  cites:  ${c.text.replace(/\s+/g, ' ').trim()}\n` +
        `  ledger: ${String(answer).replace(/\s+/g, ' ').trim()}\n\n`);
    }
    // The walk against the bytes. Emitted rows per id must match what the file text holds.
    const emitted = new Map();
    for (const c of found) emitted.set(c.id, (emitted.get(c.id) ?? 0) + 1);
    for (const [id, n] of rawCounts(text)) {
      const got = emitted.get(id) ?? 0;
      if (got !== n) unreached.push(`${mf}: ${id} appears ${n}x in the file but ${got} row(s) came out ` +
        `— ${Math.abs(n - got)} occurrence(s) this report could not reach`);
    }
  }
  for (const d of disclosures) process.stdout.write(`qa citations: ${d} — open caveat, disclosed, not a finding (#1062)\n`);
  if (unreached.length) {
    for (const u of unreached) process.stderr.write('qa citations: !! INCOMPLETE: ' + u + '\n');
  }
  process.stdout.write(`qa citations: ${total} citation(s) across ${modelFiles.length} file(s)` +
    (bad ? `, ${bad} impossible (missing/open/withdrawn/superseded)` : '') +
    (disclosures.length ? `, ${disclosures.length} disclosed open caveat(s)` : '') +
    ' — read each pair and state whether the citing text agrees (ADR-060, #812)\n');
  if (unreached.length) {
    die(`${unreached.length} id(s) in the model text this report could not reach — it is NOT the ` +
      `total enumeration a blind review may rely on (#1062)`);
  }
  if (bad) die(`${bad} citation(s) cite no ruling that still holds`);
}

// ===================================================================================
//  CLI
// ===================================================================================
function main() {
  const argv = process.argv.slice(2);
  const cmd = argv.shift();
  let gate = null;
  let mapFile = null;
  let restamp = null;
  const excluded = [];
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--gate') gate = argv[++i];
    else if (argv[i] === '--map') mapFile = argv[++i];
    else if (argv[i] === '--restamp') restamp = argv[++i];
    else if (argv[i] === '--exclude') excluded.push(argv[++i]);
    else rest.push(argv[i]);
  }
  if (restamp !== null && cmd !== 'stamps') die('--restamp belongs to the stamps command');
  if (excluded.length && cmd !== 'stamps') die('--exclude belongs to the stamps command');
  if (!cmd || ['-h', '--help', 'help'].includes(cmd)) {
    process.stdout.write(
      'qa — lint and gate-check the Q&A ledger (.method/qa.yaml; ADR-040 §3, tooling contract §9)\n\n' +
      'Usage:\n' +
      '  qa check <qa.yaml> [--gate intent|blueprint|contract] [--map <seqmap.json>]\n' +
      '  qa digest <qa.yaml>\n' +
      '  qa stamps <qa.yaml> <path>... [--exclude <path>]... [--restamp QA-###]\n' +
      '  qa citations <qa.yaml> <model.json> [...more.json]\n');
    process.exit(cmd ? 0 : 1);
  }
  if (cmd === 'digest') {
    if (gate !== null || mapFile !== null) die('digest takes no --gate/--map');
    const [ledgerFile, ...extra] = rest;
    if (!ledgerFile || extra.length) die('digest needs exactly one <qa.yaml>');
    digestReport(ledgerFile);
    return;
  }
  if (cmd === 'stamps') {
    if (gate !== null || mapFile !== null) die('stamps takes no --gate/--map');
    const [ledgerFile, ...surface] = rest;
    if (!ledgerFile || !surface.length) die('stamps needs a <qa.yaml> and at least one surface path');
    stamps(ledgerFile, surface, restamp, excluded);
    return;
  }
  if (cmd === 'citations') {
    const [ledgerFile, ...modelFiles] = rest;
    if (gate !== null || mapFile !== null) die('citations takes no --gate/--map');
    if (!ledgerFile || !modelFiles.length) die('citations needs a <qa.yaml> and at least one <model.json>');
    citations(ledgerFile, modelFiles);
    return;
  }
  if (cmd !== 'check') die(`unknown command '${cmd}'`);
  if (gate !== null && gate !== 'intent' && gate !== 'blueprint' && gate !== 'contract')
    die(`--gate takes intent, blueprint or contract, got '${gate}' — the three gates the ledger check answers for (ADR-064, ADR-071)`);
  const file = rest.shift();
  if (!file) die('check needs a <qa.yaml>');

  const map = mapFile ? loadMap(mapFile) : null;
  const ledger = parseLedger(file);
  const problems = lint(ledger, map);
  if (gate) problems.push(...gateVerdict(ledger, gate, map));
  const deferred = gate ? deferredReport(ledger) : [];
  const enforced = gate ? enforcedReport(ledger) : [];
  const tooling = gate ? toolingReport(ledger) : [];
  // No silent green: without the map the reverse direction (a non-live process no ruling
  // claims) cannot be checked at all, and the gate says so rather than passing quietly (#1241).
  if (gate && !map)
    process.stdout.write("qa check: enforcement UNVERIFIED — pass --map <seqmap.json> to check that every " +
      "out-of-scope process is claimed by a ruling and every claim is honoured (#1241)\n");
  if (problems.length) {
    for (const msg of problems) process.stderr.write('qa check: ' + msg + '\n');
    die(`${problems.length} finding(s) in ${file}`);
  }
  for (const line of deferred) process.stdout.write('qa check: ' + line + '\n');
  for (const line of enforced) process.stdout.write('qa check: ' + line + '\n');
  for (const line of tooling) process.stdout.write('qa check: ' + line + '\n');
  // Mid-stage the missing digests are a to-do, not a defect (loose above the gate, ADR-040 §8).
  const digestless = gate ? 0 : digestlessCount(ledger);
  if (digestless) {
    process.stdout.write(
      `qa check: digest: ${digestless} answered ruling(s) carry no digest yet — a gate run will ` +
      `refuse them (#1049)\n`);
  }
  const open = ledger.entries.filter((e) => e.status === 'open');
  const parked = open.filter((e) => !e.blocks.length);
  process.stdout.write(
    `qa check: ${file} clean — ${ledger.entries.length} entries, ${open.length} open` +
    (parked.length ? ` (${parked.length} parked)` : '') +
    (gate ? `, gate ${gate} clear${deferred.length ? ` (${deferred.length} deferred-scope ruling(s) to carry)` : ''}` : '') + '\n');
}
main();
