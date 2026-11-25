import { createVirtualizer, defaultRangeExtractor, measureElement, type Range } from '@tanstack/solid-virtual';
import { createMemo, createSignal, createEffect, For, Show, onCleanup, onMount, untrack } from 'solid-js';
import { useReactiveView } from '../reactive-editor/context';
import { BlockOutlet } from './block-outlet';
import { presentationEligible } from '../runtime/presentation-eligibility';

/** Non-reactive qualification counters, scoped to the lifetime of a mounted flow. */
export const virtualTextFlowDiagnostics = new WeakMap<HTMLElement, { itemKeys: number; measurements: number }>();

const residentEligibility = new WeakMap<object, boolean>();
function allowsVirtualFlow(properties: readonly {type?:unknown; isDeleted?:unknown}[]) {
  return !properties.some(p => !p.isDeleted && /superposition|show-hide|animation|video|iframe|shader/.test(String(p.type)));
}

/** Evaluated in an occurrence-local memo: typing must not rescan other paragraphs. */
export function plainTextItem(key: string, context: ReturnType<typeof useReactiveView>) {
  const node = context.projection.state.nodes[key];
  if (node?.viewType !== 'standoff-editor-block') return false;
  const compact=context.editor.repository.state.contents[node.contentKey]?.compactInline;
  if (compact ? compact.spans.some(atom=>atom.kind!=='text') :
    node.inlineContent.some(cell => context.projection.state.nodes[cell]?.viewType !== 'text-cell')) return false;
  const properties = context.editor.repository.residentAnnotations(node.contentKey);
  if (!properties) return allowsVirtualFlow((node.payload.standoffProperties ?? []) as {type?:unknown; isDeleted?:unknown}[]);
  // Typing can move endpoints without changing annotation type or visibility.
  const cached = residentEligibility.get(properties);
  if (cached !== undefined) return cached;
  const allowed = allowsVirtualFlow(properties);
  residentEligibility.set(properties, allowed);
  return allowed;
}

/** Deliberately narrow first route: native text/heading siblings, retained parent. */
export function eligibleTextFlowParent(parent: string, keys: readonly string[], context: ReturnType<typeof useReactiveView>) {
  const { editor, projection, passive, coordinates } = context;
  if (!editor.features.virtualTextFlows || passive || (coordinates?.scale() ?? 1) !== 1 || keys.length < 64) return false;
  const owner = projection.state.nodes[parent];
  if (!owner || !['document-block', 'page-block'].includes(owner.viewType)) return false;
  if (owner.viewType === 'page-block') {
    const document = projection.parentOf(parent);
    if (document?.viewType !== 'document-block' || document.children.length !== 1) return false;
  }
  for (let ancestor = projection.parentOf(parent); ancestor; ancestor = projection.parentOf(ancestor.key)) {
    if (['table-block', 'grid-block', 'surface-block', 'indented-list-block', 'tab-row-block', 'sticky-tab-row-block'].includes(ancestor.viewType)) return false;
  }
  return true;
}

export function eligibleTextFlowItem(key: string, context: ReturnType<typeof useReactiveView>) {
  const node = context.projection.state.nodes[key];
  if (node?.viewType !== 'standoff-editor-block' || node.children.length || Object.keys(node.ownedRelations).length || typeof node.payload.checked === 'boolean') return false;
  const properties = (node.payload.blockProperties ?? []) as Array<{ type: string; isDeleted?: boolean }>;
  return properties.every(p => p.isDeleted || /^block\/(alignment|font|indent|margin)(\/|$)/.test(p.type));
}

export function eligibleTextFlow(parent: string, keys: readonly string[], context: ReturnType<typeof useReactiveView>) {
  return eligibleTextFlowParent(parent, keys, context) && keys.every(key=>eligibleTextFlowItem(key, context));
}

