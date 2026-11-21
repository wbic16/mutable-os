import type { ReactiveEditor } from '../reactive-editor/editor';
import type { BlockNode } from '../block-tree/types';
import { listItemOwner } from './text-lists';

/** Existing native face/tab policy shared by rendering and semantic navigation.
 * An empty override denotes an explicitly dismissed sticky tab. */
export function activeViewChild(editor: ReactiveEditor, node: BlockNode): string | undefined {
  const override = editor.viewChildren[node.key];
  if (override === '' && node.viewType === 'sticky-tab-row-block') return;
  if (override && node.children.includes(override)) return override;
  if (node.viewType === 'surface-block' && editor.features.reversibleBlocks) return node.children[0];
  const marked = node.children.find(key => (editor.node(key)?.payload.metadata as any)?.active);
  return marked ?? (node.viewType === 'sticky-tab-row-block' ? undefined : node.children[0]);
}

/** Mounting is deliberately absent: an occurrence can be eligible offscreen. */
export function presentationEligible(editor: ReactiveEditor, key: string): boolean {
  let node = editor.node(key);
  if (!node || editor.concertina.presentation(key).hidden) return false;
  const projection = editor.projections.get(node.viewId);
  while (node) {
    if (editor.viewVisibility.isClosed(node.placementKey)) return false;
    if (node.viewType === 'indented-list-block' && (listItemOwner(projection!, node.key)?.payload.metadata as any)?.listCollapsed) return false;
    const parent: BlockNode | undefined = projection?.parentOf(node.key);
    if (parent && ['tab-row-block', 'document-tab-row-block', 'sticky-tab-row-block', 'surface-block'].includes(parent.viewType)
      && activeViewChild(editor, parent) !== node.key) return false;
    node = parent;
  }
  return true;
}
