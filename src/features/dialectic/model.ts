import type {ExistingBlockDto,ContentRecord} from '../../block-tree/types';

export type ReplyTarget = {resourceId:string;blockId?:string;anchorId?:string;definitionId?:string;argumentId?:string;entity?:import('../../feature-api/scoped-entities').ScopedEntityReference} & (
 {kind:'contribution'|'block';blockId:string}|{kind:'range';anchorId:string}|{kind:'gloss'|'argument-relation'|'entity-relation';definitionId:string}|{kind:'argument';argumentId:string}|{kind:'entity';entity:import('../../feature-api/scoped-entities').ScopedEntityReference});
export interface Participant {id:string;kind:'human'|'ai';name:string}
export const defaultParticipant=(owner:string,kind:'human'|'ai'):Participant=>({id:owner+':'+kind,kind,name:kind==='human'?'Local author':'Mock assistant'});
export const participantLabel=(c:Contribution)=>c.participant?.name??(c.author==='human'?'You':'Mock assistant');
export interface ConsumedContext {version:1;items:{target:ReplyTarget;text:string;origins:('reply-target'|'selected')[];revisions:{contentKey:string;revision:number}[]}[];limits:{characters:number;blocks:number};}
export type ContributionNoticeCode='markdown-fallback'|'partial-conversion'|'unsupported-media'|'incomplete-operation'|'validation-repaired'|'image-load';
/** Host-recorded history, never a model claim or a mutable activity count. */
export interface ContributionNotice extends Omit<import('../../interchange/diagnostics').InterchangeDiagnostic,'code'> {
 code:ContributionNoticeCode;target?:ReplyTarget;
 imageLoad?:{version:1;blockId:string;originalUrl:string;method:'browser';byteLength?:number;automaticRepairAttempted?:boolean;replacement?:{url:string;byteLength:number|null};events:{outcome:'failed'|'delayed'|'loaded'|'full-requested'|'smaller-requested'|'smaller-loaded'|'smaller-failed'|'repair-requested'|'repair-loaded'|'repair-failed'|'retry-requested';at:string;detail?:string;candidateUrl?:string;receipt?:import('./dcp/provider-contract').ProviderReceipt}[]};
}
export interface Contribution {
 semanticRefreshes?:{version:1;exchangeId:string;comment:string;createdUtc:string;participantId:string;summary:string;identityMap:Record<string,ReplyTarget>;annotationRefs:{blockId:string;propertyId:string}[];request:unknown;response:string;tools:unknown[];provider?:import('./dcp/provider-contract').LiveProvenance}[];
 attachments?:import('./attachments-contract').Attachment[];
 version:1;kind:'contribution';state:'draft'|'receiving'|'committed';author:'human'|'mock'|'ai';participant?:Participant;
 ordinal?:number;createdUtc?:string;replies:ReplyTarget[];context?:ReplyTarget[];requestId?:string;
 discursiveReferences?:ReplyTarget[];dcp?:{version:1;profile:string;request:unknown;tools:unknown[];response:string;identityMap:unknown;annotationRefs?:{blockId:string;propertyId:string}[];intent:string;provider?:import('./dcp/provider-contract').LiveProvenance};
 replyExcerpts?:{target:ReplyTarget;text:string}[];consumedContext?:ConsumedContext;
 synopsis?:{version:1;text:string;author:'ai';participantId:string;exchangeId:string};
 notices?:ContributionNotice[];
}
export const conversationMetadata={version:1,kind:'conversation'} as const;
export function contribution(value:unknown):Contribution|undefined {
 const v=value as Contribution|undefined;
 return v?.version===1&&v.kind==='contribution'&&['draft','receiving','committed'].includes(v.state)&&['human','mock','ai'].includes(v.author)&&Array.isArray(v.replies)?v:undefined;
}
/** Runtime notices do not change source text, identity, semantics or authority. */
export function onlyContributionNoticesChanged(before:ContentRecord|undefined,after:ContentRecord|undefined):boolean {
 if(!before||!after||!contribution((before.payload.metadata as any)?.dialectic)||!contribution((after.payload.metadata as any)?.dialectic))return false;
 const source=(record:ContentRecord)=>{const {revision,...rest}=record,metadata=record.payload.metadata as any,{notices,...dialectic}=metadata.dialectic;return {...rest,payload:{...record.payload,metadata:{...metadata,dialectic}}};};
 return JSON.stringify(source(before))===JSON.stringify(source(after));
}
export function isConversation(value:unknown){const v=value as typeof conversationMetadata|undefined;return v?.version===1&&v.kind==='conversation';}
export const textBlock=(text=''):ExistingBlockDto=>({id:crypto.randomUUID(),type:'standoff-editor-block',text});
export function draftContribution():ExistingBlockDto {
 return {id:crypto.randomUUID(),type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'draft',author:'human',replies:[]}},children:[textBlock()]};
}
export function conversationDocument():ExistingBlockDto {
 const id=crypto.randomUUID();return {id,type:'document-block',metadata:{documentId:id,title:'New conversation',dialectic:conversationMetadata},children:[draftContribution()]};
}
export function conversationTabs(documents:readonly {id:string;title:string}[]):ExistingBlockDto {
 return {id:crypto.randomUUID(),type:'dialectic-application-block',children:[{id:crypto.randomUUID(),type:'tab-row-block',children:documents.map(d=>({id:crypto.randomUUID(),type:'tab-block',metadata:{name:d.title,documentTarget:{version:1,documentId:d.id}}}))}]};
}
export const targetKey=(t:ReplyTarget)=>JSON.stringify([t.resourceId,t.kind,t.blockId??t.anchorId??t.definitionId??t.argumentId??(t.entity&&[t.entity.scope,t.entity.scope==='document'?t.entity.resourceId:t.entity.vaultId,t.entity.entityId])]);
export interface MockContext {target:ReplyTarget;text:string}
/** Deterministic native composition; IDs are allocated by the host, never by a provider. */
export function mockComposition(context:readonly MockContext[]):ExistingBlockDto[] {
 const excerpt=context[0]?.text.slice(0,280)||'(No plain text in this composition.)';
 return [textBlock('Mock assistant — a composition to explore'),
  {id:crypto.randomUUID(),type:'table-block',children:[{id:crypto.randomUUID(),type:'table-row-block',children:[
   {id:crypto.randomUUID(),type:'table-cell-block',children:[textBlock('Selected passage'),textBlock(excerpt)]},
   {id:crypto.randomUUID(),type:'table-cell-block',children:[textBlock('A possible next question'),textBlock('What evidence would strengthen or challenge this point?')]},
  ]}]},textBlock(`This deterministic example used ${context.length} explicitly selected context item${context.length===1?'':'s'}. It is a proposal, not a verified fact.`)];
}
