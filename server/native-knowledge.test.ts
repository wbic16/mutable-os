// @vitest-environment node
import {afterEach,expect,it} from 'vitest';
import {promises as vfs} from './phext-fs.mjs';
import {testCavern} from '../src/knowledge-sqlite/phext-test-cavern.mjs';
import {promises as fs} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import express from 'express';
import {NativeKnowledgeJobs} from './native-knowledge-jobs';
import {NativeVaultStore} from './native-vault-store.mjs';
import {createNativeDocumentStoreRouter} from './native-document-store.mjs';
import {readSavedFacts} from './native-knowledge-routes.mjs';
import {fixtureText} from '../src/qualification/native-knowledge/fixture';
import {decode,extract} from '../src/qualification/native-knowledge/extract';
import {decodeFacts} from '../src/knowledge/transport';
import {encodeAuthoredValue} from '../src/history/preplan-spike/wire';
import {hash,ManagedPair} from '../src/persistence/managed-pair.mjs';
import {exportMarkdown} from '../src/persistence/markdown';
const cleanup:Array<()=>unknown>=[];afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();});
const bytes=(s=fixtureText(0,3))=>new TextEncoder().encode(s);
function jobs(options={}){const j=new NativeKnowledgeJobs(options),run=j.run.bind(j);j.run=(kind,input,options={})=>run(kind,input,{policy:{version:1,opaqueTypes:[]},...options});cleanup.push(()=>j.close());return j;}
async function temp(){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'native-p2-'));const cavern=testCavern(dir);cleanup.push(()=>cavern.close());cleanup.push(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
async function store(options={}){const root=await temp();await vfs.mkdir(path.join(root,'vault'));const data=bytes();await vfs.writeFile(path.join(root,'vault/a.mutable.json'),data);return {root,data,store:new NativeVaultStore({root,...options})};}
const request=(data:Uint8Array)=>({vault:'vault',location:{folder:'vault',filename:'a.mutable.json'},resourceId:'resource-0',byteHash:hash(data),policy:{version:1,opaqueTypes:[]}});
async function oracle(input:Uint8Array,policy?:any){const {location,generation,...facts}=await extract(decode(input),'unused','unused',undefined,undefined,policy);return facts;}
it('matches full decoder oracle for all facts and real producer resources without detaching caller bytes',async()=>{
 const j=jobs();for(const input of [bytes(),await fs.readFile('artifacts/flint-b1.2/rich.mutable.json'),await fs.readFile('artifacts/flint-b2/consumed.mutable.json')]){
  const before=input.slice(),r=await j.run('facts',input);expect(decodeFacts(r.wire!)).toEqual(await oracle(input));expect(input).toEqual(before);expect(r.byteHash).toBe(hash(input));
 }
});
it('preserves rich unknown authored values across worker and JSON HTTP grammar',async()=>{
 const v=JSON.parse(fixtureText(0,3)),p=v.document.blocks.find((b:any)=>b.id==='resource-0-p0');
 p.properties=encodeAuthoredValue({...p.properties,standoffProperties:[{id:'unknown',type:'future/value',start:0,end:2,value:{u:undefined,n:NaN,z:-0,inf:Infinity,tag:{$codexHistoryValue:['undefined']}}}]});
 const input=bytes(JSON.stringify(v)),r=JSON.parse(JSON.stringify(await jobs().run('facts',input)));expect(decodeFacts(r.wire)).toEqual(await oracle(input));
 const value:any=decodeFacts(r.wire).annotations[0].value;expect(Object.hasOwn(value,'u')).toBe(true);expect(Object.is(value.z,-0)).toBe(true);expect(Number.isNaN(value.n)).toBe(true);
});
it('matches plain/text/standoff coordinates and opaque/application policy on saved and full capture paths',async()=>{
 const v=JSON.parse(fixtureText(0,3)),root=v.document.blocks.find((b:any)=>b.id==='resource-0-root');
 for(const [id,type] of [['plain','plain-text-block'],['text','text-block'],['app','flint-application-block'],['opaque','custom-widget']]){
  v.document.blocks.push({id,type,properties:{text:'A🧭é漢'},children:[{placementId:id+'-child',kind:'owned',target:{kind:'local',blockId:id+'-body'}}]});
  v.document.blocks.push({id:id+'-body',type:'plain-text-block',properties:{text:'hidden'}});root.children.push({placementId:id+'-p',kind:'owned',target:{kind:'local',blockId:id}});
 }
 const input=bytes(JSON.stringify(v)),extraction={version:1 as const,opaqueTypes:['custom-widget']},r=decodeFacts((await jobs().run('facts',input,{policy:extraction})).wire!);
 expect(r).toEqual(await oracle(input,{extraction}));expect(r.blocks.find(b=>b.id==='plain')!.text).toEqual({coordinate:'utf16',runs:[{text:'A🧭é漢'}]});
 expect(r.blocks.some(b=>b.id==='app-body'||b.id==='opaque-body')).toBe(false);
});
it('rejects malformed wire, policy and oversized input; next valid job still works',async()=>{
 const j=jobs();for(const input of [bytes('{}'),new Uint8Array([255]),bytes(JSON.stringify({...JSON.parse(fixtureText(0,3)),version:99})),new Uint8Array(20*1024*1024+1)])await expect(j.run('facts',input)).rejects.toThrow();
 await expect(j.run('facts',bytes(),{policy:{version:2,opaqueTypes:[]} as any})).rejects.toThrow('policy');expect((await j.run('inspect',bytes())).inspection.resourceId).toBe('resource-0');
});
it('cancels active synchronous validation, recreates worker and preserves unrelated queued request',async()=>{
 const j=jobs(),c=new AbortController(),first=j.run('facts',bytes(),{signal:c.signal});const rejected=expect(first).rejects.toThrow('cancelled');const second=j.run('inspect',bytes());c.abort();await rejected;expect((await second).inspection.resourceId).toBe('resource-0');
 const already=new AbortController();already.abort();await expect(j.run('facts',bytes(),{signal:already.signal})).rejects.toThrow();
});
it('queued cancellation removes only that request; disposal rejects all outstanding requests',async()=>{
 const j=jobs(),a=j.run('facts',bytes()),c=new AbortController(),b=j.run('facts',bytes(),{signal:c.signal}),check=expect(b).rejects.toThrow('cancelled');c.abort();await check;await a;
 const x=j.run('facts',bytes()),y=j.run('inspect',bytes()),checks=[expect(x).rejects.toThrow('closed'),expect(y).rejects.toThrow('closed')];await j.close();await Promise.all(checks);await expect(j.run('inspect',bytes())).rejects.toThrow('closed');
});
it('bounds queue and byte retention without cancelling accepted work',async()=>{const j=jobs({maxQueue:1});const first=j.run('inspect',bytes());await expect(j.run('inspect',bytes())).rejects.toThrow('queue full');await first;});
it.each(['crash','timeout','stale','incomplete'])('%s never produces ready evidence and recreation accepts the next job',async kind=>{
 const root=await temp(),file=path.join(root,'worker.mjs');const sources={crash:"process.exit(7)",timeout:"import {parentPort} from 'node:worker_threads';parentPort.on('message',()=>{});",stale:"import {parentPort} from 'node:worker_threads';parentPort.on('message',r=>parentPort.postMessage({id:r.id-1,ok:true}));",incomplete:"import {parentPort} from 'node:worker_threads';parentPort.on('message',r=>parentPort.postMessage({id:r.id,ok:true,kind:r.kind}));"};
 await fs.writeFile(file,sources[kind]);const j=jobs({workerURL:new URL('file://'+file),timeoutMs:kind==='timeout'?100:10000});
 await expect(j.run('inspect',bytes())).rejects.toThrow(/exited|timed out|Stale|Incomplete/);
 await fs.writeFile(file,`import ${JSON.stringify(new URL('../dist/server/native-knowledge-worker.js',import.meta.url).href)};`);
 expect((await j.run('inspect',bytes())).inspection.resourceId).toBe('resource-0');
});
it('worker and legacy discovery agree on complete hierarchy, duplicates, projections and malformed files',async()=>{
 const f=await store();await vfs.mkdir(path.join(f.root,'vault/empty'));await vfs.writeFile(path.join(f.root,'vault/loose.md'),'source');
 const legacy=new NativeVaultStore({root:f.root,nativeDiscoveryWorker:false});expect(await f.store.discover('vault')).toEqual(await legacy.discover('vault'));
 await vfs.writeFile(path.join(f.root,'vault/copy.mutable.json'),f.data);await vfs.writeFile(path.join(f.root,'vault/bad.mutable.json'),'{}');
 const a=await f.store.discover('vault'),b=await legacy.discover('vault');expect(a.documents).toEqual(b.documents);expect(a.complete).toBe(false);expect(a.uninspected).toEqual(['vault/bad.mutable.json']);expect(a.diagnostics.map(d=>d.path??d.resourceId)).toEqual(b.diagnostics.map(d=>d.path??d.resourceId));
});
it.each(['failure','incomplete','stale'])('discovery %s remains unresolved, never clears duplicate uncertainty or authorizes relocation',async mode=>{
 const j=jobs(),f=await store();await vfs.writeFile(path.join(f.root,'vault/copy.mutable.json'),f.data);
 let n=0;f.store.inspect=async(data,signal)=>{if(++n%2){if(mode==='failure')throw Error('worker unavailable');if(mode==='incomplete')return {};return {...await j.run('inspect',data,{signal}),byteHash:'0'.repeat(64)};}return j.run('inspect',data,{signal});};
 const scan=await f.store.discover('vault');expect(scan.complete).toBe(false);expect(scan.uninspected).toHaveLength(1);expect(scan.documents).toHaveLength(1);
 await expect(readSavedFacts(f.store,request(f.data),{jobs:j})).rejects.toThrow('incomplete');
 await expect(f.store.relocate({operationId:crypto.randomUUID(),vault:'vault',kind:'pair',source:'vault/a.mutable.json',destination:'vault/moved.mutable.json',baselines:[]})).rejects.toThrow('incomplete');
 expect(await vfs.readFile(path.join(f.root,'vault/a.mutable.json'))).toEqual(Buffer.from(f.data));
});
it('discovery cancelled mid-inspection rejects rather than returning an empty/complete snapshot',async()=>{const c=new AbortController(),f=await store({inspect:async()=>{c.abort();throw Error('cancelled');}});await expect(f.store.discover('vault',{signal:c.signal})).rejects.toThrow();});
it.each(['changed','replaced','removed'])('discovery rejects %s file after inspection',async kind=>{
 const j=jobs(),f=await store();f.store.inspect=async data=>{const r=await j.run('inspect',data),file=path.join(f.root,'vault/a.mutable.json');if(kind==='changed')await vfs.writeFile(file,fixtureText(1,3));else {await vfs.unlink(file);if(kind==='replaced')await vfs.writeFile(file,data);}return r;};
 const scan=await f.store.discover('vault');expect(scan.complete).toBe(false);expect(scan.uninspected).toEqual(['vault/a.mutable.json']);expect(scan.documents).toEqual([]);
});
it('read-only actual HTTP route transports facts and rejects stale evidence without changing any file',async()=>{
 const f=await store({readOnly:true}),app=express();
 const v=JSON.parse(new TextDecoder().decode(f.data)),p=v.document.blocks.find(b=>b.id==='resource-0-p0');
 p.properties=encodeAuthoredValue({...p.properties,standoffProperties:[{id:'wire',type:'future/rich',start:0,end:2,value:{u:undefined,z:-0,n:NaN,inf:Infinity,tag:{$codexHistoryValue:['undefined']}}}]});
 f.data=bytes(JSON.stringify(v));await vfs.writeFile(path.join(f.root,'vault/a.mutable.json'),f.data);
 app.use('/api/native',createNativeDocumentStoreRouter({root:f.root,readOnly:true}));
 const server:any=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});cleanup.push(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const call=async body=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/native/vault/facts`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json()};};
 const a=await call(request(f.data));expect(a.Success).toBe(true);expect(decodeFacts(a.Data.wire)).toEqual(await oracle(f.data));
 expect((await call({...request(f.data),byteHash:'0'.repeat(64)})).status).toBe(409);expect(await vfs.readdir(path.join(f.root,'vault'))).toEqual(['a.mutable.json']);expect(await vfs.readFile(path.join(f.root,'vault/a.mutable.json'))).toEqual(Buffer.from(f.data));
});
it.each(['duplicate','relocation','change','symlink'])('saved route rejects %s introduced while extraction is running',async kind=>{
 const f=await store(),j=jobs(),proxy={run:async(...args:any[])=>{const r=await (j.run as any)(...args),file=path.join(f.root,'vault/a.mutable.json');
  if(kind==='duplicate')await vfs.writeFile(path.join(f.root,'vault/copy.mutable.json'),f.data);
  if(kind==='relocation')await vfs.rename(file,path.join(f.root,'vault/moved.mutable.json'));
  if(kind==='change')await vfs.writeFile(file,fixtureText(1,3));
  if(kind==='symlink'){await vfs.rename(file,path.join(f.root,'outside.mutable.json'));}return r;}}; // phext: the vault entry is gone; a disk symlink cannot replace it
 await expect(readSavedFacts(f.store,request(f.data),{jobs:proxy})).rejects.toThrow();
});
it.each(['after-native','before-receipt'])('changed and pending paired resources at %s are ineligible and reads never update pair evidence',async stageToFail=>{
 const f=await store(),r=decode(f.data),md=exportMarkdown(r),pair=new ManagedPair({root:path.join(f.root,'vault'),resourceId:r.resourceId,nativeName:'a.mutable.json',markdownName:'a.md'});
 await vfs.unlink(path.join(f.root,'vault/a.mutable.json')); // phext: the native side of the pair is removed through the Cavern
 const generation={resourceId:r.resourceId,generation:crypto.randomUUID(),native:new TextDecoder().decode(f.data),markdown:md.text,profile:md.profile,targets:[]};
 expect((await pair.save(generation)).phase).toBe('saved');
 expect((await f.store.discover('vault')).documents[0].state).toBe('paired');
 const receipt=JSON.stringify(await pair.receipt());await readSavedFacts(f.store,request(f.data));expect(JSON.stringify(await pair.receipt())).toBe(receipt);
 await vfs.writeFile(path.join(f.root,'vault/a.md'),'outside');await expect(readSavedFacts(f.store,request(f.data))).rejects.toThrow('state');
 await vfs.writeFile(path.join(f.root,'vault/a.md'),md.text);const baseline=(await f.store.discover('vault')).documents[0].baseline;
 const next=bytes(fixtureText(0,3).replace('observations','new observations')),projection=exportMarkdown(decode(next));
 pair.fault=async stage=>{if(stage===stageToFail)throw Error('hold');};
 expect((await pair.save({...generation,generation:crypto.randomUUID(),native:new TextDecoder().decode(next),markdown:projection.text},undefined,baseline)).phase).toBe(stageToFail==='after-native'?'canonical-saved-markdown-pending':'confirmation-pending');
 await expect(readSavedFacts(f.store,request(next))).rejects.toThrow('state');expect(JSON.stringify(await pair.receipt())).toBe(receipt);
});
it('requires explicit host extraction capabilities rather than guessing a widget registry',async()=>{const j=new NativeKnowledgeJobs();cleanup.push(()=>j.close());await expect(j.run('facts',bytes())).rejects.toThrow('Explicit');const f=await store();const {policy,...q}=request(f.data);await expect(readSavedFacts(f.store,q)).rejects.toThrow('Explicit');});
it.each(['prior-native','prior-pair','new-duplicate'])('late %s changes invalidate an already inspected part of discovery',async kind=>{
 const j=jobs(),f=await store();await vfs.writeFile(path.join(f.root,'vault/z.mutable.json'),fixtureText(1,3));let seen=0;
 f.store.inspect=async(data,signal)=>{const r=await j.run('inspect',data,{signal});if(++seen===2){
  if(kind==='prior-native')await vfs.writeFile(path.join(f.root,'vault/a.mutable.json'),fixtureText(2,3));
  if(kind==='prior-pair')await vfs.writeFile(path.join(f.root,'vault/a.md'),'external');
  if(kind==='new-duplicate')await vfs.writeFile(path.join(f.root,'vault/late.mutable.json'),f.data);
 }return r;};
 const scan=await f.store.discover('vault');expect(scan.complete).toBe(false);expect(scan.diagnostics.some(d=>/changed/.test(d.message))).toBe(true);
});
it('malformed derived transport cannot publish a partial or out-of-profile result',async()=>{
 const {encodeFacts}=await import('../src/knowledge/transport'),f=await oracle(bytes());
 for(const edit of [v=>v.extra=true,v=>v.blocks[1].text.coordinate='pixel',v=>v.blocks[1].text.runs[0].boundaries=[],v=>v.mentions[0].ranges[0].start=-1]){const value=structuredClone(f);edit(value);expect(()=>decodeFacts(encodeFacts(value))).toThrow();}
 expect(()=>decodeFacts(JSON.stringify({version:2,facts:{}}))).toThrow();
});
it('Facts text-budget exhaustion leaves valid identity inspection available and never emits partial success',async()=>{
 const v=JSON.parse(fixtureText(0,3)),p=v.document.blocks.find((b:any)=>b.id==='resource-0-p0');p.inline=[{kind:'text',text:'a'.repeat(2000001)}];const input=bytes(JSON.stringify(v)),j=jobs();
 expect((await j.run('inspect',input)).inspection.resourceId).toBe('resource-0');await expect(j.run('facts',input)).rejects.toThrow('bounded search budget');expect((await j.run('inspect',bytes())).inspection.resourceId).toBe('resource-0');
},15000);
it('shares discovery across browser/indexer stores and invalidates it after external changes',async()=>{
 const f=await store(),other=new NativeVaultStore({root:f.root});
 let scans=0;
 const first=f.store.discover.bind(f.store),second=other.discover.bind(other);
 f.store.discover=async(...args:any[])=>{scans++;return first(...args);};
 other.discover=async(...args:any[])=>{scans++;return second(...args);};
 const [a,b]=await Promise.all([f.store.discoverShared('vault'),other.discoverShared('vault')]);
 expect(a).toEqual(b);expect(scans).toBe(1);
 a.documents.length=0;
 expect((await other.discoverShared('vault')).documents).toHaveLength(1);
 await vfs.writeFile(path.join(f.root,'vault/external.json'),'{}');
 expect((await other.discoverShared('vault')).other).toContain('vault/external.json');
 expect(scans).toBe(2);
});
