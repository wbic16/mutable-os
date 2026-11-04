# Patches on upstream

This branch (`emise/phext-support`) carries wbic16's changes on top of
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

That is the whole list. In particular:

- **No server change was needed.** `server/index.ts` already chooses its
  port with `const port = process.env.PORT || 3002;` — the deploy unit
  sets `PORT=3003` (3002 is taken on the host; see deploy/deploy.md).
- **No codec, persistence, or editor files were touched.** Phext
  import/export are explicit file actions layered on the existing Local
  open flow and `editor.encodeDocument()`; the typing path is untouched.

## New files (no rebase risk beyond additions)

- `src/phext/coordinate.ts`, `src/phext/codec.ts`, `src/phext/document.ts`,
  `src/phext/file-io.ts` — the phext module (see PHEXT.md).
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
