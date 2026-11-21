import {semanticsWorkspaceFixture} from '../dialectic/semantics-workspace.browser-fixture';
import {registerStandaloneEntityService} from '../../application/entity-service';
import {openSemanticServices} from '../../application/semantic-services';
import {ScopedEntities} from '../../application/scoped-entities';
import {enrichEntityDefinition} from '../../feature-api/entity-enrichment';
import type {EntityService,EntityResolutionQuery} from '../../feature-api/entities';
/** Synthetic browser qualification against an isolated real SQLite service. Never opens the user's Cavern. */
export async function identityPipelineFixture(){
 await semanticsWorkspaceFixture();const f=(globalThis as any).semanticsFixture;
 // Match a real open Document: its registry establishes a non-default extraction policy first.
 const policy={version:1,opaqueTypes:f.editor.registry.typesWithCapability('opaque-widget')};if(!policy.opaqueTypes.length)throw Error('Expected a Document extraction policy');
 const response=await fetch('/api/sqlite/knowledge/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({vault:'.',policy})}),opened=await response.json();if(!opened.Success)throw Error(opened.Error);
 const services=await openSemanticServices({vault:'.'}),id=crypto.randomUUID();await services.execute({recordType:'Entity',op:'create',id,operationId:crypto.randomUUID(),name:'Leonardo da Vinci',typename:'Person',description:'A curated canonical record.'});
 const root=f.port.session().projection.node(f.port.session().rootKey),scoped=new ScopedEntities(f.editor,root.key,String(root.payload.id)),provenance={actor:'ai'};
 const bologna=enrichEntityDefinition(scoped.prepare({name:'Bologna',typename:'Place',description:'City visited by Michelangelo',aliases:['Bononia']},provenance),{enrichment:{subtypes:['City'],externalIds:[{namespace:'wikidata',value:'Q1891'}]}},provenance);
 scoped.commit({[bologna.id]:bologna});const bolognaId=crypto.randomUUID();
 await services.execute({recordType:'Entity',op:'create',id:bolognaId,operationId:crypto.randomUUID(),name:'Bologna',typename:'Place',description:''});
 const release=registerStandaloneEntityService(f.editor,()=>({
  historyScope:async()=>'.',scopeIdentity:async()=>services.vaultGuid,dispose:()=>{},
  documentAssociation:async(source:{resourceId:string;entityId:string},signal:AbortSignal)=>{
   const response=await fetch('/api/sqlite/knowledge/entity-lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({vault:'.',request:{op:'document-association',...source}}),signal}),result=await response.json();if(!result.Success)throw Error(result.Error);
   const a=result.Data.association;return {entity:result.Data.entity,link:a?{method:'user-confirmed',vault:'.',vaultId:result.Data.vaultId,entityId:a.entityGuid,sourceResourceId:a.sourceResourceGuid,sourceEntityId:a.sourceEntityGuid,associationId:a.guid,revision:a.revision}:undefined};
  },
  get:async(id:string,signal?:AbortSignal)=>(await services.execute({recordType:'Entity',op:'get',operationId:crypto.randomUUID(),id},signal) as any).entity,
  search:async(query:EntityResolutionQuery,signal:AbortSignal)=>{const r=await services.execute({recordType:'Entity',op:'search',operationId:crypto.randomUUID(),query:query.query,stream:query.stream==='mention'?'all':query.stream,match:query.match},signal) as any;return {candidates:r.matches.map((r:any)=>({id:r.id,name:r.name,evidence:[{kind:r.kind,text:r.text}]})),diagnostics:[],complete:r.complete,current:()=>signal.throwIfAborted()};}
 } as unknown as EntityService));
 const button=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===text)!;
 (globalThis as any).identityFixture={...f,button,canonicalId:id,bolognaId,services,removeBolognaMarker:()=>{const d=structuredClone(scoped.registry()[bologna.id]);delete d.metadata.scopedEntity.identityAssociation;scoped.commit({[d.id]:d});return f.editor.repository.state.revision;},dispose:async()=>{scoped.dispose();release();await services.dispose();await fetch('/api/sqlite/knowledge/release',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lease:opened.Data.lease})});f.dispose();}};
 button('Resolve Entity Identity…').click();return {canonicalId:id};
}
