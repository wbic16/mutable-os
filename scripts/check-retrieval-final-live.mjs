// Explicitly authorised Milestone C acceptance only. Copies, never user Documents.
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import Database from 'better-sqlite3';
import {openSqliteFoundation} from '../src/knowledge-sqlite/client.mjs';import {openRetrievalService} from '../src/retrieval/client.mjs';import {hash} from '../src/retrieval/passages.mjs';
import esbuild from 'esbuild';
await esbuild.build({stdin:{contents:"import {decodeDocument} from './src/block-tree/codecs';import {captureNative,nativeBytes} from './src/persistence/native-resource';export const encode=dto=>nativeBytes(captureNative(decodeDocument(dto).state,dto.id));",resolveDir:process.cwd()},outfile:'node_modules/.cache/retrieval-native-encode.mjs',bundle:true,platform:'node',format:'esm',packages:'external'});
const {encode}=await import('../node_modules/.cache/retrieval-native-encode.mjs');
const out=path.resolve('artifacts/retrieval-final');await fs.mkdir(out,{recursive:true});const ledger=path.join(out,'budget.json');
try{await fs.access(ledger);throw Error('Existing acceptance ledger: inspect before any rerun');}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.writeFile(ledger,JSON.stringify({queryCalls:0,indexCalls:0,generativeCalls:0}));
const root=await fs.mkdtemp(path.join(os.tmpdir(),'mutable-live-acceptance-'));await fs.mkdir(path.join(root,'.mutable'));
const db=new Database('vaults/imported/.mutable/mutable.db',{readonly:true});await db.backup(path.join(root,'.mutable/mutable.db'));const vaultGuid=db.prepare("SELECT value FROM SchemaInfo WHERE key='vaultGuid'").get().value;db.close();
const files=['documents/edgar-allan-poe/masque-of-the-red-death-[1c48f303].ink','Conversation on November 11, 2026 (3).ink'];
for(const file of files){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.copyFile(path.join('vaults/imported',file),path.join(root,file));}
const writer=await openSqliteFoundation({vault:root});const service=await openRetrievalService({vault:root,vaultGuid,verifySavedSources:true,providerModule:new URL('./retrieval-acceptance-provider.mjs',import.meta.url).href,providerOptions:{ledger}});
const indexId=(await service.status()).indexId;
const grant=(kind,maxTokens)=>({approved:true,id:'acceptance-'+kind,indexId,vaultGuid,model:'text-embedding-3-small',maxTokens,expiresAt:new Date(Date.now()+86400000).toISOString(),scope:{version:1,kind,vaultGuid}});
const documentConsent=grant('saved-vault-maintenance',20000),queryConsent=grant('interactive-queries',5000);
const config={root,vaultGuid,documentConsent,queryConsent,ledger,files};await fs.writeFile(path.join(out,'config.json'),JSON.stringify(config,null,2));
const result={started:new Date().toISOString(),index:[],queries:[],incremental:[]};
const query=async(label,q,resourceId,strategy='hybrid')=>{const start=performance.now();const r=await service.query(q,{strategy,resourceId,limit:5,consent:queryConsent});result.queries.push({label,query:q,ms:performance.now()-start,...r});console.log(label,JSON.stringify({timing:r.timing,usage:r.usage,results:r.results.map(x=>({text:x.text.slice(0,150),spans:x.source.spans}))}));return r;};
try{
 for(const id of ['5de5c3e7-983d-4467-829e-46cbdbe52b53','f4ce69a1-bfae-4770-902e-8f344cce1409']){const r=await service.index(id,{consent:documentConsent});result.index.push(r);console.log('indexed',JSON.stringify(r));}
 await query('poe-paraphrase','Where do the wealthy hide from the suffering of the outside world?','5de5c3e7-983d-4467-829e-46cbdbe52b53');
 await query('theseus-revision','How did the human change their view that physical composition is irrelevant to identity?','f4ce69a1-bfae-4770-902e-8f344cce1409');
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',filename='acceptance-disposable.ink';
 const stable='The amber observatory keeps a ledger of seasonal cloud patterns. Its instruments measure humidity without changing the historical record. '.repeat(30);
 const save=async(text)=>{const dto={id,type:'document-block',metadata:{title:'Disposable acceptance'},children:[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',type:'standoff-editor-block',text:stable},...(text?[{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',type:'standoff-editor-block',text}]:[])]};const bytes=Buffer.from(encode(dto));await fs.writeFile(path.join(root,filename),bytes);const staged=await writer.stageSaved({bytes,vaultGuid,evidence:{path:filename,contentHash:hash(bytes)}});await writer.commitSaved(staged.token);};
 await save('At the violet harbour, the Zephyr archival vessel carries ceramic astrolabes to the moonlit island.');result.incremental.push({phase:'added',...await service.index(id,{consent:documentConsent})});
 const first=await query('disposable-added','Which vessel transports astronomical artefacts to an island?',id);assert(first.results.some(x=>x.text.includes('Zephyr')));
 const old={vaultGuid,resourceId:id,stamp:first.results[0].stamp};
 await save('The Zephyr archival vessel is retired. The copper airship now carries carved sundials to a mountain station.');await assert.rejects(service.verify(old),/Stale|superseded/);result.incremental.push({phase:'edited',oldReferenceRejected:true,...await service.index(id,{consent:documentConsent})});
 assert(result.incremental.at(-1).reused>0);await query('disposable-edited','What transports timekeeping instruments to the elevated research post?',id);
 await save(null);result.incremental.push({phase:'removed',...await service.index(id,{consent:documentConsent})});const gone=await service.query('Zephyr',{strategy:'lexical',resourceId:id});assert.equal(gone.results.length,0);result.incremental.push({phase:'removed-confirmed',obsoleteLexicalHits:0,unchanged:await service.index(id,{consent:documentConsent})});
 const raw=new Database(path.join(root,'.mutable/retrieval.db'),{readonly:true});assert.equal(raw.prepare("SELECT count(*) n FROM Passage WHERE resourceId=? AND text LIKE '%Zephyr%'").get(id).n,0);raw.close();
 result.status=await service.status();
}finally{await fs.writeFile(path.join(out,'live-retrieval.json'),JSON.stringify(result,null,2));await service.close();await writer.close();console.log('Retained isolated test vault',root);}
