/** Offline specimen generator, NOT a production parser or proposed wire implementation.
 * Run from repository root with TOKENIZER_MODULE pointing to js-tiktoken/dist/index.js.
 * Dependencies: existing saxes, yaml; external local o200k_base tokenizer. No network.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {SaxesParser} from 'saxes';
import YAML from 'yaml';
const {getEncoding}=await import(process.env.TOKENIZER_MODULE || '/tmp/dcp-workspace-tokenizer-js/node_modules/js-tiktoken/dist/index.js');
const enc=getEncoding('o200k_base'), count=s=>enc.encode(s).length;
const dir='docs/development/evidence/dcp-lightweight-authoring';
const write=(name,value)=>fs.writeFileSync(`${dir}/${name}`,value);
const json=x=>JSON.stringify(x,null,2)+'\n';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;').replaceAll('\r','&#13;');
const tag=(name,attrs={},body='')=>{let a=Object.entries(attrs).map(([k,v])=>` ${k}="${esc(v)}"`).join('');return body?`<${name}${a}>${body}</${name}>`:`<${name}${a}/>`;};
function tree(xml){let root,stack=[];const p=new SaxesParser();p.on('opentag',n=>{const v={tag:n.name,attrs:n.attributes,children:[]};if(stack.length)stack.at(-1).children.push(v);else root=v;stack.push(v);});p.on('text',s=>{if(stack.length)stack.at(-1).children.push(s);else assert.equal(s.trim(),'');});p.on('closetag',()=>stack.pop());p.write(xml).close();return root;}
const plain=n=>typeof n==='string'?n:n.children.map(plain).join('');
function sexp(n){return typeof n==='string'?JSON.stringify(n):`(${n.tag}${Object.entries(n.attrs).map(([k,v])=>` :${k} ${JSON.stringify(v)}`).join('')}${n.children.map(c=>' '+sexp(c)).join('')})`;}
const fixtures={palimpsest:'dcp-performance-recovery/A1.json',leonardo:'dcp-scholarly-authoring/after-A.json',mercury:'dcp-scholarly-authoring/after-B.json',reuse:'dcp-scholarly-authoring/after-C.json'};
const measurements=[];
for(const [name,path] of Object.entries(fixtures)){
 const saved=JSON.parse(fs.readFileSync('docs/development/evidence/'+path,'utf8')),r=saved.response;
 assert.equal(saved.admitted,true);assert.equal(saved.repaired,false);
 const bindings={},local={},all=JSON.stringify(r),seen=[...new Set(all.match(/src:[A-Za-z0-9_-]+:[a-z]+\d+/g)||[])];
 for(const h of seen){const family=h.split(':').at(-1).replace(/\d+$/,'');const alias='@'+family+(Object.keys(bindings).filter(a=>a.startsWith('@'+family)).length+1);bindings[alias]={handle:h};}
 const refs=new Map(Object.entries(bindings).map(([a,b])=>[b.handle,a]));
 const alias=x=>{if(x.startsWith('new:')){const a=x.slice(4);local[a]=x;return a;}return refs.get(x)??x;};
 function markup(s){s=s.replace(/new:[a-z]+\d+|src:[A-Za-z0-9_-]+:[a-z]+\d+/g,alias);return s.replace(/<annotation([^>]+)>/g,(_,a)=>'<mark'+a.replace(/type="dialectic\/([^"]+)"/,'kind="$1"')+'>').replaceAll('</annotation>','</mark>');}
 function target(v){if(typeof v==='string')return {target:alias(v)};if(v.revision!==null){const b=bindings[alias(v.block)];assert.ok(b);if(b.revision)assert.equal(b.revision,v.revision);b.revision=v.revision;}
 return {target:alias(v.block),...(v.whole?{whole:'true'}:{quote:v.quote,...(v.prefix?{prefix:v.prefix}:{}),...(v.suffix?{suffix:v.suffix}:{})})};}
 function block(n){if(n.kind==='paragraph'||n.kind==='heading'){assert.equal(n.ranges.length,0);assert.equal(n.textStyle,null);assert.equal(n.margins,null);return {tag:n.kind==='paragraph'?'p':'h'+n.level,id:alias(n.id),markup:markup(n.markup)};}if(n.kind==='list'){assert.equal(n.configuration,null);assert.equal(n.style,'bullet');return {tag:'ul',id:alias(n.id),items:n.items.map(row=>row.map(block))};}throw Error('Specimen does not cover '+n.kind);}
 const content=r.composition.map(block),definitions=[];
 for(const a of r.anchors){const b=bindings[alias(a.source)];if(b.revision)assert.equal(b.revision,a.revision);b.revision=a.revision;definitions.push({tag:'passage',id:alias(a.id),target:alias(a.source),quote:a.selector.exact,...(a.selector.prefix?{prefix:a.selector.prefix}:{}),...(a.selector.suffix?{suffix:a.selector.suffix}:{})});}
 for(const e of r.entities)definitions.push({tag:'entity',id:alias(e.id),name:e.name,type:e.typename,...(e.description?{description:e.description}:{}),...(e.aliases.length?{aliases:e.aliases}:{})});
 for(const m of r.interpretations){assert.deepEqual(m.attributes,[]);definitions.push({tag:m.type==='mutable/entity-reference'?'mention':'classify',id:alias(m.id),...target(m.target),...(m.ref?{ref:alias(m.ref)}:{kind:m.type.replace('dialectic/','')})});}
 for(const a of r.arguments)definitions.push({tag:'argument',id:alias(a.id),target:alias(a.anchor)});
 for(const g of r.glosses)definitions.push({tag:'gloss',id:alias(g.id),...target(g.target),kind:g.type,text:g.text});
 for(const rel of r.relations)definitions.push({tag:'relation',id:alias(rel.id),kind:rel.kind,type:rel.type,from:alias(rel.from),to:alias(rel.to)});
 const reply=r.replyTargets.map(alias);
 const intent={...(r.intent!=='reply'?{intent:r.intent}:{}),...(reply.length?{reply}:{}),content,definitions};
 const envelope={...(intent.intent?{intent:intent.intent}:{}),...(reply.length?{reply:reply.join(' ')}:{})};
 function blockXML(n){return tag(n.tag,{id:n.id},n.markup??n.items.map(row=>tag('li',{},row.map(blockXML).join(''))).join(''));}
 function defXML(d){const {tag:t,description,aliases,text,...attrs}=d;return tag(t,attrs,(description?tag('description',{},esc(description)):'')+(aliases??[]).map(a=>tag('alias',{},esc(a))).join('')+(text?esc(text):''));}
 const defs=tag('definitions',{},definitions.map(defXML).join('\n'));
 const xml=tag('response',envelope,content.map(blockXML).join('\n')+'\n'+defs);
 // Hybrid deliberately reuses XML semantics; only ordinary blocks/typography become Markdown.
 const mdInline=s=>s.replaceAll('<b>','**').replaceAll('</b>','**').replaceAll('<i>','*').replaceAll('</i>','*');
 function mdBlock(n){if(n.tag==='ul')return `<span-block id="${n.id}"/>\n`+n.items.map(row=>'- '+row.map(mdBlock).join('\n\n').replaceAll('\n','\n  ')).join('\n');return `<span-block id="${n.id}"/>\n`+(n.tag[0]==='h'?'#'.repeat(Number(n.tag[1]))+' ':'')+mdInline(n.markup);}
 // Block IDs are preserved in every specimen, even when optional. span-block is a proposed
 // hybrid block label, NOT standard Markdown or an implemented extension.
 const md=(Object.keys(envelope).length?tag('response-options',envelope)+'\n\n':'')+content.map(mdBlock).join('\n\n')+'\n\n'+defs;
 const yaml=YAML.stringify(intent,{lineWidth:0});assert.deepEqual(YAML.parse(yaml),intent);
 const ast=tree(xml);assert.equal(ast.tag,'response');
 const sourceProse=[];function visit(n){if(n.markup!==undefined)sourceProse.push(plain(tree('<p>'+n.markup+'</p>')));else n.items.flat().forEach(visit);}r.composition.forEach(visit);
 const renderedProse=[];for(const c of ast.children){if(typeof c!=='string'&&c.tag!=='definitions')renderedProse.push(plain(c));}
 assert.equal(renderedProse.join(''),sourceProse.join(''));
 // No semantic record is deleted; emitted selectors are expanded through the retained host map.
 for(const d of definitions.filter(d=>'quote' in d))assert.ok(bindings[d.target]?.revision);
 const prose=sourceProse.join('\n\n'),semanticText=[...r.entities.flatMap(e=>[e.name,e.typename,e.description,...e.aliases]),...r.glosses.map(g=>g.text)].join('\n');
 const formats={'current-json':JSON.stringify(r),'current-pretty-json':JSON.stringify(r,null,2),'compact-intent-json':JSON.stringify(intent),xml,'markdown-xml':md,yaml,sexp:sexp(ast)};
 for(const [format,value] of Object.entries(formats))write(`${name}.${format}.txt`,value+'\n');
 write(`${name}.host-bindings.json`,json({exchange:r.exchange,bindings,local,comment:'Offline historical bindings, never usable as live authority. Current occurrence and revision must be reissued.'}));
 write(`${name}.ledger.json`,json(intent));
 measurements.push({name,source:path,admitted:saved.admitted,repaired:saved.repaired,persistenceVerified:saved.persistenceVerified??null,proseTokens:count(prose),semanticDefinitionTextTokens:count(semanticText),counts:{textBlocks:sourceProse.length,entities:r.entities.length,sourceAnchors:r.anchors.length,interpretations:r.interpretations.length,arguments:r.arguments.length,glosses:r.glosses.length,relations:r.relations.length,inlineMentions:(all.match(/<e ref=/g)||[]).length},formats:Object.fromEntries(Object.entries(formats).map(([k,v])=>[k,{tokens:count(v),bytes:Buffer.byteLength(v),tokensAboveProse:count(v)-count(prose)}]))});
}
const sections={};for(const s of ['authoring','grammar','examples','scholarly']){const f=`${dir}/contract-${s}.txt`;if(fs.existsSync(f))sections[s]=count(fs.readFileSync(f,'utf8'));}
const a=JSON.parse(fs.readFileSync('docs/development/evidence/dcp-performance-recovery/A1.json','utf8'));const wire=a.wire.find(w=>w.url.endsWith('/responses')).body;
const report={tokenizer:'js-tiktoken o200k_base; local estimates, NOT verified GPT-6.1 Sol billing',paidCalls:0,measurements,contractSections:sections,contractTotal:Object.values(sections).reduce((a,b)=>a+b,0),existingRequestLocal:{contract:count(a.contract),responseSchema:count(JSON.stringify(wire.text.format)),tools:count(JSON.stringify(wire.tools)),dynamicInput:count(JSON.stringify(wire.input)),dynamicContent:count(wire.input.map(m=>m.content).join('\n')),responseInstructions:count(wire.instructions)},checks:['Four saved unrepaired admitted responses','All semantic record counts retained in common intent ledger','XML specimens parsed with existing saxes','Composition text exactly equal after XML decoding','YAML specimens parse back to the intent ledger','Every prior-source selector retains historical revision in host binding evidence'],notVerified:['No candidate native compiler implemented','No S-expression or hybrid parser round trip','No live generation, reliability, latency or billed-token measurement','No Claims/Traits admission added']};
const requestFile=dir+'/request-proposal.xml';if(fs.existsSync(requestFile)){const v=fs.readFileSync(requestFile,'utf8');tree(v);report.proposedRequestLocal=count(v);}
write('measurements.json',json(report));console.log(json(report));
