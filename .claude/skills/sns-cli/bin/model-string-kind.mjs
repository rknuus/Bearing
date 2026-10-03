#!/usr/bin/env node
/**
 * model-string-kind (#1384) — a model attribute typed `string` must carry a STRUCTURED reason for
 * being one. No reason, no string.
 *
 * ═══ THE RULE, AND WHOSE IT IS ══════════════════════════════════════════════════════════════
 *
 * The Software Architect, 2026-09-08, ruling this lint into existence:
 *
 *     "And about the linter: shall it 'error on any string, which has no reason why it must be a
 *      string'. IOW: If an llm wants a string, it needs to somehow argue 'why' (in the model)"
 *
 * It is the enforcement half of a rule he accepted in the same turn — *"a rule the design states is
 * enforced by a mechanism — type, constraint, index, contract signature, behaviour spec. A rule
 * that lives only in prose is a finding."* A `string` with no stated reason is exactly that: every
 * rule about its contents lives in prose, and nothing holds them.
 *
 * ERROR SCOPE IS HIS AND IT IS (b). Put to him as (a) *error on new and changed attributes only,
 * behind a baseline that must not grow* versus (b) *error on all of them, and the Contract gate
 * waits for one delegated justification pass over the model*, his answer was one letter: «b». So
 * this lint has NO grandfather baseline and NO ratchet. It reports every unjustified string
 * attribute in the model, on the first run, and he accepted that cost knowingly.
 *
 * ═══ THE `kind` VOCABULARY IS A PROPOSAL, NOT HIS RULING ════════════════════════════════════
 *
 * He answered the error SCOPE and explicitly did not answer WHICH kinds exist. The table below is
 * the recommended starting shape, filed as such in #1384, and nothing anywhere should present it as
 * decided. It is deliberately DATA (`KINDS`), not code: a kind is added by adding a row.
 *
 * Why the reason must be structured at all: a free-text reason is gameable — *"because it holds
 * text"* — and a gameable reason is prose again, which is the very thing the rule calls a finding.
 * Each kind therefore carries fields a checker can VERIFY.
 *
 *   kind           requires                       consequence
 *   ───────────────────────────────────────────────────────────────────────────────────────────
 *   enum           values                         it is then NOT a string: declare an enum type
 *                                                 (the model store already carries `enums:`) or a
 *                                                 CHECK constraint. Leaving it a string IS the
 *                                                 error — this kind never passes.
 *   external-id    source (system.field), width   somebody else's identifier, e.g. a Business
 *                                                 Central `Code[20]`. The width is theirs, not ours.
 *   free-text      width, opaque: true            opaque means NO RULE READS INSIDE IT, which is
 *                  (round_trip: true)             what buys it out of owing a CHECK constraint.
 *                                                 `round_trip` is optional and says the exact
 *                                                 comparison is a `durable` fate's read-back.
 *   document       format, validation             a payload in a named format, e.g. `ISJSON`.
 *   (absent)       —                              ERROR. This is the whole rule.
 *
 * ═══ THE SIX SHAPES, AND THE TWO THAT ARE THIS LINT'S ═══════════════════════════════════════
 *
 * The clean-up round these lints enforce is closing six shapes. Two of them are strings:
 *
 *   shape 4  an untyped match mode on string selectors     → rule `selector-is-not-a-string`
 *   shape 5  a free-text actor or reason compared exactly  → rule `free-text-compared-exactly`
 *
 * Shape 4 is why a selector name is judged on its own and not only by the missing-`kind` rule: a
 * `MatchMode` that claims `free-text` would otherwise pass, and `MatchMode` is not free text under
 * any reading — it is an enumeration wearing a string. Shape 5 falls out of the table's own
 * semantics rather than from anything invented here: `free-text` means opaque, opaque means no rule
 * reads inside, and comparing the value EXACTLY is a rule reading inside it. The model omits
 * `comparison_class` when it is the default `exact` (ModelEngine keeps the store minimal), so
 * "absent" and "exact" are the same statement and both are the contradiction. An attribute that
 * really must be compared exactly is not opaque, and therefore is one of the other three kinds.
 *
 * Shape 5 does NOT fire on a REQUEST DTO (an operation's `inputDto`, or a variant of one). A request
 * field is compared by no oracle — `comparison_class` is the spec-runner's comparer semantics for
 * what a caller is TOLD — so the finding there would have no remedy, and a finding with no remedy
 * teaches its readers to argue with the lint instead of fixing the model. The missing-`kind` rule
 * still covers requests in full; only the comparison contradiction is result-side.
 *
 * ═══ THE THREE REFUSALS #1412 REMOVED, AND THE ONE IT KEPT ═══════════════════════════════════
 *
 * Figaro's justification pass ran the table over a real model and met three places where the lint
 * refused the TRUTHFUL answer. All three are fixed; none of them widens what may pass.
 *
 *   1. A SELECTOR-SHAPED NAME may now carry a complete `external-id` or `document`
 *      (`SELECTOR_TOLERATED_KINDS`). A value another system enumerates — an IANA media type, a
 *      channel's own `payment_method`, a bridge's raw status word — is exactly what `external-id`
 *      was written for, and the annotation is verified before it is accepted. `free-text` on such a
 *      name is STILL refused: our own enumeration wearing opaque prose is what shape 4 is for.
 *
 *   2. `free-text` + `round_trip: true` is no longer a shape-5 contradiction. The exact comparison
 *      on a clerk's stored remark is the ADR-059 write-then-read-back property derived from a
 *      `durable` fate — an assertion that the store returned what it was given, reading nothing
 *      inside the text.
 *
 *   3. A REQUEST VARIANT is now recognised as a request. `requestDtoNames` compared DTO names
 *      against the store's UUID-valued `extends`, so the variant chain never grew and six honest
 *      request fields were judged as results. Fixed in `model-attributes.mjs`; see the note there.
 *
 * The rule the SA's refusal of suppression makes load-bearing: each of these stops the lint
 * REFUSING A TRUE STATEMENT. None makes a false one pass, and none is a rename.
 *
 * ═══ WHAT THIS LINT DOES NOT DO ═════════════════════════════════════════════════════════════
 *
 * `int` without a range, `decimal` without precision or currency, `datetime` without a zone are the
 * same rule and are OUT OF SCOPE here — #1384 says strings first. When they arrive they are more
 * rows in a table like this one, in a sibling module; do not widen this one silently.
 *
 * ═══ THE ANNOTATION HAS NO WRITER YET ═══════════════════════════════════════════════════════
 *
 * `sns-cli` cannot write `kind:` today: `ModelEngine`'s DTO-field key sets (`DtoAddFieldsJsonKeys`,
 * `DtoFieldSemanticsKeys`) are closed, and an unrecognised key is a named refusal by design. The
 * carrier is therefore owed before the justification pass can record a single answer, and it is not
 * built here on purpose: building an authoring surface for a vocabulary he has not ruled would
 * publish the proposal as decided. #1385 carries the writer and the ruling it waits on; #1386
 * carries the gate wiring, which cannot go green before the writer exists.
 *
 * Usage:
 *   model-string-kind.mjs (--model <architecture.yaml> | --project <dir>) [--json]
 *   model-string-kind.mjs --draft <ref> --sns-project <name> [--json]
 *
 * `--draft` lints a DRAFT before it is promoted (#1438), by projecting its op-log through
 * `sns-cli project --emit canonical-yaml` — the same bytes the store would carry. It answers the
 * one question an annotation wave has and could not ask: did the batch actually cure the findings?
 * Behind a promote on a real project sits the contract regeneration (Figaro: 1,141 files), so the
 * alternative was promoting blind or re-implementing this lint's input by hand. `--sns-project` is
 * the REGISTERED project name, which is not `--project` (a directory); see `model-attributes.mjs`.
 *
 * Exit: 0 = every string attribute states why it is a string
 *       1 = at least one does not
 *       2 = usage error, or an unreadable model
 */

