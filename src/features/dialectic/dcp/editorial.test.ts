// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {canonicalSearchSource} from '../../../runtime/canonical-search-source';
import {ReactiveEditor} from '../../../reactive-editor/editor';
import {registerApplicationViews} from '../../../application/features';
import {DialecticReferences} from '../references';
import {defaultParticipant,conversationMetadata} from '../model';
import {DcpSources} from './sources';
import {editorialExamples,withTextStyleDefaults,withLayoutDefaults,withCompoundDefaults,nativeTypographyInstructions} from './authoring';
import {request,prepare} from './exchange';
import {schemaFor} from './provider-schema';
import {vocabularyExample,type VocabularySelection} from './vocabulary-contract';
import {dcpEditorialPolicy} from './editorial-policy';
import {conversation,providerTurn,continuation,repair,titleConversation} from '../../../../server/dialectic/providers';
import {sse,streamFixture,plainContribution} from '../../../../server/dialectic/fixtures';
import {defaultProviderSettings} from './provider-contract';
const clean:(()=>void)[]=[];afterEach(()=>clean.splice(0).reverse().forEach(f=>f()));
function fixture(selection?:VocabularySelection,legacy=false){
 const owner='editorial',original='Every green surface on bronze proves that the object is ancient.';
 const editor=new ReactiveEditor({id:owner,type:'document-block',metadata:{dialectic:conversationMetadata},children:[{id:'human',type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'committed',author:'human',participant:defaultParticipant(owner,'human'),ordinal:1,replies:[]}},children:[{id:'earlier',type:'standoff-editor-block',text:original}]}]},{features:{nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,dialecticConversationUpdates:false,dialecticAutomaticTitles:false,...(legacy?{dcpVocabularySelection:false,dcpNativeAuthoringStage1:false}:{})}});
 clean.push(()=>editor.dispose());registerApplicationViews(editor);const view=editor.createView('editorial'),root=view.node(view.state.rootKey)!;
 const refs=new DialecticReferences(editor,view,root.key);clean.push(()=>refs.dispose());
 const sources=new DcpSources(editor,owner,()=>root.children.map(k=>view.node(k)!),k=>view.node(k),k=>view.parentOf(k),t=>refs.resolve(t),new AbortController().signal,()=>[],30000,()=>[],selection);clean.push(()=>sources.dispose());
 const v=sources.vocabulary,s=v?.stages??[false,false,false,false,false,false,false,false];
 const req=request('EDITORIAL',sources.issue({kind:'contribution',resourceId:owner,blockId:'human'}),[],[],editor.visualEffects,true,sources.capabilities,s[0],s[1],s[2],s[3],s[4],s[5],s[6],s[7],v);
 return {editor,view,root,sources,req,original};
}
const negotiated=(e:any)=>withCompoundDefaults(withLayoutDefaults(withTextStyleDefaults(e)));

it.each(editorialExamples.map(e=>[e.name,e] as const))('admits complete %s examples through native preparation',async(name,example)=>{
 const f=fixture(),v=f.sources.vocabulary!,response=negotiated(example).response;response.exchange=f.req.exchange;
 expect(vocabularyExample(response,v)).toBeDefined();
 if(name==='source-objection'){
  const inventory=await f.sources.tool({id:'inventory',tool:'list_text_blocks',arguments:{cursor:null,limit:1,participantId:defaultParticipant('editorial','human').id,contributionId:null,fromOrdinal:1}});
  const read=await f.sources.tool({id:'read',tool:'read_source',arguments:{handle:inventory.items[0].handle}});
  response.anchors[0].source=read.handle;response.anchors[0].revision=read.revision;
 }
 // Required envelope/node fields are exactly those advertised in strict output.
 const schema=schemaFor('openai',true,true,true,true,true,true,true,true,v);
 expect(Object.keys(response).sort()).toEqual([...schema.required].sort());
 const check=(nodes:any[])=>{for(const node of nodes){const def=schema.$defs[node.kind==='table'?'Table':'Paragraph'];expect(Object.keys(node).sort()).toEqual([...def.required].sort());if(node.rows)node.rows.forEach((r:any[])=>r.forEach(check));}};check(response.composition);
 const changes=vi.fn(),stop=f.editor.repository.subscribeChanges(changes);clean.push(stop);
 const prepared=await prepare(JSON.stringify(response),f.req.exchange,'editorial',f.editor.visualEffects,f.sources,true,'ai');
 expect(changes).not.toHaveBeenCalled(); // Guidance/preparation adds no canonical or per-input work.
 if(name==='rich-text')expect((prepared.children[0].standoffProperties as any[])?.map((p:any)=>p.type)).toEqual(['style/bold','style/italics','style/italics']);
 if(name==='comparison'){expect(prepared.children[0].type).toBe('table-block');expect(prepared.children[0].children).toHaveLength(3);}
 if(name==='gloss')expect(Object.values(prepared.definitions).some((d:any)=>d.value?.includes('In conservation'))).toBe(true);
 if(name==='arguments'){
  const relation=Object.values(prepared.definitions).find((d:any)=>d.metadata?.dialecticArgumentRelation) as any;
  expect(relation.metadata.dialecticArgumentRelation).toMatchObject({relation:'supports',from:{argumentId:prepared.aliases['new:arg1'].argumentId},to:{argumentId:prepared.aliases['new:arg2'].argumentId}});
 }
 if(name==='source-objection'){
  const [key,marks]=[...prepared.annotations][0];
  expect(marks.find((p:any)=>p.type==='dialectic/claim').metadata.dcp).toMatchObject({actor:'ai',sourceAuthor:'human',appliedTo:'existing-source',participantId:defaultParticipant('editorial','ai').id});
  f.editor.commands.boundedStructuralTransaction('Additive editorial interpretation',()=>{
   f.editor.commands.setPayloadField(f.root.key,'linkedAnnotations',prepared.definitions);
   f.editor.commands.setPayloadField(key,'standoffProperties',marks);
  });
  const text=await canonicalSearchSource(f.editor.repository.readState(),f.view.node(key)!.contentKey,0);
  expect(text.runs.map(r=>r.text).join('')).toBe(f.original);
 }
 if(name==='restraint'){expect(Object.keys(prepared.definitions)).toHaveLength(0);expect(prepared.children[0].standoffProperties??[]).toHaveLength(0);}
});

