// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {workspaceFixture,workspaceResponse} from './workspace.fixture';
import {resolveVocabulary} from './vocabulary';
import {schemaFor} from './provider-schema';
import {emptySemanticFields,normalizeEmptySemanticFields} from './empty-fields';
import {prepare} from './exchange';
import {semanticWorkspace} from './workspace';
const clean:(()=>void)[]=[];afterEach(()=>clean.splice(0).reverse().forEach(fn=>fn()));
function fixture(){const f=workspaceFixture();clean.push(()=>f.dispose());return f;}
it.each(['openai','anthropic'] as const)('%s omits only invariant/disabled collections in the negotiated strict schema',provider=>{
 const f=fixture();
 for(const profile of ['core','general','research','all-qualified'] as const){
  const v=resolveVocabulary(f.editor,{profile}),s=v.stages;
  const old=schemaFor(provider,s[0],s[1],s[2],s[3],s[4],s[5],s[6],s[7],v,true);
  const compact=schemaFor(provider,s[0],s[1],s[2],s[3],s[4],s[5],s[6],s[7],v,true,1);
  const expected=['suggestions','promotionRecommendations',...['anchors','entities','interpretations','arguments','glosses','relations'].filter(k=>old.properties[k].maxItems===0)];
  expect(emptySemanticFields(v).sort()).toEqual(expected.sort());
  const restored=structuredClone(compact);for(const k of expected)restored.properties[k]=old.properties[k];restored.required=old.required;expect(restored).toEqual(old);
  const walk=(value:any)=>{if(!value||typeof value!=='object')return;if(value.type==='object'){expect(value.additionalProperties).toBe(false);expect([...value.required].sort()).toEqual(Object.keys(value.properties).sort());}if(value.$ref)expect(compact.$defs[value.$ref.slice(8)]).toBeDefined();Object.values(value).forEach(walk)};walk(compact);
  expect(compact.$defs.SemanticTarget).toEqual(old.$defs.SemanticTarget);
 }
});
it('normalizes only negotiated empty fields and rejects supplied nonempty or malformed values',async()=>{
 const f=fixture(),id=f.addHuman('Authenticity'),s=f.open(),req=await f.req(s,id),full=workspaceResponse(req.exchange),wire=structuredClone(full);
 for(const k of emptySemanticFields(s.vocabulary))delete wire[k];
 expect(normalizeEmptySemanticFields(wire,s.vocabulary,1)).toEqual(full);expect(wire).not.toHaveProperty('suggestions');
 await expect(prepare(JSON.stringify(wire),req.exchange,f.owner,f.editor.visualEffects,s,true,'ai')).rejects.toThrow('Invalid DCP object fields');
 const changes=vi.fn(),stop=f.editor.repository.subscribeChanges(changes);clean.push(stop);
 for(const value of [wire,full])await expect(prepare(JSON.stringify(value),req.exchange,f.owner,f.editor.visualEffects,s,true,'ai','agent-A',1)).resolves.toMatchObject({intent:'reply'});
 for(const value of [{...wire,suggestions:['not enabled']},{...wire,promotionRecommendations:null},{...wire,semantics:[]},(()=>{const v={...wire};delete v.entities;return v})(),{...wire,exchange:'stale'}])await expect(prepare(JSON.stringify(value),req.exchange,f.owner,f.editor.visualEffects,s,true,'ai','agent-A',1)).rejects.toThrow();
 const core=resolveVocabulary(f.editor,{profile:'core'}),restricted=Object.create(s);Object.defineProperty(restricted,'vocabulary',{value:core});
 await expect(prepare(JSON.stringify({...wire,entities:[{id:'forged'}]}),req.exchange,f.owner,f.editor.visualEffects,restricted,true,'ai','agent-A',1)).rejects.toThrow('DCP capability disabled: semantic.entity');
 expect(()=>normalizeEmptySemanticFields(wire,s.vocabulary,2 as any)).toThrow('Unsupported');expect(changes).not.toHaveBeenCalled();
});
it('prepares aliases as native typography, Entity mentions and independently targeted Glosses',async()=>{
 const f=fixture(),id=f.addHuman('Authenticity'),s=f.open(),req=await f.req(s,id);
 const general='<annotation type="style/bold">A😀<annotation type="style/italics">uthenticity</annotation></annotation>: <annotation type="mutable/entity-reference" id="new:s1" ref="new:e1">evidence</annotation>.';
 const short='<b>A😀<i>uthenticity</i></b>: <e id="new:s1" ref="new:e1">evidence</e>.';
 const changes=vi.fn(),stop=f.editor.repository.subscribeChanges(changes);clean.push(stop);const summaries=[];
 for(const markup of [general,short]){
  const value=workspaceResponse(req.exchange);value.composition[0].markup=markup;value.glosses=[{id:'new:g1',target:'new:s1',type:'definition',text:'Evidence can establish provenance.'}];
  for(const k of emptySemanticFields(s.vocabulary))delete value[k];
  const p=await prepare(JSON.stringify(value),req.exchange,f.owner,f.editor.visualEffects,s,true,'ai','agent-A',1),marks=p.children[0].standoffProperties as any[];
  expect(marks.find(m=>m.type==='mutable/entity-reference').metadata.entityReference).toEqual(p.aliases['new:e1'].entity);
  expect(p.aliases['new:s1'].kind).toBe('range');expect(p.aliases['new:g1'].kind).toBe('gloss');
  summaries.push({text:p.children[0].text,marks:marks.map(m=>[m.type,m.start,m.end]),definitions:Object.values(p.definitions).map((d:any)=>[d.type,d.value])});
 }
 expect(summaries[0]).toEqual(summaries[1]);expect(changes).not.toHaveBeenCalled();
 const core=resolveVocabulary(f.editor,{profile:'core'}),restricted=Object.create(s);Object.defineProperty(restricted,'vocabulary',{value:core,configurable:true});
 const bold=workspaceResponse(req.exchange);bold.entities=[];bold.composition[0].markup='<b>text</b>';
 Object.defineProperty(restricted,'vocabulary',{value:{...core,standoff:[]},configurable:true});
 await expect(prepare(JSON.stringify(bold),req.exchange,f.owner,f.editor.visualEffects,restricted,true,'ai','agent-A',1)).rejects.toThrow('DCP standoff disabled');
});
it('retains current source authority for Entity aliases and rejects foreign handles',async()=>{
 const f=fixture(),id=f.addHuman('Authenticity'),s=f.open(),req=await f.req(s,id),created=await f.admit(s,workspaceResponse(req.exchange));
 const oldHandle=s.issue(created.aliases['new:e1']);
 const next=f.open(),workspace=await semanticWorkspace(next,'agent-A'),handle=workspace.entities[0].handle;
 for(const ref of [handle,oldHandle,'src:foreign:e1']){
  const value=workspaceResponse('reuse',ref);value.composition[0].markup=`<e ref="${ref}">Authenticity</e>`;
  const result=prepare(JSON.stringify(value),'reuse',f.owner,f.editor.visualEffects,next,true,'ai','agent-A',1);
  if(ref===handle)await expect(result).resolves.toMatchObject({intent:'reply'});else await expect(result).rejects.toThrow('Unauthorized source handle');
 }
});
