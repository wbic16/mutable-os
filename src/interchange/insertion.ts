import { clone } from '../block-tree/clone';
import { isReadingRelation, removedReadingOperations } from '../block-tree/inline-alternative';
import { contentLength, logicalInline, inlineSlice, normalizeInline, replaceCompact, clipCompactProperties } from '../block-tree/inline-sequence';
import { hasBlockMode } from '../block-tree/mode-editing';
import { planCrossTextEdit, type CrossTextSegment } from '../block-tree/cross-text-edit';
import { createBlockId, createContentKey, createPlacementKey } from '../block-tree/ids';
import { deriveLocations } from '../block-tree/repository';
import { resourceOwner } from '../block-tree/resource-identity';
import { linkedRegistry } from '../block-tree/linked-annotations';
import type { BlockFragment } from '../block-tree/clipboard';
import type { ContentRecord, JsonObject, RepositoryState, RepositoryOperation, Location } from '../block-tree/types';
import type { MutableFragment } from './fragment';
import { clipProperties, mapStandoffPropertiesForReplacement } from './ranges';
import { transferSemanticPointers } from './semantic-transfer';

export interface InsertionResult { state: RepositoryState; placementKey: string; caret: number; operations?:RepositoryOperation[] }
const annotations = (c: ContentRecord) => c.payload.standoffProperties as JsonObject[] ?? [];
const shifted = (props: JsonObject[], delta: number) => props.map(p => ({ ...clone(p), start: Number(p.start) + delta, end: Number(p.end) + delta }));

/** Identity-bearing roots must survive independently, even for an open slice. */
export function inlineMergePredicate(fragment: BlockFragment, viewType: string) {
  const anchored = new Set(Object.values(fragment.state.contents).map(c => (c.payload.metadata as any)?.anchor?.blockId).filter(Boolean));
  const references = [...Object.values(fragment.linkedAnnotations ?? {})];
  for (const c of Object.values(fragment.state.contents)) references.push(...annotations(c), ...((c.payload.blockProperties as JsonObject[]) ?? []));
  for (const p of references) if (p.type === 'codex/block-reference') anchored.add(p.value);
  const preserveTarget=(value:unknown)=>transferSemanticPointers(clone(value),(kind,id)=>{if(kind==='block')anchored.add(id);return id;},{});
  for(const p of references)preserveTarget(p);
  for(const c of Object.values(fragment.state.contents)){preserveTarget(c.payload.metadata??{});for(const a of c.compactInline?.spans??[])if(a.kind==='alternative')preserveTarget(a.properties.metadata??{});}
  const uses = new Map<string, number>();
  for (const p of Object.values(fragment.state.placements)) uses.set(p.contentKey, (uses.get(p.contentKey) ?? 0) + 1);
  return (c: ContentRecord) => !hasBlockMode(c.payload) && c.viewType === viewType && c.inlineKind === 'standoff' && !c.children.length && Object.keys(c.ownedRelations).every(isReadingRelation) && !Object.keys(c.opaqueRelations).length && !anchored.has(c.payload.id) && !(c.payload.metadata as any)?.anchor && uses.get(c.key) === 1;
}

/** Compact clipboard edits carry only affected hosts and the incoming closure.
 * General topology stays on the existing legacy planner or rejects explicitly. */
