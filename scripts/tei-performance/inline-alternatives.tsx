import { nativeDocumentSession } from '../../src/persistence/native-session';
import { milestoneIndex, navigateAnnotation } from '../../src/features/tei-import/navigation';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../../src/reactive-editor/editor';
import { registerApplicationViews } from '../../src/application/features';
import { ReactiveTreeView } from '../../src/rendering/reactive-tree-view';
import { convertTei } from '../../src/interchange/tei/convert';
import { encodeTeiNative } from '../../src/interchange/tei/compact-native';
import { admitNative, captureNative, nativeText, nativeBytes, decodeNative } from '../../src/persistence/native-resource';
import { inlineText } from '../../src/block-tree/inline-sequence';
import { revealMatch } from '../../src/runtime/reveal-match';
const frame = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
const xml = `<TEI><text><body><p xml:id="host"><hi rend="bold">Before <choice><orig>first 😀é</orig><reg>longer <hi rend="italic">reading wraps around the available width with annotation</hi><pb n="7"/></reg></choice> middle <choice><abbr/><expan>expanded</expan></choice><app><lem>nested <choice><sic>bad</sic><corr>good</corr></choice></lem><rdg>other</rdg></app> after.</hi></p><p xml:id="unrelated">Unrelated paragraph.</p></body></text></TEI>`;
let cleanup = () => {};
(window as any).inlineAlternativesSetup = async (mode = 'combined') => {
 cleanup();
 const editor = new ReactiveEditor({ id: 'inline-workspace', type: 'workspace-block', children: [{ id: 'inline-bank', type: 'workspace-object-bank-block', children: [] }] });
 registerApplicationViews(editor); const bank = Object.values(editor.repository.readState().contents).find(c => c.viewType === 'workspace-object-bank-block')!;
 const heapBefore = (performance as any).memory?.usedJSHeapSize;
 const start = performance.now(), prepared = encodeTeiNative(convertTei(mode === 'single' ? '<TEI><text><p xml:id="host">Before <choice><orig>first</orig><reg>second longer reading</reg></choice> after.</p><p xml:id="unrelated">Unrelated paragraph.</p></text></TEI>' : mode === 'long' ? xml.replace('</body>', Array.from({length:200},(_,i)=>`<p>Ordinary paragraph ${i}. The correspondent wrote <choice><orig>first wording</orig><reg>another reading</reg></choice> and continued the letter with independently editable native prose.</p>`).join('') + '</body>') : xml).document), parsed = performance.now();
 const admitted = admitNative(editor.repository, prepared.bytes, bank.key), ready = performance.now();
 const native = nativeDocumentSession(editor)!; let saved = '', saves = 0;
 const docId = Object.values(editor.repository.readState().contents).find(c => c.viewType === 'document-block')!.payload.id as string;
 const binding = (native as any).bind(docId, { folder: 'qualification', filename: 'inline-alternatives.ink' }, { nativeHash: 'opened-baseline', markdownHash: null, generation: null }, Object.keys(captureNative(editor.repository.readState(), docId).contents));
 binding.pair.acknowledgeOpen(nativeText(captureNative(editor.repository.readState(), docId)));
 binding.pair.adapter.save = async (generation: any) => { saved = generation.native; saves++; if (generation.markdown !== undefined) throw Error('Unexpected Markdown sidecar'); return { phase: 'saved', generation: generation.generation }; };
 const manualSave = async () => { const start = performance.now(); await native.save(docId); const saveMs = performance.now() - start, reopenStart = performance.now(); const reopened = decodeNative(new TextEncoder().encode(saved), undefined, true); return { saveMs, reopenMs: performance.now() - reopenStart, equal: nativeText(reopened) === saved, dirty: native.isDirty(docId), saves, filename: binding.location.filename }; };
 const host = document.body.appendChild(document.createElement('div')); host.style.cssText = 'display:flex;gap:40px;margin:40px;align-items:start';
 const views = [0, 1].map(i => { const el = host.appendChild(document.createElement('div')); el.style.cssText = 'width:340px;border:1px solid #aaa'; el.dataset.testView = String(i); const projection = editor.createView('inline-view-' + i, admitted.placementKey); const stop = render(() => <ReactiveTreeView editor={editor} projection={projection}/>, el); return { el, projection, stop }; });
 editor.installGateway(document); await frame();
 const activationMs = performance.now() - ready;
 let commits = 0, snapshots = 0; const stop = editor.repository.subscribeChanges(() => commits++), snapshot = editor.repository.snapshot.bind(editor.repository); editor.repository.snapshot = () => { snapshots++; return snapshot(); };
 const save = () => nativeText(captureNative(editor.repository.readState(), convertId()));
 function convertId() { return Object.values(editor.repository.readState().contents).find(c => c.viewType === 'document-block')!.payload.id as string; }
 const hostNode = (view = 0) => Object.values(views[view].projection.state.nodes).find(n => (n.payload.metadata as any)?.sourceId === 'host')!;
 const selected = (view = 0, slot = 0) => { const h = hostNode(view), atom = editor.repository.readState().contents[h.contentKey].compactInline!.spans.filter(a => a.kind === 'alternative')[slot]; if (atom.kind !== 'alternative') throw Error('slot missing'); const key = editor.viewChildren[`${h.key}/inline-alternative/${atom.properties.id}`] ?? h.ownedRelations[atom.properties.readings[0]]; return editor.node(key)!; };
 const focus = (which: 'host' | 'reading' | 'empty' | 'nested', at: number, view = 0) => { const n = which === 'host' ? hostNode(view) : which === 'reading' ? selected(view) : which === 'empty' ? selected(view, 1) : selected(view, 2); const m = editor.mounts.get(n.key)!; m.focus(); m.restoreInlineSelection!({ anchor: at, head: at }); editor.selections.setPrimary(n.key, n.contentKey, n.viewId, at, at); return n.key; };
 const switchWork: Array<{syncMs:number;displayMs:number}> = [];
 const switchReading = async (slot: number, index: number, view = 0) => { const selects = views[view].el.querySelectorAll<HTMLSelectElement>('.reactive-standoff-flow > .reactive-inline-alternative-cell > .native-inline-alternative > select'); const select = [...selects].filter(s => s.closest('[data-node-key]')?.getAttribute('data-node-key') === hostNode(view).key)[slot] ?? selects[slot]; select.value = select.options[index].value; const start = performance.now(); select.dispatchEvent(new Event('change', { bubbles: true })); const syncMs = performance.now() - start; await frame(); const displayMs = performance.now() - start; switchWork.push({syncMs,displayMs}); return displayMs; };
 const milestones = milestoneIndex(editor, views[0].projection, views[0].projection.state.rootKey);
 const state = () => ({ commits, snapshots, dirty: native.isDirty(docId), saves, hostText: inlineText(editor.repository.readState().contents[hostNode().contentKey].compactInline!.spans), readings: [0, 1].map(i => inlineText(editor.repository.readState().contents[selected(i).contentKey].compactInline!.spans)), active: editor.mounts.resolveElement(document.activeElement)?.nodeKey, selection: editor.mounts.resolveElement(document.activeElement)?.handle.captureInlineSelection?.(), domCells: host.querySelectorAll('[data-inline-key]').length, canonicalCells: Object.values(editor.repository.readState().contents).filter(c => ['text-cell', 'image-cell'].includes(c.viewType)).length });
 cleanup = () => { milestones.dispose(); stop(); views.forEach(v => v.stop()); editor.dispose(); host.remove(); };
 (window as any).inlineTest = { editor, views, hostNode, selected, focus, switchReading, switchWork, state, save, manualSave, frame, revealMatch, milestones, navigateAnnotation, captureNative, nativeBytes, decodeNative, cleanup };
 return { preparationMs: parsed - start, admissionMs: ready - parsed, activationMs, heapBefore, heapMounted: (performance as any).memory?.usedJSHeapSize, ...state() };
};

