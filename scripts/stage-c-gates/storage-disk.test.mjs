import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rename, cp, rm, symlink, readdir, appendFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openStore, admitMemoir, readMemoir, association, discover, openWriter, readCheckpoint, scanFrames, hash, handoffMemoir } from './store.mjs';
import { pinDirectory, atDirectory, closeFilesystemWorkers } from './filesystem.mjs';
import { core } from '../preplan-spike/support.mjs';
const api = await core();
const grant = { enrollmentId: 'enrollment' };
after(closeFilesystemWorkers);
async function sandbox(run) {
  const directory = await mkdtemp(join(tmpdir(), 'codex-stage-c-g2-'));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}
async function admitted(directory) {
  await writeFile(join(directory, 'doc.json'), JSON.stringify({ resourceId: 'resource', content: 'authored' }));
  const store = await openStore(directory, true);
  const memoir = await admitMemoir(store, { resourceId: 'resource', memoirId: 'memoir', enrollmentId: 'enrollment' }, 'doc.json');
  return { store, memoir };
}

test('G2 recognizes only immediate-parent managed stores; collisions are preserved', () => sandbox(async directory => {
  const parent = join(directory, 'parent'), nested = join(parent, 'nested');
  await mkdir(nested, { recursive: true }); await openStore(parent, true);
  await assert.rejects(openStore(nested), { code: 'ENOENT' });
  await mkdir(join(nested, '.memory'));
  await assert.rejects(openStore(nested, true), /unrecognized/);
  assert.deepEqual(await readdir(join(nested, '.memory')), []);
  await writeFile(join(nested, '.memory', 'store.json'), JSON.stringify({ format: 'codex-memory-gate', version: 999, storeId: 'future' }));
  await assert.rejects(openStore(nested, true), /unrecognized/);
  assert.match(await readFile(join(nested, '.memory', 'store.json'), 'utf8'), /999/);
}));

test('G2 racing initialization has one marker and never adopts a partially initialized unrelated store', () => sandbox(async directory => {
  const attempts = await Promise.allSettled([openStore(directory, true), openStore(directory, true)]);
  const ready = attempts.filter(r => r.status === 'fulfilled').map(r => r.value);
  assert.ok(ready.length >= 1); assert.ok(ready.every(s => s.storeId === ready[0].storeId));
  const marker = await readFile(join(directory, '.memory', 'store.json'), 'utf8');
  assert.equal(JSON.parse(marker).storeId, ready[0].storeId);
  await writeFile(join(directory, '.memory', 'unrelated.txt'), 'keep');
  await rename(join(directory, '.memory', 'store.json'), join(directory, '.memory', 'lost-marker.json'));
  await assert.rejects(openStore(directory, true), /unrecognized/);
  assert.equal(await readFile(join(directory, '.memory', 'unrelated.txt'), 'utf8'), 'keep');
  assert.equal(await readFile(join(directory, '.memory', 'lost-marker.json'), 'utf8'), marker);
}));

test('G2 pins directory identity across a symlink substitution between admission and mutation', () => sandbox(async directory => {
  const managed = join(directory, 'managed'), foreign = join(directory, 'foreign');
  await mkdir(managed); await mkdir(foreign);
  const pinned = await pinDirectory(managed);
  await assert.rejects(atDirectory(pinned, { kind: 'create', name: 'journal', data: Buffer.from('must not escape'), maxBytes: 100 }, undefined, {
    beforeSpawn: async () => { await rename(managed, join(directory, 'original')); await symlink(foreign, managed); },
  }), /directory identity changed/);
  assert.deepEqual(await readdir(foreign), []);
  assert.deepEqual(await readdir(join(directory, 'original')), []);
  await assert.rejects(atDirectory(await pinDirectory(foreign), { kind: 'create', name: '../escape', data: Buffer.alloc(0), maxBytes: 0 }), /invalid leaf/);
}));

