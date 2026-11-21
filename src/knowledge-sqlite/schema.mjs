import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const APPLICATION_IDS = Object.freeze({ mutable: 0x4d55544b, audit: 0x4d555441 });
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const migrations = Object.freeze(Object.fromEntries(Object.keys(APPLICATION_IDS).map(kind => {
  const files = kind === 'mutable' ? ['0001-foundation.sql','0002-semantic-knowledge.sql','0003-scholarly-identities.sql','0004-encyclopedia.sql','0005-iiif.sql','0006-resources.sql','0007-deterministic-academic.sql','0008-propositions.sql','0009-cardex.sql','0010-cardex-soft-delete.sql','0011-shared-cache.sql','0012-document-entity-associations.sql'] : ['0001-foundation.sql'];
  return [kind, Object.freeze(files.map((file,index) => {
    const sql = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations', kind, file), 'utf8');
    return Object.freeze({version:index+1,sql,checksum:hash(sql)});
  }))];
})));
const metadata = db => Object.fromEntries(db.prepare('SELECT key,value FROM SchemaInfo').all().map(r => [r.key, r.value]));
const structure = db => db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
const shapes = new Map();
function expectedShape(kind, version, steps) {
  const key = kind + steps.slice(0, version).map(s => s.checksum).join('');
  if (!shapes.has(key)) {
    const expected = new Database(':memory:');
    try { for (const step of steps.slice(0, version)) expected.exec(step.sql); shapes.set(key, hash(JSON.stringify(structure(expected)))); }
    finally { expected.close(); }
  }
  return shapes.get(key);
}

/** Reject unknown/corrupt/modified schemas before any migration or journal-mode change. */
export function validateSchema(db, kind, vaultGuid, steps = migrations[kind]) {
  if (!steps || db.pragma('application_id', { simple: true }) !== APPLICATION_IDS[kind]) throw Error(`Not a Mutable ${kind} database`);
  const info = metadata(db), version = Number(info.schemaVersion);
  if (!Number.isSafeInteger(version) || version < 1 || version > steps.length || db.pragma('user_version', { simple: true }) !== version) throw Error(`Unsupported ${kind} schema version`);
  if (info.databaseKind !== kind || info.authoredValueEncoding !== 'codex-authored-value-v1' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(info.vaultGuid) || vaultGuid && info.vaultGuid !== vaultGuid) throw Error('Database kind/vault identity mismatch');
  for (const step of steps.slice(0, version)) if (info[`migration:${step.version}`] !== step.checksum) throw Error(`Migration checksum mismatch (${kind}:${step.version})`);
  if (hash(JSON.stringify(structure(db))) !== expectedShape(kind, version, steps)) throw Error(`Schema structure mismatch (${kind})`);
  return { ...info, version };
}

/** Internal synchronous migration runner. No SQL is accepted by the public worker protocol. */
export function migrate(db, kind, { vaultGuid, fresh = false, steps = migrations[kind] } = {}) {
  db.pragma('foreign_keys = ON');
  const prior = fresh ? undefined : validateSchema(db, kind, vaultGuid, steps);
  if (fresh && db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").get().n) throw Error('Fresh migration requires an empty database');
  const identity = prior?.vaultGuid ?? vaultGuid ?? randomUUID();
  const start = prior?.version ?? 0;
  if (start === steps.length) return prior;
  const rebuild = kind === 'mutable' && start < 8 && steps.length >= 8;
  if (db.inTransaction) throw Error('Migration requires an independent transaction');
  if (rebuild) db.pragma('foreign_keys = OFF');
  try { db.transaction(() => {
    for (const step of steps.slice(start)) {
      db.exec(step.sql);
      const set = db.prepare('INSERT INTO SchemaInfo(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
      for (const [key, value] of Object.entries({ schemaVersion: String(step.version), databaseKind: kind, vaultGuid: identity, [`migration:${step.version}`]: step.checksum })) set.run(key, value);
      db.pragma(`application_id = ${APPLICATION_IDS[kind]}`);
      db.pragma(`user_version = ${step.version}`);
    }
    validateSchema(db, kind, identity, steps);
    if (db.pragma('foreign_key_check').length) throw Error('Migration foreign key check failed');
  }).immediate(); } finally { db.pragma('foreign_keys = ON'); }
  return validateSchema(db, kind, identity, steps);
}

export function inspectDatabase(db, kind) {
  const info = validateSchema(db, kind);
  const counts = {};
  for (const row of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND sql NOT LIKE 'CREATE VIRTUAL%' AND name NOT LIKE 'sqlite_%'").all()) {
    if (/^(BlockSearch|EntitySearch|EntityAliasSearch)_/.test(row.name)) continue;
    counts[row.name] = db.prepare(`SELECT count(*) AS n FROM "${row.name}"`).get().n;
  }
  return { kind, vaultGuid: info.vaultGuid, version: info.version, sqlite: db.prepare('SELECT sqlite_version() AS v').get().v,
    pragmas: Object.fromEntries(['foreign_keys', 'journal_mode', 'synchronous', 'busy_timeout', 'user_version', 'application_id'].map(p => [p, db.pragma(p, { simple: true })])),
    schema: structure(db), counts };
}

export function verifyDatabase(db, kind) {
  validateSchema(db, kind);
  const integrity = db.pragma('integrity_check'), foreignKeys = db.pragma('foreign_key_check');
  let fts = kind === 'audit' ? 'not-applicable' : 'not-checked-read-only';
  if (kind === 'mutable' && !db.readonly) {
    db.transaction(() => { for (const table of ['BlockSearch','EntitySearch','EntityAliasSearch']) db.prepare(`INSERT INTO ${table}(${table},rank) VALUES('integrity-check',1)`).run(); })();
    fts = 'ok';
  }
  return { ok: integrity.length === 1 && Object.values(integrity[0])[0] === 'ok' && !foreignKeys.length, integrity, foreignKeys, fts };
}

export function rebuildFts(db) {
  db.transaction(() => { for (const table of ['BlockSearch','EntitySearch','EntityAliasSearch']) db.prepare(`INSERT INTO ${table}(${table}) VALUES('rebuild')`).run(); })();
}

/** Explicit invalidation only. Reconciliation repopulates from files; never reset canonical knowledge. */
export function clearDerived(db) {
  db.transaction(() => {
    db.prepare("DELETE FROM EntityAlias WHERE origin IN ('observed','recovered')").run();
    db.prepare('DELETE FROM Resource').run();
    db.prepare('DELETE FROM IndexIssue').run();
    rebuildFts(db);
  }).immediate();
}
