// Diagnostic-only companion. No application schema or runtime implementation changes.
import '../tei-performance/main';
import {prepareTeiDocument} from '../../src/interchange/tei/native';
import {decodeNative, parseNativeEnvelope} from '../../src/persistence/native-resource';
import {prepareLightweightFacts} from '../../src/knowledge/saved-reader';
import small from '../../src/interchange/tei/fixtures/A040080.xml?raw';
import large from '../../src/interchange/tei/fixtures/A041209.xml?raw';
const anthology=(sections:number)=>large.replace('</body>',Array.from({length:sections},(_,i)=>`<div n="${i}"><head>Correspondence section ${i+1}</head>`+Array.from({length:20},()=>'<p>A letter records a place, a date, and a reading. <persName ref="#missing">The correspondent</persName> retained the original wording, including <del>deleted</del> and <add>added</add> passages, for later scholarly interpretation.</p>').join('')+'</div>').join('')+'</body>');
const sources={small,large,anthology:anthology(12),extended:anthology(30)};
const win=window as any;
const probe=()=>({phase:'setup',ids:{} as Record<string,{count:number;ms:number}>,cells:0,cellMs:0});
const original=win.teiFlintPerformance;
win.teiFlintPerformance=async(name:string,compact=false)=>{
 const p=probe();win.__cellProbe=p;
 try {const result=await original(name,compact);return {...result,cellProbe:p,domElements:document.querySelectorAll('*').length,cellSpans:document.querySelectorAll('[data-inline-key]').length};}
 finally {delete win.__cellProbe;}
};
// Separately retained outputs allow CDP GC samples without keeping discarded graphs alive.
win.cellInspection=async(name:keyof typeof sources,mode:'parse'|'decode'|'facts')=>{
 const prepared=await prepareTeiDocument({name:name+'.tei',blob:new Blob([sources[name]])},{},false);
 const bytes=prepared.bytes;const p=probe();p.phase=mode;win.__cellProbe=p;
 try{
  const timings:Record<string,number>={},started=performance.now();
  if(mode==='parse')win.cellRetained=parseNativeEnvelope(bytes);
  if(mode==='decode')win.cellRetained=decodeNative(bytes,timings);
  if(mode==='facts')win.cellRetained=(await prepareLightweightFacts(bytes).materialize()).facts;
  return {name,mode,ms:performance.now()-started,timings,cellProbe:p,bytes:bytes.length};
 }finally{delete win.__cellProbe;}
};
