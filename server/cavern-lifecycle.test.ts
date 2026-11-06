// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCavernLifecycle } from './cavern-lifecycle';
import { SqliteKnowledgeHost } from './sqlite-knowledge-host';
import { EventEmitter } from 'node:events';
import Database from 'better-sqlite3';
import { migrate } from '../src/knowledge-sqlite/schema.mjs';
import { PhextVFS } from '../src/phext/vfs';

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  vi.restoreAllMocks();
});

async function fixture() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'cavern-lease-')));
  cleanup.push(() => fs.rm(root, { recursive: true, force: true }));
  const lifecycle = createCavernLifecycle({ stateFile: path.join(root, 'preferences.json') });
  cleanup.push(() => lifecycle.close());
  const app = express();
  app.use(express.json());
  app.use('/api/cavern', lifecycle.router);
  app.use('/api', lifecycle.middleware);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  cleanup.push(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const port = (server.address() as { port: number }).port;
  const call = async (action: string, body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/cavern/${action}`, body === undefined ? undefined : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, ...await response.json() };
  };
  const opened = await call('establish', { path: path.join(root, 'vault'), intent: 'create' });
  expect(opened.Success, opened.Error).toBe(true);
  const current = opened.Data.current;
  const policy = { version: 1, opaqueTypes: ['application-block', 'timer-block'] };
  const acquire = vi.spyOn(SqliteKnowledgeHost.prototype, 'acquire');
  expect((await call('index', { session: current.session, policy })).Success).toBe(true);
  const host = acquire.mock.contexts[0] as SqliteKnowledgeHost;
  const lease = (await acquire.mock.results[0].value).lease;
  const asset = async (action: string, session = current.session, body: unknown = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/assets/${action}`, {method:'POST',headers:{'Content-Type':'application/json','X-Mutable-Cavern':session},body:JSON.stringify(body)});
    return {status:response.status,...await response.json()};
  };
  return { call, current, policy, host, lease, acquire, asset };
}

it('reopens the idle Cavern index once for concurrent startup/status requests, preserving policy and session', async () => {
  const f = await fixture();
  // Expiry uses release internally. Exercise the same real host path without
  // waiting ten minutes or advancing unrelated worker timers.
  await f.host.release(f.lease);
  await expect(f.host.status(f.lease)).rejects.toThrow('SQLite lease expired');
  const responses = await Promise.all([f.call('startup', {}), f.call('status'), f.call('status')]);
  for (const response of responses) {
    expect(response.Success).toBe(true);
    expect(response.Data.current).toEqual(f.current);
    expect(response.Data.index.vaultGuid).toBe(f.current.cavernGuid);
    expect(response.Data.index.coverage).toHaveProperty('complete');
  }
  expect(f.acquire).toHaveBeenCalledTimes(2);
  expect(f.acquire).toHaveBeenLastCalledWith('.', f.policy);
  const replacement = (await f.acquire.mock.results[1].value).lease;
  expect(replacement).not.toBe(f.lease);

  // Explicit reconciliation must also recover, including a later expiry.
  await f.host.release(replacement);
  expect((await f.call('index', { session: f.current.session, policy: f.policy })).Success).toBe(true);
  expect(f.acquire).toHaveBeenCalledTimes(3);
});

it('does not retry unrelated SQLite failures or accept stale Cavern sessions', async () => {
  const f = await fixture();
  vi.spyOn(f.host, 'status').mockRejectedValue(new Error('SQLite unavailable'));
  expect(await f.call('startup', {})).toMatchObject({ Success: false, Error: 'SQLite unavailable' });
  expect(await f.call('index', { session: 'old', policy: f.policy })).toMatchObject({ Success: false, Error: 'The current Cavern changed.' });
  expect(f.acquire).toHaveBeenCalledTimes(1);
});


it('mounts managed assets in the active Cavern and rejects stale activation headers', async () => {
  const f = await fixture();
  const begin = await f.asset('begin');
  expect(begin.Success, begin.Error).toBe(true);
  expect(begin.Data.cavernId).toBe(f.current.cavernGuid);
  expect(await f.asset('begin', 'stale-session')).toMatchObject({status:409,Success:false});
  expect(await f.asset('verify', f.current.session, {cavernId:'foreign',assetId:'sha256:'+'a'.repeat(64)})).toMatchObject({Success:false,Error:'Asset belongs to another Cavern.'});
});

