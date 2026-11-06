import { createSignal } from 'solid-js';
import type { ReactiveEditor } from '../reactive-editor/editor';
import { children, inlineMarkdownPlan, markdownParser, type MarkdownPlan } from '../interchange/markdown-native';

export function markdownLiteralContext(editor: ReactiveEditor, key: string, requireDocument = true): boolean {
  const node = editor.node(key); if (!node) return true;
  const projection = editor.projections.get(node.viewId);
  for (let current = node; current; current = projection?.parentOf(current.key)!) {
    const meta = current.payload.metadata as any;
    if (current.viewType === 'standoff-code-block' || current.viewType === 'code-mirror-block' || meta?.htmlPreformatted || meta?.markdownCode || meta?.readOnly || meta?.literal) return true;
    if (current.viewType === 'document-block') return false;
  }
  // Standalone/restricted fields (e.g. Cardex names) aren't Document authoring surfaces.
  return requireDocument;
}
interface Candidate { key: string; start: number; caret: number; revision: number; openingCell: string; marker: string }

/** Only the input gateway calls this service. No repository listener, timers or layout reads. */
export class MarkdownInput {
  private readonly setting;
  readonly enabled;
  private candidate?: Candidate;
  private adjacent?: { key: string; caret: number; revision: number };
  constructor(private readonly editor: ReactiveEditor) {
    this.setting = createSignal(editor.features.markdownInputTransformation);
    this.enabled = this.setting[0];
  }
  toggle = () => { this.cancel(); this.setting[1](value => !value); };
  cancel = () => { this.candidate = undefined; this.adjacent = undefined; };

