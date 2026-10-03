/**
 * deployment-view — the shared reader for `deployment-view/3`, the RULED SLOT TABLE (ADR-065,
 * #1089; ADR-071, #1245).
 *
 * WHY THIS FILE EXISTS. Until 2026-08-28 the deployment view had no format spec and no shared
 * reader: `deployment-view-check`, `resource-protocol`, `construction-entry-check` and `workspace
 * materialize` each destructured it their own way, so its shape *was* whatever they happened to
 * read. Widening it from one resource per Access to a list of named slots would have meant four
 * independent widenings that could disagree. The format is now specified
 * (process-specs/deployment-view-format.md) and read once, here.
 *
 * WHAT `/2` CHANGED. `deployment-view/1` gave each ResourceAccess one `resource` / `resourceKind` /
 * `product` / `seam`. That singularity was an assumption, never a decision, and it is wrong as
 * IDesign — an Access isolates the system from the volatility of interacting with one or MULTIPLE
 * sets of like resources. On the figaro run it left the customer's ERP, the single most
 * consequential external surface in the system, as the one surface with no reviewable call
 * allowlist (#1069). In `/2` an Access declares a list of named SLOTS, one per resource in one
 * role.
 *
 * WHAT `/3` CHANGES (ADR-071). The slot table was PRODUCED and never RULED: the architect's pass
 * picked a product, this reader checked the file's shape, `deployment-view-check` checked that the
 * yaml and the markdown agree, and no human was ever asked whether PostgreSQL was the right
 * product or where the system would run. Figaro reached Blueprint with six protocol sheets over a
 * product nobody had ruled, and with a hosting question (its OC-07) that no gate could ask for.
 * `/3` adds three things:
 *   - a `ruled: { by, on, basis }` stamp on every slot — kind and product are the Software
 *     Architect's ruling (or the ADR-058 delegate's), and an unstamped slot is UNRULED, which this
 *     reader reports separately from a structural problem so each tool can say what an unruled
 *     slot means for it (the sheet skeleton refuses it; the check goes red on it);
 *   - a required top-level `hosting:` block — the hosting operational concept (topology shape,
 *     target class, cost envelope, partial deployment, operator), with its own stamp. The model
 *     stays hosting-free (ADR-048 §1); this is where Comanda's §5 ruling on #488 should have lived;
 *   - a `utilities:` list beside `accesses:` — a Utility that stands on a resource (a storage
 *     utility over the file system, Blob or S3) declares slots with the SAME entry, so "which one
 *     for V1" is a row somebody rules rather than a question nobody is asked.
 *
 * THE SLOT NAME IS THE IDENTITY (ADR-065 decision 2) — not the seam, which is a TYPE and may repeat
 * across slots, and not the resource, which may be reached in more than one role. Slot names are
 * unique across the whole system, so the generated wiring of Phase 2 can name one without
 * qualification.
 *
 * NO DUAL GRAMMAR (ADR-065 decision 10). A `/1` or `/2` document is a loud refusal naming the
 * migration, never a silently-accepted legacy shape.
 */

import { join } from 'node:path';
import { yamlReader } from './yaml-subset.mjs';

export const FORMAT = 'deployment-view/3';
export const SUPERSEDED_FORMATS = {
  'deployment-view/1':
    'gave each ResourceAccess ONE resource. ADR-065 replaced it with the slot table — each Access declares' +
    " 'slots:', one entry per resource in one role — and ADR-071 made every slot a RULED one.",
  'deployment-view/2':
    'carried the slot table with no ruling on it. ADR-071 (#1245) adds a `ruled: { by, on, basis }` stamp' +
    " per slot, a required `hosting:` block with its own stamp, and a `utilities:` list for Utilities that" +
    ' stand on a resource. The migration ADDS those; an unruled slot stays unruled and the check stays red' +
    ' until the Software Architect rules — that is the mechanism working, not a migration defect.',
};

/** Every key a slot must carry. `deployment-view-format.md` is the prose for each. */
export const SLOT_KEYS = [
  'slot', 'resource', 'seam', 'resourceKind', 'product',
  'flavorSkill', 'driver', 'driverType', 'driverProject', 'configKey',
];

