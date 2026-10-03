/**
 * yaml-subset — the sns-cli checkers' zero-dependency YAML reader (#813/#803).
 *
 * WHY THIS FILE EXISTS. `deployment-view-check`, `construction-entry-check`, `composition-map-check` and
 * `gates-fresh` imported the `yaml` npm package. Nothing installs node dependencies for a skill
 * binary — not this repo's clone, not a project the skill is exported into — so in a fresh clone
 * every one of them died on ERR_MODULE_NOT_FOUND before doing any work, and `gate-stamp` turned a
 * CLEAN spec-lint into exit 1 (#803). The other skill binaries (qa.mjs, book-build.mjs,
 * dossier-build.mjs) each carry their own strict YAML-subset parser for exactly this reason; this
 * one is the shared version for the sns-cli bin family.
 *
 * THE SUBSET. Block mappings and sequences, flow mappings and sequences (nestable, multi-line),
 * single- and double-quoted scalars, block scalars (| and > with - / + chomping), comments, the
 * `---` document marker, and YAML-1.2-core scalar resolution (null/bool/int/float, everything else
 * a string). Deliberately absent: anchors, aliases, tags, multiple documents, complex keys,
 * multi-line plain scalars. An unsupported shape is a hard error with file:line — the strictness is
 * the point: a checker must never read a document differently than the editor who wrote it.
 *
 * Verified against `yaml@2.8.4` over every document the four checkers read (see
 * tests/yaml-subset.test.ts): identical output, or this file is wrong.
 */

import { readFileSync } from 'node:fs';

class YamlSubsetError extends Error {}

/** parse(text, file) -> the document's value. Throws YamlSubsetError with `file:line: why`. */
export function parse(text, file = '<yaml>') {
  return new Parser(text, file).document();
}

export { YamlSubsetError };

/**
 * A file reader for a checker: `const readYaml = yamlReader('gates-fresh')`. A malformed document
 * exits 2 with `gates-fresh: path:line: why` — a sentence someone can act on, never the Node stack
 * trace that #803 was filed about.
 */
export function yamlReader(tool) {
  return (path) => {
    let text;
    try { text = readFileSync(path, 'utf-8'); }
    catch { console.error(`${tool}: cannot read ${path}`); process.exit(2); }
    try { return parse(text, path); }
    catch (e) {
      if (e instanceof YamlSubsetError) { console.error(`${tool}: ${e.message}`); process.exit(2); }
      throw e;
    }
  };
}

const PLAIN_END_FLOW = new Set([',', ']', '}']);

