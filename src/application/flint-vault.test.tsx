// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import express from 'express';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createNativeDocumentStoreRouter } from '../../server/native-document-store.mjs';
import { ReactiveEditor } from '../reactive-editor/editor';
import { materializeLocalWorkspace } from '../reactive-editor/workspace-manifest';
import { registerApplicationViews } from './features';
import { ReactiveTreeView } from '../rendering/reactive-tree-view';
import { nativeDocumentSession } from '../persistence/native-session';
import { fixtureText } from '../qualification/native-knowledge/fixture';
import { captureNative, nativeText } from '../persistence/native-resource';
import { createFormattedDocument, documentFormats, readDocumentFormat } from '../features/document-formats/model';
import { RECENT_DOCUMENTS_KEY } from './recent-documents';
execFileSync(process.execPath,['scripts/build-relocation-helper.mjs']);
const disposers:Array<()=>any>=[], actualFetch=globalThis.fetch;
afterEach(async()=>{for(const f of disposers.splice(0).reverse())await f();document.body.replaceChildren();localStorage.clear();vi.unstubAllGlobals();});
const wait=(f:()=>void)=>vi.waitFor(f,{timeout:6000,interval:20});
const button=(host:ParentNode,label:string)=>{if(label==='Files'||label==='Close tab'){const menu=host.querySelector<HTMLButtonElement>('[aria-label="Flint application menu"]')!;if(menu.getAttribute('aria-expanded')!=='true')menu.click();}const b=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>(label==='Save Document'&&b.getAttribute('aria-label')===label)||b.textContent===(label==='Files'?'Open / Save native Ink…':label));expect(b,`button ${label}`).toBeTruthy();return b!;};
const click=(host:ParentNode,label:string)=>{const b=button(host,label);expect(b.disabled,`${label} enabled`).toBe(false);b.click();};
const field=(host:ParentNode,label:string,value:string)=>{const input=host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;expect(input,label).toBeTruthy();input.value=value;input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));};
async function fixture(options:{readOnly?:boolean;fault?:(stage:string)=>Promise<void>;defaultVault?:string;nativeMiddleware?:express.RequestHandler}={}) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'flint-c1b-'));disposers.push(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'vault/nested'),{recursive:true});await fs.writeFile(path.join(root,'vault/input.md'),'# Imported\n\n**Bold** text');
 const app=express();if(options.nativeMiddleware)app.use('/api/native',options.nativeMiddleware);app.use('/api/native',createNativeDocumentStoreRouter({root,...options}));const server:any=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});disposers.push(()=>new Promise(r=>server.close(r)));
 vi.stubGlobal('fetch',(input:any,init:any)=>actualFetch(typeof input==='string'&&input.startsWith('/')?`http://127.0.0.1:${server.address().port}${input}`:input,init));
 function make(formatsEnabled=true,recentVaultId?:string) {
  const editor=new ReactiveEditor(materializeLocalWorkspace({id:crypto.randomUUID(),type:'workspace-block',children:[]}),{features:{compactEditorChrome:false,documentFormats:formatsEnabled}});
  if(recentVaultId)editor.setAssetContext(()=>({cavernId:recentVaultId}));
  registerApplicationViews(editor);const projection=editor.createView('workspace');disposers.push(()=>editor.dispose());
  const launch=()=>editor.commandRegistry.execute('flint.open',{targetKey:projection.state.rootKey,args:undefined});launch();
  const host=document.body.appendChild(document.createElement('div'));disposers.push(render(()=><ReactiveTreeView editor={editor} projection={projection}/>,host));
  const windows=()=>[...host.querySelectorAll<HTMLElement>('.flint-application')];
  return {editor,projection,host,windows,launch,service:nativeDocumentSession(editor)};
 }
 const f=make();return {...f,root,make};
}
async function open(host:ParentNode,root='vault') {field(host,'Vault directory',root);click(host,'Open Cavern');await wait(()=>expect(host.querySelector('[aria-label="Selected folder"]')?.textContent).toBe(root));await wait(()=>expect(button(host,'Open Cavern').disabled).toBe(false));}
async function create(host:ParentNode,name='note.mutable.json',title='A title') {field(host,'New Document filename',name);field(host,'New Document title',title);click(host,'New Document');await wait(()=>expect(host.textContent).toContain('Saved Mutable JSON Document'));await wait(()=>expect(host.querySelector(`[aria-label="Open vault/${name}"]`)).toBeTruthy());await wait(()=>expect(button(host,'New Document').disabled).toBe(false));}
it('reopens a recognized Document from persisted recent history after a restart without scanning or saving',async()=>{
 const f=await fixture(),id='recent-compatible',title='Recent compatible';
 const source=JSON.stringify({id,type:'document-block',metadata:{documentId:id,title},children:[{id:'recent-text',type:'standoff-editor-block',text:'Saved source text'}]});
 const location={folder:'vault/nested',filename:'recent.json'};
 await fs.writeFile(path.join(f.root,'vault/nested/recent.json'),source);
 localStorage.setItem(RECENT_DOCUMENTS_KEY+'restart-vault',JSON.stringify([{id,title,location}]));
 const restarted=f.make(true,'restart-vault'),a=restarted.windows()[0];await open(a);
 const scan=vi.spyOn(restarted.service,'discoverVault'),browse=vi.spyOn(restarted.service,'browseVault'),save=vi.spyOn(restarted.service,'save');
 click(a,'Recent');a.querySelector<HTMLButtonElement>('[aria-label="Reopen Recent compatible"]')!.click();
 await wait(()=>expect(idOf(a)).toBe(id));
 expect(a.querySelector('.reactive-standoff-flow')?.textContent).toBe('Saved source text');
 expect(restarted.service.compatibleSource(id)?.location).toEqual(location);
 expect(scan).not.toHaveBeenCalled();expect(browse).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
 expect(await fs.readFile(path.join(f.root,'vault/nested/recent.json'),'utf8')).toBe(source);
},15000);
it.each(['replaced','missing','outside Vault'])('does not admit a %s file from a stored recent path',async situation=>{
 const f=await fixture(),id='recent-original',title='Stored recent';
 const source=JSON.stringify({id:'replacement',type:'document-block',metadata:{documentId:'replacement',title:'Replacement'},children:[]});
 await fs.mkdir(path.join(f.root,'elsewhere'));
 const location={folder:situation==='outside Vault'?'elsewhere':'vault',filename:'recent.json'};
 if(situation!=='missing')await fs.writeFile(path.join(f.root,location.folder,location.filename),source);
 localStorage.setItem(RECENT_DOCUMENTS_KEY+'restart-vault',JSON.stringify([{id,title,location}]));
 const restarted=f.make(true,'restart-vault'),a=restarted.windows()[0];await open(a);
 const revision=restarted.editor.repository.state.revision,active=idOf(a);
 click(a,'Recent');a.querySelector<HTMLButtonElement>('[aria-label="Reopen Stored recent"]')!.click();
 await wait(()=>expect(a.querySelector('.flint-recent-documents [role=alert]')?.textContent).toMatch(situation==='replaced'?/different Document/:/directory|no longer in this vault/));
 expect(idOf(a)).toBe(active);expect(restarted.editor.repository.state.revision).toBe(revision);
 expect(restarted.service.compatibleSource('replacement')).toBeUndefined();
},15000);
const idOf=(host:ParentNode)=>host.querySelector('[data-flint-property="id"]')!.textContent!;
it('creates every Document format from Flint and preserves its template through native Save and reopen',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);
 expect([...a.querySelectorAll<HTMLOptionElement>('[aria-label="New Document format"] option')].map(o=>o.value)).toEqual(documentFormats.map(d=>d.id));
 const saved:{id:string;filename:string;format:typeof documentFormats[number]}[]=[];
 for(const format of documentFormats){
  field(a,'New Document format',format.id);const filename=`${format.id}.ink`;await create(a,filename,`My ${format.label}`);
  const id=idOf(a),doc=Object.values(f.editor.repository.state.contents).find(c=>c.viewType==='document-block'&&(c.payload.metadata as any)?.documentId===id)!;
  expect(readDocumentFormat(doc.payload.metadata)).toEqual({version:1,format:format.id,template:format.template,theme:format.theme});
  expect((doc.payload.metadata as any).title).toBe(`My ${format.label}`);
  expect(f.service.location(id)).toEqual({folder:'vault',filename});
  if(format.id!=='page')expect(a.querySelector(`.document-format--${format.id}`)).not.toBeNull();
  saved.push({id,filename,format});
 }
 const reopened=f.make();
 for(const {id,filename,format} of saved){
  expect(await reopened.service.open({folder:'vault',filename})).toBe(id);
  const state=reopened.editor.repository.state,doc=Object.values(state.contents).find(c=>c.viewType==='document-block'&&(c.payload.metadata as any)?.documentId===id)!;
  expect(readDocumentFormat(doc.payload.metadata)?.format).toBe(format.id);
  expect(doc.children.map(k=>state.contents[state.placements[k].contentKey].viewType)).toEqual(createFormattedDocument(format.id).document.children!.map(c=>c.type));
 }
},60000);
it('keeps Flint ordinary Document creation when formats are disabled',async()=>{
 const f=await fixture(),disabled=f.make(false),a=disabled.windows()[0];await open(a);
 expect(a.querySelector('[aria-label="New Document format"]')).toBeNull();await create(a);
 expect(disabled.service.location(idOf(a))?.filename).toBe('note.mutable.json');
},15000);
it.each(['empty','occupied','rejected first destination'])('default Notes saves directly into the active Vault (%s)',async situation=>{
 const f=await fixture({defaultVault:'vault'}),a=f.windows()[0];
 await wait(()=>expect(a.querySelector('[aria-label="Selected folder"]')?.textContent).toBe('vault'));
 const tab=[...a.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(b=>b.textContent==='Notes')!;tab.click();
 const id=idOf(a),original=fixtureText(99,1);
 if(situation!=='empty')await fs.writeFile(path.join(f.root,'vault/Notes.ink'),original);
 if(situation==='rejected first destination')expect(await f.service.save(id,{folder:'vault',filename:'Notes.ink'})).toMatchObject({phase:'failed'});
 const view=[...f.editor.projections.values()].find(v=>v!==f.projection&&v.state.nodes[v.state.rootKey]?.payload.id===id)!;
 const text=Object.values(view.state.nodes).find(n=>n.viewType==='standoff-editor-block')!;
 const cells=[...text.inlineContent];f.editor.commands.replaceInlineRange(text.key,0,0,'First manual Save ');
 expect(f.service.isDirty(id)).toBe(true);
 const filename=situation==='empty'?'Notes.ink':'Notes (2).ink';
 expect(await fs.stat(path.join(f.root,'vault',filename)).catch(()=>null)).toBeNull();
 tab.dispatchEvent(new KeyboardEvent('keydown',{key:'s',metaKey:true,bubbles:true,cancelable:true}));
 if(situation!=='empty'){await wait(()=>expect(document.body.textContent).toContain('File already exists'));expect(await fs.readFile(path.join(f.root,'vault/Notes.ink'),'utf8')).toBe(original);click(document.body,'Save with a different name');}
 await wait(()=>expect(f.service.status(id)).toBe('Saved Mutable JSON Document'));
 expect(a.querySelector('[aria-label="Storage and recovery"]')).toBeNull();expect(f.service.isDirty(id)).toBe(false);
 expect(f.service.location(id)).toEqual({folder:'vault',filename});expect(idOf(a)).toBe(id);
 const saved=JSON.parse(await fs.readFile(path.join(f.root,'vault',filename),'utf8'));expect(saved.resourceId).toBe(id);
 expect(text.inlineContent.slice(-cells.length)).toEqual(cells);
 if(situation!=='empty')expect(await fs.readFile(path.join(f.root,'vault/Notes.ink'),'utf8')).toBe(original);
 await wait(()=>expect(button(a,'Save Document').disabled).toBe(false));
 f.editor.commands.replaceInlineRange(text.key,0,0,'Next manual Save ');click(a,'Save Document');
 await wait(()=>expect(f.service.isDirty(id)).toBe(false));expect(f.service.location(id)?.filename).toBe(filename);
 expect(await fs.readFile(path.join(f.root,'vault',filename),'utf8')).toContain('Next manual Save');
 expect(await fs.stat(path.join(f.root,'vault/Notes (3).ink')).catch(()=>null)).toBeNull();
},20000);

it.each(['overwrite','cancel','stale'])('reviews a first-save filename collision (%s)',async choice=>{
 const f=await fixture({defaultVault:'vault'}),a=f.windows()[0];
 await wait(()=>expect(a.querySelector('[aria-label="Selected folder"]')?.textContent).toBe('vault'));
 const id=idOf(a),original=fixtureText(99,1),file=path.join(f.root,'vault/Notes.ink');await fs.writeFile(file,original);
 click(a,'Save Document');await wait(()=>expect(document.body.textContent).toContain('File already exists'));
 expect(f.service.location(id)).toBeUndefined();expect(await fs.readFile(file,'utf8')).toBe(original);
 if(choice==='cancel'){click(document.body,'Cancel');await wait(()=>expect(button(a,'Save Document').disabled).toBe(false));expect(f.service.isDirty(id)).toBe(true);expect(f.service.location(id)).toBeUndefined();expect(await fs.readFile(file,'utf8')).toBe(original);return;}
 if(choice==='stale')await fs.writeFile(file,original+'\n');
 click(document.body,'Overwrite');
 if(choice==='stale'){await wait(()=>expect([...a.querySelectorAll('[role=alert]')].some(e=>e.textContent?.includes('Destination changed'))).toBe(true));expect(f.service.isDirty(id)).toBe(true);expect(await fs.readFile(file,'utf8')).toBe(original+'\n');return;}
 await wait(()=>expect(f.service.isDirty(id)).toBe(false));expect(JSON.parse(await fs.readFile(file,'utf8')).resourceId).toBe(id);expect(f.service.location(id)).toEqual({folder:'vault',filename:'Notes.ink'});
 await wait(()=>expect(button(a,'Save Document').disabled).toBe(false));click(a,'Save Document');await wait(()=>expect(button(a,'Save Document').disabled).toBe(false));expect(document.body.textContent).not.toContain('File already exists');
},15000);

it('cancels automatic first-save destination selection when the active Vault changes',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);const id=idOf(a);
 await fs.mkdir(path.join(f.root,'other'));
 let resume!:(names:string[])=>void;vi.spyOn(f.service,'list').mockImplementationOnce(()=>new Promise(r=>resume=r));
 click(a,'Save Document');await wait(()=>expect(resume).toBeTypeOf('function'));
 await open(a,'other');resume([]);
 await wait(()=>expect(a.querySelector('[role=alert]')?.textContent).toContain('active Vault changed'));
 expect(f.service.location(id)).toBeUndefined();expect(f.service.isDirty(id)).toBe(true);
 expect(await fs.stat(path.join(f.root,'vault/Notes.ink')).catch(()=>null)).toBeNull();
 expect(await fs.stat(path.join(f.root,'other/Notes.ink')).catch(()=>null)).toBeNull();
},15000);

