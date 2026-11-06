import { HttpApplicationServices } from '../runtime/application-services';
import {annotationCapabilities} from '../application/annotation-capabilities';
import {collectDocumentEntities} from '../features/entity-references/document-entities';
import {normalizeScholarly} from '../interchange/scholarly';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import { exportClipboard, NATIVE_MIME } from '../interchange/transport';
import { plainFragment } from '../interchange/serializer';
import { captureNative, decodeNative, nativeEnvelope } from '../persistence/native-resource';
import { blockMenuItems } from '../runtime/block-menu-actions';
import { featureFlags } from '../configuration';
const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(f => f()); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function setup(enabled = true, externalHtml = true, directDomCharacterCells = true, markdownClipboard = true, managedAssetClipboard = false, automaticClipboardImages = false, resourceUrlPaste = true, academicResourceLoaders = true, webResourceViewers = true) {
  const editor = new ReactiveEditor({ type: 'document-block', id: 'doc', children: [
    { type: 'standoff-editor-block', id: 'a', text: 'Rome abc', standoffProperties: [{ id: 'p', type: 'codex/entity-reference', value: 'rome', start: 0, end: 3 }] },
    { type: 'standoff-editor-block', id: 'b', text: 'target' },
  ] }, { features: { mutableClipboard: enabled, externalHtmlClipboard: externalHtml, directDomCharacterCells, markdownClipboard, managedAssetClipboard, automaticClipboardImages, resourceUrlPaste, academicResourceLoaders, webResourceViewers } });
  editor.clipboard.setContext(() => ({ cavernId: 'cavern', session: 'session' })); registerCoreViews(editor);
  const projection = editor.createView('clipboard-ui'), host = document.body.appendChild(document.createElement('div'));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host); editor.installGateway(document);
  cleanup.push(() => { editor.dispose(); dispose(); });
  const node = (id: string) => Object.values(projection.state.nodes).find(n => n.payload.id === id)!;
  const select = (id: string, start: number, end = start) => {
    const n = node(id), m = editor.mounts.get(n.key)!; m.focus(); m.restoreInlineSelection!({ anchor: start, head: end }); editor.selections.setPrimary(n.key, n.contentKey, n.viewId, start, end); return m.focusElement;
  };
  const dispatch = (type: string, target: Element, initial: Record<string, string> = {}, fail = false) => {
    const values = { ...initial }; const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { types: Object.keys(values), getData: (type: string) => values[type] ?? '', setData: (type: string, value: string) => { if (fail) throw Error('Clipboard write failed'); values[type] = value; } } }); target.dispatchEvent(event); return { values, event };
  };
  // Resource dispatcher coverage is independent of the retired Shift-V resource
  // binding. The process-at-caret group above qualifies the retained public chord.
  const resource = (source: string) => {
    const service = editor.clipboard as any;
    const bookmark = service.textBookmark(undefined, false, node('b').key);
    return service.processResource(bookmark, source, undefined, false);
  };
  return { editor, projection, host, node, select, dispatch, resource, texts: () => editor.encodeDocument().children!.map(c => c.text) };
}

describe('process resource URI at the caret', () => {
  const url = 'https://youtu.be/M7lc1UVf-VE?si=historical';
  function source(direct = true, text = '🙂 Before ' + url + ' after', resources = true) {
    const s = setup(true, true, direct, true, false, false, resources);
    s.editor.commands.replaceInlineRange(s.node('b').key, 0, 6, text);
    const target = s.select('b', [...text.slice(0, text.indexOf('https://'))].length + 12);
    return { ...s, target, text };
  }
  const press = (target: Element, extra: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true, ...extra });
    target.dispatchEvent(event); return event;
  };
  it.each([true, false])('converts only the URI with exact Undo/Redo (direct cells %s)', async direct => {
    const s = source(direct), before = nativeEnvelope(captureNative(s.editor.repository.readState(), 'doc'));
    const commit = vi.spyOn(s.editor.repository, 'commit'), fetch = vi.spyOn(globalThis, 'fetch');
    expect(press(s.target).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(s.host.querySelector('[data-block-type="youtube-player-block"]')).not.toBeNull());
    expect(s.texts()).toEqual(['Rome abc', '🙂 Before ', undefined, ' after']);
    expect(commit).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
    expect(Object.values(s.editor.repository.readState().contents).find(c => c.viewType === 'youtube-player-block')?.payload.sourceUrl).toBe(url);
    s.editor.repository.undo(); expect(nativeEnvelope(captureNative(s.editor.repository.readState(), 'doc'))).toEqual(before);
    s.editor.repository.redo(); expect(s.host.querySelector('[data-block-type="youtube-player-block"]')).not.toBeNull();
  });
  it.each(['success', 'failure', 'cancel', 'stale', 'caret'])('uses PDF acquisition and preserves the URI until success: %s', async outcome => {
    const pdf = 'https://example.org/paper.pdf', s = source(true, 'Before ' + pdf + ' after');
    let resolve!: (value: any) => void, reject!: (reason: Error) => void;
    const call = vi.spyOn(HttpApplicationServices.prototype, 'call').mockImplementation(() => new Promise((a,b) => { resolve = a; reject = b; }));
    const commit = vi.spyOn(s.editor.repository, 'commit');
    press(s.target);
    expect(call).toHaveBeenCalledWith('pdf.import', expect.objectContaining({ source: pdf }), expect.any(AbortSignal));
    expect(s.texts()[1]).toBe(s.text); expect(commit).not.toHaveBeenCalled();
    if (outcome === 'cancel') s.editor.clipboard.cancel();
    if (outcome === 'stale') s.editor.commands.replaceInlineRange(s.node('b').key, 0, 0, '!');
    if (outcome === 'caret') s.select('b', 0);
    if (outcome === 'failure') reject(Error('PDF unavailable'));
    else resolve({ snapshot: {version:1,kind:'pdf',snapshotId:crypto.randomUUID(),identityId:crypto.randomUUID(),entityId:crypto.randomUUID(),resourceId:crypto.randomUUID(),sourceUrl:pdf,endpoint:pdf,retrievedAt:'2026-10-24T00:00:00Z',asset:{kind:'managed',cavernId:'cavern',assetId:'sha256:'+'a'.repeat(64)},inspection:{kind:'pdf-inspection',pages:2,label:'Paper',version:'1.7'}} });
    await tick(); await tick();
    if (outcome === 'success') {
      expect(s.texts()).toEqual(['Rome abc','Before ',undefined,' after']); expect(commit).toHaveBeenCalledTimes(1);
      expect(s.host.querySelector('.mutable-pdf')).not.toBeNull();
      s.editor.repository.undo(); expect(s.texts()[1]).toBe(s.text);
    } else {
      expect(s.texts()[1]).toBe((outcome === 'stale' ? '!' : '') + s.text);
      expect(s.host.querySelector('.mutable-pdf')).toBeNull();
    }
  });
  it('rejects no-URI, selection, repeated keys and IME without edits or snapshots', () => {
    const s = source(), snapshot = vi.spyOn(s.editor.repository, 'snapshot'), commit = vi.spyOn(s.editor.repository, 'commit');
    press(s.target, { repeat: true }); press(s.target, { isComposing: true });
    s.select('b', 0); press(s.target);
    s.select('b', 12, 20); press(s.target);
    expect(commit).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled(); expect(s.texts()[1]).toBe(s.text);
  });
  it('leaves dialog fields and ordinary keypresses alone', () => {
    const s = source(), field = s.target.appendChild(document.createElement('input'));
    const snapshot = vi.spyOn(s.editor.repository, 'snapshot'), commit = vi.spyOn(s.editor.repository, 'commit');
    expect(press(field).defaultPrevented).toBe(false);
    s.target.dispatchEvent(new KeyboardEvent('keydown', {key:'a',bubbles:true}));
    expect(commit).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled();
  });
  it('uses the existing web confirmation flow without changing the URI on cancellation', async () => {
    const s = source(true, 'Before https://example.org/article after');
    const commit = vi.spyOn(s.editor.repository, 'commit');
    press(s.target);
    expect(s.editor.interchange.question()?.title).toBe('Capture web preview?');
    expect(s.editor.interchange.question()?.details).toContain('https://example.org/article');
    expect(document.getSelection()?.toString()).toBe('https://example.org/article');
    s.editor.interchange.respond(undefined); await tick();
    expect(s.texts()[1]).toBe(s.text); expect(commit).not.toHaveBeenCalled();
  });
  it('respects disabled resource handlers and restores the caret', () => {
    const s = source(true, undefined, false), before = s.editor.mounts.get(s.node('b').key)!.captureInlineSelection!();
    const commit = vi.spyOn(s.editor.repository, 'commit');
    press(s.target);
    expect(s.editor.clipboard.message()).toContain('No enabled resource handler');
    expect(s.editor.mounts.get(s.node('b').key)!.captureInlineSelection!()).toEqual(before);
    expect(s.texts()[1]).toBe(s.text); expect(commit).not.toHaveBeenCalled();
  });
});

