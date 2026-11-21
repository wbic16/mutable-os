import {STRUCTURED_BLOCK,structuredPayload} from '../structured/model';
import { passiveVideo } from './uri';
import { isSourceType, sourceFormat } from './source-block';
import { compileSourcePreview } from './source-preview';
import { convertSource } from './document-import';
import { validateFragment, safeUrl, type MutableFragment, type FragmentBlock, type Property } from './fragment';
import { diagnostic, type InterchangeDiagnostic } from './diagnostics';
import type { ExportFormat } from './formats';
export const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const md=(s:string)=>s.replace(/[\\`*_[\]{}<>#!|~&+.=\-]/g,'\\$&');
interface Mark {id:string;order:number;start:number;end:number;type:string;open:string;close:string}
/** Read-only operation-local projection. Never traverses mounted DOM or resolves URLs. */
export function exportFragment(input:MutableFragment,format:ExportFormat,title='Document',document=false, options:{links?:Record<string,string>;images?:Record<string,string>;entities?:boolean;rootOnly?:boolean;maxBytes?:number}={}) {
 const f=validateFragment(input),diagnostics:InterchangeDiagnostic[]=[],reported=new Set<string>(),warn=(code:string,detail:string)=>{const key=code+'\0'+detail;if(!reported.has(key)){reported.add(key);diagnostics.push(diagnostic(code,detail));}};
 for(const b of f.blocks){const collection=(b.data.metadata as any)?.collection;if(b.type==='document-block'&&collection?.mode==='source'&&collection.assets&&Object.keys(collection.assets).length)warn('collection-source-assets','This semantic projection does not resolve collection source bindings. Use source-format collection export for a document containing a single source Block to retain its attachments and reconciled links.');}
 const blocks=new Map(f.blocks.map(b=>[b.localId,b])),edges=new Map(f.placements.map(p=>[p.localId,p])),embeds=new Map(f.embeds.map(e=>[e.localId,e])),definitions=new Map(f.definitions.map(d=>[d.localId,d]));
 const image=(id:string)=>{const e=embeds.get(id)!,url=options.images?.[id];if(url){const alt=String(e.data.alt??'Image');return format==='html'?`<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">`:format==='markdown'?`![${md(alt)}](<${url}>)`:alt;}warn('image-reference','Images are exported as alt-text placeholders. Portable asset bundles are not part of this export.');const text=`[Image: ${String(e.data.alt??'Image')}]`;return format==='html'?escapeHtml(text):format==='markdown'?md(text):text;};
 const inline=(b:FragmentBlock)=>{
  if(!b.inline)return format==='html'?escapeHtml(String(b.data.text??'')):format==='markdown'?md(String(b.data.text??'')):String(b.data.text??'');
  const tokens=b.inline.atoms.flatMap(a=>{if(a.kind==='alternative')throw Error('This export cannot preserve native inline alternatives. Save as Mutable JSON.');return a.kind==='text'?[...a.text].map(text=>({text})): [{text:'\uFFFC',embed:a.embed}];});
  const marks:Mark[]=[];
  const htmlTags:Record<string,string>={'style/bold':'strong','style/italics':'em','style/underline':'u','style/strike':'s','style/strikethrough':'s','style/superscript':'sup','style/subscript':'sub'};
  for(const occurrence of b.inline.properties){
   let p=occurrence;
   if(p.target?.kind==='local'&&p.target.object==='definition'){const d=definitions.get(p.target.id);if(d)p={...p,type:d.type,attributes:d.attributes,target:d.target};}
   if(p.isZeroWidth){warn('point-annotation','Point annotations are marked in HTML and omitted from Markdown/plain text.');continue;}
   if(format==='text'){warn('annotation-projection','Plain text omits annotation styling and targets.');continue;}
   let open='',close='';
   if(htmlTags[p.type]){
    if(format==='html'){open=`<${htmlTags[p.type]}>`;close=`</${htmlTags[p.type]}>`;}
    else if(p.type==='style/bold'||p.type==='style/italics'){open=close=p.type==='style/bold'?'**':'*';}
    else warn('markdown-mark',`Markdown omits ${p.type}.`);
   }else if(options.links?.[occurrence.localId]){
    const url=options.links[occurrence.localId];open=format==='html'?`<a href="${escapeHtml(url)}">`:'[';close=format==='html'?'</a>':`](<${url}>)`;
   }else if(p.type==='reference/url'&&p.target?.kind==='url'&&safeUrl(p.target.url)){
    const url=p.target.url.trim();
    if(format==='html'){open=`<a href="${escapeHtml(url)}" rel="noopener noreferrer">`;close='</a>';}
    else {open='[';close=`](<${url.replace(/[<>\\\s|]/g,c=>encodeURIComponent(c))}>)`;}
   }else if(p.type==='codex/block-reference'&&p.target?.kind==='local'&&p.target.object==='block'){
    open=format==='html'?`<a href="#${escapeHtml(p.target.id)}">`:'[';close=format==='html'?'</a>':`](#${encodeURIComponent(p.target.id)})`;
   }else if(options.entities&&format==='html'&&['codex/claim-reference','codex/time-reference'].includes(p.type)&&typeof p.attributes.value==='string'){open=`<button type="button" data-ink-${p.type==='codex/claim-reference'?'claim':'entity'}="${escapeHtml(p.attributes.value)}">`;close='</button>';
   }else if(options.entities&&format==='html'&&p.type==='codex/entity-reference'&&p.target?.kind==='external'&&p.target.object==='entity'){open=`<button type="button" data-ink-entity="${escapeHtml(p.target.id)}">`;close='</button>';
   }else warn('annotation-unsupported',`Export retains text but omits ${p.type} semantics.`);
   if(open){
    let start=p.startIndex,end=p.endIndex;
    if(format==='markdown'&&p.type!=='reference/url'&&p.type!=='codex/block-reference'){
     while(start<end&&/\s/.test(tokens[start].text))start++;while(end>start&&/\s/.test(tokens[end-1].text))end--;
     if(start!==p.startIndex||end!==p.endIndex)warn('markdown-whitespace','Whitespace at formatting boundaries is exported outside Markdown marks.');
     if(tokens.slice(start,end).some(t=>t.text==='\n')){warn('markdown-multiline','Formatting across line breaks is exported as plain text.');continue;}
    }
    if(start<end)marks.push({id:p.localId,order:marks.length,start,end,type:p.type,open,close});
   }
  }
  marks.sort((a,b)=>a.start-b.start||b.end-a.end||a.order-b.order);
  if(format==='markdown'){
   // Reject crossing syntax, and nesting identical delimiters, before emission.
   const stack:Mark[]=[],accepted:Mark[]=[];
   for(const mark of marks){while(stack.length&&stack.at(-1)!.end<=mark.start)stack.pop();
    if(stack.some(p=>mark.end>p.end||p.open===mark.open||p.open==='['&&mark.open==='[')){warn('markdown-overlap','Crossing or incompatible overlapping annotations lose their inner Markdown mark.');continue;}
    accepted.push(mark);stack.push(mark);
   }marks.splice(0,marks.length,...accepted);
  }
  const starts=new Map<number,Mark[]>(),ends=new Map<number,Mark[]>(),points=new Map<number,Property[]>();
  for(const m of marks){starts.set(m.start,[...starts.get(m.start)??[],m]);ends.set(m.end,[...ends.get(m.end)??[],m]);}
  for(const p of b.inline.properties)if(p.isZeroWidth)points.set(p.startIndex,[...points.get(p.startIndex)??[],p]);
  const boundaries=[...new Set([0,tokens.length,...starts.keys(),...ends.keys(),...points.keys()])].sort((a,b)=>a-b);
  const active=new Set<Mark>();let opened:Mark[]=[],out='';
  const transition=(next:Mark[])=>{let common=0;while(common<opened.length&&common<next.length&&opened[common]===next[common])common++;for(let i=opened.length-1;i>=common;i--)out+=opened[i].close;for(let i=common;i<next.length;i++)out+=next[i].open;opened=next;};
  boundaries.forEach((at,i)=>{
   ends.get(at)?.forEach(m=>active.delete(m));starts.get(at)?.forEach(m=>active.add(m));
   let next=[...active].sort((a,b)=>a.start-b.start||b.end-a.end||a.order-b.order);
   const links=next.filter(m=>m.open.startsWith('<a ')||m.open.startsWith('<button ')||m.open==='[');
   if(links.length>1){const winner=[...links].sort((a,b)=>(a.end-a.start)-(b.end-b.start)||a.order-b.order)[0];next=next.filter(m=>!links.includes(m)||m===winner);warn('overlapping-links','Overlapping links use the most specific target; other targets are omitted.');}
   transition(next);
   if(format==='html')for(const p of points.get(at)??[])out+=`<span data-ink-point="${escapeHtml(p.localId)}" title="${escapeHtml(p.type)}">&#x25C7;</span>`;
   for(let n=at;n<(boundaries[i+1]??at);n++){const t=tokens[n] as {text:string;embed?:string};out+=t.embed?image(t.embed):format==='html'?(t.text==='\n'?'<br>':escapeHtml(t.text)):format==='markdown'?(t.text==='\n'?'  \n':md(t.text)):t.text;}
  });transition([]);return out;
 };
 const seen=new Set<string>();let budget=10000;
 const get=(edge:string)=>{const p=edges.get(edge);return p?.target.kind==='local'?blocks.get(p.target.id):undefined;};
 const visit=(edge:string, inListItem = false):string=>{
  if(--budget<0)throw Error('Export traversal limit exceeded.');
  const b=get(edge);if(!b){warn('external-block','Out-of-document Blocks remain unresolved links.');return '[Unresolved Block]';}
  if(seen.has(b.localId)){warn('repeated-block','Repeated or cyclic Block bodies are exported once.');return format==='html'?`<a href="#${escapeHtml(b.localId)}">Repeated Block</a>`:'[Repeated Block]';}seen.add(b.localId);
  if(b.type==='resource-information-block'){warn('private-reverse','Resource information is excluded from reading exports.');return '';}
  if(b.type==='surface-block'){warn('private-reverse','Reverse faces are excluded from reading exports.');return b.children[0]?visit(b.children[0]):'';}
  if(b.data.packageAuthoredSource)warn('authored-value-preserved','Non-JSON authored values are preserved in an inactive native-codec carrier and are not used for presentation.');
  const meta=b.data.metadata as any??{},children=()=>b.children.map(edge => visit(edge)).join(format==='html'?'':format==='text'?'\n':'\n\n');
  let result='';
  if(b.type==='mutable/video-block'&&passiveVideo(b.data.video)){
   const v=passiveVideo(b.data.video)!;result=format==='html'?`<p><a href="${escapeHtml(v.canonicalUrl)}" rel="noopener noreferrer">${escapeHtml(v.title??v.canonicalUrl)}</a></p>`:format==='markdown'?`[${md(v.title??v.canonicalUrl)}](<${v.canonicalUrl}>)`:v.canonicalUrl;
  }else if(b.type===STRUCTURED_BLOCK&&structuredPayload(b.data)){
   const text=String(b.data.text);result=format==='html'?`<pre><code>${escapeHtml(text)}</code></pre>`:format==='markdown'?text.split('\n').map(line=>'    '+line).join('\n'):text;
   warn('read-only-source','Read-only resource exported as inert source; structured presentation and binary original require Ink package.');
  }else if(isSourceType(b.type)){
   const kind=sourceFormat(b.type,b.data),source=String(b.data.text);
   if(format==='html'){const preview=compileSourcePreview(source,kind);result=preview.body;for(const detail of preview.warnings)warn('source-preview-policy',detail);if(preview.links.length)warn('source-links','Source links export as inert text; navigation targets are omitted.');}
   else {const converted=convertSource(source,kind),projected=exportFragment(converted.fragment,format);result=projected.text;diagnostics.push(...converted.diagnostics,...projected.diagnostics);}
   if(b.blockProperties.length||b.data.standoffProperties||b.data.inactiveSourceAnnotations)warn('source-annotations','Inactive source annotations and Block presentation are omitted from semantic export.');
   result+=(format==='html'?'':'\n\n')+children();
  }else if(b.type==='standoff-editor-block'||b.type==='plain-text-block'){
   const body=inline(b),h=Number(meta.htmlHeadingLevel)||Number(b.blockProperties.find(p=>/block\/font\/size\/h[1-4]$/.test(p.type))?.type.at(-1))||Number(b.blockProperties.find(p=>p.type==='block/font/size')?.attributes.value?.toString().replace('h',''));
   const heading=h>=1&&h<=6?Math.floor(h):0;
   if(meta.htmlPreformatted){
    const raw=b.inline?.atoms.map(a=>a.kind==='text'?a.text:'[Image]').join('')??String(b.data.text??'');
    if(b.inline?.properties.length)warn('code-marks','Code export retains source text and omits annotations inside the code block.');
    const fence='`'.repeat(Math.max(3,...[...raw.matchAll(/`+/g)].map(m=>m[0].length+1))),language=String(meta.markdownCode?.language??'').replace(/[^a-z0-9_+-]/gi,'').slice(0,40);
    result=format==='html'?`<pre id="${escapeHtml(b.localId)}"><code>${escapeHtml(raw)}</code></pre>`:format==='markdown'?`${fence}${language}\n${raw}${raw.endsWith('\n')?'':'\n'}${fence}`:raw;
   }else result=format==='html'?`<${heading?'h'+heading:'p'} id="${escapeHtml(b.localId)}">${body}</${heading?'h'+heading:'p'}>`:format==='markdown'?`${'#'.repeat(heading)}${heading?' ':''}${body}`:body;
   for(const p of b.blockProperties)if(!p.type.startsWith('block/font/size'))warn('block-presentation',`Block presentation ${p.type} is omitted.`);
   if(b.children.length)result+=(format==='html'?'':'\n\n')+children();
  }else if(b.type==='indented-list-block'){
   const list=meta.htmlList??{},ordered=!!list.ordered;let n=Number(list.start)||1;
   const items=b.children.map(edge=>{const item=get(edge),value=Number((item?.data.metadata as any)?.htmlListItem?.value);if(Number.isFinite(value))n=value;const number=n;n+=list.reversed?-1:1;const body=visit(edge, true);
    const checked=item?.type==='checkbox-block'?item.data.checked===true:typeof item?.data.checked==='boolean'?item.data.checked:undefined;
    const task=checked===undefined?'':format==='html'?`<input type="checkbox" disabled${checked?' checked':''}>`:`[${checked?'x':' '}] `;
    if(format==='html')return `<li${ordered?` value="${number}"`:''}>${task}${body}</li>`;
    const prefix=ordered?`${number}. `:'- ';return prefix+task+body.replace(/\n/g,'\n'+' '.repeat(prefix.length+task.length));});
   if(format==='markdown'&&list.reversed)warn('reversed-list','Markdown readers may renumber a reversed list.');
   result=format==='html'?`<${ordered?'ol':'ul'} id="${escapeHtml(b.localId)}"${ordered?` start="${Number(list.start)||1}"${list.reversed?' reversed':''}`:''}>${items.join('')}</${ordered?'ol':'ul'}>`:items.join('\n');
  }else if(['table-block','grid-block'].includes(b.type)){
   const rows=b.children.map(get),grid=rows.map(r=>r?.children.map(get)??[]);
   if(format==='html')result=`<table id="${escapeHtml(b.localId)}">${b.children.map(edge => visit(edge)).join('')}</table>`;
   else {
    const simple=grid.length>0&&grid[0].length>0&&grid.every(row=>row.length===grid[0].length&&row.every(c=>c&&!(Number((c.data.metadata as any)?.htmlTableCell?.colSpan)>1)&&!(Number((c.data.metadata as any)?.htmlTableCell?.rowSpan)>1)&&c.children.length===1&&get(c.children[0])?.type==='standoff-editor-block'&&!get(c.children[0])?.children.length));
    const values=grid.map(row=>row.map(c=>c?c.children.map(edge => visit(edge)).join(' / '):'').map(v=>v.replace(/\r?\n/g,' ')));
    const headers=grid[0]?.every(c=>(c?.data.metadata as any)?.htmlTableCell?.header)||(meta.headerRows===1);
    if(format==='markdown'&&simple&&headers){const lines=values.map(row=>`| ${row.join(' | ')} |`);lines.splice(1,0,`| ${grid[0].map(()=>'---').join(' | ')} |`);result=lines.join('\n');}
    else {if(format==='markdown')warn('table-fallback','Complex or headerless tables are exported as labeled plain rows.');result=values.map((row,i)=>(format==='markdown'?`Row ${i+1}: `:'')+row.join('\t')).join('\n');}
   }
  }else if(['table-row-block','grid-row-block'].includes(b.type))result=format==='html'?`<tr>${children()}</tr>`:children();
  else if(['table-cell-block','grid-cell-block'].includes(b.type)){
   const cell=meta.htmlTableCell??{},tag=cell.header?'th':'td';if(cell.colSpan>1||cell.rowSpan>1)warn('table-spans','Merged table layout was previously flattened; span metadata is not reapplied.');
   result=format==='html'?`<${tag}>${children()}</${tag}>`:children();
  }else if(['document-block','page-block','container-block','checkbox-block','book-block','side-block'].includes(b.type))result=format==='html'?`<div id="${escapeHtml(b.localId)}">${children()}</div>`:children();
  else {warn('block-fallback',`Presentation of ${b.type} is flattened or represented by a label.`);const label=`[${b.type}]`;result=(format==='html'?`<p id="${escapeHtml(b.localId)}">${escapeHtml(label)}</p>`:format==='markdown'?md(label):label)+(b.inline?inline(b):'')+children();}
  for(const [name,relation]of Object.entries(b.relations)){warn('relation-layout',`Related ${name} content is exported after its owner.`);result+=(format==='html'?`<aside><p>${escapeHtml(name)}</p>${visit(relation)}</aside>`:`\n\n[${format==='markdown'?md(name):name}]\n${visit(relation)}`);}
  const checked=b.type==='checkbox-block'?b.data.checked===true:typeof b.data.checked==='boolean'?b.data.checked:undefined;
  if(checked!==undefined&&!inListItem) {
   result=format==='html'?`<ul><li><input type="checkbox" disabled${checked?' checked':''}>${result}</li></ul>`:
    `${format==='markdown'?'- ':''}[${checked?'x':' '}] ${result.replace(/\n/g,'\n      ')}`;
  }
  return result;
 };
 const body=(options.rootOnly?f.roots.slice(0,1):f.roots).map(r=>visit(r.placement)).join(format==='html'?'':format==='text'?'\n':'\n\n');
 const text=format==='html'&&document?`<!doctype html>\n<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; ${options.images?"img-src 'self' data: blob:; ":''}base-uri 'none'; form-action 'none'"><title>${escapeHtml(title)}</title></head><body>${body}</body></html>`:body;
 if(new TextEncoder().encode(text).length>(options.maxBytes??16*1024*1024))throw Error('Export exceeds the 16 MiB output limit.');
 return {text,diagnostics,mediaType:format==='html'?'text/html':format==='markdown'?'text/markdown':'text/plain',extension:format==='html'?'html':format==='markdown'?'md':'txt'};
}
