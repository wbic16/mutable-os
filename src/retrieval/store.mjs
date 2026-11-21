import {decodeAuthoredValue} from '../history/preplan-spike/authored-values.mjs';
/** Worker-owned disposable sidecar. The authoritative database is always opened read-only. */
import Database from 'better-sqlite3';
import {load} from 'sqlite-vec';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {prepareHome,regularFile} from '../knowledge-sqlite/paths.mjs';
import {readProjection} from '../knowledge-sqlite/reconcile.mjs';
import {randomUUID} from 'node:crypto';
import {hash,verifyPassage} from './passages.mjs';
import {defaultProfile} from './profile.mjs';
export const stamp=r=>r?hash(JSON.stringify([r.guid,r.path,r.contentHash,r.saveGeneration,r.extractionProfile,r.indexStatus])):null;
export function openRetrievalStore({vault,vaultGuid,profile=defaultProfile,rebuild=false}){
 assert(Number.isInteger(profile.dimensions)&&profile.dimensions>0&&profile.dimensions<=8192);assert(['structure','fixed'].includes(profile.chunking));assert.equal(profile.extension,'0.1.9');assert([32,128,1024].includes(profile.chunkSize));
 const {home}=prepareHome({vault});const sourceFile=path.join(home,'mutable.db');regularFile(sourceFile);
 const source=new Database(sourceFile,{readonly:true,fileMustExist:true});source.pragma('query_only=ON');source.pragma('busy_timeout=50');
 assert.equal(source.prepare("SELECT value FROM SchemaInfo WHERE key='vaultGuid'").get()?.value,vaultGuid,'Foreign Vault');
 const file=path.join(home,'retrieval.db');for(const suffix of ['','-wal','-shm'])regularFile(file+suffix,true);
 const profileKey=hash(JSON.stringify(profile)),identity=JSON.stringify({vaultGuid,profileKey,platform:process.platform,arch:process.arch});
 let db;try{
 db=new Database(file);load(db);assert.equal(db.prepare('SELECT vec_version() v').get().v,'v0.1.9');db.pragma('foreign_keys=ON');db.pragma('busy_timeout=100');
 const existing=db.prepare("SELECT name FROM sqlite_master WHERE name='RetrievalInfo'").get();
 if(existing&&db.prepare('SELECT identity FROM RetrievalInfo').get()?.identity!==identity){if(!rebuild)throw Error('Retrieval profile incompatible; explicit rebuild required');db.close();db=undefined;
  // Preserve old sidecar and its usage ledger; never touch mutable.db or remove another profile silently.
  const backup=file+'.replaced-'+Date.now();for(const suffix of ['','-wal','-shm'])if(fs.existsSync(file+suffix))fs.renameSync(file+suffix,backup+suffix);
  db=new Database(file);load(db);
 }
 if(!db.prepare("SELECT name FROM sqlite_master WHERE name='RetrievalInfo'").get()){
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get().n,0,'Unrecognized sidecar; explicit recovery required');
  db.exec(`CREATE TABLE RetrievalInfo(identity TEXT NOT NULL,profile TEXT NOT NULL,indexId TEXT NOT NULL);
   CREATE TABLE SavedResource(resourceId TEXT PRIMARY KEY, stamp TEXT NOT NULL,sourceHash TEXT NOT NULL,path TEXT NOT NULL,updatedUtc TEXT NOT NULL);
   CREATE TABLE Embedding(id INTEGER PRIMARY KEY,inputHash TEXT UNIQUE NOT NULL,vector BLOB,lastUsed INTEGER NOT NULL);
   CREATE TABLE Passage(id INTEGER PRIMARY KEY,resourceId TEXT NOT NULL,embeddingId INTEGER NOT NULL REFERENCES Embedding(id),text TEXT NOT NULL,sourceHash TEXT NOT NULL,spans TEXT NOT NULL);
   CREATE INDEX PassageResource ON Passage(resourceId);CREATE INDEX PassageEmbedding ON Passage(embeddingId);
   CREATE VIRTUAL TABLE PassageText USING fts5(text,content='Passage',content_rowid='id');
   CREATE VIRTUAL TABLE PassageVector USING vec0(embedding float[${profile.dimensions}] distance_metric=cosine,chunk_size=${profile.chunkSize});
   CREATE TABLE Usage(grantId TEXT PRIMARY KEY, fingerprint TEXT NOT NULL,reserved INTEGER NOT NULL,actual INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE Receipt(id INTEGER PRIMARY KEY,grantId TEXT,inputKey TEXT,reserved INTEGER,actual INTEGER,providerMs REAL,requestId TEXT,status TEXT NOT NULL);
  `);db.prepare('INSERT INTO RetrievalInfo VALUES (?,?,?)').run(identity,JSON.stringify(profile),randomUUID());
 }
 db.pragma('journal_mode=WAL');db.pragma('foreign_keys=ON');db.pragma('busy_timeout=100');
 }catch(e){db?.close();source.close();throw e;}
 const resource=id=>source.prepare('SELECT * FROM Resource WHERE guid=?').get(id);
 const current=(id,expected)=>{const r=resource(id);return r?.indexStatus==='complete'&&stamp(r)===expected;};
 const remove=id=>{
  for(const row of db.prepare('SELECT id,text FROM Passage WHERE resourceId=?').all(id))db.prepare("INSERT INTO PassageText(PassageText,rowid,text) VALUES ('delete',?,?)").run(row.id,row.text);
  db.prepare('DELETE FROM Passage WHERE resourceId=?').run(id);db.prepare('DELETE FROM SavedResource WHERE resourceId=?').run(id);
 };
 const prune=()=>{const cutoff=Date.now()-7*86400000;
  // Small bounded orphan cache supports undo/restore without duplicate production indexes.
  const old=db.prepare('SELECT id FROM Embedding WHERE id NOT IN (SELECT embeddingId FROM Passage) ORDER BY lastUsed DESC').all();
  old.forEach((r,i)=>{const active=db.prepare('SELECT embedding FROM PassageVector WHERE rowid=?').get(BigInt(r.id));if(active){db.prepare('UPDATE Embedding SET vector=? WHERE id=?').run(active.embedding,r.id);db.prepare('DELETE FROM PassageVector WHERE rowid=?').run(BigInt(r.id));}if(i>=512||db.prepare('SELECT lastUsed FROM Embedding WHERE id=?').get(r.id).lastUsed<cutoff){db.prepare('DELETE FROM PassageVector WHERE rowid=?').run(BigInt(r.id));db.prepare('DELETE FROM Embedding WHERE id=?').run(r.id);}});
 };
 return {profile,profileKey,vaultGuid,indexId:db.prepare('SELECT indexId FROM RetrievalInfo').get().indexId,db,source,
  resource,current,
  projection(id){return source.transaction(()=>{const p=readProjection(source,id);assert(p?.resource.indexStatus==='complete','Saved projection unavailable');return p;})();},
  inventory(){return source.prepare("SELECT guid FROM Resource WHERE indexStatus='complete' ORDER BY guid LIMIT 10001").all().map(r=>r.guid);},
  indexedStamp:id=>db.prepare('SELECT stamp FROM SavedResource WHERE resourceId=?').get(id)?.stamp,
  cached(inputHash){const r=db.prepare('SELECT id,vector FROM Embedding WHERE inputHash=?').get(inputHash);return r?(r.vector??db.prepare('SELECT embedding FROM PassageVector WHERE rowid=?').get(BigInt(r.id))?.embedding):undefined;},
  cacheVectors(texts,vectors){db.transaction(()=>{texts.forEach((text,i)=>{if(!db.prepare('SELECT id FROM Embedding WHERE inputHash=?').get(hash(text)))db.prepare('INSERT INTO Embedding(inputHash,vector,lastUsed) VALUES (?,?,?)').run(hash(text),vectors[i],Date.now());});prune();})();},
  publish(p,chunks,vectors,expected,check){
   const id=p.resource.guid;check();assert(current(id,expected),'Saved source superseded');
   db.transaction(()=>{check();assert(current(id,expected),'Saved source superseded');remove(id);
    for(const c of chunks){check();let e=db.prepare('SELECT id FROM Embedding WHERE inputHash=?').get(c.inputHash);
     if(!e){const v=vectors.get(c.inputHash);assert(v&&v.length===profile.dimensions*4,'Missing embedding');const info=db.prepare('INSERT INTO Embedding(inputHash,vector,lastUsed) VALUES (?,?,?)').run(c.inputHash,null,Date.now());e={id:Number(info.lastInsertRowid)};db.prepare('INSERT INTO PassageVector(rowid,embedding) VALUES (?,?)').run(BigInt(e.id),v);}
     if(!db.prepare('SELECT rowid FROM PassageVector WHERE rowid=?').get(BigInt(e.id)))db.prepare('INSERT INTO PassageVector(rowid,embedding) VALUES (?,?)').run(BigInt(e.id),db.prepare('SELECT vector FROM Embedding WHERE id=?').get(e.id).vector);
     db.prepare('UPDATE Embedding SET vector=NULL,lastUsed=? WHERE id=?').run(Date.now(),e.id);
     const row=db.prepare('INSERT INTO Passage(resourceId,embeddingId,text,sourceHash,spans) VALUES (?,?,?,?,?)').run(id,e.id,c.text,c.sourceHash,JSON.stringify(c.spans));db.prepare('INSERT INTO PassageText(rowid,text) VALUES (?,?)').run(row.lastInsertRowid,c.text);
    }
    db.prepare('INSERT INTO SavedResource VALUES (?,?,?,?,?)').run(id,expected,p.resource.contentHash,p.resource.path,new Date().toISOString());check();assert(current(id,expected),'Saved source superseded');prune();
   })();
   // Different databases cannot share a write transaction; never serve a revision that fails the read-side fence.
   if(!current(id,expected)){db.transaction(()=>remove(id))();throw Error('Saved source changed during publication');}
  },
  reconcile(){db.transaction(()=>{for(const r of db.prepare('SELECT resourceId,stamp FROM SavedResource').all())if(!current(r.resourceId,r.stamp))remove(r.resourceId);prune();})();},
  reserve(grant,amount,inputKey){return db.transaction(()=>{assert(!db.prepare("SELECT 1 FROM Receipt WHERE grantId=? AND inputKey=? AND status!='complete' LIMIT 1").get(grant.id,inputKey),'Prior embedding outcome unknown or failed; explicit new grant required');const fp=hash(JSON.stringify(grant)),r=db.prepare('SELECT * FROM Usage WHERE grantId=?').get(grant.id);assert(!r||r.fingerprint===fp,'Consent identifier reused');assert(Math.max(r?.reserved??0,r?.actual??0)+amount<=grant.maxTokens,'Consent token cap exhausted');if(!r)db.prepare('INSERT INTO Usage VALUES (?,?,0,0)').run(grant.id,fp);db.prepare('UPDATE Usage SET reserved=reserved+? WHERE grantId=?').run(amount,grant.id);return Number(db.prepare("INSERT INTO Receipt(grantId,inputKey,reserved,status) VALUES (?,?,?,'unknown')").run(grant.id,inputKey,amount).lastInsertRowid);})();},
  receipt(id,data){db.transaction(()=>{db.prepare('UPDATE Receipt SET actual=?,providerMs=?,requestId=?,status=? WHERE id=?').run(data.actual??null,data.providerMs,data.requestId??null,data.status,id);if(data.actual!=null)db.prepare('UPDATE Usage SET actual=actual+? WHERE grantId=(SELECT grantId FROM Receipt WHERE id=?)').run(data.actual,id);})();},
  /** Immediate native FTS5; independent of embedding enrollment and sidecar coverage. */
  lexical(query,{limit=20,resourceId}={},check=()=>{}){
   assert(Number.isInteger(limit)&&limit>0&&limit<=20);assert(resourceId===undefined||typeof resourceId==='string');
   const terms=[...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[])].slice(0,32).map(t=>'"'+t+'"').join(' OR ');
   const candidates=terms?source.prepare(`SELECT t.*,b.resourceGuid,b.coordinate,b.typename,bm25(BlockSearch) score FROM BlockSearch JOIN BlockTextRun t ON t.id=BlockSearch.rowid JOIN Block b ON b.guid=t.blockGuid WHERE BlockSearch MATCH ? ${resourceId?'AND b.resourceGuid=?':''} ORDER BY score LIMIT 100`).all(terms,...(resourceId?[resourceId]:[])):[];
   const results=[];let omitted=0;
   for(const run of candidates){check();try{
    const r=resource(run.resourceGuid);assert(r?.indexStatus==='complete');assert(run.text.length<=8000);
    const expected=stamp(r),route=[],seen=new Set();let id=run.blockGuid,contribution=null;
    while(true){check();assert(!seen.has(id)&&seen.size<128);seen.add(id);
     const b=source.prepare('SELECT * FROM Block WHERE guid=? AND resourceGuid=?').get(id,r.guid);assert(b);
     const d=decodeAuthoredValue(JSON.parse(b.attributes)).payload?.metadata?.dialectic;
     if(d?.kind==='contribution'){assert.equal(d.state,'committed');contribution={blockGuid:id,ordinal:d.ordinal,author:d.author,participant:d.participant};}
     if(id===r.rootBlockGuid){route.unshift(r.rootPlacementId??id);break;}
     const parents=source.prepare("SELECT * FROM BlockRelation WHERE targetBlockGuid=? AND resourceGuid=? AND kind='owned' AND targetScope='local' LIMIT 2").all(id,r.guid);assert.equal(parents.length,1,'Ambiguous occurrence');route.unshift(parents[0].authoredId??parents[0].guid);id=parents[0].sourceBlockGuid;
    }
    const bounds=run.boundaries?JSON.parse(run.boundaries):null;
    const spans=[{runOrdinal:run.ordinal,blockGuid:run.blockGuid,resourceId:r.guid,coordinate:run.coordinate,occurrence:route,contribution,start:bounds?bounds[0]:0,end:bounds?bounds.at(-1):run.text.length,runStart:0,runEnd:run.text.length,chunkStart:0,chunkEnd:run.text.length,textHash:hash(run.text)}];
    assert(current(r.guid,expected));results.push({text:run.text,signals:{bm25:run.score},stamp:expected,source:{vaultGuid,resourceId:r.guid,path:r.path,format:r.format,rootBlockId:r.rootBlockGuid,sourceHash:r.contentHash,saveGeneration:r.saveGeneration,extractionProfile:r.extractionProfile,currency:'verified-saved-projection',liveCurrency:'unknown',spans}});if(results.length>=limit)break;
   }catch{omitted++;}}
   return {results,evidence:results.length?'retrieved-evidence':'no-established-evidence',answerability:'not-assessed',coverage:{complete:false,candidateLimitReached:candidates.length===100,omitted,contextSufficiency:'not-assessed'}};
  },
  rank(query,vector,{strategy='hybrid',limit=5,candidates=100,resourceId}={},check=()=>{}){
   assert(['hybrid','vector','lexical'].includes(strategy));assert(Number.isInteger(limit)&&limit>=1&&limit<=20);assert(Number.isInteger(candidates)&&candidates>=limit&&candidates<=200);
   const scores=new Map(),add=(id,kind,raw,rank)=>{const r=scores.get(id)??{id,score:0};r[kind]=raw;r.score+=1/(60+rank+1);scores.set(id,r);};
   let saturated=false;
   if(strategy!=='lexical'){
    const near=db.prepare('SELECT rowid,distance FROM PassageVector WHERE embedding MATCH ? AND k=? ORDER BY distance').all(vector,candidates);saturated ||= near.length===candidates;
    near.forEach((n,i)=>{const rows=db.prepare('SELECT id FROM Passage WHERE embeddingId=? LIMIT 201').all(n.rowid);if(rows.length>200)saturated=true;for(const r of rows.slice(0,200))add(r.id,'cosineDistance',n.distance,i);});
   }
   if(strategy!=='vector'){
    const terms=[...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[])].slice(0,32).map(t=>'"'+t+'"').join(' OR ');
    if(terms){const near=db.prepare('SELECT rowid,bm25(PassageText) rank FROM PassageText WHERE PassageText MATCH ? ORDER BY rank LIMIT ?').all(terms,candidates);saturated ||= near.length===candidates;near.forEach((n,i)=>add(n.rowid,'bm25',n.rank,i));}
   }
   const rows=[],proofs=new Map();let stale=0,sourceBytes=0;
   for(const ranked of [...scores.values()].sort((a,b)=>b.score-a.score||a.id-b.id)){check();const row=db.prepare('SELECT p.*,r.stamp,r.path FROM Passage p JOIN SavedResource r USING(resourceId) WHERE p.id=?').get(ranked.id);if(resourceId&&row?.resourceId!==resourceId)continue;if(!row||!current(row.resourceId,row.stamp)){stale++;continue;}
    sourceBytes+=Buffer.byteLength(row.spans)+Buffer.byteLength(row.text);if(sourceBytes>2*1024*1024){saturated=true;break;}
    const spans=JSON.parse(row.spans),r=resource(row.resourceId),blocks=new Map();
    const getBlock=id=>{if(!blocks.has(id)){const block=source.prepare('SELECT * FROM Block WHERE guid=? AND resourceGuid=?').get(id,r.guid);assert(block,'Missing source Block');blocks.set(id,{block,runs:source.prepare('SELECT * FROM BlockTextRun WHERE blockGuid=? ORDER BY ordinal').all(id),relations:source.prepare('SELECT * FROM BlockRelation WHERE sourceBlockGuid=? AND resourceGuid=?').all(id,r.guid)});}return blocks.get(id);};
    try{for(const s of spans){let id=r.rootBlockGuid;getBlock(id);for(const pk of s.occurrence.slice(1)){const edge=getBlock(id).relations.find(e=>(e.authoredId??e.guid)===pk);assert(edge,'Missing occurrence');id=edge.targetBlockGuid;getBlock(id);}getBlock(s.blockGuid);}verifyPassage({resource:r,blocks:[...blocks.values()]},{...row,sourceHash:row.sourceHash,spans});}catch{stale++;continue;}
    proofs.set(r.guid,row.stamp);rows.push({text:row.text,signals:{rrf:ranked.score,cosineDistance:ranked.cosineDistance,bm25:ranked.bm25},source:{vaultGuid,resourceId:r.guid,path:r.path,format:r.format,rootBlockId:r.rootBlockGuid,sourceHash:r.contentHash,saveGeneration:r.saveGeneration,extractionProfile:r.extractionProfile,currency:'verified-saved-projection',liveCurrency:'unknown',spans},stamp:row.stamp});if(rows.length===limit)break;
   }
   for(const [id,s]of proofs)assert(current(id,s),'Query source superseded');
   const indexed=db.prepare('SELECT count(*) n FROM SavedResource').get().n,known=source.prepare('SELECT count(*) n FROM Resource').get().n;
   return {results:rows,evidence:rows.length?(saturated||stale||indexed!==known?'incomplete-evidence':'retrieved-evidence'):'no-established-evidence',answerability:'not-assessed',coverage:{complete:false,candidateLimit:candidates,candidateLimitReached:saturated,staleCandidates:stale,contextSufficiency:'not-assessed',indexedResources:indexed,knownSavedResources:known}};
  },
  close(){db.close();source.close();}
 };
}
