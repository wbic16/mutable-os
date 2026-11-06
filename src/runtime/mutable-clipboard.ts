import { markdownLiteralContext } from './markdown-input';
import { resourceSurface } from '../interchange/resource-surface';
import {webCandidate} from '../web-resources/registry';
import {academicIdentifier,academicJob} from '../academic/identifiers';
import {pdfInput} from '../pdf/model';
import {pdfBlock} from '../pdf/block';
import {iiifInput} from '../iiif/model';
import {iiifBlock} from '../iiif/block';
import {wikipediaInput} from '../interchange/encyclopedia';
import {webArticleBlock} from '../interchange/web-article-block';
import {doiInput} from '../interchange/scholarly';
import {citationBlock} from '../interchange/citation-block';
import {HttpApplicationServices} from './application-services';
import { type AssetLease } from './managed-assets';
import { captureFiles, imagesFragment, resolveClipboardImages, type ClipboardFile } from '../interchange/clipboard-images';
import { createSignal } from 'solid-js';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { Destination } from '../block-tree/types';
import { resourceOwner, resourceSource } from '../block-tree/resource-identity';
import { serializeSelection, plainFragment, type Slice } from '../interchange/serializer';
import { materializeFragment } from '../interchange/materialize';
import { inlineMergePredicate } from '../interchange/insertion';
import { fragmentGroup, validateFragment, type InterchangeScope, type MutableFragment } from '../interchange/fragment';
import { canWriteAsync, captureClipboard, exportClipboard, importClipboard, readAsyncClipboard, readAsyncClipboardBundle, writeAsyncClipboard, writeEventClipboard } from '../interchange/transport';
import { preparePaste, type PastePreparation, type PreparedPaste } from '../interchange/prepare';
import type { BlockFragment } from '../block-tree/clipboard';
import type { MountHandle } from './mounts';
import { resourceUrl, resourceBlock, type ResourceUrl } from '../interchange/resource-url';
import { uriAtCaret } from '../interchange/uri-at-caret';

interface Bookmark {
  kind: 'text' | 'blocks'; viewId: string; slices: Slice[]; disjoint: boolean;
  signature: string; revision: number; scope: InterchangeScope; session?: string;
  nodeKey?: string; destination?: Destination;
  primaryIndex?: number;
}

/** An explicit-action service: no repository subscription or per-keystroke work. */
export class MutableClipboard {
  private readonly status = createSignal('');
  readonly message = this.status[0];
  private readonly recoverySignal = createSignal<MutableFragment>();
  readonly recovery = this.recoverySignal[0];
  private context = () => this.editor.readAssetContext();
  private alive = true;
  private pending = false;
  private cancelPreparation?: () => void;
  private markdownIntent?: { until: number; target: Element; bookmark: Bookmark };
  private markdownReadEpoch = 0;
  get assets() { return this.editor.assets; }
  private readonly imagePromptSignal = createSignal<{ urls: string[]; error?: string }>();
  readonly imagePrompt = this.imagePromptSignal[0];
  private chooseImageResult?: (urls: string[] | undefined) => void;
  private importController?: AbortController;
  private assetLease?: AssetLease;
  private assetInserted = false;
  chooseImages(urls: string[] | undefined) { this.chooseImageResult?.(urls); }

