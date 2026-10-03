#!/usr/bin/env node
/**
 * transcript-prefilter — the handover retro's sole window onto a session
 * transcript (ADR-056 §5), and the mechanical source of the
 * session-metrics/3 numbers (§7).
 *
 * Raw transcripts are read exactly once, by this filter — never by the
 * retro agent directly: tool payloads dominate transcript bytes and would
 * recreate the context-growth problem the retro exists to audit.
 *
 * Filtering: keeps user/assistant messages — text blocks verbatim,
 * timestamps, model ids, per-message usage. Tool payloads are CLIPPED, never
 * omitted (#782): every tool_use input and tool_result body keeps a head and
 * a tail excerpt plus its true byte count, and relay-carrying calls (tmux
 * send-keys / capture-pane, AskUserQuestion, SendMessage) get a far larger
 * budget, because on a conductor the Software Architect's rulings arrive
 * inside those payloads and nowhere else.
 *
 * Inbound turns are recovered as well (#806): a message the human sent while
 * the session was busy is written to the transcript as a `queue-operation`
 * record and — when it was submitted by interrupt rather than dequeued —
 * NEVER gets a `type: user` record of its own. Those turns are emitted here,
 * marked `source: "queue-operation"`, deduplicated against the user records
 * that did land. A handover retro that cannot see a ruling cannot audit it.
 *
 * The dedup is why `dropped.by_type` can show `queue-operation` counts that
 * are NOT lost turns — and a retro reading that census as "human turns you
 * will never see" downgrades its own fidelity verdict for nothing (#1063).
 * So every queue record is accounted for by REASON, and a transcript that
 * contained any of them opens with a `prefilter-notice` line saying which
 * were recovered and why the rest were not — in the retro's own input, not
 * only in the opt-in `--usage-summary` it may never run.
 *
 * Other line types are counted by type, not emitted.
 *
 *   node transcript-prefilter.mjs <transcript.jsonl> [--out <path>]
 *   node transcript-prefilter.mjs <transcript.jsonl> --usage-summary [--out <path>]
 *
 * The usage summary is an honest estimate: token totals from the
 * transcript, wall/active minutes from timestamps (gaps > 5 min are idle),
 * cost at LIST PRICE from the versioned table below, always marked
 * estimated; an unknown model yields cost_usd: null rather than a guess.
 *
 * `counts.dispatches` here is ONLY the in-process subagent spawns (Task /
 * Agent tool calls) — it is not the session's dispatch total and must not be
 * read as one (#838). A conductor dispatches by opening a detached tmux
 * window or running `claude -p`, both of which are Bash calls, so this
 * number is 0 for every conductor by construction. The session-metrics/3
 * row adds the ledger children (entries whose `parent` is the session) to
 * it; the conduct ledger, not the transcript, is where a dispatch is
 * recorded.
 */

import { readFileSync, writeFileSync } from 'node:fs';

