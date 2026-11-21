// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
import express from 'express';
import {createDialecticBroker} from './broker';
import {sse,streamFixture,plainContribution} from './fixtures';
import {defaultProviderSettings} from '../../src/features/dialectic/dcp/provider-contract';
const stops:(()=>Promise<void>|void)[]=[];afterEach(async()=>{for(const stop of stops.splice(0).reverse())await stop();});
async function fixture(fetcher:typeof fetch,environment:Record<string,string|undefined>={}){const broker=createDialecticBroker({fetcher,environment}),app=express();app.use('/broker',broker.router);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));stops.push(()=>broker.dispose(),()=>new Promise<void>(r=>server.close(()=>r())));const origin='http://127.0.0.1:'+(server.address() as any).port;let token='';
 const call=(p:string,body?:unknown,headers:Record<string,string>={},method='POST')=>fetch(origin+'/broker'+p,{method,headers:{origin,'content-type':'application/json','x-mutable-dialectic':'1','x-dialectic-session':token,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 token=(await(await call('/session')).json()).token;return {call,origin,token};}
const req={protocol:'dcp/1.0',profile:'4b-1',exchange:'exchange',protocolKey:{text:'Semantic markup is optional.'}};
it('uses server environment credentials without returning them to the browser',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture('openai',JSON.stringify(plainContribution('exchange')))));
 const f=await fixture(fetcher,{OPENAI_API_KEY:'server-only-fixture-key'});
 const settings=await(await f.call('/settings',{settings:defaultProviderSettings})).text();expect(JSON.parse(settings).ready).toBe(true);expect(settings).not.toContain('server-only-fixture-key');
 const id=(await(await f.call('/exchange',{request:req})).json()).id;
 const output=await(await f.call('/exchange/'+id+'/turn',{round:0})).text();expect(output).not.toContain('server-only-fixture-key');expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({authorization:'Bearer server-only-fixture-key'});
});
it('requires loopback matching Origin/Host, custom header and an origin-bound session',async()=>{
 const f=await fixture(vi.fn());expect((await f.call('/session',undefined,{origin:'http://evil.example'})).status).toBe(403);expect((await f.call('/session',undefined,{'x-mutable-dialectic':''})).status).toBe(403);expect((await f.call('/settings',{}, {'x-dialectic-session':'bad'})).status).toBe(401);expect((await f.call('/settings',{}, {origin:'http://localhost:'+new URL(f.origin).port})).status).toBe(403);
});
it('keeps keys session-only, bounds continuations/repair, rejects replay and forgets keys',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(sse(streamFixture('openai','',{id:'call-1',name:'read_source',arguments:{handle:'s'}}))).mockResolvedValueOnce(sse(streamFixture('openai','bad json'))).mockResolvedValueOnce(sse(streamFixture('openai',JSON.stringify(plainContribution('exchange')))));
 const f=await fixture(fetcher),settings={...defaultProviderSettings,model:'m'};let r=await f.call('/settings',{settings,key:'secret-fixture'});expect(await r.text()).not.toContain('secret-fixture');const id=(await(await f.call('/exchange',{request:req})).json()).id;
 const round0=await(await f.call('/exchange/'+id+'/turn',{round:0})).text();expect(round0).toContain('call-1');expect(round0).not.toContain('secret-fixture');
 expect((await f.call('/settings',{settings})).status).toBe(400);
 const r1=await(await f.call('/exchange/'+id+'/turn',{round:1,results:[{id:'call-1',result:{status:'complete',text:'source'}}]})).text();expect(r1).toContain('bad json');
 const r2=await(await f.call('/exchange/'+id+'/turn',{round:2,repair:true})).text();expect(r2).toContain('picnic');expect((await f.call('/exchange/'+id+'/turn',{round:3,repair:true})).status).toBe(400);expect(fetcher).toHaveBeenCalledTimes(3);
 await f.call('/session',undefined,{},'DELETE');expect((await f.call('/settings',{settings})).status).toBe(401);
});
it('aborts an in-flight provider on explicit cancellation; never retries',async()=>{
 let aborted=false,started=false;const fetcher=vi.fn<typeof fetch>((_u,init)=>new Promise<Response>((_resolve,reject)=>{started=true;init?.signal?.addEventListener('abort',()=>{aborted=true;reject(Error('secret'));});}));
 const f=await fixture(fetcher);await f.call('/settings',{settings:{...defaultProviderSettings,model:'m'},key:'secret-fixture'});const id=(await(await f.call('/exchange',{request:req})).json()).id;
 const pending=f.call('/exchange/'+id+'/turn',{round:0}).then(r=>r.text());for(let i=0;i<50&&!started;i++)await new Promise(r=>setTimeout(r,5));await f.call('/exchange/'+id,undefined,{},'DELETE');expect(await pending).not.toContain('secret');expect(aborted).toBe(true);expect(fetcher).toHaveBeenCalledTimes(1);
});

