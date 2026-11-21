// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {generateImage} from './image-generation';
import type {AttachmentContext} from './attachments';
const args={filename:'Image.png',prompt:'A blue garden',size:'auto',quality:'auto'};
const context=()=>({check:vi.fn(),store:{begin:vi.fn()}} as unknown as AttachmentContext);
it('validates generation arguments before making a paid request',async()=>{
 const f=vi.fn<typeof fetch>();
 for(const input of [{...args,filename:'image.jpg'},{...args,prompt:''},{...args,size:'huge'},{...args,url:'https://example.com'}])await expect(generateImage(context(),input,'key',new AbortController().signal,f)).rejects.toThrow();
 expect(f).not.toHaveBeenCalled();
});
it.each([401,403,429])('returns an actionable provider failure for HTTP %s without publishing a file',async status=>{
 const c=context(),f=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({error:{code:'access_denied',message:'do not expose fixture credential'}}),{status}));
 await expect(generateImage(c,args,'key',new AbortController().signal,f)).rejects.toThrow('HTTP '+status);expect(c.store.begin).not.toHaveBeenCalled();expect(f).toHaveBeenCalledTimes(1);
});
it.each([{data:[]},{data:[{url:'https://example.com/image.png'}]},{data:[{b64_json:'broken%%%'}]}])('rejects missing or malformed output instead of inventing an attachment',async data=>{
 const c=context();await expect(generateImage(c,args,'key',new AbortController().signal,async()=>new Response(JSON.stringify(data)))).rejects.toThrow('complete PNG');expect(c.store.begin).not.toHaveBeenCalled();
});
it('propagates cancellation to the provider and never publishes a cancelled image',async()=>{
 const c=context(),abort=new AbortController();let called!:()=>void;const started=new Promise<void>(r=>called=r);
 const fetcher:typeof fetch=async(_url,init)=>new Promise<Response>((_resolve,reject)=>{init!.signal!.addEventListener('abort',()=>reject(Error('aborted')));called();});
 const work=generateImage(c,args,'key',abort.signal,fetcher);await started;abort.abort();await expect(work).rejects.toThrow('cancelled');expect(c.store.begin).not.toHaveBeenCalled();
});
it('rejects a changed Vault before retaining provider output',async()=>{
 const c=context();vi.mocked(c.check).mockImplementationOnce(()=>{}).mockImplementation(()=>{throw Error('Vault changed');});
 await expect(generateImage(c,args,'key',new AbortController().signal,async()=>new Response(JSON.stringify({data:[{b64_json:'YWJj'}]})))).rejects.toThrow('Vault changed');expect(c.store.begin).not.toHaveBeenCalled();
});
