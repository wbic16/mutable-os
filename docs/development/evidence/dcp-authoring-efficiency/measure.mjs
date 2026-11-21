// Read-only investigation. Run from repo root. No provider calls.
// Install js-tiktoken in an isolated directory, then set DCP_TOKENIZER to its ESM entry.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {SaxesParser} from 'saxes';
const {getEncoding}=await import(process.env.DCP_TOKENIZER || '/tmp/dcp-workspace-tokenizer-js/node_modules/js-tiktoken/dist/index.js');
const enc=getEncoding('o200k_base'),j=JSON.stringify;
const metric=v=>{const s=typeof v==='string'?v:j(v);return {bytes:Buffer.byteLength(s),tokens:enc.encode(s).length}};
const clone=structuredClone,read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sem=['anchors','entities','interpretations','arguments','glosses','relations','suggestions','promotionRecommendations'];
const corpus=[],files=new Map();
function tracked(p){files.set(p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'));return read(p)}
for(const [suffix,label]of [['','authenticity'],[' (2)','theseus54'],[' (3)','theseus61']]){
 const file=`vaults/imported/Conversation on November 11, 2026${suffix}.ink`;
 for(const b of tracked(file).document.blocks){const c=b.properties?.metadata?.dialectic;if(c?.author!=='ai'||!c.dcp)continue;
 const d=c.dcp;corpus.push({id:`${label}-${c.ordinal}`,file,blockId:b.id,ordinal:c.ordinal,group:label,raw:d.response,response:JSON.parse(d.response),request:d.request,system:d.provider.system,attempts:d.provider.attempts,tools:d.tools,continuity:!!d.provider.continuity});}
}
for(let n=1;n<=3;n++){
 const file=`docs/development/evidence/dcp-semantic-workspace/exchange-${n}.json`,d=tracked(file);
 corpus.push({id:`workspace-${n}`,group:'workspace',file,raw:d.turns.at(-1).text,response:d.response,request:d.request,attempts:d.turns,tools:d.tools,continuity:d.continuity});
}
for(const family of ['editorial-authoring','model-compliance']){
 const dir=`/tmp/dcp-${family}`;
 for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.json')).sort()){
 const file=path.join(dir,name),d=tracked(file);if(!d.response||!d.nativeAdmitted)continue;
 const wire=d.wire?.[0]?.body;corpus.push({id:`${family}-${name.slice(0,-5)}`,group:family,file,raw:d.turns.at(-1).text,response:d.response,wire,request:wire?.input?.find(i=>i.role==='user')?.content?JSON.parse(wire.input.find(i=>i.role==='user').content):undefined,system:wire?.instructions,attempts:d.turns,tools:d.tools,continuity:d.continuity});
 }
}
function walk(v,fn){if(!v||typeof v!=='object')return;for(const k of Object.keys(v)){fn(v,k);walk(v[k],fn)}}
const aliases={'style/bold':'b','style/italics':'i','mutable/entity-reference':'e'};
function aliasMarkup(s){const stack=[];return s.replace(/<[^>]*>/g,t=>{
 if(t.startsWith('<annotation ')){const type=t.match(/\btype="([^"]+)"/)?.[1],name=aliases[type]||'annotation';if(!t.endsWith('/>'))stack.push(name);if(name==='annotation')return t;return t.replace('<annotation','<'+name).replace(/ type="[^"]+"/,'');}
 if(t==='</annotation>'){const name=stack.pop();assert(name);return `</${name}>`}return t;
 })}
// Compare decoded text and property/range events, including nested marks and Unicode Cells.
function parsed(s){const p=new SaxesParser({xmlns:false}),events=[];let text='';p.on('error',e=>{throw e});p.on('text',t=>text+=t);p.on('opentag',t=>{const type=Object.entries(aliases).find(([,alias])=>alias===t.name)?.[0];events.push(['open',type?'annotation':t.name,type?{type,...t.attributes}:{...t.attributes},[...text].length])});p.on('closetag',t=>events.push(['close',Object.values(aliases).includes(t.name)?'annotation':t.name,[...text].length]));p.write('<root>'+s+'</root>').close();return {text,events}}
let markupChecks=0;
function applyAliases(v){walk(v,(o,k)=>{if(k==='markup'&&typeof o[k]==='string'){const before=o[k],after=aliasMarkup(before);assert.deepEqual(parsed(before),parsed(after));markupChecks++;o[k]=after}});return v}
function omitDefaults(v){walk(v,(o,k)=>{
 if(Array.isArray(o[k])&&!o[k].length&&['ranges','aliases','attributes'].includes(k))delete o[k];
 else if(o[k]===null&&(['textStyle','margins','configuration','ref'].includes(k)||(k==='revision'&&o.block?.startsWith('new:'))))delete o[k];
 else if(['textStyle','margins'].includes(k)&&o[k]&&typeof o[k]==='object'&&Object.values(o[k]).every(x=>x===null))delete o[k];
 });return v}
