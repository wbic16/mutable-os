import {cardexPresentationPorts} from '../../application/cardex-presentation-ports';
import {CardexSearch} from './search';
import {CardexDetailPane,detailTabs} from './details';
import {For,Index,Show,createEffect,createSignal,onCleanup,onMount} from 'solid-js';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import {nativeDocumentSession} from '../../persistence/native-session';
import {LocalField,type FieldPort} from './local-editor';
import {cardexRequest,ingestCardImage,bindCardThumbnail,type EntityCardRecord,type CardAlias} from './service';
import {validateCard,coordinate} from './validation.mjs';
import type {ManagedAssetReference} from '../../interchange/managed-asset';
import './view.css';
const emptyDocument=(text='')=>({type:'document-block',children:[{type:'standoff-editor-block',text,standoffProperties:[]}]});
function Thumbnail(props:{host:ReactiveEditor;asset:ManagedAssetReference|null;large?:boolean}){
 let image!:HTMLImageElement;createEffect(()=>{const ref=props.asset;if(image)onCleanup(bindCardThumbnail(props.host,image,ref));});
 return <img hidden={!props.asset} ref={image} alt="Canonical image" width={props.large?80:40} height={props.large?80:40}/>;
}
/** Independently mountable Instrument; Cardex supplies only navigation and a window host. */
export function EntityCardInstrument(props:{host:ReactiveEditor;windowKey?:string;initialId?:string;initialVault?:string;service?:typeof cardexRequest;openIndependent?:(id:string,vault:string)=>void;dirtyChanged?:(dirty:boolean)=>void}){
 const [vault,setVault]=createSignal(props.initialVault??''),[ready,setReady]=createSignal(false),[query,setQuery]=createSignal(''),[rows,setRows]=createSignal<any[]>([]),[next,setNext]=createSignal<string|null>(null);
 const [loading,setLoading]=createSignal(false),[busy,setBusy]=createSignal(false),[imageBusy,setImageBusy]=createSignal(false),[notice,setNotice]=createSignal(''),[dirty,setDirty]=createSignal(false),[draft,setDraft]=createSignal<EntityCardRecord>(),[saved,setSaved]=createSignal<EntityCardRecord>();
 const [nameBreaks,setNameBreaks]=createSignal(false);
 const increment2=props.host.features.cardexIncrement2;
 const [activeTab,setActiveTab]=createSignal('Identity'),[searchVisible,setSearchVisible]=createSignal(!props.initialId),[expanded,setExpanded]=createSignal(false),[preview,setPreview]=createSignal(''),[semanticDrafts,setSemanticDrafts]=createSignal<Record<string,boolean>>({});
 const [bulkBusy,setBulkBusy]=createSignal(false),[bulkPending,setBulkPending]=createSignal(false),[graphWrites,setGraphWrites]=createSignal<Record<string,boolean>>({});
 const graphWriting=()=>Object.values(graphWrites()).some(Boolean);
 const graphDirty=()=>Object.values(semanticDrafts()).some(Boolean);
 const clearPreview=()=>{if(preview())URL.revokeObjectURL(preview());setPreview('');};
 const [aliases,setAliases]=createSignal<CardAlias[]>([]),[image,setImage]=createSignal<ManagedAssetReference|null>(null),[impact,setImpact]=createSignal<any>(),[pending,setPending]=createSignal<any>();
 let namePort:FieldPort|undefined,descriptionPort:FieldPort|undefined,alive=true,sequence=0,request:AbortController|undefined,upload:AbortController|undefined;
 const startup=new AbortController(),call=(r:unknown,s?:AbortSignal)=>(props.service??cardexRequest)(vault(),r,s);
 const changed=()=>{setDirty(true);setImpact(undefined);};createEffect(()=>props.dirtyChanged?.(dirty()||busy()||!!pending()||graphDirty()||bulkPending()||bulkBusy()||graphWriting()));
 const discard=()=>!busy()&&!bulkBusy()&&!graphWriting()&&(!dirty()&&!pending()&&!graphDirty()&&!bulkPending()||window.confirm(pending()||bulkPending()||graphDirty()?'This write has an unresolved or rejected outcome. Discard its local draft and retry receipt?':'Discard unsaved Entity changes?'));
 const load=(record:EntityCardRecord)=>{setSearchVisible(false);setActiveTab('Identity');setSemanticDrafts({});setGraphWrites({});setExpanded(false);clearPreview();setNameBreaks(/[\r\n]/.test(record.name));namePort=descriptionPort=undefined;setDraft(undefined);setSaved(record.revision>=0?structuredClone(record):undefined);setAliases(structuredClone(record.aliases));setImage(record.imageRef);setDirty(record.revision<0);setPending(undefined);setImpact(undefined);setDraft(record);};
 const search=async(after='')=>{
  const token=++sequence;request?.abort();request=new AbortController();setLoading(true);setNotice('');
  try{const result=await call({op:'search',query:query(),after},request.signal);if(alive&&token===sequence){setRows(result.rows);setNext(result.next);}}
  catch(e){if(alive&&token===sequence&&!request.signal.aborted)setNotice(String(e));}finally{if(alive&&token===sequence)setLoading(false);}
 };
 const open=async(id:string)=>{if(!discard())return;const token=++sequence;request?.abort();request=new AbortController();setLoading(true);setNotice('');try{const result=await call({op:'get',id},request.signal);if(alive&&token===sequence){if(!result.entity)throw Error('Entity no longer exists.');load(result.entity);}}catch(e){if(alive&&token===sequence)setNotice(String(e));}finally{if(alive&&token===sequence)setLoading(false);}};
 const back=()=>{if(!discard())return;setDraft(undefined);setDirty(false);setPending(undefined);setImpact(undefined);setSemanticDrafts({});setSearchVisible(true);if(!increment2)void search();};
 const add=()=>{if(!discard())return;sequence++;request?.abort();setLoading(false);setNotice('');load({id:crypto.randomUUID(),name:'',revision:-1,nameStrata:null,descriptionDocument:null,imageRef:null,aliases:[]});};
 const save=async()=>{
  if(busy()||!draft())return;setNotice('');
  try{
   if(!pending()){
    if(!namePort||!descriptionPort)throw Error('Field editors are not ready.');const name=namePort.read(),descriptionDocument=descriptionPort.read();
    setNameBreaks(/[\r\n]/.test(name.text??''));
    const fields={name:name.text,nameStrata:name.standoffProperties?.length?{version:1,coordinates:coordinate,properties:name.standoffProperties}:null,descriptionDocument,imageRef:image(),aliases:aliases()};validateCard(fields);
    const operation={op:'save',id:draft()!.id,expected:saved()?.revision??null,aliasBaseline:saved()?.aliases.map(a=>({id:a.id,revision:a.revision}))??[],...fields,operationId:crypto.randomUUID()};
    if(new TextEncoder().encode(JSON.stringify({vault:vault(),request:operation})).length>32000)throw Error('Card exceeds the 32 KiB save budget. Shorten the Description or aliases.');setPending(operation);
   }
   setBusy(true);const result=await call(pending());if(!alive)return;
   if(result.deleted){setDraft(undefined);setSaved(undefined);setDirty(false);setPending(undefined);setImpact(undefined);await search();}else{setSaved(result.entity);setAliases(result.entity.aliases);setPending(undefined);setDirty(false);setImpact(undefined);setNotice('Entity saved.');}
  }catch(e){if(alive){if((e as any)?.notDispatched)setPending(undefined);setNotice(String(e)+(pending()?' Retry uses the same operation; Cancel returns to search for a fresh record.':''));}}
  finally{if(alive)setBusy(false);}
 };
 const deletion=async()=>{const record=saved();if(!record||busy()||dirty()||graphDirty())return;const op=record.deletedUtc?'restore':'delete';if(!window.confirm(`${op==='delete'?'Soft delete':'Restore'} ${record.name}? References and content will be retained.`))return;setPending({op,id:record.id,expected:record.revision,confirmation:record.id,operationId:crypto.randomUUID()});await save();};
 const confirmDelete=()=>void deletion();
 const receive=async(file:Blob)=>{if(busy()||pending())return;setBusy(true);setNotice('Importing image…');clearPreview();if(['image/png','image/jpeg'].includes(file.type)&&file.size<=10*1024*1024)setPreview(URL.createObjectURL(file));setImageBusy(true);upload=new AbortController();try{const asset=await ingestCardImage(props.host,file,upload.signal);if(alive&&!upload.signal.aborted){setImage(asset);changed();setNotice('Image ready. Save the Entity to retain this reference.');}}catch(e){if(alive)setNotice(upload.signal.aborted?'Image import cancelled.':String(e));}finally{if(alive){setBusy(false);setImageBusy(false);clearPreview();}}};
 onMount(()=>{
  if(props.windowKey){props.host.viewCloseGuards.set(props.windowKey,discard);onCleanup(()=>props.host.viewCloseGuards.delete(props.windowKey!));}
  const beforeUnload=(e:BeforeUnloadEvent)=>{if(dirty()||pending()||busy()||graphDirty()||bulkPending()||bulkBusy()||graphWriting()){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);onCleanup(()=>window.removeEventListener('beforeunload',beforeUnload));
  void(async()=>{try{const chosen=props.initialVault??await nativeDocumentSession(props.host).defaultVault(startup.signal);if(!alive)return;if(!chosen)throw Error('Open a Mutable Vault before using Cardex.');setVault(chosen);await call({op:'context'},startup.signal);if(!alive)return;setReady(true);if(props.initialId)await open(props.initialId);else if(!increment2)await search();}catch(e){if(alive)setNotice(String(e));}})();
 });
 onCleanup(()=>{clearPreview();alive=false;sequence++;request?.abort();upload?.abort();startup.abort();});
 const querySubmit=()=>{if(!discard())return;setDraft(undefined);setDirty(false);setPending(undefined);void search();};
 const [navigation,setNavigation]=createSignal<{applicationKey?:string}>();
 const [searchSlot,setSearchSlot]=createSignal<HTMLElement>(),[identitySlot,setIdentitySlot]=createSignal<HTMLElement>(),[detailsSlot,setDetailsSlot]=createSignal<HTMLElement>(),[legacySlot,setLegacySlot]=createSignal<HTMLElement>();
 if(props.host.features.textualWorkspace)onMount(()=>onCleanup(cardexPresentationPorts(props.host).register({key:crypto.randomUUID(),windowKey:props.windowKey,vault,ready,notice,dirty,busy,pending,draft,saved,activeTab,selectTab:setActiveTab,navigation,canPresent:()=>!busy()&&!bulkBusy()&&!graphWriting(),add,back,save,deletion,search:searchSlot,identity:identitySlot,details:detailsSlot,legacy:legacySlot})));

 return <section class="cardex-instrument" aria-label="Entity Card" onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'&&!e.isComposing){e.preventDefault();e.stopPropagation();void save();}}}>
  <Show when={!draft()}><header class="cardex-toolbar"><strong>Entities</strong><Show when={ready()}><Show when={!increment2}><form onSubmit={e=>{e.preventDefault();querySubmit();}}><input aria-label="Search Entity names and aliases" placeholder="Name or alias…" value={query()} onInput={e=>setQuery(e.currentTarget.value)}/><button type="submit" disabled={busy()}>Search</button></form></Show><button type="button" onClick={add} disabled={busy()}>Add</button></Show></header></Show>
  <div class="cardex-vault">{vault()}<Show when={dirty()}> · Unsaved changes</Show></div>
  <Show when={notice()}><p role="status" class="cardex-error">{notice()}</p></Show><Show when={imageBusy()}><button onClick={()=>upload?.abort()}>Cancel image import</button></Show><Show when={loading()}><p role="status">Loading…</p></Show>
  <Show when={ready()&&increment2}><div ref={setSearchSlot} hidden={!!draft()}><CardexSearch host={props.host} visible={searchVisible()} call={call} open={id=>void open(id)} notice={setNotice} mutationState={(writing,pending)=>{setBulkBusy(writing);setBulkPending(pending);}}/></div></Show>
  <Show when={ready()&&!draft()&&!increment2}><div ref={setLegacySlot} class="cardex-results" aria-label="Entity search results" onKeyDown={e=>{if(!['ArrowDown','ArrowUp'].includes(e.key))return;const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('.cardex-result')],i=buttons.indexOf(document.activeElement as HTMLButtonElement);if(buttons.length){e.preventDefault();buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}}}>
   <For each={rows()}>{row=><button class="cardex-result" onClick={()=>void open(row.id)}><Thumbnail host={props.host} asset={row.imageRef}/><span>{row.name}</span></button>}</For>
   <Show when={!loading()&&!rows().length}><p>No matching Entities.</p></Show>
  </div><Show when={next()}><button onClick={()=>void search(next()!)}>Next page</button></Show><button onClick={()=>void search()}>First page</button></Show>
  <Show when={draft()} keyed>{record=><>
   <div class="cardex-toolbar"><button onClick={back} disabled={busy()}>Back to search</button><Show when={saved()&&props.openIndependent}><button onClick={()=>props.openIndependent?.(record.id,vault())}>Open Instrument</button></Show></div>
   <Show when={increment2}><header class="cardex-identity-header"><Thumbnail host={props.host} asset={image()}/><div><strong>{saved()?.displayName??(record.name||'New Entity')}</strong><p>{saved()?.description?.slice(0,180)}</p></div></header><nav class="cardex-detail-tabs" aria-label="Entity details" role="tablist"><For each={detailTabs}>{tab=><button role="tab" aria-selected={activeTab()===tab} onClick={()=>setActiveTab(tab)}>{tab}</button>}</For></nav></Show>
   <fieldset ref={el=>{setIdentitySlot(el);onCleanup(()=>setIdentitySlot(undefined));}} hidden={increment2&&activeTab()!=='Identity'} class="cardex-form" disabled={busy()||!!pending()}><div class="cardex-fields" inert={busy()||!!pending()?true:undefined}>
    <label>Canonical Name</label><div><LocalField kind="name" value={{text:record.name,properties:record.nameStrata?.properties??[]}} ready={p=>namePort=p} changed={changed} notice={setNotice}/><Show when={nameBreaks()}><p class="cardex-status">This Name contains hidden line breaks. <button type="button" onClick={()=>{namePort?.makeSingleLine();setNameBreaks(false);setNotice('Name made single-line. Annotations were adjusted; Save Entity to keep the change.');}}>Make Name single-line</button></p></Show></div>
    <label>Canonical image</label><div class="cardex-image" tabIndex={0} aria-label="Canonical image: choose, drop or paste PNG/JPEG" onDragOver={e=>{if([...e.dataTransfer?.types??[]].includes('Files'))e.preventDefault();}} onDrop={e=>{const file=e.dataTransfer?.files[0];if(file){e.preventDefault();e.stopPropagation();void receive(file);}}} onPaste={e=>{const files=[...e.clipboardData?.items??[]].filter(i=>i.kind==='file'&&i.type.startsWith('image/'));if(files.length){e.preventDefault();e.stopPropagation();const file=files[0].getAsFile();if(file)void receive(file);}}}>
     <Show when={preview()} fallback={<Thumbnail host={props.host} asset={image()} large/>}>{url=><img src={url()} width="64" height="64" alt="Image import preview"/>}</Show><input type="file" accept="image/png,image/jpeg" aria-label="Choose canonical image" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void receive(file);}}/><Show when={image()}><button type="button" onClick={()=>{setImage(null);changed();}}>Remove image</button></Show><small>Drop or paste an image here · PNG/JPEG, up to 10 MiB</small>
    </div>
    <label>Aliases</label><div><Index each={aliases()}>{(a,i)=><div class="cardex-alias"><input aria-label={'Alias '+(i+1)} value={a().name} onInput={e=>{const value=e.currentTarget.value;setAliases(items=>items.map(item=>item.id===a().id?{...item,name:value}:item));changed();}}/><button type="button" aria-label={'Remove alias '+(i+1)} onClick={()=>{setAliases(items=>items.filter(item=>item.id!==a().id));changed();}}>Remove</button></div>}</Index><button type="button" disabled={aliases().length>=100} onClick={()=>{setAliases(items=>[...items,{id:crypto.randomUUID(),name:'',origin:'curated'}]);changed();}}>Add alias</button></div>
    <label>Description</label><div class={'cardex-description'+(expanded()?' expanded':'')}><LocalField kind="description" value={record.descriptionDocument??emptyDocument(record.description??'')} ready={p=>descriptionPort=p} changed={changed} notice={setNotice}/><Show when={increment2}><button type="button" aria-expanded={expanded()} onClick={()=>setExpanded(!expanded())}>{expanded()?'Collapse Description':'Expand Description'}</button></Show></div>
   </div></fieldset>
   <Show when={increment2}><div style={{display:"contents"}} ref={el=>{setDetailsSlot(el);onCleanup(()=>setDetailsSlot(undefined));}}><For each={detailTabs.slice(1)}>{tab=><Show when={saved()} fallback={<Show when={activeTab()===tab}><p>Save the Entity before using this tab.</p></Show>}><CardexDetailPane navigated={applicationKey=>setNavigation({applicationKey})} host={props.host} id={record.id} vault={vault()} tab={tab} active={activeTab()===tab} call={call} notice={setNotice} writingChanged={value=>setGraphWrites(v=>({...v,[tab]:value}))} pendingChanged={value=>setSemanticDrafts(v=>({...v,[tab]:value}))}/></Show>}</For></div></Show>
   <div class="cardex-actions"><button class="primary" disabled={busy()} onClick={()=>void save()}>{pending()?'Retry operation':'Save Entity'}</button><button disabled={busy()} onClick={back}>Cancel</button><Show when={saved()}><button disabled={busy()||dirty()||!!pending()} onClick={()=>void deletion()}>{saved()?.deletedUtc?'Restore…':'Delete…'}</button></Show></div>
   <Show when={impact()}>{value=><div class="cardex-delete" role="status"><p>{value().blocked?'Deletion blocked by references.':'This Entity has no saved SQL dependencies.'}</p><For each={value().dependencies}>{d=><p>{d.kind}: {d.count}</p>}</For><p>{value().notice}</p><button disabled={value().blocked||busy()} onClick={confirmDelete}>Confirm deletion</button></div>}</Show>
  </>}</Show>
 </section>;
}
export function CardexShell(props:{host:ReactiveEditor;windowKey?:string;openIndependent?:(id:string,vault:string)=>void;dirtyChanged?:(dirty:boolean)=>void}){
 const [active,setActive]=createSignal('Entities'),[dirty,setDirty]=createSignal(false),instance=crypto.randomUUID(),categories=['Entities','Claims','Relationships','Facts'];
 return <div class="cardex"><nav class="cardex-tabs" role="tablist" aria-label="Cardex cards" aria-orientation="vertical"><img src={new URL('../../assets/desktop-icons/cardex.png',import.meta.url).href} alt="Cardex"/><For each={categories}>{category=><button role="tab" aria-selected={active()===category} aria-controls={instance+'-'+category} onClick={()=>setActive(category)}>{category}{category==='Entities'&&dirty()?' •':''}</button>}</For></nav><main class="cardex-panel"><div role="tabpanel" aria-label="Entities" id={instance+'-Entities'} hidden={active()!=='Entities'}><EntityCardInstrument host={props.host} windowKey={props.windowKey} openIndependent={props.openIndependent} dirtyChanged={value=>{setDirty(value);props.dirtyChanged?.(value);}}/></div><For each={categories.slice(1)}>{category=><section role="tabpanel" id={instance+'-'+category} aria-label={category+' (not implemented)'} hidden={active()!==category}/>}</For></main></div>;
}
