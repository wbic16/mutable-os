import {For,Show,createEffect,createMemo,createSignal,onCleanup,onMount} from 'solid-js';
import type {DialecticController} from './controller';
import type {Attachment} from './attachments-contract';
import {managedAsset,type ManagedAssetReference} from '../../interchange/managed-asset';
import {bindCardThumbnail} from '../cardex/service';
import {ImageSizeGate} from './image-size-gate';
import {queueImagePreview} from './attachments-view';
import './media-gallery.css';

interface MediaItem {id:string;title:string;caption:string;kind:'image'|'audio'|'video';blockId?:string;contributionId?:string;url?:string;asset?:ManagedAssetReference;attachment?:Attachment}
const copyAsset=(value:unknown)=>{const asset=managedAsset(value);return asset?{...asset}:undefined;};
const imageUrl=(value:unknown)=>{if(typeof value!=='string'||!value)return undefined;try{const url=new URL(value,location.href);return ['http:','https:'].includes(url.protocol)?url.href:undefined;}catch{return undefined;}};

export function MediaGallery(props:{c:DialecticController;active:boolean}){
 const c=props.c;
 const [selected,setSelected]=createSignal<{item:MediaItem;url:string}>();
 const items=createMemo<MediaItem[]>(previous=>{
  const rows=c.rows(),byId=new Map(rows.map(row=>[row.id,row]));
  const caption=(id?:string)=>{const row=id?byId.get(id):undefined;return row?.data.state==='draft'?'Draft':row?`Contribution ${row.data.ordinal}`:'Conversation image';};
  const native:MediaItem[]=c.semanticInventory().media.map(item=>({id:'block:'+item.blockId,blockId:item.blockId,contributionId:item.contributionId,title:String(item.metadata?.alt||item.metadata?.title||item.type.replaceAll('-',' ')),caption:caption(item.contributionId),kind:item.type==='image-block'?'image':item.type==='audio-block'?'audio':'video',url:imageUrl(item.metadata?.url??item.filename),asset:copyAsset(item.asset)}));
  const files:MediaItem[]=rows.flatMap(row=>(row.data.attachments??[]).filter(file=>/^(image|audio|video)\//.test(file.mediaType)).map(file=>({id:'file:'+row.id+':'+file.id,title:file.name,caption:caption(row.id)+(file.origin==='agent'?' · Generated':' · Attached'),kind:file.mediaType.startsWith('image/')?'image':file.mediaType.startsWith('audio/')?'audio':'video',contributionId:row.id,attachment:{...file,asset:{...file.asset}}})));
  // Keep mounted tiles when unrelated semantic metadata changes. Typing does not
  // observe this inventory, and never rebinds images or enumerates the Document.
  const old=new Map(previous?.map(item=>[item.id,item]));
  return [...native,...files].map(item=>{const prior=old.get(item.id);return prior&&prior.title===item.title&&prior.caption===item.caption&&prior.kind===item.kind&&prior.url===item.url&&prior.contributionId===item.contributionId&&prior.asset?.assetId===item.asset?.assetId&&prior.asset?.cavernId===item.asset?.cavernId&&JSON.stringify(prior.attachment)===JSON.stringify(item.attachment)?prior:item;});
 },[]);
 const images=createMemo(()=>items().filter(item=>item.kind==='image')),other=createMemo(()=>items().filter(item=>item.kind!=='image'));
 const showSource=(item:MediaItem)=>{setSelected(undefined);c.showConversation();c.inspect(c.target(item.blockId??item.contributionId!,item.blockId?'block':'contribution'));};
 createEffect(()=>{if(!props.active||selected()&&!images().includes(selected()!.item))setSelected(undefined);});
 return <section class="media-gallery" aria-label="Conversation media gallery">
  <header class="media-gallery-heading"><div><span class="media-gallery-eyebrow">CONVERSATION GALLERY</span><h2>Media</h2><p>A closer look at the images in your conversation.</p></div><span class="media-gallery-count">{images().length} image{images().length===1?'':'s'}</span></header>
  <Show when={images().length} fallback={<div class="media-gallery-empty"><GalleryImageIcon/><h3>Your conversation, in pictures</h3><p>Images shared, generated or fetched in this conversation will appear here.</p></div>}>
   <div class="media-gallery-grid"><For each={images()}>{item=><MediaTile c={c} item={item} active={props.active} open={url=>setSelected({item,url})} source={()=>showSource(item)}/>}</For></div>
  </Show>
  <Show when={other().length}><section class="media-gallery-other"><h3>Video & audio</h3><div class="media-gallery-grid"><For each={other()}>{item=><article class="media-gallery-card"><div class="media-gallery-other-icon" aria-hidden="true">{item.kind==='video'?'▷':'♫'}</div><div class="media-gallery-caption"><small>{item.caption} · {item.kind}</small><h3>{item.title}</h3><button onClick={()=>showSource(item)}>View in Conversation <span aria-hidden="true">↗</span></button></div></article>}</For></div></section></Show>
  <Show when={selected()} keyed>{value=><GalleryPreview value={value} close={()=>setSelected(undefined)} source={()=>showSource(value.item)}/>}</Show>
 </section>;
}

function MediaTile(props:{c:DialecticController;item:MediaItem;active:boolean;open:(url:string)=>void;source:()=>void}){
 let tile!:HTMLElement;
 const [visible,setVisible]=createSignal(false),[url,setUrl]=createSignal(''),[error,setError]=createSignal(''),[loaded,setLoaded]=createSignal(false);
 onMount(()=>{
  if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'180px'});
  observer.observe(tile);onCleanup(()=>observer.disconnect());
 });
 const ready=(image:HTMLImageElement)=>{setUrl(image.currentSrc||image.src);setLoaded(true);setError('');};
 const previewImage=(source:()=>string)=><button class="media-gallery-picture" disabled={!loaded()} aria-label={`Enlarge ${props.item.title}`} onClick={()=>props.open(url())}>
  <img src={source()||undefined} alt={props.item.title} loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={e=>ready(e.currentTarget)} onError={()=>{setLoaded(false);setError('This image is unavailable.');}}/>
  <Show when={loaded()}><span class="media-gallery-enlarge" aria-hidden="true">⤢</span></Show>
 </button>;
 return <article ref={tile} class="media-gallery-card">
  <div class="media-gallery-frame" classList={{'media-gallery-frame-loading':!loaded()&&!error()}}>
   <Show when={props.active&&visible()} fallback={<span class="media-gallery-placeholder"><GalleryImageIcon/></span>}>
    <GalleryImage c={props.c} item={props.item} ready={ready} error={setError} clear={()=>{setLoaded(false);setUrl('');setError('');}} open={()=>props.open(url())} loaded={loaded()} external={previewImage}/>
   </Show>
   <Show when={error()}><div class="media-gallery-unavailable"><GalleryImageIcon/><span>{error()}</span><small>Open its source for image recovery options.</small></div></Show>
  </div>
  <div class="media-gallery-caption"><small>{props.item.caption}</small><h3 title={props.item.title}>{props.item.title}</h3><button onClick={props.source}>View in Conversation <span aria-hidden="true">↗</span></button></div>
 </article>;
}

