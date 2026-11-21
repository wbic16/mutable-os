import { taskOwner, taskState, setTaskState } from './tasks';
import { hasBlockMode } from '../block-tree/mode-editing';
import type { AutomaticListMetadata } from "../block-tree/list-wrap-plan";
import type { BlockNode, ExistingBlockDto, NodeKey } from '../block-tree/types';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { BlockTreeProjection } from '../block-tree/projection';

const isList = (node?: BlockNode) => node?.viewType === 'indented-list-block';
const isItemContainer = (node?: BlockNode) => node?.viewType === 'checkbox-block' || node?.viewType === 'container-block' && (!!(node.payload.metadata as any)?.htmlListItem || taskState(node) !== undefined);

/** Both current item-owned lists and older sibling-nested lists have one owner. */
export function listItemOwner(projection: BlockTreeProjection, listKey: NodeKey): BlockNode | undefined {
  const parent = projection.parentOf(listKey);
  if (!parent) return;
  if (!isList(parent)) {
    if (isList(projection.parentOf(parent.key)) || taskState(parent) !== undefined) return parent;
    return;
  }
  const index = parent.children.indexOf(listKey);
  for (let i = index - 1; i >= 0; i--) {
    const candidate = projection.state.nodes[parent.children[i]];
    if (!isList(candidate)) return candidate;
  }
}

export function listItemChildren(projection: BlockTreeProjection, key: NodeKey): NodeKey[] {
  const item = projection.state.nodes[key];
  if (!item) return [];
  const children = item.children.filter(k => isList(projection.state.nodes[k]));
  const parent = projection.parentOf(key);
  if (isList(parent)) {
    for (let i = parent!.children.indexOf(key) + 1; i < parent!.children.length; i++) {
      const next = parent!.children[i];
      if (!isList(projection.state.nodes[next])) break;
      children.push(next);
    }
  }
  return children;
}

export function setListItemCollapsed(editor: ReactiveEditor, key: NodeKey, collapsed: boolean) {
  const item = editor.node(key);
  if (!item||!editor.canEditText(key)) return;
  editor.commands.setPayloadField(key, 'metadata', { ...JSON.parse(JSON.stringify(item.payload.metadata ?? {})), listCollapsed: collapsed }, collapsed ? 'Collapse list item' : 'Expand list item');
}
const listDto = (source?: BlockNode): ExistingBlockDto => ({
  ...(source ? JSON.parse(JSON.stringify(source.payload)) : { metadata: { htmlList: { ordered: false } } }),
  id: crypto.randomUUID(), type: 'indented-list-block', children: [],
});

/** Shared structural primitive. The caller decides eligibility and caret policy. */
export function wrapTextBlockInList(editor: ReactiveEditor, key: NodeKey, prefixLength = 0, list: AutomaticListMetadata = { ordered: false }): string {
  return editor.commands.wrapTextBlockInList(key, prefixLength, list);
}

