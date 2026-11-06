import { parser, GFM } from '@lezer/markdown';
import type { SyntaxNode } from '@lezer/common';
import { emptyFragment, LIMITS, safeUrl, validateFragment, type FragmentBlock } from './fragment';

export const markdownParser = parser.configure(GFM);
export interface MarkdownMark { type: string; from: number; to: number; value?: string }
export interface MarkdownPlan { remove: Array<[number, number]>; marks: MarkdownMark[] }
const styles: Record<string, string> = { Emphasis: 'style/italics', StrongEmphasis: 'style/bold', Strikethrough: 'style/strikethrough' };
export function children(node: SyntaxNode): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) result.push(child);
  return result;
}
/** Shared recognition-to-native mapping. Unsupported nodes are opaque literal slices. */
export function inlineMarkdownPlan(source: string, node: SyntaxNode, plan: MarkdownPlan = { remove: [], marks: [] }): MarkdownPlan {
  const parts = children(node), style = styles[node.name];
  if (style) {
    const markers = parts.filter(n => n.name === 'EmphasisMark' || n.name === 'StrikethroughMark');
    if (markers.length !== 2) return plan;
    plan.remove.push(...markers.map(n => [n.from, n.to] as [number, number]));
    plan.marks.push({ type: style, from: markers[0].to, to: markers[1].from });
    parts.filter(n => !markers.includes(n)).forEach(n => inlineMarkdownPlan(source, n, plan));
  } else if (node.name === 'Link') {
    const url = parts.find(n => n.name === 'URL');
    const closing = parts.find(n => n.name === 'LinkMark' && source.slice(n.from, n.to) === ']');
    const value = url && source.slice(url.from, url.to);
    // Reference links, titles with complex escapes and unsafe URIs stay literal.
    if (!url || !closing || !value || !safeUrl(value) || source.slice(closing.to, url.from).trim() !== '(') return plan;
    plan.remove.push([node.from, node.from + 1], [closing.from, node.to]);
    plan.marks.push({ type: 'reference/url', from: node.from + 1, to: closing.from, value });
    parts.filter(n => n.from > node.from && n.to <= closing.from).forEach(n => inlineMarkdownPlan(source, n, plan));
  } else if (['Paragraph', 'Task', 'Document'].includes(node.name) || /^ATXHeading[1-6]$/.test(node.name)) {
    parts.forEach(n => inlineMarkdownPlan(source, n, plan));
  }
  return plan;
}

/** UTF-16 parser offsets are mapped through actual scalar/Cell boundaries by callers. */
export function renderMarkdownPlan(source: string, from: number, to: number, plan: MarkdownPlan) {
  const removes = [...plan.remove].sort((a, b) => a[0] - b[0]);
  let text = '', offset = from, index = 0, removal = 0;
  const boundaries = new Map<number, number>([[from, 0]]);
  for (const char of source.slice(from, to)) {
    while (removal < removes.length && removes[removal][1] <= offset) removal++;
    if (!(removal < removes.length && removes[removal][0] <= offset)) { text += char; index++; }
    offset += char.length; boundaries.set(offset, index);
  }
  return { text, marks: plan.marks.map(mark => ({ ...mark, from: boundaries.get(mark.from)!, to: boundaries.get(mark.to)! })).filter(m => m.from < m.to) };
}

/** Conservative explicit clipboard import; the broader resource/file importer is independent. */
export function importNativeMarkdown(source: string) {
  if (source.length > LIMITS.cells * 2 || new TextEncoder().encode(source).length > LIMITS.bytes) throw Error('Markdown exceeds import limits.');
  const fragment = emptyFragment(); let serial = 0, literal = false;
  const id = () => `md${serial++}`;
  function block(type: string, data: FragmentBlock['data'] = {}, childEdges: string[] = []) {
    const b: FragmentBlock = { localId: id(), type, data, blockProperties: [], children: childEdges, relations: {} };
    const edge = id(); fragment.blocks.push(b);
    fragment.placements.push({ localId: edge, kind: 'owned', target: { kind: 'local', object: 'block', id: b.localId } });
    return { b, edge };
  }
  function textBlock(from: number, to: number, node?: SyntaxNode, heading?: number) {
    const plan = node ? inlineMarkdownPlan(source, node) : { remove: [], marks: [] };
    const rendered = renderMarkdownPlan(source, from, to, plan);
    const result = block('standoff-editor-block');
    result.b.inline = { atoms: [{ kind: 'text', text: rendered.text }], properties: rendered.marks.map(m => ({ localId: id(), type: m.type, startIndex: m.from, endIndex: m.to, isZeroWidth: false, attributes: {}, ...(m.value ? { target: { kind: 'url' as const, url: m.value } } : {}) })) };
    if (heading) result.b.blockProperties.push({ localId: id(), type: 'block/font/size', attributes: { value: `h${heading}` } });
    return result.edge;
  }
  const tree = markdownParser.parse(source);
  for (const node of children(tree.topNode)) {
    let edge: string;
    if (node.name === 'Paragraph') edge = textBlock(node.from, node.to, node);
    else if (/^ATXHeading[1-6]$/.test(node.name)) {
      const mark = node.firstChild!, endMark = node.lastChild?.name === 'HeaderMark' && node.lastChild.from !== mark.from ? node.lastChild : undefined;
      let from = mark.to; while (/[ \t]/.test(source[from] ?? '') && from < node.to) from++;
      edge = textBlock(from, endMark?.from ?? node.to, node, Number(node.name.slice(-1)));
    } else if (['BulletList', 'OrderedList'].includes(node.name) && children(node).every(item => {
      const content = children(item).filter(n => n.name !== 'ListMark');
      return item.name === 'ListItem' && content.length === 1 && ['Paragraph', 'Task'].includes(content[0].name);
    })) {
      const items = children(node).map(item => {
        const content = children(item).find(n => n.name !== 'ListMark')!;
        const task = content.name === 'Task' ? content.firstChild : undefined;
        let from = task?.name === 'TaskMarker' ? task.to : content.from;
        if (task) while (from < content.to && /[ \t]/.test(source[from])) from++;
        const text = textBlock(from, content.to, content);
        return block('container-block', { metadata: { htmlListItem: {} }, ...(task ? { checked: /[xX]/.test(source.slice(task.from, task.to)) } : {}) }, [text]).edge;
      });
      const ordered = node.name === 'OrderedList', start = ordered ? Number(/^\d+/.exec(source.slice(node.from))?.[0] ?? 1) : 1;
      edge = block('indented-list-block', { metadata: { htmlList: { ordered, start, reversed: false } } }, items).edge;
    } else { literal = true; edge = textBlock(node.from, node.to); }
    const ordinary = node.name === 'Paragraph';
    fragment.roots.push({ placement: edge, openStart: ordinary, openEnd: ordinary, clippedStart: false, clippedEnd: false, separatorAfter: 'paragraph' });
  }
  if (!fragment.roots.length) fragment.roots.push({ placement: textBlock(0, source.length), openStart: true, openEnd: true, clippedStart: false, clippedEnd: false });
  delete fragment.roots.at(-1)!.separatorAfter;
  return { fragment: validateFragment(fragment), ...(literal ? { notice: 'Unsupported Markdown structures retained literally. Full Markdown import remains available through Insert file / Convert to Mutable Ink.' } : {}) };
}