class Parser {
  constructor(text, file) {
    this.file = file;
    this.commentLines = new Set();
    this.raw = String(text).replace(/\r\n?/g, '\n').split('\n');
    // Physical lines kept intact (block scalars need them); `lines` is the structural view.
    this.lines = [];
    for (let i = 0; i < this.raw.length; i++) {
      const line = this.raw[i];
      if (/^\s*$/.test(line)) continue;
      if (/^\s*#/.test(line)) { this.commentLines.add(i + 1); continue; }
      if (/\t/.test(line.match(/^\s*/)[0])) this.die(i + 1, 'tabs are not allowed in indentation');
      const indent = line.match(/^ */)[0].length;
      const body = line.slice(indent);
      if (body === '---' || body === '...') continue;
      this.lines.push({ indent, body, no: i + 1 });
    }
    this.pos = 0;
  }

  die(no, why) {
    throw new YamlSubsetError(`${this.file}:${no}: ${why}`);
  }

  document() {
    if (this.pos >= this.lines.length) return null;
    const doc = this.node(this.lines[0].indent);
    if (this.pos < this.lines.length) this.die(this.lines[this.pos].no, `trailing content: ${this.lines[this.pos].body}`);
    return doc;
  }

  /** A block node at exactly `indent`: a sequence if it starts with '- ', otherwise a mapping. */
  node(indent) {
    const l = this.lines[this.pos];
    if (!l || l.indent < indent) return null;
    if (l.indent > indent) this.die(l.no, 'unexpected indent');
    return l.body === '-' || l.body.startsWith('- ') ? this.sequence(indent) : this.mapping(indent);
  }

  mapping(indent) {
    const out = {};
    while (this.pos < this.lines.length) {
      const l = this.lines[this.pos];
      if (l.indent < indent) break;
      if (l.indent > indent) this.die(l.no, 'unexpected indent inside a mapping');
      if (l.body === '-' || l.body.startsWith('- ')) break;
      const { key, rest } = this.splitKey(l);
      if (key in out) this.die(l.no, `duplicate key '${key}'`);
      out[key] = this.value(l, rest, indent);
    }
    return out;
  }

  sequence(indent) {
    const out = [];
    while (this.pos < this.lines.length) {
      const l = this.lines[this.pos];
      if (l.indent < indent) break;
      if (l.indent > indent) this.die(l.no, 'unexpected indent inside a sequence');
      if (l.body !== '-' && !l.body.startsWith('- ')) break;
      const rest = l.body === '-' ? '' : l.body.slice(2).trim();
      if (rest === '') {
        // '-' alone: the item is the indented block below it.
        this.pos++;
        const child = this.pos < this.lines.length && this.lines[this.pos].indent > indent
          ? this.node(this.lines[this.pos].indent)
          : null;
        out.push(child);
        continue;
      }
      // '- key: value' opens a mapping whose column is where the key starts.
      if (!isFlowStart(rest) && this.looksLikeKey(rest)) {
        const inner = indent + (l.body.length - l.body.slice(2).replace(/^\s*/, '').length) - 2 + 2;
        const col = indent + 2 + (l.body.slice(2).length - l.body.slice(2).replace(/^\s*/, '').length);
        void inner;
        this.lines[this.pos] = { indent: col, body: rest, no: l.no };
        out.push(this.mapping(col));
        continue;
      }
      // '- <scalar or flow>' — a plain item, possibly a multi-line flow collection.
      out.push(this.value(l, rest, indent, /* itemOfSequence */ true));
    }
    return out;
  }

  /** Split 'key:' / 'key: value' — the key may be quoted. */
  splitKey(l) {
    const b = l.body;
    if (b[0] === '"' || b[0] === "'") {
      const s = new Scanner(b, this, l.no);
      const key = s.quoted();
      s.skipSpaces();
      if (s.peek() !== ':') this.die(l.no, `expected ':' after a quoted key, got: ${b}`);
      s.next();
      return { key, rest: afterKey(b.slice(s.i)) };
    }
    const m = b.match(/^([^:#]+?)\s*:(\s|$)/);
    if (!m) this.die(l.no, `expected 'key: value' or 'key:', got: ${b}`);
    return { key: m[1], rest: afterKey(b.slice(m[0].length - (m[2] === '' ? 0 : m[2].length))) };
  }

  /** The value written after a 'key:' or a '- ' on line `l`, whose owning block sits at `indent`. */
  value(l, rest, indent, itemOfSequence = false) {
    // Block scalar: | or > with optional chomping.
    const block = rest.match(/^([|>])([0-9]?)([-+]?)([0-9]?)$/);
    if (block) {
      this.pos++;
      const explicit = block[2] || block[4];
      return this.blockScalar(block[1], block[3], indent, l.no, explicit ? indent + Number(explicit) : null);
    }
    if (rest === '') {
      this.pos++;
      const next = this.lines[this.pos];
      if (next && next.indent > indent) return this.node(next.indent);
      // A block sequence may sit at its key's own column ('managers:' / '- id: ...').
      if (next && next.indent === indent && (next.body === '-' || next.body.startsWith('- '))) {
        return this.sequence(indent);
      }
      return null; // 'key:' with nothing under it
    }
    if (isFlowStart(rest)) {
      const value = this.flow(l, rest);
      return value;
    }
    if (!itemOfSequence && this.looksLikeKey(rest)) {
      // 'key: other: thing' — ambiguous in YAML, and a typo in practice.
      this.die(l.no, `a plain scalar may not contain ': ' — quote it: ${l.body}`);
    }
    this.pos++;
    const folded = this.foldContinuation(rest, l.no, indent);
    const s = new Scanner(folded, this, l.no);
    const value = s.scalar(false);
    s.endOfValue('a scalar');
    return value;
  }

  /** A flow collection starting on line `l`; it may run over following lines. */
  flow(l, rest) {
    let text = rest;
    let lineNo = l.no;
    let consumed = 1;
    for (;;) {
      const s = new Scanner(text, this, lineNo);
      let value;
      try {
        value = s.flowCollection();
      } catch (e) {
        if (e instanceof Incomplete) {
          const next = this.lines[this.pos + consumed];
          if (!next) this.die(l.no, 'unterminated flow collection');
          text += ' ' + next.body;
          lineNo = next.no;
          consumed++;
          continue;
        }
        throw e;
      }
      s.endOfValue('a flow collection');
      this.pos += consumed;
      return value;
    }
  }

  /**
   * A plain or quoted scalar may run over the following MORE-INDENTED lines. YAML folds them: one
   * line break becomes a space, n>1 breaks become n-1 newlines. A comment line inside such a scalar
   * is refused rather than guessed at — that is the one place where folding and commenting collide.
   */
  foldContinuation(rest, no, indent) {
    let out = rest;
    let prevNo = no;
    while (this.pos < this.lines.length && this.lines[this.pos].indent > indent) {
      const cont = this.lines[this.pos];
      for (let n = prevNo + 1; n < cont.no; n++) {
        if (this.commentLines.has(n)) this.die(n, 'a comment inside a multi-line scalar is not supported — use a block scalar (| or >)');
      }
      const breaks = cont.no - prevNo;
      out += breaks > 1 ? '\n'.repeat(breaks - 1) + cont.body : ' ' + cont.body;
      prevNo = cont.no;
      this.pos++;
    }
    return out;
  }

  looksLikeKey(rest) {
    if (rest[0] === '"' || rest[0] === "'") {
      const m = rest.match(/^"(?:[^"\\]|\\.)*"\s*:(\s|$)/) || rest.match(/^'(?:[^']|'')*'\s*:(\s|$)/);
      return Boolean(m);
    }
    return /^[^:#]+?\s*:(\s|$)/.test(rest);
  }

  /**
   * A block scalar's body: every following line more indented than the owning block. The content
   * indentation is the first non-empty line's; '>' folds, '|' keeps; '-' strips and '+' keeps the
   * trailing newlines that the default (clip) reduces to one.
   */
  blockScalar(style, chomp, indent, headerNo, explicitIndent) {
    // Block scalars need the physical lines back — blank lines are content.
    const start = this.pos < this.lines.length ? this.lines[this.pos].no - 1 : this.raw.length;
    let firstPhysical = headerNo; // 1-based line of the header
    const body = [];
    for (let i = firstPhysical; i < this.raw.length; i++) {
      const line = this.raw[i];
      if (/^\s*$/.test(line)) { body.push(''); continue; }
      if (line.match(/^ */)[0].length <= indent) break;
      body.push(line);
    }
    void start;
    while (body.length && body[body.length - 1] === '') body.pop();
    if (body.length === 0) {
      this.skipPhysical(firstPhysical, 0);
      return chomp === '+' ? '' : '';
    }
    const contentIndent = explicitIndent ?? body.find((x) => x !== '').match(/^ */)[0].length;
    const stripped = body.map((x) => (x === '' ? '' : x.slice(contentIndent)));
    let out;
    if (style === '|') {
      out = stripped.join('\n') + '\n';
    } else {
      // Fold a RUN of line breaks at once. A run is foldable only when the lines on both sides are
      // non-empty and neither is MORE indented than the block; then one break is a space and b>1
      // breaks are b-1 newlines. Any run touching a more-indented line stays literal (b newlines) —
      // which is what keeps an indented bullet list inside a '>' scalar readable.
      let acc = stripped[0];
      let i = 1;
      while (i < stripped.length) {
        let breaks = 1;
        while (i < stripped.length && stripped[i] === '') { breaks++; i++; }
        if (i >= stripped.length) break;
        const prev = stripped[i - breaks];
        const cur = stripped[i];
        const literal = prev === '' || /^\s/.test(prev) || /^\s/.test(cur);
        acc += literal ? '\n'.repeat(breaks) : breaks === 1 ? ' ' : '\n'.repeat(breaks - 1);
        acc += cur;
        i++;
      }
      out = acc + '\n';
    }
    if (chomp === '-') out = out.replace(/\n+$/, '');
    // (clip and keep agree here: trailing blank lines were dropped above.)
    this.skipPhysical(firstPhysical, body.length);
    return out;
  }

  /** Advance the structural cursor past the block-scalar body that occupied physical lines. */
  skipPhysical(headerNo, bodyLines) {
    const lastPhysical = headerNo + bodyLines; // 1-based, inclusive
    while (this.pos < this.lines.length && this.lines[this.pos].no <= lastPhysical) this.pos++;
  }
}

/** Thrown while scanning a flow collection that has not been closed on this line yet. */
class Incomplete extends Error {}

function isFlowStart(s) { return s[0] === '[' || s[0] === '{'; }

/** What follows a 'key:' — a lone comment is no value at all. */
function afterKey(s) {
  const t = s.trim();
  return t.startsWith('#') ? '' : t;
}

class Scanner {
  constructor(src, parser, no) { this.src = src; this.i = 0; this.p = parser; this.no = no; }
  peek() { return this.src[this.i]; }
  next() { return this.src[this.i++]; }
  skipSpaces() { while (/[ \t]/.test(this.src[this.i] ?? '')) this.i++; }
  /** Nothing may follow a finished value but whitespace and a comment. */
  endOfValue(what) {
    this.skipSpaces();
    if (this.i < this.src.length && this.peek() === '#') return;
    if (this.i < this.src.length) this.die(`unexpected trailing text after ${what}: ${this.src.slice(this.i)}`);
  }
  die(why) { this.p.die(this.no, why); }

  quoted() {
    const q = this.next();
    let out = '';
    while (this.i < this.src.length) {
      const c = this.next();
      if (q === "'") {
        if (c === "'") {
          if (this.peek() === "'") { out += "'"; this.i++; continue; }
          return out;
        }
        out += c;
        continue;
      }
      if (c === '\\') { out += this.escape(); continue; }
      if (c === '"') return out;
      out += c;
    }
    this.die('unterminated quoted scalar');
  }

  escape() {
    const c = this.next();
    switch (c) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case '0': return '\0';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'v': return '\v';
      case 'a': return '\x07';
      case 'e': return '\x1b';
      case '"': return '"';
      case '\\': return '\\';
      case '/': return '/';
      case ' ': return ' ';
      case 'x': { const h = this.src.slice(this.i, this.i + 2); this.i += 2; return String.fromCharCode(parseInt(h, 16)); }
      case 'u': { const h = this.src.slice(this.i, this.i + 4); this.i += 4; return String.fromCharCode(parseInt(h, 16)); }
      case 'U': { const h = this.src.slice(this.i, this.i + 8); this.i += 8; return String.fromCodePoint(parseInt(h, 16)); }
      default: this.die(`unsupported escape '\\${c}'`);
    }
  }

  /** One scalar. In flow context a plain scalar ends at ',' ']' '}' or a comment. */
  scalar(flow) {
    this.skipSpaces();
    const c = this.peek();
    if (c === '"' || c === "'") return this.quoted();
    let start = this.i;
    while (this.i < this.src.length) {
      const ch = this.src[this.i];
      if (flow && PLAIN_END_FLOW.has(ch)) break;
      if (ch === '#' && this.i > start && /\s/.test(this.src[this.i - 1])) break;
      this.i++;
    }
    return resolve(this.src.slice(start, this.i).trim());
  }

  flowCollection() {
    this.skipSpaces();
    const open = this.peek();
    if (open === '[') return this.flowSeq();
    if (open === '{') return this.flowMap();
    this.die('expected a flow collection');
  }

  flowSeq() {
    this.i++; // '['
    const out = [];
    for (;;) {
      this.skipSpaces();
      if (this.i >= this.src.length) throw new Incomplete();
      if (this.peek() === ']') { this.i++; return out; }
      out.push(this.flowValue());
      this.skipSpaces();
      if (this.i >= this.src.length) throw new Incomplete();
      const c = this.peek();
      if (c === ',') { this.i++; continue; }
      if (c === ']') { this.i++; return out; }
      this.die(`expected ',' or ']' in a flow sequence, got '${c}'`);
    }
  }

  flowMap() {
    this.i++; // '{'
    const out = {};
    for (;;) {
      this.skipSpaces();
      if (this.i >= this.src.length) throw new Incomplete();
      if (this.peek() === '}') { this.i++; return out; }
      const key = this.flowKey();
      this.skipSpaces();
      if (this.i >= this.src.length) throw new Incomplete();
      if (this.peek() !== ':') this.die(`expected ':' in a flow mapping, got '${this.peek()}'`);
      this.i++;
      const value = this.flowValue();
      if (key in out) this.die(`duplicate key '${key}'`);
      out[key] = value;
      this.skipSpaces();
      if (this.i >= this.src.length) throw new Incomplete();
      const c = this.peek();
      if (c === ',') { this.i++; continue; }
      if (c === '}') { this.i++; return out; }
      this.die(`expected ',' or '}' in a flow mapping, got '${c}'`);
    }
  }

  flowKey() {
    this.skipSpaces();
    const c = this.peek();
    if (c === '"' || c === "'") return this.quoted();
    let start = this.i;
    while (this.i < this.src.length && !':,[]{}'.includes(this.src[this.i])) this.i++;
    return this.src.slice(start, this.i).trim();
  }

  flowValue() {
    this.skipSpaces();
    if (this.i >= this.src.length) throw new Incomplete();
    const c = this.peek();
    if (c === '[' || c === '{') return this.flowCollection();
    if (c === ',' || c === ']' || c === '}') return null; // an empty entry
    return this.scalar(true);
  }
}

/** YAML 1.2 core scalar resolution — the same answers `yaml`'s default schema gives. */
function resolve(t) {
  if (t === '' || t === '~' || t === 'null' || t === 'Null' || t === 'NULL') return null;
  if (t === 'true' || t === 'True' || t === 'TRUE') return true;
  if (t === 'false' || t === 'False' || t === 'FALSE') return false;
  if (/^[-+]?[0-9]+$/.test(t)) return Number(t);
  if (/^0o[0-7]+$/.test(t)) return parseInt(t.slice(2), 8);
  if (/^0x[0-9a-fA-F]+$/.test(t)) return parseInt(t.slice(2), 16);
  if (/^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/.test(t)) return Number(t);
  if (/^[-+]?\.(inf|Inf|INF)$/.test(t)) return t[0] === '-' ? -Infinity : Infinity;
  if (/^\.(nan|NaN|NAN)$/.test(t)) return NaN;
  return t;
}
