/** Investigation only. No production entry point imports this module. */
import { captureBlocks, cloneBlocks } from '../../block-tree/clipboard';
import { inlineText, logicalInline } from '../../block-tree/inline-sequence';
import type { ContentRecord, ExistingBlockDto } from '../../block-tree/types';
import type { ReactiveEditor } from '../../reactive-editor/editor';

export const QUILL_TYPE = 'mutable/svg-text-composition-block';
export const qualificationFlags = { quill: true };
export interface Wave { id: string; width: number; amplitude: number; baseline: number; cycles: number }
export interface Composition { version: 1; paths: Wave[]; fontSize: number; swell: number; opacity: number; sourceRole: string }
export interface Invocation {
  sourceApp: string; documentId: string; sourcePlacement: string; sourceBlockId: string;
  occurrenceKey: string; inlineRevision: number; selection?: { anchor: number; head: number };
}
export const composition = (): Composition => ({ version: 1, fontSize: 25, swell: .8, opacity: 1,
  sourceRole: 'primary', paths: [0, 1, 2].map(i => ({ id: `wave-${i}`, width: 710, amplitude: 24, baseline: 90 + i * 115, cycles: 1 })) });
export function record(editor: ReactiveEditor, placement: string): ContentRecord {
  const state = editor.repository.readState();
  const edge = state.placements[placement];
  if (!edge || edge.externalReference) throw Error('Source is no longer available');
  return state.contents[edge.contentKey];
}
export function textOf(editor: ReactiveEditor, placement: string) {
  return inlineText(logicalInline(editor.repository.readState(), record(editor, placement)));
}
export function invoke(editor: ReactiveEditor, occurrenceKey: string, sourceApp: string, documentId: string): Invocation {
  if (!qualificationFlags.quill) throw Error('Quill qualification is disabled');
  const node = editor.node(occurrenceKey);
  if (node?.viewType !== 'standoff-editor-block') throw Error('Select one native TextBlock');
  const source = record(editor, node.placementKey);
  return { sourceApp, documentId, sourcePlacement: node.placementKey, sourceBlockId: String(source.payload.id),
    occurrenceKey, inlineRevision: source.inlineRevision, selection: editor.mounts.get(occurrenceKey)?.captureInlineSelection?.() };
}
export function convert(editor: ReactiveEditor, invocation: Invocation): string {
  const source = record(editor, invocation.sourcePlacement);
  if (source.payload.id !== invocation.sourceBlockId || source.inlineRevision !== invocation.inlineRevision) throw Error('Source changed; invoke again');
  const edge = editor.repository.readState().placements[invocation.sourcePlacement];
  if (edge.kind !== 'owned' || edge.resolvedReference || editor.repository.contentReferenceCount(source.key) !== 1) throw Error('Shared source needs an explicit ownership policy');
  // Whole paragraphs only in this experiment. Partial-range conversion needs split/anchor qualification.
  let wrapper = '';
  editor.commands.structuralTransaction('Quill qualification: convert paragraph', () => {
    wrapper = editor.commands.insert({ type: QUILL_TYPE, quill: composition(),
      blockProperties: [{ id: crypto.randomUUID(), type: 'codex/block-reference', value: invocation.sourceBlockId, metadata: { quillRole: 'primary' } }], children: [] },
    { kind: 'before', anchorKey: invocation.sourcePlacement });
    editor.commands.move(invocation.sourcePlacement, { kind: 'at', parentKey: wrapper, index: 0 });
  });
  return wrapper;
}
export function sourceOf(editor: ReactiveEditor, wrapper: string): string {
  const c = record(editor, wrapper), config = c.payload.quill as Composition;
  // Property IDs also change on copy. A local semantic role is deliberately not an identity.
  const property = (c.payload.blockProperties as { value: string; metadata?: { quillRole?: string } }[]).find(p => p.metadata?.quillRole === config.sourceRole);
  const source = c.children.find(pk => record(editor, pk).payload.id === property?.value);
  if (!source) throw Error('Missing owned native text source');
  return source;
}
export function copyInto(editor: ReactiveEditor, wrapper: string, destination: string) {
  return editor.commands.insertFragment(cloneBlocks(captureBlocks(editor.repository.readState(), [wrapper])),
    { kind: 'at', parentKey: destination, index: editor.commands.childrenOf(destination).length })[0];
}
export function fixture(extra = 0): ExistingBlockDto {
  return { id: 'quill-document', type: 'document-block', metadata: { title: 'Quill qualification' },
    linkedAnnotations: { 'raven-gloss-definition': { type: 'mutable/gloss', value: 'note: A visitor at dusk', metadata: { gloss: { version: 1, localId: 'quill-gloss-local', links: {} } } } }, children: [
    { id: 'quill-source', type: 'standoff-editor-block', text: 'The raven crosses the quiet garden, carrying stories through the evening air. Each word follows the turning wave, and every annotation keeps its place as the sentence grows.',
      standoffProperties: [
        { id: 'entity-raven', type: 'codex/entity-reference', start: 4, end: 8, value: 'raven-entity' },
        { id: 'gloss-raven', type: 'mutable/gloss', start: 4, end: 16, annotationId: 'raven-gloss-definition' },
        { id: 'overlap', type: 'style/italics', start: 0, end: 20 },
      ] },
    { id: 'native-note', type: 'standoff-editor-block', text: 'An ordinary native paragraph remains beside the composition.' },
    ...Array.from({ length: extra }, (_, i) => ({ id: `unrelated-${i}`, type: 'standoff-editor-block', text: 'Unrelated text.' })),
  ] };
}
