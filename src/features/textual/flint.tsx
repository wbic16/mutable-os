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
  const [chosen,setChosen]=createSignal<string>();
  const current=createMemo(()=>registry.ports().find(p=>p.key===chosen())??registry.ports()[0]);
  const [error,setError]=createSignal('');
  const run=async(action:()=>unknown)=>{try{setError('');await action();}catch(e){setError(String(e));}};
  return <Show when={current()} keyed fallback={<div class="tw-cell" style={cellStyle(props.grid,{col:1,row:3,widthCells:props.grid.columns-2,heightCells:3})}>No Flint application is open. <button onClick={()=>void run(()=>editor.commandRegistry.execute('flint.open',{targetKey:props.session.projection.state.rootKey,args:undefined}))}>Open Flint</button><p role="status">{error()}</p></div>}>
    {port=><FlintHost port={port} session={props.session} grid={props.grid} applications={<Show when={registry.ports().length>1}><select aria-label="Flint application" value={port.key} onChange={e=>{const session=port.session();if(session)editor.documentSessions?.presentations.remember(session);setChosen(e.currentTarget.value);}}><For each={registry.ports()}>{(app,index)=><option value={app.key}>Flint {index()+1}</option>}</For></select></Show>}/>}</Show>;
}
function FlintHost(props:{port:DocumentApplicationPort;session:WorkspaceSession;grid:TextualGrid;applications:import('solid-js').JSX.Element}) {
  const editor=props.session.editor, port=props.port, presentations=editor.documentSessions!.presentations;
  let root!:HTMLDivElement, slot!:HTMLDivElement, viewport!:HTMLDivElement, surfaces!:HTMLDivElement;
  const [mounted,setMounted]=createSignal(false),[error,setError]=createSignal(''),[busy,setBusy]=createSignal(false),[menu,setMenu]=createSignal<'file'|'edit'|'format'|'block'>();
  const document=createMemo(()=>port.session());
  const styles=()=>{const s=document();return s?documentStylePorts(editor).get(s.rootKey):undefined;};
  const [items,setItems]=createSignal<BlockMenuItem[]>([]);
  const target=()=>[editor.focus.state.focusedKey,editor.focus.state.lastFocusedKey].find(key=>key&&document()?.projection.node(key))??document()?.rootKey;
  const openCommands=(kind:'format'|'block')=>{remember();styles()?.capture();try{
    if(kind==='block'){const key=target();setItems(key?blockMenuItems(editor,key):[]);}
    else {const tools=styles()?.tools()??[];setItems([...new Set(tools.map(t=>t.toolset))].map<BlockMenuItem>(group=>({label:group,children:tools.filter(t=>t.toolset===group&&t.run).map(t=>({label:t.label,disabled:t.disabled?.(),run:t.run}))})).concat([{label:'Colours',children:[{label:'Text colour',input:{label:'CSS colour',value:'#ff0000',submit:value=>styles()?.annotate('text/colour',value)}},{label:'Background colour',input:{label:'CSS colour',value:'#ffff00',submit:value=>styles()?.annotate('text/background-colour',value)}}]}] as BlockMenuItem[]));}
    setMenu(kind);
  }catch(e){setError(String(e));}};
  const run=async(action:()=>unknown)=>{try{setError('');await action();}catch(e){setError(String(e));}};
  const remember=()=>{const s=document();if(s)presentations.remember(s);};
  const focus=()=>{const s=document();if(s)presentations.restorePosition(s,true);};
  const save=async()=>{if(busy())return;setBusy(true);remember();try{await run(()=>port.application.files?.save());}finally{setBusy(false);focus();}};
  const choose=(key:string)=>{remember();void run(()=>port.selectTab(key));};
  const rect=(col:number,row:number,width:number,height:number)=>cellStyle(props.grid,{col,row,widthCells:Math.max(1,width),heightCells:Math.max(1,height)});
  onMount(()=>{
    port.presented(true);setMounted(true);
    // Match Flint's existing shortcut interception before the workspace Save handler.
    const key=(event:KeyboardEvent)=>{if(!root.contains(event.target as Node)||event.isComposing)return;if((event.metaKey||event.ctrlKey)&&!event.altKey&&!event.shiftKey&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopPropagation();void save();}};
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
  return <div ref={root} class="tw-flint" data-mwm-window={port.windowId()} onKeyDown={e=>{if(e.key==='Escape'&&menu()){e.preventDefault();closeMenu();}}}>
    <nav data-cross-text-controls data-selection-toolbar ref={el=>onCleanup(ownSelectionToolbar(el,editor.mounts))} class="tw-cell tw-flint-menu" aria-label="Flint menu" style={rect(12,0,props.grid.columns-12,1)}>
      <button aria-expanded={menu()==='file'} onPointerDown={e=>e.preventDefault()} onClick={()=>{remember();setMenu(menu()==='file'?undefined:'file');}}>File</button>
      <button aria-expanded={menu()==='edit'} onPointerDown={e=>e.preventDefault()} onClick={()=>{remember();setMenu(menu()==='edit'?undefined:'edit');}}>Edit</button><button onPointerDown={e=>e.preventDefault()} onClick={()=>openCommands('format')}>Format</button><button onPointerDown={e=>e.preventDefault()} onClick={()=>openCommands('block')}>Block</button><fieldset class="tw-flint-applications" disabled={busy()}>{props.applications}</fieldset>
    </nav>
    <div class="tw-cell tw-title" style={rect(1,1,props.grid.columns-2,1)}>Flint · {port.application.properties()?.title??'No Document'}</div>
    <nav class="tw-cell tw-flint-tabs" aria-label="Documents" style={rect(1,2,props.grid.columns-2,1)}>
      <For each={port.tabs()}>{tab=><button disabled={busy()} aria-current={tab.key===port.activeTab()?'page':undefined} onPointerDown={e=>e.preventDefault()} onClick={()=>choose(tab.key)} title={tab.title}>{tab.title}{tab.dirty?' *':''}</button>}</For>
    </nav>
    <div ref={viewport} class="tw-cell tw-flint-editor" data-gloss-scrollport style={{...rect(1,4,props.grid.columns-2,props.grid.rows-7),'--tw-prose-width':`${Math.max(1,props.grid.columns-4-Math.ceil(20/props.grid.cellWidthPx))*props.grid.cellWidthPx}px`}}>
      <div ref={slot} class="tw-flint-slot"/>
      <Show when={!document()}><p>Select a Document to begin.</p></Show>
    </div>
    <div class="tw-cell tw-flint-status" role="status" style={rect(1,props.grid.rows-2,props.grid.columns-2,1)}>{error()||styles()?.notice()|| (busy()?'Saving…':port.application.properties()?.unsaved?'Modified · Ctrl/Cmd+S to save':port.application.properties()?.location?.filename??'Ready')}</div>
    <Show when={menu()}><div data-selection-toolbar ref={el=>onCleanup(ownSelectionToolbar(el,editor.mounts))} class="tw-cell tw-popup tw-flint-popup" style={rect(12,1,Math.min(42,props.grid.columns-12),Math.min(menu()==='format'||menu()==='block'?24:8,props.grid.rows-3))}>
      <Show when={menu()==='format'||menu()==='block'}><TextualCommandMenu items={items()} close={closeMenu} execute={action=>{setMenu(undefined);focus();void run(action);}}/></Show>
      <Show when={menu()==='file'||menu()==='edit'}><Show when={menu()==='file'} fallback={<><button onPointerDown={e=>e.preventDefault()} onClick={()=>history('undo')}>Undo</button><button onPointerDown={e=>e.preventDefault()} onClick={()=>history('redo')}>Redo</button><button onClick={closeMenu}>Close menu</button></>}>
        <button disabled={busy()||!port.application.files||!document()} onPointerDown={e=>e.preventDefault()} onClick={()=>{setMenu(undefined);void save();}}>Save Document</button>
        <label>Open Document <select aria-label="Open Document" value="" onChange={e=>{remember();void run(()=>port.application.openDocument(e.currentTarget.value));setMenu(undefined);}}><option value="" disabled>Choose…</option><For each={port.application.documents()}>{doc=><option value={doc.id}>{doc.title}</option>}</For></select></label>
        <button onClick={()=>{setMenu(undefined);remember();void run(()=>port.application.closeActiveTab());}}>Close Document</button>
        <button onClick={closeMenu}>Close menu</button>
      </Show></Show>
    </div></Show>
    <div ref={surfaces} class="tw-flint-surfaces"/>
    <Show when={port.prompt()} keyed>{prompt=><TextualSavePrompt prompt={prompt} grid={props.grid}/>}</Show>
  </div>;
}
function TextualSavePrompt(props:{prompt:SavePrompt;grid:TextualGrid}) {
  const prompt=props.prompt;
  const [folder,setFolder]=createSignal(prompt.kind==='destination'?prompt.root:''),[name,setName]=createSignal(prompt.kind==='destination'?prompt.filename:prompt.suggested),[error,setError]=createSignal('');
  let root!:HTMLDivElement;
  const cancel=()=>prompt.kind==='destination'?prompt.choose():prompt.choose({action:'cancel'});
  onMount(()=>root.querySelector<HTMLInputElement>('input')?.focus());
  const submit=()=>{try{if(prompt.kind==='destination')prompt.choose(validateSaveDestination(prompt.root,folder(),name()));else prompt.choose({action:'rename',filename:name()});}catch(e){setError(String(e));}};
  return <div class="tw-dialog-shade"><div ref={root} class="tw-cell tw-save-dialog" role="dialog" aria-modal="true" aria-label="Save Document" style={cellStyle(props.grid,{col:1,row:2,widthCells:Math.max(1,props.grid.columns-2),heightCells:Math.min(11,props.grid.rows-3)})} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();cancel();}if(e.key==='Tab'){const fields=[...root.querySelectorAll<HTMLElement>('input,button:not(:disabled)')];const i=fields.indexOf(root.ownerDocument.activeElement as HTMLElement);if(e.shiftKey?i<=0:i===fields.length-1){e.preventDefault();(e.shiftKey?fields.at(-1):fields[0])?.focus();}}}}>
    <form onSubmit={e=>{e.preventDefault();submit();}}><p>Save Document</p><Show when={prompt.kind==='destination'}><label>Folder <input value={folder()} onInput={e=>setFolder(e.currentTarget.value)}/></label></Show>
    <Show when={prompt.kind==='collision'}><p>{prompt.filename} already exists.</p></Show>
    <label>Filename <input value={name()} onInput={e=>setName(e.currentTarget.value)}/></label><p role="alert">{error()|| (prompt.kind==='collision'?prompt.overwriteUnavailable:'')}</p>
    <button type="submit">{prompt.kind==='collision'?'Use new filename':'Save'}</button><Show when={prompt.kind==='collision'}><button type="button" disabled={prompt.kind==='collision'&&!!prompt.overwriteUnavailable} onClick={()=>{if(prompt.kind==='collision')prompt.choose({action:'overwrite'});}}>Overwrite</button></Show><button type="button" onClick={cancel}>Cancel</button></form>
  </div></div>;
}
