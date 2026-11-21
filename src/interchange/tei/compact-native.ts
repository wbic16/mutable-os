import { isReadingRelation } from '../../block-tree/inline-alternative';
import { INLINE_ALTERNATIVES_CAPABILITY } from '../capabilities';
import { inlineLength, type InlineAtom } from '../../block-tree/inline-sequence';
import type { ExistingBlockDto, JsonObject } from '../../block-tree/types';
import { createPlacementKey } from '../../block-tree/ids';
import { encodeAuthoredValue } from '../../history/preplan-spike/wire';
import type { GateDocument } from '../../history/stage-c-gates/portable';
import { parseNativeEnvelope, type NativeDocument } from '../../persistence/native-resource';

const implementations = new Set(['document-block', 'page-block', 'container-block', 'standoff-editor-block', 'tab-row-block', 'tab-block']);
/** Encode the TEI producer's already-validated, wholly owned tree using the
 * existing native text-atom grammar. No live Cells are needed in the worker.
 * This is deliberately NOT an arbitrary DTO/native converter. Native decoding,
 * ownership checks and repository validation still run before atomic admission. */
export function encodeTeiNative(document: ExistingBlockDto) {
  const blocks: GateDocument['blocks'] = [], ids = new Set<string>();
  let cells = 0, segments = 0;
  const visit = (dto: ExistingBlockDto): GateDocument['root'] => {
    const { id, type, children, relation, ...properties } = dto;
    if (typeof id !== 'string' || !id.trim() || ids.has(id) || !type || !implementations.has(type) ||
      (type === 'document-block' && dto !== document) || (relation !== undefined && (!relation || Object.keys(relation).some(name => !isReadingRelation(name))))) throw Error('TEI native producer: unsupported structure or identity');
    ids.add(id);
    const block: GateDocument['blocks'][number] = { id, type, properties: {} };
    if (type === 'standoff-editor-block') {
      if (Array.isArray(properties.inlineAtoms) && properties.text === undefined) {
        cells += inlineLength(properties.inlineAtoms as InlineAtom[]);
        block.inline = (properties.inlineAtoms as InlineAtom[]).map(a => a.kind === 'text' ? a : { kind: a.kind, properties: encodeAuthoredValue(a.properties) as JsonObject });
        delete properties.inlineAtoms;
      } else {
        if (typeof properties.text !== 'string') throw Error('TEI native producer: missing text');
        for (const _ of properties.text) cells++;
        block.inline = properties.text ? [{ kind: 'text', text: properties.text }] : [];
        delete properties.text;
      }
    }
    segments += Array.isArray(properties.standoffProperties) ? properties.standoffProperties.length : 0;
    block.properties = encodeAuthoredValue(properties) as JsonObject;
    blocks.push(block);
    if (children !== undefined) {
      if (!Array.isArray(children)) throw Error('TEI native producer: invalid children');
      block.children = children.map(visit);
    }
    if (relation) block.relations = { owned: Object.fromEntries(Object.entries(relation).map(([name, reading]) => [name, visit(reading as ExistingBlockDto)])), opaque: {} };
    return { placementId: `legacy:${document.id}:${createPlacementKey()}`, kind: 'owned', target: { kind: 'local', blockId: id } };
  };
  const root = visit(document);
  const envelope: NativeDocument = { format: 'mutable-document', version: 1, resourceId: document.id!, valueEncoding: 'codex-authored-value-v1',
    document: { format: 'codex-portable-resource-gate', version: 1, resourceId: document.id!, root, blocks }, definitionOwnerBlockIds: [],
    ...(blocks.some(b=>b.inline?.some(a=>a.kind==='alternative'))?{requiredCapabilities:[INLINE_ALTERNATIVES_CAPABILITY]}:{}) };
  const bytes = new TextEncoder().encode(JSON.stringify(envelope));
  // Validate the reserved wire shape now. Semantic DTO/range validation has
  // already run; full canonical graph validation belongs to native admission.
  parseNativeEnvelope(bytes);
  return { bytes, counts: { contents: 0, placements: 0, cells, blocks: blocks.length, standoffSegments: segments,
    definitions: Object.keys(document.linkedAnnotations as object).length } };
}
