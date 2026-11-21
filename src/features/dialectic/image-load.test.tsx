// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createRoot} from 'solid-js';
import {render} from 'solid-js/web';
import {workspaceFixture} from './dcp/workspace.fixture';
import {XmlContext} from './dcp/xml-context';
import {ReactiveTreeView} from '../../rendering/reactive-tree-view';
import {ContributionWarnings} from './activity-view';
import {createContributionActivity} from './activity';
import {contribution} from './model';
import {imageLoadNoticeDelay,recordImageLoad} from './image-load';
import {captureNative,nativeBytes,decodeNative} from '../../persistence/native-resource';
import {unwrap} from 'solid-js/store';
const cleanup:(()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();vi.useRealTimers();document.body.replaceChildren();});
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
const url='https://commons.wikimedia.org/wiki/Special:FilePath/Lady_with_an_Ermine_-_Leonardo_da_Vinci_-_Google_Art_Project.jpg';
async function setup(receiving=false){
 const f=workspaceFixture(true,true,{dialecticSmallerImage:false});cleanup.push(f.dispose);
 const human=f.addHuman('Show images of Leonardo and his circle.'),s=f.open(),r=await f.req(s,human),x=new XmlContext(s,r.exchange);r.dialect='xml/1';x.request(r);
 await f.admit(s,x.lower(`<grid><tr><td><image src="https://example.org/one.jpg" alt="Leonardo"/></td><td><image src="${url}" alt="Lady with an Ermine"/></td><td><image src="https://example.org/three.jpg" alt="Mona Lisa"/></td></tr></grid>`),'agent-A',r);
 let row=f.view.node(f.root.children.at(-1)!)!;
 if(receiving){f.editor.repository.undo();f.editor.commands.insert({id:'receiving-image',type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'receiving',author:'ai',replies:[]}},children:[{id:'image',type:'image-block',metadata:{url,alt:'Lady with an Ermine'}}]},{kind:'at',parentKey:f.root.key,index:f.root.children.length});row=f.view.node(f.root.children.at(-1)!)!;}
 const host=document.body.appendChild(document.createElement('div')),stop=render(()=><ReactiveTreeView editor={f.editor} projection={f.view}/>,host);cleanup.push(stop);
 const image=[...host.querySelectorAll<HTMLImageElement>('.reactive-image img')].find(img=>img.alt==='Lady with an Ermine')!;
 const key=image.closest<HTMLElement>('[data-client-id]')!.dataset.clientId!,node=f.view.node(key)!;
 const data=()=>contribution((row.payload.metadata as any)?.dialectic)!,notices=()=>data().notices??[];
 const activity=createRoot(dispose=>{cleanup.push(dispose);return createContributionActivity(data,()=>f.refs,{candidates:0,resolutions:0});});
 const summary=document.body.appendChild(document.createElement('div')),inspect=vi.fn();cleanup.push(render(()=><ContributionWarnings notices={activity().notices} inspect={inspect}/>,summary));
 return {...f,row,image,node,data,notices,summary,inspect,stop};
}
it('records the second image failure, exposes a linked warning, deduplicates and persists without rewriting source or invalidating exchange authority',async()=>{
 const f=await setup(),s=f.open();s.fence(f.row.contentKey);
 const before=nativeBytes(captureNative(f.editor.repository.readState(),f.owner));
 const snapshot=vi.spyOn(f.editor.repository,'snapshot'),commit=vi.spyOn(f.editor.repository,'commit'),fetch=vi.spyOn(globalThis,'fetch');
 const values=Object.values,scans=vi.spyOn(Object,'values').mockImplementation((value:any)=>{if(value===f.editor.repository.state.contents||value===f.editor.repository.state.placements)throw Error('Full repository scan');return values(value);});
 f.image.dispatchEvent(new Event('error'));await flush();
 expect(f.notices()).toHaveLength(1);expect(f.notices()[0]).toMatchObject({code:'image-load',target:{kind:'block',resourceId:f.owner,blockId:f.node.payload.id},imageLoad:{originalUrl:url,method:'browser',events:[{outcome:'failed',at:expect.any(String)}]}});
 expect(f.summary.querySelector('summary')?.getAttribute('aria-label')).toBe('Contribution warnings');expect(f.summary.textContent).toContain('could not be loaded');
 const link=f.summary.querySelector<HTMLButtonElement>('.dialectic-notice-target')!;expect(link.textContent).toBe('Lady with an Ermine');link.click();expect(f.inspect).toHaveBeenCalledWith(f.notices()[0].target);
 expect(()=>s.check()).not.toThrow();expect((f.node.payload.metadata as any).url).toBe(url);
 expect(commit).toHaveBeenCalledTimes(1);expect(snapshot).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();scans.mockRestore();
 const revision=f.editor.repository.state.revision;f.image.dispatchEvent(new Event('error'));await flush();expect(f.editor.repository.state.revision).toBe(revision);
 const saved=nativeBytes(captureNative(f.editor.repository.readState(),f.owner));expect(nativeBytes(decodeNative(saved))).toEqual(saved);
 f.editor.repository.undo();expect(f.notices()).toHaveLength(0);expect(nativeBytes(captureNative(f.editor.repository.readState(),f.owner))).toEqual(before);
 f.editor.repository.redo();expect(nativeBytes(captureNative(f.editor.repository.readState(),f.owner))).toEqual(saved);
 const metadata=structuredClone(unwrap(f.row.payload.metadata)) as any;metadata.dialectic.ordinal=999;
 expect(()=>f.editor.commands.setPayloadField(f.row.key,'metadata',metadata)).toThrow(/protected/);
 expect(()=>f.editor.commands.setPayloadField(f.node.key,'metadata',{url:'https://example.org/replacement.jpg'})).toThrow(/protected/);
});
it('reports delayed loading accurately, records later success and does not dirty successful images',async()=>{
 const f=await setup();f.image.dispatchEvent(new Event('load'));await flush();expect(f.notices()).toHaveLength(0);
 // Re-mounting is a new real load attempt; use the event recorder for the timeout
 // outcome and verify the renderer timer separately below.
 recordImageLoad(f.editor,f.view,f.node.key,url,'delayed');expect(f.notices()[0].detail).toContain('may still load');
 f.image.dispatchEvent(new Event('load'));await flush();expect(f.notices()[0].detail).toContain('subsequently loaded successfully');expect(f.notices()[0].imageLoad!.events.map(e=>e.outcome)).toEqual(['delayed','loaded']);
 expect(f.notices()[0].detail).not.toContain('refetch');
});
it('warns after 15 seconds and defers receiving warnings until stream completion',async()=>{
 vi.useFakeTimers();const f=await setup(true);
 await vi.advanceTimersByTimeAsync(imageLoadNoticeDelay);expect(f.notices()).toHaveLength(0);
 f.image.dispatchEvent(new Event('error'));await flush();expect(f.notices()).toHaveLength(0);
 f.editor.textProtection.receivingInsertion(f.row.contentKey,()=>f.editor.commands.boundedStructuralTransaction('Finish stream',()=>f.editor.commands.setPayloadField(f.row.key,'metadata',{dialectic:{...structuredClone(unwrap(f.data())),state:'committed',notices:[]}})));
 await flush();expect(f.notices()).toHaveLength(1);expect(f.notices()[0].imageLoad!.events.map(e=>e.outcome)).toEqual(['delayed','failed']);
});
it('cancels timeout work on unmount and does not observe unrelated typing',async()=>{
 vi.useFakeTimers();const f=await setup(),parent=vi.spyOn(f.view,'parentOf'),snapshot=vi.spyOn(f.editor.repository,'snapshot');
 f.editor.commands.insert({id:'typing',type:'standoff-editor-block',text:'Draft'},{kind:'at',parentKey:f.root.key,index:f.root.children.length});const draft=f.view.node(f.root.children.at(-1)!)!;parent.mockClear();
 for(let i=0;i<10;i++)f.editor.commands.replaceInlineRange(draft.key,0,0,'a');
 expect(parent.mock.calls.filter(([key])=>key===f.node.key)).toHaveLength(0);expect(snapshot).not.toHaveBeenCalled();
 f.stop();const revision=f.editor.repository.state.revision;await vi.advanceTimersByTimeAsync(imageLoadNoticeDelay+1);expect(f.editor.repository.state.revision).toBe(revision);expect(f.notices()).toHaveLength(0);
});
