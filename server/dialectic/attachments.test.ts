// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash,randomBytes} from 'node:crypto';
import express from 'express';
import sharp from 'sharp';
// @ts-ignore Existing immutable original store.
import {ManagedAssetStore} from '../managed-assets.mjs';
import {NodePreparationExecutor} from '../application-services/executor';
import {retainAttachment,resolveAttachments,createArtifact,attachmentParts,type AttachmentContext} from './attachments';
import {createDialecticBroker} from './broker';
import {sse,streamFixture,plainContribution} from './fixtures';
import {defaultProviderSettings} from '../../src/features/dialectic/dcp/provider-contract';
import {pdfFixture} from '../../src/pdf/fixtures';
import {attachmentLimits,attachments,attachmentProviderProblem} from '../../src/features/dialectic/attachments-contract';
const stops:Array<()=>unknown>=[];
afterEach(async()=>{for(const stop of stops.splice(0).reverse())await stop();});
async function storage(){
 const root=await mkdtemp(join(tmpdir(),'dialectic-attachments-')),cavernId=randomUUID(),session=randomUUID();stops.push(()=>rm(root,{recursive:true,force:true}));
 const store=new ManagedAssetStore({root,cavernId,session}),executor=new NodePreparationExecutor();stops.push(()=>store.close(),()=>executor.close());
 let current=true;const context:AttachmentContext={store,executor,cavernId,session,check(){if(!current)throw Error('Attachment Vault/session changed');}};
 return {context,root,stale:()=>{current=false;}};
}
it('retains exact originals, reuses bytes under different names, detects foreign/mismatched references and keeps files after a new session',async()=>{
 const {context,root}=await storage(),bytes=new TextEncoder().encode('Evidence,é\n1,2\n'),signal=new AbortController().signal;
 const a=await retainAttachment(context,'évidence.csv',bytes,'user',signal),b=await retainAttachment(context,'copy.txt',bytes,'user',signal);
 expect(a.asset).toEqual(b.asset);expect(a.id).not.toBe(b.id);
 const jsonText=new TextEncoder().encode('{"x":1}'),plain=await retainAttachment(context,'json.txt',jsonText,'user',signal),json=await retainAttachment(context,'data.json',jsonText,'user',signal);expect(json.asset).toEqual(plain.asset);
 expect((await resolveAttachments(context,[a],signal))[0].bytes).toEqual(Buffer.from(bytes));
 await expect(resolveAttachments(context,[{...a,asset:{...a.asset,cavernId:'foreign'}}],signal)).rejects.toThrow('another Vault');
 await expect(resolveAttachments(context,[{...a,byteLength:a.byteLength+1}],signal)).rejects.toThrow('manifest');
 const reopened=new ManagedAssetStore({root,cavernId:context.cavernId,session:randomUUID()});stops.push(()=>reopened.close());
 expect((await reopened.get(a.asset.assetId,context.cavernId)).bytes).toEqual(Buffer.from(bytes));
});
it('rejects unsupported, oversized, corrupt, encrypted and cancelled inputs before publishing',async()=>{
 const {context}=await storage(),stage=vi.spyOn(context.store,'stage'),signal=new AbortController().signal;
 for(const [name,bytes]of [['archive.zip',new Uint8Array([1])],['bad.txt',new Uint8Array([255])],['bad.json',new TextEncoder().encode('{')],['empty.txt',new Uint8Array()],['large.txt',new Uint8Array(200001)],['bad.pdf',new TextEncoder().encode('%PDF-broken')],['locked.pdf',pdfFixture(1,false,true)]] as const)await expect(retainAttachment(context,name,bytes,'user',signal)).rejects.toThrow();
 const c=new AbortController();c.abort();await expect(retainAttachment(context,'x.txt',new Uint8Array([65]),'user',c.signal)).rejects.toThrow();expect(stage).not.toHaveBeenCalled();
},15000);
it('admits local PDFs and produces native provider parts, with full text supplied explicitly',async()=>{
 const {context}=await storage(),signal=new AbortController().signal,bytes=pdfFixture(2),pdf=await retainAttachment(context,'paper.pdf',bytes,'user',signal),text=await retainAttachment(context,'note.txt',new TextEncoder().encode('Exact note'),'user',signal);
 const resolved=await resolveAttachments(context,[pdf,text],signal),openai=attachmentParts('openai',resolved),anthropic=attachmentParts('anthropic',resolved);
 expect(openai[1]).toMatchObject({type:'input_file',filename:'paper.pdf'});expect(Buffer.from(openai[1].file_data.split(',')[1],'base64')).toEqual(Buffer.from(bytes));
 expect(anthropic[1]).toMatchObject({type:'document',source:{type:'base64',media_type:'application/pdf'}});expect(openai.at(-1)).toEqual({type:'input_text',text:'Exact note'});
});
it('validates PNG/JPEG originals in the existing worker and sends exact image bytes to both providers',async()=>{
 const {context}=await storage(),signal=new AbortController().signal;
 for(const format of ['png','jpeg'] as const){
  const bytes=await sharp({create:{width:2,height:2,channels:3,background:'#346699'}})[format]().toBuffer(),ref=await retainAttachment(context,'image.'+format,bytes,'user',signal),inputs=await resolveAttachments(context,[ref],signal);
  expect(ref.mediaType).toBe('image/'+format);expect(attachmentParts('openai',inputs)[1]).toMatchObject({type:'input_image',image_url:`data:image/${format};base64,${bytes.toString('base64')}`});expect(attachmentParts('anthropic',inputs)[1]).toMatchObject({type:'image',source:{data:bytes.toString('base64')}});
 }
 await expect(retainAttachment(context,'fake.png',new TextEncoder().encode('not an image'),'user',signal)).rejects.toThrow();
});
it('creates real PDFs in the bounded worker and exact UTF-8/JSON artifacts, without executing content',async()=>{
 const {context}=await storage(),signal=new AbortController().signal;
 const pdf=await createArtifact(context,{filename:'report.pdf',format:'pdf',content:'A report\nEvidence — café.\n'+('Page content\n'.repeat(120))},signal);
 const [{bytes}]=await resolveAttachments(context,[pdf],signal);expect(Buffer.from(bytes).subarray(0,5).toString()).toBe('%PDF-');
 const inspection=await context.executor.run({kind:'pdf-inspect',bytes},signal);expect((inspection as any).pages).toBeGreaterThan(1);
 const json=await createArtifact(context,{filename:'data.json',format:'json',content:'{"value":"é"}'},signal);
 expect(Buffer.from((await resolveAttachments(context,[json],signal))[0].bytes).toString()).toBe('{"value":"é"}');
 await expect(createArtifact(context,{filename:'../bad.pdf',format:'pdf',content:'x'},signal)).rejects.toThrow();
 await expect(createArtifact(context,{filename:'bad.json',format:'json',content:'no'},signal)).rejects.toThrow();
},15000);
async function brokerFixture(provider:'openai'|'anthropic'='openai',enabled=true,images=false,openaiKey=true){
 const f=await storage(),fetcher=vi.fn<typeof fetch>();
 const broker=createDialecticBroker({fetcher,environment:images&&openaiKey?{OPENAI_API_KEY:'fixture-image-key'}:{},imageGenerationEnabled:images,attachmentsEnabled:enabled,artifactsEnabled:enabled,attachmentContext:session=>{if(session!==f.context.session)throw Error('stale session');return f.context;}}),app=express();app.use('/broker',broker.router);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));stops.push(()=>broker.dispose(),()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const origin='http://127.0.0.1:'+(server.address() as any).port;let token='';
 const call=(path:string,body?:unknown,extra:Record<string,string>={})=>fetch(origin+'/broker'+path,{method:'POST',headers:{origin,'x-mutable-dialectic':'1','x-dialectic-session':token,'X-Mutable-Cavern':f.context.session,...(body instanceof FormData?{}:{'content-type':'application/json'}),...extra},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});
 token=(await(await call('/session')).json()).token;await call('/settings',{settings:{...defaultProviderSettings,provider},key:'fixture-only-key'});
 return {...f,call,fetcher};
}
it.each(['openai','anthropic'] as const)('uploads, supplies file contents to %s, creates an artifact and downloads exact bytes through authenticated routes',async provider=>{
 const f=await brokerFixture(provider),form=new FormData();form.append('file',new Blob(['source evidence'],{type:'text/plain'}),'source.txt');form.append('name','source.txt');
 const uploaded=await(await f.call('/attachments/upload',form)).json();expect(uploaded.error).toBeUndefined();
 const request={protocol:'dcp/1.0',profile:'4b-1',exchange:'exchange',protocolKey:{text:'Semantic markup optional'},artifacts:1,attachments:[uploaded.attachment]};
 f.fetcher.mockResolvedValueOnce(sse(streamFixture(provider,'',{id:'make',name:'create_attachment',arguments:{filename:'answer.csv',format:'csv',content:'result\n42\n'}}))).mockResolvedValueOnce(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));
 const start=await(await f.call('/exchange',{request})).json();expect(start.error).toBeUndefined();const path='/exchange/'+start.id;
 expect(await(await f.call(path+'/turn',{round:0})).text()).toContain('create_attachment');
 const wire=JSON.parse(String(f.fetcher.mock.calls[0][1]?.body));expect(JSON.stringify(wire)).toContain('source evidence');expect(wire.tools.some((t:any)=>t.name==='create_attachment')).toBe(true);
 const artifact=await(await f.call(path+'/artifact',{callId:'make'})).json();expect(artifact.error).toBeUndefined();
 expect(await(await f.call(path+'/artifact',{callId:'make'})).json()).toEqual(artifact);
 const result=await(await f.call(path+'/turn',{round:1,results:[{id:'make',result:{filename:'forged'}}]})).text();expect(result).toContain(artifact.attachment.asset.assetId);
 expect(String(f.fetcher.mock.calls[1][1]?.body)).not.toContain('forged');
 const download=await f.call('/attachments/download',{attachment:artifact.attachment});expect(download.headers.get('content-disposition')).toContain('answer.csv');expect(await download.text()).toBe('result\n42\n');
 expect((await f.call('/attachments/download',{attachment:artifact.attachment},{'x-dialectic-session':'bad'})).status).toBe(401);
 f.stale();expect((await f.call('/attachments/download',{attachment:artifact.attachment})).status).toBe(400);
});
it('keeps flag-off requests inert and rejects capabilities before a provider request',async()=>{
 const f=await brokerFixture('openai',false),result=await f.call('/exchange',{request:{protocol:'dcp/1.0',profile:'4b-1',exchange:'x',protocolKey:{text:'x'},artifacts:1}});
 expect(result.status).toBe(400);expect(f.fetcher).not.toHaveBeenCalled();
});
it('retains and resolves an exact 100 MB PDF through the real worker and store, without raising ordinary PDF admission limits',async()=>{
 const {context}=await storage(),signal=new AbortController().signal,base=pdfFixture(1),footer=new TextEncoder().encode(new TextDecoder().decode(base).match(/startxref\n\d+\n%%EOF\n$/)![0]);
 const bytes=new Uint8Array(attachmentLimits.fileBytes).fill(32);bytes.set(base);bytes.set(footer,bytes.length-footer.length);
 await expect(context.executor.run({kind:'pdf-inspect',bytes},signal)).rejects.toThrow();
 const ref=await retainAttachment(context,'100 MB.pdf',bytes,'user',signal);expect(ref.byteLength).toBe(100000000);expect(ref.asset.assetId).toBe('sha256:'+createHash('sha256').update(bytes).digest('hex'));
 const resolved=await resolveAttachments(context,[ref],signal);expect(resolved[0].bytes.length).toBe(bytes.length);expect(createHash('sha256').update(resolved[0].bytes).digest('hex')).toBe(ref.asset.assetId.slice(7));
 expect(()=>attachments([{...ref,byteLength:attachmentLimits.fileBytes+1}])).toThrow();
 expect(attachmentProviderProblem('openai',[ref])).toContain('50 MB');expect(attachmentProviderProblem('anthropic',[ref])).toContain('128 MB');
},60000);
it('rejects provider-incompatible local attachments before contacting a provider',async()=>{
 const f=await brokerFixture(),ref={version:1,id:'fixture',name:'large.pdf',asset:{kind:'managed',cavernId:f.context.cavernId,assetId:'sha256:'+'a'.repeat(64)},origin:'user',mediaType:'application/pdf',byteLength:60000000,createdUtc:new Date().toISOString()};
 const response=await f.call('/exchange',{request:{protocol:'dcp/1.0',profile:'4b-1',exchange:'x',protocolKey:{text:'x'},attachments:[ref]}});expect(response.status).toBe(400);expect((await response.json()).error).toContain('50 MB');expect(f.fetcher).not.toHaveBeenCalled();
});

