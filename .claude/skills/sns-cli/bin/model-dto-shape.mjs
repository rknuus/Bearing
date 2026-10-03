#!/usr/bin/env node
/**
 * model-dto-shape (#1382) — a discriminator or a bool flag standing beside conditionally valid
 * properties is where POLYMORPHIC SUBTYPES belong.
 *
 * ═══ THE RULE, AND WHOSE IT IS ══════════════════════════════════════════════════════════════
 *
 * The Software Architect, 2026-09-08, stating it as a general design rule:
 *
 *     "Ein Hinweis: instead of 'competing properties', polymorphic DTOs is usually the better
 *      approach: The 'caller' knows what it needs to know and sends the right DTO, the specific one,
 *      so the callee knows what he needs to do (which strategy to choose). The Result is polymorphic
 *      again. Record this as a general rule in designing these kind of systems."
 *
 * and one minute later, on a store row he was shown:
 *
 *     "'string PricingMode' -> this should not be a string. leverage polymorphic DTOs, one for
 *      'margin-based', one for 'discount-based', then, also the optionals disappear"
 *
 * and, ordering the clean-up round these lints enforce:
 *
 *     "we didn't leverage polymorphic [DTOs] properly or actually not at all in [various] cases. […]
 *      Usually, I'm not saying always, but usually should be for one specific case. Hence,
 *      properties should usually not contradict each other like two can be optional, then we have at
 *      least four states how properties can be populated within the same [DTO]."
 *
 * ═══ "USUALLY" IS HIS WORD, AND IT IS THE DESIGN OF THIS LINT ═══════════════════════════════
 *
 * He said "usually", twice, deliberately. So this lint REPORTS; it does not get to be right about
 * every site. Every finding is suppressible PER ATTRIBUTE with a recorded, closed-set justification
 * (`shape_ok`, below) — the same discipline as #1384's `kind`: an excuse a machine can read, never a
 * free-text one, because a free-text excuse is prose and prose is what both lints exist to end.
 * A suppression that no finding uses is itself a finding, on the rule that an exception must not
 * outlive its subject.
 *
 * ═══ THE SIX SHAPES, AND THE FOUR THAT ARE THIS LINT'S ══════════════════════════════════════
 *
 *   shape 1  a required value left undefined on a miss branch    → `flag-beside-required-value`
 *   shape 2  a bool refusal carrying no reason                   → `refusal-without-reason`
 *   shape 3  an always-true required flag                        → `flag-on-a-variant`
 *   shape 6  a verdict or mode discriminator standing beside
 *            conditionally-valid properties                      → `discriminator-beside-conditionals`
 *                                                                  and `competing-decisions`
 *
 * (Shapes 4 and 5 are strings and belong to `model-string-kind.mjs`.)
 *
 * Shape 6 has a worked precedent already — `CheckOfferPriceAgainstMinimum` carrying `PricingMode`
 * AND `AlsoCheckDiscountAgainstMinimum`, two properties competing for the same decision — so it is
 * split across TWO rules rather than one, because the two faces fail differently and want different
 * remedies: a discriminator beside optionals splits into one request DTO per strategy, whereas two
 * decision-bearing attributes in one DTO are already two decisions and the second one is usually
 * the first one restated.
 *
 * Shape 3 needs its mechanical reading spelled out, because "always true" is not decidable from a
 * type. What IS decidable, and what the shape actually is in the field, is a LEFTOVER: once a DTO
 * has been split into polymorphic variants, the flag that used to discriminate survives inside a
 * variant where it can only ever hold one value. So `flag-on-a-variant` fires on an outcome flag
 * carried by a DTO that participates in an ADR-027 `extends` relation — as base or as variant.
 * That makes the rule most useful exactly where it is most needed: catching a HALF-DONE split,
 * which is the state this round can leave a tree in.
 *
 * ═══ THE SUPPRESSION ════════════════════════════════════════════════════════════════════════
 *
 * On the attribute, in either spelling `model-attributes.mjs` reads:
 *
 *     shape_ok: single-strategy          shape_ok: {name: single-strategy, ref: '#1382'}
 *     shape_ok_ref: '#1382'
 *
 *   wire-format      the DTO mirrors an external wire format this design does not own, so its shape
 *                    is not ours to choose
 *   single-strategy  the discriminator selects among behaviours that share EVERY property — there is
 *                    no conditionally valid property in fact, so there is nothing to split
 *   ruled            ruled at this site by the Software Architect; `ref` names the ruling
 *
 * `ref` is required on every code, always. An excuse nobody can trace back is the same as no excuse.
 * The vocabulary is a PROPOSAL in the same sense as #1384's kinds: he ruled the rule, not the codes.
 *
 * ═══ THE ANNOTATION HAS NO WRITER YET ═══════════════════════════════════════════════════════
 *
 * As with `kind:` (#1384), `sns-cli` cannot write `shape_ok:` today — `ModelEngine`'s DTO-field key
 * sets are closed and refuse an unrecognised key by name. The carrier is owed before the round can
 * record a single suppression, and is deliberately not built here: #1385 carries the writer and the
 * ruling it waits on, #1386 the gate wiring that cannot go green before it.
 *
 * Usage:
 *   model-dto-shape.mjs (--model <architecture.yaml> | --project <dir>) [--json]
 *   model-dto-shape.mjs --draft <ref> --sns-project <name> [--json]
 *
 * `--draft` lints a DRAFT before it is promoted (#1438), by projecting its op-log through
 * `sns-cli project --emit canonical-yaml` — the same bytes the store would carry. It answers the
 * one question a wave of `shape_ok:` suppressions has and could not ask: is each of them still
 * used, and did the batch cure what it claimed? `--sns-project` is the REGISTERED project name,
 * which is not `--project` (a directory); see `model-attributes.mjs`.
 *
 * Exit: 0 = no unsuppressed finding, and every suppression is used
 *       1 = at least one finding, or a malformed or stale suppression
 *       2 = usage error, or an unreadable model
 */

