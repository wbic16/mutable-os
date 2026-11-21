/** Strict-provider union keeps the old compact Entity valid. Every optional enriched field may be null. */
export function enrichedEntitySchema(schema:any){
 const object=(properties:any)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false}),str={type:'string'},nullable=(v:any)=>({anyOf:[v,{type:'null'}]});
 const date=object({type:str,expression:nullable(str),...Object.fromEntries(['startYear','startMonth','startDay','endYear','endMonth','endDay'].map(k=>[k,nullable({type:'integer'})])),precision:nullable(str),approximation:nullable(str),certainty:nullable(str),extentKind:nullable(str),qualifier:nullable(str)});
 const metadata=object({subtypes:{type:'array',items:str,maxItems:16},dates:{type:'array',items:date,maxItems:16},externalIds:{type:'array',items:object({namespace:str,value:str}),maxItems:16},thumbnail:nullable(object({url:str,source:nullable(str),attribution:nullable(str),license:nullable(str)}))});
 const old=schema.$defs.LocalEntity;schema.$defs.EnrichedLocalEntity=object({...old.properties,ref:nullable(str),enrichment:nullable(metadata)});schema.properties.entities.items={anyOf:[{$ref:'#/$defs/LocalEntity'},{$ref:'#/$defs/EnrichedLocalEntity'}]};return schema;
}
