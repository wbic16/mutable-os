import { openBlockContextMenu } from "../runtime/open-block-context-menu";
import type { MutableClipboard } from '../runtime/mutable-clipboard';
import type { NodeKey, PlacementKey, ViewId } from "../block-tree/types";
import type { TreeCommands } from "../block-tree/commands";
import type { FocusService } from "../runtime/focus";
import type { MountHandle, MountRegistry, NativeTextSelection } from "../runtime/mounts";
import type { SelectionService } from "../runtime/selections";
import type { BlockNode } from "../block-tree/types";
import type { MultiSelectionEditor } from "./multi-selection-editor";
import type { OverlayService } from "../runtime/overlays";
import { graphemeBoundaries } from "./graphemes";
import type { BindingRegistry } from "./bindings";
import type { BlockSelectionService } from "../runtime/block-selection";

function textareaSelection(target: HTMLTextAreaElement): NativeTextSelection {
  return {
    start: target.selectionStart,
    end: target.selectionEnd,
    direction: target.selectionDirection,
  };
}

/** Shared native caret feed; consumers need not be annotation renderers. */
export interface CaretNotifications {
  setCaret(nodeKey?: string, caret?: number): void;
  setComposing?(value: boolean): void;
}

export interface CompletionInput {
  input?(key:string):boolean;
  beforeSave?():boolean;
  composition?(key:string,phase:'start'|'end',text:string):boolean;
  pointer?(event:PointerEvent):boolean;
  clipboard?(event:ClipboardEvent):boolean;
  intercept?(key:string,start:number,end:number,text:string,inputType:string):boolean;
  before?(key:string,start:number,end:number,text:string,inputType:string):boolean;
  edited(key: string, caret: number, inputType: string): void;
  key(event: KeyboardEvent): boolean;
  cancel(keepLiteral?:boolean): void;
}

export class InputGateway {
  private installed = false;

  constructor(
    private readonly document: Document,
    private readonly mounts: MountRegistry,
    private readonly focus: FocusService,
    private readonly commands: TreeCommands,
    private readonly multiSelections: MultiSelectionEditor,
    private readonly selections: SelectionService,
    private readonly overlays: OverlayService,
    private readonly node: (nodeKey: NodeKey) => BlockNode | undefined,
    private readonly nodeForPlacement: (placementKey: PlacementKey, viewId: ViewId) => BlockNode | undefined,
    private readonly adjacentSibling: (nodeKey: NodeKey, direction: -1 | 1) => BlockNode | undefined,
    private readonly adjacentEditable: (nodeKey: NodeKey, direction: -1 | 1) => BlockNode | undefined,
    private readonly focusFallback: (nodeKey: NodeKey) => NodeKey | undefined,
    private readonly bindings: BindingRegistry,
    private readonly createTextTab: (key: NodeKey) => boolean,
    private readonly changeTextList: (key: NodeKey, outdent: boolean) => boolean,
    private readonly listInput: { prefix(key: NodeKey, caret: number): boolean; exitEmpty(key: NodeKey): boolean; task?(key: NodeKey, start: number, end: number, text: string): boolean; cancelTask?(): void; taskSelection?(key?: string, caret?: number): void; taskEnter?(key: string, start: number, end: number): boolean; toggleTask?(key: string): boolean },
    private readonly blockSelection: BlockSelectionService,
    private readonly history: (direction: "undo" | "redo") => void,
    private readonly runCommand: (id: string, key: NodeKey) => boolean,
    private readonly caretEvents?: CaretNotifications,
    private readonly clipboard?: MutableClipboard,
    private readonly completion?: () => CompletionInput | undefined,
    private readonly blockDeleteTarget?: (key:NodeKey)=>NodeKey|undefined,
    private readonly markdown?: { typed(key: string, start: number, end: number, text: string): number | undefined; cancel(): void },
  ) {}

  install(): () => void {
    if (this.installed) return () => this.dispose();
    this.installed = true;
    this.document.addEventListener("input", this.onInput, true);
    this.document.addEventListener("beforeinput", this.onBeforeInput, true);
    this.document.addEventListener("focusin", this.onFocusIn, true);
    this.document.addEventListener("focusout", this.onFocusOut, true);
    this.document.addEventListener("keydown", this.onKeyDown, true);
    this.document.addEventListener("compositionstart", this.onCompositionStart, true);
    this.document.addEventListener("compositionend", this.onCompositionEnd, true);
    this.document.addEventListener("selectionchange", this.onSelectionChange, true);
    this.document.addEventListener("pointerdown", this.onPointerDown, true);
    this.document.addEventListener("copy", this.onCopy, true);
    this.document.addEventListener("cut", this.onCut, true);
    this.document.addEventListener("paste", this.onPaste, true);
    this.document.addEventListener("contextmenu", this.onContextMenu, true);
    this.document.addEventListener("click", this.onControlClick, true);
    this.document.addEventListener("dblclick", this.onControlClick, true);
    this.document.addEventListener("speedy-input", this.onCustomInput, true);
    this.document.defaultView?.addEventListener("blur", this.onWindowBlur);
    this.document.defaultView?.addEventListener("focus", this.onWindowFocus);
    return () => this.dispose();
  }

