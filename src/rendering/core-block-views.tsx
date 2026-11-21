import { activeViewChild } from '../runtime/presentation-eligibility';
import {observeContributionImage} from '../features/dialectic/image-load';
import {ImageSizeGate} from '../features/dialectic/image-size-gate';
import { tabOrientation } from '../block-tree/tab-orientation';
import './tab-orientation.css';
import { TableControl, CellControls } from './table-controls';
import { cancelTableReveal, revealTableCell } from '../runtime/table-presentation';
import { TaskControl, StandaloneTaskDisclosure } from './task-control';
import { taskState } from '../runtime/tasks';
import { ReverseInformation } from './reversible-surface';
import { listItemChildren, listItemOwner, setListItemCollapsed } from '../runtime/text-lists';
import { WindowRestorationBoundary } from "./window-restoration";
import { createWindowMaximize } from "./window-maximize";
import { ManagedWindowFrame, RetainedWindowBody, useManagedWindowOwner } from "./window-manager";
import { managedAsset } from '../interchange/managed-asset';
import { inspectUri } from '../interchange/uri';
import { createWindowPresentation } from "./window-presentation";
import { useDocumentTabHost, tabDocumentTarget } from "./document-tab-context";
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, untrack } from "solid-js";
import { Dynamic, Portal } from "solid-js/web";
import { unwrap } from "solid-js/store";
import type { BlockViewProps, NodeKey } from "../block-tree/types";
import { useReactiveView } from "../reactive-editor/context";
import { blockAppearance } from "./appearance";
import { BlockOutlet, ChildBlocks, RelationBlocks } from "./block-outlet";
import { BackgroundMedia } from "./background-media";
import { youtubeId } from "./backgrounds";
import { DocumentStatusBar } from "./document-status-bar";
import type { Toolset } from "./compact-toolbar";
import { DocumentStyleBar } from "./document-style-bar";
import { DocumentMarginContext, type DocumentMarginEntry } from "./document-margins";
import { DocumentMarginDrawer } from "./document-margin-drawer";
import { DocumentMarginIndicators } from "./document-margin-indicators";
import { createFloatingWindowResize, FloatingWindowResizeHandle } from "./floating-window-resize";
import { PageMinimap } from "./page-minimap";
import { WindowIcon, resolvedWindowIcon, resolvedWindowState } from "./window-icon";
import { RetainedInkDocument } from "./retained-document-view";

function useContainerMount(nodeKey: NodeKey, root: () => HTMLElement) {
  const { editor, passive } = useReactiveView();
  let dispose: (() => void) | undefined;
  onMount(() => {
    const element = root();
    dispose = editor.mounts.register(nodeKey, {
      root: element,
      focusElement: element,
      inputPolicy: passive ? "opaque-widget" : "container",
      focus: () => element.focus({ preventScroll: true }),
    });
  });
  onCleanup(() => dispose?.());
}

function data(nodeKey: NodeKey, node: () => any) {
  return {
    "data-block-id": (node()?.payload.id as string | undefined) ?? "",
    "data-client-id": nodeKey,
    "data-runtime-key": nodeKey,
    "data-block-type": (node()?.payload.type as string | undefined) ?? node()?.viewType,
  };
}

export function HorizontalLineView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  return <div ref={root} class="abstract-block reactive-horizontal-line" tabIndex={-1} {...data(props.nodeKey, node)}>
    <hr style={{ border: '0', 'border-top': '1px solid currentColor', margin: '0.5em 0' }} />
    <RelationBlocks parentKey={props.nodeKey} /><ChildBlocks parentKey={props.nodeKey} />
  </div>;
}

export function GenericContainerView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const appearance = createMemo(() => blockAppearance(node()));
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  return (
    <div
      ref={root}
      classList={{ "reactive-task-row": editor.features.taskLists && taskState(node()) !== undefined, "reactive-task-row--checked": editor.features.taskLists && taskState(node()) === true }}
      data-task-item={editor.features.taskLists && taskState(node()) !== undefined ? props.nodeKey : undefined}
      class={`abstract-block reactive-generic-block ${(node()?.payload.metadata as any)?.structuralContainer ? "structural-container" : ""} ${appearance().classes.join(" ")}`}
      style={{ ...appearance().style, ...(node()?.viewType === "container-block" && (node()?.payload.metadata as any)?.height ? { height: `${Number((node()?.payload.metadata as any).height)}px`, "overflow-y": "auto" } : {}) }}
      tabIndex={-1}
      {...data(props.nodeKey, node)}
    >
      <Show when={editor.features.taskLists && taskState(node()) !== undefined}><StandaloneTaskDisclosure nodeKey={props.nodeKey} /><TaskControl nodeKey={props.nodeKey} /></Show>
      <RelationBlocks parentKey={props.nodeKey} />
      <ChildBlocks parentKey={props.nodeKey} />
    </div>
  );
}

export function PageView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const windowOwner=useManagedWindowOwner();
  const showMinimap=createMemo(()=>editor.minimap.hasVisibleMarkers(props.nodeKey));
  // A rail changes the window minimum, whereas changing its markers does not.
  // Notify only this owner and coalesce its capability read after DOM classes update.
  createEffect(()=>{showMinimap();untrack(()=>windowOwner?.manager.layout.invalidateMinimum(windowOwner.windowId));});
  const node = () => projection.state.nodes[props.nodeKey];
  const appearance = createMemo(() => blockAppearance(node()));
  let root!: HTMLElement;
  let main!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  return (
    <article ref={root} class={`abstract-block reactive-page ${appearance().classes.join(" ")}`} classList={{ [`reactive-page--minimap-${editor.minimap.state.options.side}`]: showMinimap() }} style={appearance().style} tabIndex={-1} {...data(props.nodeKey, node)}>
      <RelationBlocks parentKey={props.nodeKey} />
      <div ref={main} class="reactive-page__main"><ChildBlocks parentKey={props.nodeKey} /></div>
      <DocumentMarginIndicators page={() => root} main={() => main} />
      <Show when={showMinimap()}><PageMinimap pageKey={props.nodeKey} page={() => root} main={() => main} /></Show>
    </article>
  );
}

