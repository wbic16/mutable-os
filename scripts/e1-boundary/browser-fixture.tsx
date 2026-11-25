/** E1.0 only. No production imports this experiment; no session store or Detach UI.
 * Uses production Flint, TransientDocumentView, StandoffEditorView and portals.
 * The fixture owns every render root and records exact projection/owner lifetimes.
 */
import { createComponent, createSignal, getOwner, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import { WorkspaceSession } from "../../src/application/workspace-session";
import { WorkspacePresentationView } from "../../src/application/workspace-presentation-view";
import { materializeLocalWorkspace } from "../../src/reactive-editor/workspace-manifest";
import { ReactiveViewProvider } from "../../src/reactive-editor/context";
import { TransientDocumentView } from "../../src/rendering/transient-document-view";
import { ApplicationSurfacePortal } from "../../src/rendering/window-manager";
import { BlockOutlet } from "../../src/rendering/block-outlet";
import { nativeDocumentSession } from "../../src/persistence/native-session";
import "../../src/index.css";
import "../../src/demo/workspace-demo.css";

const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const trusted = (action: object) => new Promise<void>((resolve, reject) => {
  (globalThis as any).__mwmResume = (value: any) => value.error ? reject(Error(value.error)) : resolve();
  (globalThis as any).mwmInput(JSON.stringify(action));
});

export async function qualifyWindowManager() {
  const checks: string[] = [], observations: Record<string, any> = {};
  const check = (condition: unknown, label: string) => {
    if (!condition) throw Error(`${checks.length + 1}: ${label}`);
    checks.push(label); console.log(`E1.0 ${checks.length}: ${label}`);
  };
  const originalFetch = window.fetch, requests: string[] = [], cleanups: Array<() => void> = [];
  const OriginalWorker = window.Worker;
  const workers: Array<{ url: string; posts: number; terminated: boolean }> = [];
  window.Worker = class extends OriginalWorker {
    private evidence: (typeof workers)[number];
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options);
      this.evidence = { url: String(url), posts: 0, terminated: false }; workers.push(this.evidence);
    }
    postMessage(message: any, options?: any) { this.evidence.posts++; super.postMessage(message, options); }
    terminate() { this.evidence.terminated = true; super.terminate(); }
  };
  const report: Record<string, any> = { milestone: "E1.0 boundary proofs only", browser: navigator.userAgent, checks, observations, requestsBlockedOrStubbed: requests };
  window.fetch = (async (url: RequestInfo | URL) => {
    requests.push(String(url));
    return new Response(JSON.stringify(String(url) === "/api/native/vault/default"
      ? { Success: true, Data: { vault: "/e1-memory-only" } }
      : { Success: false, Error: "E1 isolated proof: backend unavailable" }), {
      status: String(url) === "/api/native/vault/default" ? 200 : 503,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const host = document.body.appendChild(document.createElement("main"));
  host.className = "workspace-demo workspace-demo--canonical";
  host.dataset.windowWorkArea = "";
  const fixture = { id: "e1-workspace", type: "workspace-block", children: [
    { id: "e1-bank", type: "workspace-object-bank-block", children: ["A", "B"].map(letter => ({
      id: `doc-${letter}`, type: "document-block", metadata: { documentId: `resource-${letter}`, title: `E1 ${letter}`, folder: ".", filename: `e1-${letter}.json` },
      children: Array.from({ length: 8 }, (_, i) => ({
        id: `${letter}-text-${i}`, type: "standoff-editor-block",
        text: `${letter} paragraph ${i}. Retained editor identity and selection must survive a host move.`,
      })),
    })) },
    { id: "ink-window", type: "document-window-block", metadata: { title: "E1 Ink", position: { x: 60, y: 400 }, size: { w: 650, h: 300 } }, children: [
      { id: "ink-document", type: "document-block", metadata: { documentId: "ink-resource", title: "Ink proof" }, children: [
        { id: "ink-text", type: "standoff-editor-block", text: "Ink's existing shared projection and render owner." },
      ] },
    ] },
    { id: "iframe-proof", type: "iframe-block", metadata: { url: "about:blank", title: "E1 iframe probe" } },
  ] };
  const session = new WorkspaceSession(materializeLocalWorkspace(fixture), { features: {
    entityReferences: false, nativeKnowledge: false, flintMaterialChrome: false,
    flintSpatialGraph: false, flintProbe: false,
  } });
  const { editor, projection: main, windowManager: manager } = session;
  const native = nativeDocumentSession(editor);
  const owners = new Map<string, any[]>();
  const instrumented = ["document-block", "standoff-editor-block", "iframe-block"].map(type => {
    const registration = editor.registry.resolve(type)!;
    const original = registration.view;
    registration.view = props => {
      const [local, setLocal] = createSignal("initial");
      const record = { owner: getOwner(), local, setLocal, disposed: 0 };
      owners.set(props.nodeKey, [...(owners.get(props.nodeKey) ?? []), record]);
      onCleanup(() => record.disposed++);
      return createComponent(original, props);
    };
    return () => { registration.view = original; };
  });
  const lifetimes: any[] = [];
  const createView = editor.createView, disposeView = editor.disposeView;
  const subscribe = editor.repository.subscribeChanges;
  let constructing: any;
  editor.repository.subscribeChanges = function (...args: any[]) {
    const record = constructing;
    if (record) record.subscriptions++;
    const release = subscribe.apply(this, args as any);
    let active = true;
    return () => { if (active && record) record.unsubscriptions++; active = false; release(); };
  };
  editor.createView = function (...args: any[]) {
    const record = { subscriptions: 0, unsubscriptions: 0, disposeCalls: 0 };
    constructing = record;
    try { const view = createView.apply(this, args as any); Object.assign(record, { view }); lifetimes.push(record); return view; }
    finally { constructing = undefined; }
  };
  editor.disposeView = function (view) {
    const record = lifetimes.find(r => r.view === view); if (record) record.disposeCalls++;
    return disposeView.call(this, view);
  };
  const stop = render(() => <WorkspacePresentationView session={session} />, host);
  const stopInput = editor.installGateway(document);
  cleanups.push(stop, stopInput);
  const textOf = (key: string) => editor.mounts.get(key)!.captureText!();
  const focus = (key: string, anchor = 2, head = anchor) => {
    const mount = editor.mounts.get(key)!;
    mount.focus(); mount.restoreInlineSelection!({ anchor, head });
  };
  try {
    await editor.commandRegistry.execute("flint.open", { targetKey: main.state.rootKey, args: undefined });
    await settle();
    const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('.flint-document-tab [role="tab"]')];
    check(tabs().length === 2, "production Flint opens two actual Document tabs");
    const first = lifetimes[0].view;
    const firstKey = Object.values(first.state.nodes).find((n: any) => n.payload.id === "A-text-0") as any;
    const firstMount = editor.mounts.get(firstKey.key)!;
    const firstOwner = owners.get(firstKey.key)![0];
    firstOwner.setLocal("local-state-A");
    const originalText = textOf(firstKey.key);
    focus(firstKey.key);
    let trustedInputs = 0;
    const input = (event: Event) => { if (event.isTrusted) trustedInputs++; };
    document.addEventListener("beforeinput", input, true);
    cleanups.push(() => document.removeEventListener("beforeinput", input, true));
    await trusted({ type: "text", text: "X" }); await settle();
    check(textOf(firstKey.key) === originalText.slice(0, 2) + "X" + originalText.slice(2), "trusted browser typing edits the real Flint standoff editor");
    focus(firstKey.key, 3, 6);
    const selectionBefore = firstMount.captureInlineSelection!();
    tabs()[1].click(); await settle();
    check(!editor.projections.has(first.viewId) && lifetimes[0].disposeCalls === 1, "Flint tab switch disposes the previous projection exactly once");
    check(lifetimes[0].subscriptions === 1 && lifetimes[0].unsubscriptions === 1, "Flint tab switch releases the projection repository subscription");
    check(firstOwner.disposed === 1 && !firstMount.root.isConnected && !editor.mounts.get(firstKey.key), "Flint tab switch disposes the Solid owner and unregisters/disconnects the editing DOM");
    tabs()[0].click(); await settle();
    const reopened = lifetimes.at(-1).view;
    const reopenedKey = Object.values(reopened.state.nodes).find((n: any) => n.payload.id === "A-text-0") as any;
    check(reopened !== first && reopened.viewId !== first.viewId && reopenedKey.key !== firstKey.key, "returning to Flint tab creates a new projection, ViewId and occurrence NodeKey");
    check(owners.get(reopenedKey.key)![0].local() === "initial" && editor.mounts.get(reopenedKey.key)!.root !== firstMount.root, "returning tab recreates DOM and resets instrumented owner-local state");
    check(textOf(reopenedKey.key).includes("X"), "canonical unsaved text survives transient tab disposal");
    observations.baselineSelection = { before: selectionBefore, after: editor.mounts.get(reopenedKey.key)!.captureInlineSelection!() };
    editor.repository.undo(); await settle();
    check(textOf(reopenedKey.key) === originalText, "repository undo history survives a Flint tab remount");

    const app = Object.values(main.state.nodes).find(n => n.viewType === "flint-application-block")!;
    const windowNode = editor.blockQueries.ancestors(app.key).find(n => n.viewType === "window-block")!;
    const placement = reopened.rootPlacementKey;
    // The fixture-owned render root is the only disposal authority. It is not a
    // session store, does not replace Flint's production Target, and mounts once.
    const source = document.body.appendChild(document.createElement("section"));
    const destination = document.body.appendChild(document.createElement("section"));
    source.style.cssText = "position:fixed;left:15px;top:15px;width:650px;height:280px;z-index:999999;background:white";
    destination.style.cssText = "position:fixed;left:700px;top:15px;width:650px;height:280px;z-index:999999;background:white";
    cleanups.push(() => { source.remove(); destination.remove(); });
    const island = source.appendChild(document.createElement("div"));
    island.style.cssText = "height:240px;overflow:auto";
    let retained: any, releasedProjection = 0, rootCleanup = 0;
    let bookmark: any;
    const stopRetained = render(() => {
      onCleanup(() => rootCleanup++);
      return <ReactiveViewProvider editor={editor} projection={main}>
        <TransientDocumentView editor={editor} placement={placement}
          onProjection={view => { retained = view; return () => releasedProjection++; }}
          bookmark={() => bookmark} remember={value => { bookmark = value; }} />
        <ApplicationSurfacePortal editor={editor} ownerKey={windowNode.key} id="e1-fixed-owner-probe">
          <span data-e1-portal>Fixed source owner</span>
        </ApplicationSurfacePortal>
      </ReactiveViewProvider>;
    }, island);
    let retainedStopped = false;
    const disposeRetained = () => { if (!retainedStopped) { retainedStopped = true; stopRetained(); } };
    cleanups.push(disposeRetained);
    await settle();
    const retainedKey = Object.values(retained.state.nodes).find((n: any) => n.payload.id === "A-text-0") as any;
    const retainedMount = editor.mounts.get(retainedKey.key)!;
    const retainedOwner = owners.get(retainedKey.key)![0];
    const retainedLifetime = lifetimes.find(r => r.view === retained);
    const documentRoot = island.querySelector("[data-document-view]");
    const projectionCount = editor.projections.size;
    retainedOwner.setLocal("retained local state");
    focus(retainedKey.key, 4, 9);
    island.scrollTop = 80;
    const savedScroll = island.scrollTop;
    const savedSelection = retainedMount.captureInlineSelection!();
    if (!savedSelection) throw Error("Retained view did not establish a browser selection");
    check(savedScroll > 0, "proof uses a genuinely scrollable real Document subtree");
    // Model inactive-tab retention without conditional rendering or a store.
    island.hidden = true; island.inert = true; await settle();
    const workerPosts = workers.reduce((n, w) => n + w.posts, 0);
    const beforeHidden = textOf(retainedKey.key);
    editor.commands.replaceInlineRange(reopenedKey.key, 0, 0, "H");
    await settle();
    // One bounded debounce interval, not a typing benchmark or load test.
    await new Promise(resolve => setTimeout(resolve, 400));
    observations.hiddenWorkerPosts = workers.reduce((n, w) => n + w.posts, 0) - workerPosts;
    check(textOf(retainedKey.key) === "H" + beforeHidden && retainedLifetime.unsubscriptions === 0, "hidden retained view keeps canonical subscription and receives edits from the other real view");
    editor.repository.undo(); await settle();
    island.hidden = false; island.inert = false; await settle();
    check(owners.get(retainedKey.key)!.length === 1 && retainedOwner.disposed === 0 && retainedOwner.local() === "retained local state", "visibility transition retains the actual editor owner and local state");
    focus(retainedKey.key, savedSelection.anchor, savedSelection.head);
    island.scrollTop = savedScroll;
    // Capture after the hidden edit/undo: editing can legitimately replace cell
    // occurrences and advance revisions. Isolate adoption from those changes.
    const nodeKeys = [...retained.occurrenceKeys()].sort().join("|");
    const inlineCell = retainedMount.root.querySelector("[data-inline-key]");
    const cells = [...island.querySelectorAll("[data-inline-key]")];
    const retainedOwners = [...retained.occurrenceKeys()].flatMap((key: string) =>
      (owners.get(key) ?? []).map(record => ({ key, record, count: owners.get(key)!.length })));
    const snapshot = JSON.stringify(editor.repository.snapshot());
    destination.append(island);
    observations.rawAdoption = {
      focused: document.activeElement === retainedMount.focusElement,
      selection: retainedMount.captureInlineSelection!() ?? null, scrollTop: island.scrollTop,
    };
    await settle();
    check(editor.projections.size === projectionCount && editor.projections.get(retained.viewId) === retained, "connected-host adoption retains exact projection object and ViewId");
    check([...retained.occurrenceKeys()].sort().join("|") === nodeKeys && editor.mounts.get(retainedKey.key) === retainedMount, "connected-host adoption retains every occurrence NodeKey and mount record");
    check(island.querySelector("[data-document-view]") === documentRoot && retainedMount.root.querySelector("[data-inline-key]") === inlineCell, "connected-host adoption retains Document and editing-cell DOM identity");
    check(owners.get(retainedKey.key)!.length === 1 && retainedOwner.owner && retainedOwner.disposed === 0 && rootCleanup === 0, "connected-host adoption neither recreates nor disposes the Solid owner");
    check(retainedOwners.every(({ key, record, count }) => record.disposed === 0 && owners.get(key)!.length === count)
      && cells.every((cell, index) => island.querySelectorAll("[data-inline-key]")[index] === cell),
      "all instrumented Document/paragraph owners and every editing cell survive adoption");
    check(retainedLifetime.subscriptions === 1 && retainedLifetime.unsubscriptions === 0 && retainedLifetime.disposeCalls === 0, "connected-host adoption preserves the original projection subscription");
    check(JSON.stringify(editor.repository.snapshot()) === snapshot, "host adoption alone leaves the complete canonical state unchanged");
    // DOM adoption can reset browser selection. This is explicit experimental
    // restoration, not a claim that the production focus/transfer port exists.
    focus(retainedKey.key, savedSelection.anchor, savedSelection.head);
    island.scrollTop = savedScroll;
    check(JSON.stringify(retainedMount.captureInlineSelection!()) === JSON.stringify(savedSelection) && island.scrollTop === savedScroll, "explicit view interaction restoration recovers selection and scroll without remount");
    const portal = document.querySelector("[data-e1-portal]")!;
    check(portal.closest<HTMLElement>("[data-mwm-window]")?.dataset.mwmWindow === windowNode.key, "negative proof: production portal remains owned by source window after editor DOM move");
    const beforeMoveEdit = textOf(retainedKey.key);
    await trusted({ type: "text", text: "M" }); await settle();
    check(textOf(retainedKey.key) === beforeMoveEdit.slice(0, savedSelection.anchor) + "M" + beforeMoveEdit.slice(savedSelection.head), "trusted browser input after move updates the same canonical resource exactly once");
    editor.repository.undo(); await settle();
    check(textOf(retainedKey.key) === beforeMoveEdit, "undo after move uses the retained canonical history");
    editor.repository.redo(); await settle();
    check(textOf(retainedKey.key).includes("M"), "redo after move remains functional");
    editor.repository.undo(); await settle();
    // Inject failure immediately after physical attachment and explicitly roll
    // back. This tests DOM/owner reversibility, not an implemented coordinator.
    const rollbackBefore = textOf(retainedKey.key);
    try { source.append(island); throw Error("E1 injected pre-commit failure"); }
    catch { destination.append(island); focus(retainedKey.key, 4, 9); island.scrollTop = savedScroll; }
    await settle();
    check(destination.contains(island) && retainedOwner.disposed === 0 && editor.mounts.get(retainedKey.key) === retainedMount && textOf(retainedKey.key) === rollbackBefore, "injected attachment failure can restore the identical retained subtree without content loss");
    source.append(island); await settle();
    observations.rawReturnScroll = island.scrollTop;
    island.scrollTop = savedScroll;
    check(source.contains(island) && retainedOwner.local() === "retained local state" && island.scrollTop === savedScroll, "reverse host adoption retains local state and permits explicit scroll restoration");
    await editor.closeView(windowNode.key); await settle();
    check(retainedMount.root.isConnected && editor.projections.has(retained.viewId) && nativeDocumentSession(editor) === native, "closing original Flint leaves independently rooted Document and workspace native-service identity alive");
    focus(retainedKey.key, 1);
    await trusted({ type: "text", text: "S" }); await settle();
    check(textOf(retainedKey.key)[1] === "S", "retained real editor still accepts trusted input after source Flint closes");
    observations.retained = { projectionSubscriptions: retainedLifetime.subscriptions, rawAdoption: observations.rawAdoption, explicitSelection: savedSelection, scrollTop: savedScroll, trustedInputs };
    disposeRetained(); await settle();
    check(rootCleanup === 1 && retainedOwner.disposed === 1 && releasedProjection === 1 && retainedLifetime.disposeCalls === 1 && retainedLifetime.unsubscriptions === 1, "sole fixture render disposer releases owner, projection and subscription exactly once");
    check(!editor.projections.has(retained.viewId) && !editor.mounts.get(retainedKey.key), "final disposal unregisters retained occurrences");
    check(nativeDocumentSession(editor) === native && editor.repository.state.contents[retainedKey.contentKey], "view disposal leaves canonical resource and native service intact");

    // Existing Ink's lifetime belongs to its original declarative parent.
    const inkText = Object.values(main.state.nodes).find(n => n.payload.id === "ink-text")!;
    const inkWindow = Object.values(main.state.nodes).find(n => n.payload.id === "ink-window")!;
    const inkMount = editor.mounts.get(inkText.key)!;
    const inkOwner = owners.get(inkText.key)![0];
    const inkDOM = inkMount.root.closest<HTMLElement>('[data-block-type="document-block"]')!;
    check(!!inkDOM && inkText.viewId === main.viewId, "production Ink Document is mounted inside the shared workspace projection");
    source.append(inkDOM); await settle();
    check(editor.mounts.get(inkText.key) === inkMount && inkOwner.disposed === 0, "raw Ink DOM adoption initially retains owner and shared occurrence identity");
    await editor.closeView(inkWindow.key); await settle();
    observations.inkSourceClose = { ownerDisposed: inkOwner.disposed, mounted: !!editor.mounts.get(inkText.key), domConnected: inkDOM.isConnected, projectionAlive: editor.projections.get(main.viewId) === main };
    check(inkOwner.disposed === 1 && !editor.mounts.get(inkText.key) && editor.projections.get(main.viewId) === main, "negative proof: closing original Ink parent disposes the adopted editor while shared projection survives");
    inkDOM.remove();
    // A fixture-owned island established at first mount CAN retain shared
    // projection occurrences. This is not adoption of the destroyed Ink owner.
    const bankDocument = Object.values(main.state.nodes).find(n => n.payload.id === "doc-A")!;
    const bankText = Object.values(main.state.nodes).find(n => n.payload.id === "A-text-0")!;
    const sharedIsland = source.appendChild(document.createElement("div"));
    const stopShared = render(() => <ReactiveViewProvider editor={editor} projection={main}><BlockOutlet nodeKey={bankDocument.key}/></ReactiveViewProvider>, sharedIsland);
    let sharedStopped = false;
    const disposeShared = () => { if (!sharedStopped) { sharedStopped = true; stopShared(); } };
    cleanups.push(disposeShared); await settle();
    const sharedMount = editor.mounts.get(bankText.key)!;
    const sharedOwner = owners.get(bankText.key)!.at(-1);
    const sharedNodes = [...main.occurrenceKeys()].sort().join("|");
    destination.append(sharedIsland); await settle();
    check(editor.mounts.get(bankText.key) === sharedMount && sharedOwner.disposed === 0 && [...main.occurrenceKeys()].sort().join("|") === sharedNodes, "first-mounted fixture-owned Ink island moves with the same shared projection, NodeKeys and editing DOM");
    focus(bankText.key, 0);
    const beforeShared = textOf(bankText.key);
    await trusted({ type: "text", text: "I" }); await settle();
    check(textOf(bankText.key) === "I" + beforeShared, "shared-projection retained island accepts trusted editing after move");
    disposeShared(); await settle();
    check(sharedOwner.disposed === 1 && !editor.mounts.get(bankText.key) && editor.projections.get(main.viewId) === main, "island disposer releases only its rendering; it does not dispose shared workspace projection");

    // Production IframeView negative control. Same outer DOM is insufficient.
    const iframeNode = Object.values(main.state.nodes).find(n => n.payload.id === "iframe-proof")!;
    const iframeIsland = source.appendChild(document.createElement("div"));
    const stopIframe = render(() => <ReactiveViewProvider editor={editor} projection={main}><BlockOutlet nodeKey={iframeNode.key}/></ReactiveViewProvider>, iframeIsland);
    cleanups.push(stopIframe); await settle();
    const iframe = iframeIsland.querySelector("iframe")!;
    (globalThis as any).__e1FrameLoads = 0;
    iframe.srcdoc = '<script>parent.__e1FrameLoads++;window.e1Volatile="fresh";</script>';
    for (let i = 0; i < 60 && !(globalThis as any).__e1FrameLoads; i++) await settle();
    check((globalThis as any).__e1FrameLoads === 1, "real IframeView descendant loads isolated same-origin content");
    (iframe.contentWindow as any).e1Volatile = "edited";
    const loads = (globalThis as any).__e1FrameLoads;
    destination.append(iframeIsland);
    for (let i = 0; i < 60 && (globalThis as any).__e1FrameLoads === loads; i++) await settle();
    observations.iframe = { sameElement: iframeIsland.querySelector("iframe") === iframe, loadsBefore: loads, loadsAfter: (globalThis as any).__e1FrameLoads, volatileState: (iframe.contentWindow as any).e1Volatile };
    check(observations.iframe.sameElement && observations.iframe.loadsAfter > loads && observations.iframe.volatileState === "fresh", "negative proof: connected-container append reloads iframe state despite identical iframe DOM");
    observations.projectionLifetimes = lifetimes.map(r => ({ viewId: r.view.viewId, subscriptions: r.subscriptions, unsubscriptions: r.unsubscriptions, disposeCalls: r.disposeCalls }));
    check(!requests.some(url => /save|write|publish/.test(url)), "bounded proof issued no Save or publication request");
    return report;
  } finally {
    cleanups.reverse().forEach(dispose => dispose());
    editor.createView = createView; editor.disposeView = disposeView; editor.repository.subscribeChanges = subscribe;
    instrumented.forEach(restore => restore());
    session.dispose(); host.remove(); window.fetch = originalFetch; window.Worker = OriginalWorker;
    report.cleanup = { remainingProjections: editor.projections.size, workers };
    check(editor.projections.size === 0 && workers.every(w => w.terminated), "fixture teardown releases all projections and every instrumented Worker");
  }
}