it('marks edited tabs dirty and Command-S saves only the active document to its original filename',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);
 await create(a,'first.ink','First');const first=idOf(a);
 await create(a,'second.ink','Second');const second=idOf(a);
 const firstBytes=await fs.readFile(path.join(f.root,'vault/first.ink'),'utf8');
 const secondBytes=await fs.readFile(path.join(f.root,'vault/second.ink'),'utf8');
 const textFor=(id:string)=>{const view=[...f.editor.projections.values()].find(v=>v!==f.projection&&v.state.nodes[v.state.rootKey]?.payload.id===id)!;return Object.values(view.state.nodes).find(n=>n.viewType==='standoff-editor-block')!;};
 const selected=()=>a.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!;
 expect(selected().querySelector('[aria-label="Unsaved changes"]')).toBeNull();
 const text=textFor(second);f.editor.commands.replaceInlineRange(text.key,0,0,'Manual changes');
 expect(selected().querySelector('[aria-label="Unsaved changes"]')).toBeTruthy();
 await Promise.resolve();expect(await fs.readFile(path.join(f.root,'vault/second.ink'),'utf8')).toBe(secondBytes);
 // Selecting and saving the other tab must not write this dirty document.
 a.querySelector<HTMLButtonElement>('[aria-label="Open vault/first.ink"]')!.click();await wait(()=>expect(idOf(a)).toBe(first));
 expect(selected().querySelector('[aria-label="Unsaved changes"]')).toBeNull();
 const key=new KeyboardEvent('keydown',{key:'s',metaKey:true,bubbles:true,cancelable:true});selected().dispatchEvent(key);
 expect(key.defaultPrevented).toBe(true);await wait(()=>expect(button(a,'Save Document').disabled).toBe(false));
 expect(await fs.readFile(path.join(f.root,'vault/second.ink'),'utf8')).toBe(secondBytes);
 expect(await fs.readFile(path.join(f.root,'vault/first.ink'),'utf8')).toBe(firstBytes);
 a.querySelector<HTMLButtonElement>('[aria-label="Open vault/second.ink"]')!.click();await wait(()=>expect(idOf(a)).toBe(second));
 expect(selected().querySelector('[aria-label="Unsaved changes"]')).toBeTruthy();
 const uninstall=f.editor.installGateway(document);disposers.push(uninstall);
 const flow=f.editor.mounts.get(textFor(second).key)!.focusElement;
 flow.dispatchEvent(new KeyboardEvent('keydown',{key:'s',metaKey:true,bubbles:true,cancelable:true}));
 await wait(()=>expect(selected().querySelector('[aria-label="Unsaved changes"]')).toBeNull());
 expect(await fs.readFile(path.join(f.root,'vault/second.ink'),'utf8')).toContain('Manual changes');
 expect(await fs.stat(path.join(f.root,'vault/second.ink.md')).catch(()=>null)).toBeNull();
});
it('uses the real tree in two Windows, shared native properties and independent occurrences; title never renames files',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);f.launch();const b=f.windows().find(w=>w!==a)!;await open(b);
 await create(a);const id=idOf(a);expect(b.querySelector('[aria-label="Open vault/note.mutable.json"]')).toBeTruthy();
 b.querySelector<HTMLButtonElement>('[aria-label="Open vault/note.mutable.json"]')!.click();await wait(()=>expect(idOf(b)).toBe(id));
 const views=()=>[...f.editor.projections.values()].filter(p=>p!==f.projection&&p.state.nodes[p.state.rootKey]?.payload.id===id);expect(views()).toHaveLength(2);
 const keys=views().map(v=>v.state.rootKey);
 const row=a.querySelector('[aria-label="Open vault/note.mutable.json"]'), snapshot=vi.spyOn(f.editor.repository,'snapshot');
 const text=Object.values(views()[0].state.nodes).find(n=>n.viewType==='standoff-editor-block')!;
 f.editor.commands.replaceInlineRange(text.key,0,0,'Ordinary typing');expect(snapshot).not.toHaveBeenCalled();snapshot.mockRestore();expect(a.querySelector('[aria-label="Open vault/note.mutable.json"]')).toBe(row);
 field(a,'Document title','Authored title');field(a,'Document tags','poetry\nnight\npoetry');click(a,'Apply properties');
 expect((b.querySelector('[aria-label="Document title"]') as HTMLInputElement).value).toBe('Authored title');expect(nativeText(captureNative(f.editor.repository.snapshot(),id))).toContain('night');
 f.editor.repository.undo();expect((a.querySelector('[aria-label="Document title"]') as HTMLInputElement).value).toBe('A title');f.editor.repository.redo();
 click(a,'Save Document');await wait(()=>expect(a.textContent).toContain('Saved Mutable JSON Document'));
 expect(await fs.readdir(path.join(f.root,'vault'))).toContain('note.mutable.json');expect(await fs.readFile(path.join(f.root,'vault/note.mutable.json'),'utf8')).toContain('Authored title');
 await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));field(a,'Tag filter','night');expect(a.querySelector('[aria-label="Open vault/note.mutable.json"]')).toBeTruthy();expect(views().map(v=>v.state.rootKey)).toEqual(keys);
 expect(Object.values(f.editor.repository.state.contents).some(c=>(c.payload.metadata as any)?.members)).toBe(false);
 expect(()=>f.editor.persistence.captureWorkspace()).toThrow(/native/i);
 click(a,'Close tab');expect(views()).toHaveLength(1);expect(idOf(b)).toBe(id);
},15000);
it('moves pairs and directories without changing authored data or generations, and Save uses the new location',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);await create(a);const id=idOf(a),before=await fs.readFile(path.join(f.root,'vault/note.mutable.json'),'utf8');
 a.querySelector<HTMLButtonElement>('[aria-label="Open vault/note.mutable.json"]')!.click();await wait(()=>expect((a.querySelector('[aria-label="Move destination name"]') as HTMLInputElement).value).toBe('note.mutable.json'));
 await wait(()=>expect(button(a,'Apply rename / move').disabled).toBe(false));field(a,'Move destination folder','vault/nested');field(a,'Move destination name','renamed.mutable.json');click(a,'Apply rename / move');await wait(()=>expect(f.service.location(id)).toEqual({folder:'vault/nested',filename:'renamed.mutable.json'}));
 expect(await fs.readFile(path.join(f.root,'vault/nested/renamed.mutable.json'),'utf8')).toBe(before);expect((a.querySelector('[aria-label="Document title"]') as HTMLInputElement).value).toBe('A title');
 await wait(()=>expect(button(a,'Apply rename / move').disabled).toBe(false));click(a,'nested');field(a,'Move destination folder','vault');field(a,'Move destination name','archive');click(a,'Apply rename / move');await wait(()=>expect(f.service.location(id)?.folder).toBe('vault/archive'));
 await wait(()=>expect(button(a,'Apply rename / move').disabled).toBe(false));field(a,'Document title','New title');click(a,'Apply properties');click(a,'Save Document');await wait(()=>expect(a.textContent).toContain('Saved Mutable JSON Document'));expect(await fs.readFile(path.join(f.root,'vault/archive/renamed.mutable.json'),'utf8')).toContain('New title');
 const fresh=f.make(),b=fresh.windows()[0];await open(b);b.querySelector<HTMLButtonElement>('[aria-label="Open vault/archive/renamed.mutable.json"]')!.click();await wait(()=>expect(idOf(b)).toBe(id));expect((b.querySelector('[aria-label="Document title"]') as HTMLInputElement).value).toBe('New title');
},15000);
it('keeps typing and resource-owned relocation alive after both initiating occurrences close',async()=>{
 let enter!:()=>void,resume!:()=>void;const entered=new Promise<void>(r=>enter=r),held=new Promise<void>(r=>resume=r);
 const f=await fixture({fault:async stage=>{if(stage==='relocation-after-0'){enter();await held;}}}),a=f.windows()[0];await open(a);await create(a);const id=idOf(a),before=await fs.readFile(path.join(f.root,'vault/note.mutable.json'),'utf8');
 a.querySelector<HTMLButtonElement>('[aria-label="Open vault/note.mutable.json"]')!.click();field(a,'Move destination name','moved.mutable.json');await wait(()=>expect(button(a,'Apply rename / move').disabled).toBe(false));click(a,'Apply rename / move');await entered;
 const view=[...f.editor.projections.values()].find(p=>p!==f.projection&&p.state.nodes[p.state.rootKey]?.payload.id===id)!;const text=Object.values(view.state.nodes).find(n=>n.viewType==='standoff-editor-block')!;f.editor.commands.replaceInlineRange(text.key,0,0,'During move');
 for(const n of Object.values(f.projection.state.nodes).filter(n=>n.viewType==='window-block'))f.editor.commands.remove(n.key);resume();await wait(()=>expect(f.service.location(id)?.filename).toBe('moved.mutable.json'));
 expect(await fs.readFile(path.join(f.root,'vault/moved.mutable.json'),'utf8')).toBe(before);expect(f.service.status(id)).toContain('unsaved');await f.service.save(id);expect(await fs.readFile(path.join(f.root,'vault/moved.mutable.json'),'utf8')).toContain('During move');
},15000);
it('imports explicitly, preserves source, and exposes collisions as unsaved candidates rather than files',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);field(a,'Markdown source','vault/input.md');field(a,'New Document filename','input.mutable.json');click(a,'Import into new native Document');await wait(()=>expect(a.textContent).toContain('preserve the imported Markdown source'));
 field(a,'New Document filename','imported.mutable.json');click(a,'Import into new native Document');await wait(()=>expect(a.querySelector('[aria-label="Open vault/imported.mutable.json"]')).toBeTruthy());const id=idOf(a);expect(await fs.readFile(path.join(f.root,'vault/input.md'),'utf8')).toContain('**Bold**');
 await wait(()=>expect(button(a,'Import into new native Document').disabled).toBe(false));click(a,'Import into new native Document');await wait(()=>expect(idOf(a)).not.toBe(id));await wait(()=>expect(a.textContent).toContain('Save blocked'));expect(a.textContent).toContain('Unsaved native candidate');expect(a.querySelectorAll('[aria-label="Open vault/imported.mutable.json"]')).toHaveLength(1);
},15000);
it('exposes read-only storage, preserves ordinary editing, and cannot bypass it through Files',async()=>{
 const f=await fixture({readOnly:true});await fs.copyFile('artifacts/flint-b1.2/rich.mutable.json',path.join(f.root,'vault/rich.mutable.json'));const a=f.windows()[0];await open(a);expect(button(a,'New Document').disabled).toBe(true);expect(button(a,'Create directory').disabled).toBe(true);expect(button(a,'Save Document').disabled).toBe(true);
 a.querySelector<HTMLButtonElement>('[aria-label="Open vault/rich.mutable.json"]')!.click();await wait(()=>expect(idOf(a)).toBe('resource'));field(a,'Document title','Local only');click(a,'Apply properties');expect(nativeText(captureNative(f.editor.repository.snapshot(),'resource'))).toContain('Local only');expect(await fs.readFile(path.join(f.root,'vault/rich.mutable.json'),'utf8')).not.toContain('Local only');
},15000);
it('refresh discovers external changes without rebinding or replacing loaded dirty content; ambiguous identities stay unavailable',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);await create(a);const id=idOf(a);field(a,'Document title','Unsaved title');click(a,'Apply properties');
 await fs.mkdir(path.join(f.root,'vault/external'));await fs.copyFile(path.join(f.root,'vault/note.mutable.json'),path.join(f.root,'vault/external/copied.mutable.json'));click(a,'Refresh');await wait(()=>expect(a.textContent).toContain('Duplicate canonical identity'));
 expect(a.querySelector<HTMLButtonElement>('[aria-label="Open vault/external/copied.mutable.json"]')!.disabled).toBe(true);expect(f.service.location(id)).toEqual({folder:'vault',filename:'note.mutable.json'});expect((a.querySelector('[aria-label="Document title"]') as HTMLInputElement).value).toBe('Unsaved title');
},15000);
it('preserves unknown authored payloads and incompatible tags, and reports missing owned-resource dependencies',async()=>{
 const f=await fixture();await fs.copyFile('artifacts/flint-b1.2/a.mutable.json',path.join(f.root,'vault/a.mutable.json'));const a=f.windows()[0];await open(a);a.querySelector<HTMLButtonElement>('[aria-label="Open vault/a.mutable.json"]')!.click();await wait(()=>expect(idOf(a)).toBe('resource-a'));
 click(a,'Save Document');await wait(()=>expect(a.textContent).toContain('Save blocked'));expect(await fs.stat(path.join(f.root,'vault/a.md')).catch(()=>null)).toBeNull();
 const doc=Object.values(f.editor.repository.state.contents).find(c=>(c.payload.metadata as any)?.documentId==='resource-a')!;const placement=Object.values(f.editor.repository.state.placements).find(p=>p.contentKey===doc.key)!;
 f.editor.commands.setPayloadField(placement.key,'metadata',{...doc.payload.metadata as any,tags:{future:true},futureFeature:{data:[1,2]}});expect(button(a,'Apply properties').disabled).toBe(true);expect(nativeText(captureNative(f.editor.repository.snapshot(),'resource-a'))).toContain('futureFeature');expect(a.textContent).toContain('preserved');
},15000);
it('retains the selected vault across minimize/restore, with no serialized membership or root path',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);click(a,'Create directory');await wait(()=>expect(a.textContent).toContain('New folder'));
 f.host.querySelector<HTMLButtonElement>('[aria-label="Minimize window"]')!.click();await wait(()=>expect(f.windows()).toHaveLength(0));f.host.querySelector<HTMLButtonElement>('[data-window-icon]')!.click();await wait(()=>expect(f.windows()[0]?.querySelector('[aria-label="Selected folder"]')?.textContent).toBe('vault'));
 const app=Object.values(f.editor.repository.state.contents).find(c=>c.viewType==='flint-application-block')!;expect(app.payload.metadata).toEqual({});
},15000);
it('keeps a lost completion recoverable in the UI even when the durable journal already says relocated',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);await create(a);const id=idOf(a),fetchOriginal=globalThis.fetch;let lose=true;
 vi.stubGlobal('fetch',async(input:any,init:any)=>{const reply=await fetchOriginal(input,init);if(lose&&String(input).endsWith('/vault/relocate')){lose=false;await reply.text();throw Error('lost completion');}return reply;});
 a.querySelector<HTMLButtonElement>('[aria-label="Open vault/note.mutable.json"]')!.click();await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));field(a,'Move destination name','recovered.mutable.json');click(a,'Apply rename / move');await wait(()=>expect(a.textContent).toContain('lost completion'));await wait(()=>expect(button(a,'Recover relocation').disabled).toBe(false));
 expect(f.service.location(id)?.filename).toBe('note.mutable.json');click(a,'Recover relocation');await wait(()=>expect(f.service.location(id)?.filename).toBe('recovered.mutable.json'));expect(await fs.stat(path.join(f.root,'vault/recovered.mutable.json'))).toBeTruthy();
},15000);
it('preserves nested unknown native properties through property editing, Save and fresh Open',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);await create(a);const id=idOf(a);
 const doc=Object.values(f.editor.repository.readState().contents).find(c=>(c.payload.metadata as any)?.documentId===id)!,p=Object.values(f.editor.repository.state.placements).find(p=>p.contentKey===doc.key)!;
 f.editor.commands.setPayloadField(p.key,'metadata',{...doc.payload.metadata as any,futureFeature:{values:['opaque',{x:17}]}});
 field(a,'Document title','Preserved');field(a,'Document tags','tag');click(a,'Apply properties');click(a,'Save Document');await wait(()=>expect(a.textContent).toContain('Saved Mutable JSON Document'));await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));
 const fresh=f.make(),b=fresh.windows()[0];await open(b);b.querySelector<HTMLButtonElement>('[aria-label="Open vault/note.mutable.json"]')!.click();await wait(()=>expect(idOf(b)).toBe(id));
 const reopened=Object.values(fresh.editor.repository.readState().contents).find(c=>(c.payload.metadata as any)?.documentId===id)!;expect(reopened.payload.metadata).toMatchObject({title:'Preserved',tags:['tag'],futureFeature:{values:['opaque',{x:17}]},documentFormat:{format:'page'}});
},15000);
it('allows an unsaved collision candidate to choose a fresh first-save destination without relocating the existing resource',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);await create(a);const original=await fs.readFile(path.join(f.root,'vault/note.mutable.json'),'utf8');
 click(a,'New Document');await wait(()=>expect(a.textContent).toContain('Save blocked'));await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));const candidate=idOf(a);expect(f.service.isCandidate(candidate)).toBe(true);
 click(a,'Files');field(a,'Native filename','retry.mutable.json');click(a,'Save to selected destination');await wait(()=>expect(a.textContent).toContain('Saved Mutable JSON Document'));expect(f.service.location(candidate)?.filename).toBe('retry.mutable.json');expect(f.service.isCandidate(candidate)).toBe(false);expect(await fs.readFile(path.join(f.root,'vault/note.mutable.json'),'utf8')).toBe(original);
},15000);
it('relocates a Document containing a native external reference without rewriting its target or saved generation',async()=>{
 const f=await fixture();await fs.copyFile('artifacts/flint-b1.2/c.mutable.json',path.join(f.root,'vault/c.mutable.json'));const a=f.windows()[0];await open(a);a.querySelector<HTMLButtonElement>('[aria-label="Open vault/c.mutable.json"]')!.click();await wait(()=>expect(idOf(a)).toBe('resource-c'));await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));click(a,'Save Document');await wait(()=>expect(a.textContent).toContain('Saved Mutable JSON Document'));await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));
 const before=await fs.readFile(path.join(f.root,'vault/c.mutable.json'),'utf8');expect(before).toContain('resource-b');field(a,'Move destination name','reference.mutable.json');click(a,'Apply rename / move');await wait(()=>expect(f.service.location('resource-c')?.filename).toBe('reference.mutable.json'));expect(await fs.readFile(path.join(f.root,'vault/reference.mutable.json'),'utf8')).toBe(before);expect(nativeText(captureNative(f.editor.repository.snapshot(),'resource-c'))).toBe(before);
},15000);
it('reports a vanished location without discarding the live Document or adopting an external same-ID move',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);await create(a);const id=idOf(a);field(a,'Document title','Still here');click(a,'Apply properties');
 await fs.rename(path.join(f.root,'vault/note.mutable.json'),path.join(f.root,'externally-moved.mutable.json'));click(a,'Refresh');await wait(()=>expect(a.querySelector('.flint-properties')?.textContent).toContain('Location missing or moved'));
 expect(f.service.location(id)?.filename).toBe('note.mutable.json');expect((a.querySelector('[aria-label="Document title"]') as HTMLInputElement).value).toBe('Still here');expect(a.querySelector('[contenteditable="true"]')).toBeTruthy();expect(nativeText(captureNative(f.editor.repository.snapshot(),id))).toContain('Still here');
 await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));await fs.rename(path.join(f.root,'externally-moved.mutable.json'),path.join(f.root,'vault/externally-moved.mutable.json'));click(a,'Refresh');await wait(()=>expect(a.querySelector('.flint-properties')?.textContent).toContain('Location unverified'));expect(f.service.location(id)?.filename).toBe('note.mutable.json');
},15000);

