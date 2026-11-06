import {promises as fs} from './phext-fs.mjs';
import path from 'node:path';
/** Bounded, read-only destination inventory. No symlink traversal or knowledge indexing. */
export async function collectionInventory(vault, folder, signal) {
 const base=await vault.resolve(folder);if(!(await fs.lstat(base)).isDirectory())throw Error('Choose a collection directory');
 const entries=[];let count=0;
 const walk=async (directory,relative,depth)=>{
  if(depth>32)throw Error('Collection directory depth limit');
  const dir=await fs.opendir(directory);
  for await(const e of dir){signal?.throwIfAborted();if(++count>5000)throw Error('Destination inventory limit: 5,000 entries; choose a smaller directory');
   if(e.name.startsWith('.'))continue;
   const name=relative?`${relative}/${e.name}`:e.name;
   // Non-regular entries still reserve their names; never open/traverse them.
   entries.push({path:name,directory:e.isDirectory()&&!e.isSymbolicLink()});
   if(e.isDirectory()&&!e.isSymbolicLink()){const next=await vault.resolve(path.posix.join(folder,name));await walk(next,name,depth+1);}
  }
 };
 await walk(base,'',0);return entries.sort((a,b)=>a.path.localeCompare(b.path));
}
export async function guardCollectionCreate(dir,filename,current,generation) {
 const names=await fs.readdir(dir),fold=s=>s.normalize('NFC').toLowerCase();
 if(names.some(name=>fold(name)===fold(filename)&&name!==filename))throw Error('Collection destination case/Unicode collision; review a new destination.');
 // Existing exact bytes are allowed only for idempotent retry. Never adopt/overwrite another save.
 if(current&&current.toString()!==generation.native)throw Error('Collection destination already exists or changed; no overwrite is permitted.');
}
