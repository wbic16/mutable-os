/** Authorized two-query check. Uses existing Milestone A vectors for all Document text. No generation. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {parseEnv} from 'node:util';import {openSqliteFoundation} from '../../../../src/knowledge-sqlite/client.mjs';import {openRetrievalService} from '../../../../src/retrieval/client.mjs';import {hash,tokens} from '../../../../src/retrieval/passages.mjs';
const evidence='docs/qualification/vector-search/milestone-b/live.json';if(fs.existsSync(evidence))throw Error('Live attempt already recorded; no automatic paid replay');
const cache=path.resolve('artifacts/vector-search-milestone-a/embeddings.json');const sources=JSON.parse(fs.readFileSync('artifacts/vector-search-milestone-a/upload-manifest.json')).sources;
const queries=['What happens whenever the ebony clock strikes, and how does the ending transform its significance?','How did the human’s claim that physical composition is irrelevant change during the discussion, and how did the agent revise it?'];
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mutable-retrieval-live-'));let writer,service;
const evidenceData={consent:'User explicitly approved these two query calls; max 1000 tokens; no Document uploads',root,queries,plannedTokens:queries.reduce((s,q)=>s+tokens(q),0),results:[],status:'preparing'};
const record=()=>fs.writeFileSync(evidence,JSON.stringify(evidenceData,null,2)+'\n');
try{
 writer=await openSqliteFoundation({vault:root,initialize:true});const vaultGuid=(await writer.inspect()).mutable.vaultGuid;
 for(const s of sources){const bytes=fs.readFileSync(s.path);if(hash(bytes)!==s.sha256)throw Error('Fixture changed');const job=await writer.stageSaved({bytes,vaultGuid,evidence:{path:path.basename(s.path),contentHash:s.sha256}});await writer.commitSaved(job.token);}
 service=await openRetrievalService({vault:root,vaultGuid,providerModule:new URL('../../../../src/retrieval/test-provider.mjs',import.meta.url).href,providerOptions:{cacheFile:cache,identity:{provider:'openai',model:'text-embedding-3-small',dimensions:1536}}});
 evidenceData.indexing=await service.reconcile();if(evidenceData.indexing.issues.length)throw Error(JSON.stringify(evidenceData.indexing.issues));await service.close();
 process.env.OPENAI_API_KEY??=parseEnv(fs.readFileSync('.env.local','utf8')).OPENAI_API_KEY;
 service=await openRetrievalService({vault:root,vaultGuid});const indexId=(await service.status()).indexId;
 const consent={approved:true,id:'milestone-b-two-approved-queries',indexId,vaultGuid,model:'text-embedding-3-small',maxTokens:1000,queries:queries.map(hash),expiresAt:new Date(Date.now()+3600000).toISOString()};
 evidenceData.status='live-started';record();
 for(const query of queries){const start=performance.now(),r=await service.query(query,{consent});evidenceData.results.push({query,endToEndMs:performance.now()-start,...r});record();}
 evidenceData.receipts=(await service.status()).receipts;evidenceData.actualTokens=evidenceData.receipts.reduce((s,r)=>s+(r.actual??0),0);evidenceData.costUsd=evidenceData.actualTokens*.02/1e6;evidenceData.databaseBytes=fs.statSync(path.join(root,'.mutable/retrieval.db')).size;evidenceData.status='complete';record();console.log(JSON.stringify({status:evidenceData.status,actualTokens:evidenceData.actualTokens,costUsd:evidenceData.costUsd,results:evidenceData.results.map(r=>({timing:r.timing,endToEndMs:r.endToEndMs,hits:r.results.length}))}));
}catch(e){evidenceData.status='failed';evidenceData.error=String(e);record();throw e;}finally{await service?.close();await writer?.close();}
