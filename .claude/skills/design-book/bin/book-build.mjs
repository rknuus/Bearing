#!/usr/bin/env node
// book-build — the project's Design Book (ADR-052).
//
//   node book-build.mjs <project-root> [--check]
//
// Reads <project-root>/docs/00_Design-Book/book.yaml (design-book/1_*) plus
// the live project tree, and emits the chaptered book beside it: persistent
// left sidebar, reading order = the process timeline, DDC content order.
// Prose that already exists in the tree is extracted, never re-typed: BP
// narratives from the BP markdowns' `## Description` section (heading
// configurable via book.yaml `bp_description_heading` — the BP documents stay
// in the stakeholder's language, #1024), screen blurbs from the .vw doc
// blocks, diagrams as the generated SVGs inline.
//
// Deterministic; --check regenerates in memory and exits 1 on drift. An input
// a later stage has not produced yet (no BP markdowns, no screen models, no
// Method model, no call chains, no spec dir, an unconducted gate's dossier)
// renders its chapter as a PLANNED outline instead of failing the build
// (#1021): absent means the stage has not run, and the book must build from
// the first stage onward. Inputs that exist but are broken stay fatal, as do
// missing files referenced by an existing artifact — except SI diagrams whose
// SVG is not yet rendered, which become linked placeholders (per ADR-052).
//
// Zero dependencies; strict YAML-subset parser (the strictness IS the format
// validation — same regime as the gate-dossier and qa-ledger parsers).

import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve, relative, basename, dirname, posix, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── template: parts & chapters (process-owned; identical in every project) ──

const PARTS = ['The Business', 'The System', 'The Contract', 'Construction & Acceptance']

const CHAPTERS = [
  { id: 'company', n: 1, part: 0, title: 'The company & the problem', kind: 'narrative', key: 'company', file: 'index.html' },
  { id: 'scope', n: 2, part: 0, title: 'Scope & anti-requirements', kind: 'narrative', key: 'scope' },
  { id: 'processes', n: 3, part: 0, title: 'The business processes', kind: 'processes' },
  { id: 'screens', n: 4, part: 0, title: 'The screens', kind: 'screens' },
  { id: 'business-map', n: 5, part: 0, title: 'The business map', kind: 'narrative', key: 'businessMap' },
  { id: 'gate-intent', n: 6, part: 0, title: 'Intent', kind: 'gate', key: 'intent' },
  { id: 'volatility', n: 7, part: 1, title: 'Volatility analysis', kind: 'volatility' },
  { id: 'architecture', n: 8, part: 1, title: 'The static architecture', kind: 'architecture' },
  { id: 'components', n: 9, part: 1, title: 'Component catalog', kind: 'components' },
  { id: 'use-cases', n: 10, part: 1, title: 'Use-case realization', kind: 'usecases' },
  { id: 'gate-blueprint', n: 11, part: 1, title: 'Blueprint', kind: 'gate', key: 'blueprint' },
  { id: 'proving', n: 12, part: 2, title: 'How the system is proven', kind: 'narrative', key: 'proving' },
  { id: 'specs', n: 13, part: 2, title: 'The specs, readable', kind: 'specs' },
  { id: 'rulings', n: 14, part: 2, title: 'Open rulings', kind: 'narrative', key: 'rulings' },
  { id: 'gate-contract', n: 15, part: 2, title: 'Contract', kind: 'gate', key: 'contract' },
  { id: 'construction', n: 16, part: 3, title: 'Construction', kind: 'stub', outline: ['Opens with the Construction stage: the machine-construction record and its verification evidence.'] },
  { id: 'gate-acceptance', n: 17, part: 3, title: 'Acceptance', kind: 'stub', outline: ['Opens at the Acceptance gate: the hidden acceptance partition and the client-tier E2E against the built system.'] },
]
for (const c of CHAPTERS) c.file ??= `${String(c.n).padStart(2, '0')}-${c.id}.html`

// ── chrome strings (#1023) ─────────────────────────────────────────────────
// The chrome's STRUCTURE is template-owned, but its LANGUAGE is the project's:
// the book is a business-facing artifact, and a stakeholder who does not read
// English gets German content in an English frame otherwise. Every
// user-visible template string has a key here and may be overridden — never
// restructured — via book.yaml `strings:` (same regime as
// `bp_description_heading`, #1024); `language:` sets the <html lang>
// attribute. Defaults are today's English, so a project declaring neither
// renders byte-identically. `{name}` placeholders are filled by the
// generator; a value is inserted exactly where its English default sits, so
// it inherits that site's treatment (titles, outlines and alt/aria texts are
// escaped as plain text; the prose ledes and the footer may carry the same
// inline HTML their defaults do).
const PART_KEYS = ['part_business', 'part_system', 'part_contract', 'part_construction']
const strKey = id => id.replace(/-/g, '_')

const DEFAULT_STRINGS = {
  // chapter 3 — the business processes
  bp_full_document: 'Full process document',
  bp_the_process: 'The process',
  bp_level1: 'Level 1 — every stakeholder step',
  bp_level2: 'Level 2 — System Interactions collapsed',
  bp_si_heading: 'System Interactions ({count})',
  bp_no_si: 'This process introduces no System Interactions of its own.',
  alt_bp_l1: '{num} level-1 BPMN',
  alt_bp_l2: '{num} level-2 BPMN',
  doc_link: 'doc',
  // #1148 — the BP lifecycle badges + ledes. A non-live process is never listed silently
  // among the live ones: the badge marks it in the heading, the chapter TOC and the sidebar,
  // and the lede says what happened before the reader sees a live-looking drawing.
  bp_status_dissolved: 'dissolved',
  bp_status_retired: 'retired',
  bp_status_parked: 'parked — not built',
  bp_status_dissolved_lede: 'This process was dissolved — its subject moved into {successor}. The drawing below is history, kept readable on purpose.',
  bp_status_retired_lede: 'This process was retired with no successor. The drawing below is history, kept readable on purpose.',
  bp_status_parked_lede: 'This process is parked: fully modeled, deliberately not built and not approved — it may yet be picked up.',
  // chapter 4 — the screens
  screens_model_note: 'Wireframe is a view of the model — the model is {model}.',
  alt_wireframe: '{num} wireframe',
  // gate chapters
  gate_dossier_link: 'Open the Gate dossier — evidence, artifact inventory, open rulings',
  gate_planned_note: 'This gate has not been conducted yet — its dossier links here once the gate review happens.',
  // PLANNED rendering (#1021)
  planned_pill: 'PLANNED',
  planned_note: 'This chapter fills in when its stage is presented in the book.',
  planned_processes: 'Opens with Discovery: one section per business process — narrative, level-1/level-2 BPMN, and its System Interaction diagrams, all extracted live from the BP markdowns.',
  planned_screens: 'Opens with Mockup: one section per screen model — blurb and wireframe, extracted live from the .vw models.',
  planned_volatility: 'Opens with Design: the volatility analysis extracted from the blessed Method model — what changes, the evidence, and the component(s) encapsulating it.',
  planned_architecture: 'Opens with Design: the static architecture generated from the blessed Method model — the layered component diagram.',
  planned_components: 'Opens with Design: the component catalog extracted from the blessed Method model — every component, its facets, and their operations.',
  planned_usecases: 'Opens with Design: every use case realized as a call chain, extracted from the generated call-chain documents.',
  planned_specs: 'Opens with Specification: the visible spec partition, readable — the frozen oracle the test-blind implementor builds against.',
  // chapter 7 — volatility analysis
  volatility_lede: `The Method’s first law: components encapsulate <em>your</em> volatilities, discovered from
  <em>your</em> business — every box in the next chapter exists because a row below says something
  will change and names the interview evidence. {count} volatilities
  were identified; each is encapsulated by exactly the component(s) listed.`,
  volatility_th_name: 'Volatility',
  volatility_th_what: 'What changes — and the evidence',
  volatility_th_enc: 'Encapsulated by',
  volatility_rejected_heading: 'Considered and rejected',
  volatility_rejected_lede: `Candidates examined and deliberately not encapsulated — the anti-design record:
knowing what was rejected protects the decomposition as well as knowing what was kept.`,
  volatility_th_candidate: 'Candidate',
  volatility_th_why: 'Why it is not a component',
  // chapter 8 — the static architecture
  architecture_lede: `The static architecture, generated from the blessed model: {count} components in the
  Method’s five layers. Closed layering — Clients call Managers; Managers call Engines and
  ResourceAccess; only a ResourceAccess touches a Resource. Every box traces to a volatility in
  the previous chapter; the catalog in the next chapter says what each one does.`,
  architecture_note: `Utilities (logging, metrics, hosting) are deliberately not modeled: they are not found
  by volatility analysis — they come with every system and appear at detail design without
  disturbing the decomposition. Resource technology is a deployment view, not architecture: the
  model is product-free, and the concrete stores are bound outside it.`,
  architecture_aria: 'Layered component diagram: {count} components across Clients, Managers, Engines, ResourceAccess and Resources',
  components_future_badge: 'not built yet',
  components_future_title: 'Decided by the design, deliberately not built in this cycle (design big, build small). It has no facets, no call chains and no encapsulated volatility because the build defers it — not because anything is missing.',
  components_future_note: '{count} component(s) below are marked <em>not built yet</em>: the design decided them, this build deliberately defers them. They are drawn so the decomposition stays whole; they carry no contract because none was written yet.',
  architecture_future_note: 'Dashed outline = decided by the design, deliberately not built in this cycle.',
  // chapter 9 — component catalog
  components_lede: `Every component of the blessed model, in layer order — what it
encapsulates (quoted from the model, with its provenance), its facets, and their operations.`,
  // chapter 10 — use-case realization
  usecases_lede: `Every use case realized as a call chain — Client to Manager, Manager to Engines and
  ResourceAccess, the chain ending at the ResourceAccess. One sequence per variation
  (SQxx.yy.zz); the numbered legs are the same legs the spec layer's stub tables assert
  (the conformance check keeps them in lockstep).`,
  usecases_index_link: 'Call-chain index — SI ↔ CC ↔ SQ, with step counts',
  // chapter 13 — the specs, readable
  specs_lede: `{count} authored cases in the visible partition — this is the frozen oracle the
  test-blind implementor builds against, and exactly what a human reviews at Contract. Every case is
  red-by-design until construction: red on <code>NotImplementedException</code> is the correct
  result while no production code exists. Each file opens to its case inventory; the C# source is
  one more click.`,
  specs_hidden_note: `The hidden acceptance partition is deliberately absent from this book: embedding
  it in the documentation would leak it into the implementor’s view. It is reviewed at source, by
  the Software Architect only, and its coverage is accounted for in the Gate-3 dossier.`,
  specs_group_process: 'Process scenarios',
  specs_group_component: 'Component specs (SI-scoped)',
  specs_group_properties: 'Properties & reference models',
  specs_group_failure: 'Failure contracts',
  specs_group_infra: 'Infrastructure',
  specs_group_stats: '{files} files, {cases} cases',
  specs_cases_one: '{count} case',
  specs_cases_many: '{count} cases',
  specs_support: 'support',
  specs_lines: '{count} lines',
  specs_full_source: 'Full source —',
  specs_th_case: 'Case',
  specs_th_asserts: 'Asserts',
  // sidebar, pager frame, footer
  sidebar_aria_chapters: 'Chapters',
  sidebar_all_documents: 'All documents',
  sidebar_planned_badge: 'planned',
  part_label: 'Part {roman} — {part}',
  footer_generated: 'Generated file — do not edit.',
  footer_provenance: `Built by the {skill} skill (ADR-052)
    from {source} and the live project tree; narratives are extracted from
    the source artifacts, never re-typed. Regenerate: {command}.`,
}
PART_KEYS.forEach((k, i) => { DEFAULT_STRINGS[k] = PARTS[i] })
for (const c of CHAPTERS) {
  DEFAULT_STRINGS[`chapter_${strKey(c.id)}`] = c.title
  if (c.outline) DEFAULT_STRINGS[`outline_${c.id}`] = c.outline[0]
}

