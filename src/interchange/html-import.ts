import {listMetadata,listItemPayload,tableCellMetadata} from '../block-tree/layout-authoring';
import {safeColor as color} from './inline-values.mjs';
import { emptyFragment, LIMITS, safeUrl, validateFragment, type FragmentBlock, type MutableFragment, type Property, type Reference } from './fragment';
import { activeTags, attribute, type HtmlNode } from './html-ast';

type Mark = { type: string; attributes: Record<string, unknown>; target?: Reference };
const paragraphs = new Set(['p', 'div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'blockquote', 'address', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre']);
const inlineTypes: Record<string, string> = { b: 'style/bold', strong: 'style/bold', i: 'style/italics', em: 'style/italics', u: 'style/underline', s: 'style/strikethrough', strike: 'style/strikethrough', del: 'style/strikethrough', sup: 'style/superscript', sub: 'style/subscript', mark: 'style/highlight' };
const integer = (value: string | undefined, fallback: number) => value !== undefined && /^-?\d+$/.test(value) && Math.abs(Number(value)) <= 1000000 ? Number(value) : fallback;

/** HTML semantics only. Outputs the same fragment used by native paste. */
export function importSemanticHtml(tree: HtmlNode, baseUrl?: string): { fragment?: MutableFragment; notice?: string } {
  const resolveUrl=(value:string)=>{if(!baseUrl||!value)return value;try{const url=new URL(value,baseUrl);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:value;}catch{return value;}};
  const f = emptyFragment(), warnings = new Set<string>(), closed = new Set<string>();
  const blocksByEdge = new Map<string, FragmentBlock>();
  let serial = 0, positions = 0, propertyCount = 0;
  const id = () => `html${++serial}`;
  const warn = (message: string) => warnings.add(message);
  const property = () => { if (++propertyCount > LIMITS.properties) throw Error('HTML contains too many annotation ranges.'); return id(); };
  const makeBlock = (type: string, data: FragmentBlock['data'] = {}, children: string[] = []) => {
    if (f.blocks.length >= LIMITS.blocks) throw Error('HTML contains too many Blocks.');
    const b: FragmentBlock = { localId: id(), type, data, blockProperties: [], children, relations: {} };
    const edge = id(); f.blocks.push(b); f.placements.push({ localId: edge, kind: 'owned', target: { kind: 'local', object: 'block', id: b.localId } });
    blocksByEdge.set(edge, b);
    if (type !== 'standoff-editor-block') closed.add(edge);
    return { b, edge };
  };
  const blockFor = (edge: string) => blocksByEdge.get(edge)!;
  const marksFor = (node: HtmlNode, inherited: Mark[]) => {
    let marks = [...inherited];
    const set = (type: string, enabled = true, attributes = {}, target?: Reference) => {
      marks = marks.filter(m => m.type !== type);
      if (enabled) marks.push({ type, attributes, ...(target ? { target } : {}) });
    };
    const tag = node.tagName ?? '';
    if (inlineTypes[tag]) set(inlineTypes[tag]);
    if (tag === 'a' && attribute(node, 'href') !== undefined) {
      const url = resolveUrl(attribute(node, 'href')!.trim());
      if (safeUrl(url)) set('reference/url', true, {}, { kind: 'url', url });
      else warn('Unsafe or relative links were retained as text.');
    }
    for (const a of node.attrs ?? []) if (/^on/i.test(a.name) || ['srcdoc', 'contenteditable'].includes(a.name)) warn('Active HTML content and attributes were removed.');
    for (const declaration of (attribute(node, 'style') ?? '').split(';')) {
      const colon = declaration.indexOf(':'); if (colon < 0) continue;
      const name = declaration.slice(0, colon).trim().toLowerCase(), value = declaration.slice(colon + 1).trim().toLowerCase().replace(/\s*!important$/, '');
      if (name === 'font-weight' && /^(bold|bolder|normal|[1-9]00)$/.test(value)) set('style/bold', value === 'bold' || value === 'bolder' || Number(value) >= 600);
      else if (name === 'font-style' && /^(italic|oblique|normal)$/.test(value)) set('style/italics', value !== 'normal');
      else if (['text-decoration', 'text-decoration-line'].includes(name) && /^(none|underline|line-through|overline|\s)+$/.test(value)) {
        set('style/underline', value.includes('underline')); set('style/strikethrough', value.includes('line-through'));
        if (value.includes('overline')) warn('Unsupported formatting was omitted; text was retained.');
      } else if (name === 'vertical-align' && ['super', 'sub', 'baseline'].includes(value)) {
        set('style/superscript', value === 'super'); set('style/subscript', value === 'sub');
      } else if (['color', 'background-color'].includes(name) && color(value)) set(name === 'color' ? 'text/colour' : 'text/background-colour', true, { value });
      else if (name !== 'white-space' || !['pre', 'pre-wrap', 'normal'].includes(value)) warn('Unsupported CSS and external layout were omitted.');
    }
    return marks;
  };
  const preformatted = (node: HtmlNode, inherited: boolean) => inherited || ['pre', 'code'].includes(node.tagName ?? '') || /(?:^|;)\s*white-space\s*:\s*pre(?:-wrap)?\s*(?:!important\s*)?(?:;|$)/i.test(attribute(node, 'style') ?? '');

  function flow(nodes: HtmlNode[], inherited: Mark[] = [], preserve = false, forceEmpty = false): string[] {
    const output: string[] = [];
    let current: ReturnType<typeof makeBlock> | undefined, offset = 0, lastBreak = false;
    let pendingSpace: Mark[] | undefined;
    let ranges = new Map<Mark, Property>();
    const ensure = () => {
      if (!current) { current = makeBlock('standoff-editor-block'); current.b.inline = { atoms: [], properties: [] }; }
      return current.b.inline!;
    };
    const emit = (atom: { kind: 'text'; text: string } | { kind: 'embed'; embed: string }, marks: Mark[]) => {
      if (++positions > LIMITS.cells) throw Error('HTML exceeds the inline position limit.');
      const inline = ensure(), last = inline.atoms.at(-1);
      if (atom.kind === 'text' && last?.kind === 'text') last.text += atom.text; else inline.atoms.push(atom);
      for (const mark of marks) {
        let range = ranges.get(mark);
        if (!range || range.endIndex !== offset) {
          range = { ...mark, localId: property(), startIndex: offset, endIndex: offset, isZeroWidth: false };
          inline.properties.push(range); ranges.set(mark, range);
        }
        range.endIndex++;
      }
      offset++; lastBreak = atom.kind === 'text' && atom.text === '\n';
    };
    const space = () => { if (pendingSpace && offset && !lastBreak) emit({ kind: 'text', text: ' ' }, pendingSpace); pendingSpace = undefined; };
    const text = (value: string, marks: Mark[], pre: boolean) => {
      for (const scalar of value.replace(/\r\n?/g, '\n')) {
        if (!pre && /[\t\n\f\r ]/.test(scalar)) { if (!pendingSpace && offset && !lastBreak) pendingSpace = marks; }
        else { space(); emit({ kind: 'text', text: scalar }, marks); }
      }
    };
    const flush = () => { if (current) output.push(current.edge); current = undefined; offset = 0; pendingSpace = undefined; lastBreak = false; ranges = new Map(); };
    const visit = (node: HtmlNode, inherited: Mark[], pre: boolean) => {
      if (node.nodeName === '#text') { text(node.value ?? '', inherited, pre); return; }
      const tag = node.tagName ?? '';
      if (activeTags.has(tag) || node.namespaceURI && node.namespaceURI !== 'http://www.w3.org/1999/xhtml') { warn('Active HTML content and attributes were removed.'); return; }
      if (['meta', 'link', 'base', 'head', 'title', '#comment'].includes(tag || node.nodeName)) return;
      const marks = marksFor(node, inherited), keepSpace = preformatted(node, pre);
      if (tag === 'br') { pendingSpace = undefined; emit({ kind: 'text', text: '\n' }, marks); return; }
      if (tag === 'img') {
        space(); const embed = id(), asset = id(), source = resolveUrl((attribute(node, 'src') ?? '').trim());
        const src = /^https?:\/\//i.test(source) && safeUrl(source) ? source : '';
        const relativeSource = !src && source && !/^(?:[a-z][\w+.-]*:|\/\/)|[\u0000-\u001f]/i.test(source) ? source : undefined;
        const alt = attribute(node, 'alt') ?? '', title = attribute(node, 'title');
        const dimensions = Object.fromEntries(['width', 'height'].flatMap(name => { const n = integer(attribute(node, name), 0); return n > 0 && n <= 10000 ? [[name, n]] : []; }));
        f.assets.push({ localId: asset, source: src ? { kind: 'remote', url: src } : { kind: 'unresolved', description: alt || 'Image', ...(relativeSource ? { relativeSource } : {}), ...(/^cid:[^\s<>]+$/i.test(source) ? { contentId: source.slice(4) } : {}) } });
        // No inferred or authored base URL, data URLs, style bags, srcset or event attributes.
        f.embeds.push({ localId: embed, type: 'image-cell', asset: { kind: 'local', object: 'asset', id: asset }, data: { src, alt, ...(relativeSource ? { relativeSource } : {}), ...(title ? { title } : {}), ...dimensions } });
        emit({ kind: 'embed', embed }, marks); warn('Images were preserved as inactive placeholders.'); return;
      }
      if (tag === 'ul' || tag === 'ol') {
        flush(); output.push(list(node, marks, keepSpace)); return;
      }
      if (tag === 'table') {
        flush(); output.push(...table(node, marks, keepSpace)); return;
      }
      if (paragraphs.has(tag)) {
        flush(); const edges = flow(node.childNodes ?? [], marks, keepSpace, ['p', 'pre'].includes(tag) || /^h[1-6]$/.test(tag));
        for (const edge of edges) {
          closed.add(edge); const b = blockFor(edge);
          if (b.type !== 'standoff-editor-block') continue;
          if (/^h[1-6]$/.test(tag)) {
            const level = Number(tag.slice(1)); b.data.metadata = { htmlHeadingLevel: level };
            b.blockProperties.push({ localId: property(), type: `block/font/size/h${Math.min(level, 4)}`, attributes: {} });
            if (level > 4) warn('Heading levels 5 and 6 use the existing H4 presentation.');
          }
          if (tag === 'pre') b.data.metadata = { htmlPreformatted: true };
        }
        if (tag === 'blockquote') warn('Quotation text was retained as paragraphs.');
        output.push(...edges); return;
      }
      if (tag === 'hr') { flush(); warn('Horizontal rules were omitted.'); return; }
      if (tag === 'code' || !['', 'span', 'a', 'html', 'body', 'wbr', ...Object.keys(inlineTypes)].includes(tag)) warn('Unsupported formatting was omitted; text was retained.');
      for (const child of node.childNodes ?? []) visit(child, marks, keepSpace);
    };
    for (const node of nodes) visit(node, inherited, preserve);
    if (!current && !output.length && forceEmpty) ensure();
    flush(); return output;
  }
  function list(node: HtmlNode, marks: Mark[], preserve: boolean): string {
    const ordered = node.tagName === 'ol', items = (node.childNodes ?? []).filter(n => n.tagName === 'li');
    const reversed = attribute(node, 'reversed') !== undefined;
    const start = integer(attribute(node, 'start'), reversed ? items.length : 1);
    const children: string[] = [];
    for (const child of node.childNodes ?? []) {
      if (child.tagName === 'li') {
        const value = attribute(child, 'value');
        const task = leadingTaskCheckbox(child.childNodes ?? []);
        const item = makeBlock('container-block', listItemPayload(value===undefined?undefined:integer(value,start),task.checked), flow(task.nodes, marksFor(child, marks), preformatted(child, preserve), true));
        children.push(item.edge);
      } else if (child.nodeName === '#text' && !child.value?.trim()) continue;
      else { warn('Non-item list content was retained without a list marker.'); children.push(...flow([child], marks, preserve)); }
    }
    if (attribute(node, 'type')) warn('Custom list marker styles were replaced with standard markers.');
    return makeBlock('indented-list-block', {metadata:listMetadata(ordered,start,reversed)}, children).edge;
  }
  function table(node: HtmlNode, marks: Mark[], preserve: boolean): string[] {
    const rows: string[] = [], captions: string[] = [];
    const visit = (node: HtmlNode) => {
      if (node.tagName === 'caption') { captions.push(...flow(node.childNodes ?? [], marksFor(node, marks), preserve, true)); return; }
      if (node.tagName === 'tr') {
        const rowMarks = marksFor(node, marks), cells: string[] = [];
        for (const cell of node.childNodes ?? []) if (cell.tagName === 'td' || cell.tagName === 'th') {
          const header = cell.tagName === 'th', colSpan = Math.max(1, integer(attribute(cell, 'colspan'), 1)), rowSpan = Math.max(1, integer(attribute(cell, 'rowspan'), 1));
          if (colSpan > 1 || rowSpan > 1) warn('Merged table cells were flattened; text and span metadata were retained.');
          const cellMarks = marksFor(cell, header ? [...rowMarks, { type: 'style/bold', attributes: {} }] : rowMarks);
          cells.push(makeBlock('table-cell-block', {metadata:tableCellMetadata(header,colSpan,rowSpan)}, flow(cell.childNodes ?? [], cellMarks, preformatted(cell, preserve), true)).edge);
        }
        rows.push(makeBlock('table-row-block', {}, cells).edge); return;
      }
      for (const child of node.childNodes ?? []) if (['thead', 'tbody', 'tfoot', 'tr', 'caption'].includes(child.tagName ?? '')) visit(child);
    };
    visit(node); return [...captions, makeBlock('table-block', {}, rows).edge];
  }
  const roots = flow(tree.childNodes ?? []);
  f.roots = roots.map((placement, index) => ({ placement, openStart: !closed.has(placement), openEnd: !closed.has(placement), clippedStart: false, clippedEnd: false, ...(index < roots.length - 1 ? { separatorAfter: 'paragraph' as const } : {}) }));
  return { ...(roots.length ? { fragment: validateFragment(f) } : {}), ...(warnings.size ? { notice: [...warnings].join(' ') } : {}) };
}

/** Consume only one leading task checkbox as inert data. All other active HTML
 * stays under the existing sanitizer; no input attributes become executable. */
function leadingTaskCheckbox(nodes: HtmlNode[], depth = 0): { nodes: HtmlNode[]; checked?: boolean } {
  const index = nodes.findIndex(n => !(n.nodeName === '#text' && !n.value?.trim()));
  const first = nodes[index];
  if (first?.tagName === 'input' && attribute(first, 'type')?.toLowerCase() === 'checkbox')
    return { nodes: nodes.filter((_, i) => i !== index), checked: attribute(first, 'checked') !== undefined };
  if (depth < 2 && first && ['p', 'div'].includes(first.tagName ?? '')) {
    const inner = leadingTaskCheckbox(first.childNodes ?? [], depth + 1);
    if (inner.checked !== undefined) return { checked: inner.checked, nodes: nodes.map((n, i) => i === index ? { ...n, childNodes: inner.nodes } : n) };
  }
  return { nodes };
}
