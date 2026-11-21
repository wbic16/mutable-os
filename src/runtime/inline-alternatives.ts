import type { ReactiveEditor } from '../reactive-editor/editor';
import type { BlockNode } from '../block-tree/types';
import type { InlineAlternativeProperties } from '../block-tree/inline-alternative';
import { contentLength } from '../block-tree/inline-sequence';

export const readingChoiceKey = (hostKey: string, id: string) => `${hostKey}/inline-alternative/${id}`;
export function selectedReading(editor: ReactiveEditor, host: BlockNode, slot: InlineAlternativeProperties) {
  const selected = editor.viewChildren[readingChoiceKey(host.key, slot.id)];
  return slot.readings.find(name => host.ownedRelations[name] === selected) ?? slot.readings[0];
}
/** Shared by the selector and navigation into inactive readings. */
export function showInlineReading(editor: ReactiveEditor, host: BlockNode, slot: InlineAlternativeProperties, target: string) {
  if (!slot.readings.some(name => host.ownedRelations[name] === target)) return;
  const previous = host.ownedRelations[selectedReading(editor, host, slot)], mount = editor.mounts.get(previous);
  if (previous !== target && mount?.composing) {
    mount.compactComposition?.('end', ''); mount.composing = false; editor.caretModes.setComposing(false);
  }
  const range = mount?.captureInlineSelection?.(); if (range) editor.mounts.rememberInlineSelection(previous, range);
  editor.setViewChild(readingChoiceKey(host.key, slot.id), target);
}
export function revealInlineReading(editor: ReactiveEditor, host: BlockNode, readingKey: string) {
  const c = editor.repository.readState().contents[host.contentKey];
  const slot = c?.compactInline?.spans.find(a => a.kind === 'alternative' && a.properties.readings.some(name => host.ownedRelations[name] === readingKey));
  if (slot?.kind !== 'alternative') return false;
  showInlineReading(editor, host, slot.properties, readingKey); return true;
}
export function focusInlineReading(editor: ReactiveEditor, key: string, at: number) {
  const node = editor.node(key); if (!node) return;
  const index = Math.max(0, Math.min(at, contentLength(editor.repository.readState().contents[node.contentKey])));
  editor.focus.request(key, { caret: { start: index, end: index, direction: 'none' }, reason: 'inline-alternative' });
  editor.selections.setPrimary(key, node.contentKey, node.viewId, index, index);
}

/** Only boundary keys enter here. Ordinary text/IME stays on the existing
 * mounted TextBlock gateway, with no document/slot inventory work. */
export function inlineAlternativeKey(editor: ReactiveEditor, event: KeyboardEvent): boolean {
  if (event.target instanceof Element && event.target.closest('input, textarea, select, button, [data-native-context-menu]')) return false;
  if (!['ArrowLeft', 'ArrowRight', 'Backspace', 'Delete'].includes(event.key) || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false;
  const resolved = editor.mounts.resolveEvent(event), node = resolved && editor.node(resolved.nodeKey);
  if (!node || resolved?.handle.inputPolicy !== 'standoff' || resolved.handle.composing) return false;
  const selection = resolved.handle.captureInlineSelection?.(); if (!selection || selection.anchor !== selection.head) return false;
  const backward = event.key === 'ArrowLeft' || event.key === 'Backspace', arrow = event.key.startsWith('Arrow');
  const index = selection.head, target = node.inlineContent[index + (backward ? -1 : 0)], cell = target ? editor.node(target) : undefined;
  if (arrow && !event.shiftKey && cell?.viewType === 'inline-alternative-cell') {
    const slot = cell.payload as InlineAlternativeProperties, key = node.ownedRelations[selectedReading(editor, node, slot)];
    const c = editor.node(key); if (!c) return false;
    focusInlineReading(editor, key, backward ? contentLength(editor.repository.readState().contents[c.contentKey]) : 0);
  } else {
    const length = contentLength(editor.repository.readState().contents[node.contentKey]);
    if (index !== (backward ? 0 : length)) return false;
    const host = editor.projections.get(node.viewId)?.parentOf(node.key); if (!host) return false;
    const state = editor.repository.readState().contents[host.contentKey]; let at = 0, found = false;
    for (const atom of state.compactInline?.spans ?? []) {
      if (atom.kind === 'alternative' && atom.properties.readings.some(name => host.ownedRelations[name] === node.key)) { found = true; break; }
      at += atom.kind === 'text' ? [...atom.text].length : 1;
    }
    if (!found) return false;
    focusInlineReading(editor, host.key, at + (backward ? 0 : 1));
    if (event.shiftKey) {
      editor.mounts.get(host.key)?.restoreInlineSelection?.({ anchor: at, head: at + 1 });
      editor.selections.setPrimary(host.key, host.contentKey, host.viewId, at, at + 1);
    }
  }
  event.preventDefault(); event.stopImmediatePropagation(); return true;
}

/** A selection crossing reading coordinate spaces selects whole slots in the
 * nearest shared host. It never splices offsets from one reading into another. */
export function normalizeInlineSelection(editor: ReactiveEditor, anchor: import('../block-tree/types').ViewPosition, head: import('../block-tree/types').ViewPosition) {
  if (anchor.occurrenceKey === head.occurrenceKey) return;
  const chain = (position: typeof anchor) => {
    const result = [{ position, lo: position.boundary.index, hi: position.boundary.index }];
    let node = editor.node(position.occurrenceKey);
    while (node) {
      const host = editor.projections.get(node.viewId)?.parentOf(node.key); if (!host) break;
      const c = editor.repository.readState().contents[host.contentKey]; let at = 0, found = false;
      for (const atom of c.compactInline?.spans ?? []) {
        if (atom.kind === 'alternative' && atom.properties.readings.some(name => host.ownedRelations[name] === node!.key)) { found = true; break; }
        at += atom.kind === 'text' ? [...atom.text].length : 1;
      }
      if (!found) break;
      const parent = editor.crossText.position(host.key, at); if (!parent) break;
      result.push({ position: parent, lo: at, hi: at + 1 }); node = host;
    }
    return result;
  };
  const a = chain(anchor), h = chain(head); if (a.length === 1 && h.length === 1) return;
  for (const x of a) {
    const y = h.find(y => y.position.occurrenceKey === x.position.occurrenceKey); if (!y) continue;
    const forward = x.lo < y.lo || x.lo === y.lo && x.hi <= y.hi;
    return { anchor: editor.crossText.position(x.position.occurrenceKey, forward ? x.lo : x.hi)!, head: editor.crossText.position(y.position.occurrenceKey, forward ? y.hi : y.lo)! };
  }
}
