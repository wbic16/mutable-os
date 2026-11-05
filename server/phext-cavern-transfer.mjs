/**
 * PhextVFS Phase 5 — Cavern migration, export, and the exit ramps.
 *
 * The one-phext coverage (Phases 1–4) is only real if a Cavern can get
 * IN and OUT of the phext without a cliff:
 *
 * - `migrateCavernToPhext` converts a closed disk-mode Cavern in
 *   place: walk the disk tree → write the VFS strata → verify every
 *   copied file's SHA-256 against the L9 index (a fresh VFS open,
 *   which also verifies the L9 checksum series) → store-level smoke
 *   reads → write the migration record into L7 → publish the phext
 *   and rename the old `.mutable` home to `.mutable-disk-fallback/`
 *   (the 4.6 converter's precedent: the operator keeps the renamed
 *   home as the fallback). The original document tree is preserved
 *   in place but inactive. Any failure before publish discards the
 *   partial phext and leaves the disk Cavern untouched.
 * - `exportPhextCavernToDisk` is the reverse ramp: a phext-mode
 *   Cavern written back out to a complete disk-mode tree, verified
 *   by the same hash discipline (files) and the 4.6 knowledge dumps
 *   (canonical state diff-equal).
 * - `sealPhext` / `unsealPhext` implement the safe model (media
 *   analysis §B′): the xz seal — `--check=sha256` — is produced from
 *   the uncompressed phext at export time only. It is never the
 *   working format and never applied per save. `unsealPhext`
 *   verifies the seal's integrity (`xz -t`, which checks the
 *   embedded SHA-256) before decompressing; a corrupt seal is
 *   refused before anything is written anywhere.
 * - `installPhextIntoFolder` is Open-Cavern-from-phext: given the
 *   received bytes (raw `.phext` or sealed `.phext.xz`) and a target
 *   folder, unlock if sealed, write `<folder>/cavern.phext`, and
 *   sanity-open the VFS (L9 verified at open; strata record read;
 *   a knowledge-bearing Cavern must carry its knowledge control
 *   record). The caller then hands the folder to the normal
 *   establish flow.
 *
 * HONESTY (Phase 3b pending): the legacy document/workspace stores
 * and the uploads endpoint are NOT phext-backed at runtime yet.
 * Their files are copied with the document tree during migration,
 * but the migration and strata records list them as remaining
 * on-disk strata — nothing here claims a fully-one-phext Cavern.
 * `caverns.json` is server installation state and is never touched.
 *
 * The PhextVFS class is passed in as `openVfs` (its statics: open /
 * create / openOrCreate) because this module is plain .mjs loaded by
 * URL from the source tree — the house pattern (phext-fs, gates) —
 * while PhextVFS itself is TypeScript owned by the lifecycle.
 */
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { isNativeDocumentName } from '../src/persistence/document-file-names.mjs';
import { sliceNativeEnvelope } from './phext-fs.mjs';
import { PhextKnowledgeStore } from '../src/knowledge-sqlite/phext-store.mjs';
import {
  convertDiskKnowledgeToPhext, dumpDiskKnowledge, dumpPhextKnowledge, exportPhextKnowledge,
} from '../src/knowledge-sqlite/phext-convert.mjs';

const run = promisify(execFile);
const sha256Hex = data => createHash('sha256').update(data).digest('hex');
const XZ_MAX_BUFFER = 1 << 30;

export const MIGRATION_RECORD_PATH = '/.control/phext-migration.json';
export const STRATA_RECORD_PATH = '/.control/phext-strata.json';
export const CAVERN_STATE_PATH = '/.control/cavern-state.json';
export const FALLBACK_DIRNAME = '.mutable-disk-fallback';

/** Strata whose runtime stores are phext-backed (Phases 2, 3a, 4). */
export const PHEXT_BACKED_STRATA = Object.freeze({
  documents: 1, pairJournals: 2, knowledge: 3, history: 4, services: 5, assets: 6, control: 7,
});

