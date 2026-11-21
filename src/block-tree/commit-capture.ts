import { recordOperations } from "./record-batch";
import { clone } from "./clone";
import type { BlockId, CommitId, ContentKey, ContentRecord, PlacementKey, PlacementRecord, RepositoryOperation, RepositoryState } from "./types";

export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export type CommitCause = { kind: "edit" } | { kind: "undo" | "redo"; sourceCommitId: CommitId };

export interface BlockCommitSubject {
  contentKey: ContentKey;
  placementKey?: PlacementKey;
  blockId?: BlockId;
}

export interface CommandDescriptor {
  commandId: string;
  subjects: BlockCommitSubject[];
  relation?:
    | { kind: "split"; source: BlockCommitSubject; created: BlockCommitSubject; at: number }
    | { kind: "join"; survivor: BlockCommitSubject; absorbed: BlockCommitSubject; at: number }
    | { kind: "copy"; pairs: Array<{ source: BlockCommitSubject; copy: BlockCommitSubject }> }
    | { kind: "replace"; previous: BlockCommitSubject; next: BlockCommitSubject }
    | { kind: "cross-text-replace"; inputs: BlockCommitSubject[]; outputs: BlockCommitSubject[] };
  clipboard?: { token: string; action: "cut" | "paste"; preservedIds?: boolean };
}

export interface InputIntent {
  kind?: "typing" | "paste" | "selection-replacement" | "composition";
  boundaryBefore?: "composition" | "paste" | "selection-replacement" | "relocation" | "focus";
  occurrenceToken?: string;
}
/** Descriptive hints are optional; malformed/unknown members never break capture. */
export function normalizeInputIntent(value: unknown): InputIntent | undefined {
  if (!value || typeof value !== "object") return;
  const input = value as Record<string, unknown>, result: InputIntent = {};
  if (typeof input.kind === "string" && ["typing", "paste", "selection-replacement", "composition"].includes(input.kind)) result.kind = input.kind as InputIntent["kind"];
  if (typeof input.boundaryBefore === "string" && ["composition", "paste", "selection-replacement", "relocation", "focus"].includes(input.boundaryBefore)) result.boundaryBefore = input.boundaryBefore as InputIntent["boundaryBefore"];
  if (typeof input.occurrenceToken === "string") result.occurrenceToken = input.occurrenceToken;
  return Object.keys(result).length ? result : undefined;
}
export interface CommitMetadata { /** Reject unproved local batches before broad fallback. */ requireBounded?:boolean; cause?: CommitCause; commands?: CommandDescriptor[]; inputIntent?: InputIntent }
export interface RecordDelta<K, T> { key: K; before: T | null; after: T | null }
export interface RepositoryCommitResult {
  commitId: CommitId;
  label: string;
  timestamp: string;
  cause: CommitCause;
  undoRecorded: boolean;
  beforeRevision: number;
  afterRevision: number;
  root: { before: PlacementKey; after: PlacementKey };
  contents: RecordDelta<ContentKey, ContentRecord>[];
  placements: RecordDelta<PlacementKey, PlacementRecord>[];
  commands: CommandDescriptor[];
  inputIntent?: InputIntent;
}
export interface RepositoryOptions {
  /** Admission policy only; existing content never changes representation. */
  compactCanonicalText?: boolean;
  enforceBlockIdentity?: boolean;
  /** Repository-semantic evidence, enabled by default. False retains count-only
   * bookkeeping for compatibility/rollback; cannot be changed after construction. */
  resourceBoundaryEvidence?: boolean;
}

export interface PreparedCommitCapture {
  revision: number;
  root: PlacementKey;
  contents: Map<ContentKey, ContentRecord | null>;
  placements: Map<PlacementKey, PlacementRecord | null>;
  metadata: CommitMetadata;
}

// Records contain JSON-shaped payloads. Compare without serializing on typing.
export function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a), right = Object.keys(b);
  return left.length === right.length && left.every(key => Object.prototype.hasOwnProperty.call(b, key) &&
    equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

export function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value as DeepReadonly<T>;
}

export function prepareCommitCapture(state: RepositoryState, operations: readonly RepositoryOperation[], metadata: CommitMetadata): PreparedCommitCapture {
  const contents = new Map<ContentKey, ContentRecord | null>();
  const placements = new Map<PlacementKey, PlacementRecord | null>();
  for (const operation of recordOperations(operations)) {
    if (operation.kind === "put-content" || operation.kind === "remove-content") {
      const key = operation.kind === "put-content" ? operation.record.key : operation.key;
      if (!contents.has(key)) contents.set(key, clone(state.contents[key] ?? null));
    } else if (operation.kind === "put-placement" || operation.kind === "remove-placement") {
      const key = operation.kind === "put-placement" ? operation.record.key : operation.key;
      if (!placements.has(key)) placements.set(key, clone(state.placements[key] ?? null));
    }
  }
  return { revision: state.revision, root: state.rootPlacementKey, contents, placements, metadata: clone(metadata) };
}

export function finishCommitCapture(before: PreparedCommitCapture, state: RepositoryState,
  commitId: CommitId, label: string, undoRecorded: boolean, timestamp = new Date().toISOString()): DeepReadonly<RepositoryCommitResult> {
  const deltas = <T>(previous: Map<string, T | null>, current: Record<string, T>): RecordDelta<string, T>[] => {
    const result: RecordDelta<string, T>[] = [];
    for (const [key, value] of previous) {
      const next = current[key] ?? null;
      if (!equal(value, next)) result.push({ key, before: value, after: clone(next) });
    }
    return result;
  };
  return freeze({
    commitId, label, timestamp, undoRecorded,
    cause: before.metadata.cause ?? { kind: "edit" },
    beforeRevision: before.revision, afterRevision: state.revision,
    root: { before: before.root, after: state.rootPlacementKey },
    contents: deltas(before.contents, state.contents), placements: deltas(before.placements, state.placements),
    commands: before.metadata.commands ?? [{ commandId: "repository.commit", subjects: [] }],
    ...(before.metadata.inputIntent ? { inputIntent: before.metadata.inputIntent } : {}),
  });
}
