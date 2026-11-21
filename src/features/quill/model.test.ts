// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {materializeLocalWorkspace} from '../../reactive-editor/workspace-manifest';
import {admitNative,captureNative,nativeBytes,nativeText,decodeNative} from '../../persistence/native-resource';
import {serializeSelection} from '../../interchange/serializer';
import {materializeFragment} from '../../interchange/materialize';
import {inlineText,logicalInline} from '../../block-tree/inline-sequence';
import {convertQuill,convertQuillToText,composeQuillRange,addQuillSource,invokeQuill,quillRecord,quillSources} from '../../application/quill-operations';
import {defaultComposition,validQuill,QUILL_TYPE} from './model';
import {fixture} from '../../qualification/quill/model';
const editors:ReactiveEditor[]=[];
afterEach(()=>{editors.splice(0).forEach(e=>e.dispose());vi.restoreAllMocks();});
function setup(extra=0,compact=true){
 const editor=new ReactiveEditor({type:'workspace-block',children:[{type:'workspace-object-bank-block',children:[]}]},{features:{compactCanonicalText:compact}});editors.push(editor);
 const view=editor.createView('quill-model'),bank=Object.values(view.state.nodes).find(n=>n.viewType==='workspace-object-bank-block')!;
 const temporary=new ReactiveEditor(fixture(extra));editors.push(temporary);
 admitNative(editor.repository,nativeBytes(captureNative(temporary.repository.readState(),'quill-document')),bank.contentKey);
 const source=Object.values(view.state.nodes).find(n=>n.payload.id==='quill-source')!;
 return {editor,view,source,bank};
}
const text=(e:ReactiveEditor,k:string)=>inlineText(logicalInline(e.repository.readState(),quillRecord(e,k)));
describe('Quill native M0 contract',()=>{
 it('validates bounded geometry and multiple independent source roles',()=>{
  const v=defaultComposition();expect(validQuill(v)).toBe(true);
  v.sources.push({role:'title'});v.flows.push({id:'title',sourceRole:'title',pathIds:['baseline']});expect(validQuill(v)).toBe(true);
  for(const bad of [{...v,version:2},{...v,viewport:{width:Infinity,height:100}},{...v,sources:[{role:'body'},{role:'body'}]},{...v,flows:[{id:'a',sourceRole:'missing',pathIds:['baseline']}]},{...v,paths:[{...v.paths[0],width:-1}]},{...v,script:'unsafe'}])expect(validQuill(bad)).toBe(false);
 });
 it.each([true,false])('converts atomically, preserves text/Cell/annotation identities, compact=%s',compact=>{
  const {editor:e,source}=setup(0,compact),before=quillRecord(e,source.placementKey),cells=[...before.inlineContent],props=structuredClone(before.payload.standoffProperties);
  const invocation=invokeQuill(e,source.key),revision=e.repository.state.revision;
  expect(invokeQuill(e,source.key)).toEqual(invocation);expect(e.repository.state.revision).toBe(revision);
  const wrapper=convertQuill(e,invocation);
  expect(quillSources(e,wrapper)).toEqual([source.placementKey]);expect(quillRecord(e,source.placementKey).key).toBe(before.key);
  expect(quillRecord(e,source.placementKey).inlineContent).toEqual(cells);expect(quillRecord(e,source.placementKey).payload.standoffProperties).toEqual(props);
  e.repository.undo();expect(e.repository.state.placements[wrapper]).toBeUndefined();e.repository.redo();expect(quillSources(e,wrapper)).toEqual([source.placementKey]);
  const saved=captureNative(e.repository.readState(),'quill-document');expect(nativeText(decodeNative(nativeBytes(saved)))).toBe(nativeText(saved));
 });
 it('rejects stale text, changed annotations, partial selections and disabled invocation',()=>{
  const {editor:e,source}=setup(),request=invokeQuill(e,source.key);
  e.commands.setPayloadField(source.key,'standoffProperties',[]);
  expect(()=>convertQuill(e,request)).toThrow('changed');
  vi.spyOn(e.mounts,'inlineSelection').mockReturnValue({anchor:2,head:5});expect(()=>invokeQuill(e,source.key)).toThrow('whole TextBlock');
  const disabled=new ReactiveEditor(fixture(),{features:{quill:false}});editors.push(disabled);expect(()=>invokeQuill(disabled,source.key)).toThrow('disabled');expect(()=>convertQuill(disabled,request)).toThrow('disabled');
 });
 it('does not permit silent shared ownership',()=>{
  const {editor:e,source}=setup();vi.spyOn(e.repository,'contentReferenceCount').mockReturnValue(2);
  expect(()=>invokeQuill(e,source.key)).toThrow('Shared');
 });
 it('standard clipboard admits editable owned text, geometry and linked Glosses independently',()=>{
  const {editor:e,source,bank}=setup(),wrapper=convertQuill(e,invokeQuill(e,source.key));
  const f=serializeSelection(e.repository.readState(),[{placementKey:wrapper}],{cavernId:'fixture',resourceId:'quill-document'});
  const imported=materializeFragment(f,{cavernId:'fixture',resourceId:'destination'});
  expect(imported.state.contents[imported.state.placements[imported.roots[0]].contentKey].viewType).toBe(QUILL_TYPE);
  const destination=e.commands.insert({id:'destination',type:'document-block',children:[]},{kind:'at',parentKey:bank.key,index:1});
  const copied=e.commands.insertFragment(imported,{kind:'at',parentKey:destination,index:0})[0],copySource=quillSources(e,copied)[0];
  expect(quillRecord(e,copied).payload.quill).toEqual(defaultComposition());
  expect(quillRecord(e,copySource).payload.id).not.toBe(source.payload.id);expect(text(e,copySource)).toBe(text(e,source.placementKey));
  const properties=quillRecord(e,copySource).payload.standoffProperties as any[];
  expect(properties.find(p=>p.type==='codex/entity-reference')).toMatchObject({start:4,end:8,value:'raven-entity'});
  const gloss=properties.find(p=>p.type==='mutable/gloss');expect(gloss.annotationId).not.toBe('raven-gloss-definition');
  expect((quillRecord(e,destination).payload.linkedAnnotations as any)[gloss.annotationId].value).toBe('note: A visitor at dusk');
  e.commands.replaceInlineRange(copySource,0,0,'Independent ');expect(text(e,source.placementKey)).not.toContain('Independent');
 });
 it('admits multiple owned sources without concatenating text or aliasing roles',()=>{
  const {editor:e,source,bank}=setup(),wrapper=convertQuill(e,invokeQuill(e,source.key));
  const title=e.commands.insert({id:'raven-title',type:'standoff-editor-block',text:'The Raven',standoffProperties:[{id:'title-bold',type:'style/bold',start:0,end:8}]},{kind:'at',parentKey:wrapper,index:0});
  const config=defaultComposition();config.sources.unshift({role:'title'});config.paths.push({id:'title-line',kind:'line',x:10,y:10,width:500});config.flows.push({id:'title',sourceRole:'title',pathIds:['title-line']});
  e.commands.setPayloadField(wrapper,'quill',config);
  e.commands.setPayloadField(wrapper,'blockProperties',[...quillRecord(e,wrapper).payload.blockProperties as any[],{type:'codex/block-reference',value:'raven-title',metadata:{quillRole:'title'}}]);
  expect(quillSources(e,wrapper)).toEqual([title,source.placementKey]);
  expect(invokeQuill(e,source.key).sourcePlacement).toBe(source.placementKey);
  const imported=materializeFragment(serializeSelection(e.repository.readState(),[{placementKey:wrapper}]));
  const destination=e.commands.insert({id:'multi',type:'document-block',children:[]},{kind:'at',parentKey:bank.key,index:1});
  const copied=e.commands.insertFragment(imported,{kind:'at',parentKey:destination,index:0})[0];
  const sources=quillSources(e,copied);expect(sources.map(k=>text(e,k))).toEqual(['The Raven',text(e,source.placementKey)]);
  e.commands.replaceInlineRange(sources[0],0,0,'New ');expect(text(e,title)).toBe('The Raven');expect(text(e,sources[1])).toBe(text(e,source.placementKey));
 });
 it('quarantines future schema and forged or external source carriers',()=>{
  const {editor:e,source}=setup(),wrapper=convertQuill(e,invokeQuill(e,source.key));
  const serialize=()=>serializeSelection(e.repository.readState(),[{placementKey:wrapper}],{cavernId:'fixture',resourceId:'quill-document'});
  for(const alter of [(f:any)=>{const p=f.blocks.find((b:any)=>b.type===QUILL_TYPE).blockProperties[0];p.type='untrusted';p.attributes.type='codex/block-reference';},(f:any)=>f.blocks.find((b:any)=>b.type===QUILL_TYPE).data.quill.version=2,(f:any)=>f.blocks.find((b:any)=>b.type===QUILL_TYPE).blockProperties[0].target={kind:'external',object:'block',id:'quill-source',source:{cavernId:'fixture',resourceId:'quill-document'}}]){
   const f=serialize();alter(f);const result=materializeFragment(f);
   expect(result.state.contents[result.state.placements[result.roots[0]].contentKey].viewType).toBe('mutable/opaque-block');
  }
 });
 it.each([0,500])('ordinary edits/undo/redo read no unrelated payloads with %s extra Blocks',extra=>{
  const {editor:e,source}=setup(extra);convertQuill(e,invokeQuill(e,source.key));
  const snapshot=vi.spyOn(e.repository,'snapshot'),state=e.repository.readState(),restore:Array<()=>void>=[];let reads=0;
  for(const c of Object.values(state.contents))if(String(c.payload.id).startsWith('unrelated-')){const d=Object.getOwnPropertyDescriptor(c,'payload')!;Object.defineProperty(c,'payload',{configurable:true,get(){reads++;return d.value;}});restore.push(()=>Object.defineProperty(c,'payload',d));}
  const changes:number[]=[];const stop=e.repository.subscribeChanges(c=>changes.push(c.previousContents.size));
  try{e.commands.replaceInlineRange(source.placementKey,0,0,'Listen ');e.repository.undo();e.repository.redo();expect(reads).toBe(0);expect(snapshot).not.toHaveBeenCalled();expect(changes).toEqual([1,1,1]);}finally{stop();restore.forEach(f=>f());}
 });
});