export function planCompactFragmentInsertion(source:RepositoryState, segments:CrossTextSegment[], fragment:BlockFragment, slices:MutableFragment['roots'], evidence:{locationOf:(key:string)=>Location|undefined;referenceCount:(key:string)=>number;ownerOf?:(key:string)=>ContentRecord|undefined}):InsertionResult {
  const first=source.contents[source.placements[segments[0]?.placementKey]?.contentKey];
  if(!first?.compactInline)throw Error('Inline alternatives require a compact destination.');
  if(Object.keys(fragment.state.contents).some(k=>source.contents[k])||Object.keys(fragment.state.placements).some(k=>source.placements[k]))throw Error('Clipboard identities collide with the destination; nothing was pasted.');
  const roots=fragment.roots.map(pk=>fragment.state.contents[fragment.state.placements[pk].contentKey]);
  const canMerge=inlineMergePredicate(fragment,first.viewType);
  if(!roots.length || roots.some((c,i)=>!canMerge(c)||!slices[i]?.openStart||!slices[i]?.openEnd))throw Error('Compact rich paste currently requires ordinary inline paragraph slices; paste whole Blocks beside the destination instead.');
  if((segments.length>1||roots.length>1)&&hasBlockMode(first.payload))throw Error('Structural paste into mode-bearing text requires an explicit continuation policy.');
  for(const s of segments){const c=source.contents[source.placements[s.placementKey]?.contentKey];if(!c?.compactInline||!Number.isInteger(s.start)||!Number.isInteger(s.end)||s.start<0||s.end<s.start||s.end>contentLength(c))throw Error('Stale compact clipboard destination.');}
  const crossing=segments.length>1?planCrossTextEdit(source,segments,'',evidence):undefined;
  const state:RepositoryState={...source,contents:Object.create(source.contents),placements:Object.create(source.placements)};
  const operations:RepositoryOperation[]=[];
  const put=(op:RepositoryOperation)=>{operations.push(op);if(op.kind==='put-content')state.contents[op.record.key]=op.record;else if(op.kind==='put-placement')state.placements[op.record.key]=op.record;};
  crossing?.operations?.forEach(put);
  const rootKeys=new Set(roots.map(c=>c.key)),rootEdges=new Set(fragment.roots);
  for(const c of Object.values(fragment.state.contents))if(!rootKeys.has(c.key)&&!['text-cell','image-cell'].includes(c.viewType)) {
    const copy=clone(c);if(c.inlineKind==='standoff'){copy.compactInline={version:1,spans:normalizeInline(logicalInline(fragment.state,c))};copy.inlineContent=[];}put({kind:'put-content',record:copy});
  }
  for(const p of Object.values(fragment.state.placements))if(p.kind!=='inline'&&!rootEdges.has(p.key))put({kind:'put-placement',record:clone(p)});
  const start=segments[0].start,end=segments.at(-1)!.end,last=source.contents[source.placements[segments.at(-1)!.placementKey].contentKey];
  const prefix=inlineSlice(first.compactInline.spans,0,start),suffix=inlineSlice(last.compactInline!.spans,end,contentLength(last));
  const relations={...first.ownedRelations,...last.ownedRelations};
  const outputs:string[]=[];
  const occurrenceIds=new Set<string>();
  for(let i=0;i<roots.length;i++) {
    const incoming=roots[i],atoms=logicalInline(fragment.state,incoming),head=i===0,tail=i===roots.length-1;
    const c=clone(head?(crossing?state.contents[first.key]:first):incoming),pk=head?segments[0].placementKey:fragment.roots[i];
    c.compactInline={version:1,spans:normalizeInline([...(head?prefix:[]),...atoms,...(tail?suffix:[])])};c.inlineContent=[];c.inlineRevision++;c.revision++;
    c.ownedRelations=head?Object.fromEntries(Object.entries(c.ownedRelations).filter(([name])=>!isReadingRelation(name))):{};
    for(const atom of c.compactInline.spans)if(atom.kind==='alternative')for(const name of atom.properties.readings){const edge=incoming.ownedRelations[name]??relations[name];if(!edge)throw Error('Missing inline reading closure.');c.ownedRelations[name]=edge;}
    c.wireRelation=Object.keys(c.ownedRelations).length?'present':'omitted';
    c.payload.standoffProperties=segments.length===1&&roots.length===1?
      [...(replaceCompact({...first,ownedRelations:{...first.ownedRelations,...incoming.ownedRelations}},start,end,atoms).payload.standoffProperties as JsonObject[]??[]),...shifted(annotations(incoming),start)]:
      [...(head?clipCompactProperties(first.payload.standoffProperties,0,start,contentLength(first),0):[]),...shifted(annotations(incoming),head?start:0),...(tail?clipCompactProperties(last.payload.standoffProperties,end,contentLength(last),contentLength(last),(head?start:0)+contentLength(incoming)-end):[])];
    for(const p of c.payload.standoffProperties as JsonObject[])if(typeof p.id==='string'){if(occurrenceIds.has(p.id))p.id=crypto.randomUUID();occurrenceIds.add(p.id as string);}
    put({kind:'put-content',record:c});if(!head)put({kind:'put-placement',record:clone(fragment.state.placements[pk])});outputs.push(pk);
  }
  if(roots.length>1){
    const location=evidence.locationOf(segments[0].placementKey);
    if(location?.slot.kind!=='children'||evidence.referenceCount(first.key)!==1)throw Error('Structural paste requires unshared ordinary paragraphs.');
    const parent=clone(state.contents[location.ownerContentKey]),index=parent.children.indexOf(segments[0].placementKey);parent.children.splice(index,1,...outputs);parent.revision++;put({kind:'put-content',record:parent});
  }
  if(Object.keys(fragment.linkedAnnotations??{}).length){const owner=(evidence.ownerOf?evidence.ownerOf(first.key):resourceOwner(source,first.key))??source.contents[source.placements[source.rootPlacementKey].contentKey];const c=clone(state.contents[owner.key]);c.payload.linkedAnnotations={...clone(linkedRegistry(source,owner.key)),...clone(fragment.linkedAnnotations)};c.revision++;put({kind:'put-content',record:c});}
  if(!crossing)operations.push(...removedReadingOperations(source,[first],outputs.map(pk=>state.contents[state.placements[pk].contentKey]),evidence.referenceCount));
  return {state,operations,placementKey:outputs.at(-1)!,caret:(roots.length===1?start:0)+contentLength(roots.at(-1)!)};
}

