#!/usr/bin/env node
// call-chains — regenerate docs/03_Technology/02_Call-Chains from the architecture model.
//
// One markdown per modeled sequence (SQxx.yy.zz), each carrying TWO views of the same truth:
//
//   - the SEQUENCE diagram: who calls whom, in order, with the design's own step notes;
//   - the ACTIVITY diagram: which of those steps ONE run takes, and under what condition —
//     rendered from the model's `paths:` declaration (D-SEQUENCE-PATH-V1, #564).
//
// Before #564 the second view lived only in prose ("the 'Delivery order?' fork lives in this
// sequence's activity diagram") and nothing derived anything from it. Now the same declaration
// the conformance differ gates on is what draws the picture, so the diagram cannot drift from
// the gate: they are one source.
//
// The directory was also stale for four model changeloops (#567) because no command regenerated
// it — the footer named a draft, not a tool. This is the tool. Run it at the end of every model
// changeloop, beside `seqmap generate` and the scaffolder; `--check` fails when the tree is stale,
// so CI can say so instead of a reader discovering it.
//
// Input is the read-model JSON, so the generator never re-implements the model's YAML:
//     sns-cli read --project <p> --kind ReadArchitecture > arch.json
//
// Usage:
//   callchain-build.mjs --model <arch.json> --out <dir> [--check] [--title <text>]
//
// Exit: 0 written (or up to date) · 1 --check found staleness, or an entity escape in the
// committed prose · 2 usage / input error, or an entity escape in what this run generated.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const FOOTER = 'GENERATED FROM THE MODEL by `just call-chains` (skill: call-chains). Do not edit by'
  + ' hand — edit the model and regenerate. The activity diagram is drawn from the model\'s declared'
  + ' sequence paths (D-SEQUENCE-PATH-V1, #564), the same declaration `seqcheck trace` gates runs on.'

function die (msg, code = 2) { console.error(`callchain-build: ${msg}`); process.exit(code) }

// ── arguments ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
let modelPath = null, outDir = null, check = false, title = null
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--model' || a === '-m') modelPath = args[++i]
  else if (a === '--out' || a === '-o') outDir = args[++i]
  else if (a === '--title') title = args[++i]
  else if (a === '--check') check = true
  else if (a === '--help' || a === '-h') { console.log(help()); process.exit(0) }
  else die(`unknown option ${a}`)
}
if (!modelPath) die('--model <arch.json> is required (sns-cli read --kind ReadArchitecture)')
if (!outDir) die('--out <dir> is required')

function help () {
  return `callchain-build — regenerate the Call-Chain markdowns from the model

  callchain-build.mjs --model <arch.json> --out <dir> [--check] [--title <text>]

  --model   read-model JSON: sns-cli read --project <p> --kind ReadArchitecture > arch.json
  --out     the Call-Chain directory (one file per sequence, plus README.md)
  --check   write nothing; exit 1 if any file would change (the staleness gate)
  --title   heading line for the README (defaults to the project name)`
}

// ── the model ────────────────────────────────────────────────────────────────

let model
try {
  const raw = JSON.parse(readFileSync(modelPath, 'utf8'))
  model = raw?.data ?? raw
} catch (e) { die(`cannot read ${modelPath}: ${e.message}`) }

const useCases = model?.useCases
if (!Array.isArray(useCases)) die(`${modelPath} carries no useCases — is this a ReadArchitecture response?`)

// Layer name → the stereotype the diagrams show. Unknown layers keep their own name rather than
// being silently dropped: a component whose layer this map does not know is a model problem worth
// seeing in the diagram, not one to paper over.
const STEREOTYPE = {
  Clients: 'Client',
  Managers: 'Manager',
  Engines: 'Engine',
  ResourceAccess: 'ResourceAccess',
  Resources: 'Resource',
  Utilities: 'Utility',
}
const LAYER_ORDER = ['Clients', 'Managers', 'Engines', 'ResourceAccess', 'Resources', 'Utilities']

// #1059 — the `;` → `#59;` substitution is MERMAID DIALECT, not text: a bare semicolon
// terminates a Mermaid statement, so a label inside a fence must carry the entity. The
// surrounding markdown has no such rule, and the same substitution applied to the prose
// showed the reader `contact#59; payment method` where the model says `contact; payment
// method`. Two functions, so the dialect cannot travel: `prose` normalizes ONLY (one line,
// trimmed) and is what the markdown around the fences uses; `mermaidText` adds the entity and is
// used exclusively for text that lands INSIDE a fence.
const prose = s => String(s ?? '').replace(/\r?\n/g, ' ').trim()
const mermaidText = s => prose(s).replace(/;/g, '#59;')   // Mermaid eats a bare semicolon in a note

