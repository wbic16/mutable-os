// Bundle this Node-only study with the workspace esbuild (see the report).
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CellText} from './cells.mjs';
import {ResidentCells} from '../../src/block-tree/resident-cells.ts';
import {replaceCompact, inlineText} from '../../src/block-tree/inline-sequence.ts';
import {mapStandoffPropertiesForReplacement as mapRanges} from '../../src/interchange/ranges.ts';

const summary = values => {
  const ordered = [...values].sort((a,b)=>a-b);
  return {p50:ordered[Math.ceil(values.length*.50)-1], p95:ordered[Math.ceil(values.length*.95)-1]};
};
function fixture(n, count, salt = 0) {
  // Distinct materialised ASCII strings, rather than one repeated/interned payload.
  const chars = Buffer.alloc(n);
  for (let i=0; i<n; i++) chars[i]=97+((salt*17+i*31+Math.floor(i/17))%26);
  const text = chars.toString('latin1');
  const properties = Array.from({length:count},(_,i)=>{
    const start=(37*i+salt)%n;
    return {type:'study/range', id:'p'+i, value:'entity'+i%11,start,end:Math.min(n-1,start+1+i%29)};
  });
  return {text, properties};
}
function compact(text, properties) {
  return {key:'host',viewType:'standoff-editor-block',payload:{standoffProperties:properties},
    inlineKind:'standoff', compactInline:{version:1,spans:text?[{kind:'text',text}]:[]},
    inlineContent:[],children:[],ownedRelations:{},opaqueRelations:{},revision:0,inlineRevision:0};
}
function change(record, start, end, text, origins=[]) {
  return replaceCompact(record,start,end,text?[{kind:'text',text}]:[],origins);
}

function prove() {
  let seed=14377, checks=0;
  const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed%n;};
  function compare(trace, initial, properties) {
    let stock=compact(initial,properties);
    const cells=new CellText(initial,properties);
    for(const [s,e,t] of trace) {
      const before=cells.cells.slice();
      const origins=[], actual=[];
      stock=change(stock,s,e,t,origins);
      const work=cells.replace(s,e,t);
      assert.deepEqual(cells.properties(actual),stock.payload.standoffProperties);
      assert.deepEqual(actual,origins);
      assert.equal(cells.text(),inlineText(stock.compactInline.spans));
      const inserted=Array.from(t).length;
      for(let i=0;i<before.length;i++){
        if(i>=s&&i<e)continue;
        const now=i<s?i:i+inserted-e+s;
        assert.equal(cells.cells[now],before[i]); assert.equal(before[i].index,now);
      }
      assert.equal(work.suffixWrites,inserted===e-s?0:before.length-e);
      if(s===e)assert.equal(work.touchedRanges,0);
      const expectedOwners=new Set([...cells.ranges].flatMap(r=>[r.first,r.last]));
      assert.equal(cells.owners.size,expectedOwners.size);
      for(const [cell,bucket] of cells.owners)for(const range of bucket){
        assert.ok(cells.ranges.has(range) && (cell===range.first || cell===range.last));
      }
      checks++;
    }
  }
  for(let s=0;s<=6;s++)for(let e=s;e<=6;e++)for(const t of ['','x','🙂x']){
    const props=[];for(let a=0;a<6;a++)for(let b=a;b<6;b++)props.push({id:'duplicate',start:a,end:b});
    compare([[s,e,t]],'abcdef',props);
  }
  for(let i=0;i<100;i++){
    let length=32;const trace=[];
    for(let j=0;j<32;j++){
      const s=rand(length+1), e=s+rand(length-s+1), t=['','a','🙂','e\u0301','paste me'][rand(5)];
      trace.push([s,e,t]);length+=Array.from(t).length-e+s;
    }
    compare(trace,'x'.repeat(32),fixture(32,48,i).properties);
  }
  compare([[2,2,'a'.repeat(150000)],[1,150003,'🙂']],'abcd',[{start:0,end:3},{start:1,end:2}]);
  // Observe real setter/getter activity independently of the reported counts.
  const instrumented=[];
  for (const [s,e,t] of [[250,250,'X'.repeat(2048)],[250,251,''],[250,310,'x'.repeat(60)],[1000,1000,'!']]){
    const c=new CellText('x'.repeat(1000),Array.from({length:500},()=>({start:40,end:900})));
    let writes=0, reads=0;
    for(const cell of c.cells){
      let index=cell.index;
      Object.defineProperty(cell,'index',{get:()=>index,set:v=>{index=v;writes++;}});
    }
    for(const range of c.ranges)for(const k of ['first','last']){
      const endpoint=range[k];Object.defineProperty(range,k,{get:()=>{reads++;return endpoint;}});
    }
    c.replace(s,e,t);
    assert.equal(writes,t.length===e-s?0:1000-e);assert.equal(reads,0);
    instrumented.push({start:s,end:e,insert:t.length,survivingIndexWrites:writes,unaffectedEndpointReads:reads});
  }
  return {checks,instrumented};
}

// A simple no-copy numeric control for ordinary ranges. Measures range arithmetic
// alone, without text storage, renderer, cloning, history or DTO construction.
function numericRepair(props,s,e,k) {
  const delta=k-e+s;
  let kept=0;
  for(const p of props){
    if (p.end<s) {props[kept++]=p;continue;}
    if (p.start>=e) {p.start+=delta;p.end+=delta;}
    else if(p.start<s && p.end>=e)p.end+=delta;
    else if(p.start<s)p.end=s-1;
    else if(p.end>=e){p.start=s+k;p.end+=delta;}
    else continue;
    props[kept++]=p;
  }
  props.length=kept;
}

