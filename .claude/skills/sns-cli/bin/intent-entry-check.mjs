#!/usr/bin/env node
/**
 * intent-entry-check (#634) — Intent refuses to open over a Discovery-stage side-channel nobody ran.
 *
 *   node intent-entry-check.mjs --planning <docs/01_Planning> --business <docs/02_Business> \
 *                               --gates <docs/04_Gates> --subject <slug>
 *
 * The failure this exists to make impossible (#634): ADR-040 §1 names FOUR continuously-running
 * Discovery-stage side-channels — the volatility harvest, operational concerns, provenance and the business
 * map. Run 2 produced two. The harvest is a DECLARED INPUT to Design ("decomposes by volatility
 * from the Discovery-stage harvest", GOLDEN-PROCESS Step 2), and it did not exist; Design ran anyway and
 * nothing anywhere reported a missing input. Run 2's V1-V9 were therefore invented during
 * decomposition and back-described into the model — there is no earlier artifact saying what the
 * volatilities were BEFORE someone decomposed them, so "the decomposition matches the harvest" is
 * not a checkable claim for that run. The absence read as "not applicable" rather than as a gap,
 * and it passed every structural review: a reviewer sees the artifacts that exist and has no list
 * of the ones that should.
 *
 * This check is that list. Per Intent subject it fails on:
 *
 *   [A1] no volatility harvest — or one that annotates no provenance, which is the Run-2 shape
 *        with a file in front of it (ADR-040 §1: "every gateway, every 'it depends', every 1-of-N
 *        annotated with provenance");
 *   [A2] no operational-concerns pass (load, deployment, integrations, non-functional constraints;
 *        ADR-040 §1 asks for one structured pass BEFORE Intent — this is where it is asked for);
 *   [A3] no provenance record for the subject — the recorded session's notes/transcript, or the
 *        written brief that stands in for it when the Software Architect delegates the business
 *        content (ADR-028, ADR-040 §1);
 *   [A4] no business map, or a business process with no entry in it — the map is "one entry per BP"
 *        and it is the surface Intent makes an economic decision on;
 *   [A5] no GREEN SELF-WALK of the mockup for the subject — the build must walk itself before a
 *        human does (mockup-requirements M-18), and the Software Architect ruled on 2026-09-01
 *        (#1162) that this stops being conditional on a project having bothered: a green self-walk
 *        run is a CONDITION OF LEAVING THE MOCKUP STAGE, so Gate 1 does not open without it.
 *
 * WHY [A5] IS HERE AND NOT IN `seqmap complete` (#1162, and do not re-propose it). The same gap —
 * a Sequence-Map path no walk of the app can produce — could have been asked at Blueprint entry by
 * teaching `seqmap complete` to read this evidence. It was considered and REJECTED: `seqmap
 * complete` runs against the model alone, which is exactly what lets it run before a mockup exists,
 * and a mockup-aware mode would both make a mockup a precondition of a Design-stage check and give
 * one job two checking mechanisms. The check keeps its single home in the mockup harness's COVER
 * family (screen-dsl v1.15.0, #1161); what changed is that running it is no longer optional.
 *
 * WHICH FILE SATISFIES WHICH CHANNEL — the convention, so the check is not guessing. It is stated
 * here in full rather than cited: this file ships inside the plugin, where the Golden Process
 * programme's own documents do not travel. The three planning channels are PER RUN and PER SUBJECT:
 * a run adds a business-process family, holds its own Intent for it
 * (`04_Gates/gate-1-intent-<subject>/`), and writes its own dated artifacts. So a file in
 * `docs/01_Planning/` satisfies a channel when
 *
 *   - its FILENAME carries the channel keyword (`volatility-harvest`, `operational-concerns`, or one
 *     of `interview` / `transcript` / `recording` / `business-brief` / `provenance`), AND
 *   - its filename OR its title heading names the SUBJECT — the family this Intent is held over
 *     (`reservations`, `ordering`, ...). The dated `YYYY-MM-DD-<subject>-<channel>.md` form Run 3
 *     used satisfies both at once; Run 2's `2026-07-13 Interview - Notes.md` names its subject in
 *     the title ("Ordering domain") instead, and that counts.
 *
 * Naming the subject is the load-bearing half: without it, a second family added to a project that
 * already ran the side-channels once would be waved through on the FIRST family's harvest — the
 * present-but-unexercised check this program keeps finding, installed by hand.
 *
 * The business map is ONE file per project (`05_Business-Map/business-map.md`), not per subject, so
 * it is checked against EVERY business process in `01_Business-Processes/` — the way a new family
 * gets added to the docs tree and never priced.
 *
 * A file too short to be an artifact is treated as absent: a placeholder that satisfies a check is
 * a green over an absence, which is the thing being fixed here, not a lighter version of it.
 *
 * Sibling of `construction-entry-check` (#733) — the same decision at the Specification-stage boundary, SA-adopted
 * together on 2026-08-19.
 *
 * Exit: 0 all five ran · 1 a channel is missing · 2 usage.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// ---------------------------------------------------------------------------- arguments

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const planningDir = flag('--planning');
const businessDir = flag('--business');
const gatesDir = flag('--gates');
const subject = flag('--subject');
if (!planningDir || !businessDir || !gatesDir || !subject) {
  console.error('intent-entry-check: --planning <dir> --business <dir> --gates <dir> --subject <slug> are all required');
  process.exit(2);
}
const processesDir = join(businessDir, '01_Business-Processes');
const mapPath = join(businessDir, '05_Business-Map', 'business-map.md');
for (const p of [planningDir, businessDir, processesDir, gatesDir]) {
  if (!existsSync(p)) { console.error(`intent-entry-check: missing ${p}`); process.exit(2); }
}

const rel = (p) => relative(process.cwd(), p);
const problems = [];
const note = (p) => problems.push(p);

/** Lowercase, every run of non-alphanumerics to a single dash: "2026-07-13 Interview - Notes.md"
 *  and "2026-08-16-reservations-volatility-harvest.md" become comparable. */
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const slug = norm(subject).replace(/^-|-$/g, '');

