# Patches on upstream

The fork's `emise/*` branches carry wbic16's changes on top of
upstream `argimenes/mutable-os` (based on `cb47fb72`, the commit both
repositories shared when the fork was set up). The intent is that the
changes stay small, enumerable, and easy to re-apply after a rebase onto a
newer upstream. Everything substantive lives in **new files**; the list
below is every pre-existing upstream file this branch modifies.

## Modified upstream files (complete list)

| File | Change | Reason | Rebase / re-apply note |
| --- | --- | --- | --- |
| `src/configuration.ts` | Added `phextDocuments: boolean` to `FeatureFlags` and `phextDocuments: true` to the frozen defaults, next to `documentInterchange`. | Repo convention: major features sit behind a feature flag, enabled by default. | Two added lines in the flag block. If upstream edits the flags around `documentInterchange`, re-add the declaration and the default beside it; nothing else references the flag except the menu wiring below. |
| `src/demo/workspace-demo.tsx` | In `DemoSession` only: two import lines (`../phext/document`, `../phext/file-io`); `openPhext` / `exportPhext` handlers plus a `phextError` signal; "Open Phext…" and "Export Phext…" buttons wrapped in `<Show when={editor.features.phextDocuments}>` in both Local-files surfaces (the Workspace system menu fieldset and the fallback toolbar group); one `<Show>` rendering `phextError` beside the existing file-notice. | The Workspace menu is the main UI surface for Local file actions; the standing rule is that a feature the user cannot find from the main UI does not exist. Open reuses the existing Local open flow (`documents.guard` + `props.onOpenLocal`); Export is a manual Save-as-style action that never acknowledges a Mutable JSON Save. | The hunks are additive and anchored on the Local-files groups. If upstream restructures `DemoSession`'s menus, re-place the two buttons inside whichever group holds Local "Open…/Save as…" and re-add the handlers beside `createWorkspaceDocuments`. |

That is the phext list. In particular:

- **The port needed no server change.** `server/index.ts` already chooses
  its port with `const port = process.env.PORT || 3002;` — the deploy
  unit sets `PORT=3003` (3002 is taken on the host; see
  deploy/deploy.md). (`server/index.ts` does appear in the
  package-update table below — only for surrealdb API renames, nothing
  phext-related.)
- **No codec, persistence, or editor files were touched by the phext
  work.** Phext import/export are explicit file actions layered on the
  existing Local open flow and `editor.encodeDocument()`; the typing
  path is untouched.

## Package-update compatibility (2026-11-03, Will's direction)

Dependencies were updated to latest, majors included (two commits:
within-range `npm update`, then npm-check-updates). Where a new major
broke the build, the fix was made forward with the smallest adjustment,
per file below. Acceptance on the final tree: typecheck exit 0,
`npm run build` exit 0, phext tests 22/22, academic tests 16/16,
prod-server smoke 200.

