import {attachments,attachmentLimits,type Attachment} from '../attachments-contract';
import type {AssetContext} from '../../../runtime/managed-assets';
import {smallerImageOutput,type SmallerImageInput,type SmallerImageResult} from '../smaller-image-contract';
import {validationDiagnostic,allowsSourceRecovery,sourceRecoveryTools} from './diagnostics';
import {defaultProviderSettings,providerSettings,liveLimits,type ProviderSettings,type ProviderTurn,type LiveProvenance} from './provider-contract';
import type {DcpTransport} from './exchange';
import type {ContinuityManifest,HistoryItem} from './continuity-contract';
import {parseConversationTitle} from '../title-contract';

/** Credentials and bearer tokens are session-only. Only validated, nonsecret preferences survive reload. */
const preferencesKey='mutable.dialectic.provider-settings.v1';
export class DialecticProviderSession {
 private token='';private pending?:Promise<void>;private disposed=false;
 settings:ProviderSettings={...defaultProviderSettings};ready=false;
 private pagehide=()=>{void this.forget();};
 constructor(readonly testLogging=false,private assetContext:()=>AssetContext=()=>({}),private parent?:DialecticProviderSession){try{const saved=localStorage.getItem(preferencesKey);if(saved)this.settings=providerSettings(JSON.parse(saved));}catch{}window.addEventListener('pagehide',this.pagehide);}
 private async connect(){
  if(this.disposed)throw Error('Provider session closed.');if(this.token)return;
  if(!this.pending)this.pending=(async()=>{if(this.parent)await this.parent.connect();const r=await fetch('/api/dialectic/session',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'x-mutable-dialectic':'1',...(this.parent?{'x-dialectic-parent':this.parent.token}:{})}});const data=await r.json();if(!r.ok){if(r.status===401&&this.parent){this.parent.token='';this.parent.ready=false;}throw Error(data.error??'Local provider broker unavailable.');}this.token=data.token;if(this.disposed){await this.forget();throw Error('Provider session closed.');}})().finally(()=>{this.pending=undefined;});
  await this.pending;
 }
 private async call(path:string,body?:unknown,signal?:AbortSignal,method='POST'){
  const scope={...this.assetContext()};await this.connect();const response=await fetch('/api/dialectic'+path,{method,signal:signal??AbortSignal.timeout(10000),headers:{...(body instanceof FormData?{}:{'content-type':'application/json'}),'x-mutable-dialectic':'1','x-dialectic-session':this.token,...(scope.session?{'X-Mutable-Cavern':scope.session}:{})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});
  if(!response.ok){if(response.status===401){this.token='';this.ready=false;}const e=await response.json().catch(()=>({}));throw Error(e.error??'Local provider broker request failed.');}return response;
 }
 async uploadAttachment(file:File,signal:AbortSignal):Promise<Attachment>{
  const form=new FormData();form.append('file',file,file.name);form.append('name',file.name);
  return attachments([(await(await this.call('/attachments/upload',form,signal)).json()).attachment])[0];
 }
 async attachmentBlob(attachment:Attachment,signal:AbortSignal):Promise<Blob>{
  attachments([attachment]);const scope={...this.assetContext()};
  const response=await this.call('/attachments/download',{attachment},signal);
  if(!response.body)throw Error('Attachment bytes unavailable');
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try{for(;;){signal.throwIfAborted();const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>attachment.byteLength||size>attachmentLimits.fileBytes)throw Error('Attachment download limit exceeded');parts.push(r.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const blob=new Blob(parts.map(p=>new Uint8Array(p).buffer),{type:attachment.mediaType}),bytes=await blob.arrayBuffer();
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  signal.throwIfAborted();if(size!==attachment.byteLength||attachment.asset.assetId!=='sha256:'+hash||scope.session!==this.assetContext().session||scope.cavernId!==this.assetContext().cavernId)throw Error('Attachment integrity or Vault/session mismatch');return blob;
 }
 async diagnostic(event:unknown){if(!this.testLogging)return false;const r=await this.call('/diagnostics',event);return (await r.json()).logged===true;}
 async title(text:string,signal:AbortSignal){if(!this.ready)throw Error('Provider unavailable');return parseConversationTitle(await(await this.call('/utility/title',{text},signal)).json());}
 async smallerImage(input:SmallerImageInput,signal:AbortSignal):Promise<SmallerImageResult>{
  if(!this.ready)throw Error('Configure the AI provider in AI settings first.');
  const data=await(await this.call('/utility/smaller-image',input,signal)).json();
  return {url:smallerImageOutput({url:data.url}),receipt:data.receipt};
 }
 async configure(settings:ProviderSettings,key?:string){const response=await this.call('/settings',{settings,...(key?{key}:{})});const data=await response.json();this.settings=providerSettings(data.settings);this.ready=data.ready;try{if(!this.parent)localStorage.setItem(preferencesKey,JSON.stringify(this.settings));}catch{}return this.ready;}
 private async closeExchange(id:string){if(!this.token)return;await fetch('/api/dialectic/exchange/'+id,{method:'DELETE',signal:AbortSignal.timeout(2000),headers:{'x-mutable-dialectic':'1','x-dialectic-session':this.token},keepalive:true}).catch(()=>undefined);}
 async forget(){const token=this.token;this.token='';this.ready=false;if(token)await fetch('/api/dialectic/session',{method:'DELETE',headers:{'x-mutable-dialectic':'1','x-dialectic-session':token},keepalive:true}).catch(()=>undefined);}
 dispose(){window.removeEventListener('pagehide',this.pagehide);this.disposed=true;void this.forget();}
 transport(history?:()=>Promise<{manifest:ContinuityManifest;items:HistoryItem[]}>) {
  let retainedId='';
  const details:LiveProvenance={version:1,adapterVersion:'4c-1',settings:{...this.settings},attempts:[],cost:{status:'unknown'}};
  const run:DcpTransport=async(request,sources,chunk,signal,validate)=>{
   details.exchangeId=request.exchange;details.resourceId=sources.owner;
   if(!this.ready)throw Error('Configure an API key and model in AI settings first.');
   let id='',round=0,calls=0,repair=false,recoverSources=false,next:any={round:0},prepared=false;
   const close=()=>{if(id)void this.closeExchange(id);};signal.addEventListener('abort',close,{once:true});
   try{
    let continuity:any;
    if(history&&this.settings.provider==='openai'){
     const native=await history();sources.check();
     const response=await this.call('/continuity/prepare',{manifest:native.manifest,request},signal),preflight=await response.json();
     if(!preflight.supported)throw Error('Persistent provider memory is unavailable on this server. Disable continuity explicitly to use stateless mode.');
     continuity={manifest:native.manifest,plan:preflight.plan,items:native.items.slice(preflight.plan.start)};
     if(preflight.plan.recovery)chunk('Rebuilding provider memory from native conversation history…','status');
    }
    const response=await this.call('/exchange',{request,...(continuity?{continuity}:{})},signal),start=await response.json();id=start.id;details.settings=start.settings;details.system=start.system;details.continuity=start.continuity;if(signal.aborted)throw Error('DCP cancelled');
    const nativeStreaming=request.dialect==='xml/1'&&request.xmlFragments===true;
    while(round<liveLimits.rounds){
     if(!nativeStreaming||round===0||next.repair)chunk('','start');
     sources.check();const response=await this.call('/exchange/'+id+'/turn',next,signal);if(!response.body)throw Error('Missing broker stream.');
     const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',wire=0,preview='',turn:ProviderTurn|undefined;
     try{while(true){const {done,value}=await reader.read();if(done)break;wire+=value.byteLength;if(wire>2*liveLimits.wireBytes)throw Error('Broker stream budget exceeded.');buffer+=decoder.decode(value,{stream:true});let end:number;
      while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line)continue;const event=JSON.parse(line);if(event.type==='error'){details.failure={message:String(event.error).slice(0,1000),...(event.receipt?{receipt:event.receipt}:{})};throw Error(event.error);}if(event.type==='delta'){preview+=event.text;if(preview.length>liveLimits.bytes)throw Error('DCP output budget exceeded.');chunk(preview,'text');}else if(event.type==='result'){if(turn)throw Error('Duplicate provider result.');turn=event;}}
     }}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
     if(buffer.trim()||!turn)throw Error('Broker stream interrupted; no contribution committed.');sources.check();
     const attempt:LiveProvenance['attempts'][number]={receipt:turn.receipt,toolCalls:turn.calls,toolResultIds:[]};details.attempts.push(attempt);round++;
     if(turn.attachments)details.attachments=attachments(turn.attachments);
     if(turn.calls.length){
      if(nativeStreaming)chunk(turn.text,'continue');
      calls+=turn.calls.length;if(calls>liveLimits.calls||repair&&(!recoverSources||turn.calls.some(c=>!sourceRecoveryTools.some(tool=>tool===c.tool))))throw Error('DCP tool budget exceeded.');const results=[];
      for(const [i,call]of turn.calls.entries()){sources.check();const toolId=`provider-${round}-${i}`;if(call.tool==='create_attachment'||call.tool==='generate_image'){if(call.tool==='generate_image')chunk('Generating image…','status');const value=await(await this.call('/exchange/'+id+'/artifact',{callId:call.id},signal)).json();if(value.attachment)details.attachments=attachments([...(details.attachments??[]),value.attachment]);(attempt.artifactResults??=[]).push({id:call.id,tool:call.tool,status:value.attachment?'complete':'failed',...(value.attachment?{filename:value.attachment.name}:{error:String(value.error??'Artifact returned no attachment').slice(0,1000)})});attempt.toolResultIds.push(toolId);results.push({id:call.id,result:{status:value.attachment?'complete':'failed'}});continue;}const nativeResult=await sources.tool({...call,arguments:sources.xmlAuthoring?sources.xmlAuthoring.toolArguments(call.tool,call.arguments):call.arguments,id:toolId}),result=sources.xmlAuthoring?(call.tool==='describe_capabilities'?sources.xmlAuthoring.describe(nativeResult):sources.xmlAuthoring.project(nativeResult)):nativeResult;attempt.toolResultIds.push(toolId);results.push({id:call.id,result});}
      next={round,results};continue;
     }
     try{await validate?.(turn.text);prepared=!!details.continuity;if(prepared)retainedId=id;return turn.text;}
     catch(error){const diagnostic=validationDiagnostic(error);attempt.diagnostic=diagnostic;attempt.rejectedResponse=turn.text;sources.check();if(repair||!details.settings.repair||(error as any)?.nativeContentRetained===true){details.failure={message:String(error).slice(0,1000),diagnostic};throw error;}repair=true;recoverSources=allowsSourceRecovery(diagnostic);attempt.repair=String(error).slice(0,1000);chunk('DCP validation failed; trying the enabled single repair…','status');next={round,repair:true,diagnostic};}
    }throw Error('DCP continuation limit exceeded.');
   }catch(error){details.failure??={message:String(error).slice(0,1000)};details.request=request;details.tools=sources.trail;await this.diagnostic({kind:'exchange.failure',documentId:sources.owner,exchangeId:request.exchange,details}).catch(()=>undefined);throw error;}finally{signal.removeEventListener('abort',close);if(id&&!prepared)await this.closeExchange(id);}
  };
  return {run,details,
   commit:async()=>{if(!retainedId||!history)return;const id=retainedId;const native=await history();await this.call('/exchange/'+id+'/ack',{manifest:native.manifest});retainedId='';},
   cancel:async()=>{if(retainedId){const id=retainedId;retainedId='';await this.closeExchange(id);}},
  };
 }
}
