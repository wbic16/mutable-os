// Same actual Flint typing benchmark, with the qualified pre-remediation source.
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import solid from 'vite-plugin-solid';
const files=new Set(['src/persistence/native-resource.ts','src/persistence/native-session.ts','src/block-tree/resource-identity.ts','src/block-tree/linked-annotations.ts','src/block-tree/resource-boundary.ts','src/block-tree/repository.ts','src/runtime/linked-annotations.ts','src/reactive-editor/editor.ts','src/interchange/tei/native.ts']);
const baseline=()=>({name:'typing-baseline',enforce:'pre',load(id){const file=id.replace(process.cwd()+'/','');if(files.has(file))return execFileSync('git',['show','5e2f0f4:'+file],{encoding:'utf8'});}});
export default {root:process.cwd(),cacheDir:'artifacts/tei-performance/vite-baseline-cache',plugins:[baseline(),solid()],resolve:{alias:{'decode-named-character-reference':createRequire(import.meta.url).resolve('decode-named-character-reference')}},worker:{format:'es',plugins:[baseline()]},server:{host:'127.0.0.1',port:3109}};