/** Wrap note text so a long note does not blow the diagram's width. Fence-only: escapes. */
function wrap (text, width = 58) {
  const words = mermaidText(text).split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    if (line && (line + ' ' + word).length > width) { lines.push(line); line = word }
    else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  return lines.join('<br/>')
}

/** SQ id of a sequence: SI01.05 + the 1-based permutation ordinal → SQ01.05.01. */
const sqId = (siId, ordinal) => `SQ${siId.startsWith('SI') ? siId.slice(2) : siId}.${String(ordinal).padStart(2, '0')}`
const stepId = (sq, n) => `${sq}.${String(n).padStart(2, '0')}`
const ccId = siId => `CC${siId.startsWith('SI') ? siId.slice(2) : siId}`

// ── the two diagrams ─────────────────────────────────────────────────────────

// ADR-061 decision 13 (#952 item 10) — an INTERNAL box is a box the owning component performs
// itself: a label, no callee, no operation. It takes an ordinal in the SAME step list as the
// component calls, so every box keeps its SQxx.yy.zz.NN id — which is also why it must be DRAWN:
// a generator that skipped it would shift every later declared-path ordinal and render a branch
// structure the model does not contain (#987). Models written before #952 carry no `kind` at all,
// so this reads as false for every one of their steps and their rendering is byte-identical.
const isInternal = s => s.kind === 'internal'

// A component whose ref the model could not resolve. The projection stops filtering such a step
// out (#1133) — dropping it would renumber every later declared-path ordinal — so it arrives here
// with an empty name, and an empty name is not a Mermaid identifier. Drawn as `Unbound` instead:
// a model defect belongs in the picture, loudly, not papered over and not silently renumbered.
// Same stance the operation label already takes with `(unbound)`.
const UNBOUND = 'Unbound'
const actorOf = name => (name === undefined || name === null || String(name).trim() === '' ? UNBOUND : String(name))

function sequenceDiagram (sq, steps) {
  const seen = new Map()
  for (const s of steps) {
    const from = actorOf(s.from)
    if (!seen.has(from)) seen.set(from, s.fromLayer)
    // An internal box has no callee — no participant, no lifeline (#987).
    if (!isInternal(s) && !seen.has(actorOf(s.to))) seen.set(actorOf(s.to), s.toLayer)
  }
  const participants = [...seen.entries()].sort((a, b) => {
    const ai = LAYER_ORDER.indexOf(a[1]), bi = LAYER_ORDER.indexOf(b[1])
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a[0].localeCompare(b[0])
  })

  const out = ['```mermaid', 'sequenceDiagram']
  for (const [name, layer] of participants) {
    const kind = layer === 'Clients' ? 'actor' : 'participant'
    out.push(`    ${kind} ${name} as ${name} «${STEREOTYPE[layer] ?? layer}»`)
  }
  steps.forEach((s, i) => {
    if (isInternal(s)) {
      // The box the component performs itself, drawn on its own lifeline: the ordinal keeps its
      // place in the numbering, the label is the box's identity, and the step note rides along.
      const text = s.note ? `${stepId(sq, i + 1)} ${s.label}<br/>${wrap(s.note)}` : `${stepId(sq, i + 1)} ${s.label}`
      out.push(`    Note over ${actorOf(s.from)}: ${text}`)
      return
    }
    // Mermaid's `-)` is the async arrow. A queued self-call drawn with the plain arrow would
    // read as a blocking call, which is the opposite of what the model says about it.
    const arrow = s.coupling === 'async' ? '-)' : '->>'
    out.push(`    ${actorOf(s.from)}${arrow}${actorOf(s.to)}: ${stepId(sq, i + 1)} ${s.operationRef ?? s.operationDraft ?? '(unbound)'}`)
    if (s.note) out.push(`    Note right of ${actorOf(s.to)}: ${wrap(s.note)}`)
  })
  out.push('```')
  return out.join('\n')
}

/**
 * The activity diagram, drawn from the declared paths: every step is a node, every path is a walk
 * through them, and an edge only two of three paths take carries their names. A sequence with no
 * declared path gets no activity diagram at all — drawing a single straight line would assert
 * "this operation has one branch", which is precisely the claim the model has not made.
 */