// Project layout the extractors read (the stage-A/B tooling contract).
const BP_DIR = 'docs/02_Business/01_Business-Processes'
const SI_DIR = 'docs/02_Business/02_System-Interactions'
const VW_DIR = 'docs/02_Business/06_Screen-Models'
const CC_DIR = 'docs/03_Technology/02_Call-Chains'

// ── strict YAML-subset parser (same regime as gate-dossier) ────────────────

function die (msg) { console.error(`book-build: ${msg}`); process.exit(1) }

function parseYaml (text, file) {
  const raw = text.split('\n')
  const lines = []
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i]
    if (/\t/.test(line)) die(`${file}:${i + 1}: tabs are not allowed`)
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    lines.push({ indent: line.match(/^ */)[0].length, body: trimmed, no: i + 1 })
  }
  let pos = 0
  // A '#' that FOLLOWS WHITESPACE starts a comment wherever it stands, not only at the start of
  // a line (#1082). Before this, `title: "Figaro"   # the product name` kept the quotes and the
  // comment inside the value and printed them onto every page of the book, with no error and no
  // --check complaint; book.yaml is a heavily commented template, so it invites exactly that.
  // The leading-whitespace guard is the conservative rule seqmap already uses: `page#anchor` and
  // a tracker ref like `#812` keep their '#'.
  const stripComment = v => { const cut = v.search(/\s#/); return (cut >= 0 ? v.slice(0, cut) : v).trim() }
  const scalar = v => {
    const q = v.match(/^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/) || v.match(/^'([^']*)'\s*(?:#.*)?$/)
    if (q) return q[1].replace(/\\"/g, '"')
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1).replace(/\\"/g, '"')
    }
    return stripComment(v)
  }
  function parseNode (indent) {
    if (pos >= lines.length || lines[pos].indent < indent) return null
    return lines[pos].body.startsWith('- ') ? parseList(lines[pos].indent) : parseMap(lines[pos].indent)
  }
  function parseMap (indent) {
    const out = {}
    while (pos < lines.length) {
      const l = lines[pos]
      if (l.indent < indent) break
      if (l.indent > indent) die(`${file}:${l.no}: unexpected indent`)
      if (l.body.startsWith('- ')) break
      const m = l.body.match(/^([A-Za-z_][A-Za-z0-9_]*):(?:\s+(.*))?$/)
      if (!m) die(`${file}:${l.no}: expected 'key: value' or 'key:', got: ${l.body}`)
      if (m[1] in out) die(`${file}:${l.no}: duplicate key '${m[1]}'`)
      pos++
      // 'key:   # why' carries a comment, not a value — the block below it is the value.
      if (m[2] !== undefined && !m[2].startsWith('#')) out[m[1]] = scalar(m[2])
      else {
        const child = parseNode(indent + 2)
        if (child === null) die(`${file}:${l.no}: '${m[1]}:' has no indented block`)
        out[m[1]] = child
      }
    }
    return out
  }
  function parseList (indent) {
    const out = []
    while (pos < lines.length) {
      const l = lines[pos]
      if (l.indent < indent) break
      if (l.indent > indent || !l.body.startsWith('- ')) die(`${file}:${l.no}: expected '- ' list item`)
      const rest = l.body.slice(2)
      if (/^[A-Za-z_][A-Za-z0-9_]*:(\s|$)/.test(rest)) {
        lines[pos] = { indent: indent + 2, body: rest, no: l.no }
        out.push(parseMap(indent + 2))
      } else { pos++; out.push(scalar(rest)) }
    }
    return out
  }
  const doc = parseNode(0)
  if (pos < lines.length) die(`${file}:${lines[pos].no}: trailing content`)
  if (doc === null || Array.isArray(doc)) die(`${file}: document must be a mapping`)
  return doc
}

// ── inputs ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2).filter(a => a !== '--check')
const CHECK = process.argv.includes('--check')
if (args.length !== 1) die('usage: book-build <project-root> [--check]')
const ROOT = resolve(args[0])
const OUT = join(ROOT, 'docs', '00_Design-Book')
const CONFIG_FILE = join(OUT, 'book.yaml')
if (!existsSync(CONFIG_FILE)) die(`no ${relative(process.cwd(), CONFIG_FILE)} — not a design-book project`)

const config = parseYaml(readFileSync(CONFIG_FILE, 'utf8'), 'book.yaml')
{
  const m = String(config.format ?? '').match(/^design-book\/1(_[A-Za-z0-9-]+)?$/)
  if (!m) die(`book.yaml: format must be 'design-book/1_<term>' (got '${config.format ?? ''}')`)
}
for (const k of ['title', 'subtitle', 'content', 'gates']) if (config[k] === undefined) die(`book.yaml: missing '${k}'`)

// ── language & string overrides (#1023) — both optional, defaults = today ──

const LANG = (() => {
  const v = config.language ?? 'en'
  if (typeof v !== 'string' || !/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(v)) {
    die(`book.yaml: language must be a BCP 47 tag for the <html lang> attribute (e.g. 'en', 'de-CH'), got '${v}'`)
  }
  return v
})()

const STRINGS = { ...DEFAULT_STRINGS }
if (config.strings !== undefined) {
  if (typeof config.strings !== 'object' || Array.isArray(config.strings)) {
    die("book.yaml: strings must be a mapping of key: text")
  }
  for (const [k, v] of Object.entries(config.strings)) {
    if (!(k in DEFAULT_STRINGS)) {
      die(`book.yaml: strings.${k}: unknown key — the overridable keys are: ${Object.keys(DEFAULT_STRINGS).sort().join(', ')}`)
    }
    if (typeof v !== 'string' || !v.trim()) die(`book.yaml: strings.${k}: must be non-empty text`)
    STRINGS[k] = v
  }
}
const S = k => STRINGS[k]
const fmt = (k, vars = {}) => S(k).replace(/\{(\w+)\}/g, (m, name) => name in vars ? String(vars[name]) : m)
for (const c of CHAPTERS) {
  c.title = S(`chapter_${strKey(c.id)}`)
  if (c.outline) c.outline = [S(`outline_${c.id}`)]
}
PARTS.forEach((_, i) => { PARTS[i] = S(PART_KEYS[i]) })

const problems = []

// ── live extraction from the project tree ───────────────────────────────────

const listDir = (rel, filter) => {
  const abs = join(ROOT, rel)
  if (!existsSync(abs)) { problems.push(`missing directory: ${rel}`); return [] }
  return readdirSync(abs).filter(filter).sort((a, b) => a.localeCompare(b))
}