export function ListView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  const owner = createMemo(() => listItemOwner(projection, props.nodeKey));
  const collapsed = () => !!(owner()?.payload.metadata as any)?.listCollapsed;
  // Markers depend on structure/metadata, never paragraph text or caret updates.
  const markers = createMemo(() => {
    const list = (node()?.payload.metadata as any)?.htmlList ?? {};
    // Keep subsequent markers exact even when a valid start approaches MAX_SAFE_INTEGER.
    let ordinal = BigInt(Number.isSafeInteger(list.start) ? list.start : 1);
    return new Map((node()?.children ?? []).map(key => {
      if (projection.state.nodes[key]?.viewType === 'indented-list-block') return [key, ''];
      const item = (projection.state.nodes[key]?.payload.metadata as any)?.htmlListItem;
      if (Number.isSafeInteger(item?.value)) ordinal = BigInt(item.value);
      const marker = list.ordered ? `${ordinal}.` : '•'; ordinal += list.reversed ? -1n : 1n;
      return [key, marker];
    }));
  });
  return <div ref={root} id={`list-${props.nodeKey}`} class="abstract-block reactive-list" role="list" tabIndex={-1} hidden={collapsed()} {...data(props.nodeKey, node)}>
    <For each={node()?.children ?? []}>{key => <Show when={projection.state.nodes[key]?.viewType !== 'indented-list-block'} fallback={<BlockOutlet nodeKey={key} />}>
      <ListItem nodeKey={key} marker={markers().get(key) ?? '•'} />
    </Show>}</For>
  </div>;
}

function ListItem(props: { nodeKey: NodeKey; marker: string }) {
  const { editor, projection, passive } = useReactiveView();
  const children = createMemo(() => listItemChildren(projection, props.nodeKey));
  const task = () => (editor.features.taskLists || projection.state.nodes[props.nodeKey]?.viewType === "checkbox-block") && taskState(projection.state.nodes[props.nodeKey]) !== undefined;
  const collapsed = () => !!(projection.state.nodes[props.nodeKey]?.payload.metadata as any)?.listCollapsed;
  const toggle = () => {
    if(passive||!editor.canEditText(props.nodeKey))return;
    const next = !collapsed();
    let focused = editor.focus.state.focusedKey && projection.state.nodes[editor.focus.state.focusedKey];
    let hidesFocus = false;
    while (focused) {
      if (children().includes(focused.key)) { hidesFocus = true; break; }
      focused = projection.parentOf(focused.key);
    }
    // A click must not strand the caret inside the newly hidden branch.
    if (next && hidesFocus) {
      const item = projection.state.nodes[props.nodeKey];
      const target = item.viewType === 'standoff-editor-block' ? item : item.children.map(k => projection.state.nodes[k]).find(n => n?.viewType === 'standoff-editor-block');
      if (target) editor.focus.request(target.key, { caret: 'end', reason: 'collapse-list' });
    }
    setListItemCollapsed(editor, props.nodeKey, next);
  };
  return <div role="listitem" class="reactive-imported-list-item" classList={{ "reactive-task-list-item": task() }} data-list-item={props.nodeKey}>
    <Show when={children().length} fallback={<span class="reactive-imported-list-marker" contentEditable={false} aria-hidden="true">{task() ? "" : props.marker}</span>}>
      <button disabled={passive||!editor.canEditText(props.nodeKey)} type="button" class="reactive-imported-list-marker reactive-list-toggle" classList={{ 'reactive-list-toggle--collapsed': collapsed() }}
        contentEditable={false} data-native-context-menu aria-expanded={!collapsed()} aria-controls={children().map(k => `list-${k}`).join(' ')}
        aria-label={collapsed() ? 'Expand child list' : 'Collapse child list'} title={collapsed() ? 'Expand child list' : 'Collapse child list'}
        onPointerDown={e => { e.preventDefault(); e.stopPropagation(); }} onClick={e => { e.stopPropagation(); toggle(); }}
        onKeyDown={e => {
          if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey || !['Enter', ' '].includes(e.key)) return;
          e.preventDefault(); e.stopPropagation(); if (!e.repeat) toggle();
        }}
      >{task() ? (collapsed() ? "▸" : "▾") : props.marker}</button>
    </Show>
    <BlockOutlet nodeKey={props.nodeKey} />
  </div>;
}

export function TableView(props: BlockViewProps) {
  const { editor, projection, passive } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  let root!: HTMLDivElement;
  let scroll!: HTMLDivElement;
  onCleanup(() => { if (scroll) cancelTableReveal(scroll); });
  useContainerMount(props.nodeKey, () => root);
  const columns = () => projection.state.nodes[node()?.children[0]]?.children.length ?? 1;
  return <div ref={root} class="abstract-block reactive-table-viewport" tabIndex={-1} {...data(props.nodeKey, node)}>
    <Show when={!passive && editor.features.tableLayouts}><div class="table-layout-toolbar" contentEditable={false}>
      <TableControl nodeKey={props.nodeKey} label="Table controls" />
      <button type="button" data-table-controls aria-pressed={editor.tables.guides(projection.viewId)} onClick={() => editor.tables.toggleGuides(projection.viewId)}>Show table guides</button>
    </div></Show>
    <div ref={scroll} class="reactive-table-scroll" tabIndex={0} role="region" aria-label="Table columns" onFocusIn={event => { if (event.target instanceof HTMLElement) revealTableCell(event.target); }}>
      <div class="reactive-table" role="table" aria-rowcount={node()?.children.length} aria-colcount={columns()} style={{ 'min-width': `${columns() * 14}em` }}><ChildBlocks parentKey={props.nodeKey} /></div>
    </div>
  </div>;
}

export function TableRowView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  return <div ref={root} class="abstract-block reactive-table-row" role="row" tabIndex={-1} {...data(props.nodeKey, node)}><ChildBlocks parentKey={props.nodeKey} /></div>;
}

export function TableCellView(props: BlockViewProps) {
  const { editor, projection, passive } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  return <div ref={root} class="abstract-block reactive-table-cell" classList={{ 'table-guides-hidden': !editor.tables.guides(projection.viewId), 'table-controls-enabled': editor.features.tableLayouts }} role={(node()?.payload.metadata as any)?.htmlTableCell?.header ? 'columnheader' : 'cell'} tabIndex={-1} {...data(props.nodeKey, node)}>
    <Show when={!passive && editor.features.tableLayouts}><CellControls nodeKey={props.nodeKey} /></Show>
    <ChildBlocks parentKey={props.nodeKey} />
  </div>;
}

export function CheckboxView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  return <div ref={root} class="abstract-block reactive-checkbox reactive-task-row" data-task-item={props.nodeKey}
    classList={{ 'reactive-task-row--checked': taskState(node()) === true }} {...data(props.nodeKey, node)}>
    <StandaloneTaskDisclosure nodeKey={props.nodeKey} /><TaskControl nodeKey={props.nodeKey} />
    <div class="reactive-task-content"><ChildBlocks parentKey={props.nodeKey} /></div>
  </div>;
}

