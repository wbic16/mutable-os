import { SaxesParser } from 'saxes';
import { Diagnostics, TeiBudget, type TeiLimits, type TeiNode } from './model';

/** No DTD resolution, entity expansion, network or post-error parser events. */
export function parseTei(input: string, limits: Readonly<TeiLimits>, diagnostics: Diagnostics) {
  if (input.length > limits.bytes || new TextEncoder().encode(input).length > limits.bytes) throw Error(`TEI input exceeds the configured ${limits.bytes}-byte limit. Nothing was imported.`);
  if (input.includes('\0') && !input.replace(/\0/g, '').trim()) throw Error('TEI contains only NUL/whitespace data. Nothing readable was imported.');
  let source = input.replace(/\r\n?/g, '\n');
  // One narrowly qualified repair: preserve an undefined entity literally, then
  // restart a FRESH strict parser. Never interpret its guessed post-error tree.
  for (let attempt = 0; ; attempt++) {
    const root: TeiNode = { name: '', uri: '', attrs: {}, parts: [], start: 0 };
    const stack = [root]; let count = 0, start = 0, lastClosed = 0, failure: unknown;
    const parser = new SaxesParser({ xmlns: true });
    parser.on('opentagstart', tag => { start = Math.max(0, parser.position - tag.name.length - 2); });
    parser.on('opentag', tag => {
      if (++count > limits.elements || stack.length > limits.depth) throw new TeiBudget('XML element/depth budget');
      const n: TeiNode = { name: tag.local, uri: tag.uri, attrs: Object.fromEntries(Object.values(tag.attributes).map(a => [a.uri === 'http://www.w3.org/XML/1998/namespace' ? `xml:${a.local}` : a.uri && a.uri !== 'http://www.w3.org/2000/xmlns/' ? `{${a.uri}}${a.local}` : a.name, a.value])), parts: [], start };
      stack.at(-1)!.parts.push(n); stack.push(n);
    });
    parser.on('text', text => stack.at(-1)!.parts.push(text));
    parser.on('cdata', text => stack.at(-1)!.parts.push(text));
    parser.on('closetag', tag => {
      // saxes emits a guessed close *before* reporting a mismatch. Commit only
      // an actual matching lexical close (or its already validated empty tag).
      if (!tag.isSelfClosing) {
        const token = source.slice(source.lastIndexOf('</', parser.position - 1), parser.position);
        if (/^<\/([^\s>]+)\s*>$/.exec(token)?.[1] !== tag.name) throw Error('Mismatched XML closing tag');
      }
      const n = stack.pop()!; n.end = parser.position; lastClosed = parser.position;
    });
    parser.on('doctype', () => { if (!attempt) diagnostics.add('doctype', 'DTD declarations were ignored; no external resources or declared entities were loaded.'); });
    parser.on('error', error => { throw error; });
    try { parser.write(source).close(); } catch (error) { failure = error; }
    if (!failure) return { root, truncated: false };
    const position = parser.position;
    const entity = /&([A-Za-z_:][\w.:-]*);$/.exec(source.slice(Math.max(0, position - 256), position));
    if (!(failure instanceof TeiBudget) && attempt < 4 && String(failure).includes('undefined entity') && entity) {
      const index = position - entity[0].length;
      source = source.slice(0, index) + '&amp;' + source.slice(index + 1);
      diagnostics.add('literal-entity', 'An undefined XML entity was retained literally; a fresh strict parse recovered subsequent content.', entity[0]);
      continue;
    }
    // Discard only the current unfinished text unit, not completed siblings.
    const units = new Set(['p', 'l', 'head', 'dateline', 'salute', 'signed', 'speaker', 'stage', 'title', 'author']);
    const unit = stack.find(n => units.has(n.name));
    let tail = lastClosed;
    if (unit) {
      tail = unit.start;
      const parent = stack[stack.indexOf(unit) - 1]; parent.parts.splice(parent.parts.indexOf(unit));
      stack.splice(stack.indexOf(unit));
    } else {
      // No complete unit yet: retain complete children, remove unfinished ones
      // and text since the most recent completed child at this container level.
      const parent = stack.at(-1)!;
      let last = -1;
      parent.parts.forEach((p, i) => { if (typeof p !== 'string' && p.end !== undefined) last = i; });
      const previous = parent.parts[last];
      tail = typeof previous === 'object' ? previous.end! : parent === root ? 0 : parent.start;
      if (last < 0 && parent !== root) {
        const owner = stack[stack.length - 2]; owner.parts.splice(owner.parts.indexOf(parent)); stack.pop();
      } else parent.parts.splice(last + 1);
    }
    if (failure instanceof TeiBudget) {
      diagnostics.add('truncated', 'INCOMPLETE IMPORT: the XML element/depth limit was reached. Remaining source was omitted.');
      return { root, truncated: true };
    }
    diagnostics.add('malformed-xml', 'A malformed XML region and its remaining suffix were retained as editable literal text; preceding complete content keeps its semantics.', String(failure));
    stack.at(-1)!.parts.push({ name: 'recovery', uri: '', attrs: {}, parts: [source.slice(tail)], start: tail, recovery: true });
    return { root, truncated: false };
  }
}

export function decodeTei(bytes: Uint8Array, diagnostics: Diagnostics): string {
  let encoding = 'utf-8', offset = 0;
  if (bytes[0] === 255 && bytes[1] === 254) { encoding = 'utf-16le'; offset = 2; }
  else if (bytes[0] === 254 && bytes[1] === 255) { encoding = 'utf-16be'; offset = 2; }
  else if (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) offset = 3;
  let source: string;
  try { source = new TextDecoder(encoding, { fatal: true }).decode(bytes.subarray(offset)); }
  catch { source = new TextDecoder(encoding).decode(bytes.subarray(offset)); diagnostics.add('encoding-replacement', 'Invalid encoded characters were replaced; the remaining text was retained.'); }
  const declared = /^\s*<\?xml\s[^?]*encoding\s*=\s*['"]([^'"]+)['"]/i.exec(source)?.[1].toLowerCase();
  if (declared && !(encoding === 'utf-8' ? ['utf-8', 'utf8'].includes(declared) : [encoding, 'utf-16'].includes(declared))) throw Error('Unsupported TEI encoding declaration. Resave as UTF-8 or BOM-marked UTF-16. Nothing was imported.');
  if (source.includes('\0') && !source.replace(/\0/g, '').trim()) throw Error('TEI contains only NUL/whitespace data. Nothing readable was imported.');
  return source;
}
