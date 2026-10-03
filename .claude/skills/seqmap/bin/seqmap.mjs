#!/usr/bin/env node
// seqmap — derive the Sequence Map from tagged .bpd business-process sources.
//
// The Mockup stage (ADR-040 §2) needs a machine-readable expectation map before any Method model
// exists (ADR-037 §2 describes the mature, model-derived form). The tagged .bpd single
// sources already carry, machine-readably, each BP's System Interactions and their flow
// order: every message into the `system pool` is one SI. This tool parses the .bpd per BP
// into ordered {from, to, operation} interactions — gateway branches (one path per branch)
// and loops included — optionally joins the screen models (each action's `calls` names an
// SIxx.yy id), and emits one deterministic JSON map.
//
// ADR-066 (#1181): a System Interaction's id is MINTED ONCE at Mockup and never rewritten. There
// is no provisional `BPxx-SIaa.bb` form, no binding-time rewrite (`rebind` is deleted), no
// `binding: provisional | bound` discriminator on the map and no `--binding` translation on
// `replay`. The facet·operation an SI resolves to is a binding, recorded in the model and in
// si-binding.yaml, and stamped into the map as `operations[SIxx.yy].operation`.
//
// Consumers: the clickable mockup runtime (#405), the walkthrough log (#406), and the Blueprint
// walkthrough-replay regression — all on the same ids, at every stage.
// Format: process-specs/seqmap-format.md. Contract: stage-ab-tooling-contract.md §2.
//
// The Design stage adds `complete` (ADR-041, #411): the model↔BPMN completeness check joining the
// tagged .bpd set × the SI binding map (process-specs/si-binding-format.md) × the model
// (ReadArchitecture JSON) — the Gate-2 mechanical gate ("no BPMN gateway edge left
// unrealized", ADR-037 §2 / ADR-040 §3).
//
// `si-docs` (#346) reconciles the SI MARKDOWN set against the model's use cases, both
// directions. It joins on the filename id alone, so — unlike `complete` — it needs no .bpd
// sources and serves a project whose business design arrived as documents.
//
// TWO DOCUMENT CLASSES (#1359). The hand-written `SIxx.yy_Name.md` is keyed by the minted
// System-Interaction id and joins the model directly. The GENERATED ADR-069 call-site export
// `BPxx.yy_Name.md` is keyed by the drawn CALL SITE and carries no SI id at all, so it joins
// only through `si-binding.yaml`: `--binding` is what teaches this command that class. A project
// may run either class or both, and a project that RETIRED the hand-written class still has a
// written surface — which is why the empty-set guard refuses an empty read of BOTH classes and
// not of the hand-written one alone.
//
// Commands:
//   seqmap generate <dir|files...> [--screens <dir>] [-o out.json]
//   seqmap check    <seqmap.json> <dir|files...> [--screens <dir>]
//   seqmap complete <dir|files...> --binding <si-binding.yaml> --model <model.json> [--screens <dir>]
//   seqmap si-docs  <SI markdown dir|files...> --model <model.json> [--binding <si-binding.yaml>]
//
// `generate` is deterministic: same sources -> byte-identical output (no timestamps).
// `check` regenerates in memory and fails if the committed map differs (the
// GENERATED-do-not-edit guard). Zero dependencies; plain Node.

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, basename, dirname, resolve } from 'node:path';

function die(msg) { process.stderr.write('seqmap: error: ' + msg + '\n'); process.exit(1); }
function warn(msg) { process.stderr.write('seqmap: warning: ' + msg + '\n'); }

// ===================================================================================
//  NON-LIVE SOURCES (#1243) — the generators skip, the inspectors do not.
//
//  A `.bpd` header declaring `status dissolved|retired|parked` (#1148) says the whole
//  business process is out of the live inventory. Since #1243 that declaration reaches
//  the GENERATED surface: `generate` (and `check`, which regenerates) leave the source
//  out of the map entirely, so nothing downstream — the mockup, the Design Book, the
//  gate dossier — has to re-derive the exclusion for itself. It is what a parked process
//  is FOR: on figaro, BP07 was taken out of scope and the exclusion lived only as prose,
//  which cost twelve days and five issues over drawings nobody was building.
//
//  `complete` and `unused` do NOT skip. They are the inspectors that police the boundary:
//  [C13] fires when the binding map still names a block of a dissolved or retired process,
//  and that rule only exists because the check reads the non-live source. "Ignored" is a
//  statement about what is GENERATED, never about what is CHECKED — a skip that reached the
//  checks would make "parked but still wired in" invisible, which is the rot the mechanism
//  is against. A PARKED process is the one state whose rows are kept (#1252): parked means
//  drawn, not built, and REVIVABLE, and the row is the only record of which System
//  Interaction the parked block resolves to. `complete` derives "parked" from the .bpd
//  header, keeps the row out of every drawing-side check, and reports an interaction only
//  parked rows resolve to as [C9-parked] — a warning naming what revives it — not [C9].
//
//  The MODEL has a disposition of its own since #1320, and it is about the interaction rather
//  than about a drawing: a use case carrying `lifecycle: future` (decided, deferred) or
//  `lifecycle: retired` (decided AGAINST, kept as a record, id never re-minted) is exempt from
//  [C9] at interaction AND permutation granularity — the emptiness [C9] infers a defect from is
//  DECLARED. Printed on every run, never silent. The pair's hard constraint is [C9-notbuilt]:
//  a LIVE call site may not resolve to an interaction the model says is not built.
//
//  `--include-parked` restores the old behaviour for the generators. The default changed,
//  not the capability. A source named directly on the command line is skipped exactly like
//  one found by a directory sweep — otherwise the rule holds only until somebody points
//  the tool at the file.
// ===================================================================================

/** The non-live digests, in source order — empty when the caller asked to include them. */
const nonLiveOf = (digests, includeParked) => (includeParked ? [] : digests.filter((d) => d.status));

/** The skip is never silent: one line on stderr, every run, naming every source and its state. */
function reportSkipped(skipped) {
  if (!skipped.length) return;
  process.stderr.write(
    `seqmap: skipped ${skipped.length} non-live source(s): ` +
    skipped.map((d) => `${basename(d.file, '.bpd')} (${d.status.state})`).join(' · ') +
    ' — pass --include-parked to act on them anyway\n');
}

// ===================================================================================
//  AST — the .bpd structure comes from `bpmn-dsl ast`, which OWNS the grammar
// ===================================================================================
// seqmap used to carry a LIFTED COPY of bpmn-dsl.mjs's parse(), kept in step by a pinned grammar
// manifest and a drift test. The copy went stale FOUR times in a row, silently, and each time a
// run lost its Sequence Map until somebody noticed: the `output` directive (#1034), the loop
// markers (#1008), the `si` speaking name (#1047), and the typed initiator pools (#1195, which
// left `seqmap complete` dead on the Figaro project — the check that proves a binding map still
// matches its drawings). A fifth was due the moment bpmn-tools 2.0.0 renamed `si` to `call`.
//
// The copy is deleted (#407/#1026). bpmn-dsl grew an `ast` verb that dumps its own parse as
// deterministic JSON, and seqmap consumes that. THERE IS NO FALLBACK PARSER HERE, deliberately:
// a fallback would rebuild the duplication this deleted, and would do it in exactly the
// situation where nobody is watching. When bpmn-dsl is missing, seqmap says so and stops.
//
// What the dump gives us, and what it costs: bpmn-dsl's parse errors are its own (`line N:`),
// so a source seqmap refuses is refused in the DIAGRAM BUILD'S words, which is the right
// authority — a source the build rejects must never read as green here (#1034).
const BPD_AST_FORMAT = 'bpd-ast/1';

// Where an INSTALLED bpmn-dsl.mjs lives. The marketplace checkout first (what a developer machine
// has), then the version-keyed plugin cache — the same two roots `scripts/find-bpmn-dsl.sh`
// consults in this repository.
const bpmnDslInstalled = () => {
  const root = join(homedir(), '.claude', 'plugins');
  const rel = ['skills', 'bpmn-dsl', 'bin', 'bpmn-dsl.mjs'];
  const out = [join(root, 'marketplaces', 'zulli-marketplace', 'plugins', 'bpmn-tools', ...rel)];
  const cache = join(root, 'cache', 'zulli-marketplace', 'bpmn-tools');
  if (existsSync(cache)) {
    // version-keyed directories; newest first, so a fresh install wins over a stale one
    const vers = readdirSync(cache).filter((v) => /^\d/.test(v))
      .sort((a, b) => cmpDotted(b, a));
    for (const v of vers) out.push(join(cache, v, ...rel));
  }
  return out;
};

/** -1 / 0 / 1 over dotted numeric versions */
function cmpDotted(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

function resolveBpmnDsl() {
  // An explicit override is a DECLARATION, so a wrong path is an error rather than a quiet
  // fallback to whatever happens to be installed: silently running a different compiler than
  // the one you named is how a gate's verdict stops meaning what it says (#1113).
  const declared = process.env.BPMN_DSL || process.env.BPMN_DSL_PATH;
  if (declared) {
    if (existsSync(declared)) return declared;
    die(`$BPMN_DSL names '${declared}', which does not exist. An explicit override is a ` +
      `declaration — seqmap will not quietly use another copy instead. Fix the path or unset it.`);
  }
  const cands = bpmnDslInstalled();
  for (const c of cands) if (existsSync(c)) return c;
  die('cannot find `bpmn-dsl`, and seqmap reads every .bpd source through it.\n' +
    '  seqmap carries no .bpd parser of its own. It used to — a lifted copy of bpmn-dsl\'s — and\n' +
    '  that copy silently fell four grammar versions behind, costing runs their Sequence Map\n' +
    '  (#1195). Install the bpmn-tools plugin (version 3.0.0 or later, which is where the `ast`\n' +
    '  verb arrived):\n' +
    '    /plugin install bpmn-tools@zulli-marketplace\n' +
    '  or point $BPMN_DSL at a bpmn-dsl.mjs. Looked at:\n' +
    cands.map((c) => `    ${c}`).join('\n'));
}

/** Every source's AST, in the order the files were given. One `bpmn-dsl` run for the whole set. */
function loadAsts(files) {
  const bin = resolveBpmnDsl();
  const r = spawnSync(process.execPath, [bin, 'ast', ...files],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error) die(`could not run \`bpmn-dsl ast\` (${bin}): ${r.error.message}`);
  if (r.status !== 0) {
    if (/unknown command 'ast'/.test(r.stderr || ''))
      die(`the bpmn-dsl at ${bin} has no \`ast\` verb — it predates bpmn-tools 3.0.0, which is where\n` +
        `  the AST dump arrived (#407/#1026). seqmap reads every .bpd through it, so update the\n` +
        `  plugin (claude plugin update bpmn-tools@zulli-marketplace) or point $BPMN_DSL at a\n` +
        `  newer copy.`);
    die(`\`bpmn-dsl ast\` refused the sources (exit ${r.status}). The .bpd grammar is bpmn-dsl's, so\n` +
      `  its refusal is the authority — a source the diagram build rejects is not green here:\n` +
      `${(r.stderr || '').trimEnd() || '  (no message)'}`);
  }
  let doc;
  try { doc = JSON.parse(r.stdout); }
  catch (e) { die(`\`bpmn-dsl ast\` (${bin}) did not return JSON: ${e.message}`); }
  // The format field is what replaced the drift test: an old bpmn-dsl and a new seqmap now
  // disagree OUT LOUD, instead of one of them quietly mis-reading the other's sources.
  if (doc.format !== BPD_AST_FORMAT)
    die(`\`bpmn-dsl ast\` speaks '${doc.format ?? '(no format field)'}' and this seqmap reads ` +
      `'${BPD_AST_FORMAT}'.\n  Upgrade whichever is older — bpmn-dsl is ${bin}`);
  const byPath = new Map();
  for (const src of doc.sources || []) byPath.set(resolve(src.path), src);
  return files.map((f) => {
    const src = byPath.get(resolve(f));
    if (!src) die(`\`bpmn-dsl ast\` returned no entry for ${f}`);
    return src;
  });
}

// ===================================================================================
//  MODEL DIGEST — per .bpd file: system chains, SI catalog entries, handle index
// ===================================================================================
const START_KINDS = new Set(['start', 'timerStart', 'messageStart']);
// ---- the two populations (ADR-069, #1196) --------------------------------------------------
// A CALL SITE is the system chain a business process DRAWS — the block, however it is started
// (a step's send, a timer, the scheduler, a cross-process continuation). It belongs to the
// process, is minted when the block is drawn, and is what every MOCKUP artifact speaks — the
// .bpd block tag, the .vw action key, the mockup key, the walkthrough log. NOT "the arrow": a
// timer-started chain has none, and two arrows can feed one chain (ADR-069 §1).
// A SYSTEM INTERACTION is the operation on a Manager facet — what the SYSTEM offers. It belongs
// to the system, is minted at DESIGN, and is what every model-tier artifact speaks.
// Many call sites resolve to one System Interaction, EACH naming the permutation it exercises:
// one operation, several polymorphic request variants, so two call sites on one interaction may
// legitimately draw different blocks. si-binding.yaml is the only join.
const CALLSITE_TAG_RE = /^BP(\d{2}\.\d{2})_(\w+)$/;      // the `call` block tag: id + _Name
const CALLSITE_ID_RE = /^BP\d{2}\.\d{2}$/;               // design-artifact-conventions, ADR-069
const SI_TAG_RE = /^SI(\d{2}\.\d{2})_(\w+)$/;            // the RETIRED si-block tag (ADR-066)
const SI_ID_RE = /^SI\d{2}\.\d{2}$/;                     // design-artifact-conventions
// The retired provisional form. Kept ONLY so a source still carrying it gets the migration
// message instead of "does not match". Note the HYPHEN: `BP07-SI01.02` is the retired scheme,
// `BP07.03` is a call site, and the two are never confused because the shapes are disjoint.
const SI_RETIRED_PROV_RE = /^BP\d{2}-SI\d{2}\.\d{2}(?:_\w+)?$/;
const SQ_ID_RE = /^SQ(\d{2}\.\d{2})\.(\d{2})$/;

// The refusal every reader of an id shares: a `BPxx-SIaa.bb` id is not "not yet bound", it is a
// retired scheme, and saying so is the difference between a fixable error and a puzzle.
const retiredProvisional = (id, at) =>
  `${at}: '${id}' is a retired PROVISIONAL id (the ADR-066 scheme, itself superseded). A drawn ` +
  `call and a System Interaction are two things (ADR-069, #1196): tag the drawn BLOCK with a ` +
  `CALL SITE id 'BPxx.yy', and resolve it to an 'SIxx.yy' in si-binding.yaml's callSites map.`;

// A drawn block tagged with a System Interaction id: the ADR-066 single-id scheme. The drawing
// names what the PROCESS asks for; what the SYSTEM offers is minted at Design and lives only in
// the binding map and below. A .bpd never mentions a System Interaction.
const siTagInDrawing = (id, file, ln) =>
  `${file}:${ln}: block tag '${id}' is a System Interaction id, and a drawing never names one ` +
  `(ADR-069 §5). The drawn block belongs to its business process: tag it with a CALL SITE id — ` +
  `\`call "BP07.03_SpeakingName" { … }\` — and record which System Interaction it resolves to ` +
  `in si-binding.yaml under 'callSites:'.`;

// A drawn block's tag: `BPxx.yy_Name`. `id` is the join key — the CALL SITE, which belongs to
// the business process that drew the block and never expires (ADR-069 §1). `name` is the
// block's own speaking name, written by the interviewer: it is stakeholder prose and is NOT
// required to agree with the use-case name the System Interaction settled on (ADR-069 §6 —
// Comanda draws one operation as "Find customer by phone" in BP01 and "Look up caller by
// phone" in BP12, and neither wording is wrong).
function callSiteTag(name) {
  const m = name.match(CALLSITE_TAG_RE);
  return m ? { id: `BP${m[1]}`, name: m[2] } : null;
}

// A si-block tag: `SIxx.yy_Name` — the RETIRED ADR-066 form. Read only to say so.
function siTag(name) {
  const m = name.match(SI_TAG_RE);
  return m ? { op: `SI${m[1]}`, name: m[2] } : null;
}

// every statement (recursively), with its owning pool — for handle resolution
function* allStmts(body) {
  for (const st of body || []) {
    yield st;
    if (st.body) yield* allStmts(st.body);
    for (const b of st.branches || []) yield* allStmts(b.body);
  }
}

function* allSends(body) {
  for (const st of allStmts(body)) for (const s of st.sends || []) yield { node: st, send: s };
}

function digest(file, model) {
  if (!model.idDeclared) die(`${file}: missing @startbpmn <id>`);
  const bpM = model.id.match(/^(BP\d{2})_(\w+)$/);
  if (!bpM) die(`${file}: diagram id '${model.id}' is not BPxx_Name`);
  const [, bpCode, bpName] = bpM;

  const systemPools = model.pools.filter((p) => p.kind === 'system');
  if (systemPools.length !== 1) die(`${file}: expected exactly one 'system pool' (found ${systemPools.length})`);
  const sys = systemPools[0];

  const handleOwner = new Map();               // handle -> { pool, stmt }
  for (const p of model.pools)
    for (const st of allStmts(p.body))
      if (st.handle) {
        if (handleOwner.has(st.handle)) die(`${file}: duplicate handle '${st.handle}'`);
        handleOwner.set(st.handle, { pool: p, stmt: st });
      }

  // --- system pool -> chains: (messageStart|timerStart|start) ... up to the next trigger
  const chains = [];
  let chain = null;
  for (const st of sys.body) {
    if (START_KINDS.has(st.k)) { chain = { trigger: st, stmts: [], sis: [], file }; chains.push(chain); continue; }
    if (!chain) die(`${file}: system pool '${sys.name}' has steps before its first start event`);
    chain.stmts.push(st);
    for (const s of allStmts([st])) if (s.k === 'call') chain.sis.push(s);
  }
  // The tag a drawn block carries is a CALL SITE id (ADR-069 §5): the block belongs to this
  // business process, so the drawing names what the process asks for and never what the system
  // offers. A System Interaction id here is the retired ADR-066 single-id scheme and is refused
  // with its migration path — the id it should carry cannot be guessed from the drawing, because
  // which interaction a block resolves to is a Design decision recorded in si-binding.yaml.
  // `file:line` on the error path only. bpd-ast/1 carries no source positions — bpmn-dsl's own
  // parse errors do, but this is a JOIN finding raised after the parse succeeded — so the one way
  // to point at the offending block is to look its tag up in the source. Done lazily, when the
  // process is about to die anyway; never on the green path.
  const lineOf = (f, needle) => {
    const i = readFileSync(f, 'utf8').split(/\r?\n/).findIndex((l) => l.includes(needle));
    return i < 0 ? 1 : i + 1;
  };
  for (const c of chains) {
    if (!c.sis.length)
      die(`${file}: system chain triggered by '${c.trigger.label}' has no tagged call block — untagged source (tooling contract §1)`);
    for (const b of c.sis) {
      if (callSiteTag(b.tag)) continue;
      if (SI_RETIRED_PROV_RE.test(b.tag)) die(retiredProvisional(b.tag, `${file}: call`));
      if (SI_TAG_RE.test(b.tag)) die(siTagInDrawing(b.tag, file, lineOf(file, b.tag)));
      die(`${file}: block tag "${b.tag}" does not match BPxx.yy_Name (design-artifact-conventions; ADR-069 §1)`);
    }
    c.callSites = c.sis.map((b) => callSiteTag(b.tag).id);
    // emits: every send anywhere in the chain (incl. the trigger's and si-attached ones), source order
    c.emits = [...allSends([c.trigger]), ...allSends(c.stmts)].map(({ send }) => send);
    c.ends = c.stmts.filter((s) => s.k === 'end').map((s) => s.label);
  }
  const chainByHandle = new Map();             // messageStart handle -> chain
  for (const c of chains) if (c.trigger.handle) chainByHandle.set(c.trigger.handle, c);

  return { file, model, bpCode, bpName, sys, chains, chainByHandle, handleOwner, status: model.status };
}

// resolve a send destination inside one file -> { poolName, blackbox, handleStmt?, systemChain? }
function resolveDst(d, dst) {
  if (dst.kind === 'pool') {
    const p = d.model.pools.find((x) => x.name === dst.name);
    return { poolName: dst.name, blackbox: p ? p.kind === 'blackbox' : true, missing: !p };
  }
  const own = d.handleOwner.get(dst.name);
  if (!own) return null;
  return {
    poolName: own.pool.name, blackbox: own.pool.kind === 'blackbox', handleStmt: own.stmt,
    systemChain: own.pool.kind === 'system' ? d.chainByHandle.get(dst.name) : undefined,
    systemPool: own.pool.kind === 'system',
  };
}

// who sends into this handle (trigger sources for a messageStart)
function triggerSources(d, handle) {
  const out = [];
  for (const p of d.model.pools) {
    for (const { node, send } of allSends(p.body)) {
      if (send.to.kind !== 'handle' || send.to.name !== handle) continue;
      const src = { pool: p.name, message: send.label };
      if (p.kind === 'system') {
        const c = d.chains.find((c) => [c.trigger, ...c.stmts].some((s) => [...allStmts([s])].includes(node)));
        if (c && c.callSites[0]) src.operation = c.callSites[0];   // all-frozen chain: none
      }
      out.push(src);
    }
  }
  return out;
}

// #1167 — pool-level initiator typing: which starts are NOT human. A scheduler pool's paths are
// scheduler-initiated (the mockup may fire them deliberately; the walk is the scheduler's act,
// never a person's); a process pool's paths are a CONTINUATION of the named process rather than
// an independent front door. Rides the map on every path, flow pool and interaction that
// originates in a typed pool, so no consumer re-derives "not human" from the pool's name.
const initiatorOf = (pool) =>
  pool.kind === 'scheduler' ? { kind: 'scheduler' }
    : pool.kind === 'process' ? { kind: 'process', process: pool.handover }
      : null;

function triggerOf(d, st) {
  if (st.k === 'timerStart') return { kind: 'timer', label: st.label };
  if (st.k === 'start') return { kind: 'start', label: st.label };
  const t = { kind: 'message', label: st.label };
  const sources = st.handle ? triggerSources(d, st.handle) : [];
  if (sources.length) t.sources = sources; else t.external = true;   // sender lives in another BP
  return t;
}

// ===================================================================================
//  PATHS — per participant pool: flow graph, then a gateway-edge-covering path set
// ===================================================================================
function buildGraph(d, pool) {
  const nodes = [];
  const gotos = [];
  const mk = (kind, stmt) => { const n = { i: nodes.length, kind, stmt, out: [] }; nodes.push(n); return n; };
  const byHandle = new Map();
  const roots = [];

  const walk = (stmts) => {
    let entry = null, prev = [];
    const link = (n, branch) => { for (const p of prev) p.out.push({ to: n, branch }); };
    const note = (n) => { if (!entry) entry = n; };
    for (const st of stmts) {
      if (st.k === 'if') {
        const gw = mk('gateway', st);
        link(gw); note(gw); prev = [];
        for (const br of st.branches) {
          if (!br.body.length) die(`${d.file}: pool "${pool.name}": empty branch "${br.label}" at gateway "${st.cond}"`);
          const sub = walk(br.body);
          gw.out.push({ to: sub.entry, branch: br.label });
          prev = prev.concat(sub.exits);
        }
        continue;
      }
      if (st.k === 'goto') {
        const g = mk('goto', st);
        link(g); note(g); gotos.push(g); prev = [];
        continue;
      }
      const kind = START_KINDS.has(st.k) ? 'start' : st.k === 'end' ? 'end' : 'step';
      const n = mk(kind, st);
      if (st.handle) byHandle.set(st.handle, n);
      if (kind === 'start') { roots.push(n); note(n); prev = [n]; continue; }
      link(n); note(n);
      prev = kind === 'end' ? [] : [n];
    }
    return { entry, exits: prev };
  };
  walk(pool.body);
  for (const g of gotos) {
    const t = byHandle.get(g.stmt.target);
    if (!t) die(`${d.file}: pool "${pool.name}": goto references unknown handle '${g.stmt.target}'`);
    g.out.push({ to: t });
  }
  return { nodes, roots };
}

// SI steps a node contributes (its sends that land on a system chain)
function siSteps(d, node) {
  const steps = [];
  for (const send of node.stmt.sends || []) {
    const r = resolveDst(d, send.to);
    if (!r) die(`${d.file}: send "${send.label}" references unknown handle '${send.to.name}'`);
    if (!r.systemPool) continue;
    if (!r.systemChain)
      die(`${d.file}: send "${send.label}" targets '${send.to.name}' in the system pool, but that is not a chain trigger (messageStart)`);
    for (const op of r.systemChain.callSites) steps.push({ operation: op, message: send.label });
  }
  return steps;
}

const PATH_CAP = 5000;

function enumeratePaths(d, graph, root, cons, prunedEdges) {
  const paths = [];
  const rec = (node, onPath, branches, steps) => {
    if (paths.length >= PATH_CAP) die(`${d.file}: more than ${PATH_CAP} acyclic paths — split the process`);
    if (node.kind === 'end') { paths.push({ branches, steps, outcome: { kind: 'end', label: node.stmt.label } }); return; }
    if (node.kind === 'goto') {
      const target = node.out[0].to;
      if (onPath.has(target.i)) {
        paths.push({ branches, steps, outcome: { kind: 'loop', backTo: target.stmt.handle, label: target.stmt.label } });
        return;
      }
      rec(target, onPath, branches, steps);
      return;
    }
    const nextOnPath = new Set(onPath); nextOnPath.add(node.i);
    const mySteps = node.kind === 'gateway' ? [] : siSteps(d, node);
    if (node.kind === 'gateway') {
      for (const e of node.out) {
        // feasibility (#419): an authored constraint can rule this edge out for the
        // current branch prefix — prune the combination, never enumerate it
        if (cons && infeasibleEdge(cons, node.stmt.cond, e.branch, branches)) {
          if (prunedEdges) prunedEdges.add(`${node.i}:${e.branch}`);
          continue;
        }
        rec(e.to, nextOnPath, [...branches, { gateway: node.stmt.cond, taken: e.branch, edge: `${node.i}:${e.branch}` }], steps);
      }
      return;
    }
    if (!node.out.length) { paths.push({ branches, steps: [...steps, ...mySteps], outcome: { kind: 'dangling' } }); return; }
    rec(node.out[0].to, nextOnPath, branches, [...steps, ...mySteps]);
  };
  rec(root, new Set(), [], []);
  return paths;
}

function coverPaths(d, pool, cons) {
  const graph = buildGraph(d, pool);
  const selected = coverFromGraph(d, pool, cons, graph);
  return { paths: selected, graph };
}

function coverFromGraph(d, pool, cons, graph) {
  // coverage universe: every gateway branch edge reachable from a root
  const universe = new Set();
  const seen = new Set();
  const q = [...graph.roots];
  while (q.length) {
    const n = q.pop();
    if (seen.has(n.i)) continue;
    seen.add(n.i);
    for (const e of n.out) { if (n.kind === 'gateway') universe.add(`${n.i}:${e.branch}`); q.push(e.to); }
  }
  const covered = new Set();
  const selected = [];
  const pruned = new Set();
  for (const root of graph.roots) {
    let tookOne = false;
    for (const p of enumeratePaths(d, graph, root, cons, pruned)) {
      const fresh = p.branches.some((b) => !covered.has(b.edge));
      if (!fresh && tookOne) continue;
      for (const b of p.branches) covered.add(b.edge);
      selected.push({ root, ...p });
      tookOne = true;
    }
  }
  const uncovered = [...universe].filter((e) => !covered.has(e));
  if (uncovered.length) {
    // if any uncovered edge was feasibility-pruned, the constraints are implicated —
    // the rest of the shortfall is downstream collateral of the same pruning
    if (uncovered.some((e) => pruned.has(e)))
      die(`${d.file}: pool "${pool.name}": ${uncovered.length} gateway branch(es) reachable only through infeasible combinations (feasibility.yaml) — constraint contradiction or business-design finding`);
    die(`${d.file}: pool "${pool.name}": ${uncovered.length} gateway branch(es) unreachable by any path — model finding`);
  }
  return selected;
}

// The pool decision graph the covering paths were enumerated from, serialized into the
// map (#852): `paths` are REPRESENTATIVES of an enumeration choice, so replay must not
// treat membership in them as identity — a walk's identity is that its own branch
// combination derives a walk of THIS graph. Node order is source order (deterministic);
// in bound mode the chains were rebound before this runs, so `steps` carry bound ids.
function serializeFlow(d, graph) {
  return graph.nodes.map((n) => {
    if (n.kind === 'gateway')
      return { k: 'gw', gateway: n.stmt.cond, out: n.out.map((e) => ({ taken: e.branch, to: e.to.i })) };
    if (n.kind === 'end') return { k: 'end', label: n.stmt.label };
    if (n.kind === 'goto') {
      const t = n.out[0].to;
      return { k: 'goto', to: t.i, backTo: t.stmt.handle, label: t.stmt.label };
    }
    const node = { k: n.kind === 'start' ? 'start' : 'step' };
    if (n.kind === 'start') node.label = n.stmt.label;
    const steps = siSteps(d, n);
    if (steps.length) node.steps = steps;
    if (n.out.length) node.to = n.out[0].to.i;
    return node;
  });
}

// ===================================================================================
//  SCREEN JOIN — .vw actions whose `calls`/`also` name a CALL SITE (ADR-069 §5: a screen
//  model is authored at Mockup, against the drawings, before any System Interaction exists,
//  so the key it can honestly carry is the drawn block's — and that id never expires).
//  `BPxx-SIaa.bb` is the retired provisional scheme and is refused with its migration path.
// ===================================================================================
function joinScreens(dir, operations) {
  const files = [];
  const walkDir = (p) => {
    for (const e of readdirSync(p).sort()) {
      const f = join(p, e);
      if (statSync(f).isDirectory()) walkDir(f);
      else if (e.endsWith('.vw')) files.push(f);
    }
  };
  walkDir(dir);
  const screens = {};
  let errors = 0;
  for (const f of files) {
    let screen = null, action = null;
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      let m;
      if ((m = line.match(/^\s*(?:screen|dialog(?:\s+def)?)\s+([\w-]+)/))) { screen = m[1]; action = null; continue; }
      if ((m = line.match(/^\s*action\s+([\w-]+)/))) { action = m[1]; continue; }
      if ((m = line.match(/^\s*(calls|also)\s+([\w.-]+)\s*;/))) {
        const [, via, key] = m;
        if (SI_RETIRED_PROV_RE.test(key.split('.').slice(0, 2).join('.'))) {
          warn(retiredProvisional(key, `${f}: ${screen || '?'}#${action || '?'} ${via}`));
          errors++; continue;
        }
        const opM = key.match(/^(BP\d{2}\.\d{2})/);
        if (!opM) continue;                                   // not a call-site key (a field path, a literal)
        const op = opM[1];
        if (!operations[op]) { warn(`${f}: ${screen || '?'}#${action || '?'} ${via} unknown call site '${key}'`); errors++; continue; }
        (screens[op] ||= []).push({ file: basename(f), screen, action, via });
      }
    }
  }
  if (errors) die(`${errors} screen action(s) reference unknown or retired call-site ids`);
  return screens;
}

