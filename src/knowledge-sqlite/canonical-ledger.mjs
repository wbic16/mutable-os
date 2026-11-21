import {randomUUID,createHash} from 'node:crypto';
import {sqlRevision} from './reconcile.mjs';
export const guid = v => { if(typeof v!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))throw Error('Supply a stable UUID');return v; };
export const expected = v => {if(!Number.isSafeInteger(v)||v<0)throw Error('Expected revision required');return v;};
export const canonicalTables = ['DocumentEntityAssociation','SourceClaimReview','ExternalIdentity','SourceSnapshot','Entity','EntityAlias','Relationship','Time','Claim','ClaimParticipant','ClaimQualifier','ClaimEvidence','DataSet','DataPoint','DataPointDimension','DataSetMembership'];
const identity=t=>t==='Time'?'entityGuid':'guid';
const fingerprint=s=>createHash('sha256').update(s).digest('hex');
function state(db,table,id){
 const aggregate = table === 'Block' || table === 'StandoffProperty';
 if(!aggregate && !canonicalTables.includes(table))throw Error('Unsupported canonical table');
 const row=db.prepare(`SELECT * FROM ${table} WHERE ${identity(table)}=?`).get(id);if(!row)return null;
 if(aggregate && row.resourceGuid !== null) throw Error('File-derived rows are not canonical');
 delete row.id;for(const f of ['attributes','valueJson'])if(row[f]!==undefined&&row[f]!==null)row[f]=JSON.parse(row[f]);return row;
}
const legacyEventId=id=>{const bytes=createHash('sha256').update('mutable-legacy-receipt:'+id).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=bytes.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
/** Shared transaction/outbox contract. Delivery has an independent audit commit. */
export function canonicalLedger(db,getAudit=()=>undefined){
 const receipt=id=>{
  const pending=db.prepare('SELECT payload FROM PendingAuditMutation WHERE guid=?').get(id);
  if(pending)return {payload:JSON.parse(pending.payload),delivery:'pending'};
  const audit=getAudit();if(!audit)throw Error('Audit unavailable; prior mutation outcome cannot be resolved');
  const row=audit.prepare('SELECT attributes FROM AuditMutation WHERE guid=?').get(id);
  if(!row)return undefined;
  const metadata=JSON.parse(row.attributes??'null');if(!metadata?.receipt)throw Error('Audit mutation has no compatible operation receipt');
  return {payload:metadata.receipt,delivery:'delivered'};
 };
 return {
  mutate(request,perform,check=()=>{}){
   const serialized=JSON.stringify(request);if(Buffer.byteLength(serialized)>32768)throw Error('Canonical request budget exceeded');
   const operationId=guid(request.operationId);if(request.actorGuid!=null)guid(request.actorGuid);
   return db.transaction(()=>{
    check();const prior=receipt(operationId);
    if(prior){if(prior.payload.request!==serialized)throw Error('Mutation retry differs from original');return {...prior.payload.result,revision:sqlRevision(db)};}
    const budget=db.prepare('SELECT count(*) AS count,coalesce(sum(length(CAST(payload AS BLOB))),0) AS bytes FROM PendingAuditMutation').get();
    if(budget.count>=10000||budget.bytes>=16*1024*1024)throw Error('Canonical audit outbox full; no mutation committed');
    const changes=new Map(),now=new Date().toISOString(),actorGuid=request.actorGuid??null;
    const context={now,actorGuid,change(table,id,action){
     check();guid(id);const key=table+':'+id,old=changes.get(key),before=old?old.before:state(db,table,id);
     const result=action();const after=state(db,table,id);
     changes.set(key,{guid:old?.guid??randomUUID(),recordType:table,recordGuid:id,before,after});
     if(changes.size>256)throw Error('Canonical event budget exceeded');return result;
    }};
    const result=perform(context);check();
    const events=[...changes.values()].filter(e=>JSON.stringify(e.before)!==JSON.stringify(e.after)).map(e=>({...e,operation:e.before===null?'create':e.after===null?'remove':'update'}));
    const payload=JSON.stringify({version:2,kind:'canonical-mutation',request:serialized,result,timestampUtc:now,actorGuid,events});
    if(budget.bytes+Buffer.byteLength(payload)>16*1024*1024)throw Error('Canonical audit outbox full; no mutation committed');
    db.prepare('INSERT INTO PendingAuditMutation VALUES(?,?,?)').run(operationId,now,payload);check();
    return {...result,revision:sqlRevision(db)};
   }).immediate();
  },
  outcome(id){guid(id);try{const r=receipt(id);return r?{status:'committed',delivery:r.delivery,result:r.payload.result,revision:sqlRevision(db)}:{status:'not-committed',revision:sqlRevision(db)};}catch(error){return {status:'unavailable',diagnostics:[error.message],revision:sqlRevision(db)};}},
  status(){const row=db.prepare('SELECT count(*) AS pending,coalesce(sum(length(CAST(payload AS BLOB))),0) AS bytes FROM PendingAuditMutation').get();return {...row,auditAvailable:!!getAudit(),limits:{mutations:10000,bytes:16*1024*1024}};},
  deliver({limit=100,maxBytes=1024*1024}={},check=()=>{},afterAuditCommit=()=>{}){
   if(!Number.isInteger(limit)||limit<1||limit>1000||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>16*1024*1024)throw Error('Invalid audit delivery budget');
   const audit=getAudit();if(!audit)throw Error('Audit unavailable; pending receipts retained');
   const rows=db.prepare('SELECT guid,timestampUtc,payload FROM PendingAuditMutation ORDER BY timestampUtc,guid LIMIT ?').all(limit);
   let delivered=0,bytes=0;
   for(const row of rows){
    check();const size=Buffer.byteLength(row.payload);if(bytes+size>maxBytes)break;
    const payload=JSON.parse(row.payload),digest=fingerprint(row.payload),legacy=payload.version!==2;
    const events=legacy?[{guid:legacyEventId(row.guid),recordType:'LegacyOperationReceipt',recordGuid:row.guid,operation:'preserve',before:null,after:{request:payload.request,result:payload.result}}]:payload.events;
    const metadata=JSON.stringify({receipt:payload,payloadHash:digest,coverage:legacy?'legacy-before-after-unavailable':'complete-record-events'});
    audit.transaction(()=>{
     check();const old=audit.prepare('SELECT attributes FROM AuditMutation WHERE guid=?').get(row.guid);
     if(old){if(old.attributes!==metadata)throw Error('Audit delivery payload conflict');
      const stored=audit.prepare('SELECT guid,operation,recordType,recordGuid,beforeJson,afterJson FROM AuditEvent WHERE mutationGuid=? ORDER BY guid').all(row.guid);
      const wanted=events.map(e=>({guid:e.guid,operation:e.operation,recordType:e.recordType,recordGuid:e.recordGuid,beforeJson:e.before===null?null:JSON.stringify(e.before),afterJson:e.after===null?null:JSON.stringify(e.after)})).sort((a,b)=>a.guid.localeCompare(b.guid));
      if(JSON.stringify(stored)!==JSON.stringify(wanted))throw Error('Audit event delivery conflict');return;
     }
     audit.prepare('INSERT INTO AuditMutation(guid,actorGuid,timestampUtc,attributes) VALUES(?,?,?,?)').run(row.guid,payload.actorGuid??null,row.timestampUtc,metadata);
     const insert=audit.prepare('INSERT INTO AuditEvent(guid,mutationGuid,actorGuid,operation,recordType,recordGuid,timestampUtc,beforeJson,afterJson) VALUES(?,?,?,?,?,?,?,?,?)');
     for(const e of events){check();insert.run(e.guid,row.guid,payload.actorGuid??null,e.operation,e.recordType,e.recordGuid,row.timestampUtc,e.before===null?null:JSON.stringify(e.before),e.after===null?null:JSON.stringify(e.after));}
     check();
    }).immediate();
    afterAuditCommit();check();
    db.transaction(()=>{check();const current=db.prepare('SELECT payload FROM PendingAuditMutation WHERE guid=?').get(row.guid);if(current&&current.payload!==row.payload)throw Error('Pending audit receipt changed');db.prepare('DELETE FROM PendingAuditMutation WHERE guid=?').run(row.guid);}).immediate();
    delivered++;bytes+=size;
   }
   return {delivered,bytes,...this.status()};
  }
 };
}
