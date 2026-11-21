import type { ReactiveEditor } from '../../reactive-editor/editor';
import type { BlockTreeProjection } from '../../block-tree/projection';
import { GlossSessionIndex, type GlossOccurrence } from '../gloss/session-index';
import { ancestorPath, type SearchMatch } from '../../runtime/text-search';
import { revealMatch } from '../../runtime/reveal-match';

export function milestoneIndex(editor: ReactiveEditor, projection: BlockTreeProjection, rootKey: string) {
  return new GlossSessionIndex(editor, projection, rootKey, {
    type: 'tei/milestone', accepts: d => d?.type === 'tei/milestone',
    describe: d => ({ raw: '', type: d.metadata?.sourceElement ?? d.metadata?.role ?? 'milestone',
      body: String(d.metadata?.fields?.n ?? d.metadata?.sourceId ?? ''), alias: '', source: d.metadata }),
    order: d => Number(d?.metadata?.order ?? 0),
  });
}

/** Resolve offsets twice: after revealing hidden native tabs a pending edit may
 * have rebased the segment. Never retain a stale range in a navigation row. */
export async function navigateAnnotation(index: GlossSessionIndex, anchor: GlossOccurrence, current = () => true) {
  const { editor } = index, range = index.range(anchor);
  if (!range || !current()) return false;
  const path = ancestorPath(editor, anchor.nodeKey).map(n => n.key);
  if (!await revealMatch(editor, { path, ranges: [{ nodeKey: anchor.nodeKey, start: range.start, coordinate: 'cell' }] } as SearchMatch, current)) return false;
  const live = index.range(anchor), mount = editor.mounts.get(anchor.nodeKey);
  if (!live || !mount || !current()) return false;
  mount.focus();
  mount.restoreInlineSelection?.({ anchor: live.start, head: live.end });
  return true;
}
