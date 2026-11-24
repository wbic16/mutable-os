import { dispatchEditorGlobals } from '../input/editor-global-input';
import { editorInputBoundary } from '../runtime/editor-input';
import { documentFormats, type DocumentFormat } from "../features/document-formats/model";
import { SystemSubmenu } from "./codex-system-bar";
import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import type { WorkspaceSession } from "../application/workspace-session";
import { workspaceOpen } from "../application/workspace-open";
import type { PlacementKey } from "../block-tree/types";
import type { DocumentLocation } from "../reactive-editor/persistence";
import { DocumentBrowser } from "./document-browser";
import { DocumentDialog } from "./document-dialog";
import {createDocumentSave} from '../application/document-save';
import {nativeDocumentSession} from '../persistence/native-session';
import {useCurrentCavern} from '../application/cavern-startup';

/** One browser/request lifetime for the current canonical workspace. */
export function createWorkspaceOpenControls(session: WorkspaceSession, available: () => boolean) {
  const actions = workspaceOpen(session);
  const [dialog, setDialog] = createSignal<"document" | "image">();
  const [busy, setBusy] = createSignal(false), [error, setError] = createSignal("");
  const [saveNotice, setSaveNotice] = createSignal('');
  const [url, setUrl] = createSignal("");
  const lifetime = new AbortController();
  const cavern=useCurrentCavern();
  const documentSaver=createDocumentSave(session.editor,{guard:()=>{lifetime.signal.throwIfAborted();},vault:async()=>{
    const current=cavern?.current(),root=current?'.':await nativeDocumentSession(session.editor).defaultVault();
    return root?{root,check:()=>{if(cavern?.current()!==current)throw Error('The active Vault changed before Save.');}}:undefined;
  }});
  onCleanup(() => lifetime.abort());
  const enabled = () => available() && !busy() && !dialog() && !(session.windowManager ? session.windowManager.lifecycle.workspaceBlocked : document.querySelector('[role="dialog"]'));
  const open = (kind: "document" | "image") => { if (enabled()) { setError(""); setUrl(""); setDialog(kind); } };
  const finish = (placement: PlacementKey) => {
    setDialog(undefined); setError("");
    queueMicrotask(() => { if (!lifetime.signal.aborted) actions.focus(placement); });
  };
  const canOpenTei = () => enabled() && session.editor.features.documentInterchange && session.editor.features.teiImport && !session.editor.interchange.busy();
  const openTei = () => {
    if (!canOpenTei()) return;
    session.editor.interchange.pickTei({ current: () => !lifetime.signal.aborted && available(), open: id => finish(actions.importedDocument(id)) });
  };
  onCleanup(session.editor.commandRegistry.register({ id: 'document.openTeiXml', label: 'Open TEI XML…', canExecute: canOpenTei, execute: openTei }, 'workspace-open'));
  const create = (format: DocumentFormat = "page") => {
    if (!enabled()) return;
    try { finish(actions.newDocument(format)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const choose = async (location: DocumentLocation) => {
    if (busy()) return false;
    setBusy(true); setError("");
    const request = new AbortController(), abort = () => request.abort();
    lifetime.signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, 20000);
    try {
      const placement = await actions.serverDocument(location, request.signal);
      if (lifetime.signal.aborted) return false;
      finish(placement); return true;
    } catch (e) {
      if (!lifetime.signal.aborted) setError(request.signal.aborted ? "Loading timed out. Please try again." : e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      clearTimeout(timeout); lifetime.signal.removeEventListener("abort", abort);
      if (!lifetime.signal.aborted) setBusy(false);
    }
  };
  const close = () => { if (!busy()) { setDialog(undefined); setError(""); } };
  onCleanup(session.editor.commandRegistry.register({ id: "document.open", label: "Open server Document", canExecute: enabled, execute: () => open("document") }, "workspace-open"));
  const save = async (key: string) => {
    if (busy()) return;
    setBusy(true); setError(''); setSaveNotice('');
    try { const message = await actions.saveDocument(key,id=>documentSaver.save(id)); if (!lifetime.signal.aborted) setSaveNotice(message); }
    catch (error) { if (!lifetime.signal.aborted) setError(error instanceof Error ? error.message : String(error)); }
    finally { if (!lifetime.signal.aborted) setBusy(false); }
  };
  onCleanup(session.editor.commandRegistry.register({ id: 'document.save', label: 'Save Document', canExecute: context => !busy() && actions.canSaveDocument(context.targetKey), execute: context => save(context.targetKey) }, 'workspace-open'));
  onMount(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const boundary = editorInputBoundary(event);
      if (boundary) {
        dispatchEditorGlobals(event, session.editor.bindings, id => {
          if (id === 'document.save') { void save(boundary.nodeKey); return true; }
          if (id === 'document.open') { open('document'); return true; }
          return false;
        }, action => action.id === 'document.save' ? !busy() && actions.canSaveDocument(boundary.nodeKey) : action.id === 'document.open' && enabled());
        return;
      }
      const focused = session.editor.focus.state.focusedKey;
      if (!event.isComposing && !event.altKey && !event.shiftKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && focused && actions.canSaveDocument(focused)) {
        event.preventDefault(); event.stopImmediatePropagation(); void save(focused); return;
      }
      if (!event.isComposing && !event.altKey && !event.shiftKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o" && enabled()) {
        event.preventDefault(); open("document");
      }
    };
    document.addEventListener("keydown", keydown, true);
    onCleanup(() => document.removeEventListener("keydown", keydown, true));
  });
  return {
    Buttons: (props: { menu?: boolean }) => <>
      <button type="button" role={props.menu ? "menuitem" : undefined} disabled={!available() || busy()} onClick={() => create()}>New Document</button>
      <Show when={session.editor.features.documentFormats}>
        <Show when={props.menu} fallback={
          <label class="document-format-picker">Format
            <select aria-label="New Document format" value="" disabled={!available() || busy()} onChange={event => {
              const format = event.currentTarget.value as DocumentFormat;
              if (format) create(format);
              event.currentTarget.value = "";
            }}>
              <option value="">Create…</option>
              <For each={documentFormats}>{item => <option value={item.id}>{item.label}</option>}</For>
            </select>
          </label>
        }>
          <SystemSubmenu label="New Document in Format">
            <For each={documentFormats}>{item =>
              <button type="button" role="menuitem" disabled={!available() || busy()} onClick={() => create(item.id)}>
                {item.label}{item.id === "framed" ? " — Illuminated Manuscript" : ""}
              </button>
            }</For>
          </SystemSubmenu>
        </Show>
      </Show>
      <button type="button" role={props.menu ? "menuitem" : undefined} disabled={!available() || busy()} onClick={() => open("document")}>Open Document from Server…</button>
      <Show when={session.editor.features.documentInterchange && session.editor.features.teiImport}><button type="button" role={props.menu ? "menuitem" : undefined} disabled={!available() || busy() || session.editor.interchange.busy()} onClick={openTei}>Open TEI XML…</button></Show>
      <button type="button" role={props.menu ? "menuitem" : undefined} disabled={!available() || busy()} onClick={() => open("image")}>Open Image…</button>
    </>,
    Dialogs: () => <>
      <documentSaver.Dialogs/>
      <Show when={dialog() === "document"}><DocumentBrowser mode="open" busy={busy()} error={error()} onChoose={choose} onClose={close} /></Show>
      <Show when={dialog() === "image"}><DocumentDialog title="Open image" onClose={close} compact>
        <form onSubmit={event => { event.preventDefault(); try { finish(actions.image(url())); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}>
          <label>Image URL<input data-autofocus aria-label="Image URL" value={url()} onInput={e => setUrl(e.currentTarget.value)} placeholder="https://…" /></label>
          <Show when={error()}><p class="document-dialog__error" role="alert">{error()}</p></Show>
          <div class="document-dialog__footer"><button type="button" onClick={close}>Cancel</button><button type="submit" disabled={!url().trim()}>Open</button></div>
        </form>
      </DocumentDialog></Show>
      <Show when={!dialog() && error()}><aside class="workspace-demo__workspace-notice" role="alert">{error()}</aside></Show>
      <Show when={!dialog() && saveNotice()}><aside class="workspace-demo__workspace-notice" role="status">{saveNotice()}</aside></Show>
    </>,
  };
}
