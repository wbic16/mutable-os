// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ReactiveEditor } from '../reactive-editor/editor';
import { nativeDocumentSession } from './native-session';
import { captureNative, nativeText } from './native-resource';
import { createNativeDocumentStoreRouter } from '../../server/native-document-store.mjs';
import { promises as vfs } from '../../server/phext-fs.mjs';
import { testCavern } from '../knowledge-sqlite/phext-test-cavern.mjs';
import { normalizeDefinitionOwnership } from '../block-tree/definition-ownership';
import * as markdown from './markdown';
import { browserSaveDiagnostics } from './browser-save-diagnostics';
import {ResourcePair} from './resource-pair';
const cleanup:Array<()=>any>=[];afterEach(async()=>{for(const dispose of cleanup.splice(0).reverse())await dispose();vi.unstubAllGlobals();vi.restoreAllMocks();});
async function host(readOnly=false) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'native-client-'));cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));const cavern=testCavern(root);cleanup.push(()=>cavern.close());
 await vfs.writeFile(path.join(root,'rich.mutable.json'),await fs.readFile('artifacts/flint-b1.2/rich.mutable.json'));
 await vfs.writeFile(path.join(root,'import.md'),'# Heading\n\n**Bold**');
 const app=express();app.use('/api/native',createNativeDocumentStoreRouter({root,readOnly}));
 const server:any=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});cleanup.push(()=>new Promise(r=>server.close(r)));
 const actual=globalThis.fetch;vi.stubGlobal('fetch',(input:any,options:any)=>actual(typeof input==='string'&&input.startsWith('/')?`http://127.0.0.1:${server.address().port}${input}`:input,options));
 const make=(compactCanonicalText=false)=>{const editor=new ReactiveEditor({id:crypto.randomUUID(),type:'workspace-block',children:[{id:crypto.randomUUID(),type:'workspace-object-bank-block',children:[]}]},{features:{compactCanonicalText}});cleanup.push(()=>editor.dispose());return {editor,service:nativeDocumentSession(editor)}};
 return {root,make};
}
it('opens canonically without an occurrence, saves/reopens, and blocks tree/extended/Workspace bypasses',async()=>{
 const f=await host(),{editor,service}=f.make(),location={folder:'.',filename:'rich.mutable.json'};
 const id=await service.open(location);expect(editor.projections.size).toBe(0);expect(await service.save(id)).toMatchObject({phase:'saved',dirty:false});
 expect(()=>editor.encodeWorkspace()).toThrow('native Documents');expect(()=>editor.encodeDocument()).toThrow('native Documents');expect(await editor.persistence.saveExtendedRepository('copy.json')).toBe(false);
 const fresh=f.make();expect(await fresh.service.open(location)).toBe(id);expect(nativeText(captureNative(fresh.editor.repository.snapshot(),id))).toBe(nativeText(captureNative(editor.repository.snapshot(),id)));
});
it('does not refresh a stale client baseline after a rejected Save or Open',async()=>{
 const f=await host(),one=f.make(),two=f.make(),location={folder:'.',filename:'rich.mutable.json'};
 const id=await one.service.open(location);await one.service.save(id);await two.service.open(location);
 const resource=Object.values(one.editor.repository.state.contents).find(c=>c.viewType==='document-block')!;
 const p=Object.values(one.editor.repository.state.placements).find(p=>p.contentKey===resource.key)!;
 one.editor.commands.setPayloadField(p.key,'metadata',{...resource.payload.metadata as any,title:'New title'});
 await one.service.save(id);expect(await two.service.save(id)).toMatchObject({phase:'failed',conflict:true});
 await expect(two.service.open(location)).rejects.toThrow('server file changed');expect(await two.service.save(id)).toMatchObject({phase:'failed',conflict:true});
});
it('imports Markdown into a new native identity, preserves the source, and keeps locations out of identity',async()=>{
 const f=await host(),{editor,service}=f.make();
 await expect(service.open({folder:'.',filename:'import.md'})).rejects.toThrow('Import Markdown');
 const a=await service.open({folder:'.',filename:'import.md'},true),b=await service.open({folder:'.',filename:'import.md'},true);expect(a).not.toBe(b);
 expect(await service.save(a,{folder:'.',filename:'chosen.mutable.json'})).toMatchObject({phase:'saved'});
 expect((await vfs.readFile(path.join(f.root,'import.md'),'utf8'))).toBe('# Heading\n\n**Bold**');
 expect(captureNative(editor.repository.snapshot(),a).resourceId).toBe(a);
});
it('read-only rejection has no pending publication and does not cancel ordinary editing',async()=>{
 const f=await host(true),{editor,service}=f.make(),id=await service.open({folder:'.',filename:'rich.mutable.json'});
 const c=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='standoff-editor-block')!;
 const p=Object.values(editor.repository.readState().placements).find(p=>p.contentKey===c.key)!;
 editor.commands.replaceInlineRange(p.key,0,0,'Still editable');expect(service.isDirty(id)).toBe(true);
 const result=await service.save(id);expect(result?.phase).toBe('failed');expect(result?.generation).toBeUndefined();expect(service.status(id)).toContain('read-only');
 expect(service.isDirty(id)).toBe(true);
});
it('a rejected first destination can be corrected without changing the candidate identity',async()=>{
 const f=await host(),{service}=f.make(),id=await service.open({folder:'.',filename:'import.md'},true);
 const failed=await service.save(id,{folder:'.',filename:'rich.mutable.json'});expect(failed?.phase).toBe('failed');
 // A pre-publication identity collision is a rejection, not an uncertain write.
 const retried=await service.save(id,{folder:'.',filename:'fresh.mutable.json'});expect(retried?.phase).toBe('saved');expect(service.location(id)?.filename).toBe('fresh.mutable.json');
});

