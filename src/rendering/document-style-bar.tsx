import { documentStylePorts } from '../runtime/document-style-ports';
import {textAppearanceProperty} from '../block-tree/native-authoring';
import {useGlossPresentation} from '../features/gloss/presentation-context';
import { initialisCommand } from "../features/initialis/controller";
import { ownSelectionToolbar } from "../input/selection-target";
import { For, Show, createEffect, createSignal, createComponent, onCleanup, onMount } from "solid-js";
import { unwrap } from "solid-js/store";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { NodeKey } from "../block-tree/types";
import { createTextTab } from "../runtime/text-tabs";
import "./document-style-bar.css";
import "./pointer-spotlight.css";
import { DocumentCountBar } from "./document-count-bar";
import { CompactToolbar, type CompactTool, type Toolset } from "./compact-toolbar";
import { createAnnotationBarPresentation, annotationBarPolicies, type AnnotationBarPolicy } from "./annotation-bar-policy";
import { createTextSuperposition } from "../runtime/text-superposition";

/** Canonical style types, including the three preserved range-wrapper styles. */
export const annotationTools = [
  ["style/bold", "Bold selection", "B"], ["style/italics", "Italicise selection", "I"],
  ["style/underline", "Underline", "U"], ["style/strikethrough", "Strikethrough", "S̶"],
  ["style/superscript", "Superscript", "x²"], ["style/subscript", "Subscript", "x₂"],
  ["style/uppercase", "Uppercase", "AA"], ["style/highlight", "Highlight", "Highlight"],
  ["style/highlighter", "Highlighter", "Marker"], ["style/show-hide", "Show / hide", "Show / Hide"], ["style/rainbow", "Rainbow underline", "Rainbow"],
  ["style/rectangle", "Rectangle", "□ Rectangle"], ["style/spiky", "Spiky outline", "Spiky"],
  ["style/blur", "Blur", "Blur"], ["style/glow", "Glow / bloom", "Glow"],
  ["style/chromatic-aberration", "Chromatic aberration", "RGB"], ["style/motion-blur", "Directional blur (experimental)", "Motion"],
  ["style/ghost", "Ghost / echo", "Ghost"], ["style/grayscale", "Grayscale", "Gray"],
  ["style/sepia", "Sepia", "Sepia"], ["style/invert", "Invert", "Invert"],
  ["style/contrast-brightness", "Contrast / brightness", "Contrast"], ["style/grain", "Grain / noise", "Grain"],
  ["style/ink-bleed", "Ink bleed", "Ink"], ["style/turbulence", "Turbulence", "Turbulence"],
  ["amber-crt", "Amber CRT", "Amber CRT"],
  ["style/flip", "Flip", "Flip"], ["style/mirror", "Mirror", "Mirror"],
] as const;

const effectDefaults: Readonly<Record<string, Readonly<Record<string, number | string>>>> = {
  "style/blur": { amount: 3 },
  "style/glow": { radius: 3, intensity: .35 },
  "style/chromatic-aberration": { offset: 1.5, intensity: .38, direction: "horizontal" },
  "style/motion-blur": { x: 6, y: 0 },
  "style/ghost": { offsetX: 3, offsetY: 1, blur: 1.5, opacity: .28 },
  "style/grayscale": { amount: .75 },
  "style/sepia": { amount: .8 },
  "style/invert": { amount: 1 },
  "style/contrast-brightness": { contrast: 1.4, brightness: 1.1 },
  "style/grain": { frequency: .75, octaves: 2, opacity: .12, seed: 2 },
  "style/ink-bleed": { spread: 1, intensity: .26, roughness: .35 },
  "style/turbulence": { frequency: .025, octaves: 2, opacity: .14, seed: 4 },
};