test('G2 confines encoded IDs and separates rename, copy, changed artifact and enrollment evidence', () => sandbox(async directory => {
  const { store, memoir } = await admitted(directory);
  await assert.rejects(openWriter(memoir), /missing enrollment grant/);
  await assert.rejects(openWriter(memoir, { enrollmentId: 'not-the-enrollment' }), /unproved writable association/);
  assert.equal(await association(store, memoir, 'doc.json', 'enrollment'), 'associated');
  assert.equal(await association(store, memoir, 'doc.json', 'other'), 'unproved-enrollment');
  await cp(join(directory, 'doc.json'), join(directory, 'copy.json'));
  assert.equal(await association(store, memoir, 'copy.json', 'enrollment'), 'copy-or-replacement');
  await rename(join(directory, 'doc.json'), join(directory, 'renamed.json'));
  assert.equal(await association(store, memoir, 'renamed.json', 'enrollment'), 'associated');
  await appendFile(join(directory, 'renamed.json'), ' ');
  assert.equal(await association(store, memoir, 'renamed.json', 'enrollment'), 'changed-artifact');
  const weird = { resourceId: '../../escape/💡', memoirId: '../memory\0', enrollmentId: 'new' };
  const second = await admitMemoir(store, weird, 'renamed.json');
  assert.equal(second.directory.path, join(store.resources.path, hash(weird.resourceId), hash(weird.memoirId)));
  await assert.rejects(admitMemoir(store, weird, 'renamed.json'), { code: 'EEXIST' });
  await writeFile(join(store.directory.path, 'index.json'), '{stale or corrupt');
  assert.equal((await discover(store, 'resource')).candidates[0].memoirId, 'memoir');
  assert.equal((await readMemoir(store, 'resource', 'memoir')).manifest.enrollmentId, 'enrollment');
  // No Document presence is needed to read the independent orphan memoir.
  await rm(join(directory, 'renamed.json'));
  assert.equal((await discover(store, 'resource')).candidates.length, 1);
  assert.equal(await readFile(join(store.directory.path, 'index.json'), 'utf8'), '{stale or corrupt');
}));

test('G2 missing acknowledged checkpoint data blocks continuation without affecting ordinary Document bytes', () => sandbox(async directory => {
  const { memoir } = await admitted(directory), writer = await openWriter(memoir, grant);
  const descriptor = await writer.publishCheckpoint(Buffer.from(api.encodeWire(api.fixture(3))));
  await writer.append(writer.token, writer.head, [{ kind: 'baseline', id: 'base', checkpoint: descriptor }]); await writer.close();
  const journal = await readFile(join(memoir.directory.path, 'journal.jsonl'));
  await rm(join(memoir.directory.path, 'checkpoints', descriptor.hash));
  await assert.rejects(readCheckpoint(memoir, descriptor), { code: 'ENOENT' });
  await assert.rejects(openWriter(memoir, grant), { code: 'ENOENT' });
  assert.deepEqual(await readFile(join(memoir.directory.path, 'journal.jsonl')), journal);
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'doc.json'), 'utf8')), { resourceId: 'resource', content: 'authored' });
}));

test('G2 replacing a lock inode cannot grant a competing writer', () => sandbox(async directory => {
  const { memoir } = await admitted(directory), writer = await openWriter(memoir, grant);
  try {
    const path = join(memoir.directory.path, 'owner.lock');
    await rename(path, join(memoir.directory.path, 'original-owner.lock')); await writeFile(path, '');
    await assert.rejects(openWriter(memoir, grant), /unproved physical writer location/);
  } finally { await writer.close(); }
}));

