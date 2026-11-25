/** Bounded production-component qualification. No backend writes or load testing. */
import { createComponent, createSignal, getOwner, onCleanup } from "solid-js";
import { ApplicationSurfacePortal, useManagedWindowOwner } from "../rendering/window-manager";
import { identityCoordinates } from "../runtime/local-coordinates";
import { render } from "solid-js/web";
import { WorkspaceSession } from "./workspace-session";
import { WorkspacePresentationView } from "./workspace-presentation-view";
import { materializeLocalWorkspace } from "../reactive-editor/workspace-manifest";
import { nativeDocumentSession } from "../persistence/native-session";
import "../index.css";
import "../demo/workspace-demo.css";

const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const trusted = (action: object) => new Promise<void>((resolve, reject) => {
  (globalThis as any).__mwmResume = (value: any) => value.error ? reject(Error(value.error)) : resolve();
  (globalThis as any).mwmInput(JSON.stringify(action));
});
const click = async (element: HTMLElement) => {
  const r = element.getBoundingClientRect();
  await trusted({ type: "click", x: r.x + r.width / 2, y: r.y + r.height / 2 }); await settle();
};

export async function qualifyWindowManager() {
  const checks: string[] = [], observations: Record<string, any> = {};
  const check = (condition: unknown, label: string) => {
    if (!condition) throw Error(`${checks.length + 1}: ${label}`);
    checks.push(label); console.log(`E1.2 ${checks.length}: ${label}`);
  };
  const originalFetch = window.fetch, requests: string[] = [], saves: any[] = [];
  let holdSave = false, finishSave: (() => void) | undefined;
  window.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    requests.push(String(url));
    if (String(url) === "/api/native/save") {
      const request = JSON.parse(String(init?.body)); saves.push(request);
      if (holdSave) await new Promise<void>(resolve => { finishSave = resolve; });
      return new Response(JSON.stringify({ Success: true, Data: {
        result: { phase: "saved", generation: request.generation.generation },
        baseline: { nativeHash: request.generation.generation, markdownHash: null, generation: request.generation.generation },
      } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ Success: false, Error: "Isolated E1.2 fixture: no backend" }), { status: 503 });
  }) as typeof fetch;
  const host = document.body.appendChild(document.createElement("main"));
  host.className = "workspace-demo workspace-demo--canonical"; host.dataset.windowWorkArea = "";
  const session = new WorkspaceSession(materializeLocalWorkspace({ id: "workspace", type: "workspace-block", children: [
    { id: "bank", type: "workspace-object-bank-block", children: ["A", "B"].map(letter => ({
      id: `doc-${letter}`, type: "document-block",
      metadata: { documentId: `resource-${letter}`, title: `E1.2 ${letter}`, folder: ".", filename: `e12-${letter}.mutable.json` },
      children: Array.from({ length: 14 }, (_, i) => ({
        id: `${letter}-text-${i}`, type: "standoff-editor-block",
        text: `${letter} paragraph ${i}. Retained Document session selection and editing continuity.`,
      })),
    })) },
  ] }), { features: { entityReferences: false, nativeKnowledge: false, flintLogo: false, flintMaterialChrome: false, flintSpatialGraph: false, flintProbe: false } });
  const { editor, projection, windowManager: manager } = session, store = session.documentSessions!;
  const owners = new Map<string, { owner: unknown; host?: ReturnType<typeof useManagedWindowOwner>; local: () => string; setLocal: (value: string) => void; disposed: number }>();
  const registration = editor.registry.resolve("standoff-editor-block")!, originalView = registration.view;
  registration.view = props => {
    const [local, setLocal] = createSignal("initial"), record = { owner: getOwner(), host: useManagedWindowOwner(), local, setLocal, disposed: 0 };
    owners.set(props.nodeKey, record); onCleanup(() => record.disposed++);
    return <>{createComponent(originalView, props)}<ApplicationSurfacePortal kind="tool" documentTransfer="retained"><input aria-label={`Transfer tool ${props.nodeKey}`} value="Tool state" /></ApplicationSurfacePortal></>;
  };
  const lifetimes: any[] = [];
  const createView = editor.createView, disposeView = editor.disposeView, subscribe = editor.repository.subscribeChanges;
  let constructing: any, subscriptionCalls = 0, activeSubscriptions = 0;
  editor.repository.subscribeChanges = function (...args) {
    subscriptionCalls++; activeSubscriptions++;
    const record = constructing; if (record) record.subscriptions++;
    const stop = subscribe.apply(this, args); let live = true;
    return () => { if (live) { activeSubscriptions--; if (record) record.unsubscriptions++; } live = false; stop(); };
  };
  editor.createView = function (...args) {
    const record = { subscriptions: 0, unsubscriptions: 0, disposals: 0 }; constructing = record;
    try { const view = createView.apply(this, args); Object.assign(record, { view }); lifetimes.push(record); return view; }
    finally { constructing = undefined; }
  };
  editor.disposeView = function (view) { const record = lifetimes.find(r => r.view === view); if (record) record.disposals++; return disposeView.call(this, view); };
  const stop = render(() => <WorkspacePresentationView session={session}/>, host);
  const stopInput = editor.installGateway(document);
  const native = nativeDocumentSession(editor);
  const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('.flint-document-tab [role="tab"]')];
  const text = (view: typeof projection, id: string) => Object.values(view.state.nodes).find(n => n.payload.id === id)!;
  const focus = (key: string, anchor: number, head = anchor) => {
    const mount = editor.mounts.get(key)!; mount.focus(); mount.restoreInlineSelection!({ anchor, head });
  };
  try {
    await editor.commandRegistry.execute("flint.open", { targetKey: projection.state.rootKey, args: undefined }); await settle();
    const app = Object.values(projection.state.nodes).find(n => n.viewType === "flint-application-block")!;
    const window = editor.blockQueries.ancestors(app.key).find(n => n.viewType === "window-block")!;
    check(tabs().length === 2 && store.size === 1, "production Flint lazily mounts only the initially selected Document");
    const a = store.sessions()[0], node = text(a.projection, "A-text-0"), mount = editor.mounts.get(node.key)!;
    const owner = owners.get(node.key)!; owner.setLocal("owner-local-A");
    const cells = [...mount.root.querySelectorAll("[data-inline-key]")], initialText = mount.captureText!();
    check(cells.length > 0, "identity instrumentation observes actual editing cells");
    focus(node.key, 2);
    await trusted({ type: "text", text: "X" }); await settle();
    check(mount.captureText!() === initialText.slice(0, 2) + "X" + initialText.slice(2), "trusted browser input reaches the actual editor once");
    focus(node.key, 7, 3);
    const beforeSelection = mount.captureInlineSelection!();
    const panel = mount.root.closest<HTMLElement>('[role="tabpanel"]')!;
    panel.scrollTop = 90; const scroll = panel.scrollTop;
    await click(tabs()[1]);
    check(store.size === 2 && editor.projections.get(a.projection.viewId) === a.projection, "tab switching retains the same projection and ViewId");
    check(a.host.activity().mounted && !a.host.activity().visible && !a.host.activity().active && panel.inert && panel.hidden, "hidden tab remains mounted but invisible, inactive and inert");
    check(editor.mounts.get(node.key) === mount && mount.root.isConnected && owner.disposed === 0, "hidden editor retains occurrence key, Solid owner and connected DOM");
    check(lifetimes.length === 2 && lifetimes.every(r => r.subscriptions === 1 && r.unsubscriptions === 0), "each private projection has exactly one live canonical subscription");
    await click(tabs()[0]);
    observations.selection = { before: beforeSelection, after: mount.captureInlineSelection!() };
    check(JSON.stringify(mount.captureInlineSelection!()) === JSON.stringify(beforeSelection), "backward native standoff selection survives trusted tab clicks");
    check(owner.local() === "owner-local-A" && editor.mounts.get(node.key) === mount, "owner-local state and mount identity survive returning to the tab");
    check(panel.scrollTop === scroll && scroll > 0, "Document scroll position survives hidden and visible transitions");
    const stableCells = [...mount.root.querySelectorAll("[data-inline-key]")];
    const subscriptionsBefore = activeSubscriptions, callsBefore = subscriptionCalls;
    await click(tabs()[1]); await click(tabs()[0]);
    check(stableCells.every((cell, i) => mount.root.querySelectorAll("[data-inline-key]")[i] === cell), "unchanged editing cell DOM survives repeated tab switching");
    observations.visitedTabSubscriptions = { before: subscriptionsBefore, after: activeSubscriptions, newCalls: subscriptionCalls - callsBefore };
    check(activeSubscriptions === subscriptionsBefore, "switching visited tabs does not accumulate repository subscriptions");
    editor.crossText.enable(true);
    const secondParagraph = text(a.projection, "A-text-1");
    editor.crossText.set(editor.crossText.position(node.key, 2), editor.crossText.position(secondParagraph.key, 4));
    const crossText = editor.crossText.selectedText();
    await click(tabs()[1]);
    check(!editor.crossText.range(), "hidden Document releases global cross-Block input ownership");
    await click(tabs()[0]);
    check(editor.crossText.selectedText() === crossText, "returning tab restores its valid cross-Block selection bookmark");
    editor.crossText.clear(); focus(node.key, 7, 3);
    await click(tabs()[1]);
    // A second independent view exercises the existing input position mapping;
    // it is not a moved or reconstructed instance of the retained first view.
    const existing = new Set(store.sessions());
    await editor.commandRegistry.execute("flint.open", { targetKey: projection.state.rootKey, args: undefined }); await settle();
    const peer = store.sessions().find(s => !existing.has(s))!, peerNode = text(peer.projection, "A-text-0");
    check(peer.projection !== a.projection && peerNode.contentKey === node.contentKey, "a second Flint view has independent view identity around the same canonical resource");
    focus(peerNode.key, 0);
    const getRect = Element.prototype.getBoundingClientRect; let hiddenLayoutReads = 0;
    Element.prototype.getBoundingClientRect = function () {
      if (this === mount.root || mount.root.contains(this)) hiddenLayoutReads++;
      return getRect.call(this);
    };
    try { await trusted({ type: "text", text: "Hidden " }); await settle(); }
    finally { Element.prototype.getBoundingClientRect = getRect; }
    observations.hiddenEditorLayoutReads = hiddenLayoutReads;
    check(hiddenLayoutReads === 0, "editing through a visible peer performs no geometry reads in the hidden retained editor");
    check(mount.captureText!().startsWith("Hidden "), "canonical edit delivery updates the retained hidden editor");
    await editor.closeView(peer.host.windowId); await settle();
    manager!.lifecycle.reveal(window.key); await settle();
    await click(tabs()[0]);
    const rebased = mount.captureInlineSelection!();
    observations.rebasedSelection = rebased;
    check(rebased?.anchor === 14 && rebased?.head === 10, "selection rebases through an edit received while hidden");
    editor.repository.undo(); await settle();
    check(mount.captureText!() === initialText.slice(0, 2) + "X" + initialText.slice(2) && nativeDocumentSession(editor) === native, "canonical undo and native-resource service authority remain unchanged");

    // Exercise real client capture, receipt and dirty acknowledgement with an
    // in-memory transport. This never calls the filesystem/native backend.
    await native.save("resource-A", { folder: ".", filename: "e12-A.mutable.json" });
    check(!native.isDirty("resource-A") && saves.length === 1, "manual native Save binds the canonical resource without allocating another session");
    focus(node.key, 0); await trusted({ type: "text", text: "Saved " }); await settle();
    holdSave = true;
    await trusted({ type: "key", key: "s", modifiers: 2 }); await settle();
    check(saves.length === 2 && !!finishSave && native.knowledgeEvidence("resource-A").pending, "Control-S captures exactly one Save for the active Document");
    await click(tabs()[1]);
    editor.commands.replaceInlineRange(node.key, 0, 0, "Newer "); await settle();
    finishSave!(); await settle(); holdSave = false;
    check(native.isDirty("resource-A") && !native.knowledgeEvidence("resource-A").pending && saves.length === 2, "pending Save survives tab switching and its receipt does not acknowledge newer edits");
    check(saves.every(s => s.generation.resourceId === "resource-A" && s.location.filename === "e12-A.mutable.json" && !("markdown" in s.generation)), "Save retains the opened filename and canonical identity and emits no Markdown sidecar");
    await click(tabs()[0]);
    // Harness-only controls invoke the E1.2 coordinator. E1.3 product UI and
    // standalone shell creation are deliberately not installed by production.
    const transfer = store.transfers, source = transfer.current(a)!;
    const destinationPlacement = editor.commands.insert({ id: "transfer-target", type: "document-window-block",
      metadata: { title: "E1.2 fixture destination", position: { x: 700, y: 50 }, size: { w: 650, h: 600 } }, children: [] },
      { kind: "at", parentKey: projection.state.rootKey, index: 0 }); await settle();
    const destinationWindow = editor.nodeForPlacementInView(destinationPlacement, projection.viewId)!;
    const container = document.createElement("div"); container.style.cssText = "height:380px;overflow:auto";
    manager!.groups.get(destinationWindow.key)!.querySelector(".reactive-window__document-body")!.append(container);
    const destination = transfer.register({ kind: "managed-document", ownerKey: destinationWindow.key,
      slotKey: "fixture-document", windowId: destinationWindow.key, container, scrollport: container,
      coordinates: identityCoordinates, selected: () => true });
    const toolbar = document.body.appendChild(document.createElement("div"));
    toolbar.style.cssText = "position:fixed;bottom:0;left:10px;z-index:2147483647;background:white";
    let operation: Promise<unknown> | undefined, fail = false;
    const move = document.createElement("button"), back = document.createElement("button");
    move.textContent = "Fixture: transfer Document"; back.textContent = "Fixture: return Document";
    toolbar.append(move, back);
    for (const button of [move, back]) button.addEventListener("pointerdown", event => event.preventDefault());
    move.onclick = () => { operation = transfer.transfer(a, destination, { checkpoint: point => { if (fail && point === 'surfaces') throw Error('injected browser rollback'); } }); void operation.catch(() => {}); };
    back.onclick = () => { operation = transfer.transfer(a, source); void operation.catch(() => {}); };
    try {
      manager!.lifecycle.reveal(window.key); focus(node.key, 7, 3); panel.scrollTop = 90; await settle(); const transferScroll = panel.scrollTop;
      const before = { count: store.size, subscriptions: activeSubscriptions, views: lifetimes.length,
        revision: editor.repository.state.revision, owner: owner.owner, text: mount.captureText!() };
      const tool = host.ownerDocument.querySelector<HTMLInputElement>(`[aria-label="Transfer tool ${node.key}"]`)!;
      tool.value = "Session-owned tool state";
      const toolHost = tool.closest<HTMLElement>('[data-mwm-surface]')!, toolId = toolHost.dataset.mwmSurface!;
      fail = true; await click(move); let rejected = false;
      try { await operation; } catch { rejected = true; }
      check(rejected && source.port.container.contains(a.element) && transfer.owns(a, source), "browser attachment/surface failure rolls back to the original usable host");
      check(mount.captureInlineSelection!()?.anchor === 7 && mount.captureInlineSelection!()?.head === 3 && panel.scrollTop === transferScroll && transferScroll > 0, "rollback restores backward selection and source scroll");
      check(transfer.diagnostics().reservations === 0 && transfer.diagnostics().pending === 0 && tool.value === "Session-owned tool state", "rollback releases reservations while preserving tool-local state");
      fail = false; await click(move); await operation; await settle();
      check(store.size === before.count && lifetimes.length === before.views && activeSubscriptions === before.subscriptions, "transfer allocates no editing session, projection or canonical subscription");
      check(editor.mounts.get(node.key) === mount && owner.owner === before.owner && owner.disposed === 0 && owner.local() === "owner-local-A", "transfer preserves actual editing DOM and Solid owner/local identity");
      check(owner.host!.windowId === destinationWindow.key && manager!.ownerForNode(node.key) === destinationWindow.key, "reactive context and ownership queries follow the committed destination");
      check(manager!.registry.surfaces[toolId].ownerWindowId === destinationWindow.key && manager!.groups.get(destinationWindow.key)!.contains(toolHost), "Document-owned portal keeps its lease and DOM under the destination stacking group");
      check(container.scrollTop === transferScroll && mount.captureInlineSelection!()?.anchor === 7 && mount.captureInlineSelection!()?.head === 3, "committed transfer restores selection and destination scroll");
      check(editor.repository.state.revision === before.revision && mount.captureText!() === before.text, "host transfer creates no canonical edit or content-history entry");
      focus(node.key, 0); await trusted({ type: "text", text: "Transferred " }); await settle();
      check(mount.captureText!().startsWith("Transferred "), "trusted input continues in the transferred editor");
      editor.repository.undo(); await settle(); check(mount.captureText!() === before.text, "transferred editor keeps canonical undo authority");
      editor.repository.redo(); await settle(); check(mount.captureText!().startsWith("Transferred "), "transferred editor keeps canonical redo authority");
      manager!.lifecycle.minimize(destinationWindow.key); await settle();
      check(!a.host.activity().visible && editor.mounts.get(node.key) === mount && toolHost.hidden, "destination minimization retains editor and hides its owned tool");
      editor.commands.replaceInlineRange(node.key, 0, 0, "Hidden destination "); await settle();
      manager!.lifecycle.reveal(destinationWindow.key); await settle();
      check(a.host.activity().visible && mount.captureText!().startsWith("Hidden destination "), "destination restore preserves hidden canonical delivery");
      await trusted({ type: "viewport", width: 1100, height: 760 }); await trusted({ type: "browserZoom", scale: 1.25 }); await settle();
      check(editor.mounts.get(node.key) === mount && owner.disposed === 0, "transferred session survives viewport change and real browser zoom");
      await trusted({ type: "browserZoom", scale: 1 }); await trusted({ type: "viewport", width: 1440, height: 1000 }); await settle();
      holdSave = true; finishSave = undefined; focus(node.key, 0);
      await trusted({ type: "key", key: "s", modifiers: 2 }); await settle();
      check(saves.length === 3 && saves[2].generation.resourceId === 'resource-A' && !!finishSave, "Control-S in the destination routes once to the same canonical Save binding");
      let busyRejected = false;
      try { await transfer.transfer(a, source); } catch { busyRejected = true; }
      check(busyRejected && transfer.owns(a, destination) && native.knowledgeEvidence('resource-A').pending, "pending Save rejects Return without cancelling or reissuing the resource operation");
      finishSave!(); holdSave = false; await settle();
      focus(node.key, 7, 3); await click(back); await operation; await settle();
      check(transfer.atOrigin(a) && editor.mounts.get(node.key) === mount && owner.host!.windowId === window.key, "Return uses a fresh transaction and restores the same session to its original slot");
      check(manager!.registry.surfaces[toolId].ownerWindowId === window.key && tool.value === "Session-owned tool state", "Return restores portal ownership without recreating its state");
      focus(node.key, mount.captureText!().length);
      await trusted({ type: "key", key: "ArrowRight", modifiers: 8 }); await settle();
      const crossInput = document.querySelector<HTMLTextAreaElement>('[data-cross-text-input]')!;
      check(!!crossInput && document.activeElement === crossInput && !!editor.crossText.range(), "trusted Shift-Right establishes real cross-Block input ownership");
      const crossBefore = editor.crossText.selectedText(), crossRange = editor.crossText.range()!;
      await transfer.transfer(a, destination); await settle();
      check(document.activeElement === crossInput && crossInput.dataset.mwmWindow === destinationWindow.key && editor.crossText.selectedText() === crossBefore && editor.crossText.range()!.anchor.occurrenceKey === crossRange.anchor.occurrenceKey, "cross-Block selection and the same workspace input textarea follow the transferred host");
      await transfer.transfer(a, source); await settle();
      check(crossInput.dataset.mwmWindow === window.key && editor.crossText.selectedText() === crossBefore, "Return preserves cross-Block input identity and restores its owner");
      editor.crossText.clear();
      // A final move demonstrates stale source cleanup cannot dispose the session.
      focus(node.key, 7, 3); await click(move); await operation; await settle();
      await editor.closeView(window.key); await settle();
      check(a.current() && editor.mounts.get(node.key) === mount && tool.isConnected, "closing source Flint leaves its transferred editor and owned portal alive");
      focus(node.key, 0); await trusted({ type: "text", text: "After source close " }); await settle();
      await trusted({ type: "key", key: "s", modifiers: 2 }); await settle();
      check(mount.captureText!().startsWith("After source close ") && saves.at(-1).generation.resourceId === "resource-A", "Flint editing and native Save continue after the original application closes");
      destination.release(); await settle();
      check(a.signal.aborted && owner.disposed === 1, "current destination lease closes the session exactly once after multiple transfers");
    } finally { toolbar.remove(); destination.release(); }
    const inkPlacement = editor.commands.insert({ id: "ink-transfer-source", type: "document-window-block",
      metadata: { title: "E1.2 Ink", position: { x: 50, y: 400 }, size: { w: 600, h: 300 } },
      children: [{ id: "ink-transfer-document", type: "document-block", metadata: { documentId: "ink-transfer-resource" },
        children: [{ id: "ink-transfer-text", type: "standoff-editor-block", text: "Ink retained session" }] }] },
      { kind: "at", parentKey: projection.state.rootKey, index: 0 }); await settle();
    const inkWindow = editor.nodeForPlacementInView(inkPlacement, projection.viewId)!;
    const inkSession = store.sessions().find(s => s.host.windowId === inkWindow.key)!, inkNode = text(projection, "ink-transfer-text");
    const inkMount = editor.mounts.get(inkNode.key)!, inkOwner = owners.get(inkNode.key)!;
    const inkDestination = transfer.register(destination.port);
    await native.save("ink-transfer-resource", { folder: ".", filename: "ink-transfer.mutable.json" });
    manager!.lifecycle.reveal(inkWindow.key); focus(inkNode.key, 3);
    const inkSubscriptions = activeSubscriptions, inkCount = store.size;
    await transfer.transfer(inkSession, inkDestination); await settle();
    check(inkSession.projection === projection && !inkSession.ownsProjection && editor.mounts.get(inkNode.key) === inkMount, "real Ink transfer preserves its shared projection, occurrence route and editing DOM");
    check(activeSubscriptions === inkSubscriptions && store.size === inkCount && inkOwner.disposed === 0, "Ink transfer adds no session or canonical subscription");
    await editor.closeView(inkWindow.key); await settle();
    check(inkSession.current() && editor.mounts.get(inkNode.key) === inkMount, "closing the original Ink window cannot dispose the transferred session");
    focus(inkNode.key, 3); await trusted({ type: "text", text: "X" }); await settle();
    check(inkMount.captureText!() === "InkX retained session", "trusted Ink input remains live after original-host closure");
    await trusted({ type: "key", key: "s", modifiers: 2 }); await settle();
    check(saves.at(-1).generation.resourceId === "ink-transfer-resource" && saves.at(-1).location.filename === "ink-transfer.mutable.json", "Ink Save retains its canonical binding after original-host closure");
    await editor.closeView(destinationWindow.key); await settle();
    check(inkSession.signal.aborted && inkOwner.disposed === 1 && editor.projections.get(projection.viewId) === projection, "destination close disposes the Ink island once and preserves the workspace projection");

    // Remaining E1.1 checks below use A. Releasing its destination is a final
    // disposal proof, so this E1.2 fixture ends its own qualification here.
    await editor.closeView(window.key); await settle();
    session.dispose(); stop();
    check(lifetimes.every(r => r.disposals === 1 && r.subscriptions === 1 && r.unsubscriptions === 1), "all private projections and canonical subscriptions have exact final disposal counts");
    observations.transfer = transfer.diagnostics();
    return { milestone: "E1.2", browser: navigator.userAgent, checks, observations, requestsBlockedOrStubbed: requests };

  } finally {
    finishSave?.(); stopInput(); stop(); session.dispose();
    registration.view = originalView; window.fetch = originalFetch; host.remove();
  }
}
