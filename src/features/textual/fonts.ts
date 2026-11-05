export interface TextualFontSettings {source:'bundled'|'system';family:string;size:number;lineHeight:number}
export const bundledTextualFonts=[{family:'IBM Plex Mono',label:'IBM Plex Mono'}] as const;
export const defaultTextualFont:TextualFontSettings={source:'bundled',family:'IBM Plex Mono',size:16,lineHeight:20};
export const legacyTextualFont="ui-monospace,'Cascadia Mono',Consolas,monospace";
export const fontSample='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 !?.,:;+-*/()[]{}┌─┐│└┘├┤┬┴┼╔═╗║╚╝╠╣╦╩╬';
const bounded=(v:unknown,fallback:number,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)?Math.round(Math.min(max,Math.max(min,v))):fallback;
export function normaliseTextualFont(value:unknown):TextualFontSettings{
 const v=value as Partial<TextualFontSettings>|undefined,size=bounded(v?.size,16,12,32);
 const source=v?.source==='system'?'system':'bundled';
 const family=typeof v?.family==='string'?v.family.replace(/[\x00-\x1f\x7f]/g,'').slice(0,100):'';
 return {source,family:source==='bundled'?(bundledTextualFonts.find(f=>f.family===family)?.family??defaultTextualFont.family):(typeof v?.family==='string'?family:'Courier New'),size,lineHeight:bounded(v?.lineHeight,Math.max(20,Math.ceil(size*1.1)),Math.ceil(size*1.1),Math.floor(size*2.5))};
}
/** Reserve whole pairs of Chromium's 1/64-pixel units so half-row marginalia stays representable. */
export const textualFontPixels=(font:TextualFontSettings,zoom:number)=>({size:font.size*zoom,lineHeight:Math.round(font.lineHeight*zoom*32)/32});
export function uniformAdvances(widths:readonly number[]){return widths.length>0&&widths[0]>0&&widths.every(w=>Number.isFinite(w)&&Math.abs(w-widths[0])<=1/64);}
function compatible(doc:Document,family:string,size:number){
 const probe=doc.createElement('span');probe.style.cssText='position:fixed;visibility:hidden;white-space:pre;pointer-events:none;left:0;top:0;font-variant-ligatures:none;font-feature-settings:"liga" 0,"calt" 0;letter-spacing:0';
 probe.style.fontFamily=family;probe.style.fontSize=`${size}px`;
 const spans=Array.from(fontSample,c=>{const span=doc.createElement('span');span.textContent=c;span.style.display='inline-block';probe.append(span);return span;});doc.body.append(probe);
 try{const widths:number[]=[];for(const weight of ['400','700']){probe.style.fontWeight=weight;widths.push(...spans.map(s=>s.getBoundingClientRect().width));}return uniformAdvances(widths);}finally{probe.remove();}
}
const timeout=<T>(promise:Promise<T>)=>new Promise<T>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Font loading timed out')),5000);promise.then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});
export async function resolveTextualFont(doc:Document,font:TextualFontSettings,size:number):Promise<{family:string;label:string;notice:string}>{
 const fallback='"IBM Plex Mono", monospace';
 try{
  if(!doc.fonts)throw Error('Font loading is unavailable');
  const faces=await timeout(Promise.all([doc.fonts.load(`400 ${size}px "IBM Plex Mono"`,fontSample),doc.fonts.load(`700 ${size}px "IBM Plex Mono"`,fontSample)]));
  if(faces.some(f=>!f.length)||!compatible(doc,fallback,size))throw Error('Bundled font could not be loaded or measured');
  const bundled={family:fallback,label:'IBM Plex Mono',notice:''};
  if(font.source==='bundled'&&font.family==='IBM Plex Mono')return bundled;
  const selected=font.family.trim();
  try{
   // local() verifies actual availability; FontFaceSet.check alone accepts missing families.
   if(font.source==='system')await timeout(new FontFace('Mutable Textual availability',[selected,`${selected} Regular`,`${selected.replaceAll(' ','')}-Regular`].map(name=>`local(${JSON.stringify(name)})`).join(',')).load());
   else {const faces=await timeout(Promise.all([doc.fonts.load(`400 ${size}px ${JSON.stringify(selected)}`,fontSample),doc.fonts.load(`700 ${size}px ${JSON.stringify(selected)}`,fontSample)]));if(faces.some(f=>!f.length))throw Error('Font unavailable');}
   const family=`${JSON.stringify(selected)}, ${fallback}`;
   if(!compatible(doc,family,size))throw Error('Character widths differ');
   return {family,label:selected,notice:''};
  }catch{return {...bundled,notice:`${selected||'The requested font'} is unavailable or does not have consistent letter and frame widths. Using IBM Plex Mono.`};}
 }catch{return {family:legacyTextualFont,label:'System monospace',notice:'IBM Plex Mono could not load. Using the system monospace fallback.'};}
}
