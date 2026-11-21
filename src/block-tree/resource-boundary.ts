import {isDocumentTabLeaf} from './document-tab-plan';
/** Read-only canonical evidence. No authored payload, membership cache or consumer policy. */
import { resourceSource } from './resource-identity';
import { documentRootRole } from './resource-registration';
import type { ContentRecord, RepositoryOperation, RepositoryState, Location } from './types';
import type { ReferenceBookkeeping } from './reference-bookkeeping';

export interface BoundaryValidation { error?: string }
declare const boundaryToken: unique symbol;
/** Opaque, repository-issued evidence. Copying a token does not produce valid evidence. */
export interface CanonicalResourceBoundaryToken {
  readonly revision: number;
  readonly [boundaryToken]: true;
}
export type CanonicalResourceBoundaryResult = Readonly<{
  status: 'ready';
  rootContentKey: string;
  rootPlacementKey: string;
  retainedDefinitionKeys: readonly string[];
  token: CanonicalResourceBoundaryToken;
}> | Readonly<{
  status: 'missing' | 'ambiguous' | 'invalid' | 'unavailable';
  reason: string;
}>;
export interface CooperativeBoundaryOptions {
  signal?: AbortSignal;
  /** Positive slice budgets; neither one changes the semantic audit. */
  maxStepsPerSlice?: number;
  maxSliceMs?: number;
  /** Host scheduling capability; defaults to yielding to the next task. */
  yieldControl?: () => Promise<void>;
}
export class StaleResourceBoundaryError extends Error {
  constructor() { super('Stale repository boundary token'); this.name = 'StaleResourceBoundaryError'; }
}
const unavailable = (reason: string): CanonicalResourceBoundaryResult => Object.freeze({ status: 'unavailable', reason });
const identity = (c: ContentRecord | undefined) => c?.viewType === 'document-block'
  ? (c.payload.metadata as Record<string, unknown> | undefined)?.documentId ?? c.payload.id : undefined;
const add = (map: Map<string, Set<string>>, key: string, value: string) => {
  let set = map.get(key); if (!set) map.set(key, set = new Set()); set.add(value);
};
const remove = (map: Map<string, Set<string>>, key: string, value: string) => {
  const set = map.get(key); set?.delete(value); if (!set?.size) map.delete(key);
};

export class ResourceBoundaryBookkeeping {
  private readonly tokens = new WeakSet<CanonicalResourceBoundaryToken>();
  private identities = new Map<string, Set<string>>();
  private retained = new Map<string, Set<string>>();
  validation: BoundaryValidation = { error: 'Resource ownership not validated' };
  constructor(private references: ReferenceBookkeeping) {}
  clear() { this.identities.clear(); this.retained.clear(); }
  add(c: ContentRecord) {
    const id = identity(c);
    if (typeof id === 'string') add(this.identities, id, c.key);
    if (c.definitionOwnerKey !== undefined) add(this.retained, c.definitionOwnerKey, c.key);
  }
  remove(c: ContentRecord) {
    const id = identity(c);
    if (typeof id === 'string') remove(this.identities, id, c.key);
    if (c.definitionOwnerKey !== undefined) remove(this.retained, c.definitionOwnerKey, c.key);
  }
  /** Identity-only lookup over maintained evidence; not a membership/audit token. */
  findDocument(state: RepositoryState, id: string): ContentRecord | undefined {
    const candidates = this.identities.get(id);
    if (candidates && candidates.size > 1) throw Error('Ambiguous canonical resource identity');
    const key = candidates?.values().next().value;
    return key === undefined ? undefined : state.contents[key];
  }
  private token(revision: number): CanonicalResourceBoundaryToken {
    const token = Object.freeze({ revision }) as CanonicalResourceBoundaryToken;
    this.tokens.add(token); return token;
  }
  isCurrent(state: RepositoryState, token: CanonicalResourceBoundaryToken): boolean {
    return this.tokens.has(token) && token.revision === state.revision;
  }
  incoming(state: RepositoryState, token: CanonicalResourceBoundaryToken, key: string, location: (pk: string) => Location | undefined) {
    if (!this.isCurrent(state, token)) throw new StaleResourceBoundaryError();
    const result = [];
    for (const pk of this.references.ownedKeys(key)) {
      const p = state.placements[pk];
      if (p && !p.externalReference && !p.resolvedReference) {
        const found = location(pk);
        const detached = found && Object.freeze({ ...found, slot: Object.freeze({ ...found.slot }) });
        result.push(Object.freeze({ placementKey: pk, location: detached }));
      }
    }
    return Object.freeze(result);
  }

