// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import { convertTei } from '../interchange/tei/convert';
import * as converter from '../interchange/tei/convert';
import * as native from '../persistence/native-resource';
import { resourceToRepository } from '../history/durable-core';
import { createTeiImportFeature } from '../features/tei-import';
import { GlossSessionIndex } from '../features/gloss/session-index';
const cleanup:(()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();document.body.replaceChildren();});
const source='<TEI><teiHeader><titleStmt><title>Header title</title><author>Header author</author></titleStmt><correspDesc><correspAction type="sent"><persName ref="#missing">Alice</persName></correspAction></correspDesc></teiHeader><text><body><p>Read <persName ref="#missing">Mary</persName> now.</p><lg><l>A😀BC</l><l xml:id="identified">Other</l></lg><p>Before<choice><orig>olde</orig><reg>old</reg></choice>after</p></body></text></TEI>';
function setup(xml=source,enabled=true,inlineAlternatives=true){
 const result=convertTei(xml,{},'TEI document',undefined,{inlineAlternatives}),e=new ReactiveEditor(result.document,{features:{teiImport:enabled,inlineAlternatives}});
 registerCoreViews(e);if(enabled)e.featureHost.activate(createTeiImportFeature(e));
 const v=e.createView(),host=document.body.appendChild(document.createElement('div')),unmount=render(()=><ReactiveTreeView editor={e} projection={v}/>,host);e.installGateway(document);
 cleanup.push(()=>{unmount();e.dispose();});
 const text=(value:string)=>Object.values(v.state.nodes).find(n=>n.viewType==='standoff-editor-block'&&n.inlineContent.map(k=>v.state.nodes[k].payload.text).join('')===value)!;
 const select=(key:string,start:number,end=start)=>{const n=e.node(key)!,m=e.mounts.get(key)!;m.focus();m.restoreInlineSelection!({anchor:start,head:end});e.selections.setPrimary(key,n.contentKey,n.viewId,start,end);return m.focusElement;};
 const value=(key:string)=>e.node(key)!.inlineContent.map(k=>e.node(k)!.payload.text).join('');
 const input=(key:string,start:number,type:string,data:string|null=null)=>{const event=new InputEvent('beforeinput',{inputType:type,data,bubbles:true,cancelable:true});select(key,start).dispatchEvent(event);return event;};
 return {e,v,host,text,select,value,input,result};
}
it('opens on primary text, reveals editable metadata using native tabs, and preserves semantics with the feature off',async()=>{
 const f=setup(source,false);expect(f.host.querySelectorAll('.reactive-page')).toHaveLength(1);
 expect(f.host.textContent).toContain('Read Mary now.');expect(f.host.textContent).not.toContain('Header title');
 const tab=(label:string)=>[...f.host.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(b=>b.textContent===label)!;
 tab('Metadata').click();await Promise.resolve();expect(f.host.textContent).toContain('Header title');expect(f.host.textContent).not.toContain('Read Mary now.');
 const title=f.text('Header title');expect(f.input(title.key,6,'insertText','edited ').defaultPrevented).toBe(true);expect(f.value(title.key)).toBe('Headeredited  title');
 f.e.repository.undo();expect(f.value(title.key)).toBe('Header title');tab('Text').click();expect(f.host.textContent).toContain('Read Mary now.');
 expect(f.e.standoffPropertyTypes.get('tei/semantic')).toBeUndefined();
});
it('edits nonvisual linked semantic metadata through the existing annotation monitor',async()=>{
 const f=setup(),p=f.text('Read Mary now.');const flow=f.select(p.key,6);
 flow.dispatchEvent(new KeyboardEvent('keydown',{key:'.',ctrlKey:true,bubbles:true,cancelable:true}));await Promise.resolve();
 const panel=document.querySelector<HTMLElement>('.reactive-annotation-monitor')!;expect(panel).not.toBeNull();
 const field=[...panel.querySelectorAll('label')].find(l=>l.textContent?.startsWith('Metadata'))!.querySelector('textarea')!;
 const metadata=JSON.parse(field.value);expect(metadata.references[0].tokens[0].state).toBe('unresolved');metadata.reviewed=true;field.value=JSON.stringify(metadata);field.dispatchEvent(new InputEvent('input',{bubbles:true}));
 panel.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 const defs=f.e.repository.state.contents[f.v.state.nodes[f.v.state.rootKey].contentKey].payload.linkedAnnotations as any;
 expect(Object.values(defs).some((d:any)=>d.metadata?.reviewed)).toBe(true);f.e.repository.undo();expect(Object.values((f.e.node(f.v.state.rootKey)!.payload.linkedAnnotations as any)).some((d:any)=>d.metadata?.reviewed)).toBe(false);
});
it('keeps typing and provisional input local and retains existing Mode continuation/join guards',async()=>{
 const f=setup(),p=f.text('A😀BC'),q=f.text('Other'),unaffected=f.e.repository.state.contents[q.contentKey];
 const save=()=>native.nativeText(native.captureNative(f.e.repository.readState(),f.result.document.id));const before=save();
 const spies=[vi.spyOn(converter,'convertTei'),vi.spyOn(native,'captureNative'),vi.spyOn(f.e.repository,'snapshot'),vi.spyOn(f.e.repository as any,'rebuildReferences'),vi.spyOn(f.v as any,'build'),vi.spyOn(f.e,'encodeDocument'),vi.spyOn(f.e.persistence,'saveDocument'),vi.spyOn(globalThis,'fetch'),vi.spyOn(f.e.blockModes,'list'),vi.spyOn(f.e.standoffPropertyTypes,'list')];
 f.input(p.key,1,'insertText','x');expect(f.value(p.key)).toBe('Ax😀BC');f.e.repository.undo();f.e.repository.redo();f.e.repository.undo();
 const flow=f.select(p.key,0),mount=f.e.mounts.get(p.key)!;
 flow.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));expect(mount.composing).toBe(true);
 flow.querySelector('[data-inline-index="0"]')!.firstChild!.textContent='漢';flow.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText',data:'漢'}));
 expect(f.value(p.key)).toBe('A😀BC');flow.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'漢'}));expect(f.value(p.key)).toBe('漢😀BC');f.e.repository.undo();
 spies.forEach(s=>expect(s).not.toHaveBeenCalled());expect(f.e.repository.state.contents[q.contentKey]).toBe(unaffected);spies.forEach(s=>s.mockRestore());expect(save()).toBe(before);
 expect(f.input(p.key,2,'insertParagraph').defaultPrevented).toBe(true);await Promise.resolve();expect(f.v.state.nodes[p.key].payload.mode).toBe('tei/verse-line');f.e.repository.undo();
 const beforeRefusal=save();expect(()=>f.e.commands.splitStandoff(q.key,1)).toThrow(/continuation policy/);expect(save()).toBe(beforeRefusal);
 expect(()=>f.e.commands.joinStandoff(p.key,q.key)).toThrow(/policy/);expect(save()).toBe(beforeRefusal);
});
it('changes fallback alternative tabs, edits each reading and reloads native state with inline alternatives disabled',async()=>{
 const f=setup(source,true,false);const reg=[...f.host.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(b=>b.textContent==='reg')!;reg.click();
 const p=f.text('old');f.input(p.key,3,'insertText','er');expect(f.value(p.key)).toBe('older');
 const bytes=native.nativeBytes(native.captureNative(f.e.repository.readState(),f.result.document.id)),state=resourceToRepository(native.decodeNative(bytes));
 expect(Object.values(state.contents).filter(c=>c.viewType==='page-block')).toHaveLength(1);
 expect(JSON.stringify(state)).toContain('tei/editorial');f.e.repository.undo();expect(f.value(p.key)).toBe('old');
});
it('supports a native Gloss and existing page margin relation without a new presentation path',()=>{
 const f=setup(),p=f.text('Read Mary now.');f.select(p.key,0,4);expect(f.e.gloss.open(p.key,{anchor:0,head:4})).toBe(true);expect(f.e.gloss.commit('note: Imported document note')).toBe(true);
 const index=new GlossSessionIndex(f.e,f.v,f.v.state.rootKey);cleanup.push(()=>index.dispose());expect(index.rows[0]().some(r=>r.data().body.includes('Imported document note'))).toBe(true);
 f.e.commands.ensureMargin(p.key,'left');expect(f.e.node(p.key)!.ownedRelations.leftMargin).toBeTruthy();expect(f.host.querySelector('.reactive-page [data-relation-name="leftMargin"]')).not.toBeNull();
});
it.each(['A040080.xml','A041209.xml'])('opens and edits the real letter %s with metadata initially secondary',async name=>{
 const f=setup(readFileSync(`src/interchange/tei/fixtures/${name}`,'utf8'));
 expect(f.host.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Text');
 const mounted=Object.values(f.v.state.nodes).find(n=>n.viewType==='standoff-editor-block'&&n.inlineContent.length>10&&f.e.mounts.get(n.key));expect(mounted).toBeTruthy();
 const before=f.value(mounted!.key);f.input(mounted!.key,0,'insertText','X');expect(f.value(mounted!.key)).toBe('X'+before);f.e.repository.undo();expect(f.value(mounted!.key)).toBe(before);
 const tab=[...f.host.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(b=>b.textContent==='Metadata')!;tab.click();await Promise.resolve();expect(f.host.textContent).toContain('Metadata');
},60000);

it('offers TEI only for full-document import and restricts its explicit picker to XML/TEI files',()=>{
 const f=setup(),host={current:()=>true,open:()=>{}};f.e.interchange.pickNew(host);
 const selector=document.querySelector<HTMLSelectElement>('[data-document-interchange] select')!;expect([...selector.options].some(o=>o.value==='tei')).toBe(true);
 selector.value='tei';selector.dispatchEvent(new Event('change',{bubbles:true}));expect(document.querySelector<HTMLInputElement>('input[aria-label="External files"]')!.accept).toBe('.tei,.xml');
 f.e.interchange.closePicker();const p=f.text('Read Mary now.');f.select(p.key,0);f.e.interchange.pickInsert(p.key);
 expect([...document.querySelector<HTMLSelectElement>('[data-document-interchange] select')!.options].some(o=>o.value==='tei')).toBe(false);
 expect(document.querySelector<HTMLInputElement>('input[aria-label="External files"]')!.accept).not.toContain('.tei');
});
