import { For, createMemo, lazy, onCleanup, onMount } from "solid-js";
import type { ExistingBlockDto } from "./block-tree/types";
import { ReactiveEditor } from "./reactive-editor/editor";
import { ReactiveTreeView } from "./rendering/reactive-tree-view";
import { registerApplicationViews } from "./application/features";
import { OverlayLayer } from "./rendering/overlay-layer";
import { WorkspaceDemo } from "./demo/workspace-demo";
import { StandoffEffectsDemo } from "./demo/standoff-effects-demo";
import { TextSuperpositionDemo } from "./demo/text-superposition-demo";
import { createInitialWorkspace } from "./application/initial-workspace";
import { resolveFeatureFlags, type ReactiveEditorConfiguration } from "./configuration";
import { CavernStartup } from "./application/cavern-startup";

const pilotDocument: ExistingBlockDto = {
  id: "reactive-pilot-document",
  type: "document-block",
  metadata: { name: "PlainText reactive pilot" },
  blockProperties: [],
  children: [
    {
      id: "plain-1",
      type: "plain-text-block",
      text: "Editable notes",
      metadata: { label: "Shared notes" },
      blockProperties: [],
      children: [],
      futureField: { preserved: true },
    },
    {
      id: "plain-2",
      type: "plain-text-block",
      text: "This second Block can be reordered or deleted.",
      metadata: {},
      blockProperties: [],
      children: [],
    },
    {
      id: "standoff-1",
      type: "standoff-editor-block",
      text: "Solid-rendered CellBlocks with overlapping annotations.",
      metadata: {},
      blockProperties: [],
      standoffProperties: [
        { id: "bold-1", type: "style/bold", start: 0, end: 13 },
        { id: "highlight-1", type: "style/highlighter", start: 6, end: 28 },
        { id: "underline-1", type: "style/rainbow", start: 18, end: 48 },
      ],
      children: [],
    },
  ],
};

function createPilotEditor() {
  const editor = new ReactiveEditor(pilotDocument);
  registerApplicationViews(editor);
  return editor;
}

export function PilotApp() {
  const editor = createPilotEditor();
  const primary = editor.createView();
  const linked = editor.createView();
  const encoded = createMemo(() => {
    editor.repository.state.revision;
    return JSON.stringify(editor.encodeDocument(), null, 2);
  });

  onMount(() => editor.installGateway(document));
  onCleanup(() => editor.dispose());

  const addBefore = () => {
    const anchor = primary.state.nodes[primary.state.rootKey].children[0];
    const placementKey = editor.commands.insert(
      {
        type: "plain-text-block",
        text: "A newly inserted PlainText Block",
        metadata: {},
        blockProperties: [],
        children: [],
      },
      { kind: "before", anchorKey: anchor },
    );
    const node = primary.nodeForPlacement(placementKey);
    if (node) editor.focus.request(node.key, { caret: "end", reason: "inserted" });
  };

  const moveFirstToEnd = () => {
    const children = primary.state.nodes[primary.state.rootKey].children;
    if (children.length < 2) return;
    editor.commands.move(children[0], { kind: "after", anchorKey: children.at(-1)! });
  };

  const removeFocused = () => {
    const key = editor.focus.state.focusedKey;
    if (!key || key === primary.state.rootKey || key === linked.state.rootKey) return;
    const fallback = editor.focusFallback(key);
    editor.focus.clearRemoved(key);
    editor.commands.remove(key);
    if (fallback) queueMicrotask(() => editor.focus.request(fallback, { caret: "start" }));
  };

  return (
    <main class="reactive-pilot">
      <header class="reactive-pilot__header">
        <a href={import.meta.env.BASE_URL}>Open workspace demo</a> · <a href={`${import.meta.env.BASE_URL}effects`}>Visual effects demo</a>
        <p class="reactive-pilot__eyebrow">speedy-ts reactive reconstruction</p>
        <h1>Solid-owned BlockTree reconstruction</h1>
        <p>
          Both panes project the same canonical PlainText and Standoff content. Their DOM
          mounts, focus, caret, selection, and annotation geometry remain view-local.
        </p>
      </header>

      <nav class="reactive-pilot__toolbar" aria-label="Tree commands">
        <button type="button" onClick={addBefore}>Insert before</button>
        <button type="button" onClick={moveFirstToEnd}>Move first to end</button>
        <button type="button" onClick={removeFocused}>Remove focused</button>
        <button type="button" onClick={() => editor.repository.undo()}>Undo</button>
        <button type="button" onClick={() => editor.repository.redo()}>Redo</button>
        <For each={editor.annotationUI.list()}>{item => <button type="button" onClick={() => item.apply([], editor.focus.state.focusedKey ?? primary.state.rootKey)}>{item.label}</button>}</For>
        <span>revision {editor.repository.state.revision}</span>
      </nav>

      <div class="reactive-pilot__views">
        <section class="reactive-pilot__pane" aria-labelledby="primary-view-heading">
          <h2 id="primary-view-heading">Primary view</h2>
          <ReactiveTreeView editor={editor} projection={primary} />
        </section>
        <section class="reactive-pilot__pane" aria-labelledby="linked-view-heading">
          <h2 id="linked-view-heading">Linked view</h2>
          <ReactiveTreeView editor={editor} projection={linked} />
        </section>
      </div>

      <details class="reactive-pilot__json">
        <summary>Legacy-compatible JSON projection</summary>
        <pre>{encoded()}</pre>
      </details>
      <OverlayLayer editor={editor} />
    </main>
  );
}

