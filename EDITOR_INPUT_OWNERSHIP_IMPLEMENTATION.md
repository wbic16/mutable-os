# EditorInputCapability: mounted prototype

**Date:** 2026-11-23  
**Status:** Implemented; automated and Chromium qualification complete. WebKit and real OS IME qualification remain outstanding.  
**References:** [ownership investigation](EDITOR_INPUT_OWNERSHIP_INVESTIGATION.md), [standoff investigation](CODE_MIRROR_STANDOFF_INVESTIGATION.md).

## 1. Summary

A real CodeMirror view now owns local input inside Mutable's Flint document host, with the existing mount registry, FocusService, InputGateway, BindingRegistry, command services, canonical history and manual Save path. Ownership follows actual editing engagement and releases on exit, browser blur, mount replacement, unmount or SDK destruction. Native boundary recognition remains effective when the editor has no active lease, so late native events never enter Flint's Cell reconciliation.

The removable development demo contains a Mutable paragraph, two independent CodeMirror editors, and another Mutable paragraph. It supports native editing, selection, indentation, completion, local search, an affiliated popup, Mutable shortcuts and live remapping, boundary navigation, read-only transitions, remounting and manual document saving.

The new `editorInputOwnership` feature flag defaults to **true**. The demo route is development-only. Existing block types do not opt into the capability automatically. No `standoff-code-mirror-block`, annotation range mapping, semantic command integrations or alternative persistence system was introduced.

## 2. Actual files changed

| Area | Files |
| --- | --- |
| Ownership and lifecycle | [`src/runtime/editor-input.ts`](src/runtime/editor-input.ts), [`mounts.ts`](src/runtime/mounts.ts), [`focus.ts`](src/runtime/focus.ts) |
| Native adapter and global routing | [`src/input/code-mirror-input.ts`](src/input/code-mirror-input.ts), [`editor-global-input.ts`](src/input/editor-global-input.ts), [`bindings.ts`](src/input/bindings.ts) |
| Earlier capture listeners | [`src/input/gateway.ts`](src/input/gateway.ts), [`cross-block-input.ts`](src/input/cross-block-input.ts), [`selection-gestures.ts`](src/input/selection-gestures.ts), [`src/runtime/document-find.ts`](src/runtime/document-find.ts), [`src/reactive-editor/editor.ts`](src/reactive-editor/editor.ts) |
| Existing Save hosts | [`src/features/flint/shell.tsx`](src/features/flint/shell.tsx), [`src/application/document-sessions.ts`](src/application/document-sessions.ts), [`document-application-capabilities.tsx`](src/application/document-application-capabilities.tsx), [`src/feature-api/document-application.ts`](src/feature-api/document-application.ts), [`src/demo/workspace-documents.ts`](src/demo/workspace-documents.ts), [`workspace-open-controls.tsx`](src/demo/workspace-open-controls.tsx) |
| Demo and flag | [`src/demo/editor-input-ownership.tsx`](src/demo/editor-input-ownership.tsx), [`src/App.tsx`](src/App.tsx), [`src/configuration.ts`](src/configuration.ts) |
| Automated tests | [`src/runtime/editor-input.test.ts`](src/runtime/editor-input.test.ts), [`src/input/code-mirror-input.test.ts`](src/input/code-mirror-input.test.ts) |
| Browser qualification | [`scripts/check-editor-input-ownership-browser.mjs`](scripts/check-editor-input-ownership-browser.mjs), [`docs/qualification/editor-input-ownership`](docs/qualification/editor-input-ownership) |
| Direct SDK dependencies | [`package.json`](package.json), [`package-lock.json`](package-lock.json) |

Directly imported CodeMirror state, view, commands, autocomplete and search packages are now declared at the versions already installed. No transitive SDK upgrade was required.

## 3. Final capability contract

