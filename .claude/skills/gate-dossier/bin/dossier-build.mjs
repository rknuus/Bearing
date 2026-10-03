#!/usr/bin/env node
// dossier-build — Gate Review Dossiers (ADR-051).
//
//   node dossier-build.mjs <project-root> [--check]
//
// Reads <project-root>/docs/04_Gates/dossier.yaml (dossier-config/1_*) plus one
// record.yaml (gate-record/1_*) per conducted gate, existence-checks and counts
// every artifact path against the project tree (a missing path FAILS the
// build), and emits self-contained HTML dossiers beside the records.
//
// Deterministic: identical inputs produce byte-identical output (no
// timestamps). --check regenerates in memory and exits 1 on drift without
// writing — the bpm-build contract.
//
// Zero dependencies; plain Node. The YAML-subset parser is deliberately strict
// — the strictness IS the format validation (same regime as the qa-ledger and
// si-binding parsers). Format spec: process-specs/gate-record-format.md.

import { readFileSync, writeFileSync, unlinkSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, resolve, relative, posix, sep, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
// The two readers this skill's binaries share (ADR-062 §3, #1012): the strict YAML subset the
// records are written in, and the Q&A ledger line scan. review-surface.mjs reads the same two
// files through this same code — the derivation adds no third parser of either format.
import { GRF, RAIL_DEF, GATE_STATES, STAGE_STATES, parseYaml as parseYamlWith, readQaLedger } from './record-read.mjs'

// ── the process-owned template: rail, gates, vocabulary ─────────────────────
// Fixed by ADR-040. Changing anything here is a process change and lands in
// every project identically — never per project. RAIL_DEF and the rail-state
// vocabularies live in record-read.mjs since review-surface.mjs started
// emitting the rail too (ADR-062 `gates`) — one template, two readers.

const GATE_DEF = {
  intent: {
    speaking: 'Intent',
    full: 'Bless the business design — the business intent becomes const',
    decides: 'What this gate decides: the BPMNs, System Interactions, screen models and the ' +
      'business map are the business truth. After this gate they are const — every downstream ' +
      'artifact must trace back to them, and no downstream author may invent business behavior.',
  },
  blueprint: {
    speaking: 'Blueprint',
    full: 'Bless the system design — the model becomes const',
    decides: 'What this gate decides: the model realizes every System Interaction and nothing ' +
      'beyond the business design — no BPMN gateway edge left unrealized. After this gate the ' +
      'model is const; changes travel only the blessed changeloop, and the captured stakeholder ' +
      'walkthroughs become the replay regression guarding the stages below.',
  },
  contract: {
    speaking: 'Contract',
    full: 'Spec review — the diamond closes on paper; the last human review',
    decides: 'What this gate decides: the spec layer becomes the frozen oracle the test-blind ' +
      'implementor builds against — a wrong-but-blessed pick ships as "correct". This is the ' +
      'last human review before acceptance; failure specs are red-by-design until construction.',
  },
  acceptance: {
    speaking: 'Acceptance',
    full: 'Acceptance — the built system against the hidden partition and the client-tier E2E',
    decides: 'What this gate decides: the constructed system is accepted — the withheld ' +
      'acceptance partition and the client-tier E2E pass against it, unseen by the implementor.',
  },
}

// The mechanical checks each gate OWES (#1071). Template-owned like everything above it: the
// list lands in every project identically, and a project that cannot run one of them says so
// with a `verdict: waiver` row rather than by leaving the row out.
//
// WHY. ADR-058 §3 is unambiguous — every mechanical exit check is run green or explicitly waived
// in writing in the gate record, with the reason, and "no check is ever skipped silently". The
// rule existed; nothing enforced it. `checks:` was entirely author-supplied, so a record with no
// row for a check nobody ran was indistinguishable from one that passed, and the rule bound the
// memory of a session that had been running for hours and was assembling a surface for a human
// who was waiting. It had already fired twice: figaro's Intent gate predicted the shape in writing
// before the gate (row P9), and Comanda's own blessed Gate-2 record carries no row for
// `call-chains-check`, which the gate registry says is re-verified at Blueprint.
//
// The cost of getting this wrong is asymmetric and quiet — a red check argues with you, a
// missing check agrees with you.
//
// WHAT MAY GO IN THE LIST. Only a check a process document already binds to that gate, and the
// binding travels WITH the entry: `basis` is printed when the row is missing, so a conductor
// meeting the failure reads why the gate owes it instead of taking the list on faith.
const GATE_REQUIRES = {
  intent: [
    { id: 'intent-entry-check', name: 'Intent entry check', basis: 'gates.yaml — "before the Intent gate"' },
    { id: 'qa-check', name: 'qa check --gate intent', basis: 'the qa-ledger skill — the ledger gate at Intent' },
  ],
  blueprint: [
    { id: 'seqmap-complete', name: 'seqmap complete', basis: 'gates.yaml — the Design-stage completeness check gating Blueprint' },
    { id: 'seqmap-replay', name: 'seqmap replay', basis: 'ADR-058 §3 names the walkthrough-replay regression as a gate exit check' },
    { id: 'call-chains-check', name: 'call-chains check', basis: 'gates.yaml — "re-verified at Blueprint and Contract"' },
    { id: 'qa-check', name: 'qa check --gate blueprint', basis: 'the qa-ledger skill — the ledger gate at Blueprint' },
    { id: 'promotion-gate', name: 'Promotion predicate', basis: 'ADR-058 §3 names the promotion predicate as a gate exit check' },
  ],
  contract: [
    { id: 'spec-lint', name: 'theagent2 check spec-lint', basis: 'gates.yaml — a Contract entry condition' },
    { id: 'spec-seqcheck', name: 'theagent2 check spec-seqcheck', basis: 'gates.yaml — a Contract entry condition' },
    { id: 'construction-entry-check', name: 'Construction entry check', basis: 'gates.yaml — "again before Contract"' },
    { id: 'store-seam-check', name: 'store-seam check', basis: 'gates.yaml — "at construction entry and Contract"' },
    { id: 'call-chains-check', name: 'call-chains check', basis: 'gates.yaml — "re-verified at Blueprint and Contract"' },
    { id: 'resource-protocol-check', name: 'resource-protocol check --require-all', basis: 'the conduct skill\'s Contract row, and gates.yaml — "at Contract exit with --require-all"' },
  ],
  acceptance: [
    { id: 'acceptance-partition', name: 'Withheld acceptance partition', basis: 'ADR-040 §5 — what this gate decides: the withheld partition passes, unseen by the implementor' },
    { id: 'client-e2e', name: 'Client-tier E2E', basis: 'ADR-040 §5 — what this gate decides: the client-tier E2E passes against the built system' },
  ],
}
// The four gate ids, in rail order — the keys `conduct-state/3`'s `gates:` map carries, and what
// the line scans below match on.
const GATE_WORDS = RAIL_DEF.filter(d => d.kind === 'gate').map(d => d.id)

const REQUIRED_MISSING_NOTE =
  'No row answers for this check. ADR-058 §3: every mechanical exit check is run green or ' +
  'explicitly waived in writing here, with the reason — record the row, or waive it with ' +
  "'verdict: waiver' saying why it cannot run, who accepted that, and what would make it runnable."

// Suite strength (ADR-054 Part A) is STANDING evidence at Contract: the section
// renders there whether or not the record carries data — an omitted pass shows
// as an open item instead of disappearing. Other gates render it only when the
// record carries the block.
const SUITE_STRENGTH_GATES = ['contract']
const SUITE_STRENGTH_BLURB =
  'ADR-054 Part A — the suite\'s measured kill power, established with zero production code: the ' +
  'naive reference model stands in as the implementation under test, its source is mutated, and a ' +
  'mutant that survives is a behavior change no visible test notices — a spec hole, whoever\'s code ' +
  'later carries the behavior. Findings are ADR-013 barrier material: spec owner, conductor and ' +
  'Software Architect only, never an implementor.'
const SUITE_STRENGTH_MISSING =
  'No suite-strength pass is recorded for this gate. ADR-054 Part A makes it standing entry ' +
  'evidence — the Software Architect blesses measured kill power, not only the suite text. Conduct ' +
  'the pass and record it, or record a waiver stating why no component carries a reference model.'

// The resource-protocol sheets (ADR-059) are STANDING evidence at Contract, on the same
// mechanism as suite strength: one sheet per ResourceAccess, reviewed once, at the gate that
// is already the last human review. With no block the section renders OPEN — an unreviewed
// resource surface is visible at the gate instead of silently absent, which is the whole
// reason the section is standing rather than conditional (#884).
// #1155 — the design's DECLARED deferrals. A component marked `lifecycle: future` in the
// Method model is one the design decided and this build deliberately does not produce yet
// (IDesign's "design big, build small"). The gate predicate goes SILENT on such a component —
// it has no facets, no call chain and no encapsulated volatility BY DECISION — so without this
// panel the reviewer would have to notice its ABSENCE everywhere else to learn it exists. That
// is precisely the sibling failure #1148 records: a status that reached the sources and never
// reached the picture the reviewer opens.
//
// It is NOT an obligation and has no red state: the panel renders only when the model actually
// declares a deferral, and never as a "missing" line. The model is read live, from the path
// `dossier.yaml` names in `model:`; with no `model:` the panel does not exist.
const DEFERRED_COMPONENTS_BLURB =
  'Components the design has decided and this build deliberately does not produce yet ' +
  '("design big, build small"). Each is drawn so the decomposition stays whole. Their ' +
  'facet-lessness, their absence from the call chains and their lack of an encapsulated ' +
  'volatility are DECLARED, not defects — the fitness and gate rules skip them, and the gate ' +
  'lists them here instead (#1155).'

// #1148 — the business processes whose .bpd header declares a non-live lifecycle
// (`status dissolved|retired|parked`). Same rationale and same shape as the deferred-components
// panel above: the gate machinery goes quiet over such a process (no binding entry, no model
// use case), so without this panel the reviewer would have to notice its absence to learn of
// it. No red state, renders only when a status is actually declared.
const PROCESS_LIFECYCLE_BLURB =
  'Business processes whose source declares a non-live lifecycle. A dissolved process ceased ' +
  'to exist (its subject moved into the named successor); a retired one was switched off with ' +
  'no successor; a parked one is fully modeled but deliberately not built. Their System ' +
  'Interactions are frozen out of the binding inventory by the declaration itself — the ' +
  'drawings stay readable, marked, as history (#1148).'

const RESOURCE_PROTOCOL_GATES = ['contract']
const RESOURCE_PROTOCOL_BLURB =
  'ADR-059 — the resource-facing contract of every ResourceAccess, reviewed sheet by sheet: the ' +
  'resource shape in its own kind\'s vocabulary, the fate of every owned contract-DTO field ' +
  '(a durable field carries its write/read-back pair), the effect allowlist per use case, and ' +
  'the faults the seam answers as result data instead of rethrowing them. ' +
  'A green verdict says the sheet\'s own --check was green at review time and the named reviewer ' +
  'blessed it — the review and the enforcement read the same file, so a blessed sheet cannot go ' +
  'silently stale.'
const RESOURCE_PROTOCOL_MISSING =
  'No resource-protocol review is recorded for this gate. ADR-059 makes the sheets standing ' +
  'Gate-3 evidence — one per ResourceAccess, blessed by the Software Architect or the ' +
  'domain-architect delegate the brief names (ADR-058). Review the sheets and record them, or ' +
  'record a waiver stating why there is no resource surface to review; an unreviewed resource ' +
  'surface must not cross this gate unseen.'

// deployment_decisions (ADR-071, #1247): the deployment view's rulings are STANDING evidence at
// Contract, the way the sheets are. The block is the evidence that the decisions were MADE — by
// whom, on what basis — not a second copy of them: the ruling itself lives on the deployment view
// (`ruled: { by, on, basis }` per slot and on `hosting:`, deployment-view/3) and the page renders
// it from there, the #969 principle. One row per slot plus one for hosting, named reviewer,
// OPEN until crossed, blocking after (#971).
const DEPLOYMENT_DECISION_GATES = ['contract']
const DEPLOYMENT_DECISION_SOURCE = 'docs/03_Technology/03_Deployment/deployment-view.yaml'
const DEPLOYMENT_DECISION_BLURB =
  'ADR-071 — the decisions the deployment view carries, ruled before the protocol sheets were ' +
  'authored: the resource kind and the concrete product behind every slot, and the hosting ' +
  'operational concept (topology shape, target class, cost envelope, partial deployment, operator). ' +
  'Each is the Software Architect\'s ruling, stamped on the deployment view with who ruled, when and ' +
  'on what basis; the rows below are rendered from that file. A green verdict says the named ' +
  'reviewer confirmed the ruling as recorded — a gate reviews evidence, it does not re-decide.'
const DEPLOYMENT_DECISION_MISSING =
  'No deployment-decision review is recorded for this gate. ADR-071 makes the deployment view\'s ' +
  'rulings standing Contract evidence — one row per slot and one for the hosting concept, confirmed ' +
  'by the Software Architect or the domain-architect delegate the brief names (ADR-058). Record ' +
  'them, or record a waiver stating why the system stands on no resource; an unruled product or ' +
  'hosting target must not cross this gate unseen.'

// The conduct annex (ADR-056 §5/§7, amending ADR-051) is STANDING at every
// gate THIS RUN CROSSED — the gates the run's conduct state names, record by
// record (CONDUCTED_GATE_RECORDS below, #850): the stage retro authors the block
// at gate exit; with no block the section renders OPEN so a skipped retro is
// visible at the gate. A rail carrying an earlier run's gates, and a project
// with no run around it, never see the section.
const CONDUCT_ANNEX_BLURB =
  'ADR-056 — what this stage cost and where it ground: per-role cost/time aggregated from the ' +
  'session ledger and the session-metrics/3 rows, rework and friction counts. Authored by the stage ' +
  'retro at gate exit; costs are list-price estimates. The issues it references stay authoritative.'
const CONDUCT_ANNEX_MISSING =
  'No conduct annex is recorded for this gate. In a conducted run the stage retro runs at every ' +
  'gate exit (ADR-056 §5) and writes this block from the stage\'s metrics rows — dispatch it and rebuild.'

// The gate-entry prediction sheet (#941) is STANDING at every PENDING gate record of the
// conducting run: authored by the conductor BEFORE the gate's checks run (git ordering is the
// honesty proof), diffed by the stage retro at gate exit in the conduct annex. A pending gate
// with no sheet renders OPEN — visible exactly while the sheet can still be written honestly.
// A BLESSED record with no sheet renders nothing: unlike the annex, a prediction sheet cannot
// be backfilled by construction, so a permanent OPEN over history would be noise nobody can
// act on. A sheet that exists always renders, diff or not.
const PREDICTIONS_BLURB =
  '#941 — what was expected to go wrong at this gate and which check was expected to catch it, ' +
  'written by the conductor at gate entry, before the checks ran; the stage retro diffs it at ' +
  'gate exit. The point is the cheap notice that a check you were counting on stayed silent — ' +
  'a sheet whose diffs never produce a SILENT or an UNPREDICTED entry is a sheet nobody took ' +
  'seriously, and the stage retro says so.'
const PREDICTIONS_MISSING =
  'No prediction sheet is recorded for this gate. It is authored at gate ENTRY — before the ' +
  'gate\'s checks run — and committed then, so git ordering proves the predictions predate the ' +
  'outcomes; a sheet first written at exit is a reconstruction. Write ' +
  'predictions.yaml (gate-predictions/1) beside this record before conducting the gate.'
const PREDICTION_OUTCOME = {
  fired: { word: 'FIRED AS PREDICTED', cls: 'v-green' },
  silent: { word: 'PREDICTED, ORACLE SILENT', cls: 'v-red' },
  nothing: { word: 'DID NOT MATERIALIZE', cls: 'v-info' },
}

const VERDICT = {
  green: { word: 'PASS', cls: 'v-green' },
  amber: { word: 'RULING OWED', cls: 'v-amber' },
  red: { word: 'OPEN', cls: 'v-red' },
  info: { word: 'NOTE', cls: 'v-info' },
  // A check that COULD NOT RUN, waived in writing (#1071, ADR-058 §3). Until this verdict
  // existed an author who could not run a check had no vocabulary for saying so IN THE TABLE:
  // the honest options were prose somewhere else or nothing, and nothing is easier — which is
  // how a skipped check and a passing check came to look identical in a record. A waiver is a
  // review outcome a named person accepted, never an omission, so it carries three mandatory
  // fields (checked below): why it could not run, who accepted that, and what would make it
  // runnable. The third is the Software Architect's #939 ruling — every expected failure names
  // the thing that will remove it — applied at the gate instead of at the build.
  waiver: { word: 'WAIVED', cls: 'v-waiver' },
}
// Where `waiver` is NOT a legal verdict. The suite-strength and resource-protocol blocks each
// carry a block-level `waiver:` of their own ("no component has a reference model", "the system
// has no ResourceAccess"), and a row-level waiver inside them would be a second way to say the
// same thing — two mechanisms for one job (repo charter). Their rows keep the original four.
const BLOCK_VERDICTS = ['green', 'amber', 'red', 'info']
const STATUS_PILL = { blessed: 'pill-green', pending: 'pill-amber', locked: 'pill-muted' }
const OPEN_STATES = ['open', 'closed', 'ratified']
// A gate record's own status. CLOSED SET, and deliberately NOT the conduct state's word for
// the same fact: conduct-state-format.md fixes a gate as `pending | at-gate | passed`, and a
// conductor writing both surfaces in one session carried `passed` into two run-4 records,
// where nothing read it for a whole run (#837). Checked on every gate record in the project,
// on the rail or off it.
const RECORD_STATES = ['blessed', 'pending']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// ADR-060 mechanism 3 (#818): a number on a gate surface must arrive with its own limits
// attached — "when you put a number in front of me, tell me what it measures and what it
// does not" (the owner's request, run-4 Contract). Any check result or measured
// suite-strength pass carrying a score (a percentage or an X/Y count) must state what it
// does NOT cover; the build refuses a bare percentage. The detector errs toward asking —
// if a non-score number trips it, scope it or rephrase the result.
const SCORE_RE = /(\d+(?:\.\d+)?\s*(?:%|per ?cent))|(?<![\d.])\d+\s*\/\s*\d+(?![\d.])/i
const QA_ID_RE = /^QA-\d{3}$/
const normQuote = s => String(s).replace(/\s+/g, ' ').trim()

// ── strict YAML-subset parser ───────────────────────────────────────────────
// Shared with review-surface.mjs via record-read.mjs (#1012); `die` names this binary.

const parseYaml = (text, file) => parseYamlWith(text, file, die)

function die (msg) { console.error(`dossier-build: ${msg}`); process.exit(1) }

// ── the Resource Protocol Sheet reader (ADR-059, #969) ──────────────────────
// A sheet (`resource-protocol/1`, process-specs/resource-protocol-format.md) is NOT written in
// the strict subset the records above use: it carries inline flow maps and lists
// (`- { name: order_id, type: uuid, key: primary }`, `on: [orders, order_lines]`), because its
// generated half is machine-written a row at a time. So it gets its own, deliberately TOLERANT
// reader: the dossier RENDERS a sheet, it does not own one. The sheet's own
// `just resource-protocol-check` is its validator (it regenerates the generated half from the
// const model and fails on any disagreement), and a shape this reader cannot follow must come
// out as a note on the page — never as a failed gate build, and never as a stack trace.
//
// Read for what #969 asks the gate page to show: the shape section as an ER diagram plus a
// plain column table, and the danger-class effects crossed with the allowlists. Everything
// else in the sheet is carried past untouched.

const flowDepth = s => {
  let d = 0; let q = null
  for (const ch of s) {
    if (q) { if (ch === q) q = null; continue }
    if (ch === '"' || ch === "'") { q = ch; continue }
    if (ch === '{' || ch === '[') d++
    else if (ch === '}' || ch === ']') d--
  }
  return d
}

// A '#' inside a quoted note (`'ruling 20 final link (#500)'`) belongs to the value; one after
// whitespace at flow depth 0 opens a comment.
const stripSheetComment = s => {
  let q = null; let d = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) { if (ch === q) q = null; continue }
    if (ch === '"' || ch === "'") { q = ch; continue }
    if (ch === '{' || ch === '[') d++
    else if (ch === '}' || ch === ']') d--
    else if (ch === '#' && d === 0 && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd()
  }
  return s
}

