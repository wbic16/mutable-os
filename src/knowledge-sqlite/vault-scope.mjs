/** Mutable establishment only. No catalog, file membership or ordinary-operation lock. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isMainThread } from 'node:worker_threads';
import { flockExclusiveSync } from './advisory-lock.mjs';
const require=createRequire(import.meta.url);
const exists=p=>{try{return fs.lstatSync(p);}catch(e){if(e.code==='ENOENT')return;throw e;}};
export function inspectVaultScope(vault,{maxEntries=100000,maxDepth=128,maxMs=5000,phextKnowledge=false}={}) {
 if(typeof vault!=='string'||!path.isAbsolute(vault))throw Error('Supply an absolute Vault directory');
 const stat=fs.lstatSync(vault);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Vault must be a real directory');
 const root=fs.realpathSync(vault),start=Date.now();let count=0;
 for(let dir=path.dirname(root);;dir=path.dirname(dir)){
  if(exists(path.join(dir,'.mutable')))throw Error(`Overlapping Vault: ancestor Mutable infrastructure at ${dir}`);
  // PhextVFS Phase 4: in phext knowledge mode the Cavern phext is
  // establishment infrastructure too, so it overlaps exactly like
  // .mutable does. Disk mode is untouched: a phext beside a disk
  // Cavern (documents strata) is not a knowledge conflict.
  if(phextKnowledge&&exists(path.join(dir,'cavern.phext')))throw Error(`Overlapping Vault: ancestor Mutable infrastructure at ${dir}`);
  if(dir===path.dirname(dir))break;
 }
 const home=path.join(root,'.mutable'),own=exists(home);
 if(own&&(!own.isDirectory()||own.isSymbolicLink()))throw Error('Invalid Mutable system directory: expected a real directory, not a symlink');
 const phextFile=phextKnowledge?exists(path.join(root,'cavern.phext')):undefined;
 if(phextFile&&(!phextFile.isFile()||phextFile.isSymbolicLink()))throw Error('Invalid Mutable system file: expected a regular phext file, not a symlink');
 const walk=(dir,depth)=>{
  if(depth>maxDepth||Date.now()-start>maxMs)throw Error('Vault overlap inspection incomplete: scan budget exceeded');
  const handle=fs.opendirSync(dir);
  try{for(let e;(e=handle.readSync());){
   if(++count>maxEntries||Date.now()-start>maxMs)throw Error('Vault overlap inspection incomplete: scan budget exceeded');
   const p=path.join(dir,e.name);
   if(e.name==='.mutable'){if(dir!==root)throw Error(`Overlapping Vault: descendant Mutable infrastructure at ${dir}`);continue;}
   if(phextKnowledge&&e.name==='cavern.phext'){if(dir!==root)throw Error(`Overlapping Vault: descendant Mutable infrastructure at ${dir}`);continue;}
   if(e.isSymbolicLink())throw Error(`Vault overlap inspection incomplete: symlink at ${p}`);
   if(e.isDirectory())walk(p,depth+1);
  }}finally{handle.closeSync();}
 };
 walk(root,0);
 // Never repair a partial existing home by manufacturing a new canonical database.
 // Phext mode tolerates exactly one relaxation: a .mutable documents home
 // with no mutable.db (the knowledge lives in the phext). A mutable.db
 // that IS present must still be a private regular file in both modes.
 if(own){const database=exists(path.join(home,'mutable.db'));if((database&&(!database.isFile()||database.isSymbolicLink()))||(!database&&!phextKnowledge))throw Error('Existing Mutable infrastructure has missing or invalid current database; expected a private regular file, restore current knowledge explicitly');}
 return {root,home,existing:!!(own||phextFile),entries:count};
}
export function lockVaultEstablishment(){
 if(!isMainThread)throw Error('The host must coordinate Vault establishment');
 // Purpose-specific, per-user coordination across server/CLI processes and managed roots.
 // Held only across scope inspection and database establishment/open; never ordinary reads/writes.
 const file=path.join(fs.realpathSync(os.tmpdir()),`mutable-vault-establishment-${process.getuid?.()??'user'}.lock`);
 const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_RDWR|fs.constants.O_NOFOLLOW,0o600);
 const stat=fs.fstatSync(fd);
 if(!stat.isFile()||stat.nlink!==1||(process.getuid&&stat.uid!==process.getuid())){fs.closeSync(fd);throw Error('Invalid Vault establishment coordinator');}
 // Only genuine contention (a live peer holds the lock) may report "in progress";
 // a missing native flock binding falls back to the portable token lock inside
 // flockExclusiveSync, and any other failure propagates with its real cause.
 let releaseLock;try{releaseLock=flockExclusiveSync(fd,`${file}.holder`);}catch(e){fs.closeSync(fd);if(e.code==='EWOULDBLOCK'||e.code==='EAGAIN')throw Object.assign(Error('Another Vault establishment is in progress; retry'),{code:'EWOULDBLOCK'});throw e;}
 let closed=false;return()=>{if(!closed){closed=true;try{releaseLock();}finally{fs.closeSync(fd);}}};
}
