import express from 'express';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as vfs } from "./phext-fs.mjs";
import { testCavern } from "../src/knowledge-sqlite/phext-test-cavern.mjs";
import { createWorkspaceStoreRouter } from './workspace-store';
import { importLegacyDesktop } from '../src/persistence/managed-desktop';
import { workspaceContentHash } from '../src/reactive-editor/workspace-manifest';

describe('D1 server persistence boundaries',()=>{
  let root:string,docs:string,workspaces:string,server:Server,base:string;
  const document={id:'doc-block',type:'document-block',metadata:{documentId:'doc'},children:[{type:'plain-text-block',text:'Saved content'}]};
  const source={kind:'document-store',folder:'.',filename:'Notes.json'};
  const workspace=()=>({kind:'speedy-workspace',schemaVersion:2,workspaceId:'workspace',extra:{preserve:1},documents:{doc:{documentId:'doc',source}},root:importLegacyDesktop({type:'workspace-block',children:[{id:'window',type:'document-window-block',children:[{type:'document-reference-block',metadata:{documentId:'doc'}}]}]},()=>({anchor:'window',view:`view-${crypto.randomUUID()}`,window:`window-${crypto.randomUUID()}`}))});
  beforeEach(async()=>{
    root=await fs.mkdtemp(path.join(tmpdir(),'speedy-d0-'));testCavern(root);docs=path.join(root,'documents');workspaces=path.join(root,'workspaces');await vfs.mkdir(docs);await vfs.mkdir(workspaces);
    await vfs.writeFile(path.join(docs,'Notes.json'),JSON.stringify(document));
    const app=express();app.use(express.json());app.use('/api',createWorkspaceStoreRouter({documentRoot:docs,workspaceRoot:workspaces}));
    server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${(server.address() as any).port}/api`;
  });
  afterEach(async()=>{vi.restoreAllMocks();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(root,{recursive:true,force:true});});
  const post=(value:any,headers:Record<string,string>={},route='saveWorkspaceBundle')=>fetch(`${base}/${route}`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(value)});

  function d1(){const value=workspace(),d=value.root.metadata.workspacePresentation.presentations.desktop;d.version=4;d.layout={...d.layout,kind:'split-tree',version:1,floating:d.windows.map((w:any)=>w.restoreKey)};d.layouts=[{id:'arrangement-one',name:'One',revision:1,windows:structuredClone(d.windows),layout:structuredClone(d.layout)}];d.activeLayout='arrangement-one';return value;}
  it('round trips named layouts with unavailable references without reading or writing missing Documents',async()=>{
    const value=d1();(value.documents.doc as any).unavailable=true;await vfs.unlink(path.join(docs,'Notes.json'));
    const response=await post({filename:'D1.json',workspace:value,documents:[]},{'If-None-Match':'*'});expect(response.status).toBe(200);
    const loaded=await (await fetch(`${base}/loadWorkspaceJson?filename=D1.json`)).json();expect(loaded.Data.workspace).toEqual(value);expect(await vfs.readdir(docs)).toEqual([]);
    expect((await post({filename:'D1.json',workspace:value,documents:[{documentId:'doc'}]},{'If-Match':loaded.Data.contentHash})).status).toBe(400);
  });
  it('requires explicit Save As from D0/C to D1 and refuses downgrades and future versions without changing original files',async()=>{
    const old=workspace(),value=d1(),target=path.join(workspaces,'Desk.json');await vfs.writeFile(target,JSON.stringify(old));const before=await vfs.readFile(target,'utf8');
    const load=await (await fetch(`${base}/loadWorkspaceJson?filename=Desk.json`)).json();expect((await post({filename:'Desk.json',workspace:value,documents:[]},{'If-Match':load.Data.contentHash})).status).toBe(409);expect(await vfs.readFile(target,'utf8')).toBe(before);
    const response=await post({filename:'New.json',workspace:value,documents:[]},{'If-None-Match':'*'});expect(response.status).toBe(200);const hash=(await response.json()).Data.contentHash;
    expect((await post({filename:'New.json',workspace:old,documents:[]},{'If-Match':hash})).status).toBe(409);
    value.root.metadata.workspacePresentation.presentations.desktop.version=99;expect((await post({filename:'New.json',workspace:value,documents:[]},{'If-Match':hash})).status).toBe(400);
  });
  it('rejects malformed named trees before staging and preserves unsupported descriptors unchanged',async()=>{
    const value=d1(),d=value.root.metadata.workspacePresentation.presentations.desktop;d.views[0].descriptorVersion=99;d.views[0].custom={preserve:true};
    expect((await post({filename:'Unknown.json',workspace:value,documents:[]},{'If-None-Match':'*'})).status).toBe(200);
    d.layouts[0].windows[0].bounds.width=-1;expect((await post({filename:'Bad.json',workspace:value,documents:[]})).status).toBe(400);expect(await vfs.readdir(workspaces)).toEqual(['Unknown.json']);
  });
  it('keeps original workspace and Document bytes when the D1 atomic rename fails',async()=>{
    const value=d1(),target=path.join(workspaces,'Desk.json');await vfs.writeFile(target,JSON.stringify(value));const before=await vfs.readFile(target,'utf8'),docBefore=await vfs.readFile(path.join(docs,'Notes.json'),'utf8');
    const loaded=await (await fetch(`${base}/loadWorkspaceJson?filename=Desk.json`)).json();value.root.metadata.workspacePresentation.presentations.desktop.layouts[0].name='Changed';
    const rename=vfs.rename.bind(vfs);vi.spyOn(vfs,'rename').mockImplementation(async(from,to)=>{if(path.basename(String(to))==='Desk.json')throw Error('injected interruption before rename');return rename(from,to);});
    expect((await post({filename:'Desk.json',workspace:value,documents:[]},{'If-Match':loaded.Data.contentHash})).status).toBe(500);
    expect(await vfs.readFile(target,'utf8')).toBe(before);expect(await vfs.readFile(path.join(docs,'Notes.json'),'utf8')).toBe(docBefore);expect(await vfs.readdir(workspaces)).toEqual(['Desk.json']);
  });
  it('uses optimistic concurrency after the atomic boundary; a lost response cannot overwrite a newer revision',async()=>{
    const value=d1();const first=await post({filename:'Desk.json',workspace:value,documents:[]},{'If-None-Match':'*'});const hash=(await first.json()).Data.contentHash;
    value.root.metadata.workspacePresentation.presentations.desktop.layouts[0].name='Committed';expect((await post({filename:'Desk.json',workspace:value,documents:[]},{'If-Match':hash})).status).toBe(200);
    value.root.metadata.workspacePresentation.presentations.desktop.layouts[0].name='Stale retry';expect((await post({filename:'Desk.json',workspace:value,documents:[]},{'If-Match':hash})).status).toBe(409);
    expect(JSON.parse(await vfs.readFile(path.join(workspaces,'Desk.json'),'utf8')).root.metadata.workspacePresentation.presentations.desktop.layouts[0].name).toBe('Committed');
  });
});
