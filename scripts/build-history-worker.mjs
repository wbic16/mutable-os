import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
for (const name of ['history-validation-worker', 'history-derived-worker']) await build({ entryPoints: [fileURLToPath(new URL(`../server/${name}.ts`, import.meta.url))],
  outfile: fileURLToPath(new URL(`../dist/server/${name}.js`, import.meta.url)),
  bundle: true, platform: 'node', format: 'esm', target: 'node22', sourcemap: true });

await build({entryPoints:[fileURLToPath(new URL('../server/native-document-store.mjs',import.meta.url))],outfile:fileURLToPath(new URL('../dist/server/native-document-store.mjs',import.meta.url)),bundle:true,platform:'node',format:'esm',target:'node22',sourcemap:true,external:['express','fs-ext'],plugins:[{name:'vault-worker-client',setup(b){b.onResolve({filter:/knowledge-sqlite\/client\.mjs$/},()=>({path:'./knowledge-sqlite/client.mjs',external:true}));}}]});

// PhextVFS Phase 3b: the tsc-compiled legacy stores (document-store,
// workspace-store) import the phext-fs facade directly, so dist needs
// a real module there — bundled like the native store above. The
// facade's registry lives on globalThis (Symbol.for), so this copy
// shares registrations with the source module the lifecycle loads
// by URL and with the copy inlined into the native store bundle.
await build({entryPoints:[fileURLToPath(new URL('../server/phext-fs.mjs',import.meta.url))],outfile:fileURLToPath(new URL('../dist/server/phext-fs.mjs',import.meta.url)),bundle:true,platform:'node',format:'esm',target:'node22',sourcemap:true});

// The native relocation helper (build-relocation-helper.mjs) is
// deleted with the phext-only cutover: vault moves are VFS renames.

await import('./build-native-knowledge-worker.mjs');

await import('./build-managed-assets.mjs');

await import('./build-application-services.mjs');
