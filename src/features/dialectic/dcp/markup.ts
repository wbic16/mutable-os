import {requireStandoff,type VocabularySnapshot} from './vocabulary-contract';
import type {GeneratedIdentityKind} from './identities';
import {ENTITY_REFERENCE} from '../../../feature-api/scoped-entities';
import {standoffStyleSchemas,standoffStyleSchema} from '../../../rendering/standoff-styles';
import {SaxesParser} from 'saxes';
import type {VisualEffectRegistry} from '../../../runtime/visual-effect-registry';
export const classifications=['claim','question','speculation','suggestion','objection','qualification'].map(n=>'dialectic/'+n);
export const INERT='dialectic/unknown-semantic';
const inlineAliases:Record<string,string>={b:'style/bold',i:'style/italics',e:ENTITY_REFERENCE};
export interface Provenance {version:1;actor:'mock'|'ai';exchangeId:string;protocol:'dcp/1.0';sourceResourceId:string;appliedTo?:'generated'|'existing-source';sourceAuthor?:string;participantId?:string;createdUtc?:string;sourceRevision?:string}
export interface Mark {id:string;type:string;start:number;end:number;value?:string;metadata:Record<string,any>}
export const entityMentionSemantic={purpose:`Classify/style a passage: ${ENTITY_REFERENCE}`,attributes:['ref'],ai:'authorable' as const,rendering:'descriptive annotation',validation:'nonempty Cell range; no additional attributes'};
export function registerDcpTypes(registry:VisualEffectRegistry,semantics=false,visibleEntities=false){
 const stops= [...classifications,INERT,...(semantics?[ENTITY_REFERENCE]:[])].filter(t=>!registry.type(t)).map(type=>registry.registerType({type,renderers:type===ENTITY_REFERENCE&&visibleEntities?[{id:'entity-mention',name:'css-class',params:{classes:['dialectic-entity-mention'],affectsLayout:false}}]:[],semantic:type===ENTITY_REFERENCE?entityMentionSemantic:{purpose:type===INERT?'Preserved inert semantic declaration':`Classify/style a passage: ${type}`,attributes:type===ENTITY_REFERENCE?['ref']:[],ai:type===INERT?'inert':'authorable',rendering:type.startsWith('style/')?'native text styling':'descriptive annotation',validation:'nonempty Cell range; no additional attributes'}}));
 return ()=>stops.reverse().forEach(f=>f());
}
export function legend(registry:VisualEffectRegistry,nativeAuthoring=false,textAuthoring=false){return [...Object.entries(standoffStyleSchemas).filter(([type])=>!registry.type(type)).map(([type,schema])=>({type,semantic:schema.semantic})),...registry.definitions()].filter(t=>t.semantic?.ai==='authorable').map(t=>({type:t.type,...t.semantic})).concat(nativeAuthoring?Object.entries(standoffStyleSchemas).filter(([,s])=>s.authoring&&(!s.authoring.stage||textAuthoring)).map(([type,s])=>({type,purpose:s.authoring!.purpose,attributes:Object.keys(s.authoring!.parameters),ai:'authorable' as const,rendering:'native text styling',validation:'shared native property preparation'})):[]);}
export function annotation(type:string,attrs:Record<string,string>,registry:VisualEffectRegistry,provenance:Provenance,nativeAuthoring=false,textAuthoring=false,vocabulary?:VocabularySnapshot){
 requireStandoff(vocabulary,type,!!registry.type(type)||!!standoffStyleSchemas[type]);
 if(type===ENTITY_REFERENCE)throw Error('Scoped Entity annotations require an admitted reference');
 if(Object.keys(attrs).length>16||Object.entries(attrs).some(([k,v])=>k.length>128||typeof v!=='string'||v.length>4096))throw Error('Annotation attribute budget exceeded');
 const descriptor=standoffStyleSchemas[type]?.authoring;
 const prepared=nativeAuthoring&&descriptor&&(!descriptor.stage||textAuthoring)?descriptor.prepare(attrs,'standoff-editor-block'):undefined;
 if(prepared)return {type,...prepared,metadata:{dcp:provenance}};
 const definition=registry.type(type)??standoffStyleSchema(type);
 if(!/^[a-z][a-z0-9/-]{0,127}$/.test(type)||['dialectic/argument','dialectic/argument-relation','dialectic/range-anchor','mutable/entity','mutable/entity-relation',INERT].includes(type))throw Error('Unsupported annotation type');
 if(definition&&!definition.semantic||definition?.semantic?.ai==='inert')throw Error(`Annotation not AI-authorable: ${type}`);
 if(definition&&Object.keys(attrs).some(k=>!definition.semantic!.attributes.includes(k)))throw Error('Unsupported annotation attribute');
 return {type:definition?type:INERT,metadata:{dcp:provenance,...(!definition?{unknownSemantic:{type,attributes:attrs}}:{})}};
}
/** XML structural validation + exact decoded text. CR is encoded only in text
 * tokens before SAX parsing; literal line breaks in attributes are forbidden. */
