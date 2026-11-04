import {windowManagerForDocument} from '../../application/window-lifecycle';
import {createSignal,For,onMount,onCleanup} from 'solid-js';
import type {ApplicationVault} from '../../feature-api/document-application';
import {cellStyle,type TextualGrid} from './grid';
import type {DocumentFormat} from '../document-formats/model';
export function TextualNewDocument(props:{vault:ApplicationVault;grid:TextualGrid;close():void}){
 const [folder,setFolder]=createSignal(props.vault.state()?.root??'.'),[filename,setFilename]=createSignal('Untitled.ink'),[title,setTitle]=createSignal('Untitled'),[format,setFormat]=createSignal<DocumentFormat>('page'),[busy,setBusy]=createSignal(false),[error,setError]=createSignal('');
 let root!:HTMLDivElement;onMount(()=>{const manager=windowManagerForDocument(root.ownerDocument);if(manager)onCleanup(manager.lifecycle.modal(root));root.querySelector('input')?.focus();});
 const submit=async()=>{if(busy())return;setBusy(true);try{await props.vault.createDocument(folder(),filename(),title(),format());props.close();}catch(e){setError(String(e));}finally{setBusy(false);}};
 return <div class="tw-dialog-shade"><div ref={root} class="tw-cell tw-save-dialog" role="dialog" aria-modal="true" aria-label="New Document" style={cellStyle(props.grid,{col:1,row:2,widthCells:props.grid.columns-2,heightCells:Math.min(12,props.grid.rows-3)})} onKeyDown={e=>{if(e.key==='Escape'&&!busy()){e.preventDefault();e.stopPropagation();props.close();}if(e.key==='Tab'){const fields=[...root.querySelectorAll<HTMLElement>('input,select,button:not(:disabled)')];const i=fields.indexOf(root.ownerDocument.activeElement as HTMLElement);if(e.shiftKey?i<=0:i===fields.length-1){e.preventDefault();(e.shiftKey?fields.at(-1):fields[0])?.focus();}}}}>
  <form onSubmit={e=>{e.preventDefault();void submit();}}><p>New Document</p><fieldset disabled={busy()}>
   <label>Title <input value={title()} onInput={e=>setTitle(e.currentTarget.value)}/></label>
   <label>Folder <input value={folder()} onInput={e=>setFolder(e.currentTarget.value)}/></label>
   <label>Filename <input value={filename()} onInput={e=>setFilename(e.currentTarget.value)}/></label>
   <label>Format <select value={format()} onChange={e=>setFormat(e.currentTarget.value as DocumentFormat)}><For each={props.vault.documentFormats??[{id:'page',label:'Page'}]}>{item=><option value={item.id}>{item.label}</option>}</For></select></label>
   <button type="submit">Create</button><button type="button" onClick={props.close}>Cancel</button>
  </fieldset><p role="alert">{error()}</p></form>
 </div></div>;
}