/**
 * The four numbers of a slot's `retry:` block, all required (#1103).
 *
 * They were optional-by-accident while nothing read them: every Access hard-coded the same values
 * as private consts, so the reviewed policy and the running policy were two statements of one fact
 * with nothing joining them. `slot-wiring` now generates the policy onto the slot carrier and the
 * Access reads it, which means a missing block would silently become "one attempt, no backoff" —
 * a thinner result that looks correct, which is the shape ADR-049 §8a forbids. So it is required.
 */
export const RETRY_KEYS = ['maxAttempts', 'shape', 'baseDelayMs', 'maxDelayMs'];

/**
 * The ruling stamp (ADR-071 §1): who ruled, when, and on what basis — `basis` is the verbatim ledger
 * answer (`QA-###`) or the session ruling it rests on, in the ADR-060 §3 `authority`/`basis` manner.
 * All three required; `on` is a date. A stamp is never added to make a check green.
 */
export const RULED_KEYS = ['by', 'on', 'basis'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The hosting operational concept (ADR-071 §3). Five facts and a stamp. Every one is a one-line
 * string: the block records a decision, it is not the operations runbook — "which server, which
 * cluster, which backup schedule" stay out (Figaro's deployment view §6 already said so).
 */
export const HOSTING_KEYS = ['topology', 'target', 'costEnvelope', 'partialDeployment', 'operator'];

/**
 * A RESOURCE-LESS PLATFORM PRODUCT (ADR-071 amendment 2026-09-09, #1401): a product the system
 * depends on that stands behind no seam, no slot and no simulator — a telemetry backend above all,
 * and its siblings (a secret store, an identity provider, a broker the iFX owns).
 *
 * It has everything ADR-071's ruling round exists for — a product, a cost envelope, an operator —
 * and until now it had nowhere to be written down. The model may not name it (ADR-048 §1: the
 * model stays product-free), the slot table may not hold it (a slot stands on a RESOURCE; ADR-071
 * §4 is untouched), and a document of its own could only diverge from this one (#861). So the
 * hosting block takes it: it is a hosting decision, it is priced by the same cost envelope, and it
 * sits beside the product rows it is judged against.
 *
 * The cost line is not decoration. A telemetry backend is billed per GB ingested and the
 * instrumentation proxy spans EVERY IoC-resolved component call (`observability.md`) — precisely
 * the "sound functional argument with no cost line" ADR-071 §2 was written to refuse.
 *
 * Each entry carries its OWN `ruled:` stamp, of the same shape the hosting block carries. Not the
 * block's: a backend chosen in November on a November basis cannot be covered by a stamp that says
 * the topology was ruled in September, and re-stamping the block to cover it would falsely claim
 * topology, target and cost were re-ruled that day.
 */
export const PLATFORM_KEYS = ['platform', 'purpose', 'product', 'costEnvelope', 'operator', 'whenUnavailable'];

/** The two owner tiers a slot table lists, and the key each entry is named by. */
export const OWNER_TIERS = [
  { list: 'accesses', key: 'resourceAccess', tier: 'Access', noun: 'ResourceAccess' },
  { list: 'utilities', key: 'utility', tier: 'Utility', noun: 'Utility' },
];

/**
 * `SalesAccess` -> `Sales`, `StorageUtility` -> `StorageUtility`: the ADR-022 layout keys an
 * owner's projects on its volatility stem, under `Component/<tier>/<stem>/`. The same derivation
 * `construction-entry-check`, `slot-wiring` and `workspace derive` make — here once.
 *
 * A UTILITY KEEPS ITS WHOLE NAME (theagent-unchained#1582, figaro#617). This function used to
 * strip a trailing `Utility`, and the doc comment above it asserted an agreement that did not
 * hold: the SCAFFOLDER is what creates these directories, and `volatilityOf` in
 * `scaffolder/emit/names.ts` carries `CONCEPT_SUFFIX['Utility'] = ''` with the reason beside it —
 * SNS enforces no suffix on that layer, and the models in the wild show why, `SecurityUtility`
 * carrying one where `MessageBus` does not. So `Component/Utility/StorageUtility/` is correct by
 * explicit design, and every site spelling `Component/Utility/Storage/` was wrong.
 *
 * It cost a FALSE RED that was already misread once: `[S2] StorageUtility: no store-seam project
 * — …/Utility/Storage/Resource/… does not exist` over a tree where `IBlobStore.cs` is on disk at
 * `Utility/StorageUtility/Resource/`, and five further true findings printed a remedy path that
 * can never exist, so a session obeying the message literally would have created
 * `Component/Utility/Secrets/` and broken the build. `MessageBus` was the tell throughout: no
 * `Utility` suffix, so the strip was a no-op, and it was the one Utility spelled correctly.
 */
export function stemOf(name, tier) {
  // `tier` is absent only where a caller has nothing but a name; a trailing `Utility` then still
  // identifies the layer, and the answer for that layer is "do not strip".
  if (tier === 'Utility' || (tier === undefined && name.endsWith('Utility'))) return name;
  const suffix = tier ?? 'Access';
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

/** Where an owner's projects live, csharp-root-relative: `{ tier, stem, dir: 'Component/Access/Sales' }`. */
export function layoutOf(name, tier) {
  const stem = stemOf(name, tier);
  return { tier, stem, dir: `Component/${tier}/${stem}` };
}

function isMap(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function blank(v) { return v === undefined || v === null || String(v).trim() === ''; }

/** The missing or malformed parts of a `ruled:` stamp, as a list of complaints; empty when complete. */
export function stampProblems(ruled) {
  if (!isMap(ruled)) return ['no `ruled:` stamp'];
  const out = [];
  for (const k of RULED_KEYS) if (blank(ruled[k])) out.push(`ruled.${k} is missing`);
  if (!blank(ruled.on) && !DATE_RE.test(String(ruled.on))) out.push(`ruled.on '${ruled.on}' is not a YYYY-MM-DD date`);
  return out;
}

/**
 * Reads `<dir>/deployment-view.yaml` and returns
 *   { path, system, hosting, platforms, accesses, utilities, owners, slots, bySeam, problems, unruled, raw }
 * where `accesses`/`utilities` are `[{ name, tier, volatility, slots }]` (an Access entry also keeps
 * `resourceAccess`, the key it is written under), `owners` is both lists in file order, `slots` is
 * the flat list with `.owner` (the owning component's name), `.ownerTier` and `.unruled` (the
 * stamp's complaints — empty when the slot is ruled) on each entry, and `bySeam` maps a seam name
 * to the slots that name it. `platforms` is `hosting.platforms` — the resource-less platform
 * products (#1401) — each entry as written plus `.unruled`, the same way a slot carries it.
 *
 * Structural problems are COLLECTED in `problems`, not thrown: `deployment-view-check` is the tool
 * that reports them, and every other reader wants to keep going over what does parse. What is
 * UNRULED — a slot or the hosting block without a complete stamp — is collected in `unruled`,
 * separately, because it is not a defect of the file but a decision still owed, and each reader
 * says what that means for it. A document that is not `/3` at all is the one hard stop — reading a
 * `/2` file as if it carried stamps would report every slot as unruled, which reads as a project
 * error rather than a migration.
 */
export function readDeploymentView(dir, tool) {
  const readYaml = yamlReader(tool);
  const path = join(dir, 'deployment-view.yaml');
  const doc = readYaml(path);
  const problems = [];
  const unruled = [];

  if (doc?.format !== FORMAT) {
    const found = doc?.format ?? '(none)';
    console.error(`${tool}: ${path}: format '${found}' is not ${FORMAT}.`);
    if (SUPERSEDED_FORMATS[found])
      console.error(
        `${tool}: ${found} ${SUPERSEDED_FORMATS[found]} There is no dual grammar (ADR-065 decision 10).` +
        ' Migrate the file: process-specs/deployment-view-format.md.');
    process.exit(2);
  }

  const accesses = [];
  const utilities = [];
  const owners = [];
  const slots = [];
  const bySeam = new Map();
  const slotNames = new Map(); // slot name -> owning component, for the system-wide uniqueness rule
  const seenOwner = new Set();
  const platforms = [];        // hosting.platforms — the resource-less platform products (#1401)
  const platformNames = new Set();

  for (const { list, key, tier, noun } of OWNER_TIERS) {
    const raw = doc[list];
    if (raw !== undefined && !Array.isArray(raw)) { problems.push(`${path}: '${list}' is not a list`); continue; }
    (raw ?? []).forEach((entry, i) => {
      if (!isMap(entry)) { problems.push(`${path}: ${list}[${i}] is not a mapping`); return; }
      const name = entry[key];
      if (typeof name !== 'string' || !name.trim()) { problems.push(`${path}: ${list}[${i}] has no '${key}'`); return; }
      if (seenOwner.has(name)) {
        problems.push(`${path}: ${noun} '${name}' is declared twice — a second entry is a mistake, never a merge`);
        return;
      }
      seenOwner.add(name);

      const own = [];
      const rawSlots = Array.isArray(entry.slots) ? entry.slots : [];
      if (!rawSlots.length)
        problems.push(`${name}: declares no 'slots' — a${tier === 'Access' ? 'n Access' : ' Utility listed here'} stands on at least one resource (${FORMAT})`);
      rawSlots.forEach((s, j) => {
        if (!isMap(s)) { problems.push(`${name}: slots[${j}] is not a mapping`); return; }
        const label = `slot '${s.slot ?? `[${j}]`}'`;
        const missing = SLOT_KEYS.filter((k) => blank(s[k]));
        if (missing.length) {
          problems.push(`${name}: ${label} has no ${missing.join(', ')}`);
          if (missing.includes('slot') || missing.includes('seam') || missing.includes('resourceKind')) return;
        }
        const retry = s.retry;
        if (!isMap(retry)) {
          problems.push(`${name}: ${label} has no 'retry' block — the bounded transient-retry policy is generated onto the slot carrier and read by the Access (ADR-048 §2, #1103), so an absent one would silently become one attempt with no backoff`);
        } else {
          const missingRetry = RETRY_KEYS.filter((k) => blank(retry[k]));
          if (missingRetry.length) problems.push(`${name}: ${label} retry has no ${missingRetry.join(', ')}`);
        }

        // The ruling (ADR-071 §1). Not a structural problem: a decision still owed.
        const stamp = stampProblems(s.ruled);
        if (stamp.length)
          unruled.push(`${name}: ${label} (${s.resourceKind} · ${s.product}) is not ruled — ${stamp.join('; ')}. Kind and product are the Software Architect's ruling, not the pass's guess (ADR-071 §1); put the question to him, never add a stamp`);

        // The slot name is the identity of everything downstream, so its uniqueness is checked across
        // the SYSTEM and not within the owner: Phase-2 generated wiring names a slot unqualified.
        const prior = slotNames.get(s.slot);
        if (prior) problems.push(`${name}: slot name '${s.slot}' is already used by ${prior} — slot names are unique system-wide (ADR-065 decision 2)`);
        else slotNames.set(s.slot, name);

        const slot = { ...s, owner: name, ownerTier: tier, unruled: stamp };
        own.push(slot);
        slots.push(slot);
        if (!bySeam.has(s.seam)) bySeam.set(s.seam, []);
        bySeam.get(s.seam).push(slot);
      });

      const ownerEntry = { name, tier, volatility: entry.volatility, slots: own };
      if (tier === 'Access') { ownerEntry.resourceAccess = name; accesses.push(ownerEntry); }
      else utilities.push(ownerEntry);
      owners.push(ownerEntry);
    });
  }
  if (!accesses.length && !utilities.length) problems.push(`${path}: no 'accesses' (and no 'utilities') — nothing to sheet`);

  // The hosting operational concept (ADR-071 §3): required, five one-line facts, its own stamp.
  let hosting;
  if (!isMap(doc.hosting)) {
    problems.push(`${path}: no 'hosting' block — where the system runs is a deployment decision recorded WITH the architecture and never in the model (ADR-071 §3, ADR-048 §1): topology, target, costEnvelope, partialDeployment, operator, and its ruled: stamp`);
  } else {
    hosting = doc.hosting;
    const missing = HOSTING_KEYS.filter((k) => blank(hosting[k]));
    if (missing.length) problems.push(`${path}: hosting has no ${missing.join(', ')}`);
    for (const k of HOSTING_KEYS)
      if (!blank(hosting[k]) && (typeof hosting[k] !== 'string' && typeof hosting[k] !== 'boolean' && typeof hosting[k] !== 'number'))
        problems.push(`${path}: hosting.${k} must be one line of text, not a ${Array.isArray(hosting[k]) ? 'list' : 'mapping'}`);
    const stamp = stampProblems(hosting.ruled);
    if (stamp.length)
      unruled.push(`hosting is not ruled — ${stamp.join('; ')}. The hosting operational concept prices every product choice below it and is the Software Architect's ruling (ADR-071 §3)`);

    // The resource-less platform products (#1401). Optional: a system that depends on none says so
    // by having none, and a `/3` file written before this key existed stays valid — there is no
    // second grammar here, only a key that may be absent. Every entry that IS declared is held to
    // the same completeness and the same ruling as a slot.
    const raw = hosting.platforms;
    if (raw !== undefined && !Array.isArray(raw)) {
      problems.push(`${path}: hosting.platforms is not a list`);
    } else {
      (raw ?? []).forEach((entry, i) => {
        if (!isMap(entry)) { problems.push(`${path}: hosting.platforms[${i}] is not a mapping`); return; }
        const name = entry.platform;
        if (typeof name !== 'string' || !name.trim()) {
          problems.push(`${path}: hosting.platforms[${i}] has no 'platform' — the ROLE the product plays is its identity (telemetry-backend, secret-store), the way a slot's name is a slot's`);
          return;
        }
        const at = `hosting.platforms '${name}'`;
        if (platformNames.has(name)) {
          problems.push(`${path}: ${at} is declared twice — a role is one decision, and two entries for it are two answers to one question`);
          return;
        }
        platformNames.add(name);
        const missing = PLATFORM_KEYS.filter((k) => blank(entry[k]));
        if (missing.length) problems.push(`${path}: ${at} has no ${missing.join(', ')}`);
        for (const k of PLATFORM_KEYS)
          if (!blank(entry[k]) && typeof entry[k] !== 'string' && typeof entry[k] !== 'number' && typeof entry[k] !== 'boolean')
            problems.push(`${path}: ${at}.${k} must be one line of text, not a ${Array.isArray(entry[k]) ? 'list' : 'mapping'}`);
        const st = stampProblems(entry.ruled);
        if (st.length)
          unruled.push(`the platform product for '${name}' is not ruled — ${st.join('; ')}. Which backend a system exports to has a product, a cost envelope and an operator, so it is the Software Architect's ruling like any other (ADR-071 §3 as amended, #1401)`);
        platforms.push({ ...entry, platform: name, unruled: st });
      });
    }
  }

  // A seam is one sheet, and the sheet's whole vocabulary — shape section, effect classes, danger
  // classes — is selected by resourceKind. Two slots sharing a seam but disagreeing on the kind ask
  // one sheet to be two vocabularies at once, which no sheet can be.
  for (const [seam, sharing] of bySeam) {
    const kinds = [...new Set(sharing.map((s) => s.resourceKind))];
    if (kinds.length > 1)
      problems.push(
        `seam '${seam}' is shared by slots of different resourceKind (${kinds.join(', ')}) — the sheet's whole` +
        ` vocabulary is selected by the kind, so one sheet cannot serve both (resource-protocol-format.md)`);
    // The sheet has one owning component — its fates are keyed on that component's contract DTOs,
    // and [P9] scans that component's `Service/`. A seam on two owners would leave the sheet with
    // two owners and no answer to "whose contract are these fates about".
    const who = [...new Set(sharing.map((s) => s.owner))];
    if (who.length > 1)
      problems.push(
        `seam '${seam}' is named by slots of ${who.join(' and ')} — a seam belongs to ONE component (its sheet's` +
        ` fates are that component's contract fields, ADR-065 decision 4). Two owners on one seam is either a` +
        ` duplicated encapsulation or two seams wearing one name`);
  }

  return { path, system: doc.system, hosting, platforms, accesses, utilities, owners, slots, bySeam, problems, unruled, raw: doc };
}

/** The component that owns a seam, or undefined. Several slots may share a seam; they share an owner. */
export function ownerOfSeam(view, seam) {
  return view.bySeam.get(seam)?.[0]?.owner;
}