it.each(['openai','anthropic'] as const)('generates and retains an image requested by %s, then downloads identical bytes without another generation',async provider=>{
 const f=await brokerFixture(provider,true,true),png=await sharp({create:{width:32,height:24,channels:3,background:'#207050'}}).png().toBuffer();
 const args={filename:'Garden.png',prompt:'A garden in sunlight',size:'1024x1024',quality:'medium'};
 f.fetcher.mockResolvedValueOnce(sse(streamFixture(provider,'',{id:'image',name:'generate_image',arguments:args}))).mockResolvedValueOnce(new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]}))).mockResolvedValueOnce(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange','Your Garden.png is attached.')))));
 const start=await(await f.call('/exchange',{request:{protocol:'dcp/1.0',profile:'4b-1',exchange:'exchange',protocolKey:{text:'Respond in DCP'},artifacts:1,imageGeneration:1}})).json(),path='/exchange/'+start.id;
 expect(start.error).toBeUndefined();expect(await(await f.call(path+'/turn',{round:0})).text()).toContain('generate_image');
 const artifact=await(await f.call(path+'/artifact',{callId:'image'})).json();expect(artifact.error).toBeUndefined();expect(artifact.attachment).toMatchObject({origin:'agent',mediaType:'image/png',name:'Garden.png'});
 expect(f.fetcher.mock.calls[1][0]).toBe('https://api.openai.com/v1/images/generations');expect(JSON.parse(String(f.fetcher.mock.calls[1][1]?.body))).toMatchObject({prompt:args.prompt,n:1,output_format:'png'});
 expect(new Headers(f.fetcher.mock.calls[1][1]?.headers).get('authorization')).toBe('Bearer '+(provider==='openai'?'fixture-only-key':'fixture-image-key'));
 expect(await(await f.call(path+'/artifact',{callId:'image'})).json()).toEqual(artifact);expect(f.fetcher).toHaveBeenCalledTimes(2);
 const result=await(await f.call(path+'/turn',{round:1,results:[{id:'image',result:{filename:'forged.png'}}]})).text();expect(result).toContain(artifact.attachment.asset.assetId);expect(String(f.fetcher.mock.calls[2][1]?.body)).toContain('Garden.png');expect(String(f.fetcher.mock.calls[2][1]?.body)).not.toContain('forged.png');
 const download=await f.call('/attachments/download',{attachment:artifact.attachment});expect(Buffer.from(await download.arrayBuffer())).toEqual(png);expect(f.fetcher).toHaveBeenCalledTimes(3);
},15000);
it('does not advertise image generation when the server flag is off, even if the client requests it',async()=>{
 const f=await brokerFixture();f.fetcher.mockResolvedValueOnce(sse(streamFixture('openai',JSON.stringify(plainContribution('exchange')))));
 const start=await(await f.call('/exchange',{request:{protocol:'dcp/1.0',profile:'4b-1',exchange:'exchange',protocolKey:{text:'DCP'},artifacts:1,imageGeneration:1}})).json();await(await f.call('/exchange/'+start.id+'/turn',{round:0})).text();
 expect(JSON.parse(String(f.fetcher.mock.calls[0][1]?.body)).tools.some((t:any)=>t.name==='generate_image')).toBe(false);
});

