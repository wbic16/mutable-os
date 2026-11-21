import type {DcpSources} from './sources';
import {DcpValidationError,safeDiagnostic} from './diagnostics';
import {lowerXml,xmlDialect,type XmlAuthority} from './xml-authoring';
/** An exchange-local view of existing source authority, never a semantic registry. */
export class XmlContext implements XmlAuthority {
 synopsis?:string;
 private aliases=new Map<string,string>();private handles=new Map<string,string>();
 private revisions=new Map<string,string>();
 private epoch=crypto.randomUUID().replaceAll('-','').slice(0,10);
 constructor(readonly sources:DcpSources,readonly exchange:string){}
 alias(handle:string){this.sources.check();if(!this.sources.handles.has(handle))throw new DcpValidationError(safeDiagnostic({code:'source-identity'}));let a=this.handles.get(handle);if(!a){const type=this.sources.target(handle).kind;const prefix=({block:'b',entity:'e',range:'r',contribution:'c',argument:'a',gloss:'g'} as Record<string,string>)[type]??'ref';a='@'+prefix+this.epoch+'_'+(this.aliases.size+1);this.aliases.set(a,handle);this.handles.set(handle,a);}return a;}
 resolve(alias:string){this.sources.check();const h=this.aliases.get(alias);if(!h||!this.sources.handles.has(h))throw new DcpValidationError(safeDiagnostic({code:'source-identity'}));return h;}
 revision(alias:string){const h=this.resolve(alias),r=this.revisions.get(h);if(!r||this.sources.revisions.get(h)!==r)throw new DcpValidationError(safeDiagnostic({code:'source-identity'}));return r;}
 /** Only complete supplied reads grant selector authority. Projections cannot issue handles. */
 project(value:any):any {
  if(Array.isArray(value))return value.map(v=>this.project(v));
  if(!value||typeof value!=='object')return value;
  if(typeof value.handle==='string'&&this.sources.handles.has(value.handle)&&value.status==='complete'&&value.revision===this.sources.revisions.get(value.handle))this.revisions.set(value.handle,value.revision);
  const out:any={};for(const [k,v]of Object.entries(value)){
   if(Array.isArray(v)&&v.length===0)continue;
   if(['vaultId','propertyId','nativeId','revision','resourceId','owner','blockId','definitionId','entityId','metadata','definition','reference','nativeType'].includes(k)||k==='target'&&v&&typeof v==='object')continue;
   if(typeof v==='string'&&['handle','anchorHandle','entityHandle','glossHandle','source','anchor','from','to','focus','primaryReply'].includes(k)&&this.sources.handles.has(v))out[k]=this.alias(v);
   else if(['children','roots','replies','discursiveReferences','relations','semanticReferences','arguments'].includes(k)&&Array.isArray(v))out[k]=v.map(x=>typeof x==='string'&&this.sources.handles.has(x)?this.alias(x):this.project(x));
   else out[k]=this.project(v);
  }return out;
 }
 request(r:any){const structural=this.project(r.structuralContext),workspace=this.project(r.semanticWorkspace);return {dialect:xmlDialect,exchange:r.exchange,focus:this.alias(r.primaryReply),sources:structural?.sources??[],coverage:structural?.omissions??[],...(workspace?{workspace}:{}),capabilities:this.capabilities(r.capabilities?.items??[]).filter(i=>i.status==='authorable').map(i=>i.id),inline:r.vocabulary?.standoff?.filter((t:string)=>['style/bold','style/italics','mutable/entity-reference'].includes(t)||t.startsWith('dialectic/')).map((t:string)=>({'style/bold':'b','style/italics':'i','mutable/entity-reference':'e'} as Record<string,string>)[t]??t.replace('dialectic/','mark:')),limits:r.budgets};}
 capabilities(items:any[]){return items.filter(i=>Object.hasOwn(xmlCapabilities,i.id)).map(i=>({id:i.id,purpose:i.purpose,status:i.status}));}
 describe(result:any):any{return {dialect:xmlDialect,status:result.status,omittedIds:result.omittedIds,limits:result.limits,...(result.items?{items:result.items.map((i:any)=>({id:i.id,purpose:i.purpose,authorable:!!xmlCapabilities[i.id]&&i.authorable===true,constraints:i.constraints,...(xmlCapabilities[i.id]?{syntax:xmlCapabilities[i.id]}:{reason:'No qualified XML route in this increment.'})}))}:{status:'unavailable',reason:'No qualified XML description'} )};}
 toolArguments(tool:string,args:Record<string,unknown>){const out={...args};if(tool==='read_source'){this.sources.check();out.handle=this.aliases.get(String(args.handle))??'unissued-xml-alias';}if(tool==='list_text_blocks'&&typeof args.contributionId==='string'){const t=this.sources.target(this.resolve(args.contributionId));if(t.kind!=='contribution')throw new DcpValidationError(safeDiagnostic({code:'source-identity'}));out.contributionId=t.blockId;}return out;}
 bindings(){return Object.fromEntries(this.aliases);}
 lower(text:string,semanticsOnly=false){this.sources.check();this.synopsis=undefined;return lowerXml(text,this.exchange,this,value=>this.synopsis=value,undefined,semanticsOnly);}
}
export const xmlCapabilities:Record<string,string>={
 'composition.paragraph':'<p>Inline content</p>', 'composition.heading':'<h1> through <h6>; native heading levels.',
 'composition.group':'<group>Blocks</group>', 'composition.list':'<ul><li><p>Text</p></li></ul> or <ol start="3">; start is an integer. Each item contains Blocks.',
 'configuration.list-numbering':'<ol start="3">; native ordered-list start. No reversed/item-value XML attributes yet.',
 'composition.table':'<table><tr><td><p>Cell</p></td></tr></table>; nonempty rectangular rows; native bounds apply.',
 'composition.card-grid':'<grid><tr><td><p>Cell</p></td></tr></grid>; native grid preparation and bounds.',
 'media.external-image':'<image src="https://example.org/image.jpg" alt="Description"/>; native image Block, also inside grid cells. Use an actual image URL, not a page URL. No existing source Block required. Credential-free public HTTP(S) references only; native URL and size limits apply. Browser loads the image; remote availability is not verified. Embedding does not require search, acquisition or generation tools; do not invent URLs when retrieval is unavailable.',
 'composition.code':'<code language="typescript">const x = 1;</code>; XML-escape literal code; annotations are forbidden inside code.',
 'source.anchor':'<passage id="p" target="@b1" quote="exact text" prefix="" suffix=""/> in definitions. Complete source required. Neutral generated <span id="p">text</span>. Overlaps: inline <boundary id="a"/> and <boundary id="b"/>, then <range id="p" block="localBlockId" from="a" to="b"/> in definitions. Boundaries must be in that TextBlock.',
 'source.classification':'<classify target="passage" kind="claim|question|speculation|suggestion|objection|qualification"/>; also Block target with quote/context or whole="true".',
 'semantic.entity':'Optional metadata: ref="@existing" enriches an existing identity; subtypes, wikidata, gnd, thumbnail and typed date children are supported. Add known descriptions to distinguish identities. <entity id="e" name="Name" type="Person"><description>Optional</description><alias>Optional alias</alias></entity>; every new Entity needs an explicit mention.',
 'semantic.entity-relation':'<relation kind="entity" type="employed-by" from="e" to="@e1"/>; native scope and ownership apply. No qualified/confidence attributes.',
 'semantic.argument':'<argument id="a" target="passage"/>; Argument identity is separate from its passage.',
 'semantic.argument-relation':'<relation kind="argument" type="supports" from="a" to="@a1"/>; admitted native relation kinds and owned Argument endpoints required.',
 'semantic.gloss':'<gloss target="passage" kind="scope">Explanation</gloss>; Block target accepts exact quote/context or whole="true".',
 'reference.reply':'Optional response reply="passage argument" adds discursive references; primary reply remains host-controlled.'
};
