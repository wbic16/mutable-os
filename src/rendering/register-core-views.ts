import { registerTabOrientationCommands } from '../runtime/tab-orientation';
import { registerTableCommands } from '../runtime/table-commands';
import { ReversibleSurfaceView, ResourceInformationView } from './reversible-surface';
import { surfaceCommands } from '../runtime/block-surfaces';
import {WebResourceView} from './web-resource-view';
import {WEB_BLOCK} from '../web-resources/model';
import {AcademicResourceView} from './academic-resource-view';
import {ACADEMIC_BLOCK} from '../academic/model';
import {StructuredResourceView} from './structured-resource-view';
import {STRUCTURED_BLOCK} from '../structured/model';
import {PdfBlockView} from './pdf-block-view';
import {IIIFBlockView} from './iiif-block-view';
import {WebArticleBlockView} from './web-article-block-view';
import {CitationBlockView} from './citation-block-view';
import { VideoBlockView } from './video-block-view';
import { SourceBlockView } from "./source-block-view";
import { sourceTypes } from "../interchange/source-block";
import { WorkspaceObjectBankView } from "./workspace-object-bank";
import { OpaqueClipboardView } from './opaque-clipboard-view';
import type { ReactiveEditor } from "../reactive-editor/editor";
import { ContainerBlockView } from "./container-block-view";
import {
  CheckboxView,
  CanvasPreviewView,
  CodeBlockView,
  FlippableSurfaceView,
  GenericContainerView,
  HorizontalLineView,
  IframeView,
  ImageView,
  ListView,
  PageView,
  StableBackgroundView,
  StickyTabRowView,
  TabPanelView,
  TabRowView,
  TableCellView,
  TableRowView,
  TableView,
  WindowView,
  YouTubeView,
} from "./core-block-views";
import { PlainTextBlockView } from "./plain-text-block-view";
import { StandoffEditorView } from "./standoff-editor-view";
import { StandoffCodeView } from './standoff-code-view';
import { UnknownBlockView } from "./unknown-block-view";
import { DocumentReferenceView } from "./document-reference-view";
import { StickyNoteBlockView } from "./sticky-note";
import { registerTextSuperpositionCommands } from "../runtime/text-superposition";

function many(editor: ReactiveEditor, types: string[], view: any, capabilities: string[]) {
  for (const type of types) editor.registry.register({ type, view, capabilities });
}