it('accepts the real Vite development proxy while rejecting foreign Origins',async()=>{
 const {createServer}=await import('vite'),config=(await import('../../vite.config')).default as any;
 const backend=await fixture(vi.fn());
 const vite=await createServer({configFile:false,server:{host:'127.0.0.1',port:0,proxy:{'/api/dialectic':{...config.server.proxy['/api/dialectic'],target:backend.origin,rewrite:(p:string)=>p.replace('/api/dialectic','/broker')}}}});await vite.listen();stops.push(()=>vite.close());
 const origin='http://127.0.0.1:'+(vite.httpServer!.address() as any).port;
 const post=(requestOrigin:string)=>fetch(origin+'/api/dialectic/session',{method:'POST',headers:{origin:requestOrigin,'x-mutable-dialectic':'1'}});
 expect((await post(origin)).status).toBe(200);expect((await post('http://evil.example')).status).toBe(403);
});

it('allows read-only discovery and reading during source repair, but never a second repair',async()=>{
 const fetcher=vi.fn<typeof fetch>()
 .mockResolvedValueOnce(sse(streamFixture('openai','expired candidate')))
 .mockResolvedValueOnce(sse(streamFixture('openai','',{id:'discover',name:'list_text_blocks',arguments:{cursor:null,limit:3,contributionId:null,participantId:null,fromOrdinal:1}})))
 .mockResolvedValueOnce(sse(streamFixture('openai','',{id:'read',name:'read_source',arguments:{handle:'fresh'}})))
 .mockResolvedValueOnce(sse(streamFixture('openai',JSON.stringify(plainContribution('exchange')))));
 const f=await fixture(fetcher);await f.call('/settings',{settings:defaultProviderSettings,key:'fixture-only'});const id=(await(await f.call('/exchange',{request:req})).json()).id;
 await(await f.call('/exchange/'+id+'/turn',{round:0})).text();
 expect(await(await f.call('/exchange/'+id+'/turn',{round:1,repair:true,diagnostic:{code:'source-identity',path:'$.anchors[0]',message:'UNTRUSTED'}})).text()).toContain('discover');
 expect(await(await f.call('/exchange/'+id+'/turn',{round:2,results:[{id:'discover',result:{items:[{blockId:'native',handle:'fresh'}]}}]})).text()).toContain('read');
 expect(await(await f.call('/exchange/'+id+'/turn',{round:3,results:[{id:'read',result:{handle:'fresh',revision:'fresh-revision',text:'Rain is forecast.'}}]})).text()).toContain('picnic');
 expect((await f.call('/exchange/'+id+'/turn',{round:4,repair:true,diagnostic:{code:'source'}})).status).toBe(400);expect(fetcher).toHaveBeenCalledTimes(4);
 const wire=JSON.parse(String(fetcher.mock.calls[3][1]?.body));expect(JSON.stringify(wire)).not.toContain('UNTRUSTED');expect(JSON.stringify(wire)).toContain('capabilityScope');expect(wire.instructions).toContain('latest DCP request identifies the active exchange');expect(JSON.stringify(wire)).toContain('single repair may use');
});
it.each(['json','budget'])('does not grant source tools during %s repair',async code=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(sse(streamFixture('openai','invalid'))).mockResolvedValueOnce(sse(streamFixture('openai','',{id:'read',name:'read_source',arguments:{handle:'s'}})));
 const f=await fixture(fetcher);await f.call('/settings',{settings:defaultProviderSettings,key:'fixture-only'});const id=(await(await f.call('/exchange',{request:req})).json()).id;await(await f.call('/exchange/'+id+'/turn',{round:0})).text();const result=await(await f.call('/exchange/'+id+'/turn',{round:1,repair:true,diagnostic:{code}})).text();expect(result).toContain('budget');expect(result).not.toContain('"type":"result"');expect(fetcher).toHaveBeenCalledTimes(2);
});
it('does not grant capability discovery during the existing source-only repair',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(sse(streamFixture('openai','invalid source')))
  .mockResolvedValueOnce(sse(streamFixture('openai','',{id:'catalogue',name:'describe_capabilities',arguments:{ids:['composition.table']}})));
 const f=await fixture(fetcher);await f.call('/settings',{settings:defaultProviderSettings,key:'fixture-only'});
 const id=(await(await f.call('/exchange',{request:{...req,capabilities:{version:1},legend:{tools:['describe_capabilities']}}})).json()).id;
 await(await f.call('/exchange/'+id+'/turn',{round:0})).text();
 const result=await(await f.call('/exchange/'+id+'/turn',{round:1,repair:true,diagnostic:{code:'source-identity'}})).text();
 expect(result).toContain('budget');expect(result).not.toContain('"type":"result"');expect(fetcher).toHaveBeenCalledTimes(2);
});
it('shares the six-call budget across initial work and source recovery',async()=>{
 const initial:any[]=streamFixture('openai','',{id:'old-0',name:'read_source',arguments:{handle:'old'}});
 const template=initial.at(-1).response.output[0];initial.at(-1).response.output=Array.from({length:6},(_,i)=>({...template,call_id:'old-'+i}));
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(sse(initial)).mockResolvedValueOnce(sse(streamFixture('openai','expired candidate'))).mockResolvedValueOnce(sse(streamFixture('openai','',{id:'seventh',name:'read_source',arguments:{handle:'new'}})));
 const f=await fixture(fetcher);await f.call('/settings',{settings:defaultProviderSettings,key:'fixture-only'});const id=(await(await f.call('/exchange',{request:req})).json()).id;
 await(await f.call('/exchange/'+id+'/turn',{round:0})).text();await(await f.call('/exchange/'+id+'/turn',{round:1,results:Array.from({length:6},(_,i)=>({id:'old-'+i,result:{status:'complete'}}))})).text();
 const output=await(await f.call('/exchange/'+id+'/turn',{round:2,repair:true,diagnostic:{code:'source-identity'}})).text();expect(output).toContain('tool budget exceeded');expect(output).not.toContain('"type":"result"');expect(fetcher).toHaveBeenCalledTimes(3);
});