// List prices per MTok, marked estimated in every row we emit. Update the
// version string when the table changes so rows stay comparable.
// 2026-09-list-3-opus-5-5: the Opus 5.5 row carries the real list price, read
// off the anthropic.com pricing table the Software Architect pasted on
// 2026-09-23 (screenshot committed in figaro at 65d833a08,
// .theagent/conduct/notes/2026-09-23_opus-5-5-list-price.png).
const PRICE_TABLE_VERSION = '2026-09-list-3-opus-5-5';
const PRICES = {
  // Priced, never prescribed: the toolchain stopped naming this tier on
  // 2026-09-03 (#1231), but the Software Architect may still choose it in the
  // app's UI at any time, and a session it ran must still be costed.
  // Its cache READ is a quarter of Claude
  // Fable 5's, which is why the row is its own rather than an alias of it — a
  // long design session is mostly cache reads, and pricing it off the old row
  // overstates the run by more than the model change did.
  'claude-fable-5-1': { input: 10, output: 50, cache_read: 0.25, cache_write: 12.5 },
  'claude-fable-5': { input: 10, output: 50, cache_read: 1, cache_write: 12.5 },
  // List price per the anthropic.com pricing table the Software Architect
  // pasted on 2026-09-23 (figaro 65d833a08): cache reads $0.20, input $4,
  // output $20, cache writes $5 per 1M tokens. Replaces the provisional row of
  // 2026-09-22, which copied Opus 5's rates (theagent-unchained#1891).
  'claude-opus-5-5': { input: 4, output: 20, cache_read: 0.2, cache_write: 5 },
  'claude-opus-5': { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
  'claude-sonnet-5': { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
  'claude-haiku-4-5': { input: 1, output: 5, cache_read: 0.1, cache_write: 1.25 },
};

const IDLE_GAP_MINUTES = 5;

/**
 * WHICH MODEL THE TRANSCRIPT RAN ON — the LAST assistant message carrying a
 * real id, never the first, and never the harness's `<synthetic>` placeholder.
 *
 * THIS IS A COPY OF ONE RULE, and the copy is deliberate: the runtime's
 * `src/conduct/transcript-model.ts` holds the same three lines with the whole
 * argument written out, and it cannot be imported here — this file is run by a
 * handover retro from an installed project, with no runtime on its path. The
 * two are held together by `tests/transcript-model.test.ts`, which drives BOTH
 * readers over the SAME fixtures and fails when they disagree.
 *
 * Why the test exists at all: the rule was fixed ONCE, in the runtime's reader
 * (#1265), and its change note claimed `ledger measure` was covered too.
 * `ledger measure` shells out to THIS file, which stayed first-wins, so every
 * Interviewer forked from a session on another tier reported the PARENT's model
 * and booked $0.00 for its whole life — four rows on one run before anyone
 * noticed (#1297).
 */
function pickTranscriptModel(previous, candidate) {
  const real = typeof candidate === 'string' && candidate !== '' && candidate !== '<synthetic>';
  return real ? candidate : previous;
}

// Payload budgets, in bytes. Every payload is clipped to one of these — head
// and tail around a stated elision, so the freshest lines of a captured pane
// survive as well as its first (#782). Omission was the bug; size is not.
const GENERIC_PAYLOAD_CAP = 800;
const RELAY_PAYLOAD_CAP = 8000;

// Total excerpt budget for NON-relay payloads across one transcript. A very
// long implementor session has thousands of Read/Edit calls, and 800 bytes of
// each would drown the retro this filter exists to keep small. Relay traffic
// is never charged to it — that is the material #782 was filed about — and an
// exhausted budget is reported in the summary, never silently applied.
const GENERIC_PAYLOAD_BUDGET = 250_000;

// A call is relay traffic when its tool name or its input says so. Tool names
// first (MCP tmux tools, the question menu, agent messaging); then the shape a
// conductor's relay takes through Bash.
const RELAY_TOOL_NAME = /tmux|AskUserQuestion|SendMessage/i;
const RELAY_INPUT = /send-keys|capture-pane|paste-text|send-enter|\btmux\b/i;

// Why a `queue-operation` record was not emitted as a turn of its own. Each
// of these means its text is accounted for — present elsewhere in the output,
// or never there to begin with — so a notice built from them can say plainly
// that nothing inbound is missing. A reason outside this set cannot, which is
// the point of naming them rather than counting one total (#1063).
const LOSSLESS_QUEUE_DROPS = new Set(['already_delivered', 'already_recovered', 'no_text']);

function main(argv) {
  const args = argv.slice(2);
  const wantSummary = args.includes('--usage-summary');
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined;
  // Positionals: everything that is neither a flag nor --out's value (#753).
  const outValueIdx = outIdx >= 0 ? outIdx + 1 : -1;
  const files = args.filter((a, i) => !a.startsWith('--') && i !== outValueIdx);
  if (files.length !== 1) {
    process.stderr.write(
      'usage: transcript-prefilter.mjs <transcript.jsonl> [--usage-summary] [--out <path>]\n'
    );
    return 2;
  }

  let text;
  try {
    text = readFileSync(files[0], 'utf-8');
  } catch (err) {
    process.stderr.write(`transcript-prefilter: cannot read ${files[0]}: ${err.message}\n`);
    return 1;
  }

  const { filtered, summary } = process_(text);
  const output = wantSummary
    ? JSON.stringify(summary, null, 2) + '\n'
    : filtered.map((l) => JSON.stringify(l)).join('\n') + '\n';
  if (outPath !== undefined) {
    writeFileSync(outPath, output, 'utf-8');
    process.stderr.write(`transcript-prefilter: wrote ${outPath}\n`);
  } else {
    process.stdout.write(output);
  }
  return 0;
}

function process_(text) {
  const filtered = [];
  const totals = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  let model;
  let assistantMessages = 0;
  // #1321 — ONE API RESPONSE IS UP TO THREE JSONL LINES, AND EVERY ONE OF THEM
  // CARRIES THE SAME `usage`. Claude Code writes the text block and each
  // `tool_use` block of one response as separate assistant records sharing one
  // `message.id`; the usage object is the RESPONSE's, repeated verbatim on each.
  // Summing per line therefore counts a text+tool_use response twice and a
  // text+two-tool_uses response three times. Measured on the figaro run
  // (2026-09-07, 15 conductor transcripts, 27.6 MB): S-340 had 149 assistant
  // lines and 90 unique ids, and its recorded cost was USD 17.17 against a true
  // 10.17; across 14 conductors of one day, USD 386.38 recorded against 210.69.
  // Every session-metrics/3 row, node rollup and gate-record cost annex was
  // inflated 1.7-2.0x, and — because the factor rises with tool calls per
  // response — the inflation differs per session, so comparisons between
  // sessions and roles were skewed too, not merely shifted.
  //
  // So usage is taken ONCE PER `message.id`. A line with no id is counted on its
  // own: an unidentified response is one response, and dropping it would trade
  // an overcount for an undercount.
  const usageSeenIds = new Set();
  let duplicateUsageLines = 0;
  let toolCalls = 0;
  let dispatches = 0;
  let recoveredTurns = 0;
  let queueRecords = 0;
  const queueDropReasons = {};
  let otherLines = 0;
  const droppedByType = {};
  let firstTs;
  let lastTs;
  let prevTs;
  let activeMs = 0;

  const records = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // partial trailing line mid-write — the crash-only normal
      otherLines += 1;
      droppedByType.unparsable = (droppedByType.unparsable ?? 0) + 1;
    }
  }

  // Pass 1 — what the second pass needs to know about the whole file:
  // which inbound text already landed as a `user` record (so a recovered
  // queued turn is not emitted twice), and which tool calls carry relay
  // traffic (their RESULTS inherit the larger budget: a captured pane, where
  // the Software Architect's reply actually arrives, is a tool_result).
  const inboundSeen = [];
  const relayResults = new Set();
  for (const parsed of records) {
    if (parsed.type !== 'user' && parsed.type !== 'assistant') continue;
    const content = parsed.message?.content;
    if (typeof content === 'string') {
      if (parsed.type === 'user') inboundSeen.push(content);
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block === null || typeof block !== 'object') continue;
      if (parsed.type === 'user' && block.type === 'text' && typeof block.text === 'string') {
        inboundSeen.push(block.text);
      }
      if (block.type === 'tool_use' && typeof block.id === 'string' && isRelayCall(block)) {
        relayResults.add(block.id);
      }
    }
  }
  const emittedQueued = new Set();
  const budget = { generic: GENERIC_PAYLOAD_BUDGET, exhausted: 0 };

  for (const parsed of records) {
    const ts = typeof parsed.timestamp === 'string' ? Date.parse(parsed.timestamp) : NaN;
    if (!Number.isNaN(ts)) {
      if (firstTs === undefined) firstTs = ts;
      lastTs = ts;
      if (prevTs !== undefined) {
        const gap = ts - prevTs;
        if (gap > 0 && gap <= IDLE_GAP_MINUTES * 60_000) activeMs += gap;
      }
      prevTs = ts;
    }

    if (parsed.type !== 'user' && parsed.type !== 'assistant') {
      // An order the human sent mid-turn lives ONLY here when it was
      // submitted by interrupt: enqueued, then removed without ever being
      // written as a user message (#806). Recover it; drop the rest — but
      // WITH the reason, so the notice can say whether anything was lost.
      const queued = recoverQueuedTurn(parsed, inboundSeen, emittedQueued);
      if (queued !== undefined) {
        queueRecords += 1;
        if (queued.record !== undefined) {
          filtered.push(queued.record);
          recoveredTurns += 1;
          continue;
        }
        queueDropReasons[queued.reason] = (queueDropReasons[queued.reason] ?? 0) + 1;
      }
      otherLines += 1;
      const kind = typeof parsed.type === 'string' ? parsed.type : 'unknown';
      droppedByType[kind] = (droppedByType[kind] ?? 0) + 1;
      continue;
    }
    const message = parsed.message ?? {};
    if (parsed.type === 'assistant') {
      assistantMessages += 1;
      model = pickTranscriptModel(model, message.model);
      const u = message.usage;
      if (u !== undefined) {
        // #1321 — once per API response, keyed on `message.id`. The line is still
        // emitted with its own `usage` verbatim: this is an ACCOUNTING rule, and
        // the filtered stream stays a faithful slim copy of the transcript.
        const responseId = typeof message.id === 'string' ? message.id : null;
        if (responseId !== null && usageSeenIds.has(responseId)) {
          duplicateUsageLines += 1;
        } else {
          if (responseId !== null) usageSeenIds.add(responseId);
          totals.input += u.input_tokens ?? 0;
          totals.output += u.output_tokens ?? 0;
          totals.cache_read += u.cache_read_input_tokens ?? 0;
          totals.cache_write += u.cache_creation_input_tokens ?? 0;
        }
      }
    }

    const slim = {
      type: parsed.type,
      ...(typeof parsed.timestamp === 'string' ? { timestamp: parsed.timestamp } : {}),
      message: {
        ...(typeof message.role === 'string' ? { role: message.role } : {}),
        ...(typeof message.model === 'string' ? { model: message.model } : {}),
        ...(message.usage !== undefined ? { usage: message.usage } : {}),
        content: slimContent(message.content, relayResults, budget, (block) => {
          if (block.type === 'tool_use') {
            toolCalls += 1;
            // In-process subagents only; tmux/`claude -p` dispatches are
            // Bash calls and are counted from the ledger instead (#838).
            if (block.name === 'Task' || block.name === 'Agent') dispatches += 1;
          }
        }),
      },
    };
    filtered.push(slim);
  }

  // The retro reads the filtered stream and may never run `--usage-summary`,
  // so the inbound accounting leads the file it does read (#1063).
  const inbound = inboundAccounting(recoveredTurns, queueDropReasons);
  if (queueRecords > 0) {
    filtered.unshift({ type: 'prefilter-notice', about: 'inbound-turns', ...inbound });
  }

  const wallMinutes =
    firstTs !== undefined && lastTs !== undefined ? Math.round((lastTs - firstTs) / 60_000) : 0;
  const prices = model !== undefined ? PRICES[model] : undefined;
  const cost =
    prices === undefined
      ? null
      : {
          estimate:
            Math.round(
              (totals.input * prices.input +
                totals.output * prices.output +
                totals.cache_read * prices.cache_read +
                totals.cache_write * prices.cache_write) /
                10_000
            ) / 100,
          basis: 'list-price',
          prices: PRICE_TABLE_VERSION,
        };

  const summary = {
    format: 'transcript-prefilter/1',
    model: model ?? null,
    tokens: totals,
    cost_usd: cost,
    time: { wall_minutes: wallMinutes, active_minutes: Math.round(activeMs / 60_000) },
    counts: {
      messages: assistantMessages,
      // #1321 — the number of API RESPONSES the tokens above were summed from,
      // and the number of assistant LINES that shared one. Reported rather than
      // silently applied: a reader comparing a new row against an old one needs
      // to see WHY the same transcript now costs less, and a deduplication
      // nobody can see is indistinguishable from a transcript that got shorter.
      responses: assistantMessages - duplicateUsageLines,
      duplicate_usage_lines: duplicateUsageLines,
      tool_calls: toolCalls,
      dispatches,
      recovered_turns: recoveredTurns,
    },
    // What became of every `queue-operation` record, by reason (#1063). The
    // `by_type` census below counts the same drops, but a record type alone
    // cannot say whether a human turn was lost or merely shown once.
    inbound_turns: inbound,
    // Named by record type, not one opaque total (#806): a retro must be able
    // to see WHAT the filter refused to show it.
    dropped: {
      other_lines: otherLines,
      by_type: droppedByType,
      ...(budget.exhausted > 0 ? { payloads_over_budget: budget.exhausted } : {}),
    },
  };
  return { filtered, summary };
}