it('opens a native resource without taking a workspace snapshot to rebuild its binding membership',async()=>{
 const f=await host(),{editor,service}=f.make(),snapshot=vi.spyOn(editor.repository,'snapshot');
 const id=await service.open({folder:'.',filename:'rich.mutable.json'});
 expect(snapshot).not.toHaveBeenCalled();snapshot.mockRestore();
 const c=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='standoff-editor-block')!;
 const p=Object.values(editor.repository.readState().placements).find(p=>p.contentKey===c.key)!;
 editor.commands.replaceInlineRange(p.key,0,0,'Unsaved ');
 expect(service.status(id)).toContain('Save required');
 expect((await service.save(id))?.phase).toBe('saved');
 expect((await vfs.readFile(path.join(f.root,'rich.mutable.json'),'utf8'))).toContain('Unsaved ');
});

it.each(['letter.ink','letter.phosphor','letter.mutable.json'])('saves only Mutable JSON to the opened filename %s, with cheap dirty tracking and no background save',async filename=>{
 const f=await host(),{editor,service}=f.make(),location={folder:'.',filename};
 await vfs.writeFile(path.join(f.root,filename),await vfs.readFile(path.join(f.root,'rich.mutable.json')));
 const id=await service.open(location),before=await vfs.readFile(path.join(f.root,filename),'utf8');
 expect(service.isDirty(id)).toBe(false);
 const diagnostics=vi.spyOn(browserSaveDiagnostics,'record').mockImplementation(()=>{});
 const projection=vi.spyOn(markdown,'exportMarkdown'),snapshot=vi.spyOn(editor.repository,'snapshot');
 const c=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='standoff-editor-block')!;
 const p=Object.values(editor.repository.readState().placements).find(p=>p.contentKey===c.key)!;
 for(let i=0;i<3;i++){editor.commands.replaceInlineRange(p.key,0,0,'Unsaved ');expect(service.isDirty(id)).toBe(true);await Promise.resolve();}
 expect(diagnostics).not.toHaveBeenCalled();
 expect(snapshot).not.toHaveBeenCalled();snapshot.mockRestore();
 expect(await vfs.readFile(path.join(f.root,filename),'utf8')).toBe(before);
 expect(await service.save(id,{folder:'.',filename:'Unwanted.mutable.json'})).toMatchObject({phase:'saved',dirty:false});
 expect(service.isDirty(id)).toBe(false);expect(service.location(id)).toEqual(location);
 expect(JSON.parse(await vfs.readFile(path.join(f.root,filename),'utf8')).format).toBe('mutable-document');
 expect((await vfs.readdir(f.root)).filter(name=>name.endsWith('.md'))).toEqual(['import.md']);
 expect(await vfs.stat(path.join(f.root,'Unwanted.mutable.json')).catch(()=>null)).toBeNull();
 expect(projection).not.toHaveBeenCalled();
});