export function TabRowView(props: BlockViewProps) {
  const { editor, projection, passive } = useReactiveView();
  const documents = useDocumentTabHost();
  const node = () => projection.state.nodes[props.nodeKey];
  const active = () => node() && activeViewChild(editor, node()!);
  let previousFlags = "";
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  createEffect(() => {
    const children = node()?.children ?? [];
    // Reordering labels is not a change to authored active flags.
    const flags = JSON.stringify([...children].sort().map(key => [key, (projection.state.nodes[key]?.payload.metadata as any)?.active]));
    if (flags !== previousFlags) {
      if (previousFlags) {
        const current = untrack(active), marked = children.find(key => (projection.state.nodes[key]?.payload.metadata as any)?.active);
        editor.setViewChild(props.nodeKey, marked ?? (current && children.includes(current) ? current : node()?.viewType === 'sticky-tab-row-block' ? '' : children[0]));
      }
      previousFlags = flags;
    }
  });
  return (
    <div ref={root} class="abstract-block reactive-tabs" data-tab-orientation={tabOrientation(node()?.payload.metadata, editor.features.verticalTabs)} tabIndex={-1} {...data(props.nodeKey, node)}>
      <div class="reactive-tabs__labels" role="tablist" aria-orientation={tabOrientation(node()?.payload.metadata, editor.features.verticalTabs)}>
        <For each={node()?.children ?? []}>
          {(key, index) => {
            const child = () => projection.state.nodes[key];
            const metadata = () => child()?.payload.metadata as Record<string, unknown> | undefined;
            const title = () => { const id = tabDocumentTarget(metadata()); return (id && documents?.title(id)) || metadata()?.name || metadata()?.text || `Tab ${index() + 1}`; };
            return <button type="button" role="tab" data-context-target={key} aria-selected={active() === key} onClick={() => { editor.setViewChild(props.nodeKey, key); if (!passive && !tabDocumentTarget(metadata())) { const target = child()?.children[0] ?? key; editor.focus.request(target, { reason: "activate-tab" }); } }}>{String(title())}</button>;
          }}
        </For>
      </div>
      <For each={node()?.children ?? []}>{(key) => <Show when={active() === key}><div class="reactive-tabs__panel" role="tabpanel"><BlockOutlet nodeKey={key} /></div></Show>}</For>
    </div>
  );
}

export function StickyTabRowView(props: BlockViewProps) {
  const { editor, projection, passive } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const active = () => node() && activeViewChild(editor, node()!);
  let previousFlags = "";
  let root!: HTMLElement;
  useContainerMount(props.nodeKey, () => root);
  createEffect(() => {
    const children = node()?.children ?? [];
    // Reordering labels is not a change to authored active flags.
    const flags = JSON.stringify([...children].sort().map(key => [key, (projection.state.nodes[key]?.payload.metadata as any)?.active]));
    if (flags !== previousFlags) {
      if (previousFlags) {
        const current = untrack(active), marked = children.find(key => (projection.state.nodes[key]?.payload.metadata as any)?.active);
        editor.setViewChild(props.nodeKey, marked ?? (current && children.includes(current) ? current : node()?.viewType === 'sticky-tab-row-block' ? '' : children[0]));
      }
      previousFlags = flags;
    }
  });
  return (
    <aside ref={root} class="abstract-block reactive-sticky-tabs" {...data(props.nodeKey, node)}>
      <div class="reactive-sticky-tabs__labels" role="tablist" aria-label="Sticky tabs">
        <For each={node()?.children ?? []}>{(key, index) => {
          const child = () => projection.state.nodes[key];
          const metadata = () => child()?.payload.metadata as Record<string, unknown> | undefined;
          return (
            <button
              type="button"
              role="tab"
              data-context-target={key}
              aria-selected={active() === key}
              style={{
                color: String(metadata()?.color ?? "#23322e"),
                "background-color": String(metadata()?.backgroundColor ?? "gold"),
              }}
              onClick={() => {
                const next = active() === key ? undefined : key;
                editor.setViewChild(props.nodeKey, next ?? "");
                if (next && !passive) {
                  const target = child()?.children[0] ?? key;
                  queueMicrotask(() => editor.focus.request(target, { reason: "activate-sticky-tab", caret: "start" }));
                }
              }}
            >
              {String(metadata()?.text ?? metadata()?.name ?? `Sticky tab ${index() + 1}`)}
            </button>
          );
        }}</For>
      </div>
      <For each={node()?.children ?? []}>{(key, index) => (
        <Show when={active() === key}>
          <div class="reactive-sticky-tabs__panel" role="tabpanel" style={{ top: `${index() * 38}px` }}>
            <BlockOutlet nodeKey={key} />
          </div>
        </Show>
      )}</For>
    </aside>
  );
}

export function FlippableSurfaceView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const children = () => node()?.children ?? [];
  const active = () => editor.viewChildren[props.nodeKey] ?? children().find((key) => {
    const metadata = projection.state.nodes[key]?.payload.metadata as Record<string, unknown> | undefined;
    return metadata?.active === true;
  }) ?? children()[0];
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  const label = (key: NodeKey, index: number) => {
    const child = projection.state.nodes[key];
    const metadata = child?.payload.metadata as Record<string, unknown> | undefined;
    if (typeof metadata?.name === "string") return metadata.name;
    if (typeof metadata?.text === "string") return metadata.text;
    if (child?.children.some((childKey) => projection.state.nodes[childKey]?.viewType === "image-block")) return "Image side";
    if (child?.children.some((childKey) => {
      const type = projection.state.nodes[childKey]?.viewType ?? "";
      return type.includes("text") || type === "standoff-editor-block" || type === "code-mirror-block";
    })) return "Text side";
    return `Side ${index + 1}`;
  };
  const flip = () => {
    const available = children();
    if (available.length < 2) return;
    const current = Math.max(0, available.indexOf(active()!));
    const next = available[(current + 1) % available.length];
    editor.setViewChild(props.nodeKey, undefined);
    editor.commands.transaction("Flip Surface", () => {
      available.forEach((key) => {
        const child = projection.state.nodes[key];
        const metadata = (child?.payload.metadata as Record<string, unknown> | undefined) ?? {};
        editor.commands.setPayloadField(key, "metadata", { ...metadata, active: key === next }, "Flip Surface");
      });
    });
    const target = projection.state.nodes[next]?.children[0] ?? next;
    queueMicrotask(() => editor.focus.request(target, { reason: "flip-surface" }));
  };
  const nextLabel = () => {
    const available = children();
    const current = Math.max(0, available.indexOf(active()!));
    const next = available[(current + 1) % Math.max(1, available.length)];
    return next ? label(next, available.indexOf(next)) : "other side";
  };
  return (
    <section ref={root} class="abstract-block reactive-flippable" tabIndex={-1} aria-label="Two-sided Block" onDblClick={(event) => { event.preventDefault(); flip(); }} {...data(props.nodeKey, node)}>
      <button type="button" class="reactive-flippable__flip" onClick={flip}>
        Flip to {nextLabel().toLowerCase()}
      </button>
      <div class="reactive-flippable__card">
        <For each={children()}>{(key, index) => (
          <div
            class="reactive-flippable__side"
            classList={{
              "reactive-flippable__side--front": index() === 0,
              "reactive-flippable__side--back": index() !== 0,
              "reactive-flippable__side--active": active() === key,
            }}
            aria-hidden={active() !== key}
            data-side-label={label(key, index())}
          >
            <BlockOutlet nodeKey={key} />
          </div>
        )}</For>
      </div>
      <p class="reactive-flippable__hint">Double-click the card to turn it over.</p>
    </section>
  );
}

