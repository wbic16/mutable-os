// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {writeFileSync} from 'node:fs';
import {ReactiveEditor} from '../../../reactive-editor/editor';
import {registerApplicationViews} from '../../../application/features';
import {resolveVocabulary,copyVocabularySelection,vocabularyDescriptors} from './vocabulary';
import type {VocabularySnapshot,VocabularyProfile} from './vocabulary-contract';
import {capabilityCatalogue} from './capabilities';
import {authoringSchema,schemaFor} from './provider-schema';
import {request} from './exchange';
import {conversation,providerTurn,continuation,repair} from '../../../../server/dialectic/providers';
import {plainContribution,sse,streamFixture} from '../../../../server/dialectic/fixtures';
import {defaultProviderSettings} from './provider-contract';
const cleanup:(()=>void)[]=[];afterEach(()=>cleanup.splice(0).forEach(f=>f()));
function editor(features:Record<string,boolean>={}){const e=new ReactiveEditor({id:'vocabulary',type:'document-block',children:[]},{features:{nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,...features}});registerApplicationViews(e);cleanup.push(()=>e.dispose());return e;}
function schema(v:VocabularySnapshot,provider:'openai'|'anthropic'='openai'){const s=v.stages;return schemaFor(provider,s[0],s[1],s[2],s[3],s[4],s[5],s[6],s[7],v);}
function refs(s:any){const visited=new Set<string>();const walk=(v:any,path=new Set<string>())=>{if(!v||typeof v!=='object')return;if(v.$ref){const n=v.$ref.split('/').at(-1);expect(s.$defs[n],n).toBeDefined();if(!visited.has(n)){visited.add(n);walk(s.$defs[n],new Set([...path,n]));}return;}if(v.type==='object'){expect(v.additionalProperties).toBe(false);expect([...v.required].sort()).toEqual(Object.keys(v.properties).sort());}Object.entries(v).filter(([k])=>k!=='$defs').forEach(([,x])=>walk(x,path));};walk(s);}
it('keeps All Qualified as the default native vocabulary and resolves presets without acquiring resources',()=>{
 const e=editor(),all=resolveVocabulary(e);expect(all.profile).toBe('all-qualified');expect(all.kinds).toHaveLength(21);expect(all.standoff).toHaveLength(17);expect(all.schemas.slice().sort()).toEqual(authoringSchema(true,true,true,true,true,true,true,true).$defs.Node.anyOf.map((r:any)=>r.$ref.split('/').at(-1)).sort());
 const core=resolveVocabulary(e,{profile:'core'});expect(core.kinds.slice().sort()).toEqual(['paragraph','heading','group','list','table','code'].sort());expect(core.standoff.slice().sort()).toEqual(['style/bold','style/italics','style/highlight','reference/url'].sort());
 const general=resolveVocabulary(e,{profile:'general'});expect(general.kinds).toEqual(expect.arrayContaining(['grid','tabs','surface','sticky-note','external-image','video','youtube','embed']));expect(general.kinds).not.toContain('retained-pdf');expect(general.capabilities).toContain('semantic.gloss');
 const research=resolveVocabulary(e,{profile:'research'});expect(research.kinds).toEqual(expect.arrayContaining(['pages','source','image','retained-pdf']));expect(research.kinds).not.toContain('timer');expect(research.capabilities).toContain('semantic.entity-relation');expect(e.readAssetContext().cavernId).toBeFalsy();
});
it.each(['openai','anthropic'] as const)('projects strict recursive %s schema and configuration from one selection',provider=>{
 const e=editor();for(const profile of ['all-qualified','core','general','research'] as VocabularyProfile[]){const v=resolveVocabulary(e,{profile}),s=schema(v,provider);refs(s);const wire=JSON.stringify(s);for(const kind of ['timer','object3d','retained-pdf'])if(!v.kinds.includes(kind))expect(wire).not.toContain('"enum":["'+kind+'"]');}
 const v=resolveVocabulary(e,{profile:'general',disable:['composition.surface','composition.tasks','configuration.margins','configuration.text','configuration.table-headers']}),s=schema(v,provider);expect(JSON.stringify(s)).not.toContain('"enum":["surface"]');expect(JSON.stringify(s)).not.toContain('"bullet","ordered","task"');
 for(const [name,d]of Object.entries(s.$defs) as [string,any][])if(/^Paragraph/.test(name)){expect(d.properties.margins).toEqual({type:'null'});expect(d.properties.textStyle).toEqual({type:'null'});}
 expect(s.properties.entities.maxItems).toBeUndefined();expect(s.$defs.Span.properties.type.enum).toContain('mutable/entity-reference');
 const core=schema(resolveVocabulary(e,{profile:'core'}),provider);expect(core.$defs.ListConfiguration.properties.start).toEqual({type:'null'});expect(core.$defs.ListConfiguration.properties.items.anyOf[0].items.properties.checked).toEqual({type:'null'});
});
it('does not couple mentions/relationships to endpoint creation, or PDF wrappers to general Surfaces',()=>{
 const e=editor(),v=resolveVocabulary(e,{profile:'core',enable:['standoff:mutable/entity-reference','semantic.argument-relation','semantic.entity-relation','media.retained-pdf']});expect(v.capabilities).not.toContain('semantic.entity');expect(v.capabilities).not.toContain('semantic.argument');expect(v.kinds).not.toContain('surface');expect(v.kinds).toContain('retained-pdf');expect(schema(v).$defs.Relation.anyOf).toHaveLength(2);
 const dependency=resolveVocabulary(e,{profile:'general',disable:['source.anchor','composition.list']});expect(dependency.capabilities).not.toContain('source.classification');expect(dependency.capabilities).not.toContain('composition.tasks');
 const noMarks=resolveVocabulary(e,{profile:'core',disable:['style/bold','style/italics','style/highlight','reference/url'].map(t=>'standoff:'+t)});expect(noMarks.capabilities).not.toContain('source.classification');expect(schema(noMarks).properties.interpretations.maxItems).toBe(0);
 expect(()=>resolveVocabulary(e,{profile:'core',disable:['composition.paragraph']})).toThrow(/paragraph/);expect(()=>copyVocabularySelection({profile:'core',enable:['a'],disable:['a']})).toThrow(/Conflicting/);expect(()=>resolveVocabulary(e,{profile:'core',enable:['invented']})).toThrow(/Unknown/);
});
it('intersects native gates while retaining selection descriptors and immutable snapshots',()=>{
 const e=editor({taskLists:false,standoffCodeHighlighting:false,crossResourceLoaders:false,dcpNativeAuthoringStage2Compounds:false}),v=resolveVocabulary(e,{profile:'all-qualified'});expect(v.kinds).not.toContain('code');expect(v.kinds).not.toContain('surface');expect(v.kinds).not.toContain('retained-pdf');expect(v.capabilities).not.toContain('composition.tasks');expect(vocabularyDescriptors(e).find(d=>d.id==='composition.surface')?.available).toBe(false);
 const legacy=editor({dcpNativeAuthoringStage1:false,scopedSemantics:false});expect(vocabularyDescriptors(legacy).find(d=>d.standoff==='mutable/entity-reference')?.available).toBe(false);expect(resolveVocabulary(legacy,{profile:'core',enable:['standoff:mutable/entity-reference']}).capabilities).not.toContain('source.classification');
 const selection={profile:'core' as const,enable:['widget.timer']},first=resolveVocabulary(editor(),selection);selection.enable.length=0;expect(first.kinds).toContain('timer');expect(Object.isFrozen(first)).toBe(true);expect(Object.isFrozen(first.capabilities)).toBe(true);expect(()=>(first.kinds as string[]).push('embed')).toThrow();
});
it('keeps catalogue/legend/guidance consistent and records comparable provider byte measurements',async()=>{
 const e=editor(),measurements:any[]=[];for(const profile of ['all-qualified','core','general'] as VocabularyProfile[]){
 const v=resolveVocabulary(e,{profile}),catalogue=capabilityCatalogue(e,v),s=v.stages,req=request('MEASURE','src:measure:c1',[],[],e.visualEffects,true,catalogue,s[0],s[1],s[2],s[3],s[4],s[5],s[6],s[7],v);
 expect(req.legend.blocks).toEqual(v.kinds);expect(req.legend.types.map(t=>t.type)).toEqual(v.standoff);expect(req.authoring.instructions).toContain('fresh');expect(req.authoring.instructions).not.toContain('STAGE 2');
 if(profile==='core'){expect(req.authoring.instructions).not.toContain('Glosses attach');expect(catalogue.summary.items.some(i=>i.id==='media.image')).toBe(false);expect(catalogue.describe({ids:['source.classification']}).items[0].authorable).toBe(true);expect(catalogue.describe({ids:['media.image']}).items[0].authorable).toBe(false);}
 for(const item of catalogue.summary.items){const detail=catalogue.describe({ids:[item.id]});expect(detail.status,item.id).toBe('complete');expect(new TextEncoder().encode(JSON.stringify(detail)).length).toBeLessThanOrEqual(8192);}
 const bytes=(x:unknown)=>new TextEncoder().encode(typeof x==='string'?x:JSON.stringify(x)).length;
 const requestBytes:Record<string,number>={};for(const provider of ['openai','anthropic'] as const){const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,JSON.stringify(plainContribution('MEASURE')))));await providerTurn(conversation({...defaultProviderSettings,provider},req),'fixture',new AbortController().signal,()=>{},fetcher);requestBytes[provider+'RequestBytes']=bytes(String(fetcher.mock.calls[0][1]?.body));}
 measurements.push({profile,capabilities:v.capabilities.length,kinds:v.kinds.length,standoff:v.standoff.length,...requestBytes,systemInstructionsBytes:bytes(conversation(defaultProviderSettings,req).system),capabilitySummaryBytes:bytes(req.capabilities),openaiSchemaBytes:bytes(schema(v)),anthropicSchemaBytes:bytes(schema(v,'anthropic')),requestObjectBytes:bytes(req)});
 }writeFileSync('/tmp/dcp-vocabulary-stage-a-measurements.json',JSON.stringify(measurements,null,2));
});