it('records a failed Save and exact-generation recovery without logging document contents',async()=>{
 const f=await host(),{editor,service}=f.make(),location={folder:'.',filename:'rich.mutable.json'},id=await service.open(location);
 const diagnostics=vi.spyOn(browserSaveDiagnostics,'record').mockImplementation(()=>{});
 const c=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='standoff-editor-block')!;
 const p=Object.values(editor.repository.readState().placements).find(p=>p.contentKey===c.key)!;
 editor.commands.replaceInlineRange(p.key,0,0,'PRIVATE DOCUMENT TEXT');
 const actual=globalThis.fetch;
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
 expect(await service.save(id)).toMatchObject({phase:'failed',dirty:true});
 const attempted=diagnostics.mock.calls.find(([event])=>event==='native.request')![1]!;
 expect(attempted).toMatchObject({action:'save',resourceId:id,filename:location.filename});
 expect(diagnostics.mock.calls.find(([event])=>event==='native.network-failure')![1]).toMatchObject({generation:attempted.generation,error:'network-request-failed'});
 editor.commands.replaceInlineRange(p.key,0,0,'NEWER UNSAVED TEXT');
 vi.stubGlobal('fetch',actual);
 expect(await service.recover(id,location)).toMatchObject({phase:'saved',dirty:true});
 const requests=diagnostics.mock.calls.filter(([event])=>event==='native.request').map(([,fields])=>fields!);
 expect(requests[1].generation).toBe(requests[0].generation);
 expect(requests[1].requestId).not.toBe(requests[0].requestId);
 expect(diagnostics.mock.calls.find(([event])=>event==='native.response')![1]).toMatchObject({status:200,phase:'saved'});
 expect(JSON.stringify(diagnostics.mock.calls)).not.toMatch(/PRIVATE DOCUMENT TEXT|NEWER UNSAVED TEXT|nativeHash/);
 const saved=await fs.readFile(path.join(f.root,location.filename),'utf8');
 expect(saved).toContain('PRIVATE DOCUMENT TEXT');expect(saved).not.toContain('NEWER UNSAVED TEXT');
});

it('keeps newer edits dirty when an earlier explicit save completes',async()=>{
 const f=await host(),{editor,service}=f.make(),id=await service.open({folder:'.',filename:'rich.mutable.json'});
 const c=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='standoff-editor-block')!;
 const p=Object.values(editor.repository.readState().placements).find(p=>p.contentKey===c.key)!;
 const fetch=globalThis.fetch;let arrived!:()=>void,resume!:()=>void;
 const received=new Promise<void>(resolve=>arrived=resolve),held=new Promise<void>(resolve=>resume=resolve);
 vi.stubGlobal('fetch',async(input:any,options:any)=>{const response=await fetch(input,options);if(String(input).endsWith('/save')){arrived();await held;}return response;});
 editor.commands.replaceInlineRange(p.key,0,0,'First edit ');
 const saving=service.save(id);await received;
 editor.commands.replaceInlineRange(p.key,0,0,'Later edit ');resume();
 expect(await saving).toMatchObject({phase:'saved',dirty:true});expect(service.isDirty(id)).toBe(true);
 expect(await vfs.readFile(path.join(f.root,'rich.mutable.json'),'utf8')).not.toContain('Later edit');
 expect(await service.save(id)).toMatchObject({phase:'saved',dirty:false});expect(service.isDirty(id)).toBe(false);
});
it('does not clear an edit made between save acknowledgement and session completion',async()=>{
 const f=await host(),{editor,service}=f.make(),id=await service.open({folder:'.',filename:'rich.mutable.json'});
 const c=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='standoff-editor-block')!;
 const p=Object.values(editor.repository.readState().placements).find(p=>p.contentKey===c.key)!;
 const original=ResourcePair.prototype.save;
 vi.spyOn(ResourcePair.prototype,'save').mockImplementationOnce(async function(this:ResourcePair){
   const result=await original.call(this);
   editor.commands.replaceInlineRange(p.key,0,0,'After acknowledgement ');
   return result;
 });
 expect(await service.save(id)).toMatchObject({phase:'saved',dirty:true});expect(service.isDirty(id)).toBe(true);
 expect(await fs.readFile(path.join(f.root,'rich.mutable.json'),'utf8')).not.toContain('After acknowledgement');
 expect(await service.save(id)).toMatchObject({phase:'saved',dirty:false});
 expect(await fs.readFile(path.join(f.root,'rich.mutable.json'),'utf8')).toContain('After acknowledgement');
});

