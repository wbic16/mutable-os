import {test} from 'node:test';import assert from 'node:assert/strict';import Database from 'better-sqlite3';import {randomUUID as uuid} from 'node:crypto';
import {migrate,migrations} from './schema.mjs';import {canonicalEntities} from './entities.mjs';import {canonicalLedger} from './canonical-ledger.mjs';import {canonicalCardex} from './cardex.mjs';import {coordinate} from '../features/cardex/validation.mjs';
const blank=(name='Ada')=>({op:'save',id:uuid(),operationId:uuid(),expected:null,aliasBaseline:[],name,nameStrata:null,descriptionDocument:null,imageRef:null,aliases:[]});
const edit=r=>({...blank(r.name),id:r.id,expected:r.revision,aliasBaseline:r.aliases.map(a=>({id:a.id,revision:a.revision})),aliases:r.aliases});
function fixture(t){const db=new Database(':memory:'),audit=new Database(':memory:');migrate(db,'mutable',{fresh:true});migrate(audit,'audit',{fresh:true});t.after(()=>{db.close();audit.close();});const ledger=canonicalLedger(db,()=>audit);return {db,entities:r=>canonicalEntities(db,r,()=>{},ledger),call:r=>canonicalCardex(db,ledger,r)};}
test('additive migration preserves existing Entity values and identities',t=>{const db=new Database(':memory:');t.after(()=>db.close());migrate(db,'mutable',{fresh:true,steps:migrations.mutable.slice(0,8)});const id=uuid();db.prepare("INSERT INTO Entity(guid,name,nameKey,description) VALUES(?,'Existing','existing','Legacy text')").run(id);migrate(db,'mutable');assert.deepEqual(db.prepare('SELECT guid,description,nameStrata,descriptionDocument,imageRef FROM Entity').get(),{guid:id,description:'Legacy text',nameStrata:null,descriptionDocument:null,imageRef:null});});
test('atomic fields/aliases, Unicode semantics, inline Description and receipt retry remain local',t=>{const {db,call}=fixture(t),request=blank('Ada 😀 Lovelace');request.aliases=[{id:uuid(),name:'Enchantress',origin:'curated'}];request.nameStrata={version:1,coordinates:coordinate,properties:[{id:uuid(),type:'family-name',start:6,end:13}]};request.descriptionDocument={type:'document-block',children:[{type:'standoff-editor-block',text:'A mathematician',standoffProperties:[{id:uuid(),type:'style/bold',start:2,end:14}]}]};const record=call(request).entity;assert.deepEqual(call(request).entity,record);assert.equal(record.id,request.id);assert.deepEqual(record.descriptionDocument,request.descriptionDocument);for(const table of ['Block','StandoffProperty','Resource','Relationship'])assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,0);const events=JSON.parse(db.prepare('SELECT payload FROM PendingAuditMutation').get().payload).events;assert.deepEqual(events.map(e=>e.recordType),['Entity','EntityAlias']);assert.throws(()=>call({...request,name:'changed retry long'}),/differs/);
 const updated=edit(record);updated.name='Augusta';updated.aliases=[{...record.aliases[0],name:'Countess'}];const newRecord=call(updated).entity;assert.equal(newRecord.aliases[0].id,record.aliases[0].id);assert.equal(newRecord.aliases[0].revision,record.aliases[0].revision+1);assert.equal(call({op:'search',query:'Countess'}).rows[0].id,record.id);assert.equal(call({op:'search',query:'Enchantress'}).rows.length,0);
 const collision=edit(newRecord);collision.name='Must roll back';collision.aliases=[{id:newRecord.id,name:'Collision',origin:'curated'}];assert.throws(()=>call(collision),/GUID already exists/);assert.equal(call({op:'get',id:record.id}).entity.name,'Augusta');});