/** Under this, a file is a placeholder rather than an artifact — see the header. */
const MIN_CHARS = 400;

// ---------------------------------------------------------------------------- the planning tree

const planningFiles = readdirSync(planningDir)
  .filter((f) => f.toLowerCase().endsWith('.md'))
  .filter((f) => statSync(join(planningDir, f)).isFile())
  .map((f) => {
    const text = readFileSync(join(planningDir, f), 'utf-8');
    // The subject may be named in the filename or in the document's title heading.
    const title = (text.split('\n').find((l) => l.startsWith('# ')) ?? '');
    return { file: f, path: join(planningDir, f), name: norm(f), title: norm(title), text };
  });

/**
 * The one artifact of `planningDir` that satisfies a channel, or a reason it is not satisfied.
 * A file matching the keywords but naming a DIFFERENT subject is reported as such: silently
 * reading "not for this family" as "absent" is how the Run-2 gap stayed invisible.
 */
function channel({ id, what, keywords, why }) {
  const keyworded = planningFiles.filter((f) => keywords.some((k) => f.name.includes(norm(k))));
  const mine = keyworded.filter((f) => f.name.includes(slug) || f.title.includes(slug));
  if (!mine.length) {
    const others = keyworded.map((f) => f.file);
    note(others.length
      ? `[${id}] no ${what} for \`${subject}\` — ${rel(planningDir)} holds ${others.join(', ')}, ` +
        `naming another subject. ${why}`
      : `[${id}] no ${what} — nothing in ${rel(planningDir)} is named ${keywords.map((k) => `\`*${k}*\``).join(' or ')}. ${why}`);
    return null;
  }
  const substantial = mine.filter((f) => f.text.trim().length >= MIN_CHARS);
  if (!substantial.length) {
    note(`[${id}] ${mine.map((f) => f.file).join(', ')} is a placeholder, not the ${what} ` +
      `(under ${MIN_CHARS} characters) — a channel satisfied by a stub is a green over an absence. ${why}`);
    return null;
  }
  return substantial[0];
}

// --------------------------------------------------------- [A1] the volatility harvest

const harvest = channel({
  id: 'A1',
  what: 'volatility harvest',
  keywords: ['volatility-harvest', 'volatilities'],
  why: 'The harvest is a declared INPUT to Design (Step 2: decomposition works "from the Discovery-stage ' +
       'harvest"). Without it the volatilities are invented during decomposition and back-described ' +
       'into the model, and "the decomposition matches the harvest" is not a checkable claim (#634).',
});
if (harvest && !/provenance/i.test(harvest.text))
  note(`[A1] ${harvest.file} annotates no provenance — ADR-040 §1 asks for every gateway, every ` +
       `"it depends" and every 1-of-N annotated with where it came from. A harvest whose rows cite ` +
       `nothing is the Run-2 shape with a file in front of it: Design still cannot be measured against it.`);

// ------------------------------------------------------ [A2] the operational-concerns pass

channel({
  id: 'A2',
  what: 'operational-concerns pass',
  keywords: ['operational-concerns', 'operational-concepts'],
  why: 'ADR-040 §1 asks for one structured pass over load, deployment, integrations and ' +
       'non-functional constraints BEFORE Intent — this is where it is asked for. Discovered at ' +
       'Specification instead, an operational constraint costs a model change after the blueprint froze.',
});

// ---------------------------------------------------------------- [A3] the provenance record

channel({
  id: 'A3',
  what: 'provenance record',
  keywords: ['interview', 'transcript', 'recording', 'business-brief', 'provenance'],
  why: 'ADR-028/ADR-040 §1: every artifact element traces to a recorded stakeholder statement. The ' +
       'record is the session (its notes or transcript), or the written brief that stands in for it ' +
       'when the Software Architect delegates the business content — but something must be citable.',
});

// ------------------------------------------------------------------- [A4] the business map

// #1148 — a NON-LIVE process (its .bpd header declares `status dissolved|retired|parked`)
// carries no price tag on purpose: its scope is not an Intent decision any more (dissolved /
// retired) or expressly not yet one (parked). Exempting it here is what stops live-only rules
// from being applied to a corpse — the failure the figaro run measured. Header line-scan only;
// bpmn-dsl owns the grammar.
const nonLiveBps = new Set();
{
  const dg = join(processesDir, 'diagrams');
  if (existsSync(dg))
    for (const f of readdirSync(dg).filter((x) => /\.bpd$/i.test(x))) {
      const src = readFileSync(join(dg, f), 'utf-8');
      if (!/^\s*status\s+(?:dissolved|retired|parked)\b/m.test(src)) continue;
      const idm = src.match(/^@startbpmn\s+(BP\d+)/m);
      if (idm) nonLiveBps.add(idm[1]);
    }
}

const processes = readdirSync(processesDir)
  .filter((f) => /^BP\d+/.test(f) && f.endsWith('.md'))
  .map((f) => ({ id: f.match(/^BP\d+/)[0], file: f }))
  .filter((bp) => !nonLiveBps.has(bp.id));

if (!existsSync(mapPath)) {
  note(`[A4] no business map — ${rel(mapPath)} does not exist, so Intent has no surface on which ` +
       `scope and priority are an economic decision (ADR-040 §1: AI-built, one entry per BP, the ` +
       `stakeholder and the Software Architect define the numbers).`);
} else {
  const map = readFileSync(mapPath, 'utf-8');
  if (map.trim().length < MIN_CHARS) {
    note(`[A4] ${rel(mapPath)} is a placeholder, not a business map (under ${MIN_CHARS} characters).`);
  } else if (!processes.length) {
    note(`[A4] ${rel(processesDir)} holds no BPxx_*.md — the business map cannot be checked against ` +
         `the process set, which is itself a failure.`);
  } else {
    for (const bp of processes) {
      const row = new RegExp(`^\\|\\s*${bp.id}\\s*\\|`, 'm').test(map);
      const entry = new RegExp(`^#{2,}\\s+${bp.id}\\b`, 'm').test(map);
      if (!row && !entry)
        note(`[A4] ${bp.id}: a business process with no entry in ${rel(mapPath)} — ${bp.file} exists ` +
             `and carries no price tag, so Intent would decide its scope without its number (#634).`);
      else if (!row)
        note(`[A4] ${bp.id}: has a section in ${rel(mapPath)} but no row in a summary table — the ` +
             `at-a-glance surface the gate works from (business-map-format.md §Form).`);
      else if (!entry)
        note(`[A4] ${bp.id}: has a summary row in ${rel(mapPath)} but no \`## ${bp.id}\` entry — the ` +
             `challengeable detail (baseline, value mechanism, arithmetic basis) is what makes the ` +
             `number adjustable at the gate.`);
    }
  }
}

