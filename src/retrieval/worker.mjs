import {parentPort,workerData,isMainThread} from 'node:worker_threads';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {openRetrievalStore,stamp} from './store.mjs';
import {validateConsent} from './consent.mjs';
import {planPassages,hash,tokens} from './passages.mjs';
assert(!isMainThread);
let store,provider,verifySaved;const controllers=new Map();
try{store=openRetrievalStore(workerData);provider=(await import(workerData.providerModule??new URL('./provider.mjs',import.meta.url).href)).createProvider(workerData.providerOptions);assert.equal(provider.identity.model,store.profile.model);assert.equal(provider.identity.provider,store.profile.provider);assert.equal(provider.identity.dimensions,store.profile.dimensions);
 if(workerData.verifySavedSources){const bundled=new URL('./saved-source.mjs',import.meta.url);verifySaved=(await import((existsSync(bundled)?bundled:new URL('../../dist/server/retrieval/saved-source.mjs',import.meta.url)).href)).savedSourceVerifier(workerData.vault);}
 parentPort.postMessage({ready:true});}catch(e){store?.close();store=undefined;parentPort.postMessage({startupError:e.message});parentPort.close();}
if(store&&provider){
 const active=new Set();const epoch=workerData.epoch;
 const quiet=async(check)=>{while(Atomics.load(new BigInt64Array(epoch.buffer,8,1),0)>BigInt(Date.now())){check();await new Promise(r=>setTimeout(r,100));}check();};
 async function embedding(texts,scope,grant,signal,check){
  check();assert(texts.length<=128);const count=texts.reduce((sum,s)=>sum+tokens(s),0);assert(count<=50000,'Embedding batch budget exceeded');let receipt,receipted=false;
  if(provider.external){validateConsent(grant,{vaultGuid:store.vaultGuid,indexId:store.indexId,model:provider.identity.model,scope,queryHash:hash(texts[0])});
   receipt=store.reserve(grant,count,hash(JSON.stringify([scope,texts.map(hash)])));
  }
  const start=performance.now();try{const result=await provider.embed(texts,{signal,scope});const ms=performance.now()-start;
   assert.equal(result.vectors.length,texts.length);for(const v of result.vectors){assert(v.length===store.profile.dimensions&&v.every(Number.isFinite),'Invalid embedding');assert(v.some(n=>n!==0),'Zero embedding');}
   const vectors=result.vectors.map(v=>Buffer.from(new Float32Array(v).buffer));
   if(scope.kind==='document')store.cacheVectors(texts,vectors);
   if(receipt){store.receipt(receipt,{actual:result.usage,providerMs:ms,requestId:result.requestId,status:'complete'});receipted=true;}check();
   return {vectors,providerMs:ms,usage:result.usage??0};
  }catch(e){if(receipt&&!receipted)store.receipt(receipt,{providerMs:performance.now()-start,status:'failed-or-unknown'});throw e;}
 }
 async function run(operation,payload,signal,check){
  const budget={bytes:0};
  const verify=async(resource,expected)=>{check();assert(resource?.indexStatus==='complete'&&store.current(resource.guid,expected),'Stale source reference; saved source superseded');if(verifySaved)await verifySaved(resource,signal,budget);check();assert(store.current(resource.guid,expected),'Saved source superseded');};
  const verifiedResults=async result=>{
   if(!verifySaved)return result;
   const proofs=new Map(),results=[];let omitted=0;
   for(const hit of result.results){check();let valid=proofs.get(hit.source.resourceId);
    if(valid===undefined){try{await verify(store.resource(hit.source.resourceId),hit.stamp);valid=true;}catch{check();valid=false;}proofs.set(hit.source.resourceId,valid);}
    if(valid&&store.current(hit.source.resourceId,hit.stamp))results.push(hit);else omitted++;
   }
   for(const hit of results)assert(store.current(hit.source.resourceId,hit.stamp),'Query source superseded');
   return {...result,results,evidence:results.length?(omitted?'incomplete-evidence':result.evidence):'no-established-evidence',coverage:{...result.coverage,complete:false,sourceVerification:'exact-saved-file',unverifiedCandidates:omitted,verifiedResources:[...proofs.values()].filter(Boolean).length,verificationBytes:budget.bytes}};
  };
  if(operation==='index'){
   await quiet(check);
   const saved=store.resource(payload.resourceId);assert(saved?.indexStatus==='complete','Saved projection unavailable');const expected=stamp(saved);check();if(payload.contentHash)assert.equal(payload.contentHash,saved.contentHash,'Confirmation superseded');
   await verify(saved,expected);
   if(store.indexedStamp(payload.resourceId)===expected)return {unchanged:true,embedded:0,projectionReads:0};
   const p=store.projection(payload.resourceId);assert.equal(stamp(p.resource),expected,'Saved source superseded');
   const start=performance.now(),chunks=planPassages(p,store.profile,check),missing=new Map(),vectors=new Map();
   for(const c of chunks){check();const cached=store.cached(c.inputHash);if(cached)vectors.set(c.inputHash,cached);else missing.set(c.inputHash,c.text);}
   const planningMs=performance.now()-start;let providerMs=0,usage=0;
   const pending=[...missing];for(let i=0;i<pending.length;i+=64){await quiet(check);budget.bytes=0;await verify(saved,expected);const batch=pending.slice(i,i+64),r=await embedding(batch.map(x=>x[1]),{kind:'document',resourceId:p.resource.guid,sourceHash:p.resource.contentHash},payload.consent,signal,check);r.vectors.forEach((v,j)=>vectors.set(batch[j][0],v));providerMs+=r.providerMs;usage+=r.usage;}
   await quiet(check);budget.bytes=0;await verify(saved,expected);const publish=performance.now();store.publish(p,chunks,vectors,expected,check);return {resourceId:p.resource.guid,passages:chunks.length,embedded:missing.size,reused:chunks.filter(c=>!missing.has(c.inputHash)).length,planningMs,providerMs,publicationMs:performance.now()-publish,usage};
  }
  if(operation==='query'){
   assert(typeof payload.query==='string'&&payload.query.trim()&&payload.query.length<=4096,'Query must be 1–4096 characters');assert(tokens(payload.query)<=1024,'Query token budget exceeded');
   const strategy=payload.strategy??'hybrid';let vector,providerMs=0,usage=0;
   if(strategy==='lexical'){const start=performance.now(),result=await verifiedResults(store.lexical(payload.query,payload,check));return {...result,timing:{providerMs:0,localMs:performance.now()-start},usage:0};}
   if(strategy!=='lexical'){if(payload.requireIndex)assert(payload.resourceId?store.indexedStamp(payload.resourceId):store.db.prepare('SELECT count(*) n FROM SavedResource').get().n,'Semantic index not ready for this scope');const r=await embedding([payload.query],{kind:'query'},payload.consent,signal,check);[vector]=r.vectors;providerMs=r.providerMs;usage=r.usage;}
   check();const start=performance.now();const result=await verifiedResults(store.rank(payload.query,vector,payload,check));check();return {...result,timing:{providerMs,localMs:performance.now()-start},usage,profile:store.profile,provenance:{vaultGuid:store.vaultGuid,profileKey:store.profileKey}};
  }
  if(operation==='verify'){check();assert.equal(payload.vaultGuid,store.vaultGuid);await verify(store.resource(payload.resourceId),payload.stamp);return {currency:'verified-saved-projection',liveCurrency:'unknown'};}
  if(operation==='inventory')return store.inventory();
  if(operation==='reconcile'){store.reconcile();return {reconciled:true};}
  if(operation==='status')return {profile:store.profile,indexId:store.indexId,usage:store.db.prepare('SELECT * FROM Usage').all(),knownResources:store.inventory().length,resources:store.db.prepare('SELECT count(*) n FROM SavedResource').get().n,passages:store.db.prepare('SELECT count(*) n FROM Passage').get().n,embeddings:store.db.prepare('SELECT count(*) n FROM Embedding').get().n,receipts:store.db.prepare('SELECT * FROM Receipt ORDER BY id DESC LIMIT 100').all()};
  throw Error('Unsupported retrieval operation');
 }
 parentPort.on('message',message=>{
  if(message.cancel){controllers.get(message.cancel)?.abort(Error('Retrieval cancelled'));return;}
  const {id,operation,payload={}}=message;
  if(operation==='close'){for(const c of controllers.values())c.abort();Promise.allSettled([...active]).then(()=>{store.close();parentPort.postMessage({id,value:{closed:true}});parentPort.close();});return;}
  const controller=new AbortController();controllers.set(id,controller);const initial=payload.expectedEpoch;
  const check=()=>{controller.signal.throwIfAborted();if(operation!=='status')assert(Atomics.load(epoch,1),'Saved scope is not currently confirmed');assert(!payload.cancellation||!Atomics.load(payload.cancellation,0),'Retrieval cancelled');assert.equal(Atomics.load(epoch,0),initial,'Retrieval superseded');};
  const task=(async()=>{try{check();const value=await run(operation,payload,controller.signal,check);check();parentPort.postMessage({id,value});}catch(e){parentPort.postMessage({id,error:e.message});}finally{controllers.delete(id);}})();active.add(task);void task.finally(()=>active.delete(task));
 });
}