  /** The same generator is drained synchronously or in cooperative slices. Each
   * yield bounds one record/edge operation, including root and incoming witnesses.
   * No intermediate value is public evidence; only the return can be ready. */
  private *audit(state: RepositoryState, id: string): Generator<void, CanonicalResourceBoundaryResult> {
    if (this.validation.error) return unavailable(this.validation.error);
    const candidates = this.identities.get(id);
    if (!candidates?.size) return Object.freeze({ status: 'missing', reason: 'Missing canonical resource identity' });
    if (candidates.size !== 1) return Object.freeze({ status: 'ambiguous', reason: 'Ambiguous canonical resource identity' });
    const revision = state.revision;
    try {
      const root = state.contents[candidates.values().next().value!];
      if (resourceSource(root)?.resourceId !== id) throw Error('Invalid canonical resource identity');
      let registered = 0, owned = 0, registeredKey = '', ownedKey = '';
      const rootWitnesses = new Set<string>();
      for (const keys of [this.references.registrationKeys(root.key), this.references.ownedKeys(root.key)]) {
        for (const pk of keys) {
          yield;
          if (rootWitnesses.has(pk)) continue;
          rootWitnesses.add(pk);
          const p = state.placements[pk];
          const role = p && documentRootRole(p, root.key);
          if (role === 'registration') { registered++; registeredKey = pk; }
          else if (role === 'owned') { owned++; ownedKey = pk; }
        }
      }
      if ((registered || owned) !== 1) throw Error('Ambiguous canonical root');
      const rootPlacementKey = registered ? registeredKey : ownedKey;
      const retained: string[] = [], members = new Set<string>(), slots = new Set([rootPlacementKey]);
      const queue = [root.key], ids = new Set<string>();
      for (const key of this.retained.get(root.key) ?? []) { yield; retained.push(key); queue.push(key); }
      while (queue.length) {
        yield;
        const key = queue.pop()!;
        if (members.has(key)) continue;
        const c = state.contents[key]; if (!c) throw Error('Missing owned content'); members.add(key);
        if (c.definitionOwnerKey !== undefined && c.definitionOwnerKey !== root.key) throw Error('Conflicting retained-definition owner');
        if (c.viewType !== 'text-cell' && c.viewType !== 'image-cell') {
          if (typeof c.payload.id !== 'string' || !c.payload.id.trim() || ids.has(c.payload.id)) throw Error('Missing or duplicate Block identity');
          ids.add(c.payload.id);
        }
        // No whole child/inline array copies before yielding. Relations are own
        // properties; the repository dictionaries themselves are never enumerated.
        const visit = (pk: string) => {
          slots.add(pk); const p = state.placements[pk]; if (!p) throw Error('Missing canonical placement');
          if (p.kind === 'reference' || p.externalReference || p.resolvedReference) return;
          const child = state.contents[p.contentKey]; if (!child) throw Error('Missing owned target');
          if (child.viewType !== 'document-block' || child.key === root.key) queue.push(child.key);
        };
        for (const pk of c.children) { yield; visit(pk); }
        for (const pk of c.inlineContent) { yield; visit(pk); }
        for (const name in c.ownedRelations) {
          yield;
          if (Object.prototype.hasOwnProperty.call(c.ownedRelations, name)) visit(c.ownedRelations[name]);
        }
      }
      for (const key of members) {
        yield;
        let owners = 0;
        for (const pk of this.references.ownedKeys(key)) {
          yield;
          const p = state.placements[pk];
          if (p.resolvedReference || p.externalReference) continue;
          if (!slots.has(pk)) throw Error('Content has an owner outside this resource');
          if (++owners > 1) throw Error('Multiple canonical owners');
        }
      }
      return Object.freeze({ status: 'ready', rootContentKey: root.key, rootPlacementKey,
        retainedDefinitionKeys: Object.freeze(retained), token: this.token(revision) });
    } catch (error) {
      return Object.freeze({ status: 'invalid', reason: String(error) });
    }
  }

