// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import express from 'express';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,webcrypto} from 'node:crypto';
import {createNativeDocumentStoreRouter} from '../../server/native-document-store.mjs';
import {WorkspaceSession} from './workspace-session';
import {WorkspacePresentationView} from './workspace-presentation-view';
import {materializeLocalWorkspace} from '../reactive-editor/workspace-manifest';
import {documentApplicationPorts,type DocumentApplicationPort} from './document-application-ports';
import {nativeDocumentSession} from '../persistence/native-session';
import {decodeDocument} from '../block-tree/codecs';
import {captureNative,nativeText} from '../persistence/native-resource';
import {matchSources} from '../runtime/search-matching';
import type {CompletionSession} from '../features/autocomplete/session';

const stops:Array<()=>unknown>=[],actualFetch=globalThis.fetch;
afterEach(async()=>{for(const stop of stops.splice(0).reverse())await stop();document.body.replaceChildren();localStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();});
const documentId=(port:DocumentApplicationPort)=>{const s=port?.session();return (s?.projection.node(s.rootKey)?.payload.metadata as any)?.documentId;};
const wait=(check:()=>void)=>vi.waitFor(check,{timeout:8000,interval:20});
async function setup(flint:boolean|'minimized',options:{command?:string;enabled?:boolean;duplicateTitle?:boolean}={}) {
 vi.stubGlobal('crypto',webcrypto);
 // jsdom has no text layout; navigation still uses the actual mounted text cells.
 const bounds=Range.prototype.getBoundingClientRect,rects=Range.prototype.getClientRects;
 Range.prototype.getBoundingClientRect=()=>new DOMRect(20,20,100,20);
 Range.prototype.getClientRects=()=>[new DOMRect(20,20,100,20)] as any;
 stops.push(()=>{Range.prototype.getBoundingClientRect=bounds;Range.prototype.getClientRects=rects;});
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'scry-navigation-'));stops.push(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'vault'));
 const text='An embassy from the Court of Milan came to Florence.';
 const bytes=nativeText(captureNative(decodeDocument({id:'milan-root',type:'document-block',metadata:{documentId:'milan',title:'Court of Milan'},children:[{id:'milan-passage',type:'standoff-editor-block',text}]}).state,'milan'));
 await fs.writeFile(path.join(root,'vault/milan.ink'),bytes);
 if(options.duplicateTitle)await fs.writeFile(path.join(root,'vault/milan-copy.ink'),bytes.replaceAll('milan-root','copy-root').replaceAll('milan-passage','copy-passage').replaceAll('\"milan\"','\"copy\"'));
 const hit={stamp:'selected-stamp',text,source:{vaultGuid:'fixture',resourceId:'milan',rootBlockId:'milan-root',sourceHash:createHash('sha256').update(bytes).digest('hex'),extractionProfile:'mutable-saved-sql-v3:'+JSON.stringify({version:1,opaqueTypes:[]}),format:'mutable-document',path:'vault/milan.ink',spans:[{resourceId:'milan',blockGuid:'milan-passage',start:0,end:[...text].length,coordinate:'cell',chunkStart:0,chunkEnd:text.length}]}};
 const app=express();app.use('/api/native',createNativeDocumentStoreRouter({root}));
 const server:any=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});stops.push(()=>new Promise(r=>server.close(r)));
 const fetcher=vi.fn(async(input:any,init:any)=>{
  if(input==='/api/retrieval/query')return new Response(JSON.stringify({Success:true,Data:{results:[hit]}}));
  if(input==='/api/retrieval/verify')return new Response(JSON.stringify({Success:true,Data:{currency:'verified-saved-projection'}}));
  return actualFetch(typeof input==='string'&&input.startsWith('/')?`http://127.0.0.1:${server.address().port}${input}`:input,init);
 });vi.stubGlobal('fetch',fetcher);
 vi.stubGlobal('Worker',class {onmessage?:(event:any)=>void;live=true;terminate(){this.live=false;}postMessage(data:any){setTimeout(()=>{if(this.live)this.onmessage?.({data:{results:matchSources(data.sources,data.query,data.options)}});},0);}});
 const workspace=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{flintSlashCommands:options.enabled??true,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,flintLogo:false,flintMaterialChrome:false,dialecticAutomaticTitles:false,dialecticAutosave:false}}),editor=workspace.editor;
 stops.push(()=>workspace.dispose());const host=document.body.appendChild(document.createElement('div'));stops.push(render(()=><WorkspacePresentationView session={workspace}/>,host));editor.installGateway(document);
 const ports=()=>documentApplicationPorts(editor).ports();
 if(flint){await editor.commandRegistry.execute('flint.open',{targetKey:workspace.projection.state.rootKey,args:undefined});await ports().find(p=>p.applicationId==='flint')!.application.vault!.open('vault');if(flint==='minimized')editor.windowManager!.lifecycle.minimize(ports().find(p=>p.applicationId==='flint')!.windowId()!);}
 await editor.commandRegistry.execute('dialectic.open',{targetKey:workspace.projection.state.rootKey,args:undefined});
 const dialectic=ports().find(p=>p.applicationId==='dialectic')!;await dialectic.application.vault!.open('vault');
 const source=Object.values(dialectic.session()!.projection.state.nodes).find(n=>n.viewType==='standoff-editor-block')!;
 editor.focus.request(source.key);editor.mounts.get(source.key)!.restoreInlineSelection!({anchor:0,head:0});
 for(const [i,char] of [...(options.command??'/search')].entries()){editor.commands.replaceInlineRange(source.key,i,i,char);editor.mounts.get(source.key)!.restoreInlineSelection!({anchor:i+1,head:i+1});editor.completionInput!.edited(source.key,i+1,'insertText');}
 const completion=()=>editor.overlays.overlays.find(o=>o.viewType==='autocomplete')?.data as {session:CompletionSession}|undefined;
 const result={workspace,editor,host,ports,dialectic,source,completion,fetcher,root,bytes,passageLength:[...text].length};
 if(options.command)return result;
 await completion()!.session.choose();await wait(()=>expect(completion()?.session.state.kind).toBe('block'));
 const snapshots=vi.spyOn(editor.repository,'snapshot'),discovery=vi.spyOn(nativeDocumentSession(editor),'discoverVault');
 completion()!.session.expand();completion()!.session.input('Court of Milan');
 await wait(()=>expect(host.querySelector('.autocomplete-results [role="option"]')).toBeTruthy());
 expect(snapshots).not.toHaveBeenCalled();expect(discovery).not.toHaveBeenCalled();
 snapshots.mockRestore();discovery.mockRestore();
 return result;
}