type CanvasBox = { id: string; x: number; y: number };

export function CanvasPreviewView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const [boxes, setBoxes] = createSignal<CanvasBox[]>([
    { id: "canvas-box-1", x: 145, y: 26 },
    { id: "canvas-box-2", x: 520, y: 176 },
  ]);
  let root!: HTMLDivElement;
  let drag: { id: string; pointerId: number; x: number; y: number; originX: number; originY: number } | undefined;
  useContainerMount(props.nodeKey, () => root);
  const move = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const x = Math.max(0, drag.originX + event.clientX - drag.x);
    const y = Math.max(0, drag.originY + event.clientY - drag.y);
    setBoxes((items) => items.map((item) => item.id === drag!.id ? { ...item, x, y } : item));
  };
  const end = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) drag = undefined;
  };
  return (
    <div ref={root} class="abstract-block reactive-canvas-preview" tabIndex={-1} onPointerMove={move} onPointerUp={end} onPointerCancel={end} {...data(props.nodeKey, node)}>
      <div class="reactive-canvas-preview__world">
        <For each={boxes()}>{(box) => (
          <button
            type="button"
            class="reactive-canvas-preview__box"
            style={{ left: `${box.x}px`, top: `${box.y}px` }}
            onPointerDown={(event) => {
              drag = { id: box.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: box.x, originY: box.y };
              event.currentTarget.setPointerCapture?.(event.pointerId);
              event.stopPropagation();
            }}
          >Drag Me!</button>
        )}</For>
      </div>
      <div class="reactive-canvas-preview__minimap" aria-label="Canvas minimap">
        <For each={boxes()}>{(box) => <i style={{ left: `${box.x * .18}px`, top: `${box.y * .18}px` }} />}</For>
      </div>
      <ChildBlocks parentKey={props.nodeKey} />
    </div>
  );
}

export function TabPanelView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const documents = useDocumentTabHost();
  const node = () => projection.state.nodes[props.nodeKey];
  const target = () => tabDocumentTarget(node()?.payload.metadata);
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  return <div ref={root} class="abstract-block reactive-tab-panel" tabIndex={-1} {...data(props.nodeKey, node)}><Show when={target()} fallback={<ChildBlocks parentKey={props.nodeKey} />} keyed>{id => documents ? <Dynamic component={documents.view} documentId={id} tabKey={props.nodeKey} /> : <p>Document view unavailable. Open this Document through its owning application.</p>}</Show></div>;
}

export function ImageView(props: BlockViewProps) {
  const { editor, projection, passive } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const metadata = () => node()?.payload.metadata as Record<string, unknown> | undefined;
  const appearance = createMemo(() => blockAppearance(node()));
  let root!: HTMLElement;
  useContainerMount(props.nodeKey, () => root);
  return (
    <figure ref={root} class={`abstract-block reactive-image ${appearance().classes.join(" ")}`} style={appearance().style} tabIndex={-1} {...data(props.nodeKey, node)}>
      <ImageSizeGate editor={editor} projection={projection} nodeKey={props.nodeKey} source={()=>managedAsset(node()?.payload.asset)?'':String(metadata()?.url??node()?.payload.filename??'')} enabled={!passive&&editor.features.dialectic}>{source=><img ref={image => {createEffect(() => {
        const asset = managedAsset(node()?.payload.asset);
        if (asset) { const release = editor.assets.bind(image, asset); onCleanup(release); }
      });if(!passive)observeContributionImage(editor,projection,props.nodeKey,image,source);}} src={source()||undefined} alt={String(metadata()?.alt ?? "")} />}</ImageSizeGate>
      <ChildBlocks parentKey={props.nodeKey} />
    </figure>
  );
}

export function IframeView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const metadata = () => node()?.payload.metadata as Record<string, unknown> | undefined;
  const resource = () => metadata()?.resourceEmbed === true;
  const url = () => {
    const value = String(metadata()?.url ?? node()?.payload.url ?? 'about:blank');
    if (!resource()) return value;
    try { return inspectUri(value).url; } catch { return 'about:blank'; }
  };
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  return <div ref={root} class="abstract-block reactive-iframe" tabIndex={-1} {...data(props.nodeKey, node)}>
    <ReverseInformation nodeKey={props.nodeKey}><Show when={resource()}><p><a href={url()} target="_blank" rel="noopener noreferrer">Open externally ↗</a> · Some sites do not permit embedding.</p></Show></ReverseInformation>
    <iframe src={url()} title={String(metadata()?.title ?? "Embedded content")}
      sandbox={resource() ? 'allow-scripts allow-forms allow-presentation' : undefined}
      referrerpolicy={resource() ? 'no-referrer' : undefined}
      style={resource() ? { width: '100%', height: `${Math.max(200, Math.min(1200, Number(metadata()?.height) || 600))}px` } : undefined} />
    <ChildBlocks parentKey={props.nodeKey} /></div>;
}

