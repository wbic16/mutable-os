// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {XmlFragments,parseXmlFragments} from './xml-fragments';
import {lowerXml} from './xml-authoring';
import {workspaceFixture} from './workspace.fixture';
import {XmlContext} from './xml-context';
import {prepare} from './exchange';
import {captureNative,nativeBytes,decodeNative} from '../../../persistence/native-resource';
import {conversation} from '../../../../server/dialectic/providers';
import {defaultProviderSettings} from './provider-contract';
const stops:(()=>void)[]=[];afterEach(()=>{stops.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();});
const authority={resolve:(s:string)=>s,revision:()=> 'revision'};
const rich='<p id="one"><span id="thought"><e ref="machine">Machine</e> <b>understanding</b> is <i>partial</i>.</span></p><argument id="a" target="thought"/><gloss target="thought" kind="scope">Understanding has several meanings.</gloss><entity id="machine" name="Machine" type="Concept"/><p id="two">A competing explanation.</p><classify target="two" whole="true" kind="claim"/><argument id="b" target="two" whole="true"/><relation kind="argument" type="qualifies" from="b" to="a"/>';

it('frames arbitrary splits, quotes, entities, comments, Unicode, CR and nested/self-closing elements exactly once',()=>{
 const xml='<!-- outside > --><p id="a">A\r😀 &amp; <b>bold</b><!-- inside --></p><entity id="x" name="A &gt; B" type="Concept"/><group><p>Nested</p><ul><li><p>Item</p></li></ul></group>';
 const expected=parseXmlFragments(xml);
 for(let split=0;split<=xml.length;split++){const seen:any[]=[];const p=new XmlFragments(e=>seen.push(e));p.write(xml.slice(0,split));p.write(xml.slice(split));expect(p.finish()).toEqual(expected);expect(seen.map(e=>e.name)).toEqual(['p','entity','group']);expect(p.diagnostics.characters).toBe(xml.length);}
 const seen:any[]=[];const p=new XmlFragments(e=>seen.push(e));for(const ch of xml.split(''))p.write(ch);expect(p.finish()).toEqual(expected);expect(seen).toHaveLength(3);
});
it('emits legacy children before the closing response/definitions envelope and retains incomplete tails',()=>{
 const emit=vi.fn(),p=new XmlFragments(emit);p.write('<response><p>First</p><p>Sec');expect(emit).toHaveBeenCalledTimes(1);p.write('ond</p><definitions><entity id="e" name="E" type="Concept"/>');expect(emit).toHaveBeenCalledTimes(3);p.write('</definitions></response>');p.finish();expect(emit).toHaveBeenCalledTimes(3);
});
it.each(['<p>open','<p><b>bad</p>','<p>&bogus;</p>','<!DOCTYPE p><p>x</p>','<?xml version="1.0"?><p>x</p>','<p><![CDATA[x]]></p>','hello<p>x</p>','<p id="a" id="b">x</p>','<p>x</p><!-- open','<p>\uD800</p>'])('rejects malformed/incomplete/prohibited XML: %s',xml=>{
 expect(()=>parseXmlFragments(xml)).toThrow();
});
it('preserves final lowering equivalence with interleaved and legacy definitions',()=>{
 const roots=parseXmlFragments(rich),blocks=roots.filter(e=>!['argument','entity','classify','gloss','relation'].includes(e.name));
 expect(blocks).toHaveLength(2);
 const legacy='<response>'+rich.slice(0,rich.indexOf('<argument'))+'<p id="two">A competing explanation.</p><definitions>'+rich.slice(rich.indexOf('<argument')).replace('<p id="two">A competing explanation.</p>','')+'</definitions></response>';
 expect(lowerXml(rich,'x',authority)).toEqual(lowerXml(legacy,'x',authority));
 expect(lowerXml('<response><definitions/><p>x</p></response>','x',authority).composition).toHaveLength(1);
});
async function setup(){const f=workspaceFixture();stops.push(()=>f.dispose());const human=f.addHuman('Machine understanding is partial.'),s=f.open('research'),r=await f.req(s,human,'agent-A',1),x=new XmlContext(s,r.exchange);r.dialect='xml/1';r.xmlContext=x.request(r);return {f,s,r,x};}
it('prepares the same native semantics, commits once, and preserves Undo/Redo and persistence',async()=>{
 const {f,s,r,x}=await setup();const before=captureNative(f.editor.repository.readState(),f.owner);
 const input=x.lower(rich);const a=await prepare(JSON.stringify(input),r.exchange,f.owner,f.editor.visualEffects,s,true,'ai','agent-A',1,1,true);expect(a.children).toHaveLength(2);
 const changes=vi.fn();stops.push(f.editor.repository.subscribeChanges(changes));await f.admit(s,input,'agent-A',r);expect(changes).toHaveBeenCalledTimes(1);
 const after=captureNative(f.editor.repository.readState(),f.owner),encode=(n:any)=>new TextDecoder().decode(nativeBytes(n));expect(encode(decodeNative(nativeBytes(after)))).toBe(encode(after));f.editor.repository.undo();expect(encode(captureNative(f.editor.repository.readState(),f.owner))).toBe(encode(before));f.editor.repository.redo();expect(encode(captureNative(f.editor.repository.readState(),f.owner))).toBe(encode(after));
});
it('defaults both providers to fragments, retains the wrapped fallback and the scholarly instructions',async()=>{
 const {f,r}=await setup();expect(f.editor.features.dcpXmlStreaming).toBe(true);
 for(const provider of ['openai','anthropic'] as const){const current=conversation({...defaultProviderSettings,provider},r),legacy=conversation({...defaultProviderSettings,provider},{...r,xmlFragments:false});expect(current.system).toContain('consecutive complete top-level XML fragments');expect(current.system).toContain('Ground every newly declared Entity');expect(legacy.system).toContain('Return one complete <response>');}
});
