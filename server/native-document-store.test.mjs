import { afterEach, expect, it } from 'vitest';
import express from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createNativeDocumentStoreRouter } from './native-document-store.mjs';
import { createDocumentStoreRouter } from './document-store';
import { createWorkspaceStoreRouter } from './workspace-store';
import { decodeNative, nativeText } from '../src/persistence/native-resource';
import { exportMarkdown } from '../src/persistence/markdown';
import { hash } from '../src/persistence/managed-pair.mjs';
import { promises as vfs } from './phext-fs.mjs';
import { testCavern } from '../src/knowledge-sqlite/phext-test-cavern.mjs';
const cleanup=[];afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();});
const absent={nativeHash:null,markdownHash:null,generation:null};
const nativeOnly = generation => ({resourceId:generation.resourceId,generation:generation.generation,native:generation.native});
async function fixture(options={}) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'flint-production-'));cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));const cavern=testCavern(root);cleanup.push(()=>cavern.close());await vfs.mkdir(path.join(root,'workspaces'),{recursive:true});
 let server,base;
 const start=async()=>{const app=express();app.use('/api/native',createNativeDocumentStoreRouter({root,...options}));app.use(express.json({limit:'32mb'}));app.use('/api',createDocumentStoreRouter({root,readOnly:options.readOnly}));app.use('/api',createWorkspaceStoreRouter({documentRoot:root,workspaceRoot:path.join(root,'workspaces'),readOnly:options.readOnly}));server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${server.address().port}/api`;};
 const stop=()=>new Promise(resolve=>server.close(resolve));await start();cleanup.push(stop);
 const call=async(name,body)=>{const response=await fetch(`${base}/${name}`,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);return {status:response.status,...await response.json()};};
 const generation=async(input='artifacts/flint-b1.2/rich.mutable.json',title)=>{let native=await fs.readFile(input,'utf8');if(title){const resource=structuredClone(decodeNative(new TextEncoder().encode(native)));const root=resource.contents[resource.placements[resource.rootPlacementKey].target.contentKey];root.payload.metadata={...root.payload.metadata,title};native=nativeText(resource);}
 const resource=decodeNative(new TextEncoder().encode(native)),projection=exportMarkdown(resource);return {resourceId:resource.resourceId,generation:crypto.randomUUID(),native,markdown:projection.text,profile:projection.profile,targets:[],diagnostics:projection.diagnostics};};
 const location={folder:'.',filename:'document.mutable.json'};
 const save=async(g,baseline=absent,extra={})=>call('native/save',{location,generation:g,baseline,...extra});
 return {root,call,generation,save,location,restart:async()=>{await stop();await start();}};
}
it('saves/reopens rich native bytes through actual routes and preserves identity across a file rename',async()=>{
 const f=await fixture(),g=await f.generation();const saved=await f.save(g);expect(saved.Data.result.phase).toBe('saved');
 const loaded=await f.call('native/open',{location:f.location});expect(loaded.Data.native).toBe(g.native);expect(loaded.Data.resourceId).toBe(g.resourceId);
 await vfs.rename(path.join(f.root,'document.mutable.json'),path.join(f.root,'renamed.mutable.json'));
 const renamed=await f.call('native/open',{location:{folder:'.',filename:'renamed.mutable.json'}});expect(renamed.status).toBe(409); // existing pair binding is explicit; no automatic relocation/adoption
 const standalone=await fixture();await vfs.writeFile(path.join(standalone.root,'renamed.mutable.json'),g.native);
 expect((await standalone.call('native/open',{location:{folder:'.',filename:'renamed.mutable.json'}})).Data.resourceId).toBe(g.resourceId);
});

it('converts legacy paired saves to JSON-only without touching changed Markdown',async()=>{
 const f=await fixture(),original=await f.generation(),first=(await f.save(original)).Data;
 await vfs.writeFile(path.join(f.root,'document.md'),'Independent edited Markdown');
 const next=nativeOnly(await f.generation(undefined,'JSON only'));
 const saved=await f.save(next,first.baseline);expect(saved.Data.result.phase).toBe('saved');
 expect(saved.Data.baseline.markdownHash).toBeNull();
 expect(await vfs.readFile(path.join(f.root,'document.md'),'utf8')).toBe('Independent edited Markdown');
 const scan=(await f.call('native/vault/discover',{vault:'.'})).Data;
 expect(scan.documents[0].state).toBe('paired');
 await f.restart();expect((await f.save(next,first.baseline)).Data.result.phase).toBe('saved');
 expect(await vfs.readFile(path.join(f.root,'document.md'),'utf8')).toBe('Independent edited Markdown');
});

it.each(['before-native','after-native','before-receipt','after-receipt'])('recovers a JSON-only save after %s without creating Markdown',async stage=>{
 let paused=true;
 const f=await fixture({fault:async at=>{if(paused&&at===stage)throw Error('interrupted');}}),g=nativeOnly(await f.generation());
 expect((await f.save(g)).Data.result.phase).not.toBe('saved');
 paused=false;await f.restart();expect((await f.save(g)).Data.result).toMatchObject({phase:'saved',generation:g.generation});
 expect(await vfs.readFile(path.join(f.root,'document.mutable.json'),'utf8')).toBe(g.native);
 expect(await fs.stat(path.join(f.root,'document.md')).catch(()=>null)).toBeNull();
 expect((await f.save(nativeOnly(await f.generation(undefined,'stale')),absent)).Data.result).toMatchObject({phase:'failed',conflict:true});
});
it('opens large native text verbatim and revalidates changed bytes on every Open',async()=>{
 const f=await fixture({readOnly:true}),wire=JSON.parse(await fs.readFile('artifacts/flint-b1.2/rich.mutable.json','utf8'));
 const paragraph=wire.document.blocks.find(b=>b.type==='standoff-editor-block');
 paragraph.inline=[{kind:'text',text:'A😀é漢\n'.repeat(6000)},{kind:'image',properties:{src:'image.png'}}];
 const native=JSON.stringify(wire),file=path.join(f.root,f.location.filename);await vfs.writeFile(file,native);
 const opened=await f.call('native/open',{location:f.location});
 expect(opened.status).toBe(200);expect(opened.Data.native).toBe(native);
 expect(opened.Data.resourceId).toBe(wire.resourceId);expect(opened.Data.baseline.nativeHash).toBe(hash(native));
 paragraph.inline[0].extra='invalid reserved field';await vfs.writeFile(file,JSON.stringify(wire));
 expect((await f.call('native/open',{location:f.location})).Success).toBe(false);
 delete paragraph.inline[0].extra;paragraph.inline[1].properties={externalDefinition:{format:'codex-external-definition-gate',version:99}};
 await vfs.writeFile(file,JSON.stringify(wire));expect((await f.call('native/open',{location:f.location})).Success).toBe(false);
 paragraph.inline=[{kind:'text',text:'Changed text'}];const changed=JSON.stringify(wire);await vfs.writeFile(file,changed);
 const reopened=await f.call('native/open',{location:f.location});expect(reopened.status).toBe(200);
 expect(reopened.Data.native).toBe(changed);expect(reopened.Data.baseline.nativeHash).toBe(hash(changed));
});
it('saves, lists and reopens .phosphor native pairs while excluding their Markdown projections',async()=>{
 const f=await fixture(),g=await f.generation();f.location.filename='screen.phosphor';
 const saved=await f.save(g);expect(saved.Data.result.phase).toBe('saved');
 expect(await vfs.readFile(path.join(f.root,'screen.phosphor'),'utf8')).toBe(g.native);
 expect(await vfs.readFile(path.join(f.root,'screen.phosphor.md'),'utf8')).toBe(g.markdown);
 expect((await f.call('native/list?folder=.')).Data.files).toEqual(['screen.phosphor']);
 expect((await f.call('listDocuments?folder=.')).files).toEqual(['screen.phosphor']);
 await f.restart();
 const opened=await f.call('native/open',{location:f.location});
 expect(opened.Data.native).toBe(g.native);expect(opened.Data.resourceId).toBe(g.resourceId);
 expect((await f.call('native/open',{location:{folder:'.',filename:'screen.phosphor.md'}})).status).toBe(400);
});
it('rejects a stale second editor even though the durable server receipt advanced',async()=>{
 const f=await fixture(),g=await f.generation();await f.save(g);const opened=(await f.call('native/open',{location:f.location})).Data;
 const newer=await f.generation(undefined,'Client one');expect((await f.save(newer,opened.baseline)).Data.result.phase).toBe('saved');
 const stale=await f.save(await f.generation(undefined,'Client two'),opened.baseline);expect(stale.Data.result).toMatchObject({phase:'failed',conflict:true});expect(await vfs.readFile(path.join(f.root,'document.mutable.json'),'utf8')).toBe(newer.native);
});
it('replays a lost-response request after router restart without refreshing the caller baseline',async()=>{
 const f=await fixture(),g=await f.generation();await f.save(g);await f.restart();expect((await f.save(g)).Data.result.phase).toBe('saved');
 const bad={...g,native:(await f.generation(undefined,'tamper')).native};expect((await f.save(bad)).status).toBe(409);
});
it('recovers a partial publication after restart and blocks conflicting partial Markdown',async()=>{
 let paused=true;const f=await fixture({fault:async stage=>{if(paused&&stage==='after-native')throw Error('simulated interruption');}}),g=await f.generation();
 expect((await f.save(g)).Data.result.phase).toBe('canonical-saved-markdown-pending');expect((await f.call('native/open',{location:f.location})).Data.pending.generation).toBe(g.generation);
 await f.restart();paused=false;expect((await f.save(g)).Data.result.phase).toBe('saved');
 const opened=(await f.call('native/open',{location:f.location})).Data;paused=true;const newer=await f.generation(undefined,'new');await f.save(newer,opened.baseline);
 await vfs.writeFile(path.join(f.root,'document.md'),'external partial edit');paused=false;
 const conflict=await f.save(newer,opened.baseline);expect(conflict.Data.result).toMatchObject({phase:'canonical-saved-markdown-pending',conflict:true});
 expect(await vfs.readFile(path.join(f.root,'document.md'),'utf8').catch(()=>'' ) || (await vfs.readFile(path.join(f.root,`.mutable-pair-${hash(g.resourceId)}`,newer.generation,'markdown.previous'),'utf8'))).toBe('external partial edit');
});
it('uses native authority even with newer Markdown and exposes Markdown only as import text',async()=>{
 const f=await fixture(),g=await f.generation();await f.save(g);await vfs.writeFile(path.join(f.root,'document.md'),'**outside**');
 const opened=await f.call('native/open',{location:f.location});expect(opened.Data.native).toBe(g.native);
 expect((await f.call('native/open',{location:{folder:'.',filename:'document.md'}})).Data).toMatchObject({kind:'markdown',text:'**outside**'});
 const result=await f.save(await f.generation(undefined,'edit'),opened.Data.baseline); // baseline observed divergent Markdown is not permission to overwrite without Compare
 expect(result.Data.result.phase).toBe('failed');
});
it('Compare / Keep Mutable requires an exact reviewed external hash and preserves the displaced bytes',async()=>{
 const f=await fixture(),g=await f.generation();const first=(await f.save(g)).Data;await vfs.writeFile(path.join(f.root,'document.md'),'external');
 const compared=(await f.call('native/compare',{location:f.location,resourceId:g.resourceId})).Data;
 const next=await f.generation(undefined,'next');expect((await f.save(next,first.baseline,{acceptMarkdownHash:compared.externalHash})).Data.result.phase).toBe('saved');
 expect(await vfs.readFile(path.join(f.root,`.mutable-pair-${hash(g.resourceId)}`,next.generation,'markdown.previous'),'utf8')).toBe('external');
});
it('requires located owned native dependencies and never generates descendant Markdown',async()=>{
 const f=await fixture(),a=await f.generation('artifacts/flint-b1.2/a.mutable.json');expect((await f.save(a)).Data.result.phase).toBe('failed');
 await vfs.writeFile(path.join(f.root,'b.mutable.json'),await fs.readFile('artifacts/flint-b1.2/b.mutable.json'));
 expect((await f.save(a,absent,{dependencies:[{resourceId:'resource-b',location:{folder:'.',filename:'b.mutable.json'}}]})).Data.result.phase).toBe('saved');
 expect(await vfs.stat(path.join(f.root,'b.md')).catch(()=>null)).toBeNull();
});
it('rejects read-only saves/recovery, path escapes, symlinks, projection tampering and missing baselines',async()=>{
 const f=await fixture({readOnly:true}),g=await f.generation();expect((await f.save(g)).status).toBe(403);expect((await f.call('native/recover',{})).status).toBe(403);
 const writable=await fixture();expect((await writable.call('native/open',{location:{folder:'..',filename:'x.mutable.json'}})).status).toBe(400);
 await vfs.writeFile(path.join(writable.root,'original.mutable.json'),g.native);await fs.symlink('original.mutable.json',path.join(writable.root,'link.mutable.json'));
 // Phext-only: a symlink on the real disk inside a Cavern folder
 // is invisible to the store — the name does not exist in the
 // phext, and the disk target's bytes are never served.
 expect((await writable.call('native/open',{location:{folder:'.',filename:'link.mutable.json'}})).Success).toBe(false);
 expect((await writable.save({...g,markdown:'different generation'})).status).toBe(409);
 expect((await writable.call('native/save',{location:writable.location,generation:g})).status).toBe(400);
});
it('rejects legacy Document/Workspace bypasses while preserving ordinary legacy saves',async()=>{
 const f=await fixture(),document={id:'legacy',type:'document-block',children:[]};
 expect((await f.call('saveDocumentJson',{folder:'.',filename:'legacy.json',document})).Success).toBe(true);
 expect((await f.call('saveDocumentJson',{folder:'.',filename:'document.mutable.json',document})).status).toBe(409);
 const source={kind:'document-store',...f.location};
 const workspace={kind:'speedy-workspace',schemaVersion:1,workspaceId:'w',documents:{legacy:{documentId:'legacy',source}},root:{type:'workspace-block',children:[{type:'document-reference-block',metadata:{documentId:'legacy'}}]}};
 const response=await f.call('saveWorkspaceBundle',{filename:'test.json',workspace,documents:[{documentId:'legacy',source,document,contentHash:'irrelevant'}]});expect(response.status).toBe(409);expect(response.Code).toBe('native-resource-guard');
});
it('never lets another resource claim a destination even with its current byte hash',async()=>{
 const f=await fixture(),one=await f.generation(),other=await f.generation('artifacts/flint-b1.2/b.mutable.json');
 await vfs.writeFile(path.join(f.root,'document.mutable.json'),one.native);
 const response=await f.save(other,{nativeHash:hash(one.native),markdownHash:null,generation:null});expect(response.status).toBe(409);expect(response.Error).toContain('Another resource');
 expect(await vfs.readFile(path.join(f.root,'document.mutable.json'),'utf8')).toBe(one.native);
});
it('rejects Keep Mutable when external Markdown changes again after Compare',async()=>{
 const f=await fixture(),g=await f.generation(),first=(await f.save(g)).Data;
 await vfs.writeFile(path.join(f.root,'document.md'),'first external');const compared=(await f.call('native/compare',{location:f.location,resourceId:g.resourceId})).Data;
 await vfs.writeFile(path.join(f.root,'document.md'),'second external');
 expect((await f.save(await f.generation(undefined,'updated'),first.baseline,{acceptMarkdownHash:compared.externalHash})).Data.result).toMatchObject({phase:'failed',conflict:true});
 expect(await vfs.readFile(path.join(f.root,'document.md'),'utf8')).toBe('second external');
});
it('never attaches a newer file baseline to older bytes returned by Open',async()=>{
 let replacement;const f=await fixture({fault:async(stage,{file}={})=>{if(stage==='open-native-read'&&replacement)await vfs.writeFile(file,replacement);}});
 const first=await f.generation();await f.save(first);replacement=(await f.generation(undefined,'concurrent writer')).native;
 const opened=await f.call('native/open',{location:f.location});expect(opened.status).toBe(409);expect(opened.Error).toContain('changed while opening');
});
it('recognizes content independently of suffix with no enrollment, source rewrite or generated sidecar',async()=>{
 // The repo's committed Raven legacy block tree (the original
 // 'data/raven.json' path was never committed).
 const f=await fixture({readOnly:true}),legacy=await fs.readFile('data/edgar-allan-poe/poe-the-raven-[ba75c497].json','utf8'),g=await f.generation();
 for(const [filename,text,format]of [['raven.json',legacy,'legacy-block-tree'],['raven.unusual',legacy,'legacy-block-tree'],['native.json',g.native,'mutable-document'],['native.unusual',g.native,'mutable-document']]){
  await vfs.writeFile(path.join(f.root,filename),text);
  const r=await f.call('native/recognize',{location:{folder:'.',filename}});expect(r.status).toBe(200);expect(r.Data.format).toBe(format);expect(r.Data.saveCapability).toBe('in-place');expect(r.Data.readOnly).toBe(true);expect(r.Data.text).toBe(text);expect(r.Data.byteHash).toBe(hash(text));
 }
 expect((await vfs.readdir(f.root)).sort()).toEqual(['native.json','native.unusual','raven.json','raven.unusual','workspaces']);
});
it('rejects unsupported content, invented identity, native-pair bypass, traversal and symlinks during compatibility Open',async()=>{
 const f=await fixture(),location=filename=>({folder:'.',filename});
 for(const [filename,text]of [['bad.json','{broken'],['unknown.json',JSON.stringify({format:'mutable-document',version:99})],['workspace.desktop',JSON.stringify({id:'w',type:'workspace-block'})],['missing.json',JSON.stringify({type:'document-block',children:[]})],['duplicate.json',JSON.stringify({id:'a',type:'document-block',children:[{id:'a',type:'standoff-editor-block',text:'a'}]})]]){
  await vfs.writeFile(path.join(f.root,filename),text);expect((await f.call('native/recognize',{location:location(filename)})).status).toBe(400);
 }
 expect((await f.call('native/recognize',{location:location('native.mutable.json')})).Error).toContain('native Open');
 expect((await f.call('native/recognize',{location:{folder:'..',filename:'outside.json'}})).status).toBe(400);
 await fs.symlink(path.join(f.root,'bad.json'),path.join(f.root,'link.json'));expect((await f.call('native/recognize',{location:location('link.json')})).Success).toBe(false); // disk symlinks are never followed into a Cavern
});

it('publishes .ink with .ink.md, protects original Markdown and excludes projections from Open/import',async()=>{
 const f=await fixture(),g=await f.generation(),location={folder:'.',filename:'document.ink'};
 await vfs.writeFile(path.join(f.root,'document.md'),'independent Markdown');
 const saved=await f.call('native/save',{location,generation:g,baseline:absent});expect(saved.Data.result.phase).toBe('saved');
 expect(await vfs.readFile(path.join(f.root,'document.ink.md'),'utf8')).toBe(g.markdown);expect(await vfs.readFile(path.join(f.root,'document.md'),'utf8')).toBe('independent Markdown');
 await f.restart();expect((await f.call('native/open',{location})).Data.native).toBe(g.native);
 expect((await f.call('native/open',{location:{folder:'.',filename:'document.ink.md'}})).status).toBe(400);
 expect((await f.call('native/recognize',{location:{folder:'.',filename:'document.ink.md'}})).status).toBe(400);
 const scan=(await f.call('native/vault/discover',{vault:'.'})).Data;expect(scan.markdown).toEqual(['document.md']);expect(scan.other).not.toContain('document.ink.md');
});

it.each(['complete','interrupted'])('explicit first-save overwrite preserves prior bytes and can recover (%s)',async mode=>{
 let interrupt=mode==='interrupted';
 const f=await fixture({fault:async stage=>{if(interrupt&&stage==='after-native')throw Error('interrupted overwrite');}});
 const old=nativeOnly(await f.generation()),next=nativeOnly(await f.generation('artifacts/flint-b1.2/b.mutable.json'));
 await vfs.writeFile(path.join(f.root,f.location.filename),old.native);
 const overwrite={resourceId:old.resourceId,nativeHash:hash(old.native)};
 const result=await f.save(next,absent,{overwrite});expect(result.Data.result.phase).toBe(interrupt?'confirmation-pending':'saved');
 expect(await vfs.readFile(path.join(f.root,`.mutable-pair-${hash(next.resourceId)}`,next.generation,'native.previous'),'utf8')).toBe(old.native);
 interrupt=false;await f.restart();expect((await f.save(next,absent,{overwrite})).Data.result.phase).toBe('saved');
 const loaded=(await f.call('native/open',{location:f.location})).Data;expect(loaded.resourceId).toBe(next.resourceId);expect(loaded.native).toBe(next.native);
 expect((await f.save({...old,generation:crypto.randomUUID()},absent)).status).toBe(409);
});
it('rejects stale overwrite confirmation and an existing pending Save without changing its bytes',async()=>{
 let interrupt=false;const f=await fixture({fault:async stage=>{if(interrupt&&stage==='after-native')throw Error('pending original');}});
 const old=nativeOnly(await f.generation()),next=nativeOnly(await f.generation('artifacts/flint-b1.2/b.mutable.json'));
 await vfs.writeFile(path.join(f.root,f.location.filename),old.native+'\n');
 expect((await f.save(next,absent,{overwrite:{resourceId:old.resourceId,nativeHash:hash(old.native)}})).status).toBe(409);
 expect(await vfs.readFile(path.join(f.root,f.location.filename),'utf8')).toBe(old.native+'\n');
 await vfs.unlink(path.join(f.root,f.location.filename));interrupt=true;await f.save(old);interrupt=false;
 expect((await f.save(next,absent,{overwrite:{resourceId:old.resourceId,nativeHash:hash(old.native)}})).Error).toContain('pending Save');
 expect(await vfs.readFile(path.join(f.root,f.location.filename),'utf8')).toBe(old.native);
});