// BP narrative = the section under the configured `##` heading of the BP
// markdown. The BP documents are the most stakeholder-facing artifacts in the
// tree and stay in the stakeholder's language — the extractor adapts, never
// the documents (#1024): book.yaml `bp_description_heading` names the heading
// (a single value or an ordered list, first match wins), default 'Description'.
const BP_HEADINGS = (() => {
  const v = config.bp_description_heading ?? 'Description'
  const list = Array.isArray(v) ? v : [v]
  if (!list.length || list.some(h => typeof h !== 'string' || !h.trim())) {
    die("book.yaml: bp_description_heading must be a heading (or ordered list of headings) to match after '## '")
  }
  return list
})()

function bpDescription (bpFile) {
  const text = readFileSync(join(ROOT, BP_DIR, bpFile), 'utf8')
  for (const h of BP_HEADINGS) {
    const lit = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Terminate at the next `## ` heading or the absolute end of the document.
    // `(?![\s\S])` is the /m-proof end-of-string anchor: under /m a plain `$`
    // matches at every line end, which truncated the section to its first line (#1027).
    const m = text.match(new RegExp(`^## ${lit}\\s*\\n([\\s\\S]*?)(?=\\n## |\\n*(?![\\s\\S]))`, 'm'))
    if (m) return m[1].split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(p => p && !p.startsWith('!['))
  }
  problems.push(`${BP_DIR}/${bpFile}: no ${BP_HEADINGS.map(h => `'## ${h}'`).join(' / ')} section`)
  return []
}

// A `PascalCaseSlug` read out as words — the last-resort chapter title, for a
// document that names itself nowhere (see bpTitle/vwTitle).
const deCamel = slug => slug.replace(/([a-z])([A-Z])/g, '$1 $2')

// BP chapter title = the name in the BP markdown's own H1, `# <id> — <name>`.
// The BP documents stay in the stakeholder's language and the extractor adapts
// (#1024) — and that holds for their NAMES too: de-camel-casing the filename put a
// German chapter under a machine-made English slug ('Post Pos Receipts To Business
// Central'), a phrase nobody wrote (#1083). The name is taken from the very document
// the narrative comes from, so the two cannot drift, and it needs no book.yaml entry.
// An H1 with no ` — <name>` part (the older documents) keeps the slug title.
function bpTitle (bpFile, id) {
  const h1 = readFileSync(join(ROOT, BP_DIR, bpFile), 'utf8').match(/^#[ \t]+(.+)$/m)
  // Lazy left side: the FIRST dash separates, any later one belongs to the name.
  const name = h1?.[1].match(/^.*?\s+[—–]\s+(.+)$/)?.[1].trim()
  return name || deCamel(id.replace(/^BP\d+_/, ''))
}

// Screen chapter title = the model's own `title "…"` — screen-dsl's stakeholder-facing
// name ("what the user sees"), in the stakeholder's language. Same rule as the BP
// chapters above (#1083). Sections carry a `title` too, so it is the screen's own — the
// first in the file, before any section opens. A model without one keeps the slug title.
function vwTitle (vwFile, id) {
  const m = readFileSync(join(ROOT, VW_DIR, vwFile), 'utf8').match(/^\s*title\s+"([^"]*)"/m)
  return m?.[1].trim() || deCamel(id.replace(/^VW\d+_/, ''))
}

// Screen blurb = the first `doc /* … */` block of the .vw model.
function vwDoc (vwFile) {
  const text = readFileSync(join(ROOT, VW_DIR, vwFile), 'utf8')
  const m = text.match(/doc\s+\/\*([\s\S]*?)\*\//)
  if (!m) { problems.push(`${VW_DIR}/${vwFile}: no doc /* … */ block`); return '' }
  return m[1].replace(/\s+/g, ' ').trim()
}

// Mermaid fence out of a markdown (ADR-053) — the diagram's single source.
function mermaidFence (rel) {
  const m = readFileSync(join(ROOT, rel), 'utf8').match(/```mermaid\n([\s\S]*?)```/)
  if (!m) { problems.push(`${rel}: no \`\`\`mermaid fence`); return '' }
  // A raw ';' in message/note/label text is a mermaid statement separator —
  // the diagram dies with 'Syntax error in text'. Authors write #59; instead.
  for (const line of m[1].split('\n')) {
    const text = line.match(/^\s*(?:Note\b[^:]*|[^:%]*(?:->>|-->>)[^:]*):(.*)$/)?.[1]
    if (text && text.replaceAll('#59;', '').includes(';')) {
      problems.push(`${rel}: raw ';' in mermaid text — breaks the diagram; use #59; (line: ${line.trim().slice(0, 60)}…)`)
    }
  }
  return m[1].trimEnd()
}

function requireFile (rel, owner) {
  if (!existsSync(join(ROOT, rel))) { problems.push(`${owner}: missing ${rel}`); return false }
  return true
}

// #1021: absent ⇒ the stage has not run ⇒ the chapter renders PLANNED (see
// chapterPlanned/plannedBody). A directory that is missing — or present but
// still empty — is the normal state of every project before that stage; only
// inputs that exist but are broken fail the build.
const dirExists = rel => existsSync(join(ROOT, rel))

// #1148 — the BP lifecycle, read from the .bpd header's `status` directive (the same
// machine-readable declaration the diagram build renders as a banner strip). A deliberate
// header line-scan, not a grammar parse — bpmn-dsl owns the grammar; the book needs only the
// state and the successor. Absent directive ⇒ live. This exists because the sibling failure
// is on record: a dissolved process's status reached the sources and never the picture the
// reviewer opens — the book rendered it exactly like the fourteen live ones.
//
// #1268 — the scan reads the WHOLE business-process tree, not `diagrams/` alone. A project may
// keep its non-live sources in a sibling directory for legibility (`parked/future/`,
// `parked/abandoned/`), and a scan that reads one folder reads every one of them as LIVE: the
// badge above existed and never fired for the very case it was written for, while the book went
// on demanding the rendered diagrams of a process whose whole point is that nothing is generated
// from it. The directory is a MIRROR of what the headers already say and never the thing that
// makes a process non-live (tooling contract §1a; status carried by location is refused outright,
// ADR-070 §4) — so the status is read from the header wherever the file sits.
const BPD_MIRROR = { future: 'parked', abandoned: 'retired' }
const bpdSources = []
const walkBpds = rel => {
  for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith('.')) continue
    if (e.isDirectory()) walkBpds(`${rel}/${e.name}`)
    else if (/\.bpd$/i.test(e.name)) bpdSources.push(`${rel}/${e.name}`)
  }
}
if (dirExists(BP_DIR)) walkBpds(BP_DIR)

// Which processes have a rendered image ON DISK, under whatever name — the SVG tree read once,
// by BP number, so the demand below can tell a process nobody drew from one whose drawing is
// mislaid or half-rendered.
const bpRendered = new Set()
const walkSvgs = rel => {
  for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    if (e.isDirectory()) walkSvgs(`${rel}/${e.name}`)
    else { const m = e.name.match(/^(BP\d+)/); if (m) bpRendered.add(m[1]) }
  }
}
if (dirExists(`${BP_DIR}/SVG`)) walkSvgs(`${BP_DIR}/SVG`)