// -------------------------------------------------------- [A5] the mockup self-walk

// #1162 (SA ruling 2026-09-01, option C): a green self-walk is a CONDITION OF LEAVING THE MOCKUP
// STAGE. M-18 already required the build to walk itself before a human does, and the harness
// already asserts five families over the run (WALK, REACH, COVER, SHOWS, HONEST) — but a
// requirement only speaks in a project that bothered to run it. This is where it stops being
// optional.
//
// WHICH FILE SATISFIES THE CHANNEL — the convention, stated here in full for the same reason the
// planning conventions above are: the evidence is the `selfwalk/1` JSON the harness writes with
// `--out`, committed as `selfwalk.json` in the subject's own Gate-1 record directory
// (`04_Gates/gate-intent-<subject>/`), which is where M-18 says the evidence attaches. A project
// that never split its gate records per family may keep it in the single `04_Gates/gate-intent/`
// — but ONLY while that is the only Gate-1 record directory it has. Once a project has one
// subject-suffixed directory, every subject needs its own: reading a second family's evidence off
// the first family's record is the same waving-through [A1]-[A3] name as their load-bearing half.
//
// THE ONE EXEMPTION, AND IT CLOSES ITSELF. A Gate 1 that was already BLESSED before 2026-09-01 —
// the day the requirement was ruled — is not a gate being opened; it is history, and its record is
// const. Such a subject is excused, loudly, on stdout. No gate blessed on or after that date can
// claim the exemption, so it expires by itself and no allowlist has to be maintained.

