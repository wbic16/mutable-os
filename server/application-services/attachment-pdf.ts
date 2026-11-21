import PDFDocument from 'pdfkit';
import {readFile} from 'node:fs/promises';
import {attachmentLimits} from '../../src/features/dialectic/attachments-contract';
/** Runs in the disposable preparation worker, never on the editor or broker thread. */
export async function attachmentPdf(text:string,title:string):Promise<{bytes:Uint8Array}>{
 if(!text.length||text.length>attachmentLimits.artifactCharacters)throw Error('PDF text budget exceeded');
 const font=await readFile(new URL('./attachment-font.ttf',import.meta.url));
 const doc=new PDFDocument({size:'A4',margin:48,info:{Title:title,Creator:'Mutable Dialectic'}}).font(font);
 const face=(doc as any)._font.font;
 for(const char of text)if(!/\s/.test(char)&&!face.hasGlyphForCodePoint(char.codePointAt(0)!))throw Error('PDF font does not support one of the requested characters; create a UTF-8 text file instead');
 return new Promise((resolve,reject)=>{
  const chunks:Buffer[]=[];let size=0,pages=1;
  doc.on('data',chunk=>{size+=chunk.length;if(size>attachmentLimits.fileBytes)doc.destroy(Error('PDF output limit exceeded'));else chunks.push(chunk);});
  doc.on('error',reject);doc.on('end',()=>resolve({bytes:new Uint8Array(Buffer.concat(chunks))}));
  doc.on('pageAdded',()=>{if(++pages>attachmentLimits.pdfPages)throw Error('PDF page limit exceeded');});
  try{doc.fontSize(11).text(text,{lineGap:3});doc.end();}catch(error){doc.destroy(error as Error);}
 });
}
