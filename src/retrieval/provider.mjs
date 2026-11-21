/** Embedding-only adapter; no Dialectic provider configuration or generative endpoint. */
import assert from 'node:assert/strict';
export function createProvider(options={}){
 return {external:true,identity:{provider:'openai',model:'text-embedding-3-small',dimensions:1536},async embed(texts,{signal}){
  const key=options.apiKey??process.env.OPENAI_API_KEY;assert(key,'Embedding API key unavailable');
  const response=await fetch('https://api.openai.com/v1/embeddings',{method:'POST',signal:AbortSignal.any([signal,AbortSignal.timeout(30000)]),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'text-embedding-3-small',input:texts,dimensions:1536,encoding_format:'float'})});
  if(!response.ok)throw Error(`Embedding provider HTTP ${response.status}; no automatic retry`);
  const body=await response.json();assert.equal(body.model,'text-embedding-3-small');assert.equal(body.data?.length,texts.length);
  const vectors=Array(texts.length),seen=new Set();for(const r of body.data){assert(Number.isInteger(r.index)&&r.index>=0&&r.index<texts.length&&!seen.has(r.index));seen.add(r.index);vectors[r.index]=r.embedding;}
  assert(Number.isInteger(body.usage?.total_tokens)&&body.usage.total_tokens>=0);
  return {vectors,usage:body.usage.total_tokens,requestId:response.headers.get('x-request-id')};
 }};
}
