// @vitest-environment node
import {afterEach,expect,it} from 'vitest';
import {mkdtemp,readFile,readdir,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DcpTestLog} from './test-log';
const roots:string[]=[];afterEach(async()=>{await Promise.all(roots.splice(0).map(p=>rm(p,{recursive:true,force:true})));});
async function fixture(enabled=true){const root=await mkdtemp(path.join(tmpdir(),'dcp-log-'));roots.push(root);const log=new DcpTestLog(()=>root,enabled);const records=async()=>{await log.flush();const dir=path.join(root,'.mutable/dcp-test-phase'),files=await readdir(dir);const file=path.join(dir,files[0]);return {file,rows:(await readFile(file,'utf8')).trim().split('\n').map(line=>JSON.parse(line))};};return {root,log,records};}
it('captures raw requests and streamed replies with correlation, while excluding keys even across chunk boundaries',async()=>{
 const f=await fixture(),key='fixture-secret-credential',wire='data: {"message":"hello", "echo":"'+key+'"}\n\n';
 const fetcher=f.log.fetch(async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(wire.slice(0,50)));c.enqueue(new TextEncoder().encode(wire.slice(50)));c.close();}}),{headers:{'content-type':'text/event-stream','x-request-id':'response-proof'}}));
 const r=await f.log.context.run({sessionId:'session',documentId:'document',exchangeId:'exchange'},()=>fetcher('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:'Bearer '+key},body:'{"input":"source text"}'}));
 expect(await r.text()).toBe(wire);const {rows,file}=await f.records();expect(rows.every(r=>r.exchangeId==='exchange')).toBe(true);expect(rows.find(r=>r.event==='provider.request').data.body).toBe('{"input":"source text"}');expect(rows.find(r=>r.event==='provider.response-body').data.body).toContain('hello');expect(JSON.stringify(rows)).not.toContain(key);expect((await stat(file)).mode&0o777).toBe(0o600);
});
it('records provider HTTP errors and failed connections without leaking secrets',async()=>{
 const f=await fixture(),key='secret-fixture-value';const response=await f.log.fetch(async()=>new Response('{"error":"'+key+' invalid"}',{status:401}))('https://api.openai.com/v1/responses',{headers:{authorization:'Bearer '+key}});await response.text();
 await expect(f.log.fetch(async()=>{throw Error(key+' network failure');})('https://api.openai.com/v1/responses',{headers:{authorization:'Bearer '+key}})).rejects.toThrow('network failure');
 const {rows}=await f.records();expect(rows.some(r=>r.data.status===401)).toBe(true);expect(rows.some(r=>r.event==='provider.network-error')).toBe(true);expect(JSON.stringify(rows)).not.toContain(key);
});
it('does no filesystem or stream work when the test flag is disabled',async()=>{
 const f=await fixture(false),fetcher=async()=>new Response('unchanged');expect(f.log.fetch(fetcher)).toBe(fetcher);await f.log.write('contribution',{text:'private'});expect(await readdir(f.root)).toEqual([]);
});
it('omits embedded attachment bytes from both provider wire formats while retaining useful request structure',async()=>{
 const f=await fixture();
 await f.log.write('provider.request',{headers:{'X-Mutable-Cavern':'private-vault-session'},body:JSON.stringify({input:[{content:[{type:'input_file',filename:'report.pdf',file_data:'data:application/pdf;base64,pdf-secret'},{type:'input_image',image_url:'data:image/png;base64,image-secret'},{type:'document',source:{type:'base64',media_type:'application/pdf',data:'anthropic-secret'}}]}]})});
 const {rows}=await f.records(),wire=JSON.stringify(rows);for(const secret of ['pdf-secret','image-secret','anthropic-secret','private-vault-session'])expect(wire).not.toContain(secret);
 const body=JSON.parse(rows[0].data.body);expect(body.input[0].content[0].filename).toBe('report.pdf');expect(body.input[0].content[0].file_data).toBe('[ATTACHMENT BYTES OMITTED]');
});

it('passes large image responses through without logging base64 or applying the text stream budget',async()=>{
 const f=await fixture(),wire=JSON.stringify({data:[{b64_json:'a'.repeat(4*1024*1024)}]});
 const response=await f.log.fetch(async()=>new Response(wire))('https://api.openai.com/v1/images/generations',{headers:{authorization:'Bearer fixture-image-secret'},body:JSON.stringify({prompt:'A garden'})});
 expect(await response.text()).toBe(wire);const {rows}=await f.records();expect(rows.some(r=>r.event==='provider.response')).toBe(true);expect(rows.some(r=>r.event==='provider.response-body')).toBe(false);expect(JSON.stringify(rows)).not.toContain('fixture-image-secret');
});