test('revision guards cover Entity and independent alias changes',t=>{const {db,call}=fixture(t),r=blank();r.aliases=[{id:uuid(),name:'Alias',origin:'curated'}];const record=call(r).entity;call(edit(record));assert.throws(()=>call(edit(record)),/Entity changed/);const latest=call({op:'get',id:record.id}).entity;db.prepare('UPDATE EntityAlias SET revision=revision+1 WHERE guid=?').run(record.aliases[0].id);assert.throws(()=>call(edit(latest)),/Aliases changed/);});
test('invalid graph annotations, structural Description, duplicate aliases and budget fail before writes',t=>{const {db,call}=fixture(t);for(const request of [
 {...blank(),nameStrata:{version:1,coordinates:coordinate,properties:[{id:uuid(),type:'given-name',start:0,end:90}]}},
 {...blank(),descriptionDocument:{type:'document-block',children:[{type:'standoff-editor-block',text:'Ada',standoffProperties:[{id:uuid(),type:'codex/entity-reference',start:0,end:2,value:uuid()}]}]}},
 {...blank(),descriptionDocument:{type:'document-block',children:[{type:'tab-row-block',children:[]}]}},
 {...blank(),aliases:[{id:uuid(),name:'same',origin:'curated'},{id:uuid(),name:'SAME',origin:'curated'}]},
 {...blank(),descriptionDocument:{type:'document-block',children:[{type:'standoff-editor-block',text:'😀'.repeat(10000)}]}}
 ])assert.throws(()=>call(request));assert.equal(db.prepare('SELECT count(*) AS n FROM Entity').get().n,0);});
test('soft deletion preserves dependencies, uses revisions and receipts, and restores without changing the canonical name',t=>{
 const {db,call,entities}=fixture(t),a=call(blank('A')).entity,b=call(blank('B')).entity,rid=uuid();db.prepare('INSERT INTO Relationship(guid,sourceEntityGuid,typename,targetEntityGuid) VALUES(?,?,?,?)').run(rid,a.id,'knows',b.id);
 const del={op:'delete',id:a.id,expected:a.revision,confirmation:a.id,operationId:uuid()};assert.throws(()=>call({...del,confirmation:''}),/confirmation/);const deleted=call(del);assert.ok(deleted.entity.deletedUtc);assert.equal(deleted.entity.name,'A');assert.equal(deleted.entity.displayName,'A [deleted]');assert.deepEqual(call(del),deleted);assert.ok(db.prepare('SELECT 1 FROM Relationship WHERE guid=?').get(rid));assert.equal(call({op:'search',query:'A'}).rows.length,0);assert.equal(call({op:'search',query:'A',status:'deleted'}).rows.length,1);assert.equal(entities({op:'names',ids:[a.id]}).rows[0].name,'A [deleted]');assert.equal(entities({op:'search',query:'A',stream:'name',match:'exact'}).matches.length,0);
 assert.throws(()=>call({...del,operationId:uuid()}),/changed/);const noChange=call({...del,expected:deleted.entity.revision,operationId:uuid()});assert.equal(noChange.stateChanged,false);assert.equal(noChange.entity.revision,deleted.entity.revision);
 const restored=call({...del,op:'restore',expected:deleted.entity.revision,operationId:uuid()}).entity;assert.equal(restored.deletedUtc,null);assert.equal(restored.name,'A');assert.equal(entities({op:'get',id:a.id}).entity.name,'A');assert.ok(call({op:'get',id:b.id}).entity);
});
test('bounded search pages and a single-record save with 10,000 unrelated Entities',t=>{
 const {db,call}=fixture(t),measure=fn=>{const start=performance.now(),value=fn();return {value,ms:performance.now()-start};};
 const baselineSave=measure(()=>call(blank('Baseline'))),id=baselineSave.value.entity.id;
 const baseline={searchMs:measure(()=>call({op:'search',query:''})).ms,openMs:measure(()=>call({op:'get',id})).ms,saveMs:baselineSave.ms};
 const insert=db.prepare('INSERT INTO Entity(guid,name,nameKey) VALUES(?,?,?)');db.transaction(()=>{for(let i=0;i<10000;i++){const name='Entity '+String(i).padStart(5,'0');insert.run(uuid(),name,name.toLowerCase());}})();
 const search=measure(()=>call({op:'search',query:'Entity'})),first=search.value;assert.equal(first.rows.length,30);const second=call({op:'search',query:'Entity',after:first.next});assert.equal(second.rows.length,30);assert.ok(!second.rows.some(r=>first.rows.some(v=>v.id===r.id)));
 const open=measure(()=>call({op:'get',id})),request=blank('New record'),save=measure(()=>call(request));const events=JSON.parse(db.prepare('SELECT payload FROM PendingAuditMutation WHERE guid=?').get(request.operationId).payload).events;
 assert.equal(events.length,1);assert.equal(events[0].recordGuid,save.value.entity.id);assert.equal(call({op:'search',query:'%'}).rows.length,0);
 console.log('Cardex SQLite measurements',JSON.stringify({baseline,unrelatedEntities:10000,searchMs:search.ms,openMs:open.ms,saveMs:save.ms,affectedRecords:events.length}));
});

