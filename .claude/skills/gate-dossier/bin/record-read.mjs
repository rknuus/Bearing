// record-read — the gate-dossier skill's readers for the two formats it owns a reader of:
// the strict YAML subset that `dossier.yaml` and every `record.yaml` are written in
// (`gate-record/1_*`, `dossier-config/1_*`), and the `qa-ledger/1` line scan.
//
// Lifted out of dossier-build.mjs when the review-surface derivation arrived (ADR-062 §3,
// #1012). The derivation reads the same two files the dossier build reads, and the decision's
// whole point is that it adds NO third parser of either format — so both binaries in this skill
// import from here rather than carrying a copy. A copy is how two readers of one format
// start disagreeing about what the format is (#861 is the same lesson for the specs).
//
// Zero dependencies; plain Node. `die` is injected because each binary names itself in its
// own diagnostics ("dossier-build: …", "review-surface: …") and a shared reader must not pick
// one.
//
// Format specs: process-specs/gate-record-format.md, process-specs/qa-ledger-format.md.

import { readFileSync } from 'node:fs'

// Where an author reads what the format actually admits. Named in every shape failure, because
// the author of a wrong shape is usually copying a skeleton out of that very file (#885).
export const GRF = 'process-specs/gate-record-format.md'

// ── the Diamond rail template (ADR-040) ─────────────────────────────────────
// Fixed by ADR-040. Changing anything here is a process change and lands in every project
// identically — never per project. Shared here because BOTH binaries read it: dossier-build
// renders the rail, and review-surface emits it as the document's `gates` section (ADR-062).
// A copy is how two readers of one template start disagreeing about what the template is.

// `name` is the id with its first letter capitalised, because ADR-064 made the speaking name the
// id. It is kept as a column rather than derived so a node whose display name is not simply its
// id capitalised stays expressible without a second mechanism.
export const RAIL_DEF = [
  { id: 'discovery', kind: 'stage', name: 'Discovery' },
  { id: 'mockup', kind: 'stage', name: 'Mockup' },
  { id: 'intent', kind: 'gate', name: 'Intent' },
  { id: 'design', kind: 'stage', name: 'Design' },
  { id: 'blueprint', kind: 'gate', name: 'Blueprint' },
  { id: 'specification', kind: 'stage', name: 'Specification' },
  { id: 'contract', kind: 'gate', name: 'Contract' },
  { id: 'construction', kind: 'stage', name: 'Construction' },
  { id: 'acceptance', kind: 'gate', name: 'Acceptance' },
]

// Where a rail id sits on the rail, and −1 for anything not on it (an off-rail record's own
// directory name, a typo). The one ordering of gates there is: a sort that keys on a DIRECTORY
// NAME instead is only ever right by accident, and the accident ran out — `gate-1-…` precedes
// `gate-2-…` alphabetically, but the words of ADR-064 sort acceptance, blueprint, contract,
// intent, so an alphabetical sort would name Acceptance as the gate under review of a project
// whose Intent gate is pending, silently (ADR-064 condition (b)). Lives beside RAIL_DEF because
// the table is the answer; a second copy of the order is how two readers start disagreeing.
export function railIndexOf (id) {
  return RAIL_DEF.findIndex(d => d.id === String(id))
}

export const GATE_STATES = ['blessed', 'pending', 'locked']
export const STAGE_STATES = ['done', 'active', 'locked']

// The source line a mapping starts on, hung off every map the parser returns. A SYMBOL, so it
// is invisible to Object.keys/entries, to JSON.stringify and to the duplicate-key check —
// nothing that walks a parsed record can trip over it. The review surface needs it: an
// obligation the Software Architect is asked to settle must say where in Git it is written,
// so it can be answered at its original rather than in a rendering (#1012).
export const LINE = Symbol('record-read.line')

// ── strict YAML-subset parser ───────────────────────────────────────────────