// Inspect only candidate prefix Cells. Most spaces reject from the last Cell;
// unrelated text, annotations and document structure are never scanned here.
function listPrefix(editor: ReactiveEditor, source: BlockNode, caret: number): AutomaticListMetadata | undefined {
  const textAt = (index: number) => {
    const cell = editor.node(source.inlineContent[index]);
    return cell?.viewType === 'text-cell' ? cell.payload.text : undefined;
  };
  if (caret === 1) {
    const text = textAt(0);
    return text === '-' || text === '*' ? { ordered: false } : undefined;
  }
  if (caret < 2 || textAt(caret - 1) !== '.') return;
  let start = 0;
  for (let i = 0; i < caret - 1; i++) {
    const digit = textAt(i);
    if (typeof digit !== 'string' || !/^[0-9]$/.test(digit)) return;
    start = start * 10 + Number(digit);
    if (!Number.isSafeInteger(start)) return; // Never silently round a starting value.
  }
  if (start > 0) return { ordered: true, start };
}
export function convertTypedListPrefix(editor: ReactiveEditor, key: NodeKey, caret: number): boolean {
  const source = editor.node(key);
  if (source?.viewType !== 'standoff-editor-block' || source.inlineContent.length !== caret || taskState(source) !== undefined) return false;
  const rule = listPrefix(editor, source, caret);
  if (!rule || editor.crossText.range() || (editor.selections.sets[key]?.items.length ?? 0) > 1) return false;
  const projection = editor.projections.get(source.viewId)!;
  const parent = projection.parentOf(key);
  if (!parent?.children.includes(key)) return false;
  let outsideCell = false;
  for (let ancestor: BlockNode | undefined = source; ancestor; ancestor = projection.parentOf(ancestor.key)) {
    const meta = ancestor.payload.metadata as any;
    if (meta?.htmlPreformatted || meta?.markdownCode) return false;
    if (!outsideCell && (isList(ancestor) || isItemContainer(ancestor))) return false;
    // A cell owns an independent Block flow. Lists containing the table do
    // not make its paragraphs list items; literal/code ancestry still applies.
    if (ancestor.viewType === 'table-cell-block' || ancestor.viewType === 'grid-cell-block') outsideCell = true;
    if (ancestor.viewType === 'document-block') break;
  }
  const properties = source.payload.standoffProperties as Record<string, any>[] | undefined;
  if (properties?.some(p => !p.isDeleted && (/(?:^|[/:-])(?:code|literal)(?:$|[/:-])/.test(p.type ?? '') || p.type === 'text/superposition') && p.start <= caret && p.end >= 0)) return false;
  const prefixCharacter = caret === 1 ? editor.node(source.inlineContent[0])?.payload.text : undefined;
  const placement = source.placementKey, viewId = source.viewId, contentKey = source.contentKey;
  // Accept the user's space as ordinary native input. The following conversion
  // is its own atomic history entry: Undo restores the complete literal marker.
  editor.commands.replaceInlineRange(key, caret, caret, ' ');
  editor.selections.mapContentEdit(contentKey, caret, caret, 1);
  wrapTextBlockInList(editor, key, caret + 1, rule);
  if (editor.features.taskLists && caret === 1 && !rule.ordered && source.payload.checked === undefined && editor.repository.canUndo()) {
    const literal = editor.repository.readState();
    // Only the hyphen rule participates; asterisk task prefixes remain deferred.
    if (prefixCharacter === "-") taskCandidates.set(editor, { placement, viewId, revision: literal.revision, text: "" });
  }
  editor.selections.mapContentEdit(contentKey, 0, caret + 1, 0);
  const target = editor.nodeForPlacementInView(placement, viewId);
  if (target) editor.selections.setPrimary(target.key, contentKey, viewId, 0);
  queueMicrotask(() => {
    const target = editor.nodeForPlacementInView(placement, viewId);
    if (target) editor.focus.request(target.key, { reason: 'list-prefix', caret: 'start' });
  });
  return true;
}

/** Empty direct items exit one level; compound ContainerBlock editing is unchanged. */
export function exitEmptyListItem(editor: ReactiveEditor, key: NodeKey): boolean {
  const source = editor.node(key);
  if (source?.viewType !== 'standoff-editor-block' || source.inlineContent.length || source.children.length) return false;
  const projection = editor.projections.get(source.viewId)!;
  if (!isList(projection.parentOf(key))) return false;
  if (editor.features.taskLists && taskState(source) !== undefined) {
    editor.commands.transaction('Exit empty task', () => { setTaskState(editor, key, undefined); changeTextList(editor, key, true); });
    return true;
  }
  return changeTextList(editor, key, true);
}

/** Move existing placements, preserving text, annotations and owned relations.
 * Called only by an explicit list command; ancestor lookup uses occurrence routes. */
