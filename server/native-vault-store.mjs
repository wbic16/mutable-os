import {isNativeDocumentName,markdownProjectionName,isDerivedMarkdownName} from '../src/persistence/document-file-names.mjs';
import { RecognizedDocumentStore } from './recognized-document-store.mjs';
/** C1a: tree-derived discovery and journalled, same-vault storage relocation.
 * No authored hierarchy, editor, save generation or global resource catalog. */
import { constants as C, realpathSync, lstatSync } from 'node:fs';
import { promises as fs, phextFsBackendFor } from './phext-fs.mjs';
import path from 'node:path';
import { ManagedPair, hash, nativeFlock } from '../src/persistence/managed-pair.mjs';
import { nativeKnowledgeJobs } from './native-knowledge-jobs';
import { decodeNative } from '../src/persistence/native-resource';
const MAX=20*1024*1024, LIMIT=10000;
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status,conflict:status===409});};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const alias=s=>s.normalize('NFC').toLocaleLowerCase('en-US');
const inside=(base,p)=>base==='.'||p===base||p.startsWith(base+'/');
const relative=p=>{if(typeof p!=='string'||!p||path.isAbsolute(p)||/[\\\0]/.test(p)||p.split('/').some(c=>!c||c==='..'||c==='.'&&p!=='.'))fail('Invalid managed relative path',400);return p;};
const join=(a,b)=>!a||a==='.'?b:a+'/'+b;
const location=p=>({folder:path.posix.dirname(p),filename:path.posix.basename(p)});
const filename=l=>{if(!l||typeof l.folder!=='string'||typeof l.filename!=='string'||l.filename.includes('/')||!isNativeDocumentName(l.filename))fail('Invalid native location',400);return relative(join(l.folder,l.filename));};
const operationId=id=>{if(typeof id!=='string'||! /^[a-zA-Z0-9-]{1,100}$/.test(id))fail('Invalid relocation operation ID',400);return id;};
const absent=async p=>{try{await fs.lstat(p);return false;}catch(e){if(e.code==='ENOENT')return true;throw e;}};
const sharedDiscovery = new Map();
export class NativeVaultStore {
 constructor({root,readOnly=false,fault=async()=>{},inspect,nativeDiscoveryWorker=true}={}) {
  this.root=path.resolve(root);
  try {if(lstatSync(root).isSymbolicLink())fail('Unsafe managed root',400);this.root=realpathSync(root);}catch(e){if(e.code!=='ENOENT')throw e;}
  this.readOnly=readOnly;this.fault=fault;this.shareDiscovery=!inspect&&nativeDiscoveryWorker;
  // Internal rollback/test seam only; no request can choose a weaker inspector.
  this.inspect=inspect??(nativeDiscoveryWorker?((bytes,signal)=>nativeKnowledgeJobs.run('inspect',bytes,{signal})):async bytes=>{
   const r=decodeNative(bytes),root=r.contents[r.placements[r.rootPlacementKey].target.contentKey];
   return {inspection:{resourceId:r.resourceId,rootBlockId:String(root.payload.id),title:String(root?.payload.metadata?.title??'')},byteHash:hash(bytes)};
  });
 }
 writable(){if(this.readOnly)fail('Server Documents are read-only',403);}
 async resolve(p,{missing=false}={}) {
  relative(p);const root=await fs.lstat(this.root);if(root.isSymbolicLink()||!root.isDirectory())fail('Unsafe managed root',400);
  let current=this.root;const pieces=p==='.'?[]:p.split('/');
  for(let i=0;i<pieces.length;i++) {current=path.join(current,pieces[i]);let st;try{st=await fs.lstat(current);}catch(e){if(e.code==='ENOENT'&&missing&&i===pieces.length-1)return current;throw e;}
   if(st.isSymbolicLink()||i<pieces.length-1&&!st.isDirectory())fail('Symlink or invalid managed parent',400);
  }return current;
 }
 async read(p,optional=false) {
  let file;try{file=await this.resolve(p);}catch(e){if(optional&&e.code==='ENOENT')return;throw e;}
  let h;try{h=await fs.open(file,C.O_RDONLY|C.O_NOFOLLOW);const s=await h.stat();if(!s.isFile()||s.size>MAX)fail('Expected bounded regular file',400);return await h.readFile();}
  catch(e){if(optional&&e.code==='ENOENT')return;throw e;}finally{await h?.close();}
 }
 async stamp(p,kind='file') {
  const resolved=await this.resolve(p);
  // Phext-only: the vault root itself is the backend's mount point,
  // so a real lstat measures container mechanics (the phext file's
  // rename-swap flush, anchor files appearing on first lock use) —
  // not vault content. Use the virtual root's own stat, whose fields
  // derive from the VFS listing, exactly like every other directory
  // in the Cavern.
  const backend=phextFsBackendFor(resolved);
  if(backend&&path.resolve(resolved)===path.resolve(this.root)){
   const s=backend.statFor('/',{bigint:true});
   if(kind!=='directory')fail('Expected bounded regular file',400);
   return [s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
  }
  const s=await fs.lstat(resolved,{bigint:true});
  if(s.isSymbolicLink()||(kind==='directory'?!s.isDirectory():!s.isFile()||s.size>BigInt(MAX)))fail('Expected bounded regular file',400);
  return [s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
 }
 /** Read-only discovery fence, not an identity index. Includes pair/relocation
  * metadata and directory entries so a new duplicate or operation expires it.
  * ctime/inode evidence prevents mtime restoration from blessing changed bytes. */
 async readScopeFence(vault,signal) {
  relative(vault);let count=0,active=0;const waiting=[];
  // Check each parent when entering its subtree and again before returning it.
  // This retains all file/directory evidence without rewalking the same parents
  // for every sibling. Replacement/rename/symlink races fail closed. Independent
  // reads overlap, and child results retain the exact sorted sequential fence.
  const bounded=async action=>{
   if(active<16)active++;else await new Promise(resolve=>waiting.push(resolve));
   try{signal?.throwIfAborted();return await action();}
   finally{const next=waiting.shift();if(next)next();else active--;}
  };
  const initialRoot=await this.resolve(vault);
  const ancestors=[];if(vault!=='.'){let prefix='.';for(const piece of vault.split('/')){await this.resolve(prefix);ancestors.push({prefix,stamp:await this.stamp(prefix,'directory')});prefix=join(prefix,piece);}}
  const rootBackend=phextFsBackendFor(initialRoot);
  // Phext-backed directories: the facade's directory stamp derives
  // from the immediate listing hash, which moves when INFRASTRUCTURE
  // entries (.mutable, .control, pair homes, lock files) appear —
  // mechanics, not content. A directory therefore contributes its
  // identity only; every content change still surfaces as a child
  // row appearing, disappearing, or changing its content stamp.
  // Real (unregistered) roots keep the full timestamp evidence.
  const evidence=(p,s)=>rootBackend&&s.isDirectory()?[p,String(s.dev),String(s.ino),'d']:[p,String(s.dev),String(s.ino),String(s.size),String(s.mtimeNs),String(s.ctimeNs)];
  // Phext-only: for the vault root of a phext-backed store, stat the
  // VIRTUAL root (see stamp()) — the real directory's stat measures
  // container mechanics. The .control subtree at the root is L7
  // infrastructure (identity registry, cavern-state): it can appear
  // on first registry capture mid-flight, so it is not fence content
  // either, exactly like the .mutable knowledge home.
  const statAt=async(p,full)=>p===vault&&rootBackend?rootBackend.statFor(vault==='.'?'/':`/${vault}`,{bigint:true}):await fs.lstat(full,{bigint:true});
  const walk=async(p,full)=>{
   signal?.throwIfAborted();if(++count>100000)fail('Knowledge scope evidence budget exceeded');
   const {s,names}=await bounded(async()=>{
    const s=await statAt(p,full);
    if(s.isSymbolicLink()||!s.isDirectory()&&!s.isFile())fail('Symlink or unsupported Knowledge scope entry');
    // The knowledge home is infrastructure, never scope content: the
    // disk era's .mutable directory, and (phext-only) the Cavern
    // container files — cavern.phext changes on every knowledge
    // flush, so fencing it would make every refresh that stages
    // knowledge report the vault changed. Document content inside
    // the phext is fenced through the facade's own per-file stamps.
    return {s,names:s.isDirectory()?(await fs.readdir(full)).sort().filter(name=>name!=='.mutable'&&!name.startsWith('.mutable-')&&name!=='cavern.phext'&&name!=='cavern.phext.bak'&&!name.startsWith('cavern.phext.anchor-')&&!(p===vault&&name==='.control')):[]};
   });
   const children=await Promise.allSettled(names.map(name=>walk(join(p,name),path.join(full,name))));
   const failed=children.find(result=>result.status==='rejected');if(failed)throw failed.reason;
   if(s.isDirectory()){const after=await bounded(async()=>statAt(p,full));if(!after.isDirectory()||JSON.stringify(evidence(p,after))!==JSON.stringify(evidence(p,s)))fail('Knowledge scope directory changed during traversal');}
   return [evidence(p,s),...children.flatMap(result=>result.value)];
  };
  const rows=await walk(vault,initialRoot);
  for(const parent of ancestors)if(await this.stamp(parent.prefix,'directory')!==parent.stamp)fail('Knowledge scope parent changed during traversal');
  // Relocation authority is store-wide, including moves entering this vault.
  if(vault!=='.'){
   rows.push(['managed-root',await this.stamp('.','directory')]);
   if(!await absent(path.join(this.root,'.mutable-relocations')))rows.push(...await walk('.mutable-relocations',await this.resolve('.mutable-relocations')));
  }
  signal?.throwIfAborted();return hash(JSON.stringify(rows));
 }
 async write(p,data) {
  const file=await this.resolve(p,{missing:true}), h=await fs.open(file,C.O_WRONLY|C.O_CREAT|C.O_EXCL|C.O_NOFOLLOW,0o600);
  try{await h.writeFile(data);await h.sync();}finally{await h.close();}await this.sync(path.posix.dirname(p));
 }
 async sync(p){const h=await fs.open(await this.resolve(p),C.O_RDONLY|C.O_DIRECTORY|C.O_NOFOLLOW);try{await h.sync();}finally{await h.close();}}
 async privateHome(){const p='.mutable-relocations';await this.resolve(p,{missing:true});try{await fs.mkdir(path.join(this.root,p),{mode:0o700});await this.sync('.');}catch(e){if(e.code!=='EEXIST')throw e;}await this.resolve(p);return p;}
 async lock(action) {
  await this.resolve('.mutable-store.lock',{missing:true});const h=await fs.open(path.join(this.root,'.mutable-store.lock'),C.O_RDWR|C.O_CREAT|C.O_NOFOLLOW,0o600);
  try{try{await nativeFlock(h.fd,'exnb');}catch(e){if(['EAGAIN','EWOULDBLOCK'].includes(e.code))fail('Another managed operation is active; retry');fail('Native store locking is unavailable',503);}return await action();}finally{try{await nativeFlock(h.fd,'un');}catch{}await h.close();}
 }
 async records(){
  const base='.mutable-relocations';if(await absent(path.join(this.root,base)))return [];
  const dir=await this.resolve(base),entries=await fs.readdir(dir,{withFileTypes:true});if(entries.length>LIMIT)fail('Relocation archive requires maintenance');
  const out=[];for(const e of entries){if(!e.isDirectory()||e.isSymbolicLink())fail('Invalid relocation archive',400);operationId(e.name);
   const prefix=base+'/'+e.name,raw=await this.read(prefix+'/intent.json',true);if(!raw){if((await fs.readdir(await this.resolve(prefix))).length)fail('Incomplete relocation preparation requires review');continue;}
   const i=JSON.parse(raw);if(i.version!==1||i.operationId!==e.name||!Number.isSafeInteger(i.sequence)||!['pair','directory'].includes(i.kind)||!Array.isArray(i.resources)||!Array.isArray(i.dependencies)||!Array.isArray(i.moves)||i.moves.length>LIMIT||i.resources.length>LIMIT)fail('Invalid relocation intent');
   relative(i.vault);relative(i.source);relative(i.destination);
   if(!inside(i.vault,i.source)||!inside(i.vault,i.destination)||i.source===i.vault||i.destination===i.vault)fail('Invalid relocation confinement');
   for(const item of i.dependencies)filename(item.location);
   for(const m of i.moves){relative(m.from);relative(m.to);if(!inside(i.vault,m.from)||!inside(i.vault,m.to)||typeof m.signature!=='string')fail('Invalid relocation move');}
   for(const r of i.resources){filename(r.from);filename(r.to);relative(r.homeFrom);relative(r.homeTo);if(!inside(i.vault,r.homeFrom)||!inside(i.vault,r.homeTo))fail('Invalid pair evidence location');}
   const done=await this.read(prefix+'/complete.json',true);if(done&&JSON.parse(done).intentHash!==hash(raw))fail('Invalid relocation completion');
   out.push({intent:i,done:!!done,prefix});
  }return out.sort((a,b)=>a.intent.sequence-b.intent.sequence);
 }
 async guard(resourceId,loc,baseline) {
  const records=await this.records(),p=loc?filename(loc):undefined;
  for(const {intent,done} of records)if(!done&&(resourceId&&intent.resources.some(r=>r.resourceId===resourceId)||p&&(inside(intent.source,p)||inside(intent.destination,p)||intent.moves.some(m=>m.from===p||m.to===p))))fail(`Relocation pending: ${intent.operationId}`);
  const latest=records.filter(r=>r.done&&r.intent.resources.some(x=>x.resourceId===resourceId)).at(-1);
  if(!latest)return undefined;
  const r=latest.intent.resources.find(r=>r.resourceId===resourceId),revision=latest.intent.operationId;
  if(p&&p!==filename(r.to))fail('Resource location changed; explicit binding reconciliation required');
  if(baseline&&baseline.locationRevision!==revision)fail('Caller location baseline is stale');
  return revision;
 }
 async guardPath(loc){const p=filename(loc);for(const {intent,done}of await this.records()) {
  if(!done&&(inside(intent.source,p)||inside(intent.destination,p)||intent.moves.some(m=>m.from===p||m.to===p)))fail(`Relocation pending: ${intent.operationId}`);
  if(done&&intent.resources.some(r=>filename(r.from)===p)&&!intent.resources.some(r=>filename(r.to)===p)) {
   // A later return to this path is legitimate only for the moved identity.
   const bytes=await this.read(p,true);if(!bytes)fail('Resource location changed; refresh the vault');
   await this.guard(decodeNative(bytes).resourceId,loc); 
  }
 }}
 async guardReadPath(p){relative(p);for(const {intent,done}of await this.records())if(!done&&(inside(intent.source,p)||inside(intent.destination,p)||intent.moves.some(m=>m.from===p||m.to===p)))fail(`Relocation pending: ${intent.operationId}`);}
 async baseline(p,id) {
  const loc=location(p), pair=new ManagedPair({root:await this.resolve(loc.folder),resourceId:id,nativeName:loc.filename,markdownName:markdownProjectionName(loc.filename)});
  const home=join(loc.folder,`.mutable-pair-${hash(id)}`);await this.resolve(home,{missing:true});
  const receipt=await pair.receipt(),pending=await pair.pending(),native=await this.read(p),md=await this.read(markdownProjectionName(p),true);
  const revision=await this.guard(id,loc);
  return {pair,home,receipt,pending,baseline:{nativeHash:hash(native),markdownHash:receipt?.version===2?null:md?hash(md):null,generation:receipt?.generation??null,...(revision?{locationRevision:revision}:{})}};
 }
 async discoverShared(vault='.',{signal}={}) {
  if(!this.shareDiscovery)return this.discover(vault,{signal});
  signal?.throwIfAborted();
  const fence=await this.readScopeFence(vault,signal);
  const key=JSON.stringify([this.root,vault,this.readOnly]);
  let entry=sharedDiscovery.get(key);
  if(!entry||entry.fence!==fence||Date.now()-entry.created>5000){
   entry={fence,created:Date.now()};
   // Shared work has its own lifetime; cancelling one consumer cannot cancel another.
   entry.work=this.discover(vault).then(async scan=>{
    if(await this.readScopeFence(vault)!==fence)throw Error('Vault changed during shared discovery');
    return scan;
   });
   sharedDiscovery.set(key,entry);
   if(sharedDiscovery.size>8)sharedDiscovery.delete(sharedDiscovery.keys().next().value);
  }
  try{
   const scan=await entry.work;signal?.throwIfAborted();
   if(await this.readScopeFence(vault,signal)!==fence)throw Error('Vault changed before discovery reuse');
   return structuredClone(scan);
  }catch(error){if(sharedDiscovery.get(key)===entry)sharedDiscovery.delete(key);throw error;}
 }
 async discover(vault='.',{signal}={}) {
  signal?.throwIfAborted();
  relative(vault);const base=await this.resolve(vault);if(!(await fs.stat(base)).isDirectory())fail('Vault must be a directory',400);
  vault=path.relative(this.root,await fs.realpath(base)).split(path.sep).join('/')||'.';
  const folders=[],documents=[],markdown=[],other=[],diagnostics=[],uninspected=[],inspected=[],directories=[];let count=0;
  const walk=async dir=>{signal?.throwIfAborted();let entries;try{directories.push({path:dir,stamp:await this.stamp(dir,'directory')});entries=await fs.readdir(await this.resolve(dir),{withFileTypes:true});}catch(e){diagnostics.push({path:dir,message:e.message});return;}
   for(const e of entries.sort((a,b)=>a.name.localeCompare(b.name))){signal?.throwIfAborted();if(++count>LIMIT){diagnostics.push({path:dir,message:'Vault scan limit reached'});return;}if(e.name==='.mutable'){if(dir!==vault)diagnostics.push({path:join(dir,e.name),message:'Invalid Vault topology: overlapping descendant Mutable Vault'});continue;}if(e.name.startsWith('.mutable-'))continue;
    const p=join(dir,e.name);if(e.isSymbolicLink()){diagnostics.push({path:p,message:'Symlink excluded'});continue;}
    if(e.isFile()&&isDerivedMarkdownName(e.name))continue;
    if(e.isDirectory()){folders.push(p);await walk(p);}else if(e.isFile()&&isNativeDocumentName(e.name)){
     try{const stamp=await this.stamp(p),bytes=await this.read(p),byteHash=hash(bytes),result=await this.inspect(bytes,signal);signal?.throwIfAborted();
      if(typeof result?.inspection?.resourceId!=='string'||!result.inspection.resourceId||!result.inspection.rootBlockId||typeof result.inspection.rootBlockId!=='string'||typeof result.inspection.title!=='string'||result.byteHash!==byteHash)throw Error('Incomplete or stale native inspection');
      const resource=result.inspection;let info;try{info=await this.baseline(p,resource.resourceId);}catch(e){diagnostics.push({path:p,message:e.message});}
      // Inspection cannot authorize a later, different file. Re-read through the
      // same confinement guard after worker/baseline work; failures remain unknown.
      if(await this.stamp(p)!==stamp||hash(await this.read(p))!==byteHash||info&&info.baseline.nativeHash!==byteHash)throw Error('Native bytes changed during inspection');
      documents.push({location:location(p),resourceId:resource.resourceId,title:resource.title,state:info?.pending?'pending':!info?.receipt?'unenrolled':info.receipt.nativeHash===info.baseline.nativeHash&&info.receipt.markdownHash===info.baseline.markdownHash?'paired':'changed',baseline:info?.baseline});
      inspected.push({path:p,stamp,byteHash,info,row:documents.at(-1)});
     }catch(e){uninspected.push(p);diagnostics.push({path:p,message:e.message});}
    }else if(e.isFile()&&e.name.endsWith('.md')&&!isDerivedMarkdownName(e.name))markdown.push(p);else other.push(p);
   }
  };await walk(vault);signal?.throwIfAborted();
  // A worker yield may let an already inspected file or enumerated directory
  // change. Revalidate this scan's read evidence before treating it as complete.
  for(const item of inspected){signal?.throwIfAborted();try{
   const latest=item.info?await this.baseline(item.path,item.row.resourceId):undefined;
   if(await this.stamp(item.path)!==item.stamp||(latest?.baseline.nativeHash??hash(await this.read(item.path)))!==item.byteHash)throw Error('Native candidate changed before discovery publication');
   if(item.info&&!equal({baseline:item.info.baseline,receipt:item.info.receipt,pending:item.info.pending},{baseline:latest.baseline,receipt:latest.receipt,pending:latest.pending}))throw Error('Pair evidence changed before discovery publication');
  }catch(e){uninspected.push(item.path);diagnostics.push({path:item.path,message:e.message});documents.splice(documents.indexOf(item.row),1);}}
  const ids=new Map();for(const d of documents){const a=ids.get(d.resourceId)??[];a.push(d);ids.set(d.resourceId,a);}for(const [id,rows]of ids)if(rows.length>1){rows.forEach(d=>d.state='ambiguous');diagnostics.push({resourceId:id,message:'Duplicate canonical identity'});}
  const paired=new Set(documents.filter(d=>d.state==='paired').map(d=>markdownProjectionName(filename(d.location))));
  let operations=[];try{operations=(await this.records()).filter(r=>inside(vault,r.intent.source)||inside(vault,r.intent.destination)||inside(r.intent.source,vault)||inside(r.intent.destination,vault)).map(r=>({operationId:r.intent.operationId,phase:r.done?'relocated':'pending'}));}catch(e){diagnostics.push({path:'.mutable-relocations',message:e.message});}
  for(const dir of directories){signal?.throwIfAborted();try{if(await this.stamp(dir.path,'directory')!==dir.stamp)throw Error('Directory changed during discovery');}catch(e){diagnostics.push({path:dir.path,message:e.message});}}
  let documentSaves=[];try{documentSaves=await new RecognizedDocumentStore(this).operations(vault);}catch(e){diagnostics.push({message:'Document recovery evidence unavailable: '+e.message});}
  signal?.throwIfAborted();
  return {vault,folders,documents,documentSaves,markdown:markdown.filter(p=>!paired.has(p)),other,diagnostics,uninspected,complete:!diagnostics.length&&!documentSaves.length,operations,readOnly:this.readOnly};
 }
 async signature(p) {
  let count=0;const entries=[];
  const walk=async(rel,name)=>{if(++count>LIMIT)fail('Relocation subtree exceeds bounded inspection limit');const full=await this.resolve(rel),s=await fs.lstat(full);
   if(s.isSymbolicLink()||!s.isDirectory()&&!s.isFile())fail('Unsupported relocation entry',400);
   // Active receipts change under this journal. All captured generation files remain covered.
   if(rel.endsWith('/receipt.json')&&rel.split('/').some(c=>c.startsWith('.mutable-pair-')))return;
   entries.push([name,s.isDirectory()?'d':'f',String(s.dev),String(s.ino),s.isFile()?hash(await this.read(rel)):null]);
   if(s.isDirectory())for(const e of (await fs.readdir(full)).sort())await walk(join(rel,e),name+'/'+e);
  };await walk(p,'');return hash(JSON.stringify(entries));
 }
 async vacant(p,source) {
  relative(p);if(p.split('/').some(c=>c.startsWith('.mutable-')))fail('Reserved managed destination',400);
  const dir=path.posix.dirname(p),name=path.posix.basename(p);await this.resolve(dir);
  for(const n of await fs.readdir(await this.resolve(dir)))if(alias(n)===alias(name))fail(source&&alias(source)===alias(p)?'Case-only/normalization-only rename is not supported':'Destination or case/normalization alias already exists');
 }
 async move(from,to) {
  await this.resolve(from);await this.resolve(to,{missing:true});
  // Phext-only (cutover): the exclusive rename lives in the VFS
  // (chunk scrolls move verbatim). The compiled native-path-move
  // helper that performed it on disk is deleted with the rest of
  // the disk I/O; a vault no Cavern phext covers cannot relocate.
  const backend=phextFsBackendFor(path.join(this.root,from));
  if(!backend)fail('Exclusive relocation primitive failed: no Cavern phext is registered for this vault',503);
  try{backend.renameExclusive(path.join(this.root,from),path.join(this.root,to));}catch(e){fail(`Exclusive relocation primitive failed: ${e.message}`,409);}
  await this.sync(path.posix.dirname(from));await this.sync(path.posix.dirname(to));
 }
 async mkdir(vault,directory){this.writable();return this.lock(async()=>{relative(vault);relative(directory);if(!inside(vault,directory)||directory===vault)fail('Directory outside selected vault',400);await this.resolve(vault);await this.vacant(directory);for(const r of await this.records())if(!r.done)fail('Recover pending relocation first');await fs.mkdir(await this.resolve(directory,{missing:true}));await this.sync(path.posix.dirname(directory));return {directory};});}
 async checkResourceBytes(resources,moved=false) {
  for(const r of resources){const loc=moved?r.to:r.from,native=await this.read(filename(loc)),markdown=r.receipt.version===2?undefined:await this.read(markdownProjectionName(filename(loc)));
   if(hash(native)!==r.baseline.nativeHash||(markdown?hash(markdown):null)!==r.baseline.markdownHash||decodeNative(native).resourceId!==r.resourceId)fail('Resource bytes changed from the reviewed relocation baseline');
  }
 }
 async validateDependencies(resources, dependencies, moved=false) {
  const locations=new Map();
  for(const item of dependencies){
   const r=resources.find(r=>r.resourceId===item.resourceId),loc=moved&&r?r.to:item.location,p=filename(loc);
   const data=await this.read(p,true);if(!data)continue;
   if(decodeNative(data).resourceId!==item.resourceId)fail('Dependency location identity mismatch');
   locations.set(item.resourceId,await this.resolve(p));
  }
  for(const r of resources){const loc=moved?r.to:r.from;
   const pair=new ManagedPair({root:await this.resolve(loc.folder),resourceId:r.resourceId,nativeName:loc.filename,markdownName:markdownProjectionName(loc.filename),locations});
   await pair.dependencies((await this.read(filename(loc))).toString());
  }
 }
 async relocate(request) {this.writable();let prepared=false;return this.lock(async()=>{
  const {operationId:id,vault,kind,source,destination,baselines,dependencies=[]}=request;operationId(id);relative(vault);relative(source);relative(destination);
  if([vault,source,destination].some(p=>p.split('/').some(c=>c.startsWith('.mutable-'))))fail('Reserved managed path',400);
  if(!['pair','directory'].includes(kind)||!inside(vault,source)||!inside(vault,destination)||source===vault||destination===vault||inside(source,destination)||source===destination)fail('Invalid same-vault relocation',400);
  const prior=await this.records(),existing=prior.find(r=>r.intent.operationId===id),requestHash=hash(JSON.stringify({vault,kind,source,destination,baselines,dependencies}));
  if(existing){if(existing.intent.requestHash!==requestHash)fail('Relocation retry differs from original request');prepared=true;return this.attempt(existing);}
  if(prior.some(r=>!r.done))fail('Recover pending relocation first');
  await this.vacant(destination,source);
  const scan=await this.discover(vault);if(!scan.complete)fail('Vault discovery incomplete or ambiguous; resolve diagnostics first');
  const st=await fs.lstat(await this.resolve(source));if(kind==='directory'?!st.isDirectory():!st.isFile()||!isNativeDocumentName(source))fail('Unexpected relocation source type',400);
  const selected=scan.documents.filter(d=>kind==='pair'?filename(d.location)===source:inside(source,filename(d.location)));
  if(kind==='pair'&&selected.length!==1)fail('Canonical pair source missing or ambiguous');
  if(!Array.isArray(baselines)||baselines.length!==selected.length)fail('Exact caller baselines required',400);
  const resources=[];
  for(const d of selected){const caller=baselines.find(b=>b.resourceId===d.resourceId);if(d.state!=='paired'||!caller||!equal(caller.baseline,d.baseline))fail('Unenrolled, changed, pending or stale resource');
   const from=filename(d.location),to=kind==='pair'?destination:destination+from.slice(source.length), info=await this.baseline(from,d.resourceId);
   if(info.pending||!equal(info.baseline,d.baseline))fail('Resource changed during relocation preflight');
   resources.push({resourceId:d.resourceId,from:d.location,to:location(to),homeFrom:info.home,homeTo:join(path.posix.dirname(to),`.mutable-pair-${hash(d.resourceId)}`),receipt:info.receipt,baseline:d.baseline});
  }
  await this.fault('relocation-captured',{resources});
  if(!Array.isArray(dependencies)||dependencies.length>256)fail('Invalid dependency locations',400);
  const located=new Map(scan.documents.map(d=>[d.resourceId,{resourceId:d.resourceId,location:d.location}]));
  for(const item of dependencies){filename(item.location);if(located.has(item.resourceId)&&!equal(located.get(item.resourceId).location,item.location))fail('Ambiguous dependency location');located.set(item.resourceId,item);}
  const dependencyLocations=[...located.values()];await this.validateDependencies(resources,dependencyLocations);
  const moves=[];if(kind==='directory')moves.push({from:source,to:destination,signature:await this.signature(source)});
  else {const r=resources[0],md=markdownProjectionName(source),mdTo=markdownProjectionName(destination);if(r.receipt.version!==2)await this.vacant(mdTo);
   moves.push({from:source,to:destination,signature:await this.signature(source)});
   if(r.receipt.version!==2)moves.push({from:md,to:mdTo,signature:await this.signature(md)});
   if(r.homeFrom!==r.homeTo){if(!await absent(await this.resolve(r.homeTo,{missing:true})))fail('Destination pair archive exists');moves.push({from:r.homeFrom,to:r.homeTo,signature:await this.signature(r.homeFrom)});}
  }
  await this.checkResourceBytes(resources);
  const intent={version:1,operationId:id,sequence:(prior.at(-1)?.intent.sequence??0)+1,requestHash,vault,kind,source,destination,resources,moves,dependencies:dependencyLocations};
  const intentText=JSON.stringify(intent);if(Buffer.byteLength(intentText)>MAX)fail('Relocation evidence exceeds the bounded record size',400);
  const home=await this.privateHome(),prefix=home+'/'+id;prepared=true;try{await fs.mkdir(await this.resolve(prefix,{missing:true}),{mode:0o700});}catch(e){if(e.code!=='EEXIST'||(await fs.readdir(await this.resolve(prefix))).length)throw e;}
  await this.write(prefix+'/intent.json',intentText);await this.sync(home);await this.fault('relocation-intent',{intent});return this.attempt({intent,prefix,done:false});
 }).catch(error=>{error.relocationStarted=prepared;throw error;});}
 async recover(id){this.writable();operationId(id);return this.lock(async()=>{const r=(await this.records()).find(r=>r.intent.operationId===id);if(!r)fail('Unknown relocation operation',404);return this.attempt(r);});}
 async attempt(record) {
  const {intent:i,prefix}=record;
  const result=()=>({phase:'relocated',operationId:i.operationId,bindings:i.resources.map(r=>({resourceId:r.resourceId,location:r.to,baseline:{...r.baseline,locationRevision:i.operationId}}))});
  if(record.done){const newer=(await this.records()).some(r=>r.intent.sequence>i.sequence&&r.intent.resources.some(x=>i.resources.some(y=>x.resourceId===y.resourceId)));if(newer)fail('Relocation completion superseded; refresh explicitly');return result();}
  try {
   for(let n=0;n<i.moves.length;n++){const m=i.moves[n];await this.fault(`relocation-before-${n}`,{intent:i,move:m});
    const src=await absent(path.join(this.root,m.from)),dst=await absent(path.join(this.root,m.to));
    if(!src&&dst){if(await this.signature(m.from)!==m.signature)fail('External source changes before relocation');await this.fault(`relocation-publish-${n}`,{intent:i,move:m});await this.move(m.from,m.to);}
    else if(!src||dst)fail('Relocation source/destination conflict; files preserved');
    if(await this.signature(m.to)!==m.signature)fail('External changes during relocation; actual files preserved');
    await this.fault(`relocation-after-${n}`,{intent:i,move:m});
   }
   for(let n=0;n<i.resources.length;n++){const r=i.resources[n],p=r.homeTo+'/receipt.json',original=JSON.stringify(r.receipt),newReceipt=JSON.stringify({...r.receipt,nativeName:r.to.filename,markdownName:markdownProjectionName(r.to.filename)}),backup=prefix+`/receipt-${n}.previous`;
    const current=await this.read(p,true);if(current?.toString()===newReceipt)continue;
    if(current){if(current.toString()!==original)fail('External receipt changes');await this.move(p,backup);}
    if((await this.read(backup))?.toString()!==original)fail('Receipt recovery evidence differs');
    await this.fault('relocation-receipt-displaced',{intent:i,resource:r});await this.write(p,newReceipt);await this.fault('relocation-receipt',{intent:i,resource:r});
   }
   await this.fault('relocation-before-complete',{intent:i});
   await this.validateDependencies(i.resources,i.dependencies,true);
   await this.checkResourceBytes(i.resources,true);
   for(const m of i.moves){if(!await absent(path.join(this.root,m.from))||await this.signature(m.to)!==m.signature)fail('External changes at relocation confirmation');}
   for(const r of i.resources){const receipt=JSON.parse((await this.read(r.homeTo+'/receipt.json')).toString());if(!equal(receipt,{...r.receipt,nativeName:r.to.filename,markdownName:markdownProjectionName(r.to.filename)}))fail('Receipt changed at confirmation');}
   await this.write(prefix+'/complete.json',JSON.stringify({version:1,intentHash:hash(JSON.stringify(i))}));await this.fault('relocation-complete',{intent:i});return result();
  }catch(e){return {phase:'relocation-pending',operationId:i.operationId,error:e.message,conflict:true};}
 }
}
