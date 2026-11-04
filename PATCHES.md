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
| `index.html` | `<title>Solid App</title>` → `<title>Mutable</title>`. | The browser title bar showed the upstream template's placeholder name. | One line; re-apply if upstream retitles. (`src/features/phosphor/glyphs.ts` contains "Solid Apple", an icon name — unrelated, untouched.) |
| `src/demo/workspace-demo.tsx` | In the same `DemoSession` phext wiring: one more import (`../phext/default-documents`), an `openDefaultPhext` handler beside `openPhext`, and "Open Choose Your Own Adventure" / "Open Incipit" buttons rendered from `defaultPhextDocuments` inside the existing `phextDocuments`-gated blocks of both Local-files surfaces. | CYOA and Incipit ship with the site by default. The Workspace demo menu is the surface a fresh visitor actually sees (the session lands there; the server document store is a separately-browsed public scratch space), and the buttons sit beside Open Phext… under the same flag — no new flag, no store writes. | The handler opens through `props.onOpenLocal` like Open Phext…; the conversion and stable-id stamping live in `src/phext/default-documents.ts`. If upstream restructures the menus, re-place the buttons inside the phextDocuments `<Show>` blocks. |

## New files (no rebase risk beyond additions)

- `src/phext/coordinate.ts`, `src/phext/codec.ts`, `src/phext/document.ts`,
  `src/phext/file-io.ts` — the phext module (see PHEXT.md).
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
