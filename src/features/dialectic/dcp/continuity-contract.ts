/** Durable native/provider association, without credentials or branch semantics. */
export interface HistoryStamp {id:string;digest:string}
export interface ContinuityReceipt {version:1;binding:string;connection:string;generation:number;conversationId:string;exchangeId:string}
export interface HistoryItem {role:'user'|'assistant';content:string}
export interface ContinuityScope {cavernId:string;session:string;documentId:string;participantId:string}
export interface ContinuityManifest extends ContinuityScope {history:HistoryStamp[];receipts:ContinuityReceipt[]}
export interface ContinuityPlan {contractDigest?:string;binding:string;connection:string;generation:number;start:number;recovery:boolean;version:string}
export const continuityLimits={contributions:128,characters:128000,bytes:1048576};
/** Native Save sorts object keys. Checkpoints must be invariant to key order and
 * independently authored annotation strata, while retaining array ordering. */
export const historyBaseJson=(value:unknown)=>JSON.stringify(value,(key,item)=>key==='annotations'?undefined:item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item);
