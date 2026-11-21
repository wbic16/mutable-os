import type { NodeKey } from "../block-tree/types";
import type { MountRegistry } from "./mounts";

export interface Point {
  x: number;
  y: number;
}

export class MeasurementService {
  private caretCache?: { frame: number; key: string; generation: number; index: number; anchor: Node | null; offset: number; rect?: DOMRectReadOnly };
  constructor(private readonly mounts: MountRegistry) {}

  /** One native collapsed Range query per frame. Element-boundary selections
   * (including our restoreInlineSelection) may have no rect: resolve just the
   * neighbouring boundary, never walk or measure the paragraph's cells. */
  caretRect(nodeKey: NodeKey, index: number, frame: number): DOMRectReadOnly | undefined {
    const handle = this.mounts.get(nodeKey), flow = handle?.focusElement;
    if (!handle || !flow) return;
    if(handle.inlineCaretRect)return handle.inlineCaretRect(index);
    const selection = flow.ownerDocument.getSelection();
    if (flow.ownerDocument.activeElement !== flow || !selection?.isCollapsed || !selection.rangeCount || !flow.contains(selection.anchorNode)) return;
    const cached = this.caretCache;
    if (cached?.frame === frame && cached.key === nodeKey && cached.generation === handle.generation && cached.index === index && cached.anchor === selection.anchorNode && cached.offset === selection.anchorOffset) return cached.rect;
    const usable = (range: Range) => [...(range.getClientRects?.() ?? [])].find(r => r.height > 0 && Number.isFinite(r.left) && Number.isFinite(r.top));
    let rect = usable(selection.getRangeAt(0));
    if (!rect) {
      const boundary = handle.inlineBoundary?.(index);
      const container = boundary?.node ?? flow, offset = boundary?.offset ?? index;
      const next = container.childNodes[offset], previous = container.childNodes[offset - 1], cell = next ?? previous;
      const text = container.nodeType === Node.TEXT_NODE ? container : cell?.firstChild;
      if (text?.nodeType === Node.TEXT_NODE) {
        const range = flow.ownerDocument.createRange();
        range.setStart(text, container === text ? offset : next ? 0 : text.textContent?.length ?? 0); range.collapse(true);
        rect = usable(range);
      }
      if (!rect) {
        const box = cell instanceof Element ? cell.getBoundingClientRect() : flow.getBoundingClientRect();
        const x = cell && !next ? box.right : box.left;
        rect = new DOMRectReadOnly(x, box.top, 0, box.height);
      }
    }
    const retained = rect && Object.freeze(new DOMRectReadOnly(rect.x, rect.y, rect.width, rect.height));
    this.caretCache = { frame, key: nodeKey, generation: handle.generation, index, anchor: selection.anchorNode, offset: selection.anchorOffset, rect: retained };
    return retained;
  }

  releaseCaret(nodeKey?: string) { if (!nodeKey || this.caretCache?.key === nodeKey) this.caretCache = undefined; }

  /** Shared by the quick-input placement and its temporary range highlight. */
  rangeRects(nodeKey:NodeKey,start:number,end:number,frame:number):DOMRectReadOnly[] {
    const handle=this.mounts.get(nodeKey);if(!handle)return [];
    if(handle.inlineRangeRects)return handle.inlineRangeRects(start,end);
    const a=handle.inlineBoundary?.(start),b=handle.inlineBoundary?.(end);if(!a||!b)return [];
    const key=`${nodeKey}:${handle.generation}:${start}:${end}:${frame}`;
    if(this.rangeCache?.key===key)return this.rangeCache.rects;
    const range=handle.root.ownerDocument.createRange();range.setStart(a.node,a.offset);range.setEnd(b.node,b.offset);
    const rects=typeof range.getClientRects==='function'?[...range.getClientRects()].filter(r=>r.height>0):[];
    this.rangeCache={key,rects};return rects;
  }
  private rangeCache?:{key:string;rects:DOMRectReadOnly[]};
  private retainedRanges=new Map<string,{stamp:string;ranges:Map<string,{x:number;y:number;width:number;height:number}[]>}>();
  readonly rangeDiagnostics={reads:0,hits:0};
  /** Occurrence-local geometry, translated by one shared block measurement.
   * Scroll/host translation reuses offsets; content revision, width, scale,
   * remount generation and explicit font/layout invalidation invalidate them. */
  retainedRangeRects(nodeKey:NodeKey,start:number,end:number,revision:number,origin:DOMRectReadOnly,scale=1,frame=performance.now()):DOMRectReadOnly[]{
    const handle=this.mounts.get(nodeKey);if(!handle)return [];
    const stamp=`${handle.generation}:${revision}:${origin.width}:${scale}`;
    let cached=this.retainedRanges.get(nodeKey);
    if(cached?.stamp!==stamp){this.rangeCache=undefined;cached={stamp,ranges:new Map()};this.retainedRanges.set(nodeKey,cached);}
    const key=`${start}:${end}`;let local=cached.ranges.get(key);
    if(!local){this.rangeDiagnostics.reads++;local=this.rangeRects(nodeKey,start,end,frame).map(r=>({x:(r.left-origin.left)/scale,y:(r.top-origin.top)/scale,width:r.width/scale,height:r.height/scale}));cached.ranges.set(key,local);}
    else this.rangeDiagnostics.hits++;
    return local.map(r=>new DOMRectReadOnly(origin.left+r.x*scale,origin.top+r.y*scale,r.width*scale,r.height*scale));
  }
  invalidateRanges(nodeKey?:NodeKey){if(nodeKey)this.retainedRanges.delete(nodeKey);else this.retainedRanges.clear();this.rangeCache=undefined;}
  blockRect(nodeKey: NodeKey): DOMRect | undefined {
    return this.mounts.get(nodeKey)?.root.getBoundingClientRect();
  }

  selectionRects(nodeKey: NodeKey): DOMRect[] {
    const handle = this.mounts.get(nodeKey);
    if (!handle) return [];
    if (handle.focusElement instanceof HTMLTextAreaElement) {
      return [handle.focusElement.getBoundingClientRect()];
    }
    const selection = handle.focusElement.ownerDocument.getSelection();
    if (!selection?.rangeCount || !handle.root.contains(selection.anchorNode)) return [];
    const range = selection.getRangeAt(0);
    return typeof range.getClientRects === "function" ? [...range.getClientRects()] : [];
  }

  toLayerPoint(viewportPoint: Point, layer: Element, scale = 1): Point | undefined {
    if (layer instanceof SVGGraphicsElement) {
      const matrix = layer.getScreenCTM();
      if (!matrix) return undefined;
      try {
        const point = new DOMPoint(viewportPoint.x, viewportPoint.y).matrixTransform(matrix.inverse());
        return Number.isFinite(point.x) && Number.isFinite(point.y)
          ? { x: point.x, y: point.y }
          : undefined;
      } catch {
        return undefined;
      }
    }
    const rect = layer.getBoundingClientRect();
    return { x: (viewportPoint.x - rect.left) / scale, y: (viewportPoint.y - rect.top) / scale };
  }
}
