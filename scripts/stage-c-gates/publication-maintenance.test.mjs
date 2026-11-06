import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,symlink,writeFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {pinDirectory,createDirectory,atDirectory,closeFilesystemWorkers} from './filesystem.mjs';
import {promises as vfs} from '../../server/phext-fs.mjs';
import {testCavern} from '../../src/knowledge-sqlite/phext-test-cavern.mjs';
test('publication pruning removes only an empty directory with its reviewed identity',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'publication-prune-'));const cavern=testCavern(root);
 try{
  const parent=await pinDirectory(root),child=await createDirectory(parent,'child');
  await assert.rejects(atDirectory(parent,{kind:'rmdir',name:'child',expectedIdentity:{dev:'0',ino:'0'}}),/identity/);
  await vfs.writeFile(path.join(root,'child','kept'),'original');
  await assert.rejects(atDirectory(parent,{kind:'rmdir',name:'child',expectedIdentity:child.identity}),/not empty/);
  const stat=await atDirectory(child,{kind:'stat',name:'kept'});await atDirectory(child,{kind:'unlink',name:'kept',expectedIdentity:stat.identity});
  await atDirectory(parent,{kind:'rmdir',name:'child',expectedIdentity:child.identity});
  await assert.rejects(atDirectory(parent,{kind:'stat',name:'child'}),{code:'ENOENT'});
 }finally{cavern.close();await closeFilesystemWorkers();await rm(root,{recursive:true,force:true});}
});
test('publication pruning refuses a symlink in place of the reviewed directory',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'publication-prune-link-'));const cavern=testCavern(root);
 try{const parent=await pinDirectory(root),outside=await createDirectory(parent,'outside');await symlink('outside',path.join(root,'link'));await assert.rejects(atDirectory(parent,{kind:'rmdir',name:'link',expectedIdentity:outside.identity}));assert.equal((await atDirectory(parent,{kind:'stat',name:'outside'})).directory,true);}
 finally{cavern.close();await closeFilesystemWorkers();await rm(root,{recursive:true,force:true});}
});
