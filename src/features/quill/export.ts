const ns='http://www.w3.org/2000/svg';
const paintProperties=['font-family','font-size','font-weight','font-style','font-kerning','font-variant-ligatures','fill','stroke','stroke-width','opacity','text-anchor','white-space'] as const;
async function inlineImage(image:SVGImageElement){
 const href=image.getAttribute('href')??'';
 if(href.startsWith('data:image/svg+xml;'))return;
 if(!href.startsWith('blob:'))throw Error('An artwork image is unresolved. Wait for it to load before exporting.');
 const response=await fetch(href);if(!response.ok)throw Error('Managed artwork could not be embedded.');const blob=await response.blob();
 image.setAttribute('href',await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Could not read artwork.'));reader.readAsDataURL(blob);}));
}
/** Explicit publication only. Native Ink, annotations and editor state are untouched. */
export async function compositionSvg(root:Element):Promise<string>{
 const backgrounds=root.querySelector<SVGSVGElement>('.quill-artwork-background'),sources=[...root.querySelectorAll<SVGSVGElement>('.quill-canvas')];
 if(!backgrounds||!sources.length)throw Error('Select a rendered composition.');
 if(root.querySelector('.quill-import-error'))throw Error('Resolve the artwork import error before exporting.');
 if(root.querySelector('.quill-preserved-text'))throw Error('This composition needs native text fallback. Resolve unsupported sources before SVG export.');
 const output=document.createElementNS(ns,'svg');output.setAttribute('xmlns',ns);output.setAttribute('viewBox',backgrounds.getAttribute('viewBox')!);const [, ,w,h]=backgrounds.getAttribute('viewBox')!.split(/\s+/).map(Number);output.setAttribute('width',String(w));output.setAttribute('height',String(h));
 const title=document.createElementNS(ns,'title');title.textContent='Quill composition';output.append(title);
 for(const child of [...backgrounds.children])output.append(child.cloneNode(true));
 for(const source of sources){const glyphs=source.querySelector('.quill-glyphs');if(!glyphs)continue;const group=glyphs.cloneNode(true) as SVGGElement,original=[...glyphs.querySelectorAll('text,tspan')],copies=[...group.querySelectorAll<SVGElement>('text,tspan')];
  original.forEach((element,i)=>{const style=getComputedStyle(element);for(const property of paintProperties)copies[i].style.setProperty(property,style.getPropertyValue(property));});output.append(group);
 }
 for(const element of [output,...output.querySelectorAll('*')])for(const attribute of [...element.attributes])if(attribute.name==='class'||attribute.name.startsWith('data-'))element.removeAttribute(attribute.name);
 await Promise.all([...output.querySelectorAll<SVGImageElement>('image')].map(inlineImage));
 return new XMLSerializer().serializeToString(output);
}
export async function compositionPng(svg:string):Promise<Blob>{
 const node=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement,width=Number(node.getAttribute('width')),height=Number(node.getAttribute('height'));
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width>16384||height>16384||width*height>16777216)throw Error('PNG export is limited to 16 megapixels and 16,384 pixels per side. Reduce the artboard or export SVG.');
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));try{const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('The browser could not rasterise this SVG.'));image.src=url;});const canvas=document.createElement('canvas');canvas.width=Math.ceil(width);canvas.height=Math.ceil(height);const context=canvas.getContext('2d');if(!context)throw Error('Canvas export is unavailable.');context.drawImage(image,0,0,width,height);return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG export failed.')),'image/png'));}finally{URL.revokeObjectURL(url);}
}
export async function exportComposition(root:Element,format:'svg'|'png'){
 const svg=await compositionSvg(root),blob=format==='png'?await compositionPng(svg):new Blob([svg],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.download='quill-composition.'+format;link.href=url;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
