import { prepareInterchange, type InterchangeRequest, type Prepared } from '../interchange/operations';
/** Explicit operations only. One worker, released on completion, cancellation or timeout. */
export async function runInterchange<R extends InterchangeRequest>(request:R,signal:AbortSignal):Promise<Prepared<R>> {
 if(signal.aborted)throw Error('Operation cancelled.');
 if(typeof Worker==='undefined') {await new Promise(resolve=>setTimeout(resolve,0));if(signal.aborted)throw Error('Operation cancelled.');return await prepareInterchange(request) as Prepared<R>;}
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('../interchange/operations.worker.ts',import.meta.url),{type:'module'});
  const finish=(error?:string,result?:Prepared<R>)=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);worker.terminate();error?reject(Error(error)):resolve(result!);};
  const cancel=()=>finish('Operation cancelled.');
  const timer=setTimeout(()=>finish('Interchange preparation timed out. Try a smaller input.'),request.kind==='tei-document'?(request.limits?.timeoutMs??120000):request.kind==='structured-preview'?3000:30000);
  signal.addEventListener('abort',cancel,{once:true});
  // Only the operations reply settles the call. Libraries evaluated inside
  // the worker can post their own protocol messages on this channel (pdf.js,
  // when it falls back to a self-hosted worker, announces {sourceName:'worker',
  // action:'ready'}); those carry neither field and must not resolve the call
  // with undefined.
  worker.onmessage=e=>{const data=e.data as {error?:string;result?:Prepared<R>}|undefined;if(!data||!('error' in data||'result' in data))return;finish(data.error,data.result);};worker.onerror=()=>finish('Interchange worker failed.');
  try{worker.postMessage(request);}catch(e){finish(String(e));}
 });
}
