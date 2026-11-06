# Patches on upstream
## Landing state (2026-11-05)

This file is the complete record of the fork's phext-support work. As of
2026-11-05 the work lands as **one commit** on upstream
`be4e520f3aaa716f569fd92808522c67605aed0b` — see "Rebase onto upstream
be4e520 (2026-11-05)" and the accounting appendix at the end of this
file. The sections between here and there are the development provenance:
per-phase notes written as the work happened, describing intermediate
states (including the dual-mode build the final state deletes). Read
them as history; read the appendix as the final state.


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

**Two phext-mode lookup fixes found by the cutover test conversions.**
(1) The entity-lookup read cache keyed its invalidation solely on
SQLite `data_version`, which never moves for same-connection commits;
the phext replica is single-connection (one worker), so cached lookup
results — including empty mention searches — never invalidated.
`entity-lookup.mjs` now pairs `data_version` with `total_changes()`,
the same formula as `reconcile.mjs`'s `sqlRevision`.
(2) Derived document rows (Blocks/StandoffProperties) are ephemeral in
phext mode: they exist only in the open Vault worker's replica and are
never canonical store records, so the read-only reader replica used by
`SqliteKnowledgeHost.entityLookup` could never see saved mentions.
Lookups now route to the live worker when the Vault is open; the
reader still serves unopened Vaults (canonical names/aliases/get;
mentions there report as unindexed, per the lookup's own diagnostics).


## High-severity fixes (2026-11-05) — drain wedge, xz bomb, upload limits

Three findings from the 2026-11-05 bug hunt (H1–H3), each a
single-request wedge or kill inside the accepted public-writable
posture; each fix lands with its regression test.

**H1 — the Cavern-switch drain wait is bounded.**
`server/cavern-lifecycle.ts`: `establish()` waited for the
in-flight API request counter to drain on a promise with no
timeout and no rejection path; one request that never finishes
(a dead client, a half-open socket) wedged every lifecycle
operation until restart. The wait now races `DRAIN_TIMEOUT_MS`
(15 s; injectable via `createCavernLifecycle` options for tests):
on timeout the switch proceeds, logs a warning, and the session
fence rejects the stragglers. `close()` bounds its wait on the
serial queue the same way. Normal switches — requests that
finish promptly — never see the timeout.
(`server/cavern-lifecycle.test.ts`: a request held in flight
through the counting middleware; the switch completes.)

**H2 — unseal decompression is capped and streamed; filter
children are time-bounded.** `server/phext-cavern-transfer.mjs`:
the 512 MiB open-phext cap bounds the *sealed* bytes, but
`unsealPhext` decompressed through a buffer-everything filter —
a crafted seal expands thousands-to-one until the process dies.
Decompression now streams to a temp file under a hard output cap
(`MAX_UNSEALED_PHEXT_BYTES` = 512 MiB, matching the upload cap):
past the cap the child is killed and the seal refused with a
clear error; `xz -t` verification still runs before anything
decompresses. `runFilter` (seal/verify) gains a child timeout
(`FILTER_TIMEOUT_MS` = 300 s); the seal path takes no output
cap, because compression output is smaller than its input by
construction — legitimate sealing of a ≤512 MiB phext is
unaffected. (`server/phext-cavern-transfer.test.ts`: a small
seal of zeros refused at a test-lowered cap; the same seal
unlocks byte-identical under the real cap.)

**H3 — `/upload` is capped at the boundary and inside the
engine.** `server/index.ts` + `server/phext-uploads.mjs`: the
route had no limits at all and the engine buffered every file
whole. The ceilings are exported from the engine module
(`MAX_UPLOAD_FILE_BYTES` = 20 MiB — the native-document scale;
`MAX_UPLOAD_FILES` = 8 — the client's one call site,
universe-block's `saveImageToServer`, posts a single image per
request) and applied as multer `limits`; the engine enforces
the per-file cap itself as defence in depth, dropping bytes
past the cap and refusing the file whole. Limit refusals now
surface as the app's JSON envelope (`{ Success: false, Error }`)
instead of the ad-hoc `{ message }` body. Ride-along (bug hunt
L2): the file filter's double callback on non-images is reduced
to the single error callback the envelope path depends on.
(`server/phext-uploads.test.ts`: engine refusal with nothing
written, HTTP oversize/over-count refusals in the envelope, a
normal upload landing byte-identical.)

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

## Rebase onto upstream be4e520 (2026-11-05)

The fork's whole divergence — 100 commits at the time: 94 to the
phext-only cutover (including the two production lookup fixes the test
conversions surfaced), then the three high-severity fixes H1–H3 — was
squashed to its final tree and applied as **one commit** on upstream
HEAD `be4e520f3aaa716f569fd92808522c67605aed0b` ("Added standoff-code-block",
2026-11-06 14:07:23 +1000), re-pinned at execution time (upstream had not
moved since the review). This file is the complete record of that commit.

**What upstream did in its 14 commits since the fork point `cb47fb72`** —
all client-side; zero changes to `server/`, the knowledge layer, build
config, or `.nvmrc`: Textual (11 commits — a measured character-cell
workspace presentation of the same Cavern, plus the editor/explorer
fixes it shook out), the Universal Application Presentation Contract
(`797c069` — a runtime registry for one application presenting through
several surfaces), font settings with bundled IBM Plex Mono (`23ae138`),
and Lezer-based session-only highlighting for standoff code blocks
(`be4e520` — also upstream's only dependency change: `+@lezer/javascript
^1.5.6`, `+@lezer/highlight ^1.2.5`). All of it arrives via the parent
commit; the one commit changes none of it except as noted below.

**Prior updates made during the rebase** (places where the fork's
assumptions were reconciled against upstream's movement):

- `package.json` — the one real conflict of the rebase (measured in
  advance by trial merge; the auto-merge surface was exactly 4 files).
  Resolved as the fork's refreshed toolchain (vite 8, TypeScript 6,
  vitest 5, express 5, surrealdb 2.2 / @surrealdb/node 3.2, …) **plus**
  upstream's two `@lezer/*` additions. The resolved file is the fork's
  `package.json` with exactly those two dependency lines added.
- `package-lock.json` — **regenerated** with `npm install
  --legacy-peer-deps --ignore-scripts` from the resolved `package.json`;
  never hand-merged.
- `src/configuration.ts` — auto-merged: both sides were purely additive.
  The landed file carries upstream's four new flags
  (`standoffCodeHighlighting`, `applicationPresentations`,
  `textualFontSettings`, `textualWorkspace`) beside the fork's
  `phextDocuments`. (The `phextVfs` flag the fork's history added was
  deleted again by the cutover — a net no-op, and the cleanest single
  argument for squashing the final tree instead of the history.)
- `src/application/document-save.test.tsx` — auto-merged: upstream's
  appended Save-As test and the fork's phext-fs fixture rewire coexist.
- The fork's 4 deleted files were untouched upstream — no
  modify/delete conflicts; the deletions stand.
- **Toolchain asymmetry (the standing prior to verify, not assume):**
  upstream qualified its new code on vite 4 / TypeScript 5.6; the fork
  runs vite 8 / TypeScript 6. The qualification below therefore runs
  upstream's own check scripts on the rebased tree.
- **Font settings are a fifth user-settings domain** the L7 settings
  bundle (phase: cutover) does not capture. Recorded as a named
  follow-up, not a rebase blocker.

### Rebase compatibility fixes

None required. The rebased tree typechecked, built, and passed the
qualification gates below with no source changes beyond the resolutions
above. (Any fix found necessary in a future rebase gets logged here, in
this section, in the same commit.)

### Qualification (2026-11-05, on the rebased tree)

Results (2026-11-05, scratch clone on this VM — Node v24.22.1 / npm 10.9.4; the project pins Node 22.12.0 in .nvmrc):

- **Install:** `npm install --legacy-peer-deps --ignore-scripts` — clean. (Those flags are the repo's known on-box flags; a script-enabled install fails in this environment because better-sqlite3's node-gyp build does not support Node 24 — its shipped prebuilds load fine with scripts skipped.)
- **`npm run build`: PASS** — Vite client build, `tsc` server project, history-worker and sqlite-foundation staging scripts; `dist/server/index.js` and `dist/index.html` produced.
- **`npm run typecheck`: PASS (exit 0)** — both `tsconfig.reactive.json` and `tsconfig.server.json`, run on the built tree. (Run before a build, it reports TS2307 for test files that import built `dist/` modules — a pre-existing build-order property of the repo, not a rebase effect.)
- **Serial phext vitest set: PASS — 94/94 tests across 19 files** (`npx vitest run --maxWorkers=1` over the phext VFS/lattice/codec, documents, gates, knowledge, history, uploads, transfer, lifecycle and end-to-end suites). The twentieth phext suite, `server/phext-settings.test.mjs`, is a node:test file: **`node --test` — 4/4 pass.**
- **`npm run test:sqlite`: PASS — 125/125 tests across the 14 `src/knowledge-sqlite/*.test.mjs` files** (run serially per file with the script's `--test-concurrency=1`).
- **Boot smoke: PASS** — the built server, started against a fresh temporary config home, answers `POST /api/cavern/startup` with HTTP 200 `{"Success":true,...}`.
- **Upstream's browser check scripts (10: `check-textual-*-browser`, `check-standoff-code-browser`, `check-application-presentations-browser`): not runnable to completion in this environment — and not because of the rebase.** The fixture-dependent scripts fail immediately on `vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink`, a file from the upstream author's local vaults directory: `vaults/` is gitignored and absent from upstream's own tree, so the scripts cannot run from any clean checkout. The remaining scripts proceed through Vite dev-server creation — no Vite 8 API errors, a positive compatibility signal, since upstream qualified them on Vite 4 — and fail only at browser launch: this VM's Chromium build refuses to start without its sandbox policy ("Hatch WebGL domain policy is required for browser startup"), an environment property unrelated to the codebase.
- **Environment note:** qualification ran through intermittent VM write-freeze episodes (writes failing with EPERM for minutes at a time) and contention on the per-user Vault establishment lock from a leftover server process. Every contaminated run was discarded and re-earned in a clean window; all results above are from clean runs, and the previously failing knowledge suites (host, phext-worker, vault-scope) pass 6/6, 1/1 and 5/5 respectively on the rebased tree — and pass identically on the pre-rebase tree, confirming no rebase regression.


## Mode selection (2026-11-06) — per-Cavern Native/Phext choice restored

The phext-only cutover is superseded by a **per-Cavern storage mode**,
per the ratified design (`mode-selection-design.md` in the fork's
working papers): the user chooses **Native** or **Phext** at Cavern
create/open; there is **no global flag** (the design addresses the
repo's feature-flag convention directly: the per-Cavern marker *is*
the switch, and the deleted `phextVfs` flag is not restored). The mode
is recorded in the Cavern's own state record — L7
`/.control/cavern-state.json` (`mode: "phext"`) on the phext side,
`.mutable/cavern-state.json` on the native side — and `caverns.json`
caches it for recents badging only. One resolver
(`resolveMode` in `server/cavern-lifecycle.ts`) interprets records and
layout: marker governs; absent a marker, phext-only layout → phext,
disk-only → native, neither → not a Cavern, **both layouts with no
marker → refuse and ask**. New Caverns default to Phext pre-selected.
The restoration re-widens the six dual-dispatch modules the cutover
narrowed, recovering their disk branches from the pre-cutover history
(commit `01f03de`); in every subsystem the mode signal is
**registration**: the lifecycle registers the phext backends only for
a phext-mode Cavern, and absence of registration is the disk signal.
The native → phext **upgrade is non-destructive**: the verified
migration generates `cavern.phext` and records the mode inside it as
the commit point; the native tree stays byte-for-byte in place as a
frozen snapshot (no rename-aside, no fallback directory). Phext →
Native remains the export, which now writes the native marker into
the exported folder. Standalone SurrealDB mounts are native by
definition (no Cavern, no mode). Saves stay manual in both modes.

### Files — implementation

- `server/cavern-lifecycle.ts` (modified) — the integration point.
  `resolveMode` (records + layout, §2.4); `stores(root, mode)` opens
  the PhextVFS and registers the gates backend, the phext-fs facade
  and the knowledge registry **only in phext mode** (native mode
  leaves `phextReady` undefined, which every existing await already
  tolerates); `establish` honors a requested mode only where a choice
  exists (setup, and as the answer to the ambiguous layout), records
  an explicit answer in the marker *before* the open (the answer is
  the user's act, and the knowledge layer's own derivation must see
  it during the open), writes a derived/recorded marker after a
  successful open (a failed open leaves the folder byte-identical),
  and generates a phext only when phext is the resolved/chosen mode
  for a content folder that has none. `convertIfDiskBorn` is deleted
  — opening never converts. Download and settings routes gate on the
  runtime's mode with the §3.2 refusal ("This Cavern is in Native
  mode; upgrade it to Phext to use this."). New `POST /api/cavern/
  close` route: the close primitive the Cavern menu's upgrade
  composition (close → migrate → establish) requires. Recents entries
  carry `mode` as a display cache.
- `server/phext-cavern-transfer.mjs` (modified) — the migration is
  the non-destructive upgrade: the `.mutable` rename-aside and its
  rollback are deleted, the fallback-exists precondition is dropped,
  the migration record carries `fallback: null` and `onDisk` = the
  **entire native manifest**, and the L7 cavern-state written into
  the published phext gains `mode: 'phext'`. The single phext rename
  remains the only publish step. Export writes
  `.mutable/cavern-state.json` (`mode: 'native'`, the exported
  Cavern's guid) into the destination folder (§4.5).
- `src/knowledge-sqlite/foundation.mjs` (modified) — the dual
  foundation restored: signal resolution (injected worker context →
  lifecycle registry → explicit request, failing closed when phext
  is requested without an instance), else the disk branch
  (`openValidatedFoundation` + `configure`/`initialize`/`checkFiles`,
  recovered from `01f03de`). `restoreSnapshot` dispatches on the vfs
  argument. The cutover's disk-knowledge refusal changed sides: it
  now guards only the disk branch (`refuseAmbiguousDiskOpen` —
  both stores present and no native record → refuse), because on the
  phext branch a snapshot `.mutable/mutable.db` beside the phext is
  the normal post-upgrade state.
- `src/knowledge-sqlite/client.mjs` (modified) — host-side mode
  resolution mirroring §2.4: explicit string > registry > recorded
  mode > layout. The phext-side record is read through a brief
  read-only VFS open and **governs even beside a stale native
  record** (the only supported flow leaving both records is the
  upgrade, whose commit point is the phext record — §4.3: a direct
  client open must never write the frozen snapshot DB). Both stores
  present with no governing record throws. The writer-lease grant
  follows the resolved mode (`phextWriterLease` vs the restored
  disk `writerLock`). A snapshot restore follows the destination's
  resolved mode — it converts into a registered/recorded phext
  destination and restores to disk at a plain one.
- `src/knowledge-sqlite/worker-entry.mjs` (modified) — the worker
  takes its mode from `workerData`: a host-resolved phext path means
  phext (own PhextVFS, current creation discipline, phext lease and
  restore-convert); no path means native (`prepareHome` disk home,
  disk lease request, disk restore). Read-only guards unchanged and
  first.
- `src/knowledge-sqlite/paths.mjs` (modified) — `prepareHome` and
  `writerLock` restored from `01f03de`: the disk foundation's home
  preparation and cross-process writer lock.
- `scripts/stage-c-gates/filesystem.mjs` (modified) — merged
  dispatch keyed on registration: a registered root is served by the
  phext backend for the whole tree; an unregistered root by the disk
  backend through worker sessions. (The `01f03de` tree-start
  crossover dispatch was *not* restored: the cutover widened the
  phext backend to serve documents too, so the crossover would route
  a phext Cavern's document pins to disk. Registration is the
  design's §3.1 signal.) One adaptation from `01f03de`: the worker
  path is resolved lazily at first disk use — this module is
  statically imported by vitest suites (via the test-Cavern helper),
  where `import.meta.url` is not a file URL, and the phext backend
  must stay loadable there; disk sessions run under native loads.
- `server/sqlite-knowledge-host.ts` (modified) — the cutover's
  phext-only existence probe widened to the mode model:
  `knowledgeProbe` accepts either knowledge store (the Cavern phext
  or `.mutable/mutable.db`) as proof of an established Vault, and
  the read-only reader's identity stamp tracks whichever store file
  the Vault actually has. Without this, every knowledge mutation
  route refused in native mode with an ENOENT on the absent phext.
- `scripts/stage-c-gates/filesystem-worker.mjs` (added) — restored
  verbatim from `01f03de`: the disk backend's worker (directory
  pins, iteration, file locks).
- `server/phext-fs.mjs` (modified) — the dispatch tail reverted: no
  registered backend → the facade falls through to real fs;
  the `ENOPHEXT` refusal is deleted. Registered roots are unchanged,
  including the cutover's no-carve-out rule for `.mutable` (design
  §1.2: not restored).
- `server/vault-listing-cache.mjs` (modified) — the persisted
  discovery cache restored **native-only** (gated on registration
  absence); phext mode keeps the in-memory/rebuild behavior, since
  a cache file inside the VFS would be stored state the cutover
  deliberately removed.
- `server/index.ts` (modified) — uploads follow the current
  Cavern's mode per request: a delegating multer storage chooses
  the phext engine or a restored `multer.diskStorage` (the Cavern's
  real `uploads/`, created on demand; standalone mounts use the
  relative folder) behind one shared `X-Mutable-Cavern` session
  fence; H3's limits stay on the single multer instance. `/uploads`
  dispatches to the phext static handler or `express.static` by
  mode, and refuses with 409 when no Cavern is current.
- `src/application/cavern-startup.tsx` (modified) — the choice in
  the main UI flow (discoverability): a Native/Phext control with
  one-line descriptions in the create form and the folder-setup
  screen, **Phext pre-selected**; a derived mode is shown as a fact
  screen once ("This is a Native/Phext Cavern"); an ambiguous
  layout asks "Which copy should Mutable use?" with the two answers
  as primary actions; recents rows badge the cached mode; the
  Cavern menu names the current mode, keeps Download / Update
  Shipped Settings visible in native mode but disabled with the
  §3.2 reason, and offers **Upgrade to Phext…** with the terms
  stated up front (phext generated and verified; existing files
  stay in place unchanged as a snapshot Mutable will no longer
  update; the Cavern reopens in Phext mode).
- `src/application/cavern-startup.css` (modified) — mode badge,
  mode-choice fieldset, and menu mode-line styles.

### Files — tests

- `server/cavern-lifecycle.test.ts` (modified) — new mode suite:
  the inspect matrix (every §2.4 row, marker and derived), the
  ambiguity refusal and both answers becoming the marker, a native
  create (no phext written, marker + recents cache), the exact
  §3.2 refusal on download/settings/capture in native mode, and a
  recorded phext mode governing beside a snapshot knowledge home.
- `server/phext-cutover-e2e.test.ts` (modified) — (a) disk-silence
  now also asserts the phext default and its L7 record; (b)
  rewritten: a disk-born Cavern **derives native** and opens
  natively (no conversion, disk knowledge live, marker recorded);
  (c) new: the explicit upgrade — native tree hash-identical across
  migrate, `fallback: null`, onDisk naming the whole tree, phext
  marker governing the reopen, post-flip writes landing in the
  phext while snapshot hashes never move; (b2) a corrupt fixture
  is refused with originals byte-identical and no phext created.
- `server/phext-exit-e2e.test.ts` (modified) — migration assertions
  moved to the non-destructive record (onDisk = whole manifest,
  `fallback: null`, `.mutable` in place byte-for-byte, mode in the
  L7 state); the phext-alone readback deletes the snapshot instead
  of renaming a fallback away; export asserts the §4.5 native
  marker. Refusal shapes otherwise unchanged.
- `server/phext-fs.test.mjs` (modified) — the cutover `ENOPHEXT`
  test rewritten as the dual contract: `.mutable` stays virtual
  under a registered root; unregistered roots fall through to real
  disk again.
- `src/knowledge-sqlite/foundation.test.mjs` (modified) — the two
  snapshot-restore tests register the destination Cavern first:
  restore follows the destination's signal, and a plain folder
  restores to disk (the disk suite's branch). Assertions unchanged.
- `src/knowledge-sqlite/foundation-disk.test.mjs` (added) — the
  `01f03de` disk-foundation suite restored beside the phext suite.
- `scripts/stage-c-gates/storage-disk.test.mjs` (added) — the
  `01f03de` disk-backend suite restored. One reconciliation: the
  read-only-journal test obstructs the journal with a directory
  instead of `chmod 0o444` (these suites run as root, where mode
  bits do not refuse writes) and accepts the writer's
  "not a regular file" refusal — the same device the phext suite
  already uses.
- `scripts/stage-c-gates/flock-disk.test.mjs` (added) — the
  `01f03de` flock suite restored verbatim.

### Qualification (2026-11-06)

Results (2026-11-06, this VM — Node v24.22.1; the project pins Node 22.12.0 in .nvmrc). Every tally below is from a clean run; two contaminated runs (a mid-edit `test:sqlite` and the first vitest pass, which caught two real defects — the knowledge host's phext-only probe and a vitest-SSR module-load failure in the restored gates dispatch) were discarded, the defects fixed, and the sets re-run in full.

- **`npm run typecheck`: PASS (exit 0)** — both `tsconfig.reactive.json` and `tsconfig.server.json`.
- **`npm run build`: PASS** — Vite client build, `tsc` server project, history-worker and sqlite-foundation staging; the built server is what the boot smoke below runs.
- **Serial phext vitest set: PASS — 108/108 tests across 19 files** (`npx vitest run --maxWorkers=1`: the five `src/phext` suites, eleven `server/phext-*` suites, `server/cavern-lifecycle.test.ts`, `server/vault-listing-cache.test.mjs`, `src/application/cavern-startup.test.tsx`). The set includes the new mode tests: lifecycle mode suite 6/6, cutover E2E 4/4 (native derivation, explicit upgrade, corrupt refusal), exit E2E 4/4 on the non-destructive record.
- **Knowledge-host consumer suites: 60/63 across 8 files** (serial vitest: `sqlite-knowledge-host`, `entity-lookup`, `entity-mutate`, `entity-search`, `native-knowledge`, `thesis`, `sqlite-semantic-services`, `sqlite-saved-scope`) — run because this step widened the host's probe. The 3 failures (two SurrealDB-backed `entity-search` creations that cannot confirm against a SurrealDB connection in this environment, one `native-knowledge` timeout test) **reproduce identically on the base commit `dc81ad68`** — pre-existing environmental failures, not step-3 regressions; everything touching the widened probe (host, lookup, mutate, thesis, semantic services, saved scope) passes.
- **`npm run test:sqlite`: PASS — 168/168 across the 15 `src/knowledge-sqlite/*.test.mjs` files**, including the restored disk-foundation suite (24 tests) beside the phext suite (19). (The step-2 tally of 125/125 across 14 files was recorded on the same tree minus the disk suite; `node --test` counts subtests, and the two tallies' bases were not itemized against each other — what is comparable is that every file passes in full, both branches included.)
- **Gates node suites: PASS — 52/52** (`node --test --test-concurrency=1` over the phext `storage.test.mjs`/`flock.test.mjs` and the restored `storage-disk.test.mjs` 23/23 + `flock-disk.test.mjs` 3/3).
- **Phext settings node tests: PASS — 4/4** (`node --test server/phext-settings.test.mjs`).
- **Boot smoke: PASS — 14/14 checks.** The built server, against a fresh temporary config home: a COPY of a native-layout fixture Cavern opens in native mode (marker recorded, no phext appears); a phext Cavern created by the built server defaults to phext; a COPY of it opens in phext mode; after a restart, startup auto-restores the phext copy in phext mode.

## Appendix — complete per-file accounting (final state)

Every file the one-commit landing changes relative to its upstream
parent `be4e520` is listed below: **151 files — 55 added, 92 modified,
4 deleted — 151 of 151.** Files are grouped by the theme that owns them
in the final tree (the partition the review used); a file serving
several themes is listed once, under its owning theme, with
cross-references at the end. Necessity classes: **[phext-storage]**
required for a Cavern's data to live in one phext; **[correctness]** a
bug fix independent of phext; **[deploy]** required to build/host/operate
the site; **[upstream-compat]** keeps the fork current against moving
dependencies and APIs; **[test]** coverage for the above. The phase
sections earlier in this file carry the fuller narrative for most of
these files; this appendix is the checklist that nothing is missing.

### Theme 01 — deploy: mutable.phext.io hosting (5 files)

Mechanism: `deploy.sh` is the single on-box path (install with
`npm ci --legacy-peer-deps --ignore-scripts`, build client+server,
restart the unit); the systemd unit runs the built server as `wbic16`
on `127.0.0.1:3003` with heap/memory ceilings sized from measured
footprint; nginx terminates TLS and proxies with
`proxy_http_version 1.1`.

- `deploy/deploy.sh` (added) — the on-box deploy path itself. [deploy]
- `deploy/deploy.md` (added) — the measurements behind the sizing. [deploy]
- `deploy/mutable-os.service` (added) — systemd unit for the site. [deploy]
- `deploy/nginx-mutable.phext.io.conf` (added) — the site's vhost. [deploy]
- `index.html` (modified) — `<title>Solid App</title>` → `<title>Mutable</title>`; the template placeholder on a production site. [correctness]

### Theme 02 — deps: dependency refresh + forward API fixes (10 files)

Mechanism: dependencies moved to latest majors (vite 4→8, vitest 2→5,
express 4→5, surrealdb 1.3.2→2.2.1, @surrealdb/node →3.2, typescript
5.9→6.0, pdfjs-dist 5.4→6.5, three →0.187, mermaid →12.3, @types/node
22→26; 670→590 packages); where a major broke the build, the fix was
made forward at the call site. Staying current is what keeps the rest
of the fork cheap to rebase, and vite 8 cut the client-build heap floor
on the small host from 3,072 MB to ≤1,024 MB.

- `package.json` (modified) — the version set itself; see the rebase
  section for its resolution against upstream's `@lezer/*` additions. [upstream-compat] [deploy]
- `package-lock.json` (modified) — regenerated from `package.json`, never hand-merged. [upstream-compat]
- `server/index.ts` — carries this theme's surrealdb builder-API renames, but is owned by theme 08; see cross-references.
- `server/application-services/executor.ts` (modified) — worker `'error'` payload normalised before logging (@types/node 26 types it `unknown`). [upstream-compat]
- `server/native-knowledge-jobs.ts` (modified) — same worker-error normalisation. [upstream-compat]
- `server/application-services/pdf-inspection.ts` (modified) — removed `isEvalSupported` option (pdfjs-dist 6 deleted it; TS2353). [upstream-compat]
- `src/pdf/viewer.ts` (modified) — same pdfjs option removal. [upstream-compat]
- `src/academic/bibliography.ts` (modified) — parser imported from `@retorquere/bibtex-parser/js`: v13's root entry is a WASM build that crashes uninitialized outside bundlers; the `/js` subpath is the same parser's pure-JS build. [correctness]
- `src/application/anchor-capabilities.ts` (modified) — `!!` coercion: TS 6 types `HTMLElement.hidden` as `boolean | "until-found"`. [upstream-compat]
- `src/features/phosphor/studio-drift.ts` (modified) — same `!!` coercion. [upstream-compat]
- `server/entity-search.test.ts` (modified) — one-line surrealdb engine-factory rename matching the server change. [upstream-compat]

Held back deliberately: typescript stays at ^6.0.0 — surrealdb 2.2.1's
peer range excludes the 7.x line (npm ERESOLVE).

### Theme 03 — fix: portable locking when fs-ext is absent (7 files)

Mechanism: two helpers (`advisory-lock.mjs` for the knowledge layer,
`flock.mjs` for the stage-C gates) load the fs-ext native binding lazily
via `createRequire`; when usable, locking is the native flock, byte-for-byte
the old behaviour; when absent, a portable O_EXCL token-file lock where
only genuine contention reports `EWOULDBLOCK` and dead holders' tokens
are pruned. Root cause of three live production failures: upstream
assumed the optional binding always exists, and `require('fs-ext')`
itself threw wherever install scripts had not run.

- `src/knowledge-sqlite/advisory-lock.mjs` (added) — the knowledge layer's lazy flock helper with token fallback. [correctness]
- `scripts/stage-c-gates/flock.mjs` (added) — the gates' helper; locks keyed by the lock file's verified dev+ino identity, shared/exclusive semantics. [correctness]
- `scripts/stage-c-gates/flock.test.mjs` (added) — contention code, shared coexistence, cross-process crash recovery. [test]
- `server/native-vault-store-lock.test.mjs` (added) — store-level "action runs / contention message" contracts. [test]
- `src/knowledge-sqlite/vault-scope.mjs` (modified) — establishment lock routed through the helper: only genuine contention yields "Another Vault establishment is in progress" (vault creation previously always failed with that misleading message). Also carries theme 07's phext scope-inspection mode. [correctness]
- `src/knowledge-sqlite/paths.mjs` (modified) — the SQLite writer lease through the same helper; the next wall in the same flow. [correctness]
- `scripts/sqlite-foundation.mjs` (modified) — the disposable-store reset allowlists its own fallback token (`writer.lock.holder`) instead of rejecting the store it guards. [correctness]

### Theme 04 — phext: codec, Document mapping, bundled texts, Workspace wiring (14 files)

Mechanism: the client phext module — `coordinate.ts` defines the
9-component address; `codec.ts` the delimiter set (ASCII control bytes,
themselves valid UTF-8, so every scroll is valid UTF-8 text);
`document.ts` maps a Mutable Document's block tree to scrolls and back;
`file-io.ts` reads/writes `.phext` via browser file APIs. In the
Workspace demo, Open/Export Phext plug into the existing Local open flow
(`documents.guard` + `onOpenLocal`) and `editor.encodeDocument()` —
explicit file actions, not a storage change; the typing path is
untouched. `default-documents.ts` turns the two bundled texts (the
canonical wbic16/human CYOA and Incipit) into Documents with stable ids.

- `src/phext/codec.ts` (added) — delimiter codec for phext interchange. [phext-storage]
- `src/phext/coordinate.ts` (added) — the 9-component coordinate type and parsing. [phext-storage]
- `src/phext/document.ts` (added) — Document ↔ scrolls mapping. [phext-storage]
- `src/phext/file-io.ts` (added) — browser `.phext` read/write. [phext-storage]
- `src/phext/default-documents.ts` (added) — bundled CYOA/Incipit → Documents with stable ids. [phext-storage]
- `src/phext/codec.test.ts` (added) — codec round-trip coverage. [test]
- `src/phext/document.test.ts` (added) — mapping round-trip fidelity. [test]
- `src/phext/default-documents.test.ts` (added) — bundled-text conversion coverage. [test]
- `src/demo/phext-menu.test.tsx` (added) — menu wiring coverage. [test]
- `PHEXT.md` (added) — the module's design notes. [phext-storage]
- `src/assets/hosted/phext/choose-your-own-adventure.phext` (added) — CYOA ships with the site by default (canonical copy). [phext-storage]
- `src/assets/hosted/phext/incipit.phext` (added) — Incipit ships with the site by default (canonical copy). [phext-storage]
- `src/configuration.ts` (modified) — +2 lines: the `phextDocuments` flag (house rule: major features behind a flag, enabled by default). At the rebase this file also carries upstream's four flags via the parent; this commit's own delta is the two lines. [upstream-compat]
- `src/demo/workspace-demo.tsx` (modified) — additive hunks: Open/Export Phext and the two bundled-text buttons in both Local-files surfaces under the flag. Discoverability: the Workspace menu is where a fresh visitor lands. [phext-storage]

### Theme 05 — phext-vfs: lattice engine + VFS core (5 files)

Mechanism: `lattice.ts` is a faithful TypeScript port of the
phext-lattice engine (same author, MIT): one buffer scan builds a
coordinate → byte-span index (O(1) scroll reads thereafter); edits live
in a copy-on-write overlay; saving reconstructs in ascending coordinate
order. `vfs.ts` builds the filesystem on top: libraries are strata
(1 documents, 2 pair journals, 3 knowledge, 4 history, 5 services,
6 assets, 7 control, 9 index; 8 reserved for annotations); every
directory is a JSON index scroll; child slots are sequential from a
persisted high-water mark (never hash-derived — phext arms are unary,
so a hash-sized slot OOM'd the serializer in testing); files are 64 KB
chunk series snapped to codepoint boundaries (binary as base64 per
chunk under a `format` marker); library 9 holds a manifest plus
per-scroll SHA-256 checksums verified at open; each flush keeps the
previous generation at `<path>.bak`. Measured case: one scroll from
CYOA (4.4 MiB) reads in 3 µs after open vs 99 ms for a codec re-parse.

- `src/phext/lattice.ts` (added) — the engine port (index + overlay). [phext-storage]
- `src/phext/vfs.ts` (added) — strata/path↔coordinate VFS with L9 integrity and generation-aware flush. [phext-storage]
- `src/phext/lattice.test.ts` (added) — index parity with the Rust fixtures; byte-exact equivalence with the codec on CYOA. [test]
- `src/phext/vfs.test.ts` (added) — Cavern-shaped round-trips across flush/reopen, `.bak`, located checksum tampering. [test]
- `scripts/bench-phext-lattice.mjs` (added, exec) — the benchmark that is the receipt for the numbers above; stays runnable. [test]

### Theme 06 — phext-vfs: gates phext backend + phext-fs facade (18 files)

Mechanism: consumers keep their existing call shapes; only the thing
underneath changes. The four stage-C gates consumers (history, jobs,
publications, managed assets) all import one module
(`scripts/stage-c-gates/filesystem.mjs`) and call a small op vocabulary;
the registry dispatches a registered Cavern root's calls to
`phext-backend.mjs`, which implements the ops as transactions over the
Cavern's PhextVFS. Node identity is `{dev: "phext:<id>", ino: <token>}`
with tokens persisted in an in-phext registry, failing stale pins
closed; locking stays real — a flock on a stable per-lock anchor file
beside the phext, never on the phext itself (every flush renames it).
`server/phext-fs.mjs` implements exactly the `node:fs/promises` subset
the document-side stores use, over the same VFS; each consumer swaps one
import line. Native documents are sliced raw on block boundaries by a
byte-level scanner, verified byte-equal before storing — storage never
re-serializes, so a saved document is hash-identical to what the editor
produced. Node identities/timestamps live in an L7 registry
(`/.control/fs-nodes.json`, coordinate-keyed since theme 09's P9 fix,
with renames carrying entries); stamps derive deterministically from
content hash × version, preserving the stores' fence semantics.

- `scripts/stage-c-gates/phext-backend.mjs` (added) — gates ops as PhextVFS transactions; anchor-flock locking; persisted node identities. [phext-storage]
- `server/phext-fs.mjs` (added) — the `node:fs` facade over the VFS, incl. raw block-boundary document slicing. [phext-storage]
- `server/phext-fs.d.mts` (added) — the facade's type surface for TS consumers. [phext-storage]
- `server/phext-fs.test.mjs` (added) — facade vocabulary: O_EXCL collision, link-publish atomicity across a flush, slicing round-trip. [test]
- `server/phext-docs-scenario.test.mjs` (added) — store-level document scenarios on the facade. [test]
- `server/phext-docs-e2e.test.ts` (added) — routes-level E2E: only `cavern.phext`, `.bak` and anchors on disk after a full document workflow. [test]
- `server/phext-gates-backend.test.ts` (added) — op vocabulary, publish identity inheritance, cold-reopen persistence, stale-pin fail-closed, anchor contention. [test]
- `server/phext-history.test.ts` (added) — the real history store appending into the phext. [test]
- `scripts/stage-c-gates/filesystem.mjs` (modified) — reduced to the backend dispatch (its disk body is deleted by theme 09); also carries theme 03's lazy-flock fix in its history. [phext-storage]
- `server/native-vault-store.mjs` (modified) — facade import swap; `move()` dispatched to the VFS's exclusive rename (the C helper cannot rename inside a phext); unlock-before-close so a fallback token cannot outlive its operation. [phext-storage] [correctness]
- `server/native-document-store.mjs` (modified) — facade import swap. [phext-storage]
- `server/collection-inventory.mjs` (modified) — facade import swap. [phext-storage]
- `server/recognized-source.mjs` (modified) — facade import swap. [phext-storage]
- `server/document-store.ts` (modified) — facade import swap (legacy document store). [phext-storage]
- `server/workspace-store.ts` (modified) — facade import swap (legacy workspace store). [phext-storage]
- `server/recognized-document-store.mjs` (modified) — facade import swap; its journal under `.mutable/document-saves/` crosses via the facade (the one `.mutable` carve-out). [phext-storage]
- `src/persistence/managed-pair.mjs` (modified) — facade import swap; also theme 03's third chokepoint (`nativeFlock` routes through `flock.mjs` when fs-ext is absent). [phext-storage]
- `scripts/build-history-worker.mjs` (modified) — bundles `phext-fs.mjs` into `dist/`; without it the production server cannot boot (found by the boot smoke). [deploy]

### Theme 07 — phext-knowledge: SQLite unraveled into stratum L3 (18 files)

Mechanism: SQLite was three systems in one coat. Canonical records
(entities, propositions, audit, the mutation outbox) live in L3 as
files in the ledger's own `state()` form; the ledger port keeps its
transaction discipline — a mutation is one VFS overlay generation + one
flush (flush *is* commit), receipt in the L3 outbox in the same
generation, the disk protocol's budgets (10,000 mutations / 16 MiB) and
crash-redelivery fingerprint checks preserved. Derived data is never
stored: the phext foundation's SQLite database is an ephemeral replica —
built by the real migrations into a fresh 0700 temp dir at open,
populated from L3, foreign-key checked, deletable without loss; every
existing SQL consumer runs unchanged against it. Mode resolution happens
once in the host (`client.mjs` + the `phext-registry.mjs` global),
registered by the Cavern lifecycle, and rides into the worker, whose own
VFS instance owns L3 — one writer instance per directory, the two
instances' flushes merging through theme 05's generation-aware flush;
the writer lease is a flock on the gates backend's anchor file. The
converter refuses a source that fails verification, cross-checks the two
audit representations by SHA-256, and verifies its own output; the
`vaultGuid` is minted once into the control record and preserved by
conversion, never re-minted.

- `src/knowledge-sqlite/phext-registry.mjs` (added) — the host→worker mode registry. [phext-storage]
- `src/knowledge-sqlite/phext-store.mjs` (added) — canonical records in L3 in `state()` form. [phext-storage]
- `src/knowledge-sqlite/phext-ledger.mjs` (added) — the ledger port; flush = commit; budgets and fingerprint checks preserved. [phext-storage]
- `src/knowledge-sqlite/phext-foundation.mjs` (added) — the ephemeral-replica foundation presenting the disk foundation's shape. [phext-storage]
- `src/knowledge-sqlite/phext-convert.mjs` (added) — verified disk→L3 conversion and L3→backup export. [phext-storage]
- `src/knowledge-sqlite/phext-knowledge.test.ts` (added) — ledger semantics incl. crash-redelivery and outbox budgets. [test]
- `src/knowledge-sqlite/phext-convert.test.ts` (added) — converter/export round-trips (export → restore is dump-diff-equal). [test]
- `src/knowledge-sqlite/phext-worker.test.mjs` (added) — the production worker path: anchor-lease contention, replica lifecycle, restore refusal. [test]
- `src/knowledge-sqlite/phext-test-cavern.mjs` (added) — shared helper registering a temp dir as a real phext-backed Cavern for in-process suites; theme 10 stands on it. [test]
- `src/knowledge-sqlite/phext-test-cavern.d.mts` (added) — the helper's type surface. [test]
- `server/phext-knowledge-e2e.test.ts` (added) — E2E through the real host: mutate → deliver → reconcile to full coverage → cold reopen → projection rebuild. [test]
- `src/knowledge-sqlite/foundation.mjs` (modified) — a branch at its head selecting the phext foundation (the disk branch was the original function verbatim; theme 09 deletes it). [phext-storage]
- `src/knowledge-sqlite/client.mjs` (modified) — mode resolution made once and ridden into the worker. [phext-storage]
- `src/knowledge-sqlite/worker-entry.mjs` (modified) — the worker takes the phext mode from the registry. [phext-storage]
- `src/knowledge-sqlite/entity-lookup.mjs` (modified) — production fix 1: the read cache keyed invalidation on SQLite `data_version` alone, which never moves for same-connection commits — and the phext replica is single-connection, so cached lookups (incl. empty mention searches) were stale forever. Now paired with `total_changes()`. [correctness]
- `server/sqlite-knowledge-host.ts` (modified) — production fix 2: derived rows exist only in the open Vault worker's replica, so `entityLookup` now routes to the live worker when the Vault is open (the reader replica still serves unopened Vaults, honestly reporting unindexed). Also phext-mode probes. [correctness] [phext-storage]
- `src/application/entity-service.ts` (modified) — the client call path for fix 2's routing. [correctness]
- `scripts/build-sqlite-foundation.mjs` (modified) — dist staging copies knowledge modules by name; the five phext modules (and theme 03's `advisory-lock.mjs`) are in the list, or the copied files fail at import. [deploy]

### Theme 08 — phext-transfer: migration/export/seal, uploads, lifecycle (8 files) + the H1–H3 fix files (3)

Mechanism: `phext-cavern-transfer.mjs` is the exit/entrance machinery.
Migration walks a closed disk-born Cavern, classifies every file by
stratum (documents/journals via theme 06's slicing, the rest via its
copy discipline, knowledge via theme 07's converter), writes to
`cavern.phext.migrating-<uuid>`, then verifies by reopening the temp
phext fresh — every copied file's SHA-256 against the L9 index, smoke
reads, canonical knowledge dump comparison — and only then renames it
to `cavern.phext`. (What happens to the disk originals is theme 09's
ruling.) Export is the reverse ramp to a complete disk tree. The seal
is `xz -6 --check=sha256` produced from the in-memory uncompressed
phext at export time only — compression is a transport format, never
the working format — streamed via `spawn` (an `execFile` input buffer
deadlocks against xz here); `xz -t` verification runs before anything
is decompressed or written. Open-from-phext verifies/unseals an uploaded
`.phext`/`.phext.xz`, installs it into an empty folder, and sanity-opens
it before establishing. The lifecycle exposes `/api/cavern/migrate`,
`export-phext`, `download?sealed=0|1` (facts in `X-Cavern-*` headers),
and `open-phext` (512 MiB cap); the client surfaces them on the Cavern
surface itself — an "Open a Cavern from a Phext" card beside
Establish/Open, Download items in the Cavern menu. Uploads use a phext
multer engine keeping diskStorage's contract (same Cavern + session
checks, same `Date.now() + ext` filenames) but writing into the phext at
`/uploads/<name>` and flushing before reporting success; `/uploads` is
served back by a VFS static handler.

- `server/phext-cavern-transfer.mjs` (added) — verified migration, export, seal/unseal, open-from-phext. Also carries fix H2 (below). [phext-storage]
- `server/phext-uploads.mjs` (added) — the phext multer engine + VFS static handler for `/uploads`. Also carries fix H3's engine-side cap. [phext-storage]
- `server/phext-exit-e2e.test.ts` (added) — the full round trip: disk fixture → migrate → read from the phext alone → seal → unseal byte-identical → install → export → dumps diff-equal; plus the refusal matrices. [test]
- `server/phext-legacy-e2e.test.ts` (added) — legacy stores E2E: document + workspace save/list/load, journal save, upload round trip, cold reopen from the phext alone. [test]
- `server/cavern-lifecycle.ts` (modified) — the wiring file: owns the Cavern root and the stores' lifetime, so it holds the theme 06/07 registrations, the transfer routes, upgrade-on-encounter and the settings routes (theme 09). Also carries fix H1 (below). [phext-storage]
- `server/index.ts` (modified) — uploads/static wiring (headline), theme 02's surrealdb 2.x builder-API renames, theme 09's standalone-mode ENOPHEXT refusals, and fix H3's multer limits. [phext-storage] [upstream-compat]
- `src/application/cavern-startup.tsx` (modified) — the chooser surface: Open-from-Phext card, Download wiring, session-fenced fetch. [phext-storage]
- `src/application/settings-snapshot.ts` (modified) — the client's capture of the four settings domains' live values; committed here with its only consumer (the server half is theme 09). [phext-storage]

Fix files (2026-11-05, from the bug hunt's three high findings; the
fixes' own section earlier in this file carries the full narrative):

- `server/phext-cavern-transfer.test.ts` (added) — H2 regression: a small crafted `.xz` expanding past the cap is refused and the child killed; a legitimate sealed phext still unseals. [test]
- `server/phext-uploads.test.ts` (added) — H3 regression: an over-cap upload is refused with the JSON error envelope; a normal upload still lands in the phext. [test]
- `server/cavern-lifecycle.test.ts` (modified) — an upstream suite, first modified by the fork for H1's regression: an in-flight request that never finishes no longer wedges `establish()` past the bounded drain wait. [test]

And the fixes inside files already listed: **H1** in
`server/cavern-lifecycle.ts` (the Cavern-switch drain wait and
`close()`'s wait on the serial tail are bounded and log on timeout — a
stuck request could previously wedge the whole API into 409s until
restart); **H2** in `server/phext-cavern-transfer.mjs` (decompression
streams to a temp file under a hard 512 MiB output cap with a
child-process timeout — the 512 MiB cap previously covered only the
compressed bytes, so a crafted `.phext.xz` could OOM the 768 MiB-capped
service); **H3** in `server/index.ts` + `server/phext-uploads.mjs`
(multer `limits` at the product's 20 MiB scale and the same cap inside
the engine — `/upload` previously had no limits at all and buffered
whole files in RAM). [correctness]

### Theme 09 — cutover: phext-only enforcement, L7 settings bundle, deletions (11 files)

Mechanism: the "go full phext" ruling applied — no dual mode, no silent
fallback, no old I/O path left standing. A path no registered Cavern
phext covers is a coded `ENOPHEXT` refusal, never a quiet trip to disk.
Opening a disk-born Cavern converts it first (upgrade-on-encounter,
theme 08's verified discipline) or refuses explicitly; `.mutable` is
preserved as `.mutable-disk-fallback/`, document originals stay in
place, inactive. The settings bundle ships a *copy* of the user's
settings inside each Cavern at `/.control/settings/` as a per-field
scroll tree (never one JSON blob): capture is an explicit Cavern-menu
action ("Update Shipped Settings") sending the four real domains —
keybindings, Flint layout, annotation-bar policy, the
cross-block-selection toggle — to `POST /settings/capture` under strict
validation (a bad capture writes nothing); `GET /settings` reads the
bundle back; opening a Cavern never imports. Scry usage history is
re-scoped from absolute vault paths to the Cavern's `vaultGuid` (the
addressing rule: no external paths in stored references unless they are
global URIs). The enforcement's other half lives inside files owned by
themes 06–08 (the lifecycle's upgrade-on-encounter, phext-fs's ENOPHEXT
refusal, the knowledge foundation's deleted disk branch).

- `server/phext-settings.mjs` (added) — the settings bundle: strict-validated capture + read-back over the L7 per-field scroll tree. [phext-storage]
- `server/phext-settings.test.mjs` (added) — the bundle's validation/write/read contract. [test]
- `server/phext-cutover-e2e.test.ts` (added) — the two headline pins: disk-silence (a full exercise leaves only `cavern.phext`, `.bak`, anchors on disk) and upgrade-on-encounter (incl. corrupt-fixture refusal with originals untouched). [test]
- `src/features/flint/compact-layout.tsx` (modified) — the Flint-layout domain's persisted-state surface the capture reads. [phext-storage]
- `src/rendering/annotation-bar-policy.ts` (modified) — the annotation-bar domain's persisted-state surface. [phext-storage]
- `src/runtime/cross-block-selection.ts` (modified) — the editor-interaction toggle's persisted-state surface. [phext-storage]
- `server/vault-listing-cache.mjs` (modified) — the disk cache implementation deleted, reconcile kept: a disk cache file is both an old I/O path and a lie waiting to happen; the VFS directory index *is* the listing. [phext-storage]
- `src/settings.json` (deleted) — embedded the absolute path `/data/the-codex` (a machine-local path stored as content, against the addressing rule) and had no production importer. [correctness]
- `scripts/stage-c-gates/filesystem-worker.mjs` (deleted) — the gates disk worker: an old I/O path itself. [phext-storage]
- `server/native-path-move.c` (deleted) — the native relocation helper; relocation is a VFS `renameExclusive` now. [phext-storage]
- `scripts/build-relocation-helper.mjs` (deleted) — the deleted helper's build script. [phext-storage]

### Theme 10 — tests: upstream suites converted to the phext storage contract (51 files)

Mechanism (shared): upstream's suites built fixtures with raw `node:fs`
and probed disk-only semantics. The conversion re-points each suite's
fixture at a real phext-backed Cavern (theme 07's `phext-test-cavern`
helper registers a temp directory with genuine phext-fs, gates and
knowledge backends) and re-expresses assertions against the phext
contract: a file-on-disk assertion becomes a scroll/record assertion;
disk-only behaviours with no phext meaning were rewritten to their
phext equivalent or removed with the count recorded (six disk-only
knowledge tests were deleted with their subjects in the cutover; the
knowledge suite went 131 → 125 by count). Behaviour assertions —
contention messages, scope fences, save/recover semantics, audit
posture — are unchanged in intent. Several conversions are what *found*
real bugs: theme 07's two lookup fixes and the scope-fence soundness fix
were all surfaced here. Every file below is [test] for this reason: a
suite still asserting disk fixtures would test a system that no longer
exists.

- `scripts/c1a-test-host.mjs` (modified) — gains the same phext registration so the suites it hosts run in phext mode. [test]
- `scripts/stage-c-gates/publication-maintenance.test.mjs` (modified) — converted per the shared mechanism. [test]
- `scripts/stage-c-gates/storage.test.mjs` (modified) — converted per the shared mechanism. [test]
- `server/collection-inventory.test.mjs` (modified) — converted per the shared mechanism. [test]
- `server/collection-store.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/document-store.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/entity-lookup.test.ts` (modified) — converted per the shared mechanism; its conversion surfaced theme 07's lookup fixes. [test]
- `server/entity-mutate.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/history-router.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/history-store.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/managed-assets.test.mjs` (modified) — converted per the shared mechanism. [test]
- `server/native-document-store.test.mjs` (modified) — converted per the shared mechanism. [test]
- `server/native-knowledge.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/native-saved-scope.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/native-vault-restart.test.mjs` (modified) — converted per the shared mechanism. [test]
- `server/native-vault-store.test.mjs` (modified) — converted per the shared mechanism. [test]
- `server/recognized-document-store.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/sqlite-knowledge-host.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/sqlite-saved-scope.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/sqlite-semantic-services.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/thesis.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/vault-listing-cache.test.mjs` (modified) — converted per the shared mechanism (asserts reconcile-against-index after the cache's deletion). [test]
- `server/workspace-store-d0.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/workspace-store-d1.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/workspace-store.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/application-services/academic.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/application-services/deterministic.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/application-services/encyclopedia.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/application-services/foundation.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/application-services/iiif.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/application-services/pdf.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/application-services/publication-directory.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/application-services/publication-incremental.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/application-services/publication-reader.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/application-services/publication.test.ts` (modified) — converted per the shared mechanism. [test]
- `server/application-services/web.test.ts` (modified) — converted per the shared mechanism. [test]
- `src/application/document-save.test.tsx` (modified) — its fixture's storage reads/writes rewired onto phext-fs inside a test Cavern. Rebase note: upstream's appended Save-As test (in the parent) coexists with this rewire; the auto-merge kept both. [test]
- `src/application/entity-service.test.ts` (modified) — converted per the shared mechanism. [test]
- `src/application/native-knowledge-scope.test.ts` (modified) — converted per the shared mechanism. [test]
- `src/application/native-saved-scope.test.ts` (modified) — converted per the shared mechanism. [test]
- `src/knowledge-sqlite/entities.test.mjs` (modified) — converted per the shared mechanism. [test]
- `src/knowledge-sqlite/foreground.test.mjs` (modified) — converted per the shared mechanism. [test]
- `src/knowledge-sqlite/foundation.test.mjs` (modified) — converted per the shared mechanism. [test]
- `src/knowledge-sqlite/host.test.mjs` (modified) — converted per the shared mechanism. [test]
- `src/knowledge-sqlite/indexer.test.mjs` (modified) — converted per the shared mechanism. [test]
- `src/knowledge-sqlite/propositions.test.mjs` (modified) — converted per the shared mechanism. [test]
- `src/knowledge-sqlite/semantics.test.mjs` (modified) — converted per the shared mechanism. [test]
- `src/knowledge-sqlite/vault-scope.test.mjs` (modified) — converted per the shared mechanism; asserts the establishment contention error is byte-identical in both storage modes. [test]
- `src/persistence/native-session.test.ts` (modified) — converted per the shared mechanism. [test]
- `src/persistence/native-vault-session.test.ts` (modified) — converted per the shared mechanism. [test]
- `src/qualification/native-b2/paired-save.test.mjs` (modified) — converted per the shared mechanism. [test]

### Theme 11 — docs: this file (1 file)

- `PATCHES.md` (added) — the running record the one-commit landing is
  drawn from: per-phase modified-file tables, design rationale, measured
  evidence, rebase notes, the high-fix addendum, the rebase section, and
  this appendix. It is the file a future rebaser (or upstream reviewer)
  reads to re-apply the fork's changes onto a newer upstream without
  reverse-engineering them. [upstream-compat]

### Multiply-themed files (listed once above, cross-referenced here)

| File | Listed under | Also belongs to |
| --- | --- | --- |
| `server/index.ts` | 08 (uploads/static wiring) | 02 (surrealdb 2.x renames), 09 (standalone-mode ENOPHEXT refusals), fixes (H3 multer limits) |
| `server/cavern-lifecycle.ts` | 08 (transfer routes) | 06 (gates + phext-fs registration), 07 (knowledge registration), 09 (upgrade-on-encounter, settings routes), fixes (H1 bounded drain) |
| `src/knowledge-sqlite/vault-scope.mjs` | 03 (establishment lock fix) | 07 (phext scope-inspection mode) |
| `src/persistence/managed-pair.mjs` | 06 (facade import) | 03 (`nativeFlock` → `flock.mjs` adapter) |
| `server/native-vault-store.mjs` | 06 (facade import, `move()` dispatch) | 03 (unlock-before-close for the token fallback) |
| `scripts/build-sqlite-foundation.mjs` | 07 (five phext modules in the copy list) | 03 (the `advisory-lock.mjs` entry) |
| `scripts/stage-c-gates/filesystem.mjs` | 06 (final thin dispatch) | 03 (its fs-ext fix is subsumed — the final lock path runs through the phext backend's anchor registry and `flock.mjs`) |
| `server/vault-listing-cache.mjs` | 09 (cache deletion) | 06 (its reconcile is what reads the VFS index as the listing) |
| `server/sqlite-knowledge-host.ts` | 07 (phext probes + lookup fix 2) | — the fix's other half is `entity-lookup.mjs`, same theme |
| `server/phext-cavern-transfer.mjs` | 08 (transfer machinery) | fixes (H2 decompression cap + child timeout) |
| `server/phext-uploads.mjs` | 08 (phext upload engine) | fixes (H3 engine-side cap) |
| `src/configuration.ts` | 04 (`phextDocuments`) | 09 deleted the `phextVfs` flag history had added here — a net no-op |
