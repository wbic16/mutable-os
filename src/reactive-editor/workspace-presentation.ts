import { validateManagedDesktop, type ManagedDesktop } from "../persistence/managed-desktop";
import { createSignal } from "solid-js";
import type { ExistingBlockDto } from "../block-tree/types";

export type PresentationName = "desktop" | "canvas" | "spatial" | "textual";
export interface PresentationAvailability { textual?: boolean; canvas: boolean; spatial?: { supports(value: unknown): boolean } }

export interface WorkspaceObject {
  id: string;
  target: ({ kind: "block"; blockId: string } | { kind: "document"; documentId: string }) & Record<string, unknown>;
  label?: string;
  desktopHostBlockId?: string;
  [key: string]: unknown;
}
export interface CanvasBounds { x: number; y: number; width: number; height: number; [key: string]: unknown }
export interface CanvasCamera { x: number; y: number; zoom: number; [key: string]: unknown }
export interface CanvasLayout {
  version: 1;
  camera: CanvasCamera;
  placements: Array<{ id: string; objectId: string; bounds: CanvasBounds; order: number; [key: string]: unknown }>;
  background?: { type: string; metadata: Record<string, unknown>; [key: string]: unknown };
  [key: string]: unknown;
}
export interface WorkspacePresentation {
  version: 1;
  active: string;
  objects: WorkspaceObject[];
  presentations: {
    desktop?: { version: 1; kind: "legacy-tree"; [key: string]: unknown } | ManagedDesktop;
    canvas?: CanvasLayout;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
export interface PresentationSnapshot { revision: number; present: boolean; value?: unknown }
export type PresentationRead =
  | { status: "absent" }
  | { status: "valid"; value: WorkspacePresentation }
  | { status: "opaque"; reason: string };

function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object.");
  return value as Record<string, any>;
}
function id(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Expected a nonempty identity.");
}
function number(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error("Invalid presentation geometry.");
}
function point(value: Record<string, any>) { number(value.x, -1e9, 1e9); number(value.y, -1e9, 1e9); }
function bounds(value: unknown) { const b = record(value); point(b); number(b.width, 1, 1e6); number(b.height, 1, 1e6); }
function camera(value: unknown) { const c = record(value); point(c); number(c.zoom, .05, 16); }

export function supportsTextual(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value) && (value as any).version === 1 && (value as any).kind === "character-cell";
}

/** Validate known v1 data without stripping future fields. Missing live targets
 * are resolution issues, not a reason to discard saved placements. */
export function validateWorkspacePresentation(value: unknown): WorkspacePresentation {
  const root = record(value);
  if (root.version !== 1) throw new Error("Unsupported workspace presentation version.");
  id(root.active);
  if (!Array.isArray(root.objects)) throw new Error("Expected a workspace object directory.");
  const objects = new Set<string>();
  for (const item of root.objects) {
    const object = record(item); id(object.id);
    if (objects.has(object.id)) throw new Error(`Duplicate workspace object ${object.id}.`);
    objects.add(object.id);
    const target = record(object.target);
    if (target.kind === "block") id(target.blockId);
    else if (target.kind === "document") id(target.documentId);
    else throw new Error("Unsupported workspace object target.");
    if (object.label !== undefined && typeof object.label !== "string") throw new Error("Invalid object label.");
    if (object.desktopHostBlockId !== undefined) id(object.desktopHostBlockId);
  }
  const presentations = record(root.presentations);
  if (presentations.desktop !== undefined) {
    const desktop = record(presentations.desktop);
    if (desktop.kind === "managed-windows") validateManagedDesktop(desktop);
    else if (desktop.version !== 1 || desktop.kind !== "legacy-tree") throw new Error("Unsupported Desktop layout.");
  }
  if (presentations.canvas !== undefined) {
    const canvas = record(presentations.canvas);
    if (canvas.version !== 1) throw new Error("Unsupported Canvas layout version.");
    camera(canvas.camera);
    if (!Array.isArray(canvas.placements)) throw new Error("Expected Canvas placements.");
    const placements = new Set<string>(), placedObjects = new Set<string>();
    for (const value of canvas.placements) {
      const placement = record(value); id(placement.id); id(placement.objectId);
      if (placements.has(placement.id)) throw new Error(`Duplicate Canvas placement ${placement.id}.`);
      if (!objects.has(placement.objectId)) throw new Error(`Unknown directory object ${placement.objectId}.`);
      if (placedObjects.has(placement.objectId)) throw new Error("Multiple Canvas occurrences of an object are not supported.");
      placements.add(placement.id); placedObjects.add(placement.objectId);
      bounds(placement.bounds); number(placement.order, -1e9, 1e9);
      if (!Number.isInteger(placement.order)) throw new Error("Canvas order must be an integer.");
    }
    if (canvas.background !== undefined) {
      const background = record(canvas.background); id(background.type); record(background.metadata);
    }
  }
  if (!Object.hasOwn(presentations, root.active)) throw new Error("The saved active presentation has no layout.");
  return structuredClone(root) as WorkspacePresentation;
}