/**
 * A `queue-operation` record carrying text the session never received as a
 * `user` record — the interrupt-submitted order of #806. Returns `{ record }`
 * to emit, `{ reason }` when this queue record is not emitted as a turn of its
 * own, or undefined when the line is not a queue operation at all.
 *
 * The reason matters as much as the record (#1063): every one of them below
 * means the text is already in the output, or was never in the record, and a
 * retro that cannot tell that from an outright loss qualifies its fidelity
 * verdict for nothing.
 */
function recoverQueuedTurn(parsed, inboundSeen, emittedQueued) {
  if (parsed.type !== 'queue-operation') return undefined;
  const content = typeof parsed.content === 'string' ? parsed.content.trim() : '';
  // A bare queue marker — a `dequeue` line closing a turn whose text rode in
  // on its `enqueue`. There is nothing here to lose.
  if (content === '') return { reason: 'no_text' };
  // The same text appears on enqueue and again on dequeue/remove.
  const key = content.slice(0, 400);
  if (emittedQueued.has(key)) return { reason: 'already_recovered' };
  // A dequeued message is delivered normally and is already in the output;
  // match on a prefix, because delivery wraps it (system reminders, etc.).
  const probe = content.slice(0, 200);
  if (inboundSeen.some((seen) => seen.includes(probe))) return { reason: 'already_delivered' };
  emittedQueued.add(key);
  return {
    record: {
      type: 'user',
      ...(typeof parsed.timestamp === 'string' ? { timestamp: parsed.timestamp } : {}),
      // Provenance, so a retro never mistakes this for a normal turn: it was
      // read out of the queue record, and the session may have received it
      // mid-turn rather than at a clean boundary.
      source: 'queue-operation',
      message: { role: 'user', content: [{ type: 'text', text: content }] },
    },
  };
}

