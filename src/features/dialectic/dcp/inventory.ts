import {contentUnits,contentLength} from '../../../block-tree/inline-sequence';
import type {DcpSources} from './sources';
import type {BlockNode} from '../../../block-tree/types';
import {contribution} from '../model';
export const inventoryLimits={items:20,previewCharacters:160,pageVisits:128,exchangeVisits:512,depth:32};
type Filters={contributionId:string|null;participantId:string|null;fromOrdinal:number|null};
type Walk=Generator<{node?:BlockNode;root:BlockNode;position:number;eligible:boolean}>;
/** Exchange-local lazy cursors over retained native chronology/ownership. No
 * subscriptions, copied content index, or whole-Document text preparation. */
export class DcpInventory {
 private cursors=new Map<string,{filters:Filters;walk:Walk;omissions:Set<string>}>();
 constructor(private sources:DcpSources){}
 private *walk(filters:Filters,omissions:Set<string>):Walk {
  const s=this.sources,seen=new Set<string>();
  const selected=filters.contributionId?s.resolve({kind:'contribution',resourceId:s.owner,blockId:filters.contributionId}):undefined;
  const roots=filters.contributionId?(selected?.status==='resolved'&&selected.node?[selected.node]:[]):s.roots(filters.fromOrdinal??1);
  for(const root of roots){
   const data=contribution((root.payload.metadata as any)?.dialectic);
   const eligible=!!data&&data.state==='committed'&&(data.ordinal??0)>=(filters.fromOrdinal??1)&&(!filters.participantId||data.participant?.id===filters.participantId);
   yield {node:root,root,position:0,eligible:false};if(!eligible)continue;
   let position=0;const stack:Iterator<string>[]=[this.edges(root)];
   while(stack.length){
    const next=stack.at(-1)!.next();if(next.done){stack.pop();continue;}
    const n=s.node(next.value);if(!n){yield {root,position,eligible:false};continue;}
    // Canonical aliases are listed once; nested Documents are outside this scope.
    if(seen.has(n.contentKey)||n.viewType==='document-block'){yield {root,position,eligible:false};continue;}seen.add(n.contentKey);
    const resolved=s.resolve({kind:'block',resourceId:s.owner,blockId:String(n.payload.id)});
    const owned=resolved.status==='resolved'&&resolved.node?.contentKey===n.contentKey;
    const text=n.viewType==='standoff-editor-block';if(text)position++;
    yield {node:n,root,position,eligible:owned&&text};
    if(!owned){omissions.add('Unavailable or ambiguous Block identity');continue;}
    if(stack.length>=inventoryLimits.depth){if(n.children.length||Object.keys(n.ownedRelations).length)omissions.add('Nested layout depth limit');continue;}
    stack.push(this.edges(n));
   }
  }
 }
 private *edges(n:BlockNode){yield* n.children;for(const name in n.ownedRelations)yield n.ownedRelations[name];}
 list(args:any){
  const {cursor,limit,contributionId,participantId,fromOrdinal}=args;
  if(cursor!==null&&(typeof cursor!=='string'||cursor.length>128)||!Number.isInteger(limit)||limit<1||limit>inventoryLimits.items||[contributionId,participantId].some(id=>id!==null&&(typeof id!=='string'||!id.length||id.length>200))||fromOrdinal!==null&&(!Number.isSafeInteger(fromOrdinal)||fromOrdinal<1))throw Error('Invalid inventory arguments');
  const s=this.sources,filters={contributionId,participantId,fromOrdinal};s.check();
  let page=cursor===null?undefined:this.cursors.get(cursor);
  if(cursor!==null&&(!page||JSON.stringify(page.filters)!==JSON.stringify(filters)))throw Error('Invalid inventory cursor or changed filters');
  if(page)this.cursors.delete(cursor);
  else {const omissions=new Set<string>();page={filters,omissions,walk:this.walk(filters,omissions)};}
  s.fence(s.entities.root.contentKey);
  const items:any[]=[];let visited=0,previewCells=0,done=false;
  while(items.length<limit&&visited<inventoryLimits.pageVisits&&s.diagnostics.inventoryVisited<inventoryLimits.exchangeVisits){
   s.check();const next=page.walk.next();if(next.done){done=true;break;}visited++;s.diagnostics.inventoryVisited++;
   const {node:n,root,position,eligible}=next.value;if(!n)continue;s.fence(n.contentKey);if(!eligible)continue;
   const data=contribution((root.payload.metadata as any)?.dialectic)!;
   let preview='',cells=0;const state=s.editor.repository.readState(),content=state.contents[n.contentKey];
   for(const atom of contentUnits(state,content)){
    cells++;preview+=atom.kind==='text'?atom.text.slice(0,inventoryLimits.previewCharacters-preview.length):'\uFFFC';
    if(cells>=inventoryLimits.previewCharacters||preview.length>=inventoryLimits.previewCharacters)break;
   }
   previewCells+=cells;
   items.push({handle:s.issue({kind:'block',resourceId:s.owner,blockId:String(n.payload.id)}),blockId:n.payload.id,nativeType:n.viewType,position,preview,previewTruncated:cells<contentLength(content)||preview.length===inventoryLimits.previewCharacters,readRequired:true,
    contribution:{handle:s.issue({kind:'contribution',resourceId:s.owner,blockId:String(root.payload.id)}),blockId:root.payload.id,ordinal:data.ordinal,author:data.author,participant:data.participant??null}});
  }
  s.diagnostics.inventoryPreviewCells+=previewCells;s.check();
  const exhausted=!done&&s.diagnostics.inventoryVisited>=inventoryLimits.exchangeVisits;
  const nextCursor=done||exhausted?null:'inventory-'+crypto.randomUUID();if(nextCursor)this.cursors.set(nextCursor,page);
  return {status:exhausted?'budget-exhausted':done?'complete':'partial',items,nextCursor,coverage:{visited,previewCells},limits:inventoryLimits,omissions:[...page.omissions,...(exhausted?['Exchange inventory traversal limit reached; request a narrower contribution or ordinal in a new exchange.']:[])]};
 }
 dispose(){this.cursors.clear();}
}
