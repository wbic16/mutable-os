import type { BindingRegistry, BindingAction, BindingContext } from './bindings';
import { editorInputBoundary } from '../runtime/editor-input';

/** Use the host's existing Save operation; SDK content resolves shared chords.
 * Affiliated native fields have only the global context, so they may resolve
 * global chords themselves without exposing editor-local commands. */
export function dispatchEditorSave(event: KeyboardEvent, bindings: BindingRegistry, save: () => void): boolean {
  const run = (id: string) => { if (id !== 'document.save') return false; save(); return true; };
  const eligible = (action: { id: string }) => action.id === 'document.save';
  return dispatchEditorGlobals(event, bindings, run, eligible);
}

export function dispatchEditorGlobals(event: KeyboardEvent, bindings: BindingRegistry, run: BindingContext['run'], eligible: (action: BindingAction) => boolean): boolean {
  const boundary = editorInputBoundary(event);
  if (!boundary) return false;
  const content = boundary.handle.editorInput?.readContext() === 'content' &&
    event.target instanceof Node && boundary.handle.focusElement.contains(event.target);
  return content ? bindings.dispatchReserved(event, ['workspace'], run, eligible) :
    bindings.dispatch(event, ['workspace'], run, eligible);
}
