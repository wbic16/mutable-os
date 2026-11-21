import { inlineLength, inlineSlice, type InlineAtom, type InlineSplice } from "./inline-sequence";
import type { StructuralChange } from "./structural-plan";
import type { ListWrapChange } from "./list-wrap-plan";
import { batch, createSignal } from 'solid-js';
import { createStore, reconcile, unwrap } from "solid-js/store";
import { clone } from "./clone";
import { createNodeKey } from "./ids";
import type { CanonicalRepository } from "./repository";
import type { SplitChange } from "./split-plan";
import type { OccurrenceIndex } from "./occurrences";
import type {
  BlockNode,
  BlockTreeState,
  ContentKey,
  NodeKey,
  PlacementKey,
  ViewId,
} from "./types";

export class BlockTreeProjection {
  private compactMounts = new Map<string, number>();
  private compactVersions=new Map<string,number>();
  isCompact(key:string){const n=this.state.nodes[key];return !!n&&!!this.repository.state.contents[n.contentKey]?.compactInline;}
  /** Editing projection only, acquired by the existing mounted TextBlock view.
   * It is never registered as canonical content/placement ownership. */
  acquireCompactInline(key:string):()=>void {
    if(!this.isCompact(key))return ()=>{};
    this.compactMounts.set(key,(this.compactMounts.get(key)??0)+1);
    if(this.compactMounts.get(key)===1)this.updateCompactInline(key);
    return ()=>{const count=(this.compactMounts.get(key)??1)-1;if(count){this.compactMounts.set(key,count);return;}this.compactMounts.delete(key);this.compactVersions.delete(key);const n=this.state.nodes[key];if(n)batch(()=>{for(const ck of n.inlineContent)this.setState('nodes',ck,undefined);this.setState('nodes',key,'inlineContent',[]);});};
  }
  private editingAtoms(owner:BlockNode,spans:readonly InlineAtom[]):BlockNode[]{
    const out:BlockNode[]=[];const atom=(viewType:string,payload:Record<string,unknown>)=>out.push({key:createNodeKey(this.viewId,owner.placementKey),contentKey:owner.contentKey,placementKey:owner.placementKey,viewId:this.viewId,editingInlineOwner:owner.key,viewType,payload,children:[],inlineContent:[],ownedRelations:{}});
    for(const a of spans)if(a.kind==='text')for(const text of a.text)atom('text-cell',{text});else atom(a.kind==='alternative'?'inline-alternative-cell':'image-cell',clone(a.properties));return out;
  }
  private updateCompactInline(key:string,splice?:InlineSplice){
    const owner=this.state.nodes[key];if(!owner)return;const c=this.repository.readState().contents[owner.contentKey];if(!c?.compactInline)return;
    if(!this.compactMounts.has(key)){this.setState('nodes',key,'payload',reconcile(clone(c.payload)));return;}
    if(this.compactVersions.get(key)===c.inlineRevision){this.setState('nodes',key,'payload',reconcile(clone(c.payload)));return;}
    this.compactVersions.set(key,c.inlineRevision);
    const old=[...owner.inlineContent];let start=splice?.start??0,end=splice?.end??old.length,added:BlockNode[];
    if(splice)added=this.editingAtoms(owner,splice.insert);
    else {
      const next=this.editingAtoms(owner,c.compactInline.spans),same=(i:number,j:number)=>{const a=this.state.nodes[old[i]],b=next[j];return a?.viewType===b?.viewType&&JSON.stringify(a?.payload)===JSON.stringify(b?.payload);};
      while(start<old.length&&start<next.length&&same(start,start))start++;let suffix=0;while(suffix<old.length-start&&suffix<next.length-start&&same(old.length-1-suffix,next.length-1-suffix))suffix++;
      end=old.length-suffix;added=next.slice(start,next.length-suffix);
    }
    batch(()=>{for(const ck of old.slice(start,end))this.setState('nodes',ck,undefined);for(const cell of added)this.setState('nodes',cell.key,cell);const keys=[...old.slice(0,start),...added.map(c=>c.key),...old.slice(end)];this.setState('nodes',key,'inlineContent',reconcile(keys));this.setState('nodes',key,'payload',reconcile(clone(c.payload)));});
  }

