// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createComponent, createRoot, getOwner, onCleanup } from "solid-js";
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
async function setup(retained = true, manager = true) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ Success: false, Error: "isolated fixture" }), { status: 503 })));
  const session = new WorkspaceSession(materializeLocalWorkspace(fixture()), { features: {
    retainedDocumentSessions: retained, mutableWindowManager: manager, entityReferences: false,
    flintLogo: false, flintMaterialChrome: false, flintSpatialGraph: false, nativeKnowledge: false,
  } });
  cleanup.push(() => session.dispose());
  const editor = session.editor, records: Array<{ key: string; owner: unknown; disposed: number }> = [];
  const registration = editor.registry.resolve("standoff-editor-block")!, original = registration.view;
  registration.view = props => {
    const record = { key: props.nodeKey, owner: getOwner(), disposed: 0 }; records.push(record);
    onCleanup(() => record.disposed++); return createComponent(original, props);
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

describe("E1.1 retained Document session lifetime", () => {
  it("lazily retains both real Flint editor owners, projections, occurrence keys and DOM across switches", async () => {
    const f = await setup(), store = f.session.documentSessions!;
    expect(store.size).toBe(1);
    const a = f.view("a"), key = f.text("a").key, mount = f.editor.mounts.get(key)!;
    const cells = [...mount.root.querySelectorAll("[data-inline-key]")];
    f.tabs()[1].click(); await tick();
    expect(store.size).toBe(2); expect(f.view("a")).toBe(a); expect(f.editor.mounts.get(key)).toBe(mount);
    expect(mount.root.closest<HTMLElement>('[role="tabpanel"]')!.hidden).toBe(true);
    expect(store.sessions().find(s => s.projection === a)!.host.activity()).toMatchObject({ mounted: true, visible: false, active: false });
    f.tabs()[0].click(); await tick();
    expect(f.view("a")).toBe(a); expect(f.text("a").key).toBe(key); expect(f.editor.mounts.get(key)).toBe(mount);
    expect([...mount.root.querySelectorAll("[data-inline-key]")]).toEqual(cells);
    expect(f.records.filter(r => r.key === key)).toHaveLength(1);
    expect(f.records.every(r => r.disposed === 0)).toBe(true);
  });

  it("delivers canonical edits while hidden, preserves native service and existing undo authority", async () => {
    const f = await setup(), native = nativeDocumentSession(f.editor), key = f.text("a").key;
    const mount = f.editor.mounts.get(key)!;
    f.tabs()[1].click(); await tick();
    f.editor.commands.replaceInlineRange(key, 0, 0, "Hidden ");
    expect(mount.captureText!()).toBe("Hidden Original a text");
    f.tabs()[0].click(); await tick();
    expect(f.editor.mounts.get(key)).toBe(mount);
    f.editor.repository.undo(); expect(mount.captureText!()).toBe("Original a text");
    expect(nativeDocumentSession(f.editor)).toBe(native);
  });

  it("does not restore unverified offsets after an external edit without an input position map", async () => {
    const f = await setup(), a = f.text("a"), mount = f.editor.mounts.get(a.key)!;
    mount.focus(); mount.restoreInlineSelection!({ anchor: 7, head: 3 });
    f.tabs()[1].click(); await tick();
    f.editor.commands.replaceInlineRange(a.key, 0, 12, "");
    f.tabs()[0].click(); await tick();
    expect(f.editor.mounts.get(a.key)).toBe(mount);
    expect(mount.captureInlineSelection!()).toEqual({ anchor: 0, head: 0 });
  });

  it("tab close cancels its lifetime and disposes only that private projection exactly once", async () => {
    const f = await setup(), store = f.session.documentSessions!;
    const a = store.sessions()[0], dispose = vi.spyOn(f.editor, "disposeView");
    f.tabs()[1].click(); await tick(); const b = f.view("b");
    f.host.querySelector<HTMLButtonElement>('[aria-label="Close Document: Document a"]')!.click(); await tick();
    expect(a.signal.aborted).toBe(true); expect(a.current()).toBe(false);
    expect(dispose.mock.calls.filter(([p]) => p === a.projection)).toHaveLength(1);
    expect(store.size).toBe(1); expect(f.view("b")).toBe(b);
    store.release(a);
    expect(dispose.mock.calls.filter(([p]) => p === a.projection)).toHaveLength(1);
    expect(Object.values(f.editor.repository.state.contents).filter(c => c.viewType === "document-block")).toHaveLength(2);
  });

  it("application close releases retained tabs but leaves canonical resources and native bindings alive", async () => {
    const f = await setup(); f.tabs()[1].click(); await tick();
    const sessions = f.session.documentSessions!.sessions(), native = nativeDocumentSession(f.editor);
    const dispose = vi.spyOn(f.editor, "disposeView");
    await f.editor.closeView(f.window.key); await tick();
    expect(f.session.documentSessions!.size).toBe(0);
    expect(sessions.every(s => s.signal.aborted)).toBe(true);
    expect(sessions.every(s => dispose.mock.calls.filter(([p]) => p === s.projection).length === 1)).toBe(true);
    expect(nativeDocumentSession(f.editor)).toBe(native);
    expect(Object.values(f.editor.repository.state.contents).filter(c => c.viewType === "document-block")).toHaveLength(2);
  });

  it("workspace disposal is authoritative even before the UI root is unmounted", async () => {
    const f = await setup(); f.tabs()[1].click(); await tick();
    const records = f.session.documentSessions!.sessions(), dispose = vi.spyOn(f.editor, "disposeView");
    f.session.dispose(); f.session.dispose();
    expect(records.every(s => s.signal.aborted)).toBe(true);
    expect(records.every(s => dispose.mock.calls.filter(([p]) => p === s.projection).length === 1)).toBe(true);
    expect(f.records.every(r => r.disposed === 1)).toBe(true);
  });

  it("store owns render lifetime independently of its creator and rejects stale completion tickets", async () => {
    const f = await setup(), store = f.session.documentSessions!;
    const placement = f.view("a").rootPlacementKey;
    let disposeParent!: () => void, cleaned = 0;
    const s = createRoot(dispose => {
      disposeParent = dispose;
      return store.mount({ ownerKey: "test", slotKey: "slot", windowId: f.window.key, placement, coordinates: identityCoordinates }, () => onCleanup(() => cleaned++));
    });
    s.host.update(true, true); const valid = s.host.ticket();
    disposeParent(); expect(cleaned).toBe(0); expect(s.current()).toBe(true);
    s.host.update(false, false); expect(valid()).toBe(false);
    const late = Promise.resolve().then(() => s.current() && valid());
    store.release(s); expect(await late).toBe(false); expect(cleaned).toBe(1);
    const replacement = store.mount({ ownerKey: "test", slotKey: "slot", windowId: f.window.key, placement, coordinates: identityCoordinates }, () => {});
    store.release(s); expect(replacement.current()).toBe(true);
    store.release(replacement);
  });

  it("failed initial rendering leaves no retained projection or occupied membership", async () => {
    const f = await setup(), store = f.session.documentSessions!, before = f.editor.projections.size;
    expect(() => store.mount({ ownerKey: "failure", slotKey: "slot", windowId: f.window.key, placement: f.view("a").rootPlacementKey, coordinates: identityCoordinates }, () => { throw Error("injected"); })).toThrow("injected");
    expect(f.editor.projections.size).toBe(before); expect(store.size).toBe(1);
  });

  it("cancelled asynchronous tab close preserves the exact session; late accepted close cannot steal selection", async () => {
    const f = await setup(), store = f.session.documentSessions!, a = store.sessions()[0];
    const tab = f.editor.node(a.host.slotKey)!;
    let finish!: (ok: boolean) => void;
    f.editor.viewCloseGuards.set(tab.key, () => new Promise(resolve => { finish = resolve; }));
    const close = () => f.host.querySelector<HTMLButtonElement>('[aria-label="Close Document: Document a"]')!.click();
    close(); finish(false); await tick(); await tick();
    expect(a.current()).toBe(true); expect(f.tabs()).toHaveLength(2);
    close(); f.tabs()[1].click(); await tick();
    const b = f.text("b"), mount = f.editor.mounts.get(b.key)!;
    mount.focus(); finish(true); await tick(); await tick();
    expect(a.signal.aborted).toBe(true);
    expect(f.tabs()[0].textContent).toContain("Document b");
    expect(document.activeElement).toBe(mount.focusElement);
  });

  it.each(["application", "workspace"])("aborts pending tab close on %s disposal before a late guard resolves", async mode => {
    const f = await setup(), a = f.session.documentSessions!.sessions()[0];
    let finish!: (ok: boolean) => void, signal: AbortSignal | undefined;
    f.editor.viewCloseGuards.set(a.host.slotKey, token => { signal = token; return new Promise(resolve => { finish = resolve; }); });
    f.host.querySelector<HTMLButtonElement>('[aria-label="Close Document: Document a"]')!.click();
    if (mode === "application") await f.editor.closeView(f.window.key); else f.session.dispose();
    expect(signal?.aborted).toBe(true);
    const focus = vi.spyOn(f.editor.focus, "request");
    finish(true); await tick(); await tick();
    expect(focus).not.toHaveBeenCalled();
    expect(f.editor.viewVisibility.isClosed(f.editor.node(a.host.slotKey)?.placementKey ?? "")).toBe(false);
  });

  it("refuses internal tab switches during composition and owned modal activity", async () => {
    const f = await setup();
    document.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    f.tabs()[1].click(); await tick();
    expect(f.session.documentSessions!.size).toBe(1);
    document.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    const modal = document.body.appendChild(document.createElement("div"));
    const release = f.session.windowManager!.lifecycle.modal(modal, f.window.key);
    f.tabs()[1].click(); await tick();
    expect(f.session.documentSessions!.size).toBe(1);
    release(); modal.remove();
    f.tabs()[1].click(); await tick();
    expect(f.session.documentSessions!.size).toBe(2);
  });

  it("typing with a hidden retained peer does no capture, session inventory scan or repeated input delivery", async () => {
    const f = await setup(), a = f.text("a").key;
    f.tabs()[1].click(); await tick();
    const b = f.text("b").key, mount = f.editor.mounts.get(b)!;
    mount.focus(); mount.restoreInlineSelection!({ anchor: 0, head: 0 });
    const snapshot = vi.spyOn(f.editor.repository, "snapshot"), inventory = vi.spyOn(f.session.documentSessions!, "sessions");
    const replace = vi.spyOn(f.editor.commands, "replaceInlineRange");
    mount.focusElement.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: "X", bubbles: true, cancelable: true }));
    await tick();
    expect(mount.captureText!()).toBe("XOriginal b text");
    expect(f.editor.mounts.get(a)!.captureText!()).toBe("Original a text");
    expect(replace).toHaveBeenCalledTimes(1); expect(snapshot).not.toHaveBeenCalled(); expect(inventory).not.toHaveBeenCalled();
  });

  it("new Ink island borrows the original shared projection and releases only its render lifetime", async () => {
    const f = await setup();
    const key = f.editor.commands.insert({ id: "ink", type: "document-window-block", children: [{ id: "ink-document", type: "document-block", children: [{ id: "ink-text", type: "standoff-editor-block", text: "Ink" }] }] }, { kind: "at", parentKey: f.session.projection.state.rootKey, index: 0 });
    await tick();
    const window = f.editor.nodeForPlacementInView(key, f.session.projection.viewId)!;
    const island = f.session.documentSessions!.sessions().find(s => s.host.ownerKey === window.key)!;
    expect(island.ownsProjection).toBe(false); expect(island.projection).toBe(f.session.projection);
    const text = Object.values(f.session.projection.state.nodes).find(n => n.payload.id === "ink-text")!, mount = f.editor.mounts.get(text.key)!;
    f.session.windowManager!.lifecycle.minimize(window.key); await tick();
    expect(f.editor.mounts.get(text.key)).toBe(mount); expect(island.host.activity().visible).toBe(false);
    f.session.windowManager!.lifecycle.reveal(window.key); await tick();
    expect(f.editor.mounts.get(text.key)).toBe(mount);
    await f.editor.closeView(window.key); await tick();
    expect(island.signal.aborted).toBe(true); expect(f.editor.projections.get(f.session.projection.viewId)).toBe(f.session.projection);
  });

  it.each([[false, true], [true, false]])("exclusive fallback with retained=%s manager=%s preserves transient tab behavior", async (retained, manager) => {
    const f = await setup(retained, manager), a = f.view("a");
    expect(f.session.documentSessions).toBeUndefined();
    f.tabs()[1].click(); await tick();
    expect(f.editor.projections.has(a.viewId)).toBe(false);
  });
});
