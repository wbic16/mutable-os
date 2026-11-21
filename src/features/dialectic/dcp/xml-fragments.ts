import {SaxesParser} from 'saxes';
import {compositionLimits} from './limits';
import {DcpValidationError,safeDiagnostic} from './diagnostics';

export type XmlElement={name:string;attrs:Record<string,string>;children:(XmlElement|string)[]};
export const xmlFailure=():never=>{throw new DcpValidationError(safeDiagnostic({code:'xml',path:'$'}));};
export const xmlElements=(e:XmlElement)=>e.children.filter((c):c is XmlElement=>{if(typeof c==='string'){if(c.trim())xmlFailure();return false;}return true;});

/** Incremental SAX framing shared by provisional display and final lowering.
 * No source lookup, semantic interpretation, native mutation or HTML parsing. */
export class XmlFragments {
 readonly roots:XmlElement[]=[];
 readonly diagnostics={characters:0,elements:0,fragments:0};
 private stack:XmlElement[]=[];
 private parser=new SaxesParser({xmlns:false,fragment:true});
 private tag='';private quote='';private closed=false;private failed=false;private bytes=0;private high='';
 get byteLength(){return this.bytes;}
 constructor(private emit:(element:XmlElement)=>void=()=>{}){
  this.parser.on('error',()=>xmlFailure());
  this.parser.on('doctype',()=>xmlFailure());
  this.parser.on('processinginstruction',()=>xmlFailure());
  this.parser.on('xmldecl',()=>xmlFailure());
  this.parser.on('cdata',()=>xmlFailure());
  this.parser.on('opentag',n=>{
   if(++this.diagnostics.elements>4096||this.stack.length>=48)xmlFailure();
   const e:XmlElement={name:n.name,attrs:n.attributes as Record<string,string>,children:[]};
   if(this.stack.length)this.stack.at(-1)!.children.push(e);else this.roots.push(e);
   this.stack.push(e);
  });
  this.parser.on('text',text=>{if(this.stack.length){const children=this.stack.at(-1)!.children;const last=children.at(-1);if(typeof last==='string')children[children.length-1]=last+text;else children.push(text);}else if(text.trim())xmlFailure();});
  this.parser.on('closetag',()=>{
   const e=this.stack.pop()!,parent=this.stack.at(-1);
   // Transparent legacy envelopes can show completed children before closing.
   const envelope=!parent||parent.name==='response'&&this.stack.length===1||parent.name==='definitions'&&(this.stack.length===1||this.stack.length===2&&this.stack[0].name==='response');
   if(envelope&&e.name!=='response'&&e.name!=='definitions'){this.diagnostics.fragments++;this.emit(e);}
  });
 }
 write(chunk:string){
  if(this.closed||this.failed)xmlFailure();
  try{
   this.diagnostics.characters+=chunk.length;if(this.diagnostics.characters>compositionLimits.responseBytes)xmlFailure();
   let counted=this.high+chunk;this.high='';if(/[\uD800-\uDBFF]$/.test(counted)){this.high=counted.slice(-1);counted=counted.slice(0,-1);}this.bytes+=new TextEncoder().encode(counted).length;if(this.bytes>compositionLimits.responseBytes)xmlFailure();
   // Preserve literal CR in text as the established DCP parser does. Tags are
   // buffered only until their own end, respecting quotes and comment delimiters.
   let ready='';
   for(const ch of chunk){
    if(!this.tag){if(ch==='<')this.tag='<';else ready+=ch==='\r'?'&#13;':ch;continue;}
    this.tag+=ch;
    if(this.tag.startsWith('<!--')){if(this.tag.endsWith('-->')){ready+=this.tag;this.tag='';}continue;}
    if(this.quote){if(ch===this.quote)this.quote='';else if(/[\r\n\t]/.test(ch))xmlFailure();continue;}
    if(ch==='"'||ch==="'"){this.quote=ch;continue;}
    if(ch==='>'){ready+=/^<br\s*\/?>$/i.test(this.tag)?'<br/>':this.tag;this.tag='';}
   }
   this.parser.write(ready);
  }catch(e){this.failed=true;throw e;}
 }
 finish(){
  if(this.closed||this.failed)xmlFailure();this.closed=true;
  try{if(this.tag||this.high)xmlFailure();this.parser.close();if(!this.roots.length||this.stack.length)xmlFailure();return this.roots;}catch(e){this.failed=true;throw e;}
 }
}

export function parseXmlFragments(text:string){const parser=new XmlFragments();parser.write(text);return parser.finish();}
