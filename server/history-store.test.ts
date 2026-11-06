// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm, symlink, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createHistoryStore, type HistoryRecord } from './history-store';
import { promises as vfs } from './phext-fs.mjs';
import { testCavern } from '../src/knowledge-sqlite/phext-test-cavern.mjs';
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const roots: string[] = [], writers: { close(): Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(writers.splice(0).map(w => w.close()));
  const fs = await import(pathToFileURL(path.resolve('scripts/stage-c-gates/filesystem.mjs')).href);
  await fs.closeFilesystemWorkers();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'codex-history-')); roots.push(root); testCavern(root);
  await vfs.writeFile(path.join(root, 'doc.json'), '{"type":"Document"}');
  const store = createHistoryStore({ root }), location = { folder: '.', filename: 'doc.json', resourceId: 'resource-1' };
  const opened = await store.open(location), writer = await opened.acquireWriter(); writers.push(writer);
  const bytes = Buffer.from('{"state":"baseline"}'), descriptor = { hash: sha(bytes), byteLength: bytes.length, chunks: [{ hash: sha(bytes), byteLength: bytes.length }] };
  await writer.putChunk({ hash: sha(bytes), dataBase64: bytes.toString('base64') });
  await writer.beginSegment({ segmentId: 'segment-1', revisionId: 'revision-0', baseline: descriptor, metadata: { label: 'Opened Document' } });
  const record = (sequence: number): HistoryRecord => ({ segmentId: 'segment-1', sequence, recordId: `revision-${sequence}`, revisionId: `revision-${sequence}`, stateParent: `revision-${sequence - 1}`, wire: JSON.stringify({ exact: sequence }), metadata: { affectedBlockIds: ['block-1'] }, ...(sequence % 12 ? {} : { checkpoint: descriptor }) });
  return { root, store, location, opened, writer, descriptor, record };
}
describe('bounded directory-local history store', () => {
  it('fences writers, acknowledges exact retries and reconstructs a bounded checkpoint tail after restart', async () => {
    const f = await fixture();
    await expect((await f.store.open(f.location)).acquireWriter()).rejects.toThrow();
    for (let i = 1; i <= 15; i++) await f.writer.append(f.record(i));
    const ack = await f.writer.append(f.record(15));
    await expect(f.writer.append({ ...f.record(15), wire: 'different' })).rejects.toThrow('Conflicting record retry');
    const memoirId = (await f.opened.reader.describe()).memoirId;
    await f.writer.close(); writers.splice(writers.indexOf(f.writer), 1);
    const reopened = await createHistoryStore({ root: f.root }).open({ ...f.location, memoirId });
    expect((await reopened.reader.describe()).memoirId).toBe(memoirId);
    expect((await reopened.reader.segment('segment-1')).headSequence).toBe(15);
    expect(await reopened.reader.checkpoint('segment-1', 15)).toEqual({ sequence: 12, revisionId: 'revision-12', descriptor: f.descriptor });
    const tail = await reopened.reader.records('segment-1', { afterSequence: 12, limit: 12 });
    expect(tail.records.map(r => r.record.sequence)).toEqual([13, 14, 15]); expect(tail.next).toBeNull();
    expect(tail.records.at(-1).hash).toBe(ack.hash);
    const nextWriter = await reopened.acquireWriter(); writers.push(nextWriter);
    expect((await nextWriter.append(f.record(15))).hash).toBe(ack.hash);
    expect(nextWriter.epoch).not.toBe(f.writer.epoch);
    expect('append' in reopened.reader).toBe(false);
  });
  it('admits checkpoints larger than the temporary 8MiB budget with <=1MiB independently verified reads', async () => {
    const f = await fixture(); const chunk = Buffer.alloc(1024 * 1024, 120), chunks = Array.from({ length: 9 }, () => ({ hash: sha(chunk), byteLength: chunk.length }));
    await f.writer.putChunk({ hash: sha(chunk), dataBase64: chunk.toString('base64') });
    const aggregate = createHash('sha256'); for (let i = 0; i < 9; i++) aggregate.update(chunk);
    const baseline = { hash: aggregate.digest('hex'), byteLength: 9 * chunk.length, chunks };
    await f.writer.beginSegment({ segmentId: 'large', revisionId: 'large-0', baseline, metadata: {} });
    expect((await f.opened.reader.checkpoint('large', 0)).descriptor).toEqual(baseline);
    expect((await f.opened.reader.chunk(chunks[0].hash)).length).toBe(1024 * 1024);
    await expect(f.writer.beginSegment({ segmentId: 'missing', revisionId: 'r0', baseline: { ...baseline, chunks: [{ hash: 'a'.repeat(64), byteLength: 100 }] }, metadata: {} })).rejects.toThrow();
    await expect(f.writer.putChunk({ hash: sha(chunk), dataBase64: Buffer.alloc(chunk.length + 1).toString('base64') })).rejects.toThrow();
  });
  it('bounds pages and prerequisites; refuses gaps, changed artifacts, escaped paths, and wrong memoir identity', async () => {
    const f = await fixture();
    await expect(f.writer.append(f.record(2))).rejects.toThrow('sequence gap');
    for (let i = 1; i < 12; i++) await f.writer.append(f.record(i));
    await expect(f.writer.append({ ...f.record(12), recordId: 'revision-1' })).rejects.toThrow();
    await expect(f.writer.append({ ...f.record(12), checkpoint: undefined })).rejects.toThrow('checkpoint');
    await expect(f.opened.reader.records('segment-1', { limit: 26 })).rejects.toThrow('bound');
    await expect(f.store.open({ ...f.location, folder: '../' })).rejects.toThrow('folder');
    await symlink(f.root, path.join(f.root, 'alias'));
    await expect(f.store.open({ ...f.location, folder: 'alias' })).rejects.toThrow(/symlink|does not exist|Invalid|ENOENT/); // phext: a disk symlink folder simply does not exist in the phext
    const wrong = await f.store.open({ ...f.location, memoirId: 'wrong' });
    await expect(wrong.reader.describe()).rejects.toThrow('conflict');
    await expect(f.writer.saveReceipt({ segmentId: 'segment-1', revisionId: 'revision-11', artifactHash: sha('wrong') })).rejects.toThrow('artifact changed');
    const replacement = '{"type":"Document","text":"saved"}'; await vfs.writeFile(path.join(f.root, 'replacement'), replacement); await vfs.rename(path.join(f.root, 'replacement'), path.join(f.root, 'doc.json'));
    const receipt = await f.writer.saveReceipt({ segmentId: 'segment-1', revisionId: 'revision-11', artifactHash: sha(replacement) });
    expect((await f.opened.reader.receipt(receipt.hash)).artifactHash).toBe(sha(replacement));
    await f.writer.beginSegment({ segmentId: 'reopened', revisionId: 'new-0', baseline: f.descriptor, originReceipt: receipt.hash, metadata: {} });
    expect((await f.opened.reader.listSegments({ offset: 0, limit: 1 })).next).toBe(1);
  });
});
