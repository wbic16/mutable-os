/** Library discovery — reconcile against the vault, with a
 * rebuildable persisted presentation cache in native mode only.
 *
 * The class name is historical. The substantive work is the
 * reconcile itself (walk, inspect, pair-state derivation); verified
 * discovery, Open, Save and relocation continue through
 * NativeVaultStore.
 *
 * The persisted cache at `.mutable/discovery-cache.json` (read on
 * Browse, rewritten after a complete discovery pass; a failed write
 * never fails Browse) is a NATIVE-mode mechanism: it returns with
 * mode selection (2026-11-06) for vaults no phext backend covers,
 * where its file routes through the phext-fs facade onto real disk
 * exactly as before the cutover. In phext mode nothing is read or
 * written: the VFS directory index scrolls (L9) are the listing
 * source, every browse reconciles against them, and a cache file
 * inside the VFS would be stored state the cutover deliberately
 * removed.
 */
import { promises as fs, phextFsBackendFor } from './phext-fs.mjs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash } from '../src/persistence/managed-pair.mjs';
import { isNativeDocumentName, isDerivedMarkdownName, markdownProjectionName } from '../src/persistence/document-file-names.mjs';
import { RecognizedDocumentStore } from './recognized-document-store.mjs';

const VERSION = 1, LIMIT = 10000;
const join = (a,b) => a === '.' ? b : `${a}/${b}`;
const loc = p => ({folder:path.posix.dirname(p),filename:path.posix.basename(p)});
const inside = (root,p) => root === '.' || p === root || p.startsWith(root+'/');
const safe = p => typeof p === 'string' && p.length > 0 && !path.isAbsolute(p) && !/[\\\0]/.test(p) && (p === '.' || p.split('/').every(s=>s && s!=='.' && s!=='..'));