const SELFWALK_RULED = '2026-09-01';   // #1162
// #1182/ADR-068 added two families the same idiom: EDGE (a drawn system→system hand-off fires
// as the consequence of its declared source) and STALE (the declared si-export hash equals the
// current export). Evidence produced for a gate blessed before that decision legitimately
// carries five families; a gate blessed on or after it cannot — the exemption closes itself.
const EDGE_STALE_RULED = '2026-09-02';

function selfwalkGateDir() {
  const own = join(gatesDir, `gate-intent-${slug}`);
  if (existsSync(own)) return own;
  const suffixed = readdirSync(gatesDir).filter((d) => /^gate-intent-./.test(d));
  const plain = join(gatesDir, 'gate-intent');
  if (!suffixed.length && existsSync(plain)) return plain;
  return null;
}

/** `status: blessed` + a `blessed:` date before the given ruling — the self-closing exemption. */
function blessedBeforeTheRuling(dir, cutoff = SELFWALK_RULED) {
  const recordPath = join(dir, 'record.yaml');
  if (!existsSync(recordPath)) return null;
  const text = readFileSync(recordPath, 'utf-8');
  if (!/^status:\s*blessed\s*$/m.test(text)) return null;
  const date = text.match(/^blessed:\s*"?(\d{4}-\d{2}-\d{2})"?\s*$/m)?.[1];
  return date && date < cutoff ? { date, recordPath } : null;
}

/** Everything the walk-plan may excuse must carry a written reason — the harness records an
 *  excused operation as `… — declared reason: <reason>`, and an empty reason is silence with
 *  punctuation in front of it. */
const excuseWithoutReason = (n) => {
  const m = /declared reason:(.*)$/s.exec(n.detail ?? '');
  return m ? !m[1].trim() : false;
};

