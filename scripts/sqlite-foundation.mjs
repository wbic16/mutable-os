import { parseArgs } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openSqliteFoundation } from '../src/knowledge-sqlite/client.mjs';
import { regularFile } from '../src/knowledge-sqlite/paths.mjs';
import { flockExclusiveSync } from '../src/knowledge-sqlite/advisory-lock.mjs';
import { createHash } from 'node:crypto';

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
    const root = fs.realpathSync(vault);
    if (fs.lstatSync(vault).isSymbolicLink() || path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith('mutable-sqlite-p1-test-')) throw Error('Reset is restricted to init-test temporary directories');
    regularFile(path.join(root, marker));
    // Phext-only fixture shape: the marker, the Cavern phext (+ its
    // .bak generation) and per-lock flock anchors. Anything else —
    // including a legacy .mutable home — is not this fixture.
    const allowed = n => n === marker || n === 'cavern.phext' || n === 'cavern.phext.bak' || /^cavern\.phext\.anchor-[0-9a-f]{16}$/.test(n);
    if (fs.readFileSync(path.join(root, marker), 'utf8') !== 'mutable-sqlite-p1-disposable-v1\n' || fs.readdirSync(root).some(n => !allowed(n))) throw Error('Not a disposable foundation-only fixture');
    // Take the knowledge writer lease (the flock anchor for the
    // phext's writer lock) so a live writer cannot race the reset.
    const anchor = path.join(root, `cavern.phext.anchor-${createHash('sha256').update('/.mutable/writer.lock').digest('hex').slice(0, 16)}`);
    const fd = fs.openSync(anchor, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW, 0o600);
    let releaseLock;
    try {
      releaseLock = flockExclusiveSync(fd, `${anchor}.holder`);
      for (const name of ['cavern.phext', 'cavern.phext.bak']) {
        const candidate = path.join(root, name);
        if (fs.existsSync(candidate)) { regularFile(candidate); fs.unlinkSync(candidate); }
      }
    } finally { try { releaseLock?.(); } finally { fs.closeSync(fd); } }
    // Anchors stay: they are mechanism files, created once and never
    // unlinked, exactly as in production. The open below re-creates
    // a fresh phext; normal init never repairs partial infrastructure.
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
