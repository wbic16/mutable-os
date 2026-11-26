import { documentContextInventory, unavailableDocumentContext, withDocumentContext, withFrozenDocumentContext } from '../interchange/package/document-context';
import { nativeText } from '../persistence/native-resource';
import { nativeDocumentStem } from '../persistence/document-file-names.mjs';
import { validatePackageData } from '../interchange/package/data';
import { resourceSurface } from '../interchange/resource-surface';
import {localSource,type WebFile} from '../web-resources/everyday';
import {webCandidate} from '../web-resources/registry';
import {webBlock} from '../web-resources/block';
import {academicIdentifier,academicJob} from '../academic/identifiers';
import {academicBlock} from '../academic/block';
import {ACADEMIC_BLOCK,type AcademicCapture} from '../academic/model';
import {PDF_BLOCK,type PdfCapture} from '../pdf/model';
import {STRUCTURED_BLOCK} from '../structured/model';
import {pdfBlock} from '../pdf/block';
import type {BlockFragment} from '../block-tree/clipboard';
import {resourceAssets} from '../interchange/package/resources';
import {HttpApplicationServices} from './application-services';
import { inspectUri, urlFragment, videoFragment, type LinkedTextFormat } from '../interchange/uri';
import { emptyFragment } from '../interchange/fragment';
import { nativeBytes } from '../persistence/native-resource';
import { nativeInventory } from '../interchange/package/format';
import { hash, PACKAGE_LIMITS } from '../interchange/package/archive';
import type { PackageData } from '../interchange/package/data';
import { assetKey } from '../interchange/managed-asset';
import { sourceFormat } from '../interchange/source-block';
import { diagnostic } from '../interchange/diagnostics';
import { createSignal } from 'solid-js';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { Destination } from '../block-tree/types';
import type { CrossTextSegment } from '../block-tree/cross-text-edit';
import { resourceOwner, resourceSource } from '../block-tree/resource-identity';
import { serializeSelection, fragmentText } from '../interchange/serializer';
import { documentFragment, joinFragments } from '../interchange/document-import';
import { conversionSource } from '../interchange/conversion';
import { checkFiles, type SuppliedFile } from '../interchange/file-input';
import { safeFilename, type ImportFormat, type ExportFormat } from '../interchange/formats';
import type { MutableFragment, InterchangeScope } from '../interchange/fragment';
import type { InterchangeDiagnostic } from '../interchange/diagnostics';
import { resolveClipboardImages } from '../interchange/clipboard-images';
import { nativeDocumentSession } from '../persistence/native-session';
import { captureNative, admitNative } from '../persistence/native-resource';
import { resourceToRepository } from '../history/durable-core';
import { runInterchange } from './interchange-worker';
import type { AssetLease } from './managed-assets';
export interface ImportHost { current():boolean; open(id:string):void }
interface Ticket { revision:number; session?:string; scope:InterchangeScope; viewId?:string; segments?:CrossTextSegment[]; destination?:Destination; current():boolean }
type Question = {title:string;details:string[];urls?:string[];options?:string[];single?:boolean};
/** Explicit actions only: no repository, selection, layout or typing subscriptions. */
export class DocumentInterchange {
 private alive=true;
 private players=new Map<()=>void,string>();
 registerVideo(viewId:string,unload:()=>void){if(!this.alive){unload();return()=>{};}this.players.set(unload,viewId);return()=>{this.players.delete(unload);};}
 private controller?:AbortController;
 private lease?:AssetLease;
 private committed=false;
 private activeTicket?:Ticket;
 private pickerView?:string;
 readonly teiEnabled=()=>this.editor.features.teiImport;
 private detailSignal=createSignal<string[]>([]);readonly details=this.detailSignal[0];
 private status=createSignal(''); readonly message=this.status[0];
 private busySignal=createSignal(false); readonly busy=this.busySignal[0];
 private questionSignal=createSignal<Question>(); readonly question=this.questionSignal[0];
 private answer?: (value:string[]|undefined)=>void;
 private pickerSignal=createSignal<{title:string;fullDocument?:boolean;embed?:boolean;package?:boolean;link?:boolean;sourceFormat?:'html'|'markdown'|'tei';run:(files:SuppliedFile[],format?:ImportFormat)=>void}>();readonly picker=this.pickerSignal[0];
 constructor(private editor:ReactiveEditor){}
 respond(value:string[]|undefined){if(value===undefined)this.controller?.abort();this.answer?.(value);}
 closePicker(){this.pickerSignal[1](undefined);this.pickerView=undefined;}
 cancel(){this.controller?.abort();this.respond(undefined);this.closePicker();}
 dismiss(){if(this.busy())this.cancel();this.status[1]('');this.detailSignal[1]([]);}
 private async ask(question:Question){this.questionSignal[1](question);try{return await new Promise<string[]|undefined>(resolve=>{this.answer=resolve;});}finally{this.answer=undefined;this.questionSignal[1](undefined);}}
 private async confirm(diagnostics:InterchangeDiagnostic[]) {const details=[...new Set(diagnostics.filter(d=>d.loss).map(d=>`${d.sourceName?d.sourceName+': ':''}${d.detail}`))];if(details.length&&(await this.ask({title:'Confirm conversion losses',details:details.length>50?[...details.slice(0,50),`${details.length-50} further unsupported semantics are omitted from this projection.`]:details}))===undefined)throw Error('Operation cancelled.');}
 private base(current:()=>boolean=()=>true):Ticket {const context=this.editor.readAssetContext();return {revision:this.editor.repository.state.revision,session:context.session,scope:{...(context.cavernId?{cavernId:context.cavernId}:{})},current};}
 private valid(t:Ticket){const context=this.editor.readAssetContext();return this.alive&&!this.controller?.signal.aborted&&t.current()&&t.revision===this.editor.repository.state.revision&&t.session===context.session&&t.scope.cavernId===context.cavernId&&(!t.viewId||this.editor.projections.has(t.viewId));}
 closeView(viewId:string){for(const [stop,view] of this.players)if(view===viewId)stop();if(this.activeTicket?.viewId===viewId||this.pickerView===viewId){this.cancel();this.status[1]('The view closed; operation cancelled.');}}
 cancelUnavailable(){if(this.activeTicket&&!this.activeTicket.current())this.cancel();}
 private check(t:Ticket){this.activeTicket=t;if(!this.valid(t))throw Error('The destination, Document or Cavern changed. Nothing further was inserted.');}
 private async task(run:(signal:AbortSignal)=>Promise<void>){
  if(!this.alive||!this.editor.features.documentInterchange)return;
  if(this.busy()){this.status[1]('Finish or cancel the current interchange operation first.');return;}
  this.busySignal[1](true);this.controller=new AbortController();this.committed=false;this.lease=undefined;this.status[1]('Preparing interchange…');this.detailSignal[1]([]);
  try{await run(this.controller.signal);}catch(e){this.status[1](e instanceof Error?e.message:String(e));}
  finally{if(this.lease)await this.editor.assets.action(this.lease,this.committed?'finish':'abort').catch(()=>{});this.lease=undefined;this.controller=undefined;this.activeTicket=undefined;this.busySignal[1](false);}
 }
 private selection(key:string):Ticket {
  const node=this.editor.node(key),mount=this.editor.mounts.get(key);if(!node||!mount||mount.composing)throw Error('Choose a mounted text selection first.');
  const menu=this.editor.overlays.overlays.find(o=>o.viewType==='context-menu'&&o.ownerKey===key);
  const local=menu?.returnInlineSelection??mount.captureInlineSelection?.();
  if(menu)this.editor.overlays.close(menu.key,false);
  mount.focus();if(local)mount.restoreInlineSelection?.(local);
  const t=this.base();t.viewId=node.viewId;
  const owner=resourceOwner(this.editor.repository.readState(),node.contentKey);const resourceId=owner?resourceSource(owner)?.resourceId:undefined;if(resourceId)t.scope.resourceId=resourceId;
  if(this.editor.selections.sets[key]?.items.length>1)throw Error('Choose one contiguous selection.');
  const cross=this.editor.crossText.range();
  if(cross)t.segments=this.editor.crossText.resolve(cross.anchor,cross.head).map(s=>({placementKey:this.editor.node(s.nodeKey)!.placementKey,start:s.start,end:s.end}));
  else if(node.viewType==='standoff-editor-block'&&local)t.segments=[{placementKey:node.placementKey,start:Math.min(local.anchor,local.head),end:Math.max(local.anchor,local.head)}];
  else throw Error('Choose a text caret or selection first.');
  const signature=JSON.stringify(cross??local);
  t.current=()=>{if(!this.editor.node(key)||this.editor.mounts.get(key)?.composing)return false;const active=this.editor.crossText.range();if(cross||active)return JSON.stringify(active)===signature;const handle=this.editor.mounts.get(key),focused=this.editor.mounts.resolveElement(document.activeElement);if(focused&&focused.nodeKey!==key)return false;return !handle?.root.contains(document.activeElement)||JSON.stringify(handle.captureInlineSelection?.())===signature;};
  return t;
 }
 private async admit(fragment:MutableFragment,files:SuppliedFile[],t:Ticket,signal:AbortSignal){
  this.check(t);
  for(const block of fragment.blocks)if(block.type===ACADEMIC_BLOCK&&block.data.importFileIndex!==undefined){
   if(!this.editor.features.deterministicAcademicResources)throw Error('Academic resources are disabled');const capture=block.data.academic as AcademicCapture,file=files[Number(block.data.importFileIndex)];if(!file)throw Error('Missing academic original');
   const media=capture.format==='epub'?'application/epub+zip':capture.format==='bibtex'?'application/x-bibtex':capture.format==='ris'?'application/x-research-info-systems':'application/xml';
   const ref={...capture.asset,cavernId:t.scope.cavernId!};const existing=await this.editor.assets.verify(ref,signal).catch(()=>undefined);this.check(t);
   if(!existing){const lease=await this.editor.assets.begin([],signal);let done=false;try{const m=await this.editor.assets.stageOriginal(lease,new Blob([file.blob],{type:media}),signal);this.check(t);if(m.assetId!==ref.assetId)throw Error('Original hash mismatch');await this.editor.assets.action(lease,'publish',signal);await this.editor.assets.action(lease,'finish',signal);done=true;}finally{if(!done)await this.editor.assets.action(lease,'abort').catch(()=>{});}}
   capture.asset=ref;delete block.data.importFileIndex;
  }
  for(const block of fragment.blocks)if(block.type===PDF_BLOCK&&block.data.importFileIndex!==undefined){
   if(!this.editor.features.crossResourceLoaders)throw Error('PDF resources are disabled');const capture=block.data.pdf as PdfCapture,file=files[Number(block.data.importFileIndex)];if(!file)throw Error('Missing PDF original');
   const ref={...capture.asset,cavernId:t.scope.cavernId!};const existing=await this.editor.assets.verify(ref,signal).catch(()=>undefined);this.check(t);
   if(!existing){const lease=await this.editor.assets.begin([],signal);let done=false;try{const m=await this.editor.assets.stageOriginal(lease,new Blob([file.blob],{type:'application/pdf'}),signal);this.check(t);if(m.assetId!==ref.assetId)throw Error('Original hash mismatch');await this.editor.assets.action(lease,'publish',signal);await this.editor.assets.action(lease,'finish',signal);done=true;}finally{if(!done)await this.editor.assets.action(lease,'abort').catch(()=>{});}}
   capture.asset=ref;delete block.data.importFileIndex;
  }
  for(const block of fragment.blocks)if(block.type===STRUCTURED_BLOCK&&!block.data.asset){
   if(!this.editor.features.structuredResources)throw Error('Read-only resources are disabled.');
   const file=files[Number(block.data.importFileIndex)];if(!file)throw Error('Original resource file is unavailable.');
   const ref={kind:'managed' as const,cavernId:t.scope.cavernId!,assetId:'sha256:'+(block.data.structured as any).byteHash};
   const existing=await this.editor.assets.verify(ref,signal).catch(()=>undefined);this.check(t);if(existing){block.data.asset=ref;delete block.data.importFileIndex;continue;}
   const lease=await this.editor.assets.begin([],signal);let done=false;try{const m=await this.editor.assets.stageOriginal(lease,new Blob([file.blob],{type:'text/plain'}),signal);this.check(t);await this.editor.assets.action(lease,'publish',signal);await this.editor.assets.action(lease,'finish',signal);done=true;block.data.asset={kind:'managed',cavernId:t.scope.cavernId!,assetId:m.assetId};delete block.data.importFileIndex;}finally{if(!done)await this.editor.assets.action(lease,'abort').catch(()=>{});}
  }
  if(!fragment.embeds.length)return {fragment,admitted:[] as [string,string][]};
  const result=await resolveClipboardImages({fragment,files,assets:this.editor.assets,cavernId:t.scope.cavernId,signal,valid:()=>this.valid(t),lease:value=>{this.lease=value;},choose:urls=>this.ask({title:'External images',details:['Download only explicitly selected remote images, or keep inert placeholders. Relative resources are never read automatically.'],urls})});
  this.check(t);return result;
 }
 async importAcademicSource(key:string,source:string){return this.task(async signal=>{
  if(!this.editor.features.deterministicAcademicResources)throw Error('Academic handlers disabled');const resume=academicJob(source),identity=academicIdentifier(source);if(!identity&&!resume)throw Error('Unrecognised academic identifier');const node=this.editor.node(key);if(!node)throw Error('Destination unavailable');
  const t=node.viewType==='standoff-editor-block'?this.selection(key):this.base(()=>!!this.editor.node(key));if(!t.segments){t.viewId=node.viewId;t.destination={kind:'after',anchorKey:node.placementKey};}this.check(t);
  if(await this.ask({title:'Import academic resource',details:[resume?'Resume retained academic job '+resume:`${identity!.family}: ${identity!.key}`,identity?.url??source,'Acquire the public metadata record (for PMC, the converter, associated citation and up to three version metadata records). The provider receives this request. It remains unreviewed source data; no canonical entity, identity merge or full-text download is automatic.']})===undefined)throw Error('Acquisition cancelled');this.check(t);
  const api=new HttpApplicationServices(()=>{const c=this.editor.readAssetContext();if(!c.cavernId||!c.session)throw Error('Open a Vault');return {cavernId:c.cavernId,session:c.session};});const result=resume?await api.call('deterministic.resume',{id:resume},signal):await api.call('deterministic.import',{id:crypto.randomUUID(),source},signal);this.check(t);
  if(await this.ask({title:'Review imported metadata',details:[result.capture.projection.title,...result.capture.projection.diagnostics,'Insert retained source representation; save the document manually.']})===undefined)throw Error('Insertion cancelled; original retained');this.check(t);
  const p=academicBlock(result.capture);p.fragment.blocks[0].data.academicJobId=result.jobId;await this.commit(p.fragment,[],t,signal,'import');this.status[1]('Academic source inserted. Canonical assertions remain unreviewed. Save explicitly.');
 });}
 async importWebResource(key:string,source:string){return this.task(async signal=>{
  if(!this.editor.features.webResourceViewers)throw Error('Web viewers disabled');const node=this.editor.node(key);if(!node)throw Error('Destination unavailable');
  const t=node.viewType==='standoff-editor-block'?this.selection(key):this.base(()=>!!this.editor.node(key));if(!t.segments){t.viewId=node.viewId;t.destination=node.viewType==='document-block'?{kind:'at',parentKey:node.placementKey,index:node.children.length}:{kind:'after',anchorKey:node.placementKey};}
  await this.captureWeb(source,t,signal);
 });}
 private async captureWeb(source:string,t:Ticket,signal:AbortSignal,options?:{file?:WebFile;format?:'feed';prepare?:boolean}){
  this.check(t);const resume=/^mutable-web-job:([a-f0-9-]{36})$/i.exec(source.trim());
  if(!resume&&!options?.file&&!options?.format&&!webCandidate(source))throw Error('Use the specialized resource importer');
  if(await this.ask({title:'Capture web preview?',details:[options?.file?'Selected local file: '+options.file.name:source,options?.file?'Retain this original UTF-8 event/feed file. No external resources, alarms or media will be loaded.':'Where supported, acquire one public page or post metadata response through protected HTTPS; the provider receives the request, including URL query values. URL-only cards, including Google Maps locations, make no acquisition request. No cookies, scripts, images or interactive embeds are loaded. Confirm permission to retain the metadata; it remains unreviewed.']})===undefined)throw Error('Capture cancelled');this.check(t);
  const api=new HttpApplicationServices(()=>{const c=this.editor.readAssetContext();if(!c.cavernId||!c.session)throw Error('Open a Vault');return {cavernId:c.cavernId,session:c.session};});
  const result=resume?await api.call('web.resume',{id:resume[1]},signal):await api.call('web.import',{id:crypto.randomUUID(),source,everyday:this.editor.features.everydayWebResources,...(options?.file?{file:options.file}:{}),...(options?.format?{format:options.format}:{})},signal);this.check(t);const p=result.capture.projection;
  if(await this.ask({title:'Review web preview',details:[p.title??p.location?.query??p.social?.author??result.capture.source,`Provider: ${p.provider}; ${p.status}`,p.description??p.social?.text??'No description supplied.',...(p.social?.handle?[p.social.handle]:[]),...(p.everyday?.fields.map(f=>f.label+': '+f.value)??[]),...(p.everyday?.items.slice(0,3).map(i=>i.title??'Untitled component')??[]),...p.diagnostics,'Insert this captured preview as one undoable Block. Interactive content is optional and off by default. Save manually.']})===undefined)throw Error('Insertion cancelled; capture retained');this.check(t);
  const f=webBlock(result.capture);f.blocks[0].data.webJobId=result.jobId;
  if(p.image&&!options?.prepare&&this.editor.features.managedAssetClipboard){const choice=await this.ask({title:'Optional preview image',details:[p.image,'Only retain this PNG/JPEG if you have permission. A metadata image URL does not establish archival rights. Keep the text-only preview otherwise.'],options:['Keep text-only preview','Download permitted thumbnail'],single:true});if(!choice)throw Error('Insertion cancelled');this.check(t);if(choice[0]==='Download permitted thumbnail'){const imageUrl=new URL(p.image);imageUrl.hash='';const lease=await this.editor.assets.begin([imageUrl.href],signal);this.lease=lease;const a=await this.editor.assets.remote(lease,imageUrl.href,signal);this.check(t);await this.editor.assets.action(lease,'publish',signal);f.blocks[0].data.webThumbnail={kind:'managed',cavernId:a.cavernId,assetId:a.assetId};}}
  this.check(t);if(options?.prepare)return f;await this.commit(f,[],t,signal,'import');this.status[1]('Captured web preview inserted. Save explicitly; live content remains unloaded.');
 }
 async importBibliographyText(key:string,source:string,format:'bibtex'|'ris'){const t=this.selection(key);return this.insertFiles([{name:'Clipboard.'+(format==='bibtex'?'bib':'ris'),blob:new Blob([source],{type:'text/plain'})}],t,'academic');}
 /** Explicit context action. Classification and choosing link/video do not acquire anything. */
 async inspectLinkedResource(key:string,value:string){if(this.editor.features.webResourceViewers&&/^mutable-web-job:[a-f0-9-]{36}$/i.test(value.trim()))return this.importWebResource(key,value);if(this.editor.features.deterministicAcademicResources&&(academicIdentifier(value)||academicJob(value)))return this.importAcademicSource(key,value);return this.task(async signal=>{
  const info=inspectUri(value),node=this.editor.node(key);if(!node)throw Error('Destination is unavailable.');
  const t=node.viewType==='standoff-editor-block'?this.selection(key):this.base(()=>!!this.editor.node(key)&&!this.editor.mounts.get(key)?.composing);
  if(!t.segments){t.viewId=node.viewId;t.destination=node.viewType==='document-block'?{kind:'at',parentKey:node.placementKey,index:node.children.length}:{kind:'after',anchorKey:node.placementKey};}
  this.check(t);
  const choices=[{label:'Insert URL link (no network)',kind:'url'},...(this.editor.features.webResourceViewers&&webCandidate(value)?[{label:'Capture native web preview',kind:'web'}]:[]),...(this.editor.features.webResourceViewers&&this.editor.features.everydayWebResources&&info.acquirable&&(webCandidate(value)||/\.xml(?:[?#]|$)/i.test(value))?[{label:'Capture podcast feed (RSS / Atom)',kind:'feed'}]:[]),...(info.video?[{label:'Insert VideoBlock (loads player)',kind:'video'}]:[]),
   ...(info.acquirable?[...(this.editor.features.deterministicAcademicResources?[{label:'Import retained ALTO / PAGE XML',kind:'ocr'}]:[]),...(this.editor.features.crossResourceLoaders?[{label:'Import managed PDF original',kind:'pdf'}]:[]),...[info.format,...(['html','markdown','text'] as const).filter(f=>f!==info.format)].map(format=>({label:`Import ${format} as native Ink at the destination`,kind:'native',format})),
   ...(['html','markdown'] as const).flatMap(format=>[{label:`Embed ${format} source copy`,kind:'embed',format},{label:`Link ${format} source snapshot (explicit refresh)`,kind:'link',format}]),{label:'Import PNG/JPEG image',kind:'image'}]:[])];
  const selection=await this.ask({title:'Inspect / Import linked resource',details:[info.url,info.video?`Recognized ${info.video.provider} video. No provider has been contacted.`:'Syntax inspected locally. No resource has been contacted.', 'Choose one operation. Import creates Ink content; embed owns a source copy; link retains an explicit refresh URL. No operation overwrites the external source.',...(info.acquirable?[]:['Acquisition requires HTTPS port 443 without a fragment. This URL can still be inserted as a link.'])],options:choices.map(c=>c.label),single:true});
  if(!selection)throw Error('URI operation cancelled.');const chosen=choices.find(c=>c.label===selection[0]);if(selection.length!==1||!chosen)throw Error('Choose exactly one URI operation.');this.check(t);
  if(chosen.kind==='url'||chosen.kind==='video'){await this.commit(chosen.kind==='url'?urlFragment(info.url):videoFragment(info.video!),[],t,signal,'import');this.status[1](chosen.kind==='video'?'Inserted VideoBlock; the player loads automatically. Save Ink explicitly to retain it.':'Inserted without contacting the resource. Save Ink explicitly to retain it.');return;}
  if(chosen.kind==='web'||chosen.kind==='feed'){await this.captureWeb(value,t,signal,chosen.kind==='feed'?{format:'feed'}:undefined);return;}
  if(chosen.kind==='ocr'){
   if(await this.ask({title:'Acquire OCR XML?',details:[info.url,'Retain one bounded ALTO or PAGE XML original. No XML entities, images or other linked resources will be fetched.']})===undefined)throw Error('Acquisition cancelled');this.check(t);const api=new HttpApplicationServices(()=>{const c=this.editor.readAssetContext();if(!c.cavernId||!c.session)throw Error('Open a Vault');return {cavernId:c.cavernId,session:c.session};});const r=await api.call('deterministic.xml',{id:crypto.randomUUID(),source:info.url},signal);this.check(t);if(await this.ask({title:'Review OCR source',details:[r.capture.projection.title,...r.capture.projection.diagnostics]})===undefined)throw Error('Insertion cancelled; original retained');const p=academicBlock(r.capture);await this.commit(p.fragment,[],t,signal,'import');return;
  }
  if(chosen.kind==='pdf'){
   if(await this.ask({title:'Acquire managed PDF?',details:[info.url,'Download and retain this original (maximum 50 MiB / 1,000 pages). The provider receives this explicit request, without cookies or credentials. Confirm you have access and permission to retain it. Work relationships remain separate reviewed Claims.']})===undefined)throw Error('PDF acquisition cancelled');this.check(t);
   const api=new HttpApplicationServices(()=>{const c=this.editor.readAssetContext();if(!c.cavernId||!c.session)throw Error('Open a Vault');return {cavernId:c.cavernId,session:c.session};}),result=await api.call('pdf.import',{id:crypto.randomUUID(),source:info.url},signal);this.check(t);const p=pdfBlock(result.snapshot,info.url);await this.commit(p.fragment,[],t,signal,'import',p.native);this.status[1]('Retained PDF inserted. Review any Work relationship separately and save the document explicitly.');return;
  }
  if(chosen.kind==='image'){
   const f=emptyFragment(),text=urlFragment(info.url);f.blocks=text.blocks;f.placements=text.placements;f.roots=text.roots;
   f.blocks[0].inline={atoms:[{kind:'embed',embed:'remote-image'}],properties:[]};
   f.embeds=[{localId:'remote-image',type:'image-cell',data:{alt:'Linked image',src:''},asset:{kind:'local',object:'asset',id:'remote-asset'}}];f.assets=[{localId:'remote-asset',source:{kind:'remote',url:info.url}}];
   const admitted=await this.admit(f,[],t,signal);await this.commit(admitted.fragment,admitted.admitted,t,signal,'import');this.status[1]('Inserted image or inert placeholder. Save Ink explicitly.');return;
  }
  const format=('format' in chosen?chosen.format:undefined) as LinkedTextFormat;
  const resource=await this.acquireLinkedText(info.url,format,t,signal);
  const result=await runInterchange({kind:'linked-text',resource,mode:chosen.kind as 'native'|'embed'|'link'},signal);this.check(t);await this.confirm(result.diagnostics);this.check(t);
  const admitted=await this.admit(result.fragment,[],t,signal);await this.commit(admitted.fragment,admitted.admitted,t,signal,'import');
  this.status[1]('Imported linked content. Save Ink explicitly; the external source is unchanged.');
 });}
 private async acquireLinkedText(url:string,format:LinkedTextFormat,t:Ticket,signal:AbortSignal){
  if(!inspectUri(url).acquirable)throw Error('Linked acquisition requires HTTPS port 443 without credentials or fragments.');
  if(await this.ask({title:'Allow linked-resource acquisition?',details:[url,`Fetch one ${format} resource into this Cavern. The remote server receives the request from this app’s server; it may contain private URL query values. No cookies or credentials are sent.`, 'Only same-origin redirects are allowed. Images require separate consent. No scripts, crawling, or video downloads.']})===undefined)throw Error('Acquisition cancelled.');this.check(t);
  const lease=await this.editor.assets.beginText(url,format,signal);
  try{this.check(t);const resource=await this.editor.assets.acquireText(lease,url,format,signal);this.check(t);return resource;}
  finally{await this.editor.assets.action(lease,'abort').catch(()=>{});}
 }
 async refreshRemoteSource(key:string){return this.task(async signal=>{
  const node=this.editor.node(key);if(!node||this.editor.mounts.get(key)?.composing)throw Error('Finish source editing before refresh.');
  const t=this.base(()=>!!this.editor.node(key)&&!this.editor.mounts.get(key)?.composing);t.viewId=node.viewId;this.check(t);
  const meta=structuredClone(this.editor.repository.readState().contents[node.contentKey].payload.metadata as any??{}),baseline=meta.sourceLink,format=sourceFormat(node.viewType,node.payload);
  if(baseline?.version!==1||typeof baseline.url!=='string'||typeof baseline.byteHash!=='string'||typeof baseline.textHash!=='string'||baseline.format!==format)throw Error('Invalid remote source baseline.');
  const resource=await this.acquireLinkedText(baseline.url,format,t,signal);
  if(resource.byteHash===baseline.byteHash){this.status[1]('Source bytes are unchanged; local edits were retained.');return;}
  const result=await runInterchange({kind:'linked-text',resource,mode:'link'},signal);this.check(t);
  const incoming=result.fragment.blocks[0],nextMeta=incoming.data.metadata as any,current=String(node.payload.text),conflict=await hash(new TextEncoder().encode(current))!==baseline.textHash;this.check(t);
  const choice=await this.ask({title:conflict?'Source and local text have changed':'Review source refresh',details:[resource.url,`Local text: ${current.slice(0,600)}`,`Incoming source: ${resource.source.slice(0,600)}`,'Replace restores text and baseline together with Undo. Insert separate preserves this Block.'],options:['Replace this source Block','Insert as a separate linked Block'],single:true});
  if(!choice)throw Error('Refresh cancelled.');this.check(t);
  if(choice.length!==1)throw Error('Choose exactly one refresh action.');
  if(choice[0]==='Insert as a separate linked Block'){t.destination={kind:'after',anchorKey:node.placementKey};await this.commit(result.fragment,[],t,signal,'import');}
  else if(choice[0]==='Replace this source Block'){this.editor.commands.transaction('Refresh remote source',()=>{this.editor.commands.setPayloadField(key,'text',incoming.data.text);this.editor.commands.setPayloadField(key,'metadata',{...meta,...nextMeta,sourceLink:{...nextMeta.sourceLink,linkId:baseline.linkId}});},{commandId:'interchange.refresh-source',subjects:[]});this.committed=true;}
  else throw Error('Unknown refresh action.');
  this.status[1]('Refreshed source snapshot. Save Ink explicitly; the external source is unchanged.');
 });}
 pickTei(host:ImportHost){if(!this.editor.features.documentInterchange||!this.editor.features.teiImport)return;this.pickerView=undefined;this.pickerSignal[1]({title:'Open TEI XML',fullDocument:true,sourceFormat:'tei',run:files=>{this.closePicker();void this.importNew(files,host,'tei');}});}
 pickNew(host:ImportHost){if(!this.editor.features.documentInterchange)return;this.pickerView=undefined;this.pickerSignal[1]({title:'Import external files as new Ink documents',fullDocument:true,run:(files,format)=>{this.closePicker();void this.importNew(files,host,format);}});}
 pickInsert(key:string){try{const t=this.selection(key);this.pickerView=t.viewId;this.pickerSignal[1]({title:'Insert external files at the captured selection',run:(files,format)=>{this.closePicker();void this.insertFiles(files,t,format);}});}catch(e){this.status[1](String(e));}}
 pickEmbed(key:string,link=false){
  if(!this.editor.features.documentInterchange)return;
  try{const node=this.editor.node(key);if(!node||this.editor.mounts.get(key)?.composing)throw Error('Finish editing the source before embedding.');
   const t=this.base(()=>!!this.editor.node(key)&&!this.editor.mounts.get(key)?.composing);t.viewId=node.viewId;
   t.destination=node.viewType==='document-block'?{kind:'at',parentKey:node.placementKey,index:node.children.length}:{kind:'after',anchorKey:node.placementKey};
   this.pickerView=t.viewId;this.pickerSignal[1]({title:link?'Link to a local HTML or Markdown source':'Embed HTML or Markdown source as a Block',embed:true,link,run:(files,format)=>{this.closePicker();void this.task(async signal=>{
    this.check(t);const fragments=await runInterchange({kind:'embed',files,format},signal);this.check(t);
    if(link){if(fragments.length!==1)throw Error('Choose one local source file.');const b=fragments[0].blocks[0],meta=b.data.metadata as any;meta.sourceLink={version:1,linkId:crypto.randomUUID(),filename:meta.provenance.filename,format:meta.provenance.format??sourceFormat(b.type,b.data),byteHash:meta.provenance.byteHash,textHash:await hash(new TextEncoder().encode(String(b.data.text)))};}
    await this.commit(joinFragments(fragments),[],t,signal,'import');this.status[1](link?'Linked a local source snapshot. Refresh requires explicit file reselection. Save Ink to retain the link.':'Embedded an independent source copy. Save the Ink document to retain it. The external file is unchanged.');
   });}});
  }catch(e){this.status[1](String(e));}
 }
 refreshSource(key:string){
  if((this.editor.node(key)?.payload.metadata as any)?.sourceLink?.url){void this.refreshRemoteSource(key);return;}
  if(!this.editor.features.documentInterchange)return;
  try{const node=this.editor.node(key);if(!node||this.editor.mounts.get(key)?.composing)throw Error('Finish source editing before refresh.');
   const t=this.base(()=>!!this.editor.node(key)&&!this.editor.mounts.get(key)?.composing);t.viewId=node.viewId;this.pickerView=node.viewId;
   this.pickerSignal[1]({title:'Reconnect local source for explicit refresh',embed:true,link:true,sourceFormat:sourceFormat(node.viewType,node.payload),run:files=>{this.closePicker();void this.task(async signal=>{
    this.check(t);if(files.length!==1)throw Error('Choose one source file.');const original=this.editor.node(key)!,meta=structuredClone(this.editor.repository.readState().contents[original.contentKey].payload.metadata as any??{}),baseline=meta.sourceLink;
    if(baseline?.version!==1||typeof baseline.byteHash!=='string'||typeof baseline.textHash!=='string')throw Error('This Block has no valid linked source baseline.');
    const [f]=await runInterchange({kind:'embed',files,format:sourceFormat(original.viewType,original.payload)},signal);this.check(t);const b=f.blocks[0],incoming=b.data.metadata as any;
    if(await this.ask({title:'Confirm source reconnection',details:[`Previous source: ${baseline.filename}. Selected file: ${files[0].name}. A filename does not prove source identity. Continue only to explicitly rebind this link to the selected file.`]})===undefined)throw Error('Refresh cancelled.');this.check(t);
    const current=String(original.payload.text),localHash=await hash(new TextEncoder().encode(current));this.check(t);
    if(incoming.provenance.byteHash===baseline.byteHash){if(incoming.provenance.filename!==baseline.filename){this.editor.commands.setPayloadField(key,'metadata',{...meta,provenance:incoming.provenance,sourceLink:{...baseline,filename:incoming.provenance.filename}},'Reconnect identical source');this.committed=true;}this.status[1]('Source bytes are unchanged; local edits were retained.');return;}
    const conflict=localHash!==baseline.textHash;
    const choice=await this.ask({title:conflict?'Source and local text have changed':'Review source refresh',details:[`Local text (${current.length} characters):\n${current.slice(0,600)}${current.length>600?'…':''}`,`Selected source (${String(b.data.text).length} characters):\n${String(b.data.text).slice(0,600)}${String(b.data.text).length>600?'…':''}`,conflict?'Choose exactly one action; Cancel leaves both unchanged.':'Continue replaces this source snapshot. Undo restores text and the accepted baseline together.'],...(conflict?{options:['Replace this source Block','Insert as a separate linked Block']}: {})});
    if(choice===undefined)throw Error('Refresh cancelled.');if(conflict&&choice.length!==1)throw Error('Choose exactly one conflict action.');this.check(t);
    const nextLink={version:1,linkId:baseline.linkId,filename:incoming.provenance.filename,format:baseline.format,byteHash:incoming.provenance.byteHash,textHash:await hash(new TextEncoder().encode(String(b.data.text)))};this.check(t);
    if(choice.includes('Insert as a separate linked Block')){incoming.sourceLink={...nextLink,linkId:crypto.randomUUID()};t.destination={kind:'after',anchorKey:original.placementKey};await this.commit(f,[],t,signal,'import');}
    else {this.editor.commands.transaction('Refresh linked source',()=>{this.editor.commands.setPayloadField(key,'text',b.data.text);this.editor.commands.setPayloadField(key,'metadata',{...meta,provenance:incoming.provenance,sourceLink:nextLink});},{commandId:'interchange.refresh-source',subjects:[]});this.committed=true;}
    this.status[1]('Refreshed local source snapshot. Save Ink explicitly; the external file is unchanged.');
   });}});
  }catch(error){this.status[1](String(error));}
 }
 async convertSourceBlock(key:string){return this.task(async signal=>{
  const node=this.editor.node(key),mount=this.editor.mounts.get(key);if(!node||mount?.composing)throw Error('Finish source editing before conversion.');
  const state=this.editor.repository.readState(),content=state.contents[node.contentKey],placement=state.placements[node.placementKey];
  const article=content.viewType==='mutable/web-article-block';
  const format=article?'html':sourceFormat(content.viewType,content.payload);
  if(placement.kind!=='owned'||placement.externalReference||placement.resolvedReference||Object.values(state.placements).filter(p=>p.contentKey===content.key).length!==1)throw Error('Shared or referenced source Blocks must be detached before conversion.');
  if(content.children.length||Object.keys(content.ownedRelations).length||Object.keys(content.opaqueRelations).length)throw Error('Move child and related Blocks outside the source Block before conversion.');
  const parent=Object.values(state.contents).find(c=>c.children.includes(placement.key));if(!parent)throw Error('Only a whole source Block in an ordinary child slot can be converted.');
  const t=this.base(()=>!!this.editor.node(key)&&!this.editor.mounts.get(key)?.composing);t.viewId=node.viewId;
  const owner=resourceOwner(state,node.contentKey);if(owner)t.scope.resourceId=resourceSource(owner)?.resourceId;
  this.check(t);const converted=await runInterchange({kind:'convert',source:String(content.payload.text),format},signal);this.check(t);
  if(article){for(const block of converted.fragment.blocks)block.data={...block.data,metadata:{...((block.data.metadata as any)??{}),provenance:(content.payload.metadata as any)?.provenance}};}
  const losses=[diagnostic('source-conversion',article?'The captured article becomes native Ink with retained source/snapshot provenance. Images and active content remain omitted. Undo restores the captured article exactly.':'The source Block becomes native Ink. Source syntax, source metadata and any Block or inactive annotations are replaced; Undo restores the original Block exactly.'),...converted.diagnostics];
  await this.confirm(losses);this.check(t);const admitted=await this.admit(converted.fragment,[],t,signal);
  const native=await runInterchange({kind:'materialize',fragment:admitted.fragment,scope:t.scope,assets:admitted.admitted},signal);this.check(t);
  const roots=this.editor.commands.replaceSourceWithFragment(native,placement.key);
  this.committed=true;this.status[1]('Converted the whole source Block. Undo restores the original source, identity and metadata.');
  queueMicrotask(()=>{if(!this.alive)return;const next=this.editor.nodeForPlacementInView(roots[0],node.viewId);if(next)this.editor.focus.request(next.key,{reason:'context-menu',caret:'start'});});
 });}
 readonly everydayFiles=()=>this.editor.features.webResourceViewers&&this.editor.features.everydayWebResources;
 private isWebFile(file:SuppliedFile,format?:ImportFormat){return this.everydayFiles()&&!format&&/\.(ics|rss|atom)$/i.test(file.name);}
 private async prepareWebFile(file:SuppliedFile,t:Ticket,signal:AbortSignal){
  if(file.blob.size>2*1024*1024)throw Error('Event/feed files are limited to 2 MiB');const bytes=new Uint8Array(await file.blob.arrayBuffer());this.check(t);
  const body=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes),source=localSource(file.name),fragment=(await this.captureWeb(source,t,signal,{file:{name:file.name,body,format:/\.ics$/i.test(file.name)?'calendar':'feed'},prepare:true}))!;
  const title=safeFilename(file.name.replace(/\.(ics|rss|atom)$/i,''));return {fragment,title,filename:title+'.ink',diagnostics:[] as InterchangeDiagnostic[],provenance:{version:1,filename:file.name,format:'web-resource',byteHash:await hash(bytes)}};
 }
 async importNew(files:SuppliedFile[],host:ImportHost,format?:ImportFormat){return this.task(async signal=>{
  if(!this.editor.features.nativeDocumentPersistence)throw Error('Native document persistence is required for new Ink imports.');
  const isTei=(file:SuppliedFile)=>format==='tei'||!format&&/\.tei$/i.test(file.name);
  if(!files.length||files.length>20)throw Error('Choose 1–20 files.');
  const ordinary=files.filter(file=>!isTei(file));if(ordinary.length)checkFiles(ordinary);
  if(files.reduce((n,f)=>n+f.blob.size,0)>Math.max(40*1024*1024,this.editor.teiImportLimits.bytes*4))throw Error('Selected files exceed the import batch byte budget.');
  const ticket=this.base(host.current),outcomes:string[]=[];
  for(const file of files){
   this.check(ticket);this.committed=false;this.lease=undefined;
   try{
    if(isTei(file)) {
     if(!this.editor.features.teiImport)throw Error('TEI import is disabled.');
     if(/\.(ink|phosphor|mutable\.json)$/i.test(file.name))throw Error('Open existing native Ink files through the native document workflow.');
     const prepared=await runInterchange({kind:'tei-document',file,limits:this.editor.teiImportLimits,semanticSublimation:this.editor.features.teiSemanticSublimation,operationalSemantics:this.editor.features.teiOperationalSemantics,inlineAlternatives:this.editor.features.inlineAlternatives&&this.editor.features.compactCanonicalText},signal);this.check(ticket);
     const state=this.editor.repository.readState(),workspace=state.contents[state.placements[state.rootPlacementKey].contentKey];
     const banks=workspace.children.map(k=>state.contents[state.placements[k].contentKey]).filter(c=>c.viewType==='workspace-object-bank-block');
     if(banks.length>1)throw Error('Ambiguous workspace object bank.');
     // The Workspace menu is usable before Flint or any Document has opened.
     // Provision its owner only after preparation and the stale-result check.
     const createdBank=!banks.length?this.editor.commands.insert({id:crypto.randomUUID(),type:'workspace-object-bank-block',children:[]},{kind:'at',parentKey:state.rootPlacementKey,index:workspace.children.length}):undefined;
     try {
      const bankKey=banks[0]?.key??this.editor.repository.state.placements[createdBank!].contentKey;
      admitNative(this.editor.repository,prepared.bytes,bankKey);this.committed=true;
     } finally {
      if(createdBank){const bank=this.editor.repository.state.placements[createdBank];if(bank&&!this.editor.repository.state.contents[bank.contentKey].children.length)this.editor.commands.remove(createdBank);}
      ticket.revision=this.editor.repository.state.revision;
     }
     nativeDocumentSession(this.editor).trackCandidate(prepared.id);host.open(prepared.id);
     const warnings=prepared.diagnostics.length;
     outcomes.push(`${file.name}: ${prepared.truncated?'INCOMPLETE IMPORT — content was omitted.':warnings?'Imported successfully with warnings.':'Imported successfully.'} Unsaved Ink copy${warnings?` (${warnings} grouped notices)`:''}.`);
     this.detailSignal[1](previous=>[...previous,...prepared.diagnostics.map(d=>`${file.name}: ${d.detail} (${d.count})${d.examples.length?'\n'+d.examples.join('\n'):''}`)]);
    } else {
    const prepared=this.isWebFile(file,format)?await this.prepareWebFile(file,ticket,signal):(await runInterchange({kind:'files',files:[file],format},signal))[0];this.check(ticket);await this.confirm(prepared.diagnostics);this.check(ticket);
    const admitted=await this.admit(prepared.fragment,[file],ticket,signal);
    const wrapped=documentFragment(admitted.fragment,prepared.title,prepared.filename);
    const root=wrapped.blocks.at(-1)!; (root.data.metadata as any).interchange.provenance=prepared.provenance;
    const native=await runInterchange({kind:'materialize',fragment:wrapped,scope:ticket.scope,assets:admitted.admitted},signal);this.check(ticket);
    const state=this.editor.repository.readState(),workspace=state.contents[state.placements[state.rootPlacementKey].contentKey];
    const banks=workspace.children.filter(k=>state.contents[state.placements[k].contentKey].viewType==='workspace-object-bank-block');if(banks.length!==1)throw Error('A workspace with one object bank is required.');
    const id=String(native.state.contents[native.state.placements[native.roots[0]].contentKey].payload.id);
    this.editor.commands.insertFragment(native,{kind:'at',parentKey:banks[0],index:state.contents[state.placements[banks[0]].contentKey].children.length},{commandId:'interchange.import-new',subjects:[]});this.committed=true;
    nativeDocumentSession(this.editor).trackCandidate(id);host.open(id);outcomes.push(`${file.name}: imported as an unsaved Ink copy.`);
    }
   }catch(e){outcomes.push(`${file.name}: ${e instanceof Error?e.message:String(e)}`);if(signal.aborted||!this.valid(ticket)&&!this.committed)throw Error(outcomes.join('\n'));}
   finally{if(this.lease)await this.editor.assets.action(this.lease,this.committed?'finish':'abort').catch(()=>{});this.lease=undefined;}
   ticket.revision=this.editor.repository.state.revision;this.status[1](outcomes.join('\n'));
  }
 });}
 async insertFiles(files:SuppliedFile[],ticket:Ticket,format?:ImportFormat){return this.task(async signal=>{
  this.check(ticket);checkFiles(files);const prepared=files.some(f=>this.isWebFile(f,format))?await (async()=>{const items=[];for(const [index,file] of files.entries()){const prepared=this.isWebFile(file,format)?await this.prepareWebFile(file,ticket,signal):(await runInterchange({kind:'files',files:[file],format},signal))[0];for(const block of prepared.fragment.blocks)if(block.data.importFileIndex!==undefined)block.data.importFileIndex=index;for(const asset of prepared.fragment.assets)if(asset.source.kind==='transfer')asset.source.index=index;items.push(prepared);}return items;})():await runInterchange({kind:'files',files,format},signal);this.check(ticket);await this.confirm(prepared.flatMap(p=>p.diagnostics));this.check(ticket);
  const admitted=await this.admit(joinFragments(prepared.map(p=>p.fragment)),files,ticket,signal);
  await this.commit(admitted.fragment,admitted.admitted,ticket,signal,'import');this.status[1]('Inserted files in supplied order. Undo restores the previous content.');
 });}
 async convert(key:string,format:'html'|'markdown') {let ticket:Ticket;try{ticket=this.selection(key);}catch(e){this.status[1](String(e));return;}
  return this.task(async signal=>{this.check(ticket);const segments=ticket.segments!;if(segments.every(s=>s.start===s.end))throw Error('Select literal source text to convert.');
   const source=this.editor.repository.readState(),affected=conversionSource(source,segments);
   const fragment=serializeSelection(source,segments,ticket.scope),text=fragmentText(fragment);
   const converted=await runInterchange({kind:'convert',source:text,format},signal);this.check(ticket);await this.confirm([...affected.diagnostics,...converted.diagnostics]);this.check(ticket);
   // Only ordinary paragraph slices merge with surviving literal text. Headings,
   // lists and tables remain independent Blocks.
   for(const r of converted.fragment.roots){const p=converted.fragment.placements.find(p=>p.localId===r.placement)!;const b=p.target.kind==='local'?converted.fragment.blocks.find(b=>b.localId===(p.target as {id:string}).id):undefined;if(b?.type==='standoff-editor-block'&&!b.blockProperties.length&&!Object.keys(b.data.metadata as object??{}).length){r.openStart=true;r.openEnd=true;}}
   const admitted=await this.admit(converted.fragment,[],ticket,signal);await this.commit(admitted.fragment,admitted.admitted,ticket,signal,'convert');this.status[1]('Converted source to Mutable Ink. Undo restores source and annotations.');
  });
 }
 private async commit(fragment:MutableFragment,assets:[string,string][],t:Ticket,signal:AbortSignal,operation:'import'|'convert',prepared?:BlockFragment){
  const materialized=prepared??await runInterchange({kind:'materialize',fragment,scope:t.scope,assets},signal);this.check(t);
  const native=this.editor.features.reversibleBlocks&&operation==='import'?resourceSurface(materialized):materialized;
  if(t.destination)this.editor.commands.insertFragment(native,t.destination,{commandId:'interchange.insert',subjects:[]});
  else {const [result]=this.editor.commands.insertMutableText([{segments:t.segments!,fragment:native,slices:fragment.roots}],false,operation);this.editor.crossText.clear();const node=this.editor.nodeForPlacementInView(result.placementKey,t.viewId!);if(node){this.editor.selections.setPrimary(node.key,node.contentKey,node.viewId,result.caret);queueMicrotask(()=>{if(this.alive){const mount=this.editor.mounts.get(node.key);mount?.focus();mount?.restoreInlineSelection?.({anchor:result.caret,head:result.caret});}});}}
  this.committed=true;
 }
 async exportDocument(id:string,format:ExportFormat,current:()=>boolean){return this.task(async signal=>{
  const t=this.base(current),snapshot=captureNative(this.editor.repository.readState(),id),state=resourceToRepository(snapshot);
  const title=String((state.contents[state.placements[state.rootPlacementKey].contentKey].payload.metadata as {title?:string})?.title??'Document');
  const fragment=serializeSelection(state,[{placementKey:state.rootPlacementKey}],{...t.scope,resourceId:id});
  const result=await runInterchange({kind:'export',fragment,format,title,document:true},signal);await this.confirm(result.diagnostics);this.check(t);
  const url=URL.createObjectURL(new Blob([result.text],{type:result.mediaType+';charset=utf-8'})),revoke=URL.revokeObjectURL.bind(URL),link=document.createElement('a');link.href=url;link.download=`${safeFilename(title)}.${result.extension}`;document.body.append(link);link.click();link.remove();setTimeout(()=>revoke(url),1000);this.status[1]('Export downloaded. The Ink document and its save destination are unchanged.');
 });}
 private download(value:BlobPart,name:string,type:string){const url=URL.createObjectURL(new Blob([value],{type})),revoke=URL.revokeObjectURL.bind(URL),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>revoke(url),1000);}
 async exportPortable(id:string,format:'html'|'markdown',standalone:boolean,current:()=>boolean){return this.task(async signal=>{
  const t=this.base(current),snapshot=captureNative(this.editor.repository.readState(),id),state=resourceToRepository(snapshot),inventory=nativeInventory(snapshot,false);this.check(t);
  const assets=[];for(const a of inventory.assets){assets.push(await this.editor.assets.original(a,signal));this.check(t);}
  const fragment=serializeSelection(state,[{placementKey:state.rootPlacementKey}],t.scope),title=String((state.contents[state.placements[state.rootPlacementKey].contentKey].payload.metadata as any)?.title??'Document');
  const result=await runInterchange({kind:'portable-export',fragment,assets,format,standalone,title},signal);this.check(t);await this.confirm(result.diagnostics);this.check(t);
  this.download(new Uint8Array(result.bytes),`${safeFilename(title)}.${result.extension}`,result.mediaType);this.status[1]('Portable projection downloaded with verified original images. The Ink document is unchanged.');
 });}
 /** Native JSON plus the established read-only retained PackageDataBlock. */
 async exportSemanticDocument(id:string,title:string,options:{vault?:string;current?:()=>boolean;viewId?:string}={}) {return this.task(async signal=>{
  const t=this.base(options.current);t.viewId=options.viewId;this.check(t);
  const snapshot=captureNative(this.editor.repository.readState(),id);
  const frozen=Object.values(snapshot.contents).filter(c=>c.viewType==='mutable/package-data-block');
  // Imported context belongs to its source, never to the currently selected Vault.
  if(frozen.length){
   this.download(nativeText(withFrozenDocumentContext(snapshot)),`${safeFilename(nativeDocumentStem(title))}.mutable.json`,'application/json;charset=utf-8');
   this.status[1]('Document exported with its existing frozen package context. It was not refreshed from the active Vault.');return;
  }
  const inventory=documentContextInventory(snapshot),vault=options.vault??(t.scope.cavernId?'.':undefined);
  let context=unavailableDocumentContext(snapshot,'Source Vault unavailable; semantic dependency remains unresolved.');
  if(vault){
   const documentHash=await hash(nativeBytes(snapshot));this.check(t);
   const response=await fetch('/api/sqlite/knowledge/package-data',{method:'POST',headers:{'Content-Type':'application/json',...(t.session?{'X-Mutable-Cavern':t.session}:{})},signal,
    body:JSON.stringify({vault,request:{entities:inventory.entities,claimsById:inventory.claims,relationships:true,actors:true,observedAliases:true,evidence:true,documentHash,documentContext:{resourceId:id,blockReferences:inventory.blockReferences}}})});
   if(!response.body)throw Error('Semantic export reader unavailable; nothing downloaded.');
   const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
   try{for(;;){const part=await reader.read();if(part.done)break;if((size+=part.value.length)>10*1024*1024)throw Error('Semantic export exceeds the 10 MiB response budget');chunks.push(part.value);this.check(t);}}finally{await reader.cancel();}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   const result=JSON.parse(new TextDecoder().decode(bytes));if(!response.ok||!result.Success)throw Error(result.Error??'Semantic export unavailable; nothing downloaded.');
   validatePackageData(result.Data?.data);
   if(result.Data.data.selection?.profile!=='document-context-v1')throw Error('The server does not support Document semantic export yet. Restart the updated server and retry.');
   context=result.Data;
  }
  this.check(t);
  if(this.editor.completionInput?.beforeSave?.()===false)throw Error('Finish or cancel Scry, then export again.');
  const enriched=withDocumentContext(snapshot,context,{resourceId:id,...t.scope.cavernId?{cavernId:t.scope.cavernId}:{},profile:'document-context-v1',
   readingGuide:'The document tree is authored content. Retained PackageDataBlock is subsequent read-only enrichment, outside reading order. Join table rows by canonical GUIDs using columns and SQLite storage tags. Block rows describe canonical Thesis propositions; StandoffProperty rows use their coordinate field and half-open SQL ends; raw authored annotations retain inclusive Cell ends. Captured source passages and evidence hashes describe provenance and are not verified against the current edited text. Entity.typename and Claim.typename preserve kinds; no trait/proposition coercion.'});
  this.download(nativeText(enriched),`${safeFilename(nativeDocumentStem(title))}.mutable.json`,'application/json;charset=utf-8');
  this.status[1](`Document exported with semantic context${context.data.unresolved.length||inventory.unresolved.length?' and explicit unresolved dependencies':''}. The Document and Save state are unchanged.`);
 });}
 async exportPackage(id:string,vault:string|undefined,current:()=>boolean){return this.task(async signal=>{
  const t=this.base(current),snapshot=captureNative(this.editor.repository.readState(),id),native=nativeBytes(snapshot),inventory=nativeInventory(snapshot,this.editor.features.crossResourceLoaders||this.editor.features.webResourceViewers);
  this.check(t);
  const chosen=await this.ask({title:'Choose package database boundary',details:['Review rights and attribution before redistributing retained originals. Acquisition is not permission to redistribute. IIIF tiles are partial captures, not complete offline manuscripts. The archive retains the exact native document, including authored metadata which may be private, and retained original assets. Referenced Entity, Time, Claim (with participants/qualifiers) and curated/imported alias rows include full authored fields, descriptions, JSON attributes and actor identifiers. Optional related rows may contain private information. Nothing is followed through backlinks.'],options:['Relationships (one hop)','Claims and participants','Claim evidence (requires claims)','Actor records','Observed/recovered aliases']});if(!chosen)throw Error('Export cancelled.');this.check(t);
  let context:{data:PackageData;schema:unknown};
  if(vault){
   const response=await fetch('/api/sqlite/knowledge/package-data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({vault,request:{entities:inventory.entities,claimsById:inventory.claims,documentHash:await hash(native),relationships:chosen.includes('Relationships (one hop)'),claims:chosen.includes('Claims and participants'),evidence:chosen.includes('Claim evidence (requires claims)'),actors:chosen.includes('Actor records'),observedAliases:chosen.includes('Observed/recovered aliases')}}),signal});
   if(!response.body)throw Error('Package database reader unavailable');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
   try{for(;;){const p=await reader.read();if(p.done)break;if((size+=p.value.length)>10*1024*1024)throw Error('Package database response limit');chunks.push(p.value);}}finally{await reader.cancel();}
   const all=new Uint8Array(size);let at=0;for(const c of chunks){all.set(c,at);at+=c.length;}const result=JSON.parse(new TextDecoder().decode(all));if(!response.ok||!result.Success)throw Error(result.Error??'Package data unavailable');context=result.Data;
  }else{
   if(inventory.entities.length||inventory.claims.length)throw Error('Select the source Vault to archive referenced database records.');
   context={data:{kind:'mutable-package-data',version:1,readOnly:true,encoding:'sqlite-storage-class-v1',tables:[],provenance:{documentHash:await hash(native)},selection:{entitySeeds:[]},unresolved:[],excluded:[{reason:'No source database selected; document has no authored entity-reference seeds.'}]},schema:{kind:'mutable-knowledge-schema',version:1,tables:[]}};
  }
  this.check(t);const assets=[];
  const refs=new Map([...inventory.assets,...(this.editor.features.crossResourceLoaders?resourceAssets(context.data):[])].map(a=>[assetKey(a),a]));
  const api=new HttpApplicationServices(()=>{const c=this.editor.readAssetContext();if(!c.cavernId||!c.session)throw Error('Open the source Vault');return {cavernId:c.cavernId,session:c.session};});
  let total=0;for(const a of refs.values()){if(a.cavernId!==t.scope.cavernId)throw Error('Original belongs to another Vault');const original=(this.editor.features.crossResourceLoaders||this.editor.features.structuredResources||this.editor.features.deterministicAcademicResources||this.editor.features.webResourceViewers)?{...await api.call('resources.original',{assetId:a.assetId},signal),reference:a}:await this.editor.assets.original(a,signal);total+=original.bytes.length;if(total>PACKAGE_LIMITS.assets||assets.length>=PACKAGE_LIMITS.images)throw Error('Package original budget exceeded; narrow the package');assets.push(original);this.check(t);}

  const details=[`${inventory.blocks} Blocks; ${inventory.annotations} annotations (${inventory.points} points). Original native identities are preserved.`,...context.data.tables.map(table=>`${table.name}: ${table.rows.length} rows`),...assets.map(a=>`${a.reference.assetId}: ${a.bytes.length} original bytes`),...inventory.unresolvedAssets.map(v=>`${v.blockId}: ${v.reason}`),...context.data.unresolved.map(v=>'Unresolved: '+JSON.stringify(v)),...context.data.excluded.map(v=>'Excluded: '+JSON.stringify(v))];
  if(await this.ask({title:'Review package export inventory',details:details.length>200?[...details.slice(0,200),`${details.length-200} further inventory entries are retained in the package data. Inclusion is governed by the selected policies.`]:details})===undefined)throw Error('Export cancelled.');this.check(t);
  const result=await runInterchange({kind:'package-create',native,source:{resourceId:id,...t.scope.cavernId?{cavernId:t.scope.cavernId}:{}},...context,assets},signal);this.check(t);
  const root=snapshot.placements[snapshot.rootPlacementKey],title=root.target.kind==='local'?String((snapshot.contents[root.target.contentKey].payload.metadata as any)?.title??'Document'):'Document';
  this.download(new Uint8Array(result),`${safeFilename(title)}.inkpkg`,'application/zip');this.status[1]('Archival package downloaded. The original Ink document is unchanged.');
 });}
 pickPackage(host:ImportHost){if(!this.editor.features.documentInterchange)return;this.pickerSignal[1]({title:'Import Ink package as a new copy',package:true,run:files=>{this.closePicker();if(files.length!==1){this.status[1]('Choose one Ink package.');return;}void this.importPackage(files[0],host);}});}
 async importPackage(file:SuppliedFile,host:ImportHost){return this.task(async signal=>{
  if(!this.editor.features.nativeDocumentPersistence)throw Error('Native persistence is required.');
  const t=this.base(host.current);this.check(t);if(file.blob.size>PACKAGE_LIMITS.compressed)throw Error('Package exceeds 64 MiB');
  const prepared=await runInterchange({kind:'package-open',bytes:new Uint8Array(await file.blob.arrayBuffer())},signal);this.check(t);
  if(await this.ask({title:'Import package as a fresh Ink copy',details:[`${prepared.inventory.blocks} Blocks; ${prepared.inventory.annotations} annotations; ${prepared.assets.length} originals.`,...prepared.manifest.boundaries,...prepared.data.tables.filter(v=>v.rows.length).map(v=>`${v.name}: ${v.rows.length} frozen contextual rows`),...prepared.inventory.unresolvedAssets.map(v=>`${v.blockId}: ${v.reason}`),'All authored identities are replaced. SQL rows remain inert; no destination entities are matched or created. Active or unsupported content becomes inert. Out-of-package references remain unresolved.',...prepared.data.excluded.map(v=>JSON.stringify(v)),...prepared.data.unresolved.map(v=>JSON.stringify(v))]})===undefined)throw Error('Import cancelled.');this.check(t);
  const imageAssets=prepared.assets.filter(a=>a.mediaType==='image/png'||a.mediaType==='image/jpeg');
  const files=imageAssets.map(a=>({name:a.reference.assetId,blob:new Blob([new Uint8Array(a.bytes)],{type:a.mediaType})}));
  for(const asset of prepared.fragment.assets){const index=imageAssets.findIndex(a=>assetKey(a.reference)===`${asset.source.cavernId}/${asset.source.assetId}`);if(index>=0){asset.source={kind:'transfer',index};for(const e of prepared.fragment.embeds)if(e.asset?.kind==='local'&&e.asset.id===asset.localId)delete e.data.asset;}}
  const admitted=await this.admit(prepared.fragment,files,t,signal);
  const assetBindings:Array<[string,{kind:'managed';cavernId:string;assetId:string}]>=[];
  for(const a of prepared.assets){this.check(t);if(!t.scope.cavernId)throw Error('Select a destination Vault');
   if(['application/xml','application/epub+zip','application/x-bibtex','application/x-research-info-systems'].includes(a.mediaType)&&!this.editor.features.deterministicAcademicResources)throw Error('Academic package admission disabled');
   if(['text/plain','application/xml','application/epub+zip','application/x-bibtex','application/x-research-info-systems'].includes(a.mediaType)){const ref={kind:'managed' as const,cavernId:t.scope.cavernId,assetId:a.reference.assetId};const existing=await this.editor.assets.verify(ref,signal).catch(()=>undefined);this.check(t);if(existing){assetBindings.push([assetKey(a.reference),ref]);continue;}}
   if(a.mediaType==='application/json'||a.mediaType==='application/pdf'||['text/plain','application/xml','application/epub+zip','application/x-bibtex','application/x-research-info-systems'].includes(a.mediaType)){
    if(a.mediaType==='text/plain'?!this.editor.features.structuredResources:a.mediaType==='application/json'?(!this.editor.features.crossResourceLoaders&&!this.editor.features.deterministicAcademicResources&&!this.editor.features.webResourceViewers):a.mediaType==='application/pdf'?!this.editor.features.crossResourceLoaders:!this.editor.features.deterministicAcademicResources)throw Error('Resource package import is disabled');
    const lease=await this.editor.assets.begin([],signal);let done=false;try{const m=await this.editor.assets.stageOriginal(lease,new Blob([a.bytes.slice().buffer],{type:a.mediaType}),signal);if(m.assetId!==a.reference.assetId)throw Error('Original hash mismatch');this.check(t);await this.editor.assets.action(lease,'publish',signal);await this.editor.assets.action(lease,'finish',signal);done=true;}finally{if(!done)await this.editor.assets.action(lease,'abort').catch(()=>{});}
   }else if(!prepared.fragment.assets.some(f=>f.source.kind==='transfer'&&imageAssets[Number(f.source.index)]===a)){
    // Retained IIIF tiles need original admission even when not inline image cells.
    const lease=await this.editor.assets.begin([],signal);let done=false;try{await this.editor.assets.stage(lease,new Blob([a.bytes.slice().buffer],{type:a.mediaType}),signal);this.check(t);await this.editor.assets.action(lease,'publish',signal);await this.editor.assets.action(lease,'finish',signal);done=true;}finally{if(!done)await this.editor.assets.action(lease,'abort').catch(()=>{});}
   }
   assetBindings.push([assetKey(a.reference),{kind:'managed',cavernId:t.scope.cavernId,assetId:a.reference.assetId}]);
  }
  const native=await runInterchange({kind:'package-materialize',fragment:admitted.fragment,cavernId:t.scope.cavernId,assets:admitted.admitted,context:{data:prepared.data,schema:prepared.schema,source:prepared.manifest.source,assetBindings}},signal);this.check(t);
  const state=this.editor.repository.readState(),workspace=state.contents[state.placements[state.rootPlacementKey].contentKey],banks=workspace.children.filter(k=>state.contents[state.placements[k].contentKey].viewType==='workspace-object-bank-block');if(banks.length!==1)throw Error('One workspace object bank is required.');
  const id=String(native.state.contents[native.state.placements[native.roots[0]].contentKey].payload.id);
  this.editor.commands.insertFragment(native,{kind:'at',parentKey:banks[0],index:state.contents[state.placements[banks[0]].contentKey].children.length},{commandId:'interchange.import-package',subjects:[]});this.committed=true;nativeDocumentSession(this.editor).trackCandidate(id);host.open(id);this.status[1]('Imported an unsaved Ink copy with frozen package context. Save explicitly to retain it.');
 });}
 async inspectPackage(id:string,current:()=>boolean){return this.task(async()=>{const t=this.base(current),snapshot=captureNative(this.editor.repository.readState(),id),contexts=Object.values(snapshot.contents).filter(c=>c.viewType==='mutable/package-data-block');this.check(t);if(!contexts.length)throw Error('This Document has no packaged database context.');await this.ask({title:'Frozen package context (read-only)',details:contexts.flatMap(c=>{const context=c.payload.packageContext as any;return [JSON.stringify(context.source),...context.data.tables.filter((v:any)=>v.rows.length).map((v:any)=>JSON.stringify(v)),...context.data.unresolved.map((v:any)=>JSON.stringify(v)),...context.data.excluded.map((v:any)=>JSON.stringify(v))];})});});}
 async copyAs(key:string,format:'html'|'markdown'){let t:Ticket;try{t=this.selection(key);}catch(e){this.status[1](String(e));return;}
  return this.task(async signal=>{this.check(t);const fragment=serializeSelection(this.editor.repository.readState(),t.segments!,t.scope);if(t.segments!.every(s=>s.start===s.end))throw Error('Select text to copy.');
   const result=await runInterchange({kind:'export',fragment,format},signal);await this.confirm(result.diagnostics);this.check(t);
   const plain=format==='html'?await runInterchange({kind:'export',fragment,format:'text'},signal):result;this.check(t);
   const reps:Record<string,string>=format==='html'?{'text/html':result.text,'text/plain':plain.text}:{'text/markdown':result.text,'text/plain':result.text};
   const mount=this.editor.mounts.get(key);mount?.focus();if(t.segments?.length===1){const s=t.segments[0];mount?.restoreInlineSelection?.({anchor:s.start,head:s.end});}
   await this.editor.clipboard.copyProjection(reps,()=>this.alive&&t.current()&&t.revision===this.editor.repository.state.revision&&t.session===this.editor.readAssetContext().session&&t.scope.cavernId===this.editor.readAssetContext().cavernId,event=>this.editor.mounts.resolveEvent(event)?.nodeKey===key||!!(this.editor.crossText.range()&&event.target instanceof Element&&event.target.matches('[data-cross-text-input]')));
   this.status[1]('Copy projection prepared. See clipboard status for acknowledgement or the keyboard fallback.');
  });
 }
 /** Drop at an explicit Block gap. It never guesses a pixel-to-character position. */
 dropFiles(files:SuppliedFile[],key:string,current:()=>boolean){try{const node=this.editor.node(key);if(!node)throw Error('Drop over a Document Block.');const t=this.base(current);t.viewId=node.viewId;t.destination={kind:'after',anchorKey:node.placementKey};return this.insertFiles(files,t);}catch(e){this.status[1](String(e));}}
 dispose(){for(const stop of this.players.keys())stop();this.players.clear();this.alive=false;this.cancel();this.status[1]('');}
}
