// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {registerApplicationViews} from '../../application/features';
import {ReactiveTreeView} from '../../rendering/reactive-tree-view';
import {smallerImageEvent,type SmallerImageRequest} from './smaller-image-contract';
import {captureNative,nativeBytes,decodeNative} from '../../persistence/native-resource';
import {fullImageThreshold} from './image-size-gate';
const cleanup:(()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();document.body.replaceChildren();});
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
function setup(enabled=true){
 const editor=new ReactiveEditor({id:'doc',type:'document-block',children:[{id:'contribution',type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'committed',author:'ai',replies:[]}},children:[{id:'image',type:'image-block',metadata:{url:'https://example.org/large.jpg',alt:'Lady with an Ermine'}}]},{id:'draft',type:'standoff-editor-block',text:'Draft'}]},{features:{dialecticLargeImageConsent:enabled,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false}});
 editor.setAssetContext(()=>({cavernId:'cavern',session:'session'}));registerApplicationViews(editor);const projection=editor.createView('image-gate');const host=document.body.appendChild(document.createElement('div'));
 const dispose=render(()=><ReactiveTreeView editor={editor} projection={projection}/>,host);cleanup.push(()=>{dispose();editor.dispose();});
 const node=(id:string)=>Object.values(projection.state.nodes).find(n=>n.payload.id===id)!;
 return {editor,host,node,dispose};
}
it('withholds src for >20MB until the button is clicked, then loads in place and records user choice',async()=>{
 let resolve!:(v:Response)=>void;const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(r=>resolve=r));const f=setup();
 expect(f.host.querySelector('img')).toBeNull();expect(f.host.textContent).toContain('Checking image size');
 resolve(new Response(JSON.stringify({Success:true,Data:{byteLength:107119245}})));await flush();
 const button=f.host.querySelector<HTMLButtonElement>('.dialectic-image-fetch button')!;expect(button.textContent).toBe('Fetch Full Image');expect(f.host.querySelector('img')).toBeNull();
 const snapshot=vi.spyOn(f.editor.repository,'snapshot');button.click();await flush();
 expect(f.host.querySelector('.dialectic-image-fetch')).toBeNull();expect(f.host.querySelector('img')?.getAttribute('src')).toBe('https://example.org/large.jpg');expect(snapshot).not.toHaveBeenCalled();
 expect((f.node('contribution').payload.metadata as any).dialectic.notices[0].imageLoad).toMatchObject({byteLength:107119245,originalUrl:'https://example.org/large.jpg',events:[{outcome:'full-requested'}]});
 expect(fetch).toHaveBeenCalledTimes(1);expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({url:'https://example.org/large.jpg'});
 f.host.querySelector('img')!.dispatchEvent(new Event('load'));await flush();expect((f.node('contribution').payload.metadata as any).dialectic.notices[0].detail).toContain('after the user requested');
});
it.each([123,fullImageThreshold,null,'rejected','network'])('loads normally for size/HEAD outcome %s',async value=>{
 vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{if(value==='network')throw Error('offline');return new Response(JSON.stringify(value==='rejected'?{Success:false}:{Success:true,Data:{byteLength:value}}),{status:value==='rejected'?405:200});});
 const f=setup(),revision=f.editor.repository.state.revision;await flush();expect(f.host.querySelector('img')?.getAttribute('src')).toBe('https://example.org/large.jpg');expect(f.host.querySelector('.dialectic-image-fetch button')).toBeNull();expect(f.editor.repository.state.revision).toBe(revision);
});
it('does no probe when disabled, cancels on unmount and performs no probe or snapshots while typing',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(()=>{}));const off=setup(false);expect(off.host.querySelector('img')).toBeTruthy();expect(fetch).not.toHaveBeenCalled();off.dispose();
 const f=setup(),signal=fetch.mock.calls[0][1]!.signal!,snapshot=vi.spyOn(f.editor.repository,'snapshot');
 for(let i=0;i<10;i++)f.editor.commands.replaceInlineRange(f.node('draft').key,0,0,'x');expect(fetch).toHaveBeenCalledTimes(1);expect(snapshot).not.toHaveBeenCalled();
 f.dispose();expect(signal.aborted).toBe(true);
});