it('a Cavern switch proceeds when an in-flight request never finishes (H1 drain timeout)', { timeout: 60000 }, async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'cavern-drain-')));
  cleanup.push(() => fs.rm(root, { recursive: true, force: true }));
  const lifecycle = createCavernLifecycle({ stateFile: path.join(root, 'preferences.json'), drainTimeoutMs: 200 });
  cleanup.push(() => lifecycle.close());
  const app = express();
  app.use(express.json());
  app.use('/api/cavern', lifecycle.router);
  app.use('/api', lifecycle.middleware);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  cleanup.push(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const port = (server.address() as { port: number }).port;
  const call = async (action: string, body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/cavern/${action}`, body === undefined ? undefined : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, ...await response.json() };
  };
  const opened = await call('establish', { path: path.join(root, 'vault-a'), intent: 'create' });
  expect(opened.Success, opened.Error).toBe(true);
  const session = opened.Data.current.session as string;

  // Hold one API request in flight forever: it passes the counting
  // middleware with a valid session, but its response never emits
  // finish/close — the dead-client shape behind H1. Before the fix,
  // the switch below waited on the drain promise forever and the
  // whole lifecycle wedged.
  const heldRes: any = new EventEmitter();
  heldRes.status = () => heldRes; heldRes.json = () => heldRes; heldRes.send = () => heldRes;
  heldRes.set = () => heldRes; heldRes.setHeader = () => heldRes; heldRes.writeHead = () => heldRes; heldRes.end = () => heldRes;
  const heldReq: any = {
    method: 'GET', url: '/held-request', body: undefined,
    header: (name: string) => name.toLowerCase() === 'x-mutable-cavern' ? session : undefined,
  };
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  lifecycle.middleware(heldReq, heldRes, () => {});

  const switched = await call('establish', { path: path.join(root, 'vault-b'), intent: 'create' });
  expect(switched.Success, switched.Error).toBe(true);
  expect(switched.Data.current.path).toBe(path.join(root, 'vault-b'));
  expect(warn.mock.calls.some(args => String(args[0]).includes('still in flight'))).toBe(true);
});

// ---- Mode selection (design §2.4/§3.2): the mode matrix, the
// ambiguity protocol, recorded-mode governance, and route gating.

async function bootLifecycle(root: string) {
  const lifecycle = createCavernLifecycle({ stateFile: path.join(root, 'preferences.json') });
  cleanup.push(() => lifecycle.close());
  const app = express();
  app.use(express.json());
  app.use('/api/cavern', lifecycle.router);
  app.use('/api', lifecycle.middleware);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  cleanup.push(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const port = (server.address() as { port: number }).port;
  const call = async (action: string, body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/cavern/${action}`, body === undefined ? undefined : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, ...await response.json() };
  };
  const get = async (action: string) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/cavern/${action}`);
    return { status: response.status, ...await response.json().catch(() => ({})) };
  };
  return { call, get, lifecycle };
}

async function nativeLayout(dir: string, vaultGuid: string, withMarker = false) {
  await fs.mkdir(path.join(dir, '.mutable'), { recursive: true });
  const mutable = new Database(path.join(dir, '.mutable', 'mutable.db'));
  migrate(mutable, 'mutable', { fresh: true, vaultGuid });
  mutable.close();
  const audit = new Database(path.join(dir, '.mutable', 'audit.db'));
  migrate(audit, 'audit', { fresh: true, vaultGuid });
  audit.close();
  if (withMarker) await fs.writeFile(path.join(dir, '.mutable', 'cavern-state.json'),
    JSON.stringify({ v: 1, mode: 'native', cavernGuid: vaultGuid, lastOpenedUtc: null }));
}

async function phextLayout(dir: string, withMarker = false) {
  await fs.mkdir(dir, { recursive: true });
  const vfs = PhextVFS.openOrCreate(path.join(dir, 'cavern.phext'));
  if (withMarker) vfs.writeFile('/.control/cavern-state.json', JSON.stringify({ v: 1, mode: 'phext' }));
  vfs.flush(); vfs.close();
}

it('inspect resolves the mode matrix from records and layout (§2.4)', { timeout: 120000 }, async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'cavern-modes-')));
  cleanup.push(() => fs.rm(root, { recursive: true, force: true }));
  const { call } = await bootLifecycle(root);
  const guid = '22222222-2222-4222-8222-222222222222';

  const phextOnly = path.join(root, 'phext-only'); await phextLayout(phextOnly);
  expect(await call('inspect', { path: phextOnly })).toMatchObject({ Data: { state: 'cavern', mode: 'phext', modeSource: 'derived' } });
  const phextMarked = path.join(root, 'phext-marked'); await phextLayout(phextMarked, true);
  expect(await call('inspect', { path: phextMarked })).toMatchObject({ Data: { state: 'cavern', mode: 'phext', modeSource: 'marker' } });
  const nativeOnly = path.join(root, 'native-only'); await nativeLayout(nativeOnly, guid);
  expect(await call('inspect', { path: nativeOnly })).toMatchObject({ Data: { state: 'cavern', mode: 'native', modeSource: 'derived' } });
  const nativeMarked = path.join(root, 'native-marked'); await nativeLayout(nativeMarked, guid, true);
  expect(await call('inspect', { path: nativeMarked })).toMatchObject({ Data: { state: 'cavern', mode: 'native', modeSource: 'marker' } });
  const both = path.join(root, 'both'); await nativeLayout(both, guid); await phextLayout(both);
  expect(await call('inspect', { path: both })).toMatchObject({ Data: { state: 'cavern', mode: 'ambiguous' } });
  const plain = path.join(root, 'plain'); await fs.mkdir(plain);
  expect(await call('inspect', { path: plain })).toMatchObject({ Data: { state: 'folder' } });
});

it('an ambiguous Cavern refuses without a choice, and the answer becomes the marker', { timeout: 120000 }, async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'cavern-ambiguous-')));
  cleanup.push(() => fs.rm(root, { recursive: true, force: true }));
  const { call } = await bootLifecycle(root);
  const guid = '33333333-3333-4333-8333-333333333333';
  const dir = path.join(root, 'both'); await nativeLayout(dir, guid); await phextLayout(dir);

  const refused = await call('establish', { path: dir, intent: 'open', confirmed: true });
  expect(refused.Success).toBe(false);
  expect(refused.Error).toMatch(/no recorded mode says which copy is current/);

  const opened = await call('establish', { path: dir, intent: 'open', confirmed: true, mode: 'native' });
  expect(opened.Success, opened.Error).toBe(true);
  expect(opened.Data.current.mode).toBe('native');
  const marker = JSON.parse(await fs.readFile(path.join(dir, '.mutable', 'cavern-state.json'), 'utf8'));
  expect(marker.mode).toBe('native');
  expect(marker.cavernGuid).toBe(guid);
  expect((await call('close', {})).Success).toBe(true);
  expect(await call('inspect', { path: dir })).toMatchObject({ Data: { mode: 'native', modeSource: 'marker' } });
});

it('answering phext for an ambiguous Cavern records the phext marker and opens phext', { timeout: 120000 }, async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'cavern-ambiguous-phext-')));
  cleanup.push(() => fs.rm(root, { recursive: true, force: true }));
  const { call } = await bootLifecycle(root);
  const guid = '55555555-5555-4555-8555-555555555555';
  const dir = path.join(root, 'both'); await nativeLayout(dir, guid); await phextLayout(dir);

  const opened = await call('establish', { path: dir, intent: 'open', confirmed: true, mode: 'phext' });
  expect(opened.Success, opened.Error).toBe(true);
  expect(opened.Data.current.mode).toBe('phext');
  expect((await call('close', {})).Success).toBe(true);
  expect(await call('inspect', { path: dir })).toMatchObject({ Data: { mode: 'phext', modeSource: 'marker' } });
});

it('create with an explicit native mode records native and writes no phext', { timeout: 120000 }, async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'cavern-born-native-')));
  cleanup.push(() => fs.rm(root, { recursive: true, force: true }));
  const { call } = await bootLifecycle(root);
  const dir = path.join(root, 'born-native');
  const opened = await call('establish', { path: dir, intent: 'create', mode: 'native' });
  expect(opened.Success, opened.Error).toBe(true);
  expect(opened.Data.current.mode).toBe('native');
  await expect(fs.stat(path.join(dir, 'cavern.phext'))).rejects.toMatchObject({ code: 'ENOENT' });
  const marker = JSON.parse(await fs.readFile(path.join(dir, '.mutable', 'cavern-state.json'), 'utf8'));
  expect(marker.mode).toBe('native');
  expect(marker.cavernGuid).toBe(opened.Data.current.cavernGuid);
  // The recents entry caches the mode for badging only.
  expect(opened.Data.recentCaverns[0]).toMatchObject({ mode: 'native' });
});

it('download and settings routes refuse in native mode with the exact message (§3.2)', { timeout: 120000 }, async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'cavern-gates-')));
  cleanup.push(() => fs.rm(root, { recursive: true, force: true }));
  const { call, get } = await bootLifecycle(root);
  const guid = '44444444-4444-4444-8444-444444444444';
  const dir = path.join(root, 'native-cavern'); await nativeLayout(dir, guid);
  const opened = await call('establish', { path: dir, intent: 'open', confirmed: true });
  expect(opened.Success, opened.Error).toBe(true);
  expect(opened.Data.current.mode).toBe('native');
  const refusal = 'This Cavern is in Native mode; upgrade it to Phext to use this.';
  const download = await get('download?format=phext');
  expect(download.status).toBe(409);
  expect(download.Error).toBe(refusal);
  const settings = await get('settings');
  expect(settings.status).toBe(409);
  expect(settings.Error).toBe(refusal);
  const capture = await call('settings/capture', { settings: {} });
  expect(capture.Success).toBe(false);
  expect(capture.Error).toBe(refusal);
});

it('a recorded phext mode governs beside a snapshot knowledge home', { timeout: 120000 }, async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'cavern-governs-')));
  cleanup.push(() => fs.rm(root, { recursive: true, force: true }));
  const { call } = await bootLifecycle(root);
  const dir = path.join(root, 'upgraded');
  const created = await call('establish', { path: dir, intent: 'create' });
  expect(created.Success, created.Error).toBe(true);
  expect(created.Data.current.mode).toBe('phext');
  const guid = created.Data.current.cavernGuid;
  expect((await call('close', {})).Success).toBe(true);
  // The frozen snapshot of an upgrade: a disk knowledge home
  // beside the phext. The phext's own record governs.
  await nativeLayout(dir, guid);
  expect(await call('inspect', { path: dir })).toMatchObject({ Data: { mode: 'phext', modeSource: 'marker' } });
  const reopened = await call('establish', { path: dir, intent: 'open', confirmed: true });
  expect(reopened.Success, reopened.Error).toBe(true);
  expect(reopened.Data.current.mode).toBe('phext');
});
