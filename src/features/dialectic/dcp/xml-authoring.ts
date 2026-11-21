import {compactEntityDate} from '../../../feature-api/entity-enrichment';
import {parseXmlFragments,xmlElements,xmlFailure,type XmlElement} from './xml-fragments';

export const xmlDialect='xml/1' as const;
export interface XmlAuthority { resolve(alias:string):string; revision(alias:string):string; }
type Element=XmlElement;
const fail=xmlFailure;
export const xmlEscape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll('\r','&#13;').replaceAll('\n','&#10;').replaceAll('\t','&#9;');
const elements=xmlElements;
const attrs=(e:Element,allowed:string[],required:string[]=[])=>{if(Object.keys(e.attrs).some(k=>!allowed.includes(k))||required.some(k=>!e.attrs[k]))fail();return e.attrs;};
const textOnly=(e:Element)=>e.children.map(c=>typeof c==='string'?c:fail()).join('');
const empty=(e:Element)=>{if(e.children.length)fail();};
const referenceKinds:Record<string,string>={b:'Block',s:'passage',r:'source passage',e:'Entity',arg:'Argument',pos:'boundary',m:'annotation',g:'Gloss',rel:'relationship'};
export function assertXmlReferenceKind(name:string,actual:string,expected?:string[]){
 if(expected&&!expected.includes(actual))throw Error(`XML reference "${name}" identifies ${referenceKinds[actual]??actual}; expected ${expected.map(k=>referenceKinds[k]??k).join(' or ')}.`);
}
const classify=['claim','question','speculation','suggestion','objection','qualification'];

/** Optional navigational metadata, never a native text Block or semantic ID. */
export function xmlSynopsis(e:XmlElement):string|undefined {
 if(Object.keys(e.attrs).length||e.children.some(c=>typeof c!=='string'))return;
 const text=(e.children as string[]).join('').replace(/\s+/g,' ').trim();
 if(!text||text.length>160||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))return;
 return text;
}
/** Envelope validation does not reinterpret already-admitted or skipped semantics. */
export function xmlResponseElements(parsed:XmlElement[]){
 const wrapped=parsed[0]?.name==='response';
 if(wrapped&&parsed.length!==1||!wrapped&&parsed.some(e=>e.name==='response'))fail();
 const root=wrapped?parsed[0]:{name:'response',attrs:{},children:parsed};attrs(root,['intent','reply']);
 const all=elements(root),rows:Element[]=[],definitions:Element[]=[],synopses:Element[]=[];
 for(const e of all){if(e.name==='synopsis')synopses.push(e);else if(e.name==='definitions'){attrs(e,[]);for(const d of elements(e))(d.name==='synopsis'?synopses:definitions).push(d);}else if(xmlDefinitionNames.has(e.name))definitions.push(e);else rows.push(e);}
 return {root,rows,definitions,synopses};
}

/** Lower intentions to existing DCP input. This never generates native DTOs. */
export function lowerXml(text:string,exchange:string,authority:XmlAuthority,onSynopsis?:(text:string)=>void,onUnsupportedInline?:(name:string)=>void,semanticsOnly=false){
 const {root,rows,definitions,synopses}=xmlResponseElements(parseXmlFragments(text));
 for(const e of synopses){const value=xmlSynopsis(e);if(value)onSynopsis?.(value);}
 if(semanticsOnly?rows.length>0:!rows.length)fail();
 const defs:Element={name:'definitions',attrs:{},children:definitions};
 const symbols=new Map<string,{id:string;kind:string}>(),allocated=new WeakMap<Element,string>(),counts:Record<string,number>={};
 const kind=xmlSymbolKind;
 const allocate=(e:Element)=>{const k=kind(e);if(!k){if(e.attrs.id)fail();return;}const id='new:'+k+(counts[k]=(counts[k]??0)+1);allocated.set(e,id);if(e.attrs.id){const name=e.attrs.id;if(!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name)||symbols.has(name))fail();symbols.set(name,{id,kind:k});}};
 const walk=(e:Element)=>{allocate(e);for(const c of e.children)if(typeof c!=='string')walk(c);};rows.forEach(walk);if(defs)for(const e of elements(defs))walk(e);
 const id=(e:Element)=>allocated.get(e)??fail();
 const ref=(name:string,kinds?:string[])=>{if(typeof name!=='string')fail();if(name.startsWith('@'))return authority.resolve(name);const s=symbols.get(name);if(!s)fail();assertXmlReferenceKind(name,s!.kind,kinds);return s!.id;};
 const output:any={protocol:'dcp/1.0',kind:'contribution',exchange,intent:root.attrs.intent??'reply',replyTargets:root.attrs.reply?root.attrs.reply.split(/\s+/).map(r=>ref(r)):[],composition:[],anchors:[],entities:[],interpretations:[],arguments:[],glosses:[],relations:[],suggestions:[],promotionRecommendations:[]};
 const blocks=new Map<string,any>();
 const block=xmlBlockLowerer(id,ref,blocks,undefined,onUnsupportedInline);
 output.composition=rows.map(block);
 for(const e of elements(defs))xmlDefinition(e,{id,ref,authority,blocks,output});
 return output;
}