  private readonly topology = createSignal(0);
  readonly structureVersion = this.topology[0];
  /** Reuse the existing occurrence route index for bounded ancestor navigation. */
  parentOf(key: NodeKey): BlockNode | undefined {
    this.structureVersion();
    const route = this.nodeRoutes.get(key);
    if (!route || !route.includes('/')) return;
    const parent = this.routeKeys.get(route.slice(0, route.lastIndexOf('/')));
    return parent ? this.state.nodes[parent] : undefined;
  }
  readonly state: BlockTreeState;
  private readonly setState: (...args: any[]) => void;
  private readonly routeKeys = new Map<string, NodeKey>();
  private readonly nodeRoutes = new Map<NodeKey, string>();
  private readonly contentNodes = new Map<ContentKey, Set<NodeKey>>();
  private readonly placementNodes = new Map<PlacementKey, Set<NodeKey>>();
  private registeredKeys = new Set<NodeKey>();
  private readonly unsubscribe: () => void;

  constructor(
    private readonly repository: CanonicalRepository,
    readonly viewId: ViewId,
    private readonly occurrences: OccurrenceIndex,
    readonly rootPlacementKey: PlacementKey = repository.state.rootPlacementKey,
    private readonly retainStructuralIdentity = false,
  ) {
    const initial = this.build();
    const [state, setState] = createStore(initial);
    this.state = state;
    this.setState = setState;
    this.register(initial);
    this.unsubscribe = repository.subscribeChanges((change) => {
      if (!repository.readState().placements[this.rootPlacementKey]) {
        this.unregister();
        this.setState(reconcile({ rootKey: this.state.rootKey, nodes: {}, revision: repository.state.revision }));
        return;
      }
      if (change.taskStateOwner) {
        const content = repository.readState().contents[change.taskStateOwner];
        for (const key of this.contentNodes.get(content.key) ?? [])
          this.setState("nodes", key, "payload", "checked", content.payload.checked);
        return;
      }
      if (change.listWrap) {
        this.updateListWrap(change.listWrap);
        return;
      }
      if (change.appendedChildrenOwner) {
        this.appendChildren(change.appendedChildrenOwner);
        return;
      }
      if (change.childrenOwner) {
        this.updateChildren(change.childrenOwner);
        return;
      }
      if (change.split) {
        this.updateSplit(change.split);
        return;
      }
      if (change.inlineOwner) {
        this.updateInline(change.inlineOwner,change.compactEdits?.get(change.inlineOwner));
        // The validated inline batch may also annotate other existing text
        // owners. Update those occurrences without rebuilding the projection.
        for(const [key,previous] of change.previousContents){
          if(key!==change.inlineOwner&&previous?.inlineKind==='standoff'&&repository.readState().contents[key]?.inlineKind==='standoff')this.updateInline(key);
        }
        return;
      }
      if(change.structural?.gloss) {
        const {owner,texts}=change.structural.gloss;
        for(const key of texts)if(this.contentNodes.has(key))this.updateInline(key);
        const content=repository.readState().contents[owner];
        if(change.previousContents.has(owner))for(const key of this.contentNodes.get(owner)??[])this.setState('nodes',key,'payload',reconcile(clone(content.payload)));
        return;
      }
      const oriented = change.structural?.tabOrientationOwner ?? change.structural?.sequenceMetadataOwner ?? change.structural?.preferencesMetadataOwner;
      if (oriented) {
        const content = repository.readState().contents[oriented];
        // All mounted occurrences share this authored setting. Their child trees,
        // occurrence indexes and topology remain untouched (including live viewers).
        for (const key of this.contentNodes.get(oriented) ?? [])
          if (this.state.nodes[key].viewType === content.viewType)
            this.setState('nodes', key, 'payload', reconcile(clone(content.payload)));
        return;
      }
      if (change.structural?.tabMetadata) {
        const { owners, inlineOwner } = change.structural.tabMetadata;
        if (inlineOwner && this.contentNodes.has(inlineOwner)) this.updateInline(inlineOwner);
        for (const owner of owners) {
          const content = repository.readState().contents[owner];
          for (const key of this.contentNodes.get(owner) ?? [])
            if (this.state.nodes[key].viewType === content.viewType)
              this.setState('nodes',key,'payload',reconcile(clone(content.payload)));
        }
        return;
      }
      if(change.structural?.rangePayloadOwners?.length){
        // The proof guarantees unchanged topology/Cells for these annotation-only
        // records. Reuse inline projection maintenance for every shared occurrence.
        const owners=new Set(change.structural.rangePayloadOwners);
        if(this.updateStructural({...change.structural,contents:change.structural.contents.filter(k=>!owners.has(k))})){
          for(const key of owners)if(this.contentNodes.has(key))this.updateInline(key);
          return;
        }
      } else if (change.structural && this.updateStructural(change.structural)) return;
      // Full ownership validation does not imply every open Document changed.
      if(change.changedPlacements && ![...change.previousContents.keys()].some(k=>this.contentNodes.has(k)) && !change.changedPlacements.some(k=>this.placementNodes.has(k)||k===this.rootPlacementKey))return;
      if(change.changedPlacements) {
        const source=repository.readState(),keys=[...change.previousContents.keys()];
        const alternatives=keys.some(k=>[source.contents[k],change.previousContents.get(k)].some(c=>c?.compactInline?.spans.some(a=>a.kind==='alternative')));
        const stable=keys.every(k=>{const before=change.previousContents.get(k),after=source.contents[k];return (!before||!after||before.viewType===after.viewType&&before.payload.id===after.payload.id) && (!after||[...after.children,...after.inlineContent,...Object.values(after.ownedRelations)].every(pk=>{const p=source.placements[pk];return p&&!p.externalReference&&!p.resolvedReference&&p.kind!=='reference';}));});
        const sameTargets=change.changedPlacements.every(pk=>{const p=source.placements[pk];return !p||pk!==this.rootPlacementKey&&[...this.placementNodes.get(pk)??[]].every(key=>this.state.nodes[key].contentKey===p.contentKey);});
        // The repository has already completed full ownership validation. Reuse
        // its affected records for local presentation, without weakening proof.
        if(alternatives&&stable&&sameTargets&&this.updateStructural({contents:keys,childrenOwners:keys.filter(k=>JSON.stringify(change.previousContents.get(k)?.children)!==JSON.stringify(source.contents[k]?.children)),inlineOwners:keys.filter(k=>!!source.contents[k]?.compactInline)}))return;
      }
      const next = this.build();
      this.unregister();
      this.setState(reconcile(next));
      this.register(next);
      this.topology[1](v => v + 1);
    });
  }