const small='https://example.org/small.jpg';
function utility(f:ReturnType<typeof setup>,result:Promise<any>){
 const calls=vi.fn((event:Event)=>{const request=(event as CustomEvent<SmallerImageRequest>).detail;request.accept(result);});
 f.host.addEventListener(smallerImageEvent,calls);return calls;
}
function preload(){
 const images:HTMLImageElement[]=[];
 vi.spyOn(globalThis,'Image').mockImplementation(()=>{const image=document.createElement('img');Object.defineProperty(image,'naturalWidth',{value:800});images.push(image);return image;});
 return images;
}
const smallerButton=(f:ReturnType<typeof setup>)=>[...f.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Fetch Smaller Image')!;
const info=(f:ReturnType<typeof setup>)=>(f.node('contribution').payload.metadata as any).dialectic.notices?.[0]?.imageLoad;
it('requests once, checks and preloads the replacement, persists provenance, and supports Undo/Redo without rewriting authored content',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(JSON.stringify({Success:true,Data:{byteLength:107119245}}))).mockResolvedValue(new Response(JSON.stringify({Success:true,Data:{byteLength:500000}})));
 const images=preload(),f=setup();await flush();
 const calls=utility(f,Promise.resolve({url:small,receipt:{provider:'openai',model:'fixture',responseId:'response-fixture'}}));
 const snapshot=vi.spyOn(f.editor.repository,'snapshot');smallerButton(f).click();smallerButton(f).click();await flush();
 expect(calls).toHaveBeenCalledTimes(1);expect(images).toHaveLength(1);expect(f.host.querySelector('img')).toBeNull();expect(f.host.textContent).toContain('Finding and loading');
 images[0].dispatchEvent(new Event('load'));await flush();
 expect(f.host.querySelector('img')?.src).toBe(small);expect(f.host.querySelector('.dialectic-image-fetch')).toBeNull();expect((f.node('image').payload.metadata as any).url).toBe('https://example.org/large.jpg');
 expect(info(f)).toMatchObject({originalUrl:'https://example.org/large.jpg',replacement:{url:small,byteLength:500000},events:[{outcome:'smaller-requested'},{outcome:'smaller-loaded',receipt:{responseId:'response-fixture'}}]});
 f.host.querySelector('img')!.dispatchEvent(new Event('load'));await flush();expect(info(f).events).toHaveLength(2);
 expect(snapshot).not.toHaveBeenCalled();expect(fetch).toHaveBeenCalledTimes(2);
 const saved=nativeBytes(captureNative(f.editor.repository.readState(),'doc'));expect(nativeBytes(decodeNative(saved))).toEqual(saved);
 f.editor.repository.undo();await flush();expect(info(f).replacement).toBeUndefined();f.editor.repository.redo();await flush();expect(f.host.querySelector('img')?.src).toBe(small);
});
it.each(['oversized','broken','unknown'])('handles %s replacement without automatically downloading the original',async kind=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(JSON.stringify({Success:true,Data:{byteLength:107119245}}))).mockResolvedValue(new Response(JSON.stringify({Success:true,Data:{byteLength:kind==='oversized'?30000000:null}})));
 const images=preload(),f=setup();await flush();utility(f,Promise.resolve({url:small}));smallerButton(f).click();await flush();
 if(kind==='oversized'){expect(images).toHaveLength(0);}else{expect(images).toHaveLength(1);images[0].dispatchEvent(new Event(kind==='broken'?'error':'load'));await flush();}
 if(kind==='unknown'){expect(f.host.querySelector('img')?.src).toBe(small);expect(info(f).replacement.byteLength).toBeNull();}
 else{expect(smallerButton(f).disabled).toBe(false);expect(f.host.querySelector('img')).toBeNull();expect(info(f).events.at(-1).outcome).toBe('smaller-failed');}
 expect(fetch).toHaveBeenCalledTimes(2);
});
it('ignores a utility result after unmount and adds no network or snapshot work while typing',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({Success:true,Data:{byteLength:107119245}})));
 const f=setup();await flush();let resolve!:(v:any)=>void;const calls=utility(f,new Promise(r=>resolve=r));smallerButton(f).click();await flush();
 const snapshot=vi.spyOn(f.editor.repository,'snapshot');for(let i=0;i<10;i++)f.editor.commands.replaceInlineRange(f.node('draft').key,0,0,'x');
 expect(fetch).toHaveBeenCalledTimes(1);expect(calls).toHaveBeenCalledTimes(1);expect(snapshot).not.toHaveBeenCalled();
 const signal=(calls.mock.calls[0][0] as CustomEvent<SmallerImageRequest>).detail.signal;f.dispose();resolve({url:small});await flush();expect(signal.aborted).toBe(true);expect(info(f).replacement).toBeUndefined();expect(fetch).toHaveBeenCalledTimes(1);
});

