import type {NodeKey,FeatureBlocks} from "../../feature-api";
import {DEFAULT_TIMER_SIZE,timerBlockDto} from "./model";

function initialPosition(blocks: FeatureBlocks, originKey: NodeKey) {
  const rect = blocks.bounds(originKey);
  if (!rect) return { x: 24, y: 80 };
  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;
  return {
    x: Math.max(8, Math.min(rect.left - DEFAULT_TIMER_SIZE, viewportWidth - DEFAULT_TIMER_SIZE - 8)),
    y: Math.max(8, Math.min(rect.top, viewportHeight - DEFAULT_TIMER_SIZE - 8)),
  };
}

/** Adds a persistent timer beside the origin in the model and anchors its floating view to the origin on screen. */
export function createTimerBlock(blocks: FeatureBlocks, originKey: NodeKey): string | undefined {
  let origin = blocks.get(originKey);
  if (!origin) return;
  const position = initialPosition(blocks, origin.key);
  if (origin.type === "document-window-block") {
    const document = origin.children.find(key => blocks.get(key)?.type === "document-block");
    if (document) origin = blocks.get(document)!;
  }
  const viewId = origin.viewId;
  let placement: string;
  if (origin.type === "document-block") placement = blocks.insert(timerBlockDto(position), { kind: "at", parentKey: origin.key, index: origin.children.length });
  else placement = blocks.insert(timerBlockDto(position), { kind: "after", anchorKey: origin.key });
  blocks.focusPlacement(placement, viewId);
  return placement;
}