const unquoteSheet = v => {
  if (/^"[\s\S]*"$/.test(v)) return v.slice(1, -1).replace(/\\"/g, '"')
  if (/^'[\s\S]*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'")
  return v
}

// Split a flow collection's body on its own commas — never on one inside a nested collection or
// a quoted note ("the day specials go, the card stays").
const splitFlow = s => {
  const out = []; let buf = ''; let q = null; let d = 0
  for (const ch of s) {
    if (q) { buf += ch; if (ch === q) q = null; continue }
    if (ch === '"' || ch === "'") { q = ch; buf += ch; continue }
    if (ch === '{' || ch === '[') d++
    if (ch === '}' || ch === ']') d--
    if (ch === ',' && d === 0) { out.push(buf); buf = ''; continue }
    buf += ch
  }
  if (buf.trim()) out.push(buf)
  return out.map(x => x.trim()).filter(Boolean)
}

function flowValue (v) {
  const t = String(v).trim()
  if (t.startsWith('{')) {
    const out = {}
    for (const part of splitFlow(t.replace(/^\{/, '').replace(/\}$/, ''))) {
      const m = part.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*([\s\S]*)$/)
      if (m) out[m[1]] = flowValue(m[2])
    }
    return out
  }
  if (t.startsWith('[')) return splitFlow(t.replace(/^\[/, '').replace(/\]$/, '')).map(flowValue)
  return unquoteSheet(t)
}

function parseSheet (text) {
  const raw = text.split('\n')
  const lines = []
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i].replace(/\t/g, '  ')
    if (!line.trim() || /^\s*#/.test(line)) continue
    const indent = line.match(/^ */)[0].length
    let body = stripSheetComment(line.trim())
    if (!body) continue
    // a flow collection may be written over several lines; join until it closes
    while (flowDepth(body) > 0 && i + 1 < raw.length) body = `${body} ${stripSheetComment(raw[++i].trim())}`
    lines.push({ indent, body })
  }
  let pos = 0
  function node (indent) {
    if (pos >= lines.length || lines[pos].indent < indent) return null
    return lines[pos].body.startsWith('- ') ? seq(lines[pos].indent) : mapping(lines[pos].indent)
  }
  function mapping (indent) {
    const out = {}
    while (pos < lines.length) {
      const l = lines[pos]
      if (l.indent < indent || l.body.startsWith('- ')) break
      const m = l.body.match(/^([A-Za-z_][A-Za-z0-9_]*):(?:\s+([\s\S]*))?$/)
      if (!m) { pos++; continue }   // a line this reader does not know: skipped, never fatal
      pos++
      out[m[1]] = m[2] === undefined || m[2] === '' ? node(indent + 1) : flowValue(m[2])
    }
    return out
  }
  function seq (indent) {
    const out = []
    while (pos < lines.length) {
      const l = lines[pos]
      if (l.indent < indent || !l.body.startsWith('- ')) break
      const rest = l.body.slice(2)
      if (/^[A-Za-z_][A-Za-z0-9_]*:(\s|$)/.test(rest)) {
        lines[pos] = { indent: indent + 2, body: rest }
        out.push(mapping(indent + 2))
      } else { pos++; out.push(flowValue(rest)) }
    }
    return out
  }
  const doc = node(0)
  return doc && !Array.isArray(doc) ? doc : {}
}

const SHEET_CACHE = new Map()
function readSheet (rel) {
  if (SHEET_CACHE.has(rel)) return SHEET_CACHE.get(rel)
  let sheet = null
  try { sheet = parseSheet(readFileSync(join(ROOT, rel), 'utf8')) } catch { sheet = null }
  SHEET_CACHE.set(rel, sheet)
  return sheet
}

function checkFormat (doc, expected, file) {
  const m = String(doc.format ?? '').match(/^([a-z-]+)\/(\d+)(?:_[A-Za-z0-9-]+)?$/)
  if (!m || m[1] !== expected || m[2] !== '1') {
    die(`${file}: format must be '${expected}/1_<term>' (got '${doc.format ?? ''}')`)
  }
}

const need = (obj, keys, file, ctx) => {
  for (const k of keys) if (obj[k] === undefined) die(`${file}: ${ctx} is missing '${k}'`)
}
const oneOf = (v, set, file, ctx) => { if (!set.includes(v)) die(`${file}: ${ctx}: '${v}' not in ${set.join('|')}`) }

// A LIST-shaped key that carries a single value instead — `issues: "#812"`, `not_covered: none`.
// The parser cannot catch this one (a lone scalar is a legal scalar), and it is the shape that
// reached `.map` inside a render function as a TypeError (#885). Every list this format has goes
// through here, so the answer is the file, the container, the key and the shape wanted — never a
// stack trace. Returns the list, or [] for an absent optional key.
const asList = (obj, key, file, ctx, required = false) => {
  const v = obj[key]
  if (v === undefined) {
    if (required) die(`${file}: ${ctx} is missing '${key}'`)
    return []
  }
  if (!Array.isArray(v)) {
    die(`${file}: ${ctx}: '${key}' must be a block list — one '- ' item per line, indented two ` +
      `spaces under '${key}:' — but it reads as a single value (${JSON.stringify(String(v))}). ` +
      `A list of one is still a list, and this format has no inline '[…]' list — ${GRF}`)
  }
  return v
}

// The one out-of-vocabulary status worth naming, because it is not a typo: `passed` is the
// CONDUCT STATE's word for a crossed gate (conduct-state-format.md), and a record is not the
// conduct state (#837).
function checkRecordStatus (v, file) {
  if (v === 'passed') {
    die(`${file}: status: 'passed' is the conduct state's word for a crossed gate ` +
      `(process-specs/conduct-state-format.md), not a gate record's — a record is ` +
      `'${RECORD_STATES.join("' or '")}'. The two surfaces keep two vocabularies (#837)`)
  }
  oneOf(v, RECORD_STATES, file, 'status')
}

// `blessed:` — the typed blessing date (ADR-062 §2, #1016). The review surface derives
// `changed-since-blessed` by comparing a file's last commit against this date, so the date is a
// FIELD rather than something regexed out of `status_label`: that label is a display string, and
// the three in Comanda alone read "BLESSED 2026-07-28", "PASSED 2026-08-16 — with two amber
// checks carried forward" and "BLESSED — const". Prose is only ever the payload.
//
// Required when blessed, refused when pending: a gate not yet blessed has no blessing date, and
// one written there would be a prediction dressed as a record. Rail records only — the full
// schema answers to a rail, and the off-rail sweep keeps its two process-wide rules so that a
// record from a run that finished before this field existed is not accused of owing it (#850).
function checkBlessedDate (rec, file) {
  if (rec.status === 'blessed') {
    if (rec.blessed === undefined) {
      die(`${file}: status is 'blessed' but the record carries no 'blessed:' date — the blessing ` +
        `date is a typed field (YYYY-MM-DD), not something read out of status_label ` +
        `(${JSON.stringify(String(rec.status_label ?? ''))}); ADR-062 §2 — ${GRF}`)
    }
    if (!DATE_RE.test(String(rec.blessed))) {
      die(`${file}: 'blessed: ${rec.blessed}' is not a YYYY-MM-DD date — ${GRF}`)
    }
  } else if (rec.blessed !== undefined) {
    die(`${file}: status is '${rec.status}' but the record carries 'blessed: ${rec.blessed}' — a ` +
      `gate that has not been blessed has no blessing date; drop the field until it is ` +
      `blessed — ${GRF}`)
  }
}

// suite_strength (ADR-054 Part A): scores per component carrying a reference
// model, the disposition of every survivor, and the fuzz runs. Either a
// measured pass (`components:`) or a `waiver:` saying why nothing is
// measurable — never both, never neither.
function checkSuiteStrength (ss, file) {
  need(ss, ['source'], file, 'suite_strength')
  refuseEscape(ss.source, file, 'suite_strength source')
  if (!ss.components && !ss.waiver) die(`${file}: suite_strength needs 'components' or a 'waiver'`)
  if (ss.components && ss.waiver) die(`${file}: suite_strength carries both 'components' and 'waiver' — pick one`)
  if (ss.components) {
    if (!Array.isArray(ss.not_covered) || !ss.not_covered.length || ss.not_covered.some(n => !normQuote(n))) {
      die(`${file}: a measured suite_strength pass needs a non-empty 'not_covered' list — ` +
        `state which behaviours in the gate's scope the score does not reach (ADR-060, #818)`)
    }
  }
  for (const c of asList(ss, 'components', file, 'suite_strength')) {
    need(c, ['name', 'score', 'verdict'], file, `suite_strength component '${c.name ?? '?'}'`)
    oneOf(c.verdict, BLOCK_VERDICTS, file, `suite_strength component '${c.name}' verdict`)
    refuseEscape(c.model, file, `suite_strength component '${c.name}' model`)
  }
  for (const s of asList(ss, 'survivors', file, 'suite_strength')) {
    need(s, ['id', 'state', 'disposition'], file, `suite_strength survivor '${s.id ?? '?'}'`)
    oneOf(s.state, OPEN_STATES, file, `suite_strength survivor '${s.id}' state`)
  }
  for (const f of asList(ss, 'fuzz', file, 'suite_strength')) {
    need(f, ['name', 'result'], file, `suite_strength fuzz run '${f.name ?? '?'}'`)
    if (f.verdict !== undefined) oneOf(f.verdict, BLOCK_VERDICTS, file, `suite_strength fuzz run '${f.name}' verdict`)
  }
}

// resource_protocols (ADR-059): one reviewed sheet per SEAM since ADR-065 (#1093). It was one per
// ResourceAccess while an Access stood on one resource; now an Access may own several seams, so
// `name` is the seam and the optional `access:` names the Access the row groups under. `path` is
// existence-checked below with the other cited paths, and refused outright when it leaves the
// project (ADR-051 §3) — a review surface that quotes a sheet outside the project quotes a
// document the gate cannot show.
//
// `access:` is OPTIONAL, deliberately: whether the Gate-3 surface becomes one entry per sheet
// grouped under its owning Access is ADR-065's open question O3, which the Software Architect has
// not ruled on. A row without it renders ungrouped rather than failing — nothing goes red on
// account of an unruled question.
//
// Either a reviewed pass (`sheets:`) or a `waiver:` saying why there is no resource surface to
// review — never both, never neither, the same contract suite_strength carries (#907). Without
// the waiver a system with no ResourceAccess had no way to say so: it could only leave the block
// out and carry the standing section's red OPEN through every Gate-3 review, or write a sheet
// that describes nothing. `reviewer` stays mandatory either way — a waiver is a review outcome a
// named reviewer accepted, not an absence of review.
function checkResourceProtocols (rp, file) {
  need(rp, ['reviewer'], file, 'resource_protocols')
  if (!rp.sheets && !rp.waiver) die(`${file}: resource_protocols needs 'sheets' or a 'waiver'`)
  if (rp.sheets && rp.waiver) die(`${file}: resource_protocols carries both 'sheets' and 'waiver' — pick one`)
  // No emptiness check on the list: `sheets:` with nothing under it is refused by the parser as a
  // key with no block, and this format has no inline `[]`. So a review-less `sheets:` cannot be
  // written at all — the way to say 'there is nothing to review' is the waiver.
  for (const sh of asList(rp, 'sheets', file, 'resource_protocols')) {
    const who = `resource_protocols sheet '${sh.name ?? '?'}'`
    need(sh, ['name', 'path', 'verdict'], file, who)
    oneOf(sh.verdict, BLOCK_VERDICTS, file, `${who} verdict`)
    if (escapesProject(sh.path)) {
      die(`${file}: ${who} path '${sh.path}' leaves the project, which ADR-051 §3 forbids — a ` +
        `sheet is a deployment-view artifact of THIS project ` +
        `(docs/03_Technology/03_Deployment/protocol/<Seam>.protocol.yaml)`)
    }
  }
}

// deployment_decisions (ADR-071, #1247) — see the constants above. Either `rows:` with a `source:`
// (the deployment view the rows are read against) or a `waiver:` — never both, never neither —
// and a mandatory `reviewer`, the contract `resource_protocols` and `suite_strength` already carry.
function checkDeploymentDecisions (dd, file) {
  need(dd, ['reviewer'], file, 'deployment_decisions')
  if (!dd.rows && !dd.waiver) die(`${file}: deployment_decisions needs 'rows' or a 'waiver'`)
  if (dd.rows && dd.waiver) die(`${file}: deployment_decisions carries both 'rows' and 'waiver' — pick one`)
  if (dd.rows) {
    need(dd, ['source'], file, 'deployment_decisions')
    if (escapesProject(dd.source)) {
      die(`${file}: deployment_decisions source '${dd.source}' leaves the project, which ADR-051 §3 forbids — ` +
        `the deployment view is an artifact of THIS project (${DEPLOYMENT_DECISION_SOURCE})`)
    }
  }
  const seen = new Set()
  for (const r of asList(dd, 'rows', file, 'deployment_decisions')) {
    const who = `deployment_decisions row '${r.name ?? '?'}'`
    need(r, ['name', 'verdict'], file, who)
    oneOf(r.verdict, BLOCK_VERDICTS, file, `${who} verdict`)
    if (seen.has(r.name)) die(`${file}: ${who} appears twice — one row per slot, one for hosting`)
    seen.add(r.name)
  }
}

// `subagent_cost_usd` (#1070) — optional, since a gate crossed before the field existed cannot
// carry it, but never half-stated: a figure that is neither money nor the word `unmeasured` is
// the silent zero this column was added to end. `0` is a legal answer and means what it says —
// this stage dispatched no in-process sub-agent.
function checkSubagentCost (block, file, who) {
  const v = block?.subagent_cost_usd
  if (v === undefined || v === null) return
  const text = String(v).trim()
  if (text === 'unmeasured' || (text !== '' && Number.isFinite(Number(text)))) return
  die(`${file}: ${who} has subagent_cost_usd '${v}' — it is a list-price estimate or the literal ` +
    `\`unmeasured\`; anything else reads as free (#1070)`)
}

// conduct annex (ADR-056): the stage retro's per-node cost/friction block.
function checkConductAnnex (ca, file) {
  need(ca, ['source', 'node', 'summary', 'by_role', 'totals', 'friction'], file, 'conduct')
  // ADR-051 §3 admits no path out of the project, and the conduct ledger is RUN-scoped: it
  // sits at the run's workspace root, above the project, because one run can touch more than
  // one project. So the annex cites an IN-PROJECT COPY of the node row, written beside the
  // record by the stage retro at gate exit, and the copy is checked against the run's row below
  // (#836). Pointing at the ledger — `../.theagent/…` — is the thing that cannot be allowed.
  if (escapesProject(ca.source)) {
    die(`${file}: conduct source '${ca.source}' leaves the project, which ADR-051 §3 forbids. ` +
      `The conduct ledger is run-scoped and lives above the project: copy the node row into ` +
      `the project at gate exit and cite the copy (#836)`)
  }
  for (const r of asList(ca, 'by_role', file, 'conduct', true)) {
    need(r, ['role', 'cost_usd', 'wall_minutes'], file, `conduct by_role '${r.role ?? '?'}'`)
    checkSubagentCost(r, file, `conduct by_role '${r.role ?? '?'}'`)
  }
  need(ca.totals, ['cost_usd', 'wall_minutes'], file, 'conduct totals')
  checkSubagentCost(ca.totals, file, 'conduct totals')
  // `issues` is the annex's one list of bare refs, and the one the spec's own skeleton wrote as
  // `["#812"]` — a shape the parser reads as a string, which then reached `.map` in the renderer
  // (#885). Checked here so the answer names the file and the key, and so an empty entry is
  // refused too: a link to nothing renders as a link.
  for (const i of asList(ca, 'issues', file, 'conduct')) {
    if (!normQuote(i)) die(`${file}: conduct 'issues' carries an empty entry — every entry is a ` +
      `tracker ref ("#812") or an id that renders as text`)
  }
  if (ca.predictions !== undefined) checkPredictionsDiff(ca.predictions, file)
}

// The predictions diff (#941): the stage retro's gate-exit comparison of the gate-entry sheet
// against what fired. Structure only here; that the outcome ids cover the sheet's rows exactly
// is checked in the record loop, where the sheet itself is loaded.
function checkPredictionsDiff (pd, file) {
  need(pd, ['sheet', 'outcomes'], file, 'conduct predictions')
  refuseEscape(pd.sheet, file, 'conduct predictions sheet')
  for (const o of asList(pd, 'outcomes', file, 'conduct predictions', true)) {
    need(o, ['id', 'outcome'], file, `predictions outcome '${o.id ?? '?'}'`)
    oneOf(o.outcome, Object.keys(PREDICTION_OUTCOME), file, `predictions outcome '${o.id}'`)
  }
  for (const u of asList(pd, 'unpredicted', file, 'conduct predictions')) {
    need(u, ['text'], file, 'predictions unpredicted entry')
  }
}

// The gate-entry sheet itself (gate-predictions/1, #941). Strict-parsed and fail-closed on the
// rail: a sheet the run relies on must be readable at the gate. The check-before-ask sweep does
// NOT read it — a risk row is prediction prose, not a request to the reviewer, and the sheet
// has no authority mechanism; a question for the reviewer belongs in the record's `confirm:`.
function checkPredictionSheet (ps, file, gateId) {
  checkFormat(ps, 'gate-predictions', file)
  need(ps, ['gate', 'by', 'rows'], file, 'prediction sheet')
  if (ps.gate !== gateId) die(`${file}: gate '${ps.gate}' does not match the record beside it ('${gateId}')`)
  const ids = new Set()
  for (const r of asList(ps, 'rows', file, 'prediction sheet', true)) {
    need(r, ['id', 'risk', 'named_by', 'oracle', 'if_silent'], file, `prediction row '${r.id ?? '?'}'`)
    if (ids.has(r.id)) die(`${file}: prediction row id '${r.id}' appears twice — ids are unique; the annex diff references them`)
    ids.add(r.id)
  }
}

// A confirm item's AUTHORITY (ADR-056 §1c, #845 — the lintable half of the check-before-ask
// duty). Every item a record asks a reviewer to *confirm* rests on one of exactly two things,
// and they are different requests: *confirm my reading of this ruling* (a ruling id, plus the
// ruling quoted verbatim beside the assertion) or *make a judgement call no ruling covers*
// (the literal `none`, plus one line saying what was checked to establish that). An item that
// can name neither is not a judgement call — it is an unchecked assertion, and it is the
// conductor's to resolve before assembly, not the reviewer's, which is why the build refuses
// it here rather than letting it reach a human.
//
// STRUCTURE, NOT CONTENT: the build checks that the field is present, that it is one of the
// two shapes, and — when dossier.yaml names a ledger — that a cited quote is the ledger answer
// verbatim. Whether the reading is *right* is the reviewer's, and always was.
const NO_RULING = 'none'

function checkConfirmItem (cf, file) {
  const who = `confirm item '${cf.text ?? cf.authority ?? '?'}'`
  if (cf.qa !== undefined) {
    die(`${file}: ${who} carries 'qa' — a confirm item now names its authority in one field, ` +
      `'authority:', which takes either a ruling id (QA-###) or the literal '${NO_RULING}' (#845)`)
  }
  need(cf, ['authority', 'text'], file, who)
  if (!normQuote(cf.text)) die(`${file}: ${who} has an empty 'text' — say what is being confirmed`)
  checkAuthority(cf, who, file)
  checkConfirmDigest(cf, who, file)
}

// The DIGEST behind a quoted ruling (#1049, SA ruling 2026-08-26). A verbatim ruling can run to
// thousands of characters, and a review surface that renders it whole is a wall the reviewer
// skips. So the surfaces render a two-or-three sentence Lesart and put the quote one expander
// away — which only works if a Lesart exists. Resolution order, and there is no third source:
//
//   1. `digest:` written on the confirm item itself — for an authority that is not a ledger
//      entry, and for a reading narrower than the ledger's own summary;
//   2. the `digest:` of the ledger entry `authority:` names.
//
// `authority: none` needs none: its `basis` IS the plain reading, one line, already legible.
function confirmDigest (cf) {
  const own = normQuote(cf.digest ?? '')
  if (own) return own
  if (normQuote(cf.authority) === NO_RULING) return ''
  const led = qaLedger?.entries.get(normQuote(cf.authority))
  return normQuote(led?.digest ?? '')
}

