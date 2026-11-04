import { DocumentHostPresentations } from "./document-host-presentations";
import { createRoot, createSignal, getOwner, type Owner } from "solid-js";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { BlockTreeProjection } from "../block-tree/projection";
import { DocumentHostTransfers, type DocumentHostPort } from "./document-host-transfers";
import { existingNativeDocumentSession } from "../persistence/native-session";
import type { LocalCoordinates } from "../runtime/local-coordinates";

export interface DocumentActivity { mounted: boolean; visible: boolean; active: boolean }

/** Stable runtime context port. Only the coordinator publishes a new host. */
export class DocumentHostBinding {
  private state = createSignal<DocumentActivity>({ mounted: true, visible: false, active: false });
  readonly activity = this.state[0];
  private generation = 0;
  private route = createSignal<DocumentHostPort>();
  private suspension = createSignal(false);
  readonly suspended = this.suspension[0];
  suspend(value: boolean) { this.suspension[1](value); }
  get port() { return this.route[0](); }
  get ownerKey() { return this.port?.ownerKey ?? this.initial.ownerKey; }
  get slotKey() { return this.port?.slotKey ?? this.initial.slotKey; }
  get windowId() { return this.port?.windowId ?? this.initial.windowId; }
  readonly coordinates: LocalCoordinates;
  private initial: { ownerKey: string; slotKey: string; windowId: string };
  constructor(ownerKey: string, slotKey: string, windowId: string, coordinates: LocalCoordinates) {
    this.initial = { ownerKey, slotKey, windowId };
    this.coordinates = { scale: () => (this.port?.coordinates ?? coordinates).scale() };
  }
  bind(port: DocumentHostPort) { this.generation++; this.route[1](port); this.state[1]({ ...this.activity() }); }

  update(visible: boolean, active: boolean) {
    const previous = this.activity();
    if (!previous.mounted || previous.visible === visible && previous.active === (visible && active)) return;
    this.generation++;
    this.state[1]({ mounted: true, visible, active: visible && active });
  }
  ticket() { const generation = this.generation; return () => this.activity().mounted && generation === this.generation; }
  end() { this.generation++; this.state[1]({ mounted: false, visible: false, active: false }); }
}

export interface RetainedDocumentSession {
  readonly id: string;
  readonly projection: BlockTreeProjection;
  readonly rootKey: string;
  readonly ownsProjection: boolean;
  readonly host: DocumentHostBinding;
  readonly element: HTMLDivElement;
  readonly signal: AbortSignal;
  /** Checks session lifetime only. Visibility is a separate host ticket. */
  current(): boolean;
  ownSurface(surface: { id: string; element: HTMLElement; transferable?: boolean }): () => void;
}

/** Sole final disposal authority, created and destroyed by WorkspaceSession.
 * Membership holders request release; they never own the render disposer.
 * No resources, domain edits, Save bindings or persistent records are allocated.
 */
