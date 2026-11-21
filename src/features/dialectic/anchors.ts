import type {JsonObject} from '../../block-tree/types';
export const RANGE_ANCHOR='dialectic/range-anchor';
export interface RangeDefinition extends JsonObject {
 id:string;type:typeof RANGE_ANCHOR;metadata:{dialecticRange:{version:1;excerpt:string;source:{resourceId:string;blockId:string}}};
}
export function rangeDefinition(value:any):value is RangeDefinition {
 const a=value?.metadata?.dialecticRange;
 return value?.type===RANGE_ANCHOR&&a?.version===1&&typeof a.excerpt==='string'&&typeof a.source?.resourceId==='string'&&typeof a.source?.blockId==='string';
}
/** Copying event wrappers requires chronology/context remapping. Fail before any
 * mutation; ordinary nested compositions and their linked anchors remain copyable. */
export function assertCopyableDialectic(payload:JsonObject){
 const d=(payload.metadata as any)?.dialectic;
 if(d!==undefined)throw Error('Copy the contribution’s content Blocks instead. Dialectic conversation/contribution wrapper copying is not supported; no content was pasted.');
}