it('derives vault rows once per publication and retains unchanged DOM rows across binding and discovery updates',async()=>{
 const f=await fixture(),a=f.windows()[0];
 for(let i=0;i<40;i++)await fs.writeFile(path.join(f.root,'vault',i+'.mutable.json'),fixtureText(i,40));
 const locations=vi.spyOn(f.service,'location');await open(a);
 // The old per-control derivation performed thousands of 40-row passes here.
 expect(locations.mock.calls.length).toBeLessThan(40*20);
 const rows=[...a.querySelectorAll<HTMLButtonElement>('.flint-tree-document > button')].filter(b=>b.getAttribute('aria-label')?.endsWith('.mutable.json'));expect(rows).toHaveLength(40);
 expect(a.querySelector('[aria-label="Open vault/input.md"]')).toBeTruthy();
 const untouched=rows.find(r=>r.getAttribute('aria-label')==='Open vault/1.mutable.json')!;
 const folder=a.querySelector('details.flint-tree-folder')!;
 rows.find(r=>r.getAttribute('aria-label')==='Open vault/0.mutable.json')!.click();
 await wait(()=>expect(idOf(a)).toBe('resource-0'));await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));
 expect(a.querySelector('[aria-label="Open vault/1.mutable.json"]')).toBe(untouched);
 expect(a.querySelector('details.flint-tree-folder')).toBe(folder);
 const status=vi.spyOn(f.service,'status'),sources=vi.spyOn(f.service,'compatibleSource');locations.mockClear();
 const activeView=[...f.editor.projections.values()].find(v=>v!==f.projection&&(v.state.nodes[v.state.rootKey]?.payload.metadata as any)?.documentId==='resource-0')!;
 const text=Object.values(activeView.state.nodes).find(n=>n.viewType==='standoff-editor-block')!;
 for(const character of 'abc')f.editor.commands.replaceInlineRange(text.key,0,0,character);
 // Save status is shared once per edit, not recalculated twice per Explorer row.
 expect(status.mock.calls.length).toBeLessThanOrEqual(6);
 expect(locations).not.toHaveBeenCalled();expect(sources).not.toHaveBeenCalled();
 expect(a.querySelector('[aria-label="Open vault/0.mutable.json"]')?.getAttribute('aria-current')).toBe('page');
 expect(a.querySelector('[aria-label="Open vault/1.mutable.json"]')).toBe(untouched);
 status.mockRestore();sources.mockRestore();
 field(a,'Document title','Changed live title');click(a,'Apply properties');
 expect(a.querySelector('[aria-label="Open vault/0.mutable.json"]')?.textContent).toContain('Changed live title');
 expect(a.querySelector('[aria-label="Open vault/1.mutable.json"]')).toBe(untouched);
 await fs.writeFile(path.join(f.root,'vault/added.md'),'Independent source');click(a,'Refresh');
 await wait(()=>expect(a.querySelector('[aria-label="Markdown source"]')?.textContent).toContain('added.md'));
 expect(a.querySelector('[aria-label="Open vault/1.mutable.json"]')).toBe(untouched);
 expect(a.querySelector('details.flint-tree-folder')).toBe(folder);
 await wait(()=>expect(untouched.disabled).toBe(false));
 untouched.click();await wait(()=>expect(idOf(a)).toBe('resource-1'));
 expect(a.querySelector('[aria-label="Open vault/1.mutable.json"]')?.getAttribute('aria-current')).toBe('page');
 expect(a.querySelector('[aria-label="Open vault/0.mutable.json"]')?.hasAttribute('aria-current')).toBe(false);
 locations.mockRestore();
},15000);
it('browses physical files and opens a real historical Document without migration or hidden native enrollment',async()=>{
 const f=await fixture(),a=f.windows()[0];
 const original=JSON.parse(await fs.readFile('data/raven.json','utf8'));
 delete original.metadata?.title; delete original.metadata?.name;
 const source=JSON.stringify(original);
 await fs.writeFile(path.join(f.root,'vault/nested/raven.json'),source);
 await fs.writeFile(path.join(f.root,'vault/unsupported.json'),JSON.stringify({format:'unknown-future',version:99}));
 await fs.writeFile(path.join(f.root,'vault/notes.txt'),'not a Document');
 const discoveries=vi.spyOn(f.service,'discoverVault');
 await open(a);expect(a.querySelector('[aria-label="Open vault/notes.txt"]')).toBeTruthy();
 const discoveryCount=discoveries.mock.calls.length;
 window.dispatchEvent(new Event('focus'));
 a.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));
 click(a,'nested');expect(a.querySelector('[aria-label="Selected folder"]')?.textContent).toBe('vault/nested');
 a.querySelector<HTMLButtonElement>('[aria-label="Open vault/nested/raven.json"]')!.click();
 const id=String(original.metadata?.documentId??original.id);
 await wait(()=>expect(idOf(a)).toBe(id));expect(a.textContent).toContain('Document');
 expect(discoveries).toHaveBeenCalledTimes(discoveryCount);
 expect(a.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('raven.json');
 expect(f.service.compatibleSource(id)?.location).toEqual({folder:'vault/nested',filename:'raven.json'});
 expect(f.service.knowledgeEvidence(id).location).toEqual({folder:'vault/nested',filename:'raven.json'});
 expect(nativeText(captureNative(f.editor.repository.snapshot(),id))).toContain('Raven');
 field(a,'Document title','Local reading copy');click(a,'Apply properties');
 await f.service.save(id);expect(f.service.status(id)).toContain('Saved Document in place');
 await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));
 a.querySelector<HTMLButtonElement>('[aria-label="Open vault/nested/raven.json"]')!.click();await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));
 expect((a.querySelector('[aria-label="Document title"]') as HTMLInputElement).value).toBe('Local reading copy');
 expect(JSON.parse(await fs.readFile(path.join(f.root,'vault/nested/raven.json'),'utf8')).id).toBe(original.id);
 expect(await fs.readdir(path.join(f.root,'vault/nested'))).toEqual(['raven.json']);
 await fs.copyFile(path.join(f.root,'vault/nested/raven.json'),path.join(f.root,'vault/copied.json'));click(a,'Refresh');
 await wait(()=>expect(a.querySelector('[aria-label="Open vault/copied.json"]')).toBeTruthy());
 await expect(f.service.openCompatible({folder:'vault',filename:'copied.json'},'vault')).rejects.toThrow(/another source/);
 await expect(f.service.openCompatible({folder:'vault',filename:'unsupported.json'},'vault')).rejects.toThrow(/Unsupported resource/);
 await expect(f.service.openCompatible({folder:'../',filename:'raven.json'},'vault')).rejects.toThrow(/folder/);
 await fs.symlink(path.join(f.root,'vault/nested/raven.json'),path.join(f.root,'vault/link.json'));
 await expect(f.service.openCompatible({folder:'vault',filename:'link.json'},'vault')).rejects.toThrow(/Symlink/);
 const fresh=f.make(),b=fresh.windows()[0];await fs.rm(path.join(f.root,'vault/link.json'));await fs.rm(path.join(f.root,'vault/copied.json'));await open(b);
 b.querySelector<HTMLButtonElement>('[aria-label="Open vault/nested/raven.json"]')!.click();await wait(()=>expect(idOf(b)).toBe(id));
 expect((b.querySelector('[aria-label="Document title"]') as HTMLInputElement).value).toBe('Local reading copy');
},20000);