/** The standing remainder, listed verbatim in every migration/strata record. */
export const REMAINING_ON_DISK = Object.freeze([
  'legacy document/workspace stores — files copied with the document tree, runtime still disk-backed (Phase 3b pending)',
  'uploads/ — legacy upload endpoint, still disk-backed (Phase 3b pending)',
]);

const BREAK_BYTES = new Set([0x01, 0x17, 0x18, 0x19, 0x1a, 0x1c, 0x1d, 0x1e, 0x1f]);

/** Mirrors PhextVFS's text rule: valid UTF-8 and no dimension break bytes. */
function isTextSafe(bytes) {
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return false; }
  for (const byte of bytes) if (BREAK_BYTES.has(byte)) return false;
  return true;
}

/** Write one file into the VFS exactly as the phext-fs facade would. */
function writeVirtualFile(vfs, vfsPath, bytes) {
  const name = vfsPath.slice(vfsPath.lastIndexOf('/') + 1);
  const slices = isNativeDocumentName(name) ? sliceNativeEnvelope(bytes) : undefined;
  if (slices) vfs.writeFile(vfsPath, bytes, { format: 'text', slices });
  else vfs.writeFile(vfsPath, bytes, { format: isTextSafe(bytes) ? 'text' : 'binary' });
}

/** Key-order-insensitive canonical form for dump comparisons. */
function canon(value) {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canon(value[k])]));
  }
  return value;
}
const canonText = value => JSON.stringify(canon(value));

// ------------------------------------------------------------------ xz seal

/**
 * Seal an uncompressed phext for transport/archive: xz -6 with the
 * SHA-256 integrity check embedded. Export-time only (safe model).
 */
export async function sealPhext(phextBytes) {
  const bytes = Buffer.isBuffer(phextBytes) ? phextBytes : Buffer.from(phextBytes);
  const { stdout } = await run('xz', ['-z', '-c', '-6', '--check=sha256'], {
    input: bytes, maxBuffer: XZ_MAX_BUFFER,
  }).catch(error => { throw Error(`Sealing the Cavern phext failed: ${error.message}`); });
  return Buffer.from(stdout);
}

/** Verify a seal's integrity without decompressing (`xz -t`). */
export async function verifySeal(sealedBytes) {
  const bytes = Buffer.isBuffer(sealedBytes) ? sealedBytes : Buffer.from(sealedBytes);
  await run('xz', ['-t'], { input: bytes, maxBuffer: XZ_MAX_BUFFER })
    .catch(error => { throw Error(`The sealed phext failed its integrity check and was refused: ${error.message}`); });
  return true;
}

/** Unlock a sealed phext: integrity is verified BEFORE decompression. */
export async function unsealPhext(sealedBytes) {
  const bytes = Buffer.isBuffer(sealedBytes) ? sealedBytes : Buffer.from(sealedBytes);
  await verifySeal(bytes);
  const { stdout } = await run('xz', ['-d', '-c'], { input: bytes, maxBuffer: XZ_MAX_BUFFER })
    .catch(error => { throw Error(`Unlocking the sealed phext failed: ${error.message}`); });
  return Buffer.from(stdout);
}

// ------------------------------------------------------------- disk walking

const OPERATIONAL_MUTABLE_FILES = new Set(['writer.lock', 'writer.lock.holder', 'discovery-cache.json']);
const GATES_MUTABLE_DIRS = new Set(['jobs', 'publications', 'assets']);

/**
 * Classify one Cavern-relative file for migration:
 * copy (a VFS stratum writer takes it), knowledge (the 4.6
 * converter), skip (operational, no data), remaining (stays on disk,
 * honestly recorded), or refuse (a state migration cannot proceed
 * past — WAL sidecars of a live database).
 */
function classify(relPosix) {
  const parts = relPosix.split('/');
  if (parts[0] === '.mutable') {
    if (parts.length === 2 && (parts[1] === 'mutable.db' || parts[1] === 'audit.db')) return 'knowledge';
    if (parts.length === 2 && /^(mutable|audit)\.db-(wal|shm|journal)$/.test(parts[1])) return 'refuse';
    if (GATES_MUTABLE_DIRS.has(parts[1])) return 'copy';
    if (parts.length === 2 && OPERATIONAL_MUTABLE_FILES.has(parts[1])) return 'skip';
    return 'remaining';
  }
  if (parts[0] === 'uploads') return 'remaining';
  if (parts[0] === FALLBACK_DIRNAME) return 'remaining';
  return 'copy';
}