  read(state: RepositoryState, id: string): CanonicalResourceBoundaryResult {
    const audit = this.audit(state, id);
    let step = audit.next();
    while (!step.done) step = audit.next();
    return step.value;
  }
  async readCooperative(state: RepositoryState, id: string, options: CooperativeBoundaryOptions = {}): Promise<CanonicalResourceBoundaryResult> {
    const maxSteps = options.maxStepsPerSlice ?? 256, maxMs = options.maxSliceMs ?? 4;
    if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || !Number.isFinite(maxMs) || maxMs <= 0) throw new RangeError('Invalid boundary slice budget');
    const pause = options.yieldControl ?? (() => new Promise<void>(resolve => setTimeout(resolve, 0)));
    const revision = state.revision, audit = this.audit(state, id);
    try {
      for (;;) {
        options.signal?.throwIfAborted();
        if (state.revision !== revision) return unavailable('Repository revision changed during boundary read');
        const started = performance.now();
        for (let steps = 0; steps < maxSteps; steps++) {
          const step = audit.next();
          if (step.done) {
            options.signal?.throwIfAborted();
            if (state.revision !== revision) return unavailable('Repository revision changed during boundary read');
            return step.value;
          }
          if (performance.now() - started >= maxMs) break;
        }
        await pause();
      }
    } finally {
      // Drop borrowed references and transient traversal state on every exit.
      audit.return(unavailable('Boundary read disposed'));
    }
  }
}
/** Carry only the GLOBAL resource-ownership validation result across known-safe fast
 * mutations. Boundary membership is always read afresh. Hints alone are insufficient. */
export function preservesResourceOwnership(state:RepositoryState,ops:readonly RepositoryOperation[]):boolean {
 const created=new Map<string,ContentRecord>();for(const op of ops)if(op.kind==='put-content')created.set(op.record.key,op.record);
 for(const op of ops){
  if(op.kind==='set-root'||op.kind==='record-batch')return false;
  if(op.kind==='put-content'||op.kind==='remove-content'){
   const key=op.kind==='put-content'?op.record.key:op.key,before=state.contents[key],after=op.kind==='put-content'?op.record:undefined;
   // Existing fast recognizers prove sequences/retained edges; additionally exclude
   // resource roots and exotic inline hosts whose payload can alter identity/claims.
   if([before,after].some(c=>c&&!['text-cell','standoff-editor-block'].includes(c.viewType)&&!isDocumentTabLeaf(c))){
    if(!before||!after||before.viewType!==after.viewType||identity(before)!==identity(after)||before.payload.id!==after.payload.id||JSON.stringify(resourceSource(before))!==JSON.stringify(resourceSource(after)))return false;
   }
   if(before&&after&&before.definitionOwnerKey!==after.definitionOwnerKey)return false;
   if(after?.definitionOwnerKey!==undefined&&!before&&(after.children.length||Object.keys(after.ownedRelations).length))return false;
  }else{
   const p=op.kind==='put-placement'?op.record:state.placements[op.key];
   if(!p||p.externalReference||p.resolvedReference||p.resourceRegistration)return false;
   const c=state.contents[p.contentKey]??created.get(p.contentKey);
   if(!c||!['text-cell','standoff-editor-block'].includes(c.viewType)&&!isDocumentTabLeaf(c))return false;
  }
 }
 return true;
}
