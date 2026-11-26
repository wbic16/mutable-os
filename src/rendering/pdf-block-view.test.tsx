// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../reactive-editor/editor';
import {registerCoreViews} from './register-core-views';
import {ReactiveTreeView} from './reactive-tree-view';
import {pdfBlock} from '../pdf/block';
import {pdfCaptureFixture} from '../pdf/fixtures';
import {mountPdfViewer} from '../pdf/viewer';
import {runInterchange} from '../runtime/interchange-worker';
import {plainFragment} from '../interchange/serializer';
import {materializeFragment} from '../interchange/materialize';
vi.mock('../pdf/viewer',()=>({mountPdfViewer:vi.fn()}));
vi.mock('../runtime/interchange-worker',()=>({runInterchange:vi.fn()}));
const cleanup:(()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();vi.mocked(mountPdfViewer).mockReset();vi.mocked(runInterchange).mockReset();});
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
function setup(){
 const capture=pdfCaptureFixture(),editor=new ReactiveEditor({id:'pdf-document',type:'document-block',children:[]},{features:{reversibleBlocks:false,nativeTextProtection:true,crossResourceLoaders:true,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false}});registerCoreViews(editor);
 editor.setAssetContext(()=>({cavernId:capture.asset.cavernId,session:'pdf-session'}));
 const key=editor.commands.insertFragment(pdfBlock(capture).native,{kind:'at',parentKey:editor.repository.readState().rootPlacementKey,index:0})[0],view=editor.createView();
 const host=document.body.appendChild(document.createElement('div')),dispose=render(()=><ReactiveTreeView editor={editor} projection={view}/>,host);cleanup.push(()=>{dispose();editor.dispose();});
 const viewer={destroy:vi.fn(),page:vi.fn(async()=>{}),extract:vi.fn(()=>({text:'PDF text',provenance:{}})),region:()=>({x:0,y:0,width:10,height:10}),viewBox:()=>[0,0,100,100],overlay:vi.fn(()=>()=>{})};vi.mocked(mountPdfViewer).mockResolvedValue(viewer as any);
 const fetcher=vi.fn<typeof fetch>(async input=>String(input).endsWith('pdf.read')?new Response(new Uint8Array([1]),{headers:{'Content-Type':'application/octet-stream','X-Mutable-Cavern-Id':capture.asset.cavernId,'X-Mutable-Result':JSON.stringify({snapshot:capture})}}):new Response(JSON.stringify({Success:true,Data:{snapshot:capture,reviews:[]}})));
 vi.stubGlobal('fetch',fetcher);
 const node=()=>Object.values(view.state.nodes).find(n=>n.placementKey===key)!;
 const button=(text:string)=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text)!;
 const open=async()=>{button('Open retained PDF').click();await vi.waitFor(()=>expect(viewer.page).toHaveBeenCalled());};
 return {editor,view,host,capture,node,viewer,fetcher,button,open};
}
it('keeps PDF navigation local and blocks submitted annotation/extraction/review mutations before work',async()=>{
 const f=setup();cleanup.push(f.editor.textProtection.protect(f.node().contentKey));const revision=f.editor.repository.state.revision,snapshot=vi.spyOn(f.editor.repository,'snapshot');await f.open();
 f.button('Next PDF page').click();await tick();expect(f.viewer.page).toHaveBeenLastCalledWith(1,1);f.button('Zoom in').click();await tick();expect(f.viewer.page).toHaveBeenLastCalledWith(1,1.25);
 for(const label of ['Extract page text as editable Ink','Extract selected text as editable Ink','Add PDF annotation','Accept relationship as Claim']){const button=f.button(label);expect(button.disabled,label).toBe(true);button.disabled=false;button.click();await tick();}
 expect(f.viewer.extract).not.toHaveBeenCalled();expect(runInterchange).not.toHaveBeenCalled();expect(f.fetcher.mock.calls.every(([url])=>String(url).endsWith('pdf.read'))).toBe(true);expect(f.editor.repository.state.revision).toBe(revision);expect(snapshot).not.toHaveBeenCalled();
 f.button('Close / cancel PDF').click();expect(f.viewer.destroy).toHaveBeenCalledTimes(1);
});
it('retains draft PDF annotations and cancels extraction when content becomes protected',async()=>{
 const f=setup();await f.open();f.button('Use selection / visible region').click();const note=f.host.querySelector<HTMLInputElement>('[aria-label="PDF note"]')!;note.value='Native note';note.dispatchEvent(new Event('input',{bubbles:true}));f.button('Add PDF annotation').click();
 expect((f.node().payload.blockProperties as any[]).some(p=>p.type==='mutable/resource-annotation')).toBe(true);
 let finish!:(v:any)=>void;vi.mocked(runInterchange).mockImplementation(()=>new Promise(resolve=>finish=resolve) as any);f.button('Extract page text as editable Ink').click();expect(f.viewer.extract).toHaveBeenCalledTimes(1);
 const revision=f.editor.repository.state.revision;cleanup.push(f.editor.textProtection.protect(f.node().contentKey));finish(materializeFragment(plainFragment('PDF text')));await vi.waitFor(()=>expect(f.host.textContent).toContain('Destination changed'));
 expect(f.editor.repository.state.revision).toBe(revision);const remove=f.button('Delete PDF annotation');expect(remove.disabled).toBe(true);remove.disabled=false;remove.click();expect(f.editor.repository.state.revision).toBe(revision);
});
it('cancels late PDF reads and destroys native viewers on occurrence disposal',async()=>{
 const f=setup();let finish!:(r:Response)=>void;f.fetcher.mockImplementation(()=>new Promise(resolve=>finish=resolve));f.button('Open retained PDF').click();const signal=f.fetcher.mock.calls[0][1]?.signal!;f.button('Close / cancel PDF').click();expect(signal.aborted).toBe(true);
 finish(new Response(JSON.stringify({Success:true,Data:{snapshot:f.capture,bytes:[]}})));await tick();expect(mountPdfViewer).not.toHaveBeenCalled();
 f.fetcher.mockResolvedValue(new Response(JSON.stringify({Success:true,Data:{snapshot:f.capture,bytes:[]}})));await f.open();f.editor.commands.remove(f.node().key);expect(f.viewer.destroy).toHaveBeenCalledTimes(1);
});

