export const ARGUMENT='dialectic/argument',ARGUMENT_RELATION='dialectic/argument-relation';
export const argumentRelations=['supports','challenges','qualifies','contradicts','elaborates','answers','depends-on','provides-evidence-for'] as const;
const ref=(v:any,key:string)=>!!v&&typeof v.resourceId==='string'&&!!v.resourceId&&typeof v[key]==='string'&&!!v[key];
export function argumentDefinition(v:any):boolean {const a=v?.metadata?.dialecticArgument;return v?.type===ARGUMENT&&typeof v.id==='string'&&a?.version===1&&ref(a.anchor,'anchorId')&&!!a.provenance;}
export function argumentRelation(v:any):boolean {const r=v?.metadata?.dialecticArgumentRelation;return v?.type===ARGUMENT_RELATION&&typeof v.id==='string'&&r?.version===1&&argumentRelations.includes(r.relation)&&ref(r.from,'argumentId')&&ref(r.to,'argumentId')&&!!r.provenance;}
