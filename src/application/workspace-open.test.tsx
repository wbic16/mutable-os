// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSession } from "./workspace-session";
import { createInitialWorkspace } from "./initial-workspace";
import { workspaceOpen } from "./workspace-open";
import { materializeLocalWorkspace, createWorkspaceSaveBundle, workspaceContentHash } from "../reactive-editor/workspace-manifest";
import fs from 'node:fs/promises';
import { nativeDocumentSession } from '../persistence/native-session';
import { decodeNative, captureNative, nativeText } from '../persistence/native-resource';
import { createFlintDocumentTabs } from '../features/flint/document-tabs';
import { render } from 'solid-js/web';
import { ReactiveTreeView } from '../rendering/reactive-tree-view';
import { createWorkspaceOpenControls } from '../demo/workspace-open-controls';

const sessions: WorkspaceSession[] = [];
const views: Array<() => void> = [];
afterEach(() => { views.splice(0).forEach(dispose => dispose()); sessions.splice(0).forEach(s => s.dispose()); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const dto = { id: 'doc', type: 'main-list-block', future: { retained: true }, children: [{ id: 'text', type: 'plain-text-block', text: 'Server document' }] };
const location = { folder: '.', filename: 'Notes.json' };
function setup(canvas = false) {
  const session = new WorkspaceSession(materializeLocalWorkspace(createInitialWorkspace()), { features: { canvasWorkspace: true, spatialWorkspace: true, threeDObjects: false } });
  sessions.push(session); if (canvas) session.selectPresentation('canvas');
  return { session, editor: session.editor, actions: workspaceOpen(session), signal: new AbortController().signal };
}
function server(value = dto) {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ Success: true, Data: { document: value } }), { headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch); return fetch;
}
describe('open workspace content', () => {
  it.each([
    ['Notes.ink', false, 'desktop'], ['Notes.mutable.json', false, 'desktop'],
    ['Notes.ink', true, 'canvas'], ['Notes.mutable.json', true, 'spatial'],
  ] as const)('opens %s in a DocumentWindow (existing bank=%s, presentation=%s)', async (filename, existingBank, presentation) => {
    const native = await fs.readFile('artifacts/flint-b1.2/rich.mutable.json', 'utf8');
    const resource = decodeNative(new TextEncoder().encode(native)), location = { folder: '.', filename };
    let saved: any;
    const fetch = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/save')) {
        saved = JSON.parse(options!.body as string);
        return new Response(JSON.stringify({ Success: true, Data: { result: { phase: 'saved', generation: saved.generation.generation }, baseline: { nativeHash: 'new', markdownHash: 'projection', generation: saved.generation.generation } } }));
      }
      return new Response(JSON.stringify({ Success: true, Data: { kind: 'native', resourceId: resource.resourceId, native, baseline: { nativeHash: 'saved', markdownHash: null, generation: null } } }));
    });
    vi.stubGlobal('fetch', fetch);
    const { editor, actions, signal } = setup();
    const session = sessions.at(-1)!;
    session.selectPresentation(presentation);
    if (existingBank) editor.commands.insert({ id: 'existing-bank', type: 'workspace-object-bank-block', children: [] }, {
      kind: 'at', parentKey: editor.repository.state.rootPlacementKey, index: 0,
    });
    const placement = await actions.serverDocument(location, signal);
    expect(fetch.mock.calls[0][0]).toBe('/api/native/open');
    expect(nativeDocumentSession(editor).location(resource.resourceId)).toEqual(location);
    expect(nativeText(captureNative(editor.repository.snapshot(), resource.resourceId))).toBe(nativeText(resource));
    const host = editor.repository.state.contents[editor.repository.state.placements[placement].contentKey];
    expect(host.viewType).toBe('document-window-block');
    expect(session.presentation.active()).toBe(presentation);
    if (presentation === 'canvas') expect(session.canvasRoots()).toHaveLength(1);
    if (presentation === 'spatial') expect(session.spatial!.objects().some(o => o.kind === 'document')).toBe(true);
    const text = Object.values(editor.repository.state.contents).find(c => c.inlineKind === 'standoff')!;
    const owner = Object.values(editor.repository.state.placements).find(p => p.contentKey === text.key)!;
    editor.commands.replaceInlineRange(owner.key, 0, text.inlineContent.length, 'Unsaved edit');
    expect(await actions.serverDocument(location, signal)).toBe(placement);
    expect(editor.repository.state.contents[text.key].inlineContent.map(key => editor.repository.state.contents[editor.repository.state.placements[key].contentKey].payload.text).join('')).toBe('Unsaved edit');
    const windowKey = session.projection.nodeForPlacement(placement)!.key;
    const beforeClose = editor.repository.snapshot(), history = vi.fn();
    const stop = editor.repository.subscribeHistoryChanges(history, error=>{throw error;});
    editor.closeView(windowKey);
    expect(editor.viewVisibility.isClosed(placement)).toBe(true);
    expect(editor.repository.snapshot()).toEqual(beforeClose);
    expect(history).not.toHaveBeenCalled();stop();
    expect(await actions.serverDocument(location,signal)).toBe(placement);
    expect(editor.viewVisibility.isClosed(placement)).toBe(false);
    expect(nativeText(captureNative(editor.repository.snapshot(),resource.resourceId))).toContain('Unsaved edit');
    expect(actions.canSaveDocument(windowKey)).toBe(true);
    if (presentation === 'desktop' && filename === 'Notes.ink') {
      const Host = () => {
        const controls = createWorkspaceOpenControls(session, () => true);
        return <><ReactiveTreeView editor={editor} projection={session.projection} /><controls.Dialogs /></>;
      };
      views.push(render(() => <Host />, document.body));
      expect(document.querySelector('.reactive-window--document textarea, .reactive-window--document [contenteditable="true"]')).not.toBeNull();
      const button = document.querySelector<HTMLButtonElement>('[aria-label="Save Document"]')!;
      expect(button).not.toBeNull(); button.click();
      await vi.waitFor(() => expect(document.body.textContent).toContain('Saved Mutable JSON Document'));
    } else expect(await actions.saveDocument(windowKey)).toContain('Saved Mutable JSON Document');
    expect(saved.location).toEqual(location);
    expect(saved.generation.resourceId).toBe(resource.resourceId);
    expect(saved.generation.native).toContain('Unsaved edit');
    expect(Object.values(editor.repository.state.contents).filter(c => c.viewType === 'flint-application-block')).toHaveLength(0);
    expect(Object.values(editor.repository.state.contents).filter(c => c.viewType === 'workspace-object-bank-block')).toHaveLength(1);
    expect(() => editor.encodeWorkspace()).toThrow('native Documents');
    editor.commands.remove(placement);
    expect(nativeText(captureNative(editor.repository.snapshot(), resource.resourceId))).toContain('Unsaved edit');
    const reopened = await actions.serverDocument(location, signal);
    expect(reopened).not.toBe(placement);
    expect(fetch.mock.calls.filter(([url])=>!String(url).endsWith('/vault/default'))).toHaveLength(2);
  });
  it('uses an already-open Flint window and selects its existing tab without duplicating documents', async () => {
    const native = await fs.readFile('artifacts/flint-b1.2/rich.mutable.json', 'utf8');
    const resource = decodeNative(new TextEncoder().encode(native));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ Success: true, Data: { kind: 'native', resourceId: resource.resourceId, native, baseline: { nativeHash: 'saved', markdownHash: null, generation: null } } }))));
    const { editor, session, actions, signal } = setup();
    const host = editor.commands.insert({ id: 'flint-window', type: 'window-block', children: [createFlintDocumentTabs([])] }, { kind: 'at', parentKey: session.projection.state.rootKey, index: 0 });
    const location = { folder: '.', filename: 'Notes.ink' };
    expect(await actions.serverDocument(location, signal)).toBe(host);
    expect(await actions.serverDocument(location, signal)).toBe(host);
    const tabs = Object.values(session.projection.state.nodes).filter(n => n.viewType === 'tab-block');
    expect(tabs).toHaveLength(1);
    const row = Object.values(session.projection.state.nodes).find(n => n.viewType === 'tab-row-block')!;
    expect(editor.viewChildren[row.key]).toBe(tabs[0].key);
    expect(Object.values(editor.repository.state.contents).filter(c => c.viewType === 'document-window-block')).toHaveLength(0);
  });
  it('opens ordinary JSON in existing Flint with its original codec and source binding', async () => {
    const text = JSON.stringify(dto), bytes = new TextEncoder().encode(text);
    const byteHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify({ Success: true, Data: url.endsWith('vault/default') ? { vault: '.' } : { text, resourceId: 'doc', byteHash, saveCapability: 'in-place' } }))));
    const { editor, session, actions, signal } = setup();
    const host = editor.commands.insert({ id: 'flint-window', type: 'window-block', children: [createFlintDocumentTabs([])] }, { kind: 'at', parentKey: session.projection.state.rootKey, index: 0 });
    expect(await actions.serverDocument(location, signal)).toBe(host);
    expect(nativeDocumentSession(editor).compatibleSource('doc')).toMatchObject({ location, format: 'legacy-block-tree', canSave: true });
    expect(await actions.serverDocument(location, signal)).toBe(host);
    expect(Object.values(editor.repository.state.contents).filter(c => c.viewType === 'document-block')).toHaveLength(1);
  });
  it('does not admit a late native response after the picker is cancelled', async () => {
    const native = await fs.readFile('artifacts/flint-b1.2/rich.mutable.json', 'utf8');
    let respond!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })));
    const { editor, actions } = setup(), controller = new AbortController();
    const pending = actions.serverDocument({ folder: '.', filename: 'Notes.ink' }, controller.signal);
    controller.abort();
    respond(new Response(JSON.stringify({ Success: true, Data: { kind: 'native', native } })));
    await expect(pending).rejects.toThrow();
    expect(Object.values(editor.repository.state.contents).some(c => c.viewType === 'document-block' || c.viewType === 'workspace-object-bank-block')).toBe(false);
  });
  it.each([false, true])('opens a server Document into the existing empty session (Canvas=%s)', async canvas => {
    const fetch = server(), { session, editor, actions, signal } = setup(canvas);
    const projection = session.projection, placement = await actions.serverDocument(location, signal);
    const window = editor.repository.state.contents[editor.repository.state.placements[placement].contentKey];
    const document = editor.repository.state.contents[editor.repository.state.placements[window.children[0]].contentKey];
    expect(session.projection).toBe(projection); expect(window.viewType).toBe('document-window-block');
    expect(document.payload.metadata).toMatchObject({ documentId: 'doc', ...location });
    expect(document.payload.future).toEqual({ retained: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(session.presentation.active()).toBe(canvas ? 'canvas' : 'desktop');
    if (canvas) {
      expect(session.canvasRoots()).toHaveLength(1); expect(session.canvasRoots()[0].nodeKey).toBeDefined();
      const bank = Object.values(editor.repository.state.contents).find(c => c.viewType === 'workspace-object-bank-block')!;
      expect(bank.children).toEqual([placement]);
    }
    const registered = editor.persistence.workspaceReference('doc')!;
    expect(registered.contentHash).toBe(await workspaceContentHash(dto));
    const snapshot = editor.persistence.captureWorkspace();
    const bundle = await createWorkspaceSaveBundle(snapshot.repository, [registered], 'workspace', snapshot.presentation);
    expect(bundle.documents).toHaveLength(1); expect(bundle.documents[0].expectedContentHash).toBe(registered.contentHash);
    const reopened = new WorkspaceSession(materializeLocalWorkspace(snapshot.document), { features: { canvasWorkspace: true } }); sessions.push(reopened);
    expect(reopened.editor.persistence.captureWorkspace().document).toEqual(snapshot.document);
  });
  it('reopens the live edited copy, explicitly reveals a bank Window on Desktop, and preserves independent bounds', async () => {
    const fetch = server(), { session, editor, actions, signal } = setup(true);
    const placement = await actions.serverDocument(location, signal);
    const text = Object.values(session.projection.state.nodes).find(n => n.payload.id === 'text')!;
    editor.commands.setPayloadField(text.key, 'text', 'Unsaved edit');
    const canvas = session.presentation.read()!.presentations.canvas;
    session.selectPresentation('desktop');
    expect(await actions.serverDocument(location, signal)).toBe(placement);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(editor.repository.state.contents[text.contentKey].payload.text).toBe('Unsaved edit');
    expect(session.presentation.read()!.presentations.canvas).toEqual(canvas);
    expect(Object.values(editor.repository.state.contents).find(c => c.viewType === 'image-background-block')!.children).toContain(placement);
    session.selectPresentation('canvas');
    await actions.serverDocument(location, signal);
    expect(session.presentation.read()!.presentations.canvas!.placements).toHaveLength(1);
  });
  it('adds an already-open Desktop Document to an existing empty Canvas without cloning it', async () => {
    const fetch = server(), { session, editor, actions, signal } = setup(true);
    session.selectPresentation('desktop'); const placement = await actions.serverDocument(location, signal);
    const before = editor.repository.snapshot(); session.selectPresentation('canvas');
    expect(session.canvasRoots()).toHaveLength(0);
    expect(await actions.serverDocument(location, signal)).toBe(placement);
    expect(session.canvasRoots()).toHaveLength(1); expect(fetch).toHaveBeenCalledTimes(1);
    expect(editor.repository.snapshot()).toEqual(before);
  });
  it('does not mutate on fetch failure, cancelled loading or conflicting document identity', async () => {
    const { session, editor, actions, signal } = setup(), before = editor.repository.snapshot();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
    await expect(actions.serverDocument(location, signal)).rejects.toThrow('Offline'); expect(editor.repository.snapshot()).toEqual(before);
    const aborted = new AbortController(); aborted.abort(); server();
    await expect(actions.serverDocument(location, aborted.signal)).rejects.toThrow(); expect(editor.repository.snapshot()).toEqual(before);
    await actions.serverDocument(location, signal); const opened = editor.repository.snapshot();
    await expect(actions.serverDocument({ ...location, filename: 'Other.json' }, signal)).rejects.toThrow('different server file');
    expect(editor.repository.snapshot()).toEqual(opened); expect(session.projection).toBeDefined();
  });
  it('rolls back bank and layout creation if insertion fails', () => {
    const { session, editor, actions } = setup(true), before = editor.repository.snapshot(), layout = session.presentation.capture();
    const insert = editor.commands.insert.bind(editor.commands); let calls = 0;
    vi.spyOn(editor.commands, 'insert').mockImplementation((...args) => { if (++calls === 2) throw new Error('Failed insertion'); return insert(...args); });
    expect(() => actions.newDocument()).toThrow('Failed insertion');
    expect(editor.repository.snapshot()).toEqual(before); expect(session.presentation.capture()).toEqual(layout);
  });
  it('ignores a late server response after its request lifetime is cancelled', async () => {
    const { editor, actions } = setup(), before = editor.repository.snapshot();
    let respond!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })));
    const controller = new AbortController(), loading = actions.serverDocument(location, controller.signal);
    controller.abort();
    respond(new Response(JSON.stringify({ Success: true, Data: { document: dto } }), { headers: { 'Content-Type': 'application/json' } }));
    await expect(loading).rejects.toThrow(); expect(editor.repository.snapshot()).toEqual(before);
  });
  it.each([false, true])('opens images and new Documents without a workspace file (Canvas=%s)', canvas => {
    const { session, editor, actions } = setup(canvas);
    actions.image('/image-backgrounds/green-aurora.jpg'); actions.newDocument();
    expect(Object.values(editor.repository.state.contents).filter(c => c.viewType === 'image-block')).toHaveLength(1);
    expect(Object.values(editor.repository.state.contents).filter(c => c.viewType === 'document-block')).toHaveLength(1);
    expect(() => actions.image('javascript:alert(1)')).toThrow('image URL');
    if (canvas) expect(session.canvasRoots()).toHaveLength(2);
  });
});

