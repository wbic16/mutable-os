import { deriveLocations } from '../block-tree/repository';
import { hasBlockMode } from '../block-tree/mode-editing';
import { clone } from '../block-tree/clone';
import type { RepositoryState, JsonObject } from '../block-tree/types';
import type { CrossTextSegment } from '../block-tree/cross-text-edit';
import { includesPoint } from './ranges';
import { diagnostic } from './diagnostics';
/** Trim source annotations before the existing insertion planner rebases survivors. */
export function conversionSource(state:RepositoryState,segments:CrossTextSegment[]) {
 if(segments.some(s=>{const c=state.contents[state.placements[s.placementKey]?.contentKey];return c&&hasBlockMode(c.payload);}))throw Error('Conversion of mode-bearing text needs an explicit semantic policy; nothing was changed.');
 const locations=deriveLocations(state),first=locations.get(segments[0]?.placementKey);
 if(!first||first.slot.kind!=='children')throw Error('Conversion requires an ordinary paragraph list.');
 const parent=state.contents[first.ownerContentKey],index=parent.children.indexOf(segments[0].placementKey);
 const counts=new Map<string,number>();for(const p of Object.values(state.placements))counts.set(p.contentKey,(counts.get(p.contentKey)??0)+1);
 segments.forEach((s,i)=>{const c=state.contents[state.placements[s.placementKey]?.contentKey];if(!c||parent.children[index+i]!==s.placementKey||counts.get(c.key)!==1||c.children.length||Object.keys(c.ownedRelations).length||Object.keys(c.opaqueRelations).length||(i>0&&s.start!==0)||(i<segments.length-1&&s.end!==c.inlineContent.length))throw Error('Conversion requires contiguous, unshared ordinary paragraphs without attached content.');});
 const contents={...state.contents},affected:Array<{type:string;id:string}>=[];
 for(const segment of segments){
  const original=contents[state.placements[segment.placementKey]?.contentKey];
  if(!original||original.inlineKind!=='standoff'||!Number.isInteger(segment.start)||!Number.isInteger(segment.end)||segment.start<0||segment.end<segment.start||segment.end>original.inlineContent.length)throw Error('Select nonempty literal source text.');
  for(const edge of original.inlineContent.slice(segment.start,segment.end))if(state.contents[state.placements[edge].contentKey]?.viewType!=='text-cell')throw Error('Conversion requires literal text without inline objects.');
  if(segment.start===segment.end)continue;
  const c=clone(original),properties=(c.payload.standoffProperties??[]) as JsonObject[];
  c.payload.standoffProperties=properties.flatMap(p=>{
   const start=Number(p.start),end=Number(p.end),a=segment.start,b=segment.end;
   const consumed=p.isZeroWidth?includesPoint(p,a,b,c.inlineContent.length):start<b&&end>=a;
   if(!consumed)return [p];
   affected.push({type:String(p.type??'shared annotation'),id:String(p.id??'')});
   if(p.isZeroWidth)return [];
   const left=start<a?{...p,end:a-1}:undefined,right=end>=b?{...p,start:b,...(left?{id:crypto.randomUUID()}: {})}:undefined;
   if(left&&right&&(p.original||p.externalDefinition))throw Error('This annotation cannot safely split across converted source. Narrow the selection or remove it explicitly first.');
   return [left,right].filter(Boolean) as JsonObject[];
  });contents[c.key]=c;
 }
 return {state:{...state,contents},diagnostics:affected.length?[diagnostic('affected-annotations',`${affected.length} annotation(s) intersect the source: ${[...new Set(affected.map(p=>p.type))].join(', ')}. Consumed parts are removed; unaffected sides are retained. Undo restores the original.`)]:[]};
}
