import { codeSurface } from '../features/standoff-code-mirror/mounts';
import { Coordinates } from '../features/standoff-code-mirror/model';
import { immutable } from "../runtime/effect-contributions";
import type { AnnotationCapabilities, AnnotationText } from "../feature-api/annotations";
import type { FeatureScope } from "../runtime/features";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { ancestorPath, nodeLabel, resolveSearchScope, scopeNodes, TextSearch } from "../runtime/text-search";
import { revealMatch, revealPositionMarker } from "../runtime/reveal-match";
import { currentPageForScope, nodeKeysForPage } from "../runtime/minimap";
import { panelSession } from "../runtime/panel-session";
import { entityService } from './entity-service';
import { graphemeBoundaries } from '../input/graphemes';
import { watchDocumentEntities } from './document-entity-changes';
import { liveDocumentEntities } from './live-document-entities';

export function annotationCapabilities(editor: ReactiveEditor, scope: FeatureScope, standaloneRoot?: string): AnnotationCapabilities {
  // Explicit native standalone surface: no synthetic Document/Resource owner.
  const locate: typeof resolveSearchScope = (host, key, kind = 'page') => {
    if (!standaloneRoot) return resolveSearchScope(host, key, kind);
    const node = host.node(standaloneRoot);
    if (!node || key !== standaloneRoot) throw Error('Select text in this Proposition.');
    return {kind, viewId:node.viewId, rootKey:node.key, placementKey:node.placementKey, region:'subtree', label:'Proposition'};
  };
  const check = () => { if (!scope.active()) throw new Error(`Feature ${scope.owner} is disposed`); };
  const panelTypes = new Set<string>();
  scope.own(() => { for (const overlay of [...editor.overlays.overlays]) if (panelTypes.has(overlay.viewType)) editor.overlays.close(overlay.key, false); });
  // Candidate classification repeatedly reads the same paragraph. Detach once
  // per repository revision, never once per match or typed query character.
  const texts = new Map<string, AnnotationText>();
  let textRevision = -1;
  scope.own(() => texts.clear());
  const text = (key: string): AnnotationText | undefined => {
    const revision = editor.repository.state.revision;
    if (textRevision !== revision) { texts.clear(); textRevision = revision; }
    const cached = texts.get(key); if (cached) return cached;
    const node = editor.node(key); if (!node||node.viewType==='standoff-code-mirror-block') return;
    const snapshot = immutable({ key, contentKey: node.contentKey, placementKey: node.placementKey,
      version: editor.repository.state.contents[node.contentKey]?.inlineRevision ?? 0,
      cells: node.inlineContent.map(key => { const cell = editor.node(key); return { plain: cell?.viewType === "text-cell", text: String(cell?.payload.text ?? " ") }; }),
      properties: ((Array.isArray(node.payload.standoffProperties) ? node.payload.standoffProperties : []) as Record<string, unknown>[]).filter(p => p && typeof p === "object" && !Array.isArray(p)).map(p => JSON.parse(JSON.stringify(editor.linkedAnnotations.resolve(p, node.contentKey)))),
    });
    texts.set(key, snapshot); return snapshot;
  };
  return {
    codeAnnotations:{supports:key=>!!codeSurface(editor,key),open:(key,type)=>{const source=codeSurface(editor,key);if(!source)throw Error('Code editor is not mounted.');source.open(type);}},
    liveDocumentEntities(owner) {
      check();const root=locate(editor,owner,'document').rootKey;
      const inventory=liveDocumentEntities(editor,editor.node(root)!.contentKey);
      return {...inventory,dispose:scope.own(inventory.dispose)};
    },
    validateRanges(ranges) { check();editor.textRanges.validate(ranges,'cell'); },
    watchContent(listener) { check();return scope.own(editor.repository.subscribeChanges(change=>listener({keys:new Set(change.previousContents.keys()),revision:editor.repository.readState().revision,structural:!change.inlineOwner}))); },
    caretEvents: editor.features.annotationRangeEvents,
    temporaryRanges(owner) {
      check();const collection=editor.temporaryRanges.createCollection(`${scope.owner}:${owner}`);
      return {...collection,dispose:scope.own(collection.dispose)};
    },
    entities: owner=>{check();const service=entityService(editor,owner);return {...service,dispose:scope.own(()=>service.dispose())};},
    replaceAndAnnotate(range,replacement,type,value,metadata,revision){
      check();if(editor.repository.state.revision!==revision)throw Error('The Document changed. Select the text again.');
      editor.textRanges.validate([range],'cell');const source=text(range.nodeKey)!;
      const boundaries=graphemeBoundaries(source.cells.map(c=>c.text).join(''));
      if(source.cells.some(c=>!c.plain)||!boundaries.includes(range.start)||!boundaries.includes(range.end))throw Error('Replace & Link requires a complete plain-text range');
      editor.commands.replaceAndAnnotate(range.nodeKey,range.start,range.end,replacement,type,value,metadata);
    },
    focusRange(range,revision){
      check();if(editor.repository.state.revision!==revision)throw Error('Selection changed before focus restoration');
      editor.textRanges.validate([range],'cell');editor.focus.request(range.nodeKey,{reason:'annotation-selection'});editor.mounts.get(range.nodeKey)?.restoreInlineSelection?.({anchor:range.start,head:range.end});
    },
    recoverySelection(owner){
      const focused=editor.focus.state.focusedKey;
      const key=focused&&!editor.overlays.isOverlayKey(focused)?focused:editor.focus.state.lastFocusedKey??owner,node=editor.node(key),origin=editor.node(owner);
      if(!node||!origin||node.viewId!==origin.viewId)throw Error('Select text in this Document occurrence');
      const a=locate(editor,key,'document'),b=locate(editor,owner,'document');if(a.rootKey!==b.rootKey)throw Error('Select text in the same Document');
      const cross=editor.crossText.range();if(cross){const ranges=editor.crossText.resolve(cross.anchor,cross.head);if(ranges.some(r=>editor.node(r.nodeKey)?.viewId!==origin.viewId||locate(editor,r.nodeKey,'document').rootKey!==b.rootKey))throw Error('Select text in the same Document occurrence');return ranges;}
      const r=editor.mounts.get(key)?.captureInlineSelection?.();return r?[{nodeKey:key,start:Math.min(r.anchor,r.head),end:Math.max(r.anchor,r.head)}]:[];
    },
    revision: () => editor.repository.state.revision, text,
    path: key => ancestorPath(editor, key).map(node => ({ key: node.key, label: nodeLabel(node) })),
    scope: (key, kind) => locate(editor, key, kind),
    documentTexts(key) {
      const node = editor.node(key);
      const origin = node?.viewType === "document-window-block" ? node.children.find(child => editor.node(child)?.viewType === "document-block") ?? key : key;
      const scope = locate(editor, origin, "document");
      return { scope, texts: scopeNodes(editor, scope).found.filter(({ node }) => node.viewType === "standoff-editor-block").map(({ node }) => text(node.key)!) };
    },
    documentAnnotations(key) {
      const node = editor.node(key);
      const origin = node?.viewType === "document-window-block" ? node.children.find(child => editor.node(child)?.viewType === "document-block") ?? key : key;
      const scope = locate(editor, origin, "document");
      const found=scopeNodes(editor,scope,['mutable/citation-block','mutable/web-article-block','standoff-code-mirror-block']).found;
      const blockReferences=found.filter(({node})=>['mutable/citation-block','mutable/web-article-block'].includes(node.viewType)).map(({node})=>({
        contentKey:node.contentKey,
        // Detach only this Block's annotation metadata before freezing. Freezing
        // a Solid store proxy violates its nested-property get invariants and
        // crashes consumers (including Scry's Entity inventory).
        properties:immutable(JSON.parse(JSON.stringify(Array.isArray(node.payload.blockProperties)?node.payload.blockProperties:[])) as Record<string,unknown>[]),
      }));
      return { scope, blockReferences, texts: found.filter(({node})=>['standoff-editor-block','standoff-code-mirror-block'].includes(node.viewType)).map(({node})=>{
        const native=node.viewType==='standoff-code-mirror-block',coordinates=native?new Coordinates(String(node.payload.text??'')):undefined;
        return immutable({key:node.key,contentKey:node.contentKey,placementKey:node.placementKey,
          version:native?editor.repository.state.contents[node.contentKey].revision:editor.repository.state.contents[node.contentKey]?.inlineRevision??0,
          coordinate:native?'utf16' as const:'cell' as const,
          cellCount:coordinates?.text.length??node.inlineContent.length,
          properties:((Array.isArray(node.payload.standoffProperties)?node.payload.standoffProperties:[]) as Record<string,unknown>[])
            .filter(p=>p&&typeof p==='object'&&!Array.isArray(p)).flatMap(p=>{
              const resolved=JSON.parse(JSON.stringify(editor.linkedAnnotations.resolve(p,node.contentKey)));
              if(!coordinates)return [resolved];
              try{const {from,to}=coordinates.range(p);return [{...resolved,start:from,end:to-1}];}catch{return [];}
            }),
        });
      }) };

    },
    watchDocumentEntities(key, listener) {
      check();
      const watch = watchDocumentEntities(editor, key, listener, standaloneRoot);
      const dispose = scope.own(watch.dispose);
      return {key:watch.key, get signature() { return watch.signature; }, dispose};
    },
    selection(key) {
      const cross = editor.crossText.range(); if (cross) return editor.crossText.resolve(cross.anchor, cross.head);
      const range = editor.mounts.get(key)?.captureInlineSelection?.();
      return range ? [{ nodeKey: key, start: Math.min(range.anchor, range.head), end: Math.max(range.anchor, range.head) }] : [];
    },
    ...(editor.windowManager ? { watchTarget(owner: string, ranges: readonly import("../runtime/text-search").SearchRange[], listener: (change: {valid:boolean;revision:number}) => void) {
      const keys = [owner, ...ranges.map(r => r.nodeKey)];
      const sources = keys.map(key => { const node = editor.node(key)!; return {key, contentKey:node.contentKey, placementKey:node.placementKey}; });
      const contents = new Set(sources.map(s => s.contentKey));
      // Capture structural dependencies once, never traverse the Document on typing.
      const ancestors = new Set(keys.flatMap(key => editor.blockQueries.ancestors(key).map(n => n.contentKey)));
      return scope.own(editor.repository.subscribeChanges(change => {
        const touched = [...change.previousContents.keys()];
        const sourceChanged = (change.inlineOwner && contents.has(change.inlineOwner)) || touched.some(key => contents.has(key));
        const structureChanged = !change.inlineOwner && !change.appendedChildrenOwner && touched.some(key => ancestors.has(key));
        const valid = !sourceChanged && !structureChanged && sources.every(s => { const node=editor.node(s.key); return node?.contentKey===s.contentKey && node.placementKey===s.placementKey; });
        listener({valid:!!valid,revision:editor.repository.state.revision});
      }));
    } } : {}),
    beforeChange: listener => scope.own(editor.repository.subscribeBeforeChanges(listener)),
    afterChange: listener => scope.own(editor.repository.subscribeChanges(listener)),
    search(runner) { check(); const search = new TextSearch(editor, runner); const dispose = scope.own(() => search.dispose()); return { searchText: request => search.searchText(request), dispose }; },
    annotate(...args) {
      check(); if (!standaloneRoot) return editor.linkedAnnotations.createBatch(...args);
      const [groups,type,value,metadata,revision,label] = args;
      if (editor.repository.state.revision !== revision) throw Error('The Proposition changed. Select the text again.');
      if (!groups.length || groups.some(g=>g.length!==1 || g[0].nodeKey!==standaloneRoot)) throw Error('Propositions support direct annotations in one Block.');
      editor.textRanges.validate(groups.flat(), 'cell');
      const node=editor.node(standaloneRoot)!,old=(editor.repository.readState().contents[node.contentKey].payload.standoffProperties??[]) as Record<string,unknown>[];
      const ids=groups.map(()=>crypto.randomUUID());
      const properties=[...old,...groups.map(([range],index)=>({id:ids[index],type,value,metadata:structuredClone(metadata),start:range.start,end:range.end-1}))];
      editor.commands.setPayloadField(node.key,'standoffProperties',properties,label,properties.map((_,i)=>i<old.length?i:null));
      return ids;
    },
    openPanel(type, owner, data, selection = []) {
      check(); if (!panelTypes.has(type) || !editor.node(owner)) throw new Error("Open the panel from a document first.");
      if (editor.windowManager && type === "entity-search") {
        const source = locate(editor, owner, "document");
        const existing = editor.overlays.overlays.find(overlay => (overlay.viewType === type || overlay.viewType === 'autocomplete' && (overlay.data as {entitySearch?:boolean})?.entitySearch) && editor.node(overlay.ownerKey)?.viewId === source.viewId && locate(editor,overlay.ownerKey,"document").rootKey === source.rootKey);
        if (existing) { const session = panelSession(editor,existing); session.focus(); return session; }
      } else for (const overlay of [...editor.overlays.overlays]) if (overlay.viewType === type) editor.overlays.close(overlay.key, false);
      const mount = editor.mounts.get(owner), rect = mount?.root.getBoundingClientRect();
      editor.crossText.clear();
      const first = selection.find(range => range.end > range.start);
      if (first) { mount?.focus(); mount?.restoreInlineSelection?.({ anchor: first.start, head: first.end }); }
      const key = editor.overlays.open({ ownerKey: owner, viewType: type, explicitDismissal: !!editor.windowManager && type === "entity-search", anchor: { x: rect?.left ?? 20, y: (rect?.bottom ?? 20) + 8 }, data });
      return panelSession(editor, editor.overlays.overlays.find(overlay => overlay.key === key)!);
    },
    decorations(owner) {
      check(); const id = `${scope.owner}:${owner}`;
      let live = true;
      const requireLive = () => { check(); if (!live) throw new Error("Decoration session is disposed"); };
      const dispose = scope.own(() => { live = false; editor.decorations.disposeSession(id); });
      return {
        ranges(ranges, style) { requireLive(); editor.decorations.attachRanges(id, ranges, style); },
        matches(set, style) { requireLive(); editor.decorations.attachMatches(id, set, style); },
        visible(visible) { requireLive(); editor.decorations.setHighlightsVisible(id, visible); },
        active(match) { requireLive(); editor.decorations.setActiveMatch(id, match); },
        clear: () => editor.decorations.clearHighlights(id), dispose,
      };
    },
    reveal: (match, valid) => revealMatch(editor, match, () => scope.active() && valid()),
    revealMarker: (marker, valid) => revealPositionMarker(editor, marker, () => scope.active() && valid()),
    currentPage: (scope, key) => currentPageForScope(editor, scope, [editor.focus.state.focusedKey, editor.focus.state.lastFocusedKey, key]),
    pageKeys: key => nodeKeysForPage(editor, key),
    concertina: {
      activate(owner, searchScope, markers, activeMarkerOrGroup, replaced) { check(); editor.concertina.activate({ owner: `${scope.owner}:${owner}`, viewId: searchScope.viewId, scope: searchScope, markers, activeMarkerOrGroup }, {}, replaced); },
      clear: owner => editor.concertina.deactivate(`${scope.owner}:${owner}`),
      active: id => editor.concertina.setActiveMarker(id),
    },
    bindings: { dispatch: (...args) => editor.bindings.dispatch(...args), label: (...args) => editor.bindings.label(...args) },
    register: {
      caretMode: definition => { check(); scope.own(editor.caretModes.registerMode(definition)); },
      focusProvider: definition => { check(); scope.own(editor.caretModes.registerProvider(definition)); },
      rangeEvent: listener => { check(); scope.own(editor.annotationEvents.subscribeTransitions(listener)); },
      propertyType: definition => { check(); scope.own(editor.visualEffects.registerType(definition)); },
      renderer: definition => { check(); scope.own(editor.visualEffects.registerRenderer(definition)); },
      handler: (name, handler) => { check(); scope.own(editor.visualEffects.registerHandler(name, handler)); },
      annotationEvent: listener => { check(); scope.own(editor.annotationEvents.subscribe(listener)); },
      panel(definition) { check(); const dispose = editor.panels.register(definition); panelTypes.add(definition.type); scope.own(dispose); },
      effect(definition) { check(); scope.own(editor.effects.register(definition)); },
      annotation(definition) { check(); scope.own(editor.annotationUI.register(definition)); },
      command(definition) { check(); scope.own(editor.commandRegistry.register(definition, scope.owner)); },
      binding(definition) { check(); scope.own(editor.bindings.register(definition, scope.owner)); },
      action(definition) { check(); scope.own(editor.featureActions.register(definition, scope.owner)); },
    },
  };
}
