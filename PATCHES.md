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
- `server/native-vault-store-lock.test.mjs` — the native vault store
  lock's fs-ext-absent regression suite (action runs, contention
  message, cross-process crash recovery).
- `src/phext/codec.test.ts`, `src/phext/document.test.ts`,
  `src/demo/phext-menu.test.tsx` — tests.
- `deploy/deploy.sh`, `deploy/deploy.md`,
  `deploy/nginx-mutable.phext.io.conf`, `deploy/mutable-os.service` —
  hosting for mutable.phext.io.
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