  private nodeKey(route: string, placementKey: PlacementKey): NodeKey {
    const existing = this.routeKeys.get(route);
    if (existing) return existing;
    const key = createNodeKey(this.viewId, placementKey);
    this.routeKeys.set(route, key);
    this.nodeRoutes.set(key, route);
    return key;
  }

  private build(rootPlacementKey = this.rootPlacementKey, rootRoute = "root", ancestors = new Set<ContentKey>()): BlockTreeState {
    // Read only this occurrence subtree; copying the whole workspace makes
    // activating a small neighbouring tab depend on every loaded Document.
    const snapshot = this.repository.readState();
    const nodes: Record<NodeKey, BlockNode> = {};

    const project = (
      placementKey: PlacementKey,
      route: string,
      ancestors: Set<ContentKey>,
    ): NodeKey => {
      const placement = snapshot.placements[placementKey];
      if (!placement) throw new Error(`Missing projected placement ${placementKey}`);
      const content = snapshot.contents[placement.contentKey];
      if (placement.externalReference) {
        const key = this.nodeKey(route, placementKey);
        nodes[key] = { key, contentKey: placement.contentKey, placementKey, viewId: this.viewId,
          viewType: "external-reference", payload: { reference: clone(placement.externalReference) },
          children: [], inlineContent: [], ownedRelations: {} };
        return key;
      }
      if (!content) throw new Error(`Missing projected content ${placement.contentKey}`);
      const key = this.nodeKey(route, placementKey);
      if (ancestors.has(content.key)) {
        nodes[key] = {
          key,
          contentKey: content.key,
          placementKey,
          viewId: this.viewId,
          viewType: "cyclic-reference",
          payload: { ...clone(content.payload), cycleTargetType: content.viewType },
          children: [],
          inlineContent: [],
          ownedRelations: {},
        };
        return key;
      }

      // Ordinary character atoms are leaves. Avoid allocating an ancestor Set
      // and walking three empty edge collections for every character in every
      // view. Keep a private payload: projection reconciliation must never mutate
      // canonical content or another occurrence's payload.
      if (content.viewType === "text-cell" && !content.children.length && !content.inlineContent.length && !Object.keys(content.ownedRelations).length) {
        nodes[key] = {
          key, contentKey: content.key, placementKey, viewId: this.viewId,
          viewType: content.viewType,
          payload: typeof content.payload.text === "string" && Object.keys(content.payload).length === 1
            ? { text: content.payload.text } : clone(content.payload),
          children: [], inlineContent: [], ownedRelations: {},
        };
        return key;
      }

      const nextAncestors = new Set(ancestors).add(content.key);
      const children = content.children.map((childKey) =>
        project(childKey, `${route}/child:${childKey}`, nextAncestors),
      );
      const inlineContent = content.inlineContent.map((inlineKey) =>
        project(inlineKey, `${route}/inline:${inlineKey}`, nextAncestors),
      );
      const ownedRelations = Object.fromEntries(
        Object.entries(content.ownedRelations).map(([name, relationKey]) => [
          name,
          project(relationKey, `${route}/relation:${name}:${relationKey}`, nextAncestors),
        ]),
      );
      nodes[key] = {
        key,
        contentKey: content.key,
        placementKey,
        viewId: this.viewId,
        viewType: content.viewType,
        payload: clone(content.payload),
        children,
        inlineContent,
        ownedRelations,
      };
      return key;
    };

    let rootKey = project(rootPlacementKey, rootRoute, ancestors);
    // Structural edits may change the route of an existing, unique occurrence.
    // Reuse its identity only when BOTH projections contain exactly one instance
    // of that placement. Shared/reference occurrences must never be conflated.
    // This runs on structural rebuilds, never on the inline typing path.
    if (this.retainStructuralIdentity && rootRoute === "root" && this.registeredKeys.size) {
      const byPlacement = new Map<PlacementKey, NodeKey[]>();
      for (const node of Object.values(nodes)) {
        const keys = byPlacement.get(node.placementKey) ?? [];
        keys.push(node.key); byPlacement.set(node.placementKey, keys);
      }
      const moves = new Map<NodeKey, NodeKey>();
      for (const [placement, next] of byPlacement) {
        const previous = this.placementNodes.get(placement);
        if (next.length !== 1 || previous?.size !== 1) continue;
        const old = previous.values().next().value!;
        if (old !== next[0] && !nodes[old]) moves.set(next[0], old);
      }
      const keyFor = (key: NodeKey) => moves.get(key) ?? key;
      for (const [fresh, old] of moves) {
        const route = this.nodeRoutes.get(fresh)!, oldRoute = this.nodeRoutes.get(old);
        if (oldRoute && this.routeKeys.get(oldRoute) === old) this.routeKeys.delete(oldRoute);
        this.routeKeys.set(route, old); this.nodeRoutes.set(old, route); this.nodeRoutes.delete(fresh);
        nodes[old] = { ...nodes[fresh], key: old }; delete nodes[fresh];
      }
      if (moves.size) for (const node of Object.values(nodes)) {
        node.children = node.children.map(keyFor); node.inlineContent = node.inlineContent.map(keyFor);
        node.ownedRelations = Object.fromEntries(Object.entries(node.ownedRelations).map(([name, key]) => [name, keyFor(key)]));
      }
      rootKey = keyFor(rootKey);
    }
    for(const key of this.compactMounts.keys())if(nodes[key]){
      const c=snapshot.contents[nodes[key].contentKey];if(!c?.compactInline)continue;
      const previous=this.state?.nodes[key];const cells=this.editingAtoms(nodes[key],c.compactInline.spans);
      // Structural rebuild preserves equal surviving editing atoms at either edge.
      let prefix=0,suffix=0;const old=previous?.inlineContent??[];
      const same=(i:number,j:number)=>{const a=this.state.nodes[old[i]],b=cells[j];return a?.viewType===b.viewType&&JSON.stringify(a.payload)===JSON.stringify(b.payload);};
      while(prefix<old.length&&prefix<cells.length&&same(prefix,prefix)){cells[prefix]=clone(unwrap(this.state.nodes[old[prefix]]));prefix++;}
      while(suffix<old.length-prefix&&suffix<cells.length-prefix&&same(old.length-1-suffix,cells.length-1-suffix)){cells[cells.length-1-suffix]=clone(unwrap(this.state.nodes[old[old.length-1-suffix]]));suffix++;}
      this.compactVersions.set(key,c.inlineRevision);
      nodes[key].inlineContent=cells.map(c=>c.key);for(const c of cells)nodes[c.key]=c;
    }
    return { rootKey, nodes, revision: snapshot.revision };
  }