import {
  attributes, declaredEnums, isStringTyped, parseArgs, readAnnotation,
  report, requestDtoNames, resolveModelDoc,
} from './model-attributes.mjs';

const TOOL = 'model-string-kind';

/**
 * The kind table. PROPOSAL (#1384) — see the header. Each row is:
 *   requires  keys that must be present and non-empty
 *   check     optional extra validation, returns a sentence when the row is wrong
 *   never     when set, the kind is ALWAYS a finding on a string — its message says why
 */
export const KINDS = {
  'enum': {
    requires: ['values'],
    never: (a, enums) =>
      'the values are enumerated, so this is not a string: declare an enum type in the model '
      + `(the store already carries ${enums.size} — \`enums:\` on the owning component) and type the `
      + 'attribute with it, or demand a CHECK constraint at the store. Leaving an enumeration typed '
      + '`string` is the error the kind reports about itself',
  },
  'external-id': {
    requires: ['source', 'width'],
    check: (props) => {
      const source = String(props.source ?? '');
      if (!source.includes('.'))
        return `\`source\` must name the foreign system AND its field (\`System.Field\`); it says \`${source}\``;
      const width = Number(props.width);
      if (!Number.isInteger(width) || width <= 0)
        return `\`width\` must be the foreign system's declared width as a positive integer; it says \`${props.width}\``;
      return null;
    },
  },
  'free-text': {
    requires: ['width', 'opaque'],
    check: (props) => {
      const width = Number(props.width);
      if (!Number.isInteger(width) || width <= 0)
        return `\`width\` must be a positive integer; it says \`${props.width}\``;
      if (props.opaque !== true)
        return '`opaque` must be `true` — free text earns its exemption from a CHECK constraint by '
             + 'stating that NO RULE READS INSIDE IT. Text a rule reads inside is one of the other kinds';
      if (props.round_trip != null && props.round_trip !== true)
        return '`round_trip` may only be `true` — it states that the exact comparison on this field '
             + 'IS the ADR-059 write-then-read-back property of a `durable` fate. Absent means the '
             + 'field claims no round trip; there is no third answer';
      return null;
    },
  },
  'document': {
    requires: ['format', 'validation'],
  },
};

