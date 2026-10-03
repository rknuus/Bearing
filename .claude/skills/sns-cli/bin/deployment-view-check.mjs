#!/usr/bin/env node
/**
 * deployment-view-check (#455/#456, slot table #1089, ruled table #1245) — the yaml and the
 * markdown must agree on FACTS, and every deployment decision must be RULED.
 *
 * The markdown is the narrative and the authority on WHY: it carries the reasoning for choosing
 * PostgreSQL for the contended bill-bearing store and SQLite for the local ones, and no schema can
 * hold that. The yaml is the same facts in the form a program can act on — `workspace materialize`
 * reads it to pick a store implementor's product flavor skill (#456).
 *
 * This check exists so the two cannot drift. It does NOT treat the yaml as superseding the prose:
 * it asserts that every SLOT the yaml names appears in the markdown's binding table with the same
 * resource, resourceKind, product and seam, that the markdown names no slot the yaml has
 * forgotten, and that the markdown's hosting section states the same five hosting facts. Everything
 * else the markdown says is its own business.
 *
 * Under `deployment-view/2` (ADR-065) the loop variable became the SLOT, not the ResourceAccess: an
 * Access may stand on several resources, so it may own several rows. That is deliberate on the
 * review surface too — a multi-resource Access should be a visibly multi-row item, not something a
 * reviewer has to notice (#1069).
 *
 * Under `deployment-view/3` (ADR-071) the check is also where an UNRULED decision goes red. Until
 * 2026-09-05 this check said nothing about whether PostgreSQL was the right product — Figaro's own
 * Blueprint record wrote that sentence down — because nobody had made the product a decision. Now a
 * slot without a complete `ruled:` stamp, or a hosting block without one, fails here; the remedy is
 * the Software Architect's ruling, never a stamp typed to make the check green.
 *
 * Under the ADR-071 amendment of 2026-09-09 (#1401) the hosting block may also declare RESOURCE-LESS
 * PLATFORM PRODUCTS — a telemetry backend above all — and each is held to the same two rules as a
 * slot: it is mirrored in the markdown's Hosting section, and it is UNRULED until it carries its own
 * stamp. Before that amendment such a product had nowhere to be written down at all: the model may
 * not name it (ADR-048 §1), the slot table takes only a Utility standing on a RESOURCE (ADR-071 §4),
 * and so a per-GB-billed backend fed by a proxy that spans every component call was chosen by
 * nobody, priced by nobody and reviewed at no gate.
 *
 * Under #1353 it also sweeps the DERIVED documents for product names copied out of this view. The
 * deployment view is by ADR-048 the one place a product is named, and nothing checked the copies:
 * when Figaro's four stores moved from PostgreSQL to Azure SQL Database on 2026-09-07 the view
 * changed and four section headings, a binding comment and two gate-record notes did not. A product
 * no slot is ruled on is RED here; the ruled product named outside this view is a NOTE (cite the
 * slot, do not copy the decision); dated records are NOTE-only. See `store-product-drift.mjs`.
 *
 *   node deployment-view-check.mjs <deployment-dir> [--sweep <dir> …] [--no-sweep]
 *
 * Exit: 0 agree and ruled · 1 disagree, unruled or drifted · 2 usage.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readDeploymentView, HOSTING_KEYS } from './deployment-view.mjs';
import { DEFAULT_SWEEP, isProjectRoot, methodDirs, sweepStoreProducts } from './store-product-drift.mjs';

const argv = process.argv.slice(2);
const dir = argv.find((a) => !a.startsWith('--'));
const sweepArgs = argv.flatMap((a, i) => (a === '--sweep' && argv[i + 1] ? [argv[i + 1]] : []));
const noSweep = argv.includes('--no-sweep');
if (!dir) { console.error('deployment-view-check: <deployment-dir> is required'); process.exit(2); }
const yamlPath = join(dir, 'deployment-view.yaml');
const mdPath = join(dir, '01_Deployment-View.md');
for (const p of [yamlPath, mdPath]) {
  if (!existsSync(p)) { console.error(`deployment-view-check: missing ${p}`); process.exit(2); }
}

const view = readDeploymentView(dir, 'deployment-view-check');
const md = readFileSync(mdPath, 'utf-8');
const problems = [...view.problems];

// Binding-table rows look like:
//   | `ErpAccess` | `erp-extension-store` | `ErpExtensionStore` | RelationalDB | **PostgreSQL** | … | `IErpExtensionStore` |
// The owner is an Access or a Utility (ADR-071 §4). The seam is the row's LAST backticked cell, so
// the columns between product and seam (driver, provider notes) stay the markdown's own business —
// which is what they were before the slot column existed.
//
// The owner cell is a PLAIN component name, not a name ending in `Access` or `Utility` (#1404).
// Until 2026-09-10 this pattern demanded that suffix, while the yaml reader beside it accepts any
// `utility:` name — and IDesign imposes no such suffix on a Utility (`MessageBus`, `Scheduler`,
// `Clock` are ordinary Utility names). So a row that WAS there, complete and correct, was reported
// as "in the yaml, absent from the markdown's binding table" and the run aborted before the
// product-drift sweep, taking a whole gate row red on a naming convention the model does not
// impose. It had never fired only because the reporting project's two Utilities happened to end in
// `Utility`. Nothing is loosened by widening it: the owner cell is still compared, below, against
// the yaml entry's own `resourceAccess:`/`utility:` value, which is the fact the row is supposed to
// agree with — a typo in that cell is still red, and now it is red as a DISAGREEMENT naming both
// spellings rather than as a phantom missing row.
const mdRows = [...md.matchAll(
  /^\|\s*`(\w+)`\s*\|\s*`([\w-]+)`\s*\|\s*`(\w+)`\s*\|\s*(\w+)\s*\|\s*\*\*([^*|]+)\*\*\s*\|(.*)$/gm,
)].map((m) => ({
  owner: m[1], slot: m[2], resource: m[3], kind: m[4], product: m[5].trim(),
  seam: (m[6].match(/`([^`]+)`\s*\|?\s*$/) || [])[1],
}));

if (mdRows.length === 0)
  problems.push(`${mdPath}: no slot-binding table rows recognised — the check cannot verify agreement, which is itself a failure. Under deployment-view/3 a row is: | \`Owner\` | \`slot-name\` | \`Resource\` | Kind | **Product** | … | \`ISeam\` |`);

const bySlot = new Map(mdRows.map((r) => [r.slot, r]));

for (const s of view.slots) {
  const row = bySlot.get(s.slot);
  if (!row) {
    problems.push(`${s.owner} slot '${s.slot}': in the yaml, absent from the markdown's binding table — an unreviewed slot`);
    continue;
  }
  if (row.owner !== s.owner) problems.push(`slot '${s.slot}': yaml owner '${s.owner}' vs markdown '${row.owner}'`);
  if (row.product !== String(s.product)) problems.push(`slot '${s.slot}': yaml product '${s.product}' vs markdown '${row.product}'`);
  if (row.kind !== s.resourceKind) problems.push(`slot '${s.slot}': yaml resourceKind '${s.resourceKind}' vs markdown '${row.kind}'`);
  if (row.resource !== s.resource) problems.push(`slot '${s.slot}': yaml resource '${s.resource}' vs markdown '${row.resource}'`);
  if (row.seam !== s.seam) problems.push(`slot '${s.slot}': yaml seam '${s.seam}' vs markdown '${row.seam ?? '(none)'}'`);
}
const declared = new Set(view.slots.map((s) => s.slot));
for (const row of mdRows)
  if (!declared.has(row.slot))
    problems.push(`slot '${row.slot}' (${row.owner}): in the markdown, absent from the yaml — a resource nothing can provision a flavor skill for`);

// The hosting operational concept (ADR-071 §3): the markdown carries a "Hosting" section stating
// the same five facts, verbatim — the yaml is the form a program acts on, the section is where the
// reasoning lives (why one binary today, why that target class, what the cost envelope buys).
if (view.hosting) {
  if (!/^#{2,}\s.*hosting/im.test(md))
    problems.push(`${mdPath}: no "Hosting" section — the hosting operational concept needs its narrative beside its facts (ADR-071 §3; Comanda's §5 is the shape)`);
  for (const k of HOSTING_KEYS) {
    const v = view.hosting[k];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    if (!md.includes(String(v)))
      problems.push(`hosting.${k}: the yaml says '${v}' and the markdown nowhere states it verbatim — the two must not state different facts`);
  }
  // Each resource-less platform product is mirrored the same way (#1401): the yaml is what a
  // program acts on, the markdown Hosting section is where the reasoning lives, and ADR-071 §3's
  // two-documents-agree rule does not stop at the five facts. Product, cost and operator are what
  // a reviewer weighs, so those are what must be stated verbatim; `purpose` and `whenUnavailable`
  // are prose the section is free to phrase as prose.
  for (const p of view.platforms) {
    if (!md.includes(String(p.platform)))
      problems.push(`hosting.platforms '${p.platform}': the markdown's Hosting section never names this platform role — a product ruled in the yaml and absent from the prose is a decision nobody reviews (ADR-071 §3)`);
    for (const k of ['product', 'costEnvelope', 'operator']) {
      const v = p[k];
      if (v === undefined || v === null || String(v).trim() === '') continue;
      if (!md.includes(String(v)))
        problems.push(`hosting.platforms '${p.platform}'.${k}: the yaml says '${v}' and the markdown nowhere states it verbatim — the two must not state different facts`);
    }
  }
}

// ADR-065 open question O1 — the guard against an Access quietly becoming a catch-all is NOT ruled,
// so nothing here is a failure. What the reviewer gets is the observation: which owners stand on
// several resources, and whether each states the one volatility its slots jointly encapsulate.
const notes = [];
for (const o of view.owners) {
  if (o.slots.length > 1)
    notes.push(`${o.name} stands on ${o.slots.length} resources (${o.slots.map((s) => s.slot).join(', ')})`
      + `${o.volatility ? ` — encapsulating: ${o.volatility}` : ` — and states no \`volatility:\` line saying what single volatility they jointly encapsulate`}`);
}

// #1353 — the copies of this view's product decisions, out in the derived documents. The sweep
// roots are named with --sweep, or derived: the project root is the nearest ancestor of the
// deployment dir that has a `docs/` in it, and the sweep is docs/03_Technology, docs/04_Gates and
// every `*.method` directory. Nothing is derived silently — the roots are printed with the result.
const drift = { red: [], notes: [], scanned: 0, roots: [] };
if (!noSweep) {
  let base = resolve(dir);
  if (sweepArgs.length > 0) {
    drift.roots = sweepArgs.map((r) => resolve(r));
    base = process.cwd();
  } else {
    for (let up = 0; up < 6 && !isProjectRoot(base); up += 1) base = resolve(base, '..');
    if (isProjectRoot(base)) drift.roots = [...DEFAULT_SWEEP, ...methodDirs(base)].map((r) => join(base, r));
  }
  if (drift.roots.length > 0) {
    // The ruled pool is every product decision the view carries — the slots AND the resource-less
    // platform products (#1401). A backend the Software Architect ruled in `hosting:` is ruled.
    const swept = sweepStoreProducts(base, drift.roots, [...view.slots, ...view.platforms]);
    drift.red = swept.red;
    drift.notes = swept.notes;
    drift.scanned = swept.scanned;
  }
}

const failures = [...problems, ...view.unruled, ...drift.red];
if (failures.length) {
  for (const p of problems) console.error(`deployment-view-check: ${p}`);
  for (const u of view.unruled) console.error(`deployment-view-check: UNRULED — ${u}`);
  const parts = [];
  if (problems.length) parts.push(`${problems.length} disagreement(s) — the markdown is the authority on WHY; the yaml is what the toolchain acts on; they must not state different facts`);
  for (const d of drift.red) console.error(`deployment-view-check: PRODUCT DRIFT — ${d}`);
  if (drift.red.length) parts.push(`${drift.red.length} stale product name(s) — the deployment view is the ONE place a product is named (ADR-048); a design surface names the SLOT or the SEAM, and a product-bound fact says "per the ruled product of slot X". A mention that is deliberate says so on the line: \`product-ok: <why>\``);
  if (view.unruled.length) parts.push(`${view.unruled.length} decision(s) still owed — a deployment decision is ruled by the Software Architect before the protocol sheets are authored (ADR-071 §2); the remedy is his ruling, recorded as \`ruled: { by, on, basis }\`, never a stamp typed to pass this check`);
  console.error(`\n${parts.join('. ')}.`);
  process.exit(1);
}
if (notes.length || drift.notes.length) {
  console.log('deployment-view-check: Contract reviewer report:');
  for (const n of notes) console.log(`  ${n}`);
  for (const n of drift.notes) console.log(`  copy: ${n}`);
}
const owners = `${view.accesses.length} ResourceAccess(es)${view.utilities.length ? ` and ${view.utilities.length} Utility(ies)` : ''}`;
const platformNote = view.platforms.length
  ? ` and ${view.platforms.length} resource-less platform product(s) (${view.platforms.map((p) => p.platform).join(', ')})`
  : '';
console.log(`deployment-view-check: OK — ${view.slots.length} slot(s) across ${owners}${platformNote}, every slot${view.platforms.length ? ', every platform product' : ''} and the hosting concept ruled; yaml and markdown agree on resource, resourceKind, product and seam for each slot and on the five hosting facts.`);
console.log(
  drift.roots.length === 0
    ? `deployment-view-check: product-drift sweep NOT run — ${noSweep ? '--no-sweep was given' : 'no project root with a docs/ was found above ' + resolve(dir)}. Nothing checked the copies of these product decisions.`
    : `deployment-view-check: product-drift sweep clean over ${drift.scanned} file(s) in ${drift.roots.length} root(s) — no design surface names a product no slot is ruled on (#1353).`,
);
