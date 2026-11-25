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
    checks.push(label); console.log(`E1.3 ${checks.length}: ${label}`);
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
    return new Response(JSON.stringify({ Success: false, Error: "Isolated E1.3 fixture: no backend" }), { status: 503 });
  }) as typeof fetch;
  const host = document.body.appendChild(document.createElement("main"));
  host.className = "workspace-demo workspace-demo--canonical"; host.dataset.windowWorkArea = "";
  const session = new WorkspaceSession(materializeLocalWorkspace({ id: "workspace", type: "workspace-block", children: [
    { id: "bank", type: "workspace-object-bank-block", children: ["A", "B"].map(letter => ({
      id: `doc-${letter}`, type: "document-block",
      metadata: { documentId: `resource-${letter}`, title: `E1.3 ${letter}`, folder: ".", filename: `e13-${letter}.mutable.json` },
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
    await native.save("resource-A", { folder: ".", filename: "e13-A.mutable.json" });
    check(!native.isDirty("resource-A") && saves.length === 1, "manual native Save binds the canonical resource without allocating another session");
    focus(node.key, 0); await trusted({ type: "text", text: "Saved " }); await settle();
    holdSave = true;
    await trusted({ type: "key", key: "s", modifiers: 2 }); await settle();
    check(saves.length === 2 && !!finishSave && native.knowledgeEvidence("resource-A").pending, "Control-S captures exactly one Save for the active Document");
    await click(tabs()[1]);
    editor.commands.replaceInlineRange(node.key, 0, 0, "Newer "); await settle();
    finishSave!(); await settle(); holdSave = false;
    check(native.isDirty("resource-A") && !native.knowledgeEvidence("resource-A").pending && saves.length === 2, "pending Save survives tab switching and its receipt does not acknowledge newer edits");
    check(saves.every(s => s.generation.resourceId === "resource-A" && s.location.filename === "e13-A.mutable.json" && !("markdown" in s.generation)), "Save retains the opened filename and canonical identity and emits no Markdown sidecar");
    await click(tabs()[0]);

    const product=store.detachment!, transfer=store.transfers;
    const findButton=(label:string,root:ParentNode=document)=>[...root.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label)!;
    const until=async(test:()=>boolean)=>{for(let i=0;i<120;i++){if(test())return;await settle();}throw Error('Product operation timed out: '+product.message());};
    const detach=async(letter:string)=>{
      manager!.lifecycle.reveal(window.key);await settle();
      await click(host.querySelector<HTMLButtonElement>(`[aria-label="Document actions: E1.3 ${letter}"]`)!);
      const action=findButton('Detach Document');check(!!action&&!action.disabled,`product Detach action is available for ${letter}`);
      await click(action);await until(()=>!!product.windows().find(w=>product.resource(w.session)===`resource-${letter}`&&!w.state.pending));
      return product.windows().find(w=>product.resource(w.session)===`resource-${letter}`)!;
    };
    focus(node.key,7,3); panel.scrollTop=80;await settle();const beforeScroll=panel.scrollTop;
    const before={views:lifetimes.length,count:store.size,subscriptions:activeSubscriptions,revision:editor.repository.state.revision,owner:owner.owner};
    let w=await detach('A');
    check(a.host.windowId===w.id&&editor.mounts.get(node.key)===mount&&owner.owner===before.owner&&owner.disposed===0,'product Detach preserves the actual owner, DOM, session and occurrence');
    check(lifetimes.length===before.views&&store.size===before.count&&activeSubscriptions===before.subscriptions,'product shell creates no editing projection, session or canonical subscriber');
    check(editor.repository.state.revision===before.revision,'runtime shell creates no canonical Block or content undo entry');
    check(mount.captureInlineSelection!()?.anchor===7&&mount.captureInlineSelection!()?.head===3,'product menu Detach preserves backward selection');
    check(w.destination!.port.scrollport!.scrollTop===beforeScroll,'product Detach restores the source scroll position');
    check(!!host.querySelector('[aria-label="Detached window"]'),'source Flint tab displays the detached reference indicator');
    check(document.body.textContent!.includes('return or close them before saving a Workspace'),'workspace persistence restriction is visibly communicated');
    let blocked=false;try{editor.persistence.captureWorkspace();}catch{blocked=true;}check(blocked,'workspace capture still refuses detached topology');
    await click(manager!.groups.get(w.id)!.querySelector<HTMLButtonElement>('[aria-label="Minimize window"]')!);
    check(a.current()&&!a.host.activity().visible&&editor.mounts.get(node.key)===mount,'product minimize retains the exact detached editing subtree');
    await click(manager!.groups.get(w.id)!.querySelector<HTMLButtonElement>('[data-window-icon]')!);
    check(a.host.activity().visible&&editor.mounts.get(node.key)===mount,'product restore reveals the same editor');
    await trusted({type:'viewport',width:1100,height:760});await trusted({type:'browserZoom',scale:1.25});await settle();
    check(editor.mounts.get(node.key)===mount&&owner.disposed===0,'standalone product host survives viewport resizing and actual browser zoom');
    await trusted({type:'browserZoom',scale:1});await trusted({type:'viewport',width:1440,height:1000});await settle();
    focus(node.key,0);await trusted({type:'text',text:'Detached '});await settle();const edited=mount.captureText!();
    check(edited.startsWith('Detached '),'trusted typing edits the same detached Document');editor.repository.undo();await settle();editor.repository.redo();await settle();
    check(mount.captureText!()===edited,'canonical undo and redo survive product detachment');
    manager!.lifecycle.reveal(window.key);await settle();await click(tabs()[0]);
    check(manager!.registry.activeWindowId===w.id&&editor.mounts.get(node.key)===mount,'selecting the original tab activates its detached window without reconstruction');
    const originalTransfer=transfer.transfer.bind(transfer);
    transfer.transfer=(s,lease,options)=>originalTransfer(s,lease,{...options,checkpoint:stage=>{if(stage==='attached')throw Error('Product Return rollback');}});
    await click(findButton('Return to Flint'));await until(()=>w.state.error.includes('Product Return rollback'));transfer.transfer=originalTransfer;
    check(a.host.windowId===w.id&&editor.mounts.get(node.key)===mount,'failed product Return retains the detached editing session for retry');
    manager!.lifecycle.reveal(w.id);await settle();let finishReturn!:()=>void;
    transfer.transfer=(s,lease,options)=>originalTransfer(s,lease,{...options,prepare:()=>new Promise(resolve=>finishReturn=resolve)});
    await click(findButton('Return to Flint'));await until(()=>!!finishReturn);
    manager!.lifecycle.reveal(w.id);await settle();await click(findButton('Cancel transfer'));await until(()=>!w.state.pending);finishReturn();transfer.transfer=originalTransfer;
    check(a.host.windowId===w.id&&a.current()&&transfer.diagnostics().reservations===0,'product Cancel Return preserves the independent host and rejects late preparation');
    manager!.layout.tile(w.id,window.key,'tab');await settle();focus(node.key,7,3);
    await click(findButton('Return to Flint'));await until(()=>product.windows().length===0);
    check(transfer.atOrigin(a)&&editor.mounts.get(node.key)===mount&&!host.querySelector('[aria-label="Detached window"]'),'product Return restores the same editor and retires its shell/reference indicator');
    check(!JSON.stringify(manager!.layout.tree()).includes(w.id)&&mount.captureInlineSelection!()?.anchor===7&&mount.captureInlineSelection!()?.head===3,'Return from a shared shell-tab group restores selection and removes empty layout membership');
    transfer.transfer=(s,lease,options)=>originalTransfer(s,lease,{...options,checkpoint:stage=>{if(stage==='surfaces')throw Error('Product rollback injection');}});
    await click(host.querySelector<HTMLButtonElement>('[aria-label="Document actions: E1.3 A"]')!);await click(findButton('Detach Document'));
    await until(()=>product.message().includes('Product rollback injection'));transfer.transfer=originalTransfer;
    check(product.windows().length===0&&transfer.atOrigin(a)&&editor.mounts.get(node.key)===mount,'failure through the product command restores source and removes the unused window');
    let finishPreparation!:()=>void;
    transfer.transfer=(s,lease,options)=>originalTransfer(s,lease,{...options,prepare:()=>new Promise(resolve=>finishPreparation=resolve)});
    await click(host.querySelector<HTMLButtonElement>('[aria-label="Document actions: E1.3 A"]')!);await click(findButton('Detach Document'));
    await until(()=>!!finishPreparation);await click(findButton('Cancel transfer'));await until(()=>product.windows().length===0);finishPreparation();transfer.transfer=originalTransfer;
    check(transfer.atOrigin(a)&&a.current()&&transfer.diagnostics().reservations===0,'product Cancel prevents a late preparation from moving or disposing the editor');
    const unsupported=document.createElement('iframe');a.element.append(unsupported);
    manager!.lifecycle.reveal(window.key);await settle();await click(host.querySelector<HTMLButtonElement>('[aria-label="Document actions: E1.3 A"]')!);
    check(findButton('Detach Document').disabled&&document.body.textContent!.includes('unqualified embedded surface'),'unsupported live content disables product Detach with an explanation');
    await trusted({type:'key',key:'Escape'});unsupported.remove();await settle();
    focus(node.key,mount.captureText!().length);await trusted({type:'key',key:'ArrowRight',modifiers:8});await settle();
    const crossBefore=editor.crossText.selectedText();
    w=await detach('A');
    check(editor.crossText.selectedText()===crossBefore&&!!editor.crossText.range(),'product Detach preserves cross-Block selection');
    editor.crossText.clear();
    manager!.lifecycle.reveal(window.key);await settle();await click(tabs()[1]);const b=store.sessions().find(s=>product.resource(s)==='resource-B')!;
    const second=await detach('B');
    check(product.windows().length===2&&a.host.windowId!==b.host.windowId,'multiple detached Documents have exclusive independent hosts');
    await click(findButton('Save As…',manager!.groups.get(second.id)!));await settle();
    await click(findButton('Cancel Save As'));check(!native.location('resource-B'),'cancelled first Save As creates no native binding');
    await click(findButton('Save As…',manager!.groups.get(second.id)!));
    const filename=document.querySelector<HTMLInputElement>('[aria-label="Document filename"]')!;filename.focus();filename.select();await trusted({type:'text',text:'e13-B.mutable.json'});
    await click(findButton('Save to destination'));await until(()=>!second.state.saveAs);
    check(native.location('resource-B')?.filename==='e13-B.mutable.json'&&saves.at(-1).generation.resourceId==='resource-B','product Save As binds the original canonical Document through the existing native service');
    await editor.closeView(second.id);await settle();check(b.signal.aborted&&a.current(),'closing one clean detached Document leaves the other session alive');
    const previousSessions=new Set(store.sessions());
    await editor.commandRegistry.execute('flint.open',{targetKey:projection.state.rootKey,args:undefined});await settle();
    const simultaneous=store.sessions().find(s=>!previousSessions.has(s))!,simNode=text(simultaneous.projection,'A-text-0');
    check(simultaneous!==a&&simultaneous.projection.viewId!==a.projection.viewId&&simNode.contentKey===node.contentKey,'a simultaneous peer of the detached Document has its own session and occurrence identity');
    focus(simNode.key,0);await trusted({type:'text',text:'Peer '});await settle();
    check(mount.captureText!().startsWith('Peer ')&&a.host.windowId===w.id,'peer editing synchronizes canonical content without reclaiming the detached host');
    await editor.closeView(simultaneous.host.windowId);await settle();check(a.current(),'closing a distinct peer cannot dispose the detached session');
    await editor.closeView(window.key);await settle();check(a.current()&&!product.canReturn(w),'source Flint closure disables Return without destroying its detached editor');
    manager!.lifecycle.reveal(w.id);focus(node.key,0);await trusted({type:'text',text:'Independent '});await trusted({type:'key',key:'s',modifiers:2});await settle();
    check(mount.captureText!().startsWith('Independent ')&&saves.at(-1).generation.resourceId==='resource-A','typing and Control-S remain independent of the destroyed Flint application');
    focus(node.key,0);await trusted({type:'text',text:'Unsaved '});await settle();
    const close=editor.closeView(w.id);await settle();await click(findButton('Keep editing'));await close;
    check(a.current()&&editor.mounts.get(node.key)===mount,'cancelled unsaved-window close preserves exact editing state');
    const finalClose=editor.closeView(w.id);await settle();await click(findButton('Close window'));await finalClose;await settle();
    check(a.signal.aborted&&owner.disposed===1&&product.windows().length===0,'explicit close disposes the detached editing session exactly once');
    session.dispose();stop();
    check(lifetimes.every(r=>r.disposals===1&&r.subscriptions===1&&r.unsubscriptions===1),'all private projections and canonical subscriptions finish with exact disposal counts');
    observations.transfer=transfer.diagnostics();observations.productWindows=product.windows().length;
    return {milestone:'E1.3',browser:navigator.userAgent,checks,observations,requestsBlockedOrStubbed:requests};
  } finally {finishSave?.();stopInput();stop();session.dispose();registration.view=originalView;window.fetch=originalFetch;host.remove();}
}
