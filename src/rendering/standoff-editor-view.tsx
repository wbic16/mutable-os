import {observeFontLayout} from './font-layout';
import { CharacterSurfaceHost, type CharacterSurfaceRequest } from './character-surface-host';
import { TaskControl, StandaloneTaskDisclosure } from './task-control';
import { taskState } from '../runtime/tasks';
import { managedAsset } from '../interchange/managed-asset';
import type { ProvisionalCells } from '../features/autocomplete/provisional-cells';
import { createRangeRendering, RangeEffectLayer, classesAt, type RangeEffectSource } from "./range-rendering";
import { allocateUnderlineLane, type UnderlineLane } from "./standoff-styles";
import type { AnnotationRange } from "../runtime/annotation-range-events";
import { localFragment } from "../runtime/local-coordinates";
import { immutable } from "../runtime/effect-contributions";
import { For, Show, createEffect, createRenderEffect, createMemo, createSignal, untrack, onCleanup, onMount } from "solid-js";
import type { BlockNode, BlockViewProps, NodeKey } from "../block-tree/types";
import { useReactiveView } from "../reactive-editor/context";
import { BlockOutlet, ChildBlocks, RelationBlocks } from "./block-outlet";
import {
  highlightShapes,
  outlineShapes,
  rainbowShapes,
  spikyOutlineShapes,
  underlineShapes,
  type DecorationShape,
  type VisualFragment,
} from "./decorations";
import { DirectCharacterCells, type CharacterCellPresentation } from "./direct-character-cells";
import { blockAppearance } from "./appearance";
import { compileCellStyleRuns, cellStyleAt, hasActiveRange, standoffStyleSchema, standoffSvgStyles, type StandoffAnnotation } from "./standoff-styles";
import "./candidate-exclusions.css";
import { exclusionPosition } from "./candidate-exclusion-layout";
import { removeTextSuperposition, textSuperpositions, toggleSuperpositionReading, toggleSuperpositionVisibility, type TextSuperposition } from "../runtime/text-superposition";

function pointBoundary(root: HTMLElement, node: Node | null, offset: number): number {
  if (!node) return 0;
  if (node === root) {
    const childOffset = Math.max(0, Math.min(offset, root.childNodes.length));
    const previous = root.childNodes[childOffset - 1];
    if (previous instanceof HTMLElement) {
      const projectedEnd = Number(previous.dataset.superpositionEnd);
      if (Number.isInteger(projectedEnd)) return projectedEnd + 1;
      const inlineIndex = Number(previous.dataset.inlineIndex);
      if (Number.isInteger(inlineIndex)) return inlineIndex + 1;
    }
    return [...root.childNodes]
      .slice(0, childOffset)
      .reduce((boundary, child) => {
        if (!(child instanceof HTMLElement)) return boundary;
        if (child.classList.contains("reactive-inline-image")) return boundary + 1;
        return boundary + [...(child.textContent ?? "")].length;
      }, 0);
  }
  const element = node instanceof Element ? node : node.parentElement;
  const cell = element?.closest<HTMLElement>("[data-inline-index]");
  if (cell && root.contains(cell)) {
    const index = Number(cell.dataset.inlineIndex ?? 0);
    const projectedEnd = Number(cell.dataset.superpositionEnd);
    if (Number.isInteger(projectedEnd)) return offset > 0 ? projectedEnd + 1 : index;
    if (cell.classList.contains("reactive-inline-image")) return index + (offset > 0 ? 1 : 0);
    if (node.nodeType === Node.TEXT_NODE) {
      return index + [...(node.textContent ?? "").slice(0, offset)].length;
    }
    const range = document.createRange();
    try {
      range.setStart(cell, 0);
      range.setEnd(node, offset);
      return index + [...range.toString()].length;
    } catch {
      return index + (offset > 0 ? 1 : 0);
    }
  }
  return 0;
}

function restoreBoundary(root: HTMLElement, index: number): { node: Node; offset: number } {
  const bounded = Math.max(0, Math.min(index, root.childNodes.length));
  return { node: root, offset: bounded };
}

function rangeFragments(
  flow: HTMLElement,
  surface: HTMLElement,
  start: number,
  endInclusive: number,
  scale = 1,
): VisualFragment[] {
  const cells = flow.children;
  if (!cells.length) return [];
  const startCell = cells[Math.max(0, Math.min(start, cells.length - 1))];
  const endCell = cells[Math.max(0, Math.min(endInclusive, cells.length - 1))];
  // Exact single-Cell decorations use the same visual box as the surface.
  // Mixed text/surface ranges retain the established policy for this increment.
  if(startCell===endCell&&startCell.hasAttribute('data-character-surface'))return [localFragment(startCell.getBoundingClientRect(),surface.getBoundingClientRect(),surface,scale)];
  const startNode = startCell.firstChild ?? startCell;
  const endNode = endCell.firstChild ?? endCell;
  const range = document.createRange();
  range.setStart(startNode, 0);
  range.setEnd(
    endNode,
    endNode.nodeType === Node.TEXT_NODE ? endNode.textContent?.length ?? 0 : endNode.childNodes.length,
  );
  const surfaceRect = surface.getBoundingClientRect();
  const rects = typeof range.getClientRects === "function" ? [...range.getClientRects()] : [];
  const fragments = rects
    .filter((rect) => rect.width > 0 || rect.height > 0)
    .map((rect) => localFragment(rect, surfaceRect, surface, scale));
  return fragments.reduce<VisualFragment[]>((merged, fragment) => {
    const previous = merged.at(-1);
    const sameLine = previous && Math.abs(previous.y - fragment.y) < 2 && Math.abs(previous.height - fragment.height) < 2;
    if (sameLine && fragment.x <= previous.x + previous.width + 2) {
      previous.width = Math.max(previous.x + previous.width, fragment.x + fragment.width) - previous.x;
    } else {
      merged.push({ ...fragment });
    }
    return merged;
  }, []);
}

function DecorationLayer(props: { class: string; shapes: DecorationShape[]; blendMode?: "color-dodge"; active?: (key: string) => boolean }) {
  return (
    <svg class={props.class} aria-hidden="true" style={{ "mix-blend-mode": props.blendMode }}>
      <For each={props.shapes}>
        {(shape) => (
          <path
            data-property-type={shape.propertyType}
            data-decoration-key={shape.key}
            d={shape.path}
            stroke={shape.stroke ?? "none"}
            fill={shape.fill ?? "none"}
            stroke-width={shape.strokeWidth}
            opacity={shape.caretOpacity && shape.annotationKey ? (props.active?.(shape.annotationKey) ? shape.caretOpacity.inside : shape.caretOpacity.outside) : shape.opacity}
            stroke-dasharray={shape.dashArray}
            stroke-linejoin="round"
            classList={{ "reactive-decoration--marching": shape.animated }}
          />
        )}
      </For>
    </svg>
  );
}