/** Recursively list a disk tree: [{rel, abs, size}] sorted by rel. */
function walkDiskTree(root) {
  const out = [];
  const walk = (dir, relBase) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.isFile()) out.push({ rel, abs, size: fs.statSync(abs).size, symlink: false });
      else if (entry.isSymbolicLink()) out.push({ rel, abs, size: 0, symlink: true });
    }
  };
  walk(root, '');
  return out;
}

const remainingSummary = manifest => {
  const notes = [...REMAINING_ON_DISK];
  const specific = new Set();
  for (const entry of manifest) {
    if (entry.action !== 'remaining') continue;
    if (entry.path.startsWith('.mutable/document-saves/')) specific.add('.mutable/document-saves/ — recognized-document journal, remains on disk');
    else if (!entry.path.startsWith('uploads/')) specific.add(entry.path);
  }
  return [...notes, ...specific];
};

// --------------------------------------------------------------- migration

/**
 * Convert a CLOSED disk-mode Cavern at `root` to phext mode.
 * `openVfs` is the PhextVFS class. Returns the verification report
 * (also written into the phext at the migration record path).
 * Refusals: a phext already exists (already migrated / phext-born),
 * no disk knowledge state, a leftover fallback, live WAL sidecars.
 * On any failure the partial phext is discarded and the disk Cavern
 * is left exactly as found.
 */
