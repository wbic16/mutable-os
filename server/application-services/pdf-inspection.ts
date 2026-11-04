import {PDF_LIMITS,type PdfInspection} from '../../src/pdf/model';
/** Runs only in the bounded preparation worker. No network, actions or forms. */
export async function inspectPdf(bytes:Uint8Array):Promise<PdfInspection>{
 if(!bytes.length||bytes.length>PDF_LIMITS.bytes||!new TextDecoder().decode(bytes.subarray(0,8)).startsWith('%PDF-'))throw Error('Invalid or oversized PDF original');
 const {getDocument,version}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const task=getDocument({data:bytes.slice(),useSystemFonts:false,disableFontFace:true,useWasm:false,stopAtErrors:true,maxImageSize:PDF_LIMITS.pixels});
 const password=new Promise<never>((_resolve,reject)=>{task.onPassword=()=>reject(Error('Encrypted/password-protected PDFs are not supported'));});
 try{const doc=await Promise.race([task.promise,password]);if(doc.numPages<1||doc.numPages>PDF_LIMITS.pages)throw Error('PDF page limit exceeded');
  for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i);if(p.view.length!==4||!p.view.every(Number.isFinite)||p.view[2]<=p.view[0]||p.view[3]<=p.view[1])throw Error('Invalid PDF page geometry');p.cleanup();}
  const metadata=await doc.getMetadata();const title=(metadata.info as any)?.Title;
  return {kind:'pdf-inspection',pages:doc.numPages,label:typeof title==='string'?title.slice(0,1000):'PDF document',version};
 }finally{await task.destroy();}
}
