import { parseArgs } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openSqliteFoundation } from '../src/knowledge-sqlite/client.mjs';
import { writerLock, regularFile } from '../src/knowledge-sqlite/paths.mjs';

const marker = '.sqlite-foundation-disposable';
let client;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    vault: { type: 'string' }, destination: { type: 'string' }, source: { type: 'string' },
    'read-only': { type: 'boolean' }, 'confirm-derived-reset': { type: 'boolean' }, incremental: { type: 'boolean' },
  } });
  const [command] = positionals;
  if (positionals.length !== 1 || !['init','init-test','inspect','verify','rebuild-fts','clear-derived','backup','restore','reset-test','reconcile','rebuild-derived'].includes(command)) throw Error('Usage: npm run sqlite -- <init|init-test|inspect|verify|rebuild-fts|clear-derived|reconcile|rebuild-derived|backup|restore|reset-test> --vault /absolute/path');
  if (values['read-only'] && ['init','init-test','reset-test','restore','rebuild-fts','clear-derived','reconcile','rebuild-derived'].includes(command)) throw Error('Read-only mode cannot perform this operation');
  let vault = values.vault;
  if (command === 'init-test') {
    if (vault) throw Error('init-test chooses its own disposable temp directory');
    vault = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'mutable-sqlite-p1-test-'));
    fs.writeFileSync(path.join(vault, marker), 'mutable-sqlite-p1-disposable-v1\n', { flag: 'wx', mode: 0o600 });
  }
  if (!vault || !path.isAbsolute(vault)) throw Error('An explicit absolute --vault is required');
  if (command === 'restore' && (!values.source || !path.isAbsolute(values.source))) throw Error('restore requires --source /snapshot/directory');
  if (command === 'restore' && values['read-only']) throw Error('Read-only mode cannot restore databases');
  if (command === 'reset-test') {
    if (values['read-only']) throw Error('Cannot reset in read-only mode');
    const root = fs.realpathSync(vault), home = path.join(root, '.mutable');
    if (fs.lstatSync(vault).isSymbolicLink() || path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith('mutable-sqlite-p1-test-')) throw Error('Reset is restricted to init-test temporary directories');
    regularFile(path.join(root, marker));
    if (fs.readFileSync(path.join(root, marker), 'utf8') !== 'mutable-sqlite-p1-disposable-v1\n' || fs.readdirSync(root).some(n => ![marker,'.mutable'].includes(n))) throw Error('Not a disposable foundation-only fixture');
    if (fs.lstatSync(home).isSymbolicLink()) throw Error('Refuse symlink database directory');
    const unlock = writerLock(home);
    try {
      const names = fs.readdirSync(home);
      if (names.some(n => !/^(writer\.lock(\.holder)?|(mutable|audit)\.db(-wal|-shm|-journal)?)$/.test(n))) throw Error('Unexpected file in disposable store');
      for (const name of names) regularFile(path.join(home,name));
      for (const name of names) if (name !== 'writer.lock' && name !== 'writer.lock.holder') fs.unlinkSync(path.join(home,name));
    } finally { unlock(); }
    // Explicit disposable-only reset removes the empty test home; normal init never repairs partial infrastructure.
    fs.rmSync(path.join(home,'writer.lock.holder'),{force:true});fs.unlinkSync(path.join(home,'writer.lock'));fs.rmdirSync(home);
  }
  client = await openSqliteFoundation({ vault, initialize: ['init','init-test','reset-test'].includes(command),
    readOnly: !!values['read-only'] || command === 'inspect', ...(command === 'restore' ? { restoreFrom: values.source } : {}) });
  let result;
  switch (command) {
    case 'reconcile': case 'rebuild-derived': {
      const {createSavedIndexer}=await import('../dist/server/sqlite-saved-indexer.js');
      result=await createSavedIndexer(client,{root:vault}).refresh({mode:command==='reconcile'&&values.incremental?'incremental':'full'});
      if(!result.complete)process.exitCode=1;break;
    }
    case 'verify': result = await client.verify(); if (!result.ok || result.audit?.ok === false) process.exitCode = 1; break;
    case 'rebuild-fts': result = await client.rebuildFts(); break;
    case 'clear-derived': if (!values['confirm-derived-reset']) throw Error('clear-derived requires --confirm-derived-reset; it does not repopulate from files'); result = await client.clearDerived(); break;
    case 'backup': result = await client.backup(values.destination); break;
    case 'restore': if (!values.source) throw Error('restore requires --source /snapshot/directory'); result = { restored: true, filesIncluded: false, reconciliationRequired: true, ...(await client.inspect()) }; break;
    default: result = await client.inspect();
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await client?.close(); }