export function parseYaml (text, file, die) {
  const raw = text.split('\n')
  const lines = [] // { indent, body, no }
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i]
    if (/\t/.test(line)) die(`${file}:${i + 1}: tabs are not allowed`)
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    lines.push({ indent: line.match(/^ */)[0].length, body: trimmed, no: i + 1 })
  }
  let pos = 0
  const scalar = v => {
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1).replace(/\\"/g, '"')
    }
    return v
  }
  // Two shapes an author writes by habit that this subset does not have, refused HERE — at the
  // line that carries them — because both used to fail somewhere else entirely (#885). A
  // trailing comment silently became part of the value, so a path failed as 'missing' with the
  // comment inside its name; a flow list silently became a STRING, which reached an array
  // method in a render function and came out as a raw TypeError. The strictness IS the format
  // validation, and a validator that answers a wrong shape with a stack trace is not validating.
  const shape = (what, raw, no) => {
    if (/^"(?:[^"\\]|\\.)*"$/.test(raw) || /^'[^']*'$/.test(raw)) return   // quoted: value, whole
    if (raw.startsWith('#')) {
      die(`${file}:${no}: ${what} has nothing but a '#' comment after it — this format takes ` +
        `FULL-LINE comments only: put the comment on its own line above, or quote the value if ` +
        `it really starts with '#' (a tracker ref is written \`"#812"\`) — ${GRF}`)
    }
    if (/^[[{]/.test(raw)) {
      die(`${file}:${no}: ${what} is written as an inline ${raw[0] === '[' ? 'list' : 'mapping'} ` +
        `(${raw}) — this format has no flow collections: write a block list, one '- ' item per ` +
        `line indented two spaces, or a block mapping — ${GRF}`)
    }
    if (/\s#/.test(raw)) {
      die(`${file}:${no}: ${what} carries a trailing '#' comment — this format takes FULL-LINE ` +
        `comments only, and the comment would otherwise become part of the value. Move it to ` +
        `its own line above, or quote the value if the '#' belongs to it — ${GRF}`)
    }
  }
  function parseNode (indent) {
    if (pos >= lines.length || lines[pos].indent < indent) return null
    return lines[pos].body.startsWith('- ') ? parseList(lines[pos].indent) : parseMap(lines[pos].indent)
  }
  function parseMap (indent) {
    const out = {}
    let first = null
    while (pos < lines.length) {
      const l = lines[pos]
      if (l.indent < indent) break
      if (l.indent > indent) die(`${file}:${l.no}: unexpected indent`)
      if (l.body.startsWith('- ')) break
      const m = l.body.match(/^([A-Za-z_][A-Za-z0-9_]*):(?:\s+(.*))?$/)
      if (!m) die(`${file}:${l.no}: expected 'key: value' or 'key:', got: ${l.body}`)
      if (m[1] in out) die(`${file}:${l.no}: duplicate key '${m[1]}'`)
      if (first === null) first = l.no
      pos++
      if (m[2] !== undefined) {
        shape(`'${m[1]}:'`, m[2], l.no)
        out[m[1]] = scalar(m[2])
      } else {
        const child = parseNode(indent + 2)
        if (child === null) die(`${file}:${l.no}: '${m[1]}:' has no indented block`)
        out[m[1]] = child
      }
    }
    if (first !== null) Object.defineProperty(out, LINE, { value: first, enumerable: false })
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
        // '- key: …' opens a mapping: virtually re-indent the rest and re-parse.
        lines[pos] = { indent: indent + 2, body: rest, no: l.no }
        out.push(parseMap(indent + 2))
      } else {
        pos++
        shape(`the '- ' item`, rest, l.no)
        out.push(scalar(rest))
      }
    }
    return out
  }
  const doc = parseNode(0)
  if (pos < lines.length) die(`${file}:${lines[pos].no}: trailing content`)
  if (doc === null || Array.isArray(doc)) die(`${file}: document must be a mapping`)
  return doc
}

// ── the Q&A ledger reader (qa-ledger/1) ─────────────────────────────────────
// Deliberately a LINE SCAN, not the strict parser above: `qa.yaml` is a different YAML subset
// (inline `[lists]`, trailing `#` comments) and the `qa-ledger` skill's own `qa check` is that
// format's fail-closed validator. This reader is the READING side — it must not be the second
// place that decides whether a ledger is well formed.
//
// Returns { entries: Map<id, entry>, deferred: [...] }. Each entry carries its fields verbatim,
// `blocks` split out of the inline list, and `line` — the file line its `- id:` sits on.
// Callers existence-check the file first, so the message names their own context.
export function readQaLedger (abs, file) {
  const entries = new Map()
  let cur = null
  const raw = readFileSync(abs, 'utf8').split('\n')
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i].match(/^ {2}- id:\s*(QA-\d{3})\s*(?:#.*)?$/)
    if (m) { cur = { id: m[1], line: i + 1, file }; entries.set(m[1], cur); continue }
    if (!cur) continue
    const f = raw[i].match(/^ {4}([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/)
    if (!f) continue
    let v = f[2].trim()
    const q = v.match(/^"((?:[^"\\]|\\.)*)"/)
    if (q) { cur[f[1]] = q[1].replace(/\\"/g, '"'); continue }
    v = v.replace(/\s#.*$/, '').trim()
    const list = v.match(/^\[(.*)\]$/)
    cur[f[1]] = list
      ? (list[1].trim() ? list[1].split(',').map(x => x.trim().replace(/^"(.*)"$/, '$1')) : [])
      : v
  }
  const deferred = [...entries.values()].filter(e => e.deferred !== undefined)
    .map(e => ({ ...e, ref: (e.deferred.match(/^#\d+/) ?? [null])[0] }))
  return { entries, deferred }
}
