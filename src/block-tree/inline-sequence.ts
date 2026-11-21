import {textModes} from "../interchange/tei/definitions";
import { isReadingRelation, validateAlternativeSlot, type InlineAlternativeAtom } from './inline-alternative';
import type { ContentRecord, JsonObject, RepositoryState } from './types';
import { clone } from './clone';
import { mapStandoffPropertiesForReplacement, replacePoint, clipProperties } from '../interchange/ranges';

/** Canonical value, never an editing Cell or a placement table. Absence on a
 * record denotes the legacy Cell-backed representation. Version is in-memory. */
export type InlineAtom = { kind: 'text'; text: string } | { kind: 'image'; properties: JsonObject } | InlineAlternativeAtom;
export interface InlineSplice { start:number; end:number; insert:InlineAtom[] }
export interface CompactInline { version: 1; spans: InlineAtom[] }
export function inlineLength(atoms: readonly InlineAtom[]): number {
  let n=0;for(const a of atoms)if(a.kind==='text'){for(const _ of a.text)n++;}else n++;return n;
}
export function inlineSlice(atoms: readonly InlineAtom[], start:number, end:number): InlineAtom[] {
  const out:InlineAtom[]=[];let pos=0;
  for(const a of atoms){if(pos>=end)break;if(a.kind!=='text'){if(pos>=start)out.push(clone(a));pos++;continue;}
    let from=-1,to=a.text.length,offset=0;for(const ch of a.text){if(pos===start)from=offset;if(pos===end){to=offset;break;}pos++;offset+=ch.length;}
    if(from<0&&pos>start)from=0;if(from>=0&&to>from)out.push({kind:'text',text:a.text.slice(from,to)});
  }return out;
}
export function normalizeInline(atoms: readonly InlineAtom[]):InlineAtom[]{const out:InlineAtom[]=[];for(const a of atoms){if(a.kind==='text'&&!a.text)continue;const last=out.at(-1);if(last?.kind==='text'&&a.kind==='text')last.text+=a.text;else out.push(clone(a));}return out;}
/** Common read interface: compact reads never create canonical or editing Cells. */
export function logicalInline(state: Pick<RepositoryState,'contents'|'placements'>, c:ContentRecord):readonly InlineAtom[]{
  if(c.compactInline)return c.compactInline.spans;
  return normalizeInline(c.inlineContent.map(k=>{const a=state.contents[state.placements[k].contentKey];return a.viewType==='text-cell'?{kind:'text',text:String(a.payload.text)}:{kind:'image',properties:a.payload};}));
}
export const inlineText=(atoms:readonly InlineAtom[])=>atoms.map(a=>a.kind==='text'?a.text:'\uFFFC').join('');
export function validateCompactInline(c:ContentRecord):void {
  if(c.compactInline===undefined){if(Object.keys(c.ownedRelations).some(isReadingRelation))throw Error('Inline readings require a versioned compact host slot');return;}
  const unsupported=compactPayloadReason(c.payload,c.ownedRelations);
  if(unsupported)throw Error(unsupported+'; reopen with compact canonical text disabled');
  const s=c.compactInline;
  if(c.inlineKind!=='standoff'||c.viewType!=='standoff-editor-block'||c.inlineContent.length||'text' in c.payload||s.version!==1||!Array.isArray(s.spans))throw Error('Invalid compact inline authority');
  const slots=new Set<string>(),readings=new Set<string>();
  for(const a of s.spans){if(a.kind==='text'){if(typeof a.text!=='string'||!a.text.length||Object.keys(a).some(k=>k!=='kind'&&k!=='text'))throw Error('Invalid compact text span');}
    else if(a.kind==='alternative'){
      validateAlternativeSlot(a.properties);
      if(Object.keys(a).some(k=>k!=='kind'&&k!=='properties')||slots.has(a.properties.id))throw Error('Duplicate or invalid inline slot identity');
      slots.add(a.properties.id);
      for(const name of a.properties.readings){if(readings.has(name)||!Object.hasOwn(c.ownedRelations,name))throw Error('Missing/shared inline reading ownership');readings.add(name);}
    }
    else if(a.kind!=='image'||!a.properties||typeof a.properties!=='object'||Array.isArray(a.properties)||Object.keys(a).some(k=>k!=='kind'&&k!=='properties'))throw Error('Invalid compact inline object');}
  if(Object.keys(c.ownedRelations).some(name=>isReadingRelation(name)&&!readings.has(name)))throw Error('Unrepresented inline reading relation');
}
export function replaceCompact(c:ContentRecord,start:number,end:number,insert:readonly InlineAtom[],origins:(number|null)[]=[]):ContentRecord {
  if(!c.compactInline)throw Error('Compact content required');const spans=c.compactInline.spans,n=inlineLength(spans),count=inlineLength(insert);
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>n)throw Error('Invalid compact range');
  const payload=clone(c.payload);
  if(Array.isArray(payload.standoffProperties))payload.standoffProperties=payload.standoffProperties.flatMap((p:any,index:number)=>{
    if(p?.isZeroWidth===true&&Number.isInteger(p.start)&&Number.isInteger(p.end)&&(p.end===p.start||p.end===p.start-1)){
      const next=replacePoint(p,start,end,count,n);if(!next)return [];origins.push(index);return [{...next,end:Number(next.start)+(p.end-p.start)}];
    }
    const mapped=mapStandoffPropertiesForReplacement([p],start,end,count,[],n);mapped.forEach(()=>origins.push(index));return mapped;
  });
  const next={...clone(c),payload,compactInline:{version:1 as const,spans:normalizeInline([...inlineSlice(spans,0,start),...insert,...inlineSlice(spans,end,n)])},inlineRevision:c.inlineRevision+1,revision:c.revision+1};
  const kept=new Set(next.compactInline.spans.flatMap(a=>a.kind==='alternative'?a.properties.readings:[]));
  for(const name of Object.keys(next.ownedRelations))if(isReadingRelation(name)&&!kept.has(name))delete next.ownedRelations[name];
  validateCompactInline(next);return next;
}