test('plain Entity writers invalidate only replaced rich values',t=>{
 const {call,entities}=fixture(t),request=blank();request.nameStrata={version:1,coordinates:coordinate,properties:[{id:uuid(),type:'given-name',start:0,end:2}]};request.descriptionDocument={type:'document-block',children:[{type:'standoff-editor-block',text:'Rich metadata'}]};let record=call(request).entity;
 entities({op:'rename',id:record.id,expected:record.revision,name:record.name,operationId:uuid()});record=call({op:'get',id:record.id}).entity;assert.deepEqual(record.nameStrata,request.nameStrata);
 entities({op:'rename',id:record.id,expected:record.revision,name:'Grace',operationId:uuid()});record=call({op:'get',id:record.id}).entity;assert.equal(record.nameStrata,null);assert.deepEqual(record.descriptionDocument,request.descriptionDocument);
 entities({op:'update',id:record.id,expected:record.revision,description:'New plain description',operationId:uuid()});record=call({op:'get',id:record.id}).entity;assert.equal(record.descriptionDocument,null);assert.equal(record.description,'New plain description');
});
test('local rich Description links and superscripts persist without global rows; bad annotations roll back',t=>{
 const {db,call}=fixture(t),request=blank('Leonardo da Vinci');request.descriptionDocument={type:'document-block',children:[{type:'standoff-editor-block',text:'Leonardo[b]',standoffProperties:[{id:uuid(),type:'style/bold',start:0,end:7},{id:uuid(),type:'style/superscript',start:8,end:10-1},{id:uuid(),type:'reference/url',start:8,end:9,value:'https://example.com/#note'}]}]};
 const record=call(request).entity;assert.deepEqual(record.descriptionDocument,request.descriptionDocument);for(const table of ['Block','StandoffProperty','Relationship','Resource'])assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,0);
 const changed={...edit(record),descriptionDocument:structuredClone(record.descriptionDocument)};changed.descriptionDocument.children[0].standoffProperties[2].value='javascript:alert(1)';assert.throws(()=>call(changed),/unsupported link URL/);assert.deepEqual(call({op:'get',id:record.id}).entity,record);
});

