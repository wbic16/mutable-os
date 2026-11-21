import {assertSemanticFragmentDefinitions,semanticCopyError} from '../block-tree/scoped-semantic-copy';
import {ENTITY_REFERENCE} from '../feature-api/scoped-entities';
import {copyGlossIdentities} from '../features/gloss/relationships';
import {assertCopyableDialectic,RANGE_ANCHOR,rangeDefinition} from '../features/dialectic/anchors';
import { admittedQuillBlocks } from '../features/quill/clipboard';
import { sourceRole } from '../features/quill/model';
import { INLINE_READING, isReadingRelation } from '../block-tree/inline-alternative';
import { normalizeInline } from '../block-tree/inline-sequence';
import { transferSemanticPointers } from './semantic-transfer';
import {GLOSS,glossDefinition} from '../features/gloss/model';
import {WEB_BLOCK,webCapture} from '../web-resources/model';
import {validAcademicAnchor} from '../academic/anchors';
import {ACADEMIC_BLOCK,academicCapture} from '../academic/model';
import {STRUCTURED_BLOCK,structuredPayload} from '../structured/model';
import { passiveVideo } from './uri';
import { isSourceType, sourceFormat } from './source-block';
import { managedAsset, assetKey } from './managed-asset';
import { clone } from '../block-tree/clone';
import { createBlockId, createContentKey, createPlacementKey } from '../block-tree/ids';
import type { BlockFragment } from '../block-tree/clipboard';
import type { ContentRecord, JsonObject, RepositoryState } from '../block-tree/types';
import { LIMITS, safeUrl, validateFragment, type InterchangeScope, type MutableFragment, type Reference } from './fragment';

const passiveBlocks = new Set(['surface-block','side-block','resource-information-block','standoff-editor-block', 'plain-text-block', 'document-block', 'container-block', 'book-block', 'page-block', 'fixed-size-page-block', 'left-margin-block', 'right-margin-block', 'indented-list-block', 'table-block', 'table-row-block', 'table-cell-block', 'grid-block', 'grid-row-block', 'grid-cell-block', 'tab-row-block', 'tab-block', 'document-tab-row-block', 'document-tab-block']);
const passiveProperties = new Set(['style/bold', 'style/italics', 'style/underline', 'style/strikethrough', 'style/strike', 'style/superscript', 'style/subscript', 'style/uppercase', 'style/highlight', 'style/highlighter', 'style/rectangle', 'style/rainbow', 'style/spiky', 'style/blur', 'style/glow', 'style/ghost', 'style/grayscale', 'style/sepia', 'style/invert', 'style/contrast-brightness', 'style/chromatic-aberration', 'style/motion-blur', 'style/grain', 'style/ink-bleed', 'style/turbulence', 'style/color', 'text/colour', 'text/background-colour', 'reference/url', 'codex/entity-reference', 'codex/block-reference']);
const blockProperties = new Set(['block/alignment', 'block/alignment/left', 'block/alignment/right', 'block/alignment/center', 'block/font/size', 'block/font/size/h1', 'block/font/size/h2', 'block/font/size/h3', 'block/font/size/h4', 'block/font/size/half', 'block/font/size/three-quarters', 'block/indent', 'block/margin/top/20px', 'block/margin/top/40px']);
export const opaque = (type: string, data: JsonObject, target?: Reference) => {
  const original = { type, data: clone(data), ...(target ? { target: clone(target) } : {}) };
  if (JSON.stringify(original).length > LIMITS.opaque) throw Error('An unsupported object exceeds the safe preservation limit.');
  return original;
};
export const contentRecord = (key: string, viewType: string, payload: JsonObject): ContentRecord => ({ key, viewType, payload, children: [], inlineContent: [], inlineRevision: 0, ownedRelations: {}, opaqueRelations: {}, wireChildren: 'present', wireRelation: 'omitted', revision: 0 });

