import {createApplicationServiceHost} from './application-services/host.js';
/** One application-level folder context; existing stores remain confined to it. */
import { Router, type RequestHandler } from 'express';
import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import multer from 'multer';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PhextVFS } from '../src/phext/vfs.js';
import { SqliteKnowledgeHost } from './sqlite-knowledge-host.js';
import { createHistoryService } from './history-router.js';
import { createNativeDocumentStoreRouter } from './native-document-store.mjs';
import { createDocumentStoreRouter } from './document-store.js';
import { createWorkspaceStoreRouter } from './workspace-store.js';
import { featureFlags } from '../src/configuration.js';
import { createManagedAssetService } from './managed-assets-router.mjs';
import { normalizePolicy } from '../src/knowledge/policy.js';

type Cavern = { path: string; name: string; cavernGuid: string; session: string };
type Preferences = { lastCavernPath?: string; recentCaverns: Array<Omit<Cavern, 'session'>> };
const run = promisify(execFile);
const fail = (message: string, status = 409): never => { throw Object.assign(new Error(message), { status }); };
const appHome = () => process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support', 'Mutable')
  : process.platform === 'win32' ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Mutable')
  : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'mutable');

export function createCavernLifecycle(options: { stateFile?: string } = {}) {
  const stateFile = options.stateFile || path.join(appHome(), 'caverns.json');
  const router = Router();
  let preferences: Preferences = { recentCaverns: [] }, loaded = false, recovery: { path: string; error: string } | undefined;
  let current: Cavern | undefined, runtime: ReturnType<typeof stores> | undefined, switching = false;
  let requests = 0, drain: (() => void) | undefined, tail = Promise.resolve();
  const serial = <T>(action: () => Promise<T>): Promise<T> => {
    const work = tail.then(action); tail = work.then(() => {}, () => {}); return work;
  };
  const load = async () => {
    if (loaded) return;
    try {
      const value = JSON.parse(await fs.readFile(stateFile, 'utf8'));
      if (!Array.isArray(value.recentCaverns) || (value.lastCavernPath !== undefined && typeof value.lastCavernPath !== 'string')) fail('Cavern preferences are invalid.');
      preferences = value;
    } catch (error) { if ((error as any).code !== 'ENOENT') throw error; }
    loaded = true;
  };
  const persist = async (value: Preferences) => {
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    const temporary = `${stateFile}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' }); await fs.rename(temporary, stateFile); }
    finally { await fs.unlink(temporary).catch(() => {}); }
    preferences = value;
  };
  const resolve = (input: unknown) => {
    if (typeof input !== 'string' || !input.trim() || input.includes('\0')) return fail('Choose a Cavern folder.', 400);
    // Relative paths are explicitly supplied paths, always relative to the project.
    const expanded = input === '~' ? os.homedir() : input.startsWith('~/') ? path.join(os.homedir(), input.slice(2)) : input;
    return path.resolve(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), expanded);
  };
  const inspect = async (input: unknown) => {
    let target = resolve(input);
    try {
      if (!(await fs.stat(target)).isDirectory()) fail('This location is not a folder.');
      target = await fs.realpath(target);
      await fs.access(target, constants.R_OK | constants.W_OK | constants.X_OK);
      let established = false;
      try { if (!(await fs.lstat(path.join(target, '.mutable'))).isDirectory()) fail('The .mutable location is not a directory.'); established = true; }
      catch (error) { if ((error as any).code !== 'ENOENT') throw error; }
      // PhextVFS Phase 4: a phext-mode Cavern whose knowledge has been
      // unraveled may have no .mutable at all; the Cavern phext itself
      // is the established marker then.
      if (!established && featureFlags.phextVfs) {
        try { if ((await fs.lstat(path.join(target, 'cavern.phext'))).isFile()) established = true; }
        catch (error) { if ((error as any).code !== 'ENOENT') throw error; }
      }
      return { path: target, name: path.basename(target), state: established ? 'cavern' : 'folder' };
    } catch (error) {
      if ((error as any).code === 'ENOENT') return { path: target, name: path.basename(target), state: 'missing' };
      throw error;
    }
  };
  function stores(root: string) {
    const sql = new SqliteKnowledgeHost({ root, entitiesEnabled: featureFlags.sqliteEntities, semanticServicesEnabled: featureFlags.sqliteSemanticServices, thesisEnabled: featureFlags.thesis, cardexEnabled: featureFlags.cardex, verifyCardexImage:async ref=>{if(!assets)throw Error("Managed assets unavailable");const {manifest}=await assets.store.get(ref.assetId,ref.cavernId);if(!["image/png","image/jpeg"].includes(manifest.mediaType))throw Error("Canonical image must be PNG or JPEG");} });
    const history = createHistoryService({ root });
    // PhextVFS Phase 2: with the flag on, the gates consumers (history,
    // jobs, publications, managed assets) store into <root>/cavern.phext
    // through the stage-C gates phext backend. Registration must
    // complete before any consumer pins a directory, so establish()
    // awaits `phextReady` before the stores are used.
    // Phase 3a: the native document stores join through phext-fs
    // (server/phext-fs.mjs) — documents, pair journals and relocation
    // records — and the control stratum records which strata are
    // phext-backed.
    // Phase 4: the knowledge layer joins through the phext registry —
    // the knowledge worker and host resolve phext mode from it, and
    // the canonical records live in L3 (SQLite survives only as an
    // ephemeral replica in temp).
    let phextVfs: PhextVFS | undefined, phextReady: Promise<void> | undefined;
    if (featureFlags.phextVfs) {
      phextVfs = PhextVFS.openOrCreate(path.join(root, 'cavern.phext'));
      const vfs = phextVfs;
      phextReady = (async () => {
        const gates = await import(pathToFileURL(path.resolve('scripts/stage-c-gates/filesystem.mjs')).href);
        gates.registerPhextBackend({ root, vfs });
        const phextFs = await import(pathToFileURL(path.resolve('server/phext-fs.mjs')).href);
        phextFs.registerPhextFs({ root, vfs });
        const knowledge = await import(pathToFileURL(path.resolve('src/knowledge-sqlite/phext-registry.mjs')).href);
        knowledge.registerPhextKnowledge({ root, phextPath: path.join(root, 'cavern.phext'), vfs });
        // Phase 5: a migrated Cavern's strata record carries its
        // remaining-on-disk list (Phase 3b honesty); preserve it
        // across opens instead of overwriting it with an empty list.
        let preservedOnDisk: unknown[] = [];
        try {
          const previous = JSON.parse(vfs.readTextFile('/.control/phext-strata.json'));
          if (Array.isArray(previous?.onDisk)) preservedOnDisk = previous.onDisk;
        } catch { /* a phext-born Cavern has no prior record */ }
        vfs.writeFile('/.control/phext-strata.json', JSON.stringify({
          v: 1,
          phextBacked: { documents: 1, pairJournals: 2, knowledge: 3, history: 4, services: 5, assets: 6, control: 7, legacyDocumentStores: 1, documentSavesJournal: 3, uploads: 1 },
          onDisk: preservedOnDisk,
        }));
        vfs.flush();
      })();
    }
    const coordinate = <T>(action: () => Promise<T>) => sql.foreground(action);
    const api = Router();
    // Applications share the root Cavern; they may still browse its subfolders.
    api.use((req, res, next) => {
      if (req.body?.vault !== undefined && req.body.vault !== '.') { res.status(409).json({ Success: false, Error: 'Use the current Cavern. Open another Cavern from the Mutable system control.' }); return; }
      next();
    });
    api.use('/sqlite/knowledge', sql.router());
    api.use('/history', history.router);
    if (featureFlags.nativeDocumentPersistence) api.use('/native', createNativeDocumentStoreRouter({ root, coordinate, defaultVault: '.', establishVault: vault => sql.establish(vault) }));
    api.use(createDocumentStoreRouter({ root, coordinate, history }));
    // Workspace files are ordinary files within this same Cavern.
    api.use(createWorkspaceStoreRouter({ documentRoot: root, workspaceRoot: root, coordinate }));
    let assets: ReturnType<typeof createManagedAssetService> | undefined;
    let services: ReturnType<typeof createApplicationServiceHost> | undefined;
    api.use('/services', (req,res,next)=>services ? services.router(req,res,next) : res.status(404).json({Success:false,Error:'Application services unavailable'}));
    api.use('/assets', (req, res, next) => assets ? assets.router(req, res, next) : res.status(409).json({ Success: false, Error: 'Managed assets are unavailable.' }));
    let indexLease: string | undefined;
    let indexPolicy: ReturnType<typeof normalizePolicy> | undefined;
    let indexWork: ReturnType<typeof sql.status> | undefined;
    const indexStatus = () => {
      if (indexWork) return indexWork;
      // Browser polling stops while closed/asleep. The host deliberately expires
      // idle leases; retain the policy and reacquire instead of blocking startup.
      const read = async () => {
        if (indexLease) {
          try { return await sql.status(indexLease); }
          catch (error) {
            if (!(error instanceof Error) || error.message !== 'SQLite lease expired') throw error;
            indexLease = undefined;
          }
        }
        indexLease = (await sql.acquire('.', indexPolicy!)).lease;
        return sql.status(indexLease);
      };
      // Startup and status requests can overlap; only one replacement lease is needed.
      indexWork = read().finally(() => { indexWork = undefined; });
      return indexWork;
    };
    return { api, sql, phextReady, phextVfs,
      async activateAssets(cavern: Cavern) {
        if(featureFlags.applicationServices)services=createApplicationServiceHost({root,cavernId:cavern.cavernGuid,nativeEnabled:featureFlags.nativeDocumentPersistence,publicationEnabled:featureFlags.webPublishing,academicEnabled:featureFlags.academicResourceLoaders,iiifEnabled:featureFlags.iiifResourceLoaders,crossResourceEnabled:featureFlags.crossResourceLoaders,structuredEnabled:featureFlags.structuredResources,deterministicEnabled:featureFlags.deterministicAcademicResources,webEnabled:featureFlags.webResourceViewers,everydayEnabled:featureFlags.everydayWebResources,academic:(request,signal)=>sql.academic(request,signal),assets:()=>assets?.store,knowledge:(request,signal)=>sql.entityLookup({vault:'.',request},signal,true)});
        if (featureFlags.managedAssetClipboard) { assets = createManagedAssetService({ root, cavernId: cavern.cavernGuid, session: cavern.session,crossResourceEnabled:featureFlags.crossResourceLoaders,structuredEnabled:featureFlags.structuredResources,deterministicEnabled:featureFlags.deterministicAcademicResources,webEnabled:featureFlags.webResourceViewers,inspectOriginal:(bytes,mediaType,signal)=>{if(!services)throw Error('Application services unavailable');return services.executor.run(['application/xml','application/epub+zip','application/x-bibtex','application/x-research-info-systems'].includes(mediaType)?{kind:'academic-original-inspect',bytes,mediaType}:mediaType==='application/pdf'?{kind:'pdf-inspect',bytes}:{kind:'json-inspect',bytes},signal);} }); return assets.recover(); } },
      async index(policy: any) { indexPolicy ??= normalizePolicy(policy); return indexStatus(); },
      async status() { return indexPolicy ? indexStatus() : undefined; },
      async close() { await services?.close(); await assets?.close(); await indexWork?.catch(() => {}); await sql.close(); await history.dispose(); if (phextVfs) { await phextReady?.catch(() => {}); const phextFs = await import(pathToFileURL(path.resolve('server/phext-fs.mjs')).href); phextFs.unregisterPhextFs(root); const knowledge = await import(pathToFileURL(path.resolve('src/knowledge-sqlite/phext-registry.mjs')).href); knowledge.unregisterPhextKnowledge(root); const gates = await import(pathToFileURL(path.resolve('scripts/stage-c-gates/filesystem.mjs')).href); await gates.unregisterPhextBackend(root); phextVfs.close(); } },
    };
  }
  const establish = async (input: unknown, intent: unknown, confirmed = false) => {
    await load();
    let target = await inspect(input);
    if (target.state === 'missing') {
      if (intent !== 'create') fail('The Cavern folder could not be found.');
      // Only create the named child of an existing, explicitly selected parent.
      await fs.access(path.dirname(target.path), constants.W_OK | constants.X_OK);
      let created = false;
      try { await fs.mkdir(target.path); created = true; } catch (error) { if ((error as any).code !== 'EEXIST') throw error; }
      target = await inspect(target.path);
      // A competing creator requires the same ordinary-folder confirmation.
      if (target.state === 'missing') fail('The Cavern folder could not be created.');
      if (!created && target.state === 'folder' && !confirmed) return { confirmation: true, target };
    } else if (target.state === 'folder' && !confirmed) return { confirmation: true, target };
    if (current?.path === target.path) return { current };
    switching = true;
    let next: ReturnType<typeof stores> | undefined;
    try {
      if (requests) await new Promise<void>(done => { drain = done; });
      // Establish/open with the existing SQLite foundation; no replacement metadata.
      next = stores(target.path);
      await next.phextReady;
      const established = await next.sql.establish('.');
      const selected: Cavern = { path: target.path, name: target.name, cavernGuid: established.vaultGuid, session: randomUUID() };
      const assetRecovery = await next.activateAssets(selected);
      if (assetRecovery?.diagnostics.length) console.warn('Managed asset recovery requires review:', assetRecovery.diagnostics);
      await persist({ lastCavernPath: selected.path, recentCaverns: [
        { path: selected.path, name: selected.name, cavernGuid: selected.cavernGuid },
        ...preferences.recentCaverns.filter(c => c.cavernGuid !== selected.cavernGuid && c.path !== selected.path),
      ].slice(0, 8) });
      await runtime?.close();
      runtime = next; next = undefined; current = selected; recovery = undefined;
      // Phase 5: Cavern-scoped state lives in the Cavern's own L7
      // record — last-opened for THIS Cavern travels with it.
      // `caverns.json` stays server installation state. Best-effort:
      // a state record must never fail an open.
      if (runtime.phextVfs) {
        try {
          const vfs = runtime.phextVfs;
          let state: Record<string, unknown> = { v: 1 };
          try { state = { ...JSON.parse(vfs.readTextFile('/.control/cavern-state.json')) }; } catch { /* first open */ }
          vfs.writeFile('/.control/cavern-state.json', JSON.stringify({
            ...state, v: 1, cavernGuid: selected.cavernGuid, lastOpenedUtc: new Date().toISOString(),
          }));
          vfs.flush();
        } catch (error) { console.warn('Cavern state record was not updated:', error); }
      }
      return { current, alreadyCavern: target.state === 'cavern' };
    } finally { await next?.close(); switching = false; }
  };
  const view = async () => ({ current, recovery, recentCaverns: preferences.recentCaverns, index: await runtime?.status() });
  const route = (method: 'get' | 'post', name: string, action: (req: any) => Promise<any>) => router[method](name, async (req, res) => {
    try { res.json({ Success: true, Data: await action(req) }); }
    catch (error) { res.status((error as any).status || 409).json({ Success: false, Error: (error as Error).message }); }
  });
  route('post', '/startup', () => serial(async () => {
    await load();
    if (!current && preferences.lastCavernPath && !recovery) {
      try {
        const target = await inspect(preferences.lastCavernPath);
        if (target.state !== 'cavern') fail('The previous Cavern is missing or no longer contains Mutable infrastructure.');
        await establish(target.path, 'open');
      } catch (error) { recovery = { path: preferences.lastCavernPath, error: (error as Error).message }; }
    }
    return view();
  }));
  route('get', '/status', async () => { await load(); return view(); });
  route('post', '/inspect', req => inspect(req.body.path));
  route('post', '/establish', req => serial(async () => ({ ...await establish(req.body.path, req.body.intent, req.body.confirmed === true), ...await view() })));
  route('post', '/index', req => serial(async () => {
    if (!runtime || !current || req.body.session !== current.session) fail('The current Cavern changed.');
    return runtime.index(req.body.policy);
  }));
  route('post', '/select-folder', async () => {
    try {
      let selected: string;
      if (process.platform === 'darwin') selected = (await run('osascript', ['-e', 'POSIX path of (choose folder with prompt "Choose a folder for Mutable OS")'])).stdout;
      else if (process.platform === 'win32') selected = (await run('powershell.exe', ['-NoProfile', '-STA', '-Command', 'Add-Type -AssemblyName System.Windows.Forms; $picker = New-Object System.Windows.Forms.FolderBrowserDialog; if ($picker.ShowDialog() -eq "OK") { $picker.SelectedPath }'])).stdout;
      else selected = (await run('zenity', ['--file-selection', '--directory', '--title=Choose a folder for Mutable OS'])).stdout;
      return { path: selected.trim() || undefined };
    } catch (error) {
      if (String((error as any).stderr).includes('(-128)') || (process.platform === 'linux' && (error as any).code === 1)) return { cancelled: true };
      fail('The system folder picker could not open. Enter the folder path below.');
    }
  });
  route('post', '/reveal', async () => {
    if (!current) fail('Choose a Cavern first.');
    await run(process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open', [current.path]);
    return { revealed: true };
  });
  // ---- PhextVFS Phase 5: the exit ramps (migration, export,
  // download, open-from-phext). All behind the phextVfs flag; the
  // work itself lives in server/phext-cavern-transfer.mjs, loaded by
  // URL like the other phext modules.
  const transferModule = () => import(pathToFileURL(path.resolve('server/phext-cavern-transfer.mjs')).href);
  const requirePhextVfs = () => { if (!featureFlags.phextVfs) fail('This Cavern operation requires the phextVfs feature flag.'); };
  route('post', '/migrate', req => serial(async () => {
    requirePhextVfs();
    const target = resolve(req.body.path);
    if (current?.path === target) fail('Close the Cavern before migrating it.');
    const inspected = await inspect(target);
    if (inspected.state !== 'cavern') fail('Only an established disk-mode Cavern can be migrated.');
    const transfer = await transferModule();
    return transfer.migrateCavernToPhext({ root: target, openVfs: PhextVFS });
  }));
  route('post', '/export-phext', req => serial(async () => {
    requirePhextVfs();
    const source = resolve(req.body.path);
    const destination = resolve(req.body.destination);
    const transfer = await transferModule();
    return transfer.exportPhextCavernToDisk({ phextPath: path.join(source, 'cavern.phext'), openVfs: PhextVFS, destination });
  }));
  router.get('/download', async (req, res) => {
    try {
      requirePhextVfs();
      if (!current || !runtime) fail('Choose a Cavern first.');
      await runtime.phextReady;
      const vfs = runtime.phextVfs;
      if (!vfs) fail('The current Cavern is not phext-backed.');
      // Download serves the CURRENT state: flush first, then read
      // the phext from disk. The seal is produced from those
      // uncompressed bytes, at export time only (safe model).
      vfs.flush();
      const bytes = await fs.readFile(path.join(current.path, 'cavern.phext'));
      const format = req.query.format === 'xz' ? 'xz' : 'phext';
      let body: Buffer = bytes;
      let filename = `${current.name}.phext`;
      if (format === 'xz') {
        const transfer = await transferModule();
        body = await transfer.sealPhext(bytes);
        filename = `${current.name}.phext.xz`;
      }
      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
        'X-Cavern-Guid': current.cavernGuid,
        'X-Cavern-Format': format,
        'X-Cavern-Phext-Bytes': String(bytes.length),
        'X-Cavern-Phext-Sha256': createHash('sha256').update(bytes).digest('hex'),
        ...(format === 'xz' ? { 'X-Cavern-Sealed-Bytes': String(body.length) } : {}),
      });
      res.send(body);
    } catch (error) {
      res.status((error as any).status || 409).json({ Success: false, Error: (error as Error).message });
    }
  });
  const phextUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 * 1024, files: 1 } }).single('phext');
  router.post('/open-phext', (req, res) => {
    if (!featureFlags.phextVfs) { res.status(409).json({ Success: false, Error: 'Opening a Cavern from a phext requires the phextVfs feature flag.' }); return; }
    phextUpload(req, res, error => {
      if (error) { res.status(409).json({ Success: false, Error: error.message }); return; }
      void serial(async () => {
        const file = (req as any).file as { buffer: Buffer; originalname: string } | undefined;
        if (!file) fail('Choose a .phext or .phext.xz file to open.', 400);
        const target = resolve((req.body as any)?.target);
        const transfer = await transferModule();
        const installed = await transfer.installPhextIntoFolder({
          bytes: file.buffer, filename: file.originalname, targetDir: target, openVfs: PhextVFS,
        });
        const opened = await establish(target, 'open');
        return { ...opened, ...(await view()), vaultGuid: installed.vaultGuid, sealed: installed.sealed };
      }).then(data => res.json({ Success: true, Data: data }))
        .catch(e => res.status((e as any).status || 409).json({ Success: false, Error: (e as Error).message }));
    });
  });
  const middleware: RequestHandler = (req, res, next) => {
    if (!runtime || !current || switching) { res.status(409).json({ Success: false, Error: 'Establish a Cavern before entering Mutable OS.' }); return; }
    if (req.header('X-Mutable-Cavern') !== current.session) { res.status(409).json({ Success: false, Error: 'The current Cavern changed. Reopen Mutable OS.' }); return; }
    requests++;
    let finished = false;
    const finish = () => { if (finished) return; finished = true; if (--requests === 0) { drain?.(); drain = undefined; } };
    res.once('finish', finish); res.once('close', finish);
    runtime.api(req, res, next);
  };
  return { router, middleware, current: () => current, async close() { await tail; await runtime?.close(); } };
}