  /** Called after accepting ordinary input; conversion is a separate atomic Undo entry. */
  typed(key: string, start: number, end: number, text: string): number | undefined {
    if (!this.enabled() || start !== end || [...text].length !== 1) { this.cancel(); return; }
    const editor = this.editor, node = editor.node(key)!;
    const record = editor.repository.readState().contents[node.contentKey];
    const caret = start + 1, old = this.candidate;
    // Every intervening edit/replay invalidates provenance, including edits from another occurrence.
    if (old && (old.key !== key || old.caret !== start || record.inlineRevision !== old.revision + 1 || node.inlineContent[old.start] !== old.openingCell)) this.candidate = undefined;
    const candidate = this.candidate;
    if (candidate) {
      candidate.caret = caret; candidate.revision = record.inlineRevision;
      if (candidate.marker === '#' && text !== '#' && text !== ' ') { this.cancel(); return; }
      if (candidate.marker === '#' && text === '#') return;
      if (text === candidate.marker || candidate.marker === '[' && text === ')' || candidate.marker === '#' && text === ' ') {
        const properties = (node.payload.standoffProperties ?? []) as any[];
        if (markdownLiteralContext(editor, key) || properties.some(p => !p.isDeleted && /(?:^|[/:-])(?:code|literal|superposition)(?:$|[/:-])/.test(p.type ?? '') && p.start < caret && p.end >= candidate.start)) { this.cancel(); return; }
      }
      if (candidate.marker === '-') {
        if (text !== '-') { this.cancel(); return; }
        if (caret < 3) return;
        const projection = editor.projections.get(node.viewId)!;
        const parent = projection.parentOf(key);
        if (!parent?.children.includes(key) || candidate.start !== 0 ||
          !node.inlineContent.slice(0, caret).every(k => editor.node(k)?.payload.text === '-')) { this.cancel(); return; }
        // Keep the original editor as the continuation: suffix Cells, annotations,
        // owned relations and native focus survive without a text-editor remount.
        editor.commands.structuralTransaction('Markdown horizontal line', () => {
          editor.commands.insert({ type: 'horizontal-line-block', id: crypto.randomUUID() }, { kind: 'before', anchorKey: key });
          editor.commands.replaceInlineRange(key, 0, caret, '');
        });
        editor.selections.mapContentEdit(node.contentKey, 0, caret, 0);
        this.cancel(); return 0;
      }
      if (candidate.marker === '#' && text === ' ') {
        if (start < 1 || start > 6) { this.cancel(); return; }
        const prefix = node.inlineContent.slice(0, caret).map(k => editor.node(k)?.payload.text).join('');
        if (!/^#{1,6} $/.test(prefix)) { this.cancel(); return; }
        const blockProperties = JSON.parse(JSON.stringify(node.payload.blockProperties ?? [])) as any[];
        const metadata = JSON.parse(JSON.stringify(node.payload.metadata ?? {}));
        delete metadata.htmlHeadingLevel;
        editor.commands.structuralTransaction('Markdown heading', () => {
          editor.commands.setPayloadField(key, 'blockProperties', [...blockProperties.filter(p => !/^block\/font\/size(?:\/h[1-6])?$/.test(p.type)), { type: 'block/font/size', value: `h${start}` }]);
          if ((node.payload.metadata as any)?.htmlHeadingLevel !== undefined) editor.commands.setPayloadField(key, 'metadata', metadata);
          editor.commands.replaceInlineRange(key, 0, caret, '');
        });
        editor.selections.mapContentEdit(node.contentKey, 0, caret, 0); this.cancel(); return 0;
      }
      if (text !== candidate.marker && !(candidate.marker === '[' && text === ')')) return;
      const cells = node.inlineContent.slice(candidate.start, caret).map(k => editor.node(k));
      if (cells.some(c => c?.viewType !== 'text-cell')) { this.cancel(); return; }
      const source = cells.map(c => String(c!.payload.text)).join('');
      const run = /^(\*+|~+)/.exec(source)?.[0];
      if (run && (source.length <= run.length * 2 || run.length > 3 || candidate.marker === '~' && run.length !== 2 || !source.endsWith(run))) return;
      const root = markdownParser.parse(source).topNode.firstChild;
      const match = root?.name === 'Paragraph' && children(root).find(n => n.from === 0 && n.to === source.length && ['Emphasis', 'StrongEmphasis', 'Strikethrough', 'Link'].includes(n.name));
      if (!match) return;
      const plan = inlineMarkdownPlan(source, match);
      if (!plan.marks.length) return;
      const boundaries = new Map<number, number>([[0, candidate.start]]); let offset = 0;
      cells.forEach((cell, i) => { offset += String(cell!.payload.text).length; boundaries.set(offset, candidate.start + i + 1); });
      if ([...plan.remove.flat(), ...plan.marks.flatMap(m => [m.from, m.to])].some(p => !boundaries.has(p))) return;
      const mapped: MarkdownPlan = { remove: plan.remove.map(([a, b]) => [boundaries.get(a)!, boundaries.get(b)!]), marks: plan.marks.map(m => ({ ...m, from: boundaries.get(m.from)!, to: boundaries.get(m.to)! })) };
      const properties = JSON.parse(JSON.stringify(node.payload.standoffProperties ?? [])) as any[];
      const origins: (number | null)[] = properties.map((_, i) => i);
      for (const m of mapped.marks) {
        if (m.from >= m.to || properties.some(p => !p.isDeleted && p.type === m.type && p.start === m.from && p.end === m.to - 1 && p.value === m.value)) continue;
        properties.push({ id: crypto.randomUUID(), type: m.type, start: m.from, end: m.to - 1, ...(m.value ? { value: m.value } : {}) }); origins.push(null);
      }
      const deletions = mapped.remove.sort((a, b) => b[0] - a[0]);
      editor.commands.structuralTransaction('Markdown inline formatting', () => {
        editor.commands.setPayloadField(key, 'standoffProperties', properties, undefined, origins);
        for (const [a, b] of deletions) editor.commands.replaceInlineRange(key, a, b, '');
      });
      for (const [a, b] of deletions) editor.selections.mapContentEdit(node.contentKey, a, b, 0);
      const result = caret - deletions.reduce((n, [a, b]) => n + b - a, 0);
      this.cancel(); this.adjacent = { key, caret: result, revision: editor.repository.readState().contents[node.contentKey].inlineRevision }; return result;
    }
    if (!['*', '~', '[', '#', '-'].includes(text) || (text === '#' || text === '-') && start !== 0) return;
    if (markdownLiteralContext(editor, key) || editor.crossText.range() || (editor.selections.sets[key]?.items.length ?? 0) > 1) return;
    const previous = start ? String(editor.node(node.inlineContent[start - 1])?.payload.text ?? '') : '';
    if (previous && !/[\s([{]/.test(previous) && !(this.adjacent?.key === key && this.adjacent.caret === start && this.adjacent.revision + 1 === record.inlineRevision)) return;
    // Only candidate openings inspect preceding text, never ordinary letters/spaces.
    // An unfinished backtick run protects literal typing as well as closed inline code.
    const prefix = node.inlineContent.slice(0, start).map(k => editor.node(k)?.payload.text ?? '').join('');
    let ticks = 0;
    for (const match of prefix.matchAll(/\\.|`+/g)) if (match[0][0] === '`') { const length = match[0].length; if (!ticks) ticks = length; else if (ticks === length) ticks = 0; }
    if (ticks) return;
    this.candidate = { key, start, caret, revision: record.inlineRevision, openingCell: node.inlineContent[start], marker: text };
  }
}
