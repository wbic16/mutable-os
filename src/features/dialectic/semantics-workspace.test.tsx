// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createMemo,createRoot} from 'solid-js';
import {workspaceFixture} from './dcp/workspace.fixture';
import {XmlContext} from './dcp/xml-context';
import {defaultWorkspaceTabs,workspaceTabs} from './workspace-tabs';
import {conversationPreferences} from './preferences';
import {semanticGraph} from './semantic-graph';
import {compactEntityDate,entityEnrichment} from '../../feature-api/entity-enrichment';
import {captureNative,nativeBytes,decodeNative} from '../../persistence/native-resource';
const cleanup:(()=>void)[]=[];afterEach(()=>cleanup.splice(0).reverse().forEach(f=>f()));
it('retains the old preference shape and validates managed sub-tabs',()=>{
 expect(conversationPreferences({version:1})).toEqual({version:1});const workspace=defaultWorkspaceTabs();workspace.tabs.push({id:'more',title:'People',type:'semantics'});expect(conversationPreferences({version:1,workspace}).workspace).toEqual(workspace);
 expect(workspaceTabs({version:1,tabs:[null]})).toBeUndefined();expect(workspaceTabs({version:1,tabs:workspace.tabs.slice(1)})).toBeUndefined();expect(workspaceTabs({version:1,tabs:[...workspace.tabs,workspace.tabs[0]]})).toBeUndefined();
});
it('renders isolated objects and only explicit directed edges, escaping labels and bounding the diagram',()=>{
 const graph=semanticGraph([{id:'a',label:'Leonardo'},{id:'b',label:'Ludovico'},{id:'c',label:'isolated "click"'}],[{id:'r',from:'b',to:'a',label:'patron of'},{id:'bad',from:'missing',to:'a',label:'unknown'}]);expect(graph.source).toContain('G1 --> G3 --> G0');expect(graph.identities).toEqual({G0:'a',G1:'b',G2:'c',G3:'r'});expect(graph.source).not.toContain('"click"');expect(graph.source).not.toContain('unknown');expect(graph.truncated).toBe(true);
 expect(semanticGraph(Array.from({length:90},(_,i)=>({id:String(i),label:String(i)})),[]).navigation).toHaveProperty('G59');expect(semanticGraph(Array.from({length:90},(_,i)=>({id:String(i),label:String(i)})),[]).navigation).not.toHaveProperty('G60');
});
it('keeps temporal precision, uncertainty and ranges and rejects fabricated date shapes',()=>{
 expect(compactEntityDate({type:'activity',value:'1482',end:'1499',approximation:'circa'})).toMatchObject({startYear:1482,endYear:1499,precision:'year',approximation:'circa',extentKind:'range'});
 expect(()=>compactEntityDate({type:'birth',value:'1500-02-29'})).toThrow();expect(()=>compactEntityDate({type:'activity',value:'1499',end:'1482'})).toThrow();expect(()=>entityEnrichment({thumbnail:{url:'javascript:alert(1)'}})).toThrow();expect(()=>entityEnrichment({externalIds:[{namespace:'wikidata',value:'762'}]})).toThrow();
});
it('enriches the same native Entity via a current handle, retains conflicts and survives native save/reload and Undo',async()=>{
 const f=workspaceFixture();cleanup.push(f.dispose);const human=f.addHuman('Leonardo served Ludovico.'),s=f.open(),r=await f.req(s,human,'agent-A',1),x=new XmlContext(s,r.exchange);r.dialect='xml/1';x.request(r);
 await f.admit(s,x.lower('<response><p><e ref="leo">Leonardo</e>.</p><definitions><entity id="leo" name="Leonardo da Vinci" type="Person" subtypes="Artist" wikidata="Q762"><description>Italian Renaissance artist and engineer</description><date type="birth" value="1452-04-15"/></entity></definitions></response>'),'agent-A',r);
 const id=f.refs.workspaceInventory().definitions.find(d=>d.type==='mutable/entity').id,ss=f.open(),rr=await f.req(ss,human,'agent-B',1),xx=new XmlContext(ss,rr.exchange);rr.dialect='xml/1';const projection=xx.request(rr),handle=projection.workspace.entities[0].handle;
 await f.admit(ss,xx.lower(`<response><p>Further details.</p><definitions><entity id="enriched" ref="${handle}" name="Leonardo da Vinci" type="Person" subtypes="Engineer"><description>Different assertion</description><date type="death" value="1519-05-02"/><date type="birth" value="1453"/></entity></definitions></response>`),'agent-B',rr);
 const all=f.refs.workspaceInventory().definitions.filter(d=>d.type==='mutable/entity');expect(all).toHaveLength(1);expect(all[0].id).toBe(id);const e=all[0].metadata.scopedEntity.entity;expect(e.description).toBe('Italian Renaissance artist and engineer');expect(e.attributes.enrichment.subtypes).toEqual(['Artist','Engineer']);expect(e.attributes.enrichment.dates).toHaveLength(2);expect(e.attributes.enrichment.conflicts.map((v:any)=>v.field)).toEqual(['description','dates.birth']);
 const bytes=nativeBytes(captureNative(f.editor.repository.readState(),f.owner));expect(nativeBytes(decodeNative(bytes))).toEqual(bytes);
 f.editor.repository.undo();expect(f.refs.workspaceInventory().definitions.find(d=>d.id===id).metadata.scopedEntity.entity.attributes.enrichment.subtypes).toEqual(['Artist']);f.editor.repository.redo();expect(f.refs.workspaceInventory().definitions.find(d=>d.id===id).metadata.scopedEntity.entity.attributes.enrichment.subtypes).toEqual(['Artist','Engineer']);
});
it('does not rebuild semantic inventory, scan the Document, snapshot, or fetch on ordinary typing and offset rebasing',()=>{
 const f=workspaceFixture(true,true,{nativeTextProtection:false});cleanup.push(f.dispose);for(let i=0;i<80;i++)f.addHuman('Long unrelated passage '+i);const key=f.view.node(f.root.children[0])!.children[0],node=f.view.node(key)!;
 f.editor.commands.setPayloadField(node.key,'standoffProperties',[{id:crypto.randomUUID(),type:'dialectic/claim',start:0,end:3}]);
 let builds=0;const read=createRoot(dispose=>{cleanup.push(dispose);return createMemo(()=>{builds++;return f.refs.workspaceInventory();});});read();
 const before={...f.refs.diagnostics},snapshots=vi.spyOn(f.editor.repository,'snapshot'),network=vi.spyOn(globalThis,'fetch');
 for(let i=0;i<12;i++)f.editor.commands.replaceInlineRange(node.key,0,0,'x');read();
 expect(builds).toBe(1);expect(f.refs.diagnostics.workspaceBuilds).toBe(before.workspaceBuilds);expect(f.refs.diagnostics.treeVisits).toBe(before.treeVisits);expect(f.refs.diagnostics.propertyReads-before.propertyReads).toBeLessThanOrEqual(12);expect(snapshots).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();network.mockRestore();
});

