# Textual Workspace — Increment 2 qualification

2026-11-05 · default-on `textualWorkspace` flag retained

## Delivered

A working dedicated Textual Flint view hosts the **existing retained Document editor DOM**. It shares the original Flint controller, Document sessions, canonical repository, input gateway, selection model, history and persistence. Changing presentation does not create another editor or transfer content through snapshots.

Dedicated chrome provides Document tabs, application switching, status, File/Edit/Format/Block menus, New Document and Save destination/collision forms. Formatting calls the existing selection-aware toolbar handlers; contextual menus reuse the existing Block action models. File commands cover loaded/recent/saved Documents, Vault access, manual Save/Save As, import/export and existing recovery services. Existing service forms have a neutral portal parent so they remain visible in Textual while their graphical defaults remain unchanged.

Ordinary prose uses measured monospaced geometry. Font zoom and presentation CSS leave authored style metadata intact. A real integration discrepancy was corrected: Chrome rounds individually wrapped characters differently from one long probe Text node. The probe now measures the same inline-fragment arrangement as Cells. Superscript/subscript painting retains an offset without expanding the line box off the grid.

## Changed files / shared impact

- Dedicated presentation: `src/features/textual/{flint,command-menu,new-document}.tsx`, `file-actions.ts`, `view.tsx`, `textual.css`.
- Runtime ports/lifecycle: `src/application/document-application-ports.ts`, `document-host-presentations.ts`, and the existing document application/session/transfer and workspace presentation files.
- Narrow shared adapters: retained Document activity/surfaces; toolbar command ports and selection ownership; Save presenters and copy policy; application modal parent.
- One formatting transaction adapter now uses the **existing bounded structural transaction**. The browser had demonstrated a legacy snapshot in that handler. No new transaction or projection system was introduced.
- Regression additions: host presentation/rollback, single/multiple-owner bounded formatting, toolbar ownership and Save As source preservation. Browser harness: `scripts/check-textual-flint-browser.mjs`.

Exact boundaries, alternatives and coverage are recorded under S1–S5, S11 and S12 in the [Shared-Code Impact Register](TEXTUAL_IMPLEMENTATION_PLAN.md#increment-2-boundary-qualification--2026-11-05). Graphical Flint's shell and graphical stylesheet were not changed.

## Qualification results

**47 focused tests passed** across host presentation (3), existing host transfer (27), Save (3), range annotation (7) and selection ownership (7). TypeScript compilation passed (`tsconfig.reactive.json`).

The existing graphical annotation-toolbar suite additionally passed **28 tests**, with **2 existing failures**: Control-held grouping highlights produce four SVG groups where the assertions expect two. Both failures were reproduced from the pre-Increment-2 commit `2405c40` in an isolated source checkout. Assertions were not weakened and the unrelated drawing code was not changed. The previously accepted Canvas baseline failure was not requalified.

The real-Flint Chrome check used a read-only Michelangelo letter fixture, an additional Document with text/list/table/tab content, and two Flint application instances. Saves used an in-memory API stub; the separate Save tests used disposable temporary directories, including verification that Save As leaves the source bytes unchanged.

| Browser boundary | Result |
|---|---|
| Native typing, selection, Undo/Redo | Passed with trusted browser input |
| Composition | CDP composition/commit smoke passed; not a full operating-system IME matrix |
| Formatting menu | Selected range retained; canonical property created through the existing handler |
| Manual Save, Save As, cancellation | Passed; expected resource identity and filenames in captured Mutable JSON |
| New Document form cancellation | Passed; editing the form and pressing Save did not save another Document or open a second modal |
| Slash completion / service dialogs | Visible inside Textual and cancellable |
| Document and application switching | Existing session/editor retained; the application select was driven through its normal change handler |
| Shared Document occurrences | Edit in one Flint instance rebased the other instance's restored caret correctly |
| Scrolling | Native wheel scrolling and Document-switch scroll restoration passed in a shorter viewport |
| Representative Blocks | Lists/tables/tabs rendered; table-cell typing/Undo and tab navigation passed |
| Desktop → Textual → Desktop | Original editor, host binding and graphical font restored; subsequent trusted typing passed |

The shared-occurrence check caught and corrected a stale presentation bookmark. Restoration now follows the existing retained Document selection-rebasing rule. Scroll anchors retain Cell identity and resolve changed offsets only in the affected paragraph when restoring, not during typing.

## Measured geometry and bounded work

At a 1280 × 900 browser viewport and 100% font zoom:

- Cell advance: **9.640625 px**; line pitch: **20 px**.
- Qualified prose width: **125 cells**, starting at grid column **2**.
- Sampled native Cell advances matched the probe exactly; all eight prose Block starts were on integer grid rows.
- At 110% zoom, font size became **17.6 px**, with **120 Workspace columns**; selection remained intact.

Trusted typing, composition, Undo/Redo and formatting recorded **0 repository snapshots, 0 new projections, 0 full projection rebuilds and 0 reference-index rebuilds**. Presentation/zoom and switching among existing hosts also recorded zero snapshots; first visiting a previously unopened Document creates its normal retained view once. Explicit creation of a second application and explicit Save are excluded from the presentation/typing counters. Save intentionally uses the existing persistence capture.

These are browser geometry and work-count measurements, **not claims of input-to-display latency**. No arbitrary two-frame timing or full typing benchmark was substituted for interaction checks.

[Machine-readable browser results](TEXTUAL_INCREMENT_2_BROWSER.json) · [Textual screenshot](screenshots/textual-flint-increment-2.png) · [Desktop after return](screenshots/textual-flint-desktop-return.png)

## Remaining limits / next action

- The core Increment 2 editor and application-host lifecycle are qualified. Menus provide progressive command access; exhaustive command parity and every rare File/Vault workflow have not been individually requalified. Follow through using the existing inventory rather than generating another one.
- Ordinary prose is qualified against the cell grid. Complex Blocks retain their existing internal layouts; media, marginalia and further internal layout quantization remain Increment 4 work.
- Some less-frequent service dialogs currently retain their existing form contents inside the Textual modal parent. Dedicated Scry/LER, Gloss, References and Cardex views remain Increment 3; they have not been implemented here.
- Native clipboard behavior uses the existing gateway; a full clipboard/OS/IME matrix was not repeated.

Review this increment before starting Increment 3. No Increment 3 work has begun.
