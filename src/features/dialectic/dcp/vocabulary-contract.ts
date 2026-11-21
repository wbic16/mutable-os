/** Exchange projection, not a native registry or model-supplied authority. */
export type VocabularyProfile='all-qualified'|'core'|'general'|'research';
export interface VocabularySelection {profile:VocabularyProfile;enable?:readonly string[];disable?:readonly string[]}
export interface VocabularyDescriptor {id:string;purpose:string;available:boolean;requires:readonly string[];requiresAny?:readonly string[];schema?:string;kind?:string;standoff?:string}
export interface VocabularySnapshot {
 readonly version:1;
 readonly profile:VocabularyProfile;
 readonly capabilities:readonly string[];
 readonly kinds:readonly string[];
 readonly schemas:readonly string[];
 readonly standoff:readonly string[];
 readonly stages:readonly boolean[];
}
export const permits=(v:VocabularySnapshot|undefined,id:string)=>!v||v.capabilities.includes(id);
export function requireCapability(v:VocabularySnapshot|undefined,id:string){if(!permits(v,id))throw Error('DCP capability disabled: '+id);}
export function requireComposition(v:VocabularySnapshot|undefined,kind:string){if(v&&!v.kinds.includes(kind))throw Error('Unsupported DCP Block capability: '+kind+' (selection or native prerequisite disabled)');}
/** Unknown names retain the established inert compatibility path. Known but
 * disabled names must fail before it, including Entity references. */
export function requireStandoff(v:VocabularySnapshot|undefined,type:string,known:boolean){if(v&&known&&!v.standoff.includes(type))throw Error('DCP standoff disabled: '+type);}

/** Keep illustrative examples consistent with the same projected vocabulary.
 * This is presentation filtering, never validation or authorisation. */
export function vocabularyExample(value:any,v:VocabularySnapshot):any|undefined {
 let valid=true;
 const walk=(x:any):any=>{
  if(Array.isArray(x))return x.map(walk);if(!x||typeof x!=='object')return x;
  if(typeof x.kind==='string'&&x.id&&x.kind!=='contribution'&&!['argument','entity'].includes(x.kind)&&!v.kinds.includes(x.kind))valid=false;
  if(typeof x.markup==='string')for(const match of x.markup.matchAll(/<annotation\s+[^>]*type="([^"]+)"/g))if(!v.standoff.includes(match[1]))valid=false;
  for(const [field,id]of Object.entries({anchors:'source.anchor',interpretations:'source.classification',entities:'semantic.entity',glosses:'semantic.gloss',arguments:'semantic.argument',replyTargets:'reference.reply'}))if(Array.isArray(x[field])&&x[field].length&&!permits(v,id))valid=false;
  if(x.relations?.some((r:any)=>!permits(v,r.kind==='argument'?'semantic.argument-relation':'semantic.entity-relation')))valid=false;
  const next=Object.fromEntries(Object.entries(x).map(([k,item])=>[k,walk(item)]));
  if(next.textStyle&&!permits(v,'configuration.text'))next.textStyle=null;
  if(next.margins&&!permits(v,'configuration.margins'))next.margins=null;
  if(next.kind==='list'&&next.configuration&&!permits(v,'configuration.list-numbering'))next.configuration=null;
  if(next.kind==='table'&&next.configuration&&!permits(v,'configuration.table-headers'))next.configuration=null;
  return next;
 };const result=walk(value);return valid?result:undefined;
}

export function copyVocabularySelection(input:VocabularySelection):Readonly<VocabularySelection>{
 if(!input||!['all-qualified','core','general','research'].includes(input.profile)||Object.keys(input).some(k=>!['profile','enable','disable'].includes(k)))throw Error('Invalid DCP vocabulary selection');
 const list=(values:readonly string[]|undefined)=>{if(values===undefined)return [];if(!Array.isArray(values)||values.length>128||values.some(v=>typeof v!=='string'||!v||v.length>128)||new Set(values).size!==values.length)throw Error('Invalid DCP capability overrides');return Object.freeze([...values]);};
 const enable=list(input.enable),disable=list(input.disable);if(enable.some(id=>disable.includes(id)))throw Error('Conflicting DCP capability overrides');
 return Object.freeze({profile:input.profile,enable,disable});
}
