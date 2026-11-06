import { markdownParser } from '../interchange/markdown-native';
import { parser } from '@lezer/javascript';
import { classHighlighter, highlightTree } from '@lezer/highlight';
import { batch } from 'solid-js';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { NodeKey } from '../block-tree/types';
import type { TemporaryRangeCollection } from './session-decorations';

export const STANDOFF_CODE = 'standoff-code-block';
export function standoffCodeDto(language = 'javascript') {
  return { id: crypto.randomUUID(), type: STANDOFF_CODE, metadata: { markdownCode: { language } }, children: [{ id: crypto.randomUUID(), type: 'standoff-editor-block', text: '' }] };
}
export function codeLanguage(metadata: any): string {
  return String(metadata?.markdownCode?.language ?? 'javascript').toLowerCase();
}
const javascript = parser;
const typescript = parser.configure({ dialect: 'ts' });
export interface CodeText { key: NodeKey; version: number; cells: string[]; supported?: boolean }
export interface SyntaxToken { start: number; end: number; classes: string[] }
export interface CodeSyntaxTiming { sourceMs: number; parseMs: number; mapMs: number; publishMs: number; blocks: number; ranges: number; analyses: number }
/** Small, occurrence-scoped diagnostics; removed with the mounted host. */
export const codeSyntaxDiagnostics = new WeakMap<ReactiveEditor, Map<NodeKey, CodeSyntaxTiming>>();

/** LF separates TextBlocks; embedded newlines and UTF-16 Cell advances are retained verbatim. */
export function analyseCode(blocks: CodeText[], language: string) {
  const start = performance.now();
  let offset = 0;
  const segments = blocks.map(block => {
    const boundaries = new Map<number, number>(); let length = 0;
    boundaries.set(0, 0);
    block.cells.forEach((text, index) => { length += text.length; boundaries.set(length, index + 1); });
    const segment = { start: offset, end: offset + length, boundaries, text: block.cells.join('') };
    offset += length + 1; return segment;
  });
  const source = segments.map(segment => segment.text).join('\n');
  const sourceMs = performance.now() - start;
  const selected = ['js', 'javascript'].includes(language) ? javascript : ['ts', 'typescript'].includes(language) ? typescript : ['md', 'markdown'].includes(language) ? markdownParser : undefined;
  const parsedAt = performance.now(), tree = selected?.parse(source), parseMs = performance.now() - parsedAt;
  const mappedAt = performance.now(), tokens: SyntaxToken[][] = blocks.map(() => []);
  let cursor = 0;
  if (tree) highlightTree(tree, classHighlighter, (from, to, style) => {
    while (cursor < segments.length && segments[cursor].end <= from) cursor++;
    for (let index = cursor; index < segments.length && segments[index].start < to; index++) {
      const segment = segments[index], a = Math.max(from, segment.start), b = Math.min(to, segment.end);
      if (a >= b) continue;
      const start = segment.boundaries.get(a - segment.start), end = segment.boundaries.get(b - segment.start);
      if (start === undefined || end === undefined) continue;
      tokens[index].push({ start, end, classes: style.split(' ').map(name => 'syntax-' + name.replace(/^tok-/, '')) });
    }
  });
  return { tokens, sourceMs, parseMs, mapMs: performance.now() - mappedAt };
}