  private register(state: BlockTreeState): void {
    for (const node of Object.values(state.nodes)) {
      this.registerNode(node);
    }
  }

  private registerNode(node: BlockNode): void {
    if(node.editingInlineOwner)return;
    this.registeredKeys.add(node.key);
    this.occurrences.register(node.key, node.placementKey);
    for (const [index, key] of [[this.contentNodes, node.contentKey], [this.placementNodes, node.placementKey]] as const) {
      const keys = index.get(key) ?? new Set<NodeKey>();
      keys.add(node.key);
      index.set(key, keys);
    }
  }

  private unregisterNode(node: BlockNode): void {
    this.registeredKeys.delete(node.key);
    this.occurrences.unregister(node.key);
    for (const [index, key] of [[this.contentNodes, node.contentKey], [this.placementNodes, node.placementKey]] as const) {
      const keys = index.get(key);
      keys?.delete(node.key);
      if (!keys?.size) index.delete(key);
    }
  }

  private updateInline(contentKey: ContentKey, splice?: InlineSplice): void {
    // A text edit outside this view must not publish even a revision-only update.
    if (!this.contentNodes.has(contentKey)) return;
    const source = this.repository.readState();
    const content = source.contents[contentKey];
    const nodes = unwrap(this.state.nodes);
    for (const key of this.contentNodes.get(contentKey) ?? []) {
      if(content.compactInline){this.updateCompactInline(key,splice);continue;}
      const owner = nodes[key];
      if (owner.viewType === "cyclic-reference") {
        this.setState("nodes", key, "payload", reconcile({ ...clone(content.payload), cycleTargetType: content.viewType }));
        continue;
      }
      const route = this.nodeRoutes.get(key)!;
      const inlineContent = content.inlineContent.map((placementKey) => {
        const cellKey = this.nodeKey(`${route}/inline:${placementKey}`, placementKey);
        if (!nodes[cellKey]) {
          const placement = source.placements[placementKey];
          const cell = source.contents[placement.contentKey];
          const node: BlockNode = {
            key: cellKey, contentKey: cell.key, placementKey, viewId: this.viewId,
            viewType: cell.viewType, payload: clone(cell.payload), children: [], inlineContent: [], ownedRelations: {},
          };
          this.setState("nodes", cellKey, node);
          this.registerNode(node);
        }
        return cellKey;
      });
      const retained = new Set(inlineContent);
      for (const oldKey of owner.inlineContent) {
        if (retained.has(oldKey)) continue;
        this.unregisterNode(nodes[oldKey]);
        this.setState("nodes", oldKey, undefined);
      }
      this.setState("nodes", key, "payload", reconcile(clone(content.payload)));
      this.setState("nodes", key, "inlineContent", reconcile(inlineContent));
    }
    this.setState("revision", source.revision);
  }