  private onInput = (event: Event) => {
    const resolved = this.mounts.resolveEvent(event);
    if (!resolved) return;
    if (resolved.handle.composing) return;
    if(this.completion?.()?.input?.(resolved.nodeKey))return;
    if (resolved.handle.inputPolicy === "native-text" && event.target instanceof HTMLTextAreaElement) {
      this.recordNativeText(resolved.nodeKey, event.target);
      return;
    }
    if (resolved.handle.inputPolicy === "standoff" && resolved.handle.captureText) {
      this.reconcileStandoffText(resolved.nodeKey, resolved.handle);
    }
  };

  private openContextMenu(event: Event): void {
    if (event.defaultPrevented) return;
    const resolved = this.mounts.resolveEvent(event);
    const target = event.target instanceof Element ? event.target : undefined;
    if (!resolved || resolved.handle.composing || resolved.handle.inputPolicy === "opaque-widget" ||
      target?.closest('input, textarea, select, video, audio, iframe, [data-native-context-menu], [role="dialog"]')) return;
    const explicit = target?.closest<HTMLElement>("[data-context-target]")?.dataset.contextTarget;
    const key = explicit && this.node(explicit)?.viewId === this.node(resolved.nodeKey)?.viewId ? explicit : resolved.nodeKey;
    if (!this.node(key)) return;
    event.preventDefault(); event.stopPropagation();
    openBlockContextMenu(this.overlays, key, resolved.handle.root, event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : undefined);
  }

