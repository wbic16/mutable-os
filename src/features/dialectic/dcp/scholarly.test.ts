// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {workspaceFixture,workspaceResponse} from './workspace.fixture';
import {conversation} from '../../../../server/dialectic/providers';
import {defaultProviderSettings} from './provider-contract';
import {proactiveEditorialPolicy,dcpEditorialPolicy} from './editorial-policy';
import {semanticWorkspaceInstructions,scholarlyWorkspaceInstructions} from './workspace';
import {captureNative,nativeBytes,decodeNative} from '../../../persistence/native-resource';
import {canonicalSearchSource} from '../../../runtime/canonical-search-source';
const clean:(()=>void)[]=[];afterEach(()=>clean.splice(0).reverse().forEach(fn=>fn()));
function fixture(){const f=workspaceFixture();clean.push(()=>f.dispose());return f;}

it('assembles scholarly discipline once under the existing policy gate without changing source authority or schema',async()=>{
 const f=fixture(),human=f.addHuman('Tell me about Mercury.'),s=f.open(),r=await f.req(s,human,'agent-A',1);
 const state=conversation(defaultProviderSettings,r),user=JSON.parse(state.input[0].content);
 expect(state.system).toContain(proactiveEditorialPolicy);expect(state.system).toContain('not a conversational persona');expect(state.system).toContain('including repeated names');expect(state.system).toContain('privately check semantic completeness');
 expect(r.authoring.instructions).toContain(scholarlyWorkspaceInstructions);expect(r.authoring.instructions).not.toContain('establish the recurring');expect(user.authoring?.instructions).toBeUndefined();expect(user.protocolKey?.text).toBeUndefined();
 const old=await f.req(s,human);expect(conversation(defaultProviderSettings,old).system).toContain(dcpEditorialPolicy);expect(old.authoring.instructions).toContain(semanticWorkspaceInstructions);
 expect(r.vocabulary).toEqual(old.vocabulary);expect(r.legend).toEqual(old.legend);expect(r.authoring.examples).toEqual(old.authoring.examples);
});

it('preserves distinct Mercury identities, repeated occurrences, additive source mentions and relationships through native save/reload',async()=>{
 const f=fixture(),text='Mercury is the planet. Mercury is the god. Mercury is the element.',human=f.addHuman(text),s=f.open(),r=await f.req(s,human,'agent-A',1),v=workspaceResponse(r.exchange);
 const source=r.structuralContext.sources.find((x:any)=>x.nativeType==='standoff-editor-block');
 const types=['planet','god','element'];v.entities=types.map((type,i)=>({id:'new:e'+(i+1),name:'Mercury ('+type+')',typename:type,description:'The '+type+' sense of Mercury.',aliases:[]}));
 v.composition[0].markup='<e ref="new:e1">Mercury</e> is a planet; <e ref="new:e1">it</e> is distinct from <e ref="new:e2">Mercury</e> the god and <e ref="new:e3">Mercury</e> the element.';
 v.interpretations=types.map((type,i)=>({id:'new:m'+(i+1),target:{block:source.handle,revision:source.revision,quote:'Mercury',prefix:'',suffix:' is the '+type+'.'},type:'mutable/entity-reference',ref:'new:e'+(i+1),attributes:[]}));
 v.relations=[{id:'new:rel1',kind:'entity',type:'distinct-from',from:'new:e1',to:'new:e2'}];
 v.glosses=[{id:'new:g1',target:{block:'new:b1',revision:null,whole:true},type:'disambiguation',text:'A shared label does not imply a shared referent.'}];
 const p=await f.admit(s,v,'agent-A',r),humanNode=f.view.node(f.view.node(f.root.children[0])!.children[0])!;
 expect((await canonicalSearchSource(f.editor.repository.readState(),humanNode.contentKey,0)).runs.map(r=>r.text).join('')).toBe(text);
 const marks=(humanNode.payload.standoffProperties as any[]).filter(m=>m.type==='mutable/entity-reference');expect(marks.map(m=>[m.start,m.end])).toEqual([[0,6],[23,29],[43,49]]);
 expect(new Set(marks.map(m=>m.metadata.entityReference.entityId)).size).toBe(3);for(const m of marks)expect(m.metadata.dcp).toMatchObject({participantId:'agent-A',sourceAuthor:'human',sourceRevision:source.revision,createdUtc:expect.any(String)});
 const generated=(p.children[0].standoffProperties as any[]).filter(m=>m.type==='mutable/entity-reference');expect(generated).toHaveLength(4);expect(generated[0].metadata.entityReference).toEqual(generated[1].metadata.entityReference);
 const next=f.open(),rr=await f.req(next,human,'agent-B',1),known=rr.semanticWorkspace.entities.find((e:any)=>e.identity.entityId===p.aliases['new:e1'].entity!.entityId),reuse=workspaceResponse(rr.exchange,known.handle);
 reuse.composition[0].markup=`<e ref="${known.handle}">Mercury</e> is a planet. <e ref="${known.handle}">Mercury</e> is not the metal.`;
 await f.admit(next,reuse,'agent-B',rr);expect(Object.values(f.root.payload.linkedAnnotations??{}).filter((d:any)=>d.type==='mutable/entity')).toHaveLength(3);
 const snapshot=captureNative(f.editor.repository.readState(),f.owner),decoded=decodeNative(nativeBytes(snapshot));
 const inventory=(contents:any)=>Object.values(contents).flatMap((c:any)=>(c.payload.standoffProperties??[]).map((p:any)=>[c.payload.id,p.type,p.start,p.end,p.metadata?.entityReference,p.metadata?.dcp])).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 expect(inventory(decoded.contents)).toEqual(inventory(snapshot.contents));expect(inventory(decoded.contents).filter(p=>p[1]==='mutable/entity-reference')).toHaveLength(9);
 f.editor.repository.undo();expect(Object.values(f.root.payload.linkedAnnotations??{}).filter((d:any)=>d.type==='mutable/entity')).toHaveLength(3);f.editor.repository.redo();expect(inventory(captureNative(f.editor.repository.readState(),f.owner).contents)).toEqual(inventory(decoded.contents));
});