export const xmlDefinitionNames=new Set(['entity','passage','mention','classify','argument','gloss','relation','range']);
/** Shared syntax/shape lowering for complete and incremental native preparation. */
export function xmlBlockLowerer(id:(e:Element)=>string,ref:(name:string,kinds?:string[])=>string,blocks=new Map<string,any>(),deferEntity?:(e:Element,span:string)=>void,onUnsupportedInline?:(name:string)=>void){
 const inline=(items:(Element|string)[]):string=>items.map(e=>{if(typeof e==='string')return xmlEscape(e);
  if(e.name==='boundary'){attrs(e,['id'],['id']);empty(e);return `<boundary id="${id(e)}"/>`;}
  if(e.name==='br'){attrs(e,[]);empty(e);return '&#10;';}
  if(['script','style','iframe','object','embed'].includes(e.name))fail();
  const tagName=e.name==='strong'?'b':e.name==='em'?'i':e.name;
  if(!['b','i','e','span','mark'].includes(tagName)){onUnsupportedInline?.(e.name);return inline(e.children);}
  attrs(e,['id',...(e.name==='e'?['ref']:e.name==='mark'?['kind']:[])],e.name==='span'?['id']:e.name==='e'?['ref']:e.name==='mark'?['kind']:[]);
  if(e.name==='e'&&deferEntity){deferEntity(e,id(e));return `<span id="${id(e)}">${inline(e.children)}</span>`;}
  if(e.name==='mark'&&!classify.includes(e.attrs.kind))fail();const tag=e.name==='mark'?'annotation':tagName;
  return `<${tag}${e.attrs.id?` id="${id(e)}"`:''}${e.name==='e'?` ref="${ref(e.attrs.ref,['e'])}"`:e.name==='mark'?` type="dialectic/${e.attrs.kind}"`:''}>${inline(e.children)}</${tag}>`;
 }).join('');
 const block=(e:Element):any=>{const a=e.attrs;let result:any;
  if(e.name==='p'||/^h[1-6]$/.test(e.name)){attrs(e,['id']);result={id:id(e),kind:e.name==='p'?'paragraph':'heading',...(e.name==='p'?{}:{level:Number(e.name[1])}),markup:inline(e.children),ranges:[]};}
  else if(['ul','ol'].includes(e.name)){attrs(e,['id',...(e.name==='ol'?['start']:[])]);const items=elements(e).map(li=>{if(li.name!=='li')fail();attrs(li,[]);return elements(li).map(block);});result={id:id(e),kind:'list',style:e.name==='ul'?'bullet':'ordered',items};if(a.start!==undefined){if(!/^-?\d+$/.test(a.start)||!Number.isSafeInteger(Number(a.start)))fail();result.configuration={start:Number(a.start),reversed:false,items:items.map(()=>({value:null,checked:null}))};}}
  else if(['table','grid'].includes(e.name)){attrs(e,['id']);result={id:id(e),kind:e.name,rows:elements(e).map(row=>{if(row.name!=='tr')fail();attrs(row,[]);return elements(row).map(cell=>{if(cell.name!=='td')fail();attrs(cell,[]);return elements(cell).map(block);});})};}
  else if(e.name==='group'){attrs(e,['id']);result={id:id(e),kind:'group',children:elements(e).map(block)};}
  else if(e.name==='code'){attrs(e,['id','language']);result={id:id(e),kind:'code',language:a.language??'plain',text:textOnly(e)};}
  else if(e.name==='image'){attrs(e,['id','src','alt'],['src']);empty(e);result={id:id(e),kind:'external-image',url:a.src,alt:a.alt??''};}
  else return fail();blocks.set(result.id,result);return result;
 };
 return block;
}

