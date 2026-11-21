import http from 'node:http';
/** Temporary concurrent indexing workload for the existing real Flint typing harness. No provider/network. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {openSqliteFoundation} from '../../../../src/knowledge-sqlite/client.mjs';import {openRetrievalService} from '../../../../src/retrieval/client.mjs';import {hash} from '../../../../src/retrieval/passages.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'retrieval-load-')),stop='artifacts/retrieval-c/stop-load';if(fs.existsSync(stop))fs.unlinkSync(stop);
const writer=await openSqliteFoundation({vault:root,initialize:true}),vaultGuid=(await writer.inspect()).mutable.vaultGuid;
const service=await openRetrievalService({vault:root,vaultGuid,profile:{provider:'test',model:'deterministic-test',dimensions:32},providerModule:new URL('../../../../src/retrieval/test-provider.mjs',import.meta.url).href});
let quietUntil=0;const httpServer=http.createServer((req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');if(req.method==='OPTIONS'){res.end();return;}if(req.url==='/foreground'){quietUntil=Date.now()+5000;service.pauseMaintenance(5000);}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:true,Data:{documents:true,provider:{configured:true}}}));});await new Promise(r=>httpServer.listen(3018,'127.0.0.1',r));
const rows=[];let turns=0;const started=Date.now();
try{while(!fs.existsSync(stop)&&Date.now()-started<90000){
 while(Date.now()<quietUntil)await new Promise(r=>setTimeout(r,100));
 const bytes=Buffer.from(JSON.stringify({id:'load',type:'document-block',metadata:{title:'round '+turns},children:Array.from({length:40},(_,i)=>({id:'block-'+i,type:'standoff-editor-block',text:(`Paragraph ${i}: repair and destruction differ in their effects on the organised vessel. `).repeat(10)}))}));
 const begin=performance.now(),job=await writer.stageSaved({vaultGuid,bytes,evidence:{path:'load.ink',contentHash:hash(bytes)}});await writer.commitSaved(job.token);const saved=performance.now()-begin;
 rows.push({savedProjectionMs:saved,...await service.index('load')});await new Promise(r=>setTimeout(r,750));turns++;if(turns===1)fs.writeFileSync('artifacts/retrieval-c/load-ready','ready');
}fs.writeFileSync('artifacts/retrieval-c/concurrent-indexing.json',JSON.stringify({turns,rows},null,2));
}finally{httpServer.close();await service.close();await writer.close();fs.rmSync(root,{recursive:true,force:true});}
