import {entityDate,entityEnrichment} from '../../feature-api/entity-enrichment-validation.mjs';
/** Shared bounded wire validation; no platform, UI or persistence dependencies. */
const object=(v)=>v&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max)=>typeof v==='string'&&v.length<=max&&!v.includes('\0');
const id=v=>text(v,512)&&!!v;
export function identitySource(v){
 if(!object(v)||Object.keys(v).some(k=>!['resourceId','entityId','revision','name','typename','description','aliases','enrichment','provenance','thumbnail'].includes(k))||!id(v.resourceId)||!id(v.entityId)||!Number.isSafeInteger(v.revision)||v.revision<0||!text(v.name,1000)||!v.name.trim()||/[\r\n]/.test(v.name)||!text(v.description,8192)||!text(v.typename,128)||!Array.isArray(v.aliases)||v.aliases.length>32||v.aliases.some(a=>!text(a,1000)||!a.trim()||/[\r\n]/.test(a)))throw Error('Invalid source Document Entity');
 const enrichment=v.enrichment??{};
 if(!object(enrichment)||Object.keys(enrichment).some(k=>!['subtypes','dates','externalIds'].includes(k))||JSON.stringify(enrichment).length>8192)throw Error('Unsupported source enrichment');
 for(const k of ['subtypes','dates','externalIds'])if(enrichment[k]!==undefined&&(!Array.isArray(enrichment[k])||enrichment[k].length>32))throw Error('Source enrichment budget exceeded');
 for(const subtype of enrichment.subtypes??[])if(!text(subtype,128)||!subtype.trim())throw Error('Invalid Entity subtype');
 for(const date of enrichment.dates??[])entityDate(date);
 for(const id of enrichment.externalIds??[])entityEnrichment({externalIds:[id]});
 if(v.thumbnail)entityEnrichment({thumbnail:v.thumbnail});
 if(JSON.stringify(v).length>20000)throw Error('Source Entity exceeds the review budget');
 return JSON.parse(JSON.stringify({resourceId:v.resourceId,entityId:v.entityId,revision:v.revision,name:v.name,typename:v.typename,description:v.description,aliases:v.aliases,enrichment,...(v.thumbnail?{thumbnail:v.thumbnail}:{}),provenance:v.provenance??null}));
}
export function identityChoices(v){const allowed={name:['keep','import'],aliases:['keep','merge'],description:['keep','import','both'],typename:['keep','import'],subtypes:['keep','merge'],dates:['keep','merge'],externalIds:['keep','merge']};if(!object(v)||Object.keys(v).length!==7||Object.entries(allowed).some(([k,values])=>!values.includes(v[k])))throw Error('Invalid reconciliation choices');return {...v};}
