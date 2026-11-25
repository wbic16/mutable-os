import { createToolAnchor } from "../rendering/managed-floating-tool";
/** Finite D1 browser qualification. Imported only by the qualification runner.
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
  const check = (value: unknown, label: string) => { assert(value, label); checks.push(label);console.log(`D1 check ${checks.length}: ${label}`); };
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
    const named=manager.named,layout=manager.layout;
    const menuButton=document.querySelector<HTMLButtonElement>('[data-system-menu-trigger="workspace"]')!;
    menuButton.click();await settle();
    const menuItem=(name:string)=>[...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(b=>b.firstChild?.textContent===name)!;
    menuItem('Windows').click();await settle();menuItem('Named arrangements').click();await settle();
    const saveArrangement=menuItem('Save arrangement as…');check(!!saveArrangement,'registry window menu exposes named arrangement operations');
    const prompt=window.prompt;window.prompt=()=>null;saveArrangement.focus();await trusted({type:'key',key:'Enter'});await settle();window.prompt=prompt;
    check(named.arrangements().length===0,'keyboard Save arrangement with canceled naming prompt makes no change');
    await trusted({type:'key',key:'Escape'});await trusted({type:'key',key:'Escape'});await trusted({type:'key',key:'Escape'});await settle();

    const originalDraft=draft.textContent, originalMount=editor.mounts.get(text.key);
    const floating=named.save('Writing');
    check(layout.tile(firstOwner,win.key,'tab'),'create shell tabs for a second named arrangement');
    const tabs=named.save('Review');
    named.rename(tabs,'Tabbed review');
    check(named.arrangements().map(a=>a.name).join(',')==='Writing,Tabbed review','save and rename two distinct arrangements');
    check(named.select(floating),'select floating named arrangement');await settle();
    check(!layout.isTiled(firstOwner)&&draft.isConnected&&editor.mounts.get(text.key)===originalMount,'floating selection retains exact Thesis and Flint sessions');
    check(named.select(tabs),'select tabbed named arrangement');await settle();
    check(layout.isTiled(firstOwner)&&tool.isConnected&&tool.querySelector<HTMLInputElement>('[aria-label="Search entities"]')!.value===originalQuery,'shell-tab arrangement retains Entity tool query and ownership');
    manager.lifecycle.reveal(firstOwner);await settle();
    [...thesis.querySelectorAll('button')].find(b=>b.textContent==='Undo')!.click();await settle();
    check(draft.textContent===sourceBefore.slice(0,5),'real Thesis undo history survives named layout selection');
    [...thesis.querySelectorAll('button')].find(b=>b.textContent==='Redo')!.click();await settle();check(draft.textContent===originalDraft,'real Thesis redo survives named layout selection');
    [...thesis.querySelectorAll('button')].find(b=>b.textContent==='Open source')!.click();await settle();await settle();
    const bookmark=editor.mounts.get(text.key)!.captureInlineSelection?.();check(bookmark?.anchor===0&&bookmark.head===5,'source backlink and source-selection bookmark survive named layout switches');
    setModal(true);await settle();check(!named.select(floating),'workspace modal cancels named layout selection');setModal(false);await settle();
    manager.lifecycle.reveal(firstOwner);await settle();
    const saveButton=[...thesis.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Save')!;
    saveButton.click();await settle();check(saveRequests.length===1,'explicit Thesis Save dispatches one pending operation');
    check(named.select(floating),'switch arrangement while domain Save is pending');await settle();
    finishSave!(new Response(JSON.stringify({Success:false,Error:'Uncertain fixture response'}),{headers:{'Content-Type':'application/json'}}));await settle();
    named.select(tabs);manager.lifecycle.reveal(firstOwner);await settle();saveButton.click();await settle();
    check(JSON.stringify(saveRequests[0])===JSON.stringify(saveRequests[1]),'pending Save retry keeps the exact operation identity across arrangements');
    draft.focus();await trusted({type:'text',text:'N'});await settle();const newer=draft.textContent,submitted=saveRequests[1];
    named.select(floating);manager.lifecycle.reveal(win.key);await settle();
    finishSave!(new Response(JSON.stringify({Success:true,Data:{proposition:{...submitted,revision:1,modifiedUtc:'2026-10-20',attributes:{thesis:{version:1,archived:false,source:submitted.source}}}}}),{headers:{'Content-Type':'application/json'}}));await settle();
    named.select(tabs);manager.lifecycle.reveal(firstOwner);await settle();
    check(draft.textContent===newer&&thesis.textContent?.includes('Unsaved changes'),'pending Save completion preserves newer draft edits and unsaved protections');
    const saved=named.arrangements().length;
    named.delete(floating);check(named.arrangements().length===saved-1&&draft.isConnected&&tool.isConnected,'deleting a named arrangement does not dispose application or tool sessions');
    await trusted({type:'viewport',width:500,height:550});await settle();named.select(tabs);await settle();check(draft.isConnected&&layout.solution().tabs.length>0,'named selection remains valid at a constrained viewport');
    await trusted({type:'viewport',width:1440,height:1000});await settle();
    await trusted({type:'browserZoom',scale:1.25});await settle();check(draft.isConnected&&tool.isConnected,'browser zoom preserves retained named-layout sessions');
    await trusted({type:'browserZoom',scale:1});await settle();
    const count=saveRequests.length;named.select(tabs);await settle();check(saveRequests.length===count,'arrangement selection never saves domain content');
    const ax=await trusted({type:'accessibility'});check(ax.some((n:any)=>n.name==='Thesis'),'restored application remains in the browser accessibility tree');
    return {checks,blockedBackendRequests:blockedRequests.length,userAgent:navigator.userAgent};
  } finally {stopAnchor?.();stopInput();stop();session.dispose();host.remove();window.fetch=originalFetch;}
}