const bpStatuses = new Map()
// The drawn set: which processes have a `.bpd` source AT ALL. A dissolved one has none by
// design — the drawing is deleted once the successor carries the subject (tooling contract §1a,
// "Dissolved is deleted") — so no scan can learn its state from a source, and the absence of the
// source is itself the evidence the book needs.
const bpDrawn = new Map()
for (const rel of bpdSources) {
  const src = readFileSync(join(ROOT, rel), 'utf8')
  const idm = src.match(/^@startbpmn\s+(BP\d+)/m)
  if (!idm) continue
  const st = src.match(/^\s*status\s+(dissolved|retired|parked)(?:\s*->\s*([A-Za-z_]\w*))?/m)
  bpDrawn.set(idm[1], rel)
  if (st) bpStatuses.set(idm[1], { state: st[1], successor: st[2] || null })
  // The header is the truth and the folder is its mirror — and where they disagree the header
  // wins and a CHECKER MUST SAY SO. Two vocabularies for one fact is the drift the taxonomy
  // exists to end, and a silent pass here is how a process ends up parked in one tool's eyes and
  // live in another's. Only a source that sits in a mirror folder is held to it: a non-live
  // source that stays in `diagrams/` is perfectly legal and its header says everything.
  const mirror = rel.match(/(?:^|\/)parked\/([^/]+)\//)?.[1]
  const expect = BPD_MIRROR[mirror]
  if (expect && (st?.[1] ?? 'live') !== expect) {
    problems.push(`${rel}: the folder says '${expect}' (parked/${mirror}/) and the header says `
      + `'${st?.[1] ?? 'live'}' — the header is the truth and the folder its mirror; fix one`)
  }
}
const bpStatusLede = bp => bp.status.state === 'dissolved'
  ? fmt('bp_status_dissolved_lede', { successor: bp.status.successor })
  : S(`bp_status_${bp.status.state}_lede`)
// The two rendered levels — each one present only if the file is (#1268). A live process has
// both and this emits exactly what the fixed markup emitted before; a parked or dissolved one
// has neither and the heading goes with them, rather than announcing a process nobody drew.
const bpDiagrams = bp => {
  const level = (summary, rel, alt) => `<details>
    <summary>${summary}</summary>
    ${img(rel, alt)}
  </details>`
  const parts = []
  if (bp.l1) parts.push(level(S('bp_level1'), bp.l1, fmt('alt_bp_l1', { num: bp.num })))
  if (bp.l2) parts.push(level(S('bp_level2'), bp.l2, fmt('alt_bp_l2', { num: bp.num })))
  return parts.length ? `<h3>${S('bp_the_process')}</h3>\n  ${parts.join('\n  ')}` : ''
}
const bpBadge = bp => bp.status
  ? ` <span class="badge-status badge-${bp.status.state}" title="${esc(bpStatusLede(bp))}">${esc(S(`bp_status_${bp.status.state}`))}</span>`
  : ''

const bps = (!dirExists(BP_DIR) ? [] : listDir(BP_DIR, f => /^BP\d+.*\.md$/.test(f))).map(f => {
  const id = f.replace(/\.md$/, '')
  // The BP diagram images are the render-bpmn-to-svg skill's output, and that skill's
  // documented shape is flat and level-SUFFIXED — `01_Business-Processes/SVG/<BP>.01_detailed.svg`
  // (render-bpmn-to-svg SKILL.md, 'Usage' and 'Fits the suite'). The book used to expect
  // `SVG/<BP>.svg` plus a nested `SVG/02_detailed/<BP>.svg`, a layout no producer promises, so a
  // project whose diagrams came out of the documented renderer could not build its book at all
  // (#1057). The producer's contract wins: one shape, and a project whose files sit elsewhere
  // hears it from requireFile by name rather than losing a chapter quietly.
  const l1 = `${BP_DIR}/SVG/${id}.01_detailed.svg`
  const l2 = `${BP_DIR}/SVG/${id}.02_detailed.svg`
  const num = id.match(/^BP\d+/)[0]
  const status = bpStatuses.get(num) || null
  const drawn = bpDrawn.get(num) || null
  const has1 = existsSync(join(ROOT, l1)); const has2 = existsSync(join(ROOT, l2))
  // #1268 — the pair is DEMANDED of a live, drawn process and EXPECTED ABSENT of a non-live one,
  // which is what the lifecycle means: the generators skip a non-live source, so no `.bpmn` and
  // no SVG come out of it, and a check that asks for them anyway leaves a conforming project with
  // NO GREEN STATE AT ALL — it is asking for files the project is required not to produce. A
  // dissolved process is the same case one step on: its drawing is deleted once the successor
  // carries the subject, so there is no source to read a status from, and the absence of BOTH the
  // source and any rendering IS the evidence — that chapter is a tombstone and demands nothing.
  //
  // THE BUILD DOES NOT STOP LOOKING. The moment ANY rendering of this process is on disk, the
  // documented pair is demanded again, non-live or not: one rendered level is proof that this
  // process does get drawn, so a missing sibling is a real defect and not a lifecycle state. That
  // is what keeps the #1057 failure — a drawing rendered into the layout the book used to expect
  // — a named finding rather than a chapter that quietly lost its diagram.
  const demanded = (status === null && drawn) || bpRendered.has(num)
  if (demanded) { requireFile(l1, id); requireFile(l2, id) }
  const siFolder = `${SI_DIR}/${id}`
  // Only the SI markdowns, matched positively on the design-artifact-conventions
  // filename shape — the minted `SIaa.bb_Name.md`, plus the retired `BPxx-` form so a project
  // that still carries one is recognized rather than silently skipped (ADR-066).
  // Not every .md in an SI folder is a System Interaction: a dissolved process leaves
  // an `_AUFGELOEST.md` note behind, and such a companion document has no activity
  // diagram, so `.md`-anything made one non-SI file fail the whole book (#1081). Same
  // not-a-numbered-artifact rule the screen enumerator below already applies (#1022),
  // stated positively so the next companion document needs no new rule.
  const sis = existsSync(join(ROOT, siFolder))
    ? listDir(siFolder, x => /^(BP\d+-)?SI\d+\.\d+_.*\.md$/.test(x)).map(p => ({
        name: p.replace(/\.md$/, ''),
        md: `${siFolder}/${p}`,
        mermaid: mermaidFence(`${siFolder}/${p}`),
      }))
    : []
  return {
    id, title: bpTitle(f, id), num, paragraphs: bpDescription(f), md: `${BP_DIR}/${f}`,
    // Rendered whenever it is on disk, and nothing but its absence when it is not: a non-live
    // drawing a project chose to keep stays readable, exactly as its lede promises, and a
    // tombstone chapter renders its document with no broken <img> under it.
    l1: has1 ? l1 : null, l2: has2 ? l2 : null, sis, status, drawn, demanded,
  }
})

// A SKIP IS ALWAYS REPORTED (tooling contract §1a.2) — a silent skip is a new way to lose a
// process. One line names every chapter of which no diagram was demanded, and why, so a reader
// sees that these are the processes the project deliberately does not draw and not processes the
// check quietly stopped looking at.
const bpNoDiagram = bps.filter(bp => !bp.demanded)
if (bpNoDiagram.length) {
  console.log(`book-build: ${bpNoDiagram.length} process(es) whose diagram is not demanded: `
    + bpNoDiagram.map(bp => `${bp.num} (${bp.status ? bp.status.state : 'no drawing — tombstone'})`).join(' · '))
}

// Only VW##_ screen models — the mapper below derives num/title from that
// prefix. Not every .vw is a screen: shared `dialog def` models (e.g.
// `_shared.vw`, underscore = the not-a-numbered-artifact convention) are
// legitimate screen-dsl sources and are skipped, not crashed on (#1022).
const screens = (!dirExists(VW_DIR) ? [] : listDir(VW_DIR, f => /^VW\d+_.*\.vw$/.test(f))).map(f => {
  const id = f.replace(/\.vw$/, '')
  // On contract, checked alongside the BP images (#1057): screen-dsl's `vw-render` writes
  // `<models-dir>/SVG/<name>.svg` by default, which is exactly this. Screens have one level,
  // so there is no suffix to carry.
  const svg = `${VW_DIR}/SVG/${id}.svg`
  requireFile(svg, id)
  return { id, title: vwTitle(f, id), num: id.match(/^VW\d+/)[0], blurb: vwDoc(f), svg, vw: `${VW_DIR}/${f}` }
})

// ── the Method model (targeted line-based extraction) ──────────────────────
// The SNS model YAML is richer than the strict-subset parser accepts (inline
// flow maps for operations), so the book extracts exactly the fields it
// renders — component/facet/operation names and descriptions, volatilities —
// and fails loudly when the shape surprises it.

// The IDesign layer set and its order. Kept identical to the Studio's own
// LAYER_ORDER (the Studio's `studio-ui` panel module `shared.ts`) — the
// Method has six layers, and a book that renders five silently drops a column
// (#692). The stroke colours below come from the same file (#691).
const LAYERS = [
  { key: 'clients', label: 'Clients' },
  { key: 'managers', label: 'Managers' },
  { key: 'engines', label: 'Engines' },
  { key: 'resource_access', label: 'ResourceAccess' },
  { key: 'resources', label: 'Resources' },
  { key: 'utilities', label: 'Utilities' },
]

const unquote = v => {
  const t = v.trim()
  return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")) ? t.slice(1, -1) : t
}

function readModel () {
  const rel = config.model
  if (!rel) { problems.push("book.yaml: missing 'model' (project-relative path to the Method model)"); return null }
  // Not there yet ⇒ Design has not run ⇒ chapters 7–9 render PLANNED (#1021).
  if (!existsSync(join(ROOT, rel))) return null
  const lines = readFileSync(join(ROOT, rel), 'utf8').split('\n')

  const components = [] // { id, name, layer, description, facets: [{name, description, ops: []}] }
  const volatilities = { identified: [], rejected: [] } // { name, description, encIds: [] }
  let top = null; let layer = null; let volKind = null
  let comp = null; let facet = null; let inOps = false; let inDtos = false
  let vol = null; let compField = null

  const field = (line, indent) => line.match(new RegExp(`^ {${indent}}([A-Za-z_]+): (.*)$`))

  for (const line of lines) {
    const topM = line.match(/^([A-Za-z_]+):/)
    if (topM) { top = topM[1]; layer = null; comp = null; facet = null; vol = null; continue }

    if (top === 'components') {
      const layerM = line.match(/^  ([a-z_]+):\s*$/)
      if (layerM) { layer = layerM[1]; comp = null; facet = null; continue }
      if (/^  - id: /.test(line)) {
        comp = { id: line.slice(8).trim(), name: '', layer, description: '', lifecycle: 'live', facets: [] }
        components.push(comp); facet = null; inOps = inDtos = false; continue
      }
      if (!comp) continue
      let m
      if ((m = field(line, 4))) {
        if (m[1] === 'name') comp.name = unquote(m[2])
        else if (m[1] === 'description') comp.description = unquote(m[2])
        // #1155 — `lifecycle: future` = decided by the design, deliberately not
        // built yet. Absent ⇒ live. The book has to SHOW it: the sibling failure
        // (#1148) was a status that reached the sources and not the picture the
        // reviewer opens, and a deferred component is otherwise indistinguishable
        // from one that was drawn and forgotten.
        else if (m[1] === 'lifecycle') comp.lifecycle = unquote(m[2])
        continue
      }
      if (/^    facets:\s*$/.test(line)) { facet = null; continue }
      if (/^    - id: /.test(line)) { facet = { name: '', description: '', ops: [] }; comp.facets.push(facet); inOps = inDtos = false; continue }
      if (facet) {
        if ((m = field(line, 6)) && !inDtos) {
          if (m[1] === 'name') facet.name = unquote(m[2])
          else if (m[1] === 'description') facet.description = unquote(m[2])
          else if (m[1] === 'operations') inOps = true
          continue
        }
        if (/^      operations:\s*$/.test(line)) { inOps = true; inDtos = false; continue }
        if (/^      dtos:\s*$/.test(line)) { inDtos = true; inOps = false; continue }
        if (inOps && /^      - \{/.test(line)) {
          const op = line.match(/\bname: ([A-Za-z0-9_]+)/)
          if (op) facet.ops.push(op[1])
          continue
        }
      }
    }

    if (top === 'volatilities') {
      const kindM = line.match(/^  (identified|rejected):/)
      if (kindM) { volKind = kindM[1]; vol = null; continue }
      if (/^  - id: /.test(line) && volKind) { vol = { name: '', description: '', encIds: [] }; volatilities[volKind].push(vol); continue }
      if (!vol) continue
      let m
      if ((m = field(line, 4))) {
        if (m[1] === 'name') vol.name = unquote(m[2])
        else if (m[1] === 'description') vol.description = unquote(m[2])
        continue
      }
      if ((m = line.match(/^ {4,6}- component_id: (.+)$/))) vol.encIds.push(m[1].trim())
    }
  }

  if (!components.length || components.some(c => !c.name)) problems.push(`${rel}: component extraction came up empty or nameless — model shape changed?`)
  if (!volatilities.identified.length) problems.push(`${rel}: no identified volatilities extracted`)
  const byId = new Map(components.map(c => [c.id, c]))
  return { components, volatilities, byId }
}

const model = readModel()

// ── the spec layer (visible partition only — the hidden one never leaves its
//    assembly: embedding it in docs would leak it into the implementor's view)

function readSpecs () {
  const dir = config.spec_dir
  if (!dir) { problems.push("book.yaml: missing 'spec_dir' (the visible spec partition)"); return null }
  // Not there yet ⇒ Specification has not run ⇒ chapter 13 renders PLANNED (#1021).
  if (!dirExists(dir)) return null
  const files = listDir(dir, f => f.endsWith('.cs'))
  const parsed = files.map(f => {
    const text = readFileSync(join(ROOT, dir, f), 'utf8')
    const summary = text.match(/\/\/\/ <summary>\s*\n([\s\S]*?)\/\/\/ <\/summary>/)
    const cases = []
    const re = /public static (Spec|Property|Process)Case (\w+)\s*=>[\s\S]*?"([^"\n]*)"/g
    for (let m; (m = re.exec(text));) cases.push({ kind: m[1], name: m[2], desc: m[3] })
    return {
      file: f,
      rel: `${dir}/${f}`,
      lines: text.split('\n').length,
      summary: summary ? summary[1].replace(/^\s*\/\/\/ ?/gm, '').replace(/\s+/g, ' ').trim() : '',
      cases,
      source: text,
    }
  })
  // Group ids are STRINGS keys (#1023) — the display names come from S() at render time.
  const groupOf = f =>
    /^ProcessScenarios|^ProcessWorld/.test(f) ? 'specs_group_process'
      : /Properties\.cs$|ReferenceModel\.cs$/.test(f) ? 'specs_group_properties'
        : /Failure|Faults/.test(f) ? 'specs_group_failure'
          : /Specs\.cs$/.test(f) ? 'specs_group_component'
            : 'specs_group_infra'
  const groups = new Map()
  for (const p of parsed) {
    const g = groupOf(p.file)
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g).push(p)
  }
  return { groups, total: parsed.reduce((n, p) => n + p.cases.length, 0) }
}