function documentFixture(db,entity,{status='complete',resourceType='document-block',segments=2,logical=uuid()}={}){
 const resource=uuid(),block=uuid();db.prepare("INSERT INTO Resource(guid,path,typename,format,rootBlockGuid,contentHash,indexedUtc,extractionProfile,indexStatus,title) VALUES(?,?,?,'mutable',?,'hash','2026-11-02','test',?,'Example Document')").run(resource,resource+'.json',resourceType,block,status);
 db.prepare("INSERT INTO Block(guid,resourceGuid,typename,authoredType,text,coordinate,cellCount) VALUES(?,?,'standoff-editor-block','standoff-editor-block','Hello Ada and Ada','cell',17)").run(block,resource);
 for(let i=0;i<segments;i++)db.prepare("INSERT INTO StandoffProperty(guid,sourceBlockGuid,resourceGuid,identityKind,logicalGuid,typename,startIndex,endIndex,coordinate,resolution,attributes,targetEntityGuid) VALUES(?,?,?,'authored',?,'codex/entity-reference',6,9,'cell','direct','{}',?)").run(uuid(),block,resource,logical,entity);
 return {resource,block,logical};
}
test('logical counts, qualifying Documents, distinct Claims and self-relationships; global sort before paging',t=>{
 const {db,call}=fixture(t),records=Array.from({length:35},(_,i)=>call(blank('Person '+String(i).padStart(2,'0'))).entity),target=records.at(-1);const d=documentFixture(db,target.id);documentFixture(db,target.id);documentFixture(db,target.id,{status:'stale'});documentFixture(db,target.id,{resourceType:'workspace-block'});
 const claim=uuid();db.prepare('INSERT INTO Claim(guid,typename) VALUES(?,?)').run(claim,'Trait');for(let i=0;i<2;i++)db.prepare('INSERT INTO ClaimParticipant(guid,claimGuid,entityGuid,role,ordinal) VALUES(?,?,?,?,?)').run(uuid(),claim,target.id,'Subject',i);
 db.prepare("INSERT INTO Relationship(guid,sourceEntityGuid,typename,targetEntityGuid) VALUES(?,?,'knows',?)").run(uuid(),target.id,target.id);
 const result=call({op:'search',query:'Person',sort:'mentions',direction:'desc'});assert.equal(result.rows[0].id,target.id);assert.deepEqual([result.rows[0].mentions,result.rows[0].documents,result.rows[0].claims,result.rows[0].relationships],[2,2,1,1]);assert.equal(result.total,35);assert.equal(call({op:'search',query:'Person',sort:'mentions',direction:'desc',after:result.next}).rows.length,5);assert.throws(()=>call({op:'search',query:'different',after:result.next}),/different query/);
 const mentions=call({op:'mentions',id:target.id,query:'Ada'});assert.equal(mentions.rows.length,2);assert.equal(mentions.rows.find(r=>r.resourceGuid===d.resource).segments.length,2);assert.equal(mentions.rows[0].segments[0].text,'Ada');assert.equal(call({op:'documents',id:target.id}).rows.length,2);assert.equal(call({op:'claims',id:target.id,filters:{role:'Subject'}}).rows.length,1);assert.equal(call({op:'relationships',id:target.id}).rows.length,1);
});
test('plain Description projection, AND filters, partial bulk conflicts, and stale pages stay usable',t=>{
 const {db,call}=fixture(t),r=blank('Searchable');r.descriptionDocument={type:'document-block',children:[{type:'standoff-editor-block',text:'First paragraph'},{type:'standoff-editor-block',text:'Second paragraph'}]};const a=call(r).entity,b=call(blank('Other')).entity;
 assert.equal(a.description,'First paragraph\nSecond paragraph');db.prepare("UPDATE Entity SET typename='Person' WHERE guid=?").run(a.id);
 assert.equal(call({op:'search',query:'paragraph',filters:{target:'description',typename:'Person'}}).rows.length,1);assert.equal(call({op:'search',query:"%' OR 1=1 --"}).rows.length,0);assert.equal(call({op:'search',query:'paragraph',filters:{target:'description',typename:'Concept'}}).rows.length,0);
 const bulk={op:'bulk-state',state:'delete',confirmation:2,items:[{id:a.id,expected:a.revision,operationId:uuid()},{id:b.id,expected:42,operationId:uuid()}]};const result=call(bulk);assert.ok(result.results[0].entity.deletedUtc);assert.match(result.results[1].error,/changed/);assert.equal(call({op:'get',id:b.id}).entity.deletedUtc,null);assert.deepEqual(call(bulk).results[0],result.results[0]);
});
test('Cardex semantic actions reuse canonical Claim and Relationship writers',t=>{
 const {call}=fixture(t),a=call(blank('Subject')).entity,b=call(blank('Object')).entity,claim=uuid();const semantic=command=>call({op:'semantic',command});
 semantic({op:'create',recordType:'Claim',guid:claim,operationId:uuid(),typename:'Trait',expression:'Knows',participants:[{guid:uuid(),entityGuid:a.id,role:'Subject',ordinal:0}]});let c=semantic({op:'get',recordType:'Claim',guid:claim}).record;assert.equal(c.participants[0].entityGuid,a.id);
 semantic({op:'add',recordType:'ClaimParticipant',guid:uuid(),operationId:uuid(),claimGuid:claim,entityGuid:b.id,role:'Object',ordinal:1,expectedParentRevision:c.revision});assert.equal(call({op:'claims',id:a.id,filters:{other:b.id,type:'Trait'}}).rows.length,1);
 semantic({op:'relationship-create',recordType:'Relationship',id:uuid(),operationId:uuid(),source:a.id,target:b.id,type:'knows'});assert.equal(call({op:'search',query:'',filters:{direction:'out',relationshipType:'knows',otherEntity:b.id}}).rows[0].id,a.id);
});
test('legacy UTF-16 source ranges convert to verified scalar boundaries without changing text',t=>{
 const {db,call}=fixture(t),entity=call(blank()).entity,d=documentFixture(db,entity.id,{segments:1});db.prepare("UPDATE Block SET text='A😀Ada',coordinate='utf16',cellCount=NULL WHERE guid=?").run(d.block);db.prepare("UPDATE StandoffProperty SET startIndex=3,endIndex=6,coordinate='utf16' WHERE resourceGuid=?").run(d.resource);
 const s=call({op:'mentions',id:entity.id}).rows[0].segments[0];assert.deepEqual([s.text,s.start,s.end,s.coordinate],['Ada',2,5,'cell']);assert.equal(db.prepare('SELECT text FROM Block WHERE guid=?').get(d.block).text,'A😀Ada');
});
test('mention filtering searches the displayed excerpt rather than invisible distant Block text',t=>{
 const {db,call}=fixture(t),entity=call(blank()).entity,d=documentFixture(db,entity.id,{segments:1});db.prepare('UPDATE Block SET text=? WHERE guid=?').run('Hello Ada'+' '.repeat(200)+'Distant term',d.block);assert.equal(call({op:'mentions',id:entity.id,query:'Ada'}).rows.length,1);assert.equal(call({op:'mentions',id:entity.id,query:'Distant'}).rows.length,0);
});

test('canonical Entity and authority lookups expose the saved Cardex image without extra mutations',t=>{
 const {db,call,entities}=fixture(t),imageRef={kind:'managed',cavernId:'test-cavern',assetId:'sha256:'+'a'.repeat(64)};
 const record=call({...blank('Portrait'),imageRef}).entity;
 db.prepare('INSERT INTO ExternalIdentity(guid,entityGuid,resourceGuid,namespace,externalKey,attributes) VALUES(?,?,?,?,?,?)').run(uuid(),record.id,uuid(),'wikidata','Q762','{}');
 const before=db.prepare('SELECT count(*) AS n FROM PendingAuditMutation').get().n;
 assert.deepEqual(entities({op:'get',id:record.id}).entity.imageRef,imageRef);
 assert.deepEqual(entities({op:'authority-lookup',record:{provider:'wikidata',id:'Q762'}}).entity.imageRef,imageRef);
 assert.equal(db.prepare('SELECT count(*) AS n FROM PendingAuditMutation').get().n,before);
});
