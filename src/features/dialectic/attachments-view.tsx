import {For,Show,createMemo,createSignal,onCleanup,onMount} from 'solid-js';
import type {DialecticController} from './controller';
import {attachmentAccept,attachmentSize,type Attachment} from './attachments-contract';
import type {PdfViewer} from '../../pdf/viewer';
// Preview only mounted, visible generated images; serialize automatic reads.
let imagePreviewQueue=Promise.resolve();
export function queueImagePreview(load:()=>Promise<void>){imagePreviewQueue=imagePreviewQueue.catch(()=>{}).then(load);}

export function AttachFiles(props:{c:DialecticController}){
 let input!:HTMLInputElement;const c=props.c;
 return <Show when={c.editor.features.dialecticAttachments}><input ref={input} hidden type="file" multiple accept={attachmentAccept} aria-label="Choose attachments" onChange={e=>{const files=Array.from(e.currentTarget.files??[]);e.currentTarget.value='';void c.files.attach(files);}}/><button disabled={c.busy()||!!c.files.pending()||!c.valid()} onClick={()=>input.click()}>Attach files</button><Show when={c.files.pending()&&!c.files.confirmation()}><span role="status">{c.files.pending()}</span><button onClick={c.files.cancel}>Cancel attachment preparation</button></Show></Show>;
}
export function AttachmentStatus(props:{c:DialecticController}){
 const c=props.c,items=createMemo(()=>c.draft()?.data.attachments??[]),total=createMemo(()=>items().reduce((n,a)=>n+a.byteLength,0));
 return <Show when={c.editor.features.dialecticAttachments}><section class="dialectic-file-status" aria-label="Draft attachment status" data-cross-text-controls>
  <div role="status">{items().length} attachment{items().length===1?'':'s'} ready{items().length?` · ${attachmentSize(total())} · sent on Submit`:''}</div>
  <small>{c.providerSettings().provider==='openai'?'OpenAI: PDFs under 50 MB in total.':'Claude: up to 94.5 MB of files within its encoded request limit.'} Uploads over 10 MB need confirmation.</small>
  <Show when={items().length}><ul class="dialectic-file-names"><For each={items()}>{file=><li>📎 {file.name} · {attachmentSize(file.byteLength)}</li>}</For></ul></Show>
  <Show when={c.fileProblem()}>{message=><p role="alert">{message()}</p>}</Show>
  <Show when={c.files.confirmation()}>{selection=><div class="dialectic-file-confirmation" role="group" aria-label="Confirm large upload">
   <strong>Upload {attachmentSize(selection().bytes)}?</strong><ul><For each={selection().files}>{file=><li>{file.name} · {attachmentSize(file.size)}</li>}</For></ul>
   <p>This stores the files in your Vault. Submit will send selected files to your AI provider, whose size and context limits still apply. Large files may take longer and use more tokens.</p>
   <button onClick={c.files.confirm}>Proceed with large upload</button><button onClick={c.files.cancel}>Cancel upload</button>
  </div>}</Show>
  <Show when={c.files.failure()}>{failure=><div class="dialectic-file-failure" role="alert"><strong>Not attached</strong><ul><For each={failure().files}>{file=><li>{file.name} · {attachmentSize(file.size)}</li>}</For></ul><p>{failure().message}</p><p>No files from this selection were added. Choose another file, or remove this failed selection before submitting.</p><button onClick={c.files.dismissFailure}>Remove failed selection</button></div>}</Show>
 </section></Show>;
}
export function AttachmentCards(props:{c:DialecticController;items:Attachment[];draft:boolean}){
 return <Show when={(props.c.editor.features.dialecticAttachments||props.c.editor.features.dialecticArtifacts)&&props.items.length}><div class="dialectic-attachments" aria-label="Contribution attachments"><For each={props.items}>{file=><AttachmentCard c={props.c} file={file} draft={props.draft}/>}</For></div></Show>;
}
function AttachmentCard(props:{c:DialecticController;file:Attachment;draft:boolean}){
 const [busy,setBusy]=createSignal(false),[error,setError]=createSignal(''),[preview,setPreview]=createSignal(false),[url,setUrl]=createSignal(''),[page,setPage]=createSignal(1),[pages,setPages]=createSignal(1),[text,setText]=createSignal('');
 let card!:HTMLElement,host!:HTMLDivElement,viewer:PdfViewer|undefined,abort:AbortController|undefined,alive=true;
 const close=()=>{abort?.abort();viewer?.destroy();viewer=undefined;if(url())URL.revokeObjectURL(url());setUrl('');setPreview(false);setBusy(false);};
 onCleanup(()=>{alive=false;close();});
 const downloadUrl=(object:string)=>{const a=document.createElement('a');a.href=object;a.download=props.file.name;document.body.append(a);a.click();a.remove();};
 const open=async(download:boolean)=>{
  if(download&&preview()&&url()){downloadUrl(url());return;}
  close();setError('');setBusy(true);const current=abort=new AbortController();
  try{
   const blob=await props.c.attachmentBlob(props.file,current.signal);current.signal.throwIfAborted();if(!alive)return;
   const object=URL.createObjectURL(blob);setUrl(object);
   if(download){downloadUrl(object);setTimeout(()=>URL.revokeObjectURL(object),1000);setUrl('');}
   else{
    setPreview(true);
    if(props.file.mediaType==='application/pdf'){
     const {mountPdfViewer}=await import('../../pdf/viewer');current.signal.throwIfAborted();
     viewer=await mountPdfViewer(host,new Uint8Array(await blob.arrayBuffer()),undefined,current.signal,()=>{});setPages(viewer.pageCount??1);setPage(1);await viewer.page(0,1);
    }else if(!props.file.mediaType.startsWith('image/'))setText(await blob.text());
   }
  }catch(e){if(alive&&!current.signal.aborted)setError(e instanceof Error?e.message:String(e));}
  finally{if(alive&&abort===current)setBusy(false);}
 };
 onMount(()=>{
  if(props.file.origin!=='agent'||!props.file.mediaType.startsWith('image/'))return;
  const show=()=>{queueImagePreview(async()=>{if(alive&&!preview()&&!busy())await open(false);});};
  if(typeof IntersectionObserver==='undefined'){show();return;}
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();show();}},{rootMargin:'100px'});
  observer.observe(card);onCleanup(()=>observer.disconnect());
 });
 const changePage=async(value:number)=>{if(busy()||value<1||value>pages())return;setBusy(true);try{await viewer?.page(value-1,1);setPage(value);}catch(e){setError(String(e));}finally{setBusy(false);}};
 return <article ref={card} class="dialectic-attachment" onPointerDown={e=>e.stopPropagation()}>
  <strong>{props.file.name}</strong><small>{Math.ceil(props.file.byteLength/1024)} KiB · {props.draft?'Local · sent on Submit':props.file.origin==='agent'?'Generated file':'Attached file'}</small>
  <div><button disabled={busy()} onClick={()=>void open(true)}>Download</button><button disabled={busy()} onClick={()=>void open(false)}>Preview</button><Show when={props.draft}><button disabled={!!props.c.files.pending()||props.c.busy()} onClick={()=>props.c.files.remove(props.file.id)}>Remove</button></Show><Show when={busy()}><button onClick={close}>Cancel</button></Show></div>
  <Show when={error()}><p role="alert">{error()}</p></Show>
  <Show when={preview()}><div class="dialectic-attachment-preview"><button onClick={close}>Close preview</button><Show when={props.file.mediaType==='application/pdf'}><div><button disabled={busy()||page()<=1} onClick={()=>void changePage(page()-1)}>Previous page</button><span> {page()} / {pages()} </span><button disabled={busy()||page()>=pages()} onClick={()=>void changePage(page()+1)}>Next page</button></div><div ref={host}/></Show><Show when={props.file.mediaType.startsWith('image/')}><img src={url()} alt={props.file.name}/></Show><Show when={props.file.mediaType==='text/plain'||props.file.mediaType==='application/json'}><pre>{text()}</pre></Show></div></Show>
 </article>;
}