/**
 * Names that read as a SELECTOR — an attribute whose value chooses a behaviour. Every one of these
 * is an enumeration; none of them is text. Whole trailing word, or the whole name.
 *
 * Kept deliberately tight. A name-shaped rule is a heuristic, and a wide heuristic in enforcement
 * code teaches its readers to argue with it instead of fixing the model.
 */
export const SELECTOR_WORDS = [
  'Mode', 'Kind', 'Type', 'Strategy', 'Method', 'Variant', 'Status', 'State',
  'Verdict', 'Match', 'Selector', 'Policy', 'Category', 'Direction', 'Format', 'Channel',
];

/**
 * The kinds a SELECTOR-SHAPED NAME may still carry (#1412 point 1), once the kind table has
 * verified the annotation is complete.
 *
 * The heuristic above catches OUR enumerations wearing a string. `external-id` and `document` are
 * the two kinds that say the value is enumerated by SOMEBODY ELSE — an IANA media type, a payment
 * channel's own gateway id, a bridge's raw status word — and each pays for the claim with fields a
 * checker verifies: `external-id` names the foreign `System.Field` and its declared width,
 * `document` names the format and its validation. A complete one of those is a truthful answer, and
 * refusing it left the model no answer at all.
 *
 * `free-text` is NOT here and must not be added: an enumeration of ours claiming to be opaque prose
 * is precisely the case shape 4 exists for, and it is the one line of the heuristic that has to
 * survive. `enum` is not here either, for the opposite reason — it never reaches this line, because
 * an enumeration typed `string` is a finding about itself whatever it is named.
 */
export const SELECTOR_TOLERATED_KINDS = new Set(['external-id', 'document']);

/** Does this attribute name read as a selector? `MatchMode`, `PricingMode`, `Mode`, `State`. */
export function isSelectorName(name) {
  return SELECTOR_WORDS.some((w) => name === w || (name.endsWith(w) && /[a-z]/.test(name[name.length - w.length - 1] ?? '')));
}

