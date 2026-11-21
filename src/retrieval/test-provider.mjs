// Qualification-only provider. Loaded explicitly by a trusted test host, never selected by the product.
import fs from 'node:fs';import {createHash} from 'node:crypto';
export function createProvider(options={}){
 const identity=options.identity??{provider:'test',model:'deterministic-test',dimensions:32};const cache=options.cacheFile?JSON.parse(fs.readFileSync(options.cacheFile)).vectors:null;
 return {external:!!options.external,identity,async embed(texts,{signal}){
  if(options.delayMs)await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,options.delayMs);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('Cancelled test provider'));},{once:true});});
  return {vectors:texts.map(s=>{const h=createHash('sha256').update(s).digest('hex');if(cache){if(!cache[h])throw Error('No cached embedding for source text');return cache[h];}return Array.from({length:identity.dimensions},(_,i)=>(parseInt(h.slice((i%32)*2,(i%32)*2+2),16)+1)/256);}),usage:texts.length,requestId:'local-test-no-network'};
 }};
}
