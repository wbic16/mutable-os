/** Cavern-wide immutable original binary store. Admission policy belongs to callers;
 * Image, JSON-capture and PDF admission have separate trusted validators.
 * No published object is ever collected. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
const filesystem = () => import(pathToFileURL(path.resolve('scripts/stage-c-gates/filesystem.mjs')).href);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw Error(message); };
const validId = value => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value);
const digestOf = id => typeof id === 'string' && /^sha256:[0-9a-f]{64}$/.test(id) ? id.slice(7) : fail('Invalid asset identity.');
const missing = e => e.code === 'ENOENT';
const LIMIT = { bytes: 100000000, total: 60*1024*1024, count: 20, lease: 600000 };

export class ManagedAssetStore {
  constructor({ root, cavernId, session, now = Date.now, fault = async () => {} }) {
    this.root = root; this.cavernId = cavernId; this.session = session; this.now = now; this.fault = fault; this.tail = Promise.resolve();
  }
  async directory(parent, name, create = false, fd) {
    const fs = await filesystem();
    try { const stat = await fs.atDirectory(parent, {kind:'stat', name}, fd); if (!stat.directory) fail('Asset directory is not a directory.'); return { path:path.join(parent.path,name), identity:stat.identity }; }
    catch(e) { if (!create || !missing(e)) throw e; try { return await fs.createDirectory(parent,name,fd); } catch(e) { if(e.code!=='EEXIST')throw e; return this.directory(parent,name,false,fd); } }
  }
  async home() {
    if (!this.homePromise) this.homePromise = (async () => { const fs=await filesystem(), root=await fs.pinDirectory(this.root); return this.directory(await this.directory(root,'.mutable',true),'assets',true); })().catch(e=>{this.homePromise=undefined;throw e;});
    return this.homePromise;
  }
  async read(dir,name,max=65536,fd) { const fs=await filesystem(); try { return (await fs.atDirectory(dir,{kind:'read',name,maxBytes:max},fd)).data; } catch(e){if(!missing(e))throw e;} }
  async json(dir,name,fd) { const bytes=await this.read(dir,name,65536,fd); return bytes ? JSON.parse(bytes) : undefined; }
  async write(dir,name,data,fd) { const fs=await filesystem(); const bytes=Buffer.isBuffer(data)?data:Buffer.from(JSON.stringify(data)); return fs.atDirectory(dir,{kind:'create',name,data:bytes,maxBytes:Math.max(65536,LIMIT.bytes)},fd); }
  async locked(action) {
    const task = this.tail.then(async()=>{
      const fs=await filesystem(), home=await this.home();
      try { await this.write(home,'writer.lock',Buffer.alloc(0)); } catch(e){if(e.code!=='EEXIST')throw e;}
      const stat=await fs.atDirectory(home,{kind:'stat',name:'writer.lock'}), lock=await fs.lockFile(home,'writer.lock',stat.identity);
      try { return await action(home,lock.fd); } finally { await lock.close(); }
    }); this.tail=task.catch(()=>{}); return task;
  }
  async operation(home,id,fd) { if(!validId(id))fail('Invalid import operation.'); return this.directory(await this.directory(home,'operations',true,fd),id,false,fd); }
  async begin(remoteConsent = [], acquisitionConsent = []) { return this.locked(async(home,fd)=>{
    const id=randomUUID(), token=randomUUID(), dir=await this.directory(await this.directory(home,'operations',true,fd),id,true,fd);
    await this.write(dir,'begin.json',{version:1,id,cavernId:this.cavernId,session:this.session,tokenHash:hash(token),remoteConsent,acquisitionConsent,expires:this.now()+LIMIT.lease},fd);
    return {id,token,cavernId:this.cavernId};
  }); }
  async authority(dir,lease,fd,allowExpired=false) {
    const begin=await this.json(dir,'begin.json',fd);
    if(!begin || begin.version!==1 || begin.id!==lease.id || begin.cavernId!==this.cavernId || begin.session!==this.session || begin.tokenHash!==hash(String(lease.token)))fail('Invalid or stale asset lease.');
    let expiry=begin.expires;
    for(let n=0;n<100;n++){const r=await this.json(dir,`renew-${n}.json`,fd);if(!r)break;expiry=r.expires;}
    if(!allowExpired && expiry<=this.now())fail('Asset lease expired.');
    if(await this.json(dir,'aborted.json',fd))fail('Asset import was aborted.');
    return begin;
  }
  async authorizeRemote(lease,url) {return this.locked(async(home,fd)=>{const dir=await this.operation(home,lease.id,fd),begin=await this.authority(dir,lease,fd);if(!begin.remoteConsent?.includes(url))fail('Explicit consent is required for this image URL.');});}
  async authorizeAcquisition(lease,url,format) {return this.locked(async(home,fd)=>{const dir=await this.operation(home,lease.id,fd),begin=await this.authority(dir,lease,fd);if(await this.json(dir,'finished.json',fd)||!begin.acquisitionConsent?.some(c=>c.url===url&&c.format===format))fail('Explicit current consent is required for this URL and format.');});}
  async renew(lease) {return this.locked(async(home,fd)=>{const dir=await this.operation(home,lease.id,fd);await this.authority(dir,lease,fd);for(let n=0;n<100;n++)if(!await this.read(dir,`renew-${n}.json`,65536,fd)){await this.write(dir,`renew-${n}.json`,{expires:this.now()+LIMIT.lease},fd);return;}fail('Lease renewal limit reached.');});}
  async stages(dir,fd) {const rows=[];for(let i=0;i<LIMIT.count;i++){const row=await this.json(dir,`stage-${i}.json`,fd);if(!row)break;rows.push(row);}return rows;}
  // metadata is produced by a trusted admission adapter, never HTTP request data.
  async stage(lease,bytes,metadata,profile) { return this.locked(async(home,fd)=>{
    const dir=await this.operation(home,lease.id,fd);await this.authority(dir,lease,fd);
    if(await this.read(dir,'intent.json',65536,fd))fail('Import publication already started.');
    const rows=await this.stages(dir,fd), size=rows.reduce((n,r)=>n+r.byteLength,0);
    if((!bytes.length&&metadata.mediaType!=='text/plain')||bytes.length>(metadata.mediaType==='application/pdf'?(profile==='dialectic-attachment'?LIMIT.bytes:50*1024*1024):profile==='dialectic-generated'?20000000:10*1024*1024)||size+bytes.length>(metadata.mediaType==='application/pdf'?(profile==='dialectic-attachment'?LIMIT.bytes:LIMIT.total):40*1024*1024)||rows.length>=LIMIT.count)fail('Asset import limit exceeded.');
    const digest=hash(bytes), item={...metadata,byteLength:bytes.length,assetId:`sha256:${digest}`,cavernId:this.cavernId,slot:rows.length};
    // A failed stage may have left bytes without metadata. Verify instead of overwriting.
    const name=`stage-${rows.length}.bin`, prior=await this.read(dir,name,LIMIT.bytes,fd);
    if(prior && hash(prior)!==digest)fail('Interrupted stage requires abort and a new operation.');
    if(!prior)await this.write(dir,name,bytes,fd);
    await this.fault('stage-bytes');await this.write(dir,`stage-${rows.length}.json`,item,fd);return item;
  }); }
  async object(home,assetId,create,fd) {const digest=digestOf(assetId);return this.directory(await this.directory(await this.directory(home,'objects',create,fd),digest.slice(0,2),create,fd),digest,create,fd);}
  async verify(home,assetId,fd) {
    const dir=await this.object(home,assetId,false,fd), manifest=await this.json(dir,'manifest.json',fd), bytes=await this.read(dir,'original',LIMIT.bytes,fd);
    if(!manifest||manifest.assetId!==assetId||manifest.cavernId!==this.cavernId||!bytes||bytes.length!==manifest.byteLength||hash(bytes)!==digestOf(assetId))fail('Asset integrity verification failed.');
    return {manifest,bytes};
  }
  async publishInto(home,dir,intent,fd) {
    const publications=[];
    for(const row of intent.items){
      if(row.cavernId!==this.cavernId || !Number.isInteger(row.slot) || row.slot<0 || row.slot>=LIMIT.count)fail('Invalid publication intent.');
      const bytes=await this.read(dir,`stage-${row.slot}.bin`,LIMIT.bytes,fd);
      if(!bytes||bytes.length!==row.byteLength||hash(bytes)!==digestOf(row.assetId))fail('Staged asset integrity failure.');
      const target=await this.object(home,row.assetId,true,fd), prior=await this.read(target,'original',LIMIT.bytes,fd);
      if(prior && !prior.equals(bytes))fail('Conflicting immutable asset.');
      if(!prior)await this.write(target,'original',bytes,fd);
      await this.fault('object-bytes');
      const manifest=await this.json(target,'manifest.json',fd);
      const {slot,...value}=row;
      if(manifest && Object.entries(value).some(([key,v])=>JSON.stringify(manifest[key])!==JSON.stringify(v)))fail('Conflicting immutable asset manifest.');
      if(!manifest)await this.write(target,'manifest.json',value,fd);
      publications.push({assetId:row.assetId,reused:!!manifest});
      await this.verify(home,row.assetId,fd);await this.fault('object-manifest');
    }
    if(!await this.json(dir,'published.json',fd))await this.write(dir,'published.json',{items:intent.items.map(({slot,...r})=>r),publications},fd);
    await this.fault('published');
    return this.json(dir,'published.json',fd);
  }
  async publish(lease) {return this.locked(async(home,fd)=>{
    const dir=await this.operation(home,lease.id,fd);await this.authority(dir,lease,fd);
    let intent=await this.json(dir,'intent.json',fd);
    if(!intent){intent={items:await this.stages(dir,fd)};if(!intent.items.length)fail('No staged assets.');await this.write(dir,'intent.json',intent,fd);await this.fault('intent');}
    const done=await this.json(dir,'published.json',fd);return done??this.publishInto(home,dir,intent,fd);
  });}
  async cleanStages(dir,fd) {if(await this.json(dir,'cleaned.json',fd))return;const fs=await filesystem();for(let i=0;i<LIMIT.count;i++){const name=`stage-${i}.bin`;try{const stat=await fs.atDirectory(dir,{kind:'stat',name},fd);await fs.atDirectory(dir,{kind:'unlink',name,expectedIdentity:stat.identity},fd);}catch(e){if(!missing(e))throw e;}}await this.write(dir,'cleaned.json',{complete:true},fd);}
  async finish(lease,commitId) {return this.locked(async(home,fd)=>{const dir=await this.operation(home,lease.id,fd);await this.authority(dir,lease,fd,true);if(!await this.json(dir,'published.json',fd))fail('Assets are not published.');if(!await this.json(dir,'finished.json',fd))await this.write(dir,'finished.json',{commitId:String(commitId??'').slice(0,128)},fd);await this.cleanStages(dir,fd);});}
  async abort(lease) {return this.locked(async(home,fd)=>{const dir=await this.operation(home,lease.id,fd);if(await this.json(dir,'aborted.json',fd))return;await this.authority(dir,lease,fd,true);const intent=await this.json(dir,'intent.json',fd);if(intent&&!await this.json(dir,'published.json',fd))await this.publishInto(home,dir,intent,fd);await this.write(dir,'aborted.json',{retainedPublished:!!intent},fd);await this.cleanStages(dir,fd);});}
  async status(lease) {return this.locked(async(home,fd)=>{const dir=await this.operation(home,lease.id,fd);await this.authority(dir,lease,fd,true);return {published:await this.json(dir,'published.json',fd),finished:await this.json(dir,'finished.json',fd)};});}
  async get(assetId,cavernId) {if(cavernId!==this.cavernId)fail('Asset belongs to another Cavern.');return this.locked((home,fd)=>this.verify(home,assetId,fd));}
  /** Recover only local publication, never network or editor insertion. Invalid evidence is retained. */
  async recover() {return this.locked(async(home,fd)=>{
    const fs=await filesystem(), operations=await this.directory(home,'operations',true,fd), diagnostics=[];
    for(let offset=0;;){const page=await fs.atDirectory(operations,{kind:'list',limit:100,offset},fd);
      for(const entry of page.entries){try{
        if(!validId(entry.name)||!entry.directory||entry.symlink)fail('Invalid asset operation entry.');
        const dir=await this.directory(operations,entry.name,false,fd), begin=await this.json(dir,'begin.json',fd);
        if(!begin||begin.cavernId!==this.cavernId)fail('Invalid operation identity.');
        if(await this.json(dir,'cleaned.json',fd))continue;
        const intent=await this.json(dir,'intent.json',fd), published=await this.json(dir,'published.json',fd);
        if(intent&&!published)await this.publishInto(home,dir,intent,fd);
        let expiry=begin.expires;for(let n=0;n<100;n++){const renewal=await this.json(dir,`renew-${n}.json`,fd);if(!renewal)break;expiry=renewal.expires;}
        if(begin.session!==this.session||expiry<=this.now()||await this.json(dir,'finished.json',fd)||await this.json(dir,'aborted.json',fd)){
          if(!await this.json(dir,'aborted.json',fd)&&!await this.json(dir,'finished.json',fd))await this.write(dir,'aborted.json',{recovered:true,retainedPublished:!!intent},fd);
          await this.cleanStages(dir,fd);
        }
      }catch(e){diagnostics.push({operation:entry.name,error:e.message});}}
      if(page.next===undefined)break;
      if(page.next>10000){diagnostics.push({operation:'recovery',error:'Operation ledger exceeds the bounded startup scan; remaining operations require explicit maintenance. Published assets are retained.'});break;}
      offset=page.next;
    }return {diagnostics};
  });}
  async close(){await this.tail;}
}