function checkConfirmDigest (cf, who, file) {
  if (normQuote(cf.authority) === NO_RULING) {
    if (cf.digest !== undefined) {
      die(`${file}: ${who} declares 'authority: ${NO_RULING}' and also carries a 'digest' — the ` +
        `'basis' line IS the plain reading of a judgement call; a second summary of it would be ` +
        `a summary of a summary (#1049)`)
    }
    return
  }
  if (confirmDigest(cf)) return
  const auth = normQuote(cf.authority)
  die(`${file}: ${who} quotes ${auth} but resolves no digest — the review surface renders a ` +
    `Lesart and puts the verbatim ruling behind an expander, and this ruling has none. Write ` +
    `'digest:' on ${auth} in ${config.qa_ledger ?? 'the ledger'} (the usual home, so every ` +
    `surface gets it), or on this item when the reading here is narrower (#1049)`)
}

// The authority itself, in either shape. Shared, because the duty is about the REQUEST and a
// request is not only ever written into `confirm:` (#862): a `checks[]` row or an `open[]` item
// that asks for a confirmation answers to exactly these rules, on its own row.
function checkAuthority (cf, who, file) {
  const auth = normQuote(cf.authority)

  if (auth === NO_RULING) {
    // The judgement call. It must SAY so, and say what was checked to establish that no ruling
    // covers it — the declaration is the point, and an undeclared one reads as a quoted reading.
    if (cf.ruling !== undefined) {
      die(`${file}: ${who} declares 'authority: ${NO_RULING}' but also carries a 'ruling' quote — ` +
        `pick one: a ruling id with its quote, or ${NO_RULING} with its basis (#845)`)
    }
    if (!normQuote(cf.basis ?? '')) {
      die(`${file}: ${who} declares 'authority: ${NO_RULING}' with no 'basis' — one line naming ` +
        `what was checked and why no ruling covers it. An item that can name no authority is not ` +
        `a judgement call; it is an unchecked assertion, and it is yours to resolve before ` +
        `assembly (ADR-056 §1c)`)
    }
    return
  }

  if (!QA_ID_RE.test(auth)) {
    die(`${file}: ${who} authority '${cf.authority}' is neither a ruling id (QA-###) nor the ` +
      `literal '${NO_RULING}'. Those are the only two authorities a confirm item can have — ` +
      `quote the ruling it rests on, or declare that none covers it (ADR-056 §1c, #845)`)
  }
  if (cf.basis !== undefined) {
    die(`${file}: ${who} cites ${auth} and also carries a 'basis' — 'basis' belongs to the ` +
      `'authority: ${NO_RULING}' shape; a cited ruling speaks for itself, verbatim (#845)`)
  }
  if (!normQuote(cf.ruling ?? '')) {
    die(`${file}: ${who} cites ${auth} with no 'ruling' quote — a cited ruling is quoted ` +
      `verbatim beside the assertion, so the reviewer compares rather than trusts (ADR-060)`)
  }
  if (qaLedger) {
    const led = qaLedger.entries.get(auth)
    if (!led) die(`${file}: ${who} cites ${auth}, which is not in ${config.qa_ledger}`)
    if (led.answer === undefined) die(`${file}: ${who} cites ${auth}, which has no recorded answer in ${config.qa_ledger}`)
    const by = qaLedger.supersededBy?.get(auth)
    if (by) {
      die(`${file}: ${who} rests on ${auth}, which ${by} SUPERSEDES — the quote may be word ` +
        `perfect and the ruling still be the wrong one (#944, ADR-060 amendment). Re-read the ` +
        `assertion against ${by} and cite that; re-quoting ${auth} is not the remedy`)
    }
    if (normQuote(cf.ruling) !== normQuote(led.answer)) {
      die(`${file}: ${who}: the ${auth} quote is not the ledger answer verbatim —\n` +
        `  record: ${normQuote(cf.ruling)}\n  ledger: ${normQuote(led.answer)}`)
    }
  }
}

// A confirm-shaped ASK, wherever it is written (#862, #873, #879). #845 made the
// check-before-ask duty lintable for the `confirm:` list — and keyed it off the LIST rather than
// off the REQUEST, so the identical ask written into a `checks[]` result or an `open[]` item
// never entered the confirm class and never had to name an authority. The duty is about the
// request (ADR-056 §1c), so a mechanism scoped to a few YAML keys is dodgeable by accident: run
// 4's Gate-3 record carries four such asks, three of them still open.
//
// A text detector on prose, like SCORE_RE above, and it ERRS TOWARD ASKING: an imperative
// `confirm` opening a sentence trips it whether or not the author meant a request. The way out
// of a false positive is `not_an_ask:`, one line saying why the words are not a request — a
// declaration on disk is worth more to the next reader than a silent carve-out in this regex.
// `confirm` as a noun or in the past ('the confirm writes', 'confirmed byte-identical',
// 'ConfirmBooking') never trips it: the imperative arm needs a sentence boundary before the verb
// and an object after it.
const CONFIRM_ASK_RE = new RegExp([
  String.raw`(?:^|[.!?;:—–]\s+|\b(?:please|kindly)\s+)confirm\b(?=\s+\w)`,
  String.raw`\bask(?:ed|s|ing)?\s+(?:\w+\s+){0,4}?to\s+confirm\b`,
  String.raw`\bfor\s+(?:your|his|her|their|its|the\s+\w+(?:'s)?)\s+confirmation\b`,
  String.raw`\b(?:needs?|requires?|awaiting|await|owed|pending)\s+(?:\w+\s+){0,3}?confirmation\b`,
  String.raw`\bto\s+be\s+confirmed\b`,
].join('|'), 'i')

const readsAsAsk = prose => CONFIRM_ASK_RE.test(normQuote(prose ?? ''))

// WHICH FIELDS ARE READ — inverted (#879). #862 named two fields, #873 a third, and each of the
// last two was found the same way: someone verified the previous fix against the tree and found
// the ask one field further along. A list of the fields that ARE checked is a list that is short
// by one until somebody looks; so the list is the other way round now. Every string a gate record
// carries is read for a confirm-shaped ask, and the set below names the keys where a request to
// the reviewer cannot be written — nothing else is exempt, and a field added to the format is
// covered the day it is added rather than the day the omission is noticed.
const ASK_EXEMPT = new Set([
  // The DECLARATION ITSELF, and this is the load-bearing entry. `ruling:` is the owner's answer
  // quoted VERBATIM — the quote is very often the words of a request, because the question it
  // answered was one; `basis:` says what was checked to establish that no ruling covers the item;
  // `not_an_ask:` says why the words are not a request. Reading any of the three as a request
  // would fail a correctly declared row on its own declaration.
  // `digest:` (#1049) joins them for the same reason one step removed: it is the Lesart OF a
  // ruling, and a ruling that answered a request is summarised in the words of that request.
  'authority', 'ruling', 'basis', 'not_an_ask', 'digest',
  // Closed vocabularies and machine-read identity, each checked against its own set elsewhere.
  'format', 'gate', 'status', 'verdict', 'state',
  // Paths and references: existence-checked, rendered as links, never prose.
  'path', 'source', 'model', 'ref', 'issues',
])
// Numeric fields need no entry — a count, a score or a wall time cannot read as a request, and an
// exemption that never fires is a claim nobody checks. The set above carries only keys whose
// value IS prose, or is prose the reviewer must be able to read as something other than an ask.

// Where the declaration goes when the asking prose has no row of its own. `sections[].blurb` had
// this shape of problem first (#873); the record's own top-level prose — `lede`, `disposition`,
// `status_label` — has it in a sharper form, because the container that would carry the field is
// the record.
const RECORD_ASK_NOTE = ". This is the record's own top-level prose, which has no row: moving " +
  "the ask to 'confirm:' is almost always the right way, because a request written into a lede " +
  'or a disposition is tracked, answered and closed nowhere. The other two ways put the field at ' +
  "the top level of the record, beside 'status:' (#879)"

// A section blurb says what a group of artifacts IS. When one asks, the FIRST way forward is
// almost always the right one: a blurb is not a place a request can be tracked, answered or
// closed, so the ask belongs on the confirm surface or in `open:` where it carries a ref. The
// other two ways stay open — the detector errs toward asking, and a rule with no escape hatch
// would turn a blessed record red with rewriting its ruled prose as the only remedy (#873).
const SECTION_ASK_NOTE = '. For a section blurb the first way is almost always the right one: ' +
  'a blurb describes what a group of artifacts is, and a request written there is tracked, ' +
  'answered and closed nowhere (#873)'

// The steer is chosen by the ASKING FIELD, not by the container: `blurb` and the record's own
// prose each track nothing, so for both the first way forward is to move the ask.
const ASK_FIELD_NOTE = { blurb: SECTION_ASK_NOTE }

// The name a failure uses for the mapping that must declare — the thing the author sees in the
// file, not a path expression. Keyed by the list or block the mapping hangs from.
const CONTAINER_NAME = {
  checks: r => `check '${r.name ?? '?'}'`,
  confirm: r => `confirm item '${r.text ?? r.authority ?? '?'}'`,
  sections: r => `section '${r.title ?? '?'}'`,
  artifacts: r => `artifact '${r.label ?? '?'}'`,
  open: r => `open item '${r.ref ?? '?'}'`,
  stats: r => `stats tile '${r.label ?? '?'}'`,
  components: r => `suite_strength component '${r.name ?? '?'}'`,
  survivors: r => `suite_strength survivor '${r.id ?? '?'}'`,
  fuzz: r => `suite_strength fuzz run '${r.name ?? '?'}'`,
  by_role: r => `conduct by_role '${r.role ?? '?'}'`,
  sheets: r => `resource_protocols sheet '${r.name ?? '?'}'`,
  rows: r => `deployment_decisions row '${r.name ?? '?'}'`,
  outcomes: r => `predictions outcome '${r.id ?? '?'}'`,
  unpredicted: r => `predictions unpredicted entry '${r.ref ?? '?'}'`,
}
const containerName = (key, obj, i) => CONTAINER_NAME[key]
  ? CONTAINER_NAME[key](obj)
  : `'${key}'${i === undefined ? '' : ` item ${i + 1}`}`

// A mapping whose own prose asks the reviewer to confirm something. Three ways forward, and the
// build refuses a fourth: move it to `confirm:` where it belongs, name its authority right here
// (the same two shapes, checked the same way), or declare in one line that the words are not a
// request at all. A dead declaration is refused too — `not_an_ask` on prose that reads as no
// request outlives the phrasing it excused and would silence a later edit.
//
// One declaration answers for the whole mapping, because the mapping is what an author edits:
// the `checks[]` row for its `result`, the section for its `blurb`, the artifact for its `note`,
// the survivor for its `disposition`, the record itself for its `lede`.
function checkAskDeclaration (row, asking, who, file, note = '') {
  const asks = asking.length > 0
  const declared = row.not_an_ask !== undefined

  if (declared) {
    if (row.authority !== undefined) {
      die(`${file}: ${who} carries both 'not_an_ask' and 'authority' — pick one: either the ` +
        `words are a request and it names what it rests on, or they are not (#862)`)
    }
    if (!asks) {
      die(`${file}: ${who} carries 'not_an_ask' but its text reads as no request — drop the ` +
        `declaration; it would silently excuse whatever this row is reworded into (#862)`)
    }
    if (!normQuote(row.not_an_ask)) {
      die(`${file}: ${who} has an empty 'not_an_ask' — say in one line why the words are not a ` +
        `request to the reviewer (#862)`)
    }
    return
  }
  // An authority named on a row is held to the two shapes whether or not the detector reads the
  // prose as a request — an unchecked one renders as a quote of nothing.
  if (row.authority !== undefined) { checkAuthority(row, who, file); return }
  if (row.ruling !== undefined || row.basis !== undefined) {
    die(`${file}: ${who} carries ${row.ruling !== undefined ? "'ruling'" : "'basis'"} but no ` +
      `'authority' — the field that says what the row rests on is 'authority:', and without it ` +
      `nothing of this reaches the reviewer (#845, #862)`)
  }
  if (asks) {
    die(`${file}: ${who} reads as a request to the reviewer, in '${asking.join("', '")}', and ` +
      `the check-before-ask duty is about the REQUEST, not the field it is written in or the ` +
      `list that field sits in (ADR-056 §1c, #862, #879). Three ways forward: move ` +
      `it to 'confirm:', where every item names its authority; name the authority here, on this ` +
      `row ('authority: QA-###' with the ruling quoted verbatim, or 'authority: ${NO_RULING}' ` +
      `with a 'basis' line); or, if the words are not a request at all, say so in one line with ` +
      `'not_an_ask:'${note}`)
  }
}

// The whole record, mapping by mapping (#879). Every non-exempt string — inline scalar or an
// entry of a scalar list — is read, and the mapping carrying it must declare. Recursion covers
// the fields the enumerated list never reached: `stats[].label`, `sections[].artifacts[].note`,
// `checks[].not_covered[]`, `suite_strength.survivors[].disposition`, the block summaries, and
// the record's own `lede`, `disposition` and `status_label`.
function walkAsks (obj, who, file, defaultNote = '') {
  const asking = []
  for (const [k, v] of Object.entries(obj)) {
    if (ASK_EXEMPT.has(k)) continue
    if (typeof v === 'string') { if (readsAsAsk(v)) asking.push(k) }
    else if (Array.isArray(v) && v.some(e => typeof e === 'string' && readsAsAsk(e))) asking.push(k)
  }
  const note = asking.map(k => ASK_FIELD_NOTE[k]).find(Boolean) ?? defaultNote
  checkAskDeclaration(obj, asking, who, file, note)

  for (const [k, v] of Object.entries(obj)) {
    if (ASK_EXEMPT.has(k)) continue
    if (Array.isArray(v)) {
      v.forEach((e, i) => { if (e && typeof e === 'object') walkAsks(e, containerName(k, e, i), file) })
    } else if (v && typeof v === 'object') {
      walkAsks(v, containerName(k, v), file)
    }
  }
}

// ADR-060 (#818/#840): the dossier reads the Q&A ledger when dossier.yaml names it
// (qa_ledger: <project-root-relative path>). Minimal line-scan of the strict qa-ledger/1
// format — enough for id → answer and the deferred-scope declarations; the qa-ledger
// skill's own check owns full validation.
// The ledger reader is shared with review-surface.mjs (#1012); the existence check stays here,
// because the message names dossier.yaml's own field.
function loadQaLedger (abs, file) {
  if (!existsSync(abs)) die(`dossier.yaml: qa_ledger '${file}' does not exist`)
  const ledger = readQaLedger(abs, file)
  // The ledger read in the REVERSE direction (#944, ADR-060 amendment 2026-08-23):
  // superseded id -> the later entry that declares it replaced. The verbatim comparison
  // below catches an answer that was REWORDED; it cannot catch one that was REPLACED,
  // because the quoted entry's own text never moves. Run 4's Gate-3 bounce was exactly
  // that shape -- QA-028 replaced QA-026, and a record quoting QA-026 word for word was
  // still quoting the wrong rule.
  const supersededBy = new Map()
  for (const e of ledger.entries.values()) {
    const targets = Array.isArray(e.supersedes) ? e.supersedes : e.supersedes ? [e.supersedes] : []
    for (const id of targets) if (/^QA-\d{3}$/.test(id)) supersededBy.set(id, e.id)
  }
  return { ...ledger, supersededBy }
}

// #1155 — the components the Method model declares `lifecycle: future`, read LIVE from the
// model `dossier.yaml` names. A targeted line scan, not a YAML parse: the model carries inline
// flow maps the strict subset parser refuses, and this needs exactly three fields per component
// (name, layer, lifecycle). Same technique, and the same reason, as the Design Book's reader.
// A model that is not there yet (Design has not run) is not an error — it is a project with no
// deferrals to report.
function readDeferredComponents (abs) {
  if (!existsSync(abs)) return []
  const unquote = v => {
    const t = String(v).trim()
    return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")) ? t.slice(1, -1) : t
  }
  const out = []
  let top = null; let layer = null; let comp = null
  for (const line of readFileSync(abs, 'utf8').split('\n')) {
    const topM = line.match(/^([A-Za-z_]+):/)
    if (topM) { top = topM[1]; layer = null; comp = null; continue }
    if (top !== 'components') continue
    const layerM = line.match(/^  ([a-z_]+):\s*$/)
    if (layerM) { layer = layerM[1]; comp = null; continue }
    if (/^  - id: /.test(line)) { comp = { id: line.slice(8).trim(), name: '', layer, description: '', lifecycle: 'live' }; out.push(comp); continue }
    if (!comp) continue
    const m = line.match(/^ {4}([A-Za-z_]+): (.*)$/)
    if (!m) continue
    if (m[1] === 'name') comp.name = unquote(m[2])
    else if (m[1] === 'description') comp.description = unquote(m[2])
    else if (m[1] === 'lifecycle') comp.lifecycle = unquote(m[2])
  }
  return out.filter(c => c.lifecycle === 'future')
}

// #1148 — the non-live business processes, read LIVE from the .bpd headers under the
// conventional diagrams directory. A header line-scan for the same `status` directive the
// diagram build renders as a banner — bpmn-dsl owns the grammar; the dossier needs the id,
// the state and the successor. A project without that directory has nothing to report.
function readBpStatuses (root) {
  const dg = join(root, 'docs', '02_Business', '01_Business-Processes', 'diagrams')
  if (!existsSync(dg)) return []
  const out = []
  for (const f of readdirSync(dg).filter(x => /\.bpd$/i.test(x)).sort()) {
    const src = readFileSync(join(dg, f), 'utf8')
    const st = src.match(/^\s*status\s+(dissolved|retired|parked)(?:\s*->\s*([A-Za-z_]\w*))?(?:\s+"((?:[^"\\]|\\.)*)")?/m)
    if (!st) continue
    const idm = src.match(/^@startbpmn\s+(\S+)/m)
    out.push({ bp: idm ? idm[1] : f.replace(/\.bpd$/i, ''), state: st[1], successor: st[2] || null, reason: st[3] || null })
  }
  return out
}

// ── inputs ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2).filter(a => a !== '--check')
const CHECK = process.argv.includes('--check')
if (args.length !== 1) die('usage: dossier-build <project-root> [--check]')
const ROOT = resolve(args[0])
const GATES_DIR = join(ROOT, 'docs', '04_Gates')

// Self-containment, mechanically (ADR-051 §3): a path a record cites is project-root-relative
// and stays under the project root. Absolute paths and `../` escapes are both refused.
const escapesProject = p => {
  if (!p || String(p).startsWith('/')) return true
  const rel = relative(ROOT, resolve(ROOT, String(p)))
  return rel === '' || rel.startsWith('..')
}

// …and the rule is a MECHANISM at every path the format has, not at one of them (#906). The
// predicate above was written for the conduct annex (#836) and called there and, later, for the
// resource-protocol sheets (#884) — while `checks[].source` and `sections[].artifacts[].path`, the
// two paths every record carries, were only existence-checked. So `../` and `/etc/hosts` built
// green and rendered a link out of the project: a review surface that quotes a document the gate
// cannot show, or one belonging to a different project. Every cited path goes through here now.
const refuseEscape = (p, file, who) => {
  if (p === undefined || p === null || String(p) === '') return
  if (!escapesProject(p)) return
  die(`${file}: ${who} '${p}' leaves the project, which ADR-051 §3 forbids — a dossier is a ` +
    `self-contained review surface: every path is project-root-relative and stays under the ` +
    `project root (process-specs/gate-record-format.md, self-containment)`)
}

// The run's conduct root — the directory carrying .theagent/conduct/ledger.yaml. In a conducted
// run it is the project root's ANCESTOR (the run workspace), not the project: the ledger is
// run-scoped and one run can touch several projects. Found by walking up, and used for exactly
// two things — deciding whether the conduct annex is standing at this gate, and checking that
// the record's in-project copy of a node row has not gone stale against the row it copied
// (#836). Nothing rendered on a dossier page ever points at it.
function findConductRoot (start) {
  let d = start
  for (;;) {
    if (existsSync(join(d, '.theagent', 'conduct', 'ledger.yaml'))) return d
    const up = resolve(d, '..')
    if (up === d) return null
    d = up
  }
}
const CONDUCT_ROOT = findConductRoot(ROOT)

