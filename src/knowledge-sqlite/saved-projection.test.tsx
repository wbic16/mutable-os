// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import Database from 'better-sqlite3';
import {ReactiveEditor} from '../reactive-editor/editor';
import {materializeLocalWorkspace} from '../reactive-editor/workspace-manifest';
import {captureNative,nativeBytes,nativeEnvelope,decodeNative} from '../persistence/native-resource';
import {encodeHistoryDocument} from '../history/durable-core';
import {decodeAuthoredValue} from '../history/preplan-spike/wire';
import {timerBlockDto} from '../features/timer/model';
import {objectDto} from '../features/three-d-object/model';
import {createTextSuperposition} from '../runtime/text-superposition';
import {anchorCapabilities} from '../application/anchor-capabilities';
import {clone} from '../block-tree/clone';
import {projectSaved} from './saved-projection';
import {migrate} from './schema.mjs';
import {baseline,reconcile,readProjection,prepareReconciliation,commitReconciliation} from './reconcile.mjs';

const cleanups:(()=>void)[]=[];
afterEach(()=>cleanups.splice(0).reverse().forEach(f=>f()));
const vault='18e2b9ce-d3e7-4a14-b67d-b265437bcad8';
const bytes=(v:any)=>new TextEncoder().encode(JSON.stringify(v));
const doc=(id='doc',children:any[]=[])=>({id,type:'document-block',metadata:{documentId:`resource-${id}`,title:'A title',tags:['one','two']},children:[{id:`${id}-text`,type:'standoff-editor-block',text:'A😀é漢\nSecond line'},{id:`${id}-other`,type:'standoff-editor-block',text:'Another paragraph'},...children]});
function host(documents:any[]=[doc()]) {
  const editor=new ReactiveEditor(materializeLocalWorkspace({id:'workspace',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block',children:documents}]}),{features:{textSuperposition:true}});
  cleanups.push(()=>editor.dispose());const view=editor.createView('main');const node=(id:string)=>Object.values(view.state.nodes).find(n=>n.payload.id===id)!;
  const capture=(id='doc')=>captureNative(editor.repository.snapshot(),`resource-${id}`);
  return {editor,node,capture};
}
function database(){const db=new Database(':memory:');migrate(db,'mutable',{fresh:true,vaultGuid:vault});cleanups.push(()=>db.close());return db;}
const evidence=(p:any)=>({path:'doc.mutable.json',contentHash:p.contentHash});
const semantic=(v:any)=>({...v,resource:{...v.resource,indexedUtc:null}});

it('keeps mode in existing saved SQL attributes and Cell coordinates without a mode table', async () => {
  const h = host([doc('doc', [{ id: 'moded', type: 'standoff-editor-block', mode: 'verse-line', text: 'A😀BCD' }])]);
  const projection = await projectSaved(nativeBytes(h.capture()), vault);
  const p = projection.blocks.find(b => b.block.guid === 'moded')!.block;
  expect(p.typename).toBe('standoff-editor-block'); expect(p.coordinate).toBe('cell'); expect(p.cellCount).toBe(5);
  expect(decodeAuthoredValue(JSON.parse(p.attributes)).payload.mode).toBe('verse-line');
});

it.each(['legacy', 'native'])('indexes full entity mentions from ranges despite truncated %s excerpt caches', async format => {
  const dto = doc('doc', [
    { id: 'dino-block', type: 'standoff-editor-block', text: '-dino\r', standoffProperties: [
      { id: 'dino-mention', type: 'codex/entity-reference', value: 'entity-dino', start: 1, end: 4, text: 'din' },
    ] },
    { id: 'unicode-block', type: 'standoff-editor-block', text: '😀-dino\r', standoffProperties: [
      { id: 'unicode-mention', type: 'codex/entity-reference', value: 'entity-dino', start: 2, end: 5, text: 'din' },
      { id: 'one-cell', type: 'codex/entity-reference', value: 'entity-emoji', start: 0, end: 0, text: '' },
    ] },
  ]);
  let wire: any = dto;
  if (format === 'native') {
    wire = nativeEnvelope(host([dto]).capture());
    // Reproduce an already-saved file from before excerpt-cache correction.
    for (const block of wire.document.blocks) for (const p of block.properties.standoffProperties ?? []) p.text = p.id === 'one-cell' ? '' : 'din';
  }
  const original = bytes(wire), projection = await projectSaved(original, vault), db = database();
  reconcile(db, projection, evidence(projection), null);
  const row = (id: string) => db.prepare('SELECT text,startIndex,endIndex,coordinate,attributes FROM StandoffProperty WHERE authoredId=?').get(id);
  expect(row('dino-mention')).toMatchObject({ text: 'dino', startIndex: 1, endIndex: 5, coordinate: 'cell' });
  expect(row('unicode-mention')).toMatchObject({ text: 'dino', startIndex: 2, endIndex: 6, coordinate: 'cell' });
  expect(row('one-cell')).toMatchObject({ text: '😀', startIndex: 0, endIndex: 1, coordinate: 'cell' });
  expect(decodeAuthoredValue(JSON.parse(row('dino-mention').attributes)).text).toBe('din');
  expect(bytes(wire)).toEqual(original);
});

it('actual rich producers retain every persistent definition, raw payload, properties, margins, anchors, references and Cell runs',async()=>{
  const h=host(),{editor,node}=h;
  editor.commands.insert(timerBlockDto({x:18,y:32}),{kind:'at',parentKey:node('doc').key,index:2});
  editor.commands.insert(objectDto(),{kind:'at',parentKey:node('doc').key,index:3});
  editor.commands.insertInlineImage(node('doc-text').key,2,{assetId:'asset',src:'/image.png',alt:'image',width:40,height:30,status:'ready'});
  editor.commands.ensureMargin(node('doc-other').key,'left');
  editor.rangeAnnotations.apply([editor.textRanges.snapshot(node('doc-text').key,3,5)],'style/rainbow');
  editor.linkedAnnotations.createForSegments([{nodeKey:node('doc-text').key,start:0,end:1},{nodeKey:node('doc-other').key,start:0,end:3}],'codex/entity-reference','entity-poe',{entityName:'Poe'});
  createTextSuperposition(editor,node('doc-other'),4,6);
  anchorCapabilities(editor,{owner:'p2',active:()=>true,own:f=>f,defer:f=>f()}).commit(node('doc-other').key,node('doc-text').key,{x:120,y:-12});
  const rich={undefined:undefined,nan:NaN,negativeZero:-0,positive:Infinity,negative:-Infinity,user:{$codexHistoryValue:['undefined']}};
  editor.commands.setPayloadField(node('doc-text').key,'futureFeature',rich);
  editor.commands.transclude(node('doc-text').key,{kind:'at',parentKey:node('doc').key,index:0});
  const before=h.capture(),encoded=nativeBytes(before),decoded=decodeNative(encoded),projected=await projectSaved(encoded,vault);
  const persistent=Object.values(decoded.contents).filter(c=>!['text-cell','image-cell'].includes(c.viewType));
  expect(projected.blocks.map(b=>b.block.guid).sort()).toEqual(persistent.map(c=>c.payload.id).sort());
  for(const c of persistent){
    const b=projected.blocks.find(b=>b.block.guid===c.payload.id)!;
    expect(decodeAuthoredValue(JSON.parse(b.block.attributes)).payload).toEqual(c.payload);
    expect(b.properties).toHaveLength((c.payload.blockProperties as any[]??[]).length);
    for(const [i,raw] of (c.payload.blockProperties as any[]??[]).entries()){expect(decodeAuthoredValue(JSON.parse(b.properties[i].attributes))).toEqual(raw);expect(decodeAuthoredValue(JSON.parse(b.properties[i].valueJson))).toEqual(raw.value);}
    for(const [i,raw] of (c.payload.standoffProperties as any[]??[]).entries()){expect(b.segments[i]).toMatchObject({startIndex:raw.start,endIndex:raw.end+1,coordinate:'cell'});expect(decodeAuthoredValue(JSON.parse(b.segments[i].attributes))).toEqual(raw);}
    expect(b.relations.filter(r=>r.kind!=='presentation')).toHaveLength(c.children.length+Object.keys(c.ownedRelations).length);
  }
  const text=projected.blocks.find(b=>b.block.guid==='doc-text')!;
  expect(text.runs).toHaveLength(2);expect(text.runs[0].text).toBe('A😀');expect(JSON.parse(text.runs[0].boundaries)).toEqual([0,1,-1,2]);expect(JSON.parse(text.runs[1].boundaries)[0]).toBe(3);
  expect(decodeAuthoredValue(JSON.parse(text.block.attributes)).inlineObjects[0]).toMatchObject({index:2,payload:{assetId:'asset'}});
  const segments=projected.blocks.flatMap(b=>b.segments).filter(s=>s.targetEntityGuid==='entity-poe');
  expect(segments).toHaveLength(2);expect(new Set(segments.map(s=>s.logicalGuid)).size).toBe(1);expect(new Set(segments.map(s=>s.guid)).size).toBe(2);expect(segments.every(s=>s.resolution==='resolved')).toBe(true);
  expect(projected.blocks.find(b=>b.block.guid==='doc-other')!.relations).toEqual(expect.arrayContaining([expect.objectContaining({typename:'leftMargin',kind:'owned'}),expect.objectContaining({typename:'anchor-to',kind:'presentation',targetBlockGuid:'doc-text'})]));
  expect(projected.blocks.find(b=>b.block.guid==='doc')!.relations.some(r=>r.kind==='reference')).toBe(true);
  const db=database();reconcile(db,projected,evidence(projected),null);expect(db.prepare('SELECT count(*) n FROM Block').get().n).toBe(persistent.length);
  expect(nativeBytes(h.capture())).toEqual(encoded);
});

it('full and incremental reconciliation agree through edits, Undo branches, title/tags and shared-definition edits',async()=>{
  const h=host();h.editor.linkedAnnotations.createForSegments([{nodeKey:h.node('doc-text').key,start:0,end:1},{nodeKey:h.node('doc-other').key,start:0,end:2}],'codex/entity-reference','entity-poe');
  const full=database(),incremental=database();
  const apply=async()=>{const p=await projectSaved(nativeBytes(h.capture()),vault);const a=reconcile(full,p,evidence(p),baseline(full,p.resourceId));const b=reconcile(incremental,p,evidence(p),baseline(incremental,p.resourceId),{mode:'incremental'});expect(semantic(readProjection(incremental,p.resourceId))).toEqual(semantic(readProjection(full,p.resourceId)));return {a,b};};
  await apply();expect((await apply()).b.changedBlocks).toBe(0);
  h.editor.commands.replaceInlineRange(h.node('doc-text').key,0,0,'New ');expect((await apply()).b.changedBlocks).toBe(1);
  h.editor.repository.undo();await apply();h.editor.commands.replaceInlineRange(h.node('doc-text').key,0,0,'Branch');await apply();
  h.editor.commands.setPayloadField(h.node('doc').key,'metadata',{documentId:'resource-doc',title:'Changed title',tags:['new']});await apply();
  const property=(h.node('doc-other').payload.standoffProperties as any[])[0];h.editor.linkedAnnotations.edit(h.node('doc-other').key,0,property,{start:property.start,end:property.end,value:'entity-other'});
  const change=await apply();expect(change.b.changedBlocks).toBe(3); // definition owner + both consumers
  expect(incremental.prepare("SELECT count(*) n FROM StandoffProperty WHERE targetEntityGuid='entity-other'").get().n).toBe(2);
});

it('owned-external resources retain an owned edge without flattening the child; foreign definitions remain unresolved',async()=>{
  const h=host([doc('a',[doc('b')]),doc('c')]);
  h.editor.commands.transclude(h.node('b').key,{kind:'at',parentKey:h.node('c').key,index:1});
  h.editor.linkedAnnotations.createForSegments([{nodeKey:h.node('a-text').key,start:0,end:1},{nodeKey:h.node('c-text').key,start:0,end:1}],'codex/entity-reference','entity-poe');
  const a=await projectSaved(nativeBytes(h.capture('a')),vault),c=await projectSaved(nativeBytes(h.capture('c')),vault);
  expect(a.blocks.some(b=>b.block.guid==='b')).toBe(false);
  expect(a.blocks.flatMap(b=>b.relations)).toEqual(expect.arrayContaining([expect.objectContaining({kind:'owned',targetBlockGuid:'b',targetResourceGuid:'resource-b',targetScope:'document'})]));
  expect(c.blocks.flatMap(b=>b.relations)).toEqual(expect.arrayContaining([expect.objectContaining({kind:'reference',targetBlockGuid:'b'})]));
  const segment=a.blocks.flatMap(b=>b.segments)[0];expect(segment).toMatchObject({resolution:'unresolved',definitionResourceGuid:'workspace'});expect(JSON.parse(segment.definitionTarget)).toMatchObject({kind:'definition',source:{scope:'workspace',resourceId:'workspace'}});
});

it('actual legacy and History codecs preserve IDs and current state; Workspace manifest does not load referenced Documents',async()=>{
  const legacy=doc();legacy.type='main-list-block';const l=await projectSaved(bytes(legacy),vault);expect(l.format).toBe('legacy-block-tree');expect(l.rootBlockId).toBe('doc');expect(l.blocks[0].block.authoredType).toBe('main-list-block');
  const h=host();const history=await projectSaved(bytes(encodeHistoryDocument(h.capture(),'memoir')),vault);expect(history.blocks.map(b=>b.block.guid)).toEqual(l.blocks.map(b=>b.block.guid));
  const manifest={kind:'speedy-workspace',schemaVersion:1,workspaceId:'workspace',documents:{'resource-doc':{documentId:'resource-doc',source:{kind:'document-store',folder:'.',filename:'doc.json'}}},root:{id:'workspace-root',type:'workspace-block',children:[{id:'ref',type:'document-reference-block',metadata:{documentId:'resource-doc'}}]}};
  const w=await projectSaved(bytes(manifest),vault);expect(w.blocks).toHaveLength(2);expect(w.blocks.some(b=>b.block.guid==='doc')).toBe(false);expect(decodeAuthoredValue(JSON.parse(w.blocks.find(b=>b.block.guid==='workspace-root')!.block.attributes)).workspaceDocuments).toEqual(manifest.documents);
  await expect(projectSaved(bytes({...manifest,schemaVersion:2}),vault)).rejects.toThrow();
});

it('retained unplaced definitions and reference cycles are persisted once without becoming ownership',async()=>{
  const h=host(),graph=clone(h.capture()) as any,root=graph.placements[graph.rootPlacementKey];
  const template=graph.contents[root.target.contentKey];
  graph.contents.retained={...clone(template),key:'retained',viewType:'container-block',payload:{id:'retained',type:'container-block'},children:['cycle'],definitionOwnerKey:root.target.contentKey};
  graph.placements.cycle={key:'cycle',placementId:'retained-cycle',kind:'reference',target:{kind:'local',contentKey:'retained'}};
  const p=await projectSaved(nativeBytes(graph),vault),b=p.blocks.find(b=>b.block.guid==='retained')!;
  expect(b.block.explicitlyRetained).toBe(1);expect(b.relations[0]).toMatchObject({kind:'reference',targetBlockGuid:'retained',authoredId:'retained-cycle'});
  const db=database();reconcile(db,p,evidence(p),null);expect(db.prepare("SELECT count(*) n FROM Block WHERE guid='retained'").get().n).toBe(1);
});

it('opaque application internals retain saved structural rows without entering text FTS',async()=>{
  const dto=doc('doc',[{id:'app',type:'future-application-block',children:[{id:'private',type:'plain-text-block',text:'secret'}]},{id:'plain',type:'plain-text-block',text:'Visible 😀'},{id:'text',type:'text-block',text:'Also visible'}]);
  const p=await projectSaved(bytes(dto),vault);expect(p.blocks.find(b=>b.block.guid==='private')!.block.text).toBe('secret');expect(p.blocks.find(b=>b.block.guid==='private')!.runs).toEqual([]);expect(p.blocks.find(b=>b.block.guid==='plain')!.runs[0]).toMatchObject({text:'Visible 😀',boundaries:null});
});

it('missing legacy Block IDs get repeatable resource-local GUIDs without rewriting source bytes or existing IDs',async()=>{
  const dto:any=doc();delete dto.children[0].id;dto.children.push({type:'container-block',children:[{type:'text-block',text:'Missing nested identity'}]});
  const saved=bytes(dto),original=saved.slice(),a=await projectSaved(saved,vault),b=await projectSaved(saved,vault);
  expect(a).toEqual(b);expect(saved).toEqual(original);expect(dto.children[0].id).toBeUndefined();
  expect(a.blocks.map(b=>b.block.guid)).toContain('doc');expect(a.blocks.map(b=>b.block.guid)).toContain('doc-other');
  const generated=a.blocks.filter(b=>decodeAuthoredValue(JSON.parse(b.block.attributes)).indexIdentity);
  expect(generated).toHaveLength(3);expect(new Set(generated.map(b=>b.block.guid)).size).toBe(3);
  for(const b of generated){expect(b.block.guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);expect(decodeAuthoredValue(JSON.parse(b.block.attributes)).indexIdentity).toEqual({origin:'generated-missing-block',resourceId:a.resourceId});}
  dto.children[0].text='Changed text';const edited=await projectSaved(bytes(dto),vault);expect(edited.blocks.map(b=>b.block.guid)).toEqual(a.blocks.map(b=>b.block.guid));
  dto.metadata.documentId='other-resource';const other=await projectSaved(bytes(dto),vault);expect(other.blocks[1].block.guid).not.toBe(a.blocks[1].block.guid);
  const db=database();reconcile(db,a,evidence(a),null);reconcile(db,b,evidence(b),baseline(db,b.resourceId));expect(readProjection(db,a.resourceId).blocks).toHaveLength(a.blocks.length);
});

it('an ID-less workspace reference is indexed without loading or inventing its target Document',async()=>{
  const manifest={kind:'speedy-workspace',schemaVersion:1,workspaceId:'workspace',documents:{'resource-doc':{documentId:'resource-doc',source:{kind:'document-store',folder:'.',filename:'doc.json'}}},root:{id:'workspace-root',type:'workspace-block',children:[{type:'document-reference-block',metadata:{documentId:'resource-doc'}}]}};
  const a=await projectSaved(bytes(manifest),vault),b=await projectSaved(bytes(manifest),vault);
  expect(a).toEqual(b);expect(a.blocks).toHaveLength(2);expect(a.rootBlockId).toBe('workspace-root');
  const ref=a.blocks.find(b=>b.block.typename==='document-reference-block')!;expect(ref).toBeDefined();expect(ref.block.guid).not.toBe('resource-doc');
});

it('missing Resource identity, duplicate Block IDs, malformed ranges and unsupported formats fail validation',async()=>{
  for(const value of [{type:'document-block'},doc('doc',[{id:'doc-text',type:'text-block'}]),{...doc(),format:'future'},doc('doc',[{id:'bad',type:'standoff-editor-block',text:'x',standoffProperties:[{type:'future',start:0,end:4}]}])])await expect(projectSaved(bytes(value),vault)).rejects.toThrow();
});

it('scoped authored property IDs survive reorder while repeated ID-less properties remain distinct',async()=>{
  const d:any=doc();d.blockProperties=[{id:'one',type:'future',value:'a'},{id:'two',type:'future',value:'b'},{type:'future',value:'same'},{type:'future',value:'same'}];
  const a=await projectSaved(bytes(d),vault);[d.blockProperties[0],d.blockProperties[1]]=[d.blockProperties[1],d.blockProperties[0]];
  const b=await projectSaved(bytes(d),vault),before=a.blocks.find(b=>b.block.guid==='doc')!.properties,after=b.blocks.find(b=>b.block.guid==='doc')!.properties;
  expect(before.find(p=>p.authoredId==='one').guid).toBe(after.find(p=>p.authoredId==='one').guid);expect(new Set(before.map(p=>p.guid)).size).toBe(4);
});

it('SQL reconciliation rollback keeps rows, FTS and Resource evidence together; cross-resource ID collisions cannot adopt Blocks',async()=>{
  const db=database(),h=host();const p=await projectSaved(nativeBytes(h.capture()),vault);reconcile(db,p,evidence(p),null);const before=readProjection(db,p.resourceId);
  h.editor.commands.replaceInlineRange(h.node('doc-text').key,0,0,'changed ');const next=await projectSaved(nativeBytes(h.capture()),vault);
  expect(()=>reconcile(db,next,evidence(next),baseline(db,p.resourceId),{beforeCommit:()=>{throw Error('fault');}})).toThrow('fault');expect(readProjection(db,p.resourceId)).toEqual(before);
  expect(db.prepare("SELECT count(*) n FROM BlockSearch WHERE BlockSearch MATCH 'changed'").get().n).toBe(0);
  expect(()=>reconcile(db,{...p,resourceId:'collision'}, {...evidence(p),path:'other.json'},null)).toThrow('already claimed');
});


it('cancellation at the last transactional checkpoint rolls back Resource rows and FTS together',async()=>{
  const p=await projectSaved(bytes(doc()),vault),db=database();reconcile(db,p,evidence(p),null);
  const before=semantic(readProjection(db,p.resourceId));
  const changed=doc();changed.children[0].text='replacementword';
  const next=await projectSaved(bytes(changed),vault),plan=prepareReconciliation(db,next,evidence(next),baseline(db,next.resourceId),{mode:'incremental'});
  let canceled=false;
  expect(()=>commitReconciliation(db,plan,{beforeCommit:()=>{canceled=true;},check:()=>{if(canceled)throw Error('Canceled before SQL commit');}})).toThrow('Canceled before SQL commit');
  expect(semantic(readProjection(db,p.resourceId))).toEqual(before);
  expect(db.prepare("SELECT count(*) n FROM BlockSearch WHERE BlockSearch MATCH 'replacementword'").get().n).toBe(0);
  expect(()=>commitReconciliation(db,plan)).toThrow('Stale SQL');
  reconcile(db,next,evidence(next),baseline(db,next.resourceId),{mode:'incremental'});
  expect(db.prepare("SELECT count(*) n FROM BlockSearch WHERE BlockSearch MATCH 'replacementword'").get().n).toBe(1);
});
