import {createEffect,on,onCleanup,untrack,type Accessor} from 'solid-js';
import {unwrap} from 'solid-js/store';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {BlockTreeProjection} from '../../block-tree/projection';
import {contribution,type ContributionNotice} from './model';

export const imageLoadNoticeDelay=15000;
type Outcome=NonNullable<ContributionNotice['imageLoad']>['events'][number]['outcome'];
export interface ImageRemediation {automaticRepairAttempted?:boolean;detail?:string;candidateUrl?:string;receipt?:import('./dcp/provider-contract').ProviderReceipt;replacement?:{url:string;byteLength:number|null}}
/** Follow this occurrence's ancestry only, never enumerate a Document/repository. */
export function imageContributionOwner(projection:BlockTreeProjection,key:string){
 let row=projection.node(key),documentId:string|undefined,contributionNode:typeof row;
 const seen=new Set<string>();
 while(row&&!seen.has(row.key)){
  seen.add(row.key);
  if(!contributionNode&&contribution((row.payload.metadata as any)?.dialectic))contributionNode=row;
  if(row.viewType==='document-block'){documentId=String(row.payload.id);break;}
  row=projection.parentOf(row.key);
 }
 return contributionNode&&documentId?{row:contributionNode,documentId}:undefined;
}
/** A deduplicated, native metadata edit; the image URL and provider response stay
 * immutable. Native Undo/Redo, dirty tracking and manual saving apply normally. */
export function recordImageLoad(editor:ReactiveEditor,projection:BlockTreeProjection,key:string,url:string,outcome:Outcome,at=new Date().toISOString(),byteLength?:number,remediation?:ImageRemediation){
 const node=projection.node(key),scope=imageContributionOwner(projection,key);
 if(!node||node.viewType!=='image-block'||!scope)return false;
 const data=contribution((scope.row.payload.metadata as any)?.dialectic);
 if(data?.state!=='committed')return false;
 const originalUrl=String((node.payload.metadata as any)?.url??'');
 const blockId=String(node.payload.id),notices=structuredClone(unwrap(data.notices??[]));
 const index=notices.findIndex(n=>n.code==='image-load'&&n.imageLoad?.blockId===blockId&&n.imageLoad.originalUrl===originalUrl),previous=notices[index];
 if(url!==originalUrl&&url!==previous?.imageLoad?.replacement?.url)return false;
 if(previous?.imageLoad?.events.at(-1)?.outcome===outcome||outcome==='loaded'&&(!previous||['smaller-loaded','repair-loaded'].includes(previous.imageLoad?.events.at(-1)?.outcome??'')))return true;
 const name=String((node.payload.metadata as any)?.alt||'Image').slice(0,240).replace(/[.\s]+$/,'');
 const troubled=previous?.imageLoad?.events.some(e=>e.outcome==='failed'||e.outcome==='delayed');
 const detail=remediation?.detail??(outcome==='repair-requested'?'could not be loaded; an AI backchannel replacement was requested; completion has not been recorded.':outcome==='repair-loaded'?'initially failed to load; an AI backchannel replacement loaded successfully.':outcome==='repair-failed'?'could not be loaded; the AI backchannel replacement attempt failed.':outcome==='retry-requested'?'the original image is being retried.':outcome==='smaller-requested'?'a smaller image was requested from the AI.':outcome==='smaller-loaded'?'a smaller image was supplied by the AI and loaded successfully.':outcome==='smaller-failed'?'a smaller image could not be loaded.':outcome==='full-requested'?'full image loading was requested by the user.':outcome==='failed'?(previous?.imageLoad?.automaticRepairAttempted?'could not be loaded; an AI backchannel recovery was already attempted. Use the image recovery controls to retry.':'could not be loaded; no AI backchannel recovery has been attempted yet.'):outcome==='delayed'?'has not finished loading after 15 seconds; it may still load.':previous?.imageLoad?.events.some(e=>e.outcome==='failed')?'initially failed to load; it subsequently loaded successfully.':troubled?'was slow to load and subsequently loaded successfully.':'full image loaded successfully after the user requested it.');
 const history=previous?.imageLoad?.events??[],events=[...(history.length>7?[history[0],...history.slice(-6)]:history),{outcome,at,...(remediation?.detail?{detail:remediation.detail}:{}),...(remediation?.candidateUrl?{candidateUrl:remediation.candidateUrl}:{}),...(remediation?.receipt?{receipt:remediation.receipt}:{})}];
 const size=byteLength??previous?.imageLoad?.byteLength;
 const notice:ContributionNotice={version:1,code:'image-load',severity:outcome==='full-requested'||outcome==='smaller-requested'||outcome==='retry-requested'||outcome==='loaded'&&!troubled?'info':'warning',loss:outcome==='failed',sourceName:name,detail,target:{kind:'block',resourceId:scope.documentId,blockId},imageLoad:{...previous?.imageLoad,version:1,blockId,originalUrl,method:'browser',...(remediation?.automaticRepairAttempted?{automaticRepairAttempted:true}:{}),...(remediation?.replacement?{replacement:remediation.replacement}:{}),...(size===undefined?{}:{byteLength:size}),events}};
 if(index<0)notices.push(notice);else notices[index]=notice;
 editor.commands.boundedStructuralTransaction('Record contribution image load',()=>editor.commands.setPayloadField(scope.row.key,'metadata',{...structuredClone(unwrap(scope.row.payload.metadata)) as object,dialectic:{...structuredClone(unwrap(data)),notices}}));
 return true;
}

/** Event-driven observation of the native <img>. No fetches, polling or typing
 * subscriptions. Receiving metadata is written only after stream finalisation. */
export function observeContributionImage(editor:ReactiveEditor,projection:BlockTreeProjection,key:string,image:HTMLImageElement,url:Accessor<string>){
 if(!editor.features.dialectic||!editor.features.dialecticContributionActivity)return;
 createEffect(on(url,source=>{
  if(!source||!imageContributionOwner(projection,key))return;
  let active=true,scheduled=false;
  const pending:{outcome:Outcome;at:string}[]=[];
  const flush=()=>{
   if(scheduled||!pending.length)return;scheduled=true;
   queueMicrotask(()=>{
    scheduled=false;if(!active||!image.isConnected||url()!==source)return;
    for(const event of [...pending]){
     if(!recordImageLoad(editor,projection,key,source,event.outcome,event.at))break;
     pending.shift();
    }
   });
  };
  const report=(outcome:Outcome)=>{if(!active)return;clearTimeout(timer);pending.push({outcome,at:new Date().toISOString()});flush();};
  const failed=()=>report('failed'),loaded=()=>report('loaded');
  const timer=setTimeout(()=>report('delayed'),imageLoadNoticeDelay);
  image.addEventListener('error',failed);image.addEventListener('load',loaded);
  createEffect(on(()=>contribution((imageContributionOwner(projection,key)?.row.payload.metadata as any)?.dialectic)?.state,state=>{if(state==='committed')untrack(flush);}));
  // Cached images can complete before listeners are installed.
  if(image.complete&&image.getAttribute('src'))image.naturalWidth?loaded():failed();
  onCleanup(()=>{active=false;clearTimeout(timer);image.removeEventListener('error',failed);image.removeEventListener('load',loaded);});
 }));
}