export const contentLength=(c:ContentRecord)=>c.compactInline?inlineLength(c.compactInline.spans):c.inlineContent.length;

/** Streaming logical units for consumers that need individual code-point positions. */
export function* inlineUnits(atoms:readonly InlineAtom[]):Generator<InlineAtom>{for(const a of atoms)if(a.kind==='text')for(const text of a.text)yield {kind:'text',text};else yield a;}

export function compactPayloadReason(payload:JsonObject,relations:Record<string,unknown>={}):string|undefined{
 if(payload.mode!=null&&!Object.values(textModes).some(mode=>payload.mode===`tei/${mode}`))return 'Block modes are not qualified for compact text';
 if(Object.keys(relations).some(k=>k.startsWith('superposition:')) || (Array.isArray(payload.standoffProperties)&&payload.standoffProperties.some(p=>p?.type==='text/superposition'||Array.isArray(p?.alternatives))))return 'Text alternatives are not qualified for compact text';
}

export function clipCompactProperties(properties:unknown,start:number,end:number,length:number,offset=-start):JsonObject[]{
 if(!Array.isArray(properties))return [];
 return properties.flatMap(p=>clipProperties([p],start,end,length,offset).map(next=>p?.isZeroWidth===true&&p.end===p.start-1?{...next,end:Number(next.start)-1}:next));
}

/** Stream legacy units without eagerly visiting the rest of the document.
 * In particular, empty historical Cells still consume a bounded-reader unit. */
export function* contentUnits(state:Pick<RepositoryState,'contents'|'placements'>,c:ContentRecord):Generator<InlineAtom>{
 if(c.compactInline){yield* inlineUnits(c.compactInline.spans);return;}
 for(const key of c.inlineContent){const cell=state.contents[state.placements[key].contentKey];yield cell.viewType==='text-cell'?{kind:'text',text:String(cell.payload.text??'')}:{kind:'image',properties:cell.payload};}
}
export function contentSlice(state:Pick<RepositoryState,'contents'|'placements'>,c:ContentRecord,start:number,end:number):InlineAtom[]{
 if(c.compactInline)return inlineSlice(c.compactInline.spans,start,end);
 return normalizeInline(c.inlineContent.slice(start,end).map(key=>{const cell=state.contents[state.placements[key].contentKey];return cell.viewType==='text-cell'?{kind:'text',text:String(cell.payload.text??'')}:{kind:'image',properties:cell.payload};}));
}
