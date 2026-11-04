import {PDF_LIMITS,pdfText,type PdfCapture,type PdfAnchor} from './model';
import './viewer.css';
export interface PdfViewer {destroy():void;page(index:number,zoom:number):Promise<void>;extract(selected?:boolean):ReturnType<typeof pdfText>;region():PdfAnchor['region'];viewBox():number[];overlay(id:string,a:PdfAnchor,label:string):()=>void}
/** One page/canvas/text layer per occurrence. No editor geometry reads, actions,
 * annotation widgets, embedded files, remote URLs or document mutations. */
export async function mountPdfViewer(host:HTMLElement,bytes:Uint8Array,snapshot:PdfCapture,signal:AbortSignal,notice:(v:string)=>void):Promise<PdfViewer>{
 const pdf=await import('pdfjs-dist'),worker=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');signal.throwIfAborted();pdf.GlobalWorkerOptions.workerSrc=worker.default;
 const support=new URL(import.meta.env.BASE_URL+'pdfjs/',location.origin).href;
 const task=pdf.getDocument({cMapUrl:support+'cmaps/',cMapPacked:true,standardFontDataUrl:support+'standard_fonts/',wasmUrl:support+'wasm/',data:bytes,useWasm:true,useSystemFonts:false,maxImageSize:PDF_LIMITS.pixels,stopAtErrors:true});
 let disposed=false,epoch=0,current:any,text:any,viewport:any,render:any,textLayer:any,pageIndex=-1;
 const pageHost=document.createElement('div');pageHost.className='mutable-pdf-page';host.replaceChildren(pageHost);
 const overlays=new Map<string,{a:PdfAnchor;element:HTMLElement}>();
 const clear=()=>{render?.cancel();textLayer?.cancel();render=undefined;textLayer=undefined;current?.cleanup();current=undefined;text=undefined;viewport=undefined;for(const {element}of overlays.values())element.remove();pageHost.replaceChildren();};
 const destroy=()=>{if(disposed)return;disposed=true;epoch++;clear();overlays.clear();host.replaceChildren();void task.destroy();signal.removeEventListener('abort',destroy);};signal.addEventListener('abort',destroy,{once:true});
 let doc;try{doc=await task.promise;signal.throwIfAborted();if(doc.numPages!==snapshot.inspection.pages||doc.numPages>PDF_LIMITS.pages)throw Error('PDF original/page count mismatch');}catch(e){destroy();throw e;}
 const draw=()=>{if(!viewport||!current)return;for(const {a,element}of overlays.values()){
  element.remove();if(a.pageIndex!==pageIndex||a.snapshotId!==snapshot.snapshotId||a.assetId!==snapshot.asset.assetId||JSON.stringify(a.viewBox)!==JSON.stringify(current.view))continue;
  const r=a.region,box=viewport.convertToViewportRectangle([r.x,r.y,r.x+r.width,r.y+r.height]);Object.assign(element.style,{left:Math.min(box[0],box[2])+'px',top:Math.min(box[1],box[3])+'px',width:Math.abs(box[2]-box[0])+'px',height:Math.abs(box[3]-box[1])+'px'});pageHost.append(element);
 }};
 return {destroy,
  async page(index,zoom){if(disposed||!Number.isInteger(index)||index<0||index>=doc.numPages||!Number.isFinite(zoom)||zoom<0.25||zoom>4)throw Error('Invalid PDF page or zoom');const generation=++epoch;clear();pageIndex=index;const p=await doc.getPage(index+1);if(disposed||generation!==epoch){p.cleanup();return;}current=p;viewport=p.getViewport({scale:zoom});
   const ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(PDF_LIMITS.pixels/(viewport.width*viewport.height)));if(ratio<0.1)throw Error('PDF page exceeds rendering budget');
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.floor(viewport.width*ratio));canvas.height=Math.max(1,Math.floor(viewport.height*ratio));Object.assign(canvas.style,{width:viewport.width+'px',height:viewport.height+'px'});Object.assign(pageHost.style,{width:viewport.width+'px',height:viewport.height+'px'});pageHost.style.setProperty('--total-scale-factor',String(zoom));pageHost.append(canvas);
   const layer=document.createElement('div');layer.className='textLayer';pageHost.append(layer);
   try{render=p.render({canvas,canvasContext:canvas.getContext('2d')!,viewport,transform:ratio===1?undefined:[ratio,0,0,ratio,0,0],annotationMode:pdf.AnnotationMode.DISABLE});await render.promise;if(disposed||generation!==epoch)return;
    text=await p.getTextContent();if(disposed||generation!==epoch)return;const extraction=pdfText(text.items,snapshot,index,p.view);textLayer=new pdf.TextLayer({textContentSource:text,container:layer,viewport});await textLayer.render();if(disposed||generation!==epoch)return;draw();notice(extraction.text.trim()?'Retained PDF · select text, annotate a region, or extract this page into native Ink.':'No text layer on this page. Original retained; OCR is not included.');
   }catch(e){if(!disposed&&generation===epoch)throw e;}
  },
  extract(selected=false){if(!current||!text)throw Error('Wait for the PDF text layer');const result=pdfText(text.items,snapshot,pageIndex,current.view);if(!selected)return result;
   const selection=window.getSelection();if(!selection||selection.isCollapsed||selection.rangeCount!==1)throw Error('Select text within this PDF page first');const range=selection.getRangeAt(0),divs:HTMLElement[]=textLayer?.textDivs??[];
   const offset=(node:Node,offset:number)=>{const i=divs.findIndex(d=>d===node||d.contains(node));if(i<0||!result.provenance.runs[i])throw Error('Selection does not align with retained PDF text runs');const r=document.createRange();r.selectNodeContents(divs[i]);r.setEnd(node,offset);return result.provenance.runs[i].start+r.toString().length;};
   const start=offset(range.startContainer,range.startOffset),end=offset(range.endContainer,range.endOffset);if(end<=start||end>result.text.length)throw Error('Invalid PDF text selection');return {...result,text:result.text.slice(start,end),provenance:{...result.provenance,selection:{start,end}}} as ReturnType<typeof pdfText>;
  },
  viewBox(){if(!current)throw Error('No PDF page');return [...current.view];},
  region(){if(!viewport||!current)throw Error('No PDF page');const selected=window.getSelection();let rect:DOMRect;
   if(selected&&!selected.isCollapsed&&selected.rangeCount&&pageHost.contains(selected.anchorNode)&&pageHost.contains(selected.focusNode))rect=selected.getRangeAt(0).getBoundingClientRect();else rect=host.getBoundingClientRect();
   const origin=pageHost.getBoundingClientRect(),a=viewport.convertToPdfPoint(rect.left-origin.left,rect.top-origin.top),b=viewport.convertToPdfPoint(rect.right-origin.left,rect.bottom-origin.top),v=current.view;
   const x=Math.max(v[0],Math.min(a[0],b[0])),y=Math.max(v[1],Math.min(a[1],b[1])),right=Math.min(v[2],Math.max(a[0],b[0])),top=Math.min(v[3],Math.max(a[1],b[1]));if(right<=x||top<=y)throw Error('Selection or viewport is outside this page');return {x,y,width:right-x,height:top-y};
  },
  overlay(id,a,label){const element=document.createElement('div');element.className='mutable-pdf-region';element.dataset.annotationId=id;element.title=label;element.setAttribute('aria-hidden','true');const entry={a,element};overlays.set(id,entry);draw();return()=>{element.remove();if(overlays.get(id)===entry)overlays.delete(id);};}
 };
}
