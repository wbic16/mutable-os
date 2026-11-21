import { createStore } from "solid-js/store";
import type { NodeKey } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { ancestorPath, type SearchRange, type SearchScope } from "./text-search";
import type { DocumentPositionAnchor, DocumentPositionMarker } from "./document-position-markers";

export type MinimapBlendMode = "multiply" | "source-over";
export type MinimapSide = "right" | "left";

export interface MinimapOptions {
  side: MinimapSide;
  width: number;
  height: "available" | number;
  fallbackHeight: number;
  blendMode: MinimapBlendMode;
  minimumMarkerThickness: number;
}

export type MinimapAnchor =
  | DocumentPositionAnchor
  | { kind: "ratio"; top: number; height?: number };

export interface MinimapMarker extends Omit<DocumentPositionMarker, "anchor"> {
  anchor: MinimapAnchor;
  colour: string;
  opacity: number;
  minimumThickness?: number;
}

export interface MinimapLayer {
  owner: string;
  pageKey: NodeKey;
  visible: boolean;
  priority: number;
  hiddenGroups: ReadonlySet<string>;
  active?: string;
  markers: readonly MinimapMarker[];
}

export interface MinimapLayerInput {
  pageKey: NodeKey;
  visible?: boolean;
  priority?: number;
  markers: ReadonlyArray<Omit<MinimapMarker, "colour" | "opacity"> & { colour?: string; opacity?: number }>;
  onActivate?: (marker: MinimapMarker) => void | Promise<void>;
}

export const defaultMinimapOptions: Readonly<MinimapOptions> = Object.freeze({
  side: "right",
  width: 20,
  height: "available",
  fallbackHeight: 480,
  blendMode: "multiply",
  minimumMarkerThickness: 2,
});

const finitePositive = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

function marker(input: MinimapLayerInput["markers"][number]): MinimapMarker | undefined {
  if (!input.id || !input.anchor) return;
  if (input.anchor.kind === "ratio" && !Number.isFinite(input.anchor.top)) return;
  const anchor = input.anchor.kind === "text-range"
    ? Object.freeze({ ...input.anchor, range: Object.freeze({ ...input.anchor.range }) })
    : Object.freeze({ ...input.anchor });
  return Object.freeze({
    ...input,
    anchor: anchor as MinimapAnchor,
    colour: input.colour || "#ffd34d",
    opacity: Math.max(0, Math.min(1, Number.isFinite(input.opacity) ? Number(input.opacity) : .45)),
    ...(input.minimumThickness === undefined ? {} : { minimumThickness: finitePositive(input.minimumThickness, defaultMinimapOptions.minimumMarkerThickness) }),
  });
}

/** Session-only marker registry. Nothing in this service is encoded or added to repository history. */
export class MinimapService {
  readonly state: { revision: number; options: MinimapOptions };
  private readonly setState: (...args: any[]) => void;
  private readonly layers = new Map<string, MinimapLayer>();
  private readonly activators = new Map<string, NonNullable<MinimapLayerInput["onActivate"]>>();

  constructor(options: Partial<MinimapOptions> = {}) {
    const [state, setState] = createStore({ revision: 0, options: this.normaliseOptions(options) });
    this.state = state;
    this.setState = setState;
  }

  configure(options: Partial<MinimapOptions>) {
    this.setState("options", this.normaliseOptions({ ...this.state.options, ...options }));
    this.bump();
  }

  attach(owner: string, input: MinimapLayerInput) {
    const markers = input.markers.map(marker).filter((item): item is MinimapMarker => !!item);
    const previous = this.layers.get(owner), groups = new Set(markers.flatMap(item => item.group ? [item.group] : []));
    const hiddenGroups = new Set([...(previous?.hiddenGroups ?? [])].filter(group => groups.has(group)));
    const active = previous?.active && markers.some(item => item.id === previous.active || item.group === previous.active) ? previous.active : undefined;
    this.layers.set(owner, Object.freeze({
      owner,
      pageKey: input.pageKey,
      visible: input.visible ?? previous?.visible ?? true,
      priority: Number.isFinite(input.priority) ? Number(input.priority) : 0,
      hiddenGroups,
      active,
      markers: Object.freeze(markers),
    }));
    if (input.onActivate) this.activators.set(owner, input.onActivate);
    else this.activators.delete(owner);
    this.bump();
  }

  layersFor(pageKey: NodeKey): readonly MinimapLayer[] {
    this.state.revision;
    return [...this.layers.values()].filter(layer => layer.pageKey === pageKey).sort((a, b) => a.priority - b.priority || a.owner.localeCompare(b.owner));
  }

  hasVisibleMarkers(pageKey: NodeKey) {
    return this.layersFor(pageKey).some(layer => layer.visible && layer.markers.some(item => !item.group || !layer.hiddenGroups.has(item.group)));
  }