it('admits hyperlinks without semantic identities',async()=>{
 const f=fixture(),response=negotiated(editorialExamples[5]).response;response.exchange=f.req.exchange;response.composition[0].markup='See the <annotation type="reference/url" value="https://example.org/collection">collection catalogue</annotation>.';
 const prepared=await prepare(JSON.stringify(response),f.req.exchange,'editorial',f.editor.visualEffects,f.sources,true,'ai');
 expect((prepared.children[0].standoffProperties as any[])?.[0]).toMatchObject({type:'reference/url',value:'https://example.org/collection'});expect(Object.keys(prepared.definitions)).toHaveLength(0);
});

it('keeps baseline examples compact and vocabulary-filtered, with complete semantic examples in bounded discovery',()=>{
 const f=fixture();expect(f.req.authoring.examples).toHaveLength(4);expect(f.req.authoring.instructions).toContain(nativeTypographyInstructions);
 for(const [id,name] of [['semantic.gloss','gloss'],['source.classification','source-objection'],['semantic.argument-relation','arguments']]){
  const detail=f.sources.capabilities!.describe({ids:[id]});expect(detail.status).toBe('complete');expect(detail.items[0].contributionExample.name).toBe(name);expect(new TextEncoder().encode(JSON.stringify(detail)).length).toBeLessThanOrEqual(8192);
 }
 const restricted=fixture({profile:'core',disable:['composition.heading','composition.group','composition.list','composition.table','composition.code','source.anchor','reference.reply','standoff:style/bold','standoff:style/italics','standoff:style/highlight','standoff:reference/url']});
 expect(restricted.req.authoring.examples.map((e:any)=>e.name)).toEqual(['restraint']);
 for(const heading of ['NATIVE TYPOGRAPHY','\nGLOSSES\n','\nARGUMENTS\n','\nARGUMENT RELATIONSHIPS\n','\nSOURCE INTERPRETATION\n','\nSOURCE REFERENCES\n','\nSTRUCTURAL COMPOSITION\n'])expect(restricted.req.authoring.instructions).not.toContain(heading);
 expect(restricted.sources.capabilities!.describe({ids:['semantic.gloss']}).items[0].contributionExample).toBeUndefined();
 const legacy=fixture(undefined,true);expect(legacy.req.authoring.instructions).toContain(nativeTypographyInstructions);expect(legacy.req.authoring.examples.every((e:any)=>!JSON.stringify(e).includes('textStyle'))).toBe(true);
});

it.each(['openai','anthropic'] as const)('sends editorial policy in order on actual %s requests, continuation and repair',async provider=>{
 const f=fixture(),state=conversation({...defaultProviderSettings,provider},f.req);
 const markers=['Active DCP exchange:',f.req.protocolKey.text,dcpEditorialPolicy,f.req.authoring.instructions,'REQUESTED SOURCE OPERATIONS','Return a complete DCP contribution'];
 const positions=markers.map(m=>state.system.indexOf(m));expect(positions.every(p=>p>=0)).toBe(true);expect(positions).toEqual([...positions].sort((a,b)=>a-b));
 const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>sse(streamFixture(provider,JSON.stringify(plainContribution('EDITORIAL')))));
 for(const phase of ['initial','continuation','repair']){
  if(phase==='continuation')continuation(state,[],[]);if(phase==='repair')repair(state,{code:'source-identity'});
  await providerTurn(state,'fixture',new AbortController().signal,()=>{},fetcher);
 }
 for(const [,init]of fetcher.mock.calls){const body=JSON.parse(String(init?.body)),instructions=body.instructions??body.system;expect(instructions.split(dcpEditorialPolicy)).toHaveLength(2);expect(instructions).toContain('Default intent: reply.');}
 expect(titleConversation(defaultProviderSettings,'Title input').system).not.toContain(dcpEditorialPolicy);
 const core=fixture({profile:'core'}),next=conversation({...defaultProviderSettings,provider},core.req);expect(next.system).toContain(dcpEditorialPolicy);expect(next.system).not.toContain('\nARGUMENT RELATIONSHIPS\n');
});
