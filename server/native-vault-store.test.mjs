// NativeVaultStore on the phext-only contract (cutover rewrite).
// The store's root is a registered Cavern; every vault path lives
// in cavern.phext through the phext-fs facade. Tests whose subject
// was a deleted disk mechanism — the native move helper binary,
// inode identity, open-handle late writes, symlink traversal,
// cross-device renames, chmod-blocked directories, lstat race
// spies — are deleted (5) or rewritten to their phext analogs
// (an "external" change is now a write through the same facade
// between store steps; there are no symlinks or inodes in a VFS).
import { afterEach, expect, it } from 'vitest';
import { promises as realFs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NativeVaultStore } from './native-vault-store.mjs';
import { promises as vfs } from './phext-fs.mjs';
import { ManagedPair, hash } from '../src/persistence/managed-pair.mjs';
import { decodeNative, nativeText } from '../src/persistence/native-resource';
import { exportMarkdown } from '../src/persistence/markdown';
import { testCavern } from '../src/knowledge-sqlite/phext-test-cavern.mjs';
const cleanup=[];afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();});
let activeCavern;
async function rmTree(abs){
 let entries;try{entries=await vfs.readdir(abs,{withFileTypes:true});}catch{return;}
 for(const e of entries){const child=path.join(abs,e.name);if(e.isDirectory())await rmTree(child);else await vfs.unlink(child).catch(()=>{});}
 // VFS directories are removed by unlink once empty (the gates
 // backend's rmdir does exactly this).
 try{activeCavern.vfs.unlink('/'+path.relative(activeCavern.root,abs).split(path.sep).join('/'));}catch{/* not empty or already gone */}
}
async function fixture(options={}) {
 const root=await realFs.mkdtemp(path.join(os.tmpdir(),'flint-c1a-'));cleanup.push(()=>realFs.rm(root,{recursive:true,force:true}));
 const cavern=testCavern(root);activeCavern={vfs:cavern.vfs,root};cleanup.push(()=>cavern.close());
 await vfs.mkdir(path.join(root,'vault'),{recursive:true});await vfs.mkdir(path.join(root,'vault','notes'),{recursive:true});await vfs.mkdir(path.join(root,'vault','other'),{recursive:true});
 const native=await realFs.readFile('artifacts/flint-b1.2/rich.mutable.json','utf8'),r=decodeNative(new TextEncoder().encode(native)),projection=exportMarkdown(r);
 const generation={resourceId:r.resourceId,generation:crypto.randomUUID(),native,markdown:projection.text,profile:projection.profile,targets:[]};
 const pair=new ManagedPair({root:path.join(root,'vault/notes'),resourceId:r.resourceId,nativeName:'paper.mutable.json',markdownName:'paper.md'});
 expect((await pair.save(generation)).phase).toBe('saved');
 const store=new NativeVaultStore({root,...options});
 const request=async(kind='pair',source='vault/notes/paper.mutable.json',destination='vault/other/renamed.mutable.json')=>{
  const scan=await store.discover('vault');return {operationId:crypto.randomUUID(),vault:'vault',kind,source,destination,baselines:scan.documents.filter(d=>kind==='pair'?`${d.location.folder}/${d.location.filename}`===source:d.location.folder===source||d.location.folder.startsWith(source+'/')).map(d=>({resourceId:d.resourceId,baseline:d.baseline}))};
 };
 return {root,store,pair,generation,request,read:p=>vfs.readFile(path.join(root,p),'utf8')};
}
it('discovers nested/empty directories, confirmed pairs and standalone Markdown without admitting Documents',async()=>{
 const f=await fixture();await vfs.mkdir(path.join(f.root,'vault/notes/empty'));await vfs.writeFile(path.join(f.root,'vault/loose.md'),'**import**');
 const s=await new NativeVaultStore({root:f.root}).discover('vault');expect(s.complete).toBe(true);expect(s.folders).toContain('vault/notes/empty');expect(s.documents).toHaveLength(1);expect(s.documents[0].resourceId).toBe(f.generation.resourceId);expect(s.markdown).toEqual(['vault/loose.md']);expect(s.other).toEqual([]);
});
it('moves an enrolled pair without changing bytes, identity or save generation; saves at new binding',async()=>{
 const f=await fixture(),q=await f.request(),intentBytes=await f.read(`vault/notes/.mutable-pair-${hash(f.generation.resourceId)}/${f.generation.generation}/intent.json`);
 const result=await f.store.relocate(q);expect(result.phase).toBe('relocated');expect(result.bindings[0].baseline.generation).toBe(f.generation.generation);
 expect(await f.read(q.destination)).toBe(f.generation.native);expect(await f.read('vault/other/renamed.md')).toBe(f.generation.markdown);
 expect(await f.read(`vault/other/.mutable-pair-${hash(f.generation.resourceId)}/${f.generation.generation}/intent.json`)).toBe(intentBytes);
 expect(await f.store.recover(q.operationId)).toEqual(result);expect((await f.store.discover('vault')).documents[0].state).toBe('paired');
 const p=new ManagedPair({root:path.join(f.root,'vault/other'),resourceId:f.generation.resourceId,nativeName:'renamed.mutable.json',markdownName:'renamed.md'});
 expect((await p.recover()).generation).toBe(f.generation.generation);expect((await p.save({...f.generation,generation:crypto.randomUUID()},undefined,result.bindings[0].baseline)).phase).toBe('saved');
});
it('renames a pair in the same directory while retaining every historical generation',async()=>{
 const f=await fixture(),q=await f.request('pair','vault/notes/paper.mutable.json','vault/notes/new.mutable.json');expect((await f.store.relocate(q)).phase).toBe('relocated');expect(await f.read(q.destination)).toBe(f.generation.native);expect((await f.store.discover('vault')).documents[0].state).toBe('paired');
});
it('moves a nonempty directory itself including unrelated files, empty directories and pair archives',async()=>{
 const f=await fixture();await vfs.mkdir(path.join(f.root,'vault/notes/empty'));await vfs.writeFile(path.join(f.root,'vault/notes/photo.bin'),'opaque');
 const q=await f.request('directory','vault/notes','vault/moved');expect((await f.store.relocate(q)).phase).toBe('relocated');
 expect(await f.read('vault/moved/photo.bin')).toBe('opaque');expect((await f.store.discover('vault')).folders).toContain('vault/moved/empty');
});
it('creates directories exclusively and never invents a membership file',async()=>{const f=await fixture();await f.store.mkdir('vault','vault/new');expect((await f.store.discover('vault')).folders).toContain('vault/new');await expect(f.store.mkdir('vault','vault/new')).rejects.toThrow('exists');});
it.each(['relocation-intent','relocation-after-0','relocation-after-1','relocation-after-2','relocation-receipt-displaced','relocation-receipt','relocation-before-complete','relocation-complete'])('recovers after %s without generating new content',async stage=>{
 const f=await fixture(),q=await f.request();f.store.fault=async s=>{if(s===stage)throw Error('interruption');};await f.store.relocate(q).catch(()=>{});
 const resumed=await new NativeVaultStore({root:f.root}).recover(q.operationId);expect(resumed.phase).toBe('relocated');expect(resumed.bindings[0].baseline.generation).toBe(f.generation.generation);expect(await f.read(q.destination)).toBe(f.generation.native);
});
it.each(['native','markdown','archive','directory','case'])('rejects %s collisions before journalling or changing source',async kind=>{
 const f=await fixture(),q=await f.request();const paths={native:q.destination,markdown:'vault/other/renamed.md',archive:`vault/other/.mutable-pair-${hash(f.generation.resourceId)}`,directory:q.destination,case:'vault/other/RENAMED.mutable.json'};
 if(kind==='archive'||kind==='directory')await vfs.mkdir(path.join(f.root,paths[kind]),{recursive:true});else await vfs.writeFile(path.join(f.root,paths[kind]),'outside');
 await expect(f.store.relocate(q)).rejects.toThrow(/exists|archive/);expect(await f.read(q.source)).toBe(f.generation.native);expect(await f.store.records()).toEqual([]);
});
it('rejects ambiguous duplicate IDs and malformed files rather than choosing a source',async()=>{
 const f=await fixture(),q=await f.request();await vfs.writeFile(path.join(f.root,'vault/duplicate.mutable.json'),f.generation.native);let s=await f.store.discover('vault');expect(s.complete).toBe(false);expect(s.documents.every(d=>d.state==='ambiguous')).toBe(true);await expect(f.store.relocate(q)).rejects.toThrow('ambiguous');
 await vfs.writeFile(path.join(f.root,'vault/bad.mutable.json'),'bad');expect((await f.store.discover('vault')).diagnostics.some(d=>d.path?.includes('bad'))).toBe(true);
});
it('does not adopt externally moved same-ID resources or claim same-stem Markdown',async()=>{
 const f=await fixture();await vfs.rename(path.join(f.root,'vault/notes/paper.mutable.json'),path.join(f.root,'vault/other/external.mutable.json'));await vfs.writeFile(path.join(f.root,'vault/other/external.md'),'unrelated');
 const d=(await f.store.discover('vault')).documents[0];expect(d.resourceId).toBe(f.generation.resourceId);expect(d.state).toBe('unenrolled');await expect(f.store.relocate(await f.request('pair','vault/other/external.mutable.json','vault/other/next.mutable.json'))).rejects.toThrow('Unenrolled');expect(await f.read('vault/other/external.md')).toBe('unrelated');
});
it.each(['../escape','/tmp/escape','vault/../escape'])('rejects confinement escape %s',async destination=>{const f=await fixture();await expect(f.store.relocate({...await f.request(),destination})).rejects.toThrow();});
it('rejects directory moves into themselves',async()=>{
 const f=await fixture(),q=await f.request();await expect(f.store.relocate({...q,kind:'directory',source:'vault/notes',destination:'vault/notes/child'})).rejects.toThrow('Invalid');
});
it('read-only discovery remains available but all mutation/recovery actions fail',async()=>{const f=await fixture();const s=new NativeVaultStore({root:f.root,readOnly:true});expect((await s.discover('vault')).readOnly).toBe(true);await expect(s.relocate(await f.request())).rejects.toMatchObject({status:403});await expect(s.mkdir('vault','vault/new')).rejects.toMatchObject({status:403});await expect(s.recover('unknown')).rejects.toMatchObject({status:403});});
it('requires exact caller baselines and blocks partially published pairs',async()=>{const f=await fixture(),q=await f.request();q.baselines[0].baseline.nativeHash='0'.repeat(64);await expect(f.store.relocate(q)).rejects.toThrow('stale');f.pair.fault=async s=>{if(s==='before-receipt')throw Error('hold');};await f.pair.save({...f.generation,generation:crypto.randomUUID()},undefined,(await f.store.discover('vault')).documents[0].baseline);await expect(f.store.relocate(await f.request())).rejects.toThrow(/pending|stale/);});
it('fences stale locations and rename-away-and-back even with identical content hashes',async()=>{
 const f=await fixture(),first=await f.request(),old=first.baselines[0].baseline;await f.store.relocate(first);
 await expect(f.store.guard(f.generation.resourceId,{folder:'vault/notes',filename:'paper.mutable.json'},old)).rejects.toThrow('location changed');
 const second=await f.request('pair',first.destination,first.source);expect((await f.store.relocate(second)).phase).toBe('relocated');await expect(f.store.guard(f.generation.resourceId,{folder:'vault/notes',filename:'paper.mutable.json'},old)).rejects.toThrow('baseline is stale');
});
it('does not overwrite an external file created in a destination between pair steps',async()=>{const f=await fixture(),q=await f.request();f.store.fault=async s=>{if(s==='relocation-after-0')await vfs.writeFile(path.join(f.root,'vault/other/renamed.md'),'EXTERNAL',{flag:'wx'});};expect((await f.store.relocate(q)).phase).toBe('relocation-pending');expect(await f.read('vault/other/renamed.md')).toBe('EXTERNAL');expect(await f.read('vault/notes/paper.md')).toBe(f.generation.markdown);});
it('rejects modified retry parameters; a failed publish stays pending with the source intact',async()=>{const f=await fixture(),q=await f.request();f.store.fault=async s=>{if(s==='relocation-publish-0')throw Error('publish interrupted');};expect((await f.store.relocate(q)).phase).toBe('relocation-pending');expect(await f.read(q.source)).toBe(f.generation.native);f.store.fault=undefined;await expect(f.store.relocate({...q,destination:'vault/other/different.mutable.json'})).rejects.toThrow('differs');});
it('move primitive refuses existing destinations and missing sources',async()=>{const f=await fixture();await vfs.mkdir(path.join(f.root,'vault/empty'));await vfs.mkdir(path.join(f.root,'vault/target'));await expect(f.store.move('vault/empty','vault/target')).rejects.toThrow('Exclusive');await expect(f.store.move('vault/missing','vault/new.md')).rejects.toThrow();expect(await f.read('vault/notes/paper.md')).toBe(f.generation.markdown);});
it('preserves an externally replaced source caught after preflight',async()=>{
 const f=await fixture(),q=await f.request();f.store.fault=async s=>{if(s==='relocation-publish-0'){await vfs.rename(path.join(f.root,q.source),path.join(f.root,'original-kept'));await vfs.writeFile(path.join(f.root,q.source),'NEW CONTENT');}};
 expect((await f.store.relocate(q)).phase).toBe('relocation-pending');expect(await f.read(q.destination)).toBe('NEW CONTENT');expect(await f.read('original-kept')).toBe(f.generation.native);
});
it('refuses a destination introduced after preflight',async()=>{
 const f=await fixture(),q=await f.request();f.store.fault=async s=>{if(s==='relocation-publish-0')await vfs.writeFile(path.join(f.root,q.destination),'WINNER',{flag:'wx'});};expect((await f.store.relocate(q)).phase).toBe('relocation-pending');expect(await f.read(q.destination)).toBe('WINNER');expect(await f.read(q.source)).toBe(f.generation.native);
});
it('external source deletion leaves an explicit pending conflict and never invents replacement content',async()=>{const f=await fixture(),q=await f.request();f.store.fault=async s=>{if(s==='relocation-before-0')await vfs.rename(path.join(f.root,q.source),path.join(f.root,'outside-kept'));};expect((await f.store.relocate(q)).phase).toBe('relocation-pending');await expect(vfs.stat(path.join(f.root,q.destination))).rejects.toThrow();expect(await f.read('outside-kept')).toBe(f.generation.native);});
it('rejects case-only and Unicode-normalization aliases explicitly',async()=>{const f=await fixture();await expect(f.store.relocate(await f.request('pair','vault/notes/paper.mutable.json','vault/notes/PAPER.mutable.json'))).rejects.toThrow('Case-only');await vfs.writeFile(path.join(f.root,'vault/other/é.md'),'outside');await expect(f.store.relocate(await f.request('pair','vault/notes/paper.mutable.json','vault/other/é.mutable.json'))).rejects.toThrow('alias');});
it('does not confirm a relocated owner whose required owned resource disappeared',async()=>{
 const f=await fixture();await vfs.mkdir(path.join(f.root,'vault/owned'));
 const native=await realFs.readFile('artifacts/flint-b1.2/a.mutable.json','utf8'),r=decodeNative(new TextEncoder().encode(native)),projection=exportMarkdown(r),b=path.join(f.root,'vault/b.mutable.json');await vfs.writeFile(b,await realFs.readFile('artifacts/flint-b1.2/b.mutable.json'));
 const p=new ManagedPair({root:path.join(f.root,'vault/owned'),resourceId:r.resourceId,nativeName:'a.mutable.json',markdownName:'a.md',locations:new Map([['resource-b',b]])});expect((await p.save({resourceId:r.resourceId,generation:crypto.randomUUID(),native,markdown:projection.text,profile:projection.profile})).phase).toBe('saved');
 const q=await f.request('pair','vault/owned/a.mutable.json','vault/other/a.mutable.json');f.store.fault=async s=>{if(s==='relocation-before-complete')await vfs.rename(b,path.join(f.root,'b-outside'));};const result=await f.store.relocate(q);expect(result.phase).toBe('relocation-pending');expect(result.error).toContain('Required owned resource unavailable');await expect(vfs.stat(path.join(f.root,'vault/b.md'))).rejects.toThrow();
});
it('moves an owner and owned resource as independent pairs without altering their generations or Markdown',async()=>{
 const f=await fixture();await vfs.mkdir(path.join(f.root,'vault/owned'));const saved=[];
 for(const name of ['b','a']){const native=await realFs.readFile(`artifacts/flint-b1.2/${name}.mutable.json`,'utf8'),r=decodeNative(new TextEncoder().encode(native)),projection=exportMarkdown(r),g={resourceId:r.resourceId,generation:crypto.randomUUID(),native,markdown:projection.text,profile:projection.profile};const pair=new ManagedPair({root:path.join(f.root,'vault/owned'),resourceId:r.resourceId,nativeName:name+'.mutable.json',markdownName:name+'.md',locations:new Map([['resource-b',path.join(f.root,'vault/owned/b.mutable.json')]])});expect((await pair.save(g)).phase).toBe('saved');saved.push({name,g});}
 const q=await f.request('directory','vault/owned','vault/relocated');const result=await f.store.relocate(q);expect(result.phase).toBe('relocated');expect(result.bindings).toHaveLength(2);
 for(const {name,g}of saved){expect(await f.read(`vault/relocated/${name}.mutable.json`)).toBe(g.native);expect(await f.read(`vault/relocated/${name}.md`)).toBe(g.markdown);expect(result.bindings.find(b=>b.resourceId===g.resourceId).baseline.generation).toBe(g.generation);}
});
it('discovery reports oversized native files as incomplete',async()=>{
 const f=await fixture();await vfs.writeFile(path.join(f.root,'vault/huge.mutable.json'),Buffer.alloc(20*1024*1024+1,0x61));expect((await f.store.discover('vault')).diagnostics.some(d=>d.path==='vault/huge.mutable.json')).toBe(true);
});
it('retains multiple immutable save generations through pair rename',async()=>{
 const f=await fixture(),next={...f.generation,generation:crypto.randomUUID()};expect((await f.pair.save(next,undefined,(await f.store.discover('vault')).documents[0].baseline)).phase).toBe('saved');
 const home=`.mutable-pair-${hash(f.generation.resourceId)}`,before=await Promise.all([f.generation,next].map(g=>f.read(`vault/notes/${home}/${g.generation}/intent.json`)));
 const q=await f.request();expect((await f.store.relocate(q)).phase).toBe('relocated');for(let n=0;n<2;n++)expect(await f.read(`vault/other/${home}/${[f.generation,next][n].generation}/intent.json`)).toBe(before[n]);
});
it('cancels a directory query without any storage or authored mutation',async()=>{const f=await fixture(),controller=new AbortController();controller.abort();await expect(f.store.discover('vault',{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});expect(await f.store.records()).toEqual([]);expect(await f.read('vault/notes/paper.mutable.json')).toBe(f.generation.native);});
it('never substitutes fresh filesystem signatures for the caller reviewed content hashes',async()=>{
 const f=await fixture(),q=await f.request(),changed=structuredClone(decodeNative(new TextEncoder().encode(f.generation.native)));const root=changed.contents[changed.placements[changed.rootPlacementKey].target.contentKey];root.payload.metadata={...root.payload.metadata,title:'External change after discovery'};const outside=nativeText(changed);
 f.store.fault=async stage=>{if(stage==='relocation-captured')await vfs.writeFile(path.join(f.root,q.source),outside);};await expect(f.store.relocate(q)).rejects.toThrow('reviewed relocation baseline');expect(await f.read(q.source)).toBe(outside);await expect(vfs.stat(path.join(f.root,q.destination))).rejects.toThrow();expect(await f.store.records()).toEqual([]);
});
it('relocates and recovers .ink and .ink.md together while preserving standalone Markdown',async()=>{
 const f=await fixture();await vfs.unlink(path.join(f.root,'vault/notes/paper.mutable.json'));await vfs.unlink(path.join(f.root,'vault/notes/paper.md'));await rmTree(f.pair.home);
 const pair=new ManagedPair({root:path.join(f.root,'vault/notes'),resourceId:f.generation.resourceId,nativeName:'paper.ink',markdownName:'paper.ink.md'});expect((await pair.save(f.generation)).phase).toBe('saved');
 await vfs.writeFile(path.join(f.root,'vault/notes/paper.md'),'original');await vfs.writeFile(path.join(f.root,'vault/other/renamed.md'),'destination source');
 const q=await f.request('pair','vault/notes/paper.ink','vault/other/renamed.ink');let once=true;f.store.fault=async stage=>{if(once&&stage==='relocation-after-0'){once=false;throw Error('restart');}};
 expect((await f.store.relocate(q)).phase).toBe('relocation-pending');expect((await new NativeVaultStore({root:f.root}).recover(q.operationId)).phase).toBe('relocated');
 expect(await f.read(q.destination)).toBe(f.generation.native);expect(await f.read('vault/other/renamed.ink.md')).toBe(f.generation.markdown);expect(await f.read('vault/notes/paper.md')).toBe('original');expect(await f.read('vault/other/renamed.md')).toBe('destination source');
 const scan=await f.store.discover('vault');expect(scan.complete).toBe(true);expect(scan.documents[0].state).toBe('paired');expect(scan.markdown).toEqual(['vault/notes/paper.md','vault/other/renamed.md']);
});
it('scope fencing is deterministic for an unchanged tree and changes with content',async()=>{
 const f=await fixture();await vfs.mkdir(path.join(f.root,'vault/notes/deep'));await vfs.writeFile(path.join(f.root,'vault/notes/deep/file.txt'),'source');
 const first=await f.store.readScopeFence('vault');expect(await f.store.readScopeFence('vault')).toBe(first);
 await vfs.writeFile(path.join(f.root,'vault/notes/deep/file.txt'),'changed');expect(await f.store.readScopeFence('vault')).not.toBe(first);
});
