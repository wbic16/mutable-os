import { afterEach, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { exportMarkdown } from '../src/persistence/markdown';
import { decodeNative } from '../src/persistence/native-resource';
const cleanup=[];afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();});
execFileSync(process.execPath,['scripts/build-history-worker.mjs']);
async function start(root,hold=''){
 const proc=spawn(process.execPath,['scripts/c1a-test-host.mjs'],{env:{...process.env,PROOF_ROOT:root,PROOF_HOLD:hold},stdio:['ignore','pipe','pipe']});
 cleanup.push(async()=>{if(proc.exitCode===null&&proc.signalCode===null){proc.kill('SIGKILL');await once(proc,'exit');}});
 let pending='',port,release;const held=new Promise(r=>release=r),ready=new Promise((resolve,reject)=>{proc.once('error',reject);proc.stderr.on('data',b=>reject(Error(b.toString())));proc.stdout.on('data',b=>{pending+=b;let i;while((i=pending.indexOf('\n'))>=0){const line=JSON.parse(pending.slice(0,i));pending=pending.slice(i+1);if(line.port){port=line.port;resolve();}if(line.held)release();}});});await ready;
 return {held,kill:async()=>{proc.kill('SIGKILL');await once(proc,'exit');},call:async(action,body)=>{const response=await fetch(`http://127.0.0.1:${port}/api/native/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,...await response.json()};}};
}
async function fixture(hold){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'flint-c1a-restart-'));cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));
 const native=await fs.readFile('artifacts/flint-b1.2/rich.mutable.json','utf8'),resource=decodeNative(new TextEncoder().encode(native)),projection=exportMarkdown(resource);
 const g={resourceId:resource.resourceId,generation:crypto.randomUUID(),native,markdown:projection.text,profile:projection.profile,targets:[]};
 const host=await start(root,hold),location={folder:'notes',filename:'paper.mutable.json'};
 const saved=await host.call('save',{location,generation:g,baseline:{nativeHash:null,markdownHash:null,generation:null}});expect(saved.Data.result.phase).toBe('saved');
 const q={operationId:crypto.randomUUID(),vault:'.',kind:'pair',source:'notes/paper.mutable.json',destination:'other/new.mutable.json',baselines:[{resourceId:g.resourceId,baseline:saved.Data.baseline}]};
 return {root,host,g,q,location};
}
it.each(['relocation-intent','relocation-after-0','relocation-after-1','relocation-after-2','relocation-receipt-displaced','relocation-before-complete','relocation-complete'])('recovers from actual SIGKILL at %s through real routes',async stage=>{
 const f=await fixture(stage);const request=f.host.call('vault/relocate',f.q).catch(()=>undefined);await f.host.held;await f.host.kill();await request;
 const resumed=await start(f.root);const recovered=await resumed.call('vault/recover',{operationId:f.q.operationId});expect(recovered.Data.phase).toBe('relocated');
 const binding=recovered.Data.bindings[0];expect(binding.baseline.generation).toBe(f.g.generation);
 const opened=await resumed.call('open',{location:binding.location});expect(opened.Data.native).toBe(f.g.native);expect(opened.Data.baseline).toEqual(binding.baseline);
 const stale=await resumed.call('save',{location:f.location,generation:{...f.g,generation:crypto.randomUUID()},baseline:f.q.baselines[0].baseline});expect(stale.status).toBe(409);
 const saved=await resumed.call('save',{location:binding.location,generation:{...f.g,generation:crypto.randomUUID()},baseline:binding.baseline});expect(saved.Data.result.phase).toBe('saved');
},15000);
it('recovers nonempty directory movement after server death and refuses external interference on recovery',async()=>{
 const f=await fixture('relocation-after-0');f.q.kind='directory';f.q.source='notes';f.q.destination='moved';
 const request=f.host.call('vault/relocate',f.q).catch(()=>undefined);await f.host.held;await f.host.kill();await request;
 // External interference: a write into the phext by another
 // opener while the server is dead (the disk era wrote a real
 // file into the moved folder).
 const {PhextVFS}=await import('../src/phext/vfs');const xvfs=PhextVFS.open(path.join(f.root,'cavern.phext'));xvfs.writeFile('/moved/paper.md','external after crash');xvfs.flush();xvfs.close();
 const resumed=await start(f.root);
 const conflict=await resumed.call('vault/recover',{operationId:f.q.operationId});expect(conflict.Data.phase).toBe('relocation-pending');
 {const {PhextVFS:P2}=await import('../src/phext/vfs');const rvfs=P2.open(path.join(f.root,'cavern.phext'));expect(rvfs.readFile('/moved/paper.md').toString('utf8')).toBe('external after crash');rvfs.close();}
 expect((await resumed.call('open',{location:{folder:'moved',filename:'paper.mutable.json'}})).status).toBe(409);
},15000);
it('serializes a concurrent Save against a pending relocation across server processes',async()=>{
 const f=await fixture('relocation-after-0'),other=await start(f.root);const request=f.host.call('vault/relocate',f.q).catch(()=>undefined);await f.host.held;
 expect((await other.call('save',{location:f.location,generation:f.g,baseline:f.q.baselines[0].baseline})).status).toBe(409);
 await f.host.kill();await request;
 // Recovery completes once both processes are gone and a fresh
 // server instance opens the Cavern: two live VFS instances on
 // one phext cohere by sequential handoff (flush-rebase), not by
 // concurrent service — a second process that keeps serving after
 // the first dies is outside the one-server-per-Cavern contract.
 await other.kill();
 const resumed=await start(f.root);
 expect((await resumed.call('vault/recover',{operationId:f.q.operationId})).Data.phase).toBe('relocated');
},15000);
it('finishes a directory move after actual server death and reopens its unchanged native identity',async()=>{
 const f=await fixture('relocation-after-0');f.q.kind='directory';f.q.source='notes';f.q.destination='moved';
 const pending=f.host.call('vault/relocate',f.q).catch(()=>undefined);await f.host.held;await f.host.kill();await pending;
 const resumed=await start(f.root),r=await resumed.call('vault/recover',{operationId:f.q.operationId});expect(r.Data.phase).toBe('relocated');expect(r.Data.bindings[0].baseline.generation).toBe(f.g.generation);
 const opened=await resumed.call('open',{location:{folder:'moved',filename:'paper.mutable.json'}});expect(opened.Data.resourceId).toBe(f.g.resourceId);expect(opened.Data.native).toBe(f.g.native);
 const scan=await resumed.call('vault/discover',{vault:'.'});expect(scan.Data.folders).toContain('moved');expect(scan.Data.folders).not.toContain('notes');
},15000);