it('runs a title utility independently while a conversational exchange is active',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(sse(streamFixture('openai',JSON.stringify({title:'Historical interpretations'})))).mockResolvedValueOnce(sse(streamFixture('openai',JSON.stringify(plainContribution('exchange')))));
 const f=await fixture(fetcher);await f.call('/settings',{settings:defaultProviderSettings,key:'fixture-only'});
 const id=(await(await f.call('/exchange',{request:req})).json()).id;
 const title=await f.call('/utility/title',{text:'How do interpretations change?'});expect(title.status).toBe(200);expect(await title.json()).toEqual({title:'Historical interpretations'});
 const output=await(await f.call('/exchange/'+id+'/turn',{round:0})).text();expect(output).toContain('picnic');
 const main=JSON.parse(String(fetcher.mock.calls[1][1]?.body));expect(JSON.stringify(main)).not.toContain('Historical interpretations');expect(main.text.format.name).toBe('mutable_dcp');
 const utility=JSON.parse(String(fetcher.mock.calls[0][1]?.body));expect(utility.store).toBe(false);expect(utility.tools).toEqual([]);expect(utility.conversation).toBeUndefined();
});
it('bounds utility input and rejects extra instructions and invalid output without changing exchange state',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture('openai',JSON.stringify({title:'bad\ntitle'}))));const f=await fixture(fetcher);
 await f.call('/settings',{settings:defaultProviderSettings,key:'fixture-only'});
 expect((await f.call('/utility/title',{text:'x'.repeat(4001)})).status).toBe(400);
 expect((await f.call('/utility/title',{text:'Hello',instructions:'extra'})).status).toBe(400);expect(fetcher).not.toHaveBeenCalled();
 const invalid=await f.call('/utility/title',{text:'Hello'});expect(invalid.status).toBe(502);expect(await invalid.text()).not.toContain('bad');expect(fetcher).toHaveBeenCalledTimes(1);
 expect((await f.call('/exchange',{request:req})).status).toBe(200);
});
it('limits concurrent title requests and aborts utility work when credentials are forgotten',async()=>{
 let started=false,aborted=false;
 const fetcher=vi.fn<typeof fetch>((_url,init)=>new Promise<Response>((_resolve,reject)=>{started=true;init?.signal?.addEventListener('abort',()=>{aborted=true;reject(Error('secret'));});}));
 const f=await fixture(fetcher);await f.call('/settings',{settings:defaultProviderSettings,key:'fixture-only'});
 const title=f.call('/utility/title',{text:'First'});await vi.waitFor(()=>expect(started).toBe(true));
 expect((await f.call('/utility/title',{text:'Second'})).status).toBe(429);await f.call('/session',undefined,{},'DELETE');
 expect((await title).status).toBe(502);expect(aborted).toBe(true);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('forwards a configured 16000 limit and preserves incomplete usage without admitting partial output',async()=>{
 const events=streamFixture('openai','partial',undefined,'incomplete') as any[];
 Object.assign(events.at(-1).response,{incomplete_details:{reason:'max_output_tokens'},usage:{input_tokens:100,output_tokens:16000,output_tokens_details:{reasoning_tokens:310}}});
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(events)),f=await fixture(fetcher);
 expect((await f.call('/settings',{settings:{...defaultProviderSettings,maxOutputTokens:16000},key:'fixture-only'})).status).toBe(200);
 const id=(await(await f.call('/exchange',{request:req})).json()).id,lines=(await(await f.call('/exchange/'+id+'/turn',{round:0})).text()).trim().split('\n').map(s=>JSON.parse(s));
 const error=lines.at(-1);expect(error.type).toBe('error');expect(error.receipt).toMatchObject({stop:'max_output_tokens',usage:{output_tokens:16000,reasoning_tokens:310}});expect(lines.some(x=>x.type==='result')).toBe(false);expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).max_output_tokens).toBe(16000);
});

