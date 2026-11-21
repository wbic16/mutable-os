import {contentLength,contentSlice} from "../block-tree/inline-sequence";
import { createEffect, createRoot, untrack } from 'solid-js';
import type { CanonicalRepository, RepositoryChange } from '../block-tree/repository';
import { documentRootPlacements } from '../block-tree/resource-registration';
import { linkedDefinitionOwner, linkedRegistry, resolveLinkedProperty } from '../block-tree/linked-annotations';
import type { JsonObject } from '../block-tree/types';
import type { NativeDocumentSession } from '../persistence/native-session';
import type { BacklinkDocument, BacklinkMention, BacklinksQuery, BacklinksResult, BacklinksService } from '../feature-api/backlinks';
import { vaultContains, vaultPath, type DocumentVaultLease } from './document-vault';

type Vault = Pick<DocumentVaultLease, 'root' | 'snapshot' | 'signature' | 'refresh'>;
type Bindings = Pick<NativeDocumentSession, 'location' | 'pendingVaultRelocations'>;
type Source = BacklinkDocument & { key: string; placement: string };
type Stamp = { vault: Vault; signature: string; revision: number };
type Segment = { blockId: string; contentKey: string; start: number; end: number };
type Mention = { id: string; value: string; documentId?: string; ranges: Segment[]; snippet: string };
type Entry = { members: Set<string>; mentions: Mention[]; diagnostics: string[] };
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const publicDocument = ({ key, placement, ...source }: Source): BacklinkDocument => source;
const identity = (metadata: unknown, fallback: unknown) => (metadata as Record<string, unknown> | undefined)?.documentId ?? fallback;

/** Session-only bounded canonical scan. No DB, persistent index, editor or occurrence lifetime. */
export class CanonicalBacklinks implements BacklinksService {
  private alive = true;
  private entries = new Map<string, Entry>();
  private evidence = new WeakMap<BacklinksResult, Stamp>();
  private listeners = new Set<() => void>();
  private users = 0;
  private stopTracking?: () => void;
  private requests = new Set<AbortController>();
  constructor(private repository: CanonicalRepository, private bindings: Bindings, private vault: () => Vault,
    private opaque: (type: string) => boolean = () => false) {}

  private notify() { untrack(() => { for (const listener of this.listeners) listener(); }); }
  private changed(change: RepositoryChange) {
    if (change.taskStateOwner) return;
    // Typing invalidates only its cached resource; no tree walk or snapshot here.
    const keys = change.inlineOwner ? [change.inlineOwner] : [...change.previousContents.keys()];
    for (const [key, entry] of this.entries) if (keys.some(k => entry.members.has(k))) this.entries.delete(key);
    this.notify();
  }
  private track() {
    if (!this.alive) throw new Error('Backlinks service disposed');
    if (this.users++ === 0) {
      const stop = this.repository.subscribeChanges(change => this.changed(change));
      const stopScope = createRoot(dispose => {
        let previous: { vault?: Vault; signature?: string; pending?: string } | undefined;
        createEffect(() => {
          let next: typeof previous;
          try { const vault = this.vault(); next = { vault, signature: vault.signature(), pending: this.bindings.pendingVaultRelocations(vault.root).join(',') }; }
          catch { next = {}; }
          if (previous && (previous.vault !== next.vault || previous.signature !== next.signature || previous.pending !== next.pending)) {
            this.entries.clear(); this.notify();
          }
          previous = next;
        });
        return dispose;
      });
      this.stopTracking = () => { stop(); stopScope(); this.entries.clear(); };
    }
    let live = true;
    return () => { if (live) { live = false; if (--this.users === 0) { this.stopTracking?.(); this.stopTracking = undefined; } } };
  }
  subscribe = (listener: () => void) => {
    const release = this.track(); this.listeners.add(listener);
    return () => { this.listeners.delete(listener); release(); };
  };
  dispose() { this.alive = false; for (const request of this.requests) request.abort(); this.stopTracking?.(); this.stopTracking = undefined; this.entries.clear(); this.listeners.clear(); }
  private valid(stamp: Stamp) {
    return this.alive && this.vault() === stamp.vault && stamp.signature === stamp.vault.signature() &&
      stamp.revision === this.repository.state.revision && !this.bindings.pendingVaultRelocations(stamp.vault.root).length;
  }
  private require(stamp: Stamp, signal?: AbortSignal) {
    signal?.throwIfAborted(); if (!this.valid(stamp)) throw new Error('Backlinks are stale. Refresh before navigating.');
  }
  current = (result: BacklinksResult) => { try { const stamp = this.evidence.get(result); return !!stamp && this.valid(stamp); } catch { return false; } };

