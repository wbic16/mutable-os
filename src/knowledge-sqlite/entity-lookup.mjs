import { canonicalEntities } from './entities.mjs';

const fold = value => value.normalize('NFKC').toLowerCase();
const savedNotice = 'Uses saved indexed mentions; unsaved or unindexed changes are not included.';

/** A bounded, vault-owned read cache. The revision pairs data_version
 * (commits by OTHER connections) with total_changes() (commits by THIS
 * connection): the phext replica is single-connection — the worker's
 * own index updates and mutations are same-connection writes, which
 * data_version alone never reports. Same formula as reconcile.mjs's
 * sqlRevision. No file reads. */
export function createEntityLookup() {
  const cache = new Map();
  let version, bytes = 0, configured = false;
  return (db, request, check = () => {}) => {
    check();
    if (!request || !['search', 'get', 'authority-lookup'].includes(request.op)) throw Error('Unsupported Entity lookup');
    if (!configured) { db.function('entity_fold', {deterministic:true}, value => fold(value ?? '')); configured = true; }
    return db.transaction(() => {
      const revision = [db.pragma('data_version', {simple:true}), db.prepare('SELECT total_changes() AS n').get().n].join(':');
      if (revision !== version) { cache.clear(); bytes = 0; version = revision; }
      if (request.op === 'get' || request.op === 'authority-lookup') return canonicalEntities(db, request, check);
      const {query, stream, match, resourceId} = request;
      if (typeof query !== 'string' || query.length > 1000 || !['all','name','alias','mention'].includes(stream) || !['exact','partial'].includes(match) ||
          resourceId !== undefined && (typeof resourceId !== 'string' || !resourceId || resourceId.length > 512)) throw Error('Invalid Entity search');
      const normalized = fold(query), key = JSON.stringify([normalized, stream, match, resourceId ?? null]);
      if (!request.refresh && cache.has(key)) {
        const hit = cache.get(key); cache.delete(key); cache.set(key, hit);
        check(); return {...hit.result, cached:true};
      }
      const pattern = match === 'exact' ? normalized : '%' + normalized.replace(/[\\%_]/g, '\\$&') + '%';
      const comparator = match === 'exact' ? '= ?' : "LIKE ? ESCAPE '\\'";
      const eligible = "s.typename='codex/entity-reference' AND s.isDeleted=0 AND s.resolution IN ('direct','resolved') AND r.indexStatus IN ('complete','incomplete')";
      const scope = resourceId === undefined ? '' : ` AND EXISTS (SELECT 1 FROM StandoffProperty s JOIN Resource r ON r.guid=s.resourceGuid WHERE ${eligible} AND s.targetEntityGuid=e.guid AND s.resourceGuid=?)`;
      const args = resourceId === undefined ? [pattern] : [pattern, resourceId];
      const rows = [];
      if (normalized.trim()) {
        if (stream === 'all' || stream === 'name') rows.push(...db.prepare(`SELECT e.guid AS id,e.name,'name' AS kind,e.name AS text FROM Entity e WHERE e.deletedUtc IS NULL AND e.nameKey ${comparator}${scope} ORDER BY e.nameKey,e.guid LIMIT 101`).all(...args));
        if (stream === 'all' || stream === 'alias') rows.push(...db.prepare(`SELECT e.guid AS id,e.name,'alias' AS kind,a.alias AS text FROM EntityAlias a JOIN Entity e ON e.guid=a.entityGuid WHERE e.deletedUtc IS NULL AND a.origin IN ('curated','imported') AND a.aliasKey ${comparator}${scope} ORDER BY e.nameKey,e.guid,a.aliasKey LIMIT 101`).all(...args));
        if (stream === 'mention') rows.push(...db.prepare(`SELECT e.guid AS id,e.name,'mention' AS kind,s.text,s.resourceGuid AS resourceId,s.logicalGuid AS mentionId,s.sourceBlockGuid AS blockId,s.startIndex AS start,s.endIndex AS end FROM StandoffProperty s JOIN Entity e ON e.guid=s.targetEntityGuid JOIN Resource r ON r.guid=s.resourceGuid WHERE e.deletedUtc IS NULL AND ${eligible} AND entity_fold(s.text) ${comparator}${resourceId === undefined ? '' : ' AND s.resourceGuid=?'} LIMIT 101`).all(...args));
      }
      check();
      const diagnostics = [];
      if (resourceId !== undefined || stream === 'mention') diagnostics.push(savedNotice);
      if (rows.length > 100) diagnostics.push('Matches truncated; refine the query.');
      const result = {matches:rows.slice(0,100), complete:!diagnostics.length, diagnostics, revision:String(revision)};
      const size = Buffer.byteLength(JSON.stringify(result));
      if (cache.has(key)) { bytes -= cache.get(key).size; cache.delete(key); }
      if (size <= 4 * 1024 * 1024) {
        cache.set(key, {result, size}); bytes += size;
        while (cache.size > 128 || bytes > 4 * 1024 * 1024) { const oldest = cache.keys().next().value; bytes -= cache.get(oldest).size; cache.delete(oldest); }
      }
      return {...result, cached:false};
    }).deferred();
  };
}
