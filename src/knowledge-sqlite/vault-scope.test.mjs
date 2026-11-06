import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {openSqliteFoundation} from './client.mjs';
import {openFoundation,restoreSnapshot} from './foundation.mjs';
import {inspectVaultScope} from './vault-scope.mjs';
const fixture=t=>{const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mutable-vault-scope-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;};
const init=async vault=>{const c=await openSqliteFoundation({vault,initialize:true});try{return (await c.inspect()).mutable.vaultGuid;}finally{await c.close();}};
test('same root reopens with same identity and persistent overlap rejection outlives all leases',async t=>{
 const root=fixture(t),child=path.join(root,'research');fs.mkdirSync(child);
 const id=await init(root);assert.equal(await init(root),id);assert.ok(fs.existsSync(path.join(root,'cavern.phext')));
 await assert.rejects(init(child),/ancestor/);assert.equal(fs.existsSync(path.join(child,'cavern.phext')),false);
 assert.throws(()=>openFoundation({vault:child,initialize:true}),/ancestor/);
});
test('dormant child forbids parent and sibling vaults retain independent knowledge identities',async t=>{
 const root=fixture(t),a=path.join(root,'a'),b=path.join(root,'b');fs.mkdirSync(a);fs.mkdirSync(b);
 const id=await init(a);assert.notEqual(await init(b),id);await assert.rejects(init(root),/descendant/);assert.equal(fs.existsSync(path.join(root,'cavern.phext')),false);
});
test('incomplete, symlink, unconverted and conflicting existing topology fail closed',async t=>{
 const root=fixture(t);fs.mkdirSync(path.join(root,'a'));fs.mkdirSync(path.join(root,'a/b'));
 assert.throws(()=>inspectVaultScope(root,{maxEntries:1}),/incomplete/);
 fs.symlinkSync(path.join(root,'a'),path.join(root,'alias'));await assert.rejects(init(root),/incomplete.*symlink/);fs.unlinkSync(path.join(root,'alias'));
 // An empty .mutable documents home is not knowledge infrastructure
 // in the phext era and does not block establishment; a .mutable that
 // still carries a disk database is unconverted knowledge and the
 // foundation refuses it explicitly (conversion is the way in).
 fs.mkdirSync(path.join(root,'.mutable'));const id=await init(root);assert.ok(id);assert.ok(fs.existsSync(path.join(root,'cavern.phext')));
 fs.writeFileSync(path.join(root,'.mutable/mutable.db'),'not a database');await assert.rejects(init(root),/convert/);
 fs.rmSync(path.join(root,'.mutable'),{recursive:true,force:true});
 const other=fixture(t);fs.mkdirSync(path.join(other,'.mutable'));fs.symlinkSync('/elsewhere',path.join(other,'.mutable/mutable.db'));
 assert.throws(()=>inspectVaultScope(other),/invalid current database/);
 fs.copyFileSync(path.join(root,'cavern.phext'),path.join(root,'a/cavern.phext'));
 await assert.rejects(init(root),/descendant/);await assert.rejects(init(path.join(root,'a')),/ancestor/);
 assert.throws(()=>restoreSnapshot(path.join(root,'a'),path.join(root,'a/b')),/ancestor/);
});
test('cross-process concurrent parent/child establishment creates at most one persistence domain',async t=>{
 const root=fixture(t),child=path.join(root,'child');fs.mkdirSync(child);
 const script=`import {openSqliteFoundation} from '${new URL('./client.mjs',import.meta.url).href}';try{const c=await openSqliteFoundation({vault:process.argv[2],initialize:true});await c.close();}catch(e){console.error(e.message);process.exitCode=1;}`;
 const runner=path.join(root,'establish.mjs');fs.writeFileSync(runner,script);
 const run=vault=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,[runner,vault],{stdio:['ignore','ignore','pipe']});let errors='';p.stderr.on('data',b=>errors+=b);p.once('error',reject);p.once('exit',code=>resolve({code,errors}));});
 const results=await Promise.all([run(root),run(child)]);assert.equal(results.filter(r=>r.code===0).length,1,JSON.stringify(results));
 assert.equal([root,child].filter(r=>fs.existsSync(path.join(r,'cavern.phext'))).length,1);
});

test('ordinary paired-save archive volume can exceed 10,000 entries without hiding descendants',t=>{
 const root=fixture(t),archive=path.join(root,'.mutable-pair-volume');fs.mkdirSync(archive);
 for(let i=0;i<10001;i++)fs.writeFileSync(path.join(archive,String(i)), '');
 assert.ok(inspectVaultScope(root).entries>10000);
 assert.throws(()=>inspectVaultScope(root,{maxEntries:10000}),/scan budget/);
 fs.mkdirSync(path.join(archive,'.mutable'));assert.throws(()=>inspectVaultScope(root),/descendant/);
});