it.each([false,true])('tracks empty paragraph removal and undo incrementally (retained=%s)',async retained=>{
 const f=await host(),{editor,service}=f.make(),id=await service.open({folder:'.',filename:'rich.mutable.json'});
 const c=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='standoff-editor-block')!;
 const p=Object.values(editor.repository.readState().placements).find(p=>p.contentKey===c.key)!;
 if(retained){
   const doc=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='document-block')!;
   const members=Object.keys(captureNative(editor.repository.readState(),id).contents);
   const normalized=normalizeDefinitionOwnership(editor.repository.readState(),new Map(members.map(k=>[k,doc.key])));
   editor.repository.commit('Normalize definition owners',members.map(k=>({kind:'put-content',record:normalized.contents[k]})));
 }
 const empty=editor.commands.insertEmptyStandoffSibling(p.key,'after');
 const child=editor.repository.readState().placements[empty].contentKey;
 expect(!!editor.repository.readState().contents[child].definitionOwnerKey).toBe(retained);
 await service.save(id); expect(service.isDirty(id)).toBe(false);
 const snapshot=vi.spyOn(editor.repository,'snapshot');
 editor.commands.remove(empty);
 expect(service.isDirty(id)).toBe(true);
 expect(editor.repository.readState().placements[empty]).toBeUndefined();
 expect(!!editor.repository.readState().contents[child]).toBe(retained);
 editor.repository.undo(); editor.repository.redo(); editor.repository.undo();
 expect(snapshot).not.toHaveBeenCalled(); snapshot.mockRestore();
 await service.save(id); expect(service.isDirty(id)).toBe(false);
 editor.commands.replaceInlineRange(empty,0,0,'Restored'); expect(service.isDirty(id)).toBe(true);
 expect(await service.save(id)).toMatchObject({phase:'saved',dirty:false});
 const fresh=f.make(); await fresh.service.open({folder:'.',filename:'rich.mutable.json'});
 expect(nativeText(captureNative(fresh.editor.repository.readState(),id))).toBe(nativeText(captureNative(editor.repository.readState(),id)));
});

it.each([false,true])('tracks list wrapping without snapshots and saves list/Undo states (ordered=%s)',async ordered=>{
 const f=await host(),{editor,service}=f.make(),location={folder:'.',filename:'rich.mutable.json'},id=await service.open(location);
 const state=editor.repository.readState(),content=Object.values(state.contents).find(c=>c.viewType==='standoff-editor-block')!;
 const placement=Object.values(state.placements).find(p=>p.contentKey===content.key)!;
 editor.commands.replaceInlineRange(placement.key,0,content.inlineContent.length,'- ');
 const snapshot=vi.spyOn(editor.repository,'snapshot');
 const wrapper=editor.commands.wrapTextBlockInList(placement.key,2,ordered?{ordered:true,start:123456789}:{ordered:false});editor.repository.undo();editor.repository.redo();
 expect(snapshot).not.toHaveBeenCalled();expect(service.isDirty(id)).toBe(true);snapshot.mockRestore();
 expect(await service.save(id)).toMatchObject({phase:'saved',dirty:false});
 const fresh=f.make();await fresh.service.open(location);
 expect(nativeText(captureNative(fresh.editor.repository.readState(),id))).toBe(nativeText(captureNative(editor.repository.readState(),id)));
 expect(editor.repository.readState().placements[wrapper]).toBeDefined();
 editor.repository.undo();expect(await service.save(id)).toMatchObject({phase:'saved',dirty:false});
 const literal=f.make();await literal.service.open(location);
 expect(nativeText(captureNative(literal.editor.repository.readState(),id))).toBe(nativeText(captureNative(editor.repository.readState(),id)));
});

