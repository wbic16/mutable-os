import {Dynamic} from 'solid-js/web';
import {useInstrumentPresentations} from '../../rendering/instrument-presentations';
import {LerSession,type LerSource} from './ler-session';
import {LiveEntityQuery} from './live-entity-query';
import type {LiveDocumentEntities} from '../../feature-api/live-entities';
import type {CompletionSession} from '../autocomplete/session';
import {usage,clearUsage,recordUsage} from '../autocomplete/history';
import {AuthorityPanel} from '../autocomplete/authority-view';
import {createManagedFloatingTool} from "../../rendering/managed-floating-tool";
import {useManagedViewActivity,useManagedWindowOwner} from "../../rendering/window-manager";
import {For,Show,createEffect,createMemo,createSignal,untrack,onCleanup,onMount} from 'solid-js';
import type {AnnotationCapabilities,PanelSession,SearchRange} from '../../feature-api';
import {graphemeBoundaries,createFloatingWindowResize,FloatingWindowResizeHandle,type FloatingWindowSize} from '../../feature-api';
import type {CanonicalEntity,EntityService,EntityResolution,EntityResolutionQuery} from '../../feature-api/entities';
import {chooseEntity,type EntitySearchData} from './entity-search';
import {EntityCandidates} from './entity-candidates';
import {EntityCandidatesPanel} from './candidates-view';
import './entity-search.css';
import './ler-view.css';

