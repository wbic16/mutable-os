import { revealMatch } from '../runtime/reveal-match';
import { TextSearch, resolveSearchScope } from '../runtime/text-search';
import { captureNative, nativeBytes, decodeNative, admitNative } from '../persistence/native-resource';
import { ReactiveEditor } from '../reactive-editor/editor';
import { virtualTextFlowDiagnostics } from './virtual-text-flow';
import { render } from 'solid-js/web';
import { createComponent } from 'solid-js';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';

const check = (value: unknown, message: string) => { if (!value) throw Error(message); };
const frames = async (count = 3) => { for (let i = 0; i < count; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); };

/** Called only by the disposable real-Chrome benchmark; never touches user files. */
export async function qualifyTextFlow(bench: { editor: ReactiveEditor; host: HTMLElement; flow: HTMLElement }) {
  const { editor, host } = bench;
  const source = editor.node(editor.mounts.resolveElement(bench.flow)!.nodeKey)!;
  const projection = editor.projections.get(source.viewId)!;
  const parent = projection.parentOf(source.key)!;
  const keys = [...parent.children], far = keys[Math.floor(keys.length * .8)], near = keys[2];
  check(keys.length >= 100, 'Qualification needs at least 100 text Blocks');
  const focus = async (key: string, index = 0) => {
    editor.focus.request(key, { caret: { start: index, end: index, direction: 'none' } });
    await frames();
    check(editor.mounts.get(key)?.captureInlineSelection?.()?.head === index, 'Offscreen caret was not restored: ' + JSON.stringify({ key, index, focused: editor.focus.state.focusedKey, connected: editor.mounts.get(key)?.root.isConnected, selection: editor.mounts.get(key)?.captureInlineSelection?.(), active: document.activeElement?.getAttribute('data-runtime-key') }));
  };
  await focus(far, 17);
  const flow = host.querySelector<HTMLElement>('[data-virtual-text-flow]');
  check(flow, 'Qualified virtual flow was not activated');
  const scroll = editor.documentSessions?.forNode(far)?.host.port?.scrollport ?? host;
  const mounted = () => host.querySelectorAll('.reactive-standoff-flow').length;
  check(mounted() < 80, 'Mounted window is not bounded');
  // Use the ordinary input gateway to cross the end of an occurrence near a
  // distant viewport, rather than asking the virtualiser for the next item.
  const previous = editor.adjacentEditable(far, -1)!;
  await focus(previous.key, previous.inlineContent.length);
  editor.mounts.get(previous.key)!.focusElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  await frames();
  check(editor.focus.state.focusedKey === far, 'Boundary navigation chose the wrong native occurrence');

  const heading = keys[3], following = keys[4];
  await focus(heading);
  const normalFont = parseFloat(getComputedStyle(editor.mounts.get(heading)!.focusElement).fontSize);
  editor.commands.setPayloadField(heading, 'blockProperties', [{ type: 'block/font/size', value: 'h2' }]);
  await frames(4);
  check(parseFloat(getComputedStyle(editor.mounts.get(heading)!.focusElement).fontSize) > normalFont, 'Native heading size was not rendered');
  check(editor.mounts.get(following)!.root.getBoundingClientRect().top >= editor.mounts.get(heading)!.root.getBoundingClientRect().bottom - 1, 'Dynamic heading measurement overlapped the next Block');
  editor.repository.undo(); await frames();

  editor.crossText.enable(true);
  const anchor = keys[10], head = keys[keys.length - 10];
  editor.crossText.set(editor.crossText.position(anchor, 2), editor.crossText.position(head, 3));
  const selected = editor.crossText.selectedText();
  check(selected.split('\n').length === keys.length - 19, 'Offscreen selection omitted text');
  await editor.focus.ensureRendered(head); await frames();
  const data = new DataTransfer();
  editor.mounts.get(head)!.focusElement.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: data }));
  check(data.getData('text/plain') === selected, 'Clipboard omitted offscreen selected content');

  const counters = { commits: 0, snapshots: 0, changes: 0, selectionValidation: 0, requests: 0 };
  const diagnostics = virtualTextFlowDiagnostics.get(flow!), initialDiagnostics = { ...diagnostics };
  let libraryWork = { itemKeys: 0, measurements: 0 };
  const requestPaths: string[] = [];
  const commit = editor.repository.commit, snapshot = editor.repository.snapshot, validate = editor.crossText.validate, fetch = window.fetch;
  const revision = editor.repository.state.revision, saved = editor.persistence.state.lastSavedRevision;
  const unsubscribe = editor.repository.subscribeChanges(() => counters.changes++);
  editor.repository.commit = function (...args: Parameters<typeof commit>) { counters.commits++; return commit.apply(this, args); };
  editor.repository.snapshot = function () { counters.snapshots++; return snapshot.call(this); };
  editor.crossText.validate = function () { counters.selectionValidation++; return validate.call(this); };
  window.fetch = (...args) => { if (String(args[0]).includes('/api/')) { counters.requests++; requestPaths.push(new URL(String(args[0]), location.href).pathname); } return fetch(...args); };
  const times: number[] = [];
  let maximumMounted = 0;
  try {
    for (const fraction of [.1, .7, .3, .9, 0]) {
      const start = performance.now(); scroll.scrollTop = scroll.scrollHeight * fraction;
      await frames(2); times.push(performance.now() - start); maximumMounted = Math.max(maximumMounted, mounted());
    }
    check(editor.crossText.selectedText() === selected, 'Eviction invalidated canonical selection');
    check(editor.repository.state.revision === revision && editor.persistence.state.lastSavedRevision === saved, 'Scrolling changed document/save state');
    check(Object.values(counters).every(value => value === 0), 'Scrolling triggered unrelated work: ' + JSON.stringify({ ...counters, requestPaths }));
    check(maximumMounted < 80, 'Scrolling retained too many text views');
    libraryWork = { itemKeys: (diagnostics?.itemKeys ?? 0) - (initialDiagnostics.itemKeys ?? 0), measurements: (diagnostics?.measurements ?? 0) - (initialDiagnostics.measurements ?? 0) };
  } finally {
    editor.repository.commit = commit; editor.repository.snapshot = snapshot; editor.crossText.validate = validate; window.fetch = fetch; unsubscribe();
    editor.crossText.clear();
  }

  // Wrapped vertical movement keeps the existing preferred horizontal position.
  const left = keys[5], right = keys[6], text = 'A wrapped line with several words. '.repeat(18);
  editor.commands.replaceInlineRange(left, 0, editor.node(left)!.inlineContent.length, text);
  editor.commands.replaceInlineRange(right, 0, editor.node(right)!.inlineContent.length, text);
  await focus(left, text.length - 9);
  const start = editor.mounts.get(left)!.inlineBoundary!(text.length - 9);
  const range = document.createRange(); range.setStart(start.node, start.offset); range.collapse(true);
  const preferredX = range.getBoundingClientRect().left;
  editor.mounts.get(left)!.focusElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true }));
  await frames();
  const vertical = editor.crossText.range();
  check(vertical?.head.occurrenceKey === right, 'Vertical selection did not enter adjacent wrapped Block');
  const boundary = editor.mounts.get(right)!.inlineBoundary!(vertical!.head.boundary.index);
  range.setStart(boundary.node, boundary.offset); range.collapse(true);
  const horizontalError = Math.abs(range.getBoundingClientRect().left - preferredX);
  check(horizontalError < 20, 'Preferred X was lost during vertical navigation: ' + horizontalError);
  editor.crossText.clear(); editor.repository.undo(); editor.repository.undo();

  // Search canonical text, then reveal an occurrence that was not mounted.
  const needle = keys[Math.floor(keys.length * .55)];
  editor.commands.replaceInlineRange(needle, 0, 0, 'virtualisation-needle ');
  await focus(near); await frames();
  check(!editor.mounts.get(needle), 'Search fixture unexpectedly mounted target');
  const search = new TextSearch(editor);
  try {
    const found = await search.searchText({ query: 'virtualisation-needle', scope: resolveSearchScope(editor, near, 'document') });
    check(found.matches.length === 1, 'Canonical search did not find unique offscreen text');
    check(await revealMatch(editor, found.matches[0]), 'Offscreen search reveal failed');
    check(editor.mounts.get(needle)?.root.isConnected, 'Search reveal did not mount its native occurrence');
  } finally { search.dispose(); }
  editor.repository.undo();
  // Existing SVG decorations remain occurrence-local and survive view eviction.
  const decorated = keys[Math.floor(keys.length * .4)];
  editor.decorations.attachRanges('virtual-qualification', [editor.textRanges.snapshot(decorated, 4, 16)]);
  try {
    await focus(decorated); await frames();
    const shape = () => editor.mounts.get(decorated)?.root.querySelector('svg [data-property-type="editor/range-preview"]');
    check(shape(), 'Native SVG preview was not drawn');
    await focus(near); await frames();
    check(!editor.mounts.get(decorated) && editor.decorations.nodes[decorated]?.length === 1, 'Eviction removed the semantic decoration');
    await focus(decorated); await frames();
    check(shape(), 'Native SVG preview was not restored after remount');
  } finally { editor.decorations.disposeSession('virtual-qualification'); }
  // Capture/decode the actual native format, including all unmounted contents.
  let rootDocument = parent;
  while (rootDocument.viewType !== 'document-block') rootDocument = projection.parentOf(rootDocument.key)!;
  const id = String((rootDocument.payload.metadata as any)?.documentId ?? rootDocument.payload.id);
  const savedNative = captureNative(editor.repository.readState(), id), decoded = decodeNative(nativeBytes(savedNative));
  check(Object.keys(decoded.contents).length === Object.keys(savedNative.contents).length, 'Native persistence lost offscreen records');
  const loaded = new ReactiveEditor({ type: 'workspace-object-bank-block', children: [] }, { features: { nativeKnowledge: false, sqliteKnowledge: false } });
  try {
    const state = loaded.repository.readState();
    admitNative(loaded.repository, nativeBytes(savedNative), state.placements[state.rootPlacementKey].contentKey);
    const recaptured = captureNative(loaded.repository.readState(), id);
    check(Object.keys(recaptured.contents).length === Object.keys(savedNative.contents).length, 'Native reload lost offscreen records');
    const text = (snapshot: typeof savedNative) => Object.values(snapshot.contents).filter(c => c.viewType === 'text-cell').map(c => c.payload.text).join('');
    check(text(recaptured) === text(savedNative), 'Native reload changed text');
  } finally { loaded.dispose(); }
  await focus(far, 17);
  let hostTransfer = false;
  const session = editor.documentSessions?.forNode(far);
  if (session) {
    const presentations = editor.documentSessions!.presentations, oldPort = session.host.port;
    const occurrence = editor.mounts.get(far)!.focusElement, revision = editor.repository.state.revision, views = editor.projections.size;
    const destination = window.document.body.appendChild(window.document.createElement('div'));
    destination.style.cssText = 'position:fixed;inset:30px;width:700px;height:600px;overflow:auto;background:white;z-index:100001';
    presentations.remember(session);
    const restore = presentations.present(session, { container: destination, scrollport: destination, activity: () => ({ mounted: true, visible: true, active: true }) });
    try {
      await frames(4); presentations.restorePosition(session, true); await frames(3);
      check(editor.mounts.get(far)?.focusElement === occurrence, 'Host transfer recreated the active editor');
      check(editor.mounts.get(far)?.captureInlineSelection?.()?.head === 17, 'Host transfer lost the caret');
    } finally { restore(); await frames(3); destination.remove(); }
    check(session.host.port === oldPort && editor.projections.size === views && editor.repository.state.revision === revision, 'Host transfer changed projection or canonical state');
    hostTransfer = true;
    await focus(far, 17);
  }
  const mixedHost = window.document.body.appendChild(window.document.createElement('div'));
  mixedHost.style.cssText = 'height:200px;width:500px;overflow:auto';
  const mixed = new ReactiveEditor({ type: 'document-block', children: [
    ...Array.from({ length: 80 }, (_, i) => ({ type: 'standoff-editor-block', text: 'Fallback ' + i })),
    { type: 'iframe-block', metadata: { url: 'about:blank' } },
  ] }, { features: { virtualTextFlows: true, nativeKnowledge: false, sqliteKnowledge: false } });
  registerCoreViews(mixed);
  const stopMixed = render(() => createComponent(ReactiveTreeView, { editor: mixed, projection: mixed.createView('mixed') }), mixedHost);
  try {
    await frames();
    const iframe = mixedHost.querySelector('iframe'), context = iframe?.contentWindow;
    check(iframe && !mixedHost.querySelector('[data-virtual-text-flow]'), 'Mixed flow did not retain the native renderer');
    mixedHost.scrollTop = mixedHost.scrollHeight; await frames();
    check(iframe?.isConnected && iframe.contentWindow === context && mixedHost.querySelectorAll('.reactive-standoff-flow').length === 80, 'Mixed fallback destroyed native content');
  } finally { stopMixed(); mixed.dispose(); mixedHost.remove(); }
  const fallbackHost = window.document.body.appendChild(window.document.createElement('div'));
  fallbackHost.className = 'textual-workspace';
  fallbackHost.style.cssText = 'height:200px;width:500px;overflow:auto;display:flex;flex-direction:column;gap:12px';
  const fallback = new ReactiveEditor({ type: 'document-block', children: Array.from({ length: 80 }, (_, i) => ({ type: 'standoff-editor-block', text: 'Native ' + i })) }, { features: { virtualTextFlows: true, nativeKnowledge: false, sqliteKnowledge: false } });
  registerCoreViews(fallback);
  const stopFallback = render(() => createComponent(ReactiveTreeView, { editor: fallback, projection: fallback.createView('fallback') }), fallbackHost);
  try {
    await frames();
    const first = fallbackHost.querySelector<HTMLElement>('[data-block-type="standoff-editor-block"]')!;
    check(!fallbackHost.querySelector('[data-virtual-text-flow]') && fallbackHost.querySelectorAll('.reactive-standoff-flow').length === 80, 'Unqualified host did not retain native views');
    check(getComputedStyle(first.parentElement!).display === 'contents', 'Unqualified host wrapper changed native flow layout');
  } finally { stopFallback(); fallback.dispose(); fallbackHost.remove(); }
  return { maximumMounted, scrollTwoFrameMs: times, scrollWork: counters,
    libraryWork,
    horizontalError, nativeRecords: Object.keys(decoded.contents).length, hostTransfer, mixedFallback: true, unqualifiedHostFallback: true, svgRemount: true, imeKey: far };
}