  private scope(vault: Vault) {
    const scan = vault.snapshot(), state = this.repository.readState();
    const documents = Object.values(state.contents).filter(c => c.viewType === 'document-block');
    const sources: Source[] = [], diagnostics = scan.diagnostics.map(d => `${d.path ?? d.resourceId ?? ''}: ${d.message}`);
    if (!scan.complete) return { sources, diagnostics: [...diagnostics, 'Vault discovery is incomplete; unique resource availability cannot be established.'], discovered: scan.documents.length };
    for (const doc of documents) {
      const bound = this.bindings.location(String(identity(doc.payload.metadata, doc.payload.id)));
      if (bound && vaultContains(vault.root, vaultPath(bound)) && !scan.documents.some(d => d.resourceId === identity(doc.payload.metadata, doc.payload.id) && vaultPath(d.location) === vaultPath(bound))) diagnostics.push(`${vaultPath(bound)}: missing or unsaved binding; omitted.`);
    }
    for (const row of scan.documents) {
      const matches = documents.filter(c => identity(c.payload.metadata, c.payload.id) === row.resourceId);
      const roots = matches.length === 1 ? documentRootPlacements(state, matches[0].key) : [];
      const bound = this.bindings.location(row.resourceId);
      if (scan.documents.filter(d => d.resourceId === row.resourceId).length !== 1 || !vaultContains(vault.root, vaultPath(row.location)) || matches.length !== 1 || roots.length !== 1 || !bound || vaultPath(bound) !== vaultPath(row.location) || !['paired', 'unenrolled'].includes(row.state)) {
        diagnostics.push(`${vaultPath(row.location)}: ${!matches.length ? 'unopened' : 'unavailable or ambiguous'}; omitted.`); continue;
      }
      if (sources.length === 200) { diagnostics.push('Coverage limited to 200 available Documents.'); break; }
      const c = matches[0]; if (typeof c.payload.id !== 'string' || !c.payload.id.trim()) { diagnostics.push(`${vaultPath(row.location)}: missing root Block identity; omitted.`); continue; } sources.push({documentId: row.resourceId, blockId: String(c.payload.id), title: String((c.payload.metadata as any)?.title ?? row.title ?? 'Untitled'), location: vaultPath(row.location), key: c.key, placement: roots[0].key});
    }
    return { sources, diagnostics, discovered: scan.documents.length };
  }

