import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate, migrations, validateSchema, verifyDatabase, rebuildFts, clearDerived, hash } from './schema.mjs';

function current(t) { const db = new Database(':memory:'); t.after(() => db.close()); migrate(db, 'mutable', { fresh: true }); return db; }
function resource(db, id = 'r', block = 'b') {
  db.prepare(`INSERT INTO Resource(guid,path,typename,format,rootBlockGuid,contentHash,indexedUtc,extractionProfile,indexStatus)
    VALUES(?,?,'document-block','mutable-document',?,'hash','now','p1','complete')`).run(id, `${id}.mutable.json`, block);
  db.prepare(`INSERT INTO Block(guid,resourceGuid,typename,authoredType,coordinate,cellCount)
    VALUES(?,?,'standoff-editor-block','standoff-editor-block','cell',12)`).run(block,id);
}
function segment(db, id, start, end, extra = {}) {
  const row = { guid:id, resourceGuid:'r', sourceBlockGuid:'b', identityKind:'authored', logicalGuid:'logical',
    typename:'codex/entity-reference', startIndex:start, endIndex:end, coordinate:'cell', resolution:'direct', attributes:'{}', ...extra };
  db.prepare(`INSERT INTO StandoffProperty(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
}
const hits = (db, table, text) => db.prepare(`SELECT rowid FROM ${table} WHERE ${table} MATCH ? ORDER BY rowid`).all(text);

test('fresh/repeated migration preserves identities, checksums and independent databases', t => {
  const db = current(t), prior = validateSchema(db,'mutable');
  assert.deepEqual(migrate(db,'mutable'), prior);
  const audit = new Database(':memory:'); t.after(() => audit.close());
  migrate(audit,'audit',{fresh:true,vaultGuid:prior.vaultGuid});
  assert.equal(validateSchema(audit,'audit').vaultGuid, prior.vaultGuid);
  assert.throws(() => validateSchema(audit,'mutable'), /Not a Mutable/);
  assert.throws(() => migrate(db,'mutable',{fresh:true}), /empty database/);
  assert.equal(db.pragma('foreign_keys',{simple:true}),1);
  assert.ok(verifyDatabase(db,'mutable').ok);
});

test('version 10 upgrades to the existing version 12 schema and reopens without changing authored associations', t => {
  const db = new Database(':memory:'); t.after(() => db.close());
  const prior = migrate(db, 'mutable', { fresh: true, steps: migrations.mutable.slice(0, 10) });
  db.exec("INSERT INTO Entity(guid,name,nameKey) VALUES('person','Author','author')");
  const next = migrate(db, 'mutable');
  assert.equal(next.version, 12); assert.equal(next.vaultGuid, prior.vaultGuid);
  // These checksums belong to the previously released migrations, not replacements.
  assert.equal(next['migration:11'], '9240eb0e4c5d5d2ea031122cd442e9835695181e1753e53960c65f0d3ba927ad');
  assert.equal(next['migration:12'], '94dc3b031dafba77b64420c1a99fafb7cd1582f22263b35441a85858b9bf7a11');
  db.exec(`INSERT INTO Cache(key,value,createdAt,updatedAt) VALUES('entry','{"value":1}','now','now');
    INSERT INTO DocumentEntityAssociation(guid,sourceResourceGuid,sourceEntityGuid,entityGuid,sourceFingerprint,attributes)
    VALUES('association','document','source-person','person','fingerprint','{"reviewed":true}')`);
  const before = db.serialize();
  assert.deepEqual(migrate(db, 'mutable'), next);
  assert.deepEqual(db.serialize(), before);
  clearDerived(db);
  assert.equal(db.prepare('SELECT entityGuid FROM DocumentEntityAssociation').get().entityGuid, 'person');
  assert.equal(db.prepare('SELECT name FROM Entity').get().name, 'Author');
  assert.equal(db.prepare('SELECT value FROM Cache').get().value, '{"value":1}');
});

for (const [label, sql, message] of [
  ['future version', "UPDATE SchemaInfo SET value='99' WHERE key='schemaVersion'; PRAGMA user_version=99", /schema version/],
  ['version disagreement', 'PRAGMA user_version=1', /schema version/],
  ['checksum', "UPDATE SchemaInfo SET value='wrong' WHERE key='migration:1'", /checksum/],
  ['kind', "UPDATE SchemaInfo SET value='audit' WHERE key='databaseKind'", /identity/],
  ['value grammar', "UPDATE SchemaInfo SET value='unknown' WHERE key='authoredValueEncoding'", /identity/],
  ['application id', 'PRAGMA application_id=1', /Not a Mutable/],
  ['missing index', 'DROP INDEX IX_Entity_Name', /structure/],
  ['extra schema', 'CREATE TABLE Surprise(id INTEGER)', /structure/],
]) test(`rejects ${label} without mutating database`, t => {
  const db = current(t); db.exec(sql); const before = db.serialize();
  assert.throws(() => migrate(db,'mutable'), message); assert.deepEqual(db.serialize(),before);
});

test('failed future migration rolls back DDL, data and migration metadata together', t => {
  const db = current(t), before = db.serialize();
  const sql = "CREATE TABLE FutureProof(id INTEGER); INSERT INTO Entity(guid,name,nameKey) VALUES('e','Poe','poe'); INSERT INTO Missing VALUES(1)";
  assert.throws(() => migrate(db,'mutable',{steps:[...migrations.mutable,{version:migrations.mutable.length+1,sql,checksum:hash(sql)}]}), /Missing/);
  assert.deepEqual(db.serialize(),before); assert.equal(validateSchema(db,'mutable').version,migrations.mutable.length);
});

test('successful future migration is transactional and repeatable; old runner rejects it', t => {
  const db = current(t), sql='CREATE TABLE FutureProof(id INTEGER PRIMARY KEY) STRICT';
  const steps=[...migrations.mutable,{version:migrations.mutable.length+1,sql,checksum:hash(sql)}];
  const next=migrate(db,'mutable',{steps}); assert.equal(next.version,migrations.mutable.length+1);
  assert.deepEqual(migrate(db,'mutable',{steps}),next);
  assert.throws(() => validateSchema(db,'mutable'), /schema version/);
});

test('Entity identity, alias origins, relationship endpoints and strict authored-value storage', t => {
  const db=current(t);
  db.exec("INSERT INTO Entity(guid,name,nameKey) VALUES('legacy-agent','Poe','poe'),('another','Poe','poe')");
  assert.throws(() => db.exec("INSERT INTO Entity(guid,name,nameKey) VALUES('legacy-agent','New','new')"), /UNIQUE/);
  assert.throws(() => db.exec("INSERT INTO Entity(guid,name,nameKey) VALUES('blank',' ',' ' )"), /CHECK/);
  assert.throws(() => db.exec("UPDATE Entity SET attributes='not-json'"), /CHECK/);
  assert.throws(() => db.exec("UPDATE Entity SET revision='text'"), /INTEGER/);
  for (const origin of ['curated','observed','imported','recovered']) db.prepare('INSERT INTO EntityAlias(guid,entityGuid,alias,aliasKey,origin) VALUES(?,?,?,?,?)').run(origin,'legacy-agent','Edgar','edgar',origin);
  assert.throws(() => db.exec("INSERT INTO EntityAlias(guid,entityGuid,alias,aliasKey,origin) VALUES('again','legacy-agent','EDGAR','edgar','curated')"), /UNIQUE/);
  assert.throws(() => db.exec("INSERT INTO Relationship(guid,sourceEntityGuid,typename,targetEntityGuid) VALUES('bad','legacy-agent','knows','missing')"), /FOREIGN KEY/);
  db.exec("INSERT INTO Relationship(guid,sourceEntityGuid,typename,targetEntityGuid) VALUES('rel','legacy-agent','knows','another')");
  assert.ok(!db.pragma('table_info(Relationship)').some(r => /Block|Resource/.test(r.name)));
  // P1 stores tagged JSON losslessly; the codec, not SQL json_valid(), validates the grammar in P2.
  const value=JSON.stringify({unknown:{$codexHistoryValue:['undefined']},n:{$codexHistoryValue:['number','NaN']},zero:{$codexHistoryValue:['number','-0']}});
  db.prepare('UPDATE Entity SET attributes=? WHERE guid=?').run(value,'legacy-agent');
  assert.equal(db.prepare('SELECT attributes FROM Entity WHERE guid=?').get('legacy-agent').attributes,value);
});

test('source consistency, unresolved targets, linked segments and half-open ranges', t => {
  const db=current(t); resource(db); resource(db,'other','other-block');
  db.exec(`INSERT INTO BlockRelation(guid,resourceGuid,sourceBlockGuid,identityKind,typename,targetBlockGuid,targetResourceGuid,targetScope,kind)
    VALUES('edge','r','b','authored','children','other-block','other','document','owned')`);
  db.exec("DELETE FROM Resource WHERE guid='other'");
  assert.equal(db.prepare('SELECT kind FROM BlockRelation').get().kind,'owned');
  segment(db,'s1',0,5,{targetEntityGuid:'missing'});
  segment(db,'s2',5,8,{resolution:'unresolved',definitionResourceGuid:'missing',definitionBlockGuid:'def-owner',definitionAnnotationId:'def'});
  assert.equal(db.prepare('SELECT count(*) n FROM Entity').get().n,0);
  assert.throws(() => segment(db,'wrong',0,1,{resourceGuid:'other'}), /ownership/);
  assert.throws(() => segment(db,'negative',-1,1), /CHECK/);
  assert.throws(() => segment(db,'inverted',5,2), /CHECK/);
  assert.deepEqual(db.prepare('SELECT guid FROM StandoffProperty WHERE sourceBlockGuid=? AND startIndex < ? AND endIndex > ?').all('b',8,5),[{guid:'s2'}]);
  assert.equal(db.prepare('SELECT count(DISTINCT logicalGuid) n FROM StandoffProperty').get().n,1);
  db.exec("INSERT INTO Entity(guid,name,nameKey) VALUES('missing','Poe','poe')");
  assert.throws(() => db.exec("DELETE FROM Entity WHERE guid='missing'"), /saved references/);
  assert.ok(verifyDatabase(db,'mutable').ok);
});

test('FTS trigger/update/delete/rebuild/rollback parity and inline-object boundaries', t => {
  const db=current(t); resource(db);
  db.exec("INSERT INTO BlockTextRun(blockGuid,ordinal,text,boundaries) VALUES('b',0,'raven café Ελληνικά','[0,1]'),('b',1,'nevermore','[7,8]')");
  assert.equal(hits(db,'BlockSearch','raven').length,1);
  assert.equal(hits(db,'BlockSearch','"raven nevermore"').length,0);
  assert.equal(hits(db,'BlockSearch','café').length,1);
  assert.throws(db.transaction(() => { db.exec("UPDATE BlockTextRun SET text='discarded' WHERE ordinal=0"); throw Error('rollback'); }), /rollback/);
  assert.equal(hits(db,'BlockSearch','discarded').length,0);
  db.exec("UPDATE BlockTextRun SET text='crow' WHERE ordinal=0");
  assert.equal(hits(db,'BlockSearch','raven').length,0);
  const before=hits(db,'BlockSearch','crow'); rebuildFts(db); assert.deepEqual(hits(db,'BlockSearch','crow'),before);
  db.exec("INSERT INTO Entity(guid,name,nameKey) VALUES('e','Poe','poe'); UPDATE Entity SET name='Edgar Allan Poe',nameKey='edgar allan poe'; INSERT INTO EntityAlias(guid,entityGuid,alias,aliasKey,origin) VALUES('alias','e','Raven author','raven author','curated')");
  assert.equal(hits(db,'EntitySearch','Allan').length,1); assert.equal(hits(db,'EntityAliasSearch','Raven').length,1);
  db.exec("DELETE FROM Resource; DELETE FROM Entity");
  assert.equal(hits(db,'BlockSearch','crow').length,0); assert.equal(hits(db,'EntitySearch','Allan').length,0); assert.equal(hits(db,'EntityAliasSearch','Raven').length,0);
  assert.equal(verifyDatabase(db,'mutable').fts,'ok');
});

test('derived clearing preserves canonical knowledge and pending audit; never claims repopulation', t => {
  const db=current(t); resource(db); segment(db,'s',0,2);
  db.exec("INSERT INTO Entity(guid,name,nameKey) VALUES('e','Poe','poe'),('e2','Raven','raven'); INSERT INTO Relationship(guid,sourceEntityGuid,typename,targetEntityGuid) VALUES('rel','e','wrote','e2'); INSERT INTO Actor(guid,typename,name) VALUES('actor','Human','Writer'); INSERT INTO PendingAuditMutation VALUES('pending','now','{}')");
  for (const origin of ['curated','observed','imported','recovered']) db.prepare('INSERT INTO EntityAlias(guid,entityGuid,alias,aliasKey,origin) VALUES(?,?,?,?,?)').run(origin,'e','Edgar','edgar',origin);
  clearDerived(db);
  assert.deepEqual(db.prepare('SELECT origin FROM EntityAlias ORDER BY origin').all(),[{origin:'curated'},{origin:'imported'}]);
  for (const [table,n] of [['Entity',2],['Relationship',1],['Actor',1],['PendingAuditMutation',1],['Resource',0],['Block',0],['StandoffProperty',0]]) assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n,n,table);
  assert.ok(verifyDatabase(db,'mutable').ok);
});

test('representative query plans have indexed access in both directions and for ranges', t => {
  const db=current(t);
  for (const sql of ["SELECT guid FROM Entity WHERE nameKey='poe'", "SELECT entityGuid FROM EntityAlias WHERE aliasKey='poe'", "SELECT guid FROM Relationship WHERE sourceEntityGuid='e' AND typename='knows'", "SELECT guid FROM Relationship WHERE targetEntityGuid='e' AND typename='knows'", "SELECT guid FROM StandoffProperty WHERE targetEntityGuid='e'", "SELECT guid FROM StandoffProperty WHERE sourceBlockGuid='b' AND startIndex<10 AND endIndex>5", "SELECT guid FROM BlockRelation WHERE targetBlockGuid='b'"]) {
    const plan=db.prepare('EXPLAIN QUERY PLAN '+sql).all().map(r=>r.detail).join(' ');
    assert.match(plan,/SEARCH .*USING (COVERING )?INDEX/,sql);
  }
});

test('audit constraints and rollback are isolated from current state', t => {
  const db=current(t), audit=new Database(':memory:'); t.after(()=>audit.close());
  migrate(audit,'audit',{fresh:true,vaultGuid:validateSchema(db,'mutable').vaultGuid});
  audit.exec("INSERT INTO AuditMutation(guid,timestampUtc) VALUES('m','now'); INSERT INTO AuditEvent(guid,mutationGuid,operation,recordType,recordGuid,timestampUtc,afterJson) VALUES('event','m','update','Entity','not-present','now','{}')");
  assert.throws(()=>audit.exec("UPDATE AuditEvent SET mutationGuid='missing'"),/FOREIGN KEY/);
  assert.throws(()=>audit.exec("UPDATE AuditEvent SET afterJson='bad-json'"),/CHECK/);
  assert.throws(audit.transaction(()=>{audit.exec("DELETE FROM AuditMutation"); throw Error('rollback');}),/rollback/);
  assert.equal(audit.prepare('SELECT count(*) n FROM AuditEvent').get().n,1);
  assert.ok(verifyDatabase(audit,'audit').ok); assert.ok(verifyDatabase(db,'mutable').ok);
});