/**
 * The inbound-turn accounting the notice and the summary both carry (#1063):
 * how many queued turns were recovered, how many queue records were not shown
 * as turns of their own, and — in one sentence a retro cannot misread —
 * whether any inbound TEXT is therefore missing from the filtered transcript.
 */
function inboundAccounting(recovered, reasons) {
  const dropped = Object.values(reasons).reduce((a, b) => a + b, 0);
  const unaccounted = Object.keys(reasons).filter((r) => !LOSSLESS_QUEUE_DROPS.has(r));
  const said = {
    already_delivered: 'already present here as an ordinary user record',
    already_recovered: 'the enqueue/remove twin of a turn already shown here',
    no_text: 'a bare queue marker carrying no text',
  };
  const why = Object.entries(reasons).map(
    ([reason, n]) => `${n} ${said[reason] ?? `dropped for an unaccounted reason (${reason})`}`
  );
  const note =
    unaccounted.length > 0
      ? `WARNING: ${unaccounted.join(', ')} — inbound text may be missing from this transcript; qualify any fidelity verdict.`
      : dropped === 0
        ? 'Every queue-operation record is shown above as a user turn; no inbound text is missing.'
        : `No inbound text is missing: the ${dropped} queue-operation record(s) not shown as turns of their own are ${why.join('; ')}.`;
  return {
    recovered,
    dropped,
    dropped_reasons: reasons,
    all_text_accounted_for: unaccounted.length === 0,
    note,
  };
}

