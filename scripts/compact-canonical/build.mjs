import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {build} from 'vite';
import solid from 'vite-plugin-solid';
import {experimentalOverlays} from './overlays.mjs';
// Fail closed if ANY production native character/image atom is constructed
// while the compact admission/read-only operation is being measured.
const probe={name:'forbid-canonical-cells',enforce:'pre',load(id){
 if(!id.endsWith('/src/history/stage-c-gates/portable.ts'))return;
 const s=readFileSync(id,'utf8'),needle='const atom = (type: string, payload: JsonObject) => {';
 if(!s.includes(needle))throw Error('Native atom probe needs review');
 return s.replace(needle,needle+`\nif((globalThis as any).__forbidCells)throw Error('Forbidden canonical Cell construction');(globalThis as any).__atomCount=((globalThis as any).__atomCount??0)+1;`);
}};
await build({configFile:false,plugins:[probe,experimentalOverlays(process.env.COMPACT_M2==='0'),solid()],resolve:{alias:{'decode-named-character-reference':createRequire(import.meta.url).resolve('decode-named-character-reference')}},build:{target:'esnext',sourcemap:false,outDir:process.env.COMPACT_SITE??'artifacts/compact-canonical-m2/site',rollupOptions:{input:'scripts/compact-canonical/index.html'}}});
