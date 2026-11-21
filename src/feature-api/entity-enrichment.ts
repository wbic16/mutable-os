import type {TimeInput} from './semantics';
export type EntityDate=Omit<TimeInput,'guid'|'entity'|'expectedEntityRevision'> & {type:string};
export interface EntityEnrichment {version:1;subtypes:string[];dates:EntityDate[];externalIds:{namespace:string;value:string}[];thumbnail?:{url:string;source?:string;attribution?:string;license?:string}}
export {publicImageUrl,entityDate,entityEnrichment} from './entity-enrichment-validation.mjs';
import {entityDate,entityEnrichment} from './entity-enrichment-validation.mjs';
export function compactEntityDate(input:Record<string,string>):EntityDate {
 const {type,value,end,...qualifiers}=input;const out:any={type,...qualifiers};
 for(const [prefix,source]of [['start',value],['end',end]])if(source){const m=/^(-?\d{1,9})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(source);if(!m)throw Error('Expected a year, year-month or year-month-day');out[prefix+'Year']=Number(m[1]);if(m[2])out[prefix+'Month']=Number(m[2]);if(m[3])out[prefix+'Day']=Number(m[3]);if(prefix==='start'&&!out.precision)out.precision=m[3]?'day':m[2]?'month':'year';}
 out.expression??=value+(end?' – '+end:'');if(end)out.extentKind??='range';return entityDate(out);
}
/** Never overwrite an existing assertion silently. Local identity and original provenance survive. */
export function enrichEntityDefinition(definition:any,input:any,provenance:unknown){
 const result=structuredClone(definition),e=result.metadata.scopedEntity.entity,prior=e.attributes?.enrichment??{version:1,subtypes:[],dates:[],externalIds:[]},next=input.enrichment?entityEnrichment(input.enrichment):entityEnrichment({});
 const assertions=[...(prior.assertions??[])],conflicts=[...(prior.conflicts??[])];
 if(assertions.length>=128||conflicts.length>=128)throw Error('Entity enrichment history budget reached');
 const conflict=(field:string,value:unknown)=>{if(!conflicts.some((c:any)=>c.field===field&&JSON.stringify(c.value)===JSON.stringify(value)))conflicts.push({field,value,provenance});};
 for(const key of ['name','typename','description'])if(input[key]){if(!e[key])e[key]=input[key];else if(e[key]!==input[key])conflict(key,input[key]);}
 for(const alias of input.aliases??[])if(!e.aliases.some((a:any)=>a.name===alias)){if(e.aliases.length>=32)throw Error('Entity alias budget reached');e.aliases.push({id:crypto.randomUUID(),name:alias,origin:'agent',revision:0});}
 const merge=(field:'dates'|'externalIds',key:'type'|'namespace')=>{const values=[...(prior[field]??[])];for(const v of next[field]){const old=values.find((o:any)=>o[key]===(v as any)[key]);if(!old)values.push(v);else if(JSON.stringify(old)!==JSON.stringify(v))conflict(field+'.'+(v as any)[key],v);}if(values.length>32)throw Error('Entity enrichment budget reached');return values;};
 if(prior.thumbnail&&next.thumbnail&&prior.thumbnail.url!==next.thumbnail.url)conflict('thumbnail',next.thumbnail);
 assertions.push({provenance,values:structuredClone(input)});
 e.attributes={...e.attributes,enrichment:{...prior,version:1,subtypes:[...new Set([...(prior.subtypes??[]),...next.subtypes])].slice(0,32),dates:merge('dates','type'),externalIds:merge('externalIds','namespace'),thumbnail:prior.thumbnail??next.thumbnail,assertions,conflicts}};e.revision++;return result;
}
