// @vitest-environment jsdom
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {afterEach,expect,it,vi} from 'vitest';
import {workspaceFixture} from './workspace.fixture';
import {lowerXml} from './xml-authoring';
import {XmlContext} from './xml-context';
import {prepare} from './exchange';
import {captureNative,nativeBytes,decodeNative} from '../../../persistence/native-resource';
import {conversation,providerTurn} from '../../../../server/dialectic/providers';
import {defaultProviderSettings} from './provider-contract';
import {sse,streamFixture} from '../../../../server/dialectic/fixtures';
const cleanup:(()=>void)[]=[];afterEach(()=>cleanup.splice(0).reverse().forEach(f=>f()));
function fixture(){const f=workspaceFixture();cleanup.push(()=>f.dispose());return f;}
async function setup(text='Leonardo served Ludovico.'){const f=fixture(),human=f.addHuman(text),s=f.open(),r=await f.req(s,human,'agent-A',1),x=new XmlContext(s,r.exchange);r.dialect='xml/1';r.xmlContext=x.request(r);return {f,s,r,x,block:r.structuralContext.sources.find((s:any)=>s.kind==='block')};}
function inventory(nodes:any[]):any[]{return nodes.flatMap(n=>[{type:n.type,text:n.text,marks:(n.standoffProperties??[]).filter((p:any)=>p.type!=='dialectic/range-anchor').map((p:any)=>[p.type,p.start,p.end]),metadata:n.metadata},...inventory(n.children??[])]);}

it.each(['palimpsest','leonardo','mercury'])('lowers saved %s XML with native equivalence to its admitted JSON control',async name=>{
 const folder='docs/development/evidence/dcp-lightweight-authoring/',paths:any={palimpsest:'dcp-performance-recovery/A1.json',leonardo:'dcp-scholarly-authoring/after-A.json',mercury:'dcp-scholarly-authoring/after-B.json'},saved=JSON.parse(readFileSync('docs/development/evidence/'+paths[name],'utf8'));
 const {f,s,r,x,block}=await setup(saved.prompt),binding=JSON.parse(readFileSync(folder+name+'.host-bindings.json','utf8'));let xml=readFileSync(folder+name+'.xml.txt','utf8');
 for(const alias of Object.keys(binding.bindings))xml=xml.replaceAll(alias,x.alias(block.handle));
 const lower=x.lower(xml),current=JSON.parse(JSON.stringify(saved.response));current.exchange=r.exchange;
 for(const info of Object.values(binding.bindings) as any[]){const before=JSON.stringify(current);Object.assign(current,JSON.parse(before.replaceAll(info.handle,block.handle).replaceAll(info.revision,block.revision)));}
 const p=await prepare(JSON.stringify(lower),r.exchange,f.owner,f.editor.visualEffects,s,true,'ai','agent-A',1,1,true),q=await prepare(JSON.stringify(current),r.exchange,f.owner,f.editor.visualEffects,s,true,'ai','agent-A',1,1);
 expect(inventory(p.children)).toEqual(inventory(q.children));
 const graph=(prepared:any)=>{const defs=prepared.definitions,entity=(id:string)=>defs[id]?.metadata?.scopedEntity?.entity?.name;
  const records=Object.values(defs).map((d:any)=>{const m=d.metadata;if(d.type==='mutable/entity'){const e=m.scopedEntity.entity;return [d.type,e.name,e.typename,e.description,e.aliases.map((a:any)=>a.name)];}if(d.type==='mutable/entity-relation'){const rel=m.scopedEntityRelation;return [d.type,rel.relation,entity(rel.from.entityId),entity(rel.to.entityId)];}if(d.type==='dialectic/argument')return [d.type,defs[m.dialecticArgument.anchor.anchorId].metadata.dialecticRange.excerpt];return [d.type,d.value??m?.dialecticRange?.excerpt];});
  const mentions:any[]=[];const visit=(nodes:any[])=>{for(const n of nodes){for(const m of n.standoffProperties??[])if(m.metadata?.entityReference)mentions.push([n.text,m.start,m.end,entity(m.metadata.entityReference.entityId)]);visit(n.children??[]);}};visit(prepared.children);
  for(const [key,marks] of prepared.annotations)for(const m of marks)if(m.metadata?.entityReference)mentions.push([key,m.start,m.end,entity(m.metadata.entityReference.entityId)]);
  return {records:records.map(value=>JSON.stringify(value)).sort(),mentions:mentions.map(value=>JSON.stringify(value)).sort()};};
 expect(graph(p)).toEqual(graph(q));
 const counts=(d:any)=>Object.values(d).reduce((m:any,v:any)=>(m[v.type]=(m[v.type]??0)+1,m),{});expect(counts(p.definitions)).toEqual(counts(q.definitions));
 if(process.env.DCP_XML_EVIDENCE_DIR){const dir=process.env.DCP_XML_EVIDENCE_DIR;mkdirSync(dir,{recursive:true});writeFileSync(dir+'/'+name+'.json',JSON.stringify({source:paths[name],xml,json:current,nativeDefinitionCounts:counts(p.definitions),nativeTextAndRangesEquivalent:true},null,2));}
 const marks=(p:any)=>[...p.annotations.values()].flat().filter((m:any)=>m.type!=='dialectic/range-anchor').map((m:any)=>[m.type,m.start,m.end]);expect(marks(p)).toEqual(marks(q));
});

