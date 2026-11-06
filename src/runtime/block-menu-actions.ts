import { tabOrientationMenu } from './tab-orientation';
import { tabOrientation } from '../block-tree/tab-orientation';
import { tableMenuItems } from './table-menu';
import { sourcePayload, sourceType } from '../interchange/source-block';
import type { BlockNode, ExistingBlockDto, NodeKey } from "../block-tree/types";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { unwrap as unwrapStore } from "solid-js/store";
import { createTextTab } from "./text-tabs";
import { backgroundImages, defaultBackgroundUrls, isBackgroundType, mediaUrl, youtubeId, type BackgroundType } from "../rendering/backgrounds";
import { stickyNoteDto } from "./sticky-notes";
import { exportDocument } from './export-document';
import { standoffCodeDto } from './standoff-code';

import type { BlockMenuItem } from "./block-menu-types";
export type { BlockMenuItem } from "./block-menu-types";

const text = (): ExistingBlockDto => ({ id: crypto.randomUUID(), type: "standoff-editor-block", text: "", standoffProperties: [], children: [] });
const dto = (type: string, children: ExistingBlockDto[] = [], metadata: Record<string, unknown> = {}): ExistingBlockDto => ({ id: crypto.randomUUID(), type, metadata, children });
const metadata = (node?: BlockNode) => unwrapStore((node?.payload.metadata ?? {}) as Record<string, unknown>);

