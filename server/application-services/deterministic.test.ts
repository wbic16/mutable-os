// @vitest-environment node
import { afterEach, it, expect, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { testCavern } from '../../src/knowledge-sqlite/phext-test-cavern.mjs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { DeterministicService } from '../../src/application-services/deterministic-service';
import { CavernJobStorage } from './job-storage';
import { NodePreparationExecutor } from './executor';
import { ManagedAssetStore } from '../managed-assets.mjs';
import { migrate, clearDerived } from '../../src/knowledge-sqlite/schema.mjs';
import { canonicalLedger } from '../../src/knowledge-sqlite/canonical-ledger.mjs';
import { canonicalEntities } from '../../src/knowledge-sqlite/entities.mjs';
import { extractPackageData } from '../../src/knowledge-sqlite/package-data.mjs';
import { orcid, arxiv, alto } from '../../src/academic/fixtures';
vi.setConfig({ testTimeout: 30000 });
const cleanup: Array<() => any> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'academic-e-')),
    cavernId = randomUUID();
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const cavern = testCavern(root); cleanup.push(() => cavern.close());
  const db = new Database(':memory:'),
    audit = new Database(':memory:');
  migrate(db, 'mutable', { fresh: true, vaultGuid: cavernId });
  migrate(audit, 'audit', { fresh: true, vaultGuid: cavernId });
  const ledger = canonicalLedger(db, () => audit);
  cleanup.push(() => {
    db.close();
    audit.close();
  });
  const jobs = new CavernJobStorage(root, cavernId),
    executor = new NodePreparationExecutor(),
    assets = new ManagedAssetStore({
      root,
      cavernId,
      session: 'test',
      inspectOriginal: async () => {},
    });
  cleanup.push(async () => {
    await jobs.close();
    await executor.close();
    await assets.close();
  });
  let fetches = 0;
  const ports: any = {
    cavernId,
    jobs,
    executor,
    uuid: randomUUID,
    now: () => new Date().toISOString(),
    acquire: async (id: any) => {
      fetches++;
      return {
        bytes: new TextEncoder().encode(id.family === 'orcid' ? orcid : arxiv),
        endpoint: 'https://fixture.invalid/record',
      };
    },
    acquireXml: async () => ({
      bytes: new TextEncoder().encode(alto),
      endpoint: 'https://fixture.invalid/ocr.xml',
    }),
    retain: async (bytes: Uint8Array, mediaType: string) => {
      const lease = await assets.begin();
      const a = await assets.stage(lease, Buffer.from(bytes), { mediaType });
      await assets.publish(lease);
      await assets.finish(lease, 'test');
      return { kind: 'managed', cavernId, assetId: a.assetId };
    },
    read: async (a: any) => new Uint8Array((await assets.get(a.assetId, cavernId)).bytes),
    knowledge: async (r: any) => canonicalEntities(db, r, () => {}, ledger),
  };
  const service = new DeterministicService(ports);
  cleanup.push(() => service.close());
  return {
    db,
    audit,
    ledger,
    ports,
    service,
    jobs,
    assets,
    get fetches() {
      return fetches;
    },
  };
}
it('retains exact original through the real bounded worker and creates knowledge only after explicit idempotent review', async () => {
  const f = await fixture(),
    id = randomUUID(),
    r = await f.service.call('deterministic.import', { id, source: '0000-0002-1825-0097' });
  expect(r.capture.projection.person?.name).toBe('Jane Researcher');
  expect(new TextDecoder().decode(await f.ports.read(r.capture.asset))).toBe(orcid);
  expect(f.db.prepare('SELECT count(*) n FROM Entity').get().n).toBe(0);
  const request = {
    id,
    operationId: randomUUID(),
    name: 'Authored researcher name',
    note: 'Verified ORCID against the public record',
  };
  const accepted = await f.service.call('deterministic.review', request);
  expect(await f.service.call('deterministic.review', request)).toMatchObject({
    entityId: accepted.entityId,
    identityId: accepted.identityId,
    snapshotId: accepted.snapshotId,
  });
  expect(f.db.prepare('SELECT name FROM Entity WHERE guid=?').get(accepted.entityId).name).toBe(
    request.name
  );
  expect(f.db.prepare('SELECT count(*) n FROM Claim').get().n).toBe(0);
  await f.service.call('deterministic.review', {
    ...request,
    operationId: randomUUID(),
    name: 'Must not overwrite',
  });
  expect(f.db.prepare('SELECT name FROM Entity WHERE guid=?').get(accepted.entityId).name).toBe(
    request.name
  );
  clearDerived(f.db);
  expect(f.db.prepare('SELECT count(*) n FROM ExternalIdentity').get().n).toBe(1);
  const archived = extractPackageData(f.db, { entities: [accepted.entityId] });
  expect(archived.data.tables.find((t) => t.name === 'SourceSnapshot').rows.length).toBe(1);
  await expect(
    f.service.call('deterministic.review', {
      ...request,
      operationId: randomUUID(),
      targetId: randomUUID(),
      name: undefined,
    })
  ).rejects.toThrow(/no longer exists/);
});
it('recovers checkpointed originals without refetch after worker failure and pins returned arXiv version', async () => {
  const f = await fixture(),
    executor = f.ports.executor;
  let failed = false;
  f.ports.executor = {
    run: async (...args: any[]) => {
      if (!failed) {
        failed = true;
        throw Error('worker interrupted');
      }
      return executor.run(...args);
    },
  };
  const id = randomUUID();
  await expect(
    f.service.call('deterministic.import', { id, source: 'arxiv:2301.00001' })
  ).rejects.toThrow(/worker interrupted/);
  expect((await f.jobs.load(id)).summary.state).toBe('failed');
  const r = await f.service.call('deterministic.resume', { id });
  expect(r.capture.identity?.key).toBe('2301.00001v2');
  expect(f.fetches).toBe(1);
  expect(await f.service.call('deterministic.resume', { id })).toEqual(r);
  expect(f.fetches).toBe(1);
  await expect(
    f.service.call('deterministic.import', { id, source: 'arxiv:2302.00001' })
  ).rejects.toThrow(/different/);
});
it('cancels before publication, leaves canonical data untouched, and enforces operation authority', async () => {
  const f = await fixture(),
    controller = new AbortController(),
    id = randomUUID();
  f.ports.acquire = async () => {
    controller.abort();
    return { bytes: new TextEncoder().encode(orcid), endpoint: 'fixture' };
  };
  await expect(
    f.service.call('deterministic.import', { id, source: '0000-0002-1825-0097' }, controller.signal)
  ).rejects.toThrow();
  expect((await f.jobs.load(id)).summary.state).toBe('cancelled');
  expect(f.db.prepare('SELECT count(*) n FROM Entity').get().n).toBe(0);
  await expect(
    f.service.call('deterministic.import', { id: randomUUID(), source: 'file:///etc/passwd' })
  ).rejects.toThrow();
  await expect(
    f.service.call('deterministic.import', {
      id: randomUUID(),
      source: '0000-0002-1825-0097',
      path: '/etc/passwd',
    } as any)
  ).rejects.toThrow();
});
it('retains explicitly acquired OCR XML without enabling canonical review', async () => {
  const f = await fixture(),
    id = randomUUID(),
    r = await f.service.call('deterministic.xml', {
      id,
      source: 'https://fixture.invalid/alto.xml',
    });
  expect(r.capture.format).toBe('alto');
  expect(r.capture.identity).toBeUndefined();
  await expect(
    f.service.call('deterministic.review', {
      id,
      operationId: randomUUID(),
      name: 'Not an identity',
      note: 'Review',
    })
  ).rejects.toThrow(/Invalid academic review/);
});
