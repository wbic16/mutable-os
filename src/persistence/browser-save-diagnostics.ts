import { featureFlags } from '../configuration';

export const diagnosticRetention = { maxEvents: 200, maxAgeMs: 7 * 24 * 60 * 60 * 1000 } as const;
type Fields = { action?: string; requestId?: string; resourceId?: string; generation?: string; filename?: string; cavernId?: string; status?: number; phase?: string; accepted?: boolean; preflight?: boolean; error?: string; elapsedMs?: number };
export type SaveDiagnostic = Fields & { event: string; utc: string; timestamp: number; browserSession: string };
const allowed = ['action', 'requestId', 'resourceId', 'generation', 'filename', 'cavernId', 'status', 'phase', 'accepted', 'preflight', 'error', 'elapsedMs'] as const;

/** Error classifications only: server messages can contain authored text or secrets. */
export function diagnosticError(error: unknown) {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'request-aborted';
    if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) return 'network-request-failed';
    if (error.cause instanceof TypeError && /fetch|network|load failed/i.test(error.cause.message)) return 'network-request-failed';
  }
  return 'request-failed';
}

/** Explicit Save and connection events only. Never subscribe to editor changes. */
export class BrowserSaveDiagnostics {
  private database?: Promise<IDBDatabase>;
  private pending = Promise.resolve();
  private queued = 0;
  private droppedEvents = 0;
  private memory: SaveDiagnostic[] = [];
  private storageError?: string;
  private session = crypto.randomUUID();
  constructor(private enabled: () => boolean = () => featureFlags.browserSaveDiagnostics, private now = () => Date.now()) {}

  private open() {
    return this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(Error('IndexedDB unavailable')); return; }
      const request = indexedDB.open('mutable-save-diagnostics', 1);
      let abandoned = false;
      const timeout = setTimeout(() => { abandoned = true; reject(Error('IndexedDB open timed out')); }, 3000);
      request.onupgradeneeded = () => request.result.createObjectStore('events', { autoIncrement: true }).createIndex('timestamp', 'timestamp');
      request.onsuccess = () => {
        clearTimeout(timeout);
        if (abandoned) { request.result.close(); return; }
        request.result.onversionchange = () => { request.result.close(); this.database = undefined; };
        resolve(request.result);
      };
      request.onerror = request.onblocked = () => { clearTimeout(timeout); abandoned = true; reject(Error('IndexedDB unavailable or blocked')); };
    });
  }

  private async persist(entry?: SaveDiagnostic) {
    const db = await this.open(), cutoff = this.now() - diagnosticRetention.maxAgeMs;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('events', 'readwrite'), store = tx.objectStore('events');
      tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error ?? Error('Diagnostic write failed'));
      if (entry) store.add(entry);
      const expired = store.index('timestamp').openCursor(IDBKeyRange.upperBound(cutoff));
      expired.onsuccess = () => {
        const cursor = expired.result;
        if (cursor) { cursor.delete(); cursor.continue(); return; }
        const count = store.count();
        count.onsuccess = () => {
          let excess = count.result - diagnosticRetention.maxEvents;
          if (excess <= 0) return;
          const oldest = store.openCursor();
          oldest.onsuccess = () => { const cursor = oldest.result; if (cursor && excess-- > 0) { cursor.delete(); cursor.continue(); } };
        };
      };
    });
  }

  private enqueue(entry?: SaveDiagnostic) {
    // A blocked database must not accumulate an unbounded queue or delay Save.
    if (this.queued >= diagnosticRetention.maxEvents) { if (entry) this.droppedEvents++; return; }
    this.queued++;
    this.pending = this.pending.then(() => this.persist(entry)).catch(() => {
      this.storageError = 'Browser diagnostic storage is unavailable; only this session’s retained events are included.';
    }).finally(() => { this.queued--; });
  }
  record(event: string, fields: Fields = {}) {
    if (!this.enabled()) return;
    const timestamp = this.now();
    const entry: SaveDiagnostic = { event: event.slice(0, 80), utc: new Date(timestamp).toISOString(), timestamp, browserSession: this.session };
    for (const key of allowed) {
      const value = fields[key];
      if (typeof value === 'string') (entry as any)[key] = value.slice(0, 160);
      else if (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) (entry as any)[key] = value;
    }
    this.memory = [...this.memory.filter(e => e.timestamp > timestamp - diagnosticRetention.maxAgeMs), entry].slice(-diagnosticRetention.maxEvents);
    this.enqueue(entry);
  }
  async read() {
    if (!this.enabled()) return { version: 1, disabled: true, events: [] as SaveDiagnostic[] };
    this.enqueue(); await this.pending;
    let events: SaveDiagnostic[];
    try {
      const db = await this.open();
      events = await new Promise<SaveDiagnostic[]>((resolve, reject) => {
        const tx = db.transaction('events', 'readonly'), request = tx.objectStore('events').getAll();
        tx.oncomplete = () => resolve(request.result); tx.onabort = tx.onerror = () => reject(tx.error);
      });
      if (this.storageError || this.droppedEvents) events = [...new Map([...events, ...this.memory].map(e => [JSON.stringify(e), e])).values()];
    } catch { events = this.memory; }
    events = events.filter(e => e.timestamp > this.now() - diagnosticRetention.maxAgeMs).slice(-diagnosticRetention.maxEvents);
    return { version: 1, retention: diagnosticRetention, storageError: this.storageError, droppedEvents: this.droppedEvents, events };
  }
}

export const browserSaveDiagnostics = new BrowserSaveDiagnostics();
export async function downloadSaveDiagnostics() {
  const report = await browserSaveDiagnostics.read();
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'mutable-save-diagnostics.json';
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
