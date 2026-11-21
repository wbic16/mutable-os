import {prepareLayout} from '../block-tree/layout-authoring';
import {contentLength} from "../block-tree/inline-sequence";
import { holdStructuralMedia } from './structural-media';
import { createStore } from 'solid-js/store';
import { clone } from '../block-tree/clone';
import type { BlockNode, ExistingBlockDto } from '../block-tree/types';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { NativeTextSelection } from './mounts';
import type { TextRangeSnapshot } from './text-ranges';
import { taskOwner } from './tasks';
import { revealTableCell } from './table-presentation';

export type TableDirection = 'left' | 'right' | 'up' | 'down';
export type TableRequest =
  | { kind: 'create'; targets: string[]; columns: 2 | 3 | 4; nested?: boolean }
  | { kind: 'swap-cell'; target: string; direction: TableDirection }
  | { kind: 'move-row'; target: string; direction: 'up' | 'down' }
  | { kind: 'transfer'; targets: string[]; destination: string }
  | { kind: 'insert-row' | 'insert-column' | 'dissolve'; target: string }
  | { kind: 'remove-row' | 'remove-column'; target: string; extract?: boolean };

/** Optional, table-owned relative widths. No resize UI or rendering is enabled
 * by this model. Column operations keep the future widths aligned with columns. */
export interface TableColumns { version: 1; weights: number[] }
export interface PreparedTableOperation {
  readonly kind: TableRequest['kind'];
  readonly revision: number;
  readonly affectedBlocks: number;
  readonly extractedBlocks: number;
}
interface Bookmark {
  view: string; placement: string; content: string;
  inline?: { anchor: number; head: number };
  native?: NativeTextSelection;
}
interface Plan {
  target: BlockNode;
  moving: BlockNode[];
  selectionInputs: string[];
  apply(): string[];
  invocation?: TextRangeSnapshot;
}
const families = {
  'table-block': { row: 'table-row-block', cell: 'table-cell-block' },
  'grid-block': { row: 'grid-row-block', cell: 'grid-cell-block' },
} as const;
const isTable = (n: BlockNode) => n.viewType in families;
const shellTypes = new Set(['table-block', 'table-row-block', 'table-cell-block', 'grid-block', 'grid-row-block', 'grid-cell-block']);
const dto = (type: string, children: ExistingBlockDto[] = []): ExistingBlockDto => ({ id: crypto.randomUUID(), type, children });
const emptyText = () => ({ ...dto('standoff-editor-block'), text: '' });
function fail(message: string): never { throw new Error(message); }

/** Canonical operations only. Increment 2 supplies slash/context controls.
 * Preparation never changes the document; execution uses one native transaction.
 * There are no typing handlers or general-purpose history/capture subscriptions. */
export class TableOperations {
  private readonly notices = createStore<Record<string, string>>({});
  notice(view: string) { return this.notices[0][view] ?? ''; }
  releaseView(view: string) { this.guideStore[1](view, undefined!); this.notices[1](view, undefined!); }
  private readonly guideStore = createStore<Record<string, boolean>>({});
  guides(view: string) { return this.guideStore[0][view] !== false; }
  toggleGuides(view: string) { this.guideStore[1](view, !this.guides(view)); }
  private plans = new WeakMap<PreparedTableOperation, Plan>();
  private bookmarks = new Map<string, { before?: Bookmark; after?: Bookmark; occurrences: Bookmark[] }>();
  private stop?: () => void;
  private stopBefore?: () => void;
  private recording?: { id?: string; occurrences: Bookmark[] };
  private alive = true;
  constructor(private editor: ReactiveEditor) {}

