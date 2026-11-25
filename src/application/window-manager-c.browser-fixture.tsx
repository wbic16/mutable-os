import { createToolAnchor } from "../rendering/managed-floating-tool";
/** Finite C browser qualification. Imported only by the qualification runner.
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
  const check = (value: unknown, label: string) => { assert(value, label); checks.push(label);console.log(`C check ${checks.length}: ${label}`); };
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

    const layout=manager.layout,body=editor.mounts.get(text.key),draftText=draft.textContent;
    check(layout.tile(firstOwner,win.key,'right'),'tile actual Thesis beside Flint');await settle();
    check(!flint.classList.contains('reactive-window--maximized'),'arranging maximized Flint restores it into its tile');
    const a=flint.getBoundingClientRect(),b=thesis.getBoundingClientRect();
    check(a.right<=b.left&&a.width>0&&b.width>0&&b.right<=innerWidth,'split bounds are disjoint and inside work area');
    check(thesis.querySelector('[aria-label="Proposition text"]')===draft&&editor.mounts.get(text.key)===body,'split retains exact Thesis and Flint mounts');
    check(tool.isConnected&&tool.querySelector<HTMLInputElement>('[aria-label="Search entities"]')!.value===originalQuery,'owned Entity tool survives split with query');
    const divider=()=>document.querySelector<HTMLElement>('[role="separator"][aria-label="Resize shell split"]')!;
    const treeBefore=JSON.stringify(layout.tree()),revisionBefore=layout.revision(),dbox=divider().getBoundingClientRect();
    await trusted({type:'pointer',event:'mousePressed',x:dbox.x+3,y:dbox.y+100});
    await trusted({type:'pointer',event:'mouseMoved',x:dbox.x+63,y:dbox.y+100});await settle();
    check(JSON.stringify(layout.tree())===treeBefore&&layout.dividerActive(),'trusted divider pointer preview is detached from committed layout');
    await trusted({type:'key',key:'Escape'});await trusted({type:'pointer',event:'mouseReleased',x:dbox.x+63,y:dbox.y+100});await settle();
    check(JSON.stringify(layout.tree())===treeBefore&&layout.revision()===revisionBefore&&!layout.dividerActive(),'Escape cancels divider preview without a commit');
    divider().focus();await trusted({type:'key',key:'ArrowRight'});await trusted({type:'key',key:'Enter'});await settle();
    check(layout.revision()===revisionBefore+1,'keyboard divider Enter commits once');
    layout.undo();await settle();check(JSON.stringify(layout.tree())===treeBefore,'layout undo restores the exact preceding split');layout.redo();await settle();
    const touchBox=divider().getBoundingClientRect(),touchRevision=layout.revision();
    await trusted({type:'touch',event:'touchStart',x:touchBox.x+3,y:touchBox.y+160});
    await trusted({type:'touch',event:'touchMove',x:touchBox.x+23,y:touchBox.y+160});await trusted({type:'touch',event:'touchEnd'});await settle();
    check(layout.revision()===touchRevision+1,'trusted touch divider commits once');
    const cancelTree=JSON.stringify(layout.tree()),cancelBox=divider().getBoundingClientRect();
    await trusted({type:'touch',event:'touchStart',x:cancelBox.x+3,y:cancelBox.y+180});await trusted({type:'touch',event:'touchMove',x:cancelBox.x-23,y:cancelBox.y+180});await trusted({type:'touch',event:'touchCancel'});await settle();
    check(JSON.stringify(layout.tree())===cancelTree&&!layout.dividerActive(),'touch cancellation leaves the split unchanged');
    draft.focus();const selected=document.createRange(),draftCells=draft.querySelectorAll('[data-inline-key]');selected.setStart(draftCells[0].firstChild!,0);selected.setEnd(draftCells[1].firstChild!,0);document.getSelection()!.removeAllRanges();document.getSelection()!.addRange(selected);
    check(layout.tile(win.key,firstOwner,'tab'),'group real applications in shell tabs');await settle();
    check(draft.isConnected&&draft.getClientRects().length===0&&manager.registry.windows[firstOwner].mounted&&!manager.registry.windows[firstOwner].visible,'inactive shell tab stays mounted, hidden and inactive');
    check(!!document.querySelector('[aria-label="Shell window tabs"]')&&!!flint.querySelector('.flint-application'),'shell tab chrome is outside Flint internal Document UI');
    const tab=[...document.querySelectorAll<HTMLButtonElement>('[role="tab"][id^="mwm-tab-"]')].find(e=>e.getAttribute('aria-controls')===`mwm-panel-${firstOwner}`)!;
    const tabBox=tab.getBoundingClientRect();await trusted({type:'click',x:tabBox.x+30,y:tabBox.y+12});await settle();
    check(document.activeElement===draft&&document.getSelection()!.toString().length===1,'trusted shell tab click restores the exact draft selection');
    check(tool.isConnected&&tool.closest<HTMLElement>('.mwm-surface')!.hidden,'Entity tool hides with its inactive owner without disposal');
    tab.focus();await trusted({type:'key',key:'ArrowLeft'});await settle();check(manager.registry.windows[win.key].visible,'shell tab arrow key activates adjacent app');
    manager.lifecycle.reveal(firstOwner);await settle();
    [...thesis.querySelectorAll('button')].find(b=>b.textContent==='Undo')!.click();await settle();check(draft.textContent===sourceBefore.slice(0,5),'Thesis undo survives float-to-split-to-tab transitions');
    [...thesis.querySelectorAll('button')].find(b=>b.textContent==='Redo')!.click();await settle();check(draft.textContent===draftText,'Thesis redo survives shell tabs');
    [...thesis.querySelectorAll('button')].find(b=>b.textContent==='Open source')!.click();await settle();await settle();
    const sourceBookmark=editor.mounts.get(text.key)!.captureInlineSelection?.();check(manager.registry.windows[win.key].visible&&sourceBookmark?.anchor===0&&sourceBookmark?.head===5,'source backlink reveals hidden Flint shell tab with source selection');
    manager.lifecycle.reveal(firstOwner);await settle();
    const veto=window.confirm;window.confirm=()=>false;try{await editor.closeView(firstOwner);}finally{window.confirm=veto;}
    check(draft.isConnected&&layout.isTiled(firstOwner),'Thesis close veto preserves tab membership and draft');
    manager.lifecycle.reveal(win.key);await settle();
    flint.querySelector<HTMLButtonElement>('[aria-label="Open files"]')!.click();await settle();
    const sheet=flint.querySelector<HTMLElement>('[aria-label="Storage and recovery"]')!,modalTree=JSON.stringify(layout.tree());
    check(!!sheet&&manager.registry.windows[win.key].ownerModalCount===1,'real Flint dialog owns the tiled application surface');
    check(!layout.tile(firstOwner,win.key,'right')&&JSON.stringify(layout.tree())===modalTree,'owner modal prevents a shell layout transaction');
    [...sheet.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Close storage')!.click();await settle();
    setModal(true);await settle();check(!layout.snap(firstOwner,'left')&&JSON.stringify(layout.tree())===modalTree,'workspace modal prevents a shell layout transaction');setModal(false);await settle();manager.lifecycle.reveal(firstOwner);await settle();
    // Pending manual Save and a retry receipt survive hidden tabs and floating transitions.
    const saveButton=[...thesis.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Save')!;
    saveButton.click();await settle();check(saveRequests.length===1,'manual Thesis Save dispatches once');
    manager.lifecycle.reveal(win.key);await settle();
    finishSave!(new Response(JSON.stringify({Success:false,Error:'Uncertain fixture response'}),{headers:{'Content-Type':'application/json'}}));await settle();
    manager.lifecycle.reveal(firstOwner);layout.float(firstOwner);await settle();saveButton.click();await settle();
    check(saveRequests.length===2&&JSON.stringify(saveRequests[0])===JSON.stringify(saveRequests[1]),'Save retry after shell hide and float reuses operation receipt identity');
    draft.focus();await trusted({type:'text',text:'N'});await settle();const newer=draft.textContent,submitted=saveRequests[1];
    layout.tile(win.key,firstOwner,'tab');await settle();
    finishSave!(new Response(JSON.stringify({Success:true,Data:{proposition:{...submitted,revision:1,modifiedUtc:'2026-10-20',attributes:{thesis:{version:1,archived:false,source:submitted.source}}}}}),{headers:{'Content-Type':'application/json'}}));await settle();
    manager.lifecycle.reveal(firstOwner);await settle();check(draft.textContent===newer&&thesis.textContent?.includes('Unsaved changes'),'Save completion while hidden retains newer edits and unsaved protection');
    check(saveRequests.length===2,'layout transitions never trigger Document or Thesis Save');
    // Geometry changes are temporary fallback presentation, not saved tree rewrites.
    layout.tile(firstOwner,win.key,'right');await settle();const beforeViewport=JSON.stringify(layout.tree());
    await trusted({type:'viewport',width:400,height:500});await settle();await settle();
    check(layout.solution().unsatisfiable.length>0&&!!document.querySelector('[aria-label="Temporary shell tabs"]'),'small viewport falls back to temporary shell tabs');
    check(JSON.stringify(layout.tree())===beforeViewport&&draft.isConnected&&body===editor.mounts.get(text.key),'viewport fallback preserves layout and application sessions');
    manager.lifecycle.reveal(firstOwner);await settle();check(manager.registry.windows[firstOwner].visible,'temporary tab can reveal its retained app');
    await trusted({type:'viewport',width:1440,height:1000});await settle();await settle();check(layout.solution().unsatisfiable.length===0&&!!divider(),'viewport expansion restores the saved split');
    divider().focus();await trusted({type:'key',key:'ArrowLeft'});await trusted({type:'viewport',width:1300,height:900});await settle();await settle();check(!layout.dividerActive()&&JSON.stringify(layout.tree())===beforeViewport,'viewport resize cancels pending divider transaction');
    await trusted({type:'browserZoom',scale:1.25});await settle();await settle();check(devicePixelRatio>1&&draft.isConnected,'actual browser zoom preserves mounted draft');
    const rects=Object.values(layout.solution().rectangles),area=manager.geometry.bounds();check(rects.every(r=>r.width>0&&r.height>0&&r.x>=area.x&&r.x+r.width<=area.x+area.width+1),'zoomed solve stays within CSS work area');
    await trusted({type:'browserZoom',scale:1});await trusted({type:'viewport',width:1440,height:1000});await settle();await settle();
    const minTree=JSON.stringify(layout.tree());manager.lifecycle.minimize(firstOwner);await settle();check(JSON.stringify(layout.tree())===minTree&&draft.isConnected,'minimize reserves tiled slot and retains draft');manager.lifecycle.reveal(firstOwner);await settle();
    manager.maximize(firstOwner);await settle();check(!divider()&&draft.isConnected,'maximized tiled app covers work area without moving its mount');manager.maximize(firstOwner);await settle();check(!!divider()&&JSON.stringify(layout.tree())===minTree,'restore from maximize returns to the same split');
    // Snap pointer and touch alternatives use the same transaction as menu presets.
    layout.float(firstOwner);await settle();const normal=thesis.getBoundingClientRect(),viewportArea=manager.geometry.bounds(true);
    await trusted({type:'pointer',event:'mousePressed',x:normal.x+100,y:normal.y+12});await trusted({type:'pointer',event:'mouseMoved',x:viewportArea.x+2,y:viewportArea.y+100});await settle();
    check(!!document.querySelector('.mwm-snap-preview'),'edge drag shows a constrained snap preview');await trusted({type:'pointer',event:'mouseReleased',x:viewportArea.x+2,y:viewportArea.y+100});await settle();check(layout.isTiled(firstOwner),'edge drop commits half snap');
    check(layout.snap(firstOwner,'top-left'),'quarter snap accepted');await settle();const quarter=thesis.getBoundingClientRect();check(quarter.width<innerWidth*.6&&quarter.height<innerHeight*.6,'quarter uses bounded quarter work area');
    check(draft.isConnected&&draft.textContent===newer&&tool.isConnected,'snap preserves draft and Entity tool sessions');
    const ax=await trusted({type:'accessibility'});check(ax.some((n:any)=>n.role==='separator'&&n.name==='Resize shell split'),'split divider exposed in Chrome accessibility tree');
    check(layout.float(firstOwner),'return to floating accepted');await settle();check(document.activeElement===draft,'return to floating restores native draft focus');
    document.querySelector<HTMLButtonElement>('[data-system-menu-trigger="workspace"]')!.click();await settle();
    const menuButton=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(b=>b.textContent===label)!;
    menuButton('Windows▸').focus();await trusted({type:'key',key:'ArrowRight'});await settle();
    const ownerMenu=[...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(b=>b.textContent?.startsWith(manager.title(firstOwner)))!;
    ownerMenu.focus();await trusted({type:'key',key:'ArrowRight'});await settle();menuButton('Arrange window▸').focus();await trusted({type:'key',key:'ArrowRight'});await settle();
    check(document.activeElement?.textContent==='Left half','keyboard navigation reaches the same snap presets');
    await trusted({type:'key',key:'Enter'});await settle();check(layout.isTiled(firstOwner)&&draft.isConnected,'trusted keyboard menu action commits snap without replacing the draft');
    manager.lifecycle.reveal(win.key);await settle();choose('+ Create Entity');choose('Create and link');await settle();
    check(!!finishCreate,'explicit Entity creation is pending in memory');
    check(layout.tile(firstOwner,win.key,'tab'),'pending Entity owner participates in a retained tab transition');await settle();
    await editor.closeView(win.key);check(tool.isConnected&&!!manager.registry.windows[win.key],'pending Entity operation continues to guard owner close while tabbed');
    editor.commands.setPayloadField(text.key,'metadata',{qualification:true});finishCreate!(entity);await settle();
    check(tool.isConnected&&tool.textContent?.includes('Created but not linked'),'Entity creation completion in hidden tab retains its uncertain linking receipt');
    manager.lifecycle.reveal(win.key);layout.float(win.key);await settle();check(tool.isConnected&&tool.textContent?.includes('Created but not linked')&&tool.querySelector<HTMLInputElement>('[aria-label="Search entities"]')!.value===originalQuery,'Entity query and creation receipt survive return to floating');

    return {checks,blockedBackendRequests:blockedRequests.length,userAgent:navigator.userAgent};
  } finally {stopAnchor?.();stopInput();stop();session.dispose();host.remove();window.fetch=originalFetch;}
}
