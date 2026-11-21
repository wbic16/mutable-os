import {SaxesParser} from 'saxes';
const tags=new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','defs','linearGradient','radialGradient','stop','clipPath','title','desc','text','tspan']);
const attributes=new Set(['id','viewBox','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','width','height','d','points','transform','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','fill-rule','clip-rule','opacity','fill-opacity','stroke-opacity','offset','stop-color','stop-opacity','gradientUnits','gradientTransform','clip-path','font-family','font-size','font-weight','font-style','text-anchor','preserveAspectRatio']);
const escaped=v=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
/** Shared browser/server allowlist. No scripts, CSS, resource loads, use cycles,
 * foreign namespaces, filters or animation; bounded parse depth and geometry. */
export function sanitiseSvg(source){
 if(typeof source!=='string'||source.length>131072||/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('SVG exceeds resource limits or contains a document type.');
 const parser=new SaxesParser({xmlns:true}),output=[],ids=new Set(),references=[];let count=0,depth=0,root=false,viewBox='0 0 100 100';
 parser.on('error',e=>{throw Error('Invalid SVG: '+e.message);});parser.on('doctype',()=>{throw Error('SVG document types are not allowed.');});parser.on('processinginstruction',()=>{throw Error('SVG processing instructions are not allowed.');});
 parser.on('opentag',tag=>{
  if(++count>1024||++depth>24)throw Error('SVG element/depth limit exceeded.');
  if(!tags.has(tag.local)||tag.uri!=='http://www.w3.org/2000/svg'||tag.prefix)throw Error('Unsupported SVG element: '+tag.name);
  if(!root){if(tag.local!=='svg')throw Error('Expected SVG root.');root=true;}else if(tag.local==='svg')throw Error('Nested SVG viewports are unsupported.');
  const attrs=[];
  for(const attr of Object.values(tag.attributes)){
   if(attr.name==='xmlns')continue;if(attr.prefix||/^on/i.test(attr.name)||['style','href'].includes(attr.name))throw Error('Active SVG attributes and resource references are not allowed.');
   if(!attributes.has(attr.name))continue;const value=attr.value.trim();if(value.length>65536||/[<>]/.test(value))throw Error('SVG attribute limit exceeded.');
   if(attr.name==='id'){if(!/^[A-Za-z][\w-]{0,63}$/.test(value)||ids.has(value))throw Error('Invalid SVG identity.');ids.add(value);}
   else if(['fill','stroke','clip-path'].includes(attr.name)){
    const ref=/^url\(#([A-Za-z][\w-]{0,63})\)$/.exec(value);if(ref)references.push(ref[1]);else if(!/^(?:none|currentColor|transparent|[A-Za-z]{1,20}|#[0-9a-fA-F]{3,8}|rgb\([\d., %]+\))$/.test(value))throw Error('External SVG paint is not allowed.');
   }else if(/url\s*\(|javascript:|data:|https?:|[\u0000-\u001f]/i.test(value))throw Error('SVG resource references are not allowed.');
   if(['d','points','viewBox','transform','gradientTransform','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','width','height','stroke-width','font-size'].includes(attr.name)){
    const values=value.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)??[];if(values.length>12000||values.some(v=>!Number.isFinite(Number(v))||Math.abs(Number(v))>1000000))throw Error('SVG geometry limit exceeded.');
   }
   if(attr.name==='viewBox'){const v=value.split(/[\s,]+/).map(Number);if(v.length!==4||!v.every(Number.isFinite)||v[2]<=0||v[3]<=0)throw Error('Invalid SVG viewBox.');viewBox=v.join(' ');}
   attrs.push(`${attr.name}="${escaped(value)}"`);
  }
  output.push('<'+tag.local+(depth===1?' xmlns="http://www.w3.org/2000/svg"':'')+(attrs.length?' '+attrs.join(' '):'')+'>');
 });
 parser.on('closetag',tag=>{output.push('</'+tag.local+'>');depth--;});parser.on('text',text=>output.push(escaped(text)));parser.on('cdata',text=>output.push(escaped(text)));
 parser.write(source).close();if(!root||depth||references.some(id=>!ids.has(id)))throw Error('SVG has missing local references.');return {svg:output.join(''),viewBox,elements:count};
}