  private scopes(event: Event) {
    if (event.target instanceof Element && event.target.closest('[data-block-selection-handle], [data-block-selection-inspector], [data-candidate-exclusion], [data-table-controls]')) return [];
    const resolved = this.mounts.resolveEvent(event);
    if (!resolved || resolved.handle.composing || resolved.handle.inputPolicy === "opaque-widget" || (event.target instanceof Element && event.target.closest('[data-bindings-window], [role="dialog"]'))) return [];
    return resolved.handle.inputPolicy === "standoff" ? ["editor/standoff", "editor"] : ["editor"];
  }
  private onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1 && event.key !== "Shift") this.markdown?.cancel();
    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1 && event.key !== "Shift") this.listInput.cancelTask?.();
    this.clipboard?.key(event);
    if (this.completion?.()?.key(event)) { this.markdown?.cancel(); this.listInput.cancelTask?.(); return; }
    const target = event.target instanceof Element ? event.target : undefined;
    const resolved = this.mounts.resolveEvent(event);
    const field = target?.closest('input, textarea, select, [contenteditable="true"]');
    const editorField = field === resolved?.handle.focusElement && ["standoff", "native-text"].includes(resolved?.handle.inputPolicy ?? "");
    if (resolved && !resolved.handle.composing && resolved.handle.inputPolicy !== "opaque-widget" &&
      !target?.closest('[data-bindings-window], [role="dialog"], [data-native-context-menu]') && (!field || editorField)) {
      if (this.bindings.dispatch(event, ["document-history"], id => {
        if (id !== "history.undo" && id !== "history.redo") return false;
        this.history(id === "history.undo" ? "undo" : "redo");
        return true;
      })) return;
    }
    this.bindings.dispatch(event, this.scopes(event), id => this.runBinding(id, event));
  };
  private onContextMenu = (event: MouseEvent) => this.onControlClick(event);
  private onControlClick = (event: MouseEvent) => { this.bindings.dispatch(event, this.scopes(event), id => this.runBinding(id, event)); };
  private onCustomInput = (event: Event) => {
    if (!(event instanceof CustomEvent) || event.defaultPrevented) return;
    const { name, payload } = event.detail ?? {};
    // Dispatch on the target Block, preserving occurrence-local context.
    if (this.bindings.dispatchCustom(name, this.scopes(event), id => this.runBinding(id, event), payload)) { event.preventDefault(); event.stopPropagation(); }
  };

  private onBeforeInput = (event: InputEvent) => {
    const resolved = this.mounts.resolveEvent(event);
    if (!resolved || resolved.handle.inputPolicy !== "standoff" || resolved.handle.composing) return;
    const selection = resolved.handle.captureInlineSelection?.();
    const node = this.node(resolved.nodeKey);
    if (!selection || !node) return;
    let start = Math.min(selection.anchor, selection.head);
    let end = Math.max(selection.anchor, selection.head);
    let text: string | undefined;
    if (event.isComposing || !event.cancelable || event.inputType !== 'insertText' || start !== end || (this.selections.sets[resolved.nodeKey]?.items.length ?? 0) > 1) this.markdown?.cancel();
    if(this.completion?.()?.intercept?.(resolved.nodeKey,start,end,event.data??"",event.inputType)){
      this.markdown?.cancel(); this.listInput.cancelTask?.();
      if(event.cancelable)event.preventDefault();event.stopPropagation();return;
    }

    if (event.isComposing || event.inputType !== "insertText" || !event.cancelable) this.listInput.cancelTask?.();
    const selectionSet = this.selections.sets[resolved.nodeKey];
    if (
      selectionSet?.items.length > 1 &&
      (event.inputType === "insertText" ||
        event.inputType === "deleteContentBackward" ||
        event.inputType === "deleteContentForward")
    ) {
      const sourceText = node.inlineContent
        .map((cellKey) => this.node(cellKey)?.payload.text ?? "")
        .join("");
      const boundaries = graphemeBoundaries(sourceText);
      const replacements = selectionSet.items.map((item) => {
        let itemStart = Math.min(item.anchor.boundary.index, item.head.boundary.index);
        let itemEnd = Math.max(item.anchor.boundary.index, item.head.boundary.index);
        if (itemStart === itemEnd && event.inputType === "deleteContentBackward") {
          itemStart = boundaries.filter((boundary) => boundary < itemStart).at(-1) ?? 0;
        }
        if (itemStart === itemEnd && event.inputType === "deleteContentForward") {
          itemEnd = boundaries.find((boundary) => boundary > itemEnd) ?? node.inlineContent.length;
        }
        return {
          item,
          start: itemStart,
          end: itemEnd,
          text: event.inputType === "insertText" ? event.data ?? "" : "",
        };
      });
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      this.multiSelections.replace(resolved.nodeKey, replacements);
      return;
    }

    if (event.inputType === "insertText" || event.inputType === "insertCompositionText") {
      text = event.data ?? "";
    } else if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      this.insertStandoffParagraph(resolved.nodeKey, resolved.handle, node, start, end);
      return;
    } else if (event.inputType === "deleteContentBackward") {
      if (start === end && start > 0) {
        const textValue = node.inlineContent
          .map((cellKey) => this.node(cellKey)?.payload.text ?? "")
          .join("");
        start = graphemeBoundaries(textValue).filter((boundary) => boundary < start).at(-1) ?? 0;
      } else if (start === end && start === 0) {
        const previous = this.adjacentSibling(resolved.nodeKey, -1);
        if (previous) {
          if (event.cancelable) event.preventDefault();
          event.stopPropagation();
          if (node.inlineContent.length === 0) {
            this.focus.clearRemoved(resolved.nodeKey);
            this.commands.remove(resolved.nodeKey);
            queueMicrotask(() => this.focus.request(previous.key, { reason: "remove-empty", caret: "end" }));
            return;
          }
          if (previous.viewType !== "standoff-editor-block") {
            queueMicrotask(() => this.focus.request(previous.key, { reason: "backspace-boundary", caret: "end" }));
            return;
          }
          if (previous.inlineContent.length === 0) {
            this.commands.remove(previous.key);
            queueMicrotask(() => {
              this.focus.request(resolved.nodeKey, { reason: "remove-empty-previous" });
              resolved.handle.restoreInlineSelection?.({ anchor: 0, head: 0 });
            });
            return;
          }
          const joinIndex = previous.inlineContent.length;
          this.commands.joinStandoff(previous.key, resolved.nodeKey);
          queueMicrotask(() => {
            this.focus.request(previous.key, { reason: "join" });
            this.mounts.get(previous.key)?.restoreInlineSelection?.({ anchor: joinIndex, head: joinIndex });
          });
          return;
        }
      }
      text = "";
    } else if (event.inputType === "deleteContentForward") {
      if (start === end && end < node.inlineContent.length) {
        const textValue = node.inlineContent
          .map((cellKey) => this.node(cellKey)?.payload.text ?? "")
          .join("");
        end = graphemeBoundaries(textValue).find((boundary) => boundary > end) ?? node.inlineContent.length;
      } else if (start === end && end === node.inlineContent.length) {
        const next = this.adjacentSibling(resolved.nodeKey, 1);
        if (next) {
          if (event.cancelable) event.preventDefault();
          event.stopPropagation();
          if (next.viewType !== "standoff-editor-block") {
            queueMicrotask(() => this.focus.request(next.key, { reason: "delete-boundary", caret: "start" }));
            return;
          }
          const joinIndex = node.inlineContent.length;
          if (next.inlineContent.length === 0) this.commands.remove(next.key);
          else this.commands.joinStandoff(resolved.nodeKey, next.key);
          queueMicrotask(() => resolved.handle.restoreInlineSelection?.({ anchor: joinIndex, head: joinIndex }));
          return;
        }
      }
      text = "";
    } else {
      return;
    }

    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    if(this.completion?.()?.before?.(resolved.nodeKey,start,end,text,event.inputType)) { this.markdown?.cancel(); this.listInput.cancelTask?.(); return; }
    if (event.cancelable && !event.isComposing && event.inputType === "insertText" && this.listInput.task?.(resolved.nodeKey, start, end, text)) { this.markdown?.cancel(); return; }
    if (event.cancelable && !event.isComposing && event.inputType === 'insertText' && text === ' ' && start === end &&
      this.listInput.prefix(resolved.nodeKey, start)) { this.markdown?.cancel(); return; }
    this.commands.replaceInlineRange(resolved.nodeKey, start, end, text);
    let caret = start + [...text].length;
    this.selections.mapContentEdit(node.contentKey, start, end, [...text].length);
    if (event.cancelable && !event.isComposing && event.inputType === 'insertText') caret = this.markdown?.typed(resolved.nodeKey, start, end, text) ?? caret;
    this.selections.setPrimary(resolved.nodeKey, node.contentKey, node.viewId, caret);
    queueMicrotask(() => resolved.handle.restoreInlineSelection?.({ anchor: caret, head: caret }));
    this.completion?.()?.edited(resolved.nodeKey, caret, event.inputType);
  };

  private onFocusIn = (event: FocusEvent) => {
    if (this.bindings.pendingHint()) this.bindings.cancelChord();
    if (event.target instanceof Element && event.target.closest('[data-block-selection-handle], [data-block-selection-inspector], [data-table-controls]')) return;
    const resolved = this.mounts.resolveEvent(event);
    if (resolved) this.focus.adopt(resolved.nodeKey);
    this.refreshCaret();
  };

  private refreshCaret = () => {
    if (!this.caretEvents) return;
    const resolved = this.mounts.resolveElement(this.document.activeElement);
    const selection = resolved?.handle.inputPolicy === "standoff" ? resolved.handle.captureInlineSelection?.() : undefined;
    if (resolved && selection && selection.anchor === selection.head) this.caretEvents.setCaret(resolved.nodeKey,selection.head);
    else this.caretEvents.setCaret();
  };

  private onFocusOut = () => { this.markdown?.cancel(); this.listInput.cancelTask?.(); this.clipboard?.clearIntent(); this.caretEvents?.setComposing?.(false); this.caretEvents?.setCaret(); };

  private onCompositionStart = (event: CompositionEvent) => {
    this.markdown?.cancel();
    this.listInput.cancelTask?.();
    this.bindings.cancelChord();
    const resolved = this.mounts.resolveEvent(event);
    if (resolved && (resolved.handle.inputPolicy === "native-text" || resolved.handle.inputPolicy === "standoff")) {
      if(!this.completion?.()?.composition?.(resolved.nodeKey,'start',event.data??''))this.completion?.()?.cancel();
      resolved.handle.composing = true;
      this.caretEvents?.setComposing?.(true);
    }
  };

  private onCompositionEnd = (event: CompositionEvent) => {
    const resolved = this.mounts.resolveEvent(event);
    this.caretEvents?.setComposing?.(false);
    if (!resolved) return;
    resolved.handle.composing = false;
    if(this.completion?.()?.composition?.(resolved.nodeKey,'end',event.data??''))return;
    if (resolved.handle.inputPolicy === "native-text" && event.target instanceof HTMLTextAreaElement) {
      this.recordNativeText(resolved.nodeKey, event.target);
    } else if (resolved.handle.inputPolicy === "standoff" && resolved.handle.captureText) {
      this.reconcileStandoffText(resolved.nodeKey, resolved.handle);
    }
  };

  private onSelectionChange = () => {
    const selection = this.document.getSelection();
    const anchorElement =
      selection?.anchorNode instanceof Element
        ? selection.anchorNode
        : selection?.anchorNode?.parentNode instanceof Element
          ? selection.anchorNode.parentNode
          : null;
    const resolved = this.mounts.resolveElement(anchorElement);
    if (!resolved || resolved.handle.inputPolicy !== "standoff") { this.listInput.cancelTask?.(); this.caretEvents?.setCaret(); return; }
    const inline = resolved.handle.captureInlineSelection?.();
    this.listInput.taskSelection?.(resolved.nodeKey,
      inline?.anchor === inline?.head && this.document.activeElement === resolved.handle.focusElement ? inline?.head : undefined);
    if (inline && inline.anchor === inline.head && this.document.activeElement === resolved.handle.focusElement) {
      this.caretEvents?.setCaret(resolved.nodeKey, inline.head);
    } else this.caretEvents?.setCaret();
    const node = this.node(resolved.nodeKey);
    if (inline && node) {
      this.selections.setPrimary(
        resolved.nodeKey,
        node.contentKey,
        node.viewId,
        inline.anchor,
        inline.head,
      );
    }
  };

  private onPointerDown = (event: PointerEvent) => {
    this.markdown?.cancel();
    this.listInput.cancelTask?.();
    if (this.bindings.pendingHint()) this.bindings.cancelChord();
    const element = event.target instanceof Element ? event.target : undefined;
    if (element?.closest('[data-block-selection-handle], [data-block-selection-inspector], [data-table-controls]')) return;
    if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
      !element?.closest('button, input, textarea, select, [role="dialog"], [role="menu"], .document-style-bar, [data-cross-text-controls]')) {
      const resolved = this.mounts.resolveEvent(event);
      this.selections.clearExcept(resolved?.handle.inputPolicy === "standoff" ? resolved.nodeKey : undefined);
    }
    if (this.blockSelection.state.items.length && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
      !element?.closest('button, [role="dialog"], [role="menu"], .document-style-bar, [data-cross-text-controls]')) {
      const resolved = this.mounts.resolveEvent(event);
      if (resolved && !this.overlays.isOverlayKey(resolved.nodeKey)) this.blockSelection.clear();
    }
    if (this.bindings.matches("menu.open", new MouseEvent("click", { button: event.button, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey }))) {
      const target = event.target instanceof Element ? event.target : undefined;
      const resolved = this.mounts.resolveEvent(event);
      if (resolved && this.node(resolved.nodeKey) && !resolved.handle.composing && resolved.handle.inputPolicy !== "opaque-widget" &&
        !target?.closest('input, textarea, select, video, audio, iframe, [data-native-context-menu], [role="dialog"]')) event.preventDefault();
    }
    if (!this.overlays.overlays.length) return;
    const resolved = this.mounts.resolveEvent(event);
    if (resolved && this.overlays.isOverlayKey(resolved.nodeKey)) return;
    // Bulk mention review is nonmodal: document-side exclusion buttons, scrolling
    // and tab navigation belong to the same review session. Actual document edits
    // still invalidate the contributing panel through its before-change subscription.
    const top = this.overlays.overlays.at(-1);
    if (top?.allowDocumentInput) return;
    this.overlays.dismissTopWithoutRestoring();
  };

  private standoffClipboardContext(event: ClipboardEvent) {
    if (event.target instanceof Element && event.target.closest("[data-block-selection-handle], [data-block-selection-inspector]")) return undefined;
    const resolved = this.mounts.resolveEvent(event);
    if (!resolved || resolved.handle.inputPolicy !== "standoff") return undefined;
    const node = this.node(resolved.nodeKey);
    const set = this.selections.sets[resolved.nodeKey];
    if (!node || !set) return undefined;
    return { resolved, node, set };
  }

  private writeStandoffClipboard(event: ClipboardEvent): boolean {
    const context = this.standoffClipboardContext(event);
    if (!context || !event.clipboardData) return false;
    const ordered = [...context.set.items].sort((a, b) => {
      const ai = Math.min(a.anchor.boundary.index, a.head.boundary.index);
      const bi = Math.min(b.anchor.boundary.index, b.head.boundary.index);
      return ai - bi;
    });
    const fragments = ordered.map((item) => {
      const start = Math.min(item.anchor.boundary.index, item.head.boundary.index);
      const end = Math.max(item.anchor.boundary.index, item.head.boundary.index);
      return context.node.inlineContent.slice(start, end).map((cellKey) => {
        const cell = this.node(cellKey);
        return cell?.viewType === "image-cell"
          ? { kind: "image", ...cell.payload }
          : { kind: "text", text: String(cell?.payload.text ?? "") };
      });
    });
    const plain = fragments
      .map((fragment) =>
        fragment
          .map((item) =>
            item.kind === "text"
              ? String(item.text ?? "")
              : String((item as Record<string, unknown>).alt ?? ""),
          )
          .join(""),
      )
      .join("\n");
    event.clipboardData.setData("text/plain", plain);
    event.clipboardData.setData(
      "application/json",
      JSON.stringify({
        source: "codex",
        format: "standoff-inline-v1",
        context: { ranges: fragments.length },
        data: fragments,
      }),
    );
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    return true;
  }

  private onCopy = (event: ClipboardEvent) => {
    if(this.completion?.()?.clipboard?.(event))return;
    if(this.clipboard?.copyProjectionEvent(event))return;
    if (this.clipboard?.enabled()) { this.clipboard.handleText(event); return; }
    this.writeStandoffClipboard(event);
  };

  private onCut = (event: ClipboardEvent) => {
    if(this.completion?.()?.clipboard?.(event))return;
    if (this.clipboard?.enabled()) { this.clipboard.handleText(event); return; }
    if (!this.writeStandoffClipboard(event)) return;
    const context = this.standoffClipboardContext(event);
    if (!context) return;
    const replacements = context.set.items.map((item) => ({
      item,
      start: Math.min(item.anchor.boundary.index, item.head.boundary.index),
      end: Math.max(item.anchor.boundary.index, item.head.boundary.index),
      text: "",
    }));
    this.multiSelections.replace(context.resolved.nodeKey, replacements);
  };

  private onPaste = (event: ClipboardEvent) => {
    this.markdown?.cancel();
    this.listInput.cancelTask?.();
    if(this.completion?.()?.clipboard?.(event))return;
    if (this.clipboard?.enabled()) { this.clipboard.handleText(event); return; }
    const context = this.standoffClipboardContext(event);
    if (!context || !event.clipboardData) return;
    const primary = context.set.items.find((item) => item.id === context.set.primaryId);
    if (!primary) return;
    const plain = event.clipboardData.getData("text/plain");
    if (context.set.items.length > 1) {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      this.multiSelections.replace(
        context.resolved.nodeKey,
        context.set.items.map((item) => ({
          item,
          start: Math.min(item.anchor.boundary.index, item.head.boundary.index),
          end: Math.max(item.anchor.boundary.index, item.head.boundary.index),
          text: plain,
        })),
      );
      return;
    }

    let rich: Array<Record<string, unknown>> | undefined;
    try {
      const envelope = JSON.parse(event.clipboardData.getData("application/json") || "null");
      if (envelope?.source === "codex" && envelope?.format === "standoff-inline-v1") {
        rich = envelope.data?.[0];
      }
    } catch {
      rich = undefined;
    }
    const start = Math.min(primary.anchor.boundary.index, primary.head.boundary.index);
    const end = Math.max(primary.anchor.boundary.index, primary.head.boundary.index);
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    if (!rich?.length) {
      this.commands.replaceInlineRange(context.resolved.nodeKey, start, end, plain, "Paste text");
      return;
    }
    let index = start;
    this.commands.transaction("Paste rich inline content", () => {
      this.commands.replaceInlineRange(context.resolved.nodeKey, start, end, "");
      for (const item of rich!) {
        if (item.kind === "image") {
          this.commands.insertInlineImage(context.resolved.nodeKey, index, {
            assetId: String(item.assetId ?? globalThis.crypto.randomUUID()),
            src: String(item.src ?? ""),
            alt: String(item.alt ?? ""),
            width: typeof item.width === "number" ? item.width : undefined,
            height: typeof item.height === "number" ? item.height : undefined,
            status: "ready",
          });
          index += 1;
        } else {
          const value = String(item.text ?? "");
          this.commands.replaceInlineRange(context.resolved.nodeKey, index, index, value);
          index += [...value].length;
        }
      }
    });
  };

  private runBinding = (id: string, event: Event): boolean | void => {
    if (id === "sticky.createFloating") {
      const resolved = this.mounts.resolveEvent(event);
      return resolved ? this.runCommand(id, resolved.nodeKey) : false;
    }
    if (event instanceof KeyboardEvent && event.isComposing) return false;
    if (id === "menu.open") { this.openContextMenu(event); return event.defaultPrevented; }
    const resolved = this.mounts.resolveEvent(event);
    if (!resolved || resolved.handle.composing) return false;
    // Registered, scoped commands may target containers (for example a document
    // panel). Text-editing branches below still require an editable text mount.
    if (!["native-text", "standoff"].includes(resolved.handle.inputPolicy)) return this.runCommand(id, resolved.nodeKey);
    if (resolved.handle.inputPolicy === "native-text" && !(event.target instanceof HTMLTextAreaElement)) return false;

    if (id === 'gloss.create') {
      const target = event.target instanceof Element ? event.target : undefined;
      // The browser keeps Find-next outside the actual standoff editing surface.
      if (resolved.handle.inputPolicy !== 'standoff' || !target ||
          !resolved.handle.focusElement.contains(target) ||
          target.closest('input, textarea, select') ||
          target.closest('[contenteditable]') !== resolved.handle.focusElement) return false;
      return this.runCommand(id, resolved.nodeKey);
    }

    if (id === "resource.processAtCaret") return this.clipboard?.processAtCaret(event) ?? false;

    if (id === 'task.toggle') return event.target instanceof Node && resolved.handle.focusElement.contains(event.target) ? this.listInput.toggleTask?.(resolved.nodeKey) ?? false : false;
    if (id === 'list.indent' || id === 'list.outdent') {
      if (resolved.handle.inputPolicy !== 'standoff' || !(event.target instanceof Node) ||
        !resolved.handle.focusElement.contains(event.target)) return false;
      if (event instanceof KeyboardEvent && event.repeat) return;
      return this.changeTextList(resolved.nodeKey, id === 'list.outdent');
    }

    if (id === "tabs.create" && resolved.handle.inputPolicy === "standoff") {
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [role="dialog"]')) return false;
      if (event instanceof KeyboardEvent && event.repeat) return;
      return this.createTextTab(resolved.nodeKey);
    }

    if (id === "annotation.open" && resolved.handle.inputPolicy === "standoff" &&
      !(event.target instanceof Element && event.target.closest('input, textarea, select, [role="dialog"]'))) {
      event.preventDefault(); event.stopPropagation();
      if (event instanceof KeyboardEvent && event.repeat) return;
      const node = this.node(resolved.nodeKey);
      const selection = resolved.handle.captureInlineSelection?.();
      if (!node || !selection) return;
      for (const overlay of [...this.overlays.overlays]) if (overlay.viewType === "annotation-panel") this.overlays.close(overlay.key, false);
      const cell = Math.max(0, Math.min(node.inlineContent.length - 1, selection.anchor - 1));
      const properties = node.payload.standoffProperties;
      const indexes = Array.isArray(properties) ? properties.flatMap((p, index) =>
        p && !p.isDeleted && Number.isInteger(p.start) && Number.isInteger(p.end) && p.start >= 0 &&
          p.end < node.inlineContent.length && p.start <= cell && cell <= p.end ? [index] : []) : [];
      const range = this.document.getSelection()?.rangeCount ? this.document.getSelection()!.getRangeAt(0) : undefined;
      const rect = range && typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : resolved.handle.root.getBoundingClientRect();
      this.overlays.open({ viewType: "annotation-panel", ownerKey: node.key, annotationIndexes: indexes,
        anchor: { x: rect.left, y: rect.bottom + 5 }, title: "Annotations at caret" });
      return;
    }

    if (["margin.left", "margin.right"].includes(id) && resolved.handle.inputPolicy === "standoff" &&
      !(event.target instanceof Element && event.target.closest('input, textarea, select, [data-native-context-menu], [role="dialog"]'))) {
      event.preventDefault(); event.stopPropagation();
      if (event instanceof KeyboardEvent && event.repeat) return;
      const node = this.node(resolved.nodeKey);
      if (!node) return;
      try {
        const caret = resolved.handle.captureInlineSelection?.()?.anchor ?? 0;
        const placement = this.commands.ensureMargin(node.key, id === "margin.left" ? "left" : "right");
        this.selections.clearSecondary(node.key);
        this.selections.setPrimary(node.key, node.contentKey, node.viewId, caret);
        const margin = this.node(node.ownedRelations[id === "margin.left" ? "leftMargin" : "rightMargin"]);
        const target = margin?.children.map(key => this.node(key)).find(child => child?.placementKey === placement);
        if (target) queueMicrotask(() => this.focus.request(target.key, { reason: "open-margin", caret: "start" }));
      } catch (error) {
        console.warn("Cannot open margin without replacing existing data", error);
      }
      return;
    }

    if (id === "text.paragraph" && resolved.handle.inputPolicy === "standoff") {
      const selection = resolved.handle.captureInlineSelection?.();
      const node = this.node(resolved.nodeKey);
      if (!selection || !node) return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      this.insertStandoffParagraph(
        resolved.nodeKey,
        resolved.handle,
        node,
        Math.min(selection.anchor, selection.head),
        Math.max(selection.anchor, selection.head),
      );
      return;
    }

    if (["block.left", "block.right", "block.up", "block.down"].includes(id)) {
      const node = this.node(resolved.nodeKey);
      if (!node) return;
      let start: number;
      let end: number;
      let length: number;
      if (resolved.handle.inputPolicy === "native-text") {
        const selection = textareaSelection(event.target as HTMLTextAreaElement);
        start = selection.start;
        end = selection.end;
        length = (event.target as HTMLTextAreaElement).value.length;
      } else {
        const selection = resolved.handle.captureInlineSelection?.();
        if (!selection) return;
        start = Math.min(selection.anchor, selection.head);
        end = Math.max(selection.anchor, selection.head);
        length = node.inlineContent.length;
      }
      if (start !== end) return false;
      const backwards = id === "block.left" || id === "block.up";
      if ((backwards && start !== 0) || (!backwards && end !== length)) return false;
      const target = this.adjacentEditable(resolved.nodeKey, backwards ? -1 : 1);
      if (!target) return false;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      this.focus.request(target.key, {
        caret: id === "block.left" ? "end" : "start",
        reason: `navigate-${id}`,
      });
      return;
    }

    if (id !== "block.delete") return this.runCommand(id, resolved.nodeKey);
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    const target = this.blockDeleteTarget ? this.blockDeleteTarget(resolved.nodeKey) : resolved.nodeKey;
    if (!target) return;
    const fallback = this.focusFallback(target);
    this.focus.clearRemoved(target);
    this.commands.remove(target);
    if (fallback) queueMicrotask(() => this.focus.request(fallback, { caret: "start" }));
  };

  private insertStandoffParagraph(
    nodeKey: NodeKey,
    handle: MountHandle,
    node: BlockNode,
    start: number,
    end: number,
  ): void {
    if (this.listInput.taskEnter?.(nodeKey, start, end)) return;
    if (start === 0 && end === 0 && node.inlineContent.length === 0 && this.listInput.exitEmpty(nodeKey)) return;
    const resultingLength = node.inlineContent.length - (end - start);
    let focusPlacement: PlacementKey | undefined;
    const insert = () => {
      const emptyDto = {
        ...JSON.parse(JSON.stringify(node.payload)),
        id: globalThis.crypto.randomUUID(),
        type: "standoff-editor-block",
        text: "",
        standoffProperties: [],
        children: [],
      };
      if (start !== end) this.commands.replaceInlineRange(nodeKey, start, end, "");
      if (start === 0) {
        this.commands.insert(emptyDto, { kind: "before", anchorKey: nodeKey });
      } else if (start === resultingLength) {
        focusPlacement = this.commands.insert(emptyDto, { kind: "after", anchorKey: nodeKey });
      } else {
        focusPlacement = this.commands.splitStandoff(nodeKey, start);
      }
    };
    // Collapsed-caret Enter is one atomic command at every position. Selected
    // ranges still need a transaction to combine deletion and insertion.
    if (start === end) {
      if (start === 0) this.commands.insertEmptyStandoffSibling(nodeKey, "before");
      else if (start === resultingLength) focusPlacement = this.commands.insertEmptyStandoffSibling(nodeKey, "after");
      else focusPlacement = this.commands.splitStandoff(nodeKey, start);
    } else this.commands.transaction("Insert Standoff paragraph", insert);
    if (focusPlacement) {
      const target = this.nodeForPlacement(focusPlacement, node.viewId);
      if (target) queueMicrotask(() => this.focus.request(target.key, { reason: "split", caret: "start" }));
    } else {
      queueMicrotask(() => handle.restoreInlineSelection?.({ anchor: 0, head: 0 }));
    }
  }

  private recordNativeText(nodeKey: NodeKey, target: HTMLTextAreaElement): void {
    this.mounts.rememberSelection(nodeKey, textareaSelection(target));
    const source = this.mounts.get(nodeKey)?.authoredNativeText;
    this.commands.setPayloadField(nodeKey, "text", source ? source(target.value) : target.value, source ? "Edit Source" : "Edit PlainText");
  }

  private reconcileStandoffText(
    nodeKey: NodeKey,
    handle: ReturnType<MountRegistry["get"]> & {},
  ): void {
    const node = this.node(nodeKey);
    if (!node || !handle?.captureText) return;
    const source: string[] = [];
    for (const cellKey of node.inlineContent) {
      const cell = this.node(cellKey);
      // A text-only diff cannot safely infer the position of an inline atom.
      // Keep the canonical mixed sequence intact until the typed DOM-sequence
      // reconciler can identify both text runs and atom identities.
      if (cell?.viewType !== "text-cell") return;
      source.push(String(cell.payload.text ?? ""));
    }
    const actual = [...handle.captureText()];
    if (source.join("") === actual.join("")) return;

    let start = 0;
    while (start < source.length && start < actual.length && source[start] === actual[start]) {
      start += 1;
    }
    let sourceEnd = source.length;
    let actualEnd = actual.length;
    while (
      sourceEnd > start &&
      actualEnd > start &&
      source[sourceEnd - 1] === actual[actualEnd - 1]
    ) {
      sourceEnd -= 1;
      actualEnd -= 1;
    }

    const nativeSelection = handle.captureInlineSelection?.();
    const inserted = actual.slice(start, actualEnd).join("");
    this.commands.replaceInlineRange(nodeKey, start, sourceEnd, inserted, "Reconcile Standoff input");
    this.selections.mapContentEdit(node.contentKey, start, sourceEnd, actualEnd - start);
    if (nativeSelection) {
      this.selections.setPrimary(
        nodeKey,
        node.contentKey,
        node.viewId,
        nativeSelection.anchor,
        nativeSelection.head,
      );
      queueMicrotask(() => handle.restoreInlineSelection?.(nativeSelection));
    }
  }

  dispose(): void {
    if (!this.installed) return;
    this.installed = false;
    this.document.removeEventListener("input", this.onInput, true);
    this.document.removeEventListener("beforeinput", this.onBeforeInput, true);
    this.document.removeEventListener("focusin", this.onFocusIn, true);
    this.document.removeEventListener("focusout", this.onFocusOut, true);
    this.caretEvents?.setComposing?.(false);
    this.caretEvents?.setCaret();
    this.document.removeEventListener("keydown", this.onKeyDown, true);
    this.document.removeEventListener("compositionstart", this.onCompositionStart, true);
    this.document.removeEventListener("compositionend", this.onCompositionEnd, true);
    this.document.removeEventListener("selectionchange", this.onSelectionChange, true);
    this.document.removeEventListener("pointerdown", this.onPointerDown, true);
    this.document.removeEventListener("copy", this.onCopy, true);
    this.document.removeEventListener("cut", this.onCut, true);
    this.document.removeEventListener("paste", this.onPaste, true);
    this.document.removeEventListener("contextmenu", this.onContextMenu, true);
    this.document.removeEventListener("click", this.onControlClick, true);
    this.document.removeEventListener("dblclick", this.onControlClick, true);
    this.document.removeEventListener("speedy-input", this.onCustomInput, true);
    this.document.defaultView?.removeEventListener("blur", this.onWindowBlur);
    this.document.defaultView?.removeEventListener("focus", this.onWindowFocus);
  }
  private onWindowFocus = () => { this.refreshCaret(); };
  private onWindowBlur = () => { this.bindings.cancelChord(); this.caretEvents?.setComposing?.(false); this.caretEvents?.setCaret(); };
}