export async function migrateCavernToPhext({ root, openVfs, now = () => new Date().toISOString() }) {
  const cavernRoot = path.resolve(root);
  const phextPath = path.join(cavernRoot, 'cavern.phext');
  const mutableHome = path.join(cavernRoot, '.mutable');
  const mutableFile = path.join(mutableHome, 'mutable.db');
  const auditFile = path.join(mutableHome, 'audit.db');
  const fallbackPath = path.join(cavernRoot, FALLBACK_DIRNAME);

  if (fs.existsSync(phextPath)) {
    throw Error('This Cavern already has a cavern.phext; migration refused (already migrated or phext-born)');
  }
  if (fs.existsSync(fallbackPath)) {
    throw Error(`A previous migration fallback (${FALLBACK_DIRNAME}) already exists; migration refused`);
  }
  if (!fs.existsSync(mutableFile)) {
    throw Error('This folder has no disk knowledge state (.mutable/mutable.db); there is no disk-mode Cavern to migrate');
  }

  // Walk + hash the whole source tree first: the manifest is the
  // contract every later verification checks against.
  const walked = walkDiskTree(cavernRoot);
  const manifest = [];
  for (const file of walked) {
    if (file.symlink) {
      manifest.push({ path: file.rel, size: 0, sha256: null, action: 'remaining', note: 'symlink — not followed, stays on disk' });
      continue;
    }
    const action = classify(file.rel);
    if (action === 'refuse') {
      throw Error(`The knowledge database at ${file.rel} has a live WAL sidecar; open and close the Cavern once, then migrate`);
    }
    manifest.push({ path: file.rel, size: file.size, sha256: sha256Hex(fs.readFileSync(file.abs)), action });
  }
  const sourceTreeSha256 = sha256Hex(Buffer.from(JSON.stringify(manifest.map(e => [e.path, e.sha256]))));
  const copied = manifest.filter(e => e.action === 'copy');

  const temporaryPath = path.join(cavernRoot, `cavern.phext.migrating-${randomUUID()}`);
  const discardTemporary = () => {
    for (const candidate of [temporaryPath, `${temporaryPath}.bak`]) {
      try { fs.unlinkSync(candidate); } catch { /* already gone */ }
    }
  };

  let knowledgeReport;
  try {
    // ---- write the strata
    let vfs = openVfs.create(temporaryPath);
    try {
      for (const entry of copied) writeVirtualFile(vfs, `/${entry.path}`, fs.readFileSync(path.join(cavernRoot, entry.path)));
      const store = new PhextKnowledgeStore(vfs);
      knowledgeReport = convertDiskKnowledgeToPhext({
        mutableFile,
        auditFile: fs.existsSync(auditFile) ? auditFile : undefined,
        store,
      });
      vfs.flush();
    } finally { vfs.close(); }

    // ---- verify from a fresh open (L9 checksums verified at open)
    vfs = openVfs.open(temporaryPath);
    try {
      for (const entry of copied) {
        const stat = vfs.stat(`/${entry.path}`);
        if (!stat || stat.type !== 'file' || stat.sha256 !== entry.sha256) {
          throw Error(`Migration verification failed for ${entry.path}: phext index hash does not match the disk source`);
        }
      }
      // Store-level smoke: a document, a history record, knowledge.
      const smoke = {};
      const documentEntry = copied.find(e => !e.path.startsWith('.mutable/') && !e.path.includes('/.memory/') && !e.path.startsWith('.memory/'));
      if (documentEntry) {
        if (!vfs.readFile(`/${documentEntry.path}`).equals(fs.readFileSync(path.join(cavernRoot, documentEntry.path)))) {
          throw Error(`Migration smoke read failed for document ${documentEntry.path}`);
        }
        smoke.document = documentEntry.path;
      }
      const historyEntry = copied.find(e => e.path.includes('/.memory/') || e.path.startsWith('.memory/'));
      if (historyEntry) {
        if (!vfs.readFile(`/${historyEntry.path}`).equals(fs.readFileSync(path.join(cavernRoot, historyEntry.path)))) {
          throw Error(`Migration smoke read failed for history record ${historyEntry.path}`);
        }
        smoke.history = historyEntry.path;
      }
      const store = new PhextKnowledgeStore(vfs);
      const control = store.readControl();
      if (!control || control.vaultGuid !== knowledgeReport.vaultGuid) {
        throw Error('Migration smoke read failed: knowledge control record missing or identity changed');
      }
      const phextDump = dumpPhextKnowledge(store);
      const diskDump = dumpDiskKnowledge({ mutableFile, auditFile: fs.existsSync(auditFile) ? auditFile : undefined });
      if (canonText(phextDump) !== canonText(diskDump)) {
        throw Error('Migration verification failed: phext knowledge dump differs from the disk dump');
      }
      smoke.knowledge = { vaultGuid: control.vaultGuid, entities: phextDump.tables.Entity.length };
      var smokeReport = smoke;
    } finally { vfs.close(); }

    // ---- record provenance + state in L7, then publish
    const migratedUtc = now();
    const onDisk = remainingSummary(manifest);
    const migrationRecord = {
      v: 1,
      format: 'phext-cavern-migration',
      migratedUtc,
      vaultGuid: knowledgeReport.vaultGuid,
      sourceTreeSha256,
      manifest,
      knowledge: {
        tables: Object.fromEntries(Object.entries(knowledgeReport.tables).map(([table, r]) => [table, r.count])),
        propositions: knowledgeReport.propositions.count,
        outbox: knowledgeReport.outbox.count,
        auditMutations: knowledgeReport.audit.mutations,
        auditEvents: knowledgeReport.audit.events,
      },
      filesCopied: copied.length,
      bytesCopied: copied.reduce((sum, e) => sum + e.size, 0),
      smoke: smokeReport,
      converterVersions: { phextVfs: 1, knowledge: 'phext-knowledge-v1', migration: 'phase5' },
      fallback: FALLBACK_DIRNAME,
      onDisk,
    };
    vfs = openVfs.open(temporaryPath);
    try {
      vfs.writeFile(STRATA_RECORD_PATH, JSON.stringify({ v: 1, phextBacked: { ...PHEXT_BACKED_STRATA }, onDisk, migrated: true }));
      vfs.writeFile(MIGRATION_RECORD_PATH, JSON.stringify(migrationRecord));
      vfs.writeFile(CAVERN_STATE_PATH, JSON.stringify({
        v: 1, cavernGuid: knowledgeReport.vaultGuid, migratedUtc, lastOpenedUtc: null,
      }));
      vfs.flush();
    } finally { vfs.close(); }

    // Publish: the phext first, then the knowledge home aside. If
    // the rename aside fails, the phext rename is rolled back so the
    // Cavern is never half-migrated.
    fs.renameSync(temporaryPath, phextPath);
    try { fs.unlinkSync(`${temporaryPath}.bak`); } catch { /* no prior generation */ }
    try {
      fs.renameSync(mutableHome, fallbackPath);
    } catch (error) {
      try { fs.renameSync(phextPath, temporaryPath); } catch { /* report the original failure */ }
      discardTemporary();
      throw Error(`Migration could not move .mutable aside as the fallback; aborted with the disk Cavern untouched: ${error.message}`);
    }
    return { ...migrationRecord, phextPath, fallbackPath, verified: true };
  } catch (error) {
    discardTemporary();
    throw error;
  }
}