  private node(key: string) { return this.editor.node(key) ?? fail('The selected Block is no longer available.'); }
  private parent(n: BlockNode) { return this.editor.projections.get(n.viewId)?.parentOf(n.key); }
  private children(n: BlockNode) { return n.children.map(key => this.node(key)); }
  private document(n: BlockNode): BlockNode {
    let current: BlockNode | undefined = n;
    while (current && current.viewType !== 'document-block') {
      const parent = this.parent(current);
      if (!parent?.children.includes(current.key)) fail('Use content in the same ordinary Document flow.');
      current = parent;
    }
    return current ?? fail('Choose a Block in a Document.');
  }
  private owned(n: BlockNode) {
    const p = this.editor.repository.readState().placements[n.placementKey], parent = this.parent(n);
    if (!parent?.children.includes(n.key) || !p || p.kind !== 'owned' || p.externalReference || p.resolvedReference || p.resourceRegistration)
      fail('Resource roots, relation placements and references cannot be moved by table operations.');
    // Mutating a shared parent's child array would change other occurrences too.
    if (this.editor.repository.contentReferenceCount(parent.contentKey) !== 1 || this.editor.repository.contentReferenceCount(n.contentKey) !== 1)
      fail('Shared Blocks require an explicit ownership decision before table editing.');
    this.document(n);
    return parent;
  }
  private nearest(key: string): BlockNode | undefined {
    let n: BlockNode | undefined = this.node(key);
    while (n && n.viewType !== 'document-block') {
      if (isTable(n)) return n;
      const p = this.parent(n);
      if (!p?.children.includes(n.key)) return;
      n = p;
    }
  }
  private context(key: string) {
    const table = this.nearest(key) ?? fail('Choose content in a table.');
    this.owned(table);
    const family = families[table.viewType as keyof typeof families];
    const rows = this.children(table), cells = rows.map(r => this.children(r));
    if (!rows.length || !cells[0].length || rows.some(r => r.viewType !== family.row) ||
      cells.some(row => row.length !== cells[0].length || row.some(c => c.viewType !== family.cell)))
      fail('This table is not rectangular. Its existing content has not been changed.');
    for (const n of [...rows, ...cells.flat()]) {
      this.owned(n);
      const meta = n.payload.metadata as any;
      if (meta?.htmlTableCell && [meta.htmlTableCell.colSpan, meta.htmlTableCell.rowSpan].some(v => v !== undefined && v !== 1))
        fail('Merged or spanned cells are not supported by these operations.');
    }
    let cursor: BlockNode | undefined = this.node(key), row: BlockNode | undefined, cell: BlockNode | undefined;
    while (cursor && cursor.key !== table.key) {
      if (cursor.viewType === family.cell) cell = cursor;
      if (cursor.viewType === family.row) row = cursor;
      cursor = this.parent(cursor);
    }
    const ri = row ? rows.findIndex(r => r.key === row!.key) : -1;
    const ci = cell && ri >= 0 ? cells[ri].findIndex(c => c.key === cell!.key) : -1;
    const metadata = this.editor.repository.readState().contents[table.contentKey].payload.metadata as Record<string, unknown> | undefined;
    const widths = metadata?.tableColumns as TableColumns | undefined;
    if (widths && (widths.version !== 1 || !Array.isArray(widths.weights) || widths.weights.length !== cells[0].length ||
      widths.weights.some(w => typeof w !== 'number' || !Number.isFinite(w) || w <= 0))) fail('Unsupported column-width metadata; no changes were made.');
    return { table, family, rows, cells, row, cell, ri, ci, widths: widths && clone(widths) };
  }
  private targets(keys: string[]) {
    if (!keys.length) fail('Select one or more sibling Blocks.');
    let nodes = [...new Set(keys.map(key => this.editor.surfaces.wholeBlockKey(key)))].map(key => this.node(key));
    const selected = new Set(nodes.map(n => n.key));
    nodes = nodes.filter(n => { let p = this.parent(n); while (p) { if (selected.has(p.key)) return false; p = this.parent(p); } return true; });
    const parent = this.owned(nodes[0]);
    for (const n of nodes) {
      if (n.viewId !== nodes[0].viewId || this.owned(n).key !== parent.key) fail('Select ordinary Blocks with the same parent.');
      if (!this.editor.blockSelection.eligible(n.key) || shellTypes.has(n.viewType) && !isTable(n)) fail('Select content Blocks, not cell or row shells.');
      if (parent.viewType === 'indented-list-block' || parent.viewType === 'checkbox-block' ||
        (parent.payload.metadata as any)?.htmlListItem || (taskOwner(this.editor, n.key)?.key ?? n.key) !== n.key)
        fail('Move the whole list or compound task; individual items retain their list context.');
    }
    nodes.sort((a, b) => parent.children.indexOf(a.key) - parent.children.indexOf(b.key));
    const index = parent.children.indexOf(nodes[0].key);
    if (nodes.some((n, i) => parent.children[index + i] !== n.key)) fail('Select contiguous sibling Blocks.');
    return nodes;
  }
  private validateTextSelection(keys: string[]) {
    const active = typeof document !== 'undefined' ? this.editor.mounts.resolveElement(document.activeElement) : undefined;
    for (const key of keys) {
      if (this.editor.blockSelection.isSelected(this.editor.surfaces.wholeBlockKey(key))) continue;
      if ((this.editor.selections.sets[key]?.items.length ?? 0) > 1) fail('Use a single caret or select whole Blocks.');
      const selection = active?.nodeKey === key && active.handle.captureInlineSelection?.();
      if (selection && selection.anchor !== selection.head) fail('Collapse the text selection or select whole Blocks.');
    }
  }
  private continuity(roots: BlockNode[]) {
    const seen = new Set<string>(), occurrences: Bookmark[] = [];
    const visit = (n: BlockNode) => {
      if (seen.has(n.key)) return; seen.add(n.key);
      for (const projection of this.editor.projections.values()) {
        if (projection.occurrenceCount(n.placementKey) > 1) fail('A moved Block has multiple occurrences in one view.');
        const occurrence = projection.nodeForPlacement(n.placementKey), mount = occurrence && this.editor.mounts.get(occurrence.key);
        if (occurrence) occurrences.push({ view: occurrence.viewId, placement: occurrence.placementKey, content: occurrence.contentKey });
        if (mount?.composing) fail('Finish text composition before changing the table.');
        if (mount && !this.editor.features.reversibleBlocks) fail('Retained Block views are required for live table movement.');
        if (mount?.root.querySelector('iframe,video,audio') && typeof (mount.root.ownerDocument.body as any).moveBefore !== 'function')
          fail('This browser cannot preserve a live media viewer during structural movement.');
      }
      for (const key of [...n.children, ...Object.values(n.ownedRelations)]) visit(this.node(key));
    };
    roots.forEach(visit);
    return occurrences;
  }
  private holdMedia(occurrences: Bookmark[]) { holdStructuralMedia(this.editor,occurrences,'tableMediaParking'); }
  private removable(shells: BlockNode[], discardedEmptyText: BlockNode[] = []) {
    const ids = new Set([...shells, ...discardedEmptyText].map(n => n.payload.id));
    for (const n of shells) {
      this.owned(n);
      const record = this.editor.repository.readState().contents[n.contentKey];
      if (Object.keys(record.ownedRelations).length || Object.keys(record.opaqueRelations).length || record.inlineContent.length ||
        Object.keys(n.payload).some(k => !['id', 'type', 'metadata', 'blockProperties'].includes(k)) ||
        (n.payload.blockProperties as unknown[] | undefined)?.length ||
        Object.keys((n.payload.metadata as object) ?? {}).some(k => !['htmlTableCell', 'tableColumns'].includes(k)))
        fail('A table shell has authored data or relations. Extract that information explicitly before removing it.');
    }
    // Explicit destructive action only. Placement counts do not detect standoff
    // references. No vault query, persistent index or per-keystroke scan.
    for (const c of Object.values(this.editor.repository.readState().contents)) {
      const properties = c.payload.standoffProperties as Record<string, unknown>[] | undefined;
      if (properties?.some(p => !p.isDeleted && p.type === 'codex/block-reference' && ids.has(p.value)))
        fail('A removed table shell or empty Block is referenced by another Block. Extract it or retain its structure.');
    }
  }
  private empty(n: BlockNode): boolean {
    return n.viewType === 'standoff-editor-block' && this.editor.repository.contentReferenceCount(n.contentKey) === 1 && !contentLength(this.editor.repository.readState().contents[n.contentKey]) && !n.children.length &&
      !Object.keys(n.ownedRelations).length && !Object.keys(this.editor.repository.readState().contents[n.contentKey].opaqueRelations).length &&
      Object.entries(n.payload).every(([k, value]) => ['id', 'type', 'text'].includes(k) ? k !== 'text' || value === '' :
        ['standoffProperties', 'blockProperties'].includes(k) && Array.isArray(value) && !value.length);
  }

