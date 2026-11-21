import {afterEach,expect,it,vi} from 'vitest';
import {verifyRetainedPdf} from './retained-pdf';
import {pdfCaptureFixture} from '../pdf/fixtures';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function fixture(){const capture=pdfCaptureFixture();let scope={cavernId:capture.asset.cavernId,session:'session'};const editor={features:{crossResourceLoaders:true},readAssetContext:()=>scope} as any;const fetcher=vi.fn(async()=>new Response(JSON.stringify({Success:true,Data:{snapshot:capture,byteLength:100}})));vi.stubGlobal('fetch',fetcher);return {capture,editor,fetcher,change:()=>{scope={...scope,session:'changed'};}};}
it('uses scoped native verification, preserves canonical identity and fences commit',async()=>{
 const f=fixture(),prepared=await verifyRetainedPdf(f.editor,f.capture,new AbortController().signal);expect(prepared.snapshot).toEqual(f.capture);expect(prepared.snapshot).not.toBe(f.capture);expect(f.fetcher).toHaveBeenCalledTimes(1);const call=vi.mocked(fetch).mock.calls[0];expect(call[0]).toBe('/api/services/pdf.verify');expect(JSON.parse(String(call[1]?.body))).toEqual({snapshotId:f.capture.snapshotId});expect(new Headers(call[1]?.headers).get('X-Mutable-Cavern')).toBe('session');prepared.check();f.change();expect(prepared.check).toThrow(/session/);
});
it('rejects foreign and malformed originals before I/O, and checks cancellation',async()=>{
 const f=fixture();for(const capture of [{...f.capture,asset:{...f.capture.asset,cavernId:'foreign'}},{...f.capture,snapshotId:'forged'},{...f.capture,provenance:'invented'}])await expect(verifyRetainedPdf(f.editor,capture,new AbortController().signal)).rejects.toThrow();const c=new AbortController();c.abort();await expect(verifyRetainedPdf(f.editor,f.capture,c.signal)).rejects.toThrow();expect(f.fetcher).not.toHaveBeenCalled();
});
it('rejects session changes during response parsing and mismatched retained captures or byte bounds',async()=>{
 for(const mode of ['session','capture','size']){const f=fixture();f.fetcher.mockImplementation(async()=>({ok:true,json:async()=>{if(mode==='session')f.change();return {Success:true,Data:{snapshot:mode==='capture'?{...f.capture,resourceId:crypto.randomUUID()}:f.capture,byteLength:mode==='size'?50*1024*1024+1:100}};}} as Response));await expect(verifyRetainedPdf(f.editor,f.capture,new AbortController().signal)).rejects.toThrow();}
});