/** Two passes: allocate every owned identity, then resolve typed references only. */
export function materializeFragment(input: MutableFragment, scope: InterchangeScope = {}, availableAssets: ReadonlyMap<string, string> = new Map(), availableBlocks: ReadonlyMap<string, boolean> = new Map(), retainedBlocks: ReadonlySet<string> = new Set(), allowExternalEntities = true, preserveGlossIds = false): BlockFragment {
  const f = clone(validateFragment(input));
  const quill = admittedQuillBlocks(f);
  const compact = f.blocks.some(b=>b.inline?.atoms.some(a=>a.kind==='alternative'));
  assertSemanticFragmentDefinitions(Object.fromEntries(f.definitions.map(d=>[d.localId,{...d.attributes,type:d.type}])));
  if(f.blocks.some(b=>b.inline?.properties.some(p=>p.type===ENTITY_REFERENCE)))throw semanticCopyError();
  for(const b of f.blocks)assertCopyableDialectic(b.data);
  const keys = new Map(f.blocks.map(b => [b.localId, createContentKey()])), ids = new Map(f.blocks.map(b => [b.localId, createBlockId()]));
  const edges = new Map(f.placements.map(p => [p.localId, createPlacementKey()]));
  const definitions = new Map(f.definitions.map(d => [d.localId, crypto.randomUUID()]));
  const remap=(value:unknown)=>transferSemanticPointers(value,(kind,id)=>(kind==='block'?ids:definitions).get(id),f.provenance??{});
  for(const b of f.blocks){remap(b.data);for(const p of [...b.blockProperties,...b.inline?.properties??[]])remap(p.attributes);for(const a of b.inline?.atoms??[])if(a.kind==='alternative')remap(a.properties.metadata);}
  for(const d of f.definitions)remap(d.attributes);
  const state: RepositoryState = { rootPlacementKey: edges.get(f.roots[0].placement)!, contents: {}, placements: {}, revision: 0 };
  const sameScope = (r: Reference) => r.kind === 'external' && !!scope.cavernId && r.source.cavernId === scope.cavernId;
  const localExternalBlock = (r: Reference) => r.kind === 'external' && r.object === 'block' && sameScope(r) && !!scope.resourceId && r.source.resourceId === scope.resourceId && availableBlocks.has(r.id);
  const resolveProperty = (type: string, attrs: JsonObject, target?: Reference, block = false, quillSource = false): JsonObject => {
    // Never revive an opaque import, even after registration of its original type.
    const attributes = clone(attrs); for (const key of ['id', 'type', 'start', 'end', 'isZeroWidth', 'affinity', 'annotationId', 'externalDefinition']) delete attributes[key];
    if (type === 'mutable/opaque-property' || type === 'mutable/opaque-block-property') return { ...attributes, id: crypto.randomUUID(), type };
    const sourceDefinition=target?.kind==='local'&&target.object==='definition'?f.definitions.find(d=>d.localId===target.id):undefined;
    const allowed = (!block&&type===RANGE_ANCHOR&&(rangeDefinition({...attributes,type})||sourceDefinition&&rangeDefinition({...sourceDefinition.attributes,type:sourceDefinition.type}))) || quillSource || (block ? type==='tei/semantic' : ['tei/semantic','tei/editorial','tei/milestone','tei/relationship','tei/correspondence','tei/correspAction'].includes(type)) || (!block&&type===GLOSS&&(glossDefinition({...attributes,type})||sourceDefinition&&glossDefinition({...sourceDefinition.attributes,type:sourceDefinition.type}))) || (block && type==='mutable/academic-annotation' && validAcademicAnchor((attributes as any)?.anchor)) || (block ? blockProperties : passiveProperties).has(type);
    let value: string | undefined, annotationId: string | undefined;
    let resolved = !target;
    if (target?.kind === 'url') { resolved = safeUrl(target.url); value = target.url; }
    else if (target?.kind === 'local') {
      if (target.object === 'definition') { annotationId = definitions.get(target.id); resolved = !!annotationId; }
      else if (target.object === 'block') { value = ids.get(target.id); resolved = !!value; }
    } else if (target?.kind === 'external') {
      resolved = allowExternalEntities && sameScope(target) && target.object === 'entity' || localExternalBlock(target); value = target.id;
    }
    // A forged raw value is not a scoped semantic target.
    if (['codex/entity-reference', 'codex/block-reference', 'reference/url'].includes(type) && !target) resolved = false;
    if (target && !(target.kind === 'local' && target.object === 'definition')) {
      if (type === 'codex/entity-reference') resolved &&= target.kind === 'external' && target.object === 'entity';
      if (type === 'codex/block-reference') resolved &&= target.kind !== 'url' && target.object === 'block';
      if (type === 'reference/url') resolved &&= target.kind === 'url';
    }
    if (!allowed || !resolved) {
      // An inactive occurrence cannot retain a live annotationId: resolving it
      // could activate a supported shared definition. Retain its authored
      // definition inside the inert data instead, including on subsequent copy.
      const definition = target?.kind === 'local' && target.object === 'definition' ? f.definitions.find(d => d.localId === target.id) : undefined;
      return { id: crypto.randomUUID(), type: block ? 'mutable/opaque-block-property' : 'mutable/opaque-property', original: opaque(type, definition ? { ...attrs, mutableLinkedDefinition: clone(definition) } : attrs, target) };
    }
    return { ...attributes, id: crypto.randomUUID(), type, ...(value !== undefined ? { value } : {}), ...(annotationId ? { annotationId } : {}) };
  };
  const linkedAnnotations = Object.fromEntries(f.definitions.map(d => {
    const value = resolveProperty(d.type, d.attributes, d.target);
    return [definitions.get(d.localId)!, { ...value, id: definitions.get(d.localId)! }];
  }));
  const glosses=Object.values(linkedAnnotations).filter(glossDefinition) as any[];
  if(!preserveGlossIds)copyGlossIdentities(glosses,f.provenance?.resourceId);
  const embeds = new Map(f.embeds.map(e => [e.localId, e]));
  for (const b of f.blocks) {
    const readingNames=new Map(Object.keys(b.relations).filter(isReadingRelation).map(name=>[name,INLINE_READING+crypto.randomUUID()]));
    let source=false;try{if(isSourceType(b.type)){sourceFormat(b.type,b.data);source=!b.inline;}}catch{}
    const supported = quill.has(b.localId) || (b.type===WEB_BLOCK&&!b.inline&&webCapture(b.data.web)) || (b.type===ACADEMIC_BLOCK&&!b.inline&&academicCapture(b.data.academic)) || (b.type===STRUCTURED_BLOCK&&!b.inline&&structuredPayload(b.data)) || (b.type==='mutable/video-block'&&!b.inline&&!!passiveVideo(b.data.video)) || source || passiveBlocks.has(b.type) || b.type === 'mutable/opaque-block';
    const payload = clone(b.data);
    for (const key of ['id', 'type', 'standoffProperties', 'blockProperties', 'linkedAnnotations', 'children', 'relation', 'externalReference', 'definitionOwnerKey']) delete payload[key];
    // Layout/relationship metadata is authored, but executable styles and raw anchors are not imported.
    if (payload.metadata && typeof payload.metadata === 'object') {
      const metadata = payload.metadata as JsonObject;
      delete metadata.anchor; delete metadata.documentId; delete metadata.workspaceId;
      if(source && metadata.sourceLink && typeof metadata.sourceLink==='object') (metadata.sourceLink as JsonObject).linkId=crypto.randomUUID();
    }
    // Source ranges are foreign authored data, not native annotation links. Keeping
    // them out of the reserved field also prevents save/move dependency resolution.
    if(source&&b.data.standoffProperties!==undefined)payload.inactiveSourceAnnotations={version:1,properties:clone(b.data.standoffProperties),...(payload.inactiveSourceAnnotations!==undefined?{previous:payload.inactiveSourceAnnotations}:{})};
    delete payload.style; delete payload.css; delete payload.html;
    const record = contentRecord(keys.get(b.localId)!, supported ? b.type : 'mutable/opaque-block', supported
      ? { ...payload, id: ids.get(b.localId), type: b.type }
      : { id: ids.get(b.localId), type: 'mutable/opaque-block', original: opaque(b.type, isSourceType(b.type)&&b.inline?{...b.data,inactiveSourceInline:clone(b.inline)}:b.data), preview: b.inline?.atoms.map(a => a.kind === 'text' ? a.text : '\uFFFC').join('') ?? String(b.data.text ?? '') });
    record.payload.blockProperties = b.blockProperties.map(p => resolveProperty(p.type, p.attributes, p.target, true, quill.has(b.localId) && !!sourceRole({...p.attributes,type:p.type})));
    record.children = b.children.map(k => edges.get(k)!);
    record.ownedRelations = Object.fromEntries(Object.entries(b.relations).map(([name, key]) => [readingNames.get(name)??name, edges.get(key)!]));
    if (b.data.opaqueRelations && typeof b.data.opaqueRelations === 'object' && !Array.isArray(b.data.opaqueRelations)) {
      record.opaqueRelations = clone(b.data.opaqueRelations as JsonObject);
      delete record.payload.opaqueRelations;
    }
    if (Object.keys(record.ownedRelations).length || Object.keys(record.opaqueRelations).length) record.wireRelation = 'present';
    if (b.inline && !isSourceType(b.type)) {
      record.inlineKind = 'standoff';
      if(compact)record.compactInline={version:1,spans:[]};
      record.payload.standoffProperties = b.inline.properties.map(p => ({ ...resolveProperty(p.type, p.attributes, p.target), start: p.startIndex, end: p.endIndex - (p.isZeroWidth ? -(p.pointEndOffset??0) : 1), ...(p.isZeroWidth ? { isZeroWidth: true, affinity: p.affinity ?? (p.startIndex === b.inline!.atoms.reduce((n, a) => n + (a.kind === 'text' ? [...a.text].length : 1), 0) ? 'before' : 'after') } : {}) }));
      for (const atom of b.inline.atoms) {
        if(atom.kind==='alternative') {
          record.compactInline!.spans.push({kind:'alternative',properties:{...clone(atom.properties),id:crypto.randomUUID(),readings:atom.properties.readings.map(name=>readingNames.get(name)!)}});continue;
        }
        if(compact && atom.kind==='text') {record.compactInline!.spans.push({kind:'text',text:atom.text});continue;}
        const values = atom.kind === 'text' ? [...atom.text].map(text => ({ type: 'text-cell', payload: { text } as JsonObject })) : (() => {
          const e = embeds.get(atom.embed)!;
          const asset = managedAsset(e.data.asset);
          if (e.type === 'image-cell' && !e.data.original && asset && asset.cavernId === scope.cavernId && availableAssets.get(assetKey(asset)) === asset.assetId) {
            return [{ type: 'image-cell', payload: { id: crypto.randomUUID(), asset: { ...asset }, src: '', status: 'ready', alt: String(e.data.alt ?? ''), ...(typeof e.data.title === 'string' ? { title: e.data.title } : {}), ...(typeof e.data.width === 'number' ? { width: e.data.width } : {}), ...(typeof e.data.height === 'number' ? { height: e.data.height } : {}) } }];
          }
          // Reuse only a matching image already admitted in this Cavern. Never
          // accept a foreign /uploads URL merely because its filename matches.
          if (e.type === 'image-cell' && !e.data.original && f.provenance?.cavernId && f.provenance.cavernId === scope.cavernId && typeof e.data.assetId === 'string' && typeof e.data.src === 'string' && availableAssets.get(e.data.assetId) === e.data.src && /^\/uploads\/[^?#]+$/.test(e.data.src)) {
            return [{ type: 'image-cell', payload: { ...clone(e.data), assetId: e.data.assetId, src: e.data.src, status: 'ready' } }];
          }
          return [{ type: 'image-cell', payload: { alt: String(e.data.alt ?? 'Unresolved image'), src: '', status: 'failed', assetId: crypto.randomUUID(), original: e.type === 'image-cell' && e.data.original ? clone(e.data.original) : opaque(e.type, e.data, e.asset) } }];
        })();
        for (const value of values) {
          if(compact){record.compactInline!.spans.push({kind:'image',properties:value.payload});continue;}
          const key = createContentKey(), edge = createPlacementKey();
          state.contents[key] = contentRecord(key, value.type, value.payload);
          state.placements[edge] = { key: edge, contentKey: key, kind: 'inline' }; record.inlineContent.push(edge);
        }
      }
      if(record.compactInline)record.compactInline.spans=normalizeInline(record.compactInline.spans);
    }
    if(retainedBlocks.has(b.localId)){const edge=f.placements.find(p=>p.localId===f.roots[0].placement)!;if(edge.target.kind==='local')record.definitionOwnerKey=keys.get(edge.target.id);}
    state.contents[record.key] = record;
  }
  for (const p of f.placements) {
    const key = edges.get(p.localId)!;
    let contentKey: string;
    if (p.target.kind === 'local') contentKey = keys.get(p.target.id)!;
    else {
      contentKey = createContentKey();
      state.contents[contentKey] = contentRecord(contentKey, 'mutable/opaque-block', { id: createBlockId(), type: 'mutable/opaque-block', original: opaque('external-block-reference', {}, p.target), preview: 'Unresolved Block reference' });
    }
    state.placements[key] = { key, contentKey, kind: p.kind, placementId: createBlockId() };
  }
  for (const link of f.links) {
    const source = link.from.object === 'block' && state.contents[keys.get(link.from.id)!];
    if (!source) throw Error('Unsupported clipboard relationship owner.');
    if (link.type === 'anchor' && link.to.kind === 'local' && link.to.object === 'block') {
      const targetId = link.to.id;
      if (targetId === link.from.id || f.links.some(l => l.type === 'anchor' && l.from.id === targetId)) throw Error('Anchors cannot target themselves or another anchored Block.');
      source.payload.metadata = { ...(source.payload.metadata as JsonObject ?? {}), anchor: { version: 1, blockId: ids.get(link.to.id), offset: clone(link.attributes.offset ?? { x: 0, y: 0 }) } };
    } else if (link.type === 'anchor' && link.to.kind === 'external' && localExternalBlock(link.to) && !availableBlocks.get(link.to.id)) {
      source.payload.metadata = { ...(source.payload.metadata as JsonObject ?? {}), anchor: { version: 1, blockId: link.to.id, offset: clone(link.attributes.offset ?? { x: 0, y: 0 }) } };
    } else {
      const links = source.payload.mutableUnresolvedLinks as unknown[] ?? [];
      source.payload.mutableUnresolvedLinks = [...links, { type: link.type, target: clone(link.to), attributes: clone(link.attributes) }];
    }
  }
  return { state, roots: f.roots.map(r => edges.get(r.placement)!), linkedAnnotations };
}
