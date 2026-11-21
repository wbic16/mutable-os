import {Show} from 'solid-js';
import type {EntityAuthorityState} from '../../application/entity-authority-resolution';

/** A committed Pipeline receipt remains a recorded link while its target is being checked. */
export function entityIdentityLink(definition:any,state?:EntityAuthorityState){
 const scoped=definition?.metadata?.scopedEntity,manual=scoped?.identityAssociation;
 if(manual?.method==='user-confirmed'&&manual.entityId&&manual.vaultId)return manual as {entityId:string;vaultId:string;vault?:string;method:string};
 const recovered=state?.databaseLink;
 if(recovered?.sourceResourceId===scoped?.resourceId&&recovered?.sourceEntityId===definition?.id)return recovered;
 const legacy=scoped?.entity?.attributes?.canonicalAssociation;
 if(state?.status==='linked'&&state.canonical?.id===legacy?.entityId)return legacy as {entityId:string;vaultId:string;vault?:string;method?:string};
}
export function EntityIdentityStatus(props:{definition:any;state?:EntityAuthorityState;unsaved?:boolean;opening:boolean;error?:string;open():void}){
 const link=()=>entityIdentityLink(props.definition,props.state);
 const verified=()=>props.state?.status==='linked'&&props.state.canonical?.id===link()?.entityId;
 const unavailable=()=>props.state?.status==='unavailable';
 return <Show when={link()} fallback={<p class="semantics-identity-unlinked" role="status">{props.state?.status==='pending'?'Checking database link…':props.state?.databaseChecked&&!props.state.databaseLink?'No database association found.':props.state?.status==='unavailable'?'Database link could not be checked. '+(props.state.message??''):'Database link has not yet been checked.'}</p>}>{identity=><section class="semantics-identity-status" classList={{'semantics-identity-warning':unavailable()}} aria-label="Database identity link">
  <strong role="status">{unavailable()?'Database link recorded — verification unavailable':'Linked to database Entity'}</strong>
  <Show when={verified()} fallback={<p>{unavailable()?props.state?.message:props.state?.status==='pending'?'The link is recorded. Checking the database Entity…':'The link is recorded; current database details have not yet been verified.'}</p>}><p class="semantics-identity-name">{props.state?.canonical?.name}</p></Show>
  <dl><dt>Database Entity ID</dt><dd><code>{identity().entityId}</code></dd><dt>Cavern ID</dt><dd><code>{identity().vaultId}</code></dd></dl>
  <p>{identity().method==='user-confirmed'?'Identity confirmed in the Pipeline.':'Identity verified through an authority mapping.'} The Document Entity keeps its own identity.</p>
  <button disabled={props.opening} onClick={props.open}>{props.opening?'Opening…':'Open linked Entity'}</button>
  <Show when={props.error}><p role="alert">{props.error}</p></Show>
  <Show when={props.state?.databaseLink&&!props.definition?.metadata?.scopedEntity?.identityAssociation}><p>The link was recovered from the database. No local Document marker is needed to recognise it.</p></Show>
  <Show when={props.unsaved&&props.definition?.metadata?.scopedEntity?.identityAssociation}><p class="semantics-identity-save">Unsaved Document changes. Save the Document to retain its local link marker; the database link is already committed.</p></Show>
 </section>}</Show>;
}
