// @vitest-environment jsdom
// Diagnostic ordinary .ink opening through the actual native router and session.
import {it,expect,vi} from 'vitest';
import express from 'express';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createNativeDocumentStoreRouter} from '../../server/native-document-store.mjs';
import {ReactiveEditor} from '../../src/reactive-editor/editor';
import {nativeDocumentSession} from '../../src/persistence/native-session';
import {captureNative,nativeText} from '../../src/persistence/native-resource';
it('measures ordinary native file open with real storage guards and no document save',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cell-native-open-'));
 let server:any;const actualFetch=globalThis.fetch;const results:any[]=[];
 try{
  const bytes=await fs.readFile('data/Document.mutable.json');await fs.writeFile(path.join(root,'ordinary.ink'),bytes);
  const app=express();app.use('/api/native',createNativeDocumentStoreRouter({root}));
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  let transportMs=0;
  vi.stubGlobal('fetch',async(input:any,options:any)=>{const t=performance.now();const result=await actualFetch(typeof input==='string'&&input.startsWith('/')?`http://127.0.0.1:${server.address().port}${input}`:input,options);transportMs+=performance.now()-t;return result;});
  for(let run=0;run<5;run++){
   const editor=new ReactiveEditor({id:'w',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block',children:[]}]});
   try{
    const session=nativeDocumentSession(editor),timings:Record<string,number>={};const commit=editor.repository.commit.bind(editor.repository);
    editor.repository.commit=(label,ops,history,metadata)=>commit(label,ops,history,metadata,timings);
    transportMs=0;const start=performance.now(),id=await session.open({folder:'.',filename:'ordinary.ink'}),openMs=performance.now()-start;
    const state=editor.repository.readState(),cells=Object.values(state.contents).filter(c=>c.viewType==='text-cell').length;
    expect(cells).toBe(71);expect(editor.projections.size).toBe(0);expect(session.isDirty(id)).toBe(false);
    expect(await fs.readFile(path.join(root,'ordinary.ink'),'utf8')).toBe(bytes.toString());
    const serialized=nativeText(captureNative(state,id));expect(JSON.parse(serialized).resourceId).toBe(JSON.parse(bytes.toString()).resourceId);
    results.push({run,cells,openMs,transportMs,projections:editor.projections.size,timings});
   }finally{editor.dispose();}
  }
  await fs.mkdir('artifacts/cell-materialisation',{recursive:true});await fs.writeFile('artifacts/cell-materialisation/native-open.json',JSON.stringify({source:'data/Document.mutable.json copied unchanged to temporary ordinary.ink',environment:'Vitest/jsdom, real HTTP native router and session; no UI projection or mount',results},null,2));
  console.log(JSON.stringify(results));
 }finally{vi.unstubAllGlobals();if(server)await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});}
},60000);
