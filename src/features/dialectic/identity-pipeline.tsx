import {Show,createSignal,onCleanup,onMount,createEffect} from 'solid-js';
import {unwrap} from 'solid-js/store';
import type {DialecticController} from './controller';
import {entityService} from '../../application/entity-service';
import {openSemanticServices} from '../../application/semantic-services';
import {ScopedEntities} from '../../application/scoped-entities';
import {ApplicationSurfacePortal,ApplicationSurfaceBoundary,useManagedWindowOwner} from '../../rendering/window-manager';
import {PipelineCarousel} from '../pipelines/carousel';
import {createIdentityWorkflow} from '../pipelines/identity-workflow';
import {identityResolutionService,type IdentityReceipt,type IdentitySource} from '../pipelines/identity-service';
import {bindSemanticThumbnail} from './semantic-thumbnail';
import {managedAsset} from '../../interchange/managed-asset';
import {identitySource} from '../pipelines/identity-contract.mjs';

export function sourceIdentity(resourceId:string,definition:any){const entity=definition?.metadata?.scopedEntity?.entity;if(!entity||definition.isDeleted)throw Error('Source Document Entity is unavailable');const enrichment=entity.attributes?.enrichment??{};return identitySource({resourceId,entityId:definition.id,revision:entity.revision,name:entity.name,typename:entity.typename??'',description:entity.description??'',aliases:entity.aliases.map((a:any)=>a.name),enrichment:{subtypes:enrichment.subtypes??[],dates:enrichment.dates??[],externalIds:enrichment.externalIds??[]},...(enrichment.thumbnail?{thumbnail:enrichment.thumbnail}:{}),provenance:definition.metadata.scopedEntity.provenance??null});}
export function IdentityPipeline(props:{c:DialecticController;entityId:string;close():void}){
 const root=props.c.root()!,ownerKey=root.key,resourceId=props.c.resourceId();
 return <ApplicationSurfacePortal editor={props.c.editor} ownerKey={ownerKey} kind="dialog"><ApplicationSurfaceBoundary><IdentityPipelineSession {...props} ownerKey={ownerKey} resourceId={resourceId}/></ApplicationSurfaceBoundary></ApplicationSurfacePortal>;
}
function IdentityPipelineSession(props:{c:DialecticController;entityId:string;ownerKey:string;resourceId:string;close():void}){
 const c=props.c,editor=c.editor,reader=entityService(editor,props.ownerKey),scoped=new ScopedEntities(editor,props.ownerKey,props.resourceId),owner=useManagedWindowOwner();
 const [workflow,setWorkflow]=createSignal<ReturnType<typeof createIdentityWorkflow>>(),[error,setError]=createSignal('');const abort=new AbortController();let semantic:Awaited<ReturnType<typeof openSemanticServices>>|undefined,alive=true;
 const definition=()=>scoped.registry()[props.entityId];let source:IdentitySource|undefined,signature='';try{source=sourceIdentity(props.resourceId,unwrap(definition()));signature=JSON.stringify(source);}catch(e){setError(String(e));}
 const localCheck=()=>{if(!source)throw Error(error()||'Source Document Entity is unavailable');if(!alive||abort.signal.aborted||c.resourceId()!==props.resourceId||JSON.stringify(sourceIdentity(props.resourceId,unwrap(definition())))!==signature)throw Error('Source Entity changed or its Document closed. Close this Pipeline and start again.');};
 onCleanup(()=>{alive=false;abort.abort();workflow()?.run.dispose();reader.dispose();scoped.dispose();void semantic?.dispose();});
 if(owner)onCleanup(owner.manager.lifecycle.guard(owner.windowId,()=>!workflow()?.run.guard()));
 // Only the affected definition can invalidate this source. Ordinary typing
 // never builds inventories, reads the source, snapshots or starts requests.
 onCleanup(editor.repository.subscribeChanges(change=>{if(change.inlineOwner||!change.previousContents.has(rootContent()))return;try{localCheck();}catch(e){setError(String(e));if(!workflow()?.run.guard())workflow()?.run.invalidate('search');}}));
 function rootContent(){return editor.node(props.ownerKey)?.contentKey??'';}
 createEffect(()=>{if(c.resourceId()!==props.resourceId){setError('The source Document is no longer active. Close this Pipeline to return.');if(!workflow()?.run.guard())workflow()?.run.invalidate('search');}});
 onMount(()=>{void(async()=>{try{
  localCheck();const vault=await reader.historyScope?.();if(!vault||!reader.scopeIdentity)throw Error('Open the Document in a verified Mutable Cavern first');const vaultId=await reader.scopeIdentity(abort.signal);localCheck();
  semantic=await openSemanticServices({vault,signal:abort.signal});if(!alive){await semantic.dispose();return;}if(semantic.vaultGuid!==vaultId)throw Error('Cavern identity changed');
  const check=async()=>{localCheck();if(await reader.scopeIdentity!(abort.signal)!==vaultId)throw Error('The originating Cavern changed');localCheck();};
  const unsupported:string[]=[];const inventory=c.semanticInventory();
  for(const relation of inventory.definitions.filter(d=>d.type==='mutable/entity-relation')){const r=relation.metadata.scopedEntityRelation;if([r.from,r.to].some((ref:any)=>ref.scope==='document'&&ref.resourceId===props.resourceId&&ref.entityId===props.entityId))unsupported.push(`Document Relationship “${r.relation}”: endpoint identity mapping and semantic import are not supported in this release.`);}
  const claims=inventory.properties.filter(p=>p.type==='dialectic/claim'),claimCount=claims.length;if(claimCount)unsupported.push(`${claimCount} Claim passage annotations exist in this Document. They are not automatically attributable to this Entity or convertible into canonical Claims.`);
  for(const claim of claims.slice(0,20))unsupported.push(`Claim passage (not an established Entity assertion): ${claim.excerpt??claim.propertyId}`);
  if(claimCount>20)unsupported.push('Only the first 20 Claim passages are shown. Review the remaining passages in Semantics.');
  const attributes=definition().metadata.scopedEntity.entity.attributes;if(attributes?.enrichment?.thumbnail)unsupported.push('The source has an external thumbnail. Previewing it does not import it into the canonical asset store.');
  if(attributes?.enrichment?.conflicts?.length)unsupported.push(`${attributes.enrichment.conflicts.length} unresolved source assertions remain in the Document: ${JSON.stringify(attributes.enrichment.conflicts).slice(0,4000)}`);
  if(Object.keys(attributes??{}).some(k=>!['enrichment','authorityMetadata','canonicalAssociation'].includes(k)))unsupported.push('Additional source attributes are retained in the Document; this release imports only the explicitly supported enrichment fields.');
  const linked=async(receipt:IdentityReceipt)=>{
   localCheck();const next=structuredClone(unwrap(definition()));next.metadata.scopedEntity.identityAssociation={version:1,method:'user-confirmed',vaultId,entityId:receipt.entity.id,associationId:receipt.association.guid,revision:receipt.association.revision,sourceFingerprint:receipt.association.sourceFingerprint,vault};
   scoped.commit({[props.entityId]:next},'Associate Document Entity');await c.authorityResolution.resolve(next);
  };
  setWorkflow(createIdentityWorkflow(source!,{service:identityResolutionService(semantic),search:reader,check,unsupported,linked,bindImage:(entity,publish)=>bindSemanticThumbnail(editor,{asset:managedAsset(entity.imageRef),url:entity.thumbnail?.url},publish)}));
 }catch(e){if(alive)setError(String(e));}})();});
 return <><Show when={workflow()} keyed fallback={<section class="pipeline-host" role="dialog" aria-label="Resolve Entity Identity"><header class="pipeline-header"><h2>Resolve Entity Identity</h2><button onClick={props.close}>Close</button></header><p class="pipeline-notice">{error()||'Opening the originating Cavern…'}</p></section>}>{value=><PipelineCarousel run={value.run} presentations={value.presentations} notice={error()} close={props.close}/>}</Show></>;
}
