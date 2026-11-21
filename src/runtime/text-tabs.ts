import {prepareTabs,tabPanel} from '../block-tree/compound-authoring';
import { encodeBlock } from "../block-tree/codecs";
import type { ExistingBlockDto, NodeKey } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";

/** Original handleCreateNewTab: wrap outside a tab, copy into a new tab inside. */
export function createTextTab(editor: ReactiveEditor, key: NodeKey, selection?: { anchor: number; head: number }): boolean {
  const source = editor.node(key);
  if (source?.viewType !== "standoff-editor-block") return false;
  const nodes = Object.values(editor.projections.get(source.viewId)!.state.nodes);
  const parentOf = (key: NodeKey) => nodes.find(n => n.children.includes(key) || Object.values(n.ownedRelations).includes(key));
  const parent = parentOf(key);
  if (!parent?.children.includes(key)) return false;
  let ancestor = parent;
  while (ancestor && ancestor.viewType !== "tab-block") ancestor = parentOf(ancestor.key)!;
  const row = ancestor && parentOf(ancestor.key);
  if (ancestor && row?.viewType !== "tab-row-block") return false;
  const saved = editor.selections.sets[key], primary = saved?.items.find(item => item.id === saved.primaryId);
  const caret = selection ?? editor.mounts.get(key)?.captureInlineSelection?.() ?? (primary ? { anchor: primary.anchor.boundary.index, head: primary.head.boundary.index } : undefined);
  let targetPlacement = source.placementKey;
  if (row) {
    const copy = encodeBlock(editor.repository.readState(), source.placementKey);
    const renew = (dto: ExistingBlockDto) => {
      dto.id = crypto.randomUUID();
      for (const field of ["standoffProperties", "blockProperties"]) {
        const properties = dto[field];
        if (Array.isArray(properties)) for (const property of properties) if (property && typeof property === "object" && property.id) property.id = crypto.randomUUID();
      }
      dto.children?.forEach(renew);
      for (const value of Object.values(dto.relation ?? {})) if (value && typeof value === "object" && "type" in value) renew(value as ExistingBlockDto);
    };
    renew(copy);
    editor.commands.transaction("Append text tab", () => {
      for (const tabKey of row.children) {
        const tab = editor.node(tabKey)!;
        const metadata = JSON.parse(JSON.stringify(tab.payload.metadata ?? {}));
        editor.commands.setPayloadField(tabKey, "metadata", { ...metadata, active: false }, "Activate text tab");
      }
      const placement = editor.commands.insert(tabPanel(String(row.children.length + 1),[copy]), { kind: "at", parentKey: row.key, index: row.children.length });
      targetPlacement = editor.commands.childrenOf(placement)[0];
    });
  } else {
    editor.commands.transaction("Convert text Block to tab", () => {
      const placement = editor.commands.insert(prepareTabs([{label:'1',content:[]}]), { kind: "before", anchorKey: key });
      const tab = editor.commands.childrenOf(placement)[0];
      editor.commands.move(key, { kind: "at", parentKey: tab, index: 0 });
    });
  }
  queueMicrotask(() => {
    const target = editor.nodeForPlacementInView(targetPlacement, source.viewId);
    if (!target) return;
    editor.focus.request(target.key, { reason: "create-text-tab", caret: "start" });
    if (!row && caret) editor.mounts.get(target.key)?.restoreInlineSelection?.(caret);
  });
  return true;
}
