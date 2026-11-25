import { createToolAnchor } from "../rendering/managed-floating-tool";
/** Finite B browser qualification. Imported only by the qualification runner.
 * All domain data and Entity responses are in memory; no backend is used. */
import { render } from "solid-js/web";
import { WorkspaceSession } from "./workspace-session";
import { WorkspacePresentationView } from "./workspace-presentation-view";
import { materializeLocalWorkspace } from "../reactive-editor/workspace-manifest";
import { createEntityReferencesFeature } from "../features/entity-references";
import { annotationCapabilities } from "./annotation-capabilities";
import { openEntitySearch } from "../features/entity-references/entity-search";
import { DocumentDialog } from "../demo/document-dialog";
import { CodexSystemBar } from "../demo/codex-system-bar";
import { createRoot, createSignal, Show } from "solid-js";
import { unwrap } from "solid-js/store";
import type { AnnotationCapabilities } from "../feature-api";
import type { CanonicalEntity, EntityService } from "../feature-api/entities";
import "../index.css";
import "../demo/workspace-demo.css";

const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
function assert(value: unknown, label: string): asserts value { if (!value) throw Error(label); }

async function trusted(action:Record<string,unknown>):Promise<any> {
  return new Promise((resolve,reject)=>{(globalThis as any).__mwmResume=(value:any)=>value.error?reject(Error(value.error)):resolve(value.result);(globalThis as any).mwmInput(JSON.stringify(action));});
}
export async function qualifyWindowManager() {
  const checks: string[] = [];
  const check = (value: unknown, label: string) => { assert(value, label); checks.push(label);console.log(`B check ${checks.length}: ${label}`); };
  const blockedRequests: string[] = [], originalFetch = window.fetch;
  let stopAnchor:(()=>void)|undefined;
  let contextSignal:AbortSignal|null|undefined;
  const saveRequests:any[]=[];let finishSave:((response:Response)=>void)|undefined;
  let holdContext=false,releaseContext:((response:Response)=>void)|undefined;
  // No request can reach a running application backend, including background reads.
  window.fetch = (async (input: RequestInfo | URL, init?:RequestInit) => {
    const success=(Data:unknown)=>new Response(JSON.stringify({Success:true,Data}),{headers:{"Content-Type":"application/json"}});
    if(String(input)==='/api/native/vault/default')return success({vault:'/in-memory-fixture'});
    if(String(input)==='/api/sqlite/knowledge/propositions') {
      const request=JSON.parse(String(init?.body)).request;
      if(request.op==='context'){contextSignal=init?.signal;return holdContext ? new Promise<Response>(resolve=>{releaseContext=resolve;}) : success({vaultGuid:'fixture-vault'});}
      if(request.op==='list')return success({rows:[],next:null});
      if(request.op==='create'||request.op==='update'){saveRequests.push(request);return new Promise<Response>(resolve=>finishSave=resolve);}
      throw Error('Unexpected proposition operation');
    }
    blockedRequests.push(String(input)); return new Response(JSON.stringify({ Success: false, Error: "B fixture: no backend" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const host = document.body.appendChild(document.createElement("main"));
  host.className = "workspace-demo workspace-demo--canonical workspace-demo--system-bar";
  host.dataset.windowWorkArea = "";
  const session = new WorkspaceSession(materializeLocalWorkspace({ id: "workspace", type: "workspace-block", children: [
    { id: "background", type: "canvas-background-block", children: [] },
  ] }), { features: { entityReferences: false, flintMaterialChrome: false, flintProbe: false } });
  const { editor, projection, windowManager: manager } = session;
  assert(manager, "manager available");
  let api!: AnnotationCapabilities, finishCreate: ((entity: CanonicalEntity) => void) | undefined;
  const entity: CanonicalEntity = { id: "fixture-entity", name: "Fixture Entity", revision: 1, aliases: [] };
  const service: EntityService = {
    names: async () => [], dbMentions: async () => [], summaries: async () => ({ rows: [], complete: true, diagnostics: [] }),
    search: async () => ({ candidates: [], complete: true, diagnostics: [], current() {} }),
    get: async () => entity, create: () => new Promise(resolve => { finishCreate = resolve; }),
    rename: async () => entity, alias: async () => entity, dispose() {},
  };
  editor.featureHost.activate(createEntityReferencesFeature(scope => {
    api = annotationCapabilities(editor, scope); api.entities = () => service; return api;
  }));
  const [modal, setModal] = createSignal(false);
  const stop = render(() => <><CodexSystemBar manager={manager}><button role="menuitem">B fixture</button></CodexSystemBar><WorkspacePresentationView session={session} /><Show when={modal()}>
    <DocumentDialog title="B workspace modal" onClose={() => setModal(false)}><input aria-label="Modal input" /></DocumentDialog>
  </Show></>, host);
  const stopInput = editor.installGateway(document);
  try {
    await editor.commandRegistry.execute("flint.open", { targetKey: projection.state.rootKey, args: undefined });
    await settle();
    const app = Object.values(projection.state.nodes).find(n => n.viewType === "flint-application-block")!;
    const win = editor.blockQueries.ancestors(app.key).find(n => n.viewType === "window-block")!;
    editor.commands.setPayloadField(win.key, "metadata", { ...unwrap(win.payload.metadata as object), state: "maximized", zIndex: 999999999 });
    await settle();
    const flint = document.querySelector<HTMLElement>(".flint-application")!.closest<HTMLElement>(".reactive-window")!;
    check(flint.classList.contains("reactive-window--maximized"), "Flint is maximized");
    const text = [...editor.projections.values()].flatMap(v => Object.values(v.state.nodes))
      .find(n => n.viewType === "standoff-editor-block" && editor.mounts.get(n.key)?.root.closest(".flint-application"))!;
    assert(text, "Flint editor occurrence is mounted");
    editor.mounts.get(text.key)!.focus();
    editor.mounts.get(text.key)!.restoreInlineSelection?.({ anchor: 2, head: 2 });
    const orderBeforeTyping = manager.registry.revision();
    const beforeTyping = editor.repository.state.revision;
    let snapshots = 0, registrations = 0, ownerLookups = 0;
    const snapshot = editor.repository.snapshot, register = manager.registry.registerWindow, ownerLookup = manager.ownerForNode;
    editor.repository.snapshot = function (...args) { snapshots++; return snapshot.apply(this, args); };
    manager.registry.registerWindow = function (...args) { registrations++; return register.apply(this, args); };
    manager.ownerForNode = function (...args) { ownerLookups++; return ownerLookup.apply(this, args); };
    try {
      editor.mounts.get(text.key)!.focusElement.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: "x", bubbles: true, cancelable: true }));
      await settle();
      check(editor.repository.state.revision > beforeTyping, "one real Flint beforeinput edit commits");
      check(manager.registry.revision() === orderBeforeTyping && snapshots === 0 && registrations === 0 && ownerLookups === 0, "Flint typing does no window registry, snapshot or owner-lookup work");
    } finally {
      editor.repository.snapshot = snapshot; manager.registry.registerWindow = register; manager.ownerForNode = ownerLookup;
    }
    openEntitySearch(api, [{ nodeKey: text.key, start: 0, end: 5 }]);
    await settle();
    const tool = document.querySelector<HTMLElement>('[aria-label="Link Entity Reference"]')!;
    assert(tool, "real Entity tool is mounted");
    const anchor=createRoot(dispose=>{stopAnchor=dispose;return createToolAnchor(()=>editor.mounts.get(text.key)?.root,()=>!!manager.registry.windows[win.key]?.visible);});
    await settle();check(!!anchor.rect(),'reusable tool anchor measures its visible source');
    check(tool.closest<HTMLElement>("[data-mwm-window]")?.dataset.mwmWindow === win.key, "Entity portal belongs to Flint's window group");
    const choose = (label: string) => {
      const button = [...tool.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
      assert(button, `button ${label}`); button.click();
    };
    const originalQuery=tool.querySelector<HTMLInputElement>('[aria-label="Search entities"]')!.value;
    const openThesis = () => editor.commandRegistry.execute("thesis.open", { targetKey: projection.state.rootKey, args: undefined });
    editor.mounts.get(text.key)!.focus();editor.mounts.get(text.key)!.restoreInlineSelection?.({anchor:0,head:5});
    const sourceBefore=editor.node(text.key)!.inlineContent.map(k=>editor.node(k)!.payload.text).join('');
    await editor.commandRegistry.execute('thesis.createProposition',{targetKey:text.key,args:undefined});await settle();await settle();
    check(tool.isConnected && !tool.textContent?.includes('original target changed'), 'ordinary Entity lookup survives unrelated Thesis launch with valid target');
    check(tool.querySelector<HTMLInputElement>('[aria-label="Search entities"]')!.value===originalQuery,'Entity query survives activation');
    const thesis = document.querySelector<HTMLElement>(".thesis-host")!.closest<HTMLElement>(".reactive-window")!;
    assert(thesis, "real Thesis window mounted");
    check(tool.isConnected, "stacking proof retains the Entity tool");
    const draft=thesis.querySelector<HTMLElement>('[aria-label="Proposition text"]')!;
    check(!!draft,'native Thesis draft is ready');
    check(thesis.contains(document.activeElement),'new Thesis owns native focus');
    const firstOwner=thesis.closest<HTMLElement>('[data-mwm-window]')!.dataset.mwmWindow!;
    const cells=draft.querySelectorAll('[data-inline-key]'),range=document.createRange();
    range.setStart(cells[1].firstChild!,0);range.setEnd(cells[3].firstChild!,0);document.getSelection()!.removeAllRanges();document.getSelection()!.addRange(range);draft.focus();
    manager.lifecycle.activate(win.key);manager.lifecycle.activate(firstOwner);await settle();
    check(document.activeElement===draft && document.getSelection()!.toString().length===2,'activation restores Thesis inline selection');
    let trustedEdit=false;window.addEventListener('beforeinput',event=>trustedEdit=event.isTrusted&&event.target===draft,{once:true,capture:true});
    await trusted({type:'text',text:'Z'});await settle();
    check(trustedEdit,'Chrome native input delivered a trusted beforeinput event');
    const clickCell=draft.querySelectorAll<HTMLElement>('[data-inline-key]')[2],clickBox=clickCell.getBoundingClientRect();
    await trusted({type:'click',x:clickBox.left+clickBox.width*.25,y:clickBox.top+clickBox.height*.5});await settle();
    check(document.activeElement===draft && document.getSelection()!.isCollapsed,'trusted pointer click places a caret without restoring the old selection');
    check(draft.textContent===sourceBefore.slice(0,1)+'Z'+sourceBefore.slice(3,5) && editor.node(text.key)!.inlineContent.map(k=>editor.node(k)!.payload.text).join('')===sourceBefore,'active draft input edits Thesis once and leaves source unchanged');
    thesis.querySelector<HTMLButtonElement>('[aria-label="Minimize window"]')!.click();await settle();
    check(draft.isConnected && thesis.classList.contains('reactive-window--minimized'),'unsaved Thesis minimizes with the same mounted draft');
    check(manager.registry.windows[firstOwner].mounted&&!manager.registry.windows[firstOwner].visible&&!manager.registry.windows[firstOwner].active,'minimized view remains mounted, hidden and inactive');
    check(draft.closest<HTMLElement>('.mwm-retained-body')!.inert&&draft.getClientRects().length===0,'retained draft is inert and absent from layout');
    manager.lifecycle.reveal(firstOwner);await settle();
    check(document.activeElement===draft&&thesis.querySelector('[aria-label="Proposition text"]')===draft,'restore returns focus to the identical draft DOM');
    const editedDraft=draft.textContent;
    [...thesis.querySelectorAll('button')].find(b=>b.textContent==='Undo')!.click();await settle();
    check(draft.textContent===sourceBefore.slice(0,5),'draft undo history survives minimization');
    [...thesis.querySelectorAll('button')].find(b=>b.textContent==='Redo')!.click();await settle();
    check(draft.textContent===editedDraft,'draft redo history survives minimization');
    const confirm=window.confirm;window.confirm=()=>false;
    try { await editor.closeView(firstOwner); check(draft.isConnected,'Thesis close veto preserves unsaved draft'); } finally {window.confirm=confirm;}
    check(!!thesis.querySelector('[aria-label="Source"]'),'Thesis retains the source backlink');
    [...thesis.querySelectorAll('button')].find(button=>button.textContent==='Open source')!.click();await settle();await settle();
    const sourceSelection=editor.mounts.get(text.key)!.captureInlineSelection?.();
    check(manager.registry.activeWindowId===win.key && sourceSelection?.anchor===0 && sourceSelection?.head===5,'source backlink activates the original Flint occurrence and restores its verified range');
    manager.lifecycle.activate(firstOwner);

    const ownerAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-mwm-window]")?.dataset.mwmWindow;
    const thesisOwner = thesis.closest<HTMLElement>("[data-mwm-window]")!.dataset.mwmWindow;
    const t = thesis.getBoundingClientRect(), e = tool.getBoundingClientRect();
    check(t.left === 55 && t.top === 98, "normal window retains the canonical desktop coordinate origin");
    const x = Math.max(t.left, e.left) + 35, y = Math.max(t.top, e.top) + 100;
    const ancestors = (element: HTMLElement) => { const rows = []; for (let n: HTMLElement | null = element; n; n = n.parentElement) { const css = getComputedStyle(n); rows.push({ tag: n.tagName, class: n.className, y: n.getBoundingClientRect().y, position: css.position, top: css.top, transform: css.transform }); } return rows; };
    assert(x < Math.min(t.right, e.right) && y < Math.min(t.bottom, e.bottom), `Thesis/Entity overlap: ${JSON.stringify({ thesis: t.toJSON(), entity: e.toJSON(), ancestry: ancestors(thesis) })}`);
    checks.push("Thesis and Entity tool actually overlap");
    check(ownerAt(x, y) === thesisOwner, "hit-testing selects Thesis above maximized Flint and Entity tool");
    check(flint.classList.contains("reactive-window--maximized"), "opening Thesis does not de-maximize Flint");
    const sourceRevision = editor.repository.state.revision, saved = JSON.stringify(editor.encodeWorkspace());
    manager.raisePlacement(win.placementKey); await settle();
    check(ownerAt(x, y) === win.key, "raising Flint brings its tool group above Thesis");
    check(editor.repository.state.revision === sourceRevision && JSON.stringify(editor.encodeWorkspace()) === saved, "raising writes neither content nor workspace JSON");
    choose("+ Create Entity"); choose("Create and link");
    check(!!finishCreate,'in-memory Entity creation dispatched');
    manager.lifecycle.minimize(win.key);await settle();
    check(tool.isConnected&&tool.closest<HTMLElement>('.mwm-surface')!.hidden,'pending Entity tool remains mounted and hidden with its owner');
    check(anchor.rect()===undefined,'hidden owner invalidates its anchor without returning stale geometry');
    manager.lifecycle.reveal(win.key);await settle();
    check(tool.isConnected&&tool.querySelector<HTMLInputElement>('[aria-label="Search entities"]')!.value===originalQuery,'Entity query and pending creation survive restoration');
    await editor.closeView(win.key);check(tool.isConnected && !!manager.registry.windows[win.key],'pending Entity creation guards owner close');
    editor.commands.setPayloadField(text.key,'metadata',{qualification:true});finishCreate!(entity);await settle();
    check(tool.isConnected && tool.textContent?.includes('Created but not linked'),'stale source preserves Entity creation receipt without linking');
    const storageInvoker=flint.querySelector<HTMLButtonElement>('[aria-label="Open files"]')!;storageInvoker.focus();storageInvoker.click();await settle();
    const sheet = flint.querySelector<HTMLElement>('[aria-label="Storage and recovery"]')!;
    assert(sheet, "Flint storage dialog is mounted");
    check(manager.registry.windows[win.key].ownerModalCount === 1, "inline storage dialog registers its application owner");
    const s = sheet.getBoundingClientRect();
    check(sheet.contains(document.elementFromPoint(s.left + 30, s.top + 30)), "Flint storage dialog appears above its existing Entity tool");
    [...sheet.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Close storage")!.click(); await settle();
    check(manager.registry.windows[win.key].ownerModalCount === 0 && tool.isConnected, "closing storage releases only its surface lease");
    check(document.activeElement===storageInvoker,'owner modal returns focus to its exact invoker');
    manager.maximize(win.key);await settle();
    const beforeOwnerMove=flint.getBoundingClientRect(),beforeToolMove=tool.getBoundingClientRect();
    const ownerGeometry=manager.geometry.controllers.get(win.key)!;ownerGeometry.keyboard('move');
    await trusted({type:'key',key:'ArrowRight'});await trusted({type:'key',key:'Enter'});await settle();
    check(tool.getBoundingClientRect().x-beforeToolMove.x===flint.getBoundingClientRect().x-beforeOwnerMove.x,'floating Entity tool follows owner-local window movement');
    check(tool.querySelector<HTMLInputElement>('[aria-label="Search entities"]')!.value===originalQuery,'owner movement preserves Entity query and creation receipt');
    anchor.invalidate();check(anchor.rect()===undefined,'explicit source-layout invalidation immediately clears cached anchor');
    await settle();check(anchor.rect()?.x===editor.mounts.get(text.key)!.root.getBoundingClientRect().x,'anchor refresh remeasures only its source after owner movement');
    editor.mounts.get(text.key)!.focus();editor.mounts.get(text.key)!.restoreInlineSelection?.({anchor:7,head:7});
    const concurrent=manager.geometry.controllers.get(firstOwner)!,capture=thesis.querySelector<HTMLElement>('header')!;
    const gesture=(x:number)=>({pointerId:77,clientX:x,clientY:100,button:0,currentTarget:capture,preventDefault(){},stopPropagation(){}} as any);
    // Direct port drive keeps focus in Flint while another frame previews movement.
    const captureMethod=capture.setPointerCapture;capture.setPointerCapture=()=>{};
    concurrent.beginMove(gesture(100));concurrent.movePointer(gesture(110));
    snapshots=0;registrations=0;ownerLookups=0;
    editor.repository.snapshot=function(...args){snapshots++;return snapshot.apply(this,args);};
    manager.registry.registerWindow=function(...args){registrations++;return register.apply(this,args);};
    manager.ownerForNode=function(...args){ownerLookups++;return ownerLookup.apply(this,args);};
    try{await trusted({type:'text',text:'q'});await settle();check(snapshots===0&&registrations===0&&ownerLookups===0,'trusted Flint typing during another frame preview performs no snapshot, registration or ownership scan');}
    finally{editor.repository.snapshot=snapshot;manager.registry.registerWindow=register;manager.ownerForNode=ownerLookup;concurrent.cancel();capture.setPointerCapture=captureMethod;}


    await openThesis(); await settle();
    const theses = [...document.querySelectorAll<HTMLElement>(".thesis-host")];
    const latest = theses.at(-1)!.closest<HTMLElement>("[data-mwm-window]")!;
    check(manager.registry.windows[latest.dataset.mwmWindow!].rank === manager.count(), "consecutive launches use central order");
    setModal(true); await settle();
    const dialog = document.querySelector<HTMLElement>('[aria-labelledby][role="dialog"]')!;
    assert(dialog, "workspace dialog mounted");
    const d = dialog.getBoundingClientRect();
    check(dialog.contains(document.elementFromPoint(d.left + 30, d.top + 30)), "workspace modal is above every window group");
    check(!manager.lifecycle.activate(win.key) && dialog.contains(document.activeElement),'workspace modal blocks activation and contains native focus');
    check(!editor.commandRegistry.canExecute('thesis.open',{targetKey:projection.state.rootKey,args:undefined}),'workspace modal blocks launch shortcuts');
    check(manager.groups.get(win.key)!.closest('[inert]'),'workspace modal makes background windows inert');
    await trusted({type:'key',key:'Tab'});await trusted({type:'key',key:'Tab'});
    check(dialog.contains(document.activeElement),'trusted Tab traversal remains inside the workspace modal');
    const ax=await trusted({type:'accessibility'});
    check(ax.some((node:any)=>node.role==='dialog'&&node.name==='B workspace modal'&&node.properties?.some((p:any)=>p.name==='modal'&&p.value.value===true)),'Chrome accessibility tree exposes the named workspace modal');
    setModal(false); await settle();
    const pinnedPlacement = editor.commands.insert({ id: "pin", type: "window-block", metadata: { title: "Pinned", pinned: true, position: { x: 0, y: -48 }, size: { w: 1400, h: 900 } }, children: [{ type: "plain-text-block", text: "Pinned fixture" }] }, { kind: "at", parentKey: projection.state.rootKey, index: 0 });
    await settle(); await openThesis(); await settle();
    const pin = projection.nodeForPlacement(pinnedPlacement)!;
    check(ownerAt(140, 180) === pin.key, "pinned group remains above newly launched normal windows");
    check(!!document.elementFromPoint(140, 14)?.closest(".codex-system-bar"), "system chrome stays above an overlapping pinned window");
    setModal(true); await settle();
    const pinnedDialog = document.querySelector<HTMLElement>('[aria-labelledby][role="dialog"]')!, pd = pinnedDialog.getBoundingClientRect();
    check(pinnedDialog.contains(document.elementFromPoint(pd.left + 30, pd.top + 30)), "workspace modal stays above an overlapping pinned window");
    setModal(false); await settle();
    editor.closeView(pin.key);await settle();
    const launchDelayed=async()=>{
      holdContext=true;releaseContext=undefined;editor.mounts.get(text.key)!.focus();editor.mounts.get(text.key)!.restoreInlineSelection?.({anchor:0,head:5});
      await editor.commandRegistry.execute('thesis.createProposition',{targetKey:text.key,args:undefined});await settle();
      const newest=[...document.querySelectorAll<HTMLElement>('.thesis-host')].at(-1)!;
      return {host:newest,id:newest.closest<HTMLElement>('[data-mwm-window]')!.dataset.mwmWindow!};
    };
    const delayed=await launchDelayed();check(!!releaseContext,'delayed Thesis readiness is pending');
    editor.mounts.get(text.key)!.focus();
    releaseContext!(new Response(JSON.stringify({Success:true,Data:{vaultGuid:'fixture-vault'}}),{headers:{'Content-Type':'application/json'}}));holdContext=false;await settle();await settle();
    check(!!delayed.host.querySelector('[aria-label="Proposition text"]') && manager.registry.activeWindowId===win.key,'late Thesis draft readiness cannot steal newer Flint focus');
    const cancelled=await launchDelayed();await editor.closeView(cancelled.id);check(contextSignal?.aborted,'closing a loading Thesis aborts its initialization request');
    releaseContext!(new Response(JSON.stringify({Success:true,Data:{vaultGuid:'fixture-vault'}}),{headers:{'Content-Type':'application/json'}}));holdContext=false;await settle();await settle();
    check(!cancelled.host.isConnected && !manager.registry.windows[cancelled.id],'late completion after close cannot recreate the Thesis window');
    editor.closeView(win.key); await settle();
    check(!tool.isConnected && !manager.registry.windows[win.key], "owner close removes group and its Entity portal");
    check(!Object.values(manager.registry.surfaces).some(s => s.ownerWindowId === win.key), "owner close releases surface ownership");
    check(draft.isConnected,'closing source owner preserves independent Thesis draft');
    // Real retained Save operation, using only the in-memory transport above.
    const confirmCleanup=window.confirm;window.confirm=()=>true;
    try{for(const id of Object.keys(manager.registry.windows))if(id!==firstOwner)await editor.closeView(id);}finally{window.confirm=confirmCleanup;}
    manager.lifecycle.reveal(firstOwner);await settle();
    const saveButton=[...thesis.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Save')!;
    saveButton.click();await settle();check(saveRequests.length===1,'explicit Save dispatches one in-memory operation');
    manager.lifecycle.minimize(firstOwner);await settle();
    check(draft.isConnected&&!manager.registry.windows[firstOwner].visible,'in-flight Save retains the mounted draft while hidden');
    finishSave!(new Response(JSON.stringify({Success:false,Error:'Uncertain test transport outcome'}),{headers:{'Content-Type':'application/json'}}));await settle();
    manager.lifecycle.reveal(firstOwner);await settle();saveButton.click();await settle();
    check(saveRequests.length===2&&JSON.stringify(saveRequests[0])===JSON.stringify(saveRequests[1]),'retry after minimize reuses the exact Save operation and receipt identity');
    draft.focus();await trusted({type:'text',text:'N'});await settle();
    const newerDraft=draft.textContent,submitted=saveRequests[1];manager.lifecycle.minimize(firstOwner);await settle();
    finishSave!(new Response(JSON.stringify({Success:true,Data:{proposition:{...submitted,revision:1,modifiedUtc:'2026-10-20',attributes:{thesis:{version:1,archived:false,source:submitted.source}}}}}),{headers:{'Content-Type':'application/json'}}));await settle();
    manager.lifecycle.reveal(firstOwner);await settle();
    check(draft.textContent===newerDraft&&thesis.textContent?.includes('Unsaved changes'),'receipt completion while hidden preserves newer unsaved edits');
    check(saveRequests.length===2,'visibility transitions never dispatch automatic Save');
    // Shared pointer and keyboard geometry: previews are not repository commits.
    const geometry=manager.geometry.controllers.get(firstOwner)!,header=thesis.querySelector<HTMLElement>('.reactive-window__header')!;
    const initialRect=thesis.getBoundingClientRect(),initialRevision=editor.repository.state.revision;
    await trusted({type:'pointer',event:'mousePressed',x:initialRect.x+100,y:initialRect.y+12});
    await trusted({type:'pointer',event:'mouseMoved',x:initialRect.x+140,y:initialRect.y+42});await settle();
    check(thesis.getBoundingClientRect().x===initialRect.x+40&&editor.repository.state.revision===initialRevision,'trusted drag previews movement without a repository write');
    await trusted({type:'key',key:'Escape'});await trusted({type:'pointer',event:'mouseReleased',x:initialRect.x+140,y:initialRect.y+42});await settle();
    check(thesis.getBoundingClientRect().x===initialRect.x&&editor.repository.state.revision===initialRevision,'Escape cancels a captured drag without a commit');
    await trusted({type:'pointer',event:'mousePressed',x:initialRect.x+100,y:initialRect.y+12});
    await trusted({type:'pointer',event:'mouseMoved',x:initialRect.x+130,y:initialRect.y+32});
    await trusted({type:'pointer',event:'mouseReleased',x:initialRect.x+130,y:initialRect.y+32});await settle();
    check(editor.repository.state.revision===initialRevision+1&&thesis.getBoundingClientRect().x===initialRect.x+30,'pointer release commits exactly one move');
    const cancelledRect=thesis.getBoundingClientRect(),cancelledRevision=editor.repository.state.revision;
    let nativeBlur=false;window.addEventListener('blur',e=>nativeBlur=e.isTrusted,{once:true});
    await trusted({type:'pointer',event:'mousePressed',x:cancelledRect.x+100,y:cancelledRect.y+12});
    await trusted({type:'pointer',event:'mouseMoved',x:cancelledRect.x+120,y:cancelledRect.y+22});
    await trusted({type:'blur'});await trusted({type:'pointer',event:'mouseReleased',x:cancelledRect.x+120,y:cancelledRect.y+22});await settle();
    check(nativeBlur&&thesis.getBoundingClientRect().x===cancelledRect.x&&editor.repository.state.revision===cancelledRevision,'real tab/window blur cancels the drag without committing');
    await trusted({type:'touch',event:'touchStart',x:cancelledRect.x+100,y:cancelledRect.y+12});
    await trusted({type:'touch',event:'touchMove',x:cancelledRect.x+125,y:cancelledRect.y+22});await settle();
    check(thesis.getBoundingClientRect().x===cancelledRect.x+25,'trusted touch drag uses the shared pointer geometry');
    await trusted({type:'touch',event:'touchCancel'});await settle();
    check(thesis.getBoundingClientRect().x===cancelledRect.x&&editor.repository.state.revision===cancelledRevision,'touch cancellation discards the preview without a history write');
    const resizeHandle=thesis.querySelector<HTMLElement>('.reactive-window__resize')!.getBoundingClientRect(),beforeResize=thesis.getBoundingClientRect();
    await trusted({type:'pointer',event:'mousePressed',x:resizeHandle.x+10,y:resizeHandle.y+10});
    await trusted({type:'pointer',event:'mouseMoved',x:resizeHandle.x-10,y:resizeHandle.y-10});await settle();
    check(thesis.getBoundingClientRect().width===beforeResize.width-20&&editor.repository.state.revision===cancelledRevision,'trusted resize previews without committing');
    await trusted({type:'pointer',event:'mouseReleased',x:resizeHandle.x-10,y:resizeHandle.y-10});await settle();
    check(editor.repository.state.revision===cancelledRevision+1,'trusted pointer resize commits once');
    const moved=thesis.getBoundingClientRect(),revision=editor.repository.state.revision;
    geometry.keyboard('move');await trusted({type:'key',key:'ArrowRight'});await trusted({type:'key',key:'ArrowDown',modifiers:8});await settle();
    check(thesis.getBoundingClientRect().x===moved.x+10&&editor.repository.state.revision===revision,'keyboard arrows preview movement');
    await trusted({type:'key',key:'Enter'});await settle();check(editor.repository.state.revision===revision+1,'Enter commits one keyboard move');
    geometry.keyboard('resize');const sizeBefore=thesis.getBoundingClientRect();await trusted({type:'key',key:'ArrowLeft'});await trusted({type:'key',key:'Escape'});await settle();
    check(thesis.getBoundingClientRect().width===sizeBefore.width,'Escape cancels keyboard resize');
    geometry.keyboard('resize');await trusted({type:'key',key:'ArrowLeft'});await trusted({type:'key',key:'Enter'});await settle();
    check(thesis.getBoundingClientRect().width===sizeBefore.width-10,'keyboard resize commits through the shared geometry port');
    const geometryJSON=()=>{const m=editor.node(firstOwner)!.payload.metadata as any;return JSON.stringify({position:m.position,size:m.size});};
    const savedBounds=geometryJSON(),normal=thesis.getBoundingClientRect();
    manager.maximize(firstOwner);await settle();check(thesis.getBoundingClientRect().width===window.innerWidth,'maximize fills the shared work area');
    await trusted({type:'viewport',width:780,height:550});await settle();await settle();
    check(thesis.getBoundingClientRect().width===780&&thesis.getBoundingClientRect().top>=28,'maximized window follows viewport resize below system chrome');
    manager.maximize(firstOwner);await settle();
    await trusted({type:'viewport',width:1440,height:1000});await settle();await settle();
    check(thesis.getBoundingClientRect().width===normal.width&&geometryJSON()===savedBounds,'restore and viewport recovery retain normal geometry without persistence drift');
    const originalPixelRatio=window.devicePixelRatio;
    await trusted({type:'browserZoom',scale:1.5});await settle();await settle();
    check(window.devicePixelRatio>originalPixelRatio,'actual Chrome page zoom changes CSS-pixel scaling');
    check(thesis.getBoundingClientRect().right<=window.innerWidth+1,'Chrome page zoom keeps window controls within the layout viewport');
    await trusted({type:'browserZoom',scale:1});await settle();await settle();
    await trusted({type:'zoom',scale:2});await settle();await settle();
    const zoomRect=thesis.getBoundingClientRect(),visual=window.visualViewport!;
    check(visual.scale===2&&zoomRect.right<=visual.offsetLeft+visual.width+1&&zoomRect.bottom<=visual.offsetTop+visual.height+1,'visual viewport zoom keeps the frame and controls reachable');
    await trusted({type:'zoom',scale:1});await trusted({type:'viewport',width:320,height:260});await settle();await settle();
    const small=thesis.getBoundingClientRect();check(small.right<=321&&small.bottom<=261&&small.top>=28,'undersized viewport temporarily fits the retained frame');
    await trusted({type:'viewport',width:1440,height:1000});await settle();await settle();
    check(draft.isConnected&&draft.textContent===newerDraft,'resize, maximize and zoom retain the identical draft and unsaved text');
    // Registry-derived list is keyboard navigable through the existing system menu.
    document.querySelector<HTMLButtonElement>('[data-system-menu-trigger="workspace"]')!.click();await settle();
    const windowsButton=[...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(b=>b.textContent==='Windows▸')!;
    check(!!windowsButton,'Workspace menu exposes a registry-derived Windows list');windowsButton.click();await settle();
    check([...document.querySelectorAll('[role="menuitem"]')].some(b=>b.textContent?.startsWith(manager.title(firstOwner))),'window list contains the retained Thesis session');
    await trusted({type:'key',key:'ArrowDown'});check(document.activeElement?.textContent==='Previous window','window list supports native keyboard menu navigation');
    await trusted({type:'key',key:'Escape'});await trusted({type:'key',key:'Escape'});
    manager.lifecycle.activate(firstOwner);await settle();check(document.activeElement===draft,'window-menu navigation restores the editor focus bookmark');
    manager.lifecycle.minimize(firstOwner);await settle();thesis.querySelector<HTMLButtonElement>('[data-window-icon]')!.click();await settle();
    check(manager.registry.windows[firstOwner].visible,'a previous normal-window drag does not consume the first restore click');
    manager.lifecycle.minimize(firstOwner);await settle();const icon=thesis.querySelector<HTMLElement>('[data-window-icon]')!.getBoundingClientRect();
    await trusted({type:'pointer',event:'mousePressed',x:icon.x+40,y:icon.y+20});
    await trusted({type:'pointer',event:'mouseMoved',x:icon.x+60,y:icon.y+30});
    await trusted({type:'pointer',event:'mouseReleased',x:icon.x+60,y:icon.y+30});await settle();
    check(!manager.registry.windows[firstOwner].visible,'dragging the minimized icon suppresses only its generated click');
    const movedIcon=thesis.querySelector<HTMLElement>('[data-window-icon]')!.getBoundingClientRect();
    await trusted({type:'click',x:movedIcon.x+40,y:movedIcon.y+20});await settle();
    check(manager.registry.windows[firstOwner].visible&&document.activeElement===draft&&draft.textContent===newerDraft,'the next icon click restores the identical editing session and focus');
    return { checks, blockedBackendRequests: blockedRequests.length, userAgent: navigator.userAgent };
  } finally {
    stopAnchor?.();stopInput(); stop(); session.dispose(); host.remove(); window.fetch = originalFetch;
  }
}