/** Does this tool call carry the human relay (tmux, the question menu)? */
function isRelayCall(block) {
  if (typeof block.name === 'string' && RELAY_TOOL_NAME.test(block.name)) return true;
  const input = typeof block.input === 'string' ? block.input : JSON.stringify(block.input ?? '');
  return RELAY_INPUT.test(input);
}

function slimContent(content, relayResults, budget, onBlock) {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (!Array.isArray(content)) return [];
  return content.map((block) => {
    if (block === null || typeof block !== 'object') return { type: 'unknown' };
    onBlock(block);
    if (block.type === 'text') return { type: 'text', text: block.text ?? '' };
    if (block.type === 'thinking') {
      return { type: 'thinking', bytes: byteLength(block.thinking ?? '') };
    }
    if (block.type === 'tool_use') {
      const relay = isRelayCall(block);
      const excerpt = excerptFor(block.input, relay, budget);
      return {
        type: 'tool_use',
        name: block.name ?? '?',
        bytes: excerpt.bytes,
        ...(relay ? { relay: true } : {}),
        ...(excerpt.text !== undefined ? { input: excerpt.text } : {}),
        ...(excerpt.clipped ? { clipped: true } : {}),
        ...(excerpt.overBudget ? { over_budget: true } : {}),
      };
    }
    if (block.type === 'tool_result') {
      const relay = typeof block.tool_use_id === 'string' && relayResults.has(block.tool_use_id);
      const excerpt = excerptFor(block.content, relay, budget);
      return {
        type: 'tool_result',
        bytes: excerpt.bytes,
        ...(relay ? { relay: true } : {}),
        ...(excerpt.text !== undefined ? { content: excerpt.text } : {}),
        ...(excerpt.clipped ? { clipped: true } : {}),
        ...(excerpt.overBudget ? { over_budget: true } : {}),
      };
    }
    return { type: block.type ?? 'unknown' };
  });
}

