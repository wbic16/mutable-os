/** Bounded production-component qualification. No backend writes or load testing. */
import { createComponent, createSignal, getOwner, onCleanup } from "solid-js";
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
    checks.push(label); console.log(`E1.1 ${checks.length}: ${label}`);
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
    return new Response(JSON.stringify({ Success: false, Error: "Isolated E1.1 fixture: no backend" }), { status: 503 });
  }) as typeof fetch;
  const host = document.body.appendChild(document.createElement("main"));
  host.className = "workspace-demo workspace-demo--canonical"; host.dataset.windowWorkArea = "";
  const session = new WorkspaceSession(materializeLocalWorkspace({ id: "workspace", type: "workspace-block", children: [
    { id: "bank", type: "workspace-object-bank-block", children: ["A", "B"].map(letter => ({
      id: `doc-${letter}`, type: "document-block",
      metadata: { documentId: `resource-${letter}`, title: `E1.1 ${letter}`, folder: ".", filename: `e11-${letter}.mutable.json` },
      children: Array.from({ length: 14 }, (_, i) => ({
        id: `${letter}-text-${i}`, type: "standoff-editor-block",
        text: `${letter} paragraph ${i}. Retained Document session selection and editing continuity.`,
      })),
    })) },
  ] }), { features: { entityReferences: false, nativeKnowledge: false, flintLogo: false, flintMaterialChrome: false, flintSpatialGraph: false, flintProbe: false } });
  const { editor, projection, windowManager: manager } = session, store = session.documentSessions!;
  const owners = new Map<string, { owner: unknown; local: () => string; setLocal: (value: string) => void; disposed: number }>();
  const registration = editor.registry.resolve("standoff-editor-block")!, originalView = registration.view;
  registration.view = props => {
    const [local, setLocal] = createSignal("initial"), record = { owner: getOwner(), local, setLocal, disposed: 0 };
    owners.set(props.nodeKey, record); onCleanup(() => record.disposed++);
    return createComponent(originalView, props);
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
    await native.save("resource-A", { folder: ".", filename: "e11-A.mutable.json" });
    check(!native.isDirty("resource-A") && saves.length === 1, "manual native Save binds the canonical resource without allocating another session");
    focus(node.key, 0); await trusted({ type: "text", text: "Saved " }); await settle();
    holdSave = true;
    await trusted({ type: "key", key: "s", modifiers: 2 }); await settle();
    check(saves.length === 2 && !!finishSave && native.knowledgeEvidence("resource-A").pending, "Control-S captures exactly one Save for the active Document");
    await click(tabs()[1]);
    editor.commands.replaceInlineRange(node.key, 0, 0, "Newer "); await settle();
    finishSave!(); await settle(); holdSave = false;
    check(native.isDirty("resource-A") && !native.knowledgeEvidence("resource-A").pending && saves.length === 2, "pending Save survives tab switching and its receipt does not acknowledge newer edits");
    check(saves.every(s => s.generation.resourceId === "resource-A" && s.location.filename === "e11-A.mutable.json" && !("markdown" in s.generation)), "Save retains the opened filename and canonical identity and emits no Markdown sidecar");
    await click(tabs()[0]);
    manager!.lifecycle.minimize(window.key); await settle();
    check(!a.host.activity().visible && editor.mounts.get(node.key) === mount, "minimizing Flint retains its editing session");
    manager!.lifecycle.reveal(window.key); await settle();
    check(a.host.activity().visible && editor.mounts.get(node.key) === mount, "restoring Flint reveals the exact retained session");
    await trusted({ type: "viewport", width: 1100, height: 760 }); await settle();
    await trusted({ type: "browserZoom", scale: 1.25 }); await settle();
    check(editor.mounts.get(node.key) === mount && owner.disposed === 0, "viewport resize and real Chrome zoom preserve editor identity");
    await trusted({ type: "browserZoom", scale: 1 }); await trusted({ type: "viewport", width: 1440, height: 1000 }); await settle();

    mount.focusElement.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    tabs()[1].click(); await settle();
    check(tabs()[0].getAttribute("aria-selected") === "true", "synthetic composition boundary blocks internal tab switching");
    mount.focusElement.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })); await settle();
    const inkPlacement = editor.commands.insert({
      id: "ink", type: "document-window-block", metadata: { title: "E1.1 Ink", position: { x: 40, y: 400 }, size: { w: 600, h: 280 } },
      children: [{ id: "ink-document", type: "document-block", children: [{ id: "ink-text", type: "standoff-editor-block", text: "Ink original" }] }],
    }, { kind: "at", parentKey: projection.state.rootKey, index: 0 }); await settle();
    const inkWindow = editor.nodeForPlacementInView(inkPlacement, projection.viewId)!;
    const ink = store.sessions().find(s => s.host.ownerKey === inkWindow.key)!;
    const inkNode = text(projection, "ink-text"), inkMount = editor.mounts.get(inkNode.key)!;
    check(ink.projection === projection && !ink.ownsProjection, "eligible new Ink island retains original shared projection and occurrence ancestry");
    manager!.lifecycle.activate(inkWindow.key); focus(inkNode.key, 3);
    await trusted({ type: "text", text: "X" }); await settle();
    check(inkMount.captureText!() === "InkX original", "trusted input works in the retained production Ink editor");
    manager!.lifecycle.minimize(inkWindow.key); await settle();
    editor.commands.replaceInlineRange(inkNode.key, 0, 0, "Hidden "); await settle();
    check(inkMount.captureText!() === "Hidden InkX original" && !ink.host.activity().visible, "hidden Ink retains canonical edit delivery");
    manager!.lifecycle.reveal(inkWindow.key); await settle();
    check(editor.mounts.get(inkNode.key) === inkMount && owners.get(inkNode.key)!.disposed === 0, "Ink restoration preserves DOM, occurrence and owner");
    await editor.closeView(inkWindow.key); await settle();
    check(ink.signal.aborted && owners.get(inkNode.key)!.disposed === 1 && editor.projections.get(projection.viewId) === projection, "Ink close disposes the island once without disposing the shared workspace projection");

    manager!.lifecycle.reveal(window.key); await settle();
    let decide!: (ok: boolean) => void, closeSignal: AbortSignal | undefined;
    editor.viewCloseGuards.set(a.host.slotKey, signal => { closeSignal = signal; return new Promise(resolve => { decide = resolve; }); });
    const closeA = () => host.querySelector<HTMLButtonElement>('[aria-label="Close Document: E1.1 A"]')!;
    await click(closeA()); decide(false); await settle();
    check(a.current() && owner.disposed === 0, "cancelled guarded tab close preserves the exact session");
    await click(closeA()); await editor.closeView(window.key); await settle();
    check(closeSignal?.aborted && store.size === 0, "application close aborts pending tab close and releases retained sessions");
    decide(true); await settle();
    check(lifetimes.every(r => r.disposals === 1 && r.subscriptions === 1 && r.unsubscriptions === 1), "each private projection and canonical subscription is disposed exactly once");
    check([...owners.values()].every(o => o.disposed === 1), "every instrumented actual editor owner is disposed exactly once");
    session.dispose(); stop();
    check(store.size === 0 && store.signal.aborted, "workspace disposal is idempotent and invalidates pending session work");
    observations.projectionLifetimes = lifetimes.map(r => ({ viewId: r.view.viewId, subscriptions: r.subscriptions, unsubscriptions: r.unsubscriptions, disposals: r.disposals }));
    observations.saveTransport = "Real native client and shell Save; in-memory HTTP responses, no filesystem writes";
    return { milestone: "E1.1", browser: navigator.userAgent, checks, observations, requestsBlockedOrStubbed: requests };
  } finally {
    finishSave?.(); stopInput(); stop(); session.dispose();
    registration.view = originalView; window.fetch = originalFetch; host.remove();
  }
}