  private async scan(source: Source, stamp: Stamp, signal: AbortSignal): Promise<Entry> {
    const state = this.repository.readState(), entry: Entry = {members: new Set([source.key]), mentions: [], diagnostics: []};
    const queue = [source.placement], traversed = new Set<string>(), groups = new Map<string, Mention>(), invalidMentions = new Set<string>(), blockIds = new Map<string, string>();
    let visited = 0, annotations = 0, cells = 0;
    const warn = (message: string) => entry.diagnostics.push(`${source.title}: ${message}`);
    traversal: while (queue.length) {
      if (++visited > 5000) { warn('Block traversal limited to 5,000 entries.'); break; }
      if (visited % 64 === 0) { await pause(); this.require(stamp, signal); }
      const key = queue.pop()!, p = state.placements[key], c = p && state.contents[p.contentKey];
      if (!p || !c) { warn('Unresolved content omitted.'); continue; }
      if (key !== source.placement && (p.kind === 'reference' || p.externalReference || p.resolvedReference || c.viewType === 'document-block')) { warn('Separate Document/reference body omitted.'); continue; }
      if (traversed.has(c.key)) continue;
      traversed.add(c.key);
      entry.members.add(c.key);
      if (this.opaque(c.viewType) || c.viewType.endsWith('-application-block')) { warn(`Unsupported hosted content (${c.viewType}) omitted.`); continue; }
      const blockId = String(c.payload.id ?? '');
      if (blockId) { const previous = blockIds.get(blockId); if (previous && previous !== c.key) { warn('Ambiguous Block identity; resource mentions omitted.'); entry.mentions = []; return entry; } blockIds.set(blockId, c.key); }
      for (const raw of Array.isArray(c.payload.standoffProperties) ? c.payload.standoffProperties : []) {
        if (++annotations > 10000) { warn('Annotation inspection limited to 10,000 entries.'); break traversal; }
        if (annotations % 128 === 0) { await pause(); this.require(stamp, signal); }
        if (!raw || typeof raw !== 'object') { warn('Malformed annotation omitted.'); continue; }
        const property = raw as JsonObject, resolved = resolveLinkedProperty(state, property, c.key);
        let owner: ReturnType<typeof linkedDefinitionOwner>;
        try { owner = typeof property.annotationId === 'string' ? linkedDefinitionOwner(state, property, c.key) : undefined; } catch { warn('Ambiguous linked definition omitted.'); continue; }
        if (owner) entry.members.add(owner.key);
        if (resolved.isDeleted || resolved.clientOnly) continue;
        if (typeof property.annotationId === 'string' && !resolved.type) { warn('Unresolved linked definition omitted.'); continue; }
        if (resolved.type !== 'codex/block-reference') continue;
        if (typeof property.annotationId === 'string' && (!owner || owner.key !== source.key || !linkedRegistry(state, owner.key)[property.annotationId])) { warn('Foreign or unresolved linked reference omitted.'); continue; }
        const start = Number(resolved.start), end = Number(resolved.end) + 1;
        if (typeof resolved.start !== 'number' || typeof resolved.end !== 'number' || c.inlineKind !== 'standoff' || !blockId || typeof resolved.value !== 'string' || !resolved.value || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > contentLength(c) || typeof property.id !== 'string' || !property.id) { warn('Unsupported reference form/range omitted.'); continue; }
        const docId = (resolved.metadata as any)?.documentId;
        if (docId !== undefined && typeof docId !== 'string') { warn('Unsupported Document identity omitted.'); continue; }
        const id = JSON.stringify([source.documentId, property.annotationId ? 'linked' : blockId, property.annotationId ?? property.id]);
        if (invalidMentions.has(id)) continue;
        let mention = groups.get(id);
        if (mention && (mention.value !== resolved.value || mention.documentId !== docId || !property.annotationId)) { warn('Ambiguous mention identity omitted.'); groups.delete(id); invalidMentions.add(id); continue; }
        if (!mention) { mention = {id, value: resolved.value, documentId: docId, ranges: [], snippet: ''}; groups.set(id, mention); }
        // Bound snippets without rebuilding whole paragraphs or touching editable DOM.
        const from = Math.max(0, start - 20), to = Math.min(contentLength(c), end + 35, start + 120);
        cells += to - from; if (cells > 250000) { warn('Snippet inspection limited to 250,000 Cells.'); break traversal; }
        const snippet = contentSlice(state,c,from,to).map(a=>a.kind==='text'?a.text:'[inline object]').join('');
        if (!mention.snippet) mention.snippet = snippet;
        if (!mention.ranges.some(r => r.contentKey === c.key && r.start === start && r.end === end)) mention.ranges.push({blockId, contentKey: c.key, start, end});
        if (groups.size >= 1000) { warn('Mention inspection limited to 1,000 entries.'); break traversal; }
      }
      queue.push(...[...c.children, ...Object.entries(c.ownedRelations).sort(([a], [b]) => a.localeCompare(b)).map(([, key]) => key)].reverse());
    }
    entry.mentions = [...groups.values()].filter(m => m.ranges.length); this.require(stamp, signal); return entry;
  }