export function blockMenuItems(editor: ReactiveEditor, key: NodeKey): BlockMenuItem[] {
  const node = editor.node(key);
  if (!node) return [];
  const ancestors = editor.blockQueries.ancestors(key);
  const ancestor = (...types: string[]) => ancestors.find(item => types.includes(item.viewType));
  const parent = (key: NodeKey) => editor.blockQueries.ancestors(key)[1];
  const root = editor.projections.get(node.viewId)!.state.rootKey;
  const find = (placement: string) => editor.nodeForPlacementInView(placement, node.viewId)!;
  const command = (id: string, label: string): BlockMenuItem => ({ label,
    disabled: !editor.commandRegistry.canExecute(id, { targetKey: key, args: undefined }),
    run: () => editor.commandRegistry.execute(id, { targetKey: key, args: undefined }),
  });
  const editMetadata = (target: NodeKey, patch: Record<string, unknown>, label: string) => editor.commands.setPayloadField(target, "metadata", { ...metadata(editor.node(target)), ...patch }, label);
  const focus = (target: NodeKey) => {
    const descend = (key: NodeKey): NodeKey => editor.node(key)?.children[0] ? descend(editor.node(key)!.children[0]) : key;
    editor.focus.request(descend(target), { reason: "context-menu", caret: "start" });
  };
  const add = (value: ExistingBlockDto) => {
    const placement = editor.commands.insert(value, key === root || node.viewType === "document-block" ? { kind: "at", parentKey: key, index: node.children.length } : { kind: "after", anchorKey: key });
    focus(find(placement).key);
  };
  const remove = (target: NodeKey) => {
    if (target === root) throw new Error("The root Block cannot be deleted.");
    target=editor.surfaces.wholeBlockKey(target);
    if (!editor.surfaces.confirmDelete([target])) return;
    const fallback = editor.focusFallback(target);
    editor.commands.remove(target); editor.focus.clearRemoved(target);
    if (fallback) focus(fallback);
  };
  const input = (label: string, submit: (value: string) => void, value = ""): BlockMenuItem => ({ label, input: { label, value, submit } });
  const unavailable = (label: string, reason: string): BlockMenuItem => ({ label, disabled: true, reason });
  const move = (target: BlockNode, direction: -1 | 1) => {
    const row = parent(target.key);
    const next = row?.children[row.children.indexOf(target.key) + direction];
    if (next) editor.commands.move(target.key, { kind: direction < 0 ? "before" : "after", anchorKey: next });
  };
  const moveItem = (target: BlockNode, direction: -1 | 1, label: string): BlockMenuItem => ({ label,
    disabled: !parent(target.key)?.children[parent(target.key)!.children.indexOf(target.key) + direction], run: () => move(target, direction),
  });
  const unwrap = (target: NodeKey) => {
    if (target === root) throw new Error("The root Block cannot be unwrapped.");
    editor.commands.unwrap(target);
  };
  const flatten = (target: BlockNode, types: string[]) => editor.commands.transaction("Destructure Blocks", () => {
    const visit = (key: NodeKey) => { const current = editor.node(key); if (!current) return; [...current.children].forEach(visit); if (types.includes(current.viewType) && key !== root) unwrap(key); };
    visit(target.key);
  });
  const grid = (rows: number, columns: number, emptyFirst = false) => dto("grid-block", Array.from({ length: rows }, (_, row) => dto("grid-row-block", Array.from({ length: columns }, (_, column) => dto("grid-cell-block", emptyFirst && !row && !column ? [] : [text()])))));
  const convert = (value: ExistingBlockDto, depth: number) => {
    editor.commands.structuralTransaction("Convert Block", () => {
    let target = editor.commands.insert(value, { kind: "before", anchorKey: key });
    for (let i = 0; i < depth; i++) target = editor.commands.childrenOf(target)[0];
    editor.commands.move(key, { kind: "at", parentKey: target, index: 0 });
    });
    focus(key);
  };
  const mediaInput = (label: string, type: string) => input(label, (url) => {
    if (type === "youtube-video-block" ? !youtubeId(url) : !mediaUrl(url)) throw new Error("Enter a valid media URL (YouTube videos also accept a video ID).");
    add(dto(type, [], { url }));
  });
  const historyEntry = editor.features.blockHistory
    ? command("history.open", "History…")
    : unavailable("History…", "Block history is disabled by configuration.");
  const history = [command("history.undo", "Undo"), command("history.redo", "Redo")];
  const files = [command("document.open", "Open…"), command("document.save", "Save"), command("document.saveAs", "Save as…")];

  if (isBackgroundType(node.viewType)) {
    const change = (type: BackgroundType, url?: string) => {
      if (type === "youtube-video-background-block" ? !youtubeId(url) : type !== "canvas-background-block" && !mediaUrl(url)) throw new Error("Enter a valid media URL (or a YouTube video ID).");
      editor.commands.setBackground(key, { type, metadata: { ...metadata(editor.node(key)), url, paused: false, muted: true } });
    };
    const backgrounds: BlockMenuItem[] = [
      { label: "Image", children: [...backgroundImages.map(image => ({ label: image.label, run: () => change("image-background-block", image.url) })), input("Image URL…", value => change("image-background-block", value), node.viewType === "image-background-block" ? String(metadata(node).url ?? "") : "")] },
      { label: "Video", children: [{ label: "Rain", run: () => change("video-background-block", defaultBackgroundUrls["video-background-block"]) }, input("Video URL…", value => change("video-background-block", value), node.viewType === "video-background-block" ? String(metadata(node).url ?? "") : "")] },
      { label: "YouTube", children: [{ label: "Scottish Mountain Stream", run: () => change("youtube-video-background-block", defaultBackgroundUrls["youtube-video-background-block"]) }, input("YouTube URL or ID…", value => change("youtube-video-background-block", value), node.viewType === "youtube-video-background-block" ? String(metadata(node).url ?? "") : "")] },
      { label: "WebGL", children: [{ label: "Colour Cycling", run: () => change("canvas-background-block") }] },
    ];
    if (["video-background-block", "youtube-video-background-block"].includes(node.viewType)) {
      backgrounds.push({ label: metadata(node).paused ? "Play background" : "Pause background", run: () => editMetadata(key, { paused: !metadata(node).paused }, "Background playback") });
      backgrounds.push({ label: metadata(node).muted === false ? "Mute background" : "Enable background sound", run: () => editMetadata(key, { muted: metadata(node).muted === false }, "Background sound") });
    }
    return [historyEntry, command("sticky.createFloating", "New Sticky Note"), { label: "Background", children: backgrounds }, { label: "Document", children: files }, ...history];
  }

  const items: BlockMenuItem[] = [...(editor.mounts.get(key)?.contextActions?.() ?? []), historyEntry];
  items.push(command('markdown.toggleInput', `Markdown Input Transformation: ${editor.markdownInput.enabled() ? 'On' : 'Off'}`));
  items.push(...tabOrientationMenu(editor, ancestor("tab-row-block", "document-tab-row-block")?.key));
  if (editor.features.tableLayouts) items.push({ label: 'Tables and columns', loadChildren: () => tableMenuItems(editor, key) });
  if (editor.features.thesis) items.push(command("thesis.createProposition", "Create Proposition…"));
  if (node.viewType === 'standoff-editor-block' && editor.features.mutableClipboard && editor.features.markdownClipboard) {
    items.push({ label: 'Paste as Markdown (Ctrl/Cmd+Shift+V)', run: () => editor.clipboard.pasteMarkdown(key) });
  }
  if (node.viewType === 'standoff-editor-block' && editor.features.mutableClipboard) {
    items.push({ label: 'Paste as plain text', run: () => editor.clipboard.pasteMarkdown(key, true) });
  }
  if (node.viewType === 'standoff-editor-block' && editor.features.documentInterchange) {
    items.push({label:'Insert file…',run:()=>editor.interchange.pickInsert(key)},
      {label:'Convert to Mutable Ink',children:[{label:'From Markdown',run:()=>{void editor.interchange.convert(key,'markdown');}},{label:'From HTML',run:()=>{void editor.interchange.convert(key,'html');}}]},
      {label:'Copy as',children:[{label:'HTML',run:()=>{void editor.interchange.copyAs(key,'html');}},{label:'Markdown',run:()=>{void editor.interchange.copyAs(key,'markdown');}}]});
  }
  const doc = ancestor("document-block", "left-margin-block", "right-margin-block");
  if(doc&&editor.features.documentInterchange)items.push(input('Inspect / Import linked resource…',value=>{void editor.interchange.inspectLinkedResource(key,value);}));
  if (doc) {
    const document = ancestor('document-block');
    if (document) items.push({ label: 'Export Document', run: () => {
      const current = editor.node(document.key);
      if (!current) throw new Error('The Document is no longer available.');
      return exportDocument(editor, String(metadata(current).documentId ?? current.payload.id ?? ''), {viewId: current.viewId, current: () => !!editor.node(document.key)});
    } });
    if(editor.features.documentInterchange)items.push({label:"Embed source file…",run:()=>editor.interchange.pickEmbed(key)},{label:"Link to source file…",run:()=>editor.interchange.pickEmbed(key,true)});
    items.push(command("sticky.createFloating", "New Sticky Note"));
    items.push({ label: "Add Block", children: [
      { label: "Text", run: () => add(text()) }, { label: "Code", run: () => add({ ...dto("code-mirror-block"), text: "" }) },
      ...(editor.features.standoffCodeHighlighting ? [{ label: 'Standoff code', children: ['javascript', 'typescript', 'markdown'].map(language => ({ label: language === 'javascript' ? 'JavaScript' : language === 'typescript' ? 'TypeScript' : 'Markdown', run: () => add(standoffCodeDto(language)) })) }] : []),
      ...(editor.features.documentInterchange ? (['markdown','html'] as const).map(format=>({label:format==='markdown'?'Markdown source':'HTML source',run:()=>add({...dto(sourceType(format)),...sourcePayload(format)})})) : []),
      ...editor.featureActions.list("add-block-menu").map(item => command(item.command, item.label)),
      { label: "Insert Sticky Note Here", run: () => add(stickyNoteDto()) },
      mediaInput("Image URL…", "image-block"), mediaInput("YouTube video URL…", "youtube-video-block"),
      { label: "Canvas", run: () => add(dto("canvas-block")) },
      { label: "Add Grid", children: [1, 2].flatMap(rows => [1, 2, 3].map(columns => ({ label: `${rows} × ${columns}`, run: () => add(grid(rows, columns)) }))) },
    ] });
    items.push({ label: "File", children: [...files, unavailable("Duplicate document", "Independent document-window sessions are not yet migrated; use Save as to make a stored copy."), unavailable("Rename document", "The original action is unimplemented; Save as creates a named copy.")] });
    if (key !== doc.key && key !== root && !node.viewType.endsWith("-row-block") && !node.viewType.endsWith("-cell-block")) {
      if (!ancestor("grid-block")) items.push({ label: "Convert to grid (1 × 2)", run: () => convert(grid(1, 2, true), 2) });
      if (!ancestor("tab-row-block")) items.push({ label: "Convert to tab", run: () => {
        if (node.viewType === "standoff-editor-block") createTextTab(editor, key);
        else convert(dto("tab-row-block", [dto("tab-block", [], { name: "Tab 1", active: true })]), 1);
      } });
      if (!ancestor("indented-list-block")) items.push({ label: "Convert to list", run: () => convert(dto("indented-list-block"), 0) });
      items.push(unavailable("Convert to pocket", "This action is a no-op in the original source; existing pocket controls are available."));
    }
    const containsPage = (key: NodeKey): boolean => {
      const current = editor.node(key);
      return !!current && (["page-block", "document-tab-row-block"].includes(current.viewType)
        || current.children.some(containsPage));
    };
    const canConvertDocumentToPage = () => !!document && !!editor.node(document.key)
      && !editor.blockQueries.ancestors(document.key).some(item => item.viewType === "page-block")
      && !containsPage(document.key);
    if (document && canConvertDocumentToPage()) items.push({ label: "Convert to page", run: () => {
      // Page conversion is document-wide, including when invoked inside a grid or margin.
      // Check again because the menu may have been opened before another conversion.
      if (!canConvertDocumentToPage()) return;
      editor.commands.transaction("Convert Document to Page", () => {
        const children = editor.commands.childrenOf(document.key);
        const row = editor.commands.insert(dto("document-tab-row-block", [dto("document-tab-block", [dto("page-block")], { name: "Page 1", active: true })]), { kind: "at", parentKey: document.key, index: 0 });
        const tab = editor.commands.childrenOf(row)[0];
        const page = editor.commands.childrenOf(tab)[0];
        children.forEach((child, index) => editor.commands.move(child, { kind: "at", parentKey: page, index }));
      });
      const target = editor.nodeForPlacementInView(node.placementKey, node.viewId);
      if (target) focus(target.key);
    } });
    if (node.viewType === "standoff-editor-block") items.push({ label: "To tab / add tab", run: () => { createTextTab(editor, key); } });
    for (const [label, rowType, tabType] of [["Tabs", "tab-row-block", "tab-block"], ["Pages", "document-tab-row-block", "document-tab-block"], ["Tags", "sticky-tab-row-block", "sticky-tab-block"]]) {
      const row = ancestor(rowType) ?? (label === "Tags" ? doc.children.map(key => editor.node(key)).find(item => item?.viewType === rowType) : undefined);
      const tab = ancestor(tabType);
      if (!row && label !== "Tags") continue;
      const addTab = () => {
        let placement!: string;
        editor.commands.transaction(`Add ${label}`, () => {
          const owner = row?.key ?? editor.commands.insert(dto(rowType), { kind: "at", parentKey: doc.key, index: doc.children.length });
          row?.children.forEach(key => editMetadata(key, { active: false }, "Activate tab"));
          const length = editor.commands.childrenOf(owner).length;
          // PageView reserves the left/right gutters around its main-text children.
          // A bare TextBlock under the tab bypasses that layout and page scrolling.
          const content = label === "Pages" ? dto("page-block", [text()]) : text();
          placement = editor.commands.insert(dto(tabType, [content], { name: `${label === "Pages" ? "Page" : "Tab"} ${length + 1}`, text: `Sticky tag ${length + 1}`, active: true }), { kind: "at", parentKey: owner, index: length });
        });
        focus(find(placement).key);
      };
      const children: BlockMenuItem[] = [{ label: label === "Pages" ? "Add page" : label === "Tags" ? "Add tag" : "Add tab", run: addTab }];
      if (tab) children.push(input("Rename…", value => editMetadata(tab.key, { name: value, ...(label === "Tags" ? { text: value } : {}) }, `Rename ${label}`), String(metadata(tab).name ?? metadata(tab).text ?? "")),
        moveItem(tab, -1, label !== "Tags" && tabOrientation(row?.payload.metadata, editor.features.verticalTabs) === "vertical" ? "Move up" : "Move left"), moveItem(tab, 1, label !== "Tags" && tabOrientation(row?.payload.metadata, editor.features.verticalTabs) === "vertical" ? "Move down" : "Move right"),
        unavailable("Extract", "Extracting a copy into an independent document window awaits multi-window sessions."),
        { label: "Delete", run: () => editor.commands.transaction(`Delete ${label}`, () => {
          const siblings = [...editor.node(row!.key)!.children].filter(key => key !== tab.key);
          editor.commands.remove(tab.key);
          if (siblings[0]) { editMetadata(siblings[0], { active: true }, "Activate tab"); focus(siblings[0]); }
          else { editor.commands.remove(row!.key); focus(doc.key); }
        }) });
      if (row && label !== "Tags") children.push({ label: "Destructure", run: () => flatten(row, [rowType, tabType]) });
      if (label === "Tabs") children.push(unavailable("Merge tabs", "The original menu incorrectly calls grid merging; tab merge semantics are not yet qualified."));
      items.push({ label, children });
    }
    const gridNode = ancestor("grid-block");
    const cell = ancestor("grid-cell-block");
    const row = ancestor("grid-row-block");
    if (gridNode) {
      const children: BlockMenuItem[] = [{ label: "Destructure grid", run: () => flatten(gridNode, ["grid-block", "grid-row-block", "grid-cell-block"]) }];
      if (row) children.push({ label: "Add row", run: () => { editor.commands.insert(dto("grid-row-block", row.children.map(() => dto("grid-cell-block", [text()]))), { kind: "after", anchorKey: row.key }); } });
      if (cell && row) {
        for (const direction of [-1, 1] as const) {
          const sibling = row.children[row.children.indexOf(cell.key) + direction];
          children.push(moveItem(cell, direction, `Move cell ${direction < 0 ? "left" : "right"}`), { label: `Merge cell ${direction < 0 ? "left" : "right"}`, disabled: !sibling, run: () => editor.commands.transaction("Merge grid cells", () => {
            [...cell.children].forEach(key => editor.commands.move(key, { kind: "at", parentKey: sibling, index: editor.commands.childrenOf(sibling).length }));
            editor.commands.remove(cell.key); editMetadata(sibling, { width: "auto" }, "Merge grid cells"); focus(sibling);
          }) });
          const otherRow = editor.node(gridNode.children[gridNode.children.indexOf(row.key) + direction]);
          const index = row.children.indexOf(cell.key);
          const otherCell = otherRow?.children[index];
          children.push({ label: `Move cell ${direction < 0 ? "up" : "down"}`, disabled: !otherCell, run: () => editor.commands.transaction("Move grid cell", () => {
            editor.commands.move(cell.key, { kind: "before", anchorKey: otherCell! });
            editor.commands.move(otherCell!, { kind: "at", parentKey: row.key, index });
          }) });
        }
      }
      items.push({ label: "Grids", children });
    }
    const list = ancestor("indented-list-block");
    if (list) items.push({ label: "List", children: [{ label: "Destructure list", run: () => flatten(list, ["indented-list-block"]) }] });
    const pocket = ancestor("container-block");
    if (pocket && pocket.key !== root) items.push({ label: "Pockets", children: [input("Height (px)…", value => {
      const height = Number(value); if (!Number.isFinite(height) || height < 1 || height > 10000) throw new Error("Enter a height between 1 and 10000 pixels.");
      editMetadata(pocket.key, { height }, "Resize pocket");
    }, String(metadata(pocket).height ?? "")), { label: "Explode", run: () => unwrap(pocket.key) }, { label: "Delete", run: () => remove(pocket.key) }] });
    const book = ancestor("book-block");
    if (book) items.push({ label: "Book", children: [{ label: "Add blank pages", run: () => editor.commands.transaction("Add blank pages", () => {
      for (const page of ["Left", "Right"]) editor.commands.insert(dto("fixed-size-page-block", [text()], { page }), { kind: "at", parentKey: book.key, index: editor.commands.childrenOf(book.key).length });
    }) }] });
    if (key !== root && key !== doc.key) items.push({ label: "Delete Block", run: () => remove(key) });
  }
  const win = ancestor("document-window-block", "window-block") ?? (editor.node(root)?.viewType === "document-block" ? editor.node(root) : doc);
  if (win) items.push({ label: "Themes", children: ["Paper", "Glass"].map(label => ({ label, run: () => {
    const current = unwrapStore((editor.node(win.key)?.payload.blockProperties ?? []) as Array<Record<string, unknown>>);
    editor.commands.setPayloadField(win.key, "blockProperties", [...current.filter(item => !["block/theme/glass", "block/theme/paper"].includes(String(item.type))), { type: `block/theme/${label.toLowerCase()}` }], "Change window theme");
  } })) });
  items.push({ label: "Select", children: ancestors.map(item => ({ label: `${item.viewType}${metadata(item).name ? ` — ${metadata(item).name}` : ""}`, run: () => { editor.focus.request(item.key, { reason: "choose-ancestor" }); } })) }, ...history);
  return items;
}
