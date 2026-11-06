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
