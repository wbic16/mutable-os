// @vitest-environment node
import {it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {NativeVaultStore} from './native-vault-store.mjs';import {RecognizedDocumentStore} from './recognized-document-store.mjs';
import {recognizeCompatibleDocument} from '../src/persistence/compatible-document';import {nativeText} from '../src/persistence/native-resource';
import {hash} from '../src/persistence/managed-pair.mjs';import {openSqliteFoundation} from '../src/knowledge-sqlite/client.mjs';
import {promises as vfs} from './phext-fs.mjs';import {testCavern} from '../src/knowledge-sqlite/phext-test-cavern.mjs';
vi.setConfig({testTimeout:20000});
async function fixture(run:(f:any)=>Promise<void>,fault?:any){const root=await fs.mkdtemp(path.join(os.tmpdir(),'mutable-recognized-save-'));const cavern=testCavern(root);try{
 const bytes=await fs.readFile('data/edgar-allan-poe/poe-the-raven-[ba75c497].json');await vfs.writeFile(path.join(root,'raven.json'),bytes);
 const c=await openSqliteFoundation({vault:root,initialize:true});await c.close();
 const store=new NativeVaultStore({root,fault}),writer=new RecognizedDocumentStore(store),resource=recognizeCompatibleDocument(bytes).resource;
 const edited=JSON.parse(bytes.toString());edited.metadata={...edited.metadata,title:'Revised Raven'};
 const input={vault:'.',source:{resourceId:resource.resourceId,location:{folder:'.',filename:'raven.json'},byteHash:hash(bytes)},generation:randomUUID(),format:'legacy-block-tree',native:nativeText(recognizeCompatibleDocument(Buffer.from(JSON.stringify(edited))).resource)};
 await run({root,bytes,store,writer,input,resource});
}finally{cavern.close();await fs.rm(root,{recursive:true,force:true});}}
it('Raven saves in place, survives retry/restart, rejects stale clients and never creates Markdown',()=>fixture(async f=>{
 expect((await f.writer.save(f.input)).phase).toBe('saved');const saved=await vfs.readFile(path.join(f.root,'raven.json'));expect(JSON.parse(saved.toString()).metadata.title).toBe('Revised Raven');
 const restarted=new RecognizedDocumentStore(new NativeVaultStore({root:f.root}));expect((await restarted.save(f.input)).phase).toBe('saved');
 await expect(restarted.save({...f.input,generation:randomUUID()})).rejects.toThrow(/changed/);
 expect(recognizeCompatibleDocument(saved).resource.resourceId).toBe(f.resource.resourceId);expect((await vfs.readdir(f.root)).filter((n:string)=>!n.startsWith('.'))).toEqual(['raven.json']);
}));
it('displacement interruption exposes durable recovery after restart and preserves prior bytes',async()=>{let once=true;await fixture(async f=>{
 const result=await f.writer.save(f.input);expect(result.phase).toBe('pending');expect(await f.writer.operations('.')).toHaveLength(1);
 const restarted=new RecognizedDocumentStore(new NativeVaultStore({root:f.root}));expect((await restarted.recover('.',f.resource.resourceId,f.input.generation)).phase).toBe('saved');expect(await restarted.operations('.')).toEqual([]);
 const prior=path.join(f.root,restarted.home('.',f.resource.resourceId),f.input.generation,'document.previous');expect(await vfs.readFile(prior)).toEqual(f.bytes);
},async(stage:string)=>{if(once&&stage==='displaced-document'){once=false;throw Error('interrupt after displacement');}});});
it('external replacement during publication is preserved and cannot be confirmed or silently recovered',async()=>{let once=true;await fixture(async f=>{
 const result=await f.writer.save(f.input);expect(result.phase).toBe('pending');expect(await vfs.readFile(path.join(f.root,'raven.json'),'utf8')).toBe('external writer');
 await expect(f.writer.recover('.',f.resource.resourceId,f.input.generation)).rejects.toThrow();expect(await vfs.readFile(path.join(f.root,'raven.json'),'utf8')).toBe('external writer');
},async(stage:string,context:any)=>{if(once&&stage==='publish-document'){once=false;await vfs.writeFile(context.file,'external writer');}});});
it('duplicate identities and source format changes cannot authorize an in-place save',()=>fixture(async f=>{
 await vfs.writeFile(path.join(f.root,'copy.unusual'),await vfs.readFile(path.join(f.root,'raven.json')));await expect(f.writer.save(f.input)).rejects.toThrow(/ambiguous/);expect(await vfs.readFile(path.join(f.root,'raven.json'))).toEqual(f.bytes);
 await vfs.unlink(path.join(f.root,'copy.unusual'));await expect(f.writer.save({...f.input,format:'mutable-document'})).rejects.toThrow(/codec differs/);expect(await vfs.readFile(path.join(f.root,'raven.json'))).toEqual(f.bytes);
}));

it('positively anonymous historical content does not claim another Document identity; duplicate authored identities still do',()=>fixture(async f=>{
 const media=await fs.open(path.join(f.root,'media.unusual'),'w');try{await media.write(Buffer.from([0,0,0,24]));await media.truncate(21*1024*1024);}finally{await media.close();}
 await vfs.writeFile(path.join(f.root,'export.txt'),'Viewer\nText\n{"type":"document-block"}');
 await vfs.writeFile(path.join(f.root,'anonymous.json'),JSON.stringify({type:'document-block',children:[]}));
 expect((await f.writer.save(f.input)).phase).toBe('saved');
}));
it('an oversized JSON candidate remains unknown and cannot authorize a save',()=>fixture(async f=>{
 const padded=Buffer.alloc(21*1024*1024);Buffer.from('{"type":"document-block"').copy(padded);await vfs.writeFile(path.join(f.root,'document.mp4'),padded);
 await expect(f.writer.save(f.input)).rejects.toThrow(/document.mp4.*bounded/);
 expect(await vfs.readFile(path.join(f.root,'raven.json'))).toEqual(f.bytes);
}));
it('verifies Raven against the actual corpus without writing its files',async()=>{
 // Phext-only: verification runs inside a Cavern. The corpus
 // bytes are the repo's committed Raven document, carried into a
 // scratch Cavern unchanged; the original test read a
 // 'data/raven.json' path that was never committed.
 const {verifyDocumentSource}=await import('./recognized-source.mjs');const bytes=await fs.readFile('data/edgar-allan-poe/poe-the-raven-[ba75c497].json'),resource=recognizeCompatibleDocument(bytes).resource;
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mutable-recognized-corpus-'));const cavern=testCavern(root);try{
 await vfs.writeFile(path.join(root,'raven.json'),bytes);
 const store=new NativeVaultStore({root});await expect(verifyDocumentSource(store,'.',{resourceId:resource.resourceId,location:{folder:'.',filename:'raven.json'},byteHash:hash(bytes)})).resolves.toHaveProperty('bytes');
 expect(await vfs.readFile(path.join(root,'raven.json'))).toEqual(bytes);
 }finally{cavern.close();await fs.rm(root,{recursive:true,force:true});}
});
