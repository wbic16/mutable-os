import {taskChecked} from '../block-tree/layout-authoring';
import type { BlockNode, NodeKey } from '../block-tree/types';
import { hasBlockMode } from '../block-tree/mode-editing';
import type { ReactiveEditor } from '../reactive-editor/editor';
import { changeTextList, exitEmptyListItem } from './text-lists';

/** Persistent semantics shared by commands, editing and presentation. */
export function taskState(node?: Pick<BlockNode, 'viewType' | 'payload'>): boolean | undefined {
  if (!node) return;
  if (node.viewType === 'checkbox-block') return node.payload.checked === true;
  if (['standoff-editor-block', 'container-block'].includes(node.viewType) && typeof node.payload.checked === 'boolean') return node.payload.checked;
}

export function taskOwner(editor: ReactiveEditor, key: NodeKey): BlockNode | undefined {
  let node = editor.node(key);
  const projection = node && editor.projections.get(node.viewId);
  while (node) {
    if (taskState(node) !== undefined) return node;
    const parent = projection?.parentOf(node.key);
    // Never inherit completion from a parent item across a nested list.
    if (!parent || !parent.children.includes(node.key) || parent.viewType === 'indented-list-block' || parent.viewType === 'document-block') return;
    node = parent;
  }
}

export function setTaskState(editor: ReactiveEditor, key: NodeKey, checked: boolean | undefined): void {
  const node = taskOwner(editor, key) ?? editor.node(key);
  if (!node || !['standoff-editor-block', 'container-block', 'checkbox-block'].includes(node.viewType)||!editor.canEditText(node.key)) return;
  if(checked!==undefined)taskChecked(checked);
  editor.commands.setPayloadField(node.key, 'checked', checked, checked === undefined ? 'Remove task state' : 'Toggle task completion');
}

export function toggleTask(editor: ReactiveEditor, key: NodeKey): boolean {
  const owner = taskOwner(editor, key);
  if (!owner || !editor.canEditText(owner.key)) return false;
  setTaskState(editor, owner.key, !taskState(owner));
  return true;
}

/** Compound paragraphs split normally. Only a collapsed caret at the end of
 * their final direct paragraph continues the task; selected text never does. */
export function enterTask(editor: ReactiveEditor, key: NodeKey, start: number, end: number): boolean {
  if (!editor.features.taskLists) return false;
  const source = editor.node(key), owner = taskOwner(editor, key);
  if (!source || !owner || source.viewType !== 'standoff-editor-block') return false;
  // Task continuation can consume a compound owner or manufacture an unrelated
  // paragraph. Let the ordinary mode-preserving Enter path handle these Blocks.
  if (hasBlockMode(source.payload) || hasBlockMode(owner.payload)) return false;
  const projection = editor.projections.get(source.viewId)!;
  const direct = owner.key === source.key;
  if (!direct && owner.children.length === 1 && !Object.keys(owner.ownedRelations).length &&
      !source.inlineContent.length && !source.children.length && start === 0 && end === 0) {
    editor.commands.transaction('Exit empty task', () => {
      if (projection.parentOf(owner.key)?.viewType === 'indented-list-block') changeTextList(editor, key, true);
      editor.commands.unwrap(owner.placementKey);
    });
    queueMicrotask(() => {
      const target = editor.nodeForPlacementInView(source.placementKey, source.viewId);
      if (target) editor.focus.request(target.key, { reason: 'exit-task', caret: 'start' });
    });
    return true;
  }
  if (direct && !source.inlineContent.length && !source.children.length && start === 0 && end === 0) {
    if (exitEmptyListItem(editor, key)) return true;
    setTaskState(editor, key, undefined);
    return true;
  }
  if (!direct) {
    if (start !== end || end !== source.inlineContent.length || projection.parentOf(key)?.key !== owner.key ||
        owner.children.filter(k => editor.node(k)?.viewType !== 'indented-list-block').at(-1) !== key) return false;
  }
  let placement: string | undefined;
  const insert = () => {
    if (!direct) {
      const text = { id: crypto.randomUUID(), type: 'standoff-editor-block', text: '' };
      placement = editor.commands.insert(owner.viewType === 'checkbox-block'
        ? { id: crypto.randomUUID(), type: 'checkbox-block', checked: false, children: [text] }
        : { ...text, checked: false }, { kind: 'after', anchorKey: owner.placementKey });
    } else {
      if (start !== end) editor.commands.replaceInlineRange(key, start, end, '');
      const length = source.inlineContent.length - (end - start);
      if (start === 0) placement = editor.commands.insertEmptyStandoffSibling(key, 'before', false);
      else if (start === length) placement = editor.commands.insertEmptyStandoffSibling(key, 'after', false);
      else placement = editor.commands.splitStandoff(key, start, false);
    }
  };
  if (direct && start === end) insert();
  else editor.commands.transaction('Continue task', insert);
  if (placement) queueMicrotask(() => {
    let target = editor.nodeForPlacementInView(placement!, source.viewId);
    if (target?.viewType === 'checkbox-block') target = editor.node(target.children[0]);
    if (target) editor.focus.request(target.key, { reason: 'continue-task', caret: 'start' });
  });
  return true;
}