it('requests a smaller image with an isolated compact contract and preserves the conversational exchange',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(sse(streamFixture('openai',JSON.stringify({url:'https://example.org/small.jpg'}))));
 const f=await fixture(fetcher);await f.call('/settings',{settings:defaultProviderSettings,key:'fixture-only'});
 const exchange=await f.call('/exchange',{request:req});expect(exchange.status).toBe(200);
 const response=await f.call('/utility/smaller-image',{url:'https://example.org/large.jpg',description:'Lady with an Ermine'});
 expect(response.status).toBe(200);expect(await response.json()).toMatchObject({url:'https://example.org/small.jpg',receipt:{provider:'openai'}});
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body));expect(body.tools).toEqual([]);expect(body.store).toBe(false);expect(body.conversation).toBeUndefined();expect(body.max_output_tokens).toBe(512);expect(body.text.format.name).toBe('mutable_smaller_image');expect(JSON.stringify(body)).not.toContain('protocolKey');expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects extra utility instructions, unsafe or unchanged replacements and accepts an honest unavailable result',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(sse(streamFixture('openai',JSON.stringify({url:'http://127.0.0.1/image.jpg'})))).mockResolvedValueOnce(sse(streamFixture('openai',JSON.stringify({url:'https://example.org/large.jpg'})))).mockResolvedValueOnce(sse(streamFixture('openai',JSON.stringify({url:null}))));
 const f=await fixture(fetcher);await f.call('/settings',{settings:defaultProviderSettings,key:'fixture-only'});const input={url:'https://example.org/large.jpg',description:'Artwork'};
 expect((await f.call('/utility/smaller-image',{...input,instructions:'extra'})).status).toBe(400);expect(fetcher).not.toHaveBeenCalled();
 expect((await f.call('/utility/smaller-image',input)).status).toBe(502);expect((await f.call('/utility/smaller-image',input)).status).toBe(502);
 const result=await f.call('/utility/smaller-image',input);expect(result.status).toBe(200);expect((await result.json()).url).toBeNull();
});