  prepare(input: TableRequest, invocation?: TextRangeSnapshot): PreparedTableOperation {
    if (!this.alive || !this.editor.features.tableLayouts) fail('Table layout operations are disabled.');
    if (this.editor.crossText.range()) fail('Select whole Blocks rather than a cross-Block text range.');
    const request = clone(input), e = this.editor, c = e.commands;
    const selectionInputs = 'targets' in request ? request.targets : [];
    this.validateTextSelection(selectionInputs);
    let target: BlockNode, apply: () => string[], affectedBlocks = 0, extractedBlocks = 0;
    let moving: BlockNode[] = [];
    if (request.kind === 'create') {
      if (![2, 3, 4].includes(request.columns)) fail('Choose two, three or four columns.');
      const nodes = this.targets(request.targets); target = nodes[0]; moving = nodes; affectedBlocks = nodes.length;
      const count = request.columns;
      apply = () => {
        const rows = Array.from({ length: Math.ceil(nodes.length / count) }, (_, r) =>
          Array.from({ length: count }, (_, col) => r * count + col < nodes.length ? [] : [emptyText()]));
        const table = c.insert(prepareLayout('table', rows), { kind: 'before', anchorKey: target.placementKey });
        const cells = c.childrenOf(table).flatMap(row => c.childrenOf(row));
        nodes.forEach((n, i) => c.move(n.placementKey, { kind: 'at', parentKey: cells[i], index: 0 }));
        return [target.placementKey];
      };
    } else if (request.kind === 'transfer') {
      const nodes = this.targets(request.targets), source = this.parent(nodes[0])!, dest = this.node(request.destination);
      const ctx = this.context(dest.key); target = nodes[0]; moving = nodes; affectedBlocks = nodes.length;
      if (dest.viewType !== ctx.family.cell || source.viewType !== ctx.family.cell || source.key === dest.key ||
        this.nearest(source.key)?.key !== ctx.table.key || source.viewId !== dest.viewId) fail('Choose different cells in the same table.');
      if (nodes.some(n => { let p: BlockNode | undefined = dest; while (p) { if (p.key === n.key) return true; p = this.parent(p); } return false; })) fail('Content cannot move into its own subtree.');
      apply = () => {
        nodes.forEach(n => c.move(n.placementKey, { kind: 'at', parentKey: dest.placementKey, index: c.childrenOf(dest.placementKey).length }));
        if (!c.childrenOf(source.placementKey).length) c.insert(emptyText(), { kind: 'at', parentKey: source.placementKey, index: 0 });
        return [nodes[0].placementKey];
      };
    } else {
      const ctx = this.context(request.target), { table, family, rows, cells, row, cell, ri, ci, widths } = ctx;
      target = this.node(request.target); moving = [table];
      const newRow = () => dto(family.row, cells[0].map(() => dto(family.cell, [emptyText()])));
      const setWidths = (weights: number[]) => c.setPayloadField(table.placementKey, 'metadata', { ...clone(e.repository.readState().contents[table.contentKey].payload.metadata as object ?? {}), tableColumns: { ...widths, version: 1, weights } });
      if (request.kind === 'swap-cell') {
        if (!cell || !row || ri < 0 || ci < 0 || !['left', 'right', 'up', 'down'].includes(request.direction)) fail('Choose a cell and a valid direction.');
        const dr = request.direction === 'up' ? -1 : request.direction === 'down' ? 1 : 0;
        const dc = request.direction === 'left' ? -1 : request.direction === 'right' ? 1 : 0;
        const other = cells[ri + dr]?.[ci + dc]; if (!other) fail('There is no adjacent cell in that direction.');
        affectedBlocks = 2;
        apply = () => {
          c.move(cell.placementKey, { kind: 'before', anchorKey: other.placementKey });
          c.move(other.placementKey, { kind: 'at', parentKey: row.placementKey, index: ci });
          return [cell.placementKey];
        };
      } else if (request.kind === 'move-row') {
        if (!row || !['up', 'down'].includes(request.direction)) fail('Choose a row and a valid direction.');
        const other = rows[ri + (request.direction === 'up' ? -1 : 1)]; if (!other) fail('There is no adjacent row in that direction.');
        affectedBlocks = 1;
        apply = () => { c.move(row.placementKey, { kind: request.direction === 'up' ? 'before' : 'after', anchorKey: other.placementKey }); return [row.placementKey]; };
      } else if (request.kind === 'insert-row') {
        if (!row) fail('Choose a row.');
        apply = () => [c.insert(newRow(), { kind: 'after', anchorKey: row.placementKey })];
      } else if (request.kind === 'insert-column') {
        if (!cell || ci < 0) fail('Choose a cell to insert a column after.');
        apply = () => {
          const added = rows.map(r => c.insert(dto(family.cell, [emptyText()]), { kind: 'at', parentKey: r.placementKey, index: ci + 1 }));
          if (widths) { const w = [...widths.weights]; w.splice(ci + 1, 0, w.reduce((a, b) => a + b, 0) / w.length); setWidths(w); }
          return [added[ri]];
        };
      } else if (request.kind === 'dissolve' || request.kind === 'remove-row' || request.kind === 'remove-column') {
        const dissolve = request.kind === 'dissolve', removeRow = request.kind === 'remove-row';
        if (!dissolve && (!row || !removeRow && !cell)) fail('Choose the row or column to remove.');
        if (!dissolve && (removeRow ? rows.length === 1 : cells[0].length === 1)) fail('Use table dissolution to remove the final row or column.');
        const removedCells = dissolve ? cells.flat() : removeRow ? cells[ri] : cells.map(r => r[ci]);
        const removedRows = dissolve ? rows : removeRow ? [row!] : [];
        const shells = [...removedCells, ...removedRows, ...(dissolve ? [table] : [])];
        const contents = removedCells.flatMap(n => this.children(n));
        const nonempty = contents.some(n => !this.empty(n));
        const extract = dissolve || ('extract' in request && !!request.extract);
        if (!extract && nonempty) fail('This row or column contains content. Review extraction before removing it.');
        this.removable(shells, extract ? [] : contents);
        affectedBlocks = shells.length; extractedBlocks = extract ? contents.length : 0;
        apply = () => {
          let after = table.placementKey;
          if (extract) for (const n of contents) {
            c.move(n.placementKey, { kind: dissolve ? 'before' : 'after', anchorKey: dissolve ? table.placementKey : after });
            after = n.placementKey;
          }
          // Only the selected table's direct shells are removed. Never recurse
          // into nested tables. remove() retains native owned definitions.
          removedCells.forEach(n => c.remove(n.placementKey)); removedRows.forEach(n => c.remove(n.placementKey));
          if (dissolve) c.remove(table.placementKey);
          else if (!removeRow && widths) setWidths(widths.weights.filter((_, i) => i !== ci));
          return extract && contents.length ? contents.map(n => n.placementKey) : [table.placementKey];
        };
      } else return fail('Unsupported table operation.');
    }
    if (e.commandRegistry.permit?.(target.key, `table.${request.kind}`) === false) fail('Table editing is not permitted here.');
    this.continuity(moving);
    if (invocation) {
      this.validateTextSelection([invocation.nodeKey]);
      e.textRanges.validate([invocation], 'cell');
      const source = 'target' in request ? request.target : request.targets[0];
      if (invocation.nodeKey !== source || this.node(invocation.nodeKey).viewType !== 'standoff-editor-block') fail('The command invocation belongs to a different Block.');
    }
    const receipt = Object.freeze({ kind: request.kind, revision: e.repository.state.revision, affectedBlocks, extractedBlocks });
    this.plans.set(receipt, { target, moving, selectionInputs, apply, invocation: invocation && clone(invocation) });
    return receipt;
  }