it('unwraps declared reading order atomically and Undo restores exact geometry and native identities',()=>{
 const {editor:e,source,view}=setup(),wrapper=convertQuill(e,invokeQuill(e,source.key)),title=e.commands.insert({id:'title',type:'standoff-editor-block',text:'The Raven'},{kind:'at',parentKey:wrapper,index:1});
 const config=structuredClone(quillRecord(e,wrapper).payload.quill) as ReturnType<typeof defaultComposition>;config.sources.unshift({role:'title'});config.flows.push({id:'title',sourceRole:'title',pathIds:['baseline']});
 e.commands.setPayloadField(wrapper,'quill',config);e.commands.setPayloadField(wrapper,'blockProperties',[...quillRecord(e,wrapper).payload.blockProperties as any[],{type:'codex/block-reference',value:'title',metadata:{quillRole:'title'}}]);
 const before=nativeText(captureNative(e.repository.readState(),'quill-document')),revision=e.repository.state.revision,sourceContent=quillRecord(e,source.placementKey);
 expect(convertQuillToText(e,view.nodeForPlacement(wrapper)!.key)).toEqual([title,source.placementKey]);expect(e.repository.state.revision).toBe(revision+1);expect(quillRecord(e,source.placementKey).key).toBe(sourceContent.key);expect(quillRecord(e,source.placementKey).payload.standoffProperties).toEqual(sourceContent.payload.standoffProperties);
 const location=e.repository.locationOf(source.placementKey)!;expect(e.repository.state.contents[location.ownerContentKey].children.indexOf(title)).toBe(e.repository.state.contents[location.ownerContentKey].children.indexOf(source.placementKey)-1);
 e.repository.undo();expect(nativeText(captureNative(e.repository.readState(),'quill-document'))).toBe(before);e.repository.redo();expect(e.repository.state.placements[wrapper]).toBeUndefined();
});
it('rejects inverse conversion of a shared composition without mutating its source',()=>{
 const {editor:e,source,view,bank}=setup(),wrapper=convertQuill(e,invokeQuill(e,source.key));e.commands.transclude(wrapper,{kind:'at',parentKey:bank.key,index:1});const revision=e.repository.state.revision;expect(()=>convertQuillToText(e,view.nodeForPlacement(wrapper)!.key)).toThrow('shared ownership');expect(e.repository.state.revision).toBe(revision);
});