it.each([true,false,'minimized'] as const)('opens a Scry match from Dialectic in active Flint (already open: %s)',async existing=>{
 const f=await setup(existing),id=documentId(f.dialectic);
 expect(nativeDocumentSession(f.editor).location('milan')).toBeUndefined();
 f.fetcher.mockClear();
 f.host.querySelector<HTMLButtonElement>('.autocomplete-results [role="option"]')!.click();
 await wait(()=>{
  const flint=f.ports().find(p=>p.applicationId==='flint')!;
  expect(documentId(flint), f.completion()?.session.state.error).toBe('milan');
  expect(f.editor.windowManager!.registry.activeWindowId).toBe(flint.windowId());
  expect(f.editor.node(f.editor.focus.state.focusedKey!)?.payload.id).toBe('milan-passage');
  expect(f.editor.mounts.get(f.editor.focus.state.focusedKey!)?.captureInlineSelection?.()).toEqual({anchor:0,head:f.passageLength});
 });
 expect(documentId(f.dialectic)).toBe(id);
 expect(f.source.inlineContent.map(k=>f.editor.node(k)?.payload.text).join('')).toBe('/search');
 expect(f.host.querySelector('.autocomplete-workstation')).toBeNull();
 expect(f.ports().filter(p=>p.applicationId==='flint')).toHaveLength(1);
 expect(nativeDocumentSession(f.editor).isDirty('milan')).toBe(false);
 expect(await fs.readFile(path.join(f.root,'vault/milan.ink'),'utf8')).toBe(f.bytes);
 expect(f.fetcher.mock.calls.filter(([url])=>url==='/api/retrieval/verify')).toHaveLength(1);
 // Explicit opening may admit one resource; no save or index request is allowed.
 expect(f.fetcher.mock.calls.some(([url])=>/save|index|refresh/.test(String(url)))).toBe(false);
},20000);

it('keeps Dialectic active and reports changed saved bytes instead of opening a stale match',async()=>{
 const f=await setup(true),flint=f.ports().find(p=>p.applicationId==='flint')!,before=documentId(flint);
 await fs.writeFile(path.join(f.root,'vault/milan.ink'),f.bytes.replace('Court of Milan','Court of Mantua'));
 f.host.querySelector<HTMLButtonElement>('.autocomplete-results [role="option"]')!.click();
 await wait(()=>expect(f.completion()?.session.state.error).toMatch(/changed|stale/));
 expect(documentId(flint)).toBe(before);
 expect(f.editor.windowManager!.registry.activeWindowId).toBe(f.dialectic.windowId());
 expect(nativeDocumentSession(f.editor).location('milan')).toBeUndefined();
},20000);

