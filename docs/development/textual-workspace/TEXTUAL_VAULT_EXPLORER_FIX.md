# Textual Vault explorer restoration

The Textual Flint view exposed Vault operations through File, but omitted the explorer. It now includes a dedicated left-hand Vault view using the existing `ApplicationVault` controller.

- Expanded by default; collapse with the panel arrow or the **Vault** button beside the document tabs. That button remains available to reopen it.
- Collapse state is remembered for the application instance, including Desktop/Textual round-trips. Hiding the pane retains its folder tree and the editor DOM.
- Browse folders, open native Documents and recognised file candidates, highlight the active file, refresh explicitly, and access existing Open/New operations. Pending/incomplete entries retain their existing opening restrictions.
- The pane occupies 28 measured cells on ordinary layouts. Narrow layouts use a left overlay; successful file opening dismisses that overlay.
- No automatic discovery on reopen, document saves or document metadata changes. Other Vault actions remain available through File → Vault.

Changes are confined to Textual: `vault.tsx`, `flint.tsx`, `layout.ts`, `textual.css`, and focused tests. No graphical view, controller, application registry or persistence changes.

Four focused tests passed, including row-work isolation from unrelated state changes. TypeScript and the trusted Chrome browser flow passed: default-left placement, collapse/reopen, exact tree/editor identity, selection preservation, existing `openFile` dispatch, active-file highlighting, typing/Undo, Desktop return, remembered collapse and narrow overlay. Typing produced **zero file-listing calls and zero explorer DOM mutations**; the flow produced **zero repository snapshots and projection rebuilds**. Source data remained in an isolated browser fixture; no user files were saved.

[Browser evidence](vault-browser-results.json) · [Screenshot](screenshots/vault-explorer.png)
