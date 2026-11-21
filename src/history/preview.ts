import { sourceTextTypes } from '../knowledge/policy';
import { restoreAvailability } from "./block-restore";
/** Display-only projection. Exact graphs/comparison remain in the read worker. */
import { freeze, type DeepReadonly } from "../block-tree/commit-capture";
import type { OccurrenceTree, SubtreeResult } from "./types";
import { textRuns } from "./preview-text";
export interface PreviewNode { id: string; type: string; caption: string; runs: { text: string; classes: string }[]; empty: boolean; stop: boolean; children: Array<PreviewNode | "external"> }
export interface CompactPreview { blockId: string; revisionId: string; status: SubtreeResult["status"]; message?: string; occurrence?: DeepReadonly<SubtreeResult["occurrence"]>; candidates?: DeepReadonly<SubtreeResult["candidates"]>; lastAvailableRevisionId?: string; deletedKind?: SubtreeResult["deletedKind"]; missingDependencies: boolean; root?: PreviewNode }
export function compactPreview(result: DeepReadonly<SubtreeResult>): DeepReadonly<CompactPreview> {
  const fragment = result.fragment;
  const root = fragment?.tree?.contentKey ?? Object.values(fragment?.contents ?? {}).find(c => c.payload.id === result.blockId)?.key;
  const visit = (key: string, tree?: DeepReadonly<OccurrenceTree>): PreviewNode => {
    const content = fragment!.contents[key], metadata = content.payload.metadata as { name?: string; title?: string } | undefined;
    return { id: String(content.payload.id ?? ""), type: content.viewType, caption: metadata?.name ?? metadata?.title ?? content.viewType.replace(/-block$/, "").replaceAll("-", " "),
      runs: ["standoff-editor-block", "plain-text-block", "code-mirror-block", ...sourceTextTypes].includes(content.viewType) ? textRuns(content, fragment!) : [],
      empty: !content.compactInline?.spans.length && !content.inlineContent.length && !content.payload.text, stop: !!(tree?.cycle || tree?.excludedReference),
      children: tree?.cycle || tree?.excludedReference ? [] : (tree?.children ?? []).filter(c => c.slot?.kind !== "inline-content").map(c => c.excludedReference ? "external" : visit(c.contentKey, c)) };
  };
  return freeze({ blockId: result.blockId, revisionId: result.revisionId, status: result.status, ...(result.message ? { message: result.message } : {}),
    ...(result.occurrence ? { occurrence: result.occurrence } : {}), ...(result.candidates ? { candidates: result.candidates } : {}), ...(result.lastAvailableRevisionId ? { lastAvailableRevisionId: result.lastAvailableRevisionId } : {}), ...(result.deletedKind ? { deletedKind: result.deletedKind } : {}),
    missingDependencies: !!fragment?.diagnostics.some(d => !d.available), ...(root && fragment ? { root: visit(root, fragment.tree) } : {}) });
}

export interface HistoryDisplayResult {
  selected: DeepReadonly<CompactPreview>;
  restore?: { supported: boolean; reason?: string };
  comparison: { before: DeepReadonly<CompactPreview>; after: DeepReadonly<CompactPreview>; comparable: boolean; changes: DeepReadonly<import("./types").SubtreeComparison["changes"]> };
  provenance?: { resourceId: string; memoirId?: string; segmentId: string; headRevisionId: string };
  timing?: import("./read-timing").ReadTiming;
}
/** The only selection payload crossing the UI boundary; exact comparison is
 * computed BEFORE projection. Preview data never authorizes a history read. */
export function displaySelection(value: import("./ui-session-source").HistorySelectionResult, provenance?: HistoryDisplayResult["provenance"]): HistoryDisplayResult {
  const selected = compactPreview(value.selected), after = value.comparison.after === value.selected ? selected : compactPreview(value.comparison.after);
  return { selected, restore: restoreAvailability(value.selected), comparison: { before: selected, after, comparable: value.comparison.comparable, changes: value.comparison.changes }, ...(provenance ? { provenance } : {}), ...(value.timing ? { timing: value.timing } : {}) };
}