  constructor(private editor: ReactiveEditor) {}
  enabled() { return this.editor.features.mutableClipboard; }
  setContext(read: () => { cavernId?: string; session?: string }) { this.editor.setAssetContext(read); }
  notify(message: string) { if (this.alive) this.status[1](message); }
  dismiss() { if (this.imagePrompt()) this.cancel(); this.status[1](''); }
  cancel() { this.markdownReadEpoch++; this.markdownIntent = undefined; this.importController?.abort(); this.chooseImages(undefined); this.cancelPreparation?.(); }
  key(event: KeyboardEvent) {
    if (!this.enabled()) return;
    if (event.isComposing) { this.clearIntent(); return; }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'v') {
      const resolved = this.editor.mounts.resolveEvent(event);
      if (resolved) this.ensureEmptyCaret(resolved.nodeKey, resolved.handle);
    }
    if (this.markdownIntent && !['Meta', 'Control', 'Shift', 'Alt'].includes(event.key) && event.key.toLowerCase() !== 'v') this.markdownIntent = undefined;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'v') {
      this.markdownIntent = undefined;
      if (event.shiftKey && this.editor.features.markdownClipboard) {
        const bookmark = this.textBookmark(event, !!this.editor.crossText.range());
        const target = this.editor.mounts.resolveEvent(event)?.handle.focusElement;
        if (bookmark && target) this.markdownIntent = { until: Date.now() + 1500, target, bookmark };
      }
    }
  }
  clearIntent() { this.markdownIntent = undefined; }
  /** Explicit shortcut only: no clipboard access, subscriptions or document scan. */
  processAtCaret(event: Event): boolean {
    if (!this.enabled() || !this.alive) return false;
    const b = this.textBookmark(event);
    if (!b?.nodeKey) return false;
    this.stop(event);
    if (event instanceof KeyboardEvent && event.repeat) return true;
    try {
      if (this.pending || this.editor.interchange.busy()) throw Error('Finish or cancel the current resource operation first.');
      if (b.disjoint || this.editor.crossText.range() || b.slices[0].start !== b.slices[0].end) throw Error('Place the caret inside one resource URI.');
      const node = this.editor.node(b.nodeKey)!;
      const uri = uriAtCaret(b.slices[0].start!, node.inlineContent.length, index => {
        const cell = this.editor.node(node.inlineContent[index]);
        return cell?.viewType === 'text-cell' ? String(cell.payload.text ?? '') : undefined;
      });
      if (!uri) throw Error('Place the caret inside an absolute HTTP(S) resource URI.');
      const mount = this.editor.mounts.get(node.key)!;
      const original = mount.captureInlineSelection!()!;
      // Reuse the exact paste selection and async validity checks. Selecting the
      // URI is not an edit; acquisition failure/cancellation leaves it intact.
      mount.restoreInlineSelection?.({ anchor: uri.start, head: uri.end });
      this.editor.selections.setPrimary(node.key, node.contentKey, node.viewId, uri.start, uri.end);
      const bookmark = this.textBookmark(event)!;
      this.clearIntent();
      if (!this.processResource(bookmark, uri.source, event, false)) {
        mount.restoreInlineSelection?.(original);
        this.editor.selections.setPrimary(node.key, node.contentKey, node.viewId, original.anchor, original.head);
        this.notify('No enabled resource handler accepts this URI.');
      }
    } catch (error) { this.error(error); }
    return true;
  }
  /** An empty editing host has one valid insertion point, even before a browser establishes its native range. */
  private ensureEmptyCaret(nodeKey: string, mount: MountHandle) {
    const document = mount.focusElement.ownerDocument;
    if (mount.inputPolicy !== 'standoff' || mount.composing || document.activeElement !== mount.focusElement) return;
    const node = this.editor.node(nodeKey);
    if (!node || node.inlineContent.length || mount.captureInlineSelection?.()) return;
    const selection = document.getSelection();
    // A selection belonging to another block must never be silently replaced.
    if (selection?.rangeCount && !selection.isCollapsed) return;
    mount.restoreInlineSelection?.({ anchor: 0, head: 0 });
    this.editor.selections.setPrimary(node.key, node.contentKey, node.viewId, 0, 0);
  }
  private scope(contentKey?: string): InterchangeScope {
    const state = this.editor.repository.readState();
    const resource = contentKey && resourceOwner(state, contentKey);
    let resourceId: string | undefined;
    try { if (resource) resourceId = resourceSource(resource)?.resourceId; } catch { /* Legacy untitled documents have no portable identity. */ }
    return { ...(this.context().cavernId ? { cavernId: this.context().cavernId } : {}), ...(resourceId ? { resourceId } : {}) };
  }
  private projectionIntent?: { representations: Record<string,string>; valid: () => boolean; accepts: (event:ClipboardEvent) => boolean; until: number };
  async copyProjection(representations: Record<string,string>, valid: () => boolean, accepts: (event:ClipboardEvent) => boolean = () => true) {
    this.projectionIntent=undefined;
    if(this.pending)throw Error('Finish the current clipboard operation first.');
    if (!this.editor.features.documentInterchange || !this.alive || !valid()) throw Error('The copy selection changed.');
    if (canWriteAsync()) {
      this.pending=true;
      try { await writeAsyncClipboard(representations); this.notify('Copied semantic projection.'); return; }
      catch { /* Recover using the existing trusted native copy-event owner. */ }
      finally { this.pending=false; }
    }
    if (!valid()) throw Error('The copy selection changed.');
    this.projectionIntent = {representations,valid,accepts,until:Date.now()+15000};
    this.notify('Press Command/Control-C on the unchanged selection within 15 seconds to copy this projection.');
  }
  copyProjectionEvent(event: ClipboardEvent): boolean {
    const intent=this.projectionIntent;
    if(event.type!=='copy'||!intent)return false;
    if(!intent.accepts(event)){this.projectionIntent=undefined;return false;}
    // A field or dialog retains normal browser copy ownership.
    const target=event.target instanceof Element?event.target:undefined;
    if(target?.closest('input,textarea,select,[role="dialog"]')&&!target?.matches('[data-cross-text-input]'))return false;
    this.projectionIntent=undefined;this.stop(event);
    try { if(!event.cancelable||!this.editor.features.documentInterchange||Date.now()>intent.until||!intent.valid())throw Error('Projection copy expired or the selection changed. Choose Copy as again.');
      writeEventClipboard(event.clipboardData,intent.representations);this.notify('Projection supplied to the browser clipboard. The native-event API cannot acknowledge OS acceptance.');
    }catch(e){this.error(e);}return true;
  }
  private textBookmark(event?: Event, cross = false, nodeKey?: string): Bookmark | undefined {
    const active = cross && this.editor.crossText.range();
    if (active) {
      const slices = this.editor.crossText.resolve(active.anchor, active.head).map(s => ({ placementKey: this.editor.node(s.nodeKey)!.placementKey, start: s.start, end: s.end }));
      return { kind: 'text', viewId: active.viewId, slices, disjoint: false, signature: JSON.stringify(active), revision: this.editor.repository.state.revision, scope: this.scope(this.editor.node(active.head.occurrenceKey)?.contentKey), session: this.context().session };
    }
    const mount = nodeKey ? this.editor.mounts.get(nodeKey) : undefined;
    const target = mount?.root ?? (event?.target instanceof Element ? event.target : undefined);
    if (target?.closest('[data-block-selection-handle], [data-block-selection-inspector], input, textarea, select, [role="dialog"]')) return;
    const resolved = mount && nodeKey ? { nodeKey, handle: mount } : event ? this.editor.mounts.resolveEvent(event) : undefined;
    if (!resolved || resolved.handle.inputPolicy !== 'standoff' || resolved.handle.composing) return;
    const node = this.editor.node(resolved.nodeKey); if (!node) return;
    if (event?.type === 'paste') this.ensureEmptyCaret(node.key, resolved.handle);
    const set = this.editor.selections.sets[node.key];
    const native = resolved.handle.captureInlineSelection?.();
    let ranges = set?.items.length > 1 ? set.items.map(i => ({ start: Math.min(i.anchor.boundary.index, i.head.boundary.index), end: Math.max(i.anchor.boundary.index, i.head.boundary.index) }))
      : native ? [{ start: Math.min(native.anchor, native.head), end: Math.max(native.anchor, native.head) }]
        : set?.items.map(i => ({ start: Math.min(i.anchor.boundary.index, i.head.boundary.index), end: Math.max(i.anchor.boundary.index, i.head.boundary.index) }));
    if (!ranges?.length) return;
    ranges.sort((a, b) => a.start - b.start);
    ranges = ranges.filter((r, i) => !i || r.start !== ranges![i - 1].start || r.end !== ranges![i - 1].end);
    if (ranges.some((r, i) => i && r.start < ranges[i - 1].end)) throw Error('Clipboard selections cannot overlap.');
    const slices = ranges.map(r => ({ ...r, placementKey: node.placementKey, ...(ranges.length > 1 ? { gap: true } : {}) }));
    const primary = set?.items.find(i => i.id === set.primaryId);
    const primaryStart = primary ? Math.min(primary.anchor.boundary.index, primary.head.boundary.index) : ranges[0].start;
    return { kind: 'text', nodeKey: node.key, viewId: node.viewId, slices, disjoint: ranges.length > 1, primaryIndex: Math.max(0, ranges.findIndex(r => r.start === primaryStart)), signature: JSON.stringify(ranges), revision: this.editor.repository.state.revision, scope: this.scope(node.contentKey), session: this.context().session };
  }
  private blockBookmark(): Bookmark {
    const items = this.editor.blockSelection.actionTargets();
    const target = this.editor.blockClipboard.destination();
    return { kind: 'blocks', viewId: target.viewId, destination: target.destination, slices: items.map(i => ({ placementKey: i.placementKey })), disjoint: false, signature: JSON.stringify(items.map(i => i.nodeKey)), revision: this.editor.repository.state.revision, scope: this.scope(items[0]?.contentKey ?? this.editor.repository.readState().placements[this.editor.blockClipboard.gapParent() ?? '']?.contentKey), session: this.context().session };
  }
  private valid(bookmark: Bookmark, event?: Event, cross = false): boolean {
    if (!this.alive || bookmark.revision !== this.editor.repository.state.revision || bookmark.session !== this.context().session || bookmark.scope.cavernId !== this.context().cavernId || !this.editor.projections.has(bookmark.viewId)) return false;
    if (bookmark.kind === 'blocks') return bookmark.signature === JSON.stringify(this.editor.blockSelection.actionTargets().map(i => i.nodeKey));
    if (!cross && bookmark.nodeKey && this.editor.mounts.get(bookmark.nodeKey)?.root.contains(document.activeElement) !== true && !document.activeElement?.closest('[data-mutable-image-consent]')) return false;
    return this.textBookmark(event, cross, bookmark.nodeKey)?.signature === bookmark.signature;
  }
  /** Minimal explicit command, exposed in the existing TextBlock menu. */
  pasteMarkdown(nodeKey: string, plain = false) {
    if (!this.enabled() || !plain && !this.editor.features.markdownClipboard || !this.alive) return;
    try {
      if (this.pending) throw Error('A clipboard operation is already in progress.');
      const mount = this.editor.mounts.get(nodeKey);
      if (!mount || mount.inputPolicy !== 'standoff' || mount.composing) return;
      // Menus already retain the exact native selection. Restore before bookmarking,
      // and close without scheduling a second focus/selection restoration.
      const menu = this.editor.overlays.overlays.find(o => o.viewType === 'context-menu' && o.ownerKey === nodeKey);
      const selection = menu?.returnFocusKey === nodeKey ? menu.returnInlineSelection : mount.captureInlineSelection?.();
      if (menu) this.editor.overlays.close(menu.key, false);
      mount.focus(); if (selection) mount.restoreInlineSelection?.(selection);
      const cross = !!this.editor.crossText.range();
      const bookmark = this.textBookmark(undefined, cross, nodeKey); if (!bookmark) return;
      this.clearIntent();
      const readEpoch = this.markdownReadEpoch;
      this.notify('Reading clipboard…');
      this.asyncTask(async () => {
        let data, files: ClipboardFile[] = [];
        try { const bundle = await readAsyncClipboardBundle(false); data = bundle.data; files = bundle.files; }
        catch {
          if (readEpoch !== this.markdownReadEpoch) throw Error('Paste cancelled.');
          if (!this.valid(bookmark, undefined, cross)) throw Error('Destination changed; paste cancelled.');
          this.notify(plain ? 'Clipboard read unavailable. Grant clipboard access to use Paste as plain text.' : 'Clipboard read unavailable. Press Command/Control-Shift-V here to paste as Markdown.'); return;
        }
        if (readEpoch !== this.markdownReadEpoch) throw Error('Paste cancelled.');
        if (!this.valid(bookmark, undefined, cross)) throw Error('Destination changed; paste cancelled.');
        const literal = plain || markdownLiteralContext(this.editor, nodeKey, false);
        this.notify(literal ? 'Preparing plain text…' : 'Preparing Markdown…');
        const prepared = await this.prepareImport({ data, plain: literal, asMarkdown: !literal, scope: bookmark.scope, assets: [], blocks: [], selections: bookmark.disjoint ? bookmark.slices.length : 1 }, files, bookmark, undefined, cross);
        if (!this.valid(bookmark, undefined, cross)) throw Error('Destination changed; paste cancelled.');
        const notice = prepared.fragment ? this.insert(bookmark, prepared.fragment, false, prepared.natives) : undefined;
        this.notify(prepared.notice ?? notice ?? 'Pasted Markdown.');
      });
    } catch (error) { this.error(error); }
  }
  handleText(event: ClipboardEvent, cross = false): boolean {
    if(this.copyProjectionEvent(event))return true;
    if (!this.enabled()) return false;
    try {
      const bookmark = this.textBookmark(event, cross);
      if (!bookmark) {
        // Whitespace between Blocks focuses the document container, not an
        // insertion boundary. Never guess a destination or fail silently there.
        const target = event.target instanceof Element ? event.target : undefined;
        const resolved = this.editor.mounts.resolveEvent(event);
        if (event.type === 'paste' && resolved && !resolved.handle.composing &&
          !target?.closest('input, textarea, select, button, [role="dialog"], [role="menu"], [contenteditable="true"]:not(.reactive-standoff-flow)') &&
          (resolved.handle.inputPolicy === 'standoff' || resolved.handle.inputPolicy === 'container')) {
          this.stop(event);
          this.notify('Click inside a text paragraph or beside an image placeholder to place the caret, then paste again.');
        }
        return true;
      }
      this.consume(event, bookmark, cross);
    } catch (error) { this.stop(event); this.error(error); }
    return true;
  }
  handleBlocks(id: string, event?: Event): boolean {
    if (event instanceof KeyboardEvent) { this.key(event); return false; } // Let the browser issue the trusted clipboard event.
    try {
      const bookmark = this.blockBookmark();
      if (event && ['copy', 'cut', 'paste'].includes(event.type)) this.consume(event as ClipboardEvent, bookmark);
      else {
        if (this.pending) throw Error('A clipboard operation is already in progress.');
        if (id === 'selection.paste') this.asyncTask(async () => {
          const { data, files } = await readAsyncClipboardBundle(this.editor.features.managedAssetClipboard); if (!this.valid(bookmark)) throw Error('Destination changed; paste cancelled.');
          this.notify('Preparing paste…');
          const imported = await this.prepareImport({ data, plain: false, scope: bookmark.scope, assets: [], blocks: [], selections: 1 }, files, bookmark);
          if (!this.valid(bookmark)) throw Error('Destination changed; paste cancelled.');
          const notice = imported.fragment ? this.insert(bookmark, imported.fragment, false, imported.natives) : undefined; this.notify(imported.notice ?? notice ?? 'Pasted Blocks.');
        });
        else {
          if (!canWriteAsync()) throw Error('Use Command/Control-C or X with a selected Block in this browser.');
          this.write(bookmark, id === 'selection.cut');
        }
      }
    } catch (error) { this.error(error); }
    return true;
  }
  private stop(event: Event) { if (event.cancelable) event.preventDefault(); event.stopImmediatePropagation(); }
  private consume(event: ClipboardEvent, b: Bookmark, cross = false) {
    this.stop(event);
    if (this.pending) throw Error('A clipboard operation is already in progress.');
    if (event.type === 'paste') {
      const plain = !!b.nodeKey && markdownLiteralContext(this.editor, b.nodeKey, false);
      const intent = this.markdownIntent;
      const asMarkdown = !!intent && intent.until >= Date.now() && (intent.target === (this.editor.mounts.resolveEvent(event)?.handle.focusElement ?? event.target)) && this.valid(intent.bookmark, event, cross);
      this.clearIntent();
      const data = captureClipboard(event.clipboardData);
      const files = this.editor.features.managedAssetClipboard && !plain && !asMarkdown ? captureFiles(event.clipboardData) : [];
      if ((!plain && this.editor.features.managedAssetClipboard && (files.length > 0 || Object.values(data).some(value => /image-cell|data-mutable-fragment|<img\b|!\[/i.test(value)))) || (this.editor.features.markdownClipboard && !plain && asMarkdown) || Object.values(data).reduce((n, value) => n + value.length, 0) > 10000) {
        this.notify('Preparing paste…');
        this.asyncTask(async () => {
          const prepared = await this.prepareImport({ data, plain, asMarkdown, scope: b.scope, assets: plain || asMarkdown ? [] : [...this.availableAssets()], blocks: plain || asMarkdown ? [] : [...this.availableBlocks(b.scope)], selections: b.disjoint ? b.slices.length : 1 }, files, b, event, cross);
          if (!this.valid(b, event, cross)) throw Error('Destination changed; paste cancelled.');
          const notice = prepared.fragment ? this.insert(b, prepared.fragment, false, prepared.natives) : undefined;
          this.notify(prepared.notice ?? notice ?? 'Pasted Mutable content.');
        });
        return;
      }
      const imported = importClipboard(data, plain, this.editor.features.externalHtmlClipboard, this.editor.features.markdownClipboard, asMarkdown);
      const notice = imported.fragment ? this.insert(b, imported.fragment) : undefined;
      this.notify(imported.notice ?? notice ?? 'Pasted Mutable content.'); return;
    }
    if (!b.slices.length || b.kind === 'text' && b.slices.every(s => s.start === s.end)) return;
    if (b.kind === 'text' && b.disjoint) b = { ...b, slices: b.slices.filter(s => s.start !== s.end) };
    this.write(b, event.type === 'cut', event, cross);
  }
  /** Shared dispatch order for resource paste and processing an existing URI. */
  private processResource(b: Bookmark, source: string, event: Event, cross: boolean): boolean {
    if (b.nodeKey && this.editor.features.deterministicAcademicResources) {
      if (academicIdentifier(source) || academicJob(source)) { void this.editor.interchange.importAcademicSource(b.nodeKey, source); return true; }
      const bibliography = /^\s*@(?:article|book|misc|inproceedings|incollection|string|proceedings|phdthesis|techreport)\s*[{(]/i.test(source) ? 'bibtex' : /^\s*TY  - /m.test(source) ? 'ris' : undefined;
      if (bibliography) { void this.editor.interchange.importBibliographyText(b.nodeKey, source, bibliography); return true; }
    }
    const pdf = this.editor.features.crossResourceLoaders ? pdfInput(source) : undefined;
    if (pdf) { this.pastePdf(b, pdf, event, cross); return true; }
    if (this.editor.features.iiifResourceLoaders && iiifInput(source)) { this.pasteIIIF(b, source.trim(), event, cross); return true; }
    const wiki = this.editor.features.academicResourceLoaders ? wikipediaInput(source) : undefined;
    if (wiki) { this.pasteWikipedia(b, wiki.sourceUrl, event, cross); return true; }
    const doi = this.editor.features.academicResourceLoaders ? doiInput(source) : undefined;
    if (doi) { this.pasteAcademic(b, doi.sourceUrl, event, cross); return true; }
    if (b.nodeKey && this.editor.features.webResourceViewers && (webCandidate(source) || /^mutable-web-job:[a-f0-9-]{36}$/i.test(source.trim()))) {
      if (b.disjoint) throw Error('Choose one insertion destination');
      void this.editor.interchange.importWebResource(b.nodeKey, source); return true;
    }
    const resource = this.editor.features.resourceUrlPaste ? resourceUrl(source) : undefined;
    if (resource) { this.pasteResource(b, resource, source.trim(), event, cross); return true; }
    return false;
  }
  private pastePdf(bookmark:Bookmark,source:string,event:Event,cross:boolean){
    if(bookmark.disjoint)throw Error('Paste a PDF into one selection.');
    this.notify('Acquiring managed PDF…');this.asyncTask(async()=>{
      const signal=this.importController!.signal;const check=()=>{signal.throwIfAborted();if(!this.valid(bookmark,event,cross))throw Error('Destination changed; PDF insertion cancelled. The original may have been retained.');};check();
      const api=new HttpApplicationServices(()=>{const c=this.context();if(!c?.cavernId||!c.session)throw Error('Open a Vault before importing a PDF');return {cavernId:c.cavernId,session:c.session};});
      const result=await api.call('pdf.import',{id:crypto.randomUUID(),source},signal);check();const prepared=pdfBlock(result.snapshot,source);this.insert(bookmark,prepared.fragment,false,[this.editor.features.reversibleBlocks ? resourceSurface(prepared.native) : prepared.native]);this.notify('Pasted retained PDF. Open its local viewer; save to retain this occurrence.');
    });
  }
  private pasteIIIF(bookmark:Bookmark,source:string,event:Event,cross:boolean){
    if(bookmark.disjoint)throw Error('Paste an IIIF resource into one selection.');
    this.notify('Capturing IIIF source…');this.asyncTask(async()=>{
      const signal=this.importController!.signal;const check=()=>{signal.throwIfAborted();if(!this.valid(bookmark,event,cross))throw Error('Destination changed; IIIF insertion cancelled. Captured sources may have been retained.');};
      check();const api=new HttpApplicationServices(()=>{const c=this.context();if(!c?.cavernId||!c.session)throw Error('Open a Vault before importing IIIF');return {cavernId:c.cavernId,session:c.session};});
      const result=await api.call('iiif.import',{id:crypto.randomUUID(),source},signal);check();const prepared=iiifBlock(result.snapshot,source);this.insert(bookmark,prepared.fragment,false,[this.editor.features.reversibleBlocks ? resourceSurface(prepared.native) : prepared.native]);this.notify('Pasted IIIF source. Activate its viewer to load remote tiles. Save to retain this occurrence.');
    });
  }
  private pasteWikipedia(bookmark:Bookmark,source:string,event:Event,cross:boolean){
    if(bookmark.disjoint)throw Error('Paste an article into one selection.');
    this.notify('Capturing Wikipedia revision…');this.asyncTask(async()=>{
      const signal=this.importController!.signal;const check=()=>{signal.throwIfAborted();if(!this.valid(bookmark,event,cross))throw Error('Destination changed; article insertion cancelled. Captured knowledge may have been retained.');};
      check();const api=new HttpApplicationServices(()=>{const c=this.context();if(!c?.cavernId||!c.session)throw Error('Open a Vault before importing an article');return {cavernId:c.cavernId,session:c.session};});
      const result=await api.call('encyclopedia.import',{id:crypto.randomUUID(),source},signal);check();const prepared=webArticleBlock(result,source);check();this.insert(bookmark,prepared.fragment,false,[this.editor.features.reversibleBlocks ? resourceSurface(prepared.native) : prepared.native]);this.notify('Pasted captured article. Save the document to retain this occurrence.');
    });
  }
  private pasteAcademic(bookmark:Bookmark,source:string,event:Event,cross:boolean){
    if(bookmark.disjoint)throw Error('Paste a citation into one selection.');
    const id=crypto.randomUUID();this.notify('Resolving DOI…');
    this.asyncTask(async()=>{
      const signal=this.importController!.signal;
      const check=()=>{signal.throwIfAborted();if(!this.valid(bookmark,event,cross))throw Error('Destination changed; citation insertion cancelled. Canonical metadata may have been retained.');};
      check();const api=new HttpApplicationServices(()=>{const scope=this.context();if(!scope?.cavernId||!scope.session)throw Error('Open a Vault before importing a DOI');return {cavernId:scope.cavernId,session:scope.session};});
      const result=await api.call('academic.import',{id,source},signal);check();
      const prepared=citationBlock(result.citation,source);check();this.insert(bookmark,prepared.fragment,false,[this.editor.features.reversibleBlocks ? resourceSurface(prepared.native) : prepared.native]);
      this.notify('Pasted citation. Save the document to retain this occurrence.');
    });
  }
  private pasteResource(bookmark: Bookmark, resource: ResourceUrl, sourceUrl: string, event: Event, cross: boolean) {
    if (bookmark.disjoint) throw Error('Paste a resource Block into a single text selection.');
    this.notify(resource.kind === 'image' ? 'Downloading image…' : 'Creating resource Block…');
    this.asyncTask(async () => {
      const signal = this.importController!.signal;
      const check = () => { signal.throwIfAborted(); if (!this.valid(bookmark, event, cross)) throw Error('Destination changed; paste cancelled.'); };
      check();
      let image;
      if (resource.kind === 'image') {
        if (!this.editor.features.managedAssetClipboard) throw Error('Managed image import is disabled.');
        const lease = await this.assets.begin([resource.url], signal); this.assetLease = lease; check();
        image = await this.assets.remote(lease, resource.url, signal); check();
        await this.assets.action(lease, 'publish', signal); check();
      }
      const prepared = resourceBlock(sourceUrl, image); check();
      this.insert(bookmark, prepared.fragment, false, [this.editor.features.reversibleBlocks ? resourceSurface(prepared.native) : prepared.native]);
      this.notify(`Pasted ${resource.video ? `${resource.video.provider === 'youtube' ? 'YouTube' : 'Vimeo'} player` : resource.kind === 'image' ? 'image' : 'web page'} Block.`);
    });
  }
  private write(b: Bookmark, cut: boolean, event?: ClipboardEvent, cross = false) {
    const fragment = serializeSelection(this.editor.repository.readState(), b.slices, b.scope);
    const representations = exportClipboard(fragment);
    if (canWriteAsync() && (!event || event.isTrusted)) {
      // Start the write within the activation callback; don't await a resolver first.
      this.asyncTask(async () => {
        await writeAsyncClipboard(representations);
        if (cut) {
          if (!this.valid(b, event, cross)) throw Error('Copied, but the source changed; nothing was cut.');
          this.recoverySignal[1](fragment); this.remove(b);
        }
        this.notify(cut ? 'Cut content. Undo restores it; a recovery copy is retained.' : 'Copied Mutable content.');
      });
    } else {
      if (!event?.cancelable) throw Error('Clipboard event cannot safely replace the browser action; nothing was removed.');
      writeEventClipboard(event.clipboardData, representations);
      if (cut) { this.recoverySignal[1](fragment); this.remove(b); }
      this.notify(cut ? 'Cut content. Undo or Recover cut copy restores access if the clipboard fails.' : 'Copied Mutable content.');
    }
  }
  private asyncTask(task: () => Promise<void>) {
    this.pending = true;
    this.importController = new AbortController(); this.assetInserted = false;
    void task().catch(e => { if (this.alive) this.error(e); }).finally(async () => {
      const lease = this.assetLease, inserted = this.assetInserted; this.assetLease = undefined;
      this.pending = false; this.importController = undefined;
      if (lease) { try { await this.assets.action(lease, inserted ? 'finish' : 'abort'); } catch { /* Durable ledger retains publication and recovers staging on next Cavern open. */ } }
    });
  }
  private async prepareImport(input: PastePreparation, files: ClipboardFile[], bookmark: Bookmark, event?: Event, cross = false): Promise<PreparedPaste> {
    if (!this.editor.features.managedAssetClipboard || input.plain || input.asMarkdown) return this.prepare(input);
    const parsed = await this.prepare({ ...input, parseOnly: true });
    const fragment = parsed.fragment ?? (files.length ? imagesFragment(files) : undefined);
    if (!fragment) return parsed;
    const valid = () => this.valid(bookmark, event, cross);
    const choose = (urls: string[], error?: string) => new Promise<string[] | undefined>(resolve => {
      if (!valid()) { resolve(undefined); return; }
      this.imagePromptSignal[1]({ urls, error });
      this.chooseImageResult = selected => {
        const restore = valid() && !!document.activeElement?.closest('[data-mutable-image-consent]');
        this.chooseImageResult = undefined;
        if (restore && bookmark.nodeKey) { const mount = this.editor.mounts.get(bookmark.nodeKey); const slice = bookmark.slices[bookmark.primaryIndex ?? 0]; const selection = mount?.captureInlineSelection?.() ?? { anchor: slice.start!, head: slice.end! }; mount?.focus(); if (selection) mount?.restoreInlineSelection?.(selection); }
        this.imagePromptSignal[1](undefined); resolve(selected);
      };
    });
    let resolved;
    try {
      resolved = await resolveClipboardImages({ fragment, files, assets: this.assets, cavernId: bookmark.scope.cavernId, signal: this.importController!.signal, valid,
        // This policy applies only to an explicit clipboard paste. Other import
        // operations retain their own consent; the service still authorises the
        // exact URL list and validates every acquired image.
        choose: this.editor.features.automaticClipboardImages ? async urls => urls : choose,
        lease: value => { this.assetLease = value; } });
    } catch (error) {
      if (!valid() || this.importController!.signal.aborted || (error as Error).message === 'Paste cancelled.') throw error;
      const choice = await choose([], `${(error as Error).message} Keep images as placeholders instead?`);
      if (!choice) throw Error('Paste cancelled.');
      const lease = this.assetLease; this.assetLease = undefined;
      if (lease) await this.assets.action(lease, 'abort').catch(() => {});
      resolved = { fragment, admitted: [], notice: 'Images were retained as inactive placeholders.' };
    }
    if (!valid()) throw Error('Destination changed; paste cancelled.');
    const prepared = await this.prepare({ ...input, fragment: resolved.fragment, assets: [...input.assets, ...resolved.admitted] });
    return { ...prepared, notice: [resolved.notice, (parsed.fragment ? parsed.notice : undefined)?.replace('Images were preserved as inactive placeholders.', resolved.admitted.length ? '' : 'Images were preserved as inactive placeholders.')].filter(Boolean).join(' ') || undefined };
  }
  private prepare(input: PastePreparation): Promise<PreparedPaste> {
    input = { ...input, semanticHtml: this.editor.features.externalHtmlClipboard, markdown: this.editor.features.markdownClipboard };
    if (typeof Worker === 'undefined') return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.cancelPreparation = undefined; try { resolve(preparePaste(input)); } catch (e) { reject(e); } }, 0);
      this.cancelPreparation = () => { clearTimeout(timer); this.cancelPreparation = undefined; reject(Error('Paste cancelled.')); };
    });
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../interchange/prepare.worker.ts', import.meta.url), { type: 'module' });
      const finish = () => { clearTimeout(deadline); worker.terminate(); this.cancelPreparation = undefined; };
      const deadline = setTimeout(() => { finish(); reject(Error('Paste preparation timed out; nothing was changed.')); }, 10000);
      worker.onmessage = event => { finish(); if (event.data.error) reject(Error(event.data.error)); else resolve(event.data.result); };
      worker.onerror = () => { finish(); reject(Error('Paste preparation failed; nothing was changed.')); };
      this.cancelPreparation = () => { finish(); reject(Error('Paste cancelled.')); };
      try { worker.postMessage(input); } catch (error) { finish(); reject(error); }
    });
  }
  private availableAssets() {
    const assets = new Map<string, string>();
    for (const c of Object.values(this.editor.repository.readState().contents)) if (c.viewType === 'image-cell' && typeof c.payload.assetId === 'string' && typeof c.payload.src === 'string') assets.set(c.payload.assetId, c.payload.src);
    return assets;
  }
  private availableBlocks(scope: InterchangeScope) {
    const result = new Map<string, boolean>(); if (!scope.resourceId) return result;
    const state = this.editor.repository.readState();
    const root = Object.values(state.contents).find(c => c.viewType === 'document-block' && ((c.payload.metadata as any)?.documentId ?? c.payload.id) === scope.resourceId);
    if (!root) return result;
    const seen = new Set<string>();
    const visit = (key: string) => {
      if (seen.has(key)) return; seen.add(key); const c = state.contents[key];
      if (!c || c !== root && c.viewType === 'document-block') return;
      if (typeof c.payload.id === 'string') result.set(c.payload.id, !!(c.payload.metadata as any)?.anchor);
      for (const edge of [...c.children, ...Object.values(c.ownedRelations)]) { const p = state.placements[edge]; if (p && !p.externalReference) visit(p.contentKey); }
    };
    visit(root.key); return result;
  }
  private remove(b: Bookmark) {
    if (b.kind === 'blocks') { this.editor.blockClipboard.remove(true, true); return; }
    this.insert(b, plainFragment(''), true);
  }
  private insert(b: Bookmark, fragment: MutableFragment, cut = false, prepared?: BlockFragment[]): string | undefined {
    validateFragment(fragment);
    let assets = new Map<string, string>();
    // Only imports containing embeds need an availability check. No typing or
    // plain-paste subscription maintains this inventory.
    if (!prepared && fragment.embeds.length && b.scope.cavernId === fragment.provenance?.cavernId) assets = this.availableAssets();
    const hasExternalBlocks = fragment.links.some(l => l.to.kind === 'external' && l.to.object === 'block') || fragment.blocks.some(b => [...b.blockProperties, ...b.inline?.properties ?? []].some(p => p.target?.kind === 'external' && p.target.object === 'block'));
    const blocks = !prepared && hasExternalBlocks ? this.availableBlocks(b.scope) : new Map<string, boolean>();
    const materialize = (f: MutableFragment) => materializeFragment(f, b.scope, assets, blocks);
    const diagnostic = (native: ReturnType<typeof materialize>) => Object.values(native.state.contents).some(c => c.viewType === 'mutable/opaque-block' || c.payload.original || c.payload.mutableUnresolvedLinks || (c.payload.standoffProperties as any[])?.some(p => p.type === 'mutable/opaque-property'))
      ? 'Pasted content. Unsupported types, unavailable images or foreign references were retained as inactive data.' : undefined;
    if (b.kind === 'blocks') {
      const native = prepared?.[0] ?? materialize(fragment);
      const keys = this.editor.commands.insertFragment(native, b.destination!, { commandId: 'selection.paste', subjects: [], clipboard: { token: crypto.randomUUID(), action: 'paste', preservedIds: false } });
      this.editor.blockSelection.replaceKeys(keys.map(k => this.editor.nodeForPlacementInView(k, b.viewId)!.key)); this.editor.blockClipboard.dismiss(); this.assetInserted = true; return diagnostic(native);
    }
    // Multiple disjoint source groups preserve their dependencies before allocation.
    const groups: MutableFragment['roots'][] = [[]];
    for (const root of fragment.roots) { groups.at(-1)!.push(root); if (root.separatorAfter === 'selection-gap') groups.push([]); }
    if (!groups.at(-1)!.length) groups.pop();
    if (b.disjoint && groups.length !== 1 && groups.length !== b.slices.length) throw Error('Selection group counts differ. Paste into one range or matching ranges.');
    const edits = b.disjoint ? [...b.slices].reverse().map((slice, index) => {
      const i = b.slices.length - 1 - index;
      const selected = groups.length > 1 ? fragmentGroup(fragment, groups[i]) : fragment;
      if (selected.roots.length !== 1 || !selected.roots[0].openStart || !selected.roots[0].openEnd) throw Error('Paste structured Blocks into a single text selection. Multiple selections accept inline slices.');
      return { segments: [{ placementKey: slice.placementKey, start: slice.start!, end: slice.end! }], fragment: prepared?.[index] ?? materialize(selected), slices: selected.roots };
    }) : [{ segments: b.slices.map(s => ({ placementKey: s.placementKey, start: s.start!, end: s.end! })), fragment: prepared?.[0] ?? materialize(fragment), slices: fragment.roots }];
    // Multi-caret edits must stay inline so every caret can be mapped exactly.
    if (b.disjoint && edits.some(e => {
      const root = e.fragment.state.contents[e.fragment.state.placements[e.fragment.roots[0]].contentKey];
      return !inlineMergePredicate(e.fragment, 'standoff-editor-block')(root);
    })) throw Error('Paste structured content into a single text selection.');
    const results = this.editor.commands.insertMutableText(edits, cut); this.assetInserted = true;
    const positions = results.map((r, i) => ({ ...r, caret: r.caret + edits.slice(i + 1).reduce((delta, e) => {
      const root = e.fragment.state.contents[e.fragment.state.placements[e.fragment.roots[0]].contentKey];
      return delta + root.inlineContent.length - (e.segments[0].end - e.segments[0].start);
    }, 0) })).reverse();
    const result = b.disjoint ? positions[Math.min(b.primaryIndex ?? 0, positions.length - 1)] : results.at(-1)!;
    this.editor.crossText.clear();
    const restore = () => {
      if (!this.alive) return;
      const node = this.editor.nodeForPlacementInView(result.placementKey, b.viewId); if (!node) return;
      this.editor.selections.clearSecondary(node.key);
      this.editor.selections.setPrimary(node.key, node.contentKey, node.viewId, result.caret);
      if (b.disjoint) for (const position of positions) if (position !== result) this.editor.selections.addCaret(node.key, node.contentKey, node.viewId, position.caret);
      const mount = this.editor.mounts.get(node.key); mount?.focus(); mount?.restoreInlineSelection?.({ anchor: result.caret, head: result.caret });
    };
    restore(); queueMicrotask(restore);
    return edits.map(e => diagnostic(e.fragment)).find(Boolean);
  }
  recoverCopy() {
    if (this.pending || !this.alive) return;
    const fragment = this.recovery(); if (!fragment) return;
    if (!canWriteAsync()) { this.notify('Use Undo to restore the cut in this browser.'); return; }
    this.asyncTask(async () => { await writeAsyncClipboard(exportClipboard(fragment)); this.notify('Recovered the cut content to the clipboard.'); });
  }
  private error(error: unknown) { this.notify(error instanceof Error ? error.message : String(error)); }
  dispose() { this.alive = false; this.projectionIntent=undefined; this.cancel(); this.clearIntent(); this.recoverySignal[1](undefined); this.dismiss(); }
}