  private bookmark(target: BlockNode): Bookmark | undefined {
    const active = typeof document !== 'undefined' ? this.editor.mounts.resolveElement(document.activeElement) : undefined;
    const overlay = active && this.editor.overlays.overlays.find(o => o.key === active.nodeKey);
    const node = active && this.editor.node(active.nodeKey) || (overlay?.returnFocusKey && this.editor.node(overlay.returnFocusKey)) || this.editor.node(this.editor.focus.state.focusedKey!) || target;
    if (node.viewId !== target.viewId) return;
    const mount = this.editor.mounts.get(node.key);
    const inline = overlay?.returnInlineSelection ?? mount?.captureInlineSelection?.();
    const native = overlay?.returnSelection ?? mount?.captureSelection?.();
    // Overlay values are Solid store proxies; session history keeps plain bookmarks.
    return { view: node.viewId, placement: node.placementKey, content: node.contentKey,
      inline: inline && { anchor: inline.anchor, head: inline.head },
      native: native && { start: native.start, end: native.end, direction: native.direction } };
  }
  private restore(bookmark?: Bookmark, revision = this.editor.repository.state.revision) {
    if (!bookmark) return;
    queueMicrotask(() => {
      if (!this.alive || this.editor.repository.state.revision !== revision) return;
      const n = this.editor.nodeForPlacementInView(bookmark.placement, bookmark.view);
      if (!n || n.contentKey !== bookmark.content) return;
      const e = this.editor, m = e.mounts.get(n.key);
      if (!m) return;
      e.surfaces.reveal(n.key);
      e.focus.request(n.key, { reason: 'table-operation' });
      if (bookmark.inline) {
        m.restoreInlineSelection?.(bookmark.inline);
        const actual = m.captureInlineSelection?.();
        // Chromium can normalize a flow-element boundary to its first text
        // node after reparenting. Resolve the existing mount's Cell boundaries
        // if that happened; this does not measure or traverse document layout.
        if (m.inlineBoundary && (actual?.anchor !== bookmark.inline.anchor || actual?.head !== bookmark.inline.head)) {
          const anchor = m.inlineBoundary(bookmark.inline.anchor), head = m.inlineBoundary(bookmark.inline.head);
          m.root.ownerDocument.getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
        }
        e.selections.setPrimary(n.key, n.contentKey, n.viewId, bookmark.inline.anchor, bookmark.inline.head);
        e.setCaret(n.key, bookmark.inline.anchor === bookmark.inline.head ? bookmark.inline.head : undefined);
      }
      if (bookmark.native) m.restoreSelection?.(bookmark.native);
      revealTableCell(m.root);
    });
  }
  execute(receipt: PreparedTableOperation): void {
    const plan = this.plans.get(receipt), e = this.editor;
    if (!this.alive || !e.features.tableLayouts || !plan || receipt.revision !== e.repository.state.revision) fail('The table command is stale. Prepare it again.');
    if (e.crossText.range()) fail('Select whole Blocks rather than a cross-Block text range.');
    if (e.commandRegistry.permit?.(plan.target.key, `table.${receipt.kind}`) === false) fail('Table editing is not permitted here.');
    if (e.completionInput?.beforeSave?.() === false) fail('Finish or cancel Scry before changing the table.');
    if (receipt.revision !== e.repository.state.revision) fail('The source changed while closing Scry. Prepare the command again.');
    this.validateTextSelection(plan.selectionInputs);
    // Composition or live viewers may have changed without a canonical revision.
    const occurrences = this.continuity(plan.moving);
    if (plan.invocation) e.textRanges.validate([plan.invocation], 'cell');
    this.plans.delete(receipt);
    this.stopBefore ??= e.repository.subscribeBeforeChanges((_label, cause) => {
      const affected = cause?.kind === 'undo' || cause?.kind === 'redo'
        ? this.bookmarks.get(cause.sourceCommitId)?.occurrences : this.recording?.occurrences;
      if (affected) this.holdMedia(affected);
    });
    this.stop ??= e.repository.subscribeChanges(change => {
      if (!change.commit) return;
      const cause = change.commit.cause;
      if (cause?.kind === 'undo' || cause?.kind === 'redo') {
        const bookmarks = this.bookmarks.get(cause.sourceCommitId);
        this.restore(bookmarks?.[cause.kind === 'undo' ? 'before' : 'after']);
      } else if (this.recording) this.recording.id = change.commit.id;
    });
    const before = this.bookmark(plan.target), after = before && clone(before);
    if (after?.inline && plan.invocation && after.placement === plan.invocation.placementKey) {
      const { start, end } = plan.invocation;
      const map = (i: number) => i <= start ? i : i < end ? start : i - (end - start);
      after.inline = { anchor: map(after.inline.anchor), head: map(after.inline.head) };
    }
    const recording: { id?: string; occurrences: Bookmark[] } = this.recording = { occurrences };
    let survivors: string[] = [];
    try {
      e.commands.structuralTransaction(`Table ${receipt.kind}`, () => {
        if (plan.invocation) e.commands.replaceInlineRange(plan.invocation.nodeKey, plan.invocation.start, plan.invocation.end, '');
        survivors = plan.apply();
      }, { commandId: `table.${receipt.kind}`, subjects: [{ contentKey: plan.target.contentKey, placementKey: plan.target.placementKey }] });
    } finally { this.recording = undefined; }
    let focus = after;
    if (!focus || !e.nodeForPlacementInView(focus.placement, focus.view)) {
      let n = survivors[0] && e.nodeForPlacementInView(survivors[0], plan.target.viewId);
      while (n && n.viewType !== 'standoff-editor-block' && n.children[0]) n = e.node(n.children[0]);
      focus = n ? { view: n.viewId, placement: n.placementKey, content: n.contentKey, ...(n.viewType === 'standoff-editor-block' ? { inline: { anchor: 0, head: 0 } } : {}) } : undefined;
    }
    if (recording.id) this.bookmarks.set(recording.id, { before, after: focus, occurrences });
    e.blockSelection.clear(); this.restore(focus);
    this.notices[1](plan.target.viewId, `Table ${receipt.kind.replaceAll('-', ' ')} completed.`);
  }
  run(request: TableRequest, invocation?: TextRangeSnapshot) { this.execute(this.prepare(request, invocation)); }
  dispose() { this.alive = false; this.stop?.(); this.stopBefore?.(); this.bookmarks.clear(); this.plans = new WeakMap(); }
}
