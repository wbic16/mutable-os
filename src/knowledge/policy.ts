/** Source Blocks index authoritative UTF-16 text only, never rendered markup or inferred entities. */
export const sourceTextTypes = ['mutable/markdown-source-block', 'mutable/html-source-block'];
export const nativeTextTypes = ['plain-text-block', 'text-block', 'standoff-code-mirror-block', ...sourceTextTypes];
/** Serializable extraction capabilities; the host supplies opaque types, never a registry. */
export interface ExtractionPolicy { version:1; opaqueTypes:readonly string[] }
export const DEFAULT_POLICY:ExtractionPolicy = Object.freeze({version:1,opaqueTypes:Object.freeze([])});
export function normalizePolicy(policy:ExtractionPolicy = DEFAULT_POLICY):ExtractionPolicy {
 if(!policy || policy.version!==1 || Object.keys(policy).some(k=>!['version','opaqueTypes'].includes(k)) || !Array.isArray(policy.opaqueTypes) || policy.opaqueTypes.length>4096 || policy.opaqueTypes.some(t=>typeof t!=='string'||!t||t.length>256))throw Error('Invalid Facts extraction policy');
 return Object.freeze({version:1,opaqueTypes:Object.freeze([...new Set(policy.opaqueTypes)].sort())});
}
export function policyKey(policy:ExtractionPolicy){return JSON.stringify(normalizePolicy(policy));}
export function opaqueType(type:string,policy:ExtractionPolicy){return type.endsWith('-application-block')||policy.opaqueTypes.includes(type);}
