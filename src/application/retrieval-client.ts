import {featureFlags} from '../configuration';
let backgroundEnabled=false;
export async function retrievalRequest(action:string,body:unknown={},signal?:AbortSignal):Promise<any>{
 if(!featureFlags.semanticRetrieval)throw Error('Semantic retrieval disabled');
 const response=await fetch(`/api/retrieval/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
 const result=await response.json();if(!response.ok||result.Success!==true)throw Error(result.Error??'Retrieval unavailable');if(['status','configure','refresh'].includes(action))backgroundEnabled=result.Data.documents===true&&result.Data.provider?.configured===true;return result.Data;
}
/** Mount/admission boundary only; no typing or per-Cell subscriptions. */
let lastForeground=0;
export function retrievalForeground(){if(Date.now()-lastForeground<1000)return;lastForeground=Date.now();if(featureFlags.semanticRetrieval&&backgroundEnabled)void retrievalRequest('foreground').catch(()=>{});}
