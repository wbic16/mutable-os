import type {CanonicalEntity,EntityResolution,EntityResolutionQuery,EntityService} from '../../feature-api/entities';
/** Shared Scry read boundary. No linking, creation or navigation capabilities. */
export type EntitySearchReader=Pick<EntityService,'search'|'get'>;
export async function searchEntities(reader:EntitySearchReader,query:EntityResolutionQuery,signal:AbortSignal,publish?:(result:EntityResolution)=>void){
 const result=await reader.search(query,signal,progress=>{if(signal.aborted)return;progress.current();publish?.(progress);});signal.throwIfAborted();result.current();return result;
}
export async function inspectEntity(reader:EntitySearchReader,id:string,signal?:AbortSignal):Promise<CanonicalEntity>{const entity=await reader.get(id,signal);signal?.throwIfAborted();if(!entity||entity.deletedUtc)throw Error('Entity unavailable in this Cavern');return entity;}
