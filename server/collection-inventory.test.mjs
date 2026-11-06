import {it,expect,afterEach} from 'vitest';
import {promises as fs} from 'node:fs';import os from 'node:os';import path from 'node:path';
import {collectionInventory,guardCollectionCreate} from './collection-inventory.mjs';
import {NativeVaultStore} from './native-vault-store.mjs';
import {promises as vfs} from './phext-fs.mjs';
import {testCavern} from '../src/knowledge-sqlite/phext-test-cavern.mjs';
const cleanup=[];afterEach(async()=>{for(const item of cleanup.splice(0))typeof item==='function'?await item():await fs.rm(item,{recursive:true,force:true});});
async function fixture(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'collection-inventory-'));cleanup.push(root);const cavern=testCavern(root);cleanup.push(()=>cavern.close());return {root,vault:new NativeVaultStore({root})};}
it('inventories regular paths, ignores disk-only links and skips private trees',async()=>{const {root,vault}=await fixture();await vfs.mkdir(path.join(root,'nested'));await vfs.mkdir(path.join(root,'.private'));await vfs.writeFile(path.join(root,'nested','a.md'),'a');await fs.symlink(os.tmpdir(),path.join(root,'outside'));const entries=await collectionInventory(vault,'.');expect(entries.map(e=>e.path)).toEqual(['nested','nested/a.md']);expect(entries.at(-1).directory).toBe(false);}); // phext-only: links exist only on disk, where the inventory never looks
it('bounds inventory and obeys cancellation',async()=>{const {root,vault}=await fixture();const c=new AbortController();c.abort();await vfs.writeFile(path.join(root,'a'),'a');await expect(collectionInventory(vault,'.',c.signal)).rejects.toThrow();});
it('rejects case aliases, occupied destinations and permits only exact-byte recovery',async()=>{const {root}=await fixture();await vfs.writeFile(path.join(root,'Taken.ink'),'old');await expect(guardCollectionCreate(root,'taken.ink',undefined,{native:'new'})).rejects.toThrow(/collision/);await expect(guardCollectionCreate(root,'Taken.ink',Buffer.from('old'),{native:'new'})).rejects.toThrow(/no overwrite/);await expect(guardCollectionCreate(root,'Taken.ink',Buffer.from('old'),{native:'old'})).resolves.toBeUndefined();});