  query = async (request: BacklinksQuery, signal?: AbortSignal): Promise<BacklinksResult> => {
    const release = this.track(), controller = new AbortController(); this.requests.add(controller);
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, {once: true}); if (signal?.aborted) abort();
    const timer = setTimeout(abort, 15000);
    try {
      controller.signal.throwIfAborted(); const vault = this.vault(); if (request.vault !== vault.root) throw new Error('Backlinks vault changed');
      await vault.refresh(); controller.signal.throwIfAborted();
      const stamp = {vault, signature: vault.signature(), revision: this.repository.state.revision}; this.require(stamp, controller.signal);
      const scope = this.scope(vault), targets = scope.sources.filter(s => s.documentId === request.target.documentId && s.blockId === request.target.blockId);
      if (targets.length !== 1) throw new Error('Backlinks target is unavailable or ambiguous in this vault');
      const target = targets[0], mentions: BacklinkMention[] = [], diagnostics = scope.diagnostics;
      for (const source of scope.sources) {
        this.require(stamp, controller.signal); let entry = this.entries.get(source.key);
        if (!entry) { entry = await this.scan(source, stamp, controller.signal); this.require(stamp, controller.signal); if (!entry.diagnostics.length) this.entries.set(source.key, entry); }
        diagnostics.push(...entry.diagnostics);
        for (const mention of entry.mentions) {
          const matches = scope.sources.filter(s => s.blockId === mention.value && (mention.documentId === undefined || s.documentId === mention.documentId));
          if (matches.length !== 1) { diagnostics.push(`${source.title}: reference target missing, unopened, ambiguous or unsupported.`); continue; }
          if (matches[0].documentId !== target.documentId) continue;
          if (mentions.length === 1000) { diagnostics.push('Backlinks limited to 1,000 mentions.'); break; }
          mentions.push(Object.freeze({id: mention.id, source: Object.freeze(publicDocument(source)), target: Object.freeze({...request.target}), ranges: Object.freeze(mention.ranges.map(({contentKey, ...r}) => Object.freeze(r))), snippet: mention.snippet}));
        }
        await pause();
      }
      this.require(stamp, controller.signal);
      const result: BacklinksResult = Object.freeze({query: Object.freeze({vault: request.vault, target: Object.freeze({...request.target})}), target: Object.freeze(publicDocument(target)), mentions: Object.freeze(mentions), coverage: Object.freeze({available: scope.sources.length, discovered: scope.discovered, complete: !diagnostics.length, diagnostics: Object.freeze([...new Set(diagnostics)])})});
      this.evidence.set(result, stamp); return result;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); this.requests.delete(controller); release(); }
  };

  /** Core-only validation adapter; the service never mounts or focuses a Document. */
  async resolve(result: BacklinksResult, mention: BacklinkMention, signal?: AbortSignal) {
    const stamp = this.evidence.get(result); if (!stamp || !result.mentions.includes(mention)) throw new Error('Backlink result expired');
    this.require(stamp, signal); await stamp.vault.refresh(); this.require(stamp, signal);
    return this.resolveAt(stamp,result,mention,signal);
  }
  /** Host-only revalidation for a derived provider. This does not subscribe or query. */
  async resolveDerived(result: BacklinksResult, mention: BacklinkMention, current: () => boolean, signal?: AbortSignal) {
    if (!result.mentions.includes(mention) || !current()) throw Error('Backlink result expired');
    const vault=this.vault(), stamp={vault,signature:vault.signature(),revision:this.repository.state.revision};
    this.require(stamp,signal); await vault.refresh(); this.require(stamp,signal);
    if (!current()) throw Error('Backlinks are stale. Refresh before navigating.');
    const value=await this.resolveAt(stamp,result,mention,signal);
    if (!current()) throw Error('Backlinks are stale. Refresh before navigating.');
    return value;
  }
  private async resolveAt(stamp:Stamp, result:BacklinksResult, mention:BacklinkMention, signal?:AbortSignal) {
    const sources = this.scope(stamp.vault).sources, source = sources.find(s => s.documentId === mention.source.documentId && s.blockId === mention.source.blockId && s.location === mention.source.location);
    if (!source) throw new Error('Backlink source disappeared or moved');
    const entry = await this.scan(source, stamp, signal ?? new AbortController().signal);
    const current = entry.mentions.find(m => m.id === mention.id && m.value === mention.target.blockId && (m.documentId === undefined || m.documentId === mention.target.documentId));
    const range = current?.ranges[0]; if (!range || range.blockId !== mention.ranges[0]?.blockId || range.start !== mention.ranges[0]?.start || range.end !== mention.ranges[0]?.end) throw new Error('Backlink mention changed');
    this.require(stamp, signal);
    return {target: publicDocument(source), passage: {...range, coordinate: 'cell' as const}};
  }
}