export function readWorkspacePresentation(root: ExistingBlockDto): PresentationRead {
  const metadata = root.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || !Object.hasOwn(metadata, "workspacePresentation")) return { status: "absent" };
  try { return { status: "valid", value: validateWorkspacePresentation((metadata as Record<string, unknown>).workspacePresentation) }; }
  catch (error) { return { status: "opaque", reason: error instanceof Error ? error.message : String(error) }; }
}

/** Merge only the captured sidecar into an already encoded workspace root. */
export function withWorkspacePresentation(root: ExistingBlockDto, snapshot?: PresentationSnapshot): ExistingBlockDto {
  if (!snapshot?.present) return root;
  const metadata = root.metadata && typeof root.metadata === "object" && !Array.isArray(root.metadata) ? root.metadata : {};
  return { ...root, metadata: { ...metadata, workspacePresentation: structuredClone(snapshot.value) } };
}

/** Session-owned, deliberately limited state. No editor, observers, registry,
 * repository writes or history enrollment. Unknown envelopes stay read-only. */
export class WorkspacePresentationState {
  private readonly revisionSignal = createSignal(0);
  private readonly savedSignal = createSignal(0);
  private value?: unknown;
  private present: boolean;
  private readonly readStatus: PresentationRead;
  private disposed = false;

