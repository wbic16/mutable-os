import { sourcePayload, sourceType } from '../interchange/source-block';
// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import Database from 'better-sqlite3';
import {ReactiveEditor} from '../reactive-editor/editor';
import {materializeLocalWorkspace} from '../reactive-editor/workspace-manifest';
import {captureNative,nativeBytes,decodeNative} from '../persistence/native-resource';
import {resourceToRepository} from '../history/durable-core';
import {encodeAuthoredValue,decodeAuthoredValue} from '../history/preplan-spike/wire';
import {clone} from '../block-tree/clone';
import {lightweightFacts} from '../knowledge/saved-reader';
import {matchSources} from '../runtime/search-matching';
import {FactsIndex} from '../knowledge/index';
import {collectFacts} from '../knowledge/collect-facts';
import {encodeFacts,decodeFacts} from '../knowledge/transport';
import {normalizePolicy} from '../knowledge/policy';
import {projectSaved} from './saved-projection';
import {migrate} from './schema.mjs';
import {reconcile,sqlRevision} from './reconcile.mjs';
import {sqlSavedFacts} from './saved-facts';
import {sqlKnowledgeRead} from './query-services';
const cleanup:(()=>void)[]=[];afterEach(()=>cleanup.splice(0).reverse().forEach(f=>f()));
const vault='18e2b9ce-d3e7-4a14-b67d-b265437bcad8';
const doc=(id='doc',children:any[]=[])=>({id,type:'document-block',metadata:{documentId:`resource-${id}`,title:'Unicode 😀 title',tags:['z','a','z']},children:[{id:`${id}-text`,type:'standoff-editor-block',text:'A😀é漢\nSecond line'},{id:`${id}-other`,type:'standoff-editor-block',text:'Another paragraph'},...children]});
function host(documents=[doc()]){const editor=new ReactiveEditor(materializeLocalWorkspace({id:'workspace',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block',children:documents}]}));cleanup.push(()=>editor.dispose());const view=editor.createView('main');return {editor,node:(id:string)=>Object.values(view.state.nodes).find(n=>n.payload.id===id)!,capture:(id='doc')=>captureNative(editor.repository.snapshot(),`resource-${id}`)};}
const normalized=(facts:any)=>decodeFacts(encodeFacts(facts));
async function indexed(bytes:Uint8Array,policy=normalizePolicy(undefined)){
 const db=new Database(':memory:');cleanup.push(()=>db.close());migrate(db,'mutable',{fresh:true,vaultGuid:vault});
 const p=await projectSaved(bytes,vault,policy);reconcile(db,p,{path:'doc.mutable.json',contentHash:p.contentHash},null);
 const source={resourceId:p.resourceId,path:'doc.mutable.json',byteHash:p.contentHash,policy};return {db,source,revision:sqlRevision(db)};
}
async function parity(graph:any,policy=normalizePolicy(undefined)){
 const bytes=nativeBytes(graph),x=await indexed(bytes,policy),r=await sqlSavedFacts(x.db,x.source);
 const light=await lightweightFacts(bytes,undefined,{extraction:policy}),full=await collectFacts(resourceToRepository(decodeNative(bytes)),graph.resourceId,undefined,undefined,{extraction:policy});
 expect(decodeFacts(r.wire)).toEqual(normalized(light.facts));expect(decodeFacts(r.wire)).toEqual(normalized(full));
 const search=(f:any)=>matchSources(f.blocks.filter((b:any)=>b.text).map((b:any)=>({...b.text,contentKey:b.id,version:0})),'😀|Another|漢',{regex:true});expect(search(r.facts)).toEqual(search(full));
 const backlinks=async(f:any)=>{const index=new FactsIndex(()=>0),scope={alive:true,epoch:0};await index.publish(scope,f,()=>{},async()=>{});await index.publish(scope,{id:'resource-target',rootBlockId:'target',title:'Target',tags:[],blocks:[],annotations:[],mentions:[],diagnostics:[]},()=>{},async()=>{});return (await index.backlinks(scope,'resource-target',async()=>{})).hits;};expect(await backlinks(r.facts)).toEqual(await backlinks(full));
 return {...x,...r};
}
it('SQL Facts exactly match lightweight/full native oracles for Unicode, inline images, linked annotations, unknown values and ordered properties',async()=>{
 const h=host([doc('doc',[{id:'plain',type:'plain-text-block',text:'plain 😀 é'},{id:'text',type:'text-block',text:'utf16 漢字'},{id:'empty',type:'standoff-editor-block',text:''}])]);
 h.editor.commands.insertInlineImage(h.node('doc-text').key,2,{assetId:'asset',src:'/image.png',alt:'image',width:40,height:30,status:'ready'});
 h.editor.linkedAnnotations.createForSegments([{nodeKey:h.node('doc-text').key,start:0,end:3},{nodeKey:h.node('doc-other').key,start:0,end:3}],'codex/entity-reference','entity-poe');
 h.editor.rangeAnnotations.apply([h.editor.textRanges.snapshot(h.node('doc-other').key,5,7)],'codex/block-reference','target',{documentId:'resource-target'});
 const graph=clone(h.capture()) as any,text=Object.values(graph.contents).find((c:any)=>c.payload.id==='doc-text') as any,raw=text.payload.standoffProperties;
 text.payload.standoffProperties=[...raw,{id:'unknown',type:'future',start:4,end:5,value:{nan:NaN,negativeZero:-0,undefined:undefined,tag:{$codexHistoryValue:['undefined']}}},{id:'hidden',type:'codex/entity-reference',start:0,end:1,value:'hidden',clientOnly:true},{id:'deleted',type:'style/bold',start:0,end:1,isDeleted:true}];
 const r=await parity(graph);expect(r.facts.mentions.find(m=>m.kind==='entity')?.text).toContain('[inline object]');expect(r.facts.tags).toEqual(['z','a']);expect(r.facts.mentions).toHaveLength(2);
 const mentions=await sqlKnowledgeRead(r.db,{kind:'entity-mentions',revision:r.revision,source:r.source,entityId:'entity-poe',limit:1});expect(mentions.items).toHaveLength(1);expect(mentions.canonicalEntityPresent).toBe(false);expect(mentions.provenance).toBe('saved-native-assertions');
});
it('opaque hosts, unplaced retained definitions and reference cycles never leak descendant text',async()=>{
 const h=host([doc('doc',[{id:'app',type:'future-application-block',children:[{id:'private',type:'plain-text-block',text:'secret'}]},{id:'custom',type:'custom-widget',children:[{id:'inside',type:'plain-text-block',text:'also secret'}]}])]);
 h.editor.commands.transclude(h.node('doc-text').key,{kind:'at',parentKey:h.node('doc').key,index:0});
 const graph=clone(h.capture()) as any,root=graph.placements[graph.rootPlacementKey].target.contentKey,template=graph.contents[root];
 graph.contents.retained={...clone(template),key:'retained',viewType:'container-block',payload:{id:'retained',type:'container-block'},children:['cycle'],definitionOwnerKey:root};graph.placements.cycle={key:'cycle',placementId:'cycle',kind:'reference',target:{kind:'local',contentKey:'retained'}};
 const r=await parity(graph,normalizePolicy({version:1,opaqueTypes:['custom-widget']}));expect(r.facts.blocks.some(b=>['private','inside','retained'].includes(b.id))).toBe(false);expect(r.facts.diagnostics).toContain('External resource body not expanded');
});
it('owned external Documents and foreign unresolved definitions retain exact incomplete semantics',async()=>{
 const h=host([doc('a',[doc('b')]),doc('c')]);h.editor.linkedAnnotations.createForSegments([{nodeKey:h.node('a-text').key,start:0,end:1},{nodeKey:h.node('c-text').key,start:0,end:1}],'codex/entity-reference','poe');
 const r=await parity(h.capture('a'));expect(r.facts.diagnostics).toContain('Foreign/unresolved linked definition');expect(r.facts.mentions).toEqual([]);expect(r.facts.blocks.some(b=>b.id==='b')).toBe(false);
});
it('missing definitions, duplicate local segment identities and deleted shared definitions keep oracle diagnostics',async()=>{
 for(const mode of ['missing','duplicate','deleted']){
  const h=host();h.editor.linkedAnnotations.createForSegments([{nodeKey:h.node('doc-text').key,start:0,end:1}],'codex/entity-reference','poe');
  const graph=clone(h.capture()) as any,root=graph.contents[graph.placements[graph.rootPlacementKey].target.contentKey],text=Object.values(graph.contents).find((c:any)=>c.payload.id==='doc-text') as any;
  if(mode==='missing'){delete root.payload.linkedAnnotations;await expect(indexed(nativeBytes(graph))).rejects.toThrow('lacks Document ownership');continue;}
  if(mode==='duplicate')text.payload.standoffProperties.push({...text.payload.standoffProperties[0]});
  if(mode==='deleted')for(const def of Object.values(root.payload.linkedAnnotations) as any[])def.isDeleted=true;
  await parity(graph);
 }
});
it('source/profile/revision mismatch, cancellation and concurrent SQL changes never publish eligible results',async()=>{
 const h=host(),x=await indexed(nativeBytes(h.capture()));
 for(const source of [{...x.source,byteHash:'old'},{...x.source,path:'moved.mutable.json'},{...x.source,policy:normalizePolicy({version:1,opaqueTypes:['custom']})}])await expect(sqlSavedFacts(x.db,source)).rejects.toThrow('evidence');
 await expect(sqlKnowledgeRead(x.db,{kind:'facts',source:x.source,revision:'old'})).rejects.toThrow('expired');
 let checks=0;await expect(sqlSavedFacts(x.db,x.source,()=>{if(++checks===5)throw Error('cancelled');})).rejects.toThrow('cancelled');
 let changed=false;await expect(sqlKnowledgeRead(x.db,{kind:'facts',source:x.source,revision:x.revision},()=>{if(!changed&&++checks>8){changed=true;x.db.prepare('UPDATE Resource SET title=?').run('changed');}})).rejects.toThrow('expired');
});
it('canonical Relationship service is directional, bounded, independently sourced and retains authored values',async()=>{
 const x=await indexed(nativeBytes(host().capture()));
 const now=new Date().toISOString();for(const id of ['a','b','c'])x.db.prepare('INSERT INTO Entity(guid,name,nameKey,createdUtc,modifiedUtc) VALUES(?,?,?,?,?)').run(id,id,id,now,now);
 const attributes=JSON.stringify(encodeAuthoredValue({value:NaN,other:undefined}));
 for(const [id,a,b] of [['r1','a','b'],['r2','c','a'],['r3','a','c']])x.db.prepare('INSERT INTO Relationship(guid,sourceEntityGuid,typename,targetEntityGuid,attributes,createdUtc,modifiedUtc) VALUES(?,?,?,?,?,?,?)').run(id,a,'knows',b,attributes,now,now);
 const revision=sqlRevision(x.db),read=(direction:any,limit=100,after?:string)=>sqlKnowledgeRead(x.db,{kind:'relationships',revision,entityId:'a',direction,limit,after});
 expect((await read('incoming')).items.map((r:any)=>r.guid)).toEqual(['r2']);expect((await read('outgoing')).items.map((r:any)=>r.guid)).toEqual(['r1','r3']);
 const first=await read('both',1);expect(first.truncated).toBe(true);expect(first.coverage.complete).toBe(false);expect((await read('both',100,first.nextAfter)).items).toHaveLength(2);expect(decodeAuthoredValue(first.items[0].attributes)).toEqual({value:NaN,other:undefined});
 await expect(read('both',101)).rejects.toThrow('bounded');
});

it('output byte bounds reject large native text without rewriting SQL or returning partial Facts',async()=>{
 const h=host([doc('doc',[{id:'large',type:'plain-text-block',text:'漢'.repeat(750000)}])]),x=await indexed(nativeBytes(h.capture())),before=sqlRevision(x.db);
 await expect(sqlSavedFacts(x.db,x.source)).rejects.toThrow('response budget');expect(sqlRevision(x.db)).toBe(before);
});
it('invalid same-resource external definition provenance is rejected by admission before SQL reads',async()=>{
 const h=host();h.editor.linkedAnnotations.createForSegments([{nodeKey:h.node('doc-text').key,start:0,end:1}],'codex/entity-reference','poe');
 const graph=clone(h.capture()) as any,text=Object.values(graph.contents).find((c:any)=>c.payload.id==='doc-text') as any,p=text.payload.standoffProperties[0];
 p.externalDefinition={format:'codex-external-definition-gate',version:1,target:{kind:'definition',targetId:p.annotationId,source:{scope:'document',resourceId:'resource-doc'},version:{kind:'unpinned'}}};
 expect(()=>nativeBytes(graph)).toThrow('owned definition disguised as external');
});
it('SQL traversal applies the existing 10,000-visit budget and reports incomplete coverage',async()=>{
 const wire=JSON.parse(new TextDecoder().decode(nativeBytes(host().capture()))),root=wire.document.blocks.find((b:any)=>b.id===wire.document.root.target.blockId);
 root.children=[];wire.document.blocks=[root];for(let i=0;i<10002;i++){const id='bounded-'+i;root.children.push({kind:'owned',placementId:id+'-placement',target:{kind:'local',blockId:id}});wire.document.blocks.push({id,type:'plain-text-block',properties:{text:''}});}
 const bytes=new TextEncoder().encode(JSON.stringify(wire)),x=await indexed(bytes),sql=await sqlSavedFacts(x.db,x.source),oracle=await lightweightFacts(bytes);
 expect(decodeFacts(sql.wire)).toEqual(normalized(oracle.facts));expect(sql.facts.blocks).toHaveLength(10000);expect(sql.facts.diagnostics).toContain('Block budget reached');
},30000);

it('source Blocks have literal UTF16 text and no annotation assertions in full, lightweight and SQL readers',async()=>{
 const h=host([doc('doc',['markdown','html'].map((format:any)=>({id:format,type:sourceType(format),...sourcePayload(format,'<b>Rome</b>\r\n**literal**\n😀'),standoffProperties:[{id:'inactive-'+format,type:'codex/entity-reference',value:'never-infer',start:999,end:1000}]})))]);
 const r=await parity(h.capture());expect(r.facts.mentions).toEqual([]);expect(r.facts.blocks.find(b=>b.id==='html')?.text).toEqual({coordinate:'utf16',runs:[{text:'<b>Rome</b>\r\n**literal**\n😀'}]});
});
it('native CodeMirror CP annotations preserve SQL UTF16 slices and semantic Facts parity',async()=>{
 const h=host([doc('doc',[{id:'native-code',type:'standoff-code-mirror-block',text:'A😀b\r\n漢',metadata:{language:'plain'},standoffProperties:[
  {id:'native-entity',type:'codex/entity-reference',start:1,end:2,value:'entity-ada',metadata:{entityName:'Ada'},future:{keep:true}},
  {id:'native-point',type:'note',start:3,end:3,isZeroWidth:true,affinity:'before'},
  {id:'native-deleted',type:'codex/entity-reference',start:0,end:0,value:'gone',isDeleted:true},
 ]}])]);
 const result=await parity(h.capture());expect(result.facts.mentions.find(m=>m.targetId==='entity-ada')).toMatchObject({text:'😀b',ranges:[{blockId:'native-code',start:1,end:3}]});expect(result.facts.mentions.some(m=>m.targetId==='gone')).toBe(false);
 const row=result.db.prepare("SELECT coordinate,startIndex,endIndex,text FROM StandoffProperty WHERE authoredId='native-entity'").get();expect(row).toEqual({coordinate:'utf16',startIndex:1,endIndex:4,text:'😀b'});
});