it.each([true,false,'minimized'] as const)('runs /flint open without duplicating Flint (existing: %s)',async existing=>{
 const f=await setup(existing,{command:'/flint open'}),id=documentId(f.dialectic);
 await f.completion()!.session.choose();
 await wait(()=>expect(f.editor.windowManager!.registry.activeWindowId).toBe(f.ports().find(p=>p.applicationId==='flint')!.windowId()));
 expect(f.ports().filter(p=>p.applicationId==='flint')).toHaveLength(1);
 expect(documentId(f.dialectic)).toBe(id);expect(f.source.inlineContent).toHaveLength(0);
 f.editor.repository.undo();expect(f.source.inlineContent.map(k=>f.editor.node(k)?.payload.text).join('')).toBe('/flint open');
},20000);
it('completes duplicate Document titles by path, admits only the chosen Document and removes the command with Undo',async()=>{
 const f=await setup(false,{command:'/flint open --doc',duplicateTitle:true}),native=nativeDocumentSession(f.editor);
 const snapshots=vi.spyOn(f.editor.repository,'snapshot'),discovery=vi.spyOn(native,'discoverVault');f.fetcher.mockClear();
 await wait(()=>expect(f.completion()?.session.state.rows.filter(r=>r.name==='Court of Milan')).toHaveLength(2));
 const s=f.completion()!.session,values=Object.values;let scans=0;
 const all=vi.spyOn(Object,'values').mockImplementation((value:any)=>{if(value===f.editor.repository.state.contents||value===f.editor.repository.state.placements)scans++;return values(value);});
 for(const char of ' Court of Milan'){const i=f.source.inlineContent.length;f.editor.commands.replaceInlineRange(f.source.key,i,i,char);f.editor.mounts.get(f.source.key)!.restoreInlineSelection!({anchor:i+1,head:i+1});f.editor.completionInput!.edited(f.source.key,i+1,'insertText');}
 await wait(()=>expect(s.state.busy).toBe(false));expect(scans).toBe(0);all.mockRestore();
 expect(s.state.rows.map(r=>r.reason).sort()).toEqual(['Open in Flint · vault/milan-copy.ink','Open in Flint · vault/milan.ink']);
 expect(snapshots).not.toHaveBeenCalled();expect(discovery).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled();expect(native.location('milan')).toBeUndefined();
 snapshots.mockRestore();discovery.mockRestore();
 s.select('flint.document:milan');await s.choose();
 await wait(()=>expect(documentId(f.ports().find(p=>p.applicationId==='flint')!),s.state.error).toBe('milan'));
 expect(f.editor.windowManager!.registry.activeWindowId).toBe(f.ports().find(p=>p.applicationId==='flint')!.windowId());
 expect(native.location('copy')).toBeUndefined();expect(f.source.inlineContent).toHaveLength(0);
 expect(await fs.readFile(path.join(f.root,'vault/milan.ink'),'utf8')).toBe(f.bytes);
 f.editor.repository.undo();expect(f.source.inlineContent.map(k=>f.editor.node(k)?.payload.text).join('')).toBe('/flint open --doc Court of Milan');
},20000);
it('leaves unsupported or flag-disabled Flint syntax literal',async()=>{
 const f=await setup(true,{command:'/flint open --doc',enabled:false});
 expect(f.completion()?.session.state.rows??[]).toEqual([]);
 await f.completion()?.session.choose();
 expect(f.source.inlineContent.map(k=>f.editor.node(k)?.payload.text).join('')).toBe('/flint open --doc');
 expect(f.editor.windowManager!.registry.activeWindowId).toBe(f.dialectic.windowId());
},20000);

it('opens a loaded unsaved Document without a file read or save',async()=>{
 const f=await setup(true,{command:'/flint open --doc New conversation'}),id=documentId(f.dialectic);
 await wait(()=>expect(f.completion()?.session.state.rows.some(r=>r.id===`flint.document:${id}`)).toBe(true));
 f.fetcher.mockClear();const s=f.completion()!.session;s.select(`flint.document:${id}`);await s.choose();
 await wait(()=>expect(documentId(f.ports().find(p=>p.applicationId==='flint')!)).toBe(id));
 expect(f.fetcher).not.toHaveBeenCalled();expect(nativeDocumentSession(f.editor).location(id)).toBeUndefined();
 expect(f.source.inlineContent).toHaveLength(0);
},20000);
it('cancels a pending Document Open without admitting it or removing the command',async()=>{
 const f=await setup(true,{command:'/flint open --doc Court of Milan'});
 await wait(()=>expect(f.completion()?.session.state.rows.some(r=>r.id==='flint.document:milan')).toBe(true));
 const base=f.fetcher.getMockImplementation()!;let entered!:()=>void,release!:()=>void;
 const start=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
 f.fetcher.mockImplementation(async(url,init)=>{const response=await base(url,init);if(url==='/api/native/open'){entered();await gate;}return response;});
 const s=f.completion()!.session;s.select('flint.document:milan');const pending=s.choose();
 await start;s.close();release();await pending;
 expect(nativeDocumentSession(f.editor).location('milan')).toBeUndefined();
 expect(f.source.inlineContent.map(k=>f.editor.node(k)?.payload.text).join('')).toBe('/flint open --doc Court of Milan');
 expect(f.editor.windowManager!.registry.activeWindowId).toBe(f.dialectic.windowId());
},20000);