function activityDiagram (sq, steps, paths) {
  if (!paths || paths.length === 0) return null

  // edge key → the paths that take it, in declaration order
  const edges = new Map()
  const terminal = new Map()
  for (const path of paths) {
    const walk = [...path.steps].sort((a, b) => a - b)
    for (let i = 0; i + 1 < walk.length; i++) {
      const key = `${walk[i]}->${walk[i + 1]}`
      if (!edges.has(key)) edges.set(key, { from: walk[i], to: walk[i + 1], paths: [] })
      edges.get(key).paths.push(path.name)
    }
    const last = walk[walk.length - 1]
    if (!terminal.has(last)) terminal.set(last, [])
    terminal.get(last).push(path)
  }

  const used = new Set(paths.flatMap(p => p.steps))
  const out = ['```mermaid', 'flowchart TD']
  for (const n of [...used].sort((a, b) => a - b)) {
    const s = steps[n - 1]
    if (!s) continue
    // An ordinary node either way (#987): a component call shows its operation over the callee,
    // an internal box shows its label over the component that performs it.
    const label = isInternal(s)
      ? `${String(n).padStart(2, '0')} ${s.label}<br/><small>${actorOf(s.from)} (internal)</small>`
      : `${String(n).padStart(2, '0')} ${s.operationRef ?? s.operationDraft ?? '(unbound)'}<br/><small>${actorOf(s.to)}</small>`
    out.push(`    S${n}["${label}"]`)
  }
  // Guards belong at the DECISIONS. A step with one way out needs no label — naming the paths on
  // every edge turns the picture into a legend of itself, which is what a four-branch sequence
  // looked like on the first draft. So: count each step's ways out (its edges plus an ending, if
  // any path stops there) and label only where there is a choice to make.
  const outDegree = new Map()
  const bump = step => outDegree.set(step, (outDegree.get(step) ?? 0) + 1)
  for (const { from } of edges.values()) bump(from)
  for (const step of terminal.keys()) bump(step)

  for (const { from, to, paths: names } of edges.values()) {
    const label = outDegree.get(from) > 1 ? `|${names.join(' / ')}|` : ''
    out.push(`    S${from} -->${label} S${to}`)
  }
  // One end marker per terminal STEP, naming every path that finishes there. Two branches that
  // differ only in what they did on the way — delivery and pickup both end at the store write —
  // share an ending, and drawing two identical circles under one node says otherwise.
  let ended = 0
  for (const [step, ending] of [...terminal.entries()].sort((a, b) => a[0] - b[0])) {
    const id = `E${++ended}`
    out.push(`    ${id}(["${mermaidText(ending.map(p => p.name).join(' / '))}"])`)
    const label = outDegree.get(step) > 1 ? `|${ending.map(p => p.name).join(' / ')}|` : ''
    out.push(`    S${step} -->${label} ${id}`)
  }
  out.push('```')
  return out.join('\n')
}

function guardTable (paths) {
  if (!paths || paths.length === 0) return null
  const rows = paths.map(p =>
    `| \`${p.name}\` | ${p.guard ? prose(p.guard) : '_(no guard recorded)_'} | ${p.steps.join(', ')} |`)
  return ['| Path | When a run takes it | Steps |', '|---|---|---|', ...rows].join('\n')
}

// ── the files ────────────────────────────────────────────────────────────────

const files = new Map()   // filename → content
const index = []

// Every model string that legitimately reaches the markdown OUTSIDE a fence. The escape guard
// below reads this: an entity in the prose is a defect unless the model's own text put it there
// (`Refs #59; see also …` is a sentence a description may honestly contain).
const proseSources = new Set()
const fromModel = s => { if (s) proseSources.add(String(s)); return s }
fromModel(title); fromModel(model.projectName)

for (const uc of useCases) {
  const sequences = uc.sequences ?? []
  sequences.forEach((seq, i) => {
    const sq = sqId(uc.id, i + 1)
    const steps = seq.steps ?? []
    const paths = seq.paths ?? []
    const name = seq.name || uc.name
    fromModel(uc.id); fromModel(uc.name); fromModel(uc.description); fromModel(name)
    for (const path of paths) { fromModel(path.name); fromModel(path.guard) }

    const body = [`# ${sq} - ${uc.id} ${uc.name}`, '']
    if (uc.description) body.push(`> ${prose(uc.description)}`, '')
    body.push(sequenceDiagram(sq, steps), '')

    const activity = activityDiagram(sq, steps, paths)
    if (activity) {
      body.push('## The paths one run may take', '')
      body.push(activity, '')
      body.push(guardTable(paths), '')
    } else {
      body.push('## The paths one run may take', '')
      body.push('_The model declares no paths for this sequence: every step it draws is'
        + ' unconditional, and a run must take all of them._', '')
    }

    body.push(`> ${FOOTER}`, '')
    files.set(`${sq}_${name}.md`, body.join('\n'))
    index.push({ si: uc.id, useCase: uc.name, cc: ccId(uc.id), sq, variant: name, steps: steps.length, paths: paths.length })
  })
}

