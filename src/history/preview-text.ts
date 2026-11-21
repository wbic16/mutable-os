import type { DeepReadonly } from "../block-tree/commit-capture";
import type { ContentRecord } from "../block-tree/types";
import type { HistoricalFragment } from "./types";

/** Only inert text and a fixed annotation style allowlist; no live view registry. */
export function textRuns(content: DeepReadonly<ContentRecord>, fragment: DeepReadonly<HistoricalFragment>) {
  const value = content.compactInline ? content.compactInline.spans.map(a=>a.kind==='text'?a.text:'\uFFFC').join('') : content.inlineContent.length ? content.inlineContent.map(key => {
    const cell = fragment.contents[fragment.placements[key]?.contentKey];
    return cell?.viewType === "image-cell" ? "[Image]" : String(cell?.payload.text ?? "");
  }).join("") : String(content.payload.text ?? "");
  const points = [...value];
  const annotations = (Array.isArray(content.payload.standoffProperties) ? content.payload.standoffProperties : []) as readonly { type?: string; start?: number; end?: number; isDeleted?: boolean }[];
  const active = annotations.filter(a => !a.isDeleted && Number.isSafeInteger(a.start) && Number.isSafeInteger(a.end) && a.start! >= 0 && a.end! >= a.start!);
  const boundaries = [...new Set([0, points.length, ...active.flatMap(a => [Math.min(points.length, a.start!), Math.min(points.length, a.end! + 1)])])].sort((a, b) => a - b);
  const styles: Record<string, string> = { "style/bold": "history-bold", "style/italics": "history-italic", "style/underline": "history-underline", "style/highlight": "history-highlight", "style/highlighter": "history-highlight", "style/strikethrough": "history-strike" };
  return boundaries.slice(0, -1).map((start, index) => ({ text: points.slice(start, boundaries[index + 1]).join(""), classes: active.filter(a => a.start! <= start && a.end! >= start).map(a => styles[a.type ?? ""] ?? "").join(" ") }));
}

