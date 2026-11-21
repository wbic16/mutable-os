import type {ReactiveEditor} from '../reactive-editor/editor';
import type {NativeDocumentSession} from '../persistence/native-session';
import type {DocumentVaultLease} from './document-vault';
import type {SavedSourceEvidence} from './facts-query-provider';
import {sameLocation} from '../knowledge/contribution-state';
import {policyKey} from '../knowledge/policy';
/** Application host authority, deliberately outside the Facts/query provider. */
export class SavedResultActivation {
 private serial=0;private alive=true;
 constructor(private editor:ReactiveEditor,private native:NativeDocumentSession,private vault:()=>DocumentVaultLease,private guard:()=>void){}
 dispose(){this.alive=false;this.serial++;}
 async prepare(evidence:SavedSourceEvidence,current:()=>boolean,signal?:AbortSignal){
  const serial=++this.serial,repository=this.editor.repository,vault=this.vault();let revision=repository.state.revision,signature:string|undefined;
  policyKey(JSON.parse(evidence.policy));
  // Saved indexing may have a different installed widget vocabulary. The caller
  // rechecks the selected passage against current native Facts before revealing it.
  // Fence changes during activation, not unrelated changes since the last index.
  const policy=policyKey({version:1,opaqueTypes:this.editor.registry.typesWithCapability('opaque-widget')});
  const check=()=>{this.guard();signal?.throwIfAborted();const reason=!this.alive||serial!==this.serial?'activation superseded':this.editor.repository!==repository||repository.state.revision!==revision?'Document changed':this.vault()!==vault||!vault.isAlive()?'Cavern changed':signature!==undefined&&vault.signature()!==signature?'Cavern discovery changed':policyKey({version:1,opaqueTypes:this.editor.registry.typesWithCapability('opaque-widget')})!==policy?'native vocabulary changed':'';if(reason)throw Error('Selected activation is stale: '+reason);};
  const verifyFile=async()=>{try{await this.native.verifySelected(evidence.location,evidence,signal);}catch(error){throw Error('Selected native file missing or changed: '+String(error));}};
  check();if(!current())throw Error('Saved result is stale');await vault.refresh();check();if(!current())throw Error('Saved result is stale');signature=vault.signature();
  const row=vault.requireSelectedFile(evidence.location),native=this.native.knowledgeEvidence(evidence.resourceId);
  if(row.resourceId!==evidence.resourceId||row.baseline?.nativeHash!==evidence.byteHash||!['paired','unenrolled'].includes(row.state)||native.closed||native.admitting||native.pending||native.location&&!sameLocation(native.location,evidence.location))throw Error('Selected identity, binding or storage evidence changed');
  const boundary=await repository.readCanonicalResourceBoundaryCooperative(evidence.resourceId,{signal});check();
  if(boundary.status==='missing'){
   const admitted=await this.native.openVerified(evidence.location,evidence,check,signal,()=>vault.refresh());
   if(admitted.id!==evidence.resourceId)throw Error('Selected Open returned another identity');
   // Only this synchronous admitted Open may advance the activation revision.
   // Other query/result tokens remain expired; no global proof is refreshed.
   revision=admitted.revision;
  }else if(boundary.status!=='ready')throw Error('Canonical source is '+boundary.status);
  check();const binding=this.native.knowledgeEvidence(evidence.resourceId),epoch=binding.epoch;
  if(!binding.location||!sameLocation(binding.location,evidence.location)||binding.byteHash!==evidence.byteHash||binding.pending||binding.admitting)throw Error('Selected binding is not current');
  const ticket=()=>{try{check();const n=this.native.knowledgeEvidence(evidence.resourceId);return n.epoch===epoch&&!n.pending&&!n.admitting&&!n.closed;}catch{return false;}};
  const verify=async()=>{if(!ticket())throw Error('Selected navigation expired');await verifyFile();if(!ticket())throw Error('Selected file changed before reveal');};
  return {current:ticket,verify};
 }
}
