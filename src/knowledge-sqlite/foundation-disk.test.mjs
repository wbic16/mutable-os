import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import Database from 'better-sqlite3';
import { openSqliteFoundation } from './client.mjs';
import { openFoundation, restoreSnapshot } from './foundation.mjs';
import { hash } from './schema.mjs';

function fixture(t) { const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'sqlite-p1-gate-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true})); const vault=path.join(root,'vault'); fs.mkdirSync(vault); return {root,vault,home:path.join(vault,'.mutable')}; }
function init(vault) { const store=openFoundation({vault,initialize:true}); const info=store.inspect(); store.close(); return info; }
function seed(home) {
  const db=new Database(path.join(home,'mutable.db')); db.pragma('foreign_keys=ON');
  try { db.exec(`INSERT INTO Entity(guid,name,nameKey) VALUES('e','Edgar Allan Poe','edgar allan poe'),('raven','Raven','raven');
    INSERT INTO EntityAlias(guid,entityGuid,alias,aliasKey,origin) VALUES('alias','e','E. A. Poe','e. a. poe','curated'),('import','e','Poet','poet','imported');
    INSERT INTO Relationship(guid,sourceEntityGuid,typename,targetEntityGuid) VALUES('relation','e','wrote','raven');
    INSERT INTO Actor(guid,typename,name) VALUES('actor','Human','Writer');
    INSERT INTO PendingAuditMutation VALUES('pending','now','{}');
    INSERT INTO Resource(guid,path,typename,format,rootBlockGuid,contentHash,indexedUtc,extractionProfile,indexStatus) VALUES('resource','poe.mutable.json','document-block','mutable-document','b','hash','now','p1','complete');
    INSERT INTO Block(guid,resourceGuid,typename,authoredType) VALUES('b','resource','text-block','text-block');
    INSERT INTO BlockTextRun(blockGuid,ordinal,text) VALUES('b',0,'The raven nevermore');`); }
  finally { db.close(); }
  const audit=new Database(path.join(home,'audit.db'));
  try { audit.exec("INSERT INTO AuditMutation(guid,timestampUtc) VALUES('mutation','now'); INSERT INTO AuditEvent(guid,mutationGuid,operation,recordType,recordGuid,timestampUtc) VALUES('event','mutation','create','Entity','e','now')"); } finally { audit.close(); }
}

test('worker init, bounded queue, graceful shutdown, restart and explicit read-only mode', async t => {
  const {vault}=fixture(t); let client=await openSqliteFoundation({vault,initialize:true});
  try {
    const info=await client.inspect(); assert.equal(info.mutable.vaultGuid,info.audit.vaultGuid);
    assert.deepEqual({...info.mutable.pragmas},{foreign_keys:1,journal_mode:'wal',synchronous:2,busy_timeout:1000,user_version:10,application_id:0x4d55544b});
    const work=Array.from({length:32},()=>client.inspect());
    await assert.rejects(client.inspect(),/queue is full/); assert.equal((await Promise.all(work)).length,32);
    assert.equal((await client.verify()).mutable.fts,'ok');
    await client.close(); await assert.rejects(client.inspect(),/closed/);
    client=await openSqliteFoundation({vault,readOnly:true});
    assert.equal((await client.inspect()).mutable.vaultGuid,info.mutable.vaultGuid);
    await assert.rejects(client.clearDerived(),/read-only/); await assert.rejects(client.rebuildFts(),/read-only/);
    assert.equal((await client.verify()).mutable.fts,'not-checked-read-only');
  } finally { await client.close(); }
});

test('one writer, simultaneous read-only inspection, worker termination releases lock', async t => {
  const {vault}=fixture(t); const first=await openSqliteFoundation({vault,initialize:true});
  try {
    await assert.rejects(openSqliteFoundation({vault}),/writer unavailable/);
    const reader=await openSqliteFoundation({vault,readOnly:true});
    try { assert.equal((await reader.inspect()).mutable.version,10); } finally { await reader.close(); }
    await first.terminate();
    const next=await openSqliteFoundation({vault}); try { assert.ok((await next.verify()).ok); } finally { await next.close(); }
  } finally { await first.close(); }
});

test('worker timeout fails explicitly and recreation is possible without automatic replay', async t => {
  const {vault}=fixture(t); init(vault);
  await assert.rejects(openSqliteFoundation({vault,timeoutMs:1}),/timed out/);
  const client=await openSqliteFoundation({vault}); try { assert.ok((await client.verify()).ok); } finally { await client.close(); }
});

test('independent vault workers retain distinct identities and release their own leases', async t => {
  const a=fixture(t), b=fixture(t);
  const [first,second]=await Promise.all([openSqliteFoundation({vault:a.vault,initialize:true}),openSqliteFoundation({vault:b.vault,initialize:true})]);
  try { assert.notEqual((await first.inspect()).mutable.vaultGuid,(await second.inspect()).mutable.vaultGuid); await first.terminate(); assert.ok((await second.verify()).ok); }
  finally {await first.close(); await second.close();}
});

test('bounded busy failure leaves canonical/derived rows intact and permits explicit retry', async t => {
  const {vault,home}=fixture(t); init(vault); seed(home);
  const client=await openSqliteFoundation({vault}), competing=new Database(path.join(home,'mutable.db'));
  try {
    competing.exec('BEGIN IMMEDIATE');
    await assert.rejects(client.clearDerived(),/locked/);
    assert.equal((await client.inspect()).mutable.counts.Block,1);
    competing.exec('ROLLBACK'); assert.equal((await client.clearDerived()).cleared,true);
    assert.equal((await client.inspect()).mutable.counts.Entity,2);
  } finally {competing.close(); await client.close();}
});

test('OS process death rolls back a transaction and WAL reopens with the committed state', async t => {
  const {vault,home}=fixture(t); init(vault); seed(home);
  const child=spawn(process.execPath,['--input-type=module','-e',`import Database from 'better-sqlite3'; const db=new Database(process.argv[1]); db.pragma('foreign_keys=ON'); db.exec("BEGIN IMMEDIATE; UPDATE Entity SET name='uncommitted'; DELETE FROM EntityAlias"); console.log('transaction-open'); setInterval(()=>{},1000);`,path.join(home,'mutable.db')],{cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill('SIGKILL'));
  await Promise.race([once(child.stdout,'data'), once(child,'exit').then(([code])=>{throw Error(`child failed: ${code}`);})]);
  const exited=once(child,'exit'); child.kill('SIGKILL'); await exited;
  const client=await openSqliteFoundation({vault});
  try { assert.ok((await client.verify()).ok); assert.equal((await client.inspect()).mutable.counts.EntityAlias,2); }
  finally { await client.close(); }
  const db=new Database(path.join(home,'mutable.db'),{readonly:true});
  try { assert.equal(db.prepare("SELECT name FROM Entity WHERE guid='e'").get().name,'Edgar Allan Poe'); } finally {db.close();}
});

for (const fault of ['missing','corrupt','wrong-vault','future-version']) test(`audit ${fault} does not prevent current knowledge reads`, async t => {
  const {vault,home}=fixture(t); init(vault); seed(home); const file=path.join(home,'audit.db');
  if (fault==='missing') fs.unlinkSync(file);
  if (fault==='corrupt') fs.writeFileSync(file,'not a database');
  if (fault==='wrong-vault' || fault==='future-version') {
    const db=new Database(file); try { db.exec(fault==='wrong-vault' ? "UPDATE SchemaInfo SET value='11111111-1111-4111-8111-111111111111' WHERE key='vaultGuid'" : "PRAGMA user_version=99; UPDATE SchemaInfo SET value='99' WHERE key='schemaVersion'"); } finally {db.close();}
  }
  const before=fs.existsSync(file)?hash(fs.readFileSync(file)):undefined;
  const client=await openSqliteFoundation({vault});
  try { const info=await client.inspect(); assert.equal(info.audit.available,false); assert.ok(info.audit.error); assert.equal(info.mutable.counts.Entity,2); assert.ok((await client.verify()).ok); }
  finally {await client.close();}
  assert.equal(fs.existsSync(file)?hash(fs.readFileSync(file)):undefined,before);
});

for (const fault of ['corrupt','future-version','schema-drift']) test(`current ${fault} is rejected, never reset`, async t => {
  const {vault,home}=fixture(t); init(vault); const file=path.join(home,'mutable.db');
  if (fault==='corrupt') fs.writeFileSync(file,'canonical knowledge must not be discarded');
  else { const db=new Database(file); try { db.exec(fault==='future-version' ? "UPDATE SchemaInfo SET value='99' WHERE key='schemaVersion'; PRAGMA user_version=99" : 'DROP INDEX IX_Entity_Name'); } finally {db.close();} }
  const before=fs.readFileSync(file);
  await assert.rejects(openSqliteFoundation({vault,initialize:true})); assert.deepEqual(fs.readFileSync(file),before);
});

test('missing current database next to audit is not recreated, even by init', async t => {
  const {vault,home}=fixture(t); init(vault); fs.unlinkSync(path.join(home,'mutable.db'));
  await assert.rejects(openSqliteFoundation({vault,initialize:true}),/restore current knowledge/);
  assert.equal(fs.existsSync(path.join(home,'mutable.db')),false);
});

test('initialization is explicit and read-only cannot initialize or restore', async t => {
  const {vault,root}=fixture(t);
  await assert.rejects(openSqliteFoundation({vault})); assert.equal(fs.existsSync(path.join(vault,'.mutable')),false);
  await assert.rejects(openSqliteFoundation({vault,initialize:true,readOnly:true}),/Read-only/);
  await assert.rejects(openSqliteFoundation({vault,restoreFrom:root,readOnly:true}),/Read-only/);
  assert.throws(()=>restoreSnapshot(root,'relative-vault'),/absolute/);
  assert.deepEqual(fs.readdirSync(vault),[]);
});

for (const entry of ['home','mutable.db','mutable.db-wal','writer.lock']) test(`rejects symlink ${entry} before SQLite touches it`, async t => {
  const {vault,home,root}=fixture(t); init(vault);
  const outside=path.join(root,'outside'); fs.writeFileSync(outside,'untouched');
  if(entry==='home') { fs.renameSync(home,path.join(root,'original')); fs.symlinkSync(path.join(root,'original'),home); }
  else {const target=path.join(home,entry); fs.rmSync(target,{force:true}); fs.symlinkSync(outside,target);}
  await assert.rejects(openSqliteFoundation({vault}),/real directory|regular file/);
  assert.equal(fs.readFileSync(outside,'utf8'),'untouched');
});

test('rejects hard-linked canonical databases', async t => {
  const {vault,home,root}=fixture(t); init(vault); fs.linkSync(path.join(home,'mutable.db'),path.join(root,'linked'));
  await assert.rejects(openSqliteFoundation({vault}),/private regular/);
});

test('WAL-aware online backup restores current knowledge, independent audit and explicit stale derived rows', async t => {
  const {vault,root,home}=fixture(t); const original=init(vault); seed(home);
  const authoritativeFile=path.join(vault,'poe.mutable.json'); fs.writeFileSync(authoritativeFile,'authoritative placeholder');
  const client=await openSqliteFoundation({vault}); const snapshot=path.join(root,'backup');
  try {
    // Exercise SQLite backup while committed records remain in a live WAL.
    const direct=new Database(path.join(home,'mutable.db')); try { direct.exec("INSERT INTO Entity(guid,name,nameKey) VALUES('wal','WAL only','wal only')"); assert.ok(fs.statSync(path.join(home,'mutable.db-wal')).size>0);
      const backup=await client.backup(snapshot); assert.equal(backup.atomicAcrossDatabases,false); assert.equal(backup.scope,'database-only'); assert.equal(backup.auditAvailable,true);
    } finally {direct.close();}
    await assert.rejects(client.backup(snapshot),/EEXIST/);
    await assert.rejects(client.backup(path.join(home,'nested')),/outside/);
  } finally {await client.close();}
  const target=path.join(root,'restore'); fs.mkdirSync(target);
  const restored=await openSqliteFoundation({vault:target,restoreFrom:snapshot});
  try {
    const info=await restored.inspect(); assert.equal(info.mutable.vaultGuid,original.mutable.vaultGuid);
    for (const [table,n] of [['Entity',3],['EntityAlias',2],['Relationship',1],['Actor',1],['PendingAuditMutation',1],['Block',1]]) assert.equal(info.mutable.counts[table],n,table);
    assert.equal(info.audit.counts.AuditEvent,1); assert.equal((await restored.verify()).mutable.fts,'ok');
    const db=new Database(path.join(target,'.mutable','mutable.db'),{readonly:true});
    try { assert.equal(db.prepare('SELECT indexStatus FROM Resource').get().indexStatus,'stale'); assert.equal(db.prepare("SELECT name FROM Entity WHERE guid='e'").get().name,'Edgar Allan Poe'); } finally {db.close();}
    const clear=await restored.clearDerived(); assert.equal(clear.repopulated,false);
    assert.equal((await restored.inspect()).mutable.counts.EntityAlias,2);
  } finally {await restored.close();}
  assert.equal(fs.readFileSync(authoritativeFile,'utf8'),'authoritative placeholder');
  assert.equal(fs.existsSync(path.join(target,'poe.mutable.json')),false);
  assert.throws(()=>restoreSnapshot(snapshot,target),/empty destination/);
});

test('restore rejects corrupted snapshot bytes before publication', async t => {
  const {vault,root}=fixture(t); init(vault); const client=await openSqliteFoundation({vault}); const snapshot=path.join(root,'backup');
  try {await client.backup(snapshot);} finally {await client.close();}
  fs.appendFileSync(path.join(snapshot,'mutable.db'),'altered'); const target=path.join(root,'restore'); fs.mkdirSync(target);
  assert.throws(()=>restoreSnapshot(snapshot,target),/hash mismatch/); assert.deepEqual(fs.readdirSync(target),[]);
});

test('backup remains available without audit and does not invent missing history on restore', async t => {
  const {vault,root,home}=fixture(t); init(vault); seed(home); fs.unlinkSync(path.join(home,'audit.db'));
  const client=await openSqliteFoundation({vault}); const snapshot=path.join(root,'backup');
  try { assert.equal((await client.backup(snapshot)).auditAvailable,false); } finally { await client.close(); }
  const target=path.join(root,'restore'); fs.mkdirSync(target); restoreSnapshot(snapshot,target);
  const restored=await openSqliteFoundation({vault:target});
  try {const info=await restored.inspect(); assert.equal(info.mutable.counts.Entity,2); assert.equal(info.audit.available,false);} finally {await restored.close();}
});

test('CLI disposable reset is guarded against user files, ordinary vaults and active writers', async t => {
  const cli=(...args)=>spawnSync(process.execPath,['scripts/sqlite-foundation.mjs',...args],{encoding:'utf8'});
  const created=cli('init-test'); assert.equal(created.status,0,created.stderr); const vault=JSON.parse(created.stdout).root;
  t.after(()=>fs.rmSync(vault,{recursive:true,force:true}));
  const old=JSON.parse(created.stdout).mutable.vaultGuid;
  const reset=cli('reset-test','--vault',vault); assert.equal(reset.status,0,reset.stderr); assert.notEqual(JSON.parse(reset.stdout).mutable.vaultGuid,old);
  const writer=await openSqliteFoundation({vault});
  try {assert.notEqual(cli('reset-test','--vault',vault).status,0);} finally {await writer.close();}
  fs.writeFileSync(path.join(vault,'user.json'),'preserve');
  assert.notEqual(cli('reset-test','--vault',vault).status,0); assert.equal(fs.readFileSync(path.join(vault,'user.json'),'utf8'),'preserve');
  const {vault:ordinary}=fixture(t); init(ordinary); assert.notEqual(cli('reset-test','--vault',ordinary).status,0);
  const rejected=cli('clear-derived','--vault',ordinary); assert.notEqual(rejected.status,0); assert.match(rejected.stderr,/confirm-derived-reset/);
  const inspect=cli('inspect','--vault',ordinary); assert.equal(inspect.status,0); assert.equal(JSON.parse(inspect.stdout).readOnly,true);
  assert.notEqual(cli('restore','--vault',ordinary).status,0);
});
