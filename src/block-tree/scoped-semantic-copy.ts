import type {JsonObject,RepositoryState} from './types';
import {resourceOwner} from './resource-identity';
import {ARGUMENT,ARGUMENT_RELATION} from '../features/dialectic/arguments';
import {LOCAL_ENTITY,LOCAL_ENTITY_RELATION,ENTITY_REFERENCE} from '../feature-api/scoped-entities';
const types=new Set([ARGUMENT,ARGUMENT_RELATION,LOCAL_ENTITY,LOCAL_ENTITY_RELATION]);
export class ScopedSemanticCopyError extends Error {}
export const semanticCopyError=()=>new ScopedSemanticCopyError('Copy of scoped Entities or argument-linked passages needs semantic dependency remapping. Use native Document export; no content was changed.');
/** Both copy routes fail before Cut/paste rather than dropping dependent identities.
 * Whole-resource native persistence/export keeps the complete owned registry. */
export function assertScopedSemanticCopy(state:RepositoryState,contentKey:string){
 const c=state.contents[contentKey];if(!c)return;
 const properties=(c.payload.standoffProperties??[]) as any[];
 if(properties.some(p=>p.type===ENTITY_REFERENCE)||Object.values(c.payload.linkedAnnotations??{}).some((d:any)=>types.has(d.type)))throw semanticCopyError();
 const anchors=new Set(properties.filter(p=>p.type==='dialectic/range-anchor').map(p=>p.annotationId));if(!anchors.size)return;
 const owner=resourceOwner(state,contentKey);if(owner&&Object.values(owner.payload.linkedAnnotations??{}).some((d:any)=>d.type===ARGUMENT&&anchors.has(d.metadata?.dialecticArgument?.anchor?.anchorId)))throw semanticCopyError();
}
export function assertSemanticFragmentDefinitions(definitions:Record<string,JsonObject>){if(Object.values(definitions).some(d=>types.has(String(d.type))))throw semanticCopyError();}