/** ONE finding per attribute, most specific rule first — the output IS a worklist, so it is 1:1. */
export function judge(attr, enums, ctx = { requests: new Set() }) {
  const { name, type, parsed } = attr;
  const ann = readAnnotation(attr.field, 'kind');
  const stringTyped = isStringTyped(type);

  if (!stringTyped) {
    if (ann) return {
      rule: 'kind-on-a-non-string',
      message: `declares \`kind: ${ann.name}\` on type \`${type}\`, which is not a string. The kind `
             + 'states why an attribute must be TEXT; on a typed attribute it states nothing and hides '
             + 'the annotation from the pass that is meant to read it',
    };
    return null;
  }

  const where = parsed.collection ? `\`${type}\` (a collection of strings — the ELEMENT is the string)` : `\`${type}\``;

  if (!ann) {
    if (isSelectorName(name)) return {
      rule: 'selector-is-not-a-string',
      message: `${where} named as a selector, with no \`kind\`. A selector's values are enumerated by `
             + 'definition — the attribute chooses a behaviour — so this is `kind: enum`, and an '
             + 'enumeration is not a string: declare an enum type and type the attribute with it. '
             + 'If the enumeration is SOMEBODY ELSE\'S — an open foreign registry the system carries '
             + 'un-evaluated — say so with a complete `external-id` (the foreign `System.Field` and '
             + 'its width) or `document`, which this rule accepts on a name like this',
    };
    return {
      rule: 'kind-missing',
      message: `${where} with no \`kind\`. State why it must be text — one of `
             + `${Object.keys(KINDS).map((k) => `\`${k}\``).join(', ')} — with the fields that kind requires. `
             + 'A string whose contents nothing constrains is a rule living in prose',
    };
  }

  const kind = KINDS[ann.name];
  if (!kind) return {
    rule: 'kind-unknown',
    message: `declares \`kind: ${ann.name}\`, which is not one of `
           + `${Object.keys(KINDS).map((k) => `\`${k}\``).join(', ')}. The set is closed on purpose: an `
           + 'unknown kind reads as "justified" while nothing can verify it',
  };

  const missing = kind.requires.filter((k) => ann.props[k] == null || ann.props[k] === '');
  if (missing.length) return {
    rule: 'kind-incomplete',
    message: `declares \`kind: ${ann.name}\` without ${missing.map((k) => `\`${k}\``).join(' and ')}. `
           + `\`${ann.name}\` is verifiable only with ${kind.requires.map((k) => `\`${k}\``).join(', ')}; `
           + 'without them the kind is a free-text reason wearing a keyword',
  };

  if (kind.never) return { rule: 'enum-is-not-a-string', message: kind.never(attr, enums) };

  const complaint = kind.check?.(ann.props, attr);
  if (complaint) return { rule: 'kind-incomplete', message: `declares \`kind: ${ann.name}\`, but ${complaint}` };

  // Shape 4, second face. A selector-shaped NAME is refused when it claims to be free text — that
  // is the gaming the heuristic exists for, and #1412 keeps it (its own proposal says so). It is
  // NOT refused when the attribute carries a COMPLETE `external-id` or `document`: by this line the
  // kind table has already verified the annotation, so the model has named a foreign system and
  // field with a declared width, or a format with its validation. A value ANOTHER system
  // enumerates is exactly the case `external-id` was written for — an IANA media type, a channel's
  // own `payment_method varchar(100)`, a bridge's raw status word — and refusing it left no
  // truthful answer at all: the honest kind was the one the lint would not take, and the escapes
  // were a false kind or a rename. Renaming a contract field to dodge a heuristic is not a cure.
  if (isSelectorName(name) && !SELECTOR_TOLERATED_KINDS.has(ann.name)) return {
    rule: 'selector-is-not-a-string',
    message: `named as a selector and declared \`kind: ${ann.name}\`. A selector's values are `
           + 'enumerated — it chooses a behaviour — so on a name like this the honest kinds are '
           + '`enum` (and an enumeration is not a string: declare an enum type and type the '
           + 'attribute with it) or, when the values are enumerated by SOMEBODY ELSE, a complete '
           + '`external-id` (naming the foreign `System.Field` and its width) or `document`',
  };

  // Shape 5. `free-text` means opaque; opaque means no rule reads inside; comparing the value
  // exactly IS a rule reading inside. The model omits `comparison_class` when it is the default
  // `exact`, so absent and `exact` are the same statement.
  //
  // `round_trip: true` is the one honest exception (#1412 point 2). Prose a clerk types, stored and
  // read straight back, is compared exactly by the ADR-059 DERIVED write-then-read-back property of
  // a `durable` fate — and that comparison is not a rule reading inside the text, it is the
  // assertion that the store did not eat it. Nothing about the value's CONTENT is read. Without
  // this the only escapes were a false kind or a loosened comparison class, both of which make the
  // model say something untrue to silence a checker.
  //
  // It is SELF-ASSERTED, exactly as `opaque: true` is, and for the same reason: this lint reads the
  // model store and nothing else. The machine check lives where the fact does — the owning Access's
  // Resource Protocol Sheet, where `resource-protocol-check` already refuses a `durable` fate with
  // no `roundTrip: {write, read}` pair, and the spec runner derives the property from it. A
  // `round_trip: true` the sheet does not back is a finding for the Contract reviewer holding both,
  // not for a lint holding one.
  if (ann.name === 'free-text' && ann.props.round_trip !== true && !ctx.requests.has(attr.dtoName)) {
    const cc = attr.comparisonClass;
    const how = cc == null
      ? '`comparison_class` is absent, which is how the model store writes the default `exact`'
      : '`comparison_class: exact`';
    if (cc == null || cc.toLowerCase() === 'exact') return {
      rule: 'free-text-compared-exactly',
      message: 'declares `kind: free-text` with `opaque: true` — no rule reads inside it — and is '
             + `compared EXACTLY (${how}). Comparing the text IS a rule reading inside it: either it `
             + 'is not opaque (and is then `external-id`, `document` or an enumeration), or it must '
             + 'not be compared exactly — or the exact comparison IS the ADR-059 write-then-read-back '
             + 'property of a `durable` fate on this Access\'s Resource Protocol Sheet, which is '
             + '`round_trip: true` beside the `opaque: true`',
    };
  }

  return null;
}

/** Every finding over a parsed model, in model order. Exported for the tests and for reuse. */
export function findings(doc) {
  const enums = declaredEnums(doc);
  const ctx = { requests: requestDtoNames(doc) };
  const out = [];
  for (const attr of attributes(doc)) {
    const f = judge(attr, enums, ctx);
    if (f) out.push({ address: attr.address, name: attr.name, type: attr.type, ...f });
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
  const strings = all.filter((a) => isStringTyped(a.type));
  process.exit(report(TOOL, findings(doc), {
    json: !!opts.json,
    subject,
    clean: `${strings.length} string attribute(s) of ${all.length} state why they are text, and no `
         + 'kind is declared on a typed attribute',
  }));
}
