import type { ReactiveEditor } from '../reactive-editor/editor';
import { linkedDefinitionOwner, resolveLinkedProperty } from '../block-tree/linked-annotations';
import { resolveSearchScope } from '../runtime/text-search';
import type { AnnotationCapabilities } from '../feature-api/annotations';
import type { ContentRecord, RepositoryState } from '../block-tree/types';

type Listener = Parameters<AnnotationCapabilities['watchDocumentEntities']>[1];

/** Canonical identity excludes occurrence IDs, text versions and shifted offsets.
 * Those affect highlighting, but must not invalidate Entity summary queries. */
function snapshot(editor: ReactiveEditor, root: string) {
  const state = editor.repository.readState(), dependencies = new Set<string>();
  const links: string[] = [];
  const visit = (key: string) => {
    const content = state.contents[key];
    if (!content || dependencies.has(key) || (key !== root && content.viewType === 'document-block')) return;
    dependencies.add(key);
    if (content.viewType === 'standoff-editor-block' || ['mutable/citation-block','mutable/web-article-block'].includes(content.viewType)) {
      const properties = ['mutable/citation-block','mutable/web-article-block'].includes(content.viewType)?content.payload.blockProperties:content.payload.standoffProperties;
      if (Array.isArray(properties)) properties.forEach((property, index) => {
        if (!property || typeof property !== 'object' || Array.isArray(property) || property.type === 'mutable/gloss' || property.type === 'dialectic/range-anchor') return;
        // A definition can live on the Document or, for cross-resource links,
        // the Workspace. Watch that owner as well as the local segment.
        if (property.annotationId) {
          try {
            const owner = linkedDefinitionOwner(state, property, key);
            definitionOwners.add(owner?.key ?? state.placements[state.rootPlacementKey].contentKey);
          } catch { /* Unresolved definitions are not guessed. */ }
        }
        const resolved = resolveLinkedProperty(state, property, key);
        if (resolved.isDeleted || resolved.type !== 'codex/entity-reference' || typeof resolved.value !== 'string' || !resolved.value.trim()) return;
        links.push(JSON.stringify([key, property.id ?? index, resolved.annotationId, resolved.value, resolved.metadata, resolved.attributes]));
      });
    }
    for (const placement of [...content.children, ...Object.values(content.ownedRelations)]) {
      const child = state.placements[placement];
      if (child) visit(child.contentKey);
    }
  };
  const definitionOwners = new Set<string>();
  visit(root);
  definitionOwners.forEach(key => dependencies.add(key));
  return {dependencies, signature:JSON.stringify(links.sort()), removed:!state.contents[root]};
}

/** Inspect only changed owners, never the Document, on ordinary input. Offset
 * rebasing is not a backlink change. Removing a reference during text deletion
 * still changes this identity, as do retargeting and deletion flags. */
function localReferences(content: ContentRecord, includeOffsets: boolean, state?: RepositoryState) {
  const properties = ['mutable/citation-block','mutable/web-article-block'].includes(content.viewType)?content.payload.blockProperties:content.payload.standoffProperties;
  if (!Array.isArray(properties)) return '[]';
  return JSON.stringify(properties.filter(property => property && typeof property === 'object'
    && !Array.isArray(property) && property.type !== 'mutable/gloss' && property.type !== 'dialectic/range-anchor' && (property.type === 'codex/entity-reference' || property.annotationId))
    .filter(property => !state || resolveLinkedProperty(state, property, content.key).type === 'codex/entity-reference')
    .map(({ start, end, ...property }) => includeOffsets ? { ...property, start, end } : property));
}

function source(editor: ReactiveEditor, key: string, release: () => void) {
  let current = snapshot(editor, key), queued = false, disposed = false, rangesChanged = false;
  const listeners = new Set<Listener>();
  const stop = editor.repository.subscribeChanges(change => {
    // Gloss admission proves that entity annotations and ownership are unchanged.
    if (change.taskStateOwner || change.structural?.gloss) return;
    let relevant = false;
    const state = editor.repository.readState();
    if (change.emptyParagraph && current.dependencies.has(change.emptyParagraph.parent)) {
      const { child, attached } = change.emptyParagraph;
      const content = state.contents[child] ?? change.previousContents.get(child);
      // No references or definition registry: only dependency membership changed.
      // Keep the watch current so adding an annotation after undo is still seen.
      if (content && localReferences(content, true) === '[]' && !content.payload.linkedAnnotations) {
        if (attached) current.dependencies.add(child);
        else current.dependencies.delete(child);
        return;
      }
    }
    const wrap = change.listWrap;
    if (wrap && current.dependencies.has(wrap.parent)) {
      if (wrap.wrapped) current.dependencies.add(wrap.wrapperContent);
      else current.dependencies.delete(wrap.wrapperContent);
    }
    for (const [key, before] of change.previousContents) {
      // Wrapping preserves all existing reference consumers; the prefix's own
      // annotation changes still pass through the comparison below.
      if (wrap && (key === wrap.parent || key === wrap.wrapperContent)) continue;
      if (!current.dependencies.has(key)) continue;
      const after = state.contents[key];
      if (!before || !after || before.viewType !== after.viewType
        || JSON.stringify([before.children, before.ownedRelations]) !== JSON.stringify([after.children, after.ownedRelations])) {
        relevant = rangesChanged = true;
        continue;
      }
      if (JSON.stringify(before.payload.linkedAnnotations) !== JSON.stringify(after.payload.linkedAnnotations)) relevant = true;
      // Undo/redo also changes inlineRevision. It must obey the same rule as
      // typing; explicit annotation boundary edits leave that revision alone.
      const explicitRangeEdit = before.inlineRevision === after.inlineRevision;
      if (localReferences(before, explicitRangeEdit) !== localReferences(after, explicitRangeEdit)
        && localReferences(before, explicitRangeEdit, state) !== localReferences(after, explicitRangeEdit, state)) {
        relevant = true;
        if (explicitRangeEdit) rangesChanged = true;
      }
    }
    if (!relevant || queued) return;
    queued = true;
    // Wait for every projection to receive the repository publication.
    queueMicrotask(() => {
      queued = false;
      if (disposed) return;
      const next = snapshot(editor, key), changed = rangesChanged || next.signature !== current.signature || next.removed !== current.removed;
      rangesChanged = false;
      current = next;
      if (changed) for (const listener of listeners) listener({signature:current.signature, removed:current.removed});
    });
  });
  return {
    get signature() { return current.signature; },
    subscribe(listener: Listener) {
      let active = true;
      const relay: Listener = change => listener(change);
      listeners.add(relay);
      return () => {
        if (!active) return;
        active = false;
        listeners.delete(relay);
        if (!listeners.size) { disposed = true; stop(); release(); }
      };
    },
  };
}

// All listings of a source share one document event subscription. Nothing is
// polled, persisted, or subscribed once the last listing closes.
const sources = new WeakMap<ReactiveEditor, Map<string, ReturnType<typeof source>>>();
export function watchDocumentEntities(editor: ReactiveEditor, origin: string, listener: Listener, standaloneRoot?: string) {
  const rootKey = standaloneRoot ?? resolveSearchScope(editor, origin, 'document').rootKey;
  const key = editor.node(rootKey)!.contentKey;
  let documents = sources.get(editor);
  if (!documents) sources.set(editor, documents = new Map());
  let entry = documents.get(key);
  if (!entry) documents.set(key, entry = source(editor, key, () => documents!.delete(key)));
  const dispose = entry.subscribe(listener);
  return {key, get signature() { return entry!.signature; }, dispose};
}