const specs = readSpecs()

// Call-chain markdowns (Design output) — absent or still empty ⇒ chapter 10
// renders PLANNED (#1021); a chain that exists but is broken stays fatal.
const ccFiles = !dirExists(CC_DIR) ? [] : listDir(CC_DIR, f => f.endsWith('.md') && f !== 'README.md')

// ── rendering ───────────────────────────────────────────────────────────────

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// C# XML-doc prose → HTML — exactly the tags the spec layer writes (<para>,
// <b>, <i>, <c>, <see cref>, <list type>/<item>). Escape-first, then lift the
// known tags back; an unknown tag stays visibly escaped rather than vanishing.
function xmldocHtml (s) {
  const inline = t => t
    .replace(/&lt;(\/?)(b|i)&gt;/g, '<$1$2>')
    .replace(/&lt;(\/?)c&gt;/g, (_, close) => close ? '</code>' : '<code>')
    .replace(/&lt;see cref=&quot;([^&]+?)&quot;\s*\/&gt;/g, '<code>$1</code>')
    .replace(/&lt;list type=&quot;number&quot;&gt;([\s\S]*?)&lt;\/list&gt;/g, '<ol>$1</ol>')
    .replace(/&lt;list type=&quot;bullet&quot;&gt;([\s\S]*?)&lt;\/list&gt;/g, '<ul>$1</ul>')
    .replace(/&lt;(\/?)item&gt;/g, (_, close) => close ? '</li>' : '<li>')
  return esc(s).split(/&lt;\/?para&gt;/).map(t => t.trim()).filter(Boolean)
    .map(t => `<p class="dim">${inline(t)}</p>`).join('\n    ')
}
const href = p => posix.join(...relative(OUT, join(ROOT, p)).split(sep))

function blocks (list, owner) {
  if (!Array.isArray(list)) { problems.push(`book.yaml: content.${owner} must be a list`); return '' }
  const out = []
  let bullets = []
  const flush = () => { if (bullets.length) { out.push(`<ul>${bullets.join('')}</ul>`); bullets = [] } }
  for (const bl of list) {
    if (bl.p !== undefined) { flush(); out.push(`<p>${esc(bl.p)}</p>`) }
    else if (bl.q !== undefined) { flush(); out.push(`<blockquote>${esc(bl.q)}${bl.by ? `<footer>— ${esc(bl.by)}</footer>` : ''}</blockquote>`) }
    else if (bl.b !== undefined) bullets.push(`<li>${esc(bl.b)}</li>`)
    else if (bl.link !== undefined) {
      flush()
      if (requireFile(bl.link, `content.${owner}`)) {
        out.push(`<p><a class="doclink" href="${esc(href(bl.link))}">${esc(bl.text ?? bl.link)}</a></p>`)
      }
    } else problems.push(`book.yaml: content.${owner}: unknown block (want p/q/b/link)`)
  }
  flush()
  return out.join('\n')
}

const img = (rel, alt) => `<figure><img loading="lazy" src="${esc(href(rel))}" alt="${esc(alt)}"></figure>`

// #1021: a chapter whose stage has not produced its inputs degrades into the
// same PLANNED rendering the two hardcoded stubs always had — pill, outline,
// muted sidebar marker — instead of failing the build. PLANNED-ness is derived
// from the tree, never declared in book.yaml, so a chapter lights up by itself
// the moment its stage produces output.
// The per-kind outline texts live in DEFAULT_STRINGS as `planned_<kind>` (#1023).

function chapterPlanned (ch) {
  if (ch.kind === 'stub') return true
  if (ch.kind === 'processes') return !bps.length
  if (ch.kind === 'screens') return !screens.length
  if (ch.kind === 'volatility' || ch.kind === 'architecture' || ch.kind === 'components') return !model
  if (ch.kind === 'usecases') return !ccFiles.length
  if (ch.kind === 'specs') return !specs
  if (ch.kind === 'gate') {
    const g = config.gates[ch.key]
    return !(g && g.dossier && existsSync(join(ROOT, g.dossier)))
  }
  return false
}

function plannedBody (outline) {
  return `<div class="prose planned-note">
      <p><span class="pill pill-muted">${esc(S('planned_pill'))}</span></p>
      ${outline.map(o => `<p>${esc(o)}</p>`).join('\n')}
      <p class="dim">${S('planned_note')}</p>
    </div>`
}