// ===================================================================================
//  GENERATE — one map shape at every stage (ADR-066: the ids are minted at Mockup and never
//  rewritten, so a Mockup map and a Design map key on the SAME ids; there is no
//  `binding: provisional | bound` discriminator any more). `bind` = the runComplete result,
//  present once the model exists: it adds the resolved facet·operation per SI, drops the si
//  blocks frozen by a non-live process status, and resolves aliases. Callers must have
//  verified bind.problems is empty — an enriched map only exists if the completeness check
//  is green (ADR-037 §2 / ADR-041 §3).
// ===================================================================================
function generate(files, screensDir, bind = null, includeParked = false) {
  const feas = loadFeasibility(files);
  const reuse = loadReuse(files);
  const allDigests = loadAsts(files).map((ast, i) => digest(files[i], ast));
  allDigests.sort((a, b) => a.bpCode.localeCompare(b.bpCode));
  // The sidecars and the one-system rule are judged over EVERY supplied source, live or not:
  // a feasibility row naming a parked BP is still a row about a source that exists, and a
  // parked source declaring a second system pool is still a defect of the source tree. Only
  // the MAP is built from the live inventory.
  if (feas) validateFeasibility(feas, allDigests);
  if (reuse) validateReuseSources(reuse, allDigests);

  const systems = [...new Set(allDigests.map((d) => d.sys.name))];
  if (systems.length !== 1) die(`sources disagree on the system pool: ${systems.join(', ')}`);
  const system = systems[0];

  // #1243 — a non-live source leaves the generated map WHOLE: its call sites, its paths and
  // its process entry all go, so no consumer has to filter for itself. Its exclusion is
  // recorded in `nonLive` below, which is the one thing that stays. The pre-#1243 shape
  // dropped only the frozen si BLOCKS, and only in bound mode, so a parked process still
  // arrived at the mockup as a walkable drawing of something nobody was building.
  const skipped = nonLiveOf(allDigests, includeParked);
  reportSkipped(skipped);
  const skippedFiles = new Set(skipped.map((d) => d.file));
  const digests = allDigests.filter((d) => !skippedFiles.has(d.file));

  // --- the catalog is keyed by CALL SITE (ADR-069 §1), at every stage. Two drawn blocks are two
  //     entries even when they resolve to one System Interaction: they belong to different
  //     business processes, they may exercise different permutations of that interaction, and
  //     merging them would be the union over divergent blocks the split exists to end. A Mockup
  //     map and a Design map therefore key on the SAME ids — the Design map only STAMPS IN what
  //     the binding resolved (`si`, the interaction's use-case name, the facet operation).
  //     (`operations` keeps its `seqmap/1` field name: renaming the map's own keys is ADR-069 §5's
  //     `callSites[]` change, a separate act with its own consumers — replay, book-build,
  //     review-surface, the mockup skeleton.) ---
  const operations = {};
  for (const d of digests) {
    for (const c of d.chains) {
      c.sis.forEach((si, i) => {
        const op = c.callSites[i];
        const tagName = callSiteTag(si.tag).name;
        let entry;
        if (bind) {
          const row = bind.byCallSite.get(op);
          const ix = bind.bySi.get(row.si);
          // `operation` is the MODEL's facet operation for the client hop (#676) — no id carries
          // a facet, so this field is where the facet rides. `name` is the interaction's use-case
          // name and matches the operation name only by convention. There is exactly ONE, and
          // since ADR-067 (#1186) it is read from the use case's own `operationId` declaration
          // rather than assembled from its permutations' first steps — so no `variants` list can
          // arise here, because the model cannot hold two. `drawnName` is the block's own
          // stakeholder wording, which is NOT required to agree with it (ADR-069 §6).
          const opInfo = ix._operation ? { operation: { ...ix._operation } } : {};
          entry = (operations[op] ||= {
            id: si.tag, name: tagName, si: row.si, interaction: ix.name,
            ...(row.permutation ? { permutation: row.permutation } : {}), ...opInfo,
            ...(reuse && reuse.bySi.has(op) ? { reused: true } : {}),
            definitions: [],
          });
        } else {
          entry = (operations[op] ||= {
            id: si.tag, name: tagName,
            ...(reuse && reuse.bySi.has(op) ? { reused: true } : {}),
            definitions: [],
          });
          if (entry.name !== tagName)
            die(`${d.file}: block '${si.tag}' conflicts with earlier definition '${entry.id}' (same call site, different name)`);
        }
        entry.definitions.push({
          bp: d.bpCode,
          trigger: triggerOf(d, c.trigger),
          emits: c.emits.map((s) => {
            const r = resolveDst(d, s.to);
            if (!r) die(`${d.file}: send "${s.label}" references unknown handle '${s.to.name}'`);
            const e = { message: s.label, to: r.poolName };
            if (r.blackbox) e.blackbox = true;
            // #1182/ADR-068 — an emit that lands on ANOTHER system chain in the same source is a
            // same-BP consequence edge: it names the operation the hand-off starts. The EDGE
            // self-walk family reads it ("fired as the consequence of the declared source"), and
            // the mockup skeleton emits the real call. Cross-BP hand-offs join through the
            // receiving side's typed process pool (#1167), not through this field.
            if (r.systemChain && r.systemChain.callSites && r.systemChain.callSites[0])
              e.operation = r.systemChain.callSites[0];
            return e;
          }),
          ends: c.ends,
        });
      });
    }
  }
  // The `home` rule is gone (ADR-066, re-affirmed by ADR-069): a call site belongs to its
  // business process by identity, not by a "home" field, and a System Interaction belongs to no
  // process at all. Every key in the map is drawn by at least one supplied source by construction.
  for (const entry of Object.values(operations)) entry.definitions.sort((a, b) => a.bp.localeCompare(b.bp));
  const sortedOps = {};
  for (const k of Object.keys(operations).sort()) sortedOps[k] = operations[k];

  // --- per-BP paths + interactions ---
  const processes = [];
  for (const d of digests) {
    const cons = feas && feas.byBp.get(d.bpCode);
    const paths = [];
    const flowPools = [];
    for (const pool of d.model.pools) {
      if (pool.kind === 'system' || pool.kind === 'blackbox') continue;
      const callsSystem = [...allSends(pool.body)].some(({ send }) => {
        const r = resolveDst(d, send.to);
        return r && r.systemPool;
      });
      if (!callsSystem) {
        if ([...allStmts(pool.body)].some((s) => s.k === 'if'))
          warn(`${d.file}: pool "${pool.name}" has gateways but never calls ${system} — no paths emitted for it`);
        continue;
      }
      const { paths: selected, graph } = coverPaths(d, pool, cons);
      const initiator = initiatorOf(pool);
      for (const p of selected) {
        paths.push({
          id: `${d.bpCode}-P${String(paths.length + 1).padStart(2, '0')}`,
          pool: pool.name,
          ...(initiator ? { initiator } : {}),
          trigger: triggerOf(d, p.root.stmt),
          branches: p.branches.map(({ gateway, taken }) => ({ gateway, taken })),
          steps: p.steps,
          outcome: p.outcome,
        });
        if (p.outcome.kind === 'dangling')
          warn(`${d.file}: pool "${pool.name}": a flow ends without an 'end' event`);
      }
      flowPools.push({ pool: pool.name, ...(initiator ? { initiator } : {}), roots: graph.roots.map((r) => r.i), nodes: serializeFlow(d, graph) });
    }
    // flow-ordered interactions: first occurrence across paths, then system-self-triggered chains
    const interactions = [];
    const seenIx = new Set();
    for (const p of paths)
      for (const s of p.steps) {
        const k = `${p.pool}>${s.operation}`;
        if (seenIx.has(k)) continue;
        seenIx.add(k);
        // a typed pool's typing rides its interactions (#1167): an SI whose `from` is a scheduler
        // pool is scheduler-invocable; one from a process pool is a continuation of that process
        interactions.push({ from: p.pool, to: system, operation: s.operation, ...(p.initiator ? { initiator: p.initiator } : {}) });
      }
    for (const c of d.chains) {
      if (c.trigger.k === 'messageStart') continue;
      for (const op of c.callSites)
        interactions.push({ from: system, to: system, operation: op, trigger: triggerOf(d, c.trigger) });
    }
    const proc = { bp: d.bpCode, name: d.bpName, source: basename(d.file), interactions, paths };
    // the lifecycle travels with the map (#1148): a consumer of the map must never render a
    // dissolved/retired/parked process as indistinguishable from a live one
    if (d.status) proc.status = d.status.successor
      ? { state: d.status.state, successor: d.status.successor }
      : { state: d.status.state };
    // the walk-identity graph (#852) — with the constraints in force embedded, so replay
    // can re-judge any branch combination without the sidecar (rationale kept for messages)
    if (flowPools.length) {
      proc.flow = { pools: flowPools };
      if (cons)
        proc.flow.constraints = cons.map(({ gateway, taken, requires, excludes, rationale }) => ({
          gateway, taken,
          ...(requires ? { requires } : {}),
          ...(excludes ? { excludes } : {}),
          rationale,
        }));
    }
    processes.push(proc);
  }

  // orphan check: defined, never stepped on by any path, not self-triggered anywhere
  const invoked = new Set();
  for (const p of processes) for (const ix of p.interactions) invoked.add(ix.operation);
  for (const op of Object.keys(operations))
    if (!invoked.has(op)) warn(`call site ${op} is drawn but no path or self-trigger invokes it`);

  const screens = screensDir
    ? (bind ? joinScreensBound(screensDir, bind) : joinScreens(screensDir, sortedOps))
    : {};

  const map = {
    format: 'seqmap/1',
    generated: bind
      ? 'GENERATED by `seqmap generate --binding` — do not edit (tooling contract §7)'
      : 'GENERATED by `seqmap generate` — do not edit (Stage-A/B tooling contract §2)',
    system,
    sources: digests.map((d) => basename(d.file)),
  };
  // What was left out, and why (#1243). The skip is never silent anywhere: on stderr for the
  // person running it, and here for every consumer of the map. A reader that wants to SAY a
  // process is parked — the Design Book's badge, the dossier's inventory, the mockup's
  // "drawn but not built" list — reads this and needs no second parse of the .bpd headers.
  if (skipped.length)
    map.nonLive = skipped.map((d) => ({
      bp: d.bpCode, name: d.bpName, source: basename(d.file),
      status: d.status.successor ? { state: d.status.state, successor: d.status.successor }
                                 : { state: d.status.state },
    }));
  // The interactions only a PARKED process asks for (#1256) — the one place downstream reads
  // it from. `complete` derives "parked" from the .bpd headers and keeps those rows (#1252);
  // the blocks themselves are not in this map (their source was skipped above), so without this
  // list a consumer of the enriched map — the scaffolder, `construction-entry-check` — could not
  // tell a parked use case from a live one and would build it. Bound maps only: a System
  // Interaction is a Design-stage notion, and the Mockup map has no binding to derive it from.
  if (bind) {
    const parked = bind.interactions
      .filter((e) => e._rows.length && e._rows.every((r) => r._parked))
      .map((e) => ({
        si: e.si, name: e.name,
        ...(e._operation ? { operation: { ...e._operation } } : {}),
        parkedBy: [...new Set(e._rows.map((r) => r._parked.bp))].sort(),
        callSites: e._rows.map((r) => r.callSite).sort(),
      }))
      .sort((a, b) => a.si.localeCompare(b.si));
    if (parked.length) map.parkedInteractions = parked;
  }
  if (feas) map.feasibility = feas.files.map((f) => basename(f));
  if (reuse) map.reuse = reuse.files.map((f) => basename(f));
  map.operations = sortedOps;
  map.processes = processes;
  map.screens = screens;
  if (bind) map.bindingSource = basename(bind.binding.file);
  return map;
}

// screens join when a binding map is present: the key is the CALL SITE, exactly as it is
// without a binding (ADR-069 §5 — a screen action names the drawn block it starts). The binding
// is consulted only to refuse a key no callSites row carries, so the bound and unbound joins
// key identically and a bound map adds fields rather than renaming anything.
function joinScreensBound(dir, bind) {
  const files = [];
  const walkDir = (p) => {
    for (const e of readdirSync(p).sort()) {
      const f = join(p, e);
      if (statSync(f).isDirectory()) walkDir(f);
      else if (e.endsWith('.vw')) files.push(f);
    }
  };
  walkDir(dir);
  const screens = {};
  let errors = 0;
  for (const f of files) {
    let screen = null, action = null;
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      let m;
      if ((m = line.match(/^\s*(?:screen|dialog(?:\s+def)?)\s+([\w-]+)/))) { screen = m[1]; action = null; continue; }
      if ((m = line.match(/^\s*action\s+([\w-]+)/))) { action = m[1]; continue; }
      if ((m = line.match(/^\s*(calls|also)\s+([\w.-]+)\s*;/))) {
        const [, via, key] = m;
        if (SI_RETIRED_PROV_RE.test(key.split('.').slice(0, 2).join('.'))) {
          warn(retiredProvisional(key, `${f}: ${screen || '?'}#${action || '?'} ${via}`));
          errors++; continue;
        }
        const m2 = key.match(/^(BP\d{2}\.\d{2})/);
        const row = m2 ? bind.byCallSite.get(m2[1]) : null;
        if (!row) { warn(`${f}: ${screen || '?'}#${action || '?'} ${via} unresolvable key '${key}'`); errors++; continue; }
        (screens[row.callSite] ||= []).push({ file: basename(f), screen, action, via });
      }
    }
  }
  if (errors) die(`${errors} screen action(s) do not resolve through the binding map`);
  return screens;
}