export function DocumentStyleBar(props: { editor: ReactiveEditor; scopeKey?: NodeKey; toolset?: Toolset; onToolset?: (value: Toolset) => void; onNotice?: (value: string) => void; margins?: { collapsed: boolean; count: number; open: boolean; controls: string; toggle: () => void } }) {
  const editor = props.editor;
  const [targetKey, setTargetKey] = createSignal<NodeKey>();
  const [notice, setNotice] = createSignal("");
  const [linkedType, setLinkedType] = createSignal(editor.annotationUI.list()[0]?.type ?? "codex/reference"), [linkedValue, setLinkedValue] = createSignal("");
  const [colour, setColour] = createSignal("#ff0000"), [background, setBackground] = createSignal("#ffff00");
  const [localToolset, setLocalToolset] = createSignal<Toolset>("Typography");
  let bar!: HTMLElement;
  const presentation = createAnnotationBarPresentation(() => bar);
  const barState = () => editor.features.compactEditorChrome ? presentation.state() : "expanded";
  const compact = () => barState() === "compact";
  const featureNotice = () => editor.featureActions.toolbar().map(item => item.notice()).find(Boolean) ?? "";
  createEffect(() => props.onNotice?.(notice() || editor.gloss.notice() || editor.initialis.notice() || featureNotice() || editor.crossText.message()));
  let savedRange: { anchor: number; head: number } | undefined;
  const inScope = (key: NodeKey): boolean => editor.blockQueries.contains(props.scopeKey, key);
  createEffect(() => {
    const key = editor.focus.state.focusedKey, node = key && editor.node(key);
    if (node && node.viewType === "standoff-editor-block" && inScope(node.key)) {
      if (targetKey() !== node.key) savedRange = undefined;
      setTargetKey(node.key);
    }
  });
  const target = () => { const key = targetKey(); return key && inScope(key) ? editor.node(key) : undefined; };
  const capture = () => {
    if (editor.crossText.range()) return;
    const node = target(); if (!node) return;
    const mount = editor.mounts.get(node.key), anchor = document.getSelection()?.anchorNode;
    if (anchor && mount?.root.contains(anchor)) savedRange = mount.captureInlineSelection?.();
    else if (!savedRange) {
      const set = editor.selections.sets[node.key], primary = set?.items.find(item => item.id === set.primaryId);
      if (primary) savedRange = { anchor: primary.anchor.boundary.index, head: primary.head.boundary.index };
    }
  };
  const retainSelection = (event: PointerEvent) => { capture(); if ((event.target as Element).closest("button")) event.preventDefault(); };
  const restore = () => {
    if (editor.crossText.range()) return;
    const node = target(); if (!node) return;
    editor.mounts.get(node.key)?.focusElement?.focus({ preventScroll: true });
    if (savedRange) editor.mounts.get(node.key)?.restoreInlineSelection?.(savedRange);
  };
  const collapseAfterShowHide = (nodeKey: NodeKey, index: number) => {
    const node = editor.node(nodeKey), mount = editor.mounts.get(nodeKey);
    if (!node) { savedRange = undefined; return; }
    savedRange = { anchor: index, head: index };
    document.getSelection()?.removeAllRanges();
    mount?.focus();
    mount?.restoreInlineSelection?.(savedRange);
    editor.selections.setPrimary(node.key, node.contentKey, node.viewId, index);
  };
  const annotate = (type: string, value?: string) => {
    const operation = editor.currentTextOperation.annotationOperation();
    if (operation) {
      if (operation.annotationTargets()?.some(range => !inScope(range.nodeKey))) { setNotice("The text selection belongs to another document."); return; }
      try {
        const finalRange = operation.annotationTargets()?.at(-1);
        operation.apply(type, value, effectDefaults[type] ?? {});
        if (type === "style/show-hide" && finalRange) collapseAfterShowHide(finalRange.nodeKey, finalRange.end);
        else savedRange = undefined;
        setNotice("");
      } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
      return;
    }
    const cross = editor.crossText.range();
    if (cross) {
      if (!inScope(cross.anchor.occurrenceKey)) { setNotice("The text selection belongs to another document."); return; }
      try {
        const contribution = editor.annotationUI.get(type);
        if (contribution) contribution.apply(editor.crossText.resolve(cross.anchor, cross.head));
        else {
          editor.crossText.annotate(type, value, effectDefaults[type] ?? {});
          if (type === "style/show-hide") { const head = cross.head; editor.crossText.collapseToHead(); savedRange = { anchor: head.boundary.index, head: head.boundary.index }; }
        }
        setNotice("");
      }
      catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
      return;
    }
    capture(); const node = target();
    const contribution = editor.annotationUI.get(type);
    if (contribution) {
      try {
        const ranges = node && savedRange ? [{ nodeKey: node.key, start: Math.min(savedRange.anchor, savedRange.head), end: Math.max(savedRange.anchor, savedRange.head) }] : [];
        contribution.apply(ranges, node?.key ?? props.scopeKey); setNotice("");
      } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
      return;
    }
    if (!node || !savedRange) { setNotice("Select text in this document first."); return; }
    const start = Math.min(savedRange.anchor, savedRange.head), end = Math.max(savedRange.anchor, savedRange.head) - 1;
    if (start < 0 || end < start || end >= node.inlineContent.length) { setNotice("Select a non-empty text range first."); return; }
    const content = editor.repository.readState().contents[node.contentKey];
    editor.rangeAnnotations.apply([{ nodeKey: node.key, contentKey: node.contentKey, placementKey: node.placementKey, version: content.inlineRevision, start, end: end + 1, coordinate: "cell" }], type, value, effectDefaults[type] ?? {});
    setNotice("");
    if (type === "style/show-hide") collapseAfterShowHide(node.key, end + 1);
    else restore();
  };
  const showHide = () => {
    if (editor.currentTextOperation.annotationOperation()) { annotate("style/show-hide"); return; }
    capture();
    if (savedRange && savedRange.anchor !== savedRange.head) { annotate("style/show-hide"); return; }
    const key = props.scopeKey ?? targetKey() ?? editor.focus.state.focusedKey ?? editor.focus.state.lastFocusedKey;
    if (!key) { setNotice("Focus a Document before toggling hidden text."); return; }
    try { setNotice(editor.showHide.toggle(key) ? "Hidden text is visible." : "Hidden text is concealed."); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  };
  const addAlternative = () => {
    if (editor.crossText.range()) { setNotice("Add an alternative within one text Block."); return; }
    capture(); const node = target();
    if (!node || !savedRange) { setNotice("Select text in this document first."); return; }
    const start = Math.min(savedRange.anchor, savedRange.head), end = Math.max(savedRange.anchor, savedRange.head) - 1;
    try {
      const property = createTextSuperposition(editor, node, start, end);
      setNotice(""); savedRange = undefined;
      queueMicrotask(() => {
        const relation = target()?.ownedRelations[property.alternatives[0]];
        if (relation) editor.focus.request(relation, { caret: "start", reason: "new-alternative" });
      });
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  };
  const blockStyle = (type: string, value: string) => {
    if (editor.crossText.range()) { editor.crossText.notice("Collapse the text selection before changing paragraph layout."); return; }
    capture(); const node = target(); if (!node) { setNotice("Focus a text Block first."); return; }
    const property=textAppearanceProperty(node.viewType,type,type==='block/indent'?Number(value):value);
    const current = (node.payload.blockProperties as Record<string, unknown>[] | undefined) ?? [];
    const existing = current.find(p => p.type === type && !p.isDeleted);
    if (existing?.value === property.value) return;
    editor.commands.setPayloadField(node.key, "blockProperties", [...unwrap(current).filter(p => p !== unwrap(existing)), { ...unwrap(existing), ...property }], "Format Block");
    setNotice(""); restore();
  };
  const indent = (delta: number) => {
    const properties = target()?.payload.blockProperties as Record<string, unknown>[] | undefined;
    const value = Number(properties?.find(p => p.type === "block/indent" && !p.isDeleted)?.value ?? 0);
    blockStyle("block/indent", String(Math.max(0, (Number.isFinite(value) ? Math.trunc(value) : 0) + delta)));
  };
  const clear = () => {
    if (editor.crossText.range()) { editor.crossText.notice("Range-aware Clear Formatting is not enabled yet. Existing formatting outside the selection is protected."); return; }
    const node = target(); if (!node) return;
    editor.commands.transaction("Clear Formatting", () => {
      const annotations = (node.payload.standoffProperties as Record<string, unknown>[] | undefined) ?? [];
      editor.commands.setPayloadField(node.key, "standoffProperties", unwrap(annotations).filter(p => !String(p.type).startsWith("style/") && !["amber-crt", "text/colour", "text/background-colour"].includes(String(p.type))), "Clear Formatting");
      editor.commands.setPayloadField(node.key, "blockProperties", [], "Clear Formatting");
    }); restore();
  };

  const DocumentActions = () => <>
    <button type="button" title={editor.bindings.label("find.open")} onClick={() => { const key = targetKey() ?? props.scopeKey ?? editor.focus.state.focusedKey ?? editor.focus.state.lastFocusedKey; if (key) { editor.find.open(key); if (!editor.find.state.open) setNotice(editor.find.state.message); } else setNotice("Focus text in a document first."); }}>Find</button>
    <For each={editor.featureActions.list("document-actions")}>{item => <button type="button"
      title={`${item.title ?? item.label}${item.binding ? ` (${editor.bindings.label(item.binding)})` : ""}`}
      onClick={() => {
        const key = targetKey() ?? props.scopeKey ?? editor.focus.state.focusedKey ?? editor.focus.state.lastFocusedKey;
        const context = key && { targetKey: key, args: undefined };
        if (!context || !editor.commandRegistry.canExecute(item.command, context)) { setNotice("Focus a Block in this document first."); return; }
        try { void Promise.resolve(editor.commandRegistry.execute(item.command, context)).catch(error => setNotice(String(error))); setNotice(""); }
        catch (error) { setNotice(String(error)); }
      }}>{item.label}</button>}</For>
  </>;
  const HistoryAction = () => <>
    <Show when={editor.features.blockHistory}><button type="button" title="View history of the focused Block" onClick={() => {
      const key = [editor.focus.state.focusedKey, targetKey(), props.scopeKey, editor.focus.state.lastFocusedKey]
        .find(key => key && inScope(key) && editor.blockHistory.canOpen(key));
      if (key) { setNotice(""); editor.commandRegistry.execute("history.open", { targetKey: key, args: undefined }); }
      else setNotice("Focus a Block in this Document to view its history.");
    }}>History</button></Show>
  </>;
  const SelectionOption = () => <>
    <label title="Select, edit and annotate text across adjacent Blocks. This preference is remembered in this browser."><input type="checkbox" aria-label="Experimental cross-Block text selection" checked={editor.crossText.enabled()} onChange={event => editor.crossText.enable(event.currentTarget.checked)} />Cross-Block selection (experimental)</label>
  </>;
  const LinkedControls = () => <>
    <Show when={editor.crossText.enabled()}><label>Linked annotation type<input aria-label="Linked annotation type" value={linkedType()} onInput={event => setLinkedType(event.currentTarget.value)} /></label>
      <label>Reference/value<input aria-label="Linked annotation value" value={linkedValue()} onInput={event => setLinkedValue(event.currentTarget.value)} /></label>
      <button type="button" onClick={() => {
        const range = editor.crossText.range(); if (!range || !inScope(range.anchor.occurrenceKey)) { setNotice("Select text in this document first."); return; }
        const head = range.head;
        try {
          const contribution = editor.annotationUI.get(linkedType().trim());
          if (contribution) { contribution.apply(editor.crossText.resolve(range.anchor, range.head)); return; }
          const id = editor.linkedAnnotations.create(linkedType(), linkedValue());
          setNotice(`Created linked annotation ${id}`);
          const mount = editor.mounts.get(head.occurrenceKey); mount?.focus(); mount?.restoreInlineSelection?.({ anchor: head.boundary.index, head: head.boundary.index });
        } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
      }}>Create linked annotation</button>
    </Show>
  </>;
  const ColourControls = () => <>
    <label title="Text colour">Text <input type="color" aria-label="Text colour" value={colour()} onInput={e => setColour(e.currentTarget.value)} /></label>
    <button type="button" title="Apply text colour" data-annotation-type="text/colour" onClick={() => annotate("text/colour", colour())}>Apply colour</button>
    <label title="Text background colour">Fill <input type="color" aria-label="Text background colour" value={background()} onInput={e => setBackground(e.currentTarget.value)} /></label>
    <button type="button" title="Apply background colour" data-annotation-type="text/background-colour" onClick={() => annotate("text/background-colour", background())}>Apply fill</button>
  </>;
  const TabAction = () => <>
    <button type="button" aria-label="To tab / add tab" title={`To tab / add tab (${editor.bindings.label("tabs.create")})`} onClick={() => {
      if (editor.crossText.range()) { editor.crossText.notice("Collapse the text selection before creating a tab."); return; }
      capture(); const node = target();
      if (!node || !createTextTab(editor, node.key, savedRange)) setNotice("Focus a text Block in this document first.");
      else { savedRange = undefined; setNotice(""); }
    }}>To tab / + Tab</button>
  </>;
  const hasCrossRange = () => { const range = editor.crossText.range(); return !!range && inScope(range.anchor.occurrenceKey); };
  const hiddenTextRevealed = () => {
    const key = props.scopeKey ?? targetKey() ?? editor.focus.state.focusedKey ?? editor.focus.state.lastFocusedKey;
    return !!key && editor.showHide.shows(key);
  };
  const typographyTypes = new Set(["style/bold", "style/italics", "style/underline", "style/strikethrough", "style/superscript", "style/subscript", "style/uppercase", "style/blur"]);
  const markupTypes = new Set(["style/highlight", "style/highlighter", "style/show-hide"]);
  const deferredTypes = new Set(["style/flip", "style/mirror"]);
  const historyTrigger = (direction: "undo" | "redo") => editor.bindings.effective(`history.${direction}`).find(trigger => trigger.kind === "keyboard" || trigger.kind === "chord");
  const history = (direction: "undo" | "redo") => {
    const node = target(), trigger = historyTrigger(direction);
    const mount = node && editor.mounts.get(node.key);
    if (!mount?.focusElement || mount.composing || !trigger || (trigger.kind !== "keyboard" && trigger.kind !== "chord")) return;
    restore();
    for (const stroke of trigger.kind === "chord" ? trigger.steps : [trigger]) mount.focusElement.dispatchEvent(new KeyboardEvent("keydown", {
      key: stroke.key, ctrlKey: stroke.modifiers.includes("Ctrl"), metaKey: stroke.modifiers.includes("Meta"),
      altKey: stroke.modifiers.includes("Alt"), shiftKey: stroke.modifiers.includes("Shift"), bubbles: true, cancelable: true,
    }));
  };
  const applyInitialis = () => {
    capture(); const node=target(); if(!node)return;
    restore();setNotice("");
    void editor.commandRegistry.execute(initialisCommand,{targetKey:node.key,args:{selection:savedRange}});
  };
  const glossPresentation=useGlossPresentation();
  const tools = (): CompactTool[] => [
    ...(glossPresentation?[{id:'gloss.mode',label:'Gloss Mode',glyph:'Gloss Mode',toolset:'Annotations' as const,persistent:true,width:94,pressed:glossPresentation.active,run:()=>{glossPresentation.toggle();restore();}},...(glossPresentation.active()&&glossPresentation.narrow()?[{id:'gloss.references',label:'Local References',glyph:'Refs',toolset:'Annotations' as const,persistent:true,width:46,pressed:glossPresentation.references,run:glossPresentation.toggleReferences}]:[])]:[]),
    ...(editor.features.glossMode?[{id:'gloss.create',label:`Create Gloss (${editor.bindings.label('gloss.create')})`,glyph:'G',toolset:'Annotations' as const,persistent:true,width:36,run:()=>{capture();const n=target();if(n)void editor.commandRegistry.execute('gloss.create',{targetKey:n.key,args:{selection:savedRange}});},disabled:()=>!target()}]:[]),
    ...(editor.initialis.enabled?[{id:initialisCommand,label:"Apply Initialis (Ctrl+; then I)",glyph:"𝓘",toolset:"Visual effects" as const,persistent:true,width:36,run:applyInitialis,disabled:()=>!target()}]:[]),
    ...(["undo", "redo"] as const).map(direction => ({ id: `history.${direction}`, label: direction === "undo" ? "Undo" : "Redo", glyph: direction === "undo" ? "↶" : "↷", toolset: "Typography" as const, primary: true, disabled: () => !target() || !historyTrigger(direction), run: () => history(direction) })),
    { id: "colours", label: "Text colour and fill", glyph: "Colour / Fill", width: 104, toolset: "Visual effects", panel: ColourControls },
    ...(editor.features.textSuperposition ? [{ id: "superposition.add", label: "Add alternative", glyph: "Alternative", width: 96, toolset: "Annotations" as const, run: addAlternative }] : []),
    ...annotationTools.map(([type, label, glyph]): CompactTool => ({
      id: type, label, glyph,
      toolset: type === "style/show-hide" ? "Selection" : typographyTypes.has(type) ? "Typography" : markupTypes.has(type) ? "Annotations" : "Visual effects",
      get description() { return editor.featureActions.toolbar().map(item => item.annotationDescriptions?.[type]).find(Boolean) ?? (deferredTypes.has(type) ? "Annotation is stored; visual rendering is pending." : undefined); },
      persistent: ["style/bold", "style/italics"].includes(type),
      width: typographyTypes.has(type) ? 36 : 88, pressed: type === "style/show-hide" ? hiddenTextRevealed : undefined, run: () => type === "style/show-hide" ? showHide() : annotate(type),
    })),
    ...["h1", "h2", "h3", "h4"].map(size => ({ id: size, primary: size === "h1" || size === "h2", label: `Apply ${size.toUpperCase()}`, glyph: size.toUpperCase(), toolset: "Typography" as const, disabled: hasCrossRange, run: () => blockStyle("block/font/size", size) })),
    ...[["left", "Align left", "≡"], ["center", "Align centre", "≣"], ["right", "Align right", "≡"], ["justify", "Justify", "☰"]].map(([value, label, glyph]) => ({ id: `align-${value}`, label, glyph, toolset: "Typography" as const, disabled: hasCrossRange, run: () => blockStyle("block/alignment", value) })),
    { id: "indent", label: "Increase indent", glyph: "⇥", toolset: "Typography", disabled: hasCrossRange, run: () => indent(1) },
    { id: "outdent", label: "Decrease indent", glyph: "⇤", toolset: "Typography", disabled: hasCrossRange, run: () => indent(-1) },
    { id: "clear", label: "Clear formatting", glyph: "T×", toolset: "Typography", disabled: hasCrossRange, run: clear },
    ...editor.annotationUI.list().map((item): CompactTool => ({ id: item.id, label: item.label, glyph: item.label, width: 120, toolset: "Annotations", run: () => annotate(item.type) })),
  ];
  if(editor.features.textualWorkspace && props.scopeKey)onMount(()=>onCleanup(documentStylePorts(editor).register(props.scopeKey!, {capture,tools,annotate,notice})));
  const StylePicker = () => <select class="annotation-bar__style" aria-label="Paragraph style" title="Paragraph or heading style" disabled={hasCrossRange()} value="" onChange={event => {
    const value = event.currentTarget.value;
    if (value) blockStyle("block/font/size", value);
    event.currentTarget.value = "";
  }}>
    <option value="">Style</option><option value="normal">Paragraph</option>
    <For each={["h1", "h2", "h3", "h4"]}>{size => <option value={size}>{size.toUpperCase()}</option>}</For>
  </select>;
  const MoreControls = () => <>
    <div class="annotation-bar__overflow-options"><SessionControls /></div>
    <fieldset><legend>Document</legend><DocumentActions /></fieldset>
    <Show when={(target() && !hasCrossRange()) || editor.features.blockHistory}><fieldset><legend>Block</legend><HistoryAction /><Show when={target() && !hasCrossRange()}><TabAction /></Show></fieldset></Show>
    <Show when={hasCrossRange()}><fieldset><legend>Selection</legend>
      <button type="button" onClick={() => editor.crossText.collapseToHead()}>Resume text editing</button>
      <details><summary>New linked annotation</summary><LinkedControls /></details>
    </fieldset></Show>
    <For each={editor.featureActions.toolbar()}>{item => createComponent(item.selectionDetails, {})}</For>
    <fieldset><legend>Editor options</legend><SelectionOption /></fieldset>
  </>;
  const SessionControls = () => <>
    <Show when={glossPresentation}><button type="button" data-gloss-toggle aria-pressed={glossPresentation?.active()} onClick={()=>{glossPresentation?.toggle();restore();}}>Gloss Mode</button><Show when={glossPresentation?.active()&&glossPresentation.narrow()}><button type="button" aria-expanded={glossPresentation?.references()} onClick={()=>glossPresentation?.toggleReferences()}>Local References</button></Show></Show>
    <Show when={editor.features.caretModes && editor.caretModes.enabled()}>
      <select class="document-style-bar__caret-mode" aria-label="Caret Mode" title="Session text focus" value={editor.caretModes.active()}
        onChange={event => { editor.pointerSpotlight.setActive(false); editor.caretModes.select(event.currentTarget.value); restore(); }}>
        <For each={editor.caretModes.list()}>{mode => <option value={mode.id}>{mode.label}</option>}</For>
      </select>
    </Show>
    <Show when={editor.features.pointerSpotlight}>
      <button type="button" class="document-style-bar__spotlight" aria-label="Pointer Spotlight" title="Pointer Spotlight — follow the mouse"
        aria-pressed={editor.pointerSpotlight.active()} onClick={() => { editor.pointerSpotlight.toggle(); restore(); }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="m7 3 6 4-3 5-6-4zM11 11l9 3-6 7-6-8M4 19h5M6.5 11v8" />
        </svg>
      </button>
    </Show>
    <Show when={props.margins?.collapsed && props.margins.count > 0}>
      <button type="button" class="document-style-bar__margins" aria-expanded={props.margins?.open} aria-controls={props.margins?.controls} onClick={() => props.margins?.toggle()}>
        Margins ({props.margins?.count})
      </button>
    </Show>
  </>;
  return <nav ref={element => { bar = element; onCleanup(ownSelectionToolbar(element, editor.mounts)); }} class="workspace-demo__stylebar document-style-bar" classList={{ "document-style-bar--compact": compact(), "annotation-bar--hidden": barState() === "hidden" }} data-annotation-bar-state={barState()} data-annotation-bar-policy={presentation.policy()} aria-label="Document formatting" onPointerDown={retainSelection} onFocusIn={capture}>
    <Show when={barState() !== "hidden"} fallback={<button type="button" class="annotation-bar__reveal" title="Show compact annotation bar" onClick={() => { presentation.reveal(); bar.querySelector<HTMLElement>(".annotation-bar__style")?.focus({ preventScroll: true }); }}>Show annotation bar</button>}>
    <div class="annotation-bar__session"><SessionControls /></div>
    <Show when={compact()} fallback={<>
    <Show when={editor.features.textSuperposition}><button type="button" title="Add alternative" onClick={addAlternative}>Alternative</button></Show>
    <DocumentActions />
    <HistoryAction />
    <Show when={editor.blockHistory.state.recordingError || editor.blockHistory.state.recording?.phase === "stopped" || editor.blockHistory.state.recording?.phase === "offline"}>
      <span role="status" class="document-style-bar-notice">History: {editor.blockHistory.state.recordingError ?? editor.blockHistory.state.recording?.message}</span>
    </Show>
    <SelectionOption />
    <Show when={editor.crossText.enabled()}><button type="button" disabled={!editor.crossText.range()} onClick={() => editor.crossText.collapseToHead()}>Resume text editing</button></Show>
    <LinkedControls />
    <Show when={editor.features.glossMode}><button type="button" data-command="gloss.create" title={`Create Gloss (${editor.bindings.label("gloss.create")})`} onClick={()=>{capture();const n=target();if(n)void editor.commandRegistry.execute('gloss.create',{targetKey:n.key,args:{selection:savedRange}});}}>Gloss</button></Show>
    <Show when={editor.initialis.enabled}><button type="button" data-command={initialisCommand} aria-label="Apply Initialis (Ctrl+; then I)" title="Apply Initialis (Ctrl+; then I)" onClick={applyInitialis}>𝓘</button></Show>
    <For each={annotationTools}>{([type, label, glyph]) => <>
      <button type="button" title={label} aria-label={label} aria-pressed={type === "style/show-hide" ? hiddenTextRevealed() : undefined} data-annotation-type={type} onClick={() => type === "style/show-hide" ? showHide() : annotate(type)}>{glyph}</button>
    </>}</For>
    <For each={editor.annotationUI.list()}>{item => <button type="button" aria-label={item.label} title={item.title} onClick={() => annotate(item.type)}>{item.label}</button>}</For>
    <ColourControls />
    <i />
    <For each={[["left", "Align left", "≡"], ["center", "Align centre", "≣"], ["right", "Align right", "≡"], ["justify", "Justify", "☰"]]}>{([value, label, glyph]) => <button type="button" title={label} onClick={() => blockStyle("block/alignment", value)}>{glyph}</button>}</For>
    <For each={["h1", "h2", "h3", "h4"]}>{size => <button type="button" title={`Apply ${size.toUpperCase()}`} onClick={() => blockStyle("block/font/size", size)}>{size.toUpperCase()}</button>}</For>
    <button type="button" title="Increase indent" onClick={() => indent(1)}>⇥</button>
    <button type="button" title="Decrease indent" onClick={() => indent(-1)}>⇤</button>
    <TabAction />
    <button type="button" title="Clear formatting" onClick={clear}>T×</button>
    <span role="status">{notice() || editor.gloss.notice() || editor.initialis.notice() || featureNotice() || editor.crossText.message()}</span>
    <Show when={!editor.features.compactEditorChrome}><DocumentCountBar editor={editor} scopeKey={props.scopeKey} /></Show>
    </>}>
      <CompactToolbar leading={StylePicker} tools={tools()} toolset={props.toolset ?? localToolset()} onToolset={value => { setLocalToolset(value); props.onToolset?.(value); }} capture={capture} restore={restore} retainSelection={retainSelection} more={MoreControls} />
    </Show>
    </Show>
    <Show when={editor.features.compactEditorChrome}><select class="annotation-bar__policy" aria-label="Annotation bar presentation" title={`Annotation bar: ${presentation.policy()} (${presentation.state()}). Choose Auto, Expanded, Compact or Hidden.`} value={presentation.policy()} onChange={event => presentation.set(event.currentTarget.value as AnnotationBarPolicy)}>
      <For each={annotationBarPolicies}>{value => <option value={value}>{value[0].toUpperCase() + value.slice(1)}</option>}</For>
    </select></Show>
  </nav>;
}