export class VaultListingCache {
  constructor(store) { this.store=store; this.work=new Map(); }
  async root(vault) {
    if(!safe(vault))throw Object.assign(Error('Invalid Vault path'),{status:400});
    const full=await this.store.resolve(vault),s=await fs.lstat(full,{bigint:true});
    if(!s.isDirectory())throw Error('Vault must be a directory');
    return `${this.store.root}:${s.dev}:${s.ino}`;
  }
  /** The persisted cache exists only where no phext backend covers
   * the vault — native mode (see the header). */
  async persisted(vault) { return !phextFsBackendFor(await this.store.resolve(vault)); }
  async read(vault, identity) {
    try {
      const bytes=await this.store.read(join(vault,'.mutable/discovery-cache.json'),true);
      if(!bytes)return;
      const c=JSON.parse(bytes);
      if(c.version!==VERSION || c.identity!==identity || c.vault!==vault || !Array.isArray(c.entries) || c.entries.length>LIMIT || !c.listing || c.listing.vault!==vault) return;
      const paths=new Set();
      for(const e of c.entries) {
        if(!safe(e.path)||!inside(vault,e.path)||!isNativeDocumentName(e.path)||paths.has(e.path)||typeof e.stamp!=='string'||!/^[a-f0-9]{64}$/.test(e.byteHash)||typeof e.inspection?.resourceId!=='string'||typeof e.inspection?.rootBlockId!=='string'||typeof e.inspection?.title!=='string'||!e.row||e.row.resourceId!==e.inspection.resourceId||JSON.stringify(e.row.location)!==JSON.stringify(loc(e.path)))return;
        paths.add(e.path);
      }
      const l=c.listing;
      for(const key of ['folders','markdown','other'])if(!Array.isArray(l[key])||l[key].length>LIMIT||l[key].some(p=>!safe(p)||!inside(vault,p)))return;
      if(!Array.isArray(l.documents)||l.documents.length>LIMIT||l.documents.some(d=>!d?.location||!paths.has(join(d.location.folder,d.location.filename)))||!Array.isArray(l.diagnostics)||!Array.isArray(l.operations)||!Array.isArray(l.documentSaves)||typeof l.complete!=='boolean')return;
      return c;
    } catch { /* Missing, obsolete or corrupt cache: rebuild from files. */ }
  }
  async write(vault, value, signal) {
    if(this.store.readOnly)return;
    // Establishment owns .mutable. A failed cache write must never fail Browse.
    let temporary;
    try {
      const home=await this.store.resolve(join(vault,'.mutable'));
      if(!(await fs.lstat(home)).isDirectory())return;
      signal?.throwIfAborted();
      const text=JSON.stringify(value);if(Buffer.byteLength(text)>20*1024*1024)return;
      temporary=path.join(home,`discovery-${randomUUID()}.tmp`);
      await fs.writeFile(temporary,text,{flag:'wx',mode:0o600});
      signal?.throwIfAborted();
      await fs.rename(temporary,path.join(home,'discovery-cache.json'));
    } catch { /* This is derived data, not an authored save. */ }
    finally { if(temporary)await fs.unlink(temporary).catch(()=>{}); }
  }
  async browse(vault,{mode='cached',signal}={}) {
    signal?.throwIfAborted();
    const identity=await this.root(vault);
    const persisted=await this.persisted(vault);
    const prior=persisted?await this.read(vault,identity):undefined;
    signal?.throwIfAborted();
    // Serialize publications, including full verification queued behind a scan.
    const before=this.work.get(vault)??Promise.resolve();
    const work=before.catch(()=>{}).then(async()=>{
      signal?.throwIfAborted();
      if(mode==='cached'&&prior)return {...prior.listing,readOnly:this.store.readOnly,cached:true};
      const previous=persisted?await this.read(vault,identity):undefined;
      return this.reconcile(vault,identity,previous,mode==='verify',signal,persisted);
    });
    this.work.set(vault,work);
    try{return await work;}finally{if(this.work.get(vault)===work)this.work.delete(vault);}
  }
  async optionalStamp(p) {
    try{return await this.store.stamp(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}
  }
  async stamp(p,id,relocations) {
    const home=join(path.posix.dirname(p),`.mutable-pair-${hash(id)}`);
    return JSON.stringify([await this.store.stamp(p),await this.optionalStamp(markdownProjectionName(p)),
      await this.optionalStamp(home+'/receipt.json'),await this.optionalStamp(home+'/pending.json'),relocations]);
  }
  async reconcile(vault,identity,prior,verify,signal,persisted=false) {
    const folders=[],markdown=[],other=[],documents=[],diagnostics=[],entries=[],directories=[],files=[];
    const previous=new Map((prior?.entries??[]).map(e=>[e.path,e]));
    const inspections=new Map((prior?.entries??[]).map(e=>[e.byteHash,e.inspection]));
    let count=0;
    const check=()=>signal?.throwIfAborted();
    const walk=async dir=>{
      check();
      try {
        directories.push({path:dir,stamp:await this.store.stamp(dir,'directory')});
        const list=await fs.readdir(await this.store.resolve(dir),{withFileTypes:true});
        for(const e of list.sort((a,b)=>a.name.localeCompare(b.name))) {
          check();if(++count>LIMIT)throw Error('Vault scan limit reached');
          const p=join(dir,e.name);
          if(e.name==='.mutable'){if(dir!==vault)diagnostics.push({path:p,message:'Invalid Vault topology: overlapping descendant Mutable Vault'});continue;}
          if(e.name.startsWith('.mutable-')||isDerivedMarkdownName(e.name))continue;
          if(e.isSymbolicLink()){diagnostics.push({path:p,message:'Symlink excluded'});continue;}
          if(e.isDirectory()){folders.push(p);await walk(p);}
          else if(e.isFile()&&isNativeDocumentName(e.name))files.push(p);
          else if(e.isFile()&&e.name.endsWith('.md'))markdown.push(p);
          else if(e.isFile())other.push(p);
          else diagnostics.push({path:p,message:'Unsupported filesystem entry'});
        }
      }catch(e){check();diagnostics.push({path:dir,message:e.message});
        // Unreadable subtrees are unknown, not confirmed deletions.
        for(const old of previous.values())if(inside(dir,old.path)&&!files.includes(old.path))files.push(old.path);
      }
    };
    await walk(vault);check();
    let records=[],operations=[];
    try{records=await this.store.records();operations=records.filter(r=>inside(vault,r.intent.source)||inside(vault,r.intent.destination)||inside(r.intent.source,vault)).map(r=>({operationId:r.intent.operationId,phase:r.done?'relocated':'pending'}));}
    catch(e){diagnostics.push({message:e.message});}
    const relocations=hash(JSON.stringify(records));
    for(const p of files) {
      check();const old=previous.get(p);
      try {
        if(old&&!verify&&await this.stamp(p,old.inspection.resourceId,relocations)===old.stamp){entries.push(old);documents.push(structuredClone(old.row));continue;}
        const nativeStamp=await this.store.stamp(p),bytes=await this.store.read(p),byteHash=hash(bytes);
        const known=inspections.get(byteHash);
        const result=known?{inspection:known,byteHash}:await this.store.inspect(bytes,signal);
        if(result.byteHash!==byteHash)throw Error('Stale native inspection');
        const inspection=result.inspection;
        if(!inspection?.resourceId||typeof inspection.title!=='string'||!inspection.rootBlockId)throw Error('Incomplete native inspection');
        const stamp=await this.stamp(p,inspection.resourceId,relocations),info=await this.store.baseline(p,inspection.resourceId);
        if(info.baseline.nativeHash!==byteHash||await this.store.stamp(p)!==nativeStamp||await this.stamp(p,inspection.resourceId,relocations)!==stamp)throw Error('Document changed during inspection');
        const row={location:loc(p),resourceId:inspection.resourceId,title:inspection.title,byteHash,
          state:info.pending?'pending':!info.receipt?'unenrolled':info.receipt.nativeHash===byteHash&&info.receipt.markdownHash===info.baseline.markdownHash?'paired':'changed'};
        entries.push({path:p,stamp,byteHash,inspection,row});documents.push({...row});
        inspections.set(byteHash,inspection);
      }catch(e){check();diagnostics.push({path:p,message:e.message});if(old)documents.push({...old.row,state:'unavailable'});}
    }
    const ids=new Map();for(const d of documents){const rows=ids.get(d.resourceId)??[];rows.push(d);ids.set(d.resourceId,rows);}
    for(const [id,rows]of ids)if(rows.length>1){rows.forEach(d=>d.state='ambiguous');diagnostics.push({resourceId:id,message:'Duplicate canonical identity'});}
    let documentSaves=[];
    try{documentSaves=await new RecognizedDocumentStore(this.store).operations(vault);}catch(e){diagnostics.push({message:'Document recovery evidence unavailable: '+e.message});}
    for(const d of directories){check();try{if(await this.store.stamp(d.path,'directory')!==d.stamp)throw Error('Directory changed during discovery');}catch(e){diagnostics.push({path:d.path,message:e.message});}}
    // Do not publish a mixed filesystem generation or persist uncertain removals.
    for(const e of entries){check();try{if(await this.stamp(e.path,e.inspection.resourceId,relocations)!==e.stamp)throw Error('Document changed before discovery publication');}catch(error){diagnostics.push({path:e.path,message:error.message});}}
    if(hash(JSON.stringify(await this.store.records()))!==relocations)diagnostics.push({message:'Relocation changed during discovery'});
    check();if(await this.root(vault)!==identity)throw Error('Vault changed during discovery');
    const paired=new Set(documents.filter(d=>d.state==='paired').map(d=>markdownProjectionName(join(d.location.folder,d.location.filename))));
    const listing={vault,folders,documents,markdown:markdown.filter(p=>!paired.has(p)),other,diagnostics,operations,documentSaves,readOnly:this.store.readOnly,complete:!diagnostics.length&&!documentSaves.length};
    check();if(persisted&&listing.complete)await this.write(vault,{version:VERSION,identity,vault,entries,listing},signal);
    return {...listing,cached:false};
  }
}