/** Owns only derived ranges. Source edits, history and persistence remain with ordinary TextBlocks. */
export class StandoffCodeSyntax {
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private contents = new Set<string>();
  private collections = new Map<NodeKey, { collection: TemporaryRangeCollection; signature: string }>();
  private stop: () => void;
  private analyses = 0;
  private sources = new Map<NodeKey, CodeText>();
  constructor(private editor: ReactiveEditor, private key: NodeKey) {
    this.contents.add(editor.node(key)!.contentKey);
    this.stop = editor.repository.subscribeChanges(change => {
      // Changed-record routing only: unrelated documents never trigger analysis.
      for (const [key, previous] of change.previousContents) {
        if (!this.contents.has(key)) continue;
        const current = editor.repository.readState().contents[key];
        if (!current || !previous || current.viewType !== previous.viewType || current.inlineRevision !== previous.inlineRevision
          || key === editor.node(this.key)?.contentKey && (codeLanguage(current.payload.metadata) !== codeLanguage(previous.payload.metadata)
            || JSON.stringify(current.children) !== JSON.stringify(previous.children))) { this.schedule(); break; }
      }
    });
    if (!codeSyntaxDiagnostics.has(editor)) codeSyntaxDiagnostics.set(editor, new Map());
    this.schedule();
  }
  schedule = () => {
    if (this.disposed || this.timer !== undefined) return;
    this.timer = setTimeout(() => { this.timer = undefined; this.refresh(); }, 25);
  };
  refresh() {
    if (this.disposed) return;
    const { editor } = this, root = editor.node(this.key);
    if (!root) return;
    const nodes = root.children.map(key => editor.node(key));
    if (nodes.some(node => node && editor.mounts.get(node.key)?.composing)) { this.schedule(); return; }
    this.contents = new Set([root.contentKey, ...nodes.flatMap(node => node ? [node.contentKey] : [])]);
    const active = new Set(nodes.filter(node => node?.viewType === 'standoff-editor-block').map(node => node!.key));
    for (const key of this.sources.keys()) if (!active.has(key)) this.sources.delete(key);
    for (const [key, value] of this.collections) if (!active.has(key)) { value.collection.dispose(); this.collections.delete(key); }
    const sourceAt = performance.now();
    let supported = true;
    const blocks: CodeText[] = nodes.flatMap(node => {
      if (!node || node.viewType !== 'standoff-editor-block') { supported = false; return []; }
      const version = editor.repository.readState().contents[node.contentKey].inlineRevision;
      const cached = this.sources.get(node.key);
      if (cached?.version === version) { if (cached.supported === false) supported = false; return [cached]; }
      let textOnly = true;
      const cells = node.inlineContent.map(key => {
        const cell = editor.node(key);
        if (cell?.viewType !== 'text-cell') { supported = false; textOnly = false; }
        return String(cell?.payload.text ?? '');
      });
      const source = { key: node.key, version, cells, supported: textOnly };
      this.sources.set(node.key, source); return [source];
    });
    const readMs = performance.now() - sourceAt;
    const result = analyseCode(blocks, supported ? codeLanguage(root.payload.metadata) : 'plain');
    let published = 0, ranges = 0;
    const publishAt = performance.now();
    batch(() => blocks.forEach((block, index) => {
      const tokens = result.tokens[index]; ranges += tokens.length;
      const signature = JSON.stringify([block.version, tokens]);
      let owner = this.collections.get(block.key);
      if (owner?.signature === signature) return;
      if (!owner) {
        owner = { collection: editor.temporaryRanges.createCollection(`syntax:${this.key}:${block.key}`), signature: '' };
        this.collections.set(block.key, owner);
      }
      owner.collection.replace(tokens.map((token, index) => ({ id: String(index), range: editor.textRanges.snapshot(block.key, token.start, token.end), renderers: [{ id: 'syntax', name: 'css-class', params: { classes: token.classes, affectsLayout: false } }] })));
      owner.signature = signature; published++;
    }));
    codeSyntaxDiagnostics.get(editor)!.set(this.key, { sourceMs: readMs + result.sourceMs, parseMs: result.parseMs, mapMs: result.mapMs, publishMs: performance.now() - publishAt, blocks: published, ranges, analyses: ++this.analyses });
  }
  dispose() {
    this.disposed = true; clearTimeout(this.timer); this.stop();
    batch(() => { for (const value of this.collections.values()) value.collection.dispose(); });
    this.collections.clear(); this.sources.clear(); codeSyntaxDiagnostics.get(this.editor)?.delete(this.key);
  }
}