// The gate records THIS RUN owns (#850). A conduct annex is standing at a gate because the run
// crossed that gate under ADR-056 — not because a ledger happens to sit somewhere above the
// project. The run's conduct state names the record of every gate it reached
// (process-specs/conduct-state-format.md: `passed` REQUIRES `record:`, and the runtime checks the
// file exists), so that list is the mechanical per-gate answer, and it answers the question the
// old ledger-existence check could not ask: a project whose docs/04_Gates rail carries an EARLIER
// run's gates — run 2's, blessed before ADR-056 existed — gets no red OPEN for an annex those
// gates never owed, while every gate this run crossed with no stage retro renders OPEN, which is
// the entire point of the section (ADR-056 §5).
//
// Paths are RUN-root-relative, like everything else the state file indexes: one run can touch more
// than one project.
//
// Deliberately a LINE SCAN over a file this builder does not own: conduct-state/3 admits inline
// `{maps}` that the strict parser refuses, and the run's own `conduct boot` is the fail-closed
// validator of that surface — a shape this builder cannot read must not fail a dossier build.
function conductedRecords () {
  const out = new Set()
  if (!CONDUCT_ROOT) return out
  const file = join(CONDUCT_ROOT, '.theagent', 'conduct', 'state.yaml')
  if (!existsSync(file)) return out
  let inGates = false
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    if (/^[A-Za-z_]/.test(raw)) inGates = /^gates:/.test(raw)
    if (!inGates) continue
    const m = raw.replace(/\s+#[^"']*$/, '').match(/(?:^|[\s,{])record:\s*(.*?)\s*[},]?$/)
    if (!m) continue
    const path = m[1].trim().replace(/^["'](.*)["']$/, '$1')
    if (path) out.add(resolve(CONDUCT_ROOT, path))
  }
  return out
}
const CONDUCTED_GATE_RECORDS = conductedRecords()

// The gates THIS RUN records as CROSSED, by gate id (#971). Same file, same line scan, same
// fail-open tolerance — and deliberately a second question from the one above: the conduct
// state's `passed` is the RUN's word for a crossed gate, while a record's own word is `blessed`
// (#837, two vocabularies that must not be carried into each other). A record can therefore be
// `pending` while the run it belongs to has crossed the gate — which is exactly Comanda's state
// at Contract — and the evidence rules below have to see the crossing, not the label.
function conductedPassedGates () {
  const out = new Set()
  if (!CONDUCT_ROOT) return out
  const file = join(CONDUCT_ROOT, '.theagent', 'conduct', 'state.yaml')
  if (!existsSync(file)) return out
  let inGates = false
  let cur = null
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    if (/^[A-Za-z_]/.test(raw)) { inGates = /^gates:/.test(raw); cur = null }
    if (!inGates) continue
    const head = raw.match(new RegExp(`^\\s{1,3}(${GATE_WORDS.join('|')}):\\s*(.*)$`))
    if (head) {
      cur = head[1]
      if (/status:\s*passed\b/.test(head[2])) out.add(cur)   // the inline `{status: passed}` shape
      continue
    }
    if (cur && /^\s+status:\s*passed\s*$/.test(raw.replace(/\s+#.*$/, ''))) out.add(cur)
  }
  return out
}
const CONDUCTED_PASSED_GATES = conductedPassedGates()
const CONFIG_FILE = join(GATES_DIR, 'dossier.yaml')
if (!existsSync(CONFIG_FILE)) die(`no ${relative(process.cwd(), CONFIG_FILE)} — not a dossier-enabled project`)

const config = parseYaml(readFileSync(CONFIG_FILE, 'utf8'), 'dossier.yaml')
checkFormat(config, 'dossier-config', 'dossier.yaml')
need(config, ['program', 'subject', 'tracker', 'trail_commit', 'rail'], 'dossier.yaml', 'config')
refuseEscape(config.qa_ledger, 'dossier.yaml', 'qa_ledger')
const qaLedger = config.qa_ledger ? loadQaLedger(join(ROOT, config.qa_ledger), config.qa_ledger) : null
// #1155 — optional, same shape as qa_ledger: the Method model this project's gates review.
refuseEscape(config.model, 'dossier.yaml', 'model')
const deferredComponents = config.model ? readDeferredComponents(join(ROOT, config.model)) : []
// #1148 — read from the conventional BP diagrams directory, no config key needed
const bpStatuses = readBpStatuses(ROOT)

// rail: template order + project states
const railState = new Map()
for (const r of asList(config, 'rail', 'dossier.yaml', 'config', true)) {
  need(r, ['id', 'state'], 'dossier.yaml', 'rail entry')
  if (!RAIL_DEF.some(d => d.id === r.id)) die(`dossier.yaml: unknown rail id '${r.id}'`)
  railState.set(r.id, r)
}
const rail = RAIL_DEF.map(d => {
  const s = railState.get(d.id)
  const state = s?.state ?? 'locked'
  oneOf(state, d.kind === 'gate' ? GATE_STATES : STAGE_STATES, 'dossier.yaml', `rail ${d.id} state`)
  return { ...d, state, record: s?.record }
})

// records: one per conducted gate, in rail order
const gates = []
for (const node of rail) {
  if (node.kind !== 'gate' || !node.record) continue
  const file = `docs/04_Gates/${node.record}/record.yaml`
  // A record name is a directory beside dossier.yaml, so `record: ../../elsewhere` would both
  // read and — via `${g.dir}.html` — WRITE outside the project. Same rule, same predicate.
  refuseEscape(file, 'dossier.yaml', `rail ${node.id} record`)
  const abs = join(ROOT, file)
  if (!existsSync(abs)) die(`dossier.yaml: rail ${node.id} points at '${node.record}' but ${file} is missing`)
  const rec = parseYaml(readFileSync(abs, 'utf8'), file)
  checkFormat(rec, 'gate-record', file)
  need(rec, ['gate', 'reviewer', 'status', 'status_label', 'disposition', 'lede', 'stats', 'checks', 'sections', 'open'], file, 'record')
  if (rec.gate !== node.id) die(`${file}: gate '${rec.gate}' does not match rail entry '${node.id}'`)
  checkRecordStatus(rec.status, file)
  checkBlessedDate(rec, file)
  for (const k of ['stats', 'checks', 'sections', 'open']) asList(rec, k, file, 'record', true)
  const seenCheckIds = new Set()
  for (const c of rec.checks) {
    const who = `check '${c.name ?? '?'}'`
    need(c, ['name', 'verdict'], file, who)
    oneOf(c.verdict, Object.keys(VERDICT), file, `${who} verdict`)
    if (!c.source && !c.ref) die(`${file}: ${who} needs a source path or a ref`)
    refuseEscape(c.source, file, `${who} source`)
    // The id is what a required check is recognised BY (#1071). Optional — a record may carry
    // any number of rows the gate does not require — but never repeated, because two rows
    // answering for one id means one of them is unread.
    if (c.id !== undefined) {
      if (!/^[a-z0-9-]+$/.test(String(c.id))) {
        die(`${file}: ${who} has 'id: ${c.id}' — a check id is lower-case, digits and hyphens ` +
          `(it names the command that runs the check, e.g. 'seqmap-replay') — ${GRF}`)
      }
      if (seenCheckIds.has(c.id)) {
        die(`${file}: two checks carry 'id: ${c.id}' — one row answers for an id, or the ` +
          `second row is one nobody reads`)
      }
      seenCheckIds.add(c.id)
    }
    // A WAIVER (#1071) is a review outcome, not a result: it says the check could not run, who
    // accepted that, and what would make it runnable. `result:` is refused on one — a waived
    // check produced no result, and a row carrying both would let a stale measurement pose as
    // the reason nothing was measured.
    if (c.verdict === 'waiver') {
      if (c.result !== undefined) {
        die(`${file}: ${who} is waived and also carries 'result: ${c.result}' — a waived check ` +
          `produced no result; put what could not be run into 'reason:' — ${GRF}`)
      }
      for (const [k, what] of [
        ['reason', 'why the check could not be run'],
        ['accepted_by', 'who accepted the waiver — a waiver is a review outcome, accepted by a ' +
          'named person, never an omission'],
        ['unblocked_by', 'what would make it runnable — the SA\'s #939 ruling: an expected ' +
          'failure names the thing that will remove it'],
      ]) {
        if (!normQuote(c[k] ?? '')) die(`${file}: ${who} is waived and carries no '${k}:' — ${what} (#1071)`)
      }
      continue
    }
    for (const k of ['reason', 'accepted_by', 'unblocked_by']) {
      if (c[k] !== undefined) {
        die(`${file}: ${who} carries '${k}:' but its verdict is '${c.verdict}' — those three ` +
          `fields belong to 'verdict: waiver' alone (#1071)`)
      }
    }
    if (c.result === undefined) die(`${file}: ${who} is missing 'result'`)
    if (c.not_covered !== undefined) {
      if (!Array.isArray(c.not_covered) || !c.not_covered.length || c.not_covered.some(n => !normQuote(n))) {
        die(`${file}: check '${c.name}': 'not_covered' must be a non-empty list of scope statements`)
      }
    } else if (c.verdict === 'green' && rec.status === 'pending') {
      // A GREEN row is the one a reviewer stops reading at, so it is the one that must say what
      // it did not look at (#1221). `seqmap complete` stood GREEN — 0 findings, 15 BPs, 27 SIs —
      // the evening before a stakeholder walk hit a cross-pool hand-off drawn in the .bpd, in
      // both process levels and in the SI markdown, and absent from the map the mockup walks:
      // the check measures the BINDING of SI ids and gateway edges, never the steps inside an
      // SI. Nobody lied; the row simply let 'complete' be read as 'the drawn flows are
      // implemented'. Red rows argue themselves and are exempt.
      //
      // PENDING records only, on the same footing as the carried-item rule below: a blessed
      // record is history and is not edited retroactively, and prose written into it today
      // would date a scope statement to a review that has already happened. Every record
      // passes through `pending` on its way to blessed, so the rule reaches all of them
      // forward — only the already-blessed are exempt.
      die(`${file}: check '${c.name}' is GREEN and carries no 'not_covered' — a green row must ` +
        `say what it did NOT look at, or the reviewer reads more from it than the check says ` +
        `(#1221: 'seqmap complete' measures binding, not coverage). Red rows argue themselves; ` +
        `green ones do not — ${GRF}`)
    } else if (SCORE_RE.test(String(c.result))) {
      die(`${file}: check '${c.name}' carries a score but no 'not_covered' — a bare percentage is ` +
        `refused; state what the number does not measure (ADR-060, #818)`)
    }
  }
  for (const cf of asList(rec, 'confirm', file, 'record')) checkConfirmItem(cf, file)
  for (const s of rec.sections) {
    need(s, ['title', 'blurb', 'artifacts'], file, `section '${s.title ?? '?'}'`)
    for (const a of asList(s, 'artifacts', file, `section '${s.title ?? '?'}'`, true)) {
      need(a, ['label', 'path'], file, `artifact '${a.label ?? '?'}'`)
      refuseEscape(a.path, file, `artifact '${a.label ?? '?'}' path`)
    }
  }
  for (const o of rec.open) {
    need(o, ['ref', 'state', 'text'], file, `open item '${o.ref ?? '?'}'`)
    oneOf(o.state, OPEN_STATES, file, `open item '${o.ref}' state`)
  }
  if (rec.suite_strength !== undefined) checkSuiteStrength(rec.suite_strength, file)
  if (rec.resource_protocols !== undefined) checkResourceProtocols(rec.resource_protocols, file)
  if (rec.deployment_decisions !== undefined) checkDeploymentDecisions(rec.deployment_decisions, file)
  if (rec.conduct !== undefined) checkConductAnnex(rec.conduct, file)
  // The gate-entry prediction sheet (#941), when one sits beside the record — and the annex's
  // diff over it, held to totality: every sheet row dispositioned exactly once, no outcome
  // without a row. The diff must read the sheet BESIDE the record it hangs from, so a record
  // cannot quietly diff another gate's predictions.
  const predFile = `docs/04_Gates/${node.record}/predictions.yaml`
  let predictions = null
  if (existsSync(join(ROOT, predFile))) {
    predictions = parseYaml(readFileSync(join(ROOT, predFile), 'utf8'), predFile)
    checkPredictionSheet(predictions, predFile, node.id)
  }
  const pd = rec.conduct?.predictions
  if (pd) {
    if (!predictions) {
      die(`${file}: the conduct annex diffs a prediction sheet but ${predFile} does not exist — ` +
        `the diff reads the sheet beside the record (#941)`)
    }
    if (resolve(ROOT, pd.sheet) !== resolve(ROOT, predFile)) {
      die(`${file}: conduct predictions sheet '${pd.sheet}' is not the sheet beside this record ` +
        `(${predFile}) — a gate diffs its own entry sheet`)
    }
    const rowIds = new Set(predictions.rows.map(r => r.id))
    const seen = new Set()
    for (const o of pd.outcomes) {
      if (!rowIds.has(o.id)) die(`${file}: predictions outcome '${o.id}' matches no row of ${predFile}`)
      if (seen.has(o.id)) die(`${file}: predictions outcome '${o.id}' appears twice — one disposition per row`)
      seen.add(o.id)
    }
    for (const id of rowIds) {
      if (!seen.has(id)) {
        die(`${file}: prediction row '${id}' has no outcome — the diff is total: every row is ` +
          `dispositioned (${Object.keys(PREDICTION_OUTCOME).join('|')}), including the risks that came to nothing`)
      }
    }
  }
  // The check-before-ask duty over the WHOLE record, not a named few fields (#879). Last, so a
  // structural failure above is reported before a prose one.
  walkAsks(rec, 'the record', file, RECORD_ASK_NOTE)
  gates.push({ node, rec, dir: node.record, file, predictions, predFile })
}
if (!gates.length) die('dossier.yaml: no rail gate carries a record')

// ADR-060 (#818): nothing crosses a gate quietly. On every PENDING gate record —
// blessed records are history and are not edited retroactively —
//   1. each deferred-scope ruling in the ledger appears among the open items (it
//      re-surfaces at every gate until its step is drawn, #840's other half), and
//   2. each item still 'open' on an earlier gate's record re-appears (open, or closed
//      with its closure shown). Run 4 carried items by hand-retyping and the owner had
//      to demand it verbally; now the build enforces it.
for (let i = 0; i < gates.length; i++) {
  const g = gates[i]
  if (g.rec.status !== 'pending') continue
  const refs = new Set(g.rec.open.map(o => o.ref))
  for (const d of qaLedger?.deferred ?? []) {
    if (!d.ref) continue
    if (!refs.has(d.ref)) {
      die(`${g.file}: pending gate does not carry deferred-scope ruling ${d.id} (${d.ref}) — ` +
        `a deferred ruling re-surfaces on every gate record until its step is drawn (ADR-060)`)
    }
  }
  for (let j = 0; j < i; j++) {
    for (const o of gates[j].rec.open) {
      if (o.state === 'open' && !refs.has(o.ref)) {
        die(`${g.file}: open item ${o.ref} from gate '${gates[j].node.id}' is not carried — ` +
          `restate it; open items never drop silently between gates (ADR-060, #818)`)
      }
    }
  }
}

// ── filesystem scan ─────────────────────────────────────────────────────────

const problems = []

// Gate-blocking findings (#971) — a different animal from `problems` above, and reported
// separately for a reason. A `problem` says the dossier cannot be BUILT (a cited path is not on
// disk, a node row has drifted): the build refuses to write anything. A gate block says the
// PAGES ARE CURRENT AND THE GATE IS NOT — evidence a crossed gate owes and does not have. Those
// must still render, because the rendering is the surface the owed act is performed against
// (#969): a check that hid the review surface until the review happened would be a deadlock.
// So the pages are written or compared first, and the run exits 1 afterwards, naming the debt.
const gateBlocks = []

function listFiles (dir, ext, depth) {
  const out = []
  const walk = (d, level) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.') || e.name === 'bin' || e.name === 'obj') continue
      const p = join(d, e.name)
      if (e.isDirectory()) {
        if (depth === undefined || level < depth) walk(p, level + 1)
      } else if (!ext || e.name.endsWith(ext)) out.push(p)
    }
  }
  walk(dir, 0)
  return out
}

// The in-project node-row copy the conduct annex cites (#836): it must exist, it must BE a
// session-metrics node row, and — when the run's ledger is reachable from here — it must
// still be byte-identical to the row it copied. The copy is what makes the annex satisfy
// ADR-051 §3; this check is what keeps "copy" from quietly meaning "stale copy", which is the
// drift a hand-fixed run-4 node row already cost once. A project checked out on its own has
// no reachable ledger and skips the comparison rather than failing on it.
function conductSourceProblems (ca, owner) {
  const out = []
  const abs = join(ROOT, ca.source)
  if (!existsSync(abs)) return [`${owner}: missing conduct annex source: ${ca.source}`]
  const copy = readFileSync(abs, 'utf8')
  // VERSION-AGNOSTIC ON PURPOSE. The copy has to be byte-identical to the live row (checked
  // below), and the live row's version moves when the format moves — session-metrics/2 -> /3
  // with #1154. Pinning a version here would fail every dossier in the window between a format
  // bump and a re-cut, over a difference the byte-identity check already governs.
  if (!/^format: session-metrics\/\d+\s*$/m.test(copy) || !/^kind: node\s*$/m.test(copy)) {
    out.push(`${owner}: conduct annex source ${ca.source} is not a session-metrics node row`)
  }
  if (CONDUCT_ROOT) {
    const row = join(CONDUCT_ROOT, '.theagent', 'conduct', 'metrics', `node-${ca.node}.yaml`)
    if (!existsSync(row)) {
      out.push(`${owner}: conduct annex names ${ca.node}, for which the run's ledger carries no row`)
    } else if (readFileSync(row, 'utf8') !== copy) {
      out.push(`${owner}: conduct annex source ${ca.source} has drifted from the run's node-${ca.node} row ` +
        `— it is a copy, not an edit; re-copy it (#836)`)
    }
  }
  return out
}

// The confirm-shaped-ask rule off the rail (#862, #879), at the sweep's own resolution: a LINE
// READ, because an off-rail record may use a YAML shape the strict parser refuses, and a sweep
// that is the only reader of those files must not turn a shape it cannot read into a build
// failure. EVERY value the record writes — every `key: value`, inline or a folded/literal block,
// and every entry of a scalar list — is read for a confirm-shaped ask, minus the exempt keys, and
// whatever carries an asking value must declare `authority:` or `not_an_ask:`. PRESENCE ONLY:
// which of the two authority shapes it is, and whether a quote matches the ledger word for word,
// answer to the strict parser, which an off-rail record never reaches. The rule itself is
// process-wide — it guards the reviewer's scarcest resource, and a record that asked an
// unauthorised question asked it whichever run's rail it hangs from.
//
// The carrier is found the way an author sees it. A `- ` marker two columns left of the key means
// a LIST ROW (a `checks[]` row, an `open[]` item, a `sections[]` section — #873) and the
// declaration may sit anywhere inside the item, including after its artifacts. With no such
// marker the carrier is the MAPPING BLOCK at the key's own column — the `conduct:` annex, the
// `suite_strength:` block, or, at column zero, the RECORD, whose `lede` and `disposition` have no
// row to carry anything (#879). There the declaration is a key of that same block, at that column.
const indentOf = l => l.match(/^ */)[0].length
const isContent = l => l.trim() !== '' && !/^\s*#/.test(l)

// Every value on a line, with the column its carrier sits at: `key: value` (a leading `- ` puts
// the key two columns right of the marker), and a bare `- scalar`, whose carrier is the mapping
// holding the list — two columns left of the entry.
function askCandidates (lines) {
  const out = []
  for (let i = 0; i < lines.length; i++) {
    if (!isContent(lines[i])) continue
    const kv = lines[i].match(/^( *)(- )?([A-Za-z_][A-Za-z0-9_]*):(.*)$/)
    if (kv) {
      const col = kv[1].length + (kv[2] ? 2 : 0)
      let value = kv[4].trim()
      if (value === '') continue // opens a nested block; the values inside are read on their own
      if (/^[>|][-+]?$/.test(value)) {
        value = ''
        for (let j = i + 1; j < lines.length; j++) {
          if (!isContent(lines[j])) continue
          if (indentOf(lines[j]) <= col) break
          value += ' ' + lines[j].trim()
        }
      }
      out.push({ i, col, key: kv[3], what: `'${kv[3]}'`, value })
      continue
    }
    const entry = lines[i].match(/^( *)- +(?![A-Za-z_][A-Za-z0-9_]*:)(.*)$/)
    if (!entry) continue
    const col = entry[1].length - 2
    if (col < 0) continue
    // The key holding the list: the nearest line at the carrier's column, above.
    let key = '?'
    for (let j = i - 1; j >= 0; j--) {
      if (!isContent(lines[j])) continue
      const ind = indentOf(lines[j])
      if (ind > col) continue
      if (ind < col) break
      const m = lines[j].match(/^ *(?:- )?([A-Za-z_][A-Za-z0-9_]*):/)
      if (m) key = m[1]
      break
    }
    out.push({ i, col, key, what: `'${key}' entry`, value: entry[2].trim() })
  }
  return out
}

const DECL_ANYWHERE = /^ *(?:- )?(?:authority|not_an_ask):/

function askRowProblems (text, file) {
  const out = []
  const lines = text.split('\n')
  for (const c of askCandidates(lines)) {
    if (ASK_EXEMPT.has(c.key)) continue
    if (!readsAsAsk(c.value.replace(/^["'](.*)["']$/, '$1'))) continue

    // The enclosing list item: its '- ' marker sits two columns left of the carrier's column.
    let start = -1
    for (let j = c.i; j >= 0; j--) {
      if (!isContent(lines[j])) continue
      const ind = indentOf(lines[j])
      if (ind === c.col - 2 && /^ *- /.test(lines[j])) { start = j; break }
      if (ind < c.col - 2) break
    }

    let declared = false
    let kind
    if (start >= 0) {
      kind = c.key === 'blurb' ? 'section' : 'row'
      for (let j = start; j < lines.length && !declared; j++) {
        if (!isContent(lines[j])) continue
        if (j > start && indentOf(lines[j]) <= c.col - 2) break
        declared = DECL_ANYWHERE.test(lines[j])
      }
    } else {
      // A mapping block, or the record itself at column zero: the declaration is one of its own
      // keys, at its own column.
      kind = c.col === 0 ? 'record' : 'block'
      const decl = new RegExp(`^ {${c.col}}(?:authority|not_an_ask):`)
      for (let j = c.i; j >= 0 && !declared; j--) {
        if (!isContent(lines[j])) continue
        if (indentOf(lines[j]) < c.col) break
        declared = decl.test(lines[j])
      }
      for (let j = c.i + 1; j < lines.length && !declared; j++) {
        if (!isContent(lines[j])) continue
        if (indentOf(lines[j]) < c.col) break
        declared = decl.test(lines[j])
      }
    }

    if (!declared) {
      out.push(`${file}:${c.i + 1}: this ${c.what} reads as a request to the reviewer but the ` +
        `${kind} ` +
        `names no authority — the check-before-ask duty is about the REQUEST, not the field it ` +
        `is written in or the list that field sits in (ADR-056 §1c, #862, #879). Move it to ` +
        `'confirm:', or add 'authority:' (a ruling id ` +
        `with its verbatim quote, or '${NO_RULING}' with a 'basis'), or declare with ` +
        `'not_an_ask:' in one line that the words are not a request` +
        (c.key === 'blurb' ? SECTION_ASK_NOTE : kind === 'record' ? RECORD_ASK_NOTE : ''))
    }
  }
  return out
}

// Every gate record in the project, on the rail or off it. The rail carries the run whose
// dossiers this project renders; a project that has run the process more than once keeps the
// other runs' records elsewhere under docs/ (run 4 kept its own under docs/run4/gates/), and
// those are gate records too. Only the CLOSED VOCABULARIES and the self-containment rule are
// checked here — the full record schema answers to a rail, and an off-rail record answers to
// its own run's — but those two rules are process-wide, and both of them drifted unseen for a
// whole run precisely because nothing off the rail was ever read (#836, #837).
//
// Deliberately a LINE SCAN, not the strict parser: an off-rail record may use a YAML shape the
// parser refuses (the run-3 reservations records fold their disposition), and a sweep that is
// the only reader of those files must not turn a shape it cannot read into a build failure.
// The two rules it enforces are readable from the lines themselves.
const topLevel = (text, key) => {
  const m = text.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'))
  return m ? m[1].trim().replace(/^["'](.*)["']$/, '$1') : undefined
}

function sweepOffRailRecords (railFiles) {
  const docs = join(ROOT, 'docs')
  if (!existsSync(docs)) return
  for (const abs of listFiles(docs, 'record.yaml')) {
    if (railFiles.has(abs)) continue
    const text = readFileSync(abs, 'utf8')
    if (!/^format: gate-record\//m.test(text)) continue
    const file = posix.join(...relative(ROOT, abs).split(sep))
    checkFormat({ format: topLevel(text, 'format') }, 'gate-record', file)
    const status = topLevel(text, 'status')
    if (status === undefined) die(`${file}: record is missing 'status'`)
    checkRecordStatus(status, file)
    problems.push(...askRowProblems(text, file))
    // Self-containment on every path the record carries, read off the lines that carry them
    // (#906). The sweep's own comment already claimed this rule; before #906 it enforced it for
    // the conduct annex alone. Values are taken verbatim — a trailing `# note` cannot hide an
    // escape, because an escape is visible in the value's first two characters or its leading `/`.
    for (const m of text.matchAll(/^[ \t]*(?:-[ \t]+)?(path|source|model):[ \t]*(\S.*?)[ \t]*$/gm)) {
      refuseEscape(normQuote(m[2]).replace(/^["'](.*)["']$/, '$1'), file, m[1])
    }
    // the conduct annex's own two fields, read out of the block
    const block = text.match(/^conduct:\n((?:[ \t].*\n|\n)*)/m)
    if (block) {
      const src = topLevel(block[1], '  source')
      const node = topLevel(block[1], '  node')
      if (src && node) {
        if (escapesProject(src)) {
          die(`${file}: conduct source '${src}' leaves the project, which ADR-051 §3 forbids. ` +
            `The conduct ledger is run-scoped and lives above the project: copy the node row ` +
            `into the project at gate exit and cite the copy (#836)`)
        }
        problems.push(...conductSourceProblems({ source: src, node }, file))
      }
    }
  }
}
sweepOffRailRecords(new Set(gates.map(g => resolve(ROOT, g.file))))

function scanArtifact (a, owner) {
  const abs = join(ROOT, a.path)
  if (!existsSync(abs)) { problems.push(`${owner}: missing artifact path: ${a.path}`); return { missing: true } }
  if (statSync(abs).isFile()) return { count: 1, breakdown: '' }
  const depth = a.depth === undefined ? undefined : parseInt(a.depth, 10)
  const files = listFiles(abs, a.ext, depth)
  if (!files.length) problems.push(`${owner}: no files matched in ${a.path} (ext ${a.ext ?? 'any'})`)
  const byExt = new Map()
  for (const f of files) {
    const e = f.slice(f.lastIndexOf('.'))
    byExt.set(e, (byExt.get(e) ?? 0) + 1)
  }
  const breakdown = [...byExt.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([e, n]) => `${n} ${e}`).join(' · ')
  return { count: files.length, breakdown: byExt.size > 1 ? breakdown : '' }
}

// ── rendering ───────────────────────────────────────────────────────────────

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const OUT = GATES_DIR
const href = p => posix.join(...relative(OUT, join(ROOT, p)).split(sep))
// Only the project's docs tree is a served/linkable surface; everything else
// (model store, code) is existence-checked but rendered as text.
const servable = p => p === 'docs' || p.startsWith('docs/')

function pathCell (p) {
  return servable(p)
    ? `<a class="path" href="${esc(href(p))}">${esc(p)}</a>`
    : `<span class="path unserved" title="on disk, outside the docs-served surface">${esc(p)}</span>`
}

function refCell (ref) {
  const m = String(ref).match(/^#(\d+)$/)
  return m
    ? `<a class="ref" href="${esc(`${config.tracker.replace(/\/$/, '')}/${m[1]}`)}">${esc(ref)}</a>`
    : `<span class="ref">${esc(ref)}</span>`
}

const chip = v => { const x = VERDICT[v]; return `<span class="chip ${x.cls}"><span class="dot"></span>${x.word}</span>` }

function railHtml (currentGateId) {
  const items = rail.map(n => {
    const cur = currentGateId && n.id === currentGateId ? ' cur' : ''
    const node = n.kind === 'gate'
      ? `<span class="node gate ${n.state}${cur}" title="Gate — ${esc(n.name)}"></span>`
      : `<span class="node stage ${n.state}" title="Stage ${esc(n.id)} — ${esc(n.name)}"></span>`
    const body = `${node}<span class="rail-label">${esc(n.id)}<em>${esc(n.name)}</em></span>`
    return n.record ? `<a class="rail-item" href="${esc(n.record)}.html">${body}</a>` : `<span class="rail-item">${body}</span>`
  })
  return `<nav class="rail" aria-label="Diamond Process rail">${items.join('<span class="rail-link" aria-hidden="true"></span>')}</nav>`
}

// The vendored Mermaid viewer travels with the dossier so a gate page stays file://-viewable
// with no CDN (ADR-053, the design book's own arrangement). It ships in the design-book skill's
// assets — one copy per install, both skills being one plugin — and the dossier writes it beside
// its pages only when a page actually carries a diagram; when it does not, the orphan sweep
// takes the stale copy away. Every tracked copy is held to that one original by
// `just vendored-asset-check` (#976).
//
// A MISSING VIEWER IS A BROKEN INSTALL, NOT A DEGRADED MODE (SA ruling 2026-08-23, #976). This
// used to fall back to leaving the diagram source standing as text, on the reasoning that an ER
// diagram nobody can render is still a schema a reviewer can read. True, and beside the point:
// the fallback made the generated bytes depend on which OTHER skill happened to be installed, so
// `--check` in one install compared against a different page than in another, and the staleness
// gate this builder rests on stopped meaning one thing. The build now stops and names the fix.
const MERMAID_CANDIDATES = [
  join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'mermaid.min.js'),
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'design-book', 'assets', 'mermaid.min.js'),
]
const MERMAID_ASSET = MERMAID_CANDIDATES.find(p => existsSync(p))

function requireMermaid () {
  if (MERMAID_ASSET) return MERMAID_ASSET
  die(
    'a gate page carries a diagram and the vendored Mermaid viewer is not installed.\n' +
    '  Looked in:\n' + MERMAID_CANDIDATES.map(p => `    ${p}\n`).join('') +
    '  The viewer ships in the `design-book` skill\'s assets; `gate-dossier` and `design-book`\n' +
    '  are one plugin, so this normally means a partial install — reinstall the plugin, or run\n' +
    '  `theagent2 sync` in a checkout that has it.\n' +
    '  The build stops rather than emitting the diagram as text: a page whose bytes depend on\n' +
    '  which other skill is installed would make `--check` mean two different things (#976).')
}

const MERMAID_BOOT = `
<script src="mermaid.min.js"></script>
<script>
mermaid.initialize({ startOnLoad: false, theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'neutral' })
// Render only visible diagrams — one measured inside a closed <details> comes out zero-width —
// and catch the rest as the disclosures open.
const renderVisible = () => mermaid.run({
  nodes: [...document.querySelectorAll('pre.mermaid:not([data-processed])')].filter(el => el.offsetParent !== null)
})
renderVisible()
for (const d of document.querySelectorAll('details')) d.addEventListener('toggle', renderVisible)
</script>`

function pageHtml (title, body) {
  const boot = body.includes('class="mermaid"') ? (requireMermaid(), MERMAID_BOOT) : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
${body}
<footer class="prov">
  <p><strong>Generated file — do not edit.</strong> Built by the <code>gate-dossier</code> skill (ADR-051)
  from <code>docs/04_Gates/dossier.yaml</code> and the gate records, plus a live scan of the project tree
  (every artifact row is existence-checked and counted at build time).</p>
  <p>Regenerate: <code>dossier-build &lt;project-root&gt;</code> &nbsp;·&nbsp; drift guard: <code>--check</code>
  &nbsp;·&nbsp; trail commit <code>${esc(config.trail_commit)}</code>
  &nbsp;·&nbsp; status authority: the gate records + <a href="${esc(config.tracker)}">the project tracker</a></p>
</footer>
</div>${boot}
</body>
</html>
`
}

function suiteStrengthHtml (g) {
  const ss = g.rec.suite_strength
  const standing = SUITE_STRENGTH_GATES.includes(g.node.id)
  if (!ss && !standing) return ''

  const head = `
  <section class="card">
    <h2>Suite strength — measured kill power</h2>
    <p class="blurb">${esc(SUITE_STRENGTH_BLURB)}</p>`

  if (!ss) {
    return `${head}
    <p class="ss-missing">${chip('red')} ${esc(SUITE_STRENGTH_MISSING)}</p>
  </section>`
  }

  const provenance = `
    <p class="ss-src">Source: ${pathCell(ss.source)}${ss.ref ? ` ${refCell(ss.ref)}` : ''}</p>`

  if (ss.waiver) {
    return `${head}
    <p class="ss-missing">${chip('info')} ${esc(ss.waiver)}</p>${provenance}
  </section>`
  }

  const rows = ss.components.map(c => {
    const budget = [c.mutants && `${c.mutants} mutants`, c.killed && `${c.killed} killed`,
      c.survived !== undefined && `${c.survived} survived`].filter(Boolean).join(' · ')
    return `
      <tr>
        <th scope="row">${esc(c.name)}${c.model ? `<div class="note">${esc(c.model)}</div>` : ''}</th>
        <td class="c-count"><span class="count">${esc(c.score)}</span></td>
        <td>${esc(budget)}${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}${askAuthorityCell(c)}</td>
        <td>${esc(c.wall ?? '')}</td>
        <td>${chip(c.verdict)}</td>
      </tr>`
  }).join('')

  const survivors = (ss.survivors ?? []).map(s => `
      <li class="open-item s-${esc(s.state)}"><span class="ref">${esc(s.id)}</span>
      <span class="state">${esc(s.state.toUpperCase())}</span> ${esc(s.disposition)}${s.ref ? ` ${refCell(s.ref)}` : ''}${askAuthorityCell(s)}</li>`).join('')

  const fuzz = (ss.fuzz ?? []).map(f => `
      <tr>
        <th scope="row">${esc(f.name)}</th>
        <td>${esc(f.result)}${askAuthorityCell(f)}</td>
        <td>${chip(f.verdict ?? 'info')}</td>
      </tr>`).join('')

  return `${head}
    ${ss.summary ? `<p class="ss-sum">${esc(ss.summary)}</p>` : ''}${askAuthorityCell(ss)}
    ${(ss.not_covered ?? []).map(n => `<p class="notcov">not covered: ${esc(n)}</p>`).join('\n    ')}
    <div class="tblwrap"><table>
      <thead><tr><th>Component (reference model as SUT)</th><th>Score</th><th>Mutation budget</th><th>Wall</th><th>Verdict</th></tr></thead>
      <tbody>${rows}
      </tbody>
    </table></div>
    <h3>Survivor dispositions</h3>
    ${survivors
      ? `<ul class="open-list">${survivors}\n    </ul>`
      : '<p class="blurb">No surviving mutant left undispositioned.</p>'}
    <h3>Fuzz findings</h3>
    ${fuzz
      ? `<div class="tblwrap"><table>
      <thead><tr><th>Run</th><th>Result</th><th>Verdict</th></tr></thead>
      <tbody>${fuzz}
      </tbody>
    </table></div>`
      : '<p class="blurb">No fuzz run recorded.</p>'}${provenance}
  </section>`
}

// ── the sheet, rendered (ADR-059 review surface, #969) ─────────────────────
// The SA's ruling of 2026-08-23: the human reviews the TABLE DESIGN and WHICH USE CASES MAY
// DELETE DATA, and never a C# type. A 26 kB nested-YAML sheet is not a schema review at gate
// speed, so the gate page renders the sheet's own words three ways — an ER diagram, a plain
// column table, and one line per use case that may invoke a destructive seam operation. The
// sheet stays the single source: nothing here is authored twice into the record (ADR-059 — the
// review and the enforcement read the same file).

// The danger classes — the effect classes that DESTROY content already stored — are not
// declared here (#977). They come from the one table the sheet's own `--check` reports from,
// `sns-cli/bin/resource-danger.mjs`, so the list the reviewer reads on this page and the list the
// checker prints are the same list; a second copy would be a mirror nothing checks. Loaded
// through a guarded dynamic import rather than a bare `import`, because a missing sibling skill
// must produce a sentence a reader can act on instead of a module-resolution stack trace.
const RESOURCE_DANGER = await (async () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, 'resource-danger.mjs'),
    join(here, '..', '..', 'sns-cli', 'bin', 'resource-danger.mjs'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return import(pathToFileURL(c).href)
  }
  die('the resource-protocol danger classes are missing: none of ' +
    candidates.map(c => relative(process.cwd(), c)).join(', ') + ' exists. That module is the ' +
    'single source of "which effect classes destroy stored data" (#977), shared with ' +
    '`resource-protocol.mjs --check`; the gate page cannot answer "what can delete data" ' +
    'without it. Install the sns-cli skill beside this one, or run `theagent2 sync`.')
})()

// Mermaid ER attribute types are identifiers: `numeric(10,2)` renders as `numeric_10_2`, and the
// exact declared type stands unaltered in the column table below the diagram.
const erToken = s => String(s ?? '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'unnamed'
const erLabel = s => String(s ?? '').replace(/[;"]/g, ' ').replace(/\s+/g, ' ').trim()
const isTruthy = v => v === true || v === 'true' || v === 'yes'
const asArray = v => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v])

// FOREIGN KEY (a, b) REFERENCES parent (x, y) — the one constraint shape that carries a relation.
const FK_RE = /FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?/i

/** The shape section as one Mermaid erDiagram (ADR-053: Mermaid, never PlantUML). */
function erDiagram (shape) {
  const entities = asArray(shape?.tables).length
    ? asArray(shape.tables).map(t => ({ name: t?.name, columns: asArray(t?.columns), constraints: asArray(t?.constraints) }))
    : asArray(shape?.collections).map(c => ({
        name: c?.name,
        columns: asArray(c?.fields ?? c?.document ?? c?.columns),
        constraints: asArray(c?.constraints),
      }))
  if (!entities.length || !entities.some(e => e.name)) return ''

  const fkCols = new Map()   // table -> Set(column)
  const rels = []
  for (const e of entities) {
    if (!e.name) continue
    for (const c of e.constraints) {
      const m = FK_RE.exec(String(c))
      if (!m) continue
      const cols = m[1].split(',').map(x => x.trim()).filter(Boolean)
      if (!fkCols.has(e.name)) fkCols.set(e.name, new Set())
      for (const col of cols) fkCols.get(e.name).add(col)
      rels.push(`  ${erToken(m[2])} ||--o{ ${erToken(e.name)} : "${erLabel(cols.join(', '))}"`)
    }
  }

  const blocks = entities.filter(e => e.name).map(e => {
    const attrs = e.columns.map(c => {
      const key = String(c?.key ?? '')
      const marks = []
      if (/^primary/i.test(key)) marks.push('PK')
      else if (/^unique/i.test(key)) marks.push('UK')
      if (fkCols.get(e.name)?.has(c?.name)) marks.push('FK')
      const notes = [
        isTruthy(c?.nullable) ? 'nullable' : '',
        /^primary\s*\(/i.test(key) ? key : '',
      ].filter(Boolean).join(' · ')
      return `    ${erToken(c?.type ?? 'text')} ${erToken(c?.name)}${marks.length ? ` ${marks.join(', ')}` : ''}` +
        (notes ? ` "${erLabel(notes)}"` : '')
    }).join('\n')
    return `  ${erToken(e.name)} {\n${attrs}\n  }`
  })

  return ['erDiagram', ...blocks, ...[...new Set(rels)].sort()].join('\n')
}

/** One plain column table per table/collection — what the diagram compresses, in full. */
function shapeTablesHtml (shape) {
  const tables = asArray(shape?.tables).length ? asArray(shape.tables) : asArray(shape?.collections)
  if (!tables.length) return ''
  return tables.map(t => {
    const cols = asArray(t?.columns ?? t?.fields ?? t?.document)
    const rows = cols.map(c => `
      <tr>
        <th scope="row">${esc(c?.name ?? '')}</th>
        <td><code>${esc(c?.type ?? '')}</code></td>
        <td>${isTruthy(c?.nullable) ? 'nullable' : 'NOT NULL'}</td>
        <td>${esc(c?.key ?? '')}</td>
        <td>${esc(c?.note ?? '')}</td>
      </tr>`).join('')
    const constraints = asArray(t?.constraints).map(c => `<li><code>${esc(c)}</code></li>`).join('')
    return `
    <h4 class="rp-table">${esc(t?.name ?? '(unnamed)')}</h4>
    <div class="tblwrap"><table>
      <thead><tr><th>Column</th><th>Type</th><th>Null</th><th>Key</th><th>Note</th></tr></thead>
      <tbody>${rows}
      </tbody>
    </table></div>
    ${constraints ? `<ul class="rp-constraints">${constraints}</ul>` : ''}`
  }).join('')
}

/**
 * Section 5 — what this seam ANSWERS instead of rethrowing (#999, ADR-061 decision 8). The
 * reviewer's question here is the one an implementor must not decide alone: which raised fault
 * class becomes result data, for which operation, into which field. Rendered beside the shape
 * because that is where the answer lands. A sheet with no rows says so in one line: an absent
 * section is a design statement ("this seam only rethrows"), never a gap in the rendering.
 */
function faultsHtml (sheet) {
  const rows = asArray(sheet?.faults).filter(r => r && typeof r === 'object')
  if (!rows.length) {
    return `
    <h4 class="rp-table">Answerable faults</h4>
    <p class="note">None declared: this seam classifies, retries and <strong>rethrows</strong>
    everything it cannot answer.</p>`
  }
  const body = rows.map(r => `
      <tr>
        <th scope="row"><code>${esc(r.identity ?? '')}</code></th>
        <td>${esc(r.op ?? '')}</td>
        <td>${asArray(r.answers).map(a => `<code>${esc(a)}</code>`).join(', ')}</td>
        <td>${esc(r.note ?? '')}</td>
      </tr>`).join('')
  return `
    <h4 class="rp-table">Answerable faults — everything else rethrows</h4>
    <div class="tblwrap"><table>
      <thead><tr><th>Fault identity</th><th>Answered by</th><th>Into</th><th>Why</th></tr></thead>
      <tbody>${body}
      </tbody>
    </table></div>`
}

/** The kinds whose shape is a list rather than a schema: REST endpoints, files. */
function shapeListHtml (shape) {
  const kind = asArray(shape?.endpoints).length ? 'endpoints' : asArray(shape?.files).length ? 'files' : null
  if (!kind) return ''
  const member = m => (m && typeof m === 'object' ? m.name ?? JSON.stringify(m) : m)
  const content = e => {
    const layout = e?.layout
    if (Array.isArray(layout)) return layout.map(member).filter(Boolean).join(' · ')
    return layout ?? e?.purpose ?? e?.note ?? ''
  }
  const rows = asArray(shape[kind]).map(e => `
      <tr>
        <th scope="row">${esc(e?.method ? `${e.method} ${e.path ?? ''}` : e?.path ?? e?.name ?? '')}</th>
        <td>${esc(content(e))}${e?.purpose && e?.layout ? `<div class="note">${esc(e.purpose)}</div>` : ''}</td>
      </tr>`).join('')
  return `
    <div class="tblwrap"><table>
      <thead><tr><th>${kind === 'endpoints' ? 'Call the system may issue' : 'File'}</th><th>Purpose / layout</th></tr></thead>
      <tbody>${rows}
      </tbody>
    </table></div>`
}

/**
 * One short line per use case allowed to invoke a seam operation that DESTROYS stored content —
 * the half the SA asked for by name: what can wipe data. Derived, never authored: the sheet's
 * `operations` effect annotations crossed with its `allow` lists, with the danger classes read
 * from the one table the checker reports from (#977). The kind comes from the sheet's own shape
 * vocabulary; a sheet whose shape names no kind this format knows falls back to the union of
 * every kind's danger classes, because "I could not tell" must not render as "nothing here can
 * wipe data".
 */
function dangerEffectLines (sheet) {
  const kind = RESOURCE_DANGER.kindOfShape(sheet?.shape)
  const destructive = asArray(sheet?.operations).filter(o => RESOURCE_DANGER.isDangerEffect(o?.effect, kind))
  if (!destructive.length) return []
  const out = []
  for (const op of destructive) {
    const on = asArray(op?.on).join(', ')
    const callers = asArray(sheet?.allow).filter(a => asArray(a?.ops).includes(op?.op))
    if (!callers.length) {
      out.push({ who: '', op: op?.op, effect: op?.effect, on, note: op?.note, orphan: true })
      continue
    }
    for (const a of callers) {
      const who = String(a?.useCase ?? '')
      out.push({
        who: who.startsWith('_') ? `${who} (declared non-use-case entry point)` : `${who}${a?.name ? ` ${a.name}` : ''}`,
        op: op?.op,
        effect: op?.effect,
        on,
        note: op?.note,
      })
    }
  }
  return out
}

/** Everything #969 renders for one reviewed sheet, from the sheet itself. */
function sheetDesignHtml (sh) {
  const sheet = readSheet(sh.path)
  if (!sheet) {
    return `<p class="notcov">${esc(sh.name)}: the sheet could not be read for rendering — review it at
      ${pathCell(sh.path)} and see <code>just resource-protocol-check</code>.</p>`
  }
  const shape = sheet.shape ?? {}
  const er = erDiagram(shape)
  const tables = shapeTablesHtml(shape)
  const list = shapeListHtml(shape)
  const counts = [
    asArray(shape.tables).length ? `${asArray(shape.tables).length} tables` : '',
    asArray(shape.collections).length ? `${asArray(shape.collections).length} collections` : '',
    asArray(shape.endpoints).length ? `${asArray(shape.endpoints).length} endpoints` : '',
    asArray(shape.files).length ? `${asArray(shape.files).length} files` : '',
    sheet.seam ? `seam ${sheet.seam}` : '',
  ].filter(Boolean).join(' · ')

  const shapeBody = er || tables || list
    ? `${er ? `<figure><pre class="mermaid">${esc(er)}</pre></figure>` : ''}${tables}${list}`
    : `<p class="notcov">This sheet carries no <code>shape:</code> section — nothing of the resource
       design is on the review surface. Author it (resource-protocol-format.md §1) or the reviewer
       is blessing an invisible schema.</p>`
  const body = `${shapeBody}${faultsHtml(sheet)}`

  return `
    <details class="rp-shape">
      <summary>${esc(sh.name)}${counts ? ` — ${esc(counts)}` : ''}</summary>
      ${body}
    </details>`
}

// #1155 — one panel, identical on every gate page, listing what the design deferred. No
// per-gate state and no red: a deferral is a fact about the design, not an obligation somebody
// owes. Renders only when there is at least one, so a project that defers nothing gains no
// empty section.
function deferredComponentsHtml () {
  if (!deferredComponents.length) return ''
  const rows = deferredComponents.map(c => `
      <tr>
        <th scope="row">${esc(c.name)}</th>
        <td>${esc(c.layer ?? '')}</td>
        <td>${esc(c.description ?? '')}</td>
      </tr>`).join('')
  return `
  <section class="card">
    <h2>Declared deferrals — decided, not built yet</h2>
    <p class="blurb">${esc(DEFERRED_COMPONENTS_BLURB)}</p>
    <div class="tblwrap"><table>
      <thead><tr><th>Component</th><th>Layer</th><th>What it is for</th></tr></thead>
      <tbody>${rows}
      </tbody>
    </table></div>
  </section>`
}

// #1148 — the non-live processes panel, sibling of the deferred-components one. Renders only
// when a .bpd actually declares a status, so a project with fifteen live processes gains nothing.
function processLifecycleHtml () {
  if (!bpStatuses.length) return ''
  const rows = bpStatuses.map(s => `
      <tr>
        <th scope="row">${esc(s.bp)}</th>
        <td>${esc(s.state)}</td>
        <td>${esc(s.successor ?? '—')}</td>
        <td>${esc(s.reason ?? '')}</td>
      </tr>`).join('')
  return `
  <section class="card">
    <h2>Process lifecycle — dissolved, retired &amp; parked</h2>
    <p class="blurb">${esc(PROCESS_LIFECYCLE_BLURB)}</p>
    <div class="tblwrap"><table>
      <thead><tr><th>Process</th><th>Status</th><th>Successor</th><th>Reason</th></tr></thead>
      <tbody>${rows}
      </tbody>
    </table></div>
  </section>`
}

/**
 * The deployment view a `deployment_decisions` block names, read once: `{ hosting, slots }` where
 * each slot carries `owner`, `slot`, `resourceKind`, `product`, `ruled`; or `{ error }` when the
 * file is absent, unparsable or not deployment-view/3. Rendered, never summarized: the ruling's
 * `basis` is the reviewer's evidence, and it lives here and nowhere else.
 */
const VIEW_CACHE = new Map()
function readDeploymentView (rel) {
  if (VIEW_CACHE.has(rel)) return VIEW_CACHE.get(rel)
  let out
  try {
    // The view carries inline flow maps (`retry: {…}`, `ruled: {…}`) like a sheet does, so it is
    // read with the sheet's tolerant reader — the dossier renders the view, its own
    // `deployment-view-check` validates it.
    const doc = parseSheet(readFileSync(join(ROOT, rel), 'utf8'))
    if (doc?.format !== 'deployment-view/3') {
      out = { error: `${rel} is '${doc?.format ?? '(no format)'}', not deployment-view/3 — the rulings live only in /3 (ADR-071)` }
    } else {
      const slots = []
      for (const [list, key] of [['accesses', 'resourceAccess'], ['utilities', 'utility']]) {
        for (const owner of Array.isArray(doc[list]) ? doc[list] : []) {
          for (const sl of Array.isArray(owner?.slots) ? owner.slots : []) {
            if (sl?.slot) slots.push({ ...sl, owner: owner[key] })
          }
        }
      }
      out = { hosting: doc.hosting ?? null, slots }
    }
  } catch (e) {
    out = { error: `${rel}: ${e.message}` }
  }
  VIEW_CACHE.set(rel, out)
  return out
}

const stampOk = r => r && typeof r === 'object' && ['by', 'on', 'basis'].every(k => String(r[k] ?? '').trim() !== '')
function stampCell (ruled) {
  if (!stampOk(ruled)) return `<div class="notcov">UNRULED — no complete \`ruled: { by, on, basis }\` stamp on the deployment view; the remedy is the Software Architect's ruling, never a stamp</div>`
  return `<div class="quote">“${esc(ruled.basis)}”</div><div class="note">ruled by ${esc(ruled.by)}, ${esc(ruled.on)}</div>`
}

function deploymentDecisionsHtml (g) {
  const dd = g.rec.deployment_decisions
  const standing = DEPLOYMENT_DECISION_GATES.includes(g.node.id)
  if (!dd && !standing) return ''

  const head = `
  <section class="card">
    <h2>Deployment decisions — the ruled products and the hosting concept</h2>
    <p class="blurb">${esc(DEPLOYMENT_DECISION_BLURB)}</p>`

  if (!dd) {
    return `${head}
    <p class="ss-missing">${chip('red')} ${esc(DEPLOYMENT_DECISION_MISSING)}</p>
  </section>`
  }
  const reviewer = `
    <p class="ss-src">Reviewer: ${esc(dd.reviewer)}</p>`
  if (dd.waiver) {
    return `${head}
    <p class="ss-missing">${chip('info')} ${esc(dd.waiver)}</p>${reviewer}
  </section>`
  }

  const view = readDeploymentView(dd.source)
  if (view.error) {
    return `${head}
    <p class="ss-missing">${chip('red')} ${esc(view.error)}</p>${reviewer}
  </section>`
  }
  const bySlot = new Map(view.slots.map(sl => [sl.slot, sl]))
  const rows = dd.rows.map(r => {
    if (r.name === 'hosting') {
      const h = view.hosting
      const facts = h
        ? ['topology', 'target', 'costEnvelope', 'partialDeployment', 'operator']
          .map(k => `<div><strong>${esc(k)}:</strong> ${esc(h[k] ?? '—')}</div>`).join('')
        : `<div class="notcov">the deployment view carries no hosting block</div>`
      return `
      <tr>
        <th scope="row">hosting</th>
        <td>the hosting operational concept</td>
        <td>${facts}${h ? stampCell(h.ruled) : ''}${r.note ? `<div class="note">${esc(r.note)}</div>` : ''}</td>
        <td>${chip(r.verdict)}</td>
      </tr>`
    }
    const sl = bySlot.get(r.name)
    return `
      <tr>
        <th scope="row">${esc(r.name)}</th>
        <td>${sl ? `${esc(sl.owner)} · ${esc(sl.resourceKind)} · <strong>${esc(sl.product)}</strong>` : '<span class="notcov">no such slot in the deployment view</span>'}</td>
        <td>${sl ? stampCell(sl.ruled) : ''}${r.note ? `<div class="note">${esc(r.note)}</div>` : ''}</td>
        <td>${chip(r.verdict)}</td>
      </tr>`
  }).join('')

  return `${head}${askAuthorityCell(dd)}
    <div class="tblwrap"><table>
      <thead><tr><th>Decision</th><th>Owner · kind · product</th><th>Ruling (from ${esc(dd.source)})</th><th>Verdict</th></tr></thead>
      <tbody>${rows}
      </tbody>
    </table></div>${reviewer}
  </section>`
}

function resourceProtocolsHtml (g) {
  const rp = g.rec.resource_protocols
  const standing = RESOURCE_PROTOCOL_GATES.includes(g.node.id)
  if (!rp && !standing) return ''

  const head = `
  <section class="card">
    <h2>Resource protocols — the reviewed resource surface</h2>
    <p class="blurb">${esc(RESOURCE_PROTOCOL_BLURB)}</p>`

  if (!rp) {
    return `${head}
    <p class="ss-missing">${chip('red')} ${esc(RESOURCE_PROTOCOL_MISSING)}</p>
  </section>`
  }

  const reviewer = `
    <p class="ss-src">Reviewer: ${esc(rp.reviewer)}</p>`

  // The honest-nothing case (#907): a system with no ResourceAccess records ONE LINE saying so,
  // and the section reads as a reviewed nothing (info) rather than an unreviewed surface (red).
  if (rp.waiver) {
    return `${head}
    <p class="ss-missing">${chip('info')} ${esc(rp.waiver)}</p>${reviewer}
  </section>`
  }

  // One row per SHEET, grouped under its owning Access (ADR-065 O3): an Access carrying several
  // sheets is then a visibly multi-line review item rather than something the reviewer has to
  // notice. Rows that name no `access:` keep their own order at the end.
  const grouped = []
  for (const sh of rp.sheets) {
    const key = sh.access ?? ''
    const bucket = grouped.find(g => g.access === key)
    if (bucket) bucket.sheets.push(sh)
    else grouped.push({ access: key, sheets: [sh] })
  }
  const rows = grouped.map(g => g.sheets.map((sh, i) => `
      <tr>
        <td>${i === 0 ? esc(g.access || '—') : ''}</td>
        <th scope="row">${esc(sh.name)}</th>
        <td>${pathCell(sh.path)}${sh.note ? `<div class="note">${esc(sh.note)}</div>` : ''}${askAuthorityCell(sh)}</td>
        <td>${chip(sh.verdict)}</td>
      </tr>`).join('')).join('')

  // What can wipe data (#969) — the SA's own review question, one line per use case, derived
  // from the sheets rather than restated in the record.
  const effects = rp.sheets.map(sh => {
    const sheet = readSheet(sh.path)
    if (!sheet) return ''
    const lines = dangerEffectLines(sheet)
    if (!lines.length) {
      return `
      <li class="open-item s-closed"><span class="ref">${esc(sh.name)}</span>
      <span class="state">NONE</span> No operation on this seam destroys stored content.</li>`
    }
    return lines.map(l => `
      <li class="open-item s-open"><span class="ref">${esc(sh.name)}</span>
      <span class="state">${esc(String(l.effect).toUpperCase())}</span> ${l.orphan
        ? `<strong>${esc(l.op)}</strong> is allowed to no use case`
        : `${esc(l.who)} may invoke <strong>${esc(l.op)}</strong>`}${l.on ? ` on ${esc(l.on)}` : ''}${l.note ? `<div class="note">${esc(l.note)}</div>` : ''}</li>`).join('')
  }).join('')

  const design = rp.sheets.map(sheetDesignHtml).join('')

  return `${head}${askAuthorityCell(rp)}
    <div class="tblwrap"><table>
      <thead><tr><th>ResourceAccess</th><th>Seam</th><th>Reviewed sheet (resource-protocol/2)</th><th>Verdict</th></tr></thead>
      <tbody>${rows}
      </tbody>
    </table></div>
    <h3>What can delete data</h3>
    <p class="blurb">Every use case allowed to invoke a seam operation whose effect class
    <strong>destroys content already stored</strong> — <code>delete</code> and <code>ddl</code> on a
    relational store, <code>delete</code> in a document store, <code>DELETE</code> against a REST
    API, <code>rewrite</code> and <code>delete</code> on files, where overwriting destroys
    everything the file held (#977). Crossed from each sheet's <code>operations</code> effect
    classes against its per-use-case <code>allow</code> lists, and it is the same list the sheet's
    own <code>--check</code> reports. A use case not on this list cannot destroy stored content:
    the effect gate fails the spec run at the seam.</p>
    <ul class="open-list">${effects}
    </ul>
    <h3>Table design</h3>
    <p class="blurb">Each sheet's <code>shape:</code> section, rendered: the entity diagram first,
    then every column with its type, nullability, key and constraints. The sheet is the source —
    this is a rendering of it, and the reviewer blesses the sheet.</p>${design}${reviewer}
  </section>`
}

// The prediction sheet joined with its diff (#941). Standing at every PENDING gate record of
// the conducting run — the sheet is a gate-ENTRY artifact, so the OPEN placeholder shows while
// the sheet can still be written honestly and disappears once the gate is blessed: a sheet
// cannot be backfilled by construction (git ordering is its proof), so a permanent OPEN over a
// blessed gate would accuse history of a debt nobody can pay. A sheet that exists always
// renders, diff or not.
function predictionsHtml (g) {
  const sheet = g.predictions
  const pd = g.rec.conduct?.predictions
  const standing = CONDUCTED_GATE_RECORDS.has(resolve(ROOT, g.file)) && g.rec.status === 'pending'
  if (!sheet && !standing) return ''

  const head = `
  <section class="card">
    <h2>Predictions — what was expected to go wrong</h2>
    <p class="blurb">${esc(PREDICTIONS_BLURB)}</p>`

  if (!sheet) {
    return `${head}
    <p class="ss-missing">${chip('red')} ${esc(PREDICTIONS_MISSING)}</p>
  </section>`
  }

  const outcomeById = new Map((pd?.outcomes ?? []).map(o => [o.id, o]))
  const oChip = o => {
    const x = PREDICTION_OUTCOME[o.outcome]
    return `<span class="chip ${x.cls}"><span class="dot"></span>${x.word}</span>` +
      (o.note ? `<div class="note">${esc(o.note)}</div>` : '')
  }
  const rows = sheet.rows.map(r => `
      <tr>
        <th scope="row">${esc(r.id)}</th>
        <td>${esc(r.risk)}<div class="note">named by ${esc(r.named_by)}</div></td>
        <td>${esc(r.oracle)}</td>
        <td>${esc(r.if_silent)}</td>
        <td>${outcomeById.has(r.id) ? oChip(outcomeById.get(r.id)) : '<span class="count">—</span>'}</td>
      </tr>`).join('')

  const unpredicted = (pd?.unpredicted ?? []).map(u => `
      <li class="open-item s-open"><span class="state">FIRED UNPREDICTED</span> ${esc(u.text)}${u.ref ? ` ${refCell(u.ref)}` : ''}</li>`).join('')

  const diffNote = pd
    ? (unpredicted ? `
    <h3>What fired that no row predicted</h3>
    <ul class="open-list">${unpredicted}
    </ul>` : `
    <p class="blurb">Nothing fired unpredicted at this gate.</p>`)
    : `
    <p class="ss-missing">${chip('info')} The diff against what actually fired is owed at gate exit —
    the stage retro authors it into the conduct annex (predictions:).</p>`

  return `${head}
    <div class="tblwrap"><table>
      <thead><tr><th>#</th><th>Risk</th><th>Predicted oracle</th><th>If the oracle is silent</th><th>Outcome</th></tr></thead>
      <tbody>${rows}
      </tbody>
    </table></div>${diffNote}
    <p class="ss-src">Sheet: ${pathCell(g.predFile)} — authored ${esc(sheet.by)}, at gate entry; git ordering is the proof.</p>
  </section>`
}

// A cost cell that never reads as free (#1070). A number renders as money; the literal
// `unmeasured` renders as itself, the way the annex already writes an unmeasured role; an
// ABSENT sub-agent figure renders as 'not stated', because a blank cell in a cost column is
// read as zero and this column exists precisely because zero was the wrong answer.
function moneyCell (v) {
  if (v === undefined || v === null) return `<span class="muted">not stated</span>`
  return money(v) === undefined ? esc(v) : `<span class="count">$${esc(v)}</span>`
}

/** A cost as a number, or `undefined` when it is `unmeasured` (or anything else non-numeric). */
function money (v) {
  const n = Number(String(v).trim())
  return Number.isFinite(n) ? n : undefined
}

// What the cost column does NOT reach — ADR-060's rule that a number is presented with its
// limit, applied to the one number a gate quotes outside the room. The stage's own sessions and
// the in-process Task/Agent children they dispatched are two different measurements: a session
// row's `cost_usd` is the pre-filter's sum over that session's transcript alone, and an ADR-015
// blind review round lives in a sibling transcript that sum never sees.
function conductScopeLine (ca) {
  const t = ca.totals ?? {}
  const own = t.cost_usd
  const subs = t.subagent_cost_usd
  if (subs === undefined || subs === null) {
    return `<p class="ss-missing">${chip('info')} Sub-agent spend is not stated in this annex: the
    in-process Task/Agent dispatches of this stage — an ADR-015 blind review round among them — are
    outside every number above, which covers the sessions' own transcripts only (#1070).</p>`
  }
  const sum = money(own) !== undefined && money(subs) !== undefined ? money(own) + money(subs) : undefined
  const total = sum === undefined
    ? '<span class="muted">not summable — one side is unmeasured</span>'
    : `$${esc(sum.toFixed(2))}`
  return `<p class="blurb">What this stage cost, sessions and their in-process sub-agents together:
    ${total} (own turns ${moneyCell(own)} + sub-agents ${moneyCell(subs)}).
    The two are separate columns on purpose: a session row's cost is what the pre-filter summed over
    that session's own transcript, and a sub-agent — a blind review round, say — writes a transcript
    of its own that the sum never sees (#1070).</p>`
}

function conductAnnexHtml (g) {
  const ca = g.rec.conduct
  // Standing at the gates THIS RUN crossed, named record by record by the run's conduct state
  // (CONDUCTED_GATE_RECORDS, #850). Not "the project carries a ledger": the ledger is run-scoped
  // and sits ABOVE the project (#836), so that test was false in exactly the runs the section
  // exists for, and widened to the run root it would have accused every pre-ADR-056 gate on a
  // historical rail of owing an annex it never owed. Per gate, both cases come out right.
  const standing = CONDUCTED_GATE_RECORDS.has(resolve(ROOT, g.file))
  if (!ca && !standing) return ''

  const head = `
  <section class="card">
    <h2>Conduct — cost &amp; friction at this stage</h2>
    <p class="blurb">${esc(CONDUCT_ANNEX_BLURB)}</p>`

  if (!ca) {
    return `${head}
    <p class="ss-missing">${chip('red')} ${esc(CONDUCT_ANNEX_MISSING)}</p>
  </section>`
  }

  const rows = (ca.by_role ?? []).map(r => `
      <tr>
        <th scope="row">${esc(r.role)}</th>
        <td class="c-count"><span class="count">$${esc(r.cost_usd)}</span></td>
        <td class="c-count">${moneyCell(r.subagent_cost_usd)}</td>
        <td>${esc(r.wall_minutes)} min</td>
        <td>${esc(r.output_tokens ?? '')}</td>
      </tr>`).join('')
  const totals = `
      <tr>
        <th scope="row">total</th>
        <td class="c-count"><span class="count">$${esc(ca.totals.cost_usd)}</span></td>
        <td class="c-count">${moneyCell(ca.totals.subagent_cost_usd)}</td>
        <td>${esc(ca.totals.wall_minutes)} min</td>
        <td>${esc(ca.totals.output_tokens ?? '')}</td>
      </tr>`
  const rework = ca.rework
    ? `<p class="blurb">Rework: ${esc(Object.entries(ca.rework).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(' · '))}.
       Friction entries: ${esc(ca.friction)}.</p>`
    : `<p class="blurb">Friction entries: ${esc(ca.friction)}.</p>`
  const issues = (ca.issues ?? []).map(i => refCell(i)).join(' ')

  return `${head}
    <p class="ss-sum">${esc(ca.summary)}</p>${askAuthorityCell(ca)}
    <div class="tblwrap"><table>
      <thead><tr><th>Role (${esc(ca.node)})</th><th>Cost (est., list price)</th><th>Sub-agents (est.)</th><th>Wall</th><th>Output tokens</th></tr></thead>
      <tbody>${rows}${totals}
      </tbody>
    </table></div>
    ${conductScopeLine(ca)}
    ${rework}
    ${issues ? `<p class="blurb">Filed: ${issues}</p>` : ''}
    <p class="ss-src">Source: ${pathCell(ca.source)}</p>
  </section>`
}

// Whatever ASKS renders its authority the way a confirm item does (#862, #873, #879) — the
// reviewer has to be able to compare a quoted reading rather than trust it, wherever on the page
// the request happens to sit. Called from every place a mapping's own prose is rendered: the
// record's lede, a stats tile, a `checks[]` row, an `open[]` item, a section blurb, an artifact
// note, and the suite-strength and conduct blocks with their rows. The purely numeric mappings
// (`by_role`, `totals`, `rework`) are not among them: a count cannot read as a request, so a
// declaration there is a dead one and the build refuses it rather than rendering it. `not_an_ask`
// renders nothing: it says the prose is not a request, and that declaration is the author's
// business, not the reviewer's.
function askAuthorityCell (row) {
  if (row.authority === undefined) return ''
  return normQuote(row.authority) === NO_RULING
    ? `<div class="notcov">Judgement call — no ruling covers it: ${esc(row.basis)}</div>`
    : `<div class="quote">“${esc(row.ruling)}”</div>` +
      `<div class="note">${esc(normQuote(row.authority))}${qaLedger ? ' — verified verbatim against the ledger' : ''}</div>`
}

function gatePage (g, scans) {
  const def = GATE_DEF[g.node.id]
  const rec = g.rec

  const stats = rec.stats.map(s => `<div class="tile"><div class="n">${esc(s.n)}</div><div class="l">${esc(s.label)}</div>${askAuthorityCell(s)}</div>`).join('\n')

  // A waived row renders the three fields that make it a review outcome rather than a gap: why
  // it could not run, who accepted that, and what would make it runnable (#1071). The last line
  // is the one a reader six weeks later comes for.
  const checkResult = c => c.verdict === 'waiver'
    ? `${esc(c.reason)}<div class="notcov">accepted by: ${esc(c.accepted_by)}</div>` +
      `<div class="notcov">runnable once: ${esc(c.unblocked_by)}</div>`
    : esc(c.result)

  // The scope line sits BESIDE THE VERDICT, in reading type (#1221). It used to hang under the
  // result in footnote italics — one column away from the chip, in the type a reader has already
  // been trained to skip, which is a limit disclosed after the conclusion is formed. The verdict
  // is what a reviewer reads; whatever the check did not look at is part of that verdict, so the
  // chip and the sentence share one cell.
  const verdictCell = c => `${chip(c.verdict)}` +
    (c.not_covered ?? []).map(n => `<div class="limits">not covered: ${esc(n)}</div>`).join('')

  // A required check with no row renders OPEN, on the same mechanism the standing blocks use
  // (#1071): the gap belongs in the evidence table, where a reviewer is already looking, not in
  // a build message nobody reads at the gate. Only on a PENDING record — an evidence row cannot
  // be backfilled honestly once the gate is blessed, so a permanent OPEN over history would be
  // noise nobody can act on, which is the rule the prediction sheet already follows.
  const owed = rec.status === 'pending' ? missingRequired(g) : []
  const checks = rec.checks.map(c => `
    <tr>
      <th scope="row">${esc(c.name)}</th>
      <td>${checkResult(c)}${askAuthorityCell(c)}</td>
      <td class="c-verdict">${verdictCell(c)}</td>
      <td>${[c.source && pathCell(c.source), c.ref && refCell(c.ref)].filter(Boolean).join(' ')}</td>
    </tr>`).join('') + owed.map(r => `
    <tr>
      <th scope="row">${esc(r.name)}</th>
      <td>No row answers for this check.<div class="notcov">required at this gate by ${esc(r.basis)}</div></td>
      <td>${chip('red')}</td>
      <td><code>${esc(r.id)}</code></td>
    </tr>`).join('')
  // The remedy is stated ONCE, above the table: repeating it in six rows is how a reviewer
  // learns to skim the column it lives in.
  const owedNote = owed.length ? `<p class="ss-missing">${chip('red')} ${esc(REQUIRED_MISSING_NOTE)}</p>` : ''

  // Each confirm item renders its AUTHORITY as a label, so the reviewer sees which of the two
  // requests is being made before reading the assertion (ADR-056 §1c, #845): confirm a reading
  // of a quoted ruling, or make a judgement call no ruling covers.
  const confirms = (rec.confirm ?? []).map(cf => {
    const judgement = normQuote(cf.authority) === NO_RULING
    const label = judgement
      ? '<span class="chip v-amber"><span class="dot"></span>JUDGEMENT CALL</span>'
      : '<span class="chip v-info"><span class="dot"></span>CONFIRM A READING</span>'
    // The quote is COLLAPSED behind its digest (#1049). A verbatim ruling runs to thousands of
    // characters and a page that renders four of them whole is a page whose reviewer scrolls
    // past all four. `<details>`/`<summary>` is the whole mechanism — pure HTML, keyboard
    // reachable, no script, and the record stays exactly one keystroke away. The label inside
    // says which text governs, because a summary rendered without that line is a paraphrase
    // presented as a ruling.
    const auth = normQuote(cf.authority)
    const authority = judgement
      ? `<div class="notcov">No ruling covers it: ${esc(cf.basis)}</div>`
      : `<details class="ruling">` +
        `<summary><span class="digest">${esc(confirmDigest(cf))}</span>` +
        `<span class="expand">${esc(auth)}, quoted verbatim — expand to verify</span></summary>` +
        `<div class="verbatim-label">Verbatim — this text governs; the summary above is not authoritative.</div>` +
        `<div class="quote">“${esc(cf.ruling)}”</div>` +
        `<div class="note">${esc(auth)}${qaLedger ? ' — verified verbatim against the ledger' : ''}</div>` +
        `</details>`
    return `
    <tr>
      <th scope="row">${esc(cf.text)}</th>
      <td>${label}</td>
      <td>${authority}</td>
    </tr>`
  }).join('')
  const confirmSection = confirms
    ? `
<section class="card">
  <h2>Confirm items — what is being asked, and on whose authority</h2>
  <p class="blurb">Each confirmation asked of the reviewer, labelled with the authority it rests on (ADR-060, ADR-056 §1c): either a ruling, quoted word for word so the reading can be compared rather than trusted, or the declaration that no ruling covers it — a judgement call. The two are different requests, and the label says which one this is. A quoted ruling shows its digest — a plain-language reading that is <em>not</em> authoritative — and the verbatim text is one click away (#1049).</p>
  <div class="tblwrap"><table>
    <thead><tr><th>Asked to confirm</th><th>Request</th><th>Authority</th></tr></thead>
    <tbody>${confirms}
    </tbody>
  </table></div>
</section>`
    : ''

  const sections = rec.sections.map(sec => {
    const rows = sec.artifacts.map(a => {
      const scan = scans.get(a)
      const count = scan.missing
        ? '<span class="chip v-red"><span class="dot"></span>MISSING</span>'
        : `<span class="count">${scan.count}${scan.count === 1 ? ' file' : ' files'}</span>` +
          (scan.breakdown ? `<span class="bd">${esc(scan.breakdown)}</span>` : '')
      return `
      <tr>
        <th scope="row">${esc(a.label)}</th>
        <td class="c-count">${count}</td>
        <td>${pathCell(a.path)}${a.note ? `<div class="note">${esc(a.note)}</div>` : ''}${askAuthorityCell(a)}</td>
      </tr>`
    }).join('')
    return `
  <section class="card">
    <h2>${esc(sec.title)}</h2>
    <p class="blurb">${esc(sec.blurb)}</p>${askAuthorityCell(sec)}
    <div class="tblwrap"><table>
      <thead><tr><th>Artifact</th><th>On disk</th><th>Path</th></tr></thead>
      <tbody>${rows}
      </tbody>
    </table></div>
  </section>`
  }).join('\n')

  const open = rec.open.map(o => `
      <li class="open-item s-${esc(o.state)}">${refCell(o.ref)}
      <span class="state">${esc(o.state.toUpperCase())}</span> ${esc(o.text)}${askAuthorityCell(o)}</li>`).join('')

  const i = gates.indexOf(g)
  const prev = gates[i - 1]; const next = gates[i + 1]
  const nav = `
  <nav class="pager">
    <a href="index.html">All dossiers</a>
    ${prev ? `<a href="${prev.dir}.html">&larr; ${esc(GATE_DEF[prev.node.id].speaking)}</a>` : ''}
    ${next ? `<a href="${next.dir}.html">${esc(GATE_DEF[next.node.id].speaking)} &rarr;</a>` : ''}
  </nav>`

  const body = `
<header class="mast">
  <p class="crumb"><a href="index.html">${esc(config.program)}</a> · Gate dossiers</p>
  <div class="mast-row">
    <h1><span class="gnum">GATE</span> ${esc(def.speaking)}</h1>
    <span class="pill ${STATUS_PILL[rec.status]}">${esc(rec.status_label)}</span>
  </div>
  <p class="full">${esc(def.full)}</p>
  <dl class="meta">
    <div><dt>Reviewer</dt><dd>${esc(rec.reviewer)}</dd></div>
    <div><dt>Disposition</dt><dd>${esc(rec.disposition)}</dd></div>
  </dl>
</header>
${railHtml(g.node.id)}
<section class="lede"><p>${esc(def.decides)}</p><p>${esc(rec.lede)}</p>${askAuthorityCell(rec)}</section>
<section class="tiles">${stats}</section>
<section class="card">
  <h2>Evidence at the gate</h2>
  <p class="blurb">Mechanical checks and recorded verdicts. Sources are the authoritative records — the dossier only quotes them.</p>
  ${owedNote}
  <div class="tblwrap"><table>
    <thead><tr><th>Check</th><th>Result</th><th>Verdict</th><th>Source</th></tr></thead>
    <tbody>${checks}
    </tbody>
  </table></div>
</section>
${confirmSection}
${suiteStrengthHtml(g)}${resourceProtocolsHtml(g)}${deploymentDecisionsHtml(g)}${deferredComponentsHtml()}${processLifecycleHtml()}${predictionsHtml(g)}${conductAnnexHtml(g)}
${sections}
<section class="card">
  <h2>Rulings &amp; open items</h2>
  <ul class="open-list">${open}
  </ul>
</section>
${nav}`

  return pageHtml(`Gate ${def.speaking} — Review Dossier — ${config.program}`, body)
}

function indexPage () {
  const conducted = gates.map(g => {
    const def = GATE_DEF[g.node.id]
    return `
  <a class="gatecard" href="${g.dir}.html">
    <div class="mast-row">
      <h2><span class="gnum">GATE</span> ${esc(def.speaking)}</h2>
      <span class="pill ${STATUS_PILL[g.rec.status]}">${esc(g.rec.status_label)}</span>
    </div>
    <p>${esc(def.full)}</p>
    <p class="gc-meta">reviewer: ${esc(g.rec.reviewer)}</p>
  </a>`
  }).join('\n')

  const ghosts = rail.filter(n => n.kind === 'gate' && !n.record).map(n => {
    const def = GATE_DEF[n.id]
    return `
  <div class="gatecard ghost">
    <div class="mast-row">
      <h2><span class="gnum">GATE</span> ${esc(def.speaking)}</h2>
      <span class="pill pill-muted">NOT REACHED</span>
    </div>
    <p>${esc(def.full)}</p>
  </div>`
  }).join('\n')

  const body = `
<header class="mast">
  <p class="crumb">${esc(config.program)}</p>
  <h1>Gate Review Dossiers</h1>
  <p class="full">${esc(config.subject)}</p>
</header>
${railHtml(null)}
<section class="lede"><p>One dossier per Diamond-Process gate (ADR-040): the complete surface a human
reviews at that gate — evidence first, then the artifact inventory counted live from the project tree,
then the rulings still owed. Each dossier links every artifact where it lives; the dossier is a view,
never the truth. Status authority remains the gate records and the project tracker.</p></section>
<section class="cards">
${conducted}
${ghosts}
</section>
<section class="card">
  <h2>How to read a dossier</h2>
  <ol class="howto">
    <li><strong>Status &amp; evidence</strong> — the verdict strip and the mechanical checks; anything not green is either a ruling owed to you or an open defect.</li>
    <li><strong>Review surface</strong> — the artifact inventory, grouped in review order, counted live from the tree and linked in place.</li>
    <li><strong>Rulings &amp; open items</strong> — what was ratified at the gate and what still blocks blessing.</li>
  </ol>
</section>`

  return pageHtml(`Gate Review Dossiers — ${config.program}`, body)
}

// ── styles (process-owned; identical in every project) ─────────────────────

const CSS = `
:root{
  --bg:#F4F6F9; --surface:#FFFFFF; --fg:#0F172A; --muted:#5B6472; --border:#E1E4E9;
  --accent:#2563EB; --green:#15803D; --green-bg:#EBF7EF; --amber:#92610C; --amber-bg:#FBF3E2;
  --red:#B91C1C; --red-bg:#FBEDED; --info:#3B4A63; --info-bg:#EEF1F6; --code:#F1F3F7;
}
@media (prefers-color-scheme: dark){
  :root{
    --bg:#0B1220; --surface:#121B2E; --fg:#E6EBF4; --muted:#93A0B4; --border:#233149;
    --accent:#7CA9F7; --green:#5BD98A; --green-bg:#12291B; --amber:#F0C051; --amber-bg:#2C2410;
    --red:#F58A8A; --red-bg:#331717; --info:#AFC0DA; --info-bg:#1A2438; --code:#1A2438;
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
  font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:1120px;margin:0 auto;padding:24px 20px 48px}
a{color:var(--accent)}
a:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:2px}
code,.path,.gnum,.tile .n,.count,.ref{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
code{background:var(--code);padding:1px 5px;border-radius:4px;font-size:.85em}
.mast{margin-bottom:14px}
.crumb{margin:0 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.crumb a{color:var(--muted);text-decoration:none}
.crumb a:hover{color:var(--accent)}
.mast-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
h1{margin:0;font-size:clamp(26px,4vw,38px);letter-spacing:-.02em;font-weight:800}
.gnum{color:var(--muted);font-weight:600;font-size:.62em;letter-spacing:.1em;vertical-align:.18em;margin-right:2px}
.full{margin:6px 0 0;color:var(--muted);font-size:16px;max-width:70ch}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px 24px;margin:14px 0 0;
  border-top:1px solid var(--border);padding-top:12px}
.meta dt{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 2px}
.meta dd{margin:0;font-size:13.5px}
.pill{display:inline-block;padding:3px 12px;border-radius:999px;font-size:12.5px;font-weight:700;
  letter-spacing:.04em;white-space:nowrap;border:1px solid transparent}
.pill-green{color:var(--green);background:var(--green-bg);border-color:color-mix(in srgb,var(--green) 35%,transparent)}
.pill-amber{color:var(--amber);background:var(--amber-bg);border-color:color-mix(in srgb,var(--amber) 35%,transparent)}
.pill-muted{color:var(--muted);background:var(--info-bg);border-color:var(--border)}
.muted{color:var(--muted)}
.rail{display:flex;align-items:flex-start;overflow-x:auto;padding:16px 4px 10px;margin:8px 0 4px}
.rail-item{display:flex;flex-direction:column;align-items:center;gap:6px;text-decoration:none;color:inherit;min-width:64px}
.rail-link{flex:1 1 18px;min-width:12px;height:2px;background:var(--border);margin-top:13px}
.node{display:block;width:14px;height:14px;border:2px solid var(--muted);background:var(--surface)}
.node.stage{border-radius:999px}
.node.gate{transform:rotate(45deg);border-radius:2px}
.node.done,.node.blessed{background:var(--green);border-color:var(--green)}
.node.pending,.node.active{background:var(--amber);border-color:var(--amber)}
.node.locked{background:transparent;border-style:dashed}
.node.cur{box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 30%,transparent)}
.rail-label{font-size:11px;line-height:1.25;text-align:center;color:var(--muted)}
.rail-label em{display:block;font-style:normal;font-weight:600;color:var(--fg)}
a.rail-item:hover .rail-label em{color:var(--accent)}
.lede p{margin:8px 0 0;font-size:15.5px;max-width:80ch}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:18px 0}
.tile{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px}
.tile .n{font-size:26px;font-weight:700;letter-spacing:-.02em}
.tile .l{font-size:12px;color:var(--muted);margin-top:2px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin:14px 0}
.card h2{margin:0;font-size:17px;letter-spacing:-.01em}
.blurb{margin:4px 0 10px;color:var(--muted);font-size:13.5px;max-width:85ch}
.tblwrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:13.5px}
thead th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);
  border-bottom:1px solid var(--border);padding:6px 12px 6px 0;font-weight:600}
tbody th{text-align:left;font-weight:600;vertical-align:top;padding:8px 12px 8px 0;width:26%}
tbody td{vertical-align:top;padding:8px 12px 8px 0}
tbody tr{border-bottom:1px solid var(--border)}
tbody tr:last-child{border-bottom:none}
.path{font-size:12px;word-break:break-all;text-decoration:none}
a.path:hover{text-decoration:underline}
.unserved{color:var(--muted)}
.count{font-size:13px;font-weight:700;white-space:nowrap}
.bd{display:block;font-size:11.5px;color:var(--muted)}
.c-count{white-space:nowrap;width:1%}
.note{font-size:12.5px;color:var(--muted);margin-top:3px;max-width:52ch}
.notcov{font-size:12.5px;font-style:italic;color:var(--muted);margin-top:3px;max-width:60ch}
.c-verdict{min-width:14ch}
.limits{font-size:12.5px;color:var(--fg);margin-top:6px;max-width:38ch}
.quote{font-style:italic;max-width:70ch}
details.ruling>summary{cursor:pointer;max-width:70ch;list-style:none}
details.ruling>summary::-webkit-details-marker{display:none}
details.ruling>summary:focus-visible{outline:2px solid var(--info);outline-offset:2px;border-radius:4px}
details.ruling .digest{display:block}
details.ruling .expand{display:block;font-size:12.5px;color:var(--info);margin-top:3px}
details.ruling .expand::before{content:"▸ "}
details.ruling[open]>summary .expand::before{content:"▾ "}
details.ruling .verbatim-label{font-size:11.5px;font-weight:700;letter-spacing:.04em;
  text-transform:uppercase;color:var(--muted);margin:8px 0 3px;max-width:70ch}
.chip{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:999px;
  font-size:11px;font-weight:700;letter-spacing:.05em;white-space:nowrap}
.chip .dot{width:7px;height:7px;border-radius:999px;background:currentColor}
.v-green{color:var(--green);background:var(--green-bg)}
.v-amber{color:var(--amber);background:var(--amber-bg)}
.v-red{color:var(--red);background:var(--red-bg)}
.v-info{color:var(--info);background:var(--info-bg)}
.v-waiver{color:var(--amber);background:var(--amber-bg);border:1px dashed color-mix(in srgb,var(--amber) 45%,transparent)}
.card h3{margin:14px 0 0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.ss-missing{display:flex;align-items:flex-start;gap:10px;margin:10px 0 2px;font-size:13.5px;max-width:85ch}
.ss-sum{margin:2px 0 10px;font-size:13.5px;max-width:85ch}
.ss-src{margin:12px 0 0;font-size:12.5px;color:var(--muted)}
.open-list{margin:8px 0 2px;padding:0;list-style:none}
.open-item{padding:8px 0;border-bottom:1px solid var(--border);font-size:13.5px}
.open-item:last-child{border-bottom:none}
.ref{font-weight:700;margin-right:8px;text-decoration:none}
a.ref:hover{text-decoration:underline}
.state{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.06em;padding:1px 8px;
  border-radius:999px;margin-right:8px;background:var(--info-bg);color:var(--info)}
.s-open .state{background:var(--amber-bg);color:var(--amber)}
.s-closed .state,.s-ratified .state{background:var(--green-bg);color:var(--green)}
.rp-shape{border:1px solid var(--border);border-radius:10px;padding:8px 12px;margin:10px 0;background:var(--bg)}
.rp-shape>summary{cursor:pointer;font-weight:700;font-size:13.5px}
.rp-shape h4.rp-table{margin:14px 0 4px;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.rp-constraints{margin:6px 0 0;padding-left:18px;font-size:12.5px;color:var(--muted)}
.rp-constraints code{word-break:break-word}
.rp-shape figure{margin:8px 0 14px;background:var(--surface);border:1px solid var(--border);
  border-radius:10px;padding:10px;overflow-x:auto}
pre.mermaid{margin:0;text-align:center;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  color:var(--muted)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin:16px 0}
.gatecard{display:block;background:var(--surface);border:1px solid var(--border);border-radius:12px;
  padding:16px 18px;text-decoration:none;color:inherit;transition:border-color .18s ease}
a.gatecard:hover{border-color:var(--accent);cursor:pointer}
.gatecard h2{margin:0;font-size:19px}
.gatecard p{margin:8px 0 0;font-size:13.5px;color:var(--muted)}
.gc-meta{font-size:12px}
.ghost{opacity:.65}
.howto{margin:10px 0 4px;padding-left:20px;font-size:13.5px}
.howto li{margin:6px 0}
.pager{display:flex;gap:18px;flex-wrap:wrap;margin:20px 0 6px;font-size:13.5px}
.pager a{text-decoration:none;font-weight:600}
.pager a:hover{text-decoration:underline}
.prov{margin-top:28px;border-top:1px solid var(--border);padding-top:12px;color:var(--muted);font-size:12px}
.prov p{margin:4px 0;max-width:100ch}
@media (prefers-reduced-motion: reduce){*{transition:none!important}}
`

/**
 * The standing resource-protocol evidence is BLOCKING once the gate is crossed (#971, ADR-059).
 *
 * The OPEN placeholder made an unreviewed resource surface VISIBLE; visible is not blocking, and
 * Comanda showed the hole — four sheets `amber`, a reviewer line saying the review act is owed,
 * and the run's own conduct state recording Contract as passed. Nothing failed.
 *
 * So a CROSSED Contract whose block is absent, whose reviewer is unnamed, or whose sheets are not
 * all `green` is a `dossier-check` failure. "Crossed" is read from BOTH surfaces that can say so
 * — the record's own `blessed`, and the run's conduct state recording the gate `passed` (the two
 * vocabularies of #837) — because either one alone leaves a gate the run walked through with an
 * unblessed resource surface behind it. For a gate not yet crossed the placeholder stays exactly
 * right: `amber` there is an honest in-progress record of an act still owed.
 *
 * A `waiver` passes: it is a review outcome a named reviewer accepted (#907), not an absence.
 *
 * Scoped to the records on the RAIL — the dossier's own review surface. An off-rail record from
 * an earlier run answers to its own run's rules (gate-record-format.md, self-containment), and
 * accusing a gate crossed before ADR-059 existed of owing a sheet is the #850 mistake.
 */
/** The required checks this record carries no row for, in the template's order (#1071). */
function missingRequired (g) {
  const have = new Set(g.rec.checks.map(c => c.id).filter(Boolean))
  return (GATE_REQUIRES[g.node.id] ?? []).filter(r => !have.has(r.id))
}

/**
 * A required check with no row BLOCKS once the gate is crossed — the same two-step #971 gave the
 * resource-protocol block, for the same reason: the OPEN placeholder makes the gap visible, and
 * visible is not blocking.
 *
 * "Crossed" is read from BOTH surfaces that can say it — the record's own `blessed` and the run's
 * conduct state recording the gate `passed` (the two vocabularies of #837) — because either alone
 * leaves a gate the run walked through with an unrecorded check behind it.
 *
 * Scoped to the records THIS RUN CONDUCTED, which is the conduct annex's own scoping (#850): a
 * gate crossed by an earlier run answers to that run's rules, and accusing a gate blessed before
 * this mechanism existed of owing a row that did not exist then is the mistake #850 fixed. The
 * limit that follows is deliberate and worth saying out loud rather than leaving to be found: a
 * project building a dossier outside a conducted run gets the OPEN placeholder and no block. The
 * run that crossed the gate is the only party who can still act on the gap.
 */
function requiredCheckDebts (g) {
  const crossed = g.rec.status === 'blessed' || CONDUCTED_PASSED_GATES.has(g.node.id)
  if (!crossed || !CONDUCTED_GATE_RECORDS.has(resolve(ROOT, g.file))) return []
  const how = g.rec.status === 'blessed'
    ? 'this record is blessed'
    : `the run's conduct state records ${g.node.id} as passed`
  return missingRequired(g).map(r =>
    `${g.file}: Gate ${GATE_DEF[g.node.id].speaking} is crossed (${how}) and no check row answers ` +
    `for '${r.id}' (${r.name}) — ${r.basis}. A check nobody recorded is indistinguishable from ` +
    `one that passed, which ADR-058 §3 forbids.`)
}

function resourceProtocolDebts (g) {
  if (!RESOURCE_PROTOCOL_GATES.includes(g.node.id)) return []
  const crossed = g.rec.status === 'blessed' || CONDUCTED_PASSED_GATES.has(g.node.id)
  if (!crossed) return []
  const how = g.rec.status === 'blessed'
    ? 'this record is blessed'
    : `the run's conduct state records ${g.node.id} as passed`
  const rp = g.rec.resource_protocols
  if (!rp) {
    return [`${g.file}: Gate ${GATE_DEF[g.node.id].speaking} is crossed (${how}) and carries NO ` +
      `'resource_protocols' block — ADR-059 makes the sheets standing evidence, and an ` +
      `unreviewed resource surface must not cross this gate.`]
  }
  const out = []
  if (!normQuote(rp.reviewer ?? '')) {
    out.push(`${g.file}: Gate ${GATE_DEF[g.node.id].speaking} is crossed (${how}) and its ` +
      `'resource_protocols' block names no reviewer — a sheet is blessed by the Software ` +
      `Architect or the domain-architect delegate the brief names (ADR-058), never by nobody.`)
  }
  for (const sh of rp.sheets ?? []) {
    if (sh.verdict === 'green') continue
    out.push(`${g.file}: Gate ${GATE_DEF[g.node.id].speaking} is crossed (${how}) but the sheet ` +
      `'${sh.name}' stands at 'verdict: ${sh.verdict}' — only 'green' says a named reviewer ` +
      `blessed it.`)
  }
  return out
}

function deploymentDecisionDebts (g) {
  if (!DEPLOYMENT_DECISION_GATES.includes(g.node.id)) return []
  const crossed = g.rec.status === 'blessed' || CONDUCTED_PASSED_GATES.has(g.node.id)
  if (!crossed) return []
  const how = g.rec.status === 'blessed'
    ? 'this record is blessed'
    : `the run's conduct state records ${g.node.id} as passed`
  const dd = g.rec.deployment_decisions
  if (!dd) {
    return [`${g.file}: Gate ${GATE_DEF[g.node.id].speaking} is crossed (${how}) and carries NO ` +
      `'deployment_decisions' block — ADR-071 makes the deployment view's rulings standing evidence, ` +
      `and an unruled product or hosting target must not cross this gate.`]
  }
  const out = []
  if (!normQuote(dd.reviewer ?? '')) {
    out.push(`${g.file}: Gate ${GATE_DEF[g.node.id].speaking} is crossed (${how}) and its ` +
      `'deployment_decisions' block names no reviewer — a ruling is confirmed by the Software ` +
      `Architect or the domain-architect delegate the brief names (ADR-058), never by nobody.`)
  }
  for (const r of dd.rows ?? []) {
    if (r.verdict === 'green') continue
    out.push(`${g.file}: Gate ${GATE_DEF[g.node.id].speaking} is crossed (${how}) but the deployment ` +
      `decision '${r.name}' stands at 'verdict: ${r.verdict}' — only 'green' says a named reviewer ` +
      `confirmed it.`)
  }
  return out
}

/**
 * Totality of a `deployment_decisions` block against the view it names (ADR-071 §6): one row per
 * slot and one for hosting, no row for a slot the view does not carry, and no row over a decision
 * the view has not ruled. Problems, not debts: a block that is written is written whole.
 */
function deploymentDecisionProblems (g) {
  const dd = g.rec.deployment_decisions
  if (!dd?.rows) return []
  if (!existsSync(join(ROOT, dd.source))) return [`${g.file}: missing deployment_decisions source: ${dd.source}`]
  const view = readDeploymentView(dd.source)
  if (view.error) return [`${g.file}: deployment_decisions source unreadable — ${view.error}`]
  const out = []
  const named = new Set(dd.rows.map(r => r.name))
  const expected = new Set(['hosting', ...view.slots.map(sl => sl.slot)])
  for (const e of expected) {
    if (!named.has(e)) out.push(`${g.file}: deployment_decisions has no row for '${e}' — one row per slot and one for hosting (ADR-071 §6); ${dd.source} carries it`)
  }
  for (const n of named) {
    if (!expected.has(n)) out.push(`${g.file}: deployment_decisions row '${n}' names no slot of ${dd.source} (and is not 'hosting')`)
  }
  for (const r of dd.rows) {
    const ruled = r.name === 'hosting' ? view.hosting?.ruled : view.slots.find(sl => sl.slot === r.name)?.ruled
    if (expected.has(r.name) && !stampOk(ruled)) {
      out.push(`${g.file}: deployment_decisions row '${r.name}' stands over a decision ${dd.source} has NOT ruled — no complete ` +
        `\`ruled: { by, on, basis }\` stamp. A row cannot confirm a ruling that does not exist; the remedy is the ruling (ADR-071 §1)`)
    }
  }
  return out
}

// ── main ────────────────────────────────────────────────────────────────────

const files = new Map()
for (const g of gates) {
  const scans = new Map()
  for (const sec of g.rec.sections) for (const a of sec.artifacts) scans.set(a, scanArtifact(a, g.file))
  for (const c of g.rec.checks) {
    if (c.source && !existsSync(join(ROOT, c.source))) problems.push(`${g.file}: missing check source: ${c.source}`)
  }
  const ss = g.rec.suite_strength
  if (ss) {
    for (const p of [ss.source, ...(ss.components ?? []).map(c => c.model)].filter(Boolean)) {
      if (!existsSync(join(ROOT, p))) problems.push(`${g.file}: missing suite_strength path: ${p}`)
    }
  }
  for (const sh of g.rec.resource_protocols?.sheets ?? []) {
    if (!existsSync(join(ROOT, sh.path))) problems.push(`${g.file}: missing resource_protocols sheet path: ${sh.path}`)
  }
  problems.push(...deploymentDecisionProblems(g))
  gateBlocks.push(...requiredCheckDebts(g))
  gateBlocks.push(...resourceProtocolDebts(g))
  gateBlocks.push(...deploymentDecisionDebts(g))
  if (g.rec.conduct?.source) problems.push(...conductSourceProblems(g.rec.conduct, g.file))
  files.set(`${g.dir}.html`, gatePage(g, scans))
}
files.set('index.html', indexPage())
// The Mermaid viewer ships beside the pages only while a page carries a diagram (#969); when the
// last one goes, the sweep below removes the stale copy like any other orphan.
if ([...files.values()].some(html => html.includes('class="mermaid"'))) {
  files.set('mermaid.min.js', readFileSync(requireMermaid(), 'utf8'))
}

if (problems.length) {
  for (const p of problems) console.error(`dossier-build: ${p}`)
  process.exit(1)
}

// Reported after the pages are current, never instead of them (#971). Every exit path that
// reaches here has already written or compared them.
function reportGateBlocks () {
  if (!gateBlocks.length) return
  console.error(`dossier-build: ${gateBlocks.length} gate-blocking finding(s) — the pages are ` +
    'current, the GATE is not:')
  for (const b of gateBlocks) console.error(`  ${b}`)
  console.error('\nThe fix is the act, not the record. For a sheet: perform the review and record')
  console.error("'verdict: green', or a 'waiver' line saying why there is no resource surface to")
  console.error("review (ADR-058, ADR-059) — the gate page's own 'Resource protocols' section is the")
  console.error('surface to perform it against. For a missing check: run it and record the row, or')
  console.error("waive it with 'verdict: waiver' — the reason, who accepted it, and what would make")
  console.error('it runnable (ADR-058 §3, #1071). For a deployment decision: the ruling comes')
  console.error("first — the Software Architect rules kind, product and hosting, stamped on the")
  console.error("deployment view — then record one 'verdict: green' row per slot and one for hosting")
  console.error('in a \'deployment_decisions\' block, or a waiver when nothing stands on a resource (ADR-071).')
  process.exit(1)
}

// Staleness runs in two directions, and comparing only the pages this run produces sees one of
// them (#883, the blindness #878 fixed in book-build). A gate dropped from dossier.yaml's rail —
// or a rail entry that loses its `record:` — leaves its HTML on disk: no index links it any more,
// so nobody navigating the dossiers meets it, but `just serve-project` still serves it and a
// direct URL or an old bookmark still opens it, presenting a gate review that no longer exists as
// if it were current. callchain-build sweeps its whole output directory because that directory
// holds nothing else; here `docs/04_Gates/` also holds `dossier.yaml` — the project-owned SOURCE
// that drives the pages — plus one DIRECTORY per gate record. So the sweep keeps `dossier.yaml`,
// never touches directories, and leaves dotfiles alone: this generator writes neither, so nothing
// it could orphan hides there, while sweeping them would let one Finder visit (`.DS_Store`) wedge
// the gate permanently red or delete a file no build put there.
const KEEP = new Set(['dossier.yaml'])
const orphans = readdirSync(OUT, { withFileTypes: true })
  .filter(e => !e.isDirectory() && !e.name.startsWith('.') && !KEEP.has(e.name) && !files.has(e.name))
  .map(e => e.name)
  .sort()

if (CHECK) {
  // Name the fix in the failure itself (#590, #883): a bare `stale: <name>` says what is wrong
  // and not what to do about it — and the one thing a reader must NOT do is hand-edit the page,
  // because the next regenerate erases it. A green run says so out loud for the same reason:
  // silence in a log is indistinguishable from a check that did not run.
  const stale = []
  for (const [name, content] of files) {
    const p = join(OUT, name)
    if (!existsSync(p)) stale.push(`${name} (missing)`)
    else if (readFileSync(p, 'utf8') !== content) stale.push(`${name} (differs)`)
  }
  for (const name of orphans) stale.push(`${name} (orphan — no gate on the rail writes it any more)`)
  if (stale.length === 0) {
    console.log(`dossier-build --check: up to date — ${files.size} file(s) match the tree,`
      + ' and nothing else in the directory')
    reportGateBlocks()   // current pages, unblessed gate: still a red check (#971)
    process.exit(0)
  }
  console.error(`dossier-build --check: ${stale.length} file(s) do not match the tree`
    + ` (${files.size} generated):`)
  for (const s of stale) console.error(`  ${s}`)
  console.error('\nRun `just dossier` — dossier.yaml and the gate records are the source, these')
  console.error('pages are their rendering. Never hand-edit a page.')
  if (orphans.length) {
    console.error('That run also DELETES the orphan file(s) above; keep only dossier.yaml and the')
    console.error('record directories beside the pages.')
  }
  reportGateBlocks()
  process.exit(1)
}

for (const [name, content] of files) writeFileSync(join(OUT, name), content)
for (const name of orphans) unlinkSync(join(OUT, name))
console.log(`dossier-build: wrote ${files.size} file(s) to ${relative(process.cwd(), OUT)}`)
if (orphans.length) {
  console.log(`dossier-build: deleted ${orphans.length} orphan page(s): ${orphans.join(', ')}`)
}
reportGateBlocks()
