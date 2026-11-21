import {permits,type VocabularySnapshot} from './vocabulary-contract';
/** Filter the existing common schema before either provider's projection. */
export function projectVocabulary(schema:any,v:VocabularySnapshot|undefined){
 if(!v)return schema;
 // Native parameter objects are shared by editor services; never narrow them.
 schema=structuredClone(schema);
 const d=schema.$defs;
 for(const ref of d.Node.anyOf){const name=ref.$ref.slice('#/$defs/'.length);if(!v.schemas.includes(name))delete d[name];}
 d.Node.anyOf=d.Node.anyOf.filter((r:any)=>v.schemas.includes(r.$ref.slice('#/$defs/'.length)));
 for(const name of ['Paragraph','Heading'])if(d[name]){
  if(d[name].properties.textStyle&&!permits(v,'configuration.text'))d[name].properties.textStyle={type:'null'};
  if(d[name].properties.margins&&!permits(v,'configuration.margins'))d[name].properties.margins={type:'null'};
 }
 if(d.List){
  if(!permits(v,'composition.tasks'))d.List.properties.style.enum=d.List.properties.style.enum.filter((s:string)=>s!=='task');
  if(d.ListConfiguration){
   if(!permits(v,'configuration.list-numbering')){d.ListConfiguration.properties.start={type:'null'};d.ListConfiguration.properties.reversed={type:'boolean',enum:[false]};d.ListConfiguration.properties.items.anyOf[0].items.properties.value={type:'null'};}
   if(!permits(v,'composition.tasks'))d.ListConfiguration.properties.items.anyOf[0].items.properties.checked={type:'null'};
   if(!permits(v,'composition.tasks')&&!permits(v,'configuration.list-numbering'))d.List.properties.configuration={type:'null'};
  }
 }
 if(d.Table?.properties.configuration&&!permits(v,'configuration.table-headers'))d.Table.properties.configuration={type:'null'};
 for(const [field,id]of Object.entries({anchors:'source.anchor',interpretations:'source.classification',entities:'semantic.entity',glosses:'semantic.gloss',arguments:'semantic.argument',replyTargets:'reference.reply'}))if(!permits(v,id))schema.properties[field].maxItems=0;
 const relations=d.Relation.anyOf.filter((r:any)=>permits(v,r.$ref.endsWith('ArgumentRelation')?'semantic.argument-relation':'semantic.entity-relation'));
 if(relations.length)d.Relation.anyOf=relations;else schema.properties.relations.maxItems=0;
 // Property strings in XML still require native validation. JSON range/type
 // fields enumerate selected types; unknown semantics remain inline-only here.
 for(const name of ['Span','Interpretation']){
  const types=name==='Interpretation'&&!v.stages[0]?v.standoff.filter(type=>type.startsWith('dialectic/')||type==='mutable/entity-reference'):v.standoff;
  d[name].properties.type=types.length?{type:'string',enum:[...types]}:{type:'string'};
  if(!v.standoff.includes('mutable/entity-reference'))d[name].properties.ref={type:'null'};
 }
 if(!v.standoff.length){for(const name of ['Paragraph','Heading'])if(d[name])d[name].properties.ranges.maxItems=0;schema.properties.interpretations.maxItems=0;}
 return schema;
}
