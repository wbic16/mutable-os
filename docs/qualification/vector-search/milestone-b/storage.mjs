import Database from 'better-sqlite3';import {load} from 'sqlite-vec';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'retrieval-storage-')),results=[];
try{for(const chunk of [32,128,1024])for(const page of [4096,8192]){
 const file=path.join(dir,`${chunk}-${page}.db`),db=new Database(file);load(db);db.pragma(`page_size=${page}`);db.exec(`CREATE VIRTUAL TABLE v USING vec0(embedding float[1536] distance_metric=cosine,chunk_size=${chunk})`);
 let prior=0;const v=new Float32Array(1536);v[0]=1;const blob=Buffer.from(v.buffer),put=db.prepare('INSERT INTO v(rowid,embedding) VALUES (?,?)');
 for(const count of [0,1,34,128,1024,10000]){const t=performance.now();db.transaction(()=>{for(let i=prior;i<count;i++)put.run(BigInt(i+1),blob);})();prior=count;const times=[];if(count)for(let i=0;i<10;i++){const q=performance.now();db.prepare('SELECT rowid,distance FROM v WHERE embedding MATCH ? AND k=5').all(blob);times.push(performance.now()-q);}times.sort((a,b)=>a-b);results.push({chunk,page,count,bytes:fs.statSync(file).size,rawVectorBytes:count*1536*4,insertAndTenQueryMs:performance.now()-t,queryP50:times[5]??null});}
 db.close();}
 fs.writeFileSync('docs/qualification/vector-search/milestone-b/storage.json',JSON.stringify({runtime:process.version,sqliteVec:'0.1.9',dimensions:1536,results},null,2));console.log('Storage measurements saved');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