it('accepts failed-image recovery without introducing it into provider conversation history',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(sse(streamFixture('openai',JSON.stringify({url:'https://example.org/repaired.jpg'}))));
 const f=await fixture(fetcher);await f.call('/settings',{settings:defaultProviderSettings,key:'fixture-only'});
 const result=await f.call('/utility/smaller-image',{url:'https://example.org/broken.jpg',description:'Lady with an Ermine',reason:'failed-image'});
 expect(result.status).toBe(200);const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body));expect(body.instructions).toContain('image failed to load');expect(body.conversation).toBeUndefined();expect(body.store).toBe(false);expect(body.tools).toEqual([]);
 expect((await f.call('/utility/smaller-image',{url:'https://example.org/broken.jpg',description:'Lady with an Ermine',reason:'arbitrary-command'})).status).toBe(400);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('isolates concurrent child sessions while sharing credentials and immutable exchange settings',async()=>{
 const signals:AbortSignal[]=[];
 const fetcher=vi.fn<typeof fetch>().mockImplementation(async(_url,options)=>{signals.push(options!.signal!);return sse(streamFixture('openai',JSON.stringify(plainContribution('exchange'))));});
 const f=await fixture(fetcher);await f.call('/settings',{settings:defaultProviderSettings,key:'shared-fixture-key'});
 const child=async()=>{const response=await f.call('/session',undefined,{'x-dialectic-parent':f.token});expect(response.status).toBe(200);return (await response.json()).token;};
 const a=await child(),b=await child(),headers=(token:string)=>({'x-dialectic-session':token});
 await f.call('/settings',{settings:{...defaultProviderSettings,model:'model-a'}},headers(a));await f.call('/settings',{settings:{...defaultProviderSettings,model:'model-b'}},headers(b));
 const ae=await(await f.call('/exchange',{request:req},headers(a))).json(),be=await(await f.call('/exchange',{request:req},headers(b))).json();expect(ae.id).toBeTruthy();expect(be.id).toBeTruthy();expect(ae.settings.model).toBe('model-a');expect(be.settings.model).toBe('model-b');
 expect((await f.call('/settings',{settings:{...defaultProviderSettings,model:'changed'}},headers(a))).status).toBe(400);
 expect((await f.call('/exchange/'+ae.id+'/turn',{round:0},headers(b))).status).toBe(410);
 await f.call('/exchange/'+ae.id,undefined,headers(a),'DELETE');const response=await f.call('/exchange/'+be.id+'/turn',{round:0},headers(b));expect(await response.text()).toContain('"type":"result"');expect(fetcher).toHaveBeenCalledOnce();expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({authorization:'Bearer shared-fixture-key'});
 await f.call('/session',undefined,headers(a),'DELETE');expect((await f.call('/settings',{settings:defaultProviderSettings},headers(b))).status).toBe(400); // B still owns its exchange.
 await f.call('/session',undefined,{},'DELETE');expect(signals[0].aborted).toBe(true);expect((await f.call('/settings',{settings:defaultProviderSettings},headers(b))).status).toBe(401);
});
it('rejects unknown or nested credential parents and bounds child sessions',async()=>{
 const f=await fixture(vi.fn());expect((await f.call('/session',undefined,{'x-dialectic-parent':'unknown'})).status).toBe(401);
 const child=(await(await f.call('/session',undefined,{'x-dialectic-parent':f.token})).json()).token;
 expect((await f.call('/session',undefined,{'x-dialectic-parent':child})).status).toBe(401);
 for(let i=0;i<30;i++)expect((await f.call('/session',undefined,{'x-dialectic-parent':f.token})).status).toBe(200);
 expect((await f.call('/session',undefined,{'x-dialectic-parent':f.token})).status).toBe(429);
});
