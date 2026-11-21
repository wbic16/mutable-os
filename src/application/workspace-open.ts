import { createFormattedDocument, documentFormatPresentation, type DocumentFormat } from "../features/document-formats/model";
import { batch } from "solid-js";
import { unwrap } from "solid-js/store";
import type { ExistingBlockDto, PlacementKey } from "../block-tree/types";
import { isHistoryDocument } from "../history/durable-core";
import { PersistenceService, type DocumentLocation } from "../reactive-editor/persistence";
import { documentIdentity, validateDocumentSource, workspaceContentHash, workspaceDocumentContentKeys } from "../reactive-editor/workspace-manifest";
import { validateWorkspacePresentation } from "../reactive-editor/workspace-presentation";
import type { WorkspaceSession } from "./workspace-session";
import { isNativeDocumentName } from "../persistence/document-file-names.mjs";
import { nativeDocumentSession } from "../persistence/native-session";
import { documentRootPlacements } from "../block-tree/resource-registration";
import { selectApplicationDocument } from './document-application-navigation';
import { phosphorWindowPresentation } from './phosphor';

/** Explicit Open actions add to the current session; they never reload its tree. */
export function workspaceOpen(session: WorkspaceSession) {
  const { editor, projection, presentation } = session;
  const root = projection.state.rootKey;
  const desktopParent = () => projection.state.nodes[root].children.find(key =>
    ["image-background-block", "video-background-block", "youtube-video-background-block", "canvas-background-block"].includes(editor.node(key)?.viewType ?? "")) ?? root;
  const windows = () => Object.values(projection.state.nodes).filter(n => ["document-window-block", "window-block"].includes(n.viewType));
  const geometry = (document: boolean) => ({
    position: { x: 24 + (editor.windowManager?.count() ?? windows().length) % 8 * 28, y: 24 + (editor.windowManager?.count() ?? windows().length) % 8 * 28 },
    size: document ? { w: 840, h: 620 } : { w: 480, h: 320 }, state: "normal", zIndex: editor.windowManager?.launchMetadata().zIndex ?? Math.max(0, ...windows().map(n => Number((n.payload.metadata as any)?.zIndex) || 0)) + 1,
  });
  const insert = (content: ExistingBlockDto, title: string, presentationDefaults?: { size: { w: number; h: number }; windowType: string }, reference?: PlacementKey): PlacementKey => {
    const id = crypto.randomUUID(), isDocument = ["document-block", "main-list-block", "membrane-block"].includes(content.type!);
    const phosphor = editor.features.phosphor && content.children?.some(child => child.type === 'phosphor-screen-block');
    const defaults = presentationDefaults ?? (phosphor ? phosphorWindowPresentation : editor.features.documentFormats ? documentFormatPresentation(content.metadata) : undefined);
    const metadata = { title, ...geometry(isDocument), ...(defaults ? { size: defaults.size } : {}) };
    const window: ExistingBlockDto = { id, type: defaults?.windowType ?? (isDocument ? "document-window-block" : "window-block"), metadata, children: reference ? [] : [content] };
    const value = presentation.read(), canvas = presentation.active() === "canvas" ? value?.presentations.canvas : undefined;
    const objectId = `block:${id}`;
    const spatial = presentation.active() === "spatial";
    const spatialCommit = spatial ? session.spatial!.prepareObject({ id: objectId, label: title, target: { kind: "block", blockId: id } }, isDocument ? "document" : "image") : undefined;
    const banked = !!canvas || spatial;
    const objects = canvas ? [...value!.objects, { id: objectId, label: title, target: { kind: "block" as const, blockId: id } }] : undefined;
    const next = canvas ? { ...canvas, placements: [...canvas.placements, { id: `canvas:${objectId}`, objectId, order: canvas.placements.length,
      bounds: { x: canvas.camera.x + 60 / canvas.camera.zoom, y: canvas.camera.y + 100 / canvas.camera.zoom, width: metadata.size.w, height: metadata.size.h } }] } : undefined;
    if (next) validateWorkspacePresentation({ ...value!, objects: objects!, presentations: { ...value!.presentations, canvas: next } });
    const banks = projection.state.nodes[root].children.filter(key => editor.node(key)?.viewType === "workspace-object-bank-block");
    if (banked && banks.length > 1) throw new Error("Ambiguous workspace object bank.");
    let placement!: PlacementKey;
    batch(() => {
      editor.commands.transaction("Open workspace object", () => {
        const parent = banked ? banks[0] ?? editor.commands.insert({ id: crypto.randomUUID(), type: "workspace-object-bank-block", children: [] }, { kind: "at", parentKey: root, index: editor.commands.childrenOf(root).length }) : desktopParent();
        placement = editor.commands.insert(window, { kind: "at", parentKey: parent, index: banked ? editor.commands.childrenOf(parent).length : 0 });
        if (reference) editor.commands.transclude(reference, { kind: "at", parentKey: placement, index: 0 });
      });
      if (next) presentation.updateCanvas(next, objects);
      spatialCommit?.();
    });
    if (!banked) editor.windowManager?.activatePlacement(placement);
    return placement;
  };
  const documents = () => workspaceDocumentContentKeys(editor.repository.state).map(key => editor.repository.state.contents[key]);
  const sourceOf = (content: ReturnType<typeof documents>[number]) => {
    const meta = (content.payload.metadata ?? {}) as Record<string, any>;
    return nativeDocumentSession(editor).location(String(meta.documentId ?? content.payload.id)) ?? editor.persistence.workspaceReference(String(meta.documentId ?? content.payload.id))?.source ?? meta;
  };
  const matching = (location: DocumentLocation, id?: string) => {
    const matches = documents().filter(c => {
      const meta = (c.payload.metadata ?? {}) as Record<string, any>, source = sourceOf(c);
      return source.folder === location.folder && source.filename === location.filename || !!id && (meta.documentId ?? c.payload.id) === id;
    });
    if (matches.length > 1) throw new Error("More than one live Document matches this file. Resolve its identity before opening it again.");
    const match = matches[0];
    if (match) {
      const source = sourceOf(match);
      if (source.folder !== location.folder || source.filename !== location.filename) throw new Error("This Document identity is already open from a different server file.");
    }
    return match;
  };
  const reveal = (contentKey: string): PlacementKey => {
    const node = Object.values(projection.state.nodes).find(n => n.contentKey === contentKey && editor.blockQueries.ancestors(n.key).some(a => ["document-window-block", "window-block"].includes(a.viewType)));
    const host = node && editor.blockQueries.ancestors(node.key).find(n => ["document-window-block", "window-block"].includes(n.viewType));
    if (!host) throw new Error("This Document is already in the workspace without a Window. Open it through its existing owner.");
    editor.viewVisibility.set(host.placementKey, false);
    if (presentation.active() === "spatial") {
      const id = host.payload.id;
      if (typeof id !== "string" || !id.trim()) throw new Error("The existing Window has no stable identity.");
      const matches = presentation.read()!.objects.filter(o => o.desktopHostBlockId === id || o.target.kind === "block" && o.target.blockId === id);
      if (matches.length > 1) throw new Error("The existing Window has ambiguous directory ownership.");
      const object = matches[0] ?? { id: `block:${encodeURIComponent(id)}`, label: String((host.payload.metadata as any)?.title ?? "Document"), target: { kind: "block" as const, blockId: id } };
      session.spatial!.prepareObject(object, "document")();
    } else if (presentation.active() === "canvas") {
      const value = presentation.read()!, layout = value.presentations.canvas!;
      const id = host.payload.id;
      if (typeof id !== "string" || !id.trim()) throw new Error("The existing Document Window has no stable identity.");
      const object = value.objects.find(o => o.target.kind === "block" && o.target.blockId === id) ?? { id: `block:${encodeURIComponent(id)}`, label: String((host.payload.metadata as any)?.title ?? "Document"), target: { kind: "block" as const, blockId: id } };
      if (value.objects.some(o => o.id === object.id && o !== object)) throw new Error("The Document Window has a conflicting directory identity.");
      const existing = layout.placements.find(p => p.objectId === object.id);
      const size = (host.payload.metadata as any)?.size;
      const bounds = existing?.bounds ?? { x: layout.camera.x + 60 / layout.camera.zoom, y: layout.camera.y + 100 / layout.camera.zoom, width: Number(size?.w) || 840, height: Number(size?.h) || 620 };
      const next = { ...layout, camera: { ...layout.camera, x: bounds.x - 60 / layout.camera.zoom, y: bounds.y - 100 / layout.camera.zoom },
        placements: existing ? layout.placements : [...layout.placements, { id: `canvas:${object.id}`, objectId: object.id, order: layout.placements.length, bounds }] };
      presentation.updateCanvas(next, value.objects.includes(object) ? value.objects : [...value.objects, object]);
    } else {
      const parent = editor.blockQueries.ancestors(host.key)[1];
      const metadata = { ...structuredClone(unwrap(host.payload.metadata ?? {}) as object), state: "normal", ...(editor.windowManager ? {} : { zIndex: geometry(true).zIndex }) };
      editor.commands.transaction("Reveal open Document", () => {
        if (parent?.viewType === "workspace-object-bank-block") editor.commands.move(host.placementKey, { kind: "at", parentKey: desktopParent(), index: 0 });
        editor.commands.setPayloadField(host.placementKey, "metadata", metadata);
      });
    }
    if (presentation.active() === "desktop") editor.windowManager?.activatePlacement(host.placementKey);
    return host.placementKey;
  };
  const flintInstances = () => Object.values(projection.state.nodes).filter(n => n.viewType === 'flint-application-block' && editor.blockQueries.ancestors(n.key).some(a => a.viewType === 'window-block'));
  const presentDocument = (contentKey: string, id: string, title: string) => {
    const state = editor.repository.readState(), content = state.contents[contentKey];
    // Screens use their own application even when Flint is open. Keep the native
    // resource in its bank and reuse its existing window, including unsaved edits.
    if (editor.features.phosphor && content.children.some(key => state.contents[state.placements[key].contentKey].viewType === 'phosphor-screen-block')) {
      const existing = Object.values(projection.state.nodes).find(n => n.contentKey === contentKey && editor.blockQueries.ancestors(n.key).some(a => ['window-block', 'document-window-block'].includes(a.viewType)));
      if (existing) return reveal(contentKey);
      const owners = documentRootPlacements(state, contentKey);
      if (owners.length !== 1) throw new Error('Document has no unique canonical root.');
      return insert({ ...unwrap(content.payload), type: 'document-block' }, `Phosphor — ${title}`, phosphorWindowPresentation, owners[0].key);
    }
    const tabs = flintInstances().map(app => ({ app, row: app.children.map(key => editor.node(key)).find(n => n?.viewType === 'tab-row-block') }));
    const existing = tabs.find(({ row }) => row?.children.some(key => (editor.node(key)?.payload.metadata as any)?.documentTarget?.documentId === id));
    if (existing) {
      const tab = existing.row!.children.find(key => (editor.node(key)?.payload.metadata as any)?.documentTarget?.documentId === id)!;
      editor.viewVisibility.set(editor.node(tab)!.placementKey, false);
      if (!selectApplicationDocument(editor, existing.app.key, id)) editor.setViewChild(existing.row!.key, tab);
      return reveal(existing.app.contentKey);
    }
    const window = Object.values(projection.state.nodes).find(n => n.contentKey === contentKey && editor.blockQueries.ancestors(n.key).some(a => a.viewType === 'document-window-block'));
    if (window) return reveal(contentKey);
    if (tabs.length) {
      const selected = tabs.sort((a, b) => {
        const z = (app: typeof a.app) => editor.windowManager ? editor.windowManager.rankForNode(app.key) : Number((editor.blockQueries.ancestors(app.key).find(n => n.viewType === 'window-block')?.payload.metadata as any)?.zIndex) || 0;
        return z(b.app) - z(a.app);
      })[0];
      if (selectApplicationDocument(editor, selected.app.key, id)) return reveal(selected.app.contentKey);
      if (!selected.row) throw new Error('The open Flint window has no document tabs.');
      const tab = editor.commands.insert({ id: crypto.randomUUID(), type: 'tab-block', metadata: { name: title, documentTarget: { version: 1, documentId: id } } }, { kind: 'at', parentKey: selected.row.key, index: selected.row.children.length });
      editor.setViewChild(selected.row.key, projection.nodeForPlacement(tab)!.key);
      return reveal(selected.app.contentKey);
    }
    const owners = documentRootPlacements(state, contentKey);
    if (owners.length !== 1) throw new Error('Document has no unique canonical root.');
    // Keep the canonical resource in the bank when its editable window closes.
    return insert({ ...unwrap(content.payload), type: 'document-block' }, title, { size: { w: 840, h: 620 }, windowType: 'document-window-block' }, owners[0].key);
  };
  const boundDocument = (key: string) => {
    const node = editor.node(key); if (!node) return;
    const doc = editor.blockQueries.ancestors(key).find(n => n.viewType === 'document-block')
      ?? (node.viewType === 'document-window-block' ? node.children.map(k => editor.node(k)).find(n => n?.viewType === 'document-block') : undefined);
    const id = doc && String((doc.payload.metadata as any)?.documentId ?? doc.payload.id);
    return id;
  };
  return {
    importedDocument(id: string) {
      const doc = documents().find(c => c.payload.id === id);
      if (!doc) throw new Error('The imported Document is no longer available.');
      return presentDocument(doc.key, id, String((doc.payload.metadata as any)?.title ?? 'TEI Document'));
    },
    canSaveDocument(key: string) { return !!boundDocument(key); },
    async saveDocument(key: string, save?: (id:string)=>Promise<boolean>) {
      const id = boundDocument(key); if (!id) throw new Error('Select an opened native Document to save.');
      const native = nativeDocumentSession(editor);
      if(save)return await save(id)?native.status(id):'Save cancelled';
      const result = await native.save(id);
      if (result?.phase !== 'saved') throw new Error(native.status(id));
      return native.status(id);
    },
    async serverDocument(location: DocumentLocation, signal: AbortSignal) {
      validateDocumentSource({ kind: "document-store", ...location }); signal.throwIfAborted();
      const alreadyOpen = matching(location);
      if (alreadyOpen) return presentDocument(alreadyOpen.key, String((alreadyOpen.payload.metadata as any)?.documentId ?? alreadyOpen.payload.id), location.filename);
      if (isNativeDocumentName(location.filename) || flintInstances().length && editor.features.nativeDocumentPersistence) {
        if (!editor.features.nativeDocumentPersistence) throw new Error('Enable native Document support to open this file.');
        // Preserve the canonical resource and paired Save binding. A native file
        // must never be flattened into a legacy tree just to open it from here.
        // childrenOf returns canonical placement keys, not projected node keys.
        // Looking these up with editor.node misses an existing bank and creates
        // a second owner, which native admission correctly rejects.
        const state = editor.repository.readState();
        const banks = editor.commands.childrenOf(root).filter(key => state.contents[state.placements[key].contentKey].viewType === 'workspace-object-bank-block');
        if (banks.length > 1) throw new Error('Ambiguous workspace object bank.');
        let createdBank: PlacementKey | undefined;
        if (!banks.length) createdBank = editor.commands.insert({ id: crypto.randomUUID(), type: 'workspace-object-bank-block', children: [] }, { kind: 'at', parentKey: root, index: editor.commands.childrenOf(root).length });
        try {
          const native = nativeDocumentSession(editor);
          const id = isNativeDocumentName(location.filename) ? await native.open(location, false, signal)
            : await native.openCompatible(location, await native.defaultVault() ?? '.', signal);
          signal.throwIfAborted();
          const doc = documents().find(c => String((c.payload.metadata as any)?.documentId ?? c.payload.id) === id);
          if (!doc) throw new Error('Opened Document is unavailable.');
          return presentDocument(doc.key, id, location.filename);
        } finally {
          if (createdBank) {
            const bank = editor.repository.state.placements[createdBank];
            if (bank && !editor.repository.state.contents[bank.contentKey].children.length) editor.commands.remove(createdBank);
          }
        }
      }
      const dto = await PersistenceService.loadDocument(location.filename, location.folder, signal);
      signal.throwIfAborted();
      if (isHistoryDocument(dto)) throw new Error("History-enrolled Documents must be opened separately in the Sample document demo.");
      if (!["document-block", "main-list-block", "membrane-block"].includes(dto.type!)) throw new Error("Select a Document file, not a Workspace or media Block.");
      const id = documentIdentity(dto) ?? crypto.randomUUID();
      const hash = await workspaceContentHash(dto); signal.throwIfAborted();
      // Check again after loading: another action may have opened this identity.
      const current = matching(location, id); if (current) return presentDocument(current.key, id, location.filename);
      const document = structuredClone(dto);
      document.metadata = { ...(document.metadata as object), documentId: id, ...location };
      const placement = insert(document, location.filename);
      const host = editor.repository.state.contents[editor.repository.state.placements[placement].contentKey];
      const contentKey = editor.repository.state.placements[host.children[0]].contentKey;
      editor.persistence.registerWorkspaceDocument(contentKey, id, location.folder, location.filename, location.filename, hash);
      return placement;
    },
    newDocument(format: DocumentFormat = "page") {
      if (editor.features.documentFormats) {
        const result = createFormattedDocument(format);
        return insert(result.document, result.title, result);
      }
      if (format !== "page") throw new Error("Document formats are disabled.");
      const id = crypto.randomUUID();
      return insert({ id, type: "document-block", metadata: { documentId: id, folder: ".", filename: `${id}.json` }, children: [{ type: "standoff-editor-block", text: "" }] }, "Untitled document");
    },
    image(url: string) {
      url = url.trim();
      if (!/^(https?:\/\/|data:image\/|\/(?!\/))/i.test(url)) throw new Error("Enter an HTTP(S), image data or site-relative image URL.");
      return insert({ id: crypto.randomUUID(), type: "image-block", metadata: { url, title: "Image" } }, "Image");
    },
    focus(placement: PlacementKey) {
      if (presentation.active() === "spatial") return; // A has proxies, never a hidden editor focus request.
      const host = projection.nodeForPlacement(placement); if (!host) return;
      const visit = (key: string): string | undefined => {
        if (["native-text", "standoff"].includes(editor.mounts.get(key)?.inputPolicy ?? "") || editor.node(key)?.viewType === 'phosphor-screen-block' && editor.mounts.get(key)) return key;
        for (const child of editor.node(key)?.children ?? []) { const found = visit(child); if (found) return found; }
      };
      editor.focus.request(visit(host.key) ?? host.key, { reason: "open-workspace-object" });
    },
  };
}
