import {createHash} from 'node:crypto';
type Cache=(request:any)=>Promise<any>;
/** Fixed public APIs only: callers cannot turn this into a general URL proxy. */
export function authorityUrl(input:unknown){
 if(typeof input!=='string'||input.length>4096)throw Error('Invalid authority URL');const u=new URL(input);
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw Error('Invalid authority URL');
 const wiki=u.hostname==='www.wikidata.org'&&u.pathname==='/w/api.php',commons=u.hostname==='commons.wikimedia.org'&&u.pathname==='/w/api.php',gnd=u.hostname==='lobid.org'&&u.pathname==='/gnd/search';
 const allowed=wiki?['format','origin','action','language','languages','languagefallback','type','limit','search','ids','props']:commons?['format','origin','action','prop','titles','iiprop','iiurlwidth','iiextmetadatalanguage']:['q','format','size'];
 if(!wiki&&!commons&&!gnd||[...u.searchParams.keys()].some(k=>!allowed.includes(k)))throw Error('Unsupported authority request');
 if(wiki&&!['wbsearchentities','wbgetentities'].includes(u.searchParams.get('action')??'')||commons&&(u.searchParams.get('action')!=='query'||u.searchParams.get('prop')!=='imageinfo')||u.searchParams.get('format')!=='json')throw Error('Unsupported authority action');
 u.searchParams.sort();return u.toString();
}
export class SharedAuthorityCache {
 private pending=new Map<string,Promise<any>>();
 private retryAfter=new Map<string,number>();
 constructor(private cache:Cache,private fetcher:typeof fetch=fetch,private now=()=>Date.now()){}
 async get(input:unknown,refresh=false){
  const url=authorityUrl(input),key='authority-http/v1/'+createHash('sha256').update(url).digest('hex');
  const row=await this.cache({op:'get',key}).catch(()=>null),valid=row?.value?.schemaVersion===1&&row.value.url===url;
  if(valid&&!row.stale&&!refresh){if(row.value.failure)throw Error(row.value.failure);return {data:row.value.data,stale:false,fetchedAt:row.updatedAt,key};}
  const update=()=>{if(!refresh&&valid&&!row.value.failure&&(this.retryAfter.get(key)??0)>this.now())return Promise.resolve({data:row.value.data,stale:true,key,fetchedAt:row.updatedAt});const existing=this.pending.get(key);if(existing)return existing;if(this.pending.size>=32)return Promise.reject(Error('Authority request budget reached'));
   const work=this.refresh(key,url,valid?row:undefined).finally(()=>this.pending.delete(key));this.pending.set(key,work);return work;};
  if(valid&&!row.value.failure&&!refresh){void update().catch(()=>{});return {data:row.value.data,stale:true,fetchedAt:row.updatedAt,key};}
  return update();
 }
 private async refresh(key:string,url:string,stale:any){
  const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),12000);
  try{
   const response=await this.fetcher(url,{signal:abort.signal,redirect:'error',headers:{'User-Agent':'MutableOS/1.0 (authority metadata cache)','Accept':'application/json'}});
   if(!response.ok||!response.body)throw Error('Authority unavailable (HTTP '+response.status+')');
   const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;try{for(;;){const r=await reader.read();if(r.done)break;if((size+=r.value.length)>1_500_000)throw Error('Authority response budget exceeded');chunks.push(r.value);}}finally{await reader.cancel();}
   const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(data.error)throw Error('Authority rejected the request');
   const negative=Array.isArray(data.search)&&!data.search.length||Array.isArray(data.member)&&!data.member.length||data.entities&&Object.values(data.entities).every((v:any)=>v.missing!==undefined);
   await this.cache({op:'set',key,value:{schemaVersion:1,url,data},ttl:negative?300000:url.includes('wbsearchentities')||url.includes('/gnd/search')?3600000:7*86400000}).catch(()=>{});
   this.retryAfter.delete(key);return {data,stale:false,key,fetchedAt:new Date(this.now()).toISOString()};
  }catch(error){if(this.retryAfter.size>=128)this.retryAfter.delete(this.retryAfter.keys().next().value!);this.retryAfter.set(key,this.now()+60000);if(stale&&!stale.value.failure)return {data:stale.value.data,stale:true,key,fetchedAt:stale.updatedAt,warning:'Refresh unavailable'};
   const reason=error instanceof Error&&/^Authority (?:unavailable \(HTTP \d{3}\)|response budget exceeded|rejected the request)$/.test(error.message)?error.message:abort.signal.aborted?'Authority request timed out':'Authority network request failed';
   await this.cache({op:'set',key,value:{schemaVersion:1,url,failure:reason+'; retry after a minute.'},ttl:60000}).catch(()=>{});throw error;
  }finally{clearTimeout(timeout);}
 }
}
