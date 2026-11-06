import {isNativeDocumentName} from '../src/persistence/document-file-names.mjs';
/** Single-file, codec-preserving publication. Existing paired resources stay on their own route. */
import { constants as C, promises as fs } from './phext-fs.mjs';
import path from 'node:path';
import { hash, publishManagedFile, checkDisplacedFile, validateResourceDependencies } from '../src/persistence/managed-pair.mjs';
import { decodeNative } from '../src/persistence/native-resource';
import { encodeRecognizedDocument, recognizeCompatibleDocument } from '../src/persistence/compatible-document';
import { verifyDocumentSource } from './recognized-source.mjs';
const validId=s=>typeof s==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(s);
const sync=async p=>{const h=await fs.open(p,'r');try{await h.sync();}finally{await h.close();}};
async function write(p,bytes){let h;try{h=await fs.open(p,'wx',0o600);}catch(e){if(e.code!=='EEXIST')throw e;const old=await fs.open(p,C.O_RDONLY|C.O_NOFOLLOW);try{const st=await old.stat();if(!st.isFile()||st.nlink!==1||st.size>32*1024*1024||hash(await old.readFile())!==hash(bytes))throw Error('Journal retry bytes differ');return;}finally{await old.close();}}try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}}
export class RecognizedDocumentStore {
 constructor(store){this.store=store;}
 home(vault,id){return path.posix.join(vault,'.mutable','document-saves',hash(id));}
 async pending(vault,id){return this.store.read(this.home(vault,id)+'/pending.json',true).then(b=>b&&JSON.parse(b.toString()));}
 async directory(p){try{await fs.mkdir(await this.store.resolve(p,{missing:true}),{mode:0o700});await sync(await this.store.resolve(path.posix.dirname(p)));}catch(e){if(e.code!=='EEXIST')throw e;}return this.store.resolve(p);}
 async operations(vault){
  const p=path.posix.join(vault,'.mutable/document-saves');let entries;try{entries=await fs.readdir(await this.store.resolve(p),{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return [];throw e;}
  if(entries.length>10000)throw Error('Document journal inspection budget exceeded');
  const result=[];for(const entry of entries){if(!entry.isDirectory()||entry.isSymbolicLink()||!/^[a-f0-9]{64}$/.test(entry.name))throw Error('Invalid Document journal');const b=await this.store.read(p+'/'+entry.name+'/pending.json',true);if(b){const i=JSON.parse(b.toString());if(!validId(i.generation)||hash(i.resourceId)!==entry.name)throw Error('Invalid pending Document identity');result.push({resourceId:i.resourceId,generation:i.generation,path:i.path});}}
  return result;
 }
 async recover(vault,id,generation,started){
  const intent=await this.pending(vault,id);if(!intent||intent.generation!==generation||intent.resourceId!==id||!validId(generation))throw Error('Pending Document generation changed');
  const native=await this.store.read(this.home(vault,id)+'/'+generation+'/native');
  return this.save({vault,source:{resourceId:id,location:{folder:path.posix.dirname(intent.path),filename:path.posix.basename(intent.path)},byteHash:intent.expected.document},generation,native:native.toString(),format:intent.format,dependencies:intent.dependencies},started);
 }
 async save(input,started=()=>{}){return this.store.lock(async()=>{
  const {vault,source,generation,native,format}=input;
  if(!validId(generation)||typeof native!=='string'||Buffer.byteLength(native)>20*1024*1024)throw Error('Invalid Document generation');
  if(isNativeDocumentName(source.location.filename))throw Error('Enrolled native pairs require their paired Save route');
  const resource=decodeNative(new TextEncoder().encode(native));if(resource.resourceId!==source.resourceId)throw Error('Captured resource identity differs from source');
  if(input.dependencies!==undefined&&(!Array.isArray(input.dependencies)||input.dependencies.length>256))throw Error('Invalid dependency locations');
  const locations=new Map();for(const d of input.dependencies??[]){if(locations.has(d.resourceId))throw Error('Ambiguous dependency location');locations.set(d.resourceId,await this.store.resolve(path.posix.join(d.location.folder,d.location.filename)));}
  await validateResourceDependencies(native,source.resourceId,locations);
  const data=encodeRecognizedDocument(resource,format),desired=hash(data),relative=path.posix.join(source.location.folder,source.location.filename);
  if(Buffer.byteLength(data)>20*1024*1024)throw Error('Encoded Document exceeds the managed file budget');
  const pending=await this.pending(vault,source.resourceId);
  const home=this.home(vault,source.resourceId),record=home+'/'+generation;
  const old=await this.store.read(record+'/intent.json',true);
  if(pending&&pending.generation!==generation)throw Error('A different Document generation is pending; recover it first');
  let intent;
  if(old){intent=JSON.parse(old.toString());if(intent.documentHash!==desired||intent.path!==relative||intent.expected.document!==source.byteHash)throw Error('Retry differs from the original Document generation');}
  else {
   const verified=await verifyDocumentSource(this.store,vault,source);if(recognizeCompatibleDocument(verified.bytes).format!==format)throw Error('Save codec differs from the verified source; conversion requires a separate action');
   await this.directory(path.posix.join(vault,'.mutable','document-saves'));await this.directory(home);await this.directory(record);
   intent={version:1,resourceId:source.resourceId,generation,path:relative,format,dependencies:input.dependencies??[],documentHash:desired,expected:{document:source.byteHash}};
   started();
   await write(await this.store.resolve(record+'/native',{missing:true}),native);
   await write(await this.store.resolve(record+'/document',{missing:true}),data);
   await write(await this.store.resolve(record+'/intent.json',{missing:true}),JSON.stringify(intent));await sync(await this.store.resolve(record));
  }
  if(old)await verifyDocumentSource(this.store,vault,source,undefined,{desired});
  if(!pending&&!await this.store.read(record+'/complete.json',true)){await write(await this.store.resolve(home+'/pending.json',{missing:true}),JSON.stringify(intent));await sync(await this.store.resolve(home));}
  started();
  const adapter={root:await this.store.resolve(path.posix.dirname(relative)),home:await this.store.resolve(home),file:()=>path.join(this.store.root,relative),fault:this.store.fault};
  try{
   await this.store.guardReadPath(relative);
   await publishManagedFile(adapter,intent,'document',data);
   await validateResourceDependencies(native,source.resourceId,locations);
   await checkDisplacedFile(adapter,intent,'document');
   if(hash(await this.store.read(relative))!==desired)throw Error('Document changed at confirmation');
   if(!await this.store.read(record+'/complete.json',true))await write(await this.store.resolve(record+'/complete.json',{missing:true}),JSON.stringify({generation,byteHash:desired}));
   await sync(await this.store.resolve(record));
   if(await this.pending(vault,source.resourceId)){await fs.unlink(await this.store.resolve(home+'/pending.json'));await sync(await this.store.resolve(home));}
   return {phase:'saved',byteHash:desired,generation};
  }catch(e){return {phase:'pending',generation,error:String(e)};}
 });}
}
