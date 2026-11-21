import {canonicalSearchSource} from '../../../runtime/canonical-search-source';
// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {workspaceFixture,workspaceResponse} from './workspace.fixture';
import {prepare} from './exchange';
import {allowsSourceRecovery,validationDiagnostic} from './diagnostics';
import {conversation,repair} from '../../../../server/dialectic/providers';
import {defaultProviderSettings} from './provider-contract';
import {dcpEditorialPolicy,proactiveEditorialPolicy} from './editorial-policy';
import {resolveVocabulary} from './vocabulary';
const clean:(()=>void)[]=[];afterEach(()=>clean.splice(0).reverse().forEach(fn=>fn()));
function fixture(){const f=workspaceFixture();clean.push(()=>f.dispose());return f;}

it('negotiates the proactive policy once, preserving legacy policy, examples and disabled capabilities',async()=>{
 const f=fixture(),human=f.addHuman('Discuss identity.'),s=f.open(),r=await f.req(s,human);
 expect(conversation(defaultProviderSettings,r).system).toContain(dcpEditorialPolicy);
 r.authoring.proactiveSemantics=1;const state=conversation(defaultProviderSettings,r);
 expect(state.system).toContain(proactiveEditorialPolicy);expect(proactiveEditorialPolicy).not.toContain('establish the recurring');
 expect(state.input[0].content).not.toContain('Interpret substantive');
 expect(JSON.parse(state.input[0].content).authoring?.instructions).toBeUndefined();
 expect(state.system).toContain(r.authoring.instructions);expect(r.authoring.examples).toBeDefined();
 expect(s.vocabulary!.capabilities).toEqual(expect.arrayContaining(['semantic.argument','semantic.entity-relation','semantic.argument-relation']));
 const limited=resolveVocabulary(f.editor,{profile:'general',disable:['standoff:mutable/entity-reference']});expect(limited.capabilities).not.toContain('semantic.entity');
 expect(()=>conversation(defaultProviderSettings,{...r,authoring:{...r.authoring,proactiveSemantics:2}})).toThrow('Unsupported');
});

it('rejects an unmentioned new Entity without canonical writes, permits legacy output and repairs through native mentions',async()=>{
 const f=fixture(),human=f.addHuman('Authenticity'),s=f.open(),r=await f.req(s,human),v=workspaceResponse(r.exchange);
 r.authoring.proactiveSemantics=1;v.composition[0].markup='Authenticity depends on evidence.';
 const changes=vi.fn(),stop=f.editor.repository.subscribeChanges(changes);clean.push(stop);
 let diagnostic:any;try{await f.admit(s,v,'agent-A',r);throw Error('Expected rejection')}catch(e){diagnostic=validationDiagnostic(e)}
 expect(diagnostic).toMatchObject({code:'entity-mention',path:'$.entities[0]'});expect(allowsSourceRecovery(diagnostic)).toBe(true);
 expect(changes).not.toHaveBeenCalled();expect(f.root.payload.linkedAnnotations??{}).toEqual({});
 await expect(prepare(JSON.stringify(v),r.exchange,f.owner,f.editor.visualEffects,s,true)).resolves.toBeDefined();
 const state=conversation(defaultProviderSettings,r);repair(state,diagnostic);expect(state.input.at(-1).content).toContain('Every new Entity');expect(state.input.at(-1).content).toContain('single repair');
 v.composition[0].markup='<e ref="new:e1">Authenticity</e> depends on evidence.';
 const admitted=await f.admit(s,v,'agent-A',r),p=(admitted.children[0].standoffProperties as any[])[0];
 expect(p).toMatchObject({type:'mutable/entity-reference',start:0,end:11,metadata:{entityReference:admitted.aliases['new:e1'].entity}});
});

