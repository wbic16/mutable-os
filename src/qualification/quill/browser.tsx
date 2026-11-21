import { createSignal, For, onCleanup, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { WorkspaceSession } from '../../application/workspace-session';
import { WorkspacePresentationView } from '../../application/workspace-presentation-view';
import { ReactiveTreeView } from '../../rendering/reactive-tree-view';
import { ChildBlocks } from '../../rendering/block-outlet';
import { useReactiveView } from '../../reactive-editor/context';
import { ReactiveEditor } from '../../reactive-editor/editor';
import { materializeLocalWorkspace } from '../../reactive-editor/workspace-manifest';
import { captureNative, nativeBytes, nativeText, admitNative } from '../../persistence/native-resource';
import { FlowLayout, type Layout } from './layout';
import { composition, convert, copyInto, fixture, invoke, record, sourceOf, textOf, QUILL_TYPE, qualificationFlags, type Invocation, type Composition } from './model';
import '../../index.css';
import '../../demo/workspace-demo.css';
import './style.css';

qualificationFlags.quill = new URLSearchParams(location.search).get('quill') !== 'off';
const session = new WorkspaceSession(materializeLocalWorkspace({ type: 'workspace-block', children: [] }), {
  features: { quill: false, nativeKnowledge: false, sqliteKnowledge: false, nativeDocumentPersistence: false, flintProbe: false, flintMaterialChrome: false, flintLogo: false },
});
const editor = session.editor;
const bank = editor.commands.insert({ type: 'workspace-object-bank-block', children: [] }, { kind: 'at', parentKey: session.projection.state.rootKey, index: 0 });
const initial = new ReactiveEditor(fixture());
admitNative(editor.repository, nativeBytes(captureNative(initial.repository.readState(), 'quill-document')), record(editor, bank).key);
initial.dispose();
const documentPlacement = editor.commands.childrenOf(bank)[0];
const sourcePlacement = editor.commands.childrenOf(documentPlacement)[0];
const nativeView = editor.createView('quill-native-host', documentPlacement);
const [active, setActive] = createSignal<{ invocation: Invocation; wrapper?: string }>();
const [hostMode, setHostMode] = createSignal<'flint' | 'native-editor'>('flint');
const [notice, setNotice] = createSignal('In-memory investigation. No files are written.');
const timings: number[] = [];
const engines = new Set<FlowLayout>();
let lastLayout: Layout | undefined;
let savedInk: string | undefined;
function sourceNode() {
  const views = hostMode() === 'native-editor' ? [nativeView] : [...editor.projections.values()].filter(v => v !== session.projection && v !== nativeView);
  return views.flatMap(v => [...v.occurrenceKeys()].map(k => v.node(k)!)).find(n => n.placementKey === sourcePlacement && !n.editingInlineOwner && editor.mounts.get(n.key));
}
function open() {
  const node = sourceNode(); if (!node) throw Error('Native source is not mounted');
  const invocation = invoke(editor, node.key, hostMode(), 'quill-document');
  const parent = editor.repository.locationOf(sourcePlacement);
  const c = parent && editor.repository.readState().contents[parent.ownerContentKey];
  const wrapper = c?.viewType === QUILL_TYPE ? [...editor.repository.ownedPlacementKeys(c.key)][0] : undefined;
  setActive({ invocation, wrapper });
}
function confirm() {
  const current = active()!; setActive({ ...current, wrapper: convert(editor, current.invocation) });
}
function close() {
  const selection = active()?.invocation.selection; setActive(undefined);
  requestAnimationFrame(() => { const node = sourceNode(); if (!node) return; const mount = editor.mounts.get(node.key); mount?.focus(); if (selection) mount?.restoreInlineSelection?.(selection); });
}
function update(field: 'swell' | 'amplitude' | 'opacity', value: number) {
  const wrapper = active()?.wrapper; if (!wrapper) return;
  const config = record(editor, wrapper).payload.quill as Composition;
  editor.commands.setPayloadField(wrapper, 'quill', field === 'amplitude'
    ? { ...config, paths: config.paths.map(p => ({ ...p, amplitude: value })) }
    : { ...config, [field]: value }, `Quill qualification: ${field}`);
}
function Canvas(props: { wrapper: string }) {
  const source = sourceOf(editor, props.wrapper), sourceKey = record(editor, source).key, wrapperKey = record(editor, props.wrapper).key;
  const context = document.createElement('canvas').getContext('2d')!;
  context.font = '100px Georgia'; context.fontKerning = 'none';
  const engine = new FlowLayout(text => context.measureText(text).width); engines.add(engine);
  const [output, setOutput] = createSignal<Layout>({ placements: [], overflow: [], diagnostics: [] });
  const [config, setConfig] = createSignal(structuredClone(record(editor, props.wrapper).payload.quill as Composition));
  const [annotations, setAnnotations] = createSignal<any[]>([]);
  let frame = 0, fittedRevision = -1, fittedGeometry = '';
  const refresh = () => {
    frame = 0; const c = record(editor, props.wrapper).payload.quill as Composition;
    setConfig(structuredClone(c));
    const sourceRecord = record(editor, source), geometryKey = JSON.stringify({ ...c, opacity: 1 });
    setAnnotations(structuredClone(sourceRecord.payload.standoffProperties as any[] ?? []));
    // Opacity is a presentation-only change. It does not even invoke the fitter.
    if (geometryKey === fittedGeometry && sourceRecord.inlineRevision === fittedRevision) return;
    const start = performance.now(), layout = engine.layout(textOf(editor, source), c);
    timings.push(performance.now() - start); if (timings.length > 1000) timings.shift();
    fittedGeometry = geometryKey; fittedRevision = sourceRecord.inlineRevision;
    lastLayout = layout; setOutput(layout);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(refresh); };
  const unsubscribe = editor.repository.subscribeChanges(change => {
    if (change.previousContents.has(sourceKey) || change.previousContents.has(wrapperKey)) schedule();
  });
  const fontReady = () => { engine.invalidateFont(); fittedGeometry = ''; schedule(); };
  document.fonts.addEventListener('loadingdone', fontReady); schedule();
  onCleanup(() => { cancelAnimationFrame(frame); unsubscribe(); engines.delete(engine); document.fonts.removeEventListener('loadingdone', fontReady); });
  const select = (start: number, end: number) => {
    const node = sourceNode(); if (!node) return;
    const mount = editor.mounts.get(node.key); mount?.focus(); mount?.restoreInlineSelection?.({ anchor: start, head: end });
  };
  return <div class="quill-canvas">
    <svg viewBox="-30 0 780 440" role="img" aria-label="Three linked wave paths with canonical text">
      <For each={config().paths}>{p => <path d={engine.wave(p).path()} fill="none" stroke="var(--quill-guide)" stroke-dasharray="3 6" />}</For>
      <g opacity={config().opacity}><For each={output().placements}>{p => <text text-anchor="middle" font-family="Georgia" font-kerning="none" font-variant-ligatures="none" font-size={String(p.size)}
        transform={`translate(${p.x} ${p.y}) rotate(${p.angle})`} data-start={p.start} data-end={p.end}
        fill={annotations().some(a => a.type === 'codex/entity-reference' && a.start < p.end && a.end >= p.start) ? 'var(--quill-accent)' : 'var(--quill-art-ink)'}
        onPointerDown={event => { event.preventDefault(); select(p.start, p.end); }}>{p.text}</text>}</For></g>
    </svg>
    <p role="status">{output().overflow.length ? `${output().overflow.length} graphemes overflow — source retained.` : 'All text fits.'} {output().diagnostics.join(' ')}</p>
  </div>;
}
function CompositionView(props: { nodeKey: string }) {
  const { projection } = useReactiveView();
  return <section class="quill-inline"><Canvas wrapper={projection.node(props.nodeKey)!.placementKey} />
    <details open><summary>Editable native text</summary><ChildBlocks parentKey={props.nodeKey} /></details>
  </section>;
}
if (qualificationFlags.quill) editor.registry.register({ type: QUILL_TYPE, view: CompositionView, capabilities: ['container', 'selectable'], slots: [{ name: 'content', cardinality: 'many', role: 'content', persistence: 'children', accepts: () => true }] }, 'quill-qualification');
editor.commandRegistry.execute('flint.open', { targetKey: session.projection.state.rootKey, args: undefined });
const win = Object.values(session.projection.state.nodes).find(n => n.viewType === 'window-block')!;
editor.commands.setPayloadField(win.key, 'metadata', { ...win.payload.metadata as object, position: { x: 15, y: 85 }, size: { w: 1390, h: 780 } });

function App() {
  return <><header class="quill-test-header"><strong>Quill · qualification</strong>
    <button onClick={() => setHostMode(hostMode() === 'flint' ? 'native-editor' : 'flint')}>Host: {hostMode()}</button>
    <button disabled={!qualificationFlags.quill} onClick={open}>Edit in Quill</button>
    <span>{notice()}</span></header>
    <Show when={hostMode() === 'flint'} fallback={<main class="quill-native"><ReactiveTreeView editor={editor} projection={nativeView} /></main>}>
      <div class="workspace-demo workspace-demo--canonical"><WorkspacePresentationView session={session} /></div>
    </Show>
    <Show when={active()}>{current => <aside class="quill-studio" aria-label="Quill investigation inspector">
      <header><strong>Q / QUILL</strong><button onClick={close}>Return to {current().invocation.sourceApp === 'flint' ? 'Flint' : 'editor'}</button></header>
      <Show when={current().wrapper} fallback={<><p>Convert this entire paragraph into a composition with its original native text.</p><button onClick={confirm}>Confirm paragraph conversion</button></>}>
        <p>Three linked wave paths</p>
        <label>Amplitude<input aria-label="Wave amplitude" type="range" min="0" max="70" value="24" onChange={e => update('amplitude', +e.currentTarget.value)} /></label>
        <label>Centre swell<input aria-label="Centre swell" type="range" min="0" max="1.5" step=".05" value=".8" onChange={e => update('swell', +e.currentTarget.value)} /></label>
        <label>Opacity<input aria-label="Text opacity" type="range" min=".2" max="1" step=".1" value="1" onChange={e => update('opacity', +e.currentTarget.value)} /></label>
        <button onClick={() => editor.commands.replaceInlineRange(sourcePlacement, 0, 0, 'Listen to the distant wings. ')}>Insert phrase at start</button>
        <button onClick={() => editor.repository.undo()}>Undo</button><button onClick={() => editor.repository.redo()}>Redo</button>
        <button onClick={() => { const destination = editor.commands.insert({ type: 'document-block', id: crypto.randomUUID(), children: [] }, { kind: 'at', parentKey: bank, index: editor.commands.childrenOf(bank).length }); copyInto(editor, current().wrapper!, destination); setNotice('Independent native copy created in a second in-memory Ink document.'); }}>Copy native Block (core probe)</button>
        <button onClick={() => { savedInk = nativeText(captureNative(editor.repository.readState(), 'quill-document')); setNotice('Ink captured in memory for codec inspection. No filesystem save.'); }}>Capture Ink in memory</button>
        <button onClick={() => document.documentElement.classList.toggle('quill-light')}>Light / dark preview</button>
        <p>Type in the native text below the canvas. SVG caret editing, complex shaping and operating-system clipboard admission remain unqualified.</p>
      </Show>
    </aside>}</Show></>;
}
render(() => <App />, document.getElementById('root')!); editor.installGateway(document);
Object.assign(window, { quillProof: { editor, session, nativeView, sourcePlacement, documentPlacement, open, confirm, close, update, sourceNode,
  setHostMode, active, record: (p: string) => record(editor, p), text: () => textOf(editor, sourcePlacement), layout: () => lastLayout,
  timings, counts: () => [...engines].map(e => ({ ...e.counts })), savedInk: () => savedInk,
  benchmark: (iterations = 200) => { const context = document.createElement('canvas').getContext('2d')!; context.font = '100px Georgia'; context.fontKerning = 'none'; const engine = new FlowLayout(t => context.measureText(t).width); const samples: number[] = [];
    for (let i = 0; i < iterations + 20; i++) { const start = performance.now(); engine.layout((i % 2 ? 'Listen to the distant wings. ' : '') + textOf(editor, sourcePlacement), composition()); if (i >= 20) samples.push(performance.now() - start); }
    return { samples, counts: engine.counts }; },
} });