/** Pure, one-shot structural plan. No command-per-atom loop and no DOM access. */
export function planFragmentInsertion(source: RepositoryState, segments: CrossTextSegment[], fragment: BlockFragment, slices: MutableFragment['roots']): InsertionResult {
  if (!segments.length) throw Error('Select a destination first.');
  const records = segments.map(s => {
    const c = source.contents[source.placements[s.placementKey]?.contentKey];
    if (!c || c.inlineKind !== 'standoff' || !Number.isInteger(s.start) || !Number.isInteger(s.end) || s.start < 0 || s.end < s.start || s.end > c.inlineContent.length) throw Error('The clipboard destination is stale.');
    return c;
  });
  const first = records[0], last = records.at(-1)!, start = segments[0].start, end = segments.at(-1)!.end;
  const rootRecords = fragment.roots.map(k => fragment.state.contents[fragment.state.placements[k].contentKey]);
  const canMerge = inlineMergePredicate(fragment, first.viewType);
  const single = segments.length === 1 && rootRecords.length === 1 && slices[0].openStart && slices[0].openEnd && canMerge(rootRecords[0]);
  if (!single && records.some(c => hasBlockMode(c.payload))) throw Error('Structural paste into mode-bearing text needs an explicit continuation policy; paste a single inline slice or insert whole Blocks beside it.');
  const base = segments.length > 1 ? planCrossTextEdit(source, segments, '').state : source;
  const state: RepositoryState = { ...base, contents: { ...base.contents, ...clone(fragment.state.contents) }, placements: { ...base.placements, ...clone(fragment.state.placements) } };
  const keep = (c: ContentRecord) => { c.revision++; c.inlineRevision++; state.contents[c.key] = c; };
  const mergeDefinitions = () => {
    if (!Object.keys(fragment.linkedAnnotations ?? {}).length) return;
    const owner = resourceOwner(source, first.key) ?? source.contents[source.placements[source.rootPlacementKey].contentKey];
    const c = clone(state.contents[owner.key]); c.payload.linkedAnnotations = { ...clone(linkedRegistry(source, owner.key)), ...clone(fragment.linkedAnnotations) }; c.revision++; state.contents[c.key] = c;
  };
  if (single) {
    const incoming = rootRecords[0], c = clone(first), origins: (number | null)[] = [];
    c.inlineContent = [...first.inlineContent.slice(0, start), ...incoming.inlineContent, ...first.inlineContent.slice(end)];
    c.payload.standoffProperties = [...mapStandoffPropertiesForReplacement(annotations(first), start, end, incoming.inlineContent.length, origins, first.inlineContent.length), ...shifted(annotations(incoming), start)];
    keep(c); mergeDefinitions();
    return { state, placementKey: segments[0].placementKey, caret: start + incoming.inlineContent.length };
  }
  const location = deriveLocations(source).get(segments[0].placementKey);
  if (!location || location.slot.kind !== 'children') throw Error('Structural paste needs an ordinary paragraph list.');
  if (Object.values(source.placements).filter(p => p.contentKey === first.key).length > 1) throw Error('Detach a shared paragraph before structural paste.');
  const parent = clone(state.contents[location.ownerContentKey]), index = parent.children.indexOf(segments[0].placementKey);
  const left = clone(state.contents[first.key]); left.inlineContent = first.inlineContent.slice(0, start);
  left.payload.standoffProperties = clipProperties(first.payload.standoffProperties, 0, start, first.inlineContent.length, 0);
  // Do not duplicate an affinity-boundary point in an empty surviving side.
  left.payload.standoffProperties = (left.payload.standoffProperties as JsonObject[]).filter(p => p.isZeroWidth !== true || p.start !== start || p.affinity === 'before');
  const suffixCells = last.inlineContent.slice(end);
  const suffixProperties = clipProperties(last.payload.standoffProperties, end, last.inlineContent.length, last.inlineContent.length).filter(p => p.isZeroWidth !== true || p.start !== 0 || p.affinity === 'after');
  const output: string[] = [];
  const incoming = [...fragment.roots];
  if (slices[0].openStart && canMerge(rootRecords[0])) {
    const c = rootRecords[0]; left.inlineContent.push(...c.inlineContent); left.payload.standoffProperties = [...annotations(left), ...shifted(annotations(c), start)]; incoming.shift();
    output.push(segments[0].placementKey); keep(left);
  } else if (left.inlineContent.length || annotations(left).length || left.children.length || Object.keys(left.ownedRelations).length || Object.keys(left.opaqueRelations).length || (left.payload.metadata as any)?.anchor || (left.payload.blockProperties as any[])?.length) {
    output.push(segments[0].placementKey); keep(left);
  }
  output.push(...incoming);
  const tailKey = output.at(-1)!;
  const tail = clone(state.contents[state.placements[tailKey].contentKey]);
  let caret = tail.inlineContent.length, caretKey = tailKey;
  if (slices.at(-1)!.openEnd && canMerge(rootRecords.at(-1)!)) {
    tail.payload.standoffProperties = [...annotations(tail), ...shifted(suffixProperties, tail.inlineContent.length)]; tail.inlineContent.push(...suffixCells); keep(tail);
  } else if (suffixCells.length || suffixProperties.length || tail.inlineKind !== 'standoff') {
    const right = clone(last); right.key = createContentKey(); right.payload.id = createBlockId(); right.children = []; right.ownedRelations = {}; right.opaqueRelations = {}; delete right.definitionOwnerKey;
    if (right.payload.metadata) delete (right.payload.metadata as JsonObject).anchor;
    right.inlineContent = suffixCells; right.payload.standoffProperties = suffixProperties;
    right.payload.blockProperties = ((right.payload.blockProperties as JsonObject[]) ?? []).map(p => ({ ...p, id: crypto.randomUUID() }));
    const key = createPlacementKey(); state.placements[key] = { key, contentKey: right.key, kind: 'owned' }; keep(right); output.push(key);
    caretKey = key; caret = 0;
  }
  const seen = new Set<string>();
  for (const key of output) {
    const c = state.contents[state.placements[key].contentKey];
    for (const p of annotations(c)) if (typeof p.id === 'string') { if (seen.has(p.id)) p.id = crypto.randomUUID(); seen.add(String(p.id)); }
  }
  parent.children.splice(index, 1, ...output); parent.revision++; state.contents[parent.key] = parent;
  mergeDefinitions();
  return { state, placementKey: caretKey, caret };
}
