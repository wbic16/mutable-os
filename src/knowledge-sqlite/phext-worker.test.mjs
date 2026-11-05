/**
 * PhextVFS Phase 4 — the production path: knowledge through the real
 * worker (client.mjs → worker thread → bundled worker-entry), with
 * the phext as the only knowledge store on disk.
 *
 * Establishes, mutates, delivers audit, checks the writer-lease
 * contention error, verifies the ephemeral replica's lifecycle
 * (created in temp, deleted at close), then cold-reopens from the
 * phext alone. Snapshot restore is a CONVERSION into the phext
 * (cutover): a backup restored into a fresh Cavern lands as phext
 * knowledge; restoring over live knowledge is refused.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID as uuid } from 'node:crypto';
import { openSqliteFoundation } from './client.mjs';

test('phext knowledge through the production worker', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutable-phext-worker-'));
  const vault = path.join(dir, 'vault');
  fs.mkdirSync(vault);
  const phextPath = path.join(vault, 'cavern.phext');
  let client;
  t.after(async () => {
    await client?.close().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  });

  client = await openSqliteFoundation({ vault, initialize: true, phextKnowledge: phextPath });
  const id = uuid(), operationId = uuid();
  const created = await client.entities({ op: 'create', id, operationId, name: 'Worker Entity' });
  assert.equal(created.entity.name, 'Worker Entity');
  assert.equal((await client.auditStatus()).pending, 1);

  // A second writer is refused while the first holds the anchor lease.
  await assert.rejects(openSqliteFoundation({ vault, phextKnowledge: phextPath }), /writer unavailable/);

  assert.equal((await client.deliverAudit({})).delivered, 1);
  assert.equal((await client.operationOutcome(operationId)).delivery, 'delivered');
  assert.match(await client.knowledgeRevision(), /^\d+:\d+$/);
  assert.equal((await client.inspect()).mutable.counts.Entity, 1);

  // The replica lives in temp, never in the Cavern; the Cavern holds
  // only the phext, its backup generation and the lease anchors.
  const cache = await client.knowledgeCacheFile();
  assert.ok(cache && cache.includes('mutable-knowledge-'), cache);
  assert.equal(fs.existsSync(cache), true);
  assert.equal(fs.existsSync(path.join(vault, '.mutable')), false);
  for (const name of fs.readdirSync(vault)) {
    assert.ok(
      name === 'cavern.phext' || name === 'cavern.phext.bak' || name.startsWith('cavern.phext.anchor-'),
      `unexpected on-disk entry in a phext-mode Cavern: ${name}`,
    );
  }
  await client.close();
  assert.equal(fs.existsSync(cache), false, 'replica is deleted when the foundation closes');

  // Cold reopen from the phext alone.
  client = await openSqliteFoundation({ vault, phextKnowledge: phextPath });
  assert.equal((await client.entities({ op: 'get', id })).entity.name, 'Worker Entity');
  assert.equal((await client.operationOutcome(operationId)).status, 'committed');
  assert.equal((await client.auditStatus()).pending, 0);

  // Snapshot restore converts into a fresh Cavern's phext.
  const snapshot = await client.backup(path.join(dir, 'snapshot'));
  assert.ok(snapshot?.filesIncluded === false || snapshot !== undefined);
  await client.close();
  const restoredVault = path.join(dir, 'restored');
  fs.mkdirSync(restoredVault);
  const restored = await openSqliteFoundation({ vault: restoredVault, restoreFrom: path.join(dir, 'snapshot') });
  assert.equal((await restored.entities({ op: 'get', id })).entity.name, 'Worker Entity');
  assert.equal(fs.existsSync(path.join(restoredVault, '.mutable')), false);
  await restored.close();
  // Restoring over live knowledge is refused, never merged silently.
  await assert.rejects(
    openSqliteFoundation({ vault: restoredVault, restoreFrom: path.join(dir, 'snapshot') }),
    /already|requires an unconverted/,
  );
  client = undefined;
});
