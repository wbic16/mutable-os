import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { openSqliteFoundation } from './client.mjs';
import { restoreSnapshot } from './foundation.mjs';
import { hash } from './schema.mjs';
import { testCavern } from './phext-test-cavern.mjs';

/**
 * Phext-only contract (cutover): canonical knowledge lives in
 * cavern.phext; SQLite is the worker's ephemeral replica. Fixtures
 * seed and damage the phext itself (through the client API and the
 * knowledge store's strata), never database files.
 */
function fixture(t) { const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'sqlite-p1-gate-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true})); const vault=path.join(root,'vault'); fs.mkdirSync(vault); const cavern=testCavern(vault); t.after(()=>cavern.close()); return {root,vault,cavern,phext:path.join(vault,'cavern.phext')}; }
async function init(vault) { const client=await openSqliteFoundation({vault,initialize:true}); const info=await client.inspect(); await client.close(); return info; }
async function seed(client) {
  const ids={e:randomUUID(),raven:randomUUID()};
  await client.entities({op:'create',id:ids.e,operationId:randomUUID(),name:'Edgar Allan Poe'});
  await client.entities({op:'create',id:ids.raven,operationId:randomUUID(),name:'Raven'});
  await client.entities({op:'alias-add',id:randomUUID(),entityId:ids.e,operationId:randomUUID(),name:'E. A. Poe'});
  await client.entities({op:'alias-add',id:randomUUID(),entityId:ids.e,operationId:randomUUID(),name:'Poet'});
  await client.entities({op:'relationship-create',id:randomUUID(),source:ids.e,target:ids.raven,operationId:randomUUID(),type:'wrote'});
  const doc={id:'resource-root',type:'main-list-block',metadata:{documentId:'resource'},children:[{id:'b',type:'text-block',text:'The raven nevermore'}]};
  const bytes=Buffer.from(JSON.stringify(doc));
  const staged=await client.stageSaved({bytes,vaultGuid:(await client.inspect()).mutable.vaultGuid,evidence:{path:'poe.mutable.json',contentHash:hash(bytes)},mode:'full'});
  await client.commitSaved(staged.token);
  return ids;
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
    assert.equal((await client.verify()).mutable.fts,'ok'); // the ephemeral replica is fully built and checked even for read-only opens; only the phext is read-only
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
  const {vault}=fixture(t); await init(vault);
  await assert.rejects(openSqliteFoundation({vault,timeoutMs:1}),/timed out/);
  const client=await openSqliteFoundation({vault}); try { assert.ok((await client.verify()).ok); } finally { await client.close(); }
});

test('independent vault workers retain distinct identities and release their own leases', async t => {
  const a=fixture(t), b=fixture(t);
  const [first,second]=await Promise.all([openSqliteFoundation({vault:a.vault,initialize:true}),openSqliteFoundation({vault:b.vault,initialize:true})]);
  try { assert.notEqual((await first.inspect()).mutable.vaultGuid,(await second.inspect()).mutable.vaultGuid); await first.terminate(); assert.ok((await second.verify()).ok); }
  finally {await first.close(); await second.close();}
});

test('clearDerived invalidates derived rows and never canonical knowledge', async t => {
  const {vault}=fixture(t); await init(vault);
  const client=await openSqliteFoundation({vault});
  try {
    const ids=await seed(client);
    assert.equal((await client.inspect()).mutable.counts.Resource,1);
    const cleared=await client.clearDerived(); assert.equal(cleared.cleared,true); assert.equal(cleared.repopulated,false);
    const info=await client.inspect();
    assert.equal(info.mutable.counts.Entity,2); assert.equal(info.mutable.counts.EntityAlias,2); assert.equal(info.mutable.counts.Relationship,1);
    assert.equal(info.mutable.counts.Resource,0);
    assert.equal((await client.entities({op:'get',id:ids.e})).entity.name,'Edgar Allan Poe');
  } finally { await client.close(); }
});

