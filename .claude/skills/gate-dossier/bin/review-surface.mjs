#!/usr/bin/env node
// review-surface — every artifact the project has, with the state of its review.
//
// Governing decision: ADR-062. One deterministic pass over two YAML sets and one `git log`;
// emits a `review-surface/1` document. There is NO LLM in this path and no prose is
// interpreted: everything the derivation branches on is a typed field — the gate record's
// `status:` and `blessed:` (#1016), the ledger entry's `status:` and `audience:` (#1011).
//
// The unit is the ARTIFACT, not the obligation (ADR-062 §1). Open questions and owed
// confirmations attach as an attribute of an artifact; they are never the content of the index.
// Ordering puts `review-owed` first and `blessed` last, and NOTHING is ever omitted — going back
// to something already blessed is a routine act, not an exception.
//
// Unavailable is an EXIT CODE, never an in-band field (#1012): a checkout with no gate
// directory, no ledger or no git history exits non-zero with the reason on stderr. An empty
// surface and an unavailable one mean opposite things to the reader, so the document has no way
// to say the second.
//
// Zero dependencies; plain Node. The two source formats are read through record-read.mjs, the
// same code dossier-build.mjs reads them with — the decision's own rule is that this adds no
// third parser of either format.
//
// Format spec: process-specs/review-surface-format.md.
// Source formats: process-specs/gate-record-format.md, process-specs/qa-ledger-format.md.

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, resolve, relative, posix, sep, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { LINE, RAIL_DEF, railIndexOf, GATE_STATES, STAGE_STATES, parseYaml as parseYamlWith, readQaLedger } from './record-read.mjs'

function die (msg) { console.error(`review-surface: ${msg}`); process.exit(1) }
function warn (msg) { console.error(`review-surface: warning: ${msg}`) }
const parseYaml = (text, file) => parseYamlWith(text, file, die)

const RSF = 'process-specs/review-surface-format.md'

// ── the closed vocabularies ─────────────────────────────────────────────────

// Review states, in "needs you most" order. This array IS the ordering (ADR-062 §1).
const STATES = ['review-owed', 'changed-since-blessed', 'unreviewed', 'blessed']
const AUDIENCES = ['owner', 'architect']
const COUNT_KEY = {
  'review-owed': 'reviewOwed',
  'changed-since-blessed': 'changedSinceBlessed',
  unreviewed: 'unreviewed',
  blessed: 'blessed',
}

