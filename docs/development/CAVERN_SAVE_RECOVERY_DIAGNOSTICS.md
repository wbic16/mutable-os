# Cavern restart retention and browser Save diagnostics

## Incident evidence

On 8 November 2026, `test6.ink` reported a rejected fetch during manual Save.
When inspected, neither the Vite frontend nor the document server was listening.
The native Open endpoint subsequently confirmed no pending generation and a last
saved generation of `b7646162-4ba0-4598-81d0-da3fe70ccd68`; the file timestamp was
15:41:42 AEST. Dialectic diagnostics contained successful provider exchanges and
contribution records through 16:48:13 AEST, but no evidence establishing why the
local processes stopped. A rejected fetch alone does not prove a file conflict
or whether publication began.

The old Cavern status poll disposed the workspace when the server session
disappeared or changed, bypassing the unsaved-work guard. Restarting the server
therefore exposed a separate data-loss path. The poll now retains the workspace
and fences managed requests. Explicit **Retry connection** verifies the original
Cavern path and GUID before replacing the connection session. It does not remount
the editor, adopt new file baselines, or replay a Save. Explicit Cavern switching
continues to use the existing unsaved-work guard.

## Diagnostic retention

`browserSaveDiagnostics` defaults on. IndexedDB database
`mutable-save-diagnostics` contains metadata-only events for Save/recovery
requests, HTTP outcomes, network failures, startup and Cavern-session changes.
Correlation uses a browser-session ID, request ID and captured generation.
Document text, request bodies, credentials, server session tokens and arbitrary
error messages are excluded.

Retention is **200 events maximum and seven days**. Startup records, diagnostic
writes and export prune expired entries; cleanup runs on the next use if the app
is closed. The pending write queue and in-session fallback are also bounded.
Storage failures never block Save and are reported in an exported log. Overflow
is disclosed as `droppedEvents`. Browser storage remains subject to browser data
clearing and eviction.

**Download save diagnostics** is available from Cavern controls, startup/reconnect
surfaces, and Flint Storage and recovery. Export retains recent evidence because
initiating a download does not confirm that the user kept the downloaded file.
There is no network upload, document autosave, background save replay or typing
subscription. Browser document recovery copies are not implemented by this change.

## Validation

- Cavern tests preserve the same mounted editor across missing/changed sessions,
  failed retries and successful reconnection; reject different paths/GUIDs; and
  verify bounded status requests with no automatic Save.
- Native session tests retain dirty newer edits after recovering an earlier
  generation, record network-failure evidence without document content, and
  assert zero diagnostic calls and zero snapshots during ordinary typing.
- `node scripts/check-browser-save-diagnostics.mjs` uses real IndexedDB in an
  isolated Chrome profile to check reload persistence, count/age pruning,
  feature disablement, metadata filtering and contained storage failure. It does
  not mount the application or access live document APIs.

Validation result: 51 tests passed across the Cavern startup, native session,
Document Save and Flint lifecycle suites. One Flint window-close assertion
failed identically in an isolated checkout of unchanged HEAD (retained projection
count), so it is not attributed to this change. Client/server typechecking and
the real-Chrome diagnostic checks passed.

The incident's 26 logged contributions were extracted into
`artifacts/test6-recovery-2026-11-08/`, including a text transcript, structured
contributions, diagnostic evidence and an unchanged copy of the last saved Ink
file. The transcript is not a complete reconstruction of native annotations,
Glosses, layout or unsubmitted drafts. The original `test6.ink` was not modified.
