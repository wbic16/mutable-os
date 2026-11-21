import {AsyncLocalStorage} from 'node:async_hooks';
import {appendFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

type Context={sessionId:string;documentId?:string;exchangeId?:string;secrets?:string[]};
/** Opt-in test-phase diagnostics, separate from native Documents and provider memory. */
export class DcpTestLog {
 readonly context=new AsyncLocalStorage<Context>();
 private sequence=0;private pending=Promise.resolve();
 private run=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID();
 constructor(private root:()=>string,readonly enabled:boolean){}
 private clean(value:unknown,secrets:string[]=[]){
  function redact(this:any,key:string,v:any):any {
   if(key==='body'&&typeof v==='string'){try{return JSON.stringify(JSON.parse(v),redact);}catch{return v;}}
   if(key==='file_data'||key==='image_url'&&typeof v==='string'&&v.startsWith('data:')||key==='data'&&this?.type==='base64')return '[ATTACHMENT BYTES OMITTED]';
   return /^(authorization|cookie|set-cookie|(?:x-)?api[-_]?key|secret|token|x-dialectic-session|x-mutable-cavern)$/i.test(key)?'[REDACTED]':v;
  }
  let text=JSON.stringify(value,redact);
  for(const secret of secrets.filter(s=>s.length>=8))text=text.split(secret).join('[REDACTED]');
  return text.replace(/sk-(?:proj-|ant-)?[a-zA-Z0-9_-]{16,}/g,'[REDACTED]');
 }
 write(event:string,data:unknown){
  if(!this.enabled)return Promise.resolve();
  const directory=path.join(this.root(),'.mutable','dcp-test-phase'),context=this.context.getStore();
  const line=this.clean({version:1,sequence:++this.sequence,utc:new Date().toISOString(),sessionId:context?.sessionId,documentId:context?.documentId,exchangeId:context?.exchangeId,event,data},context?.secrets)+'\n';
  const work=this.pending.then(async()=>{await mkdir(directory,{recursive:true,mode:0o700});await appendFile(path.join(directory,this.run+'.jsonl'),line,{mode:0o600});});
  this.pending=work.catch(()=>undefined);return work;
 }
 flush(){return this.pending;}
 fetch(fetcher:typeof fetch):typeof fetch {
  if(!this.enabled)return fetcher;
  return async(input,init)=>{
   const headers=new Headers(init?.headers),inherited=this.context.getStore();
   const context={...inherited,sessionId:inherited?.sessionId??'server',secrets:[...(inherited?.secrets??[]),headers.get('authorization')?.replace(/^Bearer /i,''),headers.get('x-api-key')].filter((s):s is string=>!!s)},requestId=randomUUID(),url=String(input);
   const log=(event:string,data:unknown)=>this.context.run(context??{sessionId:'server'},()=>this.write(event,{requestId,url,...data as object}));
   await log('provider.request',{method:init?.method??'GET',headers:Object.fromEntries(headers),body:init?.body??null});
   let response:Response;
   try{response=await fetcher(input,init);}catch(error){await log('provider.network-error',{error:String(error)});throw error;}
   await log('provider.response',{status:response.status,headers:Object.fromEntries(response.headers),contentType:response.headers.get('content-type'),providerRequestId:response.headers.get('x-request-id')??response.headers.get('request-id')});
   // Image payloads are retained by the attachment store, not duplicated in diagnostics.
   if(!response.body||url==='https://api.openai.com/v1/images/generations')return response;
   const reader=response.body.getReader(),decoder=new TextDecoder();let text='',bytes=0,finished=false;
   const finish=async(status:string,error?:unknown)=>{if(finished)return;finished=true;text+=decoder.decode();await log('provider.response-body',{status,body:text,bytes,...(error?{error:String(error)}:{})});};
   // Capture the consumed wire stream, without teeing an unbounded second reader.
   const body=new ReadableStream<Uint8Array>({
    async pull(controller){try{const r=await reader.read();if(r.done){await finish('complete');controller.close();return;}bytes+=r.value.byteLength;text+=decoder.decode(r.value,{stream:true});if(bytes>3*1024*1024){await finish('wire-limit');await reader.cancel();throw Error('Provider diagnostic wire limit exceeded.');}controller.enqueue(r.value);}catch(error){await finish('interrupted',error);controller.error(error);}},
    async cancel(reason){await reader.cancel(reason);await finish('cancelled',reason);},
   });
   return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
  };
 }
}
