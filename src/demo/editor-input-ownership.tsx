import { createEffect, createSignal, onCleanup, onMount, Show, untrack } from 'solid-js';
import { EditorState } from '@codemirror/state';
import { EditorView, drawSelection, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { openSearchPanel, search, searchKeymap } from '@codemirror/search';
import { javascript } from '@codemirror/lang-javascript';
import type { BlockViewProps } from '../block-tree/types';
import { useReactiveView } from '../reactive-editor/context';
import { WorkspaceSession } from '../application/workspace-session';
import { WorkspacePresentationView } from '../application/workspace-presentation-view';
import { materializeLocalWorkspace } from '../reactive-editor/workspace-manifest';
import { documentApplicationPorts } from '../application/document-application-ports';
import { nativeDocumentSession } from '../persistence/native-session';
import { mountCodeMirrorInput } from '../input/code-mirror-input';
import { affiliateEditorInput, currentEditorInput } from '../runtime/editor-input';
import { chord, keyboard } from '../input/bindings';
import type { ReactiveEditorConfiguration } from '../configuration';
import './workspace-demo.css';

const type = 'input-ownership-demo-block';

/** Removable qualification route; no standoff persistence or production block registration. */
export default function EditorInputOwnershipDemo(props: { configuration?: ReactiveEditorConfiguration }) {
  const session = new WorkspaceSession(materializeLocalWorkspace({ type: 'workspace-block', children: [
    { type: 'workspace-object-bank-block', children: [{ id: 'input-demo-document', type: 'document-block', metadata: { title: 'Input ownership prototype' }, children: [
      { id: 'input-before', type: 'standoff-editor-block', text: 'Mutable paragraph before CodeMirror. Arrow right at its end enters the code editor.' },
      { id: 'input-code-a', type, text: 'const first = 1;\nconsole.log(first);' },
      { id: 'input-code-b', type, text: 'const second = 2;\nconsole.log(second);' },
      { id: 'input-after', type: 'standoff-editor-block', text: 'Mutable paragraph after CodeMirror.' },
    ] }] },
  ] }), { ...props.configuration, features: { ...props.configuration?.features, nativeKnowledge: false, sqliteKnowledge: false, flintProbe: false, flintSpatialGraph: false } });
  const editor = session.editor;
  const views = new Map<string, { view: EditorView; key: string; remount(): void }>();
  const [invocations, setInvocations] = createSignal(0);
  const [notice, setNotice] = createSignal('F8 invokes a Mutable command; Ctrl-; then 8 invokes the same command.');
  let unprotect: (() => void) | undefined;
  const native = nativeDocumentSession(editor);
  // The fixture does not discover or index the user's default vault on launch.
  if (native) native.defaultVault = async () => undefined;
  const application = () => documentApplicationPorts(editor).ports().find(port => port.applicationId === 'flint')?.application;
  const save = () => {
    const files = application()?.files;
    if (!files) throw new Error('Open the prototype Document in Flint before saving');
    return files.save();
  };
  editor.bindings.register({ id: 'inputOwnership.inspect', name: 'Prototype command', description: 'Invoke an applicable Mutable command from native input.', category: 'Prototype', tags: [], scope: 'editor', defaults: [keyboard('F8'), chord(keyboard(';', 'Ctrl'), keyboard('8'))], handler: context => context.run('inputOwnership.inspect') });
  editor.commandRegistry.register({ id: 'inputOwnership.inspect', label: 'Prototype command', canExecute: context => editor.node(context.targetKey)?.viewType === type, execute: () => { setInvocations(n => n + 1); } });
  editor.commandRegistry.register({ id: 'document.save', label: 'Save active Document', canExecute: () => !!application()?.files, execute: () => save() });

  function CodeView(block: BlockViewProps) {
    const { projection } = useReactiveView();
    const node = () => projection.state.nodes[block.nodeKey];
    const id = String(node().payload.id);
    const [generation, setGeneration] = createSignal(1);
    function Surface() {
      let root!: HTMLDivElement;
      let view: EditorView | undefined;
      let input: ReturnType<typeof mountCodeMirrorInput> | undefined;
      let applying = false;
      let composing = false;
      let compositionTimer: ReturnType<typeof setTimeout> | undefined;
      const restoreText = (text: string) => {
        if (!view || text === view.state.doc.toString()) return;
        applying = true;
        try { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, filter: false }); }
        finally { applying = false; }
      };
      const rollback = () => queueMicrotask(() => {
        if (input && editor.mounts.get(block.nodeKey) === input.handle) restoreText(String(node().payload.text ?? ''));
      });
      const publishText = () => {
        if (!view || applying) return;
        // Ordinary payload storage only; provisional IME changes remain native.
        if (!editor.canEditText(block.nodeKey)) { rollback(); return; }
        try { editor.commands.setPayloadField(block.nodeKey, 'text', view.state.doc.toString(), 'Edit prototype code'); }
        catch (error) { setNotice(String(error)); rollback(); }
      };
      let closePopup: (() => void) | undefined;
      const popup = () => {
        closePopup?.();
        const panel = document.createElement('div'); panel.dataset.inputOwnershipPopup = id;
        panel.style.cssText = 'position:fixed;top:100px;right:30px;z-index:2147483647;background:white;color:black;padding:20px;border:1px solid #777';
        const field = document.createElement('input'); field.placeholder = 'Local popup input'; field.setAttribute('aria-label', 'Local popup input');
        const close = document.createElement('button'); close.textContent = 'Close popup';
        panel.append(field, close); document.body.append(panel);
        const release = affiliateEditorInput(input!.handle, panel);
        closePopup = () => { release(true); panel.remove(); closePopup = undefined; };
        close.onclick = () => closePopup?.();
        panel.onkeydown = event => { if (event.key === 'Escape') { event.preventDefault(); closePopup?.(); } };
        field.focus();
      };
      onMount(() => {
        view = new EditorView({ parent: root, state: EditorState.create({ doc: String(node().payload.text ?? ''), extensions: [
          lineNumbers(), drawSelection(), javascript(), search(),
          autocompletion({ override: [context => { const word = context.matchBefore(/\w*/); return word && (word.text || context.explicit) ? { from: word.from, options: [{ label: 'prototypeValue', type: 'variable' }, { label: 'prototypeOther', type: 'variable' }] } : null; }] }),
          keymap.of([...completionKeymap, ...searchKeymap, indentWithTab, ...defaultKeymap]),
          EditorView.lineWrapping,
          EditorState.allowMultipleSelections.of(true),
          EditorView.domEventHandlers({ contextmenu: () => { popup(); return true; } }),
          EditorView.domEventObservers({
            compositionstart() { clearTimeout(compositionTimer); composing = true; },
            compositionend() {
              // Let the SDK receive final input after compositionend first.
              compositionTimer = setTimeout(() => { composing = false; publishText(); }, 0);
            },
          }),
          EditorView.updateListener.of(update => {
            if (update.docChanged && !composing) publishText();
          }),
        ] }) });
        input = mountCodeMirrorInput({ editor, nodeKey: block.nodeKey, root, view,
          actions: ['inputOwnership.inspect', 'document.save', 'history.undo', 'history.redo', 'menu.open'],
          canRun: action => ['history.undo', 'history.redo', 'menu.open'].includes(action) || editor.commandRegistry.canExecute(action, { targetKey: block.nodeKey, args: undefined }),
          run: action => {
            if (action === 'history.undo') editor.repository.undo();
            else if (action === 'history.redo') editor.repository.redo();
            else if (action === 'menu.open') popup();
            else Promise.resolve(editor.commandRegistry.execute(action, { targetKey: block.nodeKey, args: undefined })).catch(error => setNotice(String(error)));
            return true;
          }, error: error => setNotice(String(error)),
        });
        views.set(id, { view, key: block.nodeKey, remount: () => setGeneration(n => n + 1) });
        createEffect(() => { editor.canEditText(block.nodeKey); untrack(() => input?.syncPermissions()); });
        createEffect(() => {
          const text = String(node()?.payload.text ?? '');
          // History/external source changes are separate from input ownership.
          untrack(() => restoreText(text));
        });
      });
      onCleanup(() => {
        clearTimeout(compositionTimer);
        input?.dispose(); // invalidate before a popup can restore a stale view
        closePopup?.(); views.delete(id); view?.destroy();
      });
      return <div ref={root} data-runtime-key={block.nodeKey} data-code-demo={id} style={{ border: '1px solid #888', margin: '12px 0', 'min-height': '90px' }} />;
    }
    return <Show when={generation()} keyed>{(_generation: number) => <Surface />}</Show>;
  }
  editor.registry.register({ type, view: CodeView, capabilities: ['self-managed-editor'] });
  const remap = () => { editor.bindings.assign('inputOwnership.inspect', [keyboard('F9'), chord(keyboard(';', 'Ctrl'), keyboard('8'))]); setNotice('The Mutable command now uses F9 (and Ctrl-; then 8). F8 falls through.'); };
  const protect = () => {
    if (unprotect) { unprotect(); unprotect = undefined; return; }
    const key = views.get('input-code-a')?.key;
    if (key) unprotect = editor.textProtection.protect(editor.node(key)!.contentKey);
  };
  onMount(async () => {
    onCleanup(editor.installGateway(document));
    await editor.commandRegistry.execute('flint.open', { targetKey: session.projection.state.rootKey, args: undefined });
    const window = Object.values(session.projection.state.nodes).find(node => node.viewType === 'window-block');
    if (window) editor.commands.setPayloadField(window.key, 'metadata', { ...window.payload.metadata as object, size: { w: 1050, h: 730 }, position: { x: 20, y: 130 } });
  });
  const proof = { editor, session, views, application, native, invocations, remap, protect, owner: () => currentEditorInput(document)?.nodeKey, search: () => { const entry = views.get('input-code-a'); if (entry) openSearchPanel(entry.view); } };
  if (import.meta.env.DEV) (window as any).__inputOwnershipDemo = proof;
  onCleanup(() => { unprotect?.(); session.dispose(); if ((window as any).__inputOwnershipDemo === proof) delete (window as any).__inputOwnershipDemo; });
  return <main class="workspace-demo">
    <header style={{ position: 'relative', 'z-index': 1000, padding: '12px', background: 'white', color: '#222' }}>
      <strong>Editor input ownership prototype</strong> · <span data-command-count>{invocations()} Mutable command calls</span>
      <p>{notice()} Local Find: Mod-F. Context menu: right-click. Tab indents; Escape then Tab uses CodeMirror's native focus escape.</p>
      <button onClick={remap}>Remap command to F9</button> <button onClick={protect}>Toggle first code read-only</button> <button onClick={() => views.get('input-code-a')?.remount()}>Remount first code editor</button>
      <span data-ownership-outside> Outside nonfocusable area</span>
    </header>
    <WorkspacePresentationView session={session} />
  </main>;
}