(window as any).inlineAlternativesProfile = async (mode = 'combined') => {
  const setup = await (window as any).inlineAlternativesSetup(mode), t = (window as any).inlineTest;
  const before = t.save();
  for (let i=0;i<10;i++) await t.switchReading(0,(i+1)%2);
  if (t.save() !== before || t.state().commits || t.state().dirty || t.state().snapshots) throw Error('Switching changed authored state');
  await t.switchReading(0,1);
  let unrelatedMutations=0; const unrelated = Object.values(t.views[0].projection.state.nodes).find((n:any)=>(n.payload.metadata as any)?.sourceId==='unrelated') as any;
  const observer=new MutationObserver(records=>unrelatedMutations+=records.length);observer.observe(t.editor.mounts.get(unrelated.key).root,{subtree:true,childList:true,attributes:true,characterData:true});
  const samples:number[]=[];t.focus('reading',0);
  for(let i=0;i<10;i++)for(const [inputType,data] of [['insertText','x'],['deleteContentBackward',null]] as const){const at=performance.now();document.activeElement!.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType,data}));samples.push(performance.now()-at);await frame();}
  observer.disconnect();if(unrelatedMutations)throw Error('Typing mutated an unrelated paragraph');
  let at=performance.now();t.editor.repository.undo();const undoMs=performance.now()-at;at=performance.now();t.editor.repository.redo();const redoMs=performance.now()-at;
  at=performance.now();const saved=t.save(),captureMs=performance.now()-at;
  // Existing point rebasing materialises the implicit 'before' affinity on an edit.
  const semantic = (value:any):any => Array.isArray(value) ? value.map(semantic) : value && typeof value==='object' ? Object.fromEntries(Object.entries(value.isZeroWidth===true ? {affinity:'before',...value} : value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,semantic(v)])) : value;
  if(JSON.stringify(semantic(JSON.parse(saved)))!==JSON.stringify(semantic(JSON.parse(before))))throw Error('Focused typing changed native text or annotation semantics');
  const beforeSave=t.state(),manualSave=await t.manualSave();
  return {mode,setup,pointAffinityMaterialized:saved!==before,switches:t.switchWork,typingMs:samples,undoMs,redoMs,captureMs,manualSave,unrelatedMutations,beforeSave,domCells:t.state().domCells,canonicalCells:t.state().canonicalCells};
};