// The kind vocabulary (ADR-062 §4). Derived from path and extension, never from content. Code
// joins this table later as further entries — the extension point is a vocabulary row, not a new
// mechanism, which is why the table is a plain list of (predicate → kind) and nothing else.
// First match wins, so the specific rows come before the general ones.
const KINDS = [
  [p => basename(p) === 'record.yaml', 'gate-record'],
  [p => basename(p) === 'predictions.yaml', 'gate-predictions'],
  [p => basename(p) === 'dossier.yaml', 'dossier-config'],
  [p => basename(p) === 'qa.yaml', 'qa-ledger'],
  [p => p.endsWith('.protocol.yaml'), 'resource-protocol'],
  [p => p.endsWith('.bpmn'), 'bpmn'],
  [p => p.endsWith('.bpd'), 'bpmn-source'],
  [p => p.endsWith('.vw'), 'screen-model'],
  [p => p.endsWith('.md') && /(^|\/)[^/]*System-Interactions[^/]*\//.test(p), 'si-doc'],
  [p => p.endsWith('.md') && /(^|\/)[^/]*Call-Chains[^/]*\//.test(p), 'call-chain'],
  [p => p.endsWith('.md') && /(^|\/)[^/]*Spec[^/]*\//.test(p), 'spec'],
  [p => p.endsWith('.md') && /(^|\/)decisions\//.test(p), 'adr'],
  [p => p.endsWith('.json') && /(^|\/)[^/]*Sequence-Map[^/]*\//.test(p), 'sequence-map'],
  [p => p.endsWith('.json') && /(^|\/)[^/]*Walkthrough[^/]*\//.test(p), 'walklog'],
  [p => p.endsWith('.md'), 'doc'],
  [p => p.endsWith('.yaml') || p.endsWith('.json'), 'data'],
]
const kindOf = p => (KINDS.find(([test]) => test(p)) ?? [null, 'other'])[1]

// What the SWEEP looks at — the curated lists are never filtered by this, because a gate that
// named an artifact reviewed it whatever its extension. The sweep answers "what has nobody
// looked at?", and a generated page is not something anybody reviews: the Design Book's and the
// dossier's own HTML, the rendered SVG wireframes, the mockup's JavaScript and the run logs are
// all outputs of a builder whose input is already in this index.
const SWEEP_EXT = ['.md', '.bpmn', '.bpd', '.vw', '.yaml', '.json']
const SKIP_DIR = new Set(['node_modules', '__pycache__'])

// ── non-live sources: drawn, not built, and never a review obligation ───────────────────────
//
// A `.bpd` header declaring `status dissolved|retired|parked` (#1148) says the WHOLE business
// process is out of the live inventory. seqmap already leaves such a source out of the map it
// generates (#1243); a review surface is a gate-dossier surface and leaves it out of the index
// for the same reason — a drawing nobody is building owes nobody a review act, and listing one
// asks the reviewer for an act that cannot be performed. Measured on the Figaro run: seven such
// artifacts read `review-owed` at a pending Contract gate, BP07 among them — a process taken
// out of scope twelve days earlier, whose exclusion had already cost that run five issues and a
// postmortem (figaro#565).
//
// THE HEADER IS THE TRUTH, THE FOLDER IS ITS MIRROR. The state is read from the `.bpd` header's
// own `status` line and from NOTHING else. Excluding by path alone would fix today's count and
// re-create tomorrow's drift — two vocabularies for one fact is the failure this rule exists
// against — so where header and folder DISAGREE the header wins and the disagreement is
// REPORTED on stderr rather than silently swallowed.
//
// The process's own `status` directive sits at column 0 in the header; a `status` on a drawn
// BLOCK is indented under it, so a column-0 match is the process's own by construction. This is
// a header read, not a parse: the `.bpd` grammar is bpmn-dsl's, and this file has no dependency.
const NON_LIVE_STATUS = new Set(['dissolved', 'retired', 'parked'])
const HEADER_STATUS_RE = /^status[ \t]+([A-Za-z][A-Za-z-]*)/m
const PARKED_DIR_RE = /(^|\/)parked(\/|$)/

function headerStatusOf (abs) {
  let text
  try { text = readFileSync(abs, 'utf8') } catch { return null }
  const m = HEADER_STATUS_RE.exec(text)
  return m ? m[1].toLowerCase() : null
}

// Out of the live inventory, and therefore not something anybody owes a review act on? A `.bpd`
// answers with its own header. A DERIVED artifact answers with the header of the process it was
// exported from (see the derivation below). Anything ELSE under a `parked/` directory answers by
// its LOCATION, and it has to: the folder's own README is not a drawing, carries no `status`
// line, and has nothing else to answer with — a README of a parked folder is as parked as the
// folder. One warning per path; the document on stdout stays byte-identical either way.
const driftReported = new Set()
function isNonLive (p, abs) {
  const inParkedDir = PARKED_DIR_RE.test(p)
  if (p.endsWith('.bpd')) {
    const state = headerStatusOf(abs)
    const nonLive = state !== null && NON_LIVE_STATUS.has(state)
    if (nonLive !== inParkedDir && !driftReported.has(p)) {
      driftReported.add(p)
      warn(nonLive
        ? `${p}: the header declares 'status ${state}', but the drawing does not sit under a ` +
          `'parked/' directory. The header is the truth and the folder is its mirror: the drawing ` +
          `is left OUT of the index. Move the file, or correct the header`
        : `${p}: the drawing sits under a 'parked/' directory, but its header declares ` +
          `${state === null ? 'no status' : `'status ${state}'`}. The header is the truth and the ` +
          `folder is its mirror: the drawing stays IN the index. Move the file, or declare the ` +
          `status in the header`)
    }
    return nonLive
  }
  if (inParkedDir) return true
  const kind = kindOf(p)
  if (kind === 'si-doc') {
    const bp = processIdOf(p)
    return bp !== null && derivation().processes.get(bp) === true
  }
  if (kind === 'call-chain') {
    const m = CALL_CHAIN_SI_RE.exec(textOf(abs))
    return m !== null && derivation().interactions.get(m[1]) === true
  }
  return false
}

// ── what the drawing was exported INTO inherits the drawing's state ─────────────────────────
//
// The rule above reaches the DRAWING. It does not reach the artifacts DERIVED from it, and those
// are counted too: the System-Interaction developer documents, grouped by business process under
// `…/02_System-Interactions/<BPnn>_<Name>/`, and the SQ-numbered call chains, where the process
// is not in the path at all. Measured on the Figaro run once the drawings themselves were
// filtered (figaro#567): nine SI documents and nine call chains still read `review-owed` at a
// pending Contract gate, two of them descending from that project's first stamped
// NON-REQUIREMENT — a document whose whole content is "we considered this and we are not building
// it". The number the architect had ruled on was wrong by nine, in the direction that costs.
//
// SAME RULE, DIFFERENT JOIN. The state still comes from the `.bpd` header and from nothing else;
// what changes is how an artifact is joined to the process whose header answers for it.
//
//   an SI document   by the `BPnn` its own grouping directory carries, or — for the per-call-site
//                    export, which is named `BPxx.yy_Name.md` — by its own file name. The
//                    stage-A/B tooling contract puts every SI document under the one process that
//                    drew it, so this join is the layout's own and not a guess.
//   a call chain     by the System Interaction its own generated heading names
//                    (`# <SQ> - <SI> <name>`), and from there through the CALL SITES of the
//                    enriched sequence map — the one place a drawn call site and a minted
//                    interaction meet. Reading the process off the SQ NUMBERING instead would be
//                    a coincidence of one project's id minting, not a mapping.
//
// NOTHING IS COUNTED OUT BY NUMBER. A run mints and retires processes while it runs, so a list of
// `BP` or `SQ` ids in this file would be this same defect filed again a month later.
//
// A DERIVED ARTIFACT IS DROPPED ONLY WHEN EVERY PROCESS THAT REACHES IT IS NON-LIVE. One live
// process reaching it keeps it in the index whatever else reaches it, and that direction is the
// safe one: a surface that hides a live artifact loses a review act that is genuinely owed, while
// one that keeps a non-live artifact asks for an act nobody has to perform. Where the two joins
// DISAGREE — the sequence map draws an interaction from a parked process alone, and its developer
// document sits under a live one — the artifact STAYS and the disagreement is reported on stderr,
// exactly as a header/folder disagreement is. Two vocabularies for one fact is the drift this
// whole rule exists against, and a silent guess is what turns it into a wrong count.
const BP_ID_RE = /^(BP\d+)(?:[._-]|$)/
const SI_ID_RE = /^SI\d+\.\d+$/
const SI_DOC_SI_RE = /^#[ \t]+(SI\d+\.\d+)(?=[_ \t]|$)/m
const CALL_CHAIN_SI_RE = /^#[ \t]+SQ[\d.]+[ \t]+-[ \t]+(SI\d+\.\d+)(?=[ \t]|$)/m

function textOf (abs) {
  try { return readFileSync(abs, 'utf8') } catch { return '' }
}

// The process an artifact belongs to, read off the path: the file's own name first (the
// per-call-site export is named for the call site, `BP04.02_…`), then the directories above it
// (the grouping directory of a hand-written SI document, `BP04_IngestChannelOrders/`).
function processIdOf (p) {
  const segs = p.split('/')
  for (let i = segs.length - 1; i >= 0; i--) {
    const m = BP_ID_RE.exec(segs[i])
    if (m) return m[1]
  }
  return null
}

const derived = { built: false, processes: new Map(), interactions: new Map() }
function derivation () {
  if (derived.built) return derived
  derived.built = true
  const docsRoot = join(ROOT, 'docs')

  // (1) every drawn process, and whether its own header takes it out of the live inventory. Two
  // drawings of one id disagreeing is the live one winning, for the reason above.
  for (const abs of listFiles(docsRoot, p => p.endsWith('.bpd'))) {
    const p = rel(abs)
    const bp = processIdOf(p)
    if (bp === null) continue
    const nonLive = isNonLive(p, abs) && (derived.processes.get(bp) ?? true)
    derived.processes.set(bp, nonLive)
  }

  // (2) which processes reach which System Interaction. Both joins feed one set per interaction.
  const reach = new Map()
  const add = (si, bp) => {
    if (!SI_ID_RE.test(si) || !BP_ID_RE.test(bp)) return
    if (!reach.has(si)) reach.set(si, new Set())
    reach.get(si).add(bp)
  }

  // (2a) the developer documents. Only a document NAMING the minted id in its own heading speaks
  // for that id: a legacy `BPxx-SIyy.zz` heading carries a call-site id that reads like a minted
  // one and is not, and joining on it would file an interaction under a process that never drew
  // it. Such a document is still dropped by its own directory — it just speaks for nothing else.
  for (const abs of listFiles(docsRoot, p => p.endsWith('.md'))) {
    const p = rel(abs)
    if (kindOf(p) !== 'si-doc') continue
    const bp = processIdOf(p)
    if (bp === null) continue
    const m = SI_DOC_SI_RE.exec(textOf(abs))
    if (m) add(m[1], bp)
  }

  // (2b) the enriched sequence map (`seqmap generate --binding --model`), read for its call
  // sites: `operations` is keyed by the LIVE ones, `parkedInteractions` carries those whose every
  // call site is parked. A project with no map, or with a map generated without its binding,
  // simply has no second join — every call chain then keeps whatever its SI document says, which
  // is the conservative half of the rule and not a failure.
  for (const abs of listFiles(docsRoot, p => p.endsWith('.json'))) {
    if (kindOf(rel(abs)) !== 'sequence-map') continue
    let map
    try { map = JSON.parse(textOf(abs)) } catch { continue }
    if (!/^seqmap\/\d/.test(String(map?.format ?? ''))) continue
    for (const [callSite, op] of Object.entries(map.operations ?? {})) {
      const si = String(op?.si ?? '')
      const m = BP_ID_RE.exec(callSite)
      if (m) add(si, m[1])
      for (const d of Array.isArray(op?.definitions) ? op.definitions : []) {
        if (d?.bp) add(si, String(d.bp))
      }
    }
    for (const pi of Array.isArray(map.parkedInteractions) ? map.parkedInteractions : []) {
      const si = String(pi?.si ?? '')
      for (const bp of Array.isArray(pi?.parkedBy) ? pi.parkedBy : []) add(si, String(bp))
      for (const cs of Array.isArray(pi?.callSites) ? pi.callSites : []) {
        const m = BP_ID_RE.exec(String(cs))
        if (m) add(si, m[1])
      }
    }
  }

  // (3) an interaction is out of the live inventory when every process that reaches it is, and a
  // disagreement between the two joins is reported rather than resolved by this file.
  for (const [si, bps] of [...reach].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const known = [...bps].filter(bp => derived.processes.has(bp)).sort()
    if (!known.length) continue
    const nonLive = known.filter(bp => derived.processes.get(bp))
    derived.interactions.set(si, nonLive.length === known.length)
    if (nonLive.length && nonLive.length !== known.length) {
      const live = known.filter(bp => !nonLive.includes(bp))
      warn(`${si}: it is reached from ${nonLive.join(', ')}, which a '.bpd' header takes out of ` +
        `the live inventory, and from ${live.join(', ')}, which is live — the sequence map's call ` +
        `sites and the SI document's own directory disagree about this interaction. One live ` +
        `process reaching an interaction keeps it IN the index, so it and everything derived from ` +
        `it stay. Bind the live call site in the binding map, or file the document under the ` +
        `process that draws it`)
    }
  }
  return derived
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// ── CLI ─────────────────────────────────────────────────────────────────────

const USAGE = 'usage: review-surface <project-root> [--audience owner|architect] [--state <state>] [--json]'
let ROOT_ARG = null
let wantState = null
let wantAudience = null
let asJson = false
{
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const valued = (name) => {
      if (a === `--${name}`) return argv[++i]
      if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3)
      return undefined
    }
    if (a === '--json') { asJson = true; continue }
    const st = valued('state'); if (st !== undefined) { wantState = st; continue }
    const au = valued('audience'); if (au !== undefined) { wantAudience = au; continue }
    if (a.startsWith('-')) die(`unknown option '${a}' — ${USAGE}`)
    if (ROOT_ARG !== null) die(USAGE)
    ROOT_ARG = a
  }
}
if (ROOT_ARG === null) die(USAGE)
if (wantState !== null && !STATES.includes(wantState)) {
  die(`--state '${wantState}' is not a review state (${STATES.join(' | ')}) — ${RSF}`)
}
if (wantAudience !== null && !AUDIENCES.includes(wantAudience)) {
  die(`--audience '${wantAudience}' is not an audience (${AUDIENCES.join(' | ')}) — ${RSF}`)
}

const ROOT = resolve(ROOT_ARG)
if (!existsSync(ROOT) || !statSync(ROOT).isDirectory()) die(`'${ROOT_ARG}' is not a directory`)

const rel = abs => posix.join(...relative(ROOT, abs).split(sep))

// ── the project's own files ─────────────────────────────────────────────────

const GATES = 'docs/04_Gates'
const CONFIG_FILE = `${GATES}/dossier.yaml`
if (!existsSync(join(ROOT, CONFIG_FILE))) {
  die(`${ROOT_ARG} carries no ${CONFIG_FILE}, so it has no gates to derive a review state from. ` +
    `A checkout that has not run the Diamond Process has no review surface — this is the ` +
    `unavailable case, and it is an exit code rather than an empty document because an empty ` +
    `surface and an unavailable one mean opposite things (ADR-062 §5)`)
}
const config = parseYaml(readFileSync(join(ROOT, CONFIG_FILE), 'utf8'), CONFIG_FILE)
if (!/^dossier-config\/1(_|$)/.test(String(config.format ?? ''))) {
  die(`${CONFIG_FILE}: format must be 'dossier-config/1_<term>' (got '${config.format ?? ''}')`)
}

// The ledger. ADR-062 names "no ledger" as an unavailable case beside "no gates": the surface
// exists to carry the questions somebody owes an answer to, and a project with no ledger cannot
// produce them — so it says so rather than presenting a question-free surface that looks settled.
if (config.qa_ledger === undefined) {
  die(`${CONFIG_FILE} names no 'qa_ledger:', so no open question can be attached to any ` +
    `artifact. Point it at the project's .method/qa.yaml (ADR-062 §5)`)
}
const LEDGER_FILE = String(config.qa_ledger)
if (!existsSync(join(ROOT, LEDGER_FILE))) die(`${CONFIG_FILE}: qa_ledger '${LEDGER_FILE}' does not exist`)
const ledger = readQaLedger(join(ROOT, LEDGER_FILE), LEDGER_FILE)

// The project's name: the model store the ledger sits in (`Comanda.method/qa.yaml` → Comanda),
// falling back to the config format's speaking term. Both are typed; neither is prose.
const PROJECT = (LEDGER_FILE.split('/')[0].replace(/\.method$/, '') || '') ||
  String(config.format).replace(/^dossier-config\/1_?/, '') || basename(ROOT)

// ── file walking ────────────────────────────────────────────────────────────

function listFiles (absDir, pred, depth = Infinity) {
  const out = []
  const walk = (dir, d) => {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (e.name.startsWith('.') || SKIP_DIR.has(e.name)) continue
      const abs = join(dir, e.name)
      if (e.isDirectory()) { if (d > 0) walk(abs, d - 1) } else if (e.isFile() && pred(abs)) out.push(abs)
    }
  }
  walk(absDir, depth)
  return out
}

// ── the gate records ────────────────────────────────────────────────────────
//
// Every gate record under docs/04_Gates — the directory gate-record-format.md defines as where a
// project's gate records live — whether or not the dossier rail points at it (#1012 decision 3).
// A project that has run the process over a second family keeps those records right beside the
// rail's, and such a record can be PENDING: a gate asking for review asks whichever rail it hangs
// from. Records archived elsewhere in the tree belong to a finished run whose artifacts are that
// run's history, and treating their blessings as current would claim this tree was blessed by a
// gate that reviewed a different one.
//
// Every fault is FATAL, on the dossier rail or off it (#1018): a record that will not parse, one
// with an out-of-vocabulary `status:`, or a blessed one with no `blessed:` date is a record no
// review state can be derived from. There is no warn-and-skip tier — skipping a record silently
// drops the obligations it carries (a pending gate's open items went invisible exactly that way),
// and broken data gets fixed, not tolerated forever.

function readRecords () {
  const dir = join(ROOT, GATES)
  const out = []
  for (const abs of listFiles(dir, p => basename(p) === 'record.yaml')) {
    const file = rel(abs)
    const text = readFileSync(abs, 'utf8')
    if (!/^format: gate-record\//m.test(text)) continue
    const gateDir = posix.dirname(relative(dir, abs).split(sep).join('/'))
    let rec
    try {
      rec = parseYamlWith(text, file, m => { throw new Error(m) })
    } catch (e) {
      die(`${e.message} — the record does not parse as the strict YAML subset gate records are ` +
        `written in. A gate record nothing can parse is a gate record nothing can check: fix the ` +
        `record (process-specs/gate-record-format.md, #1018)`)
    }
    if (rec.status !== 'blessed' && rec.status !== 'pending') {
      die(`${file}: status '${rec.status}' is not 'blessed' or 'pending'`)
    }
    if (rec.status === 'blessed' && !DATE_RE.test(String(rec.blessed ?? ''))) {
      die(`${file}: a blessed record carries no 'blessed: YYYY-MM-DD' date, so nothing can ` +
        `be compared against it (#1016)`)
    }
    out.push({ file, gateDir, rec })
  }
  // Rail order, tie-broken by directory name. The tie is real and routine: a variant walk puts
  // two records under one gate (Comanda's `gate-1-intent/` and `gate-1-intent-reservations/`
  // both carry `gate: intent`), so the rail index alone is not a total order and the sort would come
  // out differently on different filesystems. Off-rail ids sort to −1, i.e. ahead of the rail —
  // they are the ones a reader most needs to see, and they were unordered before this anyway.
  return out.sort((a, b) =>
    railIndexOf(a.rec.gate) - railIndexOf(b.rec.gate) ||
    (a.gateDir < b.gateDir ? -1 : a.gateDir > b.gateDir ? 1 : 0))
}

const records = readRecords()
if (!records.length) {
  die(`no readable gate record under ${GATES} — nothing has curated an artifact for review, so ` +
    `there is no review state to derive (ADR-062 §5)`)
}

// ── the artifact set ────────────────────────────────────────────────────────
//
// Backbone: `sections[].artifacts[]` from every record — already a human-curated, labelled
// inventory of what somebody reviews at a gate (ADR-062 §3). A record may name a DIRECTORY (the
// dossier counts the files in it); here it expands to one index entry per file, because the unit
// of review state is the file git can date.

const artifacts = new Map()   // project-relative path → entry

function entryFor (path, kind = null) {
  let e = artifacts.get(path)
  if (!e) {
    e = { path, label: null, kind: kind ?? kindOf(path), gates: [], obligations: [] }
    artifacts.set(path, e)
  }
  return e
}

function nameArtifact (path, label, gate, kind = null) {
  const e = entryFor(path, kind)
  if (e.label === null) e.label = label
  if (gate && !e.gates.some(g => g.dir === gate.dir)) e.gates.push(gate)
  return e
}

// A REVIEW ACT RECORDED AGAINST ONE ARTIFACT DISCHARGES THAT ARTIFACT'S CLAIM ON THAT GATE.
//
// `resource_protocols` (ADR-059, gate-record-format.md) is the one block that records a review
// act PER ARTIFACT rather than per gate: one row per Resource Protocol Sheet, each carrying the
// reviewed sheet's `path` and the reviewer's `verdict`. A `green` row says the named reviewer
// blessed that sheet. The derivation never read the block, so a sheet named by a pending gate
// read `review-owed` for ever, however green its row — on the Figaro run all fourteen sheets
// read owed against a record that had carried `verdict: green` for all fourteen since the night
// before (figaro#566). A review act that WAS performed did not appear on the page the Software
// Architect reads to see what is outstanding, which is the one thing this surface is for.
//
// `verdict` is a typed field of a closed vocabulary, so this branches on a type and reads no
// prose (ADR-062 §2). A row SHORT of green — `amber` (a ruling owed) or `red` (open) — is still
// owed and is left exactly as it was: the discharge is green-only, on purpose.
//
// THE ROW'S OWN DATE IS WHAT MAKES IT A BLESSING RATHER THAN A BARE DISCHARGE. #1016 makes
// `blessed:` REQUIRED on a blessed record and REFUSED on a pending one, so a pending record
// dates nothing — and the review act recorded here is routinely performed WHILE the gate is
// still pending, which is the Figaro case exactly. The sheet row therefore carries its own
// optional `on: YYYY-MM-DD`, the day the named reviewer gave that verdict
// (`process-specs/gate-record-format.md`), and this surface treats it as a blessing of that one
// artifact on that one day. Without it the surface could only say "no longer owed" and would
// have to keep reading the artifact off an older, staler blessing — which on Figaro would have
// dated fourteen sheets 2026-09-07 for a review act performed on 2026-09-11, four days later.
//
// A row with a `verdict` but no `on` still DISCHARGES: it stops the gate asking for an act that
// was performed, and the artifact then reads off whatever dated blessing it already has. No
// blessing date is ever invented — day resolution is the whole precision this surface claims.
//
// The dating is what keeps the mechanism honest in the other direction too: a sheet that moved
// AFTER its verdict reads `changed-since-blessed` against the verdict's own day, so signing a
// sheet green does not silence the next edit to it.
function dischargedBy (rec, file) {
  const out = new Map()
  const rp = rec.resource_protocols
  for (const sh of Array.isArray(rp?.sheets) ? rp.sheets : []) {
    if (!sh || typeof sh !== 'object' || !sh.path) continue
    if (String(sh.verdict ?? '') !== 'green') continue
    const on = sh.on === undefined ? null : String(sh.on)
    if (on !== null && !DATE_RE.test(on)) {
      die(`${file}: resource_protocols sheet '${sh.name ?? sh.path}' carries 'on: ${on}', which ` +
        `is not a 'YYYY-MM-DD' date. The day a verdict was given is what dates the blessing of ` +
        `that sheet, and a date nothing can compare is a date nothing can use (#1016)`)
    }
    out.set(posix.join(...String(sh.path).split(sep)), on)
  }
  return out
}

for (const r of records) {
  const gate = {
    dir: r.gateDir,
    // The rail id the record answers for. Carried here so the deciding-gate sort below can key
    // on the rail rather than on `dir` — the directory name is a project's own spelling, and
    // ordering by it is what ADR-064 condition (b) removes.
    railIndex: railIndexOf(r.rec.gate),
    status: r.rec.status,
    blessedOn: r.rec.status === 'blessed' ? String(r.rec.blessed) : null,
    // The artifacts this record records a per-artifact review act on, each mapped to the day it
    // was given or to `null` when the row is undated (see above).
    discharged: dischargedBy(r.rec, r.file),
  }
  for (const s of Array.isArray(r.rec.sections) ? r.rec.sections : []) {
    for (const a of Array.isArray(s?.artifacts) ? s.artifacts : []) {
      if (!a || typeof a !== 'object' || !a.path) continue
      const abs = join(ROOT, String(a.path))
      if (!existsSync(abs)) {
        warn(`${r.file}: artifact path '${a.path}' does not exist — it is not an artifact the ` +
          `project has, so it is left out of the index`)
        continue
      }
      const label = String(a.label ?? a.path)
      // A record that names a non-live drawing by hand is still not asking for a review act on
      // it, so it is dropped here too rather than only in the directory expansion below.
      if (statSync(abs).isFile()) {
        if (!isNonLive(rel(abs), abs)) nameArtifact(rel(abs), label, gate)
        continue
      }
      // A non-live DIRECTORY curates nothing: drop it whole rather than let it fall through to
      // the empty-expansion case below, which would put the parked folder itself into the index
      // as one `directory` entry the moment its drawings were filtered out of it.
      if (isNonLive(rel(abs), abs)) continue
      // A directory: the record's own `ext`/`depth` narrow it, exactly as the dossier counts it,
      // and it expands to one entry per file the KIND TABLE names. A directory whose files the
      // table does not name — a C# spec tree, a folder of rendered images — stays ONE entry for
      // the directory the gate curated. That is ADR-062 §4 held to: code is not in this build, and
      // a Gate-3 record naming `csharp/Spec/` would otherwise put 300 `.cs` files into the index
      // as individual entries through the side door. The curated artifact is never lost; it is
      // just the directory, which is the granularity the gate reviewed it at.
      const depth = a.depth === undefined ? Infinity : parseInt(a.depth, 10)
      const ext = a.ext === undefined ? null : String(a.ext)
      const files = listFiles(abs, p => (ext ? p.endsWith(ext) : true), depth)
        .filter(p => kindOf(rel(p)) !== 'other' && !isNonLive(rel(p), p))
      if (!files.length) { nameArtifact(rel(abs), label, gate, 'directory'); continue }
      for (const f of files) nameArtifact(rel(f), `${label} — ${relative(abs, f).split(sep).join('/')}`, gate)
    }
  }
}

// The ledger is an artifact of the project too, and it is the home of every open question whose
// `blocks` ids name nothing on disk — a parked thread (`blocks: []`) by construction, or an id
// for something not yet written. Without it those questions would simply vanish from a surface
// that exists to carry them.
nameArtifact(LEDGER_FILE, 'Q&A ledger', null)

// The sweep (ADR-062 §3): what the curated lists miss. "What has nobody looked at?" is one of the
// questions this surface exists to answer, so an artifact in no gate record is `unreviewed` — not
// absent.
for (const abs of listFiles(join(ROOT, 'docs'), p => SWEEP_EXT.some(x => p.endsWith(x)))) {
  const p = rel(abs)
  if (!artifacts.has(p) && !isNonLive(p, abs)) entryFor(p)
}

// ── git: when was each artifact last touched ────────────────────────────────
//
// `changed-since-blessed` is derived from git rather than from a checksum written into the record
// at blessing time: a checksum would be a second original of a fact git already holds exactly
// (ADR-062, resolved questions). One `git log` pass over the project root maps every tracked path
// to its newest commit date; a path the pass did not see falls back to its own `git log -1`,
// which also covers the paths git quotes because of an unusual character.

const git = (...args) => spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 })

const top = git('rev-parse', '--show-toplevel')
if (top.error || top.status !== 0) {
  die(`${ROOT_ARG} is not inside a git repository (${(top.stderr || top.error?.message || '').trim()}). ` +
    `'changed-since-blessed' is derived from git history, so a checkout without it cannot ` +
    `produce a review surface (ADR-062 §2)`)
}
const PREFIX = (() => {
  const r = relative(top.stdout.trim(), ROOT)
  return r ? posix.join(...r.split(sep)) + '/' : ''
})()

const lastCommit = new Map()
{
  const log = git('-c', 'core.quotepath=false', 'log', '--format=%x00%cI', '--name-only', '--', '.')
  // An empty repository exits non-zero here ("does not have any commits yet"). That is not a
  // failure of the derivation: nothing is committed, so nothing can be shown older than a
  // blessing, and every blessed artifact reads `changed-since-blessed` below.
  if (log.status === 0) {
    for (const chunk of log.stdout.split('\0')) {
      const lines = chunk.split('\n')
      const iso = lines[0].trim()
      if (!iso) continue
      for (const name of lines.slice(1)) {
        if (!name || name.startsWith('"')) continue
        if (PREFIX && !name.startsWith(PREFIX)) continue
        const p = name.slice(PREFIX.length)
        if (!lastCommit.has(p)) lastCommit.set(p, iso)
      }
    }
  }
}

function lastChangedOf (p) {
  if (lastCommit.has(p)) return lastCommit.get(p)
  const r = git('log', '-1', '--format=%cI', '--', p)
  const iso = r.status === 0 ? r.stdout.trim() : ''
  lastCommit.set(p, iso || null)
  return iso || null
}

// ── obligations ─────────────────────────────────────────────────────────────
//
// An obligation is an ATTRIBUTE of an artifact (ADR-062 §1). Four sources, and each attaches
// where the human answers it:
//
//   question     — an OPEN ledger entry, attached to every artifact its `blocks` ids name
//   confirmation — a `confirm:` item on a PENDING gate record, attached to that record
//   check        — a NON-GREEN `checks:` row on a PENDING gate record, ditto (#1049)
//   open-item    — an `open:` item still `state: open` on a PENDING gate record, ditto
//
// PENDING records only, for open items as well as confirmations (#1012 decision 2):
// gate-record-format.md requires every item still open on an earlier gate's record to re-appear
// on the pending one, so reading blessed records too would duplicate every carried item and
// resurrect the ones already closed.
//
// A gate obligation has no audience of its own — it is `architect` by construction, because a
// gate is the Software Architect's review.

// An id from a ledger entry's `blocks` list matches an artifact when it appears as a whole token
// in the artifact's PATH — `BP07` in `…/BP07_DeliverOrder/SI07.01.md`, `SI07.01` in its file
// name. A token, so `BP01` never matches `BP012`. Deliberately the path and not the label: a
// label is prose a human wrote, and this derivation does not read prose.
const alnum = c => c !== undefined && /[A-Za-z0-9]/.test(c)
function pathNames (path, id) {
  let at = path.indexOf(id)
  while (at !== -1) {
    if (!alnum(path[at - 1]) && !alnum(path[at + id.length])) return true
    at = path.indexOf(id, at + 1)
  }
  return false
}

const paths = [...artifacts.keys()]
let unattachedQuestions = 0
for (const e of ledger.entries.values()) {
  if (e.status !== 'open') continue
  if (!AUDIENCES.includes(e.audience)) {
    die(`${LEDGER_FILE}:${e.line}: open entry ${e.id} carries no 'audience: owner|architect'. ` +
      `The review surface BRANCHES on who can settle a question, and anything a derivation ` +
      `branches on is a typed field (ADR-062 §2) — process-specs/qa-ledger-format.md`)
  }
  const ob = {
    id: e.id,
    kind: 'question',
    audience: e.audience,
    ref: null,
    title: e.question ?? '',
    since: e.asked ?? null,
    context: e.source ?? null,
    gate: null,
    authority: null,
    source: { file: LEDGER_FILE, line: e.line },
  }
  const blocks = Array.isArray(e.blocks) ? e.blocks : (e.blocks ? [String(e.blocks)] : [])
  const hits = paths.filter(p => blocks.some(id => pathNames(p, String(id))))
  if (hits.length) for (const p of hits) artifacts.get(p).obligations.push(ob)
  else { artifacts.get(LEDGER_FILE).obligations.push(ob); unattachedQuestions++ }
}

for (const r of records) {
  if (r.rec.status !== 'pending') continue
  const home = entryFor(r.file)
  if (home.label === null) home.label = `Gate record — ${r.gateDir}`
  const confirms = Array.isArray(r.rec.confirm) ? r.rec.confirm : []
  confirms.forEach((cf, i) => {
    if (!cf || typeof cf !== 'object') return
    // The quote and its Lesart are SEPARATE FIELDS (#1049). They used to be one: `context`
    // carried the verbatim `ruling`, which on the Figaro Gate-3 record is 4'600 characters, and
    // a surface that renders `context` renders that wall. A consumer cannot collapse what it
    // cannot tell apart, so the wire tells them apart: `quote` is the ruling that GOVERNS,
    // `digest` is the two-or-three-sentence reading a reader can take in, and `context` stays
    // what it is on every other kind — the short prose. `digest` resolves from the item, else
    // from the ledger entry `authority:` names (gate-record-format.md); `null` when neither has
    // one, and the consumer then says so rather than inventing a summary.
    const quote = typeof cf.ruling === 'string' && cf.ruling.trim() !== '' ? cf.ruling : null
    const ownDigest = typeof cf.digest === 'string' && cf.digest.trim() !== '' ? cf.digest : null
    const led = ledger.entries.get(String(cf.authority ?? ''))
    const ledDigest = typeof led?.digest === 'string' && led.digest.trim() !== '' ? led.digest : null
    const digest = quote === null ? null : (ownDigest ?? ledDigest)
    home.obligations.push({
      id: `${r.gateDir}#confirm-${i + 1}`,
      kind: 'confirmation',
      audience: 'architect',
      ref: null,
      title: cf.text ?? '',
      since: null,
      context: digest ?? cf.basis ?? null,
      digest,
      quote,
      gate: r.gateDir,
      authority: cf.authority ?? null,
      source: { file: r.file, line: cf[LINE] ?? null },
    })
  })
  // Every check row that is NOT green (#1049). The derivation ignored `checks:` entirely, so
  // the one question a reviewer asks first at a pending gate — "which checks are not green?" —
  // had no answer on this surface at all; the Software Architect had to open the record. An
  // amber row is a RULING OWED and a red row is OPEN: both are things the gate can only cross
  // by somebody knowingly accepting them, which makes them obligations by the same definition
  // a confirm item is one. `green` and `info` stay what they are — evidence the dossier renders.
  const checks = Array.isArray(r.rec.checks) ? r.rec.checks : []
  checks.forEach((ck, i) => {
    if (!ck || typeof ck !== 'object') return
    const verdict = String(ck.verdict ?? '')
    if (verdict !== 'amber' && verdict !== 'red') return
    home.obligations.push({
      id: `${r.gateDir}#check-${i + 1}`,
      kind: 'check',
      audience: 'architect',
      // The tracking ref is the reader's way from "not green" to the issue holding it. A check
      // row's `ref` is optional in the format, so `null` is a real answer here.
      ref: ck.ref ?? null,
      title: ck.name ?? '',
      since: null,
      context: ck.result ?? null,
      verdict,
      gate: r.gateDir,
      authority: ck.authority ?? null,
      source: { file: r.file, line: ck[LINE] ?? null },
    })
  })
  let openSeq = 0
  for (const o of Array.isArray(r.rec.open) ? r.rec.open : []) {
    if (!o || typeof o !== 'object') continue
    openSeq++
    if (o.state !== 'open') continue
    home.obligations.push({
      id: `${r.gateDir}#open-${++openSeq}`,
      kind: 'open-item',
      audience: 'architect',
      // #1012 decision 1: `ref` is mandatory on a gate record's open items and the dossier
      // renders it as the tracker link. The obligation carries it, or the reader has no way
      // back to the issue.
      ref: o.ref ?? null,
      title: o.text ?? '',
      since: null,
      context: null,
      gate: r.gateDir,
      authority: null,
      source: { file: r.file, line: o[LINE] ?? null },
    })
  }
}

// ── review state ────────────────────────────────────────────────────────────
//
// An artifact carrying an open obligation ranks with `review-owed` regardless of its gate state
// (ADR-062 §3) — that is the case the ADR calls out by name: a thing sitting behind a blessed
// gate with a question still open against it.
//
// The blessing comparison is at DAY resolution and the blessing day is inclusive: `blessed:` is a
// date, the blessing was pronounced at the end of the work that produced it, and a finer
// resolution would be invented precision. A commit ON the blessing day is not a change since it.
//
// Both sorts below decide WHICH gate an artifact is filed under when several name it, and both
// key on the rail (`railIndex`), tie-broken by directory name. The earliest pending gate on the
// rail is the one that owes the reader an answer first; among blessings on one day the earlier
// gate stays the deciding one, which is what the directory-name tie-break happened to do while
// gate directories were numbered.

for (const e of artifacts.values()) {
  e.lastChanged = lastChangedOf(e.path)
  const byRail = (a, b) => a.railIndex - b.railIndex || (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0)
  // A pending gate that has already recorded its review act on THIS artifact no longer owes
  // one — `discharged` is that record, read off the typed `verdict` (see `dischargedBy`).
  const pending = e.gates.filter(g => g.status === 'pending' && !g.discharged.has(e.path)).sort(byRail)
  // Every DATED blessing this artifact has, newest first. Two shapes produce one: a gate that
  // blessed its whole record (the record's `blessed:`), and a gate that recorded a dated review
  // act on this one artifact (a `resource_protocols` sheet row's `on:`). Both are a named
  // reviewer's act on a day, so both date a blessing, and one gate can contribute both.
  const blessedBy = []
  for (const g of e.gates) {
    if (g.status === 'blessed') blessedBy.push({ dir: g.dir, railIndex: g.railIndex, blessedOn: g.blessedOn })
    const on = g.discharged.get(e.path)
    if (on !== undefined && on !== null) blessedBy.push({ dir: g.dir, railIndex: g.railIndex, blessedOn: on })
  }
  blessedBy.sort((a, b) => (a.blessedOn < b.blessedOn ? 1 : a.blessedOn > b.blessedOn ? -1 : byRail(a, b)))
  const latest = blessedBy[0] ?? null

  if (e.obligations.length) {
    e.reviewState = 'review-owed'
    // A pending record's own entry is created by its obligations, not by any gate's artifact
    // list — the obligation's typed `gate` field is what files it under the gate it belongs to.
    e.gate = (pending[0] ?? latest)?.dir ?? e.obligations.find(o => o.gate !== null)?.gate ?? null
  } else if (pending.length) {
    e.reviewState = 'review-owed'
    e.gate = pending[0].dir
    // The re-walk delta: the process is walked again for every version, and a re-opened gate
    // re-names artifacts an earlier walk already blessed. One that has not moved since that
    // blessing is CARRIED OVER — still owed (a pending gate asks for it), but the reader's real
    // work at a re-opened gate is the new and the changed, and this typed flag is what lets a
    // surface fold the rest away without hiding it. Same day-resolution comparison as
    // `changed-since-blessed`; `blessedOn` (set below) carries the prior blessing's date.
    if (latest && e.lastChanged !== null && e.lastChanged.slice(0, 10) <= latest.blessedOn) {
      e.carriedOver = true
    }
  } else if (latest) {
    // A path git has never recorded cannot be shown to predate the blessing, and the blessing was
    // pronounced over committed history — so an uncommitted file is a change since it.
    const changed = e.lastChanged === null || e.lastChanged.slice(0, 10) > latest.blessedOn
    e.reviewState = changed ? 'changed-since-blessed' : 'blessed'
    e.gate = latest.dir
  } else {
    e.reviewState = 'unreviewed'
    e.gate = null
  }
  e.blessedOn = latest?.blessedOn ?? null
  if (e.label === null) e.label = e.path
  e.audiences = [...new Set(e.obligations.map(o => o.audience))].sort()
}

// ── the document ────────────────────────────────────────────────────────────

const order = new Map(STATES.map((s, i) => [s, i]))
const all = [...artifacts.values()].sort((a, b) =>
  order.get(a.reviewState) - order.get(b.reviewState) ||
  (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) ||
  (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

// Counts are over the WHOLE derivation, never over the filtered view: `--state` and `--audience`
// are the caller's convenience, and a count that moved with a filter would report the filter
// rather than the project (ADR-062 §1 — nothing is hidden; filtering is the reader's choice).
const counts = { total: all.length }
for (const s of STATES) counts[COUNT_KEY[s]] = 0
for (const e of all) counts[COUNT_KEY[e.reviewState]]++

const shown = all.filter(e =>
  (wantState === null || e.reviewState === wantState) &&
  (wantAudience === null || e.audiences.includes(wantAudience)))

// ── the rail ────────────────────────────────────────────────────────────────
//
// The Diamond rail as a `gates` section: all nine RAIL_DEF entries in template order, then every
// off-rail gate record the sweep read (`onRail: false`) — a second walk's records sit right
// beside the rail's, and "nothing hidden" applies to the rail too. States are typed exactly as
// dossier-build reads them (unknown id / out-of-vocabulary state: fatal, #1018), and where a
// record exists the RECORD's status and blessing date win over the rail entry — the record is
// the gate-exit artifact, the rail entry is the run's summary of it.
//
// Per-gate counts are tallied over each artifact's DECIDING gate (`e.gate`), over the whole
// derivation — never the `--state`/`--audience` view (same rule as the top-level counts). Stage
// entries carry `counts: null`: "produced in this stage" is a lens over the stage's exit gate,
// and emitting the tally twice would be a second original of it.

const railProject = new Map()
for (const r of Array.isArray(config.rail) ? config.rail : []) {
  if (!r || typeof r !== 'object' || r.id === undefined) {
    die(`${CONFIG_FILE}: rail entry is not an 'id:'-carrying mapping`)
  }
  const def = RAIL_DEF.find(d => d.id === r.id)
  if (!def) die(`${CONFIG_FILE}: unknown rail id '${r.id}'`)
  const vocab = def.kind === 'gate' ? GATE_STATES : STAGE_STATES
  if (!vocab.includes(String(r.state))) {
    die(`${CONFIG_FILE}: rail ${r.id} state '${r.state}' is not one of ${vocab.join(' | ')}`)
  }
  railProject.set(r.id, r)
}

const recordByDir = new Map(records.map(r => [r.gateDir, r.rec]))
const zeroCounts = () => ({
  reviewOwed: 0, carriedOver: 0, changedSinceBlessed: 0, unreviewed: 0, blessed: 0,
  obligations: 0, total: 0,
})
const gateCounts = new Map()
for (const e of all) {
  if (e.gate === null) continue
  let c = gateCounts.get(e.gate)
  if (!c) gateCounts.set(e.gate, c = zeroCounts())
  c[COUNT_KEY[e.reviewState]]++
  if (e.carriedOver) c.carriedOver++
  c.obligations += e.obligations.length
  c.total++
}

const gates = RAIL_DEF.map(d => {
  const proj = railProject.get(d.id)
  const recDir = proj?.record !== undefined ? String(proj.record) : null
  const rec = recDir === null ? undefined : recordByDir.get(recDir)
  return {
    id: d.id,
    kind: d.kind,
    title: d.name,
    status: rec ? rec.status : String(proj?.state ?? 'locked'),
    record: recDir,
    blessedOn: rec?.status === 'blessed' ? String(rec.blessed) : null,
    onRail: true,
    counts: d.kind === 'gate' ? (recDir === null ? zeroCounts() : gateCounts.get(recDir) ?? zeroCounts()) : null,
  }
})
{
  const onRail = new Set(gates.map(g => g.record).filter(r => r !== null))
  const speakingOf = new Map(RAIL_DEF.map(d => [d.id, d.name]))
  for (const r of records) {
    if (onRail.has(r.gateDir)) continue
    const speaking = speakingOf.get(String(r.rec.gate))
    gates.push({
      id: r.gateDir,
      kind: 'gate',
      title: speaking ? `${speaking} — ${r.gateDir}` : r.gateDir,
      status: r.rec.status,
      record: r.gateDir,
      blessedOn: r.rec.status === 'blessed' ? String(r.rec.blessed) : null,
      onRail: false,
      counts: gateCounts.get(r.gateDir) ?? zeroCounts(),
    })
  }
}

const doc = {
  format: 'review-surface/1',
  project: PROJECT,
  artifacts: shown.map(e => ({
    id: e.path,
    label: e.label,
    kind: e.kind,
    path: e.path,
    reviewState: e.reviewState,
    gate: e.gate,
    blessedOn: e.blessedOn,
    lastChanged: e.lastChanged,
    ...(e.carriedOver ? { carriedOver: true } : {}),
    audiences: e.audiences,
    obligations: e.obligations,
  })),
  gates,
  counts,
}

if (asJson) {
  process.stdout.write(JSON.stringify(doc, null, 2) + '\n')
} else {
  const lines = []
  lines.push(`${doc.project} — review surface (${counts.total} artifact(s))`)
  for (const s of STATES) lines.push(`  ${s.padEnd(22)} ${String(counts[COUNT_KEY[s]]).padStart(5)}`)
  lines.push('', '── rail ──')
  for (const g of gates) {
    if (g.kind !== 'gate') continue
    const c = g.counts
    const delta = c.reviewOwed - c.carriedOver
    const tail = g.status === 'pending'
      ? ` — ${delta} owed${c.carriedOver ? ` (+${c.carriedOver} carried over)` : ''}`
      : g.status === 'blessed' ? ` ${g.blessedOn}` : ''
    lines.push(`  ${(g.onRail ? g.id : '·').padEnd(3)} ${g.title.padEnd(30)} ${g.status}${tail}`)
  }
  if (unattachedQuestions) {
    lines.push(`  (${unattachedQuestions} open question(s) name no artifact on disk — attached to ${LEDGER_FILE})`)
  }
  let state = null
  for (const e of shown) {
    if (e.reviewState !== state) { state = e.reviewState; lines.push('', `── ${state} ──`) }
    const ob = e.obligations.length
      ? `  [${e.obligations.length} owed: ${e.obligations.map(o => o.id).join(', ')}]`
      : ''
    lines.push(`  ${e.kind.padEnd(18)} ${e.path}${ob}`)
    if (e.reviewState === 'changed-since-blessed') {
      lines.push(`  ${' '.repeat(18)}   blessed ${e.blessedOn} at ${e.gate}, last changed ${e.lastChanged ?? 'never committed'}`)
    }
    if (e.carriedOver) {
      lines.push(`  ${' '.repeat(18)}   carried over — blessed ${e.blessedOn}, unchanged since`)
    }
  }
  if (wantState || wantAudience) {
    lines.push('', `(${shown.length} of ${counts.total} shown — the counts above are the whole project)`)
  }
  process.stdout.write(lines.join('\n') + '\n')
}