  /** Reparent existing occurrences; only routes in the moved subtree change. */
  private updateListWrap(change: ListWrapChange): void {
    if (change.inlineChanged) this.updateInline(change.child);
    const source = this.repository.readState(), nodes = unwrap(this.state.nodes);
    const reroute = (key: NodeKey, oldPrefix: string, newPrefix: string) => {
      const node = nodes[key], old = this.nodeRoutes.get(key)!;
      const route = newPrefix + old.slice(oldPrefix.length);
      if (this.routeKeys.get(old) === key) this.routeKeys.delete(old);
      this.routeKeys.set(route, key); this.nodeRoutes.set(key, route);
      for (const child of [...node.children, ...node.inlineContent, ...Object.values(node.ownedRelations)]) reroute(child, oldPrefix, newPrefix);
    };
    for (const key of this.contentNodes.get(change.parent) ?? []) {
      const parent = nodes[key];
      if (parent.viewType === "cyclic-reference") continue;
      const route = this.nodeRoutes.get(key)!;
      const index = parent.children.findIndex(k => nodes[k].placementKey === (change.wrapped ? change.item : change.wrapper));
      if (index < 0) continue;
      const children = [...parent.children];
      if (change.wrapped) {
        const child = children[index], wrapperRoute = `${route}/child:${change.wrapper}`;
        const wrapperKey = this.nodeKey(wrapperRoute, change.wrapper), list = source.contents[change.wrapperContent];
        reroute(child, this.nodeRoutes.get(child)!, `${wrapperRoute}/child:${change.item}`);
        const wrapper: BlockNode = { key: wrapperKey, placementKey: change.wrapper, contentKey: list.key, viewId: this.viewId,
          viewType: list.viewType, payload: clone(list.payload), children: [child], inlineContent: [], ownedRelations: {} };
        this.setState("nodes", wrapperKey, wrapper); this.registerNode(wrapper);
        children[index] = wrapperKey;
      } else {
        const wrapper = nodes[children[index]], child = wrapper.children[0];
        reroute(child, this.nodeRoutes.get(child)!, `${route}/child:${change.item}`);
        this.unregisterNode(wrapper); this.setState("nodes", wrapper.key, undefined);
        children[index] = child;
      }
      this.setState("nodes", key, "children", reconcile(children));
    }
    this.setState("revision", source.revision);
    this.topology[1](v => v + 1);
  }

