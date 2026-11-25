import {cellWork} from "../block-tree/cell-diagnostics";
import {contentLength,inlineSlice,inlineText} from "../block-tree/inline-sequence";
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { ContentRecord, JsonObject } from '../block-tree/types';
import type { RepositoryChange } from '../block-tree/repository';
import { linkedDefinitionOwner, resolveLinkedProperty } from '../block-tree/linked-annotations';
import type { LiveDocumentEntities, LiveEntityRow, LiveEntitySnapshot } from '../feature-api/live-entities';

interface Link {
  ordinal: number; key: string; entity: string; name?: string; block: boolean;
  surface: string; cells: readonly string[]; signature: string; definitionOwner?: string;
}
const properties = (content: ContentRecord) => {
  const value = content.payload[['standoff-editor-block','standoff-code-mirror-block'].includes(content.viewType) ? 'standoffProperties' : 'blockProperties'];
  return Array.isArray(value) ? value.filter((p): p is JsonObject => !!p && typeof p === 'object' && !Array.isArray(p)) : [];
};
const supported = (c: ContentRecord) => ['standoff-editor-block','standoff-code-mirror-block','mutable/citation-block','mutable/web-article-block'].includes(c.viewType);
const pools = new WeakMap<ReactiveEditor, Map<string, Inventory>>();

