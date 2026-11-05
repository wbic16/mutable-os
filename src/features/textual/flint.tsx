import {Portal} from 'solid-js/web';
import {flintPanes,setTextualDocumentLayout,showFullDocument,useTextualWorkspace} from './layout';
import {nativeIslands} from './native-islands';
import {glossPresentationControls} from '../gloss/presentation-context';
import {TextualReferences} from './references';
import {TextualCardex} from './cardex';
import {cardexPresentationPorts} from '../../application/cardex-presentation-ports';
import {windowManagerForDocument} from '../../application/window-lifecycle';
import {textualFileActions} from './file-actions';
import {TextualNewDocument} from './new-document';
import { documentStylePorts } from '../../runtime/document-style-ports';
import { blockMenuItems, type BlockMenuItem } from '../../runtime/block-menu-actions';
import { TextualCommandMenu } from './command-menu';
import { ownSelectionToolbar } from '../../input/selection-target';
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, untrack } from 'solid-js';
import type { WorkspaceSession } from '../../application/workspace-session';
import { documentApplicationPorts, type DocumentApplicationPort } from '../../application/document-application-ports';
import { validateSaveDestination, type SavePrompt } from '../../application/document-save';
import { cellStyle, type TextualGrid } from './grid';

/** Dedicated chrome around an existing Flint controller and retained editor DOM. */
export function TextualFlint(props:{session:WorkspaceSession;grid:TextualGrid}) {
  const editor=props.session.editor, registry=documentApplicationPorts(editor);
  const [chosen,setChosen]=createSignal<string|undefined>(registry.ports().find(p=>p.windowId()===props.session.windowManager?.registry.activeWindowId)?.key);
  const current=createMemo(()=>registry.ports().find(p=>p.key===chosen())??registry.ports()[0]);
  const [error,setError]=createSignal(''),[cardex,setCardex]=createSignal<string>();
  const cards=cardexPresentationPorts(editor),card=createMemo(()=>cards.ports().find(p=>p.key===cardex()));
  const chooseCardex=(key:string)=>{const port=cards.ports().find(p=>p.key===key);if(port?.windowKey)editor.windowManager?.lifecycle.reveal(port.windowKey);setCardex(port?.key);};
  const closeCardex=(navigation?:string|true)=>{if(typeof navigation==='string')setChosen(navigation);if(navigation)showFullDocument(editor);setCardex(undefined);queueMicrotask(()=>{const session=current()?.session();if(session){if(navigation)editor.documentSessions?.presentations.remember(session);editor.documentSessions?.presentations.restorePosition(session,true);const key=editor.focus.state.focusedKey;if(key&&session.projection.node(key)){const mount=editor.mounts.get(key),range=mount?.captureInlineSelection?.()??editor.mounts.inlineSelection(key);mount?.focus();if(range)mount?.restoreInlineSelection?.(range);}}});};
  const openCardex=async()=>{if(!cards.ports().length)await editor.commandRegistry.execute('cardex.open',{targetKey:props.session.projection.state.rootKey,args:undefined});queueMicrotask(()=>{const port=cards.ports()[0];if(port)chooseCardex(port.key);});};
  const run=async(action:()=>unknown)=>{try{setError('');await action();}catch(e){setError(String(e));}};
  return <><Show when={current()} keyed fallback={<div class="tw-cell" style={cellStyle(props.grid,{col:1,row:3,widthCells:props.grid.columns-2,heightCells:3})}>No Flint application is open. <button disabled={!editor.features.cardex} onClick={()=>void run(openCardex)}>Cardex</button> <button disabled={!editor.documentSessions} onClick={()=>void run(()=>editor.commandRegistry.execute('flint.open',{targetKey:props.session.projection.state.rootKey,args:undefined}))}>Open Flint</button><p role="status">{error()||(!editor.documentSessions?'Textual Flint requires retained Document sessions and the Window Manager.':'')}</p></div>}>
    {port=><FlintHost covered={!!card()} openCardex={()=>void run(openCardex)} port={port} session={props.session} grid={props.grid} applications={<Show when={registry.ports().length>1}><select aria-label="Flint application" value={port.key} onChange={e=>{const session=port.session();if(session)editor.documentSessions?.presentations.remember(session);setChosen(e.currentTarget.value);}}><For each={registry.ports()}>{(app,index)=><option value={app.key}>Flint {index()+1}</option>}</For></select></Show>}/>}</Show><Show when={card()} keyed>{port=><TextualCardex editor={editor} port={port} choose={chooseCardex} close={closeCardex}/>}</Show></>;
}
function FlintHost(props:{covered:boolean;openCardex():void;port:DocumentApplicationPort;session:WorkspaceSession;grid:TextualGrid;applications:import('solid-js').JSX.Element}) {
  const workspace=useTextualWorkspace();
  const editor=props.session.editor, port=props.port, presentations=editor.documentSessions!.presentations;
  let root!:HTMLDivElement, slot!:HTMLDivElement, viewport!:HTMLDivElement, surfaces!:HTMLDivElement,secondary!:HTMLDivElement,glossSurface!:HTMLDivElement;
  const [mounted,setMounted]=createSignal(false),[error,setError]=createSignal(''),[busy,setBusy]=createSignal(false),[menu,setMenu]=createSignal<'file'|'edit'|'format'|'block'|'tools'>();
  const document=createMemo(()=>port.session());
  const styles=()=>{const s=document();return s?documentStylePorts(editor).get(s.rootKey):undefined;};
  const [items,setItems]=createSignal<BlockMenuItem[]>([]);
  const [creating,setCreating]=createSignal(false),[references,setReferences]=createSignal(false),[fullSize,setFullSize]=createSignal(false);
  const gloss=()=>{const s=document();return s&&glossPresentationControls(s);};
  const secondaryOpen=()=>references()||!!(gloss()?.active()&&gloss()?.references());
  const panes=createMemo(()=>flintPanes(props.grid,!!gloss()?.active(),secondaryOpen(),fullSize(),workspace?.preferences().readingWidth??88));
  createEffect(()=>{if(!mounted())return;const s=document();if(!s)return;
    createEffect(()=>setTextualDocumentLayout(s,{grid:props.grid,panes:panes(),fullSize:fullSize(),scrollport:viewport,secondary:glossSurface,showGloss:()=>{setReferences(false);const c=gloss();if(c&&!c.references())c.toggleReferences();}}));
    onCleanup(()=>setTextualDocumentLayout(s,undefined));
  });
  createEffect(()=>{if(!mounted())return;const s=document();if(!s)return;
    const islands=nativeIslands(s.element,untrack(()=>props.grid.cellHeightPx));
    (s.element as any).textualIslands=islands.diagnostics;
    createEffect(()=>islands.zoom(props.grid.cellHeightPx));
    onCleanup(()=>{islands.dispose();delete (s.element as any).textualIslands;});
  });
  const target=()=>[editor.focus.state.focusedKey,editor.focus.state.lastFocusedKey].find(key=>key&&document()?.projection.node(key))??document()?.rootKey;
  const openCommands=(kind:'format'|'block'|'file'|'tools')=>{remember();styles()?.capture();try{
    if(kind==='tools')setItems([
      {label:'Scry / Link Entity',disabled:!editor.features.autocompleteWorkstation,run:()=>{const key=target();if(key)editor.commandRegistry.execute('autocomplete.open',{targetKey:key,args:undefined});}},
      {label:'New Gloss',disabled:!editor.features.glossMode,run:()=>{const key=target();if(key)editor.commandRegistry.execute('gloss.create',{targetKey:key,args:undefined});}},
      {label:'Gloss Mode',disabled:!editor.features.glossPresentation,run:()=>{const s=document();if(s)glossPresentationControls(s)?.toggle();}},
      {label:'Gloss Explorer',disabled:!editor.features.glossPresentation,run:()=>{setReferences(false);const s=document(),controls=s&&glossPresentationControls(s);if(controls){if(!controls.active())controls.toggle();else controls.toggleReferences();}}},
      {label:'References & Search',run:()=>{const controls=gloss();if(controls?.active()&&controls.references())controls.toggleReferences();setReferences(true);}},
      {label:'Cardex',disabled:!editor.features.cardex,run:props.openCardex}
    ]);
    else if(kind==='file')setItems(textualFileActions(port,save,()=>setCreating(true)));
    else if(kind==='block'){const key=target();setItems(key?blockMenuItems(editor,key):[]);}
    else {const tools=styles()?.tools()??[];setItems([...new Set(tools.map(t=>t.toolset))].map<BlockMenuItem>(group=>({label:group,children:tools.filter(t=>t.toolset===group&&t.run).map(t=>({label:t.label,disabled:t.disabled?.(),run:t.run}))})).concat([{label:'Colours',children:[{label:'Text colour',input:{label:'CSS colour',value:'#ff0000',submit:value=>styles()?.annotate('text/colour',value)}},{label:'Background colour',input:{label:'CSS colour',value:'#ffff00',submit:value=>styles()?.annotate('text/background-colour',value)}}]}] as BlockMenuItem[]));}
    setMenu(kind);
  }catch(e){setError(String(e));}};
  const run=async(action:()=>unknown)=>{try{setError('');await action();}catch(e){setError(String(e));}};
  const remember=()=>{const s=document();if(s)presentations.remember(s);};
  const focus=()=>{const s=document();if(s)presentations.restorePosition(s,true);};
  const save=async(as=false)=>{if(busy())return;setBusy(true);remember();try{await run(()=>as?port.saveAs?.():port.application.files?.save());}finally{setBusy(false);focus();}};
  const choose=(key:string)=>{remember();void run(()=>port.selectTab(key));};
  const rect=(col:number,row:number,width:number,height:number)=>cellStyle(props.grid,{col,row,widthCells:Math.max(1,width),heightCells:Math.max(1,height)});
  onMount(()=>{
    port.presented(true);setMounted(true);
    // Match Flint's existing shortcut interception before the workspace Save handler.
    const key=(event:KeyboardEvent)=>{if(!root.contains(event.target as Node)||event.isComposing)return;if((event.metaKey||event.ctrlKey)&&!event.altKey&&!event.shiftKey&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopPropagation();if(!(event.target instanceof Element&&event.target.closest('[role=dialog]')))void save();}};
    window.addEventListener('keydown',key,true);
    onCleanup(()=>{window.removeEventListener('keydown',key,true);port.presented(false);});
  });
  createEffect(()=>{
    if(!mounted())return;
    const s=document();if(!s)return;
    untrack(()=>{try{
      const restore=presentations.present(s,{container:slot,scrollport:viewport,surfaceContainer:surfaces,activity:()=>({mounted:true,visible:true,active:true})});
      let alive=true;queueMicrotask(()=>{if(alive){presentations.restorePosition(s,true);}});
      onCleanup(()=>{alive=false;restore();});
      setError('');
    }catch(e){setError(String(e));}});
  });
  createEffect(()=>{props.grid;const s=document();if(!s)return;const frame=requestAnimationFrame(()=>presentations.restorePosition(s));onCleanup(()=>cancelAnimationFrame(frame));});
  const history=(direction:'undo'|'redo')=>{setMenu(undefined);focus();editor.repository[direction]();};
  const closeMenu=()=>{setMenu(undefined);focus();};
  return <div ref={root} class="tw-flint" inert={props.covered} data-cardex-covered={props.covered||undefined} data-secondary-fullscreen={panes().fullscreen||undefined} data-mwm-window={port.windowId()} onKeyDown={e=>{if(e.key==='Escape'&&menu()){e.preventDefault();closeMenu();}}}>
    <nav data-cross-text-controls data-selection-toolbar ref={el=>onCleanup(ownSelectionToolbar(el,editor.mounts))} class="tw-cell tw-flint-menu" aria-label="Flint menu" style={rect(12,0,props.grid.columns-12,1)}>
      <button aria-expanded={menu()==='file'} onPointerDown={e=>e.preventDefault()} onClick={()=>openCommands('file')}>File</button>
      <button aria-expanded={menu()==='edit'} onPointerDown={e=>e.preventDefault()} onClick={()=>{remember();setMenu(menu()==='edit'?undefined:'edit');}}>Edit</button><button onPointerDown={e=>e.preventDefault()} onClick={()=>openCommands('format')}>Format</button><button onPointerDown={e=>e.preventDefault()} onClick={()=>openCommands('block')}>Block</button><button onPointerDown={e=>e.preventDefault()} onClick={()=>openCommands('tools')}>Tools</button><fieldset class="tw-flint-applications" disabled={busy()}>{props.applications}</fieldset>
    </nav>
    <nav class="tw-cell tw-flint-tabs" aria-label="Documents" style={rect(1,1,props.grid.columns-2,1)}><strong class="tw-app-identity">Flint</strong>
      <For each={port.tabs()}>{tab=><button disabled={busy()} aria-current={tab.key===port.activeTab()?'page':undefined} onPointerDown={e=>e.preventDefault()} onClick={()=>choose(tab.key)} title={tab.title}>{tab.title}{tab.dirty?' *':''}</button>}</For>
    </nav>
    <div class="tw-cell tw-document-frame tw-frame" style={rect(1+panes().left,3,panes().document,props.grid.rows-4)} hidden={panes().fullscreen}/>
    <Show when={panes().left}><div class="tw-cell tw-frame" style={rect(1,3,panes().left,props.grid.rows-4)} hidden={panes().fullscreen}/><header class="tw-cell tw-margin-heading" style={rect(1,2,panes().left,1)}><span>Notes</span><button aria-label="Marginalia text size" title={fullSize()?'Use half-size notes':'Use full-size notes'} onClick={()=>setFullSize(v=>!v)}>{fullSize()?'Full':'Half'}</button></header></Show>
    <div ref={viewport} class="tw-cell tw-flint-editor" data-gloss-scrollport inert={panes().fullscreen} style={{...rect(1,3,panes().width-panes().right,props.grid.rows-4),visibility:panes().fullscreen?'hidden':'visible','--tw-margin-width':`${panes().left*props.grid.cellWidthPx}px`,'--tw-margin-cell':`${props.grid.cellWidthPx/(fullSize()?1:2)}px`,'--tw-margin-line':`${props.grid.cellHeightPx/(fullSize()?1:2)}px`,'--tw-margin-font':`calc(var(--tw-font-size) / ${fullSize()?1:2})`,'--tw-prose-width':`${Math.max(1,panes().document-4)*props.grid.cellWidthPx}px`}}>
      <div ref={slot} class="tw-flint-slot"/>
      <Show when={!document()}><p>Select a Document to begin.</p></Show>
    </div>
    <div ref={secondary} class="tw-cell tw-secondary tw-frame" aria-label="Secondary region" hidden={!secondaryOpen()} style={rect(panes().fullscreen?1:props.grid.columns-1-panes().secondary,3,panes().secondary,props.grid.rows-4)}>
      <div ref={glossSurface} class="tw-secondary-slot" hidden={references()}/><div class="tw-secondary-slot" hidden={!references()}><Show when={references()}><div data-selection-toolbar ref={el=>onCleanup(ownSelectionToolbar(el,editor.mounts))}><TextualReferences docked clearFocus={()=>showFullDocument(editor)} knowledge={port.application.knowledge} entities={port.application.entities} restore={focus} close={restore=>{if(restore===false&&!panes().fullscreen)return;setReferences(false);if(restore!==false)focus();}}/></div></Show></div>
    </div>
    <Show when={workspace?.status()} keyed>{status=><Portal mount={status}><div class="tw-flint-status" role="status" hidden={props.covered}>{error()||styles()?.notice()|| (busy()?'Saving…':port.application.properties()?.unsaved?'Modified · Ctrl/Cmd+S to save':port.application.properties()?.location?.filename??'Ready')}</div></Portal>}</Show>
    <Show when={menu()}><div data-selection-toolbar ref={el=>onCleanup(ownSelectionToolbar(el,editor.mounts))} class="tw-cell tw-popup tw-flint-popup" style={{...rect(12,1,Math.min(42,props.grid.columns-12),Math.min(menu()==='edit'?6:24,props.grid.rows-3)),height:'auto','max-height':`${Math.min(menu()==='edit'?6:24,props.grid.rows-3)*props.grid.cellHeightPx}px`}}>
      <Show when={menu()!=='edit'&&items()} keyed>{list=><TextualCommandMenu items={list} close={closeMenu} execute={action=>{setMenu(undefined);focus();void run(action);}}/>}</Show>
      <Show when={menu()==='edit'}><button onPointerDown={e=>e.preventDefault()} onClick={()=>history('undo')}>Undo</button><button onPointerDown={e=>e.preventDefault()} onClick={()=>history('redo')}>Redo</button><button onClick={()=>{closeMenu();const key=target();if(key)editor.find.open(key);}}>Find</button><button onClick={closeMenu}>Close menu</button></Show>
    </div></Show>
    <Show when={creating()&&port.application.vault}>{vault=><TextualNewDocument vault={vault()} grid={props.grid} close={()=>{setCreating(false);focus();}}/>}</Show>
    <div ref={surfaces} class="tw-flint-surfaces"/>
    <Show when={port.prompt()} keyed>{prompt=><TextualSavePrompt prompt={prompt} grid={props.grid}/>}</Show>
  </div>;
}
function TextualSavePrompt(props:{prompt:SavePrompt;grid:TextualGrid}) {
  const prompt=props.prompt;
  const [folder,setFolder]=createSignal(prompt.kind==='destination'?prompt.root:''),[name,setName]=createSignal(prompt.kind==='destination'?prompt.filename:prompt.suggested),[error,setError]=createSignal('');
  let root!:HTMLDivElement;
  const cancel=()=>prompt.kind==='destination'?prompt.choose():prompt.choose({action:'cancel'});
  onMount(()=>{const manager=windowManagerForDocument(root.ownerDocument);if(manager)onCleanup(manager.lifecycle.modal(root));root.querySelector<HTMLInputElement>('input')?.focus();});
  const submit=()=>{try{if(prompt.kind==='destination')prompt.choose(validateSaveDestination(prompt.root,folder(),name()));else prompt.choose({action:'rename',filename:name()});}catch(e){setError(String(e));}};
  return <div class="tw-dialog-shade"><div ref={root} class="tw-cell tw-save-dialog" role="dialog" aria-modal="true" aria-label="Save Document" style={cellStyle(props.grid,{col:1,row:2,widthCells:Math.max(1,props.grid.columns-2),heightCells:Math.min(11,props.grid.rows-3)})} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();cancel();}if(e.key==='Tab'){const fields=[...root.querySelectorAll<HTMLElement>('input,button:not(:disabled)')];const i=fields.indexOf(root.ownerDocument.activeElement as HTMLElement);if(e.shiftKey?i<=0:i===fields.length-1){e.preventDefault();(e.shiftKey?fields.at(-1):fields[0])?.focus();}}}}>
    <form onSubmit={e=>{e.preventDefault();submit();}}><p>Save Document</p><Show when={prompt.kind==='destination'}><label>Folder <input value={folder()} onInput={e=>setFolder(e.currentTarget.value)}/></label></Show>
    <Show when={prompt.kind==='collision'}><p>{prompt.filename} already exists.</p></Show>
    <label>Filename <input value={name()} onInput={e=>setName(e.currentTarget.value)}/></label><p role="alert">{error()|| (prompt.kind==='collision'?prompt.overwriteUnavailable:'')}</p>
    <button type="submit">{prompt.kind==='collision'?'Use new filename':'Save'}</button><Show when={prompt.kind==='collision'}><button type="button" disabled={prompt.kind==='collision'&&!!prompt.overwriteUnavailable} onClick={()=>{if(prompt.kind==='collision')prompt.choose({action:'overwrite'});}}>Overwrite</button></Show><button type="button" onClick={cancel}>Cancel</button></form>
  </div></div>;
}