it('retains generated PNGs above the ordinary import ceiling without widening local image uploads',async()=>{
 const {context}=await storage(),signal=new AbortController().signal;
 const png=await sharp(randomBytes(2100*2100*3),{raw:{width:2100,height:2100,channels:3}}).png().toBuffer();expect(png.length).toBeGreaterThan(10*1024*1024);
 await expect(retainAttachment(context,'Upload.png',png,'user',signal)).rejects.toThrow('5 MiB');
 const ref=await retainAttachment(context,'Generated.png',png,'agent',signal);expect(ref.byteLength).toBe(png.length);expect(ref.asset.assetId).toBe('sha256:'+createHash('sha256').update(png).digest('hex'));
 const [{bytes}]=await resolveAttachments(context,[ref],signal);expect(createHash('sha256').update(bytes).digest('hex')).toBe(ref.asset.assetId.slice(7));
},20000);

it('does not offer image generation to Claude without an OpenAI credential',async()=>{
 const f=await brokerFixture('anthropic',true,true,false);f.fetcher.mockResolvedValueOnce(sse(streamFixture('anthropic',JSON.stringify(plainContribution('exchange')))));
 const start=await(await f.call('/exchange',{request:{protocol:'dcp/1.0',profile:'4b-1',exchange:'exchange',protocolKey:{text:'DCP'},artifacts:1,imageGeneration:1}})).json();await(await f.call('/exchange/'+start.id+'/turn',{round:0})).text();
 expect(JSON.parse(String(f.fetcher.mock.calls[0][1]?.body)).tools.some((t:any)=>t.name==='generate_image')).toBe(false);expect(f.fetcher.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
});
