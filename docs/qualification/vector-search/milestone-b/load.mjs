/** Temporary concurrent indexing workload for the existing real Flint typing harness. No provider/network. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {openSqliteFoundation} from '../../../../src/knowledge-sqlite/client.mjs';import {openRetrievalService} from '../../../../src/retrieval/client.mjs';import {hash} from '../../../../src/retrieval/passages.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'retrieval-load-')),stop='artifacts/retrieval-b/stop-load';if(fs.existsSync(stop))fs.unlinkSync(stop);
const writer=await openSqliteFoundation({vault:root,initialize:true}),vaultGuid=(await writer.inspect()).mutable.vaultGuid;
const service=await openRetrievalService({vault:root,vaultGuid,profile:{provider:'test',model:'deterministic-test',dimensions:32},providerModule:new URL('../../../../src/retrieval/test-provider.mjs',import.meta.url).href});
const rows=[];let turns=0;const started=Date.now();
try{while(!fs.existsSync(stop)&&Date.now()-started<90000){
 const bytes=Buffer.from(JSON.stringify({id:'load',type:'document-block',metadata:{title:'round '+turns},children:Array.from({length:40},(_,i)=>({id:'block-'+i,type:'standoff-editor-block',text:(`Paragraph ${i}: repair and destruction differ in their effects on the organised vessel. `).repeat(10)}))}));
 const begin=performance.now(),job=await writer.stageSaved({vaultGuid,bytes,evidence:{path:'load.ink',contentHash:hash(bytes)}});await writer.commitSaved(job.token);const saved=performance.now()-begin;
 rows.push({savedProjectionMs:saved,...await service.index('load')});turns++;if(turns===1)fs.writeFileSync('artifacts/retrieval-b/load-ready','ready');
}fs.writeFileSync('artifacts/retrieval-b/concurrent-indexing.json',JSON.stringify({turns,rows},null,2));
}finally{await service.close();await writer.close();fs.rmSync(root,{recursive:true,force:true});}