function measure(name,n,a,start,removed,added) {
  const {text,properties}=fixture(n,a);
  if(name==='shared-delete')for(const p of properties){p.start=start;p.end=start+removed-1;}
  const record=compact(text,properties);
  const insert='v'.repeat(added), end=start+removed, target=change(record,start,end,insert);
  const samples={compact:[],mapperOnly:[],numericOnly:[],cells:[],exportRanges:[]};
  let work;
  for(let trial=0; trial<42; trial++){
    const cells=new CellText(text,properties);
    const plain=properties.map(p=>({...p}));
    const call=(key,fn)=>{
      const before=performance.now();
      const value=fn(), duration=performance.now()-before;
      if(trial>=10)samples[key].push(duration);
      return value;
    };
    const runCell=()=>{
      work=call('cells',()=>cells.replace(start,end,insert));
      const values=call('exportRanges',()=>cells.properties());
      assert.deepEqual(values,target.payload.standoffProperties);
    };
    const runOffset=()=>{
      const mapped=call('compact',()=>change(record,start,end,insert));
      const pure=call('mapperOnly',()=>mapRanges(properties,start,end,added,[],n));
      call('numericOnly',()=>numericRepair(plain,start,end,added));
      assert.deepEqual(plain,pure);
      assert.deepEqual(mapped.payload.standoffProperties,pure);
    };
    if(trial%2){runCell();runOffset();}else{runOffset();runCell();}
  }
  return {name,n,a,start,removed,added,work,ms:Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,summary(v)]))};
}

function collect(){for(let i=0;i<4;i++)global.gc();return process.memoryUsage();}
function materialise(mode){
  const documents=[];
  for(let b=0;b<1000;b++){
    const {text,properties}=fixture(1000,10,b);
    const record=compact(text,properties);
    documents.push(mode==='allCells'?new CellText(text,properties):
      mode==='window'&&b<20?{record,cells:new CellText(text,properties)}:record);
  }
  return documents;
}

function productionBoundaries(n, count) {
  const {text,properties} = fixture(n,count);
  let record = compact(text, properties);
  const model = ResidentCells.open(record);
  const at = Math.floor(n/2), compactSamples = [], residentSamples = [];
  for (let i=0;i<70;i++) {
    const before = performance.now();
    record = change(record,at,at,'x');
    const expected = record.payload.standoffProperties.at(-1)?.end;
    const numericMs = performance.now()-before;
    const t = performance.now();
    model.plan(at,at,'x').apply();
    const actual = model.annotations().at(-1)?.end;
    const cellMs = performance.now()-t;
    assert.equal(actual, expected);
    if (i >= 10) { compactSamples.push(numericMs); residentSamples.push(cellMs); }
    record = change(record,at,at+1,'');
    model.plan(at,at+1,'').apply();
  }
  return {characters:n, properties:count, compactMs:summary(compactSamples), residentMs:summary(residentSamples)};
}

if (process.argv[2]==='production') {
  const bounds = [[1000,18],[1000,1000],[25000,18],[25000,1000]].map(([n,a])=>productionBoundaries(n,a));
  const memory = ['cold','20 active','all active'].map(mode=>{
    const child=spawnSync(process.execPath,['--expose-gc',fileURLToPath(import.meta.url),'production-memory',mode],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
    return JSON.parse(child.stdout);
  });
  console.log(JSON.stringify({node:process.version,bounds,memory},null,2));
} else if (process.argv[2]==='production-memory') {
  const mode=process.argv[3], before=collect(), blocks=[];
  for(let i=0;i<1000;i++) {
    const {text,properties}=fixture(1000,10,i);
    const record=compact(text,properties);
    if(mode==='all active' || (mode==='20 active' && i<20)) {
      const model=ResidentCells.open(record);
      blocks.push({model,record:model.current.record()});
    } else blocks.push(record);
  }
  globalThis.retained=blocks;
  console.log(JSON.stringify({mode,heapBytes:collect().heapUsed-before.heapUsed}));
} else if(process.argv[2]==='memory'){
  const mode=process.argv[3], before=collect();
  const start=performance.now();globalThis.retained=materialise(mode);
  const buildMs=performance.now()-start, after=collect();
  assert.equal(globalThis.retained.length,1000);
  console.log(JSON.stringify({mode,buildMs,heap:after.heapUsed-before.heapUsed,external:after.external-before.external,rss:after.rss-before.rss}));
}else if(process.argv[2]==='prove'){
  console.log(JSON.stringify(prove()));
}else{
  // Keep correctness instrumentation (accessor descriptors) out of timed V8 ICs.
  const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'prove'],{encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);
  const checks=JSON.parse(child.stdout), cases=[];
  for(let i=0;i<3;i++) measure('warmup',1500,60,100,20,40);
  for(const [n,a] of [[1000,0],[1000,20],[1000,1000],[25000,20],[25000,1000],[120624,1]]){
    for(const start of [0,Math.floor(n/2),n])
      cases.push(measure('insert',n,a,start,0,1));
  }
  for(const [name,removed,added] of [['backspace',1,0],['paste',0,2048],['cut',512,0],['replace',512,1536],['equal',512,512],['shared-delete',512,0]]){
    cases.push(measure(name,1000,1000,250,removed,added));
  }
  const memory=[];
  for(let i=0;i<3;i++)for(const mode of ['compact','window','allCells']){
    const child=spawnSync(process.execPath,['--expose-gc',fileURLToPath(import.meta.url),'memory',mode],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);memory.push(JSON.parse(child.stdout));
  }
  console.log(JSON.stringify({node:process.version,checks,cases,memory},null,2));
}