function chapterBody (ch) {
  if (ch.kind !== 'gate' && ch.kind !== 'stub' && chapterPlanned(ch)) return plannedBody([S(`planned_${ch.kind}`)])
  if (ch.kind === 'narrative') {
    const content = config.content[ch.key]
    if (!content) { problems.push(`book.yaml: missing content.${ch.key}`); return '' }
    return `<div class="prose">${blocks(content, ch.key)}</div>`
  }

  if (ch.kind === 'stub') return plannedBody(ch.outline)

  if (ch.kind === 'gate') {
    const g = config.gates[ch.key]
    if (!g) { problems.push(`book.yaml: missing gates.${ch.key}`); return '' }
    if (!g.dossier) { problems.push(`book.yaml: gates.${ch.key}: missing 'dossier'`); return '' }
    // A gate that has not been conducted has no dossier by definition — the
    // normal state of every project before that gate, not an authoring error
    // (#1021). The summary still renders; the dossier link becomes PLANNED.
    if (!existsSync(join(ROOT, g.dossier))) {
      return `<div class="prose">
      <p>${esc(g.summary)}</p>
      <p><span class="pill pill-muted">${esc(S('planned_pill'))}</span></p>
      <p class="dim">${S('gate_planned_note')}</p>
    </div>`
    }
    return `<div class="prose">
      <p>${esc(g.summary)}</p>
      <p><a class="doclink" href="${esc(href(g.dossier))}">${S('gate_dossier_link')}</a></p>
    </div>`
  }

  if (ch.kind === 'processes') {
    const toc = `<nav class="chapter-toc"><ol>${bps.map(bp => `<li><a href="#${esc(bp.id)}">${esc(bp.num)} ${esc(bp.title)}</a>${bpBadge(bp)}</li>`).join('')}</ol></nav>`
    const sections = bps.map(bp => `
<section class="bp${bp.status ? ' bp-nonlive' : ''}" id="${esc(bp.id)}">
  <h2><span class="idtag">${esc(bp.num)}</span> ${esc(bp.title)}${bpBadge(bp)}</h2>
  ${bp.status ? `<p class="bp-status-lede bp-status-${esc(bp.status.state)}">${esc(bpStatusLede(bp))}</p>` : ''}
  ${bp.paragraphs.map(p => `<p>${esc(p)}</p>`).join('\n')}
  <p class="dim"><a href="${esc(href(bp.md))}">${S('bp_full_document')}</a></p>
  ${bpDiagrams(bp)}
  ${bp.sis.length ? `<h3>${fmt('bp_si_heading', { count: bp.sis.length })}</h3>` + bp.sis.map(si =>
    `<details>
    <summary class="idtag-h">${esc(si.name)} <a class="dim" href="${esc(href(si.md))}">${S('doc_link')}</a></summary>
    <figure><pre class="mermaid">${esc(si.mermaid)}</pre></figure>
  </details>`
  ).join('\n') : `<p class="dim">${S('bp_no_si')}</p>`}
</section>`).join('\n')
    return toc + sections
  }

  if (ch.kind === 'screens') {
    const toc = `<nav class="chapter-toc"><ol>${screens.map(s => `<li><a href="#${esc(s.id)}">${esc(s.num)} ${esc(s.title)}</a></li>`).join('')}</ol></nav>`
    return toc + screens.map(s => `
<section class="bp" id="${esc(s.id)}">
  <h2><span class="idtag">${esc(s.num)}</span> ${esc(s.title)}</h2>
  <p>${esc(s.blurb)}</p>
  <p class="dim">${fmt('screens_model_note', { model: `<a href="${esc(href(s.vw))}">${esc(basename(s.vw))}</a>` })}</p>
  ${img(s.svg, fmt('alt_wireframe', { num: s.num }))}
</section>`).join('\n')
  }

  if (ch.kind === 'usecases') {
    const chains = ccFiles.map(f => {
      const rel = `${CC_DIR}/${f}`
      const text = readFileSync(join(ROOT, rel), 'utf8')
      const title = text.match(/^# (.*)$/m)?.[1] ?? f.replace(/\.md$/, '')
      return { id: f.replace(/\.md$/, ''), title, rel, mermaid: mermaidFence(rel) }
    })
    const toc = `<nav class="chapter-toc"><ol>${chains.map(c => `<li><a href="#${esc(c.id)}">${esc(c.title)}</a></li>`).join('')}</ol></nav>`
    return `<div class="prose">
  <p>${fmt('usecases_lede')}</p>
  <p class="dim"><a href="${esc(href(`${CC_DIR}/README.md`))}">${S('usecases_index_link')}</a></p>
</div>
${toc}
${chains.map(c => `
<section class="bp" id="${esc(c.id)}">
  <h2 class="idtag-h2">${esc(c.title)} <a class="dim" href="${esc(href(c.rel))}">${S('doc_link')}</a></h2>
  <figure><pre class="mermaid">${esc(c.mermaid)}</pre></figure>
</section>`).join('\n')}`
  }

  if (ch.kind === 'volatility') {
    const rows = model.volatilities.identified.map(v => `
      <tr>
        <th scope="row">${esc(v.name)}</th>
        <td>${esc(v.description)}</td>
        <td>${v.encIds.map(id => `<span class="chipname">${esc(model.byId.get(id)?.name ?? id)}</span>`).join(' ')}</td>
      </tr>`).join('')
    const rejected = model.volatilities.rejected.map(v => `
      <tr>
        <th scope="row">${esc(v.name)}</th>
        <td>${esc(v.description)}</td>
      </tr>`).join('')
    return `<div class="prose">
  <p>${fmt('volatility_lede', { count: model.volatilities.identified.length })}</p>
</div>
<div class="tblwrap"><table>
  <thead><tr><th>${S('volatility_th_name')}</th><th>${S('volatility_th_what')}</th><th>${S('volatility_th_enc')}</th></tr></thead>
  <tbody>${rows}
  </tbody>
</table></div>
${rejected ? `<h2>${S('volatility_rejected_heading')}</h2>
<div class="prose"><p>${S('volatility_rejected_lede')}</p></div>
<div class="tblwrap"><table>
  <thead><tr><th>${S('volatility_th_candidate')}</th><th>${S('volatility_th_why')}</th></tr></thead>
  <tbody>${rejected}
  </tbody>
</table></div>` : ''}`
  }

  if (ch.kind === 'architecture') {
    return `<div class="prose">
  <p>${fmt('architecture_lede', { count: model.components.length })}</p>
</div>
${archSvg()}
<div class="prose">
  <p class="dim">${fmt('architecture_note')}</p>
${model.components.some(c => c.lifecycle === 'future') ? `  <p class="dim">${S('architecture_future_note')}</p>` : ''}
</div>`
  }

  if (ch.kind === 'components') {
    const deferred = model.components.filter(c => c.lifecycle === 'future')
    const sections = LAYERS.map(l => {
      const comps = model.components.filter(c => c.layer === l.key)
      if (!comps.length) return ''
      return `<section class="bp">
  <h2 id="layer-${esc(l.key)}">${esc(l.label)} <span class="dim">(${comps.length})</span></h2>
  ${comps.map(c => `
  <section class="comp${c.lifecycle === 'future' ? ' comp-future' : ''}" id="${esc(c.name)}">
    <h3 class="compname">${esc(c.name)}${c.lifecycle === 'future'
      ? ` <span class="badge-future" title="${esc(S('components_future_title'))}">${esc(S('components_future_badge'))}</span>`
      : ''}</h3>
    <p>${esc(c.description)}</p>
    ${c.facets.length ? c.facets.map(f => `
    <div class="facet">
      <p class="facet-head"><strong>${esc(f.name)}</strong>${f.ops.length ? ` — ${f.ops.map(o => `<code>${esc(o)}</code>`).join(' ')}` : ''}</p>
      ${f.description ? `<p class="facet-desc">${esc(f.description)}</p>` : ''}
    </div>`).join('') : ''}
  </section>`).join('\n')}
</section>`
    }).join('\n')
    return `<div class="prose"><p>${fmt('components_lede')}</p>
${deferred.length ? `  <p class="dim">${fmt('components_future_note', { count: deferred.length })}</p>` : ''}</div>
${sections}`
  }

  if (ch.kind === 'specs') {
    const order = ['specs_group_process', 'specs_group_component', 'specs_group_properties', 'specs_group_failure', 'specs_group_infra']
    const groups = [...specs.groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    const sections = groups.map(([g, files]) => `
<section class="bp">
  <h2>${esc(S(g))} <span class="dim">(${fmt('specs_group_stats', { files: files.length, cases: files.reduce((n, f) => n + f.cases.length, 0) })})</span></h2>
  ${files.map(f => `
  <details class="specfile">
    <summary><code>${esc(f.file)}</code> — ${f.cases.length ? fmt(f.cases.length === 1 ? 'specs_cases_one' : 'specs_cases_many', { count: f.cases.length }) : S('specs_support')} · ${fmt('specs_lines', { count: f.lines })}</summary>
    ${f.summary ? xmldocHtml(f.summary) : ''}
    ${f.cases.length ? `<div class="tblwrap"><table>
      <thead><tr><th>${S('specs_th_case')}</th><th>${S('specs_th_asserts')}</th></tr></thead>
      <tbody>${f.cases.map(c => `<tr><th scope="row"><code>${esc(c.name)}</code></th><td>${esc(c.desc)}</td></tr>`).join('')}</tbody>
    </table></div>` : ''}
    <details class="srcview">
      <summary>${S('specs_full_source')} <span class="dim">${esc(f.rel)}</span></summary>
      <pre><code>${esc(f.source)}</code></pre>
    </details>
  </details>`).join('\n')}
</section>`).join('\n')
    return `<div class="prose">
  <p>${fmt('specs_lede', { count: specs.total })}</p>
  <p class="dim">${fmt('specs_hidden_note')}</p>
</div>
${sections}`
  }

  die(`unknown chapter kind '${ch.kind}'`)
}

// The DDC signature slide: the layered component diagram, generated from the
// model. Inline SVG so it inherits the page theme.
function archSvg () {
  const boxW = 172; const boxH = 46; const gapX = 16; const labelW = 150; const bandPad = 20
  // Only layers the model actually populates get a band. LAYERS carries all six
  // so a Utilities component renders when one exists (#692); this project states
  // in its own prose that utilities are not modeled, and an empty labelled band
  // would contradict that.
  const bands = LAYERS
    .map(l => ({ layer: l, comps: model.components.filter(c => c.layer === l.key) }))
    .filter(b => b.comps.length)
  const perLayer = bands.map(b => b.comps)
  const maxN = Math.max(...perLayer.map(c => c.length))
  const width = labelW + maxN * (boxW + gapX) + gapX
  const bandH = boxH + bandPad * 2
  const height = bandH * bands.length
  const parts = []
  bands.map(b => b.layer).forEach((l, i) => {
    const y = i * bandH
    const comps = perLayer[i]
    if (i) parts.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" class="band-sep"/>`)
    parts.push(`<text x="16" y="${y + bandH / 2}" class="band-label" dominant-baseline="middle">${esc(l.label)}</text>`)
    const rowW = comps.length * (boxW + gapX) - gapX
    const x0 = labelW + (width - labelW - gapX - rowW) / 2
    comps.forEach((c, j) => {
      const x = x0 + j * (boxW + gapX)
      parts.push(`<g class="lay-${l.key}${c.lifecycle === 'future' ? ' is-future' : ''}">
  <rect x="${x}" y="${y + bandPad}" width="${boxW}" height="${boxH}" rx="9" class="box"/>
  <text x="${x + boxW / 2}" y="${y + bandPad + boxH / 2}" class="box-label" text-anchor="middle" dominant-baseline="middle">${esc(c.name)}</text>
</g>`)
    })
  })
  return `<figure class="arch"><svg class="arch-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(fmt('architecture_aria', { count: model.components.length }))}">
${parts.join('\n')}
</svg></figure>`
}

function sidebar (active) {
  const groups = PARTS.map((p, i) => {
    const items = CHAPTERS.filter(c => c.part === i).map(c => {
      const cls = ['ch', chapterPlanned(c) ? 'planned' : '', c.id === active.id ? 'active' : ''].filter(Boolean).join(' ')
      const sub = c.id === active.id && c.kind === 'processes'
        ? `<ol class="subnav">${bps.map(bp => `<li><a href="#${esc(bp.id)}">${esc(bp.num)} ${esc(bp.title)}</a>${bpBadge(bp)}</li>`).join('')}</ol>`
        : c.id === active.id && c.kind === 'screens'
          ? `<ol class="subnav">${screens.map(s => `<li><a href="#${esc(s.id)}">${esc(s.num)} ${esc(s.title)}</a></li>`).join('')}</ol>`
          : c.id === active.id && c.kind === 'components'
            ? `<ol class="subnav">${LAYERS.filter(l => model?.components.some(x => x.layer === l.key)).map(l => `<li><a href="#layer-${esc(l.key)}">${esc(l.label)}</a></li>`).join('')}</ol>`
            : ''
      return `<li class="${cls}"><a href="${esc(c.file)}"><span class="chnum">${c.n}</span>${esc(c.title)}</a>${sub}</li>`
    }).join('')
    return `<li class="part"><span class="part-label">${fmt('part_label', { roman: ['I', 'II', 'III', 'IV'][i], part: esc(p) })}</span><ol>${items}</ol></li>`
  }).join('')
  return `<nav class="sidebar" aria-label="${esc(S('sidebar_aria_chapters'))}">
  <p class="book-title"><a href="index.html">${esc(config.title)}</a></p>
  <ol class="parts">${groups}</ol>
  <p class="side-foot"><a href="../../../__landing">${S('sidebar_all_documents')}</a></p>
</nav>`
}

function chapterPage (ch) {
  const i = CHAPTERS.indexOf(ch)
  const prev = CHAPTERS[i - 1]; const next = CHAPTERS[i + 1]
  const body = `
${sidebar(ch)}
<main>
  <header class="chap-head">
    <p class="crumb">${fmt('part_label', { roman: ['I', 'II', 'III', 'IV'][ch.part], part: esc(PARTS[ch.part]) })}</p>
    <h1><span class="chnum-big">${ch.n}</span> ${esc(ch.title)}</h1>
  </header>
  ${chapterBody(ch)}
  <nav class="pager">
    ${prev ? `<a href="${prev.file}">&larr; ${prev.n}. ${esc(prev.title)}</a>` : '<span></span>'}
    ${next ? `<a class="next" href="${next.file}">${next.n}. ${esc(next.title)} &rarr;</a>` : ''}
  </nav>
  <footer class="prov">
    <p><strong>${S('footer_generated')}</strong> ${fmt('footer_provenance', {
      skill: '<code>design-book</code>',
      source: '<code>docs/00_Design-Book/book.yaml</code>',
      command: '<code>book-build &lt;project-root&gt;</code>',
    })}</p>
  </footer>
</main>`
  const boot = body.includes('class="mermaid"')
    ? `\n<script src="mermaid.min.js"></script>\n<script>
mermaid.initialize({ startOnLoad: false, theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'neutral' })
// Render only visible diagrams — one measured while hidden inside a closed
// <details> comes out zero-width — and catch the rest as details open.
const renderVisible = () => mermaid.run({
  nodes: [...document.querySelectorAll('pre.mermaid:not([data-processed])')].filter(el => el.offsetParent !== null)
})
renderVisible()
for (const d of document.querySelectorAll('details')) d.addEventListener('toggle', renderVisible)
</script>`
    : ''
  return `<!doctype html>
<html lang="${esc(LANG)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`${ch.n}. ${ch.title} — ${config.title}`)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="layout">${body}
</div>${boot}
</body>
</html>
`
}

// ── styles (process-owned; identical in every project) ─────────────────────

const CSS = `
:root{
  --bg:#F4F6F9; --surface:#FFFFFF; --fg:#0F172A; --muted:#5B6472; --border:#E1E4E9;
  --accent:#2563EB; --green:#15803D; --amber:#92610C; --amber-bg:#FBF3E2;
  --info-bg:#EEF1F6; --code:#F1F3F7; --side:#EDF0F5;
}
@media (prefers-color-scheme: dark){
  :root{
    --bg:#0B1220; --surface:#121B2E; --fg:#E6EBF4; --muted:#93A0B4; --border:#233149;
    --accent:#7CA9F7; --green:#5BD98A; --amber:#F0C051; --amber-bg:#2C2410;
    --info-bg:#1A2438; --code:#1A2438; --side:#0E1626;
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
  font:15.5px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}
a:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:2px}
code,.idtag,.chnum,.chnum-big{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
code{background:var(--code);padding:1px 5px;border-radius:4px;font-size:.85em}

.layout{display:flex;min-height:100vh}

/* sidebar */
.sidebar{flex:0 0 280px;background:var(--side);border-right:1px solid var(--border);
  padding:20px 14px 20px 18px;position:sticky;top:0;height:100vh;overflow-y:auto}
.book-title{margin:0 0 14px;font-weight:800;font-size:15px;letter-spacing:-.01em}
.book-title a{color:inherit;text-decoration:none}
.parts{list-style:none;margin:0;padding:0}
.part{margin:0 0 14px}
.part-label{display:block;font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
  color:var(--muted);margin:0 0 4px}
.part ol{list-style:none;margin:0;padding:0}
.ch a{display:flex;gap:8px;align-items:baseline;padding:4px 8px;border-radius:6px;text-decoration:none;
  color:inherit;font-size:13.5px}
.ch a:hover{background:var(--info-bg)}
.ch.active > a{background:var(--surface);font-weight:700;box-shadow:inset 2px 0 0 var(--accent)}
.ch.planned > a{color:var(--muted)}
.ch.planned > a::after{content:"${S('sidebar_planned_badge').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}";font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;
  margin-left:auto;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:0 6px}
.chnum{color:var(--muted);font-size:11px;min-width:16px;text-align:right}
.subnav{margin:2px 0 6px;padding:0 0 0 30px;list-style:none;border-left:1px solid var(--border)}
.subnav a{display:block;font-size:12px;color:var(--muted);text-decoration:none;padding:2px 8px;border-radius:4px}
.subnav a:hover{color:var(--accent);background:var(--info-bg)}
.side-foot{margin:16px 0 0;font-size:12px}

/* main column */
main{flex:1;min-width:0;padding:28px 40px 60px;max-width:940px}
.crumb{margin:0 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
h1{margin:0 0 18px;font-size:clamp(24px,3.4vw,34px);letter-spacing:-.02em;font-weight:800}
.chnum-big{color:var(--muted);font-weight:600;font-size:.6em;letter-spacing:.08em;vertical-align:.2em;margin-right:6px}
h2{margin:34px 0 8px;font-size:21px;letter-spacing:-.01em}
h3{margin:20px 0 6px;font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700}
h4.idtag-h{margin:18px 0 4px;font-size:14px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.idtag{color:var(--muted);font-size:.72em;letter-spacing:.06em;margin-right:4px}
p{max-width:76ch}
.prose blockquote{margin:14px 0;padding:10px 16px;border-left:3px solid var(--accent);
  background:var(--surface);border-radius:0 8px 8px 0;font-style:italic}
.prose blockquote footer{font-style:normal;font-size:12.5px;color:var(--muted);margin-top:4px}
.dim{color:var(--muted);font-size:13px}
.pending{color:var(--amber);background:var(--amber-bg);padding:8px 12px;border-radius:8px;font-size:13.5px;max-width:66ch}
.doclink{display:inline-block;background:var(--surface);border:1px solid var(--border);border-radius:8px;
  padding:8px 14px;text-decoration:none;font-weight:600;font-size:13.5px}
.doclink:hover{border-color:var(--accent)}
.pill{display:inline-block;padding:3px 12px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.04em}
.pill-muted{color:var(--muted);background:var(--info-bg);border:1px solid var(--border)}
.planned-note p{max-width:70ch}

figure{margin:10px 0 22px;background:#fff;border:1px solid var(--border);border-radius:10px;padding:10px;overflow-x:auto}
figure img{display:block;max-width:100%;height:auto;margin:0 auto}
figure:has(pre.mermaid){background:var(--surface)}
pre.mermaid{margin:0;text-align:center;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  color:var(--muted)}
.idtag-h2{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:16px}
h4.idtag-h a{font-weight:400;text-decoration:none;font-size:11px}
h4.idtag-h a:hover{text-decoration:underline}
summary.idtag-h{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;color:var(--fg)}
summary.idtag-h a{font-weight:400;text-decoration:none;font-size:11px}
summary.idtag-h a:hover{text-decoration:underline}
details{margin:8px 0 16px}
details summary{cursor:pointer;font-size:13.5px;font-weight:600;color:var(--muted)}
details[open] summary{margin-bottom:8px}
.bp{border-top:1px solid var(--border);padding-top:6px;margin-top:26px}
.bp:first-of-type{border-top:none;margin-top:0}
.chapter-toc{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 16px;margin:0 0 8px}
.chapter-toc ol{margin:0;padding:0;list-style:none;columns:2;gap:24px}
.chapter-toc a{text-decoration:none;font-size:13px;display:block;padding:2px 0}
.chapter-toc a:hover{text-decoration:underline}

/* tables (volatility, spec inventories) */
.tblwrap{overflow-x:auto;margin:10px 0 18px}
table{border-collapse:collapse;width:100%;font-size:13.5px;background:var(--surface);
  border:1px solid var(--border);border-radius:10px}
thead th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);
  border-bottom:1px solid var(--border);padding:8px 14px;font-weight:600}
tbody th{text-align:left;font-weight:600;vertical-align:top;padding:9px 14px;width:22%}
tbody td{vertical-align:top;padding:9px 14px}
tbody tr{border-bottom:1px solid var(--border)}
tbody tr:last-child{border-bottom:none}
.chipname{display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  font-size:11.5px;background:var(--info-bg);border:1px solid var(--border);border-radius:999px;
  padding:1px 9px;margin:1px 2px 1px 0;white-space:nowrap}

/* component catalog */
.comp{margin:0 0 22px}
.compname{margin:16px 0 4px;font-size:17px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  text-transform:none;letter-spacing:0;color:var(--fg)}
.facet{border-left:2px solid var(--border);padding:2px 0 2px 14px;margin:8px 0}
.facet-head{margin:0;font-size:13.5px}
.facet-head code{font-size:.9em}
.facet-desc{margin:3px 0 0;font-size:12.5px;color:var(--muted);max-width:72ch}

/* #1155 — a component the design decided and the build defers. Dimmed and
   dashed, never hidden: the reader must see the decision, and see that it is
   not part of this build. */
.badge-future{display:inline-block;font-family:system-ui,sans-serif;font-size:10.5px;font-weight:600;
  letter-spacing:.06em;text-transform:uppercase;color:var(--muted);background:var(--surface);
  border:1px dashed var(--border);border-radius:999px;padding:2px 8px;vertical-align:middle;
  margin-left:8px;white-space:nowrap}
.comp-future .compname{color:var(--muted)}

/* #1148 — the BP lifecycle badges. Same shape as .badge-future; the STATE carries the color:
   dissolved is a red-tinted "this is gone", parked a dashed "not built yet" (the sibling of a
   deferred component), retired plain muted. The section itself stays fully readable — the value
   of a non-live process's chapter entry is that the superseded reading survives NEXT TO a
   marker saying so. */
.badge-status{display:inline-block;font-family:system-ui,sans-serif;font-size:10.5px;font-weight:600;
  letter-spacing:.06em;text-transform:uppercase;color:var(--muted);background:var(--surface);
  border:1px solid var(--border);border-radius:999px;padding:2px 8px;vertical-align:middle;
  margin-left:8px;white-space:nowrap}
.badge-dissolved{color:#a03535;border-color:#a03535}
.badge-parked{border-style:dashed}
.bp-nonlive>h2{color:var(--muted)}
.bp-status-lede{font-style:italic;color:var(--muted)}

/* the layered architecture diagram */
.arch{padding:16px}
.arch-svg{display:block;width:100%;height:auto}
.arch-svg .band-sep{stroke:var(--border);stroke-width:1}
.arch-svg .band-label{fill:var(--muted);font:600 12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  letter-spacing:.08em;text-transform:uppercase}
.arch-svg .box{fill:var(--bg);stroke-width:1.6}
.arch-svg .is-future .box{stroke-dasharray:5 4;opacity:.55}
.arch-svg .is-future .box-label{opacity:.6}
.arch-svg .box-label{fill:var(--fg);font:600 12.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
/* Layer strokes. SINGLE SOURCE OF TRUTH: LAYER_COLORS in
   the Studio's studio-ui panel module shared.ts (#691). The book used
   to carry its own light/dark pair, so the same Manager was blue here and amber
   in the Studio. One palette, both schemes — these values are mid-tone by
   construction and read on either ground. */
.arch-svg .lay-clients .box{stroke:#3fb950}
.arch-svg .lay-managers .box{stroke:#e3b341}
.arch-svg .lay-engines .box{stroke:#d29922}
.arch-svg .lay-resource_access .box{stroke:#8b949e}
.arch-svg .lay-resources .box{stroke:#58a6ff}
.arch-svg .lay-utilities .box{stroke:#a371f7}

/* spec source views */
.specfile{background:var(--surface);border:1px solid var(--border);border-radius:10px;
  padding:10px 14px;margin:10px 0}
.specfile > summary{font-size:13.5px;font-weight:600}
.specfile .tblwrap{margin:10px 0}
.srcview{margin:8px 0 4px;background:transparent;border:none;padding:0}
.srcview summary{font-size:12.5px}
.srcview pre{background:var(--code);border:1px solid var(--border);border-radius:8px;
  padding:12px 14px;overflow-x:auto;font-size:12px;line-height:1.5;margin:8px 0 2px}
.srcview code{background:none;padding:0;font-size:inherit}

.pager{display:flex;justify-content:space-between;gap:18px;margin:36px 0 0;font-size:13.5px}
.pager a{text-decoration:none;font-weight:600}
.pager a:hover{text-decoration:underline}
.prov{margin-top:26px;border-top:1px solid var(--border);padding-top:10px;color:var(--muted);font-size:12px}
.prov p{margin:4px 0;max-width:100ch}

@media (max-width: 960px){
  .layout{display:block}
  .sidebar{position:static;height:auto;border-right:none;border-bottom:1px solid var(--border);flex:none}
  main{padding:20px 16px 48px}
  .chapter-toc ol{columns:1}
}
@media (prefers-reduced-motion: reduce){*{transition:none!important}}
`

// ── main ────────────────────────────────────────────────────────────────────

const files = new Map()
for (const ch of CHAPTERS) files.set(ch.file, chapterPage(ch))
// The vendored Mermaid viewer travels with the book so a customer project
// stays self-contained and file://-viewable (ADR-053) — no CDN, no Java.
files.set('mermaid.min.js',
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'mermaid.min.js'), 'utf8'))

