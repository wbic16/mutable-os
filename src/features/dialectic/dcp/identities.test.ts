// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {sourceIdentity,sourceScope,validateGeneratedIdentity,generatedIdentityPattern,type GeneratedIdentityKind} from './identities';
import {responseSchema,schemaFor} from './provider-schema';
import {authoringExamples} from './authoring';
import {markup,registerDcpTypes} from './markup';
import {prepare} from './exchange';
import {VisualEffectRegistry} from '../../../runtime/visual-effect-registry';
const response=():any=>({...structuredClone(authoringExamples[0].response),exchange:'exchange',replyTargets:[]});

it('uses a compact exchange tag and distinct prefixes without replacing native identity resolution',()=>{
 const scope=sourceScope();expect(scope).toMatch(/^[A-Za-z0-9_-]{22}$/);expect(sourceScope()).not.toBe(scope);
 const kinds=['contribution','block','range','entity','gloss','argument','argument-relation','entity-relation'] as const;
 const handles=kinds.map((kind,i)=>sourceIdentity(scope,kind,i+1));expect(new Set(handles).size).toBe(kinds.length);
 expect(handles).toEqual(['c1','b2','r3','e4','g5','arg6','ar7','er8'].map(suffix=>'src:'+scope+':'+suffix));
 expect(handles.every(h=>h.length<'source-00000000-0000-0000-0000-000000000000'.length)).toBe(true);
});

it('checks declaration roles, reserves host handles, and retains legacy aliases',()=>{
 const roles:GeneratedIdentityKind[]=['b','r','s','pos','m','e','g','arg','rel'];
 for(const role of roles){
  expect(()=>validateGeneratedIdentity('new:'+role+'1',role)).not.toThrow();
  expect(()=>validateGeneratedIdentity('legacy-alias',role)).not.toThrow();
  for(const other of roles.filter(r=>r!==role))expect(()=>validateGeneratedIdentity('new:'+other+'1',role)).toThrow('provisional ID');
  for(const id of ['src:unissued:b1','new:'+role+'0','new:'+role+'-1','new:unknown1'])expect(()=>validateGeneratedIdentity(id,role)).toThrow('provisional ID');
 }
});

it.each(['openai','anthropic'] as const)('%s schema constrains declaration roles without changing reference shapes',provider=>{
 const schema=schemaFor(provider),defs=schema.$defs;
 for(const [name,role]of Object.entries({Paragraph:'b',Anchor:'r',Span:'s',LocalEntity:'e',Interpretation:'m',Argument:'arg',Gloss:'g',ArgumentRelation:'rel',EntityRelation:'rel'})){
  expect(defs[name].properties.id.pattern).toBe(generatedIdentityPattern(role as GeneratedIdentityKind));
 }
 expect(defs[provider==='openai'?'Table':'Table0'].properties.id.pattern).toBe(generatedIdentityPattern('b'));
 expect(defs.Anchor.properties.source).toEqual({type:'string'});expect(schema.properties.replyTargets.items).toEqual({type:'string'});
 expect(responseSchema.properties.protocol.enum).toEqual(['dcp/1.0']);
});

it('rejects a source anchor alias used as a generated passage or composition declaration before native work',async()=>{
 const registry=new VisualEffectRegistry();registerDcpTypes(registry,true);
 for(const id of ['new:r1','src:unissued:b1']){
  const v=response();v.composition[0].id=id;
  await expect(prepare(JSON.stringify(v),'exchange','doc',registry,{} as any)).rejects.toThrow('provisional ID');
 }
 const example=structuredClone(authoringExamples[1].response) as any;example.exchange='exchange';
 example.composition[0].markup='<annotation type="style/bold" id="new:r1">Rain</annotation>';
 await expect(prepare(JSON.stringify(example),'exchange','doc',registry,{} as any,true)).rejects.toThrow('provisional ID');
 const declared:string[]=[];
 markup('<boundary id="new:pos1"/>Rain<boundary id="new:pos2"/>',[{id:'new:s1',type:'style/bold',from:'new:pos1',to:'new:pos2',ref:null,attributes:[]}],registry,{version:1,actor:'mock',protocol:'dcp/1.0',exchangeId:'e',sourceResourceId:'doc'},(id,role)=>{validateGeneratedIdentity(id,role);declared.push(id);});
 expect(declared).toEqual(['new:pos1','new:pos2','new:s1']);
});