export function markup(source:string,ranges:any[],registry:VisualEffectRegistry,provenance:Provenance,claim:(id:string,kind:GeneratedIdentityKind)=>void,reference?:((type:string,handle:string)=>ReturnType<typeof annotation>),nativeAuthoring=false,textAuthoring=false,vocabulary?:VocabularySnapshot,neutralPassages=false){
 if(typeof source!=='string'||source.length>32768||/<!|<\?/.test(source)||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(source))throw Error('Invalid or oversized annotation markup');
 // This restricted grammar admits no angle brackets in attributes. XML entities
 // remain available; text CR survives XML's normal line-ending normalization.
 let encoded='',at=0;const tags=/<[^>]*>/g;let m:RegExpExecArray|null;
 while((m=tags.exec(source))){encoded+=source.slice(at,m.index).replace(/\r/g,'&#13;');if(/[\r\n]/.test(m[0])||m[0].slice(1).includes('<'))throw Error('Invalid annotation tag');encoded+=m[0];at=tags.lastIndex;}
 encoded+=source.slice(at).replace(/\r/g,'&#13;');
 const parser=new SaxesParser({xmlns:false}),stack:{tag:string;start:number;id?:string;spec?:ReturnType<typeof annotation>}[]=[],marks:Mark[]=[],anchors=new Map<string,{start:number;end:number}>(),boundaries=new Map<string,number>();
 let text='',count=0,cells=0;
 parser.on('error',e=>{throw e;});
 parser.on('text',v=>{text+=v;cells+=[...v].length;});
 parser.on('opentag',tag=>{
  if(++count>512||stack.length>32)throw Error('Markup node/depth budget exceeded');
  let attrs=tag.attributes as Record<string,string>;
  if(tag.name==='dcp-root'&&!stack.length){stack.push({tag:tag.name,start:0});return;}
  if(tag.name==='boundary'){
   if(!tag.isSelfClosing||Object.keys(attrs).some(k=>k!=='id')||!attrs.id)throw Error('Invalid range boundary');claim(attrs.id,'pos');boundaries.set(attrs.id,cells);stack.push({tag:tag.name,start:cells});return;
  }
  if(tag.name==='span'&&neutralPassages){if(Object.keys(attrs).length!==1||!attrs.id)throw Error('Invalid passage markup');claim(attrs.id,'s');stack.push({tag:tag.name,start:cells,id:attrs.id});return;}
  const alias=Object.hasOwn(inlineAliases,tag.name)?inlineAliases[tag.name]:undefined;
  if(alias){
   const allowed=alias===ENTITY_REFERENCE?['id','ref']:['id'];
   if(Object.keys(attrs).some(key=>!allowed.includes(key)))throw Error('Unsupported alias attribute');
   if(alias===ENTITY_REFERENCE&&!attrs.ref)throw Error('Entity alias requires an admitted reference');
   attrs={...attrs,type:alias};
  }else if(tag.name!=='annotation'||!attrs.type)throw Error('Unsupported markup element');
  const {type,id,...rest}=attrs;if(id)claim(id,'s');
  const spec=rest.ref!==undefined&&reference?(Object.keys(rest).length===1?reference(type,rest.ref):(()=>{throw Error('Unsupported reference attributes');})()):annotation(type,rest,registry,provenance,nativeAuthoring,textAuthoring,vocabulary);
  stack.push({tag:tag.name,start:cells,id,spec});
 });
 parser.on('closetag',()=>{const entry=stack.pop()!;if(!entry.spec&&!entry.id)return;if(cells===entry.start)throw Error('Empty annotation');if(entry.spec)marks.push({id:crypto.randomUUID(),...entry.spec,start:entry.start,end:cells-1});if(entry.id)anchors.set(entry.id,{start:entry.start,end:cells});});
 parser.write('<dcp-root>'+encoded+'</dcp-root>').close();
 for(const r of ranges){
  keys(r,['id','type','from','to','ref','attributes']);claim(r.id,'s');
  if(r.ref!==null&&!reference||!nativeAuthoring&&(!Array.isArray(r.attributes)||r.attributes.length))throw Error('Range attributes/references unavailable in 4A');
  const attrs=attributeValues(r.attributes);if(r.ref!==null&&Object.keys(attrs).length)throw Error('Entity reference attributes unavailable');
  const start=boundaries.get(r.from),end=boundaries.get(r.to);if(start===undefined||end===undefined||end<=start)throw Error('Missing/reversed/empty range boundary');
  if(!(neutralPassages&&r.type==='dcp/passage'&&r.ref===null&&Object.keys(attrs).length===0))marks.push({id:crypto.randomUUID(),...(r.ref!==null&&reference?reference(r.type,r.ref):annotation(r.type,attrs,registry,provenance,nativeAuthoring,textAuthoring,vocabulary)),start,end:end-1});anchors.set(r.id,{start,end});
 }
 return {text,marks,anchors,boundaries};
}
export function keys(v:any,allowed:string[]){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k))||allowed.some(k=>!Object.hasOwn(v,k)))throw Error('Invalid DCP object fields');}
export function list(v:any,max:number){if(!Array.isArray(v)||v.length>max)throw Error('Invalid DCP array/budget');return v as any[];}

/** Shared conversion for explicit generated spans and exact-source annotations. */
export function attributeValues(items:any):Record<string,string>{
 const attrs:Record<string,string>=Object.create(null);for(const item of list(items,16)){keys(item,['name','value']);if(typeof item.name!=='string'||!item.name.length||item.name.length>128||typeof item.value!=='string'||item.value.length>4096||Object.hasOwn(attrs,item.name))throw Error('Invalid or duplicate annotation attribute');attrs[item.name]=item.value;}return attrs;
}