if (problems.length) {
  for (const p of problems) console.error(`book-build: ${p}`)
  process.exit(1)
}

// Staleness runs in two directions, and comparing only the pages this run produces sees one of
// them (#878). A chapter dropped from CHAPTERS leaves its HTML on disk: no sidebar links it any
// more, so nobody navigating the book meets it — but `just serve-project` still serves it, and a
// direct URL or an old bookmark still opens it, describing a design that no longer exists. That
// is the #590 failure mode — a reader misled by a rendering nobody regenerated — reached by the
// one route comparing the generated set cannot close. callchain-build sweeps its whole output
// directory because that directory holds nothing else; here book.yaml is the project-owned
// SOURCE and lives right next to the pages it drives, so the sweep needs a keep-list.
// Subdirectories and dotfiles are left alone: this generator writes neither, so nothing it could
// orphan hides there — while sweeping them would let one Finder visit (`.DS_Store`) or one
// `.gitignore` turn the gate permanently red, or delete a file no build put there.
const KEEP = new Set(['book.yaml'])
const orphans = readdirSync(OUT, { withFileTypes: true })
  .filter(e => !e.isDirectory() && !e.name.startsWith('.') && !KEEP.has(e.name) && !files.has(e.name))
  .map(e => e.name)
  .sort()

