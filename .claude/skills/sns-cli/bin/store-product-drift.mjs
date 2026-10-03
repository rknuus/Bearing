#!/usr/bin/env node
/**
 * store-product-drift (#1353) — a product name copied out of the deployment view is a COPY of a
 * decision, and a copy drifts the moment the decision moves.
 *
 * ADR-048 makes the deployment view the one place a product is named: *"the MODEL stays
 * product-free — it says a store, never Azure SQL"*. Nothing checked the derived documents against
 * it. When the Software Architect moved Figaro's four stores from PostgreSQL to Azure SQL Database
 * (relay R-032, 2026-09-07) the deployment view changed and the copies did not: four section
 * headings in the store-seam interfaces, a comment in si-binding.yaml, two notes in a blessed gate
 * record. He found the stale heading himself the same evening, and asked the question this module
 * answers: *"whether technology should be mentioned here, and if it must be mentioned, then maybe
 * even the content is wrong. Always think about whether there is a process issue"*.
 *
 * THE RULE THIS ENFORCES. Outside `deployment-view.yaml` and `01_Deployment-View.md`, a design
 * surface names a store by its SLOT ID / SEAM INTERFACE, never by product. A fact that really is
 * product-bound — a column-type vocabulary, a fault taxonomy — says *"per the ruled product of slot
 * X"* and follows the ruling.
 *
 * THREE VERDICTS, and the difference between them is the whole design:
 *
 *   RED   a product NO slot is ruled on. This is stale text: it names a decision that has been
 *         superseded, and the reader of that document is being told something untrue.
 *   NOTE  the RULED product, named outside the deployment-view files. Not untrue today, and
 *         untrue the day he rules again — the remedy is to cite the slot, not to update the copy.
 *   NOTE  anything in a DATED record (`docs/01_Planning/**`, `docs/04_Gates/**`). A gate record is
 *         history: it says what was true when it was blessed, and rewriting history to make a
 *         check green is worse than the drift.
 *
 * AND ONE DELIBERATE ESCAPE. A line carrying `product-ok:` is a NOTE with its reason, whatever it
 * names. Some documents legitimately name a superseded product — Figaro's protocol-sheet header
 * DECLARES the product change and tracks the type-vocabulary migration — and a check with no way
 * to say "this mention is the point" teaches its readers to delete true sentences.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * The products a design surface has ever been caught naming, each with the pattern that finds it.
 *
 * Word-bounded and case-insensitive: `Postgres`, `PostgreSQL` and `postgresql` are one product, and
 * `SQLite` inside `Microsoft.Data.Sqlite` is a DRIVER, which the boundary keeps out.
 */
export const PRODUCTS = [
  { name: 'Azure SQL Database', re: /\bazure\s+sql(?:\s+database)?\b/i },
  { name: 'Microsoft SQL Server', re: /\b(?:microsoft\s+)?sql\s+server\b/i },
  { name: 'PostgreSQL', re: /\bpostgre(?:s|sql)\b/i },
  { name: 'MySQL', re: /\bmysql\b/i },
  { name: 'MariaDB', re: /\bmariadb\b/i },
  { name: 'SQLite', re: /\bsqlite\b/i },
  { name: 'Cosmos DB', re: /\bcosmos\s*db\b/i },
  { name: 'MongoDB', re: /\bmongodb\b/i },
  { name: 'DynamoDB', re: /\bdynamodb\b/i },
  { name: 'Cassandra', re: /\bcassandra\b/i },
  { name: 'CockroachDB', re: /\bcockroachdb\b/i },
  { name: 'Redis', re: /\bredis\b/i },
  { name: 'Elasticsearch', re: /\belasticsearch\b/i },
  { name: 'Oracle Database', re: /\boracle\s+database\b/i },
];

/** The file kinds a design surface is written in. Everything else is somebody's build output. */
const SCANNED = /\.(md|ya?ml)$/i;
/** Directories nothing under them is a design surface. */
const SKIP_DIR = new Set(['node_modules', '.git', 'bin', 'obj', 'dist', '.theagent-run']);
/** The two files that ARE the decision — naming a product there is the point. */
const DEPLOYMENT_VIEW_FILES = new Set(['deployment-view.yaml', '01_Deployment-View.md']);
/** Dated history: annotate, never rewrite. */
const DATED = [join('docs', '01_Planning'), join('docs', '04_Gates')];
/** The escape hatch, on the line itself. */
const ESCAPE = /product-ok:\s*(.*)$/i;