it('marks Initialis authoring dirty without saving, and persists full settings on manual Save',async()=>{
 const f=await host(),{editor,service}=f.make(),location={folder:'.',filename:'rich.mutable.json'};
 const id=await service.open(location),view=editor.createView('initialis-save-proof');
 const node=Object.values(view.state.nodes).find(n=>n.viewType==='standoff-editor-block'&&n.inlineContent.some(k=>/^[A-Z]$/.test(String(view.state.nodes[k]?.payload.text))))!;
 const index=node.inlineContent.findIndex(k=>/^[A-Z]$/.test(String(view.state.nodes[k]?.payload.text)));
 const before=await vfs.readFile(path.join(f.root,location.filename),'utf8');expect(service.isDirty(id)).toBe(false);
 const snapshot=vi.spyOn(editor.repository,'snapshot');
 expect(editor.initialis.apply(node.key,{anchor:index,head:index+1})).toBe(true);
 expect(snapshot).not.toHaveBeenCalled();expect(service.isDirty(id)).toBe(true);expect(await vfs.readFile(path.join(f.root,location.filename),'utf8')).toBe(before);
 expect(editor.initialis.service.stats.workersStarted).toBe(0);snapshot.mockRestore();
 expect(await service.save(id)).toMatchObject({phase:'saved',dirty:false});
 const fresh=f.make();await fresh.service.open(location);
 const properties=Object.values(fresh.editor.repository.readState().contents).flatMap(c=>(c.payload.standoffProperties??[]) as any[]),property=properties.find(p=>p.type==='style/character-surface');
 expect(property.metadata.renderer).toBe('initialis');expect(Object.keys(property.metadata.settings)).toHaveLength(156);expect(property.metadata.settings).not.toHaveProperty('text');
 expect((await vfs.readdir(f.root)).filter(name=>name.endsWith('.md'))).toEqual(['import.md']);
});

it('saves a TEI import only on explicit native Save and reopens its semantic document without changing the XML',async()=>{
 const f=await host(),{editor,service}=f.make(),{Blob}=await import('node:buffer');
 const xml='<TEI><teiHeader><titleStmt><title>Imported letter</title></titleStmt></teiHeader><text><body><p><persName ref="#missing">Mary</persName><del> old</del></p></body></text></TEI>';
 await fs.writeFile(path.join(f.root,'letter.tei'),xml);const opened:string[]=[];
 await editor.interchange.importNew([{name:'letter.tei',blob:new Blob([xml]) as unknown as globalThis.Blob}],{current:()=>true,open:id=>opened.push(id)});
 expect(opened).toHaveLength(1);const id=opened[0];expect(service.isCandidate(id)).toBe(true);expect(service.isDirty(id)).toBe(true);
 expect(await fs.readFile(path.join(f.root,'letter.tei'),'utf8')).toBe(xml);await expect(fs.stat(path.join(f.root,'letter.ink'))).rejects.toThrow();
 expect(await service.save(id,{folder:'.',filename:'letter.ink'})).toMatchObject({phase:'saved',dirty:false});
 expect(await fs.readFile(path.join(f.root,'letter.tei'),'utf8')).toBe(xml);
 const other=f.make();expect(await other.service.open({folder:'.',filename:'letter.ink'})).toBe(id);
 const resource=captureNative(other.editor.repository.readState(),id);expect(Object.values(resource.contents).filter(c=>c.viewType==='page-block')).toHaveLength(1);
 const saved=nativeText(resource);expect(saved).toContain('tei/editorial');expect(saved).toContain('unresolved');expect(saved).not.toContain('opaque-property');
});