export default function App(props: { configuration?: ReactiveEditorConfiguration } = {}) {
  const route = window.location.pathname.replace(/\/+$/, "");
  const features = resolveFeatureFlags(props.configuration);
  if (import.meta.env.DEV && route === `${import.meta.env.BASE_URL}standoff-code-mirror`) {
    if(!features.standoffCodeMirror||!features.editorInputOwnership)return <main>Annotated CodeMirror is disabled.</main>;
    const Demo=lazy(()=>import('./demo/standoff-code-mirror'));return <Demo configuration={props.configuration}/>;
  }
  if (import.meta.env.DEV && route === `${import.meta.env.BASE_URL}input-ownership`) {
    if (!features.editorInputOwnership) return <main>Editor input ownership is disabled.</main>;
    const Prototype = lazy(() => import('./demo/editor-input-ownership'));
    return <Prototype configuration={props.configuration} />;
  }
  if (route === `${import.meta.env.BASE_URL}phosphor`) {
    if (!features.phosphor) return <main>Phosphor is disabled.</main>;
    const Phosphor = lazy(() => import("./features/phosphor/demo"));
    return <Phosphor configuration={props.configuration} />;
  }
  // Historical study URLs now launch the same production Flint in Mutable OS.
  const launchFlint = ['flint', 'flint-material', 'flint-material-three'].some(path => route === `${import.meta.env.BASE_URL}${path}`);
  if (import.meta.env.DEV && import.meta.env.VITE_CANVAS_MILESTONE_A === "1" && route === `${import.meta.env.BASE_URL}scaled-window-prototype`) {
    const Prototype = lazy(() => import("./demo/scaled-window-prototype"));
    return <Prototype />;
  }
  if (route === `${import.meta.env.BASE_URL}effects`) return <StandoffEffectsDemo />;
  if (route === `${import.meta.env.BASE_URL}superposition`) return <TextSuperpositionDemo />;
  if (route === `${import.meta.env.BASE_URL}pilot`) return <PilotApp />;
  // Accepted application capability; hosts can still explicitly disable it.
  const configuration = { features: { canvasWorkspace: import.meta.env.VITE_CANVAS_WORKSPACE !== "0", spatialWorkspace: import.meta.env.VITE_SPATIAL_WORKSPACE === "1", ...props.configuration?.features } };
  const workspace = () => <WorkspaceDemo configuration={configuration} launchFlint={launchFlint}
    initialWorkspace={new URLSearchParams(window.location.search).get("demo") === "1" ? undefined : createInitialWorkspace()} />;
  return features.cavernStartup ? <CavernStartup>{() => workspace()}</CavernStartup> : workspace();
}
