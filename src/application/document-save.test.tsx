import {createDocumentSave} from './document-save';
// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {render} from 'solid-js/web';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createNativeDocumentStoreRouter} from '../../server/native-document-store.mjs';
import {promises as vfs} from '../../server/phext-fs.mjs';
import {testCavern} from '../knowledge-sqlite/phext-test-cavern.mjs';
import {WorkspaceSession} from './workspace-session';
import {workspaceOpen} from './workspace-open';
import {materializeLocalWorkspace} from '../reactive-editor/workspace-manifest';
import {ReactiveTreeView} from '../rendering/reactive-tree-view';
import {createWorkspaceOpenControls} from '../demo/workspace-open-controls';
import {nativeDocumentSession} from '../persistence/native-session';
const cleanup:Array<()=>any>=[];afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();document.body.replaceChildren();vi.unstubAllGlobals();vi.restoreAllMocks();});
const wait=(f:()=>void)=>vi.waitFor(f,{timeout:6000});
const click=(label:string)=>{const b=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label||b.getAttribute('aria-label')===label)!;expect(b,label).toBeTruthy();expect(b.disabled).toBe(false);b.click();};
it('submission saving catches up edits made during I/O before reporting completion',async()=>{
 const f=await setup();await fs.writeFile(path.join(f.root,'vault/Conversation.ink'),f.original);
 await f.actions.serverDocument({folder:'vault',filename:'Conversation.ink'},new AbortController().signal);
 const editor=f.session.editor,id=JSON.parse(f.original).resourceId;
 const c=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='standoff-editor-block')!;
 const p=Object.values(editor.repository.readState().placements).find(p=>p.contentKey===c.key)!;
 let save!:ReturnType<typeof createDocumentSave>['save'];
 const Host=()=>{const s=createDocumentSave(editor,{guard:()=>{},vault:async()=>({root:'vault'})});save=s.save;return <s.Dialogs/>;};cleanup.push(render(()=><Host/>,document.body));
 let entered!:()=>void,resume!:()=>void;const arrived=new Promise<void>(r=>entered=r),held=new Promise<void>(r=>resume=r),actual=fetch,writes:any[]=[];
 vi.stubGlobal('fetch',async(input:any,init:any)=>{const result=await actual(input,init);if(String(input)==='/api/native/save'){writes.push(JSON.parse(init.body));if(writes.length===1){entered();await held;}}return result;});
 editor.commands.replaceInlineRange(p.key,0,0,'Before save ');
 const saving=save(id,undefined,false,{defaultFilename:'Ignored.ink'});await arrived;
 editor.commands.replaceInlineRange(p.key,0,0,'During save ');expect(f.native.isDirty(id)).toBe(true);resume();
 expect(await saving).toBe(true);expect(writes).toHaveLength(2);expect(writes[0].generation.native).not.toContain('During save');expect(writes[1].generation.native).toContain('During save');
 expect(f.native.isDirty(id)).toBe(false);expect(await fs.readFile(path.join(f.root,'vault/Conversation.ink'),'utf8')).toBe(writes[1].generation.native);
 expect(await save(id,undefined,false,{defaultFilename:'Ignored.ink'})).toBe(true);expect(writes).toHaveLength(2);
});
async function setup(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ink-vault-save-'));cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));const cavern=testCavern(root);cleanup.push(()=>cavern.close());await vfs.mkdir(path.join(root,'vault'));await vfs.mkdir(path.join(root,'outside'));
 const original=await fs.readFile('artifacts/flint-b1.2/rich.mutable.json','utf8');await vfs.writeFile(path.join(root,'outside/Original.ink'),original);
 const app=express();app.use('/api/native',createNativeDocumentStoreRouter({root,defaultVault:'vault'}));const server:any=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});cleanup.push(()=>new Promise(r=>server.close(r)));
 const actual=globalThis.fetch;vi.stubGlobal('fetch',(input:any,init:any)=>actual(typeof input==='string'&&input.startsWith('/')?`http://127.0.0.1:${server.address().port}${input}`:input,init));
 const session=new WorkspaceSession(materializeLocalWorkspace({id:'workspace',type:'workspace-block',children:[]}),{features:{nativeKnowledge:false,sqliteKnowledge:false,threeDObjects:false}});cleanup.push(()=>session.dispose());const actions=workspaceOpen(session),native=nativeDocumentSession(session.editor);
 const mount=()=>{const Host=()=>{const controls=createWorkspaceOpenControls(session,()=>true);return <><ReactiveTreeView editor={session.editor} projection={session.projection}/><controls.Dialogs/></>;};cleanup.push(render(()=><Host/>,document.body));};
 return {root,original,session,actions,native,mount};
}
it('saves a newly created standalone Ink Document directly into the default Vault',async()=>{
 const f=await setup(),placement=f.actions.newDocument();f.mount();
 const window=f.session.projection.nodeForPlacement(placement)!;expect(f.actions.canSaveDocument(window.key)).toBe(true);
 const doc=Object.values(f.session.editor.repository.readState().contents).find(c=>c.viewType==='document-block')!,id=String((doc.payload.metadata as any)?.documentId??doc.payload.id);
 click('Save Document');await wait(()=>expect(f.native.isDirty(id)).toBe(false));
 const location=f.native.location(id)!;expect(location.folder).toBe('vault');expect(JSON.parse(await vfs.readFile(path.join(f.root,location.folder,location.filename),'utf8')).resourceId).toBe(id);
 expect(document.body.textContent).not.toContain('Storage and recovery');
},15000);
it('outside-Vault Ink Save asks for a Vault copy, supports cancellation, and retains its editing session',async()=>{
 const f=await setup(),placement=await f.actions.serverDocument({folder:'outside',filename:'Original.ink'},new AbortController().signal);f.mount();
 const id=JSON.parse(f.original).resourceId,projection=f.session.projection,dom=document.querySelector('[contenteditable=true]');
 click('Save Document');await wait(()=>expect(document.body.textContent).toContain('Save in Vault'));click('Cancel');
 await wait(()=>expect(document.body.textContent).toContain('Save cancelled'));expect(f.native.location(id)?.folder).toBe('outside');expect(await vfs.readdir(path.join(f.root,'vault'))).toEqual([]);
 click('Save Document');await wait(()=>expect(document.body.textContent).toContain('Save in Vault'));
 const field=document.querySelector<HTMLInputElement>('[aria-label="Save Vault filename"]')!;field.value='Copied.ink';field.dispatchEvent(new Event('input',{bubbles:true}));click('Save in Vault');
 await wait(()=>expect(f.native.location(id)).toEqual({folder:'vault',filename:'Copied.ink'}));await wait(()=>expect(f.native.isDirty(id)).toBe(false));
 expect(await vfs.readFile(path.join(f.root,'outside/Original.ink'),'utf8')).toBe(f.original);expect(JSON.parse(await vfs.readFile(path.join(f.root,'vault/Copied.ink'),'utf8')).resourceId).toBe(id);
 expect(f.session.projection).toBe(projection);expect(document.querySelector('[contenteditable=true]')).toBe(dom);expect(f.session.projection.nodeForPlacement(placement)).toBeTruthy();
 click('Save Document');await wait(()=>expect(document.body.textContent).toContain('Saved Mutable JSON Document'));expect(document.body.textContent).not.toContain('Save in Vault');
},15000);

