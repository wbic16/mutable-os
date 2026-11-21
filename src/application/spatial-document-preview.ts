import {contentUnits} from "../block-tree/inline-sequence";
import type { ContentRecord, RepositoryState } from "../block-tree/types";
import { previewImageUrl, type DocumentPreview, type PreviewBlock } from "../features/spatial/document-preview";
/** Read a bounded first-page digest directly from authored records at a desk
 * lifecycle boundary. No DTO encoding, mounts, measurement, effects or observers. */
export function spatialDocumentPreview(state: RepositoryState, root: ContentRecord, label: string, widget: (type: string) => boolean = () => false): DocumentPreview {
  const blocks: PreviewBlock[] = [], seen = new Set<string>(); let remaining = 6000, inlineBudget = 8000, images = 0, truncated = false;
  const visit = (content: ContentRecord | undefined) => {
    if (!content || seen.has(content.key)) return;
    if (seen.size >= 160 || blocks.length >= 20 || remaining <= 0) { truncated = true; return; }
    seen.add(content.key);
    if (["document-window-block", "window-block", "portal-block"].includes(content.viewType) && content !== root) return;
    const metadata = content.payload.metadata as Record<string, unknown> | undefined;
    if (widget(content.viewType)) {
      const label = String(metadata?.title ?? content.viewType.replace(/-block$/, "").replace(/-/g, " ")).slice(0, 80);
      blocks.push({ kind: "widget", label });
    } else if (content.viewType === "image-block") {
      const url = previewImageUrl(metadata?.url);
      if (url && images++ < 3) blocks.push({ kind: "image", url, alt: String(metadata?.alt ?? metadata?.title ?? "Image").slice(0, 120) });
    } else {
      let text = "";
      if (content.inlineKind === "standoff") {
        for (const cell of contentUnits(state,content)) {
          if (text.length >= remaining || inlineBudget-- <= 0) { truncated = true; break; }
          if (cell.kind==='text') text += cell.text.slice(0, remaining - text.length);
        }
      } else if (typeof content.payload.text === "string") text = content.payload.text;
      text = text.slice(0, remaining); remaining -= text.length;
      if (text.trim()) {
        const props = content.payload.blockProperties;
        const property = Array.isArray(props) ? props.find(p => p && typeof p === "object" && (/^block\/font\/size\/h[1-4]$/.test(p.type) || p.type === "block/font/size" && /^h[1-4]$/.test(p.value))) : undefined;
        const heading = property ? Number(String(property.type === "block/font/size" ? property.value : property.type).slice(-1)) : undefined;
        blocks.push({ kind: "text", text, ...(heading ? { heading } : {}) });
      }
    }
    for (const key of content.children) { if (blocks.length >= 20 || remaining <= 0 || seen.size >= 160) { truncated = true; break; } visit(state.contents[state.placements[key]?.contentKey]); }
  };
  visit(root);
  const metadata = root.payload.metadata as Record<string, unknown> | undefined;
  const firstHeading = blocks.find((b): b is Extract<PreviewBlock, { kind: "text" }> => b.kind === "text" && !!b.heading);
  const title = String(metadata?.title ?? metadata?.name ?? firstHeading?.text ?? label).replace(/\.json$/i, "").slice(0, 160);
  return { title, blocks, truncated };
}