const selfwalkDir = selfwalkGateDir();
const evidencePath = selfwalkDir ? join(selfwalkDir, 'selfwalk.json') : null;
let excusedSelfwalk = null;
let selfwalkSummary = null;

if (!selfwalkDir) {
  note(`[A5] no Gate-1 record directory for \`${subject}\` — ${rel(join(gatesDir, `gate-intent-${slug}`))} ` +
       `does not exist, so there is nowhere the mockup's self-walk evidence could attach. M-18 puts ` +
       `it in the gate record; #1162 makes a green run a condition of leaving the Mockup stage.`);
} else if (!existsSync(evidencePath)) {
  const historic = blessedBeforeTheRuling(selfwalkDir);
  if (historic) {
    excusedSelfwalk = historic;
  } else {
    note(`[A5] no self-walk evidence — ${rel(evidencePath)} does not exist. The build must walk ` +
         `itself before a human does (M-18): run the mockup harness ` +
         `(\`bpm-selfwalk.mjs --plan <walk-plan> --out ${rel(evidencePath)}\`) and commit the ` +
         `\`selfwalk/1\` file it writes. A mockup nobody drove is a mockup whose paths may be ` +
         `producible by no walk at all, and Gate 1 would bless it (#1162, SA ruling 2026-09-01).`);
  }
} else {
  const raw = readFileSync(evidencePath, 'utf-8');
  let ev = null;
  if (raw.trim().length < MIN_CHARS) {
    note(`[A5] ${rel(evidencePath)} is a placeholder, not self-walk evidence (under ${MIN_CHARS} ` +
         `characters) — a channel satisfied by a stub is a green over an absence.`);
  } else {
    try { ev = JSON.parse(raw); }
    catch (e) { note(`[A5] ${rel(evidencePath)} is not readable as JSON (${e.message}) — the harness ` +
                     `writes it with \`--out\`; a hand-edited evidence file is not evidence.`); }
  }
  if (ev) {
    if (ev.format !== 'selfwalk/1') {
      note(`[A5] ${rel(evidencePath)} declares format \`${ev.format ?? '(none)'}\`, not \`selfwalk/1\` ` +
           `— only the harness's own evidence counts, so that the five families are the ones M-18 names.`);
    } else {
      const fails = Array.isArray(ev.fails) ? ev.fails : [];
      const notes = Array.isArray(ev.notes) ? ev.notes : [];
      const fam = ev.families ?? {};
      const FAMILIES = ['WALK', 'REACH', 'COVER', 'SHOWS', 'HONEST'];
      const missing = FAMILIES.filter((f) => !fam[f]);
      if (missing.length)
        note(`[A5] ${rel(evidencePath)} carries no verdict for ${missing.join(', ')} — M-18 asks for ` +
             `seven assertion families and a run that judged fewer of ` +
             `them has not walked this build.`);
      // #1182/ADR-068: EDGE and STALE joined the family list. A gate blessed before that
      // decision keeps its five-family evidence (excused loudly below); a gate blessed on or
      // after it owes all seven — a redrawn block or a dead hand-off edge must not cross Gate 1
      // unjudged (the Figaro walk of 2026-09-02 is why the families exist).
      const missingNew = ['EDGE', 'STALE'].filter((f) => !fam[f]);
      const preAdr068 = blessedBeforeTheRuling(selfwalkDir, EDGE_STALE_RULED);
      if (missingNew.length && !preAdr068)
        note(`[A5] ${rel(evidencePath)} carries no verdict for ${missingNew.join(', ')} — the EDGE and ` +
             `STALE families are conditions since ${EDGE_STALE_RULED} (#1182/ADR-068): re-run the ` +
             `self-walk with the current harness (and name \`siExports\` in the plan).`);
      else if (missingNew.length && preAdr068)
        console.log(`intent-entry-check: [A5] ${rel(evidencePath)} predates the EDGE/STALE families — ` +
             `excused because this Gate 1 was blessed on ${preAdr068.date}, before ${EDGE_STALE_RULED} ` +
             `(#1182/ADR-068). A gate blessed on or after that date owes all seven families.`);
      // STALE that judged nothing is the COVER-empty shape: M-21 [core] builds are authored
      // against the si-exports, so a plan naming none cannot detect a redrawn block.
      if (fam.STALE && !(fam.STALE.exports > 0) && !preAdr068)
        note(`[A5] STALE judged nothing — the walk plan names no \`siExports\` directory (or it holds ` +
             `no export), so a block redrawn after the build would drift silently. M-21: the build is ` +
             `authored against the si-exports and declares their hashes.`);
      if (fails.length) {
        for (const f of fails.slice(0, 10))
          note(`[A5] the self-walk is RED — [${f.family ?? '?'}]${f.op ? ` ${f.op}` : ''}` +
               `${f.path ? ` ${f.path}` : ''}: ${f.detail ?? ''}`);
        if (fails.length > 10) note(`[A5] … and ${fails.length - 10} further finding(s) in ${rel(evidencePath)}.`);
      }
      if (!(fam.WALK?.paths > 0))
        note(`[A5] the self-walk drove no path — evidence with an empty WALK family is a harness that ` +
             `ran, not a build that was walked.`);
      // COVER is the family #1162 is about: its denominator is the map, narrowed to the business
      // processes the app's own view registry says it serves. An empty denominator is the family
      // saying nothing, which is precisely the conditional the ruling removed.
      if (fam.COVER && !(fam.COVER.processes?.length))
        note(`[A5] COVER judged nothing — no view of the mockup declares a \`bp\`, so the Sequence Map ` +
             `could not be narrowed to what this app serves and no operation was in the denominator. ` +
             `A silent COVER is the conditional guarantee #1162 removed, not a pass.`);
      else if (fam.COVER && !(fam.COVER.operations > 0))
        note(`[A5] COVER judged no operation — the map names none for the process(es) this app serves ` +
             `(${(fam.COVER.processes ?? []).join(', ')}), so nothing could go unfired.`);
      selfwalkSummary =
        `${fam.WALK?.paths ?? 0} path(s) walked, ` +
        `REACH ${fam.REACH?.fired ?? 0}/${fam.REACH?.declared ?? 0}, ` +
        `COVER ${fam.COVER?.covered ?? 0}/${fam.COVER?.operations ?? 0} over ` +
        `${(fam.COVER?.processes ?? []).join(', ') || 'no process'}, ` +
        `SHOWS ${fam.SHOWS?.claims ?? 0} claim(s), HONEST ${fam.HONEST?.panels ?? 0} panel(s)`;
      for (const n of notes.filter(excuseWithoutReason))
        note(`[A5] [${n.family}] ${n.op ?? ''}: excused with an EMPTY reason — uncovered and unreached ` +
             `operations are allowed only with a reason declared in the walk plan, never silently (M-18).`);
    }
  }
}