  setLayerVisible(owner: string, visible: boolean) {
    const layer = this.layers.get(owner);
    if (!layer || layer.visible === visible) return;
    this.layers.set(owner, Object.freeze({ ...layer, visible }));
    this.bump();
  }

  setGroupVisible(owner: string, group: string, visible: boolean) {
    const layer = this.layers.get(owner);
    if (!layer) return;
    const hiddenGroups = new Set(layer.hiddenGroups);
    visible ? hiddenGroups.delete(group) : hiddenGroups.add(group);
    this.layers.set(owner, Object.freeze({ ...layer, hiddenGroups }));
    this.bump();
  }

  setActive(owner: string, markerOrGroup?: string) {
    const layer = this.layers.get(owner);
    if (!layer || layer.active === markerOrGroup) return;
    this.layers.set(owner, Object.freeze({ ...layer, active: markerOrGroup }));
    this.bump();
  }

  activate(owner: string, markerId: string) {
    const layer = this.layers.get(owner);
    const target = layer?.markers.find(item => item.id === markerId);
    if (!layer || !target || !layer.visible || (target.group && layer.hiddenGroups.has(target.group))) return false;
    this.setActive(owner, target.group ?? target.id);
    try {
      const result = this.activators.get(owner)?.(target);
      if (result && typeof result.catch === "function") void result.catch(() => undefined);
    } catch { return false; }
    return true;
  }

  invalidateContent(contentKey: string) {
    let changed = false;
    for (const [owner, layer] of this.layers) {
      const markers = layer.markers.filter(item => item.anchor.kind !== "text-range" || item.anchor.range.contentKey !== contentKey);
      if (markers.length === layer.markers.length) continue;
      this.layers.set(owner, Object.freeze({ ...layer, markers: Object.freeze(markers) }));
      changed = true;
    }
    if (changed) this.bump();
  }

  dispose(owner: string) {
    if (!this.layers.delete(owner)) return;
    this.activators.delete(owner);
    this.bump();
  }

  clearAll() {
    if (!this.layers.size && !this.activators.size) return;
    this.layers.clear();
    this.activators.clear();
    this.bump();
  }

  private normaliseOptions(options: Partial<MinimapOptions>): MinimapOptions {
    const height = options.height === undefined || options.height === "available" ? "available" : finitePositive(options.height, defaultMinimapOptions.fallbackHeight);
    return {
      side: options.side === "left" ? "left" : "right",
      width: finitePositive(options.width, defaultMinimapOptions.width),
      height,
      fallbackHeight: finitePositive(options.fallbackHeight, defaultMinimapOptions.fallbackHeight),
      blendMode: options.blendMode === "source-over" ? "source-over" : "multiply",
      minimumMarkerThickness: finitePositive(options.minimumMarkerThickness, defaultMinimapOptions.minimumMarkerThickness),
    };
  }

  private bump() { this.setState("revision", (revision: number) => revision + 1); }
}

export function pageForNode(editor: ReactiveEditor, nodeKey: NodeKey): NodeKey | undefined {
  // The shared structural query includes children/owned relations, not inline
  // Cells. Avoid creating proxies and a parent map for the entire Cell table.
  return ancestorPath(editor, nodeKey).reverse().find(node =>
    node.viewType === 'page-block' || node.viewType === 'fixed-size-page-block')?.key;
}

export function nodeKeysForPage(editor: ReactiveEditor, pageKey: NodeKey): ReadonlySet<NodeKey> {
  const page = editor.node(pageKey), projection = page && editor.projections.get(page.viewId);
  const keys = new Set<NodeKey>();
  const visit = (key: NodeKey) => {
    if (keys.has(key)) return;
    const node = projection?.state.nodes[key]; if (!node) return;
    keys.add(key); node.children.forEach(visit); Object.values(node.ownedRelations).forEach(visit);
  };
  visit(pageKey); return keys;
}

/** Pick the Page within a Document scope that currently owns focus, then the first visible Page. */
export function currentPageForScope(editor: ReactiveEditor, scope: SearchScope, preferred: readonly (NodeKey | undefined)[] = []): NodeKey | undefined {
  const projection = editor.projections.get(scope.viewId);
  if (!projection) return;
  const belongs = (pageKey: NodeKey) => ancestorPath(editor, pageKey).some(node => node.key === scope.rootKey);
  for (const key of preferred) {
    if (!key) continue;
    const pageKey = pageForNode(editor, key);
    if (pageKey && belongs(pageKey)) return pageKey;
  }
  const pages = Object.values(projection.state.nodes).filter(node => ["page-block", "fixed-size-page-block"].includes(node.viewType) && belongs(node.key));
  return pages.find(page => {
    const root = editor.mounts.get(page.key)?.root;
    return root?.isConnected && !root.closest('[hidden], [aria-hidden="true"]');
  })?.key ?? pages[0]?.key;
}
