// @vitest-environment node
/**
 * PhextVFS Phase 5 — the exit ramps, end to end.
 *
 * A disk-mode Cavern fixture with content in every stratum
 * (a native document + its pair journal + relocation record,
 * a history record, jobs + publications, a binary managed asset,
 * knowledge: entity + proposition + delivered/pending audit) is:
 *
 *   migrated → verification all-green, and (since mode selection)
 *   NON-destructively: the native tree stays in place byte-for-byte
 *   as the frozen snapshot, the migration record's onDisk names the
 *   whole tree, and the L7 record carries mode: "phext";
 *   → the snapshot .mutable is deleted and the Cavern is read back
 *     from the phext alone (documents, asset, knowledge dump);
 *   → downloaded raw + sealed (xz -t verifies; sidecar hash is
 *     the uncompressed phext's SHA-256);
 *   → the sealed file is opened into a fresh folder, established
 *     phext-mode, and the full state compares diff-equal;
 *   → exported back to a disk tree, diff-equal again, carrying the
 *     native mode record (§4.5).
 *
 * Refusals: already-migrated, no disk state, a corrupted source
 * database (abort leaves the disk Cavern untouched), a corrupt
 * seal, non-phext content, a knowledge-bearing phext missing its
 * control record, a non-empty target folder. And the lifecycle
 * transfer routes serve the per-Cavern mode world (the deleted
 * global flag stays deleted). Fixture note: the
 * disk-born knowledge pair is produced by seeding a phext Cavern
 * and exporting a snapshot, then laying the pair down as real
 * .mutable files — the disk format the migration consumes.
 */
import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID as uuid } from 'node:crypto';
import { PhextVFS } from '../src/phext/vfs';
import { openFoundation } from '../src/knowledge-sqlite/foundation.mjs';
import { PhextKnowledgeStore } from '../src/knowledge-sqlite/phext-store.mjs';
import { dumpDiskKnowledge, dumpPhextKnowledge } from '../src/knowledge-sqlite/phext-convert.mjs';
import {
  migrateCavernToPhext, exportPhextCavernToDisk, installPhextIntoFolder,
  sealPhext, unsealPhext, verifySeal,
} from './phext-cavern-transfer.mjs';
import { createCavernLifecycle } from './cavern-lifecycle';

const run = promisify(execFile);
const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const cleanups: Array<() => void> = [];
afterEach(() => { for (const f of cleanups.splice(0).reverse()) { try { f(); } catch { /* best effort */ } } });

function canon(value: any): any {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canon(value[k])]));
  }
  return value;
}

const ASSET_BYTES = Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 17 + 3) % 256));