describe('Mutable clipboard UI routing and lifecycle', () => {
  const clipboardRead = (read: () => Promise<unknown>) => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read } });
    cleanup.push(() => { delete (navigator as any).clipboard; });
  };
  const markdownItems = (value: string) => [{ types: ['text/plain'], getType: async () => ({ size: value.length, text: async () => value }) }];
  it.each([
    ['metaKey','https://youtu.be/M7lc1UVf-VE?si=historical','youtube-player-block','www.youtube-nocookie.com'],
    ['ctrlKey','https://vimeo.com/76979871?share=copy','vimeo-player-block','player.vimeo.com'],
    ['metaKey','https://example.org/page?q=history','iframe-block','example.org'],
  ])('creates a resource Block with %s, preserves surrounding text and restores exact Undo', async (modifier,url,type,host) => {
    const s=setup(true,true,true,true,false,false,true,true,type!=='iframe-block'),target=s.select('b',3),before=nativeEnvelope(captureNative(s.editor.repository.readState(),'doc'));
    const commit=vi.spyOn(s.editor.repository,'commit'),fetch=vi.spyOn(globalThis,'fetch');
    s.resource(url);
    await vi.waitFor(()=>expect(s.host.querySelector(`[data-block-type="${type}"] iframe`)).not.toBeNull());
    const block=Object.values(s.editor.repository.readState().contents).find(c=>c.viewType===type)!;
    expect(block.payload.sourceUrl).toBe(url);expect(commit).toHaveBeenCalledTimes(1);expect(fetch).not.toHaveBeenCalled();
    const frame=s.host.querySelector<HTMLIFrameElement>(`[data-block-type="${type}"] iframe`)!;
    expect(new URL(frame.src).hostname).toBe(host);
    if(type==='iframe-block'){expect(frame.style.height).toBe('600px');expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');}
    else expect(new URL(frame.src).searchParams.get('autoplay')).toBe('0');
    expect(s.editor.encodeDocument().children!.map(b=>b.text)).toEqual(['Rome abc','tar',undefined,'get']);
    const saved=new TextEncoder().encode(JSON.stringify(nativeEnvelope(captureNative(s.editor.repository.readState(),'doc'))));
    expect(JSON.stringify(decodeNative(saved))).toContain(url);
    s.editor.repository.undo();expect(nativeEnvelope(captureNative(s.editor.repository.readState(),'doc'))).toEqual(before);
    s.editor.repository.redo();expect(s.host.querySelector(`[data-block-type="${type}"] iframe`)).not.toBeNull();
  });
  it('retains ordinary and disabled-feature URL paste as text, with no acquisition', () => {
    for(const enabled of [true,false]){
      const s=setup(true,true,true,true,true,false,enabled),target=s.select('b',0,6),begin=vi.spyOn(s.editor.assets,'begin');

      s.dispatch('paste',target,{'text/plain':'https://example.org/photo.png'});
      expect(s.texts()[1]).toBe('https://example.org/photo.png');expect(begin).not.toHaveBeenCalled();
    }
  });
  it.each(['success','failure','stale','cancel'])('downloads an ImageBlock for resource paste: %s',async outcome=>{
    const s=setup(true,true,true,true,true),assets=s.editor.assets,url='https://example.org/photo.png?original=1';
    const lease={id:'resource',token:'token',cavernId:'cavern'},manifest={kind:'managed' as const,cavernId:'cavern',assetId:'sha256:'+'c'.repeat(64),mediaType:'image/png',byteLength:10,width:3,height:2};
    vi.spyOn(assets,'begin').mockResolvedValue(lease);const bind=vi.spyOn(assets,'bind').mockImplementation(()=>()=>{});
    const action=vi.spyOn(assets,'action').mockResolvedValue({});let finish!:()=>void;
    const remote=vi.spyOn(assets,'remote').mockImplementation(async()=>{await new Promise<void>(r=>{finish=r});if(outcome==='failure')throw Error('Invalid image');return manifest;});
    const target=s.select('b',0,6),before=nativeEnvelope(captureNative(s.editor.repository.readState(),'doc'));
    s.resource(url);await vi.waitFor(()=>expect(remote).toHaveBeenCalledTimes(1));
    expect(s.editor.clipboard.imagePrompt()).toBeUndefined();
    if(outcome==='stale')s.editor.commands.replaceInlineRange(s.node('b').key,0,0,'!');
    if(outcome==='cancel')s.editor.clipboard.cancel();finish();
    await vi.waitFor(()=>expect(action).toHaveBeenCalledWith(lease,outcome==='success'?'finish':'abort'));
    const block=Object.values(s.editor.repository.readState().contents).find(c=>c.viewType==='image-block');
    if(outcome==='success'){
      expect(block?.payload.sourceUrl).toBe(url);expect(block?.payload.asset).toMatchObject({assetId:manifest.assetId});
      expect(bind).toHaveBeenCalled();expect(s.host.querySelector('.reactive-image img')).not.toBeNull();
      s.editor.repository.undo();expect(nativeEnvelope(captureNative(s.editor.repository.readState(),'doc'))).toEqual(before);
      s.editor.repository.redo();expect(s.host.querySelector('.reactive-image img')).not.toBeNull();
    }else{expect(block).toBeUndefined();expect(s.texts()[1]).toBe(outcome==='stale'?'!target':'target');}
  });
  it('exposes explicit Markdown in the existing menu, restores its selection, and commits once', async () => {
    clipboardRead(async () => markdownItems('**bold**'));
    const s = setup(); s.select('b', 0, 6); const commits = vi.spyOn(s.editor.repository, 'commit');
    const key = s.node('b').key;
    s.editor.overlays.open({ ownerKey: key, viewType: 'context-menu', anchor: { x: 0, y: 0 } });
    await tick();
    blockMenuItems(s.editor, key).find(i => i.label === 'Paste as Markdown (Ctrl/Cmd+Shift+V)')!.run!();
    await vi.waitFor(() => expect(s.texts()).toEqual(['Rome abc', 'bold']));
    const inserted = s.editor.encodeDocument().children![1];
    expect(commits).toHaveBeenCalledTimes(1); expect(inserted.standoffProperties).toMatchObject([{ type: 'style/bold' }]);
    expect(s.editor.overlays.overlays).toHaveLength(0);
    expect(document.activeElement).toBe(s.editor.mounts.get(s.node(inserted.id!).key)!.focusElement);
    s.editor.repository.undo(); expect(s.texts()).toEqual(['Rome abc', 'target']);
    s.editor.repository.redo(); expect(s.texts()).toEqual(['Rome abc', 'bold']);
  });
  it('keeps Markdown-only and plain MIME literal on ordinary paste', async () => {
    const s = setup(); s.dispatch('paste', s.select('b', 0, 6), { 'text/markdown': '**typed**' });
    expect(s.texts()[1]).toBe('**typed**');
    expect(s.node('b').payload.standoffProperties).toEqual([]);
    s.editor.repository.undo(); s.dispatch('paste', s.select('b', 0, 6), { 'text/plain': '**literal**' });
    expect(s.texts()[1]).toBe('**literal**'); expect(s.node('b').payload.standoffProperties).toEqual([]);
  });
  it('keeps Markdown behind both the shared flag and its importer preference', () => {
    for (const s of [setup(false), setup(true, true, true, false)]) {
      expect(blockMenuItems(s.editor, s.node('b').key).some(i => i.label === 'Paste as Markdown (Ctrl/Cmd+Shift+V)')).toBe(false);
      const commit = vi.spyOn(s.editor.repository, 'commit'); s.editor.clipboard.pasteMarkdown(s.node('b').key);
      expect(commit).not.toHaveBeenCalled();
    }
    const s = setup(true, true, true, false); s.dispatch('paste', s.select('b', 0, 6), { 'text/markdown': '**literal**' });
    expect(s.texts()[1]).toBe('**literal**');
  });
  it('requests the explicit chord after clipboard read denial, leaving ordinary paste literal', async () => {
    clipboardRead(async () => { throw Error('denied'); });
    const s = setup(), target = s.select('b', 0, 6); s.editor.clipboard.pasteMarkdown(s.node('b').key);
    await vi.waitFor(() => expect(s.editor.clipboard.message()).toContain('Press Command/Control-Shift-V'));
    expect(s.texts()[1]).toBe('target');
    target.dispatchEvent(new KeyboardEvent('keydown',{key:'v',ctrlKey:true,shiftKey:true,bubbles:true}));
    s.dispatch('paste', target, { 'text/plain': '**bold**' });
    await vi.waitFor(() => expect(s.texts()[1]).toBe('bold'));
    s.editor.repository.undo(); s.dispatch('paste', s.select('b', 0, 6), { 'text/plain': '**literal**' });
    expect(s.texts()[1]).toBe('**literal**');
  });
  it.each(['typing', 'selection', 'cavern', 'cancel', 'dispose'])('rejects asynchronous Markdown completion after %s changes', async change => {
    let resolve!: (items: unknown) => void;
    clipboardRead(() => new Promise(r => { resolve = r; }));
    const s = setup(); s.select('b', 0, 6); s.editor.clipboard.pasteMarkdown(s.node('b').key);
    if (change === 'typing') s.editor.commands.replaceInlineRange(s.node('b').key, 0, 0, '!');
    if (change === 'selection') s.select('b', 2);
    if (change === 'cavern') s.editor.clipboard.setContext(() => ({ cavernId: 'other', session: 'other' }));
    if (change === 'cancel') [...document.querySelectorAll<HTMLButtonElement>('[data-mutable-clipboard-status] button')].find(b => b.textContent === 'Cancel paste')!.click();
    if (change === 'dispose') s.editor.clipboard.dispose();
    const commit = vi.spyOn(s.editor.repository, 'commit'); resolve(markdownItems('**stale**')); await tick();
    expect(commit).not.toHaveBeenCalled(); expect(s.texts()[1]).toBe(change === 'typing' ? '!target' : 'target');
  });
  it.each([true, false])('offers explicit remote consent with no automatic fetch (direct=%s)', async direct => {
    const s = setup(true, true, direct, true, true), fetch = vi.spyOn(globalThis, 'fetch');
    s.dispatch('paste', s.select('b', 0, 6), { 'text/html': '<p>A<img src="https://clipboard-probe.invalid/map.png" alt="map">B</p>' });
    await vi.waitFor(() => expect(s.editor.clipboard.imagePrompt()?.urls).toEqual(['https://clipboard-probe.invalid/map.png']));
    expect(fetch).not.toHaveBeenCalled(); expect(s.texts()[1]).toBe('target');
    const button = [...document.querySelectorAll<HTMLButtonElement>('[data-mutable-image-consent] button')].find(b => b.textContent === 'Keep placeholders')!;
    button.focus();
    button.click();
    expect(document.activeElement, 'focus after consent').toBe(s.editor.mounts.get(s.node('b').key)!.focusElement);
    await vi.waitFor(() => expect(s.host.querySelector('.reactive-inline-image img'), s.editor.clipboard.message()).not.toBeNull());
    expect(s.host.querySelector('.reactive-inline-image img')!.hasAttribute('src')).toBe(false);expect(fetch).not.toHaveBeenCalled();
    s.editor.repository.undo();expect(s.texts()).toEqual(['Rome abc', 'target']);
  });
  it('cancels consent without changing the document', async () => {
    const s = setup(true, true, true, true, true), commits = vi.spyOn(s.editor.repository, 'commit');
    s.dispatch('paste', s.select('b', 0, 6), { 'text/html': '<img src="https://example.com/a">' });
    await vi.waitFor(() => expect(s.editor.clipboard.imagePrompt()).toBeDefined());s.editor.clipboard.cancel();await tick();expect(commits).not.toHaveBeenCalled();expect(s.texts()[1]).toBe('target');
  });
  it.each(['success','failure','stale','cancel'])('automatically acquires pasted remote images and handles %s', async outcome => {
    expect(featureFlags.automaticClipboardImages).toBe(true);
    const s=setup(true,true,true,true,true,true),assets=s.editor.assets;
    const lease={id:'auto',token:'token',cavernId:'cavern'};
    const manifest={kind:'managed' as const,cavernId:'cavern',assetId:'sha256:'+'b'.repeat(64),mediaType:'image/png',byteLength:10,width:3,height:2};
    const begin=vi.spyOn(assets,'begin').mockResolvedValue(lease);
    vi.spyOn(assets,'bind').mockImplementation(()=>()=>{});
    const action=vi.spyOn(assets,'action').mockResolvedValue({});
    let finish!:()=>void;
    const remote=vi.spyOn(assets,'remote').mockImplementation(async()=>{
      expect(s.editor.clipboard.imagePrompt()).toBeUndefined();
      await new Promise<void>(resolve=>{finish=resolve;});
      if(outcome==='failure')throw Error('Download rejected');
      return manifest;
    });
    const commit=vi.spyOn(s.editor.repository,'commit');
    s.dispatch('paste',s.select('b',0,6),{'text/html':'<img src="https://example.com/image.png">'});
    await vi.waitFor(()=>expect(remote).toHaveBeenCalledTimes(1));
    expect(begin).toHaveBeenCalledWith(['https://example.com/image.png'],expect.any(AbortSignal));
    expect(commit).not.toHaveBeenCalled();
    if(outcome==='stale')s.editor.commands.replaceInlineRange(s.node('b').key,0,0,'!');
    if(outcome==='cancel')s.editor.clipboard.cancel();
    finish();
    if(outcome==='failure'){
      await vi.waitFor(()=>expect(s.editor.clipboard.imagePrompt()?.error).toContain('Download rejected'));
      expect(commit).not.toHaveBeenCalled();
      s.editor.clipboard.chooseImages([]);
    }
    await vi.waitFor(()=>expect(action).toHaveBeenCalledWith(lease,outcome==='success'?'finish':'abort'));
    const image=Object.values(s.editor.repository.readState().contents).find(c=>c.viewType==='image-cell');
    if(outcome==='success'){
      expect(image?.payload.asset).toMatchObject({assetId:manifest.assetId});
      expect(commit).toHaveBeenCalledTimes(1);expect(s.editor.clipboard.imagePrompt()).toBeUndefined();
      s.editor.repository.undo();expect(s.texts()[1]).toBe('target');
      s.editor.repository.redo();expect(s.host.querySelector('.reactive-inline-image')).not.toBeNull();
    }else if(outcome==='failure')expect(image?.payload.status).toBe('failed');
    else {expect(image).toBeUndefined();expect(s.texts()[1]).toBe(outcome==='stale'?'!target':'target');}
  });
  it('does not acquire HTML images for explicit Markdown or ordinary URL text', async () => {
    const s=setup(true,true,true,true,true,true),begin=vi.spyOn(s.editor.assets,'begin');
    const target=s.select('b',0,6);
    target.dispatchEvent(new KeyboardEvent('keydown',{key:'v',metaKey:true,shiftKey:true,bubbles:true}));
    s.dispatch('paste',target,{'text/html':'<img src="https://example.com/image.png">','text/plain':'caption'});
    await vi.waitFor(()=>expect(s.texts()[1]).toBe('caption'));expect(begin).not.toHaveBeenCalled();
    s.dispatch('paste',s.select('b',0,7),{'text/plain':'https://example.com/image.png'});
    expect(begin).not.toHaveBeenCalled();expect(s.editor.clipboard.imagePrompt()).toBeUndefined();
  });
  it('explains paste with document whitespace focus without guessing a destination or touching field paste', () => {
    const s=setup();
    const container=s.host.querySelector<HTMLElement>('[data-block-type="document-block"]')!;
    container.focus();document.getSelection()!.removeAllRanges();s.editor.selections.clearExcept();
    const commit=vi.spyOn(s.editor.repository,'commit');
    const {event}=s.dispatch('paste',container,{'text/plain':'not inserted'});
    expect(event.defaultPrevented).toBe(true);
    expect(s.editor.clipboard.message()).toContain('place the caret');
    expect(commit).not.toHaveBeenCalled();
    s.editor.clipboard.dismiss();
    const input=container.appendChild(document.createElement('input'));input.focus();
    expect(s.dispatch('paste',input,{'text/plain':'field'}).event.defaultPrevented).toBe(false);
    expect(s.editor.clipboard.message()).toBe('');
    expect(commit).not.toHaveBeenCalled();
  });
  it.each([true,false])('pastes beside an inert image-only paragraph and preserves its descriptor and Undo (direct=%s)', async direct => {
    const s=setup(true,true,direct,true,true);
    s.editor.commands.replaceInlineRange(s.node('b').key,0,6,'');
    s.editor.commands.insertInlineImage(s.node('b').key,0,{assetId:'original',src:'',alt:'',status:'failed'});
    const before=nativeEnvelope(captureNative(s.editor.repository.readState(),'doc'));
    const commit=vi.spyOn(s.editor.repository,'commit');
    s.dispatch('paste',s.select('b',1),{'text/html':'<img src="https://example.com/new.png">'});
    await vi.waitFor(()=>expect(s.editor.clipboard.imagePrompt()).toBeDefined());
    s.editor.clipboard.chooseImages([]);
    await vi.waitFor(()=>expect(s.host.querySelectorAll('.reactive-inline-image')).toHaveLength(2));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(s.host.querySelectorAll('[data-image-placeholder]')).toHaveLength(2);
    s.editor.repository.undo();expect(nativeEnvelope(captureNative(s.editor.repository.readState(),'doc'))).toEqual(before);
    s.editor.repository.redo();expect(s.host.querySelectorAll('.reactive-inline-image')).toHaveLength(2);
  });
  it.each(['keyboard', 'paste'])('establishes an empty focused paragraph caret for image %s without a prior browser selection', async route => {
    const s=setup(true,true,true,true,true);
    s.editor.commands.replaceInlineRange(s.node('b').key,0,6,'');
    const target=s.select('b',0), mount=s.editor.mounts.get(s.node('b').key)!;
    document.getSelection()!.removeAllRanges();s.editor.selections.clearExcept();
    const commit=vi.spyOn(s.editor.repository,'commit');
    if(route==='keyboard') {
      target.dispatchEvent(new KeyboardEvent('keydown',{key:'v',metaKey:true,bubbles:true,cancelable:true}));
      expect(mount.captureInlineSelection!()).toEqual({anchor:0,head:0});expect(commit).not.toHaveBeenCalled();
    }
    s.dispatch('paste',target,{'text/html':'<img src="https://example.com/map.png">'});
    await vi.waitFor(()=>expect(s.editor.clipboard.imagePrompt()?.urls).toEqual(['https://example.com/map.png']));
    const keep=[...document.querySelectorAll<HTMLButtonElement>('[data-mutable-image-consent] button')].find(b=>b.textContent==='Keep placeholders')!;
    keep.focus();keep.click();
    await vi.waitFor(()=>expect(s.host.querySelector('.reactive-inline-image')).not.toBeNull());
    expect(commit).toHaveBeenCalledTimes(1);s.editor.repository.undo();expect(s.texts()).toEqual(['Rome abc','']);
    s.editor.repository.redo();expect(s.host.querySelector('.reactive-inline-image')).not.toBeNull();
  });
  it('does not invent a caret in populated or composing blocks or replace another block selection', () => {
    const s=setup(),target=s.select('b',0),mount=s.editor.mounts.get(s.node('b').key)!;
    const pasteKey=()=>target.dispatchEvent(new KeyboardEvent('keydown',{key:'v',metaKey:true,bubbles:true,cancelable:true}));
    document.getSelection()!.removeAllRanges();s.editor.selections.clearExcept();pasteKey();
    expect(mount.captureInlineSelection!()).toBeUndefined();
    s.editor.commands.replaceInlineRange(s.node('b').key,0,6,'');mount.composing=true;pasteKey();
    expect(mount.captureInlineSelection!()).toBeUndefined();mount.composing=false;
    mount.focus();s.editor.mounts.get(s.node('a').key)!.restoreInlineSelection!({anchor:0,head:4});
    expect(document.getSelection()!.isCollapsed).toBe(false);pasteKey();
    expect(document.getSelection()!.toString()).toBe('Rome');expect(mount.captureInlineSelection!()).toBeUndefined();
  });
  it('admits carrier-only managed images through the same verified import path', async () => {
    const s = setup(true, true, true, true, true);
    const ref = {kind:'managed',cavernId:'cavern',assetId:'sha256:'+'a'.repeat(64)};
    const fragment = plainFragment('');
    fragment.embeds.push({localId:'image',type:'image-cell',data:{asset:ref,alt:'original'}});
    fragment.blocks[0].inline!.atoms.push({kind:'embed',embed:'image'});
    const verify = vi.spyOn(s.editor.clipboard.assets,'verify').mockResolvedValue({...ref,kind:'managed',mediaType:'image/png',byteLength:10,width:3,height:2});
    vi.spyOn(s.editor.clipboard.assets,'bind').mockImplementation(()=>()=>{});
    const carrier = exportClipboard(fragment);
    s.dispatch('paste',s.select('b',0,6),{'text/html':carrier['text/html'],'text/plain':carrier['text/plain']});
    await vi.waitFor(()=>expect(Object.values(s.editor.repository.readState().contents).find(c=>c.viewType==='image-cell')?.payload.asset).toEqual(ref));
    expect(verify).toHaveBeenCalledTimes(1);
    s.editor.repository.undo();expect(s.texts()[1]).toBe('target');
  });
  it.each(['success','failure','stale'])('handles consented remote acquisition and %s completion', async outcome => {
    const s = setup(true,true,true,true,true), assets=s.editor.clipboard.assets;
    const lease={id:'op',token:'token',cavernId:'cavern'};
    const manifest={kind:'managed' as const,cavernId:'cavern',assetId:'sha256:'+'b'.repeat(64),mediaType:'image/png',byteLength:10,width:3,height:2};
    vi.spyOn(assets,'begin').mockResolvedValue(lease);
    vi.spyOn(assets,'bind').mockImplementation(()=>()=>{});
    const action=vi.spyOn(assets,'action').mockResolvedValue({});
    const remote=vi.spyOn(assets,'remote').mockImplementation(async()=>{
      if(outcome==='failure')throw Error('Download rejected');
      if(outcome==='stale')s.editor.commands.replaceInlineRange(s.node('b').key,0,0,'!');
      return manifest;
    });
    s.dispatch('paste',s.select('b',0,6),{'text/html':'<IMG src="https://example.com/image.png">'});
    await vi.waitFor(()=>expect(s.editor.clipboard.imagePrompt()).toBeDefined());
    expect(remote).not.toHaveBeenCalled();
    const checkbox=document.querySelector<HTMLInputElement>('[data-mutable-image-consent] input')!;
    checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));
    const download=[...document.querySelectorAll<HTMLButtonElement>('[data-mutable-image-consent] button')].find(b=>b.textContent==='Download selected images')!;
    download.focus();download.click();
    if(outcome==='failure'){
      await vi.waitFor(()=>expect(s.editor.clipboard.imagePrompt()?.error).toContain('Download rejected'));
      s.editor.clipboard.chooseImages([]);
    }
    await vi.waitFor(()=>expect(s.editor.clipboard.message()).not.toBe('Preparing paste…'));
    await vi.waitFor(()=>expect(action).toHaveBeenCalledWith(lease,outcome==='success'?'finish':'abort'));
    const image=Object.values(s.editor.repository.readState().contents).find(c=>c.viewType==='image-cell');
    if(outcome==='success')expect(image?.payload.asset).toMatchObject({assetId:manifest.assetId});
    if(outcome==='failure')expect(image?.payload.status).toBe('failed');
    if(outcome==='stale'){expect(image).toBeUndefined();expect(s.texts()[1]).toBe('!target');}
  });
  it('copies and pastes native annotations, with exactly one new handler and one undo entry', () => {
    const s = setup(), copy = s.dispatch('copy', s.select('a', 0, 4));
    expect(copy.values[NATIVE_MIME]).toBeTruthy(); expect(copy.values['application/json']).toBeUndefined();
    const commits = vi.spyOn(s.editor.repository, 'commit'); s.dispatch('paste', s.select('b', 1, 3), copy.values);
    expect(s.texts()).toEqual(['Rome abc', 'tRomeget']); expect(commits).toHaveBeenCalledTimes(1);
    const props = s.node('b').payload.standoffProperties as any[]; expect(props).toMatchObject([{ type: 'codex/entity-reference', value: 'rome', start: 1, end: 4 }]); expect(props[0].id).not.toBe('p');
    s.editor.repository.undo(); expect(s.texts()).toEqual(['Rome abc', 'target']);
  });
  it('restores the legacy route coherently when disabled', () => {
    const s = setup(false), copy = s.dispatch('copy', s.select('a', 0, 4));
    expect(copy.values[NATIVE_MIME]).toBeUndefined(); expect(copy.values['application/json']).toContain('standoff-inline-v1'); expect(document.querySelector('[data-mutable-clipboard-status]')).toBeNull();
  });
  it('replicates one inline slice at multiple carets with fresh properties and restored selections', () => {
    const s = setup(), copy = s.dispatch('copy', s.select('a', 0, 4)).values;
    const target = s.select('b', 1), n = s.node('b'); s.editor.selections.addCaret(n.key, n.contentKey, n.viewId, 4);
    s.dispatch('paste', target, copy); expect(s.texts()[1]).toBe('tRomeargRomeet');
    const properties = s.node('b').payload.standoffProperties as any[];
    expect(new Set(properties.map(p => p.id)).size).toBe(2);
    expect(s.editor.selections.sets[n.key].items.map(i => i.head.boundary.index)).toEqual([5, 12]);
    s.editor.repository.undo(); expect(s.texts()[1]).toBe('target');
  });
  it('does not delete on failed event write and retains an explicit recovery copy on successful cut', () => {
    const s = setup(); s.dispatch('cut', s.select('a', 0, 4), {}, true);
    expect(s.texts()[0]).toBe('Rome abc'); expect(s.editor.clipboard.recovery()).toBeUndefined();
    const copy = s.dispatch('cut', s.select('a', 0, 4));
    expect(copy.values[NATIVE_MIME]).toBeTruthy(); expect(s.texts()[0]).toBe(' abc'); expect(s.editor.clipboard.recovery()).toBeDefined();
    s.editor.repository.undo(); expect(s.texts()[0]).toBe('Rome abc');
  });
  it('rejects identity-bearing roots at multiple carets without partial edits', () => {
    const s = setup(), f = plainFragment('ref');
    f.blocks[0].inline!.properties.push({ localId: 'self', type: 'codex/block-reference', startIndex: 0, endIndex: 3, isZeroWidth: false, attributes: {}, target: { kind: 'local', object: 'block', id: f.blocks[0].localId } });
    const target = s.select('b', 1), n = s.node('b'); s.editor.selections.addCaret(n.key, n.contentKey, n.viewId, 4);
    s.dispatch('paste', target, exportClipboard(f));
    expect(s.texts()).toEqual(['Rome abc', 'target']); expect(s.editor.repository.canUndo()).toBe(false);
    expect(s.editor.clipboard.message()).toContain('single text selection');
  });
  it('preserves the selected text for empty, unsupported and invalid clipboard payloads', () => {
    const s = setup(); const before = s.texts(); const target = s.select('a', 0, 4);
    for (const data of [{ 'text/plain': '' }, { 'image/png': 'blob' }, { [NATIVE_MIME]: '{bad' }] as Record<string, string>[]) s.dispatch('paste', target, data);
    expect(s.texts()).toEqual(before); expect(s.editor.repository.canUndo()).toBe(false);
  });
  it('uses Shift-V as one-use Markdown intent without suppressing the paste event', async () => {
    const s = setup(), data = s.dispatch('copy', s.select('a', 0, 4)).values, target = s.select('b', 0);
    const key = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }); target.dispatchEvent(key); expect(key.defaultPrevented).toBe(false);
    s.dispatch('paste', target, data); await vi.waitFor(()=>expect(s.texts()[1]).toBe('Rometarget')); expect(s.node('b').payload.standoffProperties).toEqual([]);
  });
  it('uses system-event Blocks and fresh IDs even after cut; true move behavior is untouched', async () => {
    const s = setup(); s.editor.blockSelection.replaceKeys([s.node('a').key]);
    const handle = s.host.querySelector('[data-block-id="a"] [data-block-selection-handle]')!;
    const cut = s.dispatch('cut', handle); expect(s.texts()).toEqual(['target']);
    s.editor.blockSelection.replaceKeys([s.node('b').key]);
    const target = s.host.querySelector('[data-block-id="b"] [data-block-selection-handle]')!;
    s.dispatch('paste', target, cut.values); expect(s.texts()).toEqual(['target', 'Rome abc']);
    const pasted = s.editor.encodeDocument().children![1]; expect(pasted.id).not.toBe('a');
    s.editor.repository.undo(); s.editor.repository.undo(); expect(s.texts()).toEqual(['Rome abc', 'target']); await tick();
  });
  it('waits for acknowledged async cut and never deletes on rejected or stale writes', async () => {
    let resolve!: () => void, reject!: (error: Error) => void;
    const write = vi.fn(() => new Promise<void>((yes, no) => { resolve = yes; reject = no; }));
    vi.stubGlobal('ClipboardItem', class { static supports() { return false; } constructor(public items: unknown) {} });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write } }); cleanup.push(() => { delete (navigator as any).clipboard; });
    const s = setup(); s.dispatch('cut', s.select('a', 0, 4)); s.editor.repository.undo();
    s.editor.blockSelection.replaceKeys([s.node('a').key]);
    s.editor.blockClipboard.run('selection.cut'); expect(write).toHaveBeenCalledTimes(1); expect(s.texts()).toHaveLength(2);
    s.editor.clipboard.recoverCopy(); expect(write).toHaveBeenCalledTimes(1); // Recovery cannot race a pending operation.
    reject(Error('Denied')); await tick(); expect(s.texts()).toHaveLength(2); expect(s.editor.repository.canUndo()).toBe(false);
    s.editor.blockClipboard.run('selection.cut'); s.editor.commands.replaceInlineRange(s.node('b').key, 0, 0, '!'); resolve(); await tick();
    expect(s.texts()).toEqual(['Rome abc', '!target']); expect(s.editor.clipboard.message()).toContain('source changed');
    s.editor.blockSelection.replaceKeys([s.node('a').key]); s.editor.blockClipboard.run('selection.cut'); resolve(); await tick(); expect(s.texts()).toEqual(['!target']);
  });
  it('disposes pending operations without deleting data or displaying a stale result', async () => {
    let resolve!: () => void;
    vi.stubGlobal('ClipboardItem', class { static supports() { return false; } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: () => new Promise<void>(r => { resolve = r; }) } }); cleanup.push(() => { delete (navigator as any).clipboard; });
    const s = setup(); s.editor.blockSelection.replaceKeys([s.node('a').key]); s.editor.blockClipboard.run('selection.cut');
    const commit = vi.spyOn(s.editor.repository, 'commit'); s.editor.clipboard.dispose(); resolve(); await tick(); expect(commit).not.toHaveBeenCalled();
  });
  it('retains unknown type data through native persistence and recopy without activation', () => {
    const s = setup(), f = plainFragment('unknown'); f.blocks[0].inline!.properties.push({ localId: 'future', type: 'future/animation', startIndex: 0, endIndex: 7, isZeroWidth: false, attributes: { authored: { nested: 'kept' } } });
    s.dispatch('paste', s.select('b', 0), exportClipboard(f));
    const p = (s.node('b').payload.standoffProperties as any[])[0]; expect(p.original.type).toBe('future/animation');
    const resource = captureNative(s.editor.repository.readState(), 'doc'); const reopened = decodeNative(new TextEncoder().encode(JSON.stringify(nativeEnvelope(resource))));
    expect(JSON.stringify(reopened)).toContain('future/animation');
    const recopy = s.dispatch('copy', s.select('b', 0, 7)); s.dispatch('paste', s.select('a', 8), recopy.values);
    const again = (s.node('a').payload.standoffProperties as any[]).at(-1); expect(again.type).toBe('mutable/opaque-property'); expect(again.original).toEqual(p.original);
  });
  it('ordinary typing does no clipboard serialization, repository snapshot or layout measurement', () => {
    const s = setup(); const target = s.select('b', 2);
    const snapshots = vi.spyOn(s.editor.repository, 'snapshot'), layout = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    target.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'X', bubbles: true, cancelable: true }));
    expect(snapshots).not.toHaveBeenCalled(); expect(layout).not.toHaveBeenCalled(); expect(s.editor.clipboard.message()).toBe(''); expect(s.texts()[1]).toBe('taXrget');
  });
  it('pastes external semantic HTML through the shared gateway, with a separate rich-off preference', () => {
    const data = { 'text/html': '<b>rich😀</b>', 'text/plain': 'plain' };
    const on = setup(); on.dispatch('paste', on.select('b', 0, 6), data);
    expect(on.texts()[1]).toBe('rich😀'); expect(on.node('b').payload.standoffProperties).toMatchObject([{ type: 'style/bold', start: 0, end: 4 }]);
    on.editor.repository.undo(); expect(on.texts()[1]).toBe('target');
    const off = setup(true, false); off.dispatch('paste', off.select('b', 0, 6), data);
    expect(off.texts()[1]).toBe('plain'); expect(off.node('b').payload.standoffProperties).toEqual([]);
    expect(off.dispatch('copy', off.select('a', 0, 4)).values[NATIVE_MIME]).toBeTruthy();
  });
  it('renders native list markers and table headers, restores an editable caret, and undoes the whole import', async () => {
    const s = setup(), commits = vi.spyOn(s.editor.repository, 'commit');
    s.dispatch('paste', s.select('b', 0, 6), { 'text/html': '<ol start="3"><li>three</li><li value="7">seven<ul><li>nested</li></ul></li></ol><table><tr><th>Header</th><td>Cell</td></tr></table>' });
    await tick();
    expect(commits).toHaveBeenCalledTimes(1);
    expect([...s.host.querySelectorAll('.reactive-imported-list-marker')].map(n => n.textContent)).toEqual(['3.', '7.', '•']);
    expect(s.host.querySelector('[role="columnheader"]')?.textContent).toContain('Header');
    const active = document.activeElement!;
    active.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'after', bubbles: true, cancelable: true }));
    expect(s.editor.encodeDocument().children!.at(-1)!.text).toBe('after');
    s.editor.repository.undo(); s.editor.repository.undo(); expect(s.texts()).toEqual(['Rome abc', 'target']);
  });
  it('does not rebuild list markers or capture repository snapshots while typing inside an imported item', async () => {
    const s = setup(); s.dispatch('paste', s.select('b', 0, 6), { 'text/html': '<ul><li>first</li><li>second</li></ul>' }); await tick();
    const markers = [...s.host.querySelectorAll('.reactive-imported-list-marker')];
    const list = s.editor.encodeDocument().children![1], itemText = list.children![0].children![0];
    const target = s.select(itemText.id!, 1), snapshots = vi.spyOn(s.editor.repository, 'snapshot');
    const mutations: MutationRecord[] = [], observer = new MutationObserver(records => mutations.push(...records));
    markers.forEach(marker => observer.observe(marker, { childList: true, subtree: true, characterData: true }));
    target.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'X', bubbles: true, cancelable: true })); await tick(); observer.disconnect();
    expect([...s.host.querySelectorAll('.reactive-imported-list-marker')]).toEqual(markers); expect(mutations).toEqual([]); expect(snapshots).not.toHaveBeenCalled();
  });
  it.each([true, false])('keeps inert images out of network and history in the direct renderer=%s', async direct => {
    const s = setup(true, true, direct), commits = vi.spyOn(s.editor.repository, 'commit');
    s.dispatch('paste', s.select('b', 0, 6), { 'text/html': '<p>A<img src="https://clipboard-probe.invalid/map.png" alt="map">B</p>' }); await tick();
    const image = s.host.querySelector('.reactive-inline-image img')!;
    expect(image.hasAttribute('src')).toBe(false);
    image.dispatchEvent(new Event('error')); image.dispatchEvent(new Event('load')); await tick();
    expect(commits).toHaveBeenCalledTimes(1);
    s.editor.repository.undo(); expect(s.texts()).toEqual(['Rome abc', 'target']);
  });
});