// ===================================================================================
//  YAML SUBSET — the strict hand-file parser shared by si-binding/1 and
//  seqmap-feasibility/1 (the strictness IS the format validation; syntax dies file:line)
// ===================================================================================
function yamlSubset(file) {
  if (!existsSync(file)) die(`not found: ${file}`);
  const toks = [];
  const rawLines = readFileSync(file, 'utf8').split(/\r?\n/);
  // A `key:` whose value is a BLOCK SCALAR introducer (`>`, `>-`, `|`, `|-`, with the `+`/`-`
  // chomping indicators) or an UNTERMINATED double-quoted string. Both spell one logical value
  // over several physical lines, and both are how a human wraps a paragraph.
  const BLOCK_OPEN = /^(?:-\s+)?[\w.-]+:\s*([>|])[-+]?\s*$/;
  const QUOTE_OPEN = /^(?:-\s+)?[\w.-]+:\s*"(?:[^"\\]|\\.)*$/;
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    if (/^\s*$/.test(raw) || /^\s*#/.test(raw)) continue;
    if (/^\s*\t/.test(raw)) die(`${file}:${i + 1}: tabs are not allowed (two-space indentation)`);
    const indent = raw.match(/^ */)[0].length;
    const text = raw.trim();
    const ln = i + 1;

    // ---- multi-line scalars (#1204/#1207) -------------------------------------------------
    //
    // Folded here, in the TOKENIZER, rather than in `field()`. The defect was not that one key
    // could not wrap: it was that the continuation lines stayed on the token stream, so the
    // value silently became the literal `>-` and the leftovers resurfaced hundreds of lines
    // later as `unexpected content after callSites`. Absorbing them at the source means every
    // string-valued key wraps — `rationale`, `name`, the interaction prose — and every reader
    // downstream (`field`, `scalar`, the indent loops) sees exactly what it saw before: ONE
    // token, on one line. `si-binding-format.md` makes a rationale MANDATORY on a reuse row and
    // then demonstrates it wrapped, so the format has always asked for this.
    //
    // `tok.literal` carries the joined text. It is the resolved VALUE, never re-parsed: a `#`
    // or a quote inside authored prose is content, not syntax.
    const blockM = text.match(BLOCK_OPEN);
    if (blockM || QUOTE_OPEN.test(text)) {
      const parts = [];
      let closed = Boolean(blockM);   // a block scalar ends by dedent; a quote needs its closing `"`
      let j = i + 1;
      for (; j < rawLines.length; j++) {
        const cont = rawLines[j];
        if (blockM) {
          // Block scalar: every line indented deeper than the key belongs to it. A blank line
          // is a paragraph break, kept as such.
          if (/^\s*$/.test(cont)) { parts.push(''); continue; }
          if (cont.match(/^ */)[0].length <= indent) break;
          parts.push(cont.trim());
        } else {
          parts.push(cont.trim());
          if (/(?:^|[^\\])"\s*(?:#.*)?$/.test(cont.trim())) { closed = true; j++; break; }
        }
      }
      if (!closed) die(`${file}:${ln}: quoted value is never closed — no line up to the end of the file ends its '"'`);
      while (parts.length && parts[parts.length - 1] === '') parts.pop();
      if (blockM && !parts.length) die(`${file}:${ln}: block scalar '${blockM[1]}' opens no indented content`);

      let literal;
      if (blockM) {
        // `|` keeps the line breaks the author typed; `>` folds them to single spaces, with a
        // blank line surviving as one newline (YAML's own folding rule).
        literal = blockM[1] === '|'
          ? parts.join('\n')
          : parts.reduce((acc, l) => (acc === '' ? l : l === '' ? `${acc}\n` : acc.endsWith('\n') ? acc + l : `${acc} ${l}`), '');
        i = j - 1;
      } else {
        const joined = [text, ...parts].join(' ');
        literal = joined.slice(joined.indexOf('"') + 1).replace(/"\s*(?:#.*)?$/, '').replace(/\\"/g, '"');
        i = j - 1;
      }
      const key = text.slice(0, text.indexOf(':') + 1);
      toks.push({ indent, text: `${key} ${literal.replace(/\n/g, ' ')}`, ln, literal });
      continue;
    }

    toks.push({ indent, text, ln });
  }
  let p = 0;
  const peek = () => toks[p];
  const perr = (tok, msg) => die(`${file}:${tok ? tok.ln : '<eof>'}: ${msg}`);

  const stripComment = (s) => {
    const cut = s.search(/\s#/);
    return (cut >= 0 ? s.slice(0, cut) : s).trim();
  };
  const scalar = (tok, s) => {
    // A multi-line value the tokenizer already folded (#1204/#1207) — content, not syntax.
    if (tok && tok.literal !== undefined) return tok.literal;
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
  const inlineMap = (tok, s) => {
    s = stripComment(s);
    const m = s.match(/^\{\s*(\w+)\s*:\s*(.+?)\s*\}$/);
    if (!m) perr(tok, `expected an inline { key: value } map, got: ${s}`);
    return { key: m[1], value: m[2].replace(/^"(.*)"$/, '$1') };
  };
  // one `key: value` line at an exact indent; returns the raw value text
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

  // consume and return the current token — for BARE block-list items (`- value`), which have
  // no `key:` for field() to anchor on. Additive; every existing caller is unaffected.
  const take = () => toks[p++];

  return { peek, perr, stripComment, scalar, inlineList, inlineMap, field, take };
}

// ===================================================================================
//  BINDING MAP — strict si-binding/2 parser (ADR-041 §1 as amended by ADR-069 §3,
//  si-binding-format.md). The file is the JOIN between two populations, and it has two
//  sections with two owners:
//
//    interactions:  WHAT THE SYSTEM OFFERS. One entry per System Interaction: its id and
//                   the use-case name it settled on. Nothing else — the operation is
//                   declared on the model use case itself (ADR-067 §1).
//    callSites:     WHICH DRAWN BLOCK RESOLVES TO WHICH INTERACTION, and which PERMUTATION
//                   of it that block exercises. Many-to-one, and the section that moves
//                   while Design iterates. The ADR-068 realization declarations
//                   (boxes:/sends:/edges:) live HERE, per block: one drawn block realizes
//                   one permutation's sequence, generated from that block alone.
//
//  The two id grammars are disjoint and the parser refuses them crossed over: a bare
//  `SIxx.yy` in `callSites:` or a `BPxx.yy` in `interactions:` is the two populations
//  confused for each other, which is the confusion ADR-069 exists to end.
// ===================================================================================
function parseBindingFile(file) {
  const { peek, perr, stripComment, scalar, inlineMap, field } = yamlSubset(file);

  const f = field(0, 'format');
  const format = scalar(f.tok, f.value);
  if (format === 'si-binding/1')
    perr(f.tok, "format 'si-binding/1' is superseded by 'si-binding/2' (ADR-069, #1196). A drawn call " +
      "and a System Interaction are two things: rename 'bindings:' to 'interactions:' (id + name only), " +
      "add one 'callSites:' row per drawn block naming the call site, the interaction it resolves to and " +
      "the permutation it exercises, and move each entry's boxes:/sends:/edges: onto the row of the block " +
      "they describe. An 'aliasOf' entry becomes a second callSites row on the survivor, carrying the " +
      "alias's rationale verbatim.");
  if (format !== 'si-binding/2') die(`${file}:${f.tok.ln}: format is '${format}', expected 'si-binding/2'`);
  const sys = field(0, 'system');
  const system = scalar(sys.tok, sys.value);

  // ---- the two id populations, refused when crossed over (ADR-069 §§1/5) ----
  const wrongPopulation = (tok, id, section, wanted) =>
    perr(tok, `'${id}' is a ${wanted === 'SI' ? 'CALL SITE' : 'SYSTEM INTERACTION'} id in the ` +
      `'${section}' section, which speaks ${wanted === 'SI' ? 'System Interaction' : 'call site'} ids ` +
      `(ADR-069 §1). A call site 'BPxx.yy' is the block a business process DRAWS and belongs to that ` +
      `process; a System Interaction 'SIxx.yy' is the operation the SYSTEM offers. They are two ` +
      `populations related many-to-one, and this file is the only place they meet — 'interactions:' ` +
      `lists what the system offers, 'callSites:' resolves each drawn block to one of them.`);
  const readSiId = (tok, raw, section) => {
    const id = scalar(tok, raw);
    if (SI_RETIRED_PROV_RE.test(id)) perr(tok, retiredProvisional(id, 'si'));
    if (CALLSITE_ID_RE.test(id) || CALLSITE_TAG_RE.test(id)) wrongPopulation(tok, id, section, 'SI');
    if (!SI_ID_RE.test(id)) perr(tok, `si '${id}' does not match SIxx.yy (design-artifact-conventions)`);
    return id;
  };

  // ---- interactions: what the system offers ----
  const bindingsRetired = field(0, 'bindings', { optional: true });
  if (bindingsRetired)
    perr(bindingsRetired.tok, "'bindings:' is renamed 'interactions:' (ADR-069, #1196): the section lists " +
      "what the SYSTEM OFFERS — one entry per System Interaction, carrying its id and the use-case name " +
      "and nothing else. Which drawn block resolves to which interaction is the separate 'callSites:' " +
      "section, and the boxes:/sends:/edges: declarations belong on those rows.");
  const ix = field(0, 'interactions');
  if (stripComment(ix.value) !== '') perr(ix.tok, "'interactions:' opens a block list — no inline value");

  const interactions = [];
  while (peek() && peek().indent === 2 && peek().text.startsWith('- ')) {
    const siF = field(2, 'si', { dash: true });
    const entry = { si: readSiId(siF.tok, siF.value, 'interactions'), ln: siF.tok.ln };
    const aliasRetired = field(4, 'aliasOf', { optional: true });
    if (aliasRetired)
      perr(aliasRetired.tok, "'aliasOf:' is retired (ADR-069, #1196). It existed only because one " +
        "identifier carried both jobs — the drawn call and the capability — so two minted ids could " +
        "turn out to be one operation. With call sites and interactions separate, that discovery is " +
        "two 'callSites:' rows pointing at the same 'si:', which is the ordinary case rather than an " +
        "exception. Delete this entry and add a second callSites row on the survivor, carrying this " +
        "entry's rationale verbatim.");
    const nameF = field(4, 'name');
    entry.name = scalar(nameF.tok, nameF.value);
    const provRetired = field(4, 'provisional', { optional: true });
    if (provRetired)
      perr(provRetired.tok, "'provisional:' is retired (ADR-066, #1181; re-affirmed by ADR-069). Neither " +
        "id is ever rewritten: a call site is minted when its block is drawn and a System Interaction " +
        "when Design decides the system offers it, and this file records the join between them rather " +
        "than a rename. Delete the line; the provisional-era lineage lives in git history.");
    // The realization declarations moved to the call site (ADR-069 §3): a union over blocks that
    // legitimately differ has no drawing order, and drawing order is what the generated sequence is
    // built from. On an interaction they would describe no particular block.
    for (const moved of ['boxes', 'sends', 'edges']) {
      const movedF = field(4, moved, { optional: true });
      if (movedF)
        perr(movedF.tok, `'${moved}:' belongs on the CALL SITE row, not on the interaction (ADR-069 §3). ` +
          `One drawn block realizes one permutation's sequence, generated from that block alone; a union ` +
          `across the blocks bound to one interaction has no drawing order. Move this list onto each ` +
          `'callSites:' row that resolves to ${entry.si} — every call site carries its OWN full ` +
          `declarations, and [C16] checks that two call sites on one permutation agree.`);
    }
    interactions.push(entry);
  }
  if (!interactions.length) die(`${file}: no interactions entries`);

  // ---- callSites: which drawn block resolves to which interaction ----
  const cs = field(0, 'callSites');
  if (stripComment(cs.value) !== '') perr(cs.tok, "'callSites:' opens a block list — no inline value");

  const parseRealizedBy = (rbF, kinds, what) => {
    const rb = inlineMap(rbF.tok, rbF.value);
    if (!kinds.includes(rb.key))
      perr(rbF.tok, `${what} realizedBy must be ${kinds.map((k) => `{ ${k}: … }`).join(' or ')}, got key '${rb.key}'`);
    if (rb.key === 'expands') {
      const lm = rb.value.match(/^\[(.*)\]$/);
      if (!lm) perr(rbF.tok, `expands takes an inline [list] of operation refs, got: ${rb.value}`);
      rb.value = lm[1].split(',').map((x) => x.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean);
      if (!rb.value.length) perr(rbF.tok, 'expands names no operation');
    }
    return rb;
  };

  const callSites = [];
  while (peek() && peek().indent === 2 && peek().text.startsWith('- ')) {
    const csF = field(2, 'callSite', { dash: true });
    const id = scalar(csF.tok, csF.value);
    if (SI_RETIRED_PROV_RE.test(id)) perr(csF.tok, retiredProvisional(id, 'callSite'));
    if (SI_ID_RE.test(id) || SI_TAG_RE.test(id)) wrongPopulation(csF.tok, id, 'callSites', 'BP');
    if (!CALLSITE_ID_RE.test(id))
      perr(csF.tok, `callSite '${id}' does not match BPxx.yy (design-artifact-conventions; ADR-069 §1 — ` +
        `the defining business process plus a free, append-only number inside it)`);
    const siF = field(4, 'si');
    const row = {
      callSite: id, si: readSiId(siF.tok, siF.value, 'callSites'), ln: csF.tok.ln,
      permutation: null, rationale: null, boxes: [], sends: [], edges: [],
    };
    // The optional keys are read BY NAME rather than by position: this is a hand-file the
    // architect re-points while Design iterates, and a parser that demands one order turns an
    // edit into a puzzle. Unknown keys still die — the strictness IS the format validation.
    const seen = new Set();
    while (peek() && peek().indent === 4) {
      const key = (peek().text.match(/^(\w+):/) || [, null])[1];
      if (!key) perr(peek(), `expected a 'key: value' line at indent 4, got: ${peek().text}`);
      if (!['permutation', 'rationale', 'boxes', 'sends', 'edges'].includes(key))
        perr(peek(), `unknown key '${key}:' on callSite ${row.callSite} — a row carries si, permutation, ` +
          `rationale, boxes, sends and edges (si-binding-format.md § Shape)`);
      if (seen.has(key)) perr(peek(), `duplicate key '${key}:' on callSite ${row.callSite}`);
      seen.add(key);
      if (key === 'permutation') {
        const pf = field(4, 'permutation');
        row.permutation = scalar(pf.tok, pf.value);
        row.permutationLn = pf.tok.ln;
      } else if (key === 'rationale') {
        const rf = field(4, 'rationale');
        row.rationale = scalar(rf.tok, rf.value);
        row.rationaleLn = rf.tok.ln;
      } else if (key === 'edges') {
        const ef = field(4, 'edges');
        if (stripComment(ef.value) !== '') perr(ef.tok, "'edges:' opens a block list — no inline value");
        while (peek() && peek().indent === 6 && peek().text.startsWith('- ')) {
          const gwF = field(6, 'gateway', { dash: true });
          const takenF = field(8, 'taken');
          const rbF = field(8, 'realizedBy');
          const rb = inlineMap(rbF.tok, rbF.value);
          if (rb.key !== 'permutation' && rb.key !== 'sequence')
            perr(rbF.tok, `realizedBy must be { permutation: … } or { sequence: … }, got key '${rb.key}'`);
          row.edges.push({
            gateway: scalar(gwF.tok, gwF.value), taken: scalar(takenF.tok, takenF.value),
            realizedBy: rb, ln: gwF.tok.ln,
          });
        }
      } else if (key === 'boxes') {
        const bf = field(4, 'boxes');
        if (stripComment(bf.value) !== '') perr(bf.tok, "'boxes:' opens a block list — no inline value");
        while (peek() && peek().indent === 6 && peek().text.startsWith('- ')) {
          const bF = field(6, 'box', { dash: true });
          const rbF = field(8, 'realizedBy');
          row.boxes.push({
            box: scalar(bF.tok, bF.value),
            realizedBy: parseRealizedBy(rbF, ['operation', 'internal', 'expands'], 'a box'),
            ln: bF.tok.ln,
          });
        }
      } else {
        const sf = field(4, 'sends');
        if (stripComment(sf.value) !== '') perr(sf.tok, "'sends:' opens a block list — no inline value");
        while (peek() && peek().indent === 6 && peek().text.startsWith('- ')) {
          const sF = field(6, 'send', { dash: true });
          const rbF = field(8, 'realizedBy');
          row.sends.push({
            send: scalar(sF.tok, sF.value),
            realizedBy: parseRealizedBy(rbF, ['operation', 'event'], 'a send'),
            ln: sF.tok.ln,
          });
        }
      }
    }
    callSites.push(row);
  }
  if (!callSites.length) die(`${file}: no callSites rows — every drawn block of a live process resolves ` +
    `to exactly one System Interaction (ADR-069 §8), and this file is where that is recorded`);

  // ---- historical: RETIRED (#1148 subsumed #1055) ----
  // The out-of-inventory disposition used to be a second hand-maintained list here, and a second
  // hand-maintained restatement of one fact is what this repo deletes on sight: the lifecycle is
  // now a first-class `status` directive in the `.bpd` header itself — machine-readable, not
  // prose, so ADR-062 §2 / ADR-063 §3 ("declared, never inferred from prose") still holds — and
  // every drawn block of a non-live process is accounted for from the source, with nothing to drift.
  const histF = field(0, 'historical', { optional: true });
  if (histF)
    perr(histF.tok, "the hand-written 'historical:' list is retired (#1148, subsuming #1055) — " +
      "declare the lifecycle in the .bpd header instead ('status <dissolved|retired|parked> " +
      "[-> <Successor>] [\"reason\"]') and delete this block; the drawn blocks of a non-live " +
      "process are excluded from the binding inventory automatically");
  if (peek()) perr(peek(), `unexpected content after callSites: ${peek().text}`);
  return { system, interactions, callSites, file };
}

// ===================================================================================
//  FEASIBILITY — seqmap-feasibility/1 sidecar (#419): authored inter-gateway data
//  constraints, one `feasibility.yaml` next to the .bpd sources (auto-discovered).
//  The .bpd graph is structure; some branch combinations are semantically impossible
//  in the domain (ratified statements). Each constraint scopes one gateway EDGE and
//  is evaluated against the ordered branch prefix at the moment the edge is taken:
//    requires {g,t} — the prefix must already contain (g,t)
//    excludes {g,t} — the prefix must not contain (g,t)   (order-aware: later
//                     same-label gateways are unaffected)
//  `rationale` is mandatory — the sidecar is a reviewable artifact; every constraint
//  cites the ratified statement it encodes. Format section: seqmap-format.md.
// ===================================================================================
function parseFeasibilityFile(file) {
  const { peek, perr, stripComment, scalar, field } = yamlSubset(file);

  const f = field(0, 'format');
  const format = scalar(f.tok, f.value);
  if (format !== 'seqmap-feasibility/1') die(`${file}:${f.tok.ln}: format is '${format}', expected 'seqmap-feasibility/1'`);
  const pr = field(0, 'processes');
  if (stripComment(pr.value) !== '') perr(pr.tok, "'processes:' opens a block list — no inline value");

  const processes = [];
  while (peek() && peek().indent === 2 && peek().text.startsWith('- ')) {
    const bpF = field(2, 'bp', { dash: true });
    const entry = { bp: scalar(bpF.tok, bpF.value), ln: bpF.tok.ln, constraints: [] };
    if (!/^BP\d{2}$/.test(entry.bp)) perr(bpF.tok, `bp '${entry.bp}' does not match BP##`);
    const cF = field(4, 'constraints');
    if (stripComment(cF.value) !== '') perr(cF.tok, "'constraints:' opens a block list — no inline value");
    while (peek() && peek().indent === 6 && peek().text.startsWith('- ')) {
      const gwF = field(6, 'gateway', { dash: true });
      const c = { gateway: scalar(gwF.tok, gwF.value), ln: gwF.tok.ln };
      const takenF = field(8, 'taken');
      c.taken = scalar(takenF.tok, takenF.value);
      const reqF = field(8, 'requires', { optional: true });
      if (reqF) c.requires = parseGatewayTakenMap(reqF, perr, stripComment);
      const excF = field(8, 'excludes', { optional: true });
      if (excF) c.excludes = parseGatewayTakenMap(excF, perr, stripComment);
      if (!c.requires && !c.excludes) perr(gwF.tok, `constraint on ("${c.gateway}", "${c.taken}") needs 'requires' and/or 'excludes'`);
      const ratF = field(8, 'rationale');
      c.rationale = scalar(ratF.tok, ratF.value);
      entry.constraints.push(c);
    }
    if (!entry.constraints.length) perr(bpF.tok, `${entry.bp}: empty constraints list`);
    processes.push(entry);
  }
  if (peek()) perr(peek(), `unexpected content after processes: ${peek().text}`);
  if (!processes.length) die(`${file}: no process entries`);
  const byBp = new Map();
  for (const e of processes) {
    if (byBp.has(e.bp)) die(`${file}:${e.ln}: duplicate bp '${e.bp}'`);
    byBp.set(e.bp, e.constraints);
  }
  return { byBp, file };
}

// `{ gateway: "…", taken: "…" }` — the two-key inline map both constraint sides use
function parseGatewayTakenMap(fieldRes, perr, stripComment) {
  const s = stripComment(fieldRes.value);
  const m = s.match(/^\{\s*gateway\s*:\s*("(?:[^"\\]|\\.)*"|[^,]+?)\s*,\s*taken\s*:\s*("(?:[^"\\]|\\.)*"|[^}]+?)\s*\}$/);
  if (!m) perr(fieldRes.tok, `expected { gateway: "…", taken: "…" }, got: ${s}`);
  const unq = (x) => x.replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"');
  return { gateway: unq(m[1]), taken: unq(m[2]) };
}

// auto-discovery: a `feasibility.yaml` sitting next to any given .bpd source applies
// to the whole set (dedup by resolved dir); returns { byBp, files } or null
function loadFeasibility(bpdFiles) {
  const seen = new Set();
  const byBp = new Map();
  const files = [];
  for (const f of bpdFiles) {
    const dir = dirname(f);
    if (seen.has(dir)) continue;
    seen.add(dir);
    const cand = join(dir, 'feasibility.yaml');
    if (!existsSync(cand)) continue;
    const parsed = parseFeasibilityFile(cand);
    for (const [bp, cons] of parsed.byBp) {
      if (byBp.has(bp)) die(`${cand}: bp '${bp}' constrained in more than one feasibility.yaml`);
      byBp.set(bp, cons);
    }
    files.push(cand);
  }
  return files.length ? { byBp, files } : null;
}

// validate constraints against the parsed sources: every referenced gateway label and
// branch label must exist in the BP (typo/staleness guard), every bp must be in the set
function validateFeasibility(feas, digests) {
  const gatewaysByBp = new Map();               // bp -> Map(cond -> Set(branch labels))
  for (const d of digests) {
    const gws = new Map();
    for (const pool of d.model.pools)
      for (const st of allStmts(pool.body))
        if (st.k === 'if') {
          const labels = gws.get(st.cond) || new Set();
          for (const br of st.branches) labels.add(br.label);
          gws.set(st.cond, labels);
        }
    gatewaysByBp.set(d.bpCode, gws);
  }
  for (const [bp, cons] of feas.byBp) {
    const gws = gatewaysByBp.get(bp);
    if (!gws) die(`feasibility: bp '${bp}' matches no .bpd source in the set`);
    for (const c of cons)
      for (const [side, ref] of [['constraint', c], ['requires', c.requires], ['excludes', c.excludes]]) {
        if (!ref) continue;
        const labels = gws.get(ref.gateway);
        if (!labels)
          die(`feasibility: ${bp} ${side} references unknown gateway "${ref.gateway}" (stale constraint or typo)`);
        if (!labels.has(ref.taken))
          die(`feasibility: ${bp} ${side} ("${ref.gateway}") has no branch "${ref.taken}" (has: ${[...labels].sort().join(', ')})`);
      }
  }
}

// ===================================================================================
//  REUSE — seqmap-reuse/1 sidecar (#635; rekeyed to the CALL SITE by ADR-069 §4). A draft of
//  ADR-069 deleted this sidecar on the premise that no System Interactions exist at Mockup.
//  The premise is FALSE for the case #635 was filed for: a SECOND business-design pass over a
//  system that is already BUILT, where the interactions do exist. So the sidecar stays, and
//  its job is the one nothing else in si-binding/2 can do.
//
//  What it declares, at MOCKUP: this drawn call reuses an interaction the system already has —
//  Design creates nothing new for it. [C12] then BINDS DESIGN'S HANDS: a Design that mints a
//  fresh interaction for that call fails the gate. That constraint is otherwise inexpressible,
//  because binding a call site to a brand-new interaction is legal and owes a rationale only on
//  a SECOND row bound to one interaction — of which, for a freshly minted one, there is none.
//
//  Not the same thing as a second `callSites` row: this is a Mockup-stage CONSTRAINT on Design,
//  a second row is a Design-stage FINDING. One binds, the other records. Effects:
//    generate — the map stamps `reused: true` on the call site's entry;
//    complete — [C12]: the declared call site must be bound, and its interaction must be one
//               other call sites already resolve to.
//  Format section: seqmap-format.md.
// ===================================================================================
function parseReuseFile(file) {
  const { peek, perr, stripComment, scalar, field } = yamlSubset(file);

  const f = field(0, 'format');
  const format = scalar(f.tok, f.value);
  if (format !== 'seqmap-reuse/1') die(`${file}:${f.tok.ln}: format is '${format}', expected 'seqmap-reuse/1'`);
  const rs = field(0, 'reuses');
  if (stripComment(rs.value) !== '') perr(rs.tok, "'reuses:' opens a block list — no inline value");

  const reuses = [];
  while (peek() && peek().indent === 2 && peek().text.startsWith('- ')) {
    const siF = field(2, 'si', { dash: true });
    const e = { si: scalar(siF.tok, siF.value), ln: siF.tok.ln, file };
    if (SI_RETIRED_PROV_RE.test(e.si)) perr(siF.tok, retiredProvisional(e.si, 'si'));
    // The field names the CALL SITE whose target is constrained (ADR-069 §4), not the
    // interaction: the sidecar is written at MOCKUP, from the drawing, and the drawing knows
    // only what it draws. Which interaction that call site may resolve to is exactly what the
    // declaration constrains and exactly what Design has not decided yet.
    if (SI_ID_RE.test(e.si))
      perr(siF.tok, `reused id '${e.si}' is a System Interaction id, and this sidecar is written at ` +
        `Mockup from the drawing (ADR-069 §4). Name the CALL SITE whose target the declaration ` +
        `constrains — 'si: BPxx.yy' — and [C12] then refuses a Design that mints a fresh interaction ` +
        `for it.`);
    if (!CALLSITE_ID_RE.test(e.si))
      perr(siF.tok, `reused id '${e.si}' does not match BPxx.yy (design-artifact-conventions). ` +
        `The 'provisional:'/'bound:' pair is retired with the two-id lifecycle (ADR-066): one 'si:' ` +
        `names the call site whose reuse is being declared.`);
    const ratF = field(4, 'rationale');
    e.rationale = scalar(ratF.tok, ratF.value);
    reuses.push(e);
  }
  if (peek()) perr(peek(), `unexpected content after reuses: ${peek().text}`);
  if (!reuses.length) die(`${file}: no reuse entries`);
  return reuses;
}

// auto-discovery: a `reuse.yaml` sitting next to any given .bpd source applies to the
// whole set (dedup by resolved dir); returns { bySi, entries, files } or null
function loadReuse(bpdFiles) {
  const seen = new Set();
  const bySi = new Map();
  const entries = [];
  const files = [];
  for (const f of bpdFiles) {
    const dir = dirname(f);
    if (seen.has(dir)) continue;
    seen.add(dir);
    const cand = join(dir, 'reuse.yaml');
    if (!existsSync(cand)) continue;
    for (const e of parseReuseFile(cand)) {
      const prev = bySi.get(e.si);
      if (prev) die(`${cand}:${e.ln}: '${e.si}' declared twice (also ${prev.file}:${prev.ln})`);
      bySi.set(e.si, e);
      entries.push(e);
    }
    files.push(cand);
  }
  return files.length ? { bySi, entries, files } : null;
}

// staleness guard: a declaration whose id no source carries describes nothing (a typo, or a
// sidecar left behind after the sources moved on).
function validateReuseSources(reuse, digests) {
  const drawn = new Set();
  for (const d of digests)
    for (const c of d.chains)
      for (const id of c.callSites) drawn.add(id);
  for (const e of reuse.entries)
    if (!drawn.has(e.si))
      die(`${e.file}:${e.ln}: declares reuse at ${e.si} but no drawn block in the sources carries that call site`);
}

// [C12]: a declared reuse says the system ALREADY offers what this call asks for, so Design may
// not mint an interaction for it. Two things are therefore checked, and the second is the one
// that binds Design's hands (ADR-069 §4): the call site must be bound at all, and the interaction
// it resolves to must be one OTHER call sites already resolve to. An interaction reached by this
// call site alone is a fresh one minted for this call — which is exactly what the Mockup-stage
// declaration forbade, and which nothing else would catch: a first row owes no rationale.
function reuseVsBinding(reuse, byCallSite, rowsBySi) {
  const out = [];
  if (!reuse) return out;
  for (const e of reuse.entries) {
    const row = byCallSite.get(e.si);
    if (!row) {
      out.push(`${basename(e.file)}:${e.ln}: declares reuse at call site ${e.si} but the binding map has no ` +
               `callSites row for it — a declared reuse still has to say WHICH interaction it reuses`);
      continue;
    }
    const siblings = (rowsBySi.get(row.si) || []).filter((r) => r.callSite !== row.callSite);
    if (!siblings.length)
      out.push(`${basename(e.file)}:${e.ln}: call site ${e.si} is declared a reuse, but it is the only call ` +
               `site resolving to ${row.si} — Design minted a NEW interaction for a call the business design ` +
               `said the system already offers. Point the row at the existing interaction, or withdraw the ` +
               `declaration (binding:${row.ln}; rationale: ${e.rationale})`);
  }
  return out;
}

// is taking (gateway, taken) infeasible given the ordered branch prefix?
function infeasibleEdge(cons, gateway, taken, prefix) {
  for (const c of cons) {
    if (c.gateway !== gateway || c.taken !== taken) continue;
    if (c.requires && !prefix.some((b) => b.gateway === c.requires.gateway && b.taken === c.requires.taken)) return true;
    if (c.excludes && prefix.some((b) => b.gateway === c.excludes.gateway && b.taken === c.excludes.taken)) return true;
  }
  return false;
}

// ===================================================================================
//  MODEL — ReadArchitecture JSON (envelope or bare data payload; sns-cli skill shape).
//  Permutation steps are read from `permutations[].sequenceSteps` (the guaranteed-
//  complete flat view; `sequences[]` is resolve-filtered and omits unresolved steps).
// ===================================================================================
function loadModel(file) {
  if (!existsSync(file)) die(`model not found: ${file}`);
  let j;
  try { j = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { die(`${file}: not valid JSON (${e.message})`); }
  if (j && j.success === false) die(`${file}: sns-cli error envelope (${(j.error && j.error.message) || 'no message'})`);
  const data = j && typeof j === 'object' && j.data !== undefined ? j.data : j;
  if (!data || typeof data !== 'object') die(`${file}: no architecture payload`);
  const useCases = (data.useCases || []).map((uc) => ({
    id: uc.id,
    name: uc.name,
    // ADR-067 (#1186) — THE operation this System Interaction is, declared once on the use
    // case. `operationId` is the facet operation's UUID (joins `operationsById` below);
    // `operationRef` is its resolved name, carried for the message when the join misses.
    operationId: uc.operationId || null,
    operationRef: uc.operationRef || null,
    // #1320 — what the MODEL says the design DECIDED about this System Interaction:
    // `future` (decided, deliberately deferred) or `retired` (decided AGAINST, kept as a
    // record, id never re-minted). Absent ⇒ `live`. Read from the model and from nowhere
    // else: the `interactions:` entry deliberately gains NO key for it, because a second
    // original of a fact the model owns can only drift from it (#861).
    lifecycle: uc.lifecycle || null,
    permutations: (uc.permutations || []).map((pm) => ({
      name: pm.name,
      steps: pm.sequenceSteps || [],
    })),
  }));
  // The facet-operation catalog (ReadArchitecture `componentDetails`). Empty for draft-stage
  // models that carry no component decomposition yet — C11 and the map's `operation` field
  // only exist where the model can answer for them (#676).
  // `operationsByName` (#1182/ADR-068) is the name-side index the binding's `boxes:`/`sends:`
  // declarations resolve through: a declared ref may be qualified `Component.Facet.Operation`,
  // `Facet.Operation`, or a bare `Operation` — the same forms the sns-cli grammar accepts
  // (#1172) — and an ambiguous bare name is a finding, never a guess.
  const operationsById = new Map();
  const operationsByName = new Map();
  for (const comp of data.componentDetails || [])
    for (const facet of comp.facets || [])
      for (const op of facet.operations || []) {
        const rec = { component: comp.name, facet: facet.name, name: op.name };
        operationsById.set(op.id, rec);
        for (const key of [op.name, `${facet.name}.${op.name}`, `${comp.name}.${facet.name}.${op.name}`]) {
          if (!operationsByName.has(key)) operationsByName.set(key, []);
          operationsByName.get(key).push(rec);
        }
      }
  // `components` and `dtos` are the raw catalogs `unused` walks: the reachability computation
  // needs the component's `lifecycle` (the ONE machine-readable statement of deferral intent in
  // the model — ADR-027 §5 `SetComponentLifecycle`) and the DTO graph, neither of which the
  // three indexes above carry. Read once, shaped here, so no consumer re-walks `componentDetails`.
  const components = (data.componentDetails || []).map((c) => ({
    name: c.name,
    layer: c.layer ?? null,
    lifecycle: c.lifecycle ?? null,
    facets: (c.facets || []).map((f) => ({
      name: f.name,
      operations: (f.operations || []).map((o) => ({
        id: o.id, name: o.name, inputDtoId: o.inputDtoId ?? null, outputDtoId: o.outputDtoId ?? null,
      })),
    })),
  }));
  return { useCases, operationsById, operationsByName, components, dtos: data.dtos || [] };
}

// ===================================================================================
//  COMPLETE — the model↔BPMN completeness check (ADR-041 §3; Gate-2 mechanical gate).
//  Structural source problems die (as in generate); join findings are collected and
//  reported all at once — a gate presentation wants the full list, not the first hit.
// ===================================================================================

// ---- si-exports (#1182/ADR-068, rekeyed by ADR-069 §5): the content-bearing catalog
// `bpmn-dsl si-export` writes — one `BPxx.yy.json` per CALL SITE, because the export
// projects a drawn BLOCK and a block belongs to the one process that drew it. `complete
// --si <dir>` reads it for the C14/C15 refinement checks; `sequence` generates the model
// sequence from it.
//
// Keyed by the call site, not by the interaction (#1210). ADR-069 §5 is explicit — "`bpmn-dsl
// si-export` projects the block under its call site" — and bpmn-tools 3.0.0 shipped it as
// `si-export/3`: `callSite:` where `si:` used to be, and ONE `definition` where `definitions[]`
// used to be a list per defining process. Reading it per interaction was the last trace of the
// merge, and it cost more than a rename: two call sites bound to one interaction shared one box
// universe, so [C14] could not catch a box drawn in only one of them. Keying on the call site
// narrows the universe to the block actually drawn, which is what ADR-069 §3 requires.
function loadSiExportsDir(dir) {
  if (!existsSync(dir)) die(`si exports not found: ${dir}`);
  const out = new Map();
  const skipped = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.json')) continue;
    if (!/^BP\d{2}\.\d{2}\.json$/.test(f)) { skipped.push(f); continue; }
    let doc;
    try { doc = JSON.parse(readFileSync(join(dir, f), 'utf8')); }
    catch (e) { die(`${join(dir, f)}: not valid JSON (${e.message})`); }
    if (doc.format !== 'si-export/3') die(`${join(dir, f)}: format '${doc.format ?? 'missing'}' is not si-export/3 — regenerate with \`bpmn-dsl si-export\` from bpmn-tools 3.0.0 or later (ADR-069 §5)`);
    if (!doc.callSite) die(`${join(dir, f)}: declares no 'callSite' — an si-export/3 document is keyed by the drawn block's call site`);
    out.set(doc.callSite, doc);
  }
  // A SKIPPED FILE IS NEVER SILENT (#1210). A half-migrated directory — the retired
  // `SIxx.yy.json` exports left beside the new ones — used to pass: the legacy files satisfied
  // the count, the call-site files were skipped without a word, and the refinement check reported
  // GREEN over stale content. A check computed from files nobody looked at is worse than one that
  // did not run, because it produces a verdict.
  if (skipped.length)
    die(`${dir}: ${skipped.length} json file(s) are not call-site exports and were not read ` +
      `(${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? ', …' : ''}). The retired ` +
      `\`SIxx.yy.json\` shape is keyed by interaction; ADR-069 §5 keys the export by the drawn ` +
      `block. Delete them and regenerate: \`bpmn-dsl si-export <sources> -o ${dir}\``);
  if (!out.size) die(`no si-export (BPxx.yy.json) under ${dir} — run \`bpmn-dsl si-export <sources> -o ${dir}\``);
  return out;
}

// statements of a chain body NOT inside any si block (chain-level gateways)
function* stmtsOutsideSi(body) {
  for (const st of body || []) {
    if (st.k === 'call') continue;
    yield st;
    if (st.body) yield* stmtsOutsideSi(st.body);
    for (const br of st.branches || []) yield* stmtsOutsideSi(br.body);
  }
}

const edgeKey = (gateway, taken) => `${gateway}\u0000${taken}`;

// The join core: returns findings + the resolution maps (reused by bound generation).
function runComplete(files, bindingFile, modelFile, screensDir, siExportsDir = null) {
  const problems = [];
  const warnings = [];
  const siExports = siExportsDir ? loadSiExportsDir(siExportsDir) : null;
  // `cls` marks a finding that a PARTIAL input would fully explain (#636). Nothing is ever
  // dropped silently: if the input is diagnosed partial the [C0] block counts what it
  // withheld and why; if it is not, these report exactly as they always did.
  const E = (msg, cls) => problems.push({ msg, cls });
  // The WARNING tier (#1208). A finding this check reports on every run and never fails on: a
  // rule that is real, that some OTHER gate refuses, and that this gate does not own. It is not
  // a softer error and not a place to park findings that are merely inconvenient — the entry
  // bar is that a named downstream gate hard-refuses the same thing, so nothing here can pass
  // unnoticed into a build. Warnings print with the findings and are counted in the green line,
  // so a clean run still says how many are standing; only the exit code is untouched.
  const W = (msg) => warnings.push(msg);
  const screenOutsideMap = [];   // screen actions calling an SI the MODEL has but the map lacks

  const binding = parseBindingFile(bindingFile);
  const model = loadModel(modelFile);
  const feas = loadFeasibility(files);
  const reuse = loadReuse(files);
  const digests = loadAsts(files).map((ast, i) => digest(files[i], ast));
  digests.sort((a, b) => a.bpCode.localeCompare(b.bpCode));
  const suppliedBps = new Set(digests.map((d) => d.bpCode));
  if (feas) validateFeasibility(feas, digests);

  // ---- the call sites of a PARKED process (#1238) ----
  // [C9] already grades parked (#1252); [C1] did not, and that asymmetry is a defect rather than a
  // policy. A parked block is drawn and deliberately not built: nothing is generated from it, so
  // "the sequence this block realizes is ungenerable" states a fact about a drawing nobody will
  // generate. The row is KEPT for the same reason [C9-parked] keeps it — it is the only record of
  // which System Interaction the parked block resolves to — and it is reported as a warning that
  // names what revives it. Measured cost of the asymmetry: on figaro a single [C1] whose only
  // subject was the parked BP03 held `complete` on exit 1, and with it a whole Blueprint gate,
  // while the project's own rule says a parked process is not a subject at all.
  // Dissolved and retired are NOT included: those blocks are gone, and a row naming one imports a
  // dead flow — that is [C13], and it stays an error.
  const parkedCallSites = new Set();
  for (const d of digests) {
    if (d.status?.state !== 'parked') continue;
    for (const c of d.chains) for (const id of c.callSites) parkedCallSites.add(id);
  }

  const systems = [...new Set(digests.map((d) => d.sys.name))];
  if (systems.length !== 1) die(`sources disagree on the system pool: ${systems.join(', ')}`);
  // The binding map's `system:` is keyed to the SOURCES' system pool, while its sibling under
  // `03_Technology/` — the deployment view, and every protocol sheet — keys its own `system:` to
  // the model's `projectName`. Both authorities are right for their own file, so the two spellings
  // may legitimately differ, and a difference in CASE alone is never a design defect: the compare
  // ignores it on both sides of that divide (#1065).
  if (String(binding.system ?? '').toLowerCase() !== String(systems[0] ?? '').toLowerCase())
    E(`[C1] binding: system '${binding.system}' does not match the sources' system pool '${systems[0]}'`);

  // pool-side gateway edges: same structural guarantee as generate — every reachable,
  // FEASIBLE pool gateway edge covered by some path (dies on violation, a source-level finding)
  for (const d of digests)
    for (const pool of d.model.pools) {
      if (pool.kind === 'system' || pool.kind === 'blackbox') continue;
      const callsSystem = [...allSends(pool.body)].some(({ send }) => {
        const r = resolveDst(d, send.to);
        return r && r.systemPool;
      });
      if (callsSystem) coverPaths(d, pool, feas && feas.byBp.get(d.bpCode));
    }

  // ---- binding-map integrity (C1) ----------------------------------------------------------
  // Two populations, two indexes. INJECTIVITY IS DROPPED (ADR-069 §8): many call sites resolving
  // to one System Interaction is the normal case — that IS the reuse the split exists to record —
  // so the old "no duplicate si" rule now applies WITHIN `interactions:` only. What replaces it
  // for the join is the pair of totality checks: every call site of a live process has exactly one
  // row (C2), and every interaction is resolved to by at least one row (C9).
  const bySi = new Map();            // System Interaction id -> its interactions entry
  const byName = new Map();
  const byCallSite = new Map();      // call-site id -> its callSites row
  const rowsBySi = new Map();        // System Interaction id -> the rows resolving to it, in file order
  const interactions = binding.interactions;
  const callSites = binding.callSites;
  // Every entry and every row gets its accumulators BEFORE any check runs: a later pass must
  // never meet a half-initialized record just because an earlier check rejected it.
  for (const e of interactions) e._rows = [];
  for (const r of callSites) {
    r._perms = [];
    r._seen = false;
    r._edges = new Map();            // edgeKey -> { gateway, taken }   (the block's own edges)
  }
  for (const e of interactions) {
    if (bySi.has(e.si)) { E(`[C1] binding:${e.ln}: duplicate si '${e.si}' in interactions (binding:${bySi.get(e.si).ln})`); continue; }
    bySi.set(e.si, e);
    if (byName.has(e.name)) E(`[C1] binding:${e.ln}: duplicate name '${e.name}' (also on ${byName.get(e.name).si})`);
    byName.set(e.name, e);
  }
  for (const r of callSites) {
    if (byCallSite.has(r.callSite)) {
      E(`[C1] binding:${r.ln}: duplicate callSite '${r.callSite}' (binding:${byCallSite.get(r.callSite).ln}) — ` +
        `one drawn block resolves to exactly one System Interaction (ADR-069 §8)`);
      continue;
    }
    byCallSite.set(r.callSite, r);
    const ix = bySi.get(r.si);
    if (!ix) {
      E(`[C1] binding:${r.ln}: callSite ${r.callSite} resolves to '${r.si}', which has no 'interactions:' ` +
        `entry — a call site resolves to something the system OFFERS, and what the system offers is ` +
        `declared once, in the other section`);
      continue;
    }
    ix._rows.push(r);
    const siblings = rowsBySi.get(r.si) || [];
    // A rationale is MANDATORY on reuse (ADR-069 §7). The FIRST row bound to an interaction needs
    // none — it is not reusing anything. Every subsequent row is a design finding ("the system
    // creates nothing new for this block"), and a finding is stated where it is made, whether or
    // not the row also shares the first row's permutation.
    if (siblings.length && !(r.rationale || '').trim())
      E(`[C1] binding:${r.ln}: callSite ${r.callSite} is the ${siblings.length + 1}${siblings.length === 1 ? 'nd' : siblings.length === 2 ? 'rd' : 'th'} ` +
        `call site resolving to ${r.si} '${ix.name}' (first: ${siblings[0].callSite}, binding:${siblings[0].ln}) — ` +
        `add a 'rationale:'. Declaring that the system creates nothing new for this block is a design ` +
        `finding, and it is stated where the finding is made (ADR-069 §7)`);
    siblings.push(r);
    rowsBySi.set(r.si, siblings);
    // A call site names exactly one permutation, or its block's gateway names them — never both,
    // never neither (ADR-069 §8). Both is a contradiction: the row says "always this variant", the
    // gateway says "it depends". Neither leaves the sequence ungenerable.
    const gwPerms = r.edges.filter((d) => d.realizedBy.key === 'permutation');
    const parkedRow = parkedCallSites.has(r.callSite);
    const R = parkedRow ? W : E;
    const C1 = parkedRow ? '[C1-parked]' : '[C1]';
    const revives = parkedRow
      ? ` — its process is PARKED, so nothing generates this sequence and this is a warning, not a `
        + `finding (#1238). It becomes an error the moment the .bpd header goes back to \`status live\``
      : '';
    if (r.permutation && gwPerms.length)
      R(`${C1} binding:${r.permutationLn}: callSite ${r.callSite} names permutation '${r.permutation}' AND its ` +
        `block's gateway names one ("${gwPerms[0].gateway}" -> "${gwPerms[0].taken}" realizedBy ` +
        `{ permutation: ${gwPerms[0].realizedBy.value} }, binding:${gwPerms[0].ln}) — a contradiction: the row ` +
        `says "always this variant", the gateway says "it depends". Keep exactly one (ADR-069 §8)${revives}`);
    else if (!r.permutation && !gwPerms.length)
      R(`${C1} binding:${r.ln}: callSite ${r.callSite} names no permutation of ${r.si} '${ix.name}' and its ` +
        `block declares no request-variant gateway edge — the sequence this block realizes is ungenerable. ` +
        `Add 'permutation: {Base}_{Variant}' to the row, or a 'realizedBy: { permutation: … }' edge per ` +
        `branch if the block's own control flow selects the variant (ADR-069 §8)${revives}`);
    r._perms = r.permutation ? [r.permutation] : [...new Set(gwPerms.map((d) => d.realizedBy.value))];
  }

  // ---- declared reuse of a built interaction (C12, #635; rekeyed by ADR-069 §4) ----
  // A `reuse.yaml` declaration is the business design saying "this call reuses the interaction
  // the system already has, and Design creates nothing new for it". Checked here rather than read
  // in a note: the declared call site must be bound, and it must not be the sole call site of its
  // interaction — an interaction reached by this call alone is one Design minted for it.
  for (const msg of reuseVsBinding(reuse, byCallSite, rowsBySi)) E(`[C12] reuse: ${msg}`);

  // ---- non-live processes (C13, #1148 — subsumed the hand-written list of #1055) ----
  // A drawn block of a BP whose .bpd header declares `status dissolved|retired|parked` is out of
  // the live inventory BY THE SOURCE ITSELF: it owes no callSites row, no model use case, and its
  // gateway edges owe no realization. Totality holds over the LIVE inventory — which is what
  // totality is for. The inverse is the finding now: a row that still names one of those blocks
  // imports a superseded (or never-approved) flow into the model as a live edge.
  const byHistorical = new Map();   // call-site id -> { bp, state }
  for (const d of digests) {
    if (!d.status) continue;
    for (const c of d.chains)
      for (const id of c.callSites) byHistorical.set(id, { bp: d.bpCode, state: d.status.state });
  }
  // The three states are NOT alike here (#1252). A dissolved or retired process is gone, and a
  // row naming its block imports a dead flow — [C13], as above. A PARKED process is drawn and
  // deliberately not built, and its drawing must stay revivable: the row is the only place that
  // records which System Interaction the parked block resolves to (the .bpd carries the call-site
  // id and a speaking name, nothing else), so deleting it turns revival into a rebuild and its
  // interaction into a permanent [C9] — "the system would offer an operation nothing asks for",
  // which for a parked drawing is false. The row is KEPT and marked; every drawing-side check
  // ([C2] seen, [C5] edges, [C14]/[C15] refinement, [C16] equality) skips it exactly as it skips
  // any frozen block, and the interaction side reads it below: an interaction only parked rows
  // resolve to is [C9-parked], a standing warning that names what revives it, never an error.
  // The status is DERIVED from the .bpd header every run — no second marker on the row or the
  // interactions entry, which would be two originals of one fact (#861).
  for (const [id, h] of byHistorical) {
    const row = byCallSite.get(id);
    if (!row) continue;
    if (h.state === 'parked') { row._parked = h; continue; }
    E(`[C13] binding:${row.ln}: call site '${id}' belongs to ${h.bp}, whose .bpd declares status ${h.state} — ` +
      `a non-live process's drawn blocks stay out of the binding; remove the row (it resolves to ${row.si})`);
  }

  // ---- collect the drawn call sites + system-side gateway edges, resolve through the map (C2) ----
  // `row._seen` is the whole live inventory: a row nothing sets it on draws nothing, which is the
  // reverse half of totality below.
  for (const d of digests) {
    for (const c of d.chains) {
      // chain-level gateways outside any drawn block need an unambiguous owner
      const outside = [...stmtsOutsideSi(c.stmts)].filter((s) => s.k === 'if');
      if (outside.length && c.sis.length > 1)
        E(`[C5] ${d.file}: chain '${c.trigger.label}' has ${outside.length} gateway(s) outside its ${c.sis.length} drawn blocks — ambiguous owner; move them inside their block`);
      c.sis.forEach((b, i) => {
        const id = c.callSites[i];
        if (byHistorical.has(id)) {
          // accounted for by the source's own lifecycle declaration: out of the live inventory,
          // so no model use case is owed and the gateway edges inside it are not edges of any
          // live System Interaction — they owe no realization ([C5]).
          return;
        }
        const row = byCallSite.get(id);
        if (!row) {
          E(`[C2] ${d.file}: block '${b.tag}' (${d.bpCode}) has no callSites row — the drawn call site ` +
            `${id} resolves to no System Interaction. Add a row naming the interaction it resolves to and ` +
            `the permutation it exercises, or declare the process's lifecycle in the .bpd header ` +
            `('status <dissolved|retired|parked> …') if the whole process is not live. There is no ` +
            `'si: none': a drawn block the system does not realize is a business-design finding and a ` +
            `change-loop re-entry, not a binding disposition (ADR-069 §8)`);
          return;
        }
        row._seen = true;
        // The block tag's speaking name is NOT compared with the interaction's use-case name. They
        // belong to two populations: the tag is stakeholder prose written at Mockup by the process's
        // own author, the name is what the system settled on at Design. Comanda draws one operation
        // as "Find customer by phone" in BP01 and "Look up caller by phone" in BP12 (ADR-069 §6), and
        // a check that made stakeholder wording a machine key would be satisfied by rewriting what
        // stakeholders said.
        row._bp = d.bpCode;
        const addEdges = (ifStmts) => {
          for (const st of ifStmts)
            for (const br of st.branches)
              row._edges.set(edgeKey(st.cond, br.label), { gateway: st.cond, taken: br.label });
        };
        addEdges([...allStmts(b.body)].filter((s) => s.k === 'if'));
        // chain-level gateways (outside every drawn block) belong to the chain's sole call site;
        // the >1-block case was flagged ambiguous above (stmtsOutsideSi yields nested ifs too)
        if (c.sis.length === 1) addEdges(outside);
      });
    }
  }

  const unaccounted = [];        // callSites rows nothing in the supplied sources draws

  // Reverse totality over the call sites: a row must correspond to a drawn block. A row matched by
  // nothing names its own BP in its id, so unlike an ADR-066-era binding entry it CAN say which
  // source is missing — [C0] weighs that below from the whole picture.
  for (const r of callSites) {
    if (r._seen || byHistorical.has(r.callSite)) continue;
    const bp = r.callSite.slice(0, 4);
    E(`[C2] binding:${r.ln}: callSite '${r.callSite}' -> ${r.si} draws nothing in the supplied sources — ` +
      (suppliedBps.has(bp)
        ? `${bp} was supplied and has no such block, so this row is dead (delete it, or fix the id)`
        : `${bp} was not supplied to this invocation`),
      'row-no-source');
    unaccounted.push(r);
  }
  // ---- model side: C3/C4 per interaction, C9 reverse trace ----
  const ucById = new Map();
  for (const uc of model.useCases) {
    if (ucById.has(uc.id)) E(`[C1] model: duplicate use-case id '${uc.id}'`);
    ucById.set(uc.id, uc);
  }
  for (const e of interactions) {
    const uc = ucById.get(e.si);
    if (!uc) {
      E(`[C3] System Interaction ${e.si} '${e.name}' has no model use case with id '${e.si}'`);
      continue;
    }
    if (uc.name !== e.name)
      E(`[C3] model use case ${e.si} is named '${uc.name}' but the binding names it '${e.name}'`);
    if (!uc.permutations.some((pm) => pm.steps.length > 0))
      E(`[C4] use case ${e.si} '${e.name}' has no permutation with sequence steps — not realized as sequences`);

    // ---- facet-operation join (C11, #676; tightened by #1185) ----
    // The binding's `name` is the USE-CASE name (C3 above); the operation a client actually
    // calls is the model's `operationRef`, and the two coincide only by convention. The UI
    // channel joins scenario steps (named after the operation) against the map, so every
    // sequence step's operation must resolve to a real facet operation — and the client hop's
    // is captured per entry for the generated map to carry. Skipped for models without a
    // component catalog (draft-stage): there is nothing to resolve against yet.
    //
    // ONE SI IS ONE OPERATION CALL (`design-artifact-conventions`), and since ADR-067 (#1186)
    // the MODEL says so: the use case declares `operationId`, and permutation step 0 — the
    // client hop by construction (ADR-036) — is derived from it. So the map's `operation`
    // reads ONE declared field instead of walking permutations and collecting their first
    // steps, which is what #676 did: it answered a one-answer question with a list and carried
    // the extras as `variants`, turning a rule violation into a recorded shape that crossed
    // Blueprint. [C11]'s agreement half is RETIRED with this ADR — the disagreement is not
    // detected here any more, it is unrepresentable in the model (two mechanisms for one job,
    // and the inferior one goes). What survives is the half below: every step's operation must
    // resolve to a real facet operation.
    if (model.operationsById.size) {
      for (const pm of uc.permutations) {
        pm.steps.forEach((st, i) => {
          // ADR-061 internal steps (surfaced by #1182/ADR-068): a box the owning component
          // performs ITSELF — a label, no callee, no operation. Legal anywhere but step 1:
          // the client hop is a component call by construction (ADR-036). Before this read
          // the check flagged every internal step as unresolved, which is how a drawn box
          // got DROPPED from the model copy rather than modeled internal (figaro#149).
          if (st.kind === 'internal') {
            if (i === 0)
              E(`[C11] ${e.si} '${uc.name}' permutation '${pm.name}': step 1 is an internal step — ` +
                `the client hop is a component call by construction (ADR-036), never a Manager-own box`);
            return;
          }
          // ADR-067 (#1186) — step 0 is the client hop by construction and its operation is
          // the use case's DECLARATION (joined below), not a fact of its own: sns-cli refuses
          // `attach_operation` at `--step-index 0` on every authoring surface, so a model in
          // the ADR-067 shape carries NO operation there. An absent step-0 operation is
          // therefore not a finding; one that IS present and resolves to nothing still is
          // (figaro#257 §3).
          if (i === 0 && !st.operationId) return;
          const resolved = model.operationsById.get(st.operationId);
          if (!resolved)
            E(`[C11] ${e.si} '${uc.name}' permutation '${pm.name}' step ${i + 1}: operation ` +
              `'${st.operationName ?? st.operationDraft ?? '?'}' resolves to no facet operation in the model`);
        });
      }
      // The declared operation (ADR-067). A use case that declares none is INCOMPLETE, which
      // is a legal mid-Design state — the model's own promotion gate
      // (Gate.UseCaseOperationUndeclared) is what refuses to promote one, not this check.
      const declared = uc.operationId ? model.operationsById.get(uc.operationId) : null;
      if (declared) e._operation = declared;
      else if (uc.operationId)
        E(`[C11] ${e.si} '${uc.name}': declared operation '${uc.operationRef ?? uc.operationId}' ` +
          `resolves to no facet operation in the model`);
    }
  }
  // #1320 — the ONE exemption the model can state about a USE CASE, and the reason it is at
  // model level rather than in the binding map: `lifecycle: future|retired` is a DECISION, and
  // decisions live in the model (#861 — one original of a fact). `[C9]` and its permutation-level
  // sibling infer "nobody asks for this" from an EMPTINESS, and a use case the design is not
  // building is exactly what that emptiness looks like — the same argument that made a
  // `lifecycle: future` COMPONENT exempt from `unused`'s marks (#1155). It is NOT a general
  // silencer: a `live` use case nothing resolves to is still an error, which is the whole point of
  // the check, and the exemption is PRINTED on every run rather than taken quietly.
  const notBuilt = (uc) => uc && (uc.lifecycle === 'future' || uc.lifecycle === 'retired');
  const exemptUcs = [];
  for (const uc of model.useCases) {
    if (SI_ID_RE.test(uc.id)) {
      if (!bySi.has(uc.id) && !notBuilt(uc))
        E(`[C9] model use case ${uc.id} '${uc.name}' is in no 'interactions:' entry — model beyond the ` +
          `business design`, 'uc-outside-map');
    } else {
      // Untraceability is not a lifecycle question: a use case with no SIxx.yy id cannot be joined
      // to anything, retired or not, so this half is NEVER exempt.
      E(`[C9] model use case '${uc.id}' ('${uc.name}') has no SIxx.yy id — untraceable (design-artifact-conventions)`);
    }
  }

  // ---- C9, the REVERSE of totality (ADR-069 §8): what the system offers and nothing draws ----
  // Injectivity is dropped, so "no duplicate si" no longer guards the map. This is what replaces
  // it. An interaction no call site resolves to is a use case beyond the business design: the
  // system would offer an operation nothing asks for. The same question one level down — a
  // PERMUTATION no call site exercises — is the same finding at request-variant granularity: the
  // model offers a request shape nothing draws.
  // [C9-parked] is the same question with a different answer (#1252): the interaction IS asked
  // for, by a drawing whose process is parked — drawn, deliberately not built, revivable. That is
  // a warning naming what revives it, standing on every run until the process is revived (the
  // rows go live) or dissolved (the rows go, and this becomes the [C9] it then is).
  const parkedBpsOf = (rows) => [...new Set(rows.map((r) => r._parked.bp))].sort().join(', ');
  for (const e of interactions) {
    const liveRows = e._rows.filter((r) => !r._parked);
    // #1320 — the model's own declaration comes FIRST, because it answers the question [C9] is
    // about to ask. A use case the design declares `future` or `retired` is not "an operation
    // nothing asks for": it is one the design has decided is not built, said where a machine
    // reads it. Its own sequences stay drawn — a tombstone's record IS its sequences — so
    // nothing below this branch runs for it, at interaction OR permutation granularity.
    if (notBuilt(ucById.get(e.si))) {
      const lc = ucById.get(e.si).lifecycle;
      exemptUcs.push({ si: e.si, name: e.name, lifecycle: lc, ln: e.ln, liveRows: liveRows.length });
      // THE ONE HARD CONSTRAINT, and the peer of Gate.DeferredComponentIsRouted (#1155): the
      // build cannot both skip an interaction and be asked for it. A call site of a process that
      // is LIVE — being built — resolving to an interaction the model says is not built is a
      // contradiction with two honest fixes, and the message names both. Parked rows are fine:
      // a parked drawing asking for a deferred interaction is two halves of one decision.
      if (liveRows.length)
        E(`[C9-notbuilt] binding:${e.ln}: interaction ${e.si} '${e.name}' is resolved to by LIVE call ` +
          `site(s) ${liveRows.map((r) => r.callSite).join(', ')}, but its model use case declares ` +
          `\`lifecycle: ${lc}\` — ${lc === 'retired' ? 'the design decided AGAINST it and keeps it as a ' +
          'record' : 'the design decided it and this build defers it'}. A process being built cannot ask ` +
          `for an operation the design is not building. Either revive the use case ` +
          `(\`mutate --kind SetUseCaseLifecycle --use-case-ref ${e.si} --lifecycle live\`), or take the ` +
          `disposition to the drawing (its \`status\` header) so the row stops being live`);
      continue;
    }
    if (!liveRows.length) {
      if (e._rows.length) {
        W(`[C9-parked] binding:${e.ln}: interaction ${e.si} '${e.name}' is resolved to only by call site(s) of a ` +
          `parked process (${e._rows.map((r) => r.callSite).join(', ')} — ${parkedBpsOf(e._rows)}, drawn but ` +
          `not built) — kept for revival; it becomes a [C9] the moment those rows go`);
        continue;
      }
      E(`[C9] binding:${e.ln}: interaction ${e.si} '${e.name}' is resolved to by no call site — the system ` +
        `would offer an operation nothing asks for. Point a callSites row at it, or delete it and its model ` +
        `use case (its number is never reused, OI-029)`, 'interaction-no-callsite');
      continue;
    }
    const uc = ucById.get(e.si);
    if (!uc) continue;                        // C3 already reported
    const exercised = new Set();
    for (const r of liveRows) for (const pn of r._perms) exercised.add(pn);
    const exercisedParked = new Set();
    for (const r of e._rows) if (r._parked) for (const pn of r._perms) exercisedParked.add(pn);
    // Unqualified, exactly as si-binding-format.md states it. An earlier cut of this check
    // exempted a permutation with no steps, on the argument that the scaffolder seeds a 'Default'
    // and a half-filled use case is a legal mid-Design state. That exemption was withdrawn: it
    // narrows a rule the format states without qualification, and it narrows it INVISIBLY — the
    // seeded permutation nobody drew and nobody deleted is precisely a request variant the model
    // offers and nothing asks for. It is also not a second report of anything: a permutation a row
    // DOES name and that has no steps is [C7], one a row does not name is this. The cost is noise
    // while a use case is half-built, which `complete` is allowed to have — it is loose-stage
    // feedback and gates only at Blueprint (ADR-040 §8). The alternative cost is a rule that reads
    // as enforced and is not, which is the failure this repository removes on sight.
    for (const pm of uc.permutations) {
      if (exercised.has(pm.name)) continue;
      if (exercisedParked.has(pm.name)) {
        const rows = e._rows.filter((r) => r._parked && r._perms.includes(pm.name));
        W(`[C9-parked] ${e.si} '${e.name}': permutation '${pm.name}' is exercised only by call site(s) of a ` +
          `parked process (${rows.map((r) => r.callSite).join(', ')} — ${parkedBpsOf(rows)}, drawn but not ` +
          `built) — kept for revival; it becomes a [C9] the moment those rows go`);
        continue;
      }
      E(`[C9] ${e.si} '${e.name}': permutation '${pm.name}' is exercised by no call site — the model offers ` +
        `a request variant nothing draws (call site(s) on ${e.si}: ${e._rows.map((r) => `${r.callSite}->${r._perms.join('/') || '?'}`).join(', ')})`,
        'interaction-no-callsite');
    }
  }

  // ---- the permutation a call site names must EXIST (ADR-069 §8) ----
  for (const r of callSites) {
    const uc = ucById.get(r.si);
    for (const pn of r._perms) {
      // The {Base}_{Variant} SHAPE is a WARNING, never an exit-1 finding (#1208). Three facts
      // put it here rather than beside the two C7 errors below.
      //
      // 1. It is not this check's rule. ADR-041 §3 defines C7 as "a `permutation` declaration
      //    whose permutation is missing or has an empty sequence" — the shape never appears in
      //    the table, and §2 attaches the naming convention to the request-variant EDGE form,
      //    where a gateway picks between variants. The code applied it to every named
      //    permutation, which is the whole single-permutation population.
      // 2. Its OWNER holds it as a warning, deliberately and in writing. The rule is the
      //    model's: ModelEngine's WarnPermutationNamesNoVariant (#737) — "Warn (never refuse)
      //    when a permutation name matches no variant request DTO" — under the #594
      //    design-ahead ruling: "Naming the permutations of a use case before its contract
      //    types exist is ordinary authoring order... The smell says what is missing; the
      //    scaffolder's derivation is still the error, at the gate the model must pass to be
      //    built." seqmap erroring on a rule the declaring artefact deliberately does not
      //    refuse is a severity inversion, and seqmap's copy is strictly the weaker one:
      //    `includes('_')` is a silhouette of "equals a variant request DTO of the operation
      //    this use case enters", which only the model can evaluate. The pattern is already
      //    in this function — the declared-operation check above cedes refusal to
      //    Gate.UseCaseOperationUndeclared for exactly this reason.
      // 3. seqmap fails a name SNS itself writes. `AddUseCase --seed-default-permutation`
      //    seeds a permutation named literally "Default" (ModelEngine.cs) — no underscore. A
      //    freshly seeded use case therefore reds a Blueprint gate for a name the toolchain
      //    authored one command earlier.
      // 4. It is collected at Gate Blueprint, which freezes the SYSTEM DESIGN. Its consumer is
      //    the Construction-stage scaffolder, two gates later.
      //
      // NOT an exemption, and specifically not the single-permutation exemption #1208 proposed:
      // measured on derive.ts (`deriveUseCaseBindings`, the permutation↔variant cross-check),
      // the scaffolder hard-errors — "permutation name must equal a variant request DTO of
      // {Manager}.{Operation} — rename the permutation or add the variant DTO" — with no
      // single-permutation branch and no `_Default` synthesis. Comanda's nine single-permutation
      // use cases all carry {Base}_{Variant} names (#910). So the rule has a real referent for
      // every permutation, and dropping it would defer a live scaffolder error invisibly — the
      // failure the [C9] exemption withdrawal above names. It stays printed, on every run, for
      // every population. Only the exit code changes.
      if (!pn.includes('_'))
        W(`[C7-shape] binding:${r.ln}: callSite ${r.callSite} names permutation '${pn}', which is not ` +
          `{Base}_{Variant}-shaped. The Construction-stage scaffolder REFUSES this: a permutation ` +
          `name must equal a variant request DTO of the Manager operation the use case enters. ` +
          `Declare that DTO in the entry operation's facet, or rename the permutation. Not a ` +
          `Blueprint finding (ADR-041 §3) — the model warns on it too, and never refuses it`);
      if (!uc) continue;                      // C1/C3 already reported
      const pm = uc.permutations.find((x) => x.name === pn);
      if (!pm)
        E(`[C7] binding:${r.ln}: callSite ${r.callSite} names permutation '${pn}' of ${r.si} '${uc.name}' — ` +
          `no such permutation on the model use case`);
      else if (!pm.steps.length)
        E(`[C7] binding:${r.ln}: permutation '${pn}' has no sequence steps — the block ${r.callSite} draws ` +
          `realizes nothing (generate it: \`seqmap sequence\`)`);
    }
  }

  // ---- gateway-edge realization: C5 undeclared, C6 dead, C7/C8 declaration targets ----
  // PER CALL SITE (ADR-069 §3), not per interaction: the edges are the gateways inside ONE drawn
  // block, and two blocks bound to one interaction may legitimately draw different ones — that is
  // what a permutation IS. Declaring them on the interaction would union edges across blocks that
  // are allowed to differ, and neither side could then be held to its own drawing.
  let edgesRealized = 0;
  for (const r of callSites) {
    if (!r._seen) continue;                    // already a C2 finding, or frozen by a status
    const ix = bySi.get(r.si);
    if (!ix) continue;                         // already a C1 finding
    const declared = new Map();
    for (const d of r.edges) {
      const k = edgeKey(d.gateway, d.taken);
      if (declared.has(k)) E(`[C6] binding:${d.ln}: duplicate declaration for edge ("${d.gateway}", "${d.taken}") on callSite ${r.callSite}`);
      declared.set(k, d);
    }
    for (const [k, rec] of r._edges)
      if (!declared.has(k))
        E(`[C5] ${r.callSite} -> ${r.si} '${ix.name}': system-side edge ("${rec.gateway}" -> "${rec.taken}") in ${r._bp} has no realization declaration`);
    for (const [k, d] of declared)
      if (!r._edges.has(k))
        E(`[C6] binding:${d.ln}: callSite ${r.callSite} declares edge ("${d.gateway}", "${d.taken}") but its drawn block has no such gateway edge`);

    const uc = ucById.get(r.si);
    for (const d of r.edges) {
      if (!r._edges.has(edgeKey(d.gateway, d.taken))) continue; // dead declaration already reported
      if (d.realizedBy.key === 'permutation') {
        // shape and existence are checked once per row, above (the row's permutation set is the
        // union of its request-variant edges); here only the realization is counted
        const pm = uc && uc.permutations.find((x) => x.name === d.realizedBy.value);
        if (pm && pm.steps.length) edgesRealized++;
      } else {
        const m = d.realizedBy.value.match(SQ_ID_RE);
        if (!m) { E(`[C8] binding:${d.ln}: '${d.realizedBy.value}' does not match SQxx.yy.zz`); continue; }
        if (`SI${m[1]}` !== r.si) { E(`[C8] binding:${d.ln}: sequence ${d.realizedBy.value} does not sit under ${r.si} (coordinate mismatch)`); continue; }
        const zz = parseInt(m[2], 10);
        if (!uc) continue;
        if (zz < 1 || zz > uc.permutations.length)
          E(`[C8] binding:${d.ln}: sequence ${d.realizedBy.value} references variation ${m[2]} but ${r.si} has ${uc.permutations.length} permutation(s)`);
        else edgesRealized++;
      }
    }
  }

  // ===== [C16] — equality is checked per PERMUTATION, never per interaction ==========
  // Every call site carries its OWN full realization declarations, with no designated authority
  // and no shared copy (ADR-069 §3): a generating row would leave the others silently empty or
  // silently stale, and nothing could tell "deliberately points elsewhere" from "nobody filled it
  // in". The redundancy is deliberate — and this is what makes it checkable instead of optimizing
  // it away into a dependency.
  //
  // Two call sites on the same (si, permutation) are the same operation called with the same
  // request shape, therefore the same activities. A divergence has exactly two honest
  // resolutions: harmonize the two drawings, or mint the second permutation the design has
  // actually got. So the error names BOTH SIDES and the activities that differ — the reader is
  // handed the disagreement, not a verdict.
  //
  // Equality is NEVER required across one INTERACTION (ADR-069 §6): different permutations of one
  // operation ought to draw differently, and demanding otherwise would forbid the polymorphic
  // request-DTO pattern the Method is built on. Comanda's SI01.07_ConfirmOrder draws three
  // visibly different flows across BP01/BP09/BP10 — under this check that is not a violation to
  // be waived but a model MISSING ITS PERMUTATIONS, and the finding says so.
  //
  // What is compared is each row's own declarations, because that is what every row carries and
  // what goes stale. Each row is separately held to its OWN drawing by [C14] (every drawn box has
  // exactly one declaration, every declaration a drawn box), so two rows that agree here and each
  // match their own block have blocks that agree. The two checks compose; neither substitutes for
  // the other, and [C16] needs no si-export to run.
  const permKeyOf = (r) => `${r.si} ${[...r._perms].sort().join('+')}`;
  const byPerm = new Map();
  for (const r of callSites) {
    if (!r._perms.length) continue;            // ungenerable row, already a C1 finding
    if (r._parked) continue;                   // a parked drawing is not held to what is being built (#1252)
    const k = permKeyOf(r);
    if (!byPerm.has(k)) byPerm.set(k, []);
    byPerm.get(k).push(r);
  }
  const renderRealizedBy = (rb) =>
    `{ ${rb.key}: ${Array.isArray(rb.value) ? `[${rb.value.join(', ')}]` : rb.value} }`;
  const activitiesOf = (r) => [
    ...r.boxes.map((b) => `box "${b.box}" ${renderRealizedBy(b.realizedBy)}`),
    ...r.sends.map((sd) => `send "${sd.send}" ${renderRealizedBy(sd.realizedBy)}`),
    ...r.edges.map((d) => `edge ("${d.gateway}" -> "${d.taken}") ${renderRealizedBy(d.realizedBy)}`),
  ];
  for (const group of byPerm.values()) {
    if (group.length < 2) continue;
    const [first, ...rest] = group;
    const a = activitiesOf(first);
    for (const other of rest) {
      const b = activitiesOf(other);
      const onlyA = a.filter((x) => !b.includes(x));
      const onlyB = b.filter((x) => !a.includes(x));
      const sameOrder = a.length === b.length && a.every((x, i) => x === b[i]);
      if (!onlyA.length && !onlyB.length && sameOrder) continue;
      const diff = [
        ...onlyA.map((x) => `${first.callSite} draws ${x}, ${other.callSite} does not`),
        ...onlyB.map((x) => `${other.callSite} draws ${x}, ${first.callSite} does not`),
      ];
      E(`[C16] callSite ${first.callSite} (binding:${first.ln}) and ${other.callSite} (binding:${other.ln}) both ` +
        `exercise ${first.si} permutation '${first._perms.join("/")}' but do not draw the same activities: ` +
        (diff.length ? diff.join('; ') : `the same activities in a different drawing order`) + `. Same operation, ` +
        `same request shape, therefore the same activities — harmonize the two drawings, or mint the second ` +
        `permutation the design has actually got (ADR-069 §3)`);
    }
  }

  // ===== SI-internal refinement (C14/C15, #1182/ADR-068) ===========================
  // With the si-exports supplied (`--si <dir>`), `complete` becomes a REFINEMENT check:
  // the model's use-case sequence refines the drawn block, so every box is bound and
  // realized, every system-side send is bound, and no model step stands without a
  // business box above it. Without the exports these checks do not run — a project
  // migrates by generating the exports, never by silently passing.
  if (siExports) {
    // continuation index across the whole source set: which messages a process hands INTO
    // another BP's system chain, keyed by the SOURCE process id (#1167: the receiving side's
    // `process pool … from <ProcessId>` declares the join).
    const continuationMsgs = new Map();          // process id -> Set(message)
    for (const d2 of digests)
      for (const pool of d2.model.pools) {
        if (!pool.handover) continue;
        for (const { send } of allSends(pool.body)) {
          const r = resolveDst(d2, send.to);
          if (r && r.systemChain) {
            if (!continuationMsgs.has(pool.handover)) continuationMsgs.set(pool.handover, new Set());
            continuationMsgs.get(pool.handover).add(send.label);
          }
        }
      }
    const qname = (r) => `${r.component}.${r.facet}.${r.name}`;
    // PER CALL SITE (ADR-069 §3): one drawn block realizes one permutation's sequence, generated
    // from that block alone. Under ADR-068 these declarations sat on the interaction as a union
    // across its defining processes — which the blind review killed, because a union over blocks
    // that legitimately differ has no drawing order, and drawing order is what the generated
    // sequence is built from.
    //
    // The export is looked up BY CALL SITE (#1210, closing the #1196/S-018 seam): the box
    // universe is the block actually drawn here, not the union across every block bound to this
    // interaction. That union is why [C14] could not previously catch a box drawn in only one of
    // two call sites sharing an interaction.
    for (const r of callSites) {
      if (!r._seen) continue;                              // already a C2 finding, or frozen
      const ix = bySi.get(r.si);
      if (!ix) continue;                                   // already a C1 finding
      const at = `${r.callSite} -> ${r.si} '${ix.name}'`;
      const x = siExports.get(r.callSite);
      if (!x) {
        E(`[C14] ${at}: no si-export (${r.callSite}.json) in the supplied exports — ` +
          `regenerate them (\`bpmn-dsl si-export <sources> -o <dir>\`)`);
        continue;
      }
      // the universes: box labels and system-side send messages of the drawn block
      const boxLabels = new Set();
      const sendMsgs = new Set();
      const noteSend = (snd, proc) => {
        const isSystem = !!snd.triggers || snd.pool === 'system' || snd.pool === 'process'
          || (continuationMsgs.get(proc) || new Set()).has(snd.message);
        if (isSystem) sendMsgs.add(snd.message);
      };
      const walkNodes = (nodes, proc) => {
        for (const nd of nodes || []) {
          if (nd.kind === 'gateway') { for (const br of nd.branches) walkNodes(br.nodes, proc); continue; }
          if (nd.kind === 'step') boxLabels.add(nd.label);
          for (const snd of nd.sends || []) noteSend(snd, proc);
        }
      };
      // ONE definition, not a list (si-export/3): the call site belongs to the one process that
      // drew it, so there is never a second.
      const def = x.definition;
      walkNodes(def.nodes, def.process);
      for (const snd of def.sends || []) noteSend(snd, def.process);
      // totality both ways, on verbatim labels — exactly the gateway-edge discipline
      const declBoxes = new Map();
      for (const b of r.boxes) {
        if (declBoxes.has(b.box)) E(`[C14] binding:${b.ln}: duplicate box declaration "${b.box}" on callSite ${r.callSite}`);
        declBoxes.set(b.box, b);
        if (!boxLabels.has(b.box))
          E(`[C14] binding:${b.ln}: callSite ${r.callSite} declares box "${b.box}" but no step in its drawn block carries that label (dead declaration)`);
      }
      for (const label of [...boxLabels].sort())
        if (!declBoxes.has(label))
          E(`[C14] ${at}: box "${label}" has no binding — declare realizedBy ` +
            `{ operation: … } (a component call), { internal: … } (a Manager-own step, ADR-061), ` +
            `or { expands: [ … ] } (one business box, several model steps)`);
      const declSends = new Map();
      for (const sd of r.sends) {
        if (declSends.has(sd.send)) E(`[C14] binding:${sd.ln}: duplicate send declaration "${sd.send}" on callSite ${r.callSite}`);
        declSends.set(sd.send, sd);
        if (!sendMsgs.has(sd.send))
          E(`[C14] binding:${sd.ln}: callSite ${r.callSite} declares send "${sd.send}" but its drawn block draws no system-side send with that message (dead declaration)`);
      }
      for (const msg of [...sendMsgs].sort())
        if (!declSends.has(msg))
          E(`[C14] ${at}: system-side send "${msg}" has no binding — declare realizedBy ` +
            `{ operation: … } or { event: … } (the drawn hand-off must be a real call, never inlined)`);
      // realizedBy resolution against the model + realization both ways
      if (!model.operationsById.size) continue;            // draft model: nothing to resolve yet
      const uc = ucById.get(r.si);
      const resolveRef = (ref, ln, what) => {
        const c = model.operationsByName.get(ref) || [];
        if (!c.length) { E(`[C14] binding:${ln}: ${what} realizedBy operation '${ref}' resolves to no facet operation in the model`); return null; }
        if (c.length > 1) { E(`[C14] binding:${ln}: ${what} realizedBy operation '${ref}' is ambiguous — qualify it: ${c.map(qname).join(', ')}`); return null; }
        return c[0];
      };
      const boundOps = new Map();                          // qname -> the declaration that bound it
      const boundInternals = new Map();                    // label -> declaration
      for (const b of r.boxes) {
        if (b.realizedBy.key === 'operation') {
          const rec = resolveRef(b.realizedBy.value, b.ln, `box "${b.box}"`);
          if (rec) boundOps.set(qname(rec), { at: `box "${b.box}"`, ln: b.ln });
        } else if (b.realizedBy.key === 'internal') {
          boundInternals.set(b.realizedBy.value, { at: `box "${b.box}"`, ln: b.ln });
        } else {
          for (const ref of b.realizedBy.value) {
            const rec = resolveRef(ref, b.ln, `box "${b.box}" (expands)`);
            if (rec) boundOps.set(qname(rec), { at: `box "${b.box}" (expands)`, ln: b.ln });
          }
        }
      }
      for (const sd of r.sends)
        if (sd.realizedBy.key === 'operation') {
          const rec = resolveRef(sd.realizedBy.value, sd.ln, `send "${sd.send}"`);
          if (rec) boundOps.set(qname(rec), { at: `send "${sd.send}"`, ln: sd.ln });
        }
      if (!uc) continue;                                   // C3 already reported
      // [C15] reverse totality: no model step without a business box above it. Step 1 is the
      // client hop (the request arrow into the system), never a drawn box — skipped. Only the
      // permutations THIS call site exercises are judged against THIS block: a sibling call site
      // on another permutation of the same interaction draws its own, and holding one block to
      // another's steps is the union defect ADR-069 §3 removed.
      const mine = new Set(r._perms);
      const realizedOps = new Set();
      const realizedInternals = new Set();
      for (const pm of uc.permutations) {
        if (!mine.has(pm.name)) continue;
        pm.steps.forEach((st, i) => {
          if (i === 0) return;
          if (st.kind === 'internal') {
            const label = st.label ?? '';
            realizedInternals.add(label);
            if (!boundInternals.has(label))
              E(`[C15] ${at} permutation '${pm.name}' step ${i + 1}: internal step ` +
                `'${label}' has no business box above it — no boxes declaration binds { internal: ${label} }`);
            return;
          }
          const rec = model.operationsById.get(st.operationId);
          if (!rec) return;                                // C11 reports the unresolved step
          const k = qname(rec);
          realizedOps.add(k);
          if (!boundOps.has(k))
            E(`[C15] ${at} permutation '${pm.name}' step ${i + 1}: calls ${k} with no ` +
              `business box above it — the model sequence refines the drawn block (ADR-068); bind the drawn ` +
              `box this step realizes (or add it to an expands list)`);
        });
      }
      // forward realization: a declaration the generated sequence does not carry yet
      for (const [k, d] of boundOps)
        if (!realizedOps.has(k))
          E(`[C14] binding:${d.ln}: ${at} ${d.at} is bound to ${k} but no permutation step calls it — ` +
            `generate the sequence from block × binding (\`seqmap sequence\`)`);
      for (const [label, d] of boundInternals)
        if (!realizedInternals.has(label))
          E(`[C14] binding:${d.ln}: ${at} ${d.at} is bound { internal: ${label} } but no permutation ` +
            `carries that internal step — generate the sequence from block × binding (\`seqmap sequence\`)`);
    }
  }

  // ---- screens (C10): every action key resolves through the binding ----
  // A `.vw` action key is a CALL SITE (ADR-069 §5): the screen model is authored at Mockup,
  // against the drawings, before any System Interaction exists. So the key joins `callSites:`,
  // and a screen calling a System Interaction id is a Design-tier id on a Mockup-tier artifact.
  // A screen action calling a call site FROZEN by its process's non-live status stays a finding
  // (#1148): a stale view is a stale view, and the freeze accounts for the drawing, not for the
  // screens that still point at it.
  if (screensDir) {
    const walkDir = (pth, out) => {
      for (const entry of readdirSync(pth).sort()) {
        const f = join(pth, entry);
        if (statSync(f).isDirectory()) walkDir(f, out);
        else if (entry.endsWith('.vw')) out.push(f);
      }
      return out;
    };
    for (const f of walkDir(screensDir, [])) {
      let screen = null, action = null;
      for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
        let m;
        if ((m = line.match(/^\s*(?:screen|dialog(?:\s+def)?)\s+([\w-]+)/))) { screen = m[1]; action = null; continue; }
        if ((m = line.match(/^\s*action\s+([\w-]+)/))) { action = m[1]; continue; }
        if ((m = line.match(/^\s*(calls|also)\s+([\w.-]+)\s*;/))) {
          const [, via, key] = m;
          const at = `${basename(f)}: ${screen || '?'}#${action || '?'} ${via}`;
          const head = key.split('.').slice(0, 2).join('.');
          const csM = key.match(/^(BP\d{2}\.\d{2})/);
          if (SI_RETIRED_PROV_RE.test(head))
            E(`[C10] ${retiredProvisional(key, at)}`);
          else if (SI_ID_RE.test(head)) {
            // The model may well have this use case — that is not the point. A screen model is a
            // Mockup artifact and speaks call sites; which interaction the call it makes resolves
            // to is a Design decision it must not restate.
            const inModel = ucById.has(head);
            if (inModel) screenOutsideMap.push({ at, key: head });
            E(`[C10] ${at} '${key}' — a screen action names a System Interaction id, and a screen model ` +
              `is authored at Mockup against the drawings (ADR-069 §5). Name the CALL SITE the action ` +
              `starts ('BPxx.yy'); which interaction it resolves to is si-binding.yaml's business`,
              inModel ? 'screen-outside-map' : undefined);
          }
          else if (csM) {
            if (!byCallSite.has(csM[1]))
              E(`[C10] ${at} '${key}' — call site ${csM[1]} has no callSites row in the binding map`);
          }
          else E(`[C10] ${at} '${key}' — does not resolve to a BPxx.yy call site`);
        }
      }
    }
  }

  // ===== [C0] — is this a WHOLE design, or part of one? (#636) =====================
  // `complete` is a whole-design check; handed a subset (some sources, a map covering some
  // of the design) it used to report the REST OF THE PROJECT as defects, in its two
  // most alarming categories. The three inputs each declare a size for the same design,
  // so a disagreement between them is detectable — and is a statement about the
  // INVOCATION, not about the design. ADR-049 §8a: refuse, do not thin.
  const modelSiIds = model.useCases.filter((uc) => SI_ID_RE.test(uc.id)).map((uc) => uc.id);
  const ucOutsideMap = modelSiIds.filter((id) => !bySi.has(id));
  const ucInsideMap = modelSiIds.length - ucOutsideMap.length;
  // The map lacking interactions the model has is ambiguous with a genuine orphan — ONE model
  // use case too many is exactly the [C9] finding this tool exists to raise. It becomes a
  // subset diagnosis only on evidence: the outsiders outnumber the insiders, or a screen
  // model proves the design actually uses one of them.
  const mapPartial = ucOutsideMap.length > 0 && (ucOutsideMap.length > ucInsideMap || screenOutsideMap.length > 0);
  // The sources being partial is now provable from the ids themselves again, and better than it
  // ever was under the provisional scheme: a CALL SITE names its business process permanently
  // (ADR-069 §1), so an unmatched row names the .bpd that would have drawn it. A row whose BP was
  // not supplied is evidence of a partial hand-over; a row whose BP WAS supplied is a dead row and
  // stays a finding. The balance decides, exactly as `mapPartial` does.
  const rowsFromMissingBp = unaccounted.filter((r) => !suppliedBps.has(r.callSite.slice(0, 4)));
  const rowsMatched = callSites.length - unaccounted.length;
  const sourcesPartial = rowsFromMissingBp.length > 0 && rowsFromMissingBp.length > rowsMatched;
  // An interaction nothing resolves to is [C9] — and against a PARTIAL map it is the same
  // ambiguity `ucOutsideMap` has: the call sites that resolve to it may simply not have been
  // handed over. It rides the map-partial diagnosis, since the map is the input in question.
  const interactionsNoCallSite = interactions.filter((e) => !e._rows.length);

  let subset = null;
  if (mapPartial || sourcesPartial) {
    const drop = new Set();
    if (mapPartial) { drop.add('uc-outside-map'); drop.add('screen-outside-map'); }
    if (sourcesPartial) { drop.add('row-no-source'); drop.add('interaction-no-callsite'); }
    const withheld = problems.filter((p) => drop.has(p.cls));
    const byCode = new Map();
    for (const p of withheld) {
      const code = (p.msg.match(/^\[(C\d+)\]/) || [, '?'])[1];
      byCode.set(code, (byCode.get(code) || 0) + 1);
    }
    const sample = (xs, n = 4) => xs.slice(0, n).join(', ') + (xs.length > n ? `, … (+${xs.length - n} more)` : '');
    const lines = ['[C0] PARTIAL INPUT — this invocation was handed part of a design, not all of it; ' +
                   'a completeness check cannot conclude on part of one'];
    if (sourcesPartial)
      lines.push(`[C0]   sources: ${rowsFromMissingBp.length} of the binding map's ${callSites.length} callSites ` +
        `rows name a call site of a business process that was not supplied ` +
        `(${sample(rowsFromMissingBp.map((r) => r.callSite).sort())}), against ` +
        `${rowsMatched} rows that a supplied source draws — the ${digests.length} source(s) supplied are ` +
        `${sample([...suppliedBps].sort(), 6)}. Supply those .bpd sources, or delete the stale rows.`);
    if (mapPartial) {
      lines.push(`[C0]   binding map: covers ${ucInsideMap} of the model's ${modelSiIds.length} ` +
        `SI-shaped use case(s) — ${ucOutsideMap.length} sit outside it (${sample(ucOutsideMap)}). ` +
        `Against the design's whole map these are ordinary use cases; only against this one do they look orphaned.`);
      if (interactionsNoCallSite.length)
        lines.push(`[C0]   binding map: ${interactionsNoCallSite.length} interaction(s) are resolved to by no ` +
          `call site in it (${sample(interactionsNoCallSite.map((e) => e.si))}) — dead against this map, ` +
          `ordinary against the whole one.`);
    }
    if (screenOutsideMap.length)
      lines.push(`[C0]   screens: ${screenOutsideMap.length} action` +
        `${screenOutsideMap.length === 1 ? ' names' : 's name'} a System Interaction id the model has but ` +
        `this binding map does not carry — ${sample(screenOutsideMap.map((x) => x.key))}.`);
    if (withheld.length)
      lines.push(`[C0]   suppressed ${withheld.length} finding(s) that follow from the partial input rather ` +
        `than from the design: ` + [...byCode].map(([c, n]) => `${n}×[${c}]`).join(', ') + '.');
    lines.push('[C0]   rerun over the whole design — every tagged .bpd source, the project\'s whole ' +
               'si-binding.yaml, and all screen models.');
    subset = { lines, withheld: withheld.length };
    for (let i = problems.length - 1; i >= 0; i--) if (drop.has(problems[i].cls)) problems.splice(i, 1);
  }

  return {
    problems, warnings, subset, binding, interactions, callSites, bySi, byCallSite, rowsBySi,
    // #1320 — the use cases whose `[C9]` was NOT raised because the model declares them
    // not built. Returned so every path that runs the join can PRINT them: an exemption
    // nobody sees is the failure mode the [C9] exemption-withdrawal comment names one
    // screen up — a rule that reads as enforced and is not.
    exemptUcs,
    // the MAP, not a Set (#1243): `sequence` refuses a frozen call site by name and needs to
    // say WHICH state froze it. `.has()`/`.size` read the same either way.
    historical: byHistorical, model, digests, edgesRealized,
  };
}

