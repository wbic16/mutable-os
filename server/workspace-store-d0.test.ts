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

describe('D0 server persistence boundaries',()=>{
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

  it('round trips layout-only saves, preserves unknown fields, and detects stale concurrent writers',async()=>{
    const value=workspace(),before=await vfs.readFile(path.join(docs,'Notes.json'),'utf8');
    const initial=await post({filename:'Desk.json',workspace:value,documents:[]},{'If-None-Match':'*'});expect(initial.status).toBe(200);
    const first=await initial.json();const loaded=await (await fetch(`${base}/loadWorkspaceJson?filename=Desk.json`)).json();
    expect(loaded.Data.workspace).toEqual(value);expect(loaded.Data.contentHash).toBe(first.Data.contentHash);
    const next=structuredClone(value);next.extra.preserve=2;
    const responses=await Promise.all([next,{...value,extra:{preserve:3}}].map(workspace=>post({filename:'Desk.json',workspace,documents:[]},{'If-Match':first.Data.contentHash})));
    expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
    expect(await vfs.readFile(path.join(docs,'Notes.json'),'utf8')).toBe(before);
    expect([2,3]).toContain(JSON.parse(await vfs.readFile(path.join(workspaces,'Desk.json'),'utf8')).extra.preserve);
    expect(await vfs.readdir(workspaces)).toEqual(['Desk.json']);
  });
  it('refuses embedded writes, missing files and identity mismatches without creating a Workspace',async()=>{
    const value=workspace();
    expect((await post({filename:'Desk.json',workspace:value,documents:[{documentId:'doc'}]})).status).toBe(400);
    await vfs.writeFile(path.join(docs,'Notes.json'),JSON.stringify({...document,metadata:{documentId:'other'}}));
    expect((await post({filename:'Desk.json',workspace:value,documents:[]})).status).toBe(409);
    await vfs.unlink(path.join(docs,'Notes.json'));
    expect((await post({filename:'Desk.json',workspace:value,documents:[]})).status).toBe(404);
    expect(await vfs.readdir(workspaces)).toEqual([]);
  });
  it('protects future and managed files from both legacy writers and refuses in-place upgrades',async()=>{
    const value=workspace(),target=path.join(workspaces,'Desk.json');
    for(const old of [{...value,schemaVersion:99},{type:'workspace-block',schemaVersion:99},value]) {
      await vfs.writeFile(target,JSON.stringify(old));const before=await vfs.readFile(target,'utf8');
      expect((await post({filename:'Desk.json',workspace:{type:'workspace-block'}},{},'saveWorkspaceJson')).status).toBe(409);
      const legacy={...value,schemaVersion:1,root:{type:'workspace-block'}};
      expect((await post({filename:'Desk.json',workspace:legacy,documents:[]})).status).toBe(409);
      expect(await vfs.readFile(target,'utf8')).toBe(before);
    }
    await vfs.writeFile(target,JSON.stringify({type:'workspace-block'}));
    expect((await post({filename:'Desk.json',workspace:value,documents:[]})).status).toBe(409);
    expect((await post({filename:'New.json',workspace:value,documents:[]},{'If-None-Match':'*'})).status).toBe(200);
  });
  it('rejects malformed desktop graphs and unsupported descriptor versions before staging',async()=>{
    for(const mutate of [(d:any)=>d.windows[0].bounds.height=-1,(d:any)=>d.layout.normalOrder=[],(d:any)=>d.views[0].descriptorVersion=9]){
      const value=workspace();mutate(value.root.metadata.workspacePresentation.presentations.desktop);
      expect((await post({filename:'Bad.json',workspace:value,documents:[]})).status).toBe(400);
    }
    expect(await vfs.readdir(workspaces)).toEqual([]);
  });
  it('rolls back a legacy Document write when the following Workspace rename fails',async()=>{
    const before=await vfs.readFile(path.join(docs,'Notes.json'),'utf8'),target=path.join(workspaces,'Desk.json');
    await vfs.writeFile(target,JSON.stringify({type:'workspace-block',old:true}));const original=await vfs.readFile(target,'utf8');
    const next={...document,children:[{type:'plain-text-block',text:'Updated'}]},contentHash=await workspaceContentHash(next);
    const value={kind:'speedy-workspace',schemaVersion:1,workspaceId:'workspace',documents:{doc:{documentId:'doc',source,contentHash}},root:{type:'workspace-block',children:[{type:'document-reference-block',metadata:{documentId:'doc'}}]}};
    const rename=vfs.rename.bind(vfs);vi.spyOn(vfs,'rename').mockImplementation(async(from,to)=>{if(path.basename(String(to))==='Desk.json')throw Error('injected I/O failure');return rename(from,to);});
    expect((await post({filename:'Desk.json',workspace:value,documents:[{documentId:'doc',source,document:next,contentHash}]})).status).toBe(500);
    expect(await vfs.readFile(path.join(docs,'Notes.json'),'utf8')).toBe(before);expect(await vfs.readFile(target,'utf8')).toBe(original);
    expect(await vfs.readdir(workspaces)).toEqual(['Desk.json']);expect(await vfs.readdir(docs)).toEqual(['Notes.json']);
  });
  it('reports partial failure explicitly when rollback itself cannot restore a Document',async()=>{
    const target=path.join(workspaces,'Desk.json');await vfs.writeFile(target,JSON.stringify({type:'workspace-block'}));
    const next={...document,children:[{type:'plain-text-block',text:'Updated'}]},contentHash=await workspaceContentHash(next);
    const value={kind:'speedy-workspace',schemaVersion:1,workspaceId:'workspace',documents:{doc:{documentId:'doc',source,contentHash}},root:{type:'workspace-block'}};
    const rename=vfs.rename.bind(vfs);vi.spyOn(vfs,'rename').mockImplementation(async(from,to)=>{
      if(path.basename(String(to))==='Desk.json'||path.basename(String(from)).startsWith('.speedy-rollback-'))throw Error('injected failure');
      return rename(from,to);
    });
    const response=await post({filename:'Desk.json',workspace:value,documents:[{documentId:'doc',source,document:next,contentHash}]});
    expect(response.status).toBe(500);const body=await response.json();
    expect(body.Code).toBe('partial-save');expect(body.Error).toContain('Notes.json');
    expect(JSON.parse(await vfs.readFile(path.join(docs,'Notes.json'),'utf8'))).toEqual(next);
  });
  it('removes a partially written staging file when staging fails',async()=>{
    const write=vfs.writeFile.bind(vfs);vi.spyOn(vfs,'writeFile').mockImplementation(async(file,data,options:any)=>{
      if(path.basename(String(file)).startsWith('.speedy-workspace-')) {await write(file,'partial',options);throw Error('disk full');}
      return write(file,data,options);
    });
    expect((await post({filename:'Desk.json',workspace:workspace(),documents:[]})).status).toBe(500);
    expect(await vfs.readdir(workspaces)).toEqual([]);
  });

  it('round trips a C layout with D0 identities, rejects downgrade and malformed C saves before replacing files',async()=>{
    const d0=workspace(),value=structuredClone(d0),desktop=value.root.metadata.workspacePresentation.presentations.desktop;
    desktop.version=3;
    desktop.layout={...desktop.layout,kind:'split-tree',version:1,floating:[],tree:{id:'leaf',kind:'tabs',entries:[desktop.windows[0].restoreKey],active:desktop.windows[0].restoreKey}};
    const before=await vfs.readFile(path.join(docs,'Notes.json'),'utf8');
    const initial=await post({filename:'C.json',workspace:d0,documents:[]},{'If-None-Match':'*'});
    expect(initial.status).toBe(200);const initialHash=(await initial.json()).Data.contentHash;
    const beforeUpgrade=await (await fetch(`${base}/loadWorkspaceJson?filename=C.json`)).json();expect(beforeUpgrade.Data.workspace).toEqual(d0);
    const response=await post({filename:'C.json',workspace:value,documents:[]},{'If-Match':initialHash});
    expect(response.status).toBe(200);const hash=(await response.json()).Data.contentHash;
    const loaded=await (await fetch(`${base}/loadWorkspaceJson?filename=C.json`)).json();expect(loaded.Data.workspace).toEqual(value);
    expect((await post({filename:'C.json',workspace:d0,documents:[]},{'If-Match':hash})).status).toBe(409);
    for(const mutate of [(d:any)=>d.layout.version=2,(d:any)=>d.layout.tree.active='missing',(d:any)=>d.layout.floating=[d.windows[0].restoreKey]]){
      const bad=structuredClone(value);mutate(bad.root.metadata.workspacePresentation.presentations.desktop);
      expect((await post({filename:'C.json',workspace:bad,documents:[]},{'If-Match':hash})).status).toBe(400);
    }
    expect(JSON.parse(await vfs.readFile(path.join(workspaces,'C.json'),'utf8'))).toEqual(value);
    expect(await vfs.readFile(path.join(docs,'Notes.json'),'utf8')).toBe(before);
  });

  it('leaves a saved C layout intact after an injected partial staging failure',async()=>{
    const value=workspace(),desktop=value.root.metadata.workspacePresentation.presentations.desktop;
    desktop.version=3;desktop.layout={...desktop.layout,kind:'split-tree',version:1,floating:desktop.windows.map((w:any)=>w.restoreKey)};
    const response=await post({filename:'C.json',workspace:value,documents:[]},{'If-None-Match':'*'});
    expect(response.status).toBe(200);const hash=(await response.json()).Data.contentHash;
    const target=path.join(workspaces,'C.json'),before=await vfs.readFile(target,'utf8');
    const write=vfs.writeFile.bind(vfs);vi.spyOn(vfs,'writeFile').mockImplementation(async(file,data,options:any)=>{
      if(path.basename(String(file)).startsWith('.speedy-workspace-')){await write(file,'partial',options);throw Error('C staging failure');}
      return write(file,data,options);
    });
    value.extra.preserve=2;
    expect((await post({filename:'C.json',workspace:value,documents:[]},{'If-Match':hash})).status).toBe(500);
    expect(await vfs.readFile(target,'utf8')).toBe(before);expect(await vfs.readdir(workspaces)).toEqual(['C.json']);
  });

});