export class DocumentSessionStore {
  private records = new Map<string, { session: RetainedDocumentSession; dispose: () => void }>();
  private alive = true;
  private lifetime = new AbortController();
  readonly signal = this.lifetime.signal;
  readonly transfers: DocumentHostTransfers;
  readonly presentations: DocumentHostPresentations;
  detachment?: import("./document-detachment").DocumentDetachment;
  readonly saveHandlers = new Map<string, () => Promise<unknown>>();
  private privateViews = new Map<string, RetainedDocumentSession>();
  readonly saveError = createSignal<string>();
  private saveShortcut = (event: KeyboardEvent) => {
    if (!event.ctrlKey && !event.metaKey || event.altKey || event.shiftKey || event.key.toLowerCase() !== 's' || event.isComposing) return;
    const session = event.target instanceof Element ? this.forElement(event.target) : undefined;
    if (!session || this.transfers.atOrigin(session)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    void (this.saveHandlers.get(session.id)?.() ?? this.save(session)).catch(error => this.saveError[1](String(error)));
  };
  constructor(private editor: ReactiveEditor) {
    this.transfers = new DocumentHostTransfers(this, editor);
    this.presentations = new DocumentHostPresentations(editor);
    if (editor.features.documentSessionHostTransfer && typeof document !== 'undefined') document.addEventListener('keydown', this.saveShortcut, true);
  }
  forElement(element: Element) { const id = element.closest<HTMLElement>('[data-document-session]')?.dataset.documentSession; return id ? this.records.get(id)?.session : undefined; }
  forNode(key: string) {
    const node = this.editor.node(key); if (!node) return;
    return this.privateViews.get(node.viewId) ?? (this.editor.mounts.get(key)?.root ? this.forElement(this.editor.mounts.get(key)!.root) : undefined);
  }
  async save(session: RetainedDocumentSession) {
    if (!session.current()) throw Error('Document session is disposed');
    const root = session.projection.node(session.rootKey), id = (root?.payload.metadata as any)?.documentId ?? root?.payload.id;
    const native = existingNativeDocumentSession(this.editor), location = id && native?.location(id);
    if (!native || !id || !location) throw Error('Choose a native Document destination in its original host before experimental transfer');
    this.saveError[1](undefined); return native.save(id, location);
  }
  get size() { return this.records.size; }
  sessions() { return [...this.records.values()].map(record => record.session); }

  mount(options: { ownerKey: string; slotKey: string; windowId: string; placement: string;
    coordinates: LocalCoordinates; shared?: { projection: BlockTreeProjection; rootKey: string } },
    render: (session: RetainedDocumentSession) => void, owner: Owner | null = getOwner()): RetainedDocumentSession {
    if (!this.alive) throw Error("Document session store is disposed");
    if ([...this.records.values()].some(r => r.session.host.ownerKey === options.ownerKey && r.session.host.slotKey === options.slotKey))
      throw Error("Document host slot already has a session");
    const projection = options.shared?.projection ?? this.editor.createView(undefined, options.placement);
    const controller = new AbortController(), element = document.createElement("div");
    element.className = "retained-document-session";
    // The container changes neither the established scrollport nor flex geometry.
    element.style.display = "contents";
    const session: RetainedDocumentSession = {
      id: `document-session:${crypto.randomUUID()}`, projection,
      rootKey: options.shared?.rootKey ?? projection.state.rootKey, ownsProjection: !options.shared,
      host: new DocumentHostBinding(options.ownerKey, options.slotKey, options.windowId, options.coordinates),
      ownSurface: surface => this.transfers.surface(session, surface),
      element, signal: controller.signal, current: () => this.alive && !controller.signal.aborted,
    };
    element.dataset.documentSession = session.id;
    if (session.ownsProjection) this.privateViews.set(projection.viewId, session);
    let disposeRoot = () => {};
    const record = { session, dispose: () => {
      if (controller.signal.aborted) return;
      controller.abort(); session.host.end();
      try { disposeRoot(); } finally {
        element.remove();
        if (session.ownsProjection) this.editor.disposeView(projection);
      }
    } };
    this.records.set(session.id, record);
    try {
      // Detached root inherits context, not the parent's cleanup authority.
      createRoot(dispose => { disposeRoot = dispose; render(session); }, owner);
      return session;
    } catch (error) { this.release(session); throw error; }
  }
  release(session: RetainedDocumentSession) {
    const record = this.records.get(session.id);
    if (!record || record.session !== session) return;
    this.presentations.forget(session);
    this.records.delete(session.id);
    this.transfers.releaseSession(session); this.privateViews.delete(session.projection.viewId);
    record.dispose();
  }
  releaseOwner(ownerKey: string) {
    for (const { session } of [...this.records.values()]) if (session.host.ownerKey === ownerKey) this.release(session);
  }
  dispose() {
    if (!this.alive) return;
    this.alive = false; this.lifetime.abort();
    if (typeof document !== "undefined") document.removeEventListener("keydown", this.saveShortcut, true);
    this.presentations.dispose();
    this.detachment?.dispose(); this.saveHandlers.clear();
    this.transfers.dispose();
    for (const { session } of [...this.records.values()]) this.release(session);
  }
}
