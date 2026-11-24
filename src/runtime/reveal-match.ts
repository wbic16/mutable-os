import { codeSurface } from '../features/standoff-code-mirror/mounts';
import { EditorView } from '@codemirror/view';
import {revealInlineReading} from './inline-alternatives';
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { SearchMatch } from "./text-search";
import { ancestorPath } from "./text-search";
import { markerNodeKey, type DocumentPositionMarker } from "./document-position-markers";

/** Navigation only: no canonical writes and no focus transfer. */
export async function revealMatch(editor: ReactiveEditor, match: SearchMatch, current = () => true): Promise<boolean> {
  if (!current()) return false;
  for (let i = 0; i + 1 < match.path.length; i++) {
    const node = editor.node(match.path[i]);
    if(node)revealInlineReading(editor,node,match.path[i+1]);
    if (node && ["tab-row-block", "document-tab-row-block", "sticky-tab-row-block", "surface-block"].includes(node.viewType)) editor.setViewChild(node.key, match.path[i + 1]);
  }
  await new Promise(resolve => setTimeout(resolve, 0));
  if (!current()) return false;
  await editor.focus.ensureRendered(match.ranges[0].nodeKey, current);
  if (!current()) return false;
  const range = match.ranges[0], mount = editor.mounts.get(range.nodeKey);
  if (!mount) return false;
  const native=codeSurface(editor,range.nodeKey)?.code;if(native&&range.coordinate==='utf16')native.view.dispatch({effects:EditorView.scrollIntoView(range.start,{y:'center'})});
  const point = range.coordinate === "cell" ? mount.inlineBoundary?.(range.start) : undefined;
  (point?.node.parentElement ?? mount.root).scrollIntoView?.({ block: "center", inline: "nearest" });
  return true;
}

/** Source-neutral occurrence navigation for entity, annotation, and Block markers. */
export async function revealPositionMarker(editor: ReactiveEditor, marker: DocumentPositionMarker, current = () => true): Promise<boolean> {
  const path = ancestorPath(editor, markerNodeKey(marker)).map(node => node.key);
  if (!path.length || !current()) return false;
  for (let index = 0; index + 1 < path.length; index++) {
    const node = editor.node(path[index]);
    if(node)revealInlineReading(editor,node,path[index+1]);
    if (node && ["tab-row-block", "document-tab-row-block", "sticky-tab-row-block", "surface-block"].includes(node.viewType)) editor.setViewChild(node.key, path[index + 1]);
  }
  await new Promise(resolve => setTimeout(resolve, 0));
  if (!current()) return false;
  await editor.focus.ensureRendered(markerNodeKey(marker), current);
  if (!current()) return false;
  const mount = editor.mounts.get(markerNodeKey(marker));
  if (!mount) return false;
  if(marker.anchor.kind==='text-range'){const range=marker.anchor.range,native=codeSurface(editor,range.nodeKey)?.code;if(native&&range.coordinate==='utf16')native.view.dispatch({effects:EditorView.scrollIntoView(range.start,{y:'center'})});}
  const point = marker.anchor.kind === "text-range" && marker.anchor.range.coordinate === "cell" ? mount.inlineBoundary?.(marker.anchor.range.start) : undefined;
  (point?.node.parentElement ?? mount.root).scrollIntoView?.({ block: "center", inline: "nearest" });
  editor.concertina.setActiveMarker(marker.id);
  return true;
}
