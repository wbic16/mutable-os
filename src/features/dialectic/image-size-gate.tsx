import {Show,createEffect,createMemo,createSignal,on,onCleanup,type Accessor,type JSX} from 'solid-js';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {BlockTreeProjection} from '../../block-tree/projection';
import {contribution} from './model';
import {imageContributionOwner,recordImageLoad} from './image-load';
import {imageUtilityUrl,requestSmallerImage,type SmallerImageResult} from './smaller-image-contract';

export const fullImageThreshold=20_000_000;
const approved=new WeakMap<ReactiveEditor,Set<string>>();
const automaticAttempts=new WeakMap<ReactiveEditor,Set<string>>();
/** HEAD is host-side because cross-origin image servers need not allow browser
 * fetch. Failure/unknown size intentionally falls back to normal <img> loading. */
export async function imageReferenceSize(editor:ReactiveEditor,url:string,signal:AbortSignal):Promise<number|null>{
 const scope={...editor.readAssetContext()};if(!scope.session||!scope.cavernId)return null;
 try{
  const response=await fetch('/api/image-reference/inspect',{method:'POST',headers:{'Content-Type':'application/json','X-Mutable-Cavern':scope.session},body:JSON.stringify({url}),signal});
  const data=await response.json(),current=editor.readAssetContext();
  if(signal.aborted||current.session!==scope.session||current.cavernId!==scope.cavernId||!response.ok||!data.Success)return null;
  const size=data.Data?.byteLength;return Number.isSafeInteger(size)&&size>=0?size:null;
 }catch{return null;}
}
/** A browser load proves that the proposed reference is an actual image. */
export function loadReplacementImage(url:string,signal:AbortSignal):Promise<void>{
 return new Promise((resolve,reject)=>{
  const image=new Image();
  const finish=(error?:Error)=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);image.onload=image.onerror=null;if(error){image.removeAttribute('src');reject(error);}else resolve();};
  const cancel=()=>finish(new Error('Image request cancelled.'));
  const timer=setTimeout(()=>finish(new Error('The smaller image did not finish loading.')),30000);
  image.onload=()=>finish(image.naturalWidth?undefined:new Error('The replacement is not a usable image.'));
  image.onerror=()=>finish(new Error('The smaller image could not be loaded.'));
  signal.addEventListener('abort',cancel,{once:true});if(signal.aborted){cancel();return;}image.src=url;
 });
}
/** URL-specific work only; no scans, snapshots or text-edit subscriptions. */
export function ImageSizeGate(props:{editor:ReactiveEditor;projection:BlockTreeProjection;nodeKey:string;source:Accessor<string>;enabled:boolean;automaticRepair?:boolean;children:(source:Accessor<string>)=>JSX.Element}){
 const [state,setState]=createSignal<'checking'|'blocked'|'failed'|'allowed'>('checking'),[bytes,setBytes]=createSignal<number>(),[busy,setBusy]=createSignal(false),[failure,setFailure]=createSignal('');
 let autoQueued=false,element!:HTMLDivElement,currentKey='',alive=true,operation:AbortController|undefined,requested:{key:string;url:string;at:string;bytes?:number}|undefined;
 const ownerData=()=>contribution((imageContributionOwner(props.projection,props.nodeKey)?.row.payload.metadata as any)?.dialectic);
 const committed=()=>ownerData()?.state==='committed';
 const imageNotice=createMemo(()=>{const id=props.projection.node(props.nodeKey)?.payload.id;return ownerData()?.notices?.find(n=>n.code==='image-load'&&n.imageLoad?.blockId===id&&n.imageLoad?.originalUrl===props.source());});
 const replacement=createMemo(()=>{
  const id=props.projection.node(props.nodeKey)?.payload.id;
  const value=ownerData()?.notices?.find(n=>n.code==='image-load'&&n.imageLoad?.blockId===id&&n.imageLoad?.originalUrl===props.source())?.imageLoad?.replacement?.url;
  if(!value)return '';try{return imageUtilityUrl(value);}catch{return '';}
 });
 const displayed=createMemo(()=>replacement()||props.source());
 const context=()=>{const scope=props.editor.readAssetContext();return `${scope.cavernId??''}/${scope.session??''}`;};
 const keyFor=(url:string)=>JSON.stringify([context(),props.projection.node(props.nodeKey)?.payload.id,url]);
 const approve=(url:string)=>{let set=approved.get(props.editor);if(!set)approved.set(props.editor,set=new Set());set.add(keyFor(url));};
 onCleanup(()=>{alive=false;operation?.abort();});
 const recordRequest=()=>{const value=requested;if(alive&&value&&value.key===currentKey&&value.url===props.source())recordImageLoad(props.editor,props.projection,props.nodeKey,value.url,'full-requested',value.at,value.bytes);};
 createEffect(on(()=>[displayed(),context()] as const,([url,scope])=>{
  operation?.abort();operation=undefined;setBusy(false);setFailure('');requested=undefined;setBytes(undefined);
  currentKey=keyFor(url);
  const assetContext=props.editor.readAssetContext();
  if(!props.enabled||!props.editor.features.dialecticLargeImageConsent||!assetContext.session||!assetContext.cavernId||!/^https?:\/\//i.test(url)||!imageContributionOwner(props.projection,props.nodeKey)||approved.get(props.editor)?.has(currentKey)){setState('allowed');return;}
  setState('checking');let active=true;const controller=new AbortController();
  void imageReferenceSize(props.editor,url,controller.signal).then(size=>{if(!active||controller.signal.aborted||displayed()!==url||context()!==scope||state()==='failed')return;setBytes(size??undefined);setState(size!==null&&size>fullImageThreshold?'blocked':'allowed');});
  onCleanup(()=>{active=false;controller.abort();operation?.abort();});
 }));
 const fetchFull=()=>{
  if(state()!=='blocked'||busy())return;
  approve(displayed());requested={key:currentKey,url:props.source(),at:new Date().toISOString(),bytes:bytes()};setState('allowed');recordRequest();
 };
 const fetchSmaller=async(automatic=false)=>{
  const repair=state()==='failed';
  if((state()!=='blocked'&&!repair)||busy()||!committed()||!props.editor.features.dialecticSmallerImage)return;
  if(automatic){let attempts=automaticAttempts.get(props.editor);if(!attempts)automaticAttempts.set(props.editor,attempts=new Set());const key=keyFor(props.source());if(attempts.has(key))return;attempts.add(key);}
  const requestOutcome=repair?'repair-requested':'smaller-requested';
  const controller=new AbortController(),key=currentKey,original=props.source(),at=new Date().toISOString();operation=controller;setBusy(true);setFailure('');
  const current=()=>alive&&!controller.signal.aborted&&currentKey===key&&props.source()===original&&committed();
  let result:SmallerImageResult|undefined;
  try{
   if(!recordImageLoad(props.editor,props.projection,props.nodeKey,original,requestOutcome,at,bytes(),{automaticRepairAttempted:automatic}))throw Error('Image is no longer available.');
   result=await requestSmallerImage(element,props.nodeKey,original,controller.signal,repair?'failed-image':undefined);
   if(!current())return;
   if(!result.url||result.url===displayed())throw Error('The AI could not identify a suitable replacement image.');
   const url=imageUtilityUrl(result.url),size=await imageReferenceSize(props.editor,url,controller.signal);
   if(!current())return;
   if(size!==null&&size>fullImageThreshold)throw Error('The proposed replacement is still larger than 20 MB.');
   await loadReplacementImage(url,controller.signal);
   if(!current())return;
   // Undoing the request while it was running also prevents a late replacement.
   const pending=ownerData()?.notices?.some(n=>n.imageLoad?.blockId===props.projection.node(props.nodeKey)?.payload.id&&n.imageLoad?.events.some(e=>e.outcome===requestOutcome&&e.at===at));
   if(!pending)return;
   approve(url);
   recordImageLoad(props.editor,props.projection,props.nodeKey,original,repair?'repair-loaded':'smaller-loaded',new Date().toISOString(),undefined,{candidateUrl:url,receipt:result.receipt,replacement:{url,byteLength:size},detail:`${repair?'initially failed to load; an AI backchannel replacement loaded successfully.':'a smaller image was requested and loaded successfully.'}${size===null?' Its server did not provide a verifiable size.':''}`});
  }catch(error){
   if(current()){
    const detail=String(error instanceof Error?error.message:error).slice(0,300);setFailure(detail);
    recordImageLoad(props.editor,props.projection,props.nodeKey,original,repair?'repair-failed':'smaller-failed',new Date().toISOString(),undefined,{detail:repair?`could not be loaded; the AI backchannel recovery did not succeed. ${detail}`:detail,candidateUrl:result?.url??undefined,receipt:result?.receipt});
   }
  }finally{if(operation===controller){operation=undefined;setBusy(false);}}
 };
 const retryImage=()=>{
  if(busy())return;
  recordImageLoad(props.editor,props.projection,props.nodeKey,props.source(),'retry-requested');
  setFailure('');setState('allowed');
 };
 createEffect(on(()=>[imageNotice()?.imageLoad?.events.at(-1)?.outcome,committed(),state()] as const,([outcome,ready])=>{
  if(!props.enabled||!props.editor.features.dialecticSmallerImage||!ready||!['failed','repair-failed','repair-requested'].includes(outcome??''))return;
  setState('failed');
  // One automatic attempt per image, retained across remounts and native saves.
  // Explicit retries remain available without a recursive paid request loop.
  if(props.automaticRepair!==false&&outcome==='failed'&&!automaticAttempts.get(props.editor)?.has(keyFor(props.source()))&&!imageNotice()?.imageLoad?.automaticRepairAttempted&&props.editor.features.dialecticSmallerImage&&!busy()&&!autoQueued){
   autoQueued=true;queueMicrotask(()=>{autoQueued=false;if(alive&&state()==='failed'&&!imageNotice()?.imageLoad?.automaticRepairAttempted)void fetchSmaller(true);});
  }
 }));
 createEffect(on(()=>ownerData()?.state,state=>{if(state==='committed'&&requested)queueMicrotask(recordRequest);}));
 return <Show when={state()==='allowed'} fallback={<div ref={element} class="dialectic-image-fetch" aria-live="polite">
  <Show when={state()==='blocked'||state()==='failed'} fallback={<span>Checking image size…</span>}>
   <div class="dialectic-image-fetch-actions"><button type="button" disabled={busy()} onClick={()=>state()==='failed'?retryImage():fetchFull()}>{state()==='failed'?'Retry Image':'Fetch Full Image'}</button>
    <Show when={props.editor.features.dialecticSmallerImage}><button type="button" disabled={busy()||!committed()} onClick={()=>void fetchSmaller()}>{state()==='failed'?'Request Replacement Image':'Fetch Smaller Image'}</button></Show>
   </div>
   <small>{busy()?(state()==='failed'?'Requesting and checking an AI replacement…':'Finding and loading a smaller image…'):state()==='failed'?(imageNotice()?.imageLoad?.automaticRepairAttempted?'AI recovery has been attempted. You can retry the image or request another replacement.':'Image failed to load. No automatic AI recovery has been attempted.'):`${((bytes()??0)/1_000_000).toFixed(1)} MB`}</small>
   <Show when={failure()}><small>{failure()}</small></Show>
  </Show>
 </div>}>{props.children(displayed)}</Show>;
}