it('does not mutate native configuration schemas or broaden a later exchange through projection',()=>{
 const e=editor(),before=structuredClone(authoringSchema(true,true,true,true,true,true,true,true));
 for(const profile of ['core','general'] as const)schema(resolveVocabulary(e,{profile,disable:['composition.tasks','configuration.list-numbering']}));
 expect(authoringSchema(true,true,true,true,true,true,true,true)).toEqual(before);
 const all=schema(resolveVocabulary(e));expect(all.$defs.ListConfiguration).toEqual(before.$defs.ListConfiguration);
});
it.each(['openai','anthropic'] as const)('retains the %s selection through provider requests, retrieval continuation and repair',async provider=>{
 const e=editor();for(const profile of ['core','general'] as const){
 const v=resolveVocabulary(e,{profile}),s=v.stages,req=request('exchange','src:fixture:c1',[],[],e.visualEffects,true,capabilityCatalogue(e,v),s[0],s[1],s[2],s[3],s[4],s[5],s[6],s[7],v),host=structuredClone(req),state=conversation({...defaultProviderSettings,provider},host),signal=new AbortController().signal;
 (host.vocabulary!.kinds as string[]).push('timer');expect(Object.isFrozen(state.vocabulary)).toBe(true);expect(Object.isFrozen(state.vocabulary!.kinds)).toBe(true);
 const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));
 await providerTurn(state,'fixture',signal,()=>{},fetcher);
 continuation(state,[],[]);repair(state);await providerTurn(state,'fixture',signal,()=>{},fetcher);
 for(const [,init]of fetcher.mock.calls){const body=JSON.parse(String(init?.body));expect(provider==='openai'?body.text.format.schema:body.output_config.format.schema).toEqual(schema(v,provider));expect(body.tools.map((t:any)=>t.name)).toContain('read_source');}
 }
});
it('keeps ordinary conversation expressive without specialist widgets or the full standoff catalogue',async()=>{
 const {conversationalSelection}=await import('./vocabulary');const e=editor(),v=resolveVocabulary(e,conversationalSelection);
 expect(v.profile).toBe('general');for(const k of ['object3d','timer','canvas-preview','retained-pdf','pages','source'])expect(v.kinds).not.toContain(k);
 for(const type of ['text/colour','text/background-colour','style/superscript','style/subscript'])expect(v.standoff).not.toContain(type);
 for(const id of ['semantic.entity','semantic.entity-relation','semantic.argument','semantic.argument-relation','semantic.gloss','standoff:mutable/entity-reference'])expect(v.capabilities).toContain(id);
 expect(JSON.stringify(schema(v))).not.toContain('Object3D');
});