import {
  attributes, extendedBases, parseArgs, parseType, readAnnotation, report,
  requestDtoNames, resolveModelDoc,
} from './model-attributes.mjs';
import { isSelectorName } from './model-string-kind.mjs';

const TOOL = 'model-dto-shape';

/** The closed set of suppression codes. PROPOSAL (#1382) — see the header. */
export const SHAPE_OK_CODES = ['wire-format', 'single-strategy', 'ruled'];

/**
 * Bool names that assert an OUTCOME — the value a polymorphic result type states by BEING that
 * type. Whole-name matches plus the four prefixes an author reaches for.
 */
export const OUTCOME_WORDS = [
  'Found', 'Exists', 'Present', 'Success', 'Succeeded', 'Ok', 'Accepted', 'Allowed', 'Approved',
  'Valid', 'Applied', 'Matched', 'Available', 'Refused', 'Rejected', 'Denied', 'Blocked', 'Failed',
  'Cancelled', 'Canceled', 'Skipped', 'Handled',
];
const OUTCOME_PREFIXES = ['Is', 'Has', 'Was', 'Can', 'Should', 'Did'];

/** The subset of outcome names that assert a REFUSAL or a verdict, which is what owes a reason. */
export const REFUSAL_WORDS = [
  'Refused', 'Rejected', 'Denied', 'Blocked', 'Failed', 'Accepted', 'Allowed', 'Approved', 'Valid',
  'Ok', 'Success', 'Succeeded',
];

/** Names that carry the reason a refusal owes. */
export const REASON_WORDS = ['Reason', 'Why', 'Cause', 'Error', 'Failure', 'Refusal', 'Explanation', 'Message'];

/**
 * REQUEST-side bool prefixes: a toggle that chooses what the callee does. This is the half of the
 * vocabulary that catches `AlsoCheckDiscountAgainstMinimum` — the attribute the Interviewer of relay
 * R-074 called *«genau das Muster»* when the Software Architect stated the rule — which asserts no
 * outcome and is nonetheless a decision. It is used ONLY by `isDecision`; the three result-side rules
 * (`flag-beside-required-value`, `refusal-without-reason`, `flag-on-a-variant`) stay on outcomes,
 * because a request toggle has no false branch to leave a value undefined on.
 */