it('admits neutral and crossing Unicode passages, annotations and semantics through Undo/Redo and native persistence',async()=>{
 const {f,s,r,x,block}=await setup();const xml=`<response><h2>Evidence</h2><p id="b"><boundary id="a"/>A<boundary id="b0"/>😀é<boundary id="c"/>Z<boundary id="d"/> <span id="neutral"><e ref="leo">Leonardo</e></span></p><ol start="3"><li><p>Item</p></li></ol><table><tr><td><p>Cell</p></td></tr></table><definitions><range id="r1" block="b" from="a" to="c"/><range id="r2" block="b" from="b0" to="d"/><classify target="r1" kind="claim"/><classify target="r2" kind="qualification"/><entity id="leo" name="Leonardo" type="Person"/><mention target="${x.alias(block.handle)}" quote="Leonardo" ref="leo"/><argument id="arg" target="neutral"/><gloss target="neutral" kind="scope">An exact passage.</gloss></definitions></response>`;
 const before=captureNative(f.editor.repository.readState(),f.owner),p=await f.admit(s,x.lower(xml),'agent-A',r),marks=p.children[1].standoffProperties as any[];
 expect(marks.filter(m=>m.type.startsWith('dialectic/')&&m.type!=='dialectic/range-anchor').map(m=>[m.type,m.start,m.end])).toEqual([['dialectic/claim',0,3],['dialectic/qualification',1,4]]);
 expect(marks.some(m=>m.type==='dcp/passage')).toBe(false);expect(marks.filter(m=>m.type==='dialectic/range-anchor')).toHaveLength(3);
 const sourceMarks=[...p.annotations.values()].flat();expect(sourceMarks.find(m=>m.type==='mutable/entity-reference').metadata.dcp).toMatchObject({sourceAuthor:'human',participantId:'agent-A',sourceRevision:block.revision});
 const serialized=(snapshot:any)=>JSON.parse(new TextDecoder().decode(nativeBytes(snapshot)));const snap=captureNative(f.editor.repository.readState(),f.owner);expect(serialized(decodeNative(nativeBytes(snap)))).toEqual(serialized(snap));
 f.editor.repository.undo();expect(serialized(captureNative(f.editor.repository.readState(),f.owner))).toEqual(serialized(before));f.editor.repository.redo();expect(serialized(captureNative(f.editor.repository.readState(),f.owner))).toEqual(serialized(snap));
});