test('OS process death leaves the last committed phext generation intact', async t => {
  const f=fixture(t); const {vault}=f; await init(vault);
  const clientUrl=new URL('./client.mjs',import.meta.url).href;
  // A real file, not -e: worker threads inherit --input-type and
  // then refuse their file entry.
  const script=`import {openSqliteFoundation} from '${clientUrl}'; const c=await openSqliteFoundation({vault:process.argv[2]}); const {randomUUID}=await import('node:crypto');
    const e='11111111-1111-4111-8111-111111111111';
    await c.entities({op:'create',id:e,operationId:randomUUID(),name:'Edgar Allan Poe'});
    await c.entities({op:'alias-add',id:randomUUID(),entityId:e,operationId:randomUUID(),name:'E. A. Poe'});
    await c.entities({op:'alias-add',id:randomUUID(),entityId:e,operationId:randomUUID(),name:'Poet'});
    console.log('committed');
    for(let i=0;;i++) await c.entities({op:'create',id:randomUUID(),operationId:randomUUID(),name:'Churn '+i});`;
  const runner=path.join(f.root,'death-child.mjs'); fs.writeFileSync(runner,script);
  const child=spawn(process.execPath,[runner,vault],{cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill('SIGKILL'));
  await Promise.race([once(child.stdout,'data'), once(child,'exit').then(([code])=>{throw Error(`child failed: ${code}`);})]);
  const exited=once(child,'exit'); child.kill('SIGKILL'); await exited;
  const client=await openSqliteFoundation({vault});
  try { assert.ok((await client.verify()).ok); const got=await client.entities({op:'get',id:'11111111-1111-4111-8111-111111111111'}); assert.equal(got.entity.name,'Edgar Allan Poe'); assert.equal(got.entity.aliases.length,2); }
  finally { await client.close(); }
});

test('corrupt audit does not prevent current knowledge reads and is never silently repaired', async t => {
  const f=fixture(t); await init(f.vault);
  const client=await openSqliteFoundation({vault:f.vault});
  const ids=await seed(client); const delivered=await client.deliverAudit({}); assert.ok(delivered.delivered>0);
  await client.close();
  // Damage one delivered audit entry inside the phext.
  const {PhextKnowledgeStore}=await import('./phext-store.mjs'); const {PhextVFS}=await import('../../dist/src/phext/vfs.js');
  const vfs=PhextVFS.open(f.phext); const store=new PhextKnowledgeStore(vfs); const entries=store.listAudit(); assert.ok(entries.length);
  const target=store.auditPath(entries[0].guid); const held=vfs.readTextFile(target);
  vfs.writeFile(target,'not json'); vfs.flush();
  const reopened=await openSqliteFoundation({vault:f.vault});
  try { const info=await reopened.inspect(); assert.equal(info.audit.available,false); assert.ok(info.audit.error); assert.equal(info.mutable.counts.Entity,2); assert.equal((await reopened.entities({op:'get',id:ids.e})).entity.name,'Edgar Allan Poe'); }
  finally {await reopened.close();}
  assert.equal(PhextVFS.open(f.phext).readTextFile(target),'not json');
  assert.notEqual(held,'not json');
});

for (const fault of ['record','control']) test(`corrupt phext ${fault} is rejected, never reset`, async t => {
  const f=fixture(t); await init(f.vault);
  const client=await openSqliteFoundation({vault:f.vault}); await seed(client); await client.close();
  if (fault==='record') {
    const {PhextKnowledgeStore}=await import('./phext-store.mjs'); const {PhextVFS}=await import('../../dist/src/phext/vfs.js');
    const vfs=PhextVFS.open(f.phext); const store=new PhextKnowledgeStore(vfs); const [first]=store.listRecords('Entity');
    vfs.writeFile(store.recordPath('Entity',first.record.guid),'garbage'); vfs.flush();
  } else {
    f.cavern.vfs.writeFile('/.mutable/knowledge.json','garbage'); f.cavern.vfs.flush();
  }
  const before=fs.readFileSync(f.phext);
  await assert.rejects(openSqliteFoundation({vault:f.vault,initialize:true}));
  assert.deepEqual(fs.readFileSync(f.phext),before);
});

test('missing control beside knowledge records is refused, never manufactured', async t => {
  const f=fixture(t); await init(f.vault);
  const client=await openSqliteFoundation({vault:f.vault}); await seed(client); await client.close();
  const {PhextVFS}=await import('../../dist/src/phext/vfs.js'); const vfs=PhextVFS.open(f.phext);
  vfs.unlink('/.mutable/knowledge.json'); vfs.flush();
  await assert.rejects(openSqliteFoundation({vault:f.vault,initialize:true}),/control record is missing|restore current knowledge/);
  assert.equal(fs.existsSync(f.phext),true);
});

test('initialization is explicit and read-only cannot initialize or restore', async t => {
  // Bare vault: this test measures what refused opens create, so
  // the fixture must not pre-create a phext by registering one.
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'sqlite-p1-bare-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const vault=path.join(root,'vault'); fs.mkdirSync(vault);
  await assert.rejects(openSqliteFoundation({vault})); assert.equal(fs.existsSync(path.join(vault,'cavern.phext')),false);
  await assert.rejects(openSqliteFoundation({vault,initialize:true,readOnly:true}),/Read-only/);
  await assert.rejects(openSqliteFoundation({vault,restoreFrom:root,readOnly:true}),/Read-only/);
  assert.throws(()=>restoreSnapshot(root,'relative-vault'),/absolute/);
  assert.deepEqual(fs.readdirSync(vault),[]);
});

for (const entry of ['vault','phext','mutable-home']) test(`rejects symlink ${entry} before the phext is touched`, async t => {
  const f=fixture(t); await init(f.vault);
  const outside=path.join(f.root,'outside'); fs.writeFileSync(outside,'untouched');
  if (entry==='vault') { fs.renameSync(f.vault,path.join(f.root,'original')); fs.symlinkSync(path.join(f.root,'original'),f.vault); await assert.rejects(openSqliteFoundation({vault:f.vault}),/real directory/); }
  if (entry==='phext') { fs.renameSync(f.phext,path.join(f.root,'original.phext')); fs.symlinkSync(outside,f.phext); await assert.rejects(openSqliteFoundation({vault:f.vault}),/regular phext file|Symbolic link/); }
  if (entry==='mutable-home') { fs.symlinkSync(outside,path.join(f.vault,'.mutable')); await assert.rejects(openSqliteFoundation({vault:f.vault}),/real directory/); }
  assert.equal(fs.readFileSync(outside,'utf8'),'untouched');
});

test('rejects hard-linked Cavern phext', async t => {
  const f=fixture(t); await init(f.vault); fs.linkSync(f.phext,path.join(f.root,'linked'));
  await assert.rejects(openSqliteFoundation({vault:f.vault}),/private regular/);
});

test('online backup restores canonical knowledge and independent audit; derived projections are not carried', async t => {
  const f=fixture(t); const original=await init(f.vault);
  const client=await openSqliteFoundation({vault:f.vault}); const ids=await seed(client);
  f.cavern.writeFile('poe.mutable.json','authoritative placeholder');
  const snapshot=path.join(f.root,'backup');
  try {
    const backup=await client.backup(snapshot); assert.equal(backup.format,'mutable-sqlite-backup'); assert.ok(backup.files.mutable); assert.ok(backup.files.audit);
    assert.equal(backup.atomicAcrossDatabases,false); assert.equal(backup.scope,'database-only'); assert.equal(backup.auditAvailable,true);
    await assert.rejects(client.backup(snapshot),/EEXIST/);
    await assert.rejects(client.backup(path.join(f.vault,'nested')),/outside|inside/);
  } finally {await client.close();}
  const target=path.join(f.root,'restore'); fs.mkdirSync(target);
  const restored=await openSqliteFoundation({vault:target,restoreFrom:snapshot});
  try {
    const info=await restored.inspect(); assert.equal(info.mutable.vaultGuid,original.mutable.vaultGuid);
    for (const [table,n] of [['Entity',2],['EntityAlias',2],['Relationship',1]]) assert.equal(info.mutable.counts[table],n,table);
    assert.equal(info.audit.counts.AuditEvent,0); assert.equal((await restored.verify()).mutable.fts,'ok');
    // A database-only snapshot carries canonical knowledge only:
    // derived projections (Resource/Block rows) are not restored —
    // reconciliation repopulates them from the Cavern's documents.
    assert.deepEqual(await restored.inventory(),[]);
    assert.equal((await restored.entities({op:'get',id:ids.e})).entity.name,'Edgar Allan Poe');
    const clear=await restored.clearDerived(); assert.equal(clear.repopulated,false);
    assert.equal((await restored.inspect()).mutable.counts.EntityAlias,2);
  } finally {await restored.close();}
  assert.equal(f.cavern.readFile('poe.mutable.json'),'authoritative placeholder');
  assert.equal(fs.existsSync(path.join(target,'poe.mutable.json')),false);
  const targetCavern=testCavern(target); t.after(()=>targetCavern.close());
  assert.throws(()=>restoreSnapshot(snapshot,target,false,targetCavern.vfs),/already established/);
});

test('restore rejects corrupted snapshot bytes before publication', async t => {
  const f=fixture(t); await init(f.vault); const client=await openSqliteFoundation({vault:f.vault}); const snapshot=path.join(f.root,'backup');
  try {await client.backup(snapshot);} finally {await client.close();}
  fs.appendFileSync(path.join(snapshot,'mutable.db'),'altered'); const target=path.join(f.root,'restore'); fs.mkdirSync(target);
  assert.throws(()=>restoreSnapshot(snapshot,target),/hash mismatch/); assert.deepEqual(fs.readdirSync(target),[]);
});

test('backup remains available with an unavailable audit and restore carries canonical knowledge', async t => {
  const f=fixture(t); await init(f.vault);
  const client=await openSqliteFoundation({vault:f.vault}); const ids=await seed(client); await client.deliverAudit({}); await client.close();
  const {PhextKnowledgeStore}=await import('./phext-store.mjs'); const {PhextVFS}=await import('../../dist/src/phext/vfs.js');
  const vfs=PhextVFS.open(f.phext); const store=new PhextKnowledgeStore(vfs); const [entry]=store.listAudit(); vfs.writeFile(store.auditPath(entry.guid),'not json'); vfs.flush();
  const damaged=await openSqliteFoundation({vault:f.vault}); const snapshot=path.join(f.root,'backup');
  try { assert.equal((await damaged.inspect()).audit.available,false); const backup=await damaged.backup(snapshot); assert.equal(backup.files.audit,undefined); } finally { await damaged.close(); }
  const target=path.join(f.root,'restore'); fs.mkdirSync(target);
  const restored=await openSqliteFoundation({vault:target,restoreFrom:snapshot});
  try {const info=await restored.inspect(); assert.equal(info.mutable.counts.Entity,2); assert.equal((await restored.entities({op:'get',id:ids.e})).entity.name,'Edgar Allan Poe');} finally {await restored.close();}
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
  const {vault:ordinary}=fixture(t); await init(ordinary); assert.notEqual(cli('reset-test','--vault',ordinary).status,0);
  const rejected=cli('clear-derived','--vault',ordinary); assert.notEqual(rejected.status,0); assert.match(rejected.stderr,/confirm-derived-reset/);
  const inspect=cli('inspect','--vault',ordinary); assert.equal(inspect.status,0,inspect.stderr); assert.equal(JSON.parse(inspect.stdout).readOnly,true);
  assert.notEqual(cli('restore','--vault',ordinary).status,0);
});