  readonly enabled: boolean;
  readonly availability: PresentationAvailability;
  constructor(root: ExistingBlockDto, available: boolean | PresentationAvailability) {
    this.availability = typeof available === "boolean" ? { canvas: available } : available;
    this.enabled = this.availability.canvas || !!this.availability.spatial || !!this.availability.textual;
    this.readStatus = readWorkspacePresentation(root);
    this.present = this.readStatus.status !== "absent";
    if (this.present) this.value = structuredClone((root.metadata as Record<string, unknown>).workspacePresentation);
  }
  revision() { return this.revisionSignal[0](); }
  dirty() { return this.revision() !== this.savedSignal[0](); }
  editable() { return this.enabled && !this.disposed && this.readStatus.status !== "opaque"; }
  available(name: PresentationName) {
    return name === "desktop" || (name === "canvas" ? this.availability.canvas : name === "textual" ? !!this.availability.textual : !!this.availability.spatial);
  }
  active(): PresentationName {
    const value = this.read();
    if (value?.active === "canvas" && this.availability.canvas && value.presentations.canvas) return "canvas";
    if (value?.active === "spatial" && this.availability.spatial?.supports(value.presentations.spatial)) return "spatial";
    if (value?.active === "textual" && this.availability.textual && supportsTextual(value.presentations.textual)) return "textual";
    return "desktop";
  }
  issue(): string | undefined {
    if (this.readStatus.status === "opaque") return `${this.readStatus.reason} Presentation data was preserved; Desktop is shown.`;
    const active = this.read()?.active;
    if (active !== undefined && active !== "desktop" && this.active() !== active) return "The saved presentation is not available in this build. Its layout and preference were preserved; Desktop is shown.";
  }
  read(): WorkspacePresentation | undefined {
    this.revision();
    if (!this.present || this.readStatus.status === "opaque") return;
    return structuredClone(this.value) as WorkspacePresentation;
  }
  capture(): PresentationSnapshot {
    if (this.disposed) throw new Error("Workspace presentation session is disposed.");
    return { revision: this.revision(), present: this.present, ...(this.present ? { value: structuredClone(this.value) } : {}) };
  }
  markSaved(snapshot: PresentationSnapshot) {
    if (!this.disposed && snapshot.revision === this.revision()) this.savedSignal[1](snapshot.revision);
  }
  private commit(value: WorkspacePresentation) {
    if (this.disposed) throw new Error("Workspace presentation session is disposed.");
    if (!this.enabled) throw new Error("Workspace presentation state is disabled.");
    if (this.readStatus.status === "opaque") throw new Error("Cannot edit unsupported presentation data.");
    const validated = validateWorkspacePresentation(value);
    if (this.present && JSON.stringify(validated) === JSON.stringify(this.value)) return;
    this.value = validated; this.present = true;
    this.revisionSignal[1](n => n + 1);
  }
  /** Initialization retains existing directory entries and never overwrites a layout. */
  initializeCanvas(objects: WorkspaceObject[], canvas: CanvasLayout) {
    if (!this.availability.canvas) throw new Error("Canvas is disabled.");
    const value = this.read();
    if (value?.presentations.canvas !== undefined) throw new Error("Canvas layout already exists.");
    if (value?.objects.some(previous => !objects.some(next => JSON.stringify(next) === JSON.stringify(previous)))) throw new Error("Initialize Canvas must retain the existing object directory.");
    this.commit({ ...(value ?? { version: 1, active: "desktop", presentations: { desktop: { version: 1, kind: "legacy-tree" } } }), objects, presentations: { ...(value?.presentations ?? { desktop: { version: 1, kind: "legacy-tree" } }), canvas } });
  }
  initializeTextual() {
    if (!this.availability.textual) throw new Error("Textual is disabled.");
    const value = this.read();
    if (value?.presentations.textual !== undefined) throw new Error("Textual layout already exists.");
    this.commit({ ...(value ?? { version: 1, active: "desktop", objects: [] }),
      presentations: { ...(value?.presentations ?? { desktop: { version: 1, kind: "legacy-tree" } }), textual: { version: 1, kind: "character-cell" } } });
  }
  /** The removable application decoder validates the named opaque Spatial entry. */
  initializeSpatial(objects: WorkspaceObject[], spatial: unknown) {
    const value = this.read();
    if (value?.presentations.spatial !== undefined) throw new Error("Spatial layout already exists.");
    if (!this.availability.spatial?.supports(spatial)) throw new Error("Spatial layout is unavailable or invalid.");
    if (value?.objects.some(previous => !objects.some(next => JSON.stringify(next) === JSON.stringify(previous)))) throw new Error("Initialize Spatial must retain the existing object directory.");
    this.commit({ ...(value ?? { version: 1, active: "desktop" }), objects,
      presentations: { ...(value?.presentations ?? { desktop: { version: 1, kind: "legacy-tree" } }), spatial } });
  }
  updateSpatial(spatial: unknown, objects?: WorkspaceObject[]) {
    const value = this.read();
    if (!value || value.presentations.spatial === undefined || !this.availability.spatial?.supports(spatial)) throw new Error("Spatial layout is unavailable or invalid.");
    this.commit({ ...value, objects: objects ?? value.objects, presentations: { ...value.presentations, spatial } });
  }
  /** Explicit reverse derivation; an existing (even empty) Desktop is final. */
  initializeDesktop(objects: WorkspaceObject[]) {
    const value = this.read();
    if (!value?.presentations.canvas) throw new Error("Create Desktop requires a Canvas layout.");
    if (value.presentations.desktop !== undefined) throw new Error("Desktop layout already exists.");
    this.commit({ ...value, active: "desktop", objects, presentations: { ...value.presentations, desktop: { version: 1, kind: "legacy-tree" } } });
  }
  select(active: PresentationName) {
    if (!this.available(active)) throw new Error("Presentation is disabled.");
    const value = this.read();
    if (!value) { if (active === "desktop" && this.editable()) return; throw new Error("Presentation has not been initialized."); }
    if (!value.presentations[active]) throw new Error("This workspace has no Desktop layout. Use Create Desktop from Canvas.");
    if (active === "spatial" && !this.availability.spatial?.supports(value.presentations.spatial)) throw new Error("Spatial layout is unsupported and has been preserved.");
    if (active === "textual" && !supportsTextual(value.presentations.textual)) throw new Error("Textual layout is unsupported and has been preserved.");
    this.commit({ ...value, active });
  }
  setCamera(next: CanvasCamera) {
    if (!this.availability.canvas) throw new Error("Canvas is disabled.");
    const value = this.read();
    if (!value?.presentations.canvas) throw new Error("Canvas layout does not exist.");
    value.presentations.canvas.camera = { ...value.presentations.canvas.camera, ...next };
    this.commit(value);
  }
  setBounds(placementId: string, next: CanvasBounds) {
    if (!this.availability.canvas) throw new Error("Canvas is disabled.");
    const value = this.read(), placement = value?.presentations.canvas?.placements.find(item => item.id === placementId);
    if (!placement || !value) throw new Error("Canvas placement does not exist.");
    placement.bounds = { ...placement.bounds, ...next };
    this.commit(value);
  }
  /** Canvas-only edits; other presentations and their unknown fields survive. */
  updateCanvas(canvas: CanvasLayout, objects?: WorkspaceObject[]) {
    if (!this.availability.canvas) throw new Error("Canvas is disabled.");
    const value = this.read();
    if (!value?.presentations.canvas) throw new Error("Canvas layout does not exist.");
    this.commit({ ...value, objects: objects ?? value.objects, presentations: { ...value.presentations, canvas } });
  }
  dispose() { this.disposed = true; }
}