it('reuses fresh Entity and passage aliases across exchanges without serial searches',async()=>{
 const {f,s,r,x}=await setup();await f.admit(s,x.lower('<response><p><span id="pass"><e ref="leo">Leonardo</e></span></p><definitions><entity id="leo" name="Leonardo" type="Person"/><argument id="a" target="pass"/></definitions></response>'),'agent-A',r);
 const ss=f.open(),rr=await f.req(ss,String(f.view.node(f.root.children[1])!.payload.id),'agent-B',1),xx=new XmlContext(ss,rr.exchange);rr.dialect='xml/1';const projection=xx.request(rr),e=projection.workspace.entities[0],a=projection.workspace.arguments[0];
 expect(JSON.stringify(projection)).not.toContain('src:');
 const p=await f.admit(ss,xx.lower(`<response><p><e ref="${e.handle}">Leonardo</e> again.</p><definitions><gloss target="${a.anchor}" kind="commentary">Continuity.</gloss><mention target="${a.anchor}" ref="${e.handle}"/></definitions></response>`),'agent-B',rr);
 expect(Object.values(p.definitions).filter((d:any)=>d.type==='mutable/entity')).toHaveLength(0);expect(ss.diagnostics.entitySearches).toBe(0);expect(ss.diagnostics.reads).toBe(0);
 expect(()=>xx.resolve(x.alias(r.primaryReply))).toThrow();
});

it.each(['<response><p>x</p>','<response><p>x</p></response><response/>','<!DOCTYPE response><response><p>x</p></response>','<response><p>&bogus;</p></response>','<response><p><span id="same">x</span><span id="same">y</span></p></response>','<response><p><script>x</script></p></response>','<response><p>x</p><definitions><claim id="c">x</claim></definitions></response>','<response><p>x</p><definitions><entity id="e" name="X" type="Person" confidence="0.8"/></definitions></response>'])('rejects malformed/unqualified syntax without repair-by-approximation: %s',xml=>{
 expect(()=>lowerXml(xml,'x',{resolve(){throw Error('forged')},revision(){throw Error('forged')}})).toThrow();
});

it('preserves literal code, exact escaping and CR; rejects cross-Block boundaries, ambiguous quotes and ungrounded Entities without writes',async()=>{
 const {f,s,r,x,block}=await setup('Mercury Mercury');const calls=vi.fn();cleanup.push(f.editor.repository.subscribeChanges(calls));
 const valid=x.lower('<response><code language="typescript">const x = &quot;&lt;e&gt;&quot;;</code><p><span id="s">A\r😀&amp;B</span></p></response>');
 const p=await prepare(JSON.stringify(valid),r.exchange,f.owner,f.editor.visualEffects,s,true,'ai','agent-A',1,1,true);expect(p.children[1].text).toBe('A\r😀&B');expect(calls).not.toHaveBeenCalled();
 for(const xml of [
 `<response><p>x</p><definitions><mention target="${x.alias(block.handle)}" quote="Mercury" ref="e"/><entity id="e" name="Mercury" type="Concept"/></definitions></response>`,
 '<response><p>x</p><definitions><entity id="e" name="Unmentioned" type="Concept"/></definitions></response>',
 '<response><p id="one"><boundary id="a"/>A</p><p><boundary id="b"/>B</p><definitions><range id="r" block="one" from="a" to="b"/></definitions></response>',
 '<response><table><tr><td><p>A</p></td></tr><tr><td><p>B</p></td><td><p>C</p></td></tr></table></response>',
 '<response><group>'+Array.from({length:65},()=>'<p>x</p>').join('')+'</group></response>',
 '<response>'+Array.from({length:2},()=>'<ul>'+Array.from({length:64},()=>'<li><p>x</p></li>').join('')+'</ul>').join('')+'</response>'
 ])await expect(f.admit(s,x.lower(xml),'agent-A',r)).rejects.toThrow();
 expect(calls).not.toHaveBeenCalled();
 await expect(prepare(JSON.stringify(valid),r.exchange,f.owner,f.editor.visualEffects,s,true,'ai','agent-A',1,1)).rejects.toThrow();
 const stale=x.lower(`<response><p>x</p><definitions><passage id="p" target="${x.alias(block.handle)}" quote="Mercury" suffix=" Mercury"/></definitions></response>`);s.revisions.set(block.handle,'changed');await expect(f.admit(s,stale,'agent-A',r)).rejects.toThrow();
});

