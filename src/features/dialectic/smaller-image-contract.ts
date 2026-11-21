import {externalMediaUrl} from '../../block-tree/media-authoring';
import type {ProviderReceipt} from './dcp/provider-contract';

export const smallerImageLimits={bytes:20_000_000,outputTokens:512,deadlineMs:30000};
export const smallerImageSchema={type:'object',properties:{url:{type:['string','null']}},required:['url'],additionalProperties:false};
export interface SmallerImageInput {url:string;description:string;reason?:'failed-image'}
export interface SmallerImageResult {url:string|null;receipt:ProviderReceipt}
export function imageUtilityUrl(value:unknown):string{
 if(typeof value!=='string'||value.length>2048)throw Error('Invalid image URL');
 return externalMediaUrl(value);
}
export function smallerImageInput(value:any):SmallerImageInput{
 if(!value||!['description,url','description,reason,url'].includes(Object.keys(value).sort().join(','))||value.reason!==undefined&&value.reason!=='failed-image'||typeof value.description!=='string'||value.description.length>1024)throw Error('Invalid smaller image request');
 return {url:imageUtilityUrl(value.url),description:value.description,...(value.reason?{reason:value.reason}: {})};
}
export function smallerImageOutput(value:any):string|null{
 if(!value||Object.keys(value).join(',')!=='url')throw Error('Invalid smaller image response');
 return value.url===null?null:imageUtilityUrl(value.url);
}
export const smallerImageEvent='dialectic-fetch-smaller-image';
export interface SmallerImageRequest {nodeKey:string;originalUrl:string;signal:AbortSignal;reason?:'failed-image';accept:(result:Promise<SmallerImageResult>)=>void}
/** Routed to the hosting Dialectic controller, never the conversational input. */
export function requestSmallerImage(element:HTMLElement,nodeKey:string,originalUrl:string,signal:AbortSignal,reason?:'failed-image'){
 let result:Promise<SmallerImageResult>|undefined;
 element.dispatchEvent(new CustomEvent<SmallerImageRequest>(smallerImageEvent,{bubbles:true,detail:{nodeKey,originalUrl,signal,reason,accept:value=>{result=value;}}}));
 return result??Promise.reject(Error('Open this Document in Dialectic and configure its AI provider.'));
}