export function changeTextList(editor: ReactiveEditor, key: NodeKey, outdent: boolean): boolean {
  const source = editor.node(key);
  if (source?.viewType !== 'standoff-editor-block') return false;
  const projection = editor.projections.get(source.viewId)!;
  const parentOf = (node: BlockNode) => projection.parentOf(node.key);
  const parent = parentOf(source);
  if (!parent?.children.includes(key)) return false;
  const item = (editor.features.taskLists ? taskOwner(editor, key) : undefined) ?? (isItemContainer(parent) && isList(parentOf(parent)) ? parent : source);
  const list = parentOf(item);
  const inside = isList(list);
  if ((inside && hasBlockMode(list!.payload)) || (item !== source && hasBlockMode(item.payload))) {
    editor.crossText.notice('This list operation could remove or duplicate a Block Mode; move the Block explicitly instead.');
    return true;
  }
  if (outdent && !inside) return false;
  const selection = editor.mounts.get(key)?.captureInlineSelection?.();
  const sourcePlacement = source.placementKey, viewId = source.viewId;
  const commands = editor.commands;
  const append = (target: string, moving: string) => commands.move(moving, { kind: 'at', parentKey: target, index: commands.childrenOf(target).length });
  const nestedList = (owner: BlockNode, template: BlockNode) => {
    const last = editor.node(owner.children.at(-1)!);
    return isList(last) ? last!.placementKey : commands.insert(listDto(template), { kind: 'at', parentKey: owner.placementKey, index: commands.childrenOf(owner.placementKey).length });
  };
  if (!inside) {
    if (item.key === source.key) wrapTextBlockInList(editor, key);
    else commands.transaction('Wrap task in list', () => {
      const wrapper = commands.insert(listDto(), { kind: 'before', anchorKey: item.placementKey });
      commands.move(item.placementKey, { kind: 'at', parentKey: wrapper, index: 0 });
    });
  } else if (!outdent) {
    const index = list!.children.indexOf(item.key), previous = editor.node(list!.children[index - 1]);
    // The first item has no preceding item to become its parent.
    if (!previous) return true;
    if (!isList(previous) && previous.viewType !== 'standoff-editor-block' && !isItemContainer(previous)) return true;
    commands.transaction('Indent list item', () => {
      // Older lists may store a nested list beside its preceding TextBlock.
      const nested = isList(previous) ? previous.placementKey : nestedList(previous, list!);
      const owner = isList(previous) ? listItemOwner(projection, previous.key) : previous;
      if (owner && (owner.payload.metadata as any)?.listCollapsed) setListItemCollapsed(editor, owner.key, false);
      append(nested, item.placementKey);
    });
  } else {
    const owner = parentOf(list!);
    if (!owner?.children.includes(list!.key)) return true;
    const outer = parentOf(owner);
    const nested = isList(owner) || isList(outer) && (owner.viewType === 'standoff-editor-block' || isItemContainer(owner));
    const index = list!.children.indexOf(item.key);
    const following = list!.children.slice(index + 1).map(k => editor.node(k)!.placementKey);
    commands.transaction('Outdent list item', () => {
      if (nested) {
        commands.move(item.placementKey, { kind: 'after', anchorKey: isList(owner) ? list!.placementKey : owner.placementKey });
        // Keep reading order: following siblings become children of the lifted item.
        if (following.length) {
          const tail = nestedList(item, list!);
          following.forEach(k => append(tail, k));
        }
      } else {
        commands.move(item.placementKey, { kind: 'after', anchorKey: list!.placementKey });
        if (following.length) {
          const tail = commands.insert(listDto(list!), { kind: 'after', anchorKey: item.placementKey });
          following.forEach(k => append(tail, k));
        }
        if (isItemContainer(item) && taskState(item) === undefined && !Object.keys(item.ownedRelations).length) commands.unwrap(item.placementKey);
      }
      if (!commands.childrenOf(list!.placementKey).length && !Object.keys(list!.ownedRelations).length) commands.remove(list!.placementKey);
    });
  }
  queueMicrotask(() => {
    const target = editor.nodeForPlacementInView(sourcePlacement, viewId);
    if (!target) return;
    editor.focus.request(target.key, { reason: 'text-list', caret: 'start' });
    if (selection) editor.mounts.get(target.key)?.restoreInlineSelection?.(selection);
  });
  return true;
}


// A bounded, occurrence-specific continuation. A revision change, navigation or
// unrelated input invalidates it. No draft, repository scan or live transaction.
const taskCandidates = new WeakMap<ReactiveEditor, { placement: string; viewId: string; revision: number; text: string }>();
export function cancelTaskPrefix(editor: ReactiveEditor) { taskCandidates.delete(editor); }
/** Arbitration with Scry's provisional first bracket. An active Scry session
 * always owns its input; this only describes an untouched task candidate. */
