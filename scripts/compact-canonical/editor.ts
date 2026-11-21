/** Test-owned adapter. The actual input, cross-Block, selection, focus and geometry
 * services are reused. No CanonicalRepository or canonical Cell graph is hidden here. */
import {InputGateway} from '../../src/input/gateway';
import {CrossBlockInput} from '../../src/input/cross-block-input';
import {CrossBlockSelection} from '../../src/runtime/cross-block-selection';
import {MountRegistry} from '../../src/runtime/mounts';
import {FocusService} from '../../src/runtime/focus';
import {SelectionService} from '../../src/runtime/selections';
import {MeasurementService} from '../../src/runtime/measurements';
import {BindingRegistry} from '../../src/input/bindings';
import {registerInputActions} from '../../src/input/binding-catalog';
import {ProvisionalCells} from '../../src/features/autocomplete/provisional-cells';
import {EditingOccurrence} from './presentation';
import {CompositionSession} from './composition';
import {adjacentGrapheme} from './editing-index';
import {CompactDocument,length,plain,type Notice} from './model';
let viewSerial=0;
type Route={id:string;placement:string;parent:string;order:number;key:string};
type Bookmark={active?:string;cross?:any;items:Array<{key:string;content:string;placement:string;version:number;selection:{anchor:number;head:number};set?:any}>};
const unsupported=()=>{throw Error('Outside M2 qualification: this application/clipboard/multicaret operation is not adapted');};
export function mountEditor(model:CompactDocument,host:HTMLElement,ids=model.all().filter(b=>b.inline).map(b=>b.id)){
 const viewId=`compact-view:${++viewSerial}`,mounts=new MountRegistry(),focus=new FocusService(mounts),selections=new SelectionService(),measurements=new MeasurementService(mounts),bindings=new BindingRegistry();registerInputActions(bindings,'MacIntel');
 const occurrences=new Map<string,EditingOccurrence>(),routes=new Map<string,Route>(),releases=new Map<string,()=>void>(),cellLookup=new Map<string,EditingOccurrence['cells'][number]>(),byContent=new Map<string,Set<string>>();
 const messages:string[]=[],notice=(s:string)=>messages.push(s),bookmarks=new Map<string,{before:Bookmark;after?:Bookmark}>();let alive=true;let lastChange:string|undefined;
 let structuralNodes:Record<string,any>={},allRoutes:Route[]=[];
 const discover=()=>{const out:Route[]=[];for(const b of model.all()){
  (b.children??[]).forEach((e,order)=>{if(e.target.kind==='local')out.push({id:e.target.blockId,placement:e.placementId,parent:b.id,order,key:`${viewId}:${e.placementId}`});});
  Object.values(b.relations?.owned??{}).forEach(e=>{if(e.target.kind==='local')out.push({id:e.target.blockId,placement:e.placementId,parent:`relation:${b.id}`,order:0,key:`${viewId}:${e.placementId}`});});
 }return out;};
 const node=(key:string):any=>{
  const o=occurrences.get(key),route=routes.get(key);if(o&&route)return {key,placementKey:route.placement,contentKey:o.id,viewId,viewType:'standoff-editor-block',payload:model.get(o.id).properties,inlineContent:o.keys,children:[],ownedRelations:{}};
  const cell=cellLookup.get(key);if(cell)return {key,viewType:cell.image?'image-cell':'text-cell',payload:cell.image??{text:cell.text}};
  return structuralNodes[key];
 };
 const nodeForPlacement=(placement:string)=>{const route=[...routes.values()].find(r=>r.placement===placement);return route?node(route.key):undefined;};
 const routeFor=(key:string)=>{const r=routes.get(key);if(!r)throw Error('Occurrence is stale');return r;};
 const createdPlacement=(id:string)=>{const r=discover().find(r=>r.id===id);if(!r)throw Error('Created Block has no placement');return r.placement;};
 const adjacent=(key:string,direction:-1|1)=>{const r=routeFor(key),ordered=allRoutes.filter(x=>x.parent===r.parent).sort((a,b)=>a.order-b.order),next=ordered[ordered.findIndex(x=>x.key===key)+direction];return next?node(next.key):undefined;};
 const setCaret=(key:string,at:number,head=at)=>{const o=occurrences.get(key);if(!o)return;mounts.get(key)?.restoreInlineSelection?.({anchor:at,head});selections.setPrimary(key,o.id,viewId,at,head);measurements.invalidateRanges(key);};
 const composition=new CompositionSession(model,k=>occurrences.get(k),k=>mounts.get(k)?.captureInlineSelection?.(),setCaret,notice);
 const completion={composition:(k:string,p:'start'|'end',t:string)=>composition.phase(k,p,t),edited:()=>{},key:()=>false,cancel:()=>{}};
 let gatewayMutation=false;
 const commands={
  replaceInlineRange:(key:string,start:number,end:number,text:string)=>{const r=routeFor(key);gatewayMutation=true;try{model.replace(r.id,start,end,text?[{kind:'text',text}]:[]);}finally{gatewayMutation=false;}},
  splitStandoff:(key:string,at:number)=>{const r=routeFor(key);return createdPlacement(model.split(r.id,at,r.placement));},
  insertEmptyStandoffSibling:(key:string,side:'before'|'after')=>{const r=routeFor(key);return createdPlacement(model.insertEmpty(r.id,side,r.placement));},
  joinStandoff:(left:string,right:string)=>{const a=routeFor(left),b=routeFor(right),at=occurrences.get(left)!.cells.length;model.join(a.id,b.id,undefined,a.placement,b.placement);return at;},
  remove:(key:string)=>{const r=routeFor(key);model.removeEmpty(r.id,r.placement);},
  transaction:(_label:string,action:()=>void)=>model.transaction(action),
  insert:(_dto:any,destination:{kind:'before'|'after';anchorKey:string})=>{const r=routeFor(destination.anchorKey);return createdPlacement(model.insertEmpty(r.id,destination.kind,r.placement));},
  replaceAcrossBlocks:(segments:Array<{placementKey:string;start:number;end:number}>,text:string)=>{
   if(segments.length!==2)throw Error('The bounded M2 cross-edit proof requires exactly two adjacent Blocks');
   const a=nodeForPlacement(segments[0].placementKey),b=nodeForPlacement(segments[1].placementKey);if(!a||!b)throw Error('Stale cross-Block selection');
   model.join(a.contentKey,b.contentKey,{start:segments[0].start,end:segments[1].end,text},segments[0].placementKey,segments[1].placementKey);return {placementKey:a.placementKey,caret:segments[0].start+[...text].length};
  }
 };
 const facade:any={node,mounts,selections,focus,bindings,commands,repository:{state:{get revision(){return model.revision;}},undo:()=>model.undo(),redo:()=>model.redo()},
  blockSelection:{state:{items:[]},clear:()=>{}},blockClipboard:{dismiss:()=>{}},clipboard:{key:()=>{},clearIntent:()=>{},copyProjectionEvent:()=>false,notify:notice,handleText:unsupported},
  completionInput:completion,features:{mutableClipboard:false,documentSessionHostTransfer:false},selectionGestures:{selecting:()=>false,cancelGesture:()=>{}},
  commandRegistry:{canExecute:()=>false,execute:unsupported},nodeForPlacementInView:nodeForPlacement,
  projections:new Map([[viewId,{state:{get nodes(){return structuralNodes;}}}]])};
 const cross=new CrossBlockSelection(facade);facade.crossText=cross;cross.enable(true);
 const bookmark=():Bookmark=>{
  const active=mounts.resolveElement(document.activeElement)?.nodeKey;const keys=new Set(Object.keys(selections.sets));if(active)keys.add(active);
  const items:Bookmark['items']=[];for(const key of keys){const o=occurrences.get(key),r=routes.get(key);if(!o||!r)continue;const set=selections.sets[key],primary=set?.items.find(i=>i.id===set.primaryId),s=key===active?mounts.get(key)?.captureInlineSelection?.():undefined;
   items.push({key,content:o.id,placement:r.placement,version:model.version(o.id),selection:s??(primary?{anchor:primary.anchor.boundary.index,head:primary.head.boundary.index}:o.selection),set:set?JSON.parse(JSON.stringify(set)):undefined});
  }return {active,cross:cross.range()?structuredClone(cross.range()):undefined,items};
 };
 const restore=(mark:Bookmark|undefined)=>{if(!mark)return;cross.clear();for(const b of mark.items){const r=routes.get(b.key),o=occurrences.get(b.key);if(!r||!o||r.id!==b.content||r.placement!==b.placement)continue;o.selection={...b.selection};if(b.set){const copy=structuredClone(b.set),primary=copy.items.find((i:any)=>i.id===copy.primaryId);if(primary){primary.anchor.boundary.index=b.selection.anchor;primary.head.boundary.index=b.selection.head;}selections.setSelectionSet(b.key,copy);}else selections.setPrimary(b.key,b.content,viewId,b.selection.anchor,b.selection.head);}
  if(mark.cross){try{cross.set(mark.cross.anchor,mark.cross.head);}catch{notice('Historical cross-selection target is no longer available');}}
  const active=mark.active&&occurrences.get(mark.active);if(active){focus.request(mark.active!);mounts.get(mark.active!)?.restoreInlineSelection?.(active.selection);}
 };
 const stopBefore=model.subscribeBefore?.(n=>{if(lastChange){const prior=bookmarks.get(lastChange);if(prior&&!prior.after)prior.after=bookmark();}lastChange=n.history?undefined:n.changeId;if(n.history){const b=bookmarks.get(n.changeId);if(n.history==='undo'&&b&&!b.after)b.after=bookmark();}else bookmarks.set(n.changeId,{before:bookmark()});cross.beforeChange();});
 const mount=(route:Route,before?:HTMLElement)=>{
  const {key,id}=route;routes.set(key,route);const flow=document.createElement('div');flow.className='compact-editor';flow.contentEditable='true';flow.spellcheck=false;flow.dataset.block=id;flow.dataset.occurrence=key;flow.style.cssText='white-space:pre-wrap;min-height:1.5em';host.insertBefore(flow,before??null);
  const o=new EditingOccurrence(model,id,flow);occurrences.set(key,o);let set=byContent.get(id);if(!set)byContent.set(id,set=new Set());set.add(key);o.cells.forEach(c=>cellLookup.set(c.key,c));
  const point=(n:Node|null,offset:number):number|undefined=>{if(!n||!flow.contains(n))return;if(n===flow)return Math.min(offset,o.cells.length);const e=(n instanceof Element?n:n.parentElement)?.closest<HTMLElement>('[data-inline-key]');if(!e)return;const i=o.index.position(e.dataset.inlineKey!);if(i===undefined)return;return i+(n.nodeType===Node.TEXT_NODE?[...(n.textContent??'').slice(0,offset)].length:offset>0?1:0);};
  const capture=()=>{const s=document.getSelection();if(!s)return;const anchor=point(s.anchorNode,s.anchorOffset),head=point(s.focusNode,s.focusOffset);return anchor===undefined||head===undefined?undefined:{anchor,head};};
  const boundary=(index:number)=>{index=Math.max(0,Math.min(index,o.cells.length));const cell=o.cells[index]??o.cells[index-1],el=cell?(o.renderer as any).elementFor?.(cell.key) as HTMLElement|undefined:undefined;
   if(el?.firstChild?.nodeType===Node.TEXT_NODE&&!cell.image)return {node:el.firstChild,offset:index===o.cells.length?(el.firstChild.textContent?.length??0):0};return {node:flow,offset:index};};
  const restoreInline=(s:{anchor:number;head:number})=>{o.selection={...s};const a=boundary(s.anchor),b=boundary(s.head);document.getSelection()?.setBaseAndExtent(a.node,a.offset,b.node,b.offset);};
  const unregister=mounts.register(key,{root:flow,focusElement:flow,inputPolicy:'standoff',focus:()=>flow.focus(),captureInlineSelection:capture,restoreInlineSelection:restoreInline,inlinePoint:(n:Node,i:number)=>point(n,i),inlineBoundary:boundary,captureText:()=>flow.textContent??'',adjacentGrapheme:(at:number,d:-1|1)=>adjacentGrapheme(o.cells,at,d)} as any);
  o.beforeRender=()=>{if(!composition.owns(key)){const s=capture();if(s)o.selection=s;}};
  o.afterRender=(_n,removed,added)=>{removed.forEach(c=>cellLookup.delete(c.key));added.forEach(c=>cellLookup.set(c.key,c));measurements.invalidateRanges(key);measurements.releaseCaret(key);if(!gatewayMutation&&!composition.owns(key)&&document.activeElement===flow)restoreInline(o.selection);};
  releases.set(key,()=>{unregister();mounts.releaseOccurrence(key);measurements.invalidateRanges(key);measurements.releaseCaret(key);for(const c of o.cells)cellLookup.delete(c.key);o.dispose();flow.remove();occurrences.delete(key);routes.delete(key);set!.delete(key);selections.removeOccurrence(key);});
 };
 const refreshStructure=()=>{structuralNodes={};for(const r of allRoutes){if(!structuralNodes[r.parent])structuralNodes[r.parent]={key:r.parent,viewId,viewType:'container',children:[],inlineContent:[],ownedRelations:{},payload:{}};structuralNodes[r.parent].children.push(r.key);if(!occurrences.has(r.key)&&model.has(r.id))structuralNodes[r.key]={key:r.key,viewId,contentKey:r.id,placementKey:r.placement,viewType:model.get(r.id).type,payload:model.get(r.id).properties,children:[],inlineContent:[],ownedRelations:{}};}};
 allRoutes=discover();const used=new Set<string>();for(const id of ids){const r=allRoutes.find(r=>r.id===id&&!used.has(r.key))??{id,parent:'retained',order:0,placement:`retained:${id}`,key:`${viewId}:retained:${id}`};used.add(r.key);mount(r);}refreshStructure();
 const reconcile=(n:Notice)=>{const parents=new Set([...routes.values()].map(r=>r.parent));allRoutes=discover();const live=new Map(allRoutes.map(r=>[r.key,r]));
  for(const [key,r]of [...routes])if(!model.has(r.id)||!live.has(key)){releases.get(key)?.();releases.delete(key);}
  for(const r of allRoutes)if(!routes.has(r.key)&&parents.has(r.parent)&&n.ids.includes(r.id)&&model.get(r.id).inline)mount(r);
  for(const [key,r]of routes){const next=live.get(key);if(next)routes.set(key,next);}
  const order=[...routes.values()].sort((a,b)=>a.parent===b.parent?a.order-b.order:0);let cursor=host.firstChild;for(const r of order){const flow=occurrences.get(r.key)!.flow!;if(flow===cursor)cursor=cursor.nextSibling;else host.insertBefore(flow,cursor);}refreshStructure();
 };
 const stop=model.subscribe(n=>{
  composition.changed(n);if(n.structural)reconcile(n);
  if(!gatewayMutation)for(const d of n.deltas)selections.mapContentEdit(d.id,d.start,d.end,length(d.insert));
  if(n.history&&n.changeId){const b=bookmarks.get(n.changeId);restore(b?.[n.history==='undo'?'before':'after']);}
  else if(n.changeId){const revision=n.revision;queueMicrotask(()=>queueMicrotask(()=>{if(alive&&model.revision===revision){const b=bookmarks.get(n.changeId!);if(b)b.after=bookmark();}}));}
 });
 const crossInput=new CrossBlockInput(facade,document);
 const gateway=new InputGateway(document,mounts,focus,commands as any,{replace:unsupported} as any,selections,{overlays:[],isOverlayKey:()=>false,open:unsupported} as any,node,nodeForPlacement,adjacent,adjacent,()=>undefined,bindings,()=>false,()=>false,{prefix:()=>false,exitEmpty:()=>false},facade.blockSelection,d=>model[d](),()=>false,undefined,undefined,()=>completion,undefined,undefined,notice);
 const uninstall=gateway.install();
 return {occurrences,mounts,focus,selections,measurements,cross,crossInput,composition,messages,bookmarks,viewId,
  focusAt(key:string,index:number){focus.request(key);setCaret(key,index);},
  reopen(key:string){const r={...routeFor(key)},selection={...occurrences.get(key)!.selection},next=occurrences.get(key)!.flow!.nextElementSibling;releases.get(key)?.();mount(r,next instanceof HTMLElement?next:undefined);occurrences.get(key)!.selection=selection;refreshStructure();},
  provisional(key:string,text:string,commit:boolean){const o=occurrences.get(key)!;if(o.cells.some(c=>c.image))throw Error('Mixed provisional autocomplete not qualified');const version=model.version(o.id),start=o.selection.head,draft=new ProvisionalCells(o.cells,start,start,'mention');draft.replace(start,start,text);o.renderer!.update(draft.present(o.cells));if(commit)model.replace(o.id,start,start,[{kind:'text',text}],version);o.render();return {draft:plain(model.get(o.id).inline!),committed:commit};},
  dispose(){alive=false;uninstall();crossInput.dispose();composition.cancel();stop();stopBefore?.();for(const release of releases.values())release();releases.clear();occurrences.clear();cellLookup.clear();bindings.dispose();focus.dispose();bookmarks.clear();}
 };
}