```typescript
interface EditorInputCapability {
  ownership: 'self-managed';
  root: HTMLElement;
  readContext(): 'content' | 'auxiliary' | 'outside';
  onActivate?(): void;
  onDeactivate?(): void;
}

// Additions to the existing MountHandle:
editorInput?: EditorInputCapability;
focusAtBoundary?(edge: 'start' | 'end'): void;
```

`root` is the native SDK boundary, which may be narrower than the containing block. `readContext` distinguishes native content from SDK panel inputs without mistaking retained selection for focus. Lifecycle hooks cancel outgoing transient sessions and adopt the current occurrence. The host, rather than the SDK, controls the lease.

Two recommendations from the investigation were simplified:

- **No `observeContext` member.** Existing DOM focus, pointer, key and window events supply the observations required by this prototype. The SDK supplies a cheap context query. Programmatic native selection changes consequently have no ownership side effects.
- **No duplicated composition state in the capability.** CodeMirror's input adapter reads its own composition state and keeps composition handling native. The host does not need an SDK-neutral composition model.

The mount registry remains the registration authority. A weak event-boundary index points to the exact same live handles; it is not another block or command registry. No universal selection, text transaction or rendering API was added.

## 4. Ownership lifecycle and transition rules

There is one owner slot per DOM `Document`, shared across MountRegistry instances. A separate optional context reference retains popup affiliation when there is no editor keyboard owner. A transition epoch fences delayed focusout reconciliation; a window-blur flag prevents premature reacquisition. This is local runtime state, not canonical document data.

| Event | Implemented result |
| --- | --- |
| Native content receives focus | Acquire its exact mounted handle; cancel outgoing transient input and adopt its occurrence |
| Caret/selection moves inside native content | Keep the same owner; no content or ownership transaction |
| Background native selection changes | No ownership change |
| Focus enters a Mutable block | Release the native lease; existing Mutable routing resumes |
| Focus enters another native editor | Transfer directly; old delayed events cannot revoke the new owner |
| Outside nonfocusable pointerdown | Release, even if the browser retains the previous DOM selection |
| Fresh key targets still-focused native content | Revalidate engagement and reacquire before native command dispatch |
| Native panel or affiliated popup field takes focus | Retain origin context, release editor-local keyboard ownership; field edits itself |
| Affiliated popup closes | Restore only if the originating mount and current context are still valid |
| Browser blur/refocus | Release authority; on refocus, revalidate actual focus |
| Mount replacement, final release, registry disposal | Invalidate immediately using handle identity and dispose listeners |
| `EditorView.destroy()` | A native ViewPlugin releases the mount synchronously |

The registry now compares exact handles in stale disposers. It also removes old root aliases on replacement. Reused numeric generations after final release cannot allow an old disposer to remove a replacement.

A mounted-browser test exposed an ordering issue that unit-only focus tests initially missed: the gateway can navigate during key capture, deliver a nested focusin to CodeMirror, then the original arrow event reaches the ownership observer. The observer now ignores an already-handled key or a key whose source no longer matches active focus. It preserves the destination lease. This required no change to Flint's navigation policy.

## 5. InputGateway and capture-listener changes

`editorInputBoundary(event)` resolves the actual event path or relevant selection source through the mounted boundary index. When a document has no self-managed registrations it returns immediately. It performs no layout measurement, canonical lookup, mount enumeration or repository traversal.

The gateway, inline-presentation interception, cross-block input, selection gestures and document Find now return before Flint-local handling for native boundaries. This includes first pointer input before focus acquisition and late composition/input after release. No propagation suppression is used to delegate an event to CodeMirror.

Text protection recognizes the same boundary. The native adapter synchronizes CodeMirror read-only state and has a transaction filter that rejects native document changes when the canonical content is protected. Existing canonical admission checks remain in place; a direct attempt to write protected content still throws. Affiliated popup fields remain usable because their local text is not protected document content.