it('compact native session manually saves and reopens through compact and legacy readers without editing Cells',async()=>{
 const f=await host();await fs.copyFile('vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink',path.join(f.root,'ordinary.ink'));
 const one=f.make(true),location={folder:'.',filename:'ordinary.ink'},id=await one.service.open(location);
 const c=Object.values(one.editor.repository.readState().contents).find(c=>c.inlineKind==='standoff')!,p=Object.values(one.editor.repository.readState().placements).find(p=>p.contentKey===c.key)!;
 expect(c.compactInline).toBeDefined();expect(one.editor.projections.size).toBe(0);
 const snapshot=vi.spyOn(one.editor.repository,'snapshot');one.editor.commands.replaceInlineRange(p.key,0,0,'Compact saved ');expect(snapshot).not.toHaveBeenCalled();snapshot.mockRestore();
 expect(one.service.isDirty(id)).toBe(true);one.editor.repository.undo();one.editor.repository.redo();
 expect(await one.service.save(id)).toMatchObject({phase:'saved',dirty:false});
 const expected=nativeText(captureNative(one.editor.repository.readState(),id));
 for(const compact of [true,false]){const reopened=f.make(compact);expect(await reopened.service.open(location)).toBe(id);expect(nativeText(captureNative(reopened.editor.repository.readState(),id))).toBe(expected);expect(Object.values(reopened.editor.repository.readState().contents).some(c=>c.viewType==='text-cell')).toBe(!compact);}
 expect((await fs.readdir(f.root)).filter(n=>n.endsWith('.md'))).toEqual(['import.md']);
});
it('compact native recovery preserves newer edits and rejects a stale client baseline',async()=>{
 const f=await host();await fs.copyFile('vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink',path.join(f.root,'recover.ink'));
 const one=f.make(true),two=f.make(true),location={folder:'.',filename:'recover.ink'},id=await one.service.open(location);await two.service.open(location);
 const c=Object.values(one.editor.repository.readState().contents).find(c=>c.compactInline)!,p=Object.values(one.editor.repository.readState().placements).find(p=>p.contentKey===c.key)!;
 one.editor.commands.replaceInlineRange(p.key,0,0,'Captured ');
 const fetch=globalThis.fetch;let loseReply=true;
 vi.stubGlobal('fetch',async(input:any,options:any)=>{const response=await fetch(input,options);if(loseReply&&String(input).endsWith('/save')){loseReply=false;throw Error('Lost acknowledgement');}return response;});
 const failed=await one.service.save(id);expect(failed).toMatchObject({phase:'failed'});expect(failed?.generation).toBeTruthy();
 one.editor.commands.replaceInlineRange(p.key,0,0,'Newer ');
 expect(await one.service.recover(id,location)).toMatchObject({phase:'saved',dirty:true});expect(one.service.isDirty(id)).toBe(true);
 expect(await fs.readFile(path.join(f.root,'recover.ink'),'utf8')).toContain('Captured ');expect(await fs.readFile(path.join(f.root,'recover.ink'),'utf8')).not.toContain('Newer ');
 expect(await one.service.save(id)).toMatchObject({phase:'saved',dirty:false});
 expect(await two.service.save(id)).toMatchObject({phase:'failed',conflict:true});
 expect(Object.values(one.editor.repository.readState().contents).some(c=>c.viewType==='text-cell')).toBe(false);
 const reopened=f.make(false);await reopened.service.open(location);expect(nativeText(captureNative(reopened.editor.repository.readState(),id))).toBe(nativeText(captureNative(one.editor.repository.readState(),id)));
});
it('full Flint defaults to compact native open, typing, undo/redo, manual save, close and reopen',async()=>{
 const {render}=await import('solid-js/web'),{createComponent}=await import('solid-js'),{registerApplicationViews}=await import('../application/features'),{ReactiveTreeView}=await import('../rendering/reactive-tree-view'),{materializeLocalWorkspace}=await import('../reactive-editor/workspace-manifest'),{documentApplicationPorts}=await import('../application/document-application-ports');
 const f=await host();await fs.copyFile('vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink',path.join(f.root,'flint.ink'));
 const location={folder:'.',filename:'flint.ink'},original=await fs.readFile(path.join(f.root,'flint.ink'),'utf8');
 const open=async()=>{
  const editor=new ReactiveEditor(materializeLocalWorkspace({type:'workspace-block',children:[]}));registerApplicationViews(editor);const workspace=editor.createView();
  cleanup.push(()=>editor.dispose());editor.commandRegistry.execute('flint.open',{targetKey:workspace.state.rootKey,args:undefined});const element=document.body.appendChild(document.createElement('div'));const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection:workspace}),element);cleanup.push(()=>{dispose();element.remove();});editor.installGateway(document);
  const service=nativeDocumentSession(editor),id=await service.open(location);documentApplicationPorts(editor).ports()[0].application.openDocument(id);await Promise.resolve();await Promise.resolve();
  const view=[...editor.projections.values()].find(p=>p!==workspace&&p.state.nodes[p.state.rootKey]?.payload.id===id)!;
  const text=Object.values(view.state.nodes).find(n=>n.viewType==='standoff-editor-block'&&editor.mounts.get(n.key))!,mount=editor.mounts.get(text.key)!;
  return {editor,service,id,view,text,mount,element};
 };
 const a=await open();const before=a.mount.captureText!();a.mount.focus();a.mount.restoreInlineSelection!({anchor:0,head:0});
 a.mount.focusElement.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'Saved compact '}));await Promise.resolve();await Promise.resolve();
 expect(a.mount.captureText!()).toBe('Saved compact '+before);expect(a.service.isDirty(a.id)).toBe(true);expect(await fs.readFile(path.join(f.root,'flint.ink'),'utf8')).toBe(original);
 a.editor.repository.undo();await Promise.resolve();await Promise.resolve();expect(a.mount.captureText!()).toBe(before);a.editor.repository.redo();await Promise.resolve();await Promise.resolve();expect(a.mount.captureText!()).toBe('Saved compact '+before);
 expect(await a.service.save(a.id)).toMatchObject({phase:'saved',dirty:false});
 expect(Object.values(captureNative(a.editor.repository.readState(),a.id).contents).some(c=>c.viewType==='text-cell')).toBe(false);
 const close=a.element.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!.closest('.flint-document-tab')!.querySelector<HTMLButtonElement>('.flint-document-tab__close')!;close.click();await Promise.resolve();await Promise.resolve();expect(a.editor.mounts.get(a.text.key)).toBeUndefined();
 const b=await open();expect(b.mount.captureText!()).toBe('Saved compact '+before);expect(b.editor.repository.readState().contents[b.text.contentKey].compactInline).toBeDefined();expect(b.service.isDirty(b.id)).toBe(false);
 expect((await fs.readdir(f.root)).filter(n=>n.endsWith('.md'))).toEqual(['import.md']);
},20000);