function delta(a,b){const x=metric(a),y=metric(b);return {bytes:x.bytes-y.bytes,tokens:x.tokens-y.tokens}}
function emptySemantic(v){for(const k of sem)if(Array.isArray(v[k])&&!v[k].length)delete v[k];return v}
function strictCompact(v){
 // Local packaging experiment only: original operation objects, grouped by existing collection name.
 v.semantics=sem.filter(k=>!['suggestions','promotionRecommendations'].includes(k)&&v[k]?.length).map(kind=>({kind,items:v[kind]}));
 for(const k of sem)delete v[k];
 walk(v,(o,k)=>{if(k==='kind'&&['paragraph','heading'].includes(o.kind)&&!o.ranges?.length&&o.textStyle==null&&o.margins==null){delete o.ranges;delete o.textStyle;delete o.margins}});
 return v;
}
function removeMarkupTags(v){walk(v,(o,k)=>{if(k==='markup')o[k]=o[k].replace(/<[^>]*>/g,'')});return v}
function output(c){const r=c.response,m=metric(r);let arrays=0,nulls=0,marks={},kinds={};const handles=[];walk(r,(o,k)=>{if(Array.isArray(o[k])&&!o[k].length)arrays++;if(o[k]===null)nulls++;if(k==='kind'&&typeof o[k]==='string')kinds[o[k]]=(kinds[o[k]]||0)+1;if(typeof o[k]==='string')handles.push(...o[k].matchAll(/\b(?:new:[a-z]+\d+|src:[A-Za-z0-9:_-]+)/g));if(k==='markup')for(const t of o[k].matchAll(/<annotation type="([^"]+)"/g))marks[t[1]]=(marks[t[1]]||0)+1});
 const compact=omitDefaults(emptySemantic(clone(r))),aliased=applyAliases(clone(r)),combined=applyAliases(clone(compact));
 // Disjoint byte partition. Token deltas telescope in this fixed order; they are not billing attribution.
 let current=clone(r);const partition={};function take(name,fn){const next=fn(clone(current));partition[name]=delta(current,next);current=next}
 take('emptySemanticArrays',emptySemantic);take('nestedDefaults',omitDefaults);
 take('envelope',v=>{for(const k of ['protocol','kind','exchange','intent','replyTargets'])delete v[k];return v});
 take('semanticPayloads',v=>{for(const k of sem)delete v[k];return v});
 take('inlineMarkup',removeMarkupTags);
 take('compositionText',v=>{walk(v,(o,k)=>{if(['markup','text','label','title','alt','code'].includes(k)&&typeof o[k]==='string')o[k]=''});return v});
 partition.remainingStructure=metric(current);
 assert.equal(Object.values(partition).reduce((s,v)=>s+v.bytes,0),m.bytes);
 return {id:c.id,group:c.group,model:c.attempts?.at(-1)?.receipt?.model,raw:metric(c.raw),minified:m,emptyArrays:arrays,nulls,marks,kinds,semanticCounts:Object.fromEntries(sem.map(k=>[k,r[k]?.length||0])),partition,handlesAndAliases:{occurrences:handles.length,...metric(handles.map(v=>v[0]).join('\n')),overlapsOtherComponents:true},omitDefaultsSaving:delta(r,compact),aliasSaving:delta(r,aliased),combinedSaving:delta(r,combined),strictCompactSaving:delta(r,strictCompact(clone(r))),strictCompactAndAliasesSaving:delta(r,applyAliases(strictCompact(clone(r)))),providerUsage:c.attempts?.map(t=>t.receipt?.usage),elapsedMs:c.attempts?.reduce((s,t)=>s+(Date.parse(t.receipt.completedUtc)-Date.parse(t.receipt.startedUtc)),0),toolCalls:c.attempts?.reduce((s,t)=>s+(t.calls||t.toolCalls||[]).length,0)};
}
function request(c){const r=c.request;if(!r)return;const simplified=clone(r);delete simplified.protocolKey.text;delete simplified.authoring.instructions;
 const components={};for(const [k,v]of Object.entries(r))components[k]=metric(v);
 components.authoringInstructions=metric(r.authoring?.instructions||'');components.examples=metric(r.authoring?.examples||[]);components.protocolGuidance=metric(r.protocolKey?.text||'');
 const result={id:c.id,request:metric(r),components,duplicateUserGuidanceSaving:delta(r,simplified),system:c.system?metric(c.system):null,protocolInSystem:c.system?.includes(r.protocolKey.text)??null,authoringInSystem:c.system?.includes(r.authoring.instructions)??null,toolsResults:metric((c.tools||[]).map(t=>t.result??t)),continuity:c.continuity};
 if(c.system){const start=c.system.indexOf('DCP-NATIVE EDITORIAL POLICY'),end=c.system.indexOf(r.authoring.instructions);if(start>=0&&end>start)result.editorialPolicy=metric(c.system.slice(start,end).trim());result.visibleText=metric(c.system+'\n'+j(r));}
 if(c.wire){const b=c.wire;result.actualWire={total:metric(b),instructions:metric(b.instructions),input:metric(b.input),schema:metric(b.text.format.schema),tools:metric(b.tools)};const copy=clone(b);copy.input=copy.input.map(i=>i.role==='user'?{...i,content:j(simplified)}:i);result.actualWire.dedupSaving=delta(b,copy);
 // Remove unreachable definitions, without changing the accepted language.
 const schema=clone(b.text.format.schema),seen=new Set();function visit(v){if(!v||typeof v!=='object')return;if(v.$ref?.startsWith('#/$defs/')){const key=v.$ref.slice(8);if(!seen.has(key)){seen.add(key);visit(schema.$defs[key])}}for(const [k,x]of Object.entries(v))if(k!=='$defs')visit(x)}visit(schema);const removed=Object.keys(schema.$defs).filter(k=>!seen.has(k));for(const k of removed)delete schema.$defs[k];result.actualWire.unreachableDefs={names:removed,saving:delta(b.text.format.schema,schema)};
 }
 return result;
}
const results={date:'2026-11-11',tokenizer:'js-tiktoken o200k_base; local encoding estimates, not model-specific billing counts',method:'minified JSON; sequential subtraction byte/token partition; individual counterfactual savings non-additive; raw provider strings measured separately',files:Object.fromEntries(files),responses:corpus.map(output),requests:corpus.map(request).filter(Boolean)};
if(fs.existsSync('/tmp/dcp-efficiency-reconstructed.json')){
 const d=read('/tmp/dcp-efficiency-reconstructed.json');results.reconstructed={editorialPolicy:metric(d.editorialPolicy),requests:{}};
 for(const [id,b]of Object.entries(d.requests))results.reconstructed.requests[id]={wire:metric(b),system:metric(b.instructions??b.system),schema:metric(b.text?.format.schema??b.output_config.format.schema),tools:metric(b.tools),userPayload:metric(JSON.parse((b.input??b.messages)[0].content))};
 const original=d.requests['workspace-3-openai'].text.format.schema,schema=clone(original),buckets=[];
 for(const kind of sem){if(!['suggestions','promotionRecommendations'].includes(kind)&&schema.properties[kind].maxItems!==0)buckets.push({type:'object',properties:{kind:{type:'string',enum:[kind]},items:schema.properties[kind]},required:['kind','items'],additionalProperties:false});delete schema.properties[kind]}
 schema.properties.semantics={type:'array',maxItems:buckets.length,items:{anyOf:buckets}};
 schema.required=schema.required.filter(k=>!sem.includes(k));schema.required.push('semantics');
 for(const kind of ['Paragraph','Heading'])if(schema.$defs[kind]){const simple=clone(schema.$defs[kind]);for(const k of ['ranges','textStyle','margins'])delete simple.properties[k];simple.required=simple.required.filter(k=>!['ranges','textStyle','margins'].includes(k));schema.$defs['Simple'+kind]=simple;schema.$defs.Node.anyOf.push({$ref:'#/$defs/Simple'+kind})}
 let objects=0;walk(schema,(o,k)=>{if(k==='properties'){assert.deepEqual(Object.keys(o.properties).sort(),[...o.required].sort());assert.equal(o.additionalProperties,false);objects++}});
 results.reconstructed.compactStrictSchemaExperiment={current:metric(original),proposed:metric(schema),growth:delta(schema,original),allRequiredClosedObjects:objects,providerAccepted:false};
}
results.markupEquivalenceChecks=markupChecks;
results.groups={};for(const group of new Set(corpus.map(c=>c.group))){const rs=results.responses.filter(r=>r.group===group);results.groups[group]={count:rs.length,minified:rs.reduce((s,r)=>({bytes:s.bytes+r.minified.bytes,tokens:s.tokens+r.minified.tokens}),{bytes:0,tokens:0}),omitDefaultsSaving:rs.reduce((s,r)=>({bytes:s.bytes+r.omitDefaultsSaving.bytes,tokens:s.tokens+r.omitDefaultsSaving.tokens}),{bytes:0,tokens:0}),aliasSaving:rs.reduce((s,r)=>({bytes:s.bytes+r.aliasSaving.bytes,tokens:s.tokens+r.aliasSaving.tokens}),{bytes:0,tokens:0}),combinedSaving:rs.reduce((s,r)=>({bytes:s.bytes+r.combinedSaving.bytes,tokens:s.tokens+r.combinedSaving.tokens}),{bytes:0,tokens:0})}}
fs.writeFileSync('docs/development/evidence/dcp-authoring-efficiency/measurements.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({groups:results.groups,markupChecks},null,2));
