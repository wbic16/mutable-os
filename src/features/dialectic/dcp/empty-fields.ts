import {permits,type VocabularySnapshot} from './vocabulary-contract';

/** Additive wire negotiation only. Native DCP still uses the complete envelope. */
export const emptySemanticFieldsVersion=1 as const;
export function checkEmptyFieldsVersion(version:unknown):asserts version is 1|undefined {
 if(version!==undefined&&version!==emptySemanticFieldsVersion)throw Error('Unsupported empty semantic fields version');
}
export function emptySemanticFields(vocabulary?:VocabularySnapshot):string[]{
 const fields=['suggestions','promotionRecommendations'];
 if(!vocabulary)return fields;
 for(const [field,capability]of Object.entries({anchors:'source.anchor',entities:'semantic.entity',interpretations:'source.classification',arguments:'semantic.argument',glosses:'semantic.gloss'})){
  if(!permits(vocabulary,capability)||field==='interpretations'&&!vocabulary.standoff.length)fields.push(field);
 }
 if(!permits(vocabulary,'semantic.argument-relation')&&!permits(vocabulary,'semantic.entity-relation'))fields.push('relations');
 return fields;
}
/** Never discard supplied values. Full historical envelopes remain admissible. */
export function normalizeEmptySemanticFields(value:any,vocabulary:VocabularySnapshot|undefined,version?:1){
 checkEmptyFieldsVersion(version);
 if(version===undefined||!value||typeof value!=='object'||Array.isArray(value))return value;
 const result={...value};
 // Present fields continue through the existing validators, including their
 // original diagnostics. A default must never erase a rejected operation.
 for(const field of emptySemanticFields(vocabulary))if(!Object.hasOwn(value,field))result[field]=[];
 return result;
}
