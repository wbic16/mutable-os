import { editorInputBoundary } from '../../runtime/editor-input';
import { For, Show, createSignal, createMemo, createUniqueId, onMount, onCleanup, lazy } from 'solid-js';
import type { DocumentApplicationInstance } from '../../feature-api/document-application';
import { Dynamic } from "solid-js/web";
import { KnowledgeView } from './knowledge-view';
import { VaultView, DocumentProperties } from './vault-view';
import { RecentDocuments } from './recent-documents';
import { StorageSheet } from './storage-sheet';
import { useCurrentCavern } from '../../application/cavern-startup';
import { MaterialChrome, materialChromePresentation } from './material/material-chrome';
import { FlintProbe } from './probe/probe';
import { FlintLogo } from './logo';
import { createFlintLayout, FlintPaneSplitter } from './compact-layout';

const DocumentGraph = lazy(() => import('./graph/document-graph').then(module => ({default:module.DocumentGraph})));
// Original artwork remains the static logo fallback and welcome illustration.
const identity = new URL('../../../docs/assets/flint/flint-app-icon-master.png', import.meta.url).href;
export function FlintView(props:{application:DocumentApplicationInstance; initialView?:'document'|'graph'; materialChrome?:boolean; probe?:boolean; spatialGraph?:boolean; logo?:boolean; compactShell?:boolean}) {
  const cavern = useCurrentCavern();
  const app=props.application;
  // Explorer selection depends on the file location, not its typing/save status.
  const activeLocation = createMemo(() => app.properties()?.location, undefined, {
    equals: (previous, next) => previous?.folder === next?.folder && previous?.filename === next?.filename,
  });
  const compact = () => props.compactShell !== false;
  const preferences = createFlintLayout(compact());
  const library = () => preferences.layout.library, context = () => preferences.layout.context;
  const setLibrary = (value: boolean) => preferences.set('library', value), setContext = (value: boolean) => preferences.set('context', value);
  const explorerId = createUniqueId(), inspectorId = createUniqueId();
  const [shellWidth, setShellWidth] = createSignal(1200);
  const narrow = (panel: 'library' | 'context') => compact() ? shellWidth() < (panel === 'library' ? 620 : 760) : shell.clientWidth < 940;
  const visible = (panel: 'library' | 'context') => narrow(panel) ? narrowPanel() === panel : panel === 'library' ? library() : context();
  const [browse,setBrowse]=createSignal<'browse'|'search'|'recent'>('browse');
  const [view,setView]=createSignal<'document'|'graph'>(props.initialView === 'graph' && props.spatialGraph !== false ? 'graph' : 'document');
  const [lens,setLens]=createSignal<'Backlinks'|'References'|'Properties'>('Backlinks');
  const [narrowPanel,setNarrowPanel]=createSignal<'library'|'context'|''>('');
  const [menu,setMenu]=createSignal(false),[storage,setStorage]=createSignal(false);
  const [destination,setDestination]=createSignal({folder:'.',filename:'Document.mutable.json'});
  const [busy,setBusy]=createSignal(false),[error,setError]=createSignal('');
  let shell!:HTMLDivElement, menuButton!:HTMLButtonElement, storageInvoker:HTMLElement|undefined;
  onMount(() => {
    const measure = () => setShellWidth(shell.clientWidth || 1200);
    measure();
    if (typeof ResizeObserver !== 'undefined') { const observer = new ResizeObserver(measure); observer.observe(shell); onCleanup(() => observer.disconnect()); }
    // Handle the active Flint tab before the workspace's document shortcut.
    const saveShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const boundary = editorInputBoundary(event);
      if (boundary) {
        if (shell.contains(boundary.handle.root)) app.handleSaveShortcut?.(event, () => {
          if (!storage() && app.properties() && !vault()?.readOnly && !vault()?.busy) void save();
        });
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 's'
        || event.isComposing || !(event.target instanceof Node) || !shell.contains(event.target)) return;
      event.preventDefault(); event.stopPropagation();
      if (!storage() && app.properties() && !vault()?.readOnly && !vault()?.busy) void save();
    };
    window.addEventListener('keydown', saveShortcut, true);
    onCleanup(() => window.removeEventListener('keydown', saveShortcut, true));
  });
  const vault=()=>app.vault?.state();
  const showLibrary=()=>{setLibrary(true);setNarrowPanel('library');};
  const focusLibrary=()=>{showLibrary();setBrowse('browse');queueMicrotask(()=>{const actions=shell.querySelector<HTMLSelectElement>('[aria-label="File actions"]');if(actions){actions.value='options';actions.dispatchEvent(new Event('change',{bubbles:true}));}const input=shell.querySelector<HTMLInputElement>('[aria-label="Vault directory"]');for(let parent=input?.parentElement;parent&&parent!==shell;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;input?.focus();});};
  const newDocument=()=>{if(!vault()){chooseVault();return;}showLibrary();setBrowse('browse');queueMicrotask(()=>shell.querySelector<HTMLButtonElement>('[data-new-document]')?.click());};
  const chooseVault=()=>app.vault?.choose?app.vault.choose():focusLibrary();
  const showSearch=()=>{showLibrary();setBrowse('search');queueMicrotask(()=>shell.querySelector<HTMLInputElement>('[aria-label="Search vault"]')?.focus());};
  const openStorage=(invoker?:HTMLElement)=>{storageInvoker=invoker??menuButton;const bound=app.files?.location();if(bound)setDestination(bound);else setDestination({folder:vault()?.root??'.',filename:app.interchange?.suggestedFilename()??'Document.ink'});setMenu(false);setStorage(true);};
  const closeStorage=()=>{setStorage(false);queueMicrotask(()=>{const target=storageInvoker?.isConnected?storageInvoker:menuButton;if(target?.isConnected)target.focus();});};
  const save=async()=>{if(!app.files||busy())return;if(!app.files.location()&&!vault()){openStorage();return;}setBusy(true);setError('');try{await app.files.save();}catch(e){setError(String(e));}finally{setBusy(false);}};
  const toggle=(rail:'library'|'context')=>{const open=rail==='library'?library():context(),set=rail==='library'?setLibrary:setContext;
    if(narrow(rail)){set(true);setNarrowPanel(narrowPanel()===rail?'':rail);}else set(!open);
  };
  return <div ref={shell} onDragOver={event=>app.interchange?.drag(event)} onDrop={event=>app.interchange?.drag(event,true)} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))app.interchange?.clearDrop();}} class="flint-application" classList={{'flint-compact':compact()}} data-density={compact() ? preferences.layout.density : undefined}
    style={compact() ? { '--flint-explorer-width': `${preferences.layout.explorerWidth}px`, '--flint-inspector-width': `${preferences.layout.inspectorWidth}px` } : undefined} data-material-chrome={props.materialChrome !== false && !compact()} data-view={view()} data-library={library()} data-context={context()} data-narrow-panel={narrowPanel()}>
    <div class="flint-surfaces" inert={storage()}>
    <header class="flint-application__header">
      <div class="flint-menu-anchor" onKeyDown={e=>{if(menu()&&e.key==='Escape'){e.preventDefault();e.stopPropagation();setMenu(false);menuButton.focus();}}}><button ref={menuButton} class="flint-brand" aria-label="Flint application menu" aria-expanded={menu()} onClick={()=>setMenu(!menu())}><Show when={!compact()} fallback={<span class="flint-compact-mark" aria-hidden="true">◈</span>}><FlintLogo enabled={props.logo !== false} root={()=>shell} image={identity}/></Show><strong>FLINT</strong><span aria-hidden="true">⌄</span></button>
        <Show when={menu()}><div class="flint-menu" role="group" aria-label="Flint actions" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setMenu(false);menuButton.focus();}}}>
          <Show when={compact()}><button aria-label="Show graph" aria-pressed={view()==='graph'} disabled={!app.properties()||props.spatialGraph===false} onClick={()=>{setView(view()==='graph'?'document':'graph');setMenu(false);}}>{view()==='graph'?'Show Document':'Show graph'}</button>
          <button aria-label="Reading density" aria-pressed={preferences.layout.density==='reading'} onClick={()=>{preferences.set('density',preferences.layout.density==='compact'?'reading':'compact');setMenu(false);}}>Reading density</button></Show>
          <button disabled={!app.vault} onClick={()=>{setMenu(false);chooseVault();}}>Open Another Cavern…</button>
          <button onClick={()=>openStorage()}>Open / Save native Ink…</button>
          <Show when={app.interchange?.openTeiXml}><button onClick={()=>{setMenu(false);app.interchange!.openTeiXml!();}}>Open TEI XML…</button></Show>
          <Show when={app.publish}><button onClick={()=>{setMenu(false);app.publish!();}}>Publish to Web…</button></Show>
          <Show when={app.interchange}><button onClick={()=>{setMenu(false);app.interchange!.importCollection();}}>Import collection…</button><button onClick={()=>{setMenu(false);app.interchange!.exportCollection();}}>Export collection…</button><button onClick={()=>{setMenu(false);app.interchange!.importFiles();}}>Import external files…</button>
          <button onClick={()=>{setMenu(false);app.interchange!.importPackage();}}>Import Ink package…</button>
          <button disabled={!app.properties()} onClick={()=>{setMenu(false);app.interchange!.exportPackage();}}>Export archival Ink package…</button>
          <button disabled={!app.properties()} onClick={()=>{setMenu(false);app.interchange!.inspectPackage();}}>Packaged database context…</button>
          <button onClick={()=>{setMenu(false);app.interchange!.downloadViewer();}}>Download offline Ink Viewer</button>
          <For each={['html','markdown'] as const}>{format=><button disabled={!app.properties()} onClick={()=>{setMenu(false);app.interchange!.exportPortable(format);}}>Export {format==='html'?'HTML':'Markdown'} with assets…</button>}</For>
          <button disabled={!app.properties()} onClick={()=>{setMenu(false);app.interchange!.exportPortable('html',true);}}>Export standalone HTML…</button>
          <For each={['html','markdown','text'] as const}>{format=><button disabled={!app.properties()} onClick={()=>{setMenu(false);app.interchange!.exportDocument(format);}}>Export as {format==='html'?'HTML':format==='markdown'?'Markdown':'Plain text'}…</button>}</For></Show>
          <button disabled={!app.properties()} onClick={()=>{app.closeActiveTab();setMenu(false);menuButton.focus();}}>Close tab</button>
          <button onClick={()=>{setMenu(false);menuButton.focus();}}>Dismiss menu</button>
        </div></Show>
      </div>
      <div class="flint-vault-name"><small>{cavern ? 'CAVERN' : 'WORKSPACE'}</small><span>{cavern?.current()?.name ?? vault()?.root??'Workspace'}<Show when={compact() && app.properties()}> / {app.properties()?.title}</Show></span></div>
      <div class="flint-header-actions"><Show when={compact()}><button class="flint-new-document" aria-label="New Document" title="New Document / Document formats" disabled={!app.vault} onClick={newDocument}>+</button></Show>
      <button data-flint-relief="key" class="flint-search-launch" aria-label="Search collection" title="Search collection" onClick={showSearch}>{compact() ? "⌕" : "Search"}</button>
      <Show when={compact()}><button class="flint-panel-toggle" aria-label="Toggle Library" title="Toggle explorer" aria-controls={explorerId} aria-expanded={visible("library")} onPointerDown={e=>e.preventDefault()} onClick={()=>toggle("library")}>◧</button><button class="flint-panel-toggle" aria-label="Toggle Context" title="Toggle inspector" aria-controls={inspectorId} aria-expanded={visible("context")} onPointerDown={e=>e.preventDefault()} onClick={()=>toggle("context")}>◨</button></Show>
      <Show when={props.materialChrome !== false}><div class="flint-graph-lighting" hidden={compact() && view()!=="graph"}><MaterialChrome root={()=>shell} /></div></Show>
      <button data-document-save class="flint-save" data-flint-relief="key" disabled={!app.files||!app.properties()||busy()||vault()?.readOnly||vault()?.busy} onPointerDown={e=>e.preventDefault()} onClick={()=>void save()} aria-label="Save Document" title="Save Document (Command-S / Control-S)">Save</button></div>
    </header>
    <Show when={!compact()}><div class="flint-workspace-tools">
      <button data-flint-relief="key" aria-label="Toggle Library" aria-pressed={library()} onPointerDown={e=>e.preventDefault()} onClick={()=>toggle('library')}>☰ Library</button>
      <Show when={props.spatialGraph !== false}><button data-flint-relief="key" aria-label="Toggle Document and Graph" aria-pressed={view()==='graph'} disabled={!app.properties()} onClick={()=>setView(view()==='graph'?'document':'graph')}>{view()==='graph'?'▤ Document':'♧ Graph'}</button></Show>
      <div class="flint-current"><span>{cavern?.current()?.name ?? vault()?.root??'Open Documents'}</span><span aria-hidden="true"> / </span><strong>{app.properties()?.title??'Choose a Document'}</strong></div>
      <button data-flint-relief="key" aria-label="Toggle Context" aria-pressed={context()} onPointerDown={e=>e.preventDefault()} onClick={()=>toggle('context')}>Context ☷</button>
    </div>
    </Show>
    <Show when={props.probe !== false}><FlintProbe root={()=>shell} lighting={()=>materialChromePresentation(shell)?.lighting}/></Show>
    <div class="flint-application__body">
      <nav id={explorerId} data-flint-relief="panel" class="flint-application__vault flint-rail" aria-label="Flint Documents" onClick={event=>{if((event.target as Element).closest('.flint-search-hit,.flint-tree-document button,.flint-open-document')){setView('document');if(compact())setNarrowPanel('');}}} onKeyDown={e=>{if(e.key==='Escape'&&narrow('library')){e.preventDefault();e.stopPropagation();setNarrowPanel('');shell.querySelector<HTMLButtonElement>('[aria-label="Toggle Library"]')?.focus();}}}>
        <div data-flint-content="library">
        <div class="flint-spatial-navigation" role="group" aria-label="Flint views">
          <button data-flint-relief="key" aria-pressed={view()==='document'} onClick={()=>setView('document')}><span aria-hidden="true">▤</span> Documents</button>
          <Show when={props.spatialGraph !== false}><button data-flint-relief="key" aria-pressed={view()==='graph'} disabled={!app.properties()} onClick={()=>setView('graph')}><span aria-hidden="true">♧</span> Graph</button></Show>
          <button data-flint-relief="key" onClick={showSearch}><span aria-hidden="true">⌕</span> Search collection</button>
        </div>
        <div class="flint-rail-heading"><h2>{cavern?.current()?.name ?? vault()?.root ?? "Workspace"}</h2><small>YOUR COLLECTION</small></div>
        <div class="flint-segments" role="group" aria-label="Library views"><button aria-pressed={browse()==='browse'} onPointerDown={e=>e.preventDefault()} onClick={()=>setBrowse('browse')}>Files</button><button aria-pressed={browse()==='search'} onPointerDown={e=>e.preventDefault()} onClick={()=>setBrowse('search')}>Search</button><Show when={app.recentDocuments}><button aria-pressed={browse()==='recent'} onClick={()=>setBrowse('recent')}>Recent</button></Show></div>
        <div hidden={browse()!=='browse'}>
          <Show when={app.vault} fallback={<p>Cavern browsing is unavailable in this host.</p>}><VaultView vault={app.vault!} compact={compact()} activeLocation={activeLocation}/></Show>
          <Show when={!vault()}><h3>Open Documents</h3><p class="flint-hint">Open a managed directory above, or continue with a Document already in this workspace.</p><For each={app.documents()}>{doc=><button class="flint-open-document" onClick={()=>app.openDocument(doc.id)}><span>{doc.title}</span></button>}</For></Show>
        </div>
        <div hidden={browse()!=='recent'}><Show when={app.recentDocuments}>{recent => <RecentDocuments recent={recent()}/>}</Show></div>
        <div hidden={browse()!=='search'}><Show when={vault()&&app.knowledge} fallback={<p>Open a Cavern to search its available native Documents.</p>}><KnowledgeView knowledge={app.knowledge!} mode="search"/></Show></div>
        </div>
      </nav>
      <Show when={compact()}><FlintPaneSplitter pane="library" controls={explorerId} width={()=>preferences.layout.explorerWidth} root={()=>shell} resize={(width,save)=>preferences.set('explorerWidth',width,save)}/></Show>
      <main class="flint-application__editor" data-flint-content="document" onClick={event=>{if((event.target as Element).closest('[role=tab]'))setView('document');}}>
        <Show when={!app.properties()}><section class="flint-welcome"><img src={identity} alt="Flint — a space for ideas"/><div><small>A SPACE FOR IDEAS</small><h1>Make room for your next thought.</h1><p>{vault()?'Choose a Document from your Library, or create one in the selected folder.':'Bring your Documents together. Open a Cavern to browse, write and follow connections.'}</p><button onClick={()=>vault()?focusLibrary():chooseVault()}>{vault()?'Browse / New Document':'Open a Cavern'}</button><button onClick={e=>openStorage(e.currentTarget)}>Open native file</button></div></section></Show>
        {/* This slot is unconditional. Shell presentation never reparents or remounts it. */}
        <app.tabs />
        <Show when={props.spatialGraph !== false && view()==='graph' && app.properties()}><DocumentGraph application={app} root={()=>shell} showDocument={()=>setView('document')}/></Show>
      </main>
      <Show when={compact()}><FlintPaneSplitter pane="context" controls={inspectorId} width={()=>preferences.layout.inspectorWidth} root={()=>shell} resize={(width,save)=>preferences.set('inspectorWidth',width,save)}/></Show>
      <aside id={inspectorId} data-flint-relief="panel" class="flint-context flint-rail" onClick={event=>{if((event.target as Element).closest('.document-entity-list__focus,.flint-reference button,.flint-knowledge button'))setView('document');}} aria-label="Document Context" onKeyDown={e=>{if(e.key==='Escape'&&!e.defaultPrevented&&narrow('context')){e.preventDefault();e.stopPropagation();setNarrowPanel('');shell.querySelector<HTMLButtonElement>('[aria-label="Toggle Context"]')?.focus();}}}>
        <div data-flint-content="entities">
        <div class="flint-rail-heading"><h2>Context</h2><small>AROUND THIS DOCUMENT</small></div>
        <Show when={compact()} fallback={<div class="flint-segments" role="group" aria-label="Context lenses"><For each={['Backlinks','References','Properties'] as const}>{name=><button aria-pressed={lens()===name} onPointerDown={e=>e.preventDefault()} onClick={()=>setLens(name)}>{name}</button>}</For></div>}>
          <div class="flint-segments" role="group" aria-label="Inspector panels"><button aria-pressed={lens()!=='Properties'} onPointerDown={e=>e.preventDefault()} onClick={()=>setLens('Backlinks')}>Links</button><button aria-pressed={lens()==='Properties'} onPointerDown={e=>e.preventDefault()} onClick={()=>setLens('Properties')}>Properties</button></div>
          <div class="flint-link-lenses" role="group" aria-label="Link views" hidden={lens()==='Properties'}><For each={['Backlinks','References'] as const}>{name=><button aria-pressed={lens()===name} onPointerDown={e=>e.preventDefault()} onClick={()=>setLens(name)}>{name}</button>}</For></div>
        </Show>
        <Show when={!app.properties()}><p>Open a Document to explore its context.</p></Show>
        <Show when={lens()==='Backlinks'&&context()}><Show when={app.entityBacklinks} fallback={<p>Entity backlinks are unavailable in this host.</p>}><Dynamic component={app.entityBacklinks!}/></Show></Show>
        <div hidden={lens()!=='References'}><Show when={vault()&&app.knowledge} fallback={<p>Open a vault to work with native Document references.</p>}><KnowledgeView knowledge={app.knowledge!} mode="references"/></Show></div>
        <div hidden={lens()!=='Properties'}><DocumentProperties application={app}/></div>
        </div>
      </aside>
    </div>
    <footer class="flint-status" aria-label="Flint resource status"><div><span class="flint-status-dot" aria-hidden="true"/><span class="flint-signature">SAME THING. MANY FORMS.</span><span role="status">{busy()?'Saving…':app.properties()?.status??app.files?.status()??'No active Document'}</span></div>
      <Show when={compact()}><span class="flint-cavern-status">Cavern: {cavern?.current()?.name ?? vault()?.root ?? "Workspace"}</span></Show>
      <Show when={vault()}><small>{vault()!.documents.filter(d=>d.loaded).length}/{vault()!.documents.length} loaded · search coverage is reported per query</small></Show>
      <button onClick={e=>openStorage(e.currentTarget)}>Storage details</button>
    </footer>
    <Show when={error()||vault()?.readOnly||vault()?.busy||vault()?.notice||vault()?.complete===false||vault()?.diagnostics.length||vault()?.operations.some(o=>o.phase==='pending')}><div class="flint-attention" role="status">
      <Show when={error()}><p role="alert">{error()}</p></Show><Show when={vault()?.readOnly}><p>Read-only storage. Local edits cannot be saved.</p></Show>
      <Show when={vault()?.busy}><p>Vault operation in progress…</p></Show><Show when={vault()?.complete===false}><p>Discovery is incomplete. Uninspected resources are unknown.</p></Show>
      <Show when={vault()?.operations.some(o=>o.phase==='pending')}><p>Relocation needs attention. <button onClick={focusLibrary}>Review recovery in Library</button></p></Show>
      <For each={vault()?.diagnostics}>{d=><p>{d}</p>}</For><Show when={vault()?.notice}><p>{vault()!.notice}</p></Show>
    </div></Show>
    </div>
    <Show when={storage()}><StorageSheet application={app} destination={destination()} setDestination={setDestination} close={closeStorage}/></Show>
  </div>;
}
