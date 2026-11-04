import { batch, createSignal } from 'solid-js';
import {isRetainedGlossGraphFrame} from '../features/gloss/graph-frame';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { LocalCoordinates } from '../runtime/local-coordinates';
import { existingNativeDocumentSession } from '../persistence/native-session';
import type { DocumentSessionStore, RetainedDocumentSession } from './document-sessions';

/** E1.2 internal capabilities. No product Detach command or shell factory. */
export interface DocumentHostPort {
  readonly kind: 'flint-tab' | 'managed-document';
  readonly ownerKey: string;
  readonly slotKey: string;
  readonly windowId: string;
  readonly container: HTMLElement;
  readonly scrollport?: HTMLElement;
  readonly coordinates: LocalCoordinates;
  selected(): boolean;
  /** Optional activity of a same-owner presentation host. */
  surfaceContainer?: HTMLElement;
  activity?(): {mounted:boolean;visible:boolean;active:boolean};
}
export interface DocumentHostLease {
  readonly port: DocumentHostPort;
  readonly generation: number;
  current(): boolean;
  release(): void;
}
type Host = DocumentHostLease & { occupant?: RetainedDocumentSession; reservation?: symbol };
type Entry = { session: RetainedDocumentSession; origin: Host; host: Host };
type Surface = { id: string; element: HTMLElement; transferable?: boolean };
export type TransferStage = 'prepared' | 'attached' | 'surfaces' | 'commit';
export interface TransferOptions {
  /** Product Return can reveal the destination in a shared shell-tab group. */
  sourceMayBeHidden?: boolean;
  signal?: AbortSignal;
  /** Preparation may await; publication never does. Must honor cancellation. */
  prepare?(signal: AbortSignal): Promise<void>;
  /** Synchronous fault-injection/adapter verification boundary, before commit. */
  checkpoint?(stage: TransferStage): void;
  focus?: boolean;
}
const hostKey = (p: DocumentHostPort) => JSON.stringify([p.ownerKey, p.slotKey]);
const abortError = () => new Error('Document host transfer cancelled');

/** Same-workspace coordinator. Owns reservations, never a Solid disposer.
 * All asynchronous work precedes the synchronous reversible attachment journal.
 */
