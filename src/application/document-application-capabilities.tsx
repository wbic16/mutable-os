import { documentApplicationPorts } from './document-application-ports';
import { tabOrientation } from '../block-tree/tab-orientation';
import { tabOrientationMenu } from '../runtime/tab-orientation';
import {registerCompletionDocuments} from './completion-documents';
import { exportDocument } from '../runtime/export-document';
import { CollectionDialog } from '../rendering/collection-dialog';
import {createDocumentSave} from './document-save';
import { createRecentDocuments } from './recent-documents';
import { PublicationDialog } from '../rendering/publication-dialog';
import { hasInternalBlockDrag } from '../rendering/block-selection';
import {isNativeDocumentName,markdownProjectionName,isDerivedMarkdownName} from '../persistence/document-file-names.mjs';
import { DocumentBrowser } from "../demo/document-browser";
import { useCurrentCavern } from './cavern-startup';
import { registerDocumentApplicationNavigation } from './document-application-navigation';
import {registerEntityContext} from './entity-service';
import {SavedResultActivation} from './saved-result-activation';
import {sqliteIndexLifecycle} from './sqlite-index-lifecycle';
import {observeLive} from '../knowledge/live-observer';
import {runSearchWorker} from '../runtime/search-worker';
import { createNativeKnowledgeHost } from './native-knowledge-scope';
import { FactsQueryProvider } from './facts-query-provider';
import { annotationCapabilities } from "./annotation-capabilities";
import { DocumentEntityList } from "../features/entity-references/document-entity-list";
import { EntityListContents } from "../features/entity-references/list-view";
import { VaultKnowledge, type KnowledgeHost } from "./vault-knowledge";
import { revealMatch } from "../runtime/reveal-match";
import type { BlockTreeProjection } from "../block-tree/projection";
import { createDocumentVaults, vaultPath, vaultLeaf, vaultContains, type DocumentVaultLease, type VaultLocation } from "./document-vault";
import { createFormattedDocument, documentFormats, readDocumentFormat } from "../features/document-formats/model";
import type { ApplicationVault } from "../feature-api/document-application";
import { nativeDocumentSession } from "../persistence/native-session";
import { documentRootPlacements } from "../block-tree/resource-registration";
import { Show, For, batch, createMemo, createSignal, createEffect, untrack, onCleanup, onMount } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { FeatureScope } from "../feature-api";
import type { DocumentApplicationCapabilities } from "../feature-api/document-application";
import type { ExistingBlockDto } from "../block-tree/types";
import { tabDocumentTarget } from "../rendering/document-tab-context";
import { TransientDocumentView, type DocumentViewBookmark } from "../rendering/transient-document-view";
import { useManagedWindowOwner } from "../rendering/window-manager";
import { RetainedDocumentHost } from "../rendering/retained-document-view";

