// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {afterEach,expect,it,vi} from 'vitest';
import {NativeXmlStream} from './native-stream';
import {lowerXml} from './xml-authoring';
import {workspaceFixture} from './workspace.fixture';
import {XmlContext} from './xml-context';
import {ScopedEntities} from '../../../application/scoped-entities';
import type {BlockNode} from '../../../block-tree/types';
const cleanup:(()=>void)[]=[];afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();});
async function fixture(entities:Record<string,{name:string;typename:string}>={}){
 const f=workspaceFixture();cleanup.push(f.dispose);const human=f.addHuman('Discuss these people and their relationships.'),scoped=new ScopedEntities(f.editor,f.root.key,f.owner);cleanup.push(()=>scoped.dispose());
 const definitions=Object.fromEntries(Object.entries(entities).map(([alias,value])=>[alias,scoped.prepare({...value,description:'',aliases:[]},{actor:'human'})]));
 if(Object.keys(definitions).length)scoped.commit(Object.fromEntries(Object.values(definitions).map(d=>[d.id,d])),'Seed identities');
 const sources=f.open('research'),request=await f.req(sources,human,'agent-A',1),authority=new XmlContext(sources,request.exchange);authority.request(request);
 const aliases=Object.fromEntries(Object.entries(definitions).map(([alias,d])=>[alias,authority.alias(sources.issue({kind:'entity',resourceId:f.owner,entity:{scope:'document',resourceId:f.owner,entityId:d.id}}))]));
 let contribution:BlockNode|undefined;
 const stream=new NativeXmlStream({editor:f.editor,sources,authority,exchange:request.exchange,owner:f.owner,participant:'agent-A',apply:result=>{
  const insert=()=>f.editor.commands.boundedStructuralTransaction('Receive native fragment',()=>{
   result.preparedResources.check();if(Object.keys(result.definitions).length)f.editor.commands.setPayloadField(f.root.key,'linkedAnnotations',{...JSON.parse(JSON.stringify(f.root.payload.linkedAnnotations??{})),...result.definitions});
   for(const [key,marks]of result.annotations)f.editor.commands.setPayloadField(key,'standoffProperties',[...JSON.parse(JSON.stringify(f.view.node(key)!.payload.standoffProperties??[])),...marks]);
   if(!contribution)f.editor.commands.insert({id:crypto.randomUUID(),type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'receiving',author:'ai',ordinal:2,replies:[]}},children:result.children},{kind:'at',parentKey:f.root.key,index:f.root.children.length});
   else result.children.forEach((child,index)=>f.editor.commands.insert(child,{kind:'at',parentKey:contribution!.key,index:contribution!.children.length}));
  });sources.admitOwn(()=>contribution?f.editor.textProtection.receivingInsertion(contribution.contentKey,insert):insert());contribution??=f.view.node(f.root.children.at(-1)!)!;
  const newIds=new Set(result.children.map(c=>String(c.id)));for(const key of contribution.children){const n=f.view.node(key)!;if(newIds.has(String(n.payload.id)))stream.memory.nativeKeys.set(String(n.payload.id),n.key);}
 }});cleanup.push(()=>stream.stop());
 return {...f,sources,authority,stream,aliases,definitions,text:()=>contribution!.children.map(k=>f.refs.text(f.view.node(k)!.contentKey)),run:async(xml:string,step=71)=>{for(let i=0;i<xml.length;i+=step)stream.write(xml.slice(0,i+step));await stream.finish(xml);}};
}
it('retains forward semantic references and native identities across empty, wrapped and rootless tool rounds',async()=>{
 const f=await fixture(),snapshots=vi.spyOn(f.editor.repository,'snapshot'),fetches=vi.spyOn(globalThis,'fetch');
 f.stream.continueRound('');
 const intro='<response><p id="intro"><e ref="person">Leonardo</e> will appear in the PDF.</p></response>';
 f.stream.write(intro);await vi.waitFor(()=>expect(f.stream.metrics.blocks).toBe(1));
 const first=f.view.node(f.root.children.at(-1)!)!.children[0];
 f.stream.continueRound(intro);f.stream.continueRound('');
 await f.run('<entity id="person" name="Leonardo" type="Person"/><gloss target="intro" whole="true" kind="scope">Report introduction.</gloss><p>Your PDF is ready.</p>');
 expect(f.text()).toEqual(['Leonardo will appear in the PDF.','Your PDF is ready.']);expect(f.view.node(f.root.children.at(-1)!)!.children[0]).toBe(first);
 expect(f.view.node(first)!.payload.standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({type:'mutable/entity-reference'}),expect.objectContaining({type:'mutable/gloss'})]));
 expect(f.stream.notices).toEqual([]);expect(f.stream.unresolved).toBe(0);expect(f.stream.received).toContain(intro);
 expect(snapshots).not.toHaveBeenCalled();expect(fetches).not.toHaveBeenCalled();
});
it('rejects unfinished XML at a tool boundary while retaining already admitted native content',async()=>{
 const f=await fixture(),raw='<p>Retained introduction.</p><p>unfinished';f.stream.write(raw);await vi.waitFor(()=>expect(f.stream.metrics.blocks).toBe(1));
 expect(()=>f.stream.continueRound(raw)).toThrow();expect(f.text()).toEqual(['Retained introduction.']);
});
it('enforces the response byte budget cumulatively across tool rounds',async()=>{
 const f=await fixture(),first='<p>First.</p><!--'+'x'.repeat(140000)+'-->',second='<p>Second.</p><!--'+'x'.repeat(140000)+'-->';
 f.stream.continueRound(first);await expect(f.stream.finish(second)).rejects.toThrow('budget exceeded across tool rounds');
});
it('replays the actual Michelangelo response with fresh identities and admits all 30 relationships after the line break',async()=>{
 const entities=JSON.parse(readFileSync('src/features/dialectic/dcp/fixtures/michelangelo-entities.json','utf8')),f=await fixture(entities),raw=readFileSync('src/features/dialectic/dcp/fixtures/michelangelo-relationships.xml','utf8'),xml=raw.replace(/@e[a-z0-9_]+/g,a=>f.aliases[a]);
 const snapshots=vi.spyOn(f.editor.repository,'snapshot'),fetches=vi.spyOn(globalThis,'fetch');await f.run(xml);
 const defs=Object.values(f.root.payload.linkedAnnotations??{}) as any[];expect(defs.filter(d=>d.type==='mutable/entity-relation')).toHaveLength(30);expect(f.stream.unresolved).toBe(0);expect(f.stream.notices).toEqual([]);expect(f.text().some(t=>t.endsWith('Michelangelo\n'))).toBe(true);expect(snapshots).not.toHaveBeenCalled();expect(fetches).not.toHaveBeenCalled();expect(f.sources.diagnostics.entitySearches).toBe(0);
});
it.each(['<br/>','<br />','<br>','<BR>'])('preserves native newline text and correct following annotation offsets for %s',async br=>{
 const f=await fixture(),xml=`<p>First${br}<strong>Second</strong> <em>third</em></p>`;const lowered=lowerXml(xml,'fixture',{resolve:s=>s,revision:()=>''});expect(lowered.composition[0].markup).toContain('&#10;');await f.run(xml,1);expect(f.text()).toEqual(['First\nSecond third']);
 const node=f.view.node(f.view.node(f.root.children.at(-1)!)!.children[0])!;expect(node.payload.standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({type:'style/bold',start:6,end:11}),expect.objectContaining({type:'style/italics',start:13,end:17})]));
});
it('retains unknown inline text, isolates unsupported Blocks and does not lose later semantic definitions',async()=>{
 const f=await fixture();const xml='<p>Keep <u onclick="not executed">this <b>text</b></u>.</p><unsupported id="discarded"><p id="source"><e ref="person">Lost</e></p></unsupported><p id="source"><e ref="person">Leonardo</e> worked in <e ref="place">Milan</e>.</p><entity id="person" name="Leonardo" type="Person"/><entity id="place" name="Milan" type="Place"/><relation kind="entity" type="worked-in" from="person" to="place"/><argument id="a" target="source" whole="true"/><classify target="source" whole="true" kind="claim"/>';
 await f.run(xml,1);expect(f.text()).toEqual(['Keep this text.','Leonardo worked in Milan.']);const defs=Object.values(f.root.payload.linkedAnnotations??{}) as any[];expect(defs.filter(d=>d.type==='mutable/entity-relation')).toHaveLength(1);expect(defs.filter(d=>d.type==='dialectic/argument')).toHaveLength(1);expect(f.stream.unresolved).toBe(0);expect(f.stream.notices[0].detail).toContain('text was retained');expect(f.stream.notices[0].detail).toContain('unsupported');
});
it('streams enrichment of an existing Entity without requiring a new mention',async()=>{
 const f=await fixture({person:{name:'Leonardo',typename:'Person'}});await f.run(`<p>Further information.</p><entity id="enriched" ref="${f.aliases.person}" name="Leonardo" type="Person" wikidata="Q762"><description>Italian Renaissance artist and engineer</description></entity>`);
 expect(f.stream.notices).toEqual([]);expect(f.stream.unresolved).toBe(0);const entity=(f.root.payload.linkedAnnotations as any)[f.definitions.person.id].metadata.scopedEntity.entity;expect(entity.description).toBe('Italian Renaissance artist and engineer');expect(entity.attributes.enrichment.externalIds).toEqual([{namespace:'wikidata',value:'Q762'}]);
});
