import type {ReplyTarget} from '../model';

// Vocabulary only. DcpSources and prepare retain their existing identity maps.
const sourceKinds:Record<ReplyTarget['kind'],string>={contribution:'c',block:'b',range:'r',entity:'e',gloss:'g',argument:'arg','argument-relation':'ar','entity-relation':'er'};
export function sourceScope(){return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function sourceIdentity(scope:string,kind:ReplyTarget['kind'],ordinal:number){return `src:${scope}:${sourceKinds[kind]}${ordinal}`;}
export type GeneratedIdentityKind='b'|'r'|'s'|'pos'|'m'|'e'|'g'|'arg'|'rel';
export const generatedIdentityPattern=(kind:GeneratedIdentityKind)=>`^new:${kind}[1-9][0-9]*$`;
export function validateGeneratedIdentity(id:string,kind:GeneratedIdentityKind){
 // Legacy unprefixed aliases remain readable; neither reserved namespace can
 // be used to disguise a declaration of the wrong role.
 if(typeof id!=='string'||id.startsWith('src:')||id.startsWith('new:')&&!new RegExp(generatedIdentityPattern(kind)).test(id))throw Error('Invalid provisional ID for '+kind);
}
export const identityInstructions=`IDENTITY ROLES
Existing sources use host-issued src:<exchange-tag>:<kind><number> handles: c contribution, b Block, r range, e Entity, g Gloss, arg argument, ar argument relation, er Entity relation. Copy the whole handle. The tag scopes the reference to this exchange; the suffix is not a contribution ordinal. Native GUIDs in inspection results are durable orientation, not authoring handles. Repeated discovery of the same target returns the same handle here; rediscover and read in later exchanges. Copy the returned revision unchanged.
Declare generated IDs by role: new:b1 for any composition Block, new:r1 for an anchor on original source text, new:s1 for an optional generated-text passage (annotation id or ranges id), new:pos1 for an XML boundary, new:m1 for an interpretation, new:e1 for an Entity, new:g1 for a Gloss, new:arg1 for an argument, new:rel1 for a relationship. Choose distinct positive-number suffixes within each role. All declarations are unique across the response. A composition ID is not a passage reference; an annotation id declares a NEW generated passage, it does not refer to a source anchor. Simple quotation styling needs no annotation id. Reuse a source anchor's new:r ID in dependent replyTargets, Gloss targets, interpretation targets or argument anchors. Relation endpoints name arguments or Entities, never composition IDs. When renaming a declaration, update all its dependent references; do not rename the source anchor and its reproduced text to the same ID.`;