/** Definition shape validation is shared with incremental native preparation. */
export function xmlDefinition(e:Element,{id,ref,authority,blocks,output}:{id:(e:Element)=>string;ref:(name:string,kinds?:string[])=>string;authority:XmlAuthority;blocks:Map<string,any>;output:any}){
 const target=(e:Element):any=>{const a=e.attrs,name=a.target;if(!name)fail();const selection=['quote','whole','prefix','suffix'].some(k=>k in a);
  if(!selection)return ref(name,['s','r']);if((a.whole!==undefined&&(a.whole!=='true'||a.quote!==undefined||a.prefix!==undefined||a.suffix!==undefined))||a.whole===undefined&&!a.quote)fail();
  const block=ref(name,['b']),revision=name.startsWith('@')?authority.revision(name):null;
  return a.whole?{block,revision,whole:true}:{block,revision,quote:a.quote,prefix:a.prefix??'',suffix:a.suffix??''};};
 const targetAttrs=['target','quote','prefix','suffix','whole'];
 const a=e.attrs;
  if(e.name==='entity'){
   attrs(e,['id','name','type','ref','subtypes','wikidata','gnd','thumbnail'],['id','name','type']);const children=elements(e);
   if(children.some(c=>!['description','alias','date'].includes(c.name))||children.filter(c=>c.name==='description').length>1)fail();
   children.forEach(c=>attrs(c,c.name==='date'?['type','value','end','precision','approximation','certainty','qualifier','expression','extentKind','normalizationProfile']:[],c.name==='date'?['type','value']:[]));
   const dates=children.filter(c=>c.name==='date').map(c=>{empty(c);return compactEntityDate(c.attrs);});
   const enrichment={subtypes:a.subtypes?a.subtypes.split(',').map(s=>s.trim()).filter(Boolean):[],dates,externalIds:[...a.wikidata?[{namespace:'wikidata',value:a.wikidata}]:[],...a.gnd?[{namespace:'gnd',value:a.gnd}]:[]],...a.thumbnail?{thumbnail:{url:a.thumbnail}}:{}};
   output.entities.push({id:id(e),name:a.name,typename:a.type,description:children.find(c=>c.name==='description')?textOnly(children.find(c=>c.name==='description')!):'',aliases:children.filter(c=>c.name==='alias').map(textOnly),...a.ref?{ref:ref(a.ref,['e'])}:{},...dates.length||a.subtypes||a.wikidata||a.gnd||a.thumbnail?{enrichment}:{}});
  }
  else if(e.name==='passage'){attrs(e,['id','target','quote','prefix','suffix'],['id','target','quote']);empty(e);if(!a.target.startsWith('@'))fail();output.anchors.push({id:id(e),source:authority.resolve(a.target),revision:authority.revision(a.target),selector:{exact:a.quote,prefix:a.prefix??'',suffix:a.suffix??''}});}
  else if(e.name==='mention'||e.name==='classify'){attrs(e,['id',...targetAttrs,e.name==='mention'?'ref':'kind'],['target',e.name==='mention'?'ref':'kind']);empty(e);if(e.name==='classify'&&!classify.includes(a.kind))fail();output.interpretations.push({id:id(e),target:target(e),type:e.name==='mention'?'mutable/entity-reference':'dialectic/'+a.kind,ref:e.name==='mention'?ref(a.ref,['e']):null,attributes:[]});}
  else if(e.name==='argument'){attrs(e,['id',...targetAttrs],['id','target']);empty(e);output.arguments.push({id:id(e),anchor:target(e)});}
  else if(e.name==='gloss'){attrs(e,['id',...targetAttrs,'kind'],['target','kind']);output.glosses.push({id:id(e),target:target(e),type:a.kind,text:textOnly(e)});}
  else if(e.name==='relation'){attrs(e,['id','kind','type','from','to'],['kind','type','from','to']);empty(e);if(!['entity','argument'].includes(a.kind))fail();output.relations.push({id:id(e),kind:a.kind,type:a.type,from:ref(a.from,[a.kind==='entity'?'e':'arg']),to:ref(a.to,[a.kind==='entity'?'e':'arg'])});}
  else if(e.name==='range'){attrs(e,['id','block','from','to'],['id','block','from','to']);empty(e);const b=blocks.get(ref(a.block,['b']));if(!b||!Array.isArray(b.ranges))fail();b.ranges.push({id:id(e),type:'dcp/passage',from:ref(a.from,['pos']),to:ref(a.to,['pos']),ref:null,attributes:[]});}
  else fail();
}

export const xmlSymbolKind=(e:XmlElement):string|undefined=>/^(p|h[1-6]|ul|ol|table|grid|group|code|image)$/.test(e.name)?'b':/^(span|mark|b|i|strong|em|e|range)$/.test(e.name)?'s':({boundary:'pos',entity:'e',passage:'r',mention:'m',classify:'m',argument:'arg',gloss:'g',relation:'rel'} as Record<string,string>)[e.name];