it('grounds a new Entity on a read human source and preserves revision, author and interpreter attribution',async()=>{
 const f=fixture(),human=f.addHuman('The maintained ship retains its identity.'),s=f.open(),r=await f.req(s,human),v=workspaceResponse(r.exchange);
 r.authoring.proactiveSemantics=1;const source=r.structuralContext.sources.find((x:any)=>x.nativeType==='standoff-editor-block');
 v.entities[0].name='Maintained ship';v.composition[0].markup='Continuity provides a reason, but its sufficiency is disputed.';
 const target={block:source.handle,revision:source.revision,quote:'maintained ship',prefix:'The ',suffix:' retains'};
 v.interpretations=[{id:'new:m1',target,type:'mutable/entity-reference',ref:'new:e1',attributes:[]},{id:'new:m2',target:{block:source.handle,revision:source.revision,whole:true},type:'dialectic/claim',ref:null,attributes:[]}];
 const p=await f.admit(s,v,'agent-B',r),marks=[...p.annotations.values()].flat();
 expect(marks.find(m=>m.type==='mutable/entity-reference')).toMatchObject({start:4,end:18,metadata:{dcp:{sourceAuthor:'human',participantId:'agent-B',sourceRevision:source.revision,appliedTo:'existing-source'},entityReference:p.aliases['new:e1'].entity}});
 const humanText=f.view.node(f.view.node(f.root.children[0])!.children[0])!;expect((await canonicalSearchSource(f.editor.repository.readState(),humanText.contentKey,0)).runs.map(r=>r.text).join('')).toBe('The maintained ship retains its identity.');
 const next=f.open(),rr=await f.req(next,human);rr.authoring.proactiveSemantics=1;
 const reused=workspaceResponse(rr.exchange,rr.semanticWorkspace.entities[0].handle);await expect(f.admit(next,reused,'agent-A',rr)).resolves.toBeDefined();
});

it('does not count relationship endpoints as mentions; rejects invalid mixed operations and stale source grounding atomically',async()=>{
 const f=fixture(),human=f.addHuman('A ship.'),s=f.open(),r=await f.req(s,human);r.authoring.proactiveSemantics=1;
 const v=workspaceResponse(r.exchange);v.entities.push({...v.entities[0],id:'new:e2',name:'Second referent'});v.relations=[{id:'new:rel1',kind:'entity',type:'contrasts-with',from:'new:e1',to:'new:e2'}];
 const revision=f.editor.repository.state.revision;await expect(f.admit(s,v,'agent-A',r)).rejects.toThrow('Every new Entity');expect(f.editor.repository.state.revision).toBe(revision);
 v.composition[0].markup+='<e ref="new:e2">Second referent</e>';v.relations[0].to='src:foreign:e9';await expect(f.admit(s,v,'agent-A',r)).rejects.toThrow();expect(f.editor.repository.state.revision).toBe(revision);
 v.relations=[];v.composition[0].markup='Discussion';const source=r.structuralContext.sources.find((x:any)=>x.nativeType==='standoff-editor-block');v.interpretations=[{id:'new:m1',target:{block:source.handle,revision:'old',whole:true},type:'mutable/entity-reference',ref:'new:e1',attributes:[]}];await expect(f.admit(s,v,'agent-A',r)).rejects.toThrow('authority');expect(f.editor.repository.state.revision).toBe(revision);
});

it('keeps the disabled feature compatible and rejects empty mentions under the negotiated policy',async()=>{
 const off=workspaceFixture(true,false);clean.push(()=>off.dispose());off.addHuman('Legacy');
 expect(resolveVocabulary(off.editor,{profile:'general'}).capabilities).not.toContain('semantic.argument');
 expect(off.editor.visualEffects.type('mutable/entity-reference')!.renderers).toEqual([]);
 const s=off.open(),v=workspaceResponse('legacy');v.composition[0].markup='Unannotated legacy Entity';await expect(off.admit(s,v)).resolves.toBeDefined();
 const f=fixture(),human=f.addHuman('Authenticity'),ss=f.open(),r=await f.req(ss,human);r.authoring.proactiveSemantics=1;
 const bad=workspaceResponse(r.exchange);bad.composition[0].markup='<e ref="new:e1"></e>';
 await expect(f.admit(ss,bad,'agent-A',r)).rejects.toThrow();expect(f.root.payload.linkedAnnotations??{}).toEqual({});
});
