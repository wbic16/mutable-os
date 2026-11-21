import type { HistoryChanges } from "../block-tree/compact-changes";
import type { DeepReadonly } from "../block-tree/commit-capture";
/** Main-thread bridge: immutable compact capture only; durable work and reads live
 * in the worker. A 64-message ceiling is a visible stopped enrollment, never loss. */
import { freeze } from "../block-tree/commit-capture";
import type { CanonicalRepository } from "../block-tree/repository";
import type { RepositoryState } from "../block-tree/types";
import { DURABLE_LIMITS, type HistoryDocumentEnvelope } from "./durable-core";
import type { HistoryOutboxStatus } from "./persistent-outbox";
import type { HistorySelection, ReadonlyHistorySession, SessionHistoryRecorder } from "./ui-session-source";

export interface DurableLocation { folder: string; filename: string; resourceId: string; memoirId?: string }
export interface DurableSegment {
  segmentId: string; revisionId: string; headSequence: number; headRevisionId: string;
  metadata: { timestamp?: string; label?: string; [key: string]: unknown };
}
export interface DurableRecorderStatus extends HistoryOutboxStatus {
  phase: "starting" | "recording" | "offline" | "stopped" | "closed";
  message: string; pendingCapture: number; memoirId?: string; segmentId?: string;
}
export interface DurableHistorySource extends SessionHistoryRecorder {
  open(selection: HistorySelection, signal?: AbortSignal, segmentId?: string): Promise<ReadonlyHistorySession>;
  sessions(): Promise<DurableSegment[]>;
  save(filename: string, folder: string, createOnly?: boolean, captured?: RepositoryState): Promise<{ document: HistoryDocumentEnvelope; revision: number; warning?: string }>;
  preflightRestore?(proposal: DeepReadonly<HistoryChanges>, signal?: AbortSignal): Promise<void>;
  status(): Readonly<DurableRecorderStatus>;
  subscribeStatus(listener: (status: Readonly<DurableRecorderStatus>) => void): () => void;
}
const cancelled = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException("History request cancelled", "AbortError"); };

