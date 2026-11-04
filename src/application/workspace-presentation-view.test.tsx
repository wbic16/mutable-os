// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { WorkspaceSession } from "./workspace-session";
import { WorkspacePresentationView } from "./workspace-presentation-view";
import { WorkspacePresentations } from "../demo/workspace-presentations";
import { materializeLocalWorkspace, createWorkspaceSaveBundle } from "../reactive-editor/workspace-manifest";
import type { ExistingBlockDto } from "../block-tree/types";

const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(stop => stop()); document.body.replaceChildren(); vi.restoreAllMocks(); });
const doc = { id: "doc", type: "document-block", metadata: { documentId: "doc", folder: "notes", filename: "Doc.json" }, children: [{ id: "text", type: "plain-text-block", text: "Shared content" }] };
const fixture = (): ExistingBlockDto => ({ id: "workspace", type: "workspace-block", children: [
  { id: "one", type: "document-window-block", metadata: { position: { x: 20, y: 40 }, size: { w: 840, h: 620 } }, children: [structuredClone(doc)] },
  { id: "two", type: "document-window-block", metadata: { position: { x: 900, y: 40 }, size: { w: 700, h: 500 }, state: "minimized" }, children: [structuredClone(doc)] },
  { id: "image", type: "image-block", metadata: { url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" } },
] });
function mount(dto = fixture(), presentationProbe = true) {
  const session = new WorkspaceSession(materializeLocalWorkspace(dto), { features: { canvasWorkspace: true, presentationProbe } });
  cleanup.push(() => session.dispose());
  const host = document.body.appendChild(document.createElement("div")); host.className = "workspace-demo";
  cleanup.push(render(() => <><WorkspacePresentations session={session} /><WorkspacePresentationView session={session} /></>, host));
  session.editor.installGateway(document);
  return { session, editor: session.editor, host };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

describe("canonical presentation switching", () => {
  it("mounts Probe controls only in Canvas and honours the presentation feature flag", async () => {
    const enabled = mount();
    expect(enabled.host.querySelector('.probe-controls')).toBeNull();
    enabled.session.selectPresentation('canvas'); await tick();
    expect(enabled.host.querySelector('[aria-label="Probe pointer"]')).not.toBeNull();
    enabled.session.selectPresentation('desktop'); await tick();
    expect(enabled.host.querySelector('.probe-controls')).toBeNull();
    const disabled = mount(fixture(), false);
    disabled.session.selectPresentation('canvas'); await tick();
    expect(disabled.host.querySelector('.probe-controls')).toBeNull();
    expect(disabled.host.textContent).toContain('Alt + wheel to zoom');
  });

  it("falls back to the Window icon when the focused Canvas occurrence is minimized on Desktop", async () => {
    const { session, host } = mount(); session.selectPresentation("canvas"); await tick();
    host.querySelectorAll<HTMLTextAreaElement>("textarea")[1].focus();
    session.selectPresentation("desktop"); await tick();
    expect(document.activeElement).toBe(host.querySelector('[data-window-icon]'));
  });

  it("assigns missing object IDs once and leaves all content/layout untouched when candidate validation fails", () => {
    const dto = fixture(); delete dto.children![0].id;
    const { session, editor } = mount(dto);
    expect(session.selectPresentation("canvas")).toBe(true);
    const id = editor.encodeWorkspace().children![0].id;
    expect(id).toBeTruthy(); expect(editor.repository.state.revision).toBe(1);
    session.selectPresentation("desktop"); session.selectPresentation("canvas");
    expect(editor.encodeWorkspace().children![0].id).toBe(id); expect(editor.repository.state.revision).toBe(1);
    const invalid = fixture(); delete invalid.children![0].id;
    (invalid.children![1].metadata as any).size.w = 1e8;
    const other = mount(invalid), before = other.editor.repository.snapshot();
    expect(other.session.selectPresentation("canvas")).toBe(false);
    expect(other.editor.repository.snapshot()).toEqual(before); expect(other.session.presentation.read()).toBeUndefined();
  });

  it("does not unmount an unqualified embedded application to switch", () => {
    const dto = fixture(); dto.children![0].children!.push({ id: "frame", type: "iframe-block", metadata: { url: "about:blank" } });
    const { session, host } = mount(dto), frame = host.querySelector('iframe');
    expect(session.selectPresentation("canvas")).toBe(false);
    expect(host.querySelector('iframe')).toBe(frame);
    expect(session.notice()).toContain("embedded application");
  });
  it("keeps one editor/projection, shared content and undo across repeated switches; typing does not remount objects", async () => {
    const { session, editor, host } = mount(), projection = session.projection;
    const saved = editor.encodeWorkspace(), originalKeys = Object.keys(projection.state.nodes);
    const textarea = host.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.focus(); textarea.setSelectionRange(2, 5);
    expect(session.selectPresentation("canvas")).toBe(true); await tick();
    expect(host.querySelectorAll("textarea")).toHaveLength(2);
    expect(document.activeElement).toBe(host.querySelector("textarea"));
    expect((document.activeElement as HTMLTextAreaElement).selectionStart).toBe(2);
    expect(host.querySelector('[aria-label="Close window"]')).toBeNull();
    expect(host.querySelector('[aria-label="Minimize window"]')).toBeNull();
    expect(host.querySelector('.reactive-window__resize')).toBeNull();
    const resolve = vi.spyOn(session, "resolveObjects"), mounted = [...host.querySelectorAll("textarea")];
    const key = Object.values(projection.state.nodes).find(n => n.payload.id === "text")!.key;
    editor.commands.setPayloadField(key, "text", "Edited once"); await tick();
    expect([...host.querySelectorAll<HTMLTextAreaElement>("textarea")].map(e => e.value)).toEqual(["Edited once", "Edited once"]);
    expect([...host.querySelectorAll("textarea")]).toEqual(mounted);
    expect(resolve).not.toHaveBeenCalled();
    const layout = session.presentation.read()!.presentations.canvas;
    for (let i = 0; i < 3; i++) {
      expect(session.selectPresentation("desktop")).toBe(true); await tick();
      expect(host.querySelectorAll("textarea")).toHaveLength(2);
      expect(host.querySelectorAll(".mwm-retained-body[hidden] textarea")).toHaveLength(1);
      expect(host.querySelector('[data-window-icon]')).not.toBeNull();
      expect(session.selectPresentation("canvas")).toBe(true); await tick();
    }
    expect(editor.projections.size).toBe(1); expect(session.projection).toBe(projection);
    expect(Object.keys(projection.state.nodes)).toEqual(originalKeys);
    expect(session.presentation.read()!.presentations.canvas).toEqual(layout);
    expect(editor.encodeWorkspace().children!.map(w => w.metadata)).toEqual(saved.children!.map(w => w.metadata));
    expect(editor.repository.state.revision).toBe(1); expect(editor.repository.canUndo()).toBe(true);
    editor.repository.undo(); expect(host.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("Shared content");
    const captured = editor.persistence.captureWorkspace();
    const bundle = await createWorkspaceSaveBundle(captured.repository, [], "workspace", captured.presentation);
    expect(bundle.documents).toHaveLength(1);
    const reopened = new WorkspaceSession(materializeLocalWorkspace(captured.document), { features: { canvasWorkspace: true } }); cleanup.push(() => reopened.dispose());
    expect(reopened.presentation.active()).toBe("canvas");
    expect(reopened.presentation.read()).toEqual(session.presentation.read());
  });

  it("defers switching through composition and preserves panels/drafts until explicitly finished", async () => {
    const { session, editor, host } = mount();
    const input = host.querySelector<HTMLTextAreaElement>("textarea")!; input.focus();
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    expect(session.selectPresentation("canvas")).toBe(false); expect(host.querySelector('.workspace-canvas')).toBeNull();
    input.value = "Composed text";
    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "Composed text" }));
    await vi.waitFor(() => expect(session.presentation.active()).toBe("canvas"));
    expect(host.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("Composed text");
    const panel = editor.overlays.open({ ownerKey: session.projection.state.rootKey, viewType: "unknown-panel", anchor: { x: 0, y: 0 } });
    expect(session.selectPresentation("desktop")).toBe(false); expect(editor.overlays.overlays).toHaveLength(1);
    editor.overlays.close(panel, false);
    const draft = editor.stickyNotes.create()!;
    expect(session.selectPresentation("desktop")).toBe(false);
    editor.stickyNotes.discard(draft);
    expect(session.selectPresentation("desktop")).toBe(true);
  });

  it("retains empty Canvas and unavailable entries and blocks overlapping render roots", () => {
    const dto = fixture();
    dto.metadata = { workspacePresentation: { version: 1, active: "canvas", objects: [], presentations: {
      desktop: { version: 1, kind: "legacy-tree" }, canvas: { version: 1, camera: { x: 8, y: 9, zoom: 2 }, placements: [] },
    } } };
    const { session, host } = mount(dto);
    expect(host.textContent).toContain("no placements");
    session.selectPresentation("desktop"); session.selectPresentation("canvas");
    expect(session.presentation.read()!.presentations.canvas!.placements).toEqual([]);
    expect(session.presentation.read()!.objects).toEqual([]);
    const envelope = (dto.metadata as any).workspacePresentation;
    envelope.objects = [{ id: "root", target: { kind: "block", blockId: "one" } }, { id: "nested", target: { kind: "block", blockId: "nested-image" } }, { id: "missing", target: { kind: "block", blockId: "gone" } }];
    envelope.presentations.canvas.placements = envelope.objects.map((o: any, order: number) => ({ id: o.id, objectId: o.id, bounds: { x: order * 100, y: 0, width: 300, height: 300 }, order }));
    // One document occurrence makes the overlap unambiguous.
    dto.children!.splice(1, 1);
    dto.children![0].children!.push({ id: "nested-image", type: "image-block" });
    const second = mount(dto);
    expect(second.host.querySelectorAll("textarea")).toHaveLength(1);
    expect(second.host.querySelectorAll('.workspace-canvas__placeholder')).toHaveLength(2);
    expect(second.host.textContent).toContain("overlapping render root");
    expect(second.session.presentation.read()!.presentations.canvas!.placements).toHaveLength(3);
  });
});

describe('Textual shell isolation', () => {
  it('retains graphical DOM and canonical state across shell switches without snapshots', async () => {
    const {session,editor,host}=mount();await tick();
    const original=[...host.querySelectorAll('textarea')];expect(original.length).toBe(2);
    const revision=editor.repository.state.revision;
    const snapshot=vi.spyOn(editor.repository,'snapshot');
    expect(session.selectPresentation('textual')).toBe(true);await tick();
    expect(document.querySelector('.textual-workspace')).not.toBeNull();
    expect(host.querySelector<HTMLElement>('.mwm-window-plane')?.hidden).toBe(true);
    expect([...host.querySelectorAll('textarea')]).toEqual(original);
    expect(session.selectPresentation('desktop')).toBe(true);await tick();
    expect(document.querySelector('.textual-workspace')).toBeNull();
    expect(host.querySelector<HTMLElement>('.mwm-window-plane')?.hidden).toBe(false);
    expect([...host.querySelectorAll('textarea')]).toEqual(original);
    expect(editor.repository.state.revision).toBe(revision);expect(snapshot).not.toHaveBeenCalled();
  });
});