it('extracts the whole document through pdf.extract and inserts it with layout blocks anchored',async()=>{
 const f=setup(),extraction={kind:'pdf-text-derivative',version:2,text:'Whole document text',pages:[{pageIndex:0,viewBox:[0,0,612,792],rotation:0,text:'Whole document text',ocr:true,runs:[],blocks:[{kind:'paragraph',ordinal:0,range:{start:0,end:19},bbox:[0,0,100,10],address:'1.1.1/1.1.1/1.1.1'}]}],provenance:{engine:'liteparse',ocrBackend:'ocria-nano',offsetUnit:'utf16',pages:[{pageIndex:0,ocr:true}]}};
 f.fetcher.mockImplementation(async input=>String(input).endsWith('pdf.read')?new Response(new Uint8Array([1]),{headers:{'Content-Type':'application/octet-stream','X-Mutable-Cavern-Id':f.capture.asset.cavernId,'X-Mutable-Result':JSON.stringify({snapshot:f.capture})}}):String(input).endsWith('pdf.extract')?new Response(JSON.stringify({Success:true,Data:{snapshot:f.capture,extraction}})):new Response(JSON.stringify({Success:true,Data:{snapshot:f.capture,reviews:[]}})));
 await f.open();const button=f.button('Extract whole document as editable Ink');expect(button.disabled).toBe(false);
 const unprotect=f.editor.textProtection.protect(f.node().contentKey),revision=f.editor.repository.state.revision;button.disabled=false;button.click();await tick();
 expect(f.fetcher.mock.calls.some(([url])=>String(url).endsWith('pdf.extract'))).toBe(false);expect(f.editor.repository.state.revision).toBe(revision);unprotect();
 button.click();await vi.waitFor(()=>expect(f.host.textContent).toContain('Inserted whole document with layout blocks anchored. OCR was used on 1 page.'));
 expect(f.fetcher.mock.calls.some(([url])=>String(url).endsWith('pdf.extract'))).toBe(true);expect(f.editor.repository.state.revision).not.toBe(revision);
 const inserted=Object.values(f.view.state.nodes).find(n=>(n.payload.blockProperties as any[]|undefined)?.some(p=>p.type==='mutable/pdf-layout-block'&&p.value==='1.1.1/1.1.1/1.1.1'));expect(inserted).toBeDefined();
 const layoutProperty=(inserted!.payload.blockProperties as any[]).find(p=>p.type==='mutable/pdf-layout-block'&&p.value==='1.1.1/1.1.1/1.1.1');expect(layoutProperty.metadata).toMatchObject({kind:'paragraph',ordinal:0,range:{start:0,end:19},pageIndex:0,bbox:[0,0,100,10]});
});
