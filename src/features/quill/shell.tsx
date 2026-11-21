import quillIcon from '../../assets/quill.svg';
import {exportComposition} from './export';
import {QuillNavigator} from './navigator';
import {quillExample} from './examples';
import {documentApplicationPorts} from '../../application/document-application-ports';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import {ToolIcon} from './tool-icon';
import {pathKinds} from './model';
import {effectPresets} from './effects';
import {inspectorTabs,dockTabs} from './studio';
import {loadPreferences,savePreferences,type QuillPreferences} from './preferences';
import {studioFor,type QuillStudio} from './studio';
import { For, Show, createSignal, createMemo, createEffect, onMount, onCleanup } from 'solid-js';
import type { DocumentApplicationInstance } from '../../feature-api/document-application';
import { DocumentBrowser } from '../../demo/document-browser';
import './quill.css';

export interface QuillContext {
  existing: boolean;
  documentId: string;
  confirm(): void;
  returnToSource(): Promise<void>;
}
export function QuillShell(props: { application: DocumentApplicationInstance; editor:ReactiveEditor; context?: QuillContext }) {
  const app = props.application;
  const port=createMemo(()=>documentApplicationPorts(props.editor).ports().find(p=>p.application===app));
  const session=()=>port()?.session();
  const insert=(kind:'composition'|'raven'|'text'|'page')=>{const view=session(),n=view?.projection.node(view.rootKey);if(!view||!n)throw Error('Open or create an Ink Document first.');const dto=kind==='composition'||kind==='raven'?quillExample(kind==='raven'):{type:kind==='page'?'page-block':'standoff-editor-block',...(kind==='page'?{children:[{type:'standoff-editor-block',text:''}]}:{text:''})};const inserted=props.editor.commands.insert(dto,{kind:'at',parentKey:n.key,index:n.children.length});queueMicrotask(()=>{if(!view.current())return;const block=view.projection.nodeForPlacement(inserted),key=block?.children[0]??block?.key;if(!key)return;if(kind==='raven'||kind==='composition'){studio()?.setInspectorTab('text');studio()?.choose(key);}else{studio()?.setActive(undefined);props.editor.focus.request(key,{reason:'quill-insert'});}});};
  const activeId = () => app.activeDocumentId?.();
  let root!: HTMLElement,main!:HTMLElement;let pan:{id:number;x:number;y:number;left:number;top:number}|undefined;
  const panStart=(e:PointerEvent)=>{if(studio()?.tool()!=='hand'||e.button!==0||!(e.target as Element).closest('.quill-artboard,.quill-artwork-background'))return;const main=e.currentTarget as HTMLElement;pan={id:e.pointerId,x:e.clientX,y:e.clientY,left:main.scrollLeft,top:main.scrollTop};main.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();};
  const [preferences,setPreferences]=createSignal(loadPreferences()),[studio,setStudio]=createSignal<QuillStudio>();
  const visibleSources=()=>studio()?.sources().filter(s=>!!session()?.projection.node(s.key))??[];
  createEffect(()=>{activeId();queueMicrotask(()=>{const host=studio(),key=host?.active();if(key&&!session()?.projection.node(key))host?.setActive(undefined);});});
  const preference=(patch:Partial<QuillPreferences>)=>{const value={...preferences(),...patch};setPreferences(value);savePreferences(value);};
  onMount(()=>{
    setStudio(studioFor(root));main.addEventListener('pointerdown',panStart,true);onCleanup(()=>main.removeEventListener('pointerdown',panStart,true));
    const save=(event:KeyboardEvent)=>{
      if(event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's' || !(event.target instanceof Node) || !root.contains(event.target))return;
      event.preventDefault();event.stopImmediatePropagation();
      if(app.files && app.properties() && !busy())void run(()=>app.files!.save());
    };
    window.addEventListener('keydown',save,true);onCleanup(()=>window.removeEventListener('keydown',save,true));
  });
  const [error,setError] = createSignal(''), [busy,setBusy] = createSignal(false), [opening,setOpening] = createSignal(false);
  const chooseTool=(tool:string)=>{const s=studio();if(!s)return;s.setTool(tool);if(['path','shape','points'].includes(tool)){s.setInspectorTab('path');s.action('Paths');}else if(tool==='text'||tool==='select'){s.setInspectorTab('text');s.action('Text');}else if(tool==='annotation')s.setInspectorTab('semantics');else if(tool==='transform')s.setInspectorTab('effects');else if(tool==='arrange'||tool==='frame')s.setInspectorTab('layout');if(tool==='zoom')preference({zoom:preferences().zoom>=2?.5:Math.min(2,preferences().zoom+.25)});if(tool==='ornament'){s.setDockTab('ornaments');s.setDockOpen(true);}};
  const [confirmed,setConfirmed] = createSignal(!!props.context?.existing);
  const run = async (action:()=>unknown) => { setError(''); setBusy(true); try { await action(); } catch(e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  return <section ref={root} class="quill-application" data-quill-selection={studio()?.active()?'composition':'native'} data-quill-theme={preferences().appearance} data-quill-workspace={preferences().workspace} data-quill-panels={preferences().panels} style={{'--quill-zoom':String(preferences().zoom)}} aria-label="Quill application">
    <header><img src={quillIcon} alt="" width="30" height="30"/><strong>Quill</strong><span>Geometric text studio</span>
      <label class="quill-appearance">Appearance<select aria-label="Quill appearance" value={preferences().appearance} onChange={e=>preference({appearance:e.currentTarget.value as QuillPreferences['appearance']})}><option value="midnight">Midnight</option><option value="parchment">Parchment</option><option value="mutable">Follow Mutable</option></select></label>
      <button onClick={()=>void run(()=>app.createDocument?.())}>New Document</button>
      <button disabled={!app.files} onClick={()=>setOpening(true)}>Open Ink…</button>
      <button data-document-save disabled={!app.files || !app.properties() || busy()} onPointerDown={e=>e.preventDefault()} onClick={()=>void run(()=>app.files!.save())}>Save Document</button>
      <For each={['svg','png'] as const}>{format=><button disabled={!studio()?.active()} onClick={()=>void run(async()=>{const source=visibleSources().find(s=>s.key===studio()?.active()),composition=source?.root.closest('.quill-composition');if(!composition)throw Error('Select a composition.');await exportComposition(composition,format);})}>Export {format.toUpperCase()}</button>}</For><button aria-label="Undo" onPointerDown={e=>e.preventDefault()} onClick={()=>props.editor.repository.undo()}>↶</button><button aria-label="Redo" onPointerDown={e=>e.preventDefault()} onClick={()=>props.editor.repository.redo()}>↷</button><Show when={props.context}><button disabled={busy()} onClick={()=>void run(()=>props.context!.returnToSource())}>Return to editor</button></Show>
    </header>
    <Show when={error()}><p role="alert">{error()}</p></Show>
    <Show when={props.context && !confirmed()}><div class="quill-confirm" role="region" aria-label="Confirm Quill conversion">
      <p>Convert this whole paragraph into a composition? Its native text and annotations stay in this Document. Opening Quill has not converted it.</p>
      <button disabled={busy() || activeId() !== props.context?.documentId} onClick={()=>void run(()=>{props.context!.confirm();setConfirmed(true);})}>Convert paragraph</button>
      <button disabled={busy()} onClick={()=>void run(()=>props.context!.returnToSource())}>Cancel and return</button>
    </div></Show>
    <div class="quill-workspace">
      <div class="quill-toolbox" role="toolbar" aria-label="Quill tools"><For each={['select','text','path','shape','frame','ornament','annotation','points','transform','arrange','hand','zoom']}>{tool=><button title={tool} aria-label={tool==='points'?'Edit points':tool} aria-pressed={studio()?.tool()===tool} disabled={!studio()?.active()} onPointerDown={e=>e.preventDefault()} onClick={()=>chooseTool(tool)}><ToolIcon name={tool}/></button>}</For><button title="Layers and assets" aria-label="Toggle layers and assets" aria-pressed={studio()?.dockOpen()} onClick={()=>studio()?.setDockOpen(!studio()?.dockOpen())}>☷</button></div>
      <nav aria-label="Quill Documents"><details open><summary>Documents</summary><For each={app.documents()}>{doc=><button class="quill-document" aria-current={activeId() === doc.id ? 'page' : undefined} onClick={()=>app.openDocument(doc.id)}>{doc.title}</button>}</For>
        <button disabled={!app.vault} onClick={()=>app.vault?.choose?.()}>Choose Vault…</button>
        <Show when={app.vault?.error?.()}><p role="status">{app.vault!.error!()}</p></Show>
        </details><details open><summary>Document Blocks</summary><Show when={session()}>{view=><QuillNavigator editor={props.editor} session={view()} studio={studio()}/>}</Show></details><details><summary>Text sources</summary><For each={visibleSources()}>{source=><button aria-current={studio()?.active()===source.key?'true':undefined} onClick={()=>studio()?.choose(source.key)}>{source.label}</button>}</For></details>
        <details><summary>Workspace</summary><label>Canvas surround<select aria-label="Workspace background" value={preferences().workspace} onChange={e=>preference({workspace:e.currentTarget.value as QuillPreferences['workspace']})}><option value="charcoal">Charcoal</option><option value="paper">Paper</option></select></label><label>Zoom<input type="range" aria-label="Workspace zoom" min=".5" max="2" step=".1" value={preferences().zoom} onInput={e=>preference({zoom:Number(e.currentTarget.value)})}/></label></details>
      </nav>
      <main ref={main} onPointerMove={e=>{if(pan?.id===e.pointerId){e.currentTarget.scrollLeft=pan.left+pan.x-e.clientX;e.currentTarget.scrollTop=pan.top+pan.y-e.clientY;e.preventDefault();}}} onPointerUp={()=>{pan=undefined;}} onPointerCancel={()=>{pan=undefined;}} onFocusIn={e=>{if((e.target as Element).closest('.reactive-standoff-flow')&&!(e.target as Element).closest('.quill-composition'))studio()?.setActive(undefined);}}><div class="quill-canvas-toolbar"><For each={['composition','text','page','raven'] as const}>{kind=><button disabled={!session()} onClick={()=>void run(()=>insert(kind))}>{kind==='raven'?'Raven example':'Add '+kind}</button>}</For><span>{visibleSources().find(s=>s.key===studio()?.active())?.label??'Mixed native document'}</span><button aria-label="Zoom out" onClick={()=>preference({zoom:Math.max(.5,preferences().zoom-.1)})}>−</button><output>{Math.round(preferences().zoom*100)}%</output><button aria-label="Zoom in" onClick={()=>preference({zoom:Math.min(2,preferences().zoom+.1)})}>＋</button><button onClick={()=>preference({panels:!preferences().panels})}>Navigator</button></div><app.tabs/><Show when={!app.properties()}><p class="quill-empty">Create or open an ordinary Ink Document to begin.</p></Show></main>
      <aside aria-label="Quill inspector"><h2>Inspector</h2><div class="quill-inspector-tabs" role="tablist" aria-label="Quill inspector tabs"><For each={inspectorTabs}>{tab=><button role="tab" aria-selected={studio()?.inspectorTab()===tab} onClick={()=>{studio()?.setInspectorTab(tab);if(tab==='path')studio()?.action('Paths');}}>{tab}</button>}</For></div><div data-quill-inspector/><p>Select Paths to inspect geometry; Text to edit or annotate the selected source.</p>
        <Show when={app.properties()}>{p=><><h3>{p().title}</h3><p role="status">{!app.files ? 'In-memory document' : p().unsaved ? 'Unsaved changes' : 'No unsaved changes'}</p><p>{app.files?.status()}</p></>}</Show>
      </aside>
    </div>
    <Show when={studio()?.dockOpen()}><section class="quill-bottom-dock" aria-label="Layers and asset library"><div role="tablist" aria-label="Quill dock tabs"><For each={dockTabs}>{tab=><button role="tab" aria-selected={studio()?.dockTab()===tab} onClick={()=>studio()?.setDockTab(tab)}>{tab.replaceAll('-',' ')}</button>}</For><button aria-label="Collapse dock" onClick={()=>studio()?.setDockOpen(false)}>⌄</button></div><div data-quill-dock/>
      <Show when={studio()?.dockTab()==='path-presets'}><div class="quill-preset-tiles"><For each={pathKinds}>{kind=><button disabled={!studio()?.active()} onClick={()=>studio()?.command('path',kind)}>{kind}</button>}</For></div></Show>
      <Show when={studio()?.dockTab()==='effect-presets'}><div class="quill-preset-tiles"><For each={Object.keys(effectPresets)}>{kind=><button disabled={!studio()?.active()} onClick={()=>studio()?.command('effect',kind)}>{kind}</button>}</For></div></Show>
    </section></Show>
    <footer class="quill-statusbar"><span>{app.files?.location()?.filename??app.properties()?.title??'No active Ink'}</span><span>{studio()?.status()}</span><span>{Math.round(preferences().zoom*100)}% · {preferences().appearance}</span></footer>
    <Show when={opening()}><DocumentBrowser mode="open" initialLocation={app.files?.location() ?? {folder:'.',filename:''}} busy={busy()} error={error()} onClose={()=>setOpening(false)} onChoose={async location=>{
      let opened=false; await run(async()=>{await app.files!.open(location);opened=true;setOpening(false);});return opened;
    }}/></Show>
  </section>;
}
