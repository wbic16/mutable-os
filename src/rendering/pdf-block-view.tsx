import {samePdfCapture} from '../pdf/capture';
import { ReverseInformation } from './reversible-surface';
import {archivedResourceApi} from '../runtime/archived-resources';
import {createSignal,createMemo,createEffect,onCleanup,onMount,Show,For,untrack} from 'solid-js';
import {unwrap} from 'solid-js/store';
import type {BlockViewProps} from '../block-tree/types';
import {useReactiveView} from '../reactive-editor/context';
import {HttpApplicationServices} from '../runtime/application-services';
import {PDF_LIMITS,validPdfAnchor,type PdfCapture,type PdfAnchor} from '../pdf/model';
import {mountPdfViewer,type PdfViewer} from '../pdf/viewer';
import {plainFragment} from '../interchange/serializer';
import {runInterchange} from '../runtime/interchange-worker';
import {ResourceRelationships} from './resource-relationships';
export function PdfBlockView(props:BlockViewProps){
 const {editor,projection}=useReactiveView(),node=()=>projection.state.nodes[props.nodeKey],snapshot=()=>node()?.payload.pdf as unknown as PdfCapture;
 const protectedState=createMemo(()=>!node()||editor.textProtection.isProtected(node()!.contentKey));
 const [viewer,setViewer]=createSignal<PdfViewer>(),[page,setPage]=createSignal(0),[zoom,setZoom]=createSignal(1),[busy,setBusy]=createSignal(false),[status,setStatus]=createSignal('Original retained. Open the local viewer to read it.'),[note,setNote]=createSignal(''),[region,setRegion]=createSignal<PdfAnchor['region']>();
 let root!:HTMLElement,host!:HTMLDivElement,active:AbortController|undefined,alive=true,epoch=0;
 const archive=(node()?.payload.archive as any),local=archive?archivedResourceApi(editor,archive):undefined;onCleanup(()=>{void local?.close();});
 const api=local?.api??new HttpApplicationServices(()=>{const c=editor.readAssetContext();if(!c?.cavernId||!c.session)throw Error('Open the source Vault');return {cavernId:c.cavernId,session:c.session};});
 const annotations=()=>{const p=node()?.payload.blockProperties;return (Array.isArray(p)?p:[]).filter((a:any)=>a?.type==='mutable/resource-annotation'&&!a.isDeleted&&typeof a.id==='string'&&typeof a.value==='string'&&validPdfAnchor(a.anchor)) as unknown as Array<{id:string;value:string;anchor:PdfAnchor}>;};
 function close(){epoch++;active?.abort();active=undefined;untrack(viewer)?.destroy();setViewer(undefined);setBusy(false);setRegion(undefined);}
 createEffect(()=>{snapshot()?.snapshotId;close();});
 onMount(()=>onCleanup(editor.mounts.register(props.nodeKey,{root,focusElement:root,inputPolicy:'opaque-widget',focus:()=>root.focus()})));
 onCleanup(()=>{alive=false;close();});
 async function open(){close();if(!editor.features.crossResourceLoaders)return;const generation=epoch,c=active=new AbortController(),s=structuredClone(unwrap(snapshot()));setBusy(true);setStatus('Reading retained PDF…');try{
  const result=await api.call('pdf.read',{snapshotId:s.snapshotId},c.signal);samePdfCapture(s,result.snapshot);
  const v=await mountPdfViewer(host,result.bytes,s,c.signal,message=>{if(alive&&generation===epoch)setStatus(message);});if(!alive||generation!==epoch){v.destroy();return;}setViewer(v);await v.page(page(),zoom());
 }catch(e){if(alive&&generation===epoch){close();setStatus(String(e));}}finally{if(alive&&generation===epoch)setBusy(false);}}
 async function navigate(index:number,scale=zoom()){const v=viewer();if(!v||busy())return;if(!Number.isInteger(index)||index<0||index>=snapshot().inspection.pages){setStatus('Choose a page within this PDF.');return;}setBusy(true);setPage(index);setZoom(scale);setRegion(undefined);const generation=epoch;try{await v.page(index,scale);}catch(e){if(alive&&generation===epoch)setStatus(String(e));}finally{if(alive&&generation===epoch)setBusy(false);}}
 function add(){if(protectedState())return;const v=viewer(),r=region(),s=snapshot();if(!v||!r||!note().trim())return;const anchor:PdfAnchor={version:1,kind:'pdf-page',coordinateVersion:1,snapshotId:s.snapshotId,assetId:s.asset.assetId,pageIndex:page(),viewBox:v.viewBox(),region:r};if(!validPdfAnchor(anchor)||annotations().length>=PDF_LIMITS.annotations){setStatus('Invalid page region or annotation limit');return;}
  editor.commands.setPayloadField(props.nodeKey,'blockProperties',[...(unwrap(node().payload.blockProperties) as any[]??[]),{id:crypto.randomUUID(),type:'mutable/resource-annotation',anchor,value:note().slice(0,4000),metadata:{origin:'authored',createdAt:new Date().toISOString()}}]);setNote('');setStatus('Annotation added. Save the document explicitly to retain it.');}
 async function extract(selected=false){if(protectedState())return;const v=viewer(),n=editor.node(props.nodeKey);if(!v||!n||busy())return;const revision=editor.repository.state.revision;const c=active;if(!c)return;setBusy(true);try{const extracted=v.extract(selected);if(!extracted.text.trim())throw Error('This page has no extractable text. OCR is not included.');
  const f=plainFragment('');f.blocks[0].inline!.atoms=[{kind:'text',text:extracted.text}];f.blocks[0].data={metadata:{role:'PdfTextBlock',provenance:extracted.provenance as any},...(archive?{archive:structuredClone(unwrap(archive))}:{})};for(const r of f.roots){r.openStart=false;r.openEnd=false;}
  const native=await runInterchange({kind:'materialize',fragment:f,scope:{},assets:[]},c.signal);if(!alive||protectedState()||!editor.node(props.nodeKey)||editor.repository.state.revision!==revision)throw Error('Destination changed; extraction cancelled');
  if(!archive){const content=native.state.contents[native.state.placements[native.roots[0]].contentKey];content.payload.blockProperties=[{id:crypto.randomUUID(),type:'codex/entity-reference',value:snapshot().entityId,metadata:{sourceSnapshotId:snapshot().snapshotId,entityName:snapshot().inspection.label}}];}
  editor.commands.insertFragment(native,{kind:'after',anchorKey:n.placementKey},{commandId:'pdf.extract-text',subjects:[]});setStatus('Inserted native text with original page alignment. Undo removes this derivative; save explicitly.');
 }catch(e){if(alive)setStatus(String(e));}finally{if(alive)setBusy(false);}}
 function removeAnnotation(id:string){if(protectedState())return;editor.commands.setPayloadField(props.nodeKey,'blockProperties',(unwrap(node().payload.blockProperties) as any[]).filter(p=>p.id!==id));}
 function Overlay(p:{id:string}){createEffect(()=>{const a=annotations().find(a=>a.id===p.id),v=viewer();if(a&&v)onCleanup(v.overlay(a.id,a.anchor,a.value));});return null;}
 return <section ref={root} tabindex="0" class="abstract-block mutable-pdf" data-runtime-key={props.nodeKey} data-client-id={props.nodeKey} style={{padding:'12px',border:'1px solid var(--flint-border,#ddd)'}}>
  <ReverseInformation nodeKey={props.nodeKey}>  <h3>{snapshot()?.inspection?.label??'Managed PDF'}</h3><p>{snapshot()?.inspection?.pages} pages · immutable original retained · captured {snapshot()?.retrievedAt}</p>
  <details><summary>Source and provenance</summary><p style={{'overflow-wrap':'anywhere'}}>{snapshot()?.sourceUrl}</p><p>Snapshot {snapshot()?.snapshotId}. Text extraction is a derivative; spatial notes use original page coordinates. No scripts, embedded actions or attachments run.</p></details>
</ReverseInformation>
  <button disabled={busy()||!editor.features.crossResourceLoaders} onClick={()=>void open()}>Open retained PDF</button><button onClick={close}>Close / cancel PDF</button>
  <Show when={viewer()}><div><button disabled={busy()||page()===0} onClick={()=>void navigate(page()-1)}>Previous PDF page</button><label>Page <input aria-label="PDF page" type="number" min="1" max={snapshot().inspection.pages} value={page()+1} disabled={busy()} onChange={e=>void navigate(Number(e.currentTarget.value)-1)} style={{width:'75px'}}/></label><button disabled={busy()||page()+1>=snapshot().inspection.pages} onClick={()=>void navigate(page()+1)}>Next PDF page</button><button disabled={busy()||zoom()>=4} onClick={()=>void navigate(page(),Math.min(4,zoom()*1.25))}>Zoom in</button><button disabled={busy()||zoom()<=0.25} onClick={()=>void navigate(page(),Math.max(0.25,zoom()/1.25))}>Zoom out</button><button disabled={busy()||protectedState()} onClick={()=>void extract()}>Extract page text as editable Ink</button><button disabled={busy()||protectedState()} onMouseDown={e=>e.preventDefault()} onClick={()=>void extract(true)}>Extract selected text as editable Ink</button></div></Show>
  <Show when={protectedState()}><p>Submitted resource: viewing is available; annotations and extraction are read-only.</p></Show><p role="status">{status()}</p><div ref={host} data-retain-scroll="" aria-label="PDF viewport" tabindex="0" style={{height:viewer()||busy()?'600px':'0',overflow:'auto',background:'#555',position:'relative'}}/>
  <For each={annotations().map(a=>a.id)}>{id=><Overlay id={id}/>}</For>
  <Show when={viewer()}><details><summary>PDF annotations ({annotations().length})</summary><button disabled={busy()} onMouseDown={e=>e.preventDefault()} onClick={()=>{try{setRegion(viewer()!.region());setStatus('Region captured from selected text, or the visible page.');}catch(e){setStatus(String(e));}}}>Use selection / visible region</button><Show when={region()}>{r=><p>Page {page()+1}: {Object.values(r()).map(n=>n.toFixed(1)).join(', ')} PDF units</p>}</Show><label>Note <input aria-label="PDF note" disabled={protectedState()} value={note()} maxlength={4000} onInput={e=>setNote(e.currentTarget.value)}/></label><button disabled={protectedState()||!region()||!note().trim()} onClick={add}>Add PDF annotation</button>
   <For each={annotations()}>{a=><p>Page {a.anchor.pageIndex+1}: {a.value} <button disabled={protectedState()} onClick={()=>removeAnnotation(a.id)}>Delete PDF annotation</button></p>}</For>
  </details></Show><Show when={!archive}><ReverseInformation nodeKey={props.nodeKey}><ResourceRelationships ownerKey={props.nodeKey} snapshotId={snapshot()?.snapshotId}/></ReverseInformation></Show>
 </section>;
}
