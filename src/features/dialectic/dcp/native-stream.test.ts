// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {afterEach,expect,it,vi} from 'vitest';
import {NativeXmlStream} from './native-stream';
import {lowerXml} from './xml-authoring';
import {workspaceFixture} from './workspace.fixture';
import {XmlContext} from './xml-context';
import type {BlockNode} from '../../../block-tree/types';

const saved=readFileSync('src/features/dialectic/dcp/fixtures/university-reference-mismatch.xml','utf8');
const corrected=saved.replace('<e ref="wissenschaft">','<e id="wissenschaftMention" ref="wissenschaft">').replace('target="wissenschaft" whole="true"','target="wissenschaftMention"');
const cleanup:(()=>void)[]=[];afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();});
const expectedError='XML reference "wissenschaft" identifies Entity; expected Block.';

it('identifies the actual Entity-as-Block mismatch in the supplied response in complete lowering',()=>{
 // Original exchange aliases are not transferable authority. Only syntax and
 // local reference kinds are checked here; the native replay issues fresh ones.
 const authority={resolve:(alias:string)=>alias,revision:()=> 'fixture'};
 expect(()=>lowerXml(saved,'fixture',authority)).toThrow(expectedError);
 expect(()=>lowerXml(corrected,'fixture',authority)).not.toThrow();
});

it.each(['original','corrected','malformed'])('replays the university response through native streaming (%s)',async mode=>{
 const fixed=mode!=='original';
 const f=workspaceFixture();cleanup.push(()=>f.dispose());
 // Minimal synthetic source containing the exact quotes used by the supplied
 // response. This is not a claim to reconstruct the original conversation.
 const human=f.addHuman('How did universities develop? Consider Bologna and Paris, Humboldt, and communities of scholars, institutions for professional training and engines of original research.');
 const sources=f.open('research'),request=await f.req(sources,human,'agent-A',1),authority=new XmlContext(sources,request.exchange);authority.request(request);
 const block=request.structuralContext.sources.find((s:any)=>s.kind==='block');
 let xml=(fixed?corrected:saved).replace(/@bb18348a763_(?:2|4|10)\b/g,authority.alias(block.handle));
 if(mode==='malformed')xml+=`<gloss target="${authority.alias(block.handle)}" whole="true" kind="invalid:kind">Invalid kind after preparing an anchor.</gloss><classify target="${authority.alias(block.handle)}" quote="not in source" kind="claim"/><gloss target="missingPassage" kind="scope">Unresolved.</gloss><gloss target="central" kind="scope" surprise="invalid">Malformed attributes.</gloss><mention target="${authority.alias(block.handle)}" quote="absent entity" ref="unusable"/><entity id="unusable" name="Unusable" type="Concept"/><gloss target="central" kind="scope">Valid after failures.</gloss><p>Still rendered.</p>`;
 let contribution:BlockNode|undefined;
 const stream=new NativeXmlStream({editor:f.editor,sources,authority,exchange:request.exchange,owner:f.owner,participant:'agent-A',apply:result=>{
  const insert=()=>f.editor.commands.boundedStructuralTransaction('Replay native fragment',()=>{
   result.preparedResources.check();
   if(Object.keys(result.definitions).length)f.editor.commands.setPayloadField(f.root.key,'linkedAnnotations',{...JSON.parse(JSON.stringify(f.root.payload.linkedAnnotations??{})),...result.definitions});
   for(const [key,marks]of result.annotations)f.editor.commands.setPayloadField(key,'standoffProperties',[...JSON.parse(JSON.stringify(f.view.node(key)!.payload.standoffProperties??[])),...marks]);
   if(!contribution)f.editor.commands.insert({id:crypto.randomUUID(),type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'receiving',author:'ai',ordinal:2,replies:[]}},children:result.children},{kind:'at',parentKey:f.root.key,index:f.root.children.length});
   else {const at=contribution.children.length;result.children.forEach((child,index)=>f.editor.commands.insert(child,{kind:'at',parentKey:contribution!.key,index:at+index}));}
  });
  sources.admitOwn(()=>contribution?f.editor.textProtection.receivingInsertion(contribution.contentKey,insert):insert());
  contribution??=f.view.node(f.root.children.at(-1)!)!;
  const newIds=new Set(result.children.map(c=>String(c.id)));
  for(const key of contribution.children){const n=f.view.node(key)!;if(newIds.has(String(n.payload.id)))stream.memory.nativeKeys.set(String(n.payload.id),n.key);}
 }});cleanup.push(()=>stream.stop());
 const snapshots=vi.spyOn(f.editor.repository,'snapshot');
 for(let i=0;i<xml.length;i+=71)stream.write(xml.slice(0,i+71));
 if(fixed)await expect(stream.finish(xml)).resolves.toMatchObject({intent:'reply'});
 else {await expect(stream.finish(xml)).resolves.toMatchObject({intent:'reply'});expect(stream.notices).toHaveLength(1);expect(stream.notices[0].detail).toContain(expectedError);}
 expect(snapshots).not.toHaveBeenCalled();expect(sources.diagnostics.reads).toBe(0);expect(sources.diagnostics.entitySearches).toBe(0);
 expect(contribution!.children.length).toBe(mode==='malformed'?20:19);
 const definitions=Object.values(f.root.payload.linkedAnnotations??{}) as any[];
 expect(definitions.filter(d=>d.type==='mutable/entity')).toHaveLength(19);
 const coverage=f.refs.contentsTargets(String(contribution!.payload.id));
 expect(coverage.filter(t=>t.kind==='entity')).toHaveLength(19);
 expect(coverage.filter(t=>t.kind==='argument')).toHaveLength(6);
 expect(coverage.filter(t=>t.kind.endsWith('-relation'))).toHaveLength(8);
 expect(coverage.filter(t=>t.kind==='gloss')).toHaveLength(mode==='original'?3:mode==='malformed'?5:4);
 const humanCoverage=f.refs.contentsTargets(human);expect(humanCoverage.filter(t=>t.kind==='entity')).toHaveLength(3);expect(humanCoverage.filter(t=>t.kind==='gloss')).toHaveLength(2);
 expect(Object.keys(stream.memory.memory!.definitions).sort()).toEqual(Object.keys(f.root.payload.linkedAnnotations??{}).sort());
 if(mode==='malformed')expect(stream.notices[0].detail).toContain('5 semantic operations were skipped');
 if(mode==='corrected')expect(stream.notices).toEqual([]);
 if(fixed){
  expect(stream.unresolved).toBe(0);
  expect(definitions.filter(d=>d.type==='dialectic/argument')).toHaveLength(6);
  expect(definitions.filter(d=>d.type==='mutable/entity-relation')).toHaveLength(3);
  expect(definitions.filter(d=>d.type==='dialectic/argument-relation')).toHaveLength(5);
  expect(definitions.filter(d=>d.type==='mutable/gloss')).toHaveLength(mode==='malformed'?7:6);
  const text=contribution!.children.map(k=>f.view.node(k)!).find(n=>f.refs.text(n.contentKey).includes('Wissenschaft'))!;
  const gloss=(text.payload.standoffProperties as any[]).find(p=>p.type==='mutable/gloss');
  expect(gloss).toBeDefined();expect(f.refs.text(text.contentKey,gloss.start,gloss.end+1)).toBe('Wissenschaft');
 }else {expect(definitions.filter(d=>d.type==='dialectic/argument')).toHaveLength(6);expect(definitions.filter(d=>d.type==='dialectic/argument-relation')).toHaveLength(5);expect(definitions.filter(d=>d.type==='mutable/gloss')).toHaveLength(5);}
});
