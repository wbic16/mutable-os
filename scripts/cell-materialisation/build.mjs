// Inject measurement into the QA bundle only. Repository source files stay intact.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {build} from 'vite';
import solid from 'vite-plugin-solid';
const replace=(source,from,to)=>{if(!source.includes(from))throw Error('Probe source changed: '+from);return source.replace(from,to);};
const probe={name:'cell-investigation-probes',enforce:'pre',load(id){
 const file=id.replace(process.cwd()+'/','');
 if(file==='src/block-tree/ids.ts'){
  let s=readFileSync(id,'utf8');s=replace(s,'const id = globalThis.crypto',`const p=(globalThis as any).__cellProbe, t=p?performance.now():0;\n  const id = globalThis.crypto`);
  return replace(s,'return `${prefix}:${id}`;',`if(p){const k=p.phase+'/'+prefix, v=p.ids[k]??={count:0,ms:0};v.count++;v.ms+=performance.now()-t;}\n  return \`\${prefix}:\${id}\`;`);
 }
 if(file==='src/history/stage-c-gates/portable.ts'){
  let s=readFileSync(id,'utf8');s=replace(s,'for (const span of b.inline!) {',`const probe=(globalThis as any).__cellProbe, priorPhase=probe?.phase, cellStarted=probe?performance.now():0; if(probe)probe.phase='cell-decode';\n      for (const span of b.inline!) {`);
  return replace(s,'} else requireValue(b.inline === undefined, "unexpected inline content");',`if(probe){probe.cellMs+=performance.now()-cellStarted;probe.cells+=c.inlineContent.length;probe.phase=priorPhase;}\n    } else requireValue(b.inline === undefined, "unexpected inline content");`);
 }
 if(file==='scripts/tei-performance/main.tsx'){
  let s=readFileSync(id,'utf8');for(const phase of ['admission','candidate','open'])s=replace(s,`phase='${phase}';`,`phase='${phase}';if((window as any).__cellProbe)(window as any).__cellProbe.phase='${phase}';`);return s;
 }
}};
await build({configFile:false,plugins:[probe,solid()],resolve:{alias:{'decode-named-character-reference':createRequire(import.meta.url).resolve('decode-named-character-reference')}},worker:{format:'es'},build:{target:'esnext',sourcemap:true,outDir:'artifacts/cell-materialisation/site',rollupOptions:{input:'scripts/cell-materialisation/index.html'}}});