test('G2 OS writer exclusion survives contention and releases after real SIGKILL', () => sandbox(async directory => {
  const { memoir } = await admitted(directory);
  const module = fileURLToPath(new URL('./store.mjs', import.meta.url));
  const child = spawn(process.execPath, ['--input-type=module', '-e',
    `import {openWriter} from ${JSON.stringify(new URL('file://' + module).href)}; const writer=await openWriter(JSON.parse(process.argv[1]), {enrollmentId:"enrollment"});console.log('locked');setInterval(()=>{},1000);`, JSON.stringify(memoir)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', data => { stderr += data; });
  try {
    await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); child.once('exit', code => reject(new Error(`lock holder exited ${code}: ${stderr}`))); });
    await assert.rejects(openWriter(memoir, grant), error => ['EAGAIN', 'EWOULDBLOCK'].includes(error.code));
    const exit = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await exit;
    // The inherited descriptor intentionally excludes contenders until the old
    // filesystem child has also observed disconnect and stopped all writes.
    let restarted;
    const deadline = performance.now() + 2000;
    while (!restarted) {
      try { restarted = await openWriter(memoir, grant); }
      catch (error) {
        if (!['EAGAIN', 'EWOULDBLOCK'].includes(error.code) || performance.now() > deadline) throw error;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    assert.equal(restarted.frames.filter(f => JSON.parse(f.payload).kind === 'epoch').length, 2);
    await restarted.close();
  } finally { if (child.exitCode === null) child.kill('SIGKILL'); }
}));

test('G2 publishes a real 25k-character exact checkpoint in bounded packets and detects interrupted blobs', () => sandbox(async directory => {
  const { memoir } = await admitted(directory), writer = await openWriter(memoir, grant);
  try {
    const baseline = api.fixture(25000), bytes = Buffer.from(api.encodeWire(baseline));
    await assert.rejects(writer.publishCheckpoint(bytes, 2), /injected blob crash/);
    const absent = { hash: hash(bytes), bytes: bytes.length };
    await assert.rejects(writer.append(writer.token, writer.head, [{ kind: 'baseline', id: 'base', checkpoint: absent }]), { code: 'ENOENT' });
    const checkpoint = await writer.publishCheckpoint(bytes);
    await writer.append(writer.token, writer.head, [{ kind: 'baseline', id: 'base', checkpoint }]);
    const recovered = await readCheckpoint(memoir, checkpoint);
    assert.deepEqual(api.decodeWire(recovered.toString()), baseline);
    assert.equal(checkpoint.bytes, bytes.length);
    console.log(JSON.stringify({ gate: 'G2-checkpoint', characters: 25000, wireBytes: bytes.length, maxTransferPacketBytes: 256 * 1024 }));
  } finally { await writer.close(); }
}));

test('G2 append retries, state ancestry, acknowledgement prerequisites and torn-tail restart', () => sandbox(async directory => {
  const { memoir } = await admitted(directory); let writer = await openWriter(memoir, grant);
  try {
    const baseline = api.fixture(100), bytes = Buffer.from(api.encodeWire(baseline)), checkpoint = await writer.publishCheckpoint(bytes);
    const base = { kind: 'baseline', id: 'base', checkpoint };
    await writer.append(writer.token, writer.head, [base]);
    const repository = new api.CanonicalRepository(baseline), commands = new api.TreeCommands(repository, k => k), events = [];
    repository.subscribeHistoryChanges(e => events.push(e), e => { throw e; });
    const pk = Object.values(baseline.placements).find(p => baseline.contents[p.contentKey].payload.id === 'p').key;
    commands.replaceInlineRange(pk, 1, 1, 'x'); commands.replaceInlineRange(pk, 2, 2, 'y');
    const first = { kind: 'revision', id: events[0].commitId, stateParent: 'base', eventWire: api.encodeWire(events[0]) };
    const second = { kind: 'revision', id: events[1].commitId, stateParent: first.id, eventWire: api.encodeWire(events[1]) };
    const expectedHead = writer.head;
    await writer.append(writer.token, expectedHead, [first]);
    await writer.append(writer.token, expectedHead, [first, second]);
    assert.equal((await writer.append('stale-token', 0, [first, second])).duplicate, true);
    await assert.rejects(writer.append(writer.token, writer.head, [{ ...second, stateParent: 'base' }]), /conflicting duplicate/);
    await assert.rejects(writer.append(writer.token, writer.head, [{ kind: 'revision', id: 'missing', stateParent: 'unknown' }]), /state ancestry/);
    const branchRepository = new api.CanonicalRepository(baseline), branchCommands = new api.TreeCommands(branchRepository, k => k); let branchEvent;
    branchRepository.subscribeHistoryChanges(e => { branchEvent = e; }, e => { throw e; });
    branchCommands.replaceInlineRange(pk, 0, 0, 'branch');
    const branch = { kind: 'revision', id: branchEvent.commitId, stateParent: 'base', eventWire: api.encodeWire(branchEvent) };
    await writer.append(writer.token, writer.head, [branch]);
    const states = new Map([['base', baseline]]);
    for (const f of writer.frames) {
      const record = JSON.parse(f.payload);
      if (record.kind === 'revision') states.set(record.id, api.applyHistoryChanges(states.get(record.stateParent), api.decodeWire(record.eventWire)));
    }
    assert.deepEqual(states.get(second.id), repository.snapshot());
    assert.deepEqual(states.get(branch.id), branchRepository.snapshot());
    const oldToken = writer.token;
    await writer.close(); writer = await openWriter(memoir, grant);
    await assert.rejects(writer.append(oldToken, writer.head, [{ kind: 'save-prepared', id: 'stale-save' }]), /fenced writer/);
    const head = writer.head;
    await assert.rejects(writer.append(writer.token, head, Array.from({ length: 129 }, (_, i) => ({ id: String(i) }))), /batch admission/);
    assert.equal(writer.head, head);
    await writer.close();
    const path = join(memoir.directory.path, 'journal.jsonl'), valid = await readFile(path);
    await appendFile(path, '{partial');
    assert.equal(scanFrames(await readFile(path)).frames.length, head);
    await assert.rejects(openWriter(memoir, grant), /incomplete tail/);
    // Fixture reset is outside the candidate recovery API. Production must use
    // the explicit lossless repair protocol; no arbitrary truncation is shipped.
    await writeFile(path, valid);
    const corrupt = Buffer.from(valid); corrupt[20] ^= 1; await writeFile(path, corrupt);
    await assert.rejects(openWriter(memoir, grant), /integrity|JSON|Unexpected|position/);
  } finally { await writer.close(); }
}));

for (const phase of ['source-intent', 'source-torn', 'source-fenced', 'destination-staged', 'blobs-copied', 'journal-copied', 'activation-intent', 'activation-torn', 'destination-activated']) {
  test(`G2 resumes handoff after ${phase}, retaining source bytes with at most one writable location`, () => sandbox(async directory => {
    const from = join(directory, 'from'), to = join(directory, 'to'); await mkdir(from); await mkdir(to);
    const { memoir } = await admitted(from), sourceWriter = await openWriter(memoir, grant);
    const baseline = api.fixture(3), descriptor = await sourceWriter.publishCheckpoint(Buffer.from(api.encodeWire(baseline)));
    await sourceWriter.append(sourceWriter.token, sourceWriter.head, [{ kind: 'baseline', id: 'base', checkpoint: descriptor }]);
    await sourceWriter.close();
    await cp(join(from, 'doc.json'), join(to, 'doc.json'));
    const destinationStore = await openStore(to, true);
    await assert.rejects(handoffMemoir(memoir, destinationStore, 'doc.json', 'handoff', phase), /injected handoff/);
    await assert.rejects(openWriter(memoir, grant), /fence|incomplete tail/);
    if (!['source-intent', 'source-torn', 'source-fenced'].includes(phase)) {
      const staged = await readMemoir(destinationStore, 'resource', 'memoir');
      if (phase === 'destination-activated') { const active = await openWriter(staged, grant); await active.close(); }
      else await assert.rejects(openWriter(staged, grant), /staged|fenced|incomplete tail/);
    }
    const sourceBytes = await readFile(join(memoir.directory.path, 'journal.jsonl'));
    const reopenedSource = await readMemoir(await openStore(from), 'resource', 'memoir');
    const reopenedDestination = await openStore(to);
    const target = await handoffMemoir(reopenedSource, reopenedDestination, 'doc.json', 'handoff');
    const active = await openWriter(target, grant);
    await active.append(active.token, active.head, [{ kind: 'save-prepared', id: 'destination-save' }]); await active.close();
    await assert.rejects(openWriter(memoir, grant), /fenced/);
    const afterSource = await readFile(join(memoir.directory.path, 'journal.jsonl'));
    assert.deepEqual(afterSource.subarray(0, sourceBytes.length), sourceBytes);
    if (!['source-intent', 'source-torn'].includes(phase)) assert.deepEqual(afterSource, sourceBytes);
    assert.deepEqual(api.decodeWire((await readCheckpoint(target, descriptor)).toString()), baseline);
    assert.deepEqual(await readCheckpoint(memoir, descriptor), await readCheckpoint(target, descriptor));
  }));
}

test('G2 a folder copy cannot acquire a writer by copied IDs and hashes, while a folder rename preserves association', () => sandbox(async directory => {
  const original = join(directory, 'original'), copied = join(directory, 'copied'), renamed = join(directory, 'renamed'); await mkdir(original);
  await admitted(original); await cp(original, copied, { recursive: true });
  const copiedStore = await openStore(copied), copy = await readMemoir(copiedStore, 'resource', 'memoir');
  await assert.rejects(openWriter(copy, grant), /unproved writable association/);
  await rename(original, renamed);
  const renamedStore = await openStore(renamed), memoir = await readMemoir(renamedStore, 'resource', 'memoir');
  const writer = await openWriter(memoir, grant); await writer.close();
}));

test('G2 verified return handoff reactivates an old location without merging divergent journals', () => sandbox(async directory => {
  const from = join(directory, 'from'), to = join(directory, 'to'); await mkdir(from); await mkdir(to);
  const { memoir, store } = await admitted(from); await cp(join(from, 'doc.json'), join(to, 'doc.json'));
  const destinationStore = await openStore(to, true);
  const first = await handoffMemoir(memoir, destinationStore, 'doc.json', 'outward');
  const writer = await openWriter(first, grant); await writer.append(writer.token, writer.head, [{ kind: 'save-prepared', id: 'saved-there' }]); await writer.close();
  const returned = await handoffMemoir(first, store, 'doc.json', 'return');
  const returnedWriter = await openWriter(returned, grant); await returnedWriter.close();
  await assert.rejects(openWriter(first, grant), /fenced/);
  const records = scanFrames(await readFile(join(returned.directory.path, 'journal.jsonl'))).frames.map(f => JSON.parse(f.payload));
  assert.equal(records.filter(r => r.id === 'saved-there').length, 1);
  assert.equal(records.filter(r => r.kind === 'handoff-activated').length, 2);
}));

test('G2 immutable pending retries survive relocation and conflicting destination bytes are preserved', () => sandbox(async directory => {
  const from = join(directory, 'from'), to = join(directory, 'to'); await mkdir(from); await mkdir(to);
  const { memoir } = await admitted(from), source = await openWriter(memoir, grant);
  const packet = { kind: 'save-prepared', id: 'immutable-pending', artifactHash: 'unchanged' };
  await source.append(source.token, source.head, [packet]); const staleToken = source.token; await source.close();
  await cp(join(from, 'doc.json'), join(to, 'doc.json')); const store = await openStore(to, true);
  const target = await handoffMemoir(memoir, store, 'doc.json', 'move'); const writer = await openWriter(target, grant);
  try {
    assert.equal((await writer.append(staleToken, 0, [packet])).duplicate, true);
    await assert.rejects(writer.append(staleToken, writer.head, [{ kind: 'save-prepared', id: 'fresh-from-old-writer' }]), /fenced/);
    await assert.rejects(writer.append(writer.token, writer.head, [{ ...packet, artifactHash: 'different' }]), /conflicting duplicate/);
  } finally { await writer.close(); }
  const conflict = join(directory, 'conflict'); await mkdir(conflict); const other = await admitted(conflict);
  const otherWriter = await openWriter(other.memoir, grant); await otherWriter.close();
  const conflictingBytes = await readFile(join(other.memoir.directory.path, 'journal.jsonl'));
  await assert.rejects(handoffMemoir(target, other.store, 'doc.json', 'collision'), /prefix conflict/);
  assert.deepEqual(await readFile(join(other.memoir.directory.path, 'journal.jsonl')), conflictingBytes);
}));


test('G2 read-only history cannot redirect writes and ordinary Document saving remains independent', () => sandbox(async directory => {
  const { memoir } = await admitted(directory), path = join(memoir.directory.path, 'journal.jsonl');
  const before = await readFile(path);
  // Mode-selection restoration note: the pre-cutover test used
  // chmod 0o444 here, but these suites run as root, where mode bits
  // do not refuse writes. Obstruct the journal with a directory
  // instead (the same device the phext suite uses): the writer
  // must refuse outright rather than redirect its writes.
  await rm(path); await mkdir(path);
  try {
    await assert.rejects(openWriter(memoir, grant), error => ['EACCES', 'EPERM', 'EISDIR', 'ENOTDIR'].includes(error.code) || /not a regular file/i.test(error.message));
    await writeFile(join(directory, 'doc.json'), '{"ordinarySave":"still works"}');
    assert.deepEqual((await readdir(directory)).sort(), ['.memory', 'doc.json']);
  } finally { await rm(path, { recursive: true }); await writeFile(path, before); }
}));

test('G2 independent Save As uses actual authored-copy identities and an independent memoir', () => sandbox(async directory => {
  const { semanticCore } = await import('./semantic-core.mjs'), semantic = await semanticCore();
  const document = { format: 'codex-portable-resource-gate', version: 1, resourceId: 'source',
    root: { placementId: 'root', kind: 'owned', target: { kind: 'local', blockId: 'doc' } },
    blocks: [
      { id: 'doc', type: 'document-block', properties: {}, children: [
        { placementId: 'first', kind: 'owned', target: { kind: 'local', blockId: 'container' } },
        { placementId: 'shared', kind: 'reference', target: { kind: 'local', blockId: 'container' } },
        { placementId: 'external', kind: 'reference', target: { kind: 'external', reference: { kind: 'block', targetId: 'foreign', source: { scope: 'document', resourceId: 'elsewhere' }, version: { kind: 'unpinned' } } } },
      ] },
      { id: 'container', type: 'container-block', properties: {}, children: [{ placementId: 'child', kind: 'owned', target: { kind: 'local', blockId: 'text' } }] },
      { id: 'text', type: 'standoff-editor-block', properties: {}, inline: [{ kind: 'text', text: 'shared😀' }] },
    ] };
  const copied = semantic.duplicate(document, 'copy');
  assert.equal(copied.document.resourceId, 'copy');
  assert(copied.document.blocks.every(b => !document.blocks.some(old => old.id === b.id)));
  const children = copied.document.blocks.find(b => b.type === 'document-block').children;
  assert.equal(children[0].target.blockId, children[1].target.blockId);
  assert.deepEqual(children[2].target, document.blocks[0].children[2].target);
  assert(children.every(p => !['first', 'shared', 'external'].includes(p.placementId)));
  const store = await openStore(directory, true);
  await writeFile(join(directory, 'source.json'), JSON.stringify(document));
  const source = await admitMemoir(store, { resourceId: 'source', memoirId: 'source-memory', enrollmentId: 'source-enrollment' }, 'source.json');
  const writer = await openWriter(source, { enrollmentId: 'source-enrollment' });
  try {
    const sourceBytes = await readFile(join(source.directory.path, 'journal.jsonl'));
    await writeFile(join(directory, 'copy.json'), JSON.stringify(copied.document));
    const target = await admitMemoir(store, { resourceId: 'copy', memoirId: 'copy-memory', enrollmentId: 'copy-enrollment' }, 'copy.json');
    const independent = await openWriter(target, { enrollmentId: 'copy-enrollment' });
    try {
      const checkpoint = await independent.publishCheckpoint(Buffer.from(copied.baselineWire));
      await independent.append(independent.token, independent.head, [{ kind: 'baseline', id: 'copy-base', checkpoint }]);
      assert.deepEqual(semantic.reopen(JSON.parse(await readFile(join(directory, 'copy.json'), 'utf8'))).document, copied.document);
      assert.deepEqual(semantic.decodeWire((await readCheckpoint(target, checkpoint)).toString()), semantic.decodeWire(copied.baselineWire));
    } finally { await independent.close(); }
    assert.deepEqual(await readFile(join(source.directory.path, 'journal.jsonl')), sourceBytes);
    await writer.append(writer.token, writer.head, [{ kind: 'save-prepared', id: 'source-still-writable' }]);
  } finally { await writer.close(); }
}));