function GalleryImage(props:{c:DialecticController;item:MediaItem;ready:(image:HTMLImageElement)=>void;error:(message:string)=>void;clear:()=>void;open:()=>void;loaded:boolean;external:(source:()=>string)=>import('solid-js').JSX.Element}){
 const [url,setUrl]=createSignal('');let image!:HTMLImageElement;
 const native=props.item.blockId?props.c.resolve(props.c.target(props.item.blockId,'block')):undefined;
 onCleanup(props.clear);
 onMount(()=>{
  if(props.item.attachment){
   const abort=new AbortController();let object='';
   queueImagePreview(async()=>{if(abort.signal.aborted)return;try{const blob=await props.c.attachmentBlob(props.item.attachment!,abort.signal);if(abort.signal.aborted)return;object=URL.createObjectURL(blob);setUrl(object);}catch(e){if(!abort.signal.aborted)props.error('Image preview could not be loaded.');}});
   onCleanup(()=>{abort.abort();if(object)URL.revokeObjectURL(object);});
  }else if(props.item.asset){
   const observer=new MutationObserver(()=>{if(image.title==='Image unavailable in this Cavern')props.error('Image unavailable in this Cavern.');});observer.observe(image,{attributes:true,attributeFilter:['title']});
   onCleanup(bindCardThumbnail(props.c.editor,image,props.item.asset));onCleanup(()=>observer.disconnect());
  }else if(!props.item.url)props.error('No image source is available.');
 });
 if(props.item.asset||props.item.attachment)return <button class="media-gallery-picture" disabled={!props.loaded} aria-label={`Enlarge ${props.item.title}`} onClick={props.open}><img ref={image} src={url()||undefined} alt={props.item.title} decoding="async" onLoad={e=>props.ready(e.currentTarget)} onError={()=>props.error('This image is unavailable.')}/><Show when={props.loaded}><span class="media-gallery-enlarge" aria-hidden="true">⤢</span></Show></button>;
 return native&&props.c.session()?<ImageSizeGate editor={props.c.editor} projection={props.c.session()!.projection} nodeKey={native.key} source={()=>props.item.url??''} enabled automaticRepair={false}>{props.external}</ImageSizeGate>:props.external(()=>props.item.url??'');
}

function GalleryPreview(props:{value:{item:MediaItem;url:string};close:()=>void;source:()=>void}){
 let dialog!:HTMLDialogElement;
 onMount(()=>dialog.showModal());
 onCleanup(()=>dialog.close());
 return <dialog ref={dialog} class="media-gallery-dialog" aria-label={props.value.item.title} onCancel={e=>{e.preventDefault();props.close();}} onClick={e=>{if(e.target===dialog)props.close();}} onKeyDown={e=>e.stopPropagation()}>
  <div class="media-gallery-lightbox"><header><div><small>{props.value.item.caption}</small><h3>{props.value.item.title}</h3></div><button autofocus aria-label="Close image preview" onClick={props.close}>×</button></header><img src={props.value.url} alt={props.value.item.title} referrerPolicy="no-referrer"/><footer><button onClick={props.source}>View in Conversation ↗</button></footer></div>
 </dialog>;
}
function GalleryImageIcon(){return <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-7 5 8"/></svg>;}