it('Save As uses the existing copy service, preserves the source and retains the editor',async()=>{
 const f=await setup();await fs.writeFile(path.join(f.root,'vault/Original.ink'),f.original);
 await f.actions.serverDocument({folder:'vault',filename:'Original.ink'},new AbortController().signal);f.mount();
 const id=JSON.parse(f.original).resourceId,dom=document.querySelector('[contenteditable=true]');let save!:(id:string,location?:any,choose?:boolean)=>Promise<boolean>;
 const host=document.body.appendChild(document.createElement('div'));
 {
  const Host=()=>{const service=createDocumentSave(f.session.editor,{guard:()=>{},vault:async()=>({root:'vault'})});save=service.save;return <service.Dialogs/>;};
  cleanup.push(render(()=><Host/>,host));
 }
 const pending=save(id,undefined,true);await wait(()=>expect(document.body.textContent).toContain('Save in Vault'));
 const field=document.querySelector<HTMLInputElement>('[aria-label="Save Vault filename"]')!;field.value='Copy.ink';field.dispatchEvent(new Event('input',{bubbles:true}));click('Save in Vault');
 expect(await pending).toBe(true);expect(f.native.location(id)).toEqual({folder:'vault',filename:'Copy.ink'});
 expect(await fs.readFile(path.join(f.root,'vault/Original.ink'),'utf8')).toBe(f.original);
 expect(JSON.parse(await fs.readFile(path.join(f.root,'vault/Copy.ink'),'utf8')).resourceId).toBe(id);
 expect(document.querySelector('[contenteditable=true]')).toBe(dom);
},15000);

