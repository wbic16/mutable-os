// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createMemo,createRoot,createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {workspaceFixture} from './dcp/workspace.fixture';
import {MediaGallery} from './media-gallery';
import {recordImageLoad} from './image-load';
import {smallerImageEvent} from './smaller-image-contract';
import type {DialecticController} from './controller';
import type {Attachment} from './attachments-contract';
const cleanup:(()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();vi.unstubAllGlobals();document.body.replaceChildren();});
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function setup(){
 const f=workspaceFixture(true,true,{nativeTextProtection:false}),owner=f.addHuman('Source contribution');cleanup.push(f.dispose);
 const row=f.view.node(f.root.children[0])!;
 const inventory=createRoot(dispose=>{cleanup.push(dispose);return createMemo(()=>f.refs.workspaceInventory());});
 const [files,setFiles]=createSignal<Attachment[]>([]),[active,setActive]=createSignal(true);
 const c={editor:f.editor,rows:()=>[{id:owner,data:{state:'committed',ordinal:1,attachments:files()}}],semanticInventory:inventory,session:()=>({projection:f.view}),target:(blockId:string,kind='block')=>({blockId,kind,resourceId:f.owner}),resolve:(target:any)=>{const r=f.refs.resolve(target);return r.status==='resolved'?r.node:undefined;},showConversation:vi.fn(),inspect:vi.fn(),attachmentBlob:vi.fn(async()=>new Blob(['image'],{type:'image/png'}))} as unknown as DialecticController;
 const host=document.body.appendChild(document.createElement('div'));host.className='dialectic-app';
 const image=(metadata:Record<string,unknown>={url:'https://example.org/image.jpg',alt:'Portrait'},asset?:unknown)=>{const id=crypto.randomUUID();f.editor.commands.insert({id,type:'image-block',metadata,...asset?{asset}:{}},{kind:'at',parentKey:row.key,index:row.children.length});return id;};
 const mount=()=>cleanup.push(render(()=><MediaGallery c={c} active={active()}/>,host));
 return {...f,c,host,row,image,mount,setFiles,setActive,inventory};
}
it('renders fetched images as tiles, enlarges them, and navigates to the source without editing the Document',async()=>{
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(){this.open=true;}});Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(){this.open=false;}});
 const f=setup(),id=f.image();f.mount();await flush();const revision=f.editor.repository.state.revision,img=f.host.querySelector('img')!;
 expect(img.src).toBe('https://example.org/image.jpg');expect(f.host.textContent).toContain('1 image');expect(f.host.textContent).toContain('Contribution 1');
 img.dispatchEvent(new Event('load'));f.host.querySelector<HTMLButtonElement>('.media-gallery-picture')!.click();expect(f.host.querySelector('dialog[open] img')?.getAttribute('src')).toBe(img.src);
 f.host.querySelector<HTMLButtonElement>('dialog footer button')!.click();expect(f.host.querySelector('dialog')).toBeNull();expect(f.c.showConversation).toHaveBeenCalledOnce();expect(f.c.inspect).toHaveBeenCalledWith(f.c.target(id,'block'));expect(f.editor.repository.state.revision).toBe(revision);
});
it('does no inventory, image, snapshot, scan or gallery DOM work during ordinary typing',async()=>{
 const f=setup();f.image();f.mount();await flush();const img=f.host.querySelector('img')!;img.dispatchEvent(new Event('load'));await flush();
 const snapshot=vi.spyOn(f.editor.repository,'snapshot'),network=vi.spyOn(globalThis,'fetch'),before={...f.refs.diagnostics},values=Object.values;let scans=0;
 vi.spyOn(Object,'values').mockImplementation((v:any)=>{if(v===f.editor.repository.state.contents||v===f.editor.repository.state.placements)scans++;return values(v);});
 const changes:MutationRecord[]=[];const observer=new MutationObserver(m=>changes.push(...m));observer.observe(f.host,{attributes:true,childList:true,characterData:true,subtree:true});
 for(let i=0;i<20;i++)f.editor.commands.replaceInlineRange(f.row.children[0],0,0,'x');await flush();observer.disconnect();
 expect(f.refs.diagnostics.workspaceBuilds).toBe(before.workspaceBuilds);expect(f.refs.diagnostics.treeVisits).toBe(before.treeVisits);expect(snapshot).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();expect(scans).toBe(0);expect(changes).toHaveLength(0);expect(f.host.querySelector('img')).toBe(img);
});
it('loads visible attachments only while active, cancels stale loads and revokes previews on hiding',async()=>{
 const f=setup(),visible:IntersectionObserverCallback[]=[];
 vi.stubGlobal('IntersectionObserver',class{constructor(callback:IntersectionObserverCallback){visible.push(callback);}observe(){}disconnect(){}});
 const create=vi.fn(()=> 'blob:fixture'),revoke=vi.fn();vi.stubGlobal('URL',class extends URL{static createObjectURL=create;static revokeObjectURL=revoke;});
 const attachment:Attachment={version:1,id:'file',name:'Generated landscape.png',mediaType:'image/png',byteLength:5,origin:'agent',createdUtc:'2026-11-16T00:00:00Z',asset:{kind:'managed',cavernId:'vault',assetId:'sha256:'+'a'.repeat(64)}};
 f.setFiles([attachment]);f.setActive(false);f.mount();await flush();expect(f.c.attachmentBlob).not.toHaveBeenCalled();
 visible[0]([{isIntersecting:true}] as IntersectionObserverEntry[],{} as IntersectionObserver);await flush();expect(f.c.attachmentBlob).not.toHaveBeenCalled();
 f.setActive(true);await flush();expect(f.c.attachmentBlob).toHaveBeenCalledOnce();expect(f.host.querySelector('img')?.getAttribute('src')).toBe('blob:fixture');f.setActive(false);expect(revoke).toHaveBeenCalledWith('blob:fixture');
 let resolve!:(blob:Blob)=>void;vi.mocked(f.c.attachmentBlob).mockImplementation(()=>new Promise(r=>resolve=r));f.setActive(true);await flush();const signal=vi.mocked(f.c.attachmentBlob).mock.calls.at(-1)![1]!;f.setActive(false);expect(signal.aborted).toBe(true);resolve(new Blob(['late']));await flush();expect(create).toHaveBeenCalledOnce();
});
it('uses managed assets, updates an asset-only change, and releases bindings',async()=>{
 const f=setup(),asset={kind:'managed',cavernId:'vault',assetId:'sha256:'+'a'.repeat(64)};f.editor.setAssetContext(()=>({cavernId:'vault',session:'session'}));
 const release=vi.fn(),bind=vi.spyOn(f.editor.assets,'bind').mockImplementation(image=>{image.src='https://example.org/managed.png';queueMicrotask(()=>image.dispatchEvent(new Event('load')));return release;});
 const id=f.image({alt:'Managed portrait'},asset);f.mount();await flush();expect(bind).toHaveBeenCalledOnce();expect(f.host.querySelector('img')?.src).toContain('managed.png');
 const node=f.c.resolve(f.c.target(id,'block'))!;f.editor.commands.setPayloadField(node.key,'asset',{...asset,assetId:'sha256:'+'b'.repeat(64)});await flush();expect(release).toHaveBeenCalledOnce();expect(bind).toHaveBeenCalledTimes(2);f.setActive(false);expect(release).toHaveBeenCalledTimes(2);
});
it('withholds oversized images and shows failed images without automatically requesting AI repair',async()=>{
 const f=setup();f.editor.setAssetContext(()=>({cavernId:'vault',session:'session'}));vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({Success:true,Data:{byteLength:100000000}}));
 f.image();f.mount();await flush();expect(f.host.querySelector('img')).toBeNull();expect(f.host.textContent).toContain('Fetch Full Image');
 [...f.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Fetch Full Image')!.click();await flush();expect(f.host.querySelector('img')?.src).toBe('https://example.org/image.jpg');
 const revision=f.editor.repository.state.revision;f.host.querySelector('img')!.dispatchEvent(new Event('error'));await flush();expect(f.host.textContent).toContain('This image is unavailable');expect(f.editor.repository.state.revision).toBe(revision);expect(fetch).toHaveBeenCalledOnce();
});

it('retains saved replacements and does not launch automatic recovery for a recorded failure',async()=>{
 const f=setup();f.editor.setAssetContext(()=>({cavernId:'vault',session:'session'}));vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({Success:true,Data:{byteLength:1234}}));
 const id=f.image(),node=f.c.resolve(f.c.target(id,'block'))!,repair=vi.fn();f.host.addEventListener(smallerImageEvent,repair);
 recordImageLoad(f.editor,f.view,node.key,'https://example.org/image.jpg','failed');const revision=f.editor.repository.state.revision;f.mount();await flush();
 expect(f.host.textContent).toContain('Request Replacement Image');expect(repair).not.toHaveBeenCalled();expect(f.editor.repository.state.revision).toBe(revision);
 recordImageLoad(f.editor,f.view,node.key,'https://example.org/image.jpg','repair-loaded',undefined,undefined,{replacement:{url:'https://example.org/smaller.jpg',byteLength:1234}});await flush();
 expect(f.host.querySelector('img')?.src).toBe('https://example.org/smaller.jpg');expect(repair).not.toHaveBeenCalled();
});