it('uses compact provider context and plain text transport, keeping JSON-only material out of XML requests',async()=>{
 const {f,s,r,x}=await setup(),legacy={...r};delete legacy.dialect;delete legacy.xmlContext;
 expect(f.editor.features.dcpXmlAuthoring).toBe(true);const json=conversation(defaultProviderSettings,legacy),state=conversation(defaultProviderSettings,r);
 expect(state.system.length).toBeLessThan(json.system.length/3);expect(state.input[0].content.length).toBeLessThan(json.input[0].content.length);
 expect(state.system).not.toContain('DCP AUTHORING REFERENCE');expect(state.input[0].content).not.toContain('src:');expect(state.input[0].content).not.toContain('protocolKey');
 for(const provider of ['openai','anthropic'] as const){const response='<response><p>Hello.</p></response>',fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,response))),st=conversation({...defaultProviderSettings,provider},r);
  const result=await providerTurn(st,'fixture-only',new AbortController().signal,()=>{},fetcher);expect(result.text).toBe(response);const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body));expect(body.text?.format).toBeUndefined();expect(body.output_config).toBeUndefined();expect(JSON.stringify(body)).not.toContain('$defs');
 }
 const discovery=x.describe(s.capabilities!.describe({ids:['composition.code','composition.surface']}));expect(discovery.items[0]).toMatchObject({authorable:true});expect(discovery.items[1]).toMatchObject({authorable:false});expect(JSON.stringify(discovery)).not.toContain('parameters');
 expect(()=>conversation(defaultProviderSettings,{...r,dialect:'xml/unknown'})).toThrow();
 if(process.env.DCP_XML_EVIDENCE_DIR){const dir=process.env.DCP_XML_EVIDENCE_DIR;mkdirSync(dir,{recursive:true});const capture=async(st:any)=>{const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture('openai','fixture')));await providerTurn(st,'fixture-only',new AbortController().signal,()=>{},fetcher);return JSON.parse(String(fetcher.mock.calls[0][1]?.body));};writeFileSync(dir+'/provider-requests.json',JSON.stringify({note:'Offline mocked provider invocation, no paid calls. Same native source/context and settings.',json:await capture(conversation(defaultProviderSettings,legacy)),xml:await capture(conversation(defaultProviderSettings,r))},null,2));}

});

it('keeps discovery bounded, requires complete reads, recovers expired tool aliases and rejects raw handles',async()=>{
 const {f,s,r,x}=await setup();f.addHuman('Another contribution.');
 // Changes invalidate an exchange. Start again before inventory discovery.
 const ss=f.open(),rr=await f.req(ss,String(f.view.node(f.root.children[0])!.payload.id)),xx=new XmlContext(ss,rr.exchange);xx.request(rr);
 const list=xx.project(await ss.tool({id:'inventory',tool:'list_text_blocks',arguments:{cursor:null,limit:20,contributionId:null,participantId:null,fromOrdinal:2}}));
 const b=list.items[0];expect(b.readRequired).toBe(true);expect(()=>xx.revision(b.handle)).toThrow();
 const read=xx.project(await ss.tool({id:'read',tool:'read_source',arguments:xx.toolArguments('read_source',{handle:b.handle})}));expect(read.text).toBe('Another contribution.');expect(xx.revision(b.handle)).toBeDefined();
 expect(JSON.stringify(read)).not.toContain('src:');expect(xx.toolArguments('list_text_blocks',{contributionId:b.contribution.handle}).contributionId).toBeDefined();
 const recovered=xx.project(await ss.tool({id:'stale',tool:'read_source',arguments:xx.toolArguments('read_source',{handle:'@old'})}));expect(recovered.status).toBe('unauthorized');expect(recovered.recovery.inventory.items.length).toBeGreaterThan(0);
 expect(xx.toolArguments('read_source',{handle:xx.resolve(b.handle)}).handle).toBe('unissued-xml-alias');
});
