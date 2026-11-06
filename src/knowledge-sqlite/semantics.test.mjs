import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import Database from 'better-sqlite3';
import {openSqliteFoundation} from './client.mjs';
import {migrate,migrations,validateSchema,hash} from './schema.mjs';
import {canonicalLedger} from './canonical-ledger.mjs';
import {canonicalSemantics} from './semantics.mjs';
import {encodeAuthoredValue as encode,decodeAuthoredValue as decode} from '../history/preplan-spike/authored-values.mjs';
async function fixture(t,options={}){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mutable-semantic-')),vault=path.join(dir,'vault');await fs.mkdir(vault);let client=await openSqliteFoundation({vault,initialize:true,...options});t.after(async()=>{await client.close();await fs.rm(dir,{recursive:true,force:true});});return {dir,vault,get client(){return client;},async reopen(opts={}){await client.close();client=await openSqliteFoundation({vault,...opts});return client;}};}
const command=(recordType,op,fields)=>({recordType,op,operationId:uuid(),...fields});
async function entity(c,typename='Person'){const id=uuid();await c.entities({op:'create',operationId:uuid(),id,name:'Synthetic '+typename,typename});return id;}
async function dataset(c){const guid=uuid();await c.semantics(command('DataSet','create',{guid,name:'Synthetic collection'}));return guid;}
async function point(c,fields={}){const guid=uuid();await c.semantics(command('DataPoint','create',{guid,value:'16',...fields}));return guid;}
test('version-1 upgrade retains canonical identities and baseline checksum; constraints enforce many-to-many',()=>{
 const db=new Database(':memory:');try{
  migrate(db,'mutable',{fresh:true,steps:migrations.mutable.slice(0,1)});const identity=validateSchema(db,'mutable').vaultGuid;
  db.prepare('INSERT INTO Entity(guid,name,nameKey) VALUES(?,?,?)').run('existing','Existing','existing');migrate(db,'mutable');
  assert.equal(validateSchema(db,'mutable').version,migrations.mutable.length);assert.equal(validateSchema(db,'mutable').vaultGuid,identity);
  assert.equal(db.prepare('SELECT guid FROM Entity').get().guid,'existing');assert.equal(db.prepare("SELECT value FROM SchemaInfo WHERE key='migration:1'").get().value,migrations.mutable[0].checksum);
  const pointColumns=db.prepare('PRAGMA table_info(DataPoint)').all().map(x=>x.name);assert.ok(!pointColumns.includes('datasetGuid'));assert.ok(!pointColumns.includes('dataSetGuid'));
  db.exec("INSERT INTO DataSet(guid) VALUES('s1'),('s2'); INSERT INTO DataPoint(guid,valueJson,valueType) VALUES('p1','1','number'),('p2','1','number')");
  const insert=db.prepare('INSERT INTO DataSetMembership(guid,dataSetGuid,dataPointGuid) VALUES(?,?,?)');insert.run('m1','s1','p1');insert.run('m2','s2','p1');insert.run('m3','s1','p2');
  assert.throws(()=>insert.run('m4','s1','p1'),/UNIQUE/);assert.throws(()=>insert.run('m4','unknown','p1'),/FOREIGN KEY/);
  assert.throws(()=>db.exec("DELETE FROM DataPoint WHERE guid='p1'"),/FOREIGN KEY/);
  const plan=db.prepare('EXPLAIN QUERY PLAN SELECT dataSetGuid FROM DataSetMembership WHERE dataPointGuid=?').all('p1').map(x=>x.detail).join(' ');assert.match(plan,/IX_DataSetMembership_Point_Set/);
 }finally{db.close();}
});
test('worker n-ary Claims, extensible Entity-valued qualifiers and independent Time revisions',async t=>{
 const f=await fixture(t),c=f.client,subject=await entity(c),source=await entity(c),concept=await entity(c,'Concept'),time=uuid();
 const temporal=await c.semantics(command('Time','create',{guid:time,entity:{name:'probably 1475'},expression:'probably 1475',startYear:1475,certainty:'probably',precision:'year',attributes:encode({rawSeason:0,hour:undefined})}));
 assert.equal(temporal.record.entityGuid,time);assert.equal(temporal.record.startHour,null);assert.equal(decode(temporal.record.attributes).rawSeason,0);
 const claim=uuid(),subjectId=uuid(),sourceId=uuid(),qualifierId=uuid();
 const create=command('Claim','create',{guid:claim,expression:'unreliable',kind:'Trait',participants:[{guid:subjectId,entityGuid:subject,role:'Subject',ordinal:0},{guid:sourceId,entityGuid:source,role:'AccordingTo',ordinal:1}],qualifiers:[{guid:qualifierId,entityGuid:concept,role:'context',ordinal:0}]});
 await c.semantics(create);let result=await c.semantics({recordType:'Claim',op:'get',guid:claim});assert.equal(result.record.typename,'Trait');assert.equal(result.record.participants.length,2);assert.equal(result.record.qualifiers[0].role,'context');
 assert.equal((await c.semantics({...create,operationId:uuid()})).outcome,'already-equivalent');
 const conflicting={...create,operationId:uuid(),participants:[{...create.participants[0],role:'Object'},create.participants[1]]};
 await assert.rejects(c.semantics(conflicting),/different participants/);assert.equal((await c.operationOutcome(conflicting.operationId)).status,'not-committed');
 await assert.rejects(c.semantics(command('Claim','update',{guid:claim,expectedRevision:0,kind:'Trait',typename:'Event'})),/differ/);
 assert.equal((await c.entities({op:'get',id:claim})).entity,undefined);
 await c.semantics(command('ClaimQualifier','add',{guid:uuid(),claimGuid:claim,entityGuid:time,role:'at-time',ordinal:1,expectedParentRevision:0}));
 await c.semantics(command('ClaimQualifier','add',{guid:uuid(),claimGuid:claim,entityGuid:concept,role:'type-of',ordinal:2,expectedParentRevision:1}));
 await assert.rejects(c.entities({op:'update',id:concept,typename:'Person',expected:0,operationId:uuid()}),/Concept/);
 await assert.rejects(c.semantics(command('ClaimQualifier','add',{guid:uuid(),claimGuid:claim,entityGuid:subject,role:'at-time',ordinal:3,expectedParentRevision:2})),/Time/);
 await assert.rejects(c.semantics(command('ClaimParticipant','update',{guid:subjectId,role:'Object',expectedRevision:0,expectedParentRevision:0})),/revision/);
 const query=await c.semantics({recordType:'Claim',op:'query',filters:{typename:'Trait'},participants:[{entityGuid:subject,role:'Subject'},{entityGuid:source,role:'AccordingTo'}],qualifiers:[{role:'context',entityGuid:concept}]});assert.equal(query.items.length,1);
 await c.entities({op:'rename',id:time,name:'Temporal display label',expected:0,operationId:uuid()});assert.equal((await c.semantics({recordType:'Time',op:'get',guid:time})).record.revision,0);
 await c.semantics(command('Time','update',{guid:time,expression:'probably 1475',startMinute:0,expectedRevision:0}));assert.equal((await c.entities({op:'get',id:time})).entity.revision,1);
 await assert.rejects(c.entities({op:'update',id:time,typename:'Person',expected:1,operationId:uuid()}),/Time/);
 await assert.rejects(c.semantics(command('Time','update',{guid:time,expectedRevision:1,normalizationProfile:'guess',lowerBoundDay:1,upperBoundDayExclusive:2})),/unsupported/);
 await c.semantics(command('Claim','create',{guid:uuid(),expression:null,kind:null}));
});
test('observations retain authored values and identity across many-to-many membership, queries and removal',async t=>{
 const f=await fixture(t),c=f.client,place=await entity(c,'Place'),s1=await dataset(c),s2=await dataset(c),p1=await point(c,{dimensions:[{guid:uuid(),entityGuid:place,role:'place',ordinal:0},{guid:uuid(),entityGuid:place,role:'place',ordinal:1}]}),p2=await point(c,{dimensions:[{guid:uuid(),entityGuid:place,role:'place',ordinal:0}]}),categorical=await point(c,{value:'Frozen'});
 const m1=uuid(),m2=uuid(),m3=uuid();
 const add1=command('DataSetMembership','add',{guid:m1,dataSetGuid:s1,dataPointGuid:p1,expectedDataSetRevision:0,attributes:encode({sourceRows:[0]})});await c.semantics(add1);await c.semantics(add1);
 await c.semantics(command('DataSetMembership','add',{guid:m2,dataSetGuid:s2,dataPointGuid:p1,expectedDataSetRevision:0}));
 await c.semantics(command('DataSetMembership','add',{guid:m3,dataSetGuid:s1,dataPointGuid:p2,expectedDataSetRevision:1}));
 assert.equal((await c.semantics({op:'collections',dataPointGuid:p1})).items.length,2);
 assert.equal((await c.semantics({op:'members',dataSetGuid:s1})).items.length,2);
 assert.equal((await c.semantics({op:'count',recordType:'DataPoint',dataSetGuids:[s1,s2],dimensions:[{role:'place',entityGuid:place}]})).count,2);
 assert.equal((await c.semantics({op:'count',recordType:'DataPoint',dataSetGuids:[s1,s2],membershipMode:'intersection'})).count,1);
 await assert.rejects(c.semantics(command('DataSetMembership','add',{guid:uuid(),dataSetGuid:s1,dataPointGuid:p1,expectedDataSetRevision:2})),/pair/);
 await c.semantics(command('DataSetMembership','remove',{guid:m1,expectedRevision:0,expectedDataSetRevision:2}));
 const observation=(await c.semantics({op:'get',recordType:'DataPoint',guid:p1})).record;assert.equal(observation.value,'16');assert.equal(observation.valueType,'string');assert.equal(observation.revision,0);assert.equal(observation.dimensions.length,2);assert.equal((await c.semantics({op:'collections',dataPointGuid:p1})).items.length,1);
 assert.equal((await c.semantics({op:'get',recordType:'DataPoint',guid:categorical})).record.value,'Frozen');
 const rich=await point(c,{value:encode({undefined:undefined,minusZero:-0,nan:NaN,tag:{$codexHistoryValue:['undefined']}})});assert.deepEqual(decode((await c.semantics({op:'get',recordType:'DataPoint',guid:rich})).record.value),{undefined:undefined,minusZero:-0,nan:NaN,tag:{$codexHistoryValue:['undefined']}});
 await assert.rejects(c.semantics(command('DataPoint','create',{guid:uuid(),value:'1',valueType:'number'})),/valueType/);
 await assert.rejects(c.semantics(command('DataPoint','update',{guid:p1,expectedRevision:0,datasetGuid:s1})),/ownership/);
 await assert.rejects(c.semantics(command('DataPoint','update',{guid:p1,expectedRevision:0,valueJson:'16'})),/Unsupported/);
 await assert.rejects(c.semantics({op:'query',recordType:'DataPoint',dimensions:[{entityId:place}]}),/filter/);
 await assert.rejects(c.semantics({op:'query',recordType:'DataSet',participants:[{entityGuid:place}]}),/Unsupported/);
});
test('bounded batches are atomic and sequential expected revisions audit each changed record',async t=>{
 const f=await fixture(t),c=f.client,set=uuid(),pointId=uuid();
 const bad={op:'batch',operationId:uuid(),commands:[{recordType:'DataSet',op:'create',guid:set,name:'Synthetic'},{recordType:'DataPoint',op:'create',guid:pointId,value:'1'},{recordType:'DataSetMembership',op:'add',guid:uuid(),dataSetGuid:set,dataPointGuid:uuid(),expectedDataSetRevision:0}]};
 await assert.rejects(c.semantics(bad),/missing/);assert.equal((await c.semantics({op:'get',recordType:'DataSet',guid:set})).record,undefined);assert.equal((await c.auditStatus()).pending,0);
 await assert.rejects(c.semantics({op:'batch',operationId:uuid(),commands:[{recordType:'Relationship',op:'create',id:uuid(),name:'Wrong record kind'}]}),/record type/);
 const op=uuid();await c.semantics({op:'batch',operationId:op,commands:[{recordType:'DataSet',op:'create',guid:set},{recordType:'DataPoint',op:'create',guid:pointId,value:'1'},{recordType:'DataSetMembership',op:'add',guid:uuid(),dataSetGuid:set,dataPointGuid:pointId,expectedDataSetRevision:0}]});assert.equal((await c.auditStatus()).pending,1);
 assert.equal((await c.operationOutcome(op)).status,'committed');await c.deliverAudit();assert.equal((await c.operationOutcome(op)).delivery,'delivered');
 // Delivered audit lives in the phext's audit stratum; read the
 // entry back through the knowledge store on a fresh VFS instance.
 const {PhextKnowledgeStore}=await import('./phext-store.mjs');const {PhextVFS}=await import('../../dist/src/phext/vfs.js');
 const rows=new PhextKnowledgeStore(PhextVFS.open(path.join(f.vault,'cavern.phext'))).readAudit(op).events;
 assert.deepEqual(new Set(rows.map(r=>r.recordType)),new Set(['DataSet','DataPoint','DataSetMembership']));assert.equal(JSON.parse(rows.find(r=>r.recordType==='DataSet').afterJson).revision,1);
});
test('delivery crash/retry, durable conflict outcomes and compatibility with old request receipts',()=>{
 const db=new Database(':memory:'),audit=new Database(':memory:');try{
  const info=migrate(db,'mutable',{fresh:true});migrate(audit,'audit',{fresh:true,vaultGuid:info.vaultGuid});const ledger=canonicalLedger(db,()=>audit),id=uuid(),request=command('DataSet','create',{guid:id,name:'Original'});
  canonicalSemantics(db,ledger,request);assert.throws(()=>ledger.deliver({},()=>{},()=>{throw Error('crash after audit commit');}),/crash/);assert.equal(ledger.status().pending,1);assert.equal(audit.prepare('SELECT count(*) n FROM AuditEvent').get().n,1);
  ledger.deliver();assert.equal(ledger.status().pending,0);canonicalSemantics(db,ledger,command('DataSet','update',{guid:id,expectedRevision:0,name:'Edited'}));assert.equal(canonicalSemantics(db,ledger,request).record.name,'Original');assert.throws(()=>canonicalSemantics(db,ledger,{...request,name:'Conflict'}),/differs/);
  const old=uuid(),payload={kind:'canonical-entity',request:JSON.stringify({op:'create',id:uuid(),name:'Old',operationId:old}),result:{entity:{id:'retained',name:'Old'}}};db.prepare('INSERT INTO PendingAuditMutation VALUES(?,?,?)').run(old,'old',JSON.stringify(payload));ledger.deliver();assert.equal(ledger.outcome(old).result.entity.name,'Old');
  const receipt=JSON.parse(audit.prepare('SELECT attributes FROM AuditMutation WHERE guid=?').get(old).attributes);assert.equal(receipt.coverage,'legacy-before-after-unavailable');
  const unavailable=canonicalLedger(db,()=>undefined);assert.equal(unavailable.outcome(uuid()).status,'unavailable');assert.throws(()=>canonicalSemantics(db,unavailable,command('DataSet','create',{guid:uuid()})),/unavailable/);
 }finally{audit.close();db.close();}
});
test('all canonical structures/evidence survive clearDerived, delivery, backup/reopen and readonly; flag disables new routes',async t=>{
 const f=await fixture(t),c=f.client,claim=uuid(),evidence=uuid(),set=await dataset(c),time=uuid(),participant=uuid(),qualifier=uuid(),dimension=uuid();
 await c.semantics(command('Time','create',{guid:time,entity:{name:'Synthetic partial Time'},startYear:1475}));
 const pointId=await point(c,{dimensions:[{guid:dimension,entityGuid:time,role:'time',ordinal:0}]});
 await c.semantics(command('Claim','create',{guid:claim,expression:null,participants:[{guid:participant,entityGuid:time,role:null,ordinal:0}],qualifiers:[{guid:qualifier,entityGuid:time,role:'at-time',ordinal:0}]}));
 await c.semantics(command('ClaimEvidence','add',{guid:evidence,claimGuid:claim,expectedParentRevision:0,resourceGuid:uuid(),blockGuid:uuid(),sourceContentHash:'synthetic-source-hash',startIndex:0,endIndex:0,coordinate:'cell',evidenceKind:'synthetic'}));
 await c.semantics(command('DataSetMembership','add',{guid:uuid(),dataSetGuid:set,dataPointGuid:pointId,expectedDataSetRevision:0}));
 await c.clearDerived();assert.ok((await c.semantics({op:'get',recordType:'ClaimEvidence',guid:evidence})).record);await c.deliverAudit();await c.backup(path.join(f.dir,'backup'));
 const readOnly=await f.reopen({readOnly:true});assert.equal((await readOnly.semantics({op:'members',dataSetGuid:set})).items.length,1);await assert.rejects(readOnly.semantics(command('DataSet','create',{guid:uuid()})),/read-only/);
 for(const [recordType,guid]of [['Time',time],['Claim',claim],['ClaimParticipant',participant],['ClaimQualifier',qualifier],['ClaimEvidence',evidence],['DataSet',set],['DataPoint',pointId],['DataPointDimension',dimension]])assert.ok((await readOnly.semantics({op:'get',recordType,guid})).record);
 const disabled=await f.reopen({semanticServicesEnabled:false});await assert.rejects(disabled.semantics({op:'get',recordType:'Claim',guid:claim}),/disabled/);assert.equal((await disabled.verify()).ok,true);
 const restored=path.join(f.dir,'restored');await fs.mkdir(restored);const r=await openSqliteFoundation({vault:restored,restoreFrom:path.join(f.dir,'backup')});try{
  assert.equal((await r.semantics({op:'members',dataSetGuid:set})).items.length,1);
  for(const [recordType,guid]of [['Time',time],['Claim',claim],['ClaimParticipant',participant],['ClaimQualifier',qualifier],['ClaimEvidence',evidence],['DataSet',set],['DataPoint',pointId],['DataPointDimension',dimension]])assert.ok((await r.semantics({op:'get',recordType,guid})).record);
 }finally{await r.close();}
});
test('ordered child pagination, stale query revisions and mutation cancellation retain exact semantics',async t=>{
 const f=await fixture(t),c=f.client,participant=await entity(c),claim=uuid();
 await c.semantics(command('Claim','create',{guid:claim,participants:[2,0,1].map(i=>({guid:uuid(),entityGuid:participant,role:i===0?'None':'Subject',ordinal:i}))}));
 const page=await c.semantics({recordType:'ClaimParticipant',op:'query',filters:{claimGuid:claim},limit:2});assert.deepEqual(page.items.map(x=>x.ordinal),[0,1]);assert.equal(page.items[0].role,'None');
 const next=await c.semantics({recordType:'ClaimParticipant',op:'query',filters:{claimGuid:claim},limit:2,after:page.nextAfter,revision:page.revision});assert.deepEqual(next.items.map(x=>x.ordinal),[2]);
 await c.semantics(command('Claim','update',{guid:claim,expression:'changed',expectedRevision:0}));await assert.rejects(c.semantics({recordType:'ClaimParticipant',op:'query',filters:{claimGuid:claim},revision:page.revision}),/expired/);
 const abort=new AbortController();abort.abort(Error('canceled before dispatch'));const input=command('DataSet','create',{guid:uuid()});await assert.rejects(c.semantics(input,abort.signal),/canceled/);assert.equal((await c.operationOutcome(input.operationId)).status,'not-committed');
});
test('canonical callback interruption and event/byte budgets rollback all writes and receipts',()=>{
 const db=new Database(':memory:'),audit=new Database(':memory:');try{
  const info=migrate(db,'mutable',{fresh:true});migrate(audit,'audit',{fresh:true,vaultGuid:info.vaultGuid});const ledger=canonicalLedger(db,()=>audit);
 const request=command('DataSet','create',{guid:uuid()});let n=0;
 assert.throws(()=>canonicalSemantics(db,ledger,request,()=>{if(++n===4)throw Error('interrupted');}),/interrupted/);assert.equal(db.prepare('SELECT count(*) n FROM DataSet').get().n,0);assert.equal(ledger.status().pending,0);
 assert.throws(()=>ledger.mutate({...request,operationId:uuid()},ctx=>{for(let i=0;i<257;i++){const id=uuid();ctx.change('DataSet',id,()=>db.prepare('INSERT INTO DataSet(guid) VALUES(?)').run(id));}return {};}),/event budget/);
 assert.equal(db.prepare('SELECT count(*) n FROM DataSet').get().n,0);assert.equal(ledger.status().pending,0);
  db.prepare('INSERT INTO PendingAuditMutation VALUES(?,?,?)').run(uuid(),'now',JSON.stringify('x'.repeat(16*1024*1024)));assert.throws(()=>canonicalSemantics(db,ledger,request),/outbox full/);assert.equal(db.prepare('SELECT count(*) n FROM DataSet').get().n,0);
 }finally{audit.close();db.close();}
});
test('corrupt audit keeps canonical reads and pending retries, while refusing unknown writes through the worker',async t=>{
 const f=await fixture(t),first=command('DataSet','create',{guid:uuid(),name:'Delivered'});await f.client.semantics(first);await f.client.deliverAudit();
 const request=command('DataSet','create',{guid:uuid(),name:'Retained pending result'});await f.client.semantics(request);
 await f.client.close();
 // The disk era renamed audit.db away; the phext analog is a
 // corrupted audit stratum entry, which the foundation degrades to
 // the same audit-unavailable posture (never a silent reset).
 const {PhextVFS}=await import('../../dist/src/phext/vfs.js');const vfs=PhextVFS.open(path.join(f.vault,'cavern.phext'));
 vfs.writeFile(`/.mutable/audit/${first.operationId}.json`,'not json');vfs.flush();
 const c=await f.reopen();assert.equal((await c.auditStatus()).auditAvailable,false);
 assert.equal((await c.semantics({op:'get',recordType:'DataSet',guid:request.guid})).record.name,request.name);
 assert.equal((await c.semantics(request)).record.name,request.name);assert.equal((await c.operationOutcome(request.operationId)).status,'committed');
 const unknown=command('DataSet','create',{guid:uuid()});await assert.rejects(c.semantics(unknown),/Audit unavailable/);assert.equal((await c.operationOutcome(unknown.operationId)).status,'unavailable');
 await assert.rejects(c.deliverAudit(),/Audit unavailable/);assert.equal((await c.auditStatus()).pending,1);
});