export async function createDurableHistorySource(repository: CanonicalRepository,
  file: { folder: string; filename: string }, identity: { resourceId: string; memoirId?: string }): Promise<DurableHistorySource> {
  const live = repository.readState();
  if(repository.compactCanonicalText||Object.values(live.contents).some(c=>c.compactInline))throw Error('Persistent compact History enrollment is not yet qualified. Native Save and session Undo/Redo remain available.');
  if (Object.keys(live.contents).length + Object.keys(live.placements).length > DURABLE_LIMITS.maxGraphRecords) {
    throw new Error("Document graph exceeds the admitted bounded history reader size.");
  }
  const worker = new Worker(new URL("./durable.worker.ts", import.meta.url), { type: "module" });
  let disposed = false, failure: string | undefined, nextRequest = 0;
  let status: DurableRecorderStatus = { phase: "starting", message: "Opening durable Document history…", pendingCapture: 0,
    browserCommitted: 0, serverDurable: 0, verified: 0, pendingCount: 0, pendingBytes: 0 };
  const listeners = new Set<(status: Readonly<DurableRecorderStatus>) => void>();
  const requests = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  const pending = new Set<string>();
  let grant: { location: DurableLocation; epoch: string } | undefined;
  const publish = (patch: Partial<DurableRecorderStatus>) => {
    status = Object.freeze({ ...status, ...patch, pendingCapture: pending.size });
    for (const listener of listeners) listener(status);
  };
  const failed = (reason: string) => {
    failure ??= reason;
    publish({ phase: "stopped", message: `${failure} Capture stopped; earlier durable history is retained. Normal editing and undo are unchanged.` });
  };
  const rpc = (kind: string, data: Record<string, unknown> = {}, signal?: AbortSignal): Promise<any> => {
    cancelled(signal);
    if (disposed) return Promise.reject(new Error("Document history is closed"));
    const id = ++nextRequest;
    return new Promise((resolve, reject) => {
      const abort = () => { requests.delete(id); worker.postMessage({ kind: "cancel", requestId: id }); reject(new DOMException("History request cancelled", "AbortError")); };
      const finish = (callback: (value: any) => void) => (value: any) => { signal?.removeEventListener("abort", abort); callback(value); };
      requests.set(id, { resolve: finish(resolve), reject: finish(reject) });
      signal?.addEventListener("abort", abort, { once: true }); worker.postMessage({ ...data, kind, id });
    }).then(value => { cancelled(signal); return value; });
  };
  worker.onmessage = ({ data }) => {
    if (data.captured) { pending.delete(data.captured); publish({}); }
    if (data.grant) grant = data.grant;
    if (data.status && !failure) publish(data.status);
    if (data.status?.phase === "stopped") failed(data.status.message);
    if (data.fatal) failed(data.fatal);
    if (data.id) {
      const request = requests.get(data.id); requests.delete(data.id);
      if (data.error) request?.reject(new Error(data.error)); else request?.resolve(data.result);
    }
  };
  worker.onerror = event => {
    failed(event.message || "History worker failed");
    for (const request of requests.values()) request.reject(new Error(failure)); requests.clear();
  };
  // No asynchronous gap is permitted between baseline and subscription.
  const baseline = repository.snapshot();
  const initialized = rpc("init", { baseline, location: { ...file, ...identity } });
  const unsubscribe = repository.subscribeHistoryChanges(event => {
    if (disposed || failure) return;
    if (pending.size >= 64) { failed("The 64-message history capture queue is full."); return; }
    pending.add(event.commitId);
    try { worker.postMessage({ kind: "capture", event }); publish({}); }
    catch (error) { failed(String(error)); }
  }, error => failed(`History capture failed: ${String(error)}`));
  const close = () => {
    if (disposed) return;
    unsubscribe(); worker.postMessage({ kind: "close" }); disposed = true;
    publish({ phase: "closed", message: "Document history closed; committed outbox records remain recoverable." });
    window.removeEventListener("pagehide", pageHide);
    for (const request of requests.values()) request.reject(new Error("Document history closed")); requests.clear();
    // Ordered close acknowledges all messages ahead of it before termination.
    // A blocked network does not erase the strict-IDB outbox.
    worker.addEventListener("message", event => { if (event.data.closed) worker.terminate(); });
  };
  const pageHide = () => {
    if (grant) void fetch("/api/history/release", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(grant), keepalive: true }).catch(() => {});
  };
  window.addEventListener("pagehide", pageHide);
  try { await initialized; }
  catch (error) { unsubscribe(); window.removeEventListener("pagehide", pageHide); worker.terminate(); throw error; }
  return Object.freeze({
    status: () => status,
    preflightRestore: (proposal: DeepReadonly<HistoryChanges>, signal?: AbortSignal) => rpc("preflightRestore", { proposal }, signal),
    subscribeStatus(listener: (status: Readonly<DurableRecorderStatus>) => void) { listeners.add(listener); listener(status); return () => listeners.delete(listener); },
    sessions: () => rpc("sessions"),
    async save(filename: string, folder: string, createOnly = false, captured?: RepositoryState) {
      // Save is an explicit full-state operation. Capture failure must not replace
      // current authored content with the earlier recorded prefix or block Save.
      const baseline = captured ?? repository.snapshot();
      return rpc("save", { filename, folder, createOnly, baseline, sourceRevision: baseline.revision, captureFailure: failure });
    },
    async open(selection: HistorySelection, signal?: AbortSignal, segmentId?: string): Promise<ReadonlyHistorySession> {
      const opened = await rpc("openReader", { selection, segmentId }, signal);
      return Object.freeze({ storage: "persistent" as const, headRevisionId: opened.headRevisionId, segmentId: opened.segmentId,
        dispose() { if (!disposed) worker.postMessage({ kind: "closeReader", readerId: opened.readerId }); },
        get status() { return failure ? "incomplete" as const : "available" as const; },
        get message() { return `Persistent Document history. This view has a fixed, server-verified head. ${failure ?? ""}`; },
        async timeline(options: { cursor?: string; limit?: number; signal?: AbortSignal } = {}) { return freeze(await rpc("timeline", { readerId: opened.readerId, cursor: options.cursor, limit: options.limit }, options.signal)); },
        readAuthoredBlock: (revisionId: string, options: { signal?: AbortSignal } = {}) => rpc("readAuthoredBlock", { readerId: opened.readerId, revisionId }, options.signal).then(freeze),
        async select(revisionId: string, options: { signal?: AbortSignal } = {}) {
          const start = performance.now(), result = await rpc("select", { readerId: opened.readerId, revisionId }, options.signal);
          const received = performance.now(); if (result.timing) result.timing.roundTripMs = received - start;
          const timing = result.timing; delete result.timing;
          const frozen = freeze(result); if (timing) timing.resultFreezeMs = performance.now() - received;
          return freeze({ ...frozen, timing });
        },
      });
    },
    dispose: close,
  });
}
