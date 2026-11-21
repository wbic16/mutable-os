import {authorityDetails,searchAuthority} from '../../autocomplete/authorities';
import type {AuthorityRecord} from '../../../feature-api/entities';
import {publicImageUrl} from '../../../feature-api/entity-enrichment';
/** Shared cached authority reads; no document/canonical mutation or arbitrary URL fetching. */
export async function lookupAuthority(input:any,signal:AbortSignal,vault:string,check:()=>void){
 if(!input||Object.keys(input).some(k=>!['queries','limit'].includes(k))||!Array.isArray(input.queries)||!input.queries.length||input.queries.length>3||input.queries.some((q:any)=>typeof q!=='string'||!q.trim()||q.length>256)||!Number.isInteger(input.limit)||input.limit<1||input.limit>3)throw Error('Invalid authority lookup budget');
 const results:any[]=[];
 for(const query of [...new Set(input.queries)] as string[]){check();try{
  const candidates:AuthorityRecord[]=/^Q[1-9]\d{0,14}$/.test(query)?[{provider:'wikidata',id:query,name:query,description:'',aliases:[],url:'https://www.wikidata.org/wiki/'+query,retrievedAt:''}]:await searchAuthority('wikidata',query,signal,vault);check();
  const items:any[]=[];for(const candidate of candidates.slice(0,input.limit)){const r=await authorityDetails(candidate,signal,vault);check();items.push({provider:r.provider,id:r.id,name:r.name,description:r.description.slice(0,1000),aliases:r.aliases.slice(0,16),typeIds:r.typeIds?.slice(0,16),classifications:r.classifications?.slice(0,16),dates:r.dates?.slice(0,8),url:r.url,thumbnail:r.thumbnail&&publicImageUrl(r.thumbnail.url)?r.thumbnail:null,retrievedAt:r.retrievedAt,stale:r.cache?.stale??false,identityStatus:'candidate; verify against context'});}
  results.push({query,status:items.length?'complete':'not-found',items,moreCandidates:candidates.length>items.length});
 }catch(error){check();results.push({query,status:'unavailable',items:[],reason:error instanceof Error?error.message.slice(0,500):'Authority unavailable'});}}
 return {status:results.every(r=>r.status!=='unavailable')?'complete':'partial',results};
}
