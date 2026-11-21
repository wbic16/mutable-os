/** Focused source-proof, isolation and SQLite transaction checks; no network or application writes. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {build} from 'esbuild';
import {artifact,read,write,hash,verify,temp,makeChunks,validBounds,resolveSpan} from './experiment.mjs';
const corpus=read(artifact('corpus.json'));const proof=verify(corpus);
await build({stdin:{contents:`export {canonicalSearchSource} from './src/runtime/canonical-search-source.ts';`,resolveDir:process.cwd()},outfile:artifact('canonical-search.mjs'),bundle:true,platform:'node',format:'esm',target:'node22'});
const {canonicalSearchSource}=await import(artifact('canonical-search.mjs'));
// Native Cell positions differ from UTF-16. Include multi-code-unit Cell text and an inline image barrier.
const units=['A','😀','e\u0301',' ','a sentence. '.repeat(400),'\ufffc','after the image'];
const state={contents:{root:{inlineKind:'standoff',inlineContent:units.map((_,i)=>'p'+i)}},placements:{}};
units.forEach((text,i)=>{state.placements['p'+i]={contentKey:'c'+i};state.contents['c'+i]={viewType:text==='\ufffc'?'image-cell':'text-cell',payload:{text}};});
// A giant Cell is intentionally rejected; the experiment must never silently split a native coordinate.
let source=await canonicalSearchSource(state,'root',1);assert.equal(source.runs.length,2);assert(source.runs[0].boundaries.includes(-1));
const longFlow={key:'test',fixture:'unicode',resourceId:'r',sourceHash:'revision',parts:[{record:'r0',blockGuid:'b',text:source.runs[0].text,sourceUnits:units,coordinate:'cell',boundaries:source.runs[0].boundaries,occurrence:['p'],contribution:null}]};
assert.throws(()=>makeChunks([longFlow],'fixed'),/source unit exceeds/);
// Normal realistic Cells, including emoji/combining Cells, exercise both chunkers and round trips.
const normalUnits=['A','😀','e\u0301',' ',...Array.from('Long exact text. '.repeat(160)),'\ufffc',...Array.from('After the image.')];
state.contents.root.inlineContent=normalUnits.map((_,i)=>'q'+i);normalUnits.forEach((text,i)=>{state.placements['q'+i]={contentKey:'d'+i};state.contents['d'+i]={viewType:text==='\ufffc'?'image-cell':'text-cell',payload:{text}};});
source=await canonicalSearchSource(state,'root',1);
const records=source.runs.map((run,i)=>({id:'r'+i,resourceId:'r',sourceHash:'revision',blockGuid:'b',text:run.text,sourceUnits:normalUnits,coordinate:'cell',boundaries:validBounds(run,normalUnits,'cell'),occurrence:['p'],contribution:null}));
const flows=records.map(r=>({key:r.id,fixture:'unicode',resourceId:'r',sourceHash:'revision',parts:[{...r,record:r.id}]}));
const chunks=['fixed','structure'].flatMap(v=>makeChunks(flows,v));const unicode=verify({records,chunks});assert(chunks.every(c=>c.spans.length===1));assert(chunks.every(c=>!c.text.includes('\ufffc')));
const r=corpus.records[0],s=corpus.chunks.find(c=>c.spans.some(s=>s.record===r.id)).spans.find(s=>s.record===r.id);
assert.throws(()=>resolveSpan(r,s,'changed'),/Stale/);assert.throws(()=>resolveSpan(r,{...s,resourceId:'foreign'},r.sourceHash),/Foreign/);
assert.throws(()=>resolveSpan(r,{...s,occurrence:['other']},r.sourceHash),/occurrence/);
assert.throws(()=>resolveSpan({...r,sourceUnits:['changed',...r.sourceUnits.slice(1)]},s,r.sourceHash),/changed/);
// Content-hash reuse is independent of location: same text after a move/undo is reusable, edited text is not.
const inputHash=hash(r.text);assert.equal(hash(r.text),inputHash);assert.notEqual(hash(r.text+' changed'),inputHash);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mutable-retrieval-check-')),file=path.join(dir,'retrieval.db');
let db=new Database(file);db.loadExtension(path.join(temp,'package/vec0.dylib'));const version=db.prepare('select vec_version() v').get().v;assert.equal(version,'v0.1.9');
db.exec('CREATE TABLE passage(id INTEGER PRIMARY KEY,text TEXT); CREATE VIRTUAL TABLE embedding USING vec0(v float[1536] distance_metric=cosine)');
const vector=new Float32Array(1536);vector[0]=1;const buf=Buffer.from(vector.buffer);
const insert=(id,text)=>{db.prepare('INSERT INTO passage VALUES(?,?)').run(id,text);db.prepare('INSERT INTO embedding(rowid,v) VALUES(?,?)').run(BigInt(id),buf);};
db.transaction(()=>insert(1,'committed'))();assert.throws(()=>db.transaction(()=>{insert(2,'aborted');throw Error('interrupt');})(),/interrupt/);
assert.equal(db.prepare('select count(*) n from passage').get().n,1);assert.equal(db.prepare('select count(*) n from embedding').get().n,1);
db.close();db=new Database(file);db.loadExtension(path.join(temp,'package/vec0.dylib'));const nearest=db.prepare('select rowid,distance from embedding where v match ? and k=1').get(buf);assert.equal(nearest.rowid,1);assert.equal(nearest.distance,0);db.close();fs.rmSync(dir,{recursive:true});
let persistedSourceMaps=null;
if(fs.existsSync(artifact('retrieval.db'))){
 const saved=new Database(artifact('retrieval.db'),{readonly:true});
 const rows=saved.prepare('SELECT * FROM passage ORDER BY id').all();assert.equal(rows.length,corpus.chunks.length);
 rows.forEach((row,i)=>{const c=corpus.chunks[i];assert.equal(row.text,c.text);assert.equal(row.source_hash,c.sourceHash);assert.equal(row.input_hash,c.inputHash);assert.deepEqual(JSON.parse(row.source_map),c.spans);});
 assert.equal(saved.prepare('SELECT corpus_hash FROM profile').get().corpus_hash,read(artifact('upload-manifest.json')).corpusHash);
 saved.close();persistedSourceMaps={passages:rows.length,spans:proof.spans,exact:true};
}
write(artifact('local-checks.json'),{persistedSourceMaps,createdUtc:new Date().toISOString(),sourceProof:proof,unicode,sqliteVersion:version,atomicRollback:true,reopen:true,staleRejection:true,foreignResourceRejection:true,foreignOccurrenceRejection:true,changedExcerptRejection:true,hashReuseProof:true,networkCalls:0,applicationHooksAdded:0,notes:'Hash-reuse test is a pure proof; not an application Undo/Redo or save integration qualification.'});
console.log(fs.readFileSync(artifact('local-checks.json'),'utf8'));