/** Private host adapter. No repository/editor access crosses into the application. */
export function documentApplicationCapabilities(editor: ReactiveEditor, scope: FeatureScope): DocumentApplicationCapabilities {
  const requireActive = () => { if (!scope.active()) throw new Error("Document application is disposed"); };
  const catalog = () => {
    const state = editor.repository.readState();
    return Object.values(state.contents).filter(c => c.viewType === "document-block").map(content => {
      const meta = content.payload.metadata as Record<string, unknown> | undefined;
      const id = String(meta?.documentId ?? content.payload.id ?? "");
      const owners = documentRootPlacements(state, content.key).map(p => p.key);
      const filename = editor.features.nativeDocumentPersistence ? nativeDocumentSession(editor).location(id)?.filename : undefined;
      const title = [meta?.title, meta?.name, filename].find((value): value is string => typeof value === "string" && !!value.trim()) ?? "Untitled";
      return { id, title, contentKey: content.key, placement: owners.length === 1 ? owners[0] : undefined };
    }).filter(d => d.id);
  };
  return { register(definition) {
    requireActive();
    // One launch may request an existing presentation. Never persist that UI mode.
    const launchViews = new Map<string, "graph">();
    const recents = definition.type === 'flint-application-block' && editor.features.flintRecentDocuments ? createRecentDocuments() : undefined;
    const native = editor.features.nativeDocumentPersistence ? nativeDocumentSession(editor) : undefined;
    const factsHost = native && editor.features.nativeKnowledge ? createNativeKnowledgeHost(editor.repository, native, {
      read: () => ({version: 1, opaqueTypes: editor.registry.typesWithCapability('opaque-widget')}),
      subscribe: listener => editor.registry.subscribe(listener),
    }, {loadedOnly: !editor.features.nativeKnowledgeSaved, progressiveSaved: editor.features.nativeKnowledgeSaved, sqliteSaved: editor.features.sqliteKnowledge}) : undefined;
    scope.own(() => { void factsHost?.dispose(); });
    const vaults = native ? createDocumentVaults(native, editor.features.sqliteKnowledge ? root => sqliteIndexLifecycle(root,{version:1,opaqueTypes:editor.registry.typesWithCapability('opaque-widget')}) : undefined, editor.features.vaultDiscoveryCache) : undefined;
    scope.own(() => vaults?.dispose());
    const vaultRoots = new Map<string, string>();
    scope.own(() => vaultRoots.clear());
    // Search/reference navigation is presentation state: no authored tab insert or History event.
    const navigationTabs = new Map<string, { tabs: Map<string, string>; active?: string }>();
    scope.own(() => navigationTabs.clear());
    const viewBookmarks = new Map<string, { placement: string; tabs: Map<string, DocumentViewBookmark> }>();
    scope.own(() => viewBookmarks.clear());
    scope.own(editor.repository.subscribeChanges(change => {
      if (change.inlineOwner || change.split || change.childrenOwner || change.listWrap) return;
      for (const [key, value] of viewBookmarks) if (!editor.repository.state.placements[value.placement]) { viewBookmarks.delete(key); vaultRoots.delete(key); navigationTabs.delete(key); }
      scope.defer(() => { for (const [owner, value] of viewBookmarks) for (const key of value.tabs.keys()) if (!editor.node(key) && !navigationTabs.get(owner)?.tabs.has(key)) value.tabs.delete(key); });
    }));
    const entityAnnotations = annotationCapabilities(editor, scope);
    const Instance = (props: { nodeKey: string }) => {
      const applicationId = String(editor.node(props.nodeKey)?.payload.id);
      const initialView = launchViews.get(applicationId);
      launchViews.delete(applicationId);
      const cavern = useCurrentCavern();
      const [externalPresentation,setExternalPresentation] = createSignal(false);
      const retainedSessions = useManagedWindowOwner() ? editor.documentSessions : undefined;
      // Stage A hosts a Window application, never an application recursively inside a Document.
      if (editor.blockQueries.ancestors(props.nodeKey).some(n => n.viewType === "document-block")) return <p role="status">This application requires a Window outside a Document.</p>;
      const [revision, setRevision] = createSignal(0);
      // Validated local edits cannot change Document identity, titles or root placements.
      onCleanup(editor.repository.subscribeChanges(change => { if (!change.inlineOwner && !change.split && !change.childrenOwner && !change.listWrap && !change.taskStateOwner && !change.structural) setRevision(n => n + 1); }));
      const all = createMemo(() => { revision(); return catalog(); });
      const documents = all;
      const byId = createMemo(() => {
        const map = new Map<string, ReturnType<typeof catalog>[number] | undefined>();
        for (const document of all()) map.set(document.id, map.has(document.id) ? undefined : document);
        return map;
      });
      const resolve = (id: string) => {
        return byId().get(id);
      };
      const row = () => editor.node(props.nodeKey)?.children.map(key => editor.node(key)).find(n => n?.viewType === "tab-row-block");
      const bookmarks = viewBookmarks.get(props.nodeKey)?.tabs ?? new Map<string, DocumentViewBookmark>();
      viewBookmarks.set(props.nodeKey, { placement: editor.node(props.nodeKey)!.placementKey, tabs: bookmarks });
      const navigation = navigationTabs.get(props.nodeKey) ?? {tabs: new Map<string, string>()};
      navigationTabs.set(props.nodeKey, navigation);
      const [navigationRevision, setNavigationRevision] = createSignal(0);
      const detachment = retainedSessions?.detachment;
      const tabSession = (key: string) => detachment?.forSlot(props.nodeKey,key);
      const detachedTab = (key: string) => detachment?.detached(tabSession(key)) ?? false;
      const liveViews = new Map<string, BlockTreeProjection>();
      const [viewRevision, setViewRevision] = createSignal(0);
      const visibleTabs = () => (row()?.children ?? []).filter(key => !editor.viewVisibility.isClosed(editor.node(key)!.placementKey));
      const activeTab = () => { navigationRevision(); if(navigation.active && navigation.tabs.has(navigation.active)) return navigation.active; const r = row(), keys = visibleTabs(); const selected = r && editor.viewChildren[r.key]; return selected && keys.includes(selected) ? selected : keys.find(k => (editor.node(k)?.payload.metadata as any)?.active) ?? keys[0]; };
      let root!: HTMLDivElement, mounted = true;
      const guard = () => { requireActive(); if (!mounted || !editor.node(props.nodeKey)) throw new Error("Document application instance is disposed"); };
      onMount(() => {
        const release = editor.mounts.register(props.nodeKey, { root, focusElement: root, inputPolicy: "container", focus: () => root.focus({ preventScroll: true }),
          contextActions: () => {
            const menu = editor.overlays.overlays.find(item => item.ownerKey === props.nodeKey && item.viewType === "context-menu");
            const key = (menu?.data as { documentTab?: string } | undefined)?.documentTab ?? activeTab();
            const session=key&&tabSession(key), detached=key&&detachedTab(key);
            const reason=detachment && !detached ? detachment.reason(session||undefined) : undefined;
            return [...tabOrientationMenu(editor, row()?.key), { label: 'Export Document', disabled: !key || !tabId(key), run: () => {
              guard(); const id = key && tabId(key);
              if (!id) throw new Error('The Document is no longer available.');
              return exportDocument(editor, id, {vault: selectedVault()?.root, viewId: editor.node(key!)?.viewId, current: () => mounted && !!key && tabId(key) === id});
            } }, ...(detachment ? [{label: detached ? "Return to Flint" : "Detach Document", disabled: !session || !!reason || !!detached && !detachment.canReturn(detachment.forSession(session)!), run:()=>{if(key)void transferTab(key);}}, ...(reason?[{label:reason,disabled:true,run:()=>{}}]:[])] : []), { label: "Close Document", disabled: !key || !tabKeys().includes(key), run: () => { if (key) closeTab(key); } }];
          },
        });
        onCleanup(release);
      });
      onCleanup(() => { mounted = false; for (const overlay of [...editor.overlays.overlays]) if (overlay.ownerKey === props.nodeKey) editor.overlays.close(overlay.key, false); if (!editor.node(props.nodeKey)) { viewBookmarks.delete(props.nodeKey); navigationTabs.delete(props.nodeKey); } });
      const Target = (target: { documentId: string; tabKey: string }) => {
        const placement = () => resolve(target.documentId)?.placement;
        return <Show when={placement()} keyed fallback={<p role="status">Document unavailable: {target.documentId}. Its canonical source is missing or ambiguous.</p>}>{source =>
          (() => {
            const contents = () => <TransientDocumentView editor={editor} placement={source} selected={activeTab() === target.tabKey}
              onProjection={view => { liveViews.set(target.tabKey, view); setViewRevision(n => n + 1); return () => { if(liveViews.get(target.tabKey)===view) { liveViews.delete(target.tabKey); setViewRevision(n => n + 1); } }; }}
              bookmark={() => bookmarks.get(target.tabKey)} remember={value => bookmarks.set(target.tabKey, value)} />;
            return retainedSessions ? <RetainedDocumentHost ownerKey={props.nodeKey} slotKey={target.tabKey}
              placement={source} selected={activeTab() === target.tabKey} render={contents} /> : contents();
          })()
        }</Show>;
      };
      const tabId = (key: string) => navigation.tabs.get(key) ?? tabDocumentTarget(editor.node(key)?.payload.metadata);
      const canChangeTab = () => {
        if (!retainedSessions) return true;
        const owner = editor.windowManager?.ownerForNode(props.nodeKey);
        return !owner || editor.windowManager!.lifecycle.canMinimize(owner);
      };
      let tabSelectionGeneration = 0;
      const selectHostedTab = (key: string) => { if (key !== activeTab() && !canChangeTab()) return; tabSelectionGeneration++; navigation.active = navigation.tabs.has(key) ? key : undefined; setNavigationRevision(n => n+1); const r = row(); if(r && !navigation.active) editor.setViewChild(r.key,key); };
      const chooseTab = (key: string) => { selectHostedTab(key); const session=tabSession(key); if(session&&detachment?.detached(session))detachment.reveal(session); };
      const transferTab = async (key: string) => {
        const session=tabSession(key);if(!detachment||!session)return;
        try {
          const existing=detachment.forSession(session);
          if(existing){for(const menu of [...editor.overlays.overlays])if(menu.ownerKey===props.nodeKey&&menu.viewType==='context-menu')editor.overlays.close(menu.key,false);detachment.reveal(session);await detachment.returnToFlint(existing);return;}
          selectHostedTab(key);
          // Invocation-only tab menus retain the exact editor interaction.
          const menu=editor.overlays.overlays.find(o=>o.ownerKey===props.nodeKey&&(o.data as any)?.documentTab===key);
          if(menu){
            const mount=menu.returnFocusKey&&editor.mounts.get(menu.returnFocusKey);
            editor.overlays.close(menu.key,false);
            if(menu.returnElement?.isConnected)menu.returnElement.focus({preventScroll:true});
            else if(mount){mount.focus();if(menu.returnInlineSelection)mount.restoreInlineSelection?.(menu.returnInlineSelection);if(menu.returnSelection)mount.restoreSelection?.(menu.returnSelection);}
          } else editor.windowManager?.lifecycle.activate(session.host.windowId);
          await detachment.detach(session,{alive:()=>mounted&&tabKeys().includes(key), select:()=>selectHostedTab(key),
            departed:()=>{const next=tabKeys().find(k=>k!==key&&!detachedTab(k));if(next)selectHostedTab(next);},closed:()=>closeTab(key)});
        } catch(error){setTabCloseError(String(error));}
      };
      const tabKeys = createMemo(() => { navigationRevision(); return [...visibleTabs(),...navigation.tabs.keys()]; });
      const tabButtons = new Map<string, HTMLButtonElement>();
      const pendingTabCloses = new Map<string, AbortController>();
      const [tabCloseError, setTabCloseError] = createSignal("");
      const cancelTabCloses = () => { for (const controller of pendingTabCloses.values()) controller.abort(); pendingTabCloses.clear(); };
      const sessionLifetime = retainedSessions?.signal;
      sessionLifetime?.addEventListener("abort", cancelTabCloses, { once: true });
      onCleanup(() => { cancelTabCloses(); sessionLifetime?.removeEventListener("abort", cancelTabCloses); });
      const closeTab = (key: string, closed = false, previousKeys?: string[], wasActive?: boolean, mayFocus = true) => {
        if (!mounted) return;
        const detached=tabSession(key); if(!closed&&detached&&detachment?.detached(detached)){void detachment.close(detached);return;}
        if (!closed && !canChangeTab()) return;
        if (retainedSessions && !closed && !navigation.tabs.has(key)) {
          if (pendingTabCloses.has(key) || !tabKeys().includes(key)) return;
          const controller = new AbortController(), keys = tabKeys(), active = activeTab() === key;
          const generation = tabSelectionGeneration, focusCurrent = editor.windowManager?.lifecycle.ticket();
          pendingTabCloses.set(key, controller); setTabCloseError("");
          // Ordinary close is still synchronous; guarded closes are cancellable.
          const finish = () => {
            if (!mounted || controller.signal.aborted || pendingTabCloses.get(key) !== controller) return;
            const node = editor.node(key);
            if (node && editor.viewVisibility.isClosed(node.placementKey)) closeTab(key, true, keys, active && generation === tabSelectionGeneration, focusCurrent?.() !== false);
          };
          try {
            const result = editor.closeView(key, controller.signal);
            if (result instanceof Promise) void result.then(finish).catch(error => {
              if (mounted && !controller.signal.aborted) setTabCloseError(String(error));
            }).finally(() => { if (pendingTabCloses.get(key) === controller) pendingTabCloses.delete(key); });
            else { finish(); pendingTabCloses.delete(key); }
          } catch (error) { pendingTabCloses.delete(key); setTabCloseError(String(error)); }
          return;
        }
        guard(); const keys = previousKeys ?? tabKeys(); if (!keys.includes(key)) return;
        const active = wasActive ? key : activeTab(), index = keys.indexOf(key), next = keys[index + 1] ?? keys[index - 1];
        // Only the view's tab is removed; the canonical Document (including edits)
        // remains in the object bank and can be reopened from the Library.
        for (const overlay of [...editor.overlays.overlays]) if (overlay.ownerKey === props.nodeKey) editor.overlays.close(overlay.key, false);
        batch(() => {
          if (navigation.tabs.has(key)) { navigation.tabs.delete(key); if (navigation.active === key) navigation.active = undefined; setNavigationRevision(n => n + 1); }
          else if (!closed) editor.closeView(key);
          if (active === key) {
            if (next) chooseTab(next);
            else { const r = row(); if (r) editor.setViewChild(r.key, undefined); }
          }
        });
        bookmarks.delete(key);
        if (mayFocus && (active === key || !retainedSessions)) {
          editor.focus.request(props.nodeKey, { reason: "close-document-tab" });
          tabButtons.get(activeTab() ?? "")?.focus({ preventScroll: true });
        }
      };
      const openTabMenu = (key: string, event: MouseEvent | KeyboardEvent) => {
        event.preventDefault(); event.stopPropagation();
        for (const overlay of [...editor.overlays.overlays]) if (overlay.viewType === "context-menu") editor.overlays.close(overlay.key, false);
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        editor.overlays.open({ ownerKey: props.nodeKey, viewType: "context-menu", data: { documentTab: key },
          anchor: event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : { x: rect.left, y: rect.bottom } });
      };
      const tabs = () => <div class="reactive-tabs" data-tab-orientation={tabOrientation(row()?.payload.metadata, editor.features.verticalTabs)}><Show when={tabCloseError()}><p role="alert">{tabCloseError()}</p></Show><div class="reactive-tabs__labels" role="tablist" aria-orientation={tabOrientation(row()?.payload.metadata, editor.features.verticalTabs)} data-cross-text-controls={retainedSessions ? "" : undefined}><For each={tabKeys()}>{key => {
        const title = () => resolve(tabId(key) ?? '')?.title ?? String((editor.node(key)?.payload.metadata as any)?.name ?? 'Unavailable Document');
        onCleanup(() => tabButtons.delete(key));
        return <div class="flint-document-tab" role="presentation" data-active={activeTab() === key} data-native-context-menu
          onContextMenu={event => openTabMenu(key, event)}
          onKeyDown={event => { if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) openTabMenu(key, event); }}>
          <button ref={button => tabButtons.set(key, button)} type="button" role="tab" aria-selected={activeTab()===key} onClick={()=>chooseTab(key)}>{title()}<Show when={detachedTab(key)}><span class="flint-document-tab__detached" aria-label="Detached window" title="Select to activate its standalone window">↗</span></Show><Show when={native?.isDirty(tabId(key) ?? '')}><span class="flint-document-tab__dirty" role="img" aria-label="Unsaved changes" title="Unsaved changes" /></Show></button>
          <Show when={detachment}><button type="button" aria-label={`Document actions: ${title()}`} onPointerDown={e=>e.preventDefault()} onClick={event=>openTabMenu(key,event)}>⋯</button></Show>
          <button type="button" class="flint-document-tab__close" aria-label={`Close Document: ${title()}`} title={`Close ${title()}`} onClick={event => { event.stopPropagation(); closeTab(key); }}>×</button>
        </div>;
      }}</For></div><For each={tabKeys()}>{key=>{
        const [visited, setVisited] = createSignal(false);
        createEffect(() => { if (activeTab() === key) setVisited(true); });
        return <Show when={retainedSessions ? visited() : activeTab() === key}>
          <div class="reactive-tabs__panel" role="tabpanel" hidden={activeTab() !== key}
            ref={element => createEffect(() => { element.inert = activeTab() !== key; })}>
            <Show when={detachedTab(key)}><div class="flint-detached-reference">This Document is open in its own window. <button onClick={()=>detachment!.reveal(tabSession(key)!)}>Activate Document window</button></div></Show>
            <Show when={tabId(key)} keyed>{id=><Target documentId={id} tabKey={key}/>}</Show>
          </div>
        </Show>;
      }}</For></div>;
      const activeId = () => { const key = activeTab(); return key && tabId(key); };
      const recentVaultId = () => cavern?.current()?.cavernGuid ?? editor.readAssetContext().cavernId;
      if (recents) {
        // Track only tab identity, Vault identity and native binding. Typing/save-status changes do no history work.
        const opened = createMemo(() => { const id = activeId(), location = native?.location(id); return { id, location, vaultId: recentVaultId() }; }, undefined, {
          equals: (a, b) => a?.id === b.id && a?.vaultId === b.vaultId && a?.location?.folder === b.location?.folder && a?.location?.filename === b.location?.filename,
        });
        createEffect(() => { const current = opened(); untrack(() => { const doc = current.id ? resolve(current.id) : undefined; if (doc?.placement) recents.record({ id: doc.id, title: doc.title, location: current.location }, current.vaultId); }); });
      }
      const requireId = () => { const id = activeId(); if (!id || !resolve(id)) throw new Error("Select an available Document tab"); return id; };
      const openDocument = (id: string, transient = false) => {
            guard(); const doc = resolve(id), r = row(); if (!doc?.placement || !r) return;
            let target = [...r.children,...navigation.tabs.keys()].find(k => tabId(k) === id);
            if (target && editor.node(target)) editor.viewVisibility.set(editor.node(target)!.placementKey, false);
            if(!target && transient) { target = 'navigation:'+crypto.randomUUID(); navigation.tabs.set(target,id); setNavigationRevision(n=>n+1); }
            if (!target) {
              const placement = editor.commands.insert({ id: crypto.randomUUID(), type: "tab-block", metadata: { name: doc.title, documentTarget: { version: 1, documentId: id } } }, { kind: "at", parentKey: r.key, index: r.children.length });
              target = editor.nodeForPlacementInView(placement, r.viewId)?.key;
            }
            if (target) { chooseTab(target); recents?.record({ id, title: doc.title, location: native?.location(id) }, recentVaultId()); }
          };
      const [selectedVault, setSelectedVault] = createSignal<DocumentVaultLease>();
      const documentSaver=native?createDocumentSave(editor,{guard,externalPresentation,vault:async()=>{
        const selected=selectedVault();if(!selected)return undefined;
        return {root:selected.root,check:()=>{if(selectedVault()!==selected||!selected.isAlive())throw Error('The active Vault changed before Save. Try again in the intended Vault.');},run:(action,first)=>selected.mutate(action,first)};
      }}):undefined;
      onCleanup(registerDocumentApplicationNavigation(editor, props.nodeKey, id => openDocument(id)));
      let opening = 0, openQuery: AbortController | undefined;
      onCleanup(() => { opening++; openQuery?.abort(); selectedVault()?.release(); if (!editor.node(props.nodeKey)) vaultRoots.delete(props.nodeKey); });
      const lease = () => { guard(); const value = selectedVault(); if (!value) throw new Error('Open a vault first'); return value; };
      const tagsOf = (id: string) => {
        const doc = resolve(id), meta = doc && editor.repository.state.contents[doc.contentKey].payload.metadata as any;
        const value = meta?.tags;
        return value === undefined ? [] : Array.isArray(value) && value.every(t => typeof t === 'string') ? value as string[] : undefined;
      };
      // Identity, metadata and location evidence change independently of typing.
      // In particular, never rescan the vault listing for a save-status update.
      const documentDetails = createMemo(() => {
        revision(); const id = activeId(), doc = id && resolve(id); if (!doc || !id) return;
        const meta = editor.repository.state.contents[doc.contentKey].payload.metadata;
        const bound = native?.location(id), v = selectedVault(), scan = v?.listing();
        const missing = !!bound && !!v && !native?.compatibleSource(id) && vaultContains(v.root, vaultPath(bound)) && !scan!.documents.some(d => d.resourceId === id && vaultPath(d.location) === vaultPath(bound));
        return { id, title: doc.title, tags: tagsOf(id) ?? [], tagsValid: tagsOf(id) !== undefined,
          format: native?.compatibleSource(id)?.format ?? readDocumentFormat(meta)?.format ?? 'Native', location: native?.location(id),
          locationWarning: missing ? scan!.complete ? 'Location missing or moved; explicit reconciliation required. ' : 'Location unverified; vault discovery is incomplete. ' : '' };
      });
      const documentStatus = createMemo(() => native?.status(activeId()) ?? 'Native persistence unavailable');
      const candidate = createMemo(() => native?.isCandidate(activeId() ?? '') ?? false);
      const properties = createMemo(() => {
        const details = documentDetails(); if (!details) return;
        const { locationWarning, ...attributes } = details;
        return { ...attributes, status: locationWarning + documentStatus(), unsaved: candidate() };
      });
      const destinationIn = (v: DocumentVaultLease, destination: VaultLocation) => {
        v.requireDirectory(destination.folder); vaultLeaf(destination.filename);
        if (!isNativeDocumentName(destination.filename)) throw new Error('Choose a .ink or .mutable.json filename');
      };
      const vaultState = createMemo<ReturnType<ApplicationVault['state']>>(function deriveVaultState(previous) {
        revision(); const v = selectedVault(); if (!v || !native) return;
        const scan = v.listing();
        // Presentation identity only: retain equal rows across equivalent discovery,
        // binding/status and repository publications. Never reuse storage evidence.
        const previousRows = new Map(previous?.documents.map(d => [vaultPath(d.location), d]));
        return { root: v.root, folders: scan.folders, markdown: scan.markdown.filter(p => !scan.documents.some(d => markdownProjectionName(vaultPath(d.location)) === p)), readOnly: scan.readOnly, complete: scan.complete,
          busy: v.busy(), checking: v.checking(), cached: !!scan.cached, notice: v.notice(), operations: v.operations(), documentSaves:scan.documentSaves, candidates: [...(scan.other??[]),...scan.markdown],
          diagnostics: scan.diagnostics.map(d => `${d.path ?? d.resourceId ?? ''}: ${d.message}`),
          documents: scan.documents.map(d => {
            const bound = native.location(d.resourceId), loaded = !!resolve(d.resourceId) && !!bound && vaultPath(bound) === vaultPath(d.location) && d.state !== 'ambiguous';
            const row = { id: d.resourceId, location: d.location, state: d.state, loaded, title: loaded ? resolve(d.resourceId)!.title : d.title || d.location.filename,
              tags: loaded ? tagsOf(d.resourceId) ?? [] : [] };
            const old = previousRows.get(vaultPath(row.location));
            return old && old.id === row.id && old.state === row.state && old.loaded === row.loaded && old.title === row.title && old.tags.length === row.tags.length && old.tags.every((tag, i) => tag === row.tags[i]) ? old : row;
          }) };
      });
      const [choosingVault,setChoosingVault]=createSignal(false),[chooserBusy,setChooserBusy]=createSignal(false),[chooserError,setChooserError]=createSignal('');
      const [vaultLoading,setVaultLoading]=createSignal(false),[vaultError,setVaultError]=createSignal('');
      let requestedVault: string | undefined;
      const vault: ApplicationVault | undefined = native && vaults ? {
        documentFormats: editor.features.documentFormats ? documentFormats : undefined,
        state: vaultState,
        loading: vaultLoading,
        error: vaultError,
        async retry() {
          guard(); const request = opening;
          setVaultError('');
          let root: string | undefined;
          try { root = cavern ? '.' : requestedVault ?? vaultRoots.get(props.nodeKey) ?? await native.defaultVault(); }
          catch (error) { if (mounted && request === opening) { setVaultError(String(error)); setVaultLoading(false); } throw error; }
          if (!mounted || request !== opening) return;
          if (root) await vault!.open(root); else setVaultLoading(false);
        },
        choose() { guard(); if (cavern) { cavern.choose('open'); return; } setChooserError(''); setChoosingVault(true); },
        async open(root) {
          if (cavern && root !== '.') throw new Error('Use the current Cavern. Open another Cavern from the Mutable system control.');
          guard(); openQuery?.abort(); openQuery = new AbortController();
          const request = ++opening; requestedVault = root; setVaultLoading(true); setVaultError('');
          try {
            const next = await vaults.acquire(root, openQuery.signal);
            if (!mounted || request !== opening) { next.release(); return; }
            vaultRoots.set(props.nodeKey, next.root);
            const previous = selectedVault(); setSelectedVault(next); previous?.release();
          } catch (error) {
            if (mounted && request === opening) setVaultError(String(error));
            throw error;
          } finally { if (mounted && request === opening) setVaultLoading(false); }
        },
        close() { guard(); opening++; openQuery?.abort(); setVaultLoading(false); setVaultError(''); requestedVault = undefined; const previous = selectedVault(); setSelectedVault(undefined); vaultRoots.delete(props.nodeKey); previous?.release(); },
        async refresh() { await lease().refreshListing(true); },
        verify: editor.features.vaultDiscoveryCache ? async () => { await lease().refreshListing(true,true); } : undefined,
        async openFile(location) { const v = lease(); v.requireListedFile(location); const id = await native.open(location); if (mounted && selectedVault() === v) openDocument(id); },
        async openCandidate(location) {
          const v=lease();v.requireDirectory(location.folder);vaultLeaf(location.filename);
          if(![...(v.listing().other??[]),...v.listing().markdown].includes(vaultPath(location)))throw Error('File is no longer in this vault; Refresh first');
          const id=await native.openCompatible(location,v.root);if(mounted&&selectedVault()===v)openDocument(id);
        },
        async createDocument(folder, filename, title, format = 'page') {
          if (!editor.features.documentFormats && format !== 'page') throw new Error('Document formats are disabled.');
          const v = lease(), destination = {folder, filename}; destinationIn(v, destination);
          await v.mutate(async () => {
            guard();
            const {document} = createFormattedDocument(format);
            const {folder: _folder, filename: _filename, ...metadata} = document.metadata as Record<string, unknown>;
            document.metadata = {...metadata, title: title.trim() || 'Untitled', tags: []};
            const state = editor.repository.readState(), root = state.rootPlacementKey;
            const banks = state.contents[state.placements[root].contentKey].children.filter(k => state.contents[state.placements[k].contentKey].viewType === 'workspace-object-bank-block');
            if (banks.length !== 1) throw new Error('Canonical object bank missing or ambiguous');
            editor.commands.insert(document, {kind: 'at', parentKey: banks[0], index: editor.commands.childrenOf(banks[0]).length});
            const id = String(metadata.documentId); native.trackCandidate(id); openDocument(id);
            await native.save(id, destination);
          });
        },
        async importMarkdown(source, destination) {
          const v = lease(); destinationIn(v, destination);
          if (isDerivedMarkdownName(source.filename)) throw new Error('Open the .ink Document; .ink.md is a derived projection');
          if (!v.listing().markdown.includes(vaultPath(source))) throw new Error('Choose a discovered standalone Markdown file');
          if (markdownProjectionName(vaultPath(destination)) === vaultPath(source)) throw new Error('Choose a new destination to preserve the imported Markdown source');
          await v.mutate(async () => { const id = await native.open(source, true); if (mounted) openDocument(id); await native.save(id, destination); });
        },
        async createDirectory(parent, name) { const v = lease(); v.requireDirectory(parent); vaultLeaf(name); await v.mutate(() => native.createVaultDirectory(v.root, parent === '.' ? name : `${parent}/${name}`)); },
        async relocateDocument(source, destination) { const v = lease(); v.requireListedFile(source); destinationIn(v, destination); await v.relocate('pair', vaultPath(source), vaultPath(destination)); },
        async relocateDirectory(source, destination) {
          const v = lease(); v.requireDirectory(source);
          const parts = destination.split('/'), name = parts.pop()!; vaultLeaf(name); v.requireDirectory(parts.join('/') || '.');
          if (source === v.root || vaultContains(source, destination)) throw new Error('Cannot move the vault root or a directory inside itself');
          await v.relocate('directory', source, destination);
        },
        async recoverDocumentSave(resourceId,generation){const v=lease();await v.mutate(()=>native.recoverRecognized(v.root,resourceId,generation));},
        async recoverOperation(id) { const v = lease(); if (!v.operations().some(o => o.operationId === id && o.phase === 'pending')) throw new Error('Refresh to find a pending operation'); await v.recover(id); },
        async recoverNative(location) { const v = lease(); await v.refresh(); const row = v.requireFile(location); await v.mutate(() => native.recover(row.resourceId, location)); },
      } : undefined;
      const activation = native ? new SavedResultActivation(editor,native,lease,guard) : undefined;
      onCleanup(()=>activation?.dispose());
      const knowledgeHost: KnowledgeHost = {
        vault: lease, guard,
        active: () => { const key = activeTab(), documentId = activeId(), projection = key && liveViews.get(key); return documentId && projection ? {documentId, projection} : undefined; },
        async activateSaved(target,passage,evidence,current,query) {
          const focusCurrent=editor.windowManager?.lifecycle.ticket(),sourceCurrent=current;
          current=()=>sourceCurrent()&&focusCurrent?.()!==false;
          const ticket=await activation!.prepare(evidence,current);
          const live=await observeLive(editor.repository,target.documentId,{version:1,opaqueTypes:editor.registry.typesWithCapability('opaque-widget')},{check:()=>{if(!ticket.current())throw Error('Selected activation expired');}});
          if(live.facts.id!==target.documentId||live.facts.rootBlockId!==evidence.rootBlockId||target.blockId!==evidence.rootBlockId)throw Error('Selected root identity changed');
          const block=passage&&live.facts.blocks.filter(b=>b.id===passage.blockId);
          const source=passage?block?.length===1&&block[0].text:{coordinate:'utf16' as const,runs:[{text:live.facts.title}]};
          if(!source||passage&&source.coordinate!==passage.coordinate)throw Error('Selected passage missing or unsupported');
          const matches=await runSearchWorker([{...source,contentKey:'selected',version:0}],query,{});
          if(!matches[0]?.matches.some(m=>m.actionable&&(!passage||m.start===passage.start&&m.end===passage.end))||!ticket.current())throw Error('Selected passage changed');
          await knowledgeHost.navigate(target,passage,ticket.current,ticket.verify);
        },
        async navigate(target, passage, current, verify) {
          let focusCurrent=editor.windowManager?.lifecycle.ticket();const sourceCurrent=current;
          current=()=>sourceCurrent()&&focusCurrent?.()!==false;
          guard(); if(!current()) throw new Error('Navigation is stale');
          // Resolve only this application instance's occurrence, never a global first match.
          openDocument(target.documentId, true);
          focusCurrent=editor.windowManager?.lifecycle.ticket();
          await new Promise(resolve=>setTimeout(resolve,0));
          await verify?.();
          guard(); if(!current()||activeId()!==target.documentId) throw new Error('Navigation was superseded');
          const view=liveViews.get(activeTab()!); if(!view) throw new Error('Document occurrence is unavailable');
          const nodes=Object.values(view.state.nodes);
          const candidates=passage?nodes.filter(n=>(passage.contentKey===undefined||n.contentKey===passage.contentKey)&&n.payload.id===passage.blockId&&editor.blockQueries.ancestorPath(n.key).filter(a=>a.viewType==='document-block').at(-1)?.key===view.state.rootKey):nodes.filter(n=>n.payload.id===target.blockId);
          if(candidates.length!==1)throw new Error('Block identity is missing or ambiguous in this occurrence');
          const node=passage?candidates[0]:nodes.find(n=>['standoff-editor-block','text-block','plain-text-block'].includes(n.viewType)&&editor.blockQueries.ancestorPath(n.key).filter(a=>a.viewType==='document-block').at(-1)?.key===view.state.rootKey)??candidates[0];
          const range={nodeKey:node.key,contentKey:node.contentKey,placementKey:node.placementKey,version:editor.repository.state.contents[node.contentKey].inlineRevision,start:passage?.start??0,end:passage?.end??0,coordinate:passage?.coordinate??'cell' as const};
          const stillCurrent=()=>mounted&&current()&&liveViews.get(activeTab()!)===view&&activeId()===target.documentId;
          const revealed=await revealMatch(editor,{id:'flint-navigation',text:'',context:'',captures:[],ranges:[range],path:editor.blockQueries.ancestorPath(node.key).map(n=>n.key),breadcrumb:'',capabilities:{highlight:false,reveal:true,annotate:false,replace:false}},stillCurrent);
          await verify?.();
          if(!revealed||!stillCurrent())throw new Error('Passage is stale or cannot currently be revealed');
          editor.focus.request(node.key,{reason:'flint-navigation'});
          const mount=editor.mounts.get(node.key);
          if(range.coordinate==='cell'&&mount?.restoreInlineSelection){mount.restoreInlineSelection({anchor:range.start,head:range.end});editor.selections.setPrimary(node.key,node.contentKey,node.viewId,range.start,range.end);}
          else if(mount?.restoreSelection)mount.restoreSelection({start:range.start,end:range.end,direction:'forward'});
        },
      };
      const facts = factsHost ? new FactsQueryProvider(factsHost) : undefined;
      onCleanup(registerEntityContext(editor,{vault:lease,facts,listingVault:async()=>{
        const root=selectedVault()?.root ?? (cavern ? '.' : vaultRoots.get(props.nodeKey) ?? await native?.defaultVault());
        if(!mounted || !root) throw Error('Open a Vault to resolve Entity names.');
        return root;
      },accepts:key=>{const node=editor.node(key);return !!node&&[...liveViews.values()].some(view=>view.viewId===node.viewId);}}));
      createEffect(() => { const vault=selectedVault(); untrack(() => facts?.use(vault)); });
      const knowledge = native ? new VaultKnowledge(editor, native, knowledgeHost, undefined, facts) : undefined;
      if(knowledge)onCleanup(registerCompletionDocuments(editor,{knowledge,accepts:key=>{const active=knowledgeHost.active();return !!active?.projection.node(key);}}));
      const entityList = new DocumentEntityList(entityAnnotations);
      const entityOrigin = createMemo(() => {
        viewRevision();
        const key = activeTab();
        return key ? liveViews.get(key)?.state.rootKey : undefined;
      });
      createEffect(() => {
        const key = entityOrigin();
        untrack(() => { if (key) entityList.open(key, true); else entityList.close(false); });
      });
      onCleanup(() => entityList.dispose());
      const EntityBacklinks = () => {
        const list = entityList, origin = entityOrigin;
        onCleanup(() => list.clearPreview());
        return <section class="flint-backlinks flint-entity-list" aria-label="Document backlinks">
          <header><h2>Backlinks</h2><button type="button" aria-label="Refresh backlinks" disabled={!origin() || list.state.pending} onClick={() => list.refreshSummaries()}>Refresh</button></header>
          <Show when={origin()} fallback={<p>Open a Document to see its entity references.</p>}><EntityListContents list={list}/></Show>
        </section>;
      };
      onCleanup(()=>{ knowledge?.dispose(); facts?.dispose(); });
      onMount(() => { if(vault)void vault.retry!().catch(()=>{ /* The Library displays the error and offers Retry. */ }); });
      const files = native ? {
        list: (folder: string) => { selectedVault()?.requireDirectory(folder); return native.list(folder); },
        async open(location: {folder: string; filename: string}, importMarkdown = false) {
          guard(); const v = selectedVault();
          if (v) { if (importMarkdown) throw new Error('Use the vault import controls to choose a fresh destination'); v.requireListedFile(location); }
          const id = await native.open(location, importMarkdown); guard();
          openDocument(id);
        },
        async save(location?: VaultLocation) {
          guard();await documentSaver!.save(requireId(),location);
        },
        async recover(location: {folder: string; filename: string}) { guard(); if(native.compatibleSource(activeId()??''))await native.recover(activeId(),location);else if (selectedVault()) await vault!.recoverNative(location); else await native.recover(activeId(), location); },
        compare() { guard(); return native.compare(requireId()); },
        async keepMutable() { guard(); await native.keepMutable(requireId()); },
        status: () => native.status(activeId()), location: () => native.location(activeId()),
      } : undefined;
      let dropIndicator: HTMLElement | undefined;
      const clearDrop = () => { if(dropIndicator) {delete dropIndicator.dataset.interchangeDrop;dropIndicator=undefined;} };
      onCleanup(() => {clearDrop();queueMicrotask(()=>editor.interchange.cancelUnavailable());});
      const [collectionMode,setCollectionMode]=createSignal<'import'|'export'>();
      const [publication,setPublication]=createSignal<{initial?:{folder:string;filename:string}}>();
      const interchange = editor.features.documentInterchange ? {
        importCollection() {guard();setCollectionMode('import');},
        exportCollection() {guard();setCollectionMode('export');},
        importPackage() {guard();editor.interchange.pickPackage({current:()=>mounted&&scope.active(),open:openDocument});},
        exportPortable(format:'html'|'markdown',standalone=false) {guard();const id=requireId();void editor.interchange.exportPortable(id,format,standalone,()=>mounted&&scope.active()&&activeId()===id);},
        exportPackage() {guard();const id=requireId();void editor.interchange.exportPackage(id,selectedVault()?.root,()=>mounted&&scope.active()&&activeId()===id);},
        inspectPackage() {guard();const id=requireId();void editor.interchange.inspectPackage(id,()=>mounted&&scope.active()&&activeId()===id);},
        downloadViewer() {guard();const a=document.createElement('a');a.href='/ink-viewer.html';a.download='Ink Viewer.html';a.click();},
        importFiles() {guard();editor.interchange.pickNew({current:()=>mounted&&scope.active(),open:openDocument});},
        exportDocument(format:'html'|'markdown'|'text') {guard();const id=requireId();void editor.interchange.exportDocument(id,format,()=>mounted&&scope.active()&&activeId()===id);},
        suggestedFilename() {const id=activeId(),doc=id&&resolve(id);return doc ? (editor.repository.readState().contents[doc.contentKey].payload.metadata as any)?.interchange?.suggestedFilename : undefined;},
        clearDrop,
        drag(event:DragEvent,drop=false) {
          if(hasInternalBlockDrag(editor))return;
          if(!Array.from(event.dataTransfer?.items??[]).some(i=>i.kind==='file')&&!event.dataTransfer?.files.length)return;
          const target=event.target instanceof Element?event.target:undefined;
          const library=!!target?.closest('.flint-application__vault');
          const resolved=editor.mounts.resolveElement(target??null),node=resolved&&editor.node(resolved.nodeKey),view=liveViews.get(activeTab()??'');
          if(!library&&(!node||!view||node.viewId!==view.viewId||node.viewType!=='standoff-editor-block'))return;
          event.preventDefault();event.stopPropagation();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';
          clearDrop();if(!drop){dropIndicator=library?target!.closest<HTMLElement>('.flint-application__vault')!:resolved!.handle.root as HTMLElement;dropIndicator!.dataset.interchangeDrop=library?'Import as new Ink documents':'Insert files after this Block';return;}
          const files=Array.from(event.dataTransfer?.files??[]).map(blob=>({blob,name:blob.name}));
          if(library)void editor.interchange.importNew(files,{current:()=>mounted&&scope.active(),open:openDocument});
          else {const id=activeId();void editor.interchange.dropFiles(files,node!.key,()=>mounted&&scope.active()&&activeId()===id);}
        },
      } : undefined;
      const application: import('../feature-api/document-application').DocumentApplicationInstance = {
          documents: () => documents().map(({ id, title }) => ({ id, title })), tabs, files, vault, properties, knowledge, interchange, entityBacklinks: EntityBacklinks,
          recentDocuments: recents ? {
            items: () => recents.items(recentVaultId()).map(d => ({ ...d, title: resolve(d.id)?.title ?? d.title, location: native?.location(d.id) ?? d.location })),
            remove(id) { guard(); recents.remove(id, recentVaultId()); },
            async open(id) {
              guard();
              if (!recents.items(recentVaultId()).some(d => d.id === id)) throw Error('This Document is no longer in the recent list.');
              if (resolve(id)?.placement) { openDocument(id); return; }
              const v = lease(), matches = v.listing().documents.filter(d => d.resourceId === id);
              if (matches.length !== 1) throw Error('Document missing or ambiguous in this Vault. Refresh the Library to locate it.');
              // Stored paths are display hints, never filesystem authority. Resolve current identity through the existing Vault opener.
              await vault!.openFile(matches[0].location);
            },
          } : undefined,
          publish:editor.features.webPublishing&&editor.features.applicationServices?()=>{guard();setPublication({initial:native?.location(activeId())});}:undefined,
          entities: {
            rows: () => entityList.state.rows,
            pending: () => entityList.state.pending,
            refresh: () => entityList.refreshSummaries(),
            focus: id => { entityList.clearConcertina(); entityList.focusOccurrences(id); },
          },
          setProperties(id, value) {
            guard(); const doc = resolve(id); if (!doc?.placement) throw new Error('Document unavailable');
            if (tagsOf(id) === undefined) throw new Error('Existing tags payload is incompatible; it has been preserved');
            const tags = [...new Set(value.tags.map(t => t.trim()).filter(Boolean))];
            if (tags.length > 32 || tags.some(t => t.length > 64 || /[\r\n]/.test(t))) throw new Error('Use at most 32 tags, each at most 64 characters on one line');
            if (!value.title.trim()) throw new Error('Title must not be empty');
            const metadata = editor.repository.readState().contents[doc.contentKey].payload.metadata as object;
            editor.commands.setPayloadField(doc.placement, 'metadata', {...metadata, title: value.title.trim(), tags}, 'Edit Document properties');
          },
          openDocument,
          renameDocument(id: string, title: string) {
            guard(); const doc = resolve(id); if (!doc?.placement || !title.trim()) return;
            const content = editor.repository.readState().contents[doc.contentKey];
            editor.commands.setPayloadField(doc.placement, "metadata", { ...(content.payload.metadata as object), title: title.trim() }, "Rename Document");
          },
          closeActiveTab() { const key = activeTab(); if (key) closeTab(key); },
        };
      if(editor.features.textualWorkspace && retainedSessions) {
        onMount(()=>onCleanup(documentApplicationPorts(editor).register({
          key:props.nodeKey,application,windowId:()=>editor.windowManager?.ownerForNode(props.nodeKey),
          tabs:()=>tabKeys().map(key=>({key,documentId:tabId(key),title:resolve(tabId(key)??'')?.title??'Unavailable Document',dirty:!!native?.isDirty(tabId(key)??'')})),
          activeTab,selectTab:chooseTab,presented:setExternalPresentation,
          session:()=>{retainedSessions.transfers.observe();return retainedSessions.sessions().find(s=>s.host.ownerKey===props.nodeKey&&s.host.slotKey===activeTab());},
          prompt:()=>documentSaver?.prompt(),
        })));
      }
      return <>{documentSaver && <documentSaver.Dialogs/>}<Show when={publication()}>{p=><PublicationDialog editor={editor} initial={p().initial} close={()=>setPublication(undefined)}/>}</Show><Show when={collectionMode()}>{mode=><CollectionDialog editor={editor} vault={selectedVault()?.root??'.'} current={()=>mounted&&scope.active()} mode={mode()} close={()=>setCollectionMode(undefined)}/>}</Show><Show when={choosingVault()}><DocumentBrowser mode="directory" initialLocation={{folder:selectedVault()?.root??'.',filename:''}} busy={chooserBusy()} error={chooserError()} onClose={()=>setChoosingVault(false)} onChoose={async location=>{setChooserBusy(true);setChooserError('');try{await vault!.open(location.folder);if(mounted)setChoosingVault(false);return true;}catch(e){if(mounted)setChooserError(String(e));return false;}finally{if(mounted)setChooserBusy(false);}}}/></Show><div ref={root} tabIndex={-1} data-block-type={definition.type} data-runtime-key={props.nodeKey}>
        <Dynamic component={definition.view} initialView={initialView} application={application} />
      </div></>;
    };
    scope.own(editor.registry.register({ type: definition.type, capabilities: ["container"], view: props => <Show when={scope.active()}><Instance nodeKey={props.nodeKey} /></Show> }, scope.owner));
    scope.own(editor.commandRegistry.register({ id: "flint.open", label: "Open Flint", canExecute: () => editor.repository.state.contents[editor.repository.state.placements[editor.repository.state.rootPlacementKey].contentKey].viewType === "workspace-block", execute({ args }) {
      requireActive();
      const root = editor.repository.state.rootPlacementKey;
      const existing = catalog();
      const examples: ExistingBlockDto[] = existing.length ? [] : ["Notes", "Ideas"].map(title => { const id = crypto.randomUUID(); return { id, type: "document-block", metadata: { documentId: id, title, folder: ".", filename: `${id}.json` }, children: [{ id: crypto.randomUUID(), type: "standoff-editor-block", text: `${title} — write here.` }, { id: crypto.randomUUID(), type: "standoff-editor-block", text: "An ordinary Codex Document, shared across its views." }] }; });
      const initialTabs = existing.length ? existing.map(d => ({ id: d.id, title: d.title })) : examples.map(d => ({ id: (d.metadata as any).documentId as string, title: (d.metadata as any).title as string }));
      const state = editor.repository.readState(), rootContent = state.contents[state.placements[root].contentKey];
      const banks = rootContent.children.filter(key => state.contents[state.placements[key].contentKey].viewType === "workspace-object-bank-block");
      if (banks.length > 1) throw new Error("Ambiguous workspace object bank.");
      const desktopParent = rootContent.children.find(key => ["image-background-block", "video-background-block", "youtube-video-background-block", "canvas-background-block"].includes(state.contents[state.placements[key].contentKey].viewType)) ?? root;
      const zIndex = editor.windowManager?.launchMetadata().zIndex ?? Math.max(0, ...Object.values(state.contents).filter(c => ["window-block", "document-window-block"].includes(c.viewType)).map(c => Number((c.payload.metadata as any)?.zIndex) || 0)) + 1;
      const application = definition.create(initialTabs.slice(0, 2));
      if ((args as { view?: string } | undefined)?.view === 'graph' && editor.features.flintSpatialGraph) launchViews.set(String(application.id), 'graph');
      try { editor.commands.transaction("Open Flint", () => {
        const bank = banks[0] ?? editor.commands.insert({ id: crypto.randomUUID(), type: "workspace-object-bank-block", children: [] }, { kind: "at", parentKey: root, index: editor.commands.childrenOf(root).length });
        for (const document of examples) editor.commands.insert(document, { kind: "at", parentKey: bank, index: editor.commands.childrenOf(bank).length });
        const placement = editor.commands.insert({ id: crypto.randomUUID(), type: "window-block", metadata: { title: "Flint", position: { x: 35 + (zIndex - 1) * 24, y: 35 + (zIndex - 1) * 24 }, size: { w: Math.min(1380, Math.max(840, window.innerWidth - 90)), h: Math.min(900, Math.max(620, window.innerHeight - 120)) }, zIndex }, children: [application] }, { kind: "at", parentKey: desktopParent, index: 0 });
        editor.windowManager?.activatePlacement(placement);
      }); } finally { launchViews.delete(String(application.id)); }
    } }, scope.owner));
  } };
}