export function registerCoreViews(editor: ReactiveEditor, documentView = ContainerBlockView): void {
  editor.registry.register({ type: 'mutable/opaque-block', view: OpaqueClipboardView, capabilities: ['selectable'] });
  if (editor.features.documentInterchange) many(editor, ["mutable/video-block"], VideoBlockView, ["media", "opaque-widget", "selectable"]);
  if (editor.features.resourceUrlPaste) many(editor, ["youtube-player-block", "vimeo-player-block"], VideoBlockView, ["media", "opaque-widget", "selectable"]);
  if(editor.features.webResourceViewers)many(editor,[WEB_BLOCK],WebResourceView,['selectable','opaque-widget']);
  if(editor.features.deterministicAcademicResources)many(editor,[ACADEMIC_BLOCK],AcademicResourceView,['selectable','opaque-widget']);
  if(editor.features.structuredResources)many(editor,[STRUCTURED_BLOCK],StructuredResourceView,['selectable','opaque-widget']);
  many(editor, ['mutable/pdf-document-block'], PdfBlockView, ['selectable','opaque-widget']);
  many(editor, ['mutable/iiif-manifest-block','mutable/iiif-image-block'], IIIFBlockView, ['selectable','opaque-widget']);
  many(editor, ['mutable/web-article-block'], WebArticleBlockView, ['selectable','opaque-widget']);
  many(editor, ['mutable/citation-block'], CitationBlockView, ['selectable','opaque-widget']);
  many(editor, ['resource-information-block'], ResourceInformationView, ['container','selectable']);
  if(editor.features.reversibleBlocks)for(const action of surfaceCommands)editor.commandRegistry.register({id:action.id,label:action.name,canExecute:({targetKey})=>editor.surfaces.can(action.id,targetKey),execute:({targetKey,args})=>editor.surfaces.run(action.id,targetKey,(args as any)?.invocation)});
  registerTextSuperpositionCommands(editor);
  registerTableCommands(editor);
  registerTabOrientationCommands(editor);
  editor.registry.register({ type: "workspace-object-bank-block", view: WorkspaceObjectBankView, capabilities: ["container"] });
  editor.registry.register({ type: "document-block", aliases: ["main-list-block", "membrane-block"], view: documentView, capabilities: ["container", "selectable"] });
  if (editor.features.documentInterchange) many(editor, [...sourceTypes], SourceBlockView, ["native-text", "container", "selectable"]);
  editor.registry.register({ type: "plain-text-block", view: PlainTextBlockView, capabilities: ["native-text", "container", "selectable"] });
  editor.registry.register({ type: "standoff-editor-block", view: StandoffEditorView, capabilities: ["inline-editor", "container", "selectable", "annotations"] });
  editor.registry.register({ type: 'standoff-code-block', view: StandoffCodeView, capabilities: ['container', 'selectable'] });
  editor.registry.register({ type: 'horizontal-line-block', view: HorizontalLineView, capabilities: ['container', 'selectable'] });
  editor.registry.register({ type: "checkbox-block", view: CheckboxView, capabilities: ["control", "container", "selectable"] });
  editor.registry.register({ type: "sticky-note-block", view: StickyNoteBlockView, capabilities: ["container", "selectable"] });
  editor.registry.register({ type: "code-mirror-block", view: CodeBlockView, capabilities: ["native-text", "container", "opaque-widget"] });
  editor.registry.register({ type: "cyclic-reference", view: UnknownBlockView, capabilities: ["reference-placeholder"] });
  editor.registry.register({ type: "document-reference-block", view: DocumentReferenceView, capabilities: ["reference-placeholder", "selectable"] });

  many(editor, ["universe-block", "workspace-block", "root-block", "container-block", "book-block", "fixed-size-page-block", "side-block", "embed-document-block", "entities-list-block", "context-menu-block", "control-panel-block", "monitor-block", "left-margin-block", "right-margin-block", "error-block", "unknown-block"], GenericContainerView, ["container", "selectable"]);
  many(editor, ["surface-block"], editor.features.reversibleBlocks ? ReversibleSurfaceView : FlippableSurfaceView, ["container", "sides", "selectable"]);
  many(editor, ["canvas-block"], CanvasPreviewView, ["container", "canvas-preview", "selectable"]);
  many(editor, ["page-block"], PageView, ["container", "selectable"]);
  many(editor, ["indented-list-block"], ListView, ["container", "selectable"]);
  many(editor, ["table-block", "grid-block"], TableView, ["container", "grid"]);
  many(editor, ["table-row-block", "grid-row-block"], TableRowView, ["container", "grid-row"]);
  many(editor, ["table-cell-block", "grid-cell-block"], TableCellView, ["container", "grid-cell"]);
  many(editor, ["tab-row-block", "document-tab-row-block"], TabRowView, ["container", "tabs"]);
  many(editor, ["sticky-tab-row-block"], StickyTabRowView, ["container", "sticky-tabs"]);
  many(editor, ["tab-block", "document-tab-block", "sticky-tab-block"], TabPanelView, ["container", "tab"]);
  many(editor, ["image-block"], ImageView, ["media", "container"]);
  many(editor, ["iframe-block", "html-editor-block", "html-block", "pdf-block"], IframeView, ["media", "opaque-widget"]);
  many(editor, ["youtube-video-block"], YouTubeView, ["media", "opaque-widget"]);
  many(editor, ["window-block", "document-window-block"], WindowView, ["window", "container", "selectable"]);
  many(editor, ["image-background-block", "video-background-block", "youtube-video-background-block", "canvas-background-block"], StableBackgroundView, ["background", "surface", "container"]);

  editor.commandRegistry.register({ id: "sticky.createFloating", label: "New Sticky Note", canExecute: () => editor.stickyNotes.canCreate(), execute: () => { editor.stickyNotes.create(); } });


  editor.commandRegistry.register({ id: "history.open", label: "Block history", canExecute: ({ targetKey }) => editor.blockHistory.canOpen(targetKey), execute: ({ targetKey }) => editor.blockHistory.open(targetKey) });

  editor.commandRegistry.register({
    id: "history.undo",
    label: "Undo",
    canExecute: () => editor.repository.canUndo(),
    execute: () => editor.repository.undo(),
  });
  editor.commandRegistry.register({
    id: "history.redo",
    label: "Redo",
    canExecute: () => editor.repository.canRedo(),
    execute: () => editor.repository.redo(),
  });
  editor.commandRegistry.register({
    id: "block.remove",
    label: "Remove Block",
    canExecute: ({ targetKey }) => targetKey !== editor.projections.values().next().value?.state.rootKey,
    execute: ({ targetKey }) => { const key=editor.surfaces.wholeBlockKey(targetKey); if(editor.surfaces.confirmDelete([key]))editor.commands.remove(key); },
  });
}
