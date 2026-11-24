import type { MountHandle } from './mounts';

export interface EditorInputCapability {
  ownership: 'self-managed';
  root: HTMLElement;
  /** SDK context, not a retained selection or host focus intention. No layout reads. */
  readContext(): 'content' | 'auxiliary' | 'outside';
  onActivate?(): void;
  onDeactivate?(): void;
}

export interface EditorInputBoundary {
  readonly handle: MountHandle;
  readonly nodeKey: string;
  readonly valid: () => boolean;
}
type Registration = EditorInputBoundary & { document: Document; dispose(): void };
const boundaries = new WeakMap<Node, Registration>();
const documents = new WeakMap<Document, InputOwnership>();
const isNode = (value: unknown): value is Node => !!value && typeof (value as Node).nodeType === 'number';

function at(node: Node | null): Registration | undefined {
  for (let current = node; current; current = current.parentNode ?? (current as ShadowRoot).host) {
    const entry = boundaries.get(current);
    if (entry?.valid()) return entry;
  }
}
function active(document: Document): Element | null {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element;
}

/** Source boundary remains valid even when its editing lease is inactive. */
export function editorInputBoundary(event: Event): EditorInputBoundary | undefined {
  if (!isNode(event.target)) return;
  const document = event.target.nodeType === 9 ? event.target as Document : event.target.ownerDocument;
  if (!document || !documents.has(document)) return;
  for (const target of event.composedPath?.() ?? []) {
    if (!isNode(target)) continue;
    const entry = boundaries.get(target);
    if (entry?.valid()) return entry;
  }
  if (event.type === 'selectionchange' && event.target.nodeType === 9) {
    const doc = event.target as Document;
    return at(active(doc)) ?? at(doc.getSelection()?.anchorNode ?? null);
  }
  return at(event.target);
}

export function currentEditorInput(document: Document): EditorInputBoundary | undefined {
  const owner = documents.get(document)?.owner;
  return owner?.valid() ? owner : undefined;
}

/** One small focus lease per DOM document, shared by all MountRegistries. */
class InputOwnership {
  count = 0;
  owner?: Registration;
  context?: Registration;
  private epoch = 0;
  private blurred = false;
  constructor(readonly document: Document) {
    for (const type of ['focusin', 'focusout', 'pointerdown', 'keydown']) document.addEventListener(type, this.engage, true);
    document.defaultView?.addEventListener('blur', this.blur);
    document.defaultView?.addEventListener('focus', this.refocus);
  }
  private set(next?: Registration, context = next) {
    this.epoch++;
    this.context = context;
    if (this.owner === next) return;
    const old = this.owner;
    this.owner = next;
    old?.handle.editorInput?.onDeactivate?.();
    next?.handle.editorInput?.onActivate?.();
  }
  private reconcile(entry?: Registration) {
    if (this.blurred || !entry?.valid()) { this.set(); return; }
    const focus = entry.handle.editorInput!.readContext();
    this.set(focus === 'content' && at(active(this.document)) === entry ? entry : undefined, entry);
  }
  private engage = (event: Event) => {
    const entry = editorInputBoundary(event) as Registration | undefined;
    // An earlier capture handler may navigate and synchronously deliver focusin
    // before this original key reaches us. Do not revoke the destination lease.
    if (event.type === 'keydown' && (event.defaultPrevented || entry !== at(active(this.document)))) return;
    if (event.type === 'focusout') {
      const epoch = ++this.epoch;
      queueMicrotask(() => { if (epoch === this.epoch) this.reconcile(at(active(this.document))); });
    } else if (event.type === 'pointerdown') {
      if (!entry) this.set();
      else this.reconcile(entry); // first click is classified before native focus arrives
    } else if (event.type !== 'keydown' || !(event as KeyboardEvent).isComposing) {
      this.reconcile(entry);
    }
  };
  private blur = () => { this.blurred = true; this.set(); };
  private refocus = () => { this.blurred = false; this.reconcile(at(active(this.document))); };
  release(entry: Registration) {
    if (this.context === entry || this.owner === entry) this.set();
  }
  restore(entry: Registration) {
    if (!this.blurred && this.context === entry && entry.valid()) entry.handle.focus();
  }
  dispose() {
    this.set();
    for (const type of ['focusin', 'focusout', 'pointerdown', 'keydown']) this.document.removeEventListener(type, this.engage, true);
    this.document.defaultView?.removeEventListener('blur', this.blur);
    this.document.defaultView?.removeEventListener('focus', this.refocus);
  }
}

export function registerEditorInput(nodeKey: string, handle: MountHandle, current: () => boolean): () => void {
  const capability = handle.editorInput!;
  const document = capability.root.ownerDocument;
  if (handle.root.ownerDocument !== document || !handle.root.contains(capability.root)) throw new Error('Editor input boundary must belong to its mounted root');
  let controller = documents.get(document);
  if (!controller) documents.set(document, controller = new InputOwnership(document));
  controller.count++;
  let live = true;
  const entry: Registration = { nodeKey, handle, document,
    valid: () => live && current() && capability.root.isConnected && capability.root.ownerDocument === document && handle.root.contains(capability.root),
    dispose: () => {
      if (!live) return;
      live = false;
      controller!.release(entry);
      if (boundaries.get(capability.root) === entry) boundaries.delete(capability.root);
      if (!--controller!.count) { controller!.dispose(); documents.delete(document); }
    },
  };
  boundaries.set(capability.root, entry);
  return entry.dispose;
}

/** Explicit portal affiliation. Close may restore only its still-current context. */
export function affiliateEditorInput(handle: MountHandle, root: HTMLElement): (restore?: boolean) => void {
  const entry = handle.editorInput && boundaries.get(handle.editorInput.root);
  if (!entry || entry.handle !== handle || root.ownerDocument !== entry.document) return () => {};
  boundaries.set(root, entry);
  return (restore = false) => {
    if (boundaries.get(root) !== entry) return;
    if (restore) documents.get(entry.document)?.restore(entry);
    boundaries.delete(root);
  };
}