export class DocumentHostTransfers {
  private hosts = new Map<string, Host>();
  private entries = new Map<string, Entry>();
  private surfaces = new Map<string, Set<Surface>>();
  private pending = new Map<string, { controller: AbortController; source: Host; destination: Host }>();
  private serial = 0;
  private revision = createSignal(0);
  private completed = 0;
  private recovery = new Map<string, { entry: Entry; reason: string }>();
  private recoveryContainer?: HTMLDivElement;
  constructor(private store: DocumentSessionStore, private editor: ReactiveEditor) {}
  observe() { this.revision[0](); }
  recoveryReason(session: RetainedDocumentSession) { this.observe(); return this.recovery.get(session.id)?.reason; }
  eligibility(session: RetainedDocumentSession): string | undefined {
    try { const entry=this.entries.get(session.id); if(!entry)throw Error('Select a retained Document first'); this.validate(entry,entry.host,entry.host,undefined,false,false,true); }
    catch(error) { return error instanceof Error ? error.message : String(error); }
  }
  diagnostics() { return { sessions: this.entries.size, hosts: this.hosts.size, pending: this.pending.size,
    reservations: [...this.hosts.values()].filter(h => h.reservation).length, recovery: this.recovery.size, completed: this.completed }; }
  register(port: DocumentHostPort): DocumentHostLease {
    if (this.store.signal.aborted) throw Error('Workspace session is disposed');
    const key = hostKey(port);
    if (this.hosts.has(key)) throw Error('Document host slot already registered');
    const generation = ++this.serial;
    const host: Host = { port, generation, current: () => this.hosts.get(key) === host,
      release: () => {
        if (!host.current()) return;
        for (const p of this.pending.values()) if (p.source === host || p.destination === host) p.controller.abort();
        this.hosts.delete(key); this.revision[1](n=>n+1);
        // Old source cleanup has no authority over the new host's occupant.
        if (host.occupant) this.store.release(host.occupant);
      } };
    this.hosts.set(key, host); return host;
  }
  attachInitial(session: RetainedDocumentSession, lease: DocumentHostLease) {
    const host = this.host(lease);
    if (host.occupant || this.entries.has(session.id)) throw Error('Session or host already attached');
    host.occupant = session; this.entries.set(session.id, { session, origin: host, host });
    session.host.bind(host.port);
    host.port.container.append(session.element);
    this.revision[1](n => n + 1);
  }
  private host(lease: DocumentHostLease): Host {
    const host = this.hosts.get(hostKey(lease.port));
    if (!host || host !== lease || !lease.current()) throw Error('Stale or foreign Document host lease');
    return host;
  }
  current(session: RetainedDocumentSession) { return this.entries.get(session.id)?.host; }
  owns(session: RetainedDocumentSession, lease: DocumentHostLease) { return this.entries.get(session.id)?.host === lease; }
  atOrigin(session: RetainedDocumentSession) { this.revision[0](); const e = this.entries.get(session.id); return !e || e.host === e.origin; }
  surface(session: RetainedDocumentSession, surface: Surface) {
    const set = this.surfaces.get(session.id) ?? new Set<Surface>(); set.add(surface); this.surfaces.set(session.id, set);
    return () => { set.delete(surface); if (!set.size) this.surfaces.delete(session.id); };
  }
  releaseSession(session: RetainedDocumentSession) {
    this.pending.get(session.id)?.controller.abort();
    const entry = this.entries.get(session.id);
    if (entry?.host.occupant === session) entry.host.occupant = undefined;
    this.entries.delete(session.id); this.surfaces.delete(session.id); this.recovery.delete(session.id);
    this.revision[1](n => n + 1);
    if (!this.recovery.size) { this.recoveryContainer?.remove(); this.recoveryContainer = undefined; }
  }
  releaseWindow(windowId: string) { for (const host of [...this.hosts.values()]) if (host.port.windowId === windowId) host.release(); }
  hasTransferredSessions() { this.revision[0](); return [...this.entries.values()].some(e => e.host !== e.origin); }
  hasExperimentalHosts() { return !!this.pending.size || !!this.recovery.size || this.hasTransferredSessions(); }
  assertPersistable() {
    if (this.hasExperimentalHosts())
      throw Error('Return experimental Document sessions to their original hosts before saving the Workspace. Durable host topology requires the separately approved format contract.');
  }
  private contain(entry: Entry, error: unknown) {
    const container = this.recoveryContainer ??= document.createElement('div');
    container.hidden = true; container.inert = true; container.dataset.documentSessionRecovery = '';
    if (!container.isConnected) (this.editor.windowManager?.plane ?? document.body).append(container);
    container.append(entry.session.element);
    for (const surface of this.surfaces.get(entry.session.id) ?? []) container.append(surface.element);
    entry.session.host.suspend(true);
    this.recovery.set(entry.session.id, { entry, reason: String(error) }); this.revision[1](n=>n+1);
  }
  /** Explicit exceptional recovery, never a silent replacement or new host type. */
  restoreSource(session: RetainedDocumentSession) {
    const record = this.recovery.get(session.id), host = record?.entry.host;
    if (!record || !session.current() || !host?.current() || !host.port.container.isConnected ||
        !this.editor.windowManager?.groups.get(host.port.windowId)?.contains(host.port.container)) throw Error('Original host is not available for explicit recovery');
    host.port.container.append(session.element);
    for (const surface of this.surfaces.get(session.id) ?? []) this.editor.windowManager!.groups.get(host.port.windowId)!.append(surface.element);
    session.host.bind(host.port); session.host.suspend(false);
    this.recovery.delete(session.id); this.revision[1](n=>n+1);
    if (!this.recovery.size) { this.recoveryContainer?.remove(); this.recoveryContainer = undefined; }
  }
  private validate(entry: Entry, source: Host, destination: Host, token?: symbol, attached = false, movedSurfaces = false, probe = false, sourceMayBeHidden = false) {
    const { session } = entry, manager = this.editor.windowManager;
    if (this.recovery.has(session.id)) throw Error('Restore the lost source host explicitly before another transfer');
    if (!this.editor.features.documentSessionHostTransfer) throw Error('Document host transfer is disabled');
    if (!session.current() || this.entries.get(session.id) !== entry || entry.host !== source || source.occupant !== session)
      throw Error('Stale Document session ownership');
    this.host(source); this.host(destination);
    if (!probe && (source === destination || destination.occupant || destination.reservation && destination.reservation !== token))
      throw Error('Destination is occupied or reserved');
    if (session.host.port !== source.port) throw Error("Restore the Document presentation before transferring between windows");
    if (!manager?.layout.active()) throw Error('Document transfer requires the managed Desktop');
    for (const host of [source, destination]) {
      const p = host.port, group = manager.groups.get(p.windowId);
      if (!p.container.isConnected || p.container.ownerDocument !== session.element.ownerDocument || !group?.contains(p.container))
        throw Error('Document host is disconnected, foreign or outside its managed window');
      if ((!manager.registry.windows[p.windowId]?.visible && !(sourceMayBeHidden && host === source)) || !p.selected()) throw Error("Select and reveal the Document hosts before transferring");
      if (!manager.lifecycle.canTransfer(p.windowId) || manager.geometry.controllers.get(p.windowId)?.mode() || manager.layout.dividerActive())
        throw Error('Finish composition, gestures, dialogs or pending close before transferring');
    }
    if (!attached && !source.port.container.contains(session.element)) throw Error('Source attachment changed');
    const root = session.projection.node(session.rootKey), state = this.editor.repository.state;
    const content = root && state.contents[root.contentKey];
    const resource = content && ((content.payload.metadata as any)?.documentId ?? content.payload.id);
    if (root?.viewType !== 'document-block' || typeof resource !== 'string' || !resource ||
        Object.values(state.contents).filter(c => c.viewType === 'document-block' && ((c.payload.metadata as any)?.documentId ?? c.payload.id) === resource).length !== 1)
      throw Error('Document resource is missing or ambiguous');
    const native = existingNativeDocumentSession(this.editor)?.knowledgeEvidence(resource);
    if (native?.pending || native?.admitting || native?.closed)
      throw Error('Finish the affected Document Save, receipt, relocation or recovery before transferring');
    // Interchange currently exposes one workspace-wide task, not a resource lease.
    // Do not cancel a shell-owned import/export merely to allow presentation transfer.
    if (this.editor.interchange.busy() || this.editor.interchange.picker() || this.editor.interchange.question())
      throw Error('Finish the current import/export or resource picker before transferring');
    if (this.editor.viewCloseGuards.has(source.port.slotKey)) throw Error('Document tab close guard requires an explicit transfer adapter');
    const operation = this.editor.currentTextOperation.active();
    if (operation && Object.values(session.projection.state.nodes).some(n => operation.owns(n.key))) throw Error('Finish the affected text operation before transferring');
    if (this.editor.selectionGestures.owner()) throw Error('Finish the selection gesture before transferring');
    if ([...session.element.querySelectorAll('iframe,video,audio,canvas,[data-positioned-block],[data-relation-name], [data-block-type="window-block"], [data-block-type="document-window-block"]')].some(element=>!isRetainedGlossGraphFrame(element)))
      throw Error('Document contains an unqualified embedded surface');
    for (const element of session.element.querySelectorAll<HTMLElement>('[data-client-id]')) {
      const n = this.editor.node(element.dataset.clientId!);
      if (n && (this.editor.registry.hasCapability(n.viewType, 'opaque-widget') || this.editor.registry.hasCapability(n.viewType, 'native-text') || this.editor.registry.hasCapability(n.viewType, 'canvas-preview') || /application-block$/.test(n.viewType) ||
          this.editor.registry.hasCapability(n.viewType, 'inline-editor') && n.viewType !== 'standoff-editor-block'))
        throw Error('Document contains an unqualified editor or application');
    }
    const surfaces = [...(this.surfaces.get(session.id) ?? [])], ids = new Set(surfaces.map(s => s.id));
    for (const overlay of this.editor.overlays.overlays) {
      if (this.store.forNode(overlay.ownerKey) === session && !ids.has(overlay.key))
        throw Error('Document overlay is owned outside the retained session and requires a transfer adapter');
    }
    for (const record of Object.values(manager.registry.surfaces)) {
      if (record.sourceNodeKey && this.store.forNode(record.sourceNodeKey) === session && !ids.has(record.id))
        throw Error('Document surface is owned outside the retained session and requires a transfer adapter');
    }
    for (const s of surfaces) {
      if (!s.transferable) throw Error('Document surface requires a qualified transfer adapter');
      const record = manager.registry.surfaces[s.id];
      if (!record || record.modality !== 'none' || record.ownerWindowId !== (movedSurfaces ? destination.port.windowId : source.port.windowId) || record.parentSurfaceId && !ids.has(record.parentSurfaceId))
        throw Error('Document surface cannot transfer independently');
    }
    return resource;
  }
  async transfer(session: RetainedDocumentSession, lease: DocumentHostLease, options: TransferOptions = {}) {
    const entry = this.entries.get(session.id);
    if (!entry || this.pending.has(session.id)) throw Error('Session is unhosted or already transferring');
    const source = entry.host, destination = this.host(lease), manager = this.editor.windowManager!;
    const resource = this.validate(entry, source, destination, undefined, false, false, false, options.sourceMayBeHidden);
    if (options.signal?.aborted) throw abortError();
    const controller = new AbortController(), token = Symbol('transfer');
    destination.reservation = token; this.pending.set(session.id, { controller, source, destination });
    const cancel = () => controller.abort();
    options.signal?.addEventListener('abort', cancel, { once: true }); session.signal.addEventListener('abort', cancel, { once: true });
    const unlock = manager.lifecycle.holdTransfer([source.port.windowId, destination.port.windowId], cancel);
    const sourceGeneration = manager.registry.windows[source.port.windowId].generation, destinationGeneration = manager.registry.windows[destination.port.windowId].generation;
    const current = (attached = false, movedSurfaces = false) => {
      if (controller.signal.aborted || manager.registry.windows[source.port.windowId]?.generation !== sourceGeneration || manager.registry.windows[destination.port.windowId]?.generation !== destinationGeneration) throw abortError();
      if (this.validate(entry, source, destination, token, attached, movedSurfaces, false, options.sourceMayBeHidden) !== resource) throw Error("Document resource authority changed during preparation");
    };
    const checkpoint = (stage: TransferStage) => {
      const result: unknown = options.checkpoint?.(stage);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        void Promise.resolve(result).catch(() => {}); throw Error('Transfer attachment checkpoints must be synchronous');
      }
    };
    try {
      if (options.prepare) {
        let stop!: () => void;
        try { await Promise.race([options.prepare(controller.signal), new Promise<never>((_, reject) => {
          stop = () => reject(abortError()); controller.signal.addEventListener('abort', stop, { once: true }); if (controller.signal.aborted) stop();
        })]); } finally { if (stop) controller.signal.removeEventListener('abort', stop); }
      }
      checkpoint('prepared'); current();
      // Capture after asynchronous preparation: typing remains live beforehand.
      let focusCurrent = manager.lifecycle.ticket();
      const element = document.activeElement as HTMLElement | null;
      const focused = element && (this.store.forElement(element) === session || session.element.contains(element) || [...(this.surfaces.get(session.id) ?? [])].some(s => s.element.contains(element))) ? element : undefined;
      const resolved = focused && this.editor.mounts.resolveElement(focused), handle = resolved && resolved.handle;
      const inline = handle?.captureInlineSelection?.(), native = handle?.captureSelection?.() ??
        (focused instanceof HTMLTextAreaElement && focused.selectionStart !== null ? { start: focused.selectionStart, end: focused.selectionEnd, direction: focused.selectionDirection } : undefined);
      const cross = this.editor.crossText.range();
      const ownCross = cross && this.store.forNode(cross.anchor.occurrenceKey) === session ? cross : undefined;
      const selection = document.getSelection(), anchor = selection?.anchorNode, anchorOffset = selection?.anchorOffset, focusNode = selection?.focusNode, focusOffset = selection?.focusOffset;
      const sourceScroll = source.port.scrollport ?? source.port.container, destinationScroll = destination.port.scrollport ?? destination.port.container;
      const scroll = { top: sourceScroll.scrollTop, left: sourceScroll.scrollLeft }, previousScroll = { top: destinationScroll.scrollTop, left: destinationScroll.scrollLeft };
      const next = session.element.nextSibling, inert = session.element.inert;
      const surfaces = [...(this.surfaces.get(session.id) ?? [])].map(surface => ({ ...surface, parent: surface.element.parentNode!, next: surface.element.nextSibling }));
      const restoreFocus = () => {
        if (options.focus === false || !focusCurrent() || !focused?.isConnected || focused.closest('[hidden],[inert]')) return;
        focused.focus({ preventScroll: true });
        if (native) {
          if (handle?.restoreSelection) handle.restoreSelection(native);
          else if (focused instanceof HTMLTextAreaElement) focused.setSelectionRange(native.start, native.end, native.direction);
        }
        if (manager.lifecycle.owner(focused) === session.host.windowId) manager.registry.observeFocus(session.host.windowId);
        if (ownCross) this.editor.crossText.set(ownCross.anchor, ownCross.head);
        if (inline) handle?.restoreInlineSelection?.(inline);
        else if (anchor?.isConnected && focusNode?.isConnected) selection?.setBaseAndExtent(anchor, anchorOffset!, focusNode, focusOffset!);
      };
      let attached = false, movedSurfaces = false;
      try {
        session.element.inert = true;
        destination.port.container.append(session.element); attached = true;
        checkpoint('attached');
        current(true);
        manager.registry.rehostSurfaces(surfaces.map(s => s.id), destination.port.windowId);
        movedSurfaces = true;
        for (const s of surfaces) manager.groups.get(destination.port.windowId)!.append(s.element);
        checkpoint('surfaces'); checkpoint('commit');
        current(true, true);
        batch(() => {
          source.occupant = undefined; destination.occupant = session; entry.host = destination;
          session.host.bind(destination.port);
          this.revision[1](n => n + 1);
        });
      } catch (error) {
        if (session.current()) {
          if (movedSurfaces) {
            manager.registry.rehostSurfaces(surfaces.map(s => s.id), source.port.windowId);
            for (const s of surfaces) s.parent.insertBefore(s.element, s.next?.parentNode === s.parent ? s.next : null);
          }
          if (!source.port.container.isConnected || !source.current()) {
            this.contain(entry, error);
            throw Error('Transfer failed and its source slot disappeared; session retained for explicit source recovery');
          }
          if (attached) source.port.container.insertBefore(session.element, next?.parentNode === source.port.container ? next : null);
          batch(() => { destination.occupant = undefined; source.occupant = session; entry.host = source; session.host.bind(source.port); });
          session.element.inert = inert; restoreFocus(); sourceScroll.scrollTop = scroll.top; sourceScroll.scrollLeft = scroll.left;
          destinationScroll.scrollTop = previousScroll.top; destinationScroll.scrollLeft = previousScroll.left;
        }
        throw error;
      } finally { if (session.current()) session.element.inert = inert; }
      // Commit is final. A focus failure never triggers an implicit reverse transfer.
      this.completed++;
      const mayRestore = focusCurrent(); manager.lifecycle.invalidateHostFocus();
      focusCurrent = mayRestore ? manager.lifecycle.ticket() : () => false;
      let focusError: string | undefined;
      try { restoreFocus(); } catch (error) { focusError = String(error); }
      // A host may expose a scroller inside the editing subtree, which did not
      // exist in the empty destination before attachment (e.g. a Flint tab).
      const committedScroll = destination.port.scrollport ?? destination.port.container;
      committedScroll.scrollTop = scroll.top; committedScroll.scrollLeft = scroll.left;
      manager.layout.invalidateMinimum(source.port.windowId); manager.layout.invalidateMinimum(destination.port.windowId);
      return { committed: true as const, focusError };
    } catch (error) {
      if (session.current() && entry.host === source && !source.port.container.isConnected) {
        this.contain(entry, error);
        throw Error('Transfer failed and its source slot disappeared; session retained for explicit source recovery');
      }
      throw error;
    } finally {
      if (destination.reservation === token) destination.reservation = undefined;
      if (this.pending.get(session.id)?.controller === controller) this.pending.delete(session.id);
      unlock(); options.signal?.removeEventListener('abort', cancel); session.signal.removeEventListener('abort', cancel);
    }
  }
  dispose() { for (const p of this.pending.values()) p.controller.abort(); for (const host of [...this.hosts.values()]) host.release(); this.hosts.clear(); this.entries.clear(); this.surfaces.clear(); this.pending.clear(); this.recovery.clear(); this.recoveryContainer?.remove(); this.recoveryContainer = undefined; }
}