export function taskPrefixOpening(editor: ReactiveEditor, key: string, start: number, end: number): 'fresh' | 'restored' | undefined {
  const candidate = taskCandidates.get(editor), node = editor.node(key);
  if (!candidate || !node || start !== end || start !== candidate.text.length || node.inlineContent.length !== start ||
      candidate.revision !== editor.repository.state.revision || node.placementKey !== candidate.placement || node.viewId !== candidate.viewId ||
      editor.crossText.range() || (editor.selections.sets[key]?.items.length ?? 0) > 1) return;
  if (candidate.text === '') return 'fresh';
  if (candidate.text === '- [') return 'restored';
}
export function checkTaskPrefixSelection(editor: ReactiveEditor, key?: string, caret?: number) {
  const candidate = taskCandidates.get(editor);
  if (!candidate) return;
  const node = key && editor.node(key);
  if (!node || node.placementKey !== candidate.placement || node.viewId !== candidate.viewId || caret !== candidate.text.length) cancelTaskPrefix(editor);
}
export function continueTaskPrefix(editor: ReactiveEditor, key: string, start: number, end: number, text: string): boolean {
  const candidate = taskCandidates.get(editor);
  if (!candidate) return convertExistingTaskPrefix(editor, key, start, end, text);
  taskCandidates.delete(editor);
  const source = editor.node(key);
  if (!editor.features.taskLists || !source || source.placementKey !== candidate.placement || source.viewId !== candidate.viewId ||
      editor.repository.state.revision !== candidate.revision || start !== end || start !== candidate.text.length ||
      source.inlineContent.length !== start || editor.crossText.range() || (editor.selections.sets[key]?.items.length ?? 0) > 1) return false;
  let next = candidate.text + text;
  if (!candidate.text) {
    if (text !== '[' || !editor.repository.canUndo()) return false;
    // Revert only the immediately preceding, known automatic conversion. Its
    // exact native inverse restores prefix Cells and annotations. Subsequent
    // typing creates an ordinary history branch; durable commits are not rewritten.
    editor.repository.undo();
    next = '- [';
  } else if (!['- [ ', '- [x', '- [X', '- [ ]', '- [x]', '- [X]', '- [ ] ', '- [x] ', '- [X] '].includes(next) || text.length !== 1) return false;
  const target = editor.nodeForPlacementInView(candidate.placement, candidate.viewId)!;
  const at = target.inlineContent.length;
  editor.commands.replaceInlineRange(target.key, at, at, text);
  editor.selections.mapContentEdit(target.contentKey, at, at, text.length);
  let caret = next.length;
  if (/^- \[[ xX]\] $/.test(next)) {
    editor.commands.wrapTextBlockInList(target.key, next.length, { ordered: false }, next[3] !== ' ');
    editor.selections.mapContentEdit(target.contentKey, 0, next.length, 0);
    caret = 0;
  } else taskCandidates.set(editor, { ...candidate, text: next, revision: editor.repository.state.revision });
  const current = editor.nodeForPlacementInView(candidate.placement, candidate.viewId)!;
  editor.selections.setPrimary(current.key, current.contentKey, current.viewId, caret);
  queueMicrotask(() => {
    const node = editor.nodeForPlacementInView(candidate.placement, candidate.viewId);
    if (!node) return;
    editor.focus.request(node.key, { reason: 'task-prefix', caret: { start: caret, end: caret, direction: 'none' } });
    editor.mounts.get(node.key)?.restoreInlineSelection?.({anchor:caret,head:caret});
  });
  return true;
}

/** Existing items keep their list and placement. Only the authored prefix and
 * the item's task state change, in one locally assembled canonical entry. */
function convertExistingTaskPrefix(editor: ReactiveEditor, key: string, start: number, end: number, text: string): boolean {
  if (!editor.features.taskLists || text !== ' ' || start !== end || (start !== 3 && start !== 5)) return false;
  const source = editor.node(key);
  if (source?.viewType !== 'standoff-editor-block' || editor.crossText.range() ||
      (editor.selections.sets[key]?.items.length ?? 0) > 1) return false;
  let prefix = '';
  for (let i = 0; i < start; i++) {
    const cell = editor.node(source.inlineContent[i]);
    if (cell?.viewType !== 'text-cell') return false;
    prefix += cell.payload.text;
  }
  const match = /^(?:- )?\[([ xX])\]$/.exec(prefix);
  if (!match) return false;
  const projection = editor.projections.get(source.viewId)!;
  const parent = projection.parentOf(key);
  const item = isList(parent) ? source : parent?.viewType === 'container-block' &&
    (parent.payload.metadata as any)?.htmlListItem && parent.children[0] === key &&
    isList(projection.parentOf(parent.key)) ? parent : undefined;
  if (!item || taskState(item) !== undefined || taskState(source) !== undefined) return false;
  for (let ancestor: BlockNode | undefined = source; ancestor; ancestor = projection.parentOf(ancestor.key)) {
    const meta = ancestor.payload.metadata as any;
    if (meta?.htmlPreformatted || meta?.markdownCode) return false;
    if (ancestor.viewType === 'document-block') break;
  }
  const properties = source.payload.standoffProperties as Record<string, any>[] | undefined;
  if (properties?.some(p => !p.isDeleted && (/(?:^|[/:-])(?:code|literal)(?:$|[/:-])/.test(p.type ?? '') || p.type === 'text/superposition') && p.start <= start && p.end >= 0)) return false;
  editor.commands.replaceInlineRange(key, start, start, ' ');
  editor.selections.mapContentEdit(source.contentKey, start, start, 1);
  editor.commands.structuralTransaction('Convert list item to task', () => {
    editor.commands.replaceInlineRange(key, 0, start + 1, '');
    editor.commands.setPayloadField(item.key, 'checked', match[1] !== ' ');
  });
  editor.selections.mapContentEdit(source.contentKey, 0, start + 1, 0);
  editor.selections.setPrimary(key, source.contentKey, source.viewId, 0);
  queueMicrotask(() => {
    const target = editor.nodeForPlacementInView(source.placementKey, source.viewId);
    if (target) editor.focus.request(target.key, { reason: 'task-prefix', caret: 'start' });
  });
  return true;
}