// ------------------------------------------------------------------ export

/** L3 directories + the control file: knowledge export handles these. */
const L3_TOP_LEVEL = new Set([
  'knowledge.json', 'entities', 'aliases', 'relationships', 'times', 'claims',
  'claim-participants', 'claim-qualifiers', 'claim-evidence', 'datasets',
  'datapoints', 'datapoint-dimensions', 'dataset-memberships', 'identities',
  'snapshots', 'reviews', 'actors', 'propositions', 'outbox', 'audit',
]);

/** Recursively list every file in a VFS: [vfsPath]. */
function walkVfs(vfs) {
  const out = [];
  const walk = dir => {
    for (const entry of vfs.listDir(dir)) {
      const child = dir === '/' ? `/${entry.name}` : `${dir}/${entry.name}`;
      if (entry.type === 'directory') walk(child);
      else out.push(child);
    }
  };
  walk('/');
  return out.sort();
}

/**
 * Write a phext-mode Cavern back out to a complete disk-mode tree
 * at `destination` (which must not exist yet). Verified: every
 * exported file's on-disk SHA-256 equals its L9 index hash, and the
 * exported knowledge dump is diff-equal to the phext dump.
 */
export async function exportPhextCavernToDisk({ phextPath, openVfs, destination }) {
  if (typeof destination !== 'string' || !path.isAbsolute(destination)) {
    throw Error('Export requires an absolute destination directory');
  }
  if (fs.existsSync(destination)) throw Error('Export destination already exists; export refused');
  const vfs = openVfs.open(path.resolve(phextPath));
  try {
    const store = new PhextKnowledgeStore(vfs);
    const control = store.readControl();
    if (!control) throw Error('This phext holds no knowledge control record; there is no Cavern to export');

    fs.mkdirSync(destination, { recursive: false });
    const files = [];
    const skippedInternal = [];
    for (const vfsPath of walkVfs(vfs)) {
      if (vfsPath === '/.control' || vfsPath.startsWith('/.control/')) { skippedInternal.push(vfsPath); continue; }
      const mutableParts = vfsPath.split('/').filter(Boolean);
      if (mutableParts[0] === '.mutable' && L3_TOP_LEVEL.has(mutableParts[1])) continue; // knowledge: below
      const target = path.join(destination, vfsPath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const bytes = vfs.readFile(vfsPath);
      fs.writeFileSync(target, bytes, { flag: 'wx' });
      const stat = vfs.stat(vfsPath);
      if (sha256Hex(bytes) !== stat.sha256 || sha256Hex(fs.readFileSync(target)) !== stat.sha256) {
        throw Error(`Export verification failed for ${vfsPath}: exported bytes differ from the phext index`);
      }
      files.push({ path: vfsPath.slice(1), size: bytes.length, sha256: stat.sha256 });
    }

    // Knowledge: through the 4.6 export (a snapshot directory), then
    // the two databases take their disk-mode home in the tree.
    const snapshotParent = fs.mkdtempSync(path.join(path.dirname(destination), '.phext-export-'));
    try {
      const snapshot = exportPhextKnowledge({ store, vaultGuid: control.vaultGuid, destination: path.join(snapshotParent, 'snapshot') });
      const mutableTarget = path.join(destination, '.mutable');
      fs.mkdirSync(mutableTarget);
      for (const name of ['mutable.db', 'audit.db']) fs.copyFileSync(path.join(snapshot.directory, name), path.join(mutableTarget, name));
      var knowledgeFiles = snapshot.files;
    } finally { fs.rmSync(snapshotParent, { recursive: true, force: true }); }

    const phextDump = dumpPhextKnowledge(store);
    const diskDump = dumpDiskKnowledge({
      mutableFile: path.join(destination, '.mutable', 'mutable.db'),
      auditFile: path.join(destination, '.mutable', 'audit.db'),
    });
    if (canonText(phextDump) !== canonText(diskDump)) {
      throw Error('Export verification failed: exported knowledge dump differs from the phext dump');
    }
    return {
      verified: true, destination, vaultGuid: control.vaultGuid,
      files, fileCount: files.length, skippedInternal, knowledgeFiles,
    };
  } finally { vfs.close(); }
}

// ------------------------------------------------------------ open from phext

/**
 * Sanity-read an opened VFS: strata record (if present) and the
 * knowledge posture. A knowledge-bearing Cavern without its
 * knowledge control record is refused.
 */
function sanityCheckPhext(vfs) {
  let strata;
  try {
    const raw = vfs.readTextFile(STRATA_RECORD_PATH);
    strata = JSON.parse(raw);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw Error(`The phext's strata record is unreadable: ${error.message}`);
  }
  const store = new PhextKnowledgeStore(vfs);
  let control;
  try { control = store.readControl(); }
  catch (error) { throw Error(`The phext's knowledge control record is invalid: ${error.message}`); }
  const knowledgeBearing = !!strata?.phextBacked?.knowledge || store.hasAnyContent() || !!store.readMirroredVaultGuid();
  if (knowledgeBearing && !control) {
    throw Error('This phext carries knowledge but is missing its knowledge control record; open refused');
  }
  return { strata, vaultGuid: control?.vaultGuid ?? store.readMirroredVaultGuid() };
}

/**
 * Install a received phext (raw or sealed) into `targetDir` as its
 * `cavern.phext`, sanity-checked. Refusals: corrupt seal (before
 * anything is written), non-phext content, a target folder that is
 * non-empty with conflicting state, missing knowledge control.
 * Returns { targetDir, phextPath, vaultGuid, strata, sealed }.
 */
export async function installPhextIntoFolder({ bytes, filename = '', targetDir, openVfs }) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw Error('No phext content was received');
  const sealed = /\.xz$/i.test(filename);
  const raw = sealed ? await unsealPhext(bytes) : bytes; // a corrupt seal dies here, before any write

  const target = path.resolve(targetDir);
  const parent = path.dirname(target);
  if (!fs.existsSync(parent)) throw Error('The target folder’s parent does not exist');
  let createdFolder = false;
  if (fs.existsSync(target)) {
    const entries = fs.readdirSync(target);
    if (entries.length > 0) {
      throw Error('The target folder is not empty and may hold conflicting Cavern state; choose an empty folder');
    }
  } else {
    fs.mkdirSync(target);
    createdFolder = true;
  }
  const phextPath = path.join(target, 'cavern.phext');
  try {
    fs.writeFileSync(phextPath, raw, { flag: 'wx' });
    const vfs = openVfs.open(phextPath); // L9 manifest + checksums verified here
    try {
      const { strata, vaultGuid } = sanityCheckPhext(vfs);
      return { targetDir: target, phextPath, vaultGuid, strata, sealed };
    } finally { vfs.close(); }
  } catch (error) {
    try { fs.unlinkSync(phextPath); } catch { /* already gone */ }
    try { fs.unlinkSync(`${phextPath}.bak`); } catch { /* already gone */ }
    if (createdFolder) { try { fs.rmdirSync(target); } catch { /* leave the empty folder */ } }
    if (/no L9 manifest|Not a PhextVFS/.test(error.message)) {
      throw Error('The received file is not a Mutable Cavern phext; open refused');
    }
    throw error;
  }
}
