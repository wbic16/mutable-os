import {contentLength,inlineSlice,normalizeInline,clipCompactProperties} from "./inline-sequence";
import { isReadingRelation, removedReadingOperations } from './inline-alternative';
import { clipProperties } from '../interchange/ranges';
import { hasBlockMode, modeContinuationError } from './mode-editing';
import { clone } from "./clone";
import { createBlockId, createContentKey, createPlacementKey } from "./ids";
import { readBlockId } from "./identity";
import type { BlockCommitSubject } from "./commit-capture";
import { deriveLocations } from "./repository";
import type { ContentRecord, JsonObject, RepositoryState, RepositoryOperation, Location } from "./types";

export interface CrossTextSegment { placementKey: string; start: number; end: number }
export interface CrossTextEditResult { placementKey: string; caret: number; state: RepositoryState; inputs: BlockCommitSubject[]; outputs: BlockCommitSubject[]; operations?:RepositoryOperation[] }

function fragment(content: ContentRecord, from: number, to: number, offset: number): JsonObject[] {
  return (content.compactInline?clipCompactProperties:clipProperties)(content.payload.standoffProperties, from, to, contentLength(content), offset);
}

/** Pure structural plan: untouched Cells are moved, never round-tripped as text. */
export function planCrossTextEdit(source: RepositoryState, segments: CrossTextSegment[], text: string, evidence?:{locationOf:(key:string)=>Location|undefined;referenceCount:(key:string)=>number}): CrossTextEditResult {
  if (!segments.length) throw new Error("Select a text range first");
  const moded = segments.map(s => source.contents[source.placements[s.placementKey]?.contentKey]).filter(c => c && hasBlockMode(c.payload));
  if (moded.length && segments.length > 1) throw Error('Replacing across mode-bearing Blocks needs an explicit merge policy; nothing was changed.');
  if (moded.length && /[\r\n]/.test(text)) {
    const reason = modeContinuationError(moded[0].payload);
    if (reason) throw Error(reason);
  }
  const locations = evidence ? {get:evidence.locationOf} : deriveLocations(source);
  const records = segments.map(segment => {
    const placement = source.placements[segment.placementKey], content = placement && source.contents[placement.contentKey];
    if (!content || content.inlineKind !== "standoff" || !Number.isInteger(segment.start) || !Number.isInteger(segment.end) || segment.start < 0 || segment.end < segment.start || segment.end > contentLength(content)) throw new Error("The text selection is stale or invalid");
    return content;
  });
  if(records.some(c=>!!c.compactInline!==!!records[0].compactInline))throw Error('Mixed canonical representation replacement is not supported');
  const location = locations.get(segments[0].placementKey);
  if (!location || location.slot.kind !== "children") throw new Error("Replacement requires an ordinary paragraph list");
  const parent = source.contents[location.ownerContentKey];
  const firstIndex = parent.children.indexOf(segments[0].placementKey);
  const counts = new Map<string, number>();
  if(!evidence)for (const p of Object.values(source.placements)) counts.set(p.contentKey, (counts.get(p.contentKey) ?? 0) + 1);
  const relations = Object.fromEntries(Object.entries(records[0].ownedRelations).filter(([name])=>!isReadingRelation(name)));
  const readings:Record<string,string>={};
  for(const c of records)for(const [name,key] of Object.entries(c.ownedRelations))if(isReadingRelation(name)) {
    if(readings[name]&&readings[name]!==key)throw Error('Conflicting inline reading identities; nothing was changed.');readings[name]=key;
  }
  records.forEach((content, index) => {
    const segment = segments[index];
    if (parent.children[firstIndex + index] !== segment.placementKey || (index > 0 && segment.start !== 0) || (index < records.length - 1 && segment.end !== contentLength(content))) throw new Error("Replacement cannot skip paragraphs or cross structural boundaries");
    if ((evidence?evidence.referenceCount(content.key):counts.get(content.key)) !== 1) throw new Error("Detach shared/transcluded paragraphs before replacing across Blocks");
    if (!index) return;
    if (content.children.length || Object.keys(content.opaqueRelations).length) throw new Error("Replacement would remove attached content; move those attachments first");
    for (const [side, key] of Object.entries(content.ownedRelations)) {
      if(isReadingRelation(side))continue;
      if (!["leftMargin", "rightMargin"].includes(side) || relations[side]) throw new Error("Replacement has conflicting margins or other attachments; move them first");
      relations[side] = key;
    }
  });
  const first = records[0], last = records.at(-1)!, start = segments[0].start, end = segments.at(-1)!.end;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const compact=!!first.compactInline;
  const state = compact ? {...source,contents:Object.create(source.contents),placements:Object.create(source.placements)} : clone(source);
  const cells = (value: string) => [...value].map(character => {
    const key = createContentKey(), placementKey = createPlacementKey();
    state.contents[key] = { key, viewType: "text-cell", payload: { text: character }, children: [], inlineContent: [], inlineRevision: 0, ownedRelations: {}, opaqueRelations: {}, wireChildren: "omitted", wireRelation: "omitted", revision: 0 };
    state.placements[placementKey] = { key: placementKey, contentKey: key, kind: "inline" };
    return placementKey;
  });
  const prefix = first.inlineContent.slice(0, start), suffix = last.inlineContent.slice(end);
  const output: string[] = [];
  const annotationIds = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const content = clone(first), key = i === 0 ? first.key : createContentKey();
    const placementKey = i === 0 ? segments[0].placementKey : createPlacementKey();
    const lastLine = i === lines.length - 1;
    const inserted = first.compactInline ? [] : cells(lines[i]);
    const insertedLength=[...lines[i]].length;
    content.key = key;
    content.inlineContent = [...(i === 0 ? prefix : []), ...inserted, ...(lastLine ? suffix : [])];
    if(first.compactInline)content.compactInline={version:1,spans:normalizeInline([...(i===0?inlineSlice(first.compactInline.spans,0,start):[]),...(lines[i]?[{kind:"text" as const,text:lines[i]}]:[]),...(lastLine?inlineSlice(last.compactInline!.spans,end,contentLength(last)):[])])};
    const annotations = [
      ...(i === 0 ? fragment(first, 0, start, 0) : []),
      ...(lastLine ? fragment(last, end, contentLength(last), (i === 0 ? start : 0) + insertedLength - end) : []),
    ];
    for (const property of annotations) if (typeof property.id === "string") {
      if (annotationIds.has(property.id)) property.id = crypto.randomUUID();
      annotationIds.add(property.id as string);
    }
    content.payload.standoffProperties = annotations;
    content.inlineRevision++; content.revision++;
    if (i === 0) { content.ownedRelations = relations; if (Object.keys(relations).length) content.wireRelation = "present"; }
    else {
      content.payload.id = createBlockId(); content.children = []; content.ownedRelations = {}; content.opaqueRelations = {};
      content.wireChildren = "omitted"; content.wireRelation = "omitted";
    }
    for(const atom of content.compactInline?.spans??[])if(atom.kind==='alternative')for(const name of atom.properties.readings)content.ownedRelations[name]=readings[name];
    if(Object.keys(content.ownedRelations).length)content.wireRelation='present';
    state.contents[key] = content;
    state.placements[placementKey] = { ...(i === 0 ? clone(source.placements[placementKey]) : {}), key: placementKey, contentKey: key, kind: "owned" };
    output.push(placementKey);
  }
  const updatedParent = clone(parent);
  updatedParent.children.splice(firstIndex, segments.length, ...output); updatedParent.revision++;
  state.contents[parent.key] = updatedParent;
  // Absorbed paragraphs are explicitly consumed by this compound edit. Their
  // surviving Cells/owned margin placements were transferred to output records.
  for (const content of records.slice(1)) delete state.contents[content.key];
  const operations:RepositoryOperation[]|undefined=compact?[...output.map(pk=>({kind:'put-content' as const,record:state.contents[state.placements[pk].contentKey]})),...output.slice(1).map(pk=>({kind:'put-placement' as const,record:state.placements[pk]})),{kind:'put-content',record:updatedParent},...records.slice(1).flatMap((c,i)=>[{kind:'remove-placement' as const,key:segments[i+1].placementKey},{kind:'remove-content' as const,key:c.key}])]:undefined;
  if(operations)operations.push(...removedReadingOperations(source,records,output.map(pk=>state.contents[state.placements[pk].contentKey]),k=>evidence?evidence.referenceCount(k):counts.get(k)??0));
  return { state,operations, placementKey: output.at(-1)!, caret: (lines.length === 1 ? start : 0) + [...lines.at(-1)!].length,
    inputs: records.map((record, i) => ({ contentKey: record.key, placementKey: segments[i].placementKey, blockId: readBlockId(record) })),
    outputs: output.map(placementKey => { const record = state.contents[state.placements[placementKey].contentKey]; return { contentKey: record.key, placementKey, blockId: readBlockId(record) }; }),
  };
}
