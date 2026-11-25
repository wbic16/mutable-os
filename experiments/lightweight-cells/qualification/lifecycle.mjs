// Bundle with esbuild --platform=node. Run using node --expose-gc.
import assert from 'node:assert/strict';
import {TreeCommands} from '../../../src/block-tree/commands.ts';
import {CanonicalRepository} from '../../../src/block-tree/repository.ts';
import {observeCellWork} from '../../../src/block-tree/cell-diagnostics.ts';
import {ResidentCells} from '../../../src/block-tree/resident-cells.ts';
const [, , kind='fragmented']=process.argv;
const gc=async()=>{await new Promise(setImmediate);global.gc();await new Promise(setImmediate);global.gc();return process.memoryUsage().heapUsed;};
const evidence={kind,heap:{},timings:[],history:[],reclaimed:{}};
evidence.heap.empty=await gc();
const diag=observeCellWork();
let weakCell,weakSequence,weakRepo,weakContent;
const retainedReleaseCallbacks=[];
const open=ResidentCells.open;
ResidentCells.open=function(...args){const result=open.call(this,...args);if(result){
  weakSequence=new WeakRef(result); weakCell=new WeakRef(result.cells[Math.floor(result.cells.length/2)]);
}return result;};
function state(length,count,n){
 const contents={}, placements={},children=[];
 for(let i=0;i<n;i++){
   const id='b'+i,text=('a'+i+'🌿text ').repeat(length).slice(0,length);
   contents[id]={key:id,viewType:'standoff-editor-block',payload:{id,standoffProperties:Array.from({length:count},(_,j)=>({type:'style/bold',start:0,end:j%8}))},children:[],inlineContent:[],ownedRelations:{},opaqueRelations:{},wireChildren:'omitted',wireRelation:'omitted',inlineRevision:0,revision:0,inlineKind:'standoff',compactInline:{version:1,spans:[{kind:'text',text}]}};
   placements[id]={key:id,kind:'owned',contentKey:id};children.push(id);
 }
 contents.doc={key:'doc',viewType:'document-block',payload:{id:'doc'},children,inlineContent:[],ownedRelations:{},opaqueRelations:{},wireChildren:'present',wireRelation:'omitted',revision:0,inlineRevision:0};
 placements.root={key:'root',kind:'owned',contentKey:'doc'};
 return {rootPlacementKey:'root',contents,placements,revision:0};
}
function time(label,operation){const t=performance.now();const result=operation();evidence.timings.push({label,ms:performance.now()-t});return result;}
async function trial(){
 const long=kind.startsWith('large'), n=long?1:200;
 const repo=new CanonicalRepository(state(long?120000:1000,kind==='large'?1000:20,n),{compactCanonicalText:true});
 evidence.characters=Array.from(repo.readState().contents.b0.compactInline.spans[0].text).length;
 weakRepo=new WeakRef(repo);weakContent=new WeakRef(repo.readState().contents.b0);
 const edit=(key,start,end,text)=>assert.ok(repo.commitResidentText(key,start,end,text,'type',{}));
 evidence.heap.open=await gc();
 for(let i=0;i<n;i++)repo.acquireResidentCells('b'+i)();
 assert.equal(diag.counts.allocations,0);
 evidence.heap.scrolled=await gc();
 const release=time('first lease',()=>repo.acquireResidentCells('b0'));
 const second=time('second lease',()=>repo.acquireResidentCells('b0'));
 time('first edit',()=>edit('b0',1,1,'a'));time('warm edit',()=>edit('b0',2,2,'b'));
 time('release one',second);
 time('last release and cold export',release);
 retainedReleaseCallbacks.push(release,second);
 evidence.heap.evicted=await gc();
 evidence.reclaimed.sequenceAfterEvict=!weakSequence.deref();evidence.reclaimed.nonEndpointAfterEvict=!weakCell.deref();
 if (!process.env.RECORD_BASELINE) assert.ok(evidence.reclaimed.sequenceAfterEvict&&evidence.reclaimed.nonEndpointAfterEvict);
 const renewed=repo.acquireResidentCells('b0');time('rehydrate and edit',()=>edit('b0',0,0,'c'));
 time('cold export alone',()=>void repo.readState().contents.b0.payload.standoffProperties);
 time('last release after export',renewed);
 const final=repo.acquireResidentCells('b0');edit('b0',0,0,'d');
 for(let i=1;i<Math.min(n,20);i++){const close=repo.acquireResidentCells('b'+i);edit('b'+i,8,8,'m');close();}
 evidence.heap.editedBlocks=await gc();
 for(let i=0;i<30;i++){const key='b'+(n===1?0:1);const close=repo.acquireResidentCells(key);edit(key,1,1,'e');close();}
 evidence.heap.churn=await gc();
 let seed=173,index=0;
 for(let i=1;i<=(long?100:2500);i++){
   const at=kind==='fragmented'?(seed=(Math.imul(seed,1664525)+1013904223)>>>0)%800:200+i;
   edit('b0',at,at,'x');
   if([100,250,1000,2500].includes(i)){
     const model=repo.residents.get("b0").cells;
     evidence.history.push({edits:i,heap:await gc(),runs:model?.current.version.runs.length});
   }
 }
 final();retainedReleaseCallbacks.push(renewed,final);evidence.heap.finalEviction=await gc();
}
async function largeComparison() {
  const cases=[];
  for(const count of [20,1000]) {
    for(const enabled of count===20?[false,true]:[true,false]) {
      const repo=new CanonicalRepository(state(120000,count,1),{compactCanonicalText:true,residentCellBoundaries:enabled});
      const commands=new TreeCommands(repo,key=>key), release=repo.acquireResidentCells('b0');
      const length=Array.from(repo.readState().contents.b0.compactInline.spans[0].text).length;
      const first=performance.now();commands.replaceInlineRange('b0',12,12,'Q');
      const firstMs=performance.now()-first;
      const samples=[];
      for(let i=0;i<24;i++){
        const start=[12,Math.floor(length/2),length+1+i][i%3];
        const t=performance.now();commands.replaceInlineRange('b0',start,start,'Q');
        samples.push({where:['start','middle','append'][i%3],ms:performance.now()-t});
      }
      assert.equal(Array.from(repo.readState().contents.b0.compactInline.spans[0].text).length,length+25);
      release();cases.push({count,enabled,firstMs,samples});
    }
  }
  return {kind,characters:106667,cases};
}
if(kind==='large-control'){
 console.log(JSON.stringify(await largeComparison()));diag.stop();ResidentCells.open=open;
}else{
await trial();evidence.heap.closed=await gc();
evidence.retainedReleaseCallbacks=retainedReleaseCallbacks.length;
evidence.reclaimed.repositoryAfterClose=!weakRepo.deref();evidence.reclaimed.contentAfterClose=!weakContent.deref();
assert.ok(evidence.reclaimed.repositoryAfterClose&&evidence.reclaimed.contentAfterClose);
evidence.work=diag.counts;diag.stop();ResidentCells.open=open;
console.log(JSON.stringify(evidence,null,2));
 }