export const TOGGLE_PREFIXES = [
  'Also', 'Include', 'Exclude', 'With', 'Without', 'Use', 'Enable', 'Disable', 'Force', 'Skip',
  'Only', 'Ignore', 'Omit', 'Suppress', 'Require', 'Check', 'Validate', 'Apply',
];

const endsWord = (name, word) =>
  name === word || (name.endsWith(word) && /[a-z0-9]/.test(name[name.length - word.length - 1] ?? ''));

export const isBool = (type) => parseType(type).element === 'bool';
export const isOutcomeName = (n) =>
  OUTCOME_WORDS.some((w) => endsWord(n, w))
  || OUTCOME_PREFIXES.some((p) => n.startsWith(p) && /^[A-Z]/.test(n.slice(p.length)));
export const isRefusalName = (n) => REFUSAL_WORDS.some((w) => endsWord(n, w));
export const namesAReason = (n) => REASON_WORDS.some((w) => n.includes(w));
export const isToggleName = (n) =>
  TOGGLE_PREFIXES.some((p) => n.startsWith(p) && /^[A-Z]/.test(n.slice(p.length)));

/**
 * A DECISION-BEARING attribute: the value that tells the callee which behaviour to run. Either a
 * selector by name (`PricingMode`, `MatchMode` — the string lint's vocabulary, shared so the two
 * lints cannot disagree about what a selector is) or a bool that asserts an outcome or sets a toggle.
 */
export const isDecision = (attr) =>
  isSelectorName(attr.name)
  || (isBool(attr.type) && (isOutcomeName(attr.name) || isToggleName(attr.name)));

/** Read and validate the per-attribute suppression. Returns `{code, ref}` or a `problem` sentence. */
export function readSuppression(field) {
  const ann = readAnnotation(field, 'shape_ok');
  if (!ann) return null;
  const code = ann.name;
  const ref = ann.props.ref == null ? '' : String(ann.props.ref).trim();
  if (!SHAPE_OK_CODES.includes(code))
    return { problem: `declares \`shape_ok: ${code}\`, which is not one of ${SHAPE_OK_CODES.map((c) => `\`${c}\``).join(', ')}. `
                    + 'The set is closed so that an excuse is readable by a machine; an unknown code reads as '
                    + '"excused" while stating nothing' };
  if (!ref)
    return { problem: `declares \`shape_ok: ${code}\` with no \`ref\`. Every suppression names the ruling, `
                    + 'issue or Q&A entry it rests on — an excuse nobody can trace back is the same as no excuse' };
  return { code, ref };
}