| File | Change | Reason | Rebase / re-apply note |
| --- | --- | --- | --- |
| `package.json`, `package-lock.json` | All dependencies to latest (vite 4→8, vitest 2→5, express 4→5, surrealdb 1.3.2→2.2.1, @surrealdb/node →3.2, typescript 5.9→6.0, pdfjs-dist 5.4→6.5, three →0.187, mermaid →12.3, @types/node 22→26, …); added esbuild (explicit devDep; server history tests import it directly — it previously arrived hoisted via vite 4) and @surrealdb/node-native (runtime peer of @surrealdb/node 3.2). | Will: "update packages to latest… just work through package updates if needed." Package count 670 → 590. | package.json hunks are small; the lockfile regenerates with `npm install --legacy-peer-deps` (deploy.sh's on-box install is `npm ci --legacy-peer-deps`; fs-ext is optional and its node-gyp build may fail harmlessly — nothing requires its binding, see the live-site fixes table). **Held back:** typescript 7.0.2 — surrealdb 2.2.1 declares peer `typescript ^5‖^6`, npm ERESOLVEs, so typescript is pinned at ^6.0.0. Known wart: solid-devtools@0.34.5 declares peerOptional vite ^2–^7 vs vite 8 (it is not imported anywhere); installs need `--legacy-peer-deps` until upstream widens the range. |
| `server/index.ts` | `surrealdbNodeEngines` → `createNodeEngines`; `db.upsert(id, data)` → `db.upsert(id).content(data)` (7 sites); `db.insert_relation` → `db.relate(from, new Table(…), to, data?)` (2 sites); import `Table`. | surrealdb 2.2 / @surrealdb/node 3.2 builder API replaced the 1.x methods. | Mechanical renames at the call sites; re-apply by searching for the old method names after a rebase. |
| `server/entity-search.test.ts` | Same engine-factory rename as above. | @surrealdb/node 3.2. | One line. |
| `src/pdf/viewer.ts`, `server/application-services/pdf-inspection.ts` | Removed `isEvalSupported: false` from the pdfjs option objects. | pdfjs-dist 6 removed the option (TS2353). | Delete the option wherever pdfjs is configured. |
| `src/academic/bibliography.ts` | Import `parse, parseVerbatim` from `@retorquere/bibtex-parser/js` instead of the package root. | bibtex-parser 13's root entry is a WASM build that crashes uninitialized (`__wbindgen_malloc` of undefined) in non-bundler contexts — the academic suites failed 4 tests against it. The `/js` subpath is the same parser's pure-JS ESM build, and its Options keep `sentenceCase: false`, restoring the original call verbatim. | One import line. If upstream v14+ fixes the default entry's initialisation, the import can return to the package root. |
| `src/application/anchor-capabilities.ts`, `src/features/phosphor/studio-drift.ts` | `parent.hidden` / `canvas.hidden` truthiness reads → explicit `!!` coercions. | TypeScript 6 lib.dom types `HTMLElement.hidden` as `boolean \| "until-found"` (TS2872/TS1345). | Two one-token edits. |
| `server/application-services/executor.ts`, `server/native-knowledge-jobs.ts` | Worker `'error'` handlers normalise `e instanceof Error ? e : Error(String(e))` before logging. | @types/node 26 types the worker error payload as `unknown` (TS18046). | Wrap the logged value; no behaviour change. |

## Live-site fixes on mutable.phext.io (2026-11-03)

Bugs Will hit on the deployed site the day it went live. Each fix is the
smallest change that addresses the root cause; new logic lives in new
files where possible.

| File | Change | Reason | Rebase / re-apply note |
| --- | --- | --- | --- |
| `src/knowledge-sqlite/vault-scope.mjs` | `lockVaultEstablishment` takes its lock through the new `flockExclusiveSync` helper (`src/knowledge-sqlite/advisory-lock.mjs`): only genuine contention (EWOULDBLOCK/EAGAIN) produces "Another Vault establishment is in progress; retry", now always with code `EWOULDBLOCK` so `client.mjs`'s retry loop applies; every other failure propagates with its real cause. | Live bug: vault creation always failed with that message. fs-ext's compiled binding is absent wherever install scripts did not run (the deployed bundle, this VM), so `require('fs-ext')` itself threw — and the old catch-all reported *every* failure as lock contention. The helper prefers the native binding when usable and otherwise falls back to a portable O_EXCL token lock with pid-based stale recovery. | Rendezvous-file creation and validation above the lock call are unchanged. Keep the lock routed through `advisory-lock.mjs` after a rebase. |
| `src/knowledge-sqlite/paths.mjs` | `writerLock` takes the SQLite writer lease through the same `flockExclusiveSync` helper (fallback token at `writer.lock.holder`); its error wrap ("SQLite writer unavailable: …") is unchanged. | The writer lease was the next fs-ext wall in the same vault-open flow: with establishment fixed, vault creation would still have failed at the lease in any fs-ext-less deployment. | The rendezvous `writer.lock` inode is still never unlinked; only the fallback's `.holder` token is created and removed. |
| `scripts/build-sqlite-foundation.mjs` | Added `'advisory-lock.mjs'` to the explicit list of knowledge-sqlite modules copied into `dist/server/knowledge-sqlite/`. | The dist staging copies modules by name; without the new helper in the list, the copied `vault-scope.mjs`/`paths.mjs` fail at import time with ERR_MODULE_NOT_FOUND (caught by foreground/host suites). | One list entry beside `'paths.mjs'`; keep it while `advisory-lock.mjs` exists. |
| `scripts/sqlite-foundation.mjs` | The `reset-test` disposable-store check now treats `writer.lock.holder` as part of the writer-lock machinery: it is allowlisted beside `writer.lock`, exempt from the mid-reset sweep (the reset's own lease may be what created it), and removed with `writer.lock` at the end. | In an fs-ext-less environment the reset's own `writerLock(home)` call creates the fallback token, and the strict file allowlist then rejected the store the reset was guarding ("Unexpected file in disposable store"). | Three small edits in the `reset-test` block; the token name must match `advisory-lock.mjs`'s `${file}.holder` convention. |
| `index.html` | `<title>Solid App</title>` → `<title>Mutable</title>`. | The browser title bar showed the upstream template's placeholder name. | One line; re-apply if upstream retitles. (`src/features/phosphor/glyphs.ts` contains "Solid Apple", an icon name — unrelated, untouched.) |
| `src/demo/workspace-demo.tsx` | In the same `DemoSession` phext wiring: one more import (`../phext/default-documents`), an `openDefaultPhext` handler beside `openPhext`, and "Open Choose Your Own Adventure" / "Open Incipit" buttons rendered from `defaultPhextDocuments` inside the existing `phextDocuments`-gated blocks of both Local-files surfaces. | CYOA and Incipit ship with the site by default. The Workspace demo menu is the surface a fresh visitor actually sees (the session lands there; the server document store is a separately-browsed public scratch space), and the buttons sit beside Open Phext… under the same flag — no new flag, no store writes. | The handler opens through `props.onOpenLocal` like Open Phext…; the conversion and stable-id stamping live in `src/phext/default-documents.ts`. If upstream restructures the menus, re-place the buttons inside the phextDocuments `<Show>` blocks. |
| `scripts/stage-c-gates/filesystem.mjs` | The static `import fsExt from 'fs-ext'` is removed. `lockFile` captures the identity it already verifies and takes its lock through the new `flockDescriptor` helper (`scripts/stage-c-gates/flock.mjs`); the returned handle's `close()` invokes the helper's release between the worker-session close and the descriptor close. | Second live fs-ext failure, hit on the deployed site right after the vault fix: "Cannot find package 'fs-ext' imported from …/scripts/stage-c-gates/filesystem.mjs". The static import made the whole module — and the publication, job, history and managed-asset services that import it from the source tree — unloadable wherever the optional native binding was never built. The helper loads fs-ext lazily via `createRequire` (never statically, so no module pipeline resolves it); when usable, the promisified `flock(fd, 'shnb' \| 'exnb')` path is byte-for-byte the old one, errors included. When absent, a token lock in the system temp directory, keyed by the lock file's verified dev+ino identity and serialized by a per-identity mutex token, provides faithful nonblocking shared/exclusive semantics, reports contention with code `EWOULDBLOCK` (the code publication-storage already maps), and prunes tokens whose holder pid has died, so a crashed holder cannot wedge the lock. One documented delta: a native lock lives on the open file description, so a forked worker's inherited descriptor keeps OS exclusion alive past the acquirer's death; a fallback token lives with the acquirer's pid and becomes recoverable when it dies — bounded in practice because the worker exits on IPC disconnect when its parent dies. | Keep `lockFile` routed through `flock.mjs` after a rebase; the helper needs only fs-ext's callback-style `flock`. Coverage: `scripts/stage-c-gates/flock.test.mjs` (contention code, shared coexistence, cross-process crash recovery). |
| `src/persistence/managed-pair.mjs` | `nativeFlock` keeps the promisified fs-ext `flock` when the binding loads — same call, byte-for-byte — but when it is absent the export now routes through the stage-C gates helper (`scripts/stage-c-gates/flock.mjs`) instead of rejecting every call with ENOSYS ("Native pair locking is unavailable on this server"): the descriptor's dev+ino identity is taken with `fstatSync`, `flockDescriptor` provides the lock, and its release function is invoked on the `'un'` call, tracked per descriptor. | Third fs-ext chokepoint: `ManagedPair.lock` (every paired write) and `NativeVaultStore.lock` (every managed store operation) both consume `nativeFlock`, so wherever the binding is absent the native store 503'd ("Native store locking is unavailable") and pair writes threw — the round-2 vitest batch showed 95 failures across the native-store / foundation / encyclopedia suites with stacks at this stub. One fallback implementation (`flock.mjs`) now serves all three chokepoints; this file only adapts its signature. | Keep `nativeFlock` routed through `flock.mjs` after a rebase; the per-descriptor release map and the `fstatSync` identity are the whole adapter. Coverage: `server/native-vault-store-lock.test.mjs`. |
| `server/native-vault-store.mjs` | `lock()`'s finally now calls `nativeFlock(h.fd, 'un')` (errors swallowed) before closing the handle. | The store previously released its lock by closing the handle alone, which drops a native flock but cannot remove a fallback token: without an explicit unlock, the first store operation's token would outlive it and every later lock in the process would report false contention. On the native path, unlock-then-close is identical to close alone. | One line in `lock()`; keep it while `nativeFlock` has a token fallback. |

## PhextVFS Phase 1 (2026-11-04)

Will's direction: every Mutable I/O path is to be mapped to a virtual fs
layer that routes into one phext per Cavern ("package up all of your
knowledge work and ship it off — like a jupyter notebook"), and the fs
driver is to use the processing engine from phext-lattice so it is as
performant as edit.phext.io. Phase 1 is the engine port plus the VFS
core; it modifies **no upstream files** — everything is new files under
`src/phext/` (plus this note and a benchmark script) — and it is wired
into no server path yet. Phase 2 adds the stage-C gates backend behind
a flag.

- **Engine** (`src/phext/lattice.ts`): a faithful TypeScript port of
  phext-lattice's `src/index.rs` (`LatticeIndex`: one buffer scan builds
  a coordinate → byte-span map plus the ordered coordinate list; O(1)
  lookup thereafter) and `src/mmap.rs` (`MappedLattice`: read-only
  backing store, copy-on-write overlay of modified/inserted/deleted
  scrolls, merged reconstruction in ascending coordinate order, atomic
  save + rebase). The Node `Buffer` plays the mmap's role; content is
  decoded as UTF-8 only on read. Two documented deltas from the Rust:
  empty scrolls are normalized eagerly (an empty write is a delete —
  the Rust index itself never materializes empty spans), and
  `writeScroll` rejects dimension break bytes in content rather than
  corrupting on save (mirrors `codec.ts`'s assert). Provenance:
  wbic16/phext-lattice, MIT, same author as this fork.
- **VFS core** (`src/phext/vfs.ts`): strata libraries mirroring today's
  on-disk homes (1 documents, 2 pair journals, 3 knowledge, 4 history,
  5 services, 6 assets, 7 control, 9 VFS index; 8/10+ reserved);
  structural path ↔ coordinate mapping where every directory is a JSON
  index scroll at its home coordinate (browsing = reading index
  scrolls), child slots come from a high-water mark persisted in the
  index and are never reused (slot 1 is the directory itself), and
  paths deeper than five directory levels fold into suffix-named
  entries under the depth-5 directory — with ordinary sequential slots,
  because phext arms are unary: reaching component N costs N−1 break
  bytes in the serialized file, so slot values must stay small (a
  hash-derived slot ~2^20 OOM'd the serializer in testing; that is the
  kind of fact this note exists to record). Files are chunk series on
  the scroll arm (64 KB default; text snapped to codepoint boundaries
  so chunks are valid UTF-8 and concatenation is byte-identical;
  binary stored base64 per chunk under a `format` marker in its index
  entry, +33% for a package that leaves nothing behind). Library 9
  holds the manifest and a per-scroll SHA-256 checksum series, verified
  at open with mismatches located to coordinate and path; each flush
  keeps the previous generation at `<path>.bak`.
- **BENCH** (`node scripts/bench-phext-lattice.mjs`; this VM, Node 24,
  medians of 3; edit rows include a fresh open, as an editing session
  would pay it):

  | Corpus | codec parse | codec read 1 scroll | codec serialize | lattice index (once) | lattice readScroll | lattice edit + rebuild | lattice edit + save |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | CYOA, 4.4 MiB, 831 scrolls | 106 ms | 99 ms | 108 ms | 20 ms | 3 µs | 30 ms | 50 ms |
  | synthetic, 48 MiB, 17,046 scrolls | 985 ms | 971 ms | 896 ms | 183 ms | 1 µs | 262 ms | 529 ms |

  The per-read cost after open is independent of file size (µs at both
  scales, vs a full parse per read with the codec — ~10⁵–10⁶×), and an
  edit never re-parses: reconstruction emits spans and overlay content
  in coordinate order, so its cost is the output bytes, not a parse.
- Coverage: `src/phext/lattice.test.ts` (index parity with the Rust
  fixtures, equivalence with the existing codec on CYOA — same populated
  coordinates and contents, reconstruction a byte fixed point — and the
  overlay semantics) and `src/phext/vfs.test.ts` (Cavern-shaped
  round-trip across flush/reopen including the folded deep path,
  mutation rules, .bak, and located checksum tampering).

## PhextVFS Phase 2 (2026-11-04)

The stage-C gates backend: the four gates consumers (history store,
job storage, publication storage, managed assets) can run on the
Cavern's single phext. Behind the **`phextVfs` feature flag, default
false** — a storage switch defaults off until proven, per Will's
specification, overriding the repo's usual flag default. Flag off is
byte-for-byte today's behavior: the dispatch in `filesystem.mjs` is
keyed on a registration that only happens when the flag is on.

Modified upstream files:

| File | Change | Reason | Rebase / re-apply note |
| --- | --- | --- | --- |
| `src/configuration.ts` | Added `phextVfs: boolean` to `FeatureFlags` and `phextVfs: false` to the frozen defaults, beside `phextDocuments`. | Repo convention: major features behind a flag; the specification for this storage switch is default-off. | Two added lines in the flag block beside `phextDocuments`; the only readers are `cavern-lifecycle.ts` and this note. |
| `scripts/stage-c-gates/filesystem.mjs` | Added the backend registry (`registerPhextBackend` / `unregisterPhextBackend`), dispatch at the head of `pinDirectory` / `atDirectory` / `createDirectory` / `lockFile`, and a backend flush in `closeFilesystemWorkers`. No disk-path body changed. | Least invasive dispatch: all four consumers dynamically import this one module and call only these exports, so no consumer file changes at all. | The dispatch blocks sit above the unchanged disk bodies; if upstream rewrites the module, re-add the registry + the four dispatch heads and keep `phext-backend.mjs` beside it. |
| `server/cavern-lifecycle.ts` | When the flag is on, `stores()` opens `<root>/cavern.phext` via `PhextVFS.openOrCreate` and starts registration; `establish()` awaits it (`phextReady`) before any consumer can pin; `close()` unregisters (flush) and closes the VFS. | Cavern selection is the one place that knows the Cavern root and the stores' lifetime. | Three small hunks: an import pair, the `stores()` setup block, one await in `establish()`, and the tail of `close()`. |
| `src/phext/vfs.ts`, `src/phext/lattice.ts` | Import specifiers `./coordinate` → `./coordinate.js` (and `./lattice` → `./lattice.js` in vfs.ts). | Pulling vfs.ts into the server build makes Node ESM load the emitted files directly; Node requires explicit extensions (Vite/vitest tolerated the extensionless form). Without this the production server fails to boot — caught by the boot smoke. | Only the server-reachable chain changed; the rest of `src/phext/` keeps extensionless imports because only the client bundler loads it. Keep the `.js` specifiers if these files are edited. |

Design (full detail in the header of `phext-backend.mjs`):

- **Dispatch scope.** A registered backend owns the gates trees under
  its Cavern root: paths whose first relative component is `.mutable`,
  plus any path at or below a `.memory` component (history memoirs sit
  beside documents). Document folders and documents themselves stay on
  disk (Phase 3), as does SQLite knowledge (Phase 4). A stat/mkdir of a
  tree-starting component (`.mutable`, `.memory`) against a disk pin is
  answered by the backend, so component-by-component descent crosses
  into the phext at the boundary.
- **Identity.** `{ dev: "phext:<id>", ino: <token> }`: a random token
  per VFS node, assigned at creation (or first observation) and
  persisted in an in-phext registry, `/.control/gates-identities.json`.
  Tokens survive restarts (the history store JSON-compares persisted
  directory identities in `binding.json`), are dropped on unlink/rmdir
  so recreated nodes fail stale pins closed, and publish inherits the
  source's token, mirroring hard-link inode sharing.
- **Locking stays real.** `lockFile` takes a real flock via
  `flock.mjs` — not on the phext (every flush renames it) but on a
  stable per-lock anchor file beside it, `cavern.phext.anchor-<hash of
  the lock's VFS path>`, created once and never renamed or unlinked.
  Per-lock anchors (rather than one per Cavern) preserve the disk
  semantics exactly: locks on different files never exclude each
  other. `close()` flushes the VFS before releasing, so the next
  acquirer opens a phext that already holds the previous holder's
  publications.
- **Ops in-process, no worker fork.** Path confinement is structural
  in the VFS, and each op is one synchronous VFS transaction; the
  worker's serialization role is replaced by the consumers' own locks
  plus the server-wide foreground serializer. Flush points are the
  consumers' own commit points: publish ops, lock release, and
  shutdown (`closeFilesystemWorkers` / unregister). Between them,
  history's record appends are create+publish pairs and land on the
  publish flush, as on disk.
- **Known bounds.** One owning server process per Cavern phext: the
  anchor flock still excludes a second process's locks, but a second
  process sees the phext as of the last flush. Data written through
  the gates in earlier flag-off use is not migrated (a flag-on Cavern
  starts its gates trees empty in the phext); migration is a later
  phase's concern, and the flag defaults off.

Coverage: `server/phext-gates-backend.test.ts` (op vocabulary,
paging, publish identity inheritance, binary round-trip, cold-reopen
persistence with stable identities, stale-pin fail-closed, in-process
flock semantics, cross-process anchor contention) and
`server/phext-history.test.ts` (the real history store appending 15
records into the phext and reading the timeline back after a cold
reopen; no `.memory` on disk). Gates on the final tree: typecheck 0,
build 0, boot smoke HTTP 200 with the flag off; a flag-on smoke
(temporary flip, reverted) created two Caverns end-to-end — managed
asset recovery ran on the backend during activation, leaving
`/.mutable/assets` + `writer.lock` in the phext (assets stratum) and
a real anchor file beside it, and the first Cavern's phext reopened
with integrity verified after the switch. Flag-off regressions:
stage-C suites 27/28 (the one failure is the known uid-0 chmod
artifact, identical before the change), phext suites 46/46,
publication + foundation consumer suites identical to baseline
(31 passed / 2 pre-existing failures).

## PhextVFS Phase 3a (2026-11-04)

Documents and pair journals join the Cavern phext: `NativeVaultStore`
and `ManagedPair` — and the native document routes built on them — run
on a `node:fs`-shaped facade over the same PhextVFS Phase 2 uses,
behind the same **`phextVfs` flag (default false)**. Flag off is
byte-for-byte today's disk behavior: every consumer below swaps only
its `promises as fs` binding to the facade, and the facade falls
through to the real filesystem per path unless a registration covers
the path. Knowledge SQLite stays on disk (Phase 4); the recognized
document store's own journal under `.mutable/` is untouched.

Modified upstream files:

| File | Change | Reason | Rebase / re-apply note |
| --- | --- | --- | --- |
| `src/phext/vfs.ts` | Two additive APIs: `writeFile` gains a `slices` option (text format only; the slices must concatenate to the exact payload, else EINVAL) whose chunks follow the slice boundaries, and `rename(from, to)` with exclusive `renameat2(RENAME_NOREPLACE)` semantics (files move their raw chunk scrolls verbatim, preserving chunking; directories move recursively; works across strata). | Block-boundary chunking needs the VFS to store caller-supplied raw slices as consecutive scrolls without re-serializing; the relocation primitive needs a VFS-side exclusive rename. Reads already reassemble chunks by exact concatenation, so sliced writes are transparent to every reader. | Pure additions beside `writeFile`/`encodeChunks`; no existing signature changed. If upstream rewrites the write path, re-add `encodeSlices` + the `slices` branch and `rename`/`moveFileEntry`. |
| `scripts/stage-c-gates/phext-backend.mjs` | The per-lock anchor logic is extracted into an exported `createFlockAnchorRegistry(vfs)` (`anchorPathFor` / `openAnchorFd`); `createPhextBackend`'s `lockFile` now consumes it. Anchor naming is unchanged (`cavern.phext.anchor-<sha256 of the lock's VFS path, 16 hex>`), so anchors created by Phase 2 builds remain the same files. | Phase 3a's locks must reuse Phase 2's anchor mechanism, not duplicate it. | An extraction only; behavior identical. Keep the export — `server/phext-fs.mjs` lazily imports this module for its default anchor registry. |
| `server/native-vault-store.mjs` | `promises as fs` now comes from `./phext-fs.mjs` (sync `node:fs` imports unchanged — the Cavern root itself stays a real directory), and `move()` dispatches to the facade's exclusive rename when a registration covers the root, falling back to the compiled C helper otherwise. | The store's async surface (create-exclusive write, durable write, records, discovery, scope fences, relocation records) is the documents stratum's core. The C helper cannot rename inside a phext; the VFS rename has the same `RENAME_NOREPLACE` contract, and failures still surface as the same 409. | Two hunks: the import line and the head of `move()`. |
| `src/persistence/managed-pair.mjs` | `promises as fs` now comes from `../../server/phext-fs.mjs` (`fstatSync` stays in `node:fs` — it stats real anchor descriptors). | The pair journal (receipt/pending/intent, staged files, publish-by-link) is stratum 2; every paired save flows through this module's fs calls. | One import line; the module already reaches across the tree for `scripts/stage-c-gates/flock.mjs`. |
| `server/native-document-store.mjs` | `promises as fs` from `./phext-fs.mjs`. | Its reads/listings and the relocations preflight walk document folders that are virtual in phext mode. | One import line. |
| `server/vault-listing-cache.mjs` | `promises as fs` from `./phext-fs.mjs`. | Browse listings `lstat`/`readdir` document folders (virtual); the cache home itself lives under `.mutable/` and falls through to real disk per path, so one binding serves both. | One import line. |
| `server/collection-inventory.mjs` | `promises as fs` from `./phext-fs.mjs`. | The inventory walks the vault with `lstat`/`opendir`/`readdir`. | One import line. |
| `server/recognized-source.mjs` | `promises as fs` from `./phext-fs.mjs` (`constants` stays in `node:fs`). | Recognized sources are read (`open` + positional `read`) from document folders. | One import line. |
| `server/cavern-lifecycle.ts` | In the existing flag-on block of `stores()`: after the gates registration, dynamically import `server/phext-fs.mjs` and `registerPhextFs({ root, vfs })`, then record the phext-backed strata at `/.control/phext-strata.json` (L7) and flush. In `close()`: `unregisterPhextFs(root)` (flush) before the gates unregister and VFS close. | Mirrors Phase 2's registration pattern at the one place that owns the Cavern's lifetime; the L7 record is the in-phext statement of which strata are phext-backed (documents 1, pair journals 2, history 4, services 5, assets 6, control 7) and what remains on disk (knowledge — Phase 4). | Two hunks beside the Phase 2 hunks; the dynamic import is URL-based like the gates one because the lifecycle is loaded outside the server bundle graph. `src/configuration.ts` is **not** modified by this phase (the flag already exists). |

Design (full detail in the header of `server/phext-fs.mjs`):

- **Facade, not fork.** The shim implements exactly the fs surface the
  two stores and their router consumers use: `open` (flag parsing
  incl. `wx`/`ax`, positional `read`, `writeFile`, `sync`/`datasync`
  as VFS flush, `stat`), `readFile`, `writeFile`, `mkdir`, `readdir`
  (names and Dirent shapes), `opendir` (snapshot async iterable),
  `lstat`/`stat`, POSIX `rename` (replace semantics layered over the
  VFS's exclusive rename — ManagedPair's receipt publish renames over
  the previous generation), an exclusive-rename entry point for the
  vault store's `move()`, `link`, `unlink`, `realpath`. Sync
  `node:fs` imports are never swapped.
- **Dispatch.** A path is virtual iff a registration covers its root
  and its first component is not `.mutable` (exact match — the
  knowledge home, Phase 4) and not the phext file itself. The Cavern
  root directory itself stays real; listing the root lists the virtual
  root (the `.control` plumbing name is hidden). So `.mutable-pair-*`
  journals → L2, `.mutable-relocations` + `.mutable-store.lock` →
  L7/L1 by the VFS's own path dispatch, documents → L1 — with zero
  per-consumer path logic.
- **Locks stay real.** Opening any `*.lock` path returns a handle
  whose descriptor is a real anchor fd from Phase 2's shared registry
  (a virtual empty lock file also exists, so stats, signatures and
  discovery see the lock exactly as on disk). The stores' `nativeFlock`
  calls — and therefore both contention contracts ("Another managed
  operation is active; retry"; the pair's conflict result) — are
  untouched, and cross-process contention works because the anchor
  path is a deterministic function of the VFS path.
- **Identity and stamps.** Node tokens (stable `ino`) and per-node
  versions persist in an L7 registry (`/.control/fs-nodes.json`);
  timestamps derive deterministically from content hash × version, so
  a stamp is stable while a file is unchanged (including across
  restarts and cold reopens), changes on any mutation — even an
  identical-bytes rewrite — survives rename, and directory versions
  bump when any descendant mutates, preserving the stores' fence and
  revalidation semantics. The registry is shared through
  `globalThis` because the stores reach production inside the esbuild
  bundle while the lifecycle loads the source module by URL — both
  instances must see one registry (house pattern for shared modules).
- **Block-boundary chunking.** Native documents (`.ink` /
  `.mutable.json` names per `document-file-names.mjs`) are sliced
  raw — envelope-without-blocks slice, one slice per `document.blocks`
  entry, separator/tail slices — and stored as consecutive scrolls;
  boundaries are located by a byte-level scanner (parsing finds
  boundaries; storage never re-serializes), the slice concatenation
  is verified byte-equal before storing, and any envelope shape that
  does not slice cleanly falls back to Phase 1's opaque chunking for
  that file. Evidence on `artifacts/flint-b1.2/rich.mutable.json`
  (8,061 bytes, SHA-256
  `fe5f210edba7c547cf113d0fed24d343734bc95ca5326cb1a66a1a62958a2b45`):
  17 slices, block slices parsing to exactly the 8 block ids in
  order, hash identical after a shim write/read round-trip, VFS
  `stat().sha256` equal to the file hash. Non-native files (`.md`
  projections, receipts, intents) chunk opaquely as in Phase 1.
- **Not shimmable / deliberately not swapped.** `server/recognized-document-store.mjs`
  keeps `node:fs`: every path it touches directly lives under
  `.mutable/document-saves` (real by the dispatch rule either way) and
  document access delegates to the two stores above.
  `NativeVaultStore`'s constructor probes the root with sync fs —
  the root is a real directory in every mode. Access checks,
  `rmdir`/`rm`, and watch APIs are outside the facade; no wired
  consumer uses them on virtual paths.

Coverage and gates:

- New suites: `server/phext-fs.test.mjs` (facade vocabulary: O_EXCL
  collision, link-publish atomicity across a flush boundary, renames,
  root listing, the block-slicing round-trip with hash + block-id
  alignment, opaque fallback, both stores' lock contention contracts
  against real anchors, stamp stability/mutation/rename rules,
  per-path fallthrough), `server/phext-docs-scenario.test.mjs`
  (discovery/pairing, pair + directory relocation, scope fences,
  listing cache, cold reopen — through the stores' own APIs), and
  `server/phext-docs-e2e.test.ts` (the real native routes: mkdir,
  save, fault-interrupted save, recover, cold reopen from the phext
  alone, asserting the disk holds only `cavern.phext`, its `.bak`
  and anchors). 17 tests, all passing.
- The pre-existing store suites build fixtures with raw `node:fs`
  and probe disk-only semantics (symlinks, chmod, `fs.utimes`,
  external descriptors, subprocess lock holders), so they cannot run
  flag-on unmodified — a fixture written to disk is invisible to a
  virtual store, and several scenarios (an external writer racing on
  disk) have no phext-mode meaning. Flag-on behavior is therefore
  covered by the scenario/E2E suites above plus a one-off flipped-flag
  run of the **real** `createCavernLifecycle` (temporary flip +
  throwaway harness, both reverted): establish → save → close → cold
  reopen with document and receipt baseline intact, disk holding only
  the phext family and `.mutable`. Flag-off counts are unchanged from
  baseline: native vault store suites 59/60 (the one failure is the
  known uid-0 artifact), native + recognized document stores 24/32
  (the 8 failures are the known missing `data/raven.json` fixture),
  phext + gates suites 51/51, stage-C node:test suites 27/28 (the
  known uid-0 G2 artifact), ManagedPair qualification and
  cavern-lifecycle suites green.
- Gates on the final tree: typecheck 0, build 0, boot smoke HTTP 200
  with the flag off and with it temporarily flipped on (reverted).

## PhextVFS Phase 4 (2026-11-05)

The SQLite knowledge layer unravels into the Cavern phext, behind the
same **`phextVfs` flag (default false)**. Flag off is byte-for-byte
today's disk behavior (real `mutable.db`/`audit.db` in `.mutable`).
Flag on, the phext is the only canonical store: canonical records
live in L3 in the ledger's `state()` form, the audit trail is data in
L3, and SQLite survives only as an **ephemeral replica** — a real
migrations-built database in a fresh 0700 temp directory, populated
from L3 at open (foreign-key checked), deleted at close, deletable
mid-run without loss, never shipped. Every existing SQL consumer
(entities, cardex, semantics, propositions, saved-facts,
entity-lookup, package-data, the saved indexer) runs unchanged
against the replica; consistency-critical surfaces (operation
outcome, audit status, mutation idempotency) are served from L3.
Working format is memory-resident throughout (Will's ruling); xz
sealing is Phase 5 and is not built here. Design:
`sqlite-unraveled-phase4-design.md` (goal workspace).

**Step 4.4 (media carve-out) is CANCELLED** (Will, 2026-11-04 — the
separate-media ruling was reversed; media is EMBEDDED): L6 keeps
holding asset content exactly as Phase 2 built it, no catalog flip,
no store home moves. The asset-continuity gate is folded into the
Phase 4 E2E (a binary asset written to L6 before the knowledge work
round-trips byte-identically after cold reopen).

Modified upstream files:

| File | Change | Reason | Rebase / re-apply note |
| --- | --- | --- | --- |
| `src/phext/lattice.ts` | Additive `PhextLattice.rebaseFromBuffer(buffer)`: rebuild the base from a foreign generation's bytes and re-apply this instance's overlay (modified/inserted kinds fixed up against the new base; tombstones for scrolls the foreign generation lacks are dropped). | Two VFS instances share one phext file (the lifecycle owns the document strata, the knowledge worker owns L3); a flush must merge onto generations the other instance saved instead of overwriting them. | One method beside `revert()`; no existing behavior changes (single-instance flushes never rebase — the fingerprint matches). |
| `src/phext/vfs.ts` | `flush()` is generation-aware: under a cross-process flush mutex (tmpdir token file keyed by the phext's resolved path; dead-pid recovery; 30 s deadline → new `ELOCKED` error code), it validates a foreign generation (must carry an L9 manifest, else `EINTEGRITY` refusal), rebases onto it, recomputes L9 checksums over the merged state, and refreshes its disk fingerprint. | Same multi-instance coherence; checksums must cover the merged state, and a non-VFS generation must never be silently overwritten. | The flush internals split (`flush`/`flushLocked`/`acquireFlushMutex`); the public API is unchanged. If upstream rewrites `flush`, preserve: mutex → fingerprint compare → validate → rebase → checksum → save → fingerprint refresh. |
| `src/knowledge-sqlite/foundation.mjs` | Phext mode resolution + branch at the head of `openFoundation`: an injected instance (worker) or a lifecycle-registered one enters `openPhextFoundation`; an explicit `phextKnowledge` request with no instance available throws (never silently downgrades to disk). Main-thread phext opens take the same establishment lock and the phext scope inspection. | One seam: every mutation module already calls only `ledger.mutate`, and every open already funnels through `openFoundation`. | ~25 lines above the untouched disk path; the disk branch is the original function verbatim. |
| `src/knowledge-sqlite/vault-scope.mjs` | `inspectVaultScope` gains an optional `phextKnowledge` flag: `cavern.phext` counts as establishment infrastructure for ancestor/descendant overlap, a `.mutable` home without `mutable.db` is tolerated, and `existing` reflects the phext. Default behavior is byte-identical (same checks, same error strings). | A converted Cavern has knowledge in the phext and possibly no `.mutable` at all; the fail-closed posture (no auto-repair of partial homes) is preserved — only the missing-`mutable.db` case relaxes, and a present `mutable.db` must still be a private regular file. | Options-object addition; the two changed conditionals are guarded by the flag. |
| `src/knowledge-sqlite/client.mjs` | Phext resolution before scope inspection (registry hit, explicit path, or `true` → `<vault>/cavern.phext`), injecting the resolved path into `workerData`; `restoreFrom` + phext is refused with an explicit error; the writer-lease answer becomes a flock on the writer lock's anchor file beside the phext (same anchor the gates backend computes for `/.mutable/writer.lock`; failures wrapped as `SQLite writer unavailable: …`, matching `paths.writerLock`); new `knowledgeCacheFile()` client method. | The host process is where the mode decision can be made once and ridden into the worker; the lease must exclude second writers across processes exactly as on disk. | Additive branches in `openSqliteFoundation` and the lease message handler; disk flow untouched. |
| `src/knowledge-sqlite/worker-entry.mjs` | Phext branch at startup: opens its own `PhextVFS` instance (read-only → `open`, writer → `openOrCreate`), skips `prepareHome`, requests the lease with the phext path attached, passes the instance into `openFoundation` via context, refuses `restoreFrom`; `knowledge-cache-file` op returns the foundation's replica path; `close` also closes the VFS. | The worker is the L3 writer; its instance is disjoint from the lifecycle's by stratum ownership. | The disk startup path is the original code with an `if (phextPath)` fork in front of it. This file is esbuild-bundled, so the static `../phext/vfs.ts` import is safe here (and only here). |
| `server/sqlite-knowledge-host.ts` | A `knowledgeProbe()` helper replaces the four `.mutable/mutable.db` existence probes (phext mode probes the real `cavern.phext` file instead); `entityLookup` takes its reader identity from the phext file's dev:ino in phext mode; the cardex regex branch runs `runCardexRegex` against the writer foundation's ephemeral replica while holding the foreground lease. Plus a static import of the phext registry. | The host's disk assumptions are exactly four probes, one identity stat, and one file path; each gets a phext twin with identical contracts. | Small, local hunks; every disk path is preserved verbatim behind the registry check. |
| `server/cavern-lifecycle.ts` | In the flag-on block: dynamically import the phext registry and `registerPhextKnowledge({ root, phextPath, vfs })`; the strata record gains `knowledge: 3` and `onDisk` empties; `close()` unregisters knowledge between the phext-fs and gates unregisters; `inspect()` treats an existing `cavern.phext` as the established marker when the flag is on (a converted Cavern may have no `.mutable`). | Registration must complete inside `phextReady`, before `sql.establish` runs; the registry is how the host and client learn the mode. | Three small hunks beside the Phase 2/3a hunks; dynamic import is URL-based like the existing ones. |
| `scripts/build-sqlite-foundation.mjs` | The five phext knowledge modules join the explicit dist copy list. | The dist staging copies modules by name; the copied `foundation.mjs`/`client.mjs` import them. | Five list entries. |

Design as built (rationale in the new modules' headers):

- **Ledger discipline ports unchanged.** A mutation is one overlay
  generation + one flush (flush = commit); the receipt lands in the
  L3 outbox in the same generation; outbox budgets (10,000 mutations
  / 16 MiB, per-delivery 1,000 / 16 MiB) and the
  differing-request refusal are the disk ledger's, line for line.
  Delivery writes the audit entry and flushes, then deletes the
  outbox entry and flushes again, with the disk protocol's
  fingerprint checks (`payloadHash`, metadata equality, event
  equality, changed-receipt guard) — a crash between the two flushes
  redelivers by verification, proven by test. The mutation's SQL
  work runs against the replica inside a transaction; if the flush
  fails, the transaction rolls back and the overlay is reverted —
  nothing is durable anywhere.
- **L3 sync** is event-driven (captured after-states; proposition
  aggregates rewritten whole) plus a per-mutation membership sweep,
  so rows removed by SQL cascade — which produce no ledger events on
  disk either — cannot linger in L3 and resurrect at replica
  rebuild. **D3 as built:** a mutation applies its work to the
  replica in the same transaction that produces its receipt events,
  and every later open rebuilds its replica from L3, which is the
  only shared state — there is no second copy to drift.
- **D-decisions:** D2 audit = one file per mutation in `audit/`
  (segment packing past ~10k mutations is noted in
  `phext-store.mjs`, not built). D4 observed/recovered aliases are
  never written to L3 (the replica rebuild simply lacks them until
  the next reconcile re-derives them — asserted in the foundation
  suite). D5 `actors/` is reserved and round-trips through the
  converter/exporter for parity. D1 moot; D6 resolved toward the
  phext (Phase 3b scope).
- **Establishment and identity.** The `vaultGuid` is minted once at
  first establishment into the control record
  (`{format: "phext-knowledge-v1", vaultGuid, knowledgeEpoch,
  canonicalMutationCount, createdUtc, strata: {knowledge: "phext"}}`)
  and mirrored into the L3 root index scroll for one-lookup
  discovery; conversion preserves it (never re-mints). Knowledge
  present without a control record, or a corrupt record, refuses the
  open — never auto-repairs. The establishment contention error is
  the shared `lockVaultEstablishment` one, byte-identical
  ("Another Vault establishment is in progress; retry",
  `EWOULDBLOCK`) in both modes — asserted by test.
  `knowledgeRevision()` stays `sqlRevision(replica)`, so
  `sqlRevision` consumers (index epochs, saved-scope fences) work
  unchanged.
- **Deviation — control record placement.** The design's L7 path
  (`/.control/knowledge.json`) was moved to the L3 root
  (`/.mutable/knowledge.json`), content and semantics unchanged.
  Reason: Phase 3a's phext-fs keeps `fs-nodes.json` in the same
  `/.control` directory, written by the lifecycle's VFS instance,
  while the control record is written by the worker's instance; two
  instances allocating slots in one directory from stale index views
  both took slot 3, and the later flush's index orphaned the control
  record beside intact L3 records (bisected through the E2E below).
  The VFS coherence rule this establishes: **one writer instance per
  directory** — strata ownership is disjoint by layout (lifecycle:
  L1/L2/L4/L5/L6/L7; worker: L3), and the control record belongs to
  the knowledge writer. Any future cross-instance shared directory
  needs merge-aware index rebasing first.
- **Converter and export (4.6).** `convertDiskKnowledgeToPhext`
  refuses a source that fails verification, cross-checks the two
  audit representations (each delivered mutation's stored
  `payloadHash` must equal the SHA-256 of its receipt payload, and
  its `AuditEvent` rows must equal the receipt's events), then
  verifies its own work — per-table counts and per-record SHA-256
  over the canonical record text, dump vs L3 readback — before
  returning a report. Undelivered outbox payloads migrate verbatim
  and still deliver afterwards. The export materializes fresh
  `mutable.db`/`audit.db` plus the standard
  `mutable-sqlite-backup` manifest, so the unchanged
  `restoreSnapshot` consumes it; an export → restore round trip is
  dump-diff-equal in the converter suite. The phext foundation's
  `backup()` is this export.
- **Accepted difference:** a read-only phext foundation's replica
  starts with an empty derived projection (on disk, the projection
  persists in the shared file). The projection is rebuilt by the
  reconcile pipeline in the instance that owns indexing — which the
  host drives at Cavern open (the E2E asserts coverage complete
  after a cold reopen + refresh). Canonical reads are unaffected.

Coverage and gates:

- New suites (14 tests): `src/knowledge-sqlite/phext-knowledge.test.ts`
  (4.1 ledger semantics incl. crash-redelivery and outbox budgets;
  4.2 cross-module scenarios + D4 + cold reopen + replica deletion;
  4.3 audit surfaces; 4.5 establishment incl. byte-identical
  contention), `src/knowledge-sqlite/phext-convert.test.ts` (4.6
  above), `src/knowledge-sqlite/phext-worker.test.mjs` (production
  worker path: establish/mutate/deliver, anchor-lease contention,
  replica lifecycle, restore refusal, cold reopen, phext-only disk),
  `server/phext-knowledge-e2e.test.ts` (real host + native routes:
  establish → entity mutate → audit deliver → document save →
  reconcile with complete coverage → cold reopen → projection
  rebuild; L6 asset byte-identical; disk holds only the phext, its
  `.bak` and anchors). Run the vitest suites serially — several
  suites share the per-user establishment flock, and parallel files
  can contend on it (the same reason `test:sqlite` runs
  `--test-concurrency=1`).
- Baselines hold: `test:sqlite` 131/131 (130 baseline + the worker
  suite), phext vitest set 67/67, host/lifecycle suites
  (cavern-lifecycle, sqlite-knowledge-host, entity-lookup,
  entity-mutate) 14/14, typecheck 0, build 0, boot smoke HTTP 200
  with the flag off and with it temporarily flipped on (reverted).
  The application-services suites (foundation / academic /
  encyclopedia) show load-dependent 5000 ms-timeout failures on this
  VM **identically on the pristine base commit** (verified by
  worktree comparison: same failing tests, same timeout mode;
  academic passes 8/8 solo on both trees) — no Phase 4 delta.

## PhextVFS Phase 5 (2026-11-05) — the exit ramps

Migration tooling + Download/Open Cavern: a disk-mode Cavern can be
converted to one phext, a phext-mode Cavern can be exported back to a
complete disk tree, and the Cavern travels as a single file — raw
(`cavern.phext`) or sealed (`cavern.phext.xz`). Everything is behind
the `phextVfs` flag (default off); with the flag off the new routes
refuse (409) and behavior is byte-identical. Stacked on Phase 4.

- **New module `server/phext-cavern-transfer.mjs`** (plain `.mjs`,
  loaded by URL like `phext-fs.mjs`; the PhextVFS class is injected):
  - `migrateCavernToPhext({root, openVfs})` — verified-round-trip
    migration for a CLOSED disk-mode Cavern. Walks the disk tree and
    classifies every file: documents + pair journals + relocation
    state via the Phase 3a phext-fs machinery (native documents
    raw-sliced on block boundaries), `.memory` history + the
    history/jobs/publications/assets gates stores via the Phase 2
    copy discipline, knowledge via the Phase 4.6 converter. Writes go
    to `cavern.phext.migrating-<uuid>`; verification reopens the
    temporary phext fresh and checks every copied file's SHA-256
    against the L9 index, smoke-reads a native document / history
    record / pair journal, and compares the canonical knowledge dump
    (tables + counts + audit + outbox) against the disk source. Only
    then are the L7 records written (below) and the temporary phext
    renamed to `cavern.phext`. The disk `.mutable` directory is
    renamed to `.mutable-disk-fallback/` (the 4.6 converter's
    precedent); the document tree stays in place, inactive. Any
    failure before the rename aborts with the disk Cavern untouched
    and the partial phext discarded. Refusals: already migrated, no
    disk state, writer lock / open handles present, and a non-empty
    SQLite `-wal`/`-journal` sidecar (uncheckpointed knowledge —
    `-shm` and empty sidecars are stale readonly-open artifacts and
    are skipped). Runtime residue (`writer.lock`, discovery cache,
    `.lock`/anchor files) is never migrated; the knowledge lease
    anchor is rebindable state and is recorded as skipped.
  - **Honesty rule (Phase 3b pending):** the legacy document /
    workspace stores and `uploads/` are NOT phext-backed yet. The
    migration record lists them under `remainingOnDisk` and the
    report says so — a migrated Cavern is never claimed to be
    fully-one-phext while Phase 3b is outstanding. Their files stay
    on disk, untouched, alongside the fallback.
  - `exportPhextCavernToDisk({phextPath, openVfs, destination})` —
    the reverse ramp: VFS file walk (control stratum excluded and
    reported) + the Phase 4.6 L3→SQLite knowledge export into the
    destination's `.mutable/`; refuses a non-empty destination.
  - `sealPhext` / `verifySeal` / `unsealPhext` — the xz seal
    (`xz -6 --check=sha256`, per the media ruling: an export-time
    operation on the in-memory uncompressed phext; never the working
    format, never per-save). Implemented with `spawn` + streamed
    stdin — `execFile` with an `input` buffer deadlocks against xz
    in this runtime. `xz -t` integrity verification always runs
    BEFORE decompression; a corrupt seal is refused before anything
    is written.
  - `installPhextIntoFolder({bytes, filename, targetDir, openVfs})`
    — Open Cavern: verify/unseal → write `cavern.phext` → sanity-open
    the VFS (index builds, strata record reads, knowledge control
    record present for a knowledge-bearing Cavern, vault identity
    present). Refusals: non-phext content, missing knowledge control
    record, non-empty target folder. On any refusal the written
    phext is removed — the target is left as found.
- **L7 Cavern state (proposal item 5):** `/.control/cavern-state.json`
  in the Cavern's own phext now carries `migration` (timestamp,
  source manifest hash, per-stratum source hashes, converter
  version), `strata` (format/states, preserving the `onDisk` list of
  strata still disk-backed), and `lastOpenedUtc` (best-effort write
  on establish — an L7 write failure never fails an open).
  `caverns.json` stays server installation state and is not moved.
- **Lifecycle routes (`server/cavern-lifecycle.ts`, all flag-gated):**
  `POST /api/cavern/migrate {root}` (serial with establish; refuses a
  currently-open Cavern), `POST /api/cavern/export-phext
  {root, destination}`, `GET /api/cavern/download?sealed=0|1` (the
  open Cavern: flush, then raw bytes or the sealed stream; sidecar
  facts as headers — `X-Cavern-Guid`, `X-Cavern-Phext-Sha256`,
  `X-Cavern-Phext-Bytes`, `X-Cavern-Sealed-Bytes`), `POST
  /api/cavern/open-phext` (multipart upload, 512 MiB cap; install +
  establish in one step, returning the merged Cavern view).
- **UI (`src/application/cavern-startup.tsx`):** the Cavern picker
  gains an "Open a Cavern from a Phext" card beside Establish/Open,
  and an open Cavern's CavernControl menu gains "Download Cavern
  (.phext)" and "Download Sealed Cavern (.phext.xz)" — the exit
  ramps ship on the same surface as Establish/Open, not on a hidden
  page (discoverability rule).
- **New suite:** `server/phext-exit-e2e.test.ts` (4 tests) — full
  round trip (disk fixture with every stratum → migrate → read back
  from the phext alone with the fallback renamed away → seal →
  `xz -t` + unseal byte-identical → install into a fresh folder →
  phext-mode state diff-equal → export to disk → canonical dumps
  diff-equal again), the migration refusal matrix (already migrated /
  no disk state / corrupted source DB aborts with the disk
  untouched), the open refusal matrix (corrupt seal / non-phext /
  missing knowledge control / non-empty target), and flag-off route
  refusals.
- **Operating instructions:** with `phextVfs` on — to migrate: close
  the Cavern, POST `/api/cavern/migrate` (or wait for the picker
  affordance), keep `.mutable-disk-fallback/` until satisfied, then
  delete it and the in-place document tree copy at leisure; to move
  a Cavern: Download (sealed for transport), then Open from Phext on
  the receiving install; to return to disk mode: export-phext into a
  fresh folder and open that folder as a disk Cavern.
- Baselines: `test:sqlite` (node --test, serial) 131/131; the phext vitest set
  68/68 serial (12 files, incl. the new exit E2E) and cavern-lifecycle
  3/3; typecheck 0; build 0; boot smoke HTTP 200 with the flag off
  and with it temporarily flipped on (reverted) — under the flag the
  download route answers 409 "Choose a Cavern first." and migrate
  400 on an out-of-root path, i.e. registered and refusing on domain
  grounds. The full `npm test` on this loaded VM (24 min; a present
  `dist/` makes vitest also collect the compiled copies) ended 3010
  passed / 93 failed, every failure in a documented pre-existing
  class: `dist/**` copies are not a test root (module-resolution
  artifacts), the src `.test.mjs` files are node:test suites vitest
  cannot collect (green under node --test), the missing
  `data/raven.json` fixture, and the load-dependent
  application-services/UI timeout class Phase 4 verified identical
  on the pristine base — spot-re-verified here: legacy-codex-import
  and compatible-document fail identically on base ea0c7e8. No
  phext-family src suite failed in any run.

## PhextVFS Phase 3b (2026-11-05) — legacy stores + uploads

The last authored content outside the phext joins it: the legacy
document store, the workspace store, the recognized-document
journal, and the legacy uploads endpoint. After this phase a
phext-mode Cavern accounts for **every** store in its strata
record — there is no standing remaining-on-disk list anymore.

- Shim extension (`server/phext-fs.mjs`): the dispatch carve-out
  that kept all of `.mutable` on real disk gains exactly two
  exceptions — `.mutable` itself (the VFS home directory merging
  strata 3/5/6, so `NativeVaultStore.resolve()`'s lstat-walk can
  enter it) and `.mutable/document-saves/**`, the
  recognized-document journal. No other `.mutable` path crosses:
  knowledge is phext-native since Phase 4 and never travels
  through this facade. `constants` is re-exported for facade
  consumers. One subtlety, found by regression: `statFor` gives
  the `.mutable` home a deterministic synthetic identity instead
  of a registry assignment — `operations()` stats that directory
  from inside discovery fence windows, and a registry assignment
  would dirty `fs-nodes.json`, making the next flush rewrite the
  phext mid-fence ("Vault changed during discovery" in the Phase 4
  knowledge E2E; bisected and fixed, suite green again).
- Legacy stores routed (`server/document-store.ts`,
  `server/workspace-store.ts`, `server/recognized-document-store.mjs`):
  each now imports `promises as fs` from `./phext-fs.mjs` instead
  of `node:fs` — the Phase 3a pattern. Unregistered roots (every
  flag-off and non-Cavern use) fall through to real fs untouched.
  Their tmp+rename publish, `wx` staging, `link` create-only
  publish, confined `realpath` discipline and lock behavior all
  run on the facade's existing operations; document saves remain
  manual (Cmd-S), nothing here adds background saves.
- Discovery cache retired in phext mode
  (`server/vault-listing-cache.mjs`): when a phext backend covers
  the store root, `read()` returns nothing and `write()` is a
  no-op — browse always reconciles, and reconciliation reads the
  VFS directory index scrolls, which are the listing source. On
  disk the cache keeps its exact prior behavior. The Phase 3a
  scenario test that asserted the disk cache file was updated to
  the new contract.
- Uploads embedded (`server/phext-uploads.mjs`, new;
  `server/index.ts`): behind the flag, multer stores through a
  phext-aware engine and `/uploads` is served by a phext static
  handler ahead of the disk one. The engine keeps diskStorage's
  contract — caller-resolved destination with the same Cavern +
  session checks, `Date.now() + ext` filenames, identical file
  info — and writes binary content into the phext (base64-chunked,
  the stratum-6 encoding of Phase 2's managed assets) at the
  file's natural path `/uploads/<name>`, flushing before it
  reports the upload. No backend (disk-mode Cavern) → the engine
  writes real disk itself, byte-identical to the old behavior.
  Flag off, neither piece is wired and the original diskStorage
  stands untouched.
- Build (`scripts/build-history-worker.mjs`): the tsc-compiled
  legacy stores import the facade at runtime, so the build now
  also bundles `server/phext-fs.mjs` → `dist/server/phext-fs.mjs`
  (the native-store pattern). The facade registry lives on
  globalThis, so the bundled copy shares registrations with the
  source module the lifecycle loads by URL. Found by the boot
  smoke: without this, dist cannot boot at all.
- Migration/strata (`server/phext-cavern-transfer.mjs`,
  `server/cavern-lifecycle.ts`): migration classification now
  copies `uploads/**` and `.mutable/document-saves/**` into the
  phext under the same per-file SHA-256 verification (with new
  smoke reads for both), export restores them byte-identically,
  and `REMAINING_ON_DISK` is empty — per-Cavern remainders
  (symlinks, unrecognized `.mutable` remnants) are still computed
  from the manifest and named, never hidden. The strata record
  gains `legacyDocumentStores: 1, documentSavesJournal: 3,
  uploads: 1`. Strata reading, stated plainly: the VFS assigns
  strata by path (Phase 1 design) — the root-tree legacy stores
  ride stratum 1 with the documents, the journal rides the
  `.mutable` stratum (3) whose root is its home, and uploads ride
  their root paths with stratum 6's binary encoding. The Phase 5
  exit E2E's honesty assertions were updated to the new contract
  (records now assert `onDisk: []` for a fully-covered fixture).
- Acceptance: new `server/phext-legacy-e2e.test.ts` — one
  phext-mode Cavern exercising legacy document save/list/load,
  workspace save/list/load, a full recognized-document journal
  save inside the phext, the retired cache, and a binary upload
  round trip through the real multer engine + static handler,
  then cold reopen from the phext alone (including an idempotent
  recognized-save retry). The updated exit E2E covers migration
  of a disk Cavern carrying all three strata. Gates: serial phext
  vitest set 88/88 (16 files, incl. both new/updated E2Es and
  cavern-lifecycle); `test:sqlite`
  131/131; gates node:test 27/28, identical on base (uid-0
  artifact); touched-store flag-off baselines identical to base
  a221108 (document/workspace/listing-cache/vault-lock/collection
  suites 49/49; native + recognized store suites 70 passed / 9
  failed on both trees — the missing `data/raven.json` fixture
  class); typecheck 0; build 0; boot smoke HTTP 200 flag-off and
  flag-on (temporary flip, reverted; `src/configuration.ts` ends
  unmodified at `phextVfs: false`).


## Phext-only cutover (2026-11-05) — no dual mode remains

Will's ruling (2026-11-05, "go full phext"): all silent backwards
compatibility is removed. There is no disk mode, no flag, and no
fallback path left standing; the sections above describe how the
dual-mode world was built, and this section describes the state
that replaces it. Phase 3b is merged into this branch first; its
dual paths were then stripped with everything else's.

**Deleted, not bypassed**

- The `phextVfs` flag: gone from `src/configuration.ts`, every
  conditional, and every flag-parametrized test. Phext mode is the
  only mode.
- phext-fs disk fall-through: paths not covered by a registered
  Cavern phext throw a coded `ENOPHEXT` refusal. The `.mutable`
  carve-outs are gone; `.mutable` is virtual like everything else.
  Real-by-construction exceptions remain only for `cavern.phext*`
  and `.mutable-disk-fallback/` themselves.
- The stage-C gates' disk backend: `filesystem.mjs` is a thin
  dispatch to the phext backend; the disk worker
  (`scripts/stage-c-gates/filesystem-worker.mjs`, 101 lines) is
  deleted.
- The disk multer engine and the disk static `/uploads` mount:
  uploads exist only inside the Cavern phext (phext multer engine +
  VFS static handler from Phase 3b).
- The on-disk discovery cache: `vault-listing-cache.mjs` keeps the
  reconcile (walk, inspect, pair-state derivation) but the cache
  file implementation is deleted — the VFS directory index is the
  listing, every browse reconciles, results are never `cached`.
- The native relocation helper (`server/native-path-move.c`,
  `scripts/build-relocation-helper.mjs`): vault relocation is a
  VFS `renameExclusive`, full stop.
- `src/settings.json` (audit P10): embedded the absolute path
  "/data/the-codex"; no production importer. Git history keeps it.
- The knowledge foundation's disk open path: a vault is its
  phext or it does not open. Restoring a SQLite snapshot is a
  *conversion into* the destination phext (Phase 4.6 converter),
  never a return to disk state.

**Upgrade-on-encounter.** Opening a disk-born Cavern converts it
automatically in the lifecycle, with the Phase 5 discipline:
walk → write → per-file SHA-256 re-read verification. The
`.mutable` directory is preserved as `.mutable-disk-fallback/`;
document originals stay in place, byte-identical but inactive.
Conversion failure (corrupt source, unreadable file, verification
mismatch) refuses the open with an explicit error naming what
failed; originals are untouched and there is no half-converted
state. The L7 cavern-state record (`/.control/cavern-state.json`)
carries the conversion timestamp (`migratedUtc`). The Phase 5
routes (download, open-phext, migrate) keep their contracts.
Client-side, opening a vault that still carries live disk
knowledge refuses and directs the user to open the Cavern through
the server once, rather than minting fresh phext knowledge beside
disk state.

**Settings bundle (audit §2.7, with-the-cutover scope).** Each
Cavern can carry a copy of the user's settings at
`/.control/settings/`, as a per-field scroll tree (never one JSON
blob): `bundle/` (schema version, timestamps, source app version,
optional label), `domains/keybindings/` (per-action trigger
scrolls), `domains/flint-layout/`, `domains/annotation-bar/`,
`domains/editor-interactions/`. Capture is an explicit user
action — "Update Shipped Settings" in the Cavern menu — that
sends the four domains' current values to `POST /settings/capture`
(strict validation; a bad capture writes nothing); `GET /settings`
reads the bundle back. Opening a Cavern **never** imports or
overwrites live settings; import is a separate, later feature, as
is the standalone settings-only extract.

**Addressing (audit §1C items assigned to the cutover).**
P3: Scry usage-history is scoped by the Cavern's `vaultGuid`,
never by absolute vault path. P9: `/.control/fs-nodes.json` is
keyed by coordinate (format v2), with renames carrying entries
old-address → new-address; a v1 path-keyed registry converts in
place on first load. P10 above. After-cutover remainder (not in
this branch): P2 (recents), P4 (relocation intent records), P5/P6
(persisted `DocumentLocation` forms), P7 (in-content upload
references — PL2 territory), the settings import-preview UI, and
the standalone settings extract.

**Untouched by design**: `caverns.json` (installation state),
the `.bak`/anchor/backup mechanism, the ephemeral derived SQLite
replica, and manual document saving (Cmd-S). Two headline E2Es
pin the end state (`server/phext-cutover-e2e.test.ts`):
disk-silence (a full exercise of save/knowledge/upload/history
leaves only `cavern.phext` + mechanism files on disk) and
upgrade-on-encounter (including the corrupt-fixture refusal).


## New files (no rebase risk beyond additions)

- `src/phext/coordinate.ts`, `src/phext/codec.ts`, `src/phext/document.ts`,
  `src/phext/file-io.ts` — the phext module (see PHEXT.md).
- `src/phext/lattice.ts` + `src/phext/lattice.test.ts` — the phext
  processing engine, ported from phext-lattice (`index.rs` + `mmap.rs`);
  see the PhextVFS Phase 1 section above.
- `src/phext/vfs.ts` + `src/phext/vfs.test.ts` — the PhextVFS core
  (virtual fs over one phext per Cavern); see the PhextVFS Phase 1
  section above.
- `scripts/bench-phext-lattice.mjs` — the codec-vs-lattice benchmark
  whose numbers are recorded in the PhextVFS Phase 1 section above.
- `src/phext/default-documents.ts` + `src/phext/default-documents.test.ts` —
  the bundled default phexts (CYOA, Incipit): runtime conversion with
  stable document ids.
- `src/assets/hosted/phext/choose-your-own-adventure.phext`,
  `src/assets/hosted/phext/incipit.phext` — the canonical phext payloads
  (copied byte-for-byte from wbic16/human; SHA-256
  `75f13961787d773af060a603e1b3d0d114affcbc13948cd6aaa925f451e3a4d6` and
  `9a4a7ff7cca3eabdcdbbd574e675da1fc3ea15a26d9e1826f009cc0186eae655`),
  imported by URL so they ship inside the built site's `dist/assets/`.
- `src/knowledge-sqlite/advisory-lock.mjs` — advisory lock with a native
  fs-ext flock fast path and a portable token-file fallback (see the
  live-site fixes table above).
- `scripts/stage-c-gates/flock.mjs` — the stage-C gates' lock helper:
  lazy fs-ext load with the same native fast path / token-file fallback
  shape, keyed by the lock file's verified identity (see the live-site
  fixes table above). `scripts/stage-c-gates/flock.test.mjs` is its
  contention / shared-coexistence / crash-recovery suite.
- `scripts/stage-c-gates/phext-backend.mjs` — the PhextVFS Phase 2
  gates backend (op vocabulary over one Cavern phext; identity tokens,
  anchor flocks, flush policy — see the Phase 2 section above).
- `server/phext-gates-backend.test.ts`,
  `server/phext-history.test.ts` — the Phase 2 backend suite and the
  history-store consumer proof; see the Phase 2 section above.
- `server/phext-fs.mjs` — the PhextVFS Phase 3a facade: the subset of
  `node:fs/promises` the native stores use, implemented over one
  Cavern phext, with real flock anchors for lock paths, an L7 node
  registry for identities/stamps, and raw block-boundary slicing for
  native documents; see the Phase 3a section above.
- `server/phext-fs.test.mjs`, `server/phext-docs-scenario.test.mjs`,
  `server/phext-docs-e2e.test.ts` — the Phase 3a shim unit suite, the
  store-level phext-mode scenarios, and the routes-level end-to-end
  (the E2E is `.ts` with the node test environment because the gates
  module's top-level `import.meta.url` must survive vitest's module
  pipeline — the same reason the Phase 2 consumer suites are `.ts`).
- `server/native-vault-store-lock.test.mjs` — the native vault store
  lock's fs-ext-absent regression suite (action runs, contention
  message, cross-process crash recovery).
- `src/knowledge-sqlite/phext-registry.mjs` — the Phase 4 mode
  registry (globalThis-held, per the phext-fs pattern): which Cavern
  roots keep knowledge in the phext, registered by the lifecycle and
  consulted by the client, the host and direct foundation opens.
- `src/knowledge-sqlite/phext-store.mjs` — the L3 knowledge store:
  canonical records / proposition aggregates / outbox / audit as
  files in the phext over an injected PhextVFS instance, plus the
  control record (see the Phase 4 section for its placement note).
- `src/knowledge-sqlite/phext-ledger.mjs` — the canonical ledger
  ported to L3 with its transaction discipline unchanged.
- `src/knowledge-sqlite/phext-foundation.mjs` — the foundation swap:
  same store shape as `foundation.mjs`, L3 canonical + ephemeral
  replica; establishment and audit posture per the Phase 4 section.
- `src/knowledge-sqlite/phext-convert.mjs` — disk→L3 conversion with
  count/hash/fingerprint verification, and the L3→SQLite export in
  `mutable-sqlite-backup` format (also the phext `backup()`).
- `src/knowledge-sqlite/phext-knowledge.test.ts`,
  `src/knowledge-sqlite/phext-convert.test.ts`,
  `src/knowledge-sqlite/phext-worker.test.mjs`,
  `server/phext-knowledge-e2e.test.ts` — the Phase 4 acceptance
  suites; see the Phase 4 section above.
- `src/phext/codec.test.ts`, `src/phext/document.test.ts`,
  `src/demo/phext-menu.test.tsx` — tests.
- `deploy/deploy.sh`, `deploy/deploy.md`,
  `deploy/nginx-mutable.phext.io.conf`, `deploy/mutable-os.service` —
  hosting for mutable.phext.io.
- `server/phext-cavern-transfer.mjs` — the Phase 5 transfer module
  (migration, export, xz seal, open-from-phext); see the Phase 5
  section above.
- `server/phext-exit-e2e.test.ts` — the Phase 5 exit-ramp E2E.
- `server/phext-uploads.mjs` — the Phase 3b phext-aware multer
  storage engine + `/uploads` static handler.
- `server/phext-legacy-e2e.test.ts` — the Phase 3b acceptance E2E.
- `server/phext-settings.mjs` + `server/phext-settings.test.mjs` —
  the cutover settings bundle (L7 `/.control/settings/` per-field
  scroll tree; validate/write/read); see the cutover section above.
- `src/application/settings-snapshot.ts` — the client's settings
  capture snapshot (the four domains' persisted live values).
- `server/phext-cutover-e2e.test.ts` — the cutover headline E2Es
  (disk-silence; upgrade-on-encounter + corrupt refusal).
- `src/knowledge-sqlite/phext-test-cavern.mjs` — the shared test
  helper that registers a temp directory as a real Cavern
  (phext-fs + gates + knowledge registries) for in-process suites.
- `PATCHES.md`, `PHEXT.md` — this file and the phext design notes.

## Rebase flow

```bash
git remote add upstream https://github.com/argimenes/mutable-os.git  # once
git fetch upstream
git checkout emise/phext-support
git rebase upstream/main
npm test && npm run typecheck && npm run build
```

Conflicts are expected only in the two modified files above:

- `src/configuration.ts` — keep both flag sets; `phextDocuments` must stay
  declared and defaulted.
- `src/demo/workspace-demo.tsx` — keep the phext buttons in the Local
  files group(s) and the handlers in `DemoSession`.

The `src/phext/` module imports only `../block-tree/types`
(`ExistingBlockDto`), `../block-tree/codecs` (tests only), and
`../demo/browser-json-file` (a type-only import). If upstream renames any
of those, the fix is confined to `src/phext/` plus the two wiring files.
