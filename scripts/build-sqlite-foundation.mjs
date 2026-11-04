import { copyFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Keep native addons external and SQL adjacent to the worker. No browser imports or auto-start.
const source = new URL('../src/knowledge-sqlite/', import.meta.url);
const destination = new URL('../dist/server/knowledge-sqlite/', import.meta.url);
for (const name of ['client.mjs', 'vault-scope.mjs', 'paths.mjs', 'advisory-lock.mjs', 'foundation.mjs', 'schema.mjs', 'reconcile.mjs', 'entities.mjs', 'scholarly.mjs', 'encyclopedia.mjs', 'iiif.mjs', 'resources.mjs', 'deterministic.mjs', 'semantics.mjs', 'canonical-ledger.mjs', 'propositions.mjs', 'cardex.mjs', 'cardex-query.mjs', 'entity-display.mjs', 'cardex-regex-worker.mjs', '../features/cardex/validation.mjs', '../interchange/inline-values.mjs',
  'migrations/mutable/0001-foundation.sql', 'migrations/mutable/0002-semantic-knowledge.sql', 'migrations/mutable/0003-scholarly-identities.sql', 'migrations/mutable/0004-encyclopedia.sql', 'migrations/mutable/0005-iiif.sql', 'migrations/mutable/0006-resources.sql', 'migrations/mutable/0007-deterministic-academic.sql', 'migrations/mutable/0008-propositions.sql', 'migrations/mutable/0009-cardex.sql', 'migrations/mutable/0010-cardex-soft-delete.sql', 'migrations/audit/0001-foundation.sql']) {
  const target = new URL(name, destination);
  await mkdir(new URL('.', target), { recursive: true });
  await copyFile(new URL(name, source), target);
}
const codecTarget = new URL('../history/preplan-spike/authored-values.mjs', destination);
await mkdir(new URL('.', codecTarget), { recursive: true });
await copyFile(new URL('../history/preplan-spike/authored-values.mjs', source), codecTarget);
await build({entryPoints:[fileURLToPath(new URL('worker-entry.mjs',source))],outfile:fileURLToPath(new URL('worker.mjs',destination)),bundle:true,platform:'node',format:'esm',target:'node22',external:['better-sqlite3','fs-ext']});
await build({entryPoints:[fileURLToPath(new URL('../server/sqlite-saved-indexer.ts',import.meta.url))],outfile:fileURLToPath(new URL('../dist/server/sqlite-saved-indexer.js',import.meta.url)),bundle:true,platform:'node',format:'esm',target:'node22',external:['fs-ext']});
await build({entryPoints:[fileURLToPath(new URL('../server/sqlite-knowledge-host.ts',import.meta.url))],outfile:fileURLToPath(new URL('../dist/server/sqlite-knowledge-host.js',import.meta.url)),bundle:true,platform:'node',format:'esm',target:'node22',external:['fs-ext','express'],plugins:[{name:'host-owned-worker-client',setup(b){b.onResolve({filter:/knowledge-sqlite\/client\.mjs$/},()=>({path:'./knowledge-sqlite/client.mjs',external:true}));}}]});
await build({entryPoints:[fileURLToPath(new URL('../server/legacy-codex-import.ts',import.meta.url))],outfile:fileURLToPath(new URL('../dist/server/mutable-legacy-import.mjs',import.meta.url)),bundle:true,platform:'node',format:'esm',target:'node22',external:['fs-ext','express','better-sqlite3'],plugins:[{name:'import-owned-worker-client',setup(b){b.onResolve({filter:/knowledge-sqlite\/client\.mjs$/},()=>({path:'./knowledge-sqlite/client.mjs',external:true}));}}]});