export function VirtualTextFlow(props: { parentKey: string; keys: readonly string[] }) {
  const { editor, projection } = useReactiveView();
  let root!: HTMLDivElement;
  const [ready, setReady] = createSignal(false);
  const [localPort, setLocalPort] = createSignal<HTMLElement>();
  const [margin, setMargin] = createSignal(0);
  const [gap, setGap] = createSignal(0);
  const [requested, setRequested] = createSignal<string>();
  const [interacting, setInteracting] = createSignal<string>();
  const [editingWindow, setEditingWindow] = createSignal<string[]>([]);
  const diagnostics = { itemKeys: 0, measurements: 0 };
  const keys = createMemo(() => props.keys.filter(key => presentationEligible(editor, key)));
  const indices = createMemo(() => new Map(keys().map((key, index) => [key, index])));
  const session = () => editor.documentSessions?.forNode(props.parentKey);
  const port = () => {
    if (!ready()) return null;
    const candidate = session()?.host.port?.scrollport ?? localPort();
    // Cell zoom and transformed workspace surfaces have not been qualified in
    // this increment. Their native outlets remain on the existing renderer.
    return candidate?.closest('.textual-workspace, .workspace-spatial') ? null : candidate ?? null;
  };
  const pinned = createMemo(() => {
    const range = editor.crossText.range();
    const candidates = [editor.focus.state.focusedKey, range?.anchor.occurrenceKey, range?.head.occurrenceKey, requested(), interacting()];
    const result = new Set<number>();
    for (const key of editingWindow()) { const index = indices().get(key); if (index !== undefined) result.add(index); }
    for (const key of candidates) {
      const index = key ? indices().get(key) : undefined;
      if (index !== undefined) for (let i = Math.max(0, index - 1); i <= Math.min(keys().length - 1, index + 1); i++) result.add(i);
    }
    return [...result];
  });
  const virtual = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    get count() { return keys().length; },
    getScrollElement: () => port() as HTMLDivElement | null,
    getItemKey: index => { diagnostics.itemKeys++; return keys()[index]; },
    measureElement: (element, entry, instance) => {
      diagnostics.measurements++;
      // Preserve native fractional line heights; the default rounds every row.
      return entry?.borderBoxSize?.[0]?.blockSize ?? measureElement(element, entry, instance);
    },
    estimateSize: () => 52,
    overscan: 6,
    get scrollMargin() { return margin(); },
    get gap() { return gap(); },
    get rangeExtractor() { const keep = pinned(); return (range: Range) => [...new Set([...defaultRangeExtractor(range), ...keep])].sort((a, b) => a - b); },
  });
  // Solid's adapter reconciles virtual item objects by index. Native outlets are
  // instead keyed by occurrence, preserving identity through insertion and Undo.
  const items = createMemo(() => new Map(virtual.getVirtualItems().map(item => [String(item.key), { ...item }])));
  const mountedKeys = createMemo(() => [...items().keys()]);
  onMount(() => {
    virtualTextFlowDiagnostics.set(root, diagnostics);
    onCleanup(() => virtualTextFlowDiagnostics.delete(root));
    let ancestor = root.parentElement;
    while (ancestor && !/(auto|scroll)/.test(getComputedStyle(ancestor).overflowY)) ancestor = ancestor.parentElement;
    setLocalPort(ancestor ?? undefined);
    setReady(true);
    let editingKey: string | undefined;
    const retainEditingWindow = (event: Event) => {
      const hit = editor.mounts.resolveEvent(event);
      if (!hit || !indices().has(hit.nodeKey) || hit.nodeKey === editingKey) return;
      editingKey = hit.nodeKey;
      const range = virtual.range;
      // Preserve the whole current window as a stable DOM subsequence. Keeping
      // only the focused row lets list reconciliation move it and cancel IME.
      setEditingWindow(virtual.getVirtualItems().filter(item => range && item.index >= range.startIndex - 6 && item.index <= range.endIndex + 6).map(item => String(item.key)));
    };
    const begin = (event: Event) => { const hit = editor.mounts.resolveEvent(event); if (hit && indices().has(hit.nodeKey)) setInteracting(hit.nodeKey); };
    const end = () => { queueMicrotask(() => { if (alive && (!interacting() || !editor.mounts.get(interacting()!)?.composing)) setInteracting(undefined); }); };
    root.addEventListener('pointerdown', begin, true); root.addEventListener('compositionstart', begin, true);
    root.addEventListener('focusin', retainEditingWindow, true);
    document.addEventListener('pointerup', end, true); document.addEventListener('compositionend', end, true);
    onCleanup(() => { root.removeEventListener('focusin', retainEditingWindow, true); root.removeEventListener('pointerdown', begin, true); root.removeEventListener('compositionstart', begin, true); document.removeEventListener('pointerup', end, true); document.removeEventListener('compositionend', end, true); });
  });
  createEffect(() => {
    const scroll = port(); if (!scroll) return;
    let width = 0;
    const measure = () => {
      if (!root.isConnected || !scroll.clientWidth) return;
      setGap(parseFloat(getComputedStyle(root.parentElement!).rowGap) || 0);
      setMargin(root.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - scroll.clientTop);
      if (width && width !== root.clientWidth) virtual.measure();
      width = root.clientWidth;
    };
    untrack(measure);
    const observer = new ResizeObserver(measure); observer.observe(scroll); observer.observe(root);
    const font = () => { virtual.measure(); measure(); };
    document.fonts?.addEventListener('loadingdone', font);
    onCleanup(() => { observer.disconnect(); document.fonts?.removeEventListener('loadingdone', font); });
  });
  let alive = true;
  onCleanup(() => { alive = false; });
  onCleanup(editor.focus.registerRenderer((key, current) => {
    if (!port()) return;
    const index = indices().get(key);
    if (index === undefined) return;
    return (async () => {
      if (!current() || !alive) return false;
      setRequested(key);
      virtual.scrollToIndex(index, { align: 'auto' });
      // Allow native mount + browser layout before the existing caller consumes geometry.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (!current() || !alive || !indices().has(key)) { if (requested() === key) setRequested(undefined); return false; }
      virtual.scrollToIndex(indices().get(key)!, { align: 'auto' });
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (!current() || !alive || !indices().has(key)) { if (requested() === key) setRequested(undefined); return false; }
      const found = !!editor.mounts.get(key);
      if (requested() === key) setRequested(undefined);
      return found;
    })();
  }));
  return <div ref={root} data-virtual-text-flow={port() ? props.parentKey : undefined} style={{ display: port() ? 'block' : 'contents', position: 'relative', height: port() ? `${virtual.getTotalSize()}px` : undefined, 'overflow-anchor': 'none' }}>
    <Show when={!ready() || port()} fallback={<For each={props.keys}>{key => <BlockOutlet nodeKey={key} />}</For>}>
    <For each={mountedKeys()}>{key => {
      const item = () => items().get(key)!;
      return <div ref={element => { queueMicrotask(() => { if (alive && element.isConnected) virtual.measureElement(element); }); }} data-index={item()?.index}
        style={{ position: 'absolute', top: '0', left: '0', width: '100%', display: 'flow-root', transform: `translateY(${(item()?.start ?? 0) - margin()}px)` }}>
        <BlockOutlet nodeKey={key} />
      </div>;
    }}</For>
    </Show>
  </div>;
}