/** ONE finding per attribute, most specific rule first — the output IS a worklist, so it is 1:1. */
export function judge(attr, ctx) {
  const { name, type, siblings } = attr;
  const others = siblings.filter((f) => f !== attr.field);
  const optionals = others.filter((f) => parseType(f.type).optional);
  const decisions = siblings.filter((f) => isDecision({ name: String(f.name ?? ''), type: String(f.type ?? '') }));

  // ── shape 6, face two: two decisions in one DTO. Reported on the SECOND and later ones, so a
  //    DTO with three of them yields two findings and the first stays the one to keep or split on.
  if (isDecision(attr) && decisions.length > 1 && decisions.indexOf(attr.field) > 0) {
    const first = String(decisions[0].name ?? '?');
    return {
      rule: 'competing-decisions',
      message: `\`${type}\` stands beside \`${first}\` — two attributes competing for the SAME decision `
             + '(which behaviour the callee runs) in one DTO, which is at least four ways to populate it '
             + 'and two of them contradictory. The caller knows what it wants: send the specific request '
             + 'DTO for it and let the callee dispatch on the type',
    };
  }

  // ── shape 6, face one: a discriminator beside properties that are valid only for some of its values.
  if (isSelectorName(name) && optionals.length >= 2) {
    return {
      rule: 'discriminator-beside-conditionals',
      message: `\`${type}\` is a discriminator standing beside ${optionals.length} optional propert`
             + `${optionals.length === 1 ? 'y' : 'ies'} (${optionals.map((f) => `\`${f.name}\``).join(', ')}), `
             + 'which exist only for some of its values. That is one DTO with '
             + `${2 ** optionals.length} populations and ${2 ** optionals.length - 1} of them wrong. `
             + 'Split it: one request DTO per strategy, the result polymorphic in the same way, and the '
             + 'optionals disappear',
    };
  }

  if (isBool(type) && isOutcomeName(name)) {
    // ── shape 3: the flag survived the split, so inside this variant it can only ever be one value.
    //    Not scoped to results: a REQUEST variant carrying the flag it was split on is the same
    //    leftover, and the split this round performs makes request variants as well as result ones.
    const inRelation = attr.extends != null || ctx.bases.has(attr.dtoName);
    if (inRelation) {
      const role = attr.extends != null ? `a variant of \`${attr.extends}\`` : 'the base of a variant relation';
      return {
        rule: 'flag-on-a-variant',
        message: `\`${type}\` asserts an outcome on \`${attr.dtoName}\`, which is ${role}. The TYPE already `
               + 'states that outcome, so the flag holds one value for the whole life of this DTO — a '
               + 'required field that can never be false is a leftover of the split, not a fact. Delete it',
      };
    }

    // The two rules below are statements about what a CALLER IS TOLD, so a REQUEST DTO is out of
    // their scope: a request field has no false branch and refuses nobody. A DTO reachable from no
    // operation — a store row, a nested record — is not a request and stays in scope.
    if (ctx.requests.has(attr.dtoName)) return null;

    // ── shape 1: a value nothing defines on the flag's false branch.
    const required = others.filter((f) => {
      const t = parseType(f.type);
      return !t.optional && t.element !== 'bool' && f.name != null;
    });
    if (required.length) {
      return {
        rule: 'flag-beside-required-value',
        message: `\`${type}\` is a flag standing beside ${required.length} REQUIRED value`
               + `${required.length === 1 ? '' : 's'} (${required.map((f) => `\`${f.name}: ${f.type}\``).join(', ')}). `
               + `Nothing in the model defines what ${required.length === 1 ? 'it holds' : 'they hold'} when `
               + `\`${name}\` is false, so every caller invents an answer. Make the two branches two result `
               + 'types: the hit carries the value and no flag, the miss carries neither',
      };
    }

    // ── shape 2: a refusal that does not say why.
    if (isRefusalName(name) && !others.some((f) => namesAReason(String(f.name ?? '')))) {
      return {
        rule: 'refusal-without-reason',
        message: `\`${type}\` is a refusal verdict and this DTO carries no reason beside it. A caller told `
               + 'only "no" can neither report nor branch, so the reason gets reconstructed at the call site '
               + 'from whatever else is in scope. Carry it — or better, make the refusal its own result type '
               + 'whose fields ARE the reason',
      };
    }
  }

  return null;
}

/** Every finding over a parsed model, plus the suppression bookkeeping. */
export function findings(doc) {
  const ctx = { bases: extendedBases(doc), requests: requestDtoNames(doc) };
  const out = [];
  for (const attr of attributes(doc)) {
    const sup = readSuppression(attr.field);
    if (sup?.problem) { out.push({ address: attr.address, rule: 'suppression-malformed', message: sup.problem }); continue; }
    const f = judge(attr, ctx);
    if (f) {
      if (sup) continue; // excused, and the excuse is well formed and used
      out.push({ address: attr.address, name: attr.name, type: attr.type, ...f });
    } else if (sup) {
      out.push({
        address: attr.address,
        rule: 'suppression-stale',
        message: `declares \`shape_ok: ${sup.code}\` (ref ${sup.ref}) and this attribute is no longer a `
               + 'finding. An exception must not outlive its subject — drop the key',
      });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────── main
if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2), TOOL, {
    flags: ['json'], values: ['model', 'project', 'draft', 'snsProject'],
  });
  const { doc, subject } = resolveModelDoc(opts, TOOL);
  const all = [...attributes(doc)];
  const dtoCount = new Set(all.map((a) => `${a.componentName}.${a.facetName}.${a.dtoName}`)).size;
  process.exit(report(TOOL, findings(doc), {
    json: !!opts.json,
    subject,
    clean: `${all.length} attribute(s) over ${dtoCount} DTO(s) — no discriminator or flag stands beside `
         + 'conditionally valid properties, and every suppression is well formed and still used',
  }));
}