function write(root: string, rel: string, content: string | Buffer) {
  const target = path.join(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

/** A disk-born Cavern with content in every stratum. */
async function diskCavern() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutable-phext-exit-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  const vault = path.join(dir, 'vault');
  fs.mkdirSync(vault);

  // Seed knowledge in a scratch phext Cavern, export the snapshot
  // pair, and lay it down as the vault's real .mutable home.
  const seedVault = path.join(dir, 'seed-vault');
  fs.mkdirSync(seedVault);
  const seedPhext = path.join(seedVault, 'cavern.phext');
  const seedVfs = PhextVFS.openOrCreate(seedPhext);
  cleanups.push(() => { try { seedVfs.close(); } catch { /* closed */ } });
  const store = openFoundation({ vault: seedVault, initialize: true }, { phextVfs: seedVfs, phextPath: seedPhext, scopeValidated: true });
  const entityOp = uuid(), propositionOp = uuid();
  const entity = store.entities({ op: 'create', id: uuid(), operationId: entityOp, name: 'Exit Entity', typename: 'Person' }).entity;
  const proposition = store.propositions({
    op: 'create', operationId: propositionOp, id: uuid(), blockId: uuid(),
    name: 'Exit claim', text: 'Round-trip knowledge', annotations: [],
  }).proposition;
  expect(store.deliverAudit({ limit: 1 }).delivered).toBe(1);
  const vaultGuid = store.vaultGuid;
  const exported = await store.backup(path.join(dir, 'disk-source'));
  store.close();
  fs.mkdirSync(path.join(vault, '.mutable'), { recursive: true });
  fs.copyFileSync(path.join(exported.directory, 'mutable.db'), path.join(vault, '.mutable', 'mutable.db'));
  fs.copyFileSync(path.join(exported.directory, 'audit.db'), path.join(vault, '.mutable', 'audit.db'));

  const native = fs.readFileSync('artifacts/flint-b1.2/rich.mutable.json');
  write(vault, 'notes/paper.mutable.json', native);
  write(vault, 'notes/paper.md', '# Paper\n');
  write(vault, 'notes/.mutable-pair-deadbeef/intent.json', JSON.stringify({ operationId: 'op-1', phase: 'intent' }));
  write(vault, 'notes/.mutable-pair-deadbeef/receipt.json', JSON.stringify({ operationId: 'op-1', phase: 'done' }));
  write(vault, '.mutable-relocations/relocations.json', JSON.stringify({ pending: [] }));
  write(vault, 'notes/.memory/record-1.json', JSON.stringify({ kind: 'history', text: 'remembered' }));
  write(vault, '.mutable/jobs/job-1.json', JSON.stringify({ job: 1 }));
  write(vault, '.mutable/publications/pub-1.json', JSON.stringify({ pub: 1 }));
  write(vault, '.mutable/assets/blob.bin', ASSET_BYTES);
  write(vault, 'legacy.json', JSON.stringify({ kind: 'legacy-document', text: 'old store' }));
  write(vault, 'uploads/up.bin', Buffer.from('uploaded bytes'));
  write(vault, '.mutable/document-saves/rec/record.json', JSON.stringify({ save: 1 }));

  const dump = dumpDiskKnowledge({
    mutableFile: path.join(vault, '.mutable', 'mutable.db'),
    auditFile: path.join(vault, '.mutable', 'audit.db'),
  });
  return { dir, vault, vaultGuid, entity, proposition, native, dump };
}

describe('Phase 5 exit ramps', () => {
  it('migrate → download (raw + sealed) → open sealed → export: full round trip diff-equal', { timeout: 180000 }, async () => {
    const f = await diskCavern();
    const report = await migrateCavernToPhext({ root: f.vault, openVfs: PhextVFS });
    expect(report.verified).toBe(true);
    expect(report.vaultGuid).toBe(f.vaultGuid);
    expect(report.knowledge.tables.Entity).toBeGreaterThanOrEqual(2);
    expect(report.knowledge.propositions).toBe(1);
    expect(report.smoke.knowledge.vaultGuid).toBe(f.vaultGuid);
    // Phase 3b: the legacy stores and uploads migrated too.
    // Mode selection: the migration is non-destructive — the
    // records name the ENTIRE native tree as remaining on disk
    // (the frozen snapshot), and no fallback is recorded.
    expect(report.fallback).toBe(null);
    expect(report.onDisk).toEqual(report.manifest.map((e: any) => e.path));
    expect(report.manifest.find((e: any) => e.path === 'uploads/up.bin')?.action).toBe('copy');
    expect(report.manifest.find((e: any) => e.path === '.mutable/document-saves/rec/record.json')?.action).toBe('copy');
    expect(report.smoke.documentSaves).toBe('.mutable/document-saves/rec/record.json');
    expect(report.smoke.upload).toBe('uploads/up.bin');
    // Snapshot discipline: .mutable stays in place byte-for-byte,
    // no fallback directory exists, the phext is published.
    expect(fs.existsSync(path.join(f.vault, '.mutable', 'mutable.db'))).toBe(true);
    expect(fs.readFileSync(path.join(f.vault, '.mutable', 'assets', 'blob.bin')).equals(ASSET_BYTES)).toBe(true);
    expect(fs.readFileSync(path.join(f.vault, 'notes', 'paper.mutable.json')).equals(f.native)).toBe(true);
    expect(fs.existsSync(path.join(f.vault, '.mutable-disk-fallback'))).toBe(false);
    const phextPath = path.join(f.vault, 'cavern.phext');
    expect(fs.existsSync(phextPath)).toBe(true);

    // The migration record lives in L7 and repeats the coverage.
    {
      const vfs = PhextVFS.open(phextPath);
      const record = JSON.parse(vfs.readTextFile('/.control/phext-migration.json'));
      expect(record.format).toBe('phext-cavern-migration');
      expect(record.sourceTreeSha256).toBe(report.sourceTreeSha256);
      expect(record.fallback).toBe(null);
      expect(record.onDisk).toEqual(report.onDisk);
      const strata = JSON.parse(vfs.readTextFile('/.control/phext-strata.json'));
      expect(strata.phextBacked.knowledge).toBe(3);
      expect(strata.phextBacked.legacyDocumentStores).toBe(1);
      expect(strata.phextBacked.uploads).toBe(1);
      expect(strata.onDisk).toEqual(report.onDisk);
      const state = JSON.parse(vfs.readTextFile('/.control/cavern-state.json'));
      expect(state.mode).toBe('phext');
      vfs.close();
    }

    // Delete the snapshot .mutable: the Cavern now stands on the phext alone.
    fs.rmSync(path.join(f.vault, '.mutable'), { recursive: true, force: true });
    {
      const vfs = PhextVFS.open(phextPath);
      expect(vfs.readFile('/notes/paper.mutable.json').equals(f.native)).toBe(true);
      expect(vfs.readFile('/.mutable/assets/blob.bin').equals(ASSET_BYTES)).toBe(true);
      expect(vfs.readFile('/uploads/up.bin').toString()).toBe('uploaded bytes');
      expect(JSON.parse(vfs.readTextFile('/.mutable/document-saves/rec/record.json'))).toEqual({ save: 1 });
      expect(JSON.parse(vfs.readTextFile('/notes/.memory/record-1.json')).text).toBe('remembered');
      const ks = new PhextKnowledgeStore(vfs);
      expect(canon(dumpPhextKnowledge(ks))).toEqual(canon(f.dump));
      vfs.close();
    }

    // Download: raw bytes + the seal. The seal verifies under xz -t
    // and unlocks byte-identically; the sidecar hash is the SHA-256
    // of the uncompressed phext.
    const raw = fs.readFileSync(phextPath);
    const sealed = await sealPhext(raw);
    const sealedPath = path.join(f.dir, 'cavern.phext.xz');
    fs.writeFileSync(sealedPath, sealed);
    await run('xz', ['-t', sealedPath]);
    expect(await verifySeal(sealed)).toBe(true);
    expect(sha256(raw)).toBe(sha256(await unsealPhext(sealed)));
    expect((await unsealPhext(sealed)).equals(raw)).toBe(true);

    // Open the sealed file into a fresh folder and establish.
    const received = path.join(f.dir, 'received');
    const installed = await installPhextIntoFolder({ bytes: sealed, filename: 'cavern.phext.xz', targetDir: received, openVfs: PhextVFS });
    expect(installed.sealed).toBe(true);
    expect(installed.vaultGuid).toBe(f.vaultGuid);
    const receivedPhext = path.join(received, 'cavern.phext');
    {
      const vfs = PhextVFS.open(receivedPhext);
      const foundation = openFoundation({ vault: received }, { phextVfs: vfs, phextPath: receivedPhext, scopeValidated: true });
      expect(foundation.vaultGuid).toBe(f.vaultGuid);
      expect(foundation.entities({ op: 'get', id: f.entity.id }).entity.name).toBe('Exit Entity');
      expect(foundation.propositions({ op: 'get', id: f.proposition.id }).proposition.text).toBe('Round-trip knowledge');
      foundation.close(); vfs.close();
    }

    // Export back to a complete disk tree: diff-equal again.
    const destination = path.join(f.dir, 'exported');
    const exported = await exportPhextCavernToDisk({ phextPath: receivedPhext, openVfs: PhextVFS, destination });
    expect(exported.verified).toBe(true);
    expect(fs.readFileSync(path.join(destination, 'notes', 'paper.mutable.json')).equals(f.native)).toBe(true);
    expect(fs.readFileSync(path.join(destination, '.mutable', 'assets', 'blob.bin')).equals(ASSET_BYTES)).toBe(true);
    // Phase 3b strata restore byte-identically too.
    expect(fs.readFileSync(path.join(destination, 'uploads', 'up.bin')).toString()).toBe('uploaded bytes');
    expect(JSON.parse(fs.readFileSync(path.join(destination, '.mutable', 'document-saves', 'rec', 'record.json'), 'utf8'))).toEqual({ save: 1 });
    expect(JSON.parse(fs.readFileSync(path.join(destination, 'legacy.json'), 'utf8'))).toEqual({ kind: 'legacy-document', text: 'old store' });
    const exportedDump = dumpDiskKnowledge({
      mutableFile: path.join(destination, '.mutable', 'mutable.db'),
      auditFile: path.join(destination, '.mutable', 'audit.db'),
    });
    expect(canon(exportedDump)).toEqual(canon(f.dump));
    // §4.5: the exported folder is a native Cavern by record, so
    // its first open needs no derivation.
    const exportedState = JSON.parse(fs.readFileSync(path.join(destination, '.mutable', 'cavern-state.json'), 'utf8'));
    expect(exportedState.mode).toBe('native');
    expect(exportedState.cavernGuid).toBe(f.vaultGuid);
  });

  it('migration refusals: already migrated, no disk state, corrupted source leaves disk untouched', { timeout: 120000 }, async () => {
    const f = await diskCavern();
    await migrateCavernToPhext({ root: f.vault, openVfs: PhextVFS });
    await expect(migrateCavernToPhext({ root: f.vault, openVfs: PhextVFS }))
      .rejects.toThrow(/already has a cavern\.phext/);

    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'mutable-phext-exit-empty-'));
    cleanups.push(() => fs.rmSync(empty, { recursive: true, force: true }));
    await expect(migrateCavernToPhext({ root: empty, openVfs: PhextVFS }))
      .rejects.toThrow(/no disk knowledge state/);

    const g = await diskCavern();
    const dbPath = path.join(g.vault, '.mutable', 'mutable.db');
    const db = fs.readFileSync(dbPath);
    db.write('NOT A SQLITE DB!', 0);
    fs.writeFileSync(dbPath, db);
    await expect(migrateCavernToPhext({ root: g.vault, openVfs: PhextVFS })).rejects.toThrow();
    expect(fs.existsSync(dbPath)).toBe(true);
    expect(fs.existsSync(path.join(g.vault, 'cavern.phext'))).toBe(false);
    expect(fs.existsSync(path.join(g.vault, '.mutable-disk-fallback'))).toBe(false);
  });

  it('open refusals: corrupt seal, non-phext content, missing knowledge control, non-empty target', { timeout: 120000 }, async () => {
    const f = await diskCavern();
    await migrateCavernToPhext({ root: f.vault, openVfs: PhextVFS });
    const raw = fs.readFileSync(path.join(f.vault, 'cavern.phext'));
    const sealed = await sealPhext(raw);

    const corrupt = Buffer.from(sealed);
    corrupt[Math.floor(corrupt.length / 2)] ^= 0xff;
    await expect(installPhextIntoFolder({
      bytes: corrupt, filename: 'cavern.phext.xz', targetDir: path.join(f.dir, 't1'), openVfs: PhextVFS,
    })).rejects.toThrow(/integrity check/);
    expect(fs.existsSync(path.join(f.dir, 't1'))).toBe(false);

    await expect(installPhextIntoFolder({
      bytes: Buffer.from('just some text, not a phext'), filename: 'cavern.phext', targetDir: path.join(f.dir, 't2'), openVfs: PhextVFS,
    })).rejects.toThrow(/not a Mutable Cavern phext/);
    expect(fs.existsSync(path.join(f.dir, 't2'))).toBe(false);

    // Knowledge-bearing (L3 holds a record) but no control record.
    const barePath = path.join(f.dir, 'bare.phext');
    const bare = PhextVFS.create(barePath);
    bare.writeFile('/.mutable/entities/some-id.json', JSON.stringify({ guid: 'some-id' }));
    bare.flush(); bare.close();
    await expect(installPhextIntoFolder({
      bytes: fs.readFileSync(barePath), filename: 'bare.phext', targetDir: path.join(f.dir, 't3'), openVfs: PhextVFS,
    })).rejects.toThrow(/knowledge control record/);

    const occupied = path.join(f.dir, 't4');
    fs.mkdirSync(occupied);
    fs.writeFileSync(path.join(occupied, 'keep.txt'), 'mine');
    await expect(installPhextIntoFolder({
      bytes: raw, filename: 'cavern.phext', targetDir: occupied, openVfs: PhextVFS,
    })).rejects.toThrow(/not empty/);
    expect(fs.readFileSync(path.join(occupied, 'keep.txt'), 'utf8')).toBe('mine');
  });

  it('lifecycle transfer routes serve the per-Cavern mode world (no global flag)', { timeout: 120000 }, async () => {
    const f = await diskCavern();
    const root = f.dir;
    const lifecycle = createCavernLifecycle({ stateFile: path.join(root, 'preferences.json') });
    cleanups.push(() => { void lifecycle.close(); });
    const app = express();
    app.use(express.json());
    app.use('/api/cavern', lifecycle.router);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    cleanups.push(() => { server.close(); });
    const port = (server.address() as { port: number }).port;

    // The migrate route upgrades the disk-born Cavern — the
    // global flag that used to gate it is deleted, and mode is a
    // per-Cavern record now, so the route simply works.
    const migrate = await fetch(`http://127.0.0.1:${port}/api/cavern/migrate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: f.vault }),
    });
    expect(migrate.status).toBe(200);
    expect((await migrate.json()).Success).toBe(true);
    expect(fs.existsSync(path.join(f.vault, 'cavern.phext'))).toBe(true);

    // Download with no Cavern open refuses explicitly (the
    // surviving refusal shape: name the missing precondition).
    const download = await fetch(`http://127.0.0.1:${port}/api/cavern/download?format=xz`);
    expect(download.status).toBe(409);
    expect((await download.json()).Success).toBe(false);

    const open = await fetch(`http://127.0.0.1:${port}/api/cavern/open-phext`, { method: 'POST' });
    expect(open.status).toBe(400);
    expect((await open.json()).Error).toMatch(/Choose a \.phext or \.phext\.xz file/);
  });
});
