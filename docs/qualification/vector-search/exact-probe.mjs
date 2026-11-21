// Isolated investigation only: synthetic vectors, temporary databases, no provider calls.
// node docs/qualification/vector-search/exact-probe.mjs EXTENSION_DIRECTORY OUTPUT_JSON
import {createRequire} from 'node:module';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
const require=createRequire(path.join(process.cwd(),'package.json')),Database=require('better-sqlite3');
const [extensionDir,output]=process.argv.slice(2),dir=fs.mkdtempSync(path.join(os.tmpdir(),'mutable-vector-probe-'));
let seed=42;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)-0.5;
const results=[];const assert=(condition,label)=>{if(!condition)throw Error(label);};
try{
 for(const [n,d]of [[1000,384],[10000,384],[10000,1536]]){
  const vectors=Array.from({length:n},()=>{const a=Float32Array.from({length:d},random);return Buffer.from(a.buffer);});
  for(const kind of ['vec0','vec1-flat']){
   const file=path.join(dir,`${kind}-${n}-${d}.db`),db=new Database(file);
   db.loadExtension(path.join(extensionDir,kind==='vec0'?'package/vec0.dylib':'vec1.dylib'));
   const version=db.prepare(kind==='vec0'?'select vec_version() v':'select vec1_info() v').get().v;
   db.exec(`CREATE VIRTUAL TABLE vectors USING ${kind==='vec0'?`vec0(embedding float[${d}])`:'vec1(embedding)'}; CREATE TABLE passage(id INTEGER PRIMARY KEY, blockGuid TEXT NOT NULL)`);
   const insert=db.prepare('insert into vectors(rowid,embedding) values(?,?)'),meta=db.prepare('insert into passage values(?,?)');
   let t=performance.now();db.transaction(()=>vectors.forEach((v,i)=>{insert.run(BigInt(i+1),v);meta.run(i+1,'block-'+(i+1));}))();const insertMs=performance.now()-t;
   t=performance.now();if(kind!=='vec0')db.exec(`insert into vectors(cmd,arg) values('rebuild','{index:"flat",distance:"l2"}')`);const indexMs=performance.now()-t;
   const sql=kind==='vec0'?'select rowid from vectors where embedding match ? and k=10 order by distance':`select rowid from vectors(?, '{K:10}')`;
   const query=db.prepare(sql);const times=[];for(let i=0;i<23;i++){const target=(i*397)%n;t=performance.now();const rows=query.all(vectors[target]);const ms=performance.now()-t;assert(Number(rows[0].rowid)===target+1,'exact self neighbour');if(i>=3)times.push(ms);}
   times.sort((a,b)=>a-b);
   const row=query.get(vectors[0]);assert(db.prepare('select blockGuid from passage where id=?').get(row.rowid).blockGuid==='block-1','source join');
   db.exec('BEGIN');db.prepare('delete from vectors where rowid=1').run();db.prepare('delete from passage where id=1').run();db.exec('ROLLBACK');assert(Number(query.get(vectors[0]).rowid)===1,'rollback');
   db.close();const reopen=new Database(file,{readonly:true});reopen.loadExtension(path.join(extensionDir,kind==='vec0'?'package/vec0.dylib':'vec1.dylib'));assert(Number(reopen.prepare(sql).get(vectors[0]).rowid)===1,'reopen');reopen.close();
   results.push({kind,version,n,dimensions:d,insertMs,indexMs,warmP50Ms:times[10],warmP95Ms:times[18],databaseBytes:fs.statSync(file).size,rawVectorBytes:n*d*4,sourceJoin:true,rollback:true,reopen:true});
  }
 }
 const result={date:'2026-11-13',runtime:{node:process.version,betterSqlite3:require('better-sqlite3/package.json').version,sqlite:new Database(':memory:').prepare('select sqlite_version() v').get().v,platform:process.platform,arch:process.arch,cpu:os.cpus()[0].model},vec1SourceSha256:createHash('sha256').update(fs.readFileSync(path.join(extensionDir,'vec1.c'))).digest('hex'),notes:'Synthetic Float32, L2, one insertion transaction, temporary disk DB, default DELETE journal, 3 warmups + 20 queries; embedding generation excluded; no ANN, relevance or UI measurement.',results};fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