it('submission saves preserve native names, choose collision-free date names, and recover unknown outcomes',async()=>{
 const f=await setup(),editor=f.session.editor;f.actions.newDocument();f.mount();
 const record=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='document-block')!,id=String((record.payload.metadata as any)?.documentId??record.payload.id);
 const key=f.session.projection.nodeForPlacement(Object.values(editor.repository.readState().placements).find(p=>p.contentKey===record.key)!.key)!.key;
 editor.commands.setPayloadField(key,'metadata',{...(record.payload.metadata as any),title:'A generated conversation title'});
 const name='Conversation on November 10, 2026.ink';await fs.writeFile(path.join(f.root,'vault',name),'occupied');
 let save!:ReturnType<typeof createDocumentSave>['save'];
 const Host=()=>{const s=createDocumentSave(editor,{guard:()=>{},vault:async()=>({root:'vault'})});save=s.save;return <s.Dialogs/>;};cleanup.push(render(()=><Host/>,document.body.appendChild(document.createElement('div'))));
 expect(await save(id,undefined,false,{defaultFilename:name})).toBe(true);
 expect(f.native.location(id)?.filename).toBe('Conversation on November 10, 2026 (2).ink');expect(await fs.readFile(path.join(f.root,'vault',name),'utf8')).toBe('occupied');
 expect(document.body.textContent).not.toContain('Replace existing');
 const originalLocation={...f.native.location(id)!};
 const rejected=await f.native.saveCopy(id,{folder:'vault',filename:'Other same-folder name.ink'});
 expect(rejected?.phase).toBe('failed');expect(f.native.location(id)).toEqual(originalLocation);
 await fs.mkdir(path.join(f.root,'vault/renamed'));
 const copy=save(id,undefined,true);await wait(()=>expect(document.body.textContent).toContain('Save in Vault'));
 const folder=document.querySelector<HTMLInputElement>('[aria-label="Save Vault folder"]')!;folder.value='vault/renamed';folder.dispatchEvent(new Event('input',{bubbles:true}));
 const field=document.querySelector<HTMLInputElement>('[aria-label="Save Vault filename"]')!;field.value='My chosen name.ink';field.dispatchEvent(new Event('input',{bubbles:true}));click('Save in Vault');await copy;
 await save(id,undefined,false,{defaultFilename:'Conversation on November 11, 2026.ink'});expect(f.native.location(id)?.filename).toBe('My chosen name.ink');
 const fetchBefore=globalThis.fetch;let failed=false;const generations:string[]=[];
 editor.commands.setPayloadField(key,'metadata',{...(record.payload.metadata as any),title:'A newer conversation title'});
 vi.stubGlobal('fetch',(input:any,init:any)=>{if(String(input).endsWith('/api/native/save')){generations.push(JSON.parse(init.body).generation.generation);if(!failed){failed=true;return Promise.reject(new TypeError('Failed to fetch'));}}return fetchBefore(input,init);});
 await expect(save(id,undefined,false,{defaultFilename:name})).rejects.toThrow('Failed to fetch');expect(f.native.hasPendingSave(id)).toBe(true);
 expect(await save(id,undefined,false,{defaultFilename:name})).toBe(true);expect(f.native.hasPendingSave(id)).toBe(false);expect(generations[1]).toBe(generations[0]);
 expect(f.native.location(id)?.filename).toBe('My chosen name.ink');expect(f.native.isDirty(id)).toBe(false);
 expect((await fs.readdir(path.join(f.root,'vault'))).some(n=>n.endsWith('.md'))).toBe(false);
},15000);
