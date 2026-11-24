import { Compartment, EditorState, Prec, StateEffect } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { completionStatus } from '@codemirror/autocomplete';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { MountHandle } from '../runtime/mounts';
import { currentEditorInput } from '../runtime/editor-input';

const navigation = new Set(['block.left', 'block.right', 'block.up', 'block.down']);
const popupKeys = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Enter', 'Tab', 'Escape']);

/** SDK-specific adapter. Persistence, history and semantic features are supplied by its caller. */
export function mountCodeMirrorInput(options: {
  editor: ReactiveEditor; nodeKey: string; root: HTMLElement; view: EditorView;
  actions?: readonly string[];
  run?(id: string, event: Event): boolean;
  canRun?(id: string): boolean;
  /** Additional occurrence-local permission, e.g. a passive presentation. */
  canEdit?(): boolean;
  error?(error: unknown): void;
}) {
  const { editor, nodeKey, view, root } = options;
  if (!editor.features.editorInputOwnership) throw new Error('Editor input ownership is disabled');
  const contentKey = editor.node(nodeKey)?.contentKey;
  if (!contentKey) throw new Error('Mount requires a live editing occurrence');
  const canEdit = () => !editor.textProtection.isProtected(contentKey) && (options.canEdit?.() ?? true);
  const allowed = new Set(options.actions ?? []);
  const scopes = [...new Set(['editor', ...[...allowed].map(id => editor.bindings.get(id)?.scope).filter((s): s is string => !!s)])];
  const permission = new Compartment(), input = new Compartment();
  let handle: MountHandle;
  let disposed = false;
  const current = () => !disposed && editor.mounts.get(nodeKey) === handle;
  const editing = () => current() && currentEditorInput(root.ownerDocument)?.handle === handle && view.hasFocus;
  const popup = (event: KeyboardEvent) => completionStatus(view.state) === 'active' && popupKeys.has(event.key);
  const boundary = (id: string, event: Event) => {
    if (!navigation.has(id) || !(event instanceof KeyboardEvent) || event.shiftKey || event.isComposing || view.composing || view.compositionStarted || popup(event)) return;
    const { ranges, main } = view.state.selection;
    if (ranges.length !== 1 || !main.empty) return;
    const backwards = id === 'block.left' || id === 'block.up';
    if (main.head !== (backwards ? 0 : view.state.doc.length)) return;
    const destination = editor.adjacentEditable(nodeKey, backwards ? -1 : 1);
    if (!destination || editor.focus.permit?.(destination.key) === false) return;
    return destination;
  };
  const eligible = (id: string, event: Event) => navigation.has(id) ? !!boundary(id, event) :
    allowed.has(id) && (options.canRun?.(id) ?? editor.commandRegistry.canExecute(id, { targetKey: nodeKey, args: undefined }));
  const run = (id: string, event: Event): boolean => {
    if (!eligible(id, event)) return false;
    if (navigation.has(id)) {
      const destination = boundary(id, event)!;
      editor.focus.request(destination.key, { caret: id === 'block.left' ? 'end' : 'start', reason: `navigate-${id}`, valid: () => current() && currentEditorInput(root.ownerDocument)?.handle === handle });
      return true;
    }
    try {
      if (options.run) return options.run(id, event);
      Promise.resolve(editor.commandRegistry.execute(id, { targetKey: nodeKey, args: undefined })).catch(error);
    } catch (failure) { error(failure); }
    return true; // an accepted command never falls through after failure
  };
  const error = (failure: unknown) => options.error ? options.error(failure) : console.error('Embedded editor command failed', failure);
  const dispatch = (event: KeyboardEvent | MouseEvent) => {
    if (!editing() || event.defaultPrevented || view.composing) return false;
    if (event instanceof KeyboardEvent) {
      if (event.isComposing) return false;
      // A complete global shortcut may run while completion is open. Chords still
      // use the one combined registry session below, never a second dispatcher.
      const save = allowed.has('document.save') && editor.bindings.matches('document.save', event);
      if (popup(event) && !save && !editor.bindings.hasPendingChord()) return false;
    }
    return editor.bindings.dispatch(event, scopes, id => run(id, event), action => eligible(action.id, event));
  };
  const nativePermission = () => [EditorState.readOnly.of(!canEdit())];
  const disposeMount = editor.mounts.register(nodeKey, {
    root, focusElement: view.contentDOM, inputPolicy: 'opaque-widget',
    focus: () => view.focus(),
    focusAtBoundary: edge => view.dispatch({ selection: { anchor: edge === 'start' ? 0 : view.state.doc.length }, scrollIntoView: true }),
    captureSelection: () => ({ start: view.state.selection.main.from, end: view.state.selection.main.to, direction: view.state.selection.main.anchor > view.state.selection.main.head ? 'backward' : 'forward' }),
    restoreSelection: selection => view.dispatch({ selection: { anchor: Math.min(selection.direction === 'backward' ? selection.end : selection.start, view.state.doc.length), head: Math.min(selection.direction === 'backward' ? selection.start : selection.end, view.state.doc.length) } }),
    editorInput: {
      ownership: 'self-managed', root: view.dom,
      readContext: () => view.hasFocus ? 'content' : view.dom.contains(view.root.activeElement) ? 'auxiliary' : 'outside',
      onActivate: () => {
        editor.bindings.cancelChord(); editor.crossText.clear(); editor.selectionGestures.reset();
        editor.completionInput?.cancel(); editor.markdownInput.cancel(); editor.setCaret();
        editor.focus.adopt(nodeKey);
      },
      onDeactivate: () => editor.bindings.cancelChord(),
    },
  });
  handle = editor.mounts.get(nodeKey)!;
  view.dispatch({ effects: StateEffect.appendConfig.of([
    permission.of(nativePermission()),
    input.of([
      ViewPlugin.define(() => ({ destroy() { disposed = true; disposeMount(); } })),
      Prec.highest(EditorView.domEventHandlers({ keydown: dispatch, click: dispatch, dblclick: dispatch, contextmenu: dispatch })),
      // Final guard also covers programmatic/native commands before a reactive
      // permission update. Canonical admission remains the persistence guard.
      EditorState.transactionFilter.of(transaction => transaction.docChanged && !canEdit() ? [] : transaction),
    ]),
  ]) });
  return {
    handle,
    syncPermissions: () => { if (current()) view.dispatch({ effects: permission.reconfigure(nativePermission()) }); },
    dispose: () => {
      if (disposed) return;
      disposed = true; disposeMount();
      view.dispatch({ effects: [input.reconfigure([]), permission.reconfigure([])] });
    },
  };
}