it.each([true, false])('Workspace Open TEI XML uses the native import workflow (enabled=%s)', async enabled => {
  const { CodexSystemBar } = await import('../demo/codex-system-bar');
  const session = new WorkspaceSession(materializeLocalWorkspace({ type: 'workspace-block', children: [] }), { features: { teiImport: enabled, nativeKnowledge: false, sqliteKnowledge: false } }); sessions.push(session);
  const editor = session.editor, host = document.body.appendChild(document.createElement('div'));
  const Host = () => { const controls = createWorkspaceOpenControls(session, () => true); return <><CodexSystemBar><controls.Buttons menu/></CodexSystemBar><ReactiveTreeView editor={editor} projection={session.projection}/><controls.Dialogs/></>; };
  views.push(render(() => <Host/>, host)); views.push(editor.installGateway(document));
  host.querySelector<HTMLButtonElement>('[data-system-menu-trigger="workspace"]')!.click(); await Promise.resolve();
  const action = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(b => b.textContent === 'Open TEI XML…');
  expect(!!action).toBe(enabled); if (!enabled) return;
  action!.click(); await Promise.resolve();
  const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Open TEI XML"]')!;
  expect(dialog).toBeTruthy(); expect(dialog.querySelector('select')?.value).toBe('tei'); expect(dialog.querySelector('select')?.disabled).toBe(true);
  const input = dialog.querySelector<HTMLInputElement>('input[type=file]')!; expect(input.accept).toBe('.tei,.xml');
  const source = '<TEI><text><body><p>Before <choice><orig>first</orig><reg>second</reg></choice> after.</p></body></text></TEI>', bytes = new TextEncoder().encode(source);
  Object.defineProperty(input, 'files', { value: [{ name: 'letter.xml', size: bytes.length, type: 'application/xml', arrayBuffer: async () => bytes.buffer }] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(editor.interchange.busy()).toBe(false));
  const doc = Object.values(editor.repository.readState().contents).find(c => (c.payload.metadata as any)?.interchange?.provenance?.filename === 'letter.xml')!;
  expect(doc, editor.interchange.message()).toBeTruthy(); const id = String(doc.payload.id), native = nativeDocumentSession(editor);
  expect(native.isCandidate(id)).toBe(true); expect(native.isDirty(id)).toBe(true); expect(native.location(id)).toBeUndefined();
  expect(host.textContent).toContain('Before'); expect(host.querySelector('.native-inline-alternative')).not.toBeNull();
  const resource = captureNative(editor.repository.readState(), id); expect(Object.values(resource.contents).some(c => c.viewType === 'text-cell')).toBe(false);
  expect(new TextDecoder().decode(bytes)).toBe(source);
});