// Warnings print on EVERY path that runs the join — the check, bound generation, and `sequence`
// — because their whole value is being seen early. A tier nobody prints is the failure mode the
// [C9] exemption withdrawal names: a rule that reads as enforced and is not.
function reportWarnings(warnings) {
  for (const w of warnings) process.stderr.write('seqmap complete: warning: ' + w + '\n');
}

// #1320 — the declared exemptions, printed on EVERY path that runs the join, for the same reason
// the warnings are: their whole value is being seen. A `[C9]` silently not raised is
// indistinguishable from a `[C9]` the checker failed to notice, and one of those two is a design
// defect. Not a finding and not a warning — a NOTE: the model said so on purpose.
function reportExemptions(exemptUcs) {
  if (!exemptUcs || !exemptUcs.length) return;
  process.stderr.write(
    `seqmap complete: note: [C9] not raised for ${exemptUcs.length} model use case(s) the model ` +
    `declares not built — ` +
    exemptUcs.map((x) => `${x.si} '${x.name}' (lifecycle: ${x.lifecycle})`).join(', ') +
    `. A retired interaction is a TOMBSTONE: kept as a record, never built, its number never ` +
    `reused. Its sequences stay drawn — that record is what they are.\n`);
}

function reportProblems(problems, subset) {
  const say = (m) => process.stderr.write('seqmap complete: ' + m + '\n');
  if (subset) for (const l of subset.lines) say(l);
  for (const p of problems) say(p.msg);
  if (subset)
    die('input is partial — the completeness check needs the whole design (ADR-041 §3 [C0]; ' +
        'ADR-049 §8a: refuse, do not thin)' +
        (problems.length ? `. ${problems.length} further finding(s) reported above, about what WAS supplied` : ''));
  die(`${problems.length} completeness finding(s) — the model does not fully realize the business design (ADR-041; a design finding raised at derivation, ADR-037 §2)`);
}

