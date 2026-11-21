/** Deterministic local retrieval. Does not call a provider. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {artifact,read,write,hash,tokens,verify,fixtures,temp} from './experiment.mjs';
const corpus=read(artifact('corpus.json')), manifest=read(artifact('upload-manifest.json'));
assert.equal(manifest.corpusHash,hash(JSON.stringify(corpus)));
const embeddings=read(artifact('embeddings.json'));
assert.equal(embeddings.manifestHash,hash(fs.readFileSync(artifact('upload-manifest.json'))));
assert.equal(embeddings.model,corpus.profile.model);assert.equal(embeddings.dimensions,1536);
for(const [,file,digest]of fixtures)assert.equal(hash(fs.readFileSync(file)),digest);
const dbFile=artifact('retrieval.db');
if(fs.existsSync(dbFile))fs.unlinkSync(dbFile);
const extension=path.join(temp,'package/vec0.dylib');
function open(){const db=new Database(dbFile);db.loadExtension(extension);assert.equal(db.prepare('select vec_version() v').get().v,'v0.1.9');return db;}
let db=open();db.pragma('journal_mode=WAL');db.pragma('foreign_keys=ON');
const buf=v=>Buffer.from(new Float32Array(v).buffer);
const vector=s=>embeddings.vectors[hash(s)];
const start=performance.now();
db.exec(`CREATE TABLE profile (id TEXT PRIMARY KEY, settings TEXT NOT NULL, corpus_hash TEXT NOT NULL);
CREATE TABLE passage (id INTEGER PRIMARY KEY, variant TEXT NOT NULL, fixture TEXT NOT NULL, source_hash TEXT NOT NULL, input_hash TEXT NOT NULL, text TEXT NOT NULL, source_map TEXT NOT NULL);
CREATE VIRTUAL TABLE fixed_lexical USING fts5(text, content='passage', content_rowid='id');
CREATE VIRTUAL TABLE structure_lexical USING fts5(text, content='passage', content_rowid='id');
CREATE VIRTUAL TABLE fixed_vec USING vec0(embedding float[1536] distance_metric=cosine);
CREATE VIRTUAL TABLE structure_vec USING vec0(embedding float[1536] distance_metric=cosine);`);
const ids=new Map();
db.transaction(()=>{
 db.prepare('INSERT INTO profile VALUES (?,?,?)').run('baseline',JSON.stringify(corpus.profile),manifest.corpusHash);
 const put=db.prepare('INSERT INTO passage VALUES (?,?,?,?,?,?,?)');
 corpus.chunks.forEach((c,i)=>{const id=i+1;ids.set(id,c);put.run(id,c.variant,c.fixture,c.sourceHash,c.inputHash,c.text,JSON.stringify(c.spans));
 db.prepare(`INSERT INTO ${c.variant}_vec(rowid,embedding) VALUES (?,?)`).run(BigInt(id),buf(vector(c.text)));
 db.prepare(`INSERT INTO ${c.variant}_lexical(rowid,text) VALUES (?,?)`).run(id,c.text);});
})();
const buildMs=performance.now()-start;
const walPeak=fs.existsSync(dbFile+'-wal')?fs.statSync(dbFile+'-wal').size:0;
const sizeByTable=db.prepare('SELECT name,SUM(pgsize) bytes FROM dbstat GROUP BY name').all();
const lookup=id=>ids.get(Number(id));
const stop=new Set('a an the is are was were to of for and or in on by with does did do what how why which it its their they from as at be that this'.split(' '));
function search(query,variant,mode,k=5){
 const vec=()=>db.prepare(`SELECT rowid id,distance FROM ${variant}_vec WHERE embedding MATCH ? AND k=? ORDER BY distance`).all(buf(vector(query)),Math.min(k===5?10:k,corpus.chunks.filter(c=>c.variant===variant).length));
 const lexical=()=>{const terms=[...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu))].filter(x=>!stop.has(x)).map(x=>'"'+x+'"').join(' OR ');if(!terms)return[];
 return db.prepare(`SELECT rowid id,bm25(${variant}_lexical) score FROM ${variant}_lexical WHERE ${variant}_lexical MATCH ? ORDER BY score,rowid LIMIT ?`).all(terms,Math.max(10,k));};
 if(mode==='vector')return vec().slice(0,k);
 if(mode==='fts')return lexical().slice(0,k);
 const scores=new Map();for(const list of [vec(),lexical()])list.forEach((r,i)=>scores.set(Number(r.id),(scores.get(Number(r.id))??0)+1/(60+i+1)));
 return [...scores].map(([id,score])=>({id,score})).sort((a,b)=>b.score-a.score||a.id-b.id).slice(0,k);
}
function overlaps(c,ref){return c.spans.some(s=>s.record===ref.record&&Math.min(s.runEnd,ref.end)-Math.max(s.runStart,ref.start)>=Math.min(24,ref.end-ref.start));}
function covers(list,ref){const ranges=list.flatMap(c=>c.spans.filter(s=>s.record===ref.record).map(s=>[s.runStart,s.runEnd])).sort((a,b)=>a[0]-b[0]);let end=ref.start;for(const [a,z]of ranges){if(a>end)break;if(z>end)end=z;}return end>=ref.end;}
// Independent brute-force cosine check of the exact KNN result (Float32 storage, tie tolerant).
for(const variant of ['fixed','structure']){
 const q=Float32Array.from(vector(corpus.queries[0].query));
 const cosine=v=>{let dot=0,a=0,b=0;for(let i=0;i<q.length;i++){dot+=q[i]*v[i];a+=q[i]*q[i];b+=v[i]*v[i];}return 1-dot/Math.sqrt(a*b);};
 const distances=corpus.chunks.filter(c=>c.variant===variant).map(c=>cosine(Float32Array.from(vector(c.text)))).sort((a,b)=>a-b);
 const hits=search(corpus.queries[0].query,variant,'vector');assert.equal(hits.length,5);
 for(const h of hits){const expected=cosine(Float32Array.from(vector(lookup(h.id).text)));assert(Math.abs(h.distance-expected)<1e-5);assert(expected<=distances[4]+1e-6);}
}
const evaluations=[];
for(const variant of ['fixed','structure'])for(const mode of ['vector','fts','hybrid'])for(const q of corpus.queries){
 const hits=search(q.query,variant,mode),cs=hits.map(r=>lookup(r.id));const relevant=c=>q.facets.some(f=>f.alternatives.some(ref=>overlaps(c,ref)));
 const relevantTotal=corpus.chunks.filter(c=>c.variant===variant&&relevant(c)).length;
 const flags=cs.map(relevant),ndcg=flags.reduce((s,b,i)=>s+(b?1/Math.log2(i+2):0),0),ideal=Array.from({length:Math.min(5,relevantTotal)},(_,i)=>1/Math.log2(i+2)).reduce((a,b)=>a+b,0);
 const facets=q.facets.map(f=>f.alternatives.some(ref=>covers(cs,ref)));
 // Also evaluate a common 768-token ceiling, in retrieval order. Source ranges stay explicit; no model generates context.
 const bounded=[];let used=0;for(const c of cs){if(used+c.tokens>768)break;bounded.push(c);used+=c.tokens;}
 const boundedFacets=q.facets.map(f=>f.alternatives.some(ref=>covers(bounded,ref)));
 evaluations.push({query:q.id,variant,mode,negative:!!q.negative,precisionAt5:flags.filter(Boolean).length/5,ndcgAt5:ideal?ndcg/ideal:null,
   goldChunkRecallAt5:relevantTotal?flags.filter(Boolean).length/relevantTotal:null,evidenceFacetRecallAt5:facets.length?facets.filter(Boolean).length/facets.length:null,
   allContextFacetsAt5:facets.length?facets.every(Boolean):null,contextFacetsAt768:boundedFacets.length?boundedFacets.filter(Boolean).length/boundedFacets.length:null,
   allContextFacetsAt768:boundedFacets.length?boundedFacets.every(Boolean):null,returnedTokens:cs.reduce((n,c)=>n+c.tokens,0),boundedTokens:used,
   hits:hits.map((h,i)=>({...h,id:Number(h.id),chunk:cs[i].id,relevant:flags[i],text:cs[i].text,spans:cs[i].spans})),coveredFacets:facets,boundedCoveredFacets:boundedFacets});
}
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const summaries=[];for(const variant of ['fixed','structure'])for(const mode of ['vector','fts','hybrid']){const es=evaluations.filter(e=>e.variant===variant&&e.mode===mode&&!e.negative);summaries.push({variant,mode,queries:es.length,...Object.fromEntries(['precisionAt5','ndcgAt5','goldChunkRecallAt5','evidenceFacetRecallAt5','contextFacetsAt768','returnedTokens'].map(k=>[k,mean(es.map(e=>e[k]))])),sufficientAt5:es.filter(e=>e.allContextFacetsAt5).length,sufficientAt768:es.filter(e=>e.allContextFacetsAt768).length});}
function stats(samples){const xs=[...samples].sort((a,b)=>a-b);return{n:xs.length,p50:xs[Math.floor(xs.length*.5)],p95:xs[Math.min(xs.length-1,Math.floor(xs.length*.95))],max:xs.at(-1)};}
const timings={};for(const variant of ['fixed','structure'])for(const mode of ['vector','fts','hybrid']){const samples=[];for(let rep=0;rep<20;rep++)for(const q of corpus.queries){const t=performance.now();search(q.query,variant,mode);samples.push(performance.now()-t);}timings[variant+':'+mode]=stats(samples);}
// Abort a derived-index transaction and ensure neither metadata nor vector survives.
const before=db.prepare('SELECT count(*) n FROM passage').get().n;try{db.transaction(()=>{db.prepare('INSERT INTO passage VALUES (9999,?,?,?,?,?,?)').run('fixed','test','hash','hash','rollback','[]');db.prepare('INSERT INTO fixed_vec(rowid,embedding) VALUES (?,?)').run(9999n,buf(vector(corpus.chunks[0].text)));throw Error('injected interruption');})();}catch(e){assert.equal(e.message,'injected interruption');}
assert.equal(db.prepare('SELECT count(*) n FROM passage').get().n,before);assert.equal(db.prepare('SELECT count(*) n FROM fixed_vec WHERE rowid=9999').get().n,0);
const expected=search(corpus.queries[0].query,'fixed','vector');db.pragma('wal_checkpoint(TRUNCATE)');db.close();
const cold=[];for(let i=0;i<10;i++){const t=performance.now();db=open();const actual=search(corpus.queries[0].query,'fixed','vector');assert.deepEqual(actual,expected);cold.push(performance.now()-t);db.close();}
const output={createdUtc:new Date().toISOString(),profile:corpus.profile,manifestHash:hash(fs.readFileSync(artifact('upload-manifest.json'))),sourceChecks:verify(corpus),summaries,timings,coldConnectionAndQueryMs:stats(cold),buildMs,storage:{databaseBytes:fs.statSync(dbFile).size,walPeakBytes:walPeak,sizeByTable},checks:{exactAgainstBruteForce:true,atomicRollback:true,reopenSameResults:true,originalsUnchanged:true},evaluations};
write(artifact('results.json'),output);console.log(JSON.stringify({...output,evaluations:undefined},null,2));
