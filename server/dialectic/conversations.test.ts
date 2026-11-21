// @vitest-environment node
import {it,expect,afterEach,vi} from 'vitest';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {OpenAIConversations} from './conversations';
import {conversation,providerTurn,continuation} from './providers';
import {defaultProviderSettings} from '../../src/features/dialectic/dcp/provider-contract';
import {plainContribution,sse,streamFixture} from './fixtures';
import {historyBaseJson,type ContinuityManifest,type HistoryItem} from '../../src/features/dialectic/dcp/continuity-contract';
const clean:string[]=[];afterEach(async()=>{await Promise.all(clean.splice(0).map(p=>rm(p,{recursive:true,force:true})));});
const entry=(id:string,text=id)=>{const content=JSON.stringify({kind:'native-contribution',id,text});return {stamp:{id,digest:createHash('sha256').update(historyBaseJson(JSON.parse(content))).digest('hex')},item:{role:'user',content} as HistoryItem};};
async function setup(){const root=await mkdtemp(path.join(tmpdir(),'mutable-continuity-'));clean.push(root);const remote=new Map<string,any[]>(),fetcher=vi.fn<typeof fetch>(async(url,init)=>{
 const p=new URL(String(url)).pathname,body=init?.body?JSON.parse(String(init.body)):undefined;
 if(p==='/v1/conversations'){const id='conv_'+(remote.size+1);remote.set(id,[]);return Response.json({id});}
 const id=p.split('/')[3];if(!remote.has(id))return new Response('',{status:404});if(body)remote.get(id)!.push(...body.items);return Response.json({id});
 });const scope={path:root,cavernGuid:'cavern',session:'session'},service=new OpenAIConversations(()=>scope,fetcher),manifest:ContinuityManifest={cavernId:'cavern',session:'session',documentId:'document',participantId:'ai',history:[],receipts:[]};return {root,remote,fetcher,scope,service,manifest};}
