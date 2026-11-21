import {featureFlags} from '../configuration';
export interface CacheEntry<T>{key:string;value:T;createdAt:string;updatedAt:string;expiresAt:string|null;stale:boolean}
export async function sharedCacheRequest(action:string,body:unknown,signal?:AbortSignal){
 if(!featureFlags.authorityCache)throw Error('Shared authority cache disabled');
 const response=await fetch('/api/sqlite/knowledge/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal}),result=await response.json();
 if(!response.ok||!result.Success)throw Error(result.Error??'Cache unavailable');return result.Data;
}
export function cacheService(vault='.'){
 const call=(request:unknown,signal?:AbortSignal)=>sharedCacheRequest('cache',{vault,request},signal);
 return {get:<T>(key:string,signal?:AbortSignal)=>call({op:'get',key},signal) as Promise<CacheEntry<T>|null>,set:(key:string,value:{schemaVersion:number},ttl?:number)=>call({op:'set',key,value,ttl}),invalidate:(key:string)=>call({op:'invalidate',key})};
}