it('shows loading at startup and lists the Vault with an older backend',async()=>{
 let resume!:()=>void;const held=new Promise<void>(r=>resume=r);disposers.push(()=>resume());
 let misses=0,scans=0;
 const f=await fixture({defaultVault:'vault',nativeMiddleware:async(req,res,next)=>{
  if(req.path==='/vault/browse'){misses++;await held;res.status(404).json({Success:false,Error:'This service is unavailable in the current Cavern.'});return;}
  if(req.path==='/vault/discover')scans++;next();
 }});
 await wait(()=>expect(f.host.textContent).toContain('Loading Vault contents'));
 resume();await wait(()=>expect(f.host.querySelector('[aria-label="Open vault/input.md"]')).toBeTruthy());
 expect(misses).toBe(1);expect(scans).toBe(1);
 click(f.host,'Refresh');await wait(()=>expect(scans).toBe(2));expect(misses).toBe(1);
 await wait(()=>expect(button(f.host,'Refresh').disabled).toBe(false));
});
it.each(['/vault/default','/vault/browse'])('shows startup errors from %s in the Library and Retry loads the contents',async failingPath=>{
 let failing=true;
 const f=await fixture({defaultVault:'vault',nativeMiddleware:(req,res,next)=>{
  if(failing&&req.path===failingPath){res.status(503).json({Success:false,Error:'Temporary storage failure'});return;}next();
 }});
 await wait(()=>expect(f.host.querySelector('.flint-vault-controls')?.textContent).toContain('Could not load Vault contents: Error: Temporary storage failure'));
 expect(f.host.querySelector('[aria-label="Selected folder"]')).toBeNull();
 failing=false;click(f.host,'Retry');
 await wait(()=>expect(f.host.querySelector('[aria-label="Open vault/input.md"]')).toBeTruthy());
 expect(f.host.querySelector('.flint-vault-controls')?.textContent).not.toContain('Could not load Vault contents');
});