it.each([false,true])('converts partial range with native split/rebase/Undo (independent=%s)',independent=>{
 const {editor:e,source}=setup(),original=text(e,source.placementKey),before=nativeText(captureNative(e.repository.readState(),'quill-document'));vi.spyOn(e.mounts,'inlineSelection').mockReturnValue({anchor:4,head:9});const revision=e.repository.state.revision,wrapper=composeQuillRange(e,source.key,independent),selected=quillSources(e,wrapper)[0];
 expect(e.repository.state.revision).toBe(revision+1);expect(text(e,selected)).toBe('raven');expect(text(e,source.placementKey)).toBe(independent?original:'The ');expect(quillRecord(e,selected).payload.standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({type:'codex/entity-reference',start:0,end:4}),expect.objectContaining({type:'mutable/gloss',start:0,end:4})]));
 e.repository.undo();expect(nativeText(captureNative(e.repository.readState(),'quill-document'))).toBe(before);e.repository.redo();expect(text(e,quillSources(e,wrapper)[0])).toBe('raven');
});
it('adds a separate source without altering body text or its flow',()=>{
 const {editor:e,source}=setup(),wrapper=convertQuill(e,invokeQuill(e,source.key)),body=text(e,source.placementKey),flow=JSON.stringify((quillRecord(e,wrapper).payload.quill as any).flows[0]),title=addQuillSource(e,wrapper,'title');expect(quillSources(e,wrapper)).toEqual([source.placementKey,title]);expect(text(e,source.placementKey)).toBe(body);expect(JSON.stringify((quillRecord(e,wrapper).payload.quill as any).flows[0])).toBe(flow);e.repository.undo();expect(quillSources(e,wrapper)).toEqual([source.placementKey]);
});
