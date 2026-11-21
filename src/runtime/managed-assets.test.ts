// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';import {webcrypto} from 'node:crypto';import {ManagedAssets} from './managed-assets';
import {DirectCharacterCells} from '../rendering/direct-character-cells';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();document.body.replaceChildren();});
const imageRef={kind:'managed' as const,cavernId:'c',assetId:'sha256:'+'a'.repeat(64)};
const imageInfo={...imageRef,mediaType:'image/png',byteLength:100};
it('verifies existing images without acquiring/downloading and retains a commit-time session fence',async()=>{
 const scope={cavernId:'c',session:'s'},fetcher=vi.fn<typeof fetch>(async()=>({ok:true,json:async()=>({Success:true,Data:imageInfo})} as Response));vi.stubGlobal('fetch',fetcher);
 let enabled=true;const service=new ManagedAssets(()=>scope,()=>enabled),result=await service.verifiedImage(imageRef);
 expect(result.manifest).toEqual(imageInfo);expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toBe('/api/assets/verify');result.check();
 enabled=false;expect(result.check).toThrow(/session/);enabled=true;scope.session='changed';expect(result.check).toThrow(/session/);service.dispose();
});
it('rejects forged, foreign, unavailable and mismatched original resources',async()=>{
 const fetcher=vi.fn<typeof fetch>();vi.stubGlobal('fetch',fetcher);const service=new ManagedAssets(()=>({cavernId:'c',session:'s'}),()=>true);
 for(const reference of [{...imageRef,assetId:'invented'},{...imageRef,cavernId:'foreign'}])await expect(service.verifiedImage(reference)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
 for(const Data of [{...imageInfo,assetId:'sha256:'+'b'.repeat(64)},{...imageInfo,cavernId:'other'},{...imageInfo,mediaType:'application/pdf'},{...imageInfo,byteLength:10*1024*1024+1},{...imageInfo,byteLength:0},null]){
  fetcher.mockResolvedValue({ok:true,json:async()=>({Success:true,Data})} as Response);await expect(service.verifiedImage(imageRef)).rejects.toThrow(/mismatch/);
 }
 fetcher.mockResolvedValue({ok:false,json:async()=>({Success:false,Error:'Corrupt original'})} as Response);await expect(service.verifiedImage(imageRef)).rejects.toThrow('Corrupt original');service.dispose();
});
it('rejects cancellation, disposal and session changes during response-body parsing',async()=>{
 for(const event of ['session','dispose','abort']){
  const scope={cavernId:'c',session:'s'},abort=new AbortController(),service=new ManagedAssets(()=>scope,()=>true);
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>{if(event==='session')scope.session='new';if(event==='dispose')service.dispose();if(event==='abort')abort.abort();return {Success:true,Data:imageInfo};}})));
  await expect(service.verifiedImage(imageRef,abort.signal)).rejects.toThrow();service.dispose();
 }
});
it('shares verified runtime URLs across mounted consumers, releases them independently, and never mutates authored data',async()=>{
 vi.stubGlobal('crypto',webcrypto);const bytes=new TextEncoder().encode('original'),digest=[...new Uint8Array(await webcrypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const reference={kind:'managed' as const,cavernId:'c',assetId:`sha256:${digest}`};
 const fetch=vi.fn(async()=>({ok:true,blob:async()=>({type:'image/png',size:bytes.length,arrayBuffer:async()=>bytes.buffer})}));vi.stubGlobal('fetch',fetch);
 const create=vi.fn(()=> 'blob:verified'),revoke=vi.fn();vi.stubGlobal('URL',class extends URL {static createObjectURL=create;static revokeObjectURL=revoke;});
 const service=new ManagedAssets(()=>({cavernId:'c',session:'s'}),()=>true),a=document.createElement('img'),b=document.createElement('img');
 const releaseA=service.bind(a,reference),releaseB=service.bind(b,reference);await vi.waitFor(()=>expect(a.getAttribute('src')).toBe('blob:verified'));expect(b.getAttribute('src')).toBe('blob:verified');expect(fetch).toHaveBeenCalledTimes(1);
 releaseA();expect(revoke).not.toHaveBeenCalled();releaseB();expect(revoke).toHaveBeenCalledWith('blob:verified');service.dispose();expect(reference.assetId).toBe(`sha256:${digest}`);
});
it('never resolves foreign references and refuses stale responses after disposal',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const service=new ManagedAssets(()=>({cavernId:'c',session:'s'}),()=>true),image=document.createElement('img');service.bind(image,{kind:'managed',cavernId:'foreign',assetId:'sha256:'+'a'.repeat(64)});expect(fetch).not.toHaveBeenCalled();service.dispose();service.bind(image,{kind:'managed',cavernId:'c',assetId:'sha256:'+'a'.repeat(64)});expect(fetch).not.toHaveBeenCalled();
});
it('does not rebind assets or overwrite runtime URLs when neighbouring characters change',()=>{
 const flow=document.createElement('div');document.body.append(flow);const release=vi.fn(),bind=vi.fn((image:HTMLImageElement)=>{image.src='blob:cached';return release;});
 const renderer=new DirectCharacterCells(flow,undefined,bind),asset={kind:'managed' as const,cavernId:'c',assetId:'sha256:'+'a'.repeat(64)},cell={key:'image',text:'',image:{asset,src:'',alt:'map',label:'map'}};
 renderer.update([cell]);renderer.update([cell,{key:'letter',text:'X'}]);expect(bind).toHaveBeenCalledTimes(1);expect(flow.querySelector('img')!.getAttribute('src')).toBe('blob:cached');renderer.update([{key:'letter',text:'X'}]);expect(release).toHaveBeenCalledTimes(1);renderer.dispose();expect(release).toHaveBeenCalledTimes(1);
});