Lifecycle cleanup runs once per ownership transition. It does not repeatedly cancel sessions or update focus while the native caret moves.

## 6. BindingRegistry changes and global commands

`dispatch` accepts an optional eligibility predicate. It filters complete candidates, chord starts and continuations **before consumption**. Existing callers that omit the predicate retain their existing routing semantics. Unsupported actions cannot claim a prefix merely because their broad scope matches.

`dispatchReserved` matches complete host-global bindings without starting or stealing a chord session. It declines when a prefix or pending chord needs the combined native dispatcher. There is still one BindingRegistry and one pending chord per editor.

Native content uses a combined eligible action set, including any applicable global chord. An affiliated popup field uses a global-only context, so a configured Save chord remains available without exposing editor-local actions to field typing.

Flint and transferred-document Save handlers reuse their existing Save operations and active document/session targeting. They honor configured bindings for the new native context and check prior handling. Standalone host controls preserve their supported Open/Save responsibilities through the same source-aware helper. Ordinary Flint shortcut behavior is retained.

An accepted command is handled synchronously; asynchronous failure reports an error and does not replay its key into CodeMirror. Existing Save concurrency/error protections remain authoritative. Saving remains manual, using the document's existing filename and Mutable JSON path. There is no autosave or Markdown sidecar.

## 7. CodeMirror extension integration

`mountCodeMirrorInput` installs native `EditorView.domEventHandlers` at explicit precedence and calls the live BindingRegistry. It does not copy user shortcuts into a second static keymap. The caller supplies supported action IDs and, when necessary, a semantic execution/applicability adapter. Default execution uses the existing CommandRegistry.

Local completion navigation gets first refusal before ordinary Mutable bindings. Complete reserved globals retain host priority. Other unhandled keys continue through native CodeMirror commands and browser defaults. Native click, double-click and contextmenu binding dispatch use the same registry mechanism.

The adapter contains boundary navigation, native focus/selection hooks, the read-only compartment/filter and native destruction cleanup. It has no text persistence or annotation storage responsibilities. Its caller must synchronize permission changes through `syncPermissions()` and dispose the adapter before ordinary view teardown; the native destruction hook also protects direct SDK destruction.

The demo installs native JavaScript support, selection drawing, indentation, search and completion. Its context menu opens an explicitly affiliated local popup. The demo's Mutable command uses F8, can be remapped to F9, and also uses Ctrl-; then 8. The suffix avoids existing Mutable semantic shortcuts.

Demo code text uses the existing `setPayloadField(..., 'text', ...)` command. Canonical Undo/Redo updates the native view. Native provisional composition stays local until the composition-end/final-input checkpoint; this is a demo storage detail, not part of the capability. There is no independent competing CodeMirror content history.

## 8. Focus and navigation integration

FocusService now calls `focusAtBoundary` when provided, allowing CodeMirror to choose its own start/end offsets. Existing textarea and Cell hooks remain unchanged.

The existing adjacent-editable traversal recognizes the explicit `self-managed-editor` discovery capability when the flag is enabled. Native boundary commands require one collapsed selection at the absolute start/end, no Shift extension, no composition and no active completion navigation. They preserve the existing direction/destination conventions: left enters the previous block at its end; other boundary commands request its start.

Unavailable or denied destinations fall through. Deferred focus requests retain the source mount/lease validity check. Wrapped-line movement, folds, selection extension and multiple cursors remain native; no cross-block selection model was introduced. CodeMirror's native Escape-then-Tab focus escape remains available when Tab indents.

## 9. Mounted demonstration instructions

Start the normal development application:

```sh
npm run dev
```

Open **`/input-ownership`**, normally `http://localhost:3000/input-ownership`. The normal backend is needed for interactive file saving; a Vite-only server is enough to exercise editing and input ownership.

