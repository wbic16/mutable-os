// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createComponent, createRoot, getOwner, onCleanup } from "solid-js";
import { ApplicationSurfacePortal, useManagedWindowOwner } from "../rendering/window-manager";
import { render } from "solid-js/web";
import { WorkspaceSession } from "./workspace-session";
import { WorkspacePresentationView } from "./workspace-presentation-view";
import { materializeLocalWorkspace } from "../reactive-editor/workspace-manifest";
import { identityCoordinates } from "../runtime/local-coordinates";
import { nativeDocumentSession } from "../persistence/native-session";

const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(stop => stop()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const fixture = () => ({ id: "workspace", type: "workspace-block", children: [
  { id: "bank", type: "workspace-object-bank-block", children: ["a", "b"].map(id => ({
    id: `doc-${id}`, type: "document-block", metadata: { documentId: `resource-${id}`, title: `Document ${id}`, folder: ".", filename: `${id}.json` },
    children: [{ id: `text-${id}`, type: "standoff-editor-block", text: `Original ${id} text` }],
  })) },
] });
async function setup(retained = true, manager = true, transferEnabled = true) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ Success: false, Error: "isolated fixture" }), { status: 503 })));
  const session = new WorkspaceSession(materializeLocalWorkspace(fixture()), { features: {
    retainedDocumentSessions: retained, mutableWindowManager: manager, documentSessionHostTransfer: transferEnabled, entityReferences: false,
    flintLogo: false, flintMaterialChrome: false, flintSpatialGraph: false, nativeKnowledge: false,
  } });
  cleanup.push(() => session.dispose());
  const editor = session.editor, records: Array<{ key: string; owner: unknown; host?: ReturnType<typeof useManagedWindowOwner>; disposed: number }> = [];
  const registration = editor.registry.resolve("standoff-editor-block")!, original = registration.view;
  registration.view = props => {
    const record = { key: props.nodeKey, owner: getOwner(), host: useManagedWindowOwner(), disposed: 0 }; records.push(record);
    onCleanup(() => record.disposed++); return <>{createComponent(original, props)}<ApplicationSurfacePortal kind="tool" documentTransfer="retained"><input aria-label={`Session tool ${props.nodeKey}`} value="Retained tool"/></ApplicationSurfacePortal></>;
  };
  const host = document.body.appendChild(document.createElement("div"));
  cleanup.push(render(() => <WorkspacePresentationView session={session}/>, host));
  cleanup.push(editor.installGateway(document));
  await editor.commandRegistry.execute("flint.open", { targetKey: session.projection.state.rootKey, args: undefined });
  await tick();
  const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('.flint-document-tab [role="tab"]')];
  const app = Object.values(session.projection.state.nodes).find(n => n.viewType === "flint-application-block")!;
  const window = editor.blockQueries.ancestors(app.key).find(n => n.viewType === "window-block")!;
  const view = (id: string) => [...editor.projections.values()].find(p => p !== session.projection && Object.values(p.state.nodes).some(n => n.payload.id === `doc-${id}`))!;
  const text = (id: string) => Object.values(view(id).state.nodes).find(n => n.payload.id === `text-${id}`)!;
  return { session, editor, host, records, tabs, app, window, view, text };
}

async function transferFixture(transferEnabled = true) {
  const f = await setup(true, true, transferEnabled), store = f.session.documentSessions!, transfer = store.transfers;
  const session = store.sessions()[0], source = transfer.current(session)!;
  const placement = f.editor.commands.insert({ id: 'destination', type: 'document-window-block', metadata: { title: 'Destination' }, children: [] }, { kind: 'at', parentKey: f.session.projection.state.rootKey, index: 0 });
  await tick();
  const window = f.editor.nodeForPlacementInView(placement, f.session.projection.viewId)!;
  const container = document.createElement('div');
  f.session.windowManager!.groups.get(window.key)!.querySelector('.reactive-window__document-body')!.append(container);
  const destination = transfer.register({ kind: 'managed-document', ownerKey: window.key, slotKey: 'document', windowId: window.key, container, coordinates: identityCoordinates, selected: () => true });
  const node = f.text('a'), mount = f.editor.mounts.get(node.key)!;
  return { ...f, store, transfer, sessionView: session, source, destination, destinationWindow: window, node, mount };
}