/** Which product a string names, if any — used on a document line and on a ruled `product:` value. */
export function productsIn(text) {
  return PRODUCTS.filter((p) => p.re.test(text)).map((p) => p.name);
}

/** Every scannable file under a root, as paths relative to `base`. */
export function scannableFiles(root, base = root, out = []) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.theagent') continue;
    const abs = join(root, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      scannableFiles(abs, base, out);
    } else if (e.isFile() && SCANNED.test(e.name)) {
      out.push(relative(base, abs));
    }
  }
  return out;
}

const isDated = (rel) => DATED.some((d) => rel === d || rel.startsWith(d + sep));

/**
 * Where a ruled product decision lives, for the message a finding prints. A slot names itself; a
 * resource-less PLATFORM product (#1401) names its role, because it has no slot to name — it stands
 * on no resource, which is the whole reason ADR-071's amendment gave it a home in `hosting:`.
 */
const ruledAt = (entry) => (entry.slot ? `slot ${entry.slot}` : `the platform product for '${entry.platform}'`);

/**
 * Sweep `roots` for product names and judge each against the RULED products.
 *
 * `ruled` is every product decision the deployment view carries — its slot list AND its
 * `hosting.platforms` entries, each `{ slot | platform, product, ruled }`. Both belong in the pool
 * for the same reason: a product the Software Architect has ruled on is not stale text, wherever in
 * the view he ruled it. Leaving the platform products out would turn a correctly ruled backend into
 * a RED on every design surface that names it — a check accusing a document of naming a decision
 * that was in fact made, which is the opposite of what #1353 is for.
 *
 * Returns `{ red, notes, scanned }`, each finding a one-line string carrying `<file>:<line>`.
 */
export function sweepStoreProducts(base, roots, ruled) {
  const ruledNames = new Set();
  for (const s of ruled) for (const n of productsIn(String(s.product ?? ''))) ruledNames.add(n);
  const ruling = (name) => {
    const owners = ruled.filter((s) => productsIn(String(s.product ?? '')).length > 0 && !productsIn(String(s.product ?? '')).includes(name));
    if (owners.length === 0) return 'no slot is ruled on any product';
    return owners
      .slice(0, 3)
      .map((s) => `${ruledAt(s)} is ruled ${s.product}${s.ruled?.basis ? ` (${s.ruled.basis})` : ''}`)
      .join('; ') + (owners.length > 3 ? `; and ${owners.length - 3} more` : '');
  };

  const red = [];
  const notes = [];
  let scanned = 0;
  const seen = new Set();
  for (const root of roots) {
    for (const rel of scannableFiles(root, base)) {
      if (seen.has(rel)) continue;
      seen.add(rel);
      const name = rel.slice(rel.lastIndexOf(sep) + 1);
      if (DEPLOYMENT_VIEW_FILES.has(name)) continue;
      let text;
      try {
        text = readFileSync(join(base, rel), 'utf-8');
      } catch {
        continue;
      }
      scanned += 1;
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const hits = productsIn(line);
        if (hits.length === 0) continue;
        const escape = ESCAPE.exec(line);
        for (const hit of hits) {
          const at = `${rel}:${i + 1}`;
          if (escape) {
            notes.push(`${at} names ${hit}, declared deliberate — ${escape[1].trim() || 'no reason given'}`);
          } else if (ruledNames.has(hit)) {
            notes.push(`${at} names ${hit} — a copy of a decision; cite the slot instead (ADR-048: the product is named in the deployment view and nowhere else)`);
          } else if (isDated(rel)) {
            notes.push(`${at} names ${hit}, which no slot is ruled on — a DATED record says what was true when it was blessed; annotate it, do not rewrite it`);
          } else {
            red.push(`${at} names ${hit}; ${ruling(hit)}`);
          }
        }
      }
    }
  }
  return { red, notes, scanned };
}

/** Where the sweep looks by default, relative to a project root. */
export const DEFAULT_SWEEP = [join('docs', '03_Technology'), join('docs', '04_Gates')];

/** Every `*.method` directory at the project root — the model, which ADR-048 keeps product-free. */
export function methodDirs(base) {
  try {
    return readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.endsWith('.method'))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/** True when this directory looks like a project root (it has a `docs/` beside it). */
export function isProjectRoot(dir) {
  try {
    return statSync(join(dir, 'docs')).isDirectory();
  } catch {
    return false;
  }
}