// ---------------------------------------------------------------------------- verdict

if (problems.length) {
  for (const p of problems) console.error(`intent-entry-check: ${p}`);
  console.error(
    `\n${problems.length} problem(s). Intent does not open over these: a gate presented with fewer ` +
    `inputs than it declares delivers a thinner result than its inputs declare, and before this ` +
    `check it did so silently (ADR-049 §8a applied to a gate — refuse loudly, produce nothing). ` +
    `#634 (the four side-channels) and #1162 (the mockup self-walk).`);
  process.exit(1);
}
const selfwalkLine = excusedSelfwalk
  ? `NO self-walk evidence — excused because this Gate 1 was blessed on ${excusedSelfwalk.date}, ` +
    `before the requirement was ruled on ${SELFWALK_RULED} (${rel(excusedSelfwalk.recordPath)}). ` +
    `A gate blessed on or after that date cannot be excused this way (#1162).`
  : `the mockup walked itself green — ${rel(evidencePath)}: ${selfwalkSummary}.`;
console.log(
  `intent-entry-check: OK — all four ADR-040 §1 side-channels ran for \`${subject}\`: ` +
  `volatility harvest (${harvest.file}, with provenance), operational concerns, provenance record, ` +
  `and a business map pricing all ${processes.length} business process(es). [A5] ` + selfwalkLine);