interface RegionEffect extends VisualFragment {
  annotationKey:string;
  key: string;
  type: string;
  filter: string;
  opacity: number;
  blendMode: string;
  limitation?: string;
}

function RegionEffectLayer(props: { regions: RegionEffect[] }) {
  return (
    <div class="reactive-standoff-effect-layer reactive-standoff-blur-layer" aria-hidden="true">
      <For each={props.regions}>
        {(region) => <span
          class="reactive-standoff-effect"
          classList={{ "reactive-standoff-blur": region.type === "style/blur" }}
          data-property-type={region.type}
          data-decoration-key={region.key}
          data-effect-limitation={region.limitation}
          style={{
            left: `${region.x}px`,
            top: `${region.y}px`,
            width: `${region.width}px`,
            height: `${region.height}px`,
            "--standoff-region-filter": region.filter,
            "--standoff-region-opacity": region.opacity,
            "--standoff-region-blend": region.blendMode,
          }}
        />}
      </For>
    </div>
  );
}

interface NoiseRegion extends VisualFragment {
  annotationKey:string;
  key: string;
  type: string;
  frequency: number;
  octaves: number;
  opacity: number;
  seed: number;
  blendMode: "multiply" | "soft-light";
  scanlineOpacity?: number;
}

const filterId = (key: string) => `standoff-noise-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
const scanlineId = (key: string) => `standoff-scanlines-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

function NoiseLayer(props: { regions: NoiseRegion[] }) {
  return <svg class="reactive-standoff-noise-layer" aria-hidden="true">
    <defs>
      <For each={props.regions}>{region => <filter id={filterId(region.key)} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency={region.frequency} numOctaves={region.octaves} seed={region.seed} />
        <feColorMatrix type="saturate" values="0" />
      </filter>}</For>
      <For each={props.regions.filter(region => !!region.scanlineOpacity)}>{region => <pattern id={scanlineId(region.key)} width="1" height="3" patternUnits="userSpaceOnUse">
        <line x1="0" y1="2.5" x2="1" y2="2.5" stroke="black" stroke-width="1" opacity={region.scanlineOpacity} />
      </pattern>}</For>
    </defs>
    <For each={props.regions}>{region => <rect
      data-property-type={region.type}
      data-decoration-key={region.key}
      x={region.x}
      y={region.y}
      width={region.width}
      height={region.height}
      filter={`url(#${filterId(region.key)})`}
      opacity={region.opacity}
      style={{ "mix-blend-mode": region.blendMode }}
    />}</For>
    <For each={props.regions.filter(region => !!region.scanlineOpacity)}>{region => <rect
      data-property-type={region.type}
      data-decoration-key={`${region.key}:scanlines`}
      x={region.x}
      y={region.y}
      width={region.width}
      height={region.height}
      fill={`url(#${scanlineId(region.key)})`}
      style={{ "mix-blend-mode": "multiply" }}
    />}</For>
  </svg>;
}

interface SuperpositionAnchor extends VisualFragment {
  key: string;
  property: TextSuperposition;
  alternativeKey: NodeKey;
}

function SuperpositionLayer(props: { owner: () => BlockNode | undefined; anchors: SuperpositionAnchor[] }) {
  const { editor } = useReactiveView();
  return <div class="reactive-superposition-layer" aria-label="Alternative readings">
    <For each={props.anchors}>{anchor => <section
      class="reactive-superposition-editor"
      data-superposition-id={anchor.property.id}
      data-native-context-menu
      style={{ left: `${anchor.x}px`, top: `${anchor.y + anchor.height + 5}px` }}
    >
      <header>
        <strong>Alternative</strong>
        <button type="button" onClick={() => { const owner = props.owner(); if (owner) toggleSuperpositionReading(editor, owner, anchor.property.id); }}>
          {anchor.property.active === "source" ? "Use alternative" : "Use source"}
        </button>
        <button type="button" aria-label="Hide alternative editor" title="Hide alternative editor" onClick={() => { const owner = props.owner(); if (owner) toggleSuperpositionVisibility(editor, owner, anchor.property.id); }}>×</button>
        <button type="button" class="reactive-superposition-editor__remove" onClick={() => { const owner = props.owner(); if (owner) removeTextSuperposition(editor, owner, anchor.property.id); }}>Remove</button>
      </header>
      <div class="reactive-superposition-editor__reading"><BlockOutlet nodeKey={anchor.alternativeKey} /></div>
    </section>}</For>
  </div>;
}