it('saves hot range offsets to the opened file and keeps clean lease transitions out of history',async()=>{
 const f=await host(), file=path.join(f.root,'resident.ink');
 await fs.copyFile('vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink',file);
 const {editor,service}=f.make(true), location={folder:'.',filename:'resident.ink'};
 const id=await service.open(location),repo=editor.repository;
 const c=Object.values(repo.readState().contents).find(c=>c.compactInline&&Array.isArray(c.payload.standoffProperties)&&c.payload.standoffProperties.length>0)!;
 const [pk]=repo.ownedPlacementKeys(c.key),before=nativeText(captureNative(repo.readState(),id));
 const changes=vi.fn(),stop=repo.subscribeChanges(changes);
 const a=repo.acquireResidentCells(c.key),b=repo.acquireResidentCells(c.key);
 expect(changes).not.toHaveBeenCalled();expect(service.isDirty(id)).toBe(false);
 editor.commands.replaceInlineRange(pk,0,0,'🍏');
 const ranges=repo.residentAnnotations(c.key);expect(ranges).toBeDefined();
 expect(service.isDirty(id)).toBe(true);
 expect(await service.save(id)).toMatchObject({phase:'saved',dirty:false});
 expect(repo.residentAnnotations(c.key)).toBe(ranges);
 const revision=repo.state.revision;changes.mockClear();
 a();b();expect(repo.residentAnnotations(c.key)).toBeUndefined();
 expect(changes).not.toHaveBeenCalled();expect(repo.state.revision).toBe(revision);
 expect(service.isDirty(id)).toBe(false);
 const fresh=f.make(true);await fresh.service.open(location);
 expect(nativeText(captureNative(fresh.editor.repository.readState(),id))).toBe(nativeText(captureNative(repo.readState(),id)));
 repo.undo();expect(nativeText(captureNative(repo.readState(),id))).toBe(before);
 stop();
});
