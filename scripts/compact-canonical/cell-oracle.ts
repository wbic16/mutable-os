/** Comparative harness only: real current canonical Cell repository and commands.
 * Uses the SAME stripped-down presentation as B, not the full Flint application. */
import {decodeNative,nativeText,captureNative} from '../../src/persistence/native-resource';
import {resourceToRepository} from '../../src/history/durable-core';
import {CanonicalRepository} from '../../src/block-tree/repository';
import {TreeCommands} from '../../src/block-tree/commands';
import {CompactDocument,normalize,plain,length,type Block,type Atom,type Notice,type Delta} from './model';
export function cellOracle(bytes:Uint8Array){
 const resource=decodeNative(bytes),repository=new CanonicalRepository(resourceToRepository(resource),{enforceBlockIdentity:true}),commands=new TreeCommands(repository,k=>k);
 const resourceId=resource.resourceId;
 const index=new Map(Object.values(repository.readState().contents).filter(c=>!['text-cell','image-cell'].includes(c.viewType)).map(c=>[String(c.payload.id),c.key]));
 const placement=new Map(Object.values(repository.readState().placements).filter(p=>p.kind==='owned').map(p=>[p.contentKey,p.key]));
 const listeners=new Set<(n:Notice)=>void>(),undo:Delta[]=[],redo:Delta[]=[];let revision=0;
 const get=(id:string):Block=>{const s=repository.readState(),c=s.contents[index.get(id)!],{id:_,type,...properties}=c.payload;
  return {id,type:String(type),properties,...c.inlineKind==='standoff'?{inline:normalize(c.inlineContent.map(pk=>{const a=s.contents[s.placements[pk].contentKey];return a.viewType==='text-cell'?{kind:'text',text:String(a.payload.text)}:{kind:'image',properties:a.payload};}))}:{}};
 };
 const notify=(d:Delta,history?:'undo'|'redo')=>{revision++;for(const f of listeners)f({ids:[d.id],deltas:[d],revision,history});};
 const adapter={get,all:()=>[...index.keys()].map(get),has:(id:string)=>index.has(id),version:(id:string)=>repository.readState().contents[index.get(id)!].inlineRevision,
  subscribe:(f:(n:Notice)=>void)=>{listeners.add(f);return()=>listeners.delete(f);},
  capture:()=>nativeText(captureNative(repository.readState(),resourceId)),
  replace:(id:string,start:number,end:number,insert:Atom[])=>{
   if(insert.some(a=>a.kind!=='text'))throw Error('Baseline presentation harness inserts plain text only');
   const previous=get(id).inline!,text=plain(insert);commands.replaceInlineRange(placement.get(index.get(id)!)!,start,end,text);
   const removed=Array.from(plain(previous)).slice(start,end).join('');undo.push({id,start,end:start+length(insert),insert:removed?[{kind:'text',text:removed}]:[]});redo.length=0;notify({id,start,end,insert});
  },
  undo:()=>{const d=undo.pop();if(!d)return false;const before=Array.from(plain(get(d.id).inline!)).slice(d.start,d.end).join('');redo.push({id:d.id,start:d.start,end:d.start+length(d.insert),insert:before?[{kind:'text',text:before}]:[]});repository.undo();notify(d,'undo');return true;},
  redo:()=>{const d=redo.pop();if(!d)return false;const before=Array.from(plain(get(d.id).inline!)).slice(d.start,d.end).join('');undo.push({id:d.id,start:d.start,end:d.start+length(d.insert),insert:before?[{kind:'text',text:before}]:[]});repository.redo();notify(d,'redo');return true;},
  metrics:{canonicalCells:Object.values(resource.contents).filter(c=>['text-cell','image-cell'].includes(c.viewType)).length,canonicalCellPlacements:Object.values(resource.placements).filter(p=>p.kind==='inline').length},
 };
 return adapter as unknown as CompactDocument;
}
