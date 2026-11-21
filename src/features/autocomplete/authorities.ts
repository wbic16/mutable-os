import {sharedCacheRequest} from '../../application/shared-cache';
import {featureFlags} from '../../configuration';
/** Explicit, bounded public-authority reads. No requests are triggered by editor typing. */
export type Authority = 'wikidata'|'gnd';
import type { AuthorityRecord } from '../../feature-api/entities';
export type { AuthorityRecord } from '../../feature-api/entities';
const cache=new Map<string,unknown>();
async function json(url:string,signal:AbortSignal,vault='.'):Promise<any> {
 signal.throwIfAborted();if(featureFlags.authorityCache){const result=await sharedCacheRequest('authority',{url,vault},signal);return {...result.data,__cache:{key:result.key,stale:result.stale,fetchedAt:result.fetchedAt,vault}};}if(cache.has(url))return cache.get(url);
 const response=await fetch(url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
 if(!response.ok)throw Error(`Authority returned HTTP ${response.status}. Retry later; no automatic retries.`);
 if(!response.body)throw Error('Authority returned no data');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 try {while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;if((total+=value.length)>1_000_000)throw Error('Authority response exceeded the 1 MB budget');chunks.push(value);}}finally{await reader.cancel();}
 const data=new Uint8Array(total);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
 const result=JSON.parse(new TextDecoder().decode(data));if(result.error)throw Error(result.error.info??'Authority rejected the request');
 if(cache.size>=32)cache.delete(cache.keys().next().value!);cache.set(url,result);return result;
}
const wiki=(params:Record<string,string>)=>'https://www.wikidata.org/w/api.php?'+new URLSearchParams({format:'json',origin:'*',...params});
const strings=(items:any[])=>items.filter(v=>typeof v==='string').map(v=>v.slice(0,1000)).slice(0,20);
function gnd(row:any):AuthorityRecord {
 const id=String(row.gndIdentifier??'');if(!/^[0-9X-]{3,30}$/u.test(id))throw Error('Invalid GND identifier');
 const linked=(row.sameAs??[]).map((r:any)=>r.id).find((id:any)=>typeof id==='string'&&/^https?:\/\/www.wikidata.org\/entity\/Q[1-9]\d*$/u.test(id));
 return {provider:'gnd',id,name:String(row.preferredName??id).slice(0,1000),description:strings(row.biographicalOrHistoricalInformation??[]).join(' '),aliases:strings(row.variantName??[]),url:'https://d-nb.info/gnd/'+id,retrievedAt:new Date().toISOString(),wikidata:linked?.split('/').at(-1)};
}
export async function searchAuthority(provider:Authority,query:string,signal:AbortSignal,vault='.') :Promise<AuthorityRecord[]> {
 if(!query.trim()||query.length>256)throw Error('Enter an authority query of 1–256 characters');
 if(provider==='gnd') {const escaped=query.replace(/[+\-=!(){}\[\]^"~*?:\\/|&<>]/gu,'\\$&');const data=await json('https://lobid.org/gnd/search?'+new URLSearchParams({q:`preferredName:"${escaped}"`,format:'json',size:'10'}),signal,vault);return (data.member??[]).slice(0,10).map(gnd);}
 const data=await json(wiki({action:'wbsearchentities',language:'en',type:'item',limit:'10',search:query}),signal,vault);
 return (data.search??[]).filter((r:any)=>/^Q[1-9]\d{0,14}$/u.test(r.id)).slice(0,10).map((r:any)=>({provider,id:r.id,name:String(r.label??r.id).slice(0,1000),description:String(r.description??'').slice(0,2000),aliases:[],url:'https://www.wikidata.org/wiki/'+r.id,retrievedAt:data.__cache?.fetchedAt??new Date().toISOString(),cache:data.__cache}));
}
export async function authorityDetails(record:AuthorityRecord,signal:AbortSignal,vault=record.cache?.vault??'.'):Promise<AuthorityRecord> {
 if(record.provider==='gnd')return record;
 const data=await json(wiki({action:'wbgetentities',ids:record.id,props:'labels|descriptions|aliases|info|claims',languages:'en'}),signal,vault),row=data.entities?.[record.id];
 if(!row||row.missing!==undefined)throw Error('Authority record is missing');
 const values=(property:string)=>(row.claims?.[property]??[]).filter((c:any)=>c.rank!=='deprecated'&&c.mainsnak?.snaktype==='value').map((c:any)=>c.mainsnak.datavalue?.value).filter(Boolean);
 const ids=[...new Set([...values('P31'),...values('P106')].map((v:any)=>v.id).filter((id:any)=>/^Q[1-9]\d*$/.test(id)))].slice(0,16) as string[];
 let labels:Record<string,any>={};if(ids.length)try{labels=(await json(wiki({action:'wbgetentities',ids:ids.join('|'),props:'labels',languages:'en'}),signal,vault)).entities??{};}catch{signal.throwIfAborted();}
 const dates:any[]=[];for(const [property,type]of [['P569','birth'],['P570','death'],['P571','inception'],['P576','dissolution']])for(const v of values(property).slice(0,4)){
  const m=/^([+-]?\d+)-(\d{2})-(\d{2})T/.exec(v.time??'');if(!m)continue;
  dates.push({type,expression:v.time,startYear:Number(m[1]),...(v.precision>=10&&Number(m[2])?{startMonth:Number(m[2])}:{}),...(v.precision>=11&&Number(m[3])?{startDay:Number(m[3])}:{}),precision:v.precision===11?'day':v.precision===10?'month':v.precision===9?'year':String(v.precision),approximation:v.before||v.after?'approximate':null,attributes:{authority:'wikidata',property,time:v}});
 }
 let thumbnail:AuthorityRecord['thumbnail'];const file=values('P18')[0];if(typeof file==='string'&&file.length<512)try{
  const image=await json('https://commons.wikimedia.org/w/api.php?'+new URLSearchParams({action:'query',format:'json',origin:'*',prop:'imageinfo',titles:'File:'+file,iiprop:'url|extmetadata',iiurlwidth:'320',iiextmetadatalanguage:'en'}),signal,vault),page:any=Object.values(image.query?.pages??{})[0],info=page?.imageinfo?.[0],meta=info?.extmetadata;
  const plain=(v:any)=>typeof v==='string'?v.replace(/<[^>]*>/g,'').slice(0,2048):undefined;
  if(info?.thumburl?.startsWith('https://'))thumbnail={url:info.thumburl,source:info.descriptionurl,attribution:plain(meta?.Artist?.value),license:plain(meta?.LicenseShortName?.value),licenseUrl:plain(meta?.LicenseUrl?.value)};
 }catch{signal.throwIfAborted();}
 return {...record,name:row.labels?.en?.value??record.name,description:row.descriptions?.en?.value??record.description,aliases:strings((row.aliases?.en??[]).map((a:any)=>a.value)),revision:row.lastrevid,retrievedAt:data.__cache?.fetchedAt??new Date().toISOString(),typeIds:values('P31').map((v:any)=>v.id),classifications:ids.map(id=>labels[id]?.labels?.en?.value).filter(Boolean),dates,thumbnail,cache:data.__cache};
}