describe('E1.2 controlled Document host transfer', () => {
  it('restores scrolling to the retained content when returning to an initially empty Flint tab', async () => {
    const f = await transferFixture(), s = f.sessionView;
    const content = s.element.querySelector<HTMLElement>('.reactive-document-occurrence__content')!;
    expect(f.source.port.scrollport).toBe(content);
    content.scrollTop = 240;
    await f.transfer.transfer(s, f.destination);
    expect(f.destination.port.container.scrollTop).toBe(240);
    expect(f.source.port.scrollport).not.toBe(content); // Slot is empty until attachment.
    f.destination.port.container.scrollTop = 370;
    await expect(f.transfer.transfer(s, f.source, { checkpoint: stage => {
      if (stage === 'attached') throw Error('Return interrupted');
    } })).rejects.toThrow('Return interrupted');
    expect(f.destination.port.container.scrollTop).toBe(370);
    expect(f.transfer.owns(s, f.destination)).toBe(true);
    content.scrollTop = 0;
    await f.transfer.transfer(s, f.source);
    expect(f.source.port.scrollport).toBe(content);
    expect(content.scrollTop).toBe(370);
    expect(f.editor.mounts.get(f.node.key)).toBe(f.mount);
  });

  it('moves and returns the real editor, context and portal leases without creating an editor or subscription', async () => {
    const f = await transferFixture(), s = f.sessionView, owner = f.records.find(r => r.key === f.node.key)!;
    const surface = document.querySelector<HTMLInputElement>(`[aria-label="Session tool ${f.node.key}"]`)!;
    const portal = surface.closest<HTMLElement>('[data-mwm-surface]')!, surfaceRecord = f.session.windowManager!.registry.surfaces[portal.dataset.mwmSurface!];
    surface.value = 'View-local state';
    const projection = s.projection, cells = [...f.mount.root.querySelectorAll('[data-inline-key]')];
    const subscribe = vi.spyOn(f.editor.repository, 'subscribeChanges'), create = vi.spyOn(f.editor, 'createView');
    const revision = f.editor.repository.state.revision, native = nativeDocumentSession(f.editor), ticket = s.host.ticket();
    f.mount.focus(); f.mount.restoreInlineSelection!({ anchor: 7, head: 3 });
    await f.transfer.transfer(s, f.destination);
    expect(ticket()).toBe(false); expect(f.transfer.owns(s, f.destination)).toBe(true);
    expect(s.projection).toBe(projection); expect(f.editor.mounts.get(f.node.key)).toBe(f.mount);
    expect([...f.mount.root.querySelectorAll('[data-inline-key]')]).toEqual(cells);
    expect(owner.host!.windowId).toBe(f.destination.port.windowId);
    expect(f.editor.windowManager!.ownerForNode(f.node.key)).toBe(f.destination.port.windowId);
    expect(surface.closest('[data-mwm-window]')).toBe(f.session.windowManager!.groups.get(f.destination.port.windowId));
    expect(surfaceRecord.ownerWindowId).toBe(f.destination.port.windowId); expect(surface.value).toBe('View-local state');
    expect(f.mount.captureInlineSelection!()).toEqual({ anchor: 7, head: 3 });
    expect(() => f.editor.persistence.captureWorkspace()).toThrow('Return experimental');
    await f.transfer.transfer(s, f.source);
    expect(f.transfer.atOrigin(s)).toBe(true); expect(owner.host!.windowId).toBe(f.window.key);
    expect(f.editor.repository.state.revision).toBe(revision); expect(nativeDocumentSession(f.editor)).toBe(native);
    expect(create).not.toHaveBeenCalled(); expect(subscribe).not.toHaveBeenCalled();
    expect(f.transfer.diagnostics()).toMatchObject({ pending: 0, reservations: 0, completed: 2 });
    expect(owner.disposed).toBe(0);
  });

  it.each(['prepared', 'attached', 'surfaces', 'commit'] as const)('rolls back a failure at %s without losing source DOM, tools or ownership', async stage => {
    const f = await transferFixture(), s = f.sessionView, parent = s.element.parentNode;
    const revision = f.editor.repository.state.revision;
    f.mount.focus(); f.mount.restoreInlineSelection!({ anchor: 5, head: 2 });
    await expect(f.transfer.transfer(s, f.destination, { checkpoint: point => { if (point === stage) throw Error('injected'); } })).rejects.toThrow('injected');
    expect(s.element.parentNode).toBe(parent); expect(f.transfer.owns(s, f.source)).toBe(true);
    expect(f.mount.captureInlineSelection!()).toEqual({ anchor: 5, head: 2 });
    expect(f.editor.repository.state.revision).toBe(revision);
    expect(f.records.every(r => r.disposed === 0)).toBe(true);
    expect(f.transfer.diagnostics()).toMatchObject({ pending: 0, reservations: 0, completed: 0 });
    await f.transfer.transfer(s, f.destination); // Reservation is reusable.
  });

  it('rejects competing transfers and reserved destinations; cancellation prevents stale preparation from attaching', async () => {
    const f = await transferFixture(), controller = new AbortController(); let complete!: () => void;
    const pending = f.transfer.transfer(f.sessionView, f.destination, { signal: controller.signal, prepare: () => new Promise(resolve => { complete = resolve; }) });
    await expect(f.transfer.transfer(f.sessionView, f.destination)).rejects.toThrow('already transferring');
    expect(() => f.transfer.register(f.destination.port)).toThrow('already registered');
    expect(() => f.editor.persistence.captureWorkspace()).toThrow('Return experimental');
    f.editor.commands.replaceInlineRange(f.node.key, 0, 0, 'During preparation ');
    controller.abort(); await expect(pending).rejects.toThrow('cancelled'); complete(); await tick();
    expect(f.transfer.owns(f.sessionView, f.source)).toBe(true);
    expect(f.mount.captureText!()).toContain('During preparation');
    expect(f.transfer.diagnostics()).toMatchObject({ pending: 0, reservations: 0 });
    f.destination.release();
    await expect(f.transfer.transfer(f.sessionView, f.destination)).rejects.toThrow('Stale');
  });

  it('captures edits and selection at final validation and leaves undo authority intact', async () => {
    const f = await transferFixture(); let ready!: () => void;
    const pending = f.transfer.transfer(f.sessionView, f.destination, { prepare: () => new Promise(resolve => { ready = resolve; }) });
    f.editor.commands.replaceInlineRange(f.node.key, 0, 0, 'Latest ');
    f.mount.focus(); f.mount.restoreInlineSelection!({ anchor: 8, head: 4 }); ready(); await pending;
    expect(f.mount.captureText!()).toBe('Latest Original a text');
    expect(f.mount.captureInlineSelection!()).toEqual({ anchor: 8, head: 4 });
    f.editor.repository.undo(); expect(f.mount.captureText!()).toBe('Original a text');
    f.editor.repository.redo(); expect(f.mount.captureText!()).toBe('Latest Original a text');
  });

  it('rejects affected pending Save, composition, modal and pending close without disturbing them', async () => {
    const f = await transferFixture(), native = nativeDocumentSession(f.editor), evidence = native.knowledgeEvidence('resource-a');
    const spy = vi.spyOn(native, 'knowledgeEvidence').mockReturnValue({ ...evidence, pending: true });
    await expect(f.transfer.transfer(f.sessionView, f.destination)).rejects.toThrow('affected Document Save'); spy.mockRestore();
    document.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    await expect(f.transfer.transfer(f.sessionView, f.destination)).rejects.toThrow('composition');
    document.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); await tick();
    const modal = document.body.appendChild(document.createElement('div')), release = f.session.windowManager!.lifecycle.modal(modal, f.window.key);
    await expect(f.transfer.transfer(f.sessionView, f.destination)).rejects.toThrow('dialogs'); release(); modal.remove(); await tick();
    let decide!: (ok: boolean) => void;
    const guard = f.session.windowManager!.lifecycle.guard(f.window.key, () => new Promise(resolve => { decide = resolve; }));
    const closing = f.editor.closeView(f.window.key);
    await expect(f.transfer.transfer(f.sessionView, f.destination)).rejects.toThrow('pending close');
    decide(false); await closing; guard();
    expect(f.sessionView.current()).toBe(true); expect(f.transfer.diagnostics().reservations).toBe(0);
  });

  it('revalidates pending operations after awaited preparation', async () => {
    const f = await transferFixture(), native = nativeDocumentSession(f.editor); let complete!: () => void;
    const pending = f.transfer.transfer(f.sessionView, f.destination, { prepare: () => new Promise(resolve => { complete = resolve; }) });
    vi.spyOn(native, 'knowledgeEvidence').mockReturnValue({ ...native.knowledgeEvidence('resource-a'), pending: true });
    complete(); await expect(pending).rejects.toThrow('affected Document Save');
    expect(f.transfer.owns(f.sessionView, f.source)).toBe(true);
  });

  it('source close after commit cannot dispose the transferred editor or reroute Save to another Document', async () => {
    const f = await transferFixture(), native = nativeDocumentSession(f.editor), s = f.sessionView;
    vi.spyOn(native, 'location').mockReturnValue({ folder: '.', filename: 'a.mutable.json' });
    const save = vi.spyOn(native, 'save').mockResolvedValue({ phase: 'saved' });
    const dispose = vi.spyOn(f.editor, 'disposeView');
    await f.transfer.transfer(s, f.destination); await f.editor.closeView(f.window.key); await tick();
    expect(s.current()).toBe(true); expect(f.editor.mounts.get(f.node.key)).toBe(f.mount);
    f.mount.focus(); f.mount.focusElement.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })); await tick();
    expect(save).toHaveBeenCalledTimes(1); expect(save).toHaveBeenCalledWith('resource-a', { folder: '.', filename: 'a.mutable.json' });
    await f.editor.closeView(f.destinationWindow.key); await tick();
    expect(s.signal.aborted).toBe(true);
    expect(dispose.mock.calls.filter(([p]) => p === s.projection)).toHaveLength(1);
    expect(f.records.find(r => r.key === f.node.key)!.disposed).toBe(1);
  });

  it('workspace disposal cancels an interrupted transfer and never resurrects its DOM', async () => {
    const f = await transferFixture(); let complete!: () => void;
    const pending = f.transfer.transfer(f.sessionView, f.destination, { prepare: () => new Promise(resolve => { complete = resolve; }) });
    const dispose = vi.spyOn(f.editor, 'disposeView'); f.session.dispose();
    await expect(pending).rejects.toThrow('cancelled'); complete(); await tick();
    expect(f.sessionView.element.isConnected).toBe(false); expect(f.store.size).toBe(0);
    expect(dispose.mock.calls.filter(([p]) => p === f.sessionView.projection)).toHaveLength(1);
    expect(f.transfer.diagnostics()).toMatchObject({ pending: 0, reservations: 0, hosts: 0 });
  });

  it('rejects an unqualified iframe without moving it', async () => {
    const f = await transferFixture(), frame = document.createElement('iframe'); f.sessionView.element.append(frame);
    await expect(f.transfer.transfer(f.sessionView, f.destination)).rejects.toThrow('unqualified'); frame.remove();
    expect(f.transfer.owns(f.sessionView, f.source)).toBe(true);
  });
  it('preserves an Ink shared-projection island after its original window closes', async () => {
    const f = await transferFixture();
    const placement = f.editor.commands.insert({ id: 'ink-source', type: 'document-window-block', children: [
      { id: 'ink-doc', type: 'document-block', metadata: { documentId: 'ink-resource' }, children: [{ id: 'ink-text', type: 'standoff-editor-block', text: 'Ink original' }] },
    ] }, { kind: 'at', parentKey: f.session.projection.state.rootKey, index: 0 }); await tick();
    const window = f.editor.nodeForPlacementInView(placement, f.session.projection.viewId)!;
    const ink = f.store.sessions().find(s => s.host.windowId === window.key)!;
    const node = Object.values(f.session.projection.state.nodes).find(n => n.payload.id === 'ink-text')!, mount = f.editor.mounts.get(node.key)!;
    await f.transfer.transfer(ink, f.destination); await f.editor.closeView(window.key); await tick();
    expect(ink.current()).toBe(true); expect(ink.projection).toBe(f.session.projection);
    expect(f.editor.mounts.get(node.key)).toBe(mount); expect(f.editor.windowManager!.ownerForNode(node.key)).toBe(f.destination.port.windowId);
    mount.focus(); mount.restoreInlineSelection!({ anchor: 3, head: 3 });
    mount.focusElement.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'X', bubbles: true, cancelable: true })); await tick();
    expect(mount.captureText!()).toBe('InkX original');
    await f.editor.closeView(f.destinationWindow.key); await tick();
    expect(ink.signal.aborted).toBe(true); expect(f.editor.projections.get(f.session.projection.viewId)).toBe(f.session.projection);
    expect(f.records.find(r => r.key === node.key)!.disposed).toBe(1);
  });

  it('contains an unexpectedly lost source and requires explicit recovery without rebuilding it', async () => {
    const f = await transferFixture(), container = f.source.port.container, parent = container.parentNode!;
    await expect(f.transfer.transfer(f.sessionView, f.destination, { checkpoint: point => {
      if (point === 'attached') { container.remove(); throw Error('source unexpectedly removed'); }
    } })).rejects.toThrow('explicit source recovery');
    expect(f.sessionView.current()).toBe(true); expect(f.sessionView.element.isConnected).toBe(true);
    expect(f.sessionView.host.activity().visible).toBe(false); expect(f.transfer.diagnostics().recovery).toBe(1);
    expect(() => f.transfer.restoreSource(f.sessionView)).toThrow('not available');
    parent.appendChild(container); f.transfer.restoreSource(f.sessionView); await tick();
    expect(f.editor.mounts.get(f.node.key)).toBe(f.mount); expect(container.contains(f.sessionView.element)).toBe(true);
    expect(f.transfer.diagnostics()).toMatchObject({ recovery: 0, pending: 0, reservations: 0 });
  });

  it('cancels preparation on destination close while the source remains usable', async () => {
    const f = await transferFixture(); let complete!: () => void;
    const pending = f.transfer.transfer(f.sessionView, f.destination, { prepare: () => new Promise(resolve => { complete = resolve; }) });
    await f.editor.closeView(f.destinationWindow.key); await expect(pending).rejects.toThrow('cancelled');
    complete(); await tick(); expect(f.transfer.owns(f.sessionView, f.source)).toBe(true);
    expect(f.sessionView.current()).toBe(true); expect(f.transfer.diagnostics().reservations).toBe(0);
  });

  it('does not restore a source focus request over another window activated during preparation', async () => {
    const f = await transferFixture(); let complete!: () => void;
    f.mount.focus();
    const pending = f.transfer.transfer(f.sessionView, f.destination, { prepare: () => new Promise(resolve => { complete = resolve; }) });
    const button = document.createElement('button'); f.destination.port.container.append(button); button.focus();
    complete(); await pending;
    expect(document.activeElement).toBe(button); expect(f.transfer.owns(f.sessionView, f.destination)).toBe(true);
  });

  it('guards composition and modal changes even inside the final attachment boundary', async () => {
    const f = await transferFixture();
    await expect(f.transfer.transfer(f.sessionView, f.destination, { checkpoint: point => {
      if (point === 'attached') document.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    } })).rejects.toThrow('composition');
    document.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); await tick();
    expect(f.transfer.owns(f.sessionView, f.source)).toBe(true);
  });

  it('leaves the retained editor in place when the transfer flag is disabled', async () => {
    const f = await transferFixture(false);
    await expect(f.transfer.transfer(f.sessionView, f.destination)).rejects.toThrow('disabled');
    expect(f.transfer.owns(f.sessionView, f.source)).toBe(true);
    expect(f.transfer.diagnostics()).toMatchObject({ pending: 0, reservations: 0, completed: 0 });
  });

  it('rejects forged leases and changed destination generations', async () => {
    const f = await transferFixture();
    await expect(f.transfer.transfer(f.sessionView, { ...f.destination })).rejects.toThrow('foreign');
    let complete!: () => void;
    const pending = f.transfer.transfer(f.sessionView, f.destination, { prepare: () => new Promise(resolve => { complete = resolve; }) });
    f.destination.release();
    const replacement = f.transfer.register(f.destination.port);
    complete(); await expect(pending).rejects.toThrow('cancelled');
    expect(f.transfer.owns(f.sessionView, f.source)).toBe(true);
    expect(replacement.generation).not.toBe(f.destination.generation);
    await f.transfer.transfer(f.sessionView, replacement);
  });

  it('requires a synchronous attachment boundary and releases its reservation after rejection', async () => {
    const f = await transferFixture();
    await expect(f.transfer.transfer(f.sessionView, f.destination, { checkpoint: async () => {} })).rejects.toThrow('synchronous');
    expect(f.transfer.owns(f.sessionView, f.source)).toBe(true);
    expect(f.transfer.diagnostics().reservations).toBe(0);
  });

  it('blocks guarded source tabs and workspace presentation changes during preparation', async () => {
    const f = await transferFixture();
    f.editor.viewCloseGuards.set(f.source.port.slotKey, () => false);
    await expect(f.transfer.transfer(f.sessionView, f.destination)).rejects.toThrow('close guard');
    f.editor.viewCloseGuards.delete(f.source.port.slotKey);
    let complete!: () => void;
    const pending = f.transfer.transfer(f.sessionView, f.destination, { prepare: () => new Promise(resolve => { complete = resolve; }) });
    expect(f.session.windowManager!.lifecycle.canMinimize(f.window.key)).toBe(false);
    complete(); await pending;
    expect(() => f.editor.persistence.captureWorkspace()).toThrow('Return experimental');
    await f.transfer.transfer(f.sessionView, f.source);
    expect(() => f.editor.persistence.captureWorkspace()).not.toThrow();
  });

  it('rejects Document tools outside the retained owner and unqualified surface adapters', async () => {
    const f = await transferFixture();
    const release = f.session.windowManager!.registry.registerSurface({ id: 'external-tool', ownerWindowId: f.window.key,
      sourceViewId: f.session.projection.viewId, sourceNodeKey: f.node.key, kind: 'tool', modality: 'none' });
    await expect(f.transfer.transfer(f.sessionView, f.destination)).rejects.toThrow('outside the retained');
    const untrack = f.sessionView.ownSurface({ id: 'external-tool', element: document.createElement('div') });
    await expect(f.transfer.transfer(f.sessionView, f.destination)).rejects.toThrow('qualified transfer adapter');
    untrack(); release();
    await f.transfer.transfer(f.sessionView, f.destination);
  });

  it('reserves a destination exclusively across two independent live sessions', async () => {
    const f = await transferFixture(); let complete!: () => void;
    f.tabs()[1].click(); await tick();
    const second = f.store.sessions().find(s => s !== f.sessionView)!;
    f.tabs()[0].click(); await tick();
    const controller = new AbortController();
    const pending = f.transfer.transfer(f.sessionView, f.destination, { signal: controller.signal, prepare: () => new Promise(resolve => { complete = resolve; }) });
    await expect(f.transfer.transfer(second, f.destination)).rejects.toThrow('reserved');
    controller.abort(); await expect(pending).rejects.toThrow('cancelled'); complete(); await tick();
    f.tabs()[1].click(); await tick();
    await f.transfer.transfer(second, f.destination);
    f.tabs()[0].click(); await tick();
    await expect(f.transfer.transfer(f.sessionView, f.destination)).rejects.toThrow('occupied');
    expect(f.transfer.owns(f.sessionView, f.source)).toBe(true);
  });

  it('cancels preparation when a canonical identity edit invalidates Flint source membership', async () => {
    const f = await transferFixture(); let complete!: () => void;
    const pending = f.transfer.transfer(f.sessionView, f.destination, { prepare: () => new Promise(resolve => { complete = resolve; }) });
    const root = f.sessionView.projection.node(f.sessionView.rootKey)!;
    f.editor.commands.setPayloadField(root.key, 'metadata', { ...(root.payload.metadata as any), documentId: 'changed-resource' });
    complete(); await expect(pending).rejects.toThrow('cancelled');
    expect(f.sessionView.signal.aborted).toBe(true);
    expect(f.destination.port.container.contains(f.sessionView.element)).toBe(false);
    expect((root.payload.metadata as any).documentId).toBe('changed-resource');
    expect(f.transfer.diagnostics().reservations).toBe(0);
  });

  it('Escape cancels preparation from the affected window without disposing the session', async () => {
    const f = await transferFixture(); let complete!: () => void;
    f.mount.focus();
    const pending = f.transfer.transfer(f.sessionView, f.destination, { prepare: () => new Promise(resolve => { complete = resolve; }) });
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    f.mount.focusElement.dispatchEvent(event);
    await expect(pending).rejects.toThrow('cancelled'); complete(); await tick();
    expect(event.defaultPrevented).toBe(true); expect(f.sessionView.current()).toBe(true);
    expect(f.transfer.owns(f.sessionView, f.source)).toBe(true);
  });

  it('rejects a shell-dependent interchange operation without cancelling it', async () => {
    const f = await transferFixture(), cancel = vi.spyOn(f.editor.interchange, 'cancel');
    vi.spyOn(f.editor.interchange, 'busy').mockReturnValue(true);
    await expect(f.transfer.transfer(f.sessionView, f.destination)).rejects.toThrow('import/export');
    expect(cancel).not.toHaveBeenCalled(); expect(f.transfer.owns(f.sessionView, f.source)).toBe(true);
  });

});
