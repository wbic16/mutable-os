import { For, Show, createSignal, onMount, onCleanup } from 'solid-js';
import type { DocumentApplicationInstance } from '../../feature-api/document-application';
import { ApplicationSurfaceBoundary } from '../../feature-api';
import { featureFlags } from '../../configuration';
import { downloadSaveDiagnostics } from '../../persistence/browser-save-diagnostics';

/** Local presentation of the existing file capability; no binding or save authority. */
export function StorageSheet(props: {application: DocumentApplicationInstance; close: () => void; destination: {folder:string;filename:string}; setDestination: (value:{folder:string;filename:string}) => void}) {
  const app=props.application;
  const folder=()=>props.destination.folder, filename=()=>props.destination.filename;
  const setFolder=(folder:string)=>props.setDestination({...props.destination,folder});
  const setFilename=(filename:string)=>props.setDestination({...props.destination,filename});
  const [names,setNames]=createSignal<string[]>([]),[busy,setBusy]=createSignal(false),[error,setError]=createSignal('');
  const location=()=>props.destination;
  let live=true, dialog!:HTMLDivElement;
  onCleanup(()=>{live=false;});
  onMount(()=>dialog.querySelector<HTMLButtonElement>('button')?.focus());
  const run=async(action:()=>Promise<unknown>)=>{if(busy())return;setBusy(true);setError('');try{await action();}catch(e){if(live)setError(String(e));}finally{if(live)setBusy(false);}};
  return <ApplicationSurfaceBoundary><div class="flint-sheet-backdrop"><div ref={dialog} class="flint-files flint-sheet" role="dialog" aria-modal="true" aria-label="Storage and recovery" onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();props.close();}
    if(e.key==='Tab'){const controls=[...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')];const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
  }}>
    <header><div><small>FLINT / STORAGE</small><h2>Storage and recovery</h2></div><button onClick={props.close}>Close storage</button></header>
    <p role="status">{app.files?.status()}</p><Show when={error()}><p role="alert">{error()}</p></Show>
    <Show when={app.files} fallback={<p>Native file operations are unavailable in this host.</p>}>
          <label>Server folder <input aria-label="Server folder" value={folder()} onInput={e=>setFolder(e.currentTarget.value)} /></label>
          <label>Filename <input aria-label="Native filename" value={filename()} onInput={e=>setFilename(e.currentTarget.value)} /></label>
          <button disabled={busy()} onClick={()=>void run(async()=>setNames(await app.files!.list(folder())))}>List files</button>
          <select aria-label="Server files" value={filename()} onChange={e=>setFilename(e.currentTarget.value)}><option value="">Choose a file</option><For each={names()}>{name=><option value={name}>{name}</option>}</For></select>
          <button disabled={busy()} onClick={()=>void run(()=>app.files!.open(location()))}>Open native</button>
          <button disabled={busy()} onClick={()=>void run(()=>app.files!.open(location(),true))}>Import Markdown</button>
          <button disabled={busy()} onClick={()=>void run(()=>app.files!.recover(location()))}>Retry / Recover</button>
          <Show when={featureFlags.browserSaveDiagnostics}><button disabled={busy()} onClick={()=>void run(downloadSaveDiagnostics)}>Download save diagnostics</button></Show>
          <p>Documents save as Mutable JSON using their opened filename. Saving is manual (Command-S or Control-S). Workspace saving remains unavailable when native resource semantics cannot be preserved. Changing the fields selects a file to open or a first-save destination; it does not relocate an already bound Document.</p>
      <button disabled={busy()||app.vault?.state()?.readOnly||app.vault?.state()?.busy||!app.properties()} onClick={()=>void run(()=>app.files!.save(location()))}>Save to selected destination</button>
    </Show>
  </div></div></ApplicationSurfaceBoundary>;
}