1. Click either CodeMirror editor and type, delete, indent and drag-select text.
2. Press F8, then use **Remap command to F9** and verify that F9 increments the command count. Ctrl-; then 8 invokes the same Mutable action.
3. Use Mod-F for native Find. Type `proto` and invoke Ctrl-Space for native completion; navigate and accept a result.
4. Right-click for the local popup. Type in its field and close it; typing affects the field and focus returns to its originating editor.
5. At the first code editor's absolute start press Left to enter the preceding Mutable paragraph. Press Right at that paragraph's end to return. At the first code editor's end, Right enters the second editor.
6. Click directly between native editors and on the nonfocusable header area. Try read-only toggling and rapid remounting using the provided controls.
7. Open a scratch Vault in Flint, save the demo Document as a `.mutable.json` file, edit, then use Command-S/Control-S. The existing file/save UI handles the operation.

The prototype block type is deliberately registered only on this route. Saved demo files preserve ordinary text but are not a new production CodeMirror document format. Do not use this prototype as the future standoff block registration.

The automated browser harness starts its own Vite server, temporary browser profile and temporary native document store. It never writes to the user's Vault:

```sh
node scripts/check-editor-input-ownership-browser.mjs
# Optional persisted artifact destination:
OWNERSHIP_OUTPUT=docs/qualification/editor-input-ownership \
  node scripts/check-editor-input-ownership-browser.mjs
```

## 10. Automated test results

**96 tests passed across 8 files**, including 22 new ownership/native-integration tests. The remaining tests cover existing binding, selection gesture/target, plaintext, standoff renderer and text-protection behavior.

```sh
./node_modules/.bin/vitest run \
  src/runtime/editor-input.test.ts src/input/code-mirror-input.test.ts \
  src/input/bindings.test.ts src/input/selection-gestures.test.ts \
  src/input/selection-target.test.ts src/rendering/plain-text-block-view.test.tsx \
  src/rendering/standoff-editor-view.test.tsx src/block-tree/text-protection.test.ts
npm run typecheck
git diff --check
```

Both reactive/client and server type checks pass. Tests cover exact-identity replacement, reused generations, direct SDK destruction, source classification after blur, outside clicks, popup restoration, background selection, native fallthrough, remapping, prefix filtering, global reservations, popup chords, read-only/native and canonical protection, boundary focus/navigation and bounded work.

## 11. Browser qualification results

**39 checks passed in Chromium**, including two explicitly synthetic composition-lifecycle regression checks. These were run in the actual Flint host on Chrome **157.0.8103.80**, with no uncaught browser exceptions.

The suite exercises first-click acquisition; native typing with one canonical publication; indentation/deletion; native completion; canonical Undo/Redo; pointer drag selection; native search and affiliated popup fields; transfer between editors; outside-click release; actual browser-tab blur/refocus; navigation in both directions; read-only transitions; five successive remounts; and actual manual saving through the native router into a temporary `.mutable.json` file.

Save is checked exactly once for Command-S, a configured single key, a shared-prefix chord, and the same chord inside an affiliated popup. The local Mutable action still resolves through the shared prefix. The synthetic composition checks verify zero provisional publication and one final publication; they **do not establish OS IME correctness**.

Evidence: [machine-readable results](docs/qualification/editor-input-ownership/results.json), [mounted screenshot](docs/qualification/editor-input-ownership/mounted.png).

**WebKit was not run:** the existing automation browser cache has Chromium and Firefox, but no WebKit runtime. Real OS IME, operating-system application switching, screen-reader behavior and some native menu/fold/bidi cases were not automated. No pass is claimed for them.

Reproducible manual follow-up in Safari/WebKit and Chrome:

- Repeat the demo steps above with keyboard-only navigation and wrapped code. Verify Shift-selection and multiple cursors do not exit the block; test folds if a folding extension is enabled.
- Enable a real Japanese/Chinese/Korean IME. Compose, revise, commit and cancel text; repeat while opening/closing native Find, moving focus to another editor, toggling protection and remounting. Verify final text, caret, Undo/Redo and saved JSON; provisional text should not mark the Document dirty.
- Switch to another OS application while native content or a popup field has focus, then return. Check that ownership and Save target the actual active context.
- Check native context-menu selection and clipboard behavior, accessibility focus escape, and screen-reader navigation.

