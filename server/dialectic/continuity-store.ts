import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
const filesystem=()=>import(pathToFileURL(path.resolve('scripts/stage-c-gates/filesystem.mjs')).href);
type Directory={path:string;identity:{dev:string;ino:string}};
/** Coordination metadata only, published using the Cavern's existing pinned IO. */
export class ContinuityStore {
 private homePromise?:Promise<Directory>;
 constructor(private root:string){}
 private async directory(parent:Directory,name:string):Promise<Directory>{
  const fs=await filesystem();try{const s=await fs.atDirectory(parent,{kind:'stat',name});if(!s.directory)throw Error('Invalid continuity directory');return {path:path.join(parent.path,name),identity:s.identity};}
  catch(e){if((e as any).code!=='ENOENT')throw e;try{return await fs.createDirectory(parent,name);}catch(e){if((e as any).code!=='EEXIST')throw e;return this.directory(parent,name);}}
 }
 private home(){return this.homePromise??=(async()=>this.directory(await this.directory(await(await filesystem()).pinDirectory(this.root),'.mutable'),'dialectic-continuity'))();}
 async update<T>(binding:string,action:(value:any)=>Promise<{value:any;result:T}>|{value:any;result:T}):Promise<T>{
  if(!/^[a-f0-9]{64}$/.test(binding))throw Error('Invalid continuity binding');
  const fs=await filesystem(),dir=await this.home(),lockName=binding+'.lock';
  try{await fs.atDirectory(dir,{kind:'create',name:lockName,data:Buffer.alloc(0),maxBytes:0});}catch(e){if((e as any).code!=='EEXIST')throw e;}
  const s=await fs.atDirectory(dir,{kind:'stat',name:lockName}),lock=await fs.lockFile(dir,lockName,s.identity);
  try{
   const slots:any[]=[];
   for(let slot=0;slot<2;slot++){try{const file=await fs.atDirectory(dir,{kind:'read',name:binding+'.'+slot+'.json',maxBytes:65536},lock.fd),record=JSON.parse(file.data.toString());if(!Number.isSafeInteger(record.sequence)||record.sequence<1)throw Error('Invalid continuity journal');slots[slot]={...record,identity:file.identity};}catch(e){if((e as any).code!=='ENOENT')throw e;}}
   const latest=slots.filter(Boolean).sort((a,b)=>b.sequence-a.sequence)[0],value=latest?.value;
   const next=await action(value);
   if(next.value!==undefined){const sequence=(latest?.sequence??0)+1,slot=sequence%2,name=binding+'.'+slot+'.json',data=Buffer.from(JSON.stringify({sequence,value:next.value})),temp='pending-'+randomUUID();
    const staged=await fs.atDirectory(dir,{kind:'create',name:temp,data,maxBytes:65536},lock.fd);
    // Replace only the older slot. The last complete record remains available
    // if the process stops before immutable publication of the new head.
    if(slots[slot])await fs.atDirectory(dir,{kind:'unlink',name,expectedIdentity:slots[slot].identity},lock.fd);
    await fs.atDirectory(dir,{kind:'publish',name,source:temp,expectedIdentity:staged.identity},lock.fd);
    await fs.atDirectory(dir,{kind:'unlink',name:temp,expectedIdentity:staged.identity},lock.fd);
   }return next.result;
  }finally{await lock.close();}
 }
}