/** Owned placement membership and per-content link deltas. Never observes a rendered tree. */
class Inventory {
  private members = new Map<string, string[]>();
  private links = new Map<string, Map<string, Link>>();
  private ambiguous = new Set<string>();
  private invalid = new Map<string, number>();
  private rows = new Map<string, LiveEntityRow>();
  private entityLinks = new Map<string, Map<string, Link>>();
  private invalidTotal = 0;
  private listeners = new Set<() => void>();
  private pending = new Map<string, ContentRecord | undefined>();
  private changedForms = new Set<string>();
  private changedCells = new Set<string>();
  private cellOwners = new Map<string, Set<string>>();
  private contentCells = new Map<string, Set<string>>();
  private queued = false;
  private disposed = false;
  private stop: () => void;
  private snapshot: LiveEntitySnapshot = {rows:[],invalid:0,removed:false};
  references = 0;
  constructor(private editor: ReactiveEditor, readonly documentKey: string) {
    this.add(documentKey);
    const affected = new Set<string>();
    for (const key of this.members.keys()) this.update(key, affected);
    this.publish(affected);
    this.stop = editor.repository.subscribeChanges(change => this.changed(change));
  }
  private children(content: ContentRecord) {
    const state = this.editor.repository.readState();
    return [...content.children,...Object.values(content.ownedRelations)].flatMap(key => {
      const p = state.placements[key], c = p && state.contents[p.contentKey];
      return p?.kind === 'owned' && c && c.viewType !== 'document-block' ? [c.key] : [];
    });
  }
  private add(key: string) {
    if (this.members.has(key)) return;
    const c = this.editor.repository.readState().contents[key]; if (!c) return;
    const children = this.children(c); this.members.set(key,children);
    children.forEach(child => this.add(child));
  }
  private remove(key: string, affected: Set<string>) {
    for (const child of this.members.get(key) ?? []) this.remove(child,affected);
    this.clearLinks(key,affected);this.members.delete(key);
  }
  private clearCells(key: string) {
    for(const cell of this.contentCells.get(key)??[]){const owners=this.cellOwners.get(cell);owners?.delete(key);if(!owners?.size)this.cellOwners.delete(cell);}
    this.contentCells.delete(key);
  }
  private clearLinks(key: string, affected: Set<string>) {
    for (const [id,link] of this.links.get(key) ?? []) { affected.add(link.entity);this.entityLinks.get(link.entity)?.delete(`${key}:${id}`); }
    this.invalidTotal -= this.invalid.get(key) ?? 0;
    this.links.delete(key);this.invalid.delete(key);this.ambiguous.delete(key);this.clearCells(key);
  }
  private updateResidentForms(change: RepositoryChange): boolean {
    const key = change.inlineOwner, splice = key && change.compactEdits?.get(key);
    const inserted = change.residentInsertedLength;
    if (!key || !splice || inserted === undefined || change.annotationOrigins?.size || this.pending.size || this.invalid.get(key) || this.ambiguous.has(key)) return false;
    // This publication preserves every authored property and its ordinal.
    // Only the displayed spelling of a tracked entity can have changed.
    const links = this.links.get(key);
    if (!links?.size) return true;
    for (const link of links.values()) {
      if (cellWork) cellWork.mentionSurfaceChecks++;
      const text = this.editor.repository.residentRangeTextNearSplice(key, link.ordinal, splice.start, inserted);
      if (text === undefined) return false;
      if (text !== false && text !== link.surface) {
        link.surface = text;
        this.changedForms.add(link.entity);
      }
    }
    return true;
  }
  private changed(change: RepositoryChange) {
    if (change.taskStateOwner) return;
    if (this.updateResidentForms(change)) {
      if (this.changedForms.size) this.schedule();
      return;
    }
    const state = this.editor.repository.readState(), affectedOwners=new Set<string>();
    for (const [key,before] of change.previousContents) {
      const after=state.contents[key];
      // Source-local evidence only. Rebased offsets with the same mention text
      // do not rebuild the inventory or notify consumers.
      if(before?.viewType==='standoff-code-mirror-block'&&after?.viewType===before.viewType&&JSON.stringify(before.children)===JSON.stringify(after.children)&&JSON.stringify(before.ownedRelations)===JSON.stringify(after.ownedRelations)){
        const signature=(c:ContentRecord)=>{const chars=[...String(c.payload.text??'')];return JSON.stringify(properties(c).filter(p=>p.type==='codex/entity-reference'||p.annotationId).map(({start,end,...p})=>[p,chars.slice(Number(start),p.isZeroWidth?Number(start):Number(end)+1).join('')]));};
        if(signature(before)===signature(after))continue;
      }
      if (this.members.has(key) || this.definitionUsed(key)) {
        if (!this.pending.has(key)) this.pending.set(key,before);
      }
      if (before?.viewType === 'text-cell' || state.contents[key]?.viewType === 'text-cell') {
        this.changedCells.add(key);
        for(const owner of this.cellOwners.get(key)??[])affectedOwners.add(owner);
      }
    }
    for(const owner of affectedOwners)if(!this.pending.has(owner))this.pending.set(owner,state.contents[owner]);
    if (!this.pending.size) { this.changedCells.clear(); return; }
    this.schedule();
  }
  private schedule() {
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => { this.queued = false; if (!this.disposed) this.flush(); });
  }
  // Definition dependencies are indexed separately from per-keystroke metadata.
  private definitions = new Map<string, Set<string>>();
  private definitionUsed(key: string) { return this.definitions.has(key); }
  private flush() {
    if (!this.pending.size && !this.changedForms.size) return;
    const affected = this.changedForms;
    this.changedForms = new Set();
    const state = this.editor.repository.readState(), update = new Set<string>();
    const pending = this.pending; this.pending = new Map();
    for (const [key,before] of pending) {
      if (this.members.has(key)) {
        const after = state.contents[key];
        if (!after) { this.remove(key,affected); continue; }
        if (!before || before.children !== after.children || before.ownedRelations !== after.ownedRelations) {
          const old = this.members.get(key)!, next = this.children(after);
          for (const child of old) if (!next.includes(child)) this.remove(child,affected);
          for (const child of next) if (!this.members.has(child)) {
            this.add(child);
            const collect = (id: string) => { update.add(id); this.members.get(id)?.forEach(collect); }; collect(child);
          }
          this.members.set(key,next);
        }
        update.add(key);
      }
      if (before?.payload.linkedAnnotations !== state.contents[key]?.payload.linkedAnnotations)
        for (const content of this.definitions.get(key) ?? []) update.add(content);
    }
    for (const key of update) this.update(key,affected, pending);
    this.changedCells.clear();
    this.publish(affected);
  }
  private update(key: string, affected: Set<string>, changed?: Map<string, ContentRecord | undefined>) {
    const state = this.editor.repository.readState(), content = state.contents[key];
    if (!this.members.has(key))return;
    if (!content || !supported(content)) {this.clearLinks(key,affected);return;}
    const old = this.links.get(key) ?? new Map<string,Link>(), next = new Map<string,Link>();
    this.clearCells(key);const linkedCells=new Set<string>();
    const codePoints=content.viewType==='standoff-code-mirror-block'?[...String(content.payload.text??'')]:undefined;
    this.ambiguous.delete(key);
    if (cellWork) cellWork.entityInventoryReads++;
    let invalid = 0;
    for (const [index,p] of properties(content).entries()) {
      if(p.type==='dialectic/range-anchor')continue; // passive reply identity, never an Entity mention
      if (p.type !== 'codex/entity-reference' && !p.annotationId) continue;
      const localId = String(p.id ?? `index:${index}`), prior = old.get(localId);
      const {start,end,...identity} = p, signature = JSON.stringify(identity);
      const unchangedDefinition = !prior?.definitionOwner || !changed?.has(prior.definitionOwner)
        || changed.get(prior.definitionOwner)?.payload.linkedAnnotations === state.contents[prior.definitionOwner]?.payload.linkedAnnotations;
      let resolved: JsonObject, definitionOwner: string | undefined;
      if (prior?.signature === signature && unchangedDefinition) {
        resolved = {type:'codex/entity-reference',value:prior.entity,metadata:{entityName:prior.name}};
        definitionOwner = prior.definitionOwner;
      } else {
        resolved = resolveLinkedProperty(state,p,key);
        if (p.annotationId) try { definitionOwner = linkedDefinitionOwner(state,p,key)?.key; } catch { /* unresolved below */ }
      }
      if (resolved.isDeleted || p.isDeleted || resolved.type !== 'codex/entity-reference') continue;
      if (typeof resolved.value !== 'string' || !resolved.value.trim() || p.annotationId && !definitionOwner) { invalid++; continue; }
      const native=content.viewType==='standoff-code-mirror-block';
      const block = content.viewType !== 'standoff-editor-block'&&!native;
      const from = Number(start), to = native&&p.isZeroWidth?from:Number(end)+1;
      if (!block && (!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<from||to===from&&!(native&&p.isZeroWidth)||to>(native?codePoints!.length:contentLength(content)))) { invalid++; continue; }
      const cells = block || native ? [] : content.inlineContent.slice(from,to);
      const sameCells = !content.compactInline && prior && cells.length === prior.cells.length && cells.every((id,i) => id === prior.cells[i] && !this.changedCells.has(state.placements[id]?.contentKey));
      let surface = prior && sameCells ? prior.surface : '';
      if(native)surface=codePoints!.slice(from,to).join('');
      else if (!block && content.compactInline) {const atoms=inlineSlice(content.compactInline.spans,from,to);if(atoms.some(a=>a.kind==='image')){invalid++;continue;}surface=inlineText(atoms);}
      else if (!block && !sameCells) {
        let plain = true;
        for (const id of cells) { const c=state.contents[state.placements[id]?.contentKey]; if(c?.viewType!=='text-cell'){plain=false;break;} surface+=String(c.payload.text??''); }
        if (!plain) { invalid++; continue; }
      }
      const metadata = resolved.metadata as Record<string,unknown>|undefined;
      const name = metadata?.entityName ?? metadata?.name;
      const link: Link = {ordinal:index,key:p.annotationId?`${definitionOwner}:${p.annotationId}`:`${key}:${localId}`,entity:resolved.value,name:typeof name==='string'?name:undefined,block,surface,cells,signature,definitionOwner};
      for(const id of cells){const cell=state.placements[id]?.contentKey;if(cell)linkedCells.add(cell);}
      if (next.has(localId)) this.ambiguous.add(key);
      next.set(localId,link);
      if(prior?.entity!==link.entity && prior)this.entityLinks.get(prior.entity)?.delete(`${key}:${localId}`);
      const entries=this.entityLinks.get(link.entity)??new Map<string,Link>();entries.set(`${key}:${localId}`,link);this.entityLinks.set(link.entity,entries);
      if (definitionOwner) { const refs=this.definitions.get(definitionOwner)??new Set(); refs.add(key);this.definitions.set(definitionOwner,refs); }
      if (!prior || prior.entity!==link.entity || prior.key!==link.key || prior.surface!==surface || prior.name!==link.name || prior.block!==block) { affected.add(link.entity); if(prior)affected.add(prior.entity); }
    }
    for (const [id,link] of old) if (!next.has(id)) { affected.add(link.entity);this.entityLinks.get(link.entity)?.delete(`${key}:${id}`); }
    this.contentCells.set(key,linkedCells);
    for(const cell of linkedCells){const owners=this.cellOwners.get(cell)??new Set<string>();owners.add(key);this.cellOwners.set(cell,owners);}
    this.links.set(key,next); this.invalidTotal+=invalid-(this.invalid.get(key)??0);this.invalid.set(key,invalid);
  }
  private publish(affected: Set<string>) {
    // Membership/count reconstruction is limited to entities with changed links/forms.
    for (const entity of affected) {
      const groups = new Map<string,Link[]>(); let name: string|undefined;
      for(const link of this.entityLinks.get(entity)?.values()??[]){const items=groups.get(link.key)??[];items.push(link);groups.set(link.key,items);name??=link.name;}
      if (!groups.size) { this.rows.delete(entity); continue; }
      const forms = new Map<string,number>(); let blocks=0;
      for(const links of groups.values()) { if(links[0].block){blocks++;continue;}const form=links.map(l=>l.surface).join(' ');forms.set(form,(forms.get(form)??0)+1); }
      this.rows.set(entity,{id:entity,fallbackName:name,occurrences:groups.size,blockReferences:blocks,forms:[...forms].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([text])=>text)});
    }
    const invalid = this.invalidTotal, removed=!this.members.has(this.documentKey);
    if (!affected.size && invalid===this.snapshot.invalid && removed===this.snapshot.removed) return;
    this.snapshot = {rows:[...this.rows.values()],invalid,removed};
    this.listeners.forEach(listener=>listener());
  }
  read() { this.flush(); return this.snapshot; }
  owns(key: string) { this.flush(); return this.members.has(key); }
  subscribe(listener:()=>void) { this.listeners.add(listener);return ()=>{this.listeners.delete(listener);}; }
  dispose() { this.disposed=true;this.stop();this.listeners.clear();this.pending.clear(); }
}

export function liveDocumentEntities(editor: ReactiveEditor, documentKey: string): LiveDocumentEntities {
  let documents=pools.get(editor);if(!documents)pools.set(editor,documents=new Map());
  let inventory=documents.get(documentKey);if(!inventory)documents.set(documentKey,inventory=new Inventory(editor,documentKey));
  inventory.references++;
  const source=inventory, subscriptions=new Set<()=>void>();let alive=true;
  return {documentKey,read:()=>source.read(),owns:key=>source.owns(key),subscribe(listener){if(!alive)throw Error('Inventory closed');const stop=source.subscribe(listener);subscriptions.add(stop);return ()=>{stop();subscriptions.delete(stop);};},dispose(){if(!alive)return;alive=false;subscriptions.forEach(stop=>stop());if(!--source.references){source.dispose();documents!.delete(documentKey);}}};
}