function parameter(annotation: StandoffAnnotation, name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(annotation[name]);
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function regionAppearance(annotation: StandoffAnnotation): Pick<RegionEffect, "filter" | "opacity" | "blendMode" | "limitation"> | undefined {
  switch (annotation.type) {
    case "style/blur": return { filter: `blur(${parameter(annotation, "amount", 3, 0, 32)}px)`, opacity: 1, blendMode: "normal" };
    case "style/motion-blur": {
      const x = parameter(annotation, "x", 6, 0, 24), y = parameter(annotation, "y", 0, 0, 24);
      return { filter: `blur(${Math.max(x, y) * .6}px)`, opacity: 1, blendMode: "normal", limitation: "isotropic-backdrop-fallback" };
    }
    case "style/grayscale": return { filter: `grayscale(${parameter(annotation, "amount", .75, 0, 1)})`, opacity: 1, blendMode: "normal" };
    case "style/sepia": return { filter: `sepia(${parameter(annotation, "amount", .8, 0, 1)})`, opacity: 1, blendMode: "normal" };
    case "style/invert": return { filter: `invert(${parameter(annotation, "amount", 1, 0, 1)})`, opacity: 1, blendMode: "normal" };
    case "style/contrast-brightness": return {
      filter: `contrast(${parameter(annotation, "contrast", 1.4, 0, 3)}) brightness(${parameter(annotation, "brightness", 1.1, 0, 3)})`,
      opacity: 1,
      blendMode: "normal",
    };
  }
}

function noiseAppearance(annotation: StandoffAnnotation): Pick<NoiseRegion, "frequency" | "octaves" | "opacity" | "seed" | "blendMode" | "scanlineOpacity"> | undefined {
  switch (annotation.type) {
    case "style/grain": return {
      frequency: parameter(annotation, "frequency", .75, .01, 1),
      octaves: Math.round(parameter(annotation, "octaves", 2, 1, 4)),
      opacity: parameter(annotation, "opacity", .12, 0, .5),
      seed: Math.round(parameter(annotation, "seed", 2, 0, 1000)),
      blendMode: "multiply",
    };
    case "style/ink-bleed": return {
      frequency: .55,
      octaves: 2,
      opacity: parameter(annotation, "roughness", .35, 0, 1) * .16,
      seed: 7,
      blendMode: "multiply",
    };
    case "style/turbulence": return {
      frequency: parameter(annotation, "frequency", .025, .005, .25),
      octaves: Math.round(parameter(annotation, "octaves", 2, 1, 4)),
      opacity: parameter(annotation, "opacity", .14, 0, .4),
      seed: Math.round(parameter(annotation, "seed", 4, 0, 1000)),
      blendMode: "soft-light",
    };
    case "amber-crt": return {
      frequency: .8,
      octaves: 2,
      opacity: parameter(annotation, "noise", .02, 0, .12),
      seed: 2,
      blendMode: "soft-light",
      scanlineOpacity: parameter(annotation, "scanlines", .1, 0, .3),
    };
  }
}

function ProjectedAlternative(props: { nodeKey: NodeKey; sourceIndex: number; sourceEnd: number; propertyId: string; classes?:string }) {
  const { editor, projection } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const runs = createMemo(() => compileCellStyleRuns(
    ((node()?.payload.standoffProperties as StandoffAnnotation[] | undefined) ?? [])
      .map(property => property.type === "mutable/gloss" ? editor.gloss.resolve(property, props.nodeKey) : editor.linkedAnnotations.resolve(property, node()?.contentKey) as StandoffAnnotation),
  ));
  return <span
    class={["reactive-superposition-projection",props.classes].filter(Boolean).join(" ")}
    data-inline-index={props.sourceIndex}
    data-superposition-end={props.sourceEnd}
    data-superposition-id={props.propertyId}
    contentEditable={false}
    aria-label="Active alternative reading"
  ><For each={node()?.inlineContent ?? []}>{(cellKey, index) => {
    const cell = () => projection.state.nodes[cellKey];
    return <span style={cellStyleAt(runs(), index())}>{String(cell()?.payload.text ?? "")}</span>;
  }}</For></span>;
}

export function StandoffEditorView(props: BlockViewProps) {
  const { editor, projection, coordinates, activity } = useReactiveView();
  const node = () => projection.state.nodes[props.nodeKey];
  const [draft,setDraft]=createSignal<ProvisionalCells>();
  const logical=(at:number)=>draft()?.fromPresentation(at)??at;
  const presented=(at:number)=>draft()?.toPresentation(at)??at;
  const annotations = createMemo(
    () => ((node()?.payload.standoffProperties as StandoffAnnotation[] | undefined) ?? []).map(property => editor.linkedAnnotations.resolve(property, node()?.contentKey) as StandoffAnnotation),
  );
  const identities = editor.features.standoffPropertyRendering ? editor.annotationIdentities.acquire(node()!.contentKey) : undefined;
  onCleanup(() => identities?.dispose());
  const annotationKey = (annotation: StandoffAnnotation, index: number) => identities?.keys()[index]
    ? JSON.stringify([props.nodeKey,identities.keys()[index]])
    : `${props.nodeKey}:${annotation.id ?? annotation.type ?? "property"}:${index}`;
  const rendering = createRangeRendering({registry:editor.visualEffects, events:editor.annotationEvents, nodeKey:props.nodeKey, eventsEnabled:editor.features.annotationRangeEvents, visible:source=>source.owner.kind==='annotation'||searchVisible,
    sources:()=>{
      if(!editor.features.standoffPropertyRendering)return [];
      const count=node()?.inlineContent.length??0;
      const result:RangeEffectSource[]=annotations().flatMap((annotation,index)=>{
        const definition=editor.visualEffects.type(annotation.type);
        const point=annotation.isZeroWidth===true&&!annotation.isDeleted&&Number.isInteger(annotation.start)&&Number(annotation.start)>=0&&Number(annotation.start)<=count;
        if(!definition||(!point&&(!hasActiveRange(annotation)||annotation.start>=count)))return [];
        const key=annotationKey(annotation,index);
        return [{key,owner:{kind:'annotation' as const,key:identities?.keys()[index]??key},start:Number(annotation.start),end:point?Number(annotation.start):Math.min(Number(annotation.end)+1,count),type:annotation.type!,definition,data:annotation,index}];
      });
      for(const d of editor.decorations.nodes[props.nodeKey]??[]){
        if(d.range.coordinate!=='cell'||d.range.start>=count)continue;
        const base=d.temporary&&!d.temporary.renderers?editor.visualEffects.type(d.type):undefined;
        result.push({key:d.runtimeKey,owner:{kind:'session',key:d.runtimeKey},start:d.range.start,end:Math.min(d.range.end,count),type:d.type,
          definition:{type:d.type,renderers:d.temporary?.renderers??base?.renderers??d.renderers,
            states:d.temporary?.states??base?.states,
            stateOrder:d.temporary?.stateOrder??(d.temporary?.states?Object.keys(d.temporary.states):base?.stateOrder),
            events:d.temporary?.events??base?.events},data:d.temporary??{id:d.id,type:d.type},index:result.length});
      }
      return result;
    }});
  const legacyAnnotations=createMemo(()=>annotations().map(annotation=>editor.features.standoffPropertyRendering&&editor.visualEffects.type(annotation.type)?{...annotation,isDeleted:true}:annotation));
  // Removal is logical and synchronous; old measured legacy shapes must not
  // remain visible until the next animation frame.
  const activeVisualKeys=createMemo(()=>new Set(legacyAnnotations().flatMap((annotation,index)=>hasActiveRange(annotation)?[annotationKey(annotation,index)]:[])));
  const legacySvgKeys=createMemo(()=>new Set(legacyAnnotations().flatMap((annotation,index)=>hasActiveRange(annotation)&&(editor.effects.get(annotation.type)||standoffStyleSchema(annotation.type)?.svg)?[annotationKey(annotation,index)]:[])));
  const temporaryLayout=createMemo(()=>JSON.stringify((editor.decorations.nodes[props.nodeKey]??[]).filter(d=>!editor.features.standoffPropertyRendering||d.excludable).map(d=>editor.features.standoffPropertyRendering
    ? [d.runtimeKey,d.range.start,d.range.end,d.excludable,d.excludeLabel,d.excludeTitle,d.active]
    : d)));
  const logicalRanges=createMemo(()=>{
    const ranges:AnnotationRange[]=[...rendering.eventRanges()];
    if(editor.features.annotationRangeEvents)legacyAnnotations().forEach((annotation,index)=>{
      if(!hasActiveRange(annotation)||annotation.start>=(node()?.inlineContent.length??0)||!editor.effects.get(annotation.type)?.caretOpacity)return;
      ranges.push({key:annotationKey(annotation,index),index,id:annotation.id,type:annotation.type!,start:annotation.start,end:Math.min(annotation.end,(node()?.inlineContent.length??0)-1)});
    });
    return ranges;
  },undefined,{equals:(a,b)=>JSON.stringify(a)===JSON.stringify(b)});
  createRenderEffect(()=>{const ranges=logicalRanges();untrack(()=>{if(editor.features.annotationRangeEvents)editor.annotationEvents.setRanges(props.nodeKey,ranges);});});

  // Collapsed primary/secondary carets have no SVG selection geometry. Moving
  // them should update opacity only, not schedule an annotation layout pass.
  const selectionGeometry = createMemo(() => {
    const set = editor.selections.sets[props.nodeKey];
    return JSON.stringify(set?.items.filter(item => item.anchor.boundary.index !== item.head.boundary.index)
      .map(item => [item.id,item.anchor.boundary.index,item.head.boundary.index,item.id === set.primaryId]) ?? []);
  });
  const superpositions = createMemo(() => editor.features.textSuperposition ? textSuperpositions(node()) : []);
  const showHideRanges = createMemo(() => annotations().map((annotation, index) => ({ annotation, id: annotation.id ?? index }))
    .filter(({ annotation }) => annotation.type === "style/show-hide" && hasActiveRange(annotation)));
  const concealedRanges = createMemo(() => showHideRanges().filter(({ id }) => !editor.showHide.shows(props.nodeKey, id)));
  const selectedShowHideRanges = createMemo(() => showHideRanges().filter(({ id }) => editor.showHide.shows(props.nodeKey, id) && editor.showHide.selectionActive(props.nodeKey, id)));
  const cellStyles = createMemo(() => compileCellStyleRuns(annotations()), undefined, {
    equals: (previous, next) => JSON.stringify(previous) === JSON.stringify(next),
  });
  const appearance = createMemo(() => blockAppearance(node()));
  let root!: HTMLDivElement;
  let surface!: HTMLDivElement;
  let flow!: HTMLDivElement;
  let disposeMount: (() => void) | undefined;
  let observer: ResizeObserver | undefined;
  let visibilityObserver: IntersectionObserver | undefined;
  let searchVisible = true;
  let frame = 0;
  let disposed = false;
  let characterHost: CharacterSurfaceHost | undefined;
  const [highlighterShapes, setHighlighterShapes] = createSignal<DecorationShape[]>([]);
  const [foregroundShapes, setForegroundShapes] = createSignal<DecorationShape[]>([]);
  const [regionEffects, setRegionEffects] = createSignal<RegionEffect[]>([]);
  const [noiseRegions, setNoiseRegions] = createSignal<NoiseRegion[]>([]);
  const [superpositionAnchors, setSuperpositionAnchors] = createSignal<SuperpositionAnchor[]>([]);
  const [selectionShapes, setSelectionShapes] = createSignal<DecorationShape[]>([]);
  const [searchShapes, setSearchShapes] = createSignal<DecorationShape[]>([]);
  const [exclusions,setExclusions] = createSignal<Array<{ owner: string; id: string; x: number; y: number; active: boolean; label?: string; title?: string; fragments: VisualFragment[] }>>([]);
  const [hovered,setHovered] = createSignal<string>();
  let measuredOrigin = { x: 0,y: 0 };
  const hoverCandidate = (event: PointerEvent) => {
    if (!exclusions().length) return;
    const scale = coordinates?.scale() ?? 1;
    const x = (event.clientX - measuredOrigin.x) / scale + surface.scrollLeft, y = (event.clientY - measuredOrigin.y) / scale + surface.scrollTop;
    const control = exclusions().find(c => (x >= c.x - 5 && x <= c.x + 25 && y >= c.y - 5 && y <= c.y + 25) || c.fragments.some(f => x >= f.x - 6 && x <= f.x + f.width + 10 && y >= f.y - 12 && y <= f.y + f.height + 6));
    setHovered(control ? `${control.owner}:${control.id}` : undefined);
  };

  const captureSelection = () => {
    const selection = document.getSelection();
    if (!selection || !selection.rangeCount || !flow.contains(selection.anchorNode) || !flow.contains(selection.focusNode)) return undefined;
    return {
      anchor: logical(pointBoundary(flow, selection.anchorNode, selection.anchorOffset)),
      head: logical(pointBoundary(flow, selection.focusNode, selection.focusOffset)),
    };
  };

  const restoreSelection = (selection: { anchor: number; head: number }) => {
    const nativeSelection = document.getSelection();
    if (!nativeSelection) return;
    const anchor = restoreBoundary(flow, presented(selection.anchor));
    const head = restoreBoundary(flow, presented(selection.head));
    nativeSelection.removeAllRanges();
    const range = document.createRange();
    range.setStart(anchor.node, anchor.offset);
    range.collapse(true);
    nativeSelection.addRange(range);
    if (selection.anchor !== selection.head && typeof nativeSelection.extend === "function") {
      nativeSelection.extend(head.node, head.offset);
    }
    if (document.activeElement === flow) {
      if (selection.anchor === selection.head) editor.setCaret(props.nodeKey,selection.head);
      else editor.setCaret();
    }
  };

  const measure = () => {
    frame = 0;
    if(disposed || !editor.visualEffects.alive() || activity && !activity().visible)return;
    characterHost?.measure();
    const scale = coordinates?.scale() ?? 1;
    const foreground: DecorationShape[] = [];
    const occupied: UnderlineLane[] = [];
    const highlighters: DecorationShape[] = [];
    const fragmentCache = new Map<string, VisualFragment[]>();
    const fragmentsFor = (start: number, end: number) => {
      const key = `${start}:${end}`;
      let fragments = fragmentCache.get(key);
      if (!fragments) {
        const d=draft();
        fragmentCache.set(key, fragments = rangeFragments(flow, surface,
          d?d.toPresentation(d.canonicalToDraft(start)):start,
          d?d.toPresentation(d.canonicalToDraft(end+1,true))-1:end, scale));
      }
      return fragments;
    };
    standoffSvgStyles(legacyAnnotations(), node()?.inlineContent.length ?? 0, type => editor.effects.get(type), occupied).forEach(({ annotation, svg, offset, index }) => {
      const key = annotationKey(annotation,index);
      const fragments = fragmentsFor(annotation.start, annotation.end);
      let shapes: DecorationShape[] = [];
      switch (svg.kind) {
        case "contribution": shapes = [...svg.definition.render({ key, property: immutable(JSON.parse(JSON.stringify(annotation))), fragments: immutable(fragments), offset })]; break;
        case "rainbow": shapes = rainbowShapes(key, fragments, offset); break;
        case "underline": shapes = underlineShapes(key, fragments, svg.colour, offset); break;
        case "highlighter":
          highlighters.push(...highlightShapes(key, fragments, "yellow").map((shape) => ({ ...shape, annotationKey:key, opacity: 1, propertyType: annotation.type })));
          return;
        case "rectangle": shapes = outlineShapes(key, fragments, "red"); break;
        case "spiky": shapes = spikyOutlineShapes(key, fragments, "red"); break;
      }
      foreground.push(...shapes.map((shape) => ({ ...shape, propertyType: annotation.type, annotationKey:key,
        caretOpacity: editor.features.annotationRangeEvents && svg.kind === "contribution" ? svg.definition.caretOpacity : undefined })));
    });
    const regions: RegionEffect[] = [];
    const noises: NoiseRegion[] = [];
    annotations().forEach((annotation, annotationIndex) => {
      if (!hasActiveRange(annotation) || annotation.start >= (node()?.inlineContent.length ?? 0)) return;
      const schema = standoffStyleSchema(annotation.type);
      if (!schema?.regionEffect && !schema?.noiseEffect) return;
      const key = annotationKey(annotation,annotationIndex);
      fragmentsFor(annotation.start, annotation.end).forEach((fragment, fragmentIndex) => {
        const region = schema.regionEffect ? regionAppearance(annotation) : undefined;
        if (region) regions.push({ ...fragment, ...region, annotationKey:key, key: `${key}:region:${fragmentIndex}`, type: String(annotation.type) });
        const noise = schema.noiseEffect ? noiseAppearance(annotation) : undefined;
        if (noise) noises.push({ ...fragment, ...noise, annotationKey:key, key: `${key}:noise:${fragmentIndex}`, type: String(annotation.type) });
      });
    });
    const superpositionRegions: SuperpositionAnchor[] = [];
    const surfaceRect = surface.getBoundingClientRect();
    for (const property of superpositions()) {
      if (property.visible === false) continue;
      const alternativeKey = node()?.ownedRelations[property.alternatives[0]];
      if (!alternativeKey) continue;
      let fragment: VisualFragment | undefined;
      if (property.active === "source") fragment = fragmentsFor(property.start, property.end)[0];
      else {
        const element = [...flow.querySelectorAll<HTMLElement>("[data-superposition-id]")]
          .find(candidate => candidate.dataset.superpositionId === property.id);
        const rect = element?.getBoundingClientRect();
        if (rect) fragment = localFragment(rect, surfaceRect, surface, scale);
      }
      if (fragment) superpositionRegions.push({ ...fragment, key: `${props.nodeKey}:${property.id}`, property, alternativeKey });
    }
    const selectionSet = editor.selections.sets[props.nodeKey];
    const selected: DecorationShape[] = [];
    selectedShowHideRanges().forEach(({ annotation, id }) => {
      if (annotation.type !== "style/show-hide" || !hasActiveRange(annotation) || annotation.start >= (node()?.inlineContent.length ?? 0)) return;
      const key = `${props.nodeKey}:show-hide:${id}`;
      const fragments = fragmentsFor(annotation.start, annotation.end);
      selected.push(...[
        ...highlightShapes(key, fragments, "#8bd7c4"),
      ].map(shape => ({ ...shape, propertyType: "editor/show-hide-selection" })));
    });
    const cross = editor.crossText.segments[props.nodeKey];
    if (cross && cross.end > cross.start) selected.push(...highlightShapes(`${props.nodeKey}:cross-text`, fragmentsFor(cross.start, cross.end - 1), "#75a9e8"));
    const preview = editor.overlays.overlays.find(overlay => overlay.ownerKey === props.nodeKey && overlay.viewType === "annotation-panel")?.annotationPreview;
    if (preview) selected.push(...highlightShapes(`${props.nodeKey}:annotation-preview`, fragmentsFor(preview.start, preview.end), "#f2c767"));
    selectionSet?.items.forEach((item) => {
      const start = Math.min(item.anchor.boundary.index, item.head.boundary.index);
      const end = Math.max(item.anchor.boundary.index, item.head.boundary.index);
      if (start === end) return;
      selected.push(
        ...highlightShapes(
          `${props.nodeKey}:${item.id}`,
          rangeFragments(flow, surface, presented(start), Math.max(presented(start), presented(end) - 1), scale),
          item.id === selectionSet.primaryId ? "#75a99a" : "#b692d1",
        ),
      );
    });
    const search: DecorationShape[] = [];
    const controls: ReturnType<typeof exclusions> = [];
    const origin = searchVisible && (editor.decorations.nodes[props.nodeKey] ?? []).some(d => d.excludable) ? surface.getBoundingClientRect() : undefined;
    if (origin) measuredOrigin = { x: origin.left,y: origin.top };
    for (const decoration of searchVisible ? editor.decorations.nodes[props.nodeKey] ?? [] : []) {
      // Shared range renderers measure their own overlays. Cell colours require no rectangles.
      if (editor.features.standoffPropertyRendering && !decoration.excludable) continue;
      const fragments = fragmentsFor(decoration.range.start, decoration.range.end - 1);
      if(!editor.features.standoffPropertyRendering){
        search.push(...highlightShapes(decoration.id, fragments, decoration.fill).map(shape => ({ ...shape, propertyType: decoration.type })));
        if (decoration.active) search.push(...outlineShapes(`${decoration.id}:active`, fragments, "#8a5100"));
      }
      const position = decoration.excludable && origin ? exclusionPosition(fragments,{ left: origin.left / scale - surface.scrollLeft, top: origin.top / scale - surface.scrollTop, width: origin.width / scale },{ width: window.innerWidth / scale,height: window.innerHeight / scale }) : undefined;
      if (position) controls.push({ owner: decoration.owner,id: decoration.id,label: decoration.excludeLabel,title: decoration.excludeTitle,...position,active: decoration.active,fragments });
    }
    rendering.measure(fragmentsFor,(start,end,height)=>allocateUnderlineLane(occupied,start,end,height));
    setHighlighterShapes(highlighters);
    setForegroundShapes(foreground);
    setRegionEffects(regions);
    setNoiseRegions(noises);
    setSuperpositionAnchors(superpositionRegions);
    setSelectionShapes(selected);
    setSearchShapes(search);
    setExclusions(controls);
  };

  let caretSurface: ReturnType<typeof editor.caretModes.mount> | undefined;
  const scheduleMeasure = () => {
    if(disposed || !editor.visualEffects.alive())return;
    untrack(() => editor.caretModes.invalidateLayout(props.nodeKey));
    if (frame) {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      else clearTimeout(frame);
    }
    if (activity && !activity().visible) { frame = 0; return; }
    frame = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(measure)
      : (setTimeout(measure, 0) as unknown as number);
  };
  createEffect(()=>{draft()?.revision();untrack(scheduleMeasure);});
  const onCandidateScroll = () => { if (searchVisible && (editor.decorations.nodes[props.nodeKey] ?? []).some(d => d.excludable)) scheduleMeasure(); };

  onMount(() => {
    if(editor.features.inlineCharacterSurfaces) createEffect(()=>{
      const sources=rendering.surfaces();
      const owner=node();
      const requests:CharacterSurfaceRequest[]=[];
      if(!draft())for(const item of sources){
        const {start,end,key}=item.source;
        if(end!==start+1||!Number.isInteger(start)||sources.some(other=>other!==item&&other.source.start<end+1&&other.source.end>start-1))continue;
        if(item.bindings.length!==1)continue;
        const binding=item.bindings[0],renderer=binding.renderer;
        if(renderer.target!=='character-surface')continue;
        const cellKey=owner?.inlineContent[start],cell=cellKey?projection.state.nodes[cellKey]:undefined;
        const text=String(cell?.payload.text??'');
        const nextKey=owner?.inlineContent[end],next=String(nextKey?projection.state.nodes[nextKey]?.payload.text??'':'');
        // A combining continuation is not a single-Cell grapheme.
        if(cell?.viewType!=='text-cell'||! /^[A-Z]$/.test(text)||/^[\p{Mark}\u200c\u200d\u202a-\u202e\u2066-\u2069]/u.test(next))continue;
        if(concealedRanges().some(r=>hasActiveRange(r.annotation)&&r.annotation.start<=start&&r.annotation.end>=start)||superpositions().some(r=>r.active!=='source'&&r.start<=start&&r.end>=start))continue;
        const element=flow.children[start] as HTMLElement|undefined;
        if(!element||element.dataset.inlineKey!==cellKey)continue;
        requests.push({identity:key,cell:element,text,renderer,params:binding.params()});
      }
      untrack(()=>{
        if(!requests.length){characterHost?.dispose();characterHost=undefined;return;}
        characterHost??=new CharacterSurfaceHost(flow,scheduleMeasure);
        characterHost.update(requests);
      });
    });
    document.addEventListener("scroll",onCandidateScroll,true);
    disposeMount = editor.mounts.register(props.nodeKey, {
      root,
      focusElement: flow,
      inputPolicy: "standoff",
      focus: () => flow.focus({ preventScroll: true }),
      captureInlineSelection: captureSelection,
      restoreInlineSelection: restoreSelection,
      presentProvisional: value=>{setDraft(value);scheduleMeasure();},
      finishProvisionalComposition:()=>{
        // Native composition can insert unowned Text nodes or alter an existing
        // text span. Reconcile within the character owner before applying the
        // composition result to the draft; the Solid fallback otherwise retains
        // its unchanged string binding and leaves native text behind.
        const d=draft();if(!d)return;
        for(const child of Array.from(flow.childNodes)){
          if(child.nodeType===Node.TEXT_NODE){child.remove();continue;}
          if(!(child instanceof HTMLElement))continue;
          const key=child.dataset.inlineKey??child.dataset.provisionalCell,cell=key&&d.cell(key);
          if(!cell||child.querySelector('img')||child.dataset.superpositionId)continue;
          if(child.firstChild?.nodeType===Node.TEXT_NODE&&child.childNodes.length===1)child.firstChild.nodeValue=cell.text;
          else child.replaceChildren(document.createTextNode(cell.text));
        }
      },
      inlinePoint: (node, offset) => flow.contains(node) ? logical(pointBoundary(flow, node, offset)) : undefined,
      inlinePointAt: (x, y) => {
        // Browser caret hit tests can remain pinned to the active editing host
        // while dragging. Resolve against the actual paragraph under the pointer.
        let closest = 0, distance = Infinity;
        Array.from(flow.children).forEach((cell, index) => {
          for (const rect of Array.from(cell.getClientRects())) {
            const dy = Math.max(rect.top - y, 0, y - rect.bottom);
            const dx = Math.max(rect.left - x, 0, x - rect.right);
            const score = dy * dy * 10000 + dx * dx;
            if (score < distance) { distance = score; closest = index + (x >= (rect.left + rect.right) / 2 ? 1 : 0); }
          }
        });
        return logical(closest);
      },
      inlineBoundary: index => {
        index=presented(index);
        const cell = flow.children[Math.min(index, flow.children.length - 1)];
        if (cell?.firstChild?.nodeType === Node.TEXT_NODE) return { node: cell.firstChild, offset: index < flow.children.length ? 0 : cell.firstChild.textContent!.length };
        return restoreBoundary(flow, index);
      },
      captureText: () => draft()?.text() ?? (node()?.inlineContent ?? []).map((cellKey, index) => {
        const projected = superpositions().some(property => property.active !== "source" && property.start <= index && property.end >= index);
        return projected
          ? String(projection.state.nodes[cellKey]?.payload.text ?? "")
          : String(flow.children[index]?.textContent ?? projection.state.nodes[cellKey]?.payload.text ?? "");
      }).join(""),
    });
    if (editor.features.caretModes) {
      caretSurface = editor.caretModes.mount(props.nodeKey, flow, root.closest('[data-block-type="document-block"], [data-block-type="main-list-block"], [data-block-type="membrane-block"]') ?? root.parentElement ?? root, () => coordinates?.scale() ?? 1);
      caretSurface.visible((!activity || activity().visible) && typeof IntersectionObserver === "undefined");
    }
    onCleanup(observeFontLayout(surface,()=>{editor.measurements.invalidateRanges(props.nodeKey);scheduleMeasure();}));
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(scheduleMeasure);
      observer.observe(surface);
    }
    if (typeof IntersectionObserver !== "undefined") {
      visibilityObserver = new IntersectionObserver(entries => { const visible = entries[0]?.isIntersecting ?? false; caretSurface?.visible(visible && (!activity || activity().visible)); if (visible !== searchVisible) { searchVisible = visible; scheduleMeasure(); } });
      visibilityObserver.observe(surface);
    }
    scheduleMeasure();
    if (activity) createEffect(() => {
      const visible = activity().visible;
      untrack(() => {
        caretSurface?.visible(visible && searchVisible);
        scheduleMeasure();
      });
    });
  });

  createEffect(() => {
    coordinates?.scale();
    editor.effects.track();
    rendering.layout();
    rendering.layoutClasses();
    node()?.inlineContent.length;
    concealedRanges();
    selectedShowHideRanges();
    JSON.stringify(annotations());
    for (const property of superpositions()) {
      const alternative = projection.state.nodes[node()?.ownedRelations[property.alternatives[0]] ?? ""];
      alternative?.inlineContent.length;
      JSON.stringify(alternative?.payload.standoffProperties);
    }
    selectionGeometry();
    temporaryLayout();
    editor.crossText.segments[props.nodeKey]?.start;
    editor.crossText.segments[props.nodeKey]?.end;
    const preview = editor.overlays.overlays.find(overlay => overlay.ownerKey === props.nodeKey && overlay.viewType === "annotation-panel")?.annotationPreview;
    preview?.start; preview?.end;
    scheduleMeasure();
  });

  onCleanup(() => {
    disposed = true;
    if(!projection.state.nodes[props.nodeKey])editor.decorations.removeOccurrence(props.nodeKey);
    document.removeEventListener("scroll",onCandidateScroll,true);
    if (editor.crossText.segments[props.nodeKey]) queueMicrotask(() => editor.crossText.validate());
    characterHost?.dispose();
    caretSurface?.dispose();
    editor.measurements.releaseCaret(props.nodeKey);
    disposeMount?.();
    editor.annotationEvents.remove(props.nodeKey);
    observer?.disconnect();
    visibilityObserver?.disconnect();
    if (frame) {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      else clearTimeout(frame);
    }
  });

  // Solid owns the paragraph and its surrounding controls. The cell updater is
  // created after the flow element so initial cells exist before mount/selection
  // restoration, without a reactive owner for each character.
  const CharacterFlow = () => {
    const element = (
        <div
          ref={flow}
          class="reactive-standoff-flow"
          contentEditable={!editor.crossText.segments[props.nodeKey]}
          tabIndex={0}
          aria-readonly={!!editor.crossText.segments[props.nodeKey]}
          role="textbox"
          aria-multiline="true"
          spellcheck={true}
        >
          {!editor.features.directDomCharacterCells && <For each={draft()?.sequence().map(c=>c.key)??node()?.inlineContent ?? []}>
            {(cellKey, index) => {
              const sourceIndex=()=>draft()?.cell(cellKey)?.canonicalIndex??index();
              const provisional=()=>draft()?.cell(cellKey)?.role;
              const cell = () => projection.state.nodes[cellKey]??(draft()?.cell(cellKey)?{viewType:'text-cell',payload:{text:draft()!.cell(cellKey)!.text}} as unknown as BlockNode:undefined);
              const projected = () => superpositions().find(property =>
                property.active !== "source" && sourceIndex() >= property.start && sourceIndex() <= property.end &&
                !!node()?.ownedRelations[property.active]);
              return (
                <Show when={!projected() || sourceIndex() === projected()!.start} fallback={<span
                  class={["reactive-superposition-source-cell",classesAt(rendering.classes(),sourceIndex())].filter(Boolean).join(" ")}
                  data-inline-key={cellKey}
                  data-inline-index={index()}
                  aria-hidden="true"
                >{String(cell()?.payload.text ?? "")}</span>}>
                  <Show when={projected()} fallback={<Show
                    when={cell()?.viewType === "image-cell"}
                    fallback={<span
                      data-inline-key={provisional()?undefined:cellKey}
                      data-provisional-cell={provisional()?cellKey:undefined}
                      data-inline-index={index()}
                      class={provisional()&&provisional()!=='draft-text'?'scry-bracket-cell':classesAt(rendering.classes(),sourceIndex())}
                      style={cellStyleAt(cellStyles(), sourceIndex())}
                      classList={{ "reactive-standoff-cell--concealed": concealedRanges().some(({ annotation }) => hasActiveRange(annotation) && annotation.start <= sourceIndex() && annotation.end >= sourceIndex()) }}
                    >{(cell()?.payload.text as string | undefined) ?? ""}</span>}
                  >
                    <span
                      class={["reactive-inline-image",classesAt(rendering.classes(),sourceIndex())].filter(Boolean).join(" ")}
                      data-inline-key={cellKey}
                      data-inline-index={index()}
                      contentEditable={false}
                      role="img"
                      data-image-placeholder={!managedAsset(cell()?.payload.asset) && !cell()?.payload.src ? "Image not loaded" : undefined}
                      aria-label={!managedAsset(cell()?.payload.asset) && !cell()?.payload.src
                        ? `Image not loaded${cell()?.payload.alt ? `: ${cell()!.payload.alt}` : ""}`
                        : String(cell()?.payload.alt || "Inline image")}
                    >
                      <img
                        ref={image => { createEffect(() => { const asset = managedAsset(cell()?.payload.asset); if (asset) { const release = editor.clipboard.assets.bind(image, asset); onCleanup(release); } }); }}
                        src={managedAsset(cell()?.payload.asset) ? undefined : String(cell()?.payload.src ?? "") || undefined}
                        alt={String(cell()?.payload.alt ?? "")}
                        width={cell()?.payload.width as number | undefined}
                        height={cell()?.payload.height as number | undefined}
                        onLoad={event => {
                          if (managedAsset(cell()?.payload.asset)) { scheduleMeasure(); return; }
                          // A cached image can finish after its transient view is disposed.
                          if (!event.currentTarget.isConnected || !cell()?.payload.src || !editor.node(cellKey)) return;
                          editor.commands.updateInlineImage(cellKey, { status: "ready" });
                          scheduleMeasure();
                        }}
                        onError={event => {
                          if (event.currentTarget.isConnected && cell()?.payload.src && editor.node(cellKey)) editor.commands.updateInlineImage(cellKey, { status: "failed" });
                        }}
                      />
                    </span>
                  </Show>}>{property => <ProjectedAlternative
                    nodeKey={node()!.ownedRelations[property().active]}
                    sourceIndex={index()}
                    sourceEnd={property().end}
                    propertyId={property().id}
                    classes={classesAt(rendering.classes(),sourceIndex())}
                  />}</Show>
                </Show>
              );
            }}
          </For>}
        </div>
    ) as HTMLDivElement;
    if (editor.features.directDomCharacterCells) {
      const cells = new DirectCharacterCells(element, (key, status) => {
        if (managedAsset(editor.node(key)?.payload.asset)) { if (status === "ready") scheduleMeasure(); return; }
        if (!editor.node(key)?.payload.src) return;
        editor.commands.updateInlineImage(key, { status });
        if (status === "ready") scheduleMeasure();
      }, (image, asset) => editor.clipboard.assets.bind(image, asset));
      createRenderEffect(() => {
        const owner = node();
        const styles = cellStyles();
        const classRuns = rendering.classes();
        const concealed = concealedRanges();
        const projected = superpositions().filter(property => property.active !== "source" && !!owner?.ownedRelations[property.active]);
        const alternatives = new Map(projected.map(property => {
          const alternative = projection.state.nodes[owner!.ownedRelations[property.active]];
          const runs = compileCellStyleRuns(((alternative?.payload.standoffProperties as StandoffAnnotation[] | undefined) ?? [])
            .map(annotation => editor.linkedAnnotations.resolve(annotation, alternative?.contentKey) as StandoffAnnotation));
          return [property.id, {
            id: property.id, end: property.end,
            cells: (alternative?.inlineContent ?? []).map((key, index) => ({
              key, text: String(projection.state.nodes[key]?.payload.text ?? ""), style: cellStyleAt(runs, index),
            })),
          }];
        }));
        const presentation=(owner?.inlineContent ?? []).map((key, index): CharacterCellPresentation => {
          const cell = projection.state.nodes[key];
          const classes=classesAt(classRuns,index);
          const property = projected.find(property => index >= property.start && index <= property.end);
          if (property) return { key, index, classes, text: String(cell?.payload.text ?? ""),
            hiddenSource: index !== property.start,
            alternative: index === property.start ? alternatives.get(property.id) : undefined };
          if (cell?.viewType === "image-cell") return { key, index, classes, text: "", image: {
            asset: managedAsset(cell.payload.asset), src: String(cell.payload.src ?? ""), alt: String(cell.payload.alt ?? ""), label: String(cell.payload.alt ?? "Inline image"),
            width: cell.payload.width as number | undefined, height: cell.payload.height as number | undefined,
          } };
          return { key, index, text: String(cell?.payload.text ?? ""), classes, style: cellStyleAt(styles, index),
            concealed: concealed.some(({ annotation }) => hasActiveRange(annotation) && annotation.start <= index && annotation.end >= index) };
        });
        cells.update(draft()?.present(presentation)??presentation);
      });
      onCleanup(() => cells.dispose());
    }
    return element;
  };

  return (
    <div
      ref={root}
      class={`abstract-block reactive-standoff-block ${appearance().classes.join(" ")}`}
      style={appearance().style}
      classList={{ "reactive-block--focused": editor.focus.state.focusedKey === props.nodeKey, "reactive-task-row": editor.features.taskLists && taskState(node()) !== undefined, "reactive-task-row--checked": editor.features.taskLists && taskState(node()) === true }}
      data-block-id={(node()?.payload.id as string | undefined) ?? ""}
      data-client-id={props.nodeKey}
      data-runtime-key={props.nodeKey}
      data-task-item={editor.features.taskLists && taskState(node()) !== undefined ? props.nodeKey : undefined}
      data-block-type="standoff-editor-block"
    >
      <Show when={editor.features.taskLists && taskState(node()) !== undefined}><StandaloneTaskDisclosure nodeKey={props.nodeKey} /><TaskControl nodeKey={props.nodeKey} /></Show>
      <div ref={surface} class="reactive-standoff-surface" onClick={event => editor.gloss.click(props.nodeKey,event)} onPointerMove={hoverCandidate} onPointerLeave={() => setHovered(undefined)}>
        <DecorationLayer class="reactive-annotation-layer reactive-annotation-layer--foreground" shapes={highlighterShapes().filter(shape=>!shape.annotationKey||legacySvgKeys().has(shape.annotationKey))} blendMode="color-dodge" />
        <DecorationLayer class="reactive-selection-layer" shapes={selectionShapes()} />
        <DecorationLayer class="reactive-selection-layer reactive-search-layer" shapes={searchShapes()} />
        <For each={exclusions()}>{control => <button type="button" class="candidate-exclusion" data-candidate-exclusion data-native-context-menu aria-label={control.label ?? "Exclude this match"} title={control.title ?? "Exclude this match"} classList={{ "candidate-exclusion--visible": control.active || hovered() === `${control.owner}:${control.id}` }} style={{ left: `${control.x}px`,top: `${control.y}px` }}
          onPointerDown={event => { event.preventDefault(); event.stopPropagation(); }}
          onClick={event => { event.preventDefault(); event.stopPropagation(); editor.decorations.exclude(control.owner,control.id, document.activeElement === event.currentTarget); }}
          onKeyDown={event => { event.stopPropagation(); if (event.key === "Enter" || event.key === " ") { event.preventDefault(); editor.decorations.exclude(control.owner,control.id, document.activeElement === event.currentTarget); } }}
        >×</button>}</For>
        <RangeEffectLayer class="reactive-selection-layer reactive-search-layer" bindings={rendering.overlays().filter(binding=>binding.source().owner.kind==='session')} />
        <CharacterFlow />
        <SuperpositionLayer owner={node} anchors={superpositionAnchors()} />
        <RangeEffectLayer class="reactive-annotation-layer reactive-annotation-layer--foreground" bindings={rendering.overlays().filter(binding=>binding.source().owner.kind==='annotation')} />
        <RegionEffectLayer regions={regionEffects().filter(region=>activeVisualKeys().has(region.annotationKey))} />
        <NoiseLayer regions={noiseRegions().filter(region=>activeVisualKeys().has(region.annotationKey))} />
        <DecorationLayer class="reactive-annotation-layer reactive-annotation-layer--foreground" shapes={foregroundShapes().filter(shape=>!shape.annotationKey||legacySvgKeys().has(shape.annotationKey))} active={key => editor.annotationEvents.isActive(props.nodeKey,key)} />
      </div>
      <RelationBlocks parentKey={props.nodeKey} />
      <ChildBlocks parentKey={props.nodeKey} />
    </div>
  );
}
