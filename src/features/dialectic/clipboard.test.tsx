// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {workspaceFixture} from './dcp/workspace.fixture';
import {XmlContext} from './dcp/xml-context';
import {ReactiveTreeView} from '../../rendering/reactive-tree-view';
import {serializeSelection} from '../../interchange/serializer';
import {ScopedSemanticCopyError} from '../../block-tree/scoped-semantic-copy';
import {NATIVE_MIME} from '../../interchange/transport';
const cleanup:(()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();document.body.replaceChildren();});
async function setup(){
 const f=workspaceFixture();cleanup.push(f.dispose);const human=f.addHuman('Question'),sources=f.open(),request=await f.req(sources,human),authority=new XmlContext(sources,request.exchange);request.dialect='xml/1';authority.request(request);
 await f.admit(sources,authority.lower('<p><span id="pass"><e ref="e">Rome</e> matters.</span></p><p>Second paragraph.</p><entity id="e" name="Rome" type="Place"/><argument id="a" target="pass"/><gloss target="pass" kind="scope">A city.</gloss>'),'agent-A',request);
 const host=document.body.appendChild(document.createElement('div'));cleanup.push(render(()=><ReactiveTreeView editor={f.editor} projection={f.view}/>,host));f.editor.installGateway(document);
 const row=f.view.node(f.root.children.at(-1)!)!,nodes=row.children.map(k=>f.view.node(k)!);
 const select=(i:number,start:number,end:number)=>{const node=nodes[i],m=f.editor.mounts.get(node.key)!;m.focus();m.restoreInlineSelection!({anchor:start,head:end});f.editor.selections.setPrimary(node.key,node.contentKey,node.viewId,start,end);return m;};
 const copy=(target:Element,type='copy')=>{const values:Record<string,string>={},event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{setData:(type:string,value:string)=>values[type]=value,getData:(type:string)=>values[type]??'',types:[]}});target.dispatchEvent(event);return {event,values};};
 return {...f,nodes,select,copy};
}
it('copies selected protected Entity/Argument/Gloss prose without cloning semantic identities or changing the Document',async()=>{
 const f=await setup(),m=f.select(0,0,4),snapshot=vi.spyOn(f.editor.repository,'snapshot'),commit=vi.spyOn(f.editor.repository,'commit');
 expect(()=>serializeSelection(f.editor.repository.readState(),[{placementKey:f.nodes[0].placementKey,start:0,end:4}])).toThrow(ScopedSemanticCopyError);
 const {event,values}=f.copy(m.focusElement);expect(event.defaultPrevented).toBe(true);expect(values['text/plain']).toBe('Rome');expect(values[NATIVE_MIME]).toBeUndefined();
 expect(f.editor.clipboard.message()).toBe('Copied text.');expect(snapshot).not.toHaveBeenCalled();expect(commit).not.toHaveBeenCalled();
 const cut=f.copy(m.focusElement,'cut');expect(cut.values).toEqual({});expect(commit).not.toHaveBeenCalled();
});
it('uses the selected source even when the copy event targets another focused paragraph',async()=>{
 const f=await setup();const stale=f.select(1,0,0);f.select(0,0,4);
 expect(f.copy(stale.focusElement).values['text/plain']).toBe('Rome');
});
it('leaves native selection across Blocks to browser copy instead of replacing it with a stale caret',async()=>{
 const f=await setup(),first=f.select(0,0,4),selection=document.getSelection()!,start=selection.getRangeAt(0).cloneRange();const last=f.select(1,0,6),end=selection.getRangeAt(0).cloneRange();
 start.setEnd(end.endContainer,end.endOffset);selection.removeAllRanges();selection.addRange(start);
 const {event,values}=f.copy(last.focusElement);expect(event.defaultPrevented).toBe(false);expect(values).toEqual({});expect(selection.toString()).toContain('Rome');expect(selection.toString()).toContain('Second');
});
it('copies custom cross-Block selections through the same bounded text fallback',async()=>{
 const f=await setup(),m=f.select(0,0,0);f.editor.crossText.enable(true);
 expect(f.editor.crossText.set(f.editor.crossText.position(f.nodes[0].key,0),f.editor.crossText.position(f.nodes[1].key,6))).toBe(true);
 const values:Record<string,string>={},event=new Event('copy',{cancelable:true});Object.defineProperty(event,'clipboardData',{value:{setData:(t:string,v:string)=>values[t]=v}});
 const snapshot=vi.spyOn(f.editor.repository,'snapshot'),commit=vi.spyOn(f.editor.repository,'commit');
 f.editor.clipboard.handleText(event as ClipboardEvent,true);expect(values['text/plain']).toBe('Rome matters.\nSecond');expect(snapshot).not.toHaveBeenCalled();expect(commit).not.toHaveBeenCalled();
});