it('recovers a browser failure after rejected HEAD with one automatic backchannel request and visible status',async()=>{
 vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({Success:false}),{status:405}));
 const images=preload(),f=setup();await flush();let resolve!:(v:any)=>void;const calls=utility(f,new Promise(r=>resolve=r));
 const values=Object.values;vi.spyOn(Object,'values').mockImplementation((value:any)=>{if(value===f.editor.repository.state.contents||value===f.editor.repository.state.placements)throw Error('Full repository scan');return values(value);});
 const snapshot=vi.spyOn(f.editor.repository,'snapshot');f.host.querySelector('img')!.dispatchEvent(new Event('error'));await flush();
 expect(calls).toHaveBeenCalledTimes(1);expect((calls.mock.calls[0][0] as CustomEvent<SmallerImageRequest>).detail.reason).toBe('failed-image');
 expect(f.host.querySelector('img')).toBeNull();expect(f.host.textContent).toContain('Requesting and checking an AI replacement');
 expect(info(f)).toMatchObject({automaticRepairAttempted:true,events:[{outcome:'failed'},{outcome:'repair-requested'}]});
 resolve({url:small,receipt:{provider:'openai',model:'fixture',responseId:'repair-fixture'}});await flush();images[0].dispatchEvent(new Event('load'));await flush();
 expect(f.host.querySelector('img')?.src).toBe(small);expect(f.host.querySelector('.dialectic-image-fetch')).toBeNull();expect(info(f).events.at(-1)).toMatchObject({outcome:'repair-loaded',receipt:{responseId:'repair-fixture'}});expect(snapshot).not.toHaveBeenCalled();
 // A later failure must not start a recursive paid repair cycle.
 f.host.querySelector('img')!.dispatchEvent(new Event('error'));await flush();expect(calls).toHaveBeenCalledTimes(1);expect(f.host.textContent).toContain('Request Replacement Image');
});
it('shows a failed repair explicitly, retains retry controls and never automatically loops',async()=>{
 vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({Success:true,Data:{byteLength:null}})));
 const f=setup();await flush();const calls=utility(f,Promise.resolve({url:null}));f.host.querySelector('img')!.dispatchEvent(new Event('error'));await flush();
 expect(info(f).events.at(-1).outcome).toBe('repair-failed');expect((f.node('contribution').payload.metadata as any).dialectic.notices[0].detail).toContain('backchannel recovery did not succeed');
 const button=(label:string)=>[...f.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label)!;
 expect(button('Retry Image').disabled).toBe(false);expect(button('Request Replacement Image').disabled).toBe(false);
 // Undoing provenance must not itself initiate another paid request.
 f.editor.repository.undo();f.editor.repository.undo();await flush();expect(calls).toHaveBeenCalledTimes(1);
 button('Retry Image').click();await flush();expect(f.host.querySelector('img')).toBeTruthy();f.host.querySelector('img')!.dispatchEvent(new Event('error'));await flush();expect(calls).toHaveBeenCalledTimes(1);
 button('Request Replacement Image').click();await flush();expect(calls).toHaveBeenCalledTimes(2);
});