function completeCheck(files, bindingFile, modelFile, screensDir, siExportsDir) {
  const r = runComplete(files, bindingFile, modelFile, screensDir, siExportsDir);
  reportWarnings(r.warnings);
  reportExemptions(r.exemptUcs);
  if (r.problems.length || r.subset) reportProblems(r.problems, r.subset);
  const nEdges = r.callSites.reduce((n, x) => n + x._edges.size, 0);
  const nBoxes = r.callSites.reduce((n, x) => n + x.boxes.length, 0);
  const nSends = r.callSites.reduce((n, x) => n + x.sends.length, 0);
  const nHist = r.historical.size;
  // The ratio ADR-069 §7 wants reported: N call sites resolve to M System Interactions. Under
  // si-binding/1 a shared interaction merely appeared in two `definitions[]` entries and this
  // number could not be formed at all.
  const live = r.callSites.filter((x) => x._seen);
  const parked = r.callSites.filter((x) => x._parked);
  process.stdout.write(
    `seqmap complete: green — ${r.digests.length} BPs, ${live.length} call site(s) resolving to ` +
    `${r.interactions.length} System Interaction(s), ` +
    (nHist ? `${nHist} drawn block(s) frozen by a non-live status, ` : '') +
    (parked.length ? `${parked.length} row(s) of a parked process kept for revival, ` : '') +
    `${nEdges} system-side edge(s) realized, ` +
    // A LEG THAT DID NOT RUN SAYS SO, ON THE SAME LINE AS THE VERDICT (figaro Kaizen K-068).
    // `complete` is one verb name over three check sets, and this sentence is what a record
    // quotes: a commit body, a session record, an issue, a gate row, a report to a human. An
    // absent clause is invisible there. Measured on figaro, 2026-09-14: two sessions ran
    // `seqmap complete` on the same tree minutes apart and reported `exit 0, 0 findings` and
    // `exit 1, 15 findings`; both numbers reproduce, both are TRUE of the leg their author
    // ran, and neither record could name its leg because this line never did. One issue was
    // filed on the premise that a gate check could not fail. Every sibling check in this
    // toolchain already prints its own absence in its own words — `advisory without
    // --require-all`, `NOT WALKED`, `NOT LIT`, `product-drift sweep NOT run` — and the
    // dossier builder says why: a silent pass reads like a check that did not run.
    (siExportsDir
      ? `${nBoxes} box(es) + ${nSends} send(s) refined (C14/C15), `
      : 'C14/C15 NOT RUN (no --si: the ADR-068 refinement of the drawn boxes and sends is unchecked), ') +
    (screensDir ? '' : 'C10 SCREENS NOT CHECKED (no --screens: no screen action was joined to a call site), ') +
    `${r.model.useCases.length} model use case(s) traced` +
    (r.exemptUcs.length
      ? `, ${r.exemptUcs.length} exempt on a model lifecycle (` +
        r.exemptUcs.map((x) => `${x.si} ${x.lifecycle}`).join(', ') + ')'
      : '') +
    (r.warnings.length ? `, ${r.warnings.length} warning(s) standing` : '') + `\n`);
}

// ===================================================================================
//  REPLAY — the walkthrough-replay regression (#413; ADR-040 §3 as amended by #410,
//  walkthrough-log-format.md). Approved walklogs re-verified against a (re)generated
//  map: replay identity is bp + branches (never the positional path id); the step
//  sequence must be consistent with the matched path's step cycle (forward-search
//  cursor, backward = loop re-entry — the ADR-037 mockup-cursor semantics); ids are
//  opaque keys, translated through the binding map when the log and map bindings
//  differ. Guards Stages D–E: any later map/mockup regeneration must replay green.
//  --gate additionally requires every map path covered by a green approved log
//  (the Gate-2 "every BP branch approved" check).
// ===================================================================================
// ===================================================================================
//  WALKLOG DISPOSITION — walklog-disposition/1 sidecar (ADR-069 §9, #1196).
//  A log recorded under an id scheme a decision RETIRED is frozen, not migrated: it
//  stays byte-identical and is withdrawn from REPLAY only. Ruled by the Software
//  Architect 2026-09-02 — re-stamping rewrites the record of a session that happened,
//  and a translation flag resurrects for one migration the mechanism ADR-069 deletes.
//  Deliberately NOT the #764 `annotations` array: that is additive and INERT (replay
//  never reads it), and a disposition that changes what replay does is not inert.
//  Frozen means excluded from replay, NOT excluded from approval — the walk happened.
//
//  A SECOND disposition, same mechanism, opposite consequence (#1223): a mockup REBUILT
//  WITH OVERWRITE replaces the artefact its walks were performed against, so those walks
//  are evidence about nothing the project still has — `superseded:` withdraws them from
//  replay AND from approval, and every log in that directory walked on or before the
//  overwrite that is NOT listed is a finding, so the set cannot be silently incomplete.
//  Both kinds leave the files byte-identical and where they are: disposition is data, not
//  location (a retiring FOLDER is a rule you cannot see by looking at the artefact).
//  Format section: walkthrough-log-format.md.
// ===================================================================================
function parseWalklogDispositionFile(file) {
  const { peek, perr, stripComment, scalar, field, take } = yamlSubset(file);

  const f = field(0, 'format');
  const format = scalar(f.tok, f.value);
  if (format !== 'walklog-disposition/1')
    die(`${file}:${f.tok.ln}: format is '${format}', expected 'walklog-disposition/1'`);
  const sys = field(0, 'system');
  const system = scalar(sys.tok, sys.value);

  // The log list of a group, at indent 6 under `logs:`. Shared by both group kinds because the
  // rule is the same one for both: the dispositioned set is explicit, closed and reviewable.
  const readLogs = (g, ownerTok) => {
    const logsF = field(4, 'logs');
    if (stripComment(logsF.value) !== '') perr(logsF.tok, "'logs:' opens a block list — no inline value");
    while (peek() && peek().indent === 6 && peek().text.startsWith('- ')) {
      const tok = peek();
      const name = scalar(tok, stripComment(tok.text.slice(2)).trim().replace(/^"(.*)"$/, '$1'));
      // No globs, no date ranges: the disposed set is a closed, reviewable list.
      if (/[*?\[\]]/.test(name))
        perr(tok, `'${name}' looks like a glob — the disposed set is an explicit, closed list so a ` +
          `reviewer can see all of it and disagree with it (walkthrough-log-format.md)`);
      g.logs.push({ name, ln: tok.ln });
      take();
    }
    if (!g.logs.length) perr(ownerTok, `disposition group '${g.scheme ?? g.build}' names no log`);
  };

  const frozen = [];            // an id scheme a decision retired (ADR-069 §9)
  const superseded = [];        // a mockup build an overwrite replaced (#1223)

  const readFrozen = () => {
    const fr = field(0, 'frozen');
    if (stripComment(fr.value) !== '') perr(fr.tok, "'frozen:' opens a block list — no inline value");
    while (peek() && peek().indent === 2 && peek().text.startsWith('- ')) {
      const schemeF = field(2, 'scheme', { dash: true });
      const g = { scheme: scalar(schemeF.tok, schemeF.value), ln: schemeF.tok.ln, file, logs: [] };
      const rulingF = field(4, 'ruling');
      g.ruling = scalar(rulingF.tok, rulingF.value);
      // Freezing is a one-time migration act, never a lane: the ruling that retired the scheme
      // must be named, so a reader can go and disagree with it.
      if (!g.ruling.trim()) perr(rulingF.tok, "'ruling:' must name the decision that retired the scheme");
      const reasonF = field(4, 'reason');
      g.reason = scalar(reasonF.tok, reasonF.value);
      readLogs(g, schemeF.tok);
      frozen.push(g);
    }
    if (!frozen.length) perr(fr.tok, "'frozen:' names no group");
  };

  // A mockup REBUILT WITH OVERWRITE retires the walks of the build it replaced: the artefact
  // those walks were performed against no longer exists, so they are evidence about nothing the
  // project still has (#1223, the Software Architect 2026-09-01: "Since I walked the previous
  // mock up, I did not walk anything … any walk results must be marked as invalid"). The group
  // names the replaced build, the day the replacement landed, the ruling and the reason; the logs
  // stay byte-identical and exactly where they are.
  const readSuperseded = () => {
    const sp = field(0, 'superseded');
    if (stripComment(sp.value) !== '') perr(sp.tok, "'superseded:' opens a block list — no inline value");
    while (peek() && peek().indent === 2 && peek().text.startsWith('- ')) {
      const buildF = field(2, 'build', { dash: true });
      const g = { build: scalar(buildF.tok, buildF.value), ln: buildF.tok.ln, file, logs: [] };
      const overF = field(4, 'overwritten');
      g.overwritten = scalar(overF.tok, overF.value);
      // The date is not a selector — the list below still is. It is the FRONTIER a log must
      // post-date to count as a walk of the build that exists now, which is what makes an
      // unlisted pre-overwrite log a finding instead of a silent green.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(g.overwritten))
        perr(overF.tok, `'overwritten: ${g.overwritten}' is not a YYYY-MM-DD date — it is the day the ` +
          `replacement build landed, and every log walked on or before it owes a disposition`);
      const rulingF = field(4, 'ruling');
      g.ruling = scalar(rulingF.tok, rulingF.value);
      if (!g.ruling.trim()) perr(rulingF.tok, "'ruling:' must name the decision that overwrote the build");
      const reasonF = field(4, 'reason');
      g.reason = scalar(reasonF.tok, reasonF.value);
      readLogs(g, buildF.tok);
      superseded.push(g);
    }
    if (!superseded.length) perr(sp.tok, "'superseded:' names no group");
  };

  while (peek() && peek().indent === 0) {
    const tok = peek();
    if (tok.text.startsWith('frozen:')) readFrozen();
    else if (tok.text.startsWith('superseded:')) readSuperseded();
    else perr(tok, `unexpected section '${tok.text}' — walklog-disposition/1 has two: 'frozen:' ` +
      `(logs recorded under an id scheme a decision retired) and 'superseded:' (logs walked on a ` +
      `mockup build an overwrite replaced)`);
  }
  if (peek()) perr(peek(), `unexpected content: ${peek().text}`);
  if (!frozen.length && !superseded.length) die(`${file}: no frozen and no superseded groups`);
  return { system, groups: frozen, superseded, file };
}

// auto-discovery: a `walklog-disposition.yaml` sitting next to any supplied log applies to that
// directory (dedup by resolved dir). Returns:
//   disposed   absolute log path -> { kind: 'frozen' | 'superseded', … }
//   overwrites directory -> the LATEST overwrite declared there { build, overwritten, ruling, at }
//              — the frontier every undisposed log AT OR BELOW that directory must post-date
//              (#1223). Below it too, because moving a log into `_ungefuehrt/` is exactly the
//              way a set gets retired invisibly, and the frontier is the thing that says no.
function loadWalklogDispositions(logFiles) {
  const seen = new Set();
  const disposed = new Map();
  const overwrites = new Map();
  for (const f of logFiles) {
    const dir = dirname(f);
    if (seen.has(dir)) continue;
    seen.add(dir);
    const cand = join(dir, 'walklog-disposition.yaml');
    if (!existsSync(cand)) continue;
    const { groups, superseded } = parseWalklogDispositionFile(cand);
    const place = (g, entry) => {
      for (const l of g.logs) {
        const abs = join(dir, l.name);
        // A path naming no log on disk describes nothing — a typo, or a sidecar left behind
        // after the logs moved. A log named twice is an authoring error, not a merge.
        if (!existsSync(abs))
          die(`${cand}:${l.ln}: disposed log '${l.name}' does not exist next to this sidecar`);
        if (disposed.has(abs))
          die(`${cand}:${l.ln}: '${l.name}' is dispositioned twice`);
        disposed.set(abs, { ...entry, at: cand });
      }
    };
    for (const g of groups)
      place(g, { kind: 'frozen', scheme: g.scheme, ruling: g.ruling, reason: g.reason });
    for (const g of superseded)
      place(g, { kind: 'superseded', build: g.build, overwritten: g.overwritten, ruling: g.ruling, reason: g.reason });
    for (const g of superseded) {
      const prev = overwrites.get(dir);
      if (!prev || g.overwritten > prev.overwritten)
        overwrites.set(dir, { build: g.build, overwritten: g.overwritten, ruling: g.ruling, at: cand });
    }
  }
  return { disposed, overwrites };
}

