import {XmlFragments,type XmlElement} from './xml-fragments';
import {xmlBlockLowerer,xmlDefinition,xmlDefinitionNames,xmlSymbolKind,assertXmlReferenceKind,xmlResponseElements,xmlSynopsis,type XmlAuthority} from './xml-authoring';
import {nativePreparationSession,semanticPreparationCheckpoint,prepare} from './exchange';
import {DcpValidationError} from './diagnostics';
import {compositionLimits} from './limits';
import type {ContributionNotice} from '../model';
import type {DcpSources} from './sources';
import type {ReactiveEditor} from '../../../reactive-editor/editor';

class PendingReference extends Error {}
export class NativeStreamError extends Error {readonly nativeContentRetained=true;constructor(reason:unknown){super(reason instanceof Error?reason.message:String(reason));}}
export type NativePrepared=Awaited<ReturnType<typeof prepare>>;
/** A fragment compiler driving the existing native preparation path. No display
 * DTOs, parallel repository, whole-prefix reparsing or replacement rendering. */
export class NativeXmlStream {
 readonly memory=nativePreparationSession();
 parser:XmlFragments;
 readonly metrics={fragments:0,blocks:0,preparations:0};
 private symbols=new Map<string,{id:string;kind:string}>();
 private allocated=new WeakMap<XmlElement,string>();
 private counts:Record<string,number>={};
 private shapes=new Map<string,any>();
 private waiting:XmlElement[]=[];
 private discarded=new WeakSet<XmlElement>();
 private mentions:{id:string;target:string;ref:string}[]=[];
 private pending=Promise.resolve();
 private error?:unknown;
 private warnings:string[]=[];
 private warningCount=0;
 private contentWarningCount=0;
 get notices():ContributionNotice[]{const count=this.warningCount+this.contentWarningCount;return count?[{version:1,code:'incomplete-operation',severity:'warning',loss:true,detail:[this.warningCount?`${this.warningCount} semantic operation${this.warningCount===1?' was':'s were'} skipped.`:'',this.contentWarningCount?`${this.contentWarningCount} content fragment${this.contentWarningCount===1?' was':'s were'} adjusted or skipped.`:'',this.warnings.join(' '),count>this.warnings.length?'Further details are in the received XML.':''].filter(Boolean).join(' ')}]:[];}
 private warn(label:string,error:unknown,content=false){this.options.sources.check();if(content)this.contentWarningCount++;else this.warningCount++;const detail=error instanceof DcpValidationError&&error.diagnostic.code==='xml'?'Unsupported attributes or structure.':error instanceof Error?error.message:String(error);if(this.warnings.length<6)this.warnings.push(`${label}: ${detail}`.slice(0,240));}
 private syntaxError?:unknown;
 private closed=false;
 private final?:{intent:string;discursiveReferences:import('../model').ReplyTarget[]};
 private consumed=0;
 private buffer='';
 private completed:string[]=[];
 private completedBytes=0;
 private completedCharacters=0;
 private completedElements=0;
 private sealed=false;
 private intent='reply';
 private replies=new Set<string>();
 constructor(private options:{editor:ReactiveEditor;sources:DcpSources;authority:XmlAuthority;exchange:string;owner:string;participant:string;apply:(result:NativePrepared)=>void;onSynopsis?:(text:string)=>void}){
  this.parser=this.createParser();
 }
 private createParser(){return new XmlFragments(e=>{this.metrics.fragments++;this.pending=this.pending.then(async()=>{if(this.closed||this.error)return;try{await this.element(e);}catch(error){this.error=error;}});});}
 get started(){return this.metrics.blocks>0||!!this.memory.memory&&Object.keys(this.memory.memory.definitions).length>0;}
 write(value:string){
  if(this.closed)return;
  // The transport supplies cumulative text; parse only the new suffix.
  if(value.length<this.consumed){this.error=Error('Provider replaced an active native response');return;}
  this.buffer=value;const delta=value.slice(this.consumed);this.consumed=value.length;
  if(this.error||this.syntaxError||this.sealed)return;
  try{
   if(this.completedCharacters+value.length>compositionLimits.responseBytes)throw Error('Native response budget exceeded across tool rounds');
   this.parser.write(delta);
   if(this.completedBytes+this.parser.byteLength>compositionLimits.responseBytes||this.completedElements+this.parser.diagnostics.elements>4096)throw Error('Native response budget exceeded across tool rounds');
  }catch(error){this.syntaxError=error;}
 }
 private sealRound(){
  if(this.sealed)return;
  if(this.error||this.syntaxError)throw new NativeStreamError(this.error??this.syntaxError);
  // Tool-only rounds may be empty. Nonempty rounds must close their own XML;
  // a later provider turn cannot repair an unfinished element around a tool call.
  if(this.buffer.trim()){
   try{const {root}=xmlResponseElements(this.parser.finish());if(root.attrs.intent)this.intent=root.attrs.intent;for(const reply of root.attrs.reply?.split(/\s+/)??[])this.replies.add(reply);}
   catch(error){this.syntaxError=error;throw new NativeStreamError(error);}
  }
  this.sealed=true;
 }
 /** Tool continuation retains native identities, pending semantics and cumulative budgets. */
 continueRound(value:string){
  if(this.closed||this.final)throw new NativeStreamError('Native response is already complete');
  this.write(value);this.sealRound();
  this.completed.push(this.buffer);this.completedBytes+=this.parser.byteLength+1;this.completedCharacters+=this.buffer.length+1;this.completedElements+=this.parser.diagnostics.elements;
  this.buffer='';this.consumed=0;this.sealed=false;this.parser=this.createParser();
 }
 async finish(value:string){
  if(this.final)return this.final;
  this.write(value);await this.pending;
  this.sealRound();
  await this.pending;
  if(this.error||this.syntaxError)throw new NativeStreamError(this.error??this.syntaxError);
  // Keep valid content and report unresolved semantic dependencies locally.
  for(const item of this.waiting)this.warn(item.name,`Target or dependency "${item.attrs.target??item.attrs.ref??item.attrs.id??''}" could not be resolved.`);
  for(const item of this.mentions)this.warn('Entity mention',`Reference "${item.ref}" could not be resolved.`);
  this.waiting=[];this.mentions=[];
  if(!this.metrics.blocks)throw new NativeStreamError('No complete native Blocks were received.');
  const out=this.response();out.intent=this.intent;out.replyTargets=[...this.replies].map(name=>this.ref(name));
  const {editor,sources,exchange,owner,participant}=this.options;
  const result=await prepare(JSON.stringify(out),exchange,owner,editor.visualEffects,sources,editor.features.scopedSemantics,'ai',participant,1,editor.features.dcpProactiveSemanticAuthoring?1:undefined,true,this.memory);
  return this.final={intent:result.intent,discursiveReferences:result.discursiveReferences};
 }
 stop(){this.closed=true;}
 get received(){return [...this.completed,this.buffer].join('\n');}
 get unresolved(){return this.waiting.length+this.mentions.length;}
 private fresh(kind:string){return `new:${kind}${this.counts[kind]=(this.counts[kind]??0)+1}`;}
 private id=(e:XmlElement)=>{const id=this.allocated.get(e);if(!id)throw Error('Unknown fragment identity');return id;};
 private allocate(e:XmlElement){
  const kind=xmlSymbolKind(e);if(kind){const id=this.fresh(kind);this.allocated.set(e,id);if(e.attrs.id){if(!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(e.attrs.id)||this.symbols.has(e.attrs.id))throw Error('Duplicate or invalid XML identity');this.symbols.set(e.attrs.id,{id,kind});}}
  else if(e.attrs.id)throw Error('Unsupported XML identity');
  for(const child of e.children)if(typeof child!=='string')this.allocate(child);
 }
 private discardFragment(e:XmlElement){
  const id=this.allocated.get(e);if(id){this.shapes.delete(id);if(e.attrs.id&&this.symbols.get(e.attrs.id)?.id===id)this.symbols.delete(e.attrs.id);this.allocated.delete(e);}
  for(const child of e.children)if(typeof child!=='string')this.discardFragment(child);
 }
 private ref=(name:string,kinds?:string[])=>{
  if(name.startsWith('@'))return this.options.authority.resolve(name);
  const symbol=this.symbols.get(name);if(!symbol)throw new PendingReference();assertXmlReferenceKind(name,symbol.kind,kinds);
  return symbol.id;
 };
 private available(id:string){return this.options.sources.handles.has(id)||this.memory.memory?.aliases.has(id)||this.memory.memory?.generatedText.has(id)||this.memory.boundaries.has(id);}
 private response(){return {protocol:'dcp/1.0',kind:'contribution',exchange:this.options.exchange,intent:'reply',replyTargets:[],composition:[],anchors:[],entities:[],interpretations:[],arguments:[],glosses:[],relations:[],suggestions:[],promotionRecommendations:[]} as any;}
 private definition(e:XmlElement,out:any,allow?:string){
  xmlDefinition(e,{id:this.id,ref:(name,kinds)=>{const id=this.ref(name,kinds);if(id!==allow&&!this.available(id))throw new PendingReference();return id;},authority:this.options.authority,blocks:this.shapes,output:out});
 }
 private async admit(out:any,semanticLabel?:string){
  if(this.closed)return;this.options.sources.check();this.metrics.preparations++;
  const {editor,sources,exchange,owner,participant}=this.options;
  const restore=semanticLabel?semanticPreparationCheckpoint(this.memory):undefined;
  let result:NativePrepared;
  try{result=await prepare(JSON.stringify(out),exchange,owner,editor.visualEffects,sources,editor.features.scopedSemantics,'ai',participant,1,editor.features.dcpProactiveSemanticAuthoring?1:undefined,true,this.memory);}
  catch(error){restore?.();sources.check();if(!semanticLabel||!(error instanceof DcpValidationError)||error.diagnostic.code==='budget')throw error;this.warn(semanticLabel,error);return;}
  // Admission and lifecycle failures are never disguised as optional semantics.
  if(this.closed)return;sources.check();this.options.apply(result);this.metrics.blocks+=result.children.length;
 }
 private async element(e:XmlElement){
  if(e.name==='synopsis'){const text=xmlSynopsis(e);if(text)this.options.onSynopsis?.(text);else this.warn('Synopsis','Expected plain text, no attributes, and at most 160 characters.');return;}
  try{this.allocate(e);}catch(error){this.discardFragment(e);this.warn(e.name,error,!xmlDefinitionNames.has(e.name));return;}
  if(xmlDefinitionNames.has(e.name))this.waiting.push(e);
  else {
   const out=this.response(),mentionCount=this.mentions.length;
   // Lowering is local preparation. A rejected fragment must not stop later
   // fragments or leave passage/mention identities pointing at absent content.
   try{out.composition=[xmlBlockLowerer(this.id,this.ref,this.shapes,(inline,target)=>{this.mentions.push({id:this.fresh('m'),target,ref:inline.attrs.ref});},name=>this.warn(`<${name}>`,'Unsupported inline formatting; its text was retained.',true))(e)];}
   catch(error){this.mentions.length=mentionCount;this.discardFragment(e);this.warn(e.name,error,true);return;}
   // Canonical admission, lifecycle failures and budget failures remain fatal.
   await this.admit(out);
  }
  // Retry only the bounded exchange-local semantic queue after a new fragment.
  // No existing Document/Vault traversal or provider retrieval is performed.
  let progress=true;
  while(progress&&!this.closed){progress=false;
   for(let i=0;i<this.waiting.length;i++){
    if(this.discarded.has(this.waiting[i])){this.waiting.splice(i--,1);continue;}
    const item=this.waiting[i],out=this.response(),matched:typeof this.mentions=[],matchedElements:XmlElement[]=[];
    try{
     if(item.name==='entity'){
      const entity=this.id(item);this.definition(item,out);
      for(const mention of this.mentions){if(mention.ref!==item.attrs.id)continue;let reference:string;try{reference=this.ref(mention.ref,['e']);}catch(error){if(error instanceof PendingReference)continue;throw error;}if(this.available(mention.target)&&reference===entity){out.interpretations.push({id:mention.id,target:mention.target,type:'mutable/entity-reference',ref:entity,attributes:[]});matched.push(mention);}}
      for(const other of this.waiting)if(other.name==='mention'&&other.attrs.ref===item.attrs.id&&!this.discarded.has(other)){try{this.definition(other,out,entity);matchedElements.push(other);}catch(error){if(!(error instanceof PendingReference)){this.warn(other.name,error);this.discarded.add(other);matchedElements.push(other);}}}
      if(!out.interpretations.length&&!item.attrs.ref)continue; // New identities require grounding; existing identities can be enriched.
     }else if(item.name==='range'){
      // Validate its normal XML shape, then use the native passage/anchor path.
      this.definition(item,out);this.memory.passages=[{id:this.id(item),block:this.ref(item.attrs.block,['b']),from:this.ref(item.attrs.from,['pos']),to:this.ref(item.attrs.to,['pos'])}];
     }else this.definition(item,out);
    }catch(error){if(error instanceof PendingReference)continue;this.warn(item.name,error);this.waiting.splice(i--,1);continue;}
    await this.admit(out,item.name);this.waiting=this.waiting.filter(e=>e!==item&&!matchedElements.includes(e));this.mentions=this.mentions.filter(m=>!matched.includes(m));progress=true;break;
   }
   for(let i=0;i<this.mentions.length;i++){
    const mention=this.mentions[i];let entity:string;try{entity=this.ref(mention.ref,['e']);}catch(error){if(error instanceof PendingReference)continue;this.warn('Entity mention',error);this.mentions.splice(i--,1);continue;}
    if(!this.available(entity)||!this.available(mention.target))continue;
    const out=this.response();out.interpretations=[{id:mention.id,target:mention.target,type:'mutable/entity-reference',ref:entity,attributes:[]}];await this.admit(out,'Entity mention');this.mentions.splice(i--,1);progress=true;
   }
  }
 }
}
