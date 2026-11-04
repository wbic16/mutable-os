// @vitest-environment node
/**
 * PhextVFS Phase 2 consumer proof: the real history store — whose file
 * I/O is entirely stage-C gates ops — running on the phext backend.
 * The document itself stays on disk (Phase 3 territory); everything
 * under .memory/ lands in the Cavern's single cavern.phext, and the
 * timeline reads back after a cold reopen with a fresh PhextVFS, the
 * way a server restart would see it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { PhextVFS } from '../src/phext/vfs';
import { createHistoryStore, type HistoryRecord } from './history-store';

const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const gates = () => import(pathToFileURL(path.resolve('scripts/stage-c-gates/filesystem.mjs')).href);

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

describe('history store on the phext gates backend', () => {
  it('appends records into the Cavern phext and reads the timeline back after a cold reopen', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'phext-history-')));
    const phextPath = path.join(root, 'cavern.phext');
    await writeFile(path.join(root, 'doc.json'), '{"type":"Document"}');
    const fs = await gates();
    let vfs = PhextVFS.openOrCreate(phextPath);
    fs.registerPhextBackend({ root, vfs });
    cleanups.push(async () => {
      await fs.unregisterPhextBackend(root).catch(() => {});
      if (!vfs.closed) vfs.close();
      await fs.closeFilesystemWorkers();
      await rm(root, { recursive: true, force: true });
    });

    const store = createHistoryStore({ root });
    const location = { folder: '.', filename: 'doc.json', resourceId: 'resource-1' };
    const opened = await store.open(location);
    const writer = await opened.acquireWriter();
    const bytes = Buffer.from('{"state":"baseline"}');
    const descriptor = { hash: sha(bytes), byteLength: bytes.length, chunks: [{ hash: sha(bytes), byteLength: bytes.length }] };
    await writer.putChunk({ hash: sha(bytes), dataBase64: bytes.toString('base64') });
    await writer.beginSegment({ segmentId: 'segment-1', revisionId: 'revision-0', baseline: descriptor, metadata: { label: 'Opened Document' } });
    const record = (sequence: number): HistoryRecord => ({
      segmentId: 'segment-1', sequence,
      recordId: `revision-${sequence}`, revisionId: `revision-${sequence}`,
      stateParent: `revision-${sequence - 1}`,
      wire: JSON.stringify({ exact: sequence }), metadata: { affectedBlockIds: ['block-1'] },
      ...(sequence % 12 ? {} : { checkpoint: descriptor }),
    });
    // A second writer is fenced by the anchor flock while the first holds it.
    await expect((await store.open(location)).acquireWriter()).rejects.toThrow();
    for (let i = 1; i <= 15; i++) await writer.append(record(i));
    const ack = await writer.append(record(15)); // exact retry is acknowledged, not duplicated
    expect(ack.sequence).toBe(15);
    const memoirId = (await opened.reader.describe()).memoirId;
    await writer.close();

    // The memoir lives only in the phext; the disk has no .memory tree.
    expect(existsSync(path.join(root, '.memory'))).toBe(false);
    const memoirName = `document-${sha('doc.json').slice(0, 32)}`;
    expect(vfs.stat(`/.memory/${memoirName}`)?.type).toBe('directory');
    expect(vfs.stat(`/.memory/${memoirName}/record-segment-1-15.json`)?.type).toBe('file');

    // Cold reopen: unregister, close, open the phext fresh, re-register.
    await fs.unregisterPhextBackend(root);
    vfs.close();
    vfs = PhextVFS.open(phextPath);
    fs.registerPhextBackend({ root, vfs });

    const reopened = await createHistoryStore({ root }).open({ ...location, memoirId });
    expect((await reopened.reader.describe()).memoirId).toBe(memoirId);
    expect((await reopened.reader.segment('segment-1')).headSequence).toBe(15);
    const tail = await reopened.reader.records('segment-1', { afterSequence: 12, limit: 12 });
    expect(tail.records.map((r: any) => r.record.sequence)).toEqual([13, 14, 15]);
    expect(tail.records.at(-1).hash).toBe(ack.hash);
    const nextWriter = await reopened.acquireWriter();
    expect((await nextWriter.append(record(15))).hash).toBe(ack.hash);
    await nextWriter.close();
  }, 60_000);
});