// the nearest declared overwrite at or above a log's directory: a log moved DOWN into a folder
// (`_ungefuehrt/`, `_archiv/`) is still under the frontier, so retiring by location cannot hide
// it — it is refused for carrying no disposition, which is the whole point (#1223).
function overwriteOver(overwrites, dir) {
  for (let d = dir; ; ) {
    const hit = overwrites.get(d);
    if (hit) return hit;
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
}

function collectWalklogs(args) {
  const files = [];
  const walkDir = (p) => {
    for (const e of readdirSync(p).sort()) {
      const f = join(p, e);
      if (statSync(f).isDirectory()) walkDir(f);
      else if (e.endsWith('.walklog.json')) files.push(f);
    }
  };
  for (const a of args) {
    if (!existsSync(a)) die(`not found: ${a}`);
    if (statSync(a).isDirectory()) walkDir(a);
    else files.push(a);
  }
  if (!files.length) die('replay found no walkthrough logs (*.walklog.json)');
  return files;
}

const branchesEqual = (a, b) =>
  a.length === b.length && a.every((x, i) => x.gateway === b[i].gateway && x.taken === b[i].taken);

// one walked flow vs one path's step cycle: exact-next advance; a re-occurrence of an
// EARLIER step is a loop iteration (re-entry); a later/unknown step is drift. Green
// requires the high-water cursor to have consumed every modeled step (remaining = 0).
function walkSteps(pathOps, logOps) {
  let cursor = 0, maxReached = 0;
  for (let i = 0; i < logOps.length; i++) {
    const op = logOps[i];
    if (cursor < pathOps.length && pathOps[cursor] === op) {
      cursor++;
      if (cursor > maxReached) maxReached = cursor;
      continue;
    }
    const j = pathOps.slice(0, cursor).lastIndexOf(op);
    if (j >= 0) { cursor = j + 1; continue; }          // loop re-entry
    return { ok: false, why: `step ${i + 1} invokes '${op}' but the path expects '${pathOps[cursor] ?? '(walk complete)'}'` };
  }
  if (maxReached < pathOps.length)
    return { ok: false, why: `walk ended with modeled step(s) remaining: ${pathOps.slice(maxReached).join(', ')}` };
  return { ok: true };
}

// -----------------------------------------------------------------------------------
// Walk identity against the map's `flow` graphs (#852). The covering `paths` are
// REPRESENTATIVES of an enumeration choice — stable only while the generator's traversal
// is — so membership in them is not identity: a generator change could orphan approved
// walkthrough evidence with no design change. Identity is instead that the walk's own
// branch combination derives a walk of the pool decision graph (honoring the ratified
// feasibility constraints embedded in the map); the covering set stays what it is — the
// capture work list and the gate's coverage universe.
// -----------------------------------------------------------------------------------

// Follow `decisions` (ordered {gateway, taken}) through one pool graph from one root —
// the pinned-decision twin of enumeratePaths: same onPath loop rule, same step
// collection, same terminal outcomes. Returns the derived walk or why it fails; a
// failure is a REAL divergence from the flow (that is the point — enumeration choices
// cannot appear here).
function deriveWalk(nodes, rootIdx, decisions, cons) {
  const onPath = new Set();
  const steps = [];
  const edges = [];
  let i = rootIdx, k = 0;
  const fail = (why) => ({ ok: false, why, progress: k });
  const terminal = (outcome) => {
    if (k < decisions.length) {
      const d = decisions[k];
      return fail(`the walk decides ${decisions.length - k} more branch(es) than the flow reaches — next: "${d.gateway}"->"${d.taken}"`);
    }
    return { ok: true, steps, outcome, edges, root: rootIdx };
  };
  for (;;) {
    const n = nodes[i];
    if (n.k === 'end') return terminal({ kind: 'end', label: n.label });
    if (n.k === 'goto') {
      if (onPath.has(n.to)) return terminal({ kind: 'loop', backTo: n.backTo, label: n.label });
      i = n.to;
      continue;
    }
    if (n.k === 'gw') {
      const d = decisions[k];
      if (!d) return fail(`the flow reaches gateway "${n.gateway}" but the walk decides nothing there`);
      if (d.gateway !== n.gateway)
        return fail(`the walk's next decision is "${d.gateway}"->"${d.taken}" but the flow reaches gateway "${n.gateway}"`);
      const e = n.out.find((o) => o.taken === d.taken);
      if (!e)
        return fail(`gateway "${n.gateway}" has no branch "${d.taken}" (has: ${n.out.map((o) => o.taken).join(', ')})`);
      if (cons) {
        const c = cons.find((x) => infeasibleEdge([x], n.gateway, d.taken, decisions.slice(0, k)));
        if (c) return fail(`branch "${n.gateway}"->"${d.taken}" is ruled infeasible here by a ratified constraint (${c.rationale})`);
      }
      edges.push({ node: i, gateway: n.gateway, taken: d.taken });
      onPath.add(i); k++; i = e.to;
      continue;
    }
    // start / step
    for (const s of n.steps ?? []) steps.push(s);
    onPath.add(i);
    if (n.to == null) return terminal({ kind: 'dangling' });
    i = n.to;
  }
}

const outcomesMatch = (a, b) => a.kind === b.kind && (a.label ?? null) === (b.label ?? null);

// Match one walked flow (branches + operation sequence + outcome) against a process's
// flow graphs: try every root of every pool. Success returns the derived walk plus its
// (pool, root, edges) attribution — the gate's coverage currency. Failure distinguishes
// the identity axis (no root derives the branches) from the steps axis (some root does,
// but the operation sequence or outcome diverges), preserving the finding taxonomy.
function matchFlow(flow, branches, logOps, outcome) {
  let bestWhy = null, bestProgress = -1, stepsWhy = null;
  for (const pool of flow.pools) {
    for (const root of pool.roots) {
      const w = deriveWalk(pool.nodes, root, branches, flow.constraints);
      if (!w.ok) {
        if (w.progress > bestProgress) { bestProgress = w.progress; bestWhy = w.why; }
        continue;
      }
      // logOps === null: IDENTITY ONLY. A frozen log (ADR-069 §9) names ids of a retired
      // scheme in its steps, so the step sequence cannot be matched — but its branch identity
      // is gateway and branch LABELS, which no id scheme touches. The walk still witnesses the
      // graph, which is what the gate's coverage is counted on.
      if (logOps !== null) {
        const s = walkSteps(w.steps.map((x) => x.operation), logOps);
        if (!s.ok) { stepsWhy ??= s.why; continue; }
      }
      if (outcome && !outcomesMatch(outcome, w.outcome)) {
        stepsWhy ??= `outcome '${outcome.kind}/${outcome.label}' does not match the walk's '${w.outcome.kind}/${w.outcome.label}'`;
        continue;
      }
      return { ok: true, pool: pool.pool, walk: w };
    }
  }
  return stepsWhy != null
    ? { ok: false, axis: 'steps', why: stepsWhy }
    : { ok: false, axis: 'identity', why: bestWhy ?? 'the process flow emits no walkable pool' };
}

function replayCmd(mapFile, logPaths, gate) {
  if (!existsSync(mapFile)) die(`map not found: ${mapFile}`);
  let map;
  try { map = JSON.parse(readFileSync(mapFile, 'utf8')); } catch (e) { die(`${mapFile}: not valid JSON (${e.message})`); }
  if (map.format !== 'seqmap/1') die(`${mapFile} is not a seqmap/1 file (format: ${map.format ?? 'missing'})`);
  if (map.binding) die(`${mapFile} carries a 'binding: ${map.binding}' discriminator — that field is retired ` +
    `(ADR-066: ids are minted at Mockup, so a Mockup map and a Design map key on the same ids). Regenerate the map.`);

  const procByBp = new Map();
  for (const p of map.processes ?? []) procByBp.set(p.bp, p);
  // #1243 — the map now records the sources it left out. A walk of a process that has since
  // been parked is not a broken map: the walk happened, and the process it walked was taken
  // out of the live inventory afterwards. Without this it fails as "BP07 is not in the map",
  // which reads as corruption and sends the reader looking for a regeneration bug.
  const nonLiveByBp = new Map();
  for (const n of map.nonLive ?? []) nonLiveByBp.set(n.bp, n);
  const legacyBps = [...procByBp.values()].filter((p) => (p.paths ?? []).length && !p.flow);
  if (legacyBps.length)
    warn(`${mapFile} carries no flow section for ${legacyBps.map((p) => p.bp).join(', ')} (pre-#852 map) — ` +
         `falling back to covering-set membership identity there; regenerate the map`);

  const problems = [];
  const E = (msg) => problems.push(msg);
  let green = 0, rework = 0;
  const covered = new Set();                            // legacy: `${bp}:${path.id}` matched by a green log
  const walked = new Map();                             // bp -> green attributions [{pool, root, edges}] (#852)
  const attribute = (bp, att) => { (walked.get(bp) ?? walked.set(bp, []).get(bp)).push(att); };
  // Same discipline as a frozen or superseded log: withdrawn, never silently. The process is
  // out of the live inventory, so it owes no coverage and its walk proves nothing about what
  // is being built — it counts as neither replay nor approval evidence.
  const noticeNonLive = (at, n) => process.stderr.write(
    `seqmap replay: notice: ${at} walked ${n.bp} (${n.name}), which the map records as ` +
    `${n.status.state}${n.status.successor ? ` -> ${n.status.successor}` : ''} — the process is out ` +
    `of the live inventory, so the walk counts as neither replay nor approval evidence\n`);

  const logFiles = collectWalklogs(logPaths);
  // ADR-069 §9: logs recorded under a RETIRED id scheme are frozen — byte-identical, withdrawn
  // from replay only. Never silently: a quietly reduced regression reads as a green one.
  const { disposed, overwrites } = loadWalklogDispositions(logFiles);
  let frozenCount = 0, supersededCount = 0, nonLiveCount = 0;

  for (const f of logFiles) {
    const at = basename(f);
    const froze = disposed.get(f);
    // #1223 — the mockup this walk was performed on was OVERWRITTEN. Unlike a frozen log, this
    // one is withdrawn from approval too: the walked artefact no longer exists, so the walk
    // witnesses nothing about the build that does. Never silent, same as frozen.
    if (froze && froze.kind === 'superseded') {
      supersededCount++;
      process.stderr.write(
        `seqmap replay: notice: ${at} is SUPERSEDED (build '${froze.build}' overwritten ` +
        `${froze.overwritten}, ${froze.ruling}) — the build it walked was replaced, so it counts ` +
        `as neither replay nor approval evidence [${basename(froze.at)}]\n`);
      continue;
    }
    if (froze) {
      frozenCount++;
      process.stderr.write(
        `seqmap replay: notice: ${at} is FROZEN (scheme '${froze.scheme}', ${froze.ruling}) — ` +
        `steps not replayed, branch identity still counted as approval evidence ` +
        `[${basename(froze.at)}]\n`);
      // "Frozen means excluded from replay, NOT excluded from approval" (ADR-069 §9). The walk
      // happened; what is withdrawn is the mechanical re-verification of its STEPS, whose ids
      // belong to a retired scheme. Its branch identity is label-based and still checked, so a
      // business-design changeloop that orphans the evidence is still a finding (#598).
      let flog;
      try { flog = JSON.parse(readFileSync(f, 'utf8')); }
      catch (e) { E(`[format] ${at}: not valid JSON (${e.message})`); continue; }
      const fstatus = flog.approval && flog.approval.status;
      if (fstatus === 'rework') { rework++; continue; }
      if (fstatus !== 'approved') { E(`[format] ${at}: frozen log's approval.status '${fstatus}' is not approved|rework`); continue; }
      const fnl = nonLiveByBp.get(flog.bp);
      if (fnl) { nonLiveCount++; noticeNonLive(at, fnl); continue; }
      const fproc = procByBp.get(flog.bp);
      if (!fproc) { E(`[identity] ${at}: frozen log's BP '${flog.bp}' is not in the map`); continue; }
      if (fproc.flow) {
        const fm = matchFlow(fproc.flow, flog.branches ?? [], null, null);
        if (!fm.ok) {
          const b = (flog.branches ?? []).map((x) => `"${x.gateway}"->"${x.taken}"`).join(', ') || '(none)';
          E(`[identity] ${at}: frozen log's branch identity no longer derives a walk of the ${flog.bp} flow — ` +
            `${fm.why} (branches: ${b}). Freezing withdraws the STEPS from replay, never the branch identity.`);
          continue;
        }
        attribute(flog.bp, { pool: fm.pool, walk: fm.walk });
      }
      continue;
    }
    let log;
    try { log = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { E(`[format] ${at}: not valid JSON (${e.message})`); continue; }
    if (log.format !== 'walklog/1') { E(`[format] ${at}: format is '${log.format ?? 'missing'}', expected 'walklog/1'`); continue; }

    // #1223 — a walk of a build that was overwritten is not a walk of the build that exists.
    // The `superseded:` list is explicit and closed; this is the check that it is also COMPLETE,
    // so an unmarked pre-overwrite log is refused instead of silently counted green. The frontier
    // is the overwrite date declared in the sidecar, never a folder the log was moved into.
    const ov = overwriteOver(overwrites, dirname(f));
    if (ov) {
      const walked = log.session && log.session.date;
      if (!walked || String(walked) <= ov.overwritten) {
        E(`[disposition] ${at}: ` +
          (walked ? `walked ${walked}, on or before ` : 'carries no session.date, so it cannot be shown to post-date ') +
          `the '${ov.build}' mockup overwrite of ${ov.overwritten}, and it carries no disposition — ` +
          `a walk of a build that was replaced is evidence about nothing the project still has ` +
          `(${ov.ruling}). Either name it in a 'superseded:' group of ${basename(ov.at)} (the file ` +
          `stays byte-identical and exactly where it is — disposition is data, not location), or ` +
          `re-walk the branch on the current build.`);
        continue;
      }
    }
    if (log.candidate !== true) E(`[format] ${at}: 'candidate' must be true unconditionally (walklog/1)`);
    const status = log.approval && log.approval.status;
    if (status === 'rework') { rework++; process.stderr.write(`seqmap replay: notice: ${at} is a rework log — the work list, skipped\n`); continue; }
    if (status !== 'approved') { E(`[format] ${at}: approval.status '${status}' is not approved|rework`); continue; }

    // approval integrity: an approved branch means every step and the outcome confirmed
    for (const [i, s] of (log.steps ?? []).entries())
      if (s.confirmed !== true) E(`[integrity] ${at}: claims approval but step ${i + 1} ('${s.operation}') is not confirmed`);
    if (!log.outcome || log.outcome.confirmed !== true) E(`[integrity] ${at}: claims approval but the outcome is not confirmed`);

    // No translation: a walk recorded at Mockup names the same ids the map does, for the life
    // of the project (ADR-066). A log still carrying the retired `binding:` discriminator, or a
    // retired provisional operation id, is a pre-ADR-066 artifact and says so.
    if (log.binding)
      E(`[format] ${at}: carries a retired 'binding: ${log.binding}' field — walklog ids are minted ` +
        `ids at every stage (ADR-066); delete the field`);
    const logOps = (log.steps ?? []).map((s) => s.operation);
    const retired = logOps.filter((op) => SI_RETIRED_PROV_RE.test(op));
    if (retired.length) { E(`[format] ${retiredProvisional(retired[0], at)}`); continue; }

    // replay identity: bp + branches, judged against the process's FLOW graph — the walk
    // witnesses the graph, not the enumerator's covering-set choices (#852). Path ids are
    // positional and never matched; pre-#852 maps fall back to covering-set membership.
    const nl = nonLiveByBp.get(log.bp);
    if (nl) { nonLiveCount++; noticeNonLive(at, nl); continue; }
    const proc = procByBp.get(log.bp);
    if (!proc) { E(`[identity] ${at}: BP '${log.bp}' is not in the map`); continue; }
    if (proc.flow) {
      const m = matchFlow(proc.flow, log.branches ?? [], logOps, log.outcome);
      if (!m.ok) {
        if (m.axis === 'identity') {
          const b = (log.branches ?? []).map((x) => `"${x.gateway}"->"${x.taken}"`).join(', ') || '(none)';
          E(`[identity] ${at}: the walk's branch identity no longer derives a walk of the ${log.bp} flow — ${m.why} (branches: ${b})`);
        } else {
          E(`[steps] ${at}: the branch identity holds but no flow walk replays this log — ${m.why}`);
        }
        continue;
      }
      green++;
      attribute(log.bp, { pool: m.pool, walk: m.walk });
      continue;
    }
    const candidates = (proc.paths ?? []).filter((p) => branchesEqual(p.branches ?? [], log.branches ?? []));
    if (!candidates.length) {
      const b = (log.branches ?? []).map((x) => `"${x.gateway}"->"${x.taken}"`).join(', ') || '(none)';
      E(`[identity] ${at}: no ${log.bp} path with this branch identity exists in the map — branches: ${b}`);
      continue;
    }

    // step-cycle consistency + outcome, against any identity-matching candidate
    let matched = null, firstWhy = null;
    for (const p of candidates) {
      const w = walkSteps((p.steps ?? []).map((s) => s.operation), logOps);
      if (!w.ok) { firstWhy ??= w.why; continue; }
      if (log.outcome && p.outcome && !outcomesMatch(log.outcome, p.outcome)) {
        firstWhy ??= `outcome '${log.outcome.kind}/${log.outcome.label}' does not match the path's '${p.outcome.kind}/${p.outcome.label}'`;
        continue;
      }
      matched = p;
      break;
    }
    if (!matched) {
      E(`[steps] ${at}: no identity-matching path replays this walk (${candidates.length} candidate(s)) — ${firstWhy}`);
      continue;
    }
    green++;
    covered.add(`${log.bp}:${matched.id}`);
  }

  // --gate totality, enumeration-robust (#852): the covering path set defines WHAT must be
  // walked — every gateway edge and every start it exercises — but a green walk counts
  // toward that coverage whether or not it is a current representative. Each map path is
  // attributed to its (pool, root, edges) by deriving it through its own flow; a path that
  // does not derive means the committed map and its flow disagree (hand-edit or corruption).
  let edgeStats = null;
  if (gate) {
    edgeStats = { edges: 0, edgesCovered: 0, starts: 0, startsCovered: 0, startsNotHuman: 0 };
    for (const p of map.processes ?? []) {
      if (!p.flow) {
        for (const path of p.paths ?? [])
          if (!covered.has(`${p.bp}:${path.id}`)) {
            const b = (path.branches ?? []).map((x) => `"${x.gateway}"->"${x.taken}"`).join(', ') || '(none)';
            E(`[coverage] GATE: ${p.bp} ${path.id} has no green approved walkthrough — branches: ${b}`);
          }
        continue;
      }
      const needEdges = new Map();                      // `${pool}\0${node}\0${taken}` -> display
      const needStarts = new Map();                     // `${pool}\0${root}` -> display
      for (const path of p.paths ?? []) {
        const m = matchFlow(p.flow, path.branches ?? [], (path.steps ?? []).map((s) => s.operation), path.outcome);
        if (!m.ok)
          die(`${mapFile}: ${p.bp} ${path.id} does not derive from the map's own flow (${m.why}) — the map is inconsistent, regenerate it`);
        const flowPool = p.flow.pools.find((x) => x.pool === m.pool);
        const startNode = flowPool.nodes[m.walk.root];
        // #1167 — a typed pool's start is recorded for what it IS, never as an implied human
        // walk: a scheduler start is the clock's act (the mockup may fire it deliberately and
        // log it honestly as the scheduler's), a process pool's start is a continuation of the
        // named process. Coverage is still owed — the gap message just stops demanding a walk
        // no person can perform.
        const ini = flowPool.initiator;
        const startLabel = !ini ? `start "${startNode.label}" (pool "${m.pool}")`
          : ini.kind === 'scheduler'
            ? `scheduler start "${startNode.label}" (scheduler pool "${m.pool}" — the scheduler's act, not a human walk)`
            : `continuation start "${startNode.label}" (hand-over from ${ini.process}, pool "${m.pool}")`;
        needStarts.set(`${m.pool}\u0000${m.walk.root}`, { label: startLabel, kind: ini ? ini.kind : 'human' });
        for (const e of m.walk.edges)
          needEdges.set(`${m.pool}\u0000${e.node}\u0000${e.taken}`, `branch "${e.gateway}"->"${e.taken}" (pool "${m.pool}")`);
      }
      const haveEdges = new Set(), haveStarts = new Set();
      for (const att of walked.get(p.bp) ?? []) {
        haveStarts.add(`${att.pool}\u0000${att.walk.root}`);
        for (const e of att.walk.edges) haveEdges.add(`${att.pool}\u0000${e.node}\u0000${e.taken}`);
      }
      for (const [k, { label, kind }] of needStarts) {
        edgeStats.starts++;
        if (kind !== 'human') edgeStats.startsNotHuman++;
        if (haveStarts.has(k)) edgeStats.startsCovered++;
        else E(`[coverage] GATE: ${p.bp} ${label} has no green approved walkthrough`);
      }
      for (const [k, label] of needEdges) {
        edgeStats.edges++;
        if (haveEdges.has(k)) edgeStats.edgesCovered++;
        else E(`[coverage] GATE: ${p.bp} ${label} has no green approved walkthrough`);
      }
    }
  }

  if (problems.length) {
    for (const msg of problems) process.stderr.write('seqmap replay: ' + msg + '\n');
    die(`${problems.length} replay finding(s) — the walked business design and the map disagree (Gate-2 regression, ADR-040 §3 / #410)`);
  }
  const coverage = gate
    ? edgeStats.edges + edgeStats.starts
      ? `, coverage ${edgeStats.edgesCovered}/${edgeStats.edges} branch edge(s) + ${edgeStats.startsCovered}/${edgeStats.starts} start(s)` +
        (edgeStats.startsNotHuman ? ` (${edgeStats.startsNotHuman} not human: scheduler/continuation, #1167)` : '') + ' — gate clear'
      : ', coverage complete — gate clear'
    : '';
  process.stdout.write(
    `seqmap replay: ${green} approved log(s) green` +
    (rework ? `, ${rework} rework skipped` : '') +
    // Never silent: a regression reduced by a disposition must say so in its own verdict line,
    // or a shrunken suite reads as a green one (ADR-069 §9).
    (frozenCount ? `, ${frozenCount} frozen (steps not replayed, branch identity counted)` : '') +
    (supersededCount ? `, ${supersededCount} superseded (walked build overwritten, not counted)` : '') +
    (nonLiveCount ? `, ${nonLiveCount} of non-live process(es) (not counted)` : '') +
    coverage + '\n');
}

// ===================================================================================
//  SI-DOCS — the SI markdown <-> model reconciliation (#346)
//
//  `complete` joins the .bpd sources x the binding map x the model, and the SI MARKDOWNS
//  — `docs/02_Business/02_System-Interactions/<BP>/SIxx.yy_Name.md`, the human-facing
//  System Interaction documents — are in none of the three. Their only consumers RENDER
//  them (the Design Book, the gate-dossier review surface); nobody ever asked whether the
//  set matches the model. So a document describing an interaction the model does not have,
//  or a use case nobody wrote up, was caught only indirectly through the .bpd.
//
//  It is a COMMAND of its own rather than a further `complete` [C..] code for the second
//  half of #346: the join needs nothing but the SI filenames and the model, and must not be
//  reachable only through a gate that refuses to run without .bpd sources — a project whose
//  business design arrived as documents, or a brownfield model, has no .bpd set at all.
//
//  Direction is carried in the messages: docs lead, the model follows
//  (design-artifact-conventions, "Source-of-truth ordering").
// ===================================================================================

// The SI-document filename shape (design-artifact-conventions rules 3/5): `SIaa.bb_Name.md`,
// plus the retired `BPxx-SIaa.bb_Name.md` so a project that still carries one gets [D1] rather
// than a silent skip. Matched POSITIVELY, the rule book-build.mjs already applies (#1081): not
// every .md in an SI folder is a System Interaction — a dissolved process leaves a companion
// note behind — and a companion document is skipped, never reported as a malformed SI.
const SI_DOC_RE = /^(?:BP\d+-)?SI\d+\.\d+_.*\.md$/;

// THE SECOND DOCUMENT CLASS (#1359): the GENERATED ADR-069 call-site export, `BPxx.yy_Name.md`.
// It is keyed by the drawn CALL SITE, not by the minted System-Interaction id, because the export
// projects a block and a block belongs to the one process that drew it (ADR-069 §5). So it carries
// no SI id to join on, by design — `BPxx.yy.json` holds format, generated, callSite, name,
// speaking, hash and definition, and nothing else — and the ONLY place the join lives is the
// binding map's `callSites:` list. That is why `--binding` is what teaches this command the class.
//
// A project may legitimately run ONE class, the OTHER, or both. Retiring the hand-written class in
// favour of the generated export is a supported end state of the golden process (the export is then
// the whole written surface of the interaction), which is why the empty-set guard below refuses an
// empty read of BOTH classes rather than of the hand-written class alone.
const CALLSITE_DOC_RE = /^(BP\d+\.\d+)_(.*)\.md$/;

function collectSiDocs(paths) {
  const docs = [];          // class 1 — hand-written, keyed by minted SI id
  const siteDocs = [];      // class 2 — generated call-site export, keyed by call site
  const take = (f, base) => {
    if (SI_DOC_RE.test(base)) { docs.push({ file: f, base }); return true; }
    const m = base.match(CALLSITE_DOC_RE);
    if (m) { siteDocs.push({ file: f, base, callSite: m[1], name: m[2] }); return true; }
    return false;
  };
  const walk = (dir) => {
    for (const e of readdirSync(dir).sort()) {
      const f = join(dir, e);
      if (statSync(f).isDirectory()) walk(f);
      else take(f, e);
    }
  };
  for (const p of paths) {
    if (!existsSync(p)) die(`not found: ${p}`);
    if (statSync(p).isDirectory()) walk(p);
    else if (!take(p, basename(p)))
      die(`${p}: not an SI document filename — a hand-written SIxx.yy_Name.md or a generated ` +
          `call-site export BPxx.yy_Name.md (ADR-069 §5)`);
  }
  return { docs, siteDocs };
}

function siDocsCmd(paths, modelFile, bindingFile) {
  const problems = [];
  const notes = [];
  const E = (msg) => problems.push(msg);
  const N = (msg) => notes.push(msg);
  const where = paths.join(', ');

  const { docs, siteDocs } = collectSiDocs(paths);
  // A green over an empty read would say "the documents match the model" on the strength of
  // having read nothing — the failure mode that let the generated map sit stale (#598). Refuse
  // instead (ADR-049 section 8a: refuse, do not thin). BOTH classes have to be empty (#1359): a
  // project that retired the hand-written class still has a written surface, and refusing there
  // would kill the check on a tree that is in exactly the state the golden process asked for.
  if (!docs.length && !siteDocs.length)
    die(`no SI document found under ${where} — neither a hand-written SIxx.yy_Name.md nor a ` +
        `generated call-site export BPxx.yy_Name.md (ADR-069 §5). Reconciling nothing is not a green`);
  const model = loadModel(modelFile);
  if (!model.useCases.length)
    die(`${modelFile}: the model carries no use cases — nothing to reconcile ` +
        `${docs.length + siteDocs.length} SI document(s) against`);

  // ---- the document side, keyed by bound id ----
  const byId = new Map();
  for (const d of docs) {
    if (/^BP\d+-/.test(d.base)) {
      E(`[D1] ${d.file}: the filename still carries a retired PROVISIONAL id — a System Interaction's ` +
        `id is minted once at Mockup (ADR-066, #1181), so this document joins nothing. Rename it to ` +
        `its minted SIxx.yy_Name.md (git mv; design-artifact-conventions rule 5)`);
      continue;
    }
    const m = d.base.match(/^(SI\d+\.\d+)_(.*)\.md$/);
    if (!SI_ID_RE.test(m[1])) {
      E(`[D1] ${d.file}: id '${m[1]}' is not SIxx.yy-shaped (design-artifact-conventions rule 3)`);
      continue;
    }
    const prev = byId.get(m[1]);
    if (prev) {
      E(`[D2] ${d.file}: ${m[1]} is also documented by ${prev.file} — one id, one artifact ` +
        `(design-artifact-conventions rule 1); a reuse is REFERENCED from the second BP, not copied`);
      continue;
    }
    byId.set(m[1], { file: d.file, name: m[2] });
  }

  // ---- the second document class, keyed through the binding map (#1359) ----
  // A generated call-site export carries no SI id, so it can only ever SATISFY the [D4] leg: it
  // raises no finding of its own, and that is deliberate, not an omission.
  //   * no [D2] — MANY call sites resolving to ONE interaction is the normal case (ADR-069 §8),
  //     not a duplicated artifact;
  //   * no [D5] — the export is named after the drawn BLOCK, and a block's name is legitimately
  //     not the interaction's name (figaro draws `BP06.01_RankDebtorCandidates` and
  //     `BP12.01_RankDebtorCandidates` onto one interaction);
  //   * no [D3] — a binding row naming an interaction the model lacks is `complete`'s [C9], which
  //     owns the binding map; this command must not report the same fact under a second id.
  const exportedBySi = new Map();      // si -> [call-site doc, …]
  const siteDocsUnbound = [];
  if (bindingFile) {
    const binding = parseBindingFile(bindingFile);
    const siByCallSite = new Map(binding.callSites.map((r) => [r.callSite, r.si]));
    for (const s of siteDocs) {
      const si = siByCallSite.get(s.callSite);
      if (!si) { siteDocsUnbound.push(s); continue; }
      if (!exportedBySi.has(si)) exportedBySi.set(si, []);
      exportedBySi.get(si).push(s);
    }
    // never a silent skip (#1210): an export nothing resolves is counted and named
    if (siteDocsUnbound.length)
      N(`${siteDocsUnbound.length} call-site export document(s) resolve to no interaction — ` +
        `${bindingFile} has no callSites row for ${siteDocsUnbound.slice(0, 5).map((s) => s.callSite).join(', ')}` +
        `${siteDocsUnbound.length > 5 ? ', …' : ''}. Whether a drawn block may go unbound is ` +
        `\`complete\`'s [C1]/[C13] to answer; this command only records that they joined nothing`);
  } else if (siteDocs.length) {
    // The class was READ and cannot be joined. Saying so is the difference between a finding and
    // a trap: without this line a project whose written surface IS the export reads as undocumented.
    N(`${siteDocs.length} generated call-site export document(s) (BPxx.yy_Name.md) were read and ` +
      `join nothing — the export is keyed by call site and carries no SI id (ADR-069 §5), so the ` +
      `join needs \`--binding <si-binding.yaml>\`. Pass it, or [D4] below counts documents that exist`);
  }

  // ---- the model side ----
  const ucById = new Map();
  let unshaped = 0;
  for (const uc of model.useCases) {
    // a use case with no SIxx.yy id is untraceable and is `complete`'s [C9] to raise; it has
    // no id to join on here, so counting it is all this check can honestly do
    if (!SI_ID_RE.test(uc.id || '')) { unshaped++; continue; }
    ucById.set(uc.id, uc);
  }

  for (const [id, d] of [...byId].sort((a, b) => a[0].localeCompare(b[0]))) {
    const uc = ucById.get(id);
    if (!uc) {
      E(`[D3] ${d.file}: ${id} '${d.name}' has no model use case — the business design documents a ` +
        `System Interaction the model does not carry (docs lead, the model follows)`);
      continue;
    }
    if (uc.name !== d.name)
      E(`[D5] ${id}: the document names it '${d.name}' (${d.file}) but the model use case is named ` +
        `'${uc.name}' — one id, one name (design-artifact-conventions rule 3)`);
  }
  let byExport = 0;
  for (const id of [...ucById.keys()].sort()) {
    if (byId.has(id)) continue;
    // COVERED BY THE OTHER CLASS. A use case whose written surface is the generated export and
    // nothing else is documented — that is the end state the golden process allows, not a gap.
    const ex = exportedBySi.get(id);
    if (ex && ex.length) { byExport++; continue; }
    E(`[D4] model use case ${id} '${ucById.get(id).name}' has no SI document under ${where} — ` +
      `neither a hand-written SIxx.yy_Name.md nor a generated call-site export bound to it` +
      (bindingFile ? ` by ${bindingFile}` : ` (no --binding given, so no export could be joined)`) +
      ` — model beyond the written business design`);
  }

  for (const n of notes) process.stderr.write('seqmap si-docs: note: ' + n + '\n');
  if (problems.length) {
    for (const p of problems) process.stderr.write('seqmap si-docs: ' + p + '\n');
    die(`${problems.length} reconciliation finding(s) — the SI documents and the model do not describe ` +
        `the same System Interaction set (#346)`);
  }
  process.stdout.write(
    `seqmap si-docs: green — ${byId.size} SI document(s) reconciled against ${ucById.size} model use case(s)` +
    (byExport ? `, ${byExport} of them documented by a generated call-site export alone ` +
                `(${siteDocs.length} export document(s) read)` : '') +
    (unshaped ? `, ${unshaped} model use case(s) skipped (no SIxx.yy id — \`complete\`'s [C9])` : '') + '\n');
}

// ===================================================================================
//  SEQUENCE — generate the model's use-case sequence from block × binding
//  (#1182/ADR-068: the model sequence is GENERATED, never hand-authored).
//
//  Emits the `theagent2 sns mutate` command lines that realize ONE System Interaction's
//  drawn block in the model — the architect reviews the script and applies it on the
//  draft (mutations only on drafts, ADR-008; the tool never mutates anything itself).
//  The refinement check (C14/C15) then holds the result to the block.
//
//  What it derives, and from where:
//    - the box order from the si-export (drawing order; gateway branches per the
//      binding's edge declarations: a request-variant edge selects its branch for that
//      permutation, an outcome edge folds every branch's boxes into the one permutation
//      — outcome branches live below permutation granularity, as SequencePaths);
//    - each step's callee from the box's realizedBy { operation } (the caller is the
//      Manager: ADR-061 — the Manager entry body performs the internal steps and makes
//      the calls); { internal } boxes become --step-kind internal steps;
//    - system-side sends with realizedBy { operation } append as calls after the box
//      that emits them; { event } sends are noted, not modeled as steps.
//  Step 1 (the client hop) is emitted with --caller <client>/--callee <manager>; its
//  operation attachment is left as a TODO until ADR-067's SetUseCaseOperation lands
//  (#1186) — the drawn block does not name the client-facing operation.
// ===================================================================================
function sequenceCmd(files, bindingFile, modelFile, siExportsDir, callSiteId, clientName, managerName) {
  const r = runComplete(files, bindingFile, modelFile, null, null);   // structural join only
  reportWarnings(r.warnings);
  reportExemptions(r.exemptUcs);
  if (r.subset) reportProblems(r.problems, r.subset);
  // #1243 — `sequence` is a generator (it emits model mutations), so a non-live process's block
  // is refused here by NAME rather than reaching the generic "has no callSites row" below: by
  // [C13] a frozen block has no row on purpose, and that message would read as a binding
  // omission to fix instead of the lifecycle declaration it is.
  const frozen = r.historical.get(callSiteId);
  if (frozen)
    die(`sequence: call site ${callSiteId} belongs to ${frozen.bp}, whose .bpd declares status ` +
        `${frozen.state} — a non-live process's blocks are out of the live inventory and realize no ` +
        `model use case ([C13]). There is no --include-parked form of this verb: generating a ` +
        `sequence would put the frozen block into the model as a live edge, which is exactly what ` +
        `the declaration says it is not. Un-park the process at its source if it is being built.`);
  const siExports = loadSiExportsDir(siExportsDir);
  // ONE DRAWN BLOCK, one permutation's sequence, generated from that block alone (ADR-069 §3).
  // The invocation therefore names a CALL SITE, not an interaction: an interaction may be
  // resolved to by several blocks, and a union across blocks that legitimately differ has no
  // drawing order — which is the only thing a sequence can be generated from.
  const row = r.byCallSite.get(callSiteId);
  if (!row) die(`sequence: ${callSiteId} has no callSites row in ${bindingFile}`);
  const e = r.bySi.get(row.si);
  if (!e) die(`sequence: callSite ${callSiteId} resolves to ${row.si}, which has no interactions entry`);
  const siId = row.si;
  // Keyed by the CALL SITE (#1210, closing the #1196/S-018 seam) — the export projects the drawn
  // block, and this verb was already invoked by call site.
  const x = siExports.get(callSiteId);
  if (!x) die(`sequence: no si-export (${callSiteId}.json) under ${siExportsDir}`);
  const model = r.model;
  const uc = model.useCases.find((u) => u.id === siId) || null;

  const qname = (rec) => `${rec.component}.${rec.facet}.${rec.name}`;
  const resolveRef = (ref, what) => {
    const c = model.operationsByName.get(ref) || [];
    if (!c.length) die(`sequence: ${what} realizedBy operation '${ref}' resolves to no facet operation — model the operation first`);
    if (c.length > 1) die(`sequence: ${what} realizedBy operation '${ref}' is ambiguous — qualify it: ${c.map(qname).join(', ')}`);
    return c[0];
  };
  const boxByLabel = new Map(row.boxes.map((b) => [b.box, b]));
  const sendByMsg = new Map(row.sends.map((sd) => [sd.send, sd]));

  // the Manager: explicit, or derived from the existing use case's step-1 callee
  let manager = managerName || null;
  let client = clientName || null;
  if (uc) {
    for (const pm of uc.permutations)
      if (pm.steps.length) {
        const st = pm.steps[0];
        manager ||= st.calleeComponentName || null;
        client ||= st.callerComponentName || null;
      }
  }
  if (!manager) die(`sequence: cannot derive the owning Manager for ${siId} — pass --manager <Component> (the use case has no steps yet)`);
  if (!client) die(`sequence: cannot derive the Client component for ${siId} — pass --client <Component>`);

  // permutations: the row names one, OR its request-variant edges name them — exactly one of the
  // two, which [C1] has already established (ADR-069 §8). Edge -> (gateway, taken) per permutation.
  const permEdges = row.edges.filter((d) => d.realizedBy.key === 'permutation');
  const perms = row.permutation ? [row.permutation] : [...new Set(permEdges.map((d) => d.realizedBy.value))];
  if (!perms.length) die(`sequence: callSite ${callSiteId} names no permutation and its block declares no request-variant gateway edge`);
  const chosen = (perm) => {
    const take = new Map();          // gateway -> taken (this permutation's request-variant path)
    for (const d of permEdges) if (d.realizedBy.value === perm) take.set(d.gateway, d.taken);
    return take;
  };

  const out = [];
  const say = (line) => out.push(line);
  const sh = (v) => `'${String(v).replace(/'/g, `'"'"'`)}'`;
  const mutate = (kind, args) =>
    say(`theagent2 sns mutate --kind ${kind} ` + Object.entries(args).map(([k, v]) => `--${k} ${sh(v)}`).join(' '));

  say(`# GENERATED by \`seqmap sequence\` — the model sequence from block × binding (#1182/ADR-068).`);
  say(`# Review, then run on the DRAFT (mutations only on drafts). Re-runs are not idempotent:`);
  say(`# the script CREATES steps — reconcile an already-stepped use case by hand, the C14/C15`);
  say(`# refinement check judges the result either way.`);
  say(`#`);
  if (!uc) {
    say(`# ${siId} has no model use case yet:`);
    mutate('AddUseCase', { id: siId, name: e.name, category: 'core', description: `Realizes the block drawn at call site ${callSiteId} (${e.name}); generated from block × binding.` });
    say(`# (review --category; AddUseCase auto-seeds permutation 0 'Default')`);
  }
  const existingPerms = new Set((uc ? uc.permutations : []).map((pm) => pm.name));
  perms.forEach((perm, i) => {
    if (existingPerms.has(perm)) return;
    if (i === 0 && !existingPerms.size && perm !== 'Default')
      mutate('RenamePermutation', { 'use-case': siId, 'permutation-index': 0, 'new-name': perm });
    else if (!existingPerms.has(perm) && (i > 0 || existingPerms.size))
      mutate('AddPermutation', { 'use-case': siId, name: perm });
  });

  perms.forEach((perm, pi) => {
    const take = chosen(perm);
    say(`#`);
    say(`# ---- permutation ${pi}: ${perm} ----`);
    let stepIndex = 0;
    const addStep = (callee) => {
      mutate('SequenceStep', { 'use-case': siId, 'permutation-index': pi, action: 'add', caller: manager, callee: callee.component });
      mutate('AttachOperationToStep', { 'use-case': siId, 'permutation-index': pi, 'step-index': ++stepIndex, operation: qname(callee) });
    };
    const addInternal = (label) => {
      mutate('SequenceStep', { 'use-case': siId, 'permutation-index': pi, action: 'add', 'step-kind': 'internal', caller: manager, label });
      ++stepIndex;
    };
    // step 1: the client hop. Its operation is NOT attached here: since ADR-067 (#1186) the
    // use case declares it once and step 0 derives from it, so the declaration is emitted
    // ONCE below the permutations rather than per permutation.
    mutate('SequenceStep', { 'use-case': siId, 'permutation-index': pi, action: 'add', caller: client, callee: manager });
    const emitSendCalls = (sends) => {
      for (const snd of sends || []) {
        const sd = sendByMsg.get(snd.message);
        if (!sd) continue;                                  // human/blackbox send, or unbound (C14's business)
        if (sd.realizedBy.key === 'operation') addStep(resolveRef(sd.realizedBy.value, `send "${snd.message}"`));
        else say(`# send "${snd.message}" is bound { event: ${sd.realizedBy.value} } — an event hand-off, no sequence step`);
      }
    };
    const walkNodes = (nodes) => {
      for (const nd of nodes || []) {
        if (nd.kind === 'gateway') {
          const taken = take.get(nd.condition);
          if (taken !== undefined) {
            const br = nd.branches.find((b) => b.label === taken);
            if (!br) die(`sequence: ${callSiteId} edge ("${nd.condition}", "${taken}") matches no drawn branch`);
            say(`# gateway "${nd.condition}" -> "${taken}" (request-variant edge of ${perm})`);
            walkNodes(br.nodes);
          } else {
            say(`# gateway "${nd.condition}": outcome edges — every branch's boxes fold into this`);
            say(`# permutation; declare a SequencePath per branch afterwards (SQxx.yy.zz, ADR-041).`);
            for (const br of nd.branches) walkNodes(br.nodes);
          }
          continue;
        }
        if (nd.kind !== 'step') continue;
        const b = boxByLabel.get(nd.label);
        if (!b) { say(`# box "${nd.label}" is UNBOUND — bind it first (C14), skipped here`); continue; }
        if (b.realizedBy.key === 'operation') addStep(resolveRef(b.realizedBy.value, `box "${nd.label}"`));
        else if (b.realizedBy.key === 'internal') addInternal(b.realizedBy.value);
        else for (const ref of b.realizedBy.value) addStep(resolveRef(ref, `box "${nd.label}" (expands)`));
        emitSendCalls(nd.sends);
      }
    };
    // ONE definition (si-export/3): the "(as drawn in …)" header the list needed is gone with it.
    walkNodes(x.definition.nodes);
    emitSendCalls(x.definition.sends);
  });
  // ADR-067 (#1186) — the client-facing operation, declared ONCE for the whole use case.
  // The drawn block does not name it (a business process says what happens, not which
  // C# operation a client calls), so this is the one line a human fills in — and filling
  // it in once is the point: before the hoist it was N attachments, one per permutation,
  // that nothing required to agree.
  say(`#`);
  if (!uc || !uc.operationId) {
    say(`# TODO: declare the client-facing operation of ${siId} — the block does not name it.`);
    mutate('SetUseCaseOperation', { 'use-case-ref': siId, operation: '<Component.Facet.Operation>' });
  } else {
    say(`# ${siId} already declares its operation (${uc.operationRef || uc.operationId}) — nothing to do.`);
  }
  process.stdout.write(out.join('\n') + '\n');
  process.stderr.write(`seqmap: sequence script for ${callSiteId} -> ${siId} — ${perms.length} permutation(s); review, then apply on the draft\n`);
}

// ===================================================================================
//  UNUSED — "what does nothing reach": reachability from the drawn business design.
//
//  [C9] already asks half of this question, at PERMUTATION level, and it is dangerous
//  alone: on the conducted run this was measured against it flagged four permutations and
//  all four were drawn. Reference counting is worse than useless in the same population:
//  a pointer FROM A DEAD BRANCH is still a pointer, and 100 of those 102 operations had one.
//
//  So the question is asked as REACHABILITY FROM A DRAWN ENTRY: a drawn call site -> the
//  interaction and permutation it resolves to -> that permutation's sequence steps.
//  Everything outside that walk is a candidate, and A CANDIDATE IS A RED FINDING, NEVER A
//  DELETION INSTRUCTION (Software Architect, 2026-09-04). This command prints; it never
//  mutates, and it never reads prose — a justification written into a description does not
//  silence it. The intent inputs are the lifecycles the model already carries and the
//  component's LAYER (#1242 — the Utilities layer is not a subject of this question); there is
//  no per-operation "deliberately unwired" marker, on purpose.
//
//  THE ANSWER IS DECISIVE OR THERE IS NO ANSWER (SA, 2026-09-04). Every input that would
//  leave the root set incomplete is an ABORT rather than a softer mark:
//
//    * a call-site row that names no permutation — the block is drawn, but which request
//      variant it exercises is unknown, so the permutations under it can be neither
//      confirmed nor condemned;
//    * a `throw` in a live drawn block — the one step construct with NO binding form
//      (si-binding's `boxes:` has `{operation}` / `{internal}` / `{expands}` and nothing
//      for a throw, and a throw is not a `call` block either), so a chain it starts is a
//      root nothing can name. It is retired for exactly this reason (bpmn-tools#54); the
//      replacement is `:task;` + `send "…" to <handle>`, whose receiving `messageStart` ->
//      `call` block yields a REAL call site the walk already follows.
//
//  With those two refused there is no "possibly reachable" tier left: a permutation is
//  DRAWN or UNDRAWN, an operation is USED, DEAD-BRANCH-ONLY or ORPHAN. An earlier cut
//  carried an UNDECIDED mark for both cases; it was an artefact of accepting a defective
//  input, and a mark that means "the tool was run too early" is not a finding.
// ===================================================================================
// seqmap-unused/2 (#1256): PARKED joined the marks. An operation reached only through the rows
// of a PARKED process (#1252 — drawn, deliberately not built, revivable) is neither USED nor a
// finding: it is asked for by a drawing nobody is building now, and it stays exactly where it is
// until that process is revived (USED) or dissolved (the finding it then is). It is reported on
// its own line and never `--check`-red; the version bump is the new value in `mark`/`state`.
// seqmap-unused/3 (#1360): a USE CASE's own `lifecycle: future|retired` (#1320) joined the
// exemptions, so `exempt` has two causes and every row now says WHICH in `exemptBy`, the
// document lists the model's tombstones under `notBuiltUseCases`, and the two exemption counts
// are reported apart. No mark changed; a consumer that read `exempt` as "the component is
// deferred" would be wrong on the new rows, which is what the version is for.
// seqmap-unused/4 (#1242): UTILITY joined the marks. An operation on a `Utilities`-layer
// component that the walk does not reach is not a candidate: the layer is not a subject of this
// question at all (see the exemption at S6), so where a finding mark would have stood the row
// reads UTILITY and carries `exemptBy: 'utilities-layer'`. The version bump is the new value in
// `mark` — a consumer that read the four-mark vocabulary as closed would be wrong on it.
const UNUSED_FORMAT = 'seqmap-unused/4';
// An operation's mark is the BEST state any root reaches it through — index into this list,
// so `Math.min` over contributions is the rollup for operations and for facets alike.
const OP_MARK = ['USED', 'PARKED', 'DEAD-BRANCH-ONLY', 'ORPHAN'];
// #1242 — NOT a rank: a mark the walk prints INSTEAD of a finding mark, for a row whose layer
// the walk cannot ask this question of. It is outside `OP_MARK` on purpose, so no `Math.min`
// rollup can ever produce it and no rank comparison can be made against it.
const UTILITY_MARK = 'UTILITY';
// Every value `mark` can carry, for the counted vocabulary. The ranks first, in rank order.
const ALL_MARKS = [...OP_MARK, UTILITY_MARK];
// A permutation's state, in the same order as the operation mark it contributes.
const PERM_STATE = ['DRAWN', 'PARKED', 'UNDRAWN'];

// #1242 — the Utilities layer, by LAYER and never by the name of the thing. SNS carries one layer
// in two spellings (the `utilities` key and the `Utilities` display value — `ModelEngine`'s
// canonicaliser accepts both and `ReadArchitecture` emits the display one), so the comparison is
// case-folded: two spellings of one fact must not become two behaviours.
const isUtilityLayer = (layer) => String(layer ?? '').toLowerCase() === 'utilities';

/** the permutations one call-site row exercises: the named one, or the ones its gateway names */
const rowPerms = (r) => (r.permutation ? [r.permutation]
  : [...new Set(r.edges.filter((e) => e.realizedBy.key === 'permutation').map((e) => e.realizedBy.value))]);

// The DTO axis (`--dtos`): transitive closure from every operation's payload across field types
// and {Base}_{Variant} relations. DTO FIELDS ARE EXPLICITLY OUT OF SCOPE — a field counts as used
// only once a rule, a resource fate or a screen model touches it, which is three more sources and
// three more ways to be wrong, and is its own brief.
// The seeds are EVERY operation's payload, not the reached set — so a Utility contract's DTOs are
// already reachable here and #1242's layer exemption needs nothing on this axis: the two questions
// are different, and this one was never asked of the drawing.
function dtoClosure(model) {
  const byId = new Map(), byName = new Map();
  for (const t of model.dtos) {
    byId.set(t.id, t);
    if (!byName.has(t.name)) byName.set(t.name, t);      // a duplicate name resolves to the first
  }
  const seen = new Set(), stack = [];
  const push = (t) => { if (t && !seen.has(t.id)) { seen.add(t.id); stack.push(t); } };
  let seeds = 0;
  for (const c of model.components)
    for (const f of c.facets)
      for (const o of f.operations)
        for (const id of [o.inputDtoId, o.outputDtoId]) {
          const t = id && byId.get(id);
          if (t && !seen.has(t.id)) { seeds++; push(t); }
        }
  while (stack.length) {
    const t = stack.pop();
    // A field type is a source-language type expression — `string`, `decimal?`, `List<OrderLine>`,
    // `OrderLine[]`. Every identifier in it is a candidate DTO name; the ones that are not DTOs
    // (primitives, enums) simply miss the index.
    for (const f of t.fields || [])
      for (const ident of String(f.type ?? '').match(/[A-Za-z_][A-Za-z0-9_]*/g) || []) push(byName.get(ident));
    // {Base}_{Variant}, both directions: a reachable base carries its variants, a reachable
    // variant carries the base it extends.
    for (const v of t.variants || []) push(byId.get(v.id) || byName.get(v.name));
    if (t.extends) push(byId.get(t.extends.id) || byName.get(t.extends.name));
  }
  const unreached = model.dtos.filter((t) => !seen.has(t.id))
    .map((t) => ({ name: t.name, classification: t.classification ?? null, fields: (t.fields || []).length }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { total: model.dtos.length, seeds, reached: seen.size, unreached };
}

function unusedCmd(files, bindingFile, modelFile, opts) {
  const binding = parseBindingFile(bindingFile);
  const model = loadModel(modelFile);
  const digests = loadAsts(files).map((ast, i) => digest(files[i], ast));
  digests.sort((a, b) => a.bpCode.localeCompare(b.bpCode));

  // ---- the preconditions, collected and reported TOGETHER ----------------------------------
  // Each of these leaves the root set incomplete or ambiguous, so none of them may be softened
  // into a mark. They are collected rather than thrown one at a time because they have different
  // owners and different remedies — a drawing edit, a binding edit, a model rename — and being
  // told about one, fixing it, and only then learning about the next is three round trips for
  // one answer. `complete` reports its findings all at once for the same reason.
  const blocked = [];
  const refuse = (what, lines, remedy) => blocked.push({ what, lines, remedy });

  // ---- S2: the universe — every (component, facet, operation) ------------------------------
  // ABORT: two operations sharing a qualified name make addressing ambiguous, and so is every
  // mark below — there would be no way to say WHICH of the two a finding is about.
  const ops = new Map();                       // operation id -> record
  const qnames = new Map();                    // qualified name -> first id
  const dupes = new Set();
  for (const c of model.components)
    for (const f of c.facets)
      for (const o of f.operations) {
        const qname = `${c.name}.${f.name}.${o.name}`;
        if (qnames.has(qname)) dupes.add(qname); else qnames.set(qname, o.id);
        ops.set(o.id, {
          qname, component: c.name, facet: f.name, operation: o.name,
          lifecycle: c.lifecycle, layer: c.layer ?? null,
          mark: OP_MARK.length - 1, via: new Set(), viaNotBuilt: new Set(),
          sites: new Set(), calls: 0,
        });
      }
  if (dupes.size)
    refuse('two operations share a qualified name, so no mark could say WHICH of the two it is about',
      [...dupes].sort(), 'Rename one operation of each pair.');

  // ---- the sources' own lifecycle declarations (.bpd header `status`) -----------------------
  // A drawn block of a process whose header declares `status dissolved|retired|parked` is out of
  // the live inventory BY THE SOURCE ITSELF (#1148): it is not a root, and it owes no binding row.
  const nonLive = new Map();                   // call-site id -> { bp, state }
  for (const d of digests) {
    if (!d.status) continue;
    for (const c of d.chains) for (const id of c.callSites) nonLive.set(id, { bp: d.bpCode, state: d.status.state });
  }
  const drawn = new Set();                     // every call site the supplied sources draw
  for (const d of digests) for (const c of d.chains) for (const id of c.callSites) drawn.add(id);

  const byCallSite = new Map();
  for (const r of binding.callSites) if (!byCallSite.has(r.callSite)) byCallSite.set(r.callSite, r);

  // ---- ABORT: a drawn call site with neither a binding row nor a `status` declaration --------
  // Neither the map nor the source says what this block is, so the root set is incomplete by an
  // unknown amount — and an incomplete root set is exactly how a reachability answer turns into a
  // wrong deletion. There is no "si: none" (ADR-069 §8).
  const undeclared = [];
  for (const d of digests)
    for (const c of d.chains)
      for (const id of c.callSites)
        if (!nonLive.has(id) && !byCallSite.has(id)) undeclared.push(`${id} (${d.file})`);
  if (undeclared.length)
    refuse(`${undeclared.length} drawn call site(s) have neither a callSites row nor a .bpd 'status' declaration`,
      [...new Set(undeclared)].sort(),
      "Add the row (which interaction it resolves to, which permutation it exercises), or declare " +
      "the process's lifecycle in its .bpd header. There is no 'si: none' (ADR-069 §8).");

  // ---- ABORT: a `throw` in a live drawn block (bpmn-tools#54) --------------------------------
  // The one step construct with no binding form. `si-export` emits it as `kind: "throw"`; ADR-068's
  // `boxes:` declaration has `{operation}` / `{internal}` / `{expands}` and nothing for it, and a
  // throw is not a `call` block, so `callSites:` cannot address it either. A chain it starts is
  // therefore a ROOT NOTHING CAN NAME, and the operations under that chain read as dead when they
  // are drawn — which is precisely how one construct put a live ResourceAccess operation on a
  // deletion list. The replacement is first-class on both halves and yields a real call site.
  const throws = [];
  for (const d of digests) {
    if (d.status) continue;                    // out of the live inventory; its blocks are not roots
    for (const c of d.chains) {
      c.sis.forEach((b, i) => {
        for (const st of allStmts(b.body))
          if (st.k === 'throw') throws.push(`${c.callSites[i]} "${st.label}" (${d.file})`);
      });
      for (const st of stmtsOutsideSi(c.stmts))
        if (st.k === 'throw') throws.push(`${d.bpCode} chain '${c.trigger.label}' "${st.label}" (${d.file})`);
    }
  }
  if (throws.length)
    refuse(`${throws.length} live drawn block(s) contain a \`throw\`, which has NO binding form — a chain ` +
      `it starts is a root nothing can name, so operations under it would read as dead while being drawn`,
      [...new Set(throws)].sort(),
      '`throw` is retired for this reason (bpmn-tools#54). Redraw each as a task plus a send —\n' +
      '      :Abgleich anstossen;\n' +
      '      send "<message>" to <handle>\n' +
      '    — whose receiving `messageStart` -> `call` block yields a real call site this walk follows.');

  const live = binding.callSites.filter((r) => !nonLive.has(r.callSite));
  // The rows `complete` keeps for a PARKED process (#1252). Not roots — nothing they name is
  // being built — but not nothing either: what only they reach is PARKED, not dead (#1256).
  const parkedRows = binding.callSites.filter((r) => nonLive.get(r.callSite)?.state === 'parked');

  // ---- ABORT: a binding row naming a permutation the model does not have --------------------
  // The map is stale against the model, and a stale map keeps an operation artificially alive or
  // artificially dead. Either way the answer is wrong, so there is no answer.
  const ucById = new Map();
  for (const uc of model.useCases) if (!ucById.has(uc.id)) ucById.set(uc.id, uc);
  const stale = [];
  for (const r of live) {
    const uc = ucById.get(r.si);
    if (!uc) {
      stale.push(`binding:${r.ln}: callSite ${r.callSite} resolves to ${r.si}, which is no model use case`);
      continue;
    }
    for (const pn of rowPerms(r))
      if (!uc.permutations.some((pm) => pm.name === pn))
        stale.push(`binding:${r.ln}: callSite ${r.callSite} names permutation '${pn}' of ${r.si} ` +
          `'${uc.name}' — the model has ${uc.permutations.length ? uc.permutations.map((p) => `'${p.name}'`).join(', ') : 'none'}`);
  }
  if (stale.length)
    refuse('the binding map is stale against the model — a stale map keeps operations artificially ' +
      'alive or artificially dead', stale,
      'Re-point the row at a permutation the model has, or add the permutation to the model.');

  // ---- ABORT: a live row that names no permutation ------------------------------------------
  // The block is drawn — its interaction is entered — but WHICH request variant it exercises is
  // unknown, so every permutation of that interaction is neither confirmed nor condemned. This is
  // `complete`'s [C1], refused here rather than reported because a reachability answer computed
  // over it is not a weaker answer, it is an unsound one. Note that such a row can be defective
  // and change no mark (when sibling rows already name every permutation) — which is why it is a
  // precondition and not a note: a precondition that only fires when it happens to alter the
  // output is not a precondition.
  const unbound = live.filter((r) => !rowPerms(r).length);
  if (unbound.length)
    refuse(`${unbound.length} live callSites row(s) name no permutation, so nothing under their ` +
      `interactions can be confirmed or condemned`,
      unbound.map((r) => `binding:${r.ln}: callSite ${r.callSite} -> ${r.si} ` +
        `(model permutations: ${(ucById.get(r.si)?.permutations || []).map((p) => p.name).join(', ') || 'none'})`),
      "Add 'permutation: {Base}_{Variant}' to the row, or a 'realizedBy: { permutation: … }' edge " +
      "per branch if the block's own control flow selects the variant (ADR-069 §8). If one drawn " +
      'box legitimately covers several variants, the drawing owes the branch — a business-design ' +
      'edit, not a binding one.');

  // ---- the single refusal ------------------------------------------------------------------
  if (blocked.length)
    die(`the answer would not be sound, so none is emitted — ${blocked.length} precondition(s) ` +
      `unmet:\n\n` + blocked.map((b, i) =>
        `  ${i + 1}. ${b.what}:\n` +
        b.lines.map((l) => `       ${l}`).join('\n') +
        `\n     -> ${b.remedy}`).join('\n\n'));

  // ---- S3: the roots — the (interaction, permutation) pairs the business design draws --------
  const roots = new Set();                     // "<si> <permutation>"
  const rowsBySi = new Map();                  // interaction id -> its live rows
  for (const r of live) {
    for (const p of rowPerms(r)) roots.add(`${r.si} ${p}`);
    if (!rowsBySi.has(r.si)) rowsBySi.set(r.si, []);
    rowsBySi.get(r.si).push(r);
  }
  const parkedRoots = new Set();               // "<si> <permutation>" a parked row asks for
  const parkedRowsBySi = new Map();
  // #1431 — a PARKED row that names no permutation asks for EVERY permutation of its interaction,
  // not for none. The live case of the same input is the abort above: the block is drawn, which
  // variant it exercises is unknown, so nothing under it can be confirmed OR CONDEMNED. Filling
  // `parkedRoots` from `rowPerms(r)` alone made a parked row of that shape yield nothing, and the
  // permutations under it then fell through to UNDRAWN — so one and the same call site marked the
  // interaction's front door PARKED (the entry leg in S4/S5 reads the ROW) and everything behind
  // it a `--check`-red DEAD-BRANCH-ONLY. Insufficient evidence refused a verdict on one branch
  // and produced a red finding on the other, over one input.
  //
  // For a parked row the missing branch is EXPECTED: the parked drawing owes it, and nobody is
  // being asked to supply it — which is exactly what PARKED means (`seqmap-unused/2`, #1252,
  // "asked for by a drawing nobody is building now"). All of its variants are equally asked for,
  // so all of them are parked roots. The live case is untouched: it still aborts, and it aborts
  // BEFORE this line.
  //
  // The parked-ness is read from the `.bpd` header's own `status` line and from nothing else —
  // `parkedRows` is filtered on `nonLive`, which S2 builds from `d.status` (#1148). No name list,
  // no directory, no per-call-site flag: two vocabularies for one fact is the drift the header
  // rule exists to prevent.
  for (const r of parkedRows) {
    const named = rowPerms(r);
    for (const p of (named.length ? named : (ucById.get(r.si)?.permutations || []).map((pm) => pm.name)))
      parkedRoots.add(`${r.si} ${p}`);
    if (!parkedRowsBySi.has(r.si)) parkedRowsBySi.set(r.si, []);
    parkedRowsBySi.get(r.si).push(r);
  }

  // ---- S4/S5: permutation state, then reachability ------------------------------------------
  // #1320 gave a USE CASE a lifecycle, and `complete` reads `future|retired` as a TOMBSTONE:
  // "a use case the design is not building is exactly what [C9]'s emptiness looks like". This is
  // the same predicate, deliberately spelled the same way, because `unused` asks the SAME
  // question of the SAME model fact one level down — and until #1360 the two checkers gave
  // opposite verdicts over it: `complete` green, naming the retired interactions exempt, while
  // `unused` reported the operations behind those very interactions as DEAD-BRANCH-ONLY. A
  // declaration one tool reads as settled and another re-raises is the drift the declaration
  // exists to end, and a reader comparing the two outputs cannot tell which is authoritative.
  const notBuilt = (uc) => uc && (uc.lifecycle === 'future' || uc.lifecycle === 'retired');
  const reach = (id, st, via, sites, viaNotBuilt) => {
    const o = ops.get(id);
    if (!o) return;
    if (st < o.mark) o.mark = st;
    o.via.add(via);
    if (viaNotBuilt) o.viaNotBuilt.add(via);
    for (const s of sites) o.sites.add(s);
  };
  const permRows = [];
  const notBuiltUcs = [];
  for (const uc of model.useCases) {
    const nb = notBuilt(uc);
    if (nb) notBuiltUcs.push({ si: uc.id, name: uc.name, lifecycle: uc.lifecycle });
    const rows = rowsBySi.get(uc.id) || [];
    // ADR-067 §1: the interaction IS the Manager entry operation, and a Manager facet is a
    // client-facing entry surface. A live call site resolving to the interaction is a Client
    // entering that operation — WHICH request variant the block selects is a question one level
    // down. The entry operation is therefore USED on the strength of the ROW, not of the step
    // list: a generated sequence need not repeat the entry hop as a step, and an interaction
    // somebody draws has its front door entered whichever variant the block picks.
    const parkedOnly = parkedRowsBySi.get(uc.id) || [];
    if (uc.operationId && rows.length)
      reach(uc.operationId, 0, `${uc.id} (entry)`, rows.map((r) => r.callSite), nb);
    else if (uc.operationId && parkedOnly.length)
      reach(uc.operationId, 1, `${uc.id} (entry, parked)`, parkedOnly.map((r) => r.callSite), nb);
    for (const pm of uc.permutations) {
      const st = roots.has(`${uc.id} ${pm.name}`) ? 0 : parkedRoots.has(`${uc.id} ${pm.name}`) ? 1 : 2;
      // A parked row that names no permutation asks for this one too (#1431), so it is one of the
      // call sites this permutation is reached from — a PARKED row whose `callSites` read `[]`
      // would print "call site(s): none" under a PARKED mark, which is the sentence that made the
      // defect look like a different bug than it was.
      const sites = [...new Set((st === 1 ? parkedOnly : rows)
        .filter((r) => rowPerms(r).includes(pm.name) || (st === 1 && !rowPerms(r).length))
        .map((r) => r.callSite))].sort();
      permRows.push({
        si: uc.id, useCase: uc.name, permutation: pm.name, state: PERM_STATE[st],
        steps: pm.steps.length, callSites: sites,
      });
      const via = `${uc.id} ${pm.name}`;
      if (uc.operationId) reach(uc.operationId, st, via, sites, nb);
      for (const s of pm.steps) {
        if (!s.operationId) continue;
        reach(s.operationId, st, via, sites, nb);
        if (st === 0 && ops.has(s.operationId)) ops.get(s.operationId).calls++;
      }
    }
  }

  // ---- S6: the marks, with the THREE exemptions the model can state -------------------------
  // `lifecycle: future` on the COMPONENT (ADR-027 §5) is one of them, and it is deliberately at
  // component level: a marker that blessed individual model elements would silence exactly the
  // findings that point at open, load-bearing gaps.
  //
  // The other is the USE CASE's own `lifecycle: future|retired` (#1320, #1360) — the same
  // declaration `seqmap complete` already honours as a tombstone. It is not a second silencer
  // with a second meaning: it silences NOTHING on its own. An operation is exempt on it only
  // when EVERY route that reaches it runs through a use case the design says it is not
  // building. One live drawn route and the operation is USED; one route from a `live` use case
  // and it is a finding, with that route named. An operation nothing reaches at all — an ORPHAN,
  // `via` empty — is never exempt: no declaration was made about it, and inferring one from an
  // emptiness is the reference-counting mistake this command exists to avoid.
  // The rank gate is not decoration: an operation a LIVE drawing reaches (rank 0) is USED, and
  // "exempt" would be a false statement about it. It happens — a retired use case with live
  // rows still has its entry operation entered — and that contradiction is `complete`'s
  // [C9-notbuilt] to report, not something to relabel here.
  //
  // The third is the COMPONENT'S LAYER (#1242). A `Utilities` component is reached by no
  // sequence step ON PURPOSE: sequences mirror Manager orchestration (ADR-031), and a
  // cross-cutting call flows through the iFX ambient context rather than as a drawn step
  // (ADR-061). The drafting checklist has stated the rule by LAYER for as long as it has
  // existed — "a step whose callee is a `Utilities` component is exempt — stated by LAYER, not
  // by the name of the thing: a call into a Utility is cross-cutting, not a descent" — and a
  // walker that exempted only `lifecycle: future` made the two statements of one fact disagree,
  // with the only green available being `lifecycle: future` on a LIVE utility, which is a lie
  // written into the one machine-readable deferral statement this walk trusts.
  //
  // So the exemption is not "utilities are used": reachability from drawn call sites is the
  // WRONG QUESTION for that layer, and the mark says so — UTILITY, never USED. Two limits keep
  // it honest, and both are the reason it is keyed on the rank:
  //   * a utility a live drawing DOES reach stays `USED` and a parked one stays `PARKED` — those
  //     are positive facts, and ADR-074 makes them reachable: a `service` Utility is a legal
  //     sequence tail (only a `library` one has no boundary to cross). Reporting UTILITY over a
  //     drawn reach would hide a true statement;
  //   * a utility whose component is already declared `lifecycle: future` keeps the exemption it
  //     had, spelled the way it was — this fix changes nothing for a component the model has
  //     already spoken about.
  const exemptCause = (o) => (o.lifecycle === 'future' ? 'component-lifecycle'
    : (o.mark > 1 && isUtilityLayer(o.layer)) ? 'utilities-layer'
    : (o.mark > 1 && o.via.size > 0 && o.via.size === o.viaNotBuilt.size) ? 'use-case-lifecycle' : null);
  // The mark and the cause are one statement, not two: a row reads UTILITY exactly when the
  // exemption that carries it is the layer's.
  const markOf = (rank, cause) => (cause === 'utilities-layer' ? UTILITY_MARK : OP_MARK[rank]);
  const opRows = [...ops.values()].map((o) => ({
    qname: o.qname, component: o.component, facet: o.facet, operation: o.operation,
    mark: markOf(o.mark, exemptCause(o)), _rank: o.mark,
    exempt: exemptCause(o) !== null, exemptBy: exemptCause(o), lifecycle: o.lifecycle ?? null,
    layer: o.layer,
    calls: o.calls, callSites: [...o.sites].sort(), via: [...o.via].sort(),
  })).sort((a, b) => a.qname.localeCompare(b.qname));

  const facetRows = [];
  for (const c of model.components)
    for (const f of c.facets) {
      // A facet is unused iff EVERY operation on it is — the rollup is the best mark it carries.
      const opRecs = f.operations.map((o) => ops.get(o.id)).filter(Boolean);
      const marks = opRecs.map((o) => o.mark);
      const rank = marks.length ? Math.min(...marks) : OP_MARK.length - 1;
      // Same rollup for the exemption: a facet is exempt when its component is deferred, when it
      // stands on the Utilities layer (#1242 — a facet on a Utilities component is never unused,
      // for the same reason its operations are not: the walk does not ask that layer), or when
      // every operation on it is itself exempt. A facet with one un-exempt candidate stays a
      // finding — the rollup never turns a partial exemption into a whole one. The layer cause
      // sits above the use-case one so a utility facet is never labelled with a tombstone
      // nobody wrote: `every(exemptCause)` would be trivially true over its own exempt operations.
      const cause = c.lifecycle === 'future' ? 'component-lifecycle'
        : (rank > 1 && isUtilityLayer(c.layer)) ? 'utilities-layer'
        : (opRecs.length > 0 && opRecs.every((o) => exemptCause(o) !== null)) ? 'use-case-lifecycle' : null;
      facetRows.push({
        qname: `${c.name}.${f.name}`, component: c.name, facet: f.name,
        mark: markOf(rank, cause), _rank: rank, exempt: cause !== null, exemptBy: cause,
        lifecycle: c.lifecycle ?? null, layer: c.layer ?? null,
        operations: f.operations.length,
      });
    }
  facetRows.sort((a, b) => a.qname.localeCompare(b.qname));

  const dtos = opts.dtos ? dtoClosure(model) : null;

  // Every candidate outside a `lifecycle: future` component is a finding, and — the aborts having
  // removed the "possibly reachable" tier — every finding is `--check`-red. There is no second,
  // softer population to explain.
  // PARKED (rank 1) is not a finding: its owner is named — the parked process that revives it.
  const findings = opRows.filter((o) => o._rank > 1 && !o.exempt);
  const parkedOps = opRows.filter((o) => o._rank === 1);

  const counts = {
    components: model.components.length,
    facets: facetRows.length,
    operations: opRows.length,
    useCases: model.useCases.length,
    permutations: permRows.length,
    callSites: binding.callSites.length,
    liveCallSites: live.length,
    // Over ALL_MARKS, not OP_MARK: a UTILITY row belongs to no rank bucket, and a mark table the
    // rows do not sum into is a table that hides a population (#1242).
    operationMarks: Object.fromEntries(ALL_MARKS.map((m) => [m, opRows.filter((o) => o.mark === m).length])),
    facetMarks: Object.fromEntries(ALL_MARKS.map((m) => [m, facetRows.filter((f) => f.mark === m).length])),
    permutationStates: Object.fromEntries(PERM_STATE.map((s) => [s, permRows.filter((p) => p.state === s).length])),
    exemptOperations: opRows.filter((o) => o.exempt).length,
    // Counted apart, because the three exemptions are three different statements by three
    // different owners: a component the design defers, a use case the design has decided about,
    // and a layer the Method says this question is not asked of.
    exemptOnComponentLifecycle: opRows.filter((o) => o.exemptBy === 'component-lifecycle').length,
    exemptOnUseCaseLifecycle: opRows.filter((o) => o.exemptBy === 'use-case-lifecycle').length,
    exemptOnUtilitiesLayer: opRows.filter((o) => o.exemptBy === 'utilities-layer').length,
  };

  if (opts.format === 'json') {
    const strip = (r) => { const { _rank, ...rest } = r; return rest; };
    const doc = {
      format: UNUSED_FORMAT,
      model: modelFile, binding: bindingFile,
      sources: digests.map((d) => d.file),
      nonLiveProcesses: digests.filter((d) => d.status).map((d) => ({ bp: d.bpCode, status: d.status.state })),
      // The model's own tombstones (#1320, #1360), listed the way `complete` lists them, so the
      // two checkers' outputs can be laid side by side over the one fact they now agree about.
      notBuiltUseCases: notBuiltUcs,
      counts,
      permutations: permRows.slice().sort((a, b) =>
        a.si.localeCompare(b.si) || a.permutation.localeCompare(b.permutation)),
      operations: opRows.map(strip),
      facets: facetRows.map(strip),
      ...(dtos ? { dtos } : {}),
      findings: findings.map((o) => o.qname),
      parked: parkedOps.map((o) => o.qname),
    };
    process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
  } else {
    const out = [];
    const P = (s) => out.push(s);
    P('seqmap unused — reachability from the drawn business design. This command PRINTS; it never mutates.');
    P('');
    P(`  model     ${modelFile}`);
    P(`            ${counts.components} components, ${counts.facets} facets, ${counts.operations} operations, ` +
      `${counts.useCases} use cases, ${counts.permutations} permutations`);
    P(`  binding   ${bindingFile}`);
    P(`            ${counts.callSites} call sites, ${counts.liveCallSites} live`);
    P(`  sources   ${digests.length} .bpd` +
      (digests.some((d) => d.status)
        ? ` — non-live: ${digests.filter((d) => d.status).map((d) => `${d.bpCode} ${d.status.state}`).join(', ')}`
        : ''));
    const rowsUndrawn = live.filter((r) => !drawn.has(r.callSite)).map((r) => r.callSite).sort();
    if (rowsUndrawn.length)
      P(`  NOTE      ${rowsUndrawn.length} binding row(s) draw nothing in the supplied sources and were ` +
        `counted as roots anyway: ${rowsUndrawn.join(', ')} — \`seqmap complete\` [C2] owns that finding`);
    P('');
    P(`PERMUTATIONS — ${PERM_STATE.map((s) => `${counts.permutationStates[s]} ${s}`).join(', ')}`);
    const oddPerms = permRows.filter((p) => p.state !== 'DRAWN')
      .sort((a, b) => a.si.localeCompare(b.si) || a.permutation.localeCompare(b.permutation));
    if (!oddPerms.length) P('  every permutation is named by a drawn call site');
    for (const p of oddPerms) {
      P(`  ${p.state.padEnd(8)}  ${p.si} ${p.permutation}`);
      // Both populations, and each row says which permutation it names — a PARKED permutation is
      // reached from a PARKED row, and listing only the live ones printed "none" under a mark
      // that had just said a drawing asks for it (#1431). A parked row that names nothing says so
      // in words rather than as an empty arrow: that emptiness IS the reason the row is here.
      const siteRows = [...(rowsBySi.get(p.si) || []), ...(p.state === 'PARKED' ? (parkedRowsBySi.get(p.si) || []) : [])];
      P(`            call site(s) on ${p.si}: ${siteRows.map((r) => `${r.callSite}->${rowPerms(r).join('/') || 'every permutation (parked, names none)'}`).join(', ') || 'none'}`);
    }
    P('');
    P(`OPERATIONS — ${ALL_MARKS.map((m) => `${counts.operationMarks[m]} ${m}`).join(', ')}` +
      (counts.exemptOperations
        ? `  (${counts.exemptOperations} exempt: ` + [
          counts.exemptOnComponentLifecycle ? `${counts.exemptOnComponentLifecycle} on a \`lifecycle: future\` component` : '',
          counts.exemptOnUseCaseLifecycle ? `${counts.exemptOnUseCaseLifecycle} reached only through a use case the model declares not built` : '',
          counts.exemptOnUtilitiesLayer ? `${counts.exemptOnUtilitiesLayer} on the \`Utilities\` layer, which no sequence step draws` : '',
        ].filter(Boolean).join(', ') + ')'
        : ''));
    // The tombstones themselves, named — the same line `seqmap complete` prints, because the two
    // checkers read the same declaration and must be readable as agreeing (#1360).
    if (notBuiltUcs.length)
      P(`  ${notBuiltUcs.length} use case(s) exempt on a model lifecycle (` +
        notBuiltUcs.map((u) => `${u.si} ${u.lifecycle}`).join(', ') +
        ') — the same declaration `seqmap complete` reads as a tombstone (#1320)');
    if (!findings.length) P('  nothing unreached outside an exemption the model states');
    for (const o of findings.slice().sort((a, b) => b._rank - a._rank || a.qname.localeCompare(b.qname))) {
      P(`  ${o.mark.padEnd(16)}  ${o.qname}`);
      P(`                    ${o.via.length ? `reached only through ${o.via.join(', ')}` : 'reached by nothing'}`);
      P('                    owner: none declared — name it (`lifecycle: future`, or an open issue), or hand it to the Software Architect');
    }
    // Printed, never hidden: an exemption nobody sees is the failure mode the [C9]
    // exemption-withdrawal names, and a Utility that vanished from the report would be a second
    // defect over the first (#1242).
    for (const o of opRows.filter((x) => x._rank > 1 && x.exempt))
      P(`  ${`EXEMPT (${o.mark})`.padEnd(16)}  ${o.qname} — ` + (o.exemptBy === 'component-lifecycle'
        ? 'its component carries `lifecycle: future`'
        : o.exemptBy === 'utilities-layer'
          ? `its component is on the \`${o.layer}\` layer — a call into a Utility is cross-cutting, ` +
            'not a descent, so no sequence step draws it and reachability is the wrong question ' +
            'here (ADR-031/ADR-061, drafting checklist item 9); not counted, not a finding'
          : `reached only through ${o.via.join(', ')}, whose use case the model declares not built ` +
            '(`lifecycle: future|retired`) — the tombstone `seqmap complete` reads (#1320)'));
    for (const o of parkedOps)
      P(`  ${'PARKED'.padEnd(16)}  ${o.qname} — reached only through ${o.via.join(', ')}: a parked drawing asks for it (#1252); not a finding, not built until that process is revived`);
    P('');
    // A facet is REACHED when any operation on it is; the exempt ones are counted apart so the
    // headline number is never quietly inflated by a deferral.
    const facetsReached = facetRows.filter((f) => f._rank === 0).length;
    const facetsExempt = facetRows.filter((f) => f._rank > 1 && f.exempt).length;
    P(`FACETS — ${facetsReached} reached, ${facetRows.length - facetsReached} not` +
      (facetsExempt ? `, of which ${facetsExempt} exempt on a lifecycle the model states or on the Utilities layer` : '') +
      ` (a facet is unused iff every operation on it is)`);
    const oddFacets = facetRows.filter((f) => f._rank > 1 && !f.exempt);
    if (!oddFacets.length) P('  every facet outside an exemption the model states carries at least one reached operation');
    for (const f of oddFacets)
      P(`  ${f.mark.padEnd(16)}  ${f.qname} — ${f.operations} operation(s), none reached`);
    for (const f of facetRows.filter((x) => x._rank === 1))
      P(`  ${'PARKED'.padEnd(16)}  ${f.qname} — every operation on it is reached only through a parked drawing`);
    for (const f of facetRows.filter((x) => x._rank > 1 && x.exempt))
      P(`  ${`EXEMPT (${f.mark})`.padEnd(16)}  ${f.qname} — ` + (f.exemptBy === 'component-lifecycle'
        ? 'its component carries `lifecycle: future`'
        : f.exemptBy === 'utilities-layer'
          ? `its component is on the \`${f.layer}\` layer — a facet on a Utilities component is never unused (#1242)`
          : 'every operation on it is reached only through a use case the model declares not built'));
    if (dtos) {
      P('');
      P(`DTOS — ${dtos.reached} of ${dtos.total} reachable from an operation payload ` +
        `(${dtos.seeds} seeds; closure over field types and {Base}_{Variant}. DTO FIELDS are out of scope)`);
      if (!dtos.unreached.length) P('  every DTO is reachable');
      for (const t of dtos.unreached)
        P(`  UNREACHED         ${t.name} (${t.classification ?? 'unclassified'}, ${t.fields} field(s))`);
    }
    P('');
    P(`${findings.length} finding(s). A FINDING IS RED, NEVER A DELETION INSTRUCTION: "used" does not mean`);
    P('"needed", and nothing below a permutation is checked at all. Name the owner or hand it to the');
    P('Software Architect; deletion is a separate, released act.');
    process.stdout.write(out.join('\n') + '\n');
  }

  // ---- the gate: --check and a candidate the model states no exemption for -------------------
  // A NEWLY introduced orphan surfaces at the next gate instead of accruing silently. The report
  // is printed first — a gate finding nobody can read is not a finding.
  if (opts.check && findings.length) {
    process.stderr.write(`seqmap: error: ${findings.length} operation(s) are ORPHAN or DEAD-BRANCH-ONLY and the ` +
      `model states no exemption for them: ${findings.map((o) => `${o.qname} (${o.mark})`).join(', ')}\n` +
      `  Each is a finding with an owner: declare the component's deferral (\`SetComponentLifecycle ` +
      `--lifecycle future\`), declare the use case's own lifecycle if the design has decided about ` +
      `it (\`SetUseCaseLifecycle --lifecycle future|retired\` — the tombstone \`seqmap complete\` reads, ` +
      `#1320), point a drawn call site at it, or take it to the Software Architect. ` +
      `Deleting is never this command's instruction.\n`);
    process.exit(1);
  }
  process.stderr.write(`seqmap: unused — ${counts.operationMarks.USED}/${counts.operations} operations USED, ` +
    `${findings.length} finding(s)${dtos ? `; DTOs ${dtos.reached}/${dtos.total}` : ''}\n`);
}

// ===================================================================================
//  CLI
// ===================================================================================
function collectBpd(args) {
  const files = [];
  for (const a of args) {
    if (!existsSync(a)) die(`not found: ${a}`);
    if (statSync(a).isDirectory())
      files.push(...readdirSync(a).filter((f) => f.endsWith('.bpd')).sort().map((f) => join(a, f)));
    else files.push(a);
  }
  if (!files.length) die('no .bpd sources given');
  return files;
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv.shift();
  let out = null, screensDir = null, bindingFile = null, modelFile = null, gate = false;
  let siExportsDir = null, callSite = null, clientName = null, managerName = null;
  let wantDtos = false, format = 'table', check = false, includeParked = false;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-o' || argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '--screens') screensDir = argv[++i];
    else if (argv[i] === '--binding') bindingFile = argv[++i];
    else if (argv[i] === '--model') modelFile = argv[++i];
    else if (argv[i] === '--si') siExportsDir = argv[++i];
    else if (argv[i] === '--call-site') callSite = argv[++i];
    else if (argv[i] === '--use-case')
      die("`sequence --use-case SIxx.yy` is replaced by `--call-site BPxx.yy` (ADR-069 §3, #1196): a " +
          "sequence is generated from ONE DRAWN BLOCK, and an interaction may be resolved to by " +
          "several blocks that legitimately differ. Name the call site whose block you are generating.");
    else if (argv[i] === '--client') clientName = argv[++i];
    else if (argv[i] === '--manager') managerName = argv[++i];
    else if (argv[i] === '--gate') gate = true;
    else if (argv[i] === '--dtos') wantDtos = true;
    else if (argv[i] === '--check') check = true;
    else if (argv[i] === '--include-parked') includeParked = true;
    else if (argv[i] === '--format') {
      format = argv[++i];
      if (!['table', 'json'].includes(format)) die(`--format takes 'table' or 'json', got '${format}'`);
    }
    else rest.push(argv[i]);
  }
  if (!cmd || ['-h', '--help', 'help'].includes(cmd)) {
    process.stdout.write(
      'seqmap — Sequence Map tooling over tagged .bpd sources (tooling contract §§2/6/7; ADR-041)\n\n' +
      'Usage:\n' +
      '  seqmap generate <dir|files...> [--screens <dir>] [-o out.json] [--include-parked]\n' +
      '                  [--binding <si-binding.yaml> --model <model.json>]   # + facet·operation (Design)\n' +
      '  seqmap check    <seqmap.json> <dir|files...> [--screens <dir>] [--binding ... --model ...]\n' +
      '                  [--include-parked]\n' +
      '  seqmap complete <dir|files...> --binding <si-binding.yaml> --model <model.json>\n' +
      '                  [--screens <dir>] [--si <si-export dir>]   # + C14/C15 refinement (ADR-068)\n' +
      '  seqmap unused   <dir|files...> --binding <si-binding.yaml> --model <model.json>\n' +
      '                  [--dtos] [--format table|json] [--check]\n' +
      '                  # what does nothing reach: reachability from the drawn design; prints, never deletes\n' +
      '  seqmap sequence <dir|files...> --binding <map> --model <model.json> --si <si-export dir>\n' +
      '                  --call-site BPxx.yy [--client <Comp>] [--manager <Comp>]  # emit sns mutations\n' +
      '  seqmap si-docs  <SI markdown dir|files...> --model <model.json>       # SI docs <-> model (#346)\n' +
      '                  [--binding <si-binding.yaml>]   # + the generated call-site export class (#1359)\n' +
      '  seqmap replay   <seqmap.json> <walklog dir|files...> [--gate]\n' +
      '\n' +
      'Non-live sources (#1243): a .bpd declaring `status dissolved|retired|parked` is left OUT of\n' +
      'the generated map — `generate` and `check` skip it, name it on stderr, and record it under\n' +
      'the map\'s `nonLive`. `--include-parked` puts it back (unbound generation only: a frozen\n' +
      'block is not generated, so there is no enriched form of it). The INSPECTORS never skip —\n' +
      '`complete` and `unused` read every source as written: a row naming a dissolved/retired block\n' +
      'is [C13]; a row naming a PARKED block is kept, and an interaction only such rows resolve to\n' +
      'is [C9-parked], a warning naming what revives it (#1252).\n' +
      '\n' +
      'Model lifecycle (#1320): a use case the MODEL declares `lifecycle: future|retired` is exempt\n' +
      'from [C9] at both granularities — `retired` is a TOMBSTONE (decided against, kept as a record,\n' +
      'id never re-minted), `future` is decided-but-deferred. The exemption is PRINTED on every run\n' +
      'and named on the summary line; it is read from the model and nowhere else (no key on the\n' +
      '`interactions:` entry). A LIVE call site resolving to such an interaction is [C9-notbuilt], an\n' +
      'error: a process being built cannot ask for an operation the design is not building.\n\n' +
      'Utilities layer (#1242): `unused` does not ask reachability of a `Utilities` component at all.\n' +
      'A call into a Utility is cross-cutting and flows through the iFX ambient context, never as a\n' +
      'drawn sequence step (ADR-031/ADR-061; the drafting checklist states the rule BY LAYER), so an\n' +
      'unreached utility operation reads UTILITY — printed, not counted, never a `--check` finding —\n' +
      'rather than ORPHAN. A utility a live drawing DOES reach still reads USED (ADR-074: a `service`\n' +
      'Utility is a legal sequence tail); the exemption never hides a positive fact.\n');
    process.exit(cmd ? 0 : 1);
  }
  // bound context for generate/check: the completeness check runs first — a bound
  // map only exists if it is green (ADR-037 §2 "raised at derivation")
  const bindContext = (files) => {
    if (!bindingFile && !modelFile) return null;
    if (!bindingFile || !modelFile) die('bound generation needs BOTH --binding and --model');
    const r = runComplete(files, bindingFile, modelFile, screensDir, siExportsDir);
    reportWarnings(r.warnings);
    reportExemptions(r.exemptUcs);
    // a subset invocation aborts bound generation too: every finding may have been
    // withheld as partial-input noise, and the map would then be built from part of a design
    if (r.problems.length || r.subset) reportProblems(r.problems, r.subset);
    return r;
  };
  // The enriched map STAMPS the model's facet operation onto every block it carries, and a
  // non-live process's blocks are out of the live inventory: a dissolved/retired block has no
  // binding row ([C13]), a parked block's row is kept for revival but is not generated (#1252).
  // So there is no bound form of --include-parked to have: it would ask for a map enriched with
  // what the source declares is not being built. Refused rather than quietly ignored.
  if (includeParked && (bindingFile || modelFile) && ['generate', 'check'].includes(cmd))
    die('`--include-parked` has no bound form: a non-live process\'s blocks resolve to no callSites ' +
        'row ([C13]) or to one kept only for revival (parked, #1252), so there is nothing for ' +
        '--binding/--model to stamp onto them. Drop --binding (the Mockup map, where the drawing is ' +
        'what is wanted) or drop --include-parked.');
  if (includeParked && !['generate', 'check'].includes(cmd))
    die(`\`--include-parked\` is a GENERATOR flag and '${cmd}' does not generate a map. The inspectors ` +
        '— `complete`, `unused` — already read every source as written, non-live included: that is ' +
        'how [C13] can refuse a binding row that still names a frozen block. Drop the flag.');
  if (cmd === 'generate') {
    const files = collectBpd(rest);
    const map = generate(files, screensDir, bindContext(files), includeParked);
    const json = JSON.stringify(map, null, 2) + '\n';
    if (out) { writeFileSync(out, json); process.stderr.write(`seqmap: wrote ${out}\n`); }
    else process.stdout.write(json);
    const nPaths = map.processes.reduce((n, p) => n + p.paths.length, 0);
    process.stderr.write(`seqmap: ${map.bindingSource ? 'bound to ' + map.bindingSource : 'no binding map'} — ` +
      `${map.processes.length} BPs, ${Object.keys(map.operations).length} SIs, ${nPaths} paths\n`);
    return;
  }
  if (cmd === 'check') {
    const committed = rest.shift();
    if (!committed || !existsSync(committed)) die('check needs an existing <seqmap.json> first');
    const files = collectBpd(rest);
    const map = generate(files, screensDir, bindContext(files), includeParked);
    const json = JSON.stringify(map, null, 2) + '\n';
    if (readFileSync(committed, 'utf8') !== json)
      die(`${committed} differs from a fresh generate — regenerate it (GENERATED files are never hand-edited)`);
    process.stdout.write(`seqmap: ${committed} is up to date\n`);
    return;
  }
  if (cmd === 'complete') {
    if (!bindingFile || !modelFile) die('complete needs --binding <si-binding.yaml> and --model <model.json>');
    completeCheck(collectBpd(rest), bindingFile, modelFile, screensDir, siExportsDir);
    return;
  }
  if (cmd === 'unused') {
    if (!bindingFile || !modelFile) die('unused needs --binding <si-binding.yaml> and --model <model.json>');
    // `--si` had one job here — sizing the event edges the walk could not follow — and the two
    // aborts removed the population it measured: a `throw` is refused outright, and every other
    // system-side hand-off is a `send` to a handle whose receiving chain carries its own bound
    // call site. An option that contributes nothing is deleted, not left accepted-and-ignored.
    if (siExportsDir)
      die('`unused --si` is deleted: it existed to SIZE the event edges this walk could not follow, ' +
          'and there are none left to size. A `throw` — the one construct with no binding form — is ' +
          'now an abort (bpmn-tools#54), and every other system-side hand-off is a `send` to a handle ' +
          'whose receiving chain draws its own call site, which this walk already follows. Drop the flag.');
    unusedCmd(collectBpd(rest), bindingFile, modelFile, { dtos: wantDtos, format, check });
    return;
  }
  if (cmd === 'sequence') {
    if (!bindingFile || !modelFile) die('sequence needs --binding <si-binding.yaml> and --model <model.json>');
    if (!siExportsDir) die('sequence needs --si <si-export dir> — the block is what the sequence is generated from (bpmn-dsl si-export)');
    if (!callSite || !CALLSITE_ID_RE.test(callSite)) die('sequence needs --call-site BPxx.yy (one drawn block per invocation — ADR-069 §3)');
    sequenceCmd(collectBpd(rest), bindingFile, modelFile, siExportsDir, callSite, clientName, managerName);
    return;
  }
  if (cmd === 'si-docs') {
    if (!modelFile) die('si-docs needs --model <model.json>');
    if (!rest.length) die('si-docs needs the SI markdown directory (docs/02_Business/02_System-Interactions)');
    siDocsCmd(rest, modelFile, bindingFile);
    return;
  }
  if (cmd === 'rebind')
    die('`rebind` is deleted (ADR-066, #1181): a System Interaction\'s id is minted once at Mockup and ' +
        'never rewritten, so there is nothing to rewrite. Drop the step from your flow.');
  if (cmd === 'replay') {
    const mapFile = rest.shift();
    if (!mapFile) die('replay needs a <seqmap.json> first, then the walklog dir/files');
    if (bindingFile) die('`replay --binding` is deleted (ADR-066, #1181): a walk recorded at Mockup names ' +
        'the same ids the map does, so there is no translation to apply.');
    replayCmd(mapFile, rest, gate);
    return;
  }
  die(`unknown command '${cmd}'`);
}
main();