/** Target, query, and resolved identity are deliberately independent session state. */
function createLerModel(props:{api:AnnotationCapabilities;panel:PanelSession;completion?:{session:CompletionSession;target():EntitySearchData;adjust(edge:'start'|'end',direction:-1|1,word:boolean):void;controls(value:{run(id:string):boolean;busy():boolean;canClose():boolean}|undefined):void}}) {
 const presenters=useInstrumentPresentations();
 const {api,panel,completion}=props;
 const activity=useManagedViewActivity(),owner=useManagedWindowOwner();
 const [target,setTarget]=createSignal<EntitySearchData>({...panel.data as EntitySearchData});
 const session=new LerSession(target(),panel.ownerKey,!!completion);
 const query=()=>session.query(),setQuery=(value:string)=>session.input(value),stream=()=>session.state.field,setStream=(value:EntityResolutionQuery['stream'])=>session.field(value);
 const match=()=>session.state.match,setMatch=(value:EntityResolutionQuery['match'])=>session.match(value),searchScope=()=>session.state.source,setScope=(value:LerSource)=>session.source(value);
 const [result,setResult]=createSignal<EntityResolution>(),[current,setCurrent]=createSignal(0),[page,setPage]=createSignal(0),[retry,setRetry]=createSignal(0);
 const [busy,setBusy]=createSignal(false),[error,setError]=createSignal(''),[working,setWorking]=createSignal(false),[valid,setValid]=createSignal(true);
 const [composing,setComposing]=createSignal(false);
 const [creating,setCreating]=createSignal(false),[createForm,setCreateForm]=createSignal(false),[canonicalName,setCanonicalName]=createSignal('');
 const [created,setCreated]=createSignal<CanonicalEntity>(),[outcome,setOutcome]=createSignal('Not created'),[details,setDetails]=createSignal<CanonicalEntity>();
 const [aliasName,setAliasName]=createSignal(''),[aliasEdit,setAliasEdit]=createSignal<CanonicalEntity['aliases'][number]>();
 const [rename,setRename]=createSignal('');
 const [authority,setAuthority]=createSignal(!!target().workstation?.authority);
 const [expansion,setExpansion]=createSignal(false);
 let candidatesStale=false;
 const review=()=>{setExpansion(false);if(!session.state.prepared){setError('Prepare an entity before reviewing other mention text.');return;}if(candidatesStale){candidates().dispose();setCandidates(newCandidates());candidatesStale=false;}candidates().configure({scope:'document'});candidates().enable(false);session.view('review');};
 createEffect(()=>{if(!completion)return;completion.session.state.revision;const next=untrack(completion.target);untrack(()=>{setTarget(next);setValid(true);candidates().disable();candidatesStale=true;});});
 createEffect(()=>{if(completion){const value=completion.session.state.searchQuery;untrack(()=>{if(searchScope()!=='live')setQuery(value);});}});
 let service:EntityService|undefined;try{service=api.entities?.(panel.ownerKey);}catch(e){setError(String(e));}
 let alive=true,editing=false;
 let acquisitionGuard=()=>true;
 const [usageScope,setUsageScope]=createSignal<string>();
 const [live,setLive]=createSignal<LiveEntityQuery>();
 let ownedInventory:LiveDocumentEntities|undefined;
 const owns=(key:string)=>{ownedInventory??=api.liveDocumentEntities?.(panel.ownerKey);return ownedInventory?.owns(key)??false;};
 createEffect(()=>{if(['live','blend'].includes(searchScope())&&!live()&&api.liveDocumentEntities)untrack(()=>setLive(new LiveEntityQuery(api.liveDocumentEntities!(panel.ownerKey),service)));});
 const localRows=createMemo(()=>live()?.snapshotValue().rows.map(r=>({id:r.id,fallbackName:r.fallbackName,documentMentions:r.occurrences}))??[],undefined,{equals:(a,b)=>a.length===b.length&&a.every((r,i)=>r.id===b[i].id&&r.fallbackName===b[i].fallbackName&&r.documentMentions===b[i].documentMentions)});
 const documentRows=createMemo(()=>searchScope()==='live'?live()?.rows(query(),stream(),match())??[]:[]);
 const documentRowsById=createMemo(()=>new Map(documentRows().map(row=>[row.id,row])));
 onCleanup(()=>{live()?.dispose();ownedInventory?.dispose();});
 if(target().workstation)void service?.historyScope?.().then(key=>{if(alive)setUsageScope(key);}).catch(()=>{});
 const used=(entity:{id:string;name:string})=>{if(usageScope())recordUsage(usageScope()!,entity);};
 const [attempt,setAttempt]=createSignal<{id:string;operationId:string;name:string}>();
 const newCandidates=(data=target())=>new EntityCandidates(api,{...panel,data},undefined,{owns});
 const [candidates,setCandidates]=createSignal(newCandidates());
 const preview=api.decorations(`entity-selection:${panel.key}`);
 createEffect(()=>{const ranges=activity()?.visible&&valid()?target().entityRanges:undefined;untrack(()=>{if(ranges)preview.ranges(ranges,{type:'editor/panel-selection',fill:'#f2c767'});else preview.clear();});});
 onCleanup(()=>{target().workstation?.scry?.cancel();alive=false;service?.dispose();preview.dispose();candidates().dispose();});
 createEffect(()=>{if(!completion&&target().workstation?.scry&&(activity()&&!activity()!.visible||owner&&!owner.manager.registry.windows[owner.windowId]?.active))untrack(()=>target().workstation?.scry?.cancel());});
 let root!:HTMLDivElement,input!:HTMLInputElement;
 const width=Math.min(560,Math.max(1,window.innerWidth-24));
 const [position,setPosition]=createSignal({x:Math.max(8,(window.innerWidth-width)/2),y:Math.max(8,window.innerHeight*.06)});
 const [size,setSize]=createSignal<FloatingWindowSize>();
 const floating=completion?undefined:createManagedFloatingTool({element:()=>root,initial:{...position(),width,height:Math.min(480,window.innerHeight-32)},minimum:{width:360,height:320}});
 const resize=floating?.resize??createFloatingWindowResize({element:()=>root,size:()=>size()??{width:root?.offsetWidth||width,height:root?.offsetHeight||window.innerHeight*.76},minimum:{width:360,height:320},onCommit:setSize});
 let drag:{id:number;x:number;y:number;left:number;top:number}|undefined;
 const close=()=>panel.close();
 const canClose=()=>acquisitionGuard()&&(editing||!creating()&&!working()&&(!attempt()||!!created()||window.confirm('Entity creation outcome is unconfirmed. Close this tool and discard its retry receipt?')))&&(!completion||completion.session.host.canDismiss?.()!==false);
 const run=async(action:()=>Promise<void>)=>{if(working())return;setWorking(true);setError('');try{await action();}catch(e){if(alive)setError(String(e));}finally{if(alive)setWorking(false);}};
 const bind=(entity:CanonicalEntity,replace=false)=>{
  if(candidates().state.enabled&&!replace){
   candidates().nominate(entity);editing=true;try{const scry=target().workstation?.scry;if(scry)scry.batch(()=>candidates().bind(),entity);else candidates().bind();used(entity);panel.close(false);}finally{editing=false;}return;
  }
  const scry=target().workstation?.scry;
  if(scry){if(!scry.valid())throw Error('The Scry source changed.');editing=true;try{scry.commit(entity);used(entity);panel.close(false);return;}finally{editing=false;}}
  if(!target().entityRanges.length)throw Error('Enable Search additional occurrences and review mentions, or select text first.');
  if(!valid())throw Error('The original target is stale. Bind to a new selection.');
  editing=true;try{
   const invocation=target().workstation?.invocation;
   if(invocation){if(!api.replaceAndAnnotate)throw Error('Atomic completion unavailable');const label=replace?entity.name:target().entityQuery||entity.name;api.replaceAndAnnotate(invocation,label,'codex/entity-reference',entity.id,{entityId:entity.id,entityName:entity.name},target().entityRevision);used(entity);panel.close(false);api.focusRange?.({...invocation,version:api.text(invocation.nodeKey)!.version,end:invocation.start+[...label].length},api.revision());return;}
   if(replace){if(target().entityRanges.length!==1||!api.replaceAndAnnotate)throw Error('Replace & Link requires one plain-text Block');api.replaceAndAnnotate(target().entityRanges[0],entity.name,'codex/entity-reference',entity.id,{entityId:entity.id,entityName:entity.name},target().entityRevision);}
   else chooseEntity(api,target(),entity);
   used(entity);setOutcome('Created and linked');
   if(replace&&api.focusRange){const r=target().entityRanges[0],next=snapshotTarget([{nodeKey:r.nodeKey,start:r.start,end:r.start+[...entity.name].length}],api);panel.close(false);api.focusRange(next.entityRanges[0],next.entityRevision);}else close();
  }finally{editing=false;}
 };
 const select=(id:string,replace=false,prepareOnly=false)=>void run(async()=>{
  result()?.current();if(!service)throw Error('Canonical Entity service unavailable');const entity=await service.get(id);if(!entity)throw Error('Entity unresolved in this vault');if(!alive)return;
  if(prepareOnly){session.prepare(entity);candidates().nominate(entity);return;}
  bind(entity,replace);
 });
 const showDetails=(id:string)=>void run(async()=>{const e=await service?.get(id);if(!e)throw Error('Entity unavailable');if(alive){setDetails(e);setRename(e.name);setAliasEdit(undefined);setAliasName(target().workstation?target().entityQuery:'');session.view('details');}});
 const create=()=>void run(async()=>{
  if(!service)throw Error('Canonical Entity service unavailable');
  if(!attempt()&&(!valid()||api.revision()!==target().entityRevision))throw Error('Select a valid target before creating an Entity');
  if(!canonicalName().trim())throw Error('Enter a canonical name');
  const retrying=!!attempt();
  if(!attempt())setAttempt({id:crypto.randomUUID(),operationId:crypto.randomUUID(),name:canonicalName()});
  setCreating(true);setOutcome('Creating Entity…');
  try{
   const e=await service.create(attempt()!);if(!alive)return;
   setCreated(e);setDetails(e);setRename(e.name);setOutcome('Created but not linked');
   try{bind(e);}catch(reason){setValid(false);setError(`${e.name} was created, but the original text could no longer be linked. ${String(reason)}`);panel.allowDocumentInput(true);}
  }catch(error){if(alive){if(!retrying&&(error as any)?.entityCreationOutcome==='not-created'){setOutcome('Not created');setAttempt(undefined);}else setOutcome('Creation outcome unconfirmed');}throw error;}finally{if(alive)setCreating(false);}
 });
 const recover=()=>void run(async()=>{
  const e=created();if(!e)throw Error('No confirmed Entity creation to recover');
  if(!await service?.get(e.id))throw Error('Created Entity is unavailable in the original vault');if(!alive)return;
  const ranges=api.recoverySelection?.(panel.ownerKey)??api.selection(panel.ownerKey);
  const snapshot=snapshotTarget(ranges,api);editing=true;try{chooseEntity(api,snapshot,e);if(api.focusRange){panel.close(false);api.focusRange(snapshot.entityRanges[0],api.revision());}else close();}finally{editing=false;}
 });
 const adjust=(edge:'start'|'end',direction:number,word:boolean)=>{
  try{
   if(completion?.session.source.brackets){completion.adjust(edge,direction as -1|1,word);return;}
   if(target().workstation?.scry)throw Error('Adjust Scry boundaries in the compact interaction before opening this tool.');
   if(!valid()||target().entityRanges.length!==1||api.revision()!==target().entityRevision)throw Error('Range adjustment requires one current plain-text Block');
   const r=target().entityRanges[0],node=api.text(r.nodeKey)!;if(node.cells.some(c=>!c.plain))throw Error('Range adjustment cannot cross inline objects');
   const text=node.cells.map(c=>c.text).join(''),boundaries=word?wordBoundaries(text):graphemeBoundaries(text);
   const next=direction<0?[...boundaries].reverse().find(i=>i<r[edge]):boundaries.find(i=>i>r[edge]);if(next===undefined)return;
   const range={...r,[edge]:next};if(range.end<=range.start)return;
   candidates().dispose();setTarget(snapshotTarget([range],api));setCandidates(newCandidates());setError('');
  }catch(e){setError(String(e));}
 };
 let refreshed=0;
 createEffect(()=>{
  if(activity()&&!activity()!.visible)return;
  if(composing())return;
  const refresh=retry()!==refreshed;refreshed=retry();
  const scope=searchScope();if(scope==='live'){setBusy(false);setResult(undefined);setCurrent(0);setPage(0);return;}
  const history=usageScope(),local=scope==='blend'?localRows():[];
  const options:EntityResolutionQuery={query:query(),stream:stream(),match:match(),scope:scope==='document'?'document':'vault',...(refresh?{refresh:true}:{})};
  const matches=(name:string)=>options.match==='exact'?name.toLocaleLowerCase()===options.query.toLocaleLowerCase():name.toLocaleLowerCase().includes(options.query.toLocaleLowerCase());
  const recent=history?usage(history,scope==='day'?1:scope==='week'?7:undefined):[];
  const localCandidates=[...(scope==='blend'?local.map(r=>({id:r.id,name:r.fallbackName??r.id,evidence:[{kind:'local',text:`${r.documentMentions} committed Document mentions`}]})):[]),...(['blend','session','day','week'].includes(scope)?recent.map(r=>({id:r.id,name:r.name,evidence:[{kind:'recent',text:scope==='day'?'Used in last 24 hours':scope==='week'?'Used in last 7 days':'Used this session'}]})):[])].filter(r=>matches(r.name));
  const controller=new AbortController();let active=true;setBusy(true);setResult(undefined);setCurrent(0);setPage(0);
  const publish=(r:EntityResolution)=>{if(active){const merged=new Map(localCandidates.map(c=>[c.id,c]));for(const c of r.candidates)merged.set(c.id,c);setResult({...r,candidates:[...merged.values()]});if(!attempt())setError('');}};
  const timer=setTimeout(async()=>{try{if(['session','day','week'].includes(scope)||scope==='blend'&&!options.query.trim()){publish({candidates:[],complete:true,diagnostics:[],current:()=>controller.signal.throwIfAborted()});return;}if(!service)throw Error('Open a bound native Document in a Flint vault to use canonical Entities.');publish(await service.search(options,controller.signal,publish));}catch(e){if(active)setError(String(e));}finally{if(active)setBusy(false);}},200);
  onCleanup(()=>{active=false;clearTimeout(timer);controller.abort();});
 });
 onMount(()=>{
  const initial=target().workstation;
  if(initial?.review){candidates().configure({scope:'document'});candidates().enable(false);session.view('review');}
  if(initial?.createName){setCanonicalName(initial.createName);setCreateForm(true);session.view('create');}
  if(initial?.authority)session.view('authority');
  if(initial?.entityId){if(initial.review)select(initial.entityId,false,true);else void showDetails(initial.entityId);}
  const entryFocus=()=>presenters?.()?.entityEntry==='query'?editQuery():commandFocus();
  const mount=panel.mountWidget(root,entryFocus);if(!completion?.session.source.inline)entryFocus();
  panel.allowDocumentInput(true);
  const invalidate=()=>{if(editing)return;setValid(false);setError('The original target changed. Select a new target before linking.');};
  let stop:()=>void;
  if(completion)stop=()=>{};
  else if(api.watchContent)stop=api.watchContent(change=>{
   if(editing)return;
   if(target().entityRanges.some(r=>change.keys.has(r.contentKey)))invalidate();
   else target().entityRevision=change.revision;
  });
  else if(api.watchTarget) stop=api.watchTarget(panel.ownerKey,target().workstation?.invocation?[target().workstation!.invocation!]:target().entityRanges,change=>{
   if(editing)return;
   // Preserve source ranges and identity. This does not retarget or repaint.
   if(change.valid&&valid()) target().entityRevision=change.revision;
   else invalidate();
  });
  else stop=api.beforeChange(invalidate);
  const guard=panel.guardClose?.(canClose);
  onCleanup(()=>guard?.());
  onCleanup(()=>{mount();stop();});
 });
 completion?.controls({canClose,busy:()=>working()||creating(),run:id=>{if(id==='createFromQuery'){createFromQuery();return true;}if(id==='toggleMode'){toggleMode();return true;}if(id==='close'){close();return true;}if(id==='review'){expand();return true;}if(id==='create'){createFormOpen();return true;}if(id==='authority'){setAuthority(true);session.view('authority');return true;}if(id==='next'||id==='previous'){const n=pageRows().length;if(n)navigate((current()+(id==='next'?1:-1)+n)%n);return true;}if(id==='choose'){const row=pageRows()[current()];if(row&&!working())select(row.id);return true;}return false;}});
 onCleanup(()=>completion?.controls(undefined));
 const rows=createMemo(()=>searchScope()==='live'?documentRows():result()?.candidates??[]);
 const pageRows=createMemo(()=>rows().slice(page()*10,page()*10+10));
 let previousRows=rows();
 createEffect(()=>{const next=rows();untrack(()=>{
  const selected=previousRows[page()*10+current()]?.id, index=selected?next.findIndex(row=>row.id===selected):-1;
  setPage(index<0?0:Math.floor(index/10));setCurrent(index<0?0:index%10);previousRows=next;
 });});
 let list!:HTMLDivElement,body!:HTMLDivElement;
 let revealFrame:number|undefined;
 // Explicit navigation only: read the viewport and selected row once per frame.
 // Scroll this body directly so the surrounding Document keeps its position.
 const navigate=(index:number)=>{
  setCurrent(index);
  if(revealFrame!==undefined)return;
  revealFrame=requestAnimationFrame(()=>{
   revealFrame=undefined;
   if(!alive||session.state.view!=='results'||!body?.isConnected)return;
   const selected=list?.children.item(current());if(!(selected instanceof HTMLElement))return;
   const viewport=body.getBoundingClientRect(),row=selected.getBoundingClientRect();
   const height=body.offsetHeight,visibleHeight=body.clientHeight,scale=height?viewport.height/height:1;
   if(!scale||!visibleHeight)return;
   const top=viewport.top+body.clientTop*scale,bottom=top+visibleHeight*scale;
   const delta=row.top<top?row.top-top:row.bottom>bottom?Math.min(row.bottom-bottom,row.top-top):0;
   if(delta)body.scrollTop+=delta/scale;
  });
 };
 onCleanup(()=>{if(revealFrame!==undefined)cancelAnimationFrame(revealFrame);});
 const commandFocus=()=>{session.mode('command');queueMicrotask(()=>{if(alive)list?.focus({preventScroll:true});});};
 const editQuery=()=>{session.mode('edit');input.focus();input.select();};
 const toggleMode=()=>{
  const command=session.state.mode==='command'&&root.contains(document.activeElement);
  session.view('results');
  if(command){session.mode('edit');input.focus({preventScroll:true});}
  else commandFocus();
 };
 const accepted=()=>candidates().state.enabled?candidates().acceptedCount():valid()?target().entityRanges.length?1:target().workstation?.scry?1:0:0;
 const expand=()=>{
  try{
   setExpansion(true);
   if(session.origin.entityRanges.length>1)throw Error('The original crosses Blocks. Prepare an entity and review a Block-local mention expression.');
   if(!session.origin.entityQuery)throw Error('Select source text before expanding it.');
   if(session.origin.entityRanges.some(r=>!owns(r.contentKey)))throw Error('The original selection is not owned by this Document.');
   api.validateRanges?.(session.origin.entityRanges);
   if(candidates().state.enabled&&candidates().state.query===session.origin.entityQuery){candidates().selectAll();session.view('review');return;}
   candidates().dispose();setCandidates(newCandidates({...target(),...session.origin,entityRanges:session.origin.entityRanges.map(r=>({...r})),entityRevision:api.revision()}));
   const words=/^[\p{L}\p{N}_].*[\p{L}\p{N}_]$|^[\p{L}\p{N}_]$/u.test(session.origin.entityQuery);
   candidates().configure({query:session.origin.entityQuery,scope:'document',options:{matchCase:false,wholeWords:words,regex:false}});
   if(session.state.prepared)candidates().nominate(session.state.prepared);
   candidates().enable();session.view('review');setError('');
  }catch(e){setError(String(e));}
 };
 const scopes: LerSource[]=completion?['blend','live','vault','document','session','day','week']:['vault','live','document'];
 const cycleField=()=>{const fields=['all','name','alias','mention'] as const;setStream(fields[(fields.indexOf(stream())+1)%fields.length]);};
 const cycleScope=()=>setScope(scopes[(scopes.indexOf(searchScope())+1)%scopes.length]);
 const goBack=()=>{if(session.state.view!=='results'){session.view('results');commandFocus();}else if(session.state.mode==='edit')commandFocus();else close();};
 const reset=()=>{candidates().disable();try{api.validateRanges?.(session.origin.entityRanges);setTarget({...target(),...session.origin,entityRanges:session.origin.entityRanges.map(r=>({...r})),entityRevision:api.revision()});setValid(true);}catch{setValid(false);}session.view('results');commandFocus();};
 const adoptSelection=()=>{try{const data=snapshotTarget(api.recoverySelection?.(panel.ownerKey)??api.selection(panel.ownerKey),api);candidates().dispose();setTarget(data);setCandidates(newCandidates(data));setValid(true);setError('');session.view('results');commandFocus();}catch(e){setError(String(e));}};
 const createFormOpen=()=>{setCreateForm(true);if(!attempt())setCanonicalName(query().trim()||target().entityQuery);session.view('create');};
 const createFromQuery=()=>{
  if(working()||creating()||composing())return;
  if(created()){setCreateForm(true);session.view('create');setError('This Entity was already created. Use Bind to new selection to finish linking it.');return;}
  const name=query().trim();
  if(attempt()){
   setCreateForm(true);session.view('create');
   if(name!==attempt()!.name){setError(`Creation of “${attempt()!.name}” is unconfirmed. Retry that creation before starting another.`);return;}
  }else{
   if(!name){setError('Enter an entity name in the query field.');return;}
   try{
    const source=target(),scry=source.workstation?.scry;
    if(scry){if(!scry.valid()||!source.entityQuery.trim())throw Error('Select or type source text before creating an Entity.');}
    else {if(!source.entityRanges.length)throw Error('Select source text before creating an Entity.');api.validateRanges?.(source.entityRanges);}
   }catch(e){setError(String(e));return;}
   setCanonicalName(name);setCreateForm(true);session.view('create');
  }
  create();
 };
 const refresh=()=>{if(searchScope()==='live')live()?.refresh();else setRetry(n=>n+1);};
 const keys=(e:KeyboardEvent)=>{
  if(e.defaultPrevented||e.isComposing||e.key==='Process'||e.key==='Dead'||e.getModifierState?.('AltGraph'))return;
  const element=e.target as Element,field=element.closest('input,textarea,select,[contenteditable=true]');
  if(element.closest('[data-window-move],[data-scry-geometry],.reactive-entity-search__resize'))return;
  e.stopPropagation();
  if(api.bindings.dispatch(e,['entity-search/mode','entity-search/create'],id=>{
   if(id==='entity.toggleMode'){if(!e.repeat)toggleMode();return true;}
   if(id==='entity.createFromQuery'){if(!e.repeat)createFromQuery();return true;}
   return false;
  }))return;
  if(e.key==='Escape'){e.preventDefault();goBack();return;}
  if(field){
   if(e.target===input&&!e.altKey&&!e.ctrlKey&&!e.metaKey){
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();const row=pageRows()[current()];if(row)select(row.id);}
    else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const n=pageRows().length;if(n)navigate((current()+(e.key==='ArrowDown'?1:-1)+n)%n);}
   }
   return;
  }
  const candidateRow=element.closest<HTMLElement>('[data-candidate-row]');
  if(candidateRow&&!element.closest('button')&&api.bindings.dispatch(e,['entity-search/candidates'],id=>{
   const rows=[...root.querySelectorAll<HTMLElement>('[data-candidate-row]')],index=rows.indexOf(candidateRow);
   if(id==='entity.candidates.toggle'){const row=candidates().state.rows.find(r=>r.key===candidateRow.dataset.candidateKey);if(row)candidates().toggle(row.key,!row.checked);return true;}
   if(id==='entity.candidates.next'||id==='entity.candidates.previous'){rows[(index+(id.endsWith('next')?1:-1)+rows.length)%rows.length]?.focus();return true;}return false;
  }))return;
  if(element.closest('button'))return;
  const row=pageRows()[current()];
  if(api.bindings.dispatch(e,['entity-search'],id=>{
   if(id==='entity.candidates.selectAll'){expand();return true;}
   if(id==='entity.candidates.open'){review();return true;}
   if(id==='entity.clear'){setQuery('');return true;}
   if(id==='entity.editQuery'){editQuery();return true;}
   if(id==='entity.prepare'){if(row)select(row.id,false,true);return true;}
   if(id==='entity.inspect'){if(row)showDetails(row.id);return true;}
   if(id==='entity.field'){cycleField();return true;}
   if(id==='entity.match'){setMatch(match()==='exact'?'partial':'exact');return true;}
   if(id==='entity.scope'){cycleScope();return true;}
   if(id==='entity.commands'){session.view('commands');return true;}
   if(id==='entity.next'||id==='entity.previous'){const n=pageRows().length;if(n)navigate((current()+(id==='entity.next'?1:-1)+n)%n);return true;}
   if(id==='entity.choose'){if(row)select(row.id);return true;}
   return false;
  }))return;
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key==='|'){e.preventDefault();setError('Composition is reserved for Feature Two. Use Prepare entity to retain a target.');return;}
  if(e.key==='Home'||e.key==='End'){e.preventDefault();navigate(e.key==='Home'?0:Math.max(0,pageRows().length-1));return;}
  if(/^[0-9]$/.test(e.key)){e.preventDefault();const indexed=pageRows()[Number(e.key)];if(indexed)select(indexed.id);return;}
  if(e.key==='ArrowLeft'&&session.state.view!=='results'){e.preventDefault();goBack();return;}
  if(e.key.length===1){
   // Handoff before the browser's default insertion: the first character and
   // later native input share the real text input's editing/undo history.
   session.view('results');session.mode('edit');input.focus();input.select();
  }
 };
 const GraphicalAdvanced=()=> <>
   <Show when={session.state.view==='commands'}><div class="ler-command-list">
    <button disabled={!pageRows()[current()]||working()} onClick={()=>select(pageRows()[current()].id,false,true)}>Prepare entity</button><button onClick={expand}>Expand original selection</button><button onClick={review}>Review other mention text</button><button onClick={createFormOpen}>+ Create Entity</button><button onClick={()=>session.view('source')}>Source range controls</button><button onClick={()=>{setScope('live');session.view('results');commandFocus();}}>Browse Document Entities</button><button onClick={reset}>Reset to original targets</button>
    <Show when={pageRows()[current()]&&!target().workstation?.scry}><button disabled={!valid()||target().entityRanges.length!==1||candidates().state.enabled} onClick={()=>select(pageRows()[current()].id,true)}>Replace &amp; Link</button></Show>
    <Show when={completion}><button onClick={()=>{if(usageScope())clearUsage(usageScope()!);setRetry(n=>n+1);}}>Clear usage history</button><Show when={service}><button onClick={()=>{setAuthority(true);session.view('authority');}}>External authorities…</button></Show></Show>
    <p>Enter links · Shift+Enter prepares · → inspects · F2 edits</p><p>{api.bindings.label('entity.toggleMode')} toggles Query / Command mode</p><p>{api.bindings.label('entity.createFromQuery')} creates from the query and links the source</p><p>* toggles match · @ cycles fields · ~ cycles scopes · / commands</p><p>Numbers 0–9 link in Command mode. Other text starts query editing. | is reserved for future composition.</p>
   </div></Show>

   <Show when={session.state.view==='source'}>
    <p>Current target: {target().entityQuery}</p>
   <details class="entity-boundaries"><summary>Source range controls and shortcuts</summary><For each={['start','end'] as const}>{edge=><For each={[false,true]}>{word=><div><span>{edge==='start'?'Start':'End'} · {word?'word':'character'}: </span><For each={[-1,1] as const}>{d=><button disabled={!valid()||working()} onPointerDown={e=>e.preventDefault()} onClick={()=>adjust(edge,d,word)}>{edge} {d<0?'back':'forward'} {word?'word':'character'}</button>}</For><Show when={completion?.session.source.brackets}><kbd>{edge==='end'&&word?'Alt/Option+←/→ (Ctrl+←/→)':`Ctrl${edge==='start'?'+Alt':''}${word?'':'+Shift'}+←/→`}</kbd></Show></div>}</For>}</For></details>

    <Show when={completion?.session.state.queryMode==='independent'}><button onClick={()=>completion?.session.follow()}>Resume following source</button></Show>
    <Show when={target().workstation?.scry?.keepLiteral}><button disabled={working()||creating()} onClick={()=>{target().workstation?.scry?.keepLiteral?.();close();}}>Keep literal brackets</button></Show>
   </Show>
   <Show when={session.state.view==='create'&&createForm()}><section aria-label="Create canonical Entity"><label>Canonical name<input aria-label="Canonical name" value={canonicalName()} disabled={!!attempt()} maxLength={1000} onInput={e=>setCanonicalName(e.currentTarget.value)}/></label><button disabled={working()||!!created()||(!valid()&&!attempt())} onClick={create}>{creating()?'Creating…':attempt()?'Retry creation and link':'Create and link'}</button><p role="status">{outcome()}</p><small>Creation is independent of linking. Cancel after dispatch cannot undo creation.</small></section></Show>
   <Show when={created()&&!valid()}><button onPointerDown={e=>e.preventDefault()} disabled={working()} onClick={recover}>Bind to new selection</button></Show>
   <Show when={session.state.view==='details'&&details()}>{entity=><section aria-label="Canonical Entity details"><strong>{entity().displayName??entity().name}</strong><small>{entity().id}</small><Show when={live()?.snapshotValue().rows.find(r=>r.id===entity().id)}>{row=><div><p>{row().occurrences} linked occurrences · {row().blockReferences} block references</p><For each={row().forms}>{form=><p>{form}</p>}</For></div>}</Show>
    <label>Preferred name<input aria-label="Preferred name" value={rename()} onInput={e=>setRename(e.currentTarget.value)}/></label><button disabled={working()} onClick={()=>void run(async()=>{setDetails(await service!.rename({id:entity().id,name:rename(),expected:entity().revision,operationId:crypto.randomUUID()}));live()?.refresh();setRetry(n=>n+1);})}>Update name</button>
    <For each={entity().aliases}>{a=><div>{a.name} <small>{a.origin}</small><button onClick={()=>{setAliasEdit(a);setAliasName(a.name);}}>Edit alias</button><button disabled={working()} onClick={()=>void run(async()=>{setDetails(await service!.alias({op:'alias-remove',id:a.id,entityId:entity().id,expected:a.revision,operationId:crypto.randomUUID()}));live()?.refresh();setRetry(n=>n+1);})}>Remove alias</button></div>}</For>
    <label>Explicit alias<input aria-label="Explicit alias" value={aliasName()} onInput={e=>setAliasName(e.currentTarget.value)}/></label><button disabled={working()||!aliasName().trim()} onClick={()=>void run(async()=>{const a=aliasEdit();setDetails(await service!.alias({op:a?'alias-update':'alias-add',id:a?.id??crypto.randomUUID(),entityId:entity().id,name:aliasName(),expected:a?.revision,operationId:crypto.randomUUID()}));setAliasEdit(undefined);setAliasName('');live()?.refresh();setRetry(n=>n+1);})}>{aliasEdit()?'Update alias':'Add alias'}</button><button onClick={()=>{setAliasEdit(undefined);setAliasName('');}}>Clear alias input</button>
   </section>}</Show>

   <Show when={session.state.view==='review'}><Show when={candidates()} keyed>{candidate=><EntityCandidatesPanel compact expansion={expansion()} session={candidate} bind={()=>{const entity=session.state.prepared;if(entity)select(entity.id);}}/>}</Show></Show>
   <Show when={session.state.view==='authority'&&authority()&&service}><AuthorityPanel service={service!} query={query()} guard={fn=>acquisitionGuard=fn} imported={e=>{setCreated(e);setDetails(e);setRename(e.name);session.prepare(e);setOutcome('Created but not linked');}}/></Show>
 </>;
 const Graphical=()=> <div ref={root} class="reactive-entity-search ler-instrument" classList={{'reactive-entity-search--embedded':!!completion}} role="dialog" aria-modal="false" aria-label="Link Entity Reference" data-native-context-menu onKeyDown={keys}
  style={completion?{}:{left:`${(floating?.rectangle()??position()).x}px`,top:`${(floating?.rectangle()??position()).y}px`,width:`${floating?.rectangle().width??(resize.preview()??size())?.width??width}px`,height:`${floating?.rectangle().height??(resize.preview()??size())?.height??480}px`}}>
  <Show when={!completion}><header class="reactive-entity-search__header" data-window-move tabIndex={floating?0:undefined} onKeyDown={e=>{if(floating&&e.target===e.currentTarget){if(!floating.mode()&&e.key.startsWith("Arrow"))floating.keyboard("move");floating.keyDown(e);}}} onBlur={()=>floating?.cancel()} onLostPointerCapture={e=>floating?.cancelPointer(e)} onPointerDown={e=>{if(e.button!==0||(e.target as Element).closest('button'))return;if(floating){floating.beginMove(e);return;}drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:position().x,top:position().y};e.currentTarget.setPointerCapture?.(e.pointerId);e.preventDefault();}} onPointerMove={e=>{if(floating){floating.movePointer(e);return;}if(drag?.id===e.pointerId)setPosition({x:Math.max(8,Math.min(window.innerWidth-80,drag.left+e.clientX-drag.x)),y:Math.max(8,Math.min(window.innerHeight-60,drag.top+e.clientY-drag.y))});}} onPointerUp={e=>floating?floating.endPointer(e):drag=undefined} onPointerCancel={e=>floating?floating.cancelPointer(e):drag=undefined}>
   <strong>Link Entity Reference</strong><button onClick={close}>Cancel</button>
  </header></Show>

  <div class="ler-context" aria-label="Linking context">
   <span title={session.origin.entityQuery}>Original: <strong data-entity-target>{session.origin.entityQuery||'(no selection)'}</strong></span>
   <span aria-live="polite">{accepted()} accepted range{accepted()===1?'':'s'}</span>
   <Show when={session.state.prepared}>{entity=><span class="ler-prepared" data-entity-id={entity().id} title={entity().id} aria-label={`Prepared entity: ${entity().name}`}><span aria-hidden="true">◈</span> {entity().name}<button aria-label="Clear prepared entity" onClick={()=>{session.prepare();candidates().nominate();}}>×</button></span>}</Show>
   <Show when={session.state.view==='review'&&session.state.prepared}><button disabled={working()||!candidates().canBind()} aria-label="Link accepted ranges" onClick={()=>select(session.state.prepared!.id)}>Link {accepted()}</button></Show>
   <Show when={!valid()}><span role="status">Source changed.</span><button onPointerDown={e=>e.preventDefault()} onClick={adoptSelection}>Use current selection</button></Show>
  </div>
  <div class="ler-query"><input ref={input} aria-label="Search entities" role="combobox" aria-expanded={session.state.view==='results'} aria-controls={`${panel.key}-results`} aria-activedescendant={pageRows()[current()]?`${panel.key}-result-${current()}`:undefined} aria-autocomplete="list" maxLength={1000} value={query()} onFocus={()=>session.mode('edit')} onInput={e=>{setQuery(e.currentTarget.value);if(!e.isComposing&&searchScope()!=='live')completion?.session.input(e.currentTarget.value);}} onCompositionStart={()=>setComposing(true)} onCompositionEnd={e=>{setComposing(false);setQuery(e.currentTarget.value);if(searchScope()!=='live')completion?.session.input(e.currentTarget.value);}}/><button onClick={editQuery}>Edit</button><button title={`Query / Command mode: ${api.bindings.label('entity.toggleMode')}`} onClick={commandFocus}>{session.state.mode==='edit'?'Editing query':'Commands'}</button></div>
  <div class="ler-modes">
   <label>Scope<select aria-label="Entity scope" value={searchScope()} onChange={e=>setScope(e.currentTarget.value as LerSource)}><Show when={completion}><option value="blend">Local blend</option><option value="session">This session</option><option value="day">Last 24 hours</option><option value="week">Last 7 days</option></Show><option value="vault">Vault</option><option value="live">Document Entities</option><option value="document">Saved document</option></select></label>
   <label>Field<select aria-label="Entity stream" value={stream()} onChange={e=>setStream(e.currentTarget.value as any)}><option value="all">All</option><option value="name">Name</option><option value="alias">Alias</option><option value="mention">Mention</option></select></label>
   <label>Match<select aria-label="Entity match" value={match()} onChange={e=>setMatch(e.currentTarget.value as any)}><option value="partial">Partial</option><option value="exact">Exact</option></select></label>
   <button aria-label="Refresh candidates" onClick={refresh}>↻</button><button aria-label="Commands and help" onClick={()=>session.view(session.state.view==='commands'?'results':'commands')}>/</button>
  </div>
  <Show when={session.state.view!=='results'}><button class="ler-back" onClick={()=>{session.view('results');commandFocus();}}>← Results</button></Show>
  <div ref={body} class="ler-body">
   <Show when={session.state.view==='results'}>
    <div ref={list} id={`${panel.key}-results`} role="listbox" aria-label="Entity results" tabIndex={0} aria-activedescendant={pageRows()[current()]?`${panel.key}-result-${current()}`:undefined} onFocus={()=>session.mode('command')}>
     <For each={pageRows()}>{(row,i)=><div id={`${panel.key}-result-${i()}`} role="option" aria-selected={current()===i()} aria-label={`Select ${row.name}`} class="ler-result" classList={{current:current()===i()}} onPointerDown={e=>e.preventDefault()} onClick={()=>{setCurrent(i());select(row.id);}}><span class="ler-index">{i()}</span><span class="ler-name">{row.name}<Show when={searchScope()==='live'}><small>{row.evidence[0]?.text}{(documentRowsById().get(row.id)?.forms.length??0)>3?` · +${documentRowsById().get(row.id)!.forms.length-3} forms`:""}</small></Show></span><Show when={searchScope()!=='live'}><small class="ler-evidence" title={row.evidence[0]?.text}>{row.evidence[0]?.kind}</small></Show><Show when={row.localMentions!==undefined}><span title="Linked occurrences">{row.localMentions}</span></Show></div>}</For>
    </div>
    <div class="ler-actions"><button disabled={!pageRows()[current()]||working()} onClick={()=>select(pageRows()[current()].id)}>Link {accepted()>1?accepted():''}</button><button disabled={!pageRows()[current()]||working()} onClick={()=>select(pageRows()[current()].id,false,true)}>Prepare entity</button><button disabled={!pageRows()[current()]||working()} onClick={()=>showDetails(pageRows()[current()].id)}>Details / aliases</button></div>
   </Show>
   <GraphicalAdvanced/>
  </div>
  <Show when={error()}><p role="alert" class="ler-error">{error()}</p></Show>
  <div class="ler-status" role="status"><Show when={searchScope()==='live'} fallback={<>{busy()?'Resolving…':`${rows().length} candidates`}{result()&&!result()!.complete?' · incomplete coverage':''}</>}>
   {live()?.snapshotValue().rows.length??0} entities · {live()?.snapshotValue().rows.reduce((n,r)=>n+r.occurrences,0)??0} linked occurrences · {rows().length} shown{live()?.busy()?' · reading names':live()?.incomplete()?' · some names/aliases unavailable':''}
  </Show></div>
  <Show when={searchScope()==='live'&&live()?.snapshotValue().invalid}><small>{live()?.snapshotValue().invalid} invalid references excluded</small></Show>
  <Show when={searchScope()!=='live'&&(stream()==='all'||stream()==='mention'||searchScope()==='document')}><details class="ler-coverage"><summary>Saved mention coverage</summary><p>Mention matches use saved text; unsaved edits are not included.</p><For each={result()?.diagnostics??[]}>{message=><p>{message}</p>}</For></details></Show>
  <footer><button disabled={!page()} onClick={()=>{setPage(n=>n-1);navigate(0);}}>Previous page</button><span>Page {page()+1}</span><button disabled={(page()+1)*10>=rows().length} onClick={()=>{setPage(n=>n+1);navigate(0);}}>Next page</button><span>Enter links {accepted()} · ⇧Enter prepares</span></footer>
  <Show when={!completion}><FloatingWindowResizeHandle controller={resize} class="reactive-entity-search__resize" label="Resize Entity Search window"/></Show>
 </div>;
 return {Graphical,api,panel,session,completion,target,query,setQuery,stream,setStream,match,setMatch,searchScope,setScope,scopes,
 rows,pageRows,current,page,setPage,navigate,busy,working,valid,error,result,close,keys,select,showDetails,review,expand,refresh,reset,adoptSelection,
 createFormOpen,create,canonicalName,setCanonicalName,attempt,created,creating,outcome,recover,accepted,commandFocus,editQuery,setComposing,
 refs:{root:(el:HTMLDivElement)=>root=el,input:(el:HTMLInputElement)=>input=el,list:(el:HTMLDivElement)=>list=el,body:(el:HTMLDivElement)=>body=el},
 // Less frequent operations keep their existing form controls and validation.
 details:()=>details(),
 advanced:GraphicalAdvanced};

}
export function snapshotTarget(ranges:readonly {nodeKey:string;start:number;end:number}[],api:AnnotationCapabilities):EntitySearchData {
 const valid=ranges.filter(r=>r.end>r.start);if(!valid.length)throw Error('Select nonempty text in this Document');
 const snapshots:SearchRange[]=valid.map(r=>{const n=api.text(r.nodeKey);if(!n||r.start<0||r.end>n.cells.length)throw Error('Selection unavailable');const b=graphemeBoundaries(n.cells.map(c=>c.text).join(''));if(!b.includes(r.start)||!b.includes(r.end)||n.cells.slice(r.start,r.end).some(c=>!c.plain))throw Error('Selection splits a grapheme or includes inline media');return {...r,contentKey:n.contentKey,placementKey:n.placementKey,version:n.version,coordinate:'cell'};});
 return {entityRanges:snapshots,entityRevision:api.revision(),entityQuery:snapshots.map(r=>api.text(r.nodeKey)!.cells.slice(r.start,r.end).map(c=>c.text).join('')).join(' ')};
}
function wordBoundaries(text:string){const graphemes=new Set(graphemeBoundaries(text));let at=0;const out=[0];for(const part of new Intl.Segmenter(undefined,{granularity:'word'}).segment(text)){at+=[...part.segment].length;if(graphemes.has(at))out.push(at);}return out;}

export type LerModel=ReturnType<typeof createLerModel>;
export function LerSearch(props:Parameters<typeof createLerModel>[0]) {
 const model=createLerModel(props),views=useInstrumentPresentations();
 return <Dynamic component={views?.()?.ler??model.Graphical} model={model}/>;
}