describe('Academic citation paste',()=>{
 const citation=()=>({version:1,entityId:crypto.randomUUID(),resourceId:crypto.randomUUID(),snapshotId:crypto.randomUUID(),provider:'crossref',retrievedAt:'2026-10-18T00:00:00Z',endpoint:'https://api.crossref.org/works/10.1234%2Fabc',asset:{kind:'managed',cavernId:'cavern',assetId:'sha256:'+'a'.repeat(64)},metadata:normalizeScholarly('crossref','10.1234/abc',new TextEncoder().encode(JSON.stringify({message:{DOI:'10.1234/abc',title:['A retained work'],type:'dataset'}})))});
 it.each(['metaKey','ctrlKey'])('inserts once with %s and restores Undo/Redo without requests',async modifier=>{
  const c=citation(),request=vi.fn(async()=>new Response(JSON.stringify({Success:true,Data:{citation:c,jobId:crypto.randomUUID()}}),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',request);
  const s=setup(),target=s.select('b',3),before=nativeEnvelope(captureNative(s.editor.repository.readState(),'doc'));
  s.resource('https://doi.org/10.1234/ABC?utm=x');
  await vi.waitFor(()=>expect(s.host.querySelector('.mutable-citation-block')).not.toBeNull());
  expect(request).toHaveBeenCalledTimes(1);const block=Object.values(s.editor.repository.readState().contents).find(b=>b.viewType==='mutable/citation-block')!.payload;
  expect(block.sourceUrl).toBe('https://doi.org/10.1234/ABC?utm=x');expect((block.blockProperties as any[])[0].value).toBe(c.entityId);
  const api=annotationCapabilities(s.editor,{owner:'academic-test',active:()=>true,own:(fn:any)=>fn} as any);
  expect(collectDocumentEntities(api,s.node('b').key).rows.find(r=>r.id===c.entityId)).toMatchObject({documentMentions:1,ranges:[]});
  expect(JSON.stringify(decodeNative(new TextEncoder().encode(JSON.stringify(nativeEnvelope(captureNative(s.editor.repository.readState(),'doc'))))))).toContain(c.snapshotId);
  s.editor.repository.undo();expect(nativeEnvelope(captureNative(s.editor.repository.readState(),'doc'))).toEqual(before);s.editor.repository.redo();expect(s.host.textContent).toContain('A retained work');expect(request).toHaveBeenCalledTimes(1);
 });
 it('leaves plain paste and disabled academic paste network-free',()=>{
  const request=vi.fn();vi.stubGlobal('fetch',request);
  for(const enabled of [true,false]){const s=setup(true,true,true,true,false,false,true,enabled),target=s.select('b',0);s.dispatch('paste',target,{'text/plain':'10.1234/abc'});expect(s.host.querySelector('.mutable-citation-block')).toBeNull();}expect(request).not.toHaveBeenCalled();
 });
 it.each(['stale','cancel','typing'])('does not insert after %s while acquisition is pending',async action=>{
  let complete!:(value:Response)=>void;const request=vi.fn(()=>new Promise<Response>(resolve=>complete=resolve));vi.stubGlobal('fetch',request);const s=setup(),target=s.select('b',3);
  s.resource('10.1234/abc');
  await vi.waitFor(()=>expect(request).toHaveBeenCalledTimes(1));if(action==='cancel')s.editor.clipboard.cancel();else if(action==='typing')s.editor.commands.replaceInlineRange(s.node('b').key,3,3,'!');else s.select('a',0);
  complete(new Response(JSON.stringify({Success:true,Data:{citation:citation(),jobId:crypto.randomUUID()}}),{headers:{'Content-Type':'application/json'}}));
  await vi.waitFor(()=>expect(s.editor.clipboard.message()).not.toBe('Resolving DOI…'));expect(s.host.querySelector('.mutable-citation-block')).toBeNull();
 });
});

describe('Wikipedia resource paste',()=>{
 const capture=()=>({snapshot:{version:1,kind:'article',entityId:crypto.randomUUID(),subjectId:crypto.randomUUID(),snapshotId:crypto.randomUUID(),resourceId:crypto.randomUUID(),identityId:crypto.randomUUID(),revision:123,site:'en.wikipedia.org',title:'Captured article',qid:'Q42',assets:[{kind:'managed',cavernId:'cavern',assetId:'sha256:'+'a'.repeat(64)}]},projection:{title:'Captured article',html:'<p>Readable text.</p>',links:[],diagnostics:[],permalink:'https://en.wikipedia.org/w/index.php?oldid=123'}});
 it('inserts one independent native article with provenance and exact Undo/Redo',async()=>{
  const value=capture(),request=vi.fn(async()=>new Response(JSON.stringify({Success:true,Data:value}),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',request);const s=setup(),target=s.select('b',3),before=s.editor.encodeDocument();s.resource('https://en.wikipedia.org/wiki/A?history=1');await vi.waitFor(()=>expect(s.host.querySelector('.mutable-web-article')).toBeTruthy());const b=Object.values(s.editor.repository.readState().contents).find(b=>b.viewType==='mutable/web-article-block')!.payload;expect(b.sourceUrl).toBe('https://en.wikipedia.org/wiki/A?history=1');expect(b.blockProperties).toHaveLength(2);s.editor.repository.undo();expect(s.editor.encodeDocument()).toEqual(before);s.editor.repository.redo();expect(request).toHaveBeenCalledTimes(1);
 });
 it.each(['cancel','typing'])('prevents late article insertion after %s',async action=>{
  let resolve!:(r:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise(r=>resolve=r)));const s=setup(),target=s.select('b',0);s.resource('https://en.wikipedia.org/wiki/A');await tick();if(action==='cancel')s.editor.clipboard.cancel();else s.editor.commands.replaceInlineRange(s.node('b').key,0,0,'!');resolve(new Response(JSON.stringify({Success:true,Data:capture()}),{headers:{'Content-Type':'application/json'}}));await vi.waitFor(()=>expect(s.editor.clipboard.message()).not.toBe('Capturing Wikipedia revision…'));expect(s.host.querySelector('.mutable-web-article')).toBeNull();
 });
 it('keeps plain Wikipedia URL paste network-free',()=>{const request=vi.fn();vi.stubGlobal('fetch',request);const s=setup();s.dispatch('paste',s.select('b',0),{'text/plain':'https://en.wikipedia.org/wiki/A'});expect(request).not.toHaveBeenCalled();expect(s.host.querySelector('.mutable-web-article')).toBeNull();});
});