it('reuses durable memory after reload, sends only deltas and isolates participant and connection',async()=>{
 const f=await setup(),m=f.manifest,key='fixture-secret',items=[] as HistoryItem[];
 for(let i=0;i<12;i++){const e=entry('human-'+i);m.history.push(e.stamp);items.push(e.item);}
 const plan=await f.service.plan(m,key),receipt=await f.service.begin(m,plan,items,'exchange-1',key,new AbortController().signal);await f.service.prepared(m,key,'exchange-1',false);
 const ai=entry('ai-1');m.history.push(ai.stamp);m.receipts.push(receipt);await f.service.acknowledge(m,key,receipt);
 const restarted=new OpenAIConversations(()=>f.scope,f.fetcher),next=entry('human-12');m.history.push(next.stamp);
 const p2=await restarted.plan(m,key);expect(p2.start).toBe(13);const r2=await restarted.begin(m,p2,[next.item],'exchange-2',key,new AbortController().signal);expect(r2.conversationId).toBe(receipt.conversationId);expect(f.remote.get(r2.conversationId)).toHaveLength(13);
 await restarted.abandon(m,key,'exchange-2');
 const other=await restarted.plan({...m,participantId:'other-ai'},key),connection=await restarted.plan(m,'another-key');expect(other.binding).not.toBe(plan.binding);expect(connection.binding).not.toBe(plan.binding);
 const bytes=await Promise.all((await readdir(path.join(f.root,'.mutable','dialectic-continuity'))).filter(n=>n.endsWith('.json')).map(n=>readFile(path.join(f.root,'.mutable','dialectic-continuity',n),'utf8')));expect(bytes.join('')).not.toContain(key);expect(bytes.join('')).not.toContain('native-contribution');
},30000);
it('quarantines failed/duplicate exchanges and reconciles a saved native receipt without another generation',async()=>{
 const f=await setup(),m=f.manifest,key='key',e=entry('first');m.history.push(e.stamp);const p=await f.service.plan(m,key),r=await f.service.begin(m,p,[e.item],'x1',key,new AbortController().signal);
 await expect(f.service.begin(m,p,[e.item],'x1',key,new AbortController().signal)).rejects.toThrow();expect(f.remote.size).toBe(1);
 await f.service.abandon(m,key,'x1');const recovered=await f.service.plan(m,key);expect(recovered.recovery).toBe(true);expect(recovered.start).toBe(0);
 const r2=await f.service.begin(m,recovered,[e.item],'x2',key,new AbortController().signal);expect(r2.conversationId).not.toBe(r.conversationId);await f.service.prepared(m,key,'x2',false);
 m.history.push(entry('ai').stamp);m.receipts.push(r2);const reconciled=await f.service.plan(m,key);expect(reconciled.recovery).toBe(false);expect(reconciled.start).toBe(2);expect(reconciled.generation).toBe(r2.generation);
 const undo={...m,history:[e.stamp],receipts:[]};const rollback=await f.service.plan(undo,key);expect(rollback.recovery).toBe(true);expect(rollback.start).toBe(0);
},30000);
it('persistent Responses continuation never resends automatically stored output',async()=>{
 const state=conversation(defaultProviderSettings,{exchange:'exchange',protocolKey:{text:'DCP'}});state.conversationId='conv_fixture';
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(sse(streamFixture('openai','',{id:'call1',name:'read_source',arguments:{handle:'fresh'}}))).mockResolvedValueOnce(sse(streamFixture('openai',JSON.stringify(plainContribution('exchange')))));
 const signal=new AbortController().signal,first=await providerTurn(state,'fixture-key',signal,()=>{},fetcher);continuation(state,first.calls,[{text:'Source',handle:'fresh'}]);await providerTurn(state,'fixture-key',signal,()=>{},fetcher);
 const bodies=fetcher.mock.calls.map(c=>JSON.parse(String(c[1]?.body)));expect(bodies[0]).toMatchObject({conversation:'conv_fixture',store:true,truncation:'disabled'});expect(bodies[1].input).toHaveLength(1);expect(bodies[1].input[0].type).toBe('function_call_output');expect(state.input).toEqual([]);
});
it('keeps checkpoints stable across sorted Save JSON and annotation-only changes',()=>{
 const original={id:'a',participant:{id:'p',kind:'human',name:'Person'},composition:{text:'Original',annotations:[{type:'style/bold'}]}};
 const saved=JSON.parse(JSON.stringify(original,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v));saved.composition.annotations.push({type:'dialectic/claim'});
 expect(historyBaseJson(saved)).toBe(historyBaseJson(original));saved.composition.text='Changed';expect(historyBaseJson(saved)).not.toBe(historyBaseJson(original));
});
it('rebuilds after a repaired native commit with a lost ACK, and rejects content hidden in manifest stamps',async()=>{
 const f=await setup(),m=f.manifest,e=entry('human'),ai=entry('ai');m.history=[e.stamp];const p=await f.service.plan(m,'key'),receipt=await f.service.begin(m,p,[e.item],'repair','key',new AbortController().signal);await f.service.prepared(m,'key','repair',true);
 m.history.push(ai.stamp);m.receipts.push(Object.fromEntries(Object.entries(receipt).reverse()) as any);
 const next=await f.service.plan(m,'key');expect(next.recovery).toBe(true);expect(next.start).toBe(0);expect(next.generation).toBe(2);expect(f.remote.size).toBe(1);
 await expect(f.service.plan({...m,history:[{...e.stamp,text:'must never enter journal'} as any]},'key')).rejects.toThrow(/manifest/);
},30000);
it('initialises a high-priority contract once and rebuilds only when that contract changes',async()=>{
 const f=await setup(),m=f.manifest,key='key',one=entry('human-1');m.history.push(one.stamp);
 const contract='Stable DCP contract',p=await f.service.plan(m,key,contract);
 const r=await f.service.begin(m,p,[one.item],'x1',key,new AbortController().signal,contract);
 expect(f.remote.get(r.conversationId)![0]).toEqual({type:'message',role:'developer',content:contract});
 await f.service.prepared(m,key,'x1',false);m.history.push(entry('ai-1').stamp);await f.service.acknowledge(m,key,r);
 const two=entry('human-2');m.history.push(two.stamp);const p2=await f.service.plan(m,key,contract);
 expect(p2.recovery).toBe(false);expect(p2.start).toBe(2);
 const r2=await f.service.begin(m,p2,[two.item],'x2',key,new AbortController().signal,contract);
 expect(r2.conversationId).toBe(r.conversationId);expect(f.remote.get(r.conversationId)!.filter(x=>x.role==='developer')).toHaveLength(1);
 await f.service.prepared(m,key,'x2',false);m.history.push(entry('ai-2').stamp);await f.service.acknowledge(m,key,r2);
 const changed=await f.service.plan(m,key,'Changed vocabulary contract');expect(changed.recovery).toBe(true);expect(changed.start).toBe(0);
 await expect(f.service.begin(m,changed,[],'x3',key,new AbortController().signal,contract)).rejects.toThrow('contract changed');
},30000);
