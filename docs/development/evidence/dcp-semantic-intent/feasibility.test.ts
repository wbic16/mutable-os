// @vitest-environment jsdom
// Investigation only: current production contracts, synthetic Documents, no provider calls.
import {afterEach,expect,it} from 'vitest';
import {ReactiveEditor} from '../../../../src/reactive-editor/editor';
import {registerApplicationViews} from '../../../../src/application/features';
import {DialecticReferences} from '../../../../src/features/dialectic/references';
import {defaultParticipant,conversationMetadata} from '../../../../src/features/dialectic/model';
import {DcpSources} from '../../../../src/features/dialectic/dcp/sources';
import {prepare} from '../../../../src/features/dialectic/dcp/exchange';
const cleanup:(()=>void)[]=[];afterEach(()=>cleanup.splice(0).reverse().forEach(f=>f()));
function fixture(text='Authenticity depends on evidence.'){
 const editor=new ReactiveEditor({id:'doc',type:'document-block',metadata:{dialectic:conversationMetadata},children:[{id:'human',type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'committed',author:'human',participant:defaultParticipant('doc','human'),ordinal:1,replies:[]}},children:[{id:'text',type:'standoff-editor-block',text}]}]},{features:{nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,dialecticConversationUpdates:false,dialecticAutomaticTitles:false}});
 cleanup.push(()=>editor.dispose());registerApplicationViews(editor);const view=editor.createView('investigation'),root=view.node(view.state.rootKey)!;
 const references=new DialecticReferences(editor,view,root.key);cleanup.push(()=>references.dispose());
 const sources=new DcpSources(editor,'doc',()=>root.children.map(k=>view.node(k)!),k=>view.node(k),k=>view.parentOf(k),t=>references.resolve(t),new AbortController().signal);cleanup.push(()=>sources.dispose());
 const handle=sources.issue({kind:'block',resourceId:'doc',blockId:'text'});
 return {editor,sources,handle,prepare:(value:any)=>prepare(JSON.stringify(value),'example','doc',editor.visualEffects,sources,true,'ai')};
}
const entity=(id='new:e1')=>({id,name:'Authenticity',typename:'Concept',description:'The criteria under which an object is regarded as genuine.',aliases:[]});
const envelope=()=>({protocol:'dcp/1.0',kind:'contribution',exchange:'example',intent:'reply',replyTargets:[],composition:[{id:'new:b1',kind:'paragraph',markup:'<annotation type="mutable/entity-reference" id="new:s1" ref="new:e1">Authenticity</annotation> depends on evidence.',ranges:[],textStyle:null,margins:null}],entities:[entity()],anchors:[] as any[],interpretations:[] as any[],glosses:[] as any[],arguments:[],relations:[],suggestions:[],promotionRecommendations:[]});

it('already prepares one Entity, its generated and earlier-human mentions, and a contextual Gloss',async()=>{
 const f=fixture(),source=await f.sources.source(f.handle),v=envelope();
 v.anchors=[{id:'new:r1',source:f.handle,revision:source.revision,selector:{exact:'Authenticity',prefix:'',suffix:''}}];
 v.interpretations=[{id:'new:m1',target:'new:r1',type:'mutable/entity-reference',ref:'new:e1',attributes:[]}];
 v.glosses=[{id:'new:g1',target:'new:s1',type:'qualification',text:'A criterion of genuineness can be disputed even when the object’s identity is agreed.'}];
 const result=await f.prepare(v),identity=result.aliases['new:e1'].entity;
 expect((result.children[0].standoffProperties as any[]).find(p=>p.type==='mutable/entity-reference').metadata.entityReference).toEqual(identity);
 const old=[...result.annotations.values()].flat().find(p=>p.type==='mutable/entity-reference');expect(old.metadata.entityReference).toEqual(identity);expect(old.metadata.dcp).toMatchObject({actor:'ai',sourceAuthor:'human'});
 expect(Object.values(result.definitions).some((d:any)=>d.type==='mutable/gloss'&&d.value.startsWith('qualification:'))).toBe(true);
 // Reuse of an issued local identity is already admitted; no new declaration is needed.
 f.sources.entities.commit(Object.fromEntries(Object.entries(result.definitions).filter(([,d]:any)=>d.type==='mutable/entity')));
 const handle=f.sources.issue({kind:'entity',resourceId:'doc',entity:identity});const reuse=envelope();reuse.entities=[];reuse.composition[0].markup=`<annotation type="mutable/entity-reference" ref="${handle}">Authenticity</annotation>`;
 expect(Object.keys((await f.prepare(reuse)).definitions)).toHaveLength(0);
});

it('does not deduplicate names and cannot use a generated Block ID directly as a Gloss passage',async()=>{
 const f=fixture(),v=envelope();v.entities.push(entity('new:e2'));const r=await f.prepare(v);
 expect(r.aliases['new:e1'].entity.entityId).not.toBe(r.aliases['new:e2'].entity.entityId);
 v.glosses=[{id:'new:g1',target:'new:b1',type:'note',text:'A whole-paragraph qualification.'}];await expect(f.prepare(v)).rejects.toThrow(/Unauthorized source handle/);
 await expect(f.prepare({...envelope(),semanticIntent:[]})).rejects.toThrow(/fields/);
});

it('uses literal unique quotes and permits full nonempty text while rejecting ambiguity and normalization guesses',async()=>{
 const f=fixture('provenance provenance 😀 e\u0301'),source=await f.sources.source(f.handle);
 const exact=(text:string,prefix='')=>f.sources.exact(f.handle,source.revision,{exact:text,prefix,suffix:''});
 await expect(exact('provenance')).rejects.toThrow(/Ambiguous/);expect((await exact('provenance','provenance ')).start).toBe(11);
 await expect(exact('Provenance')).rejects.toThrow(/Missing/);await expect(exact('é')).rejects.toThrow(/Missing/);
 expect((await exact('e\u0301')).text).toBe('e\u0301');expect((await exact('😀')).end-(await exact('😀')).start).toBe(1);
 expect((await exact(source.text)).start).toBe(0);await expect(exact('')).rejects.toThrow(/selector/);
});
