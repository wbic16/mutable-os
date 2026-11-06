import { afterEach, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NativeVaultStore } from './native-vault-store.mjs';
import { VaultListingCache } from './vault-listing-cache.mjs';
import { promises as vfs } from './phext-fs.mjs';
import { testCavern } from '../src/knowledge-sqlite/phext-test-cavern.mjs';
import { decodeDocument } from '../src/block-tree/codecs';
import { captureNative, nativeText, decodeNative } from '../src/persistence/native-resource';
import { hash } from '../src/persistence/managed-pair.mjs';
// Phext-only contract (cutover): the on-disk discovery cache is
// deleted. The VFS directory index is the listing source and every
// browse reconciles against it — results are never served from a
// persisted cache, no cache file is read or written anywhere, and
// the router has no discovery-cache flag. This suite replaces the
// disk-cache suite wholesale (14 tests; the warm-cache, no-reread
// and flag-parametrized tests tested removed mechanisms).
const cleanup=[];afterEach(async()=>{for(const item of cleanup.splice(0))typeof item==='function'?await item():await fs.rm(item,{recursive:true,force:true});});
const document=(id,title=id)=>nativeText(captureNative(decodeDocument({id,type:'document-block',metadata:{title},children:[{id:id+'-text',type:'standoff-editor-block',text:'A small document.'}]}).state,id));
async function fixture() {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vault-listing-'));cleanup.push(root);
 const cavern=testCavern(root);cleanup.push(()=>cavern.close());
 await vfs.mkdir(path.join(root,'notes'),{recursive:true});
 const inspect=vi.fn(async bytes=>{const r=decodeNative(bytes);return {byteHash:hash(bytes),inspection:{resourceId:r.resourceId,rootBlockId:r.resourceId,title:r.contents[r.placements[r.rootPlacementKey].target.contentKey].payload.metadata.title}};});
 const store=new NativeVaultStore({root,inspect}),cache=new VaultListingCache(store);
 const write=(p,text)=>vfs.writeFile(path.join(root,p),text);
 await write('notes/a.ink',document('a'));await write('notes/b.ink',document('b'));
 return {root,store,cache,inspect,write,file:path.join(root,'.mutable/discovery-cache.json')};
}
it('browses the VFS index: complete, never cached, and no cache file exists anywhere',async()=>{
 const f=await fixture(),listing=await f.cache.browse('.');
 expect(listing.complete).toBe(true);expect(listing.cached).toBe(false);
 expect(listing.documents.map(d=>d.title).sort()).toEqual(['a','b']);expect(listing.folders).toContain('notes');
 await expect(fs.stat(f.file)).rejects.toMatchObject({code:'ENOENT'});
 expect((await fs.readdir(f.root)).every(n=>n.startsWith('cavern.phext'))).toBe(true);
});
it('reflects added, changed, renamed and deleted files on the next browse',async()=>{
 const f=await fixture();await f.cache.browse('.');
 await f.write('notes/a.ink',document('a','New title'));await vfs.unlink(path.join(f.root,'notes/b.ink'));await vfs.mkdir(path.join(f.root,'empty'));await f.write('notes/c.ink',document('c'));
 const s=await f.cache.browse('.');expect(s.complete).toBe(true);expect(s.documents.map(d=>d.title)).toEqual(['New title','c']);expect(s.folders).toContain('empty');
 await vfs.rename(path.join(f.root,'notes/a.ink'),path.join(f.root,'empty/a.ink'));const renamed=await f.cache.browse('.');expect(renamed.documents.find(d=>d.resourceId==='a').location.folder).toBe('empty');expect(renamed.documents).toHaveLength(2);
});
it('detects same-size rewrites on the next browse',async()=>{
 const f=await fixture();await f.cache.browse('.');
 await f.write('notes/a.ink',document('a','z'));
 const s=await f.cache.browse('.');expect(s.documents.find(d=>d.resourceId==='a').title).toBe('z');
});
it('verify mode returns the same reconciled listing, still never cached',async()=>{
 const f=await fixture();const plain=await f.cache.browse('.');const verified=await f.cache.browse('.',{mode:'verify'});
 expect(verified.cached).toBe(false);expect(verified.documents).toEqual(plain.documents);
});
it('a planted legacy cache file is ignored, on disk and in the phext',async()=>{
 const f=await fixture();await f.cache.browse('.');
 await fs.mkdir(path.join(f.root,'.mutable'),{recursive:true});await fs.writeFile(f.file,'bad JSON');
 await vfs.writeFile(path.join(f.root,'.mutable/discovery-cache.json'.replace('/.mutable/','/.mutable/')),JSON.stringify({version:999,documents:[]})).catch(()=>{});
 const s=await f.cache.browse('.');expect(s.cached).toBe(false);expect(s.documents).toHaveLength(2);expect(s.complete).toBe(true);
});
it('reports duplicates as ambiguous and the listing as incomplete',async()=>{
 const f=await fixture();await f.write('duplicate.ink',await vfs.readFile(path.join(f.root,'notes/a.ink')));
 const s=await f.cache.browse('.');expect(s.complete).toBe(false);expect(s.documents.filter(d=>d.resourceId==='a')).toHaveLength(2);expect(s.documents.filter(d=>d.resourceId==='a').every(d=>d.state==='ambiguous')).toBe(true);
});
it('a document that fails inspection is diagnosed, not served stale',async()=>{
 const f=await fixture();await f.cache.browse('.');await f.write('notes/a.ink','broken document');
 const s=await f.cache.browse('.');expect(s.complete).toBe(false);expect(s.documents.map(d=>d.resourceId)).toEqual(['b']);expect(s.diagnostics.some(d=>d.path==='notes/a.ink')).toBe(true);
});
it('read-only mode browses the current listing and writes nothing',async()=>{
 const f=await fixture();const store=new NativeVaultStore({root:f.root,readOnly:true,inspect:f.inspect}),cache=new VaultListingCache(store);
 expect((await cache.browse('.')).readOnly).toBe(true);
 await f.write('notes/c.ink',document('c'));expect((await cache.browse('.')).documents).toHaveLength(3);
 await expect(fs.stat(f.file)).rejects.toMatchObject({code:'ENOENT'});
});
it('cancels reconciliation when the signal aborts',async()=>{
 const f=await fixture();const c=new AbortController();c.abort();
 await expect(f.cache.browse('.',{signal:c.signal})).rejects.toMatchObject({name:'AbortError'});
});
it('does not follow symlinks or accept escaping paths',async()=>{
 const f=await fixture();await fs.symlink(path.join(f.root,'notes/a.ink'),path.join(f.root,'linked.ink'));
 const s=await f.cache.browse('.');expect(s.complete).toBe(true);expect(s.documents).toHaveLength(2); // the disk link is invisible in the phext
 await expect(f.cache.browse('../elsewhere')).rejects.toThrow('Invalid');
});
it('rechecks files after inspection and never publishes a mixed generation',async()=>{
 const f=await fixture(),original=f.inspect.getMockImplementation();f.inspect.mockImplementation(async bytes=>{const result=await original(bytes);if(result.inspection.resourceId==='b')await f.write('notes/a.ink',document('a','changed concurrently'));return result;});
 const s=await f.cache.browse('.');expect(s.complete).toBe(false);expect(s.diagnostics.some(d=>d.message.includes('changed before discovery'))).toBe(true);
 await expect(fs.stat(f.file)).rejects.toMatchObject({code:'ENOENT'});
});
it('tracks pair metadata changes: an invalid pair receipt is diagnosed',async()=>{
 const f=await fixture();await f.cache.browse('.');const home=path.join(f.root,'notes',`.mutable-pair-${hash('a')}`);await vfs.mkdir(home,{recursive:true});
 await vfs.writeFile(path.join(home,'receipt.json'),'{"invalid":true}');const result=await f.cache.browse('.');
 expect(result.complete).toBe(false);expect(result.diagnostics.some(d=>d.path==='notes/a.ink')).toBe(true);
});
it('the browse route serves the reconciled listing and Open reads current bytes (no discovery flag)',async()=>{
 const {default:express}=await import('express');const {createNativeDocumentStoreRouter}=await import('./native-document-store.mjs');const f=await fixture();
 const app=express();app.use('/native',createNativeDocumentStoreRouter({root:f.root,nativeDiscoveryWorker:false}));const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const call=async(action,body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/native/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,...await response.json()};};
 try{
  const first=await call('vault/browse',{vault:'.'});expect(first.Data.cached).toBe(false);expect(first.Data.documents.map(d=>d.title).sort()).toEqual(['a','b']);
  await f.write('notes/a.ink',document('a','Changed since browse'));
  expect((await call('vault/browse',{vault:'.'})).Data.documents.find(d=>d.resourceId==='a').title).toBe('Changed since browse');
  const opened=await call('open',{location:{folder:'notes',filename:'a.ink'}});expect(opened.Success).toBe(true);expect(opened.Data.native).toContain('Changed since browse');
  await vfs.unlink(path.join(f.root,'notes/a.ink'));expect((await call('open',{location:{folder:'notes',filename:'a.ink'}})).status).toBe(404);
  await expect(fs.stat(f.file)).rejects.toMatchObject({code:'ENOENT'});
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