const declared = index.reduce((n, r) => n + r.paths, 0)
const readme = [
  `# Call Chains — ${title ?? model.projectName ?? 'the model'}`,
  '',
  'One file per modeled sequence, generated from the architecture model. `CCxx.yy` is 1:1 with',
  '`SIxx.yy` and variation-agnostic; an operation with several permutations lists one `SQxx.yy.zz`',
  'per variant. Sequence legs end at the ResourceAccess and the terminal step names the ultimate',
  'resource target (ADR-036).',
  '',
  'The **Paths** column is the branch structure the model declares (D-SEQUENCE-PATH-V1, #564): the',
  'ordered subsets of the steps that ONE run may take. It is what the activity diagram in each file',
  'is drawn from, and what `seqcheck trace` holds a recorded run to — a sequence showing 0 paths',
  'asserts that every step it draws is unconditional.',
  '',
  '| SI | Use case | CC | SQ | Variant | Steps | Paths |',
  '|---|---|---|---|---|---|---|',
  ...index.map(r => `| ${r.si} | ${r.useCase} | ${r.cc} | ${r.sq} | ${r.variant} | ${r.steps} | ${r.paths} |`),
  '',
  `**${index.length} sequences · ${index.reduce((n, r) => n + r.steps, 0)} steps · ${declared} declared paths.**`,
  '',
  `> ${FOOTER}`,
  '',
].join('\n')
files.set('README.md', readme)

// ── the escape guard (#1059) ─────────────────────────────────────────────────

// `--check` compares the tree against a re-run of THIS generator, so an encoding bug the
// generator makes consistently reproduces byte-identically and the gate is green by
// construction: the check can only see drift, never a stable defect. This guard is the other
// half — a property the output must hold whatever the generator did. A Mermaid/HTML entity
// escape (`#59;`) is fence dialect; outside a fence it is a leak, unless that exact entity is
// in the model's own prose text, which is the reader's to see verbatim.
const ENTITY = /#\d+;/g

function escapeLeaks (content) {
  const leaks = []
  let inFence = false
  content.split('\n').forEach((line, i) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return }
    if (inFence) return
    for (const m of line.matchAll(ENTITY)) {
      if ([...proseSources].some(src => src.includes(m[0]))) continue
      leaks.push(`line ${i + 1}: ${line.trim()}`)
    }
  })
  return leaks
}

function reportLeaks (where, entries, code, remedy) {
  if (entries.length === 0) return
  console.error(`callchain-build: ${entries.length} Mermaid entity escape(s) outside a fence in ${where}`
    + ' — the escape is fence dialect, the prose carries the model\'s own characters (#1059):')
  for (const e of entries) console.error(`  ${e}`)
  console.error(`\n${remedy}`)
  process.exit(code)
}

// What this run just built: a generator defect, in write mode as much as in check mode.
reportLeaks('the generated markdown', [...files].flatMap(([file, content]) =>
  escapeLeaks(content).map(l => `${file}:${l}`)), 2,
'This one is the generator\'s doing, not the tree\'s: nothing was written. Escape for Mermaid'
+ ' inside the fence only — `mermaidText` there, `prose` everywhere else.')

// ── write or check ───────────────────────────────────────────────────────────

if (!existsSync(outDir)) {
  if (check) die(`${outDir} does not exist — the call-chain docs have never been generated`, 1)
  mkdirSync(outDir, { recursive: true })
}

const onDisk = readdirSync(outDir).filter(f => f.endsWith('.md'))
const stale = []
for (const [file, content] of files) {
  const path = join(outDir, file)
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null
  if (current === content) continue
  stale.push(current === null ? `${file} (missing)` : `${file} (differs)`)
  if (!check) writeFileSync(path, content)
}
// A file the model no longer draws is stale in the other direction — a sequence that was removed
// or renamed leaves its markdown behind, and a reader has no way to tell it from a current one.
for (const file of onDisk) {
  if (files.has(file)) continue
  stale.push(`${file} (no longer drawn by the model)`)
  if (!check) unlinkSync(join(outDir, file))
}

if (check) {
  // The committed tree, not only what this run would write: a leak baked in by an older
  // generator version regenerates away silently once the generator is fixed, and until the
  // regeneration happens a reader is looking at corrupted prose the gate called green.
  reportLeaks('the committed call-chain markdown', onDisk.flatMap(file =>
    escapeLeaks(readFileSync(join(outDir, file), 'utf8')).map(l => `${file}:${l}`)), 1,
  'Run `just call-chains` — these files were written by a generator that escaped the prose'
  + ' as if it were a Mermaid label, and regeneration is what replaces them.')
  if (stale.length === 0) {
    console.log(`callchain-build --check: up to date — ${files.size} file(s) match the model`)
    process.exit(0)
  }
  console.error(`callchain-build --check: ${stale.length} file(s) do not match the model:`)
  for (const s of stale) console.error(`  ${s}`)
  console.error('\nRun `just call-chains` — the model is the source, these files are its rendering.')
  process.exit(1)
}

console.log(`callchain-build: ${files.size} file(s) written to ${outDir}`
  + ` (${index.length} sequence(s), ${declared} declared path(s))`)
if (stale.length > 0) console.log(`  changed: ${stale.length}`)