it('publishes live definitions after combined Document edits and Undo/Redo, using previous canonical records',()=>{
 const f=workspaceFixture();cleanup.push(f.dispose);f.addHuman('Source');const s=f.open();const inventory=createRoot(dispose=>{cleanup.push(dispose);return createMemo(()=>f.refs.workspaceInventory());});expect(inventory().definitions).toHaveLength(0);
 const d=s.entities.prepare({name:'Milan',typename:'Place',description:'City in Italy',aliases:[]},{actor:'human'});
 f.editor.commands.structuralTransaction('Combined Document edit',()=>{f.editor.commands.setPayloadField(f.root.key,'linkedAnnotations',{[d.id]:d});f.editor.commands.setPayloadField(f.root.key,'metadata',{dialectic:{version:1,kind:'conversation'},title:'A new title'});});
 expect(inventory().definitions.map(v=>v.id)).toEqual([d.id]);f.editor.repository.undo();expect(inventory().definitions).toHaveLength(0);f.editor.repository.redo();expect(inventory().definitions.map(v=>v.id)).toEqual([d.id]);
});

it('keeps semantic inventory idle for unrelated paragraph insertion and removal, but updates inline media',()=>{
 const f=workspaceFixture();cleanup.push(f.dispose);f.addHuman('Source');const inventory=createRoot(dispose=>{cleanup.push(dispose);return createMemo(()=>f.refs.workspaceInventory());});inventory();const before=f.refs.diagnostics.workspaceBuilds;
 const plainId=crypto.randomUUID();f.editor.commands.insert({id:plainId,type:'standoff-editor-block',text:'Unannotated paragraph'},{kind:'at',parentKey:f.root.key,index:f.root.children.length});expect(f.refs.diagnostics.workspaceBuilds).toBe(before);
 f.editor.repository.undo();expect(f.refs.diagnostics.workspaceBuilds).toBe(before);f.editor.repository.redo();expect(f.refs.diagnostics.workspaceBuilds).toBe(before);
 const id=crypto.randomUUID();f.editor.commands.insert({id,type:'image-block',metadata:{alt:'Image fixture',url:'https://example.com/image.png'}},{kind:'at',parentKey:f.root.key,index:f.root.children.length});expect(inventory().media.map(m=>m.blockId)).toEqual([id]);f.editor.repository.undo();expect(inventory().media).toHaveLength(0);
});