/**
 * One payload's excerpt: relay traffic always gets one, everything else until
 * the transcript's generic budget runs out — after which the payload is a
 * byte count again, flagged `over_budget` so the loss is visible where it
 * happened.
 */
function excerptFor(value, relay, budget) {
  const clipped = clip(value, relay ? RELAY_PAYLOAD_CAP : GENERIC_PAYLOAD_CAP);
  if (relay) return clipped;
  const spend = Buffer.byteLength(clipped.text, 'utf-8');
  if (spend > budget.generic) {
    budget.exhausted += 1;
    return { bytes: clipped.bytes, overBudget: true };
  }
  budget.generic -= spend;
  return clipped;
}

/**
 * Clip to `cap` bytes keeping BOTH ends: the head says what the call was, the
 * tail carries the freshest lines of a captured pane — which is exactly where
 * a relayed ruling sits. The true size is always reported.
 */
function clip(value, cap) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  const buf = Buffer.from(raw, 'utf-8');
  const bytes = buf.length;
  if (bytes <= cap) return { bytes, text: raw };
  const headBytes = Math.floor(cap * 0.6);
  const tailBytes = cap - headBytes;
  const head = buf.subarray(0, headBytes).toString('utf-8').replace(/\uFFFD+$/, '');
  const tail = buf.subarray(bytes - tailBytes).toString('utf-8').replace(/^\uFFFD+/, '');
  return {
    bytes,
    text: `${head}\n…[${bytes - headBytes - tailBytes} bytes elided]…\n${tail}`,
    clipped: true,
  };
}

function byteLength(value) {
  return Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value ?? ''), 'utf-8');
}

process.exit(main(process.argv));