  /** Apply proven local canonical deltas. Existing unique occurrences retain
   * their keys; only moved routes, new branches and changed owners are visited.
   * Shared occurrences keep the general projection builder's disambiguation. */
  private updateStructural(change: StructuralChange): boolean {
    const mounted = change.contents.flatMap(key => [...this.contentNodes.get(key) ?? []]);
    if (!mounted.length) return true;
    if (!this.retainStructuralIdentity || change.contents.some(key => (this.contentNodes.get(key)?.size ?? 0) > 1)) return false;
    const source = this.repository.readState(), nodes = unwrap(this.state.nodes);
    // Check before touching indexes. An affected parent can point to an existing
    // shared occurrence whose route cannot be selected by placement alone.
    for (const ck of change.contents) {
      const c = source.contents[ck];
      if (c && [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)].some(pk => (this.placementNodes.get(pk)?.size ?? 0) > 1)) return false;
    }
    const changed = new Set(change.contents), refreshed = new Set<string>(), adopted = new Set<string>(), detached = new Set<string>();
    const reroute = (key: string, route: string) => {
      const old = this.nodeRoutes.get(key)!;
      if (old === route) return;
      if (this.routeKeys.get(old) === key) this.routeKeys.delete(old);
      this.nodeRoutes.set(key, route); this.routeKeys.set(route, key);
      const node = nodes[key];
      for (const child of [...node.children, ...node.inlineContent, ...Object.values(node.ownedRelations)]) {
        const previous = this.nodeRoutes.get(child)!;
        // A child may already have moved out of this parent in the same batch.
        if (previous?.startsWith(old + '/') && this.repository.locationOf(nodes[child].placementKey)?.ownerContentKey === node.contentKey)
          reroute(child, route + previous.slice(old.length));
      }
    };
    const ensure = (pk: string, route: string): string => {
      const existing = this.placementNodes.get(pk)?.values().next().value;
      if (existing) { adopted.add(existing); reroute(existing, route); refresh(existing); return existing; }
      const p = source.placements[pk], c = source.contents[p.contentKey], key = this.nodeKey(route, pk);
      const node: BlockNode = {key, placementKey:pk, contentKey:c.key, viewId:this.viewId, viewType:c.viewType,
        payload:clone(c.payload), children:c.children.map(pk=>ensure(pk,`${route}/child:${pk}`)),
        inlineContent:c.inlineContent.map(pk=>ensure(pk,`${route}/inline:${pk}`)),
        ownedRelations:Object.fromEntries(Object.entries(c.ownedRelations).map(([name,pk])=>[name,ensure(pk,`${route}/relation:${name}:${pk}`)]))};
      this.setState('nodes',key,node); this.registerNode(node); adopted.add(key); refreshed.add(key); return key;
    };
    const refresh = (key: string) => {
      if (refreshed.has(key) || !changed.has(nodes[key].contentKey)) return;
      refreshed.add(key);
      const node = nodes[key], c = source.contents[node.contentKey];
      if (!c) { detached.add(key); return; }
      const route = this.nodeRoutes.get(key)!;
      const children = c.children.map(pk=>ensure(pk,`${route}/child:${pk}`));
      const relations=Object.fromEntries(Object.entries(c.ownedRelations).map(([name,pk])=>[name,ensure(pk,`${route}/relation:${name}:${pk}`)]));
      if(c.compactInline)this.updateCompactInline(key);
      const inline = c.compactInline ? [...this.state.nodes[key].inlineContent] : c.inlineContent.map(pk=>ensure(pk,`${route}/inline:${pk}`));
      const retained = new Set([...children,...inline,...Object.values(relations)]);
      for (const old of [...node.children,...node.inlineContent,...Object.values(node.ownedRelations)]) if (!retained.has(old)) detached.add(old);
      this.setState('nodes',key,'payload',reconcile(clone(c.payload)));
      this.setState('nodes',key,'children',reconcile(children));
      this.setState('nodes',key,'inlineContent',reconcile(inline));
      this.setState('nodes',key,'ownedRelations',reconcile(relations));
    };
    for (const key of mounted) refresh(key);
    const remove = (key: string) => {
      if (adopted.has(key) || !nodes[key]) return;
      const node = nodes[key];
      for (const child of [...node.children,...node.inlineContent,...Object.values(node.ownedRelations)]) remove(child);
      this.unregisterNode(node);
      // Keep historical routes, like the general builder/updateChildren paths:
      // Undo/Redo can restore this same placement at its prior occurrence key.
      this.setState('nodes',key,undefined);
    };
    for (const key of detached) remove(key);
    this.setState('revision',source.revision);
    if (change.childrenOwners.length) this.topology[1](v=>v+1);
    return true;
  }

  private updateSplit(change: SplitChange): void {
    this.updateInline(change.left);
    this.updateChildren(change.parent);
  }

  private appendChildren(parentContentKey: ContentKey): void {
    const source = this.repository.readState(), nodes = unwrap(this.state.nodes);
    for (const key of this.contentNodes.get(parentContentKey) ?? []) {
      const parent = nodes[key];
      if (parent.viewType === 'cyclic-reference') continue;
      const route = this.nodeRoutes.get(key)!, ancestors = new Set<ContentKey>();
      for (const [ancestorKey, ancestorRoute] of this.nodeRoutes) {
        if (nodes[ancestorKey] && (route === ancestorRoute || route.startsWith(ancestorRoute + '/'))) ancestors.add(nodes[ancestorKey].contentKey);
      }
      const children = [...parent.children];
      for (const placement of source.contents[parentContentKey].children.slice(children.length)) {
        const branch = this.build(placement, `${route}/child:${placement}`, ancestors);
        this.setState('nodes',branch.nodes);
        this.register(branch);
        children.push(branch.rootKey);
      }
      this.setState('nodes',key,'children',reconcile(children));
    }
    this.setState('revision',source.revision);
  }

  private updateChildren(parentContentKey: ContentKey): void {
    const source = this.repository.readState();
    const nodes = unwrap(this.state.nodes);
    const addBranch = (placementKey: PlacementKey, route: string): NodeKey => {
      const key = this.nodeKey(route, placementKey);
      if (nodes[key]) return key;
      const content = source.contents[source.placements[placementKey].contentKey];
      // The split validator only permits a new paragraph containing leaf Cells.
      const inlineContent = content.inlineContent.map(cell => addBranch(cell, `${route}/inline:${cell}`));
      const node: BlockNode = {
        key, placementKey, contentKey: content.key, viewId: this.viewId,
        viewType: content.viewType, payload: clone(content.payload), children: [], inlineContent, ownedRelations: {},
      };
      this.setState("nodes", key, node);
      this.registerNode(node);
      return key;
    };
    const removeBranch = (key: NodeKey) => {
      const node = nodes[key];
      for (const cell of node.inlineContent) removeBranch(cell);
      this.unregisterNode(node);
      this.setState("nodes", key, undefined);
    };
    for (const key of this.contentNodes.get(parentContentKey) ?? []) {
      const parent = nodes[key];
      if (parent.viewType === "cyclic-reference") continue;
      const route = this.nodeRoutes.get(key)!;
      const children = source.contents[parentContentKey].children.map(placement => addBranch(placement, `${route}/child:${placement}`));
      const retained = new Set(children);
      for (const oldKey of parent.children) if (!retained.has(oldKey)) removeBranch(oldKey);
      this.setState("nodes", key, "children", reconcile(children));
    }
    this.setState("revision", source.revision);
  }

  private unregister(): void {
    for (const key of this.registeredKeys) this.occurrences.unregister(key);
    this.registeredKeys.clear();
    this.contentNodes.clear();
    this.placementNodes.clear();
  }

  node(key: NodeKey): BlockNode | undefined {
    return this.state.nodes[key];
  }

  /** Indexed mounted occurrences; does not enumerate unrelated projected nodes. */
  nodesForContent(key: ContentKey): BlockNode[] { return [...this.contentNodes.get(key) ?? []].map(k=>this.state.nodes[k]).filter(Boolean); }

  occurrenceCount(placementKey: PlacementKey): number { return this.placementNodes.get(placementKey)?.size ?? 0; }

  nodeForPlacement(placementKey: PlacementKey): BlockNode | undefined {
    const key = this.placementNodes.get(placementKey)?.values().next().value;
    return key ? this.state.nodes[key] : undefined;
  }

  /** Includes removed nodes so a disposable host can release occurrence-local state. */
  occurrenceKeys(): readonly NodeKey[] { return [...this.routeKeys.values()]; }

  dispose(): void {
    this.unsubscribe();
    this.compactMounts.clear();this.compactVersions.clear();
    this.unregister();
  }
}
