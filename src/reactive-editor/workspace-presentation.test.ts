import { describe, expect, it } from "vitest";
import { validateWorkspacePresentation, WorkspacePresentationState, withWorkspacePresentation, type WorkspacePresentation } from "./workspace-presentation";

const envelope = (): WorkspacePresentation => ({
  version: 1, active: "canvas", future: { retained: true },
  objects: [{ id: "object", target: { kind: "block", blockId: "window", future: 4 } }],
  presentations: {
    desktop: { version: 1, kind: "legacy-tree" }, futurePresentation: { custom: true },
    canvas: { version: 1, camera: { x: -20, y: 30, zoom: .5, future: 5 }, placements: [
      { id: "placement", objectId: "object", bounds: { x: -100, y: 200, width: 800, height: 600, future: 6 }, order: 0 },
    ] },
  },
});

describe("workspace presentation envelope", () => {
  it("preserves unknown fields and presentations while validating known geometry", () => {
    const original = envelope(), parsed = validateWorkspacePresentation(original);
    expect(parsed).toEqual(original);
    parsed.presentations.canvas!.camera.x = 100;
    expect(original.presentations.canvas!.camera.x).toBe(-20);
    original.active = "futurePresentation";
    expect(validateWorkspacePresentation(original)).toEqual(original);
  });

  it.each([
    ["version", (v: any) => { v.version = 2; }],
    ["target", (v: any) => { v.objects[0].target.kind = "future"; }],
    ["duplicate object", (v: any) => { v.objects.push(v.objects[0]); }],
    ["empty anchor", (v: any) => { v.objects[0].target.blockId = " "; }],
    ["absent active", (v: any) => { v.active = "missing"; }],
    ["invalid Desktop", (v: any) => { v.presentations.desktop.kind = "other"; }],
    ["Canvas version", (v: any) => { v.presentations.canvas.version = 2; }],
    ["missing directory entry", (v: any) => { v.objects = []; }],
    ["duplicate placement", (v: any) => { v.presentations.canvas.placements.push(v.presentations.canvas.placements[0]); }],
    ["duplicate occurrence", (v: any) => { v.presentations.canvas.placements.push({ ...v.presentations.canvas.placements[0], id: "second" }); }],
    ["nonfinite coordinate", (v: any) => { v.presentations.canvas.camera.x = Infinity; }],
    ["excessive coordinate", (v: any) => { v.presentations.canvas.camera.y = 1e10; }],
    ["invalid zoom", (v: any) => { v.presentations.canvas.camera.zoom = 0; }],
    ["negative size", (v: any) => { v.presentations.canvas.placements[0].bounds.width = -1; }],
    ["excessive size", (v: any) => { v.presentations.canvas.placements[0].bounds.height = 1e7; }],
    ["fractional order", (v: any) => { v.presentations.canvas.placements[0].order = .5; }],
  ])("rejects %s without dropping the raw envelope", (_label, mutate) => {
    const raw = envelope(); mutate(raw);
    expect(() => validateWorkspacePresentation(raw)).toThrow();
    const root = { type: "workspace-block", metadata: { other: 7, workspacePresentation: raw } };
    const state = new WorkspacePresentationState(root, true);
    expect(state.read()).toBeUndefined();
    expect(state.issue()).toContain("preserved; Desktop is shown");
    expect(withWorkspacePresentation(root, state.capture())).toEqual(root);
    expect(() => state.initializeCanvas([], { version: 1, camera: { x: 0, y: 0, zoom: 1 }, placements: [] })).toThrow();
    expect(state.dirty()).toBe(false);
  });

  it("does not create metadata on legacy load/save and gates explicit initialization", () => {
    const root = { type: "workspace-block", metadata: { future: 2 } };
    const disabled = new WorkspacePresentationState(root, false);
    const canvas = { version: 1 as const, camera: { x: 0, y: 0, zoom: 1 }, placements: [] };
    expect(withWorkspacePresentation(root, disabled.capture())).toEqual(root);
    expect(() => disabled.initializeCanvas([], canvas)).toThrow("disabled");
    const enabled = new WorkspacePresentationState(root, true);
    enabled.initializeCanvas([], canvas);
    expect(enabled.read()?.active).toBe("desktop");
    expect(enabled.dirty()).toBe(true);
    expect(() => enabled.initializeCanvas([], canvas)).toThrow("already exists");
  });

  it("keeps mutations isolated, preserves nested future fields, and only acknowledges matching revisions", () => {
    const state = new WorkspacePresentationState({ metadata: { workspacePresentation: envelope() } }, true);
    const first = state.capture();
    const detached = state.read()!; detached.objects.length = 0;
    expect(state.read()?.objects).toHaveLength(1);
    state.setCamera({ x: -20, y: 30, zoom: .5 });
    expect(state.revision()).toBe(0);
    state.setCamera({ x: 40, y: 50, zoom: 2 });
    state.setBounds("placement", { x: 1, y: 2, width: 300, height: 400 });
    expect(state.read()?.presentations.canvas).toMatchObject({ camera: { future: 5 }, placements: [{ bounds: { future: 6 } }] });
    state.markSaved(first); expect(state.dirty()).toBe(true);
    state.markSaved(state.capture()); expect(state.dirty()).toBe(false);
    expect((first.value as WorkspacePresentation).presentations.canvas!.camera.x).toBe(-20);
    state.dispose(); expect(() => state.capture()).toThrow("disposed");
    expect(() => state.setCamera({ x: 0, y: 0, zoom: 1 })).toThrow("disposed");
  });
});

describe('Textual presentation envelope', () => {
  it('initialises only on request and preserves layout when unavailable or newer', () => {
    const state = new WorkspacePresentationState({type:'workspace-block'}, {canvas:false,textual:true});
    expect(state.capture().present).toBe(false);
    state.initializeTextual(); state.select('textual');
    expect(state.active()).toBe('textual');
    const root=withWorkspacePresentation({type:'workspace-block'},state.capture());
    const disabled=new WorkspacePresentationState(root,{canvas:false,textual:false});
    expect(disabled.active()).toBe('desktop'); expect(disabled.issue()).toContain('preserved');
    expect(withWorkspacePresentation(root,disabled.capture())).toEqual(root);
    const future=structuredClone(root);(future.metadata as any).workspacePresentation.presentations.textual.version=2;
    const unsupported=new WorkspacePresentationState(future,{canvas:false,textual:true});
    expect(unsupported.active()).toBe('desktop');expect(()=>unsupported.select('textual')).toThrow('unsupported');
    expect(withWorkspacePresentation(future,unsupported.capture())).toEqual(future);
  });
});