## 12. Performance and regression findings

The ownership runtime has no repository, persistence, annotation, geometry or vault dependency. A document with no registered self-managed editor takes an immediate negative boundary check. With native editors present, classification follows the event path and validates only the encountered live handle; it does not enumerate mounts.

Executed bounded-work checks establish:

- Fifty classifications with 300 unrelated registered mounts: no mount `get` enumeration and no layout reads.
- Forty native selection/input notifications with 250 unrelated blocks: no canonical commits, snapshots, encoding, payload updates or Flint completion/reconciliation.
- Twenty ordinary prototype payload edits with both 0 and 250 unrelated blocks: exactly one affected previous-content record per commit, no snapshots, projection rebuilds or reference rebuilds. The test sets `requireBounded: true`, so fallback to whole-repository planning fails the check.
- Real mounted focus, caret, popup and pointer-selection activity: zero content commits, snapshots, saves and projection rebuilds; canonical revision and dirty state unchanged.
- Existing protected-text regression: no new protection indexing or snapshots during typing.

The existing real Flint browser benchmark used 250 paragraphs, 25,000 characters and 40 edits:

| Measurement | Before | After |
| --- | ---: | ---: |
| Median handler time | 1.60 ms | 1.60 ms |
| Mean handler time | 1.905 ms | 1.895 ms |
| p95 handler time | 6.50 ms | 5.60 ms |
| Repository snapshots | 0 | 0 |
| Unrelated Cell identity retained | Yes | Yes |
| Content restored by history | Yes | Yes |

Real Chrome insertText, Backspace, Undo/Redo and the benchmark's paragraph-split/boundary cases passed. These single before/after headless runs show no observed regression; they do not prove a latency improvement or guarantee perceived frame latency. [Comparison data](docs/qualification/editor-input-ownership/typing-comparison.json), [before log](docs/qualification/editor-input-ownership/flint-before.log), [after log](docs/qualification/editor-input-ownership/flint-after.log).

## 13. Known limitations and unresolved issues

- Real OS IME and WebKit qualification remain required. The synthetic composition checks only establish the prototype's publication boundary. Explicit teardown cancels pending provisional demo input; final OS event ordering during teardown still needs manual validation.
- Demo storage copies ordinary text through an existing payload command. It is not an incremental standoff transaction bridge and does not promise rich multi-cursor selection-history restoration across external canonical replacements.
- Same-document affiliated portals are implemented. General other-browser-window hosting, root migration and broader shadow-DOM integration are outside this milestone and unqualified.
- SDK integrations must opt in, expose correct focus context, keep permissions synchronized and supply applicable actions. An arbitrary widget containing an editable element is not automatically admitted.
- The native adapter gives native completion its navigation keys and knows about the explicit supplied action set. Future semantic panels will need their own precise applicability/popup policies, using the existing adapter rather than a broader gateway.
- No Entity, Gloss, Claim, Scry or standoff annotation behavior is enabled in the prototype. Existing Flint behavior for those features is retained.

## 14. Recommendation for standoff adoption

Adopt the mounted capability, boundary recognition and native binding adapter as the input foundation of `standoff-code-mirror-block`. The Chromium evidence supports that architectural boundary: native editing remains native, Mutable commands retain their registry and configurable bindings, and host navigation/Save operate without duplicate local handling.

Keep the future canonical text/standoff transaction bridge separate. It should supply annotation-aware changes, UTF-16/code-point conversion, history/selection restoration and semantic command adapters while reusing this ownership service. Complete the listed WebKit and real IME checks before describing the resulting block as fully cross-browser qualified.
