// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import { blockMenuItems } from '../runtime/block-menu-actions';
import { inspectUri } from '../interchange/uri';
const cleanup:Array<()=>void>=[];afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());document.body.replaceChildren();vi.restoreAllMocks();});
function setup(enabled=true){
 const video=inspectUri('https://vimeo.com/76979871').video!;
 const editor=new ReactiveEditor({id:'doc',type:'document-block',children:[{id:'a',type:'standoff-editor-block',text:'text'},{id:'v',type:'mutable/video-block',video}]},{features:{documentInterchange:enabled}});editor.setAssetContext(()=>({cavernId:'c',session:'s'}));registerCoreViews(editor);const view=editor.createView(),host=document.body.appendChild(document.createElement('div'));const dispose=render(()=><ReactiveTreeView editor={editor} projection={view}/>,host);editor.installGateway(document);cleanup.push(()=>{editor.dispose();dispose();});
 const node=(id='a')=>Object.values(view.state.nodes).find(n=>n.payload.id===id)!;const select=(at=0)=>{const n=node(),m=editor.mounts.get(n.key)!;m.focus();m.restoreInlineSelection!({anchor:at,head:at});editor.selections.setPrimary(n.key,n.contentKey,n.viewId,at);};
 const button=()=>host.querySelector<HTMLButtonElement>('.mutable-video-block button')!;
 return {editor,node,select,view,host,button};
}
// encodeDocument adds session caret metadata; compare authored content independently.
const authored=(s:ReturnType<typeof setup>)=>{const dto=s.editor.encodeDocument();if(dto.metadata){const metadata=dto.metadata as Record<string,unknown>;delete metadata.focus;if(!Object.keys(metadata).length)delete dto.metadata;}return dto;};
const question=async(s:ReturnType<typeof setup>,title:string)=>vi.waitFor(()=>expect(s.editor.interchange.question()?.title).toBe(title));
const start=async(s:ReturnType<typeof setup>,choice:string,url='https://example.org/a')=>{s.select();const promise=s.editor.interchange.inspectLinkedResource(s.node().key,url);await question(s,'Inspect / Import linked resource');s.editor.interchange.respond([choice]);return {promise};};
const mockText=(s:ReturnType<typeof setup>,source='<p>Hello <b>world</b></p>')=>{
 const lease={id:'op',token:'token',cavernId:'c'};const begin=vi.spyOn(s.editor.assets,'beginText').mockResolvedValue(lease),acquire=vi.spyOn(s.editor.assets,'acquireText').mockImplementation(async(_l,url,format)=>({source,url,format,mediaType:'text/html',byteHash:'a'.repeat(64)})),action=vi.spyOn(s.editor.assets,'action').mockResolvedValue(undefined);return {begin,acquire,action};
};
it('URL and video insertion do not acquire content through fetch and each undo/redo as one edit',async()=>{
 const s=setup(),fetch=vi.spyOn(globalThis,'fetch'),commits=vi.spyOn(s.editor.repository,'commit');
 for(const choice of ['Insert URL link (no network)','Insert VideoBlock (loads player)']){
  const before=authored(s),{promise}=await start(s,choice,'https://vimeo.com/76979871');await promise;const after=authored(s);expect(after).not.toEqual(before);expect(commits).toHaveBeenCalledTimes(1);s.editor.repository.undo();expect(authored(s)).toEqual(before);s.editor.repository.redo();expect(authored(s)).toEqual(after);s.editor.repository.undo();commits.mockClear();
 }
 expect(fetch).not.toHaveBeenCalled();expect(s.host.querySelector('iframe')).not.toBeNull();
});
it('cannot acquire before consent; cancelled consent changes nothing',async()=>{
 const s=setup(),m=mockText(s),before=authored(s),{promise}=await start(s,'Import html as native Ink at the destination');await question(s,'Allow linked-resource acquisition?');expect(m.begin).not.toHaveBeenCalled();expect(m.acquire).not.toHaveBeenCalled();s.editor.interchange.cancel();await promise;expect(authored(s)).toEqual(before);expect(m.begin).not.toHaveBeenCalled();
});
it('imports through the existing fragment planner and releases the text lease, with exact Undo',async()=>{
 const s=setup(),m=mockText(s),before=authored(s),commit=vi.spyOn(s.editor.repository,'commit');const {promise}=await start(s,'Import html as native Ink at the destination');await question(s,'Allow linked-resource acquisition?');s.editor.interchange.respond([]);await promise;
 expect(m.acquire).toHaveBeenCalledTimes(1);expect(m.action.mock.calls.map(c=>c[1])).toEqual(['abort']);expect(commit).toHaveBeenCalledTimes(1);expect(JSON.stringify(authored(s))).toContain('Hello world');s.editor.repository.undo();expect(authored(s)).toEqual(before);
});
it('does not follow page images until a separate consent; cancelling rolls back the entire insertion',async()=>{
 const s=setup(),m=mockText(s,'<p>Hello<img src="photo.png"></p>'),images=vi.spyOn(s.editor.assets,'remote'),before=authored(s);const {promise}=await start(s,'Import html as native Ink at the destination');await question(s,'Allow linked-resource acquisition?');s.editor.interchange.respond([]);await question(s,'Confirm conversion losses');s.editor.interchange.respond([]);await question(s,'External images');expect(s.editor.interchange.question()!.urls).toEqual(['https://example.org/photo.png']);expect(images).not.toHaveBeenCalled();s.editor.interchange.cancel();await promise;expect(authored(s)).toEqual(before);expect(m.action).toHaveBeenCalled();
});
it.each(['caret','edit','cavern','view','cancel'])('rejects stale linked import after %s',async(kind)=>{
 const s=setup(),m=mockText(s);let finish!:(v:any)=>void;m.acquire.mockImplementation(()=>new Promise(r=>{finish=r;}));const {promise}=await start(s,'Import html as native Ink at the destination');await question(s,'Allow linked-resource acquisition?');s.editor.interchange.respond([]);await vi.waitFor(()=>expect(m.acquire).toHaveBeenCalled());
 if(kind==='caret')s.select(2);if(kind==='edit')s.editor.commands.setPayloadField(s.node().key,'text','changed');if(kind==='cavern')s.editor.setAssetContext(()=>({cavernId:'other',session:'new'}));if(kind==='view')s.editor.disposeView(s.view);if(kind==='cancel')s.editor.interchange.cancel();
 const before=authored(s);finish({source:'<p>never inserted</p>',format:'html',url:'https://example.org/a',mediaType:'text/html',byteHash:'a'.repeat(64)});await promise;expect(authored(s)).toEqual(before);expect(m.action.mock.calls.map(c=>c[1])).toEqual(['abort']);
});
it('source refresh requires fresh consent and restores source identity and baseline with Undo',async()=>{
 const s=setup(),m=mockText(s,'<p>first</p>');const {promise}=await start(s,'Link html source snapshot (explicit refresh)');await question(s,'Allow linked-resource acquisition?');s.editor.interchange.respond([]);await promise;
 const source=()=>Object.values(s.view.state.nodes).find(n=>n.viewType==='mutable/html-source-block')!;s.editor.commands.setPayloadField(source().key,'text','local edit');const before=authored(s);
 m.acquire.mockResolvedValue({source:'<p>updated</p>',url:'https://example.org/a',format:'html',mediaType:'text/html',byteHash:'b'.repeat(64)});s.editor.interchange.refreshSource(source().key);await question(s,'Allow linked-resource acquisition?');expect(m.acquire).toHaveBeenCalledTimes(1);s.editor.interchange.respond([]);await question(s,'Source and local text have changed');s.editor.interchange.respond(['Replace this source Block']);await vi.waitFor(()=>expect(s.editor.interchange.busy()).toBe(false));expect(source().payload.text).toBe('<p>updated</p>');s.editor.repository.undo();expect(authored(s)).toEqual(before);
});
it('player loads automatically without autoplay, remains history-free and reloads on restored occurrence',async()=>{
 const s=setup(),snapshot=authored(s),revision=s.editor.repository.state.revision;const iframe=s.host.querySelector('iframe')!;
 expect(iframe.src).toBe('https://player.vimeo.com/video/76979871?autoplay=0&dnt=1');expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-presentation');expect(iframe.getAttribute('allow')).not.toContain('autoplay');expect(s.editor.repository.state.revision).toBe(revision);expect(authored(s)).toEqual(snapshot);
 s.editor.interchange.closeView(s.view.viewId);expect(s.host.querySelector('iframe')).toBeNull();
 s.editor.commands.remove(s.node('v').key);expect(s.host.querySelector('iframe')).toBeNull();s.editor.repository.undo();expect(s.host.querySelector('iframe')).not.toBeNull();
 s.editor.disposeView(s.view);expect(s.host.querySelector('iframe')).toBeNull();
});
it('retains the exact player across hidden, graph and browser visibility transitions without repository work',async()=>{
 const s=setup(),iframe=s.host.querySelector('iframe'),revision=s.editor.repository.state.revision,commit=vi.spyOn(s.editor.repository,'commit'),snapshot=vi.spyOn(s.editor.repository,'snapshot');
 for(const [name,value] of [['hidden',''],['aria-hidden','true'],['data-view','graph']]){
  s.host.setAttribute(name,value);await new Promise(r=>setTimeout(r,0));expect(s.host.querySelector('iframe')).toBe(iframe);
  s.host.removeAttribute(name);await new Promise(r=>setTimeout(r,0));expect(s.host.querySelector('iframe')).toBe(iframe);
 }
 const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));await new Promise(r=>setTimeout(r,0));
 hidden.mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));expect(s.host.querySelector('iframe')).toBe(iframe);
 expect(s.editor.repository.state.revision).toBe(revision);expect(commit).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();
 s.editor.dispose();expect(s.host.querySelector('iframe')).toBeNull();
});
it('keeps a closed native video occurrence unloaded across visibility transitions',async()=>{
 const s=setup();s.editor.interchange.closeView(s.view.viewId);expect(s.host.querySelector('iframe')).toBeNull();
 s.host.hidden=true;await new Promise(r=>setTimeout(r,0));s.host.hidden=false;await new Promise(r=>setTimeout(r,0));
 expect(s.host.querySelector('iframe')).toBeNull();
});
it('feature-off hides URI commands and leaves video data inactive',async()=>{
 const s=setup(false),fetch=vi.spyOn(globalThis,'fetch');expect(blockMenuItems(s.editor,s.node().key).some(i=>i.label==='Inspect / Import linked resource…')).toBe(false);expect(s.button()).toBeNull();await s.editor.interchange.inspectLinkedResource(s.node().key,'https://example.org');expect(fetch).not.toHaveBeenCalled();
});