if (CHECK) {
  // Name the fix in the failure itself (#590). This check spent four changeloops red printing a
  // bare `stale: <page>` list, which says what is wrong and not what to do about it — and the one
  // thing a reader must NOT do is hand-edit the page, since the next regeneration overwrites it
  // (that is how the call chains went stale, #567). Same shape as callchain-build --check.
  const stale = []
  for (const [name, content] of files) {
    const p = join(OUT, name)
    if (!existsSync(p)) stale.push(`${name} (missing)`)
    else if (readFileSync(p, 'utf8') !== content) stale.push(`${name} (differs)`)
  }
  for (const name of orphans) stale.push(`${name} (orphan — no chapter writes it any more)`)
  if (stale.length === 0) {
    console.log(`book-build --check: up to date — ${files.size} file(s) match the tree,`
      + ' and nothing else in the directory')
    process.exit(0)
  }
  console.error(`book-build --check: ${stale.length} file(s) do not match the tree`
    + ` (${files.size} generated):`)
  for (const s of stale) console.error(`  ${s}`)
  console.error('\nRun `just book` — book.yaml and the documents it extracts from are the source,')
  console.error('these pages are their rendering. Never hand-edit a page.')
  if (orphans.length) {
    console.error('That run also DELETES the orphan file(s) above; keep only book.yaml beside the pages.')
  }
  process.exit(1)
}

for (const [name, content] of files) writeFileSync(join(OUT, name), content)
for (const name of orphans) unlinkSync(join(OUT, name))
console.log(`book-build: wrote ${files.size} files to ${relative(process.cwd(), OUT)}`)
if (orphans.length) {
  console.log(`book-build: deleted ${orphans.length} orphan file(s): ${orphans.join(', ')}`)
}