export function YouTubeView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const metadata = () => node()?.payload.metadata as Record<string, unknown> | undefined;
  const source = createMemo(() => {
    const url = String(metadata()?.url ?? "");
    const id = youtubeId(url);
    return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=0&playsinline=1&rel=0` : "about:blank";
  });
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  return (
    <div ref={root} class="abstract-block reactive-video" tabIndex={-1} {...data(props.nodeKey, node)}>
      <iframe src={source()} title="YouTube video" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen />
      <ChildBlocks parentKey={props.nodeKey} />
    </div>
  );
}

export function CodeBlockView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  let root!: HTMLDivElement;
  let textarea!: HTMLTextAreaElement;
  let dispose: (() => void) | undefined;
  onMount(() => {
    dispose = editor.mounts.register(props.nodeKey, {
      root,
      focusElement: textarea,
      inputPolicy: "native-text",
      focus: () => textarea.focus({ preventScroll: true }),
      captureSelection: () => ({ start: textarea.selectionStart, end: textarea.selectionEnd, direction: textarea.selectionDirection }),
      restoreSelection: (selection) => textarea.setSelectionRange(selection.start, selection.end, selection.direction),
    });
  });
  onCleanup(() => dispose?.());
  return <div ref={root} class="abstract-block reactive-code" {...data(props.nodeKey, node)}><textarea ref={textarea} value={String(node()?.payload.text ?? "")} aria-label="Code editor" /><p class="reactive-code__notice">Plain text preview while CodeMirror integration is migrated.</p><ChildBlocks parentKey={props.nodeKey} /></div>;
}

export function StableBackgroundView(props: BlockViewProps) {
  const { projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const metadata = () => node()?.payload.metadata as Record<string, unknown> | undefined;
  const type = () => String(node()?.payload.type ?? node()?.viewType);
  const workspaceBackground = () => props.nodeKey === projection.state.rootKey || projection.parentOf(props.nodeKey)?.viewType === 'workspace-block';
  let root!: HTMLDivElement;
  useContainerMount(props.nodeKey, () => root);
  return (
    <div ref={root} class="abstract-block reactive-surface" tabIndex={-1} {...data(props.nodeKey, node)} data-block-type={type()} data-workspace-background={workspaceBackground() ? '' : undefined}>
      <div class="reactive-surface__background">
        <BackgroundMedia type={type()} metadata={metadata()} />
      </div>
      <div class="reactive-surface__content"><ChildBlocks parentKey={props.nodeKey} /></div>
      <div class="reactive-surface__overlays" />
    </div>
  );
}

export function WindowView(props: BlockViewProps & { content?: () => import("solid-js").JSX.Element }) {
  const { editor, projection, coordinates, windowGeometry } = useReactiveView();
  const geometry = windowGeometry?.(props.nodeKey);
  // Canvas/Spatial geometry and isolated demos are not desktop registrations.
  const manager = !geometry && editor.windowManager?.plane ? editor.windowManager : undefined;
  const scale = coordinates?.scale;
  const node = () => manager?.runtime.get(props.nodeKey)?.node() ?? projection.state.nodes[props.nodeKey];
  const metadata = () => (node()?.payload.metadata as Record<string, any> | undefined) ?? {};
  const appearance = createMemo(() => blockAppearance(node()));
  const [preview, setPreview] = createSignal<{ x: number; y: number }>();
  const [marginEntries, setMarginEntries] = createSignal<DocumentMarginEntry[]>([]);
  const [narrowMarginsCollapsed, setNarrowMarginsCollapsed] = createSignal(false);
  const [marginDrawerOpen, setMarginDrawerOpen] = createSignal(false);
  const [toolset, setToolset] = createSignal<Toolset>("Typography");
  const [toolbarNotice, setToolbarNotice] = createSignal("");
  const state = () => geometry?.static ? "normal" : resolvedWindowState(metadata().state);
  const minimized = () => state() === "minimized";
  const maximized = () => !geometry && editor.features.windowMaximize && state() === "maximized";
  const workArea = manager ? () => manager.geometry.bounds(isSticky()) : createWindowMaximize(()=>root, maximized);
  let beforeMinimize: "normal"|"maximized" = "normal";
  const isDocument = () => node()?.viewType === "document-window-block";
  const marginsCollapsed = () => narrowMarginsCollapsed() || presentation.requested();
  const isSticky = () => node()?.viewType === "window-block" && metadata().stickyNote === true;
  const closedSticky = () => isSticky() && metadata().state === "closed";
  const title = () => String(metadata().title ?? "Untitled");
  const marginDrawerId = `document-margin-drawer-${props.nodeKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  let root!: HTMLDivElement;
  let dispose: (() => void) | undefined;
  let drag: { pointerId: number; x: number; y: number; originX: number; originY: number; moved: boolean } | undefined;
  let marginObserver: ResizeObserver | undefined;
  let suppressIconClick = false;
  let suppressTimer: ReturnType<typeof setTimeout> | undefined;
  let returnFocus: { key: NodeKey; native?: { start: number; end: number; direction: "forward" | "backward" | "none" }; inline?: { anchor: number; head: number } } | undefined;
  onMount(() => {
    dispose = editor.mounts.register(props.nodeKey, {
      root,
      focusElement: root,
      inputPolicy: "container",
      contextActions: manager ? () => [
        {label:"Activate window",run:()=>{manager.lifecycle.activate(props.nodeKey);}},
        {label:"Move window",disabled:maximized()||minimized(),run:()=>managedGeometry?.keyboard("move")},
        {label:"Resize window",disabled:maximized()||minimized(),run:()=>managedGeometry?.keyboard("resize")},
        {label:"Maximize / restore window",disabled:minimized(),run:()=>manager.maximize(props.nodeKey)},
        {label:"Minimize window",disabled:!manager.lifecycle.canMinimize(props.nodeKey),run:minimizeWindow},
        {label:"Restore window",disabled:!minimized(),run:restoreWindow},
        {label:"Close window",run:()=>editor.closeView(props.nodeKey)},
      ] : undefined,
      focus: () => (root.querySelector<HTMLButtonElement>("[data-window-icon]") ?? root).focus({ preventScroll: true }),
    });
    if (typeof ResizeObserver !== "undefined") {
      marginObserver = new ResizeObserver(entries => {
        const width = entries.at(-1)?.contentRect.width ?? root.getBoundingClientRect().width / (scale?.() ?? 1);
        updateMarginState(width);
      });
      marginObserver.observe(root);
    }
    queueMicrotask(() => updateMarginState(root.getBoundingClientRect().width / (scale?.() ?? 1)));
  });
  onCleanup(() => {
    dispose?.(); marginObserver?.disconnect();
    if (suppressTimer) clearTimeout(suppressTimer);
  });
  const position = () => managedGeometry ? managedGeometry.rectangle() : maximized() ? {x:workArea().x,y:workArea().y} : preview() ?? geometry?.position() ?? { x: Number(metadata().position?.x ?? 20), y: Number(metadata().position?.y ?? 20) };
  const storedSize = () => {
    if (geometry) { const size = geometry.expandedSize(); return { w: size.width, h: size.height }; }
    const w = Number(metadata().size?.w), h = Number(metadata().size?.h);
    return { w: Number.isFinite(w) && w > 0 ? w : 840, h: Number.isFinite(h) && h > 0 ? h : 620 };
  };
  const minimumSize = () => isDocument() ? { w: root?.querySelector(".reactive-page--minimap-left, .reactive-page--minimap-right") ? 602 : 560, h: 240 } : { w: 240, h: 160 };
  const presentation = createWindowPresentation(editor.windowPresentation, {
    element: () => root, enabled: isDocument, scale,
    expandedSize: () => ({ width: storedSize().w, height: storedSize().h }),
    minimumWidth: () => minimumSize().w,
    marginsCollapsed, automaticCollapsed: narrowMarginsCollapsed,
    collapseWithFocus: activate => collapseMargins(activate),
    closeDrawer: () => setMarginDrawerOpen(false),
  });
  const commitMetadata = (patch: Record<string, unknown>, label: string) => { const runtime = manager?.runtime.get(props.nodeKey); if(runtime) runtime.patch(patch); else editor.commands.setPayloadField(props.nodeKey, "metadata", { ...unwrap(metadata()), ...patch }, label); };
  const managedGeometry = manager?.geometry.create(props.nodeKey, {
    element:()=>root, viewport:untrack(isSticky), position:()=>({x:Number(metadata().position?.x??20),y:Number(metadata().position?.y??20)}),
    size:presentation.presentedSize, minimum:()=>({width:minimumSize().w,height:minimumSize().h}),mode:()=>maximized()?"maximized":state(),
    allowed:()=>manager.lifecycle.canMinimize(props.nodeKey)&&(!manager.layout.isTiled(props.nodeKey)||minimized()),
    layout:()=>manager.layout.rectangle(props.nodeKey), cancelled:()=>manager.layout.cancelSnap(),
    commit:patch=>commitMetadata(patch.size?{size:(()=>{const size=presentation.expandedFromPresented(patch.size);return {w:size.width,h:size.height};})()}:{position:patch.position},patch.size?"Resize Window":"Move Window"),
  });
  onMount(()=>{if(manager){onCleanup(manager.layout.register(props.nodeKey,{minimum:()=>({width:minimumSize().w,height:minimumSize().h}),mode:state,pinned:()=>metadata().pinned===true,viewport:untrack(isSticky)}));createEffect(()=>{state();metadata().pinned;manager.layout.update(props.nodeKey);});}});
  const windowResize = managedGeometry?.resize ?? createFloatingWindowResize({
    element: () => root,
    size: presentation.presentedSize,
    minimum: () => ({ width: minimumSize().w, height: minimumSize().h }),
    enabled: () => !geometry?.static && state() === "normal",
    normalizeStartToMinimum: true, scale, constrainToViewport: !geometry,
    onCommit: size => {
      const expanded = presentation.expandedFromPresented(size);
      if (geometry) geometry.resize(expanded);
      else commitMetadata({ size: { w: expanded.width, h: expanded.height } }, "Resize Window");
    },
  });
  onMount(() => {
    const release = geometry?.bindResize?.({ presentedSize: presentation.presentedSize,
      minimum: () => ({ width: minimumSize().w, height: minimumSize().h }), toExpanded: presentation.expandedFromPresented });
    if (release) onCleanup(release);
  });
  const dimensions = () => managedGeometry ? {w:managedGeometry.rectangle().width,h:managedGeometry.rectangle().height} : maximized() ? {w:workArea().width,h:workArea().height} : ({ w: windowResize.dimensions().width, h: windowResize.dimensions().height });
  const registerMargin = (entry: DocumentMarginEntry) => {
    setMarginEntries(current => current.some(candidate => candidate.ownerKey === entry.ownerKey && candidate.relationKey === entry.relationKey && candidate.name === entry.name) ? current : [...current, entry]);
    return () => setMarginEntries(current => current.filter(candidate => candidate.ownerKey !== entry.ownerKey || candidate.relationKey !== entry.relationKey || candidate.name !== entry.name));
  };
  const marginPresentation = {
    collapsed: marginsCollapsed,
    drawerOpen: marginDrawerOpen,
    entries: marginEntries,
    indicators: () => true,
    open: (entry?: DocumentMarginEntry) => openMargins(entry),
    register: registerMargin,
  };
  const restoreMarginFocus = (key: NodeKey, native?: { start: number; end: number; direction: "forward" | "backward" | "none" }, inline?: { anchor: number; head: number }) => queueMicrotask(() => {
    if (!editor.node(key)) return;
    editor.focus.request(key, { reason: "show-collapsed-margin", ...(native ? { caret: native } : {}) });
    if (inline) queueMicrotask(() => editor.mounts.get(key)?.restoreInlineSelection?.(inline));
  });
  const collapseMargins = (activate: () => void) => {
    if (marginsCollapsed()) { activate(); return; }
    const active = document.activeElement as HTMLElement | null;
    const relation = active?.closest<HTMLElement>(".reactive-relation[data-relation-name$='Margin']");
    const focusedKey = relation && root.contains(relation) ? editor.focus.state.focusedKey : undefined;
    const mount = focusedKey ? editor.mounts.get(focusedKey) : undefined;
    const native = mount?.captureSelection?.(), inline = mount?.captureInlineSelection?.();
    activate();
    if (focusedKey) { setMarginDrawerOpen(true); restoreMarginFocus(focusedKey, native, inline); }
  };
  const updateMarginState = (windowWidth: number) => {
    if (!isDocument() || minimized() || windowWidth <= 0) return;
    // 730 outer pixels corresponds to the 700px named content-container query.
    const next = windowWidth <= 730;
    if (next === narrowMarginsCollapsed()) return;
    if (next) {
      collapseMargins(() => setNarrowMarginsCollapsed(true));
      return;
    }
    setNarrowMarginsCollapsed(false);
    if (!presentation.requested()) setMarginDrawerOpen(false);
  };
  const subtreeKeys = () => {
    const seen = new Set<NodeKey>(), pending = [props.nodeKey];
    while (pending.length) {
      const key = pending.pop()!;
      if (seen.has(key)) continue; seen.add(key);
      const current = projection.state.nodes[key]; if (current) pending.push(...current.children, ...Object.values(current.ownedRelations));
    }
    return seen;
  };
  // A transient Document is physically hosted here without an authored child edge.
  const contains = (target?: NodeKey) => !!target && (subtreeKeys().has(target) || !!editor.mounts.get(target)?.root && root.contains(editor.mounts.get(target)!.root));
  const clampIconPosition = (next: { x: number; y: number }) => {
    if (!minimized()) return next;
    const current = position(), rect = root.getBoundingClientRect();
    const factor = scale?.() ?? 1;
    const width = rect.width || 96 * factor, height = rect.height || 92 * factor;
    const left = rect.left + (next.x - current.x) * factor, top = rect.top + (next.y - current.y) * factor;
    return {
      x: next.x + (Math.max(0, 8 - left) - Math.max(0, left + width + 8 - window.innerWidth)) / factor,
      y: next.y + (Math.max(0, 8 - top) - Math.max(0, top + height + 8 - window.innerHeight)) / factor,
    };
  };
  const beginDrag = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    if (managedGeometry) {managedGeometry.beginMove(event);return;}
    if (geometry?.static || maximized() || event.ctrlKey || event.button !== 0) return;
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: position().x, originY: position().y, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveDrag = (event: PointerEvent) => {
    if (managedGeometry) {managedGeometry.movePointer(event);if(managedGeometry.mode()==="move"&&!minimized())manager?.layout.previewSnap(props.nodeKey,event.clientX,event.clientY);return;}
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.moved ||= Math.abs(event.clientX - drag.x) > 2 || Math.abs(event.clientY - drag.y) > 2;
    setPreview(clampIconPosition({ x: drag.originX + (event.clientX - drag.x) / (scale?.() ?? 1), y: drag.originY + (event.clientY - drag.y) / (scale?.() ?? 1) }));
  };
  const finishDrag = (event: PointerEvent, cancelled = false) => {
    if (managedGeometry) {if(cancelled)managedGeometry.cancelPointer(event);else if(manager?.layout.snapPreview()&&manager.layout.finishSnap(props.nodeKey))managedGeometry.cancel();else managedGeometry.endPointer(event);return;}
    if (!drag || drag.pointerId !== event.pointerId) return;
    const final = position(), moved = drag.moved, wasMinimized = minimized(); drag = undefined; setPreview(undefined);
    if (cancelled) return;
    if (wasMinimized && moved) {
      suppressIconClick = true; clearTimeout(suppressTimer);
      suppressTimer = setTimeout(() => { suppressIconClick = false; suppressTimer = undefined; }, 0);
    }
    const stored = geometry?.position() ?? { x: Number(metadata().position?.x ?? 20), y: Number(metadata().position?.y ?? 20) };
    if (moved && (final.x !== stored.x || final.y !== stored.y)) {
      if (geometry) geometry.move(final);
      else commitMetadata({ position: final }, wasMinimized ? "Move Window Icon" : "Move Window");
    }
  };
  const openMargins = (entry?: DocumentMarginEntry) => {
    if (!marginsCollapsed()) return;
    setMarginDrawerOpen(true);
    queueMicrotask(() => {
      const drawer = root.querySelector<HTMLElement>(".reactive-window__margin-drawer");
      drawer?.focus({ preventScroll: true });
      if (!entry) return;
      const item = [...root.querySelectorAll<HTMLElement>("[data-margin-relation-key]")].find(candidate => candidate.dataset.marginRelationKey === entry.relationKey);
      item?.scrollIntoView?.({ block: "nearest" });
    });
  };
  const toggleMargins = () => {
    if (!marginsCollapsed()) return;
    if (!marginDrawerOpen()) { openMargins(); return; }
    setMarginDrawerOpen(false);
    queueMicrotask(() => root.querySelector<HTMLButtonElement>(".document-style-bar__margins")?.focus({ preventScroll: true }));
  };
  const rememberReturnFocus = () => {
    const key = [editor.focus.state.focusedKey, editor.focus.state.lastFocusedKey].find(candidate => candidate !== props.nodeKey && contains(candidate));
    if (!key) return;
    const mount = editor.mounts.get(key);
    returnFocus = { key, native: mount?.captureSelection?.(), inline: mount?.captureInlineSelection?.() };
  };
  const minimizeWindow = () => {
    if (manager && !manager.lifecycle.canMinimize(props.nodeKey)) { setToolbarNotice("Finish the current composition, dialog or close request before minimizing."); return; }
    manager?.lifecycle.remember();
    const focusWasInside = contains(editor.focus.state.focusedKey);
    if (focusWasInside) { rememberReturnFocus(); editor.focus.adopt(props.nodeKey); }
    if (!manager && editor.find.state.open && contains(editor.find.state.scope?.rootKey)) editor.find.close(false);
    if (!manager) for (const overlay of [...editor.overlays.overlays]) if (contains(overlay.ownerKey)) editor.overlays.close(overlay.key, false);
    if(managedGeometry)managedGeometry.rememberMode();else beforeMinimize=maximized()?"maximized":"normal";
    editor.crossText.clear(); commitMetadata({ state: "minimized" }, "Minimize Window");
    if (manager) { manager.lifecycle.successor(props.nodeKey); manager.lifecycle.notify("minimized",props.nodeKey); }
    else if (focusWasInside) queueMicrotask(() => root.querySelector<HTMLButtonElement>("[data-window-icon]")?.focus({ preventScroll: true }));
  };
  const restoreWindow = () => {
    if (managedGeometry?.consumeClick()) return;
    if (suppressIconClick) { suppressIconClick = false; return; }
    commitMetadata({ state: managedGeometry?.restoreMode()??beforeMinimize }, "Restore Window");
    if (manager) manager.raisePlacement(node()!.placementKey);
    if (manager) { manager.lifecycle.activate(props.nodeKey); manager.lifecycle.notify("restored",props.nodeKey); return; }
    const saved = returnFocus; returnFocus = undefined;
    queueMicrotask(() => {
      const focused = editor.focus.state.focusedKey, mounted = focused && editor.mounts.get(focused);
      if (mounted && root.contains(mounted.root) && ["native-text", "standoff"].includes(mounted.inputPolicy)) return;
      if (saved && editor.node(saved.key)) {
        editor.focus.request(saved.key, { reason: "restore-window", ...(saved.native ? { caret: saved.native } : {}) });
        if (saved.inline) queueMicrotask(() => editor.mounts.get(saved.key)?.restoreInlineSelection?.(saved.inline!));
        return;
      }
      const candidate = [...subtreeKeys()].map(key => projection.state.nodes[key]).find(candidate => candidate?.key !== props.nodeKey && ["native-text", "standoff"].includes(editor.mounts.get(candidate?.key)?.inputPolicy ?? ""));
      if (candidate) editor.focus.request(candidate.key, { reason: "restore-window" }); else root.focus({ preventScroll: true });
    });
  };
  onMount(() => { if (manager) onCleanup(manager.lifecycle.bindActions(props.nodeKey,{minimize:minimizeWindow,restore:restoreWindow})); });
  const frame = () => (
    <div ref={root} class={`abstract-block reactive-window ${appearance().classes.join(" ")}`} data-document-session={manager?.runtime.get(props.nodeKey)?.sessionId} classList={{ ...presentation.classes(), "reactive-window--minimized": minimized(), "reactive-window--maximized": maximized(), "reactive-window--document": isDocument(), "reactive-window--sticky": isSticky(), "reactive-window--margins-collapsed": isDocument() && marginsCollapsed() }} tabIndex={-1}
      hidden={closedSticky()}
      style={{ ...appearance().style, ...(manager ? {"box-sizing":"border-box", "min-width":"0", "min-height":"0"} as const : {}), transform: `translate(${position().x}px, ${position().y}px)`, width: minimized() ? "96px" : `${dimensions().w}px`, height: minimized() ? "auto" : `${dimensions().h}px`, "z-index": manager ? (manager.registry.windows[props.nodeKey]?.ownerModalCount ? 4 : 0) : maximized() ? Math.max(101, Number(metadata().zIndex ?? 1)) : Number(metadata().zIndex ?? 1), ...(minimized() ? { border: "0", background: "transparent", "box-shadow": "none" } : {}) }} {...data(props.nodeKey, node)}>
      <Show when={manager || !minimized()}><RetainedWindowBody enabled={!!manager} hidden={minimized()}>
        <header class="reactive-window__header" tabIndex={manager ? 0 : undefined} aria-label={manager ? `${title()} window — arrow keys move; Enter commits; Escape cancels` : undefined} onKeyDown={event=>{if(managedGeometry && event.target===event.currentTarget){if(!managedGeometry.mode()&&event.key.startsWith("Arrow"))managedGeometry.keyboard("move");managedGeometry.keyDown(event);}}} onBlur={()=>managedGeometry?.cancel()} onLostPointerCapture={event=>managedGeometry?.cancelPointer(event)} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={event => finishDrag(event, true)}>
          <span>{title()}</span>
          <span class="reactive-window__controls">
            <Show when={isDocument() && editor.commandRegistry.canExecute('document.save', { targetKey: props.nodeKey, args: undefined })}>
              <button type="button" aria-label="Save Document" onPointerDown={e => e.stopPropagation()} onClick={() => void editor.commandRegistry.execute('document.save', { targetKey: props.nodeKey, args: undefined })}>Save</button>
            </Show>
            <Dynamic component={presentation.control()} />
            <Show when={!geometry?.static}>
            <Show when={!geometry && editor.features.windowMaximize}><button type="button" aria-label={maximized()?"Restore window":"Maximize window"} onPointerDown={e=>{e.preventDefault();e.stopPropagation();}} onClick={()=>manager?manager.maximize(props.nodeKey):commitMetadata({state:maximized()?"normal":"maximized"},maximized()?"Restore Window":"Maximize Window")}>{maximized()?"❐":"□"}</button></Show>
            <button type="button" aria-label="Minimize window" onPointerDown={(e) => { rememberReturnFocus(); e.stopPropagation(); }} onClick={minimizeWindow}>−</button>
            <button type="button" aria-label={isSticky() ? "Close sticky note" : "Close window"} onPointerDown={(e) => e.stopPropagation()} onClick={() => isSticky() ? editor.stickyNotes.closeWindow(props.nodeKey) : editor.closeView(props.nodeKey)}>×</button>
            </Show>
          </span>
        </header>
        <Show when={manager && toolbarNotice() && !isDocument()}><p role="status">{toolbarNotice()}</p></Show>
        <DocumentMarginContext.Provider value={marginPresentation}>
          <Show when={isDocument() && !props.content}><DocumentStyleBar toolset={toolset()} onToolset={setToolset} onNotice={setToolbarNotice} editor={editor} scopeKey={props.nodeKey} margins={{ collapsed: marginsCollapsed(), count: marginEntries().length, open: marginDrawerOpen(), controls: marginDrawerId, toggle: toggleMargins }} /></Show>
          <div class="reactive-window__content" ref={host => onMount(() => { if (isDocument()) onCleanup(editor.pointerSpotlight.mount(host, scale)); })}><div class="reactive-window__document-body"><WindowRestorationBoundary nodeKey={props.nodeKey}>
            <Show when={props.content} fallback={<For each={node()?.children ?? []}>{key => editor.documentSessions && manager && isDocument() && projection.node(key)?.viewType === "document-block"
              ? <RetainedInkDocument nodeKey={key} windowKey={props.nodeKey} />
              : <BlockOutlet nodeKey={key} />}</For>}>{render => render()()}</Show>
          </WindowRestorationBoundary></div></div>
          <Show when={isDocument() && !props.content && editor.features.compactEditorChrome}><DocumentStatusBar editor={editor} scopeKey={props.nodeKey} notice={toolbarNotice()} /></Show>
          <Show when={isDocument() && marginsCollapsed() && marginDrawerOpen()}>
            <DocumentMarginDrawer id={marginDrawerId} entries={marginEntries()} onClose={toggleMargins} onSource={key => editor.focus.request(key, { reason: "margin-source" })} />
          </Show>
        </DocumentMarginContext.Provider>
        <Show when={!geometry?.static && state() === "normal" && !manager?.layout.isTiled(props.nodeKey)}><FloatingWindowResizeHandle controller={windowResize} class="reactive-window__resize" label={`Resize ${title()} window`} /></Show>
      </RetainedWindowBody></Show>
      <Show when={minimized()}>
        <WindowIcon title={title()} kind={resolvedWindowIcon(node()?.viewType ?? "window-block", metadata().icon)} onRestore={restoreWindow}
          onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={event => finishDrag(event, true)} onLostPointerCapture={event=>managedGeometry?.cancelPointer(event)} />
      </Show>
    </div>
  );
  return manager ? <ManagedWindowFrame manager={manager} nodeKey={props.nodeKey} viewport={isSticky()} mounted={true} visible={!minimized() && !closedSticky()}>{frame()}</ManagedWindowFrame>
    : isSticky() ? <Portal>{frame()}</Portal> : frame();
}
